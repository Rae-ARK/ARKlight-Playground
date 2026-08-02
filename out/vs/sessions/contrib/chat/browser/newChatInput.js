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
import "./media/chatInput.css";
import "./media/chatInputMobile.css";
import * as dom from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Gesture, EventType as TouchEventType } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { CodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../editor/common/config/fontInfo.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { PlaceholderTextContribution } from "../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { AccessibilityVerbositySettingId } from "../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../../../workbench/contrib/accessibility/common/accessibilityCommands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize } from "../../../../nls.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { ContextMenuController } from "../../../../editor/contrib/contextmenu/browser/contextmenu.js";
import { getSimpleEditorOptions } from "../../../../workbench/contrib/codeEditor/browser/simpleEditorOptions.js";
import { NewChatContextAttachments } from "./newChatContextAttachments.js";
import { INewChatVoiceTargetService, NEW_CHAT_VOICE_SENTINEL, NewChatVoiceController } from "./newChatVoice.js";
import { MobileSessionTypePicker } from "./mobile/mobileSessionTypePicker.js";
import { installMobileChipLaneScroll } from "../../../browser/parts/mobile/mobileChipLaneScroll.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { Menus } from "../../../browser/menus.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { defaultButtonStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { getDictationHoverMarkdown } from "../../../../workbench/contrib/chat/browser/speechToText/micButtonHovers.js";
import { addMicButtonContextMenuListener, getDictationContextMenuActions } from "../../../../workbench/contrib/chat/browser/speechToText/micButtonMenuActions.js";
import { SlashCommandHandler } from "./slashCommands.js";
import { VariableCompletionHandler } from "./variableCompletions.js";
import { SessionReferenceCompletionHandler } from "./sessionReferenceCompletions.js";
import { AgentHostInputCompletionHandler } from "./agentHostInputCompletions.js";
import { IChatRequestVariableEntry, isExplicitFileOrImageVariableEntry, toFileVariableEntry } from "../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js";
import { IChatSessionsService } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../workbench/contrib/chat/common/constants.js";
import { ChatHistoryNavigator } from "../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js";
import { registerAndCreateHistoryNavigationContext } from "../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { autorun, constObservable, derived, observableFromEvent, observableValue } from "../../../../base/common/observable.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ChatInputNotificationWidget } from "../../../../workbench/contrib/chat/browser/widget/input/chatInputNotificationWidget.js";
import { IChatSubmitRequestHandlerService } from "../../../../workbench/contrib/chat/browser/chatSubmitRequestHandlerService.js";
import { INewChatModelPickerService, NewChatModelPickerService } from "./newChatModelPicker.js";
import { ModelPicker, ModelPickerActionViewItem } from "./modelPicker.js";
import { ISessionModelSelectionModel, SessionModelSelectionModel } from "./sessionModelSelectionModel.js";
import { ISessionContext, SessionContext } from "../../../services/sessions/browser/sessionContext.js";
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from "./sessionsChatHistory.js";
import { IChatStatusItemService } from "../../../../workbench/contrib/chat/browser/chatStatus/chatStatusItemService.js";
import { handleTerminalCommandPaste, isTerminalCommandInput } from "../../../../workbench/contrib/chat/browser/chatTerminalCommandPaste.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../../../../workbench/contrib/chat/browser/speechToText/chatSpeechToTextService.js";
import { setupDictationMicGlow } from "../../../../workbench/contrib/chat/browser/speechToText/dictationMicGlow.js";
import { IDictationOnboardingService } from "../../../../workbench/contrib/chat/browser/speechToText/dictationOnboarding.js";
import { ChatVoiceInputModeAction, VoiceInputModeActionViewItem } from "../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputModeActionViewItem.js";
import { IVoiceInputModeService } from "../../../../workbench/contrib/chat/browser/voiceInputMode/voiceInputMode.js";
import { toAction } from "../../../../base/common/actions.js";
import { runDictationShortcut } from "../../../../workbench/contrib/chat/browser/actions/chatSpeechToTextActions.js";
import { notifyDictationSubmitted } from "../../../../workbench/contrib/chat/browser/speechToText/dictationSession.js";
import { combineVoiceInput } from "../../../../workbench/contrib/chat/browser/voiceClient/voiceInputUtils.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { DictationDownloadRing, getDictationDownloadHoverMarkdown, getDictationPreparingLabel } from "../../../../workbench/contrib/chat/browser/speechToText/dictationDownloadRing.js";
import { IVoiceSessionController } from "../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { ChatPetWidget } from "../../../../workbench/contrib/chat/browser/widget/chatPetWidget.js";
import { IVoiceModeOnboardingService } from "../../../../workbench/contrib/agentsVoice/browser/voiceModeOnboarding.js";
const OPEN_OTEL_SETTINGS_COMMAND = "github.copilot.chat.otel.openSettings";
const OTEL_STATUS_COMMAND = "github.copilot.chat.otel.statusActive";
const OTEL_STATUS_ENTRY_ID = "copilot.otelStatus";
const OTEL_DOCS_URL = "https://code.visualstudio.com/docs/copilot/guides/monitoring-agents";
const STORAGE_KEY_DRAFT_STATE = "sessions.draftState";
const MIN_EDITOR_HEIGHT = 50;
const MAX_EDITOR_HEIGHT = 200;
const NEW_CHAT_INPUT_FONT_FAMILY = "system-ui, -apple-system, sans-serif";
const SessionsChatInputHasDictationFocus = new RawContextKey("sessionsChatInputHasDictationFocus", false, localize("sessionsChatInputHasDictationFocus", "True when focus is in an Agents window chat composer that supports dictation."));
const TOGGLE_DICTATION_COMMAND_ID = "sessions.action.chat.toggleDictation";
let activeDictationComposer;
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: TOGGLE_DICTATION_COMMAND_ID,
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: ContextKeyExpr.and(
    SessionsChatInputHasDictationFocus,
    ContextKeyExpr.has(ChatContextKeys.speechToTextConfigured.key)
  ),
  primary: KeyMod.CtrlCmd | KeyCode.KeyI,
  handler: () => activeDictationComposer?.toggleDictation()
});
KeybindingsRegistry.registerKeybindingRule({
  id: "agentsVoice.startVoiceInChat",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  when: ContextKeyExpr.and(
    SessionsChatInputHasDictationFocus,
    ContextKeyExpr.equals("config.agents.voice.enabled", true)
  ),
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space
});
let NewChatInputStatusActionViewItem = class extends MenuEntryActionViewItem {
  constructor(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService, chatStatusItemService, hoverService, commandService) {
    super(action, options, keybindingService, notificationService, contextKeyService, themeService, contextMenuService, accessibilityService);
    this.chatStatusItemService = chatStatusItemService;
    this.hoverService = hoverService;
    this.commandService = commandService;
    this.hoverContentDisposables = this._register(new MutableDisposable());
  }
  render(container) {
    super.render(container);
    if (this._commandAction.id !== OTEL_STATUS_COMMAND) {
      return;
    }
    this._register(this.chatStatusItemService.onDidChange((e) => {
      if (e.entry.id === OTEL_STATUS_ENTRY_ID) {
        this.updateTooltip();
      }
    }));
  }
  async onClick(event) {
    if (this._commandAction.id === OTEL_STATUS_COMMAND && this.element) {
      event.preventDefault();
      event.stopPropagation();
      this.hoverService.showManagedHover(this.element);
      return;
    }
    await super.onClick(event);
  }
  getHoverContents() {
    if (this._commandAction.id === OTEL_STATUS_COMMAND) {
      return { element: () => this._renderStatusHover() };
    }
    return super.getHoverContents();
  }
  getTooltip() {
    if (this._commandAction.id === OTEL_STATUS_COMMAND) {
      const tooltip = this._getStatusEntryTooltip();
      if (tooltip) {
        return tooltip;
      }
    }
    return super.getTooltip();
  }
  _getStatusEntryTooltip() {
    for (const entry of this.chatStatusItemService.getEntries()) {
      if (entry.id === OTEL_STATUS_ENTRY_ID) {
        return entry.tooltip;
      }
    }
    return void 0;
  }
  _renderStatusHover() {
    const store = new DisposableStore();
    this.hoverContentDisposables.value = store;
    const root = dom.$(".new-chat-input-status-hover");
    root.appendChild(dom.$(".new-chat-input-status-hover-title", void 0, localize("newChatInput.status.otel.title", "Monitoring with OpenTelemetry enabled")));
    root.appendChild(dom.$(".new-chat-input-status-hover-detail", void 0, this._getStatusEntryTooltip() ?? super.getTooltip()));
    const actions = root.appendChild(dom.$(".new-chat-input-status-hover-actions"));
    const learnMoreButton = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
    learnMoreButton.label = localize("newChatInput.status.otel.learnMore", "Learn More");
    store.add(learnMoreButton.onDidClick(() => {
      void this.commandService.executeCommand("vscode.open", URI.parse(OTEL_DOCS_URL));
      this.hoverService.hideHover(true);
    }));
    const manageButton = store.add(new Button(actions, { ...defaultButtonStyles, secondary: true }));
    manageButton.label = localize("newChatInput.status.otel.manage", "Manage");
    store.add(manageButton.onDidClick(() => {
      void this.commandService.executeCommand(OPEN_OTEL_SETTINGS_COMMAND);
      this.hoverService.hideHover(true);
    }));
    return root;
  }
};
NewChatInputStatusActionViewItem = __decorateClass([
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IAccessibilityService),
  __decorateParam(8, IChatStatusItemService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ICommandService)
], NewChatInputStatusActionViewItem);
const RANDOM_PLACEHOLDERS = [
  localize("sessionsChatInput.placeholder.whatAreYouBuilding", "What are you building?"),
  localize("sessionsChatInput.placeholder.whatWillYouShipToday", "What will you ship today?"),
  localize("sessionsChatInput.placeholder.describeWhatYouWantToBuild", "Describe what you want to build"),
  localize("sessionsChatInput.placeholder.whatsYourNextMilestone", "What's your next milestone?"),
  localize("sessionsChatInput.placeholder.whatAreYouTryingToAchieve", "What are you trying to achieve?"),
  localize("sessionsChatInput.placeholder.pitchYourIdea", "Pitch your idea"),
  localize("sessionsChatInput.placeholder.whatsTheGoal", "What's the goal?"),
  localize("sessionsChatInput.placeholder.whatWillYouCreate", "What will you create?"),
  localize("sessionsChatInput.placeholder.whatFeatureAreYouDreamingUp", "What feature are you dreaming up?"),
  localize("sessionsChatInput.placeholder.describeTheOutcome", "Describe the outcome you want"),
  localize("sessionsChatInput.placeholder.whatProblemAreYouSolving", "What problem are you solving?"),
  localize("sessionsChatInput.placeholder.whatsNextOnYourRoadmap", "What's next on your roadmap?"),
  localize("sessionsChatInput.placeholder.whatWouldYouLikeToAutomate", "What would you like to automate?"),
  localize("sessionsChatInput.placeholder.whatWillYouLaunch", "What will you launch?"),
  localize("sessionsChatInput.placeholder.describeYourMission", "Describe your mission")
];
let lastPlaceholderIndex = -1;
function getRandomChatInputPlaceholder() {
  let index = Math.floor(Math.random() * RANDOM_PLACEHOLDERS.length);
  if (index === lastPlaceholderIndex) {
    index = (index + 1) % RANDOM_PLACEHOLDERS.length;
  }
  lastPlaceholderIndex = index;
  return RANDOM_PLACEHOLDERS[index];
}
let NewChatInputWidget = class extends Disposable {
  constructor(options, instantiationService, modelService, configurationService, contextKeyService, logService, hoverService, storageService, dialogService, keybindingService, layoutService, chatSessionsService, chatSpeechToTextService, dictationOnboardingService, chatSubmitRequestHandlerService, contextMenuService, commandService, voiceSessionController, voiceInputModeService, accessibilityService, voiceModeOnboardingService, newChatVoiceTargetService, themeService) {
    super();
    this.options = options;
    this.instantiationService = instantiationService;
    this.modelService = modelService;
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.logService = logService;
    this.hoverService = hoverService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.keybindingService = keybindingService;
    this.layoutService = layoutService;
    this.chatSessionsService = chatSessionsService;
    this.chatSpeechToTextService = chatSpeechToTextService;
    this.dictationOnboardingService = dictationOnboardingService;
    this.chatSubmitRequestHandlerService = chatSubmitRequestHandlerService;
    this.contextMenuService = contextMenuService;
    this.commandService = commandService;
    this.voiceSessionController = voiceSessionController;
    this.voiceInputModeService = voiceInputModeService;
    this.accessibilityService = accessibilityService;
    this.voiceModeOnboardingService = voiceModeOnboardingService;
    this.newChatVoiceTargetService = newChatVoiceTargetService;
    this.themeService = themeService;
    // IHistoryNavigationWidget
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._sending = false;
    this._loadingDelayDisposable = this._register(new MutableDisposable());
    this._newChatModelPickerService = new NewChatModelPickerService();
    this._compactModelPicker = observableValue(this, false);
    // Input state
    this._draftState = {
      inputText: "",
      attachments: []
    };
    this._sessionModelSelectionModel = this._register(this.instantiationService.createInstance(SessionModelSelectionModel, this.options.session));
    this._canSendRequest = derived(this, (reader) => {
      if (this.options.canSubmitWithoutSession?.read(reader)) {
        return true;
      }
      const modelSelection = this._sessionModelSelectionModel.state.read(reader);
      return this.options.canSendRequest.read(reader) && modelSelection.hasSelectableModel && !modelSelection.pendingSelection;
    });
    this._scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
      [INewChatModelPickerService, this._newChatModelPickerService],
      [ISessionContext, new SessionContext(this.options.session)],
      [ISessionModelSelectionModel, this._sessionModelSelectionModel]
    )));
    this._history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, ChatAgentLocation.Chat));
    if (this.options.historyKey) {
      this._register(autorun((reader) => this._setHistoryKey(this.options.historyKey?.read(reader))));
      this._register(this.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
          this._setHistoryKey(this.options.historyKey?.get());
        }
      }));
    }
    this._contextAttachments = this._register(this.instantiationService.createInstance(NewChatContextAttachments));
    this.sessionTypePicker = this._register(this.instantiationService.createInstance(MobileSessionTypePicker, this.options.session, void 0));
    this._register(this._contextAttachments.onDidChangeContext(() => {
      this._updateDraftState();
      this._updateSendButtonState();
      this.focus();
    }));
    this._register(autorun((reader) => {
      this._canSendRequest.read(reader);
      this.options.hasAdditionalSendContent?.read(reader);
      const isLoading = this.options.loading.read(reader);
      this._loadingSpinner?.classList.toggle("visible", isLoading);
      this._updateSendButtonState();
    }));
  }
  get element() {
    return this._editorContainer;
  }
  /** The underlying input editor. Exposed for component fixtures. */
  get inputEditor() {
    return this._editor;
  }
  /** The current model-selection state. Exposed so host widgets can react to model changes. */
  get selectedModelState() {
    return this._sessionModelSelectionModel.state;
  }
  /** Opens the model picker dropdown. */
  openModelPicker() {
    this._newChatModelPickerService.openModelPicker();
  }
  _setHistoryKey(historyKey) {
    this._history.setHistoryKey(this.configurationService.getValue(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false ? historyKey : void 0);
  }
  // --- Rendering ---
  render(parent, root) {
    const chatInputContainer = dom.append(parent, dom.$(".new-chat-input-container"));
    const editorOverflowWidgetsDomNode = dom.append(root, dom.$(".sessions-chat-editor-overflow.monaco-editor"));
    editorOverflowWidgetsDomNode.classList.add("hideSuggestTextIcons");
    this._register({ dispose: () => editorOverflowWidgetsDomNode.remove() });
    const notificationContainer = dom.append(chatInputContainer, dom.$(".chat-input-notification-container"));
    const notificationWidget = this._register(this.instantiationService.createInstance(
      ChatInputNotificationWidget,
      {
        modelTargetChatSessionType: this.sessionTypePicker.modelTargetChatSessionType,
        openModelPicker: () => this._newChatModelPickerService.openModelPicker(),
        switchToModel: (modelIdentifier) => this._newChatModelPickerService.switchToModel(modelIdentifier)
      }
    ));
    notificationContainer.appendChild(notificationWidget.domNode);
    const voiceOnboardingContainer = dom.append(chatInputContainer, dom.$(".voice-mode-onboarding-container"));
    const onDidChangeInputOnboardingVisible = () => this.options.onDidChangeInputOnboardingVisible?.(
      this.voiceModeOnboardingService.isVisible || this.dictationOnboardingService.isVisible
    );
    const tipContainer = this.options.getInputOnboardingTipContainer?.();
    this._register(this.voiceModeOnboardingService.registerHost(voiceOnboardingContainer, chatInputContainer, () => this.focus(), tipContainer, onDidChangeInputOnboardingVisible));
    const dictationOnboardingContainer = dom.append(chatInputContainer, dom.$(".dictation-onboarding-container"));
    this._register(this.dictationOnboardingService.registerHost(dictationOnboardingContainer, chatInputContainer, tipContainer, onDidChangeInputOnboardingVisible));
    const inputAreaWrapper = dom.append(chatInputContainer, dom.$(".new-chat-input-area-wrapper"));
    const inputArea = dom.append(inputAreaWrapper, dom.$(".new-chat-input-area"));
    const attachRow = dom.append(inputArea, dom.$(".sessions-chat-attach-row"));
    const attachedContextContainer = dom.append(attachRow, dom.$(".sessions-chat-attached-context"));
    this._contextAttachments.renderAttachedContext(attachedContextContainer);
    this._contextAttachments.registerDropTarget(root);
    this._contextAttachments.registerPasteHandler(inputArea);
    this._createEditor(inputArea, editorOverflowWidgetsDomNode);
    const inputHasContent = observableFromEvent(this, this._editor.onDidChangeModelContent, () => this._editor.getValue().length > 0);
    this._register(this.instantiationService.createInstance(ChatPetWidget, inputAreaWrapper, inputArea, constObservable(void 0), inputHasContent, constObservable(true), this._editor.onDidChangeModelContent));
    this._createInputToolbar(inputArea);
    const newChatBottomContainer = dom.append(parent, dom.$(".new-chat-bottom-container"));
    const newChatControlsContainer = dom.append(newChatBottomContainer, dom.$(".new-chat-controls-container"));
    if (this.options.renderSessionTypePickerInControls !== false) {
      const sessionTypePickerHost = dom.append(newChatControlsContainer, dom.$(".new-chat-session-type-picker-host"));
      this.sessionTypePicker.render(sessionTypePickerHost);
    }
    this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, dom.append(newChatControlsContainer, dom.$("")), Menus.NewSessionControl, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide
    }));
    const repoConfigContainer = dom.append(newChatBottomContainer, dom.$(".new-chat-repo-config-container"));
    this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, repoConfigContainer, Menus.NewSessionRepositoryConfig, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide
    }));
    this._register(installMobileChipLaneScroll(newChatBottomContainer, this.layoutService));
    const statusContainer = dom.append(repoConfigContainer, dom.$(".new-chat-status-toolbar"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, statusContainer, MenuId.ChatInputStatus, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      toolbarOptions: { primaryGroup: () => true },
      actionViewItemProvider: (action, options) => {
        if (action.id === OTEL_STATUS_COMMAND && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(NewChatInputStatusActionViewItem, action, options);
        }
        return void 0;
      }
    }));
    this._restoreState();
    this._register(dom.addDisposableListener(chatInputContainer, "animationend", () => {
      this._editor?.layout();
    }, { once: true }));
  }
  _updateInputLoadingState() {
    const loading = this._sending;
    if (loading) {
      if (!this._loadingDelayDisposable.value) {
        const timer = setTimeout(() => {
          this._loadingDelayDisposable.clear();
          if (this._sending) {
            this._loadingSpinner?.classList.add("visible");
          }
        }, 500);
        this._loadingDelayDisposable.value = toDisposable(() => clearTimeout(timer));
      }
    } else {
      this._loadingDelayDisposable.clear();
      this._loadingSpinner?.classList.remove("visible");
    }
  }
  // --- Editor ---
  _getAriaLabel() {
    const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.SessionsChat);
    if (verbose) {
      const kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      return kbLabel ? localize("chatInput.accessibilityHelp", "Chat input. Press Enter to send out the request. Use {0} for Chat Accessibility Help.", kbLabel) : localize("chatInput.accessibilityHelpNoKb", "Chat input. Press Enter to send out the request. Use the Chat Accessibility Help command for more information.");
    }
    return localize("chatInput", "Chat input");
  }
  _getTerminalCommandPrefix() {
    const session = this.options.session.get();
    return session ? this.chatSessionsService.getCapabilitiesForSessionType(getChatSessionType(session.resource))?.terminalCommandPrefix : void 0;
  }
  _handleTerminalCommandPaste(e) {
    handleTerminalCommandPaste(e, this._editor, this._getTerminalCommandPrefix(), this.dialogService, this.storageService);
  }
  _createEditor(container, overflowWidgetsDomNode) {
    const editorContainer = this._editorContainer = dom.append(container, dom.$(".sessions-chat-editor"));
    const minHeight = this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT;
    editorContainer.style.height = `${minHeight}px`;
    const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(container));
    const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
    this._historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
    this._historyNavigationForwardsEnablement = historyNavigationForwardsEnablement;
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));
    const uri = URI.from({ scheme: "sessions-chat", path: `input-${Date.now()}` });
    const textModel = this._register(this.modelService.createModel("", null, uri, true));
    const editorOptions = {
      ...getSimpleEditorOptions(this.configurationService),
      readOnly: false,
      ariaLabel: this._getAriaLabel(),
      placeholder: this.options.placeholder ?? getRandomChatInputPlaceholder(),
      fontFamily: NEW_CHAT_INPUT_FONT_FAMILY,
      fontSize: 13,
      lineHeight: 20,
      cursorWidth: 1,
      padding: { top: 8, bottom: 2 },
      wrappingStrategy: "advanced",
      stickyScroll: { enabled: false },
      renderWhitespace: "none",
      overflowWidgetsDomNode,
      suggest: {
        showIcons: true,
        showSnippets: false,
        showWords: true,
        showStatusBar: false,
        insertMode: "insert",
        fitWidthToDetails: true
      }
    };
    const widgetOptions = {
      isSimpleWidget: true,
      contributions: EditorExtensionsRegistry.getSomeEditorContributions([
        ContextMenuController.ID,
        SuggestController.ID,
        SnippetController2.ID,
        PlaceholderTextContribution.ID
      ])
    };
    this._editor = this._register(scopedInstantiationService.createInstance(
      CodeEditorWidget,
      editorContainer,
      editorOptions,
      widgetOptions
    ));
    this._editor.setModel(textModel);
    this._register(autorun((reader) => {
      this.options.session.read(reader);
      this._updateEditorFontFamily();
    }));
    this._register(dom.addDisposableListener(this._editorContainer, dom.EventType.PASTE, (e) => this._handleTerminalCommandPaste(e), true));
    SuggestController.get(this._editor)?.forceRenderingAbove();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.SessionsChat)) {
        this._editor.updateOptions({ ariaLabel: this._getAriaLabel() });
      }
    }));
    const dictationFocusKey = SessionsChatInputHasDictationFocus.bindTo(inputScopedContextKeyService);
    this._register(this._editor.onDidFocusEditorWidget(() => {
      dictationFocusKey.set(true);
      activeDictationComposer = this;
      this._onDidFocus.fire();
    }));
    this._register(this._editor.onDidBlurEditorWidget(() => {
      dictationFocusKey.set(false);
      if (activeDictationComposer === this) {
        activeDictationComposer = void 0;
      }
      this._onDidBlur.fire();
    }));
    this._register(toDisposable(() => {
      if (activeDictationComposer === this) {
        activeDictationComposer = void 0;
      }
    }));
    this._register(this._editor.onKeyDown((e) => {
      if (e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (this._editor.contextKeyService.getContextKeyValue("suggestWidgetVisible")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        this._send();
      }
      if (this.options.supportsBackground && e.keyCode === KeyCode.Enter && !e.shiftKey && !e.ctrlKey && e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        this._send(true);
      }
      if (e.equals(KeyMod.CtrlCmd | KeyCode.Slash)) {
        e.preventDefault();
        e.stopPropagation();
        this._contextAttachments.showPicker(this.options.getContextFolderUri());
      }
    }));
    const updateHistoryNavigationEnablement = () => {
      const model = this._editor.getModel();
      const position = this._editor.getPosition();
      if (!model || !position) {
        return;
      }
      this._historyNavigationBackwardsEnablement.set(position.lineNumber === 1 && position.column === 1);
      this._historyNavigationForwardsEnablement.set(position.lineNumber === model.getLineCount() && position.column === model.getLineMaxColumn(position.lineNumber));
    };
    this._register(this._editor.onDidChangeCursorPosition(() => updateHistoryNavigationEnablement()));
    updateHistoryNavigationEnablement();
    let previousHeight = -1;
    this._register(this._editor.onDidContentSizeChange((e) => {
      if (!e.contentHeightChanged) {
        return;
      }
      const contentHeight = this._editor.getContentHeight();
      const clampedHeight = Math.min(MAX_EDITOR_HEIGHT, Math.max(this.options.minEditorHeight ?? MIN_EDITOR_HEIGHT, contentHeight));
      if (clampedHeight === previousHeight) {
        return;
      }
      previousHeight = clampedHeight;
      this._editorContainer.style.height = `${clampedHeight}px`;
      this._editor.layout();
    }));
    this._register(this._scopedInstantiationService.createInstance(SlashCommandHandler, this._editor));
    this._register(this.instantiationService.createInstance(
      VariableCompletionHandler,
      this._editor,
      this._contextAttachments,
      () => this.options.getContextFolderUri()
    ));
    this._register(this.instantiationService.createInstance(
      SessionReferenceCompletionHandler,
      this._editor,
      this._contextAttachments
    ));
    this._agentHostInputCompletionHandler = this._register(this._scopedInstantiationService.createInstance(
      AgentHostInputCompletionHandler,
      this._editor,
      this._contextAttachments
    ));
    this._register(this._editor.onDidChangeModelContent(() => {
      this._updateDraftState();
      this._updateSendButtonState();
      this._updateEditorFontFamily();
    }));
  }
  /**
   * The input is monospace only while a terminal command is being composed:
   * the attached session advertises a prefix AND the current input begins with
   * it. Otherwise it uses the normal new-chat input font.
   */
  _updateEditorFontFamily() {
    const isCommand = isTerminalCommandInput(this._editor.getModel()?.getLineContent(1) || "", this._getTerminalCommandPrefix());
    this._editor.updateOptions({ fontFamily: isCommand ? EDITOR_FONT_DEFAULTS.fontFamily : NEW_CHAT_INPUT_FONT_FAMILY });
  }
  _createAttachButton(container) {
    const attachButton = dom.append(container, dom.$(".sessions-chat-attach-button"));
    const attachButtonLabel = localize("addContext", "Add Context...");
    attachButton.tabIndex = 0;
    attachButton.role = "button";
    attachButton.ariaLabel = attachButtonLabel;
    this._register(this.hoverService.setupDelayedHover(attachButton, {
      content: attachButtonLabel,
      position: { hoverPosition: HoverPosition.BELOW },
      appearance: { showPointer: true }
    }));
    dom.append(attachButton, renderIcon(Codicon.addCompact));
    this._register(dom.addDisposableListener(attachButton, dom.EventType.CLICK, () => {
      this._contextAttachments.showPicker(this.options.getContextFolderUri());
    }));
  }
  _createInputToolbar(container) {
    const toolbar = dom.append(container, dom.$(".sessions-chat-toolbar"));
    this._createAttachButton(toolbar);
    const configContainer = dom.append(toolbar, dom.$(".sessions-chat-config-toolbar"));
    this._register(this._scopedInstantiationService.createInstance(MenuWorkbenchToolBar, configContainer, Menus.NewSessionConfig, {
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      actionViewItemProvider: (action) => {
        if (action.id === "sessions.modelPicker") {
          const picker = this._scopedInstantiationService.createInstance(ModelPicker, this._compactModelPicker);
          return new ModelPickerActionViewItem(picker);
        }
        return void 0;
      }
    }));
    dom.append(toolbar, dom.$(".sessions-chat-toolbar-spacer"));
    try {
      this._createSpeechToTextButton(toolbar);
    } catch (error) {
      this.logService.error("Failed to create new-session dictation control:", error);
    }
    const voiceContainer = dom.append(toolbar, dom.$(".sessions-chat-voice-toolbar"));
    try {
      this._register(this.instantiationService.createInstance(NewChatVoiceController, {
        toolbarContainer: voiceContainer,
        inputContainer: container,
        composer: this
      }));
    } catch (error) {
      this.logService.error("Failed to create new-session voice controls:", error);
    }
    try {
      this._createVoiceInputModePill(toolbar, container);
    } catch (error) {
      this.logService.error("Failed to create new-session voice input mode pill:", error);
    }
    this._loadingSpinner = dom.append(toolbar, dom.$(".sessions-chat-loading-spinner"));
    const loadingIcon = dom.append(this._loadingSpinner, renderIcon(ThemeIcon.modify(Codicon.loading, "spin")));
    loadingIcon.setAttribute("aria-hidden", "true");
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this._loadingSpinner, localize("loading", "Loading...")));
    this._loadingSpinner.classList.toggle("visible", this.options.loading.get());
    const sendButtonContainer = dom.append(toolbar, dom.$(".sessions-chat-send-button"));
    const sendButton = this._sendButton = this._register(new Button(sendButtonContainer, {
      secondary: true,
      title: this.options.supportsBackground ? localize("sendWithBackgroundHint", "Send (Alt-click to start in the background)") : localize("send", "Send"),
      ariaLabel: localize("send", "Send")
    }));
    sendButton.icon = Codicon.arrowUpCompact;
    this._register(sendButton.onDidClick((e) => this._send(!!this.options.supportsBackground && !!e?.altKey)));
  }
  _createVoiceInputModePill(toolbar, inputContainer) {
    const pillContainer = dom.append(toolbar, dom.$(".sessions-chat-voice-input-mode"));
    const isVoiceInputActive = derived(this, (reader) => isEqual(this.newChatVoiceTargetService.currentVoiceInputResource.read(reader), NEW_CHAT_VOICE_SENTINEL));
    const action = toAction({
      id: ChatVoiceInputModeAction.ID,
      label: localize("voiceInputMode", "Voice Input Mode"),
      run: () => {
      }
    });
    const pill = this._register(this._scopedInstantiationService.createInstance(VoiceInputModeActionViewItem, action, {
      // Dictation must target this composer's editor, not the last focused
      // chat widget (this composer isn't an `IChatWidget`).
      toggleDictation: () => {
        void this.toggleDictation();
      },
      isActive: isVoiceInputActive
    }));
    pill.render(pillContainer);
    this._register(autorun((reader) => {
      const dict = this.voiceInputModeService.dictationAvailable.read(reader);
      const voice = this.voiceInputModeService.voiceAvailable.read(reader);
      const handsFree = this.voiceInputModeService.handsFree.read(reader);
      const connected = this.voiceSessionController.isConnected.read(reader);
      const pillActive = dict && voice || voice && !dict && !handsFree && connected;
      pillContainer.classList.toggle("hidden", !pillActive);
      inputContainer.classList.toggle("voice-input-mode-pill", pillActive);
    }));
  }
  _createSpeechToTextButton(container) {
    const sttService = this.chatSpeechToTextService;
    const button = dom.append(container, dom.$(".sessions-chat-stt-button"));
    button.tabIndex = 0;
    button.role = "button";
    const micLabel = localize("sessionsStt.dictate", "Dictate (Speech to Text)");
    const stopLabel = localize("sessionsStt.stop", "Stop Dictation");
    this._register(this.hoverService.setupDelayedHover(button, () => ({
      // While the model prepares, surface the download/connecting hover
      // (which invites the user to click to cancel) so this composer matches
      // the main chat toolbar affordance. Idle gets the richer description
      // naming the configured dictation model.
      content: sttService.isPreparingModel ? getDictationDownloadHoverMarkdown(sttService) : sttService.state !== ChatSpeechToTextState.Idle ? stopLabel : getDictationHoverMarkdown(micLabel, this.configurationService),
      position: { hoverPosition: HoverPosition.BELOW },
      appearance: { showPointer: true }
    })));
    const downloadRing = this._register(new MutableDisposable());
    const renderState = () => {
      const preparing = sttService.isPreparingModel;
      const recording = sttService.state === ChatSpeechToTextState.Recording;
      const active = sttService.state !== ChatSpeechToTextState.Idle;
      dom.clearNode(button);
      downloadRing.clear();
      if (preparing) {
        if (sttService.isDownloadingModel) {
          dom.append(button, renderIcon(Codicon.micDownloadCompact));
          downloadRing.value = new DictationDownloadRing(button, sttService);
        } else {
          dom.append(button, renderIcon(ThemeIcon.modify(Codicon.loadingCompact, "spin")));
        }
      } else {
        dom.append(button, renderIcon(recording ? Codicon.micFilled : Codicon.mic));
      }
      button.classList.toggle("recording", recording && !preparing);
      button.classList.toggle("preparing", preparing);
      button.ariaLabel = preparing ? localize("sessionsStt.cancelPreparing", "Cancel Dictation. {0}", getDictationPreparingLabel(sttService)) : active ? stopLabel : micLabel;
    };
    renderState();
    this._register(sttService.onDidChangeState(renderState));
    this._register(sttService.onDidChangePreparingModel(renderState));
    this._register(sttService.onDidChangeDownloadingModel(renderState));
    this._register(setupDictationMicGlow(button, sttService, this.accessibilityService, void 0, this.themeService));
    const updateVisibility = () => {
      const voiceActive = this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get();
      const dict = this.voiceInputModeService.dictationAvailable.get();
      const voice = this.voiceInputModeService.voiceAvailable.get();
      const handsFree = this.voiceInputModeService.handsFree.get();
      const sessionActive = this.voiceSessionController.isConnected.get();
      const pillActive = dict && voice || voice && !dict && !handsFree && sessionActive;
      button.classList.toggle("hidden", !sttService.isConfigured || voiceActive || pillActive);
    };
    updateVisibility();
    this._register(autorun((reader) => {
      this.voiceSessionController.isConnected.read(reader);
      this.voiceSessionController.isConnecting.read(reader);
      this.voiceInputModeService.dictationAvailable.read(reader);
      this.voiceInputModeService.voiceAvailable.read(reader);
      this.voiceInputModeService.handsFree.read(reader);
      updateVisibility();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("dictation.enabled") || e.affectsConfiguration("dictation.model")) {
        updateVisibility();
      }
    }));
    const toggle = () => this.toggleDictation();
    this._register(Gesture.addTarget(button));
    [dom.EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._register(dom.addDisposableListener(button, eventType, (e) => {
        dom.EventHelper.stop(e);
        void toggle();
      }));
    });
    this._register(dom.addDisposableListener(button, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(event, true);
        void toggle();
      }
    }));
    this._register(addMicButtonContextMenuListener(
      button,
      () => getDictationContextMenuActions(this.commandService, this.configurationService, this.keybindingService, TOGGLE_DICTATION_COMMAND_ID),
      this.contextMenuService
    ));
  }
  /**
   * Toggle dictation into this composer's editor. Shared by the mic button and
   * the Cmd/Ctrl+I chord ({@link TOGGLE_DICTATION_COMMAND_ID}); the shared
   * Dictate action can't target this composer since it isn't an `IChatWidget`.
   */
  async toggleDictation() {
    if (!this._editor) {
      return;
    }
    await runDictationShortcut({
      speechService: this.chatSpeechToTextService,
      keybindingService: this.keybindingService,
      logService: this.logService,
      onboardingService: this.dictationOnboardingService
    }, TOGGLE_DICTATION_COMMAND_ID, this._editor);
  }
  // --- Input History (IHistoryNavigationWidget) ---
  showPreviousValue() {
    if (this._history.isAtStart()) {
      return;
    }
    if (this._draftState?.inputText || this._draftState?.attachments.length) {
      this._history.overlay(this._toHistoryEntry(this._draftState));
    }
    this._navigateHistory(true);
  }
  showNextValue() {
    if (this._history.isAtEnd()) {
      return;
    }
    if (this._draftState?.inputText || this._draftState?.attachments.length) {
      this._history.overlay(this._toHistoryEntry(this._draftState));
    }
    this._navigateHistory(false);
  }
  _updateDraftState() {
    this._draftState = {
      inputText: this._editor?.getModel()?.getValue() ?? "",
      attachments: [...this._contextAttachments.attachments]
    };
  }
  _toHistoryEntry(draft) {
    return {
      ...draft,
      mode: { id: ChatModeKind.Agent, kind: ChatModeKind.Agent },
      selectedModel: void 0,
      selections: [],
      contrib: {}
    };
  }
  _navigateHistory(previous) {
    const entry = previous ? this._history.previous() : this._history.next();
    const inputText = entry?.inputText ?? "";
    if (entry) {
      this._editor?.getModel()?.setValue(inputText);
      this._contextAttachments.setAttachments(entry.attachments);
    }
    aria.status(inputText);
    if (previous) {
      this._editor.setPosition({ lineNumber: 1, column: 1 });
    } else {
      const model = this._editor.getModel();
      if (model) {
        const lastLine = model.getLineCount();
        this._editor.setPosition({ lineNumber: lastLine, column: model.getLineMaxColumn(lastLine) });
      }
    }
  }
  // --- Send ---
  async submit(background = false) {
    return this._send(background);
  }
  async _send(background = false) {
    const rawQuery = this._editor.getModel()?.getValue() ?? "";
    const query = rawQuery.trim();
    const queryOffset = rawQuery.length - rawQuery.trimStart().length;
    const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
    const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
    if (!query && !hasSendableAttachment && !hasAdditionalSendContent || this._sending) {
      return false;
    }
    if (!this._canSendRequest.get()) {
      return false;
    }
    notifyDictationSubmitted(this._editor);
    const session = this.options.session.get();
    if (!hasAdditionalSendContent && session && await this.chatSubmitRequestHandlerService.tryHandle({
      sessionResource: session.resource,
      providerId: session.providerId,
      sessionId: session.sessionId,
      input: query
    })) {
      this._editor.getModel()?.setValue("");
      return true;
    }
    const attachments = this._agentHostInputCompletionHandler?.getAttachmentsForSend(query, queryOffset) ?? [...this._contextAttachments.attachments];
    const attachedContext = attachments.length > 0 ? attachments : void 0;
    const request = query;
    if (this._draftState) {
      this._history.append(this._toHistoryEntry(this._draftState));
    }
    this._clearDraftState();
    this._sending = true;
    this._editor.updateOptions({ readOnly: true });
    this._updateSendButtonState();
    this._updateInputLoadingState();
    let sent = false;
    try {
      sent = await this.options.sendRequest({ query: request, attachments: attachedContext, background });
      if (!sent) {
        return false;
      }
      this._contextAttachments.clear();
      this._editor.getModel()?.setValue("");
    } catch (e) {
      this.logService.error("Failed to send request:", e);
      return false;
    } finally {
      this._sending = false;
      this._editor.updateOptions({ readOnly: false });
      this._updateDraftState();
      this._updateSendButtonState();
      this._updateInputLoadingState();
    }
    return sent;
  }
  _updateSendButtonState() {
    if (!this._sendButton) {
      return;
    }
    const hasText = !!this._editor?.getModel()?.getValue().trim();
    const hasSendableAttachment = this._contextAttachments.attachments.some(isExplicitFileOrImageVariableEntry);
    const hasAdditionalSendContent = this.options.hasAdditionalSendContent?.get() ?? false;
    this._sendButton.enabled = !this._sending && (hasText || hasSendableAttachment || hasAdditionalSendContent) && this._canSendRequest.get();
  }
  _restoreState() {
    const draft = this._getDraftState();
    if (draft) {
      this._editor?.getModel()?.setValue(draft.inputText);
      if (draft.attachments?.length) {
        this._contextAttachments.setAttachments(draft.attachments.map(IChatRequestVariableEntry.fromExport));
      }
    }
  }
  _getDraftState() {
    const raw = this.storageService.get(STORAGE_KEY_DRAFT_STATE, StorageScope.WORKSPACE);
    if (!raw) {
      return void 0;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return void 0;
    }
  }
  _clearDraftState() {
    this._draftState = { inputText: "", attachments: [] };
    this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(this._draftState), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  saveState() {
    if (this._draftState) {
      const state = {
        ...this._draftState,
        attachments: this._draftState.attachments.map(IChatRequestVariableEntry.toExport)
      };
      this.storageService.store(STORAGE_KEY_DRAFT_STATE, JSON.stringify(state), StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  layout(_height, width) {
    this._compactModelPicker.set(width < NewChatInputWidget.compactModelPickerWidth, void 0);
    this._editor?.layout();
  }
  focus() {
    this._editor?.focus();
  }
  /** See {@link INewChatVoiceComposer.routesWhileSessionActive}. */
  get routesWhileSessionActive() {
    return this.options.voiceRoutesWhileSessionActive === true;
  }
  prefillInput(text) {
    const editor = this._editor;
    const model = editor?.getModel();
    if (editor && model) {
      model.setValue(text);
      const lastLine = model.getLineCount();
      const maxColumn = model.getLineMaxColumn(lastLine);
      editor.setPosition({ lineNumber: lastLine, column: maxColumn });
      editor.focus();
    }
  }
  sendQuery(text) {
    if (this._sending) {
      return;
    }
    const model = this._editor?.getModel();
    if (model) {
      const combined = combineVoiceInput(model.getValue(), text);
      model.setValue(combined);
      this._send();
    }
  }
  attach(uris) {
    this._contextAttachments.addAttachments(...uris.map((uri) => toFileVariableEntry(uri)));
  }
};
NewChatInputWidget.compactModelPickerWidth = 280;
NewChatInputWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IModelService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IWorkbenchLayoutService),
  __decorateParam(11, IChatSessionsService),
  __decorateParam(12, IChatSpeechToTextService),
  __decorateParam(13, IDictationOnboardingService),
  __decorateParam(14, IChatSubmitRequestHandlerService),
  __decorateParam(15, IContextMenuService),
  __decorateParam(16, ICommandService),
  __decorateParam(17, IVoiceSessionController),
  __decorateParam(18, IVoiceInputModeService),
  __decorateParam(19, IAccessibilityService),
  __decorateParam(20, IVoiceModeOnboardingService),
  __decorateParam(21, INewChatVoiceTargetService),
  __decorateParam(22, IThemeService)
], NewChatInputWidget);
export {
  NewChatInputWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL25ld0NoYXRJbnB1dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9jaGF0SW5wdXQuY3NzJztcbmltcG9ydCAnLi9tZWRpYS9jaGF0SW5wdXRNb2JpbGUuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFuYWdlZEhvdmVyQ29udGVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJTWVudUVudHJ5QWN0aW9uVmlld0l0ZW1PcHRpb25zLCBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0LCBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9jb25maWcvZWRpdG9yQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRk9OVF9ERUZBVUxUUyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2ZvbnRJbmZvLmpzJztcbmltcG9ydCB7IFN1Z2dlc3RDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgUGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGxhY2Vob2xkZXJUZXh0L2Jyb3dzZXIvcGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9hY2Nlc3NpYmlsaXR5L2Jyb3dzZXIvYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUNvbW1hbmRJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHlDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IHJlbmRlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0TWVudUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb250ZXh0bWVudS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IGdldFNpbXBsZUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jb2RlRWRpdG9yL2Jyb3dzZXIvc2ltcGxlRWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0Q29udGV4dEF0dGFjaG1lbnRzIH0gZnJvbSAnLi9uZXdDaGF0Q29udGV4dEF0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IElOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlLCBORVdfQ0hBVF9WT0lDRV9TRU5USU5FTCwgTmV3Q2hhdFZvaWNlQ29udHJvbGxlciB9IGZyb20gJy4vbmV3Q2hhdFZvaWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlUGlja2VyIH0gZnJvbSAnLi9zZXNzaW9uVHlwZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgTW9iaWxlU2Vzc2lvblR5cGVQaWNrZXIgfSBmcm9tICcuL21vYmlsZS9tb2JpbGVTZXNzaW9uVHlwZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBpbnN0YWxsTW9iaWxlQ2hpcExhbmVTY3JvbGwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVDaGlwTGFuZVNjcm9sbC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRCdXR0b25TdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldERpY3RhdGlvbkhvdmVyTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L21pY0J1dHRvbkhvdmVycy5qcyc7XG5pbXBvcnQgeyBhZGRNaWNCdXR0b25Db250ZXh0TWVudUxpc3RlbmVyLCBnZXREaWN0YXRpb25Db250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L21pY0J1dHRvbk1lbnVBY3Rpb25zLmpzJztcbmltcG9ydCB7IFNsYXNoQ29tbWFuZEhhbmRsZXIgfSBmcm9tICcuL3NsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgVmFyaWFibGVDb21wbGV0aW9uSGFuZGxlciB9IGZyb20gJy4vdmFyaWFibGVDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uUmVmZXJlbmNlQ29tcGxldGlvbkhhbmRsZXIgfSBmcm9tICcuL3Nlc3Npb25SZWZlcmVuY2VDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25IYW5kbGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWxJbnB1dFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnksIHRvRmlsZVZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRIaXN0b3J5TmF2aWdhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vd2lkZ2V0L2NoYXRXaWRnZXRIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dCwgSUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9jb250ZXh0U2NvcGVkSGlzdG9yeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSwgTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSB9IGZyb20gJy4vbmV3Q2hhdE1vZGVsUGlja2VyLmpzJztcbmltcG9ydCB7IE1vZGVsUGlja2VyLCBNb2RlbFBpY2tlckFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi9tb2RlbFBpY2tlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwsIFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsIH0gZnJvbSAnLi9zZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNvbnRleHQsIFNlc3Npb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uQ29udGV4dC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9TRVNTSU9OU19TQ09QRURfSU5QVVRfSElTVE9SWV9TRVRUSU5HIH0gZnJvbSAnLi9zZXNzaW9uc0NoYXRIaXN0b3J5LmpzJztcbmltcG9ydCB7IElDaGF0U3RhdHVzSXRlbVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFN0YXR1cy9jaGF0U3RhdHVzSXRlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFuZGxlVGVybWluYWxDb21tYW5kUGFzdGUsIGlzVGVybWluYWxDb21tYW5kSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFRlcm1pbmFsQ29tbWFuZFBhc3RlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdFNwZWVjaFRvVGV4dFN0YXRlLCBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNldHVwRGljdGF0aW9uTWljR2xvdyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uTWljR2xvdy5qcyc7XG5pbXBvcnQgeyBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvbk9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgQ2hhdFZvaWNlSW5wdXRNb2RlQWN0aW9uLCBWb2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlSW5wdXRNb2RlL3ZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSVZvaWNlSW5wdXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUlucHV0TW9kZS92b2ljZUlucHV0TW9kZS5qcyc7XG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgcnVuRGljdGF0aW9uU2hvcnRjdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWN0aW9ucy9jaGF0U3BlZWNoVG9UZXh0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBub3RpZnlEaWN0YXRpb25TdWJtaXR0ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L2RpY3RhdGlvblNlc3Npb24uanMnO1xuaW1wb3J0IHsgY29tYmluZVZvaWNlSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VJbnB1dFV0aWxzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IERpY3RhdGlvbkRvd25sb2FkUmluZywgZ2V0RGljdGF0aW9uRG93bmxvYWRIb3Zlck1hcmtkb3duLCBnZXREaWN0YXRpb25QcmVwYXJpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uRG93bmxvYWRSaW5nLmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQ2hhdFBldFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFBldFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9hZ2VudHNWb2ljZS9icm93c2VyL3ZvaWNlTW9kZU9uYm9hcmRpbmcuanMnO1xuXG5cbmNvbnN0IE9QRU5fT1RFTF9TRVRUSU5HU19DT01NQU5EID0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQub3RlbC5vcGVuU2V0dGluZ3MnO1xuY29uc3QgT1RFTF9TVEFUVVNfQ09NTUFORCA9ICdnaXRodWIuY29waWxvdC5jaGF0Lm90ZWwuc3RhdHVzQWN0aXZlJztcbmNvbnN0IE9URUxfU1RBVFVTX0VOVFJZX0lEID0gJ2NvcGlsb3Qub3RlbFN0YXR1cyc7XG5jb25zdCBPVEVMX0RPQ1NfVVJMID0gJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvY29waWxvdC9ndWlkZXMvbW9uaXRvcmluZy1hZ2VudHMnO1xuY29uc3QgU1RPUkFHRV9LRVlfRFJBRlRfU1RBVEUgPSAnc2Vzc2lvbnMuZHJhZnRTdGF0ZSc7XG5jb25zdCBNSU5fRURJVE9SX0hFSUdIVCA9IDUwO1xuY29uc3QgTUFYX0VESVRPUl9IRUlHSFQgPSAyMDA7XG5jb25zdCBORVdfQ0hBVF9JTlBVVF9GT05UX0ZBTUlMWSA9ICdzeXN0ZW0tdWksIC1hcHBsZS1zeXN0ZW0sIHNhbnMtc2VyaWYnO1xuXG4vKiogVHJ1ZSB3aGlsZSBmb2N1cyBpcyBpbiBhbiBBZ2VudHMgd2luZG93IGNvbXBvc2VyIHRoYXQgc3VwcG9ydHMgZGljdGF0aW9uLiAqL1xuY29uc3QgU2Vzc2lvbnNDaGF0SW5wdXRIYXNEaWN0YXRpb25Gb2N1cyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uc0NoYXRJbnB1dEhhc0RpY3RhdGlvbkZvY3VzJywgZmFsc2UsIGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dEhhc0RpY3RhdGlvbkZvY3VzJywgXCJUcnVlIHdoZW4gZm9jdXMgaXMgaW4gYW4gQWdlbnRzIHdpbmRvdyBjaGF0IGNvbXBvc2VyIHRoYXQgc3VwcG9ydHMgZGljdGF0aW9uLlwiKSk7XG5cbmNvbnN0IFRPR0dMRV9ESUNUQVRJT05fQ09NTUFORF9JRCA9ICdzZXNzaW9ucy5hY3Rpb24uY2hhdC50b2dnbGVEaWN0YXRpb24nO1xuXG4vKiogQ29tcG9zZXIgdGhlIGRpY3RhdGlvbiBzaG9ydGN1dCB0YXJnZXRzICh0aGUgY29tcG9zZXIgaXNuJ3QgYW4gYElDaGF0V2lkZ2V0YCkuICovXG5sZXQgYWN0aXZlRGljdGF0aW9uQ29tcG9zZXI6IE5ld0NoYXRJbnB1dFdpZGdldCB8IHVuZGVmaW5lZDtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBUT0dHTEVfRElDVEFUSU9OX0NPTU1BTkRfSUQsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFNlc3Npb25zQ2hhdElucHV0SGFzRGljdGF0aW9uRm9jdXMsXG5cdFx0Q29udGV4dEtleUV4cHIuaGFzKENoYXRDb250ZXh0S2V5cy5zcGVlY2hUb1RleHRDb25maWd1cmVkLmtleSksXG5cdCksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJLFxuXHRoYW5kbGVyOiAoKSA9PiBhY3RpdmVEaWN0YXRpb25Db21wb3Nlcj8udG9nZ2xlRGljdGF0aW9uKCksXG59KTtcblxuLy8gUHJlc2VydmUgdGhlIGNvbW1hbmQgaWQgc28gcHVzaC10by10YWxrIGhvbGQgbW9kZSBjYW4gdHJhY2sgdGhpcyBjaG9yZC5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnYWdlbnRzVm9pY2Uuc3RhcnRWb2ljZUluQ2hhdCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFNlc3Npb25zQ2hhdElucHV0SGFzRGljdGF0aW9uRm9jdXMsXG5cdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0KSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlNwYWNlLFxufSk7XG5cbmludGVyZmFjZSBJRHJhZnRTdGF0ZSB7XG5cdGlucHV0VGV4dDogc3RyaW5nO1xuXHRhdHRhY2htZW50czogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xufVxuXG5jbGFzcyBOZXdDaGF0SW5wdXRTdGF0dXNBY3Rpb25WaWV3SXRlbSBleHRlbmRzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHtcblx0cHJpdmF0ZSByZWFkb25seSBob3ZlckNvbnRlbnREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0b3B0aW9uczogSU1lbnVFbnRyeUFjdGlvblZpZXdJdGVtT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUNoYXRTdGF0dXNJdGVtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTdGF0dXNJdGVtU2VydmljZTogSUNoYXRTdGF0dXNJdGVtU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLCBvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBhY2Nlc3NpYmlsaXR5U2VydmljZSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXG5cdFx0aWYgKHRoaXMuX2NvbW1hbmRBY3Rpb24uaWQgIT09IE9URUxfU1RBVFVTX0NPTU1BTkQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTdGF0dXNJdGVtU2VydmljZS5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmVudHJ5LmlkID09PSBPVEVMX1NUQVRVU19FTlRSWV9JRCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVRvb2x0aXAoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBvbkNsaWNrKGV2ZW50OiBNb3VzZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2NvbW1hbmRBY3Rpb24uaWQgPT09IE9URUxfU1RBVFVTX0NPTU1BTkQgJiYgdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRldmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLmhvdmVyU2VydmljZS5zaG93TWFuYWdlZEhvdmVyKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgc3VwZXIub25DbGljayhldmVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0SG92ZXJDb250ZW50cygpOiBJTWFuYWdlZEhvdmVyQ29udGVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2NvbW1hbmRBY3Rpb24uaWQgPT09IE9URUxfU1RBVFVTX0NPTU1BTkQpIHtcblx0XHRcdHJldHVybiB7IGVsZW1lbnQ6ICgpID0+IHRoaXMuX3JlbmRlclN0YXR1c0hvdmVyKCkgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3VwZXIuZ2V0SG92ZXJDb250ZW50cygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldFRvb2x0aXAoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5fY29tbWFuZEFjdGlvbi5pZCA9PT0gT1RFTF9TVEFUVVNfQ09NTUFORCkge1xuXHRcdFx0Y29uc3QgdG9vbHRpcCA9IHRoaXMuX2dldFN0YXR1c0VudHJ5VG9vbHRpcCgpO1xuXHRcdFx0aWYgKHRvb2x0aXApIHtcblx0XHRcdFx0cmV0dXJuIHRvb2x0aXA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLmdldFRvb2x0aXAoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFN0YXR1c0VudHJ5VG9vbHRpcCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5jaGF0U3RhdHVzSXRlbVNlcnZpY2UuZ2V0RW50cmllcygpKSB7XG5cdFx0XHRpZiAoZW50cnkuaWQgPT09IE9URUxfU1RBVFVTX0VOVFJZX0lEKSB7XG5cdFx0XHRcdHJldHVybiBlbnRyeS50b29sdGlwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJTdGF0dXNIb3ZlcigpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5ob3ZlckNvbnRlbnREaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IGRvbS4kKCcubmV3LWNoYXQtaW5wdXQtc3RhdHVzLWhvdmVyJyk7XG5cdFx0cm9vdC5hcHBlbmRDaGlsZChkb20uJCgnLm5ldy1jaGF0LWlucHV0LXN0YXR1cy1ob3Zlci10aXRsZScsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ25ld0NoYXRJbnB1dC5zdGF0dXMub3RlbC50aXRsZScsIFwiTW9uaXRvcmluZyB3aXRoIE9wZW5UZWxlbWV0cnkgZW5hYmxlZFwiKSkpO1xuXHRcdHJvb3QuYXBwZW5kQ2hpbGQoZG9tLiQoJy5uZXctY2hhdC1pbnB1dC1zdGF0dXMtaG92ZXItZGV0YWlsJywgdW5kZWZpbmVkLCB0aGlzLl9nZXRTdGF0dXNFbnRyeVRvb2x0aXAoKSA/PyBzdXBlci5nZXRUb29sdGlwKCkpKTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSByb290LmFwcGVuZENoaWxkKGRvbS4kKCcubmV3LWNoYXQtaW5wdXQtc3RhdHVzLWhvdmVyLWFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgbGVhcm5Nb3JlQnV0dG9uID0gc3RvcmUuYWRkKG5ldyBCdXR0b24oYWN0aW9ucywgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdGxlYXJuTW9yZUJ1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCduZXdDaGF0SW5wdXQuc3RhdHVzLm90ZWwubGVhcm5Nb3JlJywgXCJMZWFybiBNb3JlXCIpO1xuXHRcdHN0b3JlLmFkZChsZWFybk1vcmVCdXR0b24ub25EaWRDbGljaygoKSA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3ZzY29kZS5vcGVuJywgVVJJLnBhcnNlKE9URUxfRE9DU19VUkwpKTtcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtYW5hZ2VCdXR0b24gPSBzdG9yZS5hZGQobmV3IEJ1dHRvbihhY3Rpb25zLCB7IC4uLmRlZmF1bHRCdXR0b25TdHlsZXMsIHNlY29uZGFyeTogdHJ1ZSB9KSk7XG5cdFx0bWFuYWdlQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ25ld0NoYXRJbnB1dC5zdGF0dXMub3RlbC5tYW5hZ2UnLCBcIk1hbmFnZVwiKTtcblx0XHRzdG9yZS5hZGQobWFuYWdlQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE9QRU5fT1RFTF9TRVRUSU5HU19DT01NQU5EKTtcblx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlLmhpZGVIb3Zlcih0cnVlKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gcm9vdDtcblx0fVxufVxuXG4vKipcbiAqIE9wdGlvbnMgcGFzc2VkIHRvIHRoZSB7QGxpbmsgTmV3Q2hhdElucHV0V2lkZ2V0fSdzIGBzZW5kUmVxdWVzdGAgY2FsbGJhY2sgd2hlblxuICogdGhlIHVzZXIgc3VibWl0cyB0aGUgaW5wdXQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSU5ld0NoYXRJbnB1dFNlbmRSZXF1ZXN0IHtcblx0cmVhZG9ubHkgcXVlcnk6IHN0cmluZztcblx0cmVhZG9ubHkgYXR0YWNobWVudHM/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107XG5cdHJlYWRvbmx5IGJhY2tncm91bmQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIFJhbmRvbWl6ZWQsIGZyaWVuZGx5IHBsYWNlaG9sZGVycyBzaG93biBpbiB0aGUgbmV3LXNlc3Npb24gY2hhdCBpbnB1dFxuICogdG8gYWRkIGEgYml0IG9mIHBlcnNvbmFsaXR5LiBPbmUgaXMgcGlja2VkIHBlciB3aWRnZXQgaW5zdGFuY2UsIGF2b2lkaW5nXG4gKiBhbiBpbW1lZGlhdGUgcmVwZWF0IG9mIHRoZSBwcmV2aW91cyBwaWNrLlxuICovXG5jb25zdCBSQU5ET01fUExBQ0VIT0xERVJTID0gW1xuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIud2hhdEFyZVlvdUJ1aWxkaW5nJywgXCJXaGF0IGFyZSB5b3UgYnVpbGRpbmc/XCIpLFxuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIud2hhdFdpbGxZb3VTaGlwVG9kYXknLCBcIldoYXQgd2lsbCB5b3Ugc2hpcCB0b2RheT9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci5kZXNjcmliZVdoYXRZb3VXYW50VG9CdWlsZCcsIFwiRGVzY3JpYmUgd2hhdCB5b3Ugd2FudCB0byBidWlsZFwiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLndoYXRzWW91ck5leHRNaWxlc3RvbmUnLCBcIldoYXQncyB5b3VyIG5leHQgbWlsZXN0b25lP1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLndoYXRBcmVZb3VUcnlpbmdUb0FjaGlldmUnLCBcIldoYXQgYXJlIHlvdSB0cnlpbmcgdG8gYWNoaWV2ZT9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci5waXRjaFlvdXJJZGVhJywgXCJQaXRjaCB5b3VyIGlkZWFcIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0c1RoZUdvYWwnLCBcIldoYXQncyB0aGUgZ29hbD9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0V2lsbFlvdUNyZWF0ZScsIFwiV2hhdCB3aWxsIHlvdSBjcmVhdGU/XCIpLFxuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIud2hhdEZlYXR1cmVBcmVZb3VEcmVhbWluZ1VwJywgXCJXaGF0IGZlYXR1cmUgYXJlIHlvdSBkcmVhbWluZyB1cD9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci5kZXNjcmliZVRoZU91dGNvbWUnLCBcIkRlc2NyaWJlIHRoZSBvdXRjb21lIHlvdSB3YW50XCIpLFxuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIud2hhdFByb2JsZW1BcmVZb3VTb2x2aW5nJywgXCJXaGF0IHByb2JsZW0gYXJlIHlvdSBzb2x2aW5nP1wiKSxcblx0bG9jYWxpemUoJ3Nlc3Npb25zQ2hhdElucHV0LnBsYWNlaG9sZGVyLndoYXRzTmV4dE9uWW91clJvYWRtYXAnLCBcIldoYXQncyBuZXh0IG9uIHlvdXIgcm9hZG1hcD9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0V291bGRZb3VMaWtlVG9BdXRvbWF0ZScsIFwiV2hhdCB3b3VsZCB5b3UgbGlrZSB0byBhdXRvbWF0ZT9cIiksXG5cdGxvY2FsaXplKCdzZXNzaW9uc0NoYXRJbnB1dC5wbGFjZWhvbGRlci53aGF0V2lsbFlvdUxhdW5jaCcsIFwiV2hhdCB3aWxsIHlvdSBsYXVuY2g/XCIpLFxuXHRsb2NhbGl6ZSgnc2Vzc2lvbnNDaGF0SW5wdXQucGxhY2Vob2xkZXIuZGVzY3JpYmVZb3VyTWlzc2lvbicsIFwiRGVzY3JpYmUgeW91ciBtaXNzaW9uXCIpLFxuXTtcblxubGV0IGxhc3RQbGFjZWhvbGRlckluZGV4ID0gLTE7XG5mdW5jdGlvbiBnZXRSYW5kb21DaGF0SW5wdXRQbGFjZWhvbGRlcigpOiBzdHJpbmcge1xuXHRsZXQgaW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBSQU5ET01fUExBQ0VIT0xERVJTLmxlbmd0aCk7XG5cdGlmIChpbmRleCA9PT0gbGFzdFBsYWNlaG9sZGVySW5kZXgpIHtcblx0XHRpbmRleCA9IChpbmRleCArIDEpICUgUkFORE9NX1BMQUNFSE9MREVSUy5sZW5ndGg7XG5cdH1cblx0bGFzdFBsYWNlaG9sZGVySW5kZXggPSBpbmRleDtcblx0cmV0dXJuIFJBTkRPTV9QTEFDRUhPTERFUlNbaW5kZXhdO1xufVxuXG4vLyAjcmVnaW9uIC0tLSBOZXcgQ2hhdCBXaWRnZXQgLS0tXG5cbmV4cG9ydCBjbGFzcyBOZXdDaGF0SW5wdXRXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0IHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgY29tcGFjdE1vZGVsUGlja2VyV2lkdGggPSAyODA7XG5cblx0cmVhZG9ubHkgc2Vzc2lvblR5cGVQaWNrZXI6IFNlc3Npb25UeXBlUGlja2VyO1xuXG5cdC8vIElIaXN0b3J5TmF2aWdhdGlvbldpZGdldFxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyID0gdGhpcy5fb25EaWRCbHVyLmV2ZW50O1xuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7IHJldHVybiB0aGlzLl9lZGl0b3JDb250YWluZXI7IH1cblxuXHQvKiogVGhlIHVuZGVybHlpbmcgaW5wdXQgZWRpdG9yLiBFeHBvc2VkIGZvciBjb21wb25lbnQgZml4dHVyZXMuICovXG5cdGdldCBpbnB1dEVkaXRvcigpOiBDb2RlRWRpdG9yV2lkZ2V0IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2VkaXRvcjsgfVxuXG5cdC8qKiBUaGUgY3VycmVudCBtb2RlbC1zZWxlY3Rpb24gc3RhdGUuIEV4cG9zZWQgc28gaG9zdCB3aWRnZXRzIGNhbiByZWFjdCB0byBtb2RlbCBjaGFuZ2VzLiAqL1xuXHRnZXQgc2VsZWN0ZWRNb2RlbFN0YXRlKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwuc3RhdGU7IH1cblxuXHQvKiogT3BlbnMgdGhlIG1vZGVsIHBpY2tlciBkcm9wZG93bi4gKi9cblx0b3Blbk1vZGVsUGlja2VyKCk6IHZvaWQgeyB0aGlzLl9uZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlLm9wZW5Nb2RlbFBpY2tlcigpOyB9XG5cblx0Ly8gSW5wdXRcblx0cHJpdmF0ZSBfZWRpdG9yITogQ29kZUVkaXRvcldpZGdldDtcblx0cHJpdmF0ZSBfZWRpdG9yQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cblx0Ly8gU2VuZCBidXR0b25cblx0cHJpdmF0ZSBfc2VuZEJ1dHRvbjogQnV0dG9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZW5kaW5nID0gZmFsc2U7XG5cblx0Ly8gTG9hZGluZyBzdGF0ZVxuXHRwcml2YXRlIF9sb2FkaW5nU3Bpbm5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRpbmdEZWxheURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0Ly8gQXR0YWNoZWQgY29udGV4dFxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0QXR0YWNobWVudHM6IE5ld0NoYXRDb250ZXh0QXR0YWNobWVudHM7XG5cblx0Ly8gU2xhc2ggY29tbWFuZHNcblx0cHJpdmF0ZSBfYWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlcjogQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uSGFuZGxlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSA9IG5ldyBOZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsOiBTZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FuU2VuZFJlcXVlc3Q6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wYWN0TW9kZWxQaWNrZXIgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdC8vIElucHV0IHN0YXRlXG5cdHByaXZhdGUgX2RyYWZ0U3RhdGU6IElEcmFmdFN0YXRlIHwgdW5kZWZpbmVkID0ge1xuXHRcdGlucHV0VGV4dDogJycsXG5cdFx0YXR0YWNobWVudHM6IFtdLFxuXHR9O1xuXG5cdC8vIElucHV0IGhpc3Rvcnlcblx0cHJpdmF0ZSByZWFkb25seSBfaGlzdG9yeTogQ2hhdEhpc3RvcnlOYXZpZ2F0b3I7XG5cdHByaXZhdGUgX2hpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCE6IElIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHRbJ2hpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCddO1xuXHRwcml2YXRlIF9oaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudCE6IElIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHRbJ2hpc3RvcnlOYXZpZ2F0aW9uRm9yd2FyZHNFbmFibGVtZW50J107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiB7XG5cdFx0XHRzZXNzaW9uOiBJT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cdFx0XHRnZXRDb250ZXh0Rm9sZGVyVXJpOiAoKSA9PiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0XHRzZW5kUmVxdWVzdDogKHJlcXVlc3Q6IElOZXdDaGF0SW5wdXRTZW5kUmVxdWVzdCkgPT4gUHJvbWlzZTxib29sZWFuPjtcblx0XHRcdGNhblNlbmRSZXF1ZXN0OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0XHRcdGNhblN1Ym1pdFdpdGhvdXRTZXNzaW9uPzogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdFx0XHRoYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQ/OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0XHRcdGxvYWRpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRcdFx0aGlzdG9yeUtleT86IElPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD47XG5cdFx0XHRtaW5FZGl0b3JIZWlnaHQ/OiBudW1iZXI7XG5cdFx0XHRwbGFjZWhvbGRlcj86IHN0cmluZztcblx0XHRcdHJlbmRlclNlc3Npb25UeXBlUGlja2VySW5Db250cm9scz86IGJvb2xlYW47XG5cdFx0XHRzdXBwb3J0c0JhY2tncm91bmQ/OiBib29sZWFuO1xuXHRcdFx0Z2V0SW5wdXRPbmJvYXJkaW5nVGlwQ29udGFpbmVyPzogKCkgPT4gSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0XHRvbkRpZENoYW5nZUlucHV0T25ib2FyZGluZ1Zpc2libGU/OiAodmlzaWJsZTogYm9vbGVhbikgPT4gdm9pZDtcblx0XHRcdC8qKlxuXHRcdFx0ICogS2VlcCB0aGlzIGNvbXBvc2VyIGEgdmFsaWQgdm9pY2UgdGFyZ2V0IGV2ZW4gd2hpbGUgYSBjcmVhdGVkIHNlc3Npb25cblx0XHRcdCAqIGlzIGFjdGl2ZS4gVXNlZCBieSB0aGUgaW4tc2Vzc2lvbiBcIm5ldyBjaGF0XCIgY29tcG9zZXIgc28gZGljdGF0aW9uXG5cdFx0XHQgKiBjcmVhdGVzIGEgcGFyYWxsZWwgY2hhdCBpbnN0ZWFkIG9mIHJvdXRpbmcgdG8gdGhlIHBhcmVudCBzZXNzaW9uJ3Ncblx0XHRcdCAqIGNoYXQgd2lkZ2V0LiBUaGUgd2VsY29tZSBjb21wb3NlciBsZWF2ZXMgdGhpcyB1bnNldC5cblx0XHRcdCAqL1xuXHRcdFx0dm9pY2VSb3V0ZXNXaGlsZVNlc3Npb25BY3RpdmU/OiBib29sZWFuO1xuXHRcdH0sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlOiBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsXG5cdFx0QElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlOiBJRGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UsXG5cdFx0QElDaGF0U3VibWl0UmVxdWVzdEhhbmRsZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFN1Ym1pdFJlcXVlc3RIYW5kbGVyU2VydmljZTogSUNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElWb2ljZVNlc3Npb25Db250cm9sbGVyIHByaXZhdGUgcmVhZG9ubHkgdm9pY2VTZXNzaW9uQ29udHJvbGxlcjogSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsXG5cdFx0QElWb2ljZUlucHV0TW9kZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2b2ljZUlucHV0TW9kZVNlcnZpY2U6IElWb2ljZUlucHV0TW9kZVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlOiBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UsXG5cdFx0QElOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZTogSU5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fc2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsLCB0aGlzLm9wdGlvbnMuc2Vzc2lvbikpO1xuXHRcdHRoaXMuX2NhblNlbmRSZXF1ZXN0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5jYW5TdWJtaXRXaXRob3V0U2Vzc2lvbj8ucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWxTZWxlY3Rpb24gPSB0aGlzLl9zZXNzaW9uTW9kZWxTZWxlY3Rpb25Nb2RlbC5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLmNhblNlbmRSZXF1ZXN0LnJlYWQocmVhZGVyKSAmJiBtb2RlbFNlbGVjdGlvbi5oYXNTZWxlY3RhYmxlTW9kZWwgJiYgIW1vZGVsU2VsZWN0aW9uLnBlbmRpbmdTZWxlY3Rpb247XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZSwgdGhpcy5fbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZV0sXG5cdFx0XHRbSVNlc3Npb25Db250ZXh0LCBuZXcgU2Vzc2lvbkNvbnRleHQodGhpcy5vcHRpb25zLnNlc3Npb24pXSxcblx0XHRcdFtJU2Vzc2lvbk1vZGVsU2VsZWN0aW9uTW9kZWwsIHRoaXMuX3Nlc3Npb25Nb2RlbFNlbGVjdGlvbk1vZGVsXSxcblx0XHQpKSk7XG5cdFx0dGhpcy5faGlzdG9yeSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhpc3RvcnlOYXZpZ2F0b3IsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLmhpc3RvcnlLZXkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHRoaXMuX3NldEhpc3RvcnlLZXkodGhpcy5vcHRpb25zLmhpc3RvcnlLZXk/LnJlYWQocmVhZGVyKSkpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBR0VOVF9TRVNTSU9OU19TQ09QRURfSU5QVVRfSElTVE9SWV9TRVRUSU5HKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NldEhpc3RvcnlLZXkodGhpcy5vcHRpb25zLmhpc3RvcnlLZXk/LmdldCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZXh0QXR0YWNobWVudHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRDb250ZXh0QXR0YWNobWVudHMpKTtcblx0XHQvLyBBbHdheXMgdXNlIHRoZSBtb2JpbGUtYXdhcmUgcGlja2VyLiBJdHMgb3ZlcnJpZGVzIGJhaWwgdG8gdGhlXG5cdFx0Ly8gZGVza3RvcCBiZWhhdmlvciB3aGVuIGBpc1Bob25lTGF5b3V0KClgIGlzIGZhbHNlLCBzbyBwaWNraW5nXG5cdFx0Ly8gdGhlIHNhbWUgY2xhc3MgcmVnYXJkbGVzcyBvZiBjb25zdHJ1Y3Rpb24tdGltZSB2aWV3cG9ydFxuXHRcdC8vIGF2b2lkcyBhIGNsYXNzLW1pc21hdGNoIHdoZW4gdGhlIHVzZXIgcmVzaXplcyBhY3Jvc3MgdGhlXG5cdFx0Ly8gcGhvbmUgYnJlYWtwb2ludCBhZnRlciB0aGUgY2hhdCBpbnB1dCBtb3VudGVkLlxuXHRcdHRoaXMuc2Vzc2lvblR5cGVQaWNrZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vYmlsZVNlc3Npb25UeXBlUGlja2VyLCB0aGlzLm9wdGlvbnMuc2Vzc2lvbiwgdW5kZWZpbmVkKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLm9uRGlkQ2hhbmdlQ29udGV4dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVEcmFmdFN0YXRlKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fY2FuU2VuZFJlcXVlc3QucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5vcHRpb25zLmhhc0FkZGl0aW9uYWxTZW5kQ29udGVudD8ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaXNMb2FkaW5nID0gdGhpcy5vcHRpb25zLmxvYWRpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fbG9hZGluZ1NwaW5uZXI/LmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCBpc0xvYWRpbmcpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SGlzdG9yeUtleShoaXN0b3J5S2V5OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9oaXN0b3J5LnNldEhpc3RvcnlLZXkodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBR0VOVF9TRVNTSU9OU19TQ09QRURfSU5QVVRfSElTVE9SWV9TRVRUSU5HKSAhPT0gZmFsc2UgPyBoaXN0b3J5S2V5IDogdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBSZW5kZXJpbmcgLS0tXG5cblx0cmVuZGVyKHBhcmVudDogSFRNTEVsZW1lbnQsIHJvb3Q6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gSW5wdXQgc2xvdFxuXHRcdGNvbnN0IGNoYXRJbnB1dENvbnRhaW5lciA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLm5ldy1jaGF0LWlucHV0LWNvbnRhaW5lcicpKTtcblxuXHRcdC8vIE92ZXJmbG93IHdpZGdldCBET00gbm9kZSBhdCB0aGUgdG9wIGxldmVsIHNvIHRoZSBzdWdnZXN0IHdpZGdldFxuXHRcdC8vIGlzIG5vdCBjbGlwcGVkIGJ5IGFueSBvdmVyZmxvdzpoaWRkZW4gYW5jZXN0b3IuXG5cdFx0Y29uc3QgZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSA9IGRvbS5hcHBlbmQocm9vdCwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWVkaXRvci1vdmVyZmxvdy5tb25hY28tZWRpdG9yJykpO1xuXHRcdC8vIFN1cHByZXNzIHRoZSBkZWZhdWx0IGBUZXh0YCBraW5kIGljb24gaW4gdGhlIHN1Z2dlc3Qgd2lkZ2V0OyBjaGF0IHNsYXNoL3NraWxsXG5cdFx0Ly8gY29tcGxldGlvbnMgdXNlIHRoYXQga2luZCBhbmQgcmVseSBvbiB0aGUgY2hhdCBtb2R1bGUncyBDU1MgcnVsZSBzY29wZWQgdG8gdGhpcyBjbGFzcy5cblx0XHRlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2hpZGVTdWdnZXN0VGV4dEljb25zJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlLnJlbW92ZSgpIH0pO1xuXG5cdFx0Ly8gTm90aWZpY2F0aW9uIHdpZGdldCBhYm92ZSB0aGUgaW5wdXQgYXJlYVxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbkNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY2hhdElucHV0Q29udGFpbmVyLCBkb20uJCgnLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25XaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LFxuXHRcdFx0e1xuXHRcdFx0XHRtb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZTogdGhpcy5zZXNzaW9uVHlwZVBpY2tlci5tb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZSxcblx0XHRcdFx0b3Blbk1vZGVsUGlja2VyOiAoKSA9PiB0aGlzLl9uZXdDaGF0TW9kZWxQaWNrZXJTZXJ2aWNlLm9wZW5Nb2RlbFBpY2tlcigpLFxuXHRcdFx0XHRzd2l0Y2hUb01vZGVsOiBtb2RlbElkZW50aWZpZXIgPT4gdGhpcy5fbmV3Q2hhdE1vZGVsUGlja2VyU2VydmljZS5zd2l0Y2hUb01vZGVsKG1vZGVsSWRlbnRpZmllciksXG5cdFx0XHR9LFxuXHRcdCkpO1xuXHRcdG5vdGlmaWNhdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZChub3RpZmljYXRpb25XaWRnZXQuZG9tTm9kZSk7XG5cblx0XHQvLyBGaXJzdC1ydW4gVm9pY2UgTW9kZSBpbnRyb2R1Y3Rpb24sIGRvY2tlZCBhYm92ZSB0aGUgaW5wdXQgYXJlYVxuXHRcdGNvbnN0IHZvaWNlT25ib2FyZGluZ0NvbnRhaW5lciA9IGRvbS5hcHBlbmQoY2hhdElucHV0Q29udGFpbmVyLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy1jb250YWluZXInKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VJbnB1dE9uYm9hcmRpbmdWaXNpYmxlID0gKCkgPT4gdGhpcy5vcHRpb25zLm9uRGlkQ2hhbmdlSW5wdXRPbmJvYXJkaW5nVmlzaWJsZT8uKFxuXHRcdFx0dGhpcy52b2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZS5pc1Zpc2libGUgfHwgdGhpcy5kaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZS5pc1Zpc2libGVcblx0XHQpO1xuXHRcdGNvbnN0IHRpcENvbnRhaW5lciA9IHRoaXMub3B0aW9ucy5nZXRJbnB1dE9uYm9hcmRpbmdUaXBDb250YWluZXI/LigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UucmVnaXN0ZXJIb3N0KHZvaWNlT25ib2FyZGluZ0NvbnRhaW5lciwgY2hhdElucHV0Q29udGFpbmVyLCAoKSA9PiB0aGlzLmZvY3VzKCksIHRpcENvbnRhaW5lciwgb25EaWRDaGFuZ2VJbnB1dE9uYm9hcmRpbmdWaXNpYmxlKSk7XG5cblx0XHQvLyBGaXJzdC1ydW4gZGljdGF0aW9uIGludHJvZHVjdGlvbiwgZG9ja2VkIGRpcmVjdGx5IGFib3ZlIHRoZSBpbnB1dCBhcmVhXG5cdFx0Ly8gc28gaXQgcmVhZHMgYXMgb25lIHN0YWNrIHdpdGggaXQgLSB0aGUgc2FtZSBzbG90IHRoZSBjaGF0IHZpZXcgdXNlcy5cblx0XHRjb25zdCBkaWN0YXRpb25PbmJvYXJkaW5nQ29udGFpbmVyID0gZG9tLmFwcGVuZChjaGF0SW5wdXRDb250YWluZXIsIGRvbS4kKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UucmVnaXN0ZXJIb3N0KGRpY3RhdGlvbk9uYm9hcmRpbmdDb250YWluZXIsIGNoYXRJbnB1dENvbnRhaW5lciwgdGlwQ29udGFpbmVyLCBvbkRpZENoYW5nZUlucHV0T25ib2FyZGluZ1Zpc2libGUpKTtcblxuXHRcdC8vIElucHV0IGFyZWEgaW5zaWRlIHRoZSBpbnB1dCBzbG90XG5cdFx0Y29uc3QgaW5wdXRBcmVhV3JhcHBlciA9IGRvbS5hcHBlbmQoY2hhdElucHV0Q29udGFpbmVyLCBkb20uJCgnLm5ldy1jaGF0LWlucHV0LWFyZWEtd3JhcHBlcicpKTtcblx0XHRjb25zdCBpbnB1dEFyZWEgPSBkb20uYXBwZW5kKGlucHV0QXJlYVdyYXBwZXIsIGRvbS4kKCcubmV3LWNoYXQtaW5wdXQtYXJlYScpKTtcblxuXHRcdC8vIEF0dGFjaG1lbnRzIHJvdyAocGlsbHMgb25seSkgaW5zaWRlIGlucHV0IGFyZWEsIGFib3ZlIGVkaXRvclxuXHRcdGNvbnN0IGF0dGFjaFJvdyA9IGRvbS5hcHBlbmQoaW5wdXRBcmVhLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtYXR0YWNoLXJvdycpKTtcblx0XHRjb25zdCBhdHRhY2hlZENvbnRleHRDb250YWluZXIgPSBkb20uYXBwZW5kKGF0dGFjaFJvdywgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWF0dGFjaGVkLWNvbnRleHQnKSk7XG5cdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLnJlbmRlckF0dGFjaGVkQ29udGV4dChhdHRhY2hlZENvbnRleHRDb250YWluZXIpO1xuXHRcdHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5yZWdpc3RlckRyb3BUYXJnZXQocm9vdCk7XG5cdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLnJlZ2lzdGVyUGFzdGVIYW5kbGVyKGlucHV0QXJlYSk7XG5cblx0XHR0aGlzLl9jcmVhdGVFZGl0b3IoaW5wdXRBcmVhLCBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlKTtcblx0XHRjb25zdCBpbnB1dEhhc0NvbnRlbnQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudCwgKCkgPT4gdGhpcy5fZWRpdG9yLmdldFZhbHVlKCkubGVuZ3RoID4gMCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UGV0V2lkZ2V0LCBpbnB1dEFyZWFXcmFwcGVyLCBpbnB1dEFyZWEsIGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLCBpbnB1dEhhc0NvbnRlbnQsIGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSwgdGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KSk7XG5cdFx0dGhpcy5fY3JlYXRlSW5wdXRUb29sYmFyKGlucHV0QXJlYSk7XG5cblx0XHRjb25zdCBuZXdDaGF0Qm90dG9tQ29udGFpbmVyID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcubmV3LWNoYXQtYm90dG9tLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBuZXdDaGF0Q29udHJvbHNDb250YWluZXIgPSBkb20uYXBwZW5kKG5ld0NoYXRCb3R0b21Db250YWluZXIsIGRvbS4kKCcubmV3LWNoYXQtY29udHJvbHMtY29udGFpbmVyJykpO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVuZGVyU2Vzc2lvblR5cGVQaWNrZXJJbkNvbnRyb2xzICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGVQaWNrZXJIb3N0ID0gZG9tLmFwcGVuZChuZXdDaGF0Q29udHJvbHNDb250YWluZXIsIGRvbS4kKCcubmV3LWNoYXQtc2Vzc2lvbi10eXBlLXBpY2tlci1ob3N0JykpO1xuXHRcdFx0dGhpcy5zZXNzaW9uVHlwZVBpY2tlci5yZW5kZXIoc2Vzc2lvblR5cGVQaWNrZXJIb3N0KTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGRvbS5hcHBlbmQobmV3Q2hhdENvbnRyb2xzQ29udGFpbmVyLCBkb20uJCgnJykpLCBNZW51cy5OZXdTZXNzaW9uQ29udHJvbCwge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlcG9Db25maWdDb250YWluZXIgPSBkb20uYXBwZW5kKG5ld0NoYXRCb3R0b21Db250YWluZXIsIGRvbS4kKCcubmV3LWNoYXQtcmVwby1jb25maWctY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCByZXBvQ29uZmlnQ29udGFpbmVyLCBNZW51cy5OZXdTZXNzaW9uUmVwb3NpdG9yeUNvbmZpZywge1xuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdH0pKTtcblxuXHRcdC8vIE9uIHBob25lLCB0aGUgY2hpcCBsYW5lIGlzIGhvcml6b250YWxseSBzY3JvbGxhYmxlIHdoZW4gaXRzXG5cdFx0Ly8gY29udGVudCBvdmVyZmxvd3MgdGhlIHZpZXdwb3J0LiBOYXRpdmUgdG91Y2ggc2Nyb2xsIGlzIGJsb2NrZWRcblx0XHQvLyBiZWNhdXNlIGVhY2ggY2hpcCByZWdpc3RlcnMgYSBgR2VzdHVyZS5hZGRUYXJnZXRgIGhhbmRsZXIgaW5cblx0XHQvLyBgcmVuZGVyUGlja2VyVHJpZ2dlcmAgdGhhdCBjYWxscyBgcHJldmVudERlZmF1bHRgIG9uXG5cdFx0Ly8gYHRvdWNobW92ZWAsIHN3YWxsb3dpbmcgdGhlIHBhbi4gVGhlIGhlbHBlciBiZWxvdyBpbnN0YWxscyBhXG5cdFx0Ly8gcG9pbnRlci1ldmVudC1iYXNlZCBzY3JvbGwgaGFuZGxlciB0aGF0IG5vLW9wcyBvbiBkZXNrdG9wIGFuZFxuXHRcdC8vIGtpY2tzIGluIG9uY2UgYSBkcmFnIGNyb3NzZXMgYSBzbWFsbCB0aHJlc2hvbGQgb24gcGhvbmUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFsbE1vYmlsZUNoaXBMYW5lU2Nyb2xsKG5ld0NoYXRCb3R0b21Db250YWluZXIsIHRoaXMubGF5b3V0U2VydmljZSkpO1xuXG5cdFx0Ly8gR2VuZXJpYyBleHRlbnNpb24gcG9pbnQgZm9yIHN0YXR1cyBpbmRpY2F0b3JzIGluIHRoZSBuZXctc2Vzc2lvbiB2aWV3LlxuXHRcdGNvbnN0IHN0YXR1c0NvbnRhaW5lciA9IGRvbS5hcHBlbmQocmVwb0NvbmZpZ0NvbnRhaW5lciwgZG9tLiQoJy5uZXctY2hhdC1zdGF0dXMtdG9vbGJhcicpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBzdGF0dXNDb250YWluZXIsIE1lbnVJZC5DaGF0SW5wdXRTdGF0dXMsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBPVEVMX1NUQVRVU19DT01NQU5EICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3Q2hhdElucHV0U3RhdHVzQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzdG9yZSBkcmFmdCBpbnB1dCBzdGF0ZSBmcm9tIHN0b3JhZ2Vcblx0XHR0aGlzLl9yZXN0b3JlU3RhdGUoKTtcblxuXHRcdC8vIExheW91dCBlZGl0b3IgYWZ0ZXIgdGhlIGlucHV0IHNsb3QgZmFkZS1pbiBhbmltYXRpb24gY29tcGxldGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjaGF0SW5wdXRDb250YWluZXIsICdhbmltYXRpb25lbmQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9lZGl0b3I/LmxheW91dCgpO1xuXHRcdH0sIHsgb25jZTogdHJ1ZSB9KSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVJbnB1dExvYWRpbmdTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBsb2FkaW5nID0gdGhpcy5fc2VuZGluZztcblx0XHRpZiAobG9hZGluZykge1xuXHRcdFx0aWYgKCF0aGlzLl9sb2FkaW5nRGVsYXlEaXNwb3NhYmxlLnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IHRpbWVyID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9hZGluZ0RlbGF5RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zZW5kaW5nKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2FkaW5nU3Bpbm5lcj8uY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgNTAwKTtcblx0XHRcdFx0dGhpcy5fbG9hZGluZ0RlbGF5RGlzcG9zYWJsZS52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiBjbGVhclRpbWVvdXQodGltZXIpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9hZGluZ0RlbGF5RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0dGhpcy5fbG9hZGluZ1NwaW5uZXI/LmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gRWRpdG9yIC0tLVxuXG5cdHByaXZhdGUgX2dldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHZlcmJvc2UgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuU2Vzc2lvbnNDaGF0KTtcblx0XHRpZiAodmVyYm9zZSkge1xuXHRcdFx0Y29uc3Qga2JMYWJlbCA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLk9wZW5BY2Nlc3NpYmlsaXR5SGVscCk/LmdldExhYmVsKCk7XG5cdFx0XHRyZXR1cm4ga2JMYWJlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0SW5wdXQuYWNjZXNzaWJpbGl0eUhlbHAnLCBcIkNoYXQgaW5wdXQuIFByZXNzIEVudGVyIHRvIHNlbmQgb3V0IHRoZSByZXF1ZXN0LiBVc2UgezB9IGZvciBDaGF0IEFjY2Vzc2liaWxpdHkgSGVscC5cIiwga2JMYWJlbClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdElucHV0LmFjY2Vzc2liaWxpdHlIZWxwTm9LYicsIFwiQ2hhdCBpbnB1dC4gUHJlc3MgRW50ZXIgdG8gc2VuZCBvdXQgdGhlIHJlcXVlc3QuIFVzZSB0aGUgQ2hhdCBBY2Nlc3NpYmlsaXR5IEhlbHAgY29tbWFuZCBmb3IgbW9yZSBpbmZvcm1hdGlvbi5cIik7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdElucHV0JywgXCJDaGF0IGlucHV0XCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGVybWluYWxDb21tYW5kUHJlZml4KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMub3B0aW9ucy5zZXNzaW9uLmdldCgpO1xuXHRcdHJldHVybiBzZXNzaW9uID8gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uLnJlc291cmNlKSk/LnRlcm1pbmFsQ29tbWFuZFByZWZpeCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVRlcm1pbmFsQ29tbWFuZFBhc3RlKGU6IENsaXBib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aGFuZGxlVGVybWluYWxDb21tYW5kUGFzdGUoZSwgdGhpcy5fZWRpdG9yLCB0aGlzLl9nZXRUZXJtaW5hbENvbW1hbmRQcmVmaXgoKSwgdGhpcy5kaWFsb2dTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUVkaXRvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IHRoaXMuX2VkaXRvckNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtZWRpdG9yJykpO1xuXHRcdGNvbnN0IG1pbkhlaWdodCA9IHRoaXMub3B0aW9ucy5taW5FZGl0b3JIZWlnaHQgPz8gTUlOX0VESVRPUl9IRUlHSFQ7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke21pbkhlaWdodH1weGA7XG5cblx0XHQvLyBDcmVhdGUgc2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgYW5kIHJlZ2lzdGVyIGhpc3RvcnkgbmF2aWdhdGlvblxuXHRcdC8vIEJFRk9SRSBjcmVhdGluZyB0aGUgZWRpdG9yLCBzbyB0aGUgZWRpdG9yJ3MgY29udGV4dCBrZXkgc2NvcGUgaXMgYSBjaGlsZFxuXHRcdGNvbnN0IGlucHV0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZChjb250YWluZXIpKTtcblx0XHRjb25zdCB7IGhpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCwgaGlzdG9yeU5hdmlnYXRpb25Gb3J3YXJkc0VuYWJsZW1lbnQgfSA9IHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQW5kQ3JlYXRlSGlzdG9yeU5hdmlnYXRpb25Db250ZXh0KGlucHV0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHRoaXMpKTtcblx0XHR0aGlzLl9oaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQgPSBoaXN0b3J5TmF2aWdhdGlvbkJhY2t3YXJkc0VuYWJsZW1lbnQ7XG5cdFx0dGhpcy5faGlzdG9yeU5hdmlnYXRpb25Gb3J3YXJkc0VuYWJsZW1lbnQgPSBoaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudDtcblxuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Nlc3Npb25zLWNoYXQnLCBwYXRoOiBgaW5wdXQtJHtEYXRlLm5vdygpfWAgfSk7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5tb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwoJycsIG51bGwsIHVyaSwgdHJ1ZSkpO1xuXG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogSUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnMgPSB7XG5cdFx0XHQuLi5nZXRTaW1wbGVFZGl0b3JPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0cmVhZE9ubHk6IGZhbHNlLFxuXHRcdFx0YXJpYUxhYmVsOiB0aGlzLl9nZXRBcmlhTGFiZWwoKSxcblx0XHRcdHBsYWNlaG9sZGVyOiB0aGlzLm9wdGlvbnMucGxhY2Vob2xkZXIgPz8gZ2V0UmFuZG9tQ2hhdElucHV0UGxhY2Vob2xkZXIoKSxcblx0XHRcdGZvbnRGYW1pbHk6IE5FV19DSEFUX0lOUFVUX0ZPTlRfRkFNSUxZLFxuXHRcdFx0Zm9udFNpemU6IDEzLFxuXHRcdFx0bGluZUhlaWdodDogMjAsXG5cdFx0XHRjdXJzb3JXaWR0aDogMSxcblx0XHRcdHBhZGRpbmc6IHsgdG9wOiA4LCBib3R0b206IDIgfSxcblx0XHRcdHdyYXBwaW5nU3RyYXRlZ3k6ICdhZHZhbmNlZCcsXG5cdFx0XHRzdGlja3lTY3JvbGw6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdub25lJyxcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRzdWdnZXN0OiB7XG5cdFx0XHRcdHNob3dJY29uczogdHJ1ZSxcblx0XHRcdFx0c2hvd1NuaXBwZXRzOiBmYWxzZSxcblx0XHRcdFx0c2hvd1dvcmRzOiB0cnVlLFxuXHRcdFx0XHRzaG93U3RhdHVzQmFyOiBmYWxzZSxcblx0XHRcdFx0aW5zZXJ0TW9kZTogJ2luc2VydCcsXG5cdFx0XHRcdGZpdFdpZHRoVG9EZXRhaWxzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgd2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0ge1xuXHRcdFx0aXNTaW1wbGVXaWRnZXQ6IHRydWUsXG5cdFx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0U29tZUVkaXRvckNvbnRyaWJ1dGlvbnMoW1xuXHRcdFx0XHRDb250ZXh0TWVudUNvbnRyb2xsZXIuSUQsXG5cdFx0XHRcdFN1Z2dlc3RDb250cm9sbGVyLklELFxuXHRcdFx0XHRTbmlwcGV0Q29udHJvbGxlcjIuSUQsXG5cdFx0XHRcdFBsYWNlaG9sZGVyVGV4dENvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdF0pLFxuXHRcdH07XG5cblx0XHR0aGlzLl9lZGl0b3IgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvZGVFZGl0b3JXaWRnZXQsIGVkaXRvckNvbnRhaW5lciwgZWRpdG9yT3B0aW9ucywgd2lkZ2V0T3B0aW9ucyxcblx0XHQpKTtcblx0XHR0aGlzLl9lZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHQvLyBSZS1ldmFsdWF0ZSB3aGVuIHRoZSBhdHRhY2hlZCBzZXNzaW9uIGNoYW5nZXM7IGNvbnRlbnQgY2hhbmdlcyBhcmVcblx0XHRcdC8vIGhhbmRsZWQgYnkgdGhlIG1vZGVsLWNvbnRlbnQgbGlzdGVuZXIgYmVsb3cuXG5cdFx0XHR0aGlzLm9wdGlvbnMuc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl91cGRhdGVFZGl0b3JGb250RmFtaWx5KCk7XG5cdFx0fSkpO1xuXHRcdC8vIEF0dGFjaCB0byB0aGUgY29udGFpbmVyIChub3QgYGdldERvbU5vZGUoKWAsIHdoaWNoIGlzIG51bGwgdW50aWwgdGhlXG5cdFx0Ly8gZWRpdG9yIGhhcyBhIG1vZGVsKSBzbyB0aGUgY2FwdHVyZS1waGFzZSBwYXN0ZSB2ZXRvIGlzIGFsd2F5cyB3aXJlZCB1cC5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VkaXRvckNvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5QQVNURSwgZSA9PiB0aGlzLl9oYW5kbGVUZXJtaW5hbENvbW1hbmRQYXN0ZShlKSwgdHJ1ZSkpO1xuXG5cdFx0Ly8gRW5zdXJlIHN1Z2dlc3Qgd2lkZ2V0IHJlbmRlcnMgYWJvdmUgdGhlIGlucHV0IChub3QgY2xpcHBlZCBieSBjb250YWluZXIpXG5cdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KHRoaXMuX2VkaXRvcik/LmZvcmNlUmVuZGVyaW5nQWJvdmUoKTtcblxuXHRcdC8vIFVwZGF0ZSBhcmlhIGxhYmVsIHdoZW4gYWNjZXNzaWJpbGl0eSB2ZXJib3NpdHkgc2V0dGluZyBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlNlc3Npb25zQ2hhdCkpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWw6IHRoaXMuX2dldEFyaWFMYWJlbCgpIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGRpY3RhdGlvbkZvY3VzS2V5ID0gU2Vzc2lvbnNDaGF0SW5wdXRIYXNEaWN0YXRpb25Gb2N1cy5iaW5kVG8oaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0ZGljdGF0aW9uRm9jdXNLZXkuc2V0KHRydWUpO1xuXHRcdFx0YWN0aXZlRGljdGF0aW9uQ29tcG9zZXIgPSB0aGlzO1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0ZGljdGF0aW9uRm9jdXNLZXkuc2V0KGZhbHNlKTtcblx0XHRcdGlmIChhY3RpdmVEaWN0YXRpb25Db21wb3NlciA9PT0gdGhpcykge1xuXHRcdFx0XHRhY3RpdmVEaWN0YXRpb25Db21wb3NlciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkQmx1ci5maXJlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAoYWN0aXZlRGljdGF0aW9uQ29tcG9zZXIgPT09IHRoaXMpIHtcblx0XHRcdFx0YWN0aXZlRGljdGF0aW9uQ29tcG9zZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uS2V5RG93bihlID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgJiYgIWUuc2hpZnRLZXkgJiYgIWUuY3RybEtleSAmJiAhZS5hbHRLZXkpIHtcblx0XHRcdFx0Ly8gRG9uJ3Qgc2VuZCBpZiB0aGUgc3VnZ2VzdCB3aWRnZXQgaXMgdmlzaWJsZSAobGV0IGl0IGFjY2VwdCB0aGUgY29tcGxldGlvbilcblx0XHRcdFx0aWYgKHRoaXMuX2VkaXRvci5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8Ym9vbGVhbj4oJ3N1Z2dlc3RXaWRnZXRWaXNpYmxlJykpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR0aGlzLl9zZW5kKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBBbHQrRW50ZXIgXHUyMDE0IHNlbmQgaW4gdGhlIGJhY2tncm91bmQgd2l0aG91dCBuYXZpZ2F0aW5nIGludG8gdGhlIHNlc3Npb25cblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuc3VwcG9ydHNCYWNrZ3JvdW5kICYmIGUua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlciAmJiAhZS5zaGlmdEtleSAmJiAhZS5jdHJsS2V5ICYmIGUuYWx0S2V5KSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fc2VuZCh0cnVlKTtcblx0XHRcdH1cblx0XHRcdC8vIENtZCsvIC8gQ3RybCsvIFx1MjAxNCBvcGVuIHRoZSBjb250ZXh0IHBpY2tlciAoc2FtZSBhcyB0aGUgYXR0YWNoIGJ1dHRvbilcblx0XHRcdGlmIChlLmVxdWFscyhLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuU2xhc2gpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLnNob3dQaWNrZXIodGhpcy5vcHRpb25zLmdldENvbnRleHRGb2xkZXJVcmkoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVXBkYXRlIGhpc3RvcnkgbmF2aWdhdGlvbiBlbmFibGVtZW50IGJhc2VkIG9uIGN1cnNvciBwb3NpdGlvblxuXHRcdGNvbnN0IHVwZGF0ZUhpc3RvcnlOYXZpZ2F0aW9uRW5hYmxlbWVudCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdFx0aWYgKCFtb2RlbCB8fCAhcG9zaXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50LnNldChwb3NpdGlvbi5saW5lTnVtYmVyID09PSAxICYmIHBvc2l0aW9uLmNvbHVtbiA9PT0gMSk7XG5cdFx0XHR0aGlzLl9oaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudC5zZXQocG9zaXRpb24ubGluZU51bWJlciA9PT0gbW9kZWwuZ2V0TGluZUNvdW50KCkgJiYgcG9zaXRpb24uY29sdW1uID09PSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpKTtcblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCgpID0+IHVwZGF0ZUhpc3RvcnlOYXZpZ2F0aW9uRW5hYmxlbWVudCgpKSk7XG5cdFx0dXBkYXRlSGlzdG9yeU5hdmlnYXRpb25FbmFibGVtZW50KCk7XG5cblx0XHRsZXQgcHJldmlvdXNIZWlnaHQgPSAtMTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDb250ZW50U2l6ZUNoYW5nZShlID0+IHtcblx0XHRcdGlmICghZS5jb250ZW50SGVpZ2h0Q2hhbmdlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb250ZW50SGVpZ2h0ID0gdGhpcy5fZWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKTtcblx0XHRcdGNvbnN0IGNsYW1wZWRIZWlnaHQgPSBNYXRoLm1pbihNQVhfRURJVE9SX0hFSUdIVCwgTWF0aC5tYXgodGhpcy5vcHRpb25zLm1pbkVkaXRvckhlaWdodCA/PyBNSU5fRURJVE9SX0hFSUdIVCwgY29udGVudEhlaWdodCkpO1xuXHRcdFx0aWYgKGNsYW1wZWRIZWlnaHQgPT09IHByZXZpb3VzSGVpZ2h0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHByZXZpb3VzSGVpZ2h0ID0gY2xhbXBlZEhlaWdodDtcblx0XHRcdHRoaXMuX2VkaXRvckNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtjbGFtcGVkSGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXQoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTbGFzaCBjb21tYW5kc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNsYXNoQ29tbWFuZEhhbmRsZXIsIHRoaXMuX2VkaXRvcikpO1xuXG5cdFx0Ly8gVmFyaWFibGUgY29tcGxldGlvbnMgKCNmaWxlLCAjZm9sZGVyKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRWYXJpYWJsZUNvbXBsZXRpb25IYW5kbGVyLCB0aGlzLl9lZGl0b3IsIHRoaXMuX2NvbnRleHRBdHRhY2htZW50cywgKCkgPT4gdGhpcy5vcHRpb25zLmdldENvbnRleHRGb2xkZXJVcmkoKSxcblx0XHQpKTtcblxuXHRcdC8vIFNlc3Npb24gcmVmZXJlbmNlIGNvbXBsZXRpb25zICgjc2Vzc2lvbilcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0U2Vzc2lvblJlZmVyZW5jZUNvbXBsZXRpb25IYW5kbGVyLCB0aGlzLl9lZGl0b3IsIHRoaXMuX2NvbnRleHRBdHRhY2htZW50cyxcblx0XHQpKTtcblxuXHRcdHRoaXMuX2FnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEFnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXIsIHRoaXMuX2VkaXRvciwgdGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KCgpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZURyYWZ0U3RhdGUoKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlRWRpdG9yRm9udEZhbWlseSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaW5wdXQgaXMgbW9ub3NwYWNlIG9ubHkgd2hpbGUgYSB0ZXJtaW5hbCBjb21tYW5kIGlzIGJlaW5nIGNvbXBvc2VkOlxuXHQgKiB0aGUgYXR0YWNoZWQgc2Vzc2lvbiBhZHZlcnRpc2VzIGEgcHJlZml4IEFORCB0aGUgY3VycmVudCBpbnB1dCBiZWdpbnMgd2l0aFxuXHQgKiBpdC4gT3RoZXJ3aXNlIGl0IHVzZXMgdGhlIG5vcm1hbCBuZXctY2hhdCBpbnB1dCBmb250LlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlRWRpdG9yRm9udEZhbWlseSgpOiB2b2lkIHtcblx0XHRjb25zdCBpc0NvbW1hbmQgPSBpc1Rlcm1pbmFsQ29tbWFuZElucHV0KHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5nZXRMaW5lQ29udGVudCgxKSB8fCAnJywgdGhpcy5fZ2V0VGVybWluYWxDb21tYW5kUHJlZml4KCkpO1xuXHRcdHRoaXMuX2VkaXRvci51cGRhdGVPcHRpb25zKHsgZm9udEZhbWlseTogaXNDb21tYW5kID8gRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseSA6IE5FV19DSEFUX0lOUFVUX0ZPTlRfRkFNSUxZIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlQXR0YWNoQnV0dG9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBhdHRhY2hCdXR0b24gPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWF0dGFjaC1idXR0b24nKSk7XG5cdFx0Y29uc3QgYXR0YWNoQnV0dG9uTGFiZWwgPSBsb2NhbGl6ZSgnYWRkQ29udGV4dCcsIFwiQWRkIENvbnRleHQuLi5cIik7XG5cdFx0YXR0YWNoQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHRhdHRhY2hCdXR0b24ucm9sZSA9ICdidXR0b24nO1xuXHRcdGF0dGFjaEJ1dHRvbi5hcmlhTGFiZWwgPSBhdHRhY2hCdXR0b25MYWJlbDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihhdHRhY2hCdXR0b24sIHtcblx0XHRcdGNvbnRlbnQ6IGF0dGFjaEJ1dHRvbkxhYmVsLFxuXHRcdFx0cG9zaXRpb246IHsgaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5CRUxPVyB9LFxuXHRcdFx0YXBwZWFyYW5jZTogeyBzaG93UG9pbnRlcjogdHJ1ZSB9XG5cdFx0fSkpO1xuXHRcdGRvbS5hcHBlbmQoYXR0YWNoQnV0dG9uLCByZW5kZXJJY29uKENvZGljb24uYWRkQ29tcGFjdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYXR0YWNoQnV0dG9uLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb250ZXh0QXR0YWNobWVudHMuc2hvd1BpY2tlcih0aGlzLm9wdGlvbnMuZ2V0Q29udGV4dEZvbGRlclVyaSgpKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVJbnB1dFRvb2xiYXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xiYXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXRvb2xiYXInKSk7XG5cblx0XHR0aGlzLl9jcmVhdGVBdHRhY2hCdXR0b24odG9vbGJhcik7XG5cblx0XHQvLyBTZXNzaW9uIGNvbmZpZyBwaWNrZXJzIChzdWNoIGFzIG1vZGVsKSBcdTIwMTQgcmVuZGVyZWQgdmlhIE1lbnVXb3JrYmVuY2hUb29sQmFyXG5cdFx0Ly8gVmlzaWJpbGl0eSBjb250cm9sbGVkIGJ5IGNvbnRleHQga2V5cyAoaXNBY3RpdmVTZXNzaW9uQmFja2dyb3VuZFByb3ZpZGVyLCBpc05ld0NoYXRTZXNzaW9uKVxuXHRcdGNvbnN0IGNvbmZpZ0NvbnRhaW5lciA9IGRvbS5hcHBlbmQodG9vbGJhciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LWNvbmZpZy10b29sYmFyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBjb25maWdDb250YWluZXIsIE1lbnVzLk5ld1Nlc3Npb25Db25maWcsIHtcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24pID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gJ3Nlc3Npb25zLm1vZGVsUGlja2VyJykge1xuXHRcdFx0XHRcdGNvbnN0IHBpY2tlciA9IHRoaXMuX3Njb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsUGlja2VyLCB0aGlzLl9jb21wYWN0TW9kZWxQaWNrZXIpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgTW9kZWxQaWNrZXJBY3Rpb25WaWV3SXRlbShwaWNrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQodG9vbGJhciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXRvb2xiYXItc3BhY2VyJykpO1xuXG5cdFx0Ly8gRGljdGF0aW9uIG1pYyBidXR0b24uIFNoYXJlcyB0aGUgU1RUIHNlcnZpY2UsIG1pY1xuXHRcdC8vIGRldmljZSwgYW5kIGdhdGluZyAoYmFja2VuZCBzdXBwb3J0ICsgYGRpY3RhdGlvbi5lbmFibGVkYClcblx0XHQvLyB3aXRoIHRoZSBtYWluIGNoYXQgaW5wdXQ7IGluc2VydHMgdGhlIHRyYW5zY3JpcHQgaW50byB0aGlzIGNvbXBvc2VyJ3Ncblx0XHQvLyBlZGl0b3IuIFBsYWNlZCBiZWZvcmUgdGhlIHZvaWNlIGNvbnRyb2xzIHNvIGRpY3RhdGlvbiBsZWFkcyB0aGVcblx0XHQvLyBtaWMtcmVsYXRlZCBncm91cC5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fY3JlYXRlU3BlZWNoVG9UZXh0QnV0dG9uKHRvb2xiYXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgbmV3LXNlc3Npb24gZGljdGF0aW9uIGNvbnRyb2w6JywgZXJyb3IpO1xuXHRcdH1cblxuXHRcdC8vIFZvaWNlIGNvbnRyb2xzIChtaWMvc3RvcC9zZXR0aW5ncy9kaXNjb25uZWN0KS4gVGhlIGhhbmQtYnVpbHQgdG9vbGJhclxuXHRcdC8vIGNhbid0IHVzZSB0aGUgc2hhcmVkIGBNZW51SWQuQ2hhdEV4ZWN1dGVgLCBzbyBhIGRlZGljYXRlZCBtZW51IGlzIHVzZWQuXG5cdFx0Ly8gS2VlcCB0aGUgc2Vzc2lvbiBwaWNrZXIgdXNhYmxlIHdoZW4gb3B0aW9uYWwgdm9pY2UgaW5pdGlhbGl6YXRpb24gZmFpbHMuXG5cdFx0Ly8gVGhlIGNvbnRyb2xsZXIgYWxzbyBoYW5kbGVzIHZvaWNlIHRhcmdldCByb3V0aW5nICsgaW5wdXQgZ2xvdywgd2hpY2ggdGhlXG5cdFx0Ly8gc2VnbWVudGVkIHBpbGwgcmVsaWVzIG9uLCBzbyBpdCBpcyBjcmVhdGVkIHJlZ2FyZGxlc3Mgb2YgdGhlIHBpbGw7IGl0c1xuXHRcdC8vIHRvb2xiYXIgaXRlbXMgaGlkZSAodmlhIGB3aGVuYCkgd2hlbiB0aGUgcGlsbCBpcyBhY3RpdmUuXG5cdFx0Y29uc3Qgdm9pY2VDb250YWluZXIgPSBkb20uYXBwZW5kKHRvb2xiYXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC12b2ljZS10b29sYmFyJykpO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5ld0NoYXRWb2ljZUNvbnRyb2xsZXIsIHtcblx0XHRcdFx0dG9vbGJhckNvbnRhaW5lcjogdm9pY2VDb250YWluZXIsXG5cdFx0XHRcdGlucHV0Q29udGFpbmVyOiBjb250YWluZXIsXG5cdFx0XHRcdGNvbXBvc2VyOiB0aGlzLFxuXHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgbmV3LXNlc3Npb24gdm9pY2UgY29udHJvbHM6JywgZXJyb3IpO1xuXHRcdH1cblxuXHRcdC8vIFNlZ21lbnRlZCB2b2ljZS9kaWN0YXRpb24gcGlsbCAoZXhwZXJpbWVudGFsKS4gV2hlbiBlbmFibGVkIGl0IHJlcGxhY2VzIHRoZVxuXHRcdC8vIHN0YW5kYWxvbmUgZGljdGF0aW9uIGJ1dHRvbiBhbmQgdm9pY2UgY29udHJvbHMgYWJvdmUgd2l0aCBhIHNpbmdsZSBjb250cm9sLlxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVWb2ljZUlucHV0TW9kZVBpbGwodG9vbGJhciwgY29udGFpbmVyKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIG5ldy1zZXNzaW9uIHZvaWNlIGlucHV0IG1vZGUgcGlsbDonLCBlcnJvcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9hZGluZ1NwaW5uZXIgPSBkb20uYXBwZW5kKHRvb2xiYXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1sb2FkaW5nLXNwaW5uZXInKSk7XG5cdFx0Y29uc3QgbG9hZGluZ0ljb24gPSBkb20uYXBwZW5kKHRoaXMuX2xvYWRpbmdTcGlubmVyLCByZW5kZXJJY29uKFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpKSk7XG5cdFx0bG9hZGluZ0ljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuX2xvYWRpbmdTcGlubmVyLCBsb2NhbGl6ZSgnbG9hZGluZycsIFwiTG9hZGluZy4uLlwiKSkpO1xuXHRcdHRoaXMuX2xvYWRpbmdTcGlubmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Zpc2libGUnLCB0aGlzLm9wdGlvbnMubG9hZGluZy5nZXQoKSk7XG5cblx0XHRjb25zdCBzZW5kQnV0dG9uQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0b29sYmFyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtc2VuZC1idXR0b24nKSk7XG5cdFx0Y29uc3Qgc2VuZEJ1dHRvbiA9IHRoaXMuX3NlbmRCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHNlbmRCdXR0b25Db250YWluZXIsIHtcblx0XHRcdHNlY29uZGFyeTogdHJ1ZSxcblx0XHRcdHRpdGxlOiB0aGlzLm9wdGlvbnMuc3VwcG9ydHNCYWNrZ3JvdW5kXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3NlbmRXaXRoQmFja2dyb3VuZEhpbnQnLCBcIlNlbmQgKEFsdC1jbGljayB0byBzdGFydCBpbiB0aGUgYmFja2dyb3VuZClcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnc2VuZCcsIFwiU2VuZFwiKSxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3NlbmQnLCBcIlNlbmRcIiksXG5cdFx0fSkpO1xuXHRcdHNlbmRCdXR0b24uaWNvbiA9IENvZGljb24uYXJyb3dVcENvbXBhY3Q7XG5cdFx0Ly8gSG9sZCBBbHQgd2hpbGUgY2xpY2tpbmcgU2VuZCB0byBzdGFydCB0aGUgc2Vzc2lvbiBpbiB0aGUgYmFja2dyb3VuZC5cblx0XHR0aGlzLl9yZWdpc3RlcihzZW5kQnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB0aGlzLl9zZW5kKCEhdGhpcy5vcHRpb25zLnN1cHBvcnRzQmFja2dyb3VuZCAmJiAhIShlIGFzIE1vdXNlRXZlbnQgfCBLZXlib2FyZEV2ZW50IHwgdW5kZWZpbmVkKT8uYWx0S2V5KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVm9pY2VJbnB1dE1vZGVQaWxsKHRvb2xiYXI6IEhUTUxFbGVtZW50LCBpbnB1dENvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBwaWxsQ29udGFpbmVyID0gZG9tLmFwcGVuZCh0b29sYmFyLCBkb20uJCgnLnNlc3Npb25zLWNoYXQtdm9pY2UtaW5wdXQtbW9kZScpKTtcblx0XHRjb25zdCBpc1ZvaWNlSW5wdXRBY3RpdmUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiBpc0VxdWFsKHRoaXMubmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZS5jdXJyZW50Vm9pY2VJbnB1dFJlc291cmNlLnJlYWQocmVhZGVyKSwgTkVXX0NIQVRfVk9JQ0VfU0VOVElORUwpKTtcblxuXHRcdGNvbnN0IGFjdGlvbiA9IHRvQWN0aW9uKHtcblx0XHRcdGlkOiBDaGF0Vm9pY2VJbnB1dE1vZGVBY3Rpb24uSUQsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlJywgXCJWb2ljZSBJbnB1dCBNb2RlXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB7IC8qIGludGVyYWN0aW9uIGhhbmRsZWQgYnkgdGhlIHZpZXcgaXRlbSAqLyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBpbGwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHtcblx0XHRcdC8vIERpY3RhdGlvbiBtdXN0IHRhcmdldCB0aGlzIGNvbXBvc2VyJ3MgZWRpdG9yLCBub3QgdGhlIGxhc3QgZm9jdXNlZFxuXHRcdFx0Ly8gY2hhdCB3aWRnZXQgKHRoaXMgY29tcG9zZXIgaXNuJ3QgYW4gYElDaGF0V2lkZ2V0YCkuXG5cdFx0XHR0b2dnbGVEaWN0YXRpb246ICgpID0+IHsgdm9pZCB0aGlzLnRvZ2dsZURpY3RhdGlvbigpOyB9LFxuXHRcdFx0aXNBY3RpdmU6IGlzVm9pY2VJbnB1dEFjdGl2ZSxcblx0XHR9KSk7XG5cdFx0cGlsbC5yZW5kZXIocGlsbENvbnRhaW5lcik7XG5cblx0XHQvLyBUaGUgcGlsbCBvbmx5IGVhcm5zIGl0cyBwbGFjZSB3aGVuIGl0IHdvdWxkIGhvc3QgYXQgbGVhc3QgdHdvIGNlbGxzOlxuXHRcdC8vICAgLSBib3RoIGRpY3RhdGlvbiBhbmQgVm9pY2UgTW9kZSBhcmUgYXZhaWxhYmxlLCBvclxuXHRcdC8vICAgLSBvbmx5IFZvaWNlIE1vZGUgaXMgYXZhaWxhYmxlIGluIG1hbnVhbCAobm9uLWhhbmRzLWZyZWUpIG1vZGUgQU5EIGFcblx0XHQvLyAgICAgc2Vzc2lvbiBpcyBhY3RpdmUsIHNvIGxpc3RlbiArIHZvaWNlLWNvbm5lY3Rpb24gY2VsbHMgYm90aCByZW5kZXIuXG5cdFx0Ly8gT3RoZXJ3aXNlIHRoZSBzdGFuZGFsb25lIGRpY3RhdGlvbiArIHZvaWNlIGNvbnRyb2xzIHNob3cgaW5zdGVhZC5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkaWN0ID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuZGljdGF0aW9uQXZhaWxhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZvaWNlID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uudm9pY2VBdmFpbGFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaGFuZHNGcmVlID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuaGFuZHNGcmVlLnJlYWQocmVhZGVyKTtcblx0XHRcdC8vIFRoZSB2b2ljZS1vbmx5IGJyYW5jaCdzIFwic2Vzc2lvbiBhY3RpdmVcIiBtdXN0IG1hdGNoIHRoZSBtYWluLXdpbmRvd1xuXHRcdFx0Ly8gYEFHRU5UU19WT0lDRV9DT05ORUNURURgIGNvbnRleHQga2V5LCB3aGljaCB0cmFja3MgYGlzQ29ubmVjdGVkYCBvbmx5LlxuXHRcdFx0Ly8gQ291bnRpbmcgYGlzQ29ubmVjdGluZ2AgaGVyZSB3b3VsZCBzaG93IHRoZSBwaWxsIHdoaWxlIHRoZSBzY29wZWRcblx0XHRcdC8vIHN0YW5kYWxvbmUgdG9vbGJhciBzdGlsbCBzaG93cyBpdHMgQ29ubmVjdGluZyBpdGVtIChkdXBsaWNhdGUgY29udHJvbHMpLlxuXHRcdFx0Y29uc3QgY29ubmVjdGVkID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHBpbGxBY3RpdmUgPSAoZGljdCAmJiB2b2ljZSkgfHwgKHZvaWNlICYmICFkaWN0ICYmICFoYW5kc0ZyZWUgJiYgY29ubmVjdGVkKTtcblx0XHRcdHBpbGxDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgIXBpbGxBY3RpdmUpO1xuXHRcdFx0Ly8gTWlycm9yIHRoZSBwaWxsJ3MgYWN0aXZlIHN0YXRlIG9udG8gdGhlIGlucHV0IGNvbnRhaW5lciBzbyB2b2ljZSBnbG93XG5cdFx0XHQvLyBzdHlsaW5nIChkcml2ZW4gYnkgdGhlIHZvaWNlIGNvbnRyb2xsZXIpIHN0YXlzIGNvbnNpc3RlbnQuXG5cdFx0XHRpbnB1dENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd2b2ljZS1pbnB1dC1tb2RlLXBpbGwnLCBwaWxsQWN0aXZlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVTcGVlY2hUb1RleHRCdXR0b24oY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0dFNlcnZpY2UgPSB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlO1xuXG5cdFx0Y29uc3QgYnV0dG9uID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbnMtY2hhdC1zdHQtYnV0dG9uJykpO1xuXHRcdGJ1dHRvbi50YWJJbmRleCA9IDA7XG5cdFx0YnV0dG9uLnJvbGUgPSAnYnV0dG9uJztcblx0XHRjb25zdCBtaWNMYWJlbCA9IGxvY2FsaXplKCdzZXNzaW9uc1N0dC5kaWN0YXRlJywgXCJEaWN0YXRlIChTcGVlY2ggdG8gVGV4dClcIik7XG5cdFx0Y29uc3Qgc3RvcExhYmVsID0gbG9jYWxpemUoJ3Nlc3Npb25zU3R0LnN0b3AnLCBcIlN0b3AgRGljdGF0aW9uXCIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKGJ1dHRvbiwgKCkgPT4gKHtcblx0XHRcdC8vIFdoaWxlIHRoZSBtb2RlbCBwcmVwYXJlcywgc3VyZmFjZSB0aGUgZG93bmxvYWQvY29ubmVjdGluZyBob3ZlclxuXHRcdFx0Ly8gKHdoaWNoIGludml0ZXMgdGhlIHVzZXIgdG8gY2xpY2sgdG8gY2FuY2VsKSBzbyB0aGlzIGNvbXBvc2VyIG1hdGNoZXNcblx0XHRcdC8vIHRoZSBtYWluIGNoYXQgdG9vbGJhciBhZmZvcmRhbmNlLiBJZGxlIGdldHMgdGhlIHJpY2hlciBkZXNjcmlwdGlvblxuXHRcdFx0Ly8gbmFtaW5nIHRoZSBjb25maWd1cmVkIGRpY3RhdGlvbiBtb2RlbC5cblx0XHRcdGNvbnRlbnQ6IHN0dFNlcnZpY2UuaXNQcmVwYXJpbmdNb2RlbFxuXHRcdFx0XHQ/IGdldERpY3RhdGlvbkRvd25sb2FkSG92ZXJNYXJrZG93bihzdHRTZXJ2aWNlKVxuXHRcdFx0XHQ6IChzdHRTZXJ2aWNlLnN0YXRlICE9PSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZSA/IHN0b3BMYWJlbCA6IGdldERpY3RhdGlvbkhvdmVyTWFya2Rvd24obWljTGFiZWwsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKSxcblx0XHRcdHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQkVMT1cgfSxcblx0XHRcdGFwcGVhcmFuY2U6IHsgc2hvd1BvaW50ZXI6IHRydWUgfVxuXHRcdH0pKSk7XG5cblx0XHRjb25zdCBkb3dubG9hZFJpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGljdGF0aW9uRG93bmxvYWRSaW5nPigpKTtcblx0XHRjb25zdCByZW5kZXJTdGF0ZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHByZXBhcmluZyA9IHN0dFNlcnZpY2UuaXNQcmVwYXJpbmdNb2RlbDtcblx0XHRcdC8vIE9ubHkgdGhlIGFjdGl2ZSBSZWNvcmRpbmcgc3RhdGUgc2hvdWxkIHJlYWQgYXMgXCJyZWNvcmRpbmdcIiAoZmlsbGVkXG5cdFx0XHQvLyBtaWMpLiBPbmNlIHRoZSB1c2VyIHN0b3BzLCB0aGUgc2VydmljZSBlbnRlcnMgVHJhbnNjcmliaW5nIHdoaWxlIGl0XG5cdFx0XHQvLyB3YWl0cyBmb3IgdGhlIGZpbmFsIHRyYW5zY3JpcHQgKHVwIHRvIGEgZmV3IHNlY29uZHMgb24gdGhlIGNsb3VkXG5cdFx0XHQvLyBiYWNrZW5kKTsgZHVyaW5nIHRoYXQgdGhlIG1pYyBtdXN0IGFscmVhZHkgcmVhZCBhcyBpZGxlLCBtYXRjaGluZ1xuXHRcdFx0Ly8gdGhlIGNoYXQgdG9vbGJhciB3aGljaCBmbGlwcyBhcyBzb29uIGFzIHJlY29yZGluZyBzdG9wcy5cblx0XHRcdGNvbnN0IHJlY29yZGluZyA9IHN0dFNlcnZpY2Uuc3RhdGUgPT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5SZWNvcmRpbmc7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSBzdHRTZXJ2aWNlLnN0YXRlICE9PSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZTtcblx0XHRcdGRvbS5jbGVhck5vZGUoYnV0dG9uKTtcblx0XHRcdGRvd25sb2FkUmluZy5jbGVhcigpO1xuXHRcdFx0aWYgKHByZXBhcmluZykge1xuXHRcdFx0XHQvLyBGaXJzdC11c2Ugb25seS4gU2hvdyBhIGRvd25sb2FkIGljb24gd3JhcHBlZCBieSBhIHByb2dyZXNzXG5cdFx0XHRcdC8vIHJpbmcgb25seSBkdXJpbmcgYW4gYWN0dWFsIG1vZGVsIGRvd25sb2FkIChhIGNvbmZpcm1lZCBjYWNoZVxuXHRcdFx0XHQvLyBtaXNzKTsgb3RoZXJ3aXNlIChsb2FkaW5nIGFuIGFscmVhZHktY2FjaGVkIG1vZGVsLCBvciB0aGUgY2xvdWRcblx0XHRcdFx0Ly8gYmFja2VuZCBjb25uZWN0aW5nKSByZW5kZXIgYSBwbGFpbiBzcGlubmVyIGluc3RlYWQuXG5cdFx0XHRcdC8vIEdseXBocyByZW5kZXIgYXQgdGhlIGNvbXBhY3QgMTJweCBzaXplLCBzbyB1c2UgdGhlIGAqQ29tcGFjdGBcblx0XHRcdFx0Ly8gdmFyaWFudHMgd2hlcmUgb25lIGV4aXN0cy5cblx0XHRcdFx0aWYgKHN0dFNlcnZpY2UuaXNEb3dubG9hZGluZ01vZGVsKSB7XG5cdFx0XHRcdFx0ZG9tLmFwcGVuZChidXR0b24sIHJlbmRlckljb24oQ29kaWNvbi5taWNEb3dubG9hZENvbXBhY3QpKTtcblx0XHRcdFx0XHRkb3dubG9hZFJpbmcudmFsdWUgPSBuZXcgRGljdGF0aW9uRG93bmxvYWRSaW5nKGJ1dHRvbiwgc3R0U2VydmljZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZG9tLmFwcGVuZChidXR0b24sIHJlbmRlckljb24oVGhlbWVJY29uLm1vZGlmeShDb2RpY29uLmxvYWRpbmdDb21wYWN0LCAnc3BpbicpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGBtaWNgIC8gYG1pY0ZpbGxlZGAgaGF2ZSBubyBjb21wYWN0IHZhcmlhbnQsIHNvIHRoZXkgc3RheSBhcy1pcy5cblx0XHRcdFx0ZG9tLmFwcGVuZChidXR0b24sIHJlbmRlckljb24ocmVjb3JkaW5nID8gQ29kaWNvbi5taWNGaWxsZWQgOiBDb2RpY29uLm1pYykpO1xuXHRcdFx0fVxuXHRcdFx0YnV0dG9uLmNsYXNzTGlzdC50b2dnbGUoJ3JlY29yZGluZycsIHJlY29yZGluZyAmJiAhcHJlcGFyaW5nKTtcblx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdwcmVwYXJpbmcnLCBwcmVwYXJpbmcpO1xuXHRcdFx0YnV0dG9uLmFyaWFMYWJlbCA9IHByZXBhcmluZ1xuXHRcdFx0XHQ/IGxvY2FsaXplKCdzZXNzaW9uc1N0dC5jYW5jZWxQcmVwYXJpbmcnLCBcIkNhbmNlbCBEaWN0YXRpb24uIHswfVwiLCBnZXREaWN0YXRpb25QcmVwYXJpbmdMYWJlbChzdHRTZXJ2aWNlKSlcblx0XHRcdFx0OiAoYWN0aXZlID8gc3RvcExhYmVsIDogbWljTGFiZWwpO1xuXHRcdH07XG5cdFx0cmVuZGVyU3RhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzdHRTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUocmVuZGVyU3RhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzdHRTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJlcGFyaW5nTW9kZWwocmVuZGVyU3RhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihzdHRTZXJ2aWNlLm9uRGlkQ2hhbmdlRG93bmxvYWRpbmdNb2RlbChyZW5kZXJTdGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNldHVwRGljdGF0aW9uTWljR2xvdyhidXR0b24sIHN0dFNlcnZpY2UsIHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UsIHVuZGVmaW5lZCwgdGhpcy50aGVtZVNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVZpc2liaWxpdHkgPSAoKSA9PiB7XG5cdFx0XHQvLyBNaXJyb3IgdGhlIGBNZW51SWQuQ2hhdEV4ZWN1dGVgIGRpY3RhdGlvbiBnYXRlOiBoaWRlIHdoaWxlXG5cdFx0XHQvLyB1bmNvbmZpZ3VyZWQsIGFuZCB3aGlsZSBWb2ljZSBNb2RlIGlzIGNvbm5lY3RlZCBzbyB0aGUgZGljdGF0aW9uIGFuZFxuXHRcdFx0Ly8gdm9pY2UgbWljIGFmZm9yZGFuY2VzIG5ldmVyIGNvbXBldGUgb24gdGhpcyBjb21wb3Nlci4gQWxzbyBoaWRlIHdoZW5cblx0XHRcdC8vIHRoZSBzZWdtZW50ZWQgdm9pY2UvZGljdGF0aW9uIHBpbGwgYXBwbGllcyAoYm90aCBtb2RlcyBhdmFpbGFibGUsIHNvXG5cdFx0XHQvLyB0aGUgcGlsbCBob3N0cyBpdHMgb3duIGRpY3RhdGlvbiBjZWxsKSwgd2hpY2ggc3VwZXJzZWRlcyB0aGlzIGJ1dHRvbi5cblx0XHRcdGNvbnN0IHZvaWNlQWN0aXZlID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpIHx8IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCk7XG5cdFx0XHRjb25zdCBkaWN0ID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuZGljdGF0aW9uQXZhaWxhYmxlLmdldCgpO1xuXHRcdFx0Y29uc3Qgdm9pY2UgPSB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS52b2ljZUF2YWlsYWJsZS5nZXQoKTtcblx0XHRcdGNvbnN0IGhhbmRzRnJlZSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLmhhbmRzRnJlZS5nZXQoKTtcblx0XHRcdC8vIE1hdGNoIHRoZSBwaWxsIGF1dG9ydW4gLyBgQUdFTlRTX1ZPSUNFX0NPTk5FQ1RFRGA6IHRoZSB2b2ljZS1vbmx5IGJyYW5jaFxuXHRcdFx0Ly8ga2V5cyBvZmYgYGlzQ29ubmVjdGVkYCBvbmx5LCBub3QgdGhlIGNvbm5lY3RpbmcgcGhhc2UuXG5cdFx0XHRjb25zdCBzZXNzaW9uQWN0aXZlID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpO1xuXHRcdFx0Y29uc3QgcGlsbEFjdGl2ZSA9IChkaWN0ICYmIHZvaWNlKSB8fCAodm9pY2UgJiYgIWRpY3QgJiYgIWhhbmRzRnJlZSAmJiBzZXNzaW9uQWN0aXZlKTtcblx0XHRcdGJ1dHRvbi5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhc3R0U2VydmljZS5pc0NvbmZpZ3VyZWQgfHwgdm9pY2VBY3RpdmUgfHwgcGlsbEFjdGl2ZSk7XG5cdFx0fTtcblx0XHR1cGRhdGVWaXNpYmlsaXR5KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2UuZGljdGF0aW9uQXZhaWxhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnZvaWNlQXZhaWxhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLmhhbmRzRnJlZS5yZWFkKHJlYWRlcik7XG5cdFx0XHR1cGRhdGVWaXNpYmlsaXR5KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0Ly8gQm90aCB0aGUgZW5hYmxlIGtpbGwtc3dpdGNoIGFuZCB0aGUgbW9kZWwgc2VsZWN0aW9uIGNhbiBjaGFuZ2Vcblx0XHRcdC8vIGF2YWlsYWJpbGl0eSAoZS5nLiBhbiB1bnN1cHBvcnRlZCBvbi1kZXZpY2UgcGxhdGZvcm0gYmVjb21lc1xuXHRcdFx0Ly8gY29uZmlndXJlZCB3aGVuIHN3aXRjaGluZyB0byB0aGUgY2xvdWQgYmFja2VuZCkuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZGljdGF0aW9uLmVuYWJsZWQnKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdkaWN0YXRpb24ubW9kZWwnKSkge1xuXHRcdFx0XHR1cGRhdGVWaXNpYmlsaXR5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdG9nZ2xlID0gKCkgPT4gdGhpcy50b2dnbGVEaWN0YXRpb24oKTtcblx0XHQvLyBBIHN0eWxlZCBkaXYgZG9lc24ndCBnZXQgRW50ZXIvU3BhY2UgYWN0aXZhdGlvbiBvciB0b3VjaCB0YXAgZm9yIGZyZWU7XG5cdFx0Ly8gd2lyZSB0aGVtIGV4cGxpY2l0bHkgc28gdGhlIGJ1dHRvbiBpcyBrZXlib2FyZC0gYW5kIHRvdWNoLWFjY2Vzc2libGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQoYnV0dG9uKSk7XG5cdFx0W2RvbS5FdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0uZm9yRWFjaChldmVudFR5cGUgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihidXR0b24sIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHR2b2lkIHRvZ2dsZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYnV0dG9uLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcblx0XHRcdFx0dm9pZCB0b2dnbGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSaWdodC1jbGljayBzaG93cyBkaWN0YXRpb24tc3BlY2lmaWMgZW50cmllcyAoXCJDb25maWd1cmUgS2V5YmluZGluZ1wiLFxuXHRcdC8vIFwiU2VsZWN0IE1pY3JvcGhvbmVcIiwgXCJEaXNhYmxlIERpY3RhdGlvblwiKSBtaXJyb3JpbmcgdGhlIGNoYXQtaW5wdXQgbWljXG5cdFx0Ly8gYnV0dG9uLCBzaW5jZSB0aGlzIGN1c3RvbSBidXR0b24gaXNuJ3QgYSBgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW1gLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZE1pY0J1dHRvbkNvbnRleHRNZW51TGlzdGVuZXIoXG5cdFx0XHRidXR0b24sXG5cdFx0XHQoKSA9PiBnZXREaWN0YXRpb25Db250ZXh0TWVudUFjdGlvbnModGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgVE9HR0xFX0RJQ1RBVElPTl9DT01NQU5EX0lEKSxcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRvZ2dsZSBkaWN0YXRpb24gaW50byB0aGlzIGNvbXBvc2VyJ3MgZWRpdG9yLiBTaGFyZWQgYnkgdGhlIG1pYyBidXR0b24gYW5kXG5cdCAqIHRoZSBDbWQvQ3RybCtJIGNob3JkICh7QGxpbmsgVE9HR0xFX0RJQ1RBVElPTl9DT01NQU5EX0lEfSk7IHRoZSBzaGFyZWRcblx0ICogRGljdGF0ZSBhY3Rpb24gY2FuJ3QgdGFyZ2V0IHRoaXMgY29tcG9zZXIgc2luY2UgaXQgaXNuJ3QgYW4gYElDaGF0V2lkZ2V0YC5cblx0ICovXG5cdGFzeW5jIHRvZ2dsZURpY3RhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCBydW5EaWN0YXRpb25TaG9ydGN1dCh7XG5cdFx0XHRzcGVlY2hTZXJ2aWNlOiB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLFxuXHRcdFx0a2V5YmluZGluZ1NlcnZpY2U6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0XHRsb2dTZXJ2aWNlOiB0aGlzLmxvZ1NlcnZpY2UsXG5cdFx0XHRvbmJvYXJkaW5nU2VydmljZTogdGhpcy5kaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSxcblx0XHR9LCBUT0dHTEVfRElDVEFUSU9OX0NPTU1BTkRfSUQsIHRoaXMuX2VkaXRvcik7XG5cdH1cblxuXHQvLyAtLS0gSW5wdXQgSGlzdG9yeSAoSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0KSAtLS1cblxuXHRzaG93UHJldmlvdXNWYWx1ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGlzdG9yeS5pc0F0U3RhcnQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fZHJhZnRTdGF0ZT8uaW5wdXRUZXh0IHx8IHRoaXMuX2RyYWZ0U3RhdGU/LmF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5faGlzdG9yeS5vdmVybGF5KHRoaXMuX3RvSGlzdG9yeUVudHJ5KHRoaXMuX2RyYWZ0U3RhdGUpKTtcblx0XHR9XG5cdFx0dGhpcy5fbmF2aWdhdGVIaXN0b3J5KHRydWUpO1xuXHR9XG5cblx0c2hvd05leHRWYWx1ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGlzdG9yeS5pc0F0RW5kKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2RyYWZ0U3RhdGU/LmlucHV0VGV4dCB8fCB0aGlzLl9kcmFmdFN0YXRlPy5hdHRhY2htZW50cy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX2hpc3Rvcnkub3ZlcmxheSh0aGlzLl90b0hpc3RvcnlFbnRyeSh0aGlzLl9kcmFmdFN0YXRlKSk7XG5cdFx0fVxuXHRcdHRoaXMuX25hdmlnYXRlSGlzdG9yeShmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVEcmFmdFN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RyYWZ0U3RhdGUgPSB7XG5cdFx0XHRpbnB1dFRleHQ6IHRoaXMuX2VkaXRvcj8uZ2V0TW9kZWwoKT8uZ2V0VmFsdWUoKSA/PyAnJyxcblx0XHRcdGF0dGFjaG1lbnRzOiBbLi4udGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmF0dGFjaG1lbnRzXSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9IaXN0b3J5RW50cnkoZHJhZnQ6IElEcmFmdFN0YXRlKTogSUNoYXRNb2RlbElucHV0U3RhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5kcmFmdCxcblx0XHRcdG1vZGU6IHsgaWQ6IENoYXRNb2RlS2luZC5BZ2VudCwga2luZDogQ2hhdE1vZGVLaW5kLkFnZW50IH0sXG5cdFx0XHRzZWxlY3RlZE1vZGVsOiB1bmRlZmluZWQsXG5cdFx0XHRzZWxlY3Rpb25zOiBbXSxcblx0XHRcdGNvbnRyaWI6IHt9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9uYXZpZ2F0ZUhpc3RvcnkocHJldmlvdXM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHByZXZpb3VzID8gdGhpcy5faGlzdG9yeS5wcmV2aW91cygpIDogdGhpcy5faGlzdG9yeS5uZXh0KCk7XG5cdFx0Y29uc3QgaW5wdXRUZXh0ID0gZW50cnk/LmlucHV0VGV4dCA/PyAnJztcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdHRoaXMuX2VkaXRvcj8uZ2V0TW9kZWwoKT8uc2V0VmFsdWUoaW5wdXRUZXh0KTtcblx0XHRcdHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5zZXRBdHRhY2htZW50cyhlbnRyeS5hdHRhY2htZW50cyk7XG5cdFx0fVxuXHRcdGFyaWEuc3RhdHVzKGlucHV0VGV4dCk7XG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0Y29uc3QgbGFzdExpbmUgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogbGFzdExpbmUsIGNvbHVtbjogbW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZSkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFNlbmQgLS0tXG5cblxuXHRhc3luYyBzdWJtaXQoYmFja2dyb3VuZCA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmQoYmFja2dyb3VuZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZW5kKGJhY2tncm91bmQgPSBmYWxzZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJhd1F1ZXJ5ID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LmdldFZhbHVlKCkgPz8gJyc7XG5cdFx0Y29uc3QgcXVlcnkgPSByYXdRdWVyeS50cmltKCk7XG5cdFx0Y29uc3QgcXVlcnlPZmZzZXQgPSByYXdRdWVyeS5sZW5ndGggLSByYXdRdWVyeS50cmltU3RhcnQoKS5sZW5ndGg7XG5cdFx0Y29uc3QgaGFzU2VuZGFibGVBdHRhY2htZW50ID0gdGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmF0dGFjaG1lbnRzLnNvbWUoaXNFeHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVFbnRyeSk7XG5cdFx0Y29uc3QgaGFzQWRkaXRpb25hbFNlbmRDb250ZW50ID0gdGhpcy5vcHRpb25zLmhhc0FkZGl0aW9uYWxTZW5kQ29udGVudD8uZ2V0KCkgPz8gZmFsc2U7XG5cdFx0aWYgKCghcXVlcnkgJiYgIWhhc1NlbmRhYmxlQXR0YWNobWVudCAmJiAhaGFzQWRkaXRpb25hbFNlbmRDb250ZW50KSB8fCB0aGlzLl9zZW5kaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzcGVjdCB0aGUgc2FtZSBnYXRlIGFzIHRoZSBzZW5kIGJ1dHRvbiAoZS5nLiBhIHNlc3Npb24gd2l0aCBub1xuXHRcdC8vIHVzYWJsZSBtb2RlbCkuIFRoZSBFbnRlciBrZXliaW5kaW5nIGFuZCBzbGFzaC1jb21tYW5kIHBhdGhzIHJlYWNoXG5cdFx0Ly8gaGVyZSBkaXJlY3RseSwgYnlwYXNzaW5nIHRoZSBidXR0b24ncyBkaXNhYmxlZCBzdGF0ZS5cblx0XHRpZiAoIXRoaXMuX2NhblNlbmRSZXF1ZXN0LmdldCgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gTWVhc3VyZSBhbnkgcGVuZGluZyBkaWN0YXRpb24gYWNjdXJhY3kgYWdhaW5zdCB0aGUgdGV4dCBiZWluZyBzZW50LFxuXHRcdC8vIGJlZm9yZSB0aGUgZWRpdG9yIGlzIGNsZWFyZWQgYmVsb3cuXG5cdFx0bm90aWZ5RGljdGF0aW9uU3VibWl0dGVkKHRoaXMuX2VkaXRvcik7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5vcHRpb25zLnNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFoYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQgJiYgc2Vzc2lvbiAmJiBhd2FpdCB0aGlzLmNoYXRTdWJtaXRSZXF1ZXN0SGFuZGxlclNlcnZpY2UudHJ5SGFuZGxlKHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZSxcblx0XHRcdHByb3ZpZGVySWQ6IHNlc3Npb24ucHJvdmlkZXJJZCxcblx0XHRcdHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsXG5cdFx0XHRpbnB1dDogcXVlcnksXG5cdFx0fSkpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpPy5zZXRWYWx1ZSgnJyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBhdHRhY2htZW50cyA9IHRoaXMuX2FnZW50SG9zdElucHV0Q29tcGxldGlvbkhhbmRsZXI/LmdldEF0dGFjaG1lbnRzRm9yU2VuZChxdWVyeSwgcXVlcnlPZmZzZXQpID8/IFsuLi50aGlzLl9jb250ZXh0QXR0YWNobWVudHMuYXR0YWNobWVudHNdO1xuXHRcdGNvbnN0IGF0dGFjaGVkQ29udGV4dCA9IGF0dGFjaG1lbnRzLmxlbmd0aCA+IDBcblx0XHRcdD8gYXR0YWNobWVudHNcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBxdWVyeTtcblxuXHRcdGlmICh0aGlzLl9kcmFmdFN0YXRlKSB7XG5cdFx0XHR0aGlzLl9oaXN0b3J5LmFwcGVuZCh0aGlzLl90b0hpc3RvcnlFbnRyeSh0aGlzLl9kcmFmdFN0YXRlKSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NsZWFyRHJhZnRTdGF0ZSgpO1xuXG5cdFx0dGhpcy5fc2VuZGluZyA9IHRydWU7XG5cdFx0dGhpcy5fZWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyByZWFkT25seTogdHJ1ZSB9KTtcblx0XHR0aGlzLl91cGRhdGVTZW5kQnV0dG9uU3RhdGUoKTtcblx0XHR0aGlzLl91cGRhdGVJbnB1dExvYWRpbmdTdGF0ZSgpO1xuXG5cdFx0bGV0IHNlbnQgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0c2VudCA9IGF3YWl0IHRoaXMub3B0aW9ucy5zZW5kUmVxdWVzdCh7IHF1ZXJ5OiByZXF1ZXN0LCBhdHRhY2htZW50czogYXR0YWNoZWRDb250ZXh0LCBiYWNrZ3JvdW5kIH0pO1xuXHRcdFx0aWYgKCFzZW50KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmdldE1vZGVsKCk/LnNldFZhbHVlKCcnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIHJlcXVlc3Q6JywgZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3NlbmRpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2VkaXRvci51cGRhdGVPcHRpb25zKHsgcmVhZE9ubHk6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5fdXBkYXRlRHJhZnRTdGF0ZSgpO1xuXHRcdFx0dGhpcy5fdXBkYXRlU2VuZEJ1dHRvblN0YXRlKCk7XG5cdFx0XHR0aGlzLl91cGRhdGVJbnB1dExvYWRpbmdTdGF0ZSgpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2VudDtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVNlbmRCdXR0b25TdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3NlbmRCdXR0b24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaGFzVGV4dCA9ICEhdGhpcy5fZWRpdG9yPy5nZXRNb2RlbCgpPy5nZXRWYWx1ZSgpLnRyaW0oKTtcblx0XHRjb25zdCBoYXNTZW5kYWJsZUF0dGFjaG1lbnQgPSB0aGlzLl9jb250ZXh0QXR0YWNobWVudHMuYXR0YWNobWVudHMuc29tZShpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KTtcblx0XHRjb25zdCBoYXNBZGRpdGlvbmFsU2VuZENvbnRlbnQgPSB0aGlzLm9wdGlvbnMuaGFzQWRkaXRpb25hbFNlbmRDb250ZW50Py5nZXQoKSA/PyBmYWxzZTtcblx0XHR0aGlzLl9zZW5kQnV0dG9uLmVuYWJsZWQgPSAhdGhpcy5fc2VuZGluZyAmJiAoaGFzVGV4dCB8fCBoYXNTZW5kYWJsZUF0dGFjaG1lbnQgfHwgaGFzQWRkaXRpb25hbFNlbmRDb250ZW50KSAmJiB0aGlzLl9jYW5TZW5kUmVxdWVzdC5nZXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVTdGF0ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBkcmFmdCA9IHRoaXMuX2dldERyYWZ0U3RhdGUoKTtcblx0XHRpZiAoZHJhZnQpIHtcblx0XHRcdHRoaXMuX2VkaXRvcj8uZ2V0TW9kZWwoKT8uc2V0VmFsdWUoZHJhZnQuaW5wdXRUZXh0KTtcblx0XHRcdGlmIChkcmFmdC5hdHRhY2htZW50cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRleHRBdHRhY2htZW50cy5zZXRBdHRhY2htZW50cyhkcmFmdC5hdHRhY2htZW50cy5tYXAoSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeS5mcm9tRXhwb3J0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RHJhZnRTdGF0ZSgpOiBJRHJhZnRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmF3ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoU1RPUkFHRV9LRVlfRFJBRlRfU1RBVEUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UocmF3KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJEcmFmdFN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2RyYWZ0U3RhdGUgPSB7IGlucHV0VGV4dDogJycsIGF0dGFjaG1lbnRzOiBbXSB9O1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfRFJBRlRfU1RBVEUsIEpTT04uc3RyaW5naWZ5KHRoaXMuX2RyYWZ0U3RhdGUpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0c2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kcmFmdFN0YXRlKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHtcblx0XHRcdFx0Li4udGhpcy5fZHJhZnRTdGF0ZSxcblx0XHRcdFx0YXR0YWNobWVudHM6IHRoaXMuX2RyYWZ0U3RhdGUuYXR0YWNobWVudHMubWFwKElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkudG9FeHBvcnQpLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfRFJBRlRfU1RBVEUsIEpTT04uc3RyaW5naWZ5KHN0YXRlKSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRsYXlvdXQoX2hlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fY29tcGFjdE1vZGVsUGlja2VyLnNldCh3aWR0aCA8IE5ld0NoYXRJbnB1dFdpZGdldC5jb21wYWN0TW9kZWxQaWNrZXJXaWR0aCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9lZGl0b3I/LmxheW91dCgpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yPy5mb2N1cygpO1xuXHR9XG5cblx0LyoqIFNlZSB7QGxpbmsgSU5ld0NoYXRWb2ljZUNvbXBvc2VyLnJvdXRlc1doaWxlU2Vzc2lvbkFjdGl2ZX0uICovXG5cdGdldCByb3V0ZXNXaGlsZVNlc3Npb25BY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy52b2ljZVJvdXRlc1doaWxlU2Vzc2lvbkFjdGl2ZSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByZWZpbGxJbnB1dCh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9lZGl0b3I7XG5cdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3I/LmdldE1vZGVsKCk7XG5cdFx0aWYgKGVkaXRvciAmJiBtb2RlbCkge1xuXHRcdFx0bW9kZWwuc2V0VmFsdWUodGV4dCk7XG5cdFx0XHRjb25zdCBsYXN0TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Y29uc3QgbWF4Q29sdW1uID0gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsYXN0TGluZSk7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiBsYXN0TGluZSwgY29sdW1uOiBtYXhDb2x1bW4gfSk7XG5cdFx0XHRlZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRzZW5kUXVlcnkodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQSBzdWJtaXQgaXMgYWxyZWFkeSBpbiBmbGlnaHQgKGUuZy4gYSByYXBpZCBzZWNvbmQgdHJhbnNjcmlwdCBiZWZvcmUgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBpcyBjcmVhdGVkKTsgZG9uJ3QgY2xvYmJlciB0aGUgaW4tZmxpZ2h0IHRleHQgb3IgZG91YmxlLXN1Ym1pdC5cblx0XHRpZiAodGhpcy5fc2VuZGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvcj8uZ2V0TW9kZWwoKTtcblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGNvbnN0IGNvbWJpbmVkID0gY29tYmluZVZvaWNlSW5wdXQobW9kZWwuZ2V0VmFsdWUoKSwgdGV4dCk7XG5cdFx0XHRtb2RlbC5zZXRWYWx1ZShjb21iaW5lZCk7XG5cdFx0XHR0aGlzLl9zZW5kKCk7XG5cdFx0fVxuXHR9XG5cblx0YXR0YWNoKHVyaXM6IFVSSVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dEF0dGFjaG1lbnRzLmFkZEF0dGFjaG1lbnRzKC4uLnVyaXMubWFwKHVyaSA9PiB0b0ZpbGVWYXJpYWJsZUVudHJ5KHVyaSkpKTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsU0FBUyxhQUFhLHNCQUFzQjtBQUNyRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUM3RSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxjQUFjO0FBRXZCLFNBQTBDLCtCQUErQjtBQUN6RSxTQUFTLHdCQUFrRDtBQUMzRCxTQUFTLGdDQUFnQztBQUV6QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBQ2xFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCLHdCQUF3QjtBQUN0RCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFVBQVU7QUFDdEIsU0FBUyw2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
