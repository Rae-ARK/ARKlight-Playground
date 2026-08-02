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
import { AsyncIterableProducer, AsyncIterableSource, RunOnceScheduler } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../base/common/cancellation.js";
import { transformErrorForSerialization, transformErrorFromSerialization } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { DisposableMap, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionIdentifierSet } from "../../../platform/extensions/common/extensions.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { Progress } from "../../../platform/progress/common/progress.js";
import { COPILOT_VENDOR_ID } from "../../contrib/chat/common/languageModels.js";
import { INTERNAL_AUTH_PROVIDER_PREFIX } from "../../services/authentication/common/authentication.js";
import { checkProposedApiEnabled, isProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { MainContext } from "./extHost.protocol.js";
import { IExtHostAuthentication } from "./extHostAuthentication.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import * as typeConvert from "./extHostTypeConverters.js";
import * as extHostTypes from "./extHostTypes.js";
import { ChatAgentLocation } from "../../contrib/chat/common/constants.js";
const IExtHostLanguageModels = createDecorator("IExtHostLanguageModels");
class LanguageModelResponse {
  constructor() {
    this._defaultStream = new AsyncIterableSource();
    this._isDone = false;
    const that = this;
    const [stream1, stream2] = AsyncIterableProducer.tee(that._defaultStream.asyncIterable);
    this.apiObject = {
      // result: promise,
      get stream() {
        return stream1;
      },
      get text() {
        return stream2.map((part) => {
          if (part instanceof extHostTypes.LanguageModelTextPart) {
            return part.value;
          } else {
            return void 0;
          }
        }).coalesce();
      }
    };
  }
  handleResponsePart(parts) {
    if (this._isDone) {
      return;
    }
    const lmResponseParts = [];
    for (const part of Iterable.wrap(parts)) {
      let out;
      if (part.type === "text") {
        out = new extHostTypes.LanguageModelTextPart(part.value, part.audience);
      } else if (part.type === "thinking") {
        out = new extHostTypes.LanguageModelThinkingPart(part.value, part.id, part.metadata);
      } else if (part.type === "data") {
        out = new extHostTypes.LanguageModelDataPart(part.data.buffer, part.mimeType, part.audience);
      } else {
        out = new extHostTypes.LanguageModelToolCallPart(part.toolCallId, part.name, part.parameters);
      }
      lmResponseParts.push(out);
    }
    this._defaultStream.emitMany(lmResponseParts);
  }
  reject(err) {
    this._isDone = true;
    this._defaultStream.reject(err);
  }
  resolve() {
    this._isDone = true;
    this._defaultStream.resolve();
  }
}
let ExtHostLanguageModels = class {
  constructor(extHostRpc, _logService, _extHostAuthentication) {
    this._logService = _logService;
    this._extHostAuthentication = _extHostAuthentication;
    this._onDidChangeModelAccess = new Emitter();
    this._onDidChangeProviders = new Emitter();
    this.onDidChangeProviders = this._onDidChangeProviders.event;
    this._onDidChangeModelProxyAvailability = new Emitter();
    this.onDidChangeModelProxyAvailability = this._onDidChangeModelProxyAvailability.event;
    this._languageModelProviders = /* @__PURE__ */ new Map();
    // TODO @lramos15 - Remove the need for both info and metadata as it's a lot of redundancy. Should just need one
    this._localModels = /* @__PURE__ */ new Map();
    this._modelAccessList = new ExtensionIdentifierMap();
    this._pendingRequest = /* @__PURE__ */ new Map();
    this._pendingCancelCTS = new DisposableMap();
    this._ignoredFileProviders = /* @__PURE__ */ new Map();
    this._languageAccessInformationExtensions = /* @__PURE__ */ new Set();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadLanguageModels);
  }
  dispose() {
    this._onDidChangeModelAccess.dispose();
    this._onDidChangeProviders.dispose();
    this._onDidChangeModelProxyAvailability.dispose();
    this._pendingRequest.clear();
    this._pendingCancelCTS.dispose();
  }
  registerLanguageModelChatProvider(extension, vendor, provider) {
    this._languageModelProviders.set(vendor, { extension, provider });
    this._proxy.$registerLanguageModelProvider(vendor);
    let providerChangeEventDisposable;
    if (provider.onDidChangeLanguageModelChatInformation) {
      providerChangeEventDisposable = provider.onDidChangeLanguageModelChatInformation(() => {
        this._proxy.$onLMProviderChange(vendor);
      });
    }
    return toDisposable(() => {
      this._languageModelProviders.delete(vendor);
      this._localModels.forEach((value, key) => {
        if (value.metadata.vendor === vendor) {
          this._localModels.delete(key);
        }
      });
      providerChangeEventDisposable?.dispose();
      this._proxy.$unregisterProvider(vendor);
    });
  }
  toModelIdentifier(vendor, group, modelId) {
    return group ? `${vendor}/${group}/${modelId}` : `${vendor}/${modelId}`;
  }
  getVendorFromModelIdentifier(modelIdentifier) {
    const firstSlash = modelIdentifier.indexOf("/");
    return firstSlash === -1 ? void 0 : modelIdentifier.substring(0, firstSlash);
  }
  async $provideLanguageModelChatInfo(vendor, options, token) {
    const data = this._languageModelProviders.get(vendor);
    if (!data) {
      return [];
    }
    const modelInformation = await data.provider.provideLanguageModelChatInformation({ silent: options.silent, configuration: options.configuration }, token) ?? [];
    const modelMetadataAndIdentifier = modelInformation.map((m) => {
      let auth;
      if (m.requiresAuthorization && isProposedApiEnabled(data.extension, "chatProvider")) {
        auth = {
          providerLabel: data.extension.displayName || data.extension.name,
          accountLabel: typeof m.requiresAuthorization === "object" ? m.requiresAuthorization.label : void 0
        };
      }
      if (m.capabilities.editTools) {
        checkProposedApiEnabled(data.extension, "chatProvider");
      }
      const isDefaultForLocation = {};
      if (isProposedApiEnabled(data.extension, "chatProvider")) {
        if (m.isDefault === true) {
          for (const key of Object.values(ChatAgentLocation)) {
            if (typeof key === "string") {
              isDefaultForLocation[key] = true;
            }
          }
        } else if (typeof m.isDefault === "object") {
          for (const key of Object.keys(m.isDefault)) {
            const enumKey = parseInt(key);
            isDefaultForLocation[typeConvert.ChatLocation.from(enumKey)] = m.isDefault[enumKey];
          }
        }
      }
      return {
        metadata: {
          extension: data.extension.identifier,
          id: m.id,
          vendor,
          name: m.name ?? "",
          family: m.family ?? "",
          detail: m.detail,
          tooltip: m.tooltip,
          version: m.version,
          multiplierNumeric: m.multiplierNumeric,
          isBYOK: m.isBYOK,
          pricing: m.pricing,
          inputCost: m.inputCost,
          outputCost: m.outputCost,
          cacheCost: m.cacheCost,
          cacheWriteCost: m.cacheWriteCost,
          longContextInputCost: m.longContextInputCost,
          longContextOutputCost: m.longContextOutputCost,
          longContextCacheCost: m.longContextCacheCost,
          longContextCacheWriteCost: m.longContextCacheWriteCost,
          priceCategory: m.priceCategory,
          category: m.category,
          maxInputTokens: m.maxInputTokens,
          maxOutputTokens: m.maxOutputTokens,
          auth,
          isDefaultForLocation,
          isUserSelectable: m.isUserSelectable,
          statusIcon: m.statusIcon,
          targetChatSessionType: m.targetChatSessionType,
          configurationSchema: m.configurationSchema,
          warningText: m.warningText,
          promo: m.promo,
          capabilities: m.capabilities ? {
            vision: m.capabilities.imageInput,
            editTools: m.capabilities.editTools,
            toolCalling: !!m.capabilities.toolCalling,
            agentMode: !!m.capabilities.toolCalling
          } : void 0
        },
        identifier: this.toModelIdentifier(vendor, options.group, m.id)
      };
    });
    this._localModels.forEach((value, key) => {
      if (value.metadata.vendor === vendor && value.group === options.group) {
        this._localModels.delete(key);
      }
    });
    for (let i = 0; i < modelMetadataAndIdentifier.length; i++) {
      this._localModels.set(modelMetadataAndIdentifier[i].identifier, {
        group: options.group,
        metadata: modelMetadataAndIdentifier[i].metadata,
        info: modelInformation[i]
      });
    }
    return modelMetadataAndIdentifier;
  }
  async $startChatRequest(modelId, requestId, from, messages, options, token) {
    const knownModel = this._localModels.get(modelId);
    if (!knownModel) {
      throw new Error("Model not found");
    }
    const data = this._languageModelProviders.get(knownModel.metadata.vendor);
    if (!data) {
      throw new Error(`Language model provider for '${knownModel.metadata.id}' not found.`);
    }
    const cts = new CancellationTokenSource(token);
    this._pendingCancelCTS.set(requestId, cts);
    const providerToken = cts.token;
    const queue = [];
    const sendNow = () => {
      if (queue.length > 0) {
        this._proxy.$reportResponsePart(requestId, new SerializableObjectWithBuffers(queue));
        queue.length = 0;
      }
    };
    const queueScheduler = new RunOnceScheduler(sendNow, 30);
    const sendSoon = (part) => {
      const newLen = queue.push(part);
      if (newLen > 30) {
        sendNow();
        queueScheduler.cancel();
      } else {
        queueScheduler.schedule();
      }
    };
    const progress = new Progress(async (fragment) => {
      if (providerToken.isCancellationRequested) {
        this._logService.warn(`[CHAT](${data.extension.identifier.value}) CANNOT send progress because the REQUEST IS CANCELLED`);
        return;
      }
      let part;
      if (fragment instanceof extHostTypes.LanguageModelToolCallPart) {
        part = { type: "tool_use", name: fragment.name, parameters: fragment.input, toolCallId: fragment.callId };
      } else if (fragment instanceof extHostTypes.LanguageModelTextPart) {
        part = { type: "text", value: fragment.value, audience: fragment.audience };
      } else if (fragment instanceof extHostTypes.LanguageModelDataPart) {
        part = { type: "data", mimeType: fragment.mimeType, data: VSBuffer.wrap(fragment.data), audience: fragment.audience };
      } else if (fragment instanceof extHostTypes.LanguageModelThinkingPart) {
        part = { type: "thinking", value: fragment.value, id: fragment.id, metadata: fragment.metadata };
      }
      if (!part) {
        this._logService.warn(`[CHAT](${data.extension.identifier.value}) UNKNOWN part ${JSON.stringify(fragment)}`);
        return;
      }
      sendSoon(part);
    });
    let value;
    try {
      value = data.provider.provideLanguageModelChatResponse(
        knownModel.info,
        messages.value.map(typeConvert.LanguageModelChatMessage2.to),
        // todo@connor4312: move `core` -> `undefined` after 1.111 Insiders is out
        { ...options, modelOptions: options.modelOptions ?? {}, modelConfiguration: options.configuration, requestInitiator: from ? ExtensionIdentifier.toKey(from) : "core", toolMode: options.toolMode ?? extHostTypes.LanguageModelChatToolMode.Auto, includeEncryptedThinking: options.includeEncryptedThinking },
        progress,
        providerToken
      );
    } catch (err) {
      this._pendingCancelCTS.deleteAndDispose(requestId);
      throw err;
    }
    Promise.resolve(value).then(() => {
      sendNow();
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$reportResponseDone(requestId, void 0);
    }, (err) => {
      sendNow();
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$reportResponseDone(requestId, transformErrorForSerialization(err));
    });
  }
  //#region --- token counting
  $cancelLanguageModelChatRequest(requestId) {
    this._pendingCancelCTS.get(requestId)?.cancel();
  }
  $provideTokenLength(modelId, value, token) {
    const knownModel = this._localModels.get(modelId);
    if (!knownModel) {
      return Promise.resolve(0);
    }
    const data = this._languageModelProviders.get(knownModel.metadata.vendor);
    if (!data) {
      return Promise.resolve(0);
    }
    return Promise.resolve(data.provider.provideTokenCount(knownModel.info, value, token));
  }
  //#region --- making request
  async getDefaultLanguageModel(extension, forceResolveModels) {
    let defaultModelId;
    if (forceResolveModels) {
      await this.selectLanguageModels(extension, {});
    }
    for (const [modelIdentifier, modelData] of this._localModels) {
      if (modelData.metadata.isDefaultForLocation[ChatAgentLocation.Chat] && modelData.metadata.vendor === COPILOT_VENDOR_ID) {
        defaultModelId = modelIdentifier;
        break;
      }
    }
    if (!defaultModelId && !forceResolveModels) {
      return this.getDefaultLanguageModel(extension, true);
    }
    return this.getLanguageModelByIdentifier(extension, defaultModelId);
  }
  async getLanguageModelByIdentifier(extension, modelId) {
    if (!modelId) {
      return void 0;
    }
    if (!this._localModels.has(modelId)) {
      const vendor = this.getVendorFromModelIdentifier(modelId);
      if (!vendor) {
        this._logService.warn(`[LanguageModelProxy](${extension.identifier.value}) Could not extract vendor from model identifier '${modelId}'.`);
        return void 0;
      }
      this._logService.trace(`[LanguageModelProxy](${extension.identifier.value}) Could not find model '${modelId}' in local cache. Trying to resolve model again.`);
      await this._proxy.$selectChatModels({ vendor, extension: extension.identifier });
      if (!this._localModels.has(modelId)) {
        this._logService.warn(`[LanguageModelProxy](${extension.identifier.value}) Could not find model '${modelId}' in local cache after re-resolving models.`);
        return void 0;
      }
    }
    return this._createLanguageModelChatApi(extension, modelId);
  }
  async _createLanguageModelChatApi(extension, modelId) {
    const model = this._localModels.get(modelId);
    if (!model) {
      return void 0;
    }
    if (this._isUsingAuth(extension.identifier, model.metadata)) {
      await this._fakeAuthPopulate(model.metadata);
    }
    const that = this;
    const apiObject = {
      id: model.info.id,
      vendor: model.metadata.vendor,
      family: model.info.family,
      version: model.info.version,
      name: model.info.name,
      pricing: model.metadata.pricing,
      inputCost: model.metadata.inputCost,
      outputCost: model.metadata.outputCost,
      cacheCost: model.metadata.cacheCost,
      cacheWriteCost: model.metadata.cacheWriteCost,
      longContextInputCost: model.metadata.longContextInputCost,
      longContextOutputCost: model.metadata.longContextOutputCost,
      longContextCacheCost: model.metadata.longContextCacheCost,
      longContextCacheWriteCost: model.metadata.longContextCacheWriteCost,
      priceCategory: model.metadata.priceCategory,
      category: model.metadata.category,
      capabilities: {
        supportsImageToText: model.metadata.capabilities?.vision ?? false,
        supportsToolCalling: !!model.metadata.capabilities?.toolCalling,
        editToolsHint: model.metadata.capabilities?.editTools
      },
      maxInputTokens: model.metadata.maxInputTokens,
      countTokens(text, token) {
        if (!that._localModels.has(modelId)) {
          throw extHostTypes.LanguageModelError.NotFound(modelId);
        }
        return that._computeTokenLength(modelId, text, token ?? CancellationToken.None);
      },
      sendRequest(messages, options, token) {
        if (!that._localModels.has(modelId)) {
          throw extHostTypes.LanguageModelError.NotFound(modelId);
        }
        return that._sendChatRequest(extension, modelId, messages, options ?? {}, token ?? CancellationToken.None);
      }
    };
    Object.freeze(apiObject);
    return apiObject;
  }
  async selectLanguageModels(extension, selector) {
    const models = await this._proxy.$selectChatModels({ ...selector, extension: extension.identifier });
    const modelResults = await Promise.all(models.map((identifier) => this._createLanguageModelChatApi(extension, identifier)));
    return modelResults.filter((m) => !!m);
  }
  async _sendChatRequest(extension, languageModelId, messages, options, token) {
    const internalMessages = this._convertMessages(extension, messages);
    const from = extension.identifier;
    const metadata = this._localModels.get(languageModelId)?.metadata;
    if (!metadata || !this._localModels.has(languageModelId)) {
      throw extHostTypes.LanguageModelError.NotFound(`Language model '${languageModelId}' is unknown.`);
    }
    if (this._isUsingAuth(from, metadata)) {
      const success = await this._getAuthAccess(extension, { identifier: metadata.extension, displayName: metadata.auth.providerLabel }, options.justification, false);
      if (!success || !this._modelAccessList.get(from)?.has(metadata.extension)) {
        throw extHostTypes.LanguageModelError.NoPermissions(`Language model '${languageModelId}' cannot be used by '${from.value}'.`);
      }
    }
    const requestId = Math.random() * 1e6 | 0;
    const res = new LanguageModelResponse();
    this._pendingRequest.set(requestId, { languageModelId, res });
    const cts = new CancellationTokenSource(token);
    this._pendingCancelCTS.set(requestId, cts);
    cts.token.onCancellationRequested(() => {
      this._proxy.$cancelLanguageModelChatRequest(requestId);
    });
    try {
      await this._proxy.$tryStartChatRequest(from, languageModelId, requestId, new SerializableObjectWithBuffers(internalMessages), options, cts.token);
    } catch (error) {
      this._pendingRequest.delete(requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      throw extHostTypes.LanguageModelError.tryDeserialize(error) ?? error;
    }
    return res.apiObject;
  }
  _convertMessages(extension, messages) {
    const internalMessages = [];
    for (const message of messages) {
      if (message.role === extHostTypes.LanguageModelChatMessageRole.System) {
        checkProposedApiEnabled(extension, "languageModelSystem");
      }
      internalMessages.push(typeConvert.LanguageModelChatMessage2.from(message));
    }
    return internalMessages;
  }
  async $acceptResponsePart(requestId, chunk) {
    const data = this._pendingRequest.get(requestId);
    if (data) {
      data.res.handleResponsePart(chunk.value);
    }
  }
  $onChatModelsChange() {
    this._onDidChangeProviders.fire();
  }
  async $acceptResponseDone(requestId, error) {
    const data = this._pendingRequest.get(requestId);
    if (!data) {
      return;
    }
    this._pendingRequest.delete(requestId);
    this._pendingCancelCTS.deleteAndDispose(requestId);
    if (error) {
      data.res.reject(extHostTypes.LanguageModelError.tryDeserialize(error) ?? transformErrorFromSerialization(error));
    } else {
      data.res.resolve();
    }
  }
  // BIG HACK: Using AuthenticationProviders to check access to Language Models
  async _getAuthAccess(from, to, justification, silent) {
    const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + to.identifier.value;
    const session = await this._extHostAuthentication.getSession(from, providerId, [], { silent: true });
    if (session) {
      this.$updateModelAccesslist([{ from: from.identifier, to: to.identifier, enabled: true }]);
      return true;
    }
    if (silent) {
      return false;
    }
    try {
      const detail = justification ? localize("chatAccessWithJustification", "Justification: {1}", to.displayName, justification) : void 0;
      await this._extHostAuthentication.getSession(from, providerId, [], { forceNewSession: { detail } });
      this.$updateModelAccesslist([{ from: from.identifier, to: to.identifier, enabled: true }]);
      return true;
    } catch (err) {
      return false;
    }
  }
  _isUsingAuth(from, toMetadata) {
    return !!toMetadata.auth && !ExtensionIdentifier.equals(toMetadata.extension, from);
  }
  async _fakeAuthPopulate(metadata) {
    if (!metadata.auth) {
      return;
    }
    for (const from of this._languageAccessInformationExtensions) {
      try {
        await this._getAuthAccess(from, { identifier: metadata.extension, displayName: "" }, void 0, true);
      } catch (err) {
        this._logService.error("Fake Auth request failed");
        this._logService.error(err);
      }
    }
  }
  async _computeTokenLength(modelId, value, token) {
    const data = this._localModels.get(modelId);
    if (!data) {
      throw extHostTypes.LanguageModelError.NotFound(`Language model '${modelId}' is unknown.`);
    }
    return this._languageModelProviders.get(data.metadata.vendor)?.provider.provideTokenCount(data.info, value, token) ?? 0;
  }
  $updateModelAccesslist(data) {
    const updated = new Array();
    for (const { from, to, enabled } of data) {
      const set = this._modelAccessList.get(from) ?? new ExtensionIdentifierSet();
      const oldValue = set.has(to);
      if (oldValue !== enabled) {
        if (enabled) {
          set.add(to);
        } else {
          set.delete(to);
        }
        this._modelAccessList.set(from, set);
        const newItem = { from, to };
        updated.push(newItem);
        this._onDidChangeModelAccess.fire(newItem);
      }
    }
  }
  createLanguageModelAccessInformation(from) {
    this._languageAccessInformationExtensions.add(from);
    const _onDidChangeAccess = Event.signal(Event.filter(this._onDidChangeModelAccess.event, (e) => ExtensionIdentifier.equals(e.from, from.identifier)));
    const _onDidAddRemove = Event.signal(this._onDidChangeProviders.event);
    return {
      get onDidChange() {
        return Event.any(_onDidChangeAccess, _onDidAddRemove);
      },
      canSendRequest(chat) {
        return true;
      }
    };
  }
  fileIsIgnored(extension, uri, token = CancellationToken.None) {
    checkProposedApiEnabled(extension, "chatParticipantAdditions");
    return this._proxy.$fileIsIgnored(uri, token);
  }
  get isModelProxyAvailable() {
    return !!this._languageModelProxyProvider;
  }
  async getModelProxy(extension) {
    checkProposedApiEnabled(extension, "languageModelProxy");
    if (!this._languageModelProxyProvider) {
      this._logService.trace("[LanguageModelProxy] No LanguageModelProxyProvider registered");
      throw new Error("No language model proxy provider is registered.");
    }
    const requestingExtensionId = ExtensionIdentifier.toKey(extension.identifier);
    try {
      const result = await Promise.resolve(this._languageModelProxyProvider.provideModelProxy(requestingExtensionId, CancellationToken.None));
      if (!result) {
        this._logService.warn(`[LanguageModelProxy] Provider returned no proxy for ${requestingExtensionId}`);
        throw new Error("Language model proxy is not available.");
      }
      return result;
    } catch (err) {
      this._logService.error(`[LanguageModelProxy] Provider failed to return proxy for ${requestingExtensionId}`, err);
      throw err;
    }
  }
  async $isFileIgnored(handle, uri, token) {
    const provider = this._ignoredFileProviders.get(handle);
    if (!provider) {
      throw new Error("Unknown LanguageModelIgnoredFileProvider");
    }
    return await provider.provideFileIgnored(URI.revive(uri), token) ?? false;
  }
  registerIgnoredFileProvider(extension, provider) {
    checkProposedApiEnabled(extension, "chatParticipantPrivate");
    const handle = ExtHostLanguageModels._idPool++;
    this._proxy.$registerFileIgnoreProvider(handle);
    this._ignoredFileProviders.set(handle, provider);
    return toDisposable(() => {
      this._proxy.$unregisterFileIgnoreProvider(handle);
      this._ignoredFileProviders.delete(handle);
    });
  }
  registerLanguageModelProxyProvider(extension, provider) {
    checkProposedApiEnabled(extension, "chatParticipantPrivate");
    this._languageModelProxyProvider = provider;
    this._onDidChangeModelProxyAvailability.fire();
    return toDisposable(() => {
      if (this._languageModelProxyProvider === provider) {
        this._languageModelProxyProvider = void 0;
        this._onDidChangeModelProxyAvailability.fire();
      }
    });
  }
};
ExtHostLanguageModels._idPool = 1;
ExtHostLanguageModels = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IExtHostAuthentication)
], ExtHostLanguageModels);
export {
  ExtHostLanguageModels,
  IExtHostLanguageModels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RMYW5ndWFnZU1vZGVscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlUHJvZHVjZXIsIEFzeW5jSXRlcmFibGVTb3VyY2UsIFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgU2VyaWFsaXplZEVycm9yLCB0cmFuc2Zvcm1FcnJvckZvclNlcmlhbGl6YXRpb24sIHRyYW5zZm9ybUVycm9yRnJvbVNlcmlhbGl6YXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVNYXAsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBFeHRlbnNpb25JZGVudGlmaWVyU2V0LCBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX1ZFTkRPUl9JRCwgSUNoYXRNZXNzYWdlLCBJQ2hhdFJlc3BvbnNlUGFydCwgSUxhbmd1YWdlTW9kZWxDaGF0SW5mb09wdGlvbnMsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZCwgaXNQcm9wb3NlZEFwaUVuYWJsZWQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RMYW5ndWFnZU1vZGVsc1NoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzU2hhcGUgfSBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RBdXRoZW50aWNhdGlvbiB9IGZyb20gJy4vZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0UnBjU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdFJwY1NlcnZpY2UuanMnO1xuaW1wb3J0ICogYXMgdHlwZUNvbnZlcnQgZnJvbSAnLi9leHRIb3N0VHlwZUNvbnZlcnRlcnMuanMnO1xuaW1wb3J0ICogYXMgZXh0SG9zdFR5cGVzIGZyb20gJy4vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMgZXh0ZW5kcyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMgeyB9XG5cbmV4cG9ydCBjb25zdCBJRXh0SG9zdExhbmd1YWdlTW9kZWxzID0gY3JlYXRlRGVjb3JhdG9yPElFeHRIb3N0TGFuZ3VhZ2VNb2RlbHM+KCdJRXh0SG9zdExhbmd1YWdlTW9kZWxzJyk7XG5cbnR5cGUgTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyRGF0YSA9IHtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb247XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlcjtcbn07XG5cbnR5cGUgTE1SZXNwb25zZVBhcnQgPSB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0IHwgdnNjb2RlLkxhbmd1YWdlTW9kZWxUb29sQ2FsbFBhcnQgfCB2c2NvZGUuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0IHwgdnNjb2RlLkxhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQ7XG5cblxuY2xhc3MgTGFuZ3VhZ2VNb2RlbFJlc3BvbnNlIHtcblxuXHRyZWFkb25seSBhcGlPYmplY3Q6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlZmF1bHRTdHJlYW0gPSBuZXcgQXN5bmNJdGVyYWJsZVNvdXJjZTxMTVJlc3BvbnNlUGFydD4oKTtcblx0cHJpdmF0ZSBfaXNEb25lOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblxuXHRcdGNvbnN0IFtzdHJlYW0xLCBzdHJlYW0yXSA9IEFzeW5jSXRlcmFibGVQcm9kdWNlci50ZWUodGhhdC5fZGVmYXVsdFN0cmVhbS5hc3luY0l0ZXJhYmxlKTtcblxuXHRcdHRoaXMuYXBpT2JqZWN0ID0ge1xuXHRcdFx0Ly8gcmVzdWx0OiBwcm9taXNlLFxuXHRcdFx0Z2V0IHN0cmVhbSgpIHtcblx0XHRcdFx0cmV0dXJuIHN0cmVhbTE7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IHRleHQoKSB7XG5cdFx0XHRcdHJldHVybiBzdHJlYW0yLm1hcChwYXJ0ID0+IHtcblx0XHRcdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVGV4dFBhcnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBwYXJ0LnZhbHVlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkuY29hbGVzY2UoKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGhhbmRsZVJlc3BvbnNlUGFydChwYXJ0czogSUNoYXRSZXNwb25zZVBhcnQgfCBJQ2hhdFJlc3BvbnNlUGFydFtdKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzRG9uZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxtUmVzcG9uc2VQYXJ0czogTE1SZXNwb25zZVBhcnRbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIEl0ZXJhYmxlLndyYXAocGFydHMpKSB7XG5cblx0XHRcdGxldCBvdXQ6IExNUmVzcG9uc2VQYXJ0O1xuXHRcdFx0aWYgKHBhcnQudHlwZSA9PT0gJ3RleHQnKSB7XG5cdFx0XHRcdG91dCA9IG5ldyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRleHRQYXJ0KHBhcnQudmFsdWUsIHBhcnQuYXVkaWVuY2UpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXJ0LnR5cGUgPT09ICd0aGlua2luZycpIHtcblx0XHRcdFx0b3V0ID0gbmV3IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVGhpbmtpbmdQYXJ0KHBhcnQudmFsdWUsIHBhcnQuaWQsIHBhcnQubWV0YWRhdGEpO1xuXG5cdFx0XHR9IGVsc2UgaWYgKHBhcnQudHlwZSA9PT0gJ2RhdGEnKSB7XG5cdFx0XHRcdG91dCA9IG5ldyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbERhdGFQYXJ0KHBhcnQuZGF0YS5idWZmZXIsIHBhcnQubWltZVR5cGUsIHBhcnQuYXVkaWVuY2UpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0b3V0ID0gbmV3IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsVG9vbENhbGxQYXJ0KHBhcnQudG9vbENhbGxJZCwgcGFydC5uYW1lLCBwYXJ0LnBhcmFtZXRlcnMpO1xuXHRcdFx0fVxuXHRcdFx0bG1SZXNwb25zZVBhcnRzLnB1c2gob3V0KTtcblx0XHR9XG5cblx0XHR0aGlzLl9kZWZhdWx0U3RyZWFtLmVtaXRNYW55KGxtUmVzcG9uc2VQYXJ0cyk7XG5cdH1cblxuXHRyZWplY3QoZXJyOiBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX2lzRG9uZSA9IHRydWU7XG5cdFx0dGhpcy5fZGVmYXVsdFN0cmVhbS5yZWplY3QoZXJyKTtcblx0fVxuXG5cdHJlc29sdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNEb25lID0gdHJ1ZTtcblx0XHR0aGlzLl9kZWZhdWx0U3RyZWFtLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0SG9zdExhbmd1YWdlTW9kZWxzIGltcGxlbWVudHMgRXh0SG9zdExhbmd1YWdlTW9kZWxzU2hhcGUge1xuXG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIF9pZFBvb2wgPSAxO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbEFjY2VzcyA9IG5ldyBFbWl0dGVyPHsgZnJvbTogRXh0ZW5zaW9uSWRlbnRpZmllcjsgdG86IEV4dGVuc2lvbklkZW50aWZpZXIgfT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcm92aWRlcnMgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVByb3ZpZGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvdmlkZXJzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGVsUHJveHlBdmFpbGFiaWxpdHkgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1vZGVsUHJveHlBdmFpbGFiaWxpdHkgPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsUHJveHlBdmFpbGFiaWxpdHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VNb2RlbFByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBMYW5ndWFnZU1vZGVsUHJvdmlkZXJEYXRhPigpO1xuXHQvLyBUT0RPIEBscmFtb3MxNSAtIFJlbW92ZSB0aGUgbmVlZCBmb3IgYm90aCBpbmZvIGFuZCBtZXRhZGF0YSBhcyBpdCdzIGEgbG90IG9mIHJlZHVuZGFuY3kuIFNob3VsZCBqdXN0IG5lZWQgb25lXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2FsTW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIHsgZ3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZDsgbWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhOyBpbmZvOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRJbmZvcm1hdGlvbiB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbEFjY2Vzc0xpc3QgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25JZGVudGlmaWVyU2V0PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmVxdWVzdCA9IG5ldyBNYXA8bnVtYmVyLCB7IGxhbmd1YWdlTW9kZWxJZDogc3RyaW5nOyByZXM6IExhbmd1YWdlTW9kZWxSZXNwb25zZSB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2FuY2VsQ1RTID0gbmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaWdub3JlZEZpbGVQcm92aWRlcnMgPSBuZXcgTWFwPG51bWJlciwgdnNjb2RlLkxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZVByb3ZpZGVyPigpO1xuXHRwcml2YXRlIF9sYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlcjogdnNjb2RlLkxhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0SG9zdFJwY1NlcnZpY2UgZXh0SG9zdFJwYzogSUV4dEhvc3RScGNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dEhvc3RBdXRoZW50aWNhdGlvbiBwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0QXV0aGVudGljYXRpb246IElFeHRIb3N0QXV0aGVudGljYXRpb24sXG5cdCkge1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdFJwYy5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsQWNjZXNzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVByb3ZpZGVycy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdC5jbGVhcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cmVnaXN0ZXJMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB2ZW5kb3I6IHN0cmluZywgcHJvdmlkZXI6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXG5cdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbFByb3ZpZGVycy5zZXQodmVuZG9yLCB7IGV4dGVuc2lvbjogZXh0ZW5zaW9uLCBwcm92aWRlciB9KTtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIodmVuZG9yKTtcblxuXHRcdGxldCBwcm92aWRlckNoYW5nZUV2ZW50RGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3ZpZGVyLm9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvcm1hdGlvbikge1xuXHRcdFx0cHJvdmlkZXJDaGFuZ2VFdmVudERpc3Bvc2FibGUgPSBwcm92aWRlci5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxDaGF0SW5mb3JtYXRpb24oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25MTVByb3ZpZGVyQ2hhbmdlKHZlbmRvcik7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2xhbmd1YWdlTW9kZWxQcm92aWRlcnMuZGVsZXRlKHZlbmRvcik7XG5cdFx0XHR0aGlzLl9sb2NhbE1vZGVscy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG5cdFx0XHRcdGlmICh2YWx1ZS5tZXRhZGF0YS52ZW5kb3IgPT09IHZlbmRvcikge1xuXHRcdFx0XHRcdHRoaXMuX2xvY2FsTW9kZWxzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHByb3ZpZGVyQ2hhbmdlRXZlbnREaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9wcm94eS4kdW5yZWdpc3RlclByb3ZpZGVyKHZlbmRvcik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHRvTW9kZWxJZGVudGlmaWVyKHZlbmRvcjogc3RyaW5nLCBncm91cDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtb2RlbElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBncm91cCA/IGAke3ZlbmRvcn0vJHtncm91cH0vJHttb2RlbElkfWAgOiBgJHt2ZW5kb3J9LyR7bW9kZWxJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWZW5kb3JGcm9tTW9kZWxJZGVudGlmaWVyKG1vZGVsSWRlbnRpZmllcjogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmaXJzdFNsYXNoID0gbW9kZWxJZGVudGlmaWVyLmluZGV4T2YoJy8nKTtcblx0XHRyZXR1cm4gZmlyc3RTbGFzaCA9PT0gLTEgPyB1bmRlZmluZWQgOiBtb2RlbElkZW50aWZpZXIuc3Vic3RyaW5nKDAsIGZpcnN0U2xhc2gpO1xuXHR9XG5cblx0YXN5bmMgJHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm8odmVuZG9yOiBzdHJpbmcsIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdEluZm9PcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcltdPiB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2xhbmd1YWdlTW9kZWxQcm92aWRlcnMuZ2V0KHZlbmRvcik7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsSW5mb3JtYXRpb246IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdEluZm9ybWF0aW9uW10gPSBhd2FpdCBkYXRhLnByb3ZpZGVyLnByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm9ybWF0aW9uKHsgc2lsZW50OiBvcHRpb25zLnNpbGVudCwgY29uZmlndXJhdGlvbjogb3B0aW9ucy5jb25maWd1cmF0aW9uIH0sIHRva2VuKSA/PyBbXTtcblx0XHRjb25zdCBtb2RlbE1ldGFkYXRhQW5kSWRlbnRpZmllcjogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10gPSBtb2RlbEluZm9ybWF0aW9uLm1hcCgobSk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9PiB7XG5cdFx0XHRsZXQgYXV0aDtcblx0XHRcdGlmIChtLnJlcXVpcmVzQXV0aG9yaXphdGlvbiAmJiBpc1Byb3Bvc2VkQXBpRW5hYmxlZChkYXRhLmV4dGVuc2lvbiwgJ2NoYXRQcm92aWRlcicpKSB7XG5cdFx0XHRcdGF1dGggPSB7XG5cdFx0XHRcdFx0cHJvdmlkZXJMYWJlbDogZGF0YS5leHRlbnNpb24uZGlzcGxheU5hbWUgfHwgZGF0YS5leHRlbnNpb24ubmFtZSxcblx0XHRcdFx0XHRhY2NvdW50TGFiZWw6IHR5cGVvZiBtLnJlcXVpcmVzQXV0aG9yaXphdGlvbiA9PT0gJ29iamVjdCcgPyBtLnJlcXVpcmVzQXV0aG9yaXphdGlvbi5sYWJlbCA6IHVuZGVmaW5lZFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKG0uY2FwYWJpbGl0aWVzLmVkaXRUb29scykge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChkYXRhLmV4dGVuc2lvbiwgJ2NoYXRQcm92aWRlcicpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbSyBpbiBDaGF0QWdlbnRMb2NhdGlvbl0/OiBib29sZWFuIH0gPSB7fTtcblx0XHRcdGlmIChpc1Byb3Bvc2VkQXBpRW5hYmxlZChkYXRhLmV4dGVuc2lvbiwgJ2NoYXRQcm92aWRlcicpKSB7XG5cdFx0XHRcdGlmIChtLmlzRGVmYXVsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC52YWx1ZXMoQ2hhdEFnZW50TG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRpZiAodHlwZW9mIGtleSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb25ba2V5IGFzIENoYXRBZ2VudExvY2F0aW9uXSA9IHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBtLmlzRGVmYXVsdCA9PT0gJ29iamVjdCcpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhtLmlzRGVmYXVsdCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVudW1LZXkgPSBwYXJzZUludChrZXkpIGFzIGV4dEhvc3RUeXBlcy5DaGF0TG9jYXRpb247XG5cdFx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvblt0eXBlQ29udmVydC5DaGF0TG9jYXRpb24uZnJvbShlbnVtS2V5KV0gPSBtLmlzRGVmYXVsdFtlbnVtS2V5XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRleHRlbnNpb246IGRhdGEuZXh0ZW5zaW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdFx0aWQ6IG0uaWQsXG5cdFx0XHRcdFx0dmVuZG9yLFxuXHRcdFx0XHRcdG5hbWU6IG0ubmFtZSA/PyAnJyxcblx0XHRcdFx0XHRmYW1pbHk6IG0uZmFtaWx5ID8/ICcnLFxuXHRcdFx0XHRcdGRldGFpbDogbS5kZXRhaWwsXG5cdFx0XHRcdFx0dG9vbHRpcDogbS50b29sdGlwLFxuXHRcdFx0XHRcdHZlcnNpb246IG0udmVyc2lvbixcblx0XHRcdFx0XHRtdWx0aXBsaWVyTnVtZXJpYzogbS5tdWx0aXBsaWVyTnVtZXJpYyxcblx0XHRcdFx0XHRpc0JZT0s6IG0uaXNCWU9LLFxuXHRcdFx0XHRcdHByaWNpbmc6IG0ucHJpY2luZyxcblx0XHRcdFx0XHRpbnB1dENvc3Q6IG0uaW5wdXRDb3N0LFxuXHRcdFx0XHRcdG91dHB1dENvc3Q6IG0ub3V0cHV0Q29zdCxcblx0XHRcdFx0XHRjYWNoZUNvc3Q6IG0uY2FjaGVDb3N0LFxuXHRcdFx0XHRcdGNhY2hlV3JpdGVDb3N0OiBtLmNhY2hlV3JpdGVDb3N0LFxuXHRcdFx0XHRcdGxvbmdDb250ZXh0SW5wdXRDb3N0OiBtLmxvbmdDb250ZXh0SW5wdXRDb3N0LFxuXHRcdFx0XHRcdGxvbmdDb250ZXh0T3V0cHV0Q29zdDogbS5sb25nQ29udGV4dE91dHB1dENvc3QsXG5cdFx0XHRcdFx0bG9uZ0NvbnRleHRDYWNoZUNvc3Q6IG0ubG9uZ0NvbnRleHRDYWNoZUNvc3QsXG5cdFx0XHRcdFx0bG9uZ0NvbnRleHRDYWNoZVdyaXRlQ29zdDogbS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0LFxuXHRcdFx0XHRcdHByaWNlQ2F0ZWdvcnk6IG0ucHJpY2VDYXRlZ29yeSxcblx0XHRcdFx0XHRjYXRlZ29yeTogbS5jYXRlZ29yeSxcblx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogbS5tYXhJbnB1dFRva2Vucyxcblx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IG0ubWF4T3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRcdGF1dGgsXG5cdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb24sXG5cdFx0XHRcdFx0aXNVc2VyU2VsZWN0YWJsZTogbS5pc1VzZXJTZWxlY3RhYmxlLFxuXHRcdFx0XHRcdHN0YXR1c0ljb246IG0uc3RhdHVzSWNvbixcblx0XHRcdFx0XHR0YXJnZXRDaGF0U2Vzc2lvblR5cGU6IG0udGFyZ2V0Q2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TY2hlbWE6IG0uY29uZmlndXJhdGlvblNjaGVtYSBhcyBJSlNPTlNjaGVtYSB8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR3YXJuaW5nVGV4dDogbS53YXJuaW5nVGV4dCxcblx0XHRcdFx0XHRwcm9tbzogbS5wcm9tbyxcblx0XHRcdFx0XHRjYXBhYmlsaXRpZXM6IG0uY2FwYWJpbGl0aWVzID8ge1xuXHRcdFx0XHRcdFx0dmlzaW9uOiBtLmNhcGFiaWxpdGllcy5pbWFnZUlucHV0LFxuXHRcdFx0XHRcdFx0ZWRpdFRvb2xzOiBtLmNhcGFiaWxpdGllcy5lZGl0VG9vbHMsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbGluZzogISFtLmNhcGFiaWxpdGllcy50b29sQ2FsbGluZyxcblx0XHRcdFx0XHRcdGFnZW50TW9kZTogISFtLmNhcGFiaWxpdGllcy50b29sQ2FsbGluZ1xuXHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aWZpZXI6IHRoaXMudG9Nb2RlbElkZW50aWZpZXIodmVuZG9yLCBvcHRpb25zLmdyb3VwLCBtLmlkKVxuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2xvY2FsTW9kZWxzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcblx0XHRcdGlmICh2YWx1ZS5tZXRhZGF0YS52ZW5kb3IgPT09IHZlbmRvciAmJiB2YWx1ZS5ncm91cCA9PT0gb3B0aW9ucy5ncm91cCkge1xuXHRcdFx0XHR0aGlzLl9sb2NhbE1vZGVscy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbW9kZWxNZXRhZGF0YUFuZElkZW50aWZpZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX2xvY2FsTW9kZWxzLnNldChtb2RlbE1ldGFkYXRhQW5kSWRlbnRpZmllcltpXS5pZGVudGlmaWVyLCB7XG5cdFx0XHRcdGdyb3VwOiBvcHRpb25zLmdyb3VwLFxuXHRcdFx0XHRtZXRhZGF0YTogbW9kZWxNZXRhZGF0YUFuZElkZW50aWZpZXJbaV0ubWV0YWRhdGEsXG5cdFx0XHRcdGluZm86IG1vZGVsSW5mb3JtYXRpb25baV1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbE1ldGFkYXRhQW5kSWRlbnRpZmllcjtcblx0fVxuXG5cdGFzeW5jICRzdGFydENoYXRSZXF1ZXN0KG1vZGVsSWQ6IHN0cmluZywgcmVxdWVzdElkOiBudW1iZXIsIGZyb206IEV4dGVuc2lvbklkZW50aWZpZXIgfCB1bmRlZmluZWQsIG1lc3NhZ2VzOiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxJQ2hhdE1lc3NhZ2VbXT4sIG9wdGlvbnM6IElMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrbm93bk1vZGVsID0gdGhpcy5fbG9jYWxNb2RlbHMuZ2V0KG1vZGVsSWQpO1xuXHRcdGlmICgha25vd25Nb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdNb2RlbCBub3QgZm91bmQnKTtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbFByb3ZpZGVycy5nZXQoa25vd25Nb2RlbC5tZXRhZGF0YS52ZW5kb3IpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBwcm92aWRlciBmb3IgJyR7a25vd25Nb2RlbC5tZXRhZGF0YS5pZH0nIG5vdCBmb3VuZC5gKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgYSBsb2NhbCBDVFMgc28gdGhlIHByb3ZpZGVyJ3MgdG9rZW4gY2FuIGJlIGNhbmNlbGxlZCB2aWFcblx0XHQvLyAkY2FuY2VsTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0IGV2ZW4gYWZ0ZXIgdGhlIFJQQyBjYW5jZWwgaGFuZGxlclxuXHRcdC8vIGZvciB0aGUgb3JpZ2luYWwgdG9rZW4gaGFzIGJlZW4gcmVtb3ZlZC5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuc2V0KHJlcXVlc3RJZCwgY3RzKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyVG9rZW4gPSBjdHMudG9rZW47XG5cblx0XHRjb25zdCBxdWV1ZTogSUNoYXRSZXNwb25zZVBhcnRbXSA9IFtdO1xuXHRcdGNvbnN0IHNlbmROb3cgPSAoKSA9PiB7XG5cdFx0XHRpZiAocXVldWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kcmVwb3J0UmVzcG9uc2VQYXJ0KHJlcXVlc3RJZCwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHF1ZXVlKSk7XG5cdFx0XHRcdHF1ZXVlLmxlbmd0aCA9IDA7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBxdWV1ZVNjaGVkdWxlciA9IG5ldyBSdW5PbmNlU2NoZWR1bGVyKHNlbmROb3csIDMwKTtcblx0XHRjb25zdCBzZW5kU29vbiA9IChwYXJ0OiBJQ2hhdFJlc3BvbnNlUGFydCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV3TGVuID0gcXVldWUucHVzaChwYXJ0KTtcblx0XHRcdC8vIGZsdXNoL3NlbmQgaWYgdGhpbmdzIHBpbGUgdXAgbW9yZSB0aGFuIGV4cGVjdGVkXG5cdFx0XHRpZiAobmV3TGVuID4gMzApIHtcblx0XHRcdFx0c2VuZE5vdygpO1xuXHRcdFx0XHRxdWV1ZVNjaGVkdWxlci5jYW5jZWwoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHF1ZXVlU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByb2dyZXNzID0gbmV3IFByb2dyZXNzPHZzY29kZS5MYW5ndWFnZU1vZGVsVGV4dFBhcnQgfCB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCB8IHZzY29kZS5MYW5ndWFnZU1vZGVsRGF0YVBhcnQgfCB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFRoaW5raW5nUGFydD4oYXN5bmMgZnJhZ21lbnQgPT4ge1xuXHRcdFx0aWYgKHByb3ZpZGVyVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ0hBVF0oJHtkYXRhLmV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfSkgQ0FOTk9UIHNlbmQgcHJvZ3Jlc3MgYmVjYXVzZSB0aGUgUkVRVUVTVCBJUyBDQU5DRUxMRURgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgcGFydDogSUNoYXRSZXNwb25zZVBhcnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZnJhZ21lbnQgaW5zdGFuY2VvZiBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbFRvb2xDYWxsUGFydCkge1xuXHRcdFx0XHRwYXJ0ID0geyB0eXBlOiAndG9vbF91c2UnLCBuYW1lOiBmcmFnbWVudC5uYW1lLCBwYXJhbWV0ZXJzOiBmcmFnbWVudC5pbnB1dCwgdG9vbENhbGxJZDogZnJhZ21lbnQuY2FsbElkIH07XG5cdFx0XHR9IGVsc2UgaWYgKGZyYWdtZW50IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUZXh0UGFydCkge1xuXHRcdFx0XHRwYXJ0ID0geyB0eXBlOiAndGV4dCcsIHZhbHVlOiBmcmFnbWVudC52YWx1ZSwgYXVkaWVuY2U6IGZyYWdtZW50LmF1ZGllbmNlIH07XG5cdFx0XHR9IGVsc2UgaWYgKGZyYWdtZW50IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxEYXRhUGFydCkge1xuXHRcdFx0XHRwYXJ0ID0geyB0eXBlOiAnZGF0YScsIG1pbWVUeXBlOiBmcmFnbWVudC5taW1lVHlwZSwgZGF0YTogVlNCdWZmZXIud3JhcChmcmFnbWVudC5kYXRhKSwgYXVkaWVuY2U6IGZyYWdtZW50LmF1ZGllbmNlIH07XG5cdFx0XHR9IGVsc2UgaWYgKGZyYWdtZW50IGluc3RhbmNlb2YgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxUaGlua2luZ1BhcnQpIHtcblx0XHRcdFx0cGFydCA9IHsgdHlwZTogJ3RoaW5raW5nJywgdmFsdWU6IGZyYWdtZW50LnZhbHVlLCBpZDogZnJhZ21lbnQuaWQsIG1ldGFkYXRhOiBmcmFnbWVudC5tZXRhZGF0YSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXBhcnQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ0hBVF0oJHtkYXRhLmV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlfSkgVU5LTk9XTiBwYXJ0ICR7SlNPTi5zdHJpbmdpZnkoZnJhZ21lbnQpfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHNlbmRTb29uKHBhcnQpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IHZhbHVlOiB1bmtub3duO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHZhbHVlID0gZGF0YS5wcm92aWRlci5wcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZShcblx0XHRcdFx0a25vd25Nb2RlbC5pbmZvLFxuXHRcdFx0XHRtZXNzYWdlcy52YWx1ZS5tYXAodHlwZUNvbnZlcnQuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMi50byksXG5cdFx0XHRcdC8vIHRvZG9AY29ubm9yNDMxMjogbW92ZSBgY29yZWAgLT4gYHVuZGVmaW5lZGAgYWZ0ZXIgMS4xMTEgSW5zaWRlcnMgaXMgb3V0XG5cdFx0XHRcdHsgLi4ub3B0aW9ucywgbW9kZWxPcHRpb25zOiBvcHRpb25zLm1vZGVsT3B0aW9ucyA/PyB7fSwgbW9kZWxDb25maWd1cmF0aW9uOiBvcHRpb25zLmNvbmZpZ3VyYXRpb24sIHJlcXVlc3RJbml0aWF0b3I6IGZyb20gPyBFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGZyb20pIDogJ2NvcmUnLCB0b29sTW9kZTogb3B0aW9ucy50b29sTW9kZSA/PyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbENoYXRUb29sTW9kZS5BdXRvLCBpbmNsdWRlRW5jcnlwdGVkVGhpbmtpbmc6IG9wdGlvbnMuaW5jbHVkZUVuY3J5cHRlZFRoaW5raW5nIH0sXG5cdFx0XHRcdHByb2dyZXNzLFxuXHRcdFx0XHRwcm92aWRlclRva2VuXG5cdFx0XHQpO1xuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBzeW5jaHJvbm91c2x5IGZhaWxlZFxuXHRcdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5kZWxldGVBbmREaXNwb3NlKHJlcXVlc3RJZCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0UHJvbWlzZS5yZXNvbHZlKHZhbHVlKS50aGVuKCgpID0+IHtcblx0XHRcdHNlbmROb3coKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHJlcG9ydFJlc3BvbnNlRG9uZShyZXF1ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdHNlbmROb3coKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJHJlcG9ydFJlc3BvbnNlRG9uZShyZXF1ZXN0SWQsIHRyYW5zZm9ybUVycm9yRm9yU2VyaWFsaXphdGlvbihlcnIpKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vI3JlZ2lvbiAtLS0gdG9rZW4gY291bnRpbmdcblxuXHQkY2FuY2VsTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0KHJlcXVlc3RJZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5nZXQocmVxdWVzdElkKT8uY2FuY2VsKCk7XG5cdH1cblxuXHQkcHJvdmlkZVRva2VuTGVuZ3RoKG1vZGVsSWQ6IHN0cmluZywgdmFsdWU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxudW1iZXI+IHtcblx0XHRjb25zdCBrbm93bk1vZGVsID0gdGhpcy5fbG9jYWxNb2RlbHMuZ2V0KG1vZGVsSWQpO1xuXHRcdGlmICgha25vd25Nb2RlbCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgwKTtcblx0XHR9XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2xhbmd1YWdlTW9kZWxQcm92aWRlcnMuZ2V0KGtub3duTW9kZWwubWV0YWRhdGEudmVuZG9yKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoMCk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZGF0YS5wcm92aWRlci5wcm92aWRlVG9rZW5Db3VudChrbm93bk1vZGVsLmluZm8sIHZhbHVlLCB0b2tlbikpO1xuXHR9XG5cblxuXHQvLyNyZWdpb24gLS0tIG1ha2luZyByZXF1ZXN0XG5cblx0YXN5bmMgZ2V0RGVmYXVsdExhbmd1YWdlTW9kZWwoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGZvcmNlUmVzb2x2ZU1vZGVscz86IGJvb2xlYW4pOiBQcm9taXNlPHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBkZWZhdWx0TW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGZvcmNlUmVzb2x2ZU1vZGVscykge1xuXHRcdFx0YXdhaXQgdGhpcy5zZWxlY3RMYW5ndWFnZU1vZGVscyhleHRlbnNpb24sIHt9KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IFttb2RlbElkZW50aWZpZXIsIG1vZGVsRGF0YV0gb2YgdGhpcy5fbG9jYWxNb2RlbHMpIHtcblx0XHRcdGlmIChtb2RlbERhdGEubWV0YWRhdGEuaXNEZWZhdWx0Rm9yTG9jYXRpb25bQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF0gJiYgbW9kZWxEYXRhLm1ldGFkYXRhLnZlbmRvciA9PT0gQ09QSUxPVF9WRU5ET1JfSUQpIHtcblx0XHRcdFx0ZGVmYXVsdE1vZGVsSWQgPSBtb2RlbElkZW50aWZpZXI7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIWRlZmF1bHRNb2RlbElkICYmICFmb3JjZVJlc29sdmVNb2RlbHMpIHtcblx0XHRcdC8vIE1heWJlIHRoZSBkZWZhdWx0IHdhc24ndCBjYWNoZWQgc28gd2Ugd2lsbCB0cnkgYWdhaW4gd2l0aCByZXNvbHZpbmcgdGhlIG1vZGVscyB0b29cblx0XHRcdHJldHVybiB0aGlzLmdldERlZmF1bHRMYW5ndWFnZU1vZGVsKGV4dGVuc2lvbiwgdHJ1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmdldExhbmd1YWdlTW9kZWxCeUlkZW50aWZpZXIoZXh0ZW5zaW9uLCBkZWZhdWx0TW9kZWxJZCk7XG5cdH1cblxuXHRhc3luYyBnZXRMYW5ndWFnZU1vZGVsQnlJZGVudGlmaWVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghbW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2xvY2FsTW9kZWxzLmhhcyhtb2RlbElkKSkge1xuXHRcdFx0Ly8gbW9kZWwgZ29uZT8gaXMgdGhpcyBhbiBlcnJvciBvbiB1cz8gVHJ5IHRvIHJlc29sdmUgbW9kZWwgYWdhaW5cblx0XHRcdGNvbnN0IHZlbmRvciA9IHRoaXMuZ2V0VmVuZG9yRnJvbU1vZGVsSWRlbnRpZmllcihtb2RlbElkKTtcblx0XHRcdGlmICghdmVuZG9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xhbmd1YWdlTW9kZWxQcm94eV0oJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0pIENvdWxkIG5vdCBleHRyYWN0IHZlbmRvciBmcm9tIG1vZGVsIGlkZW50aWZpZXIgJyR7bW9kZWxJZH0nLmApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0xhbmd1YWdlTW9kZWxQcm94eV0oJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0pIENvdWxkIG5vdCBmaW5kIG1vZGVsICcke21vZGVsSWR9JyBpbiBsb2NhbCBjYWNoZS4gVHJ5aW5nIHRvIHJlc29sdmUgbW9kZWwgYWdhaW4uYCk7XG5cdFx0XHQvLyBDYWxsIHByb3h5IGRpcmVjdGx5OiByb3V0aW5nIHRocm91Z2ggYHNlbGVjdExhbmd1YWdlTW9kZWxzYCB3b3VsZCByZWN1cnNlIGhlcmUgZm9yIGV2ZXJ5IGlkZW50aWZpZXIgYW5kIGJsb3cgdXAgd2hlbiB0aGUgY2FjaGUgc3RheXMgZW1wdHkgKHByb3ZpZGVyIGluIGFub3RoZXIgZXh0IGhvc3QpLlxuXHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJHNlbGVjdENoYXRNb2RlbHMoeyB2ZW5kb3IsIGV4dGVuc2lvbjogZXh0ZW5zaW9uLmlkZW50aWZpZXIgfSk7XG5cdFx0XHRpZiAoIXRoaXMuX2xvY2FsTW9kZWxzLmhhcyhtb2RlbElkKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtMYW5ndWFnZU1vZGVsUHJveHldKCR7ZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWV9KSBDb3VsZCBub3QgZmluZCBtb2RlbCAnJHttb2RlbElkfScgaW4gbG9jYWwgY2FjaGUgYWZ0ZXIgcmUtcmVzb2x2aW5nIG1vZGVscy5gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlTGFuZ3VhZ2VNb2RlbENoYXRBcGkoZXh0ZW5zaW9uLCBtb2RlbElkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUxhbmd1YWdlTW9kZWxDaGF0QXBpKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBtb2RlbElkOiBzdHJpbmcpOiBQcm9taXNlPHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbG9jYWxNb2RlbHMuZ2V0KG1vZGVsSWQpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gbWFrZSBzdXJlIGF1dGggaW5mb3JtYXRpb24gaXMgY29ycmVjdFxuXHRcdGlmICh0aGlzLl9pc1VzaW5nQXV0aChleHRlbnNpb24uaWRlbnRpZmllciwgbW9kZWwubWV0YWRhdGEpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9mYWtlQXV0aFBvcHVsYXRlKG1vZGVsLm1ldGFkYXRhKTtcblx0XHR9XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBhcGlPYmplY3Q6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCA9IHtcblx0XHRcdGlkOiBtb2RlbC5pbmZvLmlkLFxuXHRcdFx0dmVuZG9yOiBtb2RlbC5tZXRhZGF0YS52ZW5kb3IsXG5cdFx0XHRmYW1pbHk6IG1vZGVsLmluZm8uZmFtaWx5LFxuXHRcdFx0dmVyc2lvbjogbW9kZWwuaW5mby52ZXJzaW9uLFxuXHRcdFx0bmFtZTogbW9kZWwuaW5mby5uYW1lLFxuXHRcdFx0cHJpY2luZzogbW9kZWwubWV0YWRhdGEucHJpY2luZyxcblx0XHRcdGlucHV0Q29zdDogbW9kZWwubWV0YWRhdGEuaW5wdXRDb3N0LFxuXHRcdFx0b3V0cHV0Q29zdDogbW9kZWwubWV0YWRhdGEub3V0cHV0Q29zdCxcblx0XHRcdGNhY2hlQ29zdDogbW9kZWwubWV0YWRhdGEuY2FjaGVDb3N0LFxuXHRcdFx0Y2FjaGVXcml0ZUNvc3Q6IG1vZGVsLm1ldGFkYXRhLmNhY2hlV3JpdGVDb3N0LFxuXHRcdFx0bG9uZ0NvbnRleHRJbnB1dENvc3Q6IG1vZGVsLm1ldGFkYXRhLmxvbmdDb250ZXh0SW5wdXRDb3N0LFxuXHRcdFx0bG9uZ0NvbnRleHRPdXRwdXRDb3N0OiBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dE91dHB1dENvc3QsXG5cdFx0XHRsb25nQ29udGV4dENhY2hlQ29zdDogbW9kZWwubWV0YWRhdGEubG9uZ0NvbnRleHRDYWNoZUNvc3QsXG5cdFx0XHRsb25nQ29udGV4dENhY2hlV3JpdGVDb3N0OiBtb2RlbC5tZXRhZGF0YS5sb25nQ29udGV4dENhY2hlV3JpdGVDb3N0LFxuXHRcdFx0cHJpY2VDYXRlZ29yeTogbW9kZWwubWV0YWRhdGEucHJpY2VDYXRlZ29yeSxcblx0XHRcdGNhdGVnb3J5OiBtb2RlbC5tZXRhZGF0YS5jYXRlZ29yeSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRzdXBwb3J0c0ltYWdlVG9UZXh0OiBtb2RlbC5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LnZpc2lvbiA/PyBmYWxzZSxcblx0XHRcdFx0c3VwcG9ydHNUb29sQ2FsbGluZzogISFtb2RlbC5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LnRvb2xDYWxsaW5nLFxuXHRcdFx0XHRlZGl0VG9vbHNIaW50OiBtb2RlbC5tZXRhZGF0YS5jYXBhYmlsaXRpZXM/LmVkaXRUb29scyxcblx0XHRcdH0sXG5cdFx0XHRtYXhJbnB1dFRva2VuczogbW9kZWwubWV0YWRhdGEubWF4SW5wdXRUb2tlbnMsXG5cdFx0XHRjb3VudFRva2Vucyh0ZXh0LCB0b2tlbikge1xuXHRcdFx0XHRpZiAoIXRoYXQuX2xvY2FsTW9kZWxzLmhhcyhtb2RlbElkKSkge1xuXHRcdFx0XHRcdHRocm93IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsRXJyb3IuTm90Rm91bmQobW9kZWxJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoYXQuX2NvbXB1dGVUb2tlbkxlbmd0aChtb2RlbElkLCB0ZXh0LCB0b2tlbiA/PyBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH0sXG5cdFx0XHRzZW5kUmVxdWVzdChtZXNzYWdlcywgb3B0aW9ucywgdG9rZW4pIHtcblx0XHRcdFx0aWYgKCF0aGF0Ll9sb2NhbE1vZGVscy5oYXMobW9kZWxJZCkpIHtcblx0XHRcdFx0XHR0aHJvdyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbEVycm9yLk5vdEZvdW5kKG1vZGVsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGF0Ll9zZW5kQ2hhdFJlcXVlc3QoZXh0ZW5zaW9uLCBtb2RlbElkLCBtZXNzYWdlcywgb3B0aW9ucyA/PyB7fSwgdG9rZW4gPz8gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdE9iamVjdC5mcmVlemUoYXBpT2JqZWN0KTtcblx0XHRyZXR1cm4gYXBpT2JqZWN0O1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0TGFuZ3VhZ2VNb2RlbHMoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHNlbGVjdG9yOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3Rvcikge1xuXG5cdFx0Ly8gdGhpcyB0cmlnZ2VycyBleHRlbnNpb24gYWN0aXZhdGlvblxuXHRcdGNvbnN0IG1vZGVscyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRzZWxlY3RDaGF0TW9kZWxzKHsgLi4uc2VsZWN0b3IsIGV4dGVuc2lvbjogZXh0ZW5zaW9uLmlkZW50aWZpZXIgfSk7XG5cblx0XHQvLyBTa2lwIHRoZSB3YXJuL3JldHJ5IHBhdGggaW4gYGdldExhbmd1YWdlTW9kZWxCeUlkZW50aWZpZXJgOiBpZGVudGlmaWVycyBhcmUgZnJlc2gsIHNvIGEgbWlzc2luZyBsb2NhbCBlbnRyeSBtZWFucyB0aGUgcHJvdmlkZXIgbGl2ZXMgaW4gYW5vdGhlciBleHQgaG9zdCBhbmQgcmUtcmVzb2x2aW5nIHdpbGwgbm90IGhlbHAuXG5cdFx0Y29uc3QgbW9kZWxSZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwobW9kZWxzLm1hcChpZGVudGlmaWVyID0+IHRoaXMuX2NyZWF0ZUxhbmd1YWdlTW9kZWxDaGF0QXBpKGV4dGVuc2lvbiwgaWRlbnRpZmllcikpKTtcblx0XHRyZXR1cm4gbW9kZWxSZXN1bHRzLmZpbHRlcigobSk6IG0gaXMgdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0ID0+ICEhbSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kQ2hhdFJlcXVlc3QoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIGxhbmd1YWdlTW9kZWxJZDogc3RyaW5nLCBtZXNzYWdlczogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0TWVzc2FnZTJbXSwgb3B0aW9uczogdnNjb2RlLkxhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXG5cdFx0Y29uc3QgaW50ZXJuYWxNZXNzYWdlczogSUNoYXRNZXNzYWdlW10gPSB0aGlzLl9jb252ZXJ0TWVzc2FnZXMoZXh0ZW5zaW9uLCBtZXNzYWdlcyk7XG5cblx0XHRjb25zdCBmcm9tID0gZXh0ZW5zaW9uLmlkZW50aWZpZXI7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLl9sb2NhbE1vZGVscy5nZXQobGFuZ3VhZ2VNb2RlbElkKT8ubWV0YWRhdGE7XG5cblx0XHRpZiAoIW1ldGFkYXRhIHx8ICF0aGlzLl9sb2NhbE1vZGVscy5oYXMobGFuZ3VhZ2VNb2RlbElkKSkge1xuXHRcdFx0dGhyb3cgZXh0SG9zdFR5cGVzLkxhbmd1YWdlTW9kZWxFcnJvci5Ob3RGb3VuZChgTGFuZ3VhZ2UgbW9kZWwgJyR7bGFuZ3VhZ2VNb2RlbElkfScgaXMgdW5rbm93bi5gKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5faXNVc2luZ0F1dGgoZnJvbSwgbWV0YWRhdGEpKSB7XG5cdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5fZ2V0QXV0aEFjY2VzcyhleHRlbnNpb24sIHsgaWRlbnRpZmllcjogbWV0YWRhdGEuZXh0ZW5zaW9uLCBkaXNwbGF5TmFtZTogbWV0YWRhdGEuYXV0aC5wcm92aWRlckxhYmVsIH0sIG9wdGlvbnMuanVzdGlmaWNhdGlvbiwgZmFsc2UpO1xuXG5cdFx0XHRpZiAoIXN1Y2Nlc3MgfHwgIXRoaXMuX21vZGVsQWNjZXNzTGlzdC5nZXQoZnJvbSk/LmhhcyhtZXRhZGF0YS5leHRlbnNpb24pKSB7XG5cdFx0XHRcdHRocm93IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsRXJyb3IuTm9QZXJtaXNzaW9ucyhgTGFuZ3VhZ2UgbW9kZWwgJyR7bGFuZ3VhZ2VNb2RlbElkfScgY2Fubm90IGJlIHVzZWQgYnkgJyR7ZnJvbS52YWx1ZX0nLmApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IChNYXRoLnJhbmRvbSgpICogMWU2KSB8IDA7XG5cdFx0Y29uc3QgcmVzID0gbmV3IExhbmd1YWdlTW9kZWxSZXNwb25zZSgpO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0LnNldChyZXF1ZXN0SWQsIHsgbGFuZ3VhZ2VNb2RlbElkLCByZXMgfSk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UodG9rZW4pO1xuXHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuc2V0KHJlcXVlc3RJZCwgY3RzKTtcblx0XHRjdHMudG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJveHkuJGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdChyZXF1ZXN0SWQpO1xuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiR0cnlTdGFydENoYXRSZXF1ZXN0KGZyb20sIGxhbmd1YWdlTW9kZWxJZCwgcmVxdWVzdElkLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoaW50ZXJuYWxNZXNzYWdlcyksIG9wdGlvbnMsIGN0cy50b2tlbik7XG5cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gZXJyb3InaW5nIGhlcmUgbWVhbnMgdGhhdCB0aGUgcmVxdWVzdCBjb3VsZCBOT1QgYmUgc3RhcnRlZC9tYWRlLCBlLmcuIHdyb25nIG1vZGVsLCBubyBhY2Nlc3MsIGV0YywgYnV0XG5cdFx0XHQvLyBsYXRlciB0aGUgcmVzcG9uc2UgY2FuIGZhaWwgYXMgd2VsbC4gVGhvc2UgZmFpbHVyZXMgYXJlIGNvbW11bmljYXRlZCB2aWEgdGhlIHN0cmVhbS1vYmplY3Rcblx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0LmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5kZWxldGVBbmREaXNwb3NlKHJlcXVlc3RJZCk7XG5cdFx0XHR0aHJvdyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbEVycm9yLnRyeURlc2VyaWFsaXplKGVycm9yKSA/PyBlcnJvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzLmFwaU9iamVjdDtcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRNZXNzYWdlcyhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgbWVzc2FnZXM6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyW10pIHtcblx0XHRjb25zdCBpbnRlcm5hbE1lc3NhZ2VzOiBJQ2hhdE1lc3NhZ2VbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBtZXNzYWdlcykge1xuXHRcdFx0aWYgKG1lc3NhZ2Uucm9sZSBhcyBudW1iZXIgPT09IGV4dEhvc3RUeXBlcy5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2VSb2xlLlN5c3RlbSkge1xuXHRcdFx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdsYW5ndWFnZU1vZGVsU3lzdGVtJyk7XG5cdFx0XHR9XG5cdFx0XHRpbnRlcm5hbE1lc3NhZ2VzLnB1c2godHlwZUNvbnZlcnQuTGFuZ3VhZ2VNb2RlbENoYXRNZXNzYWdlMi5mcm9tKG1lc3NhZ2UpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGludGVybmFsTWVzc2FnZXM7XG5cdH1cblxuXHRhc3luYyAkYWNjZXB0UmVzcG9uc2VQYXJ0KHJlcXVlc3RJZDogbnVtYmVyLCBjaHVuazogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SUNoYXRSZXNwb25zZVBhcnQgfCBJQ2hhdFJlc3BvbnNlUGFydFtdPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdC5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAoZGF0YSkge1xuXHRcdFx0ZGF0YS5yZXMuaGFuZGxlUmVzcG9uc2VQYXJ0KGNodW5rLnZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHQkb25DaGF0TW9kZWxzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlUHJvdmlkZXJzLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jICRhY2NlcHRSZXNwb25zZURvbmUocmVxdWVzdElkOiBudW1iZXIsIGVycm9yOiBTZXJpYWxpemVkRXJyb3IgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fcGVuZGluZ1JlcXVlc3QuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0LmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdGlmIChlcnJvcikge1xuXHRcdFx0Ly8gd2UgZXJyb3IgdGhlIHN0cmVhbSBiZWNhdXNlIHRoYXQncyB0aGUgb25seSB3YXkgdG8gc2lnbmFsXG5cdFx0XHQvLyB0aGF0IHRoZSByZXF1ZXN0IGhhcyBmYWlsZWRcblx0XHRcdGRhdGEucmVzLnJlamVjdChleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbEVycm9yLnRyeURlc2VyaWFsaXplKGVycm9yKSA/PyB0cmFuc2Zvcm1FcnJvckZyb21TZXJpYWxpemF0aW9uKGVycm9yKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEucmVzLnJlc29sdmUoKTtcblx0XHR9XG5cdH1cblxuXHQvLyBCSUcgSEFDSzogVXNpbmcgQXV0aGVudGljYXRpb25Qcm92aWRlcnMgdG8gY2hlY2sgYWNjZXNzIHRvIExhbmd1YWdlIE1vZGVsc1xuXHRwcml2YXRlIGFzeW5jIF9nZXRBdXRoQWNjZXNzKGZyb206IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdG86IHsgaWRlbnRpZmllcjogRXh0ZW5zaW9uSWRlbnRpZmllcjsgZGlzcGxheU5hbWU6IHN0cmluZyB9LCBqdXN0aWZpY2F0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQsIHNpbGVudDogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIFRoaXMgbmVlZHMgdG8gYmUgZG9uZSBpbiBib3RoIE1haW5UaHJlYWQgJiBFeHRIb3N0IENoYXRQcm92aWRlclxuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCArIHRvLmlkZW50aWZpZXIudmFsdWU7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2V4dEhvc3RBdXRoZW50aWNhdGlvbi5nZXRTZXNzaW9uKGZyb20sIHByb3ZpZGVySWQsIFtdLCB7IHNpbGVudDogdHJ1ZSB9KTtcblxuXHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLiR1cGRhdGVNb2RlbEFjY2Vzc2xpc3QoW3sgZnJvbTogZnJvbS5pZGVudGlmaWVyLCB0bzogdG8uaWRlbnRpZmllciwgZW5hYmxlZDogdHJ1ZSB9XSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoc2lsZW50KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRldGFpbCA9IGp1c3RpZmljYXRpb25cblx0XHRcdFx0PyBsb2NhbGl6ZSgnY2hhdEFjY2Vzc1dpdGhKdXN0aWZpY2F0aW9uJywgXCJKdXN0aWZpY2F0aW9uOiB7MX1cIiwgdG8uZGlzcGxheU5hbWUsIGp1c3RpZmljYXRpb24pXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0YXdhaXQgdGhpcy5fZXh0SG9zdEF1dGhlbnRpY2F0aW9uLmdldFNlc3Npb24oZnJvbSwgcHJvdmlkZXJJZCwgW10sIHsgZm9yY2VOZXdTZXNzaW9uOiB7IGRldGFpbCB9IH0pO1xuXHRcdFx0dGhpcy4kdXBkYXRlTW9kZWxBY2Nlc3NsaXN0KFt7IGZyb206IGZyb20uaWRlbnRpZmllciwgdG86IHRvLmlkZW50aWZpZXIsIGVuYWJsZWQ6IHRydWUgfV0pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIGlnbm9yZVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzVXNpbmdBdXRoKGZyb206IEV4dGVuc2lvbklkZW50aWZpZXIsIHRvTWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhKTogdG9NZXRhZGF0YSBpcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSAmIHsgYXV0aDogTm9uTnVsbGFibGU8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFbJ2F1dGgnXT4gfSB7XG5cdFx0Ly8gSWYgdGhlICd0bycgZXh0ZW5zaW9uIHVzZXMgYW4gYXV0aCBjaGVja1xuXHRcdHJldHVybiAhIXRvTWV0YWRhdGEuYXV0aFxuXHRcdFx0Ly8gQW5kIHdlJ3JlIGFza2luZyBmcm9tIGEgZGlmZmVyZW50IGV4dGVuc2lvblxuXHRcdFx0JiYgIUV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRvTWV0YWRhdGEuZXh0ZW5zaW9uLCBmcm9tKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Zha2VBdXRoUG9wdWxhdGUobWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAoIW1ldGFkYXRhLmF1dGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGZyb20gb2YgdGhpcy5fbGFuZ3VhZ2VBY2Nlc3NJbmZvcm1hdGlvbkV4dGVuc2lvbnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2dldEF1dGhBY2Nlc3MoZnJvbSwgeyBpZGVudGlmaWVyOiBtZXRhZGF0YS5leHRlbnNpb24sIGRpc3BsYXlOYW1lOiAnJyB9LCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ0Zha2UgQXV0aCByZXF1ZXN0IGZhaWxlZCcpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVRva2VuTGVuZ3RoKG1vZGVsSWQ6IHN0cmluZywgdmFsdWU6IHN0cmluZyB8IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxudW1iZXI+IHtcblxuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9sb2NhbE1vZGVscy5nZXQobW9kZWxJZCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHR0aHJvdyBleHRIb3N0VHlwZXMuTGFuZ3VhZ2VNb2RlbEVycm9yLk5vdEZvdW5kKGBMYW5ndWFnZSBtb2RlbCAnJHttb2RlbElkfScgaXMgdW5rbm93bi5gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2xhbmd1YWdlTW9kZWxQcm92aWRlcnMuZ2V0KGRhdGEubWV0YWRhdGEudmVuZG9yKT8ucHJvdmlkZXIucHJvdmlkZVRva2VuQ291bnQoZGF0YS5pbmZvLCB2YWx1ZSwgdG9rZW4pID8/IDA7XG5cdFx0Ly8gcmV0dXJuIHRoaXMuX3Byb3h5LiRjb3VudFRva2VucyhsYW5ndWFnZU1vZGVsSWQsICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiB0eXBlQ29udmVydC5MYW5ndWFnZU1vZGVsQ2hhdE1lc3NhZ2UyLmZyb20odmFsdWUpKSwgdG9rZW4pO1xuXHR9XG5cblx0JHVwZGF0ZU1vZGVsQWNjZXNzbGlzdChkYXRhOiB7IGZyb206IEV4dGVuc2lvbklkZW50aWZpZXI7IHRvOiBFeHRlbnNpb25JZGVudGlmaWVyOyBlbmFibGVkOiBib29sZWFuIH1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IHVwZGF0ZWQgPSBuZXcgQXJyYXk8eyBmcm9tOiBFeHRlbnNpb25JZGVudGlmaWVyOyB0bzogRXh0ZW5zaW9uSWRlbnRpZmllciB9PigpO1xuXHRcdGZvciAoY29uc3QgeyBmcm9tLCB0bywgZW5hYmxlZCB9IG9mIGRhdGEpIHtcblx0XHRcdGNvbnN0IHNldCA9IHRoaXMuX21vZGVsQWNjZXNzTGlzdC5nZXQoZnJvbSkgPz8gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJTZXQoKTtcblx0XHRcdGNvbnN0IG9sZFZhbHVlID0gc2V0Lmhhcyh0byk7XG5cdFx0XHRpZiAob2xkVmFsdWUgIT09IGVuYWJsZWQpIHtcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0XHRzZXQuYWRkKHRvKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXQuZGVsZXRlKHRvKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9tb2RlbEFjY2Vzc0xpc3Quc2V0KGZyb20sIHNldCk7XG5cdFx0XHRcdGNvbnN0IG5ld0l0ZW0gPSB7IGZyb20sIHRvIH07XG5cdFx0XHRcdHVwZGF0ZWQucHVzaChuZXdJdGVtKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbEFjY2Vzcy5maXJlKG5ld0l0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlQWNjZXNzSW5mb3JtYXRpb25FeHRlbnNpb25zID0gbmV3IFNldDxSZWFkb25seTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+PigpO1xuXG5cdGNyZWF0ZUxhbmd1YWdlTW9kZWxBY2Nlc3NJbmZvcm1hdGlvbihmcm9tOiBSZWFkb25seTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24+KTogdnNjb2RlLkxhbmd1YWdlTW9kZWxBY2Nlc3NJbmZvcm1hdGlvbiB7XG5cblx0XHR0aGlzLl9sYW5ndWFnZUFjY2Vzc0luZm9ybWF0aW9uRXh0ZW5zaW9ucy5hZGQoZnJvbSk7XG5cblx0XHQvLyBjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBfb25EaWRDaGFuZ2VBY2Nlc3MgPSBFdmVudC5zaWduYWwoRXZlbnQuZmlsdGVyKHRoaXMuX29uRGlkQ2hhbmdlTW9kZWxBY2Nlc3MuZXZlbnQsIGUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZS5mcm9tLCBmcm9tLmlkZW50aWZpZXIpKSk7XG5cdFx0Y29uc3QgX29uRGlkQWRkUmVtb3ZlID0gRXZlbnQuc2lnbmFsKHRoaXMuX29uRGlkQ2hhbmdlUHJvdmlkZXJzLmV2ZW50KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgb25EaWRDaGFuZ2UoKSB7XG5cdFx0XHRcdHJldHVybiBFdmVudC5hbnkoX29uRGlkQ2hhbmdlQWNjZXNzLCBfb25EaWRBZGRSZW1vdmUpO1xuXHRcdFx0fSxcblx0XHRcdGNhblNlbmRSZXF1ZXN0KGNoYXQ6IHZzY29kZS5MYW5ndWFnZU1vZGVsQ2hhdCk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0Ly8gVE9ETyBAbHJhbW9zMTUgLSBGaXhcblxuXHRcdFx0XHQvLyBsZXQgbWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdC8vIG91dDogZm9yIChjb25zdCBbXywgdmFsdWVdIG9mIHRoYXQuX2FsbExhbmd1YWdlTW9kZWxEYXRhKSB7XG5cdFx0XHRcdC8vIFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgdmFsdWUuYXBpT2JqZWN0cy52YWx1ZXMoKSkge1xuXHRcdFx0XHQvLyBcdFx0aWYgKGNhbmRpZGF0ZSA9PT0gY2hhdCkge1xuXHRcdFx0XHQvLyBcdFx0XHRtZXRhZGF0YSA9IHZhbHVlLm1ldGFkYXRhO1xuXHRcdFx0XHQvLyBcdFx0XHRicmVhayBvdXQ7XG5cdFx0XHRcdC8vIFx0XHR9XG5cdFx0XHRcdC8vIFx0fVxuXHRcdFx0XHQvLyB9XG5cdFx0XHRcdC8vIGlmICghbWV0YWRhdGEpIHtcblx0XHRcdFx0Ly8gXHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyB9XG5cdFx0XHRcdC8vIGlmICghdGhhdC5faXNVc2luZ0F1dGgoZnJvbS5pZGVudGlmaWVyLCBtZXRhZGF0YSkpIHtcblx0XHRcdFx0Ly8gXHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0Ly8gfVxuXG5cdFx0XHRcdC8vIGNvbnN0IGxpc3QgPSB0aGF0Ll9tb2RlbEFjY2Vzc0xpc3QuZ2V0KGZyb20uaWRlbnRpZmllcik7XG5cdFx0XHRcdC8vIGlmICghbGlzdCkge1xuXHRcdFx0XHQvLyBcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdC8vIH1cblx0XHRcdFx0Ly8gcmV0dXJuIGxpc3QuaGFzKG1ldGFkYXRhLmV4dGVuc2lvbik7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGZpbGVJc0lnbm9yZWQoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHVyaTogdnNjb2RlLlVyaSwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRBZGRpdGlvbnMnKTtcblxuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kZmlsZUlzSWdub3JlZCh1cmksIHRva2VuKTtcblx0fVxuXG5cdGdldCBpc01vZGVsUHJveHlBdmFpbGFibGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXI7XG5cdH1cblxuXHRhc3luYyBnZXRNb2RlbFByb3h5KGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogUHJvbWlzZTx2c2NvZGUuTGFuZ3VhZ2VNb2RlbFByb3h5PiB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VNb2RlbFByb3h5Jyk7XG5cblx0XHRpZiAoIXRoaXMuX2xhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbTGFuZ3VhZ2VNb2RlbFByb3h5XSBObyBMYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlciByZWdpc3RlcmVkJyk7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGxhbmd1YWdlIG1vZGVsIHByb3h5IHByb3ZpZGVyIGlzIHJlZ2lzdGVyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdGluZ0V4dGVuc2lvbklkID0gRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb24uaWRlbnRpZmllcik7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IFByb21pc2UucmVzb2x2ZSh0aGlzLl9sYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlci5wcm92aWRlTW9kZWxQcm94eShyZXF1ZXN0aW5nRXh0ZW5zaW9uSWQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0xhbmd1YWdlTW9kZWxQcm94eV0gUHJvdmlkZXIgcmV0dXJuZWQgbm8gcHJveHkgZm9yICR7cmVxdWVzdGluZ0V4dGVuc2lvbklkfWApO1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0xhbmd1YWdlIG1vZGVsIHByb3h5IGlzIG5vdCBhdmFpbGFibGUuJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0xhbmd1YWdlTW9kZWxQcm94eV0gUHJvdmlkZXIgZmFpbGVkIHRvIHJldHVybiBwcm94eSBmb3IgJHtyZXF1ZXN0aW5nRXh0ZW5zaW9uSWR9YCwgZXJyKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkaXNGaWxlSWdub3JlZChoYW5kbGU6IG51bWJlciwgdXJpOiBVcmlDb21wb25lbnRzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2lnbm9yZWRGaWxlUHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biBMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVQcm92aWRlcicpO1xuXHRcdH1cblxuXHRcdHJldHVybiAoYXdhaXQgcHJvdmlkZXIucHJvdmlkZUZpbGVJZ25vcmVkKFVSSS5yZXZpdmUodXJpKSwgdG9rZW4pKSA/PyBmYWxzZTtcblx0fVxuXG5cdHJlZ2lzdGVySWdub3JlZEZpbGVQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgcHJvdmlkZXI6IHZzY29kZS5MYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRjaGVja1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24sICdjaGF0UGFydGljaXBhbnRQcml2YXRlJyk7XG5cblx0XHRjb25zdCBoYW5kbGUgPSBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHMuX2lkUG9vbCsrO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlckZpbGVJZ25vcmVQcm92aWRlcihoYW5kbGUpO1xuXHRcdHRoaXMuX2lnbm9yZWRGaWxlUHJvdmlkZXJzLnNldChoYW5kbGUsIHByb3ZpZGVyKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyRmlsZUlnbm9yZVByb3ZpZGVyKGhhbmRsZSk7XG5cdFx0XHR0aGlzLl9pZ25vcmVkRmlsZVByb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHR9KTtcblx0fVxuXG5cdHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXIoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHByb3ZpZGVyOiB2c2NvZGUuTGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXIpOiB2c2NvZGUuRGlzcG9zYWJsZSB7XG5cdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnY2hhdFBhcnRpY2lwYW50UHJpdmF0ZScpO1xuXG5cdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbFByb3h5UHJvdmlkZXIgPSBwcm92aWRlcjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsUHJveHlBdmFpbGFiaWxpdHkuZmlyZSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2xhbmd1YWdlTW9kZWxQcm94eVByb3ZpZGVyID09PSBwcm92aWRlcikge1xuXHRcdFx0XHR0aGlzLl9sYW5ndWFnZU1vZGVsUHJveHlQcm92aWRlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VNb2RlbFByb3h5QXZhaWxhYmlsaXR5LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHVCQUF1QixxQkFBcUIsd0JBQXdCO0FBQzdFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUEwQixnQ0FBZ0MsdUNBQXVDO0FBQ2pHLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBNEIsb0JBQW9CO0FBRXpELFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsd0JBQXdCLDhCQUFxRDtBQUMzRyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUFnTTtBQUN6TSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHlCQUF5Qiw0QkFBNEI7QUFDOUQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBcUMsbUJBQWtEO0FBQ3ZGLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMEJBQTBCO0FBQ25DLFlBQVksaUJBQWlCO0FBQzdCLFlBQVksa0JBQWtCO0FBQzlC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
