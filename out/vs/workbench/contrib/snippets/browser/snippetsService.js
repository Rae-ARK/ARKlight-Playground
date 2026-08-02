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
import { combinedDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import * as resources from "../../../../base/common/resources.js";
import { isFalsyOrWhitespace } from "../../../../base/common/strings.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { setSnippetSuggestSupport } from "../../../../editor/contrib/suggest/browser/suggest.js";
import { localize } from "../../../../nls.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { FileChangeType, IFileService } from "../../../../platform/files/common/files.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { SnippetFile, SnippetSource } from "./snippetsFile.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { languagesExtPoint } from "../../../services/language/common/languageService.js";
import { SnippetCompletionProvider } from "./snippetCompletionProvider.js";
import { IExtensionResourceLoaderService } from "../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isStringArray } from "../../../../base/common/types.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { ILanguageConfigurationService } from "../../../../editor/common/languages/languageConfigurationRegistry.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { insertInto } from "../../../../base/common/arrays.js";
var snippetExt;
((snippetExt2) => {
  function toValidSnippet(extension, snippet, languageService) {
    if (isFalsyOrWhitespace(snippet.path)) {
      extension.collector.error(localize(
        "invalid.path.0",
        "Expected string in `contributes.{0}.path`. Provided value: {1}",
        extension.description.name,
        String(snippet.path)
      ));
      return null;
    }
    if (isFalsyOrWhitespace(snippet.language) && !snippet.path.endsWith(".code-snippets")) {
      extension.collector.error(localize(
        "invalid.language.0",
        "When omitting the language, the value of `contributes.{0}.path` must be a `.code-snippets`-file. Provided value: {1}",
        extension.description.name,
        String(snippet.path)
      ));
      return null;
    }
    if (!isFalsyOrWhitespace(snippet.language) && !languageService.isRegisteredLanguageId(snippet.language)) {
      extension.collector.error(localize(
        "invalid.language",
        "Unknown language in `contributes.{0}.language`. Provided value: {1}",
        extension.description.name,
        String(snippet.language)
      ));
      return null;
    }
    const extensionLocation = extension.description.extensionLocation;
    const snippetLocation = resources.joinPath(extensionLocation, snippet.path);
    if (!resources.isEqualOrParent(snippetLocation, extensionLocation)) {
      extension.collector.error(localize(
        "invalid.path.1",
        "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.",
        extension.description.name,
        snippetLocation.path,
        extensionLocation.path
      ));
      return null;
    }
    return {
      language: snippet.language,
      location: snippetLocation
    };
  }
  snippetExt2.toValidSnippet = toValidSnippet;
  snippetExt2.snippetsContribution = {
    description: localize("vscode.extension.contributes.snippets", "Contributes snippets."),
    type: "array",
    defaultSnippets: [{ body: [{ language: "", path: "" }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { language: "${1:id}", path: "./snippets/${2:id}.json." } }],
      properties: {
        language: {
          description: localize("vscode.extension.contributes.snippets-language", "Language identifier for which this snippet is contributed to."),
          type: "string"
        },
        path: {
          description: localize("vscode.extension.contributes.snippets-path", "Path of the snippets file. The path is relative to the extension folder and typically starts with './snippets/'."),
          type: "string"
        }
      }
    }
  };
  snippetExt2.point = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "snippets",
    deps: [languagesExtPoint],
    jsonSchema: snippetExt2.snippetsContribution
  });
})(snippetExt || (snippetExt = {}));
function watch(service, resource, callback) {
  return combinedDisposable(
    service.watch(resource),
    service.onDidFilesChange((e) => {
      if (e.affects(resource)) {
        callback();
      }
    })
  );
}
let SnippetEnablement = class {
  constructor(_storageService) {
    this._storageService = _storageService;
    const raw = _storageService.get(SnippetEnablement._key, StorageScope.PROFILE, "");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
    }
    this._ignored = isStringArray(data) ? new Set(data) : /* @__PURE__ */ new Set();
  }
  isIgnored(id) {
    return this._ignored.has(id);
  }
  updateIgnored(id, value) {
    let changed = false;
    if (this._ignored.has(id) && !value) {
      this._ignored.delete(id);
      changed = true;
    } else if (!this._ignored.has(id) && value) {
      this._ignored.add(id);
      changed = true;
    }
    if (changed) {
      this._storageService.store(SnippetEnablement._key, JSON.stringify(Array.from(this._ignored)), StorageScope.PROFILE, StorageTarget.USER);
    }
  }
};
SnippetEnablement._key = "snippets.ignoredSnippets";
SnippetEnablement = __decorateClass([
  __decorateParam(0, IStorageService)
], SnippetEnablement);
let SnippetUsageTimestamps = class {
  constructor(_storageService) {
    this._storageService = _storageService;
    const raw = _storageService.get(SnippetUsageTimestamps._key, StorageScope.PROFILE, "");
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = [];
    }
    this._usages = Array.isArray(data) ? new Map(data) : /* @__PURE__ */ new Map();
  }
  getUsageTimestamp(id) {
    return this._usages.get(id);
  }
  updateUsageTimestamp(id) {
    this._usages.delete(id);
    this._usages.set(id, Date.now());
    const all = [...this._usages].slice(-100);
    this._storageService.store(SnippetUsageTimestamps._key, JSON.stringify(all), StorageScope.PROFILE, StorageTarget.USER);
  }
};
SnippetUsageTimestamps._key = "snippets.usageTimestamps";
SnippetUsageTimestamps = __decorateClass([
  __decorateParam(0, IStorageService)
], SnippetUsageTimestamps);
let SnippetsService = class {
  constructor(_environmentService, _userDataProfileService, _contextService, _languageService, _logService, _fileService, _textfileService, _extensionResourceLoaderService, lifecycleService, instantiationService, languageConfigurationService) {
    this._environmentService = _environmentService;
    this._userDataProfileService = _userDataProfileService;
    this._contextService = _contextService;
    this._languageService = _languageService;
    this._logService = _logService;
    this._fileService = _fileService;
    this._textfileService = _textfileService;
    this._extensionResourceLoaderService = _extensionResourceLoaderService;
    this._disposables = new DisposableStore();
    this._pendingWork = [];
    this._files = new ResourceMap();
    this._pendingWork.push(Promise.resolve(lifecycleService.when(LifecyclePhase.Restored).then(() => {
      this._initExtensionSnippets();
      this._initUserSnippets();
      this._initWorkspaceSnippets();
    })));
    setSnippetSuggestSupport(new SnippetCompletionProvider(this._languageService, this, languageConfigurationService));
    this._enablement = instantiationService.createInstance(SnippetEnablement);
    this._usageTimestamps = instantiationService.createInstance(SnippetUsageTimestamps);
  }
  dispose() {
    this._disposables.dispose();
  }
  isEnabled(snippet) {
    return !this._enablement.isIgnored(snippet.snippetIdentifier);
  }
  updateEnablement(snippet, enabled) {
    this._enablement.updateIgnored(snippet.snippetIdentifier, !enabled);
  }
  updateUsageTimestamp(snippet) {
    this._usageTimestamps.updateUsageTimestamp(snippet.snippetIdentifier);
  }
  _joinSnippets() {
    const promises = this._pendingWork.slice(0);
    this._pendingWork.length = 0;
    return Promise.all(promises);
  }
  async getSnippetFiles() {
    await this._joinSnippets();
    return this._files.values();
  }
  async getSnippets(languageId, resourceUri, opts) {
    await this._joinSnippets();
    const result = [];
    const promises = [];
    if (languageId) {
      if (this._languageService.isRegisteredLanguageId(languageId)) {
        for (const file of this._files.values()) {
          promises.push(
            file.load().then((file2) => file2.select(languageId, result)).catch((err) => this._logService.error(err, file.location.toString()))
          );
        }
      }
    } else {
      for (const file of this._files.values()) {
        promises.push(
          file.load().then((file2) => insertInto(result, result.length, file2.data)).catch((err) => this._logService.error(err, file.location.toString()))
        );
      }
    }
    await Promise.all(promises);
    return this._filterAndSortSnippets(result, resourceUri, opts);
  }
  getSnippetsSync(languageId, resourceUri, opts) {
    const result = [];
    if (this._languageService.isRegisteredLanguageId(languageId)) {
      for (const file of this._files.values()) {
        file.load().catch((_err) => {
        });
        file.select(languageId, result);
      }
    }
    return this._filterAndSortSnippets(result, resourceUri, opts);
  }
  _filterAndSortSnippets(snippets, resourceUri, opts) {
    const result = [];
    for (const snippet of snippets) {
      if (!snippet.prefix && !opts?.includeNoPrefixSnippets) {
        continue;
      }
      if (!this.isEnabled(snippet) && !opts?.includeDisabledSnippets) {
        continue;
      }
      if (typeof opts?.fileTemplateSnippets === "boolean" && opts.fileTemplateSnippets !== snippet.isFileTemplate) {
        continue;
      }
      if (resourceUri && !snippet.isFileIncluded(resourceUri)) {
        continue;
      }
      result.push(snippet);
    }
    return result.sort((a, b) => {
      let result2 = 0;
      if (!opts?.noRecencySort) {
        const val1 = this._usageTimestamps.getUsageTimestamp(a.snippetIdentifier) ?? -1;
        const val2 = this._usageTimestamps.getUsageTimestamp(b.snippetIdentifier) ?? -1;
        result2 = val2 - val1;
      }
      if (result2 === 0) {
        result2 = this._compareSnippet(a, b);
      }
      return result2;
    });
  }
  _compareSnippet(a, b) {
    if (a.snippetSource < b.snippetSource) {
      return -1;
    } else if (a.snippetSource > b.snippetSource) {
      return 1;
    } else if (a.source < b.source) {
      return -1;
    } else if (a.source > b.source) {
      return 1;
    } else if (a.name > b.name) {
      return 1;
    } else if (a.name < b.name) {
      return -1;
    } else {
      return 0;
    }
  }
  // --- loading, watching
  _initExtensionSnippets() {
    snippetExt.point.setHandler((extensions) => {
      for (const [key, value] of this._files) {
        if (value.source === SnippetSource.Extension) {
          this._files.delete(key);
        }
      }
      for (const extension of extensions) {
        for (const contribution of extension.value) {
          const validContribution = snippetExt.toValidSnippet(extension, contribution, this._languageService);
          if (!validContribution) {
            continue;
          }
          const file = this._files.get(validContribution.location);
          if (file) {
            if (file.defaultScopes) {
              file.defaultScopes.push(validContribution.language);
            } else {
              file.defaultScopes = [];
            }
          } else {
            const file2 = new SnippetFile(SnippetSource.Extension, validContribution.location, validContribution.language ? [validContribution.language] : void 0, extension.description, this._fileService, this._extensionResourceLoaderService);
            this._files.set(file2.location, file2);
            if (this._environmentService.isExtensionDevelopment) {
              file2.load().then((file3) => {
                if (file3.data.some((snippet) => snippet.isBogous)) {
                  extension.collector.warn(localize(
                    "badVariableUse",
                    "One or more snippets from the extension '{0}' very likely confuse snippet-variables and snippet-placeholders (see https://code.visualstudio.com/docs/editor/userdefinedsnippets#_snippet-syntax for more details)",
                    extension.description.name
                  ));
                }
              }, (err) => {
                extension.collector.warn(localize(
                  "badFile",
                  'The snippet file "{0}" could not be read.',
                  file2.location.toString()
                ));
              });
            }
          }
        }
      }
    });
  }
  _initWorkspaceSnippets() {
    const disposables = new DisposableStore();
    const updateWorkspaceSnippets = () => {
      disposables.clear();
      this._pendingWork.push(this._initWorkspaceFolderSnippets(this._contextService.getWorkspace(), disposables));
    };
    this._disposables.add(disposables);
    this._disposables.add(this._contextService.onDidChangeWorkspaceFolders(updateWorkspaceSnippets));
    this._disposables.add(this._contextService.onDidChangeWorkbenchState(updateWorkspaceSnippets));
    updateWorkspaceSnippets();
  }
  async _initWorkspaceFolderSnippets(workspace, bucket) {
    const promises = workspace.folders.map(async (folder) => {
      const snippetFolder = folder.toResource(".vscode");
      const value = await this._fileService.exists(snippetFolder);
      if (value) {
        this._initFolderSnippets(SnippetSource.Workspace, snippetFolder, bucket);
      } else {
        bucket.add(this._fileService.onDidFilesChange((e) => {
          if (e.contains(snippetFolder, FileChangeType.ADDED)) {
            this._initFolderSnippets(SnippetSource.Workspace, snippetFolder, bucket);
          }
        }));
      }
    });
    await Promise.all(promises);
  }
  async _initUserSnippets() {
    const disposables = new DisposableStore();
    const updateUserSnippets = async () => {
      disposables.clear();
      const userSnippetsFolder = this._userDataProfileService.currentProfile.snippetsHome;
      await this._fileService.createFolder(userSnippetsFolder);
      await this._initFolderSnippets(SnippetSource.User, userSnippetsFolder, disposables);
    };
    this._disposables.add(disposables);
    this._disposables.add(this._userDataProfileService.onDidChangeCurrentProfile((e) => e.join((async () => {
      this._pendingWork.push(updateUserSnippets());
    })())));
    await updateUserSnippets();
  }
  _initFolderSnippets(source, folder, bucket) {
    const disposables = new DisposableStore();
    const addFolderSnippets = async () => {
      disposables.clear();
      if (!await this._fileService.exists(folder)) {
        return;
      }
      try {
        const stat = await this._fileService.resolve(folder);
        for (const entry of stat.children || []) {
          disposables.add(this._addSnippetFile(entry.resource, source));
        }
      } catch (err) {
        this._logService.error(`Failed snippets from folder '${folder.toString()}'`, err);
      }
    };
    bucket.add(this._textfileService.files.onDidSave((e) => {
      if (resources.isEqualOrParent(e.model.resource, folder)) {
        addFolderSnippets();
      }
    }));
    bucket.add(watch(this._fileService, folder, addFolderSnippets));
    bucket.add(disposables);
    return addFolderSnippets();
  }
  _addSnippetFile(uri, source) {
    const ext = resources.extname(uri);
    if (source === SnippetSource.User && ext === ".json") {
      const langName = resources.basename(uri).replace(/\.json/, "");
      this._files.set(uri, new SnippetFile(source, uri, [langName], void 0, this._fileService, this._extensionResourceLoaderService));
    } else if (ext === ".code-snippets") {
      this._files.set(uri, new SnippetFile(source, uri, void 0, void 0, this._fileService, this._extensionResourceLoaderService));
    }
    return {
      dispose: () => this._files.delete(uri)
    };
  }
};
SnippetsService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IUserDataProfileService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, ILanguageService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextFileService),
  __decorateParam(7, IExtensionResourceLoaderService),
  __decorateParam(8, ILifecycleService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, ILanguageConfigurationService)
], SnippetsService);
function getNonWhitespacePrefix(model, position) {
  const MAX_PREFIX_LENGTH = 100;
  const line = model.getLineContent(position.lineNumber).substr(0, position.column - 1);
  const minChIndex = Math.max(0, line.length - MAX_PREFIX_LENGTH);
  for (let chIndex = line.length - 1; chIndex >= minChIndex; chIndex--) {
    const ch = line.charAt(chIndex);
    if (/\s/.test(ch)) {
      return line.substr(chIndex + 1);
    }
  }
  if (minChIndex === 0) {
    return line;
  }
  return "";
}
export {
  SnippetsService,
  getNonWhitespacePrefix
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NuaXBwZXRzL2Jyb3dzZXIvc25pcHBldHNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRmFsc3lPcldoaXRlc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgc2V0U25pcHBldFN1Z2dlc3RTdXBwb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBGaWxlQ2hhbmdlVHlwZSwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVNuaXBwZXRHZXRPcHRpb25zLCBJU25pcHBldHNTZXJ2aWNlIH0gZnJvbSAnLi9zbmlwcGV0cy5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0LCBTbmlwcGV0RmlsZSwgU25pcHBldFNvdXJjZSB9IGZyb20gJy4vc25pcHBldHNGaWxlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSwgSUV4dGVuc2lvblBvaW50VXNlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBsYW5ndWFnZXNFeHRQb2ludCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xhbmd1YWdlL2NvbW1vbi9sYW5ndWFnZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU25pcHBldENvbXBsZXRpb25Qcm92aWRlciB9IGZyb20gJy4vc25pcHBldENvbXBsZXRpb25Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIvY29tbW9uL2V4dGVuc2lvblJlc291cmNlTG9hZGVyLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZ0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgaW5zZXJ0SW50byB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5cbm5hbWVzcGFjZSBzbmlwcGV0RXh0IHtcblxuXHRleHBvcnQgaW50ZXJmYWNlIElTbmlwcGV0c0V4dGVuc2lvblBvaW50IHtcblx0XHRsYW5ndWFnZTogc3RyaW5nO1xuXHRcdHBhdGg6IHN0cmluZztcblx0fVxuXG5cdGV4cG9ydCBpbnRlcmZhY2UgSVZhbGlkU25pcHBldHNFeHRlbnNpb25Qb2ludCB7XG5cdFx0bGFuZ3VhZ2U6IHN0cmluZztcblx0XHRsb2NhdGlvbjogVVJJO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvVmFsaWRTbmlwcGV0KGV4dGVuc2lvbjogSUV4dGVuc2lvblBvaW50VXNlcjxJU25pcHBldHNFeHRlbnNpb25Qb2ludFtdPiwgc25pcHBldDogSVNuaXBwZXRzRXh0ZW5zaW9uUG9pbnQsIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSk6IElWYWxpZFNuaXBwZXRzRXh0ZW5zaW9uUG9pbnQgfCBudWxsIHtcblxuXHRcdGlmIChpc0ZhbHN5T3JXaGl0ZXNwYWNlKHNuaXBwZXQucGF0aCkpIHtcblx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoXG5cdFx0XHRcdCdpbnZhbGlkLnBhdGguMCcsXG5cdFx0XHRcdFwiRXhwZWN0ZWQgc3RyaW5nIGluIGBjb250cmlidXRlcy57MH0ucGF0aGAuIFByb3ZpZGVkIHZhbHVlOiB7MX1cIixcblx0XHRcdFx0ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLm5hbWUsIFN0cmluZyhzbmlwcGV0LnBhdGgpXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChpc0ZhbHN5T3JXaGl0ZXNwYWNlKHNuaXBwZXQubGFuZ3VhZ2UpICYmICFzbmlwcGV0LnBhdGguZW5kc1dpdGgoJy5jb2RlLXNuaXBwZXRzJykpIHtcblx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3IuZXJyb3IobG9jYWxpemUoXG5cdFx0XHRcdCdpbnZhbGlkLmxhbmd1YWdlLjAnLFxuXHRcdFx0XHRcIldoZW4gb21pdHRpbmcgdGhlIGxhbmd1YWdlLCB0aGUgdmFsdWUgb2YgYGNvbnRyaWJ1dGVzLnswfS5wYXRoYCBtdXN0IGJlIGEgYC5jb2RlLXNuaXBwZXRzYC1maWxlLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsXG5cdFx0XHRcdGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5uYW1lLCBTdHJpbmcoc25pcHBldC5wYXRoKVxuXHRcdFx0KSk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoIWlzRmFsc3lPcldoaXRlc3BhY2Uoc25pcHBldC5sYW5ndWFnZSkgJiYgIWxhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKHNuaXBwZXQubGFuZ3VhZ2UpKSB7XG5cdFx0XHRleHRlbnNpb24uY29sbGVjdG9yLmVycm9yKGxvY2FsaXplKFxuXHRcdFx0XHQnaW52YWxpZC5sYW5ndWFnZScsXG5cdFx0XHRcdFwiVW5rbm93biBsYW5ndWFnZSBpbiBgY29udHJpYnV0ZXMuezB9Lmxhbmd1YWdlYC4gUHJvdmlkZWQgdmFsdWU6IHsxfVwiLFxuXHRcdFx0XHRleHRlbnNpb24uZGVzY3JpcHRpb24ubmFtZSwgU3RyaW5nKHNuaXBwZXQubGFuZ3VhZ2UpXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uTG9jYXRpb24gPSBleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb247XG5cdFx0Y29uc3Qgc25pcHBldExvY2F0aW9uID0gcmVzb3VyY2VzLmpvaW5QYXRoKGV4dGVuc2lvbkxvY2F0aW9uLCBzbmlwcGV0LnBhdGgpO1xuXHRcdGlmICghcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChzbmlwcGV0TG9jYXRpb24sIGV4dGVuc2lvbkxvY2F0aW9uKSkge1xuXHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZShcblx0XHRcdFx0J2ludmFsaWQucGF0aC4xJyxcblx0XHRcdFx0XCJFeHBlY3RlZCBgY29udHJpYnV0ZXMuezB9LnBhdGhgICh7MX0pIHRvIGJlIGluY2x1ZGVkIGluc2lkZSBleHRlbnNpb24ncyBmb2xkZXIgKHsyfSkuIFRoaXMgbWlnaHQgbWFrZSB0aGUgZXh0ZW5zaW9uIG5vbi1wb3J0YWJsZS5cIixcblx0XHRcdFx0ZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLm5hbWUsIHNuaXBwZXRMb2NhdGlvbi5wYXRoLCBleHRlbnNpb25Mb2NhdGlvbi5wYXRoXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRsYW5ndWFnZTogc25pcHBldC5sYW5ndWFnZSxcblx0XHRcdGxvY2F0aW9uOiBzbmlwcGV0TG9jYXRpb25cblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IHNuaXBwZXRzQ29udHJpYnV0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuc25pcHBldHMnLCAnQ29udHJpYnV0ZXMgc25pcHBldHMuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IFt7IGxhbmd1YWdlOiAnJywgcGF0aDogJycgfV0gfV0sXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGxhbmd1YWdlOiAnJHsxOmlkfScsIHBhdGg6ICcuL3NuaXBwZXRzLyR7MjppZH0uanNvbi4nIH0gfV0sXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGxhbmd1YWdlOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnNuaXBwZXRzLWxhbmd1YWdlJywgJ0xhbmd1YWdlIGlkZW50aWZpZXIgZm9yIHdoaWNoIHRoaXMgc25pcHBldCBpcyBjb250cmlidXRlZCB0by4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnNuaXBwZXRzLXBhdGgnLCAnUGF0aCBvZiB0aGUgc25pcHBldHMgZmlsZS4gVGhlIHBhdGggaXMgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiBmb2xkZXIgYW5kIHR5cGljYWxseSBzdGFydHMgd2l0aCBcXCcuL3NuaXBwZXRzL1xcJy4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9O1xuXG5cdGV4cG9ydCBjb25zdCBwb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PHNuaXBwZXRFeHQuSVNuaXBwZXRzRXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRcdGV4dGVuc2lvblBvaW50OiAnc25pcHBldHMnLFxuXHRcdGRlcHM6IFtsYW5ndWFnZXNFeHRQb2ludF0sXG5cdFx0anNvblNjaGVtYTogc25pcHBldEV4dC5zbmlwcGV0c0NvbnRyaWJ1dGlvblxuXHR9KTtcbn1cblxuZnVuY3Rpb24gd2F0Y2goc2VydmljZTogSUZpbGVTZXJ2aWNlLCByZXNvdXJjZTogVVJJLCBjYWxsYmFjazogKCkgPT4gdW5rbm93bik6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRzZXJ2aWNlLndhdGNoKHJlc291cmNlKSxcblx0XHRzZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzKHJlc291cmNlKSkge1xuXHRcdFx0XHRjYWxsYmFjaygpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdCk7XG59XG5cbmNsYXNzIFNuaXBwZXRFbmFibGVtZW50IHtcblxuXHRwcml2YXRlIHN0YXRpYyBfa2V5ID0gJ3NuaXBwZXRzLmlnbm9yZWRTbmlwcGV0cyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaWdub3JlZDogU2V0PHN0cmluZz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblxuXHRcdGNvbnN0IHJhdyA9IF9zdG9yYWdlU2VydmljZS5nZXQoU25pcHBldEVuYWJsZW1lbnQuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICcnKTtcblx0XHRsZXQgZGF0YTogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGRhdGEgPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0fSBjYXRjaCB7IH1cblxuXHRcdHRoaXMuX2lnbm9yZWQgPSBpc1N0cmluZ0FycmF5KGRhdGEpID8gbmV3IFNldChkYXRhKSA6IG5ldyBTZXQoKTtcblx0fVxuXG5cdGlzSWdub3JlZChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lnbm9yZWQuaGFzKGlkKTtcblx0fVxuXG5cdHVwZGF0ZUlnbm9yZWQoaWQ6IHN0cmluZywgdmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl9pZ25vcmVkLmhhcyhpZCkgJiYgIXZhbHVlKSB7XG5cdFx0XHR0aGlzLl9pZ25vcmVkLmRlbGV0ZShpZCk7XG5cdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLl9pZ25vcmVkLmhhcyhpZCkgJiYgdmFsdWUpIHtcblx0XHRcdHRoaXMuX2lnbm9yZWQuYWRkKGlkKTtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU25pcHBldEVuYWJsZW1lbnQuX2tleSwgSlNPTi5zdHJpbmdpZnkoQXJyYXkuZnJvbSh0aGlzLl9pZ25vcmVkKSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTbmlwcGV0VXNhZ2VUaW1lc3RhbXBzIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfa2V5ID0gJ3NuaXBwZXRzLnVzYWdlVGltZXN0YW1wcyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdXNhZ2VzOiBNYXA8c3RyaW5nLCBudW1iZXI+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cblx0XHRjb25zdCByYXcgPSBfc3RvcmFnZVNlcnZpY2UuZ2V0KFNuaXBwZXRVc2FnZVRpbWVzdGFtcHMuX2tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICcnKTtcblx0XHRsZXQgZGF0YTogW3N0cmluZywgbnVtYmVyXVtdIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRkYXRhID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0ZGF0YSA9IFtdO1xuXHRcdH1cblxuXHRcdHRoaXMuX3VzYWdlcyA9IEFycmF5LmlzQXJyYXkoZGF0YSkgPyBuZXcgTWFwKGRhdGEpIDogbmV3IE1hcCgpO1xuXHR9XG5cblx0Z2V0VXNhZ2VUaW1lc3RhbXAoaWQ6IHN0cmluZyk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3VzYWdlcy5nZXQoaWQpO1xuXHR9XG5cblx0dXBkYXRlVXNhZ2VUaW1lc3RhbXAoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIG1hcCB1c2VzIGluc2VydGlvbiBvcmRlciwgd2Ugd2FudCBtb3N0IHJlY2VudCBhdCB0aGUgZW5kXG5cdFx0dGhpcy5fdXNhZ2VzLmRlbGV0ZShpZCk7XG5cdFx0dGhpcy5fdXNhZ2VzLnNldChpZCwgRGF0ZS5ub3coKSk7XG5cblx0XHQvLyBwZXJzaXN0IGxhc3QgMTAwIGl0ZW1cblx0XHRjb25zdCBhbGwgPSBbLi4udGhpcy5fdXNhZ2VzXS5zbGljZSgtMTAwKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShTbmlwcGV0VXNhZ2VUaW1lc3RhbXBzLl9rZXksIEpTT04uc3RyaW5naWZ5KGFsbCksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTbmlwcGV0c1NlcnZpY2UgaW1wbGVtZW50cyBJU25pcHBldHNTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1dvcms6IFByb21pc2U8YW55PltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVzID0gbmV3IFJlc291cmNlTWFwPFNuaXBwZXRGaWxlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbmFibGVtZW50OiBTbmlwcGV0RW5hYmxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdXNhZ2VUaW1lc3RhbXBzOiBTbmlwcGV0VXNhZ2VUaW1lc3RhbXBzO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRmaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX3BlbmRpbmdXb3JrLnB1c2goUHJvbWlzZS5yZXNvbHZlKGxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9pbml0RXh0ZW5zaW9uU25pcHBldHMoKTtcblx0XHRcdHRoaXMuX2luaXRVc2VyU25pcHBldHMoKTtcblx0XHRcdHRoaXMuX2luaXRXb3Jrc3BhY2VTbmlwcGV0cygpO1xuXHRcdH0pKSk7XG5cblx0XHRzZXRTbmlwcGV0U3VnZ2VzdFN1cHBvcnQobmV3IFNuaXBwZXRDb21wbGV0aW9uUHJvdmlkZXIodGhpcy5fbGFuZ3VhZ2VTZXJ2aWNlLCB0aGlzLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl9lbmFibGVtZW50ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU25pcHBldEVuYWJsZW1lbnQpO1xuXHRcdHRoaXMuX3VzYWdlVGltZXN0YW1wcyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNuaXBwZXRVc2FnZVRpbWVzdGFtcHMpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRpc0VuYWJsZWQoc25pcHBldDogU25pcHBldCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5fZW5hYmxlbWVudC5pc0lnbm9yZWQoc25pcHBldC5zbmlwcGV0SWRlbnRpZmllcik7XG5cdH1cblxuXHR1cGRhdGVFbmFibGVtZW50KHNuaXBwZXQ6IFNuaXBwZXQsIGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9lbmFibGVtZW50LnVwZGF0ZUlnbm9yZWQoc25pcHBldC5zbmlwcGV0SWRlbnRpZmllciwgIWVuYWJsZWQpO1xuXHR9XG5cblx0dXBkYXRlVXNhZ2VUaW1lc3RhbXAoc25pcHBldDogU25pcHBldCk6IHZvaWQge1xuXHRcdHRoaXMuX3VzYWdlVGltZXN0YW1wcy51cGRhdGVVc2FnZVRpbWVzdGFtcChzbmlwcGV0LnNuaXBwZXRJZGVudGlmaWVyKTtcblx0fVxuXG5cdHByaXZhdGUgX2pvaW5TbmlwcGV0cygpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IHByb21pc2VzID0gdGhpcy5fcGVuZGluZ1dvcmsuc2xpY2UoMCk7XG5cdFx0dGhpcy5fcGVuZGluZ1dvcmsubGVuZ3RoID0gMDtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuXHR9XG5cblx0YXN5bmMgZ2V0U25pcHBldEZpbGVzKCk6IFByb21pc2U8SXRlcmFibGU8U25pcHBldEZpbGU+PiB7XG5cdFx0YXdhaXQgdGhpcy5fam9pblNuaXBwZXRzKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbGVzLnZhbHVlcygpO1xuXHR9XG5cblx0YXN5bmMgZ2V0U25pcHBldHMobGFuZ3VhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXNvdXJjZVVyaT86IFVSSSwgb3B0cz86IElTbmlwcGV0R2V0T3B0aW9ucyk6IFByb21pc2U8U25pcHBldFtdPiB7XG5cdFx0YXdhaXQgdGhpcy5fam9pblNuaXBwZXRzKCk7XG5cblx0XHRjb25zdCByZXN1bHQ6IFNuaXBwZXRbXSA9IFtdO1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPGFueT5bXSA9IFtdO1xuXG5cdFx0aWYgKGxhbmd1YWdlSWQpIHtcblx0XHRcdGlmICh0aGlzLl9sYW5ndWFnZVNlcnZpY2UuaXNSZWdpc3RlcmVkTGFuZ3VhZ2VJZChsYW5ndWFnZUlkKSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5fZmlsZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRwcm9taXNlcy5wdXNoKGZpbGUubG9hZCgpXG5cdFx0XHRcdFx0XHQudGhlbihmaWxlID0+IGZpbGUuc2VsZWN0KGxhbmd1YWdlSWQsIHJlc3VsdCkpXG5cdFx0XHRcdFx0XHQuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCBmaWxlLmxvY2F0aW9uLnRvU3RyaW5nKCkpKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIHRoaXMuX2ZpbGVzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHByb21pc2VzLnB1c2goZmlsZS5sb2FkKClcblx0XHRcdFx0XHQudGhlbihmaWxlID0+IGluc2VydEludG8ocmVzdWx0LCByZXN1bHQubGVuZ3RoLCBmaWxlLmRhdGEpKVxuXHRcdFx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGZpbGUubG9jYXRpb24udG9TdHJpbmcoKSkpXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVyQW5kU29ydFNuaXBwZXRzKHJlc3VsdCwgcmVzb3VyY2VVcmksIG9wdHMpO1xuXHR9XG5cblx0Z2V0U25pcHBldHNTeW5jKGxhbmd1YWdlSWQ6IHN0cmluZywgcmVzb3VyY2VVcmk/OiBVUkksIG9wdHM/OiBJU25pcHBldEdldE9wdGlvbnMpOiBTbmlwcGV0W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogU25pcHBldFtdID0gW107XG5cdFx0aWYgKHRoaXMuX2xhbmd1YWdlU2VydmljZS5pc1JlZ2lzdGVyZWRMYW5ndWFnZUlkKGxhbmd1YWdlSWQpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZpbGUgb2YgdGhpcy5fZmlsZXMudmFsdWVzKCkpIHtcblx0XHRcdFx0Ly8ga2ljayBvZmYgbG9hZGluZyAod2hpY2ggaXMgYSBub29wIGluIGNhc2UgaXQncyBhbHJlYWR5IGxvYWRlZClcblx0XHRcdFx0Ly8gYW5kIG9wdGltaXN0aWNhbGx5IGNvbGxlY3Qgc25pcHBldHNcblx0XHRcdFx0ZmlsZS5sb2FkKCkuY2F0Y2goX2VyciA9PiB7IC8qaWdub3JlKi8gfSk7XG5cdFx0XHRcdGZpbGUuc2VsZWN0KGxhbmd1YWdlSWQsIHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9maWx0ZXJBbmRTb3J0U25pcHBldHMocmVzdWx0LCByZXNvdXJjZVVyaSwgb3B0cyk7XG5cdH1cblxuXHRwcml2YXRlIF9maWx0ZXJBbmRTb3J0U25pcHBldHMoc25pcHBldHM6IFNuaXBwZXRbXSwgcmVzb3VyY2VVcmk/OiBVUkksIG9wdHM/OiBJU25pcHBldEdldE9wdGlvbnMpOiBTbmlwcGV0W10ge1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBTbmlwcGV0W10gPSBbXTtcblxuXHRcdGZvciAoY29uc3Qgc25pcHBldCBvZiBzbmlwcGV0cykge1xuXHRcdFx0aWYgKCFzbmlwcGV0LnByZWZpeCAmJiAhb3B0cz8uaW5jbHVkZU5vUHJlZml4U25pcHBldHMpIHtcblx0XHRcdFx0Ly8gcHJlZml4IG9yIG5vLXByZWZpeCB3YW50ZWRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuaXNFbmFibGVkKHNuaXBwZXQpICYmICFvcHRzPy5pbmNsdWRlRGlzYWJsZWRTbmlwcGV0cykge1xuXHRcdFx0XHQvLyBlbmFibGVkIG9yIGRpc2FibGVkIHdhbnRlZFxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2Ygb3B0cz8uZmlsZVRlbXBsYXRlU25pcHBldHMgPT09ICdib29sZWFuJyAmJiBvcHRzLmZpbGVUZW1wbGF0ZVNuaXBwZXRzICE9PSBzbmlwcGV0LmlzRmlsZVRlbXBsYXRlKSB7XG5cdFx0XHRcdC8vIGlzVG9wTGV2ZWwgcmVxdWVzdGVkIGJ1dCBtaXNtYXRjaGluZ1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXNvdXJjZVVyaSAmJiAhc25pcHBldC5pc0ZpbGVJbmNsdWRlZChyZXNvdXJjZVVyaSkpIHtcblx0XHRcdFx0Ly8gaW5jbHVkZS9leGNsdWRlIHNldHRpbmdzIGRvbid0IG1hdGNoXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goc25pcHBldCk7XG5cdFx0fVxuXG5cblx0XHRyZXR1cm4gcmVzdWx0LnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGxldCByZXN1bHQgPSAwO1xuXHRcdFx0aWYgKCFvcHRzPy5ub1JlY2VuY3lTb3J0KSB7XG5cdFx0XHRcdGNvbnN0IHZhbDEgPSB0aGlzLl91c2FnZVRpbWVzdGFtcHMuZ2V0VXNhZ2VUaW1lc3RhbXAoYS5zbmlwcGV0SWRlbnRpZmllcikgPz8gLTE7XG5cdFx0XHRcdGNvbnN0IHZhbDIgPSB0aGlzLl91c2FnZVRpbWVzdGFtcHMuZ2V0VXNhZ2VUaW1lc3RhbXAoYi5zbmlwcGV0SWRlbnRpZmllcikgPz8gLTE7XG5cdFx0XHRcdHJlc3VsdCA9IHZhbDIgLSB2YWwxO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gMCkge1xuXHRcdFx0XHRyZXN1bHQgPSB0aGlzLl9jb21wYXJlU25pcHBldChhLCBiKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wYXJlU25pcHBldChhOiBTbmlwcGV0LCBiOiBTbmlwcGV0KTogbnVtYmVyIHtcblx0XHRpZiAoYS5zbmlwcGV0U291cmNlIDwgYi5zbmlwcGV0U291cmNlKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIGlmIChhLnNuaXBwZXRTb3VyY2UgPiBiLnNuaXBwZXRTb3VyY2UpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0gZWxzZSBpZiAoYS5zb3VyY2UgPCBiLnNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSBpZiAoYS5zb3VyY2UgPiBiLnNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIDE7XG5cdFx0fSBlbHNlIGlmIChhLm5hbWUgPiBiLm5hbWUpIHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0gZWxzZSBpZiAoYS5uYW1lIDwgYi5uYW1lKSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBsb2FkaW5nLCB3YXRjaGluZ1xuXG5cdHByaXZhdGUgX2luaXRFeHRlbnNpb25TbmlwcGV0cygpOiB2b2lkIHtcblx0XHRzbmlwcGV0RXh0LnBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHRoaXMuX2ZpbGVzKSB7XG5cdFx0XHRcdGlmICh2YWx1ZS5zb3VyY2UgPT09IFNuaXBwZXRTb3VyY2UuRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlsZXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHRjb25zdCB2YWxpZENvbnRyaWJ1dGlvbiA9IHNuaXBwZXRFeHQudG9WYWxpZFNuaXBwZXQoZXh0ZW5zaW9uLCBjb250cmlidXRpb24sIHRoaXMuX2xhbmd1YWdlU2VydmljZSk7XG5cdFx0XHRcdFx0aWYgKCF2YWxpZENvbnRyaWJ1dGlvbikge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZmlsZSA9IHRoaXMuX2ZpbGVzLmdldCh2YWxpZENvbnRyaWJ1dGlvbi5sb2NhdGlvbik7XG5cdFx0XHRcdFx0aWYgKGZpbGUpIHtcblx0XHRcdFx0XHRcdGlmIChmaWxlLmRlZmF1bHRTY29wZXMpIHtcblx0XHRcdFx0XHRcdFx0ZmlsZS5kZWZhdWx0U2NvcGVzLnB1c2godmFsaWRDb250cmlidXRpb24ubGFuZ3VhZ2UpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZmlsZS5kZWZhdWx0U2NvcGVzID0gW107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGZpbGUgPSBuZXcgU25pcHBldEZpbGUoU25pcHBldFNvdXJjZS5FeHRlbnNpb24sIHZhbGlkQ29udHJpYnV0aW9uLmxvY2F0aW9uLCB2YWxpZENvbnRyaWJ1dGlvbi5sYW5ndWFnZSA/IFt2YWxpZENvbnRyaWJ1dGlvbi5sYW5ndWFnZV0gOiB1bmRlZmluZWQsIGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgdGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2V4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9maWxlcy5zZXQoZmlsZS5sb2NhdGlvbiwgZmlsZSk7XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNFeHRlbnNpb25EZXZlbG9wbWVudCkge1xuXHRcdFx0XHRcdFx0XHRmaWxlLmxvYWQoKS50aGVuKGZpbGUgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIHdhcm4gYWJvdXQgYmFkIHRhYnN0b3AvdmFyaWFibGUgdXNhZ2Vcblx0XHRcdFx0XHRcdFx0XHRpZiAoZmlsZS5kYXRhLnNvbWUoc25pcHBldCA9PiBzbmlwcGV0LmlzQm9nb3VzKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci53YXJuKGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdFx0XHQnYmFkVmFyaWFibGVVc2UnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcIk9uZSBvciBtb3JlIHNuaXBwZXRzIGZyb20gdGhlIGV4dGVuc2lvbiAnezB9JyB2ZXJ5IGxpa2VseSBjb25mdXNlIHNuaXBwZXQtdmFyaWFibGVzIGFuZCBzbmlwcGV0LXBsYWNlaG9sZGVycyAoc2VlIGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL3VzZXJkZWZpbmVkc25pcHBldHMjX3NuaXBwZXQtc3ludGF4IGZvciBtb3JlIGRldGFpbHMpXCIsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5uYW1lXG5cdFx0XHRcdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gZ2VuZXJpYyBlcnJvclxuXHRcdFx0XHRcdFx0XHRcdGV4dGVuc2lvbi5jb2xsZWN0b3Iud2Fybihsb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0XHRcdCdiYWRGaWxlJyxcblx0XHRcdFx0XHRcdFx0XHRcdFwiVGhlIHNuaXBwZXQgZmlsZSBcXFwiezB9XFxcIiBjb3VsZCBub3QgYmUgcmVhZC5cIixcblx0XHRcdFx0XHRcdFx0XHRcdGZpbGUubG9jYXRpb24udG9TdHJpbmcoKVxuXHRcdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdFdvcmtzcGFjZVNuaXBwZXRzKCk6IHZvaWQge1xuXHRcdC8vIHdvcmtzcGFjZSBzdHVmZlxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHVwZGF0ZVdvcmtzcGFjZVNuaXBwZXRzID0gKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdXb3JrLnB1c2godGhpcy5faW5pdFdvcmtzcGFjZUZvbGRlclNuaXBwZXRzKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLCBkaXNwb3NhYmxlcykpO1xuXHRcdH07XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKHVwZGF0ZVdvcmtzcGFjZVNuaXBwZXRzKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUodXBkYXRlV29ya3NwYWNlU25pcHBldHMpKTtcblx0XHR1cGRhdGVXb3Jrc3BhY2VTbmlwcGV0cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW5pdFdvcmtzcGFjZUZvbGRlclNuaXBwZXRzKHdvcmtzcGFjZTogSVdvcmtzcGFjZSwgYnVja2V0OiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IHByb21pc2VzID0gd29ya3NwYWNlLmZvbGRlcnMubWFwKGFzeW5jIGZvbGRlciA9PiB7XG5cdFx0XHRjb25zdCBzbmlwcGV0Rm9sZGVyID0gZm9sZGVyLnRvUmVzb3VyY2UoJy52c2NvZGUnKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHNuaXBwZXRGb2xkZXIpO1xuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuX2luaXRGb2xkZXJTbmlwcGV0cyhTbmlwcGV0U291cmNlLldvcmtzcGFjZSwgc25pcHBldEZvbGRlciwgYnVja2V0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHdhdGNoXG5cdFx0XHRcdGJ1Y2tldC5hZGQodGhpcy5fZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5jb250YWlucyhzbmlwcGV0Rm9sZGVyLCBGaWxlQ2hhbmdlVHlwZS5BRERFRCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2luaXRGb2xkZXJTbmlwcGV0cyhTbmlwcGV0U291cmNlLldvcmtzcGFjZSwgc25pcHBldEZvbGRlciwgYnVja2V0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0VXNlclNuaXBwZXRzKCk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdXBkYXRlVXNlclNuaXBwZXRzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdGNvbnN0IHVzZXJTbmlwcGV0c0ZvbGRlciA9IHRoaXMuX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc25pcHBldHNIb21lO1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVzZXJTbmlwcGV0c0ZvbGRlcik7XG5cdFx0XHRhd2FpdCB0aGlzLl9pbml0Rm9sZGVyU25pcHBldHMoU25pcHBldFNvdXJjZS5Vc2VyLCB1c2VyU25pcHBldHNGb2xkZXIsIGRpc3Bvc2FibGVzKTtcblx0XHR9O1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IGUuam9pbigoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1dvcmsucHVzaCh1cGRhdGVVc2VyU25pcHBldHMoKSk7XG5cdFx0fSkoKSkpKTtcblx0XHRhd2FpdCB1cGRhdGVVc2VyU25pcHBldHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2luaXRGb2xkZXJTbmlwcGV0cyhzb3VyY2U6IFNuaXBwZXRTb3VyY2UsIGZvbGRlcjogVVJJLCBidWNrZXQ6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgYWRkRm9sZGVyU25pcHBldHMgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMoZm9sZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVzb2x2ZShmb2xkZXIpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHN0YXQuY2hpbGRyZW4gfHwgW10pIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fYWRkU25pcHBldEZpbGUoZW50cnkucmVzb3VyY2UsIHNvdXJjZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRmFpbGVkIHNuaXBwZXRzIGZyb20gZm9sZGVyICcke2ZvbGRlci50b1N0cmluZygpfSdgLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRidWNrZXQuYWRkKHRoaXMuX3RleHRmaWxlU2VydmljZS5maWxlcy5vbkRpZFNhdmUoZSA9PiB7XG5cdFx0XHRpZiAocmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudChlLm1vZGVsLnJlc291cmNlLCBmb2xkZXIpKSB7XG5cdFx0XHRcdGFkZEZvbGRlclNuaXBwZXRzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGJ1Y2tldC5hZGQod2F0Y2godGhpcy5fZmlsZVNlcnZpY2UsIGZvbGRlciwgYWRkRm9sZGVyU25pcHBldHMpKTtcblx0XHRidWNrZXQuYWRkKGRpc3Bvc2FibGVzKTtcblx0XHRyZXR1cm4gYWRkRm9sZGVyU25pcHBldHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2FkZFNuaXBwZXRGaWxlKHVyaTogVVJJLCBzb3VyY2U6IFNuaXBwZXRTb3VyY2UpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZXh0ID0gcmVzb3VyY2VzLmV4dG5hbWUodXJpKTtcblx0XHRpZiAoc291cmNlID09PSBTbmlwcGV0U291cmNlLlVzZXIgJiYgZXh0ID09PSAnLmpzb24nKSB7XG5cdFx0XHRjb25zdCBsYW5nTmFtZSA9IHJlc291cmNlcy5iYXNlbmFtZSh1cmkpLnJlcGxhY2UoL1xcLmpzb24vLCAnJyk7XG5cdFx0XHR0aGlzLl9maWxlcy5zZXQodXJpLCBuZXcgU25pcHBldEZpbGUoc291cmNlLCB1cmksIFtsYW5nTmFtZV0sIHVuZGVmaW5lZCwgdGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2V4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSkpO1xuXHRcdH0gZWxzZSBpZiAoZXh0ID09PSAnLmNvZGUtc25pcHBldHMnKSB7XG5cdFx0XHR0aGlzLl9maWxlcy5zZXQodXJpLCBuZXcgU25pcHBldEZpbGUoc291cmNlLCB1cmksIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKSk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB0aGlzLl9maWxlcy5kZWxldGUodXJpKVxuXHRcdH07XG5cdH1cbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIElTaW1wbGVNb2RlbCB7XG5cdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE5vbldoaXRlc3BhY2VQcmVmaXgobW9kZWw6IElTaW1wbGVNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uKTogc3RyaW5nIHtcblx0LyoqXG5cdCAqIERvIG5vdCBhbmFseXplIG1vcmUgY2hhcmFjdGVyc1xuXHQgKi9cblx0Y29uc3QgTUFYX1BSRUZJWF9MRU5HVEggPSAxMDA7XG5cblx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpLnN1YnN0cigwLCBwb3NpdGlvbi5jb2x1bW4gLSAxKTtcblxuXHRjb25zdCBtaW5DaEluZGV4ID0gTWF0aC5tYXgoMCwgbGluZS5sZW5ndGggLSBNQVhfUFJFRklYX0xFTkdUSCk7XG5cdGZvciAobGV0IGNoSW5kZXggPSBsaW5lLmxlbmd0aCAtIDE7IGNoSW5kZXggPj0gbWluQ2hJbmRleDsgY2hJbmRleC0tKSB7XG5cdFx0Y29uc3QgY2ggPSBsaW5lLmNoYXJBdChjaEluZGV4KTtcblxuXHRcdGlmICgvXFxzLy50ZXN0KGNoKSkge1xuXHRcdFx0cmV0dXJuIGxpbmUuc3Vic3RyKGNoSW5kZXggKyAxKTtcblx0XHR9XG5cdH1cblxuXHRpZiAobWluQ2hJbmRleCA9PT0gMCkge1xuXHRcdHJldHVybiBsaW5lO1xuXHR9XG5cblx0cmV0dXJuICcnO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLG9CQUFpQyx1QkFBdUI7QUFDakUsWUFBWSxlQUFlO0FBQzNCLFNBQVMsMkJBQTJCO0FBR3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCLG9CQUFvQjtBQUM3QyxTQUFTLG1CQUFtQixzQkFBc0I7QUFDbEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBcUIsZ0NBQWdDO0FBRXJELFNBQWtCLGFBQWEscUJBQXFCO0FBQ3BELFNBQVMsMEJBQStDO0FBQ3hELFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0JBQWtCO0FBRTNCLElBQVU7QUFBQSxDQUFWLENBQVVBLGdCQUFWO0FBWVEsV0FBUyxlQUFlLFdBQTJELFNBQWtDLGlCQUF3RTtBQUVuTSxRQUFJLG9CQUFvQixRQUFRLElBQUksR0FBRztBQUN0Qyxn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
