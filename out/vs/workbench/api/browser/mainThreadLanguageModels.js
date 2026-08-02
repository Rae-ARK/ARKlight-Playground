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
import { AsyncIterableSource, DeferredPromise } from "../../../base/common/async.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { CancellationError, transformErrorForSerialization, transformErrorFromSerialization } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { equalSets } from "../../../base/common/collections.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IProductService } from "../../../platform/product/common/productService.js";
import { resizeImage } from "../../contrib/chat/browser/chatImageUtils.js";
import { ILanguageModelIgnoredFilesService } from "../../contrib/chat/common/ignoredFiles.js";
import { ILanguageModelsService } from "../../contrib/chat/common/languageModels.js";
import { IAuthenticationAccessService } from "../../services/authentication/browser/authenticationAccessService.js";
import { IAuthenticationService, INTERNAL_AUTH_PROVIDER_PREFIX } from "../../services/authentication/common/authentication.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { SerializableObjectWithBuffers } from "../../services/extensions/common/proxyIdentifier.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { LanguageModelError } from "../common/extHostTypes.js";
class RequestCancellationTokenSource extends Disposable {
  constructor(parent, onCancellationRequested) {
    super();
    this._source = this._register(new CancellationTokenSource(parent));
    if (onCancellationRequested) {
      this._register(this._source.token.onCancellationRequested(onCancellationRequested));
    }
  }
  get token() {
    return this._source.token;
  }
  cancel() {
    this._source.cancel();
  }
}
let MainThreadLanguageModels = class {
  constructor(extHostContext, _chatProviderService, _logService, _productService, _authenticationService, _authenticationAccessService, _extensionService, _ignoredFilesService) {
    this._chatProviderService = _chatProviderService;
    this._logService = _logService;
    this._productService = _productService;
    this._authenticationService = _authenticationService;
    this._authenticationAccessService = _authenticationAccessService;
    this._extensionService = _extensionService;
    this._ignoredFilesService = _ignoredFilesService;
    this._store = new DisposableStore();
    this._providerRegistrations = new DisposableMap();
    this._lmProviderChange = new Emitter();
    this._pendingProgress = /* @__PURE__ */ new Map();
    this._pendingCancelCTS = new DisposableMap();
    this._ignoredFileProviderRegistrations = new DisposableMap();
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatProvider);
    let lastModelIds = new Set(this._chatProviderService.getLanguageModelIds());
    this._store.add(this._chatProviderService.onDidChangeLanguageModels(() => {
      const currentModelIds = new Set(this._chatProviderService.getLanguageModelIds());
      if (equalSets(lastModelIds, currentModelIds)) {
        return;
      }
      lastModelIds = currentModelIds;
      this._proxy.$onChatModelsChange();
    }));
  }
  dispose() {
    this._lmProviderChange.dispose();
    this._providerRegistrations.dispose();
    this._pendingProgress.clear();
    this._pendingCancelCTS.dispose();
    this._ignoredFileProviderRegistrations.dispose();
    this._store.dispose();
  }
  $registerLanguageModelProvider(vendor) {
    const disposables = new DisposableStore();
    try {
      disposables.add(this._chatProviderService.registerLanguageModelProvider(vendor, {
        onDidChange: Event.filter(this._lmProviderChange.event, (e) => e.vendor === vendor, disposables),
        provideLanguageModelChatInfo: async (options, token) => {
          const modelsAndIdentifiers = await this._proxy.$provideLanguageModelChatInfo(vendor, options, token);
          const copilotExtensionId = this._productService.defaultChatAgent?.chatExtensionId;
          return modelsAndIdentifiers.map((m) => {
            if (m.metadata.auth) {
              disposables.add(this._registerAuthenticationProvider(m.metadata.extension, m.metadata.auth));
            }
            if (m.metadata.isBYOK !== void 0) {
              return m;
            }
            const isBuiltinCopilot = !!copilotExtensionId && ExtensionIdentifier.equals(m.metadata.extension, copilotExtensionId);
            return { ...m, metadata: { ...m.metadata, isBYOK: !isBuiltinCopilot } };
          });
        },
        sendChatRequest: async (modelId, messages, from, options, token) => {
          const requestId = Math.random() * 1e6 | 0;
          const defer = new DeferredPromise();
          defer.p.catch(() => {
          });
          const stream = new AsyncIterableSource();
          try {
            this._pendingProgress.set(requestId, { defer, stream });
            const cts = new RequestCancellationTokenSource(token, () => {
              this._proxy.$cancelLanguageModelChatRequest(requestId);
            });
            this._pendingCancelCTS.set(requestId, cts);
            await Promise.all(
              messages.flatMap((msg) => msg.content).filter((part) => part.type === "image_url").map(async (part) => {
                part.value.data = VSBuffer.wrap(await resizeImage(part.value.data.buffer));
              })
            );
            if (token.isCancellationRequested) {
              this._pendingProgress.delete(requestId);
              this._pendingCancelCTS.deleteAndDispose(requestId);
              const err = new CancellationError();
              stream.reject(err);
              defer.error(err);
              return {
                result: defer.p,
                stream: stream.asyncIterable
              };
            }
            await this._proxy.$startChatRequest(modelId, requestId, from, new SerializableObjectWithBuffers(messages), options, cts.token);
          } catch (err) {
            this._pendingProgress.delete(requestId);
            this._pendingCancelCTS.deleteAndDispose(requestId);
            throw err;
          }
          return {
            result: defer.p,
            stream: stream.asyncIterable
          };
        },
        provideTokenCount: (modelId, str, token) => {
          return this._proxy.$provideTokenLength(modelId, str, token);
        }
      }));
      this._providerRegistrations.set(vendor, disposables);
    } catch (err) {
      disposables.dispose();
      throw err;
    }
  }
  $onLMProviderChange(vendor) {
    this._lmProviderChange.fire({ vendor });
  }
  async $reportResponsePart(requestId, chunk) {
    const data = this._pendingProgress.get(requestId);
    this._logService.trace("[LM] report response PART", Boolean(data), requestId, chunk);
    if (data) {
      data.stream.emitOne(chunk.value);
    }
  }
  async $reportResponseDone(requestId, err) {
    const data = this._pendingProgress.get(requestId);
    this._logService.trace("[LM] report response DONE", Boolean(data), requestId, err);
    if (data) {
      this._pendingProgress.delete(requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      if (err) {
        const error = LanguageModelError.tryDeserialize(err) ?? transformErrorFromSerialization(err);
        data.stream.reject(error);
        data.defer.error(error);
      } else {
        data.stream.resolve();
        data.defer.complete(void 0);
      }
    }
  }
  $unregisterProvider(vendor) {
    this._providerRegistrations.deleteAndDispose(vendor);
  }
  $cancelLanguageModelChatRequest(requestId) {
    this._pendingCancelCTS.get(requestId)?.cancel();
  }
  $selectChatModels(selector) {
    return this._chatProviderService.selectLanguageModels(selector);
  }
  async $tryStartChatRequest(extension, modelIdentifier, requestId, messages, options, token) {
    this._logService.trace("[CHAT] request STARTED", extension.value, requestId);
    const cts = new RequestCancellationTokenSource(token);
    this._pendingCancelCTS.set(requestId, cts);
    let response;
    try {
      response = await this._chatProviderService.sendChatRequest(modelIdentifier, extension, messages.value, options, cts.token);
    } catch (err) {
      this._logService.error("[CHAT] request FAILED", extension.value, requestId, err);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      throw err;
    }
    const streaming = (async () => {
      try {
        for await (const part of response.stream) {
          this._logService.trace("[CHAT] request PART", extension.value, requestId, part);
          await this._proxy.$acceptResponsePart(requestId, new SerializableObjectWithBuffers(part));
        }
        this._logService.trace("[CHAT] request DONE", extension.value, requestId);
      } catch (err) {
        this._logService.error("[CHAT] extension request ERRORED in STREAM", toErrorMessage(err, true), extension.value, requestId);
        this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
      }
    })();
    Promise.allSettled([response.result, streaming]).then(() => {
      this._logService.debug("[CHAT] extension request DONE", extension.value, requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$acceptResponseDone(requestId, void 0);
    }, (err) => {
      this._logService.error("[CHAT] extension request ERRORED", toErrorMessage(err, true), extension.value, requestId);
      this._pendingCancelCTS.deleteAndDispose(requestId);
      this._proxy.$acceptResponseDone(requestId, transformErrorForSerialization(err));
    });
  }
  $countTokens(modelId, value, token) {
    return this._chatProviderService.computeTokenLength(modelId, value, token);
  }
  _registerAuthenticationProvider(extension, auth) {
    const authProviderId = INTERNAL_AUTH_PROVIDER_PREFIX + extension.value;
    if (this._authenticationService.getProviderIds().includes(authProviderId)) {
      return Disposable.None;
    }
    const accountLabel = auth.accountLabel ?? localize("languageModelsAccountId", "Language Models");
    const disposables = new DisposableStore();
    const provider = new LanguageModelAccessAuthProvider(authProviderId, auth.providerLabel, accountLabel);
    this._authenticationService.registerAuthenticationProvider(authProviderId, provider);
    disposables.add(toDisposable(() => {
      this._authenticationService.unregisterAuthenticationProvider(authProviderId);
      provider.dispose();
    }));
    disposables.add(this._authenticationAccessService.onDidChangeExtensionSessionAccess(async (e) => {
      const allowedExtensions = this._authenticationAccessService.readAllowedExtensions(authProviderId, accountLabel);
      const accessList = [];
      for (const allowedExtension of allowedExtensions) {
        const from = await this._extensionService.getExtension(allowedExtension.id);
        if (from) {
          accessList.push({
            from: from.identifier,
            to: extension,
            enabled: allowedExtension.allowed ?? true
          });
        }
      }
      this._proxy.$updateModelAccesslist(accessList);
    }));
    return disposables;
  }
  $fileIsIgnored(uri, token) {
    return this._ignoredFilesService.fileIsIgnored(URI.revive(uri), token);
  }
  $registerFileIgnoreProvider(handle) {
    this._ignoredFileProviderRegistrations.set(handle, this._ignoredFilesService.registerIgnoredFileProvider({
      isFileIgnored: async (uri, token) => this._proxy.$isFileIgnored(handle, uri, token)
    }));
  }
  $unregisterFileIgnoreProvider(handle) {
    this._ignoredFileProviderRegistrations.deleteAndDispose(handle);
  }
};
MainThreadLanguageModels = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadLanguageModels),
  __decorateParam(1, ILanguageModelsService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IAuthenticationService),
  __decorateParam(5, IAuthenticationAccessService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, ILanguageModelIgnoredFilesService)
], MainThreadLanguageModels);
class LanguageModelAccessAuthProvider {
  constructor(id, label, _accountLabel) {
    this.id = id;
    this.label = label;
    this._accountLabel = _accountLabel;
    this.supportsMultipleAccounts = false;
    // Important for updating the UI
    this._onDidChangeSessions = new Emitter();
    this.onDidChangeSessions = this._onDidChangeSessions.event;
  }
  async getSessions(scopes) {
    if (scopes === void 0 && !this._session) {
      return [];
    }
    if (this._session) {
      return [this._session];
    }
    return [await this.createSession(scopes || [])];
  }
  async createSession(scopes) {
    this._session = this._createFakeSession(scopes);
    this._onDidChangeSessions.fire({ added: [this._session], changed: [], removed: [] });
    return this._session;
  }
  removeSession(sessionId) {
    if (this._session) {
      this._onDidChangeSessions.fire({ added: [], changed: [], removed: [this._session] });
      this._session = void 0;
    }
    return Promise.resolve();
  }
  confirmation(extensionName, _recreatingSession) {
    return localize("confirmLanguageModelAccess", "The extension '{0}' wants to access the language models provided by {1}.", extensionName, this.label);
  }
  _createFakeSession(scopes) {
    return {
      id: "fake-session",
      account: {
        id: this.id,
        label: this._accountLabel
      },
      accessToken: "fake-access-token",
      scopes
    };
  }
  dispose() {
    this._onDidChangeSessions.dispose();
  }
}
export {
  MainThreadLanguageModels
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBc3luY0l0ZXJhYmxlU291cmNlLCBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IsIFNlcmlhbGl6ZWRFcnJvciwgdHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uLCB0cmFuc2Zvcm1FcnJvckZyb21TZXJpYWxpemF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZXF1YWxTZXRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlc2l6ZUltYWdlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdEltYWdlVXRpbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9pZ25vcmVkRmlsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRNZXNzYWdlLCBJQ2hhdFJlc3BvbnNlUGFydCwgSUxhbmd1YWdlTW9kZWxDaGF0UmVzcG9uc2UsIElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uLCBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQsIElBdXRoZW50aWNhdGlvblByb3ZpZGVyLCBJQXV0aGVudGljYXRpb25TZXJ2aWNlLCBJTlRFUk5BTF9BVVRIX1BST1ZJREVSX1BSRUZJWCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQsIGV4dEhvc3ROYW1lZEN1c3RvbWVyIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RMYW5ndWFnZU1vZGVsc1NoYXBlLCBNYWluQ29udGV4dCwgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZU1vZGVsRXJyb3IgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcblxuY2xhc3MgUmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblxuXHRjb25zdHJ1Y3RvcihwYXJlbnQ6IENhbmNlbGxhdGlvblRva2VuLCBvbkNhbmNlbGxhdGlvblJlcXVlc3RlZD86ICgpID0+IHZvaWQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3NvdXJjZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZShwYXJlbnQpKTtcblx0XHRpZiAob25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NvdXJjZS50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChvbkNhbmNlbGxhdGlvblJlcXVlc3RlZCkpO1xuXHRcdH1cblx0fVxuXG5cdGdldCB0b2tlbigpOiBDYW5jZWxsYXRpb25Ub2tlbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS50b2tlbjtcblx0fVxuXG5cdGNhbmNlbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zb3VyY2UuY2FuY2VsKCk7XG5cdH1cbn1cblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRMYW5ndWFnZU1vZGVscylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMgaW1wbGVtZW50cyBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHNTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IEV4dEhvc3RMYW5ndWFnZU1vZGVsc1NoYXBlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJSZWdpc3RyYXRpb25zID0gbmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sbVByb3ZpZGVyQ2hhbmdlID0gbmV3IEVtaXR0ZXI8eyB2ZW5kb3I6IHN0cmluZyB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUHJvZ3Jlc3MgPSBuZXcgTWFwPG51bWJlciwgeyBkZWZlcjogRGVmZXJyZWRQcm9taXNlPHVua25vd24+OyBzdHJlYW06IEFzeW5jSXRlcmFibGVTb3VyY2U8SUNoYXRSZXNwb25zZVBhcnQgfCBJQ2hhdFJlc3BvbnNlUGFydFtdPiB9PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQ2FuY2VsQ1RTID0gbmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyLCBSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lnbm9yZWRGaWxlUHJvdmlkZXJSZWdpc3RyYXRpb25zID0gbmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dEhvc3RDb250ZXh0OiBJRXh0SG9zdENvbnRleHQsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFByb3ZpZGVyU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQXV0aGVudGljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uU2VydmljZTogSUF1dGhlbnRpY2F0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U6IElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaWdub3JlZEZpbGVzU2VydmljZTogSUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RDaGF0UHJvdmlkZXIpO1xuXG5cdFx0Ly8gQnJpZGdlIHdvcmtiZW5jaC1zaWRlIGxhbmd1YWdlLW1vZGVsIGNoYW5nZXMgdG8gZXh0ZW5zaW9ucyB2aWEgYHZzY29kZS5sbS5vbkRpZENoYW5nZUNoYXRNb2RlbHNgLlxuXHRcdC8vIE9ubHkgZm9yd2FyZCB3aGVuIHRoZSBzZXQgb2YgbW9kZWwgaWRlbnRpZmllcnMgY2hhbmdlcy4gUHJvdmlkZXJzIChlLmcuIEJZT0sgdXRpbGl0eSBhbGlhc2VzKSBjYW5cblx0XHQvLyByZS1wdWJsaXNoIG1vZGVscyB3aXRoIG1ldGFkYXRhLW9ubHkgZGlmZnMgbWFueSB0aW1lcyBwZXIgc2Vjb25kOyBmaXJpbmcgb24gdGhvc2UgbGV0cyBsaXN0ZW5lcnNcblx0XHQvLyB0aGF0IHJlLXJlc29sdmUgbW9kZWxzIChlLmcuIGBzZWxlY3RDaGF0TW9kZWxzYCkgc3BpbiBhbiB1bmJvdW5kZWQgQ1BVLXBpbm5pbmcgZmVlZGJhY2sgbG9vcC5cblx0XHRsZXQgbGFzdE1vZGVsSWRzID0gbmV3IFNldCh0aGlzLl9jaGF0UHJvdmlkZXJTZXJ2aWNlLmdldExhbmd1YWdlTW9kZWxJZHMoKSk7XG5cdFx0dGhpcy5fc3RvcmUuYWRkKHRoaXMuX2NoYXRQcm92aWRlclNlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscygoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50TW9kZWxJZHMgPSBuZXcgU2V0KHRoaXMuX2NoYXRQcm92aWRlclNlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpKTtcblx0XHRcdGlmIChlcXVhbFNldHMobGFzdE1vZGVsSWRzLCBjdXJyZW50TW9kZWxJZHMpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxhc3RNb2RlbElkcyA9IGN1cnJlbnRNb2RlbElkcztcblx0XHRcdHRoaXMuX3Byb3h5LiRvbkNoYXRNb2RlbHNDaGFuZ2UoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xtUHJvdmlkZXJDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyUmVnaXN0cmF0aW9ucy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1Byb2dyZXNzLmNsZWFyKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5faWdub3JlZEZpbGVQcm92aWRlclJlZ2lzdHJhdGlvbnMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0b3JlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdCRyZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcih2ZW5kb3I6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY2hhdFByb3ZpZGVyU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlTW9kZWxQcm92aWRlcih2ZW5kb3IsIHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50LmZpbHRlcih0aGlzLl9sbVByb3ZpZGVyQ2hhbmdlLmV2ZW50LCBlID0+IGUudmVuZG9yID09PSB2ZW5kb3IsIGRpc3Bvc2FibGVzKSBhcyB1bmtub3duIGFzIEV2ZW50PHZvaWQ+LFxuXHRcdFx0XHRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvOiBhc3luYyAob3B0aW9ucywgdG9rZW4pID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbHNBbmRJZGVudGlmaWVycyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvKHZlbmRvciwgb3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHRcdGNvbnN0IGNvcGlsb3RFeHRlbnNpb25JZCA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZDtcblx0XHRcdFx0XHRyZXR1cm4gbW9kZWxzQW5kSWRlbnRpZmllcnMubWFwKG0gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKG0ubWV0YWRhdGEuYXV0aCkge1xuXHRcdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fcmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKG0ubWV0YWRhdGEuZXh0ZW5zaW9uLCBtLm1ldGFkYXRhLmF1dGgpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChtLm1ldGFkYXRhLmlzQllPSyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBtOyAvLyBwcm92aWRlciBkZWNsYXJlZCBpdCBleHBsaWNpdGx5XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQvLyBBbnkgY29udHJpYnV0ZWQgbW9kZWwgdGhhdCBpc24ndCBmcm9tIHRoZSBidWlsdC1pbiBDb3BpbG90IGNoYXQgZXh0ZW5zaW9uIGlzIEJZT0suXG5cdFx0XHRcdFx0XHRjb25zdCBpc0J1aWx0aW5Db3BpbG90ID0gISFjb3BpbG90RXh0ZW5zaW9uSWQgJiYgRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMobS5tZXRhZGF0YS5leHRlbnNpb24sIGNvcGlsb3RFeHRlbnNpb25JZCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyAuLi5tLCBtZXRhZGF0YTogeyAuLi5tLm1ldGFkYXRhLCBpc0JZT0s6ICFpc0J1aWx0aW5Db3BpbG90IH0gfTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2VuZENoYXRSZXF1ZXN0OiBhc3luYyAobW9kZWxJZCwgbWVzc2FnZXMsIGZyb20sIG9wdGlvbnMsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdElkID0gKE1hdGgucmFuZG9tKCkgKiAxZTYpIHwgMDtcblx0XHRcdFx0XHRjb25zdCBkZWZlciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dW5rbm93bj4oKTtcblx0XHRcdFx0XHQvLyBgcmVzdWx0YCBtaXJyb3JzIHRoZSBzdHJlYW0ncyB0ZXJtaW5hbCBzdGF0dXMgYW5kIGlzIHJlamVjdGVkIHRvZ2V0aGVyIHdpdGggdGhlXG5cdFx0XHRcdFx0Ly8gc3RyZWFtIG9uIGVycm9yIChzZWUgYCRyZXBvcnRSZXNwb25zZURvbmVgKS4gQ29uc3VtZXJzIHRoYXQgcmVhZCB0aGUgc3RyZWFtIGxldCB0aGVcblx0XHRcdFx0XHQvLyBmb3ItYXdhaXQgdGhyb3cgYW5kIG5ldmVyIHJlYWNoIGBhd2FpdCByZXNwb25zZS5yZXN1bHRgLCBsZWF2aW5nIGl0cyByZWplY3Rpb24gKGUuZy5cblx0XHRcdFx0XHQvLyBhbiBleHBlY3RlZCBgQ2hhdFF1b3RhRXhjZWVkZWRgKSB1bm9ic2VydmVkLiBBdHRhY2ggYSBuby1vcCBoYW5kbGVyIHNvIGl0IGNhbm5vdFxuXHRcdFx0XHRcdC8vIHN1cmZhY2UgYXMgYW4gdW5oYW5kbGVkIHJlamVjdGlvbjsgcmVhbCBhd2FpdGVycyBvZiBgcmVzdWx0YCBzdGlsbCBzZWUgdGhlIGVycm9yLlxuXHRcdFx0XHRcdGRlZmVyLnAuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdFx0XHRjb25zdCBzdHJlYW0gPSBuZXcgQXN5bmNJdGVyYWJsZVNvdXJjZTxJQ2hhdFJlc3BvbnNlUGFydCB8IElDaGF0UmVzcG9uc2VQYXJ0W10+KCk7XG5cblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb2dyZXNzLnNldChyZXF1ZXN0SWQsIHsgZGVmZXIsIHN0cmVhbSB9KTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgY3RzID0gbmV3IFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbiwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wcm94eS4kY2FuY2VsTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0KHJlcXVlc3RJZCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuc2V0KHJlcXVlc3RJZCwgY3RzKTtcblxuXHRcdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2VzLmZsYXRNYXAobXNnID0+IG1zZy5jb250ZW50KVxuXHRcdFx0XHRcdFx0XHRcdC5maWx0ZXIocGFydCA9PiBwYXJ0LnR5cGUgPT09ICdpbWFnZV91cmwnKVxuXHRcdFx0XHRcdFx0XHRcdC5tYXAoYXN5bmMgcGFydCA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRwYXJ0LnZhbHVlLmRhdGEgPSBWU0J1ZmZlci53cmFwKGF3YWl0IHJlc2l6ZUltYWdlKHBhcnQudmFsdWUuZGF0YS5idWZmZXIpKTtcblx0XHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUHJvZ3Jlc3MuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlcnIgPSBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdFx0XHRcdFx0c3RyZWFtLnJlamVjdChlcnIpO1xuXHRcdFx0XHRcdFx0XHRkZWZlci5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdDogZGVmZXIucCxcblx0XHRcdFx0XHRcdFx0XHRzdHJlYW06IHN0cmVhbS5hc3luY0l0ZXJhYmxlXG5cdFx0XHRcdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcHJveHkuJHN0YXJ0Q2hhdFJlcXVlc3QobW9kZWxJZCwgcmVxdWVzdElkLCBmcm9tLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMobWVzc2FnZXMpLCBvcHRpb25zLCBjdHMudG9rZW4pO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Byb2dyZXNzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5kZWxldGVBbmREaXNwb3NlKHJlcXVlc3RJZCk7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHJlc3VsdDogZGVmZXIucCxcblx0XHRcdFx0XHRcdHN0cmVhbTogc3RyZWFtLmFzeW5jSXRlcmFibGVcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRSZXNwb25zZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJvdmlkZVRva2VuQ291bnQ6IChtb2RlbElkLCBzdHIsIHRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRwcm92aWRlVG9rZW5MZW5ndGgobW9kZWxJZCwgc3RyLCB0b2tlbik7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9wcm92aWRlclJlZ2lzdHJhdGlvbnMuc2V0KHZlbmRvciwgZGlzcG9zYWJsZXMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdCRvbkxNUHJvdmlkZXJDaGFuZ2UodmVuZG9yOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sbVByb3ZpZGVyQ2hhbmdlLmZpcmUoeyB2ZW5kb3IgfSk7XG5cdH1cblxuXHRhc3luYyAkcmVwb3J0UmVzcG9uc2VQYXJ0KHJlcXVlc3RJZDogbnVtYmVyLCBjaHVuazogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SUNoYXRSZXNwb25zZVBhcnQgfCBJQ2hhdFJlc3BvbnNlUGFydFtdPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9wZW5kaW5nUHJvZ3Jlc3MuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0xNXSByZXBvcnQgcmVzcG9uc2UgUEFSVCcsIEJvb2xlYW4oZGF0YSksIHJlcXVlc3RJZCwgY2h1bmspO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRkYXRhLnN0cmVhbS5lbWl0T25lKGNodW5rLnZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkcmVwb3J0UmVzcG9uc2VEb25lKHJlcXVlc3RJZDogbnVtYmVyLCBlcnI6IFNlcmlhbGl6ZWRFcnJvciB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9wZW5kaW5nUHJvZ3Jlc3MuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0xNXSByZXBvcnQgcmVzcG9uc2UgRE9ORScsIEJvb2xlYW4oZGF0YSksIHJlcXVlc3RJZCwgZXJyKTtcblx0XHRpZiAoZGF0YSkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ1Byb2dyZXNzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5kZWxldGVBbmREaXNwb3NlKHJlcXVlc3RJZCk7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGNvbnN0IGVycm9yID0gTGFuZ3VhZ2VNb2RlbEVycm9yLnRyeURlc2VyaWFsaXplKGVycikgPz8gdHJhbnNmb3JtRXJyb3JGcm9tU2VyaWFsaXphdGlvbihlcnIpO1xuXHRcdFx0XHRkYXRhLnN0cmVhbS5yZWplY3QoZXJyb3IpO1xuXHRcdFx0XHRkYXRhLmRlZmVyLmVycm9yKGVycm9yKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRhdGEuc3RyZWFtLnJlc29sdmUoKTtcblx0XHRcdFx0ZGF0YS5kZWZlci5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdCR1bnJlZ2lzdGVyUHJvdmlkZXIodmVuZG9yOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm92aWRlclJlZ2lzdHJhdGlvbnMuZGVsZXRlQW5kRGlzcG9zZSh2ZW5kb3IpO1xuXHR9XG5cblx0JGNhbmNlbExhbmd1YWdlTW9kZWxDaGF0UmVxdWVzdChyZXF1ZXN0SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZ2V0KHJlcXVlc3RJZCk/LmNhbmNlbCgpO1xuXHR9XG5cblx0JHNlbGVjdENoYXRNb2RlbHMoc2VsZWN0b3I6IElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0UHJvdmlkZXJTZXJ2aWNlLnNlbGVjdExhbmd1YWdlTW9kZWxzKHNlbGVjdG9yKTtcblx0fVxuXG5cdGFzeW5jICR0cnlTdGFydENoYXRSZXF1ZXN0KGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllciwgbW9kZWxJZGVudGlmaWVyOiBzdHJpbmcsIHJlcXVlc3RJZDogbnVtYmVyLCBtZXNzYWdlczogU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnM8SUNoYXRNZXNzYWdlW10+LCBvcHRpb25zOiB7fSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW0NIQVRdIHJlcXVlc3QgU1RBUlRFRCcsIGV4dGVuc2lvbi52YWx1ZSwgcmVxdWVzdElkKTtcblxuXHRcdC8vIENyZWF0ZSBhIGxvY2FsIENUUyBzbyBjYW5jZWxsYXRpb24gY2FuIGJlIHNpZ25hbGxlZCB2aWFcblx0XHQvLyAkY2FuY2VsTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0IGV2ZW4gYWZ0ZXIgdGhlIFJQQyBjYW5jZWxcblx0XHQvLyBoYW5kbGVyIGZvciB0aGUgb3JpZ2luYWwgdG9rZW4gaGFzIGJlZW4gcmVtb3ZlZC5cblx0XHRjb25zdCBjdHMgPSBuZXcgUmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlKHRva2VuKTtcblx0XHR0aGlzLl9wZW5kaW5nQ2FuY2VsQ1RTLnNldChyZXF1ZXN0SWQsIGN0cyk7XG5cblx0XHRsZXQgcmVzcG9uc2U6IElMYW5ndWFnZU1vZGVsQ2hhdFJlc3BvbnNlO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXNwb25zZSA9IGF3YWl0IHRoaXMuX2NoYXRQcm92aWRlclNlcnZpY2Uuc2VuZENoYXRSZXF1ZXN0KG1vZGVsSWRlbnRpZmllciwgZXh0ZW5zaW9uLCBtZXNzYWdlcy52YWx1ZSwgb3B0aW9ucywgY3RzLnRva2VuKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tDSEFUXSByZXF1ZXN0IEZBSUxFRCcsIGV4dGVuc2lvbi52YWx1ZSwgcmVxdWVzdElkLCBlcnIpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5kZWxldGVBbmREaXNwb3NlKHJlcXVlc3RJZCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0Ly8gISEhIElNUE9SVEFOVCAhISFcblx0XHQvLyBUaGlzIG1ldGhvZCBtdXN0IHJldHVybiBiZWZvcmUgdGhlIHJlc3BvbnNlIGlzIGRvbmUgKGhhcyBzdHJlYW1lZCBhbGwgcGFydHMpXG5cdFx0Ly8gYW5kIGJlY2F1c2Ugb2YgdGhhdCB3ZSBjb25zdW1lIHRoZSBzdHJlYW0gd2l0aG91dCBhd2FpdGluZ1xuXHRcdC8vICEhISBJTVBPUlRBTlQgISEhXG5cdFx0Y29uc3Qgc3RyZWFtaW5nID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGZvciBhd2FpdCAoY29uc3QgcGFydCBvZiByZXNwb25zZS5zdHJlYW0pIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbQ0hBVF0gcmVxdWVzdCBQQVJUJywgZXh0ZW5zaW9uLnZhbHVlLCByZXF1ZXN0SWQsIHBhcnQpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LiRhY2NlcHRSZXNwb25zZVBhcnQocmVxdWVzdElkLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMocGFydCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tDSEFUXSByZXF1ZXN0IERPTkUnLCBleHRlbnNpb24udmFsdWUsIHJlcXVlc3RJZCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0NIQVRdIGV4dGVuc2lvbiByZXF1ZXN0IEVSUk9SRUQgaW4gU1RSRUFNJywgdG9FcnJvck1lc3NhZ2UoZXJyLCB0cnVlKSwgZXh0ZW5zaW9uLnZhbHVlLCByZXF1ZXN0SWQpO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0UmVzcG9uc2VEb25lKHJlcXVlc3RJZCwgdHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uKGVycikpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHQvLyBXaGVuIHRoZSByZXNwb25zZSBpcyBkb25lIChzaWduYWxlZCB2aWEgaXRzIHJlc3VsdCkgd2UgdGVsbCB0aGUgRUhcblx0XHRQcm9taXNlLmFsbFNldHRsZWQoW3Jlc3BvbnNlLnJlc3VsdCwgc3RyZWFtaW5nXSkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdbQ0hBVF0gZXh0ZW5zaW9uIHJlcXVlc3QgRE9ORScsIGV4dGVuc2lvbi52YWx1ZSwgcmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdDYW5jZWxDVFMuZGVsZXRlQW5kRGlzcG9zZShyZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcHJveHkuJGFjY2VwdFJlc3BvbnNlRG9uZShyZXF1ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tDSEFUXSBleHRlbnNpb24gcmVxdWVzdCBFUlJPUkVEJywgdG9FcnJvck1lc3NhZ2UoZXJyLCB0cnVlKSwgZXh0ZW5zaW9uLnZhbHVlLCByZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NhbmNlbENUUy5kZWxldGVBbmREaXNwb3NlKHJlcXVlc3RJZCk7XG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0UmVzcG9uc2VEb25lKHJlcXVlc3RJZCwgdHJhbnNmb3JtRXJyb3JGb3JTZXJpYWxpemF0aW9uKGVycikpO1xuXHRcdH0pO1xuXHR9XG5cblxuXHQkY291bnRUb2tlbnMobW9kZWxJZDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgSUNoYXRNZXNzYWdlLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0UHJvdmlkZXJTZXJ2aWNlLmNvbXB1dGVUb2tlbkxlbmd0aChtb2RlbElkLCB2YWx1ZSwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGV4dGVuc2lvbjogRXh0ZW5zaW9uSWRlbnRpZmllciwgYXV0aDogeyBwcm92aWRlckxhYmVsOiBzdHJpbmc7IGFjY291bnRMYWJlbD86IHN0cmluZyB8IHVuZGVmaW5lZCB9KTogSURpc3Bvc2FibGUge1xuXHRcdC8vIFRoaXMgbmVlZHMgdG8gYmUgZG9uZSBpbiBib3RoIE1haW5UaHJlYWQgJiBFeHRIb3N0IENoYXRQcm92aWRlclxuXHRcdGNvbnN0IGF1dGhQcm92aWRlcklkID0gSU5URVJOQUxfQVVUSF9QUk9WSURFUl9QUkVGSVggKyBleHRlbnNpb24udmFsdWU7XG5cblx0XHQvLyBPbmx5IHJlZ2lzdGVyIG9uZSBhdXRoIHByb3ZpZGVyIHBlciBleHRlbnNpb25cblx0XHRpZiAodGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFByb3ZpZGVySWRzKCkuaW5jbHVkZXMoYXV0aFByb3ZpZGVySWQpKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjY291bnRMYWJlbCA9IGF1dGguYWNjb3VudExhYmVsID8/IGxvY2FsaXplKCdsYW5ndWFnZU1vZGVsc0FjY291bnRJZCcsICdMYW5ndWFnZSBNb2RlbHMnKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBMYW5ndWFnZU1vZGVsQWNjZXNzQXV0aFByb3ZpZGVyKGF1dGhQcm92aWRlcklkLCBhdXRoLnByb3ZpZGVyTGFiZWwsIGFjY291bnRMYWJlbCk7XG5cdFx0dGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQXV0aGVudGljYXRpb25Qcm92aWRlcihhdXRoUHJvdmlkZXJJZCwgcHJvdmlkZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLnVucmVnaXN0ZXJBdXRoZW50aWNhdGlvblByb3ZpZGVyKGF1dGhQcm92aWRlcklkKTtcblx0XHRcdHByb3ZpZGVyLmRpc3Bvc2UoKTtcblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2F1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvblNlc3Npb25BY2Nlc3MoYXN5bmMgKGUpID0+IHtcblx0XHRcdGNvbnN0IGFsbG93ZWRFeHRlbnNpb25zID0gdGhpcy5fYXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlLnJlYWRBbGxvd2VkRXh0ZW5zaW9ucyhhdXRoUHJvdmlkZXJJZCwgYWNjb3VudExhYmVsKTtcblx0XHRcdGNvbnN0IGFjY2Vzc0xpc3QgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgYWxsb3dlZEV4dGVuc2lvbiBvZiBhbGxvd2VkRXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBmcm9tID0gYXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oYWxsb3dlZEV4dGVuc2lvbi5pZCk7XG5cdFx0XHRcdGlmIChmcm9tKSB7XG5cdFx0XHRcdFx0YWNjZXNzTGlzdC5wdXNoKHtcblx0XHRcdFx0XHRcdGZyb206IGZyb20uaWRlbnRpZmllcixcblx0XHRcdFx0XHRcdHRvOiBleHRlbnNpb24sXG5cdFx0XHRcdFx0XHRlbmFibGVkOiBhbGxvd2VkRXh0ZW5zaW9uLmFsbG93ZWQgPz8gdHJ1ZVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm94eS4kdXBkYXRlTW9kZWxBY2Nlc3NsaXN0KGFjY2Vzc0xpc3QpO1xuXHRcdH0pKTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHQkZmlsZUlzSWdub3JlZCh1cmk6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9pZ25vcmVkRmlsZXNTZXJ2aWNlLmZpbGVJc0lnbm9yZWQoVVJJLnJldml2ZSh1cmkpLCB0b2tlbik7XG5cdH1cblxuXHQkcmVnaXN0ZXJGaWxlSWdub3JlUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9pZ25vcmVkRmlsZVByb3ZpZGVyUmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB0aGlzLl9pZ25vcmVkRmlsZXNTZXJ2aWNlLnJlZ2lzdGVySWdub3JlZEZpbGVQcm92aWRlcih7XG5cdFx0XHRpc0ZpbGVJZ25vcmVkOiBhc3luYyAodXJpOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gdGhpcy5fcHJveHkuJGlzRmlsZUlnbm9yZWQoaGFuZGxlLCB1cmksIHRva2VuKVxuXHRcdH0pKTtcblx0fVxuXG5cdCR1bnJlZ2lzdGVyRmlsZUlnbm9yZVByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5faWdub3JlZEZpbGVQcm92aWRlclJlZ2lzdHJhdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShoYW5kbGUpO1xuXHR9XG59XG5cbi8vIFRoZSBmYWtlIEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIgdGhhdCB3aWxsIGJlIHVzZWQgdG8gZ2F0ZSBhY2Nlc3MgdG8gdGhlIExhbmd1YWdlIE1vZGVsLiBUaGVyZSB3aWxsIGJlIG9uZSBwZXIgcHJvdmlkZXIuXG5jbGFzcyBMYW5ndWFnZU1vZGVsQWNjZXNzQXV0aFByb3ZpZGVyIGltcGxlbWVudHMgSUF1dGhlbnRpY2F0aW9uUHJvdmlkZXIge1xuXHRzdXBwb3J0c011bHRpcGxlQWNjb3VudHMgPSBmYWxzZTtcblxuXHQvLyBJbXBvcnRhbnQgZm9yIHVwZGF0aW5nIHRoZSBVSVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVNlc3Npb25zOiBFbWl0dGVyPEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudD4gPSBuZXcgRW1pdHRlcjxBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50PEF1dGhlbnRpY2F0aW9uU2Vzc2lvbnNDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgX3Nlc3Npb246IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSBpZDogc3RyaW5nLCByZWFkb25seSBsYWJlbDogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IF9hY2NvdW50TGFiZWw6IHN0cmluZykgeyB9XG5cblx0YXN5bmMgZ2V0U2Vzc2lvbnMoc2NvcGVzPzogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHJlYWRvbmx5IEF1dGhlbnRpY2F0aW9uU2Vzc2lvbltdPiB7XG5cdFx0Ly8gSWYgdGhlcmUgYXJlIG5vIHNjb3BlcyBhbmQgbm8gc2Vzc2lvbiB0aGF0IG1lYW5zIG5vIGV4dGVuc2lvbiBoYXMgcmVxdWVzdGVkIGEgc2Vzc2lvbiB5ZXRcblx0XHQvLyBhbmQgdGhlIHVzZXIgaXMgc2ltcGx5IG9wZW5pbmcgdGhlIEFjY291bnQgbWVudS4gSW4gdGhhdCBjYXNlLCB3ZSBzaG91bGQgbm90IHJldHVybiBhbnkgXCJzZXNzaW9uc1wiLlxuXHRcdGlmIChzY29wZXMgPT09IHVuZGVmaW5lZCAmJiAhdGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIFt0aGlzLl9zZXNzaW9uXTtcblx0XHR9XG5cdFx0cmV0dXJuIFthd2FpdCB0aGlzLmNyZWF0ZVNlc3Npb24oc2NvcGVzIHx8IFtdKV07XG5cdH1cblx0YXN5bmMgY3JlYXRlU2Vzc2lvbihzY29wZXM6IHN0cmluZ1tdKTogUHJvbWlzZTxBdXRoZW50aWNhdGlvblNlc3Npb24+IHtcblx0XHR0aGlzLl9zZXNzaW9uID0gdGhpcy5fY3JlYXRlRmFrZVNlc3Npb24oc2NvcGVzKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW3RoaXMuX3Nlc3Npb25dLCBjaGFuZ2VkOiBbXSwgcmVtb3ZlZDogW10gfSk7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb247XG5cdH1cblx0cmVtb3ZlU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW10sIGNoYW5nZWQ6IFtdLCByZW1vdmVkOiBbdGhpcy5fc2Vzc2lvbl0gfSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRjb25maXJtYXRpb24oZXh0ZW5zaW9uTmFtZTogc3RyaW5nLCBfcmVjcmVhdGluZ1Nlc3Npb246IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnY29uZmlybUxhbmd1YWdlTW9kZWxBY2Nlc3MnLCBcIlRoZSBleHRlbnNpb24gJ3swfScgd2FudHMgdG8gYWNjZXNzIHRoZSBsYW5ndWFnZSBtb2RlbHMgcHJvdmlkZWQgYnkgezF9LlwiLCBleHRlbnNpb25OYW1lLCB0aGlzLmxhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUZha2VTZXNzaW9uKHNjb3Blczogc3RyaW5nW10pOiBBdXRoZW50aWNhdGlvblNlc3Npb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogJ2Zha2Utc2Vzc2lvbicsXG5cdFx0XHRhY2NvdW50OiB7XG5cdFx0XHRcdGlkOiB0aGlzLmlkLFxuXHRcdFx0XHRsYWJlbDogdGhpcy5fYWNjb3VudExhYmVsLFxuXHRcdFx0fSxcblx0XHRcdGFjY2Vzc1Rva2VuOiAnZmFrZS1hY2Nlc3MtdG9rZW4nLFxuXHRcdFx0c2NvcGVzLFxuXHRcdH07XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMscUJBQXFCLHVCQUF1QjtBQUNyRCxTQUFTLGdCQUFnQjtBQUN6QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxz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
