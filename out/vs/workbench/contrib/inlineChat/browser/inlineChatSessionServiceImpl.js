var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _ctxHasProvider, _ctxHasNotebookProvider, _ctxPossible, _store, _data;
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, dispose, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { autorun, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { isCodeEditor, isCompositeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IChatAgentService } from "../../chat/common/participants/chatAgents.js";
import { ModifiedFileEntryState } from "../../chat/common/editing/chatEditingService.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../chat/common/tools/languageModelToolsService.js";
import { CTX_INLINE_CHAT_HAS_AGENT, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT, CTX_INLINE_CHAT_POSSIBLE, InlineChatConfigKeys } from "../common/inlineChat.js";
import { IInlineChatSessionService } from "./inlineChatSessionService.js";
const _InlineChatError = class _InlineChatError extends Error {
  constructor(message) {
    super(message);
    this.name = _InlineChatError.code;
  }
};
_InlineChatError.code = "InlineChatError";
let InlineChatError = _InlineChatError;
let InlineChatSessionServiceImpl = class {
  constructor(chatService, chatAgentService) {
    this.#store = new DisposableStore();
    this.#sessions = new ResourceMap();
    this.#onWillStartSession = this.#store.add(new Emitter());
    this.onWillStartSession = this.#onWillStartSession.event;
    this.#onDidChangeSessions = this.#store.add(new Emitter());
    this.onDidChangeSessions = this.#onDidChangeSessions.event;
    this.#chatService = chatService;
    const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
    this.#store.add(autorun((r) => {
      const agent = agentObs.read(r);
      if (!agent) {
        dispose(this.#sessions.values());
        this.#sessions.clear();
      }
    }));
  }
  #store;
  #sessions;
  #onWillStartSession;
  #onDidChangeSessions;
  #chatService;
  dispose() {
    this.#store.dispose();
  }
  createSession(editor) {
    const uri = editor.getModel().uri;
    if (this.#sessions.has(uri)) {
      throw new Error("Session already exists");
    }
    this.#onWillStartSession.fire(editor);
    const chatModelRef = this.#chatService.startNewLocalSession(ChatAgentLocation.EditorInline, {
      canUseTools: false
      /* SEE https://github.com/microsoft/vscode/issues/279946 */
    });
    const chatModel = chatModelRef.object;
    chatModel.startEditingSession(false);
    const terminationState = observableValue(this, void 0);
    const store = new DisposableStore();
    store.add(toDisposable(() => {
      void this.#chatService.cancelCurrentRequestForSession(chatModel.sessionResource, "inlineChatSession");
      chatModel.editingSession?.reject();
      this.#sessions.delete(uri);
      this.#onDidChangeSessions.fire(this);
    }));
    store.add(chatModelRef);
    store.add(autorun((r) => {
      const entries = chatModel.editingSession?.entries.read(r);
      if (!entries?.length) {
        return;
      }
      const state = entries.find((entry) => isEqual(entry.modifiedURI, uri))?.state.read(r);
      if (state === ModifiedFileEntryState.Accepted || state === ModifiedFileEntryState.Rejected) {
        const response = chatModel.getRequests().at(-1)?.response;
        if (response) {
          this.#chatService.notifyUserAction({
            sessionResource: response.session.sessionResource,
            requestId: response.requestId,
            agentId: response.agent?.id,
            command: response.slashCommand?.name,
            result: response.result,
            action: {
              kind: "inlineChat",
              action: state === ModifiedFileEntryState.Accepted ? "accepted" : "discarded"
            }
          });
        }
      }
      const allSettled = entries.every((entry) => {
        const state2 = entry.state.read(r);
        return (state2 === ModifiedFileEntryState.Accepted || state2 === ModifiedFileEntryState.Rejected) && !entry.isCurrentlyBeingModifiedBy.read(r);
      });
      if (allSettled && !chatModel.requestInProgress.read(void 0)) {
        store.dispose();
      }
    }));
    const result = {
      uri,
      initialPosition: editor.getSelection().getStartPosition().delta(-1),
      /* one line above selection start */
      initialSelection: editor.getSelection(),
      chatModel,
      editingSession: chatModel.editingSession,
      terminationState,
      setTerminationState: (state) => {
        terminationState.set(state, void 0);
        this.#onDidChangeSessions.fire(this);
      },
      dispose: store.dispose.bind(store)
    };
    this.#sessions.set(uri, result);
    this.#onDidChangeSessions.fire(this);
    return result;
  }
  getSessionByTextModel(uri) {
    let result = this.#sessions.get(uri);
    if (!result) {
      for (const [_, candidate] of this.#sessions) {
        const entry = candidate.editingSession.getEntry(uri);
        if (entry) {
          result = candidate;
          break;
        }
      }
    }
    return result;
  }
  getSessionBySessionUri(sessionResource) {
    for (const session of this.#sessions.values()) {
      if (isEqual(session.chatModel.sessionResource, sessionResource)) {
        return session;
      }
    }
    return void 0;
  }
};
InlineChatSessionServiceImpl = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IChatAgentService)
], InlineChatSessionServiceImpl);
let InlineChatEnabler = class {
  constructor(contextKeyService, chatAgentService, editorService, configService) {
    __privateAdd(this, _ctxHasProvider);
    __privateAdd(this, _ctxHasNotebookProvider);
    __privateAdd(this, _ctxPossible);
    __privateAdd(this, _store, new DisposableStore());
    __privateSet(this, _ctxHasProvider, CTX_INLINE_CHAT_HAS_AGENT.bindTo(contextKeyService));
    __privateSet(this, _ctxHasNotebookProvider, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT.bindTo(contextKeyService));
    __privateSet(this, _ctxPossible, CTX_INLINE_CHAT_POSSIBLE.bindTo(contextKeyService));
    const agentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.EditorInline));
    const notebookAgentObs = observableFromEvent(this, chatAgentService.onDidChangeAgents, () => chatAgentService.getDefaultAgent(ChatAgentLocation.Notebook));
    const notebookAgentConfigObs = observableConfigValue(InlineChatConfigKeys.NotebookAgent, false, configService);
    __privateGet(this, _store).add(autorun((r) => {
      const agent = agentObs.read(r);
      if (!agent) {
        __privateGet(this, _ctxHasProvider).reset();
      } else {
        __privateGet(this, _ctxHasProvider).set(true);
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      __privateGet(this, _ctxHasNotebookProvider).set(notebookAgentConfigObs.read(r) && !!notebookAgentObs.read(r));
    }));
    const updateEditor = () => {
      const ctrl = editorService.activeEditorPane?.getControl();
      const isCodeEditorLike = isCodeEditor(ctrl) || isDiffEditor(ctrl) || isCompositeEditor(ctrl);
      __privateGet(this, _ctxPossible).set(isCodeEditorLike);
    };
    __privateGet(this, _store).add(editorService.onDidActiveEditorChange(updateEditor));
    updateEditor();
  }
  dispose() {
    __privateGet(this, _ctxPossible).reset();
    __privateGet(this, _ctxHasProvider).reset();
    __privateGet(this, _store).dispose();
  }
};
_ctxHasProvider = new WeakMap();
_ctxHasNotebookProvider = new WeakMap();
_ctxPossible = new WeakMap();
_store = new WeakMap();
InlineChatEnabler.Id = "inlineChat.enabler";
InlineChatEnabler = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, IConfigurationService)
], InlineChatEnabler);
let InlineChatEscapeToolContribution = class extends Disposable {
  constructor(lmTools, inlineChatSessionService, logService) {
    super();
    this._store.add(lmTools.registerTool(__privateGet(InlineChatEscapeToolContribution, _data), {
      invoke: async (invocation, _tokenCountFn, _progress, _token) => {
        const sessionResource = invocation.context?.sessionResource;
        if (!sessionResource) {
          logService.warn("InlineChatEscapeToolContribution: no sessionId in tool invocation context");
          return { content: [{ kind: "text", value: "Cancel" }] };
        }
        const session = inlineChatSessionService.getSessionBySessionUri(sessionResource);
        if (!session) {
          logService.warn(`InlineChatEscapeToolContribution: no session found for id ${sessionResource}`);
          return { content: [{ kind: "text", value: "Cancel" }] };
        }
        const lastRequest = session.chatModel.getRequests().at(-1);
        if (!lastRequest) {
          logService.warn(`InlineChatEscapeToolContribution: no request found for id ${sessionResource}`);
          return { content: [{ kind: "text", value: "Cancel" }], toolResultMessage: localize("tool.cancel", "Cancel") };
        }
        const response = typeof invocation.parameters?.response === "string" && invocation.parameters.response.trim().length > 0 ? invocation.parameters.response.trim() : localize("terminated.message", "Inline chat is designed for making single-file code changes. Continue your request in the Chat view or rephrase it for inline chat.");
        session.setTerminationState(response);
        return { content: [{ kind: "text", value: "Success" }] };
      }
    }));
  }
};
_data = new WeakMap();
InlineChatEscapeToolContribution.Id = "inlineChat.escapeTool";
__privateAdd(InlineChatEscapeToolContribution, _data, {
  id: "inline_chat_exit",
  source: ToolDataSource.Internal,
  canBeReferencedInPrompt: false,
  alwaysDisplayInputOutput: false,
  displayName: localize("name", "Inline Chat to Panel Chat"),
  modelDescription: "Show a short textual response when not being able to make code changes and when not having been asked for code changes. Can also be used to move the request to the richer panel chat which supports edits across files, creating and deleting files, multi-turn conversations between the user and the assistant, and access to more IDE tools, like retrieve problems, interact with source control, run terminal commands etc.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      response: {
        type: "string",
        description: localize("response.description", "Optional brief response for inline chat. Keep it at 10 words or fewer."),
        maxLength: 200
      }
    }
  }
});
InlineChatEscapeToolContribution = __decorateClass([
  __decorateParam(0, ILanguageModelToolsService),
  __decorateParam(1, IInlineChatSessionService),
  __decorateParam(2, ILogService)
], InlineChatEscapeToolContribution);
export {
  InlineChatEnabler,
  InlineChatError,
  InlineChatEscapeToolContribution,
  InlineChatSessionServiceImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgZGlzcG9zZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yLCBpc0NvbXBvc2l0ZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgVG9vbERhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENUWF9JTkxJTkVfQ0hBVF9IQVNfQUdFTlQsIENUWF9JTkxJTkVfQ0hBVF9IQVNfTk9URUJPT0tfQUdFTlQsIENUWF9JTkxJTkVfQ0hBVF9QT1NTSUJMRSwgSW5saW5lQ2hhdENvbmZpZ0tleXMgfSBmcm9tICcuLi9jb21tb24vaW5saW5lQ2hhdC5qcyc7XG5pbXBvcnQgeyBJSW5saW5lQ2hhdFNlc3Npb24sIElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UsIElubGluZUNoYXRTZXNzaW9uVGVybWluYXRpb25TdGF0ZSB9IGZyb20gJy4vaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUNoYXRFcnJvciBleHRlbmRzIEVycm9yIHtcblx0c3RhdGljIHJlYWRvbmx5IGNvZGUgPSAnSW5saW5lQ2hhdEVycm9yJztcblx0Y29uc3RydWN0b3IobWVzc2FnZTogc3RyaW5nKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdFx0dGhpcy5uYW1lID0gSW5saW5lQ2hhdEVycm9yLmNvZGU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUNoYXRTZXNzaW9uU2VydmljZUltcGwgaW1wbGVtZW50cyBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSAjc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHJlYWRvbmx5ICNzZXNzaW9ucyA9IG5ldyBSZXNvdXJjZU1hcDxJSW5saW5lQ2hhdFNlc3Npb24+KCk7XG5cblx0cmVhZG9ubHkgI29uV2lsbFN0YXJ0U2Vzc2lvbiA9IHRoaXMuI3N0b3JlLmFkZChuZXcgRW1pdHRlcjxJQWN0aXZlQ29kZUVkaXRvcj4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbFN0YXJ0U2Vzc2lvbjogRXZlbnQ8SUFjdGl2ZUNvZGVFZGl0b3I+ID0gdGhpcy4jb25XaWxsU3RhcnRTZXNzaW9uLmV2ZW50O1xuXG5cdHJlYWRvbmx5ICNvbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy4jc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHRoaXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDx0aGlzPiA9IHRoaXMuI29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cblx0cmVhZG9ubHkgI2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0U2VydmljZSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy4jY2hhdFNlcnZpY2UgPSBjaGF0U2VydmljZTtcblx0XHQvLyBMaXN0ZW4gZm9yIGFnZW50IGNoYW5nZXMgYW5kIGRpc3Bvc2UgYWxsIHNlc3Npb25zIHdoZW4gdGhlcmUgaXMgbm8gYWdlbnRcblx0XHRjb25zdCBhZ2VudE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cywgKCkgPT4gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSk7XG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IGFnZW50T2JzLnJlYWQocik7XG5cdFx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRcdC8vIE5vIGFnZW50IGF2YWlsYWJsZSwgZGlzcG9zZSBhbGwgc2Vzc2lvbnNcblx0XHRcdFx0ZGlzcG9zZSh0aGlzLiNzZXNzaW9ucy52YWx1ZXMoKSk7XG5cdFx0XHRcdHRoaXMuI3Nlc3Npb25zLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLiNzdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXG5cdGNyZWF0ZVNlc3Npb24oZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcik6IElJbmxpbmVDaGF0U2Vzc2lvbiB7XG5cdFx0Y29uc3QgdXJpID0gZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXG5cdFx0aWYgKHRoaXMuI3Nlc3Npb25zLmhhcyh1cmkpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Nlc3Npb24gYWxyZWFkeSBleGlzdHMnKTtcblx0XHR9XG5cblx0XHR0aGlzLiNvbldpbGxTdGFydFNlc3Npb24uZmlyZShlZGl0b3IpO1xuXG5cdFx0Y29uc3QgY2hhdE1vZGVsUmVmID0gdGhpcy4jY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLCB7IGNhblVzZVRvb2xzOiBmYWxzZSAvKiBTRUUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3OTk0NiAqLyB9KTtcblx0XHRjb25zdCBjaGF0TW9kZWwgPSBjaGF0TW9kZWxSZWYub2JqZWN0O1xuXHRcdGNoYXRNb2RlbC5zdGFydEVkaXRpbmdTZXNzaW9uKGZhbHNlKTtcblx0XHRjb25zdCB0ZXJtaW5hdGlvblN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPElubGluZUNoYXRTZXNzaW9uVGVybWluYXRpb25TdGF0ZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLiNjaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24oY2hhdE1vZGVsLnNlc3Npb25SZXNvdXJjZSwgJ2lubGluZUNoYXRTZXNzaW9uJyk7XG5cdFx0XHRjaGF0TW9kZWwuZWRpdGluZ1Nlc3Npb24/LnJlamVjdCgpO1xuXHRcdFx0dGhpcy4jc2Vzc2lvbnMuZGVsZXRlKHVyaSk7XG5cdFx0XHR0aGlzLiNvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUodGhpcyk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZChjaGF0TW9kZWxSZWYpO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cblx0XHRcdGNvbnN0IGVudHJpZXMgPSBjaGF0TW9kZWwuZWRpdGluZ1Nlc3Npb24/LmVudHJpZXMucmVhZChyKTtcblx0XHRcdGlmICghZW50cmllcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBlbnRyaWVzLmZpbmQoZW50cnkgPT4gaXNFcXVhbChlbnRyeS5tb2RpZmllZFVSSSwgdXJpKSk/LnN0YXRlLnJlYWQocik7XG5cdFx0XHRpZiAoc3RhdGUgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQgfHwgc3RhdGUgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuUmVqZWN0ZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBjaGF0TW9kZWwuZ2V0UmVxdWVzdHMoKS5hdCgtMSk/LnJlc3BvbnNlO1xuXHRcdFx0XHRpZiAocmVzcG9uc2UpIHtcblx0XHRcdFx0XHR0aGlzLiNjaGF0U2VydmljZS5ub3RpZnlVc2VyQWN0aW9uKHtcblx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVzcG9uc2Uuc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0SWQ6IHJlc3BvbnNlLnJlcXVlc3RJZCxcblx0XHRcdFx0XHRcdGFnZW50SWQ6IHJlc3BvbnNlLmFnZW50Py5pZCxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHJlc3BvbnNlLnNsYXNoQ29tbWFuZD8ubmFtZSxcblx0XHRcdFx0XHRcdHJlc3VsdDogcmVzcG9uc2UucmVzdWx0LFxuXHRcdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdpbmxpbmVDaGF0Jyxcblx0XHRcdFx0XHRcdFx0YWN0aW9uOiBzdGF0ZSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCA/ICdhY2NlcHRlZCcgOiAnZGlzY2FyZGVkJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFsbFNldHRsZWQgPSBlbnRyaWVzLmV2ZXJ5KGVudHJ5ID0+IHtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBlbnRyeS5zdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHRyZXR1cm4gKHN0YXRlID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLkFjY2VwdGVkIHx8IHN0YXRlID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkKVxuXHRcdFx0XHRcdCYmICFlbnRyeS5pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeS5yZWFkKHIpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChhbGxTZXR0bGVkICYmICFjaGF0TW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MucmVhZCh1bmRlZmluZWQpKSB7XG5cdFx0XHRcdC8vIHNlbGYgdGVybWluYXRlXG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXN1bHQ6IElJbmxpbmVDaGF0U2Vzc2lvbiA9IHtcblx0XHRcdHVyaSxcblx0XHRcdGluaXRpYWxQb3NpdGlvbjogZWRpdG9yLmdldFNlbGVjdGlvbigpLmdldFN0YXJ0UG9zaXRpb24oKS5kZWx0YSgtMSksIC8qIG9uZSBsaW5lIGFib3ZlIHNlbGVjdGlvbiBzdGFydCAqL1xuXHRcdFx0aW5pdGlhbFNlbGVjdGlvbjogZWRpdG9yLmdldFNlbGVjdGlvbigpLFxuXHRcdFx0Y2hhdE1vZGVsLFxuXHRcdFx0ZWRpdGluZ1Nlc3Npb246IGNoYXRNb2RlbC5lZGl0aW5nU2Vzc2lvbiEsXG5cdFx0XHR0ZXJtaW5hdGlvblN0YXRlLFxuXHRcdFx0c2V0VGVybWluYXRpb25TdGF0ZTogc3RhdGUgPT4ge1xuXHRcdFx0XHR0ZXJtaW5hdGlvblN0YXRlLnNldChzdGF0ZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy4jb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHRoaXMpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6IHN0b3JlLmRpc3Bvc2UuYmluZChzdG9yZSlcblx0XHR9O1xuXHRcdHRoaXMuI3Nlc3Npb25zLnNldCh1cmksIHJlc3VsdCk7XG5cdFx0dGhpcy4jb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHRoaXMpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRTZXNzaW9uQnlUZXh0TW9kZWwodXJpOiBVUkkpOiBJSW5saW5lQ2hhdFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQgPSB0aGlzLiNzZXNzaW9ucy5nZXQodXJpKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0Ly8gbm8gZGlyZWN0IHNlc3Npb24sIHRyeSB0byBmaW5kIGFuIGVkaXRpbmcgc2Vzc2lvbiB3aGljaCBoYXMgYSBmaWxlIGVudHJ5IGZvciB0aGUgdXJpXG5cdFx0XHRmb3IgKGNvbnN0IFtfLCBjYW5kaWRhdGVdIG9mIHRoaXMuI3Nlc3Npb25zKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gY2FuZGlkYXRlLmVkaXRpbmdTZXNzaW9uLmdldEVudHJ5KHVyaSk7XG5cdFx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0U2Vzc2lvbkJ5U2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IElJbmxpbmVDaGF0U2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuI3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoaXNFcXVhbChzZXNzaW9uLmNoYXRNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUNoYXRFbmFibGVyIHtcblxuXHRzdGF0aWMgSWQgPSAnaW5saW5lQ2hhdC5lbmFibGVyJztcblxuXHRyZWFkb25seSAjY3R4SGFzUHJvdmlkZXI6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRyZWFkb25seSAjY3R4SGFzTm90ZWJvb2tQcm92aWRlcjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHJlYWRvbmx5ICNjdHhQb3NzaWJsZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cmVhZG9ubHkgI3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLiNjdHhIYXNQcm92aWRlciA9IENUWF9JTkxJTkVfQ0hBVF9IQVNfQUdFTlQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLiNjdHhIYXNOb3RlYm9va1Byb3ZpZGVyID0gQ1RYX0lOTElORV9DSEFUX0hBU19OT1RFQk9PS19BR0VOVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuI2N0eFBvc3NpYmxlID0gQ1RYX0lOTElORV9DSEFUX1BPU1NJQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHRjb25zdCBhZ2VudE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cywgKCkgPT4gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tBZ2VudE9icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cywgKCkgPT4gY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQoQ2hhdEFnZW50TG9jYXRpb24uTm90ZWJvb2spKTtcblx0XHRjb25zdCBub3RlYm9va0FnZW50Q29uZmlnT2JzID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKElubGluZUNoYXRDb25maWdLZXlzLk5vdGVib29rQWdlbnQsIGZhbHNlLCBjb25maWdTZXJ2aWNlKTtcblxuXHRcdHRoaXMuI3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSBhZ2VudE9icy5yZWFkKHIpO1xuXHRcdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0XHR0aGlzLiNjdHhIYXNQcm92aWRlci5yZXNldCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy4jY3R4SGFzUHJvdmlkZXIuc2V0KHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuI3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0dGhpcy4jY3R4SGFzTm90ZWJvb2tQcm92aWRlci5zZXQobm90ZWJvb2tBZ2VudENvbmZpZ09icy5yZWFkKHIpICYmICEhbm90ZWJvb2tBZ2VudE9icy5yZWFkKHIpKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVFZGl0b3IgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBjdHJsID0gZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3JQYW5lPy5nZXRDb250cm9sKCk7XG5cdFx0XHRjb25zdCBpc0NvZGVFZGl0b3JMaWtlID0gaXNDb2RlRWRpdG9yKGN0cmwpIHx8IGlzRGlmZkVkaXRvcihjdHJsKSB8fCBpc0NvbXBvc2l0ZUVkaXRvcihjdHJsKTtcblx0XHRcdHRoaXMuI2N0eFBvc3NpYmxlLnNldChpc0NvZGVFZGl0b3JMaWtlKTtcblx0XHR9O1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UodXBkYXRlRWRpdG9yKSk7XG5cdFx0dXBkYXRlRWRpdG9yKCk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuI2N0eFBvc3NpYmxlLnJlc2V0KCk7XG5cdFx0dGhpcy4jY3R4SGFzUHJvdmlkZXIucmVzZXQoKTtcblx0XHR0aGlzLiNzdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY2xhc3MgSW5saW5lQ2hhdEVzY2FwZVRvb2xDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSWQgPSAnaW5saW5lQ2hhdC5lc2NhcGVUb29sJztcblx0c3RhdGljIHJlYWRvbmx5ICNkYXRhOiBJVG9vbERhdGEgPSB7XG5cdFx0aWQ6ICdpbmxpbmVfY2hhdF9leGl0Jyxcblx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblx0XHRhbHdheXNEaXNwbGF5SW5wdXRPdXRwdXQ6IGZhbHNlLFxuXHRcdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnbmFtZScsIFwiSW5saW5lIENoYXQgdG8gUGFuZWwgQ2hhdFwiKSxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiAnU2hvdyBhIHNob3J0IHRleHR1YWwgcmVzcG9uc2Ugd2hlbiBub3QgYmVpbmcgYWJsZSB0byBtYWtlIGNvZGUgY2hhbmdlcyBhbmQgd2hlbiBub3QgaGF2aW5nIGJlZW4gYXNrZWQgZm9yIGNvZGUgY2hhbmdlcy4gQ2FuIGFsc28gYmUgdXNlZCB0byBtb3ZlIHRoZSByZXF1ZXN0IHRvIHRoZSByaWNoZXIgcGFuZWwgY2hhdCB3aGljaCBzdXBwb3J0cyBlZGl0cyBhY3Jvc3MgZmlsZXMsIGNyZWF0aW5nIGFuZCBkZWxldGluZyBmaWxlcywgbXVsdGktdHVybiBjb252ZXJzYXRpb25zIGJldHdlZW4gdGhlIHVzZXIgYW5kIHRoZSBhc3Npc3RhbnQsIGFuZCBhY2Nlc3MgdG8gbW9yZSBJREUgdG9vbHMsIGxpa2UgcmV0cmlldmUgcHJvYmxlbXMsIGludGVyYWN0IHdpdGggc291cmNlIGNvbnRyb2wsIHJ1biB0ZXJtaW5hbCBjb21tYW5kcyBldGMuJyxcblx0XHRpbnB1dFNjaGVtYToge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHJlc3BvbnNlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdyZXNwb25zZS5kZXNjcmlwdGlvbicsIFwiT3B0aW9uYWwgYnJpZWYgcmVzcG9uc2UgZm9yIGlubGluZSBjaGF0LiBLZWVwIGl0IGF0IDEwIHdvcmRzIG9yIGZld2VyLlwiKSxcblx0XHRcdFx0XHRtYXhMZW5ndGg6IDIwMCxcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgbG1Ub29sczogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UgaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlOiBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fc3RvcmUuYWRkKGxtVG9vbHMucmVnaXN0ZXJUb29sKElubGluZUNoYXRFc2NhcGVUb29sQ29udHJpYnV0aW9uLiNkYXRhLCB7XG5cdFx0XHRpbnZva2U6IGFzeW5jIChpbnZvY2F0aW9uLCBfdG9rZW5Db3VudEZuLCBfcHJvZ3Jlc3MsIF90b2tlbikgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGludm9jYXRpb24uY29udGV4dD8uc2Vzc2lvblJlc291cmNlO1xuXG5cdFx0XHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS53YXJuKCdJbmxpbmVDaGF0RXNjYXBlVG9vbENvbnRyaWJ1dGlvbjogbm8gc2Vzc2lvbklkIGluIHRvb2wgaW52b2NhdGlvbiBjb250ZXh0Jyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ0NhbmNlbCcgfV0gfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UuZ2V0U2Vzc2lvbkJ5U2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2Uud2FybihgSW5saW5lQ2hhdEVzY2FwZVRvb2xDb250cmlidXRpb246IG5vIHNlc3Npb24gZm91bmQgZm9yIGlkICR7c2Vzc2lvblJlc291cmNlfWApO1xuXHRcdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6IFt7IGtpbmQ6ICd0ZXh0JywgdmFsdWU6ICdDYW5jZWwnIH1dIH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IHNlc3Npb24uY2hhdE1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRcdFx0XHRpZiAoIWxhc3RSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBJbmxpbmVDaGF0RXNjYXBlVG9vbENvbnRyaWJ1dGlvbjogbm8gcmVxdWVzdCBmb3VuZCBmb3IgaWQgJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY29udGVudDogW3sga2luZDogJ3RleHQnLCB2YWx1ZTogJ0NhbmNlbCcgfV0sIHRvb2xSZXN1bHRNZXNzYWdlOiBsb2NhbGl6ZSgndG9vbC5jYW5jZWwnLCBcIkNhbmNlbFwiKSB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSB0eXBlb2YgaW52b2NhdGlvbi5wYXJhbWV0ZXJzPy5yZXNwb25zZSA9PT0gJ3N0cmluZycgJiYgaW52b2NhdGlvbi5wYXJhbWV0ZXJzLnJlc3BvbnNlLnRyaW0oKS5sZW5ndGggPiAwXG5cdFx0XHRcdFx0PyBpbnZvY2F0aW9uLnBhcmFtZXRlcnMucmVzcG9uc2UudHJpbSgpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgndGVybWluYXRlZC5tZXNzYWdlJywgXCJJbmxpbmUgY2hhdCBpcyBkZXNpZ25lZCBmb3IgbWFraW5nIHNpbmdsZS1maWxlIGNvZGUgY2hhbmdlcy4gQ29udGludWUgeW91ciByZXF1ZXN0IGluIHRoZSBDaGF0IHZpZXcgb3IgcmVwaHJhc2UgaXQgZm9yIGlubGluZSBjaGF0LlwiKTtcblxuXHRcdFx0XHRzZXNzaW9uLnNldFRlcm1pbmF0aW9uU3RhdGUocmVzcG9uc2UpO1xuXHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiAnU3VjY2VzcycgfV0gfTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBSUEsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksU0FBUyxpQkFBaUIsb0JBQW9CO0FBQ25FLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQzlELFNBQVMsZUFBZTtBQUV4QixTQUE0QixjQUFjLG1CQUFtQixvQkFBb0I7QUFDakYsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQXVDLHNCQUFzQjtBQUN0RSxTQUFTLDJCQUEyQixvQ0FBb0MsMEJBQTBCLDRCQUE0QjtBQUM5SCxTQUE2QixpQ0FBb0U7QUFFMUYsTUFBTSxtQkFBTixNQUFNLHlCQUF3QixNQUFNO0FBQUEsRUFFMUMsWUFBWSxTQUFpQjtBQUM1QixVQUFNLE9BQU87QUFDYixTQUFLLE9BQU8saUJBQWdCO0FBQUEsRUFDN0I7QUFDRDtBQU5hLGlCQUNJLE9BQU87QUFEakIsSUFBTSxrQkFBTjtBQVFBLElBQU0sK0JBQU4sTUFBd0U7QUFBQSxFQWU5RSxZQUNlLGFBQ0ssa0JBQ2xCO0FBZEYsU0FBUyxTQUFTLElBQUksZ0JBQWdCO0FBQ3RDLFNBQVMsWUFBWSxJQUFJLFlBQWdDO0FBRXpELFNBQVMsc0JBQXNCLEtBQUssT0FBTyxJQUFJLElBQUksUUFBMkIsQ0FBQztBQUMvRSxTQUFTLHFCQUErQyxLQUFLLG9CQUFvQjtBQUVq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
