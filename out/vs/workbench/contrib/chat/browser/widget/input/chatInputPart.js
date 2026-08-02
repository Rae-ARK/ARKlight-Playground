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
import * as dom from "../../../../../../base/browser/dom.js";
import { addDisposableListener } from "../../../../../../base/browser/dom.js";
import { DEFAULT_FONT_FAMILY } from "../../../../../../base/browser/fonts.js";
import { hasModifierKeys } from "../../../../../../base/browser/keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem } from "../../../../../../base/browser/ui/actionbar/actionViewItems.js";
import * as aria from "../../../../../../base/browser/ui/aria/aria.js";
import { ButtonWithIcon } from "../../../../../../base/browser/ui/button/button.js";
import { createInstantHoverDelegate } from "../../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { equals as arraysEqual } from "../../../../../../base/common/arrays.js";
import { DeferredPromise, RunOnceScheduler } from "../../../../../../base/common/async.js";
import { isDefined } from "../../../../../../base/common/types.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { KeyCode } from "../../../../../../base/common/keyCodes.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { mixin } from "../../../../../../base/common/objects.js";
import { autorun, constObservable, derived, derivedOpts, observableFromEvent, observableValue, transaction } from "../../../../../../base/common/observable.js";
import { isMacintosh } from "../../../../../../base/common/platform.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { EditorOptions } from "../../../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../../../editor/common/config/fontInfo.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { isLocation } from "../../../../../../editor/common/languages.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { CopyPasteController } from "../../../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { DropIntoEditorController } from "../../../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { ContentHoverController } from "../../../../../../editor/contrib/hover/browser/contentHoverController.js";
import { GlyphHoverController } from "../../../../../../editor/contrib/hover/browser/glyphHoverController.js";
import { LinkDetector } from "../../../../../../editor/contrib/links/browser/links.js";
import { SuggestController } from "../../../../../../editor/contrib/suggest/browser/suggestController.js";
import { localize } from "../../../../../../nls.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { MenuWorkbenchButtonBar } from "../../../../../../platform/actions/browser/buttonbar.js";
import { MenuEntryActionViewItem } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuItemAction } from "../../../../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { registerAndCreateHistoryNavigationContext } from "../../../../../../platform/history/browser/contextScopedHistoryWidget.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { canLog, ILogService, LogLevel } from "../../../../../../platform/log/common/log.js";
import { observableMemento } from "../../../../../../platform/observable/common/observableMemento.js";
import { bindContextKey } from "../../../../../../platform/observable/common/platformObservableUtils.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { IVoiceModeOnboardingService } from "../../../../agentsVoice/browser/voiceModeOnboarding.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { ISharedWebContentExtractorService } from "../../../../../../platform/webContentExtractor/common/webContentExtractor.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../../platform/workspace/common/workspace.js";
import { ISCMService } from "../../../../scm/common/scm.js";
import { IWorkbenchLayoutService, Position } from "../../../../../services/layout/browser/layoutService.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../../common/views.js";
import { ResourceLabels } from "../../../../../browser/labels.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { AccessibilityVerbositySettingId } from "../../../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../../../accessibility/common/accessibilityCommands.js";
import { getSimpleCodeEditorWidgetOptions, getSimpleEditorOptions, setupSimpleEditorSelectionStyling } from "../../../../codeEditor/browser/simpleEditorOptions.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { ChatRequestVariableSet, getImageAttachmentLimit, isAgentHostCompletionVariableEntry, isBrowserViewVariableEntry, isElementVariableEntry, isExplicitFileOrImageVariableEntry, isImageVariableEntry, isNotebookOutputVariableEntry, isPasteVariableEntry, isPromptFileVariableEntry, isPromptTextVariableEntry, isSCMHistoryItemChangeRangeVariableEntry, isSCMHistoryItemChangeVariableEntry, isSCMHistoryItemVariableEntry, isStringVariableEntry, OmittedState } from "../../../common/attachments/chatVariableEntries.js";
import { ChatMode, getModeNameForTelemetry, IChatModeService } from "../../../common/chatModes.js";
import { IChatSessionsService, isAgentHostTarget, isIChatSessionFileChange2, localChatSessionType, SessionType } from "../../../common/chatSessionsService.js";
import { getSelectedModelStorageKey, getStoredSelectedModel, storeSelectedModel } from "../../../common/chatSelectedModel.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, ChatPermissionLevel, isChatPermissionLevel } from "../../../common/constants.js";
import { isAutoApprovePolicyRestricted, isAutoApproveValuePolicyRestricted } from "../../../common/agentHostConfigPolicy.js";
import { ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatInputModelSelectionController } from "./chatInputModelSelectionController.js";
import { ChatModelConfigurationStore } from "./chatModelConfigurationStore.js";
import { ChatModelSelectionDiagnostics } from "./chatModelSelectionDiagnostics.js";
import { deserializeUntitledInputAttachments, deserializeUntitledInputState, serializeUntitledInputAttachments, serializeUntitledInputState } from "./chatInputStatePersistence.js";
import { ChatInputStateOrigin, logChangesToStateModel } from "../../../common/model/chatModel.js";
import { filterModelsForSession, hasModelsTargetingSession, isModelHiddenInPicker, isNewConversation, mergeModelsWithCache, shouldResetOnModelListChange } from "./chatInputModelUtils.js";
import { getChatSessionType, LocalChatSessionUri } from "../../../common/model/chatUri.js";
import { isResponseVM } from "../../../common/model/chatViewModel.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ILanguageModelToolsService } from "../../../common/tools/languageModelToolsService.js";
import { ChatHistoryNavigator } from "../../../common/widget/chatWidgetHistoryService.js";
import { ChatEditingSessionSubmitAction, ChatSessionPrimaryPickerAction, ChatSubmitAction, OpenDelegationPickerAction, OpenModelPickerAction, OpenModePickerAction, OpenPermissionPickerAction, OpenSessionTargetPickerAction, OpenWorkspacePickerAction } from "../../actions/chatExecuteActions.js";
import { ChatVoiceInputModeAction, VoiceInputModeActionViewItem } from "../../voiceInputMode/voiceInputModeActionViewItem.js";
import { ChatSpeechToTextConnectingAction, ChatSpeechToTextPreparingAction, ToggleChatSpeechToTextAction } from "../../actions/chatSpeechToTextActions.js";
import { DictationActionViewItem } from "../../speechToText/dictationActionViewItem.js";
import { DictationDownloadActionViewItem } from "../../speechToText/dictationDownloadActionViewItem.js";
import { IDictationOnboardingService } from "../../speechToText/dictationOnboarding.js";
import { notifyDictationSubmitted } from "../../speechToText/dictationSession.js";
import { VoiceModeActionViewItem } from "../../voiceClient/voiceModeActionViewItem.js";
import { AgentSessionProviders, getAgentSessionProvider } from "../../agentSessions/agentSessions.js";
import { getAgentSessionPullRequestContextValue } from "../../agentSessions/agentSessionsModel.js";
import { IAgentSessionsService } from "../../agentSessions/agentSessionsService.js";
import { ChatAttachmentModel } from "../../attachments/chatAttachmentModel.js";
import { IChatAttachmentWidgetRegistry } from "../../attachments/chatAttachmentWidgetRegistry.js";
import { DefaultChatAttachmentWidget, ElementChatAttachmentWidget, FileAttachmentWidget, ImageAttachmentWidget, BrowserViewAttachmentWidget, NotebookCellOutputChatAttachmentWidget, PasteAttachmentWidget, PromptFileAttachmentWidget, PromptTextAttachmentWidget, SCMHistoryItemAttachmentWidget, SCMHistoryItemChangeAttachmentWidget, SCMHistoryItemChangeRangeAttachmentWidget, TerminalCommandAttachmentWidget, ToolSetOrToolItemAttachmentWidget } from "../../attachments/chatAttachmentWidgets.js";
import { ChatImplicitContexts } from "../../attachments/chatImplicitContext.js";
import { ImplicitContextAttachmentWidget } from "../../attachments/implicitContextAttachment.js";
import { IChatWidgetService, isIChatResourceViewContext, isIChatViewViewContext } from "../../chat.js";
import { ChatEditingShowChangesAction, ViewPreviousEditsAction } from "../../chatEditing/chatEditingActions.js";
import { resizeImage } from "../../chatImageUtils.js";
import { ChatSessionPickerActionItem } from "../../chatSessions/chatSessionPickerActionItem.js";
import { AgentHostChatInputPicker, AgentHostChatInputPickerActionViewItem } from "../../agentSessions/agentHost/agentHostChatInputPicker.js";
import { getAgentHostPickerProperty, OpenAgentHostAutoApprovePickerAction, OpenAgentHostCodexApprovalsPickerAction, OpenAgentHostModePickerAction, OpenAgentHostPermissionModePickerAction, OpenAgentHostFolderPickerAction } from "../../agentSessions/agentHost/agentHostChatInputPicker.contribution.js";
import { AgentHostGenericConfigChips } from "../../agentSessions/agentHost/agentHostGenericConfigChips.js";
import { AgentHostFolderPickerActionItem } from "../../agentSessions/agentHost/agentHostFolderPickerActionItem.js";
import { IChatPhoneInputPresenter, MobileChatInputCombinedPickerActionItem } from "./chatPhoneInputPresenter.js";
import { IChatContextService } from "../../contextContrib/chatContextService.js";
import { ChatPlanReviewPart } from "../chatContentParts/chatPlanReviewPart.js";
import { ChatQuestionCarouselPart } from "../chatContentParts/chatQuestionCarouselPart.js";
import { ChatToolConfirmationCarouselPart } from "../chatContentParts/toolInvocationParts/chatToolConfirmationCarouselPart.js";
import { CollapsibleListPool } from "../chatContentParts/chatReferencesContentPart.js";
import { ChatTodoListWidget } from "../chatContentParts/chatTodoListWidget.js";
import { ChatArtifactsWidget } from "../chatArtifactsWidget.js";
import { handleTerminalCommandPaste, isTerminalCommandInput } from "../../chatTerminalCommandPaste.js";
import { ChatDragAndDrop } from "../chatDragAndDrop.js";
import { ChatFollowups } from "./chatFollowups.js";
import { IChatInputNotificationService } from "./chatInputNotificationService.js";
import { ChatGoalBannerWidget } from "./chatGoalBannerWidget.js";
import { ChatInputNotificationWidget } from "./chatInputNotificationWidget.js";
import { ChatSelectedTools } from "./chatSelectedTools.js";
import { DelegationSessionPickerActionItem } from "./delegationSessionPickerActionItem.js";
import { ModelPickerActionItem } from "./modelPicker/modelPickerActionItem.js";
import { isModeConsideredBuiltIn, ModePickerActionItem } from "./modePickerActionItem.js";
import { PermissionPickerActionItem } from "./permissionPickerActionItem.js";
import { SessionTypePickerActionItem } from "./sessionTargetPickerActionItem.js";
import { WorkspacePickerActionItem } from "./workspacePickerActionItem.js";
import { ChatContextUsageWidget } from "../../widgetHosts/viewPane/chatContextUsageWidget.js";
import { Target } from "../../../common/promptSyntax/promptTypes.js";
import { findLast } from "../../../../../../base/common/arraysFind.js";
import { ConfigureToolsAction } from "../../actions/chatToolActions.js";
import { InlineCompletionsController } from "../../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { PlaceholderTextContribution } from "../../../../../../editor/contrib/placeholderText/browser/placeholderTextContribution.js";
const $ = dom.$;
const INPUT_EDITOR_MAX_HEIGHT = 250;
const INPUT_EDITOR_LINE_HEIGHT = 20;
const INPUT_EDITOR_PADDING = { compact: { top: 2, bottom: 2 }, default: { top: 12, bottom: 12 } };
const CachedLanguageModelsKey = "chat.cachedLanguageModels.v2";
const CHAT_INPUT_PICKER_COLLAPSE_WIDTH = 280;
const PERMISSION_LEVEL_OPTION_ID = "permissionLevel";
var ChatWidgetLocation = /* @__PURE__ */ ((ChatWidgetLocation2) => {
  ChatWidgetLocation2["SidebarLeft"] = "sidebarLeft";
  ChatWidgetLocation2["SidebarRight"] = "sidebarRight";
  ChatWidgetLocation2["Panel"] = "panel";
  ChatWidgetLocation2["Editor"] = "editor";
  return ChatWidgetLocation2;
})(ChatWidgetLocation || {});
const LEGACY_SHARED_INPUT_STATE_TAGS = /* @__PURE__ */ new Set(["view", "editor", "quick"]);
function getInputStateStorageKey(widgetViewKindTag) {
  if (LEGACY_SHARED_INPUT_STATE_TAGS.has(widgetViewKindTag)) {
    return "chat.untitledInputState";
  }
  return `chat.untitledInputState.${widgetViewKindTag}`;
}
function createEmptyInputStateMemento(widgetViewKindTag) {
  return observableMemento({
    defaultValue: void 0,
    key: getInputStateStorageKey(widgetViewKindTag),
    toStorage: serializeUntitledInputState,
    fromStorage(value) {
      const obj = deserializeUntitledInputState(value);
      if (obj.selectedModel && !obj.selectedModel.metadata.isDefaultForLocation) {
        const oldIsDefault = obj.selectedModel.metadata.isDefault;
        const isDefaultForLocation = { [ChatAgentLocation.Chat]: Boolean(oldIsDefault) };
        mixin(obj.selectedModel.metadata, { isDefaultForLocation });
        delete obj.selectedModel.metadata.isDefault;
      }
      return obj;
    }
  });
}
const emptyInputAttachments = observableMemento({
  defaultValue: [],
  key: "chat.untitledInputAttachments",
  toStorage: serializeUntitledInputAttachments,
  fromStorage: deserializeUntitledInputAttachments
});
let ChatInputPart = class extends Disposable {
  constructor(location, options, styles, inline, modelService, instantiationService, contextKeyService, configurationService, keybindingService, accessibilityService, languageModelsService, logService, fileService, editorService, themeService, textModelResolverService, storageService, dialogService, agentService, sharedWebExtracterService, entitlementService, chatModeService, toolService, chatSessionsService, chatContextService, agentSessionsService, dictationOnboardingService, workspaceContextService, scmService, layoutService, viewDescriptorService, _chatAttachmentWidgetRegistry, chatInputNotificationService, chatPhoneInputPresenter, productService, voiceModeOnboardingService, chatWidgetService) {
    super();
    this.location = location;
    this.options = options;
    this.inline = inline;
    this.modelService = modelService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.accessibilityService = accessibilityService;
    this.languageModelsService = languageModelsService;
    this.logService = logService;
    this.fileService = fileService;
    this.editorService = editorService;
    this.themeService = themeService;
    this.textModelResolverService = textModelResolverService;
    this.storageService = storageService;
    this.dialogService = dialogService;
    this.agentService = agentService;
    this.sharedWebExtracterService = sharedWebExtracterService;
    this.entitlementService = entitlementService;
    this.chatModeService = chatModeService;
    this.toolService = toolService;
    this.chatSessionsService = chatSessionsService;
    this.chatContextService = chatContextService;
    this.agentSessionsService = agentSessionsService;
    this.dictationOnboardingService = dictationOnboardingService;
    this.workspaceContextService = workspaceContextService;
    this.scmService = scmService;
    this.layoutService = layoutService;
    this.viewDescriptorService = viewDescriptorService;
    this._chatAttachmentWidgetRegistry = _chatAttachmentWidgetRegistry;
    this.chatInputNotificationService = chatInputNotificationService;
    this.chatPhoneInputPresenter = chatPhoneInputPresenter;
    this.productService = productService;
    this.voiceModeOnboardingService = voiceModeOnboardingService;
    this.chatWidgetService = chatWidgetService;
    this._workingSetCollapsed = observableValue("chatInputPart.workingSetCollapsed", true);
    this._stableInputPartWidth = observableValue("chatInputPart.stableInputPartWidth", 0);
    this._chatInputTodoListWidget = this._register(new MutableDisposable());
    this._chatArtifactsWidget = this._register(new MutableDisposable());
    this._chatQuestionCarouselWidgets = this._register(new DisposableMap());
    this._questionCarouselResponseIds = /* @__PURE__ */ new Map();
    this._questionCarouselSessionResources = /* @__PURE__ */ new Map();
    this._chatPlanReviewWidgets = this._register(new DisposableMap());
    this._planReviewResponseIds = /* @__PURE__ */ new Map();
    this._planReviewSessionResources = /* @__PURE__ */ new Map();
    this._chatToolConfirmationCarousels = this._register(new DisposableMap());
    this._onDidChangeActiveConfirmationSubagent = this._register(new Emitter());
    this.onDidChangeActiveConfirmationSubagent = this._onDidChangeActiveConfirmationSubagent.event;
    this._chatEditingTodosDisposables = this._register(new DisposableStore());
    this._onDidLoadInputState = this._register(new Emitter());
    this.onDidLoadInputState = this._onDidLoadInputState.event;
    this._toolbarRelayoutScheduler = this._register(new RunOnceScheduler(() => {
      if (typeof this.cachedWidth === "number") {
        this.layout(this.cachedWidth);
      }
    }, 0));
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this._onDidChangeContext = this._register(new Emitter());
    this.onDidChangeContext = this._onDidChangeContext.event;
    this._onDidAcceptFollowup = this._register(new Emitter());
    this.onDidAcceptFollowup = this._onDidAcceptFollowup.event;
    this._onDidClickOverlay = this._register(new Emitter());
    this.onDidClickOverlay = this._onDidClickOverlay.event;
    this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
    this._indexOfLastOpenedContext = -1;
    this._onDidChangeVisibility = this._register(new Emitter());
    this.inputEditorHeight = 0;
    this.followupsDisposables = this._register(new DisposableStore());
    this.overlayClickListener = this._register(new MutableDisposable());
    this.attachedContextDisposables = this._register(new MutableDisposable());
    this._notificationWidget = this._register(new MutableDisposable());
    this._goalBannerWidget = this._register(new MutableDisposable());
    this._onDidDismissGoalBanner = this._register(new Emitter());
    /** Fired when the user dismisses the autopilot goal banner. */
    this.onDidDismissGoalBanner = this._onDidDismissGoalBanner.event;
    this._contextUsageDisposables = this._register(new MutableDisposable());
    this.height = observableValue(this, 0);
    this._forceVisibleScrollbarUntilAccept = false;
    // Disposables for model observation
    this._modelSyncDisposables = this._register(new DisposableStore());
    this._currentChatModes = this._register(new MutableDisposable());
    // Flag to prevent circular updates between view and model
    this._isSyncingToOrFromInputModel = false;
    this.permissionWidgetDisposeListener = this._register(new MutableDisposable());
    this.chatSessionPickerWidgets = this._register(new DisposableMap());
    this._chatSessionOptionEmitters = this._register(new DisposableMap());
    /**
     * Map of option group ID to its context key.
     * Keys follow the pattern `chatSessionOption.<groupId>` and hold the currently selected option item ID.
     */
    this._optionContextKeys = /* @__PURE__ */ new Map();
    this._onDidChangeCurrentChatMode = this._register(new Emitter());
    this.onDidChangeCurrentChatMode = this._onDidChangeCurrentChatMode.event;
    this.inputUri = URI.parse(`${Schemas.vscodeChatInput}:input-${ChatInputPart._counter++}`);
    this._workingSetLinesAddedSpan = new Lazy(() => dom.$(".working-set-lines-added"));
    this._workingSetLinesRemovedSpan = new Lazy(() => dom.$(".working-set-lines-removed"));
    this._chatEditsActionsDisposables = this._register(new DisposableStore());
    this._chatEditsDisposables = this._register(new DisposableStore());
    this._renderingChatEdits = this._register(new MutableDisposable());
    this._attemptedWorkingSetEntriesCount = 0;
    this._chatSessionIsEmpty = false;
    this._pendingDelegationTargetObservable = observableValue(this, void 0);
    this._currentSessionTypeObservable = observableValue(this, void 0);
    this._currentSessionResourceObservable = observableValue(this, void 0);
    this._notificationModelTargetChatSessionType = derived(
      this,
      (reader) => this._pendingDelegationTargetObservable.read(reader) ?? this._currentSessionTypeObservable.read(reader) ?? this.getCurrentSessionType()
    );
    this._modelSelectionDiagnostics = new ChatModelSelectionDiagnostics(this.logService, this.storageService, () => ({
      surface: "workbench",
      location: this.location,
      modelTarget: this.getSelectedModelTarget(),
      sessionKey: this.getCurrentSessionType(),
      conversationKey: this._inputModelSessionResource?.toString(),
      metadata: { widgetViewKind: this.options.widgetViewKindTag }
    }));
    this._modelSelectionRuntime = {
      location: this.location,
      getCurrentModeKind: () => this.currentModeKind,
      getCurrentSessionType: () => this._currentSessionType ?? this.getCurrentSessionType(),
      isEmpty: () => !this._inputModel || this._chatSessionIsEmpty,
      getModels: (sessionType) => this.getModelsForSessionType(sessionType),
      getAllModels: () => this.getAllMergedModels(),
      requiresCustomModels: (sessionType) => this.chatSessionsService.requiresCustomModelsForSessionType(sessionType),
      getConfiguredModelValue: () => this.getConfiguredModelValue(),
      subscribeToModelChanges: (listener) => this.languageModelsService.onDidChangeLanguageModels(listener),
      getBoundConversationKey: () => this._inputModelSessionResource?.toString(),
      getVisibleConversationKey: () => this._widget?.viewModel?.model.sessionResource.toString(),
      restoreModelConfiguration: (modelId, configuration) => this.restoreModelConfiguration(modelId, configuration),
      applyModel: () => {
        if (this.cachedWidth) {
          this.layout(this.cachedWidth);
        }
        this._syncInputStateToModel();
      }
    };
    this._modelSelectionController = this._register(new ChatInputModelSelectionController(this._modelSelectionRuntime, this._modelSelectionDiagnostics));
    this._currentLanguageModel = this._modelSelectionController.currentModel;
    this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, void 0, this._store)((event) => {
      this._modelSelectionDiagnostics.logStorageChange(event, this._currentLanguageModel.get()?.identifier);
    }));
    this._modelConfigStore = this._register(new ChatModelConfigurationStore(
      () => this.getModelConfigurationStorageKey(),
      this.languageModelsService,
      this.storageService
    ));
    this._syncTextDebounced = this._register(new RunOnceScheduler(() => {
      logChangesToStateModel(this._inputModel, `[DEBOUNCE] _syncTextDebounced fired -> _syncInputStateToModel in ${this._currentSessionKey}`, void 0, this._inputModel?.state.get(), this.logService);
      this._syncInputStateToModel();
    }, 150));
    this._emptyInputState = this._register(createEmptyInputStateMemento(this.options.widgetViewKindTag)(StorageScope.WORKSPACE, StorageTarget.USER, this.storageService));
    this._emptyInputAttachments = this._register(emptyInputAttachments(StorageScope.WORKSPACE, StorageTarget.USER, this.storageService));
    this._contextResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this._onDidChangeVisibility.event }));
    this._currentModeObservable = observableValue("currentMode", this.options.defaultMode ?? ChatMode.Agent);
    const localModes = this.chatModeService.createModes(LocalChatSessionUri.getNewSessionUri());
    this._currentChatModes.value = localModes;
    this._currentChatModesObservable = observableValue("currentChatModes", localModes);
    this._currentPermissionLevel = observableValue("permissionLevel", this.getDefaultPermissionLevel());
    this._register(this.editorService.onDidActiveEditorChange(() => {
      this._indexOfLastOpenedContext = -1;
      this.refreshChatSessionPickers();
    }));
    this._register(this.chatSessionsService.onDidChangeSessionOptions((e) => {
      const sessionResource = this._widget?.viewModel?.model.sessionResource;
      if (sessionResource && isEqual(sessionResource, e.sessionResource)) {
        this.refreshChatSessionPickers();
      }
    }));
    this._register(this.chatSessionsService.onDidChangeOptionGroups((chatSessionType) => {
      const sessionResource = this._widget?.viewModel?.model.sessionResource;
      if (sessionResource) {
        const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
        if (getChatSessionType(sessionResource) === chatSessionType || delegateSessionType === chatSessionType) {
          this.refreshChatSessionPickers();
        }
      }
    }));
    if (this.options.sessionTypePickerDelegate?.onDidChangeActiveSessionProvider) {
      this._register(this.options.sessionTypePickerDelegate.onDidChangeActiveSessionProvider(async (newSessionType) => {
        this._currentSessionType = newSessionType;
        this.getVisibleOptionGroupsModeAndUpdateContextKeys(this.getCurrentSessionResource());
        this.agentSessionTypeKey.set(newSessionType);
        this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(newSessionType));
        this.updateWidgetLockStateFromSessionType(newSessionType);
        this.checkModeInSessionPool(newSessionType);
        this.revalidateModelForSessionType();
        this.refreshChatSessionPickers();
      }));
    }
    this._attachmentModel = this._register(this.instantiationService.createInstance(ChatAttachmentModel));
    this._register(this._attachmentModel.onDidChange(() => {
      if (this._chatSessionIsEmpty) {
        this._emptyInputAttachments.set(this._attachmentModel.attachments, void 0);
      }
      this._syncInputStateToModel();
    }));
    this._register(this._modelConfigStore.onDidChange(() => this._syncInputStateToModel()));
    this.selectedToolsModel = this._register(this.instantiationService.createInstance(ChatSelectedTools, this.currentModeObs, this._currentLanguageModel));
    this.dnd = this._register(this.instantiationService.createInstance(ChatDragAndDrop, () => this._widget, this._attachmentModel, styles));
    this.inputEditorMaxHeight = this.options.renderStyle === "compact" ? INPUT_EDITOR_MAX_HEIGHT / 3 : INPUT_EDITOR_MAX_HEIGHT;
    const padding = this.options.renderStyle === "compact" ? INPUT_EDITOR_PADDING.compact : INPUT_EDITOR_PADDING.default;
    this.singleLineInputEditorHeight = INPUT_EDITOR_LINE_HEIGHT + padding.top + padding.bottom;
    this.inputEditorMinHeight = this.options.inputEditorMinLines ? this.options.inputEditorMinLines * INPUT_EDITOR_LINE_HEIGHT + padding.top + padding.bottom : void 0;
    this.inputEditorHasText = ChatContextKeys.inputHasText.bindTo(contextKeyService);
    this.inputEditorHasSendableContent = ChatContextKeys.inputHasSendableContent.bindTo(contextKeyService);
    this.chatCursorAtTop = ChatContextKeys.inputCursorAtTop.bindTo(contextKeyService);
    this.inputEditorHasFocus = ChatContextKeys.inputHasFocus.bindTo(contextKeyService);
    this._hasQuestionCarouselContextKey = ChatContextKeys.Editing.hasQuestionCarousel.bindTo(contextKeyService);
    this.chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
    this.chatModeNameKey = ChatContextKeys.chatModeName.bindTo(contextKeyService);
    this.chatModelIdKey = ChatContextKeys.chatModelId.bindTo(contextKeyService);
    this.permissionLevelKey = ChatContextKeys.chatPermissionLevel.bindTo(contextKeyService);
    this.permissionLevelKey.set(this._currentPermissionLevel.get());
    this.withinEditSessionKey = ChatContextKeys.withinEditSessionDiff.bindTo(contextKeyService);
    this.filePartOfEditSessionKey = ChatContextKeys.filePartOfEditSession.bindTo(contextKeyService);
    this.chatSessionHasOptions = ChatContextKeys.chatSessionHasModels.bindTo(contextKeyService);
    this.chatSessionOptionsValid = ChatContextKeys.chatSessionOptionsValid.bindTo(contextKeyService);
    this.agentSessionTypeKey = ChatContextKeys.agentSessionType.bindTo(contextKeyService);
    this.chatSessionSupportsDelegationKey = ChatContextKeys.chatSessionSupportsDelegation.bindTo(contextKeyService);
    this.chatHasPendingDelegationTargetKey = ChatContextKeys.hasPendingDelegationTarget.bindTo(contextKeyService);
    if (this.options.sessionTypePickerDelegate?.getActiveSessionProvider) {
      const initialSessionType = this.options.sessionTypePickerDelegate.getActiveSessionProvider();
      if (initialSessionType) {
        this.agentSessionTypeKey.set(initialSessionType);
        this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(initialSessionType));
      }
    }
    this.chatSessionHasCustomAgentTarget = ChatContextKeys.chatSessionHasCustomAgentTarget.bindTo(contextKeyService);
    this.chatSessionHasTargetedModels = ChatContextKeys.chatSessionHasTargetedModels.bindTo(contextKeyService);
    this.history = this._register(this.instantiationService.createInstance(ChatHistoryNavigator, this.location));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      const newOptions = {};
      if (e.affectsConfiguration(ChatConfiguration.GlobalAutoApprove)) {
        this.setPermissionLevel(this._currentPermissionLevel.get());
      }
      if (e.affectsConfiguration(ChatConfiguration.DefaultPermissionLevel)) {
        if (this._chatSessionIsEmpty) {
          this.setPermissionLevel(this.getDefaultPermissionLevel());
        }
      }
      if (e.affectsConfiguration(ChatConfiguration.DefaultModel)) {
        this._modelSelectionController.applyConfiguredDefault();
      }
      if (e.affectsConfiguration(AccessibilityVerbositySettingId.Chat)) {
        newOptions.ariaLabel = this._getAriaLabel();
      }
      if (e.affectsConfiguration("editor.wordSegmenterLocales")) {
        newOptions.wordSegmenterLocales = this.configurationService.getValue("editor.wordSegmenterLocales");
      }
      if (e.affectsConfiguration("editor.autoClosingBrackets")) {
        newOptions.autoClosingBrackets = this.configurationService.getValue("editor.autoClosingBrackets");
      }
      if (e.affectsConfiguration("editor.autoClosingQuotes")) {
        newOptions.autoClosingQuotes = this.configurationService.getValue("editor.autoClosingQuotes");
      }
      if (e.affectsConfiguration("editor.autoSurround")) {
        newOptions.autoSurround = this.configurationService.getValue("editor.autoSurround");
      }
      this.inputEditor.updateOptions(newOptions);
    }));
    this._chatEditsListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, MenuId.ChatEditingWidgetModifiedFilesToolbar, { verticalScrollMode: ScrollbarVisibility.Visible }));
    this._hasFileAttachmentContextKey = ChatContextKeys.hasFileAttachments.bindTo(contextKeyService);
    this.initSelectedModel();
    this._register(this._onDidChangeCurrentChatMode.event(() => {
      this.checkModelSupported();
    }));
    const updateAfterModelListChange = (reconcileSelection) => {
      const modelIdentifier = this._currentLanguageModel.get()?.identifier;
      const models = this.getModels();
      if (canLog(this.logService.getLevel(), LogLevel.Debug)) {
        const mergedModels = this.getAllMergedModels();
        const filteredModels = filterModelsForSession(models, this.getCurrentSessionType(), this.currentModeKind, this.location);
        const messageparts = [
          `resetting current language model due to model list change from ${modelIdentifier}`,
          `this._widget?.viewModel?.model.sessionResource = ${this._widget?.viewModel?.model.sessionResource?.toString()}`,
          `this.currentModeKind = ${this.currentModeKind}`,
          `this.getCurrentSessionType = ${this.getCurrentSessionType()}`,
          `this._currentSessionType = ${this._currentSessionType}`,
          `shouldResetOnModelListChange(modelIdentifier, models) = ${shouldResetOnModelListChange(modelIdentifier, models)}`,
          `vendors: ${this.languageModelsService.getVendors().map((v) => v.vendor).join(", ")}`,
          `hiddenModelIds: ${this.languageModelsService.getHiddenModelIds().join(", ")}`,
          `model identifiers: ${models.map((m) => m.identifier).join(", ")}`,
          `model target Session Types: ${models.map((m) => m.metadata.targetChatSessionType || "").join(", ")}`,
          `model metadataid: ${models.map((m) => m.metadata.id).join(", ")}`,
          `merged.model identifiers: ${mergedModels.map((m) => m.identifier).join(", ")}`,
          `merged.model target Session Types: ${mergedModels.map((m) => m.metadata.targetChatSessionType || "").join(", ")}`,
          `merged.model metadataid: ${mergedModels.map((m) => m.metadata.id).join(", ")}`,
          `filtered.model identifiers: ${filteredModels.map((m) => m.identifier).join(", ")}`,
          `filtered.model target Session Types: ${filteredModels.map((m) => m.metadata.targetChatSessionType || "").join(", ")}`,
          `filtered.model metadataid: ${filteredModels.map((m) => m.metadata.id).join(", ")}`
        ];
        if (this.getCurrentSessionType() !== SessionType.CopilotCLI) {
          const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
          if (delegateSessionType) {
            messageparts.push(`delegateSessionType = ${delegateSessionType}`);
          }
          const sessionResource = this._widget?.viewModel?.model.sessionResource;
          messageparts.push(`current session resource = ${sessionResource}`);
        }
        logChangesToStateModel(this._inputModel, messageparts.join(", "), void 0, void 0, this.logService);
      }
      if (reconcileSelection) {
        this._modelSelectionController.reconcileModelListChange(models);
      }
      this._updateInputContentContextKeys();
    };
    this._register(this.languageModelsService.onDidChangeLanguageModels(() => updateAfterModelListChange(false)));
    this._register(this.languageModelsService.onDidChangeModelVisibility(() => updateAfterModelListChange(true)));
    this._register(this.onDidChangeCurrentChatMode(() => {
      this.accessibilityService.alert(this._currentModeObservable.get().label.get());
      if (this._inputEditor) {
        this._inputEditor.updateOptions({ ariaLabel: this._getAriaLabel() });
      }
      this.setImplicitContextEnablement();
    }));
    this._register(autorun((reader) => {
      const lm = this._currentLanguageModel.read(reader);
      this.chatModelIdKey.set(lm?.metadata.id.toLowerCase() ?? "");
      this.contextUsageWidget?.setSelectedModel(lm?.identifier);
      if (lm?.metadata.name) {
        this.accessibilityService.alert(lm.metadata.name);
      }
      this._inputEditor?.updateOptions({ ariaLabel: this._getAriaLabel() });
    }));
    this._register(autorun((reader) => {
      const modes = this._currentChatModesObservable.read(reader);
      reader.store.add(modes.onDidChange(() => {
        this.validateCurrentChatMode();
        this._restorePersistedCustomModeIfAvailable();
      }));
    }));
    this._register(autorun((r) => {
      const mode = this._currentModeObservable.read(r);
      this.chatModeKindKey.set(mode.kind);
      this.chatModeNameKey.set(mode.name.read(r));
      if (this.options.suppressModePreferredModel) {
        return;
      }
      const models = mode.model?.read(r);
      if (models) {
        this.switchModelByQualifiedName(models);
      }
    }));
    this.validateCurrentChatMode();
  }
  get attachmentModel() {
    return this._attachmentModel;
  }
  getAttachedContext() {
    const contextArr = new ChatRequestVariableSet();
    contextArr.add(...this.attachmentModel.attachments, ...this.chatContextService.getWorkspaceContextItems());
    return contextArr;
  }
  getAttachedAndImplicitContext() {
    const contextArr = this.getAttachedContext();
    if (this.implicitContext) {
      const implicitChatVariables = this.implicitContext.enabledBaseEntries(this.configurationService.getValue("chat.implicitContext.suggestedContext"));
      contextArr.add(...implicitChatVariables);
    }
    return contextArr;
  }
  get implicitContext() {
    return this._implicitContext;
  }
  get inputContainerElement() {
    return this.inputContainer;
  }
  get persistentContentContainerElement() {
    return this.persistentContentContainer;
  }
  get gettingStartedTipContainerElement() {
    return this.chatGettingStartedTipContainer;
  }
  get inputEditor() {
    return this._inputEditor;
  }
  setHistoryKey(historyKey) {
    this.history.setHistoryKey(historyKey);
  }
  get currentLanguageModel() {
    return this._currentLanguageModel.get()?.identifier;
  }
  get selectedLanguageModel() {
    return this._currentLanguageModel;
  }
  get currentModeKind() {
    const mode = this._currentModeObservable.get();
    return mode.kind === ChatModeKind.Agent && !this.agentService.hasToolsAgent ? ChatModeKind.Edit : mode.kind;
  }
  get currentModeObs() {
    return this._currentModeObservable;
  }
  get currentChatModesObs() {
    return this._currentChatModesObservable;
  }
  get currentPermissionLevelObs() {
    return this._currentPermissionLevel;
  }
  get currentModeInfo() {
    const mode = this._currentModeObservable.get();
    const modeId = mode.isBuiltin ? this.currentModeKind : "custom";
    const modeInstructions = mode.modeInstructions?.get();
    return {
      kind: this.currentModeKind,
      isBuiltin: mode.isBuiltin,
      modeInstructions: modeInstructions ? {
        uri: mode.uri?.get(),
        name: mode.name.get(),
        content: modeInstructions.content,
        toolReferences: this.toolService.toToolReferences(modeInstructions.toolReferences),
        allowedSubagents: mode.agents?.get(),
        metadata: modeInstructions.metadata,
        isBuiltin: mode.isBuiltin
      } : void 0,
      telemetryModeId: modeId,
      telemetryModeName: getModeNameForTelemetry(mode),
      applyCodeBlockSuggestionId: void 0,
      permissionLevel: this._currentPermissionLevel.get()
    };
  }
  get selectedElements() {
    const edits = [];
    const editsList = this._chatEditList?.object;
    const selectedElements = editsList?.getSelectedElements() ?? [];
    for (const element of selectedElements) {
      if (element.kind === "reference" && URI.isUri(element.reference)) {
        edits.push(element.reference);
      }
    }
    return edits;
  }
  /**
   * The number of working set entries that the user actually wanted to attach.
   * This is less than or equal to {@link ChatInputPart.chatEditWorkingSetFiles}.
   */
  get attemptedWorkingSetEntriesCount() {
    return this._attemptedWorkingSetEntriesCount;
  }
  /**
   * Gets the pending delegation target if one is set.
   * This is used when the user changes the session target picker to a different provider
   * but hasn't submitted yet, so the delegation will happen on submit.
   */
  get pendingDelegationTarget() {
    return this._pendingDelegationTarget;
  }
  get _pendingDelegationTarget() {
    return this._pendingDelegationTargetObservable.get();
  }
  set _pendingDelegationTarget(value) {
    this._pendingDelegationTargetObservable.set(value, void 0);
  }
  get _currentSessionType() {
    return this._currentSessionTypeObservable.get();
  }
  set _currentSessionType(value) {
    this._currentSessionTypeObservable.set(value, void 0);
  }
  setImplicitContextEnablement() {
    if (this.implicitContext && this.configurationService.getValue("chat.implicitContext.suggestedContext")) {
      this.implicitContext.setEnabled(this._currentModeObservable.get().name.get().toLowerCase() === "ask");
    }
  }
  setIsWithinEditSession(inInsideDiff, isFilePartOfEditSession) {
    this.withinEditSessionKey.set(inInsideDiff);
    this.filePartOfEditSessionKey.set(isFilePartOfEditSession);
  }
  getSelectedModelStorageKey() {
    return getSelectedModelStorageKey(this.location, this.getSelectedModelTarget());
  }
  getSelectedModelTarget() {
    const sessionType = this._currentSessionType;
    return sessionType && this.sessionTypeHasOwnModelPool(sessionType) ? sessionType : void 0;
  }
  /**
   * True when the session type owns its own model pool (either declared via `requiresCustomModels`,
   * or some registered model already targets it). Keeps storage keys stable before targeted models are published.
   */
  sessionTypeHasOwnModelPool(sessionType) {
    return this.chatSessionsService.requiresCustomModelsForSessionType(sessionType) || hasModelsTargetingSession(this.getAllMergedModels(), sessionType);
  }
  initSelectedModel() {
    this._modelConfigStore.clear();
    const selectedModelStorageKey = this.getSelectedModelStorageKey();
    const storedSelection = getStoredSelectedModel(this.storageService, this.location, this.getSelectedModelTarget());
    logChangesToStateModel(this._inputModel, `[INIT-SELECTED-MODEL] storageKey=${selectedModelStorageKey}, persistedSelection=${storedSelection}, currentSessionType=${this._currentSessionType}, getCurrentSessionType=${this.getCurrentSessionType()}, widgetSession=${this._currentSessionKey}, boundInputModelSession=${this._inputModelSessionResource?.toString()}, currentLanguageModel=${this._currentLanguageModel.get()?.identifier}`, this._inputModel?.state.get(), void 0, this.logService);
    this._modelSelectionController.initialize(
      storedSelection,
      (selection) => logChangesToStateModel(this._inputModel, `[INIT-SELECTED-MODEL] restore decision persistedSelection=${storedSelection}, selection=${selection.kind}, resultModel=${selection.kind === "apply" ? selection.model.identifier : void 0}, storageKey=${selectedModelStorageKey}, currentSessionType=${this._currentSessionType}, getCurrentSessionType=${this.getCurrentSessionType()}`, this._inputModel?.state.get(), void 0, this.logService)
    );
  }
  setEditing(enabled, editingSentRequest) {
    this.currentlyEditingInputKey?.set(enabled);
    this.editingSentRequestKey?.set(editingSentRequest);
  }
  switchModel(modelMetadata) {
    const models = this.getModels();
    const model = models.find((m) => m.metadata.vendor === modelMetadata.vendor && m.metadata.id === modelMetadata.id && m.metadata.family === modelMetadata.family);
    if (model) {
      this.setCurrentLanguageModel(model, true);
    }
  }
  /**
   * Switch to a model by its identifier. Returns true if a matching model
   * was found and applied.
   *
   * The remembered profile preference is updated only when both
   * `isUserAction` and `storeSelection` are true.
   */
  switchModelByIdentifier(identifier, storeSelection = false, isUserAction = false) {
    const models = this.getModels();
    const model = models.find((m) => m.identifier === identifier);
    if (model) {
      if (isUserAction) {
        this.setCurrentLanguageModel(model, true, storeSelection);
      } else {
        this._applyProgrammaticLanguageModel(model);
      }
      return true;
    }
    return false;
  }
  switchModelByQualifiedName(qualifiedModelNames) {
    const models = this.getModels();
    for (const qualifiedModelName of qualifiedModelNames) {
      const model = models.find((m) => ILanguageModelChatMetadata.matchesQualifiedName(qualifiedModelName, m.metadata));
      if (model) {
        this._applyProgrammaticLanguageModel(model);
        return true;
      }
    }
    this.logService.warn(`[chat] Node of the models "${qualifiedModelNames.join(", ")}" not found. Use format "<name> (<vendor>)", e.g. "GPT-4o (copilot)".`);
    return false;
  }
  requestModelByIdentifier(identifier) {
    return this._requestProgrammaticLanguageModel(() => this.getModels().find((model) => model.identifier === identifier));
  }
  requestModelByQualifiedName(qualifiedModelNames) {
    return this._requestProgrammaticLanguageModel(() => {
      const models = this.getModels();
      return qualifiedModelNames.map((name) => models.find((model) => ILanguageModelChatMetadata.matchesQualifiedName(name, model.metadata))).find(isDefined);
    });
  }
  get hasPendingProgrammaticModelSelection() {
    return this._modelSelectionController.hasPendingProgrammaticSelection();
  }
  switchToNextModel() {
    const models = this.getModels();
    if (models.length > 0) {
      const currentIndex = models.findIndex((model) => model.identifier === this._currentLanguageModel.get()?.identifier);
      const nextIndex = (currentIndex + 1) % models.length;
      this.setCurrentLanguageModel(models[nextIndex], true);
    }
  }
  switchToNextPinnedModel() {
    const models = this.getModels();
    if (models.length === 0) {
      return;
    }
    const modelMap = new Map(models.map((model) => [model.identifier, model]));
    const pinnedModels = this.languageModelsService.getPinnedModelIds().map((modelId) => modelMap.get(modelId)).filter(isDefined);
    if (pinnedModels.length === 0) {
      return;
    }
    const currentIndex = pinnedModels.findIndex((model) => model.identifier === this._currentLanguageModel.get()?.identifier);
    const nextIndex = (currentIndex + 1) % pinnedModels.length;
    this.setCurrentLanguageModel(pinnedModels[nextIndex], true);
  }
  openModelPicker() {
    if (this.chatPhoneInputPresenter.enabled.get()) {
      this._showCombinedPhonePickerSheet();
      return;
    }
    this.modelWidget?.show();
  }
  openModePicker() {
    if (this.chatPhoneInputPresenter.enabled.get()) {
      this._showCombinedPhonePickerSheet();
      return;
    }
    this.modeWidget?.show();
  }
  _showCombinedPhonePickerSheet() {
    const target = this.inputActionsToolbar.getElement();
    this.chatPhoneInputPresenter.showCombinedModeAndModelSheet(target, {
      kind: "delegates",
      modeDelegate: this._createModePickerDelegate(),
      modelDelegate: this._createModelPickerDelegate()
    }).catch((err) => this.logService.error("[ChatInputPart] phone picker sheet failed", err));
  }
  _createModelPickerDelegate() {
    return {
      currentModel: this._currentLanguageModel,
      setModel: (model) => {
        this.setCurrentLanguageModel(model, true, !this.options.suppressModelPersistence);
        this.renderAttachedContext();
      },
      getModels: () => this.getModels(),
      isCacheWarm: () => (this._widget?.viewModel?.model.getRequests().length ?? 0) > 0,
      getPresentationOptions: () => this._getModelPickerPresentationOptions(),
      modelConfiguration: this._modelConfigStore
    };
  }
  _getModelPickerPresentationOptions() {
    const sessionType = this.getCurrentSessionType();
    const useRichPicker = !sessionType || sessionType === localChatSessionType || isAgentHostTarget(sessionType);
    return {
      useGroupedModelPicker: useRichPicker,
      showManageModelsAction: useRichPicker,
      showUnavailableFeatured: useRichPicker,
      showFeatured: useRichPicker,
      showAutoModel: this._showAutoModel(),
      showModelIcon: this.options.isSessionsWindow || !this._usesHarnessProviderIcon()
    };
  }
  _usesHarnessProviderIcon() {
    const sessionType = this.getCurrentSessionType();
    return sessionType === SessionType.ClaudeCode || sessionType === SessionType.Codex || sessionType === SessionType.AgentHostClaude || sessionType === SessionType.AgentHostCodex;
  }
  /**
   * Returns this editor's snapshot of the given model's configuration (e.g.
   * context size, thinking effort), scoped to this editor rather than the
   * profile-global value. Delegates to {@link ChatModelConfigurationStore}.
   * See issue #320393.
   */
  getModelConfiguration(modelId) {
    return this._modelConfigStore.getModelConfiguration(modelId);
  }
  /**
   * Restores a model's configuration captured in a session's persisted input
   * state. Called when the selected model is restored from session history so
   * the configuration follows the model through the same resolution hierarchy.
   * No-op for sessions that pre-date configuration capture (no value stored).
   */
  restoreModelConfiguration(modelId, modelConfiguration) {
    if (modelConfiguration) {
      this._modelConfigStore.restoreModelConfiguration(modelId, modelConfiguration);
    }
  }
  getModelConfigurationStorageKey() {
    const sessionType = this._currentSessionType;
    if (sessionType && this.sessionTypeHasOwnModelPool(sessionType)) {
      return `chat.modelConfiguration.${this.location}.${sessionType}`;
    }
    return `chat.modelConfiguration.${this.location}`;
  }
  _createModePickerDelegate() {
    const productService = this.productService;
    const currentChatModes = this.options.hideCustomChatModes ? derived((reader) => {
      const inner = this._currentChatModesObservable.read(reader);
      const filteredCustom = inner.custom.filter((m) => isModeConsideredBuiltIn(m, productService));
      const wrapped = {
        onDidChange: inner.onDidChange,
        builtin: inner.builtin,
        custom: filteredCustom,
        findModeById: (id) => inner.builtin.find((m) => m.id === id) ?? filteredCustom.find((m) => m.id === id),
        findModeByName: (name) => inner.builtin.find((m) => m.name.read(void 0) === name) ?? filteredCustom.find((m) => m.name.read(void 0) === name),
        waitForPendingUpdates: () => inner.waitForPendingUpdates()
      };
      return wrapped;
    }) : this._currentChatModesObservable;
    return {
      currentMode: this._currentModeObservable,
      currentChatModes,
      sessionResource: () => this._widget?.viewModel?.sessionResource,
      // Direct setter for hosts that embed `ChatInputPart` without
      // registering an `IChatWidget` (e.g. the automations dialog).
      // The picker only calls this when `sessionResource()` is
      // `undefined`; real chat widgets keep the command path.
      setMode: (mode) => this.setChatMode2(mode, true),
      customAgentTarget: () => {
        const sessionResource = this._widget?.viewModel?.model.sessionResource;
        return (sessionResource && this.chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource))) ?? Target.Undefined;
      }
    };
  }
  openPermissionPicker() {
    this.permissionWidget?.show();
  }
  setPermissionLevel(level) {
    level = this.getPermittedPermissionLevel(level);
    this._currentPermissionLevel.set(level, void 0);
    this.permissionLevelKey.set(level);
    this.permissionWidget?.refresh();
    const sessionResource = this.getCurrentSessionResource();
    if (sessionResource) {
      this.chatSessionsService.setSessionOption(sessionResource, PERMISSION_LEVEL_OPTION_ID, level);
    }
    logChangesToStateModel(this._inputModel, `setPermissionLevel -> _syncInputStateToModel (level=${level}, currentLanguageModel=${this._currentLanguageModel.get()?.identifier}) in ${this._currentSessionKey}`, void 0, void 0, this.logService);
    this._syncInputStateToModel();
  }
  getDefaultPermissionLevel() {
    const level = this.configurationService.getValue(ChatConfiguration.DefaultPermissionLevel);
    return isChatPermissionLevel(level) ? level : ChatPermissionLevel.Default;
  }
  getPermittedPermissionLevel(level) {
    if (isAutoApproveValuePolicyRestricted(level, isAutoApprovePolicyRestricted(this.configurationService))) {
      return ChatPermissionLevel.Default;
    }
    return level;
  }
  openSessionTargetPicker() {
    this.sessionTargetWidget?.show();
  }
  openDelegationPicker() {
    this.delegationWidget?.show();
  }
  openChatSessionPicker() {
    const firstWidget = this.chatSessionPickerWidgets?.values()?.next().value;
    firstWidget?.show();
  }
  /**
   * Create picker widgets for all option groups available for the current session type.
   */
  createChatSessionPickerWidgets(action, pickerOptions) {
    this._lastSessionPickerAction = action;
    this._lastSessionPickerOptions = pickerOptions;
    const sessionResource = this.getCurrentSessionResource();
    const visibleOptionGroups = this.getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource);
    if (!visibleOptionGroups.length) {
      return [];
    }
    const effectiveSessionType = this.getEffectiveSessionType(sessionResource);
    if (!effectiveSessionType) {
      return [];
    }
    this.chatSessionPickerWidgets.clearAndDisposeAll();
    const widgets = [];
    for (const optionGroup of visibleOptionGroups) {
      const initialItem = this.getCurrentOptionForGroup(optionGroup.id);
      const initialState = { group: optionGroup, item: initialItem };
      const itemDelegate = {
        getCurrentOption: () => this.getCurrentOptionForGroup(optionGroup.id),
        onDidChangeOption: this.getOrCreateOptionEmitter(optionGroup.id).event,
        setOption: (option) => {
          this.updateOptionContextKey(optionGroup.id, option.id);
          this.getOrCreateOptionEmitter(optionGroup.id).fire(option);
          const sessionResource2 = this._widget?.viewModel?.model.sessionResource;
          if (sessionResource2) {
            this.chatSessionsService.setSessionOption(sessionResource2, optionGroup.id, option);
          }
          this.refreshChatSessionPickers();
        },
        getOptionGroup: () => {
          const groups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
          return groups?.find((g) => g.id === optionGroup.id);
        },
        getSessionResource: () => {
          return this._widget?.viewModel?.model.sessionResource;
        }
      };
      const widget = this.instantiationService.createInstance(ChatSessionPickerActionItem, action, initialState, itemDelegate, pickerOptions);
      this.chatSessionPickerWidgets.set(optionGroup.id, widget);
      widgets.push(widget);
    }
    return widgets;
  }
  /**
   * Set the input model reference for syncing input state
   *
   * Note: We have a cyclic ref between ChatInputPart and ChatWidget,
   * When we invoke setInputModel, the property _widget is not set. Hence we don't have the SessionResource.
   * As a result, in this method when syncFromModel is called, the model state is not applied to the UI.
   * Instead, the defaults are computed and the model is updated with default values. Thereby blowing away model information.
   * Setting Widget and then calling this doesn't work either because the widget also relies on ChatInputPart (hence cyclic ref).
   * Solution is to pass the SessionResource as an argument to this method.
  */
  setInputModel(model, chatSessionIsEmpty, forSessionResource) {
    logChangesToStateModel(this._inputModel, `setInputModel for ${forSessionResource.toString()} (chatSessionIsEmpty=${chatSessionIsEmpty}, outgoing._inputModel=${this._inputModel ? "present" : "undefined"})`, model.state.get(), this._inputModel?.state.get(), this.logService);
    if (this._inputModel) {
      logChangesToStateModel(this._inputModel, `[FLUSH-PRE] setInputModel pre-flush boundInputModelSession=${this._inputModelSessionResource?.toString()} widgetSession=${this._currentSessionKey} incoming=${forSessionResource.toString()}`, void 0, this._inputModel.state.get(), this.logService);
      this._syncInputStateToModel();
    }
    this._currentSessionType = getChatSessionType(forSessionResource);
    this._inputModel = model;
    this._inputModelSessionResource = forSessionResource;
    this._modelSyncDisposables.clear();
    const chatModes = this.chatModeService.createModes(forSessionResource);
    this._currentChatModes.value = chatModes;
    this._currentChatModesObservable.set(chatModes, void 0);
    this.selectedToolsModel.resetSessionEnablementState();
    this._chatSessionIsEmpty = isNewConversation(forSessionResource, chatSessionIsEmpty);
    const ownsPool = !!this._currentSessionType && this.sessionTypeHasOwnModelPool(this._currentSessionType);
    const hadIncomingModel = !!model.state.get()?.selectedModel;
    this._modelSelectionController.beginSessionSwitch(this._chatSessionIsEmpty, ownsPool, hadIncomingModel);
    if (this._chatSessionIsEmpty) {
      const persistedState = model.state.get() ? void 0 : this._getPersistedEmptyInputState();
      if (persistedState) {
        model.setState(persistedState);
        this._syncFromModel(persistedState, forSessionResource);
      }
      logChangesToStateModel(this._inputModel, `(1) setting empty model state for ${forSessionResource.toString()}`, void 0, void 0, this.logService);
      this._setEmptyModelState();
      this._modelSyncDisposables.add(this.configurationService.onDidChangeConfiguration((e) => {
        if (this._chatSessionIsEmpty && e.affectsConfiguration(ChatConfiguration.DefaultNewSessionMode)) {
          logChangesToStateModel(this._inputModel, `(2) setting empty model state for ${forSessionResource.toString()}`, void 0, void 0, this.logService);
          this._setEmptyModelState();
        }
      }));
      this._modelSyncDisposables.add(this._currentChatModesObservable.get().onDidChange(() => {
        if (this._chatSessionIsEmpty) {
          logChangesToStateModel(this._inputModel, `(3) setting empty model state for ${forSessionResource.toString()}`, void 0, void 0, this.logService);
          this._setEmptyModelState();
        }
      }));
    }
    const widgetViewModelSession = this._widget?.viewModel?.model.sessionResource;
    const isStaleAtRegistration = !!widgetViewModelSession && !isEqual(widgetViewModelSession, forSessionResource);
    logChangesToStateModel(this._inputModel, `[AUTORUN-REG] registering model->view autorun for ${forSessionResource.toString()}, widgetSession=${this._currentSessionKey}, widgetViewModelSession=${widgetViewModelSession?.toString()}, isStaleAtRegistration=${isStaleAtRegistration}, model.state.selectedModel=${model.state.get()?.selectedModel?.identifier}, _currentLanguageModel=${this._currentLanguageModel.get()?.identifier}`, void 0, void 0, this.logService);
    this._modelSyncDisposables.add(autorun((reader) => {
      let state = model.state.read(reader);
      let message = `syncing from model for ${forSessionResource.toString()} in ${this._currentSessionKey}`;
      if (!state && this._chatSessionIsEmpty) {
        state = this._getPersistedEmptyInputState();
        message = `syncing from empty input state for ${forSessionResource.toString()}`;
        if (state) {
          const resolved = this._modelSelectionController.resolveDraftModel(state.selectedModel, this._currentSessionType, false);
          if (resolved.changed) {
            state = { ...state, selectedModel: resolved.model, modelConfiguration: void 0 };
          }
        }
      }
      const widgetSessionResource = this._widget?.viewModel?.model.sessionResource;
      const isStaleSession = !!this._inputModelSessionResource && !isEqual(this._inputModelSessionResource, forSessionResource);
      if (isStaleSession) {
        message = `[STALE-SESSION-AUTORUN] ${message} (widget now on ${widgetSessionResource?.toString()}, ${this._inputModelSessionResource?.toString()}, ${forSessionResource.toString()} is old)`;
      }
      const prevState = this._inputModel?.state.read(void 0);
      logChangesToStateModel(this._inputModel, message, state, prevState, this.logService);
      if (isStaleSession) {
        return;
      }
      this._syncFromModel(state, forSessionResource);
    }));
  }
  _getPersistedEmptyInputState() {
    let state = this._emptyInputState.read(void 0);
    if (!state) {
      return void 0;
    }
    const persistedAttachments = this._emptyInputAttachments.read(void 0);
    state = {
      ...state,
      attachments: persistedAttachments.length > 0 ? persistedAttachments : state.attachments
    };
    const resolved = this._modelSelectionController.resolveDraftModel(state.selectedModel, this._currentSessionType, true);
    if (resolved.changed) {
      state = { ...state, selectedModel: resolved.model, modelConfiguration: void 0 };
    }
    return state;
  }
  _setEmptyModelState() {
    logChangesToStateModel(this._inputModel, `setting empty model state for ${this._widget?.viewModel?.sessionResource.toString()} in ${this._currentSessionKey}`, void 0, void 0, this.logService);
    const currentLevel = this._inputModel?.state?.get()?.permissionLevel;
    if (currentLevel === void 0 || !isChatPermissionLevel(currentLevel)) {
      this.setPermissionLevel(this.getDefaultPermissionLevel());
    }
    if (this.entitlementService.anonymous) {
      this.setChatMode(ChatModeKind.Agent, false);
      this.checkModelSupported();
      return;
    }
    const rawDefaultMode = this.configurationService.getValue(ChatConfiguration.DefaultNewSessionMode);
    if (typeof rawDefaultMode === "string") {
      const defaultMode = rawDefaultMode.trim();
      if (defaultMode) {
        const defaultModeLower = defaultMode.toLowerCase();
        const modes = this._currentChatModesObservable.get();
        const resolved = modes.findModeById(defaultMode) ?? modes.findModeByName(defaultMode) ?? modes.custom.find((m) => m.name.get().toLowerCase() === defaultModeLower);
        if (resolved) {
          this.logService.trace(`[ChatInputPart] Applying default mode from setting: ${defaultMode} -> ${resolved.id}`);
          this.setChatMode(resolved.id, false);
          this.checkModelSupported();
        }
      }
    }
  }
  /**
   * Sync from model to view (when model state changes)
   */
  _syncFromModel(state, forSessionResource) {
    if (this._isSyncingToOrFromInputModel) {
      return;
    }
    try {
      this._isSyncingToOrFromInputModel = true;
      if (state) {
        const currentMode = this._currentModeObservable.get();
        if (currentMode.id !== state.mode.id) {
          this.setChatMode(state.mode.id, false);
        }
      }
      if (state?.selectedModel) {
        const sessionType = getChatSessionType(forSessionResource);
        this._modelSelectionController.syncFromConversationState(state.selectedModel, state.modelConfiguration, sessionType, forSessionResource.toString(), state.origin === ChatInputStateOrigin.Remote);
      } else if (state) {
        logChangesToStateModel(this._inputModel, `_syncFromModel: state has no selectedModel (no-op for model picker) for ${forSessionResource.toString()} in ${this._currentSessionKey} (current=${this._currentLanguageModel.get()?.identifier})`, state, void 0, this.logService);
      }
      const currentAttachments = this._attachmentModel.attachments;
      if (!state) {
        this._attachmentModel.clear();
      } else if (!arraysEqual(currentAttachments, state.attachments)) {
        this._attachmentModel.clearAndSetContext(...state.attachments);
      }
      if (this._inputEditor) {
        this._inputEditor.setValue(state?.inputText || "");
        if (state?.selections.length) {
          this._inputEditor.setSelections(state.selections);
        }
      }
      if (!this.configurationService.getValue(ChatConfiguration.GlobalAutoApprove)) {
        const targetLevel = this.getPermittedPermissionLevel(state?.permissionLevel ?? ChatPermissionLevel.Default);
        if (this._currentPermissionLevel.get() !== targetLevel) {
          this._currentPermissionLevel.set(targetLevel, void 0);
          this.permissionLevelKey.set(targetLevel);
          this.permissionWidget?.refresh();
        }
      }
      if (state) {
        this._widget?.contribs.forEach((contrib) => {
          contrib.setInputState?.(state.contrib);
        });
      }
    } finally {
      this._isSyncingToOrFromInputModel = false;
      this._syncTextDebounced.cancel();
    }
  }
  /**
   * Sync current input state to the input model
   */
  _syncInputStateToModel() {
    if (this._isSyncingToOrFromInputModel) {
      return;
    }
    this._isSyncingToOrFromInputModel = true;
    const state = this.getCurrentInputState();
    if (this._chatSessionIsEmpty) {
      this._emptyInputState.set(state, void 0);
    }
    const prevState = this._inputModel?.state.get();
    logChangesToStateModel(this._inputModel, `_syncInputStateToModel boundInputModelSession=${this._inputModelSessionResource?.toString()} widgetSession=${this._currentSessionKey} mismatch=${this._inputModelSessionResource?.toString() !== this._currentSessionKey}`, state, prevState, this.logService);
    this._inputModel?.setState(state);
    this._isSyncingToOrFromInputModel = false;
    queueMicrotask(() => this.inputActionsToolbar?.relayout());
  }
  /**
   * Flush the current input state to the bound input model. Use this before
   * the host releases its model reference (e.g. on session switch) to ensure
   * an unsent draft is captured by `willDisposeModel` persistence.
   */
  flushInputStateToModel() {
    if (this._inputModel) {
      this._syncInputStateToModel();
    }
  }
  setCurrentLanguageModel(model, isUserAction = false, storeSelection = isUserAction) {
    const persistSelection = isUserAction && storeSelection;
    const modelDetails = this.getModels().map((m) => `${m.identifier} (${m.metadata.id})`).join(", ");
    const selectedModelStorageKey = this.getSelectedModelStorageKey();
    logChangesToStateModel(this._inputModel, `setCurrentLanguageModel to ${model.identifier} in ${this._currentSessionKey}, storageKey=${selectedModelStorageKey}, currentSessionType=${this._currentSessionType}, getCurrentSessionType=${this.getCurrentSessionType()}, boundInputModelSession=${this._inputModelSessionResource?.toString()}, modelDetails=${modelDetails}, persistSelection=${persistSelection}`, void 0, void 0, this.logService);
    const apply = () => {
      if (this.cachedWidth) {
        this.layout(this.cachedWidth);
      }
      if (persistSelection) {
        storeSelectedModel(this.storageService, this.location, this.getSelectedModelTarget(), model.identifier);
      }
      this._syncInputStateToModel();
    };
    if (isUserAction) {
      this._modelSelectionController.applyExplicitSelection(model, apply, false);
    } else {
      this._modelSelectionController.applyAutomaticSelection(model, apply);
    }
  }
  _applyProgrammaticLanguageModel(model) {
    this._modelSelectionController.applyProgrammaticSelection(model);
  }
  _requestProgrammaticLanguageModel(resolveModel) {
    const result = this._modelSelectionController.requestProgrammaticSelection(
      resolveModel,
      this._inputModelSessionResource?.toString()
    );
    this._updateInputContentContextKeys();
    void result.finally(() => this._updateInputContentContextKeys());
    return result;
  }
  checkModelSupported() {
    this._modelSelectionController.ensureCurrentModelSupported();
  }
  /**
   * By ID- prefer this method
   */
  setChatMode(mode, storeSelection = true, isUserInitiated = false) {
    if (!this.options.supportsChangingModes) {
      return;
    }
    const modes = this._currentChatModesObservable.get();
    const mode2 = modes.findModeById(mode) ?? modes.findModeByName(mode) ?? modes.findModeById(ChatModeKind.Agent) ?? ChatMode.Ask;
    this.setChatMode2(mode2, storeSelection, isUserInitiated);
  }
  setChatMode2(mode, storeSelection = true, isUserInitiated = false) {
    if (!this.options.supportsChangingModes) {
      return;
    }
    this._currentModeObservable.set(mode, void 0);
    this._onDidChangeCurrentChatMode.fire({ isUserInitiated });
    if (storeSelection) {
      logChangesToStateModel(this._inputModel, `setChatMode2 -> _syncInputStateToModel (mode=${mode.id}, storeSelection=${storeSelection}, isUserInitiated=${isUserInitiated}, currentLanguageModel=${this._currentLanguageModel.get()?.identifier}) in ${this._currentSessionKey}`, void 0, void 0, this.logService);
      this._syncInputStateToModel();
    }
  }
  /**
   * Get all models merged from live and cache, without session/mode filtering.
   * This is the canonical source for the full model pool, including cached models
   * that bridge startup races when live models haven't loaded yet.
   */
  getAllMergedModels() {
    const cachedModels = this.storageService.getObject(CachedLanguageModelsKey, StorageScope.APPLICATION, []);
    const liveModels = this.languageModelsService.getLanguageModelIds().map((modelId) => ({ identifier: modelId, metadata: this.languageModelsService.lookupLanguageModel(modelId) }));
    const contributedVendors = new Set(this.languageModelsService.getVendors().map((v) => v.vendor));
    const resolvedVendors = /* @__PURE__ */ new Set();
    for (const v of contributedVendors) {
      if (this.languageModelsService.hasResolvedVendor(v)) {
        resolvedVendors.add(v);
      }
    }
    const models = mergeModelsWithCache(liveModels, cachedModels, contributedVendors, resolvedVendors);
    if (liveModels.length > 0 || resolvedVendors.size > 0) {
      this.storageService.store(CachedLanguageModelsKey, models, StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return models;
  }
  getModels() {
    return this.getModelsForSessionType(this.getCurrentSessionType());
  }
  /**
   * True when the current session type can fall back to the synthetic "Auto"
   * model. Defaults to `true` when no session type is set. See
   * {@link hasNoAvailableModel} for the "nothing to send with" state, which
   * additionally requires an empty model list.
   */
  _showAutoModel() {
    const sessionType = this.getCurrentSessionType();
    return !sessionType || this.chatSessionsService.supportsAutoModelForSessionType(sessionType);
  }
  /**
   * True when the current session type cannot fall back to the Auto model
   * and no models are available to it — e.g. the Claude agent host for a
   * Copilot Free / Student user. In this state there is no model to send a
   * request with, so sending is blocked.
   */
  hasNoAvailableModel() {
    return !this._showAutoModel() && this.getModels().length === 0;
  }
  getModelsForSessionType(sessionType) {
    const allModels = this.getAllMergedModels();
    if (sessionType && this.chatSessionsService.requiresCustomModelsForSessionType(sessionType) && !hasModelsTargetingSession(allModels, sessionType)) {
      return [];
    }
    allModels.sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
    const sessionFiltered = filterModelsForSession(allModels, sessionType, this.currentModeKind, this.location);
    return sessionFiltered.filter((m) => !isModelHiddenInPicker(m, (id) => this.languageModelsService.isModelHidden(id)));
  }
  /**
   * Get the chat session type for the current session, if any.
   *
   * Once a real session exists, the session resource is the authoritative
   * source for which models are valid. The picker delegate only describes the
   * welcome/new-session selection, which may not match the session that was
   * ultimately created (e.g. an agent-host pick that fell back to an
   * in-process `local` session). Preferring the delegate in that case lets an
   * agent-host model leak into a local session's pool, so we only consult the
   * delegate when there is no session yet (the welcome view has no view model).
   */
  getCurrentSessionType() {
    const sessionResource = this._widget?.viewModel?.model.sessionResource;
    if (sessionResource) {
      return getChatSessionType(sessionResource);
    }
    return this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
  }
  /**
   * Validate that the current model belongs to the current session's pool.
   * Called when switching sessions to prevent cross-contamination.
   */
  checkModelInSessionPool() {
    this._modelSelectionController.ensureCurrentModelInSessionPool();
  }
  /**
   * If the current model is absent from the destination session's filtered pool,
   * re-initialize from storage to restore the user's previous selection for this
   * pool, then validate. Uses the filtered pool (same as `revalidateForSessionType`)
   * so models that are catalogued but not valid for the destination are caught even
   * before targeted models load.
   */
  reinitializeIfModelInvalidForPool() {
    const currentModel = this._currentLanguageModel.get();
    if (!currentModel) {
      return;
    }
    const pool = this.getModelsForSessionType(this.getCurrentSessionType());
    if (!pool.some((m) => m.identifier === currentModel.identifier)) {
      this.initSelectedModel();
      this.checkModelInSessionPool();
    }
  }
  /**
   * Reconcile the current model after an explicit session-type pick: restore persisted → best-match previous → default.
   */
  revalidateModelForSessionType() {
    this._modelSelectionController.revalidateForSessionType(() => this.initSelectedModel());
  }
  /**
   * Reset the current mode when it is not valid for the current session type.
   */
  checkModeInSessionPool(sessionType) {
    if (!sessionType) {
      const sessionResource = this._widget?.viewModel?.model.sessionResource;
      if (!sessionResource) {
        return;
      }
      sessionType = getChatSessionType(sessionResource);
    }
    const customAgentTarget = this.chatSessionsService.getCustomAgentTargetForSessionType(sessionType);
    if (!customAgentTarget || customAgentTarget === Target.Undefined) {
      return;
    }
    const currentMode = this._currentModeObservable.get();
    if (currentMode.id === ChatMode.Agent.id) {
      return;
    }
    if (currentMode.isBuiltin) {
      this.setChatMode(ChatModeKind.Agent, false);
      return;
    }
    const modeTarget = currentMode.target.get();
    if (modeTarget !== customAgentTarget && modeTarget !== Target.Undefined) {
      this.setChatMode(ChatModeKind.Agent, false);
    }
  }
  /**
   * Pre-select the model in the model picker based on the `modelId` from the
   * last request in the current session's history. This ensures that when a
   * contributed chat session is reopened, the model picker shows the model
   * that was last used - providing continuity.
   */
  preselectModelFromSessionHistory() {
    this._modelSelectionController.clearHistoryIntent();
    const sessionModel = this._widget?.viewModel?.model;
    const sessionResource = sessionModel?.sessionResource;
    const requests = sessionModel?.getRequests();
    if (!sessionResource) {
      return;
    }
    if (!requests || requests.length === 0 || getChatSessionType(sessionResource) !== SessionType.CopilotCLI) {
      return;
    }
    const modeInfo = findLast(requests, (req) => !!req.modeInfo)?.modeInfo;
    if (modeInfo && modeInfo.modeInstructions?.uri) {
      this.setChatMode(modeInfo.modeInstructions.uri.toString());
    }
    const lastModelId = findLast(requests, (req) => !!req.modelId)?.modelId;
    if (!lastModelId) {
      return;
    }
    this._modelSelectionController.preselectFromHistory(lastModelId, sessionResource.toString());
  }
  setCurrentLanguageModelToDefault(forSessionType) {
    this._modelSelectionController.selectDefault(forSessionType ?? this.getCurrentSessionType());
  }
  /**
   * The raw configured default-model value from the
   * {@link ChatConfiguration.DefaultModel} setting (which may
   * be forced by enterprise policy). Returns `undefined` when nothing is
   * configured.
   */
  getConfiguredModelValue() {
    const model = this.configurationService.getValue(ChatConfiguration.DefaultModel)?.trim();
    return model ? model : void 0;
  }
  /** Resets the language model to the location default and cancels any pending model-selection intent. */
  resetLanguageModelToDefault() {
    this._modelSelectionController.clearIntent();
    this.setCurrentLanguageModelToDefault();
  }
  /**
   * Get the current input state for history
   */
  getCurrentInputState() {
    const mode = this._currentModeObservable.get();
    const selectedModel = this._currentLanguageModel.get();
    const state = {
      inputText: this._inputEditor?.getValue() ?? "",
      attachments: this._attachmentModel.attachments,
      mode: {
        id: mode.id,
        kind: mode.kind
      },
      selectedModel,
      modelConfiguration: selectedModel ? this._modelConfigStore.getModelConfiguration(selectedModel.identifier) : void 0,
      selections: this._inputEditor?.getSelections() || [],
      permissionLevel: this._currentPermissionLevel.get(),
      contrib: {}
    };
    for (const contrib of this._widget?.contribs || Iterable.empty()) {
      contrib.getInputState?.(state.contrib);
    }
    return state;
  }
  _getAriaLabel() {
    const verbose = this.configurationService.getValue(AccessibilityVerbositySettingId.Chat);
    let kbLabel;
    if (verbose) {
      kbLabel = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
    }
    const mode = this._currentModeObservable.get();
    const modelName = this._currentLanguageModel.get()?.metadata.name;
    const modelInfo = modelName ? localize("chatInput.model", ", {0}. ", modelName) : "";
    let modeLabel = "";
    if (!mode.isBuiltin) {
      const mode2 = this.currentModeObs.get();
      modeLabel = localize("chatInput.mode.custom", "({0}), {1}", mode2.label.get(), mode2.description.get());
    } else {
      switch (this.currentModeKind) {
        case ChatModeKind.Agent:
          modeLabel = localize("chatInput.mode.agent", "(Agent), edit files in your workspace.");
          break;
        case ChatModeKind.Edit:
          modeLabel = localize("chatInput.mode.edit", "(Edit), edit files in your workspace.");
          break;
        case ChatModeKind.Ask:
        default:
          modeLabel = localize("chatInput.mode.ask", "(Ask), ask questions or type / for topics.");
          break;
      }
    }
    if (verbose) {
      return kbLabel ? localize("actions.chat.accessibiltyHelp", "Chat Input {0}{1} Press Enter to send out the request. Use {2} for Chat Accessibility Help.", modeLabel, modelInfo, kbLabel) : localize("chatInput.accessibilityHelpNoKb", "Chat Input {0}{1} Press Enter to send out the request. Use the Chat Accessibility Help command for more information.", modeLabel, modelInfo);
    } else {
      return localize("chatInput.accessibilityHelp", "Chat Input {0}{1}.", modeLabel, modelInfo);
    }
  }
  validateCurrentChatMode() {
    const currentMode = this._currentModeObservable.get();
    const validMode = this._currentChatModesObservable.get().findModeById(currentMode.id);
    const isAgentModeEnabled = this.configurationService.getValue(ChatConfiguration.AgentEnabled);
    if (!validMode) {
      this.setChatMode(isAgentModeEnabled ? ChatModeKind.Agent : ChatModeKind.Ask);
      return;
    }
    if (currentMode.kind === ChatModeKind.Agent && !isAgentModeEnabled) {
      this.setChatMode(ChatModeKind.Ask);
      return;
    }
  }
  /**
   * Re-apply the session's own persisted custom agent once its mode becomes available.
   *
   * A restored agent-host session persists its selected custom agent in `mode`, but the agent
   * host's custom modes only register after the backend connects. Until then `setChatMode` falls
   * back to the builtin Agent, so when the custom modes arrive (`modes.onDidChange`) re-apply the
   * persisted custom agent. Builtin/default modes are handled by {@link validateCurrentChatMode}.
   */
  _restorePersistedCustomModeIfAvailable() {
    const persistedMode = this._inputModel?.state.get()?.mode;
    if (!persistedMode) {
      return;
    }
    const modes = this._currentChatModesObservable.get();
    const found = modes.findModeById(persistedMode.id) ?? modes.findModeByName(persistedMode.id);
    if (found && !found.isBuiltin && this._currentModeObservable.get().id !== found.id) {
      this.setChatMode(found.id, false);
    }
  }
  logInputHistory() {
    const historyStr = this.history.values.map((entry) => JSON.stringify(entry)).join("\n");
    this.logService.info(`[${this.location}] Chat input history:`, historyStr);
  }
  setVisible(visible) {
    this._onDidChangeVisibility.fire(visible);
  }
  /** If consumers are busy generating the chat input, returns the promise resolved when they finish */
  get generating() {
    return this._generating?.defer.p;
  }
  /** Disables the input submissions buttons until the disposable is disposed. */
  startGenerating() {
    this.logService.trace("ChatWidget#startGenerating");
    if (this._generating) {
      this._generating.rc++;
    } else {
      this._generating = { rc: 1, defer: new DeferredPromise() };
    }
    return toDisposable(() => {
      this.logService.trace("ChatWidget#doneGenerating");
      if (this._generating && !--this._generating.rc) {
        this._generating.defer.complete();
        this._generating = void 0;
      }
    });
  }
  get element() {
    return this.container;
  }
  async showPreviousValue() {
    if (this.history.isAtStart()) {
      return;
    }
    const state = this.getCurrentInputState();
    if (state.inputText || state.attachments.length) {
      this.history.overlay(state);
    }
    this.navigateHistory(true);
  }
  async showNextValue() {
    if (this.history.isAtEnd()) {
      return;
    }
    const state = this.getCurrentInputState();
    if (state.inputText || state.attachments.length) {
      this.history.overlay(state);
    }
    this.navigateHistory(false);
  }
  /**
   * Restores attachments to the input, re-fetching image binary data as needed.
   */
  async restoreAttachments(attachments) {
    let restored = [...attachments];
    if (restored.length > 0) {
      restored = (await Promise.all(restored.map(async (attachment) => {
        if (isImageVariableEntry(attachment) && !attachment.value && attachment.references?.length && URI.isUri(attachment.references[0].reference)) {
          const currReference = attachment.references[0].reference;
          try {
            const imageBinary = currReference.toString(true).startsWith("http") ? await this.sharedWebExtracterService.readImage(currReference, CancellationToken.None) : (await this.fileService.readFile(currReference)).value;
            if (!imageBinary) {
              return void 0;
            }
            const newAttachment = { ...attachment };
            newAttachment.value = isImageVariableEntry(attachment) && attachment.isPasted ? imageBinary.buffer : await resizeImage(imageBinary.buffer);
            return newAttachment;
          } catch (err) {
            this.logService.error("Failed to fetch and reference.", err);
            return void 0;
          }
        }
        return attachment;
      }))).filter(isDefined);
    }
    this._attachmentModel.clearAndSetContext(...restored);
  }
  async navigateHistory(previous) {
    const historyEntry = previous ? this.history.previous() : this.history.next();
    await this.restoreAttachments(historyEntry?.attachments ?? []);
    const inputText = historyEntry?.inputText ?? "";
    const contribData = historyEntry?.contrib ?? {};
    aria.status(inputText);
    this.setValue(inputText, true);
    this._widget?.contribs.forEach((contrib) => {
      contrib.setInputState?.(contribData);
    });
    this._onDidLoadInputState.fire();
    const model = this._inputEditor.getModel();
    if (!model) {
      return;
    }
    if (previous) {
      this._inputEditor.setPosition({ lineNumber: 1, column: 1 });
    } else {
      this._inputEditor.setPosition(getLastPosition(model));
    }
  }
  setValue(value, transient) {
    this.inputEditor.setValue(value);
    const model = this.inputEditor.getModel();
    if (model) {
      this.inputEditor.setPosition(getLastPosition(model));
    }
  }
  focus() {
    this._inputEditor.focus();
  }
  hasFocus() {
    return this._inputEditor.hasWidgetFocus();
  }
  focusTodoList() {
    return this._chatInputTodoListWidget.value?.focus() ?? false;
  }
  isTodoListFocused() {
    return this._chatInputTodoListWidget.value?.hasFocus() ?? false;
  }
  hasVisibleTodos() {
    return this._chatInputTodoListWidget.value?.hasTodos() ?? false;
  }
  /**
   * Reset the input and update history.
   * @param userQuery If provided, this will be added to the history. Followups and programmatic queries should not be passed.
   */
  async acceptInput(isUserQuery, preserveFocus, preserveInput) {
    if (isUserQuery) {
      const userQuery = this.getCurrentInputState();
      this.history.append(this._getFilteredEntry(userQuery));
    }
    this.resetScrollbarVisibilityAfterAccept();
    this.chatInputNotificationService.handleMessageSent({
      sessionType: this._notificationModelTargetChatSessionType.get(),
      sessionResource: this._currentSessionResourceObservable.get()
    });
    if (this._chatSessionIsEmpty) {
      this._chatSessionIsEmpty = false;
      this._emptyInputState.set(void 0, void 0);
      this._emptyInputAttachments.set([], void 0);
    }
    if (preserveInput) {
      if (!preserveFocus) {
        this._inputEditor.focus();
      }
      return;
    }
    notifyDictationSubmitted(this._inputEditor);
    logChangesToStateModel(this._inputModel, `[ACCEPT] acceptInput -> attachmentModel.clear() in ${this._currentSessionKey}`, void 0, this._inputModel?.state.get(), this.logService);
    this.attachmentModel.clear();
    this._onDidLoadInputState.fire();
    if (this.accessibilityService.isScreenReaderOptimized() && isMacintosh) {
      this._acceptInputForVoiceover();
    } else if (preserveFocus) {
      this._inputEditor.setValue("");
    } else {
      this._inputEditor.focus();
      this._inputEditor.setValue("");
    }
  }
  validateAgentMode() {
    if (!this.agentService.hasToolsAgent && this._currentModeObservable.get().kind === ChatModeKind.Agent) {
      this.setChatMode(ChatModeKind.Edit);
    }
  }
  // A function that filters out specifically the `value` property of the attachment.
  _getFilteredEntry(inputState) {
    const attachmentsWithoutImageValues = inputState.attachments.map((attachment) => {
      if (isImageVariableEntry(attachment) && attachment.references?.length && attachment.value) {
        const newAttachment = { ...attachment };
        newAttachment.value = void 0;
        return newAttachment;
      }
      return attachment;
    });
    return { ...inputState, attachments: attachmentsWithoutImageValues };
  }
  _acceptInputForVoiceover() {
    const domNode = this._inputEditor.getDomNode();
    if (!domNode) {
      return;
    }
    domNode.remove();
    this._inputEditor.setValue("");
    this._inputEditorElement.appendChild(domNode);
    this._inputEditor.focus();
  }
  _handleAttachedContextChange() {
    this._hasFileAttachmentContextKey.set(Boolean(this._attachmentModel.attachments.find((a) => a.kind === "file")));
    this._updateInputContentContextKeys();
    this.renderAttachedContext();
  }
  _updateInputContentContextKeys() {
    const inputHasText = !!this._inputEditor?.getModel()?.getValue().trim();
    this.inputEditorHasText.set(inputHasText);
    const hasSendableContent = inputHasText || this._attachmentModel.attachments.some(isExplicitFileOrImageVariableEntry);
    this.inputEditorHasSendableContent.set(hasSendableContent && !this.hasNoAvailableModel() && !this.hasPendingProgrammaticModelSelection);
  }
  getOrCreateOptionEmitter(optionGroupId) {
    let emitter = this._chatSessionOptionEmitters.get(optionGroupId);
    if (!emitter) {
      emitter = new Emitter();
      this._chatSessionOptionEmitters.set(optionGroupId, emitter);
    }
    return emitter;
  }
  /**
   * Get or create a context key for an option group.
   * Context keys follow the pattern `chatSessionOption.<groupId>`.
   */
  getOrCreateOptionContextKey(optionGroupId) {
    if (!this._scopedContextKeyService) {
      return void 0;
    }
    let contextKey = this._optionContextKeys.get(optionGroupId);
    if (!contextKey) {
      const rawKey = new RawContextKey(`chatSessionOption.${optionGroupId}`, "");
      contextKey = rawKey.bindTo(this._scopedContextKeyService);
      this._optionContextKeys.set(optionGroupId, contextKey);
    }
    return contextKey;
  }
  /**
   * Update the context key for an option group with the current selection.
   * This enables `when` expressions on other option groups to react to changes.
   */
  updateOptionContextKey(optionGroupId, optionItemId) {
    const normalizedOptionId = optionItemId.trim();
    const contextKey = this.getOrCreateOptionContextKey(optionGroupId);
    if (contextKey) {
      contextKey.set(normalizedOptionId);
    }
  }
  /**
   * Evaluate whether an option group should be visible based on its `when` expression.
   * Returns true if the option group should be visible, false otherwise.
   */
  evaluateOptionGroupVisibility(optionGroup) {
    if (!optionGroup.when) {
      return true;
    }
    if (!this._scopedContextKeyService) {
      return true;
    }
    const expr = ContextKeyExpr.deserialize(optionGroup.when);
    if (!expr) {
      return true;
    }
    return this._scopedContextKeyService.contextMatchesRules(expr);
  }
  /**
   * Computes which option groups should be visible for the current session.
   *
   * A picker should show if and only if:
   * 1. We can determine a session type (from session context OR delegate)
   * 2. That session type has option groups registered
   * 3. At least one option group has items AND passes its `when` clause
   *
   * This method also updates the `chatSessionHasOptions` context key, which controls
   * whether the picker action is shown in the toolbar via its `when` clause.
   */
  getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource) {
    const customAgentTarget = sessionResource && this.chatSessionsService.getCustomAgentTargetForSessionType(getChatSessionType(sessionResource));
    this.chatSessionHasCustomAgentTarget.set(customAgentTarget !== Target.Undefined);
    const requiresCustomModels = sessionResource && this.chatSessionsService.requiresCustomModelsForSessionType(getChatSessionType(sessionResource));
    this.chatSessionHasTargetedModels.set(!!requiresCustomModels);
    const visibleOptionGroups = this.getVisibleOptionGroups(sessionResource);
    this.permissionWidget?.refresh();
    if (!visibleOptionGroups.length) {
      this.chatSessionHasOptions.set(false);
      this.chatSessionOptionsValid.set(true);
      this._updateInputContentContextKeys();
      return [];
    }
    const allOptionsValid = sessionResource ? this.areAllOptionsValid(sessionResource, visibleOptionGroups) : true;
    this.chatSessionHasOptions.set(true);
    this.chatSessionOptionsValid.set(allOptionsValid);
    this._updateInputContentContextKeys();
    return visibleOptionGroups;
  }
  getCurrentSessionResource() {
    return this._widget?.viewModel?.model.sessionResource;
  }
  getTerminalCommandPrefix() {
    const sessionResource = this.getCurrentSessionResource();
    return sessionResource ? this.chatSessionsService.getCapabilitiesForSessionType(getChatSessionType(sessionResource))?.terminalCommandPrefix : void 0;
  }
  updateInputEditorFontFamily() {
    if (!this._inputEditor) {
      return;
    }
    const isCommand = isTerminalCommandInput(this._inputEditor.getModel()?.getLineContent(1) || "", this.getTerminalCommandPrefix());
    this._inputEditor.updateOptions({ fontFamily: isCommand ? EDITOR_FONT_DEFAULTS.fontFamily : DEFAULT_FONT_FAMILY });
  }
  handleTerminalCommandPaste(e) {
    handleTerminalCommandPaste(e, this._inputEditor, this.getTerminalCommandPrefix(), this.dialogService, this.storageService);
  }
  areAllOptionsValid(sessionResource, visibleOptionGroups) {
    for (const optionGroup of visibleOptionGroups) {
      const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id);
      if (currentOption) {
        const currentOptionId = typeof currentOption === "string" ? currentOption : currentOption.id;
        if (!optionGroup.items.some((item) => item.id === currentOptionId) && typeof currentOption === "string") {
          return false;
        }
      }
    }
    return true;
  }
  getAllOptionsGroups(sessionResource) {
    const delegateSessionType = this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.();
    const effectiveSessionType = delegateSessionType ?? (sessionResource ? getChatSessionType(sessionResource) : void 0);
    if (!effectiveSessionType) {
      return [];
    }
    const allOptionGroups = this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType);
    return allOptionGroups ?? [];
  }
  getVisibleOptionGroups(sessionResource) {
    const allOptionGroups = this.getAllOptionsGroups(sessionResource);
    if (!allOptionGroups.length) {
      return [];
    }
    if (sessionResource) {
      for (const optionGroup of allOptionGroups) {
        const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id);
        if (currentOption) {
          const optionId = typeof currentOption === "string" ? currentOption : currentOption.id;
          this.updateOptionContextKey(optionGroup.id, optionId);
        }
      }
    }
    const visibleGroups = /* @__PURE__ */ new Map();
    for (const optionGroup of allOptionGroups) {
      if (optionGroup.kind === "permissions") {
        continue;
      }
      const hasItems = optionGroup.items.length > 0 || (optionGroup.commands || []).length > 0;
      const passesWhenClause = this.evaluateOptionGroupVisibility(optionGroup);
      const sessionHasOption = !sessionResource || this.chatSessionsService.getSessionOption(sessionResource, optionGroup.id) !== void 0;
      if (hasItems && passesWhenClause && sessionHasOption) {
        visibleGroups.set(optionGroup.id, optionGroup);
      }
    }
    return Array.from(visibleGroups.values());
  }
  /**
   * Returns the permissions-kind option group contributed by the active session provider, if any.
   * Items from this group are surfaced inside the chat permission picker, replacing the
   * built-in `ChatPermissionLevel` items. Honors the same visibility predicates as
   * {@link getVisibleOptionGroups} so that `when` clauses are respected.
   *
   * If the provider declares more than one permissions-kind group (which the API forbids),
   * the first one wins.
   */
  getActiveExtensionPermissionGroup(sessionResource) {
    const allOptionGroups = this.getAllOptionsGroups(sessionResource);
    return allOptionGroups.find(
      (g) => g.kind === "permissions" && g.items.length > 0 && this.evaluateOptionGroupVisibility(g)
    );
  }
  /**
   * Refresh all registered option groups for the current chat session.
   * Fires events for each option group with their current selection.
   */
  refreshChatSessionPickers() {
    const sessionResource = this.getCurrentSessionResource();
    const allOptionsGroups = this.getAllOptionsGroups(sessionResource);
    const visibleOptionGroups = this.getVisibleOptionGroupsModeAndUpdateContextKeys(sessionResource);
    if (!allOptionsGroups.length || !visibleOptionGroups.length) {
      this.hideAllSessionPickerWidgets();
      return;
    }
    const currentWidgetGroupIds = new Set(this.chatSessionPickerWidgets.keys());
    const needsRecreation = currentWidgetGroupIds.size !== visibleOptionGroups.length || !visibleOptionGroups.every((group) => currentWidgetGroupIds.has(group.id));
    if (needsRecreation && this._lastSessionPickerAction && this.chatSessionPickerContainer) {
      const widgets = this.createChatSessionPickerWidgets(this._lastSessionPickerAction, this._lastSessionPickerOptions);
      dom.clearNode(this.chatSessionPickerContainer);
      for (const widget of widgets) {
        const container = dom.$(".action-item.chat-sessionPicker-item");
        widget.render(container);
        this.chatSessionPickerContainer.appendChild(container);
      }
    }
    if (this.chatSessionPickerContainer) {
      this.chatSessionPickerContainer.style.display = "";
    }
    if (sessionResource) {
      for (const [optionGroupId] of this.chatSessionPickerWidgets) {
        const currentOption = this.chatSessionsService.getSessionOption(sessionResource, optionGroupId);
        if (currentOption) {
          const optionGroup = allOptionsGroups.find((g) => g.id === optionGroupId);
          if (optionGroup) {
            const currentOptionId = typeof currentOption === "string" ? currentOption : currentOption.id;
            const item = optionGroup.items.find((m) => m.id === currentOptionId);
            if (item && typeof currentOption === "string") {
              this.getOrCreateOptionEmitter(optionGroupId).fire(item);
            } else if (typeof currentOption !== "string") {
              this.getOrCreateOptionEmitter(optionGroupId).fire(currentOption);
            }
          }
        }
      }
    }
  }
  hideAllSessionPickerWidgets() {
    if (this.chatSessionPickerContainer) {
      this.chatSessionPickerContainer.style.display = "none";
    }
  }
  /**
   * Get the current option for a specific option group.
   * Returns undefined if the session doesn't have this option configured.
   */
  getCurrentOptionForGroup(optionGroupId) {
    const sessionResource = this._widget?.viewModel?.model.sessionResource;
    if (!sessionResource) {
      return;
    }
    if (this.chatSessionsService.getSessionOption(sessionResource, optionGroupId) === void 0) {
      return;
    }
    const effectiveSessionType = this.getEffectiveSessionType(sessionResource);
    const optionGroups = effectiveSessionType ? this.chatSessionsService.getOptionGroupsForSessionType(effectiveSessionType) : void 0;
    const optionGroup = optionGroups?.find((g) => g.id === optionGroupId);
    if (!optionGroup || optionGroup.items.length === 0) {
      return;
    }
    const currentOptionValue = this.chatSessionsService.getSessionOption(sessionResource, optionGroupId);
    if (!currentOptionValue) {
      const defaultItem = optionGroup.items.find((item) => item.default);
      return defaultItem;
    }
    if (typeof currentOptionValue === "string") {
      const normalizedOptionId = currentOptionValue.trim();
      return optionGroup.items.find((m) => m.id === normalizedOptionId);
    } else {
      return currentOptionValue;
    }
  }
  hasWorkspaceScmRepository() {
    const folders = this.workspaceContextService.getWorkspace().folders;
    if (folders.length === 0) {
      return false;
    }
    for (const repo of this.scmService.repositories) {
      if (repo.provider.rootUri && this.workspaceContextService.getWorkspaceFolder(repo.provider.rootUri)) {
        return true;
      }
    }
    return false;
  }
  getEffectiveSessionType(sessionResource) {
    return this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() ?? (sessionResource ? getChatSessionType(sessionResource) : void 0);
  }
  /**
   * Updates the agentSessionType context key based on delegate or actual session.
   */
  updateAgentSessionTypeContextKey() {
    const sessionResource = this._widget?.viewModel?.model.sessionResource;
    const delegate = this.options.sessionTypePickerDelegate;
    const delegateSessionType = delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider?.();
    const sessionType = delegateSessionType || (sessionResource ? getChatSessionType(sessionResource) : "");
    this.agentSessionTypeKey.set(sessionType);
    this.chatSessionSupportsDelegationKey.set(this.chatSessionsService.supportsDelegationForSessionType(sessionType));
  }
  /**
   * Updates the widget lock state based on a session type.
   * Local sessions unlock from coding agent mode, while remote/cloud sessions lock to coding agent mode.
   */
  updateWidgetLockStateFromSessionType(sessionType) {
    if (sessionType === localChatSessionType) {
      this._widget?.unlockFromCodingAgent();
      return;
    }
    const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
    if (contribution) {
      this._widget?.lockToCodingAgent(contribution.name, contribution.displayName, contribution.type, contribution.agentHostProviderId);
    } else {
      this._widget?.unlockFromCodingAgent();
    }
  }
  /**
   * Resolves the session type of the active chat session for the delegation picker.
   */
  getActiveSessionTypeForDelegation() {
    const sessionResource = this._widget?.viewModel?.sessionResource;
    return sessionResource ? getAgentSessionProvider(sessionResource) ?? getChatSessionType(sessionResource) : void 0;
  }
  /**
   * Selects (or clears) the pending delegation target. While a target is pending, the widget
   * locks to the target agent and the `hasPendingDelegationTarget` context key hides the
   * agent and model pickers. Re-selecting the active session clears the pending target and
   * restores the pickers.
   */
  continueInSession(provider) {
    this.setPendingDelegationTarget(provider);
    this.focus();
  }
  setPendingDelegationTarget(provider) {
    const isActive = this.getActiveSessionTypeForDelegation() === provider;
    this._pendingDelegationTarget = isActive ? void 0 : provider;
    this.chatHasPendingDelegationTargetKey.set(!!this._pendingDelegationTarget);
    this.updateWidgetLockStateFromSessionType(provider);
    this.updateAgentSessionTypeContextKey();
    this.refreshChatSessionPickers();
  }
  /**
   * Ensures the notification widget is instantiated and appended to the notification container.
   */
  ensureNotificationWidget() {
    if (!this._notificationWidget.value) {
      this._notificationWidget.value = this.instantiationService.createInstance(ChatInputNotificationWidget, {
        modelTargetChatSessionType: this._notificationModelTargetChatSessionType,
        sessionResource: this._currentSessionResourceObservable,
        openModelPicker: () => this.openModelPicker(),
        switchToModel: (modelIdentifier) => this.switchModelByIdentifier(
          modelIdentifier,
          /* storeSelection */
          true,
          /* isUserAction */
          true
        )
      });
      this.chatInputNotificationContainer.appendChild(this._notificationWidget.value.domNode);
    }
  }
  /**
   * Lazy-instantiate the goal banner widget on first use.
   */
  ensureGoalBannerWidget() {
    if (!this._goalBannerWidget.value) {
      const widget = new ChatGoalBannerWidget();
      this._register(widget.onDismiss(() => this._onDidDismissGoalBanner.fire()));
      this._goalBannerWidget.value = widget;
      this.chatGoalBannerContainer.appendChild(widget.domNode);
    }
    return this._goalBannerWidget.value;
  }
  /** Shows the autopilot goal banner with a loading state. */
  showGoalBannerLoading() {
    this.ensureGoalBannerWidget().setLoading();
  }
  /** Updates the goal banner with the given summary text. */
  setGoalBanner(summary) {
    this.ensureGoalBannerWidget().setGoal(summary);
  }
  /** Hides the goal banner. */
  clearGoalBanner() {
    this._goalBannerWidget.value?.clear();
  }
  /**
   * Shows the context usage details popup and focuses it.
   * @returns Whether the details were successfully shown.
   */
  showContextUsageDetails() {
    return this.contextUsageWidget?.showDetails() ?? false;
  }
  /**
   * Updates the context usage widget based on the current model.
   */
  updateContextUsageWidget() {
    this._contextUsageDisposables.clear();
    const model = this._widget?.viewModel?.model;
    if (!model || !this.contextUsageWidget) {
      return;
    }
    const store = new DisposableStore();
    this._contextUsageDisposables.value = store;
    let lastRequest = model.lastRequest;
    const observePreviousResponse = (request) => {
      if (request?.response) {
        store.add(request.response.onDidChange(() => this.contextUsageWidget?.updateSessionCost(model.sessionCost)));
      }
    };
    for (const request of model.getRequests().slice(0, -1)) {
      observePreviousResponse(request);
    }
    store.add(model.onDidChange((e) => {
      if (e.kind === "addRequest") {
        observePreviousResponse(lastRequest);
        lastRequest = e.request;
        this.contextUsageWidget?.update(model.lastRequest);
      } else if (e.kind === "completedRequest") {
        this.contextUsageWidget?.update(model.lastRequest);
      }
    }));
    store.add(this.languageModelsService.onDidChangeLanguageModels(() => {
      const lastRequest2 = model.lastRequest;
      if (lastRequest2?.modelId) {
        this.contextUsageWidget?.update(lastRequest2);
      }
    }));
    this.contextUsageWidget.update(model.lastRequest);
  }
  handleViewModelChange(e) {
    transaction((observableTransaction) => {
      try {
        this.updateInputEditorFontFamily();
        this.resetPendingDelegationForViewModelChange(observableTransaction);
        this.refreshViewModelScopedState();
        this.clearQuestionCarouselIfSessionChanged(e);
        this.clearPlanReviewIfSessionChanged(e);
        this._syncToolConfirmationCarouselForSession();
        this.reconcileSessionTypeForViewModelChange(e, observableTransaction);
        this.preselectModelFromSessionHistory();
      } finally {
        this._modelSelectionController.endSessionSwitch();
      }
    });
    this._modelSelectionController.applyConfiguredDefault();
  }
  resetPendingDelegationForViewModelChange(transaction2) {
    this._pendingDelegationTargetObservable.set(void 0, transaction2);
    this.chatHasPendingDelegationTargetKey.set(false);
  }
  refreshViewModelScopedState() {
    this.updateAgentSessionTypeContextKey();
    this.refreshChatSessionPickers();
    this.ensureNotificationWidget();
    this.updateContextUsageWidget();
  }
  clearQuestionCarouselIfSessionChanged(e) {
    let hasMatchingResource = false;
    if (e.currentSessionResource) {
      for (const r of this._questionCarouselSessionResources.values()) {
        if (isEqual(r, e.currentSessionResource)) {
          hasMatchingResource = true;
          break;
        }
      }
    }
    if (this._questionCarouselSessionResources.size > 0 && (!e.currentSessionResource || !hasMatchingResource)) {
      this.clearQuestionCarousel();
    }
  }
  clearPlanReviewIfSessionChanged(e) {
    let hasMatchingPlanReviewResource = false;
    if (e.currentSessionResource) {
      for (const r of this._planReviewSessionResources.values()) {
        if (isEqual(r, e.currentSessionResource)) {
          hasMatchingPlanReviewResource = true;
          break;
        }
      }
    }
    if (this._planReviewSessionResources.size > 0 && (!e.currentSessionResource || !hasMatchingPlanReviewResource)) {
      this.clearPlanReview();
    }
  }
  reconcileSessionTypeForViewModelChange(e, transaction2) {
    this._currentSessionResourceObservable.set(e.currentSessionResource, transaction2);
    const newSessionType = this.getCurrentSessionType();
    if (e.currentSessionResource && this._currentSessionType && newSessionType !== this._currentSessionType) {
      logChangesToStateModel(this._inputModel, `[CVVM].1 onDidChangeViewModel -> session change: ${this._currentSessionType} -> ${newSessionType} in ${this._currentSessionKey}, ${e.currentSessionResource.toString()}`, void 0, this._inputModel?.state.get(), this.logService);
      this._currentSessionTypeObservable.set(newSessionType, transaction2);
      this.initSelectedModel();
      this.checkModelInSessionPool();
      this.checkModeInSessionPool();
    } else if (e.currentSessionResource) {
      logChangesToStateModel(this._inputModel, `[CVVM].2 onDidChangeViewModel -> session change: ${this._currentSessionType} -> ${newSessionType} in ${this._currentSessionKey}, ${e.currentSessionResource.toString()}`, void 0, this._inputModel?.state.get(), this.logService);
      this._currentSessionTypeObservable.set(newSessionType, transaction2);
      this.restorePerTypeModelAfterViewModelAssignment();
      this.reinitializeIfModelInvalidForPool();
    }
  }
  restorePerTypeModelAfterViewModelAssignment() {
    if (this._modelSelectionController.restorePerTypeModel) {
      this.initSelectedModel();
      if (!this._modelSelectionController.hasPendingIntent() && !this._modelSelectionController.isAwaitingRememberedModel()) {
        this.checkModelInSessionPool();
      }
    }
  }
  render(container, initialValue, widget) {
    this._widget = widget;
    this._currentSessionResourceObservable.set(widget.viewModel?.sessionResource, void 0);
    this.getVisibleOptionGroupsModeAndUpdateContextKeys(this.getCurrentSessionResource());
    const delegate = this.options.sessionTypePickerDelegate;
    if (delegate?.setActiveSessionProvider && delegate?.getActiveSessionProvider) {
      const initialSessionType = delegate.getActiveSessionProvider();
      if (initialSessionType) {
        this.updateWidgetLockStateFromSessionType(initialSessionType);
      }
    }
    this._register(widget.onDidChangeViewModel((e) => this.handleViewModelChange(e)));
    let elements;
    if (this.options.renderStyle === "compact") {
      elements = dom.h(".interactive-input-part", [
        dom.h(".chat-input-persistent-content@persistentContentContainer"),
        dom.h(".interactive-input-and-edit-session", [
          dom.h(".chat-plan-review-widget-container@chatPlanReviewContainer"),
          dom.h(".chat-question-carousel-widget-container@chatQuestionCarouselContainer"),
          dom.h(".chat-tool-confirmation-carousel-container@chatToolConfirmationCarouselContainer"),
          dom.h(".chat-input-notification-container@chatInputNotificationContainer"),
          dom.h(".voice-mode-onboarding-container@voiceModeOnboardingContainer"),
          dom.h(".dictation-onboarding-container@dictationOnboardingContainer"),
          dom.h(".chat-goal-banner-container@chatGoalBannerContainer"),
          dom.h(".chat-todo-list-widget-container@chatInputTodoListWidgetContainer"),
          dom.h(".chat-artifacts-widget-container@chatArtifactsWidgetContainer"),
          dom.h(".chat-editing-session@chatEditingSessionWidgetContainer"),
          dom.h(".chat-getting-started-tip-container@chatGettingStartedTipContainer"),
          dom.h(".interactive-input-and-side-toolbar@inputAndSideToolbar", [
            dom.h(".chat-input-container@inputContainer", [
              dom.h(".chat-editor-container@editorContainer"),
              dom.h(".chat-input-toolbars@inputToolbars")
            ])
          ]),
          dom.h(".chat-secondary-toolbar@secondaryToolbar", [
            dom.h(".chat-context-usage-container@contextUsageWidgetContainer"),
            dom.h(".chat-input-status-container@statusToolbarContainer")
          ]),
          dom.h(".chat-attachments-container@attachmentsContainer", [
            dom.h(".chat-attached-context@attachedContextContainer")
          ]),
          dom.h(".interactive-input-followups@followupsContainer")
        ])
      ]);
    } else {
      elements = dom.h(".interactive-input-part", [
        dom.h(".chat-input-persistent-content@persistentContentContainer"),
        dom.h(".chat-plan-review-widget-container@chatPlanReviewContainer"),
        dom.h(".chat-question-carousel-widget-container@chatQuestionCarouselContainer"),
        dom.h(".chat-tool-confirmation-carousel-container@chatToolConfirmationCarouselContainer"),
        dom.h(".interactive-input-followups@followupsContainer"),
        dom.h(".chat-input-notification-container@chatInputNotificationContainer"),
        dom.h(".voice-mode-onboarding-container@voiceModeOnboardingContainer"),
        dom.h(".dictation-onboarding-container@dictationOnboardingContainer"),
        dom.h(".chat-goal-banner-container@chatGoalBannerContainer"),
        dom.h(".chat-todo-list-widget-container@chatInputTodoListWidgetContainer"),
        dom.h(".chat-artifacts-widget-container@chatArtifactsWidgetContainer"),
        dom.h(".chat-editing-session@chatEditingSessionWidgetContainer"),
        dom.h(".chat-getting-started-tip-container@chatGettingStartedTipContainer"),
        dom.h(".interactive-input-and-side-toolbar@inputAndSideToolbar", [
          dom.h(".chat-input-container@inputContainer", [
            dom.h(".chat-attachments-container@attachmentsContainer", [
              dom.h(".chat-attached-context@attachedContextContainer")
            ]),
            dom.h(".chat-editor-container@editorContainer"),
            dom.h(".chat-input-toolbars@inputToolbars")
          ])
        ]),
        dom.h(".chat-secondary-toolbar@secondaryToolbar", [
          dom.h(".chat-context-usage-container@contextUsageWidgetContainer"),
          dom.h(".chat-input-status-container@statusToolbarContainer")
        ])
      ]);
    }
    this.container = elements.root;
    this.persistentContentContainer = elements.persistentContentContainer;
    this.chatInputOverlay = dom.$(".chat-input-overlay");
    container.append(this.container);
    this.container.append(this.chatInputOverlay);
    this.container.classList.toggle("compact", this.options.renderStyle === "compact");
    this._scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));
    this.followupsContainer = elements.followupsContainer;
    const inputAndSideToolbar = elements.inputAndSideToolbar;
    const inputContainer = elements.inputContainer;
    this.inputContainer = inputContainer;
    const editorContainer = elements.editorContainer;
    this.attachmentsContainer = elements.attachmentsContainer;
    this.attachedContextContainer = elements.attachedContextContainer;
    const toolbarsContainer = elements.inputToolbars;
    this.secondaryToolbarContainer = elements.secondaryToolbar;
    if (this.options.renderStyle === "compact") {
      this.secondaryToolbarContainer.style.display = "none";
    }
    this.chatEditingSessionWidgetContainer = elements.chatEditingSessionWidgetContainer;
    this.chatInputTodoListWidgetContainer = elements.chatInputTodoListWidgetContainer;
    this.chatArtifactsWidgetContainer = elements.chatArtifactsWidgetContainer;
    this.chatGettingStartedTipContainer = elements.chatGettingStartedTipContainer;
    this.chatGettingStartedTipContainer.style.display = "none";
    this.chatQuestionCarouselContainer = elements.chatQuestionCarouselContainer;
    this.chatPlanReviewContainer = elements.chatPlanReviewContainer;
    this.chatToolConfirmationCarouselContainer = elements.chatToolConfirmationCarouselContainer;
    dom.hide(this.chatToolConfirmationCarouselContainer);
    this.chatInputNotificationContainer = elements.chatInputNotificationContainer;
    const onDidChangeInputOnboardingVisible = () => this.options.onDidChangeInputOnboardingVisible?.(
      this.voiceModeOnboardingService.isVisible || this.dictationOnboardingService.isVisible
    );
    this._register(this.voiceModeOnboardingService.registerHost(elements.voiceModeOnboardingContainer, this.container, () => this.focus(), elements.chatGettingStartedTipContainer, onDidChangeInputOnboardingVisible));
    this._register(this.dictationOnboardingService.registerHost(elements.dictationOnboardingContainer, this.container, elements.chatGettingStartedTipContainer, onDidChangeInputOnboardingVisible));
    this.chatGoalBannerContainer = elements.chatGoalBannerContainer;
    this.contextUsageWidgetContainer = elements.contextUsageWidgetContainer;
    this.statusToolbarContainer = elements.statusToolbarContainer;
    if (this.options.renderStyle === "compact") {
      toolbarsContainer.prepend(this.contextUsageWidgetContainer);
    }
    this.contextUsageWidget = this._register(this.instantiationService.createInstance(ChatContextUsageWidget));
    this.contextUsageWidget.setChatWidget(widget);
    this.contextUsageWidget.setSelectedModel(this._currentLanguageModel.get()?.identifier);
    this.contextUsageWidget.setModelConfigurationResolver(
      (modelId) => this.getModelConfiguration(modelId),
      this._modelConfigStore.onDidChange
    );
    this.contextUsageWidgetContainer.appendChild(this.contextUsageWidget.domNode);
    if (this.options.enableImplicitContext && !this._implicitContext) {
      this._implicitContext = this._register(
        this.instantiationService.createInstance(ChatImplicitContexts)
      );
      this.setImplicitContextEnablement();
      this._register(this._implicitContext.onDidChangeValue(() => {
        this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
        this._handleAttachedContextChange();
      }));
    } else if (!this.options.enableImplicitContext && this._implicitContext) {
      this._implicitContext?.dispose();
      this._implicitContext = void 0;
    }
    this.ensureNotificationWidget();
    this._register(this._attachmentModel.onDidChange((e) => {
      if (e.added.length > 0) {
        this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
      }
      this._handleAttachedContextChange();
    }));
    this.renderChatEditingSessionState(null);
    this.dnd.addOverlay(this.options.dndContainer ?? container, this.options.dndContainer ?? container);
    const inputScopedContextKeyService = this._register(this.contextKeyService.createScoped(inputContainer));
    ChatContextKeys.inChatInput.bindTo(inputScopedContextKeyService).set(true);
    this.currentlyEditingInputKey = ChatContextKeys.currentlyEditingInput.bindTo(inputScopedContextKeyService);
    this.editingSentRequestKey = ChatContextKeys.editingRequestType.bindTo(this.contextKeyService);
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, inputScopedContextKeyService])));
    const { historyNavigationBackwardsEnablement, historyNavigationForwardsEnablement } = this._register(registerAndCreateHistoryNavigationContext(inputScopedContextKeyService, this));
    this.historyNavigationBackwardsEnablement = historyNavigationBackwardsEnablement;
    this.historyNavigationForewardsEnablement = historyNavigationForwardsEnablement;
    const options = getSimpleEditorOptions(this.configurationService);
    options.overflowWidgetsDomNode = this.options.editorOverflowWidgetsDomNode;
    options.pasteAs = EditorOptions.pasteAs.defaultValue;
    options.readOnly = false;
    options.ariaLabel = this._getAriaLabel();
    options.fontFamily = DEFAULT_FONT_FAMILY;
    options.fontSize = 13;
    options.lineHeight = INPUT_EDITOR_LINE_HEIGHT;
    options.padding = this.options.renderStyle === "compact" ? INPUT_EDITOR_PADDING.compact : INPUT_EDITOR_PADDING.default;
    options.cursorWidth = 1;
    options.wrappingStrategy = "advanced";
    options.bracketPairColorization = { enabled: false };
    options.autoClosingBrackets = this.configurationService.getValue("editor.autoClosingBrackets");
    options.autoClosingQuotes = this.configurationService.getValue("editor.autoClosingQuotes");
    options.autoSurround = this.configurationService.getValue("editor.autoSurround");
    options.quickSuggestions = false;
    options.suggest = {
      showIcons: true,
      showSnippets: false,
      showWords: true,
      showStatusBar: false,
      insertMode: "insert",
      fitWidthToDetails: true
    };
    options.scrollbar = this.options.renderStyle === "compact" ? { ...options.scrollbar ?? {}, vertical: "hidden" } : {
      ...options.scrollbar ?? {},
      vertical: "auto",
      verticalScrollbarSize: 7
    };
    options.stickyScroll = { enabled: false };
    this._inputEditorElement = dom.append(editorContainer, $(chatInputEditorContainerSelector));
    const editorOptions = getSimpleCodeEditorWidgetOptions();
    editorOptions.contributions?.push(...EditorExtensionsRegistry.getSomeEditorContributions([ContentHoverController.ID, GlyphHoverController.ID, DropIntoEditorController.ID, CopyPasteController.ID, LinkDetector.ID, InlineCompletionsController.ID, PlaceholderTextContribution.ID]));
    this._inputEditor = this._register(scopedInstantiationService.createInstance(CodeEditorWidget, this._inputEditorElement, options, editorOptions));
    this.updateInputEditorFontFamily();
    this._register(addDisposableListener(this._inputEditorElement, dom.EventType.PASTE, (e) => this.handleTerminalCommandPaste(e), true));
    SuggestController.get(this._inputEditor)?.forceRenderingAbove();
    options.overflowWidgetsDomNode?.classList.add("hideSuggestTextIcons");
    this._inputEditorElement.classList.add("hideSuggestTextIcons");
    this._register(this._inputEditor.onKeyDown((e) => {
      if (e.keyCode === KeyCode.Enter && !hasModifierKeys(e)) {
        for (const keybinding of this.keybindingService.lookupKeybindings(ChatSubmitAction.ID)) {
          const chords = keybinding.getDispatchChords();
          const isPlainEnter = chords.length === 1 && chords[0] === "[Enter]";
          if (isPlainEnter) {
            e.preventDefault();
            break;
          }
        }
      }
    }));
    this._register(this._inputEditor.onDidChangeModelContent(() => {
      const currentHeight = Math.min(this._inputEditor.getContentHeight(), this._effectiveInputEditorMaxHeight);
      if (currentHeight !== this.inputEditorHeight) {
        this.inputEditorHeight = currentHeight;
        if (this.cachedWidth) {
          this._layout(this.cachedWidth);
        }
      }
      this._updateInputContentContextKeys();
      this.updateInputEditorFontFamily();
      this._syncTextDebounced.schedule();
    }));
    this._register(this._inputEditor.onDidContentSizeChange((e) => {
      if (e.contentHeightChanged) {
        this.inputEditorHeight = !this.inline ? e.contentHeight : this.inputEditorHeight;
        if (this.cachedWidth) {
          this._layout(this.cachedWidth);
        }
      }
    }));
    this._register(this._inputEditor.onDidFocusEditorText(() => {
      this.inputEditorHasFocus.set(true);
      this._onDidFocus.fire();
      inputContainer.classList.toggle("focused", true);
    }));
    this._register(this._inputEditor.onDidBlurEditorText(() => {
      this.inputEditorHasFocus.set(false);
      inputContainer.classList.toggle("focused", false);
      this._onDidBlur.fire();
    }));
    this._register(this._inputEditor.onDidBlurEditorWidget(() => {
      CopyPasteController.get(this._inputEditor)?.clearWidgets();
      DropIntoEditorController.get(this._inputEditor)?.clearWidgets();
    }));
    const hoverDelegate = this._register(createInstantHoverDelegate());
    const { location } = this.getWidgetLocationInfo(widget);
    const focusedWidget = observableFromEvent(this, this.chatWidgetService.onDidChangeFocusedSession, () => this.chatWidgetService.lastFocusedWidget);
    const isVoiceInputActive = derived(this, (reader) => focusedWidget.read(reader) === widget);
    const pickerOptions = {
      getOverflowAnchor: () => this.inputActionsToolbar.getElement(),
      actionContext: { widget },
      compact: derived((reader) => this._stableInputPartWidth.read(reader) < CHAT_INPUT_PICKER_COLLAPSE_WIDTH)
    };
    const primarySessionPickerOptions = {
      ...pickerOptions,
      compact: constObservable(true)
    };
    const secondaryPickerOptions = {
      ...pickerOptions,
      getOverflowAnchor: () => this.secondaryToolbar.getElement(),
      compact: constObservable(true)
    };
    this._register(dom.addStandardDisposableListener(toolbarsContainer, dom.EventType.CLICK, (e) => this.inputEditor.focus()));
    this._register(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.CLICK, (e) => this.inputEditor.focus()));
    const shorterChatInputActionIds = /* @__PURE__ */ new Set([
      OpenModePickerAction.ID,
      ConfigureToolsAction.ID
    ]);
    this.inputActionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.options.renderInputToolbarBelowInput ? this.attachmentsContainer : toolbarsContainer, MenuId.ChatInput, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      hoverDelegate,
      responsiveBehavior: {
        enabled: true,
        kind: "last",
        minItems: 1,
        actionMinWidth: 48,
        getActionMinWidth: (action) => shorterChatInputActionIds.has(action.id) ? 22 : void 0
      },
      actionViewItemProvider: (action, options2) => {
        if (this.chatPhoneInputPresenter.enabled.get()) {
          if (action.id === OpenModelPickerAction.ID && action instanceof MenuItemAction) {
            if (!this._currentLanguageModel.get()) {
              logChangesToStateModel(this._inputModel, `actionViewItemProvider[phone]: _currentLanguageModel is undefined at toolbar build, forcing default for ${this._currentSessionKey}`, void 0, void 0, this.logService);
              this.setCurrentLanguageModelToDefault();
            }
            const modelDelegate = this._createModelPickerDelegate();
            const modeDelegate = this._createModePickerDelegate();
            return this.instantiationService.createInstance(MobileChatInputCombinedPickerActionItem, action, modeDelegate, modelDelegate);
          } else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
            return new HiddenActionViewItem(action);
          }
        }
        if (action.id === OpenModelPickerAction.ID && action instanceof MenuItemAction) {
          if (!this._currentLanguageModel.get()) {
            logChangesToStateModel(this._inputModel, `actionViewItemProvider[desktop]: _currentLanguageModel is undefined at toolbar build, forcing default for ${this._currentSessionKey}`, void 0, void 0, this.logService);
            this.setCurrentLanguageModelToDefault();
          }
          const itemDelegate = this._createModelPickerDelegate();
          return this.modelWidget = this.instantiationService.createInstance(ModelPickerActionItem, action, itemDelegate, pickerOptions);
        } else if (action.id === OpenModePickerAction.ID && action instanceof MenuItemAction) {
          const delegate2 = this._createModePickerDelegate();
          return this.modeWidget = this.instantiationService.createInstance(ModePickerActionItem, action, delegate2, pickerOptions);
        } else if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
          const delegate2 = this.options.sessionTypePickerDelegate ?? {
            getActiveSessionProvider: () => {
              return this.getActiveSessionTypeForDelegation();
            },
            getPendingDelegationTarget: () => {
              return this._pendingDelegationTarget;
            },
            setPendingDelegationTarget: (provider) => {
              this.setPendingDelegationTarget(provider);
            },
            hasGitRepository: () => this.hasWorkspaceScmRepository()
          };
          const isWelcomeViewMode = !!this.options.sessionTypePickerDelegate?.setActiveSessionProvider;
          const Picker = action.id === OpenSessionTargetPickerAction.ID || isWelcomeViewMode ? SessionTypePickerActionItem : DelegationSessionPickerActionItem;
          return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === "editor" /* Editor */ ? "editor" : "sidebar", delegate2, pickerOptions);
        } else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
          const widgets = this.createChatSessionPickerWidgets(action, primarySessionPickerOptions);
          if (widgets.length === 0) {
            return new HiddenActionViewItem(action);
          }
          return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
        }
        return void 0;
      }
    }));
    this.inputActionsToolbar.getElement().classList.add("chat-input-toolbar");
    this.inputActionsToolbar.context = { widget };
    this._register(this.inputActionsToolbar.onDidChangeMenuItems(() => {
      const toolbarElement = this.inputActionsToolbar.getElement();
      const primaryPickerContainer = toolbarElement.querySelector(".chat-sessionPicker-container");
      if (primaryPickerContainer) {
        this.chatSessionPickerContainer = primaryPickerContainer;
      }
      if (this.cachedWidth && typeof this.cachedInputToolbarWidth === "number" && this.cachedInputToolbarWidth !== this.inputActionsToolbar.getItemsWidth()) {
        this._toolbarRelayoutScheduler.schedule();
      }
    }));
    this._register(autorun((reader) => {
      pickerOptions.compact.read(reader);
      queueMicrotask(() => this.inputActionsToolbar.relayout());
    }));
    let lastPhoneEnabled = this.chatPhoneInputPresenter.enabled.get();
    this._register(autorun((reader) => {
      const enabled = this.chatPhoneInputPresenter.enabled.read(reader);
      if (enabled !== lastPhoneEnabled) {
        lastPhoneEnabled = enabled;
        this.inputActionsToolbar.refresh();
      }
    }));
    this.executeToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, toolbarsContainer, this.options.menus.executeToolbar, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: {
        shouldForwardArgs: true
      },
      hoverDelegate,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      actionViewItemProvider: (action, options2) => {
        if (action.id === ChatVoiceInputModeAction.ID) {
          return this.instantiationService.createInstance(VoiceInputModeActionViewItem, action, { isActive: isVoiceInputActive });
        }
        if ((action.id === ChatSubmitAction.ID || action.id === ChatEditingSessionSubmitAction.ID) && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(class extends MenuEntryActionViewItem {
            render(container2) {
              super.render(container2);
              container2.classList.add("chat-submit-button");
            }
          }, action, options2);
        }
        if ((action.id === ChatSpeechToTextPreparingAction.ID || action.id === ChatSpeechToTextConnectingAction.ID) && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(DictationDownloadActionViewItem, action, options2);
        }
        if (action.id === ToggleChatSpeechToTextAction.ID && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(DictationActionViewItem, action, options2);
        }
        if ((action.id === "agentsVoice.startVoiceInChat" || action.id === "agentsVoice.pttStopInChat") && action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(VoiceModeActionViewItem, action, options2);
        }
        return void 0;
      }
    }));
    this.executeToolbar.getElement().classList.add("chat-execute-toolbar");
    this.executeToolbar.context = { widget };
    this._register(this.executeToolbar.onDidChangeMenuItems(() => {
      if (this.cachedWidth && typeof this.cachedExecuteToolbarWidth === "number" && this.cachedExecuteToolbarWidth !== this.executeToolbar.getItemsWidth()) {
        this._toolbarRelayoutScheduler.schedule();
      }
    }));
    if (this.options.menus.inputSideToolbar) {
      const toolbarSide = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, inputAndSideToolbar, this.options.menus.inputSideToolbar, {
        telemetrySource: this.options.menus.telemetrySource,
        menuOptions: {
          shouldForwardArgs: true
        },
        hoverDelegate
      }));
      this.inputSideToolbarContainer = toolbarSide.getElement();
      toolbarSide.getElement().classList.add("chat-side-toolbar");
      toolbarSide.context = { widget };
    }
    const agentHostShortPickerMinWidths = /* @__PURE__ */ new Map([
      [OpenAgentHostModePickerAction.ID, 22],
      ["sessions.agentHost.runningSessionModePicker", 22],
      [OpenAgentHostAutoApprovePickerAction.ID, 22],
      [OpenAgentHostPermissionModePickerAction.ID, 22],
      [OpenAgentHostCodexApprovalsPickerAction.ID, 22],
      [OpenAgentHostFolderPickerAction.ID, 22],
      ["sessions.tunnelHost.toggleSharing", 16]
    ]);
    const genericChipsContainer = dom.$(".chat-secondary-generic-chips");
    const genericChipsLane = this._register(this.instantiationService.createInstance(
      AgentHostGenericConfigChips,
      widget
    ));
    genericChipsLane.render(genericChipsContainer);
    this.secondaryToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.secondaryToolbarContainer, MenuId.ChatInputSecondary, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      hoverDelegate,
      responsiveBehavior: {
        enabled: true,
        kind: "all",
        minItems: 1,
        actionMinWidth: 48,
        // Agent-host pickers collapse to an icon-only label via a CSS
        // container query in `AgentHostChatInputPicker` when narrow.
        // Report a smaller min-width for them so the responsive layout
        // keeps them visible instead of overflowing into the menu.
        getActionMinWidth: (action) => agentHostShortPickerMinWidths.get(action.id)
      },
      actionViewItemProvider: (action, options2) => {
        const agentHostPickerProperty = getAgentHostPickerProperty(action.id);
        const customSecondaryItem = this.options.secondaryToolbarActionViewItemProvider?.(action, options2);
        if (customSecondaryItem) {
          return customSecondaryItem;
        }
        if ((action.id === OpenSessionTargetPickerAction.ID || action.id === OpenDelegationPickerAction.ID) && action instanceof MenuItemAction) {
          const delegate2 = this.options.sessionTypePickerDelegate ?? {
            getActiveSessionProvider: () => {
              return this.getActiveSessionTypeForDelegation();
            },
            getPendingDelegationTarget: () => {
              return this._pendingDelegationTarget;
            },
            setPendingDelegationTarget: (provider) => {
              this.setPendingDelegationTarget(provider);
            },
            hasGitRepository: () => this.hasWorkspaceScmRepository()
          };
          const isWelcomeViewMode = !!this.options.sessionTypePickerDelegate?.setActiveSessionProvider;
          const Picker = action.id === OpenSessionTargetPickerAction.ID || isWelcomeViewMode ? SessionTypePickerActionItem : DelegationSessionPickerActionItem;
          return this.sessionTargetWidget = this.instantiationService.createInstance(Picker, action, location === "editor" /* Editor */ ? "editor" : "sidebar", delegate2, secondaryPickerOptions);
        } else if (action.id === OpenWorkspacePickerAction.ID && action instanceof MenuItemAction) {
          if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY && this.options.workspacePickerDelegate) {
            return this.instantiationService.createInstance(WorkspacePickerActionItem, action, this.options.workspacePickerDelegate, secondaryPickerOptions);
          } else {
            return new HiddenActionViewItem(action);
          }
        } else if (action.id === OpenPermissionPickerAction.ID && action instanceof MenuItemAction) {
          const delegate2 = {
            currentPermissionLevel: this._currentPermissionLevel,
            setPermissionLevel: (level) => {
              this.setPermissionLevel(level);
            },
            getExtensionPermissions: () => {
              const sessionResource = this.getCurrentSessionResource();
              const group = this.getActiveExtensionPermissionGroup(sessionResource);
              if (!group) {
                return void 0;
              }
              const current = sessionResource ? this.chatSessionsService.getSessionOption(sessionResource, group.id) : void 0;
              const defaultId = group.selected?.id ?? group.items.find((i) => i.default)?.id;
              const rawSelectedId = current === void 0 ? defaultId : typeof current === "string" ? current : current.id;
              const selectedId = rawSelectedId !== void 0 && group.items.some((i) => i.id === rawSelectedId) ? rawSelectedId : defaultId;
              const sessionType = sessionResource ? getChatSessionType(sessionResource) : this.options.sessionTypePickerDelegate?.getActiveSessionProvider?.() ?? "";
              return { sessionType, groupId: group.id, items: group.items, selectedId };
            },
            setExtensionPermission: (groupId, item) => {
              this.updateOptionContextKey(groupId, item.id);
              this.getOrCreateOptionEmitter(groupId).fire(item);
              const sessionResource = this.getCurrentSessionResource();
              if (sessionResource) {
                this.chatSessionsService.setSessionOption(sessionResource, groupId, item);
              }
              this.permissionWidget?.refresh();
            },
            isSandboxToggleApplicable: () => this.getEffectiveSessionType(this.getCurrentSessionResource()) === SessionType.Local
          };
          const widget2 = this.instantiationService.createInstance(PermissionPickerActionItem, action, delegate2, secondaryPickerOptions);
          this.permissionWidget = widget2;
          this.permissionWidgetDisposeListener.value = widget2.onDidDispose(() => {
            if (this.permissionWidget === widget2) {
              this.permissionWidget = void 0;
            }
            this.permissionWidgetDisposeListener.clear();
          });
          return widget2;
        } else if (agentHostPickerProperty && action instanceof MenuItemAction) {
          if (this.options.isSessionsWindow) {
            return new HiddenActionViewItem(action);
          }
          const picker = this.instantiationService.createInstance(AgentHostChatInputPicker, widget, agentHostPickerProperty);
          return new AgentHostChatInputPickerActionViewItem(action, picker);
        } else if (action.id === OpenAgentHostFolderPickerAction.ID && action instanceof MenuItemAction) {
          if (this.options.isSessionsWindow) {
            return new HiddenActionViewItem(action);
          }
          return this.instantiationService.createInstance(AgentHostFolderPickerActionItem, action, widget, secondaryPickerOptions);
        } else if (action.id === ChatSessionPrimaryPickerAction.ID && action instanceof MenuItemAction) {
          const widgets = this.createChatSessionPickerWidgets(action, secondaryPickerOptions);
          if (widgets.length === 0) {
            return new HiddenActionViewItem(action);
          }
          return this.instantiationService.createInstance(ChatSessionPickersContainerActionItem, action, widgets);
        }
        return void 0;
      }
    }));
    this.secondaryToolbar.getElement().classList.add("chat-secondary-input-toolbar");
    this.secondaryToolbar.context = { widget };
    dom.append(this.secondaryToolbarContainer, genericChipsContainer);
    this._register(this.secondaryToolbar.onDidChangeMenuItems(() => {
      const toolbarElement = this.secondaryToolbar.getElement();
      const container2 = toolbarElement.querySelector(".chat-sessionPicker-container");
      if (dom.isHTMLElement(container2)) {
        this.chatSessionPickerContainer = container2;
      }
    }));
    this.statusToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.statusToolbarContainer, MenuId.ChatInputStatus, {
      telemetrySource: this.options.menus.telemetrySource,
      menuOptions: { shouldForwardArgs: true },
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      hoverDelegate
    }));
    this.statusToolbar.getElement().classList.add("chat-input-status-toolbar");
    this.statusToolbar.context = { widget };
    let inputModel = this.modelService.getModel(this.inputUri);
    if (!inputModel) {
      inputModel = this._register(this.modelService.createModel("", null, this.inputUri, false));
    }
    this.textModelResolverService.createModelReference(this.inputUri).then((ref) => {
      if (this._store.isDisposed) {
        ref.dispose();
        return;
      }
      this._register(ref);
    });
    this.inputModel = inputModel;
    this.inputModel.updateOptions({ bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false } });
    this._inputEditor.setModel(this.inputModel);
    if (initialValue) {
      this.inputModel.setValue(initialValue);
      const lineNumber = this.inputModel.getLineCount();
      this._inputEditor.setPosition({ lineNumber, column: this.inputModel.getLineMaxColumn(lineNumber) });
    }
    const onDidChangeCursorPosition = () => {
      const model = this._inputEditor.getModel();
      if (!model) {
        return;
      }
      const position = this._inputEditor.getPosition();
      if (!position) {
        return;
      }
      const atTop = position.lineNumber === 1 && position.column === 1;
      this.chatCursorAtTop.set(atTop);
      this.historyNavigationBackwardsEnablement.set(atTop);
      this.historyNavigationForewardsEnablement.set(position.equals(getLastPosition(model)));
      this._syncInputStateToModel();
    };
    this._register(this._inputEditor.onDidChangeCursorPosition((e) => onDidChangeCursorPosition()));
    onDidChangeCursorPosition();
    this._register(this.themeService.onDidFileIconThemeChange(() => {
      this.renderAttachedContext();
    }));
    this.renderAttachedContext();
    const updateCarouselMaxHeightScheduler = this._register(new dom.AnimationFrameScheduler(this.container, () => this.updateToolConfirmationCarouselMaxHeight()));
    const inputResizeObserver = this._register(new dom.DisposableResizeObserver("ChatInputPart.containerHeight", () => {
      updateCarouselMaxHeightScheduler.schedule();
      const newHeight = this.container.offsetHeight;
      this.height.set(newHeight, void 0);
    }));
    this._register(inputResizeObserver.observe(this.container));
    if (this.options.renderStyle === "compact") {
      const toolbarsResizeObserver = this._register(new dom.DisposableResizeObserver("ChatInputPart.compactToolbars", () => {
        if (this.cachedWidth) {
          this.layout(this.cachedWidth);
        }
      }));
      this._register(toolbarsResizeObserver.observe(toolbarsContainer));
    }
  }
  toggleChatInputOverlay(editing) {
    this.chatInputOverlay.classList.toggle("disabled", editing);
    if (editing) {
      this.overlayClickListener.value = dom.addStandardDisposableListener(this.chatInputOverlay, dom.EventType.CLICK, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._onDidClickOverlay.fire();
      });
    } else {
      this.overlayClickListener.clear();
    }
  }
  renderAttachedContext() {
    const container = this.attachedContextContainer;
    const store = new DisposableStore();
    this.attachedContextDisposables.value = store;
    dom.clearNode(container);
    store.add(dom.addStandardDisposableListener(this.attachmentsContainer, dom.EventType.KEY_DOWN, (e) => {
      this.handleAttachmentNavigation(e);
    }));
    const attachments = this.getRenderableAttachments().map((attachment, index) => [index, attachment]);
    const hasAttachments = Boolean(attachments.length);
    let hasImplicitContext = false;
    const isSuggestedEnabled = this.configurationService.getValue("chat.implicitContext.suggestedContext");
    const hasVisibleImplicitContext = isSuggestedEnabled ? this._implicitContext?.hasValue ?? false : this._implicitContext?.values.some((v) => v.enabled || v.isSelection) ?? false;
    if (this._implicitContext && hasVisibleImplicitContext) {
      const isAttachmentAlreadyAttached = (targetUri, targetRange, targetHandle) => {
        return this._attachmentModel.attachments.some((a) => {
          const aUri = URI.isUri(a.value) ? a.value : isLocation(a.value) ? a.value.uri : void 0;
          const aRange = isLocation(a.value) ? a.value.range : void 0;
          if (targetHandle !== void 0 && isStringVariableEntry(a) && a.handle === targetHandle) {
            return true;
          }
          if (targetUri && aUri && isEqual(targetUri, aUri)) {
            if (targetRange && aRange) {
              return Range.equalsRange(targetRange, aRange);
            }
            return !targetRange && !aRange;
          }
          return false;
        });
      };
      const implicitContextWidget = this.instantiationService.createInstance(
        ImplicitContextAttachmentWidget,
        () => this._widget,
        isAttachmentAlreadyAttached,
        this._implicitContext,
        this._contextResourceLabels,
        this._attachmentModel,
        container
      );
      store.add(implicitContextWidget);
      hasImplicitContext = implicitContextWidget.hasRenderedContexts;
    }
    dom.setVisibility(Boolean(this.options.renderInputToolbarBelowInput || hasAttachments || hasImplicitContext), this.attachmentsContainer);
    dom.setVisibility(hasAttachments || hasImplicitContext, this.attachedContextContainer);
    if (!attachments.length) {
      this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
      this._indexOfLastOpenedContext = -1;
    }
    const maxImagesPerRequest = getImageAttachmentLimit(this._currentLanguageModel.get()?.metadata);
    const imageAttachments = attachments.filter(([, a]) => isImageVariableEntry(a));
    if (maxImagesPerRequest !== void 0 && imageAttachments.length > maxImagesPerRequest) {
      const excessCount = imageAttachments.length - maxImagesPerRequest;
      for (let i = 0; i < excessCount; i++) {
        const attachment = imageAttachments[i][1];
        if (attachment.omittedState === OmittedState.NotOmitted || attachment.omittedState === OmittedState.ImageLimitExceeded) {
          attachment.omittedState = OmittedState.ImageLimitExceeded;
        }
      }
      for (let i = excessCount; i < imageAttachments.length; i++) {
        if (imageAttachments[i][1].omittedState === OmittedState.ImageLimitExceeded) {
          imageAttachments[i][1].omittedState = OmittedState.NotOmitted;
        }
      }
    } else {
      for (const [, a] of imageAttachments) {
        if (a.omittedState === OmittedState.ImageLimitExceeded) {
          a.omittedState = OmittedState.NotOmitted;
        }
      }
    }
    for (const [index, attachment] of attachments) {
      const resource = URI.isUri(attachment.value) ? attachment.value : isLocation(attachment.value) ? attachment.value.uri : void 0;
      const range = isLocation(attachment.value) ? attachment.value.range : void 0;
      const shouldFocusClearButton = index === Math.min(this._indexOfLastAttachedContextDeletedWithKeyboard, attachments.length - 1) && this._indexOfLastAttachedContextDeletedWithKeyboard > -1;
      let attachmentWidget;
      const options = { shouldFocusClearButton, supportsDeletion: true, isCurrentInput: true };
      const lm = this._currentLanguageModel.get();
      if (attachment.kind === "tool" || attachment.kind === "toolset") {
        attachmentWidget = this.instantiationService.createInstance(ToolSetOrToolItemAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (resource && isNotebookOutputVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(NotebookCellOutputChatAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isPromptFileVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(PromptFileAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isPromptTextVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(PromptTextAttachmentWidget, attachment, void 0, options, container, this._contextResourceLabels);
      } else if (resource && (attachment.kind === "file" || attachment.kind === "directory")) {
        attachmentWidget = this.instantiationService.createInstance(FileAttachmentWidget, resource, range, attachment, void 0, lm, options, container, this._contextResourceLabels);
      } else if (attachment.kind === "terminalCommand") {
        attachmentWidget = this.instantiationService.createInstance(TerminalCommandAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isImageVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(ImageAttachmentWidget, resource, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isElementVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(ElementChatAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isPasteVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(PasteAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isSCMHistoryItemVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isSCMHistoryItemChangeVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isSCMHistoryItemChangeRangeVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(SCMHistoryItemChangeRangeAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else if (isBrowserViewVariableEntry(attachment)) {
        attachmentWidget = this.instantiationService.createInstance(BrowserViewAttachmentWidget, attachment, lm, options, container, this._contextResourceLabels);
      } else {
        attachmentWidget = this._chatAttachmentWidgetRegistry.createWidget(attachment, options, container) ?? this.instantiationService.createInstance(DefaultChatAttachmentWidget, resource, range, attachment, void 0, lm, options, container, this._contextResourceLabels);
      }
      if (shouldFocusClearButton) {
        attachmentWidget.element.focus();
      }
      if (index === Math.min(this._indexOfLastOpenedContext, attachments.length - 1)) {
        attachmentWidget.element.focus();
      }
      store.add(attachmentWidget);
      store.add(attachmentWidget.onDidDelete((e) => {
        this.handleAttachmentDeletion(e, index, attachment);
      }));
      store.add(attachmentWidget.onDidOpen((e) => {
        this.handleAttachmentOpen(index, attachment);
      }));
    }
    this._indexOfLastOpenedContext = -1;
  }
  handleAttachmentDeletion(e, index, attachment) {
    if (dom.isKeyboardEvent(e)) {
      this._indexOfLastAttachedContextDeletedWithKeyboard = index;
    }
    this._attachmentModel.delete(attachment.id);
    if (this.configurationService.getValue("chat.implicitContext.enableImplicitContext")) {
      for (const implicitContext of this._implicitContext?.values || []) {
        const implicitValue = URI.isUri(implicitContext?.value) && URI.isUri(attachment.value) && isEqual(implicitContext.value, attachment.value);
        if (implicitContext?.isFile && implicitValue) {
          implicitContext.enabled = false;
        }
      }
    }
    if (this.getRenderableAttachments().length === 0) {
      this.focus();
    }
    this._onDidChangeContext.fire({ removed: [attachment] });
    this.renderAttachedContext();
  }
  /**
   * The attachments that are rendered as pills in the input. Agent-host
   * completion entries (skills/commands) live in the model so their `_meta`
   * reaches the outgoing message, but they are shown as inline decorations
   * rather than pills, so they are excluded here.
   */
  getRenderableAttachments() {
    return this.attachmentModel.attachments.filter((attachment) => !isAgentHostCompletionVariableEntry(attachment));
  }
  handleAttachmentOpen(index, attachment) {
    this._indexOfLastOpenedContext = index;
    this._indexOfLastAttachedContextDeletedWithKeyboard = -1;
    if (this.getRenderableAttachments().length === 0) {
      this.focus();
    }
  }
  handleAttachmentNavigation(e) {
    if (!e.equals(KeyCode.LeftArrow) && !e.equals(KeyCode.RightArrow)) {
      return;
    }
    const attachments = Array.from(this.attachedContextContainer.querySelectorAll(".chat-attached-context-attachment"));
    if (!attachments.length) {
      return;
    }
    const activeElement = dom.getWindow(this.attachmentsContainer).document.activeElement;
    const currentIndex = attachments.findIndex((attachment) => attachment === activeElement);
    let newIndex = currentIndex;
    if (e.equals(KeyCode.LeftArrow)) {
      newIndex = currentIndex > 0 ? currentIndex - 1 : attachments.length - 1;
    } else if (e.equals(KeyCode.RightArrow)) {
      newIndex = currentIndex < attachments.length - 1 ? currentIndex + 1 : 0;
    }
    if (newIndex !== -1) {
      const nextElement = attachments[newIndex];
      nextElement.focus();
      e.preventDefault();
      e.stopPropagation();
    }
  }
  async renderChatTodoListWidget(chatSessionResource) {
    const isTodoWidgetEnabled = this.configurationService.getValue(ChatConfiguration.TodosShowWidget) !== false;
    if (!isTodoWidgetEnabled) {
      return;
    }
    if (!this._chatInputTodoListWidget.value) {
      const widget = this._chatEditingTodosDisposables.add(this.instantiationService.createInstance(ChatTodoListWidget));
      this._chatInputTodoListWidget.value = widget;
      dom.clearNode(this.chatInputTodoListWidgetContainer);
      dom.append(this.chatInputTodoListWidgetContainer, widget.domNode);
    }
    this._chatInputTodoListWidget.value.render(chatSessionResource);
  }
  clearTodoListWidget(sessionResource, force) {
    this._chatInputTodoListWidget.value?.clear(sessionResource, force);
  }
  renderArtifactsWidget(chatSessionResource) {
    if (!this.configurationService.getValue(ChatConfiguration.ArtifactsEnabled)) {
      return;
    }
    if (!this._chatArtifactsWidget.value) {
      const widget = this._register(this.instantiationService.createInstance(ChatArtifactsWidget));
      this._chatArtifactsWidget.value = widget;
      dom.clearNode(this.chatArtifactsWidgetContainer);
      dom.append(this.chatArtifactsWidgetContainer, widget.domNode);
    }
    this._chatArtifactsWidget.value.setSessionResource(chatSessionResource);
  }
  clearArtifactsWidget() {
    this._chatArtifactsWidget.value?.setSessionResource(void 0);
  }
  renderQuestionCarousel(carousel, context, options) {
    const carouselKey = carousel.resolveId ?? `${isResponseVM(context.element) ? context.element.requestId : ""}_${context.contentIndex}`;
    const existing = this._chatQuestionCarouselWidgets.get(carouselKey);
    if (existing) {
      return existing;
    }
    if (isResponseVM(context.element)) {
      this._questionCarouselResponseIds.set(carouselKey, context.element.requestId);
      this._questionCarouselSessionResources.set(carouselKey, context.element.sessionResource);
    }
    const part = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, options);
    this._chatQuestionCarouselWidgets.set(carouselKey, part);
    this._hasQuestionCarouselContextKey?.set(true);
    dom.append(this.chatQuestionCarouselContainer, part.domNode);
    return part;
  }
  clearQuestionCarousel(responseId, resolveId) {
    if (resolveId !== void 0) {
      const part = this._chatQuestionCarouselWidgets.get(resolveId);
      if (part) {
        part.domNode.remove();
        this._chatQuestionCarouselWidgets.deleteAndDispose(resolveId);
      }
      this._questionCarouselResponseIds.delete(resolveId);
      this._questionCarouselSessionResources.delete(resolveId);
    } else if (responseId !== void 0) {
      for (const [key, rid] of this._questionCarouselResponseIds) {
        if (rid === responseId) {
          const part = this._chatQuestionCarouselWidgets.get(key);
          if (part) {
            part.domNode.remove();
            this._chatQuestionCarouselWidgets.deleteAndDispose(key);
          }
          this._questionCarouselResponseIds.delete(key);
          this._questionCarouselSessionResources.delete(key);
        }
      }
    } else {
      this._chatQuestionCarouselWidgets.clearAndDisposeAll();
      this._questionCarouselResponseIds.clear();
      this._questionCarouselSessionResources.clear();
      dom.clearNode(this.chatQuestionCarouselContainer);
    }
    this._hasQuestionCarouselContextKey?.set(this._chatQuestionCarouselWidgets.size > 0);
  }
  get questionCarousel() {
    for (const part of this._chatQuestionCarouselWidgets.values()) {
      if (part.hasFocus()) {
        return part;
      }
    }
    return this._chatQuestionCarouselWidgets.size > 0 ? this._chatQuestionCarouselWidgets.values().next().value : void 0;
  }
  focusQuestionCarousel() {
    const carousel = this.questionCarousel;
    if (carousel) {
      carousel.focus();
      return true;
    }
    return false;
  }
  isQuestionCarouselFocused() {
    for (const part of this._chatQuestionCarouselWidgets.values()) {
      if (part.hasFocus()) {
        return true;
      }
    }
    return false;
  }
  navigateToPreviousQuestion() {
    const carousel = this.questionCarousel;
    return carousel?.navigateToPreviousQuestion() ?? false;
  }
  navigateToNextQuestion() {
    const carousel = this.questionCarousel;
    return carousel?.navigateToNextQuestion() ?? false;
  }
  focusQuestionCarouselTerminal() {
    const carousel = this.questionCarousel;
    return carousel?.focusTerminal() ?? false;
  }
  // --- Plan Review ---
  renderPlanReview(review, context, options) {
    const key = review.resolveId ?? `${isResponseVM(context.element) ? context.element.requestId : ""}_${context.contentIndex}`;
    const existing = this._chatPlanReviewWidgets.get(key);
    if (existing) {
      return existing;
    }
    if (isResponseVM(context.element)) {
      this._planReviewResponseIds.set(key, context.element.requestId);
      this._planReviewSessionResources.set(key, context.element.sessionResource);
    }
    const part = this.instantiationService.createInstance(ChatPlanReviewPart, review, context, options);
    this._chatPlanReviewWidgets.set(key, part);
    dom.append(this.chatPlanReviewContainer, part.domNode);
    return part;
  }
  clearPlanReview(responseId, resolveId) {
    if (resolveId !== void 0) {
      const part = this._chatPlanReviewWidgets.get(resolveId);
      if (part) {
        part.domNode.remove();
        this._chatPlanReviewWidgets.deleteAndDispose(resolveId);
      }
      this._planReviewResponseIds.delete(resolveId);
      this._planReviewSessionResources.delete(resolveId);
    } else if (responseId !== void 0) {
      for (const [key, rid] of this._planReviewResponseIds) {
        if (rid === responseId) {
          const part = this._chatPlanReviewWidgets.get(key);
          if (part) {
            part.domNode.remove();
            this._chatPlanReviewWidgets.deleteAndDispose(key);
          }
          this._planReviewResponseIds.delete(key);
          this._planReviewSessionResources.delete(key);
        }
      }
    } else {
      this._chatPlanReviewWidgets.clearAndDisposeAll();
      this._planReviewResponseIds.clear();
      this._planReviewSessionResources.clear();
      dom.clearNode(this.chatPlanReviewContainer);
    }
  }
  get planReview() {
    return this._chatPlanReviewWidgets.size > 0 ? this._chatPlanReviewWidgets.values().next().value : void 0;
  }
  // --- Tool Confirmation Carousel ---
  get _currentSessionKey() {
    return this._widget?.viewModel?.model.sessionResource.toString();
  }
  get _currentToolConfirmationCarousel() {
    const key = this._currentSessionKey;
    return key ? this._chatToolConfirmationCarousels.get(key) : void 0;
  }
  renderToolConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart) {
    const existing = this._currentToolConfirmationCarousel;
    if (existing) {
      existing.addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
      this.updateToolConfirmationCarouselMaxHeight();
      return existing;
    }
    const key = this._currentSessionKey;
    if (!key) {
      throw new Error("Cannot render tool confirmation carousel without an active session");
    }
    const part = new ChatToolConfirmationCarouselPart(factory, [], revealSubagent, revealSubagentLabel, subAgentInvocationId, agentName);
    part.addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
    this._chatToolConfirmationCarousels.set(key, part);
    const capturedKey = key;
    this._register(part.onDidChangeActiveSubagent((id) => {
      if (this._currentSessionKey === capturedKey) {
        this._onDidChangeActiveConfirmationSubagent.fire(id);
      }
    }));
    if (this._currentSessionKey === capturedKey) {
      this._onDidChangeActiveConfirmationSubagent.fire(part.activeSubAgentInvocationId);
    }
    dom.append(this.chatToolConfirmationCarouselContainer, part.domNode);
    dom.show(this.chatToolConfirmationCarouselContainer);
    this.updateToolConfirmationCarouselMaxHeight();
    this._register(Event.once(part.onDidEmpty)(() => {
      this._chatToolConfirmationCarousels.deleteAndDispose(capturedKey);
      if (this._currentSessionKey === capturedKey) {
        this._onDidChangeActiveConfirmationSubagent.fire(void 0);
        dom.clearNode(this.chatToolConfirmationCarouselContainer);
        dom.hide(this.chatToolConfirmationCarouselContainer);
      }
    }));
    return part;
  }
  addToolToConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart) {
    const existing = this._currentToolConfirmationCarousel;
    if (existing) {
      existing.addToolInvocation(tool, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
      this.updateToolConfirmationCarouselMaxHeight();
    } else {
      this.renderToolConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel, toolPart);
    }
  }
  get activeConfirmationSubagentId() {
    return this._currentToolConfirmationCarousel?.activeSubAgentInvocationId;
  }
  /**
   * Navigates the carousel to the first pending tool from the given subagent.
   */
  activateCarouselForSubagent(subAgentInvocationId) {
    this._currentToolConfirmationCarousel?.activateFirstToolForSubagent(subAgentInvocationId);
  }
  hasToolInConfirmationCarousel(toolCallId) {
    return this._currentToolConfirmationCarousel?.hasToolInvocation(toolCallId) ?? false;
  }
  get hasActiveToolConfirmationCarousel() {
    const carousel = this._currentToolConfirmationCarousel;
    return !!carousel && carousel.pendingCount > 0;
  }
  clearToolConfirmationCarousel() {
    const key = this._currentSessionKey;
    if (key) {
      this._chatToolConfirmationCarousels.deleteAndDispose(key);
    }
    this._onDidChangeActiveConfirmationSubagent.fire(void 0);
    dom.clearNode(this.chatToolConfirmationCarouselContainer);
    dom.hide(this.chatToolConfirmationCarouselContainer);
  }
  /**
   * Swaps the visible tool confirmation carousel when switching sessions.
   */
  _syncToolConfirmationCarouselForSession() {
    dom.clearNode(this.chatToolConfirmationCarouselContainer);
    const carousel = this._currentToolConfirmationCarousel;
    if (carousel && carousel.pendingCount > 0) {
      dom.append(this.chatToolConfirmationCarouselContainer, carousel.domNode);
      dom.show(this.chatToolConfirmationCarouselContainer);
      this.updateToolConfirmationCarouselMaxHeight();
    } else {
      dom.hide(this.chatToolConfirmationCarouselContainer);
    }
    this._onDidChangeActiveConfirmationSubagent.fire(carousel?.activeSubAgentInvocationId);
  }
  setWorkingSetCollapsed(collapsed) {
    this._workingSetCollapsed.set(collapsed, void 0);
  }
  renderChatEditingSessionState(chatEditingSession) {
    dom.setVisibility(Boolean(chatEditingSession), this.chatEditingSessionWidgetContainer);
    if (chatEditingSession) {
      if (!isEqual(chatEditingSession.chatSessionResource, this._lastEditingSessionResource)) {
        this._workingSetCollapsed.set(true, void 0);
      }
      this._lastEditingSessionResource = chatEditingSession.chatSessionResource;
    }
    const modifiedEntries = derivedOpts({ equalsFn: arraysEqual }, (r) => {
      const sessionResource = chatEditingSession?.chatSessionResource ?? this._widget?.viewModel?.model.sessionResource;
      if (sessionResource && getChatSessionType(sessionResource) === AgentSessionProviders.Background) {
        return [];
      }
      return chatEditingSession?.entries.read(r).filter((entry) => entry.state.read(r) === ModifiedFileEntryState.Modified) || [];
    });
    const editSessionEntries = derived((reader) => {
      const seenEntries = new ResourceSet();
      const entries = [];
      for (const entry of modifiedEntries.read(reader)) {
        if (entry.state.read(reader) !== ModifiedFileEntryState.Modified) {
          continue;
        }
        if (!seenEntries.has(entry.modifiedURI)) {
          seenEntries.add(entry.modifiedURI);
          const linesAdded = entry.linesAdded?.read(reader);
          const linesRemoved = entry.linesRemoved?.read(reader);
          entries.push({
            reference: entry.modifiedURI,
            state: ModifiedFileEntryState.Modified,
            kind: "reference",
            options: {
              status: void 0,
              diffMeta: { added: linesAdded ?? 0, removed: linesRemoved ?? 0 },
              isDeletion: !!entry.isDeletion,
              originalUri: entry.isDeletion ? entry.originalURI : void 0
            }
          });
        }
      }
      entries.sort((a, b) => {
        if (a.kind === "reference" && b.kind === "reference") {
          if (a.state === b.state || a.state === void 0 || b.state === void 0) {
            return a.reference.toString().localeCompare(b.reference.toString());
          }
          return a.state - b.state;
        }
        return 0;
      });
      return entries;
    });
    const sessionFileChanges = observableFromEvent(
      this,
      this.agentSessionsService.model.onDidChangeSessions,
      () => {
        const sessionResource = this._widget?.viewModel?.model?.sessionResource;
        if (!sessionResource) {
          return Iterable.empty();
        }
        const model = this.agentSessionsService.getSession(sessionResource);
        return model?.changes instanceof Array ? model.changes : Iterable.empty();
      }
    );
    const sessionFiles = derived(
      (reader) => sessionFileChanges.read(reader).map((entry) => ({
        reference: isIChatSessionFileChange2(entry) ? entry.modifiedUri ?? entry.uri : entry.modifiedUri,
        state: ModifiedFileEntryState.Accepted,
        kind: "reference",
        options: {
          diffMeta: { added: entry.insertions, removed: entry.deletions },
          isDeletion: entry.modifiedUri === void 0,
          originalUri: entry.originalUri,
          status: void 0
        }
      }))
    );
    const shouldRender = derived((reader) => editSessionEntries.read(reader).length > 0 || sessionFiles.read(reader).length > 0);
    this._renderingChatEdits.value = autorun((reader) => {
      if (this.options.renderWorkingSet && shouldRender.read(reader)) {
        this.renderChatEditingSessionWithEntries(
          reader.store,
          chatEditingSession,
          editSessionEntries,
          sessionFiles
        );
      } else {
        dom.clearNode(this.chatEditingSessionWidgetContainer);
        this._chatEditsDisposables.clear();
        this._chatEditList = void 0;
      }
    });
  }
  renderChatEditingSessionWithEntries(store, chatEditingSession, editSessionEntriesObs, sessionEntriesObs) {
    const innerContainer = this.chatEditingSessionWidgetContainer.querySelector(".chat-editing-session-container.show-file-icons") ?? dom.append(this.chatEditingSessionWidgetContainer, $(".chat-editing-session-container.show-file-icons"));
    const overviewRegion = innerContainer.querySelector(".chat-editing-session-overview") ?? dom.append(innerContainer, $(".chat-editing-session-overview"));
    const overviewTitle = overviewRegion.querySelector(".working-set-title") ?? dom.append(overviewRegion, $(".working-set-title"));
    this._chatEditsActionsDisposables.clear();
    const actionsContainer = overviewRegion.querySelector(".chat-editing-session-actions") ?? dom.append(overviewRegion, $(".chat-editing-session-actions"));
    const sessionResource = chatEditingSession?.chatSessionResource || this._widget?.viewModel?.model.sessionResource;
    const scopedContextKeyService = this._chatEditsActionsDisposables.add(this.contextKeyService.createScoped(actionsContainer));
    if (sessionResource) {
      scopedContextKeyService.createKey(ChatContextKeys.agentSessionType.key, getChatSessionType(sessionResource));
      const sessionPullRequest = observableFromEvent(
        this,
        this.agentSessionsService.model.onDidChangeSessions,
        () => {
          const session = this.agentSessionsService.getSession(sessionResource);
          return session ? getAgentSessionPullRequestContextValue(session) : "";
        }
      );
      this._chatEditsActionsDisposables.add(bindContextKey(ChatContextKeys.agentSessionPullRequest, scopedContextKeyService, (r) => sessionPullRequest.read(r)));
    }
    this._chatEditsActionsDisposables.add(bindContextKey(ChatContextKeys.hasAgentSessionChanges, scopedContextKeyService, (r) => !!sessionEntriesObs.read(r)?.length));
    const scopedInstantiationService = this._chatEditsActionsDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
    const workingSetContainer = innerContainer.querySelector(".chat-editing-session-list") ?? dom.append(innerContainer, $(".chat-editing-session-list"));
    const button = this._chatEditsActionsDisposables.add(new ButtonWithIcon(overviewTitle, {
      supportIcons: true,
      secondary: true,
      ariaLabel: localize("chatEditingSession.toggleWorkingSet", "Toggle changed files.")
    }));
    const topLevelStats = derived((reader) => {
      const entries = editSessionEntriesObs.read(reader);
      const sessionEntries = sessionEntriesObs.read(reader);
      let added = 0, removed = 0;
      if (entries.length > 0) {
        for (const entry of entries) {
          if (entry.kind === "reference" && entry.options?.diffMeta) {
            added += entry.options.diffMeta.added;
            removed += entry.options.diffMeta.removed;
          }
        }
      } else {
        for (const entry of sessionEntries) {
          if (entry.kind === "reference" && entry.options?.diffMeta) {
            added += entry.options.diffMeta.added;
            removed += entry.options.diffMeta.removed;
          }
        }
      }
      const files = entries.length > 0 ? entries.length : sessionEntries.length;
      const topLevelIsSessionMenu2 = entries.length === 0 && sessionEntries.length > 0;
      const shouldShowEditingSession = entries.length > 0 || sessionEntries.length > 0;
      return { files, added, removed, shouldShowEditingSession, topLevelIsSessionMenu: topLevelIsSessionMenu2 };
    });
    const topLevelIsSessionMenu = topLevelStats.map((t) => t.topLevelIsSessionMenu);
    store.add(autorun((reader) => {
      const isSessionMenu = topLevelIsSessionMenu.read(reader);
      reader.store.add(scopedInstantiationService.createInstance(MenuWorkbenchButtonBar, actionsContainer, isSessionMenu ? MenuId.ChatEditingSessionChangesToolbar : MenuId.ChatEditingWidgetToolbar, {
        telemetrySource: this.options.menus.telemetrySource,
        small: true,
        menuOptions: sessionResource ? isSessionMenu ? {
          args: [sessionResource, this.agentSessionsService.getSession(sessionResource)?.metadata]
        } : {
          arg: {
            $mid: MarshalledId.ChatViewContext,
            sessionResource
          }
        } : void 0,
        disableWhileRunning: isSessionMenu,
        buttonConfigProvider: (action) => {
          if (action.id === ChatEditingShowChangesAction.ID || action.id === ViewPreviousEditsAction.Id) {
            return { showIcon: true, showLabel: false, isSecondary: true };
          }
          if (action.id === "github.copilot.chat.cloudSessions.openPullRequestForTask") {
            return { showIcon: true, showLabel: false };
          }
          return void 0;
        }
      }));
    }));
    store.add(autorun((reader) => {
      const { files, added, removed, shouldShowEditingSession } = topLevelStats.read(reader);
      const buttonLabel = files === 1 ? localize("chatEditingSession.oneFile", "1 file changed") : localize("chatEditingSession.manyFiles", "{0} files changed", files);
      button.label = buttonLabel;
      button.element.setAttribute("aria-label", localize("chatEditingSession.ariaLabelWithCounts", "{0}, {1} lines added, {2} lines removed", buttonLabel, added, removed));
      this._workingSetLinesAddedSpan.value.textContent = `+${added}`;
      this._workingSetLinesRemovedSpan.value.textContent = `-${removed}`;
      dom.setVisibility(shouldShowEditingSession, this.chatEditingSessionWidgetContainer);
    }));
    const countsContainer = dom.$(".working-set-line-counts");
    button.element.appendChild(countsContainer);
    countsContainer.appendChild(this._workingSetLinesAddedSpan.value);
    countsContainer.appendChild(this._workingSetLinesRemovedSpan.value);
    const toggleWorkingSet = () => {
      this._workingSetCollapsed.set(!this._workingSetCollapsed.get(), void 0);
    };
    this._chatEditsActionsDisposables.add(button.onDidClick(toggleWorkingSet));
    this._chatEditsActionsDisposables.add(addDisposableListener(overviewRegion, "click", (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const target = e.target;
      if (target.closest(".monaco-button")) {
        return;
      }
      toggleWorkingSet();
    }));
    this._chatEditsActionsDisposables.add(autorun((reader) => {
      const collapsed = this._workingSetCollapsed.read(reader);
      button.icon = collapsed ? Codicon.chevronRight : Codicon.chevronDown;
      workingSetContainer.classList.toggle("collapsed", collapsed);
    }));
    if (!this._chatEditList) {
      this._chatEditList = this._chatEditsListPool.get();
      const list = this._chatEditList.object;
      this._chatEditsDisposables.add(this._chatEditList);
      this._chatEditsDisposables.add(list.onDidFocus(() => {
        this._onDidFocus.fire();
      }));
      this._chatEditsDisposables.add(list.onDidOpen(async (e) => {
        if (e.element?.kind === "reference" && URI.isUri(e.element.reference)) {
          const modifiedFileUri = e.element.reference;
          const originalUri = e.element.options?.originalUri;
          if (e.element.options?.isDeletion && originalUri) {
            await this.editorService.openEditor({
              resource: originalUri,
              // instead of modified, because modified will not exist
              options: e.editorOptions
            }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
            return;
          }
          if (originalUri) {
            await this.editorService.openEditor({
              original: { resource: originalUri },
              modified: { resource: modifiedFileUri },
              options: e.editorOptions
            }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
            return;
          }
          const entry = chatEditingSession?.getEntry(modifiedFileUri);
          const pane = await this.editorService.openEditor({
            resource: modifiedFileUri,
            options: e.editorOptions
          }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
          if (pane) {
            entry?.getEditorIntegration(pane).reveal(true, e.editorOptions.preserveFocus);
          }
        }
      }));
      this._chatEditsDisposables.add(addDisposableListener(list.getHTMLElement(), "click", (e) => {
        if (!this.hasFocus()) {
          this._onDidFocus.fire();
        }
      }, true));
      dom.append(workingSetContainer, list.getHTMLElement());
      dom.append(innerContainer, workingSetContainer);
    }
    store.add(autorun((reader) => {
      const editEntries = editSessionEntriesObs.read(reader);
      const sessionFileEntries = sessionEntriesObs.read(reader);
      const allEntries = editEntries.concat(sessionFileEntries);
      const maxItemsShown = 6;
      const itemsShown = Math.min(allEntries.length, maxItemsShown);
      const height = itemsShown * 22;
      const list = this._chatEditList.object;
      list.layout(height);
      list.getHTMLElement().style.height = `${height}px`;
      list.splice(0, list.length, allEntries);
      workingSetContainer.classList.toggle("overflowing", allEntries.length > maxItemsShown);
    }));
  }
  async renderFollowups(items, response) {
    if (!this.options.renderFollowups) {
      return;
    }
    this.followupsDisposables.clear();
    dom.clearNode(this.followupsContainer);
    if (items && items.length > 0) {
      this.followupsDisposables.add(this.instantiationService.createInstance(ChatFollowups, this.followupsContainer, items, this.location, void 0, (followup) => this._onDidAcceptFollowup.fire({ followup, response })));
    }
  }
  /**
   * Sets the maximum height budget for the input part. The editor height will be
   * clamped so it does not grow beyond what this budget allows after accounting
   * for non-editor chrome such as attachments, toolbars, and widgets.
   */
  setMaxHeight(maxHeight) {
    this._maxHeight = maxHeight;
    this.updateToolConfirmationCarouselMaxHeight();
  }
  updateToolConfirmationCarouselMaxHeight() {
    const carousel = this._currentToolConfirmationCarousel;
    if (!carousel) {
      return;
    }
    if (this._maxHeight === void 0) {
      carousel.setMaxHeight(void 0);
      return;
    }
    const carouselHeight = this.chatToolConfirmationCarouselContainer.offsetHeight;
    const otherInputHeight = Math.max(0, this.container.offsetHeight - carouselHeight);
    carousel.setMaxHeight(this._maxHeight - otherInputHeight);
  }
  /**
   * Layout the input part with the given width. Height is intrinsic - determined by content
   * and detected via ResizeObserver, which updates `inputPartHeight` for the parent to observe.
   */
  layout(width) {
    this.cachedWidth = width;
    this._stableInputPartWidth.set(width, void 0);
    this._updateWorkingProgressAnimationDuration(width);
    return this._layout(width);
  }
  _updateWorkingProgressAnimationDuration(width) {
    if (!this.inputContainer) {
      return;
    }
    const MIN_DURATION_S = 1.4;
    const MAX_DURATION_S = 2.5;
    const safeWidth = Math.max(50, width);
    const raw = 0.55 + 0.075 * Math.sqrt(safeWidth);
    const duration = Math.min(MAX_DURATION_S, Math.max(MIN_DURATION_S, raw));
    if (this._lastAnimDurationS !== void 0 && Math.abs(this._lastAnimDurationS - duration) < 0.05) {
      return;
    }
    this._lastAnimDurationS = duration;
    this.inputContainer.style.setProperty("--chat-input-anim-duration", `${duration.toFixed(2)}s`);
    if (this.inputContainer.classList.contains("working")) {
      const inputContainer = this.inputContainer;
      inputContainer.classList.add("chat-input-anim-restart");
      dom.scheduleAtNextAnimationFrame(dom.getWindow(inputContainer), () => {
        inputContainer.classList.remove("chat-input-anim-restart");
      });
    }
  }
  get _effectiveInputEditorMaxHeight() {
    if (this._maxHeight === void 0) {
      return this.inputEditorMaxHeight;
    }
    const currentEditorHeight = this.previousInputEditorDimension?.height ?? 0;
    const nonEditorHeight = Math.max(0, this.height.get() - currentEditorHeight);
    const budgetForEditor = this._maxHeight - nonEditorHeight;
    const minEditorHeight = this.inputEditorMinHeight ?? this.singleLineInputEditorHeight;
    return Math.max(minEditorHeight, Math.min(this.inputEditorMaxHeight, Math.max(0, budgetForEditor)));
  }
  _layout(width, allowRecurse = true) {
    const data = this.getLayoutData();
    const followupsWidth = width - data.inputPartHorizontalPadding;
    this.followupsContainer.style.width = `${followupsWidth}px`;
    const initialEditorScrollWidth = this._inputEditor.getScrollWidth();
    const newEditorWidth = width - data.inputPartHorizontalPadding - data.editorBorder - data.inputPartHorizontalPaddingInside - data.toolbarsWidth - data.sideToolbarWidth;
    const effectiveMaxHeight = this._effectiveInputEditorMaxHeight;
    const clampedContentHeight = Math.min(this._inputEditor.getContentHeight(), effectiveMaxHeight);
    const inputEditorHeight = this.inputEditorMinHeight ? Math.min(Math.max(this.inputEditorMinHeight, clampedContentHeight), effectiveMaxHeight) : clampedContentHeight;
    const newDimension = { width: newEditorWidth, height: inputEditorHeight };
    if (!this.previousInputEditorDimension || (this.previousInputEditorDimension.width !== newDimension.width || this.previousInputEditorDimension.height !== newDimension.height)) {
      this._inputEditor.layout(newDimension);
      this.previousInputEditorDimension = newDimension;
    }
    if (allowRecurse && initialEditorScrollWidth < 10) {
      return this._layout(width, false);
    }
  }
  getLayoutData() {
    const inputSideToolbarWidth = this.inputSideToolbarContainer ? dom.getTotalWidth(this.inputSideToolbarContainer) : 0;
    const getToolbarsWidthCompact = () => {
      const toolbarItemGap = 4;
      const executeToolbarWidth = this.cachedExecuteToolbarWidth = this.executeToolbar.getItemsWidth();
      const inputToolbarWidth = this.cachedInputToolbarWidth = this.inputActionsToolbar.getItemsWidth();
      const executeToolbarPadding = (this.executeToolbar.getItemsLength() - 1) * toolbarItemGap;
      const inputToolbarPadding = this.inputActionsToolbar.getItemsLength() ? (this.inputActionsToolbar.getItemsLength() - 1) * toolbarItemGap : 0;
      const contextUsageWidth = dom.getTotalWidth(this.contextUsageWidgetContainer);
      const inputToolbarsPadding = 12;
      return executeToolbarWidth + executeToolbarPadding + contextUsageWidth + (this.options.renderInputToolbarBelowInput ? 0 : inputToolbarWidth + inputToolbarPadding + inputToolbarsPadding);
    };
    return {
      editorBorder: 2,
      // The sessions window pads `.interactive-input-part` by 32px on each side
      // (vs the default 12px margin) so the input box aligns with the chat
      // content cards. The editor width is computed here, so it must account
      // for the same 64px total horizontal gutter or the editor overflows its
      // container and renders wider than the message content above it.
      inputPartHorizontalPadding: this.options.inputPartHorizontalPadding ?? (this.options.renderStyle === "compact" ? 16 : this.options.isSessionsWindow ? 64 : 24),
      inputPartHorizontalPaddingInside: this.options.renderStyle === "compact" ? 12 : 10,
      toolbarsWidth: this.options.renderStyle === "compact" ? getToolbarsWidthCompact() : 0,
      sideToolbarWidth: inputSideToolbarWidth > 0 ? inputSideToolbarWidth + 4 : 0
    };
  }
  /**
   * Gets the location of the chat widget and whether that location is maximized.
   */
  getWidgetLocationInfo(widget) {
    if (isIChatResourceViewContext(widget.viewContext)) {
      return { location: "editor" /* Editor */, isMaximized: false };
    }
    if (isIChatViewViewContext(widget.viewContext)) {
      const viewLocation = this.viewDescriptorService.getViewLocationById(widget.viewContext.viewId);
      const sideBarPosition = this.layoutService.getSideBarPosition();
      switch (viewLocation) {
        case ViewContainerLocation.Panel:
          return {
            location: "panel" /* Panel */,
            isMaximized: this.layoutService.isPanelMaximized()
          };
        case ViewContainerLocation.AuxiliaryBar:
          return {
            location: sideBarPosition === Position.LEFT ? "sidebarRight" /* SidebarRight */ : "sidebarLeft" /* SidebarLeft */,
            isMaximized: this.layoutService.isAuxiliaryBarMaximized()
          };
        case ViewContainerLocation.Sidebar:
        default:
          return {
            location: sideBarPosition === Position.LEFT ? "sidebarLeft" /* SidebarLeft */ : "sidebarRight" /* SidebarRight */,
            isMaximized: false
          };
      }
    }
    return { location: "editor" /* Editor */, isMaximized: false };
  }
  getDefaultScrollbarOptions() {
    const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
    return this.options.renderStyle === "compact" ? { ...scrollbar, vertical: "hidden" } : { ...scrollbar, vertical: "auto", verticalScrollbarSize: 7 };
  }
  getVisibleScrollbarOptions() {
    const scrollbar = this._inputEditor.getRawOptions().scrollbar ?? {};
    return this.options.renderStyle === "compact" ? { ...scrollbar, vertical: "hidden" } : { ...scrollbar, vertical: "visible", verticalScrollbarSize: 7 };
  }
  updateInputEditorScrollbarOptions() {
    this._inputEditor.updateOptions({
      scrollbar: this._forceVisibleScrollbarUntilAccept ? this.getVisibleScrollbarOptions() : this.getDefaultScrollbarOptions()
    });
  }
  showScrollbarUntilAccept() {
    this._forceVisibleScrollbarUntilAccept = true;
    this.updateInputEditorScrollbarOptions();
  }
  resetScrollbarVisibilityAfterAccept() {
    if (!this._forceVisibleScrollbarUntilAccept) {
      return;
    }
    this._forceVisibleScrollbarUntilAccept = false;
    this.updateInputEditorScrollbarOptions();
  }
};
ChatInputPart._counter = 0;
ChatInputPart = __decorateClass([
  __decorateParam(4, IModelService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IKeybindingService),
  __decorateParam(9, IAccessibilityService),
  __decorateParam(10, ILanguageModelsService),
  __decorateParam(11, ILogService),
  __decorateParam(12, IFileService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IThemeService),
  __decorateParam(15, ITextModelService),
  __decorateParam(16, IStorageService),
  __decorateParam(17, IDialogService),
  __decorateParam(18, IChatAgentService),
  __decorateParam(19, ISharedWebContentExtractorService),
  __decorateParam(20, IChatEntitlementService),
  __decorateParam(21, IChatModeService),
  __decorateParam(22, ILanguageModelToolsService),
  __decorateParam(23, IChatSessionsService),
  __decorateParam(24, IChatContextService),
  __decorateParam(25, IAgentSessionsService),
  __decorateParam(26, IDictationOnboardingService),
  __decorateParam(27, IWorkspaceContextService),
  __decorateParam(28, ISCMService),
  __decorateParam(29, IWorkbenchLayoutService),
  __decorateParam(30, IViewDescriptorService),
  __decorateParam(31, IChatAttachmentWidgetRegistry),
  __decorateParam(32, IChatInputNotificationService),
  __decorateParam(33, IChatPhoneInputPresenter),
  __decorateParam(34, IProductService),
  __decorateParam(35, IVoiceModeOnboardingService),
  __decorateParam(36, IChatWidgetService)
], ChatInputPart);
function getLastPosition(model) {
  return { lineNumber: model.getLineCount(), column: model.getLineLength(model.getLineCount()) + 1 };
}
const chatInputEditorContainerSelector = ".interactive-input-editor";
setupSimpleEditorSelectionStyling(chatInputEditorContainerSelector);
class ChatSessionPickersContainerActionItem extends ActionViewItem {
  constructor(action, widgets, options) {
    super(null, action, options ?? {});
    this.widgets = widgets;
  }
  render(container) {
    container.classList.add("chat-sessionPicker-container");
    for (const widget of this.widgets) {
      const itemContainer = dom.$(".action-item.chat-sessionPicker-item");
      widget.render(itemContainer);
      container.appendChild(itemContainer);
    }
  }
  dispose() {
    for (const widget of this.widgets) {
      widget.dispose();
    }
    super.dispose();
  }
}
class HiddenActionViewItem extends BaseActionViewItem {
  constructor(action) {
    super(void 0, action);
  }
  render(container) {
    super.render(container);
    container.style.display = "none";
  }
}
export {
  ChatInputPart,
  ChatWidgetLocation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0UGFydC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgREVGQVVMVF9GT05UX0ZBTUlMWSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9mb250cy5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBoYXNNb2RpZmllcktleXMsIFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQnV0dG9uV2l0aEljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgYXMgYXJyYXlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IE1hcnNoYWxsZWRJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nSWRzLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IG1peGluIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlVmFsdWUsIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb25zLCBJRWRpdG9yT3B0aW9ucywgSUVkaXRvclNjcm9sbGJhck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVESVRPUl9GT05UX0RFRkFVTFRTIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgSURpbWVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS8yZC9kaW1lbnNpb24uanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgaXNMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29weVBhc3RlQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvcHlQYXN0ZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgRHJvcEludG9FZGl0b3JDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZHJvcE9yUGFzdGVJbnRvL2Jyb3dzZXIvZHJvcEludG9FZGl0b3JDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2NvbnRlbnRIb3ZlckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgR2x5cGhIb3ZlckNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9ob3Zlci9icm93c2VyL2dseXBoSG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IExpbmtEZXRlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2xpbmtzL2Jyb3dzZXIvbGlua3MuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zdWdnZXN0L2Jyb3dzZXIvc3VnZ2VzdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoQnV0dG9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2J1dHRvbmJhci5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckFuZENyZWF0ZUhpc3RvcnlOYXZpZ2F0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hpc3RvcnkvYnJvd3Nlci9jb250ZXh0U2NvcGVkSGlzdG9yeVdpZGdldC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hMaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNhbkxvZywgSUxvZ1NlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgT2JzZXJ2YWJsZU1lbWVudG8sIG9ic2VydmFibGVNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vb2JzZXJ2YWJsZU1lbWVudG8uanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9hZ2VudHNWb2ljZS9icm93c2VyL3ZvaWNlTW9kZU9uYm9hcmRpbmcuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYkNvbnRlbnRFeHRyYWN0b3IvY29tbW9uL3dlYkNvbnRlbnRFeHRyYWN0b3IuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElTQ01TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2NtL2NvbW1vbi9zY20uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgZ2V0U2ltcGxlQ29kZUVkaXRvcldpZGdldE9wdGlvbnMsIGdldFNpbXBsZUVkaXRvck9wdGlvbnMsIHNldHVwU2ltcGxlRWRpdG9yU2VsZWN0aW9uU3R5bGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zaW1wbGVFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0Vmlld1RpdGxlQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFZhcmlhYmxlU2V0LCBnZXRJbWFnZUF0dGFjaG1lbnRMaW1pdCwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgaXNBZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeSwgaXNCcm93c2VyVmlld1ZhcmlhYmxlRW50cnksIGlzRWxlbWVudFZhcmlhYmxlRW50cnksIGlzRXhwbGljaXRGaWxlT3JJbWFnZVZhcmlhYmxlRW50cnksIGlzSW1hZ2VWYXJpYWJsZUVudHJ5LCBpc05vdGVib29rT3V0cHV0VmFyaWFibGVFbnRyeSwgaXNQYXN0ZVZhcmlhYmxlRW50cnksIGlzUHJvbXB0RmlsZVZhcmlhYmxlRW50cnksIGlzUHJvbXB0VGV4dFZhcmlhYmxlRW50cnksIGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVZhcmlhYmxlRW50cnksIGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VWYXJpYWJsZUVudHJ5LCBpc1NDTUhpc3RvcnlJdGVtVmFyaWFibGVFbnRyeSwgaXNTdHJpbmdWYXJpYWJsZUVudHJ5LCBPbWl0dGVkU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSwgZ2V0TW9kZU5hbWVGb3JUZWxlbWV0cnksIElDaGF0TW9kZSwgSUNoYXRNb2RlcywgSUNoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRGb2xsb3d1cCwgSUNoYXRQbGFuUmV2aWV3LCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0VG9vbEludm9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cCwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtLCBJQ2hhdFNlc3Npb25zU2VydmljZSwgaXNBZ2VudEhvc3RUYXJnZXQsIGlzSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIsIGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5LCBnZXRTdG9yZWRTZWxlY3RlZE1vZGVsLCBzdG9yZVNlbGVjdGVkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFNlbGVjdGVkTW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQsIENoYXRQZXJtaXNzaW9uTGV2ZWwsIGlzQ2hhdFBlcm1pc3Npb25MZXZlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQsIGlzQXV0b0FwcHJvdmVWYWx1ZVBvbGljeVJlc3RyaWN0ZWQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0Q29uZmlnUG9saWN5LmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1Nlc3Npb24sIElNb2RpZmllZEZpbGVFbnRyeSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE1vZGVsU2VsZWN0aW9uQ29udHJvbGxlciwgSUNoYXRJbnB1dE1vZGVsU2VsZWN0aW9uUnVudGltZSB9IGZyb20gJy4vY2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbENvbmZpZ3VyYXRpb25TdG9yZSB9IGZyb20gJy4vY2hhdE1vZGVsQ29uZmlndXJhdGlvblN0b3JlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzIH0gZnJvbSAnLi9jaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBkZXNlcmlhbGl6ZVVudGl0bGVkSW5wdXRBdHRhY2htZW50cywgZGVzZXJpYWxpemVVbnRpdGxlZElucHV0U3RhdGUsIHNlcmlhbGl6ZVVudGl0bGVkSW5wdXRBdHRhY2htZW50cywgc2VyaWFsaXplVW50aXRsZWRJbnB1dFN0YXRlIH0gZnJvbSAnLi9jaGF0SW5wdXRTdGF0ZVBlcnNpc3RlbmNlLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFN0YXRlT3JpZ2luLCBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSwgSUNoYXRSZXF1ZXN0TW9kZUluZm8sIElDaGF0UmVxdWVzdE1vZGVsLCBJSW5wdXRNb2RlbCwgbG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgZmlsdGVyTW9kZWxzRm9yU2Vzc2lvbiwgaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbiwgaXNNb2RlbEhpZGRlbkluUGlja2VyLCBpc05ld0NvbnZlcnNhdGlvbiwgbWVyZ2VNb2RlbHNXaXRoQ2FjaGUsIHNob3VsZFJlc2V0T25Nb2RlbExpc3RDaGFuZ2UgfSBmcm9tICcuL2NoYXRJbnB1dE1vZGVsVXRpbHMuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaXNSZXNwb25zZVZNIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0SGlzdG9yeU5hdmlnYXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93aWRnZXQvY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU2Vzc2lvblN1Ym1pdEFjdGlvbiwgQ2hhdFNlc3Npb25QcmltYXJ5UGlja2VyQWN0aW9uLCBDaGF0U3VibWl0QWN0aW9uLCBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0LCBPcGVuRGVsZWdhdGlvblBpY2tlckFjdGlvbiwgT3Blbk1vZGVsUGlja2VyQWN0aW9uLCBPcGVuTW9kZVBpY2tlckFjdGlvbiwgT3BlblBlcm1pc3Npb25QaWNrZXJBY3Rpb24sIE9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyQWN0aW9uLCBPcGVuV29ya3NwYWNlUGlja2VyQWN0aW9uIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFZvaWNlSW5wdXRNb2RlQWN0aW9uLCBWb2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vdm9pY2VJbnB1dE1vZGUvdm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBDaGF0U3BlZWNoVG9UZXh0Q29ubmVjdGluZ0FjdGlvbiwgQ2hhdFNwZWVjaFRvVGV4dFByZXBhcmluZ0FjdGlvbiwgVG9nZ2xlQ2hhdFNwZWVjaFRvVGV4dEFjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdFNwZWVjaFRvVGV4dEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGljdGF0aW9uQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi9zcGVlY2hUb1RleHQvZGljdGF0aW9uQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgRGljdGF0aW9uRG93bmxvYWRBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25Eb3dubG9hZEFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25PbmJvYXJkaW5nLmpzJztcbmltcG9ydCB7IG5vdGlmeURpY3RhdGlvblN1Ym1pdHRlZCB9IGZyb20gJy4uLy4uL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25TZXNzaW9uLmpzJztcbmltcG9ydCB7IFZvaWNlTW9kZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vdm9pY2VDbGllbnQvdm9pY2VNb2RlQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBBZ2VudFNlc3Npb25UYXJnZXQsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IGdldEFnZW50U2Vzc2lvblB1bGxSZXF1ZXN0Q29udGV4dFZhbHVlIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSUFnZW50U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudE1vZGVsIH0gZnJvbSAnLi4vLi4vYXR0YWNobWVudHMvY2hhdEF0dGFjaG1lbnRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRGVmYXVsdENoYXRBdHRhY2htZW50V2lkZ2V0LCBFbGVtZW50Q2hhdEF0dGFjaG1lbnRXaWRnZXQsIEZpbGVBdHRhY2htZW50V2lkZ2V0LCBJbWFnZUF0dGFjaG1lbnRXaWRnZXQsIEJyb3dzZXJWaWV3QXR0YWNobWVudFdpZGdldCwgTm90ZWJvb2tDZWxsT3V0cHV0Q2hhdEF0dGFjaG1lbnRXaWRnZXQsIFBhc3RlQXR0YWNobWVudFdpZGdldCwgUHJvbXB0RmlsZUF0dGFjaG1lbnRXaWRnZXQsIFByb21wdFRleHRBdHRhY2htZW50V2lkZ2V0LCBTQ01IaXN0b3J5SXRlbUF0dGFjaG1lbnRXaWRnZXQsIFNDTUhpc3RvcnlJdGVtQ2hhbmdlQXR0YWNobWVudFdpZGdldCwgU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUF0dGFjaG1lbnRXaWRnZXQsIFRlcm1pbmFsQ29tbWFuZEF0dGFjaG1lbnRXaWRnZXQsIFRvb2xTZXRPclRvb2xJdGVtQXR0YWNobWVudFdpZGdldCB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBDaGF0SW1wbGljaXRDb250ZXh0cyB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2NoYXRJbXBsaWNpdENvbnRleHQuanMnO1xuaW1wb3J0IHsgSW1wbGljaXRDb250ZXh0QXR0YWNobWVudFdpZGdldCB9IGZyb20gJy4uLy4uL2F0dGFjaG1lbnRzL2ltcGxpY2l0Q29udGV4dEF0dGFjaG1lbnQuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSwgSUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudCwgSVNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUsIGlzSUNoYXRSZXNvdXJjZVZpZXdDb250ZXh0LCBpc0lDaGF0Vmlld1ZpZXdDb250ZXh0LCBJV29ya3NwYWNlUGlja2VyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU2hvd0NoYW5nZXNBY3Rpb24sIFZpZXdQcmV2aW91c0VkaXRzQWN0aW9uIH0gZnJvbSAnLi4vLi4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdBY3Rpb25zLmpzJztcbmltcG9ydCB7IHJlc2l6ZUltYWdlIH0gZnJvbSAnLi4vLi4vY2hhdEltYWdlVXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtLCBJQ2hhdFNlc3Npb25QaWNrZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvblBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLCBBZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXJBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdENoYXRJbnB1dFBpY2tlci5qcyc7XG5pbXBvcnQgeyBnZXRBZ2VudEhvc3RQaWNrZXJQcm9wZXJ0eSwgT3BlbkFnZW50SG9zdEF1dG9BcHByb3ZlUGlja2VyQWN0aW9uLCBPcGVuQWdlbnRIb3N0Q29kZXhBcHByb3ZhbHNQaWNrZXJBY3Rpb24sIE9wZW5BZ2VudEhvc3RNb2RlUGlja2VyQWN0aW9uLCBPcGVuQWdlbnRIb3N0UGVybWlzc2lvbk1vZGVQaWNrZXJBY3Rpb24sIE9wZW5BZ2VudEhvc3RGb2xkZXJQaWNrZXJBY3Rpb24gfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDaGF0SW5wdXRQaWNrZXIuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEdlbmVyaWNDb25maWdDaGlwcyB9IGZyb20gJy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEdlbmVyaWNDb25maWdDaGlwcy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGb2xkZXJQaWNrZXJBY3Rpb25JdGVtIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0Rm9sZGVyUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBob25lSW5wdXRQcmVzZW50ZXIsIE1vYmlsZUNoYXRJbnB1dENvbWJpbmVkUGlja2VyQWN0aW9uSXRlbSB9IGZyb20gJy4vY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHRDb250cmliL2NoYXRDb250ZXh0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZVJlZmVyZW5jZSB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMvY2hhdENvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRQbGFuUmV2aWV3UGFydCwgSUNoYXRQbGFuUmV2aWV3UGFydE9wdGlvbnMgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzL2NoYXRQbGFuUmV2aWV3UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQsIElDaGF0UXVlc3Rpb25DYXJvdXNlbE9wdGlvbnMgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzL2NoYXRRdWVzdGlvbkNhcm91c2VsUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydCwgUmV2ZWFsU3ViYWdlbnRDYWxsYmFjaywgVG9vbEludm9jYXRpb25QYXJ0RmFjdG9yeSB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VG9vbEludm9jYXRpb25QYXJ0IH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sSW52b2NhdGlvblBhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ29sbGFwc2libGVMaXN0UG9vbCwgSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtIH0gZnJvbSAnLi4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0UmVmZXJlbmNlc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUb2RvTGlzdFdpZGdldCB9IGZyb20gJy4uL2NoYXRDb250ZW50UGFydHMvY2hhdFRvZG9MaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoYXRBcnRpZmFjdHNXaWRnZXQgfSBmcm9tICcuLi9jaGF0QXJ0aWZhY3RzV2lkZ2V0LmpzJztcbmltcG9ydCB7IGhhbmRsZVRlcm1pbmFsQ29tbWFuZFBhc3RlLCBpc1Rlcm1pbmFsQ29tbWFuZElucHV0IH0gZnJvbSAnLi4vLi4vY2hhdFRlcm1pbmFsQ29tbWFuZFBhc3RlLmpzJztcbmltcG9ydCB7IENoYXREcmFnQW5kRHJvcCB9IGZyb20gJy4uL2NoYXREcmFnQW5kRHJvcC5qcyc7XG5pbXBvcnQgeyBDaGF0Rm9sbG93dXBzIH0gZnJvbSAnLi9jaGF0Rm9sbG93dXBzLmpzJztcbmltcG9ydCB7IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRHb2FsQmFubmVyV2lkZ2V0IH0gZnJvbSAnLi9jaGF0R29hbEJhbm5lcldpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQgfSBmcm9tICcuL2NoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyB9IGZyb20gJy4vY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBDaGF0U2VsZWN0ZWRUb29scyB9IGZyb20gJy4vY2hhdFNlbGVjdGVkVG9vbHMuanMnO1xuaW1wb3J0IHsgRGVsZWdhdGlvblNlc3Npb25QaWNrZXJBY3Rpb25JdGVtIH0gZnJvbSAnLi9kZWxlZ2F0aW9uU2Vzc2lvblBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgTW9kZWxQaWNrZXJBY3Rpb25JdGVtLCBJTW9kZWxQaWNrZXJEZWxlZ2F0ZSwgSU1vZGVsUGlja2VyUHJlc2VudGF0aW9uT3B0aW9ucyB9IGZyb20gJy4vbW9kZWxQaWNrZXIvbW9kZWxQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElNb2RlUGlja2VyRGVsZWdhdGUsIGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluLCBNb2RlUGlja2VyQWN0aW9uSXRlbSB9IGZyb20gJy4vbW9kZVBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSwgUGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW0gfSBmcm9tICcuL3Blcm1pc3Npb25QaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlUGlja2VyQWN0aW9uSXRlbSB9IGZyb20gJy4vc2Vzc2lvblRhcmdldFBpY2tlckFjdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbSB9IGZyb20gJy4vd29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dFVzYWdlV2lkZ2V0IH0gZnJvbSAnLi4vLi4vd2lkZ2V0SG9zdHMvdmlld1BhbmUvY2hhdENvbnRleHRVc2FnZVdpZGdldC5qcyc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IGZpbmRMYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmVUb29sc0FjdGlvbiB9IGZyb20gJy4uLy4uL2FjdGlvbnMvY2hhdFRvb2xBY3Rpb25zLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgUGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGxhY2Vob2xkZXJUZXh0L2Jyb3dzZXIvcGxhY2Vob2xkZXJUZXh0Q29udHJpYnV0aW9uLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5jb25zdCBJTlBVVF9FRElUT1JfTUFYX0hFSUdIVCA9IDI1MDtcbmNvbnN0IElOUFVUX0VESVRPUl9MSU5FX0hFSUdIVCA9IDIwO1xuY29uc3QgSU5QVVRfRURJVE9SX1BBRERJTkcgPSB7IGNvbXBhY3Q6IHsgdG9wOiAyLCBib3R0b206IDIgfSwgZGVmYXVsdDogeyB0b3A6IDEyLCBib3R0b206IDEyIH0gfTtcbmNvbnN0IENhY2hlZExhbmd1YWdlTW9kZWxzS2V5ID0gJ2NoYXQuY2FjaGVkTGFuZ3VhZ2VNb2RlbHMudjInO1xuY29uc3QgQ0hBVF9JTlBVVF9QSUNLRVJfQ09MTEFQU0VfV0lEVEggPSAyODA7XG5jb25zdCBQRVJNSVNTSU9OX0xFVkVMX09QVElPTl9JRCA9ICdwZXJtaXNzaW9uTGV2ZWwnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0SW5wdXRTdHlsZXMge1xuXHRvdmVybGF5QmFja2dyb3VuZDogc3RyaW5nO1xuXHRsaXN0Rm9yZWdyb3VuZDogc3RyaW5nO1xuXHRsaXN0QmFja2dyb3VuZDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0SW5wdXRQYXJ0T3B0aW9ucyB7XG5cdGRlZmF1bHRNb2RlPzogSUNoYXRNb2RlO1xuXHRyZW5kZXJGb2xsb3d1cHM6IGJvb2xlYW47XG5cdHJlbmRlclN0eWxlPzogJ2NvbXBhY3QnO1xuXHRyZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0OiBib29sZWFuO1xuXHRtZW51czoge1xuXHRcdGV4ZWN1dGVUb29sYmFyOiBNZW51SWQ7XG5cdFx0dGVsZW1ldHJ5U291cmNlOiBzdHJpbmc7XG5cdFx0aW5wdXRTaWRlVG9vbGJhcj86IE1lbnVJZDtcblx0fTtcblx0ZWRpdG9yT3ZlcmZsb3dXaWRnZXRzRG9tTm9kZT86IEhUTUxFbGVtZW50O1xuXHRyZW5kZXJXb3JraW5nU2V0OiBib29sZWFuO1xuXHRlbmFibGVJbXBsaWNpdENvbnRleHQ/OiBib29sZWFuO1xuXHRzdXBwb3J0c0NoYW5naW5nTW9kZXM/OiBib29sZWFuO1xuXHRkbmRDb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0aW5wdXRFZGl0b3JNaW5MaW5lcz86IG51bWJlcjtcblx0d2lkZ2V0Vmlld0tpbmRUYWc6IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGRlbGVnYXRlIGZvciB0aGUgc2Vzc2lvbiB0YXJnZXQgcGlja2VyLlxuXHQgKiBXaGVuIHByb3ZpZGVkLCBhbGxvd3MgdGhlIGlucHV0IHBhcnQgdG8gbWFpbnRhaW4gaW5kZXBlbmRlbnQgc3RhdGUgZm9yIHRoZSBzZWxlY3RlZCBzZXNzaW9uIHR5cGUuXG5cdCAqL1xuXHRzZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPzogSVNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBkZWxlZ2F0ZSBmb3IgdGhlIHdvcmtzcGFjZSBwaWNrZXIuXG5cdCAqIFdoZW4gcHJvdmlkZWQsIHNob3dzIGEgd29ya3NwYWNlIHBpY2tlciBhbGxvd2luZyB1c2VycyB0byBzZWxlY3QgYSB0YXJnZXQgd29ya3NwYWNlXG5cdCAqIGZvciB0aGVpciBjaGF0IHJlcXVlc3QuIFRoaXMgaXMgdXNlZnVsIGZvciBlbXB0eSB3aW5kb3cgY29udGV4dHMuXG5cdCAqL1xuXHR3b3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZT86IElXb3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZTtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGFjdGlvbiB2aWV3IGl0ZW0gcHJvdmlkZXIgZm9yIGhvc3Qtb3duZWQgc2Vjb25kYXJ5IHRvb2xiYXJcblx0ICogY2hpcHMgcmVnaXN0ZXJlZCBvbiB7QGxpbmsgTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeX0uIFVzZWQgYnkgdGhlXG5cdCAqIGF1dG9tYXRpb25zIGRpYWxvZyBzbyBwZXItaW5zdGFuY2Ugc3RhdGUgY2FuIHN0YXkgb3V0c2lkZSB0aGUgc2hhcmVkXG5cdCAqIGNoYXQgaW5wdXQgcGFydCB3aGlsZSBzdGlsbCB1c2luZyBtZW51LWRyaXZlbiByZW5kZXJpbmcuXG5cdCAqL1xuXHRzZWNvbmRhcnlUb29sYmFyQWN0aW9uVmlld0l0ZW1Qcm92aWRlcj86IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM/OiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIHRoZSBtb2RlIHBpY2tlciBoaWRlcyBjdXN0b20gYWdlbnRzIGFuZCBvbmx5IG9mZmVycyB0aGVcblx0ICogYnVpbHQtaW4gbW9kZXMgKEFnZW50IC8gQXNrIC8gRWRpdCAvIFBsYW4sIGdhdGVkIGJ5IHRoZWlyIG5vcm1hbFxuXHQgKiB2aXNpYmlsaXR5IHJ1bGVzKS4gQ3VzdG9tLWFnZW50IGRpc2NvdmVyeSBpcyB3b3Jrc3BhY2Utc2NvcGVkIGFuZFxuXHQgKiBkb2Vzbid0IGZvbGxvdyB0aGUgZGlhbG9nJ3MgZm9sZGVyIHNlbGVjdGlvbiwgc28gc3VyZmFjaW5nIGN1c3RvbVxuXHQgKiBhZ2VudHMgdGllZCB0byB0aGUgd29ya2JlbmNoJ3Mgb3BlbiBmb2xkZXJzIHdvdWxkIG1pc2xlYWQgdGhlIHVzZXJcblx0ICogd2hlbiBzY2hlZHVsaW5nIGFnYWluc3QgYSBkaWZmZXJlbnQgZm9sZGVyLlxuXHQgKi9cblx0aGlkZUN1c3RvbUNoYXRNb2Rlcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIHN1cHByZXNzIHRoZSBhdXRvcnVuIHRoYXQgc3dpdGNoZXMgdGhlIGN1cnJlbnQgbGFuZ3VhZ2Vcblx0ICogbW9kZWwgdG8gYSBtb2RlJ3MgZGVjbGFyZWQgcHJlZmVycmVkIG1vZGVsIChgSUNoYXRNb2RlLm1vZGVsYCkuXG5cdCAqIFVzZWQgYnkgdGhlIGF1dG9tYXRpb25zIGRpYWxvZyBzbyBvcGVuaW5nIFwiTmV3IEF1dG9tYXRpb25cIiBhbHdheXNcblx0ICogZGVmYXVsdHMgdG8gdGhlIHBpY2tlcidzIGRlZmF1bHQgKGF1dG8pIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggbW9kZVxuXHQgKiB0aGUgZGlhbG9nIG9wZW5zIHdpdGguXG5cdCAqXG5cdCAqIFVzZXItaW5pdGlhdGVkIG1vZGVsIHBpY2tzIChjbGlja2luZyB0aGUgbW9kZWwgcGlja2VyLCBjeWNsZVxuXHQgKiBrZXliaW5kaW5ncywgZXRjLikgYXJlIHVuYWZmZWN0ZWQuXG5cdCAqL1xuXHRzdXBwcmVzc01vZGVQcmVmZXJyZWRNb2RlbD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIG1vZGVsIHBpY2tzIHZpYSB0aGUgcGlja2VyIGRvIG5vdCB3cml0ZSB0byBnbG9iYWwgc3RvcmFnZS5cblx0ICogTm90ZTogYHN3aXRjaFRvTmV4dE1vZGVsYCBrZXliaW5kaW5ncyBzdGlsbCBwZXJzaXN0IGdsb2JhbGx5LlxuXHQgKi9cblx0c3VwcHJlc3NNb2RlbFBlcnNpc3RlbmNlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZXRoZXIgd2UgYXJlIHJ1bm5pbmcgaW4gdGhlIHNlc3Npb25zIHdpbmRvdy5cblx0ICogV2hlbiB0cnVlLCB0aGUgc2Vjb25kYXJ5IHRvb2xiYXIgKHBlcm1pc3Npb25zIHBpY2tlcikgaXMgaGlkZGVuLlxuXHQgKi9cblx0aXNTZXNzaW9uc1dpbmRvdz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUb3RhbCBob3Jpem9udGFsIGd1dHRlciAoaW4gcGl4ZWxzKSByZXNlcnZlZCBvdXRzaWRlIHRoZSBpbnB1dCBib3ggd2hlblxuXHQgKiBjb21wdXRpbmcgdGhlIGVkaXRvciB3aWR0aC4gRGVmYXVsdHMgYWNjb3VudCBmb3IgdGhlIGAuaW50ZXJhY3RpdmUtaW5wdXQtcGFydGBcblx0ICogbWFyZ2luIHVzZWQgYnkgdGhlIHBhbmVsL3Nlc3Npb25zIGNoYXQuIEhvc3RzIHRoYXQgb3ZlcnJpZGUgdGhhdCBtYXJnaW4gKGUuZy5cblx0ICogdGhlIGF1dG9tYXRpb25zIGRpYWxvZywgd2hpY2ggcmVuZGVycyB0aGUgY29tcG9zZXIgZmx1c2ggd2l0aCBpdHMgZm9ybSBjb2x1bW4pXG5cdCAqIGNhbiBwYXNzIGAwYCBzbyB0aGUgZWRpdG9yIGZpbGxzIHRoZSBib3ggYW5kIGl0cyBzY3JvbGxiYXIgc2l0cyBhdCB0aGUgZWRnZS5cblx0ICovXG5cdGlucHV0UGFydEhvcml6b250YWxQYWRkaW5nPzogbnVtYmVyO1xuXHRvbkRpZENoYW5nZUlucHV0T25ib2FyZGluZ1Zpc2libGU/OiAodmlzaWJsZTogYm9vbGVhbikgPT4gdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2luZ1NldEVudHJ5IHtcblx0dXJpOiBVUkk7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIENoYXRXaWRnZXRMb2NhdGlvbiB7XG5cdFNpZGViYXJMZWZ0ID0gJ3NpZGViYXJMZWZ0Jyxcblx0U2lkZWJhclJpZ2h0ID0gJ3NpZGViYXJSaWdodCcsXG5cdFBhbmVsID0gJ3BhbmVsJyxcblx0RWRpdG9yID0gJ2VkaXRvcicsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRXaWRnZXRMb2NhdGlvbkluZm8ge1xuXHRyZWFkb25seSBsb2NhdGlvbjogQ2hhdFdpZGdldExvY2F0aW9uO1xuXHRyZWFkb25seSBpc01heGltaXplZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdE1vZGVDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGlzVXNlckluaXRpYXRlZDogYm9vbGVhbjtcbn1cblxuY29uc3QgTEVHQUNZX1NIQVJFRF9JTlBVVF9TVEFURV9UQUdTID0gbmV3IFNldChbJ3ZpZXcnLCAnZWRpdG9yJywgJ3F1aWNrJ10pO1xuXG5mdW5jdGlvbiBnZXRJbnB1dFN0YXRlU3RvcmFnZUtleSh3aWRnZXRWaWV3S2luZFRhZzogc3RyaW5nKTogc3RyaW5nIHtcblx0Ly8gTGVnYWN5IHRhZ3MgKHRoZSBvcmlnaW5hbCBjaGF0IGNvbXBvc2VyIHN1cmZhY2VzKSBoaXN0b3JpY2FsbHkgc2hhcmVkXG5cdC8vIGEgc2luZ2xlIHN0b3JhZ2Uga2V5LiBLZWVwIHRoZW0gb24gdGhhdCBrZXkgc28gd2UgZG9uJ3QgaW52YWxpZGF0ZVxuXHQvLyBleGlzdGluZyB1c2VyIGRyYWZ0cy4gTmV3IHN1cmZhY2VzIChlLmcuIHRoZSBhdXRvbWF0aW9ucyBkaWFsb2cpIGdldFxuXHQvLyBhIHBlci10YWcga2V5IHNvIHRoZWlyIGlucHV0IHN0YXRlIGRvZXMgbm90IGJsZWVkIGludG8gb3Igb3V0IG9mIHRoZVxuXHQvLyBjaGF0IGNvbXBvc2VyLlxuXHRpZiAoTEVHQUNZX1NIQVJFRF9JTlBVVF9TVEFURV9UQUdTLmhhcyh3aWRnZXRWaWV3S2luZFRhZykpIHtcblx0XHRyZXR1cm4gJ2NoYXQudW50aXRsZWRJbnB1dFN0YXRlJztcblx0fVxuXHRyZXR1cm4gYGNoYXQudW50aXRsZWRJbnB1dFN0YXRlLiR7d2lkZ2V0Vmlld0tpbmRUYWd9YDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRW1wdHlJbnB1dFN0YXRlTWVtZW50byh3aWRnZXRWaWV3S2luZFRhZzogc3RyaW5nKSB7XG5cdHJldHVybiBvYnNlcnZhYmxlTWVtZW50bzxJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZD4oe1xuXHRcdGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkLFxuXHRcdGtleTogZ2V0SW5wdXRTdGF0ZVN0b3JhZ2VLZXkod2lkZ2V0Vmlld0tpbmRUYWcpLFxuXHRcdHRvU3RvcmFnZTogc2VyaWFsaXplVW50aXRsZWRJbnB1dFN0YXRlLFxuXHRcdGZyb21TdG9yYWdlKHZhbHVlKSB7XG5cdFx0XHRjb25zdCBvYmogPSBkZXNlcmlhbGl6ZVVudGl0bGVkSW5wdXRTdGF0ZSh2YWx1ZSk7XG5cdFx0XHRpZiAob2JqLnNlbGVjdGVkTW9kZWwgJiYgIW9iai5zZWxlY3RlZE1vZGVsLm1ldGFkYXRhLmlzRGVmYXVsdEZvckxvY2F0aW9uKSB7XG5cdFx0XHRcdC8vIE1pZ3JhdGUgb2xkIGBpc0RlZmF1bHRgIHRvIGBpc0RlZmF1bHRGb3JMb2NhdGlvbmBcblx0XHRcdFx0dHlwZSBPbGRJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSA9IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhICYgeyBpc0RlZmF1bHQ/OiBib29sZWFuIH07XG5cdFx0XHRcdGNvbnN0IG9sZElzRGVmYXVsdCA9IChvYmouc2VsZWN0ZWRNb2RlbC5tZXRhZGF0YSBhcyBPbGRJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSkuaXNEZWZhdWx0O1xuXHRcdFx0XHRjb25zdCBpc0RlZmF1bHRGb3JMb2NhdGlvbiA9IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiBCb29sZWFuKG9sZElzRGVmYXVsdCkgfTtcblx0XHRcdFx0bWl4aW4ob2JqLnNlbGVjdGVkTW9kZWwubWV0YWRhdGEsIHsgaXNEZWZhdWx0Rm9yTG9jYXRpb246IGlzRGVmYXVsdEZvckxvY2F0aW9uIH0gc2F0aXNmaWVzIFBhcnRpYWw8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KTtcblx0XHRcdFx0ZGVsZXRlIChvYmouc2VsZWN0ZWRNb2RlbC5tZXRhZGF0YSBhcyBPbGRJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSkuaXNEZWZhdWx0O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG9iajtcblx0XHR9LFxuXHR9KTtcbn1cblxuY29uc3QgZW1wdHlJbnB1dEF0dGFjaG1lbnRzID0gb2JzZXJ2YWJsZU1lbWVudG88cmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdPih7XG5cdGRlZmF1bHRWYWx1ZTogW10sXG5cdGtleTogJ2NoYXQudW50aXRsZWRJbnB1dEF0dGFjaG1lbnRzJyxcblx0dG9TdG9yYWdlOiBzZXJpYWxpemVVbnRpdGxlZElucHV0QXR0YWNobWVudHMsXG5cdGZyb21TdG9yYWdlOiBkZXNlcmlhbGl6ZVVudGl0bGVkSW5wdXRBdHRhY2htZW50cyxcbn0pO1xuXG5leHBvcnQgY2xhc3MgQ2hhdElucHV0UGFydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSGlzdG9yeU5hdmlnYXRpb25XaWRnZXQge1xuXHRwcml2YXRlIHN0YXRpYyBfY291bnRlciA9IDA7XG5cblx0cHJpdmF0ZSBfd29ya2luZ1NldENvbGxhcHNlZCA9IG9ic2VydmFibGVWYWx1ZSgnY2hhdElucHV0UGFydC53b3JraW5nU2V0Q29sbGFwc2VkJywgdHJ1ZSk7XG5cdHByaXZhdGUgX3N0YWJsZUlucHV0UGFydFdpZHRoID0gb2JzZXJ2YWJsZVZhbHVlKCdjaGF0SW5wdXRQYXJ0LnN0YWJsZUlucHV0UGFydFdpZHRoJywgMCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRUb2RvTGlzdFdpZGdldD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBcnRpZmFjdHNXaWRnZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2hhdEFydGlmYWN0c1dpZGdldD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRRdWVzdGlvbkNhcm91c2VsV2lkZ2V0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVlc3Rpb25DYXJvdXNlbFJlc3BvbnNlSWRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcXVlc3Rpb25DYXJvdXNlbFNlc3Npb25SZXNvdXJjZXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRwcml2YXRlIF9oYXNRdWVzdGlvbkNhcm91c2VsQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgQ2hhdFBsYW5SZXZpZXdQYXJ0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGxhblJldmlld1Jlc3BvbnNlSWRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGxhblJldmlld1Nlc3Npb25SZXNvdXJjZXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VscyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgQ2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbFBhcnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nIHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVDb25maXJtYXRpb25TdWJhZ2VudCA9IHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnQuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFZGl0aW5nVG9kb3NEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2xhc3RFZGl0aW5nU2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfb25EaWRMb2FkSW5wdXRTdGF0ZTogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyKCkpO1xuXHRyZWFkb25seSBvbkRpZExvYWRJbnB1dFN0YXRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkTG9hZElucHV0U3RhdGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xiYXJSZWxheW91dFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHtcblx0XHRpZiAodHlwZW9mIHRoaXMuY2FjaGVkV2lkdGggPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLmNhY2hlZFdpZHRoKTtcblx0XHR9XG5cdH0sIDApKTtcblxuXHRwcml2YXRlIF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXM6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZEJsdXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRCbHVyOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQmx1ci5ldmVudDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUNvbnRleHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlbW92ZWQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107IGFkZGVkPzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRleHQ6IEV2ZW50PHsgcmVtb3ZlZD86IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTsgYWRkZWQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfT4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRleHQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRBY2NlcHRGb2xsb3d1cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZm9sbG93dXA6IElDaGF0Rm9sbG93dXA7IHJlc3BvbnNlOiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIHwgdW5kZWZpbmVkIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFjY2VwdEZvbGxvd3VwOiBFdmVudDx7IGZvbGxvd3VwOiBJQ2hhdEZvbGxvd3VwOyByZXNwb25zZTogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCB8IHVuZGVmaW5lZCB9PiA9IHRoaXMuX29uRGlkQWNjZXB0Rm9sbG93dXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfb25EaWRDbGlja092ZXJsYXkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGlja092ZXJsYXk6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbGlja092ZXJsYXkuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXR0YWNobWVudE1vZGVsOiBDaGF0QXR0YWNobWVudE1vZGVsO1xuXHRwcml2YXRlIF93aWRnZXQ/OiBJQ2hhdFdpZGdldDtcblx0cHVibGljIGdldCBhdHRhY2htZW50TW9kZWwoKTogQ2hhdEF0dGFjaG1lbnRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaG1lbnRNb2RlbDtcblx0fVxuXG5cdHJlYWRvbmx5IHNlbGVjdGVkVG9vbHNNb2RlbDogQ2hhdFNlbGVjdGVkVG9vbHM7XG5cblx0cHVibGljIGdldEF0dGFjaGVkQ29udGV4dCgpIHtcblx0XHRjb25zdCBjb250ZXh0QXJyID0gbmV3IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQoKTtcblx0XHRjb250ZXh0QXJyLmFkZCguLi50aGlzLmF0dGFjaG1lbnRNb2RlbC5hdHRhY2htZW50cywgLi4udGhpcy5jaGF0Q29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlQ29udGV4dEl0ZW1zKCkpO1xuXHRcdHJldHVybiBjb250ZXh0QXJyO1xuXHR9XG5cblx0cHVibGljIGdldEF0dGFjaGVkQW5kSW1wbGljaXRDb250ZXh0KCk6IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQge1xuXG5cdFx0Y29uc3QgY29udGV4dEFyciA9IHRoaXMuZ2V0QXR0YWNoZWRDb250ZXh0KCk7XG5cblx0XHRpZiAodGhpcy5pbXBsaWNpdENvbnRleHQpIHtcblx0XHRcdGNvbnN0IGltcGxpY2l0Q2hhdFZhcmlhYmxlcyA9IHRoaXMuaW1wbGljaXRDb250ZXh0LmVuYWJsZWRCYXNlRW50cmllcyh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LmltcGxpY2l0Q29udGV4dC5zdWdnZXN0ZWRDb250ZXh0JykpO1xuXHRcdFx0Y29udGV4dEFyci5hZGQoLi4uaW1wbGljaXRDaGF0VmFyaWFibGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRleHRBcnI7XG5cdH1cblxuXHRwcml2YXRlIF9pbmRleE9mTGFzdEF0dGFjaGVkQ29udGV4dERlbGV0ZWRXaXRoS2V5Ym9hcmQ6IG51bWJlciA9IC0xO1xuXHRwcml2YXRlIF9pbmRleE9mTGFzdE9wZW5lZENvbnRleHQ6IG51bWJlciA9IC0xO1xuXG5cdHByaXZhdGUgX2ltcGxpY2l0Q29udGV4dDogQ2hhdEltcGxpY2l0Q29udGV4dHMgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgaW1wbGljaXRDb250ZXh0KCk6IENoYXRJbXBsaWNpdENvbnRleHRzIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faW1wbGljaXRDb250ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzRmlsZUF0dGFjaG1lbnRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpc2liaWxpdHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dFJlc291cmNlTGFiZWxzOiBSZXNvdXJjZUxhYmVscztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0RWRpdG9yTWF4SGVpZ2h0OiBudW1iZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXRFZGl0b3JNaW5IZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBzaW5nbGVMaW5lSW5wdXRFZGl0b3JIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSBpbnB1dEVkaXRvckhlaWdodDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfbWF4SGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBpbnB1dFNpZGVUb29sYmFyQ29udGFpbmVyPzogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2Vjb25kYXJ5VG9vbGJhckNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlY29uZGFyeVRvb2xiYXIhOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0cHJpdmF0ZSBzdGF0dXNUb29sYmFyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc3RhdHVzVG9vbGJhciE6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXG5cdHByaXZhdGUgZm9sbG93dXBzQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZm9sbG93dXBzRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBhdHRhY2htZW50c0NvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgY2hhdElucHV0T3ZlcmxheSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IG92ZXJsYXlDbGlja0xpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgYXR0YWNoZWRDb250ZXh0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYXR0YWNoZWRDb250ZXh0RGlzcG9zYWJsZXM6IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRwcml2YXRlIGNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNoYXRHZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGNoYXRRdWVzdGlvbkNhcm91c2VsQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2hhdFBsYW5SZXZpZXdDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2hhdElucHV0Tm90aWZpY2F0aW9uQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2hhdEdvYWxCYW5uZXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBwZXJzaXN0ZW50Q29udGVudENvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGlucHV0Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvbldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nb2FsQmFubmVyV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENoYXRHb2FsQmFubmVyV2lkZ2V0PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNtaXNzR29hbEJhbm5lciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvKiogRmlyZWQgd2hlbiB0aGUgdXNlciBkaXNtaXNzZXMgdGhlIGF1dG9waWxvdCBnb2FsIGJhbm5lci4gKi9cblx0cmVhZG9ubHkgb25EaWREaXNtaXNzR29hbEJhbm5lcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZERpc21pc3NHb2FsQmFubmVyLmV2ZW50O1xuXG5cdHByaXZhdGUgY29udGV4dFVzYWdlV2lkZ2V0PzogQ2hhdENvbnRleHRVc2FnZVdpZGdldDtcblx0cHJpdmF0ZSBjb250ZXh0VXNhZ2VXaWRnZXRDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dFVzYWdlRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRnZXQgaW5wdXRDb250YWluZXJFbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dENvbnRhaW5lcjtcblx0fVxuXG5cdGdldCBwZXJzaXN0ZW50Q29udGVudENvbnRhaW5lckVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IGdldHRpbmdTdGFydGVkVGlwQ29udGFpbmVyRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhdEdldHRpbmdTdGFydGVkVGlwQ29udGFpbmVyO1xuXHR9XG5cblx0cmVhZG9ubHkgaGVpZ2h0ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgMCk7XG5cblx0cHJpdmF0ZSBfaW5wdXRFZGl0b3IhOiBDb2RlRWRpdG9yV2lkZ2V0O1xuXHRwcml2YXRlIF9pbnB1dEVkaXRvckVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBfZm9yY2VWaXNpYmxlU2Nyb2xsYmFyVW50aWxBY2NlcHQgPSBmYWxzZTtcblxuXHQvLyBSZWZlcmVuY2UgdG8gdGhlIGlucHV0IG1vZGVsIGZvciBzeW5jaW5nIGlucHV0IHN0YXRlXG5cdHByaXZhdGUgX2lucHV0TW9kZWw6IElJbnB1dE1vZGVsIHwgdW5kZWZpbmVkO1xuXHQvLyBTZXNzaW9uIHJlc291cmNlIG9mIHRoZSBjdXJyZW50bHkgYm91bmQgX2lucHV0TW9kZWwuIFVzZWQgZm9yIGRpYWdub3N0aWNcblx0Ly8gbG9nZ2luZyBzbyB3ZSBjYW4gZGV0ZWN0IHdyaXRlcyB0aGF0IHRhcmdldCBhIGRpZmZlcmVudCBzZXNzaW9uIHRoYW4gdGhlXG5cdC8vIG9uZSB0aGUgd2lkZ2V0IHZpZXdNb2RlbCBpcyBjdXJyZW50bHkgc2hvd2luZyAoY3ljbGljLXJlZiB3aW5kb3cpLlxuXHRwcml2YXRlIF9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cblx0Ly8gRGlzcG9zYWJsZXMgZm9yIG1vZGVsIG9ic2VydmF0aW9uXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU3luY0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudENoYXRNb2RlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJQ2hhdE1vZGVzICYgSURpc3Bvc2FibGU+KCkpO1xuXG5cdC8vIEZsYWcgdG8gcHJldmVudCBjaXJjdWxhciB1cGRhdGVzIGJldHdlZW4gdmlldyBhbmQgbW9kZWxcblx0cHJpdmF0ZSBfaXNTeW5jaW5nVG9PckZyb21JbnB1dE1vZGVsID0gZmFsc2U7XG5cblx0Ly8gRGVib3VuY2VkIHNjaGVkdWxlciBmb3Igc3luY2luZyB0ZXh0IGNoYW5nZXNcblx0cHJpdmF0ZSByZWFkb25seSBfc3luY1RleHREZWJvdW5jZWQ6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSBleGVjdXRlVG9vbGJhciE6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRwcml2YXRlIGlucHV0QWN0aW9uc1Rvb2xiYXIhOiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblxuXG5cblx0Z2V0IGlucHV0RWRpdG9yKCkge1xuXHRcdHJldHVybiB0aGlzLl9pbnB1dEVkaXRvcjtcblx0fVxuXG5cdHNldEhpc3RvcnlLZXkoaGlzdG9yeUtleTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5oaXN0b3J5LnNldEhpc3RvcnlLZXkoaGlzdG9yeUtleSk7XG5cdH1cblxuXHRyZWFkb25seSBkbmQ6IENoYXREcmFnQW5kRHJvcDtcblxuXHRwcml2YXRlIGhpc3Rvcnk6IENoYXRIaXN0b3J5TmF2aWdhdG9yO1xuXHRwcml2YXRlIGhpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudCE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhpc3RvcnlOYXZpZ2F0aW9uRm9yZXdhcmRzRW5hYmxlbWVudCE6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGlucHV0TW9kZWw6IElUZXh0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaW5wdXRFZGl0b3JIYXNUZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpbnB1dEVkaXRvckhhc1NlbmRhYmxlQ29udGVudDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdEN1cnNvckF0VG9wOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpbnB1dEVkaXRvckhhc0ZvY3VzOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBjdXJyZW50bHlFZGl0aW5nSW5wdXRLZXkhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBlZGl0aW5nU2VudFJlcXVlc3RLZXkhOiBJQ29udGV4dEtleTxDaGF0Q29udGV4dEtleXMuRWRpdGluZ1JlcXVlc3RUeXBlIHwgdW5kZWZpbmVkPjtcblx0cHJpdmF0ZSBjaGF0TW9kZUtpbmRLZXk6IElDb250ZXh0S2V5PENoYXRNb2RlS2luZD47XG5cdHByaXZhdGUgY2hhdE1vZGVOYW1lS2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIGNoYXRNb2RlbElkS2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIHdpdGhpbkVkaXRTZXNzaW9uS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBmaWxlUGFydE9mRWRpdFNlc3Npb25LZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGNoYXRTZXNzaW9uSGFzT3B0aW9uczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25PcHRpb25zVmFsaWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGFnZW50U2Vzc2lvblR5cGVLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25TdXBwb3J0c0RlbGVnYXRpb25LZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGNoYXRIYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25IYXNDdXN0b21BZ2VudFRhcmdldDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgY2hhdFNlc3Npb25IYXNUYXJnZXRlZE1vZGVsczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbW9kZWxXaWRnZXQ6IE1vZGVsUGlja2VyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBtb2RlV2lkZ2V0OiBNb2RlUGlja2VyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBwZXJtaXNzaW9uV2lkZ2V0OiBQZXJtaXNzaW9uUGlja2VyQWN0aW9uSXRlbSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBwZXJtaXNzaW9uV2lkZ2V0RGlzcG9zZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSBzZXNzaW9uVGFyZ2V0V2lkZ2V0OiBTZXNzaW9uVHlwZVBpY2tlckFjdGlvbkl0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZGVsZWdhdGlvbldpZGdldDogRGVsZWdhdGlvblNlc3Npb25QaWNrZXJBY3Rpb25JdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgQ2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtPigpKTtcblx0cHJpdmF0ZSBjaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RTZXNzaW9uUGlja2VyQWN0aW9uOiBNZW51SXRlbUFjdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFNlc3Npb25QaWNrZXJPcHRpb25zOiBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25PcHRpb25FbWl0dGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRW1pdHRlcjxJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+PigpKTtcblxuXHQvKipcblx0ICogU2NvcGVkIGNvbnRleHQga2V5IHNlcnZpY2UgZm9yIHRoaXMgY2hhdCBpbnB1dCBwYXJ0LlxuXHQgKiBVc2VkIHRvIGlzb2xhdGUgb3B0aW9uIGdyb3VwIGNvbnRleHQga2V5cyB0byB0aGlzIHNwZWNpZmljIGNoYXQgaW5wdXQgaW5zdGFuY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9zY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBNYXAgb2Ygb3B0aW9uIGdyb3VwIElEIHRvIGl0cyBjb250ZXh0IGtleS5cblx0ICogS2V5cyBmb2xsb3cgdGhlIHBhdHRlcm4gYGNoYXRTZXNzaW9uT3B0aW9uLjxncm91cElkPmAgYW5kIGhvbGQgdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBvcHRpb24gaXRlbSBJRC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbkNvbnRleHRLZXlzOiBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxzdHJpbmc+PiA9IG5ldyBNYXAoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlbGVjdGlvbkRpYWdub3N0aWNzOiBDaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcztcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyOiBDaGF0SW5wdXRNb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRMYW5ndWFnZU1vZGVsOiBJT2JzZXJ2YWJsZTxJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlbGVjdGlvblJ1bnRpbWU6IElDaGF0SW5wdXRNb2RlbFNlbGVjdGlvblJ1bnRpbWU7XG5cblx0LyoqXG5cdCAqIFBlci1lZGl0b3Igc3RvcmUgb2YgZWFjaCBtb2RlbCdzIGNvbmZpZ3VyYXRpb24gKGUuZy4gY29udGV4dCBzaXplLCB0aGlua2luZ1xuXHQgKiBlZmZvcnQpLCBwZXJzaXN0ZWQgdG8gYSBgKGxvY2F0aW9uLCBzZXNzaW9uVHlwZSlgLXNjb3BlZCBzdG9yYWdlIGJ1Y2tldC5cblx0ICogQ2xlYXJlZCBvbiBzZXNzaW9uLXR5cGUgY2hhbmdlIHNvIHRoZSBuZXh0IHJlYWQgcmUtc2VlZHMgZnJvbSB0aGUgbmV3XG5cdCAqIGJ1Y2tldC4gU2VlIGlzc3VlICMzMjAzOTMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbENvbmZpZ1N0b3JlOiBDaGF0TW9kZWxDb25maWd1cmF0aW9uU3RvcmU7XG5cblx0Z2V0IGN1cnJlbnRMYW5ndWFnZU1vZGVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0fVxuXG5cdGdldCBzZWxlY3RlZExhbmd1YWdlTW9kZWwoKTogSU9ic2VydmFibGU8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGU6IEVtaXR0ZXI8SUNoYXRNb2RlQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRNb2RlQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUN1cnJlbnRDaGF0TW9kZTogRXZlbnQ8SUNoYXRNb2RlQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudE1vZGVPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPElDaGF0TW9kZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPElDaGF0TW9kZXM+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50UGVybWlzc2lvbkxldmVsOiBJU2V0dGFibGVPYnNlcnZhYmxlPENoYXRQZXJtaXNzaW9uTGV2ZWw+O1xuXHRwcml2YXRlIHBlcm1pc3Npb25MZXZlbEtleTogSUNvbnRleHRLZXk8Q2hhdFBlcm1pc3Npb25MZXZlbD47XG5cblx0cHVibGljIGdldCBjdXJyZW50TW9kZUtpbmQoKTogQ2hhdE1vZGVLaW5kIHtcblx0XHRjb25zdCBtb2RlID0gdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpO1xuXHRcdHJldHVybiBtb2RlLmtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCAmJiAhdGhpcy5hZ2VudFNlcnZpY2UuaGFzVG9vbHNBZ2VudCA/XG5cdFx0XHRDaGF0TW9kZUtpbmQuRWRpdCA6XG5cdFx0XHRtb2RlLmtpbmQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGN1cnJlbnRNb2RlT2JzKCk6IElPYnNlcnZhYmxlPElDaGF0TW9kZT4ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGN1cnJlbnRDaGF0TW9kZXNPYnMoKTogSU9ic2VydmFibGU8SUNoYXRNb2Rlcz4ge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50Q2hhdE1vZGVzT2JzZXJ2YWJsZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgY3VycmVudFBlcm1pc3Npb25MZXZlbE9icygpOiBJT2JzZXJ2YWJsZTxDaGF0UGVybWlzc2lvbkxldmVsPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGN1cnJlbnRNb2RlSW5mbygpOiBJQ2hhdFJlcXVlc3RNb2RlSW5mbyB7XG5cdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZS5nZXQoKTtcblx0XHRjb25zdCBtb2RlSWQ6ICdhc2snIHwgJ2FnZW50JyB8ICdlZGl0JyB8ICdjdXN0b20nIHwgdW5kZWZpbmVkID0gbW9kZS5pc0J1aWx0aW4gPyB0aGlzLmN1cnJlbnRNb2RlS2luZCA6ICdjdXN0b20nO1xuXG5cdFx0Y29uc3QgbW9kZUluc3RydWN0aW9ucyA9IG1vZGUubW9kZUluc3RydWN0aW9ucz8uZ2V0KCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtpbmQ6IHRoaXMuY3VycmVudE1vZGVLaW5kLFxuXHRcdFx0aXNCdWlsdGluOiBtb2RlLmlzQnVpbHRpbixcblx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IG1vZGVJbnN0cnVjdGlvbnMgPyB7XG5cdFx0XHRcdHVyaTogbW9kZS51cmk/LmdldCgpLFxuXHRcdFx0XHRuYW1lOiBtb2RlLm5hbWUuZ2V0KCksXG5cdFx0XHRcdGNvbnRlbnQ6IG1vZGVJbnN0cnVjdGlvbnMuY29udGVudCxcblx0XHRcdFx0dG9vbFJlZmVyZW5jZXM6IHRoaXMudG9vbFNlcnZpY2UudG9Ub29sUmVmZXJlbmNlcyhtb2RlSW5zdHJ1Y3Rpb25zLnRvb2xSZWZlcmVuY2VzKSxcblx0XHRcdFx0YWxsb3dlZFN1YmFnZW50czogbW9kZS5hZ2VudHM/LmdldCgpLFxuXHRcdFx0XHRtZXRhZGF0YTogbW9kZUluc3RydWN0aW9ucy5tZXRhZGF0YSxcblx0XHRcdFx0aXNCdWlsdGluOiBtb2RlLmlzQnVpbHRpblxuXHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdHRlbGVtZXRyeU1vZGVJZDogbW9kZUlkLFxuXHRcdFx0dGVsZW1ldHJ5TW9kZU5hbWU6IGdldE1vZGVOYW1lRm9yVGVsZW1ldHJ5KG1vZGUpLFxuXHRcdFx0YXBwbHlDb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHBlcm1pc3Npb25MZXZlbDogdGhpcy5fY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjYWNoZWRXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNhY2hlZEV4ZWN1dGVUb29sYmFyV2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYWNoZWRJbnB1dFRvb2xiYXJXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGlucHV0VXJpOiBVUkkgPSBVUkkucGFyc2UoYCR7U2NoZW1hcy52c2NvZGVDaGF0SW5wdXR9OmlucHV0LSR7Q2hhdElucHV0UGFydC5fY291bnRlcisrfWApO1xuXG5cdHByaXZhdGUgX3dvcmtpbmdTZXRMaW5lc0FkZGVkU3BhbiA9IG5ldyBMYXp5KCgpID0+IGRvbS4kKCcud29ya2luZy1zZXQtbGluZXMtYWRkZWQnKSk7XG5cdHByaXZhdGUgX3dvcmtpbmdTZXRMaW5lc1JlbW92ZWRTcGFuID0gbmV3IExhenkoKCkgPT4gZG9tLiQoJy53b3JraW5nLXNldC1saW5lcy1yZW1vdmVkJykpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFZGl0c0FjdGlvbnNEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdEVkaXRzRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbmRlcmluZ0NoYXRFZGl0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRwcml2YXRlIF9jaGF0RWRpdHNMaXN0UG9vbDogQ29sbGFwc2libGVMaXN0UG9vbDtcblx0cHJpdmF0ZSBfY2hhdEVkaXRMaXN0OiBJRGlzcG9zYWJsZVJlZmVyZW5jZTxXb3JrYmVuY2hMaXN0PElDaGF0Q29sbGFwc2libGVMaXN0SXRlbT4+IHwgdW5kZWZpbmVkO1xuXHRnZXQgc2VsZWN0ZWRFbGVtZW50cygpOiBVUklbXSB7XG5cdFx0Y29uc3QgZWRpdHMgPSBbXTtcblx0XHRjb25zdCBlZGl0c0xpc3QgPSB0aGlzLl9jaGF0RWRpdExpc3Q/Lm9iamVjdDtcblx0XHRjb25zdCBzZWxlY3RlZEVsZW1lbnRzID0gZWRpdHNMaXN0Py5nZXRTZWxlY3RlZEVsZW1lbnRzKCkgPz8gW107XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHNlbGVjdGVkRWxlbWVudHMpIHtcblx0XHRcdGlmIChlbGVtZW50LmtpbmQgPT09ICdyZWZlcmVuY2UnICYmIFVSSS5pc1VyaShlbGVtZW50LnJlZmVyZW5jZSkpIHtcblx0XHRcdFx0ZWRpdHMucHVzaChlbGVtZW50LnJlZmVyZW5jZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0cztcblx0fVxuXG5cdHByaXZhdGUgX2F0dGVtcHRlZFdvcmtpbmdTZXRFbnRyaWVzQ291bnQ6IG51bWJlciA9IDA7XG5cdC8qKlxuXHQgKiBUaGUgbnVtYmVyIG9mIHdvcmtpbmcgc2V0IGVudHJpZXMgdGhhdCB0aGUgdXNlciBhY3R1YWxseSB3YW50ZWQgdG8gYXR0YWNoLlxuXHQgKiBUaGlzIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byB7QGxpbmsgQ2hhdElucHV0UGFydC5jaGF0RWRpdFdvcmtpbmdTZXRGaWxlc30uXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGF0dGVtcHRlZFdvcmtpbmdTZXRFbnRyaWVzQ291bnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGVtcHRlZFdvcmtpbmdTZXRFbnRyaWVzQ291bnQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgcGVuZGluZyBkZWxlZ2F0aW9uIHRhcmdldCBpZiBvbmUgaXMgc2V0LlxuXHQgKiBUaGlzIGlzIHVzZWQgd2hlbiB0aGUgdXNlciBjaGFuZ2VzIHRoZSBzZXNzaW9uIHRhcmdldCBwaWNrZXIgdG8gYSBkaWZmZXJlbnQgcHJvdmlkZXJcblx0ICogYnV0IGhhc24ndCBzdWJtaXR0ZWQgeWV0LCBzbyB0aGUgZGVsZWdhdGlvbiB3aWxsIGhhcHBlbiBvbiBzdWJtaXQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0KCk6IEFnZW50U2Vzc2lvblRhcmdldCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0O1xuXHR9XG5cblx0LyoqXG5cdCAqIE51bWJlciBjb25zdW1lcnMgaG9sZGluZyB0aGUgJ2dlbmVyYXRpbmcnIGxvY2suXG5cdCAqL1xuXHRwcml2YXRlIF9nZW5lcmF0aW5nPzogeyByYzogbnVtYmVyOyBkZWZlcjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IH07XG5cblx0cHJpdmF0ZSBfZW1wdHlJbnB1dFN0YXRlOiBPYnNlcnZhYmxlTWVtZW50bzxJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgX2VtcHR5SW5wdXRBdHRhY2htZW50czogT2JzZXJ2YWJsZU1lbWVudG88cmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdPjtcblx0cHJpdmF0ZSBfY2hhdFNlc3Npb25Jc0VtcHR5ID0gZmFsc2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZTxBZ2VudFNlc3Npb25UYXJnZXQgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgZ2V0IF9wZW5kaW5nRGVsZWdhdGlvblRhcmdldCgpOiBBZ2VudFNlc3Npb25UYXJnZXQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fcGVuZGluZ0RlbGVnYXRpb25UYXJnZXRPYnNlcnZhYmxlLmdldCgpOyB9XG5cdHByaXZhdGUgc2V0IF9wZW5kaW5nRGVsZWdhdGlvblRhcmdldCh2YWx1ZTogQWdlbnRTZXNzaW9uVGFyZ2V0IHwgdW5kZWZpbmVkKSB7IHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0T2JzZXJ2YWJsZS5zZXQodmFsdWUsIHVuZGVmaW5lZCk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXJyZW50U2Vzc2lvblR5cGVPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSBnZXQgX2N1cnJlbnRTZXNzaW9uVHlwZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY3VycmVudFNlc3Npb25UeXBlT2JzZXJ2YWJsZS5nZXQoKTsgfVxuXHRwcml2YXRlIHNldCBfY3VycmVudFNlc3Npb25UeXBlKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHsgdGhpcy5fY3VycmVudFNlc3Npb25UeXBlT2JzZXJ2YWJsZS5zZXQodmFsdWUsIHVuZGVmaW5lZCk7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudFNlc3Npb25SZXNvdXJjZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvbk1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT5cblx0XHR0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldE9ic2VydmFibGUucmVhZChyZWFkZXIpXG5cdFx0Pz8gdGhpcy5fY3VycmVudFNlc3Npb25UeXBlT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcilcblx0XHQ/PyB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpXG5cdCk7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdC8vIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yT3B0aW9uczogQ2hhdEVkaXRvck9wdGlvbnMsIC8vIFRPRE8gdGhpcyBzaG91bGQgYmUgdXNlZFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUNoYXRJbnB1dFBhcnRPcHRpb25zLFxuXHRcdHN0eWxlczogSUNoYXRJbnB1dFN0eWxlcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGlubGluZTogYm9vbGVhbixcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxzU2VydmljZTogSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNoYXJlZFdlYkV4dHJhY3RlclNlcnZpY2U6IElTaGFyZWRXZWJDb250ZW50RXh0cmFjdG9yU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRvb2xTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRDb250ZXh0U2VydmljZTogSUNoYXRDb250ZXh0U2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2U6IElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnkgcHJpdmF0ZSByZWFkb25seSBfY2hhdEF0dGFjaG1lbnRXaWRnZXRSZWdpc3RyeTogSUNoYXRBdHRhY2htZW50V2lkZ2V0UmVnaXN0cnksXG5cdFx0QElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZTogSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0UGhvbmVJbnB1dFByZXNlbnRlciBwcml2YXRlIHJlYWRvbmx5IGNoYXRQaG9uZUlucHV0UHJlc2VudGVyOiBJQ2hhdFBob25lSW5wdXRQcmVzZW50ZXIsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlOiBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcyA9IG5ldyBDaGF0TW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcyh0aGlzLmxvZ1NlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UsICgpID0+ICh7XG5cdFx0XHRzdXJmYWNlOiAnd29ya2JlbmNoJyxcblx0XHRcdGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uLFxuXHRcdFx0bW9kZWxUYXJnZXQ6IHRoaXMuZ2V0U2VsZWN0ZWRNb2RlbFRhcmdldCgpLFxuXHRcdFx0c2Vzc2lvbktleTogdGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSxcblx0XHRcdGNvbnZlcnNhdGlvbktleTogdGhpcy5faW5wdXRNb2RlbFNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKSxcblx0XHRcdG1ldGFkYXRhOiB7IHdpZGdldFZpZXdLaW5kOiB0aGlzLm9wdGlvbnMud2lkZ2V0Vmlld0tpbmRUYWcgfSxcblx0XHR9KSk7XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25SdW50aW1lID0ge1xuXHRcdFx0bG9jYXRpb246IHRoaXMubG9jYXRpb24sXG5cdFx0XHRnZXRDdXJyZW50TW9kZUtpbmQ6ICgpID0+IHRoaXMuY3VycmVudE1vZGVLaW5kLFxuXHRcdFx0Z2V0Q3VycmVudFNlc3Npb25UeXBlOiAoKSA9PiB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGUgPz8gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSxcblx0XHRcdGlzRW1wdHk6ICgpID0+ICF0aGlzLl9pbnB1dE1vZGVsIHx8IHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSxcblx0XHRcdGdldE1vZGVsczogc2Vzc2lvblR5cGUgPT4gdGhpcy5nZXRNb2RlbHNGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSksXG5cdFx0XHRnZXRBbGxNb2RlbHM6ICgpID0+IHRoaXMuZ2V0QWxsTWVyZ2VkTW9kZWxzKCksXG5cdFx0XHRyZXF1aXJlc0N1c3RvbU1vZGVsczogc2Vzc2lvblR5cGUgPT4gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlcXVpcmVzQ3VzdG9tTW9kZWxzRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpLFxuXHRcdFx0Z2V0Q29uZmlndXJlZE1vZGVsVmFsdWU6ICgpID0+IHRoaXMuZ2V0Q29uZmlndXJlZE1vZGVsVmFsdWUoKSxcblx0XHRcdHN1YnNjcmliZVRvTW9kZWxDaGFuZ2VzOiBsaXN0ZW5lciA9PiB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKGxpc3RlbmVyKSxcblx0XHRcdGdldEJvdW5kQ29udmVyc2F0aW9uS2V5OiAoKSA9PiB0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0Z2V0VmlzaWJsZUNvbnZlcnNhdGlvbktleTogKCkgPT4gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0cmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbjogKG1vZGVsSWQsIGNvbmZpZ3VyYXRpb24pID0+IHRoaXMucmVzdG9yZU1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkLCBjb25maWd1cmF0aW9uKSxcblx0XHRcdGFwcGx5TW9kZWw6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuY2FjaGVkV2lkdGgpIHtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmNhY2hlZFdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2hhdElucHV0TW9kZWxTZWxlY3Rpb25Db250cm9sbGVyKHRoaXMuX21vZGVsU2VsZWN0aW9uUnVudGltZSwgdGhpcy5fbW9kZWxTZWxlY3Rpb25EaWFnbm9zdGljcykpO1xuXHRcdHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsID0gdGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmN1cnJlbnRNb2RlbDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHVuZGVmaW5lZCwgdGhpcy5fc3RvcmUpKGV2ZW50ID0+IHtcblx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uRGlhZ25vc3RpY3MubG9nU3RvcmFnZUNoYW5nZShldmVudCwgdGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCk/LmlkZW50aWZpZXIpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX21vZGVsQ29uZmlnU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2hhdE1vZGVsQ29uZmlndXJhdGlvblN0b3JlKFxuXHRcdFx0KCkgPT4gdGhpcy5nZXRNb2RlbENvbmZpZ3VyYXRpb25TdG9yYWdlS2V5KCksXG5cdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UsXG5cdFx0KSk7XG5cblx0XHQvLyBJbml0aWFsaXplIGRlYm91bmNlZCB0ZXh0IHN5bmMgc2NoZWR1bGVyXG5cdFx0dGhpcy5fc3luY1RleHREZWJvdW5jZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIGBbREVCT1VOQ0VdIF9zeW5jVGV4dERlYm91bmNlZCBmaXJlZCAtPiBfc3luY0lucHV0U3RhdGVUb01vZGVsIGluICR7dGhpcy5fY3VycmVudFNlc3Npb25LZXl9YCwgdW5kZWZpbmVkLCB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5nZXQoKSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCgpO1xuXHRcdH0sIDE1MCkpO1xuXHRcdHRoaXMuX2VtcHR5SW5wdXRTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZUVtcHR5SW5wdXRTdGF0ZU1lbWVudG8odGhpcy5vcHRpb25zLndpZGdldFZpZXdLaW5kVGFnKShTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIsIHRoaXMuc3RvcmFnZVNlcnZpY2UpKTtcblx0XHR0aGlzLl9lbXB0eUlucHV0QXR0YWNobWVudHMgPSB0aGlzLl9yZWdpc3RlcihlbXB0eUlucHV0QXR0YWNobWVudHMoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5VU0VSLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKSk7XG5cblx0XHR0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmV2ZW50IH0pKTtcblx0XHR0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRNb2RlPignY3VycmVudE1vZGUnLCB0aGlzLm9wdGlvbnMuZGVmYXVsdE1vZGUgPz8gQ2hhdE1vZGUuQWdlbnQpO1xuXHRcdGNvbnN0IGxvY2FsTW9kZXMgPSB0aGlzLmNoYXRNb2RlU2VydmljZS5jcmVhdGVNb2RlcyhMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKSk7XG5cdFx0dGhpcy5fY3VycmVudENoYXRNb2Rlcy52YWx1ZSA9IGxvY2FsTW9kZXM7XG5cdFx0dGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWU8SUNoYXRNb2Rlcz4oJ2N1cnJlbnRDaGF0TW9kZXMnLCBsb2NhbE1vZGVzKTtcblx0XHR0aGlzLl9jdXJyZW50UGVybWlzc2lvbkxldmVsID0gb2JzZXJ2YWJsZVZhbHVlPENoYXRQZXJtaXNzaW9uTGV2ZWw+KCdwZXJtaXNzaW9uTGV2ZWwnLCB0aGlzLmdldERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX2luZGV4T2ZMYXN0T3BlbmVkQ29udGV4dCA9IC0xO1xuXHRcdFx0dGhpcy5yZWZyZXNoQ2hhdFNlc3Npb25QaWNrZXJzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gY2hhdCBzZXNzaW9uIG9wdGlvbiBjaGFuZ2VzIGZvciB0aGUgYWN0aXZlIHNlc3Npb25cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uT3B0aW9ucyhlID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlICYmIGlzRXF1YWwoc2Vzc2lvblJlc291cmNlLCBlLnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0Ly8gT3B0aW9ucyBjaGFuZ2VkIGZvciBvdXIgY3VycmVudCBzZXNzaW9uIC0gcmVmcmVzaCBwaWNrZXJzXG5cdFx0XHRcdHRoaXMucmVmcmVzaENoYXRTZXNzaW9uUGlja2VycygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5vbkRpZENoYW5nZU9wdGlvbkdyb3VwcyhjaGF0U2Vzc2lvblR5cGUgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0Y29uc3QgZGVsZWdhdGVTZXNzaW9uVHlwZSA9IHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI/LigpO1xuXHRcdFx0XHRpZiAoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgPT09IGNoYXRTZXNzaW9uVHlwZSB8fCBkZWxlZ2F0ZVNlc3Npb25UeXBlID09PSBjaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2hDaGF0U2Vzc2lvblBpY2tlcnMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIExpc3RlbiBmb3Igc2Vzc2lvbiB0eXBlIGNoYW5nZXMgZnJvbSB0aGUgd2VsY29tZSBwYWdlIGRlbGVnYXRlXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPy5vbkRpZENoYW5nZUFjdGl2ZVNlc3Npb25Qcm92aWRlcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUub25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uUHJvdmlkZXIoYXN5bmMgKG5ld1Nlc3Npb25UeXBlKSA9PiB7XG5cdFx0XHRcdC8vIFNlZWQgdGhlIGRlc3RpbmF0aW9uIHR5cGUgYmVmb3JlIHRoZSB3ZWxjb21lIHdpZGdldCBhc3luY2hyb25vdXNseSByZXBsYWNlcyBpdHMgb3V0Z29pbmcgdmlldyBtb2RlbC5cblx0XHRcdFx0dGhpcy5fY3VycmVudFNlc3Npb25UeXBlID0gbmV3U2Vzc2lvblR5cGU7XG5cdFx0XHRcdHRoaXMuZ2V0VmlzaWJsZU9wdGlvbkdyb3Vwc01vZGVBbmRVcGRhdGVDb250ZXh0S2V5cyh0aGlzLmdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKSk7XG5cdFx0XHRcdHRoaXMuYWdlbnRTZXNzaW9uVHlwZUtleS5zZXQobmV3U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uU3VwcG9ydHNEZWxlZ2F0aW9uS2V5LnNldCh0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc3VwcG9ydHNEZWxlZ2F0aW9uRm9yU2Vzc2lvblR5cGUobmV3U2Vzc2lvblR5cGUpKTtcblx0XHRcdFx0dGhpcy51cGRhdGVXaWRnZXRMb2NrU3RhdGVGcm9tU2Vzc2lvblR5cGUobmV3U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHR0aGlzLmNoZWNrTW9kZUluU2Vzc2lvblBvb2wobmV3U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHR0aGlzLnJldmFsaWRhdGVNb2RlbEZvclNlc3Npb25UeXBlKCk7XG5cdFx0XHRcdHRoaXMucmVmcmVzaENoYXRTZXNzaW9uUGlja2VycygpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2F0dGFjaG1lbnRNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEF0dGFjaG1lbnRNb2RlbCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5KSB7XG5cdFx0XHRcdHRoaXMuX2VtcHR5SW5wdXRBdHRhY2htZW50cy5zZXQodGhpcy5fYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0fSkpO1xuXHRcdC8vIENhcHR1cmUgbW9kZWwtY29uZmlndXJhdGlvbiBjaGFuZ2VzIGludG8gdGhlIGRyYWZ0IGlucHV0IHN0YXRlIGltbWVkaWF0ZWx5LFxuXHRcdC8vIG1pcnJvcmluZyBob3cgYSBtb2RlbCBzZWxlY3Rpb24gaXMgc3luY2VkIGluIGBzZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbGAuIFdpdGhvdXRcblx0XHQvLyB0aGlzLCBhIGNvbmZpZy1vbmx5IGNoYW5nZSB3b3VsZCBub3QgcmVhY2ggdGhlIGRyYWZ0IHN0YXRlIHVudGlsIHNvbWUgb3RoZXJcblx0XHQvLyBzeW5jLXRyaWdnZXJpbmcgZXZlbnQsIHNvIGFuIGF1dG9zYXZlL3NlcmlhbGl6ZSBpbiBiZXR3ZWVuIGNvdWxkIHBlcnNpc3QgYSBzdGFsZVxuXHRcdC8vIHNuYXBzaG90IHRoYXQgb3ZlcndyaXRlcyB0aGUgbmV3ZXIgY29uZmlnIG9uIHJlb3Blbi4gVGhlIGBfc3luY0Zyb21Nb2RlbGAgZ3VhcmRcblx0XHQvLyBhbmQgdGhlIHN0b3JlJ3MgcmVkdW5kYW50LXVwZGF0ZSBzaG9ydC1jaXJjdWl0IHByZXZlbnQgZmVlZGJhY2sgbG9vcHMgb24gcmVzdG9yZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCgpKSk7XG5cdFx0dGhpcy5zZWxlY3RlZFRvb2xzTW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZWxlY3RlZFRvb2xzLCB0aGlzLmN1cnJlbnRNb2RlT2JzLCB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbCkpO1xuXHRcdHRoaXMuZG5kID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RHJhZ0FuZERyb3AsICgpID0+IHRoaXMuX3dpZGdldCwgdGhpcy5fYXR0YWNobWVudE1vZGVsLCBzdHlsZXMpKTtcblxuXHRcdHRoaXMuaW5wdXRFZGl0b3JNYXhIZWlnaHQgPSB0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0JyA/IElOUFVUX0VESVRPUl9NQVhfSEVJR0hUIC8gMyA6IElOUFVUX0VESVRPUl9NQVhfSEVJR0hUO1xuXHRcdGNvbnN0IHBhZGRpbmcgPSB0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0JyA/IElOUFVUX0VESVRPUl9QQURESU5HLmNvbXBhY3QgOiBJTlBVVF9FRElUT1JfUEFERElORy5kZWZhdWx0O1xuXHRcdHRoaXMuc2luZ2xlTGluZUlucHV0RWRpdG9ySGVpZ2h0ID0gSU5QVVRfRURJVE9SX0xJTkVfSEVJR0hUICsgcGFkZGluZy50b3AgKyBwYWRkaW5nLmJvdHRvbTtcblx0XHR0aGlzLmlucHV0RWRpdG9yTWluSGVpZ2h0ID0gdGhpcy5vcHRpb25zLmlucHV0RWRpdG9yTWluTGluZXMgPyB0aGlzLm9wdGlvbnMuaW5wdXRFZGl0b3JNaW5MaW5lcyAqIElOUFVUX0VESVRPUl9MSU5FX0hFSUdIVCArIHBhZGRpbmcudG9wICsgcGFkZGluZy5ib3R0b20gOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLmlucHV0RWRpdG9ySGFzVGV4dCA9IENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc1RleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlucHV0RWRpdG9ySGFzU2VuZGFibGVDb250ZW50ID0gQ2hhdENvbnRleHRLZXlzLmlucHV0SGFzU2VuZGFibGVDb250ZW50LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jaGF0Q3Vyc29yQXRUb3AgPSBDaGF0Q29udGV4dEtleXMuaW5wdXRDdXJzb3JBdFRvcC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5wdXRFZGl0b3JIYXNGb2N1cyA9IENoYXRDb250ZXh0S2V5cy5pbnB1dEhhc0ZvY3VzLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5faGFzUXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXkgPSBDaGF0Q29udGV4dEtleXMuRWRpdGluZy5oYXNRdWVzdGlvbkNhcm91c2VsLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jaGF0TW9kZUtpbmRLZXkgPSBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVLaW5kLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jaGF0TW9kZU5hbWVLZXkgPSBDaGF0Q29udGV4dEtleXMuY2hhdE1vZGVOYW1lLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5jaGF0TW9kZWxJZEtleSA9IENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZWxJZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucGVybWlzc2lvbkxldmVsS2V5ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRQZXJtaXNzaW9uTGV2ZWwuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnBlcm1pc3Npb25MZXZlbEtleS5zZXQodGhpcy5fY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSk7XG5cdFx0dGhpcy53aXRoaW5FZGl0U2Vzc2lvbktleSA9IENoYXRDb250ZXh0S2V5cy53aXRoaW5FZGl0U2Vzc2lvbkRpZmYuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZpbGVQYXJ0T2ZFZGl0U2Vzc2lvbktleSA9IENoYXRDb250ZXh0S2V5cy5maWxlUGFydE9mRWRpdFNlc3Npb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uSGFzT3B0aW9ucyA9IENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvbkhhc01vZGVscy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2hhdFNlc3Npb25PcHRpb25zVmFsaWQgPSBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25PcHRpb25zVmFsaWQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmFnZW50U2Vzc2lvblR5cGVLZXkgPSBDaGF0Q29udGV4dEtleXMuYWdlbnRTZXNzaW9uVHlwZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuY2hhdFNlc3Npb25TdXBwb3J0c0RlbGVnYXRpb25LZXkgPSBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25TdXBwb3J0c0RlbGVnYXRpb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNoYXRIYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldEtleSA9IENoYXRDb250ZXh0S2V5cy5oYXNQZW5kaW5nRGVsZWdhdGlvblRhcmdldC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gSW5pdGlhbGl6ZSBhZ2VudFNlc3Npb25UeXBlIGZyb20gZGVsZWdhdGUgaWYgYXZhaWxhYmxlXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IGluaXRpYWxTZXNzaW9uVHlwZSA9IHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlLmdldEFjdGl2ZVNlc3Npb25Qcm92aWRlcigpO1xuXHRcdFx0aWYgKGluaXRpYWxTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHR0aGlzLmFnZW50U2Vzc2lvblR5cGVLZXkuc2V0KGluaXRpYWxTZXNzaW9uVHlwZSk7XG5cdFx0XHRcdHRoaXMuY2hhdFNlc3Npb25TdXBwb3J0c0RlbGVnYXRpb25LZXkuc2V0KHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zdXBwb3J0c0RlbGVnYXRpb25Gb3JTZXNzaW9uVHlwZShpbml0aWFsU2Vzc2lvblR5cGUpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jaGF0U2Vzc2lvbkhhc0N1c3RvbUFnZW50VGFyZ2V0ID0gQ2hhdENvbnRleHRLZXlzLmNoYXRTZXNzaW9uSGFzQ3VzdG9tQWdlbnRUYXJnZXQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uSGFzVGFyZ2V0ZWRNb2RlbHMgPSBDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25IYXNUYXJnZXRlZE1vZGVscy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5oaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SGlzdG9yeU5hdmlnYXRvciwgdGhpcy5sb2NhdGlvbikpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRjb25zdCBuZXdPcHRpb25zOiBJRWRpdG9yT3B0aW9ucyA9IHt9O1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpKSB7XG5cdFx0XHRcdHRoaXMuc2V0UGVybWlzc2lvbkxldmVsKHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWwuZ2V0KCkpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdFBlcm1pc3Npb25MZXZlbCkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSkge1xuXHRcdFx0XHRcdHRoaXMuc2V0UGVybWlzc2lvbkxldmVsKHRoaXMuZ2V0RGVmYXVsdFBlcm1pc3Npb25MZXZlbCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdE1vZGVsKSkge1xuXHRcdFx0XHQvLyBUaGUgY29uZmlndXJlZCBkZWZhdWx0IG1vZGVsIChlLmcuIGVudGVycHJpc2UgcG9saWN5XG5cdFx0XHRcdC8vIGBjaGF0LmRlZmF1bHRNb2RlbGApIGNhbiBhcnJpdmUgYWZ0ZXIgdGhpcyB3aWRnZXQgd2FzXG5cdFx0XHRcdC8vIGNvbnN0cnVjdGVkIFx1MjAxNCBkZXNrdG9wIHBvbGljeSB2YWx1ZXMgYXJlIGRlbGl2ZXJlZCBhc3luY2hyb25vdXNseVxuXHRcdFx0XHQvLyBmcm9tIHRoZSBtYWluIHByb2Nlc3MsIHNvIGBpbml0U2VsZWN0ZWRNb2RlbGAgbWF5IGhhdmUgcmVhZCBhbiBlbXB0eVxuXHRcdFx0XHQvLyB2YWx1ZSBhdCBzdGFydHVwLiBSZS1hcHBseSBpdCB0byBhIGZyZXNoIGVtcHR5IHNlc3Npb24gd2hlbiBpdCBsYW5kcy5cblx0XHRcdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmFwcGx5Q29uZmlndXJlZERlZmF1bHQoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQ2hhdCkpIHtcblx0XHRcdFx0bmV3T3B0aW9ucy5hcmlhTGFiZWwgPSB0aGlzLl9nZXRBcmlhTGFiZWwoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3Iud29yZFNlZ21lbnRlckxvY2FsZXMnKSkge1xuXHRcdFx0XHRuZXdPcHRpb25zLndvcmRTZWdtZW50ZXJMb2NhbGVzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmcgfCBzdHJpbmdbXT4oJ2VkaXRvci53b3JkU2VnbWVudGVyTG9jYWxlcycpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5hdXRvQ2xvc2luZ0JyYWNrZXRzJykpIHtcblx0XHRcdFx0bmV3T3B0aW9ucy5hdXRvQ2xvc2luZ0JyYWNrZXRzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmF1dG9DbG9zaW5nQnJhY2tldHMnKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuYXV0b0Nsb3NpbmdRdW90ZXMnKSkge1xuXHRcdFx0XHRuZXdPcHRpb25zLmF1dG9DbG9zaW5nUXVvdGVzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmF1dG9DbG9zaW5nUXVvdGVzJyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLmF1dG9TdXJyb3VuZCcpKSB7XG5cdFx0XHRcdG5ld09wdGlvbnMuYXV0b1N1cnJvdW5kID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnZWRpdG9yLmF1dG9TdXJyb3VuZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmlucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMobmV3T3B0aW9ucyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY2hhdEVkaXRzTGlzdFBvb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbGxhcHNpYmxlTGlzdFBvb2wsIHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudCwgTWVudUlkLkNoYXRFZGl0aW5nV2lkZ2V0TW9kaWZpZWRGaWxlc1Rvb2xiYXIsIHsgdmVydGljYWxTY3JvbGxNb2RlOiBTY3JvbGxiYXJWaXNpYmlsaXR5LlZpc2libGUgfSkpO1xuXG5cdFx0dGhpcy5faGFzRmlsZUF0dGFjaG1lbnRDb250ZXh0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmhhc0ZpbGVBdHRhY2htZW50cy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5pbml0U2VsZWN0ZWRNb2RlbCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGUuZXZlbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5jaGVja01vZGVsU3VwcG9ydGVkKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQWZ0ZXJNb2RlbExpc3RDaGFuZ2UgPSAocmVjb25jaWxlU2VsZWN0aW9uOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbElkZW50aWZpZXIgPSB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcjtcblx0XHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuZ2V0TW9kZWxzKCk7XG5cdFx0XHRpZiAoY2FuTG9nKHRoaXMubG9nU2VydmljZS5nZXRMZXZlbCgpLCBMb2dMZXZlbC5EZWJ1ZykpIHtcblx0XHRcdFx0Y29uc3QgbWVyZ2VkTW9kZWxzID0gdGhpcy5nZXRBbGxNZXJnZWRNb2RlbHMoKTtcblx0XHRcdFx0Y29uc3QgZmlsdGVyZWRNb2RlbHMgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKG1vZGVscywgdGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSwgdGhpcy5jdXJyZW50TW9kZUtpbmQsIHRoaXMubG9jYXRpb24pO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlcGFydHM6IHN0cmluZ1tdID0gW1xuXHRcdFx0XHRcdGByZXNldHRpbmcgY3VycmVudCBsYW5ndWFnZSBtb2RlbCBkdWUgdG8gbW9kZWwgbGlzdCBjaGFuZ2UgZnJvbSAke21vZGVsSWRlbnRpZmllcn1gLFxuXHRcdFx0XHRcdGB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlID0gJHt0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpfWAsXG5cdFx0XHRcdFx0YHRoaXMuY3VycmVudE1vZGVLaW5kID0gJHt0aGlzLmN1cnJlbnRNb2RlS2luZH1gLFxuXHRcdFx0XHRcdGB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSA9ICR7dGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKX1gLFxuXHRcdFx0XHRcdGB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGUgPSAke3RoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZX1gLFxuXHRcdFx0XHRcdGBzaG91bGRSZXNldE9uTW9kZWxMaXN0Q2hhbmdlKG1vZGVsSWRlbnRpZmllciwgbW9kZWxzKSA9ICR7c2hvdWxkUmVzZXRPbk1vZGVsTGlzdENoYW5nZShtb2RlbElkZW50aWZpZXIsIG1vZGVscyl9YCxcblx0XHRcdFx0XHRgdmVuZG9yczogJHt0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRWZW5kb3JzKCkubWFwKHYgPT4gdi52ZW5kb3IpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgaGlkZGVuTW9kZWxJZHM6ICR7dGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0SGlkZGVuTW9kZWxJZHMoKS5qb2luKCcsICcpfWAsXG5cdFx0XHRcdFx0YG1vZGVsIGlkZW50aWZpZXJzOiAke21vZGVscy5tYXAobSA9PiBtLmlkZW50aWZpZXIpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgbW9kZWwgdGFyZ2V0IFNlc3Npb24gVHlwZXM6ICR7bW9kZWxzLm1hcChtID0+IG0ubWV0YWRhdGEudGFyZ2V0Q2hhdFNlc3Npb25UeXBlIHx8ICcnKS5qb2luKCcsICcpfWAsXG5cdFx0XHRcdFx0YG1vZGVsIG1ldGFkYXRhaWQ6ICR7bW9kZWxzLm1hcChtID0+IG0ubWV0YWRhdGEuaWQpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgbWVyZ2VkLm1vZGVsIGlkZW50aWZpZXJzOiAke21lcmdlZE1vZGVscy5tYXAobSA9PiBtLmlkZW50aWZpZXIpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgbWVyZ2VkLm1vZGVsIHRhcmdldCBTZXNzaW9uIFR5cGVzOiAke21lcmdlZE1vZGVscy5tYXAobSA9PiBtLm1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZSB8fCAnJykuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBtZXJnZWQubW9kZWwgbWV0YWRhdGFpZDogJHttZXJnZWRNb2RlbHMubWFwKG0gPT4gbS5tZXRhZGF0YS5pZCkuam9pbignLCAnKX1gLFxuXHRcdFx0XHRcdGBmaWx0ZXJlZC5tb2RlbCBpZGVudGlmaWVyczogJHtmaWx0ZXJlZE1vZGVscy5tYXAobSA9PiBtLmlkZW50aWZpZXIpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgZmlsdGVyZWQubW9kZWwgdGFyZ2V0IFNlc3Npb24gVHlwZXM6ICR7ZmlsdGVyZWRNb2RlbHMubWFwKG0gPT4gbS5tZXRhZGF0YS50YXJnZXRDaGF0U2Vzc2lvblR5cGUgfHwgJycpLmpvaW4oJywgJyl9YCxcblx0XHRcdFx0XHRgZmlsdGVyZWQubW9kZWwgbWV0YWRhdGFpZDogJHtmaWx0ZXJlZE1vZGVscy5tYXAobSA9PiBtLm1ldGFkYXRhLmlkKS5qb2luKCcsICcpfWAsXG5cdFx0XHRcdF07XG5cdFx0XHRcdGlmICh0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpICE9PSBTZXNzaW9uVHlwZS5Db3BpbG90Q0xJKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVsZWdhdGVTZXNzaW9uVHlwZSA9IHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI/LigpO1xuXHRcdFx0XHRcdGlmIChkZWxlZ2F0ZVNlc3Npb25UeXBlKSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlcGFydHMucHVzaChgZGVsZWdhdGVTZXNzaW9uVHlwZSA9ICR7ZGVsZWdhdGVTZXNzaW9uVHlwZX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0XHRtZXNzYWdlcGFydHMucHVzaChgY3VycmVudCBzZXNzaW9uIHJlc291cmNlID0gJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIG1lc3NhZ2VwYXJ0cy5qb2luKCcsICcpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZWNvbmNpbGVTZWxlY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnJlY29uY2lsZU1vZGVsTGlzdENoYW5nZShtb2RlbHMpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIGF2YWlsYWJsZS1tb2RlbCBzZXQgY2hhbmdlZDogcmUtZXZhbHVhdGUgd2hldGhlciBzZW5kaW5nIGlzXG5cdFx0XHQvLyBwb3NzaWJsZSAoYSBgcmVxdWlyZXNDdXN0b21Nb2RlbHNgIHNlc3Npb24gbWF5IG5vdyBoYXZlLCBvciBoYXZlXG5cdFx0XHQvLyBsb3N0LCBpdHMgbW9kZWxzKS5cblx0XHRcdHRoaXMuX3VwZGF0ZUlucHV0Q29udGVudENvbnRleHRLZXlzKCk7XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCgpID0+IHVwZGF0ZUFmdGVyTW9kZWxMaXN0Q2hhbmdlKGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLm9uRGlkQ2hhbmdlTW9kZWxWaXNpYmlsaXR5KCgpID0+IHVwZGF0ZUFmdGVyTW9kZWxMaXN0Q2hhbmdlKHRydWUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQ3VycmVudENoYXRNb2RlKCgpID0+IHtcblx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQodGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpLmxhYmVsLmdldCgpKTtcblx0XHRcdGlmICh0aGlzLl9pbnB1dEVkaXRvcikge1xuXHRcdFx0XHR0aGlzLl9pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHsgYXJpYUxhYmVsOiB0aGlzLl9nZXRBcmlhTGFiZWwoKSB9KTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2V0SW1wbGljaXRDb250ZXh0RW5hYmxlbWVudCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsbSA9IHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuY2hhdE1vZGVsSWRLZXkuc2V0KGxtPy5tZXRhZGF0YS5pZC50b0xvd2VyQ2FzZSgpID8/ICcnKTtcblx0XHRcdHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Py5zZXRTZWxlY3RlZE1vZGVsKGxtPy5pZGVudGlmaWVyKTtcblx0XHRcdGlmIChsbT8ubWV0YWRhdGEubmFtZSkge1xuXHRcdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmFsZXJ0KGxtLm1ldGFkYXRhLm5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW5wdXRFZGl0b3I/LnVwZGF0ZU9wdGlvbnMoeyBhcmlhTGFiZWw6IHRoaXMuX2dldEFyaWFMYWJlbCgpIH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBtb2RlcyA9IHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLnJlYWQocmVhZGVyKTtcblx0XHRcdHJlYWRlci5zdG9yZS5hZGQobW9kZXMub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlQ3VycmVudENoYXRNb2RlKCk7XG5cdFx0XHRcdHRoaXMuX3Jlc3RvcmVQZXJzaXN0ZWRDdXN0b21Nb2RlSWZBdmFpbGFibGUoKTtcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUucmVhZChyKTtcblx0XHRcdHRoaXMuY2hhdE1vZGVLaW5kS2V5LnNldChtb2RlLmtpbmQpO1xuXHRcdFx0dGhpcy5jaGF0TW9kZU5hbWVLZXkuc2V0KG1vZGUubmFtZS5yZWFkKHIpKTtcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuc3VwcHJlc3NNb2RlUHJlZmVycmVkTW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWxzID0gbW9kZS5tb2RlbD8ucmVhZChyKTtcblx0XHRcdGlmIChtb2RlbHMpIHtcblx0XHRcdFx0dGhpcy5zd2l0Y2hNb2RlbEJ5UXVhbGlmaWVkTmFtZShtb2RlbHMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFZhbGlkYXRlIHRoZSBpbml0aWFsIG1vZGUgLSBpZiBBZ2VudCBtb2RlIGlzIHNldCBieSBkZWZhdWx0IGJ1dCBkaXNhYmxlZCBieSBwb2xpY3ksIHN3aXRjaCB0byBBc2tcblx0XHR0aGlzLnZhbGlkYXRlQ3VycmVudENoYXRNb2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldEltcGxpY2l0Q29udGV4dEVuYWJsZW1lbnQoKSB7XG5cdFx0aWYgKHRoaXMuaW1wbGljaXRDb250ZXh0ICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2NoYXQuaW1wbGljaXRDb250ZXh0LnN1Z2dlc3RlZENvbnRleHQnKSkge1xuXHRcdFx0dGhpcy5pbXBsaWNpdENvbnRleHQuc2V0RW5hYmxlZCh0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCkubmFtZS5nZXQoKS50b0xvd2VyQ2FzZSgpID09PSAnYXNrJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldElzV2l0aGluRWRpdFNlc3Npb24oaW5JbnNpZGVEaWZmOiBib29sZWFuLCBpc0ZpbGVQYXJ0T2ZFZGl0U2Vzc2lvbjogYm9vbGVhbikge1xuXHRcdHRoaXMud2l0aGluRWRpdFNlc3Npb25LZXkuc2V0KGluSW5zaWRlRGlmZik7XG5cdFx0dGhpcy5maWxlUGFydE9mRWRpdFNlc3Npb25LZXkuc2V0KGlzRmlsZVBhcnRPZkVkaXRTZXNzaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXkoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gZ2V0U2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXkodGhpcy5sb2NhdGlvbiwgdGhpcy5nZXRTZWxlY3RlZE1vZGVsVGFyZ2V0KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWxlY3RlZE1vZGVsVGFyZ2V0KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGU7XG5cdFx0cmV0dXJuIHNlc3Npb25UeXBlICYmIHRoaXMuc2Vzc2lvblR5cGVIYXNPd25Nb2RlbFBvb2woc2Vzc2lvblR5cGUpID8gc2Vzc2lvblR5cGUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVHJ1ZSB3aGVuIHRoZSBzZXNzaW9uIHR5cGUgb3ducyBpdHMgb3duIG1vZGVsIHBvb2wgKGVpdGhlciBkZWNsYXJlZCB2aWEgYHJlcXVpcmVzQ3VzdG9tTW9kZWxzYCxcblx0ICogb3Igc29tZSByZWdpc3RlcmVkIG1vZGVsIGFscmVhZHkgdGFyZ2V0cyBpdCkuIEtlZXBzIHN0b3JhZ2Uga2V5cyBzdGFibGUgYmVmb3JlIHRhcmdldGVkIG1vZGVscyBhcmUgcHVibGlzaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBzZXNzaW9uVHlwZUhhc093bk1vZGVsUG9vbChzZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKVxuXHRcdFx0fHwgaGFzTW9kZWxzVGFyZ2V0aW5nU2Vzc2lvbih0aGlzLmdldEFsbE1lcmdlZE1vZGVscygpLCBzZXNzaW9uVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRTZWxlY3RlZE1vZGVsKCkge1xuXHRcdC8vIERyb3AgdGhlIHBlci1lZGl0b3IgY29uZmlndXJhdGlvbiBzbmFwc2hvdCBzbyB0aGUgbmV4dCByZWFkIHJlLXNlZWRzXG5cdFx0Ly8gZnJvbSB0aGUgbmV3IChsb2NhdGlvbiwgc2Vzc2lvblR5cGUpLXNjb3BlZCBzdG9yYWdlIGJ1Y2tldC5cblx0XHR0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLmNsZWFyKCk7XG5cblx0XHRjb25zdCBzZWxlY3RlZE1vZGVsU3RvcmFnZUtleSA9IHRoaXMuZ2V0U2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXkoKTtcblx0XHRjb25zdCBzdG9yZWRTZWxlY3Rpb24gPSBnZXRTdG9yZWRTZWxlY3RlZE1vZGVsKHRoaXMuc3RvcmFnZVNlcnZpY2UsIHRoaXMubG9jYXRpb24sIHRoaXMuZ2V0U2VsZWN0ZWRNb2RlbFRhcmdldCgpKTtcblx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIGBbSU5JVC1TRUxFQ1RFRC1NT0RFTF0gc3RvcmFnZUtleT0ke3NlbGVjdGVkTW9kZWxTdG9yYWdlS2V5fSwgcGVyc2lzdGVkU2VsZWN0aW9uPSR7c3RvcmVkU2VsZWN0aW9ufSwgY3VycmVudFNlc3Npb25UeXBlPSR7dGhpcy5fY3VycmVudFNlc3Npb25UeXBlfSwgZ2V0Q3VycmVudFNlc3Npb25UeXBlPSR7dGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKX0sIHdpZGdldFNlc3Npb249JHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX0sIGJvdW5kSW5wdXRNb2RlbFNlc3Npb249JHt0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpfSwgY3VycmVudExhbmd1YWdlTW9kZWw9JHt0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcn1gLCB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5nZXQoKSwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5pbml0aWFsaXplKFxuXHRcdFx0c3RvcmVkU2VsZWN0aW9uLFxuXHRcdFx0c2VsZWN0aW9uID0+IGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYFtJTklULVNFTEVDVEVELU1PREVMXSByZXN0b3JlIGRlY2lzaW9uIHBlcnNpc3RlZFNlbGVjdGlvbj0ke3N0b3JlZFNlbGVjdGlvbn0sIHNlbGVjdGlvbj0ke3NlbGVjdGlvbi5raW5kfSwgcmVzdWx0TW9kZWw9JHtzZWxlY3Rpb24ua2luZCA9PT0gJ2FwcGx5JyA/IHNlbGVjdGlvbi5tb2RlbC5pZGVudGlmaWVyIDogdW5kZWZpbmVkfSwgc3RvcmFnZUtleT0ke3NlbGVjdGVkTW9kZWxTdG9yYWdlS2V5fSwgY3VycmVudFNlc3Npb25UeXBlPSR7dGhpcy5fY3VycmVudFNlc3Npb25UeXBlfSwgZ2V0Q3VycmVudFNlc3Npb25UeXBlPSR7dGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKX1gLCB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5nZXQoKSwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpLFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0RWRpdGluZyhlbmFibGVkOiBib29sZWFuLCBlZGl0aW5nU2VudFJlcXVlc3Q6IENoYXRDb250ZXh0S2V5cy5FZGl0aW5nUmVxdWVzdFR5cGUgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLmN1cnJlbnRseUVkaXRpbmdJbnB1dEtleT8uc2V0KGVuYWJsZWQpO1xuXHRcdHRoaXMuZWRpdGluZ1NlbnRSZXF1ZXN0S2V5Py5zZXQoZWRpdGluZ1NlbnRSZXF1ZXN0KTtcblx0fVxuXG5cdHB1YmxpYyBzd2l0Y2hNb2RlbChtb2RlbE1ldGFkYXRhOiBQaWNrPElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCAndmVuZG9yJyB8ICdpZCcgfCAnZmFtaWx5Jz4pIHtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLmdldE1vZGVscygpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxzLmZpbmQobSA9PiBtLm1ldGFkYXRhLnZlbmRvciA9PT0gbW9kZWxNZXRhZGF0YS52ZW5kb3IgJiYgbS5tZXRhZGF0YS5pZCA9PT0gbW9kZWxNZXRhZGF0YS5pZCAmJiBtLm1ldGFkYXRhLmZhbWlseSA9PT0gbW9kZWxNZXRhZGF0YS5mYW1pbHkpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0dGhpcy5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbChtb2RlbCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN3aXRjaCB0byBhIG1vZGVsIGJ5IGl0cyBpZGVudGlmaWVyLiBSZXR1cm5zIHRydWUgaWYgYSBtYXRjaGluZyBtb2RlbFxuXHQgKiB3YXMgZm91bmQgYW5kIGFwcGxpZWQuXG5cdCAqXG5cdCAqIFRoZSByZW1lbWJlcmVkIHByb2ZpbGUgcHJlZmVyZW5jZSBpcyB1cGRhdGVkIG9ubHkgd2hlbiBib3RoXG5cdCAqIGBpc1VzZXJBY3Rpb25gIGFuZCBgc3RvcmVTZWxlY3Rpb25gIGFyZSB0cnVlLlxuXHQgKi9cblx0cHVibGljIHN3aXRjaE1vZGVsQnlJZGVudGlmaWVyKGlkZW50aWZpZXI6IHN0cmluZywgc3RvcmVTZWxlY3Rpb246IGJvb2xlYW4gPSBmYWxzZSwgaXNVc2VyQWN0aW9uOiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLmdldE1vZGVscygpO1xuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxzLmZpbmQobSA9PiBtLmlkZW50aWZpZXIgPT09IGlkZW50aWZpZXIpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0aWYgKGlzVXNlckFjdGlvbikge1xuXHRcdFx0XHR0aGlzLnNldEN1cnJlbnRMYW5ndWFnZU1vZGVsKG1vZGVsLCB0cnVlLCBzdG9yZVNlbGVjdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9hcHBseVByb2dyYW1tYXRpY0xhbmd1YWdlTW9kZWwobW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBzd2l0Y2hNb2RlbEJ5UXVhbGlmaWVkTmFtZShxdWFsaWZpZWRNb2RlbE5hbWVzOiByZWFkb25seSBzdHJpbmdbXSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuZ2V0TW9kZWxzKCk7XG5cdFx0Zm9yIChjb25zdCBxdWFsaWZpZWRNb2RlbE5hbWUgb2YgcXVhbGlmaWVkTW9kZWxOYW1lcykge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbHMuZmluZChtID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lKHF1YWxpZmllZE1vZGVsTmFtZSwgbS5tZXRhZGF0YSkpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX2FwcGx5UHJvZ3JhbW1hdGljTGFuZ3VhZ2VNb2RlbChtb2RlbCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW2NoYXRdIE5vZGUgb2YgdGhlIG1vZGVscyBcIiR7cXVhbGlmaWVkTW9kZWxOYW1lcy5qb2luKCcsICcpfVwiIG5vdCBmb3VuZC4gVXNlIGZvcm1hdCBcIjxuYW1lPiAoPHZlbmRvcj4pXCIsIGUuZy4gXCJHUFQtNG8gKGNvcGlsb3QpXCIuYCk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIHJlcXVlc3RNb2RlbEJ5SWRlbnRpZmllcihpZGVudGlmaWVyOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdFByb2dyYW1tYXRpY0xhbmd1YWdlTW9kZWwoKCkgPT4gdGhpcy5nZXRNb2RlbHMoKS5maW5kKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IGlkZW50aWZpZXIpKTtcblx0fVxuXG5cdHB1YmxpYyByZXF1ZXN0TW9kZWxCeVF1YWxpZmllZE5hbWUocXVhbGlmaWVkTW9kZWxOYW1lczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVxdWVzdFByb2dyYW1tYXRpY0xhbmd1YWdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5nZXRNb2RlbHMoKTtcblx0XHRcdHJldHVybiBxdWFsaWZpZWRNb2RlbE5hbWVzLm1hcChuYW1lID0+IG1vZGVscy5maW5kKG1vZGVsID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lKG5hbWUsIG1vZGVsLm1ldGFkYXRhKSkpLmZpbmQoaXNEZWZpbmVkKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldCBoYXNQZW5kaW5nUHJvZ3JhbW1hdGljTW9kZWxTZWxlY3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5oYXNQZW5kaW5nUHJvZ3JhbW1hdGljU2VsZWN0aW9uKCk7XG5cdH1cblxuXG5cdHB1YmxpYyBzd2l0Y2hUb05leHRNb2RlbCgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbHMgPSB0aGlzLmdldE1vZGVscygpO1xuXHRcdGlmIChtb2RlbHMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgY3VycmVudEluZGV4ID0gbW9kZWxzLmZpbmRJbmRleChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcik7XG5cdFx0XHRjb25zdCBuZXh0SW5kZXggPSAoY3VycmVudEluZGV4ICsgMSkgJSBtb2RlbHMubGVuZ3RoO1xuXHRcdFx0dGhpcy5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbChtb2RlbHNbbmV4dEluZGV4XSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHN3aXRjaFRvTmV4dFBpbm5lZE1vZGVsKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVscyA9IHRoaXMuZ2V0TW9kZWxzKCk7XG5cdFx0aWYgKG1vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbE1hcCA9IG5ldyBNYXAobW9kZWxzLm1hcChtb2RlbCA9PiBbbW9kZWwuaWRlbnRpZmllciwgbW9kZWxdKSk7XG5cdFx0Y29uc3QgcGlubmVkTW9kZWxzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Vcblx0XHRcdC5nZXRQaW5uZWRNb2RlbElkcygpXG5cdFx0XHQubWFwKG1vZGVsSWQgPT4gbW9kZWxNYXAuZ2V0KG1vZGVsSWQpKVxuXHRcdFx0LmZpbHRlcihpc0RlZmluZWQpO1xuXG5cdFx0aWYgKHBpbm5lZE1vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBwaW5uZWRNb2RlbHMuZmluZEluZGV4KG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIgPT09IHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyKTtcblx0XHRjb25zdCBuZXh0SW5kZXggPSAoY3VycmVudEluZGV4ICsgMSkgJSBwaW5uZWRNb2RlbHMubGVuZ3RoO1xuXHRcdHRoaXMuc2V0Q3VycmVudExhbmd1YWdlTW9kZWwocGlubmVkTW9kZWxzW25leHRJbmRleF0sIHRydWUpO1xuXHR9XG5cblx0cHVibGljIG9wZW5Nb2RlbFBpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jaGF0UGhvbmVJbnB1dFByZXNlbnRlci5lbmFibGVkLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9zaG93Q29tYmluZWRQaG9uZVBpY2tlclNoZWV0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubW9kZWxXaWRnZXQ/LnNob3coKTtcblx0fVxuXG5cdHB1YmxpYyBvcGVuTW9kZVBpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5jaGF0UGhvbmVJbnB1dFByZXNlbnRlci5lbmFibGVkLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9zaG93Q29tYmluZWRQaG9uZVBpY2tlclNoZWV0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMubW9kZVdpZGdldD8uc2hvdygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0NvbWJpbmVkUGhvbmVQaWNrZXJTaGVldCgpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmlucHV0QWN0aW9uc1Rvb2xiYXIuZ2V0RWxlbWVudCgpO1xuXHRcdHRoaXMuY2hhdFBob25lSW5wdXRQcmVzZW50ZXJcblx0XHRcdC5zaG93Q29tYmluZWRNb2RlQW5kTW9kZWxTaGVldCh0YXJnZXQsIHtcblx0XHRcdFx0a2luZDogJ2RlbGVnYXRlcycsXG5cdFx0XHRcdG1vZGVEZWxlZ2F0ZTogdGhpcy5fY3JlYXRlTW9kZVBpY2tlckRlbGVnYXRlKCksXG5cdFx0XHRcdG1vZGVsRGVsZWdhdGU6IHRoaXMuX2NyZWF0ZU1vZGVsUGlja2VyRGVsZWdhdGUoKSxcblx0XHRcdH0pXG5cdFx0XHQuY2F0Y2goZXJyID0+IHRoaXMubG9nU2VydmljZS5lcnJvcignW0NoYXRJbnB1dFBhcnRdIHBob25lIHBpY2tlciBzaGVldCBmYWlsZWQnLCBlcnIpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU1vZGVsUGlja2VyRGVsZWdhdGUoKTogSU1vZGVsUGlja2VyRGVsZWdhdGUge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjdXJyZW50TW9kZWw6IHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLFxuXHRcdFx0c2V0TW9kZWw6IChtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2V0Q3VycmVudExhbmd1YWdlTW9kZWwobW9kZWwsIHRydWUsICF0aGlzLm9wdGlvbnMuc3VwcHJlc3NNb2RlbFBlcnNpc3RlbmNlKTtcblx0XHRcdFx0dGhpcy5yZW5kZXJBdHRhY2hlZENvbnRleHQoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRNb2RlbHM6ICgpID0+IHRoaXMuZ2V0TW9kZWxzKCksXG5cdFx0XHRpc0NhY2hlV2FybTogKCkgPT4gKHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCA/PyAwKSA+IDAsXG5cdFx0XHRnZXRQcmVzZW50YXRpb25PcHRpb25zOiAoKSA9PiB0aGlzLl9nZXRNb2RlbFBpY2tlclByZXNlbnRhdGlvbk9wdGlvbnMoKSxcblx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbjogdGhpcy5fbW9kZWxDb25maWdTdG9yZSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0TW9kZWxQaWNrZXJQcmVzZW50YXRpb25PcHRpb25zKCk6IElNb2RlbFBpY2tlclByZXNlbnRhdGlvbk9wdGlvbnMge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKTtcblx0XHRjb25zdCB1c2VSaWNoUGlja2VyID0gIXNlc3Npb25UeXBlIHx8IHNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZSB8fCBpc0FnZW50SG9zdFRhcmdldChzZXNzaW9uVHlwZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHVzZUdyb3VwZWRNb2RlbFBpY2tlcjogdXNlUmljaFBpY2tlcixcblx0XHRcdHNob3dNYW5hZ2VNb2RlbHNBY3Rpb246IHVzZVJpY2hQaWNrZXIsXG5cdFx0XHRzaG93VW5hdmFpbGFibGVGZWF0dXJlZDogdXNlUmljaFBpY2tlcixcblx0XHRcdHNob3dGZWF0dXJlZDogdXNlUmljaFBpY2tlcixcblx0XHRcdHNob3dBdXRvTW9kZWw6IHRoaXMuX3Nob3dBdXRvTW9kZWwoKSxcblx0XHRcdHNob3dNb2RlbEljb246IHRoaXMub3B0aW9ucy5pc1Nlc3Npb25zV2luZG93IHx8ICF0aGlzLl91c2VzSGFybmVzc1Byb3ZpZGVySWNvbigpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF91c2VzSGFybmVzc1Byb3ZpZGVySWNvbigpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCk7XG5cdFx0cmV0dXJuIHNlc3Npb25UeXBlID09PSBTZXNzaW9uVHlwZS5DbGF1ZGVDb2RlXG5cdFx0XHR8fCBzZXNzaW9uVHlwZSA9PT0gU2Vzc2lvblR5cGUuQ29kZXhcblx0XHRcdHx8IHNlc3Npb25UeXBlID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDbGF1ZGVcblx0XHRcdHx8IHNlc3Npb25UeXBlID09PSBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb2RleDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoaXMgZWRpdG9yJ3Mgc25hcHNob3Qgb2YgdGhlIGdpdmVuIG1vZGVsJ3MgY29uZmlndXJhdGlvbiAoZS5nLlxuXHQgKiBjb250ZXh0IHNpemUsIHRoaW5raW5nIGVmZm9ydCksIHNjb3BlZCB0byB0aGlzIGVkaXRvciByYXRoZXIgdGhhbiB0aGVcblx0ICogcHJvZmlsZS1nbG9iYWwgdmFsdWUuIERlbGVnYXRlcyB0byB7QGxpbmsgQ2hhdE1vZGVsQ29uZmlndXJhdGlvblN0b3JlfS5cblx0ICogU2VlIGlzc3VlICMzMjAzOTMuXG5cdCAqL1xuXHRnZXRNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nKTogSVN0cmluZ0RpY3Rpb25hcnk8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tb2RlbENvbmZpZ1N0b3JlLmdldE1vZGVsQ29uZmlndXJhdGlvbihtb2RlbElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlcyBhIG1vZGVsJ3MgY29uZmlndXJhdGlvbiBjYXB0dXJlZCBpbiBhIHNlc3Npb24ncyBwZXJzaXN0ZWQgaW5wdXRcblx0ICogc3RhdGUuIENhbGxlZCB3aGVuIHRoZSBzZWxlY3RlZCBtb2RlbCBpcyByZXN0b3JlZCBmcm9tIHNlc3Npb24gaGlzdG9yeSBzb1xuXHQgKiB0aGUgY29uZmlndXJhdGlvbiBmb2xsb3dzIHRoZSBtb2RlbCB0aHJvdWdoIHRoZSBzYW1lIHJlc29sdXRpb24gaGllcmFyY2h5LlxuXHQgKiBOby1vcCBmb3Igc2Vzc2lvbnMgdGhhdCBwcmUtZGF0ZSBjb25maWd1cmF0aW9uIGNhcHR1cmUgKG5vIHZhbHVlIHN0b3JlZCkuXG5cdCAqL1xuXHRwcml2YXRlIHJlc3RvcmVNb2RlbENvbmZpZ3VyYXRpb24obW9kZWxJZDogc3RyaW5nLCBtb2RlbENvbmZpZ3VyYXRpb246IElTdHJpbmdEaWN0aW9uYXJ5PHVua25vd24+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKG1vZGVsQ29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhpcy5fbW9kZWxDb25maWdTdG9yZS5yZXN0b3JlTW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQsIG1vZGVsQ29uZmlndXJhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbENvbmZpZ3VyYXRpb25TdG9yYWdlS2V5KCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGU7XG5cdFx0aWYgKHNlc3Npb25UeXBlICYmIHRoaXMuc2Vzc2lvblR5cGVIYXNPd25Nb2RlbFBvb2woc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gYGNoYXQubW9kZWxDb25maWd1cmF0aW9uLiR7dGhpcy5sb2NhdGlvbn0uJHtzZXNzaW9uVHlwZX1gO1xuXHRcdH1cblx0XHRyZXR1cm4gYGNoYXQubW9kZWxDb25maWd1cmF0aW9uLiR7dGhpcy5sb2NhdGlvbn1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTW9kZVBpY2tlckRlbGVnYXRlKCk6IElNb2RlUGlja2VyRGVsZWdhdGUge1xuXHRcdC8vIFdoZW4gYGhpZGVDdXN0b21DaGF0TW9kZXNgIGlzIHNldCAoZS5nLiB0aGUgYXV0b21hdGlvbnMgZGlhbG9nKSxcblx0XHQvLyBzdHJpcCBnZW51aW5lbHkgdXNlci1kZWZpbmVkIGN1c3RvbSBhZ2VudHMgZnJvbSB0aGUgcGlja2VyXG5cdFx0Ly8gd2hpbGUgcHJlc2VydmluZyBleHRlbnNpb24tY29udHJpYnV0ZWQgbW9kZXMgKFBsYW4gLyBuZXctQXNrIC9cblx0XHQvLyBuZXctRWRpdCkgdGhhdCB0aGUgcGlja2VyIGNhdGVnb3Jpc2VzIGFzIGJ1aWx0LWluIHZpYVxuXHRcdC8vIGBpc01vZGVDb25zaWRlcmVkQnVpbHRJbmAuIFRob3NlIGxpdmUgaW4gYElDaGF0TW9kZXMuY3VzdG9tYCBidXRcblx0XHQvLyBhcmUgcGFydCBvZiB0aGUgYnVpbHQtaW4gcHJvZHVjdCBzdXJmYWNlLCBub3QgdGhlXG5cdFx0Ly8gZm9sZGVyLXNjb3BlZCBhZ2VudCBmaWxlcyB3ZSB3YW50IHRvIGhpZGUuIFRoZSB1bmRlcmx5aW5nXG5cdFx0Ly8gb2JzZXJ2YWJsZSBpcyB1bnRvdWNoZWQgc28gbW9kZSB2YWxpZGF0aW9uLCBtb2RlbCBwaWNraW5nIGFuZFxuXHRcdC8vIHBlcnNpc3RlbmNlIGNvbnRpbnVlIHRvIHNlZSB0aGUgcmVhbCBsaXN0LlxuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gdGhpcy5wcm9kdWN0U2VydmljZTtcblx0XHRjb25zdCBjdXJyZW50Q2hhdE1vZGVzOiBJT2JzZXJ2YWJsZTxJQ2hhdE1vZGVzPiA9IHRoaXMub3B0aW9ucy5oaWRlQ3VzdG9tQ2hhdE1vZGVzXG5cdFx0XHQ/IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgaW5uZXIgPSB0aGlzLl9jdXJyZW50Q2hhdE1vZGVzT2JzZXJ2YWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGZpbHRlcmVkQ3VzdG9tID0gaW5uZXIuY3VzdG9tLmZpbHRlcihtID0+IGlzTW9kZUNvbnNpZGVyZWRCdWlsdEluKG0sIHByb2R1Y3RTZXJ2aWNlKSk7XG5cdFx0XHRcdGNvbnN0IHdyYXBwZWQ6IElDaGF0TW9kZXMgPSB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IGlubmVyLm9uRGlkQ2hhbmdlLFxuXHRcdFx0XHRcdGJ1aWx0aW46IGlubmVyLmJ1aWx0aW4sXG5cdFx0XHRcdFx0Y3VzdG9tOiBmaWx0ZXJlZEN1c3RvbSxcblx0XHRcdFx0XHRmaW5kTW9kZUJ5SWQ6IChpZDogc3RyaW5nKSA9PiBpbm5lci5idWlsdGluLmZpbmQobSA9PiBtLmlkID09PSBpZCkgPz8gZmlsdGVyZWRDdXN0b20uZmluZChtID0+IG0uaWQgPT09IGlkKSxcblx0XHRcdFx0XHRmaW5kTW9kZUJ5TmFtZTogKG5hbWU6IHN0cmluZykgPT4gaW5uZXIuYnVpbHRpbi5maW5kKG0gPT4gbS5uYW1lLnJlYWQodW5kZWZpbmVkKSA9PT0gbmFtZSkgPz8gZmlsdGVyZWRDdXN0b20uZmluZChtID0+IG0ubmFtZS5yZWFkKHVuZGVmaW5lZCkgPT09IG5hbWUpLFxuXHRcdFx0XHRcdHdhaXRGb3JQZW5kaW5nVXBkYXRlczogKCkgPT4gaW5uZXIud2FpdEZvclBlbmRpbmdVcGRhdGVzKCksXG5cdFx0XHRcdH07XG5cdFx0XHRcdHJldHVybiB3cmFwcGVkO1xuXHRcdFx0fSlcblx0XHRcdDogdGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGU7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VycmVudE1vZGU6IHRoaXMuX2N1cnJlbnRNb2RlT2JzZXJ2YWJsZSxcblx0XHRcdGN1cnJlbnRDaGF0TW9kZXMsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6ICgpID0+IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHQvLyBEaXJlY3Qgc2V0dGVyIGZvciBob3N0cyB0aGF0IGVtYmVkIGBDaGF0SW5wdXRQYXJ0YCB3aXRob3V0XG5cdFx0XHQvLyByZWdpc3RlcmluZyBhbiBgSUNoYXRXaWRnZXRgIChlLmcuIHRoZSBhdXRvbWF0aW9ucyBkaWFsb2cpLlxuXHRcdFx0Ly8gVGhlIHBpY2tlciBvbmx5IGNhbGxzIHRoaXMgd2hlbiBgc2Vzc2lvblJlc291cmNlKClgIGlzXG5cdFx0XHQvLyBgdW5kZWZpbmVkYDsgcmVhbCBjaGF0IHdpZGdldHMga2VlcCB0aGUgY29tbWFuZCBwYXRoLlxuXHRcdFx0c2V0TW9kZTogKG1vZGU6IElDaGF0TW9kZSkgPT4gdGhpcy5zZXRDaGF0TW9kZTIobW9kZSwgdHJ1ZSksXG5cdFx0XHRjdXN0b21BZ2VudFRhcmdldDogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRyZXR1cm4gKHNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRUYXJnZXRGb3JTZXNzaW9uVHlwZShnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSkpID8/IFRhcmdldC5VbmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgb3BlblBlcm1pc3Npb25QaWNrZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5wZXJtaXNzaW9uV2lkZ2V0Py5zaG93KCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0UGVybWlzc2lvbkxldmVsKGxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsKTogdm9pZCB7XG5cdFx0bGV2ZWwgPSB0aGlzLmdldFBlcm1pdHRlZFBlcm1pc3Npb25MZXZlbChsZXZlbCk7XG5cdFx0dGhpcy5fY3VycmVudFBlcm1pc3Npb25MZXZlbC5zZXQobGV2ZWwsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5wZXJtaXNzaW9uTGV2ZWxLZXkuc2V0KGxldmVsKTtcblx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXQ/LnJlZnJlc2goKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKTtcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIFBFUk1JU1NJT05fTEVWRUxfT1BUSU9OX0lELCBsZXZlbCk7XG5cdFx0fVxuXHRcdC8vIExvZyBmaXJzdCBzbyB0aGUgdXBjb21pbmcgX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCB3cml0ZSBjYW4gYmUgYXR0cmlidXRlZFxuXHRcdC8vIHRvIGEgcGVybWlzc2lvbi1sZXZlbCBjaGFuZ2UgKHdoaWNoIGFsc28gaW5kaXJlY3RseSB3cml0ZXMgc2VsZWN0ZWRNb2RlbCkuXG5cdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgc2V0UGVybWlzc2lvbkxldmVsIC0+IF9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwgKGxldmVsPSR7bGV2ZWx9LCBjdXJyZW50TGFuZ3VhZ2VNb2RlbD0ke3RoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyfSkgaW4gJHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX1gLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHR0aGlzLl9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdFBlcm1pc3Npb25MZXZlbCgpOiBDaGF0UGVybWlzc2lvbkxldmVsIHtcblx0XHRjb25zdCBsZXZlbCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5EZWZhdWx0UGVybWlzc2lvbkxldmVsKTtcblx0XHRyZXR1cm4gaXNDaGF0UGVybWlzc2lvbkxldmVsKGxldmVsKSA/IGxldmVsIDogQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQZXJtaXR0ZWRQZXJtaXNzaW9uTGV2ZWwobGV2ZWw6IENoYXRQZXJtaXNzaW9uTGV2ZWwpOiBDaGF0UGVybWlzc2lvbkxldmVsIHtcblx0XHRpZiAoaXNBdXRvQXBwcm92ZVZhbHVlUG9saWN5UmVzdHJpY3RlZChsZXZlbCwgaXNBdXRvQXBwcm92ZVBvbGljeVJlc3RyaWN0ZWQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkpKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gbGV2ZWw7XG5cdH1cblxuXHRwdWJsaWMgb3BlblNlc3Npb25UYXJnZXRQaWNrZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uVGFyZ2V0V2lkZ2V0Py5zaG93KCk7XG5cdH1cblxuXHRwdWJsaWMgb3BlbkRlbGVnYXRpb25QaWNrZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5kZWxlZ2F0aW9uV2lkZ2V0Py5zaG93KCk7XG5cdH1cblxuXHRwdWJsaWMgb3BlbkNoYXRTZXNzaW9uUGlja2VyKCk6IHZvaWQge1xuXHRcdC8vIE9wZW4gdGhlIGZpcnN0IGF2YWlsYWJsZSBwaWNrZXIgd2lkZ2V0XG5cdFx0Y29uc3QgZmlyc3RXaWRnZXQgPSB0aGlzLmNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cz8udmFsdWVzKCk/Lm5leHQoKS52YWx1ZTtcblx0XHRmaXJzdFdpZGdldD8uc2hvdygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBwaWNrZXIgd2lkZ2V0cyBmb3IgYWxsIG9wdGlvbiBncm91cHMgYXZhaWxhYmxlIGZvciB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUuXG5cdCAqL1xuXHRwcml2YXRlIGNyZWF0ZUNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cyhhY3Rpb246IE1lbnVJdGVtQWN0aW9uLCBwaWNrZXJPcHRpb25zPzogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMpOiBDaGF0U2Vzc2lvblBpY2tlckFjdGlvbkl0ZW1bXSB7XG5cdFx0dGhpcy5fbGFzdFNlc3Npb25QaWNrZXJBY3Rpb24gPSBhY3Rpb247XG5cdFx0dGhpcy5fbGFzdFNlc3Npb25QaWNrZXJPcHRpb25zID0gcGlja2VyT3B0aW9ucztcblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpO1xuXHRcdGNvbnN0IHZpc2libGVPcHRpb25Hcm91cHMgPSB0aGlzLmdldFZpc2libGVPcHRpb25Hcm91cHNNb2RlQW5kVXBkYXRlQ29udGV4dEtleXMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXZpc2libGVPcHRpb25Hcm91cHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWZmZWN0aXZlU2Vzc2lvblR5cGUgPSB0aGlzLmdldEVmZmVjdGl2ZVNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFlZmZlY3RpdmVTZXNzaW9uVHlwZSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHRoaXMuY2hhdFNlc3Npb25QaWNrZXJXaWRnZXRzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0czogQ2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IG9wdGlvbkdyb3VwIG9mIHZpc2libGVPcHRpb25Hcm91cHMpIHtcblx0XHRcdGNvbnN0IGluaXRpYWxJdGVtID0gdGhpcy5nZXRDdXJyZW50T3B0aW9uRm9yR3JvdXAob3B0aW9uR3JvdXAuaWQpO1xuXHRcdFx0Y29uc3QgaW5pdGlhbFN0YXRlID0geyBncm91cDogb3B0aW9uR3JvdXAsIGl0ZW06IGluaXRpYWxJdGVtIH07XG5cblx0XHRcdC8vIENyZWF0ZSBkZWxlZ2F0ZSBmb3IgdGhpcyBvcHRpb24gZ3JvdXBcblx0XHRcdGNvbnN0IGl0ZW1EZWxlZ2F0ZTogSUNoYXRTZXNzaW9uUGlja2VyRGVsZWdhdGUgPSB7XG5cdFx0XHRcdGdldEN1cnJlbnRPcHRpb246ICgpID0+IHRoaXMuZ2V0Q3VycmVudE9wdGlvbkZvckdyb3VwKG9wdGlvbkdyb3VwLmlkKSxcblx0XHRcdFx0b25EaWRDaGFuZ2VPcHRpb246IHRoaXMuZ2V0T3JDcmVhdGVPcHRpb25FbWl0dGVyKG9wdGlvbkdyb3VwLmlkKS5ldmVudCxcblx0XHRcdFx0c2V0T3B0aW9uOiAob3B0aW9uOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0pID0+IHtcblx0XHRcdFx0XHQvLyBVcGRhdGUgY29udGV4dCBrZXkgZm9yIHRoaXMgb3B0aW9uIGdyb3VwXG5cdFx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25Db250ZXh0S2V5KG9wdGlvbkdyb3VwLmlkLCBvcHRpb24uaWQpO1xuXHRcdFx0XHRcdHRoaXMuZ2V0T3JDcmVhdGVPcHRpb25FbWl0dGVyKG9wdGlvbkdyb3VwLmlkKS5maXJlKG9wdGlvbik7XG5cblx0XHRcdFx0XHQvLyBOb3RpZnkgc2Vzc2lvbiBpZiB3ZSBoYXZlIG9uZSAobm90IGluIHdlbGNvbWUgdmlldyBiZWZvcmUgc2Vzc2lvbiBjcmVhdGlvbilcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5zZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgb3B0aW9uR3JvdXAuaWQsIG9wdGlvbik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gUmVmcmVzaCBwaWNrZXJzIHRvIHJlLWV2YWx1YXRlIHZpc2liaWxpdHkgb2Ygb3RoZXIgb3B0aW9uIGdyb3Vwc1xuXHRcdFx0XHRcdHRoaXMucmVmcmVzaENoYXRTZXNzaW9uUGlja2VycygpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRPcHRpb25Hcm91cDogKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRPcHRpb25Hcm91cHNGb3JTZXNzaW9uVHlwZShlZmZlY3RpdmVTZXNzaW9uVHlwZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGdyb3Vwcz8uZmluZChnID0+IGcuaWQgPT09IG9wdGlvbkdyb3VwLmlkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0U2Vzc2lvblJlc291cmNlOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNlc3Npb25QaWNrZXJBY3Rpb25JdGVtLCBhY3Rpb24sIGluaXRpYWxTdGF0ZSwgaXRlbURlbGVnYXRlLCBwaWNrZXJPcHRpb25zKTtcblx0XHRcdHRoaXMuY2hhdFNlc3Npb25QaWNrZXJXaWRnZXRzLnNldChvcHRpb25Hcm91cC5pZCwgd2lkZ2V0KTtcblx0XHRcdHdpZGdldHMucHVzaCh3aWRnZXQpO1xuXHRcdH1cblxuXHRcdHJldHVybiB3aWRnZXRzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldCB0aGUgaW5wdXQgbW9kZWwgcmVmZXJlbmNlIGZvciBzeW5jaW5nIGlucHV0IHN0YXRlXG5cdCAqXG5cdCAqIE5vdGU6IFdlIGhhdmUgYSBjeWNsaWMgcmVmIGJldHdlZW4gQ2hhdElucHV0UGFydCBhbmQgQ2hhdFdpZGdldCxcblx0ICogV2hlbiB3ZSBpbnZva2Ugc2V0SW5wdXRNb2RlbCwgdGhlIHByb3BlcnR5IF93aWRnZXQgaXMgbm90IHNldC4gSGVuY2Ugd2UgZG9uJ3QgaGF2ZSB0aGUgU2Vzc2lvblJlc291cmNlLlxuXHQgKiBBcyBhIHJlc3VsdCwgaW4gdGhpcyBtZXRob2Qgd2hlbiBzeW5jRnJvbU1vZGVsIGlzIGNhbGxlZCwgdGhlIG1vZGVsIHN0YXRlIGlzIG5vdCBhcHBsaWVkIHRvIHRoZSBVSS5cblx0ICogSW5zdGVhZCwgdGhlIGRlZmF1bHRzIGFyZSBjb21wdXRlZCBhbmQgdGhlIG1vZGVsIGlzIHVwZGF0ZWQgd2l0aCBkZWZhdWx0IHZhbHVlcy4gVGhlcmVieSBibG93aW5nIGF3YXkgbW9kZWwgaW5mb3JtYXRpb24uXG5cdCAqIFNldHRpbmcgV2lkZ2V0IGFuZCB0aGVuIGNhbGxpbmcgdGhpcyBkb2Vzbid0IHdvcmsgZWl0aGVyIGJlY2F1c2UgdGhlIHdpZGdldCBhbHNvIHJlbGllcyBvbiBDaGF0SW5wdXRQYXJ0IChoZW5jZSBjeWNsaWMgcmVmKS5cblx0ICogU29sdXRpb24gaXMgdG8gcGFzcyB0aGUgU2Vzc2lvblJlc291cmNlIGFzIGFuIGFyZ3VtZW50IHRvIHRoaXMgbWV0aG9kLlxuXHQqL1xuXHRzZXRJbnB1dE1vZGVsKG1vZGVsOiBJSW5wdXRNb2RlbCwgY2hhdFNlc3Npb25Jc0VtcHR5OiBib29sZWFuLCBmb3JTZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdC8vIFBhc3MgdGhlIE9VVEdPSU5HIHNlc3Npb24ncyBpbnB1dCBzdGF0ZSBhcyBvbGRTdGF0ZSBzbyB3ZSBjYW4gc2VlIHdoYXRcblx0XHQvLyBtb2RlbCB0aGUgcHJldmlvdXMgc2Vzc2lvbiB3YXMgaG9sZGluZyByaWdodCBiZWZvcmUgd2Ugc3dhcCBpdCBvdXQuXG5cdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgc2V0SW5wdXRNb2RlbCBmb3IgJHtmb3JTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gKGNoYXRTZXNzaW9uSXNFbXB0eT0ke2NoYXRTZXNzaW9uSXNFbXB0eX0sIG91dGdvaW5nLl9pbnB1dE1vZGVsPSR7dGhpcy5faW5wdXRNb2RlbCA/ICdwcmVzZW50JyA6ICd1bmRlZmluZWQnfSlgLCBtb2RlbC5zdGF0ZS5nZXQoKSwgdGhpcy5faW5wdXRNb2RlbD8uc3RhdGUuZ2V0KCksIHRoaXMubG9nU2VydmljZSk7XG5cdFx0Ly8gRmx1c2ggY3VycmVudCBzdGF0ZSB0byB0aGUgb3V0Z29pbmcgbW9kZWwgYmVmb3JlIHN3aXRjaGluZyxcblx0XHQvLyBzbyBpdCBwcmVzZXJ2ZXMgdGhlIGxhdGVzdCBwZXJtaXNzaW9uIGxldmVsIGFuZCBvdGhlciBwaWNrZXIgc3RhdGUuXG5cdFx0aWYgKHRoaXMuX2lucHV0TW9kZWwpIHtcblx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYFtGTFVTSC1QUkVdIHNldElucHV0TW9kZWwgcHJlLWZsdXNoIGJvdW5kSW5wdXRNb2RlbFNlc3Npb249JHt0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpfSB3aWRnZXRTZXNzaW9uPSR7dGhpcy5fY3VycmVudFNlc3Npb25LZXl9IGluY29taW5nPSR7Zm9yU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCwgdW5kZWZpbmVkLCB0aGlzLl9pbnB1dE1vZGVsLnN0YXRlLmdldCgpLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudFNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKGZvclNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy5faW5wdXRNb2RlbCA9IG1vZGVsO1xuXHRcdHRoaXMuX2lucHV0TW9kZWxTZXNzaW9uUmVzb3VyY2UgPSBmb3JTZXNzaW9uUmVzb3VyY2U7XG5cdFx0dGhpcy5fbW9kZWxTeW5jRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRjb25zdCBjaGF0TW9kZXMgPSB0aGlzLmNoYXRNb2RlU2VydmljZS5jcmVhdGVNb2Rlcyhmb3JTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX2N1cnJlbnRDaGF0TW9kZXMudmFsdWUgPSBjaGF0TW9kZXM7XG5cdFx0dGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGUuc2V0KGNoYXRNb2RlcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLnNlbGVjdGVkVG9vbHNNb2RlbC5yZXNldFNlc3Npb25FbmFibGVtZW50U3RhdGUoKTtcblx0XHR0aGlzLl9jaGF0U2Vzc2lvbklzRW1wdHkgPSBpc05ld0NvbnZlcnNhdGlvbihmb3JTZXNzaW9uUmVzb3VyY2UsIGNoYXRTZXNzaW9uSXNFbXB0eSk7XG5cdFx0Ly8gQSBzZXNzaW9uIHRoYXQgd2FzIGp1c3Qgb3BlbmVkIHN0YXJ0cyB3aXRoIG5vIGV4cGxpY2l0IGluLWNvbnZlcnNhdGlvbiBtb2RlbFxuXHRcdC8vIHBpY2ssIHNvIHRoZSBjb25maWd1cmVkIGRlZmF1bHQgKGUuZy4gZW50ZXJwcmlzZSBwb2xpY3kpIGlzIGFnYWluIGFsbG93ZWRcblx0XHQvLyB0byB3aW4gZm9yIGEgbmV3IGVtcHR5IGNvbnZlcnNhdGlvbi5cblx0XHQvLyBDb21wdXRlIHRoZSBtb2RlbC1zZWxlY3Rpb24gZGVjaXNpb25zIGZvciB0aGlzIHNlc3Npb24gc3dpdGNoLiBUaGV5IGFyZSBhcHBsaWVkIHdoaWxlIHRoZVxuXHRcdC8vIGlucHV0IGFuZCB2aWV3IG1vZGVsIGZpbmlzaCB3aXJpbmcgdG9nZXRoZXIsIHRoZW4gY2xlYXJlZCBpbiB0aGUgdmlldy1tb2RlbC1jaGFuZ2UgZmluYWxseS5cblx0XHRjb25zdCBvd25zUG9vbCA9ICEhdGhpcy5fY3VycmVudFNlc3Npb25UeXBlICYmIHRoaXMuc2Vzc2lvblR5cGVIYXNPd25Nb2RlbFBvb2wodGhpcy5fY3VycmVudFNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBoYWRJbmNvbWluZ01vZGVsID0gISFtb2RlbC5zdGF0ZS5nZXQoKT8uc2VsZWN0ZWRNb2RlbDtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuYmVnaW5TZXNzaW9uU3dpdGNoKHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSwgb3duc1Bvb2wsIGhhZEluY29taW5nTW9kZWwpO1xuXG5cdFx0aWYgKHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSkge1xuXHRcdFx0Y29uc3QgcGVyc2lzdGVkU3RhdGUgPSBtb2RlbC5zdGF0ZS5nZXQoKSA/IHVuZGVmaW5lZCA6IHRoaXMuX2dldFBlcnNpc3RlZEVtcHR5SW5wdXRTdGF0ZSgpO1xuXHRcdFx0aWYgKHBlcnNpc3RlZFN0YXRlKSB7XG5cdFx0XHRcdG1vZGVsLnNldFN0YXRlKHBlcnNpc3RlZFN0YXRlKTtcblx0XHRcdFx0dGhpcy5fc3luY0Zyb21Nb2RlbChwZXJzaXN0ZWRTdGF0ZSwgZm9yU2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYCgxKSBzZXR0aW5nIGVtcHR5IG1vZGVsIHN0YXRlIGZvciAke2ZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5fc2V0RW1wdHlNb2RlbFN0YXRlKCk7XG5cblx0XHRcdC8vIFRoZSBkZWZhdWx0IG1vZGUgc2V0dGluZyBtYXkgYmUgcmVnaXN0ZXJlZCBhc3luY2hyb25vdXNseSBieSBUQVMsXG5cdFx0XHQvLyBhbmQgY3VzdG9tIG1vZGVzIChsaWtlIFBsYW4pIGxvYWQgYXN5bmNocm9ub3VzbHkgZnJvbSBwcm9tcHQgZmlsZXMuXG5cdFx0XHQvLyBSZS1hcHBseSB3aGVuIGVpdGhlciBiZWNvbWVzIGF2YWlsYWJsZS5cblx0XHRcdHRoaXMuX21vZGVsU3luY0Rpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSAmJiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHROZXdTZXNzaW9uTW9kZSkpIHtcblx0XHRcdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIGAoMikgc2V0dGluZyBlbXB0eSBtb2RlbCBzdGF0ZSBmb3IgJHtmb3JTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHR0aGlzLl9zZXRFbXB0eU1vZGVsU3RhdGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fbW9kZWxTeW5jRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLmdldCgpLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSkge1xuXHRcdFx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYCgzKSBzZXR0aW5nIGVtcHR5IG1vZGVsIHN0YXRlIGZvciAke2ZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdHRoaXMuX3NldEVtcHR5TW9kZWxTdGF0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gW0FVVE9SVU4tUkVHXSBMb2cgdGhlIG1vbWVudCB0aGUgbW9kZWwtPnZpZXcgYXV0b3J1biBpcyByZWdpc3RlcmVkLCBzbyB3ZSBjYW4gc2VlXG5cdFx0Ly8gd2hldGhlciB3aWRnZXQudmlld01vZGVsIHN0aWxsIHBvaW50cyBhdCB0aGUgT1VUR09JTkcgc2Vzc2lvbiBhdCByZWdpc3RyYXRpb24gdGltZVxuXHRcdC8vICh3aGljaCB3b3VsZCBjYXVzZSB0aGUgdmVyeSBmaXJzdCBydW4gdG8gYmUgZmxhZ2dlZCBzdGFsZSBhbmQgc2tpcHBlZCkuXG5cdFx0Y29uc3Qgd2lkZ2V0Vmlld01vZGVsU2Vzc2lvbiA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgaXNTdGFsZUF0UmVnaXN0cmF0aW9uID0gISF3aWRnZXRWaWV3TW9kZWxTZXNzaW9uICYmICFpc0VxdWFsKHdpZGdldFZpZXdNb2RlbFNlc3Npb24sIGZvclNlc3Npb25SZXNvdXJjZSk7XG5cdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgW0FVVE9SVU4tUkVHXSByZWdpc3RlcmluZyBtb2RlbC0+dmlldyBhdXRvcnVuIGZvciAke2ZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSwgd2lkZ2V0U2Vzc2lvbj0ke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fSwgd2lkZ2V0Vmlld01vZGVsU2Vzc2lvbj0ke3dpZGdldFZpZXdNb2RlbFNlc3Npb24/LnRvU3RyaW5nKCl9LCBpc1N0YWxlQXRSZWdpc3RyYXRpb249JHtpc1N0YWxlQXRSZWdpc3RyYXRpb259LCBtb2RlbC5zdGF0ZS5zZWxlY3RlZE1vZGVsPSR7bW9kZWwuc3RhdGUuZ2V0KCk/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXJ9LCBfY3VycmVudExhbmd1YWdlTW9kZWw9JHt0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcn1gLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblxuXHRcdC8vIE9ic2VydmUgY2hhbmdlcyBmcm9tIG1vZGVsIGFuZCBzeW5jIHRvIHZpZXdcblx0XHR0aGlzLl9tb2RlbFN5bmNEaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0bGV0IHN0YXRlID0gbW9kZWwuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0bGV0IG1lc3NhZ2UgPSBgc3luY2luZyBmcm9tIG1vZGVsIGZvciAke2ZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fWA7XG5cdFx0XHRpZiAoIXN0YXRlICYmIHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSkge1xuXHRcdFx0XHRzdGF0ZSA9IHRoaXMuX2dldFBlcnNpc3RlZEVtcHR5SW5wdXRTdGF0ZSgpO1xuXHRcdFx0XHRtZXNzYWdlID0gYHN5bmNpbmcgZnJvbSBlbXB0eSBpbnB1dCBzdGF0ZSBmb3IgJHtmb3JTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gO1xuXHRcdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5yZXNvbHZlRHJhZnRNb2RlbChzdGF0ZS5zZWxlY3RlZE1vZGVsLCB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGUsIGZhbHNlKTtcblx0XHRcdFx0XHRpZiAocmVzb2x2ZWQuY2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0c3RhdGUgPSB7IC4uLnN0YXRlLCBzZWxlY3RlZE1vZGVsOiByZXNvbHZlZC5tb2RlbCwgbW9kZWxDb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIERldGVjdCBhdXRvcnVuIGZpcmluZyBmb3IgYSBzZXNzaW9uIHRoYXQgaXMgbm8gbG9uZ2VyIHRoZSB3aWRnZXQnc1xuXHRcdFx0Ly8gYWN0aXZlIHNlc3Npb24gLSBpbmRpY2F0ZXMgYSBsYXRlL3N0YWxlIG1vZGVsLnN0YXRlLnJlYWQoKSBsYW5kZWQgZm9yXG5cdFx0XHQvLyB0aGUgb3V0Z29pbmcgc2Vzc2lvbi5cblx0XHRcdGNvbnN0IHdpZGdldFNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBpc1N0YWxlU2Vzc2lvbiA9XG5cdFx0XHRcdCEhdGhpcy5faW5wdXRNb2RlbFNlc3Npb25SZXNvdXJjZSAmJiAhaXNFcXVhbCh0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlLCBmb3JTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGlzU3RhbGVTZXNzaW9uKSB7XG5cdFx0XHRcdG1lc3NhZ2UgPSBgW1NUQUxFLVNFU1NJT04tQVVUT1JVTl0gJHttZXNzYWdlfSAod2lkZ2V0IG5vdyBvbiAke3dpZGdldFNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKX0sICR7dGhpcy5faW5wdXRNb2RlbFNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKX0sICR7Zm9yU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IGlzIG9sZClgO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVW50cmFja2VkIHJlYWQ6IHdlIG9ubHkgd2FudCBhIHNuYXBzaG90IGZvciB0aGUgbG9nLCBub3QgYSBkZXBlbmRlbmN5XG5cdFx0XHQvLyB0aGF0IHdvdWxkIHJlLXRyaWdnZXIgdGhpcyBhdXRvcnVuLlxuXHRcdFx0Y29uc3QgcHJldlN0YXRlID0gdGhpcy5faW5wdXRNb2RlbD8uc3RhdGUucmVhZCh1bmRlZmluZWQpO1xuXHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBtZXNzYWdlLCBzdGF0ZSwgcHJldlN0YXRlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXG5cdFx0XHQvLyBBIHN0YWxlIGF1dG9ydW4gbXVzdCBOT1Qgd3JpdGUgdGhlIG91dGdvaW5nIHNlc3Npb24ncyBtb2RlbCBpbnRvIHRoZVxuXHRcdFx0Ly8gc2hhcmVkIF9jdXJyZW50TGFuZ3VhZ2VNb2RlbCBcdTIwMTQgZG9pbmcgc28gb3ZlcndyaXRlcyB0aGUgYWN0aXZlIHNlc3Npb24nc1xuXHRcdFx0Ly8gc2VsZWN0aW9uIChlLmcuIGZsaXBzIGl0IHRvIEF1dG8pLiBUaGUgYWN0aXZlIHNlc3Npb24gaGFzIGl0cyBvd24gYXV0b3J1blxuXHRcdFx0Ly8gdGhhdCBzeW5jcyB0aGUgY29ycmVjdCBtb2RlbC5cblx0XHRcdGlmIChpc1N0YWxlU2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zeW5jRnJvbU1vZGVsKHN0YXRlLCBmb3JTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFBlcnNpc3RlZEVtcHR5SW5wdXRTdGF0ZSgpOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHN0YXRlID0gdGhpcy5fZW1wdHlJbnB1dFN0YXRlLnJlYWQodW5kZWZpbmVkKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlcnNpc3RlZEF0dGFjaG1lbnRzID0gdGhpcy5fZW1wdHlJbnB1dEF0dGFjaG1lbnRzLnJlYWQodW5kZWZpbmVkKTtcblx0XHRzdGF0ZSA9IHtcblx0XHRcdC4uLnN0YXRlLFxuXHRcdFx0YXR0YWNobWVudHM6IHBlcnNpc3RlZEF0dGFjaG1lbnRzLmxlbmd0aCA+IDAgPyBwZXJzaXN0ZWRBdHRhY2htZW50cyA6IHN0YXRlLmF0dGFjaG1lbnRzLFxuXHRcdH07XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5yZXNvbHZlRHJhZnRNb2RlbChzdGF0ZS5zZWxlY3RlZE1vZGVsLCB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGUsIHRydWUpO1xuXHRcdGlmIChyZXNvbHZlZC5jaGFuZ2VkKSB7XG5cdFx0XHRzdGF0ZSA9IHsgLi4uc3RhdGUsIHNlbGVjdGVkTW9kZWw6IHJlc29sdmVkLm1vZGVsLCBtb2RlbENvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3NldEVtcHR5TW9kZWxTdGF0ZSgpIHtcblx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIGBzZXR0aW5nIGVtcHR5IG1vZGVsIHN0YXRlIGZvciAke3RoaXMuX3dpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gaW4gJHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX1gLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBjdXJyZW50TGV2ZWwgPSB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZT8uZ2V0KCk/LnBlcm1pc3Npb25MZXZlbDtcblx0XHRpZiAoY3VycmVudExldmVsID09PSB1bmRlZmluZWQgfHwgIWlzQ2hhdFBlcm1pc3Npb25MZXZlbChjdXJyZW50TGV2ZWwpKSB7XG5cdFx0XHR0aGlzLnNldFBlcm1pc3Npb25MZXZlbCh0aGlzLmdldERlZmF1bHRQZXJtaXNzaW9uTGV2ZWwoKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZW50aXRsZW1lbnRTZXJ2aWNlLmFub255bW91cykge1xuXHRcdFx0Ly8gQmUgZGV0ZXJtaW5pc3RpYyBmb3IgYW5vbnltb3VzIHVzZXJzIHRvIHN1cHBvcnRcblx0XHRcdC8vIGFnZW50aWMgZmxvd3Mgd2l0aCBkZWZhdWx0IG1vZGVsLlxuXHRcdFx0dGhpcy5zZXRDaGF0TW9kZShDaGF0TW9kZUtpbmQuQWdlbnQsIGZhbHNlKTtcblx0XHRcdHRoaXMuY2hlY2tNb2RlbFN1cHBvcnRlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd0RlZmF1bHRNb2RlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHROZXdTZXNzaW9uTW9kZSk7XG5cdFx0aWYgKHR5cGVvZiByYXdEZWZhdWx0TW9kZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRNb2RlID0gcmF3RGVmYXVsdE1vZGUudHJpbSgpO1xuXHRcdFx0aWYgKGRlZmF1bHRNb2RlKSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRNb2RlTG93ZXIgPSBkZWZhdWx0TW9kZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBtb2RlcyA9IHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLmdldCgpO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IG1vZGVzLmZpbmRNb2RlQnlJZChkZWZhdWx0TW9kZSlcblx0XHRcdFx0XHQ/PyBtb2Rlcy5maW5kTW9kZUJ5TmFtZShkZWZhdWx0TW9kZSlcblx0XHRcdFx0XHQ/PyBtb2Rlcy5jdXN0b20uZmluZChtID0+IG0ubmFtZS5nZXQoKS50b0xvd2VyQ2FzZSgpID09PSBkZWZhdWx0TW9kZUxvd2VyKTtcblx0XHRcdFx0aWYgKHJlc29sdmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdElucHV0UGFydF0gQXBwbHlpbmcgZGVmYXVsdCBtb2RlIGZyb20gc2V0dGluZzogJHtkZWZhdWx0TW9kZX0gLT4gJHtyZXNvbHZlZC5pZH1gKTtcblx0XHRcdFx0XHR0aGlzLnNldENoYXRNb2RlKHJlc29sdmVkLmlkLCBmYWxzZSk7XG5cdFx0XHRcdFx0dGhpcy5jaGVja01vZGVsU3VwcG9ydGVkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3luYyBmcm9tIG1vZGVsIHRvIHZpZXcgKHdoZW4gbW9kZWwgc3RhdGUgY2hhbmdlcylcblx0ICovXG5cdHByaXZhdGUgX3N5bmNGcm9tTW9kZWwoc3RhdGU6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkLCBmb3JTZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdC8vIFByZXZlbnQgY2lyY3VsYXIgdXBkYXRlc1xuXHRcdGlmICh0aGlzLl9pc1N5bmNpbmdUb09yRnJvbUlucHV0TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faXNTeW5jaW5nVG9PckZyb21JbnB1dE1vZGVsID0gdHJ1ZTtcblxuXHRcdFx0Ly8gU3luYyBtb2RlXG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCk7XG5cdFx0XHRcdGlmIChjdXJyZW50TW9kZS5pZCAhPT0gc3RhdGUubW9kZS5pZCkge1xuXHRcdFx0XHRcdHRoaXMuc2V0Q2hhdE1vZGUoc3RhdGUubW9kZS5pZCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN5bmMgc2VsZWN0ZWQgbW9kZWwgLSB2YWxpZGF0ZSBpdCBiZWxvbmdzIHRvIHRoZSBjdXJyZW50IHNlc3Npb24ncyBtb2RlbCBwb29sXG5cdFx0XHRpZiAoc3RhdGU/LnNlbGVjdGVkTW9kZWwpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoZm9yU2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnN5bmNGcm9tQ29udmVyc2F0aW9uU3RhdGUoc3RhdGUuc2VsZWN0ZWRNb2RlbCwgc3RhdGUubW9kZWxDb25maWd1cmF0aW9uLCBzZXNzaW9uVHlwZSwgZm9yU2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlLm9yaWdpbiA9PT0gQ2hhdElucHV0U3RhdGVPcmlnaW4uUmVtb3RlKTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhdGUpIHtcblx0XHRcdFx0Ly8gc3RhdGUgZXhpc3RzIGJ1dCBzdGF0ZS5zZWxlY3RlZE1vZGVsIGlzIHVuZGVmaW5lZCAtIHN5bmMgaXMgYSBOTy1PUCxcblx0XHRcdFx0Ly8gYnV0IHJlY29yZCBpdCBzbyB3ZSBjYW4gc2VlIHdoZW4gYSBzZXNzaW9uJ3MgcGVyc2lzdGVkIHN0YXRlIGxvc3QgaXRzIG1vZGVsLlxuXHRcdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKHRoaXMuX2lucHV0TW9kZWwsIGBfc3luY0Zyb21Nb2RlbDogc3RhdGUgaGFzIG5vIHNlbGVjdGVkTW9kZWwgKG5vLW9wIGZvciBtb2RlbCBwaWNrZXIpIGZvciAke2ZvclNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fSAoY3VycmVudD0ke3RoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpPy5pZGVudGlmaWVyfSlgLCBzdGF0ZSwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTeW5jIGF0dGFjaG1lbnRzXG5cdFx0XHRjb25zdCBjdXJyZW50QXR0YWNobWVudHMgPSB0aGlzLl9hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHM7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5jbGVhcigpO1xuXHRcdFx0fSBlbHNlIGlmICghYXJyYXlzRXF1YWwoY3VycmVudEF0dGFjaG1lbnRzLCBzdGF0ZS5hdHRhY2htZW50cykpIHtcblx0XHRcdFx0dGhpcy5fYXR0YWNobWVudE1vZGVsLmNsZWFyQW5kU2V0Q29udGV4dCguLi5zdGF0ZS5hdHRhY2htZW50cyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN5bmMgaW5wdXQgdGV4dFxuXHRcdFx0aWYgKHRoaXMuX2lucHV0RWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldFZhbHVlKHN0YXRlPy5pbnB1dFRleHQgfHwgJycpO1xuXHRcdFx0XHRpZiAoc3RhdGU/LnNlbGVjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5faW5wdXRFZGl0b3Iuc2V0U2VsZWN0aW9ucyhzdGF0ZS5zZWxlY3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBTeW5jIHBlcm1pc3Npb24gbGV2ZWwgKHNraXAgaWYgZ2xvYmFsIGF1dG8tYXBwcm92ZSBpcyBvbiwgc28gdGhlIHBpY2tlciBzdGF5cyB1bmNoYW5nZWQpXG5cdFx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uR2xvYmFsQXV0b0FwcHJvdmUpKSB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldExldmVsID0gdGhpcy5nZXRQZXJtaXR0ZWRQZXJtaXNzaW9uTGV2ZWwoc3RhdGU/LnBlcm1pc3Npb25MZXZlbCA/PyBDaGF0UGVybWlzc2lvbkxldmVsLkRlZmF1bHQpO1xuXHRcdFx0XHRpZiAodGhpcy5fY3VycmVudFBlcm1pc3Npb25MZXZlbC5nZXQoKSAhPT0gdGFyZ2V0TGV2ZWwpIHtcblx0XHRcdFx0XHR0aGlzLl9jdXJyZW50UGVybWlzc2lvbkxldmVsLnNldCh0YXJnZXRMZXZlbCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLnBlcm1pc3Npb25MZXZlbEtleS5zZXQodGFyZ2V0TGV2ZWwpO1xuXHRcdFx0XHRcdHRoaXMucGVybWlzc2lvbldpZGdldD8ucmVmcmVzaCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQ/LmNvbnRyaWJzLmZvckVhY2goY29udHJpYiA9PiB7XG5cdFx0XHRcdFx0Y29udHJpYi5zZXRJbnB1dFN0YXRlPy4oc3RhdGUuY29udHJpYik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc1N5bmNpbmdUb09yRnJvbUlucHV0TW9kZWwgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3N5bmNUZXh0RGVib3VuY2VkLmNhbmNlbCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTeW5jIGN1cnJlbnQgaW5wdXQgc3RhdGUgdG8gdGhlIGlucHV0IG1vZGVsXG5cdCAqL1xuXHRwcml2YXRlIF9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzU3luY2luZ1RvT3JGcm9tSW5wdXRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2lzU3luY2luZ1RvT3JGcm9tSW5wdXRNb2RlbCA9IHRydWU7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmdldEN1cnJlbnRJbnB1dFN0YXRlKCk7XG5cdFx0aWYgKHRoaXMuX2NoYXRTZXNzaW9uSXNFbXB0eSkge1xuXHRcdFx0dGhpcy5fZW1wdHlJbnB1dFN0YXRlLnNldChzdGF0ZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0Ly8gUGFzcyB0aGUgYWN0dWFsIG5ld1N0YXRlIGFuZCB0aGUgcHJldmlvdXMgc3RhdGUgc28gbW9kZWwtaWRlbnRpZmllclxuXHRcdC8vIHRyYW5zaXRpb25zIChpbmNsdWRpbmcgdHJhbnNpdGlvbnMgdG8vZnJvbSB1bmRlZmluZWQpIGFyZSB2aXNpYmxlLlxuXHRcdGNvbnN0IHByZXZTdGF0ZSA9IHRoaXMuX2lucHV0TW9kZWw/LnN0YXRlLmdldCgpO1xuXHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYF9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwgYm91bmRJbnB1dE1vZGVsU2Vzc2lvbj0ke3RoaXMuX2lucHV0TW9kZWxTZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCl9IHdpZGdldFNlc3Npb249JHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX0gbWlzbWF0Y2g9JHt0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpICE9PSB0aGlzLl9jdXJyZW50U2Vzc2lvbktleX1gLCBzdGF0ZSwgcHJldlN0YXRlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuX2lucHV0TW9kZWw/LnNldFN0YXRlKHN0YXRlKTtcblx0XHR0aGlzLl9pc1N5bmNpbmdUb09yRnJvbUlucHV0TW9kZWwgPSBmYWxzZTtcblxuXHRcdC8vIFNvbWUgcGlja2VyIGxhYmVsIGNoYW5nZWQgc2l6ZTsgcmUtZXZhbHVhdGUgdG9vbGJhciBvdmVyZmxvd1xuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhcj8ucmVsYXlvdXQoKSk7XG5cdH1cblxuXHQvKipcblx0ICogRmx1c2ggdGhlIGN1cnJlbnQgaW5wdXQgc3RhdGUgdG8gdGhlIGJvdW5kIGlucHV0IG1vZGVsLiBVc2UgdGhpcyBiZWZvcmVcblx0ICogdGhlIGhvc3QgcmVsZWFzZXMgaXRzIG1vZGVsIHJlZmVyZW5jZSAoZS5nLiBvbiBzZXNzaW9uIHN3aXRjaCkgdG8gZW5zdXJlXG5cdCAqIGFuIHVuc2VudCBkcmFmdCBpcyBjYXB0dXJlZCBieSBgd2lsbERpc3Bvc2VNb2RlbGAgcGVyc2lzdGVuY2UuXG5cdCAqL1xuXHRwdWJsaWMgZmx1c2hJbnB1dFN0YXRlVG9Nb2RlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faW5wdXRNb2RlbCkge1xuXHRcdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEN1cnJlbnRMYW5ndWFnZU1vZGVsKG1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIsIGlzVXNlckFjdGlvbiA9IGZhbHNlLCBzdG9yZVNlbGVjdGlvbjogYm9vbGVhbiA9IGlzVXNlckFjdGlvbikge1xuXHRcdGNvbnN0IHBlcnNpc3RTZWxlY3Rpb24gPSBpc1VzZXJBY3Rpb24gJiYgc3RvcmVTZWxlY3Rpb247XG5cdFx0Y29uc3QgbW9kZWxEZXRhaWxzID0gdGhpcy5nZXRNb2RlbHMoKS5tYXAobSA9PiBgJHttLmlkZW50aWZpZXJ9ICgke20ubWV0YWRhdGEuaWR9KWApLmpvaW4oJywgJyk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbFN0b3JhZ2VLZXkgPSB0aGlzLmdldFNlbGVjdGVkTW9kZWxTdG9yYWdlS2V5KCk7XG5cdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgc2V0Q3VycmVudExhbmd1YWdlTW9kZWwgdG8gJHttb2RlbC5pZGVudGlmaWVyfSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fSwgc3RvcmFnZUtleT0ke3NlbGVjdGVkTW9kZWxTdG9yYWdlS2V5fSwgY3VycmVudFNlc3Npb25UeXBlPSR7dGhpcy5fY3VycmVudFNlc3Npb25UeXBlfSwgZ2V0Q3VycmVudFNlc3Npb25UeXBlPSR7dGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKX0sIGJvdW5kSW5wdXRNb2RlbFNlc3Npb249JHt0aGlzLl9pbnB1dE1vZGVsU2Vzc2lvblJlc291cmNlPy50b1N0cmluZygpfSwgbW9kZWxEZXRhaWxzPSR7bW9kZWxEZXRhaWxzfSwgcGVyc2lzdFNlbGVjdGlvbj0ke3BlcnNpc3RTZWxlY3Rpb259YCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0Y29uc3QgYXBwbHkgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jYWNoZWRXaWR0aCkge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmNhY2hlZFdpZHRoKTtcblx0XHRcdH1cblx0XHRcdGlmIChwZXJzaXN0U2VsZWN0aW9uKSB7XG5cdFx0XHRcdHN0b3JlU2VsZWN0ZWRNb2RlbCh0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLmxvY2F0aW9uLCB0aGlzLmdldFNlbGVjdGVkTW9kZWxUYXJnZXQoKSwgbW9kZWwuaWRlbnRpZmllcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwoKTtcblx0XHR9O1xuXHRcdGlmIChpc1VzZXJBY3Rpb24pIHtcblx0XHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5hcHBseUV4cGxpY2l0U2VsZWN0aW9uKG1vZGVsLCBhcHBseSwgZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuYXBwbHlBdXRvbWF0aWNTZWxlY3Rpb24obW9kZWwsIGFwcGx5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseVByb2dyYW1tYXRpY0xhbmd1YWdlTW9kZWwobW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5hcHBseVByb2dyYW1tYXRpY1NlbGVjdGlvbihtb2RlbCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXF1ZXN0UHJvZ3JhbW1hdGljTGFuZ3VhZ2VNb2RlbChyZXNvbHZlTW9kZWw6ICgpID0+IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5yZXF1ZXN0UHJvZ3JhbW1hdGljU2VsZWN0aW9uKFxuXHRcdFx0cmVzb2x2ZU1vZGVsLFxuXHRcdFx0dGhpcy5faW5wdXRNb2RlbFNlc3Npb25SZXNvdXJjZT8udG9TdHJpbmcoKSxcblx0XHQpO1xuXHRcdHRoaXMuX3VwZGF0ZUlucHV0Q29udGVudENvbnRleHRLZXlzKCk7XG5cdFx0dm9pZCByZXN1bHQuZmluYWxseSgoKSA9PiB0aGlzLl91cGRhdGVJbnB1dENvbnRlbnRDb250ZXh0S2V5cygpKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBjaGVja01vZGVsU3VwcG9ydGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5lbnN1cmVDdXJyZW50TW9kZWxTdXBwb3J0ZWQoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCeSBJRC0gcHJlZmVyIHRoaXMgbWV0aG9kXG5cdCAqL1xuXHRzZXRDaGF0TW9kZShtb2RlOiBDaGF0TW9kZUtpbmQgfCBzdHJpbmcsIHN0b3JlU2VsZWN0aW9uID0gdHJ1ZSwgaXNVc2VySW5pdGlhdGVkID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5zdXBwb3J0c0NoYW5naW5nTW9kZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlcyA9IHRoaXMuX2N1cnJlbnRDaGF0TW9kZXNPYnNlcnZhYmxlLmdldCgpO1xuXHRcdGNvbnN0IG1vZGUyID0gbW9kZXMuZmluZE1vZGVCeUlkKG1vZGUpID8/XG5cdFx0XHRtb2Rlcy5maW5kTW9kZUJ5TmFtZShtb2RlKSA/P1xuXHRcdFx0bW9kZXMuZmluZE1vZGVCeUlkKENoYXRNb2RlS2luZC5BZ2VudCkgPz9cblx0XHRcdENoYXRNb2RlLkFzaztcblx0XHR0aGlzLnNldENoYXRNb2RlMihtb2RlMiwgc3RvcmVTZWxlY3Rpb24sIGlzVXNlckluaXRpYXRlZCk7XG5cdH1cblxuXHRwcml2YXRlIHNldENoYXRNb2RlMihtb2RlOiBJQ2hhdE1vZGUsIHN0b3JlU2VsZWN0aW9uID0gdHJ1ZSwgaXNVc2VySW5pdGlhdGVkID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5zdXBwb3J0c0NoYW5naW5nTW9kZXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuc2V0KG1vZGUsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDdXJyZW50Q2hhdE1vZGUuZmlyZSh7IGlzVXNlckluaXRpYXRlZCB9KTtcblxuXHRcdGlmIChzdG9yZVNlbGVjdGlvbikge1xuXHRcdFx0Ly8gU3luYyB0byBtb2RlbCAobW9kZSBpcyBub3cgcGVyc2lzdGVkIGluIHRoZSBtb2RlbCdzIGlucHV0IHN0YXRlKVxuXHRcdFx0Ly8gTG9nIGZpcnN0IHNvIHRoZSB1cGNvbWluZyBfc3luY0lucHV0U3RhdGVUb01vZGVsIHdyaXRlIGNhbiBiZSBhdHRyaWJ1dGVkXG5cdFx0XHQvLyB0byBhIG1vZGUgY2hhbmdlLlxuXHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgc2V0Q2hhdE1vZGUyIC0+IF9zeW5jSW5wdXRTdGF0ZVRvTW9kZWwgKG1vZGU9JHttb2RlLmlkfSwgc3RvcmVTZWxlY3Rpb249JHtzdG9yZVNlbGVjdGlvbn0sIGlzVXNlckluaXRpYXRlZD0ke2lzVXNlckluaXRpYXRlZH0sIGN1cnJlbnRMYW5ndWFnZU1vZGVsPSR7dGhpcy5fY3VycmVudExhbmd1YWdlTW9kZWwuZ2V0KCk/LmlkZW50aWZpZXJ9KSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fWAsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5fc3luY0lucHV0U3RhdGVUb01vZGVsKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldCBhbGwgbW9kZWxzIG1lcmdlZCBmcm9tIGxpdmUgYW5kIGNhY2hlLCB3aXRob3V0IHNlc3Npb24vbW9kZSBmaWx0ZXJpbmcuXG5cdCAqIFRoaXMgaXMgdGhlIGNhbm9uaWNhbCBzb3VyY2UgZm9yIHRoZSBmdWxsIG1vZGVsIHBvb2wsIGluY2x1ZGluZyBjYWNoZWQgbW9kZWxzXG5cdCAqIHRoYXQgYnJpZGdlIHN0YXJ0dXAgcmFjZXMgd2hlbiBsaXZlIG1vZGVscyBoYXZlbid0IGxvYWRlZCB5ZXQuXG5cdCAqL1xuXHRwcml2YXRlIGdldEFsbE1lcmdlZE1vZGVscygpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB7XG5cdFx0Y29uc3QgY2FjaGVkTW9kZWxzID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRPYmplY3Q8SUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10+KENhY2hlZExhbmd1YWdlTW9kZWxzS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFtdKTtcblx0XHRjb25zdCBsaXZlTW9kZWxzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpXG5cdFx0XHQubWFwKG1vZGVsSWQgPT4gKHsgaWRlbnRpZmllcjogbW9kZWxJZCwgbWV0YWRhdGE6IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZCkhIH0pKTtcblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkVmVuZG9ycyA9IG5ldyBTZXQodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0VmVuZG9ycygpLm1hcCh2ID0+IHYudmVuZG9yKSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRWZW5kb3JzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCB2IG9mIGNvbnRyaWJ1dGVkVmVuZG9ycykge1xuXHRcdFx0aWYgKHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmhhc1Jlc29sdmVkVmVuZG9yKHYpKSB7XG5cdFx0XHRcdHJlc29sdmVkVmVuZG9ycy5hZGQodik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVscyA9IG1lcmdlTW9kZWxzV2l0aENhY2hlKGxpdmVNb2RlbHMsIGNhY2hlZE1vZGVscywgY29udHJpYnV0ZWRWZW5kb3JzLCByZXNvbHZlZFZlbmRvcnMpO1xuXHRcdC8vIFBlcnNpc3Qgd2hlbmV2ZXIgd2UgaGF2ZSBhbnkgYXV0aG9yaXRhdGl2ZSBpbmZvcm1hdGlvbiBcdTIwMTQgZWl0aGVyIGxpdmVcblx0XHQvLyBtb2RlbHMsIG9yIGF0IGxlYXN0IG9uZSByZXNvbHZlZCB2ZW5kb3IgKHNvIGNhY2hlIGV2aWN0aW9uIHN0aWNrcykuXG5cdFx0aWYgKGxpdmVNb2RlbHMubGVuZ3RoID4gMCB8fCByZXNvbHZlZFZlbmRvcnMuc2l6ZSA+IDApIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQ2FjaGVkTGFuZ3VhZ2VNb2RlbHNLZXksIG1vZGVscywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWxzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb2RlbHMoKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyW10ge1xuXHRcdHJldHVybiB0aGlzLmdldE1vZGVsc0ZvclNlc3Npb25UeXBlKHRoaXMuZ2V0Q3VycmVudFNlc3Npb25UeXBlKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgd2hlbiB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUgY2FuIGZhbGwgYmFjayB0byB0aGUgc3ludGhldGljIFwiQXV0b1wiXG5cdCAqIG1vZGVsLiBEZWZhdWx0cyB0byBgdHJ1ZWAgd2hlbiBubyBzZXNzaW9uIHR5cGUgaXMgc2V0LiBTZWVcblx0ICoge0BsaW5rIGhhc05vQXZhaWxhYmxlTW9kZWx9IGZvciB0aGUgXCJub3RoaW5nIHRvIHNlbmQgd2l0aFwiIHN0YXRlLCB3aGljaFxuXHQgKiBhZGRpdGlvbmFsbHkgcmVxdWlyZXMgYW4gZW1wdHkgbW9kZWwgbGlzdC5cblx0ICovXG5cdHByaXZhdGUgX3Nob3dBdXRvTW9kZWwoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpO1xuXHRcdHJldHVybiAhc2Vzc2lvblR5cGUgfHwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnN1cHBvcnRzQXV0b01vZGVsRm9yU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRydWUgd2hlbiB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUgY2Fubm90IGZhbGwgYmFjayB0byB0aGUgQXV0byBtb2RlbFxuXHQgKiBhbmQgbm8gbW9kZWxzIGFyZSBhdmFpbGFibGUgdG8gaXQgXHUyMDE0IGUuZy4gdGhlIENsYXVkZSBhZ2VudCBob3N0IGZvciBhXG5cdCAqIENvcGlsb3QgRnJlZSAvIFN0dWRlbnQgdXNlci4gSW4gdGhpcyBzdGF0ZSB0aGVyZSBpcyBubyBtb2RlbCB0byBzZW5kIGFcblx0ICogcmVxdWVzdCB3aXRoLCBzbyBzZW5kaW5nIGlzIGJsb2NrZWQuXG5cdCAqL1xuXHRwcml2YXRlIGhhc05vQXZhaWxhYmxlTW9kZWwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICF0aGlzLl9zaG93QXV0b01vZGVsKCkgJiYgdGhpcy5nZXRNb2RlbHMoKS5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRwcml2YXRlIGdldE1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXJbXSB7XG5cdFx0Y29uc3QgYWxsTW9kZWxzID0gdGhpcy5nZXRBbGxNZXJnZWRNb2RlbHMoKTtcblxuXHRcdC8vIFNlc3Npb24gb3ducyBhIHBvb2wgYnV0IG5vIHRhcmdldGVkIG1vZGVscyByZWdpc3RlcmVkIHlldDogcmV0dXJuIGVtcHR5IHNvIGNhbGxlcnMgZG9uJ3QgdHJlYXQgZ2VuZXJhbC1wb29sIG1vZGVscyBhcyB2YWxpZC5cblx0XHRpZiAoc2Vzc2lvblR5cGVcblx0XHRcdCYmIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5yZXF1aXJlc0N1c3RvbU1vZGVsc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKVxuXHRcdFx0JiYgIWhhc01vZGVsc1RhcmdldGluZ1Nlc3Npb24oYWxsTW9kZWxzLCBzZXNzaW9uVHlwZSkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRhbGxNb2RlbHMuc29ydCgoYSwgYikgPT4gYS5tZXRhZGF0YS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5tZXRhZGF0YS5uYW1lKSk7XG5cblx0XHRjb25zdCBzZXNzaW9uRmlsdGVyZWQgPSBmaWx0ZXJNb2RlbHNGb3JTZXNzaW9uKGFsbE1vZGVscywgc2Vzc2lvblR5cGUsIHRoaXMuY3VycmVudE1vZGVLaW5kLCB0aGlzLmxvY2F0aW9uKTtcblx0XHRyZXR1cm4gc2Vzc2lvbkZpbHRlcmVkLmZpbHRlcihtID0+ICFpc01vZGVsSGlkZGVuSW5QaWNrZXIobSwgaWQgPT4gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuaXNNb2RlbEhpZGRlbihpZCkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGNoYXQgc2Vzc2lvbiB0eXBlIGZvciB0aGUgY3VycmVudCBzZXNzaW9uLCBpZiBhbnkuXG5cdCAqXG5cdCAqIE9uY2UgYSByZWFsIHNlc3Npb24gZXhpc3RzLCB0aGUgc2Vzc2lvbiByZXNvdXJjZSBpcyB0aGUgYXV0aG9yaXRhdGl2ZVxuXHQgKiBzb3VyY2UgZm9yIHdoaWNoIG1vZGVscyBhcmUgdmFsaWQuIFRoZSBwaWNrZXIgZGVsZWdhdGUgb25seSBkZXNjcmliZXMgdGhlXG5cdCAqIHdlbGNvbWUvbmV3LXNlc3Npb24gc2VsZWN0aW9uLCB3aGljaCBtYXkgbm90IG1hdGNoIHRoZSBzZXNzaW9uIHRoYXQgd2FzXG5cdCAqIHVsdGltYXRlbHkgY3JlYXRlZCAoZS5nLiBhbiBhZ2VudC1ob3N0IHBpY2sgdGhhdCBmZWxsIGJhY2sgdG8gYW5cblx0ICogaW4tcHJvY2VzcyBgbG9jYWxgIHNlc3Npb24pLiBQcmVmZXJyaW5nIHRoZSBkZWxlZ2F0ZSBpbiB0aGF0IGNhc2UgbGV0cyBhblxuXHQgKiBhZ2VudC1ob3N0IG1vZGVsIGxlYWsgaW50byBhIGxvY2FsIHNlc3Npb24ncyBwb29sLCBzbyB3ZSBvbmx5IGNvbnN1bHQgdGhlXG5cdCAqIGRlbGVnYXRlIHdoZW4gdGhlcmUgaXMgbm8gc2Vzc2lvbiB5ZXQgKHRoZSB3ZWxjb21lIHZpZXcgaGFzIG5vIHZpZXcgbW9kZWwpLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDdXJyZW50U2Vzc2lvblR5cGUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI/LigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFZhbGlkYXRlIHRoYXQgdGhlIGN1cnJlbnQgbW9kZWwgYmVsb25ncyB0byB0aGUgY3VycmVudCBzZXNzaW9uJ3MgcG9vbC5cblx0ICogQ2FsbGVkIHdoZW4gc3dpdGNoaW5nIHNlc3Npb25zIHRvIHByZXZlbnQgY3Jvc3MtY29udGFtaW5hdGlvbi5cblx0ICovXG5cdHByaXZhdGUgY2hlY2tNb2RlbEluU2Vzc2lvblBvb2woKTogdm9pZCB7XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLmVuc3VyZUN1cnJlbnRNb2RlbEluU2Vzc2lvblBvb2woKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZiB0aGUgY3VycmVudCBtb2RlbCBpcyBhYnNlbnQgZnJvbSB0aGUgZGVzdGluYXRpb24gc2Vzc2lvbidzIGZpbHRlcmVkIHBvb2wsXG5cdCAqIHJlLWluaXRpYWxpemUgZnJvbSBzdG9yYWdlIHRvIHJlc3RvcmUgdGhlIHVzZXIncyBwcmV2aW91cyBzZWxlY3Rpb24gZm9yIHRoaXNcblx0ICogcG9vbCwgdGhlbiB2YWxpZGF0ZS4gVXNlcyB0aGUgZmlsdGVyZWQgcG9vbCAoc2FtZSBhcyBgcmV2YWxpZGF0ZUZvclNlc3Npb25UeXBlYClcblx0ICogc28gbW9kZWxzIHRoYXQgYXJlIGNhdGFsb2d1ZWQgYnV0IG5vdCB2YWxpZCBmb3IgdGhlIGRlc3RpbmF0aW9uIGFyZSBjYXVnaHQgZXZlblxuXHQgKiBiZWZvcmUgdGFyZ2V0ZWQgbW9kZWxzIGxvYWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlaW5pdGlhbGl6ZUlmTW9kZWxJbnZhbGlkRm9yUG9vbCgpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKTtcblx0XHRpZiAoIWN1cnJlbnRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb29sID0gdGhpcy5nZXRNb2RlbHNGb3JTZXNzaW9uVHlwZSh0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpKTtcblx0XHRpZiAoIXBvb2wuc29tZShtID0+IG0uaWRlbnRpZmllciA9PT0gY3VycmVudE1vZGVsLmlkZW50aWZpZXIpKSB7XG5cdFx0XHR0aGlzLmluaXRTZWxlY3RlZE1vZGVsKCk7XG5cdFx0XHR0aGlzLmNoZWNrTW9kZWxJblNlc3Npb25Qb29sKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29uY2lsZSB0aGUgY3VycmVudCBtb2RlbCBhZnRlciBhbiBleHBsaWNpdCBzZXNzaW9uLXR5cGUgcGljazogcmVzdG9yZSBwZXJzaXN0ZWQgXHUyMTkyIGJlc3QtbWF0Y2ggcHJldmlvdXMgXHUyMTkyIGRlZmF1bHQuXG5cdCAqL1xuXHRwcml2YXRlIHJldmFsaWRhdGVNb2RlbEZvclNlc3Npb25UeXBlKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5yZXZhbGlkYXRlRm9yU2Vzc2lvblR5cGUoKCkgPT4gdGhpcy5pbml0U2VsZWN0ZWRNb2RlbCgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNldCB0aGUgY3VycmVudCBtb2RlIHdoZW4gaXQgaXMgbm90IHZhbGlkIGZvciB0aGUgY3VycmVudCBzZXNzaW9uIHR5cGUuXG5cdCAqL1xuXHRwcml2YXRlIGNoZWNrTW9kZUluU2Vzc2lvblBvb2woc2Vzc2lvblR5cGU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXNlc3Npb25UeXBlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0c2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXN0b21BZ2VudFRhcmdldCA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKTtcblx0XHRpZiAoIWN1c3RvbUFnZW50VGFyZ2V0IHx8IGN1c3RvbUFnZW50VGFyZ2V0ID09PSBUYXJnZXQuVW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCk7XG5cdFx0aWYgKGN1cnJlbnRNb2RlLmlkID09PSBDaGF0TW9kZS5BZ2VudC5pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY3VycmVudE1vZGUuaXNCdWlsdGluKSB7XG5cdFx0XHR0aGlzLnNldENoYXRNb2RlKENoYXRNb2RlS2luZC5BZ2VudCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVUYXJnZXQgPSBjdXJyZW50TW9kZS50YXJnZXQuZ2V0KCk7XG5cdFx0aWYgKG1vZGVUYXJnZXQgIT09IGN1c3RvbUFnZW50VGFyZ2V0ICYmIG1vZGVUYXJnZXQgIT09IFRhcmdldC5VbmRlZmluZWQpIHtcblx0XHRcdHRoaXMuc2V0Q2hhdE1vZGUoQ2hhdE1vZGVLaW5kLkFnZW50LCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFByZS1zZWxlY3QgdGhlIG1vZGVsIGluIHRoZSBtb2RlbCBwaWNrZXIgYmFzZWQgb24gdGhlIGBtb2RlbElkYCBmcm9tIHRoZVxuXHQgKiBsYXN0IHJlcXVlc3QgaW4gdGhlIGN1cnJlbnQgc2Vzc2lvbidzIGhpc3RvcnkuIFRoaXMgZW5zdXJlcyB0aGF0IHdoZW4gYVxuXHQgKiBjb250cmlidXRlZCBjaGF0IHNlc3Npb24gaXMgcmVvcGVuZWQsIHRoZSBtb2RlbCBwaWNrZXIgc2hvd3MgdGhlIG1vZGVsXG5cdCAqIHRoYXQgd2FzIGxhc3QgdXNlZCAtIHByb3ZpZGluZyBjb250aW51aXR5LlxuXHQgKi9cblx0cHJpdmF0ZSBwcmVzZWxlY3RNb2RlbEZyb21TZXNzaW9uSGlzdG9yeSgpOiB2b2lkIHtcblx0XHQvLyBTZXNzaW9uLWhpc3RvcnkgcHJlc2VsZWN0aW9uIGlzIGRlbGF5ZWQgd2hlbiBleHRlbnNpb24tcHJvdmlkZWQgbW9kZWxzXG5cdFx0Ly8gaGF2ZSBub3QgYXJyaXZlZCB5ZXQuIEFsd2F5cyBjbGVhciB0aGUgcHJldmlvdXMgc2Vzc2lvbi1oaXN0b3J5IGludGVudFxuXHRcdC8vIGJlZm9yZSBhbnkgZWFybHkgcmV0dXJuIHNvIGEgbGlzdGVuZXIgY2FwdHVyZWQgZm9yIGFub3RoZXIgc2Vzc2lvbiBjYW5ub3Rcblx0XHQvLyBsYXRlciBhcHBseSBpdHMgbW9kZWwgdG8gdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHRcdHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5jbGVhckhpc3RvcnlJbnRlbnQoKTtcblxuXHRcdGNvbnN0IHNlc3Npb25Nb2RlbCA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbDtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBzZXNzaW9uTW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRjb25zdCByZXF1ZXN0cyA9IHNlc3Npb25Nb2RlbD8uZ2V0UmVxdWVzdHMoKTtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXJlcXVlc3RzIHx8IHJlcXVlc3RzLmxlbmd0aCA9PT0gMCB8fCBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSAhPT0gU2Vzc2lvblR5cGUuQ29waWxvdENMSSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVJbmZvID0gZmluZExhc3QocmVxdWVzdHMsIHJlcSA9PiAhIXJlcS5tb2RlSW5mbyk/Lm1vZGVJbmZvO1xuXHRcdGlmIChtb2RlSW5mbyAmJiBtb2RlSW5mby5tb2RlSW5zdHJ1Y3Rpb25zPy51cmkpIHtcblx0XHRcdHRoaXMuc2V0Q2hhdE1vZGUobW9kZUluZm8ubW9kZUluc3RydWN0aW9ucy51cmkudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdE1vZGVsSWQgPSBmaW5kTGFzdChyZXF1ZXN0cywgcmVxID0+ICEhcmVxLm1vZGVsSWQpPy5tb2RlbElkO1xuXHRcdGlmICghbGFzdE1vZGVsSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnByZXNlbGVjdEZyb21IaXN0b3J5KGxhc3RNb2RlbElkLCBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIHNldEN1cnJlbnRMYW5ndWFnZU1vZGVsVG9EZWZhdWx0KGZvclNlc3Npb25UeXBlPzogc3RyaW5nKSB7XG5cdFx0dGhpcy5fbW9kZWxTZWxlY3Rpb25Db250cm9sbGVyLnNlbGVjdERlZmF1bHQoZm9yU2Vzc2lvblR5cGUgPz8gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblR5cGUoKSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHJhdyBjb25maWd1cmVkIGRlZmF1bHQtbW9kZWwgdmFsdWUgZnJvbSB0aGVcblx0ICoge0BsaW5rIENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRNb2RlbH0gc2V0dGluZyAod2hpY2ggbWF5XG5cdCAqIGJlIGZvcmNlZCBieSBlbnRlcnByaXNlIHBvbGljeSkuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBub3RoaW5nIGlzXG5cdCAqIGNvbmZpZ3VyZWQuXG5cdCAqL1xuXHRwcml2YXRlIGdldENvbmZpZ3VyZWRNb2RlbFZhbHVlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ2hhdENvbmZpZ3VyYXRpb24uRGVmYXVsdE1vZGVsKT8udHJpbSgpO1xuXHRcdHJldHVybiBtb2RlbCA/IG1vZGVsIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFJlc2V0cyB0aGUgbGFuZ3VhZ2UgbW9kZWwgdG8gdGhlIGxvY2F0aW9uIGRlZmF1bHQgYW5kIGNhbmNlbHMgYW55IHBlbmRpbmcgbW9kZWwtc2VsZWN0aW9uIGludGVudC4gKi9cblx0cHVibGljIHJlc2V0TGFuZ3VhZ2VNb2RlbFRvRGVmYXVsdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuY2xlYXJJbnRlbnQoKTtcblx0XHR0aGlzLnNldEN1cnJlbnRMYW5ndWFnZU1vZGVsVG9EZWZhdWx0KCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50IGlucHV0IHN0YXRlIGZvciBoaXN0b3J5XG5cdCAqL1xuXHRwdWJsaWMgZ2V0Q3VycmVudElucHV0U3RhdGUoKTogSUNoYXRNb2RlbElucHV0U3RhdGUge1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IHRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpO1xuXHRcdGNvbnN0IHN0YXRlOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSA9IHtcblx0XHRcdGlucHV0VGV4dDogdGhpcy5faW5wdXRFZGl0b3I/LmdldFZhbHVlKCkgPz8gJycsXG5cdFx0XHRhdHRhY2htZW50czogdGhpcy5fYXR0YWNobWVudE1vZGVsLmF0dGFjaG1lbnRzLFxuXHRcdFx0bW9kZToge1xuXHRcdFx0XHRpZDogbW9kZS5pZCxcblx0XHRcdFx0a2luZDogbW9kZS5raW5kXG5cdFx0XHR9LFxuXHRcdFx0c2VsZWN0ZWRNb2RlbCxcblx0XHRcdG1vZGVsQ29uZmlndXJhdGlvbjogc2VsZWN0ZWRNb2RlbCA/IHRoaXMuX21vZGVsQ29uZmlnU3RvcmUuZ2V0TW9kZWxDb25maWd1cmF0aW9uKHNlbGVjdGVkTW9kZWwuaWRlbnRpZmllcikgOiB1bmRlZmluZWQsXG5cdFx0XHRzZWxlY3Rpb25zOiB0aGlzLl9pbnB1dEVkaXRvcj8uZ2V0U2VsZWN0aW9ucygpIHx8IFtdLFxuXHRcdFx0cGVybWlzc2lvbkxldmVsOiB0aGlzLl9jdXJyZW50UGVybWlzc2lvbkxldmVsLmdldCgpLFxuXHRcdFx0Y29udHJpYjoge30sXG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgY29udHJpYiBvZiB0aGlzLl93aWRnZXQ/LmNvbnRyaWJzIHx8IEl0ZXJhYmxlLmVtcHR5KCkpIHtcblx0XHRcdGNvbnRyaWIuZ2V0SW5wdXRTdGF0ZT8uKHN0YXRlLmNvbnRyaWIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHZlcmJvc2UgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuQ2hhdCk7XG5cdFx0bGV0IGtiTGFiZWw7XG5cdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdGtiTGFiZWwgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoQWNjZXNzaWJpbGl0eUNvbW1hbmRJZC5PcGVuQWNjZXNzaWJpbGl0eUhlbHApPy5nZXRMYWJlbCgpO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlID0gdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpO1xuXG5cdFx0Ly8gSW5jbHVkZSBtb2RlbCBpbmZvcm1hdGlvbiBpZiBhdmFpbGFibGVcblx0XHRjb25zdCBtb2RlbE5hbWUgPSB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8ubWV0YWRhdGEubmFtZTtcblx0XHRjb25zdCBtb2RlbEluZm8gPSBtb2RlbE5hbWUgPyBsb2NhbGl6ZSgnY2hhdElucHV0Lm1vZGVsJywgXCIsIHswfS4gXCIsIG1vZGVsTmFtZSkgOiAnJztcblxuXHRcdGxldCBtb2RlTGFiZWwgPSAnJztcblx0XHRpZiAoIW1vZGUuaXNCdWlsdGluKSB7XG5cdFx0XHRjb25zdCBtb2RlID0gdGhpcy5jdXJyZW50TW9kZU9icy5nZXQoKTtcblx0XHRcdG1vZGVMYWJlbCA9IGxvY2FsaXplKCdjaGF0SW5wdXQubW9kZS5jdXN0b20nLCBcIih7MH0pLCB7MX1cIiwgbW9kZS5sYWJlbC5nZXQoKSwgbW9kZS5kZXNjcmlwdGlvbi5nZXQoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN3aXRjaCAodGhpcy5jdXJyZW50TW9kZUtpbmQpIHtcblx0XHRcdFx0Y2FzZSBDaGF0TW9kZUtpbmQuQWdlbnQ6XG5cdFx0XHRcdFx0bW9kZUxhYmVsID0gbG9jYWxpemUoJ2NoYXRJbnB1dC5tb2RlLmFnZW50JywgXCIoQWdlbnQpLCBlZGl0IGZpbGVzIGluIHlvdXIgd29ya3NwYWNlLlwiKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0TW9kZUtpbmQuRWRpdDpcblx0XHRcdFx0XHRtb2RlTGFiZWwgPSBsb2NhbGl6ZSgnY2hhdElucHV0Lm1vZGUuZWRpdCcsIFwiKEVkaXQpLCBlZGl0IGZpbGVzIGluIHlvdXIgd29ya3NwYWNlLlwiKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGF0TW9kZUtpbmQuQXNrOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdG1vZGVMYWJlbCA9IGxvY2FsaXplKCdjaGF0SW5wdXQubW9kZS5hc2snLCBcIihBc2spLCBhc2sgcXVlc3Rpb25zIG9yIHR5cGUgLyBmb3IgdG9waWNzLlwiKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHZlcmJvc2UpIHtcblx0XHRcdHJldHVybiBrYkxhYmVsXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FjdGlvbnMuY2hhdC5hY2Nlc3NpYmlsdHlIZWxwJywgXCJDaGF0IElucHV0IHswfXsxfSBQcmVzcyBFbnRlciB0byBzZW5kIG91dCB0aGUgcmVxdWVzdC4gVXNlIHsyfSBmb3IgQ2hhdCBBY2Nlc3NpYmlsaXR5IEhlbHAuXCIsIG1vZGVMYWJlbCwgbW9kZWxJbmZvLCBrYkxhYmVsKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdjaGF0SW5wdXQuYWNjZXNzaWJpbGl0eUhlbHBOb0tiJywgXCJDaGF0IElucHV0IHswfXsxfSBQcmVzcyBFbnRlciB0byBzZW5kIG91dCB0aGUgcmVxdWVzdC4gVXNlIHRoZSBDaGF0IEFjY2Vzc2liaWxpdHkgSGVscCBjb21tYW5kIGZvciBtb3JlIGluZm9ybWF0aW9uLlwiLCBtb2RlTGFiZWwsIG1vZGVsSW5mbyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdElucHV0LmFjY2Vzc2liaWxpdHlIZWxwJywgXCJDaGF0IElucHV0IHswfXsxfS5cIiwgbW9kZUxhYmVsLCBtb2RlbEluZm8pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVDdXJyZW50Q2hhdE1vZGUoKSB7XG5cdFx0Y29uc3QgY3VycmVudE1vZGUgPSB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCk7XG5cdFx0Y29uc3QgdmFsaWRNb2RlID0gdGhpcy5fY3VycmVudENoYXRNb2Rlc09ic2VydmFibGUuZ2V0KCkuZmluZE1vZGVCeUlkKGN1cnJlbnRNb2RlLmlkKTtcblx0XHRjb25zdCBpc0FnZW50TW9kZUVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkFnZW50RW5hYmxlZCk7XG5cdFx0aWYgKCF2YWxpZE1vZGUpIHtcblx0XHRcdHRoaXMuc2V0Q2hhdE1vZGUoaXNBZ2VudE1vZGVFbmFibGVkID8gQ2hhdE1vZGVLaW5kLkFnZW50IDogQ2hhdE1vZGVLaW5kLkFzayk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChjdXJyZW50TW9kZS5raW5kID09PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiYgIWlzQWdlbnRNb2RlRW5hYmxlZCkge1xuXHRcdFx0dGhpcy5zZXRDaGF0TW9kZShDaGF0TW9kZUtpbmQuQXNrKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmUtYXBwbHkgdGhlIHNlc3Npb24ncyBvd24gcGVyc2lzdGVkIGN1c3RvbSBhZ2VudCBvbmNlIGl0cyBtb2RlIGJlY29tZXMgYXZhaWxhYmxlLlxuXHQgKlxuXHQgKiBBIHJlc3RvcmVkIGFnZW50LWhvc3Qgc2Vzc2lvbiBwZXJzaXN0cyBpdHMgc2VsZWN0ZWQgY3VzdG9tIGFnZW50IGluIGBtb2RlYCwgYnV0IHRoZSBhZ2VudFxuXHQgKiBob3N0J3MgY3VzdG9tIG1vZGVzIG9ubHkgcmVnaXN0ZXIgYWZ0ZXIgdGhlIGJhY2tlbmQgY29ubmVjdHMuIFVudGlsIHRoZW4gYHNldENoYXRNb2RlYCBmYWxsc1xuXHQgKiBiYWNrIHRvIHRoZSBidWlsdGluIEFnZW50LCBzbyB3aGVuIHRoZSBjdXN0b20gbW9kZXMgYXJyaXZlIChgbW9kZXMub25EaWRDaGFuZ2VgKSByZS1hcHBseSB0aGVcblx0ICogcGVyc2lzdGVkIGN1c3RvbSBhZ2VudC4gQnVpbHRpbi9kZWZhdWx0IG1vZGVzIGFyZSBoYW5kbGVkIGJ5IHtAbGluayB2YWxpZGF0ZUN1cnJlbnRDaGF0TW9kZX0uXG5cdCAqL1xuXHRwcml2YXRlIF9yZXN0b3JlUGVyc2lzdGVkQ3VzdG9tTW9kZUlmQXZhaWxhYmxlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBlcnNpc3RlZE1vZGUgPSB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5nZXQoKT8ubW9kZTtcblx0XHRpZiAoIXBlcnNpc3RlZE1vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbW9kZXMgPSB0aGlzLl9jdXJyZW50Q2hhdE1vZGVzT2JzZXJ2YWJsZS5nZXQoKTtcblx0XHRjb25zdCBmb3VuZCA9IG1vZGVzLmZpbmRNb2RlQnlJZChwZXJzaXN0ZWRNb2RlLmlkKSA/PyBtb2Rlcy5maW5kTW9kZUJ5TmFtZShwZXJzaXN0ZWRNb2RlLmlkKTtcblx0XHRpZiAoZm91bmQgJiYgIWZvdW5kLmlzQnVpbHRpbiAmJiB0aGlzLl9jdXJyZW50TW9kZU9ic2VydmFibGUuZ2V0KCkuaWQgIT09IGZvdW5kLmlkKSB7XG5cdFx0XHR0aGlzLnNldENoYXRNb2RlKGZvdW5kLmlkLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0bG9nSW5wdXRIaXN0b3J5KCk6IHZvaWQge1xuXHRcdGNvbnN0IGhpc3RvcnlTdHIgPSB0aGlzLmhpc3RvcnkudmFsdWVzLm1hcChlbnRyeSA9PiBKU09OLnN0cmluZ2lmeShlbnRyeSkpLmpvaW4oJ1xcbicpO1xuXHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLmxvY2F0aW9ufV0gQ2hhdCBpbnB1dCBoaXN0b3J5OmAsIGhpc3RvcnlTdHIpO1xuXHR9XG5cblx0c2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaXNpYmlsaXR5LmZpcmUodmlzaWJsZSk7XG5cdH1cblxuXHQvKiogSWYgY29uc3VtZXJzIGFyZSBidXN5IGdlbmVyYXRpbmcgdGhlIGNoYXQgaW5wdXQsIHJldHVybnMgdGhlIHByb21pc2UgcmVzb2x2ZWQgd2hlbiB0aGV5IGZpbmlzaCAqL1xuXHRnZXQgZ2VuZXJhdGluZygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2VuZXJhdGluZz8uZGVmZXIucDtcblx0fVxuXG5cdC8qKiBEaXNhYmxlcyB0aGUgaW5wdXQgc3VibWlzc2lvbnMgYnV0dG9ucyB1bnRpbCB0aGUgZGlzcG9zYWJsZSBpcyBkaXNwb3NlZC4gKi9cblx0c3RhcnRHZW5lcmF0aW5nKCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ0NoYXRXaWRnZXQjc3RhcnRHZW5lcmF0aW5nJyk7XG5cdFx0aWYgKHRoaXMuX2dlbmVyYXRpbmcpIHtcblx0XHRcdHRoaXMuX2dlbmVyYXRpbmcucmMrKztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZ2VuZXJhdGluZyA9IHsgcmM6IDEsIGRlZmVyOiBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCkgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnQ2hhdFdpZGdldCNkb25lR2VuZXJhdGluZycpO1xuXHRcdFx0aWYgKHRoaXMuX2dlbmVyYXRpbmcgJiYgIS0tdGhpcy5fZ2VuZXJhdGluZy5yYykge1xuXHRcdFx0XHR0aGlzLl9nZW5lcmF0aW5nLmRlZmVyLmNvbXBsZXRlKCk7XG5cdFx0XHRcdHRoaXMuX2dlbmVyYXRpbmcgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuY29udGFpbmVyO1xuXHR9XG5cblx0YXN5bmMgc2hvd1ByZXZpb3VzVmFsdWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaGlzdG9yeS5pc0F0U3RhcnQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5nZXRDdXJyZW50SW5wdXRTdGF0ZSgpO1xuXHRcdGlmIChzdGF0ZS5pbnB1dFRleHQgfHwgc3RhdGUuYXR0YWNobWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmhpc3Rvcnkub3ZlcmxheShzdGF0ZSk7XG5cdFx0fVxuXHRcdHRoaXMubmF2aWdhdGVIaXN0b3J5KHRydWUpO1xuXHR9XG5cblx0YXN5bmMgc2hvd05leHRWYWx1ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5oaXN0b3J5LmlzQXRFbmQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5nZXRDdXJyZW50SW5wdXRTdGF0ZSgpO1xuXHRcdGlmIChzdGF0ZS5pbnB1dFRleHQgfHwgc3RhdGUuYXR0YWNobWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmhpc3Rvcnkub3ZlcmxheShzdGF0ZSk7XG5cdFx0fVxuXHRcdHRoaXMubmF2aWdhdGVIaXN0b3J5KGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXN0b3JlcyBhdHRhY2htZW50cyB0byB0aGUgaW5wdXQsIHJlLWZldGNoaW5nIGltYWdlIGJpbmFyeSBkYXRhIGFzIG5lZWRlZC5cblx0ICovXG5cdGFzeW5jIHJlc3RvcmVBdHRhY2htZW50cyhhdHRhY2htZW50czogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHJlc3RvcmVkID0gWy4uLmF0dGFjaG1lbnRzXTtcblxuXHRcdGlmIChyZXN0b3JlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXN0b3JlZCA9IChhd2FpdCBQcm9taXNlLmFsbChyZXN0b3JlZC5tYXAoYXN5bmMgKGF0dGFjaG1lbnQpID0+IHtcblx0XHRcdFx0aWYgKGlzSW1hZ2VWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpICYmICFhdHRhY2htZW50LnZhbHVlICYmIGF0dGFjaG1lbnQucmVmZXJlbmNlcz8ubGVuZ3RoICYmIFVSSS5pc1VyaShhdHRhY2htZW50LnJlZmVyZW5jZXNbMF0ucmVmZXJlbmNlKSkge1xuXHRcdFx0XHRcdGNvbnN0IGN1cnJSZWZlcmVuY2UgPSBhdHRhY2htZW50LnJlZmVyZW5jZXNbMF0ucmVmZXJlbmNlO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbWFnZUJpbmFyeSA9IGN1cnJSZWZlcmVuY2UudG9TdHJpbmcodHJ1ZSkuc3RhcnRzV2l0aCgnaHR0cCcpID8gYXdhaXQgdGhpcy5zaGFyZWRXZWJFeHRyYWN0ZXJTZXJ2aWNlLnJlYWRJbWFnZShjdXJyUmVmZXJlbmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSA6IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKGN1cnJSZWZlcmVuY2UpKS52YWx1ZTtcblx0XHRcdFx0XHRcdGlmICghaW1hZ2VCaW5hcnkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IG5ld0F0dGFjaG1lbnQgPSB7IC4uLmF0dGFjaG1lbnQgfTtcblx0XHRcdFx0XHRcdG5ld0F0dGFjaG1lbnQudmFsdWUgPSAoaXNJbWFnZVZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkgJiYgYXR0YWNobWVudC5pc1Bhc3RlZCkgPyBpbWFnZUJpbmFyeS5idWZmZXIgOiBhd2FpdCByZXNpemVJbWFnZShpbWFnZUJpbmFyeS5idWZmZXIpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ld0F0dGFjaG1lbnQ7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCBhbmQgcmVmZXJlbmNlLicsIGVycik7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0XHRcdH0pKSkuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fYXR0YWNobWVudE1vZGVsLmNsZWFyQW5kU2V0Q29udGV4dCguLi5yZXN0b3JlZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG5hdmlnYXRlSGlzdG9yeShwcmV2aW91czogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhpc3RvcnlFbnRyeSA9IHByZXZpb3VzID9cblx0XHRcdHRoaXMuaGlzdG9yeS5wcmV2aW91cygpIDogdGhpcy5oaXN0b3J5Lm5leHQoKTtcblxuXHRcdGF3YWl0IHRoaXMucmVzdG9yZUF0dGFjaG1lbnRzKGhpc3RvcnlFbnRyeT8uYXR0YWNobWVudHMgPz8gW10pO1xuXG5cdFx0Y29uc3QgaW5wdXRUZXh0ID0gaGlzdG9yeUVudHJ5Py5pbnB1dFRleHQgPz8gJyc7XG5cdFx0Y29uc3QgY29udHJpYkRhdGEgPSBoaXN0b3J5RW50cnk/LmNvbnRyaWIgPz8ge307XG5cdFx0YXJpYS5zdGF0dXMoaW5wdXRUZXh0KTtcblx0XHR0aGlzLnNldFZhbHVlKGlucHV0VGV4dCwgdHJ1ZSk7XG5cdFx0dGhpcy5fd2lkZ2V0Py5jb250cmlicy5mb3JFYWNoKGNvbnRyaWIgPT4ge1xuXHRcdFx0Y29udHJpYi5zZXRJbnB1dFN0YXRlPy4oY29udHJpYkRhdGEpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX29uRGlkTG9hZElucHV0U3RhdGUuZmlyZSgpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9pbnB1dEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdC8vIFdoZW4gbmF2aWdhdGluZyB0byBwcmV2aW91cyBoaXN0b3J5LCBhbHdheXMgcG9zaXRpb24gY3Vyc29yIGF0IHRoZSBzdGFydCAobGluZSAxLCBjb2x1bW4gMSlcblx0XHRcdC8vIFRoaXMgZW5zdXJlcyB0aGF0IHByZXNzaW5nIHVwIGFnYWluIHdpbGwgY29udGludWUgdG8gbmF2aWdhdGUgaGlzdG9yeVxuXHRcdFx0dGhpcy5faW5wdXRFZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldFBvc2l0aW9uKGdldExhc3RQb3NpdGlvbihtb2RlbCkpO1xuXHRcdH1cblx0fVxuXG5cdHNldFZhbHVlKHZhbHVlOiBzdHJpbmcsIHRyYW5zaWVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXRFZGl0b3Iuc2V0VmFsdWUodmFsdWUpO1xuXHRcdC8vIGFsd2F5cyBsZWF2ZSBjdXJzb3IgYXQgdGhlIGVuZFxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5pbnB1dEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvci5zZXRQb3NpdGlvbihnZXRMYXN0UG9zaXRpb24obW9kZWwpKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1cygpIHtcblx0XHR0aGlzLl9pbnB1dEVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0aGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lucHV0RWRpdG9yLmhhc1dpZGdldEZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c1RvZG9MaXN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0SW5wdXRUb2RvTGlzdFdpZGdldC52YWx1ZT8uZm9jdXMoKSA/PyBmYWxzZTtcblx0fVxuXG5cdGlzVG9kb0xpc3RGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0SW5wdXRUb2RvTGlzdFdpZGdldC52YWx1ZT8uaGFzRm9jdXMoKSA/PyBmYWxzZTtcblx0fVxuXG5cdGhhc1Zpc2libGVUb2RvcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdElucHV0VG9kb0xpc3RXaWRnZXQudmFsdWU/Lmhhc1RvZG9zKCkgPz8gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVzZXQgdGhlIGlucHV0IGFuZCB1cGRhdGUgaGlzdG9yeS5cblx0ICogQHBhcmFtIHVzZXJRdWVyeSBJZiBwcm92aWRlZCwgdGhpcyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBoaXN0b3J5LiBGb2xsb3d1cHMgYW5kIHByb2dyYW1tYXRpYyBxdWVyaWVzIHNob3VsZCBub3QgYmUgcGFzc2VkLlxuXHQgKi9cblx0YXN5bmMgYWNjZXB0SW5wdXQoaXNVc2VyUXVlcnk/OiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgcHJlc2VydmVJbnB1dD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoaXNVc2VyUXVlcnkpIHtcblx0XHRcdGNvbnN0IHVzZXJRdWVyeSA9IHRoaXMuZ2V0Q3VycmVudElucHV0U3RhdGUoKTtcblx0XHRcdHRoaXMuaGlzdG9yeS5hcHBlbmQodGhpcy5fZ2V0RmlsdGVyZWRFbnRyeSh1c2VyUXVlcnkpKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlc2V0U2Nyb2xsYmFyVmlzaWJpbGl0eUFmdGVyQWNjZXB0KCk7XG5cblx0XHQvLyBBdXRvLWRpc21pc3Mgbm90aWZpY2F0aW9ucyB0aGF0IHJlcXVlc3RlZCBpdC4gU2NvcGUgdG8gdGhpcyBpbnB1dCdzXG5cdFx0Ly8gc2Vzc2lvbiBzbyBhIG1lc3NhZ2UgaGVyZSBkb2Vzbid0IGhpZGUgbm90aWZpY2F0aW9ucyBmb3Igb3RoZXIgc2Vzc2lvbnMuXG5cdFx0dGhpcy5jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmhhbmRsZU1lc3NhZ2VTZW50KHtcblx0XHRcdHNlc3Npb25UeXBlOiB0aGlzLl9ub3RpZmljYXRpb25Nb2RlbFRhcmdldENoYXRTZXNzaW9uVHlwZS5nZXQoKSxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZU9ic2VydmFibGUuZ2V0KCksXG5cdFx0fSk7XG5cblx0XHRpZiAodGhpcy5fY2hhdFNlc3Npb25Jc0VtcHR5KSB7XG5cdFx0XHR0aGlzLl9jaGF0U2Vzc2lvbklzRW1wdHkgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2VtcHR5SW5wdXRTdGF0ZS5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fZW1wdHlJbnB1dEF0dGFjaG1lbnRzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAocHJlc2VydmVJbnB1dCkge1xuXHRcdFx0Ly8gVGhlIGVkaXRvciBob2xkcyBhbiB1bnJlbGF0ZWQgdXNlciBkcmFmdDoga2VlcCBpdCwgYW5kIGxlYXZlIGFueSBwZW5kaW5nXG5cdFx0XHQvLyBkaWN0YXRpb24gdW4tZmluYWxpemVkIHNpbmNlIHRoZSBkcmFmdCBpcyBuZWl0aGVyIHNlbnQgbm9yIGNsZWFyZWQuXG5cdFx0XHRpZiAoIXByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0dGhpcy5faW5wdXRFZGl0b3IuZm9jdXMoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDbGVhciBhdHRhY2hlZCBjb250ZXh0LCBmaXJlIGV2ZW50IHRvIGNsZWFyIGlucHV0IHN0YXRlLCBhbmQgY2xlYXIgdGhlIGlucHV0IGVkaXRvclxuXHRcdC8vIE1lYXN1cmUgYW55IHBlbmRpbmcgZGljdGF0aW9uIGFjY3VyYWN5IGFnYWluc3QgdGhlIHRleHQgYWN0dWFsbHkgYmVpbmdcblx0XHQvLyBzZW50LCBiZWZvcmUgdGhlIGVkaXRvciBpcyBjbGVhcmVkIGJlbG93LlxuXHRcdG5vdGlmeURpY3RhdGlvblN1Ym1pdHRlZCh0aGlzLl9pbnB1dEVkaXRvcik7XG5cdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgW0FDQ0VQVF0gYWNjZXB0SW5wdXQgLT4gYXR0YWNobWVudE1vZGVsLmNsZWFyKCkgaW4gJHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX1gLCB1bmRlZmluZWQsIHRoaXMuX2lucHV0TW9kZWw/LnN0YXRlLmdldCgpLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdHRoaXMuYXR0YWNobWVudE1vZGVsLmNsZWFyKCk7XG5cdFx0dGhpcy5fb25EaWRMb2FkSW5wdXRTdGF0ZS5maXJlKCk7XG5cdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSAmJiBpc01hY2ludG9zaCkge1xuXHRcdFx0dGhpcy5fYWNjZXB0SW5wdXRGb3JWb2ljZW92ZXIoKTtcblx0XHR9IGVsc2UgaWYgKHByZXNlcnZlRm9jdXMpIHtcblx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faW5wdXRFZGl0b3IuZm9jdXMoKTtcblx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldFZhbHVlKCcnKTtcblx0XHR9XG5cdH1cblxuXHR2YWxpZGF0ZUFnZW50TW9kZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuYWdlbnRTZXJ2aWNlLmhhc1Rvb2xzQWdlbnQgJiYgdGhpcy5fY3VycmVudE1vZGVPYnNlcnZhYmxlLmdldCgpLmtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCkge1xuXHRcdFx0dGhpcy5zZXRDaGF0TW9kZShDaGF0TW9kZUtpbmQuRWRpdCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQSBmdW5jdGlvbiB0aGF0IGZpbHRlcnMgb3V0IHNwZWNpZmljYWxseSB0aGUgYHZhbHVlYCBwcm9wZXJ0eSBvZiB0aGUgYXR0YWNobWVudC5cblx0cHJpdmF0ZSBfZ2V0RmlsdGVyZWRFbnRyeShpbnB1dFN0YXRlOiBJQ2hhdE1vZGVsSW5wdXRTdGF0ZSk6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHtcblx0XHRjb25zdCBhdHRhY2htZW50c1dpdGhvdXRJbWFnZVZhbHVlcyA9IGlucHV0U3RhdGUuYXR0YWNobWVudHMubWFwKGF0dGFjaG1lbnQgPT4ge1xuXHRcdFx0aWYgKGlzSW1hZ2VWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpICYmIGF0dGFjaG1lbnQucmVmZXJlbmNlcz8ubGVuZ3RoICYmIGF0dGFjaG1lbnQudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgbmV3QXR0YWNobWVudCA9IHsgLi4uYXR0YWNobWVudCB9O1xuXHRcdFx0XHRuZXdBdHRhY2htZW50LnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gbmV3QXR0YWNobWVudDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhdHRhY2htZW50O1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgLi4uaW5wdXRTdGF0ZSwgYXR0YWNobWVudHM6IGF0dGFjaG1lbnRzV2l0aG91dEltYWdlVmFsdWVzIH07XG5cdH1cblxuXHRwcml2YXRlIF9hY2NlcHRJbnB1dEZvclZvaWNlb3ZlcigpOiB2b2lkIHtcblx0XHRjb25zdCBkb21Ob2RlID0gdGhpcy5faW5wdXRFZGl0b3IuZ2V0RG9tTm9kZSgpO1xuXHRcdGlmICghZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBSZW1vdmUgdGhlIGlucHV0IGVkaXRvciBmcm9tIHRoZSBET00gdGVtcG9yYXJpbHkgdG8gcHJldmVudCBWb2ljZU92ZXJcblx0XHQvLyBmcm9tIHJlYWRpbmcgdGhlIGNsZWFyZWQgdGV4dCAodGhlIHJlcXVlc3QpIHRvIHRoZSB1c2VyLlxuXHRcdGRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0dGhpcy5faW5wdXRFZGl0b3Iuc2V0VmFsdWUoJycpO1xuXHRcdHRoaXMuX2lucHV0RWRpdG9yRWxlbWVudC5hcHBlbmRDaGlsZChkb21Ob2RlKTtcblx0XHR0aGlzLl9pbnB1dEVkaXRvci5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQXR0YWNoZWRDb250ZXh0Q2hhbmdlKCkge1xuXHRcdHRoaXMuX2hhc0ZpbGVBdHRhY2htZW50Q29udGV4dEtleS5zZXQoQm9vbGVhbih0aGlzLl9hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuZmluZChhID0+IGEua2luZCA9PT0gJ2ZpbGUnKSkpO1xuXHRcdHRoaXMuX3VwZGF0ZUlucHV0Q29udGVudENvbnRleHRLZXlzKCk7XG5cdFx0dGhpcy5yZW5kZXJBdHRhY2hlZENvbnRleHQoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUlucHV0Q29udGVudENvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0SGFzVGV4dCA9ICEhdGhpcy5faW5wdXRFZGl0b3I/LmdldE1vZGVsKCk/LmdldFZhbHVlKCkudHJpbSgpO1xuXHRcdHRoaXMuaW5wdXRFZGl0b3JIYXNUZXh0LnNldChpbnB1dEhhc1RleHQpO1xuXHRcdGNvbnN0IGhhc1NlbmRhYmxlQ29udGVudCA9IGlucHV0SGFzVGV4dCB8fCB0aGlzLl9hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuc29tZShpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KTtcblx0XHQvLyBCbG9jayBzZW5kaW5nIHdoZW4gdGhlIHNlc3Npb24gdHlwZSBoYXMgbm8gdXNhYmxlIG1vZGVsIChhbmQgY2FuJ3Rcblx0XHQvLyBmYWxsIGJhY2sgdG8gQXV0byk6IHRoZXJlIGlzIG5vdGhpbmcgdG8gc2VuZCB0aGUgcmVxdWVzdCB3aXRoLlxuXHRcdHRoaXMuaW5wdXRFZGl0b3JIYXNTZW5kYWJsZUNvbnRlbnQuc2V0KGhhc1NlbmRhYmxlQ29udGVudCAmJiAhdGhpcy5oYXNOb0F2YWlsYWJsZU1vZGVsKCkgJiYgIXRoaXMuaGFzUGVuZGluZ1Byb2dyYW1tYXRpY01vZGVsU2VsZWN0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3JDcmVhdGVPcHRpb25FbWl0dGVyKG9wdGlvbkdyb3VwSWQ6IHN0cmluZyk6IEVtaXR0ZXI8SUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtPiB7XG5cdFx0bGV0IGVtaXR0ZXIgPSB0aGlzLl9jaGF0U2Vzc2lvbk9wdGlvbkVtaXR0ZXJzLmdldChvcHRpb25Hcm91cElkKTtcblx0XHRpZiAoIWVtaXR0ZXIpIHtcblx0XHRcdGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+KCk7XG5cdFx0XHR0aGlzLl9jaGF0U2Vzc2lvbk9wdGlvbkVtaXR0ZXJzLnNldChvcHRpb25Hcm91cElkLCBlbWl0dGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVtaXR0ZXI7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IG9yIGNyZWF0ZSBhIGNvbnRleHQga2V5IGZvciBhbiBvcHRpb24gZ3JvdXAuXG5cdCAqIENvbnRleHQga2V5cyBmb2xsb3cgdGhlIHBhdHRlcm4gYGNoYXRTZXNzaW9uT3B0aW9uLjxncm91cElkPmAuXG5cdCAqL1xuXHRwcml2YXRlIGdldE9yQ3JlYXRlT3B0aW9uQ29udGV4dEtleShvcHRpb25Hcm91cElkOiBzdHJpbmcpOiBJQ29udGV4dEtleTxzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgY29udGV4dEtleSA9IHRoaXMuX29wdGlvbkNvbnRleHRLZXlzLmdldChvcHRpb25Hcm91cElkKTtcblx0XHRpZiAoIWNvbnRleHRLZXkpIHtcblx0XHRcdGNvbnN0IHJhd0tleSA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oYGNoYXRTZXNzaW9uT3B0aW9uLiR7b3B0aW9uR3JvdXBJZH1gLCAnJyk7XG5cdFx0XHRjb250ZXh0S2V5ID0gcmF3S2V5LmJpbmRUbyh0aGlzLl9zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLl9vcHRpb25Db250ZXh0S2V5cy5zZXQob3B0aW9uR3JvdXBJZCwgY29udGV4dEtleSk7XG5cdFx0fVxuXHRcdHJldHVybiBjb250ZXh0S2V5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZSB0aGUgY29udGV4dCBrZXkgZm9yIGFuIG9wdGlvbiBncm91cCB3aXRoIHRoZSBjdXJyZW50IHNlbGVjdGlvbi5cblx0ICogVGhpcyBlbmFibGVzIGB3aGVuYCBleHByZXNzaW9ucyBvbiBvdGhlciBvcHRpb24gZ3JvdXBzIHRvIHJlYWN0IHRvIGNoYW5nZXMuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZU9wdGlvbkNvbnRleHRLZXkob3B0aW9uR3JvdXBJZDogc3RyaW5nLCBvcHRpb25JdGVtSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG5vcm1hbGl6ZWRPcHRpb25JZCA9IG9wdGlvbkl0ZW1JZC50cmltKCk7XG5cdFx0Y29uc3QgY29udGV4dEtleSA9IHRoaXMuZ2V0T3JDcmVhdGVPcHRpb25Db250ZXh0S2V5KG9wdGlvbkdyb3VwSWQpO1xuXHRcdGlmIChjb250ZXh0S2V5KSB7XG5cdFx0XHRjb250ZXh0S2V5LnNldChub3JtYWxpemVkT3B0aW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBFdmFsdWF0ZSB3aGV0aGVyIGFuIG9wdGlvbiBncm91cCBzaG91bGQgYmUgdmlzaWJsZSBiYXNlZCBvbiBpdHMgYHdoZW5gIGV4cHJlc3Npb24uXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgb3B0aW9uIGdyb3VwIHNob3VsZCBiZSB2aXNpYmxlLCBmYWxzZSBvdGhlcndpc2UuXG5cdCAqL1xuXHRwcml2YXRlIGV2YWx1YXRlT3B0aW9uR3JvdXBWaXNpYmlsaXR5KG9wdGlvbkdyb3VwOiB7IGlkOiBzdHJpbmc7IHdoZW4/OiBzdHJpbmcgfSk6IGJvb2xlYW4ge1xuXHRcdGlmICghb3B0aW9uR3JvdXAud2hlbikge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIE5vIGNvbmRpdGlvbiBtZWFucyBhbHdheXMgdmlzaWJsZVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBObyBjb250ZXh0IGtleSBzZXJ2aWNlIHlldCwgZGVmYXVsdCB0byB2aXNpYmxlXG5cdFx0fVxuXG5cdFx0Y29uc3QgZXhwciA9IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKG9wdGlvbkdyb3VwLndoZW4pO1xuXHRcdGlmICghZXhwcikge1xuXHRcdFx0cmV0dXJuIHRydWU7IC8vIEludmFsaWQgZXhwcmVzc2lvbiBkZWZhdWx0cyB0byB2aXNpYmxlXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZXhwcik7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgd2hpY2ggb3B0aW9uIGdyb3VwcyBzaG91bGQgYmUgdmlzaWJsZSBmb3IgdGhlIGN1cnJlbnQgc2Vzc2lvbi5cblx0ICpcblx0ICogQSBwaWNrZXIgc2hvdWxkIHNob3cgaWYgYW5kIG9ubHkgaWY6XG5cdCAqIDEuIFdlIGNhbiBkZXRlcm1pbmUgYSBzZXNzaW9uIHR5cGUgKGZyb20gc2Vzc2lvbiBjb250ZXh0IE9SIGRlbGVnYXRlKVxuXHQgKiAyLiBUaGF0IHNlc3Npb24gdHlwZSBoYXMgb3B0aW9uIGdyb3VwcyByZWdpc3RlcmVkXG5cdCAqIDMuIEF0IGxlYXN0IG9uZSBvcHRpb24gZ3JvdXAgaGFzIGl0ZW1zIEFORCBwYXNzZXMgaXRzIGB3aGVuYCBjbGF1c2Vcblx0ICpcblx0ICogVGhpcyBtZXRob2QgYWxzbyB1cGRhdGVzIHRoZSBgY2hhdFNlc3Npb25IYXNPcHRpb25zYCBjb250ZXh0IGtleSwgd2hpY2ggY29udHJvbHNcblx0ICogd2hldGhlciB0aGUgcGlja2VyIGFjdGlvbiBpcyBzaG93biBpbiB0aGUgdG9vbGJhciB2aWEgaXRzIGB3aGVuYCBjbGF1c2UuXG5cdCAqL1xuXHRwcml2YXRlIGdldFZpc2libGVPcHRpb25Hcm91cHNNb2RlQW5kVXBkYXRlQ29udGV4dEtleXMoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10ge1xuXHRcdGNvbnN0IGN1c3RvbUFnZW50VGFyZ2V0ID0gc2Vzc2lvblJlc291cmNlICYmIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDdXN0b21BZ2VudFRhcmdldEZvclNlc3Npb25UeXBlKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uSGFzQ3VzdG9tQWdlbnRUYXJnZXQuc2V0KGN1c3RvbUFnZW50VGFyZ2V0ICE9PSBUYXJnZXQuVW5kZWZpbmVkKTtcblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgc2Vzc2lvbiB0eXBlIHJlcXVpcmVzIGN1c3RvbSBtb2RlbHNcblx0XHRjb25zdCByZXF1aXJlc0N1c3RvbU1vZGVscyA9IHNlc3Npb25SZXNvdXJjZSAmJiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UucmVxdWlyZXNDdXN0b21Nb2RlbHNGb3JTZXNzaW9uVHlwZShnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0dGhpcy5jaGF0U2Vzc2lvbkhhc1RhcmdldGVkTW9kZWxzLnNldCghIXJlcXVpcmVzQ3VzdG9tTW9kZWxzKTtcblxuXHRcdGNvbnN0IHZpc2libGVPcHRpb25Hcm91cHMgPSB0aGlzLmdldFZpc2libGVPcHRpb25Hcm91cHMoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXQ/LnJlZnJlc2goKTtcblx0XHRpZiAoIXZpc2libGVPcHRpb25Hcm91cHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmNoYXRTZXNzaW9uSGFzT3B0aW9ucy5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvbk9wdGlvbnNWYWxpZC5zZXQodHJ1ZSk7XG5cdFx0XHQvLyBTZXNzaW9uIHR5cGUgbWF5IGhhdmUgY2hhbmdlZCB3aGV0aGVyIGEgdXNhYmxlIG1vZGVsIGV4aXN0czsga2VlcFxuXHRcdFx0Ly8gdGhlIHNlbmQtZW5hYmxlbWVudCBjb250ZXh0IGtleSBpbiBzeW5jLlxuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRDb250ZW50Q29udGV4dEtleXMoKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBhbGxPcHRpb25zVmFsaWQgPSBzZXNzaW9uUmVzb3VyY2UgPyB0aGlzLmFyZUFsbE9wdGlvbnNWYWxpZChzZXNzaW9uUmVzb3VyY2UsIHZpc2libGVPcHRpb25Hcm91cHMpIDogdHJ1ZTtcblxuXHRcdHRoaXMuY2hhdFNlc3Npb25IYXNPcHRpb25zLnNldCh0cnVlKTtcblx0XHR0aGlzLmNoYXRTZXNzaW9uT3B0aW9uc1ZhbGlkLnNldChhbGxPcHRpb25zVmFsaWQpO1xuXG5cdFx0Ly8gU2Vzc2lvbiB0eXBlIG1heSBoYXZlIGNoYW5nZWQgd2hldGhlciBhIHVzYWJsZSBtb2RlbCBleGlzdHM7IGtlZXAgdGhlXG5cdFx0Ly8gc2VuZC1lbmFibGVtZW50IGNvbnRleHQga2V5IGluIHN5bmMuXG5cdFx0dGhpcy5fdXBkYXRlSW5wdXRDb250ZW50Q29udGV4dEtleXMoKTtcblxuXHRcdHJldHVybiB2aXNpYmxlT3B0aW9uR3JvdXBzO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCkge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUZXJtaW5hbENvbW1hbmRQcmVmaXgoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHQvLyBUaGUgdGVybWluYWwgY29tbWFuZCBwcmVmaXggaXMgYSBzdGF0aWMgcGVyLXNlc3Npb24tdHlwZSBjYXBhYmlsaXR5XG5cdFx0Ly8gYWR2ZXJ0aXNlZCBieSB0aGUgYWdlbnQgaG9zdC4gVGhlIGlucHV0IHVzZXMgaXQgKG9uIHRoZSBsaXZlIHRleHQpIHRvXG5cdFx0Ly8gc3dpdGNoIHRvIG1vbm9zcGFjZSBhbmQgd2FybiBvbiBjb21tYW5kIHBhc3Rlcy5cblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKTtcblx0XHRyZXR1cm4gc2Vzc2lvblJlc291cmNlID8gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENhcGFiaWxpdGllc0ZvclNlc3Npb25UeXBlKGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKT8udGVybWluYWxDb21tYW5kUHJlZml4IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbnB1dEVkaXRvckZvbnRGYW1pbHkoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pbnB1dEVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ29tbWFuZCA9IGlzVGVybWluYWxDb21tYW5kSW5wdXQodGhpcy5faW5wdXRFZGl0b3IuZ2V0TW9kZWwoKT8uZ2V0TGluZUNvbnRlbnQoMSkgfHwgJycsIHRoaXMuZ2V0VGVybWluYWxDb21tYW5kUHJlZml4KCkpO1xuXHRcdHRoaXMuX2lucHV0RWRpdG9yLnVwZGF0ZU9wdGlvbnMoeyBmb250RmFtaWx5OiBpc0NvbW1hbmQgPyBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5IDogREVGQVVMVF9GT05UX0ZBTUlMWSB9KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlVGVybWluYWxDb21tYW5kUGFzdGUoZTogQ2xpcGJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRoYW5kbGVUZXJtaW5hbENvbW1hbmRQYXN0ZShlLCB0aGlzLl9pbnB1dEVkaXRvciwgdGhpcy5nZXRUZXJtaW5hbENvbW1hbmRQcmVmaXgoKSwgdGhpcy5kaWFsb2dTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXJlQWxsT3B0aW9uc1ZhbGlkKHNlc3Npb25SZXNvdXJjZTogVVJJLCB2aXNpYmxlT3B0aW9uR3JvdXBzOiByZWFkb25seSBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10pOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IG9wdGlvbkdyb3VwIG9mIHZpc2libGVPcHRpb25Hcm91cHMpIHtcblx0XHRcdGNvbnN0IGN1cnJlbnRPcHRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbkdyb3VwLmlkKTtcblx0XHRcdGlmIChjdXJyZW50T3B0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRPcHRpb25JZCA9IHR5cGVvZiBjdXJyZW50T3B0aW9uID09PSAnc3RyaW5nJyA/IGN1cnJlbnRPcHRpb24gOiBjdXJyZW50T3B0aW9uLmlkO1xuXHRcdFx0XHQvLyBUT0RPOiBAb3NvcnRlZ2EgQGpvc2hzcGljZXIgc2hvdWxkIHdlIGFkZCBhIGBwbGFjZUhvbGRlcmAgaXRlbSB0byBvcHRpb24gZ3JvdXBzIHRvIHN0cmFpZ2h0ZW4gdGhpcyBjaGVjaz9cblx0XHRcdFx0aWYgKCFvcHRpb25Hcm91cC5pdGVtcy5zb21lKGl0ZW0gPT4gaXRlbS5pZCA9PT0gY3VycmVudE9wdGlvbklkKSAmJiB0eXBlb2YgY3VycmVudE9wdGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbE9wdGlvbnNHcm91cHMoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10ge1xuXHRcdC8vIC0gUGFuZWwvRWRpdG9yOiBVc2UgYWN0dWFsIHNlc3Npb24ncyB0eXBlIChjdHggYXZhaWxhYmxlKVxuXHRcdC8vIC0gV2VsY29tZSB2aWV3OiBVc2UgZGVsZWdhdGUncyB0eXBlIChjdHggbWF5IG5vdCBleGlzdCB5ZXQpXG5cdFx0Y29uc3QgZGVsZWdhdGVTZXNzaW9uVHlwZSA9IHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI/LigpO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZVNlc3Npb25UeXBlID0gZGVsZWdhdGVTZXNzaW9uVHlwZSA/PyAoc2Vzc2lvblJlc291cmNlID8gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghZWZmZWN0aXZlU2Vzc2lvblR5cGUpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBTdGVwIDI6IEdldCBvcHRpb24gZ3JvdXBzIGZvciB0aGlzIHNlc3Npb24gdHlwZVxuXHRcdGNvbnN0IGFsbE9wdGlvbkdyb3VwcyA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRPcHRpb25Hcm91cHNGb3JTZXNzaW9uVHlwZShlZmZlY3RpdmVTZXNzaW9uVHlwZSk7XG5cdFx0cmV0dXJuIGFsbE9wdGlvbkdyb3VwcyA/PyBbXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VmlzaWJsZU9wdGlvbkdyb3VwcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSB7XG5cdFx0Y29uc3QgYWxsT3B0aW9uR3JvdXBzID0gdGhpcy5nZXRBbGxPcHRpb25zR3JvdXBzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFhbGxPcHRpb25Hcm91cHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGNvbnRleHQga2V5cyB3aXRoIGN1cnJlbnQgb3B0aW9uIHZhbHVlcyBiZWZvcmUgZXZhbHVhdGluZyBgd2hlbmAgY2xhdXNlcy5cblx0XHQvLyBUaGlzIGVuc3VyZXMgaW50ZXJkZXBlbmRlbnQgYHdoZW5gIGV4cHJlc3Npb25zIHdvcmsgY29ycmVjdGx5LlxuXHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdGZvciAoY29uc3Qgb3B0aW9uR3JvdXAgb2YgYWxsT3B0aW9uR3JvdXBzKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRPcHRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbkdyb3VwLmlkKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRPcHRpb24pIHtcblx0XHRcdFx0XHRjb25zdCBvcHRpb25JZCA9IHR5cGVvZiBjdXJyZW50T3B0aW9uID09PSAnc3RyaW5nJyA/IGN1cnJlbnRPcHRpb24gOiBjdXJyZW50T3B0aW9uLmlkO1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlT3B0aW9uQ29udGV4dEtleShvcHRpb25Hcm91cC5pZCwgb3B0aW9uSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlsdGVyIHRvIHZpc2libGUgZ3JvdXBzIChoYXMgaXRlbXMgQU5EIHBhc3NlcyBgd2hlbmAgY2xhdXNlIEFORCBzZXNzaW9uIGhhcyBvcHRpb24gY29uZmlndXJlZCkuXG5cdFx0Ly8gUGVybWlzc2lvbnMta2luZCBncm91cHMgYXJlIG5vdCByZW5kZXJlZCBhcyBzdGFuZGFsb25lIHBpY2tlcnM7IHRoZWlyIGl0ZW1zIGFyZSBzdXJmYWNlZFxuXHRcdC8vIGluc2lkZSB0aGUgY2hhdCBwZXJtaXNzaW9uIHBpY2tlciBpbnN0ZWFkIChzZWUgYGdldEFjdGl2ZUV4dGVuc2lvblBlcm1pc3Npb25Hcm91cGApLlxuXHRcdGNvbnN0IHZpc2libGVHcm91cHMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cD4oKTtcblx0XHRmb3IgKGNvbnN0IG9wdGlvbkdyb3VwIG9mIGFsbE9wdGlvbkdyb3Vwcykge1xuXHRcdFx0aWYgKG9wdGlvbkdyb3VwLmtpbmQgPT09ICdwZXJtaXNzaW9ucycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBoYXNJdGVtcyA9IG9wdGlvbkdyb3VwLml0ZW1zLmxlbmd0aCA+IDAgfHwgKG9wdGlvbkdyb3VwLmNvbW1hbmRzIHx8IFtdKS5sZW5ndGggPiAwO1xuXHRcdFx0Y29uc3QgcGFzc2VzV2hlbkNsYXVzZSA9IHRoaXMuZXZhbHVhdGVPcHRpb25Hcm91cFZpc2liaWxpdHkob3B0aW9uR3JvdXApO1xuXG5cdFx0XHQvLyBPbmx5IHNob3cgcGlja2VyIGlmIHRoZSBzZXNzaW9uIGhhcyB0aGlzIG9wdGlvbiBjb25maWd1cmVkIG9uY2UgYSByZWFsIHNlc3Npb24gZXhpc3RzLlxuXHRcdFx0Ly8gSW4gdGhlIHdlbGNvbWUgdmlldyAobm8gYGN0eGAgeWV0KSwgdHJlYXQgZ3JvdXBzIGFzIGVsaWdpYmxlIHNvIHRoZXkgY2FuIGJlIHJlbmRlcmVkLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkhhc09wdGlvbiA9ICFzZXNzaW9uUmVzb3VyY2UgfHwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlLCBvcHRpb25Hcm91cC5pZCkgIT09IHVuZGVmaW5lZDtcblxuXHRcdFx0aWYgKGhhc0l0ZW1zICYmIHBhc3Nlc1doZW5DbGF1c2UgJiYgc2Vzc2lvbkhhc09wdGlvbikge1xuXHRcdFx0XHR2aXNpYmxlR3JvdXBzLnNldChvcHRpb25Hcm91cC5pZCwgb3B0aW9uR3JvdXApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBBcnJheS5mcm9tKHZpc2libGVHcm91cHMudmFsdWVzKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHBlcm1pc3Npb25zLWtpbmQgb3B0aW9uIGdyb3VwIGNvbnRyaWJ1dGVkIGJ5IHRoZSBhY3RpdmUgc2Vzc2lvbiBwcm92aWRlciwgaWYgYW55LlxuXHQgKiBJdGVtcyBmcm9tIHRoaXMgZ3JvdXAgYXJlIHN1cmZhY2VkIGluc2lkZSB0aGUgY2hhdCBwZXJtaXNzaW9uIHBpY2tlciwgcmVwbGFjaW5nIHRoZVxuXHQgKiBidWlsdC1pbiBgQ2hhdFBlcm1pc3Npb25MZXZlbGAgaXRlbXMuIEhvbm9ycyB0aGUgc2FtZSB2aXNpYmlsaXR5IHByZWRpY2F0ZXMgYXNcblx0ICoge0BsaW5rIGdldFZpc2libGVPcHRpb25Hcm91cHN9IHNvIHRoYXQgYHdoZW5gIGNsYXVzZXMgYXJlIHJlc3BlY3RlZC5cblx0ICpcblx0ICogSWYgdGhlIHByb3ZpZGVyIGRlY2xhcmVzIG1vcmUgdGhhbiBvbmUgcGVybWlzc2lvbnMta2luZCBncm91cCAod2hpY2ggdGhlIEFQSSBmb3JiaWRzKSxcblx0ICogdGhlIGZpcnN0IG9uZSB3aW5zLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRBY3RpdmVFeHRlbnNpb25QZXJtaXNzaW9uR3JvdXAoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhbGxPcHRpb25Hcm91cHMgPSB0aGlzLmdldEFsbE9wdGlvbnNHcm91cHMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRyZXR1cm4gYWxsT3B0aW9uR3JvdXBzLmZpbmQoZyA9PlxuXHRcdFx0Zy5raW5kID09PSAncGVybWlzc2lvbnMnXG5cdFx0XHQmJiBnLml0ZW1zLmxlbmd0aCA+IDBcblx0XHRcdCYmIHRoaXMuZXZhbHVhdGVPcHRpb25Hcm91cFZpc2liaWxpdHkoZylcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZnJlc2ggYWxsIHJlZ2lzdGVyZWQgb3B0aW9uIGdyb3VwcyBmb3IgdGhlIGN1cnJlbnQgY2hhdCBzZXNzaW9uLlxuXHQgKiBGaXJlcyBldmVudHMgZm9yIGVhY2ggb3B0aW9uIGdyb3VwIHdpdGggdGhlaXIgY3VycmVudCBzZWxlY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlZnJlc2hDaGF0U2Vzc2lvblBpY2tlcnMoKTogdm9pZCB7XG5cdFx0Ly8gVXNlIHRoZSBzaGFyZWQgaGVscGVyIHRvIGNvbXB1dGUgdmlzaWJpbGl0eSBhbmQgdXBkYXRlIGNvbnRleHQga2V5c1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuZ2V0Q3VycmVudFNlc3Npb25SZXNvdXJjZSgpO1xuXHRcdGNvbnN0IGFsbE9wdGlvbnNHcm91cHMgPSB0aGlzLmdldEFsbE9wdGlvbnNHcm91cHMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCB2aXNpYmxlT3B0aW9uR3JvdXBzID0gdGhpcy5nZXRWaXNpYmxlT3B0aW9uR3JvdXBzTW9kZUFuZFVwZGF0ZUNvbnRleHRLZXlzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFhbGxPcHRpb25zR3JvdXBzLmxlbmd0aCB8fCAhdmlzaWJsZU9wdGlvbkdyb3Vwcy5sZW5ndGgpIHtcblx0XHRcdC8vIE5vIHZpc2libGUgb3B0aW9ucyAtIGhlbHBlciBhbHJlYWR5IHVwZGF0ZWQgY29udGV4dCBrZXlzXG5cdFx0XHR0aGlzLmhpZGVBbGxTZXNzaW9uUGlja2VyV2lkZ2V0cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHdpZGdldHMgbmVlZCByZWNyZWF0aW9uIChkaWZmZXJlbnQgc2V0IG9mIHZpc2libGUgZ3JvdXBzKVxuXHRcdGNvbnN0IGN1cnJlbnRXaWRnZXRHcm91cElkcyA9IG5ldyBTZXQodGhpcy5jaGF0U2Vzc2lvblBpY2tlcldpZGdldHMua2V5cygpKTtcblx0XHRjb25zdCBuZWVkc1JlY3JlYXRpb24gPVxuXHRcdFx0Y3VycmVudFdpZGdldEdyb3VwSWRzLnNpemUgIT09IHZpc2libGVPcHRpb25Hcm91cHMubGVuZ3RoIHx8XG5cdFx0XHQhdmlzaWJsZU9wdGlvbkdyb3Vwcy5ldmVyeShncm91cCA9PiBjdXJyZW50V2lkZ2V0R3JvdXBJZHMuaGFzKGdyb3VwLmlkKSk7XG5cblx0XHRpZiAobmVlZHNSZWNyZWF0aW9uICYmIHRoaXMuX2xhc3RTZXNzaW9uUGlja2VyQWN0aW9uICYmIHRoaXMuY2hhdFNlc3Npb25QaWNrZXJDb250YWluZXIpIHtcblx0XHRcdGNvbnN0IHdpZGdldHMgPSB0aGlzLmNyZWF0ZUNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cyh0aGlzLl9sYXN0U2Vzc2lvblBpY2tlckFjdGlvbiwgdGhpcy5fbGFzdFNlc3Npb25QaWNrZXJPcHRpb25zKTtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5jaGF0U2Vzc2lvblBpY2tlckNvbnRhaW5lcik7XG5cdFx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB3aWRnZXRzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvbS4kKCcuYWN0aW9uLWl0ZW0uY2hhdC1zZXNzaW9uUGlja2VyLWl0ZW0nKTtcblx0XHRcdFx0d2lkZ2V0LnJlbmRlcihjb250YWluZXIpO1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uUGlja2VyQ29udGFpbmVyLmFwcGVuZENoaWxkKGNvbnRhaW5lcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY2hhdFNlc3Npb25QaWNrZXJDb250YWluZXIpIHtcblx0XHRcdHRoaXMuY2hhdFNlc3Npb25QaWNrZXJDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblxuXHRcdC8vIEZpcmUgb3B0aW9uIGNoYW5nZSBldmVudHMgZm9yIGV4aXN0aW5nIHdpZGdldHMgdG8gc3luYyB0aGVpciBzdGF0ZVxuXHRcdC8vIChvbmx5IGlmIHdlIGhhdmUgYSBzZXNzaW9uIGNvbnRleHQgLSBpbiB3ZWxjb21lIHZpZXcsIG9wdGlvbnMgYXJlbid0IHBlcnNpc3RlZCB5ZXQpXG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Zm9yIChjb25zdCBbb3B0aW9uR3JvdXBJZF0gb2YgdGhpcy5jaGF0U2Vzc2lvblBpY2tlcldpZGdldHMpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudE9wdGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgb3B0aW9uR3JvdXBJZCk7XG5cdFx0XHRcdGlmIChjdXJyZW50T3B0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3B0aW9uR3JvdXAgPSBhbGxPcHRpb25zR3JvdXBzLmZpbmQoZyA9PiBnLmlkID09PSBvcHRpb25Hcm91cElkKTtcblx0XHRcdFx0XHRpZiAob3B0aW9uR3JvdXApIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRPcHRpb25JZCA9IHR5cGVvZiBjdXJyZW50T3B0aW9uID09PSAnc3RyaW5nJyA/IGN1cnJlbnRPcHRpb24gOiBjdXJyZW50T3B0aW9uLmlkO1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbSA9IG9wdGlvbkdyb3VwLml0ZW1zLmZpbmQoKG06IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbSkgPT4gbS5pZCA9PT0gY3VycmVudE9wdGlvbklkKTtcblx0XHRcdFx0XHRcdC8vIElmIGN1cnJlbnRPcHRpb24gaXMgYW4gb2JqZWN0IChub3QgYSBzdHJpbmcgSUQpLCBpdCByZXByZXNlbnRzIGEgY29tcGxldGUgb3B0aW9uIGl0ZW0gYW5kIHNob3VsZCBiZSB1c2VkIGRpcmVjdGx5LlxuXHRcdFx0XHRcdFx0Ly8gT3RoZXJ3aXNlLCBpZiBpdCdzIGEgc3RyaW5nIElELCBsb29rIHVwIHRoZSBjb3JyZXNwb25kaW5nIGl0ZW0gYW5kIHVzZSB0aGF0LlxuXHRcdFx0XHRcdFx0aWYgKGl0ZW0gJiYgdHlwZW9mIGN1cnJlbnRPcHRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuZ2V0T3JDcmVhdGVPcHRpb25FbWl0dGVyKG9wdGlvbkdyb3VwSWQpLmZpcmUoaXRlbSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBjdXJyZW50T3B0aW9uICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmdldE9yQ3JlYXRlT3B0aW9uRW1pdHRlcihvcHRpb25Hcm91cElkKS5maXJlKGN1cnJlbnRPcHRpb24pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoaWRlQWxsU2Vzc2lvblBpY2tlcldpZGdldHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2hhdFNlc3Npb25QaWNrZXJDb250YWluZXIpIHtcblx0XHRcdHRoaXMuY2hhdFNlc3Npb25QaWNrZXJDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBjdXJyZW50IG9wdGlvbiBmb3IgYSBzcGVjaWZpYyBvcHRpb24gZ3JvdXAuXG5cdCAqIFJldHVybnMgdW5kZWZpbmVkIGlmIHRoZSBzZXNzaW9uIGRvZXNuJ3QgaGF2ZSB0aGlzIG9wdGlvbiBjb25maWd1cmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRDdXJyZW50T3B0aW9uRm9yR3JvdXAob3B0aW9uR3JvdXBJZDogc3RyaW5nKTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdGlmICghc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSByZXR1cm4gYW4gb3B0aW9uIGlmIHRoZSBzZXNzaW9uIGhhcyBpdCBjb25maWd1cmVkXG5cdFx0aWYgKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgb3B0aW9uR3JvdXBJZCkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVmZmVjdGl2ZVNlc3Npb25UeXBlID0gdGhpcy5nZXRFZmZlY3RpdmVTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IG9wdGlvbkdyb3VwcyA9IGVmZmVjdGl2ZVNlc3Npb25UeXBlID8gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKGVmZmVjdGl2ZVNlc3Npb25UeXBlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcHRpb25Hcm91cCA9IG9wdGlvbkdyb3Vwcz8uZmluZChnID0+IGcuaWQgPT09IG9wdGlvbkdyb3VwSWQpO1xuXHRcdGlmICghb3B0aW9uR3JvdXAgfHwgb3B0aW9uR3JvdXAuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudE9wdGlvblZhbHVlID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlLCBvcHRpb25Hcm91cElkKTtcblx0XHRpZiAoIWN1cnJlbnRPcHRpb25WYWx1ZSkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdEl0ZW0gPSBvcHRpb25Hcm91cC5pdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5kZWZhdWx0KTtcblx0XHRcdHJldHVybiBkZWZhdWx0SXRlbTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIGN1cnJlbnRPcHRpb25WYWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRPcHRpb25JZCA9IGN1cnJlbnRPcHRpb25WYWx1ZS50cmltKCk7XG5cdFx0XHRyZXR1cm4gb3B0aW9uR3JvdXAuaXRlbXMuZmluZChtID0+IG0uaWQgPT09IG5vcm1hbGl6ZWRPcHRpb25JZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBjdXJyZW50T3B0aW9uVmFsdWUgYXMgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSBoYXNXb3Jrc3BhY2VTY21SZXBvc2l0b3J5KCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0aWYgKGZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcmVwbyBvZiB0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAocmVwby5wcm92aWRlci5yb290VXJpICYmIHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlcG8ucHJvdmlkZXIucm9vdFVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RWZmZWN0aXZlU2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyPy4oKSA/PyAoc2Vzc2lvblJlc291cmNlID8gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGFnZW50U2Vzc2lvblR5cGUgY29udGV4dCBrZXkgYmFzZWQgb24gZGVsZWdhdGUgb3IgYWN0dWFsIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZUFnZW50U2Vzc2lvblR5cGVDb250ZXh0S2V5KCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cblx0XHQvLyBEZXRlcm1pbmUgZWZmZWN0aXZlIHNlc3Npb24gdHlwZTpcblx0XHQvLyAtIElmIHdlIGhhdmUgYSBkZWxlZ2F0ZSB3aXRoIGEgc2V0dGVyIChlLmcuLCB3ZWxjb21lIHBhZ2UpLCB1c2UgdGhlIGRlbGVnYXRlJ3Mgc2Vzc2lvbiB0eXBlXG5cdFx0Ly8gLSBPdGhlcndpc2UsIHVzZSB0aGUgYWN0dWFsIHNlc3Npb24ncyB0eXBlXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSB0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZTtcblx0XHRjb25zdCBkZWxlZ2F0ZVNlc3Npb25UeXBlID0gZGVsZWdhdGU/LnNldEFjdGl2ZVNlc3Npb25Qcm92aWRlciAmJiBkZWxlZ2F0ZT8uZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyPy4oKTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGRlbGVnYXRlU2Vzc2lvblR5cGUgfHwgKHNlc3Npb25SZXNvdXJjZSA/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpIDogJycpO1xuXG5cdFx0dGhpcy5hZ2VudFNlc3Npb25UeXBlS2V5LnNldChzZXNzaW9uVHlwZSk7XG5cdFx0dGhpcy5jaGF0U2Vzc2lvblN1cHBvcnRzRGVsZWdhdGlvbktleS5zZXQodGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLnN1cHBvcnRzRGVsZWdhdGlvbkZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgd2lkZ2V0IGxvY2sgc3RhdGUgYmFzZWQgb24gYSBzZXNzaW9uIHR5cGUuXG5cdCAqIExvY2FsIHNlc3Npb25zIHVubG9jayBmcm9tIGNvZGluZyBhZ2VudCBtb2RlLCB3aGlsZSByZW1vdGUvY2xvdWQgc2Vzc2lvbnMgbG9jayB0byBjb2RpbmcgYWdlbnQgbW9kZS5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlV2lkZ2V0TG9ja1N0YXRlRnJvbVNlc3Npb25UeXBlKHNlc3Npb25UeXBlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoc2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQ/LnVubG9ja0Zyb21Db2RpbmdBZ2VudCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihzZXNzaW9uVHlwZSk7XG5cdFx0aWYgKGNvbnRyaWJ1dGlvbikge1xuXHRcdFx0dGhpcy5fd2lkZ2V0Py5sb2NrVG9Db2RpbmdBZ2VudChjb250cmlidXRpb24ubmFtZSwgY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lLCBjb250cmlidXRpb24udHlwZSwgY29udHJpYnV0aW9uLmFnZW50SG9zdFByb3ZpZGVySWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93aWRnZXQ/LnVubG9ja0Zyb21Db2RpbmdBZ2VudCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgc2Vzc2lvbiB0eXBlIG9mIHRoZSBhY3RpdmUgY2hhdCBzZXNzaW9uIGZvciB0aGUgZGVsZWdhdGlvbiBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIGdldEFjdGl2ZVNlc3Npb25UeXBlRm9yRGVsZWdhdGlvbigpOiBBZ2VudFNlc3Npb25UYXJnZXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Ly8gVE9ETzogUmVtb3ZlIGhhcmRjb2RlZCBwcm92aWRlcnMgZnJvbSBjb3JlXG5cdFx0cmV0dXJuIHNlc3Npb25SZXNvdXJjZSA/IChnZXRBZ2VudFNlc3Npb25Qcm92aWRlcihzZXNzaW9uUmVzb3VyY2UpID8/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWxlY3RzIChvciBjbGVhcnMpIHRoZSBwZW5kaW5nIGRlbGVnYXRpb24gdGFyZ2V0LiBXaGlsZSBhIHRhcmdldCBpcyBwZW5kaW5nLCB0aGUgd2lkZ2V0XG5cdCAqIGxvY2tzIHRvIHRoZSB0YXJnZXQgYWdlbnQgYW5kIHRoZSBgaGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXRgIGNvbnRleHQga2V5IGhpZGVzIHRoZVxuXHQgKiBhZ2VudCBhbmQgbW9kZWwgcGlja2Vycy4gUmUtc2VsZWN0aW5nIHRoZSBhY3RpdmUgc2Vzc2lvbiBjbGVhcnMgdGhlIHBlbmRpbmcgdGFyZ2V0IGFuZFxuXHQgKiByZXN0b3JlcyB0aGUgcGlja2Vycy5cblx0ICovXG5cdHB1YmxpYyBjb250aW51ZUluU2Vzc2lvbihwcm92aWRlcjogQWdlbnRTZXNzaW9uVGFyZ2V0KTogdm9pZCB7XG5cdFx0dGhpcy5zZXRQZW5kaW5nRGVsZWdhdGlvblRhcmdldChwcm92aWRlcik7XG5cdFx0dGhpcy5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRQZW5kaW5nRGVsZWdhdGlvblRhcmdldChwcm92aWRlcjogQWdlbnRTZXNzaW9uVGFyZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3QgaXNBY3RpdmUgPSB0aGlzLmdldEFjdGl2ZVNlc3Npb25UeXBlRm9yRGVsZWdhdGlvbigpID09PSBwcm92aWRlcjtcblx0XHR0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldCA9IGlzQWN0aXZlID8gdW5kZWZpbmVkIDogcHJvdmlkZXI7XG5cdFx0dGhpcy5jaGF0SGFzUGVuZGluZ0RlbGVnYXRpb25UYXJnZXRLZXkuc2V0KCEhdGhpcy5fcGVuZGluZ0RlbGVnYXRpb25UYXJnZXQpO1xuXHRcdHRoaXMudXBkYXRlV2lkZ2V0TG9ja1N0YXRlRnJvbVNlc3Npb25UeXBlKHByb3ZpZGVyKTtcblx0XHR0aGlzLnVwZGF0ZUFnZW50U2Vzc2lvblR5cGVDb250ZXh0S2V5KCk7XG5cdFx0dGhpcy5yZWZyZXNoQ2hhdFNlc3Npb25QaWNrZXJzKCk7XG5cdH1cblxuXHQvKipcblx0ICogRW5zdXJlcyB0aGUgbm90aWZpY2F0aW9uIHdpZGdldCBpcyBpbnN0YW50aWF0ZWQgYW5kIGFwcGVuZGVkIHRvIHRoZSBub3RpZmljYXRpb24gY29udGFpbmVyLlxuXHQgKi9cblx0cHJpdmF0ZSBlbnN1cmVOb3RpZmljYXRpb25XaWRnZXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9ub3RpZmljYXRpb25XaWRnZXQudmFsdWUpIHtcblx0XHRcdC8vIEZhbGwgYmFjayB0byBgZ2V0Q3VycmVudFNlc3Npb25UeXBlKClgIHNvIHRoZSBzZXNzaW9uLXR5cGVcblx0XHRcdC8vIHBpY2tlciBkZWxlZ2F0ZSBpcyBjb25zdWx0ZWQgYmVmb3JlIGFueSByZWFsIHNlc3Npb24gZXhpc3RzXG5cdFx0XHQvLyAoZS5nLiBlbXB0eSB3b3Jrc3BhY2UgKyBDb3BpbG90IENMSSBbQWdlbnQgSG9zdF0gc2VsZWN0ZWQpLiBXaXRob3V0XG5cdFx0XHQvLyB0aGlzIGZhbGxiYWNrLCBgX2N1cnJlbnRTZXNzaW9uVHlwZWAgc3RheXMgdW5kZWZpbmVkIHVudGlsXG5cdFx0XHQvLyB0aGUgdXNlciBjcmVhdGVzIGEgc2Vzc2lvbiBhbmQgYHNlc3Npb25UeXBlc2AtZ2F0ZWRcblx0XHRcdC8vIG5vdGlmaWNhdGlvbnMgbmV2ZXIgcmVuZGVyLlxuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uV2lkZ2V0LnZhbHVlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQsIHtcblx0XHRcdFx0bW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGU6IHRoaXMuX25vdGlmaWNhdGlvbk1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHRoaXMuX2N1cnJlbnRTZXNzaW9uUmVzb3VyY2VPYnNlcnZhYmxlLFxuXHRcdFx0XHRvcGVuTW9kZWxQaWNrZXI6ICgpID0+IHRoaXMub3Blbk1vZGVsUGlja2VyKCksXG5cdFx0XHRcdHN3aXRjaFRvTW9kZWw6IG1vZGVsSWRlbnRpZmllciA9PiB0aGlzLnN3aXRjaE1vZGVsQnlJZGVudGlmaWVyKG1vZGVsSWRlbnRpZmllciwgLyogc3RvcmVTZWxlY3Rpb24gKi8gdHJ1ZSwgLyogaXNVc2VyQWN0aW9uICovIHRydWUpLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmNoYXRJbnB1dE5vdGlmaWNhdGlvbkNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9ub3RpZmljYXRpb25XaWRnZXQudmFsdWUuZG9tTm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIExhenktaW5zdGFudGlhdGUgdGhlIGdvYWwgYmFubmVyIHdpZGdldCBvbiBmaXJzdCB1c2UuXG5cdCAqL1xuXHRwcml2YXRlIGVuc3VyZUdvYWxCYW5uZXJXaWRnZXQoKTogQ2hhdEdvYWxCYW5uZXJXaWRnZXQge1xuXHRcdGlmICghdGhpcy5fZ29hbEJhbm5lcldpZGdldC52YWx1ZSkge1xuXHRcdFx0Ly8gVGhlIGBfZ29hbEJhbm5lcldpZGdldGAgTXV0YWJsZURpc3Bvc2FibGUgb3ducyBhbmQgZGlzcG9zZXMgdGhlIHdpZGdldDtcblx0XHRcdC8vIGRvIG5vdCBhbHNvIGBfcmVnaXN0ZXJgIGl0IGhlcmUgdG8gYXZvaWQgYSBkb3VibGUtZGlzcG9zZS5cblx0XHRcdGNvbnN0IHdpZGdldCA9IG5ldyBDaGF0R29hbEJhbm5lcldpZGdldCgpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIod2lkZ2V0Lm9uRGlzbWlzcygoKSA9PiB0aGlzLl9vbkRpZERpc21pc3NHb2FsQmFubmVyLmZpcmUoKSkpO1xuXHRcdFx0dGhpcy5fZ29hbEJhbm5lcldpZGdldC52YWx1ZSA9IHdpZGdldDtcblx0XHRcdHRoaXMuY2hhdEdvYWxCYW5uZXJDb250YWluZXIuYXBwZW5kQ2hpbGQod2lkZ2V0LmRvbU5vZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ29hbEJhbm5lcldpZGdldC52YWx1ZTtcblx0fVxuXG5cdC8qKiBTaG93cyB0aGUgYXV0b3BpbG90IGdvYWwgYmFubmVyIHdpdGggYSBsb2FkaW5nIHN0YXRlLiAqL1xuXHRzaG93R29hbEJhbm5lckxvYWRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5lbnN1cmVHb2FsQmFubmVyV2lkZ2V0KCkuc2V0TG9hZGluZygpO1xuXHR9XG5cblx0LyoqIFVwZGF0ZXMgdGhlIGdvYWwgYmFubmVyIHdpdGggdGhlIGdpdmVuIHN1bW1hcnkgdGV4dC4gKi9cblx0c2V0R29hbEJhbm5lcihzdW1tYXJ5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmVuc3VyZUdvYWxCYW5uZXJXaWRnZXQoKS5zZXRHb2FsKHN1bW1hcnkpO1xuXHR9XG5cblx0LyoqIEhpZGVzIHRoZSBnb2FsIGJhbm5lci4gKi9cblx0Y2xlYXJHb2FsQmFubmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2dvYWxCYW5uZXJXaWRnZXQudmFsdWU/LmNsZWFyKCk7XG5cdH1cblxuXHQvKipcblx0ICogU2hvd3MgdGhlIGNvbnRleHQgdXNhZ2UgZGV0YWlscyBwb3B1cCBhbmQgZm9jdXNlcyBpdC5cblx0ICogQHJldHVybnMgV2hldGhlciB0aGUgZGV0YWlscyB3ZXJlIHN1Y2Nlc3NmdWxseSBzaG93bi5cblx0ICovXG5cdHNob3dDb250ZXh0VXNhZ2VEZXRhaWxzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbnRleHRVc2FnZVdpZGdldD8uc2hvd0RldGFpbHMoKSA/PyBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSBjb250ZXh0IHVzYWdlIHdpZGdldCBiYXNlZCBvbiB0aGUgY3VycmVudCBtb2RlbC5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlQ29udGV4dFVzYWdlV2lkZ2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRleHRVc2FnZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5tb2RlbDtcblx0XHRpZiAoIW1vZGVsIHx8ICF0aGlzLmNvbnRleHRVc2FnZVdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuX2NvbnRleHRVc2FnZURpc3Bvc2FibGVzLnZhbHVlID0gc3RvcmU7XG5cdFx0bGV0IGxhc3RSZXF1ZXN0ID0gbW9kZWwubGFzdFJlcXVlc3Q7XG5cdFx0Y29uc3Qgb2JzZXJ2ZVByZXZpb3VzUmVzcG9uc2UgPSAocmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0Py5yZXNwb25zZSkge1xuXHRcdFx0XHRzdG9yZS5hZGQocmVxdWVzdC5yZXNwb25zZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLmNvbnRleHRVc2FnZVdpZGdldD8udXBkYXRlU2Vzc2lvbkNvc3QobW9kZWwuc2Vzc2lvbkNvc3QpKSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2YgbW9kZWwuZ2V0UmVxdWVzdHMoKS5zbGljZSgwLCAtMSkpIHtcblx0XHRcdG9ic2VydmVQcmV2aW91c1Jlc3BvbnNlKHJlcXVlc3QpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZChtb2RlbC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmtpbmQgPT09ICdhZGRSZXF1ZXN0Jykge1xuXHRcdFx0XHRvYnNlcnZlUHJldmlvdXNSZXNwb25zZShsYXN0UmVxdWVzdCk7XG5cdFx0XHRcdGxhc3RSZXF1ZXN0ID0gZS5yZXF1ZXN0O1xuXHRcdFx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldD8udXBkYXRlKG1vZGVsLmxhc3RSZXF1ZXN0KTtcblx0XHRcdH0gZWxzZSBpZiAoZS5raW5kID09PSAnY29tcGxldGVkUmVxdWVzdCcpIHtcblx0XHRcdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQ/LnVwZGF0ZShtb2RlbC5sYXN0UmVxdWVzdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmUtcmVuZGVyIHdoZW4gbGFuZ3VhZ2UgbW9kZWxzIGFycml2ZSAobmVlZGVkIG9uIHJlbG9hZCBcdTIwMTQgbW9kZWxcblx0XHQvLyBtZXRhZGF0YSBwcm92aWRpbmcgY29udGV4dCB3aW5kb3cgc2l6ZSBtYXkgbm90IGJlIHJlZ2lzdGVyZWQgeWV0KS5cblx0XHRzdG9yZS5hZGQodGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2Uub25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscygoKSA9PiB7XG5cdFx0XHRjb25zdCBsYXN0UmVxdWVzdCA9IG1vZGVsLmxhc3RSZXF1ZXN0O1xuXHRcdFx0aWYgKGxhc3RSZXF1ZXN0Py5tb2RlbElkKSB7XG5cdFx0XHRcdHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Py51cGRhdGUobGFzdFJlcXVlc3QpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEluaXRpYWwgdXBkYXRlXG5cdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQudXBkYXRlKG1vZGVsLmxhc3RSZXF1ZXN0KTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlVmlld01vZGVsQ2hhbmdlKGU6IElDaGF0V2lkZ2V0Vmlld01vZGVsQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHR0cmFuc2FjdGlvbihvYnNlcnZhYmxlVHJhbnNhY3Rpb24gPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy51cGRhdGVJbnB1dEVkaXRvckZvbnRGYW1pbHkoKTtcblx0XHRcdFx0dGhpcy5yZXNldFBlbmRpbmdEZWxlZ2F0aW9uRm9yVmlld01vZGVsQ2hhbmdlKG9ic2VydmFibGVUcmFuc2FjdGlvbik7XG5cdFx0XHRcdHRoaXMucmVmcmVzaFZpZXdNb2RlbFNjb3BlZFN0YXRlKCk7XG5cdFx0XHRcdHRoaXMuY2xlYXJRdWVzdGlvbkNhcm91c2VsSWZTZXNzaW9uQ2hhbmdlZChlKTtcblx0XHRcdFx0dGhpcy5jbGVhclBsYW5SZXZpZXdJZlNlc3Npb25DaGFuZ2VkKGUpO1xuXHRcdFx0XHQvLyBTd2FwIHRoZSB2aXNpYmxlIHRvb2wgY29uZmlybWF0aW9uIGNhcm91c2VsIGZvciB0aGUgbmV3IHNlc3Npb25cblx0XHRcdFx0dGhpcy5fc3luY1Rvb2xDb25maXJtYXRpb25DYXJvdXNlbEZvclNlc3Npb24oKTtcblx0XHRcdFx0dGhpcy5yZWNvbmNpbGVTZXNzaW9uVHlwZUZvclZpZXdNb2RlbENoYW5nZShlLCBvYnNlcnZhYmxlVHJhbnNhY3Rpb24pO1xuXHRcdFx0XHQvLyBGb3IgY29udHJpYnV0ZWQgc2Vzc2lvbnMgd2l0aCBoaXN0b3J5LCBwcmUtc2VsZWN0IHRoZSBtb2RlbFxuXHRcdFx0XHQvLyBmcm9tIHRoZSBsYXN0IHJlcXVlc3Qgc28gdGhlIHVzZXIgcmVzdW1lcyB3aXRoIHRoZSBzYW1lIG1vZGVsLlxuXHRcdFx0XHR0aGlzLnByZXNlbGVjdE1vZGVsRnJvbVNlc3Npb25IaXN0b3J5KCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHQvLyBBbHdheXMgZmluaXNoIHRoZSBzZXNzaW9uIHN3aXRjaCwgZXZlbiBvbiBhbiBleGNlcHRpb24gYmVmb3JlIHRoaXMgcG9pbnQsIHNvIGFuXG5cdFx0XHRcdC8vIGV4cGxpY2l0IHVzZXIgbW9kZWwgcGljayBhZnRlciB0aGUgc3dpdGNoIHBlcnNpc3RzIG5vcm1hbGx5LlxuXHRcdFx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuZW5kU2Vzc2lvblN3aXRjaCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gUnVucyBhZnRlciB0aGUgaW5jb21pbmcgdmlldyBtb2RlbCBpcyBhc3NpZ25lZCBzbyBtb2RlbCByZXNvbHV0aW9uIHVzZXMgdGhlIGluY29taW5nIHNlc3Npb24gcG9vbC5cblx0XHR0aGlzLl9tb2RlbFNlbGVjdGlvbkNvbnRyb2xsZXIuYXBwbHlDb25maWd1cmVkRGVmYXVsdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldFBlbmRpbmdEZWxlZ2F0aW9uRm9yVmlld01vZGVsQ2hhbmdlKHRyYW5zYWN0aW9uOiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldE9ic2VydmFibGUuc2V0KHVuZGVmaW5lZCwgdHJhbnNhY3Rpb24pO1xuXHRcdHRoaXMuY2hhdEhhc1BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0S2V5LnNldChmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hWaWV3TW9kZWxTY29wZWRTdGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBVcGRhdGUgYWdlbnRTZXNzaW9uVHlwZSB3aGVuIHZpZXcgbW9kZWwgY2hhbmdlc1xuXHRcdHRoaXMudXBkYXRlQWdlbnRTZXNzaW9uVHlwZUNvbnRleHRLZXkoKTtcblx0XHR0aGlzLnJlZnJlc2hDaGF0U2Vzc2lvblBpY2tlcnMoKTtcblx0XHR0aGlzLmVuc3VyZU5vdGlmaWNhdGlvbldpZGdldCgpO1xuXHRcdHRoaXMudXBkYXRlQ29udGV4dFVzYWdlV2lkZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyUXVlc3Rpb25DYXJvdXNlbElmU2Vzc2lvbkNoYW5nZWQoZTogSUNoYXRXaWRnZXRWaWV3TW9kZWxDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGxldCBoYXNNYXRjaGluZ1Jlc291cmNlID0gZmFsc2U7XG5cdFx0aWYgKGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX3F1ZXN0aW9uQ2Fyb3VzZWxTZXNzaW9uUmVzb3VyY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmIChpc0VxdWFsKHIsIGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRoYXNNYXRjaGluZ1Jlc291cmNlID0gdHJ1ZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5fcXVlc3Rpb25DYXJvdXNlbFNlc3Npb25SZXNvdXJjZXMuc2l6ZSA+IDAgJiYgKCFlLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgIWhhc01hdGNoaW5nUmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLmNsZWFyUXVlc3Rpb25DYXJvdXNlbCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJQbGFuUmV2aWV3SWZTZXNzaW9uQ2hhbmdlZChlOiBJQ2hhdFdpZGdldFZpZXdNb2RlbENoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0bGV0IGhhc01hdGNoaW5nUGxhblJldmlld1Jlc291cmNlID0gZmFsc2U7XG5cdFx0aWYgKGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIHRoaXMuX3BsYW5SZXZpZXdTZXNzaW9uUmVzb3VyY2VzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmIChpc0VxdWFsKHIsIGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRoYXNNYXRjaGluZ1BsYW5SZXZpZXdSZXNvdXJjZSA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuX3BsYW5SZXZpZXdTZXNzaW9uUmVzb3VyY2VzLnNpemUgPiAwICYmICghZS5jdXJyZW50U2Vzc2lvblJlc291cmNlIHx8ICFoYXNNYXRjaGluZ1BsYW5SZXZpZXdSZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMuY2xlYXJQbGFuUmV2aWV3KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWNvbmNpbGVTZXNzaW9uVHlwZUZvclZpZXdNb2RlbENoYW5nZShlOiBJQ2hhdFdpZGdldFZpZXdNb2RlbENoYW5nZUV2ZW50LCB0cmFuc2FjdGlvbjogSVRyYW5zYWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZU9ic2VydmFibGUuc2V0KGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSwgdHJhbnNhY3Rpb24pO1xuXHRcdC8vIFRyYWNrIHRoZSBjdXJyZW50IHNlc3Npb24gdHlwZSBhbmQgcmUtaW5pdGlhbGl6ZSBtb2RlbCBzZWxlY3Rpb25cblx0XHQvLyB3aGVuIHRoZSBzZXNzaW9uIHR5cGUgY2hhbmdlcyAoZGlmZmVyZW50IHNlc3Npb24gdHlwZXMgbWF5IGhhdmVcblx0XHQvLyBkaWZmZXJlbnQgbW9kZWwgcG9vbHMgdmlhIHRhcmdldENoYXRTZXNzaW9uVHlwZSkuXG5cdFx0Y29uc3QgbmV3U2Vzc2lvblR5cGUgPSB0aGlzLmdldEN1cnJlbnRTZXNzaW9uVHlwZSgpO1xuXHRcdGlmIChlLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgJiYgdGhpcy5fY3VycmVudFNlc3Npb25UeXBlICYmIG5ld1Nlc3Npb25UeXBlICE9PSB0aGlzLl9jdXJyZW50U2Vzc2lvblR5cGUpIHtcblx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYFtDVlZNXS4xIG9uRGlkQ2hhbmdlVmlld01vZGVsIC0+IHNlc3Npb24gY2hhbmdlOiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZX0gLT4gJHtuZXdTZXNzaW9uVHlwZX0gaW4gJHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX0sICR7ZS5jdXJyZW50U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCwgdW5kZWZpbmVkLCB0aGlzLl9pbnB1dE1vZGVsPy5zdGF0ZS5nZXQoKSwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRTZXNzaW9uVHlwZU9ic2VydmFibGUuc2V0KG5ld1Nlc3Npb25UeXBlLCB0cmFuc2FjdGlvbik7XG5cdFx0XHR0aGlzLmluaXRTZWxlY3RlZE1vZGVsKCk7XG5cdFx0XHR0aGlzLmNoZWNrTW9kZWxJblNlc3Npb25Qb29sKCk7XG5cdFx0XHR0aGlzLmNoZWNrTW9kZUluU2Vzc2lvblBvb2woKTtcblx0XHR9IGVsc2UgaWYgKGUuY3VycmVudFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgW0NWVk1dLjIgb25EaWRDaGFuZ2VWaWV3TW9kZWwgLT4gc2Vzc2lvbiBjaGFuZ2U6ICR7dGhpcy5fY3VycmVudFNlc3Npb25UeXBlfSAtPiAke25ld1Nlc3Npb25UeXBlfSBpbiAke3RoaXMuX2N1cnJlbnRTZXNzaW9uS2V5fSwgJHtlLmN1cnJlbnRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gLCB1bmRlZmluZWQsIHRoaXMuX2lucHV0TW9kZWw/LnN0YXRlLmdldCgpLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdFx0dGhpcy5fY3VycmVudFNlc3Npb25UeXBlT2JzZXJ2YWJsZS5zZXQobmV3U2Vzc2lvblR5cGUsIHRyYW5zYWN0aW9uKTtcblx0XHRcdHRoaXMucmVzdG9yZVBlclR5cGVNb2RlbEFmdGVyVmlld01vZGVsQXNzaWdubWVudCgpO1xuXHRcdFx0Ly8gUmUtaW5pdGlhbGl6ZSBmcm9tIHN0b3JhZ2UgZmlyc3Qgc28gdGhlIHVzZXIncyBwcmV2aW91cyBzZWxlY3Rpb24gZm9yXG5cdFx0XHQvLyB0aGlzIHBvb2wgaXMgcmVzdG9yZWRcblx0XHRcdHRoaXMucmVpbml0aWFsaXplSWZNb2RlbEludmFsaWRGb3JQb29sKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlUGVyVHlwZU1vZGVsQWZ0ZXJWaWV3TW9kZWxBc3NpZ25tZW50KCk6IHZvaWQge1xuXHRcdC8vIEZyZXNoIHVudGl0bGVkIG93bi1wb29sIHNlc3Npb246IGBzZXRJbnB1dE1vZGVsYCBwcmUtYWR2YW5jZWQgYF9jdXJyZW50U2Vzc2lvblR5cGVgXG5cdFx0Ly8gYmVmb3JlIHRoaXMgZXZlbnQsIHNvIHRoZSBicmFuY2ggYWJvdmUgY2FuJ3QgZGV0ZWN0IGl0LiBUaGUgdmlldyBtb2RlbCBpcyBub3dcblx0XHQvLyBhc3NpZ25lZCwgc28gYGdldEN1cnJlbnRTZXNzaW9uVHlwZSgpYCBpcyBjb3JyZWN0IGFuZCBpdCBpcyBzYWZlIHRvIHJlc3RvcmUgdGhlXG5cdFx0Ly8gcmVtZW1iZXJlZCBwZXItc2Vzc2lvbi10eXBlIG1vZGVsLiBBdXRvbWF0aWMgcmVzdG9yZXMgdXBkYXRlIGNvbnZlcnNhdGlvbiBzdGF0ZSBvbmx5O1xuXHRcdC8vIHRoZSByZW1lbWJlcmVkIHByZWZlcmVuY2UgaXMgd3JpdHRlbiBleGNsdXNpdmVseSBieSBleHBsaWNpdCB1c2VyIHBpY2tzLlxuXHRcdC8vIElmIHRoZSByZW1lbWJlcmVkIG1vZGVsIGhhcyBub3QgbG9hZGVkIHlldCwgc2tpcCBwb29sIHZhbGlkYXRpb24gc28gdGhlIHBpY2tlciBkb2VzIG5vdFxuXHRcdC8vIG1vdmUgYXdheSBmcm9tIHRoZSBtb2RlbCB0aGF0IHdpbGwgYmUgYXBwbGllZCB3aGVuIGl0IGFwcGVhcnMuXG5cdFx0aWYgKHRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5yZXN0b3JlUGVyVHlwZU1vZGVsKSB7XG5cdFx0XHR0aGlzLmluaXRTZWxlY3RlZE1vZGVsKCk7XG5cdFx0XHRpZiAoIXRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5oYXNQZW5kaW5nSW50ZW50KCkgJiYgIXRoaXMuX21vZGVsU2VsZWN0aW9uQ29udHJvbGxlci5pc0F3YWl0aW5nUmVtZW1iZXJlZE1vZGVsKCkpIHtcblx0XHRcdFx0dGhpcy5jaGVja01vZGVsSW5TZXNzaW9uUG9vbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBpbml0aWFsVmFsdWU6IHN0cmluZywgd2lkZ2V0OiBJQ2hhdFdpZGdldCkge1xuXHRcdHRoaXMuX3dpZGdldCA9IHdpZGdldDtcblx0XHR0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlT2JzZXJ2YWJsZS5zZXQod2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuZ2V0VmlzaWJsZU9wdGlvbkdyb3Vwc01vZGVBbmRVcGRhdGVDb250ZXh0S2V5cyh0aGlzLmdldEN1cnJlbnRTZXNzaW9uUmVzb3VyY2UoKSk7XG5cblx0XHQvLyBJbml0aWFsaXplIGxvY2sgc3RhdGUgd2hlbiByZW5kZXJpbmcgd2l0aCBhIHByZS1zZWxlY3RlZCBzZXNzaW9uIHByb3ZpZGVyIChlLmcuLCB3ZWxjb21lIHZpZXcgcmVzdG9yZSlcblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMub3B0aW9ucy5zZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlO1xuXHRcdGlmIChkZWxlZ2F0ZT8uc2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyICYmIGRlbGVnYXRlPy5nZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IGluaXRpYWxTZXNzaW9uVHlwZSA9IGRlbGVnYXRlLmdldEFjdGl2ZVNlc3Npb25Qcm92aWRlcigpO1xuXHRcdFx0aWYgKGluaXRpYWxTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVdpZGdldExvY2tTdGF0ZUZyb21TZXNzaW9uVHlwZShpbml0aWFsU2Vzc2lvblR5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdpZGdldC5vbkRpZENoYW5nZVZpZXdNb2RlbChlID0+IHRoaXMuaGFuZGxlVmlld01vZGVsQ2hhbmdlKGUpKSk7XG5cblx0XHRsZXQgZWxlbWVudHM7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHRlbGVtZW50cyA9IGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtcGFydCcsIFtcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LWlucHV0LXBlcnNpc3RlbnQtY29udGVudEBwZXJzaXN0ZW50Q29udGVudENvbnRhaW5lcicpLFxuXHRcdFx0XHRkb20uaCgnLmludGVyYWN0aXZlLWlucHV0LWFuZC1lZGl0LXNlc3Npb24nLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LXBsYW4tcmV2aWV3LXdpZGdldC1jb250YWluZXJAY2hhdFBsYW5SZXZpZXdDb250YWluZXInKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtcXVlc3Rpb24tY2Fyb3VzZWwtd2lkZ2V0LWNvbnRhaW5lckBjaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC10b29sLWNvbmZpcm1hdGlvbi1jYXJvdXNlbC1jb250YWluZXJAY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tY29udGFpbmVyQGNoYXRJbnB1dE5vdGlmaWNhdGlvbkNvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWNvbnRhaW5lckB2b2ljZU1vZGVPbmJvYXJkaW5nQ29udGFpbmVyJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5kaWN0YXRpb24tb25ib2FyZGluZy1jb250YWluZXJAZGljdGF0aW9uT25ib2FyZGluZ0NvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1nb2FsLWJhbm5lci1jb250YWluZXJAY2hhdEdvYWxCYW5uZXJDb250YWluZXInKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtdG9kby1saXN0LXdpZGdldC1jb250YWluZXJAY2hhdElucHV0VG9kb0xpc3RXaWRnZXRDb250YWluZXInKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYXJ0aWZhY3RzLXdpZGdldC1jb250YWluZXJAY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1lZGl0aW5nLXNlc3Npb25AY2hhdEVkaXRpbmdTZXNzaW9uV2lkZ2V0Q29udGFpbmVyJyksXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWdldHRpbmctc3RhcnRlZC10aXAtY29udGFpbmVyQGNoYXRHZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtYW5kLXNpZGUtdG9vbGJhckBpbnB1dEFuZFNpZGVUb29sYmFyJywgW1xuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWlucHV0LWNvbnRhaW5lckBpbnB1dENvbnRhaW5lcicsIFtcblx0XHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWVkaXRvci1jb250YWluZXJAZWRpdG9yQ29udGFpbmVyJyksXG5cdFx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1pbnB1dC10b29sYmFyc0BpbnB1dFRvb2xiYXJzJyksXG5cdFx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtc2Vjb25kYXJ5LXRvb2xiYXJAc2Vjb25kYXJ5VG9vbGJhcicsIFtcblx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1jb250ZXh0LXVzYWdlLWNvbnRhaW5lckBjb250ZXh0VXNhZ2VXaWRnZXRDb250YWluZXInKSxcblx0XHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1pbnB1dC1zdGF0dXMtY29udGFpbmVyQHN0YXR1c1Rvb2xiYXJDb250YWluZXInKSxcblx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYXR0YWNobWVudHMtY29udGFpbmVyQGF0dGFjaG1lbnRzQ29udGFpbmVyJywgW1xuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHRAYXR0YWNoZWRDb250ZXh0Q29udGFpbmVyJyksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0ZG9tLmgoJy5pbnRlcmFjdGl2ZS1pbnB1dC1mb2xsb3d1cHNAZm9sbG93dXBzQ29udGFpbmVyJyksXG5cdFx0XHRcdF0pXG5cdFx0XHRdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZWxlbWVudHMgPSBkb20uaCgnLmludGVyYWN0aXZlLWlucHV0LXBhcnQnLCBbXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC1pbnB1dC1wZXJzaXN0ZW50LWNvbnRlbnRAcGVyc2lzdGVudENvbnRlbnRDb250YWluZXInKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXBsYW4tcmV2aWV3LXdpZGdldC1jb250YWluZXJAY2hhdFBsYW5SZXZpZXdDb250YWluZXInKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXF1ZXN0aW9uLWNhcm91c2VsLXdpZGdldC1jb250YWluZXJAY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxDb250YWluZXInKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXRvb2wtY29uZmlybWF0aW9uLWNhcm91c2VsLWNvbnRhaW5lckBjaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyJyksXG5cdFx0XHRcdGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtZm9sbG93dXBzQGZvbGxvd3Vwc0NvbnRhaW5lcicpLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWNvbnRhaW5lckBjaGF0SW5wdXROb3RpZmljYXRpb25Db250YWluZXInKSxcblx0XHRcdFx0ZG9tLmgoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY29udGFpbmVyQHZvaWNlTW9kZU9uYm9hcmRpbmdDb250YWluZXInKSxcblx0XHRcdFx0ZG9tLmgoJy5kaWN0YXRpb24tb25ib2FyZGluZy1jb250YWluZXJAZGljdGF0aW9uT25ib2FyZGluZ0NvbnRhaW5lcicpLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtZ29hbC1iYW5uZXItY29udGFpbmVyQGNoYXRHb2FsQmFubmVyQ29udGFpbmVyJyksXG5cdFx0XHRcdGRvbS5oKCcuY2hhdC10b2RvLWxpc3Qtd2lkZ2V0LWNvbnRhaW5lckBjaGF0SW5wdXRUb2RvTGlzdFdpZGdldENvbnRhaW5lcicpLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtYXJ0aWZhY3RzLXdpZGdldC1jb250YWluZXJAY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lcicpLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uQGNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lcicpLFxuXHRcdFx0XHRkb20uaCgnLmNoYXQtZ2V0dGluZy1zdGFydGVkLXRpcC1jb250YWluZXJAY2hhdEdldHRpbmdTdGFydGVkVGlwQ29udGFpbmVyJyksXG5cdFx0XHRcdGRvbS5oKCcuaW50ZXJhY3RpdmUtaW5wdXQtYW5kLXNpZGUtdG9vbGJhckBpbnB1dEFuZFNpZGVUb29sYmFyJywgW1xuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1pbnB1dC1jb250YWluZXJAaW5wdXRDb250YWluZXInLCBbXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYXR0YWNobWVudHMtY29udGFpbmVyQGF0dGFjaG1lbnRzQ29udGFpbmVyJywgW1xuXHRcdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dEBhdHRhY2hlZENvbnRleHRDb250YWluZXInKSxcblx0XHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWVkaXRvci1jb250YWluZXJAZWRpdG9yQ29udGFpbmVyJyksXG5cdFx0XHRcdFx0XHRkb20uaCgnLmNoYXQtaW5wdXQtdG9vbGJhcnNAaW5wdXRUb29sYmFycycpLFxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdFx0ZG9tLmgoJy5jaGF0LXNlY29uZGFyeS10b29sYmFyQHNlY29uZGFyeVRvb2xiYXInLCBbXG5cdFx0XHRcdFx0ZG9tLmgoJy5jaGF0LWNvbnRleHQtdXNhZ2UtY29udGFpbmVyQGNvbnRleHRVc2FnZVdpZGdldENvbnRhaW5lcicpLFxuXHRcdFx0XHRcdGRvbS5oKCcuY2hhdC1pbnB1dC1zdGF0dXMtY29udGFpbmVyQHN0YXR1c1Rvb2xiYXJDb250YWluZXInKSxcblx0XHRcdFx0XSksXG5cdFx0XHRdKTtcblx0XHR9XG5cdFx0dGhpcy5jb250YWluZXIgPSBlbGVtZW50cy5yb290O1xuXHRcdHRoaXMucGVyc2lzdGVudENvbnRlbnRDb250YWluZXIgPSBlbGVtZW50cy5wZXJzaXN0ZW50Q29udGVudENvbnRhaW5lcjtcblx0XHR0aGlzLmNoYXRJbnB1dE92ZXJsYXkgPSBkb20uJCgnLmNoYXQtaW5wdXQtb3ZlcmxheScpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQodGhpcy5jb250YWluZXIpO1xuXHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZCh0aGlzLmNoYXRJbnB1dE92ZXJsYXkpO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NvbXBhY3QnLCB0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0Jyk7XG5cblx0XHQvLyBDcmVhdGUgYSBzY29wZWQgY29udGV4dCBrZXkgc2VydmljZSBmb3Igb3B0aW9uIGdyb3VwIHZpc2liaWxpdHkgZXhwcmVzc2lvbnNcblx0XHQvLyBUaGlzIGlzb2xhdGVzIGNoYXRTZXNzaW9uT3B0aW9uLiogY29udGV4dCBrZXlzIHRvIHRoaXMgc3BlY2lmaWMgY2hhdCBpbnB1dCBpbnN0YW5jZVxuXHRcdHRoaXMuX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5jb250YWluZXIpKTtcblxuXHRcdHRoaXMuZm9sbG93dXBzQ29udGFpbmVyID0gZWxlbWVudHMuZm9sbG93dXBzQ29udGFpbmVyO1xuXHRcdGNvbnN0IGlucHV0QW5kU2lkZVRvb2xiYXIgPSBlbGVtZW50cy5pbnB1dEFuZFNpZGVUb29sYmFyOyAvLyBUaGUgY2hhdCBpbnB1dCBhbmQgdG9vbGJhciB0byB0aGUgcmlnaHRcblx0XHRjb25zdCBpbnB1dENvbnRhaW5lciA9IGVsZW1lbnRzLmlucHV0Q29udGFpbmVyOyAvLyBUaGUgY2hhdCBlZGl0b3IsIGF0dGFjaG1lbnRzLCBhbmQgdG9vbGJhcnNcblx0XHR0aGlzLmlucHV0Q29udGFpbmVyID0gaW5wdXRDb250YWluZXI7XG5cdFx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gZWxlbWVudHMuZWRpdG9yQ29udGFpbmVyO1xuXHRcdHRoaXMuYXR0YWNobWVudHNDb250YWluZXIgPSBlbGVtZW50cy5hdHRhY2htZW50c0NvbnRhaW5lcjtcblx0XHR0aGlzLmF0dGFjaGVkQ29udGV4dENvbnRhaW5lciA9IGVsZW1lbnRzLmF0dGFjaGVkQ29udGV4dENvbnRhaW5lcjtcblx0XHRjb25zdCB0b29sYmFyc0NvbnRhaW5lciA9IGVsZW1lbnRzLmlucHV0VG9vbGJhcnM7XG5cdFx0dGhpcy5zZWNvbmRhcnlUb29sYmFyQ29udGFpbmVyID0gZWxlbWVudHMuc2Vjb25kYXJ5VG9vbGJhcjtcblx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcpIHtcblx0XHRcdHRoaXMuc2Vjb25kYXJ5VG9vbGJhckNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0XHR0aGlzLmNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lciA9IGVsZW1lbnRzLmNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lcjtcblx0XHR0aGlzLmNoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0Q29udGFpbmVyID0gZWxlbWVudHMuY2hhdElucHV0VG9kb0xpc3RXaWRnZXRDb250YWluZXI7XG5cdFx0dGhpcy5jaGF0QXJ0aWZhY3RzV2lkZ2V0Q29udGFpbmVyID0gZWxlbWVudHMuY2hhdEFydGlmYWN0c1dpZGdldENvbnRhaW5lcjtcblx0XHR0aGlzLmNoYXRHZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lciA9IGVsZW1lbnRzLmNoYXRHZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lcjtcblx0XHR0aGlzLmNoYXRHZXR0aW5nU3RhcnRlZFRpcENvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxDb250YWluZXIgPSBlbGVtZW50cy5jaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRhaW5lcjtcblx0XHR0aGlzLmNoYXRQbGFuUmV2aWV3Q29udGFpbmVyID0gZWxlbWVudHMuY2hhdFBsYW5SZXZpZXdDb250YWluZXI7XG5cdFx0dGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyID0gZWxlbWVudHMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcjtcblx0XHRkb20uaGlkZSh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHRcdHRoaXMuY2hhdElucHV0Tm90aWZpY2F0aW9uQ29udGFpbmVyID0gZWxlbWVudHMuY2hhdElucHV0Tm90aWZpY2F0aW9uQ29udGFpbmVyO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlSW5wdXRPbmJvYXJkaW5nVmlzaWJsZSA9ICgpID0+IHRoaXMub3B0aW9ucy5vbkRpZENoYW5nZUlucHV0T25ib2FyZGluZ1Zpc2libGU/Lihcblx0XHRcdHRoaXMudm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UuaXNWaXNpYmxlIHx8IHRoaXMuZGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UuaXNWaXNpYmxlXG5cdFx0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlLnJlZ2lzdGVySG9zdChlbGVtZW50cy52b2ljZU1vZGVPbmJvYXJkaW5nQ29udGFpbmVyLCB0aGlzLmNvbnRhaW5lciwgKCkgPT4gdGhpcy5mb2N1cygpLCBlbGVtZW50cy5jaGF0R2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXIsIG9uRGlkQ2hhbmdlSW5wdXRPbmJvYXJkaW5nVmlzaWJsZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGljdGF0aW9uT25ib2FyZGluZ1NlcnZpY2UucmVnaXN0ZXJIb3N0KGVsZW1lbnRzLmRpY3RhdGlvbk9uYm9hcmRpbmdDb250YWluZXIsIHRoaXMuY29udGFpbmVyLCBlbGVtZW50cy5jaGF0R2V0dGluZ1N0YXJ0ZWRUaXBDb250YWluZXIsIG9uRGlkQ2hhbmdlSW5wdXRPbmJvYXJkaW5nVmlzaWJsZSkpO1xuXHRcdHRoaXMuY2hhdEdvYWxCYW5uZXJDb250YWluZXIgPSBlbGVtZW50cy5jaGF0R29hbEJhbm5lckNvbnRhaW5lcjtcblx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldENvbnRhaW5lciA9IGVsZW1lbnRzLmNvbnRleHRVc2FnZVdpZGdldENvbnRhaW5lcjtcblx0XHR0aGlzLnN0YXR1c1Rvb2xiYXJDb250YWluZXIgPSBlbGVtZW50cy5zdGF0dXNUb29sYmFyQ29udGFpbmVyO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHR0b29sYmFyc0NvbnRhaW5lci5wcmVwZW5kKHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Q29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBDb250ZXh0IHVzYWdlIHdpZGdldCBcdTIwMTQgd2lsbCBiZSBwb3NpdGlvbmVkIGluIHRoZSB0b29sYmFyIGFmdGVyIHRvb2xiYXJzIGFyZSBjcmVhdGVkXG5cdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRDb250ZXh0VXNhZ2VXaWRnZXQpKTtcblx0XHR0aGlzLmNvbnRleHRVc2FnZVdpZGdldC5zZXRDaGF0V2lkZ2V0KHdpZGdldCk7XG5cdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQuc2V0U2VsZWN0ZWRNb2RlbCh0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8uaWRlbnRpZmllcik7XG5cdFx0dGhpcy5jb250ZXh0VXNhZ2VXaWRnZXQuc2V0TW9kZWxDb25maWd1cmF0aW9uUmVzb2x2ZXIoXG5cdFx0XHRtb2RlbElkID0+IHRoaXMuZ2V0TW9kZWxDb25maWd1cmF0aW9uKG1vZGVsSWQpLFxuXHRcdFx0dGhpcy5fbW9kZWxDb25maWdTdG9yZS5vbkRpZENoYW5nZSxcblx0XHQpO1xuXHRcdHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0Q29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuY29udGV4dFVzYWdlV2lkZ2V0LmRvbU5vZGUpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5lbmFibGVJbXBsaWNpdENvbnRleHQgJiYgIXRoaXMuX2ltcGxpY2l0Q29udGV4dCkge1xuXHRcdFx0dGhpcy5faW1wbGljaXRDb250ZXh0ID0gdGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEltcGxpY2l0Q29udGV4dHMpLFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuc2V0SW1wbGljaXRDb250ZXh0RW5hYmxlbWVudCgpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbXBsaWNpdENvbnRleHQub25EaWRDaGFuZ2VWYWx1ZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2luZGV4T2ZMYXN0QXR0YWNoZWRDb250ZXh0RGVsZXRlZFdpdGhLZXlib2FyZCA9IC0xO1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVBdHRhY2hlZENvbnRleHRDaGFuZ2UoKTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2UgaWYgKCF0aGlzLm9wdGlvbnMuZW5hYmxlSW1wbGljaXRDb250ZXh0ICYmIHRoaXMuX2ltcGxpY2l0Q29udGV4dCkge1xuXHRcdFx0dGhpcy5faW1wbGljaXRDb250ZXh0Py5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9pbXBsaWNpdENvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbnN1cmVOb3RpZmljYXRpb25XaWRnZXQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5vbkRpZENoYW5nZSgoZSkgPT4ge1xuXHRcdFx0aWYgKGUuYWRkZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9pbmRleE9mTGFzdEF0dGFjaGVkQ29udGV4dERlbGV0ZWRXaXRoS2V5Ym9hcmQgPSAtMTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hhbmRsZUF0dGFjaGVkQ29udGV4dENoYW5nZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVuZGVyQ2hhdEVkaXRpbmdTZXNzaW9uU3RhdGUobnVsbCk7XG5cblx0XHR0aGlzLmRuZC5hZGRPdmVybGF5KHRoaXMub3B0aW9ucy5kbmRDb250YWluZXIgPz8gY29udGFpbmVyLCB0aGlzLm9wdGlvbnMuZG5kQ29udGFpbmVyID8/IGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBpbnB1dFNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQoaW5wdXRDb250YWluZXIpKTtcblx0XHRDaGF0Q29udGV4dEtleXMuaW5DaGF0SW5wdXQuYmluZFRvKGlucHV0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblx0XHR0aGlzLmN1cnJlbnRseUVkaXRpbmdJbnB1dEtleSA9IENoYXRDb250ZXh0S2V5cy5jdXJyZW50bHlFZGl0aW5nSW5wdXQuYmluZFRvKGlucHV0U2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdGluZ1NlbnRSZXF1ZXN0S2V5ID0gQ2hhdENvbnRleHRLZXlzLmVkaXRpbmdSZXF1ZXN0VHlwZS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBpbnB1dFNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdGNvbnN0IHsgaGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50LCBoaXN0b3J5TmF2aWdhdGlvbkZvcndhcmRzRW5hYmxlbWVudCB9ID0gdGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBbmRDcmVhdGVIaXN0b3J5TmF2aWdhdGlvbkNvbnRleHQoaW5wdXRTY29wZWRDb250ZXh0S2V5U2VydmljZSwgdGhpcykpO1xuXHRcdHRoaXMuaGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50ID0gaGlzdG9yeU5hdmlnYXRpb25CYWNrd2FyZHNFbmFibGVtZW50O1xuXHRcdHRoaXMuaGlzdG9yeU5hdmlnYXRpb25Gb3Jld2FyZHNFbmFibGVtZW50ID0gaGlzdG9yeU5hdmlnYXRpb25Gb3J3YXJkc0VuYWJsZW1lbnQ7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyA9IGdldFNpbXBsZUVkaXRvck9wdGlvbnModGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0b3B0aW9ucy5vdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gdGhpcy5vcHRpb25zLmVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGU7XG5cdFx0b3B0aW9ucy5wYXN0ZUFzID0gRWRpdG9yT3B0aW9ucy5wYXN0ZUFzLmRlZmF1bHRWYWx1ZTtcblx0XHRvcHRpb25zLnJlYWRPbmx5ID0gZmFsc2U7XG5cdFx0b3B0aW9ucy5hcmlhTGFiZWwgPSB0aGlzLl9nZXRBcmlhTGFiZWwoKTtcblx0XHRvcHRpb25zLmZvbnRGYW1pbHkgPSBERUZBVUxUX0ZPTlRfRkFNSUxZO1xuXHRcdG9wdGlvbnMuZm9udFNpemUgPSAxMztcblx0XHRvcHRpb25zLmxpbmVIZWlnaHQgPSBJTlBVVF9FRElUT1JfTElORV9IRUlHSFQ7XG5cdFx0b3B0aW9ucy5wYWRkaW5nID0gdGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcgPyBJTlBVVF9FRElUT1JfUEFERElORy5jb21wYWN0IDogSU5QVVRfRURJVE9SX1BBRERJTkcuZGVmYXVsdDtcblx0XHRvcHRpb25zLmN1cnNvcldpZHRoID0gMTtcblx0XHRvcHRpb25zLndyYXBwaW5nU3RyYXRlZ3kgPSAnYWR2YW5jZWQnO1xuXHRcdG9wdGlvbnMuYnJhY2tldFBhaXJDb2xvcml6YXRpb24gPSB7IGVuYWJsZWQ6IGZhbHNlIH07XG5cdFx0Ly8gUmVzcGVjdCB1c2VyJ3MgZWRpdG9yIHNldHRpbmdzIGZvciBhdXRvLWNsb3NpbmcgYW5kIGF1dG8tc3Vycm91bmRpbmcgYmVoYXZpb3Jcblx0XHRvcHRpb25zLmF1dG9DbG9zaW5nQnJhY2tldHMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuYXV0b0Nsb3NpbmdCcmFja2V0cycpO1xuXHRcdG9wdGlvbnMuYXV0b0Nsb3NpbmdRdW90ZXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdlZGl0b3IuYXV0b0Nsb3NpbmdRdW90ZXMnKTtcblx0XHRvcHRpb25zLmF1dG9TdXJyb3VuZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2VkaXRvci5hdXRvU3Vycm91bmQnKTtcblx0XHRvcHRpb25zLnF1aWNrU3VnZ2VzdGlvbnMgPSBmYWxzZTtcblx0XHRvcHRpb25zLnN1Z2dlc3QgPSB7XG5cdFx0XHRzaG93SWNvbnM6IHRydWUsXG5cdFx0XHRzaG93U25pcHBldHM6IGZhbHNlLFxuXHRcdFx0c2hvd1dvcmRzOiB0cnVlLFxuXHRcdFx0c2hvd1N0YXR1c0JhcjogZmFsc2UsXG5cdFx0XHRpbnNlcnRNb2RlOiAnaW5zZXJ0Jyxcblx0XHRcdGZpdFdpZHRoVG9EZXRhaWxzOiB0cnVlLFxuXHRcdH07XG5cdFx0b3B0aW9ucy5zY3JvbGxiYXIgPSB0aGlzLm9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0J1xuXHRcdFx0PyB7IC4uLihvcHRpb25zLnNjcm9sbGJhciA/PyB7fSksIHZlcnRpY2FsOiAnaGlkZGVuJyB9XG5cdFx0XHQ6IHtcblx0XHRcdFx0Li4uKG9wdGlvbnMuc2Nyb2xsYmFyID8/IHt9KSxcblx0XHRcdFx0dmVydGljYWw6ICdhdXRvJyxcblx0XHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiA3LFxuXHRcdFx0fTtcblx0XHRvcHRpb25zLnN0aWNreVNjcm9sbCA9IHsgZW5hYmxlZDogZmFsc2UgfTtcblxuXHRcdHRoaXMuX2lucHV0RWRpdG9yRWxlbWVudCA9IGRvbS5hcHBlbmQoZWRpdG9yQ29udGFpbmVyLCAkKGNoYXRJbnB1dEVkaXRvckNvbnRhaW5lclNlbGVjdG9yKSk7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IGdldFNpbXBsZUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zKCk7XG5cdFx0ZWRpdG9yT3B0aW9ucy5jb250cmlidXRpb25zPy5wdXNoKC4uLkVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRTb21lRWRpdG9yQ29udHJpYnV0aW9ucyhbQ29udGVudEhvdmVyQ29udHJvbGxlci5JRCwgR2x5cGhIb3ZlckNvbnRyb2xsZXIuSUQsIERyb3BJbnRvRWRpdG9yQ29udHJvbGxlci5JRCwgQ29weVBhc3RlQ29udHJvbGxlci5JRCwgTGlua0RldGVjdG9yLklELCBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuSUQsIFBsYWNlaG9sZGVyVGV4dENvbnRyaWJ1dGlvbi5JRF0pKTtcblx0XHR0aGlzLl9pbnB1dEVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVFZGl0b3JXaWRnZXQsIHRoaXMuX2lucHV0RWRpdG9yRWxlbWVudCwgb3B0aW9ucywgZWRpdG9yT3B0aW9ucykpO1xuXHRcdHRoaXMudXBkYXRlSW5wdXRFZGl0b3JGb250RmFtaWx5KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2lucHV0RWRpdG9yRWxlbWVudCwgZG9tLkV2ZW50VHlwZS5QQVNURSwgZSA9PiB0aGlzLmhhbmRsZVRlcm1pbmFsQ29tbWFuZFBhc3RlKGUpLCB0cnVlKSk7XG5cblx0XHRTdWdnZXN0Q29udHJvbGxlci5nZXQodGhpcy5faW5wdXRFZGl0b3IpPy5mb3JjZVJlbmRlcmluZ0Fib3ZlKCk7XG5cdFx0b3B0aW9ucy5vdmVyZmxvd1dpZGdldHNEb21Ob2RlPy5jbGFzc0xpc3QuYWRkKCdoaWRlU3VnZ2VzdFRleHRJY29ucycpO1xuXHRcdHRoaXMuX2lucHV0RWRpdG9yRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdoaWRlU3VnZ2VzdFRleHRJY29ucycpO1xuXG5cdFx0Ly8gUHJldmVudCBFbnRlciBrZXkgZnJvbSBjcmVhdGluZyBuZXcgbGluZXMgLSBidXQgcmVzcGVjdCB1c2VyJ3MgY3VzdG9tIGtleWJpbmRpbmdzXG5cdFx0Ly8gT25seSBwcmV2ZW50IGRlZmF1bHQgYmVoYXZpb3IgaWYgQ2hhdFN1Ym1pdEFjdGlvbiBpcyBib3VuZCB0byBFbnRlciBBTkQgaXRzIHByZWNvbmRpdGlvbiBpcyBtZXRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnB1dEVkaXRvci5vbktleURvd24oKGUpID0+IHtcblx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgJiYgIWhhc01vZGlmaWVyS2V5cyhlKSkge1xuXHRcdFx0XHQvLyBDaGVjayBpZiBDaGF0U3VibWl0QWN0aW9uIGhhcyBhIGtleWJpbmRpbmcgZm9yIHBsYWluIEVudGVyIGluIHRoZSBjdXJyZW50IGNvbnRleHRcblx0XHRcdFx0Ly8gVGhpcyByZXNwZWN0cyB1c2VyJ3MgY3VzdG9tIGtleWJpbmRpbmdzIHRoYXQgZGlzYWJsZSB0aGUgc3VibWl0IGFjdGlvblxuXHRcdFx0XHRmb3IgKGNvbnN0IGtleWJpbmRpbmcgb2YgdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5ncyhDaGF0U3VibWl0QWN0aW9uLklEKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNob3JkcyA9IGtleWJpbmRpbmcuZ2V0RGlzcGF0Y2hDaG9yZHMoKTtcblx0XHRcdFx0XHRjb25zdCBpc1BsYWluRW50ZXIgPSBjaG9yZHMubGVuZ3RoID09PSAxICYmIGNob3Jkc1swXSA9PT0gJ1tFbnRlcl0nO1xuXHRcdFx0XHRcdGlmIChpc1BsYWluRW50ZXIpIHtcblx0XHRcdFx0XHRcdC8vIERvIE5PVCBjYWxsIHN0b3BQcm9wYWdhdGlvbigpIHNvIHRoZSBrZXliaW5kaW5nIHNlcnZpY2UgY2FuIHN0aWxsIHByb2Nlc3MgdGhpcyBldmVudFxuXHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudEhlaWdodCA9IE1hdGgubWluKHRoaXMuX2lucHV0RWRpdG9yLmdldENvbnRlbnRIZWlnaHQoKSwgdGhpcy5fZWZmZWN0aXZlSW5wdXRFZGl0b3JNYXhIZWlnaHQpO1xuXHRcdFx0aWYgKGN1cnJlbnRIZWlnaHQgIT09IHRoaXMuaW5wdXRFZGl0b3JIZWlnaHQpIHtcblx0XHRcdFx0dGhpcy5pbnB1dEVkaXRvckhlaWdodCA9IGN1cnJlbnRIZWlnaHQ7XG5cdFx0XHRcdC8vIERpcmVjdGx5IHVwZGF0ZSBlZGl0b3IgbGF5b3V0IC0gUmVzaXplT2JzZXJ2ZXIgd2lsbCBub3RpZnkgcGFyZW50IGFib3V0IGhlaWdodCBjaGFuZ2Vcblx0XHRcdFx0aWYgKHRoaXMuY2FjaGVkV2lkdGgpIHtcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXQodGhpcy5jYWNoZWRXaWR0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdXBkYXRlSW5wdXRDb250ZW50Q29udGV4dEtleXMoKTtcblxuXHRcdFx0Ly8gVXBkYXRlIG1vbm9zcGFjZSBzdGF0ZSBhcyB0aGUgY29tbWFuZCBwcmVmaXggaXMgdHlwZWQvcmVtb3ZlZC5cblx0XHRcdHRoaXMudXBkYXRlSW5wdXRFZGl0b3JGb250RmFtaWx5KCk7XG5cblx0XHRcdC8vIERlYm91bmNlZCBzeW5jIHRvIG1vZGVsIGZvciB0ZXh0IGNoYW5nZXNcblx0XHRcdHRoaXMuX3N5bmNUZXh0RGVib3VuY2VkLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lucHV0RWRpdG9yLm9uRGlkQ29udGVudFNpemVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5jb250ZW50SGVpZ2h0Q2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLmlucHV0RWRpdG9ySGVpZ2h0ID0gIXRoaXMuaW5saW5lID8gZS5jb250ZW50SGVpZ2h0IDogdGhpcy5pbnB1dEVkaXRvckhlaWdodDtcblx0XHRcdFx0Ly8gRGlyZWN0bHkgdXBkYXRlIGVkaXRvciBsYXlvdXQgLSBSZXNpemVPYnNlcnZlciB3aWxsIG5vdGlmeSBwYXJlbnQgYWJvdXQgaGVpZ2h0IGNoYW5nZVxuXHRcdFx0XHRpZiAodGhpcy5jYWNoZWRXaWR0aCkge1xuXHRcdFx0XHRcdHRoaXMuX2xheW91dCh0aGlzLmNhY2hlZFdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnB1dEVkaXRvci5vbkRpZEZvY3VzRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHR0aGlzLmlucHV0RWRpdG9ySGFzRm9jdXMuc2V0KHRydWUpO1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0XHRpbnB1dENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdmb2N1c2VkJywgdHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2lucHV0RWRpdG9yLm9uRGlkQmx1ckVkaXRvclRleHQoKCkgPT4ge1xuXHRcdFx0dGhpcy5pbnB1dEVkaXRvckhhc0ZvY3VzLnNldChmYWxzZSk7XG5cdFx0XHRpbnB1dENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdmb2N1c2VkJywgZmFsc2UpO1xuXG5cdFx0XHR0aGlzLl9vbkRpZEJsdXIuZmlyZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnB1dEVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0Q29weVBhc3RlQ29udHJvbGxlci5nZXQodGhpcy5faW5wdXRFZGl0b3IpPy5jbGVhcldpZGdldHMoKTtcblx0XHRcdERyb3BJbnRvRWRpdG9yQ29udHJvbGxlci5nZXQodGhpcy5faW5wdXRFZGl0b3IpPy5jbGVhcldpZGdldHMoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSk7XG5cblx0XHRjb25zdCB7IGxvY2F0aW9uIH0gPSB0aGlzLmdldFdpZGdldExvY2F0aW9uSW5mbyh3aWRnZXQpO1xuXHRcdGNvbnN0IGZvY3VzZWRXaWRnZXQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbiwgKCkgPT4gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldCk7XG5cdFx0Y29uc3QgaXNWb2ljZUlucHV0QWN0aXZlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gZm9jdXNlZFdpZGdldC5yZWFkKHJlYWRlcikgPT09IHdpZGdldCk7XG5cblx0XHRjb25zdCBwaWNrZXJPcHRpb25zOiBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyA9IHtcblx0XHRcdGdldE92ZXJmbG93QW5jaG9yOiAoKSA9PiB0aGlzLmlucHV0QWN0aW9uc1Rvb2xiYXIuZ2V0RWxlbWVudCgpLFxuXHRcdFx0YWN0aW9uQ29udGV4dDogeyB3aWRnZXQgfSxcblx0XHRcdGNvbXBhY3Q6IGRlcml2ZWQocmVhZGVyID0+IHRoaXMuX3N0YWJsZUlucHV0UGFydFdpZHRoLnJlYWQocmVhZGVyKSA8IENIQVRfSU5QVVRfUElDS0VSX0NPTExBUFNFX1dJRFRIKSxcblx0XHR9O1xuXHRcdGNvbnN0IHByaW1hcnlTZXNzaW9uUGlja2VyT3B0aW9uczogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgPSB7XG5cdFx0XHQuLi5waWNrZXJPcHRpb25zLFxuXHRcdFx0Y29tcGFjdDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5UGlja2VyT3B0aW9uczogSUNoYXRJbnB1dFBpY2tlck9wdGlvbnMgPSB7XG5cdFx0XHQuLi5waWNrZXJPcHRpb25zLFxuXHRcdFx0Z2V0T3ZlcmZsb3dBbmNob3I6ICgpID0+IHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5nZXRFbGVtZW50KCksXG5cdFx0XHRjb21wYWN0OiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0b29sYmFyc0NvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB0aGlzLmlucHV0RWRpdG9yLmZvY3VzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5hdHRhY2htZW50c0NvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB0aGlzLmlucHV0RWRpdG9yLmZvY3VzKCkpKTtcblx0XHRjb25zdCBzaG9ydGVyQ2hhdElucHV0QWN0aW9uSWRzID0gbmV3IFNldDxzdHJpbmc+KFtcblx0XHRcdE9wZW5Nb2RlUGlja2VyQWN0aW9uLklELFxuXHRcdFx0Q29uZmlndXJlVG9vbHNBY3Rpb24uSUQsXG5cdFx0XSk7XG5cdFx0dGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5vcHRpb25zLnJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQgPyB0aGlzLmF0dGFjaG1lbnRzQ29udGFpbmVyIDogdG9vbGJhcnNDb250YWluZXIsIE1lbnVJZC5DaGF0SW5wdXQsIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogdGhpcy5vcHRpb25zLm1lbnVzLnRlbGVtZXRyeVNvdXJjZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdsYXN0Jyxcblx0XHRcdFx0bWluSXRlbXM6IDEsXG5cdFx0XHRcdGFjdGlvbk1pbldpZHRoOiA0OCxcblx0XHRcdFx0Z2V0QWN0aW9uTWluV2lkdGg6IGFjdGlvbiA9PiBzaG9ydGVyQ2hhdElucHV0QWN0aW9uSWRzLmhhcyhhY3Rpb24uaWQpID8gMjIgOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHQvLyBQaG9uZS1sYXlvdXQgYnJhbmNoOiB3aGVuIGFuIGFnZW50cy13aW5kb3cgcGhvbmUgcHJlc2VudGVyXG5cdFx0XHRcdC8vIGlzIGFjdGl2ZSwgcmVwbGFjZSB0aGUgZGVza3RvcCBNb2RlICsgTW9kZWwgcGlja2VycyB3aXRoIGFcblx0XHRcdFx0Ly8gc2luZ2xlIGNoaXAgdGhhdCBvcGVucyBhIHVuaWZpZWQgYm90dG9tIHNoZWV0LiBUaGUgTW9kZVxuXHRcdFx0XHQvLyBhY3Rpb24gaXMgaGlkZGVuIHNvIGl0cyBzbG90IGlzIG5vdCBkdXBsaWNhdGVkOyB0aGUgY2hpcFxuXHRcdFx0XHQvLyAobW91bnRlZCBvbiB0aGUgTW9kZWwgYWN0aW9uJ3Mgc2xvdCkgb3BlbnMgYm90aCBwaWNrZXJzXG5cdFx0XHRcdC8vIGZyb20gb25lIHRhcC4gTWlycm9ycyB0aGUgZW1wdHkgbmV3LWNoYXQgZXhwZXJpZW5jZSBpblxuXHRcdFx0XHQvLyBgdnMvc2Vzc2lvbnNgIChzZWUgYE1vYmlsZUNoYXRJbnB1dENvbmZpZ1BpY2tlcmApLlxuXHRcdFx0XHRpZiAodGhpcy5jaGF0UGhvbmVJbnB1dFByZXNlbnRlci5lbmFibGVkLmdldCgpKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gT3Blbk1vZGVsUGlja2VyQWN0aW9uLklEICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuX2N1cnJlbnRMYW5ndWFnZU1vZGVsLmdldCgpKSB7XG5cdFx0XHRcdFx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwodGhpcy5faW5wdXRNb2RlbCwgYGFjdGlvblZpZXdJdGVtUHJvdmlkZXJbcGhvbmVdOiBfY3VycmVudExhbmd1YWdlTW9kZWwgaXMgdW5kZWZpbmVkIGF0IHRvb2xiYXIgYnVpbGQsIGZvcmNpbmcgZGVmYXVsdCBmb3IgJHt0aGlzLl9jdXJyZW50U2Vzc2lvbktleX1gLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5zZXRDdXJyZW50TGFuZ3VhZ2VNb2RlbFRvRGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgbW9kZWxEZWxlZ2F0ZSA9IHRoaXMuX2NyZWF0ZU1vZGVsUGlja2VyRGVsZWdhdGUoKTtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGVEZWxlZ2F0ZSA9IHRoaXMuX2NyZWF0ZU1vZGVQaWNrZXJEZWxlZ2F0ZSgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9iaWxlQ2hhdElucHV0Q29tYmluZWRQaWNrZXJBY3Rpb25JdGVtLCBhY3Rpb24sIG1vZGVEZWxlZ2F0ZSwgbW9kZWxEZWxlZ2F0ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uaWQgPT09IE9wZW5Nb2RlUGlja2VyQWN0aW9uLklEICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEhpZGRlbkFjdGlvblZpZXdJdGVtKGFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gT3Blbk1vZGVsUGlja2VyQWN0aW9uLklEICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKSkge1xuXHRcdFx0XHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCh0aGlzLl9pbnB1dE1vZGVsLCBgYWN0aW9uVmlld0l0ZW1Qcm92aWRlcltkZXNrdG9wXTogX2N1cnJlbnRMYW5ndWFnZU1vZGVsIGlzIHVuZGVmaW5lZCBhdCB0b29sYmFyIGJ1aWxkLCBmb3JjaW5nIGRlZmF1bHQgZm9yICR7dGhpcy5fY3VycmVudFNlc3Npb25LZXl9YCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRcdFx0XHR0aGlzLnNldEN1cnJlbnRMYW5ndWFnZU1vZGVsVG9EZWZhdWx0KCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaXRlbURlbGVnYXRlOiBJTW9kZWxQaWNrZXJEZWxlZ2F0ZSA9IHRoaXMuX2NyZWF0ZU1vZGVsUGlja2VyRGVsZWdhdGUoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5tb2RlbFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZWxQaWNrZXJBY3Rpb25JdGVtLCBhY3Rpb24sIGl0ZW1EZWxlZ2F0ZSwgcGlja2VyT3B0aW9ucyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLmlkID09PSBPcGVuTW9kZVBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGRlbGVnYXRlOiBJTW9kZVBpY2tlckRlbGVnYXRlID0gdGhpcy5fY3JlYXRlTW9kZVBpY2tlckRlbGVnYXRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZVdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTW9kZVBpY2tlckFjdGlvbkl0ZW0sIGFjdGlvbiwgZGVsZWdhdGUsIHBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKChhY3Rpb24uaWQgPT09IE9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyQWN0aW9uLklEIHx8IGFjdGlvbi5pZCA9PT0gT3BlbkRlbGVnYXRpb25QaWNrZXJBY3Rpb24uSUQpICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gVXNlIHByb3ZpZGVkIGRlbGVnYXRlIGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIGNyZWF0ZSBkZWZhdWx0IGRlbGVnYXRlXG5cdFx0XHRcdFx0Y29uc3QgZGVsZWdhdGU6IElTZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlID0gdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUgPz8ge1xuXHRcdFx0XHRcdFx0Z2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdldEFjdGl2ZVNlc3Npb25UeXBlRm9yRGVsZWdhdGlvbigpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGdldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9wZW5kaW5nRGVsZWdhdGlvblRhcmdldDtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzZXRQZW5kaW5nRGVsZWdhdGlvblRhcmdldDogKHByb3ZpZGVyOiBBZ2VudFNlc3Npb25UYXJnZXQpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5zZXRQZW5kaW5nRGVsZWdhdGlvblRhcmdldChwcm92aWRlcik7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aGFzR2l0UmVwb3NpdG9yeTogKCkgPT4gdGhpcy5oYXNXb3Jrc3BhY2VTY21SZXBvc2l0b3J5KCksXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRjb25zdCBpc1dlbGNvbWVWaWV3TW9kZSA9ICEhdGhpcy5vcHRpb25zLnNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU/LnNldEFjdGl2ZVNlc3Npb25Qcm92aWRlcjtcblx0XHRcdFx0XHRjb25zdCBQaWNrZXIgPSAoYWN0aW9uLmlkID09PSBPcGVuU2Vzc2lvblRhcmdldFBpY2tlckFjdGlvbi5JRCB8fCBpc1dlbGNvbWVWaWV3TW9kZSkgPyBTZXNzaW9uVHlwZVBpY2tlckFjdGlvbkl0ZW0gOiBEZWxlZ2F0aW9uU2Vzc2lvblBpY2tlckFjdGlvbkl0ZW07XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2Vzc2lvblRhcmdldFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGlja2VyLCBhY3Rpb24sIGxvY2F0aW9uID09PSBDaGF0V2lkZ2V0TG9jYXRpb24uRWRpdG9yID8gJ2VkaXRvcicgOiAnc2lkZWJhcicsIGRlbGVnYXRlLCBwaWNrZXJPcHRpb25zKTtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uaWQgPT09IENoYXRTZXNzaW9uUHJpbWFyeVBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdC8vIENsb3VkIHNlc3Npb25zIHJlbmRlciB0aGVpciBvcHRpb24tZ3JvdXAgcGlja2VycyAoZS5nLiBicmFuY2gpIG9uIHRoZSBwcmltYXJ5IHRvb2xiYXJcblx0XHRcdFx0XHRjb25zdCB3aWRnZXRzID0gdGhpcy5jcmVhdGVDaGF0U2Vzc2lvblBpY2tlcldpZGdldHMoYWN0aW9uLCBwcmltYXJ5U2Vzc2lvblBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdGlmICh3aWRnZXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBIaWRkZW5BY3Rpb25WaWV3SXRlbShhY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvblBpY2tlcnNDb250YWluZXJBY3Rpb25JdGVtLCBhY3Rpb24sIHdpZGdldHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgnY2hhdC1pbnB1dC10b29sYmFyJyk7XG5cdFx0dGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLmNvbnRleHQgPSB7IHdpZGdldCB9IHNhdGlzZmllcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5vbkRpZENoYW5nZU1lbnVJdGVtcygoKSA9PiB7XG5cdFx0XHQvLyBVcGRhdGUgY29udGFpbmVyIHJlZmVyZW5jZSBmb3IgdGhlIHBpY2tlcnMgKGNsb3VkIHNlc3Npb25zIGhvc3QgdGhlbSBpbiB0aGUgcHJpbWFyeSB0b29sYmFyKVxuXHRcdFx0Y29uc3QgdG9vbGJhckVsZW1lbnQgPSB0aGlzLmlucHV0QWN0aW9uc1Rvb2xiYXIuZ2V0RWxlbWVudCgpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCBwcmltYXJ5UGlja2VyQ29udGFpbmVyID0gdG9vbGJhckVsZW1lbnQucXVlcnlTZWxlY3RvcignLmNoYXQtc2Vzc2lvblBpY2tlci1jb250YWluZXInKTtcblx0XHRcdGlmIChwcmltYXJ5UGlja2VyQ29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuY2hhdFNlc3Npb25QaWNrZXJDb250YWluZXIgPSBwcmltYXJ5UGlja2VyQ29udGFpbmVyIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY2FjaGVkV2lkdGggJiYgdHlwZW9mIHRoaXMuY2FjaGVkSW5wdXRUb29sYmFyV2lkdGggPT09ICdudW1iZXInICYmIHRoaXMuY2FjaGVkSW5wdXRUb29sYmFyV2lkdGggIT09IHRoaXMuaW5wdXRBY3Rpb25zVG9vbGJhci5nZXRJdGVtc1dpZHRoKCkpIHtcblx0XHRcdFx0dGhpcy5fdG9vbGJhclJlbGF5b3V0U2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdC8vIFdoZW4gY29tcGFjdCBjaGFuZ2VzLCBwaWNrZXIgaXRlbXMgY2hhbmdlIHRoZWlyIHJlbmRlcmVkIHNpemVcblx0XHQvLyBidXQgdGhlIHRvb2xiYXIncyBSZXNpemVPYnNlcnZlciB3b24ndCBmaXJlICh0aGUgdG9vbGJhciBlbGVtZW50IHNpemVcblx0XHQvLyBkaWRuJ3QgY2hhbmdlLCBvbmx5IGl0cyBjaGlsZHJlbiBkaWQpLiBGb3JjZSBhIHJlbGF5b3V0IHNvIHRoZVxuXHRcdC8vIHJlc3BvbnNpdmUgb3ZlcmZsb3cgbG9naWMgcmUtZXZhbHVhdGVzIHdpdGggdGhlIGNvcnJlY3QgaXRlbSB3aWR0aHMuXG5cdFx0Ly8gVGhlIHJlbGF5b3V0IGlzIGRlZmVycmVkIGJ5IGEgbWljcm90YXNrIHNvIHRoZSBwaWNrZXIgYWN0aW9uIHZpZXdcblx0XHQvLyBpdGVtcycgb3duIGF1dG9ydW5zIGhhdmUgYSBjaGFuY2UgdG8gcmUtcmVuZGVyIHRoZWlyIGxhYmVscyBmaXJzdC5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRwaWNrZXJPcHRpb25zLmNvbXBhY3QucmVhZChyZWFkZXIpO1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gdGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLnJlbGF5b3V0KCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gdGhlIHBob25lLWlucHV0IHByZXNlbnRlciBmbGlwcyBiZXR3ZWVuIGVuYWJsZWQvZGlzYWJsZWQgKGUuZy5cblx0XHQvLyBkZXZpY2Ugcm90YXRpb24gY3Jvc3NpbmcgdGhlIHBob25lIGJyZWFrcG9pbnQpLCB0aGUgYWN0aW9uIHZpZXcgaXRlbVxuXHRcdC8vIHByb3ZpZGVyIGFib3ZlIHdpbGwgcmV0dXJuIGRpZmZlcmVudCBpdGVtcy4gRm9yY2UgdGhlIHRvb2xiYXIgdG9cblx0XHQvLyByZS1ldmFsdWF0ZSBpdHMgaXRlbXMgc28gdGhlIGNoaXAgLyBkZXNrdG9wIHBpY2tlcnMgc3dhcCBpbi5cblx0XHRsZXQgbGFzdFBob25lRW5hYmxlZCA9IHRoaXMuY2hhdFBob25lSW5wdXRQcmVzZW50ZXIuZW5hYmxlZC5nZXQoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlbmFibGVkID0gdGhpcy5jaGF0UGhvbmVJbnB1dFByZXNlbnRlci5lbmFibGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChlbmFibGVkICE9PSBsYXN0UGhvbmVFbmFibGVkKSB7XG5cdFx0XHRcdGxhc3RQaG9uZUVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdFx0XHR0aGlzLmlucHV0QWN0aW9uc1Rvb2xiYXIucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLmV4ZWN1dGVUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdG9vbGJhcnNDb250YWluZXIsIHRoaXMub3B0aW9ucy5tZW51cy5leGVjdXRlVG9vbGJhciwge1xuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiB0aGlzLm9wdGlvbnMubWVudXMudGVsZW1ldHJ5U291cmNlLFxuXHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBDaGF0Vm9pY2VJbnB1dE1vZGVBY3Rpb24uSUQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaXNBY3RpdmU6IGlzVm9pY2VJbnB1dEFjdGl2ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKGFjdGlvbi5pZCA9PT0gQ2hhdFN1Ym1pdEFjdGlvbi5JRCB8fCBhY3Rpb24uaWQgPT09IENoYXRFZGl0aW5nU2Vzc2lvblN1Ym1pdEFjdGlvbi5JRCkgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShjbGFzcyBleHRlbmRzIE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdFx0XHRcdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY2hhdC1zdWJtaXQtYnV0dG9uJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKGFjdGlvbi5pZCA9PT0gQ2hhdFNwZWVjaFRvVGV4dFByZXBhcmluZ0FjdGlvbi5JRCB8fCBhY3Rpb24uaWQgPT09IENoYXRTcGVlY2hUb1RleHRDb25uZWN0aW5nQWN0aW9uLklEKSAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpY3RhdGlvbkRvd25sb2FkQWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gVG9nZ2xlQ2hhdFNwZWVjaFRvVGV4dEFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpY3RhdGlvbkFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFZvaWNlIE1vZGUgbWljIGJ1dHRvbjogYWRkIGEgcmlnaHQtY2xpY2sgY29udGV4dCBtZW51IChTZWxlY3Rcblx0XHRcdFx0Ly8gTWljcm9waG9uZSAvIERpc2FibGUgVm9pY2UgTW9kZSkgbWlycm9yaW5nIGRpY3RhdGlvbi4gV2hpbGVcblx0XHRcdFx0Ly8gbGlzdGVuaW5nIHRoZSB0b29sYmFyIHN3YXBzIHRoZSBzdGFydCBhY3Rpb24gZm9yIHRoZVxuXHRcdFx0XHQvLyBwdXNoLXRvLXRhbGsgc3RvcCBhY3Rpb24sIHNvIGNvdmVyIGJvdGggc28gdGhlIG1lbnUgc3RheXMgcHV0LlxuXHRcdFx0XHRpZiAoKGFjdGlvbi5pZCA9PT0gJ2FnZW50c1ZvaWNlLnN0YXJ0Vm9pY2VJbkNoYXQnIHx8IGFjdGlvbi5pZCA9PT0gJ2FnZW50c1ZvaWNlLnB0dFN0b3BJbkNoYXQnKSAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFZvaWNlTW9kZUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHR0aGlzLmV4ZWN1dGVUb29sYmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdjaGF0LWV4ZWN1dGUtdG9vbGJhcicpO1xuXHRcdHRoaXMuZXhlY3V0ZVRvb2xiYXIuY29udGV4dCA9IHsgd2lkZ2V0IH0gc2F0aXNmaWVzIElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leGVjdXRlVG9vbGJhci5vbkRpZENoYW5nZU1lbnVJdGVtcygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jYWNoZWRXaWR0aCAmJiB0eXBlb2YgdGhpcy5jYWNoZWRFeGVjdXRlVG9vbGJhcldpZHRoID09PSAnbnVtYmVyJyAmJiB0aGlzLmNhY2hlZEV4ZWN1dGVUb29sYmFyV2lkdGggIT09IHRoaXMuZXhlY3V0ZVRvb2xiYXIuZ2V0SXRlbXNXaWR0aCgpKSB7XG5cdFx0XHRcdHRoaXMuX3Rvb2xiYXJSZWxheW91dFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAodGhpcy5vcHRpb25zLm1lbnVzLmlucHV0U2lkZVRvb2xiYXIpIHtcblx0XHRcdGNvbnN0IHRvb2xiYXJTaWRlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgaW5wdXRBbmRTaWRlVG9vbGJhciwgdGhpcy5vcHRpb25zLm1lbnVzLmlucHV0U2lkZVRvb2xiYXIsIHtcblx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiB0aGlzLm9wdGlvbnMubWVudXMudGVsZW1ldHJ5U291cmNlLFxuXHRcdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhvdmVyRGVsZWdhdGVcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuaW5wdXRTaWRlVG9vbGJhckNvbnRhaW5lciA9IHRvb2xiYXJTaWRlLmdldEVsZW1lbnQoKTtcblx0XHRcdHRvb2xiYXJTaWRlLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdjaGF0LXNpZGUtdG9vbGJhcicpO1xuXHRcdFx0dG9vbGJhclNpZGUuY29udGV4dCA9IHsgd2lkZ2V0IH0gc2F0aXNmaWVzIElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHQ7XG5cdFx0fVxuXG5cdFx0Ly8gU2Vjb25kYXJ5IHRvb2xiYXIgKHBlcm1pc3Npb25zKSBcdTIwMTQgYmVsb3cgdGhlIGlucHV0IGJveC5cblx0XHQvLyBQZXItYWN0aW9uIG1pbmltdW0gd2lkdGhzIChpbiBwaXhlbHMpIGZvciBwaWNrZXJzIHRoYXQgY29sbGFwc2UgdG8gYW5cblx0XHQvLyBpY29uLW9ubHkgbGFiZWwgdmlhIGEgQ1NTIGNvbnRhaW5lciBxdWVyeSBpbiBgQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyYC5cblx0XHQvLyBNb3N0IHBpY2tlcnMgcmVzZXJ2ZSB+MjJweCBmb3IgdGhlIGljb247IHRoZSB0dW5uZWwtc2hhcmluZyB0b2dnbGUgaGFzXG5cdFx0Ly8gbm8gY2hldnJvbiwgc28gaXQgY2FuIGNvbGxhcHNlIGZ1cnRoZXIgdG8gMTZweC5cblx0XHRjb25zdCBhZ2VudEhvc3RTaG9ydFBpY2tlck1pbldpZHRocyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KFtcblx0XHRcdFtPcGVuQWdlbnRIb3N0TW9kZVBpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0WydzZXNzaW9ucy5hZ2VudEhvc3QucnVubmluZ1Nlc3Npb25Nb2RlUGlja2VyJywgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RBdXRvQXBwcm92ZVBpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RQZXJtaXNzaW9uTW9kZVBpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RDb2RleEFwcHJvdmFsc1BpY2tlckFjdGlvbi5JRCwgMjJdLFxuXHRcdFx0W09wZW5BZ2VudEhvc3RGb2xkZXJQaWNrZXJBY3Rpb24uSUQsIDIyXSxcblx0XHRcdFsnc2Vzc2lvbnMudHVubmVsSG9zdC50b2dnbGVTaGFyaW5nJywgMTZdLFxuXHRcdF0pO1xuXHRcdC8vIERpcmVjdC1yZW5kZXJlZCBjaGlwIGxhbmUgZm9yIGFnZW50LWhvc3QgY29uZmlnIHByb3BlcnRpZXMgdGhhdFxuXHRcdC8vIGFyZSBhZHZlcnRpc2VkIGJ5IHRoZSBhZ2VudCdzIHNjaGVtYSBidXQgbm90IGhhbmRsZWQgYnkgYVxuXHRcdC8vIGRlZGljYXRlZCBgTWVudUlkLkNoYXRJbnB1dFNlY29uZGFyeWAgYWN0aW9uLiBTaXRzIGFzIGEgc2libGluZ1xuXHRcdC8vIG9mIHRoZSBzZWNvbmRhcnkgdG9vbGJhciBzbyB0aGUgdG9vbGJhciBjYW4gdGFrZSB0aGUgYXZhaWxhYmxlXG5cdFx0Ly8gc3BhY2UgKGBmbGV4OiAxIDEgMGApIHdoaWxlIHRoZSBjaGlwcyBwaW4gdG8gdGhlIHJpZ2h0IG5leHQgdG9cblx0XHQvLyB0aGUgY29udGV4dC11c2FnZSB3aWRnZXQuXG5cdFx0Y29uc3QgZ2VuZXJpY0NoaXBzQ29udGFpbmVyID0gZG9tLiQoJy5jaGF0LXNlY29uZGFyeS1nZW5lcmljLWNoaXBzJyk7XG5cdFx0Y29uc3QgZ2VuZXJpY0NoaXBzTGFuZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRBZ2VudEhvc3RHZW5lcmljQ29uZmlnQ2hpcHMsXG5cdFx0XHR3aWRnZXQsXG5cdFx0KSk7XG5cdFx0Z2VuZXJpY0NoaXBzTGFuZS5yZW5kZXIoZ2VuZXJpY0NoaXBzQ29udGFpbmVyKTtcblx0XHR0aGlzLnNlY29uZGFyeVRvb2xiYXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLnNlY29uZGFyeVRvb2xiYXJDb250YWluZXIsIE1lbnVJZC5DaGF0SW5wdXRTZWNvbmRhcnksIHtcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogdGhpcy5vcHRpb25zLm1lbnVzLnRlbGVtZXRyeVNvdXJjZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHRob3ZlckRlbGVnYXRlLFxuXHRcdFx0cmVzcG9uc2l2ZUJlaGF2aW9yOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGtpbmQ6ICdhbGwnLFxuXHRcdFx0XHRtaW5JdGVtczogMSxcblx0XHRcdFx0YWN0aW9uTWluV2lkdGg6IDQ4LFxuXHRcdFx0XHQvLyBBZ2VudC1ob3N0IHBpY2tlcnMgY29sbGFwc2UgdG8gYW4gaWNvbi1vbmx5IGxhYmVsIHZpYSBhIENTU1xuXHRcdFx0XHQvLyBjb250YWluZXIgcXVlcnkgaW4gYEFnZW50SG9zdENoYXRJbnB1dFBpY2tlcmAgd2hlbiBuYXJyb3cuXG5cdFx0XHRcdC8vIFJlcG9ydCBhIHNtYWxsZXIgbWluLXdpZHRoIGZvciB0aGVtIHNvIHRoZSByZXNwb25zaXZlIGxheW91dFxuXHRcdFx0XHQvLyBrZWVwcyB0aGVtIHZpc2libGUgaW5zdGVhZCBvZiBvdmVyZmxvd2luZyBpbnRvIHRoZSBtZW51LlxuXHRcdFx0XHRnZXRBY3Rpb25NaW5XaWR0aDogYWN0aW9uID0+IGFnZW50SG9zdFNob3J0UGlja2VyTWluV2lkdGhzLmdldChhY3Rpb24uaWQpLFxuXHRcdFx0fSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0Y29uc3QgYWdlbnRIb3N0UGlja2VyUHJvcGVydHkgPSBnZXRBZ2VudEhvc3RQaWNrZXJQcm9wZXJ0eShhY3Rpb24uaWQpO1xuXHRcdFx0XHRjb25zdCBjdXN0b21TZWNvbmRhcnlJdGVtID0gdGhpcy5vcHRpb25zLnNlY29uZGFyeVRvb2xiYXJBY3Rpb25WaWV3SXRlbVByb3ZpZGVyPy4oYWN0aW9uLCBvcHRpb25zKTtcblx0XHRcdFx0aWYgKGN1c3RvbVNlY29uZGFyeUl0ZW0pIHtcblx0XHRcdFx0XHRyZXR1cm4gY3VzdG9tU2Vjb25kYXJ5SXRlbTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoKGFjdGlvbi5pZCA9PT0gT3BlblNlc3Npb25UYXJnZXRQaWNrZXJBY3Rpb24uSUQgfHwgYWN0aW9uLmlkID09PSBPcGVuRGVsZWdhdGlvblBpY2tlckFjdGlvbi5JRCkgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRjb25zdCBkZWxlZ2F0ZTogSVNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGUgPSB0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZSA/PyB7XG5cdFx0XHRcdFx0XHRnZXRBY3RpdmVTZXNzaW9uUHJvdmlkZXI6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0QWN0aXZlU2Vzc2lvblR5cGVGb3JEZWxlZ2F0aW9uKCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Z2V0UGVuZGluZ0RlbGVnYXRpb25UYXJnZXQ6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0O1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHNldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0OiAocHJvdmlkZXI6IEFnZW50U2Vzc2lvblRhcmdldCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNldFBlbmRpbmdEZWxlZ2F0aW9uVGFyZ2V0KHByb3ZpZGVyKTtcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRoYXNHaXRSZXBvc2l0b3J5OiAoKSA9PiB0aGlzLmhhc1dvcmtzcGFjZVNjbVJlcG9zaXRvcnkoKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IGlzV2VsY29tZVZpZXdNb2RlID0gISF0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uc2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyO1xuXHRcdFx0XHRcdGNvbnN0IFBpY2tlciA9IChhY3Rpb24uaWQgPT09IE9wZW5TZXNzaW9uVGFyZ2V0UGlja2VyQWN0aW9uLklEIHx8IGlzV2VsY29tZVZpZXdNb2RlKSA/IFNlc3Npb25UeXBlUGlja2VyQWN0aW9uSXRlbSA6IERlbGVnYXRpb25TZXNzaW9uUGlja2VyQWN0aW9uSXRlbTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uVGFyZ2V0V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQaWNrZXIsIGFjdGlvbiwgbG9jYXRpb24gPT09IENoYXRXaWRnZXRMb2NhdGlvbi5FZGl0b3IgPyAnZWRpdG9yJyA6ICdzaWRlYmFyJywgZGVsZWdhdGUsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pZCA9PT0gT3BlbldvcmtzcGFjZVBpY2tlckFjdGlvbi5JRCAmJiBhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZICYmIHRoaXMub3B0aW9ucy53b3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uLCB0aGlzLm9wdGlvbnMud29ya3NwYWNlUGlja2VyRGVsZWdhdGUsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEhpZGRlbkFjdGlvblZpZXdJdGVtKGFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pZCA9PT0gT3BlblBlcm1pc3Npb25QaWNrZXJBY3Rpb24uSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRjb25zdCBkZWxlZ2F0ZTogSVBlcm1pc3Npb25QaWNrZXJEZWxlZ2F0ZSA9IHtcblx0XHRcdFx0XHRcdGN1cnJlbnRQZXJtaXNzaW9uTGV2ZWw6IHRoaXMuX2N1cnJlbnRQZXJtaXNzaW9uTGV2ZWwsXG5cdFx0XHRcdFx0XHRzZXRQZXJtaXNzaW9uTGV2ZWw6IChsZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNldFBlcm1pc3Npb25MZXZlbChsZXZlbCk7XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0Z2V0RXh0ZW5zaW9uUGVybWlzc2lvbnM6ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5nZXRBY3RpdmVFeHRlbnNpb25QZXJtaXNzaW9uR3JvdXAoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHNlc3Npb25SZXNvdXJjZSA/IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uT3B0aW9uKHNlc3Npb25SZXNvdXJjZSwgZ3JvdXAuaWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkZWZhdWx0SWQgPSBncm91cC5zZWxlY3RlZD8uaWQgPz8gZ3JvdXAuaXRlbXMuZmluZChpID0+IGkuZGVmYXVsdCk/LmlkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByYXdTZWxlY3RlZElkID0gY3VycmVudCA9PT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHRcdFx0PyBkZWZhdWx0SWRcblx0XHRcdFx0XHRcdFx0XHQ6IHR5cGVvZiBjdXJyZW50ID09PSAnc3RyaW5nJyA/IGN1cnJlbnQgOiBjdXJyZW50LmlkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZElkID0gcmF3U2VsZWN0ZWRJZCAhPT0gdW5kZWZpbmVkICYmIGdyb3VwLml0ZW1zLnNvbWUoaSA9PiBpLmlkID09PSByYXdTZWxlY3RlZElkKVxuXHRcdFx0XHRcdFx0XHRcdD8gcmF3U2VsZWN0ZWRJZFxuXHRcdFx0XHRcdFx0XHRcdDogZGVmYXVsdElkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IHNlc3Npb25SZXNvdXJjZVxuXHRcdFx0XHRcdFx0XHRcdD8gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdFx0XHRcdFx0XHQ6ICh0aGlzLm9wdGlvbnMuc2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZT8uZ2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyPy4oKSA/PyAnJyk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHNlc3Npb25UeXBlLCBncm91cElkOiBncm91cC5pZCwgaXRlbXM6IGdyb3VwLml0ZW1zLCBzZWxlY3RlZElkIH07XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c2V0RXh0ZW5zaW9uUGVybWlzc2lvbjogKGdyb3VwSWQ6IHN0cmluZywgaXRlbTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudXBkYXRlT3B0aW9uQ29udGV4dEtleShncm91cElkLCBpdGVtLmlkKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5nZXRPckNyZWF0ZU9wdGlvbkVtaXR0ZXIoZ3JvdXBJZCkuZmlyZShpdGVtKTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCk7XG5cdFx0XHRcdFx0XHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2Uuc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIGdyb3VwSWQsIGl0ZW0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMucGVybWlzc2lvbldpZGdldD8ucmVmcmVzaCgpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGlzU2FuZGJveFRvZ2dsZUFwcGxpY2FibGU6ICgpID0+IHRoaXMuZ2V0RWZmZWN0aXZlU2Vzc2lvblR5cGUodGhpcy5nZXRDdXJyZW50U2Vzc2lvblJlc291cmNlKCkpID09PSBTZXNzaW9uVHlwZS5Mb2NhbCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGVybWlzc2lvblBpY2tlckFjdGlvbkl0ZW0sIGFjdGlvbiwgZGVsZWdhdGUsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdHRoaXMucGVybWlzc2lvbldpZGdldCA9IHdpZGdldDtcblx0XHRcdFx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXREaXNwb3NlTGlzdGVuZXIudmFsdWUgPSB3aWRnZXQub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnBlcm1pc3Npb25XaWRnZXQgPT09IHdpZGdldCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLnBlcm1pc3Npb25XaWRnZXREaXNwb3NlTGlzdGVuZXIuY2xlYXIoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm4gd2lkZ2V0O1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFnZW50SG9zdFBpY2tlclByb3BlcnR5ICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5pc1Nlc3Npb25zV2luZG93KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEhpZGRlbkFjdGlvblZpZXdJdGVtKGFjdGlvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBpY2tlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2hhdElucHV0UGlja2VyLCB3aWRnZXQsIGFnZW50SG9zdFBpY2tlclByb3BlcnR5KTtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IEFnZW50SG9zdENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtKGFjdGlvbiwgcGlja2VyKTtcblx0XHRcdFx0fSBlbHNlIGlmIChhY3Rpb24uaWQgPT09IE9wZW5BZ2VudEhvc3RGb2xkZXJQaWNrZXJBY3Rpb24uSUQgJiYgYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRpZiAodGhpcy5vcHRpb25zLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgSGlkZGVuQWN0aW9uVmlld0l0ZW0oYWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Rm9sZGVyUGlja2VyQWN0aW9uSXRlbSwgYWN0aW9uLCB3aWRnZXQsIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5pZCA9PT0gQ2hhdFNlc3Npb25QcmltYXJ5UGlja2VyQWN0aW9uLklEICYmIGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGFsbCBwaWNrZXJzIGFuZCByZXR1cm4gYSBjb250YWluZXIgYWN0aW9uIHZpZXcgaXRlbVxuXHRcdFx0XHRcdGNvbnN0IHdpZGdldHMgPSB0aGlzLmNyZWF0ZUNoYXRTZXNzaW9uUGlja2VyV2lkZ2V0cyhhY3Rpb24sIHNlY29uZGFyeVBpY2tlck9wdGlvbnMpO1xuXHRcdFx0XHRcdGlmICh3aWRnZXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBIaWRkZW5BY3Rpb25WaWV3SXRlbShhY3Rpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBDcmVhdGUgYSBjb250YWluZXIgdG8gaG9sZCBhbGwgcGlja2VyIHdpZGdldHNcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvblBpY2tlcnNDb250YWluZXJBY3Rpb25JdGVtLCBhY3Rpb24sIHdpZGdldHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgnY2hhdC1zZWNvbmRhcnktaW5wdXQtdG9vbGJhcicpO1xuXHRcdHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5jb250ZXh0ID0geyB3aWRnZXQgfSBzYXRpc2ZpZXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dDtcblx0XHRkb20uYXBwZW5kKHRoaXMuc2Vjb25kYXJ5VG9vbGJhckNvbnRhaW5lciwgZ2VuZXJpY0NoaXBzQ29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlY29uZGFyeVRvb2xiYXIub25EaWRDaGFuZ2VNZW51SXRlbXMoKCkgPT4ge1xuXHRcdFx0Ly8gVXBkYXRlIGNvbnRhaW5lciByZWZlcmVuY2UgZm9yIHRoZSBwaWNrZXJzIHdoZW4gdGhlIHNlY29uZGFyeSB0b29sYmFyIGhvc3RzIG9uZS5cblx0XHRcdC8vIE9ubHkgYXNzaWduIHdoZW4gZm91bmQgc28gd2UgZG9uJ3Qgb3ZlcndyaXRlIGEgdmFsaWQgcHJpbWFyeSBjb250YWluZXIgcmVmZXJlbmNlXG5cdFx0XHQvLyBmb3Igc2Vzc2lvbiB0eXBlcyB3aG9zZSBwaWNrZXJzIGxpdmUgaW4gdGhlIHByaW1hcnkgdG9vbGJhciAoZS5nLiBjbG91ZCkuXG5cdFx0XHRjb25zdCB0b29sYmFyRWxlbWVudCA9IHRoaXMuc2Vjb25kYXJ5VG9vbGJhci5nZXRFbGVtZW50KCk7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGNvbnRhaW5lciA9IHRvb2xiYXJFbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LXNlc3Npb25QaWNrZXItY29udGFpbmVyJyk7XG5cdFx0XHRpZiAoZG9tLmlzSFRNTEVsZW1lbnQoY29udGFpbmVyKSkge1xuXHRcdFx0XHR0aGlzLmNoYXRTZXNzaW9uUGlja2VyQ29udGFpbmVyID0gY29udGFpbmVyO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEV4dGVuc2lvbi1jb250cmlidXRlZCBzdGF0dXMgaW5kaWNhdG9yczsgbm9uLXJlc3BvbnNpdmUgc28gaXRlbXMgZG9uJ3QgY29sbGFwc2UuXG5cdFx0dGhpcy5zdGF0dXNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5zdGF0dXNUb29sYmFyQ29udGFpbmVyLCBNZW51SWQuQ2hhdElucHV0U3RhdHVzLCB7XG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IHRoaXMub3B0aW9ucy5tZW51cy50ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRtZW51T3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHR9KSk7XG5cdFx0dGhpcy5zdGF0dXNUb29sYmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdjaGF0LWlucHV0LXN0YXR1cy10b29sYmFyJyk7XG5cdFx0dGhpcy5zdGF0dXNUb29sYmFyLmNvbnRleHQgPSB7IHdpZGdldCB9IHNhdGlzZmllcyBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0O1xuXG5cdFx0bGV0IGlucHV0TW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbCh0aGlzLmlucHV0VXJpKTtcblx0XHRpZiAoIWlucHV0TW9kZWwpIHtcblx0XHRcdGlucHV0TW9kZWwgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLm1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCgnJywgbnVsbCwgdGhpcy5pbnB1dFVyaSwgZmFsc2UpKTtcblx0XHR9XG5cblx0XHR0aGlzLnRleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh0aGlzLmlucHV0VXJpKS50aGVuKHJlZiA9PiB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdG8gaG9sZCBhIHJlZmVyZW5jZSBzbyB0aGF0IHRoZSBtb2RlbCBkb2Vzbid0IGdldCBkaXNwb3NlZCBieSB0aGUgdGV4dCBtb2RlbCBzZXJ2aWNlXG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWYpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5pbnB1dE1vZGVsID0gaW5wdXRNb2RlbDtcblx0XHR0aGlzLmlucHV0TW9kZWwudXBkYXRlT3B0aW9ucyh7IGJyYWNrZXRDb2xvcml6YXRpb25PcHRpb25zOiB7IGVuYWJsZWQ6IGZhbHNlLCBpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlOiBmYWxzZSB9IH0pO1xuXHRcdHRoaXMuX2lucHV0RWRpdG9yLnNldE1vZGVsKHRoaXMuaW5wdXRNb2RlbCk7XG5cdFx0aWYgKGluaXRpYWxWYWx1ZSkge1xuXHRcdFx0dGhpcy5pbnB1dE1vZGVsLnNldFZhbHVlKGluaXRpYWxWYWx1ZSk7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gdGhpcy5pbnB1dE1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0dGhpcy5faW5wdXRFZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyLCBjb2x1bW46IHRoaXMuaW5wdXRNb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2lucHV0RWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9pbnB1dEVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdFx0aWYgKCFwb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGF0VG9wID0gcG9zaXRpb24ubGluZU51bWJlciA9PT0gMSAmJiBwb3NpdGlvbi5jb2x1bW4gPT09IDE7XG5cdFx0XHR0aGlzLmNoYXRDdXJzb3JBdFRvcC5zZXQoYXRUb3ApO1xuXG5cdFx0XHR0aGlzLmhpc3RvcnlOYXZpZ2F0aW9uQmFja3dhcmRzRW5hYmxlbWVudC5zZXQoYXRUb3ApO1xuXHRcdFx0dGhpcy5oaXN0b3J5TmF2aWdhdGlvbkZvcmV3YXJkc0VuYWJsZW1lbnQuc2V0KHBvc2l0aW9uLmVxdWFscyhnZXRMYXN0UG9zaXRpb24obW9kZWwpKSk7XG5cblx0XHRcdC8vIFN5bmMgY3Vyc29yIGFuZCBzZWxlY3Rpb24gdG8gbW9kZWxcblx0XHRcdHRoaXMuX3N5bmNJbnB1dFN0YXRlVG9Nb2RlbCgpO1xuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5wdXRFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbihlID0+IG9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKSkpO1xuXHRcdG9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlbmRlckF0dGFjaGVkQ29udGV4dCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMucmVuZGVyQXR0YWNoZWRDb250ZXh0KCk7XG5cblx0XHQvLyBEZWZlciBvbmx5IHRoZSBjYXJvdXNlbCBtYXgtaGVpZ2h0IHVwZGF0ZSB0byB0aGUgbmV4dCBhbmltYXRpb25cblx0XHQvLyBmcmFtZS4gVGhhdCB3cml0ZSBjaGFuZ2VzIGEgZGVzY2VuZGFudCB3aG9zZSBoZWlnaHQgZmxleGVzIGJhY2tcblx0XHQvLyB1cCBpbnRvIGB0aGlzLmNvbnRhaW5lcmAgKHRoZSBvYnNlcnZlZCBlbGVtZW50KSwgd2hpY2ggaXMgd2hhdFxuXHRcdC8vIHRyaXBzIHRoZSBicm93c2VyJ3MgXCJSZXNpemVPYnNlcnZlciBsb29wIGNvbXBsZXRlZCB3aXRoXG5cdFx0Ly8gdW5kZWxpdmVyZWQgbm90aWZpY2F0aW9uc1wiIHdhcm5pbmcgdW5kZXIgYnVyc3R5IGlucHV0IChzZWVcblx0XHQvLyAjMzE2NTA5KS4gUHVibGlzaGluZyBgdGhpcy5oZWlnaHRgIHN0YXlzIHN5bmNocm9ub3VzIGJlY2F1c2UgaXRzXG5cdFx0Ly8gYXV0b3J1biBjb25zdW1lcnMgcmUtbGF5b3V0IHNpYmxpbmdzL2FuY2VzdG9ycyBvZiB0aGUgaW5wdXRcblx0XHQvLyBjb250YWluZXIsIG5vdCB0aGUgY29udGFpbmVyIGl0c2VsZiwgc28gdGhleSBkbyBub3QgZmVlZCBiYWNrXG5cdFx0Ly8gaW50byB0aGUgc2FtZSBvYnNlcnZhdGlvbiBwaGFzZS5cblx0XHRjb25zdCB1cGRhdGVDYXJvdXNlbE1heEhlaWdodFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBkb20uQW5pbWF0aW9uRnJhbWVTY2hlZHVsZXIodGhpcy5jb250YWluZXIsICgpID0+IHRoaXMudXBkYXRlVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsTWF4SGVpZ2h0KCkpKTtcblx0XHRjb25zdCBpbnB1dFJlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRJbnB1dFBhcnQuY29udGFpbmVySGVpZ2h0JywgKCkgPT4ge1xuXHRcdFx0dXBkYXRlQ2Fyb3VzZWxNYXhIZWlnaHRTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdGNvbnN0IG5ld0hlaWdodCA9IHRoaXMuY29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHRcdHRoaXMuaGVpZ2h0LnNldChuZXdIZWlnaHQsIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGlucHV0UmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZSh0aGlzLmNvbnRhaW5lcikpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHRjb25zdCB0b29sYmFyc1Jlc2l6ZU9ic2VydmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRJbnB1dFBhcnQuY29tcGFjdFRvb2xiYXJzJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBIYXZlIHRvIGxheW91dCB0aGUgZWRpdG9yIHdoZW4gdGhlIHRvb2xiYXJzIGNoYW5nZSBzaXplLCB3aGVuIHRoZXkgc2hhcmUgd2lkdGggd2l0aCB0aGUgZWRpdG9yLlxuXHRcdFx0XHQvLyBUaGlzIGhhbmRsZXMgZW5zdXJpbmcgd2UgbGF5b3V0IHdoZW4gcXVpY2sgY2hhdCBpcyBzaG93bi9oaWRkZW4uXG5cdFx0XHRcdC8vIFRoZSB0b29sYmFyIG1heSBoYXZlIGNoYW5nZWQgc2luY2UgdGhlIGxhc3QgdGltZSBpdCB3YXMgdmlzaWJsZS5cblx0XHRcdFx0aWYgKHRoaXMuY2FjaGVkV2lkdGgpIHtcblx0XHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLmNhY2hlZFdpZHRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9vbGJhcnNSZXNpemVPYnNlcnZlci5vYnNlcnZlKHRvb2xiYXJzQ29udGFpbmVyKSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHRvZ2dsZUNoYXRJbnB1dE92ZXJsYXkoZWRpdGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuY2hhdElucHV0T3ZlcmxheS5jbGFzc0xpc3QudG9nZ2xlKCdkaXNhYmxlZCcsIGVkaXRpbmcpO1xuXHRcdGlmIChlZGl0aW5nKSB7XG5cdFx0XHR0aGlzLm92ZXJsYXlDbGlja0xpc3RlbmVyLnZhbHVlID0gZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY2hhdElucHV0T3ZlcmxheSwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDbGlja092ZXJsYXkuZmlyZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub3ZlcmxheUNsaWNrTGlzdGVuZXIuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyQXR0YWNoZWRDb250ZXh0KCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuYXR0YWNoZWRDb250ZXh0Q29udGFpbmVyO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuYXR0YWNoZWRDb250ZXh0RGlzcG9zYWJsZXMudmFsdWUgPSBzdG9yZTtcblxuXHRcdGRvbS5jbGVhck5vZGUoY29udGFpbmVyKTtcblxuXHRcdHN0b3JlLmFkZChkb20uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5hdHRhY2htZW50c0NvbnRhaW5lciwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5oYW5kbGVBdHRhY2htZW50TmF2aWdhdGlvbihlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBDb21wbGV0aW9uIHJlZmVyZW5jZXMgKGFnZW50LWhvc3Qgc2tpbGxzL2NvbW1hbmRzKSByZW5kZXIgYXMgaW5saW5lXG5cdFx0Ly8gZGVjb3JhdGlvbnMgcmF0aGVyIHRoYW4gYXR0YWNobWVudCBwaWxscywgc28gZXhjbHVkZSB0aGVtLiBSZS1pbmRleFxuXHRcdC8vIGNvbnRpZ3VvdXNseSBvdmVyIHRoZSByZW5kZXJlZCBwaWxscyBzbyB0aGUgZm9jdXMgYm9va2tlZXBpbmcgKHdoaWNoXG5cdFx0Ly8gc3RvcmVzL2NvbXBhcmVzIGluZGljZXMgYW5kIGNvdW50cykgc3RheXMgYWxpZ25lZCB3aXRoIHRoZSB2aXNpYmxlIHBpbGxzXG5cdFx0Ly8gYW5kIG5vdCB0aGUgbW9kZWwsIHdoaWNoIG1heSBjb250YWluIG5vbi1yZW5kZXJlZCBlbnRyaWVzLlxuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gdGhpcy5nZXRSZW5kZXJhYmxlQXR0YWNobWVudHMoKVxuXHRcdFx0Lm1hcCgoYXR0YWNobWVudCwgaW5kZXgpOiBbbnVtYmVyLCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5XSA9PiBbaW5kZXgsIGF0dGFjaG1lbnRdKTtcblx0XHRjb25zdCBoYXNBdHRhY2htZW50cyA9IEJvb2xlYW4oYXR0YWNobWVudHMubGVuZ3RoKTtcblxuXHRcdC8vIFJlbmRlciBpbXBsaWNpdCBjb250ZXh0IChhY3RpdmUgZWRpdG9yIGluIEFzayBtb2RlLCBvciBzZWxlY3Rpb24pXG5cdFx0bGV0IGhhc0ltcGxpY2l0Q29udGV4dCA9IGZhbHNlO1xuXHRcdGNvbnN0IGlzU3VnZ2VzdGVkRW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2NoYXQuaW1wbGljaXRDb250ZXh0LnN1Z2dlc3RlZENvbnRleHQnKTtcblx0XHRjb25zdCBoYXNWaXNpYmxlSW1wbGljaXRDb250ZXh0ID0gaXNTdWdnZXN0ZWRFbmFibGVkXG5cdFx0XHQ/IHRoaXMuX2ltcGxpY2l0Q29udGV4dD8uaGFzVmFsdWUgPz8gZmFsc2Vcblx0XHRcdDogdGhpcy5faW1wbGljaXRDb250ZXh0Py52YWx1ZXMuc29tZSh2ID0+IHYuZW5hYmxlZCB8fCB2LmlzU2VsZWN0aW9uKSA/PyBmYWxzZTtcblx0XHRpZiAodGhpcy5faW1wbGljaXRDb250ZXh0ICYmIGhhc1Zpc2libGVJbXBsaWNpdENvbnRleHQpIHtcblx0XHRcdGNvbnN0IGlzQXR0YWNobWVudEFscmVhZHlBdHRhY2hlZCA9ICh0YXJnZXRVcmk6IFVSSSB8IHVuZGVmaW5lZCwgdGFyZ2V0UmFuZ2U6IElSYW5nZSB8IHVuZGVmaW5lZCwgdGFyZ2V0SGFuZGxlOiBudW1iZXIgfCB1bmRlZmluZWQpOiBib29sZWFuID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5hdHRhY2htZW50cy5zb21lKGEgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFVcmkgPSBVUkkuaXNVcmkoYS52YWx1ZSkgPyBhLnZhbHVlIDogaXNMb2NhdGlvbihhLnZhbHVlKSA/IGEudmFsdWUudXJpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGFSYW5nZSA9IGlzTG9jYXRpb24oYS52YWx1ZSkgPyBhLnZhbHVlLnJhbmdlIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0YXJnZXRIYW5kbGUgIT09IHVuZGVmaW5lZCAmJiBpc1N0cmluZ1ZhcmlhYmxlRW50cnkoYSkgJiYgYS5oYW5kbGUgPT09IHRhcmdldEhhbmRsZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh0YXJnZXRVcmkgJiYgYVVyaSAmJiBpc0VxdWFsKHRhcmdldFVyaSwgYVVyaSkpIHtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXRSYW5nZSAmJiBhUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFJhbmdlLmVxdWFsc1JhbmdlKHRhcmdldFJhbmdlLCBhUmFuZ2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuICF0YXJnZXRSYW5nZSAmJiAhYVJhbmdlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGltcGxpY2l0Q29udGV4dFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEltcGxpY2l0Q29udGV4dEF0dGFjaG1lbnRXaWRnZXQsXG5cdFx0XHRcdCgpID0+IHRoaXMuX3dpZGdldCxcblx0XHRcdFx0aXNBdHRhY2htZW50QWxyZWFkeUF0dGFjaGVkLFxuXHRcdFx0XHR0aGlzLl9pbXBsaWNpdENvbnRleHQsXG5cdFx0XHRcdHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyxcblx0XHRcdFx0dGhpcy5fYXR0YWNobWVudE1vZGVsLFxuXHRcdFx0XHRjb250YWluZXIsXG5cdFx0XHQpO1xuXHRcdFx0c3RvcmUuYWRkKGltcGxpY2l0Q29udGV4dFdpZGdldCk7XG5cdFx0XHRoYXNJbXBsaWNpdENvbnRleHQgPSBpbXBsaWNpdENvbnRleHRXaWRnZXQuaGFzUmVuZGVyZWRDb250ZXh0cztcblx0XHR9XG5cblx0XHRkb20uc2V0VmlzaWJpbGl0eShCb29sZWFuKHRoaXMub3B0aW9ucy5yZW5kZXJJbnB1dFRvb2xiYXJCZWxvd0lucHV0IHx8IGhhc0F0dGFjaG1lbnRzIHx8IGhhc0ltcGxpY2l0Q29udGV4dCksIHRoaXMuYXR0YWNobWVudHNDb250YWluZXIpO1xuXHRcdGRvbS5zZXRWaXNpYmlsaXR5KGhhc0F0dGFjaG1lbnRzIHx8IGhhc0ltcGxpY2l0Q29udGV4dCwgdGhpcy5hdHRhY2hlZENvbnRleHRDb250YWluZXIpO1xuXHRcdGlmICghYXR0YWNobWVudHMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9pbmRleE9mTGFzdEF0dGFjaGVkQ29udGV4dERlbGV0ZWRXaXRoS2V5Ym9hcmQgPSAtMTtcblx0XHRcdHRoaXMuX2luZGV4T2ZMYXN0T3BlbmVkQ29udGV4dCA9IC0xO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgaW1hZ2VzIHRoYXQgZXhjZWVkIHRoZSBtb2RlbC1zcGVjaWZpYyBwZXItcmVxdWVzdCBsaW1pdCBzbyB0aGV5IHJlbmRlciB3aXRoIGEgd2FybmluZ1xuXHRcdGNvbnN0IG1heEltYWdlc1BlclJlcXVlc3QgPSBnZXRJbWFnZUF0dGFjaG1lbnRMaW1pdCh0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKT8ubWV0YWRhdGEpO1xuXHRcdGNvbnN0IGltYWdlQXR0YWNobWVudHMgPSBhdHRhY2htZW50cy5maWx0ZXIoKFssIGFdKSA9PiBpc0ltYWdlVmFyaWFibGVFbnRyeShhKSk7XG5cdFx0aWYgKG1heEltYWdlc1BlclJlcXVlc3QgIT09IHVuZGVmaW5lZCAmJiBpbWFnZUF0dGFjaG1lbnRzLmxlbmd0aCA+IG1heEltYWdlc1BlclJlcXVlc3QpIHtcblx0XHRcdGNvbnN0IGV4Y2Vzc0NvdW50ID0gaW1hZ2VBdHRhY2htZW50cy5sZW5ndGggLSBtYXhJbWFnZXNQZXJSZXF1ZXN0O1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBleGNlc3NDb3VudDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBpbWFnZUF0dGFjaG1lbnRzW2ldWzFdO1xuXHRcdFx0XHRpZiAoYXR0YWNobWVudC5vbWl0dGVkU3RhdGUgPT09IE9taXR0ZWRTdGF0ZS5Ob3RPbWl0dGVkIHx8IGF0dGFjaG1lbnQub21pdHRlZFN0YXRlID09PSBPbWl0dGVkU3RhdGUuSW1hZ2VMaW1pdEV4Y2VlZGVkKSB7XG5cdFx0XHRcdFx0YXR0YWNobWVudC5vbWl0dGVkU3RhdGUgPSBPbWl0dGVkU3RhdGUuSW1hZ2VMaW1pdEV4Y2VlZGVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGxldCBpID0gZXhjZXNzQ291bnQ7IGkgPCBpbWFnZUF0dGFjaG1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmIChpbWFnZUF0dGFjaG1lbnRzW2ldWzFdLm9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkltYWdlTGltaXRFeGNlZWRlZCkge1xuXHRcdFx0XHRcdGltYWdlQXR0YWNobWVudHNbaV1bMV0ub21pdHRlZFN0YXRlID0gT21pdHRlZFN0YXRlLk5vdE9taXR0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBbLCBhXSBvZiBpbWFnZUF0dGFjaG1lbnRzKSB7XG5cdFx0XHRcdGlmIChhLm9taXR0ZWRTdGF0ZSA9PT0gT21pdHRlZFN0YXRlLkltYWdlTGltaXRFeGNlZWRlZCkge1xuXHRcdFx0XHRcdGEub21pdHRlZFN0YXRlID0gT21pdHRlZFN0YXRlLk5vdE9taXR0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblxuXHRcdGZvciAoY29uc3QgW2luZGV4LCBhdHRhY2htZW50XSBvZiBhdHRhY2htZW50cykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuaXNVcmkoYXR0YWNobWVudC52YWx1ZSkgPyBhdHRhY2htZW50LnZhbHVlIDogaXNMb2NhdGlvbihhdHRhY2htZW50LnZhbHVlKSA/IGF0dGFjaG1lbnQudmFsdWUudXJpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBpc0xvY2F0aW9uKGF0dGFjaG1lbnQudmFsdWUpID8gYXR0YWNobWVudC52YWx1ZS5yYW5nZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNob3VsZEZvY3VzQ2xlYXJCdXR0b24gPSBpbmRleCA9PT0gTWF0aC5taW4odGhpcy5faW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkLCBhdHRhY2htZW50cy5sZW5ndGggLSAxKSAmJiB0aGlzLl9pbmRleE9mTGFzdEF0dGFjaGVkQ29udGV4dERlbGV0ZWRXaXRoS2V5Ym9hcmQgPiAtMTtcblxuXHRcdFx0bGV0IGF0dGFjaG1lbnRXaWRnZXQ7XG5cdFx0XHRjb25zdCBvcHRpb25zID0geyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uLCBzdXBwb3J0c0RlbGV0aW9uOiB0cnVlLCBpc0N1cnJlbnRJbnB1dDogdHJ1ZSB9O1xuXHRcdFx0Y29uc3QgbG0gPSB0aGlzLl9jdXJyZW50TGFuZ3VhZ2VNb2RlbC5nZXQoKTtcblx0XHRcdGlmIChhdHRhY2htZW50LmtpbmQgPT09ICd0b29sJyB8fCBhdHRhY2htZW50LmtpbmQgPT09ICd0b29sc2V0Jykge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUb29sU2V0T3JUb29sSXRlbUF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlICYmIGlzTm90ZWJvb2tPdXRwdXRWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rQ2VsbE91dHB1dENoYXRBdHRhY2htZW50V2lkZ2V0LCByZXNvdXJjZSwgYXR0YWNobWVudCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNQcm9tcHRGaWxlVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlQXR0YWNobWVudFdpZGdldCwgYXR0YWNobWVudCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRUZXh0QXR0YWNobWVudFdpZGdldCwgYXR0YWNobWVudCwgdW5kZWZpbmVkLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKHJlc291cmNlICYmIChhdHRhY2htZW50LmtpbmQgPT09ICdmaWxlJyB8fCBhdHRhY2htZW50LmtpbmQgPT09ICdkaXJlY3RvcnknKSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlQXR0YWNobWVudFdpZGdldCwgcmVzb3VyY2UsIHJhbmdlLCBhdHRhY2htZW50LCB1bmRlZmluZWQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGF0dGFjaG1lbnQua2luZCA9PT0gJ3Rlcm1pbmFsQ29tbWFuZCcpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxDb21tYW5kQXR0YWNobWVudFdpZGdldCwgYXR0YWNobWVudCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNJbWFnZVZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW1hZ2VBdHRhY2htZW50V2lkZ2V0LCByZXNvdXJjZSwgYXR0YWNobWVudCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNFbGVtZW50VmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbGVtZW50Q2hhdEF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzUGFzdGVWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBhc3RlQXR0YWNobWVudFdpZGdldCwgYXR0YWNobWVudCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNTQ01IaXN0b3J5SXRlbVZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU0NNSGlzdG9yeUl0ZW1BdHRhY2htZW50V2lkZ2V0LCBhdHRhY2htZW50LCBsbSwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fSBlbHNlIGlmIChpc1NDTUhpc3RvcnlJdGVtQ2hhbmdlVmFyaWFibGVFbnRyeShhdHRhY2htZW50KSkge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTQ01IaXN0b3J5SXRlbUNoYW5nZUF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZVZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudFdpZGdldCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU0NNSGlzdG9yeUl0ZW1DaGFuZ2VSYW5nZUF0dGFjaG1lbnRXaWRnZXQsIGF0dGFjaG1lbnQsIGxtLCBvcHRpb25zLCBjb250YWluZXIsIHRoaXMuX2NvbnRleHRSZXNvdXJjZUxhYmVscyk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzQnJvd3NlclZpZXdWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQpKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyb3dzZXJWaWV3QXR0YWNobWVudFdpZGdldCwgYXR0YWNobWVudCwgbG0sIG9wdGlvbnMsIGNvbnRhaW5lciwgdGhpcy5fY29udGV4dFJlc291cmNlTGFiZWxzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQgPSB0aGlzLl9jaGF0QXR0YWNobWVudFdpZGdldFJlZ2lzdHJ5LmNyZWF0ZVdpZGdldChhdHRhY2htZW50LCBvcHRpb25zLCBjb250YWluZXIpXG5cdFx0XHRcdFx0Pz8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWZhdWx0Q2hhdEF0dGFjaG1lbnRXaWRnZXQsIHJlc291cmNlLCByYW5nZSwgYXR0YWNobWVudCwgdW5kZWZpbmVkLCBsbSwgb3B0aW9ucywgY29udGFpbmVyLCB0aGlzLl9jb250ZXh0UmVzb3VyY2VMYWJlbHMpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2hvdWxkRm9jdXNDbGVhckJ1dHRvbikge1xuXHRcdFx0XHRhdHRhY2htZW50V2lkZ2V0LmVsZW1lbnQuZm9jdXMoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGluZGV4ID09PSBNYXRoLm1pbih0aGlzLl9pbmRleE9mTGFzdE9wZW5lZENvbnRleHQsIGF0dGFjaG1lbnRzLmxlbmd0aCAtIDEpKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnRXaWRnZXQuZWxlbWVudC5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5hZGQoYXR0YWNobWVudFdpZGdldCk7XG5cdFx0XHRzdG9yZS5hZGQoYXR0YWNobWVudFdpZGdldC5vbkRpZERlbGV0ZShlID0+IHtcblx0XHRcdFx0dGhpcy5oYW5kbGVBdHRhY2htZW50RGVsZXRpb24oZSwgaW5kZXgsIGF0dGFjaG1lbnQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRzdG9yZS5hZGQoYXR0YWNobWVudFdpZGdldC5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlQXR0YWNobWVudE9wZW4oaW5kZXgsIGF0dGFjaG1lbnQpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2luZGV4T2ZMYXN0T3BlbmVkQ29udGV4dCA9IC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBdHRhY2htZW50RGVsZXRpb24oZTogS2V5Ym9hcmRFdmVudCB8IHVua25vd24sIGluZGV4OiBudW1iZXIsIGF0dGFjaG1lbnQ6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpIHtcblx0XHQvLyBTZXQgZm9jdXMgdG8gdGhlIG5leHQgYXR0YWNoZWQgY29udGV4dCBpdGVtIGlmIGRlbGV0aW9uIHdhcyB0cmlnZ2VyZWQgYnkgYSBrZXlzdHJva2UgKHZzIGEgbW91c2UgY2xpY2spXG5cdFx0aWYgKGRvbS5pc0tleWJvYXJkRXZlbnQoZSkpIHtcblx0XHRcdHRoaXMuX2luZGV4T2ZMYXN0QXR0YWNoZWRDb250ZXh0RGVsZXRlZFdpdGhLZXlib2FyZCA9IGluZGV4O1xuXHRcdH1cblxuXHRcdHRoaXMuX2F0dGFjaG1lbnRNb2RlbC5kZWxldGUoYXR0YWNobWVudC5pZCk7XG5cblxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdjaGF0LmltcGxpY2l0Q29udGV4dC5lbmFibGVJbXBsaWNpdENvbnRleHQnKSkge1xuXHRcdFx0Ly8gaWYgY3VycmVudGx5IG9wZW5lZCBmaWxlIGlzIGRlbGV0ZWQsIGRvIG5vdCBzaG93IGltcGxpY2l0IGNvbnRleHRcblx0XHRcdGZvciAoY29uc3QgaW1wbGljaXRDb250ZXh0IG9mICh0aGlzLl9pbXBsaWNpdENvbnRleHQ/LnZhbHVlcyB8fCBbXSkpIHtcblx0XHRcdFx0Y29uc3QgaW1wbGljaXRWYWx1ZSA9IFVSSS5pc1VyaShpbXBsaWNpdENvbnRleHQ/LnZhbHVlKSAmJiBVUkkuaXNVcmkoYXR0YWNobWVudC52YWx1ZSkgJiYgaXNFcXVhbChpbXBsaWNpdENvbnRleHQudmFsdWUsIGF0dGFjaG1lbnQudmFsdWUpO1xuXG5cdFx0XHRcdGlmIChpbXBsaWNpdENvbnRleHQ/LmlzRmlsZSAmJiBpbXBsaWNpdFZhbHVlKSB7XG5cdFx0XHRcdFx0aW1wbGljaXRDb250ZXh0LmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmdldFJlbmRlcmFibGVBdHRhY2htZW50cygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGV4dC5maXJlKHsgcmVtb3ZlZDogW2F0dGFjaG1lbnRdIH0pO1xuXHRcdHRoaXMucmVuZGVyQXR0YWNoZWRDb250ZXh0KCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGF0dGFjaG1lbnRzIHRoYXQgYXJlIHJlbmRlcmVkIGFzIHBpbGxzIGluIHRoZSBpbnB1dC4gQWdlbnQtaG9zdFxuXHQgKiBjb21wbGV0aW9uIGVudHJpZXMgKHNraWxscy9jb21tYW5kcykgbGl2ZSBpbiB0aGUgbW9kZWwgc28gdGhlaXIgYF9tZXRhYFxuXHQgKiByZWFjaGVzIHRoZSBvdXRnb2luZyBtZXNzYWdlLCBidXQgdGhleSBhcmUgc2hvd24gYXMgaW5saW5lIGRlY29yYXRpb25zXG5cdCAqIHJhdGhlciB0aGFuIHBpbGxzLCBzbyB0aGV5IGFyZSBleGNsdWRlZCBoZXJlLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRSZW5kZXJhYmxlQXR0YWNobWVudHMoKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHtcblx0XHRyZXR1cm4gdGhpcy5hdHRhY2htZW50TW9kZWwuYXR0YWNobWVudHMuZmlsdGVyKGF0dGFjaG1lbnQgPT4gIWlzQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoYXR0YWNobWVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBdHRhY2htZW50T3BlbihpbmRleDogbnVtYmVyLCBhdHRhY2htZW50OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogdm9pZCB7XG5cdFx0dGhpcy5faW5kZXhPZkxhc3RPcGVuZWRDb250ZXh0ID0gaW5kZXg7XG5cdFx0dGhpcy5faW5kZXhPZkxhc3RBdHRhY2hlZENvbnRleHREZWxldGVkV2l0aEtleWJvYXJkID0gLTE7XG5cblx0XHRpZiAodGhpcy5nZXRSZW5kZXJhYmxlQXR0YWNobWVudHMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUF0dGFjaG1lbnROYXZpZ2F0aW9uKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICghZS5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpICYmICFlLmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBBcnJheS5mcm9tKHRoaXMuYXR0YWNoZWRDb250ZXh0Q29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpKTtcblx0XHRpZiAoIWF0dGFjaG1lbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0V2luZG93KHRoaXMuYXR0YWNobWVudHNDb250YWluZXIpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0Y29uc3QgY3VycmVudEluZGV4ID0gYXR0YWNobWVudHMuZmluZEluZGV4KGF0dGFjaG1lbnQgPT4gYXR0YWNobWVudCA9PT0gYWN0aXZlRWxlbWVudCk7XG5cdFx0bGV0IG5ld0luZGV4ID0gY3VycmVudEluZGV4O1xuXG5cdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuTGVmdEFycm93KSkge1xuXHRcdFx0bmV3SW5kZXggPSBjdXJyZW50SW5kZXggPiAwID8gY3VycmVudEluZGV4IC0gMSA6IGF0dGFjaG1lbnRzLmxlbmd0aCAtIDE7XG5cdFx0fSBlbHNlIGlmIChlLmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRuZXdJbmRleCA9IGN1cnJlbnRJbmRleCA8IGF0dGFjaG1lbnRzLmxlbmd0aCAtIDEgPyBjdXJyZW50SW5kZXggKyAxIDogMDtcblx0XHR9XG5cblx0XHRpZiAobmV3SW5kZXggIT09IC0xKSB7XG5cdFx0XHRjb25zdCBuZXh0RWxlbWVudCA9IGF0dGFjaG1lbnRzW25ld0luZGV4XSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdG5leHRFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbmRlckNoYXRUb2RvTGlzdFdpZGdldChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpIHtcblxuXHRcdGNvbnN0IGlzVG9kb1dpZGdldEVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvZG9zU2hvd1dpZGdldCkgIT09IGZhbHNlO1xuXHRcdGlmICghaXNUb2RvV2lkZ2V0RW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY2hhdElucHV0VG9kb0xpc3RXaWRnZXQudmFsdWUpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRFZGl0aW5nVG9kb3NEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VG9kb0xpc3RXaWRnZXQpKTtcblx0XHRcdHRoaXMuX2NoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0LnZhbHVlID0gd2lkZ2V0O1xuXG5cdFx0XHQvLyBBZGQgdGhlIHdpZGdldCdzIERPTSBub2RlIHRvIHRoZSBkZWRpY2F0ZWQgdG9kbyBsaXN0IGNvbnRhaW5lclxuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0Q29udGFpbmVyKTtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5jaGF0SW5wdXRUb2RvTGlzdFdpZGdldENvbnRhaW5lciwgd2lkZ2V0LmRvbU5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2NoYXRJbnB1dFRvZG9MaXN0V2lkZ2V0LnZhbHVlLnJlbmRlcihjaGF0U2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGNsZWFyVG9kb0xpc3RXaWRnZXQoc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIGZvcmNlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdElucHV0VG9kb0xpc3RXaWRnZXQudmFsdWU/LmNsZWFyKHNlc3Npb25SZXNvdXJjZSwgZm9yY2UpO1xuXHR9XG5cblx0cmVuZGVyQXJ0aWZhY3RzV2lkZ2V0KGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5BcnRpZmFjdHNFbmFibGVkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY2hhdEFydGlmYWN0c1dpZGdldC52YWx1ZSkge1xuXHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QXJ0aWZhY3RzV2lkZ2V0KSk7XG5cdFx0XHR0aGlzLl9jaGF0QXJ0aWZhY3RzV2lkZ2V0LnZhbHVlID0gd2lkZ2V0O1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRBcnRpZmFjdHNXaWRnZXRDb250YWluZXIpO1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmNoYXRBcnRpZmFjdHNXaWRnZXRDb250YWluZXIsIHdpZGdldC5kb21Ob2RlKTtcblx0XHR9XG5cdFx0dGhpcy5fY2hhdEFydGlmYWN0c1dpZGdldC52YWx1ZS5zZXRTZXNzaW9uUmVzb3VyY2UoY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRjbGVhckFydGlmYWN0c1dpZGdldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0QXJ0aWZhY3RzV2lkZ2V0LnZhbHVlPy5zZXRTZXNzaW9uUmVzb3VyY2UodW5kZWZpbmVkKTtcblx0fVxuXG5cdHJlbmRlclF1ZXN0aW9uQ2Fyb3VzZWwoY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIG9wdGlvbnM6IElDaGF0UXVlc3Rpb25DYXJvdXNlbE9wdGlvbnMpOiBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQge1xuXG5cdFx0Y29uc3QgY2Fyb3VzZWxLZXkgPSBjYXJvdXNlbC5yZXNvbHZlSWQgPz8gYCR7aXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgPyBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkIDogJyd9XyR7Y29udGV4dC5jb250ZW50SW5kZXh9YDtcblxuXHRcdC8vIElmIGEgY2Fyb3VzZWwgd2l0aCB0aGUgc2FtZSBrZXkgYWxyZWFkeSBleGlzdHMsIHJldHVybiBpdFxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLmdldChjYXJvdXNlbEtleSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgdGhlIHJlc3BvbnNlIGlkIGFuZCBzZXNzaW9uIGZvciB0aGlzIGNhcm91c2VsXG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLl9xdWVzdGlvbkNhcm91c2VsUmVzcG9uc2VJZHMuc2V0KGNhcm91c2VsS2V5LCBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkKTtcblx0XHRcdHRoaXMuX3F1ZXN0aW9uQ2Fyb3VzZWxTZXNzaW9uUmVzb3VyY2VzLnNldChjYXJvdXNlbEtleSwgY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxQYXJ0LCBjYXJvdXNlbCwgY29udGV4dCwgb3B0aW9ucyk7XG5cdFx0dGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLnNldChjYXJvdXNlbEtleSwgcGFydCk7XG5cdFx0dGhpcy5faGFzUXVlc3Rpb25DYXJvdXNlbENvbnRleHRLZXk/LnNldCh0cnVlKTtcblxuXHRcdGRvbS5hcHBlbmQodGhpcy5jaGF0UXVlc3Rpb25DYXJvdXNlbENvbnRhaW5lciwgcGFydC5kb21Ob2RlKTtcblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0Y2xlYXJRdWVzdGlvbkNhcm91c2VsKHJlc3BvbnNlSWQ/OiBzdHJpbmcsIHJlc29sdmVJZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChyZXNvbHZlSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gUmVtb3ZlIGEgc3BlY2lmaWMgY2Fyb3VzZWwgYnkgcmVzb2x2ZUlkXG5cdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5fY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxXaWRnZXRzLmdldChyZXNvbHZlSWQpO1xuXHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0cGFydC5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMuZGVsZXRlQW5kRGlzcG9zZShyZXNvbHZlSWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcXVlc3Rpb25DYXJvdXNlbFJlc3BvbnNlSWRzLmRlbGV0ZShyZXNvbHZlSWQpO1xuXHRcdFx0dGhpcy5fcXVlc3Rpb25DYXJvdXNlbFNlc3Npb25SZXNvdXJjZXMuZGVsZXRlKHJlc29sdmVJZCk7XG5cdFx0fSBlbHNlIGlmIChyZXNwb25zZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIFJlbW92ZSBhbGwgY2Fyb3VzZWxzIGFzc29jaWF0ZWQgd2l0aCBhIGdpdmVuIHJlc3BvbnNlSWRcblx0XHRcdGZvciAoY29uc3QgW2tleSwgcmlkXSBvZiB0aGlzLl9xdWVzdGlvbkNhcm91c2VsUmVzcG9uc2VJZHMpIHtcblx0XHRcdFx0aWYgKHJpZCA9PT0gcmVzcG9uc2VJZCkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMuZ2V0KGtleSk7XG5cdFx0XHRcdFx0aWYgKHBhcnQpIHtcblx0XHRcdFx0XHRcdHBhcnQuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdFx0XHRcdHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsV2lkZ2V0cy5kZWxldGVBbmREaXNwb3NlKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3F1ZXN0aW9uQ2Fyb3VzZWxSZXNwb25zZUlkcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHR0aGlzLl9xdWVzdGlvbkNhcm91c2VsU2Vzc2lvblJlc291cmNlcy5kZWxldGUoa2V5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBDbGVhciBhbGwgY2Fyb3VzZWxzXG5cdFx0XHR0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0XHR0aGlzLl9xdWVzdGlvbkNhcm91c2VsUmVzcG9uc2VJZHMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3F1ZXN0aW9uQ2Fyb3VzZWxTZXNzaW9uUmVzb3VyY2VzLmNsZWFyKCk7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY2hhdFF1ZXN0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHRcdH1cblx0XHR0aGlzLl9oYXNRdWVzdGlvbkNhcm91c2VsQ29udGV4dEtleT8uc2V0KHRoaXMuX2NoYXRRdWVzdGlvbkNhcm91c2VsV2lkZ2V0cy5zaXplID4gMCk7XG5cdH1cblxuXHRnZXQgcXVlc3Rpb25DYXJvdXNlbCgpOiBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQgfCB1bmRlZmluZWQge1xuXHRcdC8vIFJldHVybiB0aGUgZm9jdXNlZCBjYXJvdXNlbCwgb3IgdGhlIGZpcnN0IG9uZVxuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChwYXJ0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMuc2l6ZSA+IDAgPyB0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMudmFsdWVzKCkubmV4dCgpLnZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Zm9jdXNRdWVzdGlvbkNhcm91c2VsKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNhcm91c2VsID0gdGhpcy5xdWVzdGlvbkNhcm91c2VsO1xuXHRcdGlmIChjYXJvdXNlbCkge1xuXHRcdFx0Y2Fyb3VzZWwuZm9jdXMoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpc1F1ZXN0aW9uQ2Fyb3VzZWxGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLl9jaGF0UXVlc3Rpb25DYXJvdXNlbFdpZGdldHMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChwYXJ0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG5hdmlnYXRlVG9QcmV2aW91c1F1ZXN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNhcm91c2VsID0gdGhpcy5xdWVzdGlvbkNhcm91c2VsO1xuXHRcdHJldHVybiBjYXJvdXNlbD8ubmF2aWdhdGVUb1ByZXZpb3VzUXVlc3Rpb24oKSA/PyBmYWxzZTtcblx0fVxuXG5cdG5hdmlnYXRlVG9OZXh0UXVlc3Rpb24oKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB0aGlzLnF1ZXN0aW9uQ2Fyb3VzZWw7XG5cdFx0cmV0dXJuIGNhcm91c2VsPy5uYXZpZ2F0ZVRvTmV4dFF1ZXN0aW9uKCkgPz8gZmFsc2U7XG5cdH1cblxuXHRmb2N1c1F1ZXN0aW9uQ2Fyb3VzZWxUZXJtaW5hbCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBjYXJvdXNlbCA9IHRoaXMucXVlc3Rpb25DYXJvdXNlbDtcblx0XHRyZXR1cm4gY2Fyb3VzZWw/LmZvY3VzVGVybWluYWwoKSA/PyBmYWxzZTtcblx0fVxuXG5cdC8vIC0tLSBQbGFuIFJldmlldyAtLS1cblxuXHRyZW5kZXJQbGFuUmV2aWV3KHJldmlldzogSUNoYXRQbGFuUmV2aWV3LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgb3B0aW9uczogSUNoYXRQbGFuUmV2aWV3UGFydE9wdGlvbnMpOiBDaGF0UGxhblJldmlld1BhcnQge1xuXHRcdGNvbnN0IGtleSA9IHJldmlldy5yZXNvbHZlSWQgPz8gYCR7aXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgPyBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkIDogJyd9XyR7Y29udGV4dC5jb250ZW50SW5kZXh9YDtcblxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhdFBsYW5SZXZpZXdXaWRnZXRzLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0dGhpcy5fcGxhblJldmlld1Jlc3BvbnNlSWRzLnNldChrZXksIGNvbnRleHQuZWxlbWVudC5yZXF1ZXN0SWQpO1xuXHRcdFx0dGhpcy5fcGxhblJldmlld1Nlc3Npb25SZXNvdXJjZXMuc2V0KGtleSwgY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFBsYW5SZXZpZXdQYXJ0LCByZXZpZXcsIGNvbnRleHQsIG9wdGlvbnMpO1xuXHRcdHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy5zZXQoa2V5LCBwYXJ0KTtcblx0XHRkb20uYXBwZW5kKHRoaXMuY2hhdFBsYW5SZXZpZXdDb250YWluZXIsIHBhcnQuZG9tTm9kZSk7XG5cblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdGNsZWFyUGxhblJldmlldyhyZXNwb25zZUlkPzogc3RyaW5nLCByZXNvbHZlSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAocmVzb2x2ZUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9jaGF0UGxhblJldmlld1dpZGdldHMuZ2V0KHJlc29sdmVJZCk7XG5cdFx0XHRpZiAocGFydCkge1xuXHRcdFx0XHRwYXJ0LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHRcdHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy5kZWxldGVBbmREaXNwb3NlKHJlc29sdmVJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wbGFuUmV2aWV3UmVzcG9uc2VJZHMuZGVsZXRlKHJlc29sdmVJZCk7XG5cdFx0XHR0aGlzLl9wbGFuUmV2aWV3U2Vzc2lvblJlc291cmNlcy5kZWxldGUocmVzb2x2ZUlkKTtcblx0XHR9IGVsc2UgaWYgKHJlc3BvbnNlSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCByaWRdIG9mIHRoaXMuX3BsYW5SZXZpZXdSZXNwb25zZUlkcykge1xuXHRcdFx0XHRpZiAocmlkID09PSByZXNwb25zZUlkKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFydCA9IHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy5nZXQoa2V5KTtcblx0XHRcdFx0XHRpZiAocGFydCkge1xuXHRcdFx0XHRcdFx0cGFydC5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2hhdFBsYW5SZXZpZXdXaWRnZXRzLmRlbGV0ZUFuZERpc3Bvc2Uoa2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fcGxhblJldmlld1Jlc3BvbnNlSWRzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHRcdHRoaXMuX3BsYW5SZXZpZXdTZXNzaW9uUmVzb3VyY2VzLmRlbGV0ZShrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NoYXRQbGFuUmV2aWV3V2lkZ2V0cy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHRcdHRoaXMuX3BsYW5SZXZpZXdSZXNwb25zZUlkcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fcGxhblJldmlld1Nlc3Npb25SZXNvdXJjZXMuY2xlYXIoKTtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5jaGF0UGxhblJldmlld0NvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHBsYW5SZXZpZXcoKTogQ2hhdFBsYW5SZXZpZXdQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdFBsYW5SZXZpZXdXaWRnZXRzLnNpemUgPiAwID8gdGhpcy5fY2hhdFBsYW5SZXZpZXdXaWRnZXRzLnZhbHVlcygpLm5leHQoKS52YWx1ZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIC0tLSBUb29sIENvbmZpcm1hdGlvbiBDYXJvdXNlbCAtLS1cblxuXHRwcml2YXRlIGdldCBfY3VycmVudFNlc3Npb25LZXkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0Py52aWV3TW9kZWw/Lm1vZGVsLnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2N1cnJlbnRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwoKTogQ2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbFBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2N1cnJlbnRTZXNzaW9uS2V5O1xuXHRcdHJldHVybiBrZXkgPyB0aGlzLl9jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2Vscy5nZXQoa2V5KSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlbmRlclRvb2xDb25maXJtYXRpb25DYXJvdXNlbCh0b29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLCBmYWN0b3J5OiBUb29sSW52b2NhdGlvblBhcnRGYWN0b3J5LCBzdWJBZ2VudEludm9jYXRpb25JZD86IHN0cmluZywgYWdlbnROYW1lPzogc3RyaW5nLCByZXZlYWxTdWJhZ2VudD86IFJldmVhbFN1YmFnZW50Q2FsbGJhY2ssIHJldmVhbFN1YmFnZW50TGFiZWw/OiBzdHJpbmcsIHRvb2xQYXJ0PzogQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCk6IENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2N1cnJlbnRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWw7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5hZGRUb29sSW52b2NhdGlvbih0b29sLCBzdWJBZ2VudEludm9jYXRpb25JZCwgYWdlbnROYW1lLCByZXZlYWxTdWJhZ2VudCwgcmV2ZWFsU3ViYWdlbnRMYWJlbCwgdG9vbFBhcnQpO1xuXHRcdFx0dGhpcy51cGRhdGVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxNYXhIZWlnaHQoKTtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSB0aGlzLl9jdXJyZW50U2Vzc2lvbktleTtcblx0XHRpZiAoIWtleSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgcmVuZGVyIHRvb2wgY29uZmlybWF0aW9uIGNhcm91c2VsIHdpdGhvdXQgYW4gYWN0aXZlIHNlc3Npb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJ0ID0gbmV3IENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0KGZhY3RvcnksIFtdLCByZXZlYWxTdWJhZ2VudCwgcmV2ZWFsU3ViYWdlbnRMYWJlbCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSk7XG5cdFx0cGFydC5hZGRUb29sSW52b2NhdGlvbih0b29sLCBzdWJBZ2VudEludm9jYXRpb25JZCwgYWdlbnROYW1lLCByZXZlYWxTdWJhZ2VudCwgcmV2ZWFsU3ViYWdlbnRMYWJlbCwgdG9vbFBhcnQpO1xuXHRcdHRoaXMuX2NoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxzLnNldChrZXksIHBhcnQpO1xuXHRcdGNvbnN0IGNhcHR1cmVkS2V5ID0ga2V5O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHBhcnQub25EaWRDaGFuZ2VBY3RpdmVTdWJhZ2VudChpZCA9PiB7XG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFNlc3Npb25LZXkgPT09IGNhcHR1cmVkS2V5KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnQuZmlyZShpZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmICh0aGlzLl9jdXJyZW50U2Vzc2lvbktleSA9PT0gY2FwdHVyZWRLZXkpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnQuZmlyZShwYXJ0LmFjdGl2ZVN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0XHR9XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIsIHBhcnQuZG9tTm9kZSk7XG5cdFx0ZG9tLnNob3codGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyKTtcblx0XHR0aGlzLnVwZGF0ZVRvb2xDb25maXJtYXRpb25DYXJvdXNlbE1heEhlaWdodCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZShwYXJ0Lm9uRGlkRW1wdHkpKCgpID0+IHtcblx0XHRcdHRoaXMuX2NoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxzLmRlbGV0ZUFuZERpc3Bvc2UoY2FwdHVyZWRLZXkpO1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRTZXNzaW9uS2V5ID09PSBjYXB0dXJlZEtleSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50LmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHRcdFx0XHRkb20uaGlkZSh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0YWRkVG9vbFRvQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbiwgZmFjdG9yeTogVG9vbEludm9jYXRpb25QYXJ0RmFjdG9yeSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmcsIGFnZW50TmFtZT86IHN0cmluZywgcmV2ZWFsU3ViYWdlbnQ/OiBSZXZlYWxTdWJhZ2VudENhbGxiYWNrLCByZXZlYWxTdWJhZ2VudExhYmVsPzogc3RyaW5nLCB0b29sUGFydD86IENoYXRUb29sSW52b2NhdGlvblBhcnQpOiB2b2lkIHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2N1cnJlbnRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWw7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5hZGRUb29sSW52b2NhdGlvbih0b29sLCBzdWJBZ2VudEludm9jYXRpb25JZCwgYWdlbnROYW1lLCByZXZlYWxTdWJhZ2VudCwgcmV2ZWFsU3ViYWdlbnRMYWJlbCwgdG9vbFBhcnQpO1xuXHRcdFx0dGhpcy51cGRhdGVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxNYXhIZWlnaHQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbCwgZmFjdG9yeSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSwgcmV2ZWFsU3ViYWdlbnQsIHJldmVhbFN1YmFnZW50TGFiZWwsIHRvb2xQYXJ0KTtcblx0XHR9XG5cdH1cblxuXHRnZXQgYWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnRJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsPy5hY3RpdmVTdWJBZ2VudEludm9jYXRpb25JZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBOYXZpZ2F0ZXMgdGhlIGNhcm91c2VsIHRvIHRoZSBmaXJzdCBwZW5kaW5nIHRvb2wgZnJvbSB0aGUgZ2l2ZW4gc3ViYWdlbnQuXG5cdCAqL1xuXHRhY3RpdmF0ZUNhcm91c2VsRm9yU3ViYWdlbnQoc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWw/LmFjdGl2YXRlRmlyc3RUb29sRm9yU3ViYWdlbnQoc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHR9XG5cblx0aGFzVG9vbEluQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbENhbGxJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1cnJlbnRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWw/Lmhhc1Rvb2xJbnZvY2F0aW9uKHRvb2xDYWxsSWQpID8/IGZhbHNlO1xuXHR9XG5cblx0Z2V0IGhhc0FjdGl2ZVRvb2xDb25maXJtYXRpb25DYXJvdXNlbCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBjYXJvdXNlbCA9IHRoaXMuX2N1cnJlbnRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWw7XG5cdFx0cmV0dXJuICEhY2Fyb3VzZWwgJiYgY2Fyb3VzZWwucGVuZGluZ0NvdW50ID4gMDtcblx0fVxuXG5cdGNsZWFyVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsKCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2N1cnJlbnRTZXNzaW9uS2V5O1xuXHRcdGlmIChrZXkpIHtcblx0XHRcdHRoaXMuX2NoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxzLmRlbGV0ZUFuZERpc3Bvc2Uoa2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb25maXJtYXRpb25TdWJhZ2VudC5maXJlKHVuZGVmaW5lZCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHRcdGRvbS5oaWRlKHRoaXMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcik7XG5cdH1cblxuXHQvKipcblx0ICogU3dhcHMgdGhlIHZpc2libGUgdG9vbCBjb25maXJtYXRpb24gY2Fyb3VzZWwgd2hlbiBzd2l0Y2hpbmcgc2Vzc2lvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF9zeW5jVG9vbENvbmZpcm1hdGlvbkNhcm91c2VsRm9yU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lcik7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsO1xuXHRcdGlmIChjYXJvdXNlbCAmJiBjYXJvdXNlbC5wZW5kaW5nQ291bnQgPiAwKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRoaXMuY2hhdFRvb2xDb25maXJtYXRpb25DYXJvdXNlbENvbnRhaW5lciwgY2Fyb3VzZWwuZG9tTm9kZSk7XG5cdFx0XHRkb20uc2hvdyh0aGlzLmNoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxDb250YWluZXIpO1xuXHRcdFx0dGhpcy51cGRhdGVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxNYXhIZWlnaHQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZG9tLmhpZGUodGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVDb25maXJtYXRpb25TdWJhZ2VudC5maXJlKGNhcm91c2VsPy5hY3RpdmVTdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdH1cblxuXHRzZXRXb3JraW5nU2V0Q29sbGFwc2VkKGNvbGxhcHNlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtpbmdTZXRDb2xsYXBzZWQuc2V0KGNvbGxhcHNlZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHJlbmRlckNoYXRFZGl0aW5nU2Vzc2lvblN0YXRlKGNoYXRFZGl0aW5nU2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiB8IG51bGwpIHtcblx0XHRkb20uc2V0VmlzaWJpbGl0eShCb29sZWFuKGNoYXRFZGl0aW5nU2Vzc2lvbiksIHRoaXMuY2hhdEVkaXRpbmdTZXNzaW9uV2lkZ2V0Q29udGFpbmVyKTtcblxuXHRcdGlmIChjaGF0RWRpdGluZ1Nlc3Npb24pIHtcblx0XHRcdGlmICghaXNFcXVhbChjaGF0RWRpdGluZ1Nlc3Npb24uY2hhdFNlc3Npb25SZXNvdXJjZSwgdGhpcy5fbGFzdEVkaXRpbmdTZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtpbmdTZXRDb2xsYXBzZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sYXN0RWRpdGluZ1Nlc3Npb25SZXNvdXJjZSA9IGNoYXRFZGl0aW5nU2Vzc2lvbi5jaGF0U2Vzc2lvblJlc291cmNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGlmaWVkRW50cmllcyA9IGRlcml2ZWRPcHRzPElNb2RpZmllZEZpbGVFbnRyeVtdPih7IGVxdWFsc0ZuOiBhcnJheXNFcXVhbCB9LCByID0+IHtcblx0XHRcdC8vIEJhY2tncm91bmQgY2hhdCBzZXNzaW9ucyByZW5kZXIgdGhlIHdvcmtpbmcgc2V0IGJhc2VkIG9uIHRoZSBzZXNzaW9uIGZpbGVzLCBhbmQgbm90IHRoZSBlZGl0aW5nIHNlc3Npb25cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGNoYXRFZGl0aW5nU2Vzc2lvbj8uY2hhdFNlc3Npb25SZXNvdXJjZSA/PyB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSA9PT0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gY2hhdEVkaXRpbmdTZXNzaW9uPy5lbnRyaWVzLnJlYWQocikuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnN0YXRlLnJlYWQocikgPT09IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpIHx8IFtdO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZWRpdFNlc3Npb25FbnRyaWVzID0gZGVyaXZlZCgocmVhZGVyKTogSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtW10gPT4ge1xuXHRcdFx0Y29uc3Qgc2VlbkVudHJpZXMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdGNvbnN0IGVudHJpZXM6IElDaGF0Q29sbGFwc2libGVMaXN0SXRlbVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIG1vZGlmaWVkRW50cmllcy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aWYgKGVudHJ5LnN0YXRlLnJlYWQocmVhZGVyKSAhPT0gTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5Nb2RpZmllZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFzZWVuRW50cmllcy5oYXMoZW50cnkubW9kaWZpZWRVUkkpKSB7XG5cdFx0XHRcdFx0c2VlbkVudHJpZXMuYWRkKGVudHJ5Lm1vZGlmaWVkVVJJKTtcblx0XHRcdFx0XHRjb25zdCBsaW5lc0FkZGVkID0gZW50cnkubGluZXNBZGRlZD8ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGNvbnN0IGxpbmVzUmVtb3ZlZCA9IGVudHJ5LmxpbmVzUmVtb3ZlZD8ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7XG5cdFx0XHRcdFx0XHRyZWZlcmVuY2U6IGVudHJ5Lm1vZGlmaWVkVVJJLFxuXHRcdFx0XHRcdFx0c3RhdGU6IE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQsXG5cdFx0XHRcdFx0XHRraW5kOiAncmVmZXJlbmNlJyxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdGRpZmZNZXRhOiB7IGFkZGVkOiBsaW5lc0FkZGVkID8/IDAsIHJlbW92ZWQ6IGxpbmVzUmVtb3ZlZCA/PyAwIH0sXG5cdFx0XHRcdFx0XHRcdGlzRGVsZXRpb246ICEhZW50cnkuaXNEZWxldGlvbixcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6IGVudHJ5LmlzRGVsZXRpb24gPyBlbnRyeS5vcmlnaW5hbFVSSSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRlbnRyaWVzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0aWYgKGEua2luZCA9PT0gJ3JlZmVyZW5jZScgJiYgYi5raW5kID09PSAncmVmZXJlbmNlJykge1xuXHRcdFx0XHRcdGlmIChhLnN0YXRlID09PSBiLnN0YXRlIHx8IGEuc3RhdGUgPT09IHVuZGVmaW5lZCB8fCBiLnN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBhLnJlZmVyZW5jZS50b1N0cmluZygpLmxvY2FsZUNvbXBhcmUoYi5yZWZlcmVuY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhLnN0YXRlIC0gYi5zdGF0ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gZW50cmllcztcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlc3Npb25GaWxlQ2hhbmdlcyA9IG9ic2VydmFibGVGcm9tRXZlbnQoXG5cdFx0XHR0aGlzLFxuXHRcdFx0dGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zLFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gSXRlcmFibGUuZW1wdHkoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRyZXR1cm4gbW9kZWw/LmNoYW5nZXMgaW5zdGFuY2VvZiBBcnJheSA/IG1vZGVsLmNoYW5nZXMgOiBJdGVyYWJsZS5lbXB0eSgpO1xuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbkZpbGVzID0gZGVyaXZlZChyZWFkZXIgPT5cblx0XHRcdHNlc3Npb25GaWxlQ2hhbmdlcy5yZWFkKHJlYWRlcikubWFwKChlbnRyeSk6IElDaGF0Q29sbGFwc2libGVMaXN0SXRlbSA9PiAoe1xuXHRcdFx0XHRyZWZlcmVuY2U6IGlzSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTIoZW50cnkpXG5cdFx0XHRcdFx0PyBlbnRyeS5tb2RpZmllZFVyaSA/PyBlbnRyeS51cmlcblx0XHRcdFx0XHQ6IGVudHJ5Lm1vZGlmaWVkVXJpLFxuXHRcdFx0XHRzdGF0ZTogTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCxcblx0XHRcdFx0a2luZDogJ3JlZmVyZW5jZScsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRkaWZmTWV0YTogeyBhZGRlZDogZW50cnkuaW5zZXJ0aW9ucywgcmVtb3ZlZDogZW50cnkuZGVsZXRpb25zIH0sXG5cdFx0XHRcdFx0aXNEZWxldGlvbjogZW50cnkubW9kaWZpZWRVcmkgPT09IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogZW50cnkub3JpZ2luYWxVcmksXG5cdFx0XHRcdFx0c3RhdHVzOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0fSkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHNob3VsZFJlbmRlciA9IGRlcml2ZWQocmVhZGVyID0+XG5cdFx0XHRlZGl0U2Vzc2lvbkVudHJpZXMucmVhZChyZWFkZXIpLmxlbmd0aCA+IDAgfHwgc2Vzc2lvbkZpbGVzLnJlYWQocmVhZGVyKS5sZW5ndGggPiAwKTtcblxuXHRcdHRoaXMuX3JlbmRlcmluZ0NoYXRFZGl0cy52YWx1ZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMucmVuZGVyV29ya2luZ1NldCAmJiBzaG91bGRSZW5kZXIucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyQ2hhdEVkaXRpbmdTZXNzaW9uV2l0aEVudHJpZXMoXG5cdFx0XHRcdFx0cmVhZGVyLnN0b3JlLFxuXHRcdFx0XHRcdGNoYXRFZGl0aW5nU2Vzc2lvbixcblx0XHRcdFx0XHRlZGl0U2Vzc2lvbkVudHJpZXMsXG5cdFx0XHRcdFx0c2Vzc2lvbkZpbGVzXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY2hhdEVkaXRpbmdTZXNzaW9uV2lkZ2V0Q29udGFpbmVyKTtcblx0XHRcdFx0dGhpcy5fY2hhdEVkaXRzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fY2hhdEVkaXRMaXN0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cdHByaXZhdGUgcmVuZGVyQ2hhdEVkaXRpbmdTZXNzaW9uV2l0aEVudHJpZXMoXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRjaGF0RWRpdGluZ1Nlc3Npb246IElDaGF0RWRpdGluZ1Nlc3Npb24gfCBudWxsLFxuXHRcdGVkaXRTZXNzaW9uRW50cmllc09iczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUNoYXRDb2xsYXBzaWJsZUxpc3RJdGVtW10+LFxuXHRcdHNlc3Npb25FbnRyaWVzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQ2hhdENvbGxhcHNpYmxlTGlzdEl0ZW1bXT5cblx0KSB7XG5cdFx0Ly8gU3VtbWFyeSBvZiBudW1iZXIgb2YgZmlsZXMgY2hhbmdlZFxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGlubmVyQ29udGFpbmVyID0gdGhpcy5jaGF0RWRpdGluZ1Nlc3Npb25XaWRnZXRDb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtZWRpdGluZy1zZXNzaW9uLWNvbnRhaW5lci5zaG93LWZpbGUtaWNvbnMnKSBhcyBIVE1MRWxlbWVudCA/PyBkb20uYXBwZW5kKHRoaXMuY2hhdEVkaXRpbmdTZXNzaW9uV2lkZ2V0Q29udGFpbmVyLCAkKCcuY2hhdC1lZGl0aW5nLXNlc3Npb24tY29udGFpbmVyLnNob3ctZmlsZS1pY29ucycpKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IG92ZXJ2aWV3UmVnaW9uID0gaW5uZXJDb250YWluZXIucXVlcnlTZWxlY3RvcignLmNoYXQtZWRpdGluZy1zZXNzaW9uLW92ZXJ2aWV3JykgYXMgSFRNTEVsZW1lbnQgPz8gZG9tLmFwcGVuZChpbm5lckNvbnRhaW5lciwgJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLW92ZXJ2aWV3JykpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IG92ZXJ2aWV3VGl0bGUgPSBvdmVydmlld1JlZ2lvbi5xdWVyeVNlbGVjdG9yKCcud29ya2luZy1zZXQtdGl0bGUnKSBhcyBIVE1MRWxlbWVudCA/PyBkb20uYXBwZW5kKG92ZXJ2aWV3UmVnaW9uLCAkKCcud29ya2luZy1zZXQtdGl0bGUnKSk7XG5cblx0XHQvLyBDbGVhciBvdXQgdGhlIHByZXZpb3VzIGFjdGlvbnMgKGlmIGFueSlcblx0XHR0aGlzLl9jaGF0RWRpdHNBY3Rpb25zRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIENoYXQgZWRpdGluZyBzZXNzaW9uIGFjdGlvbnNcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBhY3Rpb25zQ29udGFpbmVyID0gb3ZlcnZpZXdSZWdpb24ucXVlcnlTZWxlY3RvcignLmNoYXQtZWRpdGluZy1zZXNzaW9uLWFjdGlvbnMnKSBhcyBIVE1MRWxlbWVudCA/PyBkb20uYXBwZW5kKG92ZXJ2aWV3UmVnaW9uLCAkKCcuY2hhdC1lZGl0aW5nLXNlc3Npb24tYWN0aW9ucycpKTtcblxuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGNoYXRFZGl0aW5nU2Vzc2lvbj8uY2hhdFNlc3Npb25SZXNvdXJjZSB8fCB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9jaGF0RWRpdHNBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKGFjdGlvbnNDb250YWluZXIpKTtcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRzY29wZWRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvblR5cGUua2V5LCBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSk7XG5cblx0XHRcdC8vIE1ldGFkYXRhIGNhbiBhcnJpdmUgYWZ0ZXIgZmlyc3QgcmVuZGVyLCBzbyB0cmFjayBpdCByYXRoZXIgdGhhbiBzYW1wbGluZyBvbmNlLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvblB1bGxSZXF1ZXN0ID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdFx0dGhpcyxcblx0XHRcdFx0dGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybiBzZXNzaW9uID8gZ2V0QWdlbnRTZXNzaW9uUHVsbFJlcXVlc3RDb250ZXh0VmFsdWUoc2Vzc2lvbikgOiAnJztcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9jaGF0RWRpdHNBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKGJpbmRDb250ZXh0S2V5KENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25QdWxsUmVxdWVzdCwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHIgPT4gc2Vzc2lvblB1bGxSZXF1ZXN0LnJlYWQocikpKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jaGF0RWRpdHNBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKGJpbmRDb250ZXh0S2V5KENoYXRDb250ZXh0S2V5cy5oYXNBZ2VudFNlc3Npb25DaGFuZ2VzLCBzY29wZWRDb250ZXh0S2V5U2VydmljZSwgciA9PiAhIXNlc3Npb25FbnRyaWVzT2JzLnJlYWQocik/Lmxlbmd0aCkpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9jaGF0RWRpdHNBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdC8vIFdvcmtpbmcgc2V0XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgd29ya2luZ1NldENvbnRhaW5lciA9IGlubmVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWVkaXRpbmctc2Vzc2lvbi1saXN0JykgYXMgSFRNTEVsZW1lbnQgPz8gZG9tLmFwcGVuZChpbm5lckNvbnRhaW5lciwgJCgnLmNoYXQtZWRpdGluZy1zZXNzaW9uLWxpc3QnKSk7XG5cblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9jaGF0RWRpdHNBY3Rpb25zRGlzcG9zYWJsZXMuYWRkKG5ldyBCdXR0b25XaXRoSWNvbihvdmVydmlld1RpdGxlLCB7XG5cdFx0XHRzdXBwb3J0SWNvbnM6IHRydWUsXG5cdFx0XHRzZWNvbmRhcnk6IHRydWUsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdjaGF0RWRpdGluZ1Nlc3Npb24udG9nZ2xlV29ya2luZ1NldCcsICdUb2dnbGUgY2hhbmdlZCBmaWxlcy4nKSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCB0b3BMZXZlbFN0YXRzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZW50cmllcyA9IGVkaXRTZXNzaW9uRW50cmllc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzZXNzaW9uRW50cmllcyA9IHNlc3Npb25FbnRyaWVzT2JzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0bGV0IGFkZGVkID0gMCwgcmVtb3ZlZCA9IDA7XG5cblx0XHRcdGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdFx0aWYgKGVudHJ5LmtpbmQgPT09ICdyZWZlcmVuY2UnICYmIGVudHJ5Lm9wdGlvbnM/LmRpZmZNZXRhKSB7XG5cdFx0XHRcdFx0XHRhZGRlZCArPSBlbnRyeS5vcHRpb25zLmRpZmZNZXRhLmFkZGVkO1xuXHRcdFx0XHRcdFx0cmVtb3ZlZCArPSBlbnRyeS5vcHRpb25zLmRpZmZNZXRhLnJlbW92ZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHNlc3Npb25FbnRyaWVzKSB7XG5cdFx0XHRcdFx0aWYgKGVudHJ5LmtpbmQgPT09ICdyZWZlcmVuY2UnICYmIGVudHJ5Lm9wdGlvbnM/LmRpZmZNZXRhKSB7XG5cdFx0XHRcdFx0XHRhZGRlZCArPSBlbnRyeS5vcHRpb25zLmRpZmZNZXRhLmFkZGVkO1xuXHRcdFx0XHRcdFx0cmVtb3ZlZCArPSBlbnRyeS5vcHRpb25zLmRpZmZNZXRhLnJlbW92ZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZpbGVzID0gZW50cmllcy5sZW5ndGggPiAwID8gZW50cmllcy5sZW5ndGggOiBzZXNzaW9uRW50cmllcy5sZW5ndGg7XG5cdFx0XHRjb25zdCB0b3BMZXZlbElzU2Vzc2lvbk1lbnUgPSBlbnRyaWVzLmxlbmd0aCA9PT0gMCAmJiBzZXNzaW9uRW50cmllcy5sZW5ndGggPiAwO1xuXHRcdFx0Y29uc3Qgc2hvdWxkU2hvd0VkaXRpbmdTZXNzaW9uID0gZW50cmllcy5sZW5ndGggPiAwIHx8IHNlc3Npb25FbnRyaWVzLmxlbmd0aCA+IDA7XG5cblx0XHRcdHJldHVybiB7IGZpbGVzLCBhZGRlZCwgcmVtb3ZlZCwgc2hvdWxkU2hvd0VkaXRpbmdTZXNzaW9uLCB0b3BMZXZlbElzU2Vzc2lvbk1lbnUgfTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvcExldmVsSXNTZXNzaW9uTWVudSA9IHRvcExldmVsU3RhdHMubWFwKHQgPT4gdC50b3BMZXZlbElzU2Vzc2lvbk1lbnUpO1xuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzU2Vzc2lvbk1lbnUgPSB0b3BMZXZlbElzU2Vzc2lvbk1lbnUucmVhZChyZWFkZXIpO1xuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoQnV0dG9uQmFyLCBhY3Rpb25zQ29udGFpbmVyLCBpc1Nlc3Npb25NZW51ID8gTWVudUlkLkNoYXRFZGl0aW5nU2Vzc2lvbkNoYW5nZXNUb29sYmFyIDogTWVudUlkLkNoYXRFZGl0aW5nV2lkZ2V0VG9vbGJhciwge1xuXHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6IHRoaXMub3B0aW9ucy5tZW51cy50ZWxlbWV0cnlTb3VyY2UsXG5cdFx0XHRcdHNtYWxsOiB0cnVlLFxuXHRcdFx0XHRtZW51T3B0aW9uczogc2Vzc2lvblJlc291cmNlID8gKGlzU2Vzc2lvbk1lbnUgPyB7XG5cdFx0XHRcdFx0YXJnczogW3Nlc3Npb25SZXNvdXJjZSwgdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk/Lm1ldGFkYXRhXSxcblx0XHRcdFx0fSA6IHtcblx0XHRcdFx0XHRhcmc6IHtcblx0XHRcdFx0XHRcdCRtaWQ6IE1hcnNoYWxsZWRJZC5DaGF0Vmlld0NvbnRleHQsXG5cdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRWaWV3VGl0bGVBY3Rpb25Db250ZXh0LFxuXHRcdFx0XHR9KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlzYWJsZVdoaWxlUnVubmluZzogaXNTZXNzaW9uTWVudSxcblx0XHRcdFx0YnV0dG9uQ29uZmlnUHJvdmlkZXI6IChhY3Rpb24pID0+IHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uLmlkID09PSBDaGF0RWRpdGluZ1Nob3dDaGFuZ2VzQWN0aW9uLklEIHx8IGFjdGlvbi5pZCA9PT0gVmlld1ByZXZpb3VzRWRpdHNBY3Rpb24uSWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IHNob3dJY29uOiB0cnVlLCBzaG93TGFiZWw6IGZhbHNlLCBpc1NlY29uZGFyeTogdHJ1ZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBUaGUgY2xvdWQtYWdlbnQgXCJPcGVuIHB1bGwgcmVxdWVzdFwiIGFjdGlvbiByZW5kZXJzIGljb24tb25seTsgaXRzIHNpYmxpbmdcblx0XHRcdFx0XHQvLyBcIkNyZWF0ZSBwdWxsIHJlcXVlc3RcIiBhY3Rpb24ga2VlcHMgaXRzIHRleHQgbGFiZWwuXG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQuY2xvdWRTZXNzaW9ucy5vcGVuUHVsbFJlcXVlc3RGb3JUYXNrJykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgc2hvd0ljb246IHRydWUsIHNob3dMYWJlbDogZmFsc2UgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB7IGZpbGVzLCBhZGRlZCwgcmVtb3ZlZCwgc2hvdWxkU2hvd0VkaXRpbmdTZXNzaW9uIH0gPSB0b3BMZXZlbFN0YXRzLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uTGFiZWwgPSBmaWxlcyA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0RWRpdGluZ1Nlc3Npb24ub25lRmlsZScsICcxIGZpbGUgY2hhbmdlZCcpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXRFZGl0aW5nU2Vzc2lvbi5tYW55RmlsZXMnLCAnezB9IGZpbGVzIGNoYW5nZWQnLCBmaWxlcyk7XG5cblx0XHRcdGJ1dHRvbi5sYWJlbCA9IGJ1dHRvbkxhYmVsO1xuXHRcdFx0YnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2NoYXRFZGl0aW5nU2Vzc2lvbi5hcmlhTGFiZWxXaXRoQ291bnRzJywgJ3swfSwgezF9IGxpbmVzIGFkZGVkLCB7Mn0gbGluZXMgcmVtb3ZlZCcsIGJ1dHRvbkxhYmVsLCBhZGRlZCwgcmVtb3ZlZCkpO1xuXG5cdFx0XHR0aGlzLl93b3JraW5nU2V0TGluZXNBZGRlZFNwYW4udmFsdWUudGV4dENvbnRlbnQgPSBgKyR7YWRkZWR9YDtcblx0XHRcdHRoaXMuX3dvcmtpbmdTZXRMaW5lc1JlbW92ZWRTcGFuLnZhbHVlLnRleHRDb250ZW50ID0gYC0ke3JlbW92ZWR9YDtcblxuXHRcdFx0ZG9tLnNldFZpc2liaWxpdHkoc2hvdWxkU2hvd0VkaXRpbmdTZXNzaW9uLCB0aGlzLmNoYXRFZGl0aW5nU2Vzc2lvbldpZGdldENvbnRhaW5lcik7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY291bnRzQ29udGFpbmVyID0gZG9tLiQoJy53b3JraW5nLXNldC1saW5lLWNvdW50cycpO1xuXHRcdGJ1dHRvbi5lbGVtZW50LmFwcGVuZENoaWxkKGNvdW50c0NvbnRhaW5lcik7XG5cdFx0Y291bnRzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3dvcmtpbmdTZXRMaW5lc0FkZGVkU3Bhbi52YWx1ZSk7XG5cdFx0Y291bnRzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3dvcmtpbmdTZXRMaW5lc1JlbW92ZWRTcGFuLnZhbHVlKTtcblxuXHRcdGNvbnN0IHRvZ2dsZVdvcmtpbmdTZXQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl93b3JraW5nU2V0Q29sbGFwc2VkLnNldCghdGhpcy5fd29ya2luZ1NldENvbGxhcHNlZC5nZXQoKSwgdW5kZWZpbmVkKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZChidXR0b24ub25EaWRDbGljayh0b2dnbGVXb3JraW5nU2V0KSk7XG5cdFx0dGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIob3ZlcnZpZXdSZWdpb24sICdjbGljaycsIGUgPT4ge1xuXHRcdFx0aWYgKGUuZGVmYXVsdFByZXZlbnRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlLnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGlmICh0YXJnZXQuY2xvc2VzdCgnLm1vbmFjby1idXR0b24nKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0b2dnbGVXb3JraW5nU2V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY2hhdEVkaXRzQWN0aW9uc0Rpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLl93b3JraW5nU2V0Q29sbGFwc2VkLnJlYWQocmVhZGVyKTtcblx0XHRcdGJ1dHRvbi5pY29uID0gY29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duO1xuXHRcdFx0d29ya2luZ1NldENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCBjb2xsYXBzZWQpO1xuXHRcdH0pKTtcblxuXHRcdGlmICghdGhpcy5fY2hhdEVkaXRMaXN0KSB7XG5cdFx0XHR0aGlzLl9jaGF0RWRpdExpc3QgPSB0aGlzLl9jaGF0RWRpdHNMaXN0UG9vbC5nZXQoKTtcblx0XHRcdGNvbnN0IGxpc3QgPSB0aGlzLl9jaGF0RWRpdExpc3Qub2JqZWN0O1xuXHRcdFx0dGhpcy5fY2hhdEVkaXRzRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2NoYXRFZGl0TGlzdCk7XG5cdFx0XHR0aGlzLl9jaGF0RWRpdHNEaXNwb3NhYmxlcy5hZGQobGlzdC5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9jaGF0RWRpdHNEaXNwb3NhYmxlcy5hZGQobGlzdC5vbkRpZE9wZW4oYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0aWYgKGUuZWxlbWVudD8ua2luZCA9PT0gJ3JlZmVyZW5jZScgJiYgVVJJLmlzVXJpKGUuZWxlbWVudC5yZWZlcmVuY2UpKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRGaWxlVXJpID0gZS5lbGVtZW50LnJlZmVyZW5jZTtcblx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbFVyaSA9IGUuZWxlbWVudC5vcHRpb25zPy5vcmlnaW5hbFVyaTtcblxuXHRcdFx0XHRcdGlmIChlLmVsZW1lbnQub3B0aW9ucz8uaXNEZWxldGlvbiAmJiBvcmlnaW5hbFVyaSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRyZXNvdXJjZTogb3JpZ2luYWxVcmksIC8vIGluc3RlYWQgb2YgbW9kaWZpZWQsIGJlY2F1c2UgbW9kaWZpZWQgd2lsbCBub3QgZXhpc3Rcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogZS5lZGl0b3JPcHRpb25zXG5cdFx0XHRcdFx0XHR9LCBlLnNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBJZiB0aGVyZSdzIGEgb3JpZ2luYWxVcmksIG9wZW4gYXMgZGlmZiBlZGl0b3Jcblx0XHRcdFx0XHRpZiAob3JpZ2luYWxVcmkpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0XHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IG9yaWdpbmFsVXJpIH0sXG5cdFx0XHRcdFx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBtb2RpZmllZEZpbGVVcmkgfSxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogZS5lZGl0b3JPcHRpb25zXG5cdFx0XHRcdFx0XHR9LCBlLnNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IGNoYXRFZGl0aW5nU2Vzc2lvbj8uZ2V0RW50cnkobW9kaWZpZWRGaWxlVXJpKTtcblxuXHRcdFx0XHRcdGNvbnN0IHBhbmUgPSBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogbW9kaWZpZWRGaWxlVXJpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogZS5lZGl0b3JPcHRpb25zXG5cdFx0XHRcdFx0fSwgZS5zaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cblx0XHRcdFx0XHRpZiAocGFuZSkge1xuXHRcdFx0XHRcdFx0ZW50cnk/LmdldEVkaXRvckludGVncmF0aW9uKHBhbmUpLnJldmVhbCh0cnVlLCBlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9jaGF0RWRpdHNEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpc3QuZ2V0SFRNTEVsZW1lbnQoKSwgJ2NsaWNrJywgZSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRGb2N1cy5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRydWUpKTtcblx0XHRcdGRvbS5hcHBlbmQod29ya2luZ1NldENvbnRhaW5lciwgbGlzdC5nZXRIVE1MRWxlbWVudCgpKTtcblx0XHRcdGRvbS5hcHBlbmQoaW5uZXJDb250YWluZXIsIHdvcmtpbmdTZXRDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlZGl0RW50cmllcyA9IGVkaXRTZXNzaW9uRW50cmllc09icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzZXNzaW9uRmlsZUVudHJpZXMgPSBzZXNzaW9uRW50cmllc09icy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIENvbWJpbmUgZWRpdCBzZXNzaW9uIGVudHJpZXMgd2l0aCBzZXNzaW9uIGZpbGUgY2hhbmdlcy4gQXQgdGhlIG1vbWVudCwgd2Vcblx0XHRcdC8vIHdlIGNhbiBjb21iaW5lIHRoZXNlIHR3byBhcnJheXMgc2luY2UgbG9jYWwgY2hhdCBzZXNzaW9ucyB1c2UgZWRpdCBzZXNzaW9uXG5cdFx0XHQvLyBlbnRyaWVzLCB3aGlsZSBiYWNrZ3JvdW5kIGNoYXQgc2Vzc2lvbnMgdXNlIHNlc3Npb24gZmlsZSBjaGFuZ2VzLlxuXHRcdFx0Y29uc3QgYWxsRW50cmllcyA9IGVkaXRFbnRyaWVzLmNvbmNhdChzZXNzaW9uRmlsZUVudHJpZXMpO1xuXG5cdFx0XHRjb25zdCBtYXhJdGVtc1Nob3duID0gNjtcblx0XHRcdGNvbnN0IGl0ZW1zU2hvd24gPSBNYXRoLm1pbihhbGxFbnRyaWVzLmxlbmd0aCwgbWF4SXRlbXNTaG93bik7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBpdGVtc1Nob3duICogMjI7XG5cdFx0XHRjb25zdCBsaXN0ID0gdGhpcy5fY2hhdEVkaXRMaXN0IS5vYmplY3Q7XG5cdFx0XHRsaXN0LmxheW91dChoZWlnaHQpO1xuXHRcdFx0bGlzdC5nZXRIVE1MRWxlbWVudCgpLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRsaXN0LnNwbGljZSgwLCBsaXN0Lmxlbmd0aCwgYWxsRW50cmllcyk7XG5cdFx0XHR3b3JraW5nU2V0Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ292ZXJmbG93aW5nJywgYWxsRW50cmllcy5sZW5ndGggPiBtYXhJdGVtc1Nob3duKTtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyByZW5kZXJGb2xsb3d1cHMoaXRlbXM6IElDaGF0Rm9sbG93dXBbXSB8IHVuZGVmaW5lZCwgcmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5yZW5kZXJGb2xsb3d1cHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5mb2xsb3d1cHNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5mb2xsb3d1cHNDb250YWluZXIpO1xuXG5cdFx0aWYgKGl0ZW1zICYmIGl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuZm9sbG93dXBzRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2U8dHlwZW9mIENoYXRGb2xsb3d1cHM8SUNoYXRGb2xsb3d1cD4sIENoYXRGb2xsb3d1cHM8SUNoYXRGb2xsb3d1cD4+KENoYXRGb2xsb3d1cHMsIHRoaXMuZm9sbG93dXBzQ29udGFpbmVyLCBpdGVtcywgdGhpcy5sb2NhdGlvbiwgdW5kZWZpbmVkLCBmb2xsb3d1cCA9PiB0aGlzLl9vbkRpZEFjY2VwdEZvbGxvd3VwLmZpcmUoeyBmb2xsb3d1cCwgcmVzcG9uc2UgfSkpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGUgbWF4aW11bSBoZWlnaHQgYnVkZ2V0IGZvciB0aGUgaW5wdXQgcGFydC4gVGhlIGVkaXRvciBoZWlnaHQgd2lsbCBiZVxuXHQgKiBjbGFtcGVkIHNvIGl0IGRvZXMgbm90IGdyb3cgYmV5b25kIHdoYXQgdGhpcyBidWRnZXQgYWxsb3dzIGFmdGVyIGFjY291bnRpbmdcblx0ICogZm9yIG5vbi1lZGl0b3IgY2hyb21lIHN1Y2ggYXMgYXR0YWNobWVudHMsIHRvb2xiYXJzLCBhbmQgd2lkZ2V0cy5cblx0ICovXG5cdHNldE1heEhlaWdodChtYXhIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX21heEhlaWdodCA9IG1heEhlaWdodDtcblx0XHR0aGlzLnVwZGF0ZVRvb2xDb25maXJtYXRpb25DYXJvdXNlbE1heEhlaWdodCgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxNYXhIZWlnaHQoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2Fyb3VzZWwgPSB0aGlzLl9jdXJyZW50VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsO1xuXHRcdGlmICghY2Fyb3VzZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fbWF4SGVpZ2h0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNhcm91c2VsLnNldE1heEhlaWdodCh1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhcm91c2VsSGVpZ2h0ID0gdGhpcy5jaGF0VG9vbENvbmZpcm1hdGlvbkNhcm91c2VsQ29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHRjb25zdCBvdGhlcklucHV0SGVpZ2h0ID0gTWF0aC5tYXgoMCwgdGhpcy5jb250YWluZXIub2Zmc2V0SGVpZ2h0IC0gY2Fyb3VzZWxIZWlnaHQpO1xuXHRcdGNhcm91c2VsLnNldE1heEhlaWdodCh0aGlzLl9tYXhIZWlnaHQgLSBvdGhlcklucHV0SGVpZ2h0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIGlucHV0IHBhcnQgd2l0aCB0aGUgZ2l2ZW4gd2lkdGguIEhlaWdodCBpcyBpbnRyaW5zaWMgLSBkZXRlcm1pbmVkIGJ5IGNvbnRlbnRcblx0ICogYW5kIGRldGVjdGVkIHZpYSBSZXNpemVPYnNlcnZlciwgd2hpY2ggdXBkYXRlcyBgaW5wdXRQYXJ0SGVpZ2h0YCBmb3IgdGhlIHBhcmVudCB0byBvYnNlcnZlLlxuXHQgKi9cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIpIHtcblx0XHR0aGlzLmNhY2hlZFdpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy5fc3RhYmxlSW5wdXRQYXJ0V2lkdGguc2V0KHdpZHRoLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3VwZGF0ZVdvcmtpbmdQcm9ncmVzc0FuaW1hdGlvbkR1cmF0aW9uKHdpZHRoKTtcblxuXHRcdHJldHVybiB0aGlzLl9sYXlvdXQod2lkdGgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNjYWxlIHRoZSB3b3JraW5nL3Byb2dyZXNzIGJvcmRlciBjb21ldCBhbmltYXRpb24gZHVyYXRpb24gd2l0aFxuXHQgKiB0aGUgaW5wdXQgd2lkdGggc28gdGhlIGNvbWV0J3MgcGVyY2VpdmVkIGxpbmVhciB0cmF2ZWwgc3BlZWQgKHRoZVxuXHQgKiByYXRlIGl0IHN3ZWVwcyBhbG9uZyB0aGUgcGVyaW1ldGVyIGluIHB4L3NlYykgc3RheXMgcm91Z2hseVxuXHQgKiBjb25zdGFudC4gQSBmaXhlZCBjeWNsZSB0aW1lIG1hZGUgd2lkZSBpbnB1dHMgZmVlbCBzbHVnZ2lzaCwgYnV0XG5cdCAqIGFuIGFnZ3Jlc3NpdmUgaW52ZXJzZSBjdXJ2ZSBtYWRlIG5hcnJvdyBpbnB1dHMgZmVlbCBzbG93IGJlY2F1c2Vcblx0ICogdGhlaXIgY3ljbGUgd2FzIGNsYW1wZWQgd2hpbGUgdGhlIGNvbWV0IGhhZCBsaXR0bGUgZGlzdGFuY2UgdG9cblx0ICogY292ZXIuIFN1Yi1saW5lYXIgc2NhbGluZyB3aXRoIHdpZHRoIChgc3FydCh3aWR0aClgKSBwbHVzIHRpZ2h0XG5cdCAqIGNsYW1wcyBrZWVwcyBib3RoIGV4dHJlbWVzIGxvb2tpbmcgbGl2ZWx5LlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdEFuaW1EdXJhdGlvblM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdXBkYXRlV29ya2luZ1Byb2dyZXNzQW5pbWF0aW9uRHVyYXRpb24od2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pbnB1dENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBTdWItbGluZWFyIHNjYWxpbmc6IGN5Y2xlIHRpbWUgZ3Jvd3Mgd2l0aCB3aWR0aCBidXQgdGFwZXJzIG9mZlxuXHRcdC8vIHNvIHdpZGUgaW5wdXRzIHN0aWxsIGZlZWwgc25hcHB5LiBUdW5lZCBzbyB+NDAwcHggXHUyMTkyIH4xLjdzIGFuZFxuXHRcdC8vIH4xMDAwcHggXHUyMTkyIH4yLjNzIHJhdGhlciB0aGFuIH40cy5cblx0XHRjb25zdCBNSU5fRFVSQVRJT05fUyA9IDEuNDtcblx0XHRjb25zdCBNQVhfRFVSQVRJT05fUyA9IDIuNTtcblx0XHRjb25zdCBzYWZlV2lkdGggPSBNYXRoLm1heCg1MCwgd2lkdGgpO1xuXHRcdGNvbnN0IHJhdyA9IDAuNTUgKyAwLjA3NSAqIE1hdGguc3FydChzYWZlV2lkdGgpO1xuXHRcdGNvbnN0IGR1cmF0aW9uID0gTWF0aC5taW4oTUFYX0RVUkFUSU9OX1MsIE1hdGgubWF4KE1JTl9EVVJBVElPTl9TLCByYXcpKTtcblxuXHRcdC8vIFNraXAgbm8tb3AgdXBkYXRlcyAoZS5nLiByZXBlYXRlZCBsYXlvdXQgY2FsbHMgZHVyaW5nIHN0ZWFkeSBzdGF0ZSkuXG5cdFx0aWYgKHRoaXMuX2xhc3RBbmltRHVyYXRpb25TICE9PSB1bmRlZmluZWQgJiYgTWF0aC5hYnModGhpcy5fbGFzdEFuaW1EdXJhdGlvblMgLSBkdXJhdGlvbikgPCAwLjA1KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RBbmltRHVyYXRpb25TID0gZHVyYXRpb247XG5cdFx0dGhpcy5pbnB1dENvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1jaGF0LWlucHV0LWFuaW0tZHVyYXRpb24nLCBgJHtkdXJhdGlvbi50b0ZpeGVkKDIpfXNgKTtcblxuXHRcdC8vIENTUyBhbmltYXRpb25zIGNhcHR1cmUgYW5pbWF0aW9uLWR1cmF0aW9uIGF0IHN0YXJ0IHRpbWUgYW5kIG1vc3Rcblx0XHQvLyBicm93c2VycyBkbyBub3QgcmUtcGljayB1cCB2YWx1ZXMgdGhhdCBjb21lIGZyb20gYSBjdXN0b21cblx0XHQvLyBwcm9wZXJ0eSBtaWQtZmxpZ2h0LiBJZiB0aGUgY29tZXQgaXMgY3VycmVudGx5IHNwaW5uaW5nLCByZXN0YXJ0XG5cdFx0Ly8gaXQgb24gdGhlIG5leHQgYW5pbWF0aW9uIGZyYW1lIHNvIHN0eWxlIGFuZCBsYXlvdXQgY2hhbmdlcyBjYW5cblx0XHQvLyBiYXRjaCB3aXRob3V0IGZvcmNpbmcgYSBzeW5jaHJvbm91cyByZWZsb3cuIFRvZ2dsaW5nIHRoZSAud29ya2luZ1xuXHRcdC8vIGNsYXNzIHdvdWxkIGNhbmNlbCB0aGUgaW4tZmxpZ2h0IGluZGljYXRvciBzdGF0ZSwgc28gaW5zdGVhZCB3ZVxuXHRcdC8vIGJyaWVmbHkgZmxpcCBhIG1hcmtlciBjbGFzcyB0aGF0IHRoZSBDU1MgdXNlcyB0byBzd2FwXG5cdFx0Ly8gYW5pbWF0aW9uLW5hbWUuXG5cdFx0aWYgKHRoaXMuaW5wdXRDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCd3b3JraW5nJykpIHtcblx0XHRcdGNvbnN0IGlucHV0Q29udGFpbmVyID0gdGhpcy5pbnB1dENvbnRhaW5lcjtcblx0XHRcdGlucHV0Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtaW5wdXQtYW5pbS1yZXN0YXJ0Jyk7XG5cdFx0XHRkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShkb20uZ2V0V2luZG93KGlucHV0Q29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0XHRpbnB1dENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LWlucHV0LWFuaW0tcmVzdGFydCcpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2VmZmVjdGl2ZUlucHV0RWRpdG9yTWF4SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0aWYgKHRoaXMuX21heEhlaWdodCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnB1dEVkaXRvck1heEhlaWdodDtcblx0XHR9XG5cblx0XHQvLyBDb21wdXRlIG5vbi1lZGl0b3IgaGVpZ2h0IGZyb20gdGhlIGNhY2hlZCBjb250YWluZXIgaGVpZ2h0ICh1cGRhdGVkIGJ5IFJlc2l6ZU9ic2VydmVyKVxuXHRcdC8vIG1pbnVzIHRoZSBjdXJyZW50IGVkaXRvciBoZWlnaHQuIFRoaXMgYXZvaWRzIGEgZm9yY2VkIHJlZmxvdyBmcm9tIHJlYWRpbmcgb2Zmc2V0SGVpZ2h0LlxuXHRcdGNvbnN0IGN1cnJlbnRFZGl0b3JIZWlnaHQgPSB0aGlzLnByZXZpb3VzSW5wdXRFZGl0b3JEaW1lbnNpb24/LmhlaWdodCA/PyAwO1xuXHRcdGNvbnN0IG5vbkVkaXRvckhlaWdodCA9IE1hdGgubWF4KDAsIHRoaXMuaGVpZ2h0LmdldCgpIC0gY3VycmVudEVkaXRvckhlaWdodCk7XG5cdFx0Y29uc3QgYnVkZ2V0Rm9yRWRpdG9yID0gdGhpcy5fbWF4SGVpZ2h0IC0gbm9uRWRpdG9ySGVpZ2h0O1xuXG5cdFx0Ly8gRmxvb3IgdGhlIGJ1ZGdldCBzbyB0aGUgZWRpdG9yIGtlZXBzIGF0IGxlYXN0IG9uZSB1c2FibGUgbGluZS4gU2VlICMzMjI1MjMuXG5cdFx0Y29uc3QgbWluRWRpdG9ySGVpZ2h0ID0gdGhpcy5pbnB1dEVkaXRvck1pbkhlaWdodCA/PyB0aGlzLnNpbmdsZUxpbmVJbnB1dEVkaXRvckhlaWdodDtcblx0XHRyZXR1cm4gTWF0aC5tYXgobWluRWRpdG9ySGVpZ2h0LCBNYXRoLm1pbih0aGlzLmlucHV0RWRpdG9yTWF4SGVpZ2h0LCBNYXRoLm1heCgwLCBidWRnZXRGb3JFZGl0b3IpKSk7XG5cdH1cblxuXHRwcml2YXRlIHByZXZpb3VzSW5wdXRFZGl0b3JEaW1lbnNpb246IElEaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xheW91dCh3aWR0aDogbnVtYmVyLCBhbGxvd1JlY3Vyc2UgPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuZ2V0TGF5b3V0RGF0YSgpO1xuXG5cdFx0Y29uc3QgZm9sbG93dXBzV2lkdGggPSB3aWR0aCAtIGRhdGEuaW5wdXRQYXJ0SG9yaXpvbnRhbFBhZGRpbmc7XG5cdFx0dGhpcy5mb2xsb3d1cHNDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtmb2xsb3d1cHNXaWR0aH1weGA7XG5cblx0XHRjb25zdCBpbml0aWFsRWRpdG9yU2Nyb2xsV2lkdGggPSB0aGlzLl9pbnB1dEVkaXRvci5nZXRTY3JvbGxXaWR0aCgpO1xuXHRcdGNvbnN0IG5ld0VkaXRvcldpZHRoID0gd2lkdGggLSBkYXRhLmlucHV0UGFydEhvcml6b250YWxQYWRkaW5nIC0gZGF0YS5lZGl0b3JCb3JkZXIgLSBkYXRhLmlucHV0UGFydEhvcml6b250YWxQYWRkaW5nSW5zaWRlIC0gZGF0YS50b29sYmFyc1dpZHRoIC0gZGF0YS5zaWRlVG9vbGJhcldpZHRoO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZU1heEhlaWdodCA9IHRoaXMuX2VmZmVjdGl2ZUlucHV0RWRpdG9yTWF4SGVpZ2h0O1xuXHRcdGNvbnN0IGNsYW1wZWRDb250ZW50SGVpZ2h0ID0gTWF0aC5taW4odGhpcy5faW5wdXRFZGl0b3IuZ2V0Q29udGVudEhlaWdodCgpLCBlZmZlY3RpdmVNYXhIZWlnaHQpO1xuXHRcdGNvbnN0IGlucHV0RWRpdG9ySGVpZ2h0ID0gdGhpcy5pbnB1dEVkaXRvck1pbkhlaWdodCA/IE1hdGgubWluKE1hdGgubWF4KHRoaXMuaW5wdXRFZGl0b3JNaW5IZWlnaHQsIGNsYW1wZWRDb250ZW50SGVpZ2h0KSwgZWZmZWN0aXZlTWF4SGVpZ2h0KSA6IGNsYW1wZWRDb250ZW50SGVpZ2h0O1xuXHRcdGNvbnN0IG5ld0RpbWVuc2lvbiA9IHsgd2lkdGg6IG5ld0VkaXRvcldpZHRoLCBoZWlnaHQ6IGlucHV0RWRpdG9ySGVpZ2h0IH07XG5cdFx0aWYgKCF0aGlzLnByZXZpb3VzSW5wdXRFZGl0b3JEaW1lbnNpb24gfHwgKHRoaXMucHJldmlvdXNJbnB1dEVkaXRvckRpbWVuc2lvbi53aWR0aCAhPT0gbmV3RGltZW5zaW9uLndpZHRoIHx8IHRoaXMucHJldmlvdXNJbnB1dEVkaXRvckRpbWVuc2lvbi5oZWlnaHQgIT09IG5ld0RpbWVuc2lvbi5oZWlnaHQpKSB7XG5cdFx0XHQvLyBUaGlzIGxheW91dCBjYWxsIGhhcyBzaWRlLWVmZmVjdHMgdGhhdCBhcmUgaGFyZCB0byB1bmRlcnN0YW5kLiBlZyBpZiB3ZSBhcmUgY2FsbGluZyB0aGlzIGluc2lkZSBhIG9uRGlkQ2hhbmdlQ29udGVudCBoYW5kbGVyLCB0aGlzIGNhbiB0cmlnZ2VyIHRoZSBuZXh0IG9uRGlkQ2hhbmdlQ29udGVudCBoYW5kbGVyXG5cdFx0XHQvLyB0byBiZSBpbnZva2VkLCBhbmQgd2UgaGF2ZSBhIGxvdCBvZiB0aGVzZSBvbiB0aGlzIGVkaXRvci4gT25seSBkb2luZyBhIGxheW91dCB0aGlzIHdoZW4gdGhlIGVkaXRvciBzaXplIGhhcyBhY3R1YWxseSBjaGFuZ2VkIG1ha2VzIGl0IG11Y2ggZWFzaWVyIHRvIGZvbGxvdy5cblx0XHRcdHRoaXMuX2lucHV0RWRpdG9yLmxheW91dChuZXdEaW1lbnNpb24pO1xuXHRcdFx0dGhpcy5wcmV2aW91c0lucHV0RWRpdG9yRGltZW5zaW9uID0gbmV3RGltZW5zaW9uO1xuXHRcdH1cblxuXHRcdGlmIChhbGxvd1JlY3Vyc2UgJiYgaW5pdGlhbEVkaXRvclNjcm9sbFdpZHRoIDwgMTApIHtcblx0XHRcdC8vIFRoaXMgaXMgcHJvYmFibHkgdGhlIGluaXRpYWwgbGF5b3V0LiBOb3cgdGhhdCB0aGUgZWRpdG9yIGlzIGxheWVkIG91dCB3aXRoIGl0cyBjb3JyZWN0IHdpZHRoLCBpdCBzaG91bGQgcmVwb3J0IHRoZSBjb3JyZWN0IGNvbnRlbnRIZWlnaHRcblx0XHRcdHJldHVybiB0aGlzLl9sYXlvdXQod2lkdGgsIGZhbHNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldExheW91dERhdGEoKSB7XG5cblx0XHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0XHQvLyAjICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICNcblx0XHQvLyAjICAgIENIQU5HSU5HIFRISVMgTUVUSE9EIEhBUyBSRU5ERVJJTkcgSU1QTElDQVRJT05TIEZPUiBUSEUgQ0hBVCBWSUVXICAgICNcblx0XHQvLyAjICAgIElGIFlPVSBNQUtFIENIQU5HRVMgSEVSRSwgUExFQVNFIFRFU1QgVEhFIENIQVQgVklFVyBUSE9ST1VHSExZOiAgICAgICNcblx0XHQvLyAjICAgIC0gcHJvZHVjZSB2YXJpb3VzIGNoYXQgcmVzcG9uc2VzICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICNcblx0XHQvLyAjICAgIC0gY2xpY2sgdGhlIHJlc3BvbnNlIHRvIGdldCBhIGZvY3VzIG91dGxpbmUgICAgICAgICAgICAgICAgICAgICAgICAgICNcblx0XHQvLyAjICAgIC0gZW5zdXJlIHRoZSBvdXRsaW5lIGlzIG5vdCBjdXQgb2ZmIGF0IHRoZSBib3R0b20gICAgICAgICAgICAgICAgICAgICNcblx0XHQvLyAjICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICNcblx0XHQvLyAjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblxuXHRcdGNvbnN0IGlucHV0U2lkZVRvb2xiYXJXaWR0aCA9IHRoaXMuaW5wdXRTaWRlVG9vbGJhckNvbnRhaW5lciA/IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuaW5wdXRTaWRlVG9vbGJhckNvbnRhaW5lcikgOiAwO1xuXG5cdFx0Y29uc3QgZ2V0VG9vbGJhcnNXaWR0aENvbXBhY3QgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sYmFySXRlbUdhcCA9IDQ7XG5cdFx0XHRjb25zdCBleGVjdXRlVG9vbGJhcldpZHRoID0gdGhpcy5jYWNoZWRFeGVjdXRlVG9vbGJhcldpZHRoID0gdGhpcy5leGVjdXRlVG9vbGJhci5nZXRJdGVtc1dpZHRoKCk7XG5cdFx0XHRjb25zdCBpbnB1dFRvb2xiYXJXaWR0aCA9IHRoaXMuY2FjaGVkSW5wdXRUb29sYmFyV2lkdGggPSB0aGlzLmlucHV0QWN0aW9uc1Rvb2xiYXIuZ2V0SXRlbXNXaWR0aCgpO1xuXHRcdFx0Y29uc3QgZXhlY3V0ZVRvb2xiYXJQYWRkaW5nID0gKHRoaXMuZXhlY3V0ZVRvb2xiYXIuZ2V0SXRlbXNMZW5ndGgoKSAtIDEpICogdG9vbGJhckl0ZW1HYXA7XG5cdFx0XHRjb25zdCBpbnB1dFRvb2xiYXJQYWRkaW5nID0gdGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLmdldEl0ZW1zTGVuZ3RoKCkgPyAodGhpcy5pbnB1dEFjdGlvbnNUb29sYmFyLmdldEl0ZW1zTGVuZ3RoKCkgLSAxKSAqIHRvb2xiYXJJdGVtR2FwIDogMDtcblx0XHRcdGNvbnN0IGNvbnRleHRVc2FnZVdpZHRoID0gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5jb250ZXh0VXNhZ2VXaWRnZXRDb250YWluZXIpO1xuXHRcdFx0Y29uc3QgaW5wdXRUb29sYmFyc1BhZGRpbmcgPSAxMjsgLy8gcGRhZGluZyBiZXR3ZWVuIGlucHV0IHRvb2xiYXIvZXhlY3V0ZSB0b29sYmFyL2NvbnRleHRVc2FnZS5cblx0XHRcdHJldHVybiBleGVjdXRlVG9vbGJhcldpZHRoICsgZXhlY3V0ZVRvb2xiYXJQYWRkaW5nICsgY29udGV4dFVzYWdlV2lkdGggKyAodGhpcy5vcHRpb25zLnJlbmRlcklucHV0VG9vbGJhckJlbG93SW5wdXQgPyAwIDogaW5wdXRUb29sYmFyV2lkdGggKyBpbnB1dFRvb2xiYXJQYWRkaW5nICsgaW5wdXRUb29sYmFyc1BhZGRpbmcpO1xuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdG9yQm9yZGVyOiAyLFxuXHRcdFx0Ly8gVGhlIHNlc3Npb25zIHdpbmRvdyBwYWRzIGAuaW50ZXJhY3RpdmUtaW5wdXQtcGFydGAgYnkgMzJweCBvbiBlYWNoIHNpZGVcblx0XHRcdC8vICh2cyB0aGUgZGVmYXVsdCAxMnB4IG1hcmdpbikgc28gdGhlIGlucHV0IGJveCBhbGlnbnMgd2l0aCB0aGUgY2hhdFxuXHRcdFx0Ly8gY29udGVudCBjYXJkcy4gVGhlIGVkaXRvciB3aWR0aCBpcyBjb21wdXRlZCBoZXJlLCBzbyBpdCBtdXN0IGFjY291bnRcblx0XHRcdC8vIGZvciB0aGUgc2FtZSA2NHB4IHRvdGFsIGhvcml6b250YWwgZ3V0dGVyIG9yIHRoZSBlZGl0b3Igb3ZlcmZsb3dzIGl0c1xuXHRcdFx0Ly8gY29udGFpbmVyIGFuZCByZW5kZXJzIHdpZGVyIHRoYW4gdGhlIG1lc3NhZ2UgY29udGVudCBhYm92ZSBpdC5cblx0XHRcdGlucHV0UGFydEhvcml6b250YWxQYWRkaW5nOiB0aGlzLm9wdGlvbnMuaW5wdXRQYXJ0SG9yaXpvbnRhbFBhZGRpbmcgPz8gKHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnID8gMTYgOiAodGhpcy5vcHRpb25zLmlzU2Vzc2lvbnNXaW5kb3cgPyA2NCA6IDI0KSksXG5cdFx0XHRpbnB1dFBhcnRIb3Jpem9udGFsUGFkZGluZ0luc2lkZTogdGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcgPyAxMiA6IDEwLFxuXHRcdFx0dG9vbGJhcnNXaWR0aDogdGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCcgPyBnZXRUb29sYmFyc1dpZHRoQ29tcGFjdCgpIDogMCxcblx0XHRcdHNpZGVUb29sYmFyV2lkdGg6IGlucHV0U2lkZVRvb2xiYXJXaWR0aCA+IDAgPyBpbnB1dFNpZGVUb29sYmFyV2lkdGggKyA0IC8qZ2FwKi8gOiAwLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgbG9jYXRpb24gb2YgdGhlIGNoYXQgd2lkZ2V0IGFuZCB3aGV0aGVyIHRoYXQgbG9jYXRpb24gaXMgbWF4aW1pemVkLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRXaWRnZXRMb2NhdGlvbkluZm8od2lkZ2V0OiBJQ2hhdFdpZGdldCk6IElDaGF0V2lkZ2V0TG9jYXRpb25JbmZvIHtcblx0XHQvLyBFZGl0b3IgY29udGV4dCAocXVpY2sgY2hhdCwgaW5saW5lIGNoYXQsIGV0Yy4pXG5cdFx0aWYgKGlzSUNoYXRSZXNvdXJjZVZpZXdDb250ZXh0KHdpZGdldC52aWV3Q29udGV4dCkpIHtcblx0XHRcdHJldHVybiB7IGxvY2F0aW9uOiBDaGF0V2lkZ2V0TG9jYXRpb24uRWRpdG9yLCBpc01heGltaXplZDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHQvLyBWaWV3IGNvbnRleHQgLSBkZXRlcm1pbmUgYWN0dWFsIGxvY2F0aW9uIGZyb20gdmlldyBkZXNjcmlwdG9yIHNlcnZpY2Vcblx0XHRpZiAoaXNJQ2hhdFZpZXdWaWV3Q29udGV4dCh3aWRnZXQudmlld0NvbnRleHQpKSB7XG5cdFx0XHRjb25zdCB2aWV3TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHdpZGdldC52aWV3Q29udGV4dC52aWV3SWQpO1xuXHRcdFx0Y29uc3Qgc2lkZUJhclBvc2l0aW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFNpZGVCYXJQb3NpdGlvbigpO1xuXG5cdFx0XHRzd2l0Y2ggKHZpZXdMb2NhdGlvbikge1xuXHRcdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbDpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bG9jYXRpb246IENoYXRXaWRnZXRMb2NhdGlvbi5QYW5lbCxcblx0XHRcdFx0XHRcdGlzTWF4aW1pemVkOiB0aGlzLmxheW91dFNlcnZpY2UuaXNQYW5lbE1heGltaXplZCgpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcjpcblx0XHRcdFx0XHQvLyBBdXhpbGlhcnlCYXIgaXMgb24gdGhlIG9wcG9zaXRlIHNpZGUgb2YgdGhlIHByaW1hcnkgc2lkZWJhclxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogc2lkZUJhclBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUID8gQ2hhdFdpZGdldExvY2F0aW9uLlNpZGViYXJSaWdodCA6IENoYXRXaWRnZXRMb2NhdGlvbi5TaWRlYmFyTGVmdCxcblx0XHRcdFx0XHRcdGlzTWF4aW1pemVkOiB0aGlzLmxheW91dFNlcnZpY2UuaXNBdXhpbGlhcnlCYXJNYXhpbWl6ZWQoKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRjYXNlIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdC8vIFByaW1hcnkgc2lkZWJhciBmb2xsb3dzIGl0cyBjb25maWd1cmVkIHBvc2l0aW9uXG5cdFx0XHRcdFx0Ly8gTm90ZTogUHJpbWFyeSBzaWRlYmFyIGNhbm5vdCBiZSBtYXhpbWl6ZWQsIHNvIGFsd2F5cyBmYWxzZVxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsb2NhdGlvbjogc2lkZUJhclBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUID8gQ2hhdFdpZGdldExvY2F0aW9uLlNpZGViYXJMZWZ0IDogQ2hhdFdpZGdldExvY2F0aW9uLlNpZGViYXJSaWdodCxcblx0XHRcdFx0XHRcdGlzTWF4aW1pemVkOiBmYWxzZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEZhbGxiYWNrIGZvciB1bmtub3duIGNvbnRleHRzXG5cdFx0cmV0dXJuIHsgbG9jYXRpb246IENoYXRXaWRnZXRMb2NhdGlvbi5FZGl0b3IsIGlzTWF4aW1pemVkOiBmYWxzZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXREZWZhdWx0U2Nyb2xsYmFyT3B0aW9ucygpOiBJRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucyB7XG5cdFx0Y29uc3Qgc2Nyb2xsYmFyID0gdGhpcy5faW5wdXRFZGl0b3IuZ2V0UmF3T3B0aW9ucygpLnNjcm9sbGJhciA/PyB7fTtcblx0XHRyZXR1cm4gdGhpcy5vcHRpb25zLnJlbmRlclN0eWxlID09PSAnY29tcGFjdCdcblx0XHRcdD8geyAuLi5zY3JvbGxiYXIsIHZlcnRpY2FsOiAnaGlkZGVuJyB9XG5cdFx0XHQ6IHsgLi4uc2Nyb2xsYmFyLCB2ZXJ0aWNhbDogJ2F1dG8nLCB2ZXJ0aWNhbFNjcm9sbGJhclNpemU6IDcgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VmlzaWJsZVNjcm9sbGJhck9wdGlvbnMoKTogSUVkaXRvclNjcm9sbGJhck9wdGlvbnMge1xuXHRcdGNvbnN0IHNjcm9sbGJhciA9IHRoaXMuX2lucHV0RWRpdG9yLmdldFJhd09wdGlvbnMoKS5zY3JvbGxiYXIgPz8ge307XG5cdFx0cmV0dXJuIHRoaXMub3B0aW9ucy5yZW5kZXJTdHlsZSA9PT0gJ2NvbXBhY3QnXG5cdFx0XHQ/IHsgLi4uc2Nyb2xsYmFyLCB2ZXJ0aWNhbDogJ2hpZGRlbicgfVxuXHRcdFx0OiB7IC4uLnNjcm9sbGJhciwgdmVydGljYWw6ICd2aXNpYmxlJywgdmVydGljYWxTY3JvbGxiYXJTaXplOiA3IH07XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUlucHV0RWRpdG9yU2Nyb2xsYmFyT3B0aW9ucygpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dEVkaXRvci51cGRhdGVPcHRpb25zKHtcblx0XHRcdHNjcm9sbGJhcjogdGhpcy5fZm9yY2VWaXNpYmxlU2Nyb2xsYmFyVW50aWxBY2NlcHRcblx0XHRcdFx0PyB0aGlzLmdldFZpc2libGVTY3JvbGxiYXJPcHRpb25zKClcblx0XHRcdFx0OiB0aGlzLmdldERlZmF1bHRTY3JvbGxiYXJPcHRpb25zKClcblx0XHR9KTtcblx0fVxuXG5cdHNob3dTY3JvbGxiYXJVbnRpbEFjY2VwdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9mb3JjZVZpc2libGVTY3JvbGxiYXJVbnRpbEFjY2VwdCA9IHRydWU7XG5cdFx0dGhpcy51cGRhdGVJbnB1dEVkaXRvclNjcm9sbGJhck9wdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzZXRTY3JvbGxiYXJWaXNpYmlsaXR5QWZ0ZXJBY2NlcHQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9mb3JjZVZpc2libGVTY3JvbGxiYXJVbnRpbEFjY2VwdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2ZvcmNlVmlzaWJsZVNjcm9sbGJhclVudGlsQWNjZXB0ID0gZmFsc2U7XG5cdFx0dGhpcy51cGRhdGVJbnB1dEVkaXRvclNjcm9sbGJhck9wdGlvbnMoKTtcblx0fVxufVxuXG5cbmZ1bmN0aW9uIGdldExhc3RQb3NpdGlvbihtb2RlbDogSVRleHRNb2RlbCk6IElQb3NpdGlvbiB7XG5cdHJldHVybiB7IGxpbmVOdW1iZXI6IG1vZGVsLmdldExpbmVDb3VudCgpLCBjb2x1bW46IG1vZGVsLmdldExpbmVMZW5ndGgobW9kZWwuZ2V0TGluZUNvdW50KCkpICsgMSB9O1xufVxuXG5jb25zdCBjaGF0SW5wdXRFZGl0b3JDb250YWluZXJTZWxlY3RvciA9ICcuaW50ZXJhY3RpdmUtaW5wdXQtZWRpdG9yJztcbnNldHVwU2ltcGxlRWRpdG9yU2VsZWN0aW9uU3R5bGluZyhjaGF0SW5wdXRFZGl0b3JDb250YWluZXJTZWxlY3Rvcik7XG5cbnR5cGUgQ2hhdFNlc3Npb25QaWNrZXJXaWRnZXQgPSBDaGF0U2Vzc2lvblBpY2tlckFjdGlvbkl0ZW07XG5cbmNsYXNzIENoYXRTZXNzaW9uUGlja2Vyc0NvbnRhaW5lckFjdGlvbkl0ZW0gZXh0ZW5kcyBBY3Rpb25WaWV3SXRlbSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHdpZGdldHM6IENoYXRTZXNzaW9uUGlja2VyV2lkZ2V0W10sXG5cdFx0b3B0aW9ucz86IElBY3Rpb25WaWV3SXRlbU9wdGlvbnNcblx0KSB7XG5cdFx0c3VwZXIobnVsbCwgYWN0aW9uLCBvcHRpb25zID8/IHt9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtc2Vzc2lvblBpY2tlci1jb250YWluZXInKTtcblx0XHRmb3IgKGNvbnN0IHdpZGdldCBvZiB0aGlzLndpZGdldHMpIHtcblx0XHRcdGNvbnN0IGl0ZW1Db250YWluZXIgPSBkb20uJCgnLmFjdGlvbi1pdGVtLmNoYXQtc2Vzc2lvblBpY2tlci1pdGVtJyk7XG5cdFx0XHR3aWRnZXQucmVuZGVyKGl0ZW1Db250YWluZXIpO1xuXHRcdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGl0ZW1Db250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB3aWRnZXQgb2YgdGhpcy53aWRnZXRzKSB7XG5cdFx0XHR3aWRnZXQuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgSGlkZGVuQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRjb25zdHJ1Y3RvcihhY3Rpb246IElBY3Rpb24pIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbik7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHVCQUE4QztBQUV2RCxTQUFTLGdCQUFnQiwwQkFBa0Q7QUFDM0UsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsVUFBVSxtQkFBbUI7QUFDdEMsU0FBUyxpQkFBaUIsd0JBQXdCO0FBRWxELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSxlQUFlLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQ3pHLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGlCQUFpQixTQUFTLGFBQTZELHFCQUFxQixpQkFBaUIsbUJBQW1CO0FBQ2xLLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFdBQVc7QUFFcEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQkFBOEQ7QUFDdkUsU0FBUyw0QkFBNEI7QUFHckMsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9CQUFv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QUFLLGtDQUFrQztBQUFBLEVBQ3hDO0FBQ0Q7QUF2eklhLGNBQ0csV0FBVztBQURkLGdCQUFOO0FBQUEsRUErV0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBL1lVO0FBMHpJYixTQUFTLGdCQUFnQixPQUE4QjtBQUN0RCxTQUFPLEVBQUUsWUFBWSxNQUFNLGFBQWEsR0FBRyxRQUFRLE1BQU0sY0FBYyxNQUFNLGFBQWEsQ0FBQyxJQUFJLEVBQUU7QUFDbEc7QUFFQSxNQUFNLG1DQUFtQztBQUN6QyxrQ0FBa0MsZ0NBQWdDO0FBSWxFLE1BQU0sOENBQThDLGVBQWU7QUFBQSxFQUNsRSxZQUNDLFFBQ2lCLFNBQ2pCLFNBQ0M7QUFDRCxVQUFNLE1BQU0sUUFBUSxXQUFXLENBQUMsQ0FBQztBQUhoQjtBQUFBLEVBSWxCO0FBQUEsRUFFUyxPQUFPLFdBQThCO0FBQzdDLGNBQVUsVUFBVSxJQUFJLDhCQUE4QjtBQUN0RCxlQUFXLFVBQVUsS0FBSyxTQUFTO0FBQ2xDLFlBQU0sZ0JBQWdCLElBQUksRUFBRSxzQ0FBc0M7QUFDbEUsYUFBTyxPQUFPLGFBQWE7QUFDM0IsZ0JBQVUsWUFBWSxhQUFhO0FBQUEsSUFDcEM7QUFBQSxFQUNEO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixlQUFXLFVBQVUsS0FBSyxTQUFTO0FBQ2xDLGFBQU8sUUFBUTtBQUFBLElBQ2hCO0FBQ0EsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBRUEsTUFBTSw2QkFBNkIsbUJBQW1CO0FBQUEsRUFDckQsWUFBWSxRQUFpQjtBQUM1QixVQUFNLFFBQVcsTUFBTTtBQUFBLEVBQ3hCO0FBQUEsRUFFUyxPQUFPLFdBQThCO0FBQzdDLFVBQU0sT0FBTyxTQUFTO0FBQ3RCLGNBQVUsTUFBTSxVQUFVO0FBQUEsRUFDM0I7QUFDRDsiLAogICJuYW1lcyI6IFsiQ2hhdFdpZGdldExvY2F0aW9uIiwgInNlc3Npb25SZXNvdXJjZSIsICJtb2RlIiwgImxhc3RSZXF1ZXN0IiwgInRyYW5zYWN0aW9uIiwgIm9wdGlvbnMiLCAiZGVsZWdhdGUiLCAiY29udGFpbmVyIiwgIndpZGdldCIsICJ0b3BMZXZlbElzU2Vzc2lvbk1lbnUiXQp9Cg==
