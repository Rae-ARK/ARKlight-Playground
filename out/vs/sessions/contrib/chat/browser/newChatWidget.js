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
import "./media/chatWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { Action } from "../../../../base/common/actions.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { constObservable, derived, derivedObservableWithCache, autorun, observableSignalFromEvent } from "../../../../base/common/observable.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { localize } from "../../../../nls.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { IAquariumService } from "../../aquarium/browser/aquariumOverlay.js";
import { WorkspacePicker } from "./sessionWorkspacePicker.js";
import { WebWorkspacePicker } from "./webWorkspacePicker.js";
import { NewChatInputWidget } from "./newChatInput.js";
import { NoAgentHostEmptyState } from "./noAgentHostEmptyState.js";
import { IAgentHostFilterService } from "../../../services/agentHostFilter/common/agentHostFilter.js";
import { SessionWorkspacePickerVisibleContext } from "../../../common/contextkeys.js";
import { AGENT_FEEDBACK_NEW_SESSION_RESOURCE, AgentFeedbackState, IAgentFeedbackService } from "../../agentFeedback/browser/agentFeedbackService.js";
import { buildNewSessionPrompt } from "../../agentFeedback/browser/agentFeedbackAttachmentEntry.js";
import { SessionInputBannerWidget } from "../../sessionInputBanners/browser/sessionInputBannerWidget.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ChatTipContentPart } from "../../../../workbench/contrib/chat/browser/widget/chatContentParts/chatTipContentPart.js";
import { ChatContentMarkdownRenderer } from "../../../../workbench/contrib/chat/browser/widget/chatContentMarkdownRenderer.js";
import { IChatPetService } from "../../../../workbench/contrib/chat/browser/chatPetService.js";
import { IChatTipService } from "../../../../workbench/contrib/chat/browser/chatTipService.js";
import { ChatContextKeys } from "../../../../workbench/contrib/chat/common/actions/chatContextKeys.js";
import { ChatModeKind } from "../../../../workbench/contrib/chat/common/constants.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
let NewChatWidget = class extends Disposable {
  constructor(options, instantiationService, contextKeyService, contextMenuService, configurationService, logService, sessionsManagementService, sessionsService, aquariumService, agentHostFilterService, uriIdentityService, agentFeedbackService, chatPetService, chatTipService, openerService) {
    super();
    this.options = options;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsService = sessionsService;
    this.aquariumService = aquariumService;
    this.agentHostFilterService = agentHostFilterService;
    this.uriIdentityService = uriIdentityService;
    this.agentFeedbackService = agentFeedbackService;
    this.chatPetService = chatPetService;
    this.chatTipService = chatTipService;
    this.openerService = openerService;
    this._chatTipPart = this._register(new MutableDisposable());
    this._isChatTipSessionInitialized = false;
    this._isInputOnboardingVisible = false;
    /** Recreates the draft once a better/late-registering provider can serve the folder (see {@link _createNewSession}). */
    this._pendingPreferredUpgrade = new MutableDisposable();
    this._newSessionCreation = new MutableDisposable();
    /** In-flight background sends awaiting confirmation before their comments are cleared. */
    this._pendingBackgroundSends = this._register(new DisposableMap());
    this._workspacePickerVisibleKey = SessionWorkspacePickerVisibleContext.bindTo(contextKeyService);
    this._register(toDisposable(() => this._workspacePickerVisibleKey.reset()));
    this._renderHarnessPickerInControls = this.options.renderSessionTypePickerInControls.get();
    const PickerCtor = isWeb ? WebWorkspacePicker : WorkspacePicker;
    this._workspacePicker = this._register(this.instantiationService.createInstance(PickerCtor, {}));
    this._register(this._pendingPreferredUpgrade);
    this._register(this._newSessionCreation);
    this._session = derivedObservableWithCache(this, (reader, prev) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      if (activeSession && activeSession.isCreated.read(reader)) {
        return prev;
      }
      return activeSession;
    });
    this._isQuickChatComposer = derived(this, (reader) => {
      const session = this._session.read(reader);
      return session?.isQuickChat?.read(reader) ?? false;
    });
    const feedbackChanged = observableSignalFromEvent(this, this.agentFeedbackService.onDidChangeFeedback);
    this._feedbackItems = derived(this, (reader) => {
      feedbackChanged.read(reader);
      return this.agentFeedbackService.getFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE).filter((item) => item.state === AgentFeedbackState.Accepted);
    });
    const canSendRequest = derived((reader) => {
      const session = this._session.read(reader);
      if (!session) {
        return false;
      }
      if (session.loading.read(reader)) {
        return false;
      }
      return true;
    });
    const loading = derived((reader) => {
      const session = this._session.read(reader);
      return session?.loading.read(reader) ?? false;
    });
    const hasFeedback = derived(this, (reader) => this._feedbackItems.read(reader).length > 0);
    const canSubmitWithoutSession = derived(this, (reader) => !this._session.read(reader) && hasFeedback.read(reader));
    const newChatInput = this.instantiationService.createInstance(NewChatInputWidget, {
      session: this._session,
      getContextFolderUri: () => this._getContextFolderUri(),
      sendRequest: async ({ query, attachments, background }) => this._send(query, attachments, background),
      canSendRequest,
      canSubmitWithoutSession,
      hasAdditionalSendContent: hasFeedback,
      loading,
      historyKey: constObservable(void 0),
      // no persisted history for the new-session view
      renderSessionTypePickerInControls: this._renderHarnessPickerInControls,
      supportsBackground: true,
      getInputOnboardingTipContainer: () => this._chatTipContainer,
      onDidChangeInputOnboardingVisible: (visible) => this.setInputOnboardingVisible(visible)
    });
    this._register(toDisposable(() => newChatInput.saveState()));
    this._newChatInput = this._register(newChatInput);
    const chatModeKindKey = ChatContextKeys.chatModeKind.bindTo(contextKeyService);
    chatModeKindKey.set(ChatModeKind.Agent);
    this._register(toDisposable(() => chatModeKindKey.reset()));
    this._register(this.openerService.registerOpener({
      open: async (resource) => {
        if (!this._chatTipPart.value) {
          return false;
        }
        const link = typeof resource === "string" ? resource : resource.toString();
        if (link === "command:workbench.action.chat.openModelPicker") {
          this._newChatInput.openModelPicker();
          return true;
        }
        if (link === "command:workbench.action.chat.openPlan") {
          return true;
        }
        return false;
      }
    }));
    this._register(this._workspacePicker.onDidSelectWorkspace(async (folderUri) => {
      await this._onWorkspaceSelected(folderUri);
      this._newChatInput.focus();
    }));
    this._register(this._newChatInput.sessionTypePicker.onDidSelectSessionType(async (pick) => {
      if (this._isQuickChatComposer.get()) {
        this.sessionsService.openQuickChat(pick ? { providerId: pick.providerId, sessionTypeId: pick.sessionTypeId } : void 0);
        this._newChatInput.focus();
        return;
      }
      await this._onWorkspaceSelected(this._workspacePicker.selectedFolderUri);
      this._newChatInput.focus();
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("chat.tips.enabled")) {
        return;
      }
      if (this.configurationService.getValue("chat.tips.enabled")) {
        this._renderChatTip();
      } else {
        this._clearChatTip();
      }
    }));
    const foregroundSessionCountContextKeys = /* @__PURE__ */ new Set([ChatContextKeys.foregroundSessionCount.key]);
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(foregroundSessionCountContextKeys)) {
        this._renderChatTip();
      }
    }));
    let previousModelId;
    this._register(autorun((reader) => {
      const modelId = this._newChatInput.selectedModelState.read(reader).currentModel?.identifier;
      if (previousModelId !== void 0 && previousModelId !== modelId) {
        this._renderChatTip();
      }
      previousModelId = modelId;
    }));
    this._register(autorun((reader) => {
      const session = this._session.read(reader);
      const folderUri = session?.workspace.read(reader)?.folders[0]?.root;
      if (folderUri && !this.uriIdentityService.extUri.isEqual(folderUri, this._workspacePicker.selectedFolderUri)) {
        this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false });
      }
    }));
  }
  // --- Rendering ---
  render(parent) {
    const element = dom.append(parent, dom.$(".sessions-chat-widget"));
    const chatWidgetContainer = dom.append(element, dom.$(".new-chat-widget-container"));
    const chatWidgetContent = dom.append(chatWidgetContainer, dom.$(".new-chat-widget-content"));
    this._aquariumToggle = this._register(this.aquariumService.mountToggle(element));
    const aquariumAction = this._register(new Action(
      "sessions.aquarium.showAction",
      localize("aquariumAction", "Aquarium"),
      void 0,
      true,
      () => this.aquariumService.toggleActionVisibility()
    ));
    const petAction = this._register(new Action(
      "sessions.chatPet.toggle",
      localize("petAction", "Pet (/vscode-pet)"),
      void 0,
      true,
      () => this.chatPetService.toggle()
    ));
    this._register(dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, (e) => {
      const target = e.target;
      if (target && chatWidgetContent.contains(target)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      aquariumAction.checked = this.aquariumService.actionVisible.get();
      petAction.checked = this.chatPetService.enabled.get();
      const anchor = new StandardMouseEvent(dom.getWindow(element), e);
      this.contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        getActions: () => [aquariumAction, petAction],
        getCheckedActionsRepresentation: () => "checkbox"
      });
    }));
    const workspacePickerContainer = dom.append(chatWidgetContent, dom.$(".new-session-workspace-picker-container"));
    this._register(isWeb ? this._renderEmptyStateGate(workspacePickerContainer, chatWidgetContent) : this._renderWorkspacePicker(workspacePickerContainer));
    if (!isWeb && !this._renderHarnessPickerInControls) {
      const quickChatHeaderRow = dom.append(chatWidgetContent, dom.$(".new-session-quick-chat-header.session-workspace-picker"));
      const quickChatHeaderLabel = dom.append(quickChatHeaderRow, dom.$(".session-workspace-picker-label"));
      quickChatHeaderLabel.textContent = localize("newChatHeader", "New Chat");
      const quickChatWithLabel = dom.append(quickChatHeaderRow, dom.$(".session-workspace-picker-label.session-workspace-picker-with-label"));
      quickChatWithLabel.textContent = localize("newSessionWith", "with");
      this._quickChatHeaderPickerHost = dom.append(quickChatHeaderRow, dom.$(".new-chat-quick-chat-header-picker-host"));
    }
    this._renderFeedbackBanner(chatWidgetContent);
    this._chatTipContainer = dom.append(chatWidgetContent, dom.$(".chat-getting-started-tip-container"));
    this._renderChatTip();
    this._newChatInput.render(chatWidgetContent, parent);
    this._register(autorun((reader) => {
      const isQuickChat = this._isQuickChatComposer.read(reader);
      chatWidgetContent.classList.toggle("quick-chat", isQuickChat);
      if (!isWeb) {
        this._workspacePickerVisibleKey.set(!isQuickChat);
      }
    }));
    if (!isWeb && !this._renderHarnessPickerInControls) {
      this._register(autorun((reader) => {
        const isQuickChat = this._isQuickChatComposer.read(reader);
        const target = isQuickChat ? this._quickChatHeaderPickerHost : this._workspacePickerRow;
        if (target) {
          this._newChatInput.sessionTypePicker.render(target, { className: "sessions-chat-session-type-picker" });
        }
      }));
    }
    this._seedWorkspaceDraft();
    if (!isWeb) {
      let wasQuickChat = this._isQuickChatComposer.get();
      this._register(autorun((reader) => {
        const isQuickChat = this._isQuickChatComposer.read(reader);
        if (wasQuickChat && !isQuickChat && !this._session.read(reader)) {
          this._seedWorkspaceDraft();
        }
        wasQuickChat = isQuickChat;
      }));
    }
    chatWidgetContainer.classList.add("revealed");
  }
  _renderChatTip() {
    if (!this._chatTipContainer) {
      return;
    }
    if (this.isInputOnboardingVisible()) {
      this._clearChatTip();
      return;
    }
    if (this._chatTipContainer.parentElement?.classList.contains("no-agent-host")) {
      return;
    }
    if (this.contextKeyService.getContextKeyValue(ChatContextKeys.foregroundSessionCount.key) !== 0) {
      this._isChatTipSessionInitialized = false;
      this._clearChatTip();
      return;
    }
    if (!this._isChatTipSessionInitialized) {
      this._isChatTipSessionInitialized = true;
      this.chatTipService.resetSession();
    }
    const tip = this.chatTipService.getWelcomeTip(this.contextKeyService);
    if (!tip) {
      this._clearChatTip();
      return;
    }
    if (this._chatTipPart.value) {
      dom.setVisibility(true, this._chatTipContainer);
      return;
    }
    const store = new DisposableStore();
    const renderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
    const tipPart = store.add(this.instantiationService.createInstance(ChatTipContentPart, tip, renderer));
    store.add(tipPart.onDidHide(() => {
      this._clearChatTip();
      this.focusInput();
    }));
    this._chatTipPart.value = store;
    dom.clearNode(this._chatTipContainer);
    this._chatTipContainer.appendChild(tipPart.domNode);
    dom.setVisibility(true, this._chatTipContainer);
  }
  _clearChatTip() {
    this._chatTipPart.clear();
    if (this._chatTipContainer) {
      dom.clearNode(this._chatTipContainer);
      dom.setVisibility(false, this._chatTipContainer);
    }
  }
  isInputOnboardingVisible() {
    return this._isInputOnboardingVisible;
  }
  setInputOnboardingVisible(visible) {
    this._isInputOnboardingVisible = visible;
    if (visible) {
      this._clearChatTip();
    } else {
      this._renderChatTip();
    }
  }
  /**
   * Seed the new-session draft from the workspace picker's restored folder,
   * unless an active session already exists (then just sync the picker to it).
   */
  _seedWorkspaceDraft() {
    const restoredFolderUri = this._workspacePicker.selectedFolderUri;
    if (!this._syncWorkspacePickerFromActiveSession() && restoredFolderUri) {
      void this._createNewSession(restoredFolderUri);
    }
  }
  /**
   * If a new-session draft was restored by {@link openNewSession}, sync
   * the workspace picker to match the session's workspace. The picker may
   * have restored a workspace from a different provider (e.g. remote vs
   * local), so overwrite it with the session's actual workspace without
   * firing the event (which would trigger {@link _onWorkspaceSelected} and
   * create a new session).
   *
   * @returns `true` if an active session was found and the picker was synced.
   */
  _syncWorkspacePickerFromActiveSession() {
    const activeSession = this._session.get();
    if (!activeSession) {
      return false;
    }
    const sessionWorkspace = activeSession.workspace.get();
    const folderUri = sessionWorkspace?.folders[0]?.root;
    if (folderUri) {
      this._workspacePicker.setSelectedWorkspace(folderUri, { fireEvent: false });
      this._replaceDraftOnUnservableHarness(folderUri, activeSession);
    }
    return true;
  }
  /**
   * Replaces a restored draft whose harness the folder can no longer serve.
   * A draft outlives navigation, so it can name a session type that has since
   * stopped being advertised — e.g. the extension-host Copilot CLI once
   * `chat.agents.copilotCli.hideExtensionHost` is on. Keeping it would leave
   * the composer showing, and sending to, an agent the harness picker doesn't
   * list. An empty type list means the folder's providers haven't reported yet
   * (a late-connecting agent host), so the draft is left alone.
   */
  _replaceDraftOnUnservableHarness(folderUri, draft) {
    if (draft.isCreated.get()) {
      return;
    }
    const pick = { providerId: draft.providerId, sessionTypeId: draft.sessionType };
    if (this.sessionsManagementService.getSessionTypesForFolder(folderUri).length === 0 || this._isPreferredServable(folderUri, pick)) {
      return;
    }
    void this._createNewSession(folderUri);
  }
  _isPreferredServable(folderUri, pick) {
    return this.sessionsManagementService.getSessionTypesForFolder(folderUri).some((t) => (pick.providerId === void 0 || t.providerId === pick.providerId) && t.sessionType.id === pick.sessionTypeId);
  }
  async _createNewSession(folderUri) {
    this._pendingPreferredUpgrade.clear();
    const creationCts = new CancellationTokenSource();
    const creationLifecycle = toDisposable(() => creationCts.dispose(true));
    this._newSessionCreation.value = creationLifecycle;
    const userPick = this._newChatInput.sessionTypePicker.getUserPickedSessionType();
    const pendingChange = new DisposableStore();
    let changedWhilePending = false;
    pendingChange.add(this.sessionsManagementService.onDidChangeSessionTypes(() => changedWhilePending = true));
    let result;
    try {
      result = await this._createSessionNow(folderUri, userPick, creationCts.token);
    } finally {
      pendingChange.dispose();
    }
    const isCurrentCreation = this._newSessionCreation.value === creationLifecycle;
    if (isCurrentCreation) {
      this._newSessionCreation.clear();
    } else {
      return result;
    }
    if (result.trustDeclined) {
      this._pendingPreferredUpgrade.clear();
      return result;
    }
    if (!result.session || !userPick || !this._isPreferredServable(folderUri, userPick)) {
      this._scheduleRecreateOnProviderChange(folderUri, userPick, result.session, changedWhilePending);
    }
    return result;
  }
  async _createSessionNow(folderUri, userPick, token) {
    const effectivePick = userPick && this._isPreferredServable(folderUri, userPick) ? userPick : this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
    const fallbackProviderId = this._workspacePicker.selectedResolved?.providerId;
    try {
      return await this.sessionsService.openNewSession({
        folderUri,
        ...effectivePick ? { providerId: effectivePick.providerId, sessionTypeId: effectivePick.sessionTypeId } : fallbackProviderId ? { providerId: fallbackProviderId } : void 0
      }, token);
    } catch (e) {
      this.logService.error("Failed to create new session:", e);
      return { session: void 0, trustDeclined: false };
    }
  }
  _scheduleRecreateOnProviderChange(folderUri, userPick, created, replayMissedChange) {
    const store = new DisposableStore();
    store.add(this.sessionsManagementService.onDidChangeSessionTypes(() => this._recreateOnProviderChange(folderUri, userPick, created)));
    this._pendingPreferredUpgrade.value = store;
    if (replayMissedChange) {
      this._recreateOnProviderChange(folderUri, userPick, created);
    }
  }
  _recreateOnProviderChange(folderUri, userPick, created) {
    if (created) {
      const active = this._session.get();
      if (active?.sessionId !== created.sessionId || active.isCreated.get()) {
        return;
      }
      if (userPick) {
        if (!this._isPreferredServable(folderUri, userPick)) {
          return;
        }
      } else {
        const preferred = this._newChatInput.sessionTypePicker.getPreferredSessionType(folderUri);
        if (!preferred || preferred.providerId === active.providerId && preferred.sessionTypeId === active.sessionType) {
          return;
        }
      }
    }
    void this._createNewSession(folderUri);
  }
  /**
   * Returns the workspace URI for the context picker based on the current workspace selection.
   */
  _getContextFolderUri() {
    return this._workspacePicker.selectedFolderUri;
  }
  _renderWorkspacePicker(container) {
    this._workspacePickerVisibleKey.set(true);
    const pickersRow = dom.append(container, dom.$(".session-workspace-picker"));
    const pickersLabel = dom.append(pickersRow, dom.$(".session-workspace-picker-label"));
    pickersLabel.textContent = this._workspacePicker.selectedFolderUri ? localize("newSessionIn", "New session in") : localize("newSessionChooseWorkspace", "Start by picking a");
    this._workspacePicker.render(pickersRow);
    if (!this._renderHarnessPickerInControls) {
      const withLabel = dom.append(pickersRow, dom.$(".session-workspace-picker-label.session-workspace-picker-with-label"));
      withLabel.textContent = localize("newSessionWith", "with");
      this._workspacePickerRow = pickersRow;
      if (isWeb) {
        this._newChatInput.sessionTypePicker.render(pickersRow, { className: "sessions-chat-session-type-picker" });
      }
    }
    return this._workspacePicker.onDidSelectWorkspace(() => {
      const folderUri = this._workspacePicker.selectedFolderUri;
      pickersLabel.textContent = folderUri ? localize("newSessionIn", "New session in") : localize("newSessionChooseWorkspace", "Start by picking a");
    });
  }
  _renderEmptyState(container) {
    this._workspacePickerVisibleKey.set(false);
    const emptyState = this.instantiationService.createInstance(NoAgentHostEmptyState);
    emptyState.render(container);
    this._activeEmptyState = emptyState;
    return {
      dispose: () => {
        if (this._activeEmptyState === emptyState) {
          this._activeEmptyState = void 0;
        }
        emptyState.dispose();
      }
    };
  }
  /**
   * Web-only: hosts the workspace picker, but swaps it out for the
   * no-agent-host empty state once we are *sure* there are no hosts —
   * i.e. after a discovery cycle has completed. Rendering the empty
   * state before discovery has run would briefly flash it at users who
   * actually have hosts that just haven't been discovered yet (e.g.
   * cached tunnels resolved on startup). Until then we keep the regular
   * workspace picker, which has its own loading affordance.
   */
  _renderEmptyStateGate(container, chatWidgetContent) {
    const store = new DisposableStore();
    const pickerSlot = dom.append(container, dom.$(".session-workspace-picker-slot"));
    const stateDisposables = store.add(new MutableDisposable());
    const showPicker = () => {
      chatWidgetContent.classList.remove("no-agent-host");
      dom.clearNode(pickerSlot);
      stateDisposables.value = this._renderWorkspacePicker(pickerSlot);
      this._renderChatTip();
    };
    const showEmptyState = () => {
      chatWidgetContent.classList.add("no-agent-host");
      dom.clearNode(pickerSlot);
      stateDisposables.value = this._renderEmptyState(pickerSlot);
      this._clearChatTip();
    };
    const filter = this.agentHostFilterService;
    let hasCompletedDiscovery = filter.hosts.length > 0;
    if (!hasCompletedDiscovery && !filter.isDiscovering) {
      filter.rediscover();
    }
    const update = () => {
      if (hasCompletedDiscovery && !filter.isDiscovering && filter.hosts.length === 0) {
        showEmptyState();
      } else {
        showPicker();
      }
    };
    update();
    store.add(filter.onDidChange(() => {
      if (filter.hosts.length > 0) {
        hasCompletedDiscovery = true;
      }
      update();
    }));
    store.add(filter.onDidChangeDiscovering(() => {
      if (!filter.isDiscovering) {
        hasCompletedDiscovery = true;
      }
      update();
    }));
    return store;
  }
  // --- Send ---
  async _send(query, attachedContext, background) {
    const session = this._session.get();
    if (!session) {
      this._workspacePicker.showPicker();
      return false;
    }
    const feedbackItems = [...this._feedbackItems.get()];
    const workspaceRoots = session.workspace.get()?.folders.map((folder) => folder.root) ?? (this._workspacePicker.selectedFolderUri ? [this._workspacePicker.selectedFolderUri] : []);
    const request = buildNewSessionPrompt(query, feedbackItems, workspaceRoots);
    const wasQuickChat = this._isQuickChatComposer.get();
    const reseedFolderUri = background && !wasQuickChat ? this._workspacePicker.selectedFolderUri : void 0;
    const sendOptions = { query: request, attachedContext, background };
    const clearFeedback = () => {
      for (const item of feedbackItems) {
        this.agentFeedbackService.removeFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, item.id);
      }
    };
    if (background) {
      this._pendingBackgroundSends.set(sendOptions, Event.once(
        Event.filter(this.sessionsManagementService.onDidSendRequest, (event) => event.options === sendOptions)
      )(() => {
        clearFeedback();
        this._pendingBackgroundSends.deleteAndDispose(sendOptions);
      }));
    }
    try {
      await this.sessionsManagementService.sendNewChatRequest(session, sendOptions);
    } catch (e) {
      this._pendingBackgroundSends.deleteAndDispose(sendOptions);
      this.logService.error("Failed to send request:", e);
      return false;
    }
    if (!background) {
      clearFeedback();
    }
    if (background) {
      if (wasQuickChat) {
        this.sessionsService.openQuickChat();
      } else if (reseedFolderUri) {
        await this._createNewSession(reseedFolderUri);
      }
    }
    return true;
  }
  _renderFeedbackBanner(container) {
    const host = dom.append(container, dom.$(".session-input-banners.new-session-feedback-banners"));
    const content = this._register(new MutableDisposable());
    this._register(autorun((reader) => {
      const feedbackItems = this._feedbackItems.read(reader);
      content.clear();
      dom.clearNode(host);
      if (!feedbackItems.length) {
        return;
      }
      const count = feedbackItems.length;
      const text = count === 1 ? localize("newSessionFeedback.one", "1 comment") : localize("newSessionFeedback.many", "{0} comments", count);
      const store = new DisposableStore();
      content.value = store;
      const banner = store.add(this.instantiationService.createInstance(SessionInputBannerWidget, {
        icon: Codicon.commentDiscussion,
        accent: false,
        text,
        ariaLabel: text,
        actions: [{
          label: localize("newSessionFeedback.reveal", "Reveal"),
          run: () => this.agentFeedbackService.revealFeedback(AGENT_FEEDBACK_NEW_SESSION_RESOURCE, feedbackItems[0].id)
        }]
      }));
      host.appendChild(banner.domNode);
    }));
  }
  saveState() {
    this._newChatInput.saveState();
  }
  layout(_height, _width) {
    this._newChatInput.layout(_height, _width);
  }
  focusInput() {
    if (this._activeEmptyState) {
      this._activeEmptyState.focus();
      return;
    }
    this._newChatInput.focus();
  }
  /**
   * Handles a workspace selection from the workspace picker and creates a
   * new session for it. Workspace trust (when required) is requested by
   * {@link ISessionsService.openNewSession} itself — a single gate shared
   * by every path that creates a concrete session for a folder.
   */
  async _onWorkspaceSelected(folderUri) {
    this._pendingPreferredUpgrade.clear();
    if (!folderUri) {
      this.sessionsService.unsetNewSession();
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    const result = await this._createNewSession(folderUri);
    if (result.trustDeclined) {
      this._workspacePicker.removeFromRecents(folderUri);
    }
  }
  prefillInput(text) {
    this._newChatInput.prefillInput(text);
  }
  setHostVisible(visible) {
    this._aquariumToggle?.setHostVisible(visible);
  }
  sendQuery(text) {
    this._newChatInput.sendQuery(text);
  }
  submitInput() {
    if (!this._session.get()) {
      this._workspacePicker.showPicker();
      return Promise.resolve(false);
    }
    return this._newChatInput.submit();
  }
  attach(uris) {
    this._newChatInput.attach(uris);
  }
  selectWorkspace(folderUri, providerId) {
    this._workspacePicker.setSelectedWorkspace(folderUri, { providerId });
  }
};
NewChatWidget = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IContextMenuService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ISessionsManagementService),
  __decorateParam(7, ISessionsService),
  __decorateParam(8, IAquariumService),
  __decorateParam(9, IAgentHostFilterService),
  __decorateParam(10, IUriIdentityService),
  __decorateParam(11, IAgentFeedbackService),
  __decorateParam(12, IChatPetService),
  __decorateParam(13, IChatTipService),
  __decorateParam(14, IOpenerService)
], NewChatWidget);
export {
  NewChatWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL25ld0NoYXRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdFdpZGdldC5jc3MnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGUsIGF1dG9ydW4sIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlU2lnbmFsRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJT3Blbk5ld1Nlc3Npb25SZXN1bHQsIElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXF1YXJpdW1TZXJ2aWNlLCBJTW91bnRlZFRvZ2dsZUhhbmRsZSB9IGZyb20gJy4uLy4uL2FxdWFyaXVtL2Jyb3dzZXIvYXF1YXJpdW1PdmVybGF5LmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVBpY2tlciB9IGZyb20gJy4vc2Vzc2lvbldvcmtzcGFjZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBXZWJXb3Jrc3BhY2VQaWNrZXIgfSBmcm9tICcuL3dlYldvcmtzcGFjZVBpY2tlci5qcyc7XG5pbXBvcnQgeyBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfSBmcm9tICcuL3Nlc3Npb25UeXBlUGlja2VyLmpzJztcbmltcG9ydCB7IE5ld0NoYXRJbnB1dFdpZGdldCB9IGZyb20gJy4vbmV3Q2hhdElucHV0LmpzJztcbmltcG9ydCB7IE5vQWdlbnRIb3N0RW1wdHlTdGF0ZSB9IGZyb20gJy4vbm9BZ2VudEhvc3RFbXB0eVN0YXRlLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWdlbnRIb3N0RmlsdGVyL2NvbW1vbi9hZ2VudEhvc3RGaWx0ZXIuanMnO1xuaW1wb3J0IHsgSUNoYXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvY2hhdFZpZXcuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbldvcmtzcGFjZVBpY2tlclZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLCBBZ2VudEZlZWRiYWNrU3RhdGUsIElBZ2VudEZlZWRiYWNrLCBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi9hZ2VudEZlZWRiYWNrL2Jyb3dzZXIvYWdlbnRGZWVkYmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGROZXdTZXNzaW9uUHJvbXB0IH0gZnJvbSAnLi4vLi4vYWdlbnRGZWVkYmFjay9icm93c2VyL2FnZW50RmVlZGJhY2tBdHRhY2htZW50RW50cnkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbklucHV0QmFubmVyV2lkZ2V0IH0gZnJvbSAnLi4vLi4vc2Vzc2lvbklucHV0QmFubmVycy9icm93c2VyL3Nlc3Npb25JbnB1dEJhbm5lcldpZGdldC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdFRpcENvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUaXBDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFBldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFBldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRUaXBTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRUaXBTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcblxuLy8gI3JlZ2lvbiAtLS0gTmV3IENoYXQgV2lkZ2V0IC0tLVxuXG5leHBvcnQgY2xhc3MgTmV3Q2hhdFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVBpY2tlcjogV29ya3NwYWNlUGlja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9uZXdDaGF0SW5wdXQ6IE5ld0NoYXRJbnB1dFdpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFRpcFBhcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSBfY2hhdFRpcENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2lzQ2hhdFRpcFNlc3Npb25Jbml0aWFsaXplZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9pc0lucHV0T25ib2FyZGluZ1Zpc2libGUgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYXF1YXJpdW1Ub2dnbGU6IElNb3VudGVkVG9nZ2xlSGFuZGxlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBSZWNyZWF0ZXMgdGhlIGRyYWZ0IG9uY2UgYSBiZXR0ZXIvbGF0ZS1yZWdpc3RlcmluZyBwcm92aWRlciBjYW4gc2VydmUgdGhlIGZvbGRlciAoc2VlIHtAbGluayBfY3JlYXRlTmV3U2Vzc2lvbn0pLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUHJlZmVycmVkVXBncmFkZSA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbkNyZWF0aW9uID0gbmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpO1xuXG5cdC8qKlxuXHQgKiBUaGUgY3VycmVudGx5IG1vdW50ZWQgbm8tYWdlbnQtaG9zdCBlbXB0eSBzdGF0ZSwgaWYgYW55LiBTZXQgYnlcblx0ICoge0BsaW5rIF9yZW5kZXJFbXB0eVN0YXRlR2F0ZX0gd2hpbGUgdGhlIGVtcHR5IHN0YXRlIHJlcGxhY2VzIHRoZVxuXHQgKiB3b3Jrc3BhY2UgcGlja2VyOyBjb25zdWx0ZWQgYnkge0BsaW5rIGZvY3VzSW5wdXR9IHRvIHJvdXRlIGZvY3VzIHRvXG5cdCAqIHRoZSB2aXNpYmxlIGhlYWRpbmcgaW5zdGVhZCBvZiB0aGUgKGhpZGRlbikgY2hhdCBpbnB1dC5cblx0ICovXG5cdHByaXZhdGUgX2FjdGl2ZUVtcHR5U3RhdGU6IE5vQWdlbnRIb3N0RW1wdHlTdGF0ZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2hldGhlciB0byByZW5kZXIgdGhlIHNlc3Npb24gdHlwZSAoXCJoYXJuZXNzXCIpIHBpY2tlciBiZWxvdyB0aGUgaW5wdXRcblx0ICogKGluIHRoZSBjb250cm9scykgaW5zdGVhZCBvZiBuZXh0IHRvIHRoZSB3b3Jrc3BhY2UgcGlja2VyLiBSZWFkIG9uY2UgZnJvbVxuXHQgKiB0aGUgdmlldyBvcHRpb25zIGF0IGNvbnN0cnVjdGlvbiB0aW1lOyB0aGUgd2lkZ2V0IGRvZXMgbm90IHJlYWN0IHRvIGxhdGVyXG5cdCAqIGNoYW5nZXMgb2YgdGhlIHNvdXJjZSBvYnNlcnZhYmxlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVySGFybmVzc1BpY2tlckluQ29udHJvbHM6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdC8qKiBXaGV0aGVyIHRoZSBhY3RpdmUgZHJhZnQgaXMgYSB3b3Jrc3BhY2UtbGVzcyBxdWljayBjaGF0IChoaWRlcyB0aGUgd29ya3NwYWNlIHBpY2tlcikuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzUXVpY2tDaGF0Q29tcG9zZXI6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdC8qKiBEcmFmdCBjb21tZW50cyBzaGFyZWQgYnkgZXZlcnkgdW5jcmVhdGVkIG5ldy1zZXNzaW9uIGNvbXBvc2VyLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mZWVkYmFja0l0ZW1zOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRGZWVkYmFja1tdPjtcblxuXHQvKiogSW4tZmxpZ2h0IGJhY2tncm91bmQgc2VuZHMgYXdhaXRpbmcgY29uZmlybWF0aW9uIGJlZm9yZSB0aGVpciBjb21tZW50cyBhcmUgY2xlYXJlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0JhY2tncm91bmRTZW5kcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPG9iamVjdD4oKSk7XG5cblx0LyoqIFRoZSB3b3Jrc3BhY2Utcm93IGNvbnRhaW5lciBob3N0aW5nIHRoZSBpbmxpbmUgaGFybmVzcyBwaWNrZXIgKGRlc2t0b3AsIG5vbi1xdWljay1jaGF0KS4gKi9cblx0cHJpdmF0ZSBfd29ya3NwYWNlUGlja2VyUm93OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHQvKiogVGhlIHF1aWNrLWNoYXQgaGVhZGVyIHJvdyBob3N0aW5nIHRoZSBpbmxpbmUgaGFybmVzcyBwaWNrZXIgKGRlc2t0b3AsIHF1aWNrIGNoYXQpLiAqL1xuXHRwcml2YXRlIF9xdWlja0NoYXRIZWFkZXJQaWNrZXJIb3N0OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVHJhY2tzIHdoZXRoZXIgdGhlIHdvcmtzcGFjZSBwaWNrZXIgaXMgY3VycmVudGx5IHJlbmRlcmVkICh2cyByZXBsYWNlZCBieVxuXHQgKiB0aGUgbm8tYWdlbnQtaG9zdCBlbXB0eSBzdGF0ZSBvbiB3ZWIpLiBDb25zdW1lZCBieSB0aGUgbmV3LXNlc3Npb24tdmlld1xuXHQgKiBvbmJvYXJkaW5nIHRvdXIgdG8gc2tpcCB0aGUgd29ya3NwYWNlIHN0ZXAgd2hlbiB0aGUgcGlja2VyIGlzIG5vdCBzaG93bi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVBpY2tlclZpc2libGVLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUNoYXRWaWV3T3B0aW9ucyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSxcblx0XHRASUFxdWFyaXVtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFxdWFyaXVtU2VydmljZTogSUFxdWFyaXVtU2VydmljZSxcblx0XHRASUFnZW50SG9zdEZpbHRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUFnZW50RmVlZGJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRGZWVkYmFja1NlcnZpY2U6IElBZ2VudEZlZWRiYWNrU2VydmljZSxcblx0XHRASUNoYXRQZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFBldFNlcnZpY2U6IElDaGF0UGV0U2VydmljZSxcblx0XHRASUNoYXRUaXBTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFRpcFNlcnZpY2U6IElDaGF0VGlwU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXJWaXNpYmxlS2V5ID0gU2Vzc2lvbldvcmtzcGFjZVBpY2tlclZpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3dvcmtzcGFjZVBpY2tlclZpc2libGVLZXkucmVzZXQoKSkpO1xuXHRcdHRoaXMuX3JlbmRlckhhcm5lc3NQaWNrZXJJbkNvbnRyb2xzID0gdGhpcy5vcHRpb25zLnJlbmRlclNlc3Npb25UeXBlUGlja2VySW5Db250cm9scy5nZXQoKTtcblx0XHQvLyBPbiB3ZWIgKHZzY29kZS5kZXYgLyBpbnNpZGVycy52c2NvZGUuZGV2KSwgdXNlIHtAbGluayBXZWJXb3Jrc3BhY2VQaWNrZXJ9XG5cdFx0Ly8gd2hpY2ggc2NvcGVzIHJlY2VudHMgdG8gdGhlIGFjdGl2ZSBob3N0IGFuZCByZW5kZXJzIGFzIGEgYm90dG9tXG5cdFx0Ly8gc2hlZXQgb24gcGhvbmUtbGF5b3V0IHZpZXdwb3J0cy4gT24gRWxlY3Ryb24gZGVza3RvcCwgdGhlIHJlZ3VsYXJcblx0XHQvLyB7QGxpbmsgV29ya3NwYWNlUGlja2VyfSBpcyBmaW5lIFx1MjAxNCBwaG9uZXMgbmV2ZXIgcnVuIHRoZXJlLlxuXHRcdGNvbnN0IFBpY2tlckN0b3IgPSBpc1dlYiA/IFdlYldvcmtzcGFjZVBpY2tlciA6IFdvcmtzcGFjZVBpY2tlcjtcblx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBpY2tlckN0b3IsIHt9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcGVuZGluZ1ByZWZlcnJlZFVwZ3JhZGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX25ld1Nlc3Npb25DcmVhdGlvbik7XG5cblx0XHQvLyBUT0RPOiBAc2FuZHkwODEgVGhlIHNlc3Npb24vY2hhdCBzaG91bGQgYmUgcGFzc2VkIGRvd24uIFRoZXJlIHNob3VsZCBub3QgYmUgc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24gcmVhZCBpbiB0aGUgd2lkZ2V0LlxuXHRcdHRoaXMuX3Nlc3Npb24gPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgKHJlYWRlciwgcHJldikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGFjdGl2ZVNlc3Npb24gJiYgYWN0aXZlU2Vzc2lvbi5pc0NyZWF0ZWQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHJldHVybiBwcmV2O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGFjdGl2ZVNlc3Npb247XG5cdFx0fSk7XG5cblx0XHQvLyBBIHF1aWNrIGNoYXQgaXMgd29ya3NwYWNlLWxlc3M7IHRoZSBjb21wb3NlciBoaWRlcyB0aGUgd29ya3NwYWNlIHBpY2tlclxuXHRcdC8vIChub3RoaW5nIHRvIHBpY2spIGFuZCBzdXJmYWNlcyB0aGUgc2Vzc2lvbi10eXBlIHBpY2tlciBpbiB0aGUgY29udHJvbHMuXG5cdFx0dGhpcy5faXNRdWlja0NoYXRDb21wb3NlciA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBzZXNzaW9uPy5pc1F1aWNrQ2hhdD8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZmVlZGJhY2tDaGFuZ2VkID0gb2JzZXJ2YWJsZVNpZ25hbEZyb21FdmVudCh0aGlzLCB0aGlzLmFnZW50RmVlZGJhY2tTZXJ2aWNlLm9uRGlkQ2hhbmdlRmVlZGJhY2spO1xuXHRcdHRoaXMuX2ZlZWRiYWNrSXRlbXMgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRmZWVkYmFja0NoYW5nZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHRoaXMuYWdlbnRGZWVkYmFja1NlcnZpY2UuZ2V0RmVlZGJhY2soQUdFTlRfRkVFREJBQ0tfTkVXX1NFU1NJT05fUkVTT1VSQ0UpXG5cdFx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtLnN0YXRlID09PSBBZ2VudEZlZWRiYWNrU3RhdGUuQWNjZXB0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2FuU2VuZFJlcXVlc3QgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24ubG9hZGluZy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBsb2FkaW5nID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHNlc3Npb24/LmxvYWRpbmcucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXHRcdH0pO1xuXHRcdGNvbnN0IGhhc0ZlZWRiYWNrID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fZmVlZGJhY2tJdGVtcy5yZWFkKHJlYWRlcikubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgY2FuU3VibWl0V2l0aG91dFNlc3Npb24gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiAhdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcikgJiYgaGFzRmVlZGJhY2sucmVhZChyZWFkZXIpKTtcblxuXHRcdGNvbnN0IG5ld0NoYXRJbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3Q2hhdElucHV0V2lkZ2V0LCB7XG5cdFx0XHRzZXNzaW9uOiB0aGlzLl9zZXNzaW9uLFxuXHRcdFx0Z2V0Q29udGV4dEZvbGRlclVyaTogKCkgPT4gdGhpcy5fZ2V0Q29udGV4dEZvbGRlclVyaSgpLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICh7IHF1ZXJ5LCBhdHRhY2htZW50cywgYmFja2dyb3VuZCB9KSA9PiB0aGlzLl9zZW5kKHF1ZXJ5LCBhdHRhY2htZW50cywgYmFja2dyb3VuZCksXG5cdFx0XHRjYW5TZW5kUmVxdWVzdCxcblx0XHRcdGNhblN1Ym1pdFdpdGhvdXRTZXNzaW9uLFxuXHRcdFx0aGFzQWRkaXRpb25hbFNlbmRDb250ZW50OiBoYXNGZWVkYmFjayxcblx0XHRcdGxvYWRpbmcsXG5cdFx0XHRoaXN0b3J5S2V5OiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSwgLy8gbm8gcGVyc2lzdGVkIGhpc3RvcnkgZm9yIHRoZSBuZXctc2Vzc2lvbiB2aWV3XG5cdFx0XHRyZW5kZXJTZXNzaW9uVHlwZVBpY2tlckluQ29udHJvbHM6IHRoaXMuX3JlbmRlckhhcm5lc3NQaWNrZXJJbkNvbnRyb2xzLFxuXHRcdFx0c3VwcG9ydHNCYWNrZ3JvdW5kOiB0cnVlLFxuXHRcdFx0Z2V0SW5wdXRPbmJvYXJkaW5nVGlwQ29udGFpbmVyOiAoKSA9PiB0aGlzLl9jaGF0VGlwQ29udGFpbmVyLFxuXHRcdFx0b25EaWRDaGFuZ2VJbnB1dE9uYm9hcmRpbmdWaXNpYmxlOiB2aXNpYmxlID0+IHRoaXMuc2V0SW5wdXRPbmJvYXJkaW5nVmlzaWJsZSh2aXNpYmxlKSxcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gbmV3Q2hhdElucHV0LnNhdmVTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0ID0gdGhpcy5fcmVnaXN0ZXIobmV3Q2hhdElucHV0KTtcblxuXHRcdC8vIENvbW1lbnQgMzogQmluZCBBZ2VudCBtb2RlIGluIHRoZSBzY29wZWQgY29udGV4dCBzbyB0aGF0IEFnZW50LW9ubHkgdGlwc1xuXHRcdC8vIChtZXNzYWdlUXVldWVpbmcsIHN1YmFnZW50cywgZXRjLikgYXJlIGVsaWdpYmxlIGFuZCBjaGF0TW9kZUtpbmQtYmFzZWRcblx0XHQvLyB3aGVuLWNsYXVzZXMgZXZhbHVhdGUgY29ycmVjdGx5IGFnYWluc3QgdGhpcyBjb21wb3NlcidzIGFjdHVhbCBtb2RlLlxuXHRcdGNvbnN0IGNoYXRNb2RlS2luZEtleSA9IENoYXRDb250ZXh0S2V5cy5jaGF0TW9kZUtpbmQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjaGF0TW9kZUtpbmRLZXkuc2V0KENoYXRNb2RlS2luZC5BZ2VudCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGNoYXRNb2RlS2luZEtleS5yZXNldCgpKSk7XG5cblx0XHQvLyBDb21tZW50IDQ6IFJvdXRlIHRpcCBjb21tYW5kIGxpbmtzIHRvIHRoaXMgY29tcG9zZXIncyBvd24gcGlja2Vyc1xuXHRcdC8vIHNvIHRoZXkgZG8gbm90IGZhbGwgdGhyb3VnaCB0byBJQ2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXRcblx0XHQvLyAod2hpY2ggdGhpcyBjb21wb3NlciBpcyBub3QgcmVnaXN0ZXJlZCB3aXRoKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9wZW5lclNlcnZpY2UucmVnaXN0ZXJPcGVuZXIoe1xuXHRcdFx0b3BlbjogYXN5bmMgKHJlc291cmNlOiBVUkkgfCBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jaGF0VGlwUGFydC52YWx1ZSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBsaW5rID0gdHlwZW9mIHJlc291cmNlID09PSAnc3RyaW5nJyA/IHJlc291cmNlIDogcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKGxpbmsgPT09ICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTW9kZWxQaWNrZXInKSB7XG5cdFx0XHRcdFx0dGhpcy5fbmV3Q2hhdElucHV0Lm9wZW5Nb2RlbFBpY2tlcigpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsaW5rID09PSAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblBsYW4nKSB7XG5cdFx0XHRcdFx0Ly8gUGxhbiBtb2RlIGlzIG5vdCBhdmFpbGFibGUgaW4gdGhlIG5ldy1zZXNzaW9uIGNvbXBvc2VyOyBjb25zdW1lXG5cdFx0XHRcdFx0Ly8gdGhlIGxpbmsgd2l0aG91dCBhY3Rpb24gc28gaXQgZG9lcyBub3QgbWlzZmlyZSBvbiBhIHN0YWxlIHdpZGdldC5cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya3NwYWNlUGlja2VyLm9uRGlkU2VsZWN0V29ya3NwYWNlKGFzeW5jIGZvbGRlclVyaSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLl9vbldvcmtzcGFjZVNlbGVjdGVkKGZvbGRlclVyaSk7XG5cdFx0XHR0aGlzLl9uZXdDaGF0SW5wdXQuZm9jdXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbmV3Q2hhdElucHV0LnNlc3Npb25UeXBlUGlja2VyLm9uRGlkU2VsZWN0U2Vzc2lvblR5cGUoYXN5bmMgcGljayA9PiB7XG5cdFx0XHQvLyBBIHF1aWNrIGNoYXQgaGFzIG5vIGZvbGRlcjogcmUtY3JlYXRlIHRoZSBkcmFmdCB3aXRoIHRoZSBwaWNrZWRcblx0XHRcdC8vIHR5cGUgdmlhIG9wZW5RdWlja0NoYXQgKG1pcnJvcnMgdGhlIGZvbGRlciBwYXRoJ3MgZHJhZnQgcmVjcmVhdGlvbikuXG5cdFx0XHRpZiAodGhpcy5faXNRdWlja0NoYXRDb21wb3Nlci5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLnNlc3Npb25zU2VydmljZS5vcGVuUXVpY2tDaGF0KHBpY2sgPyB7IHByb3ZpZGVySWQ6IHBpY2sucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogcGljay5zZXNzaW9uVHlwZUlkIH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLl9uZXdDaGF0SW5wdXQuZm9jdXMoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fb25Xb3Jrc3BhY2VTZWxlY3RlZCh0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmkpO1xuXHRcdFx0dGhpcy5fbmV3Q2hhdElucHV0LmZvY3VzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2NoYXQudGlwcy5lbmFibGVkJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2NoYXQudGlwcy5lbmFibGVkJykpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQ2hhdFRpcCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJDaGF0VGlwKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGZvcmVncm91bmRTZXNzaW9uQ291bnRDb250ZXh0S2V5cyA9IG5ldyBTZXQoW0NoYXRDb250ZXh0S2V5cy5mb3JlZ3JvdW5kU2Vzc2lvbkNvdW50LmtleV0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUoZm9yZWdyb3VuZFNlc3Npb25Db3VudENvbnRleHRLZXlzKSkge1xuXHRcdFx0XHR0aGlzLl9yZW5kZXJDaGF0VGlwKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29tbWVudCAyOiBSZS1ldmFsdWF0ZSB0aGUgdGlwIHdoZW4gdGhlIHNlbGVjdGVkIG1vZGVsIGNoYW5nZXMsIGJlY2F1c2Vcblx0XHQvLyBzb21lIHRpcHMgKGUuZy4gdGlwLnN3aXRjaFRvQXV0bykgYXJlIG9ubHkgZWxpZ2libGUgZm9yIHNwZWNpZmljIG1vZGVscy5cblx0XHRsZXQgcHJldmlvdXNNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxJZCA9IHRoaXMuX25ld0NoYXRJbnB1dC5zZWxlY3RlZE1vZGVsU3RhdGUucmVhZChyZWFkZXIpLmN1cnJlbnRNb2RlbD8uaWRlbnRpZmllcjtcblx0XHRcdGlmIChwcmV2aW91c01vZGVsSWQgIT09IHVuZGVmaW5lZCAmJiBwcmV2aW91c01vZGVsSWQgIT09IG1vZGVsSWQpIHtcblx0XHRcdFx0dGhpcy5fcmVuZGVyQ2hhdFRpcCgpO1xuXHRcdFx0fVxuXHRcdFx0cHJldmlvdXNNb2RlbElkID0gbW9kZWxJZDtcblx0XHR9KSk7XG5cblx0XHQvLyBSZS1zeW5jIHRoZSBwaWNrZXIncyBkaXNwbGF5ZWQgc2VsZWN0aW9uIHdoZW4gdGhlIHNlc3Npb24ncyB3b3Jrc3BhY2Vcblx0XHQvLyBjaGFuZ2VzIGV4dGVybmFsbHkgKGUuZy4gc2Vzc2lvbnNTZXJ2aWNlLm9wZW5OZXdTZXNzaW9uKHsgZm9sZGVyVXJpIH0pKS5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSBzZXNzaW9uPy53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzWzBdPy5yb290O1xuXHRcdFx0aWYgKGZvbGRlclVyaSAmJiAhdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoZm9sZGVyVXJpLCB0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmkpKSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZXRTZWxlY3RlZFdvcmtzcGFjZShmb2xkZXJVcmksIHsgZmlyZUV2ZW50OiBmYWxzZSB9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0gUmVuZGVyaW5nIC0tLVxuXG5cdHJlbmRlcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGRvbS5hcHBlbmQocGFyZW50LCBkb20uJCgnLnNlc3Npb25zLWNoYXQtd2lkZ2V0JykpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRDb250YWluZXIgPSBkb20uYXBwZW5kKGVsZW1lbnQsIGRvbS4kKCcubmV3LWNoYXQtd2lkZ2V0LWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBjaGF0V2lkZ2V0Q29udGVudCA9IGRvbS5hcHBlbmQoY2hhdFdpZGdldENvbnRhaW5lciwgZG9tLiQoJy5uZXctY2hhdC13aWRnZXQtY29udGVudCcpKTtcblxuXHRcdHRoaXMuX2FxdWFyaXVtVG9nZ2xlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5hcXVhcml1bVNlcnZpY2UubW91bnRUb2dnbGUoZWxlbWVudCkpO1xuXHRcdGNvbnN0IGFxdWFyaXVtQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihcblx0XHRcdCdzZXNzaW9ucy5hcXVhcml1bS5zaG93QWN0aW9uJyxcblx0XHRcdGxvY2FsaXplKCdhcXVhcml1bUFjdGlvbicsIFwiQXF1YXJpdW1cIiksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0KCkgPT4gdGhpcy5hcXVhcml1bVNlcnZpY2UudG9nZ2xlQWN0aW9uVmlzaWJpbGl0eSgpXG5cdFx0KSk7XG5cdFx0Y29uc3QgcGV0QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihcblx0XHRcdCdzZXNzaW9ucy5jaGF0UGV0LnRvZ2dsZScsXG5cdFx0XHRsb2NhbGl6ZSgncGV0QWN0aW9uJywgXCJQZXQgKC92c2NvZGUtcGV0KVwiKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRydWUsXG5cdFx0XHQoKSA9PiB0aGlzLmNoYXRQZXRTZXJ2aWNlLnRvZ2dsZSgpXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihlbGVtZW50LCBkb20uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0IGFzIE5vZGUgfCBudWxsO1xuXHRcdFx0aWYgKHRhcmdldCAmJiBjaGF0V2lkZ2V0Q29udGVudC5jb250YWlucyh0YXJnZXQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGFxdWFyaXVtQWN0aW9uLmNoZWNrZWQgPSB0aGlzLmFxdWFyaXVtU2VydmljZS5hY3Rpb25WaXNpYmxlLmdldCgpO1xuXHRcdFx0cGV0QWN0aW9uLmNoZWNrZWQgPSB0aGlzLmNoYXRQZXRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCk7XG5cdFx0XHRjb25zdCBhbmNob3IgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGRvbS5nZXRXaW5kb3coZWxlbWVudCksIGUpO1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFthcXVhcml1bUFjdGlvbiwgcGV0QWN0aW9uXSxcblx0XHRcdFx0Z2V0Q2hlY2tlZEFjdGlvbnNSZXByZXNlbnRhdGlvbjogKCkgPT4gJ2NoZWNrYm94Jyxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVBpY2tlckNvbnRhaW5lciA9IGRvbS5hcHBlbmQoY2hhdFdpZGdldENvbnRlbnQsIGRvbS4kKCcubmV3LXNlc3Npb24td29ya3NwYWNlLXBpY2tlci1jb250YWluZXInKSk7XG5cdFx0Ly8gT24gd2ViICh2c2NvZGUuZGV2IC8gaW5zaWRlcnMudnNjb2RlLmRldikgdGhlIHdvcmtzcGFjZSBwaWNrZXIgaXNcblx0XHQvLyBzY29wZWQgdG8gdGhlIGN1cnJlbnRseSBzZWxlY3RlZCBhZ2VudCBob3N0LiBXaGVuIG5vIGhvc3RzIGFyZVxuXHRcdC8vIGtub3duIHRoZXJlIGlzIG5vdGhpbmcgZm9yIHRoZSB1c2VyIHRvIHBpY2ssIHNvIHN3YXAgdGhlIHBpY2tlclxuXHRcdC8vIG91dCBmb3IgdGhlIG5vLWFnZW50LWhvc3QgZW1wdHkgc3RhdGUuIE9uIEVsZWN0cm9uIGRlc2t0b3AgdGhlXG5cdFx0Ly8gcmVndWxhciBwaWNrZXIgaXMgYWx3YXlzIGZ1bmN0aW9uYWwgKHRoZSBsb2NhbCBDb3BpbG90IHByb3ZpZGVyXG5cdFx0Ly8gaXMgYWx3YXlzIGF2YWlsYWJsZSkgc28gdGhpcyBicmFuY2ggaXMgd2ViLW9ubHkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaXNXZWJcblx0XHRcdD8gdGhpcy5fcmVuZGVyRW1wdHlTdGF0ZUdhdGUod29ya3NwYWNlUGlja2VyQ29udGFpbmVyLCBjaGF0V2lkZ2V0Q29udGVudClcblx0XHRcdDogdGhpcy5fcmVuZGVyV29ya3NwYWNlUGlja2VyKHdvcmtzcGFjZVBpY2tlckNvbnRhaW5lcikpO1xuXG5cdFx0Ly8gUXVpY2stY2hhdCBjb21wb3NlciBoZWFkZXIgKHdvcmtzcGFjZS1sZXNzKTogYSB0b3Atb2YtaW5wdXQgXCJOZXcgQ2hhdFwiXG5cdFx0Ly8gbGFiZWwgcGx1cyB0aGUgaW5saW5lIHNlc3Npb24tdHlwZSBwaWNrZXIuIFNob3duIG9ubHkgaW4gcXVpY2stY2hhdFxuXHRcdC8vIG1vZGUgdmlhIHRoZSBgLnF1aWNrLWNoYXRgIGNsYXNzIG9uIHRoZSBjb250ZW50IChzZWUgQ1NTKS4gT24gd2ViIHRoZVxuXHRcdC8vIGNvbXBvc2VyIGlzIG5ldmVyIGEgcXVpY2sgY2hhdCwgc28gaXQgc3RheXMgZW1wdHkvaGlkZGVuIHRoZXJlLlxuXHRcdGlmICghaXNXZWIgJiYgIXRoaXMuX3JlbmRlckhhcm5lc3NQaWNrZXJJbkNvbnRyb2xzKSB7XG5cdFx0XHRjb25zdCBxdWlja0NoYXRIZWFkZXJSb3cgPSBkb20uYXBwZW5kKGNoYXRXaWRnZXRDb250ZW50LCBkb20uJCgnLm5ldy1zZXNzaW9uLXF1aWNrLWNoYXQtaGVhZGVyLnNlc3Npb24td29ya3NwYWNlLXBpY2tlcicpKTtcblx0XHRcdGNvbnN0IHF1aWNrQ2hhdEhlYWRlckxhYmVsID0gZG9tLmFwcGVuZChxdWlja0NoYXRIZWFkZXJSb3csIGRvbS4kKCcuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyLWxhYmVsJykpO1xuXHRcdFx0cXVpY2tDaGF0SGVhZGVyTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbmV3Q2hhdEhlYWRlcicsIFwiTmV3IENoYXRcIik7XG5cdFx0XHRjb25zdCBxdWlja0NoYXRXaXRoTGFiZWwgPSBkb20uYXBwZW5kKHF1aWNrQ2hhdEhlYWRlclJvdywgZG9tLiQoJy5zZXNzaW9uLXdvcmtzcGFjZS1waWNrZXItbGFiZWwuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyLXdpdGgtbGFiZWwnKSk7XG5cdFx0XHRxdWlja0NoYXRXaXRoTGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnbmV3U2Vzc2lvbldpdGgnLCBcIndpdGhcIik7XG5cdFx0XHR0aGlzLl9xdWlja0NoYXRIZWFkZXJQaWNrZXJIb3N0ID0gZG9tLmFwcGVuZChxdWlja0NoYXRIZWFkZXJSb3csIGRvbS4kKCcubmV3LWNoYXQtcXVpY2stY2hhdC1oZWFkZXItcGlja2VyLWhvc3QnKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVyRmVlZGJhY2tCYW5uZXIoY2hhdFdpZGdldENvbnRlbnQpO1xuXHRcdHRoaXMuX2NoYXRUaXBDb250YWluZXIgPSBkb20uYXBwZW5kKGNoYXRXaWRnZXRDb250ZW50LCBkb20uJCgnLmNoYXQtZ2V0dGluZy1zdGFydGVkLXRpcC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fcmVuZGVyQ2hhdFRpcCgpO1xuXHRcdHRoaXMuX25ld0NoYXRJbnB1dC5yZW5kZXIoY2hhdFdpZGdldENvbnRlbnQsIHBhcmVudCk7XG5cblx0XHQvLyBRdWljayBjaGF0IGNvbXBvc2VyOiBoaWRlIHRoZSB3b3Jrc3BhY2UgcGlja2VyIGZvciB3b3Jrc3BhY2UtbGVzc1xuXHRcdC8vIGRyYWZ0cyAodGhlcmUgaXMgbm90aGluZyB0byBwaWNrKSBhbmQgcmVmbGVjdCBpdCBpbiB0aGUgcGlja2VyLXZpc2libGVcblx0XHQvLyBjb250ZXh0IGtleS4gUXVpY2sgY2hhdHMgYXJlIG9ubHkgY3JlYXRlZCBvbiBkZXNrdG9wICh0aGUgbG9jYWwgYWdlbnRcblx0XHQvLyBob3N0KSwgc28gbGVhdmUgdGhlIHdlYiBlbXB0eS1zdGF0ZSBnYXRlJ3Mga2V5IG1hbmFnZW1lbnQgdW50b3VjaGVkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gdGhpcy5faXNRdWlja0NoYXRDb21wb3Nlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRjaGF0V2lkZ2V0Q29udGVudC5jbGFzc0xpc3QudG9nZ2xlKCdxdWljay1jaGF0JywgaXNRdWlja0NoYXQpO1xuXHRcdFx0aWYgKCFpc1dlYikge1xuXHRcdFx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXJWaXNpYmxlS2V5LnNldCghaXNRdWlja0NoYXQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIERlc2t0b3AgaGFybmVzcy1waWNrZXIgcGxhY2VtZW50OiBhIHF1aWNrIGNoYXQgcmVuZGVycyB0aGUgc2Vzc2lvbi10eXBlXG5cdFx0Ly8gcGlja2VyIGluIGl0cyB0b3Atb2YtaW5wdXQgaGVhZGVyIHJvdzsgb3RoZXJ3aXNlIChpbmNsdWRpbmcgYWZ0ZXIgYVxuXHRcdC8vIENtZCtOIHN3YXAgb3V0IG9mIGEgcXVpY2sgY2hhdCkgaXQgcmUtcGFyZW50cyBpbnRvIHRoZSB3b3Jrc3BhY2Ugcm93LlxuXHRcdGlmICghaXNXZWIgJiYgIXRoaXMuX3JlbmRlckhhcm5lc3NQaWNrZXJJbkNvbnRyb2xzKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gdGhpcy5faXNRdWlja0NoYXRDb21wb3Nlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGlzUXVpY2tDaGF0ID8gdGhpcy5fcXVpY2tDaGF0SGVhZGVyUGlja2VySG9zdCA6IHRoaXMuX3dvcmtzcGFjZVBpY2tlclJvdztcblx0XHRcdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0XHRcdHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5yZW5kZXIodGFyZ2V0LCB7IGNsYXNzTmFtZTogJ3Nlc3Npb25zLWNoYXQtc2Vzc2lvbi10eXBlLXBpY2tlcicgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgaW5pdGlhbCBzZXNzaW9uIGZvciBhbnkgd29ya3NwYWNlIGFscmVhZHkgc2VsZWN0ZWQgYXQgY29uc3RydWN0IHRpbWUuXG5cdFx0Ly8gSWYgdGhlIHNlbGVjdGlvbiBhcnJpdmVzIGxhdGVyIChwcm92aWRlciByZWdpc3RlcnMgYXN5bmNocm9ub3VzbHkpLCB0aGVcblx0XHQvLyBwaWNrZXIgZmlyZXMgb25EaWRTZWxlY3RXb3Jrc3BhY2UgYW5kIG91ciBsaXN0ZW5lciBoYW5kbGVzIGl0LlxuXHRcdC8vIFNraXAgaWYgYW4gYWN0aXZlIHNlc3Npb24gYWxyZWFkeSBleGlzdHMgKHJlc3RvcmVkIGJ5IG9wZW5OZXdTZXNzaW9uXG5cdFx0Ly8gZnJvbSBhIG5ldy1zZXNzaW9uIGRyYWZ0IHdoZW4gbmF2aWdhdGluZyBiYWNrIGZyb20gYW5vdGhlciBzZXNzaW9uKS5cblx0XHR0aGlzLl9zZWVkV29ya3NwYWNlRHJhZnQoKTtcblxuXHRcdC8vIFJlLXNlZWQgdGhlIHdvcmtzcGFjZSBkcmFmdCB3aGVuIHRoZSBjb21wb3NlciBzd2FwcyBvdXQgb2YgcXVpY2stY2hhdFxuXHRcdC8vIG1vZGUgKGUuZy4gQ21kK04gZGlzY2FyZHMgYSBxdWljayBjaGF0LCBsZWF2aW5nIHRoZSByZXVzZWQgY29tcG9zZXJcblx0XHQvLyBzZXNzaW9uLWxlc3MpOiB3aXRob3V0IGFuIGFjdGl2ZSBzZXNzaW9uIHRoZSBzZXNzaW9uLXR5cGUgcGlja2VyIGhhcyBub1xuXHRcdC8vIGZvbGRlciB0eXBlcyBhbmQgaGlkZXMgaXRzZWxmLCBzbyByZXN0b3JlIHRoZSBsYXN0IGZvbGRlciB0byBtYXRjaCBhXG5cdFx0Ly8gZnJlc2hseS1vcGVuZWQgbmV3LXNlc3Npb24gY29tcG9zZXIuXG5cdFx0aWYgKCFpc1dlYikge1xuXHRcdFx0bGV0IHdhc1F1aWNrQ2hhdCA9IHRoaXMuX2lzUXVpY2tDaGF0Q29tcG9zZXIuZ2V0KCk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzUXVpY2tDaGF0ID0gdGhpcy5faXNRdWlja0NoYXRDb21wb3Nlci5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGlmICh3YXNRdWlja0NoYXQgJiYgIWlzUXVpY2tDaGF0ICYmICF0aGlzLl9zZXNzaW9uLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NlZWRXb3Jrc3BhY2VEcmFmdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdhc1F1aWNrQ2hhdCA9IGlzUXVpY2tDaGF0O1xuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdGNoYXRXaWRnZXRDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncmV2ZWFsZWQnKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckNoYXRUaXAoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jaGF0VGlwQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzSW5wdXRPbmJvYXJkaW5nVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLl9jbGVhckNoYXRUaXAoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRG9uJ3Qgc2hvdyBhIHRpcCBpbiB0aGUgbm8tYWdlbnQtaG9zdCBlbXB0eSBzdGF0ZSBcdTIwMTQgdGhlcmUgaXMgbm8gdXNhYmxlIGNvbXBvc2VyLlxuXHRcdGlmICh0aGlzLl9jaGF0VGlwQ29udGFpbmVyLnBhcmVudEVsZW1lbnQ/LmNsYXNzTGlzdC5jb250YWlucygnbm8tYWdlbnQtaG9zdCcpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxudW1iZXI+KENoYXRDb250ZXh0S2V5cy5mb3JlZ3JvdW5kU2Vzc2lvbkNvdW50LmtleSkgIT09IDApIHtcblx0XHRcdHRoaXMuX2lzQ2hhdFRpcFNlc3Npb25Jbml0aWFsaXplZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fY2xlYXJDaGF0VGlwKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5faXNDaGF0VGlwU2Vzc2lvbkluaXRpYWxpemVkKSB7XG5cdFx0XHR0aGlzLl9pc0NoYXRUaXBTZXNzaW9uSW5pdGlhbGl6ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5jaGF0VGlwU2VydmljZS5yZXNldFNlc3Npb24oKTtcblx0XHR9XG5cblx0XHRjb25zdCB0aXAgPSB0aGlzLmNoYXRUaXBTZXJ2aWNlLmdldFdlbGNvbWVUaXAodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKCF0aXApIHtcblx0XHRcdHRoaXMuX2NsZWFyQ2hhdFRpcCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2hhdFRpcFBhcnQudmFsdWUpIHtcblx0XHRcdGRvbS5zZXRWaXNpYmlsaXR5KHRydWUsIHRoaXMuX2NoYXRUaXBDb250YWluZXIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdGNvbnN0IHRpcFBhcnQgPSBzdG9yZS5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGlwQ29udGVudFBhcnQsIHRpcCwgcmVuZGVyZXIpKTtcblx0XHRzdG9yZS5hZGQodGlwUGFydC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2xlYXJDaGF0VGlwKCk7XG5cdFx0XHQvLyBSZXN0b3JlIGZvY3VzIHRvIHRoZSBpbnB1dCBhZnRlciB0aGUgdGlwIERPTSBpcyByZW1vdmVkIHNvIGtleWJvYXJkXG5cdFx0XHQvLyBmb2N1cyBpcyBub3Qgc3RyYW5kZWQgb24gPGJvZHk+IChtYXRjaGVzIENoYXRXaWRnZXQgYmVoYXZpb3VyKS5cblx0XHRcdHRoaXMuZm9jdXNJbnB1dCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9jaGF0VGlwUGFydC52YWx1ZSA9IHN0b3JlO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY2hhdFRpcENvbnRhaW5lcik7XG5cdFx0dGhpcy5fY2hhdFRpcENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aXBQYXJ0LmRvbU5vZGUpO1xuXHRcdGRvbS5zZXRWaXNpYmlsaXR5KHRydWUsIHRoaXMuX2NoYXRUaXBDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJDaGF0VGlwKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRUaXBQYXJ0LmNsZWFyKCk7XG5cdFx0aWYgKHRoaXMuX2NoYXRUaXBDb250YWluZXIpIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5fY2hhdFRpcENvbnRhaW5lcik7XG5cdFx0XHRkb20uc2V0VmlzaWJpbGl0eShmYWxzZSwgdGhpcy5fY2hhdFRpcENvbnRhaW5lcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpc0lucHV0T25ib2FyZGluZ1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzSW5wdXRPbmJvYXJkaW5nVmlzaWJsZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0SW5wdXRPbmJvYXJkaW5nVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNJbnB1dE9uYm9hcmRpbmdWaXNpYmxlID0gdmlzaWJsZTtcblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fY2xlYXJDaGF0VGlwKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlbmRlckNoYXRUaXAoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VlZCB0aGUgbmV3LXNlc3Npb24gZHJhZnQgZnJvbSB0aGUgd29ya3NwYWNlIHBpY2tlcidzIHJlc3RvcmVkIGZvbGRlcixcblx0ICogdW5sZXNzIGFuIGFjdGl2ZSBzZXNzaW9uIGFscmVhZHkgZXhpc3RzICh0aGVuIGp1c3Qgc3luYyB0aGUgcGlja2VyIHRvIGl0KS5cblx0ICovXG5cdHByaXZhdGUgX3NlZWRXb3Jrc3BhY2VEcmFmdCgpOiB2b2lkIHtcblx0XHRjb25zdCByZXN0b3JlZEZvbGRlclVyaSA9IHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZEZvbGRlclVyaTtcblx0XHRpZiAoIXRoaXMuX3N5bmNXb3Jrc3BhY2VQaWNrZXJGcm9tQWN0aXZlU2Vzc2lvbigpICYmIHJlc3RvcmVkRm9sZGVyVXJpKSB7XG5cdFx0XHR2b2lkIHRoaXMuX2NyZWF0ZU5ld1Nlc3Npb24ocmVzdG9yZWRGb2xkZXJVcmkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJZiBhIG5ldy1zZXNzaW9uIGRyYWZ0IHdhcyByZXN0b3JlZCBieSB7QGxpbmsgb3Blbk5ld1Nlc3Npb259LCBzeW5jXG5cdCAqIHRoZSB3b3Jrc3BhY2UgcGlja2VyIHRvIG1hdGNoIHRoZSBzZXNzaW9uJ3Mgd29ya3NwYWNlLiBUaGUgcGlja2VyIG1heVxuXHQgKiBoYXZlIHJlc3RvcmVkIGEgd29ya3NwYWNlIGZyb20gYSBkaWZmZXJlbnQgcHJvdmlkZXIgKGUuZy4gcmVtb3RlIHZzXG5cdCAqIGxvY2FsKSwgc28gb3ZlcndyaXRlIGl0IHdpdGggdGhlIHNlc3Npb24ncyBhY3R1YWwgd29ya3NwYWNlIHdpdGhvdXRcblx0ICogZmlyaW5nIHRoZSBldmVudCAod2hpY2ggd291bGQgdHJpZ2dlciB7QGxpbmsgX29uV29ya3NwYWNlU2VsZWN0ZWR9IGFuZFxuXHQgKiBjcmVhdGUgYSBuZXcgc2Vzc2lvbikuXG5cdCAqXG5cdCAqIEByZXR1cm5zIGB0cnVlYCBpZiBhbiBhY3RpdmUgc2Vzc2lvbiB3YXMgZm91bmQgYW5kIHRoZSBwaWNrZXIgd2FzIHN5bmNlZC5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNXb3Jrc3BhY2VQaWNrZXJGcm9tQWN0aXZlU2Vzc2lvbigpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIWFjdGl2ZVNlc3Npb24pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uV29ya3NwYWNlID0gYWN0aXZlU2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gc2Vzc2lvbldvcmtzcGFjZT8uZm9sZGVyc1swXT8ucm9vdDtcblx0XHRpZiAoZm9sZGVyVXJpKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2V0U2VsZWN0ZWRXb3Jrc3BhY2UoZm9sZGVyVXJpLCB7IGZpcmVFdmVudDogZmFsc2UgfSk7XG5cdFx0XHR0aGlzLl9yZXBsYWNlRHJhZnRPblVuc2VydmFibGVIYXJuZXNzKGZvbGRlclVyaSwgYWN0aXZlU2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGFjZXMgYSByZXN0b3JlZCBkcmFmdCB3aG9zZSBoYXJuZXNzIHRoZSBmb2xkZXIgY2FuIG5vIGxvbmdlciBzZXJ2ZS5cblx0ICogQSBkcmFmdCBvdXRsaXZlcyBuYXZpZ2F0aW9uLCBzbyBpdCBjYW4gbmFtZSBhIHNlc3Npb24gdHlwZSB0aGF0IGhhcyBzaW5jZVxuXHQgKiBzdG9wcGVkIGJlaW5nIGFkdmVydGlzZWQgXHUyMDE0IGUuZy4gdGhlIGV4dGVuc2lvbi1ob3N0IENvcGlsb3QgQ0xJIG9uY2Vcblx0ICogYGNoYXQuYWdlbnRzLmNvcGlsb3RDbGkuaGlkZUV4dGVuc2lvbkhvc3RgIGlzIG9uLiBLZWVwaW5nIGl0IHdvdWxkIGxlYXZlXG5cdCAqIHRoZSBjb21wb3NlciBzaG93aW5nLCBhbmQgc2VuZGluZyB0bywgYW4gYWdlbnQgdGhlIGhhcm5lc3MgcGlja2VyIGRvZXNuJ3Rcblx0ICogbGlzdC4gQW4gZW1wdHkgdHlwZSBsaXN0IG1lYW5zIHRoZSBmb2xkZXIncyBwcm92aWRlcnMgaGF2ZW4ndCByZXBvcnRlZCB5ZXRcblx0ICogKGEgbGF0ZS1jb25uZWN0aW5nIGFnZW50IGhvc3QpLCBzbyB0aGUgZHJhZnQgaXMgbGVmdCBhbG9uZS5cblx0ICovXG5cdHByaXZhdGUgX3JlcGxhY2VEcmFmdE9uVW5zZXJ2YWJsZUhhcm5lc3MoZm9sZGVyVXJpOiBVUkksIGRyYWZ0OiBJQWN0aXZlU2Vzc2lvbik6IHZvaWQge1xuXHRcdGlmIChkcmFmdC5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGljayA9IHsgcHJvdmlkZXJJZDogZHJhZnQucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogZHJhZnQuc2Vzc2lvblR5cGUgfTtcblx0XHRpZiAodGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmkpLmxlbmd0aCA9PT0gMCB8fCB0aGlzLl9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaSwgcGljaykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLl9jcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaTogVVJJLCBwaWNrOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmkpLnNvbWUodCA9PlxuXHRcdFx0KHBpY2sucHJvdmlkZXJJZCA9PT0gdW5kZWZpbmVkIHx8IHQucHJvdmlkZXJJZCA9PT0gcGljay5wcm92aWRlcklkKVxuXHRcdFx0JiYgdC5zZXNzaW9uVHlwZS5pZCA9PT0gcGljay5zZXNzaW9uVHlwZUlkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZU5ld1Nlc3Npb24oZm9sZGVyVXJpOiBVUkkpOiBQcm9taXNlPElPcGVuTmV3U2Vzc2lvblJlc3VsdD4ge1xuXHRcdHRoaXMuX3BlbmRpbmdQcmVmZXJyZWRVcGdyYWRlLmNsZWFyKCk7XG5cdFx0Y29uc3QgY3JlYXRpb25DdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBjcmVhdGlvbkxpZmVjeWNsZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiBjcmVhdGlvbkN0cy5kaXNwb3NlKHRydWUpKTtcblx0XHR0aGlzLl9uZXdTZXNzaW9uQ3JlYXRpb24udmFsdWUgPSBjcmVhdGlvbkxpZmVjeWNsZTtcblx0XHRjb25zdCB1c2VyUGljayA9IHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5nZXRVc2VyUGlja2VkU2Vzc2lvblR5cGUoKTtcblx0XHQvLyBTZXNzaW9uIGNyZWF0aW9uIGlzIGFzeW5jLCBzbyBhIHByb3ZpZGVyIGNhbiBzdGFydCBzZXJ2aW5nIHRoZSBmb2xkZXJcblx0XHQvLyAoZS5nLiB0aGUgbG9jYWwgYWdlbnQgaG9zdCBmaW5pc2hpbmcgaXRzIGhhbmRzaGFrZSkgYmV0d2VlbiB0aGUgY2FsbFxuXHRcdC8vIGJlbG93IGFuZCB0aGUgbGlzdGVuZXIgaW5zdGFsbGVkIGFmdGVyIGl0LiBUaGF0IGNoYW5nZSB3b3VsZCBsYW5kIGluXG5cdFx0Ly8gdGhlIGdhcCBhbmQgYmUgbG9zdCwgbGVhdmluZyB0aGUgY29tcG9zZXIgd2l0aG91dCBhIGRyYWZ0IFx1MjAxNCBhbmQgd2l0aFxuXHRcdC8vIHRoZSBoYXJuZXNzIHBpY2tlciBoaWRkZW4gXHUyMDE0IHVudGlsIHRoZSB1c2VyIHJlLXBpY2tzIHRoZSB3b3Jrc3BhY2UuXG5cdFx0Ly8gUmVjb3JkIGl0IGhlcmUgc28gdGhlIGxpc3RlbmVyIGNhbiByZXBsYXkgaXQuXG5cdFx0Y29uc3QgcGVuZGluZ0NoYW5nZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRsZXQgY2hhbmdlZFdoaWxlUGVuZGluZyA9IGZhbHNlO1xuXHRcdHBlbmRpbmdDaGFuZ2UuYWRkKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiBjaGFuZ2VkV2hpbGVQZW5kaW5nID0gdHJ1ZSkpO1xuXHRcdGxldCByZXN1bHQ6IElPcGVuTmV3U2Vzc2lvblJlc3VsdDtcblx0XHR0cnkge1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fY3JlYXRlU2Vzc2lvbk5vdyhmb2xkZXJVcmksIHVzZXJQaWNrLCBjcmVhdGlvbkN0cy50b2tlbik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHBlbmRpbmdDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHRjb25zdCBpc0N1cnJlbnRDcmVhdGlvbiA9IHRoaXMuX25ld1Nlc3Npb25DcmVhdGlvbi52YWx1ZSA9PT0gY3JlYXRpb25MaWZlY3ljbGU7XG5cdFx0aWYgKGlzQ3VycmVudENyZWF0aW9uKSB7XG5cdFx0XHR0aGlzLl9uZXdTZXNzaW9uQ3JlYXRpb24uY2xlYXIoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC50cnVzdERlY2xpbmVkKSB7XG5cdFx0XHQvLyBUaGUgdXNlciBleHBsaWNpdGx5IGRlY2xpbmVkIHRydXN0OiBkb24ndCBzY2hlZHVsZSBhIHJldHJ5LCB3aGljaFxuXHRcdFx0Ly8gd291bGQgc2lsZW50bHkgcmVjcmVhdGUgKGFuZCBwb3NzaWJseSByZS1wcm9tcHQpIHRoZSBkcmFmdCBvbmNlIGFcblx0XHRcdC8vIHByb3ZpZGVyIHJlZ2lzdGVycy9jaGFuZ2VzIHdpdGhvdXQgYW55IGZ1cnRoZXIgdXNlciBhY3Rpb24uXG5cdFx0XHR0aGlzLl9wZW5kaW5nUHJlZmVycmVkVXBncmFkZS5jbGVhcigpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Ly8gS2VlcCB0aGUgZHJhZnQgaW4gc3luYyB3aXRoIGxhdGUtcmVnaXN0ZXJpbmcgcHJvdmlkZXJzLiBBZ2VudCBob3N0c1xuXHRcdC8vIGNvbm5lY3QgbGF6aWx5LCBzbyB0aGVyZSBpcyBubyB0aW1lb3V0IFx1MjAxNCB0aGUgbGlzdGVuZXIgbGl2ZXMgdW50aWwgdGhlXG5cdFx0Ly8gZHJhZnQgaXMgc2VudCBvciByZXBsYWNlZC4gV2Ugd2F0Y2ggd2hlbjpcblx0XHQvLyAgLSBubyBwcm92aWRlciBjYW4gc2VydmUgdGhlIGZvbGRlciB5ZXQgKCFyZXN1bHQuc2Vzc2lvbiksXG5cdFx0Ly8gIC0gdGhlIHVzZXIncyBleHBsaWNpdCBwaWNrIGlzbid0IHNlcnZhYmxlIHlldCAoY3JlYXRlZCB3aXRoIGFcblx0XHQvLyAgICBmYWxsYmFjaywgdXBncmFkZSBvbmNlIGl0cyBwcm92aWRlciBjb25uZWN0cyksIG9yXG5cdFx0Ly8gIC0gdGhlcmUgaXMgbm8gZXhwbGljaXQgcGljaywgc28gdGhlIGRyYWZ0IHRyYWNrcyB0aGUgcHJlZmVycmVkXG5cdFx0Ly8gICAgKGZpcnN0KSB0eXBlLCB3aGljaCBjYW4gY2hhbmdlIGFzIHRoZSBmb2xkZXIncyBzZXNzaW9uLXR5cGUgbGlzdFxuXHRcdC8vICAgIGdyb3dzLlxuXHRcdGlmICghcmVzdWx0LnNlc3Npb24gfHwgIXVzZXJQaWNrIHx8ICF0aGlzLl9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaSwgdXNlclBpY2spKSB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVJlY3JlYXRlT25Qcm92aWRlckNoYW5nZShmb2xkZXJVcmksIHVzZXJQaWNrLCByZXN1bHQuc2Vzc2lvbiwgY2hhbmdlZFdoaWxlUGVuZGluZyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVTZXNzaW9uTm93KGZvbGRlclVyaTogVVJJLCB1c2VyUGljazogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElPcGVuTmV3U2Vzc2lvblJlc3VsdD4ge1xuXHRcdC8vIFByZWZlciB0aGUgdXNlcidzIGV4cGxpY2l0IHBpY2sgd2hlbiBpdHMgcHJvdmlkZXIgY2FuIHNlcnZlIHRoZVxuXHRcdC8vIGZvbGRlcjsgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byB0aGUgcHJlZmVycmVkIChmaXJzdCkgc2Vzc2lvbiB0eXBlLlxuXHRcdGNvbnN0IGVmZmVjdGl2ZVBpY2sgPSB1c2VyUGljayAmJiB0aGlzLl9pc1ByZWZlcnJlZFNlcnZhYmxlKGZvbGRlclVyaSwgdXNlclBpY2spXG5cdFx0XHQ/IHVzZXJQaWNrXG5cdFx0XHQ6IHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5nZXRQcmVmZXJyZWRTZXNzaW9uVHlwZShmb2xkZXJVcmkpO1xuXHRcdGNvbnN0IGZhbGxiYWNrUHJvdmlkZXJJZCA9IHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZWxlY3RlZFJlc29sdmVkPy5wcm92aWRlcklkO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5zZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb24oe1xuXHRcdFx0XHRmb2xkZXJVcmksXG5cdFx0XHRcdC4uLihlZmZlY3RpdmVQaWNrXG5cdFx0XHRcdFx0PyB7IHByb3ZpZGVySWQ6IGVmZmVjdGl2ZVBpY2sucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogZWZmZWN0aXZlUGljay5zZXNzaW9uVHlwZUlkIH1cblx0XHRcdFx0XHQ6IGZhbGxiYWNrUHJvdmlkZXJJZFxuXHRcdFx0XHRcdFx0PyB7IHByb3ZpZGVySWQ6IGZhbGxiYWNrUHJvdmlkZXJJZCB9XG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCksXG5cdFx0XHR9LCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIG5ldyBzZXNzaW9uOicsIGUpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogdW5kZWZpbmVkLCB0cnVzdERlY2xpbmVkOiBmYWxzZSB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlUmVjcmVhdGVPblByb3ZpZGVyQ2hhbmdlKGZvbGRlclVyaTogVVJJLCB1c2VyUGljazogSVByZWZlcnJlZFNlc3Npb25UeXBlIHwgdW5kZWZpbmVkLCBjcmVhdGVkOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCwgcmVwbGF5TWlzc2VkQ2hhbmdlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiB0aGlzLl9yZWNyZWF0ZU9uUHJvdmlkZXJDaGFuZ2UoZm9sZGVyVXJpLCB1c2VyUGljaywgY3JlYXRlZCkpKTtcblx0XHR0aGlzLl9wZW5kaW5nUHJlZmVycmVkVXBncmFkZS52YWx1ZSA9IHN0b3JlO1xuXHRcdGlmIChyZXBsYXlNaXNzZWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX3JlY3JlYXRlT25Qcm92aWRlckNoYW5nZShmb2xkZXJVcmksIHVzZXJQaWNrLCBjcmVhdGVkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNyZWF0ZU9uUHJvdmlkZXJDaGFuZ2UoZm9sZGVyVXJpOiBVUkksIHVzZXJQaWNrOiBJUHJlZmVycmVkU2Vzc2lvblR5cGUgfCB1bmRlZmluZWQsIGNyZWF0ZWQ6IElTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKGNyZWF0ZWQpIHtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMuX3Nlc3Npb24uZ2V0KCk7XG5cdFx0XHRpZiAoYWN0aXZlPy5zZXNzaW9uSWQgIT09IGNyZWF0ZWQuc2Vzc2lvbklkIHx8IGFjdGl2ZS5pc0NyZWF0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyB0aGUgZHJhZnQgd2FzIHNlbnQgb3IgaXMgbm8gbG9uZ2VyIHRoZSBhY3RpdmUgc2Vzc2lvblxuXHRcdFx0fVxuXHRcdFx0aWYgKHVzZXJQaWNrKSB7XG5cdFx0XHRcdGlmICghdGhpcy5faXNQcmVmZXJyZWRTZXJ2YWJsZShmb2xkZXJVcmksIHVzZXJQaWNrKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gdGhlIHByZWZlcnJlZCBwcm92aWRlciBzdGlsbCBjYW5ub3Qgc2VydmUgdGhlIGZvbGRlclxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBObyBleHBsaWNpdCBwaWNrOiBrZWVwIHRoZSBkcmFmdCBvbiB0aGUgcHJlZmVycmVkIChmaXJzdClcblx0XHRcdFx0Ly8gdHlwZS4gUmVjcmVhdGUgb25seSB3aGVuIHRoYXQgcHJlZmVycmVkIGFjdHVhbGx5IGNoYW5nZWQuXG5cdFx0XHRcdGNvbnN0IHByZWZlcnJlZCA9IHRoaXMuX25ld0NoYXRJbnB1dC5zZXNzaW9uVHlwZVBpY2tlci5nZXRQcmVmZXJyZWRTZXNzaW9uVHlwZShmb2xkZXJVcmkpO1xuXHRcdFx0XHRpZiAoIXByZWZlcnJlZCB8fCAocHJlZmVycmVkLnByb3ZpZGVySWQgPT09IGFjdGl2ZS5wcm92aWRlcklkICYmIHByZWZlcnJlZC5zZXNzaW9uVHlwZUlkID09PSBhY3RpdmUuc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHZvaWQgdGhpcy5fY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHdvcmtzcGFjZSBVUkkgZm9yIHRoZSBjb250ZXh0IHBpY2tlciBiYXNlZCBvbiB0aGUgY3VycmVudCB3b3Jrc3BhY2Ugc2VsZWN0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0Q29udGV4dEZvbGRlclVyaSgpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJXb3Jrc3BhY2VQaWNrZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXJWaXNpYmxlS2V5LnNldCh0cnVlKTtcblx0XHRjb25zdCBwaWNrZXJzUm93ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyJykpO1xuXHRcdGNvbnN0IHBpY2tlcnNMYWJlbCA9IGRvbS5hcHBlbmQocGlja2Vyc1JvdywgZG9tLiQoJy5zZXNzaW9uLXdvcmtzcGFjZS1waWNrZXItbGFiZWwnKSk7XG5cdFx0cGlja2Vyc0xhYmVsLnRleHRDb250ZW50ID0gdGhpcy5fd29ya3NwYWNlUGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpXG5cdFx0XHQ/IGxvY2FsaXplKCduZXdTZXNzaW9uSW4nLCBcIk5ldyBzZXNzaW9uIGluXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCduZXdTZXNzaW9uQ2hvb3NlV29ya3NwYWNlJywgXCJTdGFydCBieSBwaWNraW5nIGFcIik7XG5cblx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXIucmVuZGVyKHBpY2tlcnNSb3cpO1xuXG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJIYXJuZXNzUGlja2VySW5Db250cm9scykge1xuXHRcdFx0Y29uc3Qgd2l0aExhYmVsID0gZG9tLmFwcGVuZChwaWNrZXJzUm93LCBkb20uJCgnLnNlc3Npb24td29ya3NwYWNlLXBpY2tlci1sYWJlbC5zZXNzaW9uLXdvcmtzcGFjZS1waWNrZXItd2l0aC1sYWJlbCcpKTtcblx0XHRcdHdpdGhMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCduZXdTZXNzaW9uV2l0aCcsIFwid2l0aFwiKTtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlclJvdyA9IHBpY2tlcnNSb3c7XG5cdFx0XHQvLyBPbiB3ZWIgdGhlIGNvbXBvc2VyIGlzIG5ldmVyIGEgcXVpY2sgY2hhdCwgc28ga2VlcCB0aGUgaGFybmVzc1xuXHRcdFx0Ly8gcGlja2VyIGlubGluZSBpbiB0aGUgd29ya3NwYWNlIHJvdy4gT24gZGVza3RvcCB0aGUgcGxhY2VtZW50IGlzXG5cdFx0XHQvLyByZWFjdGl2ZSAoY29udHJvbHMgcm93IGZvciBxdWljayBjaGF0cykgXHUyMDE0IHNlZSB0aGUgcmVuZGVyKCkgYXV0b3J1bi5cblx0XHRcdGlmIChpc1dlYikge1xuXHRcdFx0XHR0aGlzLl9uZXdDaGF0SW5wdXQuc2Vzc2lvblR5cGVQaWNrZXIucmVuZGVyKHBpY2tlcnNSb3csIHsgY2xhc3NOYW1lOiAnc2Vzc2lvbnMtY2hhdC1zZXNzaW9uLXR5cGUtcGlja2VyJyB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dvcmtzcGFjZVBpY2tlci5vbkRpZFNlbGVjdFdvcmtzcGFjZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBmb2xkZXJVcmkgPSB0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk7XG5cdFx0XHRwaWNrZXJzTGFiZWwudGV4dENvbnRlbnQgPSBmb2xkZXJVcmlcblx0XHRcdFx0PyBsb2NhbGl6ZSgnbmV3U2Vzc2lvbkluJywgXCJOZXcgc2Vzc2lvbiBpblwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCduZXdTZXNzaW9uQ2hvb3NlV29ya3NwYWNlJywgXCJTdGFydCBieSBwaWNraW5nIGFcIik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJFbXB0eVN0YXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fd29ya3NwYWNlUGlja2VyVmlzaWJsZUtleS5zZXQoZmFsc2UpO1xuXHRcdGNvbnN0IGVtcHR5U3RhdGUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vQWdlbnRIb3N0RW1wdHlTdGF0ZSk7XG5cdFx0ZW1wdHlTdGF0ZS5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0aGlzLl9hY3RpdmVFbXB0eVN0YXRlID0gZW1wdHlTdGF0ZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlRW1wdHlTdGF0ZSA9PT0gZW1wdHlTdGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZUVtcHR5U3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZW1wdHlTdGF0ZS5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogV2ViLW9ubHk6IGhvc3RzIHRoZSB3b3Jrc3BhY2UgcGlja2VyLCBidXQgc3dhcHMgaXQgb3V0IGZvciB0aGVcblx0ICogbm8tYWdlbnQtaG9zdCBlbXB0eSBzdGF0ZSBvbmNlIHdlIGFyZSAqc3VyZSogdGhlcmUgYXJlIG5vIGhvc3RzIFx1MjAxNFxuXHQgKiBpLmUuIGFmdGVyIGEgZGlzY292ZXJ5IGN5Y2xlIGhhcyBjb21wbGV0ZWQuIFJlbmRlcmluZyB0aGUgZW1wdHlcblx0ICogc3RhdGUgYmVmb3JlIGRpc2NvdmVyeSBoYXMgcnVuIHdvdWxkIGJyaWVmbHkgZmxhc2ggaXQgYXQgdXNlcnMgd2hvXG5cdCAqIGFjdHVhbGx5IGhhdmUgaG9zdHMgdGhhdCBqdXN0IGhhdmVuJ3QgYmVlbiBkaXNjb3ZlcmVkIHlldCAoZS5nLlxuXHQgKiBjYWNoZWQgdHVubmVscyByZXNvbHZlZCBvbiBzdGFydHVwKS4gVW50aWwgdGhlbiB3ZSBrZWVwIHRoZSByZWd1bGFyXG5cdCAqIHdvcmtzcGFjZSBwaWNrZXIsIHdoaWNoIGhhcyBpdHMgb3duIGxvYWRpbmcgYWZmb3JkYW5jZS5cblx0ICovXG5cdHByaXZhdGUgX3JlbmRlckVtcHR5U3RhdGVHYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGNoYXRXaWRnZXRDb250ZW50OiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrZXJTbG90ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbi13b3Jrc3BhY2UtcGlja2VyLXNsb3QnKSk7XG5cdFx0Y29uc3Qgc3RhdGVEaXNwb3NhYmxlcyA9IHN0b3JlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0XHRjb25zdCBzaG93UGlja2VyID0gKCkgPT4ge1xuXHRcdFx0Y2hhdFdpZGdldENvbnRlbnQuY2xhc3NMaXN0LnJlbW92ZSgnbm8tYWdlbnQtaG9zdCcpO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZShwaWNrZXJTbG90KTtcblx0XHRcdHN0YXRlRGlzcG9zYWJsZXMudmFsdWUgPSB0aGlzLl9yZW5kZXJXb3Jrc3BhY2VQaWNrZXIocGlja2VyU2xvdCk7XG5cdFx0XHR0aGlzLl9yZW5kZXJDaGF0VGlwKCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNob3dFbXB0eVN0YXRlID0gKCkgPT4ge1xuXHRcdFx0Y2hhdFdpZGdldENvbnRlbnQuY2xhc3NMaXN0LmFkZCgnbm8tYWdlbnQtaG9zdCcpO1xuXHRcdFx0ZG9tLmNsZWFyTm9kZShwaWNrZXJTbG90KTtcblx0XHRcdHN0YXRlRGlzcG9zYWJsZXMudmFsdWUgPSB0aGlzLl9yZW5kZXJFbXB0eVN0YXRlKHBpY2tlclNsb3QpO1xuXHRcdFx0dGhpcy5fY2xlYXJDaGF0VGlwKCk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZpbHRlciA9IHRoaXMuYWdlbnRIb3N0RmlsdGVyU2VydmljZTtcblx0XHRsZXQgaGFzQ29tcGxldGVkRGlzY292ZXJ5ID0gZmlsdGVyLmhvc3RzLmxlbmd0aCA+IDA7XG5cblx0XHQvLyBJZiBubyBkaXNjb3ZlcnkgY3ljbGUgaXMgaW4gZmxpZ2h0IG9yIGhhcyBjb21wbGV0ZWQgeWV0LCBraWNrIG9uZVxuXHRcdC8vIG9mZiBzbyB0aGUgZW1wdHkgc3RhdGUgY2FuIHJlc29sdmUgaW4gYSBib3VuZGVkIHRpbWUuIFRoZVxuXHRcdC8vIGB0dW5uZWxBZ2VudEhvc3QuY29udHJpYnV0aW9uYCBhbHJlYWR5IHRyaWdnZXJzIGEgc3RhcnR1cFxuXHRcdC8vIHJlZGlzY292ZXIsIGJ1dCBpbiB0aGUgKHJhcmUpIGNhc2UgdGhlIHZpZXcgbW91bnRzIGJlZm9yZSB0aGVcblx0XHQvLyBjb250cmlidXRpb24gZ2V0cyBhIGNoYW5jZSwgdGhpcyBwcmV2ZW50cyB0aGUgdXNlciBmcm9tIGJlaW5nXG5cdFx0Ly8gc3R1Y2sgb24gYSBwaWNrZXIgdGhhdCBuZXZlciBnZXRzIHBvcHVsYXRlZC5cblx0XHRpZiAoIWhhc0NvbXBsZXRlZERpc2NvdmVyeSAmJiAhZmlsdGVyLmlzRGlzY292ZXJpbmcpIHtcblx0XHRcdGZpbHRlci5yZWRpc2NvdmVyKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXBkYXRlID0gKCkgPT4ge1xuXHRcdFx0aWYgKGhhc0NvbXBsZXRlZERpc2NvdmVyeSAmJiAhZmlsdGVyLmlzRGlzY292ZXJpbmcgJiYgZmlsdGVyLmhvc3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRzaG93RW1wdHlTdGF0ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2hvd1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR1cGRhdGUoKTtcblxuXHRcdC8vIGBvbkRpZENoYW5nZWAgZmlyZXMgd2hlbiB0aGUgaG9zdCBsaXN0IGNoYW5nZXMgXHUyMDE0IGVudGVyaW5nIG9yXG5cdFx0Ly8gbGVhdmluZyB0aGUgZW1wdHkgc3RhdGUgaWYgdGhlIGxhc3QgaG9zdCBkaXNjb25uZWN0cyBvciB0aGVcblx0XHQvLyBmaXJzdCBob3N0IGFwcGVhcnMuXG5cdFx0c3RvcmUuYWRkKGZpbHRlci5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAoZmlsdGVyLmhvc3RzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0aGFzQ29tcGxldGVkRGlzY292ZXJ5ID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHVwZGF0ZSgpO1xuXHRcdH0pKTtcblx0XHQvLyBgb25EaWRDaGFuZ2VEaXNjb3ZlcmluZ2AgZmlyZXMgb24gZGlzY292ZXJ5IHN0YXJ0ICphbmQqIGVuZDsgd2Vcblx0XHQvLyB0cmVhdCBhbnkgdHJhbnNpdGlvbiBvdXQgb2YgZGlzY292ZXJpbmcgYXMgaGF2aW5nIGNvbXBsZXRlZCBhdFxuXHRcdC8vIGxlYXN0IG9uZSBjeWNsZS5cblx0XHRzdG9yZS5hZGQoZmlsdGVyLm9uRGlkQ2hhbmdlRGlzY292ZXJpbmcoKCkgPT4ge1xuXHRcdFx0aWYgKCFmaWx0ZXIuaXNEaXNjb3ZlcmluZykge1xuXHRcdFx0XHRoYXNDb21wbGV0ZWREaXNjb3ZlcnkgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dXBkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHN0b3JlO1xuXHR9XG5cblx0Ly8gLS0tIFNlbmQgLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfc2VuZChxdWVyeTogc3RyaW5nLCBhdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10sIGJhY2tncm91bmQ/OiBib29sZWFuKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2hvd1BpY2tlcigpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBmZWVkYmFja0l0ZW1zID0gWy4uLnRoaXMuX2ZlZWRiYWNrSXRlbXMuZ2V0KCldO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3RzID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIucm9vdClcblx0XHRcdD8/ICh0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmkgPyBbdGhpcy5fd29ya3NwYWNlUGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpXSA6IFtdKTtcblx0XHRjb25zdCByZXF1ZXN0ID0gYnVpbGROZXdTZXNzaW9uUHJvbXB0KHF1ZXJ5LCBmZWVkYmFja0l0ZW1zLCB3b3Jrc3BhY2VSb290cyk7XG5cblx0XHQvLyBDYXB0dXJlIHRoZSBjb21wb3NlcidzIHdvcmtzcGFjZSBzZWxlY3Rpb24gYmVmb3JlIHRoZSBzZW5kOiBhXG5cdFx0Ly8gYmFja2dyb3VuZCBzZW5kIGNvbnN1bWVzIHRoZSBpbi1mbGlnaHQgbmV3IHNlc3Npb24gYW5kIHJlc2V0cyB0aGVcblx0XHQvLyBuZXctc2Vzc2lvbiB2aWV3LCBzbyB3ZSByZS1zZWVkIGEgZnJlc2ggcGVuZGluZyBzZXNzaW9uIGFmdGVyd2FyZHNcblx0XHQvLyAoc2VlIGJlbG93KSB0byBrZWVwIHRoZSBjb21wb3NlcidzIHBpY2tlcnMgZnVuY3Rpb25hbC4gUXVpY2sgY2hhdHNcblx0XHQvLyBoYXZlIG5vIHdvcmtzcGFjZSwgc28gdGhleSByZS1zZWVkIHZpYSBvcGVuUXVpY2tDaGF0IGluc3RlYWQuXG5cdFx0Y29uc3Qgd2FzUXVpY2tDaGF0ID0gdGhpcy5faXNRdWlja0NoYXRDb21wb3Nlci5nZXQoKTtcblx0XHRjb25zdCByZXNlZWRGb2xkZXJVcmkgPSBiYWNrZ3JvdW5kICYmICF3YXNRdWlja0NoYXQgPyB0aGlzLl93b3Jrc3BhY2VQaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnMgPSB7IHF1ZXJ5OiByZXF1ZXN0LCBhdHRhY2hlZENvbnRleHQsIGJhY2tncm91bmQgfTtcblx0XHRjb25zdCBjbGVhckZlZWRiYWNrID0gKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGZlZWRiYWNrSXRlbXMpIHtcblx0XHRcdFx0dGhpcy5hZ2VudEZlZWRiYWNrU2VydmljZS5yZW1vdmVGZWVkYmFjayhBR0VOVF9GRUVEQkFDS19ORVdfU0VTU0lPTl9SRVNPVVJDRSwgaXRlbS5pZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHQvLyBBIGJhY2tncm91bmQgc2VuZCBpcyBmaXJlLWFuZC1mb3JnZXQgYW5kIHRoZSBjb21wb3NlciBpbW1lZGlhdGVseSByZXNlZWRzXG5cdFx0Ly8gZm9yIHRoZSBuZXh0IG9uZSwgc28gc2V2ZXJhbCBjYW4gYmUgaW4gZmxpZ2h0IGF0IG9uY2UuIEVhY2ggaXMgdHJhY2tlZFxuXHRcdC8vIHNlcGFyYXRlbHksIGtleWVkIGJ5IHRoZSBvcHRpb25zIG9iamVjdCBpdCB3YXMgc3RhcnRlZCB3aXRoLCBzbyBvbmVcblx0XHQvLyBzZW5kJ3Mgb3V0Y29tZSBuZXZlciBjbGVhcnMgYW5vdGhlcidzIGNvbW1lbnRzLlxuXHRcdGlmIChiYWNrZ3JvdW5kKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQmFja2dyb3VuZFNlbmRzLnNldChzZW5kT3B0aW9ucywgRXZlbnQub25jZShcblx0XHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5vbkRpZFNlbmRSZXF1ZXN0LCBldmVudCA9PiBldmVudC5vcHRpb25zID09PSBzZW5kT3B0aW9ucylcblx0XHRcdCkoKCkgPT4ge1xuXHRcdFx0XHRjbGVhckZlZWRiYWNrKCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdCYWNrZ3JvdW5kU2VuZHMuZGVsZXRlQW5kRGlzcG9zZShzZW5kT3B0aW9ucyk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3Qoc2Vzc2lvbiwgc2VuZE9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdCYWNrZ3JvdW5kU2VuZHMuZGVsZXRlQW5kRGlzcG9zZShzZW5kT3B0aW9ucyk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBzZW5kIHJlcXVlc3Q6JywgZSk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCFiYWNrZ3JvdW5kKSB7XG5cdFx0XHRjbGVhckZlZWRiYWNrKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQSBiYWNrZ3JvdW5kIHNlbmQgZ3JhZHVhdGVkIHRoZSBjb21wb3NlcidzIGluLWZsaWdodCBzZXNzaW9uIGFuZFxuXHRcdC8vIHJldHVybmVkIHRoZSB2aWV3IHRvIGEgZnJlc2ggKGJ1dCBzZXNzaW9uLWxlc3MpIG5ldy1zZXNzaW9uIGNvbXBvc2VyLlxuXHRcdC8vIFRoZSBzZW5kIG5vdyBjb21taXRzIGluIHRoZSBiYWNrZ3JvdW5kLCBzbyByZXNlZWQgYSByZXBsYWNlbWVudCBkcmFmdFxuXHRcdC8vIGltbWVkaWF0ZWx5IFx1MjAxNCBwcm92aWRlcnMgYXJlIG11bHRpLW5ldy1zZXNzaW9uIGF3YXJlLCBzbyB0aGUgZ3JhZHVhdGluZ1xuXHRcdC8vIHNlc3Npb24gYW5kIHRoaXMgbmV3IGRyYWZ0IGNvZXhpc3QuIFRoaXMgcmVzdG9yZXMgdGhlXG5cdFx0Ly8gc2Vzc2lvbi10eXBlL21vZGVsIHBpY2tlcnMgZm9yIHRoZSBuZXh0IG1lc3NhZ2UuXG5cdFx0aWYgKGJhY2tncm91bmQpIHtcblx0XHRcdGlmICh3YXNRdWlja0NoYXQpIHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uc1NlcnZpY2Uub3BlblF1aWNrQ2hhdCgpO1xuXHRcdFx0fSBlbHNlIGlmIChyZXNlZWRGb2xkZXJVcmkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY3JlYXRlTmV3U2Vzc2lvbihyZXNlZWRGb2xkZXJVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckZlZWRiYWNrQmFubmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBob3N0ID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc2Vzc2lvbi1pbnB1dC1iYW5uZXJzLm5ldy1zZXNzaW9uLWZlZWRiYWNrLWJhbm5lcnMnKSk7XG5cdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGZlZWRiYWNrSXRlbXMgPSB0aGlzLl9mZWVkYmFja0l0ZW1zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnRlbnQuY2xlYXIoKTtcblx0XHRcdGRvbS5jbGVhck5vZGUoaG9zdCk7XG5cdFx0XHRpZiAoIWZlZWRiYWNrSXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY291bnQgPSBmZWVkYmFja0l0ZW1zLmxlbmd0aDtcblx0XHRcdGNvbnN0IHRleHQgPSBjb3VudCA9PT0gMVxuXHRcdFx0XHQ/IGxvY2FsaXplKCduZXdTZXNzaW9uRmVlZGJhY2sub25lJywgXCIxIGNvbW1lbnRcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnbmV3U2Vzc2lvbkZlZWRiYWNrLm1hbnknLCBcInswfSBjb21tZW50c1wiLCBjb3VudCk7XG5cdFx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnRlbnQudmFsdWUgPSBzdG9yZTtcblx0XHRcdGNvbnN0IGJhbm5lciA9IHN0b3JlLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25JbnB1dEJhbm5lcldpZGdldCwge1xuXHRcdFx0XHRpY29uOiBDb2RpY29uLmNvbW1lbnREaXNjdXNzaW9uLFxuXHRcdFx0XHRhY2NlbnQ6IGZhbHNlLFxuXHRcdFx0XHR0ZXh0LFxuXHRcdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRcdGFjdGlvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCduZXdTZXNzaW9uRmVlZGJhY2sucmV2ZWFsJywgXCJSZXZlYWxcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmFnZW50RmVlZGJhY2tTZXJ2aWNlLnJldmVhbEZlZWRiYWNrKEFHRU5UX0ZFRURCQUNLX05FV19TRVNTSU9OX1JFU09VUkNFLCBmZWVkYmFja0l0ZW1zWzBdLmlkKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KSk7XG5cdFx0XHRob3N0LmFwcGVuZENoaWxkKGJhbm5lci5kb21Ob2RlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0LnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0bGF5b3V0KF9oZWlnaHQ6IG51bWJlciwgX3dpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9uZXdDaGF0SW5wdXQubGF5b3V0KF9oZWlnaHQsIF93aWR0aCk7XG5cdH1cblxuXHRmb2N1c0lucHV0KCk6IHZvaWQge1xuXHRcdC8vIFdoaWxlIHRoZSBlbXB0eSBzdGF0ZSBpcyBtb3VudGVkLCB0aGUgY2hhdCBpbnB1dCBpcyBoaWRkZW4gdmlhXG5cdFx0Ly8gQ1NTIChgLm5vLWFnZW50LWhvc3RgIG9uIGAubmV3LWNoYXQtd2lkZ2V0LWNvbnRlbnRgKSBzbyBmb2N1c2luZ1xuXHRcdC8vIGl0IHdvdWxkIGp1c3Qgc2VuZCBmb2N1cyB0byA8Ym9keT4uIExhbmQgb24gdGhlIGVtcHR5IHN0YXRlJ3Ncblx0XHQvLyBoZWFkaW5nIGluc3RlYWQgc28gdGhlIHVzZXIgaGFzIGEgdmlzaWJsZSBmb2N1cyB0YXJnZXQuXG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUVtcHR5U3RhdGUpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUVtcHR5U3RhdGUuZm9jdXMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlcyBhIHdvcmtzcGFjZSBzZWxlY3Rpb24gZnJvbSB0aGUgd29ya3NwYWNlIHBpY2tlciBhbmQgY3JlYXRlcyBhXG5cdCAqIG5ldyBzZXNzaW9uIGZvciBpdC4gV29ya3NwYWNlIHRydXN0ICh3aGVuIHJlcXVpcmVkKSBpcyByZXF1ZXN0ZWQgYnlcblx0ICoge0BsaW5rIElTZXNzaW9uc1NlcnZpY2Uub3Blbk5ld1Nlc3Npb259IGl0c2VsZiBcdTIwMTQgYSBzaW5nbGUgZ2F0ZSBzaGFyZWRcblx0ICogYnkgZXZlcnkgcGF0aCB0aGF0IGNyZWF0ZXMgYSBjb25jcmV0ZSBzZXNzaW9uIGZvciBhIGZvbGRlci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX29uV29ya3NwYWNlU2VsZWN0ZWQoZm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCB1cGdyYWRlIGZvciBhIHByZXZpb3VzIHNlbGVjdGlvbi5cblx0XHR0aGlzLl9wZW5kaW5nUHJlZmVycmVkVXBncmFkZS5jbGVhcigpO1xuXG5cdFx0aWYgKCFmb2xkZXJVcmkpIHtcblx0XHRcdHRoaXMuc2Vzc2lvbnNTZXJ2aWNlLnVuc2V0TmV3U2Vzc2lvbigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmkpO1xuXHRcdGlmIChyZXN1bHQudHJ1c3REZWNsaW5lZCkge1xuXHRcdFx0Ly8gRG9uJ3QgbGVhdmUgdGhlIHBpY2tlciBzaG93aW5nIHRoZSBkZWNsaW5lZCBmb2xkZXIgYXMgc2VsZWN0ZWQuXG5cdFx0XHR0aGlzLl93b3Jrc3BhY2VQaWNrZXIucmVtb3ZlRnJvbVJlY2VudHMoZm9sZGVyVXJpKTtcblx0XHR9XG5cdH1cblxuXHRwcmVmaWxsSW5wdXQodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0LnByZWZpbGxJbnB1dCh0ZXh0KTtcblx0fVxuXG5cdHNldEhvc3RWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9hcXVhcml1bVRvZ2dsZT8uc2V0SG9zdFZpc2libGUodmlzaWJsZSk7XG5cdH1cblxuXHRzZW5kUXVlcnkodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0LnNlbmRRdWVyeSh0ZXh0KTtcblx0fVxuXG5cdHN1Ym1pdElucHV0KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5fc2Vzc2lvbi5nZXQoKSkge1xuXHRcdFx0dGhpcy5fd29ya3NwYWNlUGlja2VyLnNob3dQaWNrZXIoKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZmFsc2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmV3Q2hhdElucHV0LnN1Ym1pdCgpO1xuXHR9XG5cblx0YXR0YWNoKHVyaXM6IFVSSVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fbmV3Q2hhdElucHV0LmF0dGFjaCh1cmlzKTtcblx0fVxuXG5cdHNlbGVjdFdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSwgcHJvdmlkZXJJZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmtzcGFjZVBpY2tlci5zZXRTZWxlY3RlZFdvcmtzcGFjZShmb2xkZXJVcmksIHsgcHJvdmlkZXJJZCB9KTtcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxjQUFjO0FBQ3ZCLFNBQTRCLCtCQUErQjtBQUMzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZLGVBQWUsaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDekcsU0FBUyxpQkFBaUIsU0FBUyw0QkFBNEIsU0FBc0IsaUNBQWlDO0FBQ3RILFNBQVMsYUFBYTtBQUV0QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBeUIsa0NBQWtDO0FBRTNELFNBQWdDLHdCQUF3QjtBQUN4RCxTQUFTLHdCQUE4QztBQUN2RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLDRDQUE0QztBQUNyRCxTQUFTLHFDQUFxQyxvQkFBb0MsNkJBQTZCO0FBQy9HLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFT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
