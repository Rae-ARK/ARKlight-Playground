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
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { ChatDebugHookResult, IChatDebugService } from "../../contrib/chat/common/chatDebugService.js";
import { IChatService } from "../../contrib/chat/common/chatService/chatService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
let MainThreadChatDebug = class extends Disposable {
  constructor(extHostContext, _chatDebugService, _chatService) {
    super();
    this._chatDebugService = _chatDebugService;
    this._chatService = _chatService;
    this._providerDisposables = /* @__PURE__ */ new Map();
    this._activeSessionResources = /* @__PURE__ */ new Map();
    this._coreEventForwarder = this._register(new MutableDisposable());
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostChatDebug);
  }
  $subscribeToCoreDebugEvents() {
    this._coreEventForwarder.value = this._chatDebugService.onDidAddEvent((event) => {
      if (this._chatDebugService.isCoreEvent(event)) {
        this._proxy.$onCoreDebugEvent(this._serializeEvent(event));
      }
    });
  }
  $unsubscribeFromCoreDebugEvents() {
    this._coreEventForwarder.clear();
  }
  $registerChatDebugLogProvider(handle) {
    const disposables = new DisposableStore();
    this._providerDisposables.set(handle, disposables);
    disposables.add(this._chatDebugService.registerProvider({
      provideChatDebugLog: async (sessionResource, token) => {
        this._activeSessionResources.set(handle, sessionResource);
        const dtos = await this._proxy.$provideChatDebugLog(handle, sessionResource, token);
        return dtos?.map((dto) => this._reviveEvent(dto, sessionResource));
      },
      resolveChatDebugLogEvent: async (eventId, token) => {
        const dto = await this._proxy.$resolveChatDebugLogEvent(handle, eventId, token);
        return dto ? this._reviveResolvedContent(dto) : void 0;
      },
      provideChatDebugLogExport: async (sessionResource, token) => {
        const coreEventDtos = this._chatDebugService.getEvents(sessionResource).filter((e) => this._chatDebugService.isCoreEvent(e)).map((e) => this._serializeEvent(e));
        const sessionTitle = this._chatService.getSessionTitle(sessionResource);
        const result = await this._proxy.$exportChatDebugLog(handle, sessionResource, coreEventDtos, sessionTitle, token);
        return result?.buffer;
      },
      resolveChatDebugLogImport: async (data, token) => {
        const result = await this._proxy.$importChatDebugLog(handle, VSBuffer.wrap(data), token);
        if (!result) {
          return void 0;
        }
        const uri = URI.revive(result.uri);
        if (result.sessionTitle) {
          this._chatDebugService.setImportedSessionTitle(uri, result.sessionTitle);
        }
        return uri;
      }
    }));
    disposables.add(this._chatDebugService.registerAvailableSessionsFetcher(async (token) => {
      const entries = await this._proxy.$getAvailableDebugSessionResources(handle, token);
      return entries.map((e) => ({ uri: URI.revive(e.uri), title: e.title }));
    }));
  }
  $unregisterChatDebugLogProvider(handle) {
    const disposables = this._providerDisposables.get(handle);
    disposables?.dispose();
    this._providerDisposables.delete(handle);
    this._activeSessionResources.delete(handle);
  }
  $acceptChatDebugEvent(handle, dto) {
    const sessionResource = (dto.sessionResource ? URI.revive(dto.sessionResource) : void 0) ?? this._activeSessionResources.get(handle) ?? this._chatDebugService.activeSessionResource;
    if (!sessionResource) {
      return;
    }
    const revived = this._reviveEvent(dto, sessionResource);
    this._chatDebugService.addProviderEvent(revived);
  }
  _serializeEvent(event) {
    const base = {
      id: event.id,
      sessionResource: event.sessionResource,
      created: event.created.getTime(),
      parentEventId: event.parentEventId
    };
    switch (event.kind) {
      case "toolCall":
        return { ...base, kind: "toolCall", toolName: event.toolName, toolCallId: event.toolCallId, input: event.input, output: event.output, result: event.result, durationInMillis: event.durationInMillis };
      case "modelTurn":
        return { ...base, kind: "modelTurn", model: event.model, requestName: event.requestName, inputTokens: event.inputTokens, outputTokens: event.outputTokens, cachedTokens: event.cachedTokens, totalTokens: event.totalTokens, copilotUsageNanoAiu: event.copilotUsageNanoAiu, durationInMillis: event.durationInMillis };
      case "generic":
        return { ...base, kind: "generic", name: event.name, details: event.details, level: event.level, category: event.category };
      case "subagentInvocation":
        return { ...base, kind: "subagentInvocation", agentName: event.agentName, description: event.description, status: event.status, durationInMillis: event.durationInMillis, toolCallCount: event.toolCallCount, modelTurnCount: event.modelTurnCount };
      case "userMessage":
        return { ...base, kind: "userMessage", message: event.message, sections: event.sections.map((s) => ({ name: s.name, content: s.content })) };
      case "agentResponse":
        return { ...base, kind: "agentResponse", message: event.message, sections: event.sections.map((s) => ({ name: s.name, content: s.content })) };
    }
  }
  _reviveEvent(dto, sessionResource) {
    const base = {
      id: dto.id,
      sessionResource,
      created: new Date(dto.created),
      parentEventId: dto.parentEventId
    };
    switch (dto.kind) {
      case "toolCall":
        return {
          ...base,
          kind: "toolCall",
          toolName: dto.toolName,
          toolCallId: dto.toolCallId,
          input: dto.input,
          output: dto.output,
          result: dto.result,
          durationInMillis: dto.durationInMillis
        };
      case "modelTurn":
        return {
          ...base,
          kind: "modelTurn",
          model: dto.model,
          requestName: dto.requestName,
          inputTokens: dto.inputTokens,
          outputTokens: dto.outputTokens,
          cachedTokens: dto.cachedTokens,
          totalTokens: dto.totalTokens,
          copilotUsageNanoAiu: dto.copilotUsageNanoAiu,
          durationInMillis: dto.durationInMillis
        };
      case "generic":
        return {
          ...base,
          kind: "generic",
          name: dto.name,
          details: dto.details,
          level: dto.level,
          category: dto.category
        };
      case "subagentInvocation":
        return {
          ...base,
          kind: "subagentInvocation",
          agentName: dto.agentName,
          description: dto.description,
          status: dto.status,
          durationInMillis: dto.durationInMillis,
          toolCallCount: dto.toolCallCount,
          modelTurnCount: dto.modelTurnCount
        };
      case "userMessage":
        return {
          ...base,
          kind: "userMessage",
          message: dto.message,
          sections: dto.sections
        };
      case "agentResponse":
        return {
          ...base,
          kind: "agentResponse",
          message: dto.message,
          sections: dto.sections
        };
    }
  }
  _reviveResolvedContent(dto) {
    switch (dto.kind) {
      case "text":
        return { kind: "text", value: dto.value };
      case "message":
        return {
          kind: "message",
          type: dto.type,
          message: dto.message,
          sections: dto.sections
        };
      case "toolCall":
        return {
          kind: "toolCall",
          toolName: dto.toolName,
          result: dto.result,
          durationInMillis: dto.durationInMillis,
          input: dto.input,
          output: dto.output
        };
      case "modelTurn":
        return {
          kind: "modelTurn",
          requestName: dto.requestName,
          model: dto.model,
          status: dto.status,
          durationInMillis: dto.durationInMillis,
          timeToFirstTokenInMillis: dto.timeToFirstTokenInMillis,
          requestId: dto.requestId,
          maxInputTokens: dto.maxInputTokens,
          maxOutputTokens: dto.maxOutputTokens,
          inputTokens: dto.inputTokens,
          outputTokens: dto.outputTokens,
          cachedTokens: dto.cachedTokens,
          totalTokens: dto.totalTokens,
          requestOptions: dto.requestOptions,
          errorMessage: dto.errorMessage,
          sections: dto.sections
        };
      case "hook":
        return {
          kind: "hook",
          hookType: dto.hookType,
          command: dto.command,
          result: dto.result === "success" ? ChatDebugHookResult.Success : dto.result === "error" ? ChatDebugHookResult.Error : dto.result === "nonBlockingError" ? ChatDebugHookResult.NonBlockingError : void 0,
          durationInMillis: dto.durationInMillis,
          input: dto.input,
          output: dto.output,
          exitCode: dto.exitCode,
          errorMessage: dto.errorMessage
        };
    }
  }
};
MainThreadChatDebug = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatDebug),
  __decorateParam(1, IChatDebugService),
  __decorateParam(2, IChatService)
], MainThreadChatDebug);
export {
  MainThreadChatDebug
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdERlYnVnLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnSG9va1Jlc3VsdCwgQ2hhdERlYnVnTG9nTGV2ZWwsIElDaGF0RGVidWdFdmVudCwgSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50LCBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdERlYnVnU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dEhvc3ROYW1lZEN1c3RvbWVyLCBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDaGF0RGVidWdTaGFwZSwgRXh0SG9zdENvbnRleHQsIElDaGF0RGVidWdFdmVudER0bywgSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50RHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENoYXREZWJ1Z1NoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgUHJveGllZCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL3Byb3h5SWRlbnRpZmllci5qcyc7XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkQ2hhdERlYnVnKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDaGF0RGVidWcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgTWFpblRocmVhZENoYXREZWJ1Z1NoYXBlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IFByb3hpZWQ8RXh0SG9zdENoYXREZWJ1Z1NoYXBlPjtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJEaXNwb3NhYmxlcyA9IG5ldyBNYXA8bnVtYmVyLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVNlc3Npb25SZXNvdXJjZXMgPSBuZXcgTWFwPG51bWJlciwgVVJJPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb3JlRXZlbnRGb3J3YXJkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdERlYnVnU2VydmljZTogSUNoYXREZWJ1Z1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3Byb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdENoYXREZWJ1Zyk7XG5cdH1cblxuXHQkc3Vic2NyaWJlVG9Db3JlRGVidWdFdmVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29yZUV2ZW50Rm9yd2FyZGVyLnZhbHVlID0gdGhpcy5fY2hhdERlYnVnU2VydmljZS5vbkRpZEFkZEV2ZW50KGV2ZW50ID0+IHtcblx0XHRcdGlmICh0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLmlzQ29yZUV2ZW50KGV2ZW50KSkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25Db3JlRGVidWdFdmVudCh0aGlzLl9zZXJpYWxpemVFdmVudChldmVudCkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0JHVuc3Vic2NyaWJlRnJvbUNvcmVEZWJ1Z0V2ZW50cygpOiB2b2lkIHtcblx0XHR0aGlzLl9jb3JlRXZlbnRGb3J3YXJkZXIuY2xlYXIoKTtcblx0fVxuXG5cdCRyZWdpc3RlckNoYXREZWJ1Z0xvZ1Byb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fcHJvdmlkZXJEaXNwb3NhYmxlcy5zZXQoaGFuZGxlLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fY2hhdERlYnVnU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKHtcblx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2c6IGFzeW5jIChzZXNzaW9uUmVzb3VyY2UsIHRva2VuKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25SZXNvdXJjZXMuc2V0KGhhbmRsZSwgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgZHRvcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRwcm92aWRlQ2hhdERlYnVnTG9nKGhhbmRsZSwgc2Vzc2lvblJlc291cmNlLCB0b2tlbik7XG5cdFx0XHRcdHJldHVybiBkdG9zPy5tYXAoZHRvID0+IHRoaXMuX3Jldml2ZUV2ZW50KGR0bywgc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50OiBhc3luYyAoZXZlbnRJZCwgdG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3QgZHRvID0gYXdhaXQgdGhpcy5fcHJveHkuJHJlc29sdmVDaGF0RGVidWdMb2dFdmVudChoYW5kbGUsIGV2ZW50SWQsIHRva2VuKTtcblx0XHRcdFx0cmV0dXJuIGR0byA/IHRoaXMuX3Jldml2ZVJlc29sdmVkQ29udGVudChkdG8pIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdHByb3ZpZGVDaGF0RGVidWdMb2dFeHBvcnQ6IGFzeW5jIChzZXNzaW9uUmVzb3VyY2UsIHRva2VuKSA9PiB7XG5cdFx0XHRcdC8vIEdhdGhlciBjb3JlIGV2ZW50cyBhbmQgc2Vzc2lvbiB0aXRsZSB0byBwYXNzIHRvIHRoZSBleHRlbnNpb24uXG5cdFx0XHRcdGNvbnN0IGNvcmVFdmVudER0b3MgPSB0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLmdldEV2ZW50cyhzZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHRcdFx0LmZpbHRlcihlID0+IHRoaXMuX2NoYXREZWJ1Z1NlcnZpY2UuaXNDb3JlRXZlbnQoZSkpXG5cdFx0XHRcdFx0Lm1hcChlID0+IHRoaXMuX3NlcmlhbGl6ZUV2ZW50KGUpKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblRpdGxlID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRleHBvcnRDaGF0RGVidWdMb2coaGFuZGxlLCBzZXNzaW9uUmVzb3VyY2UsIGNvcmVFdmVudER0b3MsIHNlc3Npb25UaXRsZSwgdG9rZW4pO1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0Py5idWZmZXI7XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZUNoYXREZWJ1Z0xvZ0ltcG9ydDogYXN5bmMgKGRhdGEsIHRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Byb3h5LiRpbXBvcnRDaGF0RGVidWdMb2coaGFuZGxlLCBWU0J1ZmZlci53cmFwKGRhdGEpLCB0b2tlbik7XG5cdFx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucmV2aXZlKHJlc3VsdC51cmkpO1xuXHRcdFx0XHRpZiAocmVzdWx0LnNlc3Npb25UaXRsZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NoYXREZWJ1Z1NlcnZpY2Uuc2V0SW1wb3J0ZWRTZXNzaW9uVGl0bGUodXJpLCByZXN1bHQuc2Vzc2lvblRpdGxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdXJpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGEgbGF6eSBmZXRjaGVyIHNvIGhpc3RvcmljYWwgc2Vzc2lvbnMgYXJlIGxvYWRlZCBmcm9tIHRoZVxuXHRcdC8vIGV4dGVuc2lvbiBvbmx5IHdoZW4gdGhlIGRlYnVnIHBhbmVsIGhvbWUgcGFnZSBmaXJzdCBuZWVkcyB0aGVtLlxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLnJlZ2lzdGVyQXZhaWxhYmxlU2Vzc2lvbnNGZXRjaGVyKGFzeW5jICh0b2tlbikgPT4ge1xuXHRcdFx0Y29uc3QgZW50cmllcyA9IGF3YWl0IHRoaXMuX3Byb3h5LiRnZXRBdmFpbGFibGVEZWJ1Z1Nlc3Npb25SZXNvdXJjZXMoaGFuZGxlLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gZW50cmllcy5tYXAoZSA9PiAoeyB1cmk6IFVSSS5yZXZpdmUoZS51cmkpLCB0aXRsZTogZS50aXRsZSB9KSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0JHVucmVnaXN0ZXJDaGF0RGVidWdMb2dQcm92aWRlcihoYW5kbGU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdGhpcy5fcHJvdmlkZXJEaXNwb3NhYmxlcy5nZXQoaGFuZGxlKTtcblx0XHRkaXNwb3NhYmxlcz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyRGlzcG9zYWJsZXMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvblJlc291cmNlcy5kZWxldGUoaGFuZGxlKTtcblx0fVxuXG5cdCRhY2NlcHRDaGF0RGVidWdFdmVudChoYW5kbGU6IG51bWJlciwgZHRvOiBJQ2hhdERlYnVnRXZlbnREdG8pOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSAoZHRvLnNlc3Npb25SZXNvdXJjZSA/IFVSSS5yZXZpdmUoZHRvLnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQpXG5cdFx0XHQ/PyB0aGlzLl9hY3RpdmVTZXNzaW9uUmVzb3VyY2VzLmdldChoYW5kbGUpXG5cdFx0XHQ/PyB0aGlzLl9jaGF0RGVidWdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25SZXNvdXJjZTtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXZpdmVkID0gdGhpcy5fcmV2aXZlRXZlbnQoZHRvLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX2NoYXREZWJ1Z1NlcnZpY2UuYWRkUHJvdmlkZXJFdmVudChyZXZpdmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlcmlhbGl6ZUV2ZW50KGV2ZW50OiBJQ2hhdERlYnVnRXZlbnQpOiBJQ2hhdERlYnVnRXZlbnREdG8ge1xuXHRcdGNvbnN0IGJhc2UgPSB7XG5cdFx0XHRpZDogZXZlbnQuaWQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGV2ZW50LnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNyZWF0ZWQ6IGV2ZW50LmNyZWF0ZWQuZ2V0VGltZSgpLFxuXHRcdFx0cGFyZW50RXZlbnRJZDogZXZlbnQucGFyZW50RXZlbnRJZCxcblx0XHR9O1xuXG5cdFx0c3dpdGNoIChldmVudC5raW5kKSB7XG5cdFx0XHRjYXNlICd0b29sQ2FsbCc6XG5cdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIGtpbmQ6ICd0b29sQ2FsbCcsIHRvb2xOYW1lOiBldmVudC50b29sTmFtZSwgdG9vbENhbGxJZDogZXZlbnQudG9vbENhbGxJZCwgaW5wdXQ6IGV2ZW50LmlucHV0LCBvdXRwdXQ6IGV2ZW50Lm91dHB1dCwgcmVzdWx0OiBldmVudC5yZXN1bHQsIGR1cmF0aW9uSW5NaWxsaXM6IGV2ZW50LmR1cmF0aW9uSW5NaWxsaXMgfTtcblx0XHRcdGNhc2UgJ21vZGVsVHVybic6XG5cdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIGtpbmQ6ICdtb2RlbFR1cm4nLCBtb2RlbDogZXZlbnQubW9kZWwsIHJlcXVlc3ROYW1lOiBldmVudC5yZXF1ZXN0TmFtZSwgaW5wdXRUb2tlbnM6IGV2ZW50LmlucHV0VG9rZW5zLCBvdXRwdXRUb2tlbnM6IGV2ZW50Lm91dHB1dFRva2VucywgY2FjaGVkVG9rZW5zOiBldmVudC5jYWNoZWRUb2tlbnMsIHRvdGFsVG9rZW5zOiBldmVudC50b3RhbFRva2VucywgY29waWxvdFVzYWdlTmFub0FpdTogZXZlbnQuY29waWxvdFVzYWdlTmFub0FpdSwgZHVyYXRpb25Jbk1pbGxpczogZXZlbnQuZHVyYXRpb25Jbk1pbGxpcyB9O1xuXHRcdFx0Y2FzZSAnZ2VuZXJpYyc6XG5cdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIGtpbmQ6ICdnZW5lcmljJywgbmFtZTogZXZlbnQubmFtZSwgZGV0YWlsczogZXZlbnQuZGV0YWlscywgbGV2ZWw6IGV2ZW50LmxldmVsLCBjYXRlZ29yeTogZXZlbnQuY2F0ZWdvcnkgfTtcblx0XHRcdGNhc2UgJ3N1YmFnZW50SW52b2NhdGlvbic6XG5cdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIGtpbmQ6ICdzdWJhZ2VudEludm9jYXRpb24nLCBhZ2VudE5hbWU6IGV2ZW50LmFnZW50TmFtZSwgZGVzY3JpcHRpb246IGV2ZW50LmRlc2NyaXB0aW9uLCBzdGF0dXM6IGV2ZW50LnN0YXR1cywgZHVyYXRpb25Jbk1pbGxpczogZXZlbnQuZHVyYXRpb25Jbk1pbGxpcywgdG9vbENhbGxDb3VudDogZXZlbnQudG9vbENhbGxDb3VudCwgbW9kZWxUdXJuQ291bnQ6IGV2ZW50Lm1vZGVsVHVybkNvdW50IH07XG5cdFx0XHRjYXNlICd1c2VyTWVzc2FnZSc6XG5cdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIGtpbmQ6ICd1c2VyTWVzc2FnZScsIG1lc3NhZ2U6IGV2ZW50Lm1lc3NhZ2UsIHNlY3Rpb25zOiBldmVudC5zZWN0aW9ucy5tYXAocyA9PiAoeyBuYW1lOiBzLm5hbWUsIGNvbnRlbnQ6IHMuY29udGVudCB9KSkgfTtcblx0XHRcdGNhc2UgJ2FnZW50UmVzcG9uc2UnOlxuXHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBraW5kOiAnYWdlbnRSZXNwb25zZScsIG1lc3NhZ2U6IGV2ZW50Lm1lc3NhZ2UsIHNlY3Rpb25zOiBldmVudC5zZWN0aW9ucy5tYXAocyA9PiAoeyBuYW1lOiBzLm5hbWUsIGNvbnRlbnQ6IHMuY29udGVudCB9KSkgfTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXZpdmVFdmVudChkdG86IElDaGF0RGVidWdFdmVudER0bywgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdERlYnVnRXZlbnQge1xuXHRcdGNvbnN0IGJhc2UgPSB7XG5cdFx0XHRpZDogZHRvLmlkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y3JlYXRlZDogbmV3IERhdGUoZHRvLmNyZWF0ZWQpLFxuXHRcdFx0cGFyZW50RXZlbnRJZDogZHRvLnBhcmVudEV2ZW50SWQsXG5cdFx0fTtcblxuXHRcdHN3aXRjaCAoZHRvLmtpbmQpIHtcblx0XHRcdGNhc2UgJ3Rvb2xDYWxsJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGtpbmQ6ICd0b29sQ2FsbCcsXG5cdFx0XHRcdFx0dG9vbE5hbWU6IGR0by50b29sTmFtZSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBkdG8udG9vbENhbGxJZCxcblx0XHRcdFx0XHRpbnB1dDogZHRvLmlucHV0LFxuXHRcdFx0XHRcdG91dHB1dDogZHRvLm91dHB1dCxcblx0XHRcdFx0XHRyZXN1bHQ6IGR0by5yZXN1bHQsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZHRvLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdtb2RlbFR1cm4nOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ21vZGVsVHVybicsXG5cdFx0XHRcdFx0bW9kZWw6IGR0by5tb2RlbCxcblx0XHRcdFx0XHRyZXF1ZXN0TmFtZTogZHRvLnJlcXVlc3ROYW1lLFxuXHRcdFx0XHRcdGlucHV0VG9rZW5zOiBkdG8uaW5wdXRUb2tlbnMsXG5cdFx0XHRcdFx0b3V0cHV0VG9rZW5zOiBkdG8ub3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRcdGNhY2hlZFRva2VuczogZHRvLmNhY2hlZFRva2Vucyxcblx0XHRcdFx0XHR0b3RhbFRva2VuczogZHRvLnRvdGFsVG9rZW5zLFxuXHRcdFx0XHRcdGNvcGlsb3RVc2FnZU5hbm9BaXU6IGR0by5jb3BpbG90VXNhZ2VOYW5vQWl1LFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGR0by5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnZ2VuZXJpYyc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0XHRcdFx0bmFtZTogZHRvLm5hbWUsXG5cdFx0XHRcdFx0ZGV0YWlsczogZHRvLmRldGFpbHMsXG5cdFx0XHRcdFx0bGV2ZWw6IGR0by5sZXZlbCBhcyBDaGF0RGVidWdMb2dMZXZlbCxcblx0XHRcdFx0XHRjYXRlZ29yeTogZHRvLmNhdGVnb3J5LFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnc3ViYWdlbnRJbnZvY2F0aW9uJzpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudEludm9jYXRpb24nLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogZHRvLmFnZW50TmFtZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZHRvLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHN0YXR1czogZHRvLnN0YXR1cyxcblx0XHRcdFx0XHRkdXJhdGlvbkluTWlsbGlzOiBkdG8uZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0XHR0b29sQ2FsbENvdW50OiBkdG8udG9vbENhbGxDb3VudCxcblx0XHRcdFx0XHRtb2RlbFR1cm5Db3VudDogZHRvLm1vZGVsVHVybkNvdW50LFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAndXNlck1lc3NhZ2UnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ3VzZXJNZXNzYWdlJyxcblx0XHRcdFx0XHRtZXNzYWdlOiBkdG8ubWVzc2FnZSxcblx0XHRcdFx0XHRzZWN0aW9uczogZHRvLnNlY3Rpb25zLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnYWdlbnRSZXNwb25zZSc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAnYWdlbnRSZXNwb25zZScsXG5cdFx0XHRcdFx0bWVzc2FnZTogZHRvLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IGR0by5zZWN0aW9ucyxcblx0XHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXZpdmVSZXNvbHZlZENvbnRlbnQoZHRvOiBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnREdG8pOiBJQ2hhdERlYnVnUmVzb2x2ZWRFdmVudENvbnRlbnQge1xuXHRcdHN3aXRjaCAoZHRvLmtpbmQpIHtcblx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAndGV4dCcsIHZhbHVlOiBkdG8udmFsdWUgfTtcblx0XHRcdGNhc2UgJ21lc3NhZ2UnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdtZXNzYWdlJyxcblx0XHRcdFx0XHR0eXBlOiBkdG8udHlwZSxcblx0XHRcdFx0XHRtZXNzYWdlOiBkdG8ubWVzc2FnZSxcblx0XHRcdFx0XHRzZWN0aW9uczogZHRvLnNlY3Rpb25zLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAndG9vbENhbGwnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICd0b29sQ2FsbCcsXG5cdFx0XHRcdFx0dG9vbE5hbWU6IGR0by50b29sTmFtZSxcblx0XHRcdFx0XHRyZXN1bHQ6IGR0by5yZXN1bHQsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZHRvLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0aW5wdXQ6IGR0by5pbnB1dCxcblx0XHRcdFx0XHRvdXRwdXQ6IGR0by5vdXRwdXQsXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlICdtb2RlbFR1cm4nOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdtb2RlbFR1cm4nLFxuXHRcdFx0XHRcdHJlcXVlc3ROYW1lOiBkdG8ucmVxdWVzdE5hbWUsXG5cdFx0XHRcdFx0bW9kZWw6IGR0by5tb2RlbCxcblx0XHRcdFx0XHRzdGF0dXM6IGR0by5zdGF0dXMsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZHRvLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0dGltZVRvRmlyc3RUb2tlbkluTWlsbGlzOiBkdG8udGltZVRvRmlyc3RUb2tlbkluTWlsbGlzLFxuXHRcdFx0XHRcdHJlcXVlc3RJZDogZHRvLnJlcXVlc3RJZCxcblx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogZHRvLm1heElucHV0VG9rZW5zLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogZHRvLm1heE91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRpbnB1dFRva2VuczogZHRvLmlucHV0VG9rZW5zLFxuXHRcdFx0XHRcdG91dHB1dFRva2VuczogZHRvLm91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRjYWNoZWRUb2tlbnM6IGR0by5jYWNoZWRUb2tlbnMsXG5cdFx0XHRcdFx0dG90YWxUb2tlbnM6IGR0by50b3RhbFRva2Vucyxcblx0XHRcdFx0XHRyZXF1ZXN0T3B0aW9uczogZHRvLnJlcXVlc3RPcHRpb25zLFxuXHRcdFx0XHRcdGVycm9yTWVzc2FnZTogZHRvLmVycm9yTWVzc2FnZSxcblx0XHRcdFx0XHRzZWN0aW9uczogZHRvLnNlY3Rpb25zLFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAnaG9vayc6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogJ2hvb2snLFxuXHRcdFx0XHRcdGhvb2tUeXBlOiBkdG8uaG9va1R5cGUsXG5cdFx0XHRcdFx0Y29tbWFuZDogZHRvLmNvbW1hbmQsXG5cdFx0XHRcdFx0cmVzdWx0OiBkdG8ucmVzdWx0ID09PSAnc3VjY2VzcycgPyBDaGF0RGVidWdIb29rUmVzdWx0LlN1Y2Nlc3Ncblx0XHRcdFx0XHRcdDogZHRvLnJlc3VsdCA9PT0gJ2Vycm9yJyA/IENoYXREZWJ1Z0hvb2tSZXN1bHQuRXJyb3Jcblx0XHRcdFx0XHRcdFx0OiBkdG8ucmVzdWx0ID09PSAnbm9uQmxvY2tpbmdFcnJvcicgPyBDaGF0RGVidWdIb29rUmVzdWx0Lk5vbkJsb2NraW5nRXJyb3Jcblx0XHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkdXJhdGlvbkluTWlsbGlzOiBkdG8uZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0XHRpbnB1dDogZHRvLmlucHV0LFxuXHRcdFx0XHRcdG91dHB1dDogZHRvLm91dHB1dCxcblx0XHRcdFx0XHRleGl0Q29kZTogZHRvLmV4aXRDb2RlLFxuXHRcdFx0XHRcdGVycm9yTWVzc2FnZTogZHRvLmVycm9yTWVzc2FnZSxcblx0XHRcdFx0fTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXlGLHlCQUF5QjtBQUMzSCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE2QztBQUN0RCxTQUFnQyxnQkFBdUUsbUJBQTZDO0FBSTdJLElBQU0sc0JBQU4sY0FBa0MsV0FBK0M7QUFBQSxFQU12RixZQUNDLGdCQUNvQyxtQkFDTCxjQUM5QjtBQUNELFVBQU07QUFIOEI7QUFDTDtBQVBoQyxTQUFpQix1QkFBdUIsb0JBQUksSUFBNkI7QUFDekUsU0FBaUIsMEJBQTBCLG9CQUFJLElBQWlCO0FBQ2hFLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxrQkFBa0IsQ0FBQztBQVE1RSxTQUFLLFNBQVMsZUFBZSxTQUFTLGVBQWUsZ0JBQWdCO0FBQUEsRUFDdEU7QUFBQSxFQUVBLDhCQUFvQztBQUNuQyxTQUFLLG9CQUFvQixRQUFRLEtBQUssa0JBQWtCLGNBQWMsV0FBUztBQUM5RSxVQUFJLEtBQUssa0JBQWtCLFlBQVksS0FBSyxHQUFHO0FBQzlDLGFBQUssT0FBTyxrQkFBa0IsS0FBSyxnQkFBZ0IsS0FBSyxDQUFDO0FBQUEs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
