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
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _userSelectedModel, _store, _isActiveController, _zone, _currentSession, _editor, _instaService, _notebookEditorService, _inlineChatSessionService, _configurationService, _editorService, _markerDecorationsService, _languageModelService, _logService, _chatEditingService, _chatService, _InlineChatController_instances, runZone_fn, selectVendorDefaultModel_fn, applyModelDefaults_fn;
import { renderAsPlaintext } from "../../../../base/browser/markdownRenderer.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableFromEvent, observableSignalFromEvent, observableValue, waitForState } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { assertType } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { observableCodeEditor } from "../../../../editor/browser/observableCodeEditor.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { IMarkerDecorationsService } from "../../../../editor/common/services/markerDecorations.js";
import { localize } from "../../../../nls.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IChatEditingService, ModifiedFileEntryState } from "../../chat/common/editing/chatEditingService.js";
import { ChatMode } from "../../chat/common/chatModes.js";
import { IChatService, IChatToolInvocation, ToolConfirmKind } from "../../chat/common/chatService/chatService.js";
import { IDiagnosticVariableEntryFilterData } from "../../chat/common/attachments/chatVariableEntries.js";
import { isResponseVM } from "../../chat/common/model/chatViewModel.js";
import { ChatAgentLocation } from "../../chat/common/constants.js";
import { ILanguageModelChatMetadata, ILanguageModelsService, isILanguageModelChatSelector } from "../../chat/common/languageModels.js";
import { isNotebookContainingCellEditor as isNotebookWithCellEditor } from "../../notebook/browser/notebookEditor.js";
import { INotebookEditorService } from "../../notebook/browser/services/notebookEditorService.js";
import { CellUri } from "../../notebook/common/notebookCommon.js";
import { CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_TERMINATED, CTX_INLINE_CHAT_VISIBLE, INLINE_CHAT_ID, InlineChatConfigKeys } from "../common/inlineChat.js";
import { InlineChatAffordance } from "./inlineChatAffordance.js";
import { continueInPanelChat, IInlineChatSessionService, rephraseInlineChat } from "./inlineChatSessionService.js";
import { InlineChatZoneWidget } from "./inlineChatZoneWidget.js";
class InlineChatRunOptions {
  static isInlineChatRunOptions(options) {
    if (typeof options !== "object" || options === null) {
      return false;
    }
    const { initialSelection, initialRange, message, autoSend, position, attachments, modelSelector, resolveOnResponse, attachDiagnostics } = options;
    if (typeof message !== "undefined" && typeof message !== "string" || typeof autoSend !== "undefined" && typeof autoSend !== "boolean" || typeof initialRange !== "undefined" && !Range.isIRange(initialRange) || typeof initialSelection !== "undefined" && !Selection.isISelection(initialSelection) || typeof position !== "undefined" && !Position.isIPosition(position) || typeof attachments !== "undefined" && (!Array.isArray(attachments) || !attachments.every((item) => item instanceof URI)) || typeof modelSelector !== "undefined" && !isILanguageModelChatSelector(modelSelector) || typeof resolveOnResponse !== "undefined" && typeof resolveOnResponse !== "boolean" || typeof attachDiagnostics !== "undefined" && typeof attachDiagnostics !== "boolean") {
      return false;
    }
    return true;
  }
}
function getEditorId(editor, model) {
  return `${editor.getId()},${model.id}`;
}
let InlineChatController = class {
  constructor(editor, instaService, notebookEditorService, inlineChatSessionService, codeEditorService, contextKeyService, configurationService, editorService, markerDecorationsService, languageModelService, logService, chatEditingService, chatService) {
    __privateAdd(this, _InlineChatController_instances);
    __privateAdd(this, _store, new DisposableStore());
    __privateAdd(this, _isActiveController, observableValue(this, false));
    __privateAdd(this, _zone);
    __privateAdd(this, _currentSession);
    __privateAdd(this, _editor);
    __privateAdd(this, _instaService);
    __privateAdd(this, _notebookEditorService);
    __privateAdd(this, _inlineChatSessionService);
    __privateAdd(this, _configurationService);
    __privateAdd(this, _editorService);
    __privateAdd(this, _markerDecorationsService);
    __privateAdd(this, _languageModelService);
    __privateAdd(this, _logService);
    __privateAdd(this, _chatEditingService);
    __privateAdd(this, _chatService);
    __privateSet(this, _editor, editor);
    __privateSet(this, _instaService, instaService);
    __privateSet(this, _notebookEditorService, notebookEditorService);
    __privateSet(this, _inlineChatSessionService, inlineChatSessionService);
    __privateSet(this, _configurationService, configurationService);
    __privateSet(this, _editorService, editorService);
    __privateSet(this, _markerDecorationsService, markerDecorationsService);
    __privateSet(this, _languageModelService, languageModelService);
    __privateSet(this, _logService, logService);
    __privateSet(this, _chatEditingService, chatEditingService);
    __privateSet(this, _chatService, chatService);
    const editorObs = observableCodeEditor(editor);
    const ctxInlineChatVisible = CTX_INLINE_CHAT_VISIBLE.bindTo(contextKeyService);
    const ctxFileBelongsToChat = CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.bindTo(contextKeyService);
    const ctxTerminated = CTX_INLINE_CHAT_TERMINATED.bindTo(contextKeyService);
    const notebookAgentConfig = observableConfigValue(InlineChatConfigKeys.NotebookAgent, false, __privateGet(this, _configurationService));
    __privateGet(this, _store).add(autorun((r) => {
      const model = editorObs.model.read(r);
      if (!model) {
        ctxFileBelongsToChat.set(false);
        return;
      }
      const sessions = __privateGet(this, _chatEditingService).editingSessionsObs.read(r);
      let hasEdits = false;
      for (const session of sessions) {
        const entries = session.entries.read(r);
        for (const entry of entries) {
          if (isEqual(entry.modifiedURI, model.uri)) {
            hasEdits = true;
            break;
          }
        }
        if (hasEdits) {
          break;
        }
      }
      ctxFileBelongsToChat.set(hasEdits);
    }));
    this.inputOverlayWidget = __privateGet(this, _store).add(__privateGet(this, _instaService).createInstance(InlineChatAffordance, __privateGet(this, _editor)));
    __privateSet(this, _zone, new Lazy(() => {
      assertType(__privateGet(this, _editor).hasModel(), "[Illegal State] widget should only be created when the editor has a model");
      const location = {
        location: ChatAgentLocation.EditorInline,
        resolveData: () => {
          assertType(__privateGet(this, _editor).hasModel());
          const wholeRange = __privateGet(this, _editor).getSelection();
          const document = __privateGet(this, _editor).getModel().uri;
          return {
            type: ChatAgentLocation.EditorInline,
            id: getEditorId(__privateGet(this, _editor), __privateGet(this, _editor).getModel()),
            selection: __privateGet(this, _editor).getSelection(),
            document,
            wholeRange
          };
        }
      };
      const notebookEditor = __privateGet(this, _notebookEditorService).getNotebookForPossibleCell(__privateGet(this, _editor));
      if (!!notebookEditor) {
        location.location = ChatAgentLocation.Notebook;
        if (notebookAgentConfig.get()) {
          location.resolveData = () => {
            assertType(__privateGet(this, _editor).hasModel());
            return {
              type: ChatAgentLocation.Notebook,
              sessionInputUri: __privateGet(this, _editor).getModel().uri
            };
          };
        }
      }
      const result = __privateGet(this, _instaService).createInstance(
        InlineChatZoneWidget,
        location,
        {
          enableWorkingSet: "implicit",
          enableImplicitContext: false,
          renderInputOnTop: false,
          renderInputToolbarBelowInput: true,
          filter: (item) => {
            if (!isResponseVM(item)) {
              return false;
            }
            return !!item.model.isPendingConfirmation.get();
          },
          menus: {
            telemetrySource: "inlineChatWidget",
            executeToolbar: MenuId.ChatEditorInlineExecute,
            inputSideToolbar: MenuId.ChatEditorInlineInputSide
          },
          defaultMode: ChatMode.Ask
        },
        { editor: __privateGet(this, _editor), notebookEditor },
        () => Promise.resolve()
      );
      __privateGet(this, _store).add(result);
      result.domNode.classList.add("inline-chat-2");
      return result;
    }));
    const sessionsSignal = observableSignalFromEvent(this, inlineChatSessionService.onDidChangeSessions);
    __privateSet(this, _currentSession, derived((r) => {
      sessionsSignal.read(r);
      const model = editorObs.model.read(r);
      const session = model && inlineChatSessionService.getSessionByTextModel(model.uri);
      return session ?? void 0;
    }));
    let lastSession = void 0;
    __privateGet(this, _store).add(autorun((r) => {
      const session = __privateGet(this, _currentSession).read(r);
      if (!session) {
        __privateGet(this, _isActiveController).set(false, void 0);
        if (lastSession && !lastSession.chatModel.hasRequests) {
          const state = lastSession.chatModel.inputModel.state.read(void 0);
          if (!state || !state.inputText && state.attachments.length === 0) {
            lastSession.dispose();
            lastSession = void 0;
          }
        }
        return;
      }
      lastSession = session;
      let foundOne = false;
      for (const editor2 of codeEditorService.listCodeEditors()) {
        const ctrl = InlineChatController.get(editor2);
        if (ctrl && __privateGet(ctrl, _isActiveController).read(void 0)) {
          foundOne = true;
          break;
        }
      }
      if (!foundOne && editorObs.isFocused.read(r)) {
        __privateGet(this, _isActiveController).set(true, void 0);
      }
    }));
    const visibleSessionObs = observableValue(this, void 0);
    __privateGet(this, _store).add(autorun((r) => {
      const model = editorObs.model.read(r);
      const session = __privateGet(this, _currentSession).read(r);
      const isActive = __privateGet(this, _isActiveController).read(r);
      if (!session || !isActive || !model) {
        visibleSessionObs.set(void 0, void 0);
      } else {
        visibleSessionObs.set(session, void 0);
      }
    }));
    const defaultPlaceholderObs = visibleSessionObs.map((session, r) => {
      return session?.initialSelection.isEmpty() ? localize("placeholder", "Generate code") : localize("placeholderWithSelection", "Modify selected code");
    });
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      ctxTerminated.set(!!session?.terminationState.read(r));
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      if (!session) {
        __privateGet(this, _zone).rawValue?.hide();
        __privateGet(this, _zone).rawValue?.widget.chatWidget.setModel(void 0);
        editor.focus();
        ctxInlineChatVisible.reset();
      } else {
        ctxInlineChatVisible.set(true);
        __privateGet(this, _zone).value.widget.chatWidget.setModel(session.chatModel);
        if (!__privateGet(this, _zone).value.position) {
          __privateGet(this, _zone).value.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
          __privateGet(this, _zone).value.widget.chatWidget.input.renderAttachedContext();
          __privateGet(this, _zone).value.show(session.initialPosition);
        }
        __privateGet(this, _zone).value.reveal(__privateGet(this, _zone).value.position);
        __privateGet(this, _zone).value.widget.focus();
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = __privateGet(this, _currentSession).read(r);
      if (!session) {
        return;
      }
      const lastRequest = session.chatModel.lastRequestObs.read(r);
      const response = lastRequest?.response;
      const pending = response?.isPendingConfirmation.read(r);
      if (pending) {
        __privateGet(this, _logService).info(`[InlineChat] auto-approving: ${pending.detail ?? "unknown"}`);
        for (const part of response.response.value) {
          if (part.kind === "toolInvocation") {
            IChatToolInvocation.confirmWith(part, { type: ToolConfirmKind.ConfirmationNotNeeded, reason: "inlineChat" });
          }
        }
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      if (session) {
        const entries = session.editingSession.entries.read(r);
        const sessionCellUri = CellUri.parse(session.uri);
        const otherEntries = entries.filter((entry) => {
          if (isEqual(entry.modifiedURI, session.uri)) {
            return false;
          }
          if (!!sessionCellUri && isEqual(sessionCellUri.notebook, entry.modifiedURI)) {
            return false;
          }
          return true;
        });
        for (const entry of otherEntries) {
          __privateGet(this, _editorService).openEditor({ resource: entry.modifiedURI }, SIDE_GROUP).catch(onUnexpectedError);
        }
      }
    }));
    const lastResponseObs = visibleSessionObs.map((session, r) => {
      if (!session) {
        return;
      }
      const lastRequest = observableFromEvent(this, session.chatModel.onDidChange, () => session.chatModel.getRequests().at(-1)).read(r);
      return lastRequest?.response;
    });
    const lastResponseProgressObs = lastResponseObs.map((response, r) => {
      if (!response) {
        return;
      }
      return observableFromEvent(this, response.onDidChange, () => response.response.value.findLast((part) => part.kind === "progressMessage")).read(r);
    });
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      const response = lastResponseObs.read(r);
      const terminationState = session?.terminationState.read(r);
      __privateGet(this, _zone).rawValue?.widget.updateInfo("");
      if (!response?.isInProgress.read(r)) {
        __privateGet(this, _zone).rawValue?.status.set(response?.result?.details ?? "", void 0);
        if (response?.result?.errorDetails) {
          __privateGet(this, _zone).rawValue?.widget.updateInfo(`$(error) ${response.result.errorDetails.message}`);
          alert(response.result.errorDetails.message);
        } else if (terminationState) {
          __privateGet(this, _zone).rawValue?.showTerminationCard(terminationState, __privateGet(this, _instaService));
        }
        if (!terminationState) {
          __privateGet(this, _zone).rawValue?.hideTerminationCard();
        }
        __privateGet(this, _zone).rawValue?.widget.domNode.classList.toggle("request-in-progress", false);
        __privateGet(this, _zone).rawValue?.widget.chatWidget.setInputPlaceholder(defaultPlaceholderObs.read(r));
      } else {
        __privateGet(this, _zone).rawValue?.widget.domNode.classList.toggle("request-in-progress", true);
        __privateGet(this, _zone).rawValue?.status.set("", void 0);
        let placeholder = response.request?.message.text;
        const lastProgress = lastResponseProgressObs.read(r);
        if (lastProgress) {
          placeholder = renderAsPlaintext(lastProgress.content);
        }
        __privateGet(this, _zone).rawValue?.widget.chatWidget.setInputPlaceholder(placeholder || localize("loading", "Working..."));
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      if (!session) {
        return;
      }
      const entry = session.editingSession.readEntry(session.uri, r);
      if (entry?.state.read(r) === ModifiedFileEntryState.Modified) {
        entry?.enableReviewModeUntilSettled();
      }
    }));
    __privateGet(this, _store).add(autorun((r) => {
      const session = visibleSessionObs.read(r);
      const entry = session?.editingSession.readEntry(session.uri, r);
      const pane = __privateGet(this, _editorService).visibleEditorPanes.find((candidate) => candidate.getControl() === __privateGet(this, _editor) || isNotebookWithCellEditor(candidate, __privateGet(this, _editor)));
      if (pane && entry) {
        entry?.getEditorIntegration(pane);
      }
      if (entry?.diffInfo && __privateGet(this, _zone).rawValue?.position) {
        const { position } = __privateGet(this, _zone).rawValue;
        const diff = entry.diffInfo.read(r);
        for (const change of diff.changes) {
          if (change.modified.contains(position.lineNumber)) {
            __privateGet(this, _zone).rawValue?.updatePositionAndHeight(new Position(change.modified.startLineNumber - 1, 1));
            break;
          }
        }
      }
    }));
  }
  static get(editor) {
    return editor.getContribution(InlineChatController.ID) ?? void 0;
  }
  get widget() {
    return __privateGet(this, _zone).value.widget;
  }
  get isActive() {
    return Boolean(__privateGet(this, _currentSession).get());
  }
  dispose() {
    __privateGet(this, _store).dispose();
  }
  getWidgetPosition() {
    return __privateGet(this, _zone).rawValue?.position;
  }
  focus() {
    __privateGet(this, _zone).rawValue?.widget.focus();
  }
  async run(arg) {
    assertType(__privateGet(this, _editor).hasModel());
    const uri = __privateGet(this, _editor).getModel().uri;
    const existingSession = __privateGet(this, _inlineChatSessionService).getSessionByTextModel(uri);
    if (existingSession) {
      await existingSession.editingSession.accept();
      existingSession.dispose();
    }
    __privateGet(this, _isActiveController).set(true, void 0);
    const session = __privateGet(this, _inlineChatSessionService).createSession(__privateGet(this, _editor));
    return __privateMethod(this, _InlineChatController_instances, runZone_fn).call(this, session, arg);
  }
  async acceptSession() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    await session.editingSession.accept();
    session.dispose();
  }
  async rejectSession() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    await __privateGet(this, _chatService).cancelCurrentRequestForSession(session.chatModel.sessionResource, "inlineChatReject");
    await session.editingSession.reject();
    session.dispose();
  }
  async continueSessionInChat() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    await __privateGet(this, _instaService).invokeFunction(continueInPanelChat, session);
  }
  async rephraseSession() {
    const session = __privateGet(this, _currentSession).get();
    if (!session) {
      return;
    }
    const requestText = __privateGet(this, _instaService).invokeFunction(rephraseInlineChat, session);
    if (requestText) {
      __privateGet(this, _zone).rawValue?.widget.chatWidget.setInput(requestText);
    }
    __privateGet(this, _zone).rawValue?.widget.focus();
  }
};
_userSelectedModel = new WeakMap();
_store = new WeakMap();
_isActiveController = new WeakMap();
_zone = new WeakMap();
_currentSession = new WeakMap();
_editor = new WeakMap();
_instaService = new WeakMap();
_notebookEditorService = new WeakMap();
_inlineChatSessionService = new WeakMap();
_configurationService = new WeakMap();
_editorService = new WeakMap();
_markerDecorationsService = new WeakMap();
_languageModelService = new WeakMap();
_logService = new WeakMap();
_chatEditingService = new WeakMap();
_chatService = new WeakMap();
_InlineChatController_instances = new WeakSet();
runZone_fn = async function(session, arg) {
  assertType(__privateGet(this, _editor).hasModel());
  const uri = __privateGet(this, _editor).getModel().uri;
  const sessionStore = new DisposableStore();
  try {
    await __privateMethod(this, _InlineChatController_instances, applyModelDefaults_fn).call(this, session, sessionStore);
    if (arg) {
      arg.attachDiagnostics ??= true;
    }
    if (arg?.attachDiagnostics) {
      const entries = [];
      for (const [range, marker] of __privateGet(this, _markerDecorationsService).getLiveMarkers(uri)) {
        if (range.intersectRanges(__privateGet(this, _editor).getSelection())) {
          const filter = IDiagnosticVariableEntryFilterData.fromMarker(marker);
          entries.push(IDiagnosticVariableEntryFilterData.toEntry(filter));
        }
      }
      if (entries.length > 0) {
        __privateGet(this, _zone).value.widget.chatWidget.attachmentModel.addContext(...entries);
        const msg = entries.length > 1 ? localize("fixN", "Fix the attached problems") : localize("fix1", "Fix the attached problem");
        __privateGet(this, _zone).value.widget.chatWidget.input.setValue(msg, true);
        arg.message = msg;
        __privateGet(this, _zone).value.widget.chatWidget.inputEditor.setSelection(new Selection(1, 1, Number.MAX_SAFE_INTEGER, 1));
      }
    }
    if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
      if (arg.initialRange) {
        __privateGet(this, _editor).revealRange(arg.initialRange);
      }
      if (arg.initialSelection) {
        __privateGet(this, _editor).setSelection(arg.initialSelection);
      }
      if (arg.attachments) {
        await Promise.all(arg.attachments.map(async (attachment) => {
          await __privateGet(this, _zone).value.widget.chatWidget.attachmentModel.addFile(attachment);
        }));
        delete arg.attachments;
      }
      if (arg.modelSelector) {
        const id = (await __privateGet(this, _languageModelService).selectLanguageModels(arg.modelSelector)).sort().at(0);
        if (!id) {
          throw new Error(`No language models found matching selector: ${JSON.stringify(arg.modelSelector)}.`);
        }
        const model = __privateGet(this, _languageModelService).lookupLanguageModel(id);
        if (!model) {
          throw new Error(`Language model not loaded: ${id}.`);
        }
        __privateGet(this, _zone).value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: model, identifier: id }, true);
      }
      if (arg.message) {
        __privateGet(this, _zone).value.widget.chatWidget.setInput(arg.message);
        if (arg.autoSend) {
          await __privateGet(this, _zone).value.widget.chatWidget.acceptInput();
        }
      }
    }
    if (!arg?.resolveOnResponse) {
      await Event.toPromise(session.editingSession.onDidDispose);
      const rejected = session.editingSession.getEntry(uri)?.state.get() === ModifiedFileEntryState.Rejected;
      return !rejected;
    } else {
      const modifiedObs = derived((r) => {
        const entry = session.editingSession.readEntry(uri, r);
        return entry?.state.read(r) === ModifiedFileEntryState.Modified && !entry?.isCurrentlyBeingModifiedBy.read(r);
      });
      await waitForState(modifiedObs, (state) => state === true);
      return true;
    }
  } finally {
    sessionStore.dispose();
  }
};
selectVendorDefaultModel_fn = async function(session) {
  const model = __privateGet(this, _zone).value.widget.chatWidget.input.selectedLanguageModel.get();
  if (model && !model.metadata.isDefaultForLocation[session.chatModel.initialLocation]) {
    const ids = await __privateGet(this, _languageModelService).selectLanguageModels({ vendor: model.metadata.vendor });
    for (const identifier of ids) {
      const candidate = __privateGet(this, _languageModelService).lookupLanguageModel(identifier);
      if (candidate?.isDefaultForLocation[session.chatModel.initialLocation]) {
        __privateGet(this, _zone).value.widget.chatWidget.input.setCurrentLanguageModel({ metadata: candidate, identifier });
        break;
      }
    }
  }
};
applyModelDefaults_fn = async function(session, sessionStore) {
  const userSelectedModel = __privateGet(InlineChatController, _userSelectedModel);
  const defaultModelSetting = __privateGet(this, _configurationService).getValue(InlineChatConfigKeys.DefaultModel);
  let modelApplied = false;
  if (userSelectedModel) {
    modelApplied = __privateGet(this, _zone).value.widget.chatWidget.input.switchModelByQualifiedName([userSelectedModel]);
    if (!modelApplied) {
      __privateSet(InlineChatController, _userSelectedModel, void 0);
    }
  }
  if (!modelApplied && defaultModelSetting) {
    modelApplied = __privateGet(this, _zone).value.widget.chatWidget.input.switchModelByQualifiedName([defaultModelSetting]);
    if (!modelApplied) {
      __privateGet(this, _logService).warn(`inlineChat.defaultModel setting value '${defaultModelSetting}' did not match any available model. Falling back to vendor default.`);
    }
  }
  if (!modelApplied) {
    await __privateMethod(this, _InlineChatController_instances, selectVendorDefaultModel_fn).call(this, session);
  }
  let initialModelId;
  sessionStore.add(autorun((r) => {
    const newModel = __privateGet(this, _zone).value.widget.chatWidget.input.selectedLanguageModel.read(r);
    if (!newModel) {
      return;
    }
    if (!initialModelId) {
      initialModelId = newModel.identifier;
      return;
    }
    if (initialModelId !== newModel.identifier) {
      __privateSet(InlineChatController, _userSelectedModel, ILanguageModelChatMetadata.asQualifiedName(newModel.metadata));
      initialModelId = newModel.identifier;
    }
  }));
};
InlineChatController.ID = INLINE_CHAT_ID;
/**
 * Stores the user's explicitly chosen model (qualified name) from a previous inline chat request in the same session.
 * When set, this takes priority over the inlineChat.defaultModel setting.
 */
__privateAdd(InlineChatController, _userSelectedModel);
InlineChatController = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotebookEditorService),
  __decorateParam(3, IInlineChatSessionService),
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IMarkerDecorationsService),
  __decorateParam(9, ILanguageModelsService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IChatEditingService),
  __decorateParam(12, IChatService)
], InlineChatController);
export {
  InlineChatController,
  InlineChatRunOptions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvYnJvd3Nlci9pbmxpbmVDaGF0Q29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHJlbmRlckFzUGxhaW50ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUsIHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJU2VsZWN0aW9uLCBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tYXJrZXJEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRMb2NhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRFZGl0aW5nU2VydmljZSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSwgSUNoYXRUb29sSW52b2NhdGlvbiwgVG9vbENvbmZpcm1LaW5kIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3IsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIGlzSUxhbmd1YWdlTW9kZWxDaGF0U2VsZWN0b3IgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBpc05vdGVib29rQ29udGFpbmluZ0NlbGxFZGl0b3IgYXMgaXNOb3RlYm9va1dpdGhDZWxsRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9ub3RlYm9va0VkaXRvci5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDVFhfSU5MSU5FX0NIQVRfRklMRV9CRUxPTkdTX1RPX0NIQVQsIENUWF9JTkxJTkVfQ0hBVF9URVJNSU5BVEVELCBDVFhfSU5MSU5FX0NIQVRfVklTSUJMRSwgSU5MSU5FX0NIQVRfSUQsIElubGluZUNoYXRDb25maWdLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2lubGluZUNoYXQuanMnO1xuaW1wb3J0IHsgSW5saW5lQ2hhdEFmZm9yZGFuY2UgfSBmcm9tICcuL2lubGluZUNoYXRBZmZvcmRhbmNlLmpzJztcbmltcG9ydCB7IGNvbnRpbnVlSW5QYW5lbENoYXQsIElJbmxpbmVDaGF0U2Vzc2lvbiwgSUlubGluZUNoYXRTZXNzaW9uU2VydmljZSwgcmVwaHJhc2VJbmxpbmVDaGF0IH0gZnJvbSAnLi9pbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yQmFzZWRJbmxpbmVDaGF0V2lkZ2V0IH0gZnJvbSAnLi9pbmxpbmVDaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElubGluZUNoYXRab25lV2lkZ2V0IH0gZnJvbSAnLi9pbmxpbmVDaGF0Wm9uZVdpZGdldC5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBJbmxpbmVDaGF0UnVuT3B0aW9ucyB7XG5cblx0aW5pdGlhbFNlbGVjdGlvbj86IElTZWxlY3Rpb247XG5cdGluaXRpYWxSYW5nZT86IElSYW5nZTtcblx0bWVzc2FnZT86IHN0cmluZztcblx0YXR0YWNobWVudHM/OiBVUklbXTtcblx0YXV0b1NlbmQ/OiBib29sZWFuO1xuXHRwb3NpdGlvbj86IElQb3NpdGlvbjtcblx0bW9kZWxTZWxlY3Rvcj86IElMYW5ndWFnZU1vZGVsQ2hhdFNlbGVjdG9yO1xuXHRyZXNvbHZlT25SZXNwb25zZT86IGJvb2xlYW47XG5cdGF0dGFjaERpYWdub3N0aWNzPzogYm9vbGVhbjtcblxuXHRzdGF0aWMgaXNJbmxpbmVDaGF0UnVuT3B0aW9ucyhvcHRpb25zOiB1bmtub3duKTogb3B0aW9ucyBpcyBJbmxpbmVDaGF0UnVuT3B0aW9ucyB7XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMgIT09ICdvYmplY3QnIHx8IG9wdGlvbnMgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGluaXRpYWxTZWxlY3Rpb24sIGluaXRpYWxSYW5nZSwgbWVzc2FnZSwgYXV0b1NlbmQsIHBvc2l0aW9uLCBhdHRhY2htZW50cywgbW9kZWxTZWxlY3RvciwgcmVzb2x2ZU9uUmVzcG9uc2UsIGF0dGFjaERpYWdub3N0aWNzIH0gPSA8SW5saW5lQ2hhdFJ1bk9wdGlvbnM+b3B0aW9ucztcblx0XHRpZiAoXG5cdFx0XHR0eXBlb2YgbWVzc2FnZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIG1lc3NhZ2UgIT09ICdzdHJpbmcnXG5cdFx0XHR8fCB0eXBlb2YgYXV0b1NlbmQgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBhdXRvU2VuZCAhPT0gJ2Jvb2xlYW4nXG5cdFx0XHR8fCB0eXBlb2YgaW5pdGlhbFJhbmdlICE9PSAndW5kZWZpbmVkJyAmJiAhUmFuZ2UuaXNJUmFuZ2UoaW5pdGlhbFJhbmdlKVxuXHRcdFx0fHwgdHlwZW9mIGluaXRpYWxTZWxlY3Rpb24gIT09ICd1bmRlZmluZWQnICYmICFTZWxlY3Rpb24uaXNJU2VsZWN0aW9uKGluaXRpYWxTZWxlY3Rpb24pXG5cdFx0XHR8fCB0eXBlb2YgcG9zaXRpb24gIT09ICd1bmRlZmluZWQnICYmICFQb3NpdGlvbi5pc0lQb3NpdGlvbihwb3NpdGlvbilcblx0XHRcdHx8IHR5cGVvZiBhdHRhY2htZW50cyAhPT0gJ3VuZGVmaW5lZCcgJiYgKCFBcnJheS5pc0FycmF5KGF0dGFjaG1lbnRzKSB8fCAhYXR0YWNobWVudHMuZXZlcnkoaXRlbSA9PiBpdGVtIGluc3RhbmNlb2YgVVJJKSlcblx0XHRcdHx8IHR5cGVvZiBtb2RlbFNlbGVjdG9yICE9PSAndW5kZWZpbmVkJyAmJiAhaXNJTGFuZ3VhZ2VNb2RlbENoYXRTZWxlY3Rvcihtb2RlbFNlbGVjdG9yKVxuXHRcdFx0fHwgdHlwZW9mIHJlc29sdmVPblJlc3BvbnNlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcmVzb2x2ZU9uUmVzcG9uc2UgIT09ICdib29sZWFuJ1xuXHRcdFx0fHwgdHlwZW9mIGF0dGFjaERpYWdub3N0aWNzICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgYXR0YWNoRGlhZ25vc3RpY3MgIT09ICdib29sZWFuJ1xuXHRcdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbi8vIFRPRE9AanJpZWtlbiBUSElTIHNob3VsZCBiZSBzaGFyZWQgd2l0aCB0aGUgY29kZSBpbiBNYWluVGhyZWFkRWRpdG9yc1xuZnVuY3Rpb24gZ2V0RWRpdG9ySWQoZWRpdG9yOiBJQ29kZUVkaXRvciwgbW9kZWw6IElUZXh0TW9kZWwpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7ZWRpdG9yLmdldElkKCl9LCR7bW9kZWwuaWR9YDtcbn1cblxuZXhwb3J0IGNsYXNzIElubGluZUNoYXRDb250cm9sbGVyIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gSU5MSU5FX0NIQVRfSUQ7XG5cblx0c3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogSW5saW5lQ2hhdENvbnRyb2xsZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPElubGluZUNoYXRDb250cm9sbGVyPihJbmxpbmVDaGF0Q29udHJvbGxlci5JRCkgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3JlcyB0aGUgdXNlcidzIGV4cGxpY2l0bHkgY2hvc2VuIG1vZGVsIChxdWFsaWZpZWQgbmFtZSkgZnJvbSBhIHByZXZpb3VzIGlubGluZSBjaGF0IHJlcXVlc3QgaW4gdGhlIHNhbWUgc2Vzc2lvbi5cblx0ICogV2hlbiBzZXQsIHRoaXMgdGFrZXMgcHJpb3JpdHkgb3ZlciB0aGUgaW5saW5lQ2hhdC5kZWZhdWx0TW9kZWwgc2V0dGluZy5cblx0ICovXG5cdHN0YXRpYyAjdXNlclNlbGVjdGVkTW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSAjc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHJlYWRvbmx5ICNpc0FjdGl2ZUNvbnRyb2xsZXIgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRyZWFkb25seSAjem9uZTogTGF6eTxJbmxpbmVDaGF0Wm9uZVdpZGdldD47XG5cdHJlYWRvbmx5IGlucHV0T3ZlcmxheVdpZGdldDogSW5saW5lQ2hhdEFmZm9yZGFuY2U7XG5cblx0cmVhZG9ubHkgI2N1cnJlbnRTZXNzaW9uOiBJT2JzZXJ2YWJsZTxJSW5saW5lQ2hhdFNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdHJlYWRvbmx5ICNlZGl0b3I6IElDb2RlRWRpdG9yO1xuXHRyZWFkb25seSAjaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdHJlYWRvbmx5ICNub3RlYm9va0VkaXRvclNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2U7XG5cdHJlYWRvbmx5ICNpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2U6IElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2U7XG5cdHJlYWRvbmx5ICNjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSAjZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2U7XG5cdHJlYWRvbmx5ICNtYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2U6IElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2U7XG5cdHJlYWRvbmx5ICNsYW5ndWFnZU1vZGVsU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZTtcblx0cmVhZG9ubHkgI2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRyZWFkb25seSAjY2hhdEVkaXRpbmdTZXJ2aWNlOiBJQ2hhdEVkaXRpbmdTZXJ2aWNlO1xuXHRyZWFkb25seSAjY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZTtcblxuXHRnZXQgd2lkZ2V0KCk6IEVkaXRvckJhc2VkSW5saW5lQ2hhdFdpZGdldCB7XG5cdFx0cmV0dXJuIHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0O1xuXHR9XG5cblx0Z2V0IGlzQWN0aXZlKCkge1xuXHRcdHJldHVybiBCb29sZWFuKHRoaXMuI2N1cnJlbnRTZXNzaW9uLmdldCgpKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU5vdGVib29rRWRpdG9yU2VydmljZSBub3RlYm9va0VkaXRvclNlcnZpY2U6IElOb3RlYm9va0VkaXRvclNlcnZpY2UsXG5cdFx0QElJbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UgaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlOiBJSW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASU1hcmtlckRlY29yYXRpb25zU2VydmljZSBtYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2U6IElNYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgbGFuZ3VhZ2VNb2RlbFNlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVkaXRpbmdTZXJ2aWNlIGNoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuI2VkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLiNpbnN0YVNlcnZpY2UgPSBpbnN0YVNlcnZpY2U7XG5cdFx0dGhpcy4jbm90ZWJvb2tFZGl0b3JTZXJ2aWNlID0gbm90ZWJvb2tFZGl0b3JTZXJ2aWNlO1xuXHRcdHRoaXMuI2lubGluZUNoYXRTZXNzaW9uU2VydmljZSA9IGlubGluZUNoYXRTZXNzaW9uU2VydmljZTtcblx0XHR0aGlzLiNjb25maWd1cmF0aW9uU2VydmljZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuI2VkaXRvclNlcnZpY2UgPSBlZGl0b3JTZXJ2aWNlO1xuXHRcdHRoaXMuI21hcmtlckRlY29yYXRpb25zU2VydmljZSA9IG1hcmtlckRlY29yYXRpb25zU2VydmljZTtcblx0XHR0aGlzLiNsYW5ndWFnZU1vZGVsU2VydmljZSA9IGxhbmd1YWdlTW9kZWxTZXJ2aWNlO1xuXHRcdHRoaXMuI2xvZ1NlcnZpY2UgPSBsb2dTZXJ2aWNlO1xuXHRcdHRoaXMuI2NoYXRFZGl0aW5nU2VydmljZSA9IGNoYXRFZGl0aW5nU2VydmljZTtcblx0XHR0aGlzLiNjaGF0U2VydmljZSA9IGNoYXRTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKTtcblxuXHRcdGNvbnN0IGN0eElubGluZUNoYXRWaXNpYmxlID0gQ1RYX0lOTElORV9DSEFUX1ZJU0lCTEUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjdHhGaWxlQmVsb25nc1RvQ2hhdCA9IENUWF9JTkxJTkVfQ0hBVF9GSUxFX0JFTE9OR1NfVE9fQ0hBVC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGN0eFRlcm1pbmF0ZWQgPSBDVFhfSU5MSU5FX0NIQVRfVEVSTUlOQVRFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGVib29rQWdlbnRDb25maWcgPSBvYnNlcnZhYmxlQ29uZmlnVmFsdWUoSW5saW5lQ2hhdENvbmZpZ0tleXMuTm90ZWJvb2tBZ2VudCwgZmFsc2UsIHRoaXMuI2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdC8vIFRyYWNrIHdoZXRoZXIgdGhlIGN1cnJlbnQgZWRpdG9yJ3MgZmlsZSBpcyBiZWluZyBlZGl0ZWQgYnkgYW55IGNoYXQgZWRpdGluZyBzZXNzaW9uXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvck9icy5tb2RlbC5yZWFkKHIpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRjdHhGaWxlQmVsb25nc1RvQ2hhdC5zZXQoZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuI2NoYXRFZGl0aW5nU2VydmljZS5lZGl0aW5nU2Vzc2lvbnNPYnMucmVhZChyKTtcblx0XHRcdGxldCBoYXNFZGl0cyA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXMgPSBzZXNzaW9uLmVudHJpZXMucmVhZChyKTtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWwoZW50cnkubW9kaWZpZWRVUkksIG1vZGVsLnVyaSkpIHtcblx0XHRcdFx0XHRcdGhhc0VkaXRzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGFzRWRpdHMpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y3R4RmlsZUJlbG9uZ3NUb0NoYXQuc2V0KGhhc0VkaXRzKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmlucHV0T3ZlcmxheVdpZGdldCA9IHRoaXMuI3N0b3JlLmFkZCh0aGlzLiNpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lQ2hhdEFmZm9yZGFuY2UsIHRoaXMuI2VkaXRvcikpO1xuXG5cdFx0dGhpcy4jem9uZSA9IG5ldyBMYXp5PElubGluZUNoYXRab25lV2lkZ2V0PigoKSA9PiB7XG5cblx0XHRcdGFzc2VydFR5cGUodGhpcy4jZWRpdG9yLmhhc01vZGVsKCksICdbSWxsZWdhbCBTdGF0ZV0gd2lkZ2V0IHNob3VsZCBvbmx5IGJlIGNyZWF0ZWQgd2hlbiB0aGUgZWRpdG9yIGhhcyBhIG1vZGVsJyk7XG5cblx0XHRcdGNvbnN0IGxvY2F0aW9uOiBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyA9IHtcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSxcblx0XHRcdFx0cmVzb2x2ZURhdGE6ICgpID0+IHtcblx0XHRcdFx0XHRhc3NlcnRUeXBlKHRoaXMuI2VkaXRvci5oYXNNb2RlbCgpKTtcblx0XHRcdFx0XHRjb25zdCB3aG9sZVJhbmdlID0gdGhpcy4jZWRpdG9yLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdGNvbnN0IGRvY3VtZW50ID0gdGhpcy4jZWRpdG9yLmdldE1vZGVsKCkudXJpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHR5cGU6IENoYXRBZ2VudExvY2F0aW9uLkVkaXRvcklubGluZSxcblx0XHRcdFx0XHRcdGlkOiBnZXRFZGl0b3JJZCh0aGlzLiNlZGl0b3IsIHRoaXMuI2VkaXRvci5nZXRNb2RlbCgpKSxcblx0XHRcdFx0XHRcdHNlbGVjdGlvbjogdGhpcy4jZWRpdG9yLmdldFNlbGVjdGlvbigpLFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnQsXG5cdFx0XHRcdFx0XHR3aG9sZVJhbmdlXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gaW5saW5lIGNoYXQgaW4gbm90ZWJvb2tzXG5cdFx0XHQvLyBjaGVjayBpZiB0aGlzIGVkaXRvciBpcyBwYXJ0IG9mIGEgbm90ZWJvb2sgZWRpdG9yXG5cdFx0XHQvLyBpZiBzbywgdXBkYXRlIHRoZSBsb2NhdGlvbiBhbmQgdXNlIHRoZSBub3RlYm9vayBzcGVjaWZpYyB3aWRnZXRcblx0XHRcdGNvbnN0IG5vdGVib29rRWRpdG9yID0gdGhpcy4jbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmdldE5vdGVib29rRm9yUG9zc2libGVDZWxsKHRoaXMuI2VkaXRvcik7XG5cdFx0XHRpZiAoISFub3RlYm9va0VkaXRvcikge1xuXHRcdFx0XHRsb2NhdGlvbi5sb2NhdGlvbiA9IENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rO1xuXHRcdFx0XHRpZiAobm90ZWJvb2tBZ2VudENvbmZpZy5nZXQoKSkge1xuXHRcdFx0XHRcdGxvY2F0aW9uLnJlc29sdmVEYXRhID0gKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZSh0aGlzLiNlZGl0b3IuaGFzTW9kZWwoKSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IENoYXRBZ2VudExvY2F0aW9uLk5vdGVib29rLFxuXHRcdFx0XHRcdFx0XHRzZXNzaW9uSW5wdXRVcmk6IHRoaXMuI2VkaXRvci5nZXRNb2RlbCgpLnVyaSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLiNpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lQ2hhdFpvbmVXaWRnZXQsXG5cdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZW5hYmxlV29ya2luZ1NldDogJ2ltcGxpY2l0Jyxcblx0XHRcdFx0XHRlbmFibGVJbXBsaWNpdENvbnRleHQ6IGZhbHNlLFxuXHRcdFx0XHRcdHJlbmRlcklucHV0T25Ub3A6IGZhbHNlLFxuXHRcdFx0XHRcdHJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQ6IHRydWUsXG5cdFx0XHRcdFx0ZmlsdGVyOiBpdGVtID0+IHtcblx0XHRcdFx0XHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiAhIWl0ZW0ubW9kZWwuaXNQZW5kaW5nQ29uZmlybWF0aW9uLmdldCgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bWVudXM6IHtcblx0XHRcdFx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2lubGluZUNoYXRXaWRnZXQnLFxuXHRcdFx0XHRcdFx0ZXhlY3V0ZVRvb2xiYXI6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lRXhlY3V0ZSxcblx0XHRcdFx0XHRcdGlucHV0U2lkZVRvb2xiYXI6IE1lbnVJZC5DaGF0RWRpdG9ySW5saW5lSW5wdXRTaWRlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZWZhdWx0TW9kZTogQ2hhdE1vZGUuQXNrXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgZWRpdG9yOiB0aGlzLiNlZGl0b3IsIG5vdGVib29rRWRpdG9yIH0sXG5cdFx0XHRcdCgpID0+IFByb21pc2UucmVzb2x2ZSgpLFxuXHRcdFx0KTtcblxuXHRcdFx0dGhpcy4jc3RvcmUuYWRkKHJlc3VsdCk7XG5cblx0XHRcdHJlc3VsdC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2lubGluZS1jaGF0LTInKTtcblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25zU2lnbmFsID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCBpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9ucyk7XG5cblx0XHR0aGlzLiNjdXJyZW50U2Vzc2lvbiA9IGRlcml2ZWQociA9PiB7XG5cdFx0XHRzZXNzaW9uc1NpZ25hbC5yZWFkKHIpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3JPYnMubW9kZWwucmVhZChyKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBtb2RlbCAmJiBpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UuZ2V0U2Vzc2lvbkJ5VGV4dE1vZGVsKG1vZGVsLnVyaSk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbiA/PyB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cblxuXHRcdGxldCBsYXN0U2Vzc2lvbjogSUlubGluZUNoYXRTZXNzaW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy4jY3VycmVudFNlc3Npb24ucmVhZChyKTtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLiNpc0FjdGl2ZUNvbnRyb2xsZXIuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRcdGlmIChsYXN0U2Vzc2lvbiAmJiAhbGFzdFNlc3Npb24uY2hhdE1vZGVsLmhhc1JlcXVlc3RzKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBsYXN0U2Vzc2lvbi5jaGF0TW9kZWwuaW5wdXRNb2RlbC5zdGF0ZS5yZWFkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0aWYgKCFzdGF0ZSB8fCAoIXN0YXRlLmlucHV0VGV4dCAmJiBzdGF0ZS5hdHRhY2htZW50cy5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRcdFx0XHRsYXN0U2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRsYXN0U2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsYXN0U2Vzc2lvbiA9IHNlc3Npb247XG5cblx0XHRcdGxldCBmb3VuZE9uZSA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgY29kZUVkaXRvclNlcnZpY2UubGlzdENvZGVFZGl0b3JzKCkpIHtcblx0XHRcdFx0Y29uc3QgY3RybCA9IElubGluZUNoYXRDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdFx0XHRpZiAoY3RybCAmJiBjdHJsLiNpc0FjdGl2ZUNvbnRyb2xsZXIucmVhZCh1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0Zm91bmRPbmUgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZvdW5kT25lICYmIGVkaXRvck9icy5pc0ZvY3VzZWQucmVhZChyKSkge1xuXHRcdFx0XHR0aGlzLiNpc0FjdGl2ZUNvbnRyb2xsZXIuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdmlzaWJsZVNlc3Npb25PYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUlubGluZUNoYXRTZXNzaW9uIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yT2JzLm1vZGVsLnJlYWQocik7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy4jY3VycmVudFNlc3Npb24ucmVhZChyKTtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gdGhpcy4jaXNBY3RpdmVDb250cm9sbGVyLnJlYWQocik7XG5cblx0XHRcdGlmICghc2Vzc2lvbiB8fCAhaXNBY3RpdmUgfHwgIW1vZGVsKSB7XG5cdFx0XHRcdHZpc2libGVTZXNzaW9uT2JzLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2aXNpYmxlU2Vzc2lvbk9icy5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBkZWZhdWx0UGxhY2Vob2xkZXJPYnMgPSB2aXNpYmxlU2Vzc2lvbk9icy5tYXAoKHNlc3Npb24sIHIpID0+IHtcblx0XHRcdHJldHVybiBzZXNzaW9uPy5pbml0aWFsU2VsZWN0aW9uLmlzRW1wdHkoKVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdwbGFjZWhvbGRlcicsIFwiR2VuZXJhdGUgY29kZVwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdwbGFjZWhvbGRlcldpdGhTZWxlY3Rpb24nLCBcIk1vZGlmeSBzZWxlY3RlZCBjb2RlXCIpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdmlzaWJsZVNlc3Npb25PYnMucmVhZChyKTtcblx0XHRcdGN0eFRlcm1pbmF0ZWQuc2V0KCEhc2Vzc2lvbj8udGVybWluYXRpb25TdGF0ZS5yZWFkKHIpKTtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuI3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXG5cdFx0XHQvLyBISURFL1NIT1dcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aXNpYmxlU2Vzc2lvbk9icy5yZWFkKHIpO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LmhpZGUoKTtcblx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LmNoYXRXaWRnZXQuc2V0TW9kZWwodW5kZWZpbmVkKTtcblx0XHRcdFx0ZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdGN0eElubGluZUNoYXRWaXNpYmxlLnJlc2V0KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdHhJbmxpbmVDaGF0VmlzaWJsZS5zZXQodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuc2V0TW9kZWwoc2Vzc2lvbi5jaGF0TW9kZWwpO1xuXHRcdFx0XHRpZiAoIXRoaXMuI3pvbmUudmFsdWUucG9zaXRpb24pIHtcblx0XHRcdFx0XHR0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LnNldElucHV0UGxhY2Vob2xkZXIoZGVmYXVsdFBsYWNlaG9sZGVyT2JzLnJlYWQocikpO1xuXHRcdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuaW5wdXQucmVuZGVyQXR0YWNoZWRDb250ZXh0KCk7IC8vIFRPRE8gLSBmaWdodHMgbGF5b3V0IGJ1Z1xuXHRcdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUuc2hvdyhzZXNzaW9uLmluaXRpYWxQb3NpdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS5yZXZlYWwodGhpcy4jem9uZS52YWx1ZS5wb3NpdGlvbiEpO1xuXHRcdFx0XHR0aGlzLiN6b25lLnZhbHVlLndpZGdldC5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG8tYXBwcm92ZSB0b29sIGNvbmZpcm1hdGlvbnMgZm9yIGlubGluZSBjaGF0LiBUaGUgdXNlciBpbXBsaWNpdGx5XG5cdFx0Ly8gY29uc2VudHMgdG8gZWRpdGluZyB0aGUgY3VycmVudCBmaWxlIGJ5IGludm9raW5nIGlubGluZSBjaGF0IG9uIGl0LFxuXHRcdC8vIGV2ZW4gaWYgdGhlIGZpbGUgcXVhbGlmaWVzIGFzIGEgc2Vuc2l0aXZlIGZpbGUuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy4jY3VycmVudFNlc3Npb24ucmVhZChyKTtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IHNlc3Npb24uY2hhdE1vZGVsLmxhc3RSZXF1ZXN0T2JzLnJlYWQocik7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGxhc3RSZXF1ZXN0Py5yZXNwb25zZTtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSByZXNwb25zZT8uaXNQZW5kaW5nQ29uZmlybWF0aW9uLnJlYWQocik7XG5cdFx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0XHR0aGlzLiNsb2dTZXJ2aWNlLmluZm8oYFtJbmxpbmVDaGF0XSBhdXRvLWFwcHJvdmluZzogJHtwZW5kaW5nLmRldGFpbCA/PyAndW5rbm93bid9YCk7XG5cdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiByZXNwb25zZSEucmVzcG9uc2UudmFsdWUpIHtcblx0XHRcdFx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nKSB7XG5cdFx0XHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKHBhcnQgYXMgSUNoYXRUb29sSW52b2NhdGlvbiwgeyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkLCByZWFzb246ICdpbmxpbmVDaGF0JyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aXNpYmxlU2Vzc2lvbk9icy5yZWFkKHIpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0Y29uc3QgZW50cmllcyA9IHNlc3Npb24uZWRpdGluZ1Nlc3Npb24uZW50cmllcy5yZWFkKHIpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uQ2VsbFVyaSA9IENlbGxVcmkucGFyc2Uoc2Vzc2lvbi51cmkpO1xuXHRcdFx0XHRjb25zdCBvdGhlckVudHJpZXMgPSBlbnRyaWVzLmZpbHRlcihlbnRyeSA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWwoZW50cnkubW9kaWZpZWRVUkksIHNlc3Npb24udXJpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBEb24ndCBjb3VudCBub3RlYm9va3MgdGhhdCBpbmNsdWRlIHRoZSBzZXNzaW9uJ3MgY2VsbFxuXHRcdFx0XHRcdGlmICghIXNlc3Npb25DZWxsVXJpICYmIGlzRXF1YWwoc2Vzc2lvbkNlbGxVcmkubm90ZWJvb2ssIGVudHJ5Lm1vZGlmaWVkVVJJKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2Ygb3RoZXJFbnRyaWVzKSB7XG5cdFx0XHRcdFx0Ly8gT1BFTiBvdGhlciBtb2RpZmllZCBmaWxlcyBpbiBzaWRlIGdyb3VwLiBUaGlzIGlzIGEgd29ya2Fyb3VuZCwgdGVtcC1zb2x1dGlvbiB1bnRpbCB3ZSBoYXZlIG5vIG1vcmUgYmFja2VuZFxuXHRcdFx0XHRcdC8vIHRoYXQgbW9kaWZpZXMgb3RoZXIgZmlsZXNcblx0XHRcdFx0XHR0aGlzLiNlZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZW50cnkubW9kaWZpZWRVUkkgfSwgU0lERV9HUk9VUCkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbGFzdFJlc3BvbnNlT2JzID0gdmlzaWJsZVNlc3Npb25PYnMubWFwKChzZXNzaW9uLCByKSA9PiB7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHNlc3Npb24uY2hhdE1vZGVsLm9uRGlkQ2hhbmdlLCAoKSA9PiBzZXNzaW9uLmNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKSkucmVhZChyKTtcblx0XHRcdHJldHVybiBsYXN0UmVxdWVzdD8ucmVzcG9uc2U7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsYXN0UmVzcG9uc2VQcm9ncmVzc09icyA9IGxhc3RSZXNwb25zZU9icy5tYXAoKHJlc3BvbnNlLCByKSA9PiB7XG5cdFx0XHRpZiAoIXJlc3BvbnNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHJlc3BvbnNlLm9uRGlkQ2hhbmdlLCAoKSA9PiByZXNwb25zZS5yZXNwb25zZS52YWx1ZS5maW5kTGFzdChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3Byb2dyZXNzTWVzc2FnZScpKS5yZWFkKHIpO1xuXHRcdH0pO1xuXG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB2aXNpYmxlU2Vzc2lvbk9icy5yZWFkKHIpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBsYXN0UmVzcG9uc2VPYnMucmVhZChyKTtcblx0XHRcdGNvbnN0IHRlcm1pbmF0aW9uU3RhdGUgPSBzZXNzaW9uPy50ZXJtaW5hdGlvblN0YXRlLnJlYWQocik7XG5cblx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LndpZGdldC51cGRhdGVJbmZvKCcnKTtcblxuXHRcdFx0aWYgKCFyZXNwb25zZT8uaXNJblByb2dyZXNzLnJlYWQocikpIHtcblxuXHRcdFx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy5zdGF0dXMuc2V0KHJlc3BvbnNlPy5yZXN1bHQ/LmRldGFpbHMgPz8gJycsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0aWYgKHJlc3BvbnNlPy5yZXN1bHQ/LmVycm9yRGV0YWlscykge1xuXHRcdFx0XHRcdC8vIEVSUk9SIGNhc2Vcblx0XHRcdFx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy53aWRnZXQudXBkYXRlSW5mbyhgJChlcnJvcikgJHtyZXNwb25zZS5yZXN1bHQuZXJyb3JEZXRhaWxzLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdFx0YWxlcnQocmVzcG9uc2UucmVzdWx0LmVycm9yRGV0YWlscy5tZXNzYWdlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0ZXJtaW5hdGlvblN0YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8uc2hvd1Rlcm1pbmF0aW9uQ2FyZCh0ZXJtaW5hdGlvblN0YXRlLCB0aGlzLiNpbnN0YVNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCF0ZXJtaW5hdGlvblN0YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8uaGlkZVRlcm1pbmF0aW9uQ2FyZCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gbm8gcmVzcG9uc2Ugb3Igbm90IGluIHByb2dyZXNzXG5cdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LndpZGdldC5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3JlcXVlc3QtaW4tcHJvZ3Jlc3MnLCBmYWxzZSk7XG5cdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LndpZGdldC5jaGF0V2lkZ2V0LnNldElucHV0UGxhY2Vob2xkZXIoZGVmYXVsdFBsYWNlaG9sZGVyT2JzLnJlYWQocikpO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLiN6b25lLnJhd1ZhbHVlPy53aWRnZXQuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdyZXF1ZXN0LWluLXByb2dyZXNzJywgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LnN0YXR1cy5zZXQoJycsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGxldCBwbGFjZWhvbGRlciA9IHJlc3BvbnNlLnJlcXVlc3Q/Lm1lc3NhZ2UudGV4dDtcblx0XHRcdFx0Y29uc3QgbGFzdFByb2dyZXNzID0gbGFzdFJlc3BvbnNlUHJvZ3Jlc3NPYnMucmVhZChyKTtcblx0XHRcdFx0aWYgKGxhc3RQcm9ncmVzcykge1xuXHRcdFx0XHRcdHBsYWNlaG9sZGVyID0gcmVuZGVyQXNQbGFpbnRleHQobGFzdFByb2dyZXNzLmNvbnRlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LndpZGdldC5jaGF0V2lkZ2V0LnNldElucHV0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXIgfHwgbG9jYWxpemUoJ2xvYWRpbmcnLCBcIldvcmtpbmcuLi5cIikpO1xuXHRcdFx0fVxuXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy4jc3RvcmUuYWRkKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdmlzaWJsZVNlc3Npb25PYnMucmVhZChyKTtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbi5lZGl0aW5nU2Vzc2lvbi5yZWFkRW50cnkoc2Vzc2lvbi51cmksIHIpO1xuXHRcdFx0aWYgKGVudHJ5Py5zdGF0ZS5yZWFkKHIpID09PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKSB7XG5cdFx0XHRcdGVudHJ5Py5lbmFibGVSZXZpZXdNb2RlVW50aWxTZXR0bGVkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cblx0XHR0aGlzLiNzdG9yZS5hZGQoYXV0b3J1bihyID0+IHtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHZpc2libGVTZXNzaW9uT2JzLnJlYWQocik7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHNlc3Npb24/LmVkaXRpbmdTZXNzaW9uLnJlYWRFbnRyeShzZXNzaW9uLnVyaSwgcik7XG5cblx0XHRcdC8vIG1ha2Ugc3VyZSB0aGVyZSBpcyBhbiBlZGl0b3IgaW50ZWdyYXRpb25cblx0XHRcdGNvbnN0IHBhbmUgPSB0aGlzLiNlZGl0b3JTZXJ2aWNlLnZpc2libGVFZGl0b3JQYW5lcy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuZ2V0Q29udHJvbCgpID09PSB0aGlzLiNlZGl0b3IgfHwgaXNOb3RlYm9va1dpdGhDZWxsRWRpdG9yKGNhbmRpZGF0ZSwgdGhpcy4jZWRpdG9yKSk7XG5cdFx0XHRpZiAocGFuZSAmJiBlbnRyeSkge1xuXHRcdFx0XHRlbnRyeT8uZ2V0RWRpdG9ySW50ZWdyYXRpb24ocGFuZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIG1ha2Ugc3VyZSB0aGUgWk9ORSBpc24ndCBpbmJldHdlZW4gYSBkaWZmIGFuZCBtb3ZlIGFib3ZlIGlmIHNvXG5cdFx0XHRpZiAoZW50cnk/LmRpZmZJbmZvICYmIHRoaXMuI3pvbmUucmF3VmFsdWU/LnBvc2l0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IHsgcG9zaXRpb24gfSA9IHRoaXMuI3pvbmUucmF3VmFsdWU7XG5cdFx0XHRcdGNvbnN0IGRpZmYgPSBlbnRyeS5kaWZmSW5mby5yZWFkKHIpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgY2hhbmdlIG9mIGRpZmYuY2hhbmdlcykge1xuXHRcdFx0XHRcdGlmIChjaGFuZ2UubW9kaWZpZWQuY29udGFpbnMocG9zaXRpb24ubGluZU51bWJlcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LnVwZGF0ZVBvc2l0aW9uQW5kSGVpZ2h0KG5ldyBQb3NpdGlvbihjaGFuZ2UubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyIC0gMSwgMSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLiNzdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXRXaWRnZXRQb3NpdGlvbigpOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuI3pvbmUucmF3VmFsdWU/LnBvc2l0aW9uO1xuXHR9XG5cblx0Zm9jdXMoKSB7XG5cdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRhc3luYyBydW4oYXJnPzogSW5saW5lQ2hhdFJ1bk9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRhc3NlcnRUeXBlKHRoaXMuI2VkaXRvci5oYXNNb2RlbCgpKTtcblx0XHRjb25zdCB1cmkgPSB0aGlzLiNlZGl0b3IuZ2V0TW9kZWwoKS51cmk7XG5cblx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb24gPSB0aGlzLiNpbmxpbmVDaGF0U2Vzc2lvblNlcnZpY2UuZ2V0U2Vzc2lvbkJ5VGV4dE1vZGVsKHVyaSk7XG5cdFx0aWYgKGV4aXN0aW5nU2Vzc2lvbikge1xuXHRcdFx0YXdhaXQgZXhpc3RpbmdTZXNzaW9uLmVkaXRpbmdTZXNzaW9uLmFjY2VwdCgpO1xuXHRcdFx0ZXhpc3RpbmdTZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHR0aGlzLiNpc0FjdGl2ZUNvbnRyb2xsZXIuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy4jaW5saW5lQ2hhdFNlc3Npb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24odGhpcy4jZWRpdG9yKTtcblx0XHRyZXR1cm4gdGhpcy4jcnVuWm9uZShzZXNzaW9uLCBhcmcpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFpvbmUgbW9kZTogdXNlIHRoZSBmdWxsIHpvbmUgd2lkZ2V0IGFuZCBjaGF0IHdpZGdldCBmb3IgcmVxdWVzdCBzdWJtaXNzaW9uLlxuXHQgKi9cblx0YXN5bmMgI3J1blpvbmUoc2Vzc2lvbjogSUlubGluZUNoYXRTZXNzaW9uLCBhcmc/OiBJbmxpbmVDaGF0UnVuT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGFzc2VydFR5cGUodGhpcy4jZWRpdG9yLmhhc01vZGVsKCkpO1xuXHRcdGNvbnN0IHVyaSA9IHRoaXMuI2VkaXRvci5nZXRNb2RlbCgpLnVyaTtcblxuXHRcdC8vIFN0b3JlIGZvciB0cmFja2luZyBtb2RlbCBjaGFuZ2VzIGR1cmluZyB0aGlzIHNlc3Npb25cblx0XHRjb25zdCBzZXNzaW9uU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy4jYXBwbHlNb2RlbERlZmF1bHRzKHNlc3Npb24sIHNlc3Npb25TdG9yZSk7XG5cblx0XHRcdGlmIChhcmcpIHtcblx0XHRcdFx0YXJnLmF0dGFjaERpYWdub3N0aWNzID8/PSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBREQgZGlhZ25vc3RpY3MgKG9ubHkgd2hlbiBleHBsaWNpdGx5IHJlcXVlc3RlZClcblx0XHRcdGlmIChhcmc/LmF0dGFjaERpYWdub3N0aWNzKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJpZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtyYW5nZSwgbWFya2VyXSBvZiB0aGlzLiNtYXJrZXJEZWNvcmF0aW9uc1NlcnZpY2UuZ2V0TGl2ZU1hcmtlcnModXJpKSkge1xuXHRcdFx0XHRcdGlmIChyYW5nZS5pbnRlcnNlY3RSYW5nZXModGhpcy4jZWRpdG9yLmdldFNlbGVjdGlvbigpKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlsdGVyID0gSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YS5mcm9tTWFya2VyKG1hcmtlcik7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goSURpYWdub3N0aWNWYXJpYWJsZUVudHJ5RmlsdGVyRGF0YS50b0VudHJ5KGZpbHRlcikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZW50cmllcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi5lbnRyaWVzKTtcblx0XHRcdFx0XHRjb25zdCBtc2cgPSBlbnRyaWVzLmxlbmd0aCA+IDFcblx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2ZpeE4nLCBcIkZpeCB0aGUgYXR0YWNoZWQgcHJvYmxlbXNcIilcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2ZpeDEnLCBcIkZpeCB0aGUgYXR0YWNoZWQgcHJvYmxlbVwiKTtcblx0XHRcdFx0XHR0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmlucHV0LnNldFZhbHVlKG1zZywgdHJ1ZSk7XG5cdFx0XHRcdFx0YXJnLm1lc3NhZ2UgPSBtc2c7XG5cdFx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5pbnB1dEVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiwgMSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGFyZ3Ncblx0XHRcdGlmIChhcmcgJiYgSW5saW5lQ2hhdFJ1bk9wdGlvbnMuaXNJbmxpbmVDaGF0UnVuT3B0aW9ucyhhcmcpKSB7XG5cdFx0XHRcdGlmIChhcmcuaW5pdGlhbFJhbmdlKSB7XG5cdFx0XHRcdFx0dGhpcy4jZWRpdG9yLnJldmVhbFJhbmdlKGFyZy5pbml0aWFsUmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhcmcuaW5pdGlhbFNlbGVjdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuI2VkaXRvci5zZXRTZWxlY3Rpb24oYXJnLmluaXRpYWxTZWxlY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhcmcuYXR0YWNobWVudHMpIHtcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChhcmcuYXR0YWNobWVudHMubWFwKGFzeW5jIGF0dGFjaG1lbnQgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkRmlsZShhdHRhY2htZW50KTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdFx0ZGVsZXRlIGFyZy5hdHRhY2htZW50cztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYXJnLm1vZGVsU2VsZWN0b3IpIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IChhd2FpdCB0aGlzLiNsYW5ndWFnZU1vZGVsU2VydmljZS5zZWxlY3RMYW5ndWFnZU1vZGVscyhhcmcubW9kZWxTZWxlY3RvcikpLnNvcnQoKS5hdCgwKTtcblx0XHRcdFx0XHRpZiAoIWlkKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGxhbmd1YWdlIG1vZGVscyBmb3VuZCBtYXRjaGluZyBzZWxlY3RvcjogJHtKU09OLnN0cmluZ2lmeShhcmcubW9kZWxTZWxlY3Rvcil9LmApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuI2xhbmd1YWdlTW9kZWxTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwoaWQpO1xuXHRcdFx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgbm90IGxvYWRlZDogJHtpZH0uYCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuaW5wdXQuc2V0Q3VycmVudExhbmd1YWdlTW9kZWwoeyBtZXRhZGF0YTogbW9kZWwsIGlkZW50aWZpZXI6IGlkIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhcmcubWVzc2FnZSkge1xuXHRcdFx0XHRcdHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuc2V0SW5wdXQoYXJnLm1lc3NhZ2UpO1xuXHRcdFx0XHRcdGlmIChhcmcuYXV0b1NlbmQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuI3pvbmUudmFsdWUud2lkZ2V0LmNoYXRXaWRnZXQuYWNjZXB0SW5wdXQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKCFhcmc/LnJlc29sdmVPblJlc3BvbnNlKSB7XG5cdFx0XHRcdC8vIERFRkFVTFQ6IHdhaXQgZm9yIHRoZSBzZXNzaW9uIHRvIGJlIGFjY2VwdGVkIG9yIHJlamVjdGVkXG5cdFx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShzZXNzaW9uLmVkaXRpbmdTZXNzaW9uLm9uRGlkRGlzcG9zZSk7XG5cdFx0XHRcdGNvbnN0IHJlamVjdGVkID0gc2Vzc2lvbi5lZGl0aW5nU2Vzc2lvbi5nZXRFbnRyeSh1cmkpPy5zdGF0ZS5nZXQoKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5SZWplY3RlZDtcblx0XHRcdFx0cmV0dXJuICFyZWplY3RlZDtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gcmVzb2x2ZU9uUmVzcG9uc2U6IE9OTFkgd2FpdCBmb3IgdGhlIGZpbGUgdG8gYmUgbW9kaWZpZWRcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRPYnMgPSBkZXJpdmVkKHIgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gc2Vzc2lvbi5lZGl0aW5nU2Vzc2lvbi5yZWFkRW50cnkodXJpLCByKTtcblx0XHRcdFx0XHRyZXR1cm4gZW50cnk/LnN0YXRlLnJlYWQocikgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQgJiYgIWVudHJ5Py5pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeS5yZWFkKHIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgd2FpdEZvclN0YXRlKG1vZGlmaWVkT2JzLCBzdGF0ZSA9PiBzdGF0ZSA9PT0gdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzZXNzaW9uU3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFjY2VwdFNlc3Npb24oKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuI2N1cnJlbnRTZXNzaW9uLmdldCgpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBzZXNzaW9uLmVkaXRpbmdTZXNzaW9uLmFjY2VwdCgpO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVqZWN0U2Vzc2lvbigpIHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy4jY3VycmVudFNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuI2NoYXRTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihzZXNzaW9uLmNoYXRNb2RlbC5zZXNzaW9uUmVzb3VyY2UsICdpbmxpbmVDaGF0UmVqZWN0Jyk7XG5cdFx0YXdhaXQgc2Vzc2lvbi5lZGl0aW5nU2Vzc2lvbi5yZWplY3QoKTtcblx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGFzeW5jIGNvbnRpbnVlU2Vzc2lvbkluQ2hhdCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy4jY3VycmVudFNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy4jaW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNvbnRpbnVlSW5QYW5lbENoYXQsIHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgcmVwaHJhc2VTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLiNjdXJyZW50U2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDbGVhciB0ZXJtaW5hdGlvbiBzdGF0ZSBhbmQgcmVzdG9yZSBpbnB1dCB0ZXh0IGluIHRoZSBjaGF0IHdpZGdldC5cblx0XHQvLyBUaGUgYXV0b3J1biB3YXRjaGluZyB0ZXJtaW5hdGlvblN0YXRlIHdpbGwgZmxpcCB0aGUgY2FyZCBiYWNrIGF1dG9tYXRpY2FsbHkuXG5cdFx0Y29uc3QgcmVxdWVzdFRleHQgPSB0aGlzLiNpbnN0YVNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVwaHJhc2VJbmxpbmVDaGF0LCBzZXNzaW9uKTtcblx0XHRpZiAocmVxdWVzdFRleHQpIHtcblx0XHRcdHRoaXMuI3pvbmUucmF3VmFsdWU/LndpZGdldC5jaGF0V2lkZ2V0LnNldElucHV0KHJlcXVlc3RUZXh0KTtcblx0XHR9XG5cdFx0dGhpcy4jem9uZS5yYXdWYWx1ZT8ud2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRhc3luYyAjc2VsZWN0VmVuZG9yRGVmYXVsdE1vZGVsKHNlc3Npb246IElJbmxpbmVDaGF0U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5pbnB1dC5zZWxlY3RlZExhbmd1YWdlTW9kZWwuZ2V0KCk7XG5cdFx0aWYgKG1vZGVsICYmICFtb2RlbC5tZXRhZGF0YS5pc0RlZmF1bHRGb3JMb2NhdGlvbltzZXNzaW9uLmNoYXRNb2RlbC5pbml0aWFsTG9jYXRpb25dKSB7XG5cdFx0XHRjb25zdCBpZHMgPSBhd2FpdCB0aGlzLiNsYW5ndWFnZU1vZGVsU2VydmljZS5zZWxlY3RMYW5ndWFnZU1vZGVscyh7IHZlbmRvcjogbW9kZWwubWV0YWRhdGEudmVuZG9yIH0pO1xuXHRcdFx0Zm9yIChjb25zdCBpZGVudGlmaWVyIG9mIGlkcykge1xuXHRcdFx0XHRjb25zdCBjYW5kaWRhdGUgPSB0aGlzLiNsYW5ndWFnZU1vZGVsU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKGlkZW50aWZpZXIpO1xuXHRcdFx0XHRpZiAoY2FuZGlkYXRlPy5pc0RlZmF1bHRGb3JMb2NhdGlvbltzZXNzaW9uLmNoYXRNb2RlbC5pbml0aWFsTG9jYXRpb25dKSB7XG5cdFx0XHRcdFx0dGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5pbnB1dC5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbCh7IG1ldGFkYXRhOiBjYW5kaWRhdGUsIGlkZW50aWZpZXIgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQXBwbGllcyBtb2RlbCBkZWZhdWx0cyBiYXNlZCBvbiBzZXR0aW5ncyBhbmQgdHJhY2tzIHVzZXIgbW9kZWwgY2hhbmdlcy5cblx0ICogUHJpb3JpdGl6YXRpb246IHVzZXIgc2Vzc2lvbiBjaG9pY2UgPiBpbmxpbmVDaGF0LmRlZmF1bHRNb2RlbCBzZXR0aW5nID4gdmVuZG9yIGRlZmF1bHRcblx0ICovXG5cdGFzeW5jICNhcHBseU1vZGVsRGVmYXVsdHMoc2Vzc2lvbjogSUlubGluZUNoYXRTZXNzaW9uLCBzZXNzaW9uU3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVzZXJTZWxlY3RlZE1vZGVsID0gSW5saW5lQ2hhdENvbnRyb2xsZXIuI3VzZXJTZWxlY3RlZE1vZGVsO1xuXHRcdGNvbnN0IGRlZmF1bHRNb2RlbFNldHRpbmcgPSB0aGlzLiNjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KElubGluZUNoYXRDb25maWdLZXlzLkRlZmF1bHRNb2RlbCk7XG5cblx0XHRsZXQgbW9kZWxBcHBsaWVkID0gZmFsc2U7XG5cblx0XHQvLyAxLiBUcnkgdXNlcidzIGV4cGxpY2l0bHkgY2hvc2VuIG1vZGVsIGZyb20gYSBwcmV2aW91cyBpbmxpbmUgY2hhdCBpbiB0aGUgc2FtZSBzZXNzaW9uXG5cdFx0aWYgKHVzZXJTZWxlY3RlZE1vZGVsKSB7XG5cdFx0XHRtb2RlbEFwcGxpZWQgPSB0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmlucHV0LnN3aXRjaE1vZGVsQnlRdWFsaWZpZWROYW1lKFt1c2VyU2VsZWN0ZWRNb2RlbF0pO1xuXHRcdFx0aWYgKCFtb2RlbEFwcGxpZWQpIHtcblx0XHRcdFx0Ly8gVXNlcidzIHByZXZpb3VzbHkgc2VsZWN0ZWQgbW9kZWwgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZSwgY2xlYXIgaXRcblx0XHRcdFx0SW5saW5lQ2hhdENvbnRyb2xsZXIuI3VzZXJTZWxlY3RlZE1vZGVsID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIDIuIFRyeSBpbmxpbmVDaGF0LmRlZmF1bHRNb2RlbCBzZXR0aW5nXG5cdFx0aWYgKCFtb2RlbEFwcGxpZWQgJiYgZGVmYXVsdE1vZGVsU2V0dGluZykge1xuXHRcdFx0bW9kZWxBcHBsaWVkID0gdGhpcy4jem9uZS52YWx1ZS53aWRnZXQuY2hhdFdpZGdldC5pbnB1dC5zd2l0Y2hNb2RlbEJ5UXVhbGlmaWVkTmFtZShbZGVmYXVsdE1vZGVsU2V0dGluZ10pO1xuXHRcdFx0aWYgKCFtb2RlbEFwcGxpZWQpIHtcblx0XHRcdFx0dGhpcy4jbG9nU2VydmljZS53YXJuKGBpbmxpbmVDaGF0LmRlZmF1bHRNb2RlbCBzZXR0aW5nIHZhbHVlICcke2RlZmF1bHRNb2RlbFNldHRpbmd9JyBkaWQgbm90IG1hdGNoIGFueSBhdmFpbGFibGUgbW9kZWwuIEZhbGxpbmcgYmFjayB0byB2ZW5kb3IgZGVmYXVsdC5gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAzLiBGYWxsIGJhY2sgdG8gdmVuZG9yIGRlZmF1bHRcblx0XHRpZiAoIW1vZGVsQXBwbGllZCkge1xuXHRcdFx0YXdhaXQgdGhpcy4jc2VsZWN0VmVuZG9yRGVmYXVsdE1vZGVsKHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdC8vIFRyYWNrIG1vZGVsIGNoYW5nZXMgLSBzdG9yZSB1c2VyJ3MgZXhwbGljaXQgY2hvaWNlIGluIHRoZSBnaXZlbiBzZXNzaW9ucy5cblx0XHQvLyBOT1RFOiBUaGlzIGN1cnJlbnRseSBkZXRlY3RzIGFueSBtb2RlbCBjaGFuZ2UsIG5vdCBqdXN0IHVzZXItaW5pdGlhdGVkIG9uZXMuXG5cdFx0bGV0IGluaXRpYWxNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0c2Vzc2lvblN0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3QgbmV3TW9kZWwgPSB0aGlzLiN6b25lLnZhbHVlLndpZGdldC5jaGF0V2lkZ2V0LmlucHV0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5yZWFkKHIpO1xuXHRcdFx0aWYgKCFuZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWluaXRpYWxNb2RlbElkKSB7XG5cdFx0XHRcdGluaXRpYWxNb2RlbElkID0gbmV3TW9kZWwuaWRlbnRpZmllcjtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluaXRpYWxNb2RlbElkICE9PSBuZXdNb2RlbC5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdC8vIFVzZXIgZXhwbGljaXRseSBjaGFuZ2VkIG1vZGVsLCBzdG9yZSB0aGVpciBjaG9pY2UgYXMgcXVhbGlmaWVkIG5hbWVcblx0XHRcdFx0SW5saW5lQ2hhdENvbnRyb2xsZXIuI3VzZXJTZWxlY3RlZE1vZGVsID0gSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuYXNRdWFsaWZpZWROYW1lKG5ld01vZGVsLm1ldGFkYXRhKTtcblx0XHRcdFx0aW5pdGlhbE1vZGVsSWQgPSBuZXdNb2RlbC5pZGVudGlmaWVyO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBO0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVk7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLFNBQXNCLHFCQUFxQiwyQkFBMkIsaUJBQWlCLG9CQUFvQjtBQUM3SCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBRXBCLFNBQVMsNEJB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
