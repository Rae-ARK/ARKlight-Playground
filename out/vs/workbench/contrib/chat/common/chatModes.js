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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { constObservable, observableValue, transaction } from "../../../../base/common/observable.js";
import { isUriComponents, URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IChatAgentService } from "./participants/chatAgents.js";
import { ChatContextKeys } from "./actions/chatContextKeys.js";
import { getChatSessionType, LocalChatSessionUri } from "./model/chatUri.js";
import { ChatConfiguration, ChatModeKind } from "./constants.js";
import { IAgentSource, isCustomAgentVisibility, PromptsStorage } from "./promptSyntax/service/promptsService.js";
import { ICustomizationHarnessService } from "./customizationHarnessService.js";
import { Target } from "./promptSyntax/promptTypes.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { hash } from "../../../../base/common/hash.js";
import { isString } from "../../../../base/common/types.js";
import { isTarget } from "./promptSyntax/languageProviders/promptFileAttributes.js";
import { equals as arraysEqual } from "../../../../base/common/arrays.js";
import { isEqual as isURLEquals } from "../../../../base/common/resources.js";
import { equals as objectEquals } from "../../../../base/common/objects.js";
import { Delayer } from "../../../../base/common/async.js";
import { isCancellationError } from "../../../../base/common/errors.js";
const IChatModeService = createDecorator("chatModeService");
let ChatModes = class extends Disposable {
  constructor(sessionResource, chatAgentService, contextKeyService, logService, storageService, configurationService, customizationHarnessService) {
    super();
    this.sessionResource = sessionResource;
    this.chatAgentService = chatAgentService;
    this.logService = logService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.customizationHarnessService = customizationHarnessService;
    this._customModeInstances = /* @__PURE__ */ new Map();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    /** Tracks the most recent refresh of custom prompt modes. */
    this._pendingRefresh = Promise.resolve();
    this._refreshThrottler = this._register(new Delayer(100));
    const sessionType = getChatSessionType(sessionResource);
    this._storageKey = ChatModes.CUSTOM_MODES_STORAGE_KEY_PREFIX + sessionType;
    this.hasCustomModes = ChatContextKeys.Modes.hasCustomChatModes.bindTo(contextKeyService);
    this.loadCachedModes();
    this._pendingRefresh = this.triggerRefresh();
    this._register(this.customizationHarnessService.onDidChangeCustomAgents((e) => {
      if (e.sessionType === sessionType) {
        this._pendingRefresh = this.triggerRefresh();
      }
    }));
    this._register(this.storageService.onWillSaveState(() => this.saveCachedModes()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
        this._onDidChange.fire();
      }
    }));
    let didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
    this._register(this.chatAgentService.onDidChangeAgents(() => {
      if (didHaveToolsAgent !== this.chatAgentService.hasToolsAgent) {
        didHaveToolsAgent = this.chatAgentService.hasToolsAgent;
        this._onDidChange.fire();
      }
    }));
  }
  get builtin() {
    return this.getBuiltinModes();
  }
  get custom() {
    return this.getCustomModes();
  }
  findModeById(id) {
    return this.getBuiltinModes().find((mode) => mode.id === id) ?? this._customModeInstances.get(id);
  }
  findModeByName(name) {
    return this.getBuiltinModes().find((mode) => mode.name.get() === name) ?? this.getCustomModes().find((mode) => mode.name.get() === name || mode.id === name);
  }
  waitForPendingUpdates() {
    return this._pendingRefresh;
  }
  loadCachedModes() {
    try {
      const cachedCustomModes = this.storageService.getObject(this._storageKey, StorageScope.WORKSPACE);
      if (cachedCustomModes) {
        this.deserializeCachedModes(cachedCustomModes);
      }
    } catch (error) {
      this.logService.error(error, "Failed to load cached custom agents");
    }
  }
  deserializeCachedModes(cachedCustomModes) {
    if (!Array.isArray(cachedCustomModes)) {
      this.logService.error("Invalid cached custom modes data: expected array");
      return;
    }
    for (const cachedMode of cachedCustomModes) {
      if (isCachedChatModeData(cachedMode) && cachedMode.uri) {
        try {
          const visibility = cachedMode.visibility ?? { userInvocable: true, agentInvocable: cachedMode.infer !== false };
          if (!visibility.userInvocable) {
            continue;
          }
          const uri = URI.revive(cachedMode.uri);
          const customChatMode = {
            id: cachedMode.id,
            uri,
            name: cachedMode.name,
            description: cachedMode.description,
            tools: cachedMode.customTools,
            model: isString(cachedMode.model) ? [cachedMode.model] : cachedMode.model,
            argumentHint: cachedMode.argumentHint,
            agentInstructions: cachedMode.modeInstructions ?? { content: cachedMode.body ?? "", toolReferences: [] },
            handOffs: cachedMode.handOffs,
            target: cachedMode.target ?? Target.Undefined,
            visibility,
            agents: cachedMode.agents,
            sessionTypes: cachedMode.sessionTypes,
            source: reviveChatModeSource(cachedMode.source) ?? { storage: PromptsStorage.local },
            enabled: true
          };
          const instance = new CustomChatMode(customChatMode);
          this._customModeInstances.set(uri.toString(), instance);
        } catch (error) {
          this.logService.error(error, "Failed to revive cached custom agent");
        }
      }
    }
    this.hasCustomModes.set(this._customModeInstances.size > 0);
  }
  saveCachedModes() {
    try {
      const modesToCache = Array.from(this._customModeInstances.values());
      this.storageService.store(this._storageKey, modesToCache, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } catch (error) {
      this.logService.warn("Failed to save cached custom agents", error);
    }
  }
  triggerRefresh() {
    this._refreshCancellationSource?.cancel();
    this._refreshCancellationSource?.dispose();
    const refreshCancellationSource = this._refreshCancellationSource = new CancellationTokenSource();
    return this._refreshThrottler.trigger(async () => {
      try {
        await this.refreshCustomPromptModes(refreshCancellationSource.token);
      } finally {
        if (this._refreshCancellationSource === refreshCancellationSource) {
          this._refreshCancellationSource = void 0;
        }
        refreshCancellationSource.dispose();
      }
    });
  }
  dispose() {
    this._refreshCancellationSource?.cancel();
    this._refreshCancellationSource?.dispose();
    this._refreshCancellationSource = void 0;
    super.dispose();
  }
  async refreshCustomPromptModes(token) {
    let hasChanges = false;
    try {
      if (token.isCancellationRequested) {
        return;
      }
      const customModes = await this.customizationHarnessService.getCustomAgents(this.sessionResource, token);
      if (token.isCancellationRequested) {
        return;
      }
      const seenUris = /* @__PURE__ */ new Set();
      for (const customMode of customModes) {
        if (!customMode.visibility.userInvocable || !customMode.enabled) {
          continue;
        }
        const uriString = customMode.uri.toString();
        seenUris.add(uriString);
        let modeInstance = this._customModeInstances.get(uriString);
        if (modeInstance) {
          if (modeInstance.updateData(customMode)) {
            hasChanges = true;
          }
        } else {
          modeInstance = new CustomChatMode(customMode);
          this._customModeInstances.set(uriString, modeInstance);
          hasChanges = true;
        }
      }
      for (const [uriString] of this._customModeInstances.entries()) {
        if (!seenUris.has(uriString)) {
          this._customModeInstances.delete(uriString);
          hasChanges = true;
        }
      }
      this.hasCustomModes.set(this._customModeInstances.size > 0);
    } catch (error) {
      if (isCancellationError(error)) {
        return;
      }
      this.logService.error(error, "Failed to load custom agents");
      this._customModeInstances.clear();
      this.hasCustomModes.set(false);
      hasChanges = true;
    }
    if (hasChanges) {
      this._onDidChange.fire();
    }
  }
  getBuiltinModes() {
    const builtinModes = [
      ChatMode.Ask
    ];
    if (this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy()) {
      builtinModes.unshift(ChatMode.Agent);
    }
    builtinModes.push(ChatMode.Edit);
    return builtinModes;
  }
  getCustomModes() {
    return this.chatAgentService.hasToolsAgent || this.isAgentModeDisabledByPolicy() ? Array.from(this._customModeInstances.values()) : [];
  }
  isAgentModeDisabledByPolicy() {
    return this.configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
  }
};
ChatModes.CUSTOM_MODES_STORAGE_KEY_PREFIX = "chat.customModes.";
ChatModes = __decorateClass([
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ICustomizationHarnessService)
], ChatModes);
let ChatModeService = class extends Disposable {
  constructor(instantiationService, contextKeyService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.agentModeDisabledByPolicy = ChatContextKeys.Modes.agentModeDisabledByPolicy.bindTo(contextKeyService);
    this.updateAgentModePolicyContextKey();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentEnabled)) {
        this.updateAgentModePolicyContextKey();
      }
    }));
  }
  createModes(sessionResource) {
    return this.instantiationService.createInstance(ChatModes, sessionResource);
  }
  async getLocalModes() {
    if (!this.localMode) {
      this.localMode = (async () => {
        const modes = this._register(this.createModes(LocalChatSessionUri.getNewSessionUri()));
        await modes.waitForPendingUpdates();
        return modes;
      })();
    }
    return this.localMode;
  }
  updateAgentModePolicyContextKey() {
    this.agentModeDisabledByPolicy.set(this.isAgentModeDisabledByPolicy());
  }
  isAgentModeDisabledByPolicy() {
    return this.configurationService.inspect(ChatConfiguration.AgentEnabled).policyValue === false;
  }
};
ChatModeService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService)
], ChatModeService);
var IChatModeInstructions;
((IChatModeInstructions2) => {
  function isEquals(a, b) {
    if (a === b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.content === b.content && objectEquals(a.toolReferences, b.toolReferences) && objectEquals(a.metadata, b.metadata);
  }
  IChatModeInstructions2.isEquals = isEquals;
})(IChatModeInstructions || (IChatModeInstructions = {}));
function isCachedChatModeData(data) {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const mode = data;
  return typeof mode.id === "string" && typeof mode.name === "string" && typeof mode.kind === "string" && (mode.description === void 0 || typeof mode.description === "string") && (mode.customTools === void 0 || Array.isArray(mode.customTools)) && (mode.modeInstructions === void 0 || typeof mode.modeInstructions === "object" && mode.modeInstructions !== null) && (mode.model === void 0 || typeof mode.model === "string" || Array.isArray(mode.model)) && (mode.argumentHint === void 0 || typeof mode.argumentHint === "string") && (mode.handOffs === void 0 || Array.isArray(mode.handOffs)) && (mode.uri === void 0 || typeof mode.uri === "object" && mode.uri !== null) && (mode.source === void 0 || isChatModeSourceData(mode.source)) && (mode.target === void 0 || isTarget(mode.target)) && (mode.visibility === void 0 || isCustomAgentVisibility(mode.visibility)) && (mode.agents === void 0 || Array.isArray(mode.agents)) && (mode.sessionTypes === void 0 || Array.isArray(mode.sessionTypes));
}
class CustomChatMode {
  constructor(customChatMode) {
    this.kind = ChatModeKind.Agent;
    this.id = customChatMode.uri.toString();
    this._nameObservable = observableValue("name", customChatMode.name);
    this._descriptionObservable = observableValue("description", customChatMode.description);
    this._customToolsObservable = observableValue("customTools", customChatMode.tools);
    this._modelObservable = observableValue("model", customChatMode.model);
    this._argumentHintObservable = observableValue("argumentHint", customChatMode.argumentHint);
    this._handoffsObservable = observableValue("handOffs", customChatMode.handOffs);
    this._targetObservable = observableValue("target", customChatMode.target);
    this._visibilityObservable = observableValue("visibility", customChatMode.visibility);
    this._agentsObservable = observableValue("agents", customChatMode.agents);
    this._modeInstructions = observableValue("_modeInstructions", customChatMode.agentInstructions);
    this._uriObservable = observableValue("uri", customChatMode.uri);
    this._source = customChatMode.source;
    this._sessionTypes = customChatMode.sessionTypes;
  }
  get name() {
    return this._nameObservable;
  }
  get description() {
    return this._descriptionObservable;
  }
  get icon() {
    return constObservable(void 0);
  }
  get isBuiltin() {
    return isBuiltinChatMode(this);
  }
  get customTools() {
    return this._customToolsObservable;
  }
  get model() {
    return this._modelObservable;
  }
  get argumentHint() {
    return this._argumentHintObservable;
  }
  get modeInstructions() {
    return this._modeInstructions;
  }
  get uri() {
    return this._uriObservable;
  }
  get label() {
    return this.name;
  }
  get handOffs() {
    return this._handoffsObservable;
  }
  get source() {
    return this._source;
  }
  get target() {
    return this._targetObservable;
  }
  get visibility() {
    return this._visibilityObservable;
  }
  get agents() {
    return this._agentsObservable;
  }
  get sessionTypes() {
    return this._sessionTypes;
  }
  /**
   * Updates the underlying data and triggers observable changes
   */
  updateData(newData) {
    let hasChanges = false;
    transaction((tx) => {
      const update = (observable, newValue, equals = (a, b) => a === b) => {
        if (!equals(observable.get(), newValue)) {
          observable.set(newValue, tx);
          hasChanges = true;
        }
      };
      update(this._nameObservable, newData.name);
      update(this._descriptionObservable, newData.description);
      update(this._customToolsObservable, newData.tools, arraysEqual);
      update(this._modelObservable, newData.model, arraysEqual);
      update(this._argumentHintObservable, newData.argumentHint);
      update(this._modeInstructions, newData.agentInstructions, IChatModeInstructions.isEquals);
      update(this._uriObservable, newData.uri, isURLEquals);
      update(this._handoffsObservable, newData.handOffs, objectEquals);
      update(this._targetObservable, newData.target);
      update(this._visibilityObservable, newData.visibility, objectEquals);
      update(this._agentsObservable, newData.agents, arraysEqual);
      if (!IAgentSource.isEquals(this._source, newData.source)) {
        this._source = newData.source;
        hasChanges = true;
      }
      if (!arraysEqual(this._sessionTypes, newData.sessionTypes)) {
        this._sessionTypes = newData.sessionTypes;
        hasChanges = true;
      }
    });
    return hasChanges;
  }
  toJSON() {
    return {
      id: this.id,
      name: this.name.get(),
      description: this.description.get(),
      kind: this.kind,
      customTools: this.customTools.get(),
      model: this.model.get(),
      argumentHint: this.argumentHint.get(),
      modeInstructions: this.modeInstructions.get(),
      uri: this.uri.get(),
      handOffs: this.handOffs.get(),
      source: serializeChatModeSource(this._source),
      target: this.target.get(),
      visibility: this.visibility.get(),
      agents: this.agents.get(),
      sessionTypes: this.sessionTypes
    };
  }
}
function isChatModeSourceData(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const data = value;
  if (data.storage === PromptsStorage.extension) {
    return typeof data.extensionId === "string";
  }
  if (data.storage === PromptsStorage.plugin) {
    return isUriComponents(data.pluginUri);
  }
  return data.storage === PromptsStorage.local || data.storage === PromptsStorage.user || data.storage === PromptsStorage.builtIn;
}
function serializeChatModeSource(source) {
  if (!source) {
    return void 0;
  }
  if (source.storage === PromptsStorage.extension) {
    return { storage: PromptsStorage.extension, extensionId: source.extensionId.value };
  }
  if (source.storage === PromptsStorage.plugin) {
    return { storage: PromptsStorage.plugin, pluginUri: source.pluginUri };
  }
  return { storage: source.storage };
}
function reviveChatModeSource(data) {
  if (!data) {
    return void 0;
  }
  if (data.storage === PromptsStorage.extension) {
    return { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(data.extensionId) };
  }
  if (data.storage === PromptsStorage.plugin) {
    return { storage: PromptsStorage.plugin, pluginUri: URI.revive(data.pluginUri) };
  }
  return { storage: data.storage };
}
class BuiltinChatMode {
  constructor(kind, label, description, icon) {
    this.kind = kind;
    this.name = constObservable(kind);
    this.label = constObservable(label);
    this.description = observableValue("description", description);
    this.icon = constObservable(icon);
    this.target = constObservable(Target.Undefined);
  }
  get isBuiltin() {
    return isBuiltinChatMode(this);
  }
  get id() {
    return this.kind;
  }
  /**
   * Getters are not json-stringified
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name.get(),
      description: this.description.get(),
      kind: this.kind
    };
  }
}
var ChatMode;
((ChatMode2) => {
  ChatMode2.Ask = new BuiltinChatMode(ChatModeKind.Ask, "Ask", localize("chatDescription", "Explore and understand your code"), Codicon.question);
  ChatMode2.Edit = new BuiltinChatMode(ChatModeKind.Edit, "Edit", localize("editsDescription", "Edit or refactor selected code"), Codicon.edit);
  ChatMode2.Agent = new BuiltinChatMode(ChatModeKind.Agent, "Agent", localize("agentDescription", "Describe what to build"), Codicon.agent);
})(ChatMode || (ChatMode = {}));
function isBuiltinChatMode(mode) {
  return mode.id === ChatMode.Ask.id || mode.id === ChatMode.Edit.id || mode.id === ChatMode.Agent.id;
}
function getModeNameForTelemetry(mode) {
  const modeStorage = mode.source?.storage;
  if (modeStorage === PromptsStorage.local || modeStorage === PromptsStorage.user) {
    return String(hash(mode.name.get()));
  }
  return mode.name.get();
}
function getHandoffId(handoff) {
  const slug = handoff.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${handoff.agent}:${slug}`;
}
function buildCustomAgentHandoffsInfo(modes) {
  return modes.map((mode) => {
    const handoffs = mode.handOffs?.get() ?? [];
    const visibility = mode.visibility?.get();
    return {
      id: mode.id,
      name: mode.name.get(),
      isBuiltin: mode.isBuiltin,
      visibility: {
        userInvocable: visibility?.userInvocable ?? true,
        agentInvocable: visibility?.agentInvocable ?? true
      },
      handoffs: handoffs.map((h) => ({
        id: getHandoffId(h),
        label: h.label,
        agent: h.agent,
        prompt: h.prompt,
        ...h.send !== void 0 ? { send: h.send } : {},
        ...h.showContinueOn !== void 0 ? { showContinueOn: h.showContinueOn } : {},
        ...h.model !== void 0 ? { model: h.model } : {}
      }))
    };
  });
}
export {
  BuiltinChatMode,
  ChatMode,
  ChatModeService,
  CustomChatMode,
  IChatModeInstructions,
  IChatModeService,
  buildCustomAgentHandoffsInfo,
  getHandoffId,
  getModeNameForTelemetry,
  isBuiltinChatMode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRNb2Rlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzVXJpQ29tcG9uZW50cywgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJSGFuZE9mZiB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50U291cmNlLCBJQ3VzdG9tQWdlbnQsIElDdXN0b21BZ2VudFZpc2liaWxpdHksIGlzQ3VzdG9tQWdlbnRWaXNpYmlsaXR5LCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVTb3VyY2UsIFRhcmdldCB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgaGFzaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBpc1RhcmdldCB9IGZyb20gJy4vcHJvbXB0U3ludGF4L2xhbmd1YWdlUHJvdmlkZXJzL3Byb21wdEZpbGVBdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IGVxdWFscyBhcyBhcnJheXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIGFzIGlzVVJMRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGVxdWFscyBhcyBvYmplY3RFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcblxuXG5leHBvcnQgY29uc3QgSUNoYXRNb2RlU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ2hhdE1vZGVTZXJ2aWNlPignY2hhdE1vZGVTZXJ2aWNlJyk7XG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TW9kZVNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGNoYXQgbW9kZXMgYXZhaWxhYmxlIGZvciB0aGUgZ2l2ZW4gc2Vzc2lvbiByZXNvdXJjZS5cblx0ICpcblx0ICogSW5zdGFuY2VzIG5lZWQgdG8gYmUgZGlzcG9zZWQgYnkgdGhlIGNhbGxlciB3aGVuIG5vIGxvbmdlciBuZWVkZWRcblx0ICovXG5cdGNyZWF0ZU1vZGVzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUNoYXRNb2RlcyAmIElEaXNwb3NhYmxlO1xuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBsb2NhbCBjaGF0IG1vZGVzIGFmdGVyIGF3YWl0aW5nIGFueSBpbi1mbGlnaHQgcmVmcmVzaC5cblx0ICovXG5cdGdldExvY2FsTW9kZXMoKTogUHJvbWlzZTxJQ2hhdE1vZGVzPjtcbn1cblxuLyoqXG4gKiBUaGUgc2V0IG9mIGNoYXQgbW9kZXMgYXZhaWxhYmxlIGZvciBhIHBhcnRpY3VsYXIgc2Vzc2lvbiB0eXBlLCBwYXJ0aXRpb25lZFxuICogaW50byBidWlsdGluIGFuZCBjdXN0b20gbW9kZXMsIHdpdGggaGVscGVycyBmb3IgbG9va3VwIGJ5IGlkIG9yIG5hbWUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRNb2RlcyB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgYnVpbHRpbjogcmVhZG9ubHkgSUNoYXRNb2RlW107XG5cdHJlYWRvbmx5IGN1c3RvbTogcmVhZG9ubHkgSUNoYXRNb2RlW107XG5cdGZpbmRNb2RlQnlJZChpZDogc3RyaW5nKTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkO1xuXHRmaW5kTW9kZUJ5TmFtZShuYW1lOiBzdHJpbmcpOiBJQ2hhdE1vZGUgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEF3YWl0cyB0aGUgbW9zdCByZWNlbnRseSBzY2hlZHVsZWQgdXBkYXRlIG9mIGN1c3RvbSBwcm9tcHQgbW9kZXMuXG5cdCAqIEFmdGVyIHRoaXMgcmVzb2x2ZXMsIHtAbGluayBjdXN0b219IHJlZmxlY3RzIHRoZSBsYXRlc3QgZGF0YSBmcm9tIHRoZVxuXHQgKiBwcm9tcHRzIHNlcnZpY2UuXG5cdCAqL1xuXHR3YWl0Rm9yUGVuZGluZ1VwZGF0ZXMoKTogUHJvbWlzZTx2b2lkPjtcbn1cblxuY2xhc3MgQ2hhdE1vZGVzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0TW9kZXMge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENVU1RPTV9NT0RFU19TVE9SQUdFX0tFWV9QUkVGSVggPSAnY2hhdC5jdXN0b21Nb2Rlcy4nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaGFzQ3VzdG9tTW9kZXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21Nb2RlSW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIEN1c3RvbUNoYXRNb2RlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlS2V5OiBzdHJpbmc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHQvKiogVHJhY2tzIHRoZSBtb3N0IHJlY2VudCByZWZyZXNoIG9mIGN1c3RvbSBwcm9tcHQgbW9kZXMuICovXG5cdHByaXZhdGUgX3BlbmRpbmdSZWZyZXNoOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0cHJpdmF0ZSBfcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlZnJlc2hUaHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigxMDApKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHR0aGlzLl9zdG9yYWdlS2V5ID0gQ2hhdE1vZGVzLkNVU1RPTV9NT0RFU19TVE9SQUdFX0tFWV9QUkVGSVggKyBzZXNzaW9uVHlwZTtcblx0XHR0aGlzLmhhc0N1c3RvbU1vZGVzID0gQ2hhdENvbnRleHRLZXlzLk1vZGVzLmhhc0N1c3RvbUNoYXRNb2Rlcy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gTG9hZCBjYWNoZWQgbW9kZXMgZnJvbSBzdG9yYWdlIGZpcnN0XG5cdFx0dGhpcy5sb2FkQ2FjaGVkTW9kZXMoKTtcblxuXHRcdHRoaXMuX3BlbmRpbmdSZWZyZXNoID0gdGhpcy50cmlnZ2VyUmVmcmVzaCgpO1xuXHRcdC8vIFdoZW4gdGhlIGhhcm5lc3Mgc2VydmljZSBpcyB0aGUgc291cmNlLCBhbHNvIHJlYWN0IHRvIGl0cyBjaGFuZ2UgZXZlbnRzIGZvciBvdXIgc2Vzc2lvbiB0eXBlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2Vzc2lvblR5cGUgPT09IHNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZWZyZXNoID0gdGhpcy50cmlnZ2VyUmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uV2lsbFNhdmVTdGF0ZSgoKSA9PiB0aGlzLnNhdmVDYWNoZWRNb2RlcygpKSk7XG5cblx0XHQvLyBCdWlsdGluIG1vZGUgYXZhaWxhYmlsaXR5IGRlcGVuZHMgb24gY29uZmlndXJhdGlvbiBwb2xpY3kgYW5kIHRvb2xzLWFnZW50IGF2YWlsYWJpbGl0eS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRsZXQgZGlkSGF2ZVRvb2xzQWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuaGFzVG9vbHNBZ2VudDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRBZ2VudFNlcnZpY2Uub25EaWRDaGFuZ2VBZ2VudHMoKCkgPT4ge1xuXHRcdFx0aWYgKGRpZEhhdmVUb29sc0FnZW50ICE9PSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuaGFzVG9vbHNBZ2VudCkge1xuXHRcdFx0XHRkaWRIYXZlVG9vbHNBZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5oYXNUb29sc0FnZW50O1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0IGJ1aWx0aW4oKTogcmVhZG9ubHkgSUNoYXRNb2RlW10ge1xuXHRcdHJldHVybiB0aGlzLmdldEJ1aWx0aW5Nb2RlcygpO1xuXHR9XG5cblx0Z2V0IGN1c3RvbSgpOiByZWFkb25seSBJQ2hhdE1vZGVbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q3VzdG9tTW9kZXMoKTtcblx0fVxuXG5cdGZpbmRNb2RlQnlJZChpZDogc3RyaW5nIHwgQ2hhdE1vZGVLaW5kKTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRCdWlsdGluTW9kZXMoKS5maW5kKG1vZGUgPT4gbW9kZS5pZCA9PT0gaWQpID8/IHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMuZ2V0KGlkKTtcblx0fVxuXG5cdGZpbmRNb2RlQnlOYW1lKG5hbWU6IHN0cmluZyk6IElDaGF0TW9kZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0QnVpbHRpbk1vZGVzKCkuZmluZChtb2RlID0+IG1vZGUubmFtZS5nZXQoKSA9PT0gbmFtZSkgPz8gdGhpcy5nZXRDdXN0b21Nb2RlcygpLmZpbmQobW9kZSA9PiBtb2RlLm5hbWUuZ2V0KCkgPT09IG5hbWUgfHwgbW9kZS5pZCA9PT0gbmFtZSk7XG5cdH1cblxuXHR3YWl0Rm9yUGVuZGluZ1VwZGF0ZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdSZWZyZXNoO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkQ2FjaGVkTW9kZXMoKTogdm9pZCB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhY2hlZEN1c3RvbU1vZGVzID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3QodGhpcy5fc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRpZiAoY2FjaGVkQ3VzdG9tTW9kZXMpIHtcblx0XHRcdFx0dGhpcy5kZXNlcmlhbGl6ZUNhY2hlZE1vZGVzKGNhY2hlZEN1c3RvbU1vZGVzKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCAnRmFpbGVkIHRvIGxvYWQgY2FjaGVkIGN1c3RvbSBhZ2VudHMnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlc2VyaWFsaXplQ2FjaGVkTW9kZXMoY2FjaGVkQ3VzdG9tTW9kZXM6IHVua25vd24pOiB2b2lkIHtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoY2FjaGVkQ3VzdG9tTW9kZXMpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ludmFsaWQgY2FjaGVkIGN1c3RvbSBtb2RlcyBkYXRhOiBleHBlY3RlZCBhcnJheScpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY2FjaGVkTW9kZSBvZiBjYWNoZWRDdXN0b21Nb2Rlcykge1xuXHRcdFx0aWYgKGlzQ2FjaGVkQ2hhdE1vZGVEYXRhKGNhY2hlZE1vZGUpICYmIGNhY2hlZE1vZGUudXJpKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgdmlzaWJpbGl0eSA9IGNhY2hlZE1vZGUudmlzaWJpbGl0eSA/PyB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiBjYWNoZWRNb2RlLmluZmVyICE9PSBmYWxzZSB9O1xuXHRcdFx0XHRcdGlmICghdmlzaWJpbGl0eS51c2VySW52b2NhYmxlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZShjYWNoZWRNb2RlLnVyaSk7XG5cdFx0XHRcdFx0Y29uc3QgY3VzdG9tQ2hhdE1vZGU6IElDdXN0b21BZ2VudCA9IHtcblx0XHRcdFx0XHRcdGlkOiBjYWNoZWRNb2RlLmlkLFxuXHRcdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdFx0bmFtZTogY2FjaGVkTW9kZS5uYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGNhY2hlZE1vZGUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHR0b29sczogY2FjaGVkTW9kZS5jdXN0b21Ub29scyxcblx0XHRcdFx0XHRcdG1vZGVsOiBpc1N0cmluZyhjYWNoZWRNb2RlLm1vZGVsKSA/IFtjYWNoZWRNb2RlLm1vZGVsXSA6IGNhY2hlZE1vZGUubW9kZWwsXG5cdFx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IGNhY2hlZE1vZGUuYXJndW1lbnRIaW50LFxuXHRcdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IGNhY2hlZE1vZGUubW9kZUluc3RydWN0aW9ucyA/PyB7IGNvbnRlbnQ6IGNhY2hlZE1vZGUuYm9keSA/PyAnJywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdFx0XHRoYW5kT2ZmczogY2FjaGVkTW9kZS5oYW5kT2Zmcyxcblx0XHRcdFx0XHRcdHRhcmdldDogY2FjaGVkTW9kZS50YXJnZXQgPz8gVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHZpc2liaWxpdHksXG5cdFx0XHRcdFx0XHRhZ2VudHM6IGNhY2hlZE1vZGUuYWdlbnRzLFxuXHRcdFx0XHRcdFx0c2Vzc2lvblR5cGVzOiBjYWNoZWRNb2RlLnNlc3Npb25UeXBlcyxcblx0XHRcdFx0XHRcdHNvdXJjZTogcmV2aXZlQ2hhdE1vZGVTb3VyY2UoY2FjaGVkTW9kZS5zb3VyY2UpID8/IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdFx0XHRcdGVuYWJsZWQ6IHRydWVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gbmV3IEN1c3RvbUNoYXRNb2RlKGN1c3RvbUNoYXRNb2RlKTtcblx0XHRcdFx0XHR0aGlzLl9jdXN0b21Nb2RlSW5zdGFuY2VzLnNldCh1cmkudG9TdHJpbmcoKSwgaW5zdGFuY2UpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvciwgJ0ZhaWxlZCB0byByZXZpdmUgY2FjaGVkIGN1c3RvbSBhZ2VudCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5oYXNDdXN0b21Nb2Rlcy5zZXQodGhpcy5fY3VzdG9tTW9kZUluc3RhbmNlcy5zaXplID4gMCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVDYWNoZWRNb2RlcygpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbW9kZXNUb0NhY2hlID0gQXJyYXkuZnJvbSh0aGlzLl9jdXN0b21Nb2RlSW5zdGFuY2VzLnZhbHVlcygpKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5fc3RvcmFnZUtleSwgbW9kZXNUb0NhY2hlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignRmFpbGVkIHRvIHNhdmUgY2FjaGVkIGN1c3RvbSBhZ2VudHMnLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cmlnZ2VyUmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlPy5kaXNwb3NlKCk7XG5cdFx0Y29uc3QgcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZSA9IHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRyZXR1cm4gdGhpcy5fcmVmcmVzaFRocm90dGxlci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaEN1c3RvbVByb21wdE1vZGVzKHJlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UudG9rZW4pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKHRoaXMuX3JlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UgPT09IHJlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlZnJlc2hDYW5jZWxsYXRpb25Tb3VyY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9yZWZyZXNoQ2FuY2VsbGF0aW9uU291cmNlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmVmcmVzaENhbmNlbGxhdGlvblNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hDdXN0b21Qcm9tcHRNb2Rlcyh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgaGFzQ2hhbmdlcyA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VzdG9tTW9kZXMgPSBhd2FpdCB0aGlzLmN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5nZXRDdXN0b21BZ2VudHModGhpcy5zZXNzaW9uUmVzb3VyY2UsIHRva2VuKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENyZWF0ZSBhIG5ldyBzZXQgb2YgbW9kZSBpbnN0YW5jZXMsIHJldXNpbmcgZXhpc3Rpbmcgb25lcyB3aGVyZSBwb3NzaWJsZVxuXHRcdFx0Y29uc3Qgc2VlblVyaXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgY3VzdG9tTW9kZSBvZiBjdXN0b21Nb2Rlcykge1xuXHRcdFx0XHRpZiAoIWN1c3RvbU1vZGUudmlzaWJpbGl0eS51c2VySW52b2NhYmxlIHx8ICFjdXN0b21Nb2RlLmVuYWJsZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHVyaVN0cmluZyA9IGN1c3RvbU1vZGUudXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdHNlZW5VcmlzLmFkZCh1cmlTdHJpbmcpO1xuXG5cdFx0XHRcdGxldCBtb2RlSW5zdGFuY2UgPSB0aGlzLl9jdXN0b21Nb2RlSW5zdGFuY2VzLmdldCh1cmlTdHJpbmcpO1xuXHRcdFx0XHRpZiAobW9kZUluc3RhbmNlKSB7XG5cdFx0XHRcdFx0Ly8gVXBkYXRlIGV4aXN0aW5nIGluc3RhbmNlIHdpdGggbmV3IGRhdGFcblx0XHRcdFx0XHRpZiAobW9kZUluc3RhbmNlLnVwZGF0ZURhdGEoY3VzdG9tTW9kZSkpIHtcblx0XHRcdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBDcmVhdGUgbmV3IGluc3RhbmNlXG5cdFx0XHRcdFx0bW9kZUluc3RhbmNlID0gbmV3IEN1c3RvbUNoYXRNb2RlKGN1c3RvbU1vZGUpO1xuXHRcdFx0XHRcdHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMuc2V0KHVyaVN0cmluZywgbW9kZUluc3RhbmNlKTtcblx0XHRcdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDbGVhbiB1cCBpbnN0YW5jZXMgZm9yIG1vZGVzIHRoYXQgbm8gbG9uZ2VyIGV4aXN0XG5cdFx0XHRmb3IgKGNvbnN0IFt1cmlTdHJpbmddIG9mIHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMuZW50cmllcygpKSB7XG5cdFx0XHRcdGlmICghc2VlblVyaXMuaGFzKHVyaVN0cmluZykpIHtcblx0XHRcdFx0XHR0aGlzLl9jdXN0b21Nb2RlSW5zdGFuY2VzLmRlbGV0ZSh1cmlTdHJpbmcpO1xuXHRcdFx0XHRcdGhhc0NoYW5nZXMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaGFzQ3VzdG9tTW9kZXMuc2V0KHRoaXMuX2N1c3RvbU1vZGVJbnN0YW5jZXMuc2l6ZSA+IDApO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnJvcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCAnRmFpbGVkIHRvIGxvYWQgY3VzdG9tIGFnZW50cycpO1xuXHRcdFx0dGhpcy5fY3VzdG9tTW9kZUluc3RhbmNlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5oYXNDdXN0b21Nb2Rlcy5zZXQoZmFsc2UpO1xuXHRcdFx0aGFzQ2hhbmdlcyA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChoYXNDaGFuZ2VzKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRCdWlsdGluTW9kZXMoKTogSUNoYXRNb2RlW10ge1xuXHRcdGNvbnN0IGJ1aWx0aW5Nb2RlczogSUNoYXRNb2RlW10gPSBbXG5cdFx0XHRDaGF0TW9kZS5Bc2ssXG5cdFx0XTtcblxuXHRcdC8vIEluY2x1ZGUgQWdlbnQgbW9kZSBpZjpcblx0XHQvLyAtIEl0J3MgZW5hYmxlZCAoaGFzVG9vbHNBZ2VudCBpcyB0cnVlKSwgT1Jcblx0XHQvLyAtIEl0J3MgZGlzYWJsZWQgYnkgcG9saWN5IChzbyB3ZSBjYW4gc2hvdyBpdCB3aXRoIGEgbG9jayBpY29uKVxuXHRcdC8vIEJ1dCBoaWRlIGl0IGlmIHRoZSB1c2VyIG1hbnVhbGx5IGRpc2FibGVkIGl0IHZpYSBzZXR0aW5nc1xuXHRcdGlmICh0aGlzLmNoYXRBZ2VudFNlcnZpY2UuaGFzVG9vbHNBZ2VudCB8fCB0aGlzLmlzQWdlbnRNb2RlRGlzYWJsZWRCeVBvbGljeSgpKSB7XG5cdFx0XHRidWlsdGluTW9kZXMudW5zaGlmdChDaGF0TW9kZS5BZ2VudCk7XG5cdFx0fVxuXHRcdGJ1aWx0aW5Nb2Rlcy5wdXNoKENoYXRNb2RlLkVkaXQpO1xuXHRcdHJldHVybiBidWlsdGluTW9kZXM7XG5cdH1cblxuXHRwcml2YXRlIGdldEN1c3RvbU1vZGVzKCk6IElDaGF0TW9kZVtdIHtcblx0XHQvLyBTaG93IGN1c3RvbSBtb2RlcyB3aGVuIGFnZW50IG1vZGUgaXMgZW5hYmxlZCBPUiB3aGVuIGRpc2FibGVkIGJ5IHBvbGljeSAodG8gc2hvdyB0aGVtIGluIHRoZSBwb2xpY3ktbWFuYWdlZCBncm91cClcblx0XHRyZXR1cm4gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmhhc1Rvb2xzQWdlbnQgfHwgdGhpcy5pc0FnZW50TW9kZURpc2FibGVkQnlQb2xpY3koKSA/IEFycmF5LmZyb20odGhpcy5fY3VzdG9tTW9kZUluc3RhbmNlcy52YWx1ZXMoKSkgOiBbXTtcblx0fVxuXG5cdHByaXZhdGUgaXNBZ2VudE1vZGVEaXNhYmxlZEJ5UG9saWN5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRNb2RlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdE1vZGVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhZ2VudE1vZGVEaXNhYmxlZEJ5UG9saWN5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsb2NhbE1vZGU6IFByb21pc2U8SUNoYXRNb2Rlcz4gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5hZ2VudE1vZGVEaXNhYmxlZEJ5UG9saWN5ID0gQ2hhdENvbnRleHRLZXlzLk1vZGVzLmFnZW50TW9kZURpc2FibGVkQnlQb2xpY3kuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdC8vIEluaXRpYWxpemUgdGhlIHBvbGljeSBjb250ZXh0IGtleVxuXHRcdHRoaXMudXBkYXRlQWdlbnRNb2RlUG9saWN5Q29udGV4dEtleSgpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBjb25maWd1cmF0aW9uIGNoYW5nZXMgdGhhdCBhZmZlY3QgYWdlbnQgbW9kZSBwb2xpY3lcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVBZ2VudE1vZGVQb2xpY3lDb250ZXh0S2V5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Y3JlYXRlTW9kZXMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdE1vZGVzICYgSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNb2Rlcywgc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGFzeW5jIGdldExvY2FsTW9kZXMoKTogUHJvbWlzZTxJQ2hhdE1vZGVzPiB7XG5cdFx0aWYgKCF0aGlzLmxvY2FsTW9kZSkge1xuXHRcdFx0dGhpcy5sb2NhbE1vZGUgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlcyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlTW9kZXMoTG9jYWxDaGF0U2Vzc2lvblVyaS5nZXROZXdTZXNzaW9uVXJpKCkpKTsgLy8gd2UgbWFrZSB1cCBhIG5ldyBzZXNzaW9uLiBMb2NhbCBtZGVzIGZhbGwgYmFjayB0byB0aGUgcHJvbXB0U2VydmljZSBhbmQgYXJlIG5vdCBhY3R1YWxseSB0aWVkIHRvIHRoZSBzZXNzaW9uLCBzbyBpdCBkb2Vzbid0IG1hdHRlciB3aGljaCBvbmUgd2UgdXNlIGhlcmUuXG5cdFx0XHRcdGF3YWl0IG1vZGVzLndhaXRGb3JQZW5kaW5nVXBkYXRlcygpO1xuXHRcdFx0XHRyZXR1cm4gbW9kZXM7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5sb2NhbE1vZGU7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFnZW50TW9kZVBvbGljeUNvbnRleHRLZXkoKTogdm9pZCB7XG5cdFx0dGhpcy5hZ2VudE1vZGVEaXNhYmxlZEJ5UG9saWN5LnNldCh0aGlzLmlzQWdlbnRNb2RlRGlzYWJsZWRCeVBvbGljeSgpKTtcblx0fVxuXG5cdHByaXZhdGUgaXNBZ2VudE1vZGVEaXNhYmxlZEJ5UG9saWN5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQWdlbnRFbmFibGVkKS5wb2xpY3lWYWx1ZSA9PT0gZmFsc2U7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1vZGVEYXRhIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkga2luZDogQ2hhdE1vZGVLaW5kO1xuXHRyZWFkb25seSBjdXN0b21Ub29scz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBtb2RlbD86IHJlYWRvbmx5IHN0cmluZ1tdIHwgc3RyaW5nO1xuXHRyZWFkb25seSBhcmd1bWVudEhpbnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1vZGVJbnN0cnVjdGlvbnM/OiBJQ2hhdE1vZGVJbnN0cnVjdGlvbnM7XG5cdHJlYWRvbmx5IGJvZHk/OiBzdHJpbmc7IC8qIGRlcHJlY2F0ZWQgKi9cblx0cmVhZG9ubHkgaGFuZE9mZnM/OiByZWFkb25seSBJSGFuZE9mZltdO1xuXHRyZWFkb25seSB1cmk/OiBVUkk7XG5cdHJlYWRvbmx5IHNvdXJjZT86IElDaGF0TW9kZVNvdXJjZURhdGE7XG5cdHJlYWRvbmx5IHRhcmdldD86IFRhcmdldDtcblx0cmVhZG9ubHkgdmlzaWJpbGl0eT86IElDdXN0b21BZ2VudFZpc2liaWxpdHk7XG5cdHJlYWRvbmx5IGFnZW50cz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzZXNzaW9uVHlwZXM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgaW5mZXI/OiBib29sZWFuOyAvLyBkZXByZWNhdGVkLCBvbmx5IGF2YWlsYWJsZSBpbiBvbGQgY2FjaGVkIGRhdGFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1vZGUge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRyZWFkb25seSBsYWJlbDogSU9ic2VydmFibGU8c3RyaW5nPjtcblx0cmVhZG9ubHkgaWNvbjogSU9ic2VydmFibGU8VGhlbWVJY29uIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGlzQnVpbHRpbjogYm9vbGVhbjtcblx0cmVhZG9ubHkga2luZDogQ2hhdE1vZGVLaW5kO1xuXHRyZWFkb25seSBjdXN0b21Ub29scz86IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgaGFuZE9mZnM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJSGFuZE9mZltdIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgbW9kZWw/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IGFyZ3VtZW50SGludD86IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG1vZGVJbnN0cnVjdGlvbnM/OiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGVJbnN0cnVjdGlvbnM+O1xuXHRyZWFkb25seSB1cmk/OiBJT2JzZXJ2YWJsZTxVUkk+O1xuXHRyZWFkb25seSBzb3VyY2U/OiBJQWdlbnRTb3VyY2U7XG5cdHJlYWRvbmx5IHRhcmdldDogSU9ic2VydmFibGU8VGFyZ2V0Pjtcblx0cmVhZG9ubHkgdmlzaWJpbGl0eT86IElPYnNlcnZhYmxlPElDdXN0b21BZ2VudFZpc2liaWxpdHkgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBhZ2VudHM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElWYXJpYWJsZVJlZmVyZW5jZSB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcmFuZ2U6IElPZmZzZXRSYW5nZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1vZGVJbnN0cnVjdGlvbnMge1xuXHRyZWFkb25seSBjb250ZW50OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xSZWZlcmVuY2VzOiByZWFkb25seSBJVmFyaWFibGVSZWZlcmVuY2VbXTtcblx0cmVhZG9ubHkgbWV0YWRhdGE/OiBSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgc3RyaW5nIHwgbnVtYmVyPjtcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBJQ2hhdE1vZGVJbnN0cnVjdGlvbnMge1xuXHRleHBvcnQgZnVuY3Rpb24gaXNFcXVhbHMoYTogSUNoYXRNb2RlSW5zdHJ1Y3Rpb25zIHwgdW5kZWZpbmVkLCBiOiBJQ2hhdE1vZGVJbnN0cnVjdGlvbnMgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYSA9PT0gYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICghYSB8fCAhYikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5jb250ZW50ID09PSBiLmNvbnRlbnQgJiZcblx0XHRcdG9iamVjdEVxdWFscyhhLnRvb2xSZWZlcmVuY2VzLCBiLnRvb2xSZWZlcmVuY2VzKSAmJlxuXHRcdFx0b2JqZWN0RXF1YWxzKGEubWV0YWRhdGEsIGIubWV0YWRhdGEpO1xuXHR9XG5cbn1cblxuZnVuY3Rpb24gaXNDYWNoZWRDaGF0TW9kZURhdGEoZGF0YTogdW5rbm93bik6IGRhdGEgaXMgSUNoYXRNb2RlRGF0YSB7XG5cdGlmICh0eXBlb2YgZGF0YSAhPT0gJ29iamVjdCcgfHwgZGF0YSA9PT0gbnVsbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IG1vZGUgPSBkYXRhIGFzIElDaGF0TW9kZURhdGE7XG5cdHJldHVybiB0eXBlb2YgbW9kZS5pZCA9PT0gJ3N0cmluZycgJiZcblx0XHR0eXBlb2YgbW9kZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuXHRcdHR5cGVvZiBtb2RlLmtpbmQgPT09ICdzdHJpbmcnICYmXG5cdFx0KG1vZGUuZGVzY3JpcHRpb24gPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgbW9kZS5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycpICYmXG5cdFx0KG1vZGUuY3VzdG9tVG9vbHMgPT09IHVuZGVmaW5lZCB8fCBBcnJheS5pc0FycmF5KG1vZGUuY3VzdG9tVG9vbHMpKSAmJlxuXHRcdChtb2RlLm1vZGVJbnN0cnVjdGlvbnMgPT09IHVuZGVmaW5lZCB8fCAodHlwZW9mIG1vZGUubW9kZUluc3RydWN0aW9ucyA9PT0gJ29iamVjdCcgJiYgbW9kZS5tb2RlSW5zdHJ1Y3Rpb25zICE9PSBudWxsKSkgJiZcblx0XHQobW9kZS5tb2RlbCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBtb2RlLm1vZGVsID09PSAnc3RyaW5nJyB8fCBBcnJheS5pc0FycmF5KG1vZGUubW9kZWwpKSAmJlxuXHRcdChtb2RlLmFyZ3VtZW50SGludCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiBtb2RlLmFyZ3VtZW50SGludCA9PT0gJ3N0cmluZycpICYmXG5cdFx0KG1vZGUuaGFuZE9mZnMgPT09IHVuZGVmaW5lZCB8fCBBcnJheS5pc0FycmF5KG1vZGUuaGFuZE9mZnMpKSAmJlxuXHRcdChtb2RlLnVyaSA9PT0gdW5kZWZpbmVkIHx8ICh0eXBlb2YgbW9kZS51cmkgPT09ICdvYmplY3QnICYmIG1vZGUudXJpICE9PSBudWxsKSkgJiZcblx0XHQobW9kZS5zb3VyY2UgPT09IHVuZGVmaW5lZCB8fCBpc0NoYXRNb2RlU291cmNlRGF0YShtb2RlLnNvdXJjZSkpICYmXG5cdFx0KG1vZGUudGFyZ2V0ID09PSB1bmRlZmluZWQgfHwgaXNUYXJnZXQobW9kZS50YXJnZXQpKSAmJlxuXHRcdChtb2RlLnZpc2liaWxpdHkgPT09IHVuZGVmaW5lZCB8fCBpc0N1c3RvbUFnZW50VmlzaWJpbGl0eShtb2RlLnZpc2liaWxpdHkpKSAmJlxuXHRcdChtb2RlLmFnZW50cyA9PT0gdW5kZWZpbmVkIHx8IEFycmF5LmlzQXJyYXkobW9kZS5hZ2VudHMpKSAmJlxuXHRcdChtb2RlLnNlc3Npb25UeXBlcyA9PT0gdW5kZWZpbmVkIHx8IEFycmF5LmlzQXJyYXkobW9kZS5zZXNzaW9uVHlwZXMpKTtcbn1cblxuZXhwb3J0IGNsYXNzIEN1c3RvbUNoYXRNb2RlIGltcGxlbWVudHMgSUNoYXRNb2RlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbmFtZU9ic2VydmFibGU6IElTZXR0YWJsZU9ic2VydmFibGU8c3RyaW5nPjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVzY3JpcHRpb25PYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbVRvb2xzT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVJbnN0cnVjdGlvbnM6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXRNb2RlSW5zdHJ1Y3Rpb25zPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdXJpT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxVUkk+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbE9ic2VydmFibGU6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcmd1bWVudEhpbnRPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhbmRvZmZzT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJSGFuZE9mZltdIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0T2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxUYXJnZXQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmlsaXR5T2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQ3VzdG9tQWdlbnRWaXNpYmlsaXR5IHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSByZWFkb25seSBfYWdlbnRzT2JzZXJ2YWJsZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgX3NvdXJjZTogSUFnZW50U291cmNlO1xuXHRwcml2YXRlIF9zZXNzaW9uVHlwZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXG5cdGdldCBuYW1lKCk6IElPYnNlcnZhYmxlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9uYW1lT2JzZXJ2YWJsZTtcblx0fVxuXG5cdGdldCBkZXNjcmlwdGlvbigpOiBJT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGVzY3JpcHRpb25PYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IGljb24oKTogSU9ic2VydmFibGU8VGhlbWVJY29uIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBpc0J1aWx0aW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzQnVpbHRpbkNoYXRNb2RlKHRoaXMpO1xuXHR9XG5cblx0Z2V0IGN1c3RvbVRvb2xzKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbVRvb2xzT2JzZXJ2YWJsZTtcblx0fVxuXG5cdGdldCBtb2RlbCgpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbE9ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgYXJndW1lbnRIaW50KCk6IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9hcmd1bWVudEhpbnRPYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IG1vZGVJbnN0cnVjdGlvbnMoKTogSU9ic2VydmFibGU8SUNoYXRNb2RlSW5zdHJ1Y3Rpb25zPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVJbnN0cnVjdGlvbnM7XG5cdH1cblxuXHRnZXQgdXJpKCk6IElPYnNlcnZhYmxlPFVSST4ge1xuXHRcdHJldHVybiB0aGlzLl91cmlPYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IGxhYmVsKCk6IElPYnNlcnZhYmxlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLm5hbWU7XG5cdH1cblxuXHRnZXQgaGFuZE9mZnMoKTogSU9ic2VydmFibGU8cmVhZG9ubHkgSUhhbmRPZmZbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9oYW5kb2Zmc09ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgc291cmNlKCk6IElBZ2VudFNvdXJjZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZTtcblx0fVxuXG5cdGdldCB0YXJnZXQoKTogSU9ic2VydmFibGU8VGFyZ2V0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RhcmdldE9ic2VydmFibGU7XG5cdH1cblxuXHRnZXQgdmlzaWJpbGl0eSgpOiBJT2JzZXJ2YWJsZTxJQ3VzdG9tQWdlbnRWaXNpYmlsaXR5IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2liaWxpdHlPYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IGFnZW50cygpOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9hZ2VudHNPYnNlcnZhYmxlO1xuXHR9XG5cblx0Z2V0IHNlc3Npb25UeXBlcygpOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25UeXBlcztcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBraW5kID0gQ2hhdE1vZGVLaW5kLkFnZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGN1c3RvbUNoYXRNb2RlOiBJQ3VzdG9tQWdlbnRcblx0KSB7XG5cdFx0dGhpcy5pZCA9IGN1c3RvbUNoYXRNb2RlLnVyaS50b1N0cmluZygpO1xuXHRcdHRoaXMuX25hbWVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCduYW1lJywgY3VzdG9tQ2hhdE1vZGUubmFtZSk7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb25PYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdkZXNjcmlwdGlvbicsIGN1c3RvbUNoYXRNb2RlLmRlc2NyaXB0aW9uKTtcblx0XHR0aGlzLl9jdXN0b21Ub29sc09ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ2N1c3RvbVRvb2xzJywgY3VzdG9tQ2hhdE1vZGUudG9vbHMpO1xuXHRcdHRoaXMuX21vZGVsT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnbW9kZWwnLCBjdXN0b21DaGF0TW9kZS5tb2RlbCk7XG5cdFx0dGhpcy5fYXJndW1lbnRIaW50T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnYXJndW1lbnRIaW50JywgY3VzdG9tQ2hhdE1vZGUuYXJndW1lbnRIaW50KTtcblx0XHR0aGlzLl9oYW5kb2Zmc09ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ2hhbmRPZmZzJywgY3VzdG9tQ2hhdE1vZGUuaGFuZE9mZnMpO1xuXHRcdHRoaXMuX3RhcmdldE9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3RhcmdldCcsIGN1c3RvbUNoYXRNb2RlLnRhcmdldCk7XG5cdFx0dGhpcy5fdmlzaWJpbGl0eU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3Zpc2liaWxpdHknLCBjdXN0b21DaGF0TW9kZS52aXNpYmlsaXR5KTtcblx0XHR0aGlzLl9hZ2VudHNPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdhZ2VudHMnLCBjdXN0b21DaGF0TW9kZS5hZ2VudHMpO1xuXHRcdHRoaXMuX21vZGVJbnN0cnVjdGlvbnMgPSBvYnNlcnZhYmxlVmFsdWUoJ19tb2RlSW5zdHJ1Y3Rpb25zJywgY3VzdG9tQ2hhdE1vZGUuYWdlbnRJbnN0cnVjdGlvbnMpO1xuXHRcdHRoaXMuX3VyaU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ3VyaScsIGN1c3RvbUNoYXRNb2RlLnVyaSk7XG5cdFx0dGhpcy5fc291cmNlID0gY3VzdG9tQ2hhdE1vZGUuc291cmNlO1xuXHRcdHRoaXMuX3Nlc3Npb25UeXBlcyA9IGN1c3RvbUNoYXRNb2RlLnNlc3Npb25UeXBlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB1bmRlcmx5aW5nIGRhdGEgYW5kIHRyaWdnZXJzIG9ic2VydmFibGUgY2hhbmdlc1xuXHQgKi9cblx0dXBkYXRlRGF0YShuZXdEYXRhOiBJQ3VzdG9tQWdlbnQpOiBib29sZWFuIHtcblx0XHRsZXQgaGFzQ2hhbmdlcyA9IGZhbHNlO1xuXG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Y29uc3QgdXBkYXRlID0gPFQ+KG9ic2VydmFibGU6IElTZXR0YWJsZU9ic2VydmFibGU8VCB8IHVuZGVmaW5lZD4sIG5ld1ZhbHVlOiBUIHwgdW5kZWZpbmVkLCBlcXVhbHM6IChhOiBUIHwgdW5kZWZpbmVkLCBiOiBUIHwgdW5kZWZpbmVkKSA9PiBib29sZWFuID0gKGEsIGIpID0+IGEgPT09IGIpID0+IHtcblx0XHRcdFx0aWYgKCFlcXVhbHMob2JzZXJ2YWJsZS5nZXQoKSwgbmV3VmFsdWUpKSB7XG5cdFx0XHRcdFx0b2JzZXJ2YWJsZS5zZXQobmV3VmFsdWUsIHR4KTtcblx0XHRcdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHVwZGF0ZSh0aGlzLl9uYW1lT2JzZXJ2YWJsZSwgbmV3RGF0YS5uYW1lKTtcblx0XHRcdHVwZGF0ZSh0aGlzLl9kZXNjcmlwdGlvbk9ic2VydmFibGUsIG5ld0RhdGEuZGVzY3JpcHRpb24pO1xuXHRcdFx0dXBkYXRlKHRoaXMuX2N1c3RvbVRvb2xzT2JzZXJ2YWJsZSwgbmV3RGF0YS50b29scywgYXJyYXlzRXF1YWwpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX21vZGVsT2JzZXJ2YWJsZSwgbmV3RGF0YS5tb2RlbCwgYXJyYXlzRXF1YWwpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX2FyZ3VtZW50SGludE9ic2VydmFibGUsIG5ld0RhdGEuYXJndW1lbnRIaW50KTtcblx0XHRcdHVwZGF0ZSh0aGlzLl9tb2RlSW5zdHJ1Y3Rpb25zLCBuZXdEYXRhLmFnZW50SW5zdHJ1Y3Rpb25zLCBJQ2hhdE1vZGVJbnN0cnVjdGlvbnMuaXNFcXVhbHMpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX3VyaU9ic2VydmFibGUsIG5ld0RhdGEudXJpLCBpc1VSTEVxdWFscyk7XG5cdFx0XHR1cGRhdGUodGhpcy5faGFuZG9mZnNPYnNlcnZhYmxlLCBuZXdEYXRhLmhhbmRPZmZzLCBvYmplY3RFcXVhbHMpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX3RhcmdldE9ic2VydmFibGUsIG5ld0RhdGEudGFyZ2V0KTtcblx0XHRcdHVwZGF0ZSh0aGlzLl92aXNpYmlsaXR5T2JzZXJ2YWJsZSwgbmV3RGF0YS52aXNpYmlsaXR5LCBvYmplY3RFcXVhbHMpO1xuXHRcdFx0dXBkYXRlKHRoaXMuX2FnZW50c09ic2VydmFibGUsIG5ld0RhdGEuYWdlbnRzLCBhcnJheXNFcXVhbCk7XG5cdFx0XHRpZiAoIUlBZ2VudFNvdXJjZS5pc0VxdWFscyh0aGlzLl9zb3VyY2UsIG5ld0RhdGEuc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLl9zb3VyY2UgPSBuZXdEYXRhLnNvdXJjZTtcblx0XHRcdFx0aGFzQ2hhbmdlcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWFycmF5c0VxdWFsKHRoaXMuX3Nlc3Npb25UeXBlcywgbmV3RGF0YS5zZXNzaW9uVHlwZXMpKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25UeXBlcyA9IG5ld0RhdGEuc2Vzc2lvblR5cGVzO1xuXHRcdFx0XHRoYXNDaGFuZ2VzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gaGFzQ2hhbmdlcztcblx0fVxuXG5cdHRvSlNPTigpOiBJQ2hhdE1vZGVEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUuZ2V0KCksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbi5nZXQoKSxcblx0XHRcdGtpbmQ6IHRoaXMua2luZCxcblx0XHRcdGN1c3RvbVRvb2xzOiB0aGlzLmN1c3RvbVRvb2xzLmdldCgpLFxuXHRcdFx0bW9kZWw6IHRoaXMubW9kZWwuZ2V0KCksXG5cdFx0XHRhcmd1bWVudEhpbnQ6IHRoaXMuYXJndW1lbnRIaW50LmdldCgpLFxuXHRcdFx0bW9kZUluc3RydWN0aW9uczogdGhpcy5tb2RlSW5zdHJ1Y3Rpb25zLmdldCgpLFxuXHRcdFx0dXJpOiB0aGlzLnVyaS5nZXQoKSxcblx0XHRcdGhhbmRPZmZzOiB0aGlzLmhhbmRPZmZzLmdldCgpLFxuXHRcdFx0c291cmNlOiBzZXJpYWxpemVDaGF0TW9kZVNvdXJjZSh0aGlzLl9zb3VyY2UpLFxuXHRcdFx0dGFyZ2V0OiB0aGlzLnRhcmdldC5nZXQoKSxcblx0XHRcdHZpc2liaWxpdHk6IHRoaXMudmlzaWJpbGl0eS5nZXQoKSxcblx0XHRcdGFnZW50czogdGhpcy5hZ2VudHMuZ2V0KCksXG5cdFx0XHRzZXNzaW9uVHlwZXM6IHRoaXMuc2Vzc2lvblR5cGVzLFxuXHRcdH07XG5cdH1cbn1cblxudHlwZSBJQ2hhdE1vZGVTb3VyY2VEYXRhID1cblx0fCB7IHJlYWRvbmx5IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbjsgcmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IHN0cmluZzsgdHlwZT86IFByb21wdEZpbGVTb3VyY2UuRXh0ZW5zaW9uQ29udHJpYnV0aW9uIHwgUHJvbXB0RmlsZVNvdXJjZS5FeHRlbnNpb25BUEkgfVxuXHR8IHsgcmVhZG9ubHkgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfCBQcm9tcHRzU3RvcmFnZS51c2VyIHwgUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbiB9XG5cdHwgeyByZWFkb25seSBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW47IHJlYWRvbmx5IHBsdWdpblVyaTogVVJJIH07XG5cbmZ1bmN0aW9uIGlzQ2hhdE1vZGVTb3VyY2VEYXRhKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSUNoYXRNb2RlU291cmNlRGF0YSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGNvbnN0IGRhdGEgPSB2YWx1ZSBhcyB7IHN0b3JhZ2U/OiB1bmtub3duOyBleHRlbnNpb25JZD86IHVua25vd247IHBsdWdpblVyaT86IHVua25vd24gfTtcblx0aWYgKGRhdGEuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKSB7XG5cdFx0cmV0dXJuIHR5cGVvZiBkYXRhLmV4dGVuc2lvbklkID09PSAnc3RyaW5nJztcblx0fVxuXHRpZiAoZGF0YS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5wbHVnaW4pIHtcblx0XHRyZXR1cm4gaXNVcmlDb21wb25lbnRzKGRhdGEucGx1Z2luVXJpKTtcblx0fVxuXHRyZXR1cm4gZGF0YS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5sb2NhbCB8fCBkYXRhLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnVzZXIgfHwgZGF0YS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5idWlsdEluO1xufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVDaGF0TW9kZVNvdXJjZShzb3VyY2U6IElBZ2VudFNvdXJjZSB8IHVuZGVmaW5lZCk6IElDaGF0TW9kZVNvdXJjZURhdGEgfCB1bmRlZmluZWQge1xuXHRpZiAoIXNvdXJjZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHNvdXJjZS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24pIHtcblx0XHRyZXR1cm4geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIGV4dGVuc2lvbklkOiBzb3VyY2UuZXh0ZW5zaW9uSWQudmFsdWUgfTtcblx0fVxuXHRpZiAoc291cmNlLnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLnBsdWdpbikge1xuXHRcdHJldHVybiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbiwgcGx1Z2luVXJpOiBzb3VyY2UucGx1Z2luVXJpIH07XG5cdH1cblx0cmV0dXJuIHsgc3RvcmFnZTogc291cmNlLnN0b3JhZ2UgfTtcbn1cblxuZnVuY3Rpb24gcmV2aXZlQ2hhdE1vZGVTb3VyY2UoZGF0YTogSUNoYXRNb2RlU291cmNlRGF0YSB8IHVuZGVmaW5lZCk6IElBZ2VudFNvdXJjZSB8IHVuZGVmaW5lZCB7XG5cdGlmICghZGF0YSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKGRhdGEuc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uKSB7XG5cdFx0cmV0dXJuIHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoZGF0YS5leHRlbnNpb25JZCkgfTtcblx0fVxuXHRpZiAoZGF0YS5zdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS5wbHVnaW4pIHtcblx0XHRyZXR1cm4geyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sIHBsdWdpblVyaTogVVJJLnJldml2ZShkYXRhLnBsdWdpblVyaSkgfTtcblx0fVxuXHRyZXR1cm4geyBzdG9yYWdlOiBkYXRhLnN0b3JhZ2UgfTtcbn1cblxuZXhwb3J0IGNsYXNzIEJ1aWx0aW5DaGF0TW9kZSBpbXBsZW1lbnRzIElDaGF0TW9kZSB7XG5cdHB1YmxpYyByZWFkb25seSBuYW1lOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IElPYnNlcnZhYmxlPHN0cmluZz47XG5cdHB1YmxpYyByZWFkb25seSBkZXNjcmlwdGlvbjogSU9ic2VydmFibGU8c3RyaW5nPjtcblx0cHVibGljIHJlYWRvbmx5IGljb246IElPYnNlcnZhYmxlPFRoZW1lSWNvbj47XG5cdHB1YmxpYyByZWFkb25seSB0YXJnZXQ6IElPYnNlcnZhYmxlPFRhcmdldD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGtpbmQ6IENoYXRNb2RlS2luZCxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmcsXG5cdFx0aWNvbjogVGhlbWVJY29uLFxuXHQpIHtcblx0XHR0aGlzLm5hbWUgPSBjb25zdE9ic2VydmFibGUoa2luZCk7XG5cdFx0dGhpcy5sYWJlbCA9IGNvbnN0T2JzZXJ2YWJsZShsYWJlbCk7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IG9ic2VydmFibGVWYWx1ZSgnZGVzY3JpcHRpb24nLCBkZXNjcmlwdGlvbik7XG5cdFx0dGhpcy5pY29uID0gY29uc3RPYnNlcnZhYmxlKGljb24pO1xuXHRcdHRoaXMudGFyZ2V0ID0gY29uc3RPYnNlcnZhYmxlKFRhcmdldC5VbmRlZmluZWQpO1xuXHR9XG5cblx0cHVibGljIGdldCBpc0J1aWx0aW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzQnVpbHRpbkNoYXRNb2RlKHRoaXMpO1xuXHR9XG5cblx0Z2V0IGlkKCk6IHN0cmluZyB7XG5cdFx0Ly8gTmVlZCBhIGRpZmZlcmVudGlhdG9yP1xuXHRcdHJldHVybiB0aGlzLmtpbmQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0dGVycyBhcmUgbm90IGpzb24tc3RyaW5naWZpZWRcblx0ICovXG5cdHRvSlNPTigpOiBJQ2hhdE1vZGVEYXRhIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHRoaXMuaWQsXG5cdFx0XHRuYW1lOiB0aGlzLm5hbWUuZ2V0KCksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbi5nZXQoKSxcblx0XHRcdGtpbmQ6IHRoaXMua2luZFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDaGF0TW9kZSB7XG5cdGV4cG9ydCBjb25zdCBBc2sgPSBuZXcgQnVpbHRpbkNoYXRNb2RlKENoYXRNb2RlS2luZC5Bc2ssICdBc2snLCBsb2NhbGl6ZSgnY2hhdERlc2NyaXB0aW9uJywgXCJFeHBsb3JlIGFuZCB1bmRlcnN0YW5kIHlvdXIgY29kZVwiKSwgQ29kaWNvbi5xdWVzdGlvbik7XG5cdGV4cG9ydCBjb25zdCBFZGl0ID0gbmV3IEJ1aWx0aW5DaGF0TW9kZShDaGF0TW9kZUtpbmQuRWRpdCwgJ0VkaXQnLCBsb2NhbGl6ZSgnZWRpdHNEZXNjcmlwdGlvbicsIFwiRWRpdCBvciByZWZhY3RvciBzZWxlY3RlZCBjb2RlXCIpLCBDb2RpY29uLmVkaXQpO1xuXHRleHBvcnQgY29uc3QgQWdlbnQgPSBuZXcgQnVpbHRpbkNoYXRNb2RlKENoYXRNb2RlS2luZC5BZ2VudCwgJ0FnZW50JywgbG9jYWxpemUoJ2FnZW50RGVzY3JpcHRpb24nLCBcIkRlc2NyaWJlIHdoYXQgdG8gYnVpbGRcIiksIENvZGljb24uYWdlbnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNCdWlsdGluQ2hhdE1vZGUobW9kZTogSUNoYXRNb2RlKTogYm9vbGVhbiB7XG5cdHJldHVybiBtb2RlLmlkID09PSBDaGF0TW9kZS5Bc2suaWQgfHxcblx0XHRtb2RlLmlkID09PSBDaGF0TW9kZS5FZGl0LmlkIHx8XG5cdFx0bW9kZS5pZCA9PT0gQ2hhdE1vZGUuQWdlbnQuaWQ7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIHRlbGVtZXRyeS1zYWZlIG1vZGUgbmFtZS4gVXNlci9sb2NhbCBtb2RlIG5hbWVzIGFyZSBoYXNoZWRcbiAqIHRvIGF2b2lkIGxlYWtpbmcgUElJOyBidWlsdGluIGFuZCBleHRlbnNpb24gbW9kZSBuYW1lcyBhcmUgcmV0dXJuZWQgYXMtaXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeShtb2RlOiBJQ2hhdE1vZGUpOiBzdHJpbmcge1xuXHRjb25zdCBtb2RlU3RvcmFnZSA9IG1vZGUuc291cmNlPy5zdG9yYWdlO1xuXHRpZiAobW9kZVN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmxvY2FsIHx8IG1vZGVTdG9yYWdlID09PSBQcm9tcHRzU3RvcmFnZS51c2VyKSB7XG5cdFx0cmV0dXJuIFN0cmluZyhoYXNoKG1vZGUubmFtZS5nZXQoKSkpO1xuXHR9XG5cdHJldHVybiBtb2RlLm5hbWUuZ2V0KCk7XG59XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgc3RhYmxlIGlkZW50aWZpZXIgZm9yIGEgaGFuZG9mZiBieSBjb21iaW5pbmcgdGhlIHRhcmdldCBhZ2VudFxuICogbmFtZSB3aXRoIGEgc2x1Z2lmaWVkIHZlcnNpb24gb2YgdGhlIGRpc3BsYXkgbGFiZWwuXG4gKlxuICogV2l0aGluIGEgc2luZ2xlIHNvdXJjZSBhZ2VudCwgdGhlIGNvbWJpbmF0aW9uIG9mIGBhZ2VudGAgKyBgbGFiZWxgIG11c3QgYmVcbiAqIHVuaXF1ZSBmb3IgSURzIHRvIGJlIHVuYW1iaWd1b3VzLlxuICpcbiAqIEBleGFtcGxlXG4gKiBgYGBcbiAqIGdldEhhbmRvZmZJZCh7IGFnZW50OiAnYWdlbnQnLCBsYWJlbDogJ0NvbnRpbnVlJywgcHJvbXB0OiAnLi4uJyB9KVxuICogLy8gPT4gJ2FnZW50OmNvbnRpbnVlJ1xuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRIYW5kb2ZmSWQoaGFuZG9mZjogSUhhbmRPZmYpOiBzdHJpbmcge1xuXHRjb25zdCBzbHVnID0gaGFuZG9mZi5sYWJlbC50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1teYS16MC05XSsvZywgJy0nKS5yZXBsYWNlKC9eLXwtJC9nLCAnJyk7XG5cdHJldHVybiBgJHtoYW5kb2ZmLmFnZW50fToke3NsdWd9YDtcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgYSBzaW5nbGUgaGFuZG9mZiBkZWZpbmVkIGluIGEgY3VzdG9tIGFnZW50J3MgYC5hZ2VudC5tZGAgZmlsZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJSGFuZG9mZkluZm8ge1xuXHQvKiogU3RhYmxlIGlkZW50aWZpZXIgZm9yIHByb2dyYW1tYXRpYyBtYXRjaGluZyAoZm9ybWF0OiBgPGFnZW50Pjo8c2x1Z2lmaWVkLWxhYmVsPmApLiAqL1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudDogc3RyaW5nO1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2VuZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dDb250aW51ZU9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbW9kZWw/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogRGVzY3JpYmVzIGEgY3VzdG9tIGFnZW50IChvciBidWlsdC1pbiBtb2RlKSBhbmQgdGhlIGhhbmRvZmZzIGl0IGRlZmluZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUN1c3RvbUFnZW50SW5mbyB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaXNCdWlsdGluOiBib29sZWFuO1xuXHRyZWFkb25seSB2aXNpYmlsaXR5OiB7XG5cdFx0cmVhZG9ubHkgdXNlckludm9jYWJsZTogYm9vbGVhbjtcblx0XHRyZWFkb25seSBhZ2VudEludm9jYWJsZTogYm9vbGVhbjtcblx0fTtcblx0cmVhZG9ubHkgaGFuZG9mZnM6IElIYW5kb2ZmSW5mb1tdO1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhbiBhcnJheSBvZiB7QGxpbmsgSUN1c3RvbUFnZW50SW5mb30gd2l0aCBoYW5kb2ZmIG1ldGFkYXRhIGZvciB0aGUgZ2l2ZW4gYWdlbnRzL21vZGVzLlxuICpcbiAqIEBwYXJhbSBtb2RlcyAtIFRoZSBzZXQgb2YgYWdlbnRzL21vZGVzIHRvIGluY2x1ZGUuIFBhc3MgYWxsIG1vZGVzIHRvIGdldCBhXG4gKiAgIGNvbXBsZXRlIHBpY3R1cmUsIG9yIGEgZmlsdGVyZWQgc3Vic2V0IHRvIHNjb3BlIHRoZSByZXN1bHQuXG4gKiBAcmV0dXJucyBPbmUgZW50cnkgcGVyIGFnZW50L21vZGUsIGVhY2ggY29udGFpbmluZyB0aGUgYWdlbnQncyBtZXRhZGF0YSBhbmRcbiAqICAgaXRzIGRlY2xhcmVkIGhhbmRvZmZzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRDdXN0b21BZ2VudEhhbmRvZmZzSW5mbyhtb2RlczogcmVhZG9ubHkgSUNoYXRNb2RlW10pOiBJQ3VzdG9tQWdlbnRJbmZvW10ge1xuXHRyZXR1cm4gbW9kZXMubWFwKG1vZGUgPT4ge1xuXHRcdGNvbnN0IGhhbmRvZmZzID0gbW9kZS5oYW5kT2Zmcz8uZ2V0KCkgPz8gW107XG5cdFx0Y29uc3QgdmlzaWJpbGl0eSA9IG1vZGUudmlzaWJpbGl0eT8uZ2V0KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBtb2RlLmlkLFxuXHRcdFx0bmFtZTogbW9kZS5uYW1lLmdldCgpLFxuXHRcdFx0aXNCdWlsdGluOiBtb2RlLmlzQnVpbHRpbixcblx0XHRcdHZpc2liaWxpdHk6IHtcblx0XHRcdFx0dXNlckludm9jYWJsZTogdmlzaWJpbGl0eT8udXNlckludm9jYWJsZSA/PyB0cnVlLFxuXHRcdFx0XHRhZ2VudEludm9jYWJsZTogdmlzaWJpbGl0eT8uYWdlbnRJbnZvY2FibGUgPz8gdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRoYW5kb2ZmczogaGFuZG9mZnMubWFwKGggPT4gKHtcblx0XHRcdFx0aWQ6IGdldEhhbmRvZmZJZChoKSxcblx0XHRcdFx0bGFiZWw6IGgubGFiZWwsXG5cdFx0XHRcdGFnZW50OiBoLmFnZW50LFxuXHRcdFx0XHRwcm9tcHQ6IGgucHJvbXB0LFxuXHRcdFx0XHQuLi4oaC5zZW5kICE9PSB1bmRlZmluZWQgPyB7IHNlbmQ6IGguc2VuZCB9IDoge30pLFxuXHRcdFx0XHQuLi4oaC5zaG93Q29udGludWVPbiAhPT0gdW5kZWZpbmVkID8geyBzaG93Q29udGludWVPbjogaC5zaG93Q29udGludWVPbiB9IDoge30pLFxuXHRcdFx0XHQuLi4oaC5tb2RlbCAhPT0gdW5kZWZpbmVkID8geyBtb2RlbDogaC5tb2RlbCB9IDoge30pLFxuXHRcdFx0fSkpLFxuXHRcdH07XG5cdH0pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUE0QiwrQkFBK0I7QUFDM0QsU0FB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
