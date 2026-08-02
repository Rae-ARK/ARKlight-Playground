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
import "./media/chat.css";
import "./media/chatAgentHover.css";
import "./media/chatViewWelcome.css";
import * as dom from "../../../../../base/browser/dom.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { disposableTimeout, timeout } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { hash } from "../../../../../base/common/hash.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableStore, MutableDisposable, thenIfNotDisposed } from "../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { filter } from "../../../../../base/common/objects.js";
import { autorun, derived, observableFromEvent, observableValue } from "../../../../../base/common/observable.js";
import { extUri, isEqual } from "../../../../../base/common/resources.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { ChatPerfMark, clearChatMarks, markChat } from "../../common/chatPerf.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { localize } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { bindContextKey } from "../../../../../platform/observable/common/platformObservableUtils.js";
import product from "../../../../../platform/product/common/product.js";
import { Progress } from "../../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ChatEntitlementContextKeys, IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { checkModeOption } from "../../common/chat.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { applyingChatEditsFailedContextKey, decidedChatEditingResourceContextKey, hasAppliedChatEditsContextKey, hasUndecidedChatEditingResourceContextKey, IChatEditingService, inChatEditingSessionContextKey, ModifiedFileEntryState } from "../../common/editing/chatEditingService.js";
import { IChatLayoutService } from "../../common/widget/chatLayoutService.js";
import { logChangesToStateModel } from "../../common/model/chatModel.js";
import { ChatMode, getModeNameForTelemetry } from "../../common/chatModes.js";
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestDynamicVariablePart, ChatRequestSlashCommandPart, ChatRequestSlashPromptPart, ChatRequestToolPart, ChatRequestToolSetPart, chatSubcommandLeader, formatChatQuestion, IParsedChatRequest } from "../../common/requestParser/chatParserTypes.js";
import { ChatRequestParser } from "../../common/requestParser/chatRequestParser.js";
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from "../attachments/chatVariables.js";
import { ChatRequestQueueKind, ChatSendResult, IChatService } from "../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType } from "../../common/chatSessionsService.js";
import { IChatSlashCommandService } from "../../common/participants/chatSlashCommands.js";
import { IChatTodoListService } from "../../common/tools/chatTodoListService.js";
import { ChatRequestVariableSet, isPromptFileVariableEntry, isPromptTextVariableEntry, isWorkspaceVariableEntry, PromptFileVariableKind, toPromptFileVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { ChatViewModel, isRequestVM, isResponseVM } from "../../common/model/chatViewModel.js";
import { ChatMessageRole } from "../../common/languageModels.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, ThinkingDisplayMode } from "../../common/constants.js";
import { IChatGoalSummaryService } from "../chatGoalSummaryService.js";
import { ILanguageModelToolsService, isToolSet } from "../../common/tools/languageModelToolsService.js";
import { IPromptsService } from "../../common/promptSyntax/service/promptsService.js";
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, handleModeSwitch } from "../actions/chatActions.js";
import { IChatAccessibilityService, IChatWidgetService, isIChatResourceViewContext, isIChatViewViewContext } from "../chat.js";
import { IChatAttachmentResolveService } from "../attachments/chatAttachmentResolveService.js";
import { ChatDynamicVariableModel } from "../attachments/chatDynamicVariables.js";
import { ChatSuggestNextWidget } from "./chatContentParts/chatSuggestNextWidget.js";
import { ChatInputPart } from "./input/chatInputPart.js";
import { ChatListWidget } from "./chatListWidget.js";
import { ChatEditorOptions } from "./chatOptions.js";
import { ChatViewWelcomePart } from "../viewsWelcome/chatViewWelcomeController.js";
import { IChatTipService } from "../chatTipService.js";
import { ChatTipContentPart } from "./chatContentParts/chatTipContentPart.js";
import { ChatContentMarkdownRenderer } from "./chatContentMarkdownRenderer.js";
import { IAgentSessionsService } from "../agentSessions/agentSessionsService.js";
import { IChatDebugService } from "../../common/chatDebugService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { CHAT_READ_ONLY_BANNER_HEIGHT, ChatReadOnlyBanner } from "./chatReadOnlyBanner.js";
import { IChatSubmitRequestHandlerService } from "../chatSubmitRequestHandlerService.js";
import { ChatPetWidget, isChatPetVisible } from "./chatPetWidget.js";
import { IChatPetService } from "../chatPetService.js";
const $ = dom.$;
const SESSIONS_CHAT_ITEM_HORIZONTAL_PADDING = 64;
function isQuickChat(widget) {
  return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isQuickChat);
}
function isInlineChat(widget) {
  return isIChatResourceViewContext(widget.viewContext) && Boolean(widget.viewContext.isInlineChat);
}
function getImmediateSilentSlashCommandPart(parsedRequest) {
  return parsedRequest.parts.find(
    (part) => part instanceof ChatRequestSlashCommandPart && part.range.start === 0 && part.slashCommand.executeImmediately === true && part.slashCommand.silent === true
  );
}
async function acceptAndAwaitSentRequest(result, onRequestAccepted) {
  if (ChatSendResult.isRejected(result)) {
    return void 0;
  }
  onRequestAccepted?.();
  const sent = ChatSendResult.isQueued(result) ? await result.deferred : result;
  return ChatSendResult.isSent(sent) ? sent : void 0;
}
const supportsAllAttachments = {
  supportsFileAttachments: true,
  supportsToolAttachments: true,
  supportsMCPAttachments: true,
  supportsImageAttachments: true,
  supportsSearchResultAttachments: true,
  supportsInstructionAttachments: true,
  supportsSourceControlAttachments: true,
  supportsProblemAttachments: true,
  supportsSymbolAttachments: true,
  supportsTerminalAttachments: true,
  supportsPromptAttachments: true,
  supportsHandOffs: true,
  supportsCheckpoints: true
};
const DISCLAIMER = localize("chatDisclaimer", "AI responses may be inaccurate");
let ChatWidget = class extends Disposable {
  constructor(location, viewContext, viewOptions, styles, codeEditorService, configurationService, dialogService, contextKeyService, instantiationService, chatService, chatAgentService, chatWidgetService, chatAccessibilityService, logService, themeService, chatSlashCommandService, chatEditingService, telemetryService, promptsService, customizationHarnessService, toolsService, chatLayoutService, chatEntitlementService, chatSessionsService, agentSessionsService, chatTodoListService, lifecycleService, chatAttachmentResolveService, chatTipService, chatDebugService, accessibilityService, chatGoalSummaryService, chatSubmitRequestHandlerService, chatPetService) {
    super();
    this.viewOptions = viewOptions;
    this.styles = styles;
    this.codeEditorService = codeEditorService;
    this.configurationService = configurationService;
    this.dialogService = dialogService;
    this.contextKeyService = contextKeyService;
    this.instantiationService = instantiationService;
    this.chatService = chatService;
    this.chatAgentService = chatAgentService;
    this.chatWidgetService = chatWidgetService;
    this.chatAccessibilityService = chatAccessibilityService;
    this.logService = logService;
    this.themeService = themeService;
    this.chatSlashCommandService = chatSlashCommandService;
    this.telemetryService = telemetryService;
    this.promptsService = promptsService;
    this.customizationHarnessService = customizationHarnessService;
    this.toolsService = toolsService;
    this.chatLayoutService = chatLayoutService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatSessionsService = chatSessionsService;
    this.agentSessionsService = agentSessionsService;
    this.chatTodoListService = chatTodoListService;
    this.lifecycleService = lifecycleService;
    this.chatAttachmentResolveService = chatAttachmentResolveService;
    this.chatTipService = chatTipService;
    this.chatDebugService = chatDebugService;
    this.accessibilityService = accessibilityService;
    this.chatGoalSummaryService = chatGoalSummaryService;
    this.chatSubmitRequestHandlerService = chatSubmitRequestHandlerService;
    this.chatPetService = chatPetService;
    this._onDidSubmitAgent = this._register(new Emitter());
    this.onDidSubmitAgent = this._onDidSubmitAgent.event;
    this._onDidChangeAgent = this._register(new Emitter());
    this.onDidChangeAgent = this._onDidChangeAgent.event;
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidChangeViewModel = this._register(new Emitter());
    this.onDidChangeViewModel = this._onDidChangeViewModel.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onDidAcceptInput = this._register(new Emitter());
    this.onDidAcceptInput = this._onDidAcceptInput.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._onDidShow = this._register(new Emitter());
    this.onDidShow = this._onDidShow.event;
    this._onDidChangeParsedInput = this._register(new Emitter());
    this.onDidChangeParsedInput = this._onDidChangeParsedInput.event;
    this._onDidChangeActiveInputEditor = this._register(new Emitter());
    this.onDidChangeActiveInputEditor = this._onDidChangeActiveInputEditor.event;
    this._onWillMaybeChangeHeight = this._register(new Emitter());
    this.onWillMaybeChangeHeight = this._onWillMaybeChangeHeight.event;
    this._onDidChangeHeight = this._register(new Emitter());
    this.onDidChangeHeight = this._onDidChangeHeight.event;
    this._onDidChangeContentHeight = this._register(new Emitter());
    this.onDidChangeContentHeight = this._onDidChangeContentHeight.event;
    this._onDidChangeEmptyState = this._register(new Emitter());
    this.onDidChangeEmptyState = this._onDidChangeEmptyState.event;
    this.contribs = [];
    this.visibilityTimeoutDisposable = this._register(new MutableDisposable());
    this.visibilityAnimationFrameDisposable = this._register(new MutableDisposable());
    this.inputPartDisposable = this._register(new MutableDisposable());
    this.inlineInputPartDisposable = this._register(new MutableDisposable());
    this.recentlyRestoredCheckpoint = false;
    /** Suppresses auto-scroll for the duration of an inline request edit. */
    this._editingAutoScrollHold = this._register(new MutableDisposable());
    this.welcomePart = this._register(new MutableDisposable());
    this._gettingStartedTipPart = this._register(new MutableDisposable());
    this._isInputOnboardingVisible = false;
    this.visibleChangeCount = 0;
    this._visible = false;
    this._inputVisible = true;
    this._readOnly = false;
    this._isRenderingWelcome = false;
    this._attachmentCapabilities = supportsAllAttachments;
    this._goalBannerDismissedForCurrentRequest = false;
    this._goalBannerDismissListener = this._register(new MutableDisposable());
    this.viewModelDisposables = this._register(new DisposableStore());
    this._editingSession = observableValue(this, void 0);
    this._viewModelObs = observableFromEvent(this, this.onDidChangeViewModel, () => this.viewModel);
    this.readOnlyBanner = viewOptions.isSessionsWindow ? void 0 : this._register(instantiationService.createInstance(ChatReadOnlyBanner));
    this._lockedToCodingAgentContextKey = ChatContextKeys.lockedToCodingAgent.bindTo(this.contextKeyService);
    this._lockedCodingAgentIdContextKey = ChatContextKeys.lockedCodingAgentId.bindTo(this.contextKeyService);
    this._readOnlyContextKey = ChatContextKeys.readOnly.bindTo(this.contextKeyService);
    this._chatIsAgentHostSessionContextKey = ChatContextKeys.chatIsAgentHostSession.bindTo(this.contextKeyService);
    this._chatAgentHostProviderIdContextKey = ChatContextKeys.chatAgentHostProviderId.bindTo(this.contextKeyService);
    this._chatSessionSupportsForkContextKey = ChatContextKeys.chatSessionSupportsFork.bindTo(this.contextKeyService);
    this._agentSupportsAttachmentsContextKey = ChatContextKeys.agentSupportsAttachments.bindTo(this.contextKeyService);
    this._sessionIsEmptyContextKey = ChatContextKeys.chatSessionIsEmpty.bindTo(this.contextKeyService);
    this._hasPendingRequestsContextKey = ChatContextKeys.hasPendingRequests.bindTo(this.contextKeyService);
    this._sessionHasDebugDataContextKey = ChatContextKeys.chatSessionHasDebugData.bindTo(this.contextKeyService);
    this._register(this.chatDebugService.onDidAddEvent((e) => {
      const sessionResource = this.viewModel?.sessionResource;
      if (sessionResource && e.sessionResource.toString() === sessionResource.toString()) {
        this._sessionHasDebugDataContextKey.set(true);
      }
    }));
    this.viewContext = viewContext ?? {};
    const viewModelObs = this._viewModelObs;
    if (typeof location === "object") {
      this._location = location;
    } else {
      this._location = { location };
    }
    ChatContextKeys.inChatSession.bindTo(contextKeyService).set(true);
    ChatContextKeys.location.bindTo(contextKeyService).set(this._location.location);
    ChatContextKeys.inQuickChat.bindTo(contextKeyService).set(isQuickChat(this));
    this.agentInInput = ChatContextKeys.inputHasAgent.bindTo(contextKeyService);
    this.requestInProgress = ChatContextKeys.requestInProgress.bindTo(contextKeyService);
    this.hasActiveRequest = ChatContextKeys.hasActiveRequest.bindTo(contextKeyService);
    this._register(this.chatEntitlementService.onDidChangeAnonymous(() => this.renderWelcomeViewContentIfNeeded()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("chat.tips.enabled")) {
        if (!this.configurationService.getValue("chat.tips.enabled")) {
          this.clearGettingStartedTip();
        } else {
          this.updateChatViewVisibility();
        }
      }
      if (e.affectsConfiguration(ChatConfiguration.ProgressBorder)) {
        this.updateWorkingProgressBorder();
      }
    }));
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
      this.updateWorkingProgressBorder();
      if (this.visible) {
        this.listWidget.rerender();
      }
    }));
    this._register(bindContextKey(decidedChatEditingResourceContextKey, contextKeyService, (reader) => {
      const currentSession = this._editingSession.read(reader);
      if (!currentSession) {
        return;
      }
      const entries = currentSession.entries.read(reader);
      const decidedEntries = entries.filter((entry) => entry.state.read(reader) !== ModifiedFileEntryState.Modified);
      return decidedEntries.map((entry) => entry.entryId);
    }));
    this._register(bindContextKey(hasUndecidedChatEditingResourceContextKey, contextKeyService, (reader) => {
      const currentSession = this._editingSession.read(reader);
      const entries = currentSession?.entries.read(reader) ?? [];
      const decidedEntries = entries.filter((entry) => entry.state.read(reader) === ModifiedFileEntryState.Modified);
      return decidedEntries.length > 0;
    }));
    this._register(bindContextKey(hasAppliedChatEditsContextKey, contextKeyService, (reader) => {
      const currentSession = this._editingSession.read(reader);
      if (!currentSession) {
        return false;
      }
      const entries = currentSession.entries.read(reader);
      return entries.length > 0;
    }));
    this._register(bindContextKey(inChatEditingSessionContextKey, contextKeyService, (reader) => {
      return this._editingSession.read(reader) !== null;
    }));
    this._register(bindContextKey(ChatContextKeys.chatEditingCanUndo, contextKeyService, (r) => {
      return this._editingSession.read(r)?.canUndo.read(r) || false;
    }));
    this._register(bindContextKey(ChatContextKeys.chatEditingCanRedo, contextKeyService, (r) => {
      return this._editingSession.read(r)?.canRedo.read(r) || false;
    }));
    this._register(bindContextKey(applyingChatEditsFailedContextKey, contextKeyService, (r) => {
      const chatModel = viewModelObs.read(r)?.model;
      const editingSession = this._editingSession.read(r);
      if (!editingSession || !chatModel) {
        return false;
      }
      const lastResponse = observableFromEvent(this, chatModel.onDidChange, () => chatModel.getRequests().at(-1)?.response).read(r);
      return lastResponse?.result?.errorDetails && !lastResponse?.result?.errorDetails.responseIsIncomplete;
    }));
    this.chatSuggestNextWidget = this._register(this.instantiationService.createInstance(ChatSuggestNextWidget));
    this._register(autorun((r) => {
      const viewModel = viewModelObs.read(r);
      const inProgress = viewModel?.model.requestInProgress.read(r) ?? false;
      if (!inProgress) {
        this._cancelGoalSummary();
        this.inputPartDisposable.value?.clearGoalBanner();
      }
    }));
    this._register(autorun((r) => {
      const viewModel = viewModelObs.read(r);
      const sessions = chatEditingService.editingSessionsObs.read(r);
      const session = sessions.find((candidate) => isEqual(candidate.chatSessionResource, viewModel?.sessionResource));
      this._editingSession.set(void 0, void 0);
      this.renderChatEditingSessionState();
      if (!session) {
        return;
      }
      const entries = session.entries.read(r);
      for (const entry of entries) {
        entry.state.read(r);
      }
      this._editingSession.set(session, void 0);
      r.store.add(session.onDidDispose(() => {
        this._editingSession.set(void 0, void 0);
        this.renderChatEditingSessionState();
      }));
      r.store.add(this.inputEditor.onDidChangeModelContent(() => {
        if (this.getInput() === "") {
          this.refreshParsedInput();
        }
      }));
      this.renderChatEditingSessionState();
    }));
    this._register(this.codeEditorService.registerCodeEditorOpenHandler(async (input, _source, _sideBySide) => {
      const resource = input.resource;
      if (resource.scheme !== Schemas.vscodeChatCodeBlock) {
        return null;
      }
      const responseId = resource.path.split("/").at(1);
      if (!responseId) {
        return null;
      }
      const item = this.viewModel?.getItems().find((item2) => item2.id === responseId);
      if (!item) {
        return null;
      }
      this.reveal(item);
      await timeout(0);
      for (const codeBlockPart of this.listWidget.editorsInUse()) {
        if (extUri.isEqual(codeBlockPart.uri, resource, true)) {
          const editor = codeBlockPart.editor;
          let relativeTop = 0;
          const editorDomNode = editor.getDomNode();
          if (editorDomNode) {
            const row = dom.findParentWithClass(editorDomNode, "monaco-list-row");
            if (row) {
              relativeTop = dom.getTopLeftOffset(editorDomNode).top - dom.getTopLeftOffset(row).top;
            }
          }
          if (input.options?.selection) {
            const editorSelectionTopOffset = editor.getTopForPosition(input.options.selection.startLineNumber, input.options.selection.startColumn);
            relativeTop += editorSelectionTopOffset;
            editor.focus();
            editor.setSelection({
              startLineNumber: input.options.selection.startLineNumber,
              startColumn: input.options.selection.startColumn,
              endLineNumber: input.options.selection.endLineNumber ?? input.options.selection.startLineNumber,
              endColumn: input.options.selection.endColumn ?? input.options.selection.startColumn
            });
          }
          this.reveal(item, relativeTop);
          return editor;
        }
      }
      return null;
    }));
    this._register(this.onDidChangeParsedInput(() => this.updateChatInputContext()));
    this._register(this.chatTodoListService.onDidUpdateTodos((sessionResource) => {
      if (isEqual(this.viewModel?.sessionResource, sessionResource)) {
        this.inputPart.renderChatTodoListWidget(sessionResource);
      }
    }));
  }
  get domNode() {
    return this.container;
  }
  get visible() {
    return this._visible;
  }
  set viewModel(viewModel) {
    if (this._viewModel === viewModel) {
      return;
    }
    const previousSessionResource = this._viewModel?.sessionResource;
    this.viewModelDisposables.clear();
    this._viewModel = viewModel;
    if (viewModel) {
      this.viewModelDisposables.add(viewModel);
      this.logService.debug("ChatWidget#setViewModel: have viewModel");
      if (viewModel.model.requestInProgress.get()) {
        this.chatAccessibilityService.acceptRequest(viewModel.sessionResource, true);
      }
    } else {
      this.logService.debug("ChatWidget#setViewModel: no viewModel");
    }
    this._onDidChangeViewModel.fire({ previousSessionResource, currentSessionResource: this._viewModel?.sessionResource });
  }
  get viewModel() {
    return this._viewModel;
  }
  get parsedInput() {
    if (this.parsedChatRequest === void 0) {
      if (!this.viewModel) {
        return { text: "", parts: [] };
      }
      this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, {
        selectedAgent: this._lastSelectedAgent,
        mode: this.input.currentModeKind,
        attachmentCapabilities: this.attachmentCapabilities,
        forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0,
        sessionType: getChatSessionType(this.viewModel.model.sessionResource)
      });
      this._onDidChangeParsedInput.fire();
    }
    return this.parsedChatRequest;
  }
  get scopedContextKeyService() {
    return this.contextKeyService;
  }
  get location() {
    return this._location.location;
  }
  get supportsChangingModes() {
    return !!this.viewOptions.supportsChangingModes;
  }
  get locationData() {
    return this._location.resolveData?.();
  }
  set lastSelectedAgent(agent) {
    this.parsedChatRequest = void 0;
    this._lastSelectedAgent = agent;
    this._updateAgentCapabilitiesContextKeys(agent);
    this._onDidChangeParsedInput.fire();
  }
  get lastSelectedAgent() {
    return this._lastSelectedAgent;
  }
  _updateAgentCapabilitiesContextKeys(agent) {
    const capabilities = agent?.capabilities ?? (this._lockedAgent ? this.chatSessionsService.getCapabilitiesForSessionType(this._lockedAgent.id) : void 0);
    this._attachmentCapabilities = capabilities ?? supportsAllAttachments;
    const supportsAttachments = Object.keys(filter(this._attachmentCapabilities, (key, value) => value === true)).length > 0;
    this._agentSupportsAttachmentsContextKey.set(supportsAttachments);
  }
  get supportsFileReferences() {
    return !!this.viewOptions.supportsFileReferences;
  }
  get rendersInputOnTop() {
    return this.viewOptions.renderInputOnTop ?? false;
  }
  get attachmentCapabilities() {
    return this._attachmentCapabilities;
  }
  /**
   * Either the inline input (when editing) or the main input part
   */
  get input() {
    return this.viewModel?.editing && this.configurationService.getValue("chat.editRequests") !== "input" ? this.inlineInputPart : this.inputPart;
  }
  /**
   * The main input part at the buttom of the chat widget. Use `input` to get the active input (main or inline editing part).
   */
  get inputPart() {
    return this.inputPartDisposable.value;
  }
  get inlineInputPart() {
    return this.inlineInputPartDisposable.value;
  }
  updateWorkingProgressBorder() {
    const inputPart = this.inputPartDisposable.value;
    if (!inputPart) {
      return;
    }
    const inputContainer = inputPart.inputContainerElement;
    if (!inputContainer) {
      return;
    }
    const enabled = this.configurationService.getValue(ChatConfiguration.ProgressBorder) === true && !this.accessibilityService.isMotionReduced() && !isInlineChat(this);
    const inProgress = !!this.viewModel?.model.requestInProgress.get();
    inputContainer.classList.toggle("working", enabled && inProgress);
  }
  get inputEditor() {
    return this.input.inputEditor;
  }
  get contentHeight() {
    return this.input.height.get() + this.listWidget.contentHeight + this.chatSuggestNextWidget.height;
  }
  get scrollTop() {
    return this.listWidget.scrollTop;
  }
  set scrollTop(value) {
    this.listWidget.scrollTop = value;
  }
  holdAutoScroll() {
    return this.listWidget.acquireAutoScrollHold();
  }
  get transcriptDomNode() {
    return this.listWidget.domNode;
  }
  get scrollHeight() {
    return this.listWidget.scrollHeight;
  }
  get viewportHeight() {
    return this.listWidget.renderHeight;
  }
  get attachmentModel() {
    return this.input.attachmentModel;
  }
  render(parent) {
    const viewId = isIChatViewViewContext(this.viewContext) ? this.viewContext.viewId : void 0;
    this.editorOptions = this._register(this.instantiationService.createInstance(ChatEditorOptions, viewId, this.styles.listForeground, this.styles.inputEditorBackground, this.styles.resultEditorBackground));
    const renderInputOnTop = this.viewOptions.renderInputOnTop ?? false;
    const renderFollowups = this.viewOptions.renderFollowups ?? !renderInputOnTop;
    const renderStyle = this.viewOptions.renderStyle;
    const renderInputToolbarBelowInput = this.viewOptions.renderInputToolbarBelowInput ?? false;
    this.container = dom.append(parent, $(".interactive-session"));
    this.welcomeMessageContainer = dom.append(this.container, $(".chat-welcome-view-container", { style: "display: none" }));
    this._register(dom.addStandardDisposableListener(this.welcomeMessageContainer, dom.EventType.CLICK, () => this.focusInput()));
    this._register(this.chatSuggestNextWidget.onDidChangeHeight(() => {
      if (this.bodyDimension) {
        this.layout(this.bodyDimension.height, this.bodyDimension.width);
      }
    }));
    this._register(this.chatSuggestNextWidget.onDidSelectPrompt(({ handoff, agentId, withAutopilot }) => {
      this.handleNextPromptSelection(handoff, agentId, withAutopilot);
    }));
    if (renderInputOnTop) {
      if (this.readOnlyBanner) {
        this.container.appendChild(this.readOnlyBanner.domNode);
      }
      this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
      this.listContainer = dom.append(this.container, $(`.interactive-list`));
    } else {
      this.listContainer = dom.append(this.container, $(`.interactive-list`));
      dom.append(this.container, this.chatSuggestNextWidget.domNode);
      if (this.readOnlyBanner) {
        this.container.appendChild(this.readOnlyBanner.domNode);
      }
      this.createInput(this.container, { renderFollowups, renderStyle, renderInputToolbarBelowInput });
    }
    if (this.location === ChatAgentLocation.Chat && !isInlineChat(this)) {
      const inputContainer = this.inputPart.inputContainerElement;
      const petHost = inputContainer?.parentElement ?? this.inputPart.element;
      const inputHasContent = observableFromEvent(this, this.inputEditor.onDidChangeModelContent, () => this.inputEditor.getValue().length > 0);
      const targetWindow = dom.getWindow(this.container);
      const isLatestFocusedWidgetInWindow = observableValue(this, this.chatWidgetService.lastFocusedWidget === this);
      this._register(this.chatWidgetService.onDidChangeFocusedWidget((focusedWidget) => {
        if (focusedWidget && dom.getWindow(focusedWidget.domNode) === targetWindow) {
          isLatestFocusedWidgetInWindow.set(focusedWidget === this, void 0);
        }
      }));
      const petVisible = derived(this, (reader) => isChatPetVisible(this.chatPetService.enabled.read(reader), isLatestFocusedWidgetInWindow.read(reader)));
      this._register(autorun((reader) => this.container.classList.toggle("chat-pet-enabled", petVisible.read(reader))));
      this._register(this.instantiationService.createInstance(ChatPetWidget, petHost, inputContainer ?? petHost, this._viewModelObs.map((viewModel) => viewModel?.model), inputHasContent, petVisible, this.inputEditor.onDidChangeModelContent));
    }
    this.renderWelcomeViewContentIfNeeded();
    this.createList(this.listContainer, {
      editable: !isInlineChat(this) && !isQuickChat(this),
      contentHorizontalPadding: this.viewOptions.isSessionsWindow ? SESSIONS_CHAT_ITEM_HORIZONTAL_PADDING : void 0,
      ...this.viewOptions.rendererOptions,
      renderStyle
    });
    this._register(dom.addDisposableListener(this.container, dom.EventType.MOUSE_WHEEL, (e) => {
      if (e.defaultPrevented || e.target !== this.container) {
        return;
      }
      this.listWidget.delegateScrollFromMouseWheelEvent(e);
    }));
    this._register(dom.addDisposableListener(parent, dom.EventType.MOUSE_WHEEL, (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const target = e.target;
      if (target && dom.isAncestor(target, this.container)) {
        return;
      }
      this.listWidget.delegateScrollFromMouseWheelEvent(e);
    }));
    this._register(autorun((reader) => {
      const fontFamily = this.chatLayoutService.fontFamily.read(reader);
      const fontSize = this.chatLayoutService.fontSize.read(reader);
      this.container.style.setProperty("--vscode-chat-font-family", fontFamily);
      this.container.style.fontSize = `${fontSize}px`;
      if (this.visible) {
        this.listWidget.rerender();
      }
    }));
    this._register(Event.runAndSubscribe(this.editorOptions.onDidChange, () => this.onDidStyleChange()));
    if (this.viewModel) {
      this.onDidChangeItems();
      this.listWidget.scrollToEnd();
    }
    this.contribs = ChatWidget.CONTRIBS.map((contrib) => {
      try {
        return this._register(this.instantiationService.createInstance(contrib, this));
      } catch (err) {
        this.logService.error("Failed to instantiate chat widget contrib", toErrorMessage(err));
        return void 0;
      }
    }).filter(isDefined);
    this._register(this.chatWidgetService.register(this));
    const parsedInput = observableFromEvent(this.onDidChangeParsedInput, () => this.parsedInput);
    this._register(autorun((r) => {
      const input = parsedInput.read(r);
      const newPromptAttachments = /* @__PURE__ */ new Map();
      const oldPromptAttachments = /* @__PURE__ */ new Set();
      for (const attachment of this.attachmentModel.attachments) {
        if (attachment.range) {
          oldPromptAttachments.add(attachment.id);
        }
      }
      for (const part of input.parts) {
        if (part instanceof ChatRequestToolPart || part instanceof ChatRequestToolSetPart || part instanceof ChatRequestDynamicVariablePart) {
          const entry = part.toVariableEntry();
          if (part instanceof ChatRequestDynamicVariablePart && part.isAttachmentReference) {
            continue;
          }
          newPromptAttachments.set(entry.id, entry);
          oldPromptAttachments.delete(entry.id);
        }
      }
      this.attachmentModel.updateContext(oldPromptAttachments, newPromptAttachments.values());
    }));
    if (!this.focusedInputDOM) {
      this.focusedInputDOM = this.container.appendChild(dom.$(".focused-input-dom"));
    }
  }
  focusInput() {
    if (!this._inputVisible) {
      if (this.listWidget.focusLastItem(true) < 0) {
        this.listWidget.focus();
      }
      this._onDidFocus.fire();
      return;
    }
    this.input.focus();
    this._onDidFocus.fire();
  }
  focusTodosView() {
    if (!this.input.hasVisibleTodos()) {
      return false;
    }
    return this.input.focusTodoList();
  }
  toggleTodosViewFocus() {
    if (!this.input.hasVisibleTodos()) {
      return false;
    }
    if (this.input.isTodoListFocused()) {
      this.focusInput();
      return true;
    }
    return this.input.focusTodoList();
  }
  focusQuestionCarousel() {
    if (!this.input.questionCarousel) {
      return false;
    }
    return this.input.focusQuestionCarousel();
  }
  toggleQuestionCarouselFocus() {
    if (!this.input.questionCarousel) {
      return false;
    }
    if (this.input.isQuestionCarouselFocused()) {
      this.focusInput();
      return true;
    }
    return this.input.focusQuestionCarousel();
  }
  navigateToPreviousQuestion() {
    if (!this.input.questionCarousel) {
      return false;
    }
    return this.input.navigateToPreviousQuestion();
  }
  navigateToNextQuestion() {
    if (!this.input.questionCarousel) {
      return false;
    }
    return this.input.navigateToNextQuestion();
  }
  focusQuestionCarouselTerminal() {
    return this.input.focusQuestionCarouselTerminal();
  }
  toggleTipFocus() {
    if (this._gettingStartedTipPartRef?.hasFocus()) {
      this.focusInput();
      return true;
    }
    if (!this._gettingStartedTipPartRef) {
      return false;
    }
    this._gettingStartedTipPartRef.focus();
    return true;
  }
  hasInputFocus() {
    return this.input.hasFocus();
  }
  refreshParsedInput() {
    if (!this.viewModel) {
      return;
    }
    const previous = this.parsedChatRequest;
    const context = {
      selectedAgent: this._lastSelectedAgent,
      mode: this.input.currentModeKind,
      attachmentCapabilities: this.attachmentCapabilities,
      sessionType: getChatSessionType(this.viewModel.model.sessionResource),
      forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0
    };
    this.parsedChatRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), this.getInput(), this.location, context);
    if (!previous || !IParsedChatRequest.equals(previous, this.parsedChatRequest)) {
      this._onDidChangeParsedInput.fire();
    }
  }
  getSibling(item, type) {
    if (!isResponseVM(item)) {
      return;
    }
    const items = this.viewModel?.getItems();
    if (!items) {
      return;
    }
    const responseItems = items.filter((i) => isResponseVM(i));
    const targetIndex = responseItems.indexOf(item);
    if (targetIndex === void 0) {
      return;
    }
    const indexToFocus = type === "next" ? targetIndex + 1 : targetIndex - 1;
    if (indexToFocus < 0 || indexToFocus > responseItems.length - 1) {
      return;
    }
    return responseItems[indexToFocus];
  }
  async clear(targetSessionType) {
    this.logService.debug("ChatWidget#clear");
    if (this._dynamicMessageLayoutData) {
      this._dynamicMessageLayoutData.enabled = true;
    }
    if (this.viewModel?.editing) {
      this.finishedEditing();
    }
    if (this.viewModel) {
      this.viewModel.resetInputPlaceholder();
    }
    if (this._lockedAgent) {
      this.lockToCodingAgent(this._lockedAgent.name, this._lockedAgent.displayName, this._lockedAgent.id, this._lockedAgent.agentHostProviderId);
    } else {
      this.unlockFromCodingAgent();
    }
    this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
    this.inputPart?.clearArtifactsWidget();
    this.chatSuggestNextWidget.hide();
    await this.viewOptions.clear?.(targetSessionType);
  }
  onDidChangeItems(skipDynamicLayout) {
    if (this._visible || !this.viewModel) {
      const items = this.viewModel?.getItems() ?? [];
      if (items.length > 0) {
        this.updateChatViewVisibility();
      } else {
        this.renderWelcomeViewContentIfNeeded();
      }
      this._onWillMaybeChangeHeight.fire();
      this.listWidget.setVisibleChangeCount(this.visibleChangeCount);
      this.listWidget.refresh();
      if (!skipDynamicLayout && this._dynamicMessageLayoutData) {
        this.layoutDynamicChatTreeItemMode();
      }
      this.renderFollowups();
    }
  }
  /**
   * Updates the DOM visibility of welcome view and chat list immediately
   */
  updateChatViewVisibility() {
    if (this.viewModel) {
      const isStandardLayout = this.viewOptions.renderStyle !== "compact" && this.viewOptions.renderStyle !== "minimal";
      const numItems = this.viewModel.getItems().length;
      dom.setVisibility(numItems === 0, this.welcomeMessageContainer);
      dom.setVisibility(numItems !== 0, this.listContainer);
      if (isStandardLayout && this.inputPart) {
        if (numItems === 0) {
          this.renderGettingStartedTipIfNeeded();
        } else {
          this.clearGettingStartedTip();
        }
      }
    }
    this.container.classList.toggle(
      "chat-view-getting-started-disabled",
      this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.hasByokModels
    );
    this._onDidChangeEmptyState.fire();
  }
  isEmpty() {
    return (this.viewModel?.getItems().length ?? 0) === 0;
  }
  /**
   * Renders the welcome view content when needed.
   */
  renderWelcomeViewContentIfNeeded() {
    if (this._isRenderingWelcome) {
      return;
    }
    if (!this.inputPartDisposable.value) {
      return;
    }
    this._isRenderingWelcome = true;
    try {
      if (this.viewOptions.renderStyle === "compact" || this.viewOptions.renderStyle === "minimal" || this.lifecycleService.willShutdown) {
        return;
      }
      const numItems = this.viewModel?.getItems().length ?? 0;
      if (!numItems) {
        const defaultAgent = this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind);
        let additionalMessage;
        if (this.chatEntitlementService.anonymous && !this.chatEntitlementService.sentiment.completed) {
          const providers = product.defaultChatAgent.provider;
          additionalMessage = new MarkdownString(localize({ key: "settings", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3}).", providers.default.name, providers.default.name, product.defaultChatAgent.termsStatementUrl, product.defaultChatAgent.privacyStatementUrl), { isTrusted: true });
        } else {
          additionalMessage = defaultAgent?.metadata.additionalWelcomeMessage;
        }
        if (!additionalMessage && !this._lockedAgent) {
          additionalMessage = this._getGenerateInstructionsMessage();
        }
        const welcomeContent = this.getWelcomeViewContent(additionalMessage);
        if (!this.welcomePart.value || this.welcomePart.value.needsRerender(welcomeContent)) {
          dom.clearNode(this.welcomeMessageContainer);
          this.welcomePart.value = this.instantiationService.createInstance(
            ChatViewWelcomePart,
            welcomeContent,
            {
              location: this.location,
              isWidgetAgentWelcomeViewContent: this.input?.currentModeKind === ChatModeKind.Agent
            }
          );
          dom.append(this.welcomeMessageContainer, this.welcomePart.value.element);
        }
      }
      this.updateChatViewVisibility();
    } finally {
      this._isRenderingWelcome = false;
    }
  }
  renderGettingStartedTipIfNeeded() {
    if (!this.inputPart || !this.viewModel) {
      return;
    }
    if (this.isInputOnboardingVisible()) {
      this.clearGettingStartedTip();
      return;
    }
    const tipContainer = this.inputPart.gettingStartedTipContainerElement;
    const tip = this.chatTipService.getWelcomeTip(this.contextKeyService);
    if (!tip) {
      this.clearGettingStartedTip();
      return;
    }
    if (this._gettingStartedTipPart.value) {
      dom.setVisibility(true, tipContainer);
      return;
    }
    const store = new DisposableStore();
    const renderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
    const tipPart = store.add(this.instantiationService.createInstance(
      ChatTipContentPart,
      tip,
      renderer
    ));
    this._gettingStartedTipPartRef = tipPart;
    store.add(tipPart.onDidHide(() => {
      tipPart.domNode.remove();
      this._gettingStartedTipPartRef = void 0;
      this._gettingStartedTipPart.clear();
      dom.setVisibility(false, tipContainer);
      this.focusInput();
    }));
    this._gettingStartedTipPart.value = store;
    dom.clearNode(tipContainer);
    tipContainer.appendChild(tipPart.domNode);
    dom.setVisibility(true, tipContainer);
  }
  clearGettingStartedTip() {
    this._gettingStartedTipPartRef = void 0;
    this._gettingStartedTipPart.clear();
    if (this.inputPart) {
      const tipContainer = this.inputPart.gettingStartedTipContainerElement;
      dom.clearNode(tipContainer);
      dom.setVisibility(false, tipContainer);
    }
  }
  isInputOnboardingVisible() {
    return this._isInputOnboardingVisible;
  }
  setInputOnboardingVisible(visible) {
    this._isInputOnboardingVisible = visible;
    if (visible) {
      this.clearGettingStartedTip();
    } else if (this.isEmpty()) {
      this.renderGettingStartedTipIfNeeded();
    }
  }
  _getGenerateInstructionsMessage() {
    if (!this._instructionFilesCheckPromise) {
      this._instructionFilesCheckPromise = this._checkForAgentInstructionFiles();
      this._register(thenIfNotDisposed(this._instructionFilesCheckPromise, (hasFiles) => {
        this._instructionFilesExist = hasFiles;
        const hasViewModelItems = this.viewModel?.getItems().length ?? 0;
        if (hasViewModelItems === 0) {
          this.renderWelcomeViewContentIfNeeded();
        }
      }));
    }
    if (this._instructionFilesExist === true) {
      return new MarkdownString("");
    } else if (this._instructionFilesExist === false) {
      return new MarkdownString(localize(
        "chatWidget.instructions",
        "[Generate Agent Instructions]({0}) to onboard AI onto your codebase.",
        `command:${GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID}`
      ), { isTrusted: { enabledCommands: [GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID] } });
    }
    return new MarkdownString("");
  }
  /**
   * Checks if any agent instruction files (.github/copilot-instructions.md or AGENTS.md) exist in the workspace.
   * Used to determine whether to show the "Generate Agent Instructions" hint.
   *
   * @returns true if instruction files exist OR if instruction features are disabled (to hide the hint)
   */
  async _checkForAgentInstructionFiles() {
    try {
      return (await this.promptsService.listAgentInstructions(CancellationToken.None)).length > 0;
    } catch (error) {
      this.logService.warn("[ChatWidget] Error checking for instruction files:", error);
      return false;
    }
  }
  getWelcomeViewContent(additionalMessage) {
    if (this.isLockedToCodingAgent) {
      const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : void 0;
      const providerIcon = contribution?.icon;
      const providerTitle = contribution?.welcomeTitle;
      const providerMessage = contribution?.welcomeMessage;
      const message = providerMessage ? new MarkdownString(providerMessage) : this._lockedAgent?.prefix === "@copilot " ? new MarkdownString(localize("copilotCodingAgentMessage", "This chat session will be forwarded to the {0} [coding agent]({1}) where work is completed in the background. ", this._lockedAgent.prefix, "https://aka.ms/coding-agent-docs") + DISCLAIMER, { isTrusted: true }) : new MarkdownString(localize("genericCodingAgentMessage", "This chat session will be forwarded to the {0} coding agent where work is completed in the background. ", this._lockedAgent?.prefix) + DISCLAIMER);
      return {
        title: providerTitle ?? localize("codingAgentTitle", "Delegate to {0}", this._lockedAgent?.prefix),
        message,
        icon: providerIcon ?? Codicon.sendToRemoteAgent,
        additionalMessage,
        useLargeIcon: !!providerIcon
      };
    }
    let title;
    if (this.input.currentModeKind === ChatModeKind.Ask) {
      title = localize("chatDescription", "Ask about your code");
    } else if (this.input.currentModeKind === ChatModeKind.Edit) {
      title = localize("editsTitle", "Edit in context");
    } else {
      title = localize("agentTitle", "Build with Agent");
    }
    return {
      title,
      message: new MarkdownString(DISCLAIMER),
      icon: Codicon.chatSparkle,
      additionalMessage
    };
  }
  async renderChatEditingSessionState() {
    if (!this.input) {
      return;
    }
    this.input.renderChatEditingSessionState(this._editingSession.get() ?? null);
  }
  async renderFollowups() {
    const lastItem = this.listWidget.lastItem;
    if (lastItem && isResponseVM(lastItem) && lastItem.isComplete) {
      this.input.renderFollowups(lastItem.replyFollowups, lastItem);
    } else {
      this.input.renderFollowups(void 0, void 0);
    }
  }
  renderChatSuggestNextWidget() {
    if (this.lifecycleService.willShutdown) {
      return;
    }
    if (this._readOnly) {
      this.chatSuggestNextWidget.hide();
      return;
    }
    if (this.isLockedToCodingAgent && !this._attachmentCapabilities.supportsHandOffs) {
      this.chatSuggestNextWidget.hide();
      return;
    }
    const items = this.viewModel?.getItems() ?? [];
    if (!items.length) {
      return;
    }
    const lastItem = items[items.length - 1];
    const lastResponseComplete = lastItem && isResponseVM(lastItem) && lastItem.isComplete;
    if (!lastResponseComplete || lastItem.isCanceled) {
      this.chatSuggestNextWidget.hide();
      return;
    }
    const modeInfo = lastItem.model.request?.modeInfo;
    let responseMode;
    const modes = this.input.currentChatModesObs.get();
    if (modeInfo?.modeInstructions?.name) {
      responseMode = modes.findModeByName(modeInfo.modeInstructions.name);
    } else {
      responseMode = this.input.currentModeObs.get();
    }
    const handoffs = responseMode?.handOffs?.get();
    if (responseMode && handoffs && handoffs.length > 0) {
      const permissionLevel = this.inputPart.currentModeInfo.permissionLevel;
      if (permissionLevel === ChatPermissionLevel.Autopilot) {
        const autoSendHandoff = handoffs.find((h) => h.send);
        if (autoSendHandoff) {
          this.handleNextPromptSelection(autoSendHandoff);
          return;
        }
      }
      const wasHidden = this.chatSuggestNextWidget.domNode.style.display === "none";
      this.chatSuggestNextWidget.render(responseMode);
      if (wasHidden) {
        this.telemetryService.publicLog2("chat.handoffWidgetShown", {
          agent: getModeNameForTelemetry(responseMode),
          handoffCount: handoffs.length
        });
      }
    } else {
      this.chatSuggestNextWidget.hide();
    }
    if (this.bodyDimension) {
      this.layout(this.bodyDimension.height, this.bodyDimension.width);
    }
  }
  handleNextPromptSelection(handoff, agentId, withAutopilot) {
    this.chatSuggestNextWidget.hide();
    if (withAutopilot) {
      this.inputPart.setPermissionLevel(ChatPermissionLevel.Autopilot);
    }
    const promptToUse = handoff.prompt;
    const currentMode = this.input.currentModeObs.get();
    const toMode = handoff.agent ? this.input.currentChatModesObs.get().findModeByName(handoff.agent) : void 0;
    this.telemetryService.publicLog2("chat.handoffClicked", {
      fromAgent: getModeNameForTelemetry(currentMode),
      toAgent: agentId || (toMode ? getModeNameForTelemetry(toMode) : ""),
      hasPrompt: Boolean(promptToUse),
      autoSend: Boolean(handoff.send)
    });
    this.executeHandoff(handoff, agentId).catch((e) => {
      const target = agentId ?? handoff.agent ?? "unknown";
      this.logService.error(`[Handoff] Failed to execute handoff '${handoff.label}' to '${target}'`, e);
    });
  }
  async executeHandoff(handoff, agentId) {
    this.chatSuggestNextWidget.hide();
    const promptToUse = handoff.prompt;
    if (agentId) {
      this.input.setValue(`@${agentId} ${promptToUse}`, false);
      this.input.focus();
      this.acceptInput().catch((e) => this.logService.error(`[Handoff] Failed to submit delegated handoff to '@${agentId}'`, e));
    } else if (handoff.agent) {
      const switched = await this._switchToAgentByName(handoff.agent);
      if (!switched) {
        this.logService.warn(`[Handoff] Did not execute handoff '${handoff.label}' to '${handoff.agent}' because switching agents was unsuccessful`);
        return;
      }
      const modelReady = handoff.model ? this.input.requestModelByQualifiedName([handoff.model]) : void 0;
      this.input.setValue(promptToUse, false);
      this.input.focus();
      if (handoff.send) {
        if (modelReady && !await modelReady) {
          return;
        }
        this.acceptInput().catch((e) => this.logService.error(`[Handoff] Failed to submit handoff to '${handoff.agent}'`, e));
      }
    }
  }
  async handleDelegationExitIfNeeded(sourceAgent, targetAgent) {
    if (!this._shouldExitAfterDelegation(sourceAgent, targetAgent)) {
      return;
    }
    this.logService.debug(`[Delegation] Will exit after delegation: sourceAgent=${sourceAgent?.id}, targetAgent=${targetAgent?.id}`);
    try {
      await this._handleDelegationExit();
    } catch (e) {
      this.logService.error("[Delegation] Failed to handle delegation exit", e);
    }
  }
  _shouldExitAfterDelegation(sourceAgent, targetAgent) {
    if (!targetAgent) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (no targetAgent)");
      return false;
    }
    if (!this.configurationService.getValue(ChatConfiguration.ExitAfterDelegation)) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (ExitAfterDelegation config disabled)");
      return false;
    }
    if (sourceAgent && sourceAgent.id === targetAgent.id) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (source and target agents are the same)");
      return false;
    }
    if (!isIChatViewViewContext(this.viewContext)) {
      this.logService.debug("[Delegation] _shouldExitAfterDelegation: false (not in chat view context)");
      return false;
    }
    const contribution = this.chatSessionsService.getChatSessionContribution(targetAgent.id);
    if (!contribution) {
      this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (no contribution found for targetAgent.id=${targetAgent.id})`);
      return false;
    }
    if (contribution.canDelegate !== true) {
      this.logService.debug(`[Delegation] _shouldExitAfterDelegation: false (contribution.canDelegate=${contribution.canDelegate}, expected true)`);
      return false;
    }
    this.logService.debug("[Delegation] _shouldExitAfterDelegation: true");
    return true;
  }
  /**
   * Handles the exit of the panel chat when a delegation to another session occurs.
   * Waits for the response to complete and any pending confirmations to be resolved,
   * then clears the widget unless the final message is an error.
   */
  async _handleDelegationExit() {
    const viewModel = this.viewModel;
    if (!viewModel) {
      this.logService.debug("[Delegation] _handleDelegationExit: no viewModel, returning");
      return;
    }
    const parentSessionResource = viewModel.sessionResource;
    this.logService.debug(`[Delegation] _handleDelegationExit: parentSessionResource=${parentSessionResource.toString()}`);
    const checkIfShouldClear = () => {
      const items = viewModel.getItems();
      const lastItem = items[items.length - 1];
      if (lastItem && isResponseVM(lastItem) && lastItem.model && lastItem.isComplete && !lastItem.model.isPendingConfirmation.get()) {
        const hasError = Boolean(lastItem.result?.errorDetails);
        return !hasError;
      }
      return false;
    };
    if (checkIfShouldClear()) {
      this.logService.debug("[Delegation] Response complete, archiving session before clearing");
      await this.archiveLocalParentSession(parentSessionResource);
      await this.clear();
      return;
    }
    this.logService.debug("[Delegation] Waiting for response to complete...");
    const shouldClear = await new Promise((resolve) => {
      const disposable = viewModel.onDidChange(() => {
        const result = checkIfShouldClear();
        if (result) {
          cleanup();
          resolve(true);
        }
      });
      const timeout2 = setTimeout(() => {
        this.logService.debug("[Delegation] Timeout waiting for response to complete");
        cleanup();
        resolve(false);
      }, 3e4);
      const cleanup = () => {
        clearTimeout(timeout2);
        disposable.dispose();
      };
    });
    if (shouldClear) {
      this.logService.debug("[Delegation] Response completed, archiving session before clearing");
      await this.archiveLocalParentSession(parentSessionResource);
      await this.clear();
    } else {
      this.logService.debug("[Delegation] Not clearing (timeout or error)");
    }
  }
  async archiveLocalParentSession(sessionResource) {
    if (getChatSessionType(sessionResource) !== localChatSessionType && !IsSessionsWindowContext.getValue(this.contextKeyService)) {
      return;
    }
    this.logService.debug(`[Delegation] archiveLocalParentSession: archiving session ${sessionResource.toString()}`);
    await this.chatService.getSession(sessionResource)?.editingSession?.accept();
    const session = this.agentSessionsService.getSession(sessionResource);
    if (session) {
      session.setArchived(true);
      this.logService.debug("[Delegation] archiveLocalParentSession: session archived successfully");
    } else {
      this.logService.warn(`[Delegation] archiveLocalParentSession: session not found in agentSessionsService for ${sessionResource.toString()}`);
    }
  }
  /**
   * Mark the chat shown in this widget as read-only (non-interactive) or not.
   * Read-only chats hide the composer and expose a context key so mutating
   * actions (e.g. Start Over, Restore Checkpoint) are not offered.
   */
  setReadOnly(readOnly) {
    const wasReadOnly = this._readOnly;
    this._readOnly = readOnly;
    this._readOnlyContextKey.set(readOnly);
    if (readOnly) {
      if (this.viewModel?.editing) {
        this.finishedEditing();
      }
      this.chatSuggestNextWidget.hide();
      if (this.hasInputFocus()) {
        if (this.listWidget.focusLastItem(true) < 0) {
          this.listWidget.focus();
        }
      }
    } else if (wasReadOnly) {
      this.renderChatSuggestNextWidget();
    }
    this.readOnlyBanner?.setVisible(readOnly);
    this.setInputVisible(!readOnly);
    this._applyRendererEditable(!readOnly);
    if (this.visible) {
      this.listWidget?.rerender();
    }
  }
  /**
   * Applies the renderer's `editable` option, forcing it off while the chat is
   * read-only so the lock/unlock transitions can never re-enable request
   * editing on a read-only chat.
   */
  _applyRendererEditable(editable) {
    this.listWidget?.updateRendererOptions({ editable: editable && !this._readOnly });
  }
  /**
   * Show or hide the input part. Hidden inputs are removed from the DOM flow
   * unless they contain persistent content. Used to render read-only chats
   * without a composer while retaining input-adjacent status controls.
   */
  setInputVisible(visible) {
    const changed = this._inputVisible !== visible;
    this._inputVisible = visible;
    this._applyInputVisibility();
    if (changed && this.bodyDimension) {
      this._layoutListForInputHeight();
    }
  }
  _applyInputVisibility() {
    const inputElement = this.inputPartDisposable.value?.element;
    if (inputElement) {
      inputElement.classList.toggle("chat-input-hidden", !this._inputVisible);
      inputElement.style.display = "";
    }
  }
  setVisible(visible) {
    const wasVisible = this._visible;
    this._visible = visible;
    this.visibleChangeCount++;
    this.listWidget.setVisible(visible);
    this.input.setVisible(visible);
    if (visible) {
      if (!wasVisible) {
        this.visibilityTimeoutDisposable.value = disposableTimeout(() => {
          if (this._visible) {
            this.onDidChangeItems(true);
          }
        }, 0);
        this.visibilityAnimationFrameDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
          this._onDidShow.fire();
        });
      }
    } else if (wasVisible) {
      this._onDidHide.fire();
    }
  }
  createList(listContainer, options) {
    const overflowWidgetsContainer = document.createElement("div");
    overflowWidgetsContainer.classList.add("chat-overflow-widget-container", "monaco-editor");
    listContainer.append(overflowWidgetsContainer);
    this.listWidget = this._register(this.instantiationService.createInstance(
      ChatListWidget,
      listContainer,
      {
        rendererOptions: options,
        defaultElementHeight: this.viewOptions.defaultElementHeight ?? 200,
        overflowWidgetsDomNode: overflowWidgetsContainer,
        styles: {
          listForeground: this.styles.listForeground,
          listBackground: this.styles.listBackground
        },
        currentChatMode: () => this.input.currentModeKind,
        filter: this.viewOptions.filter ? { filter: this.viewOptions.filter.bind(this.viewOptions) } : void 0,
        viewModel: this.viewModel,
        editorOptions: this.editorOptions,
        location: this.location,
        getSelectedModelRequestOptions: () => this.getSelectedModelRequestOptions(),
        getCurrentModeInfo: () => this.input.currentModeInfo
      }
    ));
    this._register(this.listWidget.onDidClickRequest(async (item) => {
      this.clickedRequest(item);
    }));
    this._register(this.listWidget.onDidRerender((item) => {
      if (isRequestVM(item.currentElement) && this.configurationService.getValue("chat.editRequests") !== "input") {
        if (!item.rowContainer.contains(this.inputContainer)) {
          item.requestTimestampContainer.before(this.inputContainer);
        }
        this.input.focus();
      }
    }));
    this._register(this.listWidget.onDidDispose(() => {
      this.focusedInputDOM.appendChild(this.inputContainer);
      this.input.focus();
    }));
    this._register(this.listWidget.onDidFocusOutside(() => {
      this.finishedEditing();
    }));
    this._register(this.listWidget.onDidClickFollowup((item) => {
      this.acceptInput(item.message);
    }));
    this._register(this.listWidget.onDidChangeContentHeight(() => {
      this._onDidChangeContentHeight.fire();
    }));
    this._register(this.listWidget.onDidFocus(() => {
      this._onDidFocus.fire();
    }));
    this._register(this.listWidget.onDidScroll(() => {
      this._onDidScroll.fire();
    }));
  }
  startEditing(requestId) {
    if (this._readOnly) {
      return;
    }
    const editedRequest = this.listWidget.getTemplateDataForRequestId(requestId);
    if (editedRequest) {
      this.clickedRequest(editedRequest);
    }
  }
  clickedRequest(item) {
    const currentElement = item.currentElement;
    if (isRequestVM(currentElement) && !this.viewModel?.editing) {
      const requests = this.viewModel?.model.getRequests();
      if (!requests || !this.viewModel?.sessionResource) {
        return;
      }
      if (this.viewModel?.model.checkpoint) {
        this.recentlyRestoredCheckpoint = true;
      }
      this.viewModel?.model.setCheckpoint(currentElement.id);
      const currentContext = [];
      const addedContextIds = /* @__PURE__ */ new Set();
      const addToContext = (entry) => {
        const dedupKey = entry.range ? `${entry.id}:${entry.range.start}-${entry.range.endExclusive}` : entry.id;
        if (addedContextIds.has(dedupKey) || isWorkspaceVariableEntry(entry)) {
          return;
        }
        if ((isPromptFileVariableEntry(entry) || isPromptTextVariableEntry(entry)) && entry.automaticallyAdded) {
          return;
        }
        addedContextIds.add(dedupKey);
        currentContext.push(entry);
      };
      for (let i = requests.length - 1; i >= 0; i -= 1) {
        const request = requests[i];
        if (request.id === currentElement.id) {
          request.setShouldBeBlocked(false);
          request.attachedContext?.forEach(addToContext);
        }
      }
      currentElement.variables.forEach(addToContext);
      this.viewModel?.setEditing(currentElement);
      if (item?.contextKeyService) {
        ChatContextKeys.currentlyEditing.bindTo(item.contextKeyService).set(true);
      }
      const isEditingSentRequest = currentElement.pendingKind === void 0 ? ChatContextKeys.EditingRequestType.Sent : currentElement.pendingKind === ChatRequestQueueKind.Queued ? ChatContextKeys.EditingRequestType.Queue : ChatContextKeys.EditingRequestType.Steer;
      const isInput = this.configurationService.getValue("chat.editRequests") === "input";
      this.inputPart?.setEditing(!!this.viewModel?.editing && isInput, isEditingSentRequest);
      if (!isInput) {
        this.inputContainer = dom.$(".chat-edit-input-container");
        item.requestTimestampContainer.before(this.inputContainer);
        this.createInput(this.inputContainer);
        this.input.setChatMode(this.inputPart.currentModeObs.get().id);
        this.input.setPermissionLevel(this.inputPart.currentModeInfo.permissionLevel ?? ChatPermissionLevel.Default);
        this.input.setEditing(true, isEditingSentRequest);
        this._onDidChangeActiveInputEditor.fire();
      } else {
        this.inputPart.element.classList.add("editing");
      }
      if (currentElement.modelId) {
        void this.input.requestModelByIdentifier(currentElement.modelId);
      }
      this.inputPart.toggleChatInputOverlay(!isInput);
      if (currentContext.length > 0) {
        this.input.attachmentModel.addContext(...currentContext);
      }
      this.inputPart.dnd.setDisabledOverlay(!isInput);
      this.input.renderAttachedContext();
      this.input.setValue(currentElement.messageText, false);
      const dynamicVariableModel = this.getContrib(ChatDynamicVariableModel.ID);
      const editorModel = this.input.inputEditor.getModel();
      if (dynamicVariableModel && editorModel) {
        const modelTextLength = editorModel.getValueLength();
        for (const entry of currentContext) {
          if (entry.range) {
            if (entry.range.start >= entry.range.endExclusive) {
              continue;
            }
            if (entry.range.start < 0 || entry.range.endExclusive > modelTextLength) {
              continue;
            }
            const startPos = editorModel.getPositionAt(entry.range.start);
            const endPos = editorModel.getPositionAt(entry.range.endExclusive);
            dynamicVariableModel.addReference({
              id: entry.id,
              range: new Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
              data: entry.value,
              fullName: entry.fullName,
              icon: entry.icon,
              modelDescription: entry.modelDescription,
              isFile: entry.kind === "file",
              isDirectory: entry.kind === "directory"
            });
          }
        }
      }
      this._editingAutoScrollHold.value = this.listWidget.acquireAutoScrollHold();
      this.onDidChangeItems();
      this.input.inputEditor.focus();
      this._register(this.inputPart.onDidClickOverlay(() => {
        if (this.viewModel?.editing && this.configurationService.getValue("chat.editRequests") !== "input") {
          this.finishedEditing();
        }
      }));
      if (!isInput) {
        this._register(this.inlineInputPart.inputEditor.onDidChangeModelContent(() => {
          this.listWidget.scrollToCurrentItem(currentElement);
        }));
        this._register(this.inlineInputPart.inputEditor.onDidChangeCursorSelection((e) => {
          this.listWidget.scrollToCurrentItem(currentElement);
        }));
      }
    }
    this.telemetryService.publicLog2("chat.startEditingRequests", {
      editRequestType: this.configurationService.getValue("chat.editRequests")
    });
  }
  finishedEditing(completedEdit) {
    this._editingAutoScrollHold.clear();
    const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
    if (this.recentlyRestoredCheckpoint) {
      this.recentlyRestoredCheckpoint = false;
    } else {
      this.viewModel?.model.setCheckpoint(void 0);
    }
    this.inputPart.dnd.setDisabledOverlay(false);
    if (editedRequest?.contextKeyService) {
      ChatContextKeys.currentlyEditing.bindTo(editedRequest.contextKeyService).set(false);
    }
    const isInput = this.configurationService.getValue("chat.editRequests") === "input";
    if (!isInput) {
      this.inputPart.setChatMode(this.input.currentModeObs.get().id);
      this.inputPart.setPermissionLevel(this.input.currentModeInfo.permissionLevel ?? ChatPermissionLevel.Default);
      const editModelId = this.input.currentLanguageModel;
      if (editModelId) {
        void this.inputPart.requestModelByIdentifier(editModelId);
      }
      this.inputPart?.toggleChatInputOverlay(false);
      try {
        if (editedRequest?.rowContainer?.contains(this.inputContainer)) {
          editedRequest.rowContainer.removeChild(this.inputContainer);
        } else if (this.inputContainer.parentElement) {
          this.inputContainer.parentElement.removeChild(this.inputContainer);
        }
      } catch (e) {
        this.logService.error("Error occurred while finishing editing:", e);
      }
      this.inputContainer = dom.$(".empty-chat-state");
      this.input.dispose();
    }
    if (isInput) {
      this.inputPart.element.classList.remove("editing");
    }
    this.viewModel?.setEditing(void 0);
    this.inputPart?.setEditing(false, void 0);
    if (!isInput) {
      this._onDidChangeActiveInputEditor.fire();
    }
    this.onDidChangeItems();
    this.telemetryService.publicLog2("chat.editRequestsFinished", {
      editRequestType: this.configurationService.getValue("chat.editRequests"),
      editCanceled: !completedEdit
    });
    this.inputPart.focus();
  }
  getWidgetViewKindTag() {
    if (!this.viewContext) {
      return "editor";
    } else if (isIChatViewViewContext(this.viewContext)) {
      return "view";
    } else {
      return "quick";
    }
  }
  createInput(container, options) {
    const commonConfig = {
      renderFollowups: options?.renderFollowups ?? true,
      renderStyle: options?.renderStyle === "minimal" ? "compact" : options?.renderStyle,
      renderInputToolbarBelowInput: options?.renderInputToolbarBelowInput ?? false,
      menus: {
        executeToolbar: MenuId.ChatExecute,
        telemetrySource: "chatWidget",
        ...this.viewOptions.menus
      },
      editorOverflowWidgetsDomNode: this.viewOptions.editorOverflowWidgetsDomNode,
      enableImplicitContext: this.viewOptions.enableImplicitContext,
      renderWorkingSet: this.viewOptions.enableWorkingSet === "explicit",
      supportsChangingModes: this.viewOptions.supportsChangingModes,
      dndContainer: this.viewOptions.dndContainer,
      inputEditorMinLines: this.viewOptions.inputEditorMinLines,
      widgetViewKindTag: this.getWidgetViewKindTag(),
      defaultMode: this.viewOptions.defaultMode,
      sessionTypePickerDelegate: this.viewOptions.sessionTypePickerDelegate,
      workspacePickerDelegate: this.viewOptions.workspacePickerDelegate,
      isSessionsWindow: this.viewOptions.isSessionsWindow,
      onDidChangeInputOnboardingVisible: (visible) => this.setInputOnboardingVisible(visible)
    };
    if (this.viewModel?.editing) {
      const editedRequest = this.listWidget.getTemplateDataForRequestId(this.viewModel?.editing?.id);
      const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, editedRequest?.contextKeyService])));
      this.inlineInputPartDisposable.value = scopedInstantiationService.createInstance(
        ChatInputPart,
        this.location,
        commonConfig,
        this.styles,
        true
      );
    } else {
      this.inputPartDisposable.value = this.instantiationService.createInstance(
        ChatInputPart,
        this.location,
        commonConfig,
        this.styles,
        false
      );
      this._register(autorun((reader) => {
        this.inputPart.height.read(reader);
        if (!this.listWidget) {
          return;
        }
        if (this.bodyDimension) {
          this._layoutListForInputHeight();
        }
        this._onDidChangeContentHeight.fire();
      }));
    }
    this.input.render(container, "", this);
    this._applyInputVisibility();
    if (this.bodyDimension?.width) {
      this.input.layout(this.bodyDimension.width);
    }
    this._register(this.input.onDidLoadInputState(() => {
      this.refreshParsedInput();
    }));
    this._register(this.input.onDidFocus(() => this._onDidFocus.fire()));
    this._register(this.input.onDidAcceptFollowup((e) => {
      if (!this.viewModel) {
        return;
      }
      let msg = "";
      if (e.followup.agentId && e.followup.agentId !== this.chatAgentService.getDefaultAgent(this.location, this.input.currentModeKind)?.id) {
        const agent = this.chatAgentService.getAgent(e.followup.agentId);
        if (!agent) {
          return;
        }
        this.lastSelectedAgent = agent;
        msg = `${chatAgentLeader}${agent.name} `;
        if (e.followup.subCommand) {
          msg += `${chatSubcommandLeader}${e.followup.subCommand} `;
        }
      } else if (!e.followup.agentId && e.followup.subCommand && this.chatSlashCommandService.hasCommand(e.followup.subCommand, getChatSessionType(this.viewModel.model.sessionResource))) {
        msg = `${chatSubcommandLeader}${e.followup.subCommand} `;
      }
      msg += e.followup.message;
      this.acceptInput(msg);
      if (!e.response) {
        return;
      }
      this.chatService.notifyUserAction({
        sessionResource: this.viewModel.sessionResource,
        requestId: e.response.requestId,
        agentId: e.response.agent?.id,
        command: e.response.slashCommand?.name,
        result: e.response.result,
        action: {
          kind: "followUp",
          followup: e.followup
        }
      });
    }));
    this._register(this.inputEditor.onDidChangeModelContent(() => {
      this.parsedChatRequest = void 0;
      this.updateChatInputContext();
    }));
    this._register(this.chatAgentService.onDidChangeAgents(() => {
      this.parsedChatRequest = void 0;
      this.renderWelcomeViewContentIfNeeded();
    }));
    this._register(this.input.onDidChangeCurrentChatMode(() => {
      this.renderWelcomeViewContentIfNeeded();
      this.refreshParsedInput();
      this.renderFollowups();
      this.renderChatSuggestNextWidget();
    }));
    const foregroundSessionCountContextKeys = /* @__PURE__ */ new Set([ChatContextKeys.foregroundSessionCount.key]);
    const hasByokModelsContextKeys = /* @__PURE__ */ new Set([ChatEntitlementContextKeys.hasByokModels.key]);
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(foregroundSessionCountContextKeys) && this.isEmpty()) {
        this.renderGettingStartedTipIfNeeded();
      }
      if (e.affectsSome(hasByokModelsContextKeys)) {
        this.updateChatViewVisibility();
      }
    }));
    let previousModelIdentifier;
    this._register(autorun((reader) => {
      const modelIdentifier = this.inputPart.selectedLanguageModel.read(reader)?.identifier;
      if (previousModelIdentifier === void 0) {
        previousModelIdentifier = modelIdentifier;
        return;
      }
      if (previousModelIdentifier === modelIdentifier) {
        return;
      }
      previousModelIdentifier = modelIdentifier;
      if (!this._gettingStartedTipPartRef) {
        return;
      }
      this.chatTipService.getWelcomeTip(this.contextKeyService);
    }));
    this._register(autorun((r) => {
      const toolSetIds = /* @__PURE__ */ new Set();
      const toolIds = /* @__PURE__ */ new Set();
      for (const [entry, enabled] of this.input.selectedToolsModel.entriesMap.read(r)) {
        if (enabled) {
          if (isToolSet(entry)) {
            toolSetIds.add(entry.id);
          } else {
            toolIds.add(entry.id);
          }
        }
      }
      const disabledTools = this.input.attachmentModel.attachments.filter((a) => a.kind === "tool" && !toolIds.has(a.id) || a.kind === "toolset" && !toolSetIds.has(a.id)).map((a) => a.id);
      this.input.attachmentModel.updateContext(disabledTools, Iterable.empty());
      this.refreshParsedInput();
    }));
  }
  onDidStyleChange() {
    this.container.style.setProperty("--vscode-interactive-result-editor-background-color", this.editorOptions.configuration.resultEditor.backgroundColor?.toString() ?? "");
    this.container.style.setProperty("--vscode-interactive-session-foreground", this.editorOptions.configuration.foreground?.toString() ?? "");
    this.container.style.setProperty("--vscode-chat-list-background", this.themeService.getColorTheme().getColor(this.styles.listBackground)?.toString() ?? "");
  }
  /**
   * Updates the widget's color styles after construction. Propagates the new
   * `listForeground`/`listBackground` to the list widget, pushes the new color
   * tokens into `editorOptions` so subscribers (code blocks, result/input editor
   * backgrounds, container CSS variables) pick them up via `onDidChange`, and
   * refreshes the CSS variables the chat container exposes for stylesheet rules.
   */
  setStyles(styles) {
    const oldStyles = this.styles;
    this.styles = styles;
    const listColorsChanged = oldStyles.listBackground !== styles.listBackground || oldStyles.listForeground !== styles.listForeground;
    if (listColorsChanged) {
      this.listWidget?.setStyles({
        listForeground: styles.listForeground,
        listBackground: styles.listBackground
      });
    }
    const editorColorsChanged = oldStyles.listForeground !== styles.listForeground || oldStyles.inputEditorBackground !== styles.inputEditorBackground || oldStyles.resultEditorBackground !== styles.resultEditorBackground;
    if (editorColorsChanged && this.container) {
      this.editorOptions.setColors(styles.listForeground, styles.inputEditorBackground, styles.resultEditorBackground);
    }
  }
  setModel(model) {
    if (!this.container || !this.inputPart) {
      this.logService.warn("ChatWidget#setModel called before render() completed");
      return;
    }
    const currentInputModel = this.viewModel?.model?.inputModel?.state?.get();
    if (!model) {
      logChangesToStateModel(this.viewModel?.model?.inputModel, `ChatWidget.setModel to empty, old ${this.viewModel?.sessionResource.toString()}`, void 0, currentInputModel, this.logService);
      this.inputPart.flushInputStateToModel();
      if (this.viewModel?.editing) {
        this.finishedEditing();
      }
      this.clearGettingStartedTip();
      this.viewModel = void 0;
      this.updateWorkingProgressBorder();
      this.onDidChangeItems();
      this._hasPendingRequestsContextKey.set(false);
      if (!this.viewOptions.isSessionsWindow) {
        this.setReadOnly(false);
      }
      return;
    }
    if (isEqual(model.sessionResource, this.viewModel?.sessionResource)) {
      return;
    }
    logChangesToStateModel(model.inputModel, `ChatWidget.setModel new ${model.sessionResource.toString()}, old ${this.viewModel?.sessionResource.toString()}`, model.inputModel.state.get(), currentInputModel, this.logService);
    if (this.viewModel?.editing) {
      this.finishedEditing();
    }
    this.inputPart?.clearTodoListWidget(model.sessionResource, false);
    this.inputPart?.clearArtifactsWidget();
    this.chatSuggestNextWidget.hide();
    this.chatTipService.resetSession();
    this.clearGettingStartedTip();
    this.inputPart.setInputModel(model.inputModel, model.getRequests().length === 0, model.sessionResource);
    this.viewModel = this.instantiationService.createInstance(ChatViewModel, model, void 0);
    if (!this.viewOptions.isSessionsWindow) {
      this.viewModelDisposables.add(autorun((reader) => this.setReadOnly(model.isReadOnly.read(reader))));
    }
    this.listWidget.setViewModel(this.viewModel);
    if (this._lockedAgent) {
      let placeholder = this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id)?.inputPlaceholder;
      if (!placeholder) {
        placeholder = localize("chat.input.placeholder.lockedToAgent", "Chat with {0}", this._lockedAgent.displayName || this._lockedAgent.name);
      }
      this.viewModel.setInputPlaceholder(placeholder);
      this.inputEditor.updateOptions({ placeholder });
    } else if (this.viewModel.inputPlaceholder) {
      this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
    }
    this.viewModelDisposables.add(Event.runAndSubscribe(Event.accumulate(this.viewModel.onDidChange), ((events) => {
      if (!this.viewModel || this._store.isDisposed) {
        return;
      }
      this.requestInProgress.set(this.viewModel.model.requestInProgress.get());
      this.hasActiveRequest.set(this.viewModel.model.hasActiveRequest.get());
      this.updateWorkingProgressBorder();
      if (events?.some((e) => e?.kind === "changePlaceholder")) {
        this.inputEditor.updateOptions({ placeholder: this.viewModel.inputPlaceholder });
      }
      this.onDidChangeItems();
      if (events?.some((e) => e?.kind === "addRequest") && this.visible && !this.listWidget.isAutoScrollHeld) {
        this.listWidget.scrollToEnd();
      }
    })));
    this.viewModelDisposables.add(this.viewModel.onDidDisposeModel(() => {
      if (this.viewModel?.editing) {
        this.finishedEditing();
      }
      this.viewModel = void 0;
      this.updateWorkingProgressBorder();
      this.onDidChangeItems();
    }));
    this._sessionIsEmptyContextKey.set(model.getRequests().length === 0);
    const updateSupportsFork = () => {
      const supportsFork = this.chatSessionsService.sessionSupportsFork(model.sessionResource);
      this._chatSessionSupportsForkContextKey.set(supportsFork);
      this.listWidget?.updateRendererOptions({ supportsFork });
    };
    updateSupportsFork();
    this.viewModelDisposables.add(this.chatSessionsService.onDidChangeAvailability(() => updateSupportsFork()));
    this._sessionHasDebugDataContextKey.set(this.chatDebugService.getEvents(model.sessionResource).length > 0);
    let lastSteeringCount = 0;
    const updatePendingRequestKeys = (announceSteering) => {
      const pendingRequests = model.getPendingRequests();
      const pendingCount = pendingRequests.length;
      this._hasPendingRequestsContextKey.set(pendingCount > 0);
      const steeringCount = pendingRequests.filter((pending) => pending.kind === ChatRequestQueueKind.Steering).length;
      if (announceSteering && steeringCount > 0 && lastSteeringCount === 0) {
        status(localize("chat.pendingRequests.steeringQueued", "Steering"));
      }
      lastSteeringCount = steeringCount;
    };
    updatePendingRequestKeys(false);
    this.viewModelDisposables.add(model.onDidChangePendingRequests(() => updatePendingRequestKeys(true)));
    this.refreshParsedInput();
    this.viewModelDisposables.add(model.onDidChange((e) => {
      if (e.kind === "setAgent") {
        this._onDidChangeAgent.fire({ agent: e.agent, slashCommand: e.command });
        this._updateAgentCapabilitiesContextKeys(e.agent);
      }
      if (e.kind === "addRequest") {
        this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, false);
        this._sessionIsEmptyContextKey.set(false);
        this.chatSuggestNextWidget.hide();
      }
      if (e.kind === "removeRequest") {
        this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
        this.chatSuggestNextWidget.hide();
        this._sessionIsEmptyContextKey.set((this.viewModel?.model.getRequests().length ?? 0) === 0);
      }
      if (e.kind === "completedRequest") {
        const lastRequest = this.viewModel?.model.getRequests().at(-1);
        const wasCancelled = lastRequest?.response?.isCanceled ?? false;
        if (wasCancelled) {
          this.inputPart?.clearTodoListWidget(this.viewModel?.sessionResource, true);
        }
        this.renderChatSuggestNextWidget();
        if (this.visible && this.viewModel?.sessionResource) {
          this.agentSessionsService.getSession(this.viewModel.sessionResource)?.setRead(true);
        }
      }
    }));
    if (this.listWidget && this.visible) {
      this.onDidChangeItems();
      this.listWidget.scrollToEnd();
    }
    this.renderChatSuggestNextWidget();
    this.updateChatInputContext();
    this.input.renderChatTodoListWidget(this.viewModel.sessionResource);
    this.input.renderArtifactsWidget(this.viewModel.sessionResource);
  }
  getFocus() {
    return this.listWidget.getFocus()[0] ?? void 0;
  }
  reveal(item, relativeTop) {
    this.listWidget.reveal(item, relativeTop);
  }
  /**
   * The top offset of an item in transcript content space (same space as
   * `scrollTop`/`scrollHeight`), or `undefined` if it is not in the list.
   * Virtualization-safe for off-screen items (reads the layout height model).
   */
  getElementTop(item) {
    return this.listWidget.getElementTop(item);
  }
  focus(item) {
    if (!this.listWidget.hasElement(item)) {
      return;
    }
    this.listWidget.focusItem(item);
  }
  setInputPlaceholder(placeholder) {
    this.viewModel?.setInputPlaceholder(placeholder);
  }
  resetInputPlaceholder() {
    this.viewModel?.resetInputPlaceholder();
  }
  setInput(value = "") {
    this.input.setValue(value, false);
    this.refreshParsedInput();
  }
  getInput() {
    return this.input.inputEditor.getValue();
  }
  getContrib(id) {
    return this.contribs.find((c) => c.id === id);
  }
  // Coding agent locking methods
  lockToCodingAgent(name, displayName, agentId, agentHostProviderId) {
    if (this._lockedAgent?.id === agentId && this._lockedAgent.name === name && this._lockedAgent.displayName === displayName && this._lockedAgent.agentHostProviderId === agentHostProviderId) {
      return;
    }
    this._lockedAgent = {
      id: agentId,
      name,
      prefix: `@${name} `,
      displayName,
      agentHostProviderId
    };
    this._lockedToCodingAgentContextKey.set(true);
    this._lockedCodingAgentIdContextKey.set(agentId);
    this._chatIsAgentHostSessionContextKey.set(!!agentHostProviderId);
    this._chatAgentHostProviderIdContextKey.set(agentHostProviderId ?? "");
    this.renderWelcomeViewContentIfNeeded();
    const agent = this.chatAgentService.getAgent(agentId);
    this._updateAgentCapabilitiesContextKeys(agent);
    const supportsCheckpoints = this._attachmentCapabilities.supportsCheckpoints ?? false;
    this.listWidget?.updateRendererOptions({ restorable: supportsCheckpoints, editable: supportsCheckpoints && !this._readOnly, noFooter: false, progressMessageAtBottomOfResponse: true });
    if (this.visible) {
      this.listWidget?.rerender();
    }
  }
  unlockFromCodingAgent() {
    if (!this._lockedAgent) {
      return;
    }
    this._lockedAgent = void 0;
    this._lockedToCodingAgentContextKey.set(false);
    this._lockedCodingAgentIdContextKey.set("");
    this._chatIsAgentHostSessionContextKey.set(false);
    this._chatAgentHostProviderIdContextKey.set("");
    this._chatSessionSupportsForkContextKey.set(false);
    this._updateAgentCapabilitiesContextKeys(void 0);
    this.renderWelcomeViewContentIfNeeded();
    if (this.viewModel) {
      this.viewModel.resetInputPlaceholder();
    }
    this.inputEditor?.updateOptions({ placeholder: void 0 });
    this.listWidget?.updateRendererOptions({ restorable: true, editable: !this._readOnly, progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask });
    if (this.visible) {
      this.listWidget?.rerender();
    }
  }
  get isLockedToCodingAgent() {
    return !!this._lockedAgent;
  }
  get lockedAgentId() {
    return this._lockedAgent?.id;
  }
  logInputHistory() {
    this.input.logInputHistory();
  }
  async acceptInput(query, options) {
    if (this._readOnly || this.input.hasPendingProgrammaticModelSelection) {
      return void 0;
    }
    if (this.viewModel) {
      markChat(this.viewModel.sessionResource, ChatPerfMark.RequestStart);
    }
    return this._acceptInput(query ? { query } : void 0, options);
  }
  async rerunLastRequest() {
    if (this._readOnly || !this.viewModel) {
      return;
    }
    const sessionResource = this.viewModel.sessionResource;
    const lastRequest = this.chatService.getSession(sessionResource)?.getRequests().at(-1);
    if (!lastRequest) {
      return;
    }
    const options = {
      attempt: lastRequest.attempt + 1,
      location: this.location,
      ...this.getSelectedModelRequestOptions(),
      modeInfo: this.input.currentModeInfo
    };
    const result = await this.chatService.resendRequest(lastRequest, options);
    this.logThinkingStyleUsage("rerun");
    return result;
  }
  getConfiguredThinkingStyle() {
    const thinkingStyle = this.configurationService.getValue(ChatConfiguration.ThinkingStyle);
    switch (thinkingStyle) {
      case ThinkingDisplayMode.Collapsed:
      case ThinkingDisplayMode.CollapsedPreview:
      case ThinkingDisplayMode.FixedScrolling:
        return thinkingStyle;
      default:
        return ThinkingDisplayMode.FixedScrolling;
    }
  }
  logThinkingStyleUsage(requestKind) {
    this.telemetryService.publicLog2("chat.thinkingStyleUsage", {
      thinkingStyle: this.getConfiguredThinkingStyle(),
      location: this.location,
      requestKind
    });
  }
  _cancelGoalSummary() {
    this._goalSummaryTokenSource?.dispose(true);
    this._goalSummaryTokenSource = void 0;
  }
  _maybeStartGoalSummary(prompt) {
    const inputPart = this.inputPartDisposable.value;
    if (!inputPart) {
      return;
    }
    const sessionResource = this.viewModel?.model.sessionResource;
    const isLocalHarness = !!sessionResource && getChatSessionType(sessionResource) === localChatSessionType;
    const permissionLevel = inputPart.currentModeInfo?.permissionLevel;
    const goalModeOn = this.configurationService.getValue(ChatConfiguration.AutopilotAdvancedEnabled) === true;
    if (!isLocalHarness || permissionLevel !== ChatPermissionLevel.Autopilot || !goalModeOn) {
      this._cancelGoalSummary();
      inputPart.clearGoalBanner();
      return;
    }
    this._goalBannerDismissedForCurrentRequest = false;
    this._goalBannerDismissListener.value = inputPart.onDidDismissGoalBanner(() => {
      this._goalBannerDismissedForCurrentRequest = true;
      this._cancelGoalSummary();
    });
    this._cancelGoalSummary();
    const cts = new CancellationTokenSource();
    this._goalSummaryTokenSource = cts;
    inputPart.showGoalBannerLoading();
    this.chatGoalSummaryService.summarize(prompt, cts.token).then((summary) => {
      if (cts.token.isCancellationRequested || this._goalBannerDismissedForCurrentRequest) {
        return;
      }
      const current = this.inputPartDisposable.value;
      if (!current) {
        return;
      }
      if (summary) {
        current.setGoalBanner(summary);
      } else {
        current.clearGoalBanner();
      }
    }, () => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      this.inputPartDisposable.value?.clearGoalBanner();
    });
  }
  /**
   * @returns `false` when the prompt metadata requested an agent switch that the
   * user cancelled, signalling that input submission should be aborted.
   */
  async _applyPromptFileIfSet(requestInput, sessionResource) {
    const agentSlashPromptPart = this.parsedInput.parts.find((r) => r instanceof ChatRequestSlashPromptPart);
    if (!agentSlashPromptPart) {
      return true;
    }
    this.chatTipService.recordSlashCommandUsage(agentSlashPromptPart.name);
    const slashCommand = await this.customizationHarnessService.resolvePromptSlashCommand(agentSlashPromptPart.name, sessionResource, CancellationToken.None);
    if (!slashCommand) {
      return true;
    }
    const parseResult = slashCommand.parsedPromptFile;
    const refs = parseResult.body?.variableReferences.map(({ name, offset, fullLength }) => ({ name, range: new OffsetRange(offset, offset + fullLength) })) ?? [];
    const toolReferences = this.toolsService.toToolReferences(refs);
    requestInput.attachedContext.insertFirst(toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, void 0, true, toolReferences));
    const promptRunEvent = {
      storage: slashCommand.storage
    };
    if (slashCommand.extension) {
      promptRunEvent.extensionId = slashCommand.extension.identifier.value;
      promptRunEvent.promptName = slashCommand.name;
    } else {
      promptRunEvent.promptNameHash = hash(slashCommand.name).toString(16);
    }
    this.telemetryService.publicLog2("chat.promptRun", promptRunEvent);
    if (parseResult.header) {
      const applied = await this._applyPromptMetadata(parseResult.header, requestInput);
      if (!applied) {
        return false;
      }
    }
    return true;
  }
  async _acceptInput(query, options = {}) {
    if (!query && this.input.generating) {
      const generatingAutoSubmitWindow = 500;
      const start = Date.now();
      await this.input.generating;
      if (Date.now() - start > generatingAutoSubmitWindow) {
        return;
      }
    }
    while (!this._viewModel && !this._store.isDisposed) {
      await Event.toPromise(this.onDidChangeViewModel, this._store);
    }
    if (!this.viewModel) {
      return;
    }
    if (this.viewOptions.submitHandler) {
      const inputValue2 = !query ? this.getInput() : query.query;
      const handled = await this.viewOptions.submitHandler(inputValue2, this.input.currentModeKind);
      if (handled) {
        return;
      }
    }
    const isUserQuery = !query;
    const inputValue = isUserQuery ? this.getInput() : query.query;
    if (this.viewModel.model.hasActiveRequest.get() && await this._tryExecuteImmediateSlashCommand(inputValue, isUserQuery ? this.parsedInput : void 0)) {
      this.setInput("");
      return;
    }
    if (isUserQuery) {
      const preSubmitResult = await this.chatSubmitRequestHandlerService.tryHandle({
        sessionResource: this.viewModel.sessionResource,
        input: inputValue
      });
      if (preSubmitResult) {
        this.setInput("");
        return;
      }
    }
    if (!options.preserveInput) {
      this._onDidAcceptInput.fire();
    }
    this.listWidget.setScrollLock(this.isLockedToCodingAgent || !!checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll));
    const requestInputs = {
      input: inputValue,
      // preserveInput means the input box holds an unrelated draft, so its
      // attachments belong to that draft and must not be sent with this query.
      attachedContext: options?.preserveInput ? new ChatRequestVariableSet() : options?.enableImplicitContext === false ? this.input.getAttachedContext() : this.input.getAttachedAndImplicitContext()
    };
    if (this.viewModel.model.requestInProgress.get() && await this._executeSlashCommandDuringRequest(requestInputs.input, isUserQuery, options.preserveFocus)) {
      return;
    }
    const isEditing = this.viewModel?.editing;
    const editedModelRequestOptions = isEditing && this.configurationService.getValue("chat.editRequests") !== "input" ? this.getSelectedModelRequestOptions() : void 0;
    let cancelledCurrentRequest = false;
    if (isEditing) {
      this.inputPart?.clearToolConfirmationCarousel();
      const editingPendingRequest = this.viewModel.editing.pendingKind;
      if (editingPendingRequest !== void 0) {
        const editingRequestId = this.viewModel.editing.id;
        this.chatService.removePendingRequest(this.viewModel.sessionResource, editingRequestId);
        if (!options.cancelCurrentRequest) {
          options.queue ??= editingPendingRequest;
        }
      } else {
        await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, "acceptInput-editing");
        cancelledCurrentRequest = true;
        options.queue = void 0;
      }
      const preserveCheckpoint = this._lockedAgent && !!this._attachmentCapabilities.supportsCheckpoints;
      if (preserveCheckpoint) {
        this.recentlyRestoredCheckpoint = true;
      }
      this.finishedEditing(true);
      if (!preserveCheckpoint) {
        this.viewModel.model?.setCheckpoint(void 0);
      }
    }
    const model = this.viewModel.model;
    if (options.cancelCurrentRequest && model.requestInProgress.get() && !cancelledCurrentRequest) {
      await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, "acceptInput-stopAndSend");
      cancelledCurrentRequest = true;
      options.queue = void 0;
    }
    const requestInProgress = model.requestInProgress.get();
    if (!options.cancelCurrentRequest && model.requestNeedsInput.get() && !model.getPendingRequests().length) {
      await this.chatService.cancelCurrentRequestForSession(this.viewModel.sessionResource, "acceptInput-needsInput");
      options.queue ??= ChatRequestQueueKind.Queued;
    }
    if (requestInProgress && !options.cancelCurrentRequest) {
      options.queue ??= ChatRequestQueueKind.Queued;
    }
    if (!requestInProgress && !isEditing && !await this.confirmPendingRequestsBeforeSend(model, options)) {
      return;
    }
    if (!options.preserveInput) {
      const promptApplied = await this._applyPromptFileIfSet(requestInputs, this.viewModel.sessionResource);
      if (!promptApplied) {
        return;
      }
    }
    if (this.viewOptions.enableWorkingSet !== void 0 && this.input.currentModeKind === ChatModeKind.Edit) {
      const uniqueWorkingSetEntries = new ResourceSet();
      const editingSessionAttachedContext = requestInputs.attachedContext;
      const previousRequests = this.viewModel.model.getRequests();
      for (const request of previousRequests) {
        for (const variable of request.variableData.variables) {
          if (URI.isUri(variable.value) && variable.kind === "file") {
            const uri = variable.value;
            if (!uniqueWorkingSetEntries.has(uri)) {
              editingSessionAttachedContext.add(variable);
              uniqueWorkingSetEntries.add(variable.value);
            }
          }
        }
      }
      requestInputs.attachedContext = editingSessionAttachedContext;
      this.telemetryService.publicLog2("chatEditing/workingSetSize", { originalSize: uniqueWorkingSetEntries.size, actualSize: uniqueWorkingSetEntries.size });
    }
    this.input.validateAgentMode();
    if (this.viewModel.model.checkpoint) {
      const requests = this.viewModel.model.getRequests();
      for (let i = requests.length - 1; i >= 0; i -= 1) {
        const request = requests[i];
        if (request.shouldBeBlocked.get() || request === this.viewModel.model.checkpoint) {
          this.chatService.removeRequest(this.viewModel.sessionResource, request.id);
        }
      }
      this.viewModel.model.setCheckpoint(void 0);
    }
    const resolvedImageVariables = await this._resolveDirectoryImageAttachments(requestInputs.attachedContext.asArray());
    const submittedSessionResource = this.viewModel.sessionResource;
    const contribution = this._lockedAgent ? this.chatSessionsService.getChatSessionContribution(this._lockedAgent.id) : void 0;
    const autoAttachEnabled = contribution ? contribution.autoAttachReferences === true : true;
    const modeKind = this.input.currentModeKind;
    const modeInfo = this.input.currentModeInfo;
    const currentModelRequestOptions = this.getSelectedModelRequestOptions();
    const selectedModelRequestOptions = editedModelRequestOptions?.userSelectedModelId === currentModelRequestOptions.userSelectedModelId ? editedModelRequestOptions : currentModelRequestOptions;
    const result = await this.chatService.sendRequest(this.viewModel.sessionResource, requestInputs.input, {
      ...selectedModelRequestOptions,
      location: this.location,
      locationData: this._location.resolveData?.(),
      parserContext: { selectedAgent: this._lastSelectedAgent, mode: modeKind, attachmentCapabilities: this._lastSelectedAgent?.capabilities ?? this.attachmentCapabilities },
      attachedContext: requestInputs.attachedContext.asArray(),
      resolvedVariables: resolvedImageVariables,
      noCommandDetection: options?.noCommandDetection,
      isVoiceModeInput: options?.isVoiceModeInput,
      ...this.getModeRequestOptions(),
      modeInfo,
      agentIdSilent: this._lockedAgent?.id,
      queue: options?.queue,
      instructionContext: autoAttachEnabled ? {
        modeKind,
        enabledTools: modeKind === ChatModeKind.Agent ? this.input.selectedToolsModel.userSelectedTools.get() : void 0,
        enabledSubAgents: modeKind === ChatModeKind.Agent ? this.input.currentModeObs.get().agents?.get() : void 0
      } : void 0
    });
    if (ChatSendResult.isRejected(result)) {
      if (result.newSessionResource) {
        const newModel = this.chatService.getSession(result.newSessionResource);
        if (newModel) {
          this.setModel(newModel);
        }
      }
      return;
    }
    this.logThinkingStyleUsage("submit");
    this.updateChatViewVisibility();
    this.input.acceptInput(options?.storeToHistory ?? isUserQuery, options?.preserveFocus, options?.preserveInput);
    if (!options.preserveInput) {
      this._maybeStartGoalSummary(requestInputs.input);
    }
    const sent = await acceptAndAwaitSentRequest(result, options.onRequestAccepted);
    if (!sent) {
      return;
    }
    if (!options.preserveInput) {
      this._onDidSubmitAgent.fire({ agent: sent.data.agent, slashCommand: sent.data.slashCommand });
    }
    this.handleDelegationExitIfNeeded(this._lockedAgent, sent.data.agent);
    if (sent.newSessionResource) {
      const newModel = this.chatService.getSession(sent.newSessionResource);
      if (newModel) {
        this.setModel(newModel);
      }
    }
    sent.data.responseCreatedPromise.then(() => {
      this.chatAccessibilityService.acceptRequest(submittedSessionResource);
      sent.data.responseCompletePromise.then(() => {
        const responses = this.viewModel?.getItems().filter(isResponseVM);
        const lastResponse = responses?.[responses.length - 1];
        this.chatAccessibilityService.acceptResponse(this, this.container, lastResponse, submittedSessionResource, options?.isVoiceInput);
        if (lastResponse?.result?.nextQuestion) {
          const { prompt, participant, command } = lastResponse.result.nextQuestion;
          const question = formatChatQuestion(this.chatAgentService, this.location, prompt, participant, command);
          if (question) {
            this.input.setValue(question, false);
          }
        }
      });
    });
    return sent.data.responseCreatedPromise;
  }
  async _executeSlashCommandDuringRequest(input, storeToHistory, preserveFocus) {
    const viewModel = this.viewModel;
    if (!viewModel) {
      return false;
    }
    const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(
      viewModel.sessionResource,
      input,
      this.location,
      {
        selectedAgent: this._lastSelectedAgent,
        mode: this.input.currentModeKind,
        attachmentCapabilities: this.attachmentCapabilities,
        forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0
      }
    );
    const commandPart = parsedRequest.parts.find((part) => part instanceof ChatRequestSlashCommandPart);
    if (!commandPart?.slashCommand.executeDuringRequest || commandPart.slashCommand.silent !== true) {
      return false;
    }
    const history = [];
    for (const request of viewModel.model.getRequests()) {
      if (!request.response) {
        continue;
      }
      history.push({ role: ChatMessageRole.User, content: [{ type: "text", value: request.message.text }] });
      history.push({ role: ChatMessageRole.Assistant, content: [{ type: "text", value: request.response.response.toString() }] });
    }
    this.input.acceptInput(storeToHistory, preserveFocus);
    const prompt = parsedRequest.text.slice(commandPart.range.endExclusive).trimStart();
    try {
      await this.chatSlashCommandService.executeCommand(
        commandPart.slashCommand.command,
        prompt,
        Progress.None,
        history,
        this.location,
        viewModel.sessionResource,
        CancellationToken.None
      );
    } finally {
      clearChatMarks(viewModel.sessionResource);
    }
    return true;
  }
  // Resolve images from directory attachments to send as additional variables.
  async _resolveDirectoryImageAttachments(attachments) {
    const imagePromises = [];
    for (const attachment of attachments) {
      if (attachment.kind === "directory" && URI.isUri(attachment.value)) {
        imagePromises.push(
          this.chatAttachmentResolveService.resolveDirectoryImages(attachment.value)
        );
      }
    }
    if (imagePromises.length === 0) {
      return [];
    }
    const resolved = await Promise.all(imagePromises);
    return resolved.flat();
  }
  async _tryExecuteImmediateSlashCommand(input, parsedInput) {
    const viewModel = this.viewModel;
    if (!viewModel) {
      return false;
    }
    const parsedRequest = parsedInput ?? this.instantiationService.createInstance(ChatRequestParser).parseChatRequestWithReferences(getDynamicVariablesForWidget(this), getSelectedToolAndToolSetsForWidget(this), input, this.location, {
      selectedAgent: this._lastSelectedAgent,
      mode: this.input.currentModeKind,
      attachmentCapabilities: this.attachmentCapabilities,
      forcedAgent: this._lockedAgent?.id ? this.chatAgentService.getAgent(this._lockedAgent.id) : void 0,
      sessionType: getChatSessionType(viewModel.model.sessionResource)
    });
    const commandPart = getImmediateSilentSlashCommandPart(parsedRequest);
    if (!commandPart) {
      return false;
    }
    const history = [];
    for (const request of viewModel.model.getRequests()) {
      if (!request.response) {
        continue;
      }
      history.push({ role: ChatMessageRole.User, content: [{ type: "text", value: request.message.text }] });
      history.push({ role: ChatMessageRole.Assistant, content: [{ type: "text", value: request.response.response.toString() }] });
    }
    const command = commandPart.slashCommand.command;
    await this.chatSlashCommandService.executeCommand(
      command,
      input.slice(commandPart.range.endExclusive).trimStart(),
      new Progress(() => {
      }),
      history,
      this.location,
      viewModel.sessionResource,
      CancellationToken.None
    );
    return true;
  }
  async confirmPendingRequestsBeforeSend(model, options) {
    if (options.queue) {
      return true;
    }
    const hasPendingRequests = model.getPendingRequests().length > 0;
    if (!hasPendingRequests) {
      return true;
    }
    const promptResult = await this.dialogService.prompt({
      type: "question",
      message: localize("chat.pendingRequests.prompt.message", "You already have pending requests."),
      detail: localize("chat.pendingRequests.prompt.detail", "Do you want to keep them in the queue or remove them before sending this message?"),
      buttons: [
        {
          label: localize("chat.pendingRequests.prompt.keep", "Keep Pending Requests"),
          run: () => "keep"
        },
        {
          label: localize("chat.pendingRequests.prompt.remove", "Remove Pending Requests"),
          run: () => "remove"
        }
      ],
      cancelButton: true
    });
    if (!promptResult.result) {
      return false;
    }
    if (promptResult.result === "remove") {
      for (const pendingRequest of [...model.getPendingRequests()]) {
        this.chatService.removePendingRequest(model.sessionResource, pendingRequest.request.id);
      }
    }
    return true;
  }
  // Keep the selected model and its editor-scoped configuration together so
  // resend/confirmation flows preserve custom per-model settings.
  getSelectedModelRequestOptions() {
    const modelId = this.input.currentLanguageModel;
    return {
      userSelectedModelId: modelId,
      userSelectedModelConfiguration: modelId ? this.input.getModelConfiguration(modelId) : void 0
    };
  }
  getModeRequestOptions() {
    if (!this.inputPartDisposable.value) {
      return {};
    }
    const sessionResource = this.viewModel?.sessionResource;
    const capturedModeId = this.input.currentModeObs.get().id;
    const userSelectedTools = this.input.selectedToolsModel.userSelectedTools;
    let lastToolsSnapshot = userSelectedTools.get();
    const scopedTools = derived((reader) => {
      if (this._store.isDisposed) {
        return lastToolsSnapshot;
      }
      const activeSession = this._viewModelObs.read(reader)?.sessionResource;
      const currentModeId = this.input.currentModeObs.read(reader).id;
      if (isEqual(activeSession, sessionResource) && currentModeId === capturedModeId) {
        const tools = userSelectedTools.read(reader);
        lastToolsSnapshot = tools;
        return tools;
      }
      return lastToolsSnapshot;
    });
    return {
      modeInfo: this.input.currentModeInfo,
      userSelectedTools: scopedTools
    };
  }
  getCodeBlockInfosForResponse(response) {
    return this.listWidget.getCodeBlockInfosForResponse(response);
  }
  getCodeBlockInfoForEditor(uri) {
    return this.listWidget.getCodeBlockInfoForEditor(uri);
  }
  getFileTreeInfosForResponse(response) {
    return this.listWidget.getFileTreeInfosForResponse(response);
  }
  getLastFocusedFileTreeForResponse(response) {
    return this.listWidget.getLastFocusedFileTreeForResponse(response);
  }
  getElementFromNode(node) {
    return this.listWidget.getElementFromNode(node);
  }
  focusResponseItem(lastFocused) {
    this.listWidget.focusLastItem(lastFocused);
  }
  setInputPartMaxHeightOverride(maxHeight) {
    this.inputPartMaxHeightOverride = maxHeight;
  }
  layout(height, width) {
    width = Math.min(width, this.viewOptions.renderStyle === "minimal" ? width : 950);
    this.bodyDimension = new dom.Dimension(width, height);
    if (this.viewModel?.editing) {
      this.inlineInputPart?.layout(width);
    }
    const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
    const inputMaxHeight = this._dynamicMessageLayoutData || this.location !== ChatAgentLocation.Chat ? void 0 : this.inputPartMaxHeightOverride !== void 0 ? Math.max(0, this.inputPartMaxHeightOverride - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT) : Math.max(0, height - chatSuggestNextWidgetHeight - MIN_LIST_HEIGHT);
    this.inputPart.setMaxHeight(inputMaxHeight);
    this.inputPart.layout(width);
    this._layoutListForInputHeight();
  }
  /**
   * Updates the widget's available space after the intrinsic input height changed.
   * The input has already laid itself out, so this only resizes the list-side
   * surfaces and must not call {@link ChatInputPart.layout}.
   */
  layoutForInputHeight(height, width) {
    width = Math.min(width, this.viewOptions.renderStyle === "minimal" ? width : 950);
    this.bodyDimension = new dom.Dimension(width, height);
    this._layoutListForInputHeight();
  }
  /**
   * Re-layout just the list, welcome container, and list container to match
   * the current input-part height. Called both from {@link layout} and from
   * the inputPart.height autorun so we never re-enter inputPart.layout when
   * only the input height changed.
   */
  _layoutListForInputHeight() {
    if (!this.bodyDimension) {
      return;
    }
    const { height, width } = this.bodyDimension;
    const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
    const inputHeight = this._inputVisible ? this.inputPart.height.get() : this.inputPart.element.offsetHeight;
    const readOnlyBannerHeight = this.readOnlyBanner?.visible ? CHAT_READ_ONLY_BANNER_HEIGHT : 0;
    const lastElementVisible = this.listWidget.isScrolledToBottom;
    const lastItem = this.listWidget.lastItem;
    const contentHeight = Math.max(0, height - inputHeight - readOnlyBannerHeight - chatSuggestNextWidgetHeight);
    this.listWidget.layout(contentHeight, width);
    this.welcomeMessageContainer.style.height = `${contentHeight}px`;
    const lastResponseIsRendering = isResponseVM(lastItem) && lastItem.renderData;
    if (lastElementVisible && !this.listWidget.isAutoScrollHeld && (!lastResponseIsRendering || checkModeOption(this.input.currentModeKind, this.viewOptions.autoScroll))) {
      this.listWidget.scrollToEnd();
    }
    this.listContainer.style.height = `${contentHeight}px`;
    this._onDidChangeHeight.fire(height);
  }
  // An alternative to layout, this allows you to specify the number of ChatTreeItems
  // you want to show, and the max height of the container. It will then layout the
  // tree to show that many items.
  // TODO@TylerLeonhardt: This could use some refactoring to make it clear which layout strategy is being used
  setDynamicChatTreeItemLayout(numOfChatTreeItems, maxHeight) {
    this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
    this._register(this.listWidget.onDidChangeItemHeight(() => this.layoutDynamicChatTreeItemMode()));
    const mutableDisposable = this._register(new MutableDisposable());
    this._register(this.listWidget.onDidScroll((e) => {
      if (!this._dynamicMessageLayoutData?.enabled) {
        return;
      }
      mutableDisposable.value = dom.scheduleAtNextAnimationFrame(dom.getWindow(this.listContainer), () => {
        if (!e.scrollTopChanged || e.heightChanged || e.scrollHeightChanged) {
          return;
        }
        const renderHeight = e.height;
        const diff = e.scrollHeight - renderHeight - e.scrollTop;
        if (diff === 0) {
          return;
        }
        const possibleMaxHeight = this._dynamicMessageLayoutData?.maxHeight ?? maxHeight;
        const width = this.bodyDimension?.width ?? this.container.offsetWidth;
        this.input.layout(width);
        const inputPartHeight = this.input.height.get();
        const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
        const newHeight = Math.min(renderHeight + diff, possibleMaxHeight - inputPartHeight - chatSuggestNextWidgetHeight);
        this.layout(newHeight + inputPartHeight + chatSuggestNextWidgetHeight, width);
      });
    }));
  }
  updateDynamicChatTreeItemLayout(numOfChatTreeItems, maxHeight) {
    this._dynamicMessageLayoutData = { numOfMessages: numOfChatTreeItems, maxHeight, enabled: true };
    let hasChanged = false;
    let height = this.bodyDimension.height;
    let width = this.bodyDimension.width;
    if (maxHeight < this.bodyDimension.height) {
      height = maxHeight;
      hasChanged = true;
    }
    const containerWidth = this.container.offsetWidth;
    if (this.bodyDimension?.width !== containerWidth) {
      width = containerWidth;
      hasChanged = true;
    }
    if (hasChanged) {
      this.layout(height, width);
    }
  }
  get isDynamicChatTreeItemLayoutEnabled() {
    return this._dynamicMessageLayoutData?.enabled ?? false;
  }
  set isDynamicChatTreeItemLayoutEnabled(value) {
    if (!this._dynamicMessageLayoutData) {
      return;
    }
    this._dynamicMessageLayoutData.enabled = value;
  }
  layoutDynamicChatTreeItemMode() {
    if (!this.viewModel || !this._dynamicMessageLayoutData?.enabled) {
      return;
    }
    const width = this.bodyDimension?.width ?? this.container.offsetWidth;
    this.input.layout(width);
    const inputHeight = this.input.height.get();
    const chatSuggestNextWidgetHeight = this.chatSuggestNextWidget.height;
    const totalMessages = this.viewModel.getItems();
    const messages = totalMessages.slice(-this._dynamicMessageLayoutData.numOfMessages);
    const needsRerender = messages.some((m) => m.currentRenderedHeight === void 0);
    const listHeight = needsRerender ? this._dynamicMessageLayoutData.maxHeight : messages.reduce((acc, message) => acc + message.currentRenderedHeight, 0);
    this.layout(
      Math.min(
        // we add an additional 18px in order to show that there is scrollable content
        inputHeight + chatSuggestNextWidgetHeight + listHeight + (totalMessages.length > 2 ? 18 : 0),
        this._dynamicMessageLayoutData.maxHeight
      ),
      width
    );
    if (needsRerender || !listHeight) {
      this.listWidget.scrollToEnd();
    }
  }
  saveState() {
  }
  getViewState() {
    return this.input.getCurrentInputState();
  }
  updateChatInputContext() {
    const currentAgent = this.parsedInput.parts.find((part) => part instanceof ChatRequestAgentPart);
    this.agentInInput.set(!!currentAgent);
  }
  async _switchToAgentByName(agentName) {
    const currentAgent = this.input.currentModeObs.get();
    if (agentName === currentAgent.name.get()) {
      return true;
    }
    const agent = this.input.currentChatModesObs.get().findModeByName(agentName);
    if (!agent) {
      return false;
    }
    if (currentAgent.kind !== agent.kind) {
      const chatModeCheck = await this.instantiationService.invokeFunction(handleModeSwitch, currentAgent.kind, agent.kind, this.viewModel?.model.getRequests().length ?? 0, this.viewModel?.model);
      if (!chatModeCheck) {
        return false;
      }
      if (chatModeCheck.needToClearSession) {
        await this.clear();
      }
    }
    this.input.setChatMode(agent.id);
    return true;
  }
  /**
   * @returns `false` when the agent switch was cancelled (e.g. user dismissed the
   * mode-switch confirmation dialog), signalling that the caller should abort the
   * current input submission.
   */
  async _applyPromptMetadata({ agent, tools, model }, requestInput) {
    if (tools !== void 0 && !agent && this.input.currentModeKind !== ChatModeKind.Agent) {
      agent = ChatMode.Agent.name.get();
    }
    if (agent) {
      const switched = await this._switchToAgentByName(agent);
      if (!switched) {
        return false;
      }
    }
    if (tools !== void 0 && this.input.currentModeKind === ChatModeKind.Agent) {
      const enablementMap = this.toolsService.toToolAndToolSetEnablementMap(tools, this.input.selectedLanguageModel.get()?.metadata);
      this.input.selectedToolsModel.set(enablementMap, true);
    }
    if (model !== void 0) {
      return this.input.requestModelByQualifiedName(model);
    }
    return true;
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.listWidget.delegateScrollFromMouseWheelEvent(browserEvent);
  }
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
ChatWidget.CONTRIBS = [];
ChatWidget = __decorateClass([
  __decorateParam(4, ICodeEditorService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IChatService),
  __decorateParam(10, IChatAgentService),
  __decorateParam(11, IChatWidgetService),
  __decorateParam(12, IChatAccessibilityService),
  __decorateParam(13, ILogService),
  __decorateParam(14, IThemeService),
  __decorateParam(15, IChatSlashCommandService),
  __decorateParam(16, IChatEditingService),
  __decorateParam(17, ITelemetryService),
  __decorateParam(18, IPromptsService),
  __decorateParam(19, ICustomizationHarnessService),
  __decorateParam(20, ILanguageModelToolsService),
  __decorateParam(21, IChatLayoutService),
  __decorateParam(22, IChatEntitlementService),
  __decorateParam(23, IChatSessionsService),
  __decorateParam(24, IAgentSessionsService),
  __decorateParam(25, IChatTodoListService),
  __decorateParam(26, ILifecycleService),
  __decorateParam(27, IChatAttachmentResolveService),
  __decorateParam(28, IChatTipService),
  __decorateParam(29, IChatDebugService),
  __decorateParam(30, IAccessibilityService),
  __decorateParam(31, IChatGoalSummaryService),
  __decorateParam(32, IChatSubmitRequestHandlerService),
  __decorateParam(33, IChatPetService)
], ChatWidget);
function layoutChatWidgetForInputHeight(widget, inputMaxHeight, height, width) {
  widget.setInputPartMaxHeightOverride(inputMaxHeight);
  widget.layoutForInputHeight(height, width);
}
const MIN_LIST_HEIGHT = 50;
export {
  ChatWidget,
  acceptAndAwaitSentRequest,
  getImmediateSilentSlashCommandPart,
  isQuickChat,
  layoutChatWidgetForInputHeight
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0LmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvY2hhdEFnZW50SG92ZXIuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0Vmlld1dlbGNvbWUuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgSU1vdXNlV2hlZWxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0aGVuSWZOb3REaXNwb3NlZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBmaWx0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZXh0VXJpLCBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDaGF0UGVyZk1hcmssIGNsZWFyQ2hhdE1hcmtzLCBtYXJrQ2hhdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0UGVyZi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvY29kZUVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5cbmltcG9ydCB7IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGJpbmRDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLCBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjaGVja01vZGVPcHRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcywgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jb21tb24vYWN0aW9ucy9jaGF0Q29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgYXBwbHlpbmdDaGF0RWRpdHNGYWlsZWRDb250ZXh0S2V5LCBkZWNpZGVkQ2hhdEVkaXRpbmdSZXNvdXJjZUNvbnRleHRLZXksIGhhc0FwcGxpZWRDaGF0RWRpdHNDb250ZXh0S2V5LCBoYXNVbmRlY2lkZWRDaGF0RWRpdGluZ1Jlc291cmNlQ29udGV4dEtleSwgSUNoYXRFZGl0aW5nU2VydmljZSwgSUNoYXRFZGl0aW5nU2Vzc2lvbiwgaW5DaGF0RWRpdGluZ1Nlc3Npb25Db250ZXh0S2V5LCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi93aWRnZXQvY2hhdExheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCwgSUNoYXRNb2RlbElucHV0U3RhdGUsIElDaGF0UmVzcG9uc2VNb2RlbCwgbG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUsIGdldE1vZGVOYW1lRm9yVGVsZW1ldHJ5LCBJQ2hhdE1vZGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IGNoYXRBZ2VudExlYWRlciwgQ2hhdFJlcXVlc3RBZ2VudFBhcnQsIENoYXRSZXF1ZXN0RHluYW1pY1ZhcmlhYmxlUGFydCwgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0LCBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCwgQ2hhdFJlcXVlc3RUb29sUGFydCwgQ2hhdFJlcXVlc3RUb29sU2V0UGFydCwgY2hhdFN1YmNvbW1hbmRMZWFkZXIsIGZvcm1hdENoYXRRdWVzdGlvbiwgSVBhcnNlZENoYXRSZXF1ZXN0IH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFBhcnNlclR5cGVzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UGFyc2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFJlcXVlc3RQYXJzZXIuanMnO1xuaW1wb3J0IHsgZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCwgZ2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHNGb3JXaWRnZXQgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBDaGF0U2VuZFJlc3VsdCwgQ2hhdFNlbmRSZXN1bHRTZW50LCBJQ2hhdExvY2F0aW9uRGF0YSwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDaGF0VG9kb0xpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2NoYXRUb2RvTGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeSwgaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSwgaXNXb3Jrc3BhY2VWYXJpYWJsZUVudHJ5LCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLCB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdNb2RlbCwgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXF1ZXN0Vk0sIGlzUmVzcG9uc2VWTSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENoYXRNZXNzYWdlUm9sZSwgSUNoYXRNZXNzYWdlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kLCBDaGF0UGVybWlzc2lvbkxldmVsLCBUaGlua2luZ0Rpc3BsYXlNb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSB9IGZyb20gJy4uL2NoYXRHb2FsU3VtbWFyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIGlzVG9vbFNldCB9IGZyb20gJy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElIYW5kT2ZmLCBQcm9tcHRIZWFkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCwgaGFuZGxlTW9kZVN3aXRjaCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyZWVJdGVtLCBJQ2hhdEFjY2VwdElucHV0T3B0aW9ucywgSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSwgSUNoYXRDb2RlQmxvY2tJbmZvLCBJQ2hhdEZpbGVUcmVlSW5mbywgSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucywgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSwgSUNoYXRXaWRnZXRWaWV3Q29udGV4dCwgSUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudCwgSUNoYXRXaWRnZXRWaWV3T3B0aW9ucywgaXNJQ2hhdFJlc291cmNlVmlld0NvbnRleHQsIGlzSUNoYXRWaWV3Vmlld0NvbnRleHQgfSBmcm9tICcuLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRBdHRhY2htZW50TW9kZWwgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0QXR0YWNobWVudE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlIH0gZnJvbSAnLi4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwgfSBmcm9tICcuLi9hdHRhY2htZW50cy9jaGF0RHluYW1pY1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBDaGF0U3VnZ2VzdE5leHRXaWRnZXQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFBhcnQsIElDaGF0SW5wdXRQYXJ0T3B0aW9ucywgSUNoYXRJbnB1dFN0eWxlcyB9IGZyb20gJy4vaW5wdXQvY2hhdElucHV0UGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdExpc3RJdGVtVGVtcGxhdGUgfSBmcm9tICcuL2NoYXRMaXN0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQ2hhdExpc3RXaWRnZXQgfSBmcm9tICcuL2NoYXRMaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi9jaGF0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld1dlbGNvbWVQYXJ0LCBJQ2hhdFZpZXdXZWxjb21lQ29udGVudCB9IGZyb20gJy4uL3ZpZXdzV2VsY29tZS9jaGF0Vmlld1dlbGNvbWVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElDaGF0VGlwU2VydmljZSB9IGZyb20gJy4uL2NoYXRUaXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUaXBDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0VGlwQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi9jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdERlYnVnU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENIQVRfUkVBRF9PTkxZX0JBTk5FUl9IRUlHSFQsIENoYXRSZWFkT25seUJhbm5lciB9IGZyb20gJy4vY2hhdFJlYWRPbmx5QmFubmVyLmpzJztcbmltcG9ydCB7IElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UGV0V2lkZ2V0LCBpc0NoYXRQZXRWaXNpYmxlIH0gZnJvbSAnLi9jaGF0UGV0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElDaGF0UGV0U2VydmljZSB9IGZyb20gJy4uL2NoYXRQZXRTZXJ2aWNlLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG4vKipcbiAqIFRvdGFsIGhvcml6b250YWwgcGFkZGluZyBvZiBhIGNoYXQgaXRlbSBpbiB0aGUgYWdlbnRzIHdpbmRvdyAoYC5pbnRlcmFjdGl2ZS1pdGVtLWNvbnRhaW5lcmAsXG4gKiBgcGFkZGluZzogMCAzMnB4YCBpbiBzZXNzaW9ucyBgc3R5bGUuY3NzYCkuIFJlc2VydmVkIHdoZW4gbGF5aW5nIG91dCBlbWJlZGRlZCBlZGl0b3JzIHNvIGNvZGVcbiAqIGJsb2NrcyBtYXRjaCB0aGUgcmVuZGVyZWQgY29udGVudCB3aWR0aC4gU2VlIHtAbGluayBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zLmNvbnRlbnRIb3Jpem9udGFsUGFkZGluZ30uXG4gKi9cbmNvbnN0IFNFU1NJT05TX0NIQVRfSVRFTV9IT1JJWk9OVEFMX1BBRERJTkcgPSA2NDtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFdpZGdldFN0eWxlcyBleHRlbmRzIElDaGF0SW5wdXRTdHlsZXMge1xuXHRyZWFkb25seSBpbnB1dEVkaXRvckJhY2tncm91bmQ6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzdWx0RWRpdG9yQmFja2dyb3VuZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0V2lkZ2V0Q29udHJpYiBleHRlbmRzIElEaXNwb3NhYmxlIHtcblxuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBBIHBpZWNlIG9mIHN0YXRlIHdoaWNoIGlzIHJlbGF0ZWQgdG8gdGhlIGlucHV0IGVkaXRvciBvZiB0aGUgY2hhdCB3aWRnZXQuXG5cdCAqIFRha2VzIGluIHRoZSBgY29udHJpYmAgb2JqZWN0IHRoYXQgd2lsbCBiZSBzYXZlZCBpbiB0aGUge0BsaW5rIElDaGF0TW9kZWxJbnB1dFN0YXRlfS5cblx0ICovXG5cdGdldElucHV0U3RhdGU/KGNvbnRyaWI6IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogdm9pZDtcblxuXHQvKipcblx0ICogQ2FsbGVkIHdpdGggdGhlIHJlc3VsdCBvZiBnZXRJbnB1dFN0YXRlIHdoZW4gbmF2aWdhdGluZyBpbnB1dCBoaXN0b3J5LlxuXHQgKi9cblx0c2V0SW5wdXRTdGF0ZT8oY29udHJpYjogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgdW5rbm93bj4+KTogdm9pZDtcbn1cblxuaW50ZXJmYWNlIElDaGF0UmVxdWVzdElucHV0T3B0aW9ucyB7XG5cdGlucHV0OiBzdHJpbmc7XG5cdGF0dGFjaGVkQ29udGV4dDogQ2hhdFJlcXVlc3RWYXJpYWJsZVNldDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyB7XG5cdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbjtcblxuXHRyZXNvbHZlRGF0YT8oKTogSUNoYXRMb2NhdGlvbkRhdGEgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1F1aWNrQ2hhdCh3aWRnZXQ6IElDaGF0V2lkZ2V0KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0lDaGF0UmVzb3VyY2VWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpICYmIEJvb2xlYW4od2lkZ2V0LnZpZXdDb250ZXh0LmlzUXVpY2tDaGF0KTtcbn1cblxuZnVuY3Rpb24gaXNJbmxpbmVDaGF0KHdpZGdldDogSUNoYXRXaWRnZXQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzSUNoYXRSZXNvdXJjZVZpZXdDb250ZXh0KHdpZGdldC52aWV3Q29udGV4dCkgJiYgQm9vbGVhbih3aWRnZXQudmlld0NvbnRleHQuaXNJbmxpbmVDaGF0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEltbWVkaWF0ZVNpbGVudFNsYXNoQ29tbWFuZFBhcnQocGFyc2VkUmVxdWVzdDogSVBhcnNlZENoYXRSZXF1ZXN0KTogQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocGFydCk6IHBhcnQgaXMgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0ID0+XG5cdFx0cGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0U2xhc2hDb21tYW5kUGFydFxuXHRcdCYmIHBhcnQucmFuZ2Uuc3RhcnQgPT09IDBcblx0XHQmJiBwYXJ0LnNsYXNoQ29tbWFuZC5leGVjdXRlSW1tZWRpYXRlbHkgPT09IHRydWVcblx0XHQmJiBwYXJ0LnNsYXNoQ29tbWFuZC5zaWxlbnQgPT09IHRydWVcblx0KTtcbn1cblxuLyoqXG4gKiBTZXR0bGVzIHRoZSBvdXRjb21lIG9mIGEgYElDaGF0U2VydmljZS5zZW5kUmVxdWVzdGAgY2FsbC5cbiAqXG4gKiBBIHJlcXVlc3QgdGhhdCBjb3VsZCBub3QgYmUgaGFuZGVkIG92ZXIgdG8gdGhlIGNoYXQgc2VydmljZSBpcyBuZXZlciBhY2NlcHRlZC4gQW55dGhpbmcgZWxzZSBpc1xuICogYWNjZXB0ZWQgcmlnaHQgYXdheSBcdTIwMTQgYSBxdWV1ZWQgcmVxdWVzdCBpcyBhY2NlcHRlZCB0aGUgbW9tZW50IGl0IGVudGVycyB0aGUgcXVldWUsIHdoaWNoIGlzXG4gKiBwb3RlbnRpYWxseSBsb25nIGJlZm9yZSBpdCBydW5zIFx1MjAxNCBzbyB7QGxpbmsgb25SZXF1ZXN0QWNjZXB0ZWR9IGZpcmVzIGJlZm9yZSB0aGUgcXVldWVkIHJlcXVlc3RcbiAqIHNldHRsZXMuIFJlc29sdmVzIHdpdGggdGhlIHJlcXVlc3Qgb25jZSBpdCBoYXMgYWN0dWFsbHkgYmVlbiBzZW50LCBvciBgdW5kZWZpbmVkYCBpZiBpdCBuZXZlciB3YXMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBhY2NlcHRBbmRBd2FpdFNlbnRSZXF1ZXN0KHJlc3VsdDogQ2hhdFNlbmRSZXN1bHQsIG9uUmVxdWVzdEFjY2VwdGVkPzogKCkgPT4gdm9pZCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHRTZW50IHwgdW5kZWZpbmVkPiB7XG5cdGlmIChDaGF0U2VuZFJlc3VsdC5pc1JlamVjdGVkKHJlc3VsdCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b25SZXF1ZXN0QWNjZXB0ZWQ/LigpO1xuXG5cdGNvbnN0IHNlbnQgPSBDaGF0U2VuZFJlc3VsdC5pc1F1ZXVlZChyZXN1bHQpID8gYXdhaXQgcmVzdWx0LmRlZmVycmVkIDogcmVzdWx0O1xuXHRyZXR1cm4gQ2hhdFNlbmRSZXN1bHQuaXNTZW50KHNlbnQpID8gc2VudCA6IHVuZGVmaW5lZDtcbn1cblxudHlwZSBDaGF0SGFuZG9mZkNsaWNrRXZlbnQgPSB7XG5cdGZyb21BZ2VudDogc3RyaW5nO1xuXHR0b0FnZW50OiBzdHJpbmc7XG5cdGhhc1Byb21wdDogYm9vbGVhbjtcblx0YXV0b1NlbmQ6IGJvb2xlYW47XG59O1xuXG50eXBlIENoYXRIYW5kb2ZmQ2xpY2tDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdkaWdpdGFyYWxkJztcblx0Y29tbWVudDogJ0V2ZW50IGZpcmVkIHdoZW4gYSB1c2VyIGNsaWNrcyBvbiBhIGhhbmRvZmYgcHJvbXB0IGluIHRoZSBjaGF0IHN1Z2dlc3QtbmV4dCB3aWRnZXQnO1xuXHRmcm9tQWdlbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWdlbnQvbW9kZSB0aGUgdXNlciB3YXMgaW4gYmVmb3JlIGNsaWNraW5nIHRoZSBoYW5kb2ZmJyB9O1xuXHR0b0FnZW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFnZW50L21vZGUgc3BlY2lmaWVkIGluIHRoZSBoYW5kb2ZmJyB9O1xuXHRoYXNQcm9tcHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBoYW5kb2ZmIGluY2x1ZGVzIGEgcHJvbXB0JyB9O1xuXHRhdXRvU2VuZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIGhhbmRvZmYgYXV0b21hdGljYWxseSBzdWJtaXRzIHRoZSByZXF1ZXN0JyB9O1xufTtcblxudHlwZSBDaGF0SGFuZG9mZldpZGdldFNob3duRXZlbnQgPSB7XG5cdGFnZW50OiBzdHJpbmc7XG5cdGhhbmRvZmZDb3VudDogbnVtYmVyO1xufTtcblxudHlwZSBDaGF0SGFuZG9mZldpZGdldFNob3duQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnZGlnaXRhcmFsZCc7XG5cdGNvbW1lbnQ6ICdFdmVudCBmaXJlZCB3aGVuIHRoZSBzdWdnZXN0LW5leHQgd2lkZ2V0IGlzIHNob3duIHdpdGggaGFuZG9mZiBwcm9tcHRzJztcblx0YWdlbnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY3VycmVudCBhZ2VudC9tb2RlIHRoYXQgaGFzIGhhbmRvZmZzIGRlZmluZWQnIH07XG5cdGhhbmRvZmZDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBoYW5kb2ZmIG9wdGlvbnMgc2hvd24gdG8gdGhlIHVzZXInIH07XG59O1xuXG50eXBlIENoYXRQcm9tcHRSdW5FdmVudCA9IHtcblx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2U7XG5cdGV4dGVuc2lvbklkPzogc3RyaW5nO1xuXHRwcm9tcHROYW1lPzogc3RyaW5nO1xuXHRwcm9tcHROYW1lSGFzaD86IHN0cmluZztcbn07XG5cbnR5cGUgQ2hhdFByb21wdFJ1bkNsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ2RpZ2l0YXJhbGQnO1xuXHRjb21tZW50OiAnRXZlbnQgZmlyZWQgd2hlbiBhIHByb21wdCBzbGFzaCBjb21tYW5kIGlzIHJlc29sdmVkIGludG8gYSBmb2xsb3cgaW5zdHJ1Y3Rpb25zIHJlcXVlc3QnO1xuXHRzdG9yYWdlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hlcmUgdGhlIHByb21wdCBpcyBzdG9yZWQgKGxvY2FsLCB1c2VyLCBleHRlbnNpb24pLicgfTtcblx0ZXh0ZW5zaW9uSWQ/OiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lkZW50aWZpZXIgb2YgdGhlIGV4dGVuc2lvbiB0aGF0IGNvbnRyaWJ1dGVkIHRoZSBwcm9tcHQsIHdoZW4gYXBwbGljYWJsZS4nIH07XG5cdHByb21wdE5hbWU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ05hbWUgb2YgdGhlIGNvcmUgb3IgZXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIHByb21wdC4nIH07XG5cdHByb21wdE5hbWVIYXNoPzogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0hhc2hlZCBuYW1lIG9mIGxvY2FsIG9yIHVzZXIgcHJvbXB0IGZvciBwcml2YWN5LicgfTtcbn07XG5cbnR5cGUgQ2hhdFRoaW5raW5nU3R5bGVVc2FnZUV2ZW50ID0ge1xuXHR0aGlua2luZ1N0eWxlOiBUaGlua2luZ0Rpc3BsYXlNb2RlO1xuXHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb247XG5cdHJlcXVlc3RLaW5kOiAnc3VibWl0JyB8ICdyZXJ1bic7XG59O1xuXG50eXBlIENoYXRUaGlua2luZ1N0eWxlVXNhZ2VDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdqdXN0c2NoZW4nO1xuXHRjb21tZW50OiAnRXZlbnQgZmlyZWQgd2hlbiBhIGNoYXQgcmVxdWVzdCB1c2VzIHRoZSBjb25maWd1cmVkIHRoaW5raW5nIHN0eWxlIHJlbmRlcmluZyBtb2RlLic7XG5cdHRoaW5raW5nU3R5bGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29uZmlndXJlZCByZW5kZXJpbmcgbW9kZSBmb3IgdGhpbmtpbmcgY29udGVudC4nIH07XG5cdGxvY2F0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGxvY2F0aW9uIHdoZXJlIHRoZSByZXF1ZXN0IHdhcyBtYWRlLicgfTtcblx0cmVxdWVzdEtpbmQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSByZXF1ZXN0IHdhcyBhIG5ldyBzdWJtaXQgb3IgYSByZXJ1bi4nIH07XG59O1xuXG5jb25zdCBzdXBwb3J0c0FsbEF0dGFjaG1lbnRzOiBSZXF1aXJlZDxPbWl0PElDaGF0QWdlbnRBdHRhY2htZW50Q2FwYWJpbGl0aWVzLCAndGVybWluYWxDb21tYW5kUHJlZml4Jz4+ID0ge1xuXHRzdXBwb3J0c0ZpbGVBdHRhY2htZW50czogdHJ1ZSxcblx0c3VwcG9ydHNUb29sQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzTUNQQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzSW1hZ2VBdHRhY2htZW50czogdHJ1ZSxcblx0c3VwcG9ydHNTZWFyY2hSZXN1bHRBdHRhY2htZW50czogdHJ1ZSxcblx0c3VwcG9ydHNJbnN0cnVjdGlvbkF0dGFjaG1lbnRzOiB0cnVlLFxuXHRzdXBwb3J0c1NvdXJjZUNvbnRyb2xBdHRhY2htZW50czogdHJ1ZSxcblx0c3VwcG9ydHNQcm9ibGVtQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzU3ltYm9sQXR0YWNobWVudHM6IHRydWUsXG5cdHN1cHBvcnRzVGVybWluYWxBdHRhY2htZW50czogdHJ1ZSxcblx0c3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czogdHJ1ZSxcblx0c3VwcG9ydHNIYW5kT2ZmczogdHJ1ZSxcblx0c3VwcG9ydHNDaGVja3BvaW50czogdHJ1ZSxcbn07XG5cbmNvbnN0IERJU0NMQUlNRVIgPSBsb2NhbGl6ZSgnY2hhdERpc2NsYWltZXInLCBcIkFJIHJlc3BvbnNlcyBtYXkgYmUgaW5hY2N1cmF0ZVwiKTtcblxuZXhwb3J0IGNsYXNzIENoYXRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUNoYXRXaWRnZXQge1xuXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHN0YXRpYyByZWFkb25seSBDT05UUklCUzogeyBuZXcoLi4uYXJnczogW0lDaGF0V2lkZ2V0LCAuLi5hbnldKTogSUNoYXRXaWRnZXRDb250cmliIH1bXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3VibWl0QWdlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGFnZW50OiBJQ2hhdEFnZW50RGF0YTsgc2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3VibWl0QWdlbnQgPSB0aGlzLl9vbkRpZFN1Ym1pdEFnZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlQWdlbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGFnZW50OiBJQ2hhdEFnZW50RGF0YTsgc2xhc2hDb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWdlbnQgPSB0aGlzLl9vbkRpZENoYW5nZUFnZW50LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkRm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1cyA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VWaWV3TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFdpZGdldFZpZXdNb2RlbENoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3TW9kZWwgPSB0aGlzLl9vbkRpZENoYW5nZVZpZXdNb2RlbC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZFNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFNjcm9sbCA9IHRoaXMuX29uRGlkU2Nyb2xsLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQWNjZXB0SW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRBY2NlcHRJbnB1dCA9IHRoaXMuX29uRGlkQWNjZXB0SW5wdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRIaWRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkSGlkZSA9IHRoaXMuX29uRGlkSGlkZS5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZFNob3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTaG93ID0gdGhpcy5fb25EaWRTaG93LmV2ZW50O1xuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlUGFyc2VkSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQYXJzZWRJbnB1dCA9IHRoaXMuX29uRGlkQ2hhbmdlUGFyc2VkSW5wdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxNYXliZUNoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxNYXliZUNoYW5nZUhlaWdodDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbldpbGxNYXliZUNoYW5nZUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUhlaWdodCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VFbXB0eVN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW1wdHlTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlRW1wdHlTdGF0ZS5ldmVudDtcblxuXHRjb250cmliczogUmVhZG9ubHlBcnJheTxJQ2hhdFdpZGdldENvbnRyaWI+ID0gW107XG5cblx0cHJpdmF0ZSBsaXN0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cblx0Z2V0IGRvbU5vZGUoKSB7IHJldHVybiB0aGlzLmNvbnRhaW5lcjsgfVxuXG5cdHByaXZhdGUgbGlzdFdpZGdldCE6IENoYXRMaXN0V2lkZ2V0O1xuXHRwcml2YXRlIGlucHV0UGFydE1heEhlaWdodE92ZXJyaWRlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmlsaXR5VGltZW91dERpc3Bvc2FibGU6IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmlsaXR5QW5pbWF0aW9uRnJhbWVEaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbnB1dFBhcnREaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0SW5wdXRQYXJ0PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBpbmxpbmVJbnB1dFBhcnREaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0SW5wdXRQYXJ0PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSBpbnB1dENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGZvY3VzZWRJbnB1dERPTSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGVkaXRvck9wdGlvbnMhOiBDaGF0RWRpdG9yT3B0aW9ucztcblx0cHJpdmF0ZSByZWFkb25seSByZWFkT25seUJhbm5lcjogQ2hhdFJlYWRPbmx5QmFubmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHQvKiogU3VwcHJlc3NlcyBhdXRvLXNjcm9sbCBmb3IgdGhlIGR1cmF0aW9uIG9mIGFuIGlubGluZSByZXF1ZXN0IGVkaXQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRpbmdBdXRvU2Nyb2xsSG9sZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSB3ZWxjb21lTWVzc2FnZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHdlbGNvbWVQYXJ0OiBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0Vmlld1dlbGNvbWVQYXJ0PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9nZXR0aW5nU3RhcnRlZFRpcFBhcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfZ2V0dGluZ1N0YXJ0ZWRUaXBQYXJ0UmVmOiBDaGF0VGlwQ29udGVudFBhcnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzSW5wdXRPbmJvYXJkaW5nVmlzaWJsZSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0OiBDaGF0U3VnZ2VzdE5leHRXaWRnZXQ7XG5cblx0cHJpdmF0ZSBib2R5RGltZW5zaW9uOiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZpc2libGVDaGFuZ2VDb3VudCA9IDA7XG5cdHByaXZhdGUgcmVxdWVzdEluUHJvZ3Jlc3M6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhhc0FjdGl2ZVJlcXVlc3Q6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGFnZW50SW5JbnB1dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfdmlzaWJsZSA9IGZhbHNlO1xuXHRnZXQgdmlzaWJsZSgpIHsgcmV0dXJuIHRoaXMuX3Zpc2libGU7IH1cblxuXHRwcml2YXRlIF9pbnB1dFZpc2libGUgPSB0cnVlO1xuXHRwcml2YXRlIF9yZWFkT25seSA9IGZhbHNlO1xuXG5cdHByaXZhdGUgX2luc3RydWN0aW9uRmlsZXNDaGVja1Byb21pc2U6IFByb21pc2U8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2luc3RydWN0aW9uRmlsZXNFeGlzdDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9pc1JlbmRlcmluZ1dlbGNvbWUgPSBmYWxzZTtcblxuXHQvLyBDb2RpbmcgYWdlbnQgbG9ja2luZyBzdGF0ZVxuXHRwcml2YXRlIF9sb2NrZWRBZ2VudD86IHtcblx0XHRpZDogc3RyaW5nO1xuXHRcdG5hbWU6IHN0cmluZztcblx0XHRwcmVmaXg6IHN0cmluZztcblx0XHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRcdGFnZW50SG9zdFByb3ZpZGVySWQ/OiBzdHJpbmc7XG5cdH07XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2tlZFRvQ29kaW5nQWdlbnRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfbG9ja2VkQ29kaW5nQWdlbnRJZENvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWRPbmx5Q29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRJc0FnZW50SG9zdFNlc3Npb25Db250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdEFnZW50SG9zdFByb3ZpZGVySWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvblN1cHBvcnRzRm9ya0NvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hZ2VudFN1cHBvcnRzQXR0YWNobWVudHNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbklzRW1wdHlDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaGFzUGVuZGluZ1JlcXVlc3RzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25IYXNEZWJ1Z0RhdGFDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfYXR0YWNobWVudENhcGFiaWxpdGllczogSUNoYXRBZ2VudEF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgPSBzdXBwb3J0c0FsbEF0dGFjaG1lbnRzO1xuXG5cdC8vIEF1dG9waWxvdCBnb2FsIGJhbm5lciBzdGF0ZSBcdTIwMTQgdG9rZW4gc291cmNlIGNhbmNlbHMgaW4tZmxpZ2h0IGdvYWwtc3VtbWFyeVxuXHQvLyByZXF1ZXN0cyB3aGVuIHRoZSB1c2VyIHN0YXJ0cyBhIG5ldyBzdWJtaXNzaW9uIG9yIHRoZSBydW4gY29tcGxldGVzLlxuXHRwcml2YXRlIF9nb2FsU3VtbWFyeVRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZ29hbEJhbm5lckRpc21pc3NlZEZvckN1cnJlbnRSZXF1ZXN0ID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dvYWxCYW5uZXJEaXNtaXNzTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld01vZGVsRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF92aWV3TW9kZWw6IENoYXRWaWV3TW9kZWwgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzZXQgdmlld01vZGVsKHZpZXdNb2RlbDogQ2hhdFZpZXdNb2RlbCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl92aWV3TW9kZWwgPT09IHZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzU2Vzc2lvblJlc291cmNlID0gdGhpcy5fdmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0dGhpcy52aWV3TW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0dGhpcy5fdmlld01vZGVsID0gdmlld01vZGVsO1xuXHRcdGlmICh2aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMuYWRkKHZpZXdNb2RlbCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0NoYXRXaWRnZXQjc2V0Vmlld01vZGVsOiBoYXZlIHZpZXdNb2RlbCcpO1xuXG5cdFx0XHQvLyBJZiBzd2l0Y2hpbmcgdG8gYSBtb2RlbCB3aXRoIGEgcmVxdWVzdCBpbiBwcm9ncmVzcywgcGxheSBwcm9ncmVzcyBzb3VuZFxuXHRcdFx0aWYgKHZpZXdNb2RlbC5tb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLmNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZS5hY2NlcHRSZXF1ZXN0KHZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ0NoYXRXaWRnZXQjc2V0Vmlld01vZGVsOiBubyB2aWV3TW9kZWwnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdNb2RlbC5maXJlKHsgcHJldmlvdXNTZXNzaW9uUmVzb3VyY2UsIGN1cnJlbnRTZXNzaW9uUmVzb3VyY2U6IHRoaXMuX3ZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlIH0pO1xuXHR9XG5cblx0Z2V0IHZpZXdNb2RlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld01vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdGluZ1Nlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRFZGl0aW5nU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdmlld01vZGVsT2JzID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLm9uRGlkQ2hhbmdlVmlld01vZGVsLCAoKSA9PiB0aGlzLnZpZXdNb2RlbCk7XG5cblx0cHJpdmF0ZSBwYXJzZWRDaGF0UmVxdWVzdDogSVBhcnNlZENoYXRSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRnZXQgcGFyc2VkSW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMucGFyc2VkQ2hhdFJlcXVlc3QgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4geyB0ZXh0OiAnJywgcGFydHM6IFtdIH07XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucGFyc2VkQ2hhdFJlcXVlc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKVxuXHRcdFx0XHQucGFyc2VDaGF0UmVxdWVzdFdpdGhSZWZlcmVuY2VzKGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQodGhpcyksIGdldFNlbGVjdGVkVG9vbEFuZFRvb2xTZXRzRm9yV2lkZ2V0KHRoaXMpLCB0aGlzLmdldElucHV0KCksIHRoaXMubG9jYXRpb24sIHtcblx0XHRcdFx0XHRzZWxlY3RlZEFnZW50OiB0aGlzLl9sYXN0U2VsZWN0ZWRBZ2VudCxcblx0XHRcdFx0XHRtb2RlOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdFx0XHRhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB0aGlzLmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMsXG5cdFx0XHRcdFx0Zm9yY2VkQWdlbnQ6IHRoaXMuX2xvY2tlZEFnZW50Py5pZCA/IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudCh0aGlzLl9sb2NrZWRBZ2VudC5pZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2Vzc2lvblR5cGU6IGdldENoYXRTZXNzaW9uVHlwZSh0aGlzLnZpZXdNb2RlbC5tb2RlbC5zZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJzZWRJbnB1dC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucGFyc2VkQ2hhdFJlcXVlc3Q7XG5cdH1cblxuXHRnZXQgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5jb250ZXh0S2V5U2VydmljZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvY2F0aW9uOiBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucztcblx0Z2V0IGxvY2F0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhdGlvbi5sb2NhdGlvbjtcblx0fVxuXG5cdHJlYWRvbmx5IHZpZXdDb250ZXh0OiBJQ2hhdFdpZGdldFZpZXdDb250ZXh0O1xuXG5cdGdldCBzdXBwb3J0c0NoYW5naW5nTW9kZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy52aWV3T3B0aW9ucy5zdXBwb3J0c0NoYW5naW5nTW9kZXM7XG5cdH1cblxuXHRnZXQgbG9jYXRpb25EYXRhKCkge1xuXHRcdHJldHVybiB0aGlzLl9sb2NhdGlvbi5yZXNvbHZlRGF0YT8uKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24gfCBJQ2hhdFdpZGdldExvY2F0aW9uT3B0aW9ucyxcblx0XHR2aWV3Q29udGV4dDogSUNoYXRXaWRnZXRWaWV3Q29udGV4dCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXdPcHRpb25zOiBJQ2hhdFdpZGdldFZpZXdPcHRpb25zLFxuXHRcdHByaXZhdGUgc3R5bGVzOiBJQ2hhdFdpZGdldFN0eWxlcyxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZTogSUNoYXRBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U6IElDaGF0U2xhc2hDb21tYW5kU2VydmljZSxcblx0XHRASUNoYXRFZGl0aW5nU2VydmljZSBjaGF0RWRpdGluZ1NlcnZpY2U6IElDaGF0RWRpdGluZ1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U6IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdExheW91dFNlcnZpY2U6IElDaGF0TGF5b3V0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRUb2RvTGlzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0VG9kb0xpc3RTZXJ2aWNlOiBJQ2hhdFRvZG9MaXN0U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUNoYXRBdHRhY2htZW50UmVzb2x2ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlOiBJQ2hhdEF0dGFjaG1lbnRSZXNvbHZlU2VydmljZSxcblx0XHRASUNoYXRUaXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFRpcFNlcnZpY2U6IElDaGF0VGlwU2VydmljZSxcblx0XHRASUNoYXREZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RGVidWdTZXJ2aWNlOiBJQ2hhdERlYnVnU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNoYXRHb2FsU3VtbWFyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0R29hbFN1bW1hcnlTZXJ2aWNlOiBJQ2hhdEdvYWxTdW1tYXJ5U2VydmljZSxcblx0XHRASUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlOiBJQ2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZSxcblx0XHRASUNoYXRQZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFBldFNlcnZpY2U6IElDaGF0UGV0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVhZE9ubHlCYW5uZXIgPSB2aWV3T3B0aW9ucy5pc1Nlc3Npb25zV2luZG93ID8gdW5kZWZpbmVkIDogdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlYWRPbmx5QmFubmVyKSk7XG5cdFx0dGhpcy5fbG9ja2VkVG9Db2RpbmdBZ2VudENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMubG9ja2VkVG9Db2RpbmdBZ2VudC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fbG9ja2VkQ29kaW5nQWdlbnRJZENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMubG9ja2VkQ29kaW5nQWdlbnRJZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVhZE9ubHlDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLnJlYWRPbmx5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jaGF0SXNBZ2VudEhvc3RTZXNzaW9uQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5jaGF0SXNBZ2VudEhvc3RTZXNzaW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9jaGF0QWdlbnRIb3N0UHJvdmlkZXJJZENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuY2hhdEFnZW50SG9zdFByb3ZpZGVySWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2NoYXRTZXNzaW9uU3VwcG9ydHNGb3JrQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblN1cHBvcnRzRm9yay5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fYWdlbnRTdXBwb3J0c0F0dGFjaG1lbnRzQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5hZ2VudFN1cHBvcnRzQXR0YWNobWVudHMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Nlc3Npb25Jc0VtcHR5Q29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbklzRW1wdHkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hhc1BlbmRpbmdSZXF1ZXN0c0NvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuaGFzUGVuZGluZ1JlcXVlc3RzLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9zZXNzaW9uSGFzRGVidWdEYXRhQ29udGV4dEtleSA9IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbkhhc0RlYnVnRGF0YS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXREZWJ1Z1NlcnZpY2Uub25EaWRBZGRFdmVudChlID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlICYmIGUuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25IYXNEZWJ1Z0RhdGFDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnZpZXdDb250ZXh0ID0gdmlld0NvbnRleHQgPz8ge307XG5cblx0XHRjb25zdCB2aWV3TW9kZWxPYnMgPSB0aGlzLl92aWV3TW9kZWxPYnM7XG5cblx0XHRpZiAodHlwZW9mIGxvY2F0aW9uID09PSAnb2JqZWN0Jykge1xuXHRcdFx0dGhpcy5fbG9jYXRpb24gPSBsb2NhdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9jYXRpb24gPSB7IGxvY2F0aW9uIH07XG5cdFx0fVxuXG5cdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdFNlc3Npb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSkuc2V0KHRoaXMuX2xvY2F0aW9uLmxvY2F0aW9uKTtcblx0XHRDaGF0Q29udGV4dEtleXMuaW5RdWlja0NoYXQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNRdWlja0NoYXQodGhpcykpO1xuXHRcdHRoaXMuYWdlbnRJbklucHV0ID0gQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzQWdlbnQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnJlcXVlc3RJblByb2dyZXNzID0gQ2hhdENvbnRleHRLZXlzLnJlcXVlc3RJblByb2dyZXNzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNBY3RpdmVSZXF1ZXN0ID0gQ2hhdENvbnRleHRLZXlzLmhhc0FjdGl2ZVJlcXVlc3QuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZUFub255bW91cygoKSA9PiB0aGlzLnJlbmRlcldlbGNvbWVWaWV3Q29udGVudElmTmVlZGVkKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2NoYXQudGlwcy5lbmFibGVkJykpIHtcblx0XHRcdFx0aWYgKCF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LnRpcHMuZW5hYmxlZCcpKSB7XG5cdFx0XHRcdFx0dGhpcy5jbGVhckdldHRpbmdTdGFydGVkVGlwKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uUHJvZ3Jlc3NCb3JkZXIpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlV29ya2luZ1Byb2dyZXNzQm9yZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVJlZHVjZWRNb3Rpb24oKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVXb3JraW5nUHJvZ3Jlc3NCb3JkZXIoKTtcblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5saXN0V2lkZ2V0LnJlcmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LCBjb250ZXh0S2V5U2VydmljZSwgKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb24gPSB0aGlzLl9lZGl0aW5nU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWN1cnJlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudHJpZXMgPSBjdXJyZW50U2Vzc2lvbi5lbnRyaWVzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGRlY2lkZWRFbnRyaWVzID0gZW50cmllcy5maWx0ZXIoZW50cnkgPT4gZW50cnkuc3RhdGUucmVhZChyZWFkZXIpICE9PSBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblx0XHRcdHJldHVybiBkZWNpZGVkRW50cmllcy5tYXAoZW50cnkgPT4gZW50cnkuZW50cnlJZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KGhhc1VuZGVjaWRlZENoYXRFZGl0aW5nUmVzb3VyY2VDb250ZXh0S2V5LCBjb250ZXh0S2V5U2VydmljZSwgKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb24gPSB0aGlzLl9lZGl0aW5nU2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gY3VycmVudFNlc3Npb24/LmVudHJpZXMucmVhZChyZWFkZXIpID8/IFtdOyAvLyB1c2luZyBjdXJyZW50U2Vzc2lvbiBoZXJlXG5cdFx0XHRjb25zdCBkZWNpZGVkRW50cmllcyA9IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnN0YXRlLnJlYWQocmVhZGVyKSA9PT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCk7XG5cdFx0XHRyZXR1cm4gZGVjaWRlZEVudHJpZXMubGVuZ3RoID4gMDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoaGFzQXBwbGllZENoYXRFZGl0c0NvbnRleHRLZXksIGNvbnRleHRLZXlTZXJ2aWNlLCAocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvbiA9IHRoaXMuX2VkaXRpbmdTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghY3VycmVudFNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZW50cmllcyA9IGN1cnJlbnRTZXNzaW9uLmVudHJpZXMucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGVudHJpZXMubGVuZ3RoID4gMDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoaW5DaGF0RWRpdGluZ1Nlc3Npb25Db250ZXh0S2V5LCBjb250ZXh0S2V5U2VydmljZSwgKHJlYWRlcikgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VkaXRpbmdTZXNzaW9uLnJlYWQocmVhZGVyKSAhPT0gbnVsbDtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoQ2hhdENvbnRleHRLZXlzLmNoYXRFZGl0aW5nQ2FuVW5kbywgY29udGV4dEtleVNlcnZpY2UsIChyKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZWRpdGluZ1Nlc3Npb24ucmVhZChyKT8uY2FuVW5kby5yZWFkKHIpIHx8IGZhbHNlO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShDaGF0Q29udGV4dEtleXMuY2hhdEVkaXRpbmdDYW5SZWRvLCBjb250ZXh0S2V5U2VydmljZSwgKHIpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9lZGl0aW5nU2Vzc2lvbi5yZWFkKHIpPy5jYW5SZWRvLnJlYWQocikgfHwgZmFsc2U7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KGFwcGx5aW5nQ2hhdEVkaXRzRmFpbGVkQ29udGV4dEtleSwgY29udGV4dEtleVNlcnZpY2UsIChyKSA9PiB7XG5cdFx0XHRjb25zdCBjaGF0TW9kZWwgPSB2aWV3TW9kZWxPYnMucmVhZChyKT8ubW9kZWw7XG5cdFx0XHRjb25zdCBlZGl0aW5nU2Vzc2lvbiA9IHRoaXMuX2VkaXRpbmdTZXNzaW9uLnJlYWQocik7XG5cdFx0XHRpZiAoIWVkaXRpbmdTZXNzaW9uIHx8ICFjaGF0TW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGFzdFJlc3BvbnNlID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBjaGF0TW9kZWwub25EaWRDaGFuZ2UsICgpID0+IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKT8ucmVzcG9uc2UpLnJlYWQocik7XG5cdFx0XHRyZXR1cm4gbGFzdFJlc3BvbnNlPy5yZXN1bHQ/LmVycm9yRGV0YWlscyAmJiAhbGFzdFJlc3BvbnNlPy5yZXN1bHQ/LmVycm9yRGV0YWlscy5yZXNwb25zZUlzSW5jb21wbGV0ZTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFN1Z2dlc3ROZXh0V2lkZ2V0KSk7XG5cblx0XHQvLyBDbGVhciB0aGUgYXV0b3BpbG90IGdvYWwgYmFubmVyIHdoZW5ldmVyIHRoZSBhY3RpdmUgcmVxdWVzdCBmaW5pc2hlcy5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHIgPT4ge1xuXHRcdFx0Y29uc3Qgdmlld01vZGVsID0gdmlld01vZGVsT2JzLnJlYWQocik7XG5cdFx0XHRjb25zdCBpblByb2dyZXNzID0gdmlld01vZGVsPy5tb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5yZWFkKHIpID8/IGZhbHNlO1xuXHRcdFx0aWYgKCFpblByb2dyZXNzKSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbEdvYWxTdW1tYXJ5KCk7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZT8uY2xlYXJHb2FsQmFubmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHZpZXdNb2RlbE9icy5yZWFkKHIpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSBjaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLnJlYWQocik7XG5cblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9ucy5maW5kKGNhbmRpZGF0ZSA9PiBpc0VxdWFsKGNhbmRpZGF0ZS5jaGF0U2Vzc2lvblJlc291cmNlLCB2aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0dGhpcy5fZWRpdGluZ1Nlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUoKTsgLy8gdGhpcyBpcyBuZWNlc3NhcnkgdG8gbWFrZSBzdXJlIHdlIGRpc3Bvc2UgcHJldmlvdXMgYnV0dG9ucywgZXRjLlxuXG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0Ly8gbm9uZSBvciBmb3IgYSBkaWZmZXJlbnQgY2hhdCB3aWRnZXRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbnRyaWVzID0gc2Vzc2lvbi5lbnRyaWVzLnJlYWQocik7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0ZW50cnkuc3RhdGUucmVhZChyKTsgLy8gU0lHTkFMXG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VkaXRpbmdTZXNzaW9uLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRyLnN0b3JlLmFkZChzZXNzaW9uLm9uRGlkRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2VkaXRpbmdTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUoKTtcblx0XHRcdH0pKTtcblx0XHRcdHIuc3RvcmUuYWRkKHRoaXMuaW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5nZXRJbnB1dCgpID09PSAnJykge1xuXHRcdFx0XHRcdHRoaXMucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyQ29kZUVkaXRvck9wZW5IYW5kbGVyKGFzeW5jIChpbnB1dDogSVRleHRSZXNvdXJjZUVkaXRvcklucHV0LCBfc291cmNlOiBJQ29kZUVkaXRvciB8IG51bGwsIF9zaWRlQnlTaWRlPzogYm9vbGVhbik6IFByb21pc2U8SUNvZGVFZGl0b3IgfCBudWxsPiA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IGlucHV0LnJlc291cmNlO1xuXHRcdFx0aWYgKHJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVDaGF0Q29kZUJsb2NrKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNwb25zZUlkID0gcmVzb3VyY2UucGF0aC5zcGxpdCgnLycpLmF0KDEpO1xuXHRcdFx0aWYgKCFyZXNwb25zZUlkKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpdGVtID0gdGhpcy52aWV3TW9kZWw/LmdldEl0ZW1zKCkuZmluZChpdGVtID0+IGl0ZW0uaWQgPT09IHJlc3BvbnNlSWQpO1xuXHRcdFx0aWYgKCFpdGVtKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPOiBuZWVkcyB0byByZXZlYWwgdGhlIGNoYXQgdmlld1xuXG5cdFx0XHR0aGlzLnJldmVhbChpdGVtKTtcblxuXHRcdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gd2FpdCBmb3IgbGlzdCB0byBhY3R1YWxseSByZW5kZXJcblxuXHRcdFx0Zm9yIChjb25zdCBjb2RlQmxvY2tQYXJ0IG9mIHRoaXMubGlzdFdpZGdldC5lZGl0b3JzSW5Vc2UoKSkge1xuXHRcdFx0XHRpZiAoZXh0VXJpLmlzRXF1YWwoY29kZUJsb2NrUGFydC51cmksIHJlc291cmNlLCB0cnVlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGNvZGVCbG9ja1BhcnQuZWRpdG9yO1xuXG5cdFx0XHRcdFx0bGV0IHJlbGF0aXZlVG9wID0gMDtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JEb21Ob2RlID0gZWRpdG9yLmdldERvbU5vZGUoKTtcblx0XHRcdFx0XHRpZiAoZWRpdG9yRG9tTm9kZSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgcm93ID0gZG9tLmZpbmRQYXJlbnRXaXRoQ2xhc3MoZWRpdG9yRG9tTm9kZSwgJ21vbmFjby1saXN0LXJvdycpO1xuXHRcdFx0XHRcdFx0aWYgKHJvdykge1xuXHRcdFx0XHRcdFx0XHRyZWxhdGl2ZVRvcCA9IGRvbS5nZXRUb3BMZWZ0T2Zmc2V0KGVkaXRvckRvbU5vZGUpLnRvcCAtIGRvbS5nZXRUb3BMZWZ0T2Zmc2V0KHJvdykudG9wO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChpbnB1dC5vcHRpb25zPy5zZWxlY3Rpb24pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvclNlbGVjdGlvblRvcE9mZnNldCA9IGVkaXRvci5nZXRUb3BGb3JQb3NpdGlvbihpbnB1dC5vcHRpb25zLnNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIGlucHV0Lm9wdGlvbnMuc2VsZWN0aW9uLnN0YXJ0Q29sdW1uKTtcblx0XHRcdFx0XHRcdHJlbGF0aXZlVG9wICs9IGVkaXRvclNlbGVjdGlvblRvcE9mZnNldDtcblxuXHRcdFx0XHRcdFx0ZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBpbnB1dC5vcHRpb25zLnNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBpbnB1dC5vcHRpb25zLnNlbGVjdGlvbi5zdGFydENvbHVtbixcblx0XHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogaW5wdXQub3B0aW9ucy5zZWxlY3Rpb24uZW5kTGluZU51bWJlciA/PyBpbnB1dC5vcHRpb25zLnNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRcdGVuZENvbHVtbjogaW5wdXQub3B0aW9ucy5zZWxlY3Rpb24uZW5kQ29sdW1uID8/IGlucHV0Lm9wdGlvbnMuc2VsZWN0aW9uLnN0YXJ0Q29sdW1uXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLnJldmVhbChpdGVtLCByZWxhdGl2ZVRvcCk7XG5cblx0XHRcdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlUGFyc2VkSW5wdXQoKCkgPT4gdGhpcy51cGRhdGVDaGF0SW5wdXRDb250ZXh0KCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFRvZG9MaXN0U2VydmljZS5vbkRpZFVwZGF0ZVRvZG9zKChzZXNzaW9uUmVzb3VyY2UpID0+IHtcblx0XHRcdGlmIChpc0VxdWFsKHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0dGhpcy5pbnB1dFBhcnQucmVuZGVyQ2hhdFRvZG9MaXN0V2lkZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdH1cblxuXHRwcml2YXRlIF9sYXN0U2VsZWN0ZWRBZ2VudDogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQ7XG5cdHNldCBsYXN0U2VsZWN0ZWRBZ2VudChhZ2VudDogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLnBhcnNlZENoYXRSZXF1ZXN0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2xhc3RTZWxlY3RlZEFnZW50ID0gYWdlbnQ7XG5cdFx0dGhpcy5fdXBkYXRlQWdlbnRDYXBhYmlsaXRpZXNDb250ZXh0S2V5cyhhZ2VudCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJzZWRJbnB1dC5maXJlKCk7XG5cdH1cblxuXHRnZXQgbGFzdFNlbGVjdGVkQWdlbnQoKTogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0U2VsZWN0ZWRBZ2VudDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUFnZW50Q2FwYWJpbGl0aWVzQ29udGV4dEtleXMoYWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGFnZW50IGhhcyBjYXBhYmlsaXRpZXMgZGVmaW5lZCBkaXJlY3RseVxuXHRcdGNvbnN0IGNhcGFiaWxpdGllcyA9IGFnZW50Py5jYXBhYmlsaXRpZXMgPz8gKHRoaXMuX2xvY2tlZEFnZW50ID8gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKHRoaXMuX2xvY2tlZEFnZW50LmlkKSA6IHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYXR0YWNobWVudENhcGFiaWxpdGllcyA9IGNhcGFiaWxpdGllcyA/PyBzdXBwb3J0c0FsbEF0dGFjaG1lbnRzO1xuXG5cdFx0Y29uc3Qgc3VwcG9ydHNBdHRhY2htZW50cyA9IE9iamVjdC5rZXlzKGZpbHRlcih0aGlzLl9hdHRhY2htZW50Q2FwYWJpbGl0aWVzLCAoa2V5LCB2YWx1ZSkgPT4gdmFsdWUgPT09IHRydWUpKS5sZW5ndGggPiAwO1xuXHRcdHRoaXMuX2FnZW50U3VwcG9ydHNBdHRhY2htZW50c0NvbnRleHRLZXkuc2V0KHN1cHBvcnRzQXR0YWNobWVudHMpO1xuXHR9XG5cblx0Z2V0IHN1cHBvcnRzRmlsZVJlZmVyZW5jZXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy52aWV3T3B0aW9ucy5zdXBwb3J0c0ZpbGVSZWZlcmVuY2VzO1xuXHR9XG5cblx0Z2V0IHJlbmRlcnNJbnB1dE9uVG9wKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdPcHRpb25zLnJlbmRlcklucHV0T25Ub3AgPz8gZmFsc2U7XG5cdH1cblxuXHRnZXQgYXR0YWNobWVudENhcGFiaWxpdGllcygpOiBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaG1lbnRDYXBhYmlsaXRpZXM7XG5cdH1cblxuXHQvKipcblx0ICogRWl0aGVyIHRoZSBpbmxpbmUgaW5wdXQgKHdoZW4gZWRpdGluZykgb3IgdGhlIG1haW4gaW5wdXQgcGFydFxuXHQgKi9cblx0Z2V0IGlucHV0KCk6IENoYXRJbnB1dFBhcnQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgIT09ICdpbnB1dCcgPyB0aGlzLmlubGluZUlucHV0UGFydCA6IHRoaXMuaW5wdXRQYXJ0O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBtYWluIGlucHV0IHBhcnQgYXQgdGhlIGJ1dHRvbSBvZiB0aGUgY2hhdCB3aWRnZXQuIFVzZSBgaW5wdXRgIHRvIGdldCB0aGUgYWN0aXZlIGlucHV0IChtYWluIG9yIGlubGluZSBlZGl0aW5nIHBhcnQpLlxuXHQgKi9cblx0Z2V0IGlucHV0UGFydCgpOiBDaGF0SW5wdXRQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dFBhcnREaXNwb3NhYmxlLnZhbHVlITtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlubGluZUlucHV0UGFydCgpOiBDaGF0SW5wdXRQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5pbmxpbmVJbnB1dFBhcnREaXNwb3NhYmxlLnZhbHVlITtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlV29ya2luZ1Byb2dyZXNzQm9yZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0UGFydCA9IHRoaXMuaW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZTtcblx0XHRpZiAoIWlucHV0UGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dENvbnRhaW5lciA9IGlucHV0UGFydC5pbnB1dENvbnRhaW5lckVsZW1lbnQ7XG5cdFx0aWYgKCFpbnB1dENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5Qcm9ncmVzc0JvcmRlcikgPT09IHRydWVcblx0XHRcdCYmICF0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpXG5cdFx0XHQmJiAhaXNJbmxpbmVDaGF0KHRoaXMpO1xuXHRcdGNvbnN0IGluUHJvZ3Jlc3MgPSAhIXRoaXMudmlld01vZGVsPy5tb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5nZXQoKTtcblx0XHRpbnB1dENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd3b3JraW5nJywgZW5hYmxlZCAmJiBpblByb2dyZXNzKTtcblx0fVxuXG5cdGdldCBpbnB1dEVkaXRvcigpOiBJQ29kZUVkaXRvciB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuaW5wdXRFZGl0b3I7XG5cdH1cblxuXHRnZXQgY29udGVudEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmlucHV0LmhlaWdodC5nZXQoKSArIHRoaXMubGlzdFdpZGdldC5jb250ZW50SGVpZ2h0ICsgdGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGVpZ2h0O1xuXHR9XG5cblx0Z2V0IHNjcm9sbFRvcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9wO1xuXHR9XG5cblx0c2V0IHNjcm9sbFRvcCh2YWx1ZTogbnVtYmVyKSB7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnNjcm9sbFRvcCA9IHZhbHVlO1xuXHR9XG5cblx0aG9sZEF1dG9TY3JvbGwoKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQuYWNxdWlyZUF1dG9TY3JvbGxIb2xkKCk7XG5cdH1cblxuXHRnZXQgdHJhbnNjcmlwdERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmxpc3RXaWRnZXQuZG9tTm9kZTtcblx0fVxuXG5cdGdldCBzY3JvbGxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0LnNjcm9sbEhlaWdodDtcblx0fVxuXHRnZXQgdmlld3BvcnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0LnJlbmRlckhlaWdodDtcblx0fVxuXG5cdGdldCBhdHRhY2htZW50TW9kZWwoKTogQ2hhdEF0dGFjaG1lbnRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuYXR0YWNobWVudE1vZGVsO1xuXHR9XG5cblx0cmVuZGVyKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCB2aWV3SWQgPSBpc0lDaGF0Vmlld1ZpZXdDb250ZXh0KHRoaXMudmlld0NvbnRleHQpID8gdGhpcy52aWV3Q29udGV4dC52aWV3SWQgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5lZGl0b3JPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RWRpdG9yT3B0aW9ucywgdmlld0lkLCB0aGlzLnN0eWxlcy5saXN0Rm9yZWdyb3VuZCwgdGhpcy5zdHlsZXMuaW5wdXRFZGl0b3JCYWNrZ3JvdW5kLCB0aGlzLnN0eWxlcy5yZXN1bHRFZGl0b3JCYWNrZ3JvdW5kKSk7XG5cdFx0Y29uc3QgcmVuZGVySW5wdXRPblRvcCA9IHRoaXMudmlld09wdGlvbnMucmVuZGVySW5wdXRPblRvcCA/PyBmYWxzZTtcblx0XHRjb25zdCByZW5kZXJGb2xsb3d1cHMgPSB0aGlzLnZpZXdPcHRpb25zLnJlbmRlckZvbGxvd3VwcyA/PyAhcmVuZGVySW5wdXRPblRvcDtcblx0XHRjb25zdCByZW5kZXJTdHlsZSA9IHRoaXMudmlld09wdGlvbnMucmVuZGVyU3R5bGU7XG5cdFx0Y29uc3QgcmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dCA9IHRoaXMudmlld09wdGlvbnMucmVuZGVySW5wdXRUb29sYmFyQmVsb3dJbnB1dCA/PyBmYWxzZTtcblxuXHRcdHRoaXMuY29udGFpbmVyID0gZG9tLmFwcGVuZChwYXJlbnQsICQoJy5pbnRlcmFjdGl2ZS1zZXNzaW9uJykpO1xuXHRcdHRoaXMud2VsY29tZU1lc3NhZ2VDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcuY2hhdC13ZWxjb21lLXZpZXctY29udGFpbmVyJywgeyBzdHlsZTogJ2Rpc3BsYXk6IG5vbmUnIH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy53ZWxjb21lTWVzc2FnZUNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gdGhpcy5mb2N1c0lucHV0KCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmJvZHlEaW1lbnNpb24pIHtcblx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5ib2R5RGltZW5zaW9uLmhlaWdodCwgdGhpcy5ib2R5RGltZW5zaW9uLndpZHRoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQub25EaWRTZWxlY3RQcm9tcHQoKHsgaGFuZG9mZiwgYWdlbnRJZCwgd2l0aEF1dG9waWxvdCB9KSA9PiB7XG5cdFx0XHR0aGlzLmhhbmRsZU5leHRQcm9tcHRTZWxlY3Rpb24oaGFuZG9mZiwgYWdlbnRJZCwgd2l0aEF1dG9waWxvdCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHJlbmRlcklucHV0T25Ub3ApIHtcblx0XHRcdGlmICh0aGlzLnJlYWRPbmx5QmFubmVyKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMucmVhZE9ubHlCYW5uZXIuZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNyZWF0ZUlucHV0KHRoaXMuY29udGFpbmVyLCB7IHJlbmRlckZvbGxvd3VwcywgcmVuZGVyU3R5bGUsIHJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQgfSk7XG5cdFx0XHR0aGlzLmxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKGAuaW50ZXJhY3RpdmUtbGlzdGApKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5saXN0Q29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJChgLmludGVyYWN0aXZlLWxpc3RgKSk7XG5cdFx0XHRkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCB0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5kb21Ob2RlKTtcblx0XHRcdGlmICh0aGlzLnJlYWRPbmx5QmFubmVyKSB7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMucmVhZE9ubHlCYW5uZXIuZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNyZWF0ZUlucHV0KHRoaXMuY29udGFpbmVyLCB7IHJlbmRlckZvbGxvd3VwcywgcmVuZGVyU3R5bGUsIHJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQgJiYgIWlzSW5saW5lQ2hhdCh0aGlzKSkge1xuXHRcdFx0Y29uc3QgaW5wdXRDb250YWluZXIgPSB0aGlzLmlucHV0UGFydC5pbnB1dENvbnRhaW5lckVsZW1lbnQ7XG5cdFx0XHRjb25zdCBwZXRIb3N0ID0gaW5wdXRDb250YWluZXI/LnBhcmVudEVsZW1lbnQgPz8gdGhpcy5pbnB1dFBhcnQuZWxlbWVudDtcblx0XHRcdGNvbnN0IGlucHV0SGFzQ29udGVudCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgdGhpcy5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCwgKCkgPT4gdGhpcy5pbnB1dEVkaXRvci5nZXRWYWx1ZSgpLmxlbmd0aCA+IDApO1xuXHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0XHRjb25zdCBpc0xhdGVzdEZvY3VzZWRXaWRnZXRJbldpbmRvdyA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0ID09PSB0aGlzKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkV2lkZ2V0KGZvY3VzZWRXaWRnZXQgPT4ge1xuXHRcdFx0XHRpZiAoZm9jdXNlZFdpZGdldCAmJiBkb20uZ2V0V2luZG93KGZvY3VzZWRXaWRnZXQuZG9tTm9kZSkgPT09IHRhcmdldFdpbmRvdykge1xuXHRcdFx0XHRcdGlzTGF0ZXN0Rm9jdXNlZFdpZGdldEluV2luZG93LnNldChmb2N1c2VkV2lkZ2V0ID09PSB0aGlzLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCBwZXRWaXNpYmxlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gaXNDaGF0UGV0VmlzaWJsZSh0aGlzLmNoYXRQZXRTZXJ2aWNlLmVuYWJsZWQucmVhZChyZWFkZXIpLCBpc0xhdGVzdEZvY3VzZWRXaWRnZXRJbldpbmRvdy5yZWFkKHJlYWRlcikpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcGV0LWVuYWJsZWQnLCBwZXRWaXNpYmxlLnJlYWQocmVhZGVyKSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFBldFdpZGdldCwgcGV0SG9zdCwgaW5wdXRDb250YWluZXIgPz8gcGV0SG9zdCwgdGhpcy5fdmlld01vZGVsT2JzLm1hcCh2aWV3TW9kZWwgPT4gdmlld01vZGVsPy5tb2RlbCksIGlucHV0SGFzQ29udGVudCwgcGV0VmlzaWJsZSwgdGhpcy5pbnB1dEVkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCkpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyV2VsY29tZVZpZXdDb250ZW50SWZOZWVkZWQoKTtcblx0XHR0aGlzLmNyZWF0ZUxpc3QodGhpcy5saXN0Q29udGFpbmVyLCB7XG5cdFx0XHRlZGl0YWJsZTogIWlzSW5saW5lQ2hhdCh0aGlzKSAmJiAhaXNRdWlja0NoYXQodGhpcyksXG5cdFx0XHRjb250ZW50SG9yaXpvbnRhbFBhZGRpbmc6IHRoaXMudmlld09wdGlvbnMuaXNTZXNzaW9uc1dpbmRvdyA/IFNFU1NJT05TX0NIQVRfSVRFTV9IT1JJWk9OVEFMX1BBRERJTkcgOiB1bmRlZmluZWQsXG5cdFx0XHQuLi50aGlzLnZpZXdPcHRpb25zLnJlbmRlcmVyT3B0aW9ucyxcblx0XHRcdHJlbmRlclN0eWxlXG5cdFx0fSk7XG5cblx0XHQvLyBGb3J3YXJkIHdoZWVsIGV2ZW50cyB0aGF0IHRhcmdldCB0aGUgY2hhdCBjb250YWluZXIgaXRzZWxmICh0aGUgbWFyZ2luc1xuXHRcdC8vIGFyb3VuZCB0aGUgbGlzdCBhbmQgaW5wdXQpIHRvIHRoZSBjaGF0IGxpc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5NT1VTRV9XSEVFTCwgKGU6IElNb3VzZVdoZWVsRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQgfHwgZS50YXJnZXQgIT09IHRoaXMuY29udGFpbmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBGb3J3YXJkIHdoZWVsIGV2ZW50cyBmcm9tIHRoZSBhcmVhIGFyb3VuZCB0aGUgY2hhdCB3aWRnZXQgKGUuZy4gdGhlXG5cdFx0Ly8gbWF4LXdpZHRoIG1hcmdpbnMgaW4gdGhlIGNsYXNzaWMgVlMgQ29kZSBjaGF0IHZpZXcpIHRvIHRoZSBjaGF0IGxpc3QuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYXJlbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfV0hFRUwsIChlOiBJTW91c2VXaGVlbEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5kZWZhdWx0UHJldmVudGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgTm9kZSB8IG51bGw7XG5cdFx0XHRpZiAodGFyZ2V0ICYmIGRvbS5pc0FuY2VzdG9yKHRhcmdldCwgdGhpcy5jb250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBVcGRhdGUgdGhlIGZvbnQgZmFtaWx5IGFuZCBzaXplXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZm9udEZhbWlseSA9IHRoaXMuY2hhdExheW91dFNlcnZpY2UuZm9udEZhbWlseS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBmb250U2l6ZSA9IHRoaXMuY2hhdExheW91dFNlcnZpY2UuZm9udFNpemUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtY2hhdC1mb250LWZhbWlseScsIGZvbnRGYW1pbHkpO1xuXHRcdFx0dGhpcy5jb250YWluZXIuc3R5bGUuZm9udFNpemUgPSBgJHtmb250U2l6ZX1weGA7XG5cblx0XHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdFx0dGhpcy5saXN0V2lkZ2V0LnJlcmVuZGVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuZWRpdG9yT3B0aW9ucy5vbkRpZENoYW5nZSwgKCkgPT4gdGhpcy5vbkRpZFN0eWxlQ2hhbmdlKCkpKTtcblxuXHRcdC8vIERvIGluaXRpYWwgcmVuZGVyXG5cdFx0aWYgKHRoaXMudmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSXRlbXMoKTtcblx0XHRcdHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb0VuZCgpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29udHJpYnMgPSBDaGF0V2lkZ2V0LkNPTlRSSUJTLm1hcChjb250cmliID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGNvbnRyaWIsIHRoaXMpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBpbnN0YW50aWF0ZSBjaGF0IHdpZGdldCBjb250cmliJywgdG9FcnJvck1lc3NhZ2UoZXJyKSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLnJlZ2lzdGVyKHRoaXMpKTtcblxuXHRcdGNvbnN0IHBhcnNlZElucHV0ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLm9uRGlkQ2hhbmdlUGFyc2VkSW5wdXQsICgpID0+IHRoaXMucGFyc2VkSW5wdXQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ociA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHBhcnNlZElucHV0LnJlYWQocik7XG5cblx0XHRcdGNvbnN0IG5ld1Byb21wdEF0dGFjaG1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk+KCk7XG5cdFx0XHRjb25zdCBvbGRQcm9tcHRBdHRhY2htZW50cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0XHQvLyBnZXQgYWxsIGF0dGFjaG1lbnRzLCBrbm93IHRob3NlIHRoYXQgYXJlIHByb21wdC1yZWZlcmVuY2VkXG5cdFx0XHRmb3IgKGNvbnN0IGF0dGFjaG1lbnQgb2YgdGhpcy5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMpIHtcblx0XHRcdFx0aWYgKGF0dGFjaG1lbnQucmFuZ2UpIHtcblx0XHRcdFx0XHRvbGRQcm9tcHRBdHRhY2htZW50cy5hZGQoYXR0YWNobWVudC5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gdXBkYXRlL2luc2VydCBwcm9tcHQtcmVmZXJlbmNlZCBhdHRhY2htZW50c1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGlucHV0LnBhcnRzKSB7XG5cdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sUGFydCB8fCBwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RUb29sU2V0UGFydCB8fCBwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0KSB7XG5cdFx0XHRcdFx0Y29uc3QgZW50cnkgPSBwYXJ0LnRvVmFyaWFibGVFbnRyeSgpO1xuXHRcdFx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFJlcXVlc3REeW5hbWljVmFyaWFibGVQYXJ0ICYmIHBhcnQuaXNBdHRhY2htZW50UmVmZXJlbmNlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bmV3UHJvbXB0QXR0YWNobWVudHMuc2V0KGVudHJ5LmlkLCBlbnRyeSk7XG5cdFx0XHRcdFx0b2xkUHJvbXB0QXR0YWNobWVudHMuZGVsZXRlKGVudHJ5LmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmF0dGFjaG1lbnRNb2RlbC51cGRhdGVDb250ZXh0KG9sZFByb21wdEF0dGFjaG1lbnRzLCBuZXdQcm9tcHRBdHRhY2htZW50cy52YWx1ZXMoKSk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKCF0aGlzLmZvY3VzZWRJbnB1dERPTSkge1xuXHRcdFx0dGhpcy5mb2N1c2VkSW5wdXRET00gPSB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZChkb20uJCgnLmZvY3VzZWQtaW5wdXQtZG9tJykpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzSW5wdXQoKTogdm9pZCB7XG5cdFx0Ly8gUmVhZC1vbmx5IGNoYXRzIGhpZGUgdGhlIGlucHV0OyBmb2N1cyB0aGUgbWVzc2FnZSBsaXN0IGluc3RlYWQuXG5cdFx0aWYgKCF0aGlzLl9pbnB1dFZpc2libGUpIHtcblx0XHRcdGlmICh0aGlzLmxpc3RXaWRnZXQuZm9jdXNMYXN0SXRlbSh0cnVlKSA8IDApIHtcblx0XHRcdFx0dGhpcy5saXN0V2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmlucHV0LmZvY3VzKCk7XG5cblx0XHQvLyBTb21ldGltZXMgZm9jdXNpbmcgdGhlIGlucHV0IHBhcnQgaXMgbm90IHBvc3NpYmxlLFxuXHRcdC8vIGJ1dCB3ZSdkIGxpa2UgdG8gYmUgdGhlIGxhc3QgZm9jdXNlZCBjaGF0IHdpZGdldCxcblx0XHQvLyBzbyB3ZSBlbWl0IGFuIG9wdGltaXN0aWMgb25EaWRGb2N1cyBldmVudCBub25ldGhlbGVzcy5cblx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0fVxuXG5cdGZvY3VzVG9kb3NWaWV3KCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5pbnB1dC5oYXNWaXNpYmxlVG9kb3MoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmlucHV0LmZvY3VzVG9kb0xpc3QoKTtcblx0fVxuXG5cdHRvZ2dsZVRvZG9zVmlld0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5pbnB1dC5oYXNWaXNpYmxlVG9kb3MoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0LmlzVG9kb0xpc3RGb2N1c2VkKCkpIHtcblx0XHRcdHRoaXMuZm9jdXNJbnB1dCgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuZm9jdXNUb2RvTGlzdCgpO1xuXHR9XG5cblx0Zm9jdXNRdWVzdGlvbkNhcm91c2VsKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5pbnB1dC5xdWVzdGlvbkNhcm91c2VsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuZm9jdXNRdWVzdGlvbkNhcm91c2VsKCk7XG5cdH1cblxuXHR0b2dnbGVRdWVzdGlvbkNhcm91c2VsRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmlucHV0LnF1ZXN0aW9uQ2Fyb3VzZWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbnB1dC5pc1F1ZXN0aW9uQ2Fyb3VzZWxGb2N1c2VkKCkpIHtcblx0XHRcdHRoaXMuZm9jdXNJbnB1dCgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuZm9jdXNRdWVzdGlvbkNhcm91c2VsKCk7XG5cdH1cblxuXHRuYXZpZ2F0ZVRvUHJldmlvdXNRdWVzdGlvbigpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuaW5wdXQucXVlc3Rpb25DYXJvdXNlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmlucHV0Lm5hdmlnYXRlVG9QcmV2aW91c1F1ZXN0aW9uKCk7XG5cdH1cblxuXHRuYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5pbnB1dC5xdWVzdGlvbkNhcm91c2VsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQubmF2aWdhdGVUb05leHRRdWVzdGlvbigpO1xuXHR9XG5cblx0Zm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuZm9jdXNRdWVzdGlvbkNhcm91c2VsVGVybWluYWwoKTtcblx0fVxuXG5cdHRvZ2dsZVRpcEZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9nZXR0aW5nU3RhcnRlZFRpcFBhcnRSZWY/Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuZm9jdXNJbnB1dCgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9nZXR0aW5nU3RhcnRlZFRpcFBhcnRSZWYpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fZ2V0dGluZ1N0YXJ0ZWRUaXBQYXJ0UmVmLmZvY3VzKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRoYXNJbnB1dEZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlucHV0Lmhhc0ZvY3VzKCk7XG5cdH1cblxuXHRyZWZyZXNoUGFyc2VkSW5wdXQoKSB7XG5cdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5wYXJzZWRDaGF0UmVxdWVzdDtcblx0XHRjb25zdCBjb250ZXh0ID0ge1xuXHRcdFx0c2VsZWN0ZWRBZ2VudDogdGhpcy5fbGFzdFNlbGVjdGVkQWdlbnQsXG5cdFx0XHRtb2RlOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdGF0dGFjaG1lbnRDYXBhYmlsaXRpZXM6IHRoaXMuYXR0YWNobWVudENhcGFiaWxpdGllcyxcblx0XHRcdHNlc3Npb25UeXBlOiBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdGZvcmNlZEFnZW50OiB0aGlzLl9sb2NrZWRBZ2VudD8uaWQgPyB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQodGhpcy5fbG9ja2VkQWdlbnQuaWQpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0dGhpcy5wYXJzZWRDaGF0UmVxdWVzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RQYXJzZXIpLnBhcnNlQ2hhdFJlcXVlc3RXaXRoUmVmZXJlbmNlcyhnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0KHRoaXMpLCBnZXRTZWxlY3RlZFRvb2xBbmRUb29sU2V0c0ZvcldpZGdldCh0aGlzKSwgdGhpcy5nZXRJbnB1dCgpLCB0aGlzLmxvY2F0aW9uLCBjb250ZXh0KTtcblx0XHRpZiAoIXByZXZpb3VzIHx8ICFJUGFyc2VkQ2hhdFJlcXVlc3QuZXF1YWxzKHByZXZpb3VzLCB0aGlzLnBhcnNlZENoYXRSZXF1ZXN0KSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXJzZWRJbnB1dC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0U2libGluZyhpdGVtOiBDaGF0VHJlZUl0ZW0sIHR5cGU6ICduZXh0JyB8ICdwcmV2aW91cycpOiBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghaXNSZXNwb25zZVZNKGl0ZW0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1zID0gdGhpcy52aWV3TW9kZWw/LmdldEl0ZW1zKCk7XG5cdFx0aWYgKCFpdGVtcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZXNwb25zZUl0ZW1zID0gaXRlbXMuZmlsdGVyKGkgPT4gaXNSZXNwb25zZVZNKGkpKTtcblx0XHRjb25zdCB0YXJnZXRJbmRleCA9IHJlc3BvbnNlSXRlbXMuaW5kZXhPZihpdGVtKTtcblx0XHRpZiAodGFyZ2V0SW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleFRvRm9jdXMgPSB0eXBlID09PSAnbmV4dCcgPyB0YXJnZXRJbmRleCArIDEgOiB0YXJnZXRJbmRleCAtIDE7XG5cdFx0aWYgKGluZGV4VG9Gb2N1cyA8IDAgfHwgaW5kZXhUb0ZvY3VzID4gcmVzcG9uc2VJdGVtcy5sZW5ndGggLSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiByZXNwb25zZUl0ZW1zW2luZGV4VG9Gb2N1c107XG5cdH1cblxuXHRhc3luYyBjbGVhcih0YXJnZXRTZXNzaW9uVHlwZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnQ2hhdFdpZGdldCNjbGVhcicpO1xuXHRcdGlmICh0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEpIHtcblx0XHRcdHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YS5lbmFibGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdHRoaXMuZmluaXNoZWRFZGl0aW5nKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5yZXNldElucHV0UGxhY2Vob2xkZXIoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2xvY2tlZEFnZW50KSB7XG5cdFx0XHR0aGlzLmxvY2tUb0NvZGluZ0FnZW50KHRoaXMuX2xvY2tlZEFnZW50Lm5hbWUsIHRoaXMuX2xvY2tlZEFnZW50LmRpc3BsYXlOYW1lLCB0aGlzLl9sb2NrZWRBZ2VudC5pZCwgdGhpcy5fbG9ja2VkQWdlbnQuYWdlbnRIb3N0UHJvdmlkZXJJZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5pbnB1dFBhcnQ/LmNsZWFyVG9kb0xpc3RXaWRnZXQodGhpcy52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZSwgdHJ1ZSk7XG5cdFx0dGhpcy5pbnB1dFBhcnQ/LmNsZWFyQXJ0aWZhY3RzV2lkZ2V0KCk7XG5cdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGlkZSgpO1xuXHRcdGF3YWl0IHRoaXMudmlld09wdGlvbnMuY2xlYXI/Lih0YXJnZXRTZXNzaW9uVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlSXRlbXMoc2tpcER5bmFtaWNMYXlvdXQ/OiBib29sZWFuKSB7XG5cdFx0aWYgKHRoaXMuX3Zpc2libGUgfHwgIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMudmlld01vZGVsPy5nZXRJdGVtcygpID8/IFtdO1xuXG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNoYXRWaWV3VmlzaWJpbGl0eSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9vbldpbGxNYXliZUNoYW5nZUhlaWdodC5maXJlKCk7XG5cblx0XHRcdC8vIFVwZGF0ZSBsaXN0IHdpZGdldCBzdGF0ZSBhbmQgcmVmcmVzaFxuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnNldFZpc2libGVDaGFuZ2VDb3VudCh0aGlzLnZpc2libGVDaGFuZ2VDb3VudCk7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQucmVmcmVzaCgpO1xuXG5cdFx0XHRpZiAoIXNraXBEeW5hbWljTGF5b3V0ICYmIHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YSkge1xuXHRcdFx0XHR0aGlzLmxheW91dER5bmFtaWNDaGF0VHJlZUl0ZW1Nb2RlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVuZGVyRm9sbG93dXBzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIERPTSB2aXNpYmlsaXR5IG9mIHdlbGNvbWUgdmlldyBhbmQgY2hhdCBsaXN0IGltbWVkaWF0ZWx5XG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZUNoYXRWaWV3VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdGNvbnN0IGlzU3RhbmRhcmRMYXlvdXQgPSB0aGlzLnZpZXdPcHRpb25zLnJlbmRlclN0eWxlICE9PSAnY29tcGFjdCcgJiYgdGhpcy52aWV3T3B0aW9ucy5yZW5kZXJTdHlsZSAhPT0gJ21pbmltYWwnO1xuXHRcdFx0Y29uc3QgbnVtSXRlbXMgPSB0aGlzLnZpZXdNb2RlbC5nZXRJdGVtcygpLmxlbmd0aDtcblx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KG51bUl0ZW1zID09PSAwLCB0aGlzLndlbGNvbWVNZXNzYWdlQ29udGFpbmVyKTtcblx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KG51bUl0ZW1zICE9PSAwLCB0aGlzLmxpc3RDb250YWluZXIpO1xuXG5cdFx0XHQvLyBTaG93L2hpZGUgdGhlIGdldHRpbmctc3RhcnRlZCB0aXAgY29udGFpbmVyIGJhc2VkIG9uIGVtcHR5IHN0YXRlLlxuXHRcdFx0Ly8gT25seSB1c2UgdGhpcyBpbiB0aGUgc3RhbmRhcmQgY2hhdCBsYXlvdXQgd2hlcmUgdGhlIHdlbGNvbWUgdmlldyBpcyBzaG93bi5cblx0XHRcdGlmIChpc1N0YW5kYXJkTGF5b3V0ICYmIHRoaXMuaW5wdXRQYXJ0KSB7XG5cdFx0XHRcdGlmIChudW1JdGVtcyA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyR2V0dGluZ1N0YXJ0ZWRUaXBJZk5lZWRlZCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIERpc3Bvc2UgdGhlIGNhY2hlZCB0aXAgcGFydCBzbyB0aGUgbmV4dCBlbXB0eSBzdGF0ZSBwaWNrcyBhXG5cdFx0XHRcdFx0Ly8gZnJlc2ggKHJvdGF0ZWQpIHRpcCBpbnN0ZWFkIG9mIHJlLXNob3dpbmcgdGhlIHN0YWxlIG9uZS5cblx0XHRcdFx0XHR0aGlzLmNsZWFyR2V0dGluZ1N0YXJ0ZWRUaXAoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE9ubHkgc2hvdyB3ZWxjb21lIGdldHRpbmcgc3RhcnRlZCB1bnRpbCBzZXR1cCBpcyBjb21wbGV0ZWRcblx0XHR0aGlzLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKFxuXHRcdFx0J2NoYXQtdmlldy1nZXR0aW5nLXN0YXJ0ZWQtZGlzYWJsZWQnLFxuXHRcdFx0dGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5jb21wbGV0ZWQgfHwgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmhhc0J5b2tNb2RlbHMpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VFbXB0eVN0YXRlLmZpcmUoKTtcblx0fVxuXG5cdGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5sZW5ndGggPz8gMCkgPT09IDA7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVycyB0aGUgd2VsY29tZSB2aWV3IGNvbnRlbnQgd2hlbiBuZWVkZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlcldlbGNvbWVWaWV3Q29udGVudElmTmVlZGVkKCkge1xuXHRcdGlmICh0aGlzLl9pc1JlbmRlcmluZ1dlbGNvbWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgaW5wdXQgcGFydCBtYXkgbm90IGJlIHJlbmRlcmVkIHlldCAob3IgbWF5IGhhdmUgYmVlbiBkaXNwb3NlZCkgd2hlbiB0aGlzIGlzXG5cdFx0Ly8gY2FsbGVkIGZyb20gYXN5bmMgZmxvd3Mgc3VjaCBhcyBgbG9ja1RvQ29kaW5nQWdlbnRgIC8gYHVubG9ja0Zyb21Db2RpbmdBZ2VudGAgdGhhdFxuXHRcdC8vIHJ1biBhZnRlciBgc2hvd01vZGVsYCByZXNvbHZlcy4gQmFpbCBvdXQgdG8gYXZvaWQgZGVyZWZlcmVuY2luZyBhbiB1bmRlZmluZWQgaW5wdXQuXG5cdFx0aWYgKCF0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc1JlbmRlcmluZ1dlbGNvbWUgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy52aWV3T3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnIHx8IHRoaXMudmlld09wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdtaW5pbWFsJyB8fCB0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2lsbFNodXRkb3duKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbnVtSXRlbXMgPSB0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5sZW5ndGggPz8gMDtcblx0XHRcdGlmICghbnVtSXRlbXMpIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdEFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudCh0aGlzLmxvY2F0aW9uLCB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCk7XG5cdFx0XHRcdGxldCBhZGRpdGlvbmFsTWVzc2FnZTogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmFub255bW91cyAmJiAhdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5jb21wbGV0ZWQpIHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlcnMgPSBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQucHJvdmlkZXI7XG5cdFx0XHRcdFx0YWRkaXRpb25hbE1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoeyBrZXk6ICdzZXR0aW5ncycsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIl0oezJ9KVwifScsICd7TG9ja2VkPVwiXSh7M30pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nIHdpdGggezB9IENvcGlsb3QsIHlvdSBhZ3JlZSB0byB7MX0ncyBbVGVybXNdKHsyfSkgYW5kIFtQcml2YWN5IFN0YXRlbWVudF0oezN9KS5cIiwgcHJvdmlkZXJzLmRlZmF1bHQubmFtZSwgcHJvdmlkZXJzLmRlZmF1bHQubmFtZSwgcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50LnRlcm1zU3RhdGVtZW50VXJsLCBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQucHJpdmFjeVN0YXRlbWVudFVybCksIHsgaXNUcnVzdGVkOiB0cnVlIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxNZXNzYWdlID0gZGVmYXVsdEFnZW50Py5tZXRhZGF0YS5hZGRpdGlvbmFsV2VsY29tZU1lc3NhZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFhZGRpdGlvbmFsTWVzc2FnZSAmJiAhdGhpcy5fbG9ja2VkQWdlbnQpIHtcblx0XHRcdFx0XHRhZGRpdGlvbmFsTWVzc2FnZSA9IHRoaXMuX2dldEdlbmVyYXRlSW5zdHJ1Y3Rpb25zTWVzc2FnZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHdlbGNvbWVDb250ZW50ID0gdGhpcy5nZXRXZWxjb21lVmlld0NvbnRlbnQoYWRkaXRpb25hbE1lc3NhZ2UpO1xuXHRcdFx0XHRpZiAoIXRoaXMud2VsY29tZVBhcnQudmFsdWUgfHwgdGhpcy53ZWxjb21lUGFydC52YWx1ZS5uZWVkc1JlcmVuZGVyKHdlbGNvbWVDb250ZW50KSkge1xuXHRcdFx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy53ZWxjb21lTWVzc2FnZUNvbnRhaW5lcik7XG5cblx0XHRcdFx0XHR0aGlzLndlbGNvbWVQYXJ0LnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdENoYXRWaWV3V2VsY29tZVBhcnQsXG5cdFx0XHRcdFx0XHR3ZWxjb21lQ29udGVudCxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bG9jYXRpb246IHRoaXMubG9jYXRpb24sXG5cdFx0XHRcdFx0XHRcdGlzV2lkZ2V0QWdlbnRXZWxjb21lVmlld0NvbnRlbnQ6IHRoaXMuaW5wdXQ/LmN1cnJlbnRNb2RlS2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRkb20uYXBwZW5kKHRoaXMud2VsY29tZU1lc3NhZ2VDb250YWluZXIsIHRoaXMud2VsY29tZVBhcnQudmFsdWUuZWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy51cGRhdGVDaGF0Vmlld1Zpc2liaWxpdHkoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5faXNSZW5kZXJpbmdXZWxjb21lID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJHZXR0aW5nU3RhcnRlZFRpcElmTmVlZGVkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pbnB1dFBhcnQgfHwgIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzSW5wdXRPbmJvYXJkaW5nVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLmNsZWFyR2V0dGluZ1N0YXJ0ZWRUaXAoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0aXBDb250YWluZXIgPSB0aGlzLmlucHV0UGFydC5nZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lckVsZW1lbnQ7XG5cblx0XHRjb25zdCB0aXAgPSB0aGlzLmNoYXRUaXBTZXJ2aWNlLmdldFdlbGNvbWVUaXAodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKCF0aXApIHtcblx0XHRcdHRoaXMuY2xlYXJHZXR0aW5nU3RhcnRlZFRpcCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFscmVhZHkgc2hvd2luZyBhbiBlbGlnaWJsZSB0aXBcblx0XHRpZiAodGhpcy5fZ2V0dGluZ1N0YXJ0ZWRUaXBQYXJ0LnZhbHVlKSB7XG5cdFx0XHRkb20uc2V0VmlzaWJpbGl0eSh0cnVlLCB0aXBDb250YWluZXIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdGNvbnN0IHRpcFBhcnQgPSBzdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGlwQ29udGVudFBhcnQsXG5cdFx0XHR0aXAsXG5cdFx0XHRyZW5kZXJlcixcblx0XHQpKTtcblx0XHR0aGlzLl9nZXR0aW5nU3RhcnRlZFRpcFBhcnRSZWYgPSB0aXBQYXJ0O1xuXG5cdFx0c3RvcmUuYWRkKHRpcFBhcnQub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdHRpcFBhcnQuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX2dldHRpbmdTdGFydGVkVGlwUGFydFJlZiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2dldHRpbmdTdGFydGVkVGlwUGFydC5jbGVhcigpO1xuXHRcdFx0ZG9tLnNldFZpc2liaWxpdHkoZmFsc2UsIHRpcENvbnRhaW5lcik7XG5cdFx0XHR0aGlzLmZvY3VzSW5wdXQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTZXQgdGhlIGd1YXJkIGJlZm9yZSBhcHBlbmRpbmcgdG8gRE9NIHNvIHRoYXQgYW55IHJlLWVudHJhbnQgY2FsbHNcblx0XHQvLyB0cmlnZ2VyZWQgYnkgY29udGV4dC1rZXkgY2hhbmdlcyBkdXJpbmcgY29uc3RydWN0aW9uIHNlZSB0aGUgZ3VhcmRcblx0XHQvLyBhbmQgcmV0dXJuIGVhcmx5IHdpdGhvdXQgYWRkaW5nIGEgZHVwbGljYXRlIHRpcCBub2RlLlxuXHRcdHRoaXMuX2dldHRpbmdTdGFydGVkVGlwUGFydC52YWx1ZSA9IHN0b3JlO1xuXHRcdC8vIENsZWFyIGFueSBzdGFsZSBub2RlcyBsZWZ0IGZyb20gYSBwcmV2aW91cyB0aXAgdGhhdCB3YXMgbm90IHByb3Blcmx5XG5cdFx0Ly8gcmVtb3ZlZCAoZS5nLiBpZiByZS1lbnRyYW5jeSBieXBhc3NlZCB0aGUgZ3VhcmQgYWJvdmUpLlxuXHRcdGRvbS5jbGVhck5vZGUodGlwQ29udGFpbmVyKTtcblx0XHR0aXBDb250YWluZXIuYXBwZW5kQ2hpbGQodGlwUGFydC5kb21Ob2RlKTtcblx0XHRkb20uc2V0VmlzaWJpbGl0eSh0cnVlLCB0aXBDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhckdldHRpbmdTdGFydGVkVGlwKCk6IHZvaWQge1xuXHRcdHRoaXMuX2dldHRpbmdTdGFydGVkVGlwUGFydFJlZiA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9nZXR0aW5nU3RhcnRlZFRpcFBhcnQuY2xlYXIoKTtcblx0XHRpZiAodGhpcy5pbnB1dFBhcnQpIHtcblx0XHRcdGNvbnN0IHRpcENvbnRhaW5lciA9IHRoaXMuaW5wdXRQYXJ0LmdldHRpbmdTdGFydGVkVGlwQ29udGFpbmVyRWxlbWVudDtcblx0XHRcdGRvbS5jbGVhck5vZGUodGlwQ29udGFpbmVyKTtcblx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KGZhbHNlLCB0aXBDb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNJbnB1dE9uYm9hcmRpbmdWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc0lucHV0T25ib2FyZGluZ1Zpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIHNldElucHV0T25ib2FyZGluZ1Zpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzSW5wdXRPbmJvYXJkaW5nVmlzaWJsZSA9IHZpc2libGU7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMuY2xlYXJHZXR0aW5nU3RhcnRlZFRpcCgpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pc0VtcHR5KCkpIHtcblx0XHRcdHRoaXMucmVuZGVyR2V0dGluZ1N0YXJ0ZWRUaXBJZk5lZWRlZCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldEdlbmVyYXRlSW5zdHJ1Y3Rpb25zTWVzc2FnZSgpOiBJTWFya2Rvd25TdHJpbmcge1xuXHRcdC8vIFN0YXJ0IGNoZWNraW5nIGZvciBpbnN0cnVjdGlvbiBmaWxlcyBpbW1lZGlhdGVseSBpZiBub3QgYWxyZWFkeSBkb25lXG5cdFx0aWYgKCF0aGlzLl9pbnN0cnVjdGlvbkZpbGVzQ2hlY2tQcm9taXNlKSB7XG5cdFx0XHR0aGlzLl9pbnN0cnVjdGlvbkZpbGVzQ2hlY2tQcm9taXNlID0gdGhpcy5fY2hlY2tGb3JBZ2VudEluc3RydWN0aW9uRmlsZXMoKTtcblx0XHRcdC8vIFVzZSBWUyBDb2RlJ3MgaWRpb21hdGljIHBhdHRlcm4gZm9yIGRpc3Bvc2FsLXNhZmUgcHJvbWlzZSBjYWxsYmFja3Ncblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoZW5JZk5vdERpc3Bvc2VkKHRoaXMuX2luc3RydWN0aW9uRmlsZXNDaGVja1Byb21pc2UsIGhhc0ZpbGVzID0+IHtcblx0XHRcdFx0dGhpcy5faW5zdHJ1Y3Rpb25GaWxlc0V4aXN0ID0gaGFzRmlsZXM7XG5cdFx0XHRcdC8vIE9ubHkgcmUtcmVuZGVyIGlmIHRoZSBjdXJyZW50IHZpZXcgc3RpbGwgZG9lc24ndCBoYXZlIGl0ZW1zIGFuZCB3ZSdyZSBzaG93aW5nIHRoZSB3ZWxjb21lIG1lc3NhZ2Vcblx0XHRcdFx0Y29uc3QgaGFzVmlld01vZGVsSXRlbXMgPSB0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKS5sZW5ndGggPz8gMDtcblx0XHRcdFx0aWYgKGhhc1ZpZXdNb2RlbEl0ZW1zID09PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgYWxyZWFkeSBrbm93IHRoZSByZXN1bHQsIHVzZSBpdFxuXHRcdGlmICh0aGlzLl9pbnN0cnVjdGlvbkZpbGVzRXhpc3QgPT09IHRydWUpIHtcblx0XHRcdC8vIERvbid0IHNob3cgZ2VuZXJhdGUgaW5zdHJ1Y3Rpb25zIG1lc3NhZ2UgaWYgZmlsZXMgZXhpc3Rcblx0XHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoJycpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faW5zdHJ1Y3Rpb25GaWxlc0V4aXN0ID09PSBmYWxzZSkge1xuXHRcdFx0Ly8gU2hvdyBnZW5lcmF0ZSBpbnN0cnVjdGlvbnMgbWVzc2FnZSBpZiBubyBmaWxlcyBleGlzdFxuXHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZShcblx0XHRcdFx0J2NoYXRXaWRnZXQuaW5zdHJ1Y3Rpb25zJyxcblx0XHRcdFx0XCJbR2VuZXJhdGUgQWdlbnQgSW5zdHJ1Y3Rpb25zXSh7MH0pIHRvIG9uYm9hcmQgQUkgb250byB5b3VyIGNvZGViYXNlLlwiLFxuXHRcdFx0XHRgY29tbWFuZDoke0dFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEfWBcblx0XHRcdCksIHsgaXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogW0dFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lEXSB9IH0pO1xuXHRcdH1cblxuXHRcdC8vIFdoaWxlIGNoZWNraW5nLCBkb24ndCBzaG93IHRoZSBnZW5lcmF0ZSBpbnN0cnVjdGlvbnMgbWVzc2FnZVxuXHRcdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcoJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiBhbnkgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgKC5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQgb3IgQUdFTlRTLm1kKSBleGlzdCBpbiB0aGUgd29ya3NwYWNlLlxuXHQgKiBVc2VkIHRvIGRldGVybWluZSB3aGV0aGVyIHRvIHNob3cgdGhlIFwiR2VuZXJhdGUgQWdlbnQgSW5zdHJ1Y3Rpb25zXCIgaGludC5cblx0ICpcblx0ICogQHJldHVybnMgdHJ1ZSBpZiBpbnN0cnVjdGlvbiBmaWxlcyBleGlzdCBPUiBpZiBpbnN0cnVjdGlvbiBmZWF0dXJlcyBhcmUgZGlzYWJsZWQgKHRvIGhpZGUgdGhlIGhpbnQpXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jaGVja0ZvckFnZW50SW5zdHJ1Y3Rpb25GaWxlcygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkubGVuZ3RoID4gMDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gT24gZXJyb3IsIGFzc3VtZSBubyBpbnN0cnVjdGlvbiBmaWxlcyBleGlzdCB0byBiZSBzYWZlXG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW0NoYXRXaWRnZXRdIEVycm9yIGNoZWNraW5nIGZvciBpbnN0cnVjdGlvbiBmaWxlczonLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRXZWxjb21lVmlld0NvbnRlbnQoYWRkaXRpb25hbE1lc3NhZ2U6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZCk6IElDaGF0Vmlld1dlbGNvbWVDb250ZW50IHtcblx0XHRpZiAodGhpcy5pc0xvY2tlZFRvQ29kaW5nQWdlbnQpIHtcblx0XHRcdC8vIENoZWNrIGZvciBwcm92aWRlci1zcGVjaWZpYyBjdXN0b21pemF0aW9ucyBmcm9tIGNoYXQgc2Vzc2lvbnMgc2VydmljZVxuXHRcdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fbG9ja2VkQWdlbnQgPyB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24odGhpcy5fbG9ja2VkQWdlbnQuaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJJY29uID0gY29udHJpYnV0aW9uPy5pY29uO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJUaXRsZSA9IGNvbnRyaWJ1dGlvbj8ud2VsY29tZVRpdGxlO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJNZXNzYWdlID0gY29udHJpYnV0aW9uPy53ZWxjb21lTWVzc2FnZTtcblxuXHRcdFx0Ly8gRmFsbGJhY2sgdG8gZGVmYXVsdCBtZXNzYWdlcyBpZiBwcm92aWRlciBkb2Vzbid0IHNwZWNpZnlcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBwcm92aWRlck1lc3NhZ2Vcblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcocHJvdmlkZXJNZXNzYWdlKVxuXHRcdFx0XHQ6ICh0aGlzLl9sb2NrZWRBZ2VudD8ucHJlZml4ID09PSAnQGNvcGlsb3QgJ1xuXHRcdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdjb3BpbG90Q29kaW5nQWdlbnRNZXNzYWdlJywgXCJUaGlzIGNoYXQgc2Vzc2lvbiB3aWxsIGJlIGZvcndhcmRlZCB0byB0aGUgezB9IFtjb2RpbmcgYWdlbnRdKHsxfSkgd2hlcmUgd29yayBpcyBjb21wbGV0ZWQgaW4gdGhlIGJhY2tncm91bmQuIFwiLCB0aGlzLl9sb2NrZWRBZ2VudC5wcmVmaXgsICdodHRwczovL2FrYS5tcy9jb2RpbmctYWdlbnQtZG9jcycpICsgRElTQ0xBSU1FUiwgeyBpc1RydXN0ZWQ6IHRydWUgfSlcblx0XHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZ2VuZXJpY0NvZGluZ0FnZW50TWVzc2FnZScsIFwiVGhpcyBjaGF0IHNlc3Npb24gd2lsbCBiZSBmb3J3YXJkZWQgdG8gdGhlIHswfSBjb2RpbmcgYWdlbnQgd2hlcmUgd29yayBpcyBjb21wbGV0ZWQgaW4gdGhlIGJhY2tncm91bmQuIFwiLCB0aGlzLl9sb2NrZWRBZ2VudD8ucHJlZml4KSArIERJU0NMQUlNRVIpKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IHByb3ZpZGVyVGl0bGUgPz8gbG9jYWxpemUoJ2NvZGluZ0FnZW50VGl0bGUnLCBcIkRlbGVnYXRlIHRvIHswfVwiLCB0aGlzLl9sb2NrZWRBZ2VudD8ucHJlZml4KSxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0aWNvbjogcHJvdmlkZXJJY29uID8/IENvZGljb24uc2VuZFRvUmVtb3RlQWdlbnQsXG5cdFx0XHRcdGFkZGl0aW9uYWxNZXNzYWdlLFxuXHRcdFx0XHR1c2VMYXJnZUljb246ICEhcHJvdmlkZXJJY29uLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRsZXQgdGl0bGU6IHN0cmluZztcblx0XHRpZiAodGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQgPT09IENoYXRNb2RlS2luZC5Bc2spIHtcblx0XHRcdHRpdGxlID0gbG9jYWxpemUoJ2NoYXREZXNjcmlwdGlvbicsIFwiQXNrIGFib3V0IHlvdXIgY29kZVwiKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kID09PSBDaGF0TW9kZUtpbmQuRWRpdCkge1xuXHRcdFx0dGl0bGUgPSBsb2NhbGl6ZSgnZWRpdHNUaXRsZScsIFwiRWRpdCBpbiBjb250ZXh0XCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aXRsZSA9IGxvY2FsaXplKCdhZ2VudFRpdGxlJywgXCJCdWlsZCB3aXRoIEFnZW50XCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR0aXRsZSxcblx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhESVNDTEFJTUVSKSxcblx0XHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0XHRhZGRpdGlvbmFsTWVzc2FnZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXJDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMuaW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dC5yZW5kZXJDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZSh0aGlzLl9lZGl0aW5nU2Vzc2lvbi5nZXQoKSA/PyBudWxsKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVuZGVyRm9sbG93dXBzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGxhc3RJdGVtID0gdGhpcy5saXN0V2lkZ2V0Lmxhc3RJdGVtO1xuXHRcdGlmIChsYXN0SXRlbSAmJiBpc1Jlc3BvbnNlVk0obGFzdEl0ZW0pICYmIGxhc3RJdGVtLmlzQ29tcGxldGUpIHtcblx0XHRcdHRoaXMuaW5wdXQucmVuZGVyRm9sbG93dXBzKGxhc3RJdGVtLnJlcGx5Rm9sbG93dXBzLCBsYXN0SXRlbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW5wdXQucmVuZGVyRm9sbG93dXBzKHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYXRTdWdnZXN0TmV4dFdpZGdldCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9yZWFkT25seSkge1xuXHRcdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgcmVuZGVyaW5nIGluIGNvZGluZyBhZ2VudCBzZXNzaW9ucyB1bmxlc3MgdGhlIGFnZW50IHN1cHBvcnRzIGhhbmQtb2Zmc1xuXHRcdGlmICh0aGlzLmlzTG9ja2VkVG9Db2RpbmdBZ2VudCAmJiAhdGhpcy5fYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c0hhbmRPZmZzKSB7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLnZpZXdNb2RlbD8uZ2V0SXRlbXMoKSA/PyBbXTtcblx0XHRpZiAoIWl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RJdGVtID0gaXRlbXNbaXRlbXMubGVuZ3RoIC0gMV07XG5cdFx0Y29uc3QgbGFzdFJlc3BvbnNlQ29tcGxldGUgPSBsYXN0SXRlbSAmJiBpc1Jlc3BvbnNlVk0obGFzdEl0ZW0pICYmIGxhc3RJdGVtLmlzQ29tcGxldGU7XG5cdFx0aWYgKCFsYXN0UmVzcG9uc2VDb21wbGV0ZSB8fCBsYXN0SXRlbS5pc0NhbmNlbGVkKSB7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGVyaXZlIGhhbmRvZmZzIGZyb20gdGhlIG1vZGUgdGhhdCBnZW5lcmF0ZWQgdGhlIGxhc3QgcmVzcG9uc2UsIG5vdCB0aGUgY3VycmVudCBVSSBzZWxlY3Rpb24uXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIGhhbmRvZmZzIHJlZmxlY3Qgd2hhdCB0aGUgcmVzcG9uc2UgYWdlbnQgb2ZmZXJzLCByZWdhcmRsZXNzIG9mIG1vZGUgcGlja2VyIHN0YXRlLlxuXHRcdC8vIEZhbGwgYmFjayB0byB0aGUgY3VycmVudCBtb2RlIHBpY2tlciBmb3Igb2xkIHNlc3Npb25zIHdoZXJlIG1vZGVJbmZvIHdhcyBub3QgcGVyc2lzdGVkLlxuXHRcdGNvbnN0IG1vZGVJbmZvID0gbGFzdEl0ZW0ubW9kZWwucmVxdWVzdD8ubW9kZUluZm87XG5cdFx0bGV0IHJlc3BvbnNlTW9kZTogSUNoYXRNb2RlIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1vZGVzID0gdGhpcy5pbnB1dC5jdXJyZW50Q2hhdE1vZGVzT2JzLmdldCgpO1xuXHRcdGlmIChtb2RlSW5mbz8ubW9kZUluc3RydWN0aW9ucz8ubmFtZSkge1xuXHRcdFx0cmVzcG9uc2VNb2RlID0gbW9kZXMuZmluZE1vZGVCeU5hbWUobW9kZUluZm8ubW9kZUluc3RydWN0aW9ucy5uYW1lKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzcG9uc2VNb2RlID0gdGhpcy5pbnB1dC5jdXJyZW50TW9kZU9icy5nZXQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYW5kb2ZmcyA9IHJlc3BvbnNlTW9kZT8uaGFuZE9mZnM/LmdldCgpO1xuXG5cdFx0aWYgKHJlc3BvbnNlTW9kZSAmJiBoYW5kb2ZmcyAmJiBoYW5kb2Zmcy5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBJbiBBdXRvcGlsb3QgbW9kZSwgYXV0b21hdGljYWxseSB0cmlnZ2VyIHRoZSBmaXJzdCBhdXRvLXNlbmQgaGFuZG9mZlxuXHRcdFx0Ly8gc28gdGhlIHBsYW4gZmxvd3Mgc2VhbWxlc3NseSBpbnRvIGltcGxlbWVudGF0aW9uIHdpdGhvdXQgdXNlciBpbnRlcmFjdGlvbi5cblx0XHRcdGNvbnN0IHBlcm1pc3Npb25MZXZlbCA9IHRoaXMuaW5wdXRQYXJ0LmN1cnJlbnRNb2RlSW5mby5wZXJtaXNzaW9uTGV2ZWw7XG5cdFx0XHRpZiAocGVybWlzc2lvbkxldmVsID09PSBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCkge1xuXHRcdFx0XHRjb25zdCBhdXRvU2VuZEhhbmRvZmYgPSBoYW5kb2Zmcy5maW5kKGggPT4gaC5zZW5kKTtcblx0XHRcdFx0aWYgKGF1dG9TZW5kSGFuZG9mZikge1xuXHRcdFx0XHRcdHRoaXMuaGFuZGxlTmV4dFByb21wdFNlbGVjdGlvbihhdXRvU2VuZEhhbmRvZmYpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBMb2cgdGVsZW1ldHJ5IG9ubHkgd2hlbiB3aWRnZXQgdHJhbnNpdGlvbnMgZnJvbSBoaWRkZW4gdG8gdmlzaWJsZVxuXHRcdFx0Y29uc3Qgd2FzSGlkZGVuID0gdGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZSc7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5yZW5kZXIocmVzcG9uc2VNb2RlKTtcblxuXHRcdFx0aWYgKHdhc0hpZGRlbikge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0SGFuZG9mZldpZGdldFNob3duRXZlbnQsIENoYXRIYW5kb2ZmV2lkZ2V0U2hvd25DbGFzc2lmaWNhdGlvbj4oJ2NoYXQuaGFuZG9mZldpZGdldFNob3duJywge1xuXHRcdFx0XHRcdGFnZW50OiBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeShyZXNwb25zZU1vZGUpLFxuXHRcdFx0XHRcdGhhbmRvZmZDb3VudDogaGFuZG9mZnMubGVuZ3RoXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJpZ2dlciBsYXlvdXQgdXBkYXRlXG5cdFx0aWYgKHRoaXMuYm9keURpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5ib2R5RGltZW5zaW9uLmhlaWdodCwgdGhpcy5ib2R5RGltZW5zaW9uLndpZHRoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZU5leHRQcm9tcHRTZWxlY3Rpb24oaGFuZG9mZjogSUhhbmRPZmYsIGFnZW50SWQ/OiBzdHJpbmcsIHdpdGhBdXRvcGlsb3Q/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gSGlkZSB0aGUgd2lkZ2V0IGFmdGVyIHNlbGVjdGlvblxuXHRcdHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhpZGUoKTtcblxuXHRcdC8vIElmIHN0YXJ0aW5nIHdpdGggQXV0b3BpbG90LCBzZXQgcGVybWlzc2lvbiBsZXZlbCBiZWZvcmUgc3VibWl0dGluZ1xuXHRcdGlmICh3aXRoQXV0b3BpbG90KSB7XG5cdFx0XHR0aGlzLmlucHV0UGFydC5zZXRQZXJtaXNzaW9uTGV2ZWwoQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21wdFRvVXNlID0gaGFuZG9mZi5wcm9tcHQ7XG5cblx0XHQvLyBMb2cgdGVsZW1ldHJ5XG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLmlucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpO1xuXHRcdGNvbnN0IHRvTW9kZSA9IGhhbmRvZmYuYWdlbnQgPyB0aGlzLmlucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCkuZmluZE1vZGVCeU5hbWUoaGFuZG9mZi5hZ2VudCkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdEhhbmRvZmZDbGlja0V2ZW50LCBDaGF0SGFuZG9mZkNsaWNrQ2xhc3NpZmljYXRpb24+KCdjaGF0LmhhbmRvZmZDbGlja2VkJywge1xuXHRcdFx0ZnJvbUFnZW50OiBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeShjdXJyZW50TW9kZSksXG5cdFx0XHR0b0FnZW50OiBhZ2VudElkIHx8ICh0b01vZGUgPyBnZXRNb2RlTmFtZUZvclRlbGVtZXRyeSh0b01vZGUpIDogJycpLFxuXHRcdFx0aGFzUHJvbXB0OiBCb29sZWFuKHByb21wdFRvVXNlKSxcblx0XHRcdGF1dG9TZW5kOiBCb29sZWFuKGhhbmRvZmYuc2VuZClcblx0XHR9KTtcblxuXHRcdHRoaXMuZXhlY3V0ZUhhbmRvZmYoaGFuZG9mZiwgYWdlbnRJZCkuY2F0Y2goZSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBhZ2VudElkID8/IGhhbmRvZmYuYWdlbnQgPz8gJ3Vua25vd24nO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbSGFuZG9mZl0gRmFpbGVkIHRvIGV4ZWN1dGUgaGFuZG9mZiAnJHtoYW5kb2ZmLmxhYmVsfScgdG8gJyR7dGFyZ2V0fSdgLCBlKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGV4ZWN1dGVIYW5kb2ZmKGhhbmRvZmY6IElIYW5kT2ZmLCBhZ2VudElkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGlkZSgpO1xuXG5cdFx0Y29uc3QgcHJvbXB0VG9Vc2UgPSBoYW5kb2ZmLnByb21wdDtcblxuXHRcdC8vIElmIGFnZW50SWQgaXMgcHJvdmlkZWQgKGZyb20gY2hldnJvbiBkcm9wZG93biksIGRlbGVnYXRlIHRvIHRoYXQgY2hhdCBzZXNzaW9uXG5cdFx0Ly8gT3RoZXJ3aXNlLCBzd2l0Y2ggdG8gdGhlIGhhbmRvZmYgYWdlbnRcblx0XHRpZiAoYWdlbnRJZCkge1xuXHRcdFx0Ly8gRGVsZWdhdGUgdG8gY2hhdCBzZXNzaW9uIChlLmcuLCBAYmFja2dyb3VuZCBvciBAY2xvdWQpXG5cdFx0XHR0aGlzLmlucHV0LnNldFZhbHVlKGBAJHthZ2VudElkfSAke3Byb21wdFRvVXNlfWAsIGZhbHNlKTtcblx0XHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0XHRcdC8vIEF1dG8tc3VibWl0IGZvciBkZWxlZ2F0ZWQgY2hhdCBzZXNzaW9uc1xuXHRcdFx0dGhpcy5hY2NlcHRJbnB1dCgpLmNhdGNoKGUgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbSGFuZG9mZl0gRmFpbGVkIHRvIHN1Ym1pdCBkZWxlZ2F0ZWQgaGFuZG9mZiB0byAnQCR7YWdlbnRJZH0nYCwgZSkpO1xuXHRcdH0gZWxzZSBpZiAoaGFuZG9mZi5hZ2VudCkge1xuXHRcdFx0Ly8gUmVndWxhciBoYW5kb2ZmIHRvIHNwZWNpZmllZCBhZ2VudFxuXHRcdFx0Y29uc3Qgc3dpdGNoZWQgPSBhd2FpdCB0aGlzLl9zd2l0Y2hUb0FnZW50QnlOYW1lKGhhbmRvZmYuYWdlbnQpO1xuXHRcdFx0aWYgKCFzd2l0Y2hlZCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0hhbmRvZmZdIERpZCBub3QgZXhlY3V0ZSBoYW5kb2ZmICcke2hhbmRvZmYubGFiZWx9JyB0byAnJHtoYW5kb2ZmLmFnZW50fScgYmVjYXVzZSBzd2l0Y2hpbmcgYWdlbnRzIHdhcyB1bnN1Y2Nlc3NmdWxgKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gU3dpdGNoIHRvIHRoZSBzcGVjaWZpZWQgbW9kZWwgaWYgcHJvdmlkZWRcblx0XHRcdGNvbnN0IG1vZGVsUmVhZHkgPSBoYW5kb2ZmLm1vZGVsID8gdGhpcy5pbnB1dC5yZXF1ZXN0TW9kZWxCeVF1YWxpZmllZE5hbWUoW2hhbmRvZmYubW9kZWxdKSA6IHVuZGVmaW5lZDtcblx0XHRcdC8vIEluc2VydCB0aGUgaGFuZG9mZiBwcm9tcHQgaW50byB0aGUgaW5wdXRcblx0XHRcdHRoaXMuaW5wdXQuc2V0VmFsdWUocHJvbXB0VG9Vc2UsIGZhbHNlKTtcblx0XHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblxuXHRcdFx0Ly8gQXV0by1zdWJtaXQgaWYgc2VuZCBmbGFnIGlzIHRydWVcblx0XHRcdGlmIChoYW5kb2ZmLnNlbmQpIHtcblx0XHRcdFx0aWYgKG1vZGVsUmVhZHkgJiYgIWF3YWl0IG1vZGVsUmVhZHkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5hY2NlcHRJbnB1dCgpLmNhdGNoKGUgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbSGFuZG9mZl0gRmFpbGVkIHRvIHN1Ym1pdCBoYW5kb2ZmIHRvICcke2hhbmRvZmYuYWdlbnR9J2AsIGUpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBoYW5kbGVEZWxlZ2F0aW9uRXhpdElmTmVlZGVkKHNvdXJjZUFnZW50OiBQaWNrPElDaGF0QWdlbnREYXRhLCAnaWQnIHwgJ25hbWUnPiB8IHVuZGVmaW5lZCwgdGFyZ2V0QWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uKHNvdXJjZUFnZW50LCB0YXJnZXRBZ2VudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWxlZ2F0aW9uXSBXaWxsIGV4aXQgYWZ0ZXIgZGVsZWdhdGlvbjogc291cmNlQWdlbnQ9JHtzb3VyY2VBZ2VudD8uaWR9LCB0YXJnZXRBZ2VudD0ke3RhcmdldEFnZW50Py5pZH1gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5faGFuZGxlRGVsZWdhdGlvbkV4aXQoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tEZWxlZ2F0aW9uXSBGYWlsZWQgdG8gaGFuZGxlIGRlbGVnYXRpb24gZXhpdCcsIGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZEV4aXRBZnRlckRlbGVnYXRpb24oc291cmNlQWdlbnQ6IFBpY2s8SUNoYXRBZ2VudERhdGEsICdpZCcgfCAnbmFtZSc+IHwgdW5kZWZpbmVkLCB0YXJnZXRBZ2VudDogSUNoYXRBZ2VudERhdGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRhcmdldEFnZW50KSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBfc2hvdWxkRXhpdEFmdGVyRGVsZWdhdGlvbjogZmFsc2UgKG5vIHRhcmdldEFnZW50KScpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5FeGl0QWZ0ZXJEZWxlZ2F0aW9uKSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVsZWdhdGlvbl0gX3Nob3VsZEV4aXRBZnRlckRlbGVnYXRpb246IGZhbHNlIChFeGl0QWZ0ZXJEZWxlZ2F0aW9uIGNvbmZpZyBkaXNhYmxlZCknKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBOZXZlciBleGl0IGlmIHRoZSBzb3VyY2UgYW5kIHRhcmdldCBhcmUgdGhlIHNhbWUgKHRoYXQgbWVhbnMgdGhhdCB5b3UncmUgcHJvdmlkaW5nIGEgZm9sbG93IHVwLCBldGMuKVxuXHRcdC8vIE5PVEU6IHNvdXJjZUFnZW50IHdvdWxkIGJlIHRoZSBjaGF0V2lkZ2V0J3MgJ2xvY2tlZEFnZW50J1xuXHRcdGlmIChzb3VyY2VBZ2VudCAmJiBzb3VyY2VBZ2VudC5pZCA9PT0gdGFyZ2V0QWdlbnQuaWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIF9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uOiBmYWxzZSAoc291cmNlIGFuZCB0YXJnZXQgYWdlbnRzIGFyZSB0aGUgc2FtZSknKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIWlzSUNoYXRWaWV3Vmlld0NvbnRleHQodGhpcy52aWV3Q29udGV4dCkpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIF9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uOiBmYWxzZSAobm90IGluIGNoYXQgdmlldyBjb250ZXh0KScpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih0YXJnZXRBZ2VudC5pZCk7XG5cdFx0aWYgKCFjb250cmlidXRpb24pIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0RlbGVnYXRpb25dIF9zaG91bGRFeGl0QWZ0ZXJEZWxlZ2F0aW9uOiBmYWxzZSAobm8gY29udHJpYnV0aW9uIGZvdW5kIGZvciB0YXJnZXRBZ2VudC5pZD0ke3RhcmdldEFnZW50LmlkfSlgKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoY29udHJpYnV0aW9uLmNhbkRlbGVnYXRlICE9PSB0cnVlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWxlZ2F0aW9uXSBfc2hvdWxkRXhpdEFmdGVyRGVsZWdhdGlvbjogZmFsc2UgKGNvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZT0ke2NvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZX0sIGV4cGVjdGVkIHRydWUpYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVsZWdhdGlvbl0gX3Nob3VsZEV4aXRBZnRlckRlbGVnYXRpb246IHRydWUnKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSBleGl0IG9mIHRoZSBwYW5lbCBjaGF0IHdoZW4gYSBkZWxlZ2F0aW9uIHRvIGFub3RoZXIgc2Vzc2lvbiBvY2N1cnMuXG5cdCAqIFdhaXRzIGZvciB0aGUgcmVzcG9uc2UgdG8gY29tcGxldGUgYW5kIGFueSBwZW5kaW5nIGNvbmZpcm1hdGlvbnMgdG8gYmUgcmVzb2x2ZWQsXG5cdCAqIHRoZW4gY2xlYXJzIHRoZSB3aWRnZXQgdW5sZXNzIHRoZSBmaW5hbCBtZXNzYWdlIGlzIGFuIGVycm9yLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlRGVsZWdhdGlvbkV4aXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gdGhpcy52aWV3TW9kZWw7XG5cdFx0aWYgKCF2aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIF9oYW5kbGVEZWxlZ2F0aW9uRXhpdDogbm8gdmlld01vZGVsLCByZXR1cm5pbmcnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uUmVzb3VyY2UgPSB2aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZyhgW0RlbGVnYXRpb25dIF9oYW5kbGVEZWxlZ2F0aW9uRXhpdDogcGFyZW50U2Vzc2lvblJlc291cmNlPSR7cGFyZW50U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cblx0XHQvLyBDaGVjayBpZiByZXNwb25zZSBpcyBjb21wbGV0ZSwgbm90IHBlbmRpbmcgY29uZmlybWF0aW9uLCBhbmQgaGFzIG5vIGVycm9yXG5cdFx0Y29uc3QgY2hlY2tJZlNob3VsZENsZWFyID0gKCk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSB2aWV3TW9kZWwuZ2V0SXRlbXMoKTtcblx0XHRcdGNvbnN0IGxhc3RJdGVtID0gaXRlbXNbaXRlbXMubGVuZ3RoIC0gMV07XG5cdFx0XHRpZiAobGFzdEl0ZW0gJiYgaXNSZXNwb25zZVZNKGxhc3RJdGVtKSAmJiBsYXN0SXRlbS5tb2RlbCAmJiBsYXN0SXRlbS5pc0NvbXBsZXRlICYmICFsYXN0SXRlbS5tb2RlbC5pc1BlbmRpbmdDb25maXJtYXRpb24uZ2V0KCkpIHtcblx0XHRcdFx0Y29uc3QgaGFzRXJyb3IgPSBCb29sZWFuKGxhc3RJdGVtLnJlc3VsdD8uZXJyb3JEZXRhaWxzKTtcblx0XHRcdFx0cmV0dXJuICFoYXNFcnJvcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0aWYgKGNoZWNrSWZTaG91bGRDbGVhcigpKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBSZXNwb25zZSBjb21wbGV0ZSwgYXJjaGl2aW5nIHNlc3Npb24gYmVmb3JlIGNsZWFyaW5nJyk7XG5cdFx0XHQvLyBBcmNoaXZlIEJFRk9SRSBjbGVhcmluZyB0byBlbnN1cmUgc2Vzc2lvbiBzdGlsbCBleGlzdHMgaW4gYWdlbnRTZXNzaW9uc1NlcnZpY2Vcblx0XHRcdGF3YWl0IHRoaXMuYXJjaGl2ZUxvY2FsUGFyZW50U2Vzc2lvbihwYXJlbnRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIFdhaXRpbmcgZm9yIHJlc3BvbnNlIHRvIGNvbXBsZXRlLi4uJyk7XG5cdFx0Y29uc3Qgc2hvdWxkQ2xlYXIgPSBhd2FpdCBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB2aWV3TW9kZWwub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBjaGVja0lmU2hvdWxkQ2xlYXIoKTtcblx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdFx0XHRyZXNvbHZlKHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmRlYnVnKCdbRGVsZWdhdGlvbl0gVGltZW91dCB3YWl0aW5nIGZvciByZXNwb25zZSB0byBjb21wbGV0ZScpO1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlc29sdmUoZmFsc2UpO1xuXHRcdFx0fSwgMzBfMDAwKTsgLy8gMzAgc2Vjb25kIHRpbWVvdXRcblx0XHRcdGNvbnN0IGNsZWFudXAgPSAoKSA9PiB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0aWYgKHNob3VsZENsZWFyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBSZXNwb25zZSBjb21wbGV0ZWQsIGFyY2hpdmluZyBzZXNzaW9uIGJlZm9yZSBjbGVhcmluZycpO1xuXHRcdFx0YXdhaXQgdGhpcy5hcmNoaXZlTG9jYWxQYXJlbnRTZXNzaW9uKHBhcmVudFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB0aGlzLmNsZWFyKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnW0RlbGVnYXRpb25dIE5vdCBjbGVhcmluZyAodGltZW91dCBvciBlcnJvciknKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFyY2hpdmVMb2NhbFBhcmVudFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBJbiB0aGUgcmVndWxhciB3b3JrYmVuY2gsIG9ubHkgYXJjaGl2ZSBsb2NhbCBjaGF0IHNlc3Npb25zLlxuXHRcdC8vIEluIHRoZSBzZXNzaW9ucyB3aW5kb3csIGFsbG93IGFyY2hpdmluZyBhbnkgc2Vzc2lvbiB0eXBlIGFmdGVyIGRlbGVnYXRpb24uXG5cdFx0aWYgKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpICE9PSBsb2NhbENoYXRTZXNzaW9uVHlwZSAmJiAhSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQuZ2V0VmFsdWUodGhpcy5jb250ZXh0S2V5U2VydmljZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoYFtEZWxlZ2F0aW9uXSBhcmNoaXZlTG9jYWxQYXJlbnRTZXNzaW9uOiBhcmNoaXZpbmcgc2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXG5cdFx0Ly8gSW1wbGljaXRseSBrZWVwIHBhcmVudCBzZXNzaW9uJ3MgY2hhbmdlcyBhcyB0aGV5J3ZlIG5vdyBiZWVuIGRlbGVnYXRlZCB0byB0aGUgbmV3IGFnZW50LlxuXHRcdGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpPy5lZGl0aW5nU2Vzc2lvbj8uYWNjZXB0KCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24uc2V0QXJjaGl2ZWQodHJ1ZSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1tEZWxlZ2F0aW9uXSBhcmNoaXZlTG9jYWxQYXJlbnRTZXNzaW9uOiBzZXNzaW9uIGFyY2hpdmVkIHN1Y2Nlc3NmdWxseScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW0RlbGVnYXRpb25dIGFyY2hpdmVMb2NhbFBhcmVudFNlc3Npb246IHNlc3Npb24gbm90IGZvdW5kIGluIGFnZW50U2Vzc2lvbnNTZXJ2aWNlIGZvciAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrIHRoZSBjaGF0IHNob3duIGluIHRoaXMgd2lkZ2V0IGFzIHJlYWQtb25seSAobm9uLWludGVyYWN0aXZlKSBvciBub3QuXG5cdCAqIFJlYWQtb25seSBjaGF0cyBoaWRlIHRoZSBjb21wb3NlciBhbmQgZXhwb3NlIGEgY29udGV4dCBrZXkgc28gbXV0YXRpbmdcblx0ICogYWN0aW9ucyAoZS5nLiBTdGFydCBPdmVyLCBSZXN0b3JlIENoZWNrcG9pbnQpIGFyZSBub3Qgb2ZmZXJlZC5cblx0ICovXG5cdHNldFJlYWRPbmx5KHJlYWRPbmx5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzUmVhZE9ubHkgPSB0aGlzLl9yZWFkT25seTtcblx0XHR0aGlzLl9yZWFkT25seSA9IHJlYWRPbmx5O1xuXHRcdHRoaXMuX3JlYWRPbmx5Q29udGV4dEtleS5zZXQocmVhZE9ubHkpO1xuXHRcdGlmIChyZWFkT25seSkge1xuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHRcdHRoaXMuZmluaXNoZWRFZGl0aW5nKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0XHRpZiAodGhpcy5oYXNJbnB1dEZvY3VzKCkpIHtcblx0XHRcdFx0aWYgKHRoaXMubGlzdFdpZGdldC5mb2N1c0xhc3RJdGVtKHRydWUpIDwgMCkge1xuXHRcdFx0XHRcdHRoaXMubGlzdFdpZGdldC5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh3YXNSZWFkT25seSkge1xuXHRcdFx0dGhpcy5yZW5kZXJDaGF0U3VnZ2VzdE5leHRXaWRnZXQoKTtcblx0XHR9XG5cdFx0dGhpcy5yZWFkT25seUJhbm5lcj8uc2V0VmlzaWJsZShyZWFkT25seSk7XG5cdFx0dGhpcy5zZXRJbnB1dFZpc2libGUoIXJlYWRPbmx5KTtcblx0XHQvLyBBdXRob3JpdGF0aXZlIG92ZXIgdGhlIGxvY2svdW5sb2NrIGBlZGl0YWJsZWAgdG9nZ2xlcyBiZWxvdy5cblx0XHR0aGlzLl9hcHBseVJlbmRlcmVyRWRpdGFibGUoIXJlYWRPbmx5KTtcblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQ/LnJlcmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGxpZXMgdGhlIHJlbmRlcmVyJ3MgYGVkaXRhYmxlYCBvcHRpb24sIGZvcmNpbmcgaXQgb2ZmIHdoaWxlIHRoZSBjaGF0IGlzXG5cdCAqIHJlYWQtb25seSBzbyB0aGUgbG9jay91bmxvY2sgdHJhbnNpdGlvbnMgY2FuIG5ldmVyIHJlLWVuYWJsZSByZXF1ZXN0XG5cdCAqIGVkaXRpbmcgb24gYSByZWFkLW9ubHkgY2hhdC5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5UmVuZGVyZXJFZGl0YWJsZShlZGl0YWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMubGlzdFdpZGdldD8udXBkYXRlUmVuZGVyZXJPcHRpb25zKHsgZWRpdGFibGU6IGVkaXRhYmxlICYmICF0aGlzLl9yZWFkT25seSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTaG93IG9yIGhpZGUgdGhlIGlucHV0IHBhcnQuIEhpZGRlbiBpbnB1dHMgYXJlIHJlbW92ZWQgZnJvbSB0aGUgRE9NIGZsb3dcblx0ICogdW5sZXNzIHRoZXkgY29udGFpbiBwZXJzaXN0ZW50IGNvbnRlbnQuIFVzZWQgdG8gcmVuZGVyIHJlYWQtb25seSBjaGF0c1xuXHQgKiB3aXRob3V0IGEgY29tcG9zZXIgd2hpbGUgcmV0YWluaW5nIGlucHV0LWFkamFjZW50IHN0YXR1cyBjb250cm9scy5cblx0ICovXG5cdHNldElucHV0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZCA9IHRoaXMuX2lucHV0VmlzaWJsZSAhPT0gdmlzaWJsZTtcblx0XHR0aGlzLl9pbnB1dFZpc2libGUgPSB2aXNpYmxlO1xuXHRcdC8vIFJlLWFwcGxpZWQgaW4gYGNyZWF0ZUlucHV0YCBzbyBhIHJlYnVpbHQgaW5wdXQgcGFydCBrZWVwcyB0aGUgY29ycmVjdCB2aXNpYmlsaXR5LlxuXHRcdHRoaXMuX2FwcGx5SW5wdXRWaXNpYmlsaXR5KCk7XG5cdFx0aWYgKGNoYW5nZWQgJiYgdGhpcy5ib2R5RGltZW5zaW9uKSB7XG5cdFx0XHR0aGlzLl9sYXlvdXRMaXN0Rm9ySW5wdXRIZWlnaHQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUlucHV0VmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dEVsZW1lbnQgPSB0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWU/LmVsZW1lbnQ7XG5cdFx0aWYgKGlucHV0RWxlbWVudCkge1xuXHRcdFx0aW5wdXRFbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtaW5wdXQtaGlkZGVuJywgIXRoaXMuX2lucHV0VmlzaWJsZSk7XG5cdFx0XHRpbnB1dEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0fVxuXG5cdHNldFZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHdhc1Zpc2libGUgPSB0aGlzLl92aXNpYmxlO1xuXHRcdHRoaXMuX3Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMudmlzaWJsZUNoYW5nZUNvdW50Kys7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnNldFZpc2libGUodmlzaWJsZSk7XG5cdFx0dGhpcy5pbnB1dC5zZXRWaXNpYmxlKHZpc2libGUpO1xuXG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdGlmICghd2FzVmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlUaW1lb3V0RGlzcG9zYWJsZS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBQcm9ncmVzc2l2ZSByZW5kZXJpbmcgcGF1c2VkIHdoaWxlIGhpZGRlbiwgc28gc3RhcnQgaXQgdXAgYWdhaW4uXG5cdFx0XHRcdFx0Ly8gRG8gaXQgYWZ0ZXIgYSB0aW1lb3V0IGJlY2F1c2UgdGhlIGNvbnRhaW5lciBpcyBub3QgdmlzaWJsZSB5ZXQgKGl0IHNob3VsZCBiZSBidXQgb2Zmc2V0SGVpZ2h0IHJldHVybnMgMCBoZXJlKVxuXHRcdFx0XHRcdGlmICh0aGlzLl92aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm9uRGlkQ2hhbmdlSXRlbXModHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAwKTtcblxuXHRcdFx0XHR0aGlzLnZpc2liaWxpdHlBbmltYXRpb25GcmFtZURpc3Bvc2FibGUudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KHRoaXMubGlzdENvbnRhaW5lciksICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZFNob3cuZmlyZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHdhc1Zpc2libGUpIHtcblx0XHRcdHRoaXMuX29uRGlkSGlkZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVMaXN0KGxpc3RDb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zKTogdm9pZCB7XG5cdFx0Ly8gQ3JlYXRlIGEgZG9tIGVsZW1lbnQgdG8gaG9sZCBVSSBmcm9tIGVkaXRvciB3aWRnZXRzIGVtYmVkZGVkIGluIGNoYXQgbWVzc2FnZXNcblx0XHRjb25zdCBvdmVyZmxvd1dpZGdldHNDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRvdmVyZmxvd1dpZGdldHNDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC1vdmVyZmxvdy13aWRnZXQtY29udGFpbmVyJywgJ21vbmFjby1lZGl0b3InKTtcblx0XHRsaXN0Q29udGFpbmVyLmFwcGVuZChvdmVyZmxvd1dpZGdldHNDb250YWluZXIpO1xuXG5cdFx0Ly8gQ3JlYXRlIGNoYXQgbGlzdCB3aWRnZXRcblx0XHR0aGlzLmxpc3RXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdExpc3RXaWRnZXQsXG5cdFx0XHRsaXN0Q29udGFpbmVyLFxuXHRcdFx0e1xuXHRcdFx0XHRyZW5kZXJlck9wdGlvbnM6IG9wdGlvbnMsXG5cdFx0XHRcdGRlZmF1bHRFbGVtZW50SGVpZ2h0OiB0aGlzLnZpZXdPcHRpb25zLmRlZmF1bHRFbGVtZW50SGVpZ2h0ID8/IDIwMCxcblx0XHRcdFx0b3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogb3ZlcmZsb3dXaWRnZXRzQ29udGFpbmVyLFxuXHRcdFx0XHRzdHlsZXM6IHtcblx0XHRcdFx0XHRsaXN0Rm9yZWdyb3VuZDogdGhpcy5zdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHRoaXMuc3R5bGVzLmxpc3RCYWNrZ3JvdW5kLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXJyZW50Q2hhdE1vZGU6ICgpID0+IHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kLFxuXHRcdFx0XHRmaWx0ZXI6IHRoaXMudmlld09wdGlvbnMuZmlsdGVyID8geyBmaWx0ZXI6IHRoaXMudmlld09wdGlvbnMuZmlsdGVyLmJpbmQodGhpcy52aWV3T3B0aW9ucykgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dmlld01vZGVsOiB0aGlzLnZpZXdNb2RlbCxcblx0XHRcdFx0ZWRpdG9yT3B0aW9uczogdGhpcy5lZGl0b3JPcHRpb25zLFxuXHRcdFx0XHRsb2NhdGlvbjogdGhpcy5sb2NhdGlvbixcblx0XHRcdFx0Z2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zOiAoKSA9PiB0aGlzLmdldFNlbGVjdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucygpLFxuXHRcdFx0XHRnZXRDdXJyZW50TW9kZUluZm86ICgpID0+IHRoaXMuaW5wdXQuY3VycmVudE1vZGVJbmZvLFxuXHRcdFx0fVxuXHRcdCkpO1xuXG5cdFx0Ly8gV2lyZSB1cCBDaGF0V2lkZ2V0LXNwZWNpZmljIGxpc3Qgd2lkZ2V0IGV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZENsaWNrUmVxdWVzdChhc3luYyBpdGVtID0+IHtcblx0XHRcdHRoaXMuY2xpY2tlZFJlcXVlc3QoaXRlbSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0V2lkZ2V0Lm9uRGlkUmVyZW5kZXIoaXRlbSA9PiB7XG5cdFx0XHRpZiAoaXNSZXF1ZXN0Vk0oaXRlbS5jdXJyZW50RWxlbWVudCkgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LmVkaXRSZXF1ZXN0cycpICE9PSAnaW5wdXQnKSB7XG5cdFx0XHRcdGlmICghaXRlbS5yb3dDb250YWluZXIuY29udGFpbnModGhpcy5pbnB1dENvbnRhaW5lcikpIHtcblx0XHRcdFx0XHRpdGVtLnJlcXVlc3RUaW1lc3RhbXBDb250YWluZXIuYmVmb3JlKHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuaW5wdXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3RXaWRnZXQub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuZm9jdXNlZElucHV0RE9NLmFwcGVuZENoaWxkKHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0dGhpcy5pbnB1dC5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZEZvY3VzT3V0c2lkZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmZpbmlzaGVkRWRpdGluZygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZENsaWNrRm9sbG93dXAoaXRlbSA9PiB7XG5cdFx0XHQvLyBpcyB0aGlzIHVzZWQgYW55bW9yZT9cblx0XHRcdHRoaXMuYWNjZXB0SW5wdXQoaXRlbS5tZXNzYWdlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3RXaWRnZXQub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudEhlaWdodC5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0V2lkZ2V0Lm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlzdFdpZGdldC5vbkRpZFNjcm9sbCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFNjcm9sbC5maXJlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0c3RhcnRFZGl0aW5nKHJlcXVlc3RJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlYWRPbmx5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdGVkUmVxdWVzdCA9IHRoaXMubGlzdFdpZGdldC5nZXRUZW1wbGF0ZURhdGFGb3JSZXF1ZXN0SWQocmVxdWVzdElkKTtcblx0XHRpZiAoZWRpdGVkUmVxdWVzdCkge1xuXHRcdFx0dGhpcy5jbGlja2VkUmVxdWVzdChlZGl0ZWRSZXF1ZXN0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsaWNrZWRSZXF1ZXN0KGl0ZW06IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSkge1xuXG5cdFx0Y29uc3QgY3VycmVudEVsZW1lbnQgPSBpdGVtLmN1cnJlbnRFbGVtZW50O1xuXHRcdGlmIChpc1JlcXVlc3RWTShjdXJyZW50RWxlbWVudCkgJiYgIXRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cblx0XHRcdGNvbnN0IHJlcXVlc3RzID0gdGhpcy52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0XHRpZiAoIXJlcXVlc3RzIHx8ICF0aGlzLnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gdGhpcyB3aWxsIG9ubHkgZXZlciBiZSB0cnVlIGlmIHdlIHJlc3RvcmVkIGEgY2hlY2twb2ludFxuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsPy5tb2RlbC5jaGVja3BvaW50KSB7XG5cdFx0XHRcdHRoaXMucmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXdNb2RlbD8ubW9kZWwuc2V0Q2hlY2twb2ludChjdXJyZW50RWxlbWVudC5pZCk7XG5cblx0XHRcdC8vIHNldCBjb250ZXh0cyBhbmQgcmVxdWVzdCB0byBmYWxzZVxuXHRcdFx0Y29uc3QgY3VycmVudENvbnRleHQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdFx0Y29uc3QgYWRkZWRDb250ZXh0SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRjb25zdCBhZGRUb0NvbnRleHQgPSAoZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpID0+IHtcblx0XHRcdFx0Y29uc3QgZGVkdXBLZXkgPSBlbnRyeS5yYW5nZSA/IGAke2VudHJ5LmlkfToke2VudHJ5LnJhbmdlLnN0YXJ0fS0ke2VudHJ5LnJhbmdlLmVuZEV4Y2x1c2l2ZX1gIDogZW50cnkuaWQ7XG5cdFx0XHRcdGlmIChhZGRlZENvbnRleHRJZHMuaGFzKGRlZHVwS2V5KSB8fCBpc1dvcmtzcGFjZVZhcmlhYmxlRW50cnkoZW50cnkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICgoaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeShlbnRyeSkgfHwgaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeShlbnRyeSkpICYmIGVudHJ5LmF1dG9tYXRpY2FsbHlBZGRlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhZGRlZENvbnRleHRJZHMuYWRkKGRlZHVwS2V5KTtcblx0XHRcdFx0Y3VycmVudENvbnRleHQucHVzaChlbnRyeSk7XG5cdFx0XHR9O1xuXHRcdFx0Zm9yIChsZXQgaSA9IHJlcXVlc3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaSAtPSAxKSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3QgPSByZXF1ZXN0c1tpXTtcblx0XHRcdFx0aWYgKHJlcXVlc3QuaWQgPT09IGN1cnJlbnRFbGVtZW50LmlkKSB7XG5cdFx0XHRcdFx0cmVxdWVzdC5zZXRTaG91bGRCZUJsb2NrZWQoZmFsc2UpOyAvLyB1bmJsb2NraW5nIGp1c3QgdGhpcyByZXF1ZXN0LlxuXHRcdFx0XHRcdHJlcXVlc3QuYXR0YWNoZWRDb250ZXh0Py5mb3JFYWNoKGFkZFRvQ29udGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGN1cnJlbnRFbGVtZW50LnZhcmlhYmxlcy5mb3JFYWNoKGFkZFRvQ29udGV4dCk7XG5cblx0XHRcdC8vIHNldCBzdGF0ZXNcblx0XHRcdHRoaXMudmlld01vZGVsPy5zZXRFZGl0aW5nKGN1cnJlbnRFbGVtZW50KTtcblx0XHRcdGlmIChpdGVtPy5jb250ZXh0S2V5U2VydmljZSkge1xuXHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5iaW5kVG8oaXRlbS5jb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpc0VkaXRpbmdTZW50UmVxdWVzdCA9IGN1cnJlbnRFbGVtZW50LnBlbmRpbmdLaW5kID09PSB1bmRlZmluZWRcblx0XHRcdFx0PyBDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlNlbnRcblx0XHRcdFx0OiBjdXJyZW50RWxlbWVudC5wZW5kaW5nS2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkXG5cdFx0XHRcdFx0PyBDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlF1ZXVlXG5cdFx0XHRcdFx0OiBDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlLlN0ZWVyO1xuXHRcdFx0Y29uc3QgaXNJbnB1dCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSA9PT0gJ2lucHV0Jztcblx0XHRcdHRoaXMuaW5wdXRQYXJ0Py5zZXRFZGl0aW5nKCEhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcgJiYgaXNJbnB1dCwgaXNFZGl0aW5nU2VudFJlcXVlc3QpO1xuXG5cdFx0XHRpZiAoIWlzSW5wdXQpIHtcblx0XHRcdFx0dGhpcy5pbnB1dENvbnRhaW5lciA9IGRvbS4kKCcuY2hhdC1lZGl0LWlucHV0LWNvbnRhaW5lcicpO1xuXHRcdFx0XHRpdGVtLnJlcXVlc3RUaW1lc3RhbXBDb250YWluZXIuYmVmb3JlKHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLmNyZWF0ZUlucHV0KHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLmlucHV0LnNldENoYXRNb2RlKHRoaXMuaW5wdXRQYXJ0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkKTtcblx0XHRcdFx0dGhpcy5pbnB1dC5zZXRQZXJtaXNzaW9uTGV2ZWwodGhpcy5pbnB1dFBhcnQuY3VycmVudE1vZGVJbmZvLnBlcm1pc3Npb25MZXZlbCA/PyBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRcdFx0XHR0aGlzLmlucHV0LnNldEVkaXRpbmcodHJ1ZSwgaXNFZGl0aW5nU2VudFJlcXVlc3QpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUlucHV0RWRpdG9yLmZpcmUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXJ0LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnZWRpdGluZycpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRFbGVtZW50Lm1vZGVsSWQpIHtcblx0XHRcdFx0dm9pZCB0aGlzLmlucHV0LnJlcXVlc3RNb2RlbEJ5SWRlbnRpZmllcihjdXJyZW50RWxlbWVudC5tb2RlbElkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5pbnB1dFBhcnQudG9nZ2xlQ2hhdElucHV0T3ZlcmxheSghaXNJbnB1dCk7XG5cdFx0XHRpZiAoY3VycmVudENvbnRleHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmlucHV0LmF0dGFjaG1lbnRNb2RlbC5hZGRDb250ZXh0KC4uLmN1cnJlbnRDb250ZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVyZW5kZXJzXG5cdFx0XHR0aGlzLmlucHV0UGFydC5kbmQuc2V0RGlzYWJsZWRPdmVybGF5KCFpc0lucHV0KTtcblx0XHRcdHRoaXMuaW5wdXQucmVuZGVyQXR0YWNoZWRDb250ZXh0KCk7XG5cdFx0XHR0aGlzLmlucHV0LnNldFZhbHVlKGN1cnJlbnRFbGVtZW50Lm1lc3NhZ2VUZXh0LCBmYWxzZSk7XG5cblx0XHRcdC8vIHJlc3RvcmUgZHluYW1pYyB2YXJpYWJsZXMgaW4gdGhlIG1vZGVsIHNvIGRlY29yYXRpb25zIGFuZCBwYXJzaW5nIHdvcmtcblx0XHRcdGNvbnN0IGR5bmFtaWNWYXJpYWJsZU1vZGVsID0gdGhpcy5nZXRDb250cmliPENoYXREeW5hbWljVmFyaWFibGVNb2RlbD4oQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLklEKTtcblx0XHRcdGNvbnN0IGVkaXRvck1vZGVsID0gdGhpcy5pbnB1dC5pbnB1dEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKGR5bmFtaWNWYXJpYWJsZU1vZGVsICYmIGVkaXRvck1vZGVsKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsVGV4dExlbmd0aCA9IGVkaXRvck1vZGVsLmdldFZhbHVlTGVuZ3RoKCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgY3VycmVudENvbnRleHQpIHtcblx0XHRcdFx0XHRpZiAoZW50cnkucmFuZ2UpIHtcblx0XHRcdFx0XHRcdGlmIChlbnRyeS5yYW5nZS5zdGFydCA+PSBlbnRyeS5yYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChlbnRyeS5yYW5nZS5zdGFydCA8IDAgfHwgZW50cnkucmFuZ2UuZW5kRXhjbHVzaXZlID4gbW9kZWxUZXh0TGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBzdGFydFBvcyA9IGVkaXRvck1vZGVsLmdldFBvc2l0aW9uQXQoZW50cnkucmFuZ2Uuc3RhcnQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZW5kUG9zID0gZWRpdG9yTW9kZWwuZ2V0UG9zaXRpb25BdChlbnRyeS5yYW5nZS5lbmRFeGNsdXNpdmUpO1xuXHRcdFx0XHRcdFx0ZHluYW1pY1ZhcmlhYmxlTW9kZWwuYWRkUmVmZXJlbmNlKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGVudHJ5LmlkLFxuXHRcdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHN0YXJ0UG9zLmxpbmVOdW1iZXIsIHN0YXJ0UG9zLmNvbHVtbiwgZW5kUG9zLmxpbmVOdW1iZXIsIGVuZFBvcy5jb2x1bW4pLFxuXHRcdFx0XHRcdFx0XHRkYXRhOiBlbnRyeS52YWx1ZSxcblx0XHRcdFx0XHRcdFx0ZnVsbE5hbWU6IGVudHJ5LmZ1bGxOYW1lLFxuXHRcdFx0XHRcdFx0XHRpY29uOiBlbnRyeS5pY29uLFxuXHRcdFx0XHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBlbnRyeS5tb2RlbERlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRpc0ZpbGU6IGVudHJ5LmtpbmQgPT09ICdmaWxlJyxcblx0XHRcdFx0XHRcdFx0aXNEaXJlY3Rvcnk6IGVudHJ5LmtpbmQgPT09ICdkaXJlY3RvcnknLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VkaXRpbmdBdXRvU2Nyb2xsSG9sZC52YWx1ZSA9IHRoaXMubGlzdFdpZGdldC5hY3F1aXJlQXV0b1Njcm9sbEhvbGQoKTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VJdGVtcygpO1xuXHRcdFx0dGhpcy5pbnB1dC5pbnB1dEVkaXRvci5mb2N1cygpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0UGFydC5vbkRpZENsaWNrT3ZlcmxheSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgIT09ICdpbnB1dCcpIHtcblx0XHRcdFx0XHR0aGlzLmZpbmlzaGVkRWRpdGluZygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIGxpc3RlbmVyc1xuXHRcdFx0aWYgKCFpc0lucHV0KSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5saW5lSW5wdXRQYXJ0LmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9DdXJyZW50SXRlbShjdXJyZW50RWxlbWVudCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlubGluZUlucHV0UGFydC5pbnB1dEVkaXRvci5vbkRpZENoYW5nZUN1cnNvclNlbGVjdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRcdHRoaXMubGlzdFdpZGdldC5zY3JvbGxUb0N1cnJlbnRJdGVtKGN1cnJlbnRFbGVtZW50KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHR5cGUgU3RhcnRSZXF1ZXN0RXZlbnQgPSB7IGVkaXRSZXF1ZXN0VHlwZTogc3RyaW5nIH07XG5cblx0XHR0eXBlIFN0YXJ0UmVxdWVzdEV2ZW50Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2p1c3RzY2hlbic7XG5cdFx0XHRjb21tZW50OiAnRXZlbnQgdXNlZCB0byBnYWluIGluc2lnaHRzIGludG8gd2hlbiBlZGl0cyBhcmUgYmVpbmcgcHJlc3NlZC4nO1xuXHRcdFx0ZWRpdFJlcXVlc3RUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQ3VycmVudCBlbnRyeSBwb2ludCBmb3IgZWRpdGluZyBhIHJlcXVlc3QuJyB9O1xuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTdGFydFJlcXVlc3RFdmVudCwgU3RhcnRSZXF1ZXN0RXZlbnRDbGFzc2lmaWNhdGlvbj4oJ2NoYXQuc3RhcnRFZGl0aW5nUmVxdWVzdHMnLCB7XG5cdFx0XHRlZGl0UmVxdWVzdFR5cGU6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSxcblx0XHR9KTtcblx0fVxuXG5cdGZpbmlzaGVkRWRpdGluZyhjb21wbGV0ZWRFZGl0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIHJlc2V0IHN0YXRlc1xuXHRcdHRoaXMuX2VkaXRpbmdBdXRvU2Nyb2xsSG9sZC5jbGVhcigpO1xuXHRcdGNvbnN0IGVkaXRlZFJlcXVlc3QgPSB0aGlzLmxpc3RXaWRnZXQuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKHRoaXMudmlld01vZGVsPy5lZGl0aW5nPy5pZCk7XG5cdFx0aWYgKHRoaXMucmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQpIHtcblx0XHRcdHRoaXMucmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQgPSBmYWxzZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52aWV3TW9kZWw/Lm1vZGVsLnNldENoZWNrcG9pbnQodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dFBhcnQuZG5kLnNldERpc2FibGVkT3ZlcmxheShmYWxzZSk7XG5cdFx0aWYgKGVkaXRlZFJlcXVlc3Q/LmNvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5iaW5kVG8oZWRpdGVkUmVxdWVzdC5jb250ZXh0S2V5U2VydmljZSkuc2V0KGZhbHNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0lucHV0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LmVkaXRSZXF1ZXN0cycpID09PSAnaW5wdXQnO1xuXG5cdFx0aWYgKCFpc0lucHV0KSB7XG5cdFx0XHR0aGlzLmlucHV0UGFydC5zZXRDaGF0TW9kZSh0aGlzLmlucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkKTtcblx0XHRcdHRoaXMuaW5wdXRQYXJ0LnNldFBlcm1pc3Npb25MZXZlbCh0aGlzLmlucHV0LmN1cnJlbnRNb2RlSW5mby5wZXJtaXNzaW9uTGV2ZWwgPz8gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0XHRcdGNvbnN0IGVkaXRNb2RlbElkID0gdGhpcy5pbnB1dC5jdXJyZW50TGFuZ3VhZ2VNb2RlbDtcblx0XHRcdGlmIChlZGl0TW9kZWxJZCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuaW5wdXRQYXJ0LnJlcXVlc3RNb2RlbEJ5SWRlbnRpZmllcihlZGl0TW9kZWxJZCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaW5wdXRQYXJ0Py50b2dnbGVDaGF0SW5wdXRPdmVybGF5KGZhbHNlKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChlZGl0ZWRSZXF1ZXN0Py5yb3dDb250YWluZXI/LmNvbnRhaW5zKHRoaXMuaW5wdXRDb250YWluZXIpKSB7XG5cdFx0XHRcdFx0ZWRpdGVkUmVxdWVzdC5yb3dDb250YWluZXIucmVtb3ZlQ2hpbGQodGhpcy5pbnB1dENvbnRhaW5lcik7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5pbnB1dENvbnRhaW5lci5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5pbnB1dENvbnRhaW5lci5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKHRoaXMuaW5wdXRDb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRXJyb3Igb2NjdXJyZWQgd2hpbGUgZmluaXNoaW5nIGVkaXRpbmc6JywgZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmlucHV0Q29udGFpbmVyID0gZG9tLiQoJy5lbXB0eS1jaGF0LXN0YXRlJyk7XG5cblx0XHRcdC8vIG9ubHkgZGlzcG9zZSBpZiB3ZSBrbm93IHRoZSBpbnB1dCBpcyBub3QgdGhlIGJvdHRvbSBpbnB1dCBvYmplY3QuXG5cdFx0XHR0aGlzLmlucHV0LmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpZiAoaXNJbnB1dCkge1xuXHRcdFx0dGhpcy5pbnB1dFBhcnQuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdlZGl0aW5nJyk7XG5cdFx0fVxuXHRcdHRoaXMudmlld01vZGVsPy5zZXRFZGl0aW5nKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5pbnB1dFBhcnQ/LnNldEVkaXRpbmcoZmFsc2UsIHVuZGVmaW5lZCk7XG5cblx0XHRpZiAoIWlzSW5wdXQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IuZmlyZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMub25EaWRDaGFuZ2VJdGVtcygpO1xuXG5cdFx0dHlwZSBDYW5jZWxSZXF1ZXN0RWRpdEV2ZW50ID0ge1xuXHRcdFx0ZWRpdFJlcXVlc3RUeXBlOiBzdHJpbmc7XG5cdFx0XHRlZGl0Q2FuY2VsZWQ6IGJvb2xlYW47XG5cdFx0fTtcblxuXHRcdHR5cGUgQ2FuY2VsUmVxdWVzdEV2ZW50RWRpdENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdqdXN0c2NoZW4nO1xuXHRcdFx0ZWRpdFJlcXVlc3RUeXBlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnQ3VycmVudCBlbnRyeSBwb2ludCBmb3IgZWRpdGluZyBhIHJlcXVlc3QuJyB9O1xuXHRcdFx0ZWRpdENhbmNlbGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnSW5kaWNhdGVzIHdoZXRoZXIgdGhlIGVkaXQgd2FzIGNhbmNlbGVkLicgfTtcblx0XHRcdGNvbW1lbnQ6ICdFdmVudCB1c2VkIHRvIGdhaW4gaW5zaWdodHMgaW50byB3aGVuIGVkaXRzIGFyZSBiZWluZyBjYW5jZWxlZC4nO1xuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDYW5jZWxSZXF1ZXN0RWRpdEV2ZW50LCBDYW5jZWxSZXF1ZXN0RXZlbnRFZGl0Q2xhc3NpZmljYXRpb24+KCdjaGF0LmVkaXRSZXF1ZXN0c0ZpbmlzaGVkJywge1xuXHRcdFx0ZWRpdFJlcXVlc3RUeXBlOiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJyksXG5cdFx0XHRlZGl0Q2FuY2VsZWQ6ICFjb21wbGV0ZWRFZGl0XG5cdFx0fSk7XG5cblx0XHR0aGlzLmlucHV0UGFydC5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXaWRnZXRWaWV3S2luZFRhZygpOiBzdHJpbmcge1xuXHRcdGlmICghdGhpcy52aWV3Q29udGV4dCkge1xuXHRcdFx0cmV0dXJuICdlZGl0b3InO1xuXHRcdH0gZWxzZSBpZiAoaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCh0aGlzLnZpZXdDb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuICd2aWV3Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuICdxdWljayc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVJbnB1dChjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zPzogeyByZW5kZXJGb2xsb3d1cHM6IGJvb2xlYW47IHJlbmRlclN0eWxlPzogJ2NvbXBhY3QnIHwgJ21pbmltYWwnOyByZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0PzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3QgY29tbW9uQ29uZmlnOiBJQ2hhdElucHV0UGFydE9wdGlvbnMgPSB7XG5cdFx0XHRyZW5kZXJGb2xsb3d1cHM6IG9wdGlvbnM/LnJlbmRlckZvbGxvd3VwcyA/PyB0cnVlLFxuXHRcdFx0cmVuZGVyU3R5bGU6IG9wdGlvbnM/LnJlbmRlclN0eWxlID09PSAnbWluaW1hbCcgPyAnY29tcGFjdCcgOiBvcHRpb25zPy5yZW5kZXJTdHlsZSxcblx0XHRcdHJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQ6IG9wdGlvbnM/LnJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQgPz8gZmFsc2UsXG5cdFx0XHRtZW51czoge1xuXHRcdFx0XHRleGVjdXRlVG9vbGJhcjogTWVudUlkLkNoYXRFeGVjdXRlLFxuXHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdjaGF0V2lkZ2V0Jyxcblx0XHRcdFx0Li4udGhpcy52aWV3T3B0aW9ucy5tZW51c1xuXHRcdFx0fSxcblx0XHRcdGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IHRoaXMudmlld09wdGlvbnMuZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSxcblx0XHRcdGVuYWJsZUltcGxpY2l0Q29udGV4dDogdGhpcy52aWV3T3B0aW9ucy5lbmFibGVJbXBsaWNpdENvbnRleHQsXG5cdFx0XHRyZW5kZXJXb3JraW5nU2V0OiB0aGlzLnZpZXdPcHRpb25zLmVuYWJsZVdvcmtpbmdTZXQgPT09ICdleHBsaWNpdCcsXG5cdFx0XHRzdXBwb3J0c0NoYW5naW5nTW9kZXM6IHRoaXMudmlld09wdGlvbnMuc3VwcG9ydHNDaGFuZ2luZ01vZGVzLFxuXHRcdFx0ZG5kQ29udGFpbmVyOiB0aGlzLnZpZXdPcHRpb25zLmRuZENvbnRhaW5lcixcblx0XHRcdGlucHV0RWRpdG9yTWluTGluZXM6IHRoaXMudmlld09wdGlvbnMuaW5wdXRFZGl0b3JNaW5MaW5lcyxcblx0XHRcdHdpZGdldFZpZXdLaW5kVGFnOiB0aGlzLmdldFdpZGdldFZpZXdLaW5kVGFnKCksXG5cdFx0XHRkZWZhdWx0TW9kZTogdGhpcy52aWV3T3B0aW9ucy5kZWZhdWx0TW9kZSxcblx0XHRcdHNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU6IHRoaXMudmlld09wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZSxcblx0XHRcdHdvcmtzcGFjZVBpY2tlckRlbGVnYXRlOiB0aGlzLnZpZXdPcHRpb25zLndvcmtzcGFjZVBpY2tlckRlbGVnYXRlLFxuXHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogdGhpcy52aWV3T3B0aW9ucy5pc1Nlc3Npb25zV2luZG93LFxuXHRcdFx0b25EaWRDaGFuZ2VJbnB1dE9uYm9hcmRpbmdWaXNpYmxlOiB2aXNpYmxlID0+IHRoaXMuc2V0SW5wdXRPbmJvYXJkaW5nVmlzaWJsZSh2aXNpYmxlKSxcblx0XHR9O1xuXG5cdFx0aWYgKHRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHRjb25zdCBlZGl0ZWRSZXF1ZXN0ID0gdGhpcy5saXN0V2lkZ2V0LmdldFRlbXBsYXRlRGF0YUZvclJlcXVlc3RJZCh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZz8uaWQpO1xuXHRcdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBlZGl0ZWRSZXF1ZXN0Py5jb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0XHR0aGlzLmlubGluZUlucHV0UGFydERpc3Bvc2FibGUudmFsdWUgPSBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRQYXJ0LFxuXHRcdFx0XHR0aGlzLmxvY2F0aW9uLFxuXHRcdFx0XHRjb21tb25Db25maWcsXG5cdFx0XHRcdHRoaXMuc3R5bGVzLFxuXHRcdFx0XHR0cnVlXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmlucHV0UGFydERpc3Bvc2FibGUudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dFBhcnQsXG5cdFx0XHRcdHRoaXMubG9jYXRpb24sXG5cdFx0XHRcdGNvbW1vbkNvbmZpZyxcblx0XHRcdFx0dGhpcy5zdHlsZXMsXG5cdFx0XHRcdGZhbHNlXG5cdFx0XHQpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHR0aGlzLmlucHV0UGFydC5oZWlnaHQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXRoaXMubGlzdFdpZGdldCkge1xuXHRcdFx0XHRcdC8vIFRoaXMgaXMgc2V0IHVwIGJlZm9yZSB0aGUgbGlzdC9yZW5kZXJlciBhcmUgY3JlYXRlZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0aGlzLmJvZHlEaW1lbnNpb24pIHtcblx0XHRcdFx0XHQvLyBPbmx5IHJlLWxheW91dCB0aGUgbGlzdC9jb250YWluZXJzIHRvIG1hdGNoIHRoZSBuZXcgaW5wdXRcblx0XHRcdFx0XHQvLyBoZWlnaHQuIERvIE5PVCByZS1jYWxsIHRoaXMubGF5b3V0KCkgaGVyZTogdGhlIGlucHV0IHBhcnRcblx0XHRcdFx0XHQvLyBoYXMgYWxyZWFkeSBsYWlkIGl0c2VsZiBvdXQgYW5kIHJlLWVudGVyaW5nIGlucHV0UGFydC5sYXlvdXRcblx0XHRcdFx0XHQvLyBjcmVhdGVzIGEgbGF5b3V0IGxvb3Agd2hlbiB0aGUgdmlld1BhbmUgYWxzbyByZWFjdHMuXG5cdFx0XHRcdFx0dGhpcy5fbGF5b3V0TGlzdEZvcklucHV0SGVpZ2h0KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQuZmlyZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXQucmVuZGVyKGNvbnRhaW5lciwgJycsIHRoaXMpO1xuXHRcdC8vIEtlZXAgcmVhZC1vbmx5IGNoYXRzJyBjb21wb3NlciBoaWRkZW4gaWYgdGhlIGlucHV0IHBhcnQgd2FzIHJlYnVpbHQuXG5cdFx0dGhpcy5fYXBwbHlJbnB1dFZpc2liaWxpdHkoKTtcblx0XHRpZiAodGhpcy5ib2R5RGltZW5zaW9uPy53aWR0aCkge1xuXHRcdFx0dGhpcy5pbnB1dC5sYXlvdXQodGhpcy5ib2R5RGltZW5zaW9uLndpZHRoKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0Lm9uRGlkTG9hZElucHV0U3RhdGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWZyZXNoUGFyc2VkSW5wdXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dC5vbkRpZEZvY3VzKCgpID0+IHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dC5vbkRpZEFjY2VwdEZvbGxvd3VwKGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBtc2cgPSAnJztcblx0XHRcdGlmIChlLmZvbGxvd3VwLmFnZW50SWQgJiYgZS5mb2xsb3d1cC5hZ2VudElkICE9PSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KHRoaXMubG9jYXRpb24sIHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kKT8uaWQpIHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQoZS5mb2xsb3d1cC5hZ2VudElkKTtcblx0XHRcdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMubGFzdFNlbGVjdGVkQWdlbnQgPSBhZ2VudDtcblx0XHRcdFx0bXNnID0gYCR7Y2hhdEFnZW50TGVhZGVyfSR7YWdlbnQubmFtZX0gYDtcblx0XHRcdFx0aWYgKGUuZm9sbG93dXAuc3ViQ29tbWFuZCkge1xuXHRcdFx0XHRcdG1zZyArPSBgJHtjaGF0U3ViY29tbWFuZExlYWRlcn0ke2UuZm9sbG93dXAuc3ViQ29tbWFuZH0gYDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghZS5mb2xsb3d1cC5hZ2VudElkICYmIGUuZm9sbG93dXAuc3ViQ29tbWFuZCAmJiB0aGlzLmNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLmhhc0NvbW1hbmQoZS5mb2xsb3d1cC5zdWJDb21tYW5kLCBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlKSkpIHtcblx0XHRcdFx0bXNnID0gYCR7Y2hhdFN1YmNvbW1hbmRMZWFkZXJ9JHtlLmZvbGxvd3VwLnN1YkNvbW1hbmR9IGA7XG5cdFx0XHR9XG5cblx0XHRcdG1zZyArPSBlLmZvbGxvd3VwLm1lc3NhZ2U7XG5cdFx0XHR0aGlzLmFjY2VwdElucHV0KG1zZyk7XG5cblx0XHRcdGlmICghZS5yZXNwb25zZSkge1xuXHRcdFx0XHQvLyBGb2xsb3d1cHMgY2FuIGJlIHNob3duIGJ5IHRoZSB3ZWxjb21lIG1lc3NhZ2UsIHRoZW4gdGhlcmUgaXMgbm8gcmVzcG9uc2UgYXNzb2NpYXRlZC5cblx0XHRcdFx0Ly8gQXQgc29tZSBwb2ludCB3ZSBwcm9iYWJseSB3YW50IHRlbGVtZXRyeSBmb3IgdGhlc2UgdG9vLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY2hhdFNlcnZpY2Uubm90aWZ5VXNlckFjdGlvbih7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IGUucmVzcG9uc2UucmVxdWVzdElkLFxuXHRcdFx0XHRhZ2VudElkOiBlLnJlc3BvbnNlLmFnZW50Py5pZCxcblx0XHRcdFx0Y29tbWFuZDogZS5yZXNwb25zZS5zbGFzaENvbW1hbmQ/Lm5hbWUsXG5cdFx0XHRcdHJlc3VsdDogZS5yZXNwb25zZS5yZXN1bHQsXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdGtpbmQ6ICdmb2xsb3dVcCcsXG5cdFx0XHRcdFx0Zm9sbG93dXA6IGUuZm9sbG93dXBcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0RWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdHRoaXMucGFyc2VkQ2hhdFJlcXVlc3QgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZUNoYXRJbnB1dENvbnRleHQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0QWdlbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlQWdlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMucGFyc2VkQ2hhdFJlcXVlc3QgPSB1bmRlZmluZWQ7XG5cdFx0XHQvLyBUb29scyBhZ2VudCBsb2FkcyAtPiB3ZWxjb21lIGNvbnRlbnQgY2hhbmdlc1xuXHRcdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlucHV0Lm9uRGlkQ2hhbmdlQ3VycmVudENoYXRNb2RlKCgpID0+IHtcblx0XHRcdHRoaXMucmVuZGVyV2VsY29tZVZpZXdDb250ZW50SWZOZWVkZWQoKTtcblx0XHRcdHRoaXMucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0XHR0aGlzLnJlbmRlckZvbGxvd3VwcygpO1xuXHRcdFx0dGhpcy5yZW5kZXJDaGF0U3VnZ2VzdE5leHRXaWRnZXQoKTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZFNlc3Npb25Db3VudENvbnRleHRLZXlzID0gbmV3IFNldChbQ2hhdENvbnRleHRLZXlzLmZvcmVncm91bmRTZXNzaW9uQ291bnQua2V5XSk7XG5cdFx0Y29uc3QgaGFzQnlva01vZGVsc0NvbnRleHRLZXlzID0gbmV3IFNldChbQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuaGFzQnlva01vZGVscy5rZXldKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKGZvcmVncm91bmRTZXNzaW9uQ291bnRDb250ZXh0S2V5cykgJiYgdGhpcy5pc0VtcHR5KCkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJHZXR0aW5nU3RhcnRlZFRpcElmTmVlZGVkKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzU29tZShoYXNCeW9rTW9kZWxzQ29udGV4dEtleXMpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2hhdFZpZXdWaXNpYmlsaXR5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGxldCBwcmV2aW91c01vZGVsSWRlbnRpZmllcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsSWRlbnRpZmllciA9IHRoaXMuaW5wdXRQYXJ0LnNlbGVjdGVkTGFuZ3VhZ2VNb2RlbC5yZWFkKHJlYWRlcik/LmlkZW50aWZpZXI7XG5cdFx0XHRpZiAocHJldmlvdXNNb2RlbElkZW50aWZpZXIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwcmV2aW91c01vZGVsSWRlbnRpZmllciA9IG1vZGVsSWRlbnRpZmllcjtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldmlvdXNNb2RlbElkZW50aWZpZXIgPT09IG1vZGVsSWRlbnRpZmllcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHByZXZpb3VzTW9kZWxJZGVudGlmaWVyID0gbW9kZWxJZGVudGlmaWVyO1xuXHRcdFx0aWYgKCF0aGlzLl9nZXR0aW5nU3RhcnRlZFRpcFBhcnRSZWYpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmNoYXRUaXBTZXJ2aWNlLmdldFdlbGNvbWVUaXAodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHRvb2xTZXRJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IHRvb2xJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdGZvciAoY29uc3QgW2VudHJ5LCBlbmFibGVkXSBvZiB0aGlzLmlucHV0LnNlbGVjdGVkVG9vbHNNb2RlbC5lbnRyaWVzTWFwLnJlYWQocikpIHtcblx0XHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0XHRpZiAoaXNUb29sU2V0KGVudHJ5KSkge1xuXHRcdFx0XHRcdFx0dG9vbFNldElkcy5hZGQoZW50cnkuaWQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0b29sSWRzLmFkZChlbnRyeS5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkaXNhYmxlZFRvb2xzID0gdGhpcy5pbnB1dC5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHNcblx0XHRcdFx0LmZpbHRlcihhID0+IGEua2luZCA9PT0gJ3Rvb2wnICYmICF0b29sSWRzLmhhcyhhLmlkKSB8fCBhLmtpbmQgPT09ICd0b29sc2V0JyAmJiAhdG9vbFNldElkcy5oYXMoYS5pZCkpXG5cdFx0XHRcdC5tYXAoYSA9PiBhLmlkKTtcblxuXHRcdFx0dGhpcy5pbnB1dC5hdHRhY2htZW50TW9kZWwudXBkYXRlQ29udGV4dChkaXNhYmxlZFRvb2xzLCBJdGVyYWJsZS5lbXB0eSgpKTtcblx0XHRcdHRoaXMucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFN0eWxlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1pbnRlcmFjdGl2ZS1yZXN1bHQtZWRpdG9yLWJhY2tncm91bmQtY29sb3InLCB0aGlzLmVkaXRvck9wdGlvbnMuY29uZmlndXJhdGlvbi5yZXN1bHRFZGl0b3IuYmFja2dyb3VuZENvbG9yPy50b1N0cmluZygpID8/ICcnKTtcblx0XHR0aGlzLmNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtaW50ZXJhY3RpdmUtc2Vzc2lvbi1mb3JlZ3JvdW5kJywgdGhpcy5lZGl0b3JPcHRpb25zLmNvbmZpZ3VyYXRpb24uZm9yZWdyb3VuZD8udG9TdHJpbmcoKSA/PyAnJyk7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWNoYXQtbGlzdC1iYWNrZ3JvdW5kJywgdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKHRoaXMuc3R5bGVzLmxpc3RCYWNrZ3JvdW5kKT8udG9TdHJpbmcoKSA/PyAnJyk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgd2lkZ2V0J3MgY29sb3Igc3R5bGVzIGFmdGVyIGNvbnN0cnVjdGlvbi4gUHJvcGFnYXRlcyB0aGUgbmV3XG5cdCAqIGBsaXN0Rm9yZWdyb3VuZGAvYGxpc3RCYWNrZ3JvdW5kYCB0byB0aGUgbGlzdCB3aWRnZXQsIHB1c2hlcyB0aGUgbmV3IGNvbG9yXG5cdCAqIHRva2VucyBpbnRvIGBlZGl0b3JPcHRpb25zYCBzbyBzdWJzY3JpYmVycyAoY29kZSBibG9ja3MsIHJlc3VsdC9pbnB1dCBlZGl0b3Jcblx0ICogYmFja2dyb3VuZHMsIGNvbnRhaW5lciBDU1MgdmFyaWFibGVzKSBwaWNrIHRoZW0gdXAgdmlhIGBvbkRpZENoYW5nZWAsIGFuZFxuXHQgKiByZWZyZXNoZXMgdGhlIENTUyB2YXJpYWJsZXMgdGhlIGNoYXQgY29udGFpbmVyIGV4cG9zZXMgZm9yIHN0eWxlc2hlZXQgcnVsZXMuXG5cdCAqL1xuXHRzZXRTdHlsZXMoc3R5bGVzOiBJQ2hhdFdpZGdldFN0eWxlcyk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFN0eWxlcyA9IHRoaXMuc3R5bGVzO1xuXHRcdHRoaXMuc3R5bGVzID0gc3R5bGVzO1xuXG5cdFx0Ly8gdXBkYXRlIGxpc3QgaWYgbmVlZGVkXG5cdFx0Y29uc3QgbGlzdENvbG9yc0NoYW5nZWQgPVxuXHRcdFx0b2xkU3R5bGVzLmxpc3RCYWNrZ3JvdW5kICE9PSBzdHlsZXMubGlzdEJhY2tncm91bmQgfHxcblx0XHRcdG9sZFN0eWxlcy5saXN0Rm9yZWdyb3VuZCAhPT0gc3R5bGVzLmxpc3RGb3JlZ3JvdW5kO1xuXG5cdFx0aWYgKGxpc3RDb2xvcnNDaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQ/LnNldFN0eWxlcyh7XG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiBzdHlsZXMubGlzdEZvcmVncm91bmQsXG5cdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBzdHlsZXMubGlzdEJhY2tncm91bmQsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyB1cGRhdGUgZWRpdG9yIGNvbG9ycyBpZiBuZWVkZWRcblx0XHRjb25zdCBlZGl0b3JDb2xvcnNDaGFuZ2VkID1cblx0XHRcdG9sZFN0eWxlcy5saXN0Rm9yZWdyb3VuZCAhPT0gc3R5bGVzLmxpc3RGb3JlZ3JvdW5kIHx8XG5cdFx0XHRvbGRTdHlsZXMuaW5wdXRFZGl0b3JCYWNrZ3JvdW5kICE9PSBzdHlsZXMuaW5wdXRFZGl0b3JCYWNrZ3JvdW5kIHx8XG5cdFx0XHRvbGRTdHlsZXMucmVzdWx0RWRpdG9yQmFja2dyb3VuZCAhPT0gc3R5bGVzLnJlc3VsdEVkaXRvckJhY2tncm91bmQ7XG5cblx0XHRpZiAoZWRpdG9yQ29sb3JzQ2hhbmdlZCAmJiB0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0Ly8gVXBkYXRpbmcgZWRpdG9yT3B0aW9ucyBmaXJlcyBvbkRpZENoYW5nZSB3aGljaCB0cmlnZ2VycyBvbkRpZFN0eWxlQ2hhbmdlXG5cdFx0XHQvLyBhbmQgYWxzbyBwcm9wYWdhdGVzIHRoZSBuZXcgY29sb3JzIHRvIHN1YnNjcmliZXJzIGxpa2UgQ29kZUJsb2NrUGFydC5cblx0XHRcdHRoaXMuZWRpdG9yT3B0aW9ucy5zZXRDb2xvcnMoc3R5bGVzLmxpc3RGb3JlZ3JvdW5kLCBzdHlsZXMuaW5wdXRFZGl0b3JCYWNrZ3JvdW5kLCBzdHlsZXMucmVzdWx0RWRpdG9yQmFja2dyb3VuZCk7XG5cdFx0fVxuXHR9XG5cblxuXHRzZXRNb2RlbChtb2RlbDogSUNoYXRNb2RlbCB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb250YWluZXIgfHwgIXRoaXMuaW5wdXRQYXJ0KSB7XG5cdFx0XHQvLyBXaWRnZXQgaGFzbid0IGZpbmlzaGVkIHJlbmRlcmluZyB5ZXQ7IHNraXAgcmF0aGVyIHRoYW4gY3Jhc2ggYW5kXG5cdFx0XHQvLyBicmVhayB0aGUgc2Vzc2lvbiB2aWV3LiBDYWxsZXIgd2lsbCByZS1pbnZva2Ugb25jZSByZW5kZXJlZC5cblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdDaGF0V2lkZ2V0I3NldE1vZGVsIGNhbGxlZCBiZWZvcmUgcmVuZGVyKCkgY29tcGxldGVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudElucHV0TW9kZWwgPSB0aGlzLnZpZXdNb2RlbD8ubW9kZWw/LmlucHV0TW9kZWw/LnN0YXRlPy5nZXQoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMudmlld01vZGVsPy5tb2RlbD8uaW5wdXRNb2RlbCwgYENoYXRXaWRnZXQuc2V0TW9kZWwgdG8gZW1wdHksIG9sZCAke3RoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gLCB1bmRlZmluZWQsIGN1cnJlbnRJbnB1dE1vZGVsLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0Ly8gRmx1c2ggYW55IHVuc2VudCBkcmFmdCB0byB0aGUgb3V0Z29pbmcgaW5wdXQgbW9kZWwgYmVmb3JlIHdlIGRyb3Agb3VyXG5cdFx0XHQvLyByZWZlcmVuY2UgdG8gaXQsIHNvIHRoZSBob3N0J3MgYHdpbGxEaXNwb3NlTW9kZWxgIHBlcnNpc3RlbmNlIHNlZXMgaXQuXG5cdFx0XHR0aGlzLmlucHV0UGFydC5mbHVzaElucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdFx0dGhpcy5maW5pc2hlZEVkaXRpbmcoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuY2xlYXJHZXR0aW5nU3RhcnRlZFRpcCgpO1xuXHRcdFx0dGhpcy52aWV3TW9kZWwgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0JvcmRlcigpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUl0ZW1zKCk7XG5cdFx0XHR0aGlzLl9oYXNQZW5kaW5nUmVxdWVzdHNDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHRpZiAoIXRoaXMudmlld09wdGlvbnMuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0XHR0aGlzLnNldFJlYWRPbmx5KGZhbHNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNFcXVhbChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbChtb2RlbC5pbnB1dE1vZGVsLCBgQ2hhdFdpZGdldC5zZXRNb2RlbCBuZXcgJHttb2RlbC5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0sIG9sZCAke3RoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gLCBtb2RlbC5pbnB1dE1vZGVsLnN0YXRlLmdldCgpLCBjdXJyZW50SW5wdXRNb2RlbCwgdGhpcy5sb2dTZXJ2aWNlKTtcblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZykge1xuXHRcdFx0dGhpcy5maW5pc2hlZEVkaXRpbmcoKTtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dFBhcnQ/LmNsZWFyVG9kb0xpc3RXaWRnZXQobW9kZWwuc2Vzc2lvblJlc291cmNlLCBmYWxzZSk7XG5cdFx0dGhpcy5pbnB1dFBhcnQ/LmNsZWFyQXJ0aWZhY3RzV2lkZ2V0KCk7XG5cdFx0dGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGlkZSgpO1xuXHRcdHRoaXMuY2hhdFRpcFNlcnZpY2UucmVzZXRTZXNzaW9uKCk7XG5cblx0XHQvLyBTd2l0Y2hpbmcgc2Vzc2lvbnMgcmVzZXRzIHRpcCBzZXJ2aWNlIHN0YXRlOyBjbGVhciBhbnkgcmVuZGVyZWQgdGlwIHNvXG5cdFx0Ly8gZW1wdHktc3RhdGUgcmVuZGVyaW5nIHBpY2tzIGEgZnJlc2gsIGNvbnRleHQtYXBwcm9wcmlhdGUgdGlwLlxuXHRcdHRoaXMuY2xlYXJHZXR0aW5nU3RhcnRlZFRpcCgpO1xuXG5cdFx0Ly8gU2V0IHRoZSBpbnB1dCBtb2RlbCBvbiB0aGUgaW5wdXRQYXJ0IGJlZm9yZSBhc3NpZ25pbmcgdGhpcy52aWV3TW9kZWwuIEFzc2lnbmluZyB0aGlzLnZpZXdNb2RlbFxuXHRcdC8vIGZpcmVzIG9uRGlkQ2hhbmdlVmlld01vZGVsLCB3aGljaCBDaGF0SW5wdXRQYXJ0IGxpc3RlbnMgdG8gYW5kIGV4cGVjdHMgdGhlIGlucHV0IG1vZGVsIHRvIGJlIGluaXRpYWxpemVkLlxuXHRcdC8vIFBhc3MgaW5wdXQgbW9kZWwgcmVmZXJlbmNlIHRvIGlucHV0IHBhcnQgZm9yIHN0YXRlIHN5bmNpbmdcblx0XHR0aGlzLmlucHV0UGFydC5zZXRJbnB1dE1vZGVsKG1vZGVsLmlucHV0TW9kZWwsIG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID09PSAwLCBtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0dGhpcy52aWV3TW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3TW9kZWwsIG1vZGVsLCB1bmRlZmluZWQpO1xuXHRcdGlmICghdGhpcy52aWV3T3B0aW9ucy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbERpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB0aGlzLnNldFJlYWRPbmx5KG1vZGVsLmlzUmVhZE9ubHkucmVhZChyZWFkZXIpKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMubGlzdFdpZGdldC5zZXRWaWV3TW9kZWwodGhpcy52aWV3TW9kZWwpO1xuXG5cdFx0aWYgKHRoaXMuX2xvY2tlZEFnZW50KSB7XG5cdFx0XHRsZXQgcGxhY2Vob2xkZXIgPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24odGhpcy5fbG9ja2VkQWdlbnQuaWQpPy5pbnB1dFBsYWNlaG9sZGVyO1xuXHRcdFx0aWYgKCFwbGFjZWhvbGRlcikge1xuXHRcdFx0XHRwbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjaGF0LmlucHV0LnBsYWNlaG9sZGVyLmxvY2tlZFRvQWdlbnQnLCBcIkNoYXQgd2l0aCB7MH1cIiwgdGhpcy5fbG9ja2VkQWdlbnQuZGlzcGxheU5hbWUgfHwgdGhpcy5fbG9ja2VkQWdlbnQubmFtZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZXRJbnB1dFBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyKTtcblx0XHRcdHRoaXMuaW5wdXRFZGl0b3IudXBkYXRlT3B0aW9ucyh7IHBsYWNlaG9sZGVyIH0pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy52aWV3TW9kZWwuaW5wdXRQbGFjZWhvbGRlcikge1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHsgcGxhY2Vob2xkZXI6IHRoaXMudmlld01vZGVsLmlucHV0UGxhY2Vob2xkZXIgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3TW9kZWxEaXNwb3NhYmxlcy5hZGQoRXZlbnQucnVuQW5kU3Vic2NyaWJlKEV2ZW50LmFjY3VtdWxhdGUodGhpcy52aWV3TW9kZWwub25EaWRDaGFuZ2UpLCAoZXZlbnRzID0+IHtcblx0XHRcdGlmICghdGhpcy52aWV3TW9kZWwgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3ODk2OVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVxdWVzdEluUHJvZ3Jlc3Muc2V0KHRoaXMudmlld01vZGVsLm1vZGVsLnJlcXVlc3RJblByb2dyZXNzLmdldCgpKTtcblx0XHRcdHRoaXMuaGFzQWN0aXZlUmVxdWVzdC5zZXQodGhpcy52aWV3TW9kZWwubW9kZWwuaGFzQWN0aXZlUmVxdWVzdC5nZXQoKSk7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0JvcmRlcigpO1xuXG5cdFx0XHQvLyBVcGRhdGUgdGhlIGVkaXRvcidzIHBsYWNlaG9sZGVyIHRleHQgd2hlbiBpdCBjaGFuZ2VzIGluIHRoZSB2aWV3IG1vZGVsXG5cdFx0XHRpZiAoZXZlbnRzPy5zb21lKGUgPT4gZT8ua2luZCA9PT0gJ2NoYW5nZVBsYWNlaG9sZGVyJykpIHtcblx0XHRcdFx0dGhpcy5pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHsgcGxhY2Vob2xkZXI6IHRoaXMudmlld01vZGVsLmlucHV0UGxhY2Vob2xkZXIgfSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub25EaWRDaGFuZ2VJdGVtcygpO1xuXHRcdFx0aWYgKGV2ZW50cz8uc29tZShlID0+IGU/LmtpbmQgPT09ICdhZGRSZXF1ZXN0JykgJiYgdGhpcy52aXNpYmxlICYmICF0aGlzLmxpc3RXaWRnZXQuaXNBdXRvU2Nyb2xsSGVsZCkge1xuXHRcdFx0XHR0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9FbmQoKTtcblx0XHRcdH1cblx0XHR9KSkpO1xuXHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMuYWRkKHRoaXMudmlld01vZGVsLm9uRGlkRGlzcG9zZU1vZGVsKCgpID0+IHtcblx0XHRcdC8vIEVuc3VyZSB0aGF0IHZpZXcgc3RhdGUgaXMgc2F2ZWQgaGVyZSwgYmVjYXVzZSB3ZSB3aWxsIGxvYWQgaXQgYWdhaW4gd2hlbiBhIG5ldyBtb2RlbCBpcyBhc3NpZ25lZFxuXHRcdFx0aWYgKHRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHRcdHRoaXMuZmluaXNoZWRFZGl0aW5nKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBEaXNwb3NlcyB0aGUgdmlld21vZGVsIGFuZCBsaXN0ZW5lcnNcblx0XHRcdHRoaXMudmlld01vZGVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy51cGRhdGVXb3JraW5nUHJvZ3Jlc3NCb3JkZXIoKTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VJdGVtcygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zZXNzaW9uSXNFbXB0eUNvbnRleHRLZXkuc2V0KG1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID09PSAwKTtcblx0XHRjb25zdCB1cGRhdGVTdXBwb3J0c0ZvcmsgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdXBwb3J0c0ZvcmsgPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2Vzc2lvblN1cHBvcnRzRm9yayhtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fY2hhdFNlc3Npb25TdXBwb3J0c0ZvcmtDb250ZXh0S2V5LnNldChzdXBwb3J0c0ZvcmspO1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0Py51cGRhdGVSZW5kZXJlck9wdGlvbnMoeyBzdXBwb3J0c0ZvcmsgfSk7XG5cdFx0fTtcblx0XHR1cGRhdGVTdXBwb3J0c0ZvcmsoKTtcblx0XHR0aGlzLnZpZXdNb2RlbERpc3Bvc2FibGVzLmFkZCh0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkoKCkgPT4gdXBkYXRlU3VwcG9ydHNGb3JrKCkpKTtcblx0XHR0aGlzLl9zZXNzaW9uSGFzRGVidWdEYXRhQ29udGV4dEtleS5zZXQodGhpcy5jaGF0RGVidWdTZXJ2aWNlLmdldEV2ZW50cyhtb2RlbC5zZXNzaW9uUmVzb3VyY2UpLmxlbmd0aCA+IDApO1xuXHRcdGxldCBsYXN0U3RlZXJpbmdDb3VudCA9IDA7XG5cdFx0Y29uc3QgdXBkYXRlUGVuZGluZ1JlcXVlc3RLZXlzID0gKGFubm91bmNlU3RlZXJpbmc6IGJvb2xlYW4pID0+IHtcblx0XHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0cyA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdFx0Y29uc3QgcGVuZGluZ0NvdW50ID0gcGVuZGluZ1JlcXVlc3RzLmxlbmd0aDtcblx0XHRcdHRoaXMuX2hhc1BlbmRpbmdSZXF1ZXN0c0NvbnRleHRLZXkuc2V0KHBlbmRpbmdDb3VudCA+IDApO1xuXHRcdFx0Y29uc3Qgc3RlZXJpbmdDb3VudCA9IHBlbmRpbmdSZXF1ZXN0cy5maWx0ZXIocGVuZGluZyA9PiBwZW5kaW5nLmtpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKS5sZW5ndGg7XG5cdFx0XHRpZiAoYW5ub3VuY2VTdGVlcmluZyAmJiBzdGVlcmluZ0NvdW50ID4gMCAmJiBsYXN0U3RlZXJpbmdDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRzdGF0dXMobG9jYWxpemUoJ2NoYXQucGVuZGluZ1JlcXVlc3RzLnN0ZWVyaW5nUXVldWVkJywgXCJTdGVlcmluZ1wiKSk7XG5cdFx0XHR9XG5cdFx0XHRsYXN0U3RlZXJpbmdDb3VudCA9IHN0ZWVyaW5nQ291bnQ7XG5cdFx0fTtcblx0XHR1cGRhdGVQZW5kaW5nUmVxdWVzdEtleXMoZmFsc2UpO1xuXHRcdHRoaXMudmlld01vZGVsRGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlUGVuZGluZ1JlcXVlc3RzKCgpID0+IHVwZGF0ZVBlbmRpbmdSZXF1ZXN0S2V5cyh0cnVlKSkpO1xuXG5cdFx0dGhpcy5yZWZyZXNoUGFyc2VkSW5wdXQoKTtcblx0XHR0aGlzLnZpZXdNb2RlbERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2luZCA9PT0gJ3NldEFnZW50Jykge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFnZW50LmZpcmUoeyBhZ2VudDogZS5hZ2VudCwgc2xhc2hDb21tYW5kOiBlLmNvbW1hbmQgfSk7XG5cdFx0XHRcdC8vIFVwZGF0ZSBjYXBhYmlsaXRpZXMgY29udGV4dCBrZXlzIHdoZW4gYWdlbnQgY2hhbmdlc1xuXHRcdFx0XHR0aGlzLl91cGRhdGVBZ2VudENhcGFiaWxpdGllc0NvbnRleHRLZXlzKGUuYWdlbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUua2luZCA9PT0gJ2FkZFJlcXVlc3QnKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXJ0Py5jbGVhclRvZG9MaXN0V2lkZ2V0KHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsIGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbklzRW1wdHlDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0XHRcdHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhpZGUoKTtcblx0XHRcdH1cblx0XHRcdC8vIEhpZGUgd2lkZ2V0IG9uIHJlcXVlc3QgcmVtb3ZhbFxuXHRcdFx0aWYgKGUua2luZCA9PT0gJ3JlbW92ZVJlcXVlc3QnKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXJ0Py5jbGVhclRvZG9MaXN0V2lkZ2V0KHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0XHR0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oaWRlKCk7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Jc0VtcHR5Q29udGV4dEtleS5zZXQoKHRoaXMudmlld01vZGVsPy5tb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCA/PyAwKSA9PT0gMCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBTaG93IG5leHQgc3RlcHMgd2lkZ2V0IHdoZW4gcmVzcG9uc2UgY29tcGxldGVzIChub3Qgd2hlbiByZXF1ZXN0IHN0YXJ0cylcblx0XHRcdGlmIChlLmtpbmQgPT09ICdjb21wbGV0ZWRSZXF1ZXN0Jykge1xuXHRcdFx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IHRoaXMudmlld01vZGVsPy5tb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdFx0Y29uc3Qgd2FzQ2FuY2VsbGVkID0gbGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5pc0NhbmNlbGVkID8/IGZhbHNlO1xuXHRcdFx0XHRpZiAod2FzQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0Ly8gQ2xlYXIgdG9kbyBsaXN0IHdoZW4gcmVxdWVzdCBpcyBjYW5jZWxsZWRcblx0XHRcdFx0XHR0aGlzLmlucHV0UGFydD8uY2xlYXJUb2RvTGlzdFdpZGdldCh0aGlzLnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlLCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBPbmx5IHNob3cgaWYgcmVzcG9uc2Ugd2Fzbid0IGNhbmNlbGVkXG5cdFx0XHRcdHRoaXMucmVuZGVyQ2hhdFN1Z2dlc3ROZXh0V2lkZ2V0KCk7XG5cblx0XHRcdFx0Ly8gTWFyayB0aGUgc2Vzc2lvbiBhcyByZWFkIHdoZW4gdGhlIHJlcXVlc3QgY29tcGxldGVzIGFuZCB0aGUgd2lkZ2V0IGlzIHZpc2libGVcblx0XHRcdFx0aWYgKHRoaXMudmlzaWJsZSAmJiB0aGlzLnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSk/LnNldFJlYWQodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5saXN0V2lkZ2V0ICYmIHRoaXMudmlzaWJsZSkge1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUl0ZW1zKCk7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9FbmQoKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlckNoYXRTdWdnZXN0TmV4dFdpZGdldCgpO1xuXHRcdHRoaXMudXBkYXRlQ2hhdElucHV0Q29udGV4dCgpO1xuXHRcdHRoaXMuaW5wdXQucmVuZGVyQ2hhdFRvZG9MaXN0V2lkZ2V0KHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5pbnB1dC5yZW5kZXJBcnRpZmFjdHNXaWRnZXQodGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGdldEZvY3VzKCk6IENoYXRUcmVlSXRlbSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZXRGb2N1cygpWzBdID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldmVhbChpdGVtOiBDaGF0VHJlZUl0ZW0sIHJlbGF0aXZlVG9wPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LnJldmVhbChpdGVtLCByZWxhdGl2ZVRvcCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHRvcCBvZmZzZXQgb2YgYW4gaXRlbSBpbiB0cmFuc2NyaXB0IGNvbnRlbnQgc3BhY2UgKHNhbWUgc3BhY2UgYXNcblx0ICogYHNjcm9sbFRvcGAvYHNjcm9sbEhlaWdodGApLCBvciBgdW5kZWZpbmVkYCBpZiBpdCBpcyBub3QgaW4gdGhlIGxpc3QuXG5cdCAqIFZpcnR1YWxpemF0aW9uLXNhZmUgZm9yIG9mZi1zY3JlZW4gaXRlbXMgKHJlYWRzIHRoZSBsYXlvdXQgaGVpZ2h0IG1vZGVsKS5cblx0ICovXG5cdGdldEVsZW1lbnRUb3AoaXRlbTogQ2hhdFRyZWVJdGVtKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0LmdldEVsZW1lbnRUb3AoaXRlbSk7XG5cdH1cblxuXHRmb2N1cyhpdGVtOiBDaGF0VHJlZUl0ZW0pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubGlzdFdpZGdldC5oYXNFbGVtZW50KGl0ZW0pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5saXN0V2lkZ2V0LmZvY3VzSXRlbShpdGVtKTtcblx0fVxuXG5cdHNldElucHV0UGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsPy5zZXRJbnB1dFBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyKTtcblx0fVxuXG5cdHJlc2V0SW5wdXRQbGFjZWhvbGRlcigpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlbD8ucmVzZXRJbnB1dFBsYWNlaG9sZGVyKCk7XG5cdH1cblxuXHRzZXRJbnB1dCh2YWx1ZSA9ICcnKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dC5zZXRWYWx1ZSh2YWx1ZSwgZmFsc2UpO1xuXHRcdHRoaXMucmVmcmVzaFBhcnNlZElucHV0KCk7XG5cdH1cblxuXHRnZXRJbnB1dCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmlucHV0LmlucHV0RWRpdG9yLmdldFZhbHVlKCk7XG5cdH1cblxuXHRnZXRDb250cmliPFQgZXh0ZW5kcyBJQ2hhdFdpZGdldENvbnRyaWI+KGlkOiBzdHJpbmcpOiBUIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb250cmlicy5maW5kKGMgPT4gYy5pZCA9PT0gaWQpIGFzIFQgfCB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBDb2RpbmcgYWdlbnQgbG9ja2luZyBtZXRob2RzXG5cdGxvY2tUb0NvZGluZ0FnZW50KG5hbWU6IHN0cmluZywgZGlzcGxheU5hbWU6IHN0cmluZywgYWdlbnRJZDogc3RyaW5nLCBhZ2VudEhvc3RQcm92aWRlcklkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xvY2tlZEFnZW50Py5pZCA9PT0gYWdlbnRJZCAmJiB0aGlzLl9sb2NrZWRBZ2VudC5uYW1lID09PSBuYW1lICYmIHRoaXMuX2xvY2tlZEFnZW50LmRpc3BsYXlOYW1lID09PSBkaXNwbGF5TmFtZSAmJiB0aGlzLl9sb2NrZWRBZ2VudC5hZ2VudEhvc3RQcm92aWRlcklkID09PSBhZ2VudEhvc3RQcm92aWRlcklkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9ja2VkQWdlbnQgPSB7XG5cdFx0XHRpZDogYWdlbnRJZCxcblx0XHRcdG5hbWUsXG5cdFx0XHRwcmVmaXg6IGBAJHtuYW1lfSBgLFxuXHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRhZ2VudEhvc3RQcm92aWRlcklkXG5cdFx0fTtcblx0XHR0aGlzLl9sb2NrZWRUb0NvZGluZ0FnZW50Q29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fbG9ja2VkQ29kaW5nQWdlbnRJZENvbnRleHRLZXkuc2V0KGFnZW50SWQpO1xuXHRcdHRoaXMuX2NoYXRJc0FnZW50SG9zdFNlc3Npb25Db250ZXh0S2V5LnNldCghIWFnZW50SG9zdFByb3ZpZGVySWQpO1xuXHRcdHRoaXMuX2NoYXRBZ2VudEhvc3RQcm92aWRlcklkQ29udGV4dEtleS5zZXQoYWdlbnRIb3N0UHJvdmlkZXJJZCA/PyAnJyk7XG5cdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXHRcdC8vIFVwZGF0ZSBjYXBhYmlsaXRpZXMgZm9yIHRoZSBsb2NrZWQgYWdlbnRcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChhZ2VudElkKTtcblx0XHR0aGlzLl91cGRhdGVBZ2VudENhcGFiaWxpdGllc0NvbnRleHRLZXlzKGFnZW50KTtcblx0XHRjb25zdCBzdXBwb3J0c0NoZWNrcG9pbnRzID0gdGhpcy5fYXR0YWNobWVudENhcGFiaWxpdGllcy5zdXBwb3J0c0NoZWNrcG9pbnRzID8/IGZhbHNlO1xuXHRcdHRoaXMubGlzdFdpZGdldD8udXBkYXRlUmVuZGVyZXJPcHRpb25zKHsgcmVzdG9yYWJsZTogc3VwcG9ydHNDaGVja3BvaW50cywgZWRpdGFibGU6IHN1cHBvcnRzQ2hlY2twb2ludHMgJiYgIXRoaXMuX3JlYWRPbmx5LCBub0Zvb3RlcjogZmFsc2UsIHByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZTogdHJ1ZSB9KTtcblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQ/LnJlcmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0dW5sb2NrRnJvbUNvZGluZ0FnZW50KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbG9ja2VkQWdlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDbGVhciBhbGwgc3RhdGUgcmVsYXRlZCB0byBsb2NraW5nXG5cdFx0dGhpcy5fbG9ja2VkQWdlbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbG9ja2VkVG9Db2RpbmdBZ2VudENvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9sb2NrZWRDb2RpbmdBZ2VudElkQ29udGV4dEtleS5zZXQoJycpO1xuXHRcdHRoaXMuX2NoYXRJc0FnZW50SG9zdFNlc3Npb25Db250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fY2hhdEFnZW50SG9zdFByb3ZpZGVySWRDb250ZXh0S2V5LnNldCgnJyk7XG5cdFx0dGhpcy5fY2hhdFNlc3Npb25TdXBwb3J0c0ZvcmtDb250ZXh0S2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fdXBkYXRlQWdlbnRDYXBhYmlsaXRpZXNDb250ZXh0S2V5cyh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gRXhwbGljaXRseSB1cGRhdGUgdGhlIERPTSB0byByZWZsZWN0IHVubG9ja2VkIHN0YXRlXG5cdFx0dGhpcy5yZW5kZXJXZWxjb21lVmlld0NvbnRlbnRJZk5lZWRlZCgpO1xuXG5cdFx0Ly8gUmVzZXQgdG8gZGVmYXVsdCBwbGFjZWhvbGRlclxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbCkge1xuXHRcdFx0dGhpcy52aWV3TW9kZWwucmVzZXRJbnB1dFBsYWNlaG9sZGVyKCk7XG5cdFx0fVxuXHRcdHRoaXMuaW5wdXRFZGl0b3I/LnVwZGF0ZU9wdGlvbnMoeyBwbGFjZWhvbGRlcjogdW5kZWZpbmVkIH0pO1xuXHRcdHRoaXMubGlzdFdpZGdldD8udXBkYXRlUmVuZGVyZXJPcHRpb25zKHsgcmVzdG9yYWJsZTogdHJ1ZSwgZWRpdGFibGU6ICF0aGlzLl9yZWFkT25seSwgcHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlOiBtb2RlID0+IG1vZGUgIT09IENoYXRNb2RlS2luZC5Bc2sgfSk7XG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0Py5yZXJlbmRlcigpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpc0xvY2tlZFRvQ29kaW5nQWdlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbG9ja2VkQWdlbnQ7XG5cdH1cblxuXHRnZXQgbG9ja2VkQWdlbnRJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sb2NrZWRBZ2VudD8uaWQ7XG5cdH1cblxuXHRsb2dJbnB1dEhpc3RvcnkoKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dC5sb2dJbnB1dEhpc3RvcnkoKTtcblx0fVxuXG5cdGFzeW5jIGFjY2VwdElucHV0KHF1ZXJ5Pzogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRBY2NlcHRJbnB1dE9wdGlvbnMpOiBQcm9taXNlPElDaGF0UmVzcG9uc2VNb2RlbCB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9yZWFkT25seSB8fCB0aGlzLmlucHV0Lmhhc1BlbmRpbmdQcm9ncmFtbWF0aWNNb2RlbFNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdG1hcmtDaGF0KHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcmZNYXJrLlJlcXVlc3RTdGFydCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hY2NlcHRJbnB1dChxdWVyeSA/IHsgcXVlcnkgfSA6IHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdH1cblxuXHRhc3luYyByZXJ1bkxhc3RSZXF1ZXN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9yZWFkT25seSB8fCAhdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSB0aGlzLmNoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKT8uZ2V0UmVxdWVzdHMoKS5hdCgtMSk7XG5cdFx0aWYgKCFsYXN0UmVxdWVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0YXR0ZW1wdDogbGFzdFJlcXVlc3QuYXR0ZW1wdCArIDEsXG5cdFx0XHRsb2NhdGlvbjogdGhpcy5sb2NhdGlvbixcblx0XHRcdC4uLnRoaXMuZ2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zKCksXG5cdFx0XHRtb2RlSW5mbzogdGhpcy5pbnB1dC5jdXJyZW50TW9kZUluZm8sXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLnJlc2VuZFJlcXVlc3QobGFzdFJlcXVlc3QsIG9wdGlvbnMpO1xuXHRcdHRoaXMubG9nVGhpbmtpbmdTdHlsZVVzYWdlKCdyZXJ1bicpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyZWRUaGlua2luZ1N0eWxlKCk6IFRoaW5raW5nRGlzcGxheU1vZGUge1xuXHRcdGNvbnN0IHRoaW5raW5nU3R5bGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPFRoaW5raW5nRGlzcGxheU1vZGU+KENoYXRDb25maWd1cmF0aW9uLlRoaW5raW5nU3R5bGUpO1xuXHRcdHN3aXRjaCAodGhpbmtpbmdTdHlsZSkge1xuXHRcdFx0Y2FzZSBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZDpcblx0XHRcdGNhc2UgVGhpbmtpbmdEaXNwbGF5TW9kZS5Db2xsYXBzZWRQcmV2aWV3OlxuXHRcdFx0Y2FzZSBUaGlua2luZ0Rpc3BsYXlNb2RlLkZpeGVkU2Nyb2xsaW5nOlxuXHRcdFx0XHRyZXR1cm4gdGhpbmtpbmdTdHlsZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiBUaGlua2luZ0Rpc3BsYXlNb2RlLkZpeGVkU2Nyb2xsaW5nO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9nVGhpbmtpbmdTdHlsZVVzYWdlKHJlcXVlc3RLaW5kOiBDaGF0VGhpbmtpbmdTdHlsZVVzYWdlRXZlbnRbJ3JlcXVlc3RLaW5kJ10pOiB2b2lkIHtcblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0VGhpbmtpbmdTdHlsZVVzYWdlRXZlbnQsIENoYXRUaGlua2luZ1N0eWxlVXNhZ2VDbGFzc2lmaWNhdGlvbj4oJ2NoYXQudGhpbmtpbmdTdHlsZVVzYWdlJywge1xuXHRcdFx0dGhpbmtpbmdTdHlsZTogdGhpcy5nZXRDb25maWd1cmVkVGhpbmtpbmdTdHlsZSgpLFxuXHRcdFx0bG9jYXRpb246IHRoaXMubG9jYXRpb24sXG5cdFx0XHRyZXF1ZXN0S2luZCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbEdvYWxTdW1tYXJ5KCk6IHZvaWQge1xuXHRcdHRoaXMuX2dvYWxTdW1tYXJ5VG9rZW5Tb3VyY2U/LmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhpcy5fZ29hbFN1bW1hcnlUb2tlblNvdXJjZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX21heWJlU3RhcnRHb2FsU3VtbWFyeShwcm9tcHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0UGFydCA9IHRoaXMuaW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZTtcblx0XHRpZiAoIWlucHV0UGFydCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBhZHZhbmNlZCBhdXRvcGlsb3QgZ29hbCBiYW5uZXIgaXMgb25seSBzdXBwb3J0ZWQgaW4gdGhlIGxvY2FsIGNoYXRcblx0XHQvLyBoYXJuZXNzLiBBZ2VudC1ob3N0IGJhY2tlZCBzZXNzaW9ucyAoQ29waWxvdCBDTEksIENsYXVkZSwgQ29kZXggYW5kIHRoZVxuXHRcdC8vIGxvY2FsL3JlbW90ZSBhZ2VudCBob3N0cykgbXVzdCBuZXZlciByZW5kZXIgaXQuXG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCBpc0xvY2FsSGFybmVzcyA9ICEhc2Vzc2lvblJlc291cmNlICYmIGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZTtcblx0XHRjb25zdCBwZXJtaXNzaW9uTGV2ZWwgPSBpbnB1dFBhcnQuY3VycmVudE1vZGVJbmZvPy5wZXJtaXNzaW9uTGV2ZWw7XG5cdFx0Y29uc3QgZ29hbE1vZGVPbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b3BpbG90QWR2YW5jZWRFbmFibGVkKSA9PT0gdHJ1ZTtcblx0XHRpZiAoIWlzTG9jYWxIYXJuZXNzIHx8IHBlcm1pc3Npb25MZXZlbCAhPT0gQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QgfHwgIWdvYWxNb2RlT24pIHtcblx0XHRcdHRoaXMuX2NhbmNlbEdvYWxTdW1tYXJ5KCk7XG5cdFx0XHRpbnB1dFBhcnQuY2xlYXJHb2FsQmFubmVyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzZXQgcGVyLXJlcXVlc3QgZGlzbWlzc2FsIHN0YXRlIGFuZCAocmUpYmluZCB0aGUgZGlzbWlzcyBsaXN0ZW5lciB0byB0aGVcblx0XHQvLyBjdXJyZW50IGlucHV0IHBhcnQuIEEgTXV0YWJsZURpc3Bvc2FibGUgZGlzcG9zZXMgYW55IHByaW9yIGJpbmRpbmcsIHNvIHRoaXNcblx0XHQvLyBzdGF5cyBjb3JyZWN0IGV2ZW4gaWYgdGhlIGlucHV0IHBhcnQgaXMgcmVjcmVhdGVkLlxuXHRcdHRoaXMuX2dvYWxCYW5uZXJEaXNtaXNzZWRGb3JDdXJyZW50UmVxdWVzdCA9IGZhbHNlO1xuXHRcdHRoaXMuX2dvYWxCYW5uZXJEaXNtaXNzTGlzdGVuZXIudmFsdWUgPSBpbnB1dFBhcnQub25EaWREaXNtaXNzR29hbEJhbm5lcigoKSA9PiB7XG5cdFx0XHR0aGlzLl9nb2FsQmFubmVyRGlzbWlzc2VkRm9yQ3VycmVudFJlcXVlc3QgPSB0cnVlO1xuXHRcdFx0dGhpcy5fY2FuY2VsR29hbFN1bW1hcnkoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2NhbmNlbEdvYWxTdW1tYXJ5KCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fZ29hbFN1bW1hcnlUb2tlblNvdXJjZSA9IGN0cztcblx0XHRpbnB1dFBhcnQuc2hvd0dvYWxCYW5uZXJMb2FkaW5nKCk7XG5cblx0XHR0aGlzLmNoYXRHb2FsU3VtbWFyeVNlcnZpY2Uuc3VtbWFyaXplKHByb21wdCwgY3RzLnRva2VuKS50aGVuKHN1bW1hcnkgPT4ge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLl9nb2FsQmFubmVyRGlzbWlzc2VkRm9yQ3VycmVudFJlcXVlc3QpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuaW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZTtcblx0XHRcdGlmICghY3VycmVudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3VtbWFyeSkge1xuXHRcdFx0XHRjdXJyZW50LnNldEdvYWxCYW5uZXIoc3VtbWFyeSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjdXJyZW50LmNsZWFyR29hbEJhbm5lcigpO1xuXHRcdFx0fVxuXHRcdH0sICgpID0+IHtcblx0XHRcdGlmIChjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5pbnB1dFBhcnREaXNwb3NhYmxlLnZhbHVlPy5jbGVhckdvYWxCYW5uZXIoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyBgZmFsc2VgIHdoZW4gdGhlIHByb21wdCBtZXRhZGF0YSByZXF1ZXN0ZWQgYW4gYWdlbnQgc3dpdGNoIHRoYXQgdGhlXG5cdCAqIHVzZXIgY2FuY2VsbGVkLCBzaWduYWxsaW5nIHRoYXQgaW5wdXQgc3VibWlzc2lvbiBzaG91bGQgYmUgYWJvcnRlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5UHJvbXB0RmlsZUlmU2V0KHJlcXVlc3RJbnB1dDogSUNoYXRSZXF1ZXN0SW5wdXRPcHRpb25zLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdC8vIGZpcnN0IGNoZWNrIGlmIHRoZSBpbnB1dCBoYXMgYSBwcm9tcHQgc2xhc2ggY29tbWFuZFxuXHRcdGNvbnN0IGFnZW50U2xhc2hQcm9tcHRQYXJ0ID0gdGhpcy5wYXJzZWRJbnB1dC5wYXJ0cy5maW5kKChyKTogciBpcyBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCA9PiByIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RTbGFzaFByb21wdFBhcnQpO1xuXHRcdGlmICghYWdlbnRTbGFzaFByb21wdFBhcnQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFByb21wdCBzbGFzaCBjb21tYW5kcyBhcmUgdHJhbnNmb3JtZWQgb3V0IG9mIHRoZSBpbnB1dCBiZWZvcmUgc2VuZFJlcXVlc3QuXG5cdFx0Ly8gVHJhY2sgdGhlbSBub3cgc28gdGlwIGV4Y2x1c2lvbnMgc3RpbGwgdXBkYXRlIGZvciBjb21tYW5kcyBsaWtlIC9pbml0LlxuXHRcdHRoaXMuY2hhdFRpcFNlcnZpY2UucmVjb3JkU2xhc2hDb21tYW5kVXNhZ2UoYWdlbnRTbGFzaFByb21wdFBhcnQubmFtZSk7XG5cblx0XHQvLyBuZWVkIHRvIHJlc29sdmUgdGhlIHNsYXNoIGNvbW1hbmQgdG8gZ2V0IHRoZSBwcm9tcHQgZmlsZVxuXHRcdGNvbnN0IHNsYXNoQ29tbWFuZCA9IGF3YWl0IHRoaXMuY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLnJlc29sdmVQcm9tcHRTbGFzaENvbW1hbmQoYWdlbnRTbGFzaFByb21wdFBhcnQubmFtZSwgc2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIXNsYXNoQ29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlUmVzdWx0ID0gc2xhc2hDb21tYW5kLnBhcnNlZFByb21wdEZpbGU7XG5cdFx0Ly8gYWRkIHRoZSBwcm9tcHQgZmlsZSB0byB0aGUgY29udGV4dFxuXHRcdGNvbnN0IHJlZnMgPSBwYXJzZVJlc3VsdC5ib2R5Py52YXJpYWJsZVJlZmVyZW5jZXMubWFwKCh7IG5hbWUsIG9mZnNldCwgZnVsbExlbmd0aCB9KSA9PiAoeyBuYW1lLCByYW5nZTogbmV3IE9mZnNldFJhbmdlKG9mZnNldCwgb2Zmc2V0ICsgZnVsbExlbmd0aCkgfSkpID8/IFtdO1xuXHRcdGNvbnN0IHRvb2xSZWZlcmVuY2VzID0gdGhpcy50b29sc1NlcnZpY2UudG9Ub29sUmVmZXJlbmNlcyhyZWZzKTtcblx0XHRyZXF1ZXN0SW5wdXQuYXR0YWNoZWRDb250ZXh0Lmluc2VydEZpcnN0KHRvUHJvbXB0RmlsZVZhcmlhYmxlRW50cnkocGFyc2VSZXN1bHQudXJpLCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLlByb21wdEZpbGUsIHVuZGVmaW5lZCwgdHJ1ZSwgdG9vbFJlZmVyZW5jZXMpKTtcblxuXHRcdGNvbnN0IHByb21wdFJ1bkV2ZW50OiBDaGF0UHJvbXB0UnVuRXZlbnQgPSB7XG5cdFx0XHRzdG9yYWdlOiBzbGFzaENvbW1hbmQuc3RvcmFnZSxcblx0XHR9O1xuXHRcdGlmIChzbGFzaENvbW1hbmQuZXh0ZW5zaW9uKSB7XG5cdFx0XHRwcm9tcHRSdW5FdmVudC5leHRlbnNpb25JZCA9IHNsYXNoQ29tbWFuZC5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZTtcblx0XHRcdHByb21wdFJ1bkV2ZW50LnByb21wdE5hbWUgPSBzbGFzaENvbW1hbmQubmFtZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvbXB0UnVuRXZlbnQucHJvbXB0TmFtZUhhc2ggPSBoYXNoKHNsYXNoQ29tbWFuZC5uYW1lKS50b1N0cmluZygxNik7XG5cdFx0fVxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRQcm9tcHRSdW5FdmVudCwgQ2hhdFByb21wdFJ1bkNsYXNzaWZpY2F0aW9uPignY2hhdC5wcm9tcHRSdW4nLCBwcm9tcHRSdW5FdmVudCk7XG5cblx0XHRpZiAocGFyc2VSZXN1bHQuaGVhZGVyKSB7XG5cdFx0XHRjb25zdCBhcHBsaWVkID0gYXdhaXQgdGhpcy5fYXBwbHlQcm9tcHRNZXRhZGF0YShwYXJzZVJlc3VsdC5oZWFkZXIsIHJlcXVlc3RJbnB1dCk7XG5cdFx0XHRpZiAoIWFwcGxpZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWNjZXB0SW5wdXQocXVlcnk6IHsgcXVlcnk6IHN0cmluZyB9IHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJQ2hhdEFjY2VwdElucHV0T3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJQ2hhdFJlc3BvbnNlTW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXF1ZXJ5ICYmIHRoaXMuaW5wdXQuZ2VuZXJhdGluZykge1xuXHRcdFx0Ly8gaWYgdGhlIHVzZXIgc3VibWl0cyB0aGUgaW5wdXQgYW5kIGdlbmVyYXRpb24gZmluaXNoZXMgcXVpY2tseSwganVzdCBzdWJtaXQgaXQgZm9yIHRoZW1cblx0XHRcdGNvbnN0IGdlbmVyYXRpbmdBdXRvU3VibWl0V2luZG93ID0gNTAwO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdFx0YXdhaXQgdGhpcy5pbnB1dC5nZW5lcmF0aW5nO1xuXHRcdFx0aWYgKERhdGUubm93KCkgLSBzdGFydCA+IGdlbmVyYXRpbmdBdXRvU3VibWl0V2luZG93KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR3aGlsZSAoIXRoaXMuX3ZpZXdNb2RlbCAmJiAhdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHRoaXMub25EaWRDaGFuZ2VWaWV3TW9kZWwsIHRoaXMuX3N0b3JlKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMudmlld01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYSBjdXN0b20gc3VibWl0IGhhbmRsZXIgd2FudHMgdG8gaGFuZGxlIHRoaXMgc3VibWlzc2lvblxuXHRcdGlmICh0aGlzLnZpZXdPcHRpb25zLnN1Ym1pdEhhbmRsZXIpIHtcblx0XHRcdGNvbnN0IGlucHV0VmFsdWUgPSAhcXVlcnkgPyB0aGlzLmdldElucHV0KCkgOiBxdWVyeS5xdWVyeTtcblx0XHRcdGNvbnN0IGhhbmRsZWQgPSBhd2FpdCB0aGlzLnZpZXdPcHRpb25zLnN1Ym1pdEhhbmRsZXIoaW5wdXRWYWx1ZSwgdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQpO1xuXHRcdFx0aWYgKGhhbmRsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGlzVXNlclF1ZXJ5ID0gIXF1ZXJ5O1xuXHRcdGNvbnN0IGlucHV0VmFsdWUgPSBpc1VzZXJRdWVyeSA/IHRoaXMuZ2V0SW5wdXQoKSA6IHF1ZXJ5LnF1ZXJ5O1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC5tb2RlbC5oYXNBY3RpdmVSZXF1ZXN0LmdldCgpICYmIGF3YWl0IHRoaXMuX3RyeUV4ZWN1dGVJbW1lZGlhdGVTbGFzaENvbW1hbmQoaW5wdXRWYWx1ZSwgaXNVc2VyUXVlcnkgPyB0aGlzLnBhcnNlZElucHV0IDogdW5kZWZpbmVkKSkge1xuXHRcdFx0dGhpcy5zZXRJbnB1dCgnJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc1VzZXJRdWVyeSkge1xuXHRcdFx0Y29uc3QgcHJlU3VibWl0UmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlLnRyeUhhbmRsZSh7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRpbnB1dDogaW5wdXRWYWx1ZSxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHByZVN1Ym1pdFJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLnNldElucHV0KCcnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghb3B0aW9ucy5wcmVzZXJ2ZUlucHV0KSB7XG5cdFx0XHQvLyBXb3VsZCBzdG9wIGRpY3RhdGlvbiB0aGUgcHJlc2VydmVkIGRyYWZ0IG1heSBzdGlsbCBiZSB1c2luZy5cblx0XHRcdHRoaXMuX29uRGlkQWNjZXB0SW5wdXQuZmlyZSgpO1xuXHRcdH1cblx0XHR0aGlzLmxpc3RXaWRnZXQuc2V0U2Nyb2xsTG9jayh0aGlzLmlzTG9ja2VkVG9Db2RpbmdBZ2VudCB8fCAhIWNoZWNrTW9kZU9wdGlvbih0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCwgdGhpcy52aWV3T3B0aW9ucy5hdXRvU2Nyb2xsKSk7XG5cblx0XHRjb25zdCByZXF1ZXN0SW5wdXRzOiBJQ2hhdFJlcXVlc3RJbnB1dE9wdGlvbnMgPSB7XG5cdFx0XHRpbnB1dDogaW5wdXRWYWx1ZSxcblx0XHRcdC8vIHByZXNlcnZlSW5wdXQgbWVhbnMgdGhlIGlucHV0IGJveCBob2xkcyBhbiB1bnJlbGF0ZWQgZHJhZnQsIHNvIGl0c1xuXHRcdFx0Ly8gYXR0YWNobWVudHMgYmVsb25nIHRvIHRoYXQgZHJhZnQgYW5kIG11c3Qgbm90IGJlIHNlbnQgd2l0aCB0aGlzIHF1ZXJ5LlxuXHRcdFx0YXR0YWNoZWRDb250ZXh0OiBvcHRpb25zPy5wcmVzZXJ2ZUlucHV0XG5cdFx0XHRcdD8gbmV3IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQoKVxuXHRcdFx0XHQ6IG9wdGlvbnM/LmVuYWJsZUltcGxpY2l0Q29udGV4dCA9PT0gZmFsc2UgPyB0aGlzLmlucHV0LmdldEF0dGFjaGVkQ29udGV4dCgpIDogdGhpcy5pbnB1dC5nZXRBdHRhY2hlZEFuZEltcGxpY2l0Q29udGV4dCgpLFxuXHRcdH07XG5cblx0XHRpZiAodGhpcy52aWV3TW9kZWwubW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCkgJiYgYXdhaXQgdGhpcy5fZXhlY3V0ZVNsYXNoQ29tbWFuZER1cmluZ1JlcXVlc3QocmVxdWVzdElucHV0cy5pbnB1dCwgaXNVc2VyUXVlcnksIG9wdGlvbnMucHJlc2VydmVGb2N1cykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXNFZGl0aW5nID0gdGhpcy52aWV3TW9kZWw/LmVkaXRpbmc7XG5cdFx0Y29uc3QgZWRpdGVkTW9kZWxSZXF1ZXN0T3B0aW9ucyA9IGlzRWRpdGluZyAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgIT09ICdpbnB1dCdcblx0XHRcdD8gdGhpcy5nZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMoKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0bGV0IGNhbmNlbGxlZEN1cnJlbnRSZXF1ZXN0ID0gZmFsc2U7XG5cdFx0aWYgKGlzRWRpdGluZykge1xuXHRcdFx0Ly8gQ2xlYXIgdGhlIGNhcm91c2VsIHNpbmNlIHRoZSBleGlzdGluZyByZXF1ZXN0IGlzIGJlaW5nIHJlcGxhY2VkXG5cdFx0XHR0aGlzLmlucHV0UGFydD8uY2xlYXJUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwoKTtcblxuXHRcdFx0Y29uc3QgZWRpdGluZ1BlbmRpbmdSZXF1ZXN0ID0gdGhpcy52aWV3TW9kZWwuZWRpdGluZyEucGVuZGluZ0tpbmQ7XG5cdFx0XHRpZiAoZWRpdGluZ1BlbmRpbmdSZXF1ZXN0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgZWRpdGluZ1JlcXVlc3RJZCA9IHRoaXMudmlld01vZGVsLmVkaXRpbmchLmlkO1xuXHRcdFx0XHR0aGlzLmNoYXRTZXJ2aWNlLnJlbW92ZVBlbmRpbmdSZXF1ZXN0KHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSwgZWRpdGluZ1JlcXVlc3RJZCk7XG5cdFx0XHRcdGlmICghb3B0aW9ucy5jYW5jZWxDdXJyZW50UmVxdWVzdCkge1xuXHRcdFx0XHRcdG9wdGlvbnMucXVldWUgPz89IGVkaXRpbmdQZW5kaW5nUmVxdWVzdDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24odGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCAnYWNjZXB0SW5wdXQtZWRpdGluZycpO1xuXHRcdFx0XHRjYW5jZWxsZWRDdXJyZW50UmVxdWVzdCA9IHRydWU7XG5cdFx0XHRcdG9wdGlvbnMucXVldWUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciBhZ2VudHMgdGhhdCBzdXBwb3J0IGNoZWNrcG9pbnRzLCBwcmVzZXJ2ZSB0aGUgY2hlY2twb2ludFxuXHRcdFx0Ly8gdGhyb3VnaCBmaW5pc2hlZEVkaXRpbmcgc28gYmxvY2tlZCByZXF1ZXN0cyBhcmUgcmVtb3ZlZCBiZWxvd1xuXHRcdFx0Ly8gYW5kIHRoZSBhZ2VudCBob3N0IGNhbiBkaXNwYXRjaCBhIHByb3RvY29sIHRydW5jYXRpb24gYWN0aW9uLlxuXHRcdFx0Y29uc3QgcHJlc2VydmVDaGVja3BvaW50ID0gdGhpcy5fbG9ja2VkQWdlbnQgJiYgISF0aGlzLl9hdHRhY2htZW50Q2FwYWJpbGl0aWVzLnN1cHBvcnRzQ2hlY2twb2ludHM7XG5cdFx0XHRpZiAocHJlc2VydmVDaGVja3BvaW50KSB7XG5cdFx0XHRcdHRoaXMucmVjZW50bHlSZXN0b3JlZENoZWNrcG9pbnQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5maW5pc2hlZEVkaXRpbmcodHJ1ZSk7XG5cdFx0XHRpZiAoIXByZXNlcnZlQ2hlY2twb2ludCkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5tb2RlbD8uc2V0Q2hlY2twb2ludCh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy52aWV3TW9kZWwubW9kZWw7XG5cdFx0aWYgKG9wdGlvbnMuY2FuY2VsQ3VycmVudFJlcXVlc3QgJiYgbW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MuZ2V0KCkgJiYgIWNhbmNlbGxlZEN1cnJlbnRSZXF1ZXN0KSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbih0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsICdhY2NlcHRJbnB1dC1zdG9wQW5kU2VuZCcpO1xuXHRcdFx0Y2FuY2VsbGVkQ3VycmVudFJlcXVlc3QgPSB0cnVlO1xuXHRcdFx0b3B0aW9ucy5xdWV1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVxdWVzdEluUHJvZ3Jlc3MgPSBtb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5nZXQoKTtcblx0XHQvLyBDYW5jZWwgdGhlIHJlcXVlc3QgaWYgdGhlIHVzZXIgY2hvb3NlcyB0byB0YWtlIGEgZGlmZmVyZW50IHBhdGguXG5cdFx0Ly8gVGhpcyBpcyBhIGJpdCBvZiBhIGhldXJpc3RpYyBmb3IgdGhlIGNvbW1vbiBjYXNlIG9mIHRvb2wgY29uZmlybWF0aW9uK3Jlcm91dGUuXG5cdFx0Ly8gQnV0IHdlIGRvbid0IGRvIHRoaXMgaWYgdGhlcmUgYXJlIHF1ZXVlZCBtZXNzYWdlcywgYmVjYXVzZSB3ZSB3b3VsZCBlaXRoZXJcblx0XHQvLyBkaXNjYXJkIHRoZW0gb3IgbmVlZCBhIHByb21wdCAoYXMgaW4gYGNvbmZpcm1QZW5kaW5nUmVxdWVzdHNCZWZvcmVTZW5kYClcblx0XHQvLyB3aGljaCBjb3VsZCBiZSBhIHN1cnByaXNpbmcgYmVoYXZpb3IgaWYgdGhlIHVzZXIgZmluaXNoZXMgdHlwaW5nIGEgc3RlZXJpbmdcblx0XHQvLyByZXF1ZXN0IGp1c3QgYXMgY29uZmlybWF0aW9uIGlzIHRyaWdnZXJlZC5cblx0XHRpZiAoIW9wdGlvbnMuY2FuY2VsQ3VycmVudFJlcXVlc3QgJiYgbW9kZWwucmVxdWVzdE5lZWRzSW5wdXQuZ2V0KCkgJiYgIW1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24odGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlLCAnYWNjZXB0SW5wdXQtbmVlZHNJbnB1dCcpO1xuXHRcdFx0b3B0aW9ucy5xdWV1ZSA/Pz0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuUXVldWVkO1xuXHRcdH1cblx0XHRpZiAocmVxdWVzdEluUHJvZ3Jlc3MgJiYgIW9wdGlvbnMuY2FuY2VsQ3VycmVudFJlcXVlc3QpIHtcblx0XHRcdG9wdGlvbnMucXVldWUgPz89IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZDtcblx0XHR9XG5cdFx0aWYgKCFyZXF1ZXN0SW5Qcm9ncmVzcyAmJiAhaXNFZGl0aW5nICYmICEoYXdhaXQgdGhpcy5jb25maXJtUGVuZGluZ1JlcXVlc3RzQmVmb3JlU2VuZChtb2RlbCwgb3B0aW9ucykpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gcHJvY2VzcyB0aGUgcHJvbXB0IGNvbW1hbmRcblx0XHQvLyBTa2lwcGVkIGZvciBwcmVzZXJ2ZUlucHV0OiBwYXJzZWRJbnB1dCBpcyB0aGUgZHJhZnQsIGFuZCBhbiBhZ2VudCBzd2l0Y2ggY2FuIGNsZWFyIHRoZSBzZXNzaW9uLlxuXHRcdGlmICghb3B0aW9ucy5wcmVzZXJ2ZUlucHV0KSB7XG5cdFx0XHRjb25zdCBwcm9tcHRBcHBsaWVkID0gYXdhaXQgdGhpcy5fYXBwbHlQcm9tcHRGaWxlSWZTZXQocmVxdWVzdElucHV0cywgdGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghcHJvbXB0QXBwbGllZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudmlld09wdGlvbnMuZW5hYmxlV29ya2luZ1NldCAhPT0gdW5kZWZpbmVkICYmIHRoaXMuaW5wdXQuY3VycmVudE1vZGVLaW5kID09PSBDaGF0TW9kZUtpbmQuRWRpdCkge1xuXHRcdFx0Y29uc3QgdW5pcXVlV29ya2luZ1NldEVudHJpZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTsgLy8gTk9URTogdGhpcyBpcyB1c2VkIGZvciBib29ra2VlcGluZyBzbyB0aGUgVUkgY2FuIGF2b2lkIHJlbmRlcmluZyByZWZlcmVuY2VzIGluIHRoZSBVSSB0aGF0IGFyZSBhbHJlYWR5IHNob3duIGluIHRoZSB3b3JraW5nIHNldFxuXHRcdFx0Y29uc3QgZWRpdGluZ1Nlc3Npb25BdHRhY2hlZENvbnRleHQ6IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQgPSByZXF1ZXN0SW5wdXRzLmF0dGFjaGVkQ29udGV4dDtcblxuXHRcdFx0Ly8gQ29sbGVjdCBmaWxlIHZhcmlhYmxlcyBmcm9tIHByZXZpb3VzIHJlcXVlc3RzIGJlZm9yZSBzZW5kaW5nIHRoZSByZXF1ZXN0XG5cdFx0XHRjb25zdCBwcmV2aW91c1JlcXVlc3RzID0gdGhpcy52aWV3TW9kZWwubW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiBwcmV2aW91c1JlcXVlc3RzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdmFyaWFibGUgb2YgcmVxdWVzdC52YXJpYWJsZURhdGEudmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaSh2YXJpYWJsZS52YWx1ZSkgJiYgdmFyaWFibGUua2luZCA9PT0gJ2ZpbGUnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSB2YXJpYWJsZS52YWx1ZTtcblx0XHRcdFx0XHRcdGlmICghdW5pcXVlV29ya2luZ1NldEVudHJpZXMuaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRcdFx0ZWRpdGluZ1Nlc3Npb25BdHRhY2hlZENvbnRleHQuYWRkKHZhcmlhYmxlKTtcblx0XHRcdFx0XHRcdFx0dW5pcXVlV29ya2luZ1NldEVudHJpZXMuYWRkKHZhcmlhYmxlLnZhbHVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlcXVlc3RJbnB1dHMuYXR0YWNoZWRDb250ZXh0ID0gZWRpdGluZ1Nlc3Npb25BdHRhY2hlZENvbnRleHQ7XG5cblx0XHRcdHR5cGUgQ2hhdEVkaXRpbmdXb3JraW5nU2V0Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnam95Y2VlcmhsJztcblx0XHRcdFx0Y29tbWVudDogJ0luZm9ybWF0aW9uIGFib3V0IHRoZSB3b3JraW5nIHNldCBzaXplIGluIGEgY2hhdCBlZGl0aW5nIHJlcXVlc3QnO1xuXHRcdFx0XHRvcmlnaW5hbFNpemU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGZpbGVzIHRoYXQgdGhlIHVzZXIgdHJpZWQgdG8gYXR0YWNoIGluIHRoZWlyIGVkaXRpbmcgcmVxdWVzdC4nIH07XG5cdFx0XHRcdGFjdHVhbFNpemU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGZpbGVzIHRoYXQgd2VyZSBhY3R1YWxseSBzZW50IGluIHRoZWlyIGVkaXRpbmcgcmVxdWVzdC4nIH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBDaGF0RWRpdGluZ1dvcmtpbmdTZXRFdmVudCA9IHtcblx0XHRcdFx0b3JpZ2luYWxTaXplOiBudW1iZXI7XG5cdFx0XHRcdGFjdHVhbFNpemU6IG51bWJlcjtcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0RWRpdGluZ1dvcmtpbmdTZXRFdmVudCwgQ2hhdEVkaXRpbmdXb3JraW5nU2V0Q2xhc3NpZmljYXRpb24+KCdjaGF0RWRpdGluZy93b3JraW5nU2V0U2l6ZScsIHsgb3JpZ2luYWxTaXplOiB1bmlxdWVXb3JraW5nU2V0RW50cmllcy5zaXplLCBhY3R1YWxTaXplOiB1bmlxdWVXb3JraW5nU2V0RW50cmllcy5zaXplIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5wdXQudmFsaWRhdGVBZ2VudE1vZGUoKTtcblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC5tb2RlbC5jaGVja3BvaW50KSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0cyA9IHRoaXMudmlld01vZGVsLm1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0XHRmb3IgKGxldCBpID0gcmVxdWVzdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpIC09IDEpIHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IHJlcXVlc3RzW2ldO1xuXHRcdFx0XHRpZiAocmVxdWVzdC5zaG91bGRCZUJsb2NrZWQuZ2V0KCkgfHwgcmVxdWVzdCA9PT0gdGhpcy52aWV3TW9kZWwubW9kZWwuY2hlY2twb2ludCkge1xuXHRcdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2UucmVtb3ZlUmVxdWVzdCh0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5tb2RlbC5zZXRDaGVja3BvaW50KHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwYW5kIGRpcmVjdG9yeSBhdHRhY2htZW50czogZXh0cmFjdCBpbWFnZXMgYXMgYmluYXJ5IGVudHJpZXNcblx0XHRjb25zdCByZXNvbHZlZEltYWdlVmFyaWFibGVzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZURpcmVjdG9yeUltYWdlQXR0YWNobWVudHMocmVxdWVzdElucHV0cy5hdHRhY2hlZENvbnRleHQuYXNBcnJheSgpKTtcblx0XHRjb25zdCBzdWJtaXR0ZWRTZXNzaW9uUmVzb3VyY2UgPSB0aGlzLnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cblx0XHQvLyBGb3IgY29udHJpYnV0ZWQgc2Vzc2lvbiB0eXBlcywgb25seSBjb2xsZWN0IGF1dG9tYXRpYyBpbnN0cnVjdGlvbnMgd2hlblxuXHRcdC8vIHRoZSBjb250cmlidXRpb24gZXhwbGljaXRseSBvcHRzIGluIHZpYSBhdXRvQXR0YWNoUmVmZXJlbmNlcy5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9sb2NrZWRBZ2VudCA/IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih0aGlzLl9sb2NrZWRBZ2VudC5pZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXV0b0F0dGFjaEVuYWJsZWQgPSBjb250cmlidXRpb24gPyBjb250cmlidXRpb24uYXV0b0F0dGFjaFJlZmVyZW5jZXMgPT09IHRydWUgOiB0cnVlO1xuXG5cdFx0Y29uc3QgbW9kZUtpbmQgPSB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZDtcblx0XHRjb25zdCBtb2RlSW5mbyA9IHRoaXMuaW5wdXQuY3VycmVudE1vZGVJbmZvO1xuXHRcdGNvbnN0IGN1cnJlbnRNb2RlbFJlcXVlc3RPcHRpb25zID0gdGhpcy5nZXRTZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMoKTtcblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsUmVxdWVzdE9wdGlvbnMgPSBlZGl0ZWRNb2RlbFJlcXVlc3RPcHRpb25zPy51c2VyU2VsZWN0ZWRNb2RlbElkID09PSBjdXJyZW50TW9kZWxSZXF1ZXN0T3B0aW9ucy51c2VyU2VsZWN0ZWRNb2RlbElkXG5cdFx0XHQ/IGVkaXRlZE1vZGVsUmVxdWVzdE9wdGlvbnNcblx0XHRcdDogY3VycmVudE1vZGVsUmVxdWVzdE9wdGlvbnM7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KHRoaXMudmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdElucHV0cy5pbnB1dCwge1xuXHRcdFx0Li4uc2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zLFxuXHRcdFx0bG9jYXRpb246IHRoaXMubG9jYXRpb24sXG5cdFx0XHRsb2NhdGlvbkRhdGE6IHRoaXMuX2xvY2F0aW9uLnJlc29sdmVEYXRhPy4oKSxcblx0XHRcdHBhcnNlckNvbnRleHQ6IHsgc2VsZWN0ZWRBZ2VudDogdGhpcy5fbGFzdFNlbGVjdGVkQWdlbnQsIG1vZGU6IG1vZGVLaW5kLCBhdHRhY2htZW50Q2FwYWJpbGl0aWVzOiB0aGlzLl9sYXN0U2VsZWN0ZWRBZ2VudD8uY2FwYWJpbGl0aWVzID8/IHRoaXMuYXR0YWNobWVudENhcGFiaWxpdGllcyB9LFxuXHRcdFx0YXR0YWNoZWRDb250ZXh0OiByZXF1ZXN0SW5wdXRzLmF0dGFjaGVkQ29udGV4dC5hc0FycmF5KCksXG5cdFx0XHRyZXNvbHZlZFZhcmlhYmxlczogcmVzb2x2ZWRJbWFnZVZhcmlhYmxlcyxcblx0XHRcdG5vQ29tbWFuZERldGVjdGlvbjogb3B0aW9ucz8ubm9Db21tYW5kRGV0ZWN0aW9uLFxuXHRcdFx0aXNWb2ljZU1vZGVJbnB1dDogb3B0aW9ucz8uaXNWb2ljZU1vZGVJbnB1dCxcblx0XHRcdC4uLnRoaXMuZ2V0TW9kZVJlcXVlc3RPcHRpb25zKCksXG5cdFx0XHRtb2RlSW5mbyxcblx0XHRcdGFnZW50SWRTaWxlbnQ6IHRoaXMuX2xvY2tlZEFnZW50Py5pZCxcblx0XHRcdHF1ZXVlOiBvcHRpb25zPy5xdWV1ZSxcblx0XHRcdGluc3RydWN0aW9uQ29udGV4dDogYXV0b0F0dGFjaEVuYWJsZWQgPyB7XG5cdFx0XHRcdG1vZGVLaW5kLFxuXHRcdFx0XHRlbmFibGVkVG9vbHM6IG1vZGVLaW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgPyB0aGlzLmlucHV0LnNlbGVjdGVkVG9vbHNNb2RlbC51c2VyU2VsZWN0ZWRUb29scy5nZXQoKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZW5hYmxlZFN1YkFnZW50czogbW9kZUtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCA/IHRoaXMuaW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCkuYWdlbnRzPy5nZXQoKSA6IHVuZGVmaW5lZFxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGlmIChDaGF0U2VuZFJlc3VsdC5pc1JlamVjdGVkKHJlc3VsdCkpIHtcblx0XHRcdGlmIChyZXN1bHQubmV3U2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IG5ld01vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHJlc3VsdC5uZXdTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAobmV3TW9kZWwpIHtcblx0XHRcdFx0XHR0aGlzLnNldE1vZGVsKG5ld01vZGVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubG9nVGhpbmtpbmdTdHlsZVVzYWdlKCdzdWJtaXQnKTtcblxuXHRcdC8vIHZpc2liaWxpdHkgc3luYyBiZWZvcmUgZmlyaW5nIGV2ZW50cyB0byBoaWRlIHRoZSB3ZWxjb21lIHZpZXdcblx0XHR0aGlzLnVwZGF0ZUNoYXRWaWV3VmlzaWJpbGl0eSgpO1xuXHRcdHRoaXMuaW5wdXQuYWNjZXB0SW5wdXQob3B0aW9ucz8uc3RvcmVUb0hpc3RvcnkgPz8gaXNVc2VyUXVlcnksIG9wdGlvbnM/LnByZXNlcnZlRm9jdXMsIG9wdGlvbnM/LnByZXNlcnZlSW5wdXQpO1xuXG5cdFx0aWYgKCFvcHRpb25zLnByZXNlcnZlSW5wdXQpIHtcblx0XHRcdC8vIEEgbWFpbnRlbmFuY2UgY29tbWFuZCBpcyBub3QgdGhlIHVzZXIncyBnb2FsLlxuXHRcdFx0dGhpcy5fbWF5YmVTdGFydEdvYWxTdW1tYXJ5KHJlcXVlc3RJbnB1dHMuaW5wdXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbnQgPSBhd2FpdCBhY2NlcHRBbmRBd2FpdFNlbnRSZXF1ZXN0KHJlc3VsdCwgb3B0aW9ucy5vblJlcXVlc3RBY2NlcHRlZCk7XG5cdFx0aWYgKCFzZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFvcHRpb25zLnByZXNlcnZlSW5wdXQpIHtcblx0XHRcdC8vIE5vdCBhIHVzZXIgc3VibWlzc2lvbjsgbGlzdGVuZXJzIHdvdWxkIGNvbnN1bWUgZHJhZnQgc3RhdGUuIEFsc28gc2tpcHMgZWRpdG9yIHBpbm5pbmcuXG5cdFx0XHR0aGlzLl9vbkRpZFN1Ym1pdEFnZW50LmZpcmUoeyBhZ2VudDogc2VudC5kYXRhLmFnZW50LCBzbGFzaENvbW1hbmQ6IHNlbnQuZGF0YS5zbGFzaENvbW1hbmQgfSk7XG5cdFx0fVxuXHRcdHRoaXMuaGFuZGxlRGVsZWdhdGlvbkV4aXRJZk5lZWRlZCh0aGlzLl9sb2NrZWRBZ2VudCwgc2VudC5kYXRhLmFnZW50KTtcblxuXHRcdC8vIElmIHRoZSBzZXNzaW9uIHdhcyByZXBsYWNlZCAodW50aXRsZWQgLT4gcmVhbCBjb250cmlidXRlZCBzZXNzaW9uKSwgc3dhcCB0aGUgd2lkZ2V0J3MgbW9kZWxcblx0XHRpZiAoc2VudC5uZXdTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdGNvbnN0IG5ld01vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKHNlbnQubmV3U2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChuZXdNb2RlbCkge1xuXHRcdFx0XHR0aGlzLnNldE1vZGVsKG5ld01vZGVsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZW50LmRhdGEucmVzcG9uc2VDcmVhdGVkUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdC8vIE9ubHkgc3RhcnQgYWNjZXNzaWJpbGl0eSBwcm9ncmVzcyBvbmNlIGEgcmVhbCByZXF1ZXN0L3Jlc3BvbnNlIG1vZGVsIGV4aXN0cy5cblx0XHRcdHRoaXMuY2hhdEFjY2Vzc2liaWxpdHlTZXJ2aWNlLmFjY2VwdFJlcXVlc3Qoc3VibWl0dGVkU2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHNlbnQuZGF0YS5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2VzID0gdGhpcy52aWV3TW9kZWw/LmdldEl0ZW1zKCkuZmlsdGVyKGlzUmVzcG9uc2VWTSk7XG5cdFx0XHRcdGNvbnN0IGxhc3RSZXNwb25zZSA9IHJlc3BvbnNlcz8uW3Jlc3BvbnNlcy5sZW5ndGggLSAxXTtcblx0XHRcdFx0dGhpcy5jaGF0QWNjZXNzaWJpbGl0eVNlcnZpY2UuYWNjZXB0UmVzcG9uc2UodGhpcywgdGhpcy5jb250YWluZXIsIGxhc3RSZXNwb25zZSwgc3VibWl0dGVkU2Vzc2lvblJlc291cmNlLCBvcHRpb25zPy5pc1ZvaWNlSW5wdXQpO1xuXHRcdFx0XHRpZiAobGFzdFJlc3BvbnNlPy5yZXN1bHQ/Lm5leHRRdWVzdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IHsgcHJvbXB0LCBwYXJ0aWNpcGFudCwgY29tbWFuZCB9ID0gbGFzdFJlc3BvbnNlLnJlc3VsdC5uZXh0UXVlc3Rpb247XG5cdFx0XHRcdFx0Y29uc3QgcXVlc3Rpb24gPSBmb3JtYXRDaGF0UXVlc3Rpb24odGhpcy5jaGF0QWdlbnRTZXJ2aWNlLCB0aGlzLmxvY2F0aW9uLCBwcm9tcHQsIHBhcnRpY2lwYW50LCBjb21tYW5kKTtcblx0XHRcdFx0XHRpZiAocXVlc3Rpb24pIHtcblx0XHRcdFx0XHRcdHRoaXMuaW5wdXQuc2V0VmFsdWUocXVlc3Rpb24sIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHNlbnQuZGF0YS5yZXNwb25zZUNyZWF0ZWRQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZVNsYXNoQ29tbWFuZER1cmluZ1JlcXVlc3QoaW5wdXQ6IHN0cmluZywgc3RvcmVUb0hpc3Rvcnk6IGJvb2xlYW4sIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbDtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcikucGFyc2VDaGF0UmVxdWVzdChcblx0XHRcdHZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRpbnB1dCxcblx0XHRcdHRoaXMubG9jYXRpb24sXG5cdFx0XHR7XG5cdFx0XHRcdHNlbGVjdGVkQWdlbnQ6IHRoaXMuX2xhc3RTZWxlY3RlZEFnZW50LFxuXHRcdFx0XHRtb2RlOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdFx0YXR0YWNobWVudENhcGFiaWxpdGllczogdGhpcy5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLFxuXHRcdFx0XHRmb3JjZWRBZ2VudDogdGhpcy5fbG9ja2VkQWdlbnQ/LmlkID8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KHRoaXMuX2xvY2tlZEFnZW50LmlkKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRjb25zdCBjb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocGFydCk6IHBhcnQgaXMgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0ID0+IHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQpO1xuXHRcdGlmICghY29tbWFuZFBhcnQ/LnNsYXNoQ29tbWFuZC5leGVjdXRlRHVyaW5nUmVxdWVzdCB8fCBjb21tYW5kUGFydC5zbGFzaENvbW1hbmQuc2lsZW50ICE9PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGlzdG9yeTogSUNoYXRNZXNzYWdlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2Ygdmlld01vZGVsLm1vZGVsLmdldFJlcXVlc3RzKCkpIHtcblx0XHRcdGlmICghcmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiByZXF1ZXN0Lm1lc3NhZ2UudGV4dCB9XSB9KTtcblx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Bc3Npc3RhbnQsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IHJlcXVlc3QucmVzcG9uc2UucmVzcG9uc2UudG9TdHJpbmcoKSB9XSB9KTtcblx0XHR9XG5cblx0XHR0aGlzLmlucHV0LmFjY2VwdElucHV0KHN0b3JlVG9IaXN0b3J5LCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHRjb25zdCBwcm9tcHQgPSBwYXJzZWRSZXF1ZXN0LnRleHQuc2xpY2UoY29tbWFuZFBhcnQucmFuZ2UuZW5kRXhjbHVzaXZlKS50cmltU3RhcnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGF0U2xhc2hDb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChcblx0XHRcdFx0Y29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLmNvbW1hbmQsXG5cdFx0XHRcdHByb21wdCxcblx0XHRcdFx0UHJvZ3Jlc3MuTm9uZSxcblx0XHRcdFx0aGlzdG9yeSxcblx0XHRcdFx0dGhpcy5sb2NhdGlvbixcblx0XHRcdFx0dmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZSxcblx0XHRcdCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGNsZWFyQ2hhdE1hcmtzKHZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIFJlc29sdmUgaW1hZ2VzIGZyb20gZGlyZWN0b3J5IGF0dGFjaG1lbnRzIHRvIHNlbmQgYXMgYWRkaXRpb25hbCB2YXJpYWJsZXMuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVEaXJlY3RvcnlJbWFnZUF0dGFjaG1lbnRzKGF0dGFjaG1lbnRzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10pOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT4ge1xuXHRcdGNvbnN0IGltYWdlUHJvbWlzZXM6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdPltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IGF0dGFjaG1lbnQgb2YgYXR0YWNobWVudHMpIHtcblx0XHRcdGlmIChhdHRhY2htZW50LmtpbmQgPT09ICdkaXJlY3RvcnknICYmIFVSSS5pc1VyaShhdHRhY2htZW50LnZhbHVlKSkge1xuXHRcdFx0XHRpbWFnZVByb21pc2VzLnB1c2goXG5cdFx0XHRcdFx0dGhpcy5jaGF0QXR0YWNobWVudFJlc29sdmVTZXJ2aWNlLnJlc29sdmVEaXJlY3RvcnlJbWFnZXMoYXR0YWNobWVudC52YWx1ZSlcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaW1hZ2VQcm9taXNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IFByb21pc2UuYWxsKGltYWdlUHJvbWlzZXMpO1xuXHRcdHJldHVybiByZXNvbHZlZC5mbGF0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF90cnlFeGVjdXRlSW1tZWRpYXRlU2xhc2hDb21tYW5kKGlucHV0OiBzdHJpbmcsIHBhcnNlZElucHV0OiBJUGFyc2VkQ2hhdFJlcXVlc3QgfCB1bmRlZmluZWQpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLnZpZXdNb2RlbDtcblx0XHRpZiAoIXZpZXdNb2RlbCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gcGFyc2VkSW5wdXQgPz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcilcblx0XHRcdC5wYXJzZUNoYXRSZXF1ZXN0V2l0aFJlZmVyZW5jZXMoZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh0aGlzKSwgZ2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHNGb3JXaWRnZXQodGhpcyksIGlucHV0LCB0aGlzLmxvY2F0aW9uLCB7XG5cdFx0XHRcdHNlbGVjdGVkQWdlbnQ6IHRoaXMuX2xhc3RTZWxlY3RlZEFnZW50LFxuXHRcdFx0XHRtb2RlOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCxcblx0XHRcdFx0YXR0YWNobWVudENhcGFiaWxpdGllczogdGhpcy5hdHRhY2htZW50Q2FwYWJpbGl0aWVzLFxuXHRcdFx0XHRmb3JjZWRBZ2VudDogdGhpcy5fbG9ja2VkQWdlbnQ/LmlkID8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KHRoaXMuX2xvY2tlZEFnZW50LmlkKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vzc2lvblR5cGU6IGdldENoYXRTZXNzaW9uVHlwZSh2aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0fSk7XG5cdFx0Y29uc3QgY29tbWFuZFBhcnQgPSBnZXRJbW1lZGlhdGVTaWxlbnRTbGFzaENvbW1hbmRQYXJ0KHBhcnNlZFJlcXVlc3QpO1xuXHRcdGlmICghY29tbWFuZFBhcnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBoaXN0b3J5OiBJQ2hhdE1lc3NhZ2VbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiB2aWV3TW9kZWwubW9kZWwuZ2V0UmVxdWVzdHMoKSkge1xuXHRcdFx0aWYgKCFyZXF1ZXN0LnJlc3BvbnNlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aGlzdG9yeS5wdXNoKHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLlVzZXIsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdmFsdWU6IHJlcXVlc3QubWVzc2FnZS50ZXh0IH1dIH0pO1xuXHRcdFx0aGlzdG9yeS5wdXNoKHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudCwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogcmVxdWVzdC5yZXNwb25zZS5yZXNwb25zZS50b1N0cmluZygpIH1dIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbW1hbmQgPSBjb21tYW5kUGFydC5zbGFzaENvbW1hbmQuY29tbWFuZDtcblx0XHRhd2FpdCB0aGlzLmNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFxuXHRcdFx0Y29tbWFuZCxcblx0XHRcdGlucHV0LnNsaWNlKGNvbW1hbmRQYXJ0LnJhbmdlLmVuZEV4Y2x1c2l2ZSkudHJpbVN0YXJ0KCksXG5cdFx0XHRuZXcgUHJvZ3Jlc3MoKCkgPT4geyB9KSxcblx0XHRcdGhpc3RvcnksXG5cdFx0XHR0aGlzLmxvY2F0aW9uLFxuXHRcdFx0dmlld01vZGVsLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdENhbmNlbGxhdGlvblRva2VuLk5vbmUsXG5cdFx0KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybVBlbmRpbmdSZXF1ZXN0c0JlZm9yZVNlbmQobW9kZWw6IElDaGF0TW9kZWwsIG9wdGlvbnM6IElDaGF0QWNjZXB0SW5wdXRPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKG9wdGlvbnMucXVldWUpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1BlbmRpbmdSZXF1ZXN0cyA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpLmxlbmd0aCA+IDA7XG5cdFx0aWYgKCFoYXNQZW5kaW5nUmVxdWVzdHMpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb21wdFJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0dHlwZTogJ3F1ZXN0aW9uJyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjaGF0LnBlbmRpbmdSZXF1ZXN0cy5wcm9tcHQubWVzc2FnZScsIFwiWW91IGFscmVhZHkgaGF2ZSBwZW5kaW5nIHJlcXVlc3RzLlwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NoYXQucGVuZGluZ1JlcXVlc3RzLnByb21wdC5kZXRhaWwnLCBcIkRvIHlvdSB3YW50IHRvIGtlZXAgdGhlbSBpbiB0aGUgcXVldWUgb3IgcmVtb3ZlIHRoZW0gYmVmb3JlIHNlbmRpbmcgdGhpcyBtZXNzYWdlP1wiKSxcblx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5wZW5kaW5nUmVxdWVzdHMucHJvbXB0LmtlZXAnLCBcIktlZXAgUGVuZGluZyBSZXF1ZXN0c1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+ICdrZWVwJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0LnBlbmRpbmdSZXF1ZXN0cy5wcm9tcHQucmVtb3ZlJywgXCJSZW1vdmUgUGVuZGluZyBSZXF1ZXN0c1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+ICdyZW1vdmUnXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRjYW5jZWxCdXR0b246IHRydWVcblx0XHR9KTtcblxuXHRcdGlmICghcHJvbXB0UmVzdWx0LnJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChwcm9tcHRSZXN1bHQucmVzdWx0ID09PSAncmVtb3ZlJykge1xuXHRcdFx0Zm9yIChjb25zdCBwZW5kaW5nUmVxdWVzdCBvZiBbLi4ubW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCldKSB7XG5cdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2UucmVtb3ZlUGVuZGluZ1JlcXVlc3QobW9kZWwuc2Vzc2lvblJlc291cmNlLCBwZW5kaW5nUmVxdWVzdC5yZXF1ZXN0LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIEtlZXAgdGhlIHNlbGVjdGVkIG1vZGVsIGFuZCBpdHMgZWRpdG9yLXNjb3BlZCBjb25maWd1cmF0aW9uIHRvZ2V0aGVyIHNvXG5cdC8vIHJlc2VuZC9jb25maXJtYXRpb24gZmxvd3MgcHJlc2VydmUgY3VzdG9tIHBlci1tb2RlbCBzZXR0aW5ncy5cblx0Z2V0U2VsZWN0ZWRNb2RlbFJlcXVlc3RPcHRpb25zKCk6IFBpY2s8SUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsICd1c2VyU2VsZWN0ZWRNb2RlbElkJyB8ICd1c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb24nPiB7XG5cdFx0Y29uc3QgbW9kZWxJZCA9IHRoaXMuaW5wdXQuY3VycmVudExhbmd1YWdlTW9kZWw7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6IG1vZGVsSWQsXG5cdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb246IG1vZGVsSWQgPyB0aGlzLmlucHV0LmdldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkKSA6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHR9XG5cblx0Z2V0TW9kZVJlcXVlc3RPcHRpb25zKCk6IFBhcnRpYWw8SUNoYXRTZW5kUmVxdWVzdE9wdGlvbnM+IHtcblx0XHRpZiAoIXRoaXMuaW5wdXRQYXJ0RGlzcG9zYWJsZS52YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgY2FwdHVyZWRNb2RlSWQgPSB0aGlzLmlucHV0LmN1cnJlbnRNb2RlT2JzLmdldCgpLmlkO1xuXHRcdGNvbnN0IHVzZXJTZWxlY3RlZFRvb2xzID0gdGhpcy5pbnB1dC5zZWxlY3RlZFRvb2xzTW9kZWwudXNlclNlbGVjdGVkVG9vbHM7XG5cblx0XHRsZXQgbGFzdFRvb2xzU25hcHNob3QgPSB1c2VyU2VsZWN0ZWRUb29scy5nZXQoKTtcblxuXHRcdC8vIFdoZW4gdGhlIHdpZGdldCBoYXMgbG9hZGVkIGEgbmV3IHNlc3Npb24sIHJldHVybiBhIHNuYXBzaG90IG9mIHRoZSB0b29scyBmb3IgdGhpcyBzZXNzaW9uLlxuXHRcdC8vIE9ubHkgc3luYyB3aXRoIHRoZSB0b29scyBtb2RlbCB3aGVuIHRoaXMgc2Vzc2lvbiBpcyBzaG93biB3aXRoIHRoZSBzYW1lIG1vZGUuXG5cdFx0Y29uc3Qgc2NvcGVkVG9vbHMgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFRvb2xzU25hcHNob3Q7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fdmlld01vZGVsT2JzLnJlYWQocmVhZGVyKT8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0Y29uc3QgY3VycmVudE1vZGVJZCA9IHRoaXMuaW5wdXQuY3VycmVudE1vZGVPYnMucmVhZChyZWFkZXIpLmlkO1xuXHRcdFx0aWYgKGlzRXF1YWwoYWN0aXZlU2Vzc2lvbiwgc2Vzc2lvblJlc291cmNlKSAmJiBjdXJyZW50TW9kZUlkID09PSBjYXB0dXJlZE1vZGVJZCkge1xuXHRcdFx0XHRjb25zdCB0b29scyA9IHVzZXJTZWxlY3RlZFRvb2xzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0bGFzdFRvb2xzU25hcHNob3QgPSB0b29scztcblx0XHRcdFx0cmV0dXJuIHRvb2xzO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGxhc3RUb29sc1NuYXBzaG90O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGVJbmZvOiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlSW5mbyxcblx0XHRcdHVzZXJTZWxlY3RlZFRvb2xzOiBzY29wZWRUb29scyxcblx0XHR9O1xuXHR9XG5cblx0Z2V0Q29kZUJsb2NrSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IElDaGF0Q29kZUJsb2NrSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0LmdldENvZGVCbG9ja0luZm9zRm9yUmVzcG9uc2UocmVzcG9uc2UpO1xuXHR9XG5cblx0Z2V0Q29kZUJsb2NrSW5mb0ZvckVkaXRvcih1cmk6IFVSSSk6IElDaGF0Q29kZUJsb2NrSW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZXRDb2RlQmxvY2tJbmZvRm9yRWRpdG9yKHVyaSk7XG5cdH1cblxuXHRnZXRGaWxlVHJlZUluZm9zRm9yUmVzcG9uc2UocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdEZpbGVUcmVlSW5mb1tdIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0LmdldEZpbGVUcmVlSW5mb3NGb3JSZXNwb25zZShyZXNwb25zZSk7XG5cdH1cblxuXHRnZXRMYXN0Rm9jdXNlZEZpbGVUcmVlRm9yUmVzcG9uc2UocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdEZpbGVUcmVlSW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGlzdFdpZGdldC5nZXRMYXN0Rm9jdXNlZEZpbGVUcmVlRm9yUmVzcG9uc2UocmVzcG9uc2UpO1xuXHR9XG5cblx0Z2V0RWxlbWVudEZyb21Ob2RlKG5vZGU6IEhUTUxFbGVtZW50KTogQ2hhdFRyZWVJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5saXN0V2lkZ2V0LmdldEVsZW1lbnRGcm9tTm9kZShub2RlKTtcblx0fVxuXG5cdGZvY3VzUmVzcG9uc2VJdGVtKGxhc3RGb2N1c2VkPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMubGlzdFdpZGdldC5mb2N1c0xhc3RJdGVtKGxhc3RGb2N1c2VkKTtcblx0fVxuXG5cdHNldElucHV0UGFydE1heEhlaWdodE92ZXJyaWRlKG1heEhlaWdodDogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dFBhcnRNYXhIZWlnaHRPdmVycmlkZSA9IG1heEhlaWdodDtcblx0fVxuXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHdpZHRoID0gTWF0aC5taW4od2lkdGgsIHRoaXMudmlld09wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdtaW5pbWFsJyA/IHdpZHRoIDogOTUwKTsgLy8gbm8gbWluIHdpZHRoIG9mIGlubGluZSBjaGF0XG5cblx0XHR0aGlzLmJvZHlEaW1lbnNpb24gPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgaGVpZ2h0KTtcblxuXHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZykge1xuXHRcdFx0dGhpcy5pbmxpbmVJbnB1dFBhcnQ/LmxheW91dCh3aWR0aCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0ID0gdGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGVpZ2h0O1xuXHRcdGNvbnN0IGlucHV0TWF4SGVpZ2h0ID0gdGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhIHx8IHRoaXMubG9jYXRpb24gIT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXRcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IHRoaXMuaW5wdXRQYXJ0TWF4SGVpZ2h0T3ZlcnJpZGUgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IE1hdGgubWF4KDAsIHRoaXMuaW5wdXRQYXJ0TWF4SGVpZ2h0T3ZlcnJpZGUgLSBjaGF0U3VnZ2VzdE5leHRXaWRnZXRIZWlnaHQgLSBNSU5fTElTVF9IRUlHSFQpXG5cdFx0XHRcdDogTWF0aC5tYXgoMCwgaGVpZ2h0IC0gY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0IC0gTUlOX0xJU1RfSEVJR0hUKTtcblx0XHR0aGlzLmlucHV0UGFydC5zZXRNYXhIZWlnaHQoaW5wdXRNYXhIZWlnaHQpO1xuXHRcdHRoaXMuaW5wdXRQYXJ0LmxheW91dCh3aWR0aCk7XG5cblx0XHR0aGlzLl9sYXlvdXRMaXN0Rm9ySW5wdXRIZWlnaHQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSB3aWRnZXQncyBhdmFpbGFibGUgc3BhY2UgYWZ0ZXIgdGhlIGludHJpbnNpYyBpbnB1dCBoZWlnaHQgY2hhbmdlZC5cblx0ICogVGhlIGlucHV0IGhhcyBhbHJlYWR5IGxhaWQgaXRzZWxmIG91dCwgc28gdGhpcyBvbmx5IHJlc2l6ZXMgdGhlIGxpc3Qtc2lkZVxuXHQgKiBzdXJmYWNlcyBhbmQgbXVzdCBub3QgY2FsbCB7QGxpbmsgQ2hhdElucHV0UGFydC5sYXlvdXR9LlxuXHQgKi9cblx0bGF5b3V0Rm9ySW5wdXRIZWlnaHQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR3aWR0aCA9IE1hdGgubWluKHdpZHRoLCB0aGlzLnZpZXdPcHRpb25zLnJlbmRlclN0eWxlID09PSAnbWluaW1hbCcgPyB3aWR0aCA6IDk1MCk7XG5cdFx0dGhpcy5ib2R5RGltZW5zaW9uID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5fbGF5b3V0TGlzdEZvcklucHV0SGVpZ2h0KCk7XG5cdH1cblxuXHQvKipcblx0ICogUmUtbGF5b3V0IGp1c3QgdGhlIGxpc3QsIHdlbGNvbWUgY29udGFpbmVyLCBhbmQgbGlzdCBjb250YWluZXIgdG8gbWF0Y2hcblx0ICogdGhlIGN1cnJlbnQgaW5wdXQtcGFydCBoZWlnaHQuIENhbGxlZCBib3RoIGZyb20ge0BsaW5rIGxheW91dH0gYW5kIGZyb21cblx0ICogdGhlIGlucHV0UGFydC5oZWlnaHQgYXV0b3J1biBzbyB3ZSBuZXZlciByZS1lbnRlciBpbnB1dFBhcnQubGF5b3V0IHdoZW5cblx0ICogb25seSB0aGUgaW5wdXQgaGVpZ2h0IGNoYW5nZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9sYXlvdXRMaXN0Rm9ySW5wdXRIZWlnaHQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmJvZHlEaW1lbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGhlaWdodCwgd2lkdGggfSA9IHRoaXMuYm9keURpbWVuc2lvbjtcblx0XHRjb25zdCBjaGF0U3VnZ2VzdE5leHRXaWRnZXRIZWlnaHQgPSB0aGlzLmNoYXRTdWdnZXN0TmV4dFdpZGdldC5oZWlnaHQ7XG5cblx0XHRjb25zdCBpbnB1dEhlaWdodCA9IHRoaXMuX2lucHV0VmlzaWJsZSA/IHRoaXMuaW5wdXRQYXJ0LmhlaWdodC5nZXQoKSA6IHRoaXMuaW5wdXRQYXJ0LmVsZW1lbnQub2Zmc2V0SGVpZ2h0O1xuXHRcdGNvbnN0IHJlYWRPbmx5QmFubmVySGVpZ2h0ID0gdGhpcy5yZWFkT25seUJhbm5lcj8udmlzaWJsZSA/IENIQVRfUkVBRF9PTkxZX0JBTk5FUl9IRUlHSFQgOiAwO1xuXHRcdGNvbnN0IGxhc3RFbGVtZW50VmlzaWJsZSA9IHRoaXMubGlzdFdpZGdldC5pc1Njcm9sbGVkVG9Cb3R0b207XG5cdFx0Y29uc3QgbGFzdEl0ZW0gPSB0aGlzLmxpc3RXaWRnZXQubGFzdEl0ZW07XG5cblx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gaW5wdXRIZWlnaHQgLSByZWFkT25seUJhbm5lckhlaWdodCAtIGNoYXRTdWdnZXN0TmV4dFdpZGdldEhlaWdodCk7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LmxheW91dChjb250ZW50SGVpZ2h0LCB3aWR0aCk7XG5cblx0XHR0aGlzLndlbGNvbWVNZXNzYWdlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2NvbnRlbnRIZWlnaHR9cHhgO1xuXG5cdFx0Y29uc3QgbGFzdFJlc3BvbnNlSXNSZW5kZXJpbmcgPSBpc1Jlc3BvbnNlVk0obGFzdEl0ZW0pICYmIGxhc3RJdGVtLnJlbmRlckRhdGE7XG5cdFx0aWYgKGxhc3RFbGVtZW50VmlzaWJsZSAmJiAhdGhpcy5saXN0V2lkZ2V0LmlzQXV0b1Njcm9sbEhlbGQgJiYgKCFsYXN0UmVzcG9uc2VJc1JlbmRlcmluZyB8fCBjaGVja01vZGVPcHRpb24odGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQsIHRoaXMudmlld09wdGlvbnMuYXV0b1Njcm9sbCkpKSB7XG5cdFx0XHR0aGlzLmxpc3RXaWRnZXQuc2Nyb2xsVG9FbmQoKTtcblx0XHR9XG5cdFx0dGhpcy5saXN0Q29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2NvbnRlbnRIZWlnaHR9cHhgO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VIZWlnaHQuZmlyZShoZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhPzogeyBudW1PZk1lc3NhZ2VzOiBudW1iZXI7IG1heEhlaWdodDogbnVtYmVyOyBlbmFibGVkOiBib29sZWFuIH07XG5cblx0Ly8gQW4gYWx0ZXJuYXRpdmUgdG8gbGF5b3V0LCB0aGlzIGFsbG93cyB5b3UgdG8gc3BlY2lmeSB0aGUgbnVtYmVyIG9mIENoYXRUcmVlSXRlbXNcblx0Ly8geW91IHdhbnQgdG8gc2hvdywgYW5kIHRoZSBtYXggaGVpZ2h0IG9mIHRoZSBjb250YWluZXIuIEl0IHdpbGwgdGhlbiBsYXlvdXQgdGhlXG5cdC8vIHRyZWUgdG8gc2hvdyB0aGF0IG1hbnkgaXRlbXMuXG5cdC8vIFRPRE9AVHlsZXJMZW9uaGFyZHQ6IFRoaXMgY291bGQgdXNlIHNvbWUgcmVmYWN0b3JpbmcgdG8gbWFrZSBpdCBjbGVhciB3aGljaCBsYXlvdXQgc3RyYXRlZ3kgaXMgYmVpbmcgdXNlZFxuXHRzZXREeW5hbWljQ2hhdFRyZWVJdGVtTGF5b3V0KG51bU9mQ2hhdFRyZWVJdGVtczogbnVtYmVyLCBtYXhIZWlnaHQ6IG51bWJlcikge1xuXHRcdHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YSA9IHsgbnVtT2ZNZXNzYWdlczogbnVtT2ZDaGF0VHJlZUl0ZW1zLCBtYXhIZWlnaHQsIGVuYWJsZWQ6IHRydWUgfTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpc3RXaWRnZXQub25EaWRDaGFuZ2VJdGVtSGVpZ2h0KCgpID0+IHRoaXMubGF5b3V0RHluYW1pY0NoYXRUcmVlSXRlbU1vZGUoKSkpO1xuXG5cdFx0Y29uc3QgbXV0YWJsZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saXN0V2lkZ2V0Lm9uRGlkU2Nyb2xsKChlKSA9PiB7XG5cdFx0XHQvLyBUT0RPQFR5bGVyTGVvbmhhcmR0IHRoaXMgc2hvdWxkIHByb2JhYmx5IGp1c3QgYmUgZGlzcG9zZWQgd2hlbiB0aGlzIGlzIGRpc2FibGVkXG5cdFx0XHQvLyBhbmQgdGhlbiBzZXQgdXAgYWdhaW4gd2hlbiBpdCBpcyBlbmFibGVkIGFnYWluXG5cdFx0XHRpZiAoIXRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YT8uZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRtdXRhYmxlRGlzcG9zYWJsZS52YWx1ZSA9IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3codGhpcy5saXN0Q29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWUuc2Nyb2xsVG9wQ2hhbmdlZCB8fCBlLmhlaWdodENoYW5nZWQgfHwgZS5zY3JvbGxIZWlnaHRDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlbmRlckhlaWdodCA9IGUuaGVpZ2h0O1xuXHRcdFx0XHRjb25zdCBkaWZmID0gZS5zY3JvbGxIZWlnaHQgLSByZW5kZXJIZWlnaHQgLSBlLnNjcm9sbFRvcDtcblx0XHRcdFx0aWYgKGRpZmYgPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwb3NzaWJsZU1heEhlaWdodCA9ICh0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGE/Lm1heEhlaWdodCA/PyBtYXhIZWlnaHQpO1xuXHRcdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMuYm9keURpbWVuc2lvbj8ud2lkdGggPz8gdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0XHRcdHRoaXMuaW5wdXQubGF5b3V0KHdpZHRoKTtcblx0XHRcdFx0Y29uc3QgaW5wdXRQYXJ0SGVpZ2h0ID0gdGhpcy5pbnB1dC5oZWlnaHQuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGNoYXRTdWdnZXN0TmV4dFdpZGdldEhlaWdodCA9IHRoaXMuY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0LmhlaWdodDtcblx0XHRcdFx0Y29uc3QgbmV3SGVpZ2h0ID0gTWF0aC5taW4ocmVuZGVySGVpZ2h0ICsgZGlmZiwgcG9zc2libGVNYXhIZWlnaHQgLSBpbnB1dFBhcnRIZWlnaHQgLSBjaGF0U3VnZ2VzdE5leHRXaWRnZXRIZWlnaHQpO1xuXHRcdFx0XHR0aGlzLmxheW91dChuZXdIZWlnaHQgKyBpbnB1dFBhcnRIZWlnaHQgKyBjaGF0U3VnZ2VzdE5leHRXaWRnZXRIZWlnaHQsIHdpZHRoKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHVwZGF0ZUR5bmFtaWNDaGF0VHJlZUl0ZW1MYXlvdXQobnVtT2ZDaGF0VHJlZUl0ZW1zOiBudW1iZXIsIG1heEhlaWdodDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhID0geyBudW1PZk1lc3NhZ2VzOiBudW1PZkNoYXRUcmVlSXRlbXMsIG1heEhlaWdodCwgZW5hYmxlZDogdHJ1ZSB9O1xuXHRcdGxldCBoYXNDaGFuZ2VkID0gZmFsc2U7XG5cdFx0bGV0IGhlaWdodCA9IHRoaXMuYm9keURpbWVuc2lvbiEuaGVpZ2h0O1xuXHRcdGxldCB3aWR0aCA9IHRoaXMuYm9keURpbWVuc2lvbiEud2lkdGg7XG5cdFx0aWYgKG1heEhlaWdodCA8IHRoaXMuYm9keURpbWVuc2lvbiEuaGVpZ2h0KSB7XG5cdFx0XHRoZWlnaHQgPSBtYXhIZWlnaHQ7XG5cdFx0XHRoYXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGFpbmVyV2lkdGggPSB0aGlzLmNvbnRhaW5lci5vZmZzZXRXaWR0aDtcblx0XHRpZiAodGhpcy5ib2R5RGltZW5zaW9uPy53aWR0aCAhPT0gY29udGFpbmVyV2lkdGgpIHtcblx0XHRcdHdpZHRoID0gY29udGFpbmVyV2lkdGg7XG5cdFx0XHRoYXNDaGFuZ2VkID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGhhc0NoYW5nZWQpIHtcblx0XHRcdHRoaXMubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBpc0R5bmFtaWNDaGF0VHJlZUl0ZW1MYXlvdXRFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGE/LmVuYWJsZWQgPz8gZmFsc2U7XG5cdH1cblxuXHRzZXQgaXNEeW5hbWljQ2hhdFRyZWVJdGVtTGF5b3V0RW5hYmxlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICghdGhpcy5fZHluYW1pY01lc3NhZ2VMYXlvdXREYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YS5lbmFibGVkID0gdmFsdWU7XG5cdH1cblxuXHRsYXlvdXREeW5hbWljQ2hhdFRyZWVJdGVtTW9kZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlld01vZGVsIHx8ICF0aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGE/LmVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWR0aCA9IHRoaXMuYm9keURpbWVuc2lvbj8ud2lkdGggPz8gdGhpcy5jb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0dGhpcy5pbnB1dC5sYXlvdXQod2lkdGgpO1xuXHRcdGNvbnN0IGlucHV0SGVpZ2h0ID0gdGhpcy5pbnB1dC5oZWlnaHQuZ2V0KCk7XG5cdFx0Y29uc3QgY2hhdFN1Z2dlc3ROZXh0V2lkZ2V0SGVpZ2h0ID0gdGhpcy5jaGF0U3VnZ2VzdE5leHRXaWRnZXQuaGVpZ2h0O1xuXG5cdFx0Y29uc3QgdG90YWxNZXNzYWdlcyA9IHRoaXMudmlld01vZGVsLmdldEl0ZW1zKCk7XG5cdFx0Ly8gZ3JhYiB0aGUgbGFzdCBOIG1lc3NhZ2VzXG5cdFx0Y29uc3QgbWVzc2FnZXMgPSB0b3RhbE1lc3NhZ2VzLnNsaWNlKC10aGlzLl9keW5hbWljTWVzc2FnZUxheW91dERhdGEubnVtT2ZNZXNzYWdlcyk7XG5cblx0XHRjb25zdCBuZWVkc1JlcmVuZGVyID0gbWVzc2FnZXMuc29tZShtID0+IG0uY3VycmVudFJlbmRlcmVkSGVpZ2h0ID09PSB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSBuZWVkc1JlcmVuZGVyXG5cdFx0XHQ/IHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YS5tYXhIZWlnaHRcblx0XHRcdDogbWVzc2FnZXMucmVkdWNlKChhY2MsIG1lc3NhZ2UpID0+IGFjYyArIG1lc3NhZ2UuY3VycmVudFJlbmRlcmVkSGVpZ2h0ISwgMCk7XG5cblx0XHR0aGlzLmxheW91dChcblx0XHRcdE1hdGgubWluKFxuXHRcdFx0XHQvLyB3ZSBhZGQgYW4gYWRkaXRpb25hbCAxOHB4IGluIG9yZGVyIHRvIHNob3cgdGhhdCB0aGVyZSBpcyBzY3JvbGxhYmxlIGNvbnRlbnRcblx0XHRcdFx0aW5wdXRIZWlnaHQgKyBjaGF0U3VnZ2VzdE5leHRXaWRnZXRIZWlnaHQgKyBsaXN0SGVpZ2h0ICsgKHRvdGFsTWVzc2FnZXMubGVuZ3RoID4gMiA/IDE4IDogMCksXG5cdFx0XHRcdHRoaXMuX2R5bmFtaWNNZXNzYWdlTGF5b3V0RGF0YS5tYXhIZWlnaHRcblx0XHRcdCksXG5cdFx0XHR3aWR0aFxuXHRcdCk7XG5cblx0XHRpZiAobmVlZHNSZXJlbmRlciB8fCAhbGlzdEhlaWdodCkge1xuXHRcdFx0dGhpcy5saXN0V2lkZ2V0LnNjcm9sbFRvRW5kKCk7XG5cdFx0fVxuXHR9XG5cblx0c2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblxuXHRnZXRWaWV3U3RhdGUoKTogSUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmlucHV0LmdldEN1cnJlbnRJbnB1dFN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoYXRJbnB1dENvbnRleHQoKSB7XG5cdFx0Y29uc3QgY3VycmVudEFnZW50ID0gdGhpcy5wYXJzZWRJbnB1dC5wYXJ0cy5maW5kKHBhcnQgPT4gcGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHR0aGlzLmFnZW50SW5JbnB1dC5zZXQoISFjdXJyZW50QWdlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3dpdGNoVG9BZ2VudEJ5TmFtZShhZ2VudE5hbWU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGN1cnJlbnRBZ2VudCA9IHRoaXMuaW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCk7XG5cblx0XHQvLyBhbHJlYWR5IG9uIHRoZSB0YXJnZXQgYWdlbnRcblx0XHRpZiAoYWdlbnROYW1lID09PSBjdXJyZW50QWdlbnQubmFtZS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCB0aGUgbW9kZSBvYmplY3QgdG8gZ2V0IGl0cyBraW5kXG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLmlucHV0LmN1cnJlbnRDaGF0TW9kZXNPYnMuZ2V0KCkuZmluZE1vZGVCeU5hbWUoYWdlbnROYW1lKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGN1cnJlbnRBZ2VudC5raW5kICE9PSBhZ2VudC5raW5kKSB7XG5cdFx0XHRjb25zdCBjaGF0TW9kZUNoZWNrID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihoYW5kbGVNb2RlU3dpdGNoLCBjdXJyZW50QWdlbnQua2luZCwgYWdlbnQua2luZCwgdGhpcy52aWV3TW9kZWw/Lm1vZGVsLmdldFJlcXVlc3RzKCkubGVuZ3RoID8/IDAsIHRoaXMudmlld01vZGVsPy5tb2RlbCk7XG5cdFx0XHRpZiAoIWNoYXRNb2RlQ2hlY2spIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY2hhdE1vZGVDaGVjay5uZWVkVG9DbGVhclNlc3Npb24pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmlucHV0LnNldENoYXRNb2RlKGFnZW50LmlkKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyBgZmFsc2VgIHdoZW4gdGhlIGFnZW50IHN3aXRjaCB3YXMgY2FuY2VsbGVkIChlLmcuIHVzZXIgZGlzbWlzc2VkIHRoZVxuXHQgKiBtb2RlLXN3aXRjaCBjb25maXJtYXRpb24gZGlhbG9nKSwgc2lnbmFsbGluZyB0aGF0IHRoZSBjYWxsZXIgc2hvdWxkIGFib3J0IHRoZVxuXHQgKiBjdXJyZW50IGlucHV0IHN1Ym1pc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hcHBseVByb21wdE1ldGFkYXRhKHsgYWdlbnQsIHRvb2xzLCBtb2RlbCB9OiBQcm9tcHRIZWFkZXIsIHJlcXVlc3RJbnB1dDogSUNoYXRSZXF1ZXN0SW5wdXRPcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHRpZiAodG9vbHMgIT09IHVuZGVmaW5lZCAmJiAhYWdlbnQgJiYgdGhpcy5pbnB1dC5jdXJyZW50TW9kZUtpbmQgIT09IENoYXRNb2RlS2luZC5BZ2VudCkge1xuXHRcdFx0YWdlbnQgPSBDaGF0TW9kZS5BZ2VudC5uYW1lLmdldCgpO1xuXHRcdH1cblx0XHQvLyBzd2l0Y2ggdG8gYXBwcm9wcmlhdGUgYWdlbnQgaWYgbmVlZGVkXG5cdFx0aWYgKGFnZW50KSB7XG5cdFx0XHRjb25zdCBzd2l0Y2hlZCA9IGF3YWl0IHRoaXMuX3N3aXRjaFRvQWdlbnRCeU5hbWUoYWdlbnQpO1xuXHRcdFx0aWYgKCFzd2l0Y2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gaWYgbm90IHRvb2xzIHRvIGVuYWJsZSBhcmUgcHJlc2VudCwgd2UgYXJlIGRvbmVcblx0XHRpZiAodG9vbHMgIT09IHVuZGVmaW5lZCAmJiB0aGlzLmlucHV0LmN1cnJlbnRNb2RlS2luZCA9PT0gQ2hhdE1vZGVLaW5kLkFnZW50KSB7XG5cdFx0XHRjb25zdCBlbmFibGVtZW50TWFwID0gdGhpcy50b29sc1NlcnZpY2UudG9Ub29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAodG9vbHMsIHRoaXMuaW5wdXQuc2VsZWN0ZWRMYW5ndWFnZU1vZGVsLmdldCgpPy5tZXRhZGF0YSk7XG5cdFx0XHR0aGlzLmlucHV0LnNlbGVjdGVkVG9vbHNNb2RlbC5zZXQoZW5hYmxlbWVudE1hcCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmlucHV0LnJlcXVlc3RNb2RlbEJ5UXVhbGlmaWVkTmFtZShtb2RlbCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5saXN0V2lkZ2V0LmRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBsYXlvdXRDaGF0V2lkZ2V0Rm9ySW5wdXRIZWlnaHQod2lkZ2V0OiBQaWNrPENoYXRXaWRnZXQsICdzZXRJbnB1dFBhcnRNYXhIZWlnaHRPdmVycmlkZScgfCAnbGF5b3V0Rm9ySW5wdXRIZWlnaHQnPiwgaW5wdXRNYXhIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCwgaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0d2lkZ2V0LnNldElucHV0UGFydE1heEhlaWdodE92ZXJyaWRlKGlucHV0TWF4SGVpZ2h0KTtcblx0d2lkZ2V0LmxheW91dEZvcklucHV0SGVpZ2h0KGhlaWdodCwgd2lkdGgpO1xufVxuXG5jb25zdCBNSU5fTElTVF9IRUlHSFQgPSA1MDtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUV2QixTQUFTLG1CQUFtQixlQUFlO0FBQzNDLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQTBCLHNCQUFzQjtBQUNoRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFlBQVksaUJBQThCLG1CQUFtQix5QkFBeUI7QUFDL0YsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsY0FBYztBQUN2QixTQUFTLFNBQVMsU0FBUyxxQkFBcUIsdUJBQXVCO0FBQ3ZFLFNBQVMsUUFBUSxlQUFlO0FBQ2hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLGNBQWMsZ0JBQWdCLGdCQUFnQjtBQUV2RCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxT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
