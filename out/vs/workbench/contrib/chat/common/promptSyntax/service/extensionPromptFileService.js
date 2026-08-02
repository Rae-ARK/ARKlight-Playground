var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../../../base/common/errors.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../../base/common/map.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IExtensionService } from "../../../../../services/extensions/common/extensions.js";
import { IFilesConfigurationService } from "../../../../../services/filesConfiguration/common/filesConfigurationService.js";
import { getSkillFolderName } from "../config/promptFileLocations.js";
import { PromptFileParser } from "../promptFileParser.js";
import { PromptFileSource, PromptsType } from "../promptTypes.js";
import {
  CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT,
  INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT,
  PROMPT_FILE_PROVIDER_ACTIVATION_EVENT,
  PromptsStorage,
  SKILL_PROVIDER_ACTIVATION_EVENT
} from "./promptsService.js";
const ALL_PROMPT_TYPES = [
  PromptsType.prompt,
  PromptsType.instructions,
  PromptsType.agent,
  PromptsType.skill,
  PromptsType.hook
];
let ExtensionPromptFileService = class extends Disposable {
  constructor(logger, fileService, modelService, extensionService, filesConfigService, contextKeyService) {
    super();
    this.logger = logger;
    this.fileService = fileService;
    this.modelService = modelService;
    this.extensionService = extensionService;
    this.filesConfigService = filesConfigService;
    this.contextKeyService = contextKeyService;
    /**
     * Files contributed via extension contribution points, keyed by type then URI.
     */
    this.contributedFiles = {
      [PromptsType.prompt]: new ResourceMap(),
      [PromptsType.instructions]: new ResourceMap(),
      [PromptsType.agent]: new ResourceMap(),
      [PromptsType.skill]: new ResourceMap(),
      [PromptsType.hook]: new ResourceMap()
    };
    /**
     * Providers registered via the proposed extension API.
     */
    this._promptFileProviders = [];
    /**
     * Context keys referenced by tracked `when` clauses (from contributed
     * files and provider results). Used to know when to re-evaluate.
     */
    this._contributedWhenKeys = /* @__PURE__ */ new Set();
    this._contributedWhenClauses = /* @__PURE__ */ new Map();
    this._providerWhenClauses = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    /**
     * Pending URIs to mark as readonly, flushed on the next microtask.
     * Batches multiple `registerContributedFile` calls (which happen
     * synchronously in the extension point handler) into a single
     * `updateReadonly` call to avoid firing `onDidChangeReadonly` per file.
     */
    this._pendingReadonlyUris = [];
    this._pendingReadonlyFlush = false;
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this._contributedWhenKeys)) {
        for (const type of ALL_PROMPT_TYPES) {
          this._onDidChange.fire({ type });
        }
      }
    }));
  }
  /**
   * Returns the merged list of extension-contributed prompt files for the
   * given type, filtered by their `when` clause.
   */
  async getExtensionPromptFiles(type, token) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const settledResults = await Promise.allSettled(this.contributedFiles[type].values());
    const contributedFiles = settledResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
    const activationEvent = this._getProviderActivationEvent(type);
    const providerFiles = activationEvent ? await this._listFromProviders(type, activationEvent, token) : [];
    return [...contributedFiles, ...providerFiles].filter((file) => {
      if (!file.when) {
        return true;
      }
      const when = ContextKeyExpr.deserialize(file.when);
      if (!when) {
        this.logger.warn(`[getExtensionPromptFiles] Ignoring contributed prompt file with invalid when clause: ${file.when}`);
        return false;
      }
      return this.contextKeyService.contextMatchesRules(when);
    });
  }
  /**
   * Registers a file contributed via a static contribution point. Returns
   * a disposable that removes the contribution.
   */
  registerContributedFile(type, uri, extension, name, description, when, sessionTypes) {
    const bucket = this.contributedFiles[type];
    if (bucket.has(uri)) {
      return Disposable.None;
    }
    const entryPromise = (async () => {
      if (type === PromptsType.skill) {
        try {
          const validated = await this._validateAndSanitizeSkillFile(uri, CancellationToken.None);
          name = validated.name;
          description = validated.description;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.error(`[registerContributedFile] Extension '${extension.identifier.value}' failed to validate skill file: ${uri}`, msg);
          throw e;
        }
      }
      return { uri, name, description, when, sessionTypes, storage: PromptsStorage.extension, type, extension, source: PromptFileSource.ExtensionContribution };
    })();
    bucket.set(uri, entryPromise);
    this._enqueueReadonlyUpdate(uri);
    if (when) {
      this._contributedWhenClauses.set(`${type}/${uri.toString()}`, when);
      this._updateContributedWhenKeys();
    }
    this._onDidChange.fire({ type });
    return {
      dispose: () => {
        bucket.delete(uri);
        if (when) {
          this._contributedWhenClauses.delete(`${type}/${uri.toString()}`);
          this._updateContributedWhenKeys();
        }
        this._onDidChange.fire({ type });
      }
    };
  }
  /**
   * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
   * This is called by the extension host bridge when an extension registers a provider via
   * vscode.chat.registerCustomAgentProvider(), registerInstructionsProvider(), or
   * registerPromptFileProvider().
   */
  registerPromptFileProvider(extension, type, provider) {
    const providerEntry = { extension, type, ...provider };
    this._promptFileProviders.push(providerEntry);
    const disposables = new DisposableStore();
    if (provider.onDidChangePromptFiles) {
      disposables.add(provider.onDidChangePromptFiles(() => {
        this._onDidChange.fire({ type });
      }));
    }
    this._onDidChange.fire({ type });
    disposables.add({
      dispose: () => {
        const index = this._promptFileProviders.findIndex((p) => p === providerEntry);
        if (index >= 0) {
          this._promptFileProviders.splice(index, 1);
          this._providerWhenClauses.delete(providerEntry);
          this._updateContributedWhenKeys();
          this._onDidChange.fire({ type });
        }
      }
    });
    return disposables;
  }
  async _listFromProviders(type, activationEvent, token) {
    const result = [];
    const readonlyUris = [];
    await this.extensionService.activateByEvent(activationEvent);
    const providers = this._promptFileProviders.filter((p) => p.type === type);
    if (providers.length === 0) {
      return result;
    }
    for (const providerEntry of providers) {
      try {
        const files = await providerEntry.providePromptFiles({}, token);
        this._providerWhenClauses.set(providerEntry, files?.flatMap((file) => file.when ? [file.when] : []) ?? []);
        this._updateContributedWhenKeys();
        if (!files || token.isCancellationRequested) {
          continue;
        }
        for (const file of files) {
          readonlyUris.push(file.uri);
          result.push({
            uri: file.uri,
            storage: PromptsStorage.extension,
            type,
            extension: providerEntry.extension,
            source: PromptFileSource.ExtensionAPI,
            name: file.name,
            description: file.description,
            when: file.when,
            sessionTypes: file.sessionTypes
          });
        }
      } catch (e) {
        this.logger.error(`[listFromProviders] Failed to get ${type} files from provider`, e instanceof Error ? e.message : String(e));
      }
    }
    void this.filesConfigService.updateReadonly(readonlyUris, true);
    return result;
  }
  _getProviderActivationEvent(type) {
    switch (type) {
      case PromptsType.agent:
        return CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.instructions:
        return INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.prompt:
        return PROMPT_FILE_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.skill:
        return SKILL_PROVIDER_ACTIVATION_EVENT;
      case PromptsType.hook:
        return void 0;
    }
  }
  _enqueueReadonlyUpdate(uri) {
    this._pendingReadonlyUris.push(uri);
    if (!this._pendingReadonlyFlush) {
      this._pendingReadonlyFlush = true;
      queueMicrotask(() => {
        const uris = this._pendingReadonlyUris;
        this._pendingReadonlyUris = [];
        this._pendingReadonlyFlush = false;
        void this.filesConfigService.updateReadonly(uris, true);
      });
    }
  }
  _updateContributedWhenKeys() {
    this._contributedWhenKeys.clear();
    for (const whenClause of this._contributedWhenClauses.values()) {
      const expr = ContextKeyExpr.deserialize(whenClause);
      for (const key of expr?.keys() ?? []) {
        this._contributedWhenKeys.add(key);
      }
    }
    for (const whenClauses of this._providerWhenClauses.values()) {
      for (const whenClause of whenClauses) {
        const expr = ContextKeyExpr.deserialize(whenClause);
        for (const key of expr?.keys() ?? []) {
          this._contributedWhenKeys.add(key);
        }
      }
    }
  }
  // Skill validation
  async _validateAndSanitizeSkillFile(uri, token) {
    const parsedFile = await this._parsePromptFile(uri, token);
    const folderName = getSkillFolderName(uri);
    let name = parsedFile.header?.name;
    if (!name) {
      this.logger.debug(`[validateAndSanitizeSkillFile] Agent skill file missing name attribute, using folder name "${folderName}": ${uri}`);
      name = folderName;
    }
    const description = parsedFile.header?.description;
    let sanitizedName = this._truncateAgentSkillName(name, uri);
    if (sanitizedName !== folderName) {
      this.logger.debug(`[validateAndSanitizeSkillFile] Agent skill name "${sanitizedName}" does not match folder name "${folderName}", using folder name: ${uri}`);
      sanitizedName = folderName;
    }
    const sanitizedDescription = description ? this._truncateAgentSkillDescription(description, uri) : void 0;
    return { name: sanitizedName, description: sanitizedDescription };
  }
  async _parsePromptFile(uri, token) {
    const model = this.modelService.getModel(uri);
    if (model) {
      return new PromptFileParser().parse(uri, model.getValue());
    }
    const fileContent = await this.fileService.readFile(uri);
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    return new PromptFileParser().parse(uri, fileContent.value.toString());
  }
  _sanitizeAgentSkillText(text) {
    return text.replace(/<[^>]+>/g, "");
  }
  _truncateAgentSkillName(name, uri) {
    const MAX_NAME_LENGTH = 64;
    const sanitized = this._sanitizeAgentSkillText(name);
    if (sanitized !== name) {
      this.logger.debug(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_NAME_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_NAME_LENGTH);
    }
    return sanitized;
  }
  _truncateAgentSkillDescription(description, uri) {
    const MAX_DESCRIPTION_LENGTH = 1024;
    const sanitized = this._sanitizeAgentSkillText(description);
    if (sanitized !== description) {
      this.logger.debug(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
    }
    if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
      this.logger.debug(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
      return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
    }
    return sanitized;
  }
};
ExtensionPromptFileService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IModelService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IFilesConfigurationService),
  __decorateParam(5, IContextKeyService)
], ExtensionPromptFileService);
export {
  ExtensionPromptFileService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL2V4dGVuc2lvblByb21wdEZpbGVTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2ZpbGVzQ29uZmlndXJhdGlvbi9jb21tb24vZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRTa2lsbEZvbGRlck5hbWUgfSBmcm9tICcuLi9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQYXJzZWRQcm9tcHRGaWxlLCBQcm9tcHRGaWxlUGFyc2VyIH0gZnJvbSAnLi4vcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBQcm9tcHRGaWxlU291cmNlLCBQcm9tcHRzVHlwZSB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7XG5cdENVU1RPTV9BR0VOVF9QUk9WSURFUl9BQ1RJVkFUSU9OX0VWRU5ULFxuXHRJRXh0ZW5zaW9uUHJvbXB0UGF0aCxcblx0SU5TVFJVQ1RJT05TX1BST1ZJREVSX0FDVElWQVRJT05fRVZFTlQsXG5cdElQcm9tcHRGaWxlQ29udGV4dCxcblx0SVByb21wdEZpbGVSZXNvdXJjZSxcblx0UFJPTVBUX0ZJTEVfUFJPVklERVJfQUNUSVZBVElPTl9FVkVOVCxcblx0UHJvbXB0c1N0b3JhZ2UsXG5cdFNLSUxMX1BST1ZJREVSX0FDVElWQVRJT05fRVZFTlQsXG59IGZyb20gJy4vcHJvbXB0c1NlcnZpY2UuanMnO1xuXG4vKipcbiAqIEV2ZW50IHBheWxvYWQgZW1pdHRlZCBieSB7QGxpbmsgRXh0ZW5zaW9uUHJvbXB0RmlsZVNlcnZpY2Uub25EaWRDaGFuZ2V9LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25Qcm9tcHRGaWxlc0NoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgdHlwZTogUHJvbXB0c1R5cGU7XG59XG5cbnR5cGUgUHJvbXB0RmlsZVByb3ZpZGVyRW50cnkgPSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xuXHRyZWFkb25seSB0eXBlOiBQcm9tcHRzVHlwZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9tcHRGaWxlcz86IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBwcm92aWRlUHJvbXB0RmlsZXM6IChjb250ZXh0OiBJUHJvbXB0RmlsZUNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTxJUHJvbXB0RmlsZVJlc291cmNlW10gfCB1bmRlZmluZWQ+O1xufTtcblxuY29uc3QgQUxMX1BST01QVF9UWVBFUzogcmVhZG9ubHkgUHJvbXB0c1R5cGVbXSA9IFtcblx0UHJvbXB0c1R5cGUucHJvbXB0LFxuXHRQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFByb21wdHNUeXBlLmFnZW50LFxuXHRQcm9tcHRzVHlwZS5za2lsbCxcblx0UHJvbXB0c1R5cGUuaG9vayxcbl07XG5cbi8qKlxuICogT3ducyB0aGUgcmVnaXN0cnkgb2YgcHJvbXB0IGZpbGVzIGNvbnRyaWJ1dGVkIGJ5IGV4dGVuc2lvbnMsIGJvdGggdmlhXG4gKiBzdGF0aWMgY29udHJpYnV0aW9uIHBvaW50cyAoc2VlIHtAbGluayByZWdpc3RlckNvbnRyaWJ1dGVkRmlsZX0pIGFuZCB2aWFcbiAqIGR5bmFtaWMgcHJvdmlkZXJzIHJlZ2lzdGVyZWQgdGhyb3VnaCB0aGUgcHJvcG9zZWQgZXh0ZW5zaW9uIEFQSSAoc2VlXG4gKiB7QGxpbmsgcmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXJ9KS5cbiAqXG4gKiBFeHBvc2VzIGEgcGVyLXR5cGUgZ2V0dGVyICh7QGxpbmsgZ2V0RXh0ZW5zaW9uUHJvbXB0RmlsZXN9KSB0aGF0IG1lcmdlc1xuICogYm90aCBzb3VyY2VzIGFuZCBhcHBsaWVzIGFueSBgd2hlbmAgY2xhdXNlcywgcGx1cyBhIHNpbmdsZSBjaGFuZ2UgZXZlbnRcbiAqICh7QGxpbmsgb25EaWRDaGFuZ2V9KSBjYXJyeWluZyB0aGUgYWZmZWN0ZWQge0BsaW5rIFByb21wdHNUeXBlfS5cbiAqL1xuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblByb21wdEZpbGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIEZpbGVzIGNvbnRyaWJ1dGVkIHZpYSBleHRlbnNpb24gY29udHJpYnV0aW9uIHBvaW50cywga2V5ZWQgYnkgdHlwZSB0aGVuIFVSSS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udHJpYnV0ZWRGaWxlcyA9IHtcblx0XHRbUHJvbXB0c1R5cGUucHJvbXB0XTogbmV3IFJlc291cmNlTWFwPFByb21pc2U8SUV4dGVuc2lvblByb21wdFBhdGg+PigpLFxuXHRcdFtQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdOiBuZXcgUmVzb3VyY2VNYXA8UHJvbWlzZTxJRXh0ZW5zaW9uUHJvbXB0UGF0aD4+KCksXG5cdFx0W1Byb21wdHNUeXBlLmFnZW50XTogbmV3IFJlc291cmNlTWFwPFByb21pc2U8SUV4dGVuc2lvblByb21wdFBhdGg+PigpLFxuXHRcdFtQcm9tcHRzVHlwZS5za2lsbF06IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPElFeHRlbnNpb25Qcm9tcHRQYXRoPj4oKSxcblx0XHRbUHJvbXB0c1R5cGUuaG9va106IG5ldyBSZXNvdXJjZU1hcDxQcm9taXNlPElFeHRlbnNpb25Qcm9tcHRQYXRoPj4oKSxcblx0fTtcblxuXHQvKipcblx0ICogUHJvdmlkZXJzIHJlZ2lzdGVyZWQgdmlhIHRoZSBwcm9wb3NlZCBleHRlbnNpb24gQVBJLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvbXB0RmlsZVByb3ZpZGVyczogUHJvbXB0RmlsZVByb3ZpZGVyRW50cnlbXSA9IFtdO1xuXG5cdC8qKlxuXHQgKiBDb250ZXh0IGtleXMgcmVmZXJlbmNlZCBieSB0cmFja2VkIGB3aGVuYCBjbGF1c2VzIChmcm9tIGNvbnRyaWJ1dGVkXG5cdCAqIGZpbGVzIGFuZCBwcm92aWRlciByZXN1bHRzKS4gVXNlZCB0byBrbm93IHdoZW4gdG8gcmUtZXZhbHVhdGUuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRlZFdoZW5LZXlzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyaWJ1dGVkV2hlbkNsYXVzZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcldoZW5DbGF1c2VzID0gbmV3IE1hcDxQcm9tcHRGaWxlUHJvdmlkZXJFbnRyeSwgcmVhZG9ubHkgc3RyaW5nW10+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRXh0ZW5zaW9uUHJvbXB0RmlsZXNDaGFuZ2VFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8SUV4dGVuc2lvblByb21wdEZpbGVzQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFBlbmRpbmcgVVJJcyB0byBtYXJrIGFzIHJlYWRvbmx5LCBmbHVzaGVkIG9uIHRoZSBuZXh0IG1pY3JvdGFzay5cblx0ICogQmF0Y2hlcyBtdWx0aXBsZSBgcmVnaXN0ZXJDb250cmlidXRlZEZpbGVgIGNhbGxzICh3aGljaCBoYXBwZW5cblx0ICogc3luY2hyb25vdXNseSBpbiB0aGUgZXh0ZW5zaW9uIHBvaW50IGhhbmRsZXIpIGludG8gYSBzaW5nbGVcblx0ICogYHVwZGF0ZVJlYWRvbmx5YCBjYWxsIHRvIGF2b2lkIGZpcmluZyBgb25EaWRDaGFuZ2VSZWFkb25seWAgcGVyIGZpbGUuXG5cdCAqL1xuXHRwcml2YXRlIF9wZW5kaW5nUmVhZG9ubHlVcmlzOiBVUklbXSA9IFtdO1xuXHRwcml2YXRlIF9wZW5kaW5nUmVhZG9ubHlGbHVzaCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ2dlcjogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWdTZXJ2aWNlOiBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUodGhpcy5fY29udHJpYnV0ZWRXaGVuS2V5cykpIHtcblx0XHRcdFx0Ly8gQSB0cmFja2VkIGNvbnRleHQga2V5IGNoYW5nZWQ7IHRoZSB2aXNpYmlsaXR5IG9mIGFueVxuXHRcdFx0XHQvLyBleHRlbnNpb24tY29udHJpYnV0ZWQgZmlsZSBtYXkgaGF2ZSBjaGFuZ2VkLCBzbyBub3RpZnlcblx0XHRcdFx0Ly8gZm9yIGV2ZXJ5IHR5cGUuXG5cdFx0XHRcdGZvciAoY29uc3QgdHlwZSBvZiBBTExfUFJPTVBUX1RZUEVTKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHR5cGUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbWVyZ2VkIGxpc3Qgb2YgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIHByb21wdCBmaWxlcyBmb3IgdGhlXG5cdCAqIGdpdmVuIHR5cGUsIGZpbHRlcmVkIGJ5IHRoZWlyIGB3aGVuYCBjbGF1c2UuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgZ2V0RXh0ZW5zaW9uUHJvbXB0RmlsZXModHlwZTogUHJvbXB0c1R5cGUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8cmVhZG9ubHkgSUV4dGVuc2lvblByb21wdFBhdGhbXT4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRjb25zdCBzZXR0bGVkUmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh0aGlzLmNvbnRyaWJ1dGVkRmlsZXNbdHlwZV0udmFsdWVzKCkpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkRmlsZXMgPSBzZXR0bGVkUmVzdWx0c1xuXHRcdFx0LmZpbHRlcigocmVzdWx0KTogcmVzdWx0IGlzIFByb21pc2VGdWxmaWxsZWRSZXN1bHQ8SUV4dGVuc2lvblByb21wdFBhdGg+ID0+IHJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKVxuXHRcdFx0Lm1hcChyZXN1bHQgPT4gcmVzdWx0LnZhbHVlKTtcblxuXHRcdGNvbnN0IGFjdGl2YXRpb25FdmVudCA9IHRoaXMuX2dldFByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50KHR5cGUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyRmlsZXMgPSBhY3RpdmF0aW9uRXZlbnQgPyBhd2FpdCB0aGlzLl9saXN0RnJvbVByb3ZpZGVycyh0eXBlLCBhY3RpdmF0aW9uRXZlbnQsIHRva2VuKSA6IFtdO1xuXG5cdFx0cmV0dXJuIFsuLi5jb250cmlidXRlZEZpbGVzLCAuLi5wcm92aWRlckZpbGVzXS5maWx0ZXIoZmlsZSA9PiB7XG5cdFx0XHRpZiAoIWZpbGUud2hlbikge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShmaWxlLndoZW4pO1xuXHRcdFx0aWYgKCF3aGVuKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLndhcm4oYFtnZXRFeHRlbnNpb25Qcm9tcHRGaWxlc10gSWdub3JpbmcgY29udHJpYnV0ZWQgcHJvbXB0IGZpbGUgd2l0aCBpbnZhbGlkIHdoZW4gY2xhdXNlOiAke2ZpbGUud2hlbn1gKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh3aGVuKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBmaWxlIGNvbnRyaWJ1dGVkIHZpYSBhIHN0YXRpYyBjb250cmlidXRpb24gcG9pbnQuIFJldHVybnNcblx0ICogYSBkaXNwb3NhYmxlIHRoYXQgcmVtb3ZlcyB0aGUgY29udHJpYnV0aW9uLlxuXHQgKi9cblx0cHVibGljIHJlZ2lzdGVyQ29udHJpYnV0ZWRGaWxlKHR5cGU6IFByb21wdHNUeXBlLCB1cmk6IFVSSSwgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIG5hbWU/OiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nLCB3aGVuPzogc3RyaW5nLCBzZXNzaW9uVHlwZXM/OiByZWFkb25seSBzdHJpbmdbXSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBidWNrZXQgPSB0aGlzLmNvbnRyaWJ1dGVkRmlsZXNbdHlwZV07XG5cdFx0aWYgKGJ1Y2tldC5oYXModXJpKSkge1xuXHRcdFx0Ly8ga2VlcCBmaXJzdCByZWdpc3RyYXRpb24gcGVyIGV4dGVuc2lvbiAoaGFuZGxlciBmaWx0ZXJzIGR1cGxpY2F0ZXMgcGVyIGV4dGVuc2lvbiBhbHJlYWR5KVxuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnlQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEZvciBza2lsbHMsIHZhbGlkYXRlIHRoYXQgdGhlIGZpbGUgZm9sbG93cyB0aGUgcmVxdWlyZWQgc3RydWN0dXJlXG5cdFx0XHRpZiAodHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCB2YWxpZGF0ZWQgPSBhd2FpdCB0aGlzLl92YWxpZGF0ZUFuZFNhbml0aXplU2tpbGxGaWxlKHVyaSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0bmFtZSA9IHZhbGlkYXRlZC5uYW1lO1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uID0gdmFsaWRhdGVkLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0Y29uc3QgbXNnID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogU3RyaW5nKGUpO1xuXHRcdFx0XHRcdHRoaXMubG9nZ2VyLmVycm9yKGBbcmVnaXN0ZXJDb250cmlidXRlZEZpbGVdIEV4dGVuc2lvbiAnJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0nIGZhaWxlZCB0byB2YWxpZGF0ZSBza2lsbCBmaWxlOiAke3VyaX1gLCBtc2cpO1xuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgdXJpLCBuYW1lLCBkZXNjcmlwdGlvbiwgd2hlbiwgc2Vzc2lvblR5cGVzLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGUsIGV4dGVuc2lvbiwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkV4dGVuc2lvbkNvbnRyaWJ1dGlvbiB9IHNhdGlzZmllcyBJRXh0ZW5zaW9uUHJvbXB0UGF0aDtcblx0XHR9KSgpO1xuXHRcdGJ1Y2tldC5zZXQodXJpLCBlbnRyeVByb21pc2UpO1xuXG5cdFx0dGhpcy5fZW5xdWV1ZVJlYWRvbmx5VXBkYXRlKHVyaSk7XG5cblx0XHRpZiAod2hlbikge1xuXHRcdFx0dGhpcy5fY29udHJpYnV0ZWRXaGVuQ2xhdXNlcy5zZXQoYCR7dHlwZX0vJHt1cmkudG9TdHJpbmcoKX1gLCB3aGVuKTtcblx0XHRcdHRoaXMuX3VwZGF0ZUNvbnRyaWJ1dGVkV2hlbktleXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgdHlwZSB9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGJ1Y2tldC5kZWxldGUodXJpKTtcblx0XHRcdFx0aWYgKHdoZW4pIHtcblx0XHRcdFx0XHR0aGlzLl9jb250cmlidXRlZFdoZW5DbGF1c2VzLmRlbGV0ZShgJHt0eXBlfS8ke3VyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbnRyaWJ1dGVkV2hlbktleXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHsgdHlwZSB9KTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIHByb21wdCBmaWxlIHByb3ZpZGVyIChDdXN0b21BZ2VudFByb3ZpZGVyLCBJbnN0cnVjdGlvbnNQcm92aWRlciwgb3IgUHJvbXB0RmlsZVByb3ZpZGVyKS5cblx0ICogVGhpcyBpcyBjYWxsZWQgYnkgdGhlIGV4dGVuc2lvbiBob3N0IGJyaWRnZSB3aGVuIGFuIGV4dGVuc2lvbiByZWdpc3RlcnMgYSBwcm92aWRlciB2aWFcblx0ICogdnNjb2RlLmNoYXQucmVnaXN0ZXJDdXN0b21BZ2VudFByb3ZpZGVyKCksIHJlZ2lzdGVySW5zdHJ1Y3Rpb25zUHJvdmlkZXIoKSwgb3Jcblx0ICogcmVnaXN0ZXJQcm9tcHRGaWxlUHJvdmlkZXIoKS5cblx0ICovXG5cdHB1YmxpYyByZWdpc3RlclByb21wdEZpbGVQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdHlwZTogUHJvbXB0c1R5cGUsIHByb3ZpZGVyOiB7XG5cdFx0b25EaWRDaGFuZ2VQcm9tcHRGaWxlcz86IEV2ZW50PHZvaWQ+O1xuXHRcdHByb3ZpZGVQcm9tcHRGaWxlczogKGNvbnRleHQ6IElQcm9tcHRGaWxlQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPElQcm9tcHRGaWxlUmVzb3VyY2VbXSB8IHVuZGVmaW5lZD47XG5cdH0pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJFbnRyeTogUHJvbXB0RmlsZVByb3ZpZGVyRW50cnkgPSB7IGV4dGVuc2lvbiwgdHlwZSwgLi4ucHJvdmlkZXIgfTtcblx0XHR0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJzLnB1c2gocHJvdmlkZXJFbnRyeSk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZVByb21wdEZpbGVzKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VQcm9tcHRGaWxlcygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyB0eXBlIH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyB0eXBlIH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9wcm9tcHRGaWxlUHJvdmlkZXJzLmZpbmRJbmRleChwID0+IHAgPT09IHByb3ZpZGVyRW50cnkpO1xuXHRcdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb21wdEZpbGVQcm92aWRlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0XHR0aGlzLl9wcm92aWRlcldoZW5DbGF1c2VzLmRlbGV0ZShwcm92aWRlckVudHJ5KTtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVDb250cmlidXRlZFdoZW5LZXlzKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IHR5cGUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2xpc3RGcm9tUHJvdmlkZXJzKHR5cGU6IFByb21wdHNUeXBlLCBhY3RpdmF0aW9uRXZlbnQ6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJRXh0ZW5zaW9uUHJvbXB0UGF0aFtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJRXh0ZW5zaW9uUHJvbXB0UGF0aFtdID0gW107XG5cdFx0Y29uc3QgcmVhZG9ubHlVcmlzOiBVUklbXSA9IFtdO1xuXG5cdFx0Ly8gQWN0aXZhdGUgZXh0ZW5zaW9ucyB0aGF0IG1pZ2h0IHByb3ZpZGUgZmlsZXMgZm9yIHRoaXMgdHlwZVxuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50KTtcblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuX3Byb21wdEZpbGVQcm92aWRlcnMuZmlsdGVyKHAgPT4gcC50eXBlID09PSB0eXBlKTtcblx0XHRpZiAocHJvdmlkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyRW50cnkgb2YgcHJvdmlkZXJzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBmaWxlcyA9IGF3YWl0IHByb3ZpZGVyRW50cnkucHJvdmlkZVByb21wdEZpbGVzKHt9LCB0b2tlbik7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyV2hlbkNsYXVzZXMuc2V0KHByb3ZpZGVyRW50cnksIGZpbGVzPy5mbGF0TWFwKGZpbGUgPT4gZmlsZS53aGVuID8gW2ZpbGUud2hlbl0gOiBbXSkgPz8gW10pO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVDb250cmlidXRlZFdoZW5LZXlzKCk7XG5cdFx0XHRcdGlmICghZmlsZXMgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuXHRcdFx0XHRcdHJlYWRvbmx5VXJpcy5wdXNoKGZpbGUudXJpKTtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHR1cmk6IGZpbGUudXJpLFxuXHRcdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdFx0dHlwZSxcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogcHJvdmlkZXJFbnRyeS5leHRlbnNpb24sXG5cdFx0XHRcdFx0XHRzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQVBJLFxuXHRcdFx0XHRcdFx0bmFtZTogZmlsZS5uYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGZpbGUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHR3aGVuOiBmaWxlLndoZW4sXG5cdFx0XHRcdFx0XHRzZXNzaW9uVHlwZXM6IGZpbGUuc2Vzc2lvblR5cGVzLFxuXHRcdFx0XHRcdH0gc2F0aXNmaWVzIElFeHRlbnNpb25Qcm9tcHRQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLmxvZ2dlci5lcnJvcihgW2xpc3RGcm9tUHJvdmlkZXJzXSBGYWlsZWQgdG8gZ2V0ICR7dHlwZX0gZmlsZXMgZnJvbSBwcm92aWRlcmAsIGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWFyayBhbGwgY29sbGVjdGVkIGZpbGVzIGFzIHJlYWRvbmx5IGluIGEgc2luZ2xlIGJhdGNoIHRvIGF2b2lkXG5cdFx0Ly8gZmlyaW5nIG9uRGlkQ2hhbmdlUmVhZG9ubHkgb25jZSBwZXIgZmlsZSAod2hpY2ggY2F1c2VzIGEgY2FzY2FkZVxuXHRcdC8vIG9mIGV2ZW50IGhhbmRsZXJzIGFuZCBjYW4gZnJlZXplIHRoZSByZW5kZXJlcikuXG5cdFx0dm9pZCB0aGlzLmZpbGVzQ29uZmlnU2VydmljZS51cGRhdGVSZWFkb25seShyZWFkb25seVVyaXMsIHRydWUpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2dldFByb3ZpZGVyQWN0aXZhdGlvbkV2ZW50KHR5cGU6IFByb21wdHNUeXBlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuYWdlbnQ6XG5cdFx0XHRcdHJldHVybiBDVVNUT01fQUdFTlRfUFJPVklERVJfQUNUSVZBVElPTl9FVkVOVDtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zOlxuXHRcdFx0XHRyZXR1cm4gSU5TVFJVQ1RJT05TX1BST1ZJREVSX0FDVElWQVRJT05fRVZFTlQ7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnByb21wdDpcblx0XHRcdFx0cmV0dXJuIFBST01QVF9GSUxFX1BST1ZJREVSX0FDVElWQVRJT05fRVZFTlQ7XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHRyZXR1cm4gU0tJTExfUFJPVklERVJfQUNUSVZBVElPTl9FVkVOVDtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazpcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gaG9va3MgZG9uJ3QgaGF2ZSBleHRlbnNpb24gcHJvdmlkZXJzXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5xdWV1ZVJlYWRvbmx5VXBkYXRlKHVyaTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1JlYWRvbmx5VXJpcy5wdXNoKHVyaSk7XG5cdFx0aWYgKCF0aGlzLl9wZW5kaW5nUmVhZG9ubHlGbHVzaCkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlYWRvbmx5Rmx1c2ggPSB0cnVlO1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmlzID0gdGhpcy5fcGVuZGluZ1JlYWRvbmx5VXJpcztcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1JlYWRvbmx5VXJpcyA9IFtdO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVhZG9ubHlGbHVzaCA9IGZhbHNlO1xuXHRcdFx0XHR2b2lkIHRoaXMuZmlsZXNDb25maWdTZXJ2aWNlLnVwZGF0ZVJlYWRvbmx5KHVyaXMsIHRydWUpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29udHJpYnV0ZWRXaGVuS2V5cygpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250cmlidXRlZFdoZW5LZXlzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCB3aGVuQ2xhdXNlIG9mIHRoaXMuX2NvbnRyaWJ1dGVkV2hlbkNsYXVzZXMudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IGV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZSh3aGVuQ2xhdXNlKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGV4cHI/LmtleXMoKSA/PyBbXSkge1xuXHRcdFx0XHR0aGlzLl9jb250cmlidXRlZFdoZW5LZXlzLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHdoZW5DbGF1c2VzIG9mIHRoaXMuX3Byb3ZpZGVyV2hlbkNsYXVzZXMudmFsdWVzKCkpIHtcblx0XHRcdGZvciAoY29uc3Qgd2hlbkNsYXVzZSBvZiB3aGVuQ2xhdXNlcykge1xuXHRcdFx0XHRjb25zdCBleHByID0gQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUod2hlbkNsYXVzZSk7XG5cdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGV4cHI/LmtleXMoKSA/PyBbXSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRyaWJ1dGVkV2hlbktleXMuYWRkKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBTa2lsbCB2YWxpZGF0aW9uXG5cblx0cHJpdmF0ZSBhc3luYyBfdmFsaWRhdGVBbmRTYW5pdGl6ZVNraWxsRmlsZSh1cmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgcGFyc2VkRmlsZSA9IGF3YWl0IHRoaXMuX3BhcnNlUHJvbXB0RmlsZSh1cmksIHRva2VuKTtcblx0XHRjb25zdCBmb2xkZXJOYW1lID0gZ2V0U2tpbGxGb2xkZXJOYW1lKHVyaSk7XG5cblx0XHRsZXQgbmFtZSA9IHBhcnNlZEZpbGUuaGVhZGVyPy5uYW1lO1xuXHRcdGlmICghbmFtZSkge1xuXHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYFt2YWxpZGF0ZUFuZFNhbml0aXplU2tpbGxGaWxlXSBBZ2VudCBza2lsbCBmaWxlIG1pc3NpbmcgbmFtZSBhdHRyaWJ1dGUsIHVzaW5nIGZvbGRlciBuYW1lIFwiJHtmb2xkZXJOYW1lfVwiOiAke3VyaX1gKTtcblx0XHRcdG5hbWUgPSBmb2xkZXJOYW1lO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gcGFyc2VkRmlsZS5oZWFkZXI/LmRlc2NyaXB0aW9uO1xuXG5cdFx0Ly8gU2FuaXRpemUgdGhlIG5hbWUgZmlyc3QgKHJlbW92ZSBYTUwgdGFncyBhbmQgdHJ1bmNhdGUpXG5cdFx0bGV0IHNhbml0aXplZE5hbWUgPSB0aGlzLl90cnVuY2F0ZUFnZW50U2tpbGxOYW1lKG5hbWUsIHVyaSk7XG5cblx0XHQvLyBJZiBzYW5pdGl6ZWQgbmFtZSBkb2Vzbid0IG1hdGNoIGZvbGRlciBuYW1lLCB1c2UgZm9sZGVyIG5hbWUgKGNvbnNpc3RlbnQgd2l0aCBjb21wdXRlU2tpbGxEaXNjb3ZlcnlJbmZvKVxuXHRcdGlmIChzYW5pdGl6ZWROYW1lICE9PSBmb2xkZXJOYW1lKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW3ZhbGlkYXRlQW5kU2FuaXRpemVTa2lsbEZpbGVdIEFnZW50IHNraWxsIG5hbWUgXCIke3Nhbml0aXplZE5hbWV9XCIgZG9lcyBub3QgbWF0Y2ggZm9sZGVyIG5hbWUgXCIke2ZvbGRlck5hbWV9XCIsIHVzaW5nIGZvbGRlciBuYW1lOiAke3VyaX1gKTtcblx0XHRcdHNhbml0aXplZE5hbWUgPSBmb2xkZXJOYW1lO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNhbml0aXplZERlc2NyaXB0aW9uID0gZGVzY3JpcHRpb24gPyB0aGlzLl90cnVuY2F0ZUFnZW50U2tpbGxEZXNjcmlwdGlvbihkZXNjcmlwdGlvbiwgdXJpKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4geyBuYW1lOiBzYW5pdGl6ZWROYW1lLCBkZXNjcmlwdGlvbjogc2FuaXRpemVkRGVzY3JpcHRpb24gfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BhcnNlUHJvbXB0RmlsZSh1cmk6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxQYXJzZWRQcm9tcHRGaWxlPiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbCh1cmkpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQcm9tcHRGaWxlUGFyc2VyKCkucGFyc2UodXJpLCBmaWxlQ29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nhbml0aXplQWdlbnRTa2lsbFRleHQodGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBSZW1vdmUgWE1MIHRhZ3Ncblx0XHRyZXR1cm4gdGV4dC5yZXBsYWNlKC88W14+XSs+L2csICcnKTtcblx0fVxuXG5cdHByaXZhdGUgX3RydW5jYXRlQWdlbnRTa2lsbE5hbWUobmFtZTogc3RyaW5nLCB1cmk6IFVSSSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgTUFYX05BTUVfTEVOR1RIID0gNjQ7XG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gdGhpcy5fc2FuaXRpemVBZ2VudFNraWxsVGV4dChuYW1lKTtcblx0XHRpZiAoc2FuaXRpemVkICE9PSBuYW1lKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2ZpbmRBZ2VudFNraWxsc10gQWdlbnQgc2tpbGwgbmFtZSBjb250YWlucyBYTUwgdGFncywgcmVtb3ZlZDogJHt1cml9YCk7XG5cdFx0fVxuXHRcdGlmIChzYW5pdGl6ZWQubGVuZ3RoID4gTUFYX05BTUVfTEVOR1RIKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2ZpbmRBZ2VudFNraWxsc10gQWdlbnQgc2tpbGwgbmFtZSBleGNlZWRzICR7TUFYX05BTUVfTEVOR1RIfSBjaGFyYWN0ZXJzLCB0cnVuY2F0ZWQ6ICR7dXJpfWApO1xuXHRcdFx0cmV0dXJuIHNhbml0aXplZC5zdWJzdHJpbmcoMCwgTUFYX05BTUVfTEVOR1RIKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNhbml0aXplZDtcblx0fVxuXG5cdHByaXZhdGUgX3RydW5jYXRlQWdlbnRTa2lsbERlc2NyaXB0aW9uKGRlc2NyaXB0aW9uOiBzdHJpbmcsIHVyaTogVVJJKTogc3RyaW5nIHtcblx0XHRjb25zdCBNQVhfREVTQ1JJUFRJT05fTEVOR1RIID0gMTAyNDtcblx0XHRjb25zdCBzYW5pdGl6ZWQgPSB0aGlzLl9zYW5pdGl6ZUFnZW50U2tpbGxUZXh0KGRlc2NyaXB0aW9uKTtcblx0XHRpZiAoc2FuaXRpemVkICE9PSBkZXNjcmlwdGlvbikge1xuXHRcdFx0dGhpcy5sb2dnZXIuZGVidWcoYFtmaW5kQWdlbnRTa2lsbHNdIEFnZW50IHNraWxsIGRlc2NyaXB0aW9uIGNvbnRhaW5zIFhNTCB0YWdzLCByZW1vdmVkOiAke3VyaX1gKTtcblx0XHR9XG5cdFx0aWYgKHNhbml0aXplZC5sZW5ndGggPiBNQVhfREVTQ1JJUFRJT05fTEVOR1RIKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5kZWJ1ZyhgW2ZpbmRBZ2VudFNraWxsc10gQWdlbnQgc2tpbGwgZGVzY3JpcHRpb24gZXhjZWVkcyAke01BWF9ERVNDUklQVElPTl9MRU5HVEh9IGNoYXJhY3RlcnMsIHRydW5jYXRlZDogJHt1cml9YCk7XG5cdFx0XHRyZXR1cm4gc2FuaXRpemVkLnN1YnN0cmluZygwLCBNQVhfREVTQ1JJUFRJT05fTEVOR1RIKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNhbml0aXplZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0IsMEJBQTBCO0FBRW5ELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQTJCLHdCQUF3QjtBQUNuRCxTQUFTLGtCQUFrQixtQkFBbUI7QUFDOUM7QUFBQSxFQUNDO0FBQUEsRUFFQTtBQUFBLEVBR0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFnQlAsTUFBTSxtQkFBMkM7QUFBQSxFQUNoRCxZQUFZO0FBQUEsRUFDWixZQUFZO0FBQUEsRUFDWixZQUFZO0FBQUEsRUFDWixZQUFZO0FBQUEsRUFDWixZQUFZO0FBQ2I7QUFZTyxJQUFNLDZCQUFOLGNBQXlDLFdBQVc7QUFBQSxFQXNDMUQsWUFDK0IsUUFDQyxhQUNDLGNBQ0ksa0JBQ1Msb0JBQ1IsbUJBQ3BDO0FBQ0QsVUFBTTtBQVB3QjtBQUNDO0FBQ0M7QUFDSTtBQUNTO0FBQ1I7QUF2Q3RDO0FBQUE7QUFBQTtBQUFBLFNBQWlCLG1CQUFtQjtBQUFBLE1BQ25DLENBQUMsWUFBWSxNQUFNLEdBQUcsSUFBSSxZQUEyQztBQUFBLE1BQ3JFLENBQUMsWUFBWSxZQUFZLEdBQUcsSUFBSSxZQUEyQztBQUFBLE1BQzNFLENBQUMsWUFBWSxLQUFLLEdBQUcsSUFBSSxZQUEyQztB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
