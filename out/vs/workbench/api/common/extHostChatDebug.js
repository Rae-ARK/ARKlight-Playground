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
import { VSBuffer } from "../../../base/common/buffer.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { MainContext } from "./extHost.protocol.js";
import { ChatDebugGenericEvent, ChatDebugHookResult, ChatDebugMessageContentType, ChatDebugMessageSection, ChatDebugModelTurnEvent, ChatDebugSubagentInvocationEvent, ChatDebugSubagentStatus, ChatDebugToolCallEvent, ChatDebugToolCallResult, ChatDebugUserMessageEvent, ChatDebugAgentResponseEvent } from "./extHostTypes.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
let ExtHostChatDebug = class extends Disposable {
  constructor(extHostRpc) {
    super();
    this._nextHandle = 0;
    /** Progress pipelines keyed by `${handle}:${sessionResource}` so multiple sessions can stream concurrently. */
    this._activeProgress = /* @__PURE__ */ new Map();
    this._onDidAddCoreEvent = this._register(new Emitter({
      onWillAddFirstListener: () => this._proxy.$subscribeToCoreDebugEvents(),
      onDidRemoveLastListener: () => this._proxy.$unsubscribeFromCoreDebugEvents()
    }));
    this.onDidAddCoreEvent = this._onDidAddCoreEvent.event;
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadChatDebug);
  }
  _progressKey(handle, sessionResource) {
    return `${handle}:${URI.revive(sessionResource).toString()}`;
  }
  _cleanupProgress(key) {
    const store = this._activeProgress.get(key);
    if (store) {
      store.dispose();
      this._activeProgress.delete(key);
    }
  }
  registerChatDebugLogProvider(provider) {
    if (this._provider) {
      throw new Error("A ChatDebugLogProvider is already registered.");
    }
    this._provider = provider;
    const handle = this._nextHandle++;
    this._proxy.$registerChatDebugLogProvider(handle);
    return toDisposable(() => {
      this._provider = void 0;
      for (const [key, store] of this._activeProgress) {
        if (key.startsWith(`${handle}:`)) {
          store.dispose();
          this._activeProgress.delete(key);
        }
      }
      this._proxy.$unregisterChatDebugLogProvider(handle);
    });
  }
  async $provideChatDebugLog(handle, sessionResource, token) {
    if (!this._provider) {
      return void 0;
    }
    const key = this._progressKey(handle, sessionResource);
    this._cleanupProgress(key);
    const store = new DisposableStore();
    this._activeProgress.set(key, store);
    const emitter = store.add(new Emitter());
    store.add(emitter.event((event) => {
      const dto = this._serializeEvent(event);
      if (!dto.sessionResource) {
        dto.sessionResource = sessionResource;
      }
      this._proxy.$acceptChatDebugEvent(handle, dto);
    }));
    store.add(token.onCancellationRequested(() => {
      this._cleanupProgress(key);
    }));
    try {
      const progress = {
        report: (value) => emitter.fire(value)
      };
      const sessionUri = URI.revive(sessionResource);
      const result = await this._provider.provideChatDebugLog(sessionUri, progress, token);
      if (!result) {
        return void 0;
      }
      return result.map((event) => this._serializeEvent(event));
    } catch (err) {
      this._cleanupProgress(key);
      throw err;
    }
  }
  _serializeEvent(event) {
    const base = {
      id: event.id,
      sessionResource: event.sessionResource,
      created: event.created.getTime(),
      parentEventId: event.parentEventId
    };
    const kind = event._kind;
    switch (kind) {
      case "toolCall": {
        const e = event;
        return {
          ...base,
          kind: "toolCall",
          toolName: e.toolName,
          toolCallId: e.toolCallId,
          input: e.input,
          output: e.output,
          result: e.result === ChatDebugToolCallResult.Success ? "success" : e.result === ChatDebugToolCallResult.Error ? "error" : void 0,
          durationInMillis: e.durationInMillis
        };
      }
      case "modelTurn": {
        const e = event;
        return {
          ...base,
          kind: "modelTurn",
          model: e.model,
          requestName: e.requestName,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          cachedTokens: e.cachedTokens,
          totalTokens: e.totalTokens,
          copilotUsageNanoAiu: e.copilotUsageNanoAiu,
          durationInMillis: e.durationInMillis
        };
      }
      case "generic": {
        const e = event;
        return {
          ...base,
          kind: "generic",
          name: e.name,
          details: e.details,
          level: e.level,
          category: e.category
        };
      }
      case "subagentInvocation": {
        const e = event;
        return {
          ...base,
          kind: "subagentInvocation",
          agentName: e.agentName,
          description: e.description,
          status: e.status === ChatDebugSubagentStatus.Running ? "running" : e.status === ChatDebugSubagentStatus.Completed ? "completed" : e.status === ChatDebugSubagentStatus.Failed ? "failed" : void 0,
          durationInMillis: e.durationInMillis,
          toolCallCount: e.toolCallCount,
          modelTurnCount: e.modelTurnCount
        };
      }
      case "userMessage": {
        const e = event;
        return {
          ...base,
          kind: "userMessage",
          message: e.message,
          sections: e.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "agentResponse": {
        const e = event;
        return {
          ...base,
          kind: "agentResponse",
          message: e.message,
          sections: e.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      default: {
        const generic = event;
        const rawName = generic.name;
        const rawDetails = generic.details;
        return {
          ...base,
          kind: "generic",
          name: typeof rawName === "string" ? rawName : "",
          details: typeof rawDetails === "string" ? rawDetails : void 0,
          level: generic.level ?? 1,
          category: generic.category
        };
      }
    }
  }
  async $resolveChatDebugLogEvent(_handle, eventId, token) {
    if (!this._provider?.resolveChatDebugLogEvent) {
      return void 0;
    }
    const result = await this._provider.resolveChatDebugLogEvent(eventId, token);
    if (!result) {
      return void 0;
    }
    const kind = result._kind;
    switch (kind) {
      case "text":
        return { kind: "text", value: result.value };
      case "messageContent": {
        const msg = result;
        return {
          kind: "message",
          type: msg.type === ChatDebugMessageContentType.User ? "user" : "agent",
          message: msg.message,
          sections: msg.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "userMessage": {
        const msg = result;
        return {
          kind: "message",
          type: "user",
          message: msg.message,
          sections: msg.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "agentResponse": {
        const msg = result;
        return {
          kind: "message",
          type: "agent",
          message: msg.message,
          sections: msg.sections.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "toolCallContent": {
        const tc = result;
        return {
          kind: "toolCall",
          toolName: tc.toolName,
          result: tc.result === ChatDebugToolCallResult.Success ? "success" : tc.result === ChatDebugToolCallResult.Error ? "error" : void 0,
          durationInMillis: tc.durationInMillis,
          input: tc.input,
          output: tc.output
        };
      }
      case "modelTurnContent": {
        const mt = result;
        return {
          kind: "modelTurn",
          requestName: mt.requestName,
          model: mt.model,
          status: mt.status,
          durationInMillis: mt.durationInMillis,
          timeToFirstTokenInMillis: mt.timeToFirstTokenInMillis,
          requestId: mt.requestId,
          maxInputTokens: mt.maxInputTokens,
          maxOutputTokens: mt.maxOutputTokens,
          inputTokens: mt.inputTokens,
          outputTokens: mt.outputTokens,
          cachedTokens: mt.cachedTokens,
          totalTokens: mt.totalTokens,
          requestOptions: mt.requestOptions,
          errorMessage: mt.errorMessage,
          sections: mt.sections?.map((s) => ({ name: s.name, content: s.content }))
        };
      }
      case "hookContent": {
        const hk = result;
        return {
          kind: "hook",
          hookType: hk.hookType,
          command: hk.command,
          result: hk.result === ChatDebugHookResult.Success ? "success" : hk.result === ChatDebugHookResult.Error ? "error" : hk.result === ChatDebugHookResult.NonBlockingError ? "nonBlockingError" : void 0,
          durationInMillis: hk.durationInMillis,
          input: hk.input,
          output: hk.output,
          exitCode: hk.exitCode,
          errorMessage: hk.errorMessage
        };
      }
      default:
        return void 0;
    }
  }
  _deserializeEvent(dto) {
    const created = new Date(dto.created);
    const sessionResource = dto.sessionResource ? URI.revive(dto.sessionResource) : void 0;
    switch (dto.kind) {
      case "toolCall": {
        const evt = new ChatDebugToolCallEvent(dto.toolName, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.toolCallId = dto.toolCallId;
        evt.input = dto.input;
        evt.output = dto.output;
        evt.result = dto.result === "success" ? ChatDebugToolCallResult.Success : dto.result === "error" ? ChatDebugToolCallResult.Error : void 0;
        evt.durationInMillis = dto.durationInMillis;
        return evt;
      }
      case "modelTurn": {
        const evt = new ChatDebugModelTurnEvent(created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.model = dto.model;
        evt.requestName = dto.requestName;
        evt.inputTokens = dto.inputTokens;
        evt.outputTokens = dto.outputTokens;
        evt.cachedTokens = dto.cachedTokens;
        evt.totalTokens = dto.totalTokens;
        evt.copilotUsageNanoAiu = dto.copilotUsageNanoAiu;
        evt.durationInMillis = dto.durationInMillis;
        return evt;
      }
      case "generic": {
        const evt = new ChatDebugGenericEvent(dto.name, dto.level, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.details = dto.details;
        evt.category = dto.category;
        return evt;
      }
      case "subagentInvocation": {
        const evt = new ChatDebugSubagentInvocationEvent(dto.agentName, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.description = dto.description;
        evt.status = dto.status === "running" ? ChatDebugSubagentStatus.Running : dto.status === "completed" ? ChatDebugSubagentStatus.Completed : dto.status === "failed" ? ChatDebugSubagentStatus.Failed : void 0;
        evt.durationInMillis = dto.durationInMillis;
        evt.toolCallCount = dto.toolCallCount;
        evt.modelTurnCount = dto.modelTurnCount;
        return evt;
      }
      case "userMessage": {
        const evt = new ChatDebugUserMessageEvent(dto.message, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.sections = dto.sections.map((s) => new ChatDebugMessageSection(s.name, s.content));
        return evt;
      }
      case "agentResponse": {
        const evt = new ChatDebugAgentResponseEvent(dto.message, created);
        evt.id = dto.id;
        evt.sessionResource = sessionResource;
        evt.parentEventId = dto.parentEventId;
        evt.sections = dto.sections.map((s) => new ChatDebugMessageSection(s.name, s.content));
        return evt;
      }
      default:
        return void 0;
    }
  }
  $onCoreDebugEvent(dto) {
    const event = this._deserializeEvent(dto);
    if (event) {
      this._onDidAddCoreEvent.fire(event);
    }
  }
  async $exportChatDebugLog(_handle, sessionResource, coreEventDtos, sessionTitle, token) {
    if (!this._provider?.provideChatDebugLogExport) {
      return void 0;
    }
    const sessionUri = URI.revive(sessionResource);
    const coreEvents = coreEventDtos.map((dto) => this._deserializeEvent(dto)).filter((e) => e !== void 0);
    const options = { coreEvents, sessionTitle };
    const result = await this._provider.provideChatDebugLogExport(sessionUri, options, token);
    if (!result) {
      return void 0;
    }
    return VSBuffer.wrap(result);
  }
  async $importChatDebugLog(_handle, data, token) {
    if (!this._provider?.resolveChatDebugLogImport) {
      return void 0;
    }
    const result = await this._provider.resolveChatDebugLogImport(data.buffer, token);
    if (!result) {
      return void 0;
    }
    return { uri: result.uri, sessionTitle: result.sessionTitle };
  }
  async $getAvailableDebugSessionResources(_handle, token) {
    if (!this._provider?.provideAvailableDebugSessionResources) {
      return [];
    }
    const result = await this._provider.provideAvailableDebugSessionResources(token);
    return result ?? [];
  }
  dispose() {
    for (const store of this._activeProgress.values()) {
      store.dispose();
    }
    this._activeProgress.clear();
    super.dispose();
  }
};
ExtHostChatDebug = __decorateClass([
  __decorateParam(0, IExtHostRpcService)
], ExtHostChatDebug);
export {
  ExtHostChatDebug
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDaGF0RGVidWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q2hhdERlYnVnU2hhcGUsIElDaGF0RGVidWdFdmVudER0bywgSUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50RHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENoYXREZWJ1Z1NoYXBlIH0gZnJvbSAnLi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENoYXREZWJ1Z0dlbmVyaWNFdmVudCwgQ2hhdERlYnVnSG9va1Jlc3VsdCwgQ2hhdERlYnVnTG9nTGV2ZWwsIENoYXREZWJ1Z01lc3NhZ2VDb250ZW50VHlwZSwgQ2hhdERlYnVnTWVzc2FnZVNlY3Rpb24sIENoYXREZWJ1Z01vZGVsVHVybkV2ZW50LCBDaGF0RGVidWdTdWJhZ2VudEludm9jYXRpb25FdmVudCwgQ2hhdERlYnVnU3ViYWdlbnRTdGF0dXMsIENoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQsIENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0LCBDaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50LCBDaGF0RGVidWdBZ2VudFJlc3BvbnNlRXZlbnQsIENoYXREZWJ1Z0V2ZW50SG9va0NvbnRlbnQgfSBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFJwY1NlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RScGNTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIEV4dEhvc3RDaGF0RGVidWcgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgRXh0SG9zdENoYXREZWJ1Z1NoYXBlIHtcblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWRDaGF0RGVidWdTaGFwZTtcblx0cHJpdmF0ZSBfcHJvdmlkZXI6IHZzY29kZS5DaGF0RGVidWdMb2dQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbmV4dEhhbmRsZTogbnVtYmVyID0gMDtcblx0LyoqIFByb2dyZXNzIHBpcGVsaW5lcyBrZXllZCBieSBgJHtoYW5kbGV9OiR7c2Vzc2lvblJlc291cmNlfWAgc28gbXVsdGlwbGUgc2Vzc2lvbnMgY2FuIHN0cmVhbSBjb25jdXJyZW50bHkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVByb2dyZXNzID0gbmV3IE1hcDxzdHJpbmcsIERpc3Bvc2FibGVTdG9yZT4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZENvcmVFdmVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZzY29kZS5DaGF0RGVidWdFdmVudD4oe1xuXHRcdG9uV2lsbEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHRoaXMuX3Byb3h5LiRzdWJzY3JpYmVUb0NvcmVEZWJ1Z0V2ZW50cygpLFxuXHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB0aGlzLl9wcm94eS4kdW5zdWJzY3JpYmVGcm9tQ29yZURlYnVnRXZlbnRzKCksXG5cdH0pKTtcblx0cmVhZG9ubHkgb25EaWRBZGRDb3JlRXZlbnQgPSB0aGlzLl9vbkRpZEFkZENvcmVFdmVudC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZENoYXREZWJ1Zyk7XG5cdH1cblxuXHRwcml2YXRlIF9wcm9ncmVzc0tleShoYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7aGFuZGxlfToke1VSSS5yZXZpdmUoc2Vzc2lvblJlc291cmNlKS50b1N0cmluZygpfWA7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhbnVwUHJvZ3Jlc3Moa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdG9yZSA9IHRoaXMuX2FjdGl2ZVByb2dyZXNzLmdldChrZXkpO1xuXHRcdGlmIChzdG9yZSkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fYWN0aXZlUHJvZ3Jlc3MuZGVsZXRlKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJDaGF0RGVidWdMb2dQcm92aWRlcihwcm92aWRlcjogdnNjb2RlLkNoYXREZWJ1Z0xvZ1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLl9wcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdBIENoYXREZWJ1Z0xvZ1Byb3ZpZGVyIGlzIGFscmVhZHkgcmVnaXN0ZXJlZC4nKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlkZXIgPSBwcm92aWRlcjtcblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9uZXh0SGFuZGxlKys7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyQ2hhdERlYnVnTG9nUHJvdmlkZXIoaGFuZGxlKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBDbGVhbiB1cCBhbGwgcHJvZ3Jlc3MgcGlwZWxpbmVzIGZvciB0aGlzIGhhbmRsZVxuXHRcdFx0Zm9yIChjb25zdCBba2V5LCBzdG9yZV0gb2YgdGhpcy5fYWN0aXZlUHJvZ3Jlc3MpIHtcblx0XHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKGAke2hhbmRsZX06YCkpIHtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlUHJvZ3Jlc3MuZGVsZXRlKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyQ2hhdERlYnVnTG9nUHJvdmlkZXIoaGFuZGxlKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRwcm92aWRlQ2hhdERlYnVnTG9nKGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uUmVzb3VyY2U6IFVyaUNvbXBvbmVudHMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXREZWJ1Z0V2ZW50RHRvW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENsZWFuIHVwIGFueSBwcmV2aW91cyBwcm9ncmVzcyBwaXBlbGluZSBmb3IgdGhpcyBoYW5kbGUrc2Vzc2lvbiBwYWlyXG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fcHJvZ3Jlc3NLZXkoaGFuZGxlLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX2NsZWFudXBQcm9ncmVzcyhrZXkpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fYWN0aXZlUHJvZ3Jlc3Muc2V0KGtleSwgc3RvcmUpO1xuXG5cdFx0Y29uc3QgZW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2c2NvZGUuQ2hhdERlYnVnRXZlbnQ+KCkpO1xuXG5cdFx0Ly8gRm9yd2FyZCBwcm9ncmVzcyBldmVudHMgdG8gdGhlIG1haW4gdGhyZWFkXG5cdFx0c3RvcmUuYWRkKGVtaXR0ZXIuZXZlbnQoZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3QgZHRvID0gdGhpcy5fc2VyaWFsaXplRXZlbnQoZXZlbnQpO1xuXHRcdFx0aWYgKCFkdG8uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdChkdG8gYXMgeyBzZXNzaW9uUmVzb3VyY2U/OiBVcmlDb21wb25lbnRzIH0pLnNlc3Npb25SZXNvdXJjZSA9IHNlc3Npb25SZXNvdXJjZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRDaGF0RGVidWdFdmVudChoYW5kbGUsIGR0byk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgd2hlbiB0aGUgdG9rZW4gaXMgY2FuY2VsbGVkXG5cdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdHRoaXMuX2NsZWFudXBQcm9ncmVzcyhrZXkpO1xuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5DaGF0RGVidWdFdmVudD4gPSB7XG5cdFx0XHRcdHJlcG9ydDogKHZhbHVlKSA9PiBlbWl0dGVyLmZpcmUodmFsdWUpXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fcHJvdmlkZXIucHJvdmlkZUNoYXREZWJ1Z0xvZyhzZXNzaW9uVXJpLCBwcm9ncmVzcywgdG9rZW4pO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdC5tYXAoZXZlbnQgPT4gdGhpcy5fc2VyaWFsaXplRXZlbnQoZXZlbnQpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2NsZWFudXBQcm9ncmVzcyhrZXkpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0XHQvLyBOb3RlOiBkbyBOT1QgZGlzcG9zZSBwcm9ncmVzcyBwaXBlbGluZSBoZXJlIC0ga2VlcCBpdCBhbGl2ZSBmb3Jcblx0XHQvLyBzdHJlYW1pbmcgZXZlbnRzIHZpYSBwcm9ncmVzcy5yZXBvcnQoKSBhZnRlciB0aGUgaW5pdGlhbCByZXR1cm4uXG5cdFx0Ly8gSXQgd2lsbCBiZSBjbGVhbmVkIHVwIHdoZW4gYSBuZXcgc2Vzc2lvbiBpcyByZXF1ZXN0ZWQsIHRoZSB0b2tlblxuXHRcdC8vIGlzIGNhbmNlbGxlZCwgb3IgdGhlIHByb3ZpZGVyIGlzIHVucmVnaXN0ZXJlZC5cblx0fVxuXG5cdHByaXZhdGUgX3NlcmlhbGl6ZUV2ZW50KGV2ZW50OiB2c2NvZGUuQ2hhdERlYnVnRXZlbnQpOiBJQ2hhdERlYnVnRXZlbnREdG8ge1xuXHRcdGNvbnN0IGJhc2UgPSB7XG5cdFx0XHRpZDogZXZlbnQuaWQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IChldmVudCBhcyB7IHNlc3Npb25SZXNvdXJjZT86IHZzY29kZS5VcmkgfSkuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y3JlYXRlZDogZXZlbnQuY3JlYXRlZC5nZXRUaW1lKCksXG5cdFx0XHRwYXJlbnRFdmVudElkOiBldmVudC5wYXJlbnRFdmVudElkLFxuXHRcdH07XG5cblx0XHQvLyBVc2UgdGhlIF9raW5kIGRpc2NyaW1pbmFudCBzZXQgYnkgYWxsIGV2ZW50IGNsYXNzIGNvbnN0cnVjdG9ycy5cblx0XHQvLyBUaGlzIHdvcmtzIGJvdGggZm9yIGRpcmVjdCBpbnN0YW5jZXMgYW5kIHdoZW4gZXh0ZW5zaW9ucyBidW5kbGVcblx0XHQvLyB0aGVpciBvd24gY29weSBvZiB0aGUgQVBJIHR5cGVzICh3aGVyZSBpbnN0YW5jZW9mIHdvdWxkIGZhaWwpLlxuXHRcdGNvbnN0IGtpbmQgPSAoZXZlbnQgYXMgeyBfa2luZD86IHN0cmluZyB9KS5fa2luZDtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgJ3Rvb2xDYWxsJzoge1xuXHRcdFx0XHRjb25zdCBlID0gZXZlbnQgYXMgdnNjb2RlLkNoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAndG9vbENhbGwnLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiBlLnRvb2xOYW1lLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGUudG9vbENhbGxJZCxcblx0XHRcdFx0XHRpbnB1dDogZS5pbnB1dCxcblx0XHRcdFx0XHRvdXRwdXQ6IGUub3V0cHV0LFxuXHRcdFx0XHRcdHJlc3VsdDogZS5yZXN1bHQgPT09IENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0LlN1Y2Nlc3MgPyAnc3VjY2Vzcydcblx0XHRcdFx0XHRcdDogZS5yZXN1bHQgPT09IENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0LkVycm9yID8gJ2Vycm9yJ1xuXHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRkdXJhdGlvbkluTWlsbGlzOiBlLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdtb2RlbFR1cm4nOiB7XG5cdFx0XHRcdGNvbnN0IGUgPSBldmVudCBhcyB2c2NvZGUuQ2hhdERlYnVnTW9kZWxUdXJuRXZlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAnbW9kZWxUdXJuJyxcblx0XHRcdFx0XHRtb2RlbDogZS5tb2RlbCxcblx0XHRcdFx0XHRyZXF1ZXN0TmFtZTogZS5yZXF1ZXN0TmFtZSxcblx0XHRcdFx0XHRpbnB1dFRva2VuczogZS5pbnB1dFRva2Vucyxcblx0XHRcdFx0XHRvdXRwdXRUb2tlbnM6IGUub3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRcdGNhY2hlZFRva2VuczogZS5jYWNoZWRUb2tlbnMsXG5cdFx0XHRcdFx0dG90YWxUb2tlbnM6IGUudG90YWxUb2tlbnMsXG5cdFx0XHRcdFx0Y29waWxvdFVzYWdlTmFub0FpdTogZS5jb3BpbG90VXNhZ2VOYW5vQWl1LFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGUuZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dlbmVyaWMnOiB7XG5cdFx0XHRcdGNvbnN0IGUgPSBldmVudCBhcyB2c2NvZGUuQ2hhdERlYnVnR2VuZXJpY0V2ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdG5hbWU6IGUubmFtZSxcblx0XHRcdFx0XHRkZXRhaWxzOiBlLmRldGFpbHMsXG5cdFx0XHRcdFx0bGV2ZWw6IGUubGV2ZWwsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGUuY2F0ZWdvcnksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzdWJhZ2VudEludm9jYXRpb24nOiB7XG5cdFx0XHRcdGNvbnN0IGUgPSBldmVudCBhcyB2c2NvZGUuQ2hhdERlYnVnU3ViYWdlbnRJbnZvY2F0aW9uRXZlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnRJbnZvY2F0aW9uJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6IGUuYWdlbnROYW1lLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBlLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHN0YXR1czogZS5zdGF0dXMgPT09IENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzLlJ1bm5pbmcgPyAncnVubmluZydcblx0XHRcdFx0XHRcdDogZS5zdGF0dXMgPT09IENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzLkNvbXBsZXRlZCA/ICdjb21wbGV0ZWQnXG5cdFx0XHRcdFx0XHRcdDogZS5zdGF0dXMgPT09IENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzLkZhaWxlZCA/ICdmYWlsZWQnXG5cdFx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogZS5kdXJhdGlvbkluTWlsbGlzLFxuXHRcdFx0XHRcdHRvb2xDYWxsQ291bnQ6IGUudG9vbENhbGxDb3VudCxcblx0XHRcdFx0XHRtb2RlbFR1cm5Db3VudDogZS5tb2RlbFR1cm5Db3VudCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzoge1xuXHRcdFx0XHRjb25zdCBlID0gZXZlbnQgYXMgdnNjb2RlLkNoYXREZWJ1Z1VzZXJNZXNzYWdlRXZlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRraW5kOiAndXNlck1lc3NhZ2UnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGUubWVzc2FnZSxcblx0XHRcdFx0XHRzZWN0aW9uczogZS5zZWN0aW9ucy5tYXAocyA9PiAoeyBuYW1lOiBzLm5hbWUsIGNvbnRlbnQ6IHMuY29udGVudCB9KSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdhZ2VudFJlc3BvbnNlJzoge1xuXHRcdFx0XHRjb25zdCBlID0gZXZlbnQgYXMgdnNjb2RlLkNoYXREZWJ1Z0FnZW50UmVzcG9uc2VFdmVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGtpbmQ6ICdhZ2VudFJlc3BvbnNlJyxcblx0XHRcdFx0XHRtZXNzYWdlOiBlLm1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IGUuc2VjdGlvbnMubWFwKHMgPT4gKHsgbmFtZTogcy5uYW1lLCBjb250ZW50OiBzLmNvbnRlbnQgfSkpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRjb25zdCBnZW5lcmljID0gZXZlbnQgYXMgdnNjb2RlLkNoYXREZWJ1Z0dlbmVyaWNFdmVudDtcblx0XHRcdFx0Y29uc3QgcmF3TmFtZSA9IGdlbmVyaWMubmFtZTtcblx0XHRcdFx0Y29uc3QgcmF3RGV0YWlscyA9IGdlbmVyaWMuZGV0YWlscztcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRcdGtpbmQ6ICdnZW5lcmljJyxcblx0XHRcdFx0XHRuYW1lOiB0eXBlb2YgcmF3TmFtZSA9PT0gJ3N0cmluZycgPyByYXdOYW1lIDogJycsXG5cdFx0XHRcdFx0ZGV0YWlsczogdHlwZW9mIHJhd0RldGFpbHMgPT09ICdzdHJpbmcnID8gcmF3RGV0YWlscyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRsZXZlbDogZ2VuZXJpYy5sZXZlbCA/PyAxLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBnZW5lcmljLmNhdGVnb3J5LFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jICRyZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQoX2hhbmRsZTogbnVtYmVyLCBldmVudElkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXREZWJ1Z1Jlc29sdmVkRXZlbnRDb250ZW50RHRvIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlcj8ucmVzb2x2ZUNoYXREZWJ1Z0xvZ0V2ZW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlQ2hhdERlYnVnTG9nRXZlbnQoZXZlbnRJZCwgdG9rZW4pO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFVzZSB0aGUgX2tpbmQgZGlzY3JpbWluYW50IHNldCBieSBhbGwgY29udGVudCBjbGFzcyBjb25zdHJ1Y3RvcnMuXG5cdFx0Y29uc3Qga2luZCA9IChyZXN1bHQgYXMgeyBfa2luZD86IHN0cmluZyB9KS5fa2luZDtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAndGV4dCcsIHZhbHVlOiAocmVzdWx0IGFzIHZzY29kZS5DaGF0RGVidWdFdmVudFRleHRDb250ZW50KS52YWx1ZSB9O1xuXHRcdFx0Y2FzZSAnbWVzc2FnZUNvbnRlbnQnOiB7XG5cdFx0XHRcdGNvbnN0IG1zZyA9IHJlc3VsdCBhcyB2c2NvZGUuQ2hhdERlYnVnRXZlbnRNZXNzYWdlQ29udGVudDtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRraW5kOiAnbWVzc2FnZScsXG5cdFx0XHRcdFx0dHlwZTogbXNnLnR5cGUgPT09IENoYXREZWJ1Z01lc3NhZ2VDb250ZW50VHlwZS5Vc2VyID8gJ3VzZXInIDogJ2FnZW50Jyxcblx0XHRcdFx0XHRtZXNzYWdlOiBtc2cubWVzc2FnZSxcblx0XHRcdFx0XHRzZWN0aW9uczogbXNnLnNlY3Rpb25zLm1hcChzID0+ICh7IG5hbWU6IHMubmFtZSwgY29udGVudDogcy5jb250ZW50IH0pKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VzZXJNZXNzYWdlJzoge1xuXHRcdFx0XHRjb25zdCBtc2cgPSByZXN1bHQgYXMgdnNjb2RlLkNoYXREZWJ1Z1VzZXJNZXNzYWdlRXZlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogJ21lc3NhZ2UnLFxuXHRcdFx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdFx0XHRtZXNzYWdlOiBtc2cubWVzc2FnZSxcblx0XHRcdFx0XHRzZWN0aW9uczogbXNnLnNlY3Rpb25zLm1hcChzID0+ICh7IG5hbWU6IHMubmFtZSwgY29udGVudDogcy5jb250ZW50IH0pKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2FnZW50UmVzcG9uc2UnOiB7XG5cdFx0XHRcdGNvbnN0IG1zZyA9IHJlc3VsdCBhcyB2c2NvZGUuQ2hhdERlYnVnQWdlbnRSZXNwb25zZUV2ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdtZXNzYWdlJyxcblx0XHRcdFx0XHR0eXBlOiAnYWdlbnQnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IG1zZy5tZXNzYWdlLFxuXHRcdFx0XHRcdHNlY3Rpb25zOiBtc2cuc2VjdGlvbnMubWFwKHMgPT4gKHsgbmFtZTogcy5uYW1lLCBjb250ZW50OiBzLmNvbnRlbnQgfSkpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndG9vbENhbGxDb250ZW50Jzoge1xuXHRcdFx0XHRjb25zdCB0YyA9IHJlc3VsdCBhcyB2c2NvZGUuQ2hhdERlYnVnRXZlbnRUb29sQ2FsbENvbnRlbnQ7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0a2luZDogJ3Rvb2xDYWxsJyxcblx0XHRcdFx0XHR0b29sTmFtZTogdGMudG9vbE5hbWUsXG5cdFx0XHRcdFx0cmVzdWx0OiB0Yy5yZXN1bHQgPT09IENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0LlN1Y2Nlc3MgPyAnc3VjY2Vzcydcblx0XHRcdFx0XHRcdDogdGMucmVzdWx0ID09PSBDaGF0RGVidWdUb29sQ2FsbFJlc3VsdC5FcnJvciA/ICdlcnJvcidcblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogdGMuZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0XHRpbnB1dDogdGMuaW5wdXQsXG5cdFx0XHRcdFx0b3V0cHV0OiB0Yy5vdXRwdXQsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdtb2RlbFR1cm5Db250ZW50Jzoge1xuXHRcdFx0XHRjb25zdCBtdCA9IHJlc3VsdCBhcyB2c2NvZGUuQ2hhdERlYnVnRXZlbnRNb2RlbFR1cm5Db250ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdtb2RlbFR1cm4nLFxuXHRcdFx0XHRcdHJlcXVlc3ROYW1lOiBtdC5yZXF1ZXN0TmFtZSxcblx0XHRcdFx0XHRtb2RlbDogbXQubW9kZWwsXG5cdFx0XHRcdFx0c3RhdHVzOiBtdC5zdGF0dXMsXG5cdFx0XHRcdFx0ZHVyYXRpb25Jbk1pbGxpczogbXQuZHVyYXRpb25Jbk1pbGxpcyxcblx0XHRcdFx0XHR0aW1lVG9GaXJzdFRva2VuSW5NaWxsaXM6IG10LnRpbWVUb0ZpcnN0VG9rZW5Jbk1pbGxpcyxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6IG10LnJlcXVlc3RJZCxcblx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogbXQubWF4SW5wdXRUb2tlbnMsXG5cdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiBtdC5tYXhPdXRwdXRUb2tlbnMsXG5cdFx0XHRcdFx0aW5wdXRUb2tlbnM6IG10LmlucHV0VG9rZW5zLFxuXHRcdFx0XHRcdG91dHB1dFRva2VuczogbXQub3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRcdGNhY2hlZFRva2VuczogbXQuY2FjaGVkVG9rZW5zLFxuXHRcdFx0XHRcdHRvdGFsVG9rZW5zOiBtdC50b3RhbFRva2Vucyxcblx0XHRcdFx0XHRyZXF1ZXN0T3B0aW9uczogbXQucmVxdWVzdE9wdGlvbnMsXG5cdFx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBtdC5lcnJvck1lc3NhZ2UsXG5cdFx0XHRcdFx0c2VjdGlvbnM6IG10LnNlY3Rpb25zPy5tYXAocyA9PiAoeyBuYW1lOiBzLm5hbWUsIGNvbnRlbnQ6IHMuY29udGVudCB9KSksXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdob29rQ29udGVudCc6IHtcblx0XHRcdFx0Y29uc3QgaGsgPSByZXN1bHQgYXMgdW5rbm93biBhcyBDaGF0RGVidWdFdmVudEhvb2tDb250ZW50O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICdob29rJyxcblx0XHRcdFx0XHRob29rVHlwZTogaGsuaG9va1R5cGUsXG5cdFx0XHRcdFx0Y29tbWFuZDogaGsuY29tbWFuZCxcblx0XHRcdFx0XHRyZXN1bHQ6IGhrLnJlc3VsdCA9PT0gQ2hhdERlYnVnSG9va1Jlc3VsdC5TdWNjZXNzID8gJ3N1Y2Nlc3MnXG5cdFx0XHRcdFx0XHQ6IGhrLnJlc3VsdCA9PT0gQ2hhdERlYnVnSG9va1Jlc3VsdC5FcnJvciA/ICdlcnJvcidcblx0XHRcdFx0XHRcdFx0OiBoay5yZXN1bHQgPT09IENoYXREZWJ1Z0hvb2tSZXN1bHQuTm9uQmxvY2tpbmdFcnJvciA/ICdub25CbG9ja2luZ0Vycm9yJ1xuXHRcdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGR1cmF0aW9uSW5NaWxsaXM6IGhrLmR1cmF0aW9uSW5NaWxsaXMsXG5cdFx0XHRcdFx0aW5wdXQ6IGhrLmlucHV0LFxuXHRcdFx0XHRcdG91dHB1dDogaGsub3V0cHV0LFxuXHRcdFx0XHRcdGV4aXRDb2RlOiBoay5leGl0Q29kZSxcblx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IGhrLmVycm9yTWVzc2FnZSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZGVzZXJpYWxpemVFdmVudChkdG86IElDaGF0RGVidWdFdmVudER0byk6IHZzY29kZS5DaGF0RGVidWdFdmVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IG5ldyBEYXRlKGR0by5jcmVhdGVkKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBkdG8uc2Vzc2lvblJlc291cmNlID8gVVJJLnJldml2ZShkdG8uc2Vzc2lvblJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKGR0by5raW5kKSB7XG5cdFx0XHRjYXNlICd0b29sQ2FsbCc6IHtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IENoYXREZWJ1Z1Rvb2xDYWxsRXZlbnQoZHRvLnRvb2xOYW1lLCBjcmVhdGVkKTtcblx0XHRcdFx0ZXZ0LmlkID0gZHRvLmlkO1xuXHRcdFx0XHRldnQuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRldnQucGFyZW50RXZlbnRJZCA9IGR0by5wYXJlbnRFdmVudElkO1xuXHRcdFx0XHRldnQudG9vbENhbGxJZCA9IGR0by50b29sQ2FsbElkO1xuXHRcdFx0XHRldnQuaW5wdXQgPSBkdG8uaW5wdXQ7XG5cdFx0XHRcdGV2dC5vdXRwdXQgPSBkdG8ub3V0cHV0O1xuXHRcdFx0XHRldnQucmVzdWx0ID0gZHRvLnJlc3VsdCA9PT0gJ3N1Y2Nlc3MnID8gQ2hhdERlYnVnVG9vbENhbGxSZXN1bHQuU3VjY2Vzc1xuXHRcdFx0XHRcdDogZHRvLnJlc3VsdCA9PT0gJ2Vycm9yJyA/IENoYXREZWJ1Z1Rvb2xDYWxsUmVzdWx0LkVycm9yXG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0ZXZ0LmR1cmF0aW9uSW5NaWxsaXMgPSBkdG8uZHVyYXRpb25Jbk1pbGxpcztcblx0XHRcdFx0cmV0dXJuIGV2dDtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ21vZGVsVHVybic6IHtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IENoYXREZWJ1Z01vZGVsVHVybkV2ZW50KGNyZWF0ZWQpO1xuXHRcdFx0XHRldnQuaWQgPSBkdG8uaWQ7XG5cdFx0XHRcdGV2dC5zZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdGV2dC5wYXJlbnRFdmVudElkID0gZHRvLnBhcmVudEV2ZW50SWQ7XG5cdFx0XHRcdGV2dC5tb2RlbCA9IGR0by5tb2RlbDtcblx0XHRcdFx0ZXZ0LnJlcXVlc3ROYW1lID0gZHRvLnJlcXVlc3ROYW1lO1xuXHRcdFx0XHRldnQuaW5wdXRUb2tlbnMgPSBkdG8uaW5wdXRUb2tlbnM7XG5cdFx0XHRcdGV2dC5vdXRwdXRUb2tlbnMgPSBkdG8ub3V0cHV0VG9rZW5zO1xuXHRcdFx0XHRldnQuY2FjaGVkVG9rZW5zID0gZHRvLmNhY2hlZFRva2Vucztcblx0XHRcdFx0ZXZ0LnRvdGFsVG9rZW5zID0gZHRvLnRvdGFsVG9rZW5zO1xuXHRcdFx0XHRldnQuY29waWxvdFVzYWdlTmFub0FpdSA9IGR0by5jb3BpbG90VXNhZ2VOYW5vQWl1O1xuXHRcdFx0XHRldnQuZHVyYXRpb25Jbk1pbGxpcyA9IGR0by5kdXJhdGlvbkluTWlsbGlzO1xuXHRcdFx0XHRyZXR1cm4gZXZ0O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZ2VuZXJpYyc6IHtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IENoYXREZWJ1Z0dlbmVyaWNFdmVudChkdG8ubmFtZSwgZHRvLmxldmVsIGFzIENoYXREZWJ1Z0xvZ0xldmVsLCBjcmVhdGVkKTtcblx0XHRcdFx0ZXZ0LmlkID0gZHRvLmlkO1xuXHRcdFx0XHRldnQuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRldnQucGFyZW50RXZlbnRJZCA9IGR0by5wYXJlbnRFdmVudElkO1xuXHRcdFx0XHRldnQuZGV0YWlscyA9IGR0by5kZXRhaWxzO1xuXHRcdFx0XHRldnQuY2F0ZWdvcnkgPSBkdG8uY2F0ZWdvcnk7XG5cdFx0XHRcdHJldHVybiBldnQ7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzdWJhZ2VudEludm9jYXRpb24nOiB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IG5ldyBDaGF0RGVidWdTdWJhZ2VudEludm9jYXRpb25FdmVudChkdG8uYWdlbnROYW1lLCBjcmVhdGVkKTtcblx0XHRcdFx0ZXZ0LmlkID0gZHRvLmlkO1xuXHRcdFx0XHRldnQuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRldnQucGFyZW50RXZlbnRJZCA9IGR0by5wYXJlbnRFdmVudElkO1xuXHRcdFx0XHRldnQuZGVzY3JpcHRpb24gPSBkdG8uZGVzY3JpcHRpb247XG5cdFx0XHRcdGV2dC5zdGF0dXMgPSBkdG8uc3RhdHVzID09PSAncnVubmluZycgPyBDaGF0RGVidWdTdWJhZ2VudFN0YXR1cy5SdW5uaW5nXG5cdFx0XHRcdFx0OiBkdG8uc3RhdHVzID09PSAnY29tcGxldGVkJyA/IENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzLkNvbXBsZXRlZFxuXHRcdFx0XHRcdFx0OiBkdG8uc3RhdHVzID09PSAnZmFpbGVkJyA/IENoYXREZWJ1Z1N1YmFnZW50U3RhdHVzLkZhaWxlZFxuXHRcdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0ZXZ0LmR1cmF0aW9uSW5NaWxsaXMgPSBkdG8uZHVyYXRpb25Jbk1pbGxpcztcblx0XHRcdFx0ZXZ0LnRvb2xDYWxsQ291bnQgPSBkdG8udG9vbENhbGxDb3VudDtcblx0XHRcdFx0ZXZ0Lm1vZGVsVHVybkNvdW50ID0gZHRvLm1vZGVsVHVybkNvdW50O1xuXHRcdFx0XHRyZXR1cm4gZXZ0O1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndXNlck1lc3NhZ2UnOiB7XG5cdFx0XHRcdGNvbnN0IGV2dCA9IG5ldyBDaGF0RGVidWdVc2VyTWVzc2FnZUV2ZW50KGR0by5tZXNzYWdlLCBjcmVhdGVkKTtcblx0XHRcdFx0ZXZ0LmlkID0gZHRvLmlkO1xuXHRcdFx0XHRldnQuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRldnQucGFyZW50RXZlbnRJZCA9IGR0by5wYXJlbnRFdmVudElkO1xuXHRcdFx0XHRldnQuc2VjdGlvbnMgPSBkdG8uc2VjdGlvbnMubWFwKHMgPT4gbmV3IENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uKHMubmFtZSwgcy5jb250ZW50KSk7XG5cdFx0XHRcdHJldHVybiBldnQ7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdhZ2VudFJlc3BvbnNlJzoge1xuXHRcdFx0XHRjb25zdCBldnQgPSBuZXcgQ2hhdERlYnVnQWdlbnRSZXNwb25zZUV2ZW50KGR0by5tZXNzYWdlLCBjcmVhdGVkKTtcblx0XHRcdFx0ZXZ0LmlkID0gZHRvLmlkO1xuXHRcdFx0XHRldnQuc2Vzc2lvblJlc291cmNlID0gc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRldnQucGFyZW50RXZlbnRJZCA9IGR0by5wYXJlbnRFdmVudElkO1xuXHRcdFx0XHRldnQuc2VjdGlvbnMgPSBkdG8uc2VjdGlvbnMubWFwKHMgPT4gbmV3IENoYXREZWJ1Z01lc3NhZ2VTZWN0aW9uKHMubmFtZSwgcy5jb250ZW50KSk7XG5cdFx0XHRcdHJldHVybiBldnQ7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdCRvbkNvcmVEZWJ1Z0V2ZW50KGR0bzogSUNoYXREZWJ1Z0V2ZW50RHRvKTogdm9pZCB7XG5cdFx0Y29uc3QgZXZlbnQgPSB0aGlzLl9kZXNlcmlhbGl6ZUV2ZW50KGR0byk7XG5cdFx0aWYgKGV2ZW50KSB7XG5cdFx0XHR0aGlzLl9vbkRpZEFkZENvcmVFdmVudC5maXJlKGV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyAkZXhwb3J0Q2hhdERlYnVnTG9nKF9oYW5kbGU6IG51bWJlciwgc2Vzc2lvblJlc291cmNlOiBVcmlDb21wb25lbnRzLCBjb3JlRXZlbnREdG9zOiBJQ2hhdERlYnVnRXZlbnREdG9bXSwgc2Vzc2lvblRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyPy5wcm92aWRlQ2hhdERlYnVnTG9nRXhwb3J0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnJldml2ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvcmVFdmVudHMgPSBjb3JlRXZlbnREdG9zLm1hcChkdG8gPT4gdGhpcy5fZGVzZXJpYWxpemVFdmVudChkdG8pKS5maWx0ZXIoKGUpOiBlIGlzIHZzY29kZS5DaGF0RGVidWdFdmVudCA9PiBlICE9PSB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IG9wdGlvbnM6IHZzY29kZS5DaGF0RGVidWdMb2dFeHBvcnRPcHRpb25zID0geyBjb3JlRXZlbnRzLCBzZXNzaW9uVGl0bGUgfTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlQ2hhdERlYnVnTG9nRXhwb3J0KHNlc3Npb25VcmksIG9wdGlvbnMsIHRva2VuKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIFZTQnVmZmVyLndyYXAocmVzdWx0KTtcblx0fVxuXG5cdGFzeW5jICRpbXBvcnRDaGF0RGVidWdMb2coX2hhbmRsZTogbnVtYmVyLCBkYXRhOiBWU0J1ZmZlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IHVyaTogVXJpQ29tcG9uZW50czsgc2Vzc2lvblRpdGxlPzogc3RyaW5nIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyPy5yZXNvbHZlQ2hhdERlYnVnTG9nSW1wb3J0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5yZXNvbHZlQ2hhdERlYnVnTG9nSW1wb3J0KGRhdGEuYnVmZmVyLCB0b2tlbik7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHVyaTogcmVzdWx0LnVyaSwgc2Vzc2lvblRpdGxlOiByZXN1bHQuc2Vzc2lvblRpdGxlIH07XG5cdH1cblxuXHRhc3luYyAkZ2V0QXZhaWxhYmxlRGVidWdTZXNzaW9uUmVzb3VyY2VzKF9oYW5kbGU6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IHVyaTogVXJpQ29tcG9uZW50czsgdGl0bGU/OiBzdHJpbmcgfVtdPiB7XG5cdFx0aWYgKCF0aGlzLl9wcm92aWRlcj8ucHJvdmlkZUF2YWlsYWJsZURlYnVnU2Vzc2lvblJlc291cmNlcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm92aWRlci5wcm92aWRlQXZhaWxhYmxlRGVidWdTZXNzaW9uUmVzb3VyY2VzKHRva2VuKTtcblx0XHRyZXR1cm4gcmVzdWx0ID8/IFtdO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHN0b3JlIG9mIHRoaXMuX2FjdGl2ZVByb2dyZXNzLnZhbHVlcygpKSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVByb2dyZXNzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLFdBQTBCO0FBQ25DLFNBQXVGLG1CQUE2QztBQUNwSSxTQUFTLHVCQUF1QixxQkFBd0MsNkJBQTZCLHlCQUF5Qix5QkFBeUIsa0NBQWtDLHlCQUF5Qix3QkFBd0IseUJBQXlCLDJCQUEyQixtQ0FBOEQ7QUFDNVYsU0FBUywwQkFBMEI7QUFFNUIsSUFBTSxtQkFBTixjQUErQixXQUE0QztBQUFBLEVBZWpGLFlBQ3FCLFlBQ25CO0FBQ0QsVUFBTTtBQWJQLFNBQVEsY0FBc0I7QUFFOUI7QUFBQSxTQUFpQixrQkFBa0Isb0JBQUksSUFBNkI7QUFFcEUsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQStCO0FBQUEsTUFDdkYsd0JBQXdCLE1BQU0sS0FBSyxPQUFPLDRCQUE0QjtBQUFBLE1BQ3RFLHlCQUF5QixNQUFNLEtBQUssT0FBTyxnQ0FBZ0M7QUFBQSxJQUM1RSxDQUFDLENBQUM7QUFDRixTQUFTLG9CQUFvQixLQUFLLG1CQUFtQjtBQU1wRCxTQUFLLFNBQVMsV0FBVyxTQUFTLFlBQVksbUJBQW1CO0FBQUEsRUFDbEU7QUFBQSxFQUVRLGFBQWEsUUFBZ0IsaUJBQXdDO0FBQzVFLFdBQU8sR0FBRyxNQUFNLElBQUksSUFBSSxPQUFPLGVBQWUsRUFBRSxTQUFTLENBQUM7QUFBQSxFQUMzRDtBQUFBLEVBRVEsaUJBQWlCLEtBQW1CO0FBQzNDLFVBQU0sUUFBUSxLQUFLLGdCQUFnQixJQUFJLEdBQUc7QUFDMUMsUUFBSSxPQUFPO0FBQ1YsWUFBTSxRQUFRO0FBQ2QsV0FBSyxnQkFBZ0IsT0FBTyxHQUFHO0FBQUEsSUFDaEM7QUFBQSxFQUNEO0FBQUEsRUFFQSw2QkFBNkIsVUFBMEQ7QUFDdEYsUUFBSSxLQUFLLFdBQVc7QUFDbkIsWUFBTSxJQUFJLE1BQU0sK0NBQStDO0FBQUEsSUFDaEU7QUFDQSxTQUFLLFlBQVk7QUFDakIsVUFBTSxTQUFTLEtBQUs7QUFDcEIsU0FBSyxPQUFPLDhCQUE4QixNQUFNO0FBRWhELFdBQU8sYUFBYSxNQUFNO0FBQ3pCLFdBQUssWUFBWTtBQUVqQixpQkFBVyxDQUFDLEtBQUssS0FBSyxLQUFLLEtBQUssaUJBQWlCO0FBQ2hELFlBQUksSUFBSSxXQUFXLEdBQUcsTUFBTSxHQUFHLEdBQUc7QUFDakMsZ0JBQU0sUUFBUTtBQUNkLGVBQUssZ0JBQWdCLE9BQU8sR0FBRztBQUFBLFFBQ2hDO0FBQUEsTUFDRDtBQUNBLFdBQUssT0FBTyxnQ0FBZ0MsTUFBTTtBQUFBLElBQ25ELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixRQUFnQixpQkFBZ0MsT0FBcUU7QUFDL0ksUUFBSSxDQUFDLEtBQUssV0FBVztBQUNwQixhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sTUFBTSxLQUFLLGFBQWEsUUFBUSxlQUFlO0FBQ3JELFNBQUssaUJBQWlCLEdBQUc7QUFFekIsVUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBQ2xDLFNBQUssZ0JBQWdCLElBQUksS0FBSyxLQUFLO0FBRW5DLFVBQU0sVUFBVSxNQUFNLElBQUksSUFBSSxRQUErQixDQUFDO0FBRzlELFVBQU0sSUFBSSxRQUFRLE1BQU0sV0FBUztBQUNoQyxZQUFNLE1BQU0sS0FBSyxnQkFBZ0IsS0FBSztBQUN0QyxVQUFJLENBQUMsSUFBSSxpQkFBaUI7QUFDekIsUUFBQyxJQUE0QyxrQkFBa0I7QUFBQSxNQUNoRTtBQUNBLFdBQUssT0FBTyxzQkFBc0IsUUFBUSxHQUFHO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBR0YsVUFBTSxJQUFJLE1BQU0sd0JBQXdCLE1BQU07QUFDN0MsV0FBSyxpQkFBaUIsR0FBRztBQUFBLElBQzFCLENBQUMsQ0FBQztBQUVGLFFBQUk7QUFDSCxZQUFNLFdBQW1EO0FBQUEsUUFDeEQsUUFBUSxDQUFDLFVBQVUsUUFBUSxLQUFLLEtBQUs7QUFBQSxNQUN0QztBQUVBLFlBQU0sYUFBYSxJQUFJLE9BQU8sZUFBZTtBQUM3QyxZQUFNLFNBQVMsTUFBTSxLQUFLLFVBQVUsb0JBQW9CLFlBQVksVUFBVSxLQUFLO0FBQ25GLFVBQUksQ0FBQyxRQUFRO0FBQ1osZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPLE9BQU8sSUFBSSxXQUFTLEtBQUssZ0JBQWdCLEtBQUssQ0FBQztBQUFBLElBQ3ZELFNBQVMsS0FBSztBQUNiLFdBQUssaUJBQWlCLEdBQUc7QUFDekIsWUFBTTtBQUFBLElBQ1A7QUFBQSxFQUtEO0FBQUEsRUFFUSxnQkFBZ0IsT0FBa0Q7QUFDekUsVUFBTSxPQUFPO0FBQUEsTUFDWixJQUFJLE1BQU07QUFBQSxNQUNWLGlCQUFrQixNQUEyQztBQUFBLE1BQzdELFNBQVMsTUFBTSxRQUFRLFFBQVE7QUFBQSxNQUMvQixlQUFlLE1BQU07QUFBQSxJQUN0QjtBQUtBLFVBQU0sT0FBUSxNQUE2QjtBQUMzQyxZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUssWUFBWTtBQUNoQixjQUFNLElBQUk7QUFDVixlQUFPO0FBQUEsVUFDTixHQUFHO0FBQUEsVUFDSCxNQUFNO0FBQUEsVUFDTixVQUFVLEVBQUU7QUFBQSxVQUNaLFlBQVksRUFBRTtBQUFBLFVBQ2QsT0FBTyxFQUFFO0FBQUEsVUFDVCxRQUFRLEVBQUU7QUFBQSxVQUNWLFFBQVEsRUFBRSxXQUFXLHdCQUF3QixVQUFVLFlBQ3BELEVBQUUsV0FBVyx3QkFBd0IsUUFBUSxVQUM1QztBQUFBLFVBQ0osa0JBQWtCLEVBQUU7QUFBQSxRQUNyQjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssYUFBYTtBQUNqQixjQUFNLElBQUk7QUFDVixlQUFPO0FBQUEsVUFDTixHQUFHO0FBQUEsVUFDSCxNQUFNO0FBQUEsVUFDTixPQUFPLEVBQUU7QUFBQSxVQUNULGFBQWEsRUFBRTtBQUFBLFVBQ2YsYUFBYSxFQUFFO0FBQUEsVUFDZixjQUFjLEVBQUU7QUFBQSxVQUNoQixjQUFjLEVBQUU7QUFBQSxVQUNoQixhQUFhLEVBQUU7QUFBQSxVQUNmLHFCQUFxQixFQUFFO0FBQUEsVUFDdkIsa0JBQWtCLEVBQUU7QUFBQSxRQUNyQjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssV0FBVztBQUNmLGNBQU0sSUFBSTtBQUNWLGVBQU87QUFBQSxVQUNOLEdBQUc7QUFBQSxVQUNILE1BQU07QUFBQSxVQUNOLE1BQU0sRUFBRTtBQUFBLFVBQ1IsU0FBUyxFQUFFO0FBQUEsVUFDWCxPQUFPLEVBQUU7QUFBQSxVQUNULFVBQVUsRUFBRTtBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLHNCQUFzQjtBQUMxQixjQUFNLElBQUk7QUFDVixlQUFPO0FBQUEsVUFDTixHQUFHO0FBQUEsVUFDSCxNQUFNO0FBQUEsVUFDTixXQUFXLEVBQUU7QUFBQSxVQUNiLGFBQWEsRUFBRTtBQUFBLFVBQ2YsUUFBUSxFQUFFLFdBQVcsd0JBQXdCLFVBQVUsWUFDcEQsRUFBRSxXQUFXLHdCQUF3QixZQUFZLGNBQ2hELEVBQUUsV0FBVyx3QkFBd0IsU0FBUyxXQUM3QztBQUFBLFVBQ0wsa0JBQWtCLEVBQUU7QUFBQSxVQUNwQixlQUFlLEVBQUU7QUFBQSxVQUNqQixnQkFBZ0IsRUFBRTtBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxlQUFlO0FBQ25CLGNBQU0sSUFBSTtBQUNWLGVBQU87QUFBQSxVQUNOLEdBQUc7QUFBQSxVQUNILE1BQU07QUFBQSxVQUNOLFNBQVMsRUFBRTtBQUFBLFVBQ1gsVUFBVSxFQUFFLFNBQVMsSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sU0FBUyxFQUFFLFFBQVEsRUFBRTtBQUFBLFFBQ3JFO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxpQkFBaUI7QUFDckIsY0FBTSxJQUFJO0FBQ1YsZUFBTztBQUFBLFVBQ04sR0FBRztBQUFBLFVBQ0gsTUFBTTtBQUFBLFVBQ04sU0FBUyxFQUFFO0FBQUEsVUFDWCxVQUFVLEVBQUUsU0FBUyxJQUFJLFFBQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxTQUFTLEVBQUUsUUFBUSxFQUFFO0FBQUEsUUFDckU7QUFBQSxNQUNEO0FBQUEsTUFDQSxTQUFTO0FBQ1IsY0FBTSxVQUFVO0FBQ2hCLGNBQU0sVUFBVSxRQUFRO0FBQ3hCLGNBQU0sYUFBYSxRQUFRO0FBQzNCLGVBQU87QUFBQSxVQUNOLEdBQUc7QUFBQSxVQUNILE1BQU07QUFBQSxVQUNOLE1BQU0sT0FBTyxZQUFZLFdBQVcsVUFBVTtBQUFBLFVBQzlDLFNBQVMsT0FBTyxlQUFlLFdBQVcsYUFBYTtBQUFBLFVBQ3ZELE9BQU8sUUFBUSxTQUFTO0FBQUEsVUFDeEIsVUFBVSxRQUFRO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sMEJBQTBCLFNBQWlCLFNBQWlCLE9BQWtGO0FBQ25KLFFBQUksQ0FBQyxLQUFLLFdBQVcsMEJBQTBCO0FBQzlDLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxTQUFTLE1BQU0sS0FBSyxVQUFVLHlCQUF5QixTQUFTLEtBQUs7QUFDM0UsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sT0FBUSxPQUE4QjtBQUM1QyxZQUFRLE1BQU07QUFBQSxNQUNiLEtBQUs7QUFDSixlQUFPLEVBQUUsTUFBTSxRQUFRLE9BQVEsT0FBNEMsTUFBTTtBQUFBLE1BQ2xGLEtBQUssa0JBQWtCO0FBQ3RCLGNBQU0sTUFBTTtBQUNaLGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLE1BQU0sSUFBSSxTQUFTLDRCQUE0QixPQUFPLFNBQVM7QUFBQSxVQUMvRCxTQUFTLElBQUk7QUFBQSxVQUNiLFVBQVUsSUFBSSxTQUFTLElBQUksUUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLFNBQVMsRUFBRSxRQUFRLEVBQUU7QUFBQSxRQUN2RTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssZUFBZTtBQUNuQixjQUFNLE1BQU07QUFDWixlQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixTQUFTLElBQUk7QUFBQSxVQUNiLFVBQVUsSUFBSSxTQUFTLElBQUksUUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLFNBQVMsRUFBRSxRQUFRLEVBQUU7QUFBQSxRQUN2RTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssaUJBQWlCO0FBQ3JCLGNBQU0sTUFBTTtBQUNaLGVBQU87QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLE1BQU07QUFBQSxVQUNOLFNBQVMsSUFBSTtBQUFBLFVBQ2IsVUFBVSxJQUFJLFNBQVMsSUFBSSxRQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sU0FBUyxFQUFFLFFBQVEsRUFBRTtBQUFBLFFBQ3ZFO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxtQkFBbUI7QUFDdkIsY0FBTSxLQUFLO0FBQ1gsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sVUFBVSxHQUFHO0FBQUEsVUFDYixRQUFRLEdBQUcsV0FBVyx3QkFBd0IsVUFBVSxZQUNyRCxHQUFHLFdBQVcsd0JBQXdCLFFBQVEsVUFDN0M7QUFBQSxVQUNKLGtCQUFrQixHQUFHO0FBQUEsVUFDckIsT0FBTyxHQUFHO0FBQUEsVUFDVixRQUFRLEdBQUc7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxvQkFBb0I7QUFDeEIsY0FBTSxLQUFLO0FBQ1gsZUFBTztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sYUFBYSxHQUFHO0FBQUEsVUFDaEIsT0FBTyxHQUFHO0FBQUEsVUFDVixRQUFRLEdBQUc7QUFBQSxVQUNYLGtCQUFrQixHQUFHO0FBQUEsVUFDckIsMEJBQTBCLEdBQUc7QUFBQSxVQUM3QixXQUFXLEdBQUc7QUFBQSxVQUNkLGdCQUFnQixHQUFHO0FBQUEsVUFDbkIsaUJBQWlCLEdBQUc7QUFBQSxVQUNwQixhQUFhLEdBQUc7QUFBQSxVQUNoQixjQUFjLEdBQUc7QUFBQSxVQUNqQixjQUFjLEdBQUc7QUFBQSxVQUNqQixhQUFhLEdBQUc7QUFBQSxVQUNoQixnQkFBZ0IsR0FBRztBQUFBLFVBQ25CLGNBQWMsR0FBRztBQUFBLFVBQ2pCLFVBQVUsR0FBRyxVQUFVLElBQUksUUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLFNBQVMsRUFBRSxRQUFRLEVBQUU7QUFBQSxRQUN2RTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssZUFBZTtBQUNuQixjQUFNLEtBQUs7QUFDWCxlQUFPO0FBQUEsVUFDTixNQUFNO0FBQUEsVUFDTixVQUFVLEdBQUc7QUFBQSxVQUNiLFNBQVMsR0FBRztBQUFBLFVBQ1osUUFBUSxHQUFHLFdBQVcsb0JBQW9CLFVBQVUsWUFDakQsR0FBRyxXQUFXLG9CQUFvQixRQUFRLFVBQ3pDLEdBQUcsV0FBVyxvQkFBb0IsbUJBQW1CLHFCQUNwRDtBQUFBLFVBQ0wsa0JBQWtCLEdBQUc7QUFBQSxVQUNyQixPQUFPLEdBQUc7QUFBQSxVQUNWLFFBQVEsR0FBRztBQUFBLFVBQ1gsVUFBVSxHQUFHO0FBQUEsVUFDYixjQUFjLEdBQUc7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFBQSxNQUNBO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsS0FBNEQ7QUFDckYsVUFBTSxVQUFVLElBQUksS0FBSyxJQUFJLE9BQU87QUFDcEMsVUFBTSxrQkFBa0IsSUFBSSxrQkFBa0IsSUFBSSxPQUFPLElBQUksZUFBZSxJQUFJO0FBQ2hGLFlBQVEsSUFBSSxNQUFNO0FBQUEsTUFDakIsS0FBSyxZQUFZO0FBQ2hCLGNBQU0sTUFBTSxJQUFJLHVCQUF1QixJQUFJLFVBQVUsT0FBTztBQUM1RCxZQUFJLEtBQUssSUFBSTtBQUNiLFlBQUksa0JBQWtCO0FBQ3RCLFlBQUksZ0JBQWdCLElBQUk7QUFDeEIsWUFBSSxhQUFhLElBQUk7QUFDckIsWUFBSSxRQUFRLElBQUk7QUFDaEIsWUFBSSxTQUFTLElBQUk7QUFDakIsWUFBSSxTQUFTLElBQUksV0FBVyxZQUFZLHdCQUF3QixVQUM3RCxJQUFJLFdBQVcsVUFBVSx3QkFBd0IsUUFDaEQ7QUFDSixZQUFJLG1CQUFtQixJQUFJO0FBQzNCLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxLQUFLLGFBQWE7QUFDakIsY0FBTSxNQUFNLElBQUksd0JBQXdCLE9BQU87QUFDL0MsWUFBSSxLQUFLLElBQUk7QUFDYixZQUFJLGtCQUFrQjtBQUN0QixZQUFJLGdCQUFnQixJQUFJO0FBQ3hCLFlBQUksUUFBUSxJQUFJO0FBQ2hCLFlBQUksY0FBYyxJQUFJO0FBQ3RCLFlBQUksY0FBYyxJQUFJO0FBQ3RCLFlBQUksZUFBZSxJQUFJO0FBQ3ZCLFlBQUksZUFBZSxJQUFJO0FBQ3ZCLFlBQUksY0FBYyxJQUFJO0FBQ3RCLFlBQUksc0JBQXNCLElBQUk7QUFDOUIsWUFBSSxtQkFBbUIsSUFBSTtBQUMzQixlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsS0FBSyxXQUFXO0FBQ2YsY0FBTSxNQUFNLElBQUksc0JBQXNCLElBQUksTUFBTSxJQUFJLE9BQTRCLE9BQU87QUFDdkYsWUFBSSxLQUFLLElBQUk7QUFDYixZQUFJLGtCQUFrQjtBQUN0QixZQUFJLGdCQUFnQixJQUFJO0FBQ3hCLFlBQUksVUFBVSxJQUFJO0FBQ2xCLFlBQUksV0FBVyxJQUFJO0FBQ25CLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxLQUFLLHNCQUFzQjtBQUMxQixjQUFNLE1BQU0sSUFBSSxpQ0FBaUMsSUFBSSxXQUFXLE9BQU87QUFDdkUsWUFBSSxLQUFLLElBQUk7QUFDYixZQUFJLGtCQUFrQjtBQUN0QixZQUFJLGdCQUFnQixJQUFJO0FBQ3hCLFlBQUksY0FBYyxJQUFJO0FBQ3RCLFlBQUksU0FBUyxJQUFJLFdBQVcsWUFBWSx3QkFBd0IsVUFDN0QsSUFBSSxXQUFXLGNBQWMsd0JBQXdCLFlBQ3BELElBQUksV0FBVyxXQUFXLHdCQUF3QixTQUNqRDtBQUNMLFlBQUksbUJBQW1CLElBQUk7QUFDM0IsWUFBSSxnQkFBZ0IsSUFBSTtBQUN4QixZQUFJLGlCQUFpQixJQUFJO0FBQ3pCLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxLQUFLLGVBQWU7QUFDbkIsY0FBTSxNQUFNLElBQUksMEJBQTBCLElBQUksU0FBUyxPQUFPO0FBQzlELFlBQUksS0FBSyxJQUFJO0FBQ2IsWUFBSSxrQkFBa0I7QUFDdEIsWUFBSSxnQkFBZ0IsSUFBSTtBQUN4QixZQUFJLFdBQVcsSUFBSSxTQUFTLElBQUksT0FBSyxJQUFJLHdCQUF3QixFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUM7QUFDbkYsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLEtBQUssaUJBQWlCO0FBQ3JCLGNBQU0sTUFBTSxJQUFJLDRCQUE0QixJQUFJLFNBQVMsT0FBTztBQUNoRSxZQUFJLEtBQUssSUFBSTtBQUNiLFlBQUksa0JBQWtCO0FBQ3RCLFlBQUksZ0JBQWdCLElBQUk7QUFDeEIsWUFBSSxXQUFXLElBQUksU0FBUyxJQUFJLE9BQUssSUFBSSx3QkFBd0IsRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDO0FBQ25GLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQTtBQUNDLGVBQU87QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUFBLEVBRUEsa0JBQWtCLEtBQStCO0FBQ2hELFVBQU0sUUFBUSxLQUFLLGtCQUFrQixHQUFHO0FBQ3hDLFFBQUksT0FBTztBQUNWLFdBQUssbUJBQW1CLEtBQUssS0FBSztBQUFBLElBQ25DO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxvQkFBb0IsU0FBaUIsaUJBQWdDLGVBQXFDLGNBQWtDLE9BQXlEO0FBQzFNLFFBQUksQ0FBQyxLQUFLLFdBQVcsMkJBQTJCO0FBQy9DLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxhQUFhLElBQUksT0FBTyxlQUFlO0FBQzdDLFVBQU0sYUFBYSxjQUFjLElBQUksU0FBTyxLQUFLLGtCQUFrQixHQUFHLENBQUMsRUFBRSxPQUFPLENBQUMsTUFBa0MsTUFBTSxNQUFTO0FBQ2xJLFVBQU0sVUFBNEMsRUFBRSxZQUFZLGFBQWE7QUFDN0UsVUFBTSxTQUFTLE1BQU0sS0FBSyxVQUFVLDBCQUEwQixZQUFZLFNBQVMsS0FBSztBQUN4RixRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxTQUFTLEtBQUssTUFBTTtBQUFBLEVBQzVCO0FBQUEsRUFFQSxNQUFNLG9CQUFvQixTQUFpQixNQUFnQixPQUE4RjtBQUN4SixRQUFJLENBQUMsS0FBSyxXQUFXLDJCQUEyQjtBQUMvQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sU0FBUyxNQUFNLEtBQUssVUFBVSwwQkFBMEIsS0FBSyxRQUFRLEtBQUs7QUFDaEYsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sRUFBRSxLQUFLLE9BQU8sS0FBSyxjQUFjLE9BQU8sYUFBYTtBQUFBLEVBQzdEO0FBQUEsRUFFQSxNQUFNLG1DQUFtQyxTQUFpQixPQUE2RTtBQUN0SSxRQUFJLENBQUMsS0FBSyxXQUFXLHVDQUF1QztBQUMzRCxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsVUFBTSxTQUFTLE1BQU0sS0FBSyxVQUFVLHNDQUFzQyxLQUFLO0FBQy9FLFdBQU8sVUFBVSxDQUFDO0FBQUEsRUFDbkI7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLGVBQVcsU0FBUyxLQUFLLGdCQUFnQixPQUFPLEdBQUc7QUFDbEQsWUFBTSxRQUFRO0FBQUEsSUFDZjtBQUNBLFNBQUssZ0JBQWdCLE1BQU07QUFDM0IsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBL2FhLG1CQUFOO0FBQUEsRUFnQko7QUFBQSxHQWhCVTsiLAogICJuYW1lcyI6IFtdCn0K
