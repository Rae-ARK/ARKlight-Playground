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
import "./media/chatViewPane.css";
import { $, addDisposableListener, append, EventHelper, EventType, getWindow, setVisibility } from "../../../../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../../../../base/browser/mouseEvent.js";
import { Button } from "../../../../../../base/browser/ui/button/button.js";
import { Orientation, Sash } from "../../../../../../base/browser/ui/sash/sash.js";
import { DomScrollableElement } from "../../../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { MutableDisposable, toDisposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { MarshalledId } from "../../../../../../base/common/marshallingIds.js";
import { autorun, observableFromEvent, observableValue } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { ScrollbarVisibility } from "../../../../../../base/common/scrollable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { MenuWorkbenchToolBar } from "../../../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { defaultButtonStyles } from "../../../../../../platform/theme/browser/defaultStyles.js";
import { editorBackground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { ChatViewTitleControl } from "./chatViewTitleControl.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../../../platform/theme/common/theme.js";
import { IAccessibilityService } from "../../../../../../platform/accessibility/common/accessibility.js";
import { ViewPane } from "../../../../../browser/parts/views/viewPane.js";
import { Memento } from "../../../../../common/memento.js";
import { SIDE_BAR_FOREGROUND } from "../../../../../common/theme.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../../common/views.js";
import { ILifecycleService, StartupKind } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../../common/actions/chatContextKeys.js";
import { CHAT_PROVIDER_ID } from "../../../common/participants/chatParticipantContribTypes.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType } from "../../../common/chatSessionsService.js";
import { LocalChatSessionUri, getChatSessionType, isUntitledChatSession } from "../../../common/model/chatUri.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, getDefaultNewChatSessionResource, getDefaultNewChatSessionType } from "../../../common/constants.js";
import { AgentSessionsControl } from "../../agentSessions/agentSessionsControl.js";
import { ACTION_ID_NEW_CHAT } from "../../actions/chatActions.js";
import { ChatWidget, layoutChatWidgetForInputHeight } from "../../widget/chatWidget.js";
import { ChatViewWelcomeController } from "../../viewsWelcome/chatViewWelcomeController.js";
import { IWorkbenchLayoutService, LayoutSettings, Position } from "../../../../../services/layout/browser/layoutService.js";
import { AgentSessionsViewerOrientation, AgentSessionsViewerPosition } from "../../agentSessions/agentSessions.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { ChatViewId, IChatWidgetService, setModelPreservingInputTypedWhileLoading } from "../../chat.js";
import { IActivityService, ProgressBadge } from "../../../../../services/activity/common/activity.js";
import { disposableTimeout } from "../../../../../../base/common/async.js";
import { AgentSessionsFilter, AgentSessionsGrouping } from "../../agentSessions/agentSessionsFilter.js";
import { IAgentSessionsService } from "../../agentSessions/agentSessionsService.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { HoverPosition } from "../../../../../../base/browser/ui/hover/hoverWidget.js";
import { ChatEntitlementContextKeys, IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { toErrorMessage } from "../../../../../../base/common/errorMessage.js";
import { IHostService } from "../../../../../services/host/browser/host.js";
import { IMicCaptureService } from "../../voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../voiceClient/voiceSessionController.js";
import { IVoiceInputModeService } from "../../voiceInputMode/voiceInputMode.js";
import { isGlowingVoiceState, readVoiceGlowIntensity, resolveVoiceGlowColors } from "../../voiceClient/voiceGlow.js";
import { createVoiceGlowController } from "../../voiceClient/voiceGlowController.js";
import { combineVoiceInput } from "../../voiceClient/voiceInputUtils.js";
import { IAgentTitleBarStatusService } from "../../agentSessions/experiments/agentTitleBarStatusService.js";
import { IVoicePlaybackService } from "../../../common/voicePlaybackService.js";
import { VOICE_AGENT_PROGRESS_SETTING } from "../../../common/voiceClient/voiceClientService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
let ChatViewPane = class extends ViewPane {
  constructor(options, keybindingService2, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, storageService, chatService, chatAgentService, logService, notificationService, layoutService, chatSessionsService, telemetryService, lifecycleService, progressService, agentSessionsService, chatEntitlementService, commandService, activityService, hostService, micCaptureService, ttsPlaybackService, voiceSessionController, voiceInputModeService, chatWidgetService, _agentTitleBarStatusService, _voicePlaybackService, _workbenchEnvironmentService, workspaceContextService, agentHostEnablementService, accessibilityService) {
    super(options, keybindingService2, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.storageService = storageService;
    this.chatService = chatService;
    this.chatAgentService = chatAgentService;
    this.logService = logService;
    this.notificationService = notificationService;
    this.layoutService = layoutService;
    this.chatSessionsService = chatSessionsService;
    this.telemetryService = telemetryService;
    this.progressService = progressService;
    this.agentSessionsService = agentSessionsService;
    this.chatEntitlementService = chatEntitlementService;
    this.commandService = commandService;
    this.activityService = activityService;
    this.hostService = hostService;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.voiceSessionController = voiceSessionController;
    this.voiceInputModeService = voiceInputModeService;
    this.chatWidgetService = chatWidgetService;
    this.workspaceContextService = workspaceContextService;
    this.agentHostEnablementService = agentHostEnablementService;
    this.accessibilityService = accessibilityService;
    this.lastDimensionsPerOrientation = /* @__PURE__ */ new Map();
    this.loadSessionCts = this._register(new MutableDisposable());
    this._applyModelCts = this._register(new MutableDisposable());
    /** While > 0 the sessions list is suppressed so a session transition's transiently-empty widget does not reveal it (see {@link beginSessionsListSuppression}). */
    this._sessionsListSuppressionCount = 0;
    this.modelRef = this._register(new MutableDisposable());
    this.activityBadge = this._register(new MutableDisposable());
    this._currentSessionResource = observableValue(this, void 0);
    this._voiceBarDisposables = this._register(new DisposableStore());
    this.sessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
    this.sessionsViewerOrientationConfiguration = "sideBySide";
    this.sessionsViewerSashDisposables = this._register(new MutableDisposable());
    //#region Layout
    this.layoutingBody = false;
    this.memento = new Memento(`interactive-session-view-${CHAT_PROVIDER_ID}`, this.storageService);
    this.viewState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    if (lifecycleService.startupKind !== StartupKind.ReloadedWindow && this.configurationService.getValue(ChatConfiguration.RestoreLastPanelSession) === false) {
      this.viewState.sessionId = void 0;
      this.viewState.sessionResource = void 0;
    }
    this.sessionsViewerVisible = false;
    this.sessionsViewerSidebarWidth = Math.max(ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH, this.viewState.sessionsSidebarWidth ?? ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH);
    this.chatViewLocationContext = ChatContextKeys.panelLocation.bindTo(contextKeyService);
    this.sessionsViewerOrientationContext = ChatContextKeys.agentSessionsViewerOrientation.bindTo(contextKeyService);
    this.sessionsViewerPositionContext = ChatContextKeys.agentSessionsViewerPosition.bindTo(contextKeyService);
    this.sessionsViewerVisibilityContext = ChatContextKeys.agentSessionsViewerVisible.bindTo(contextKeyService);
    this.updateContextKeys();
    this._focusedSessionResource = observableFromEvent(
      this,
      this.chatWidgetService.onDidChangeFocusedSession,
      () => this.chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource
    );
    this.registerListeners();
  }
  updateContextKeys() {
    const { position, location } = this.getViewPositionAndLocation();
    this.chatViewLocationContext.set(location ?? ViewContainerLocation.AuxiliaryBar);
    this.sessionsViewerOrientationContext.set(this.sessionsViewerOrientation);
    this.sessionsViewerPositionContext.set(position === Position.RIGHT ? AgentSessionsViewerPosition.Right : AgentSessionsViewerPosition.Left);
  }
  getViewPositionAndLocation() {
    const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
    const sideBarPosition = this.layoutService.getSideBarPosition();
    const panelPosition = this.layoutService.getPanelPosition();
    let sideSessionsOnRightPosition;
    switch (viewLocation) {
      case ViewContainerLocation.Sidebar:
        sideSessionsOnRightPosition = sideBarPosition === Position.RIGHT;
        break;
      case ViewContainerLocation.Panel:
        sideSessionsOnRightPosition = panelPosition !== Position.LEFT;
        break;
      default:
        sideSessionsOnRightPosition = sideBarPosition === Position.LEFT;
        break;
    }
    return {
      position: sideSessionsOnRightPosition ? Position.RIGHT : Position.LEFT,
      location: viewLocation ?? ViewContainerLocation.AuxiliaryBar
    };
  }
  getSessionHoverPosition() {
    const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
    const sideBarPosition = this.layoutService.getSideBarPosition();
    if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      return viewLocation === ViewContainerLocation.Sidebar && sideBarPosition === Position.RIGHT ? HoverPosition.LEFT : HoverPosition.RIGHT;
    }
    return {
      [Position.LEFT]: HoverPosition.RIGHT,
      [Position.RIGHT]: HoverPosition.LEFT,
      [Position.TOP]: HoverPosition.BELOW,
      [Position.BOTTOM]: HoverPosition.ABOVE
    }[viewLocation === ViewContainerLocation.Panel ? this.layoutService.getPanelPosition() : sideBarPosition];
  }
  updateViewPaneClasses(fromEvent) {
    const activityBarLocationDefault = this.configurationService.getValue(LayoutSettings.ACTIVITY_BAR_LOCATION) === "default";
    this.viewPaneContainer?.classList.toggle("activity-bar-location-default", activityBarLocationDefault);
    this.viewPaneContainer?.classList.toggle("activity-bar-location-other", !activityBarLocationDefault);
    const { position, location } = this.getViewPositionAndLocation();
    this.viewPaneContainer?.classList.toggle("chat-view-location-auxiliarybar", location === ViewContainerLocation.AuxiliaryBar);
    this.viewPaneContainer?.classList.toggle("chat-view-location-sidebar", location === ViewContainerLocation.Sidebar);
    this.viewPaneContainer?.classList.toggle("chat-view-location-panel", location === ViewContainerLocation.Panel);
    this.viewPaneContainer?.classList.toggle("chat-view-position-left", position === Position.LEFT);
    this.viewPaneContainer?.classList.toggle("chat-view-position-right", position === Position.RIGHT);
    if (fromEvent) {
      this.relayout();
    }
  }
  registerListeners() {
    this._register(this.chatAgentService.onDidChangeAgents(() => this.onDidChangeAgents()));
    this._register(this.chatSessionsService.onDidCommitSession(async (e) => {
      if (!this.modelRef.value) {
        return;
      }
      if (!isEqual(e.original, this.modelRef.value.object.sessionResource)) {
        return;
      }
      const modelRef = await this.chatService.acquireOrLoadSession(e.committed, ChatAgentLocation.Chat, CancellationToken.None, "ChatViewPane#onDidCommitSession");
      await this.showModel(CancellationToken.None, modelRef);
    }));
    this._register(Event.any(
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("workbench.sideBar.location")),
      this.layoutService.onDidChangePanelPosition,
      Event.filter(this.viewDescriptorService.onDidChangeContainerLocation, (e) => e.viewContainer === this.viewDescriptorService.getViewContainerByViewId(this.id))
    )(() => {
      this.updateContextKeys();
      this.updateViewPaneClasses(
        true
        /* layout here */
      );
    }));
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => {
      return e.affectsConfiguration(LayoutSettings.ACTIVITY_BAR_LOCATION);
    })(() => this.updateViewPaneClasses(true)));
  }
  onDidChangeAgents() {
    if (this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat)) {
      if (!this._widget?.viewModel && !this.restoringSession) {
        this.restoringSession = this.acquireTransferredOrPersistedSession(CancellationToken.None, "ChatViewPane#onDidChangeAgents").then(async (modelRef) => {
          if (!this._widget) {
            return;
          }
          const wasVisible = this._widget.visible;
          try {
            this._widget.setVisible(false);
            await this.showModel(CancellationToken.None, modelRef, true, !modelRef);
          } finally {
            this._widget.setVisible(wasVisible);
          }
        });
        this.restoringSession.finally(() => this.restoringSession = void 0);
      }
    }
    this._onDidChangeViewWelcomeState.fire();
  }
  getTransferredOrPersistedSessionInfo() {
    if (this.chatService.transferredSessionResource) {
      return this.chatService.transferredSessionResource;
    }
    if (this.viewState.sessionResource) {
      return this.viewState.sessionResource;
    }
    return this.viewState.sessionId ? LocalChatSessionUri.forSession(this.viewState.sessionId) : void 0;
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.telemetryService.publicLog2("chatViewPaneOpened");
    this.viewPaneContainer = parent;
    this.viewPaneContainer.classList.add("chat-viewpane");
    this.updateViewPaneClasses(false);
    const controlsWrapper = append(parent, $(".voice-agent-controls-wrapper"));
    this.createControls(controlsWrapper);
    this._voiceBarContainer = $(".voice-agent-bar-host");
    this._voiceBarContainer.style.display = "none";
    this._updateVoiceBar(this._voiceBarContainer);
    const inputContainerEl = this._widget.inputPart.inputContainerElement;
    if (inputContainerEl) {
      this._setupVoiceTranscriptOverlay(inputContainerEl);
    }
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("agents.voice.enabled")) {
        this._updateVoiceBar(this._voiceBarContainer);
      }
    }));
    this.setupContextMenu(parent);
    this.applyModel();
  }
  createControls(parent) {
    const sessionsControl = this.createSessionsControl(parent);
    const welcomeController = this.welcomeController = this._register(this.instantiationService.createInstance(ChatViewWelcomeController, parent, this, ChatAgentLocation.Chat));
    const chatWidget = this.createChatControl(parent);
    this.registerControlsListeners(sessionsControl, chatWidget, welcomeController);
    this.updateSessionsControlVisibility();
  }
  _updateVoiceBar(container) {
    this._voiceBarDisposables.clear();
    container.replaceChildren();
    container.style.display = "none";
    if (this.configurationService.getValue("agents.voice.enabled")) {
      this._voiceBarDisposables.add(CommandsRegistry.registerCommand("_chat.voice.acceptInput", (accessor, text) => {
        const chatWidgetService = accessor.get(IChatWidgetService);
        const focusedWidget = chatWidgetService.lastFocusedWidget;
        const widget = focusedWidget?.hasInputFocus() ? focusedWidget : this._widget;
        if (text && widget?.viewModel) {
          if (widget.viewModel.editing) {
            widget.input.setValue(text, false);
          } else {
            return widget.acceptInput(combineVoiceInput(widget.getInput(), text), {
              preserveFocus: true,
              isVoiceModeInput: this.configurationService.getValue(VOICE_AGENT_PROGRESS_SETTING) === true
            });
          }
        }
        return void 0;
      }));
      this._voiceBarDisposables.add(CommandsRegistry.registerCommand("_chat.voice.switchToSession", async (_accessor, resourceStr) => {
        if (!resourceStr) {
          return false;
        }
        try {
          const resource = URI.parse(resourceStr);
          this.viewState.sessionResource = resource;
          this.applyModel();
          await this.restoringSession;
          const restoredResource = this._widget?.viewModel?.sessionResource;
          return !!restoredResource && isEqual(restoredResource, resource);
        } catch {
          return false;
        }
      }));
      this._voiceBarDisposables.add(CommandsRegistry.registerCommand("_chat.voice.getCurrentSession", (_accessor) => {
        return this._widget?.viewModel?.sessionResource?.toString();
      }));
    }
  }
  /**
   * The single chat input voice mode is currently bound to. Mirrors the routing
   * used by `_chat.voice.acceptInput`: an explicit target session (set by the
   * floating aux window) wins, otherwise the last-focused chat widget's session,
   * falling back to this pane's own session. The glow / transcript render only on
   * the pane whose session matches this, so with several chat inputs open (e.g.
   * this pane plus a chat editor) exactly one lights up.
   */
  _currentVoiceInputResource(reader) {
    const target = reader ? this.voiceSessionController.targetSession.read(reader) : this.voiceSessionController.targetSession.get();
    if (target) {
      return target;
    }
    const focused = reader ? this._focusedSessionResource.read(reader) : this._focusedSessionResource.get();
    return focused ?? this._widget?.viewModel?.sessionResource;
  }
  _setupVoiceTranscriptOverlay(inputContainerEl) {
    inputContainerEl.style.position = "relative";
    const showTranscriptSetting = observableFromEvent(
      this,
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("agents.voice.showTranscript")),
      () => this.configurationService.getValue("agents.voice.showTranscript") !== false
    );
    const showLiveTranscriptSetting = observableFromEvent(
      this,
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("agents.voice.liveTranscript")),
      () => this.configurationService.getValue("agents.voice.liveTranscript") !== false
    );
    const transcriptOverlay = $(".voice-transcript-overlay");
    const transcriptScrollable = this._register(new DomScrollableElement(transcriptOverlay, {
      horizontal: ScrollbarVisibility.Hidden,
      vertical: ScrollbarVisibility.Auto
    }));
    const transcriptOverlayNode = transcriptScrollable.getDomNode();
    transcriptOverlayNode.classList.add("voice-transcript-overlay-scrollable");
    transcriptOverlayNode.style.display = "none";
    inputContainerEl.append(transcriptOverlayNode);
    let animFrameId;
    const glowDataArrayRef = { value: void 0 };
    const win = getWindow(inputContainerEl);
    const glowController = this._register(createVoiceGlowController(
      inputContainerEl,
      () => isDark(this.themeService.getColorTheme().type) ? "dark" : "light",
      () => resolveVoiceGlowColors(this.themeService.getColorTheme())
    ));
    this._register(this.themeService.onDidColorThemeChange(() => glowController.refreshTheme()));
    const getEffectiveVoice = () => {
      const sim = this.voiceInputModeService.simulatedVoiceState.get();
      if (sim === "idle" || sim === "listening" || sim === "speaking") {
        return { connected: true, voiceState: sim, simulating: true };
      }
      if (sim === "off" || sim === "connecting" || sim === "dictating") {
        return { connected: false, voiceState: "idle", simulating: true };
      }
      return {
        connected: this.voiceSessionController.isConnected.get(),
        voiceState: this.voiceSessionController.voiceState.get(),
        simulating: false
      };
    };
    const startGlowAnimation = () => {
      if (animFrameId !== void 0) {
        return;
      }
      const animate = () => {
        animFrameId = win.requestAnimationFrame(animate);
        const { connected, voiceState, simulating } = getEffectiveVoice();
        const currentSession = this._currentSessionResource.get();
        const boundResource = this._currentVoiceInputResource();
        const isOwner = !!currentSession && !!boundResource && isEqual(currentSession, boundResource);
        const glowActive = connected && isGlowingVoiceState(voiceState) && (simulating || isOwner);
        if (!glowActive) {
          glowController.clear();
          return;
        }
        const analyser = this.ttsPlaybackService.analyserNode ?? (voiceState === "listening" ? this.micCaptureService.analyserNode : null) ?? null;
        let intensity;
        if (!analyser && simulating) {
          const t = Date.now() / 1e3;
          intensity = Math.min(1, 0.28 + 0.34 * Math.abs(Math.sin(t * 6.1)) + 0.22 * Math.abs(Math.sin(t * 11.3 + 1)));
        } else {
          intensity = readVoiceGlowIntensity(analyser, glowDataArrayRef);
        }
        glowController.render(voiceState, intensity, this.accessibilityService.isMotionReduced());
      };
      animFrameId = win.requestAnimationFrame(animate);
    };
    const stopGlowAnimation = () => {
      if (animFrameId !== void 0) {
        win.cancelAnimationFrame(animFrameId);
        animFrameId = void 0;
      }
      glowController.clear();
    };
    this._register(autorun((reader) => {
      const connected = this.voiceSessionController.isConnected.read(reader);
      const voiceState = this.voiceSessionController.voiceState.read(reader);
      const sim = this.voiceInputModeService.simulatedVoiceState.read(reader);
      const simGlow = sim === "listening" || sim === "speaking";
      if (simGlow || connected && isGlowingVoiceState(voiceState)) {
        startGlowAnimation();
      } else {
        stopGlowAnimation();
      }
    }));
    this._register({ dispose: () => stopGlowAnimation() });
    let listeningSession;
    let ownerSession;
    this._register(autorun((reader) => {
      const simState = this.voiceInputModeService.simulatedVoiceState.read(reader);
      const simVersion = this.voiceInputModeService.simulatedVersion.read(reader);
      if (simState !== void 0) {
        if (simState === "idle" && simVersion) {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const hint = $("span.partial");
          switch (simVersion) {
            case "handsFree":
              hint.textContent = localize("voiceMode.simHint.handsFree", "Hands-free \u2014 just start talking");
              break;
            case "keyboardHold": {
              const kbLabel = this.keybindingService.lookupKeybinding("workbench.action.chat.voiceInputMode.holdToTalk")?.getLabel();
              hint.textContent = kbLabel ? localize("voiceMode.pttHint", "Hold {0} to talk", kbLabel) : localize("voiceMode.simHint.keyboardHold", "Hold Space to talk");
              break;
            }
            case "buttonHold":
              hint.textContent = localize("voiceMode.simHint.buttonHold", "Hold the button to talk, tap to turn off");
              break;
            case "clickToggle":
              hint.textContent = localize("voiceMode.simHint.clickToggle", "Tap the button to start listening");
              break;
          }
          transcriptOverlay.append(hint);
          transcriptScrollable.scanDomNode();
        } else {
          transcriptOverlayNode.style.display = "none";
          transcriptOverlayNode.classList.remove("has-transcript");
        }
        return;
      }
      const turns = this.voiceSessionController.transcriptTurns.read(reader);
      const connected = this.voiceSessionController.isConnected.read(reader);
      const voiceState = this.voiceSessionController.voiceState.read(reader);
      const targetSession = this.voiceSessionController.targetSession.read(reader);
      const currentSession = this._currentSessionResource.read(reader);
      const showTranscript = showTranscriptSetting.read(reader);
      const showLiveTranscript = showLiveTranscriptSetting.read(reader);
      const visible = turns.filter((t) => t.text.length > 0 || t.speaker === "user" && t.isPartial);
      const showListeningPlaceholder = voiceState === "listening" && (!showTranscript || !showLiveTranscript);
      if (!connected) {
        listeningSession = void 0;
        ownerSession = void 0;
        transcriptOverlayNode.style.display = "none";
        transcriptOverlayNode.classList.remove("has-transcript");
        return;
      }
      if (voiceState === "listening") {
        if (!listeningSession) {
          listeningSession = targetSession ?? currentSession;
          ownerSession = listeningSession;
        } else if (!targetSession && currentSession && !isEqual(currentSession, listeningSession)) {
          const dictationSession = listeningSession;
          const activelyDictating = turns.some((t) => t.speaker === "user" && t.isPartial && t.text.trim().length > 0);
          if (activelyDictating) {
            this.voiceSessionController.finishListeningAndSubmitTo(dictationSession);
            listeningSession = void 0;
          } else if (isUntitledChatSession(currentSession)) {
            listeningSession = currentSession;
            ownerSession = currentSession;
          } else {
            this.voiceSessionController.discardListening();
            listeningSession = void 0;
          }
        }
      } else {
        listeningSession = void 0;
      }
      const boundResource = this._currentVoiceInputResource(reader);
      if (boundResource && currentSession && !isEqual(boundResource, currentSession)) {
        transcriptOverlayNode.style.display = "none";
        transcriptOverlayNode.classList.remove("has-transcript");
        return;
      }
      const effectiveOwner = targetSession ?? ownerSession;
      if (effectiveOwner && currentSession && !isEqual(effectiveOwner, currentSession)) {
        transcriptOverlayNode.style.display = "none";
        transcriptOverlayNode.classList.remove("has-transcript");
        return;
      }
      if (visible.length === 0 || !showTranscript || showListeningPlaceholder) {
        const handsFree = this.configurationService.getValue("agents.voice.handsFree") === true;
        if (showListeningPlaceholder) {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const listening = $("span.listening");
          listening.textContent = localize("voiceMode.listening", "Listening...");
          transcriptOverlay.append(listening);
          transcriptScrollable.scanDomNode();
        } else if (!showTranscript && voiceState === "speaking") {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const hint = $("span.partial");
          const kb = this.keybindingService.lookupKeybinding("workbench.action.chat.voiceInputMode.holdToTalk") ?? this.keybindingService.lookupKeybinding("agentsVoice.pushToTalk");
          const kbLabel = kb?.getLabel();
          hint.textContent = kbLabel ? localize("voiceMode.bargeInHint", "Speak or use {0}", kbLabel) : localize("voiceMode.bargeInHintNoKb", "Speak to barge in");
          transcriptOverlay.append(hint);
          transcriptScrollable.scanDomNode();
        } else if (voiceState === "idle" && visible.length === 0 && showTranscript && !handsFree) {
          transcriptOverlayNode.style.display = "";
          transcriptOverlayNode.classList.remove("has-transcript");
          transcriptOverlay.replaceChildren();
          const hint = $("span.partial");
          const kb = this.keybindingService.lookupKeybinding("agentsVoice.pushToTalk");
          const kbLabel = kb?.getLabel();
          hint.textContent = kbLabel ? localize("voiceMode.pttOrBargeInHint", "Press {0} to talk or barge in", kbLabel) : localize("voiceMode.clickMicOrBargeInHint", "Click voice mode to talk or barge in");
          transcriptOverlay.append(hint);
          transcriptScrollable.scanDomNode();
        } else {
          transcriptOverlayNode.style.display = "none";
          transcriptOverlayNode.classList.remove("has-transcript");
        }
        return;
      }
      transcriptOverlayNode.style.display = "";
      transcriptOverlayNode.classList.add("has-transcript");
      const lastTurn = visible[visible.length - 1];
      const contentElements = [];
      if (lastTurn.speaker === "user") {
        const span = $("span");
        if (lastTurn.isPartial) {
          const committedPart = lastTurn.committed || "";
          const unsurePart = lastTurn.text.slice(committedPart.length);
          if (committedPart) {
            const c = $("span.committed");
            c.textContent = committedPart;
            span.append(c);
          }
          const u = $("span.partial");
          u.textContent = unsurePart + "\u2589";
          span.append(u);
        } else {
          span.className = "committed";
          span.textContent = lastTurn.text;
        }
        contentElements.push(span);
      } else {
        const div = $("div.assistant-text");
        div.textContent = lastTurn.text;
        contentElements.push(div);
      }
      transcriptOverlay.replaceChildren(...contentElements);
      transcriptScrollable.scanDomNode();
      transcriptScrollable.setScrollPosition({ scrollTop: 0 });
    }));
  }
  get agentSessionsControl() {
    return this.sessionsControl;
  }
  createSessionsControl(parent) {
    const sessionsContainer = this.sessionsContainer = parent.appendChild($(".agent-sessions-container"));
    const sessionsTitleContainer = this.sessionsTitleContainer = append(sessionsContainer, $(".agent-sessions-title-container"));
    const sessionsTitle = this.sessionsTitle = append(sessionsTitleContainer, $("span.agent-sessions-title"));
    sessionsTitle.textContent = localize("sessions", "Sessions");
    this._register(addDisposableListener(sessionsTitle, EventType.CLICK, () => {
      this.sessionsControl?.scrollToTop();
      this.sessionsControl?.focus();
    }));
    const sessionsToolbarContainer = append(sessionsTitleContainer, $(".agent-sessions-toolbar"));
    const sessionsToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionsToolbarContainer, MenuId.AgentSessionsToolbar, {
      menuOptions: { shouldForwardArgs: true }
    }));
    const sessionsFilter = this._register(this.instantiationService.createInstance(AgentSessionsFilter, {
      filterMenuId: MenuId.AgentSessionsViewerFilterSubMenu,
      groupResults: () => this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? AgentSessionsGrouping.Capped : AgentSessionsGrouping.Date
    }));
    this._register(Event.runAndSubscribe(sessionsFilter.onDidChange, () => {
      sessionsToolbarContainer.classList.toggle("filtered", !sessionsFilter.isDefault());
    }));
    const newSessionButtonContainer = this.sessionsNewButtonContainer = append(sessionsContainer, $(".agent-sessions-new-button-container"));
    const newSessionButton = this._register(new Button(newSessionButtonContainer, { ...defaultButtonStyles, secondary: true }));
    newSessionButton.label = localize("newSession", "New Session");
    this._register(newSessionButton.onDidClick(() => this.commandService.executeCommand(ACTION_ID_NEW_CHAT, this.getActionsContext())));
    this.sessionsControlContainer = append(sessionsContainer, $(".agent-sessions-control-container"));
    const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(AgentSessionsControl, this.sessionsControlContainer, {
      source: "chatViewPane",
      filter: sessionsFilter,
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      getHoverPosition: () => this.getSessionHoverPosition(),
      trackActiveEditorSession: () => {
        return !this._widget || this._widget.isEmpty();
      },
      overrideSessionOpenOptions: (openEvent) => {
        if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked && !openEvent.sideBySide) {
          return { ...openEvent, editorOptions: {
            ...openEvent.editorOptions,
            preserveFocus: false
            /* focus the chat widget when opening from stacked sessions viewer since this closes the stacked viewer */
          } };
        }
        return openEvent;
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => sessionsControl.setVisible(visible)));
    sessionsToolbar.context = sessionsControl;
    this._register(this.hostService.onDidChangeFocus((hasFocus) => {
      if (hasFocus) {
        sessionsControl.refresh();
      }
    }));
    this._register(Event.runAndSubscribe(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsOrientation)), (e) => {
      const newSessionsViewerOrientationConfiguration = this.configurationService.getValue(ChatConfiguration.ChatViewSessionsOrientation);
      this.doUpdateConfiguredSessionsViewerOrientation(newSessionsViewerOrientationConfiguration, { updateConfiguration: false, layout: !!e });
    }));
    return sessionsControl;
  }
  getSessionsViewerOrientation() {
    return this.sessionsViewerOrientation;
  }
  updateConfiguredSessionsViewerOrientation(orientation) {
    return this.doUpdateConfiguredSessionsViewerOrientation(orientation, { updateConfiguration: true, layout: true });
  }
  doUpdateConfiguredSessionsViewerOrientation(orientation, options) {
    const oldSessionsViewerOrientationConfiguration = this.sessionsViewerOrientationConfiguration;
    let validatedOrientation;
    if (orientation === "stacked" || orientation === "sideBySide") {
      validatedOrientation = orientation;
    } else {
      validatedOrientation = "sideBySide";
    }
    this.sessionsViewerOrientationConfiguration = validatedOrientation;
    if (oldSessionsViewerOrientationConfiguration === this.sessionsViewerOrientationConfiguration) {
      return;
    }
    if (options.updateConfiguration) {
      this.configurationService.updateValue(ChatConfiguration.ChatViewSessionsOrientation, validatedOrientation);
    }
    if (options.layout) {
      this.relayout();
    }
  }
  updateSessionsControlVisibility() {
    if (!this.sessionsContainer || !this.viewPaneContainer) {
      return { changed: false, visible: false };
    }
    let newSessionsContainerVisible;
    if (!this.configurationService.getValue(ChatConfiguration.ChatViewSessionsEnabled)) {
      newSessionsContainerVisible = false;
    } else {
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        newSessionsContainerVisible = (!!this.chatEntitlementService.sentiment.completed || this.chatEntitlementService.hasByokModels) && // chat is setup (otherwise make room for terms and welcome)
        (!this._widget || this._widget.isEmpty() && !!this._widget.viewModel && !this._widget.viewModel.model.title) && // chat widget empty (but not when model is loading or has a title)
        this._sessionsListSuppressionCount === 0 && // not mid-transition (a slow session transiently shows an empty widget)
        !this.welcomeController?.isShowingWelcome.get();
      } else {
        newSessionsContainerVisible = !this.welcomeController?.isShowingWelcome.get() && // welcome not showing
        !!this.lastDimensions && this.lastDimensions.width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH;
      }
    }
    this.viewPaneContainer.classList.toggle("has-sessions-control", newSessionsContainerVisible);
    const sessionsContainerVisible = this.sessionsContainer.style.display !== "none";
    setVisibility(newSessionsContainerVisible, this.sessionsContainer);
    this.sessionsViewerVisible = newSessionsContainerVisible;
    this.sessionsViewerVisibilityContext.set(newSessionsContainerVisible);
    return {
      changed: sessionsContainerVisible !== newSessionsContainerVisible,
      visible: newSessionsContainerVisible
    };
  }
  refreshSessionsControlVisibility() {
    const { changed } = this.updateSessionsControlVisibility();
    if (changed) {
      this.relayout();
    }
  }
  /**
   * Suppresses the sessions list until the returned disposable is disposed.
   * Used to span a whole session transition (e.g. a "Continue in…" migration:
   * load → materializing send → rebind) so the transiently-empty widget never
   * falls back to the list.
   */
  beginSessionsListSuppression() {
    this._sessionsListSuppressionCount++;
    this.refreshSessionsControlVisibility();
    return toDisposable(() => {
      this._sessionsListSuppressionCount--;
      this.refreshSessionsControlVisibility();
    });
  }
  getFocusedSessions() {
    return this.sessionsControl?.getFocus() ?? [];
  }
  get widget() {
    return this._widget;
  }
  createChatControl(parent) {
    const chatControlsContainer = append(parent, $(".chat-controls-container"));
    const locationBasedColors = this.getLocationBasedColors();
    const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatControlsContainer)).appendChild($(".chat-editor-overflow.monaco-editor"));
    this._register(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
    this.createChatTitleControl(chatControlsContainer);
    const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
    this._widget = this._register(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      { viewId: this.id },
      {
        autoScroll: (mode) => mode !== ChatModeKind.Ask,
        renderFollowups: true,
        supportsFileReferences: true,
        clear: () => this.clear(),
        rendererOptions: {
          renderTextEditsAsSummary: (uri) => {
            return true;
          },
          referencesExpandedWhenEmptyResponse: false,
          progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
        },
        editorOverflowWidgetsDomNode,
        enableImplicitContext: true,
        enableWorkingSet: "explicit",
        supportsChangingModes: true,
        dndContainer: parent
      },
      {
        listForeground: SIDE_BAR_FOREGROUND,
        listBackground: locationBasedColors.background,
        overlayBackground: locationBasedColors.overlayBackground,
        inputEditorBackground: locationBasedColors.background,
        resultEditorBackground: editorBackground
      }
    ));
    this._widget.render(chatControlsContainer);
    const updateWidgetVisibility = (reader) => this._widget.setVisible(this.isBodyVisible() && !this.welcomeController?.isShowingWelcome.read(reader));
    this._register(this.onDidChangeBodyVisibility(() => updateWidgetVisibility()));
    this._register(autorun((reader) => updateWidgetVisibility(reader)));
    return this._widget;
  }
  createChatTitleControl(parent) {
    this.titleControl = this._register(this.instantiationService.createInstance(
      ChatViewTitleControl,
      parent,
      {
        focusChat: () => this._widget.focusInput()
      }
    ));
    this._register(this.titleControl.onDidChangeHeight(() => {
      this.relayout();
    }));
  }
  //#endregion
  registerControlsListeners(sessionsControl, chatWidget, welcomeController) {
    const hasByokModelsContextKeys = /* @__PURE__ */ new Set([ChatEntitlementContextKeys.hasByokModels.key]);
    this._register(Event.any(
      chatWidget.onDidChangeEmptyState,
      Event.fromObservable(welcomeController.isShowingWelcome),
      Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.ChatViewSessionsEnabled)),
      Event.filter(this.contextKeyService.onDidChangeContext, (e) => e.affectsSome(hasByokModelsContextKeys))
    )(() => {
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        sessionsControl.clearFocus();
      }
      const { changed: visibilityChanged } = this.updateSessionsControlVisibility();
      if (visibilityChanged) {
        this.relayout();
      }
    }));
    this._register(chatWidget.onDidChangeViewModel(() => {
      const model = chatWidget.viewModel?.model;
      this.titleControl?.update(model);
      this._currentSessionResource.set(chatWidget.viewModel?.sessionResource, void 0);
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        return;
      }
      const sessionResource = chatWidget.viewModel?.sessionResource;
      if (sessionResource) {
        const revealed = sessionsControl.reveal(sessionResource);
        if (!revealed) {
          sessionsControl.clearFocus();
        }
      }
    }));
    this._register(this.agentSessionsService.model.onDidChangeSessions(() => {
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        return;
      }
      if (sessionsControl.hasFocusOrSelection()) {
        return;
      }
      const sessionResource = chatWidget.viewModel?.sessionResource;
      if (sessionResource) {
        sessionsControl.reveal(sessionResource);
      }
    }));
    this._register(this.agentSessionsService.model.onDidChangeSessionArchivedState((e) => {
      if (e.isArchived()) {
        const currentSessionResource = chatWidget.viewModel?.sessionResource;
        if (currentSessionResource && isEqual(currentSessionResource, e.resource)) {
          this.clear();
        }
      }
    }));
    this._register(autorun((reader) => {
      chatWidget.inputPart.height.read(reader);
      if (this.sessionsViewerVisible && this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
        this.relayoutForInputHeight();
      }
    }));
    const progressBadgeDisposables = this._register(new MutableDisposable());
    const updateProgressBadge = () => {
      progressBadgeDisposables.value = new DisposableStore();
      if (!this.configurationService.getValue(ChatConfiguration.ChatViewProgressBadgeEnabled)) {
        this.activityBadge.clear();
        return;
      }
      const model = chatWidget.viewModel?.model;
      if (model) {
        progressBadgeDisposables.value.add(autorun((reader) => {
          if (model.requestInProgress.read(reader)) {
            this.activityBadge.value = this.activityService.showViewActivity(this.id, {
              badge: new ProgressBadge(() => localize("sessionInProgress", "Agent Session in Progress"))
            });
          } else {
            this.activityBadge.clear();
          }
        }));
      } else {
        this.activityBadge.clear();
      }
    };
    this._register(chatWidget.onDidChangeViewModel(() => updateProgressBadge()));
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration(ChatConfiguration.ChatViewProgressBadgeEnabled))(() => updateProgressBadge()));
    updateProgressBadge();
  }
  setupContextMenu(parent) {
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => {
      EventHelper.stop(e, true);
      this.contextMenuService.showContextMenu({
        menuId: MenuId.ChatWelcomeContext,
        contextKeyService: this.contextKeyService,
        getAnchor: () => new StandardMouseEvent(getWindow(parent), e)
      });
    }));
  }
  //#region Model Management
  applyModel() {
    this._applyModelCts.value?.cancel();
    const cts = this._applyModelCts.value = new CancellationTokenSource();
    this.restoringSession = this._applyModel(cts.token).catch((err) => {
      if (!isCancellationError(err)) {
        this.logService.error("ChatViewPane#applyModel failed", err);
      }
    });
    this.restoringSession.finally(() => this.restoringSession = void 0);
  }
  async _applyModel(token) {
    const modelRef = await this.acquireTransferredOrPersistedSession(token, "ChatViewPane#applyModel");
    await this.showModel(token, modelRef, true, !modelRef);
  }
  /**
   * Force-start a new local chat session in the view, bypassing the
   * default-provider override applied by `showModel()`. Used by the
   * picker when the user explicitly selects "Local", and by New Local Chat.
   */
  async startNewLocalSession() {
    this._applyModelCts.value?.cancel();
    const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: "ChatViewPane#startNewLocalSession" });
    return this.showModel(CancellationToken.None, ref);
  }
  /**
   * When the remembered or computed default session type is a non-local
   * provider (for example when the agent host is enabled), return a new session
   * reference for it instead of the built-in local provider. Returns
   * `undefined` to fall back to `startNewLocalSession`.
   */
  async acquireDefaultNewSession(token) {
    const workspace = this.workspaceContextService.getWorkspace();
    const defaultType = getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService, workspace, this.agentHostEnablementService.enabled.get());
    if (defaultType === localChatSessionType) {
      return void 0;
    }
    const resource = getDefaultNewChatSessionResource(this.configurationService, this.chatSessionsService, this.storageService, workspace, this.agentHostEnablementService.enabled.get());
    try {
      return await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, "ChatViewPane#acquireDefaultNewSession");
    } catch (error) {
      if (isCancellationError(error)) {
        throw error;
      }
      this.logService.warn(`[ChatViewPane] Failed to acquire default agent-host session, falling back to local`, error);
      return void 0;
    }
  }
  async acquireTransferredOrPersistedSession(token, debugOwner) {
    const sessionResource = this.getTransferredOrPersistedSessionInfo();
    if (!sessionResource) {
      return void 0;
    }
    const modelRef = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token, debugOwner);
    if (!modelRef) {
      return void 0;
    }
    if (this.shouldSkipRestoredLocalSession(sessionResource, modelRef.object)) {
      modelRef.dispose();
      return void 0;
    }
    return modelRef;
  }
  shouldSkipRestoredLocalSession(sessionResource, model) {
    const workspace = this.workspaceContextService.getWorkspace();
    const defaultType = getDefaultNewChatSessionType(this.configurationService, this.chatSessionsService, this.storageService, workspace, this.agentHostEnablementService.enabled.get());
    return defaultType !== localChatSessionType && getChatSessionType(sessionResource) === localChatSessionType && !model.hasRequests;
  }
  async showModel(token, modelRef, startNewSession = true, ignoreTransferredSession = false, inputBeforeLoad) {
    const oldModelResource = this.modelRef.value?.object.sessionResource;
    this.modelRef.value = void 0;
    const baselineInput = inputBeforeLoad ?? this._widget?.getInput() ?? "";
    let ref;
    if (startNewSession) {
      if (modelRef) {
        ref = modelRef;
      } else if (!ignoreTransferredSession && this.chatService.transferredSessionResource) {
        ref = await this.chatService.acquireOrLoadSession(this.chatService.transferredSessionResource, ChatAgentLocation.Chat, token, "ChatViewPane#showModel");
      } else {
        ref = await this.acquireDefaultNewSession(token) ?? this.chatService.startNewLocalSession(ChatAgentLocation.Chat, { debugOwner: "ChatViewPane#showModel" });
      }
      if (!ref) {
        throw new Error("Could not start chat session");
      }
    }
    if (token.isCancellationRequested) {
      ref?.dispose();
      return void 0;
    }
    this.modelRef.value = ref;
    const model = ref?.object;
    if (model) {
      await this.updateWidgetLockState(getChatSessionType(model.sessionResource));
      if (token.isCancellationRequested) {
        this.modelRef.value = void 0;
        return void 0;
      }
      this.viewState.sessionResource = model.sessionResource;
    }
    if (model) {
      setModelPreservingInputTypedWhileLoading(this._widget, baselineInput, () => this._widget.setModel(model));
    } else {
      this._widget.setModel(model);
    }
    this.titleControl?.update(model);
    this.updateActions();
    if (oldModelResource) {
      const capturedOldResource = oldModelResource;
      this._register(disposableTimeout(() => {
        const oldSession = this.agentSessionsService.model.getSession(capturedOldResource);
        if (oldSession && !oldSession.isMarkedUnread()) {
          oldSession.setRead(true);
        }
      }, 0));
    }
    return model;
  }
  async updateWidgetLockState(sessionType) {
    if (sessionType === localChatSessionType) {
      this._widget.unlockFromCodingAgent();
      return;
    }
    let canResolve = false;
    try {
      canResolve = await this.chatSessionsService.canResolveChatSession(sessionType);
    } catch (error) {
      this.logService.warn(`Failed to resolve chat session type '${sessionType}' for locking`, error);
    }
    if (!canResolve) {
      this._widget.unlockFromCodingAgent();
      return;
    }
    const contribution = this.chatSessionsService.getChatSessionContribution(sessionType);
    if (contribution) {
      this._widget.lockToCodingAgent(contribution.name, contribution.displayName, sessionType, contribution.agentHostProviderId);
    } else {
      this._widget.unlockFromCodingAgent();
    }
  }
  async clear() {
    this.loadSessionCts.value?.cancel();
    this.updateViewState();
    await this.showModel(CancellationToken.None);
    this.updateActions();
  }
  async loadSession(sessionResource) {
    const t0 = Date.now();
    this.logService.trace(`[ChatViewPane] loadSession start uri=${sessionResource.toString()}`);
    const inputBeforeLoad = this._widget?.getInput() ?? "";
    this.loadSessionCts.value?.cancel();
    const cts = this.loadSessionCts.value = new CancellationTokenSource();
    const token = cts.token;
    if (this.restoringSession) {
      await this.restoringSession;
    }
    if (token.isCancellationRequested) {
      this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=preAcquire`);
      return void 0;
    }
    return this.progressService.withProgress({ location: ChatViewId, delay: 200 }, async () => {
      let queue = Promise.resolve();
      const clearWidget = disposableTimeout(() => {
        if (token.isCancellationRequested || this.loadSessionCts.value !== cts) {
          return;
        }
        queue = this.showModel(token, void 0, false).then(() => {
        });
      }, 100);
      const clearWidgetCancellationListener = token.onCancellationRequested(() => clearWidget.dispose());
      try {
        const newModelRef = await this.chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, token, "ChatViewPane#loadSession");
        clearWidget.dispose();
        await queue;
        if (token.isCancellationRequested) {
          newModelRef?.dispose();
          this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=postAcquire`);
          return void 0;
        }
        const result = await this.showModel(token, newModelRef, true, false, inputBeforeLoad);
        this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()}`);
        return result;
      } catch (err) {
        clearWidget.dispose();
        await queue;
        if (token.isCancellationRequested) {
          this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} cancelled=true phase=error`);
          return void 0;
        }
        this.logService.error(`Failed to load chat session '${sessionResource.toString()}'`, err);
        this.notificationService.error(localize("chat.loadSessionFailed", "Failed to open chat session: {0}", toErrorMessage(err)));
        const result = await this.showModel(token, void 0, true, false, inputBeforeLoad);
        this.logService.trace(`[ChatViewPane] loadSession done total=${Date.now() - t0}ms uri=${sessionResource.toString()} error=true`);
        return result;
      } finally {
        clearWidgetCancellationListener.dispose();
      }
    });
  }
  //#endregion
  focus() {
    super.focus();
    this.focusInput();
  }
  focusInput() {
    this._widget.focusInput();
  }
  focusSessions() {
    if (this.sessionsContainer?.style.display === "none") {
      return false;
    }
    this.sessionsControl?.focus();
    return true;
  }
  relayout() {
    if (!this._widget?.visible) {
      return;
    }
    if (this.lastDimensions) {
      this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
    }
  }
  relayoutForInputHeight() {
    if (this.layoutingBody || !this._widget?.visible || !this.lastDimensions) {
      return;
    }
    this.layoutChatAndSessions(this.lastDimensions.height, this.lastDimensions.width, false);
  }
  layoutBody(height, width) {
    if (this.layoutingBody) {
      return;
    }
    this.layoutingBody = true;
    try {
      this.doLayoutBody(height, width);
    } finally {
      this.layoutingBody = false;
    }
  }
  doLayoutBody(height, width) {
    super.layoutBody(height, width);
    this.lastDimensions = { height, width };
    this.layoutChatAndSessions(height, width, true);
  }
  layoutChatAndSessions(height, width, layoutInput) {
    let remainingHeight = height;
    const remainingWidth = width;
    const titleHeight = this.titleControl?.getHeight() ?? 0;
    remainingHeight -= titleHeight;
    const { heightReduction, widthReduction } = this.layoutSessionsControl(remainingHeight, remainingWidth);
    const inputMaxHeight = this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked ? remainingHeight : void 0;
    if (layoutInput) {
      this._widget.setInputPartMaxHeightOverride(inputMaxHeight);
      this._widget.layout(remainingHeight - heightReduction, remainingWidth - widthReduction);
    } else {
      layoutChatWidgetForInputHeight(this._widget, inputMaxHeight, remainingHeight - heightReduction, remainingWidth - widthReduction);
    }
    this.lastDimensionsPerOrientation.set(this.sessionsViewerOrientation, { height, width });
  }
  layoutSessionsControl(height, width) {
    let heightReduction = 0;
    let widthReduction = 0;
    if (!this.sessionsContainer || !this.sessionsControlContainer || !this.sessionsControl || !this.viewPaneContainer || !this.sessionsTitleContainer || !this.sessionsTitle) {
      return { heightReduction, widthReduction };
    }
    const oldSessionsViewerOrientation = this.sessionsViewerOrientation;
    let newSessionsViewerOrientation;
    switch (this.sessionsViewerOrientationConfiguration) {
      // Stacked
      case "stacked":
        newSessionsViewerOrientation = AgentSessionsViewerOrientation.Stacked;
        break;
      // Update orientation based on available width
      default:
        newSessionsViewerOrientation = width >= ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH ? AgentSessionsViewerOrientation.SideBySide : AgentSessionsViewerOrientation.Stacked;
    }
    this.sessionsViewerOrientation = newSessionsViewerOrientation;
    if (newSessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-sidebyside", true);
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-stacked", false);
      this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.SideBySide);
    } else {
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-sidebyside", false);
      this.viewPaneContainer.classList.toggle("sessions-control-orientation-stacked", true);
      this.sessionsViewerOrientationContext.set(AgentSessionsViewerOrientation.Stacked);
    }
    if (oldSessionsViewerOrientation !== this.sessionsViewerOrientation) {
      const updatePromise = this.sessionsControl.update();
      if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
        updatePromise.then((didUpdate) => {
          if (!didUpdate) {
            return;
          }
          const sessionResource = this._widget?.viewModel?.sessionResource;
          if (sessionResource) {
            this.sessionsControl?.reveal(sessionResource);
          }
        });
      }
    }
    const { visible: sessionsContainerVisible } = this.updateSessionsControlVisibility();
    if (!sessionsContainerVisible || this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
      this.sessionsViewerSashDisposables.clear();
      this.sessionsViewerSash = void 0;
    } else if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      if (!this.sessionsViewerSashDisposables.value && this.viewPaneContainer) {
        this.createSessionsViewerSash(this.viewPaneContainer, height, width);
      }
    }
    if (!sessionsContainerVisible) {
      return { heightReduction: 0, widthReduction: 0 };
    }
    let availableSessionsHeight = height - this.sessionsTitleContainer.offsetHeight;
    if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.Stacked) {
      availableSessionsHeight -= Math.max(ChatViewPane.MIN_CHAT_WIDGET_HEIGHT, this._widget?.input?.height.get() ?? 0);
    } else {
      availableSessionsHeight -= this.sessionsNewButtonContainer?.offsetHeight ?? 0;
    }
    if (this.sessionsViewerOrientation === AgentSessionsViewerOrientation.SideBySide) {
      const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(width);
      this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
      this.sessionsControlContainer.style.width = `${sessionsViewerSidebarWidth}px`;
      this.sessionsControl.layout(availableSessionsHeight, sessionsViewerSidebarWidth);
      this.sessionsViewerSash?.layout();
      heightReduction = 0;
      widthReduction = this.sessionsContainer.offsetWidth;
    } else {
      this.sessionsControlContainer.style.height = `${availableSessionsHeight}px`;
      this.sessionsControlContainer.style.width = ``;
      this.sessionsControl.layout(availableSessionsHeight, width);
      heightReduction = this.sessionsContainer.offsetHeight;
      widthReduction = 0;
    }
    return { heightReduction, widthReduction };
  }
  computeEffectiveSideBySideSessionsSidebarWidth(width, sessionsViewerSidebarWidth = this.sessionsViewerSidebarWidth) {
    return Math.max(
      ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH,
      // never smaller than min width for side by side sessions
      Math.min(
        sessionsViewerSidebarWidth,
        width - ChatViewPane.CHAT_WIDGET_DEFAULT_WIDTH
        // never so wide that chat widget is smaller than default width
      )
    );
  }
  getLastDimensions(orientation) {
    return this.lastDimensionsPerOrientation.get(orientation);
  }
  createSessionsViewerSash(container, height, width) {
    const disposables = this.sessionsViewerSashDisposables.value = new DisposableStore();
    const sash = this.sessionsViewerSash = disposables.add(new Sash(container, {
      getVerticalSashLeft: () => {
        const sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions?.width ?? width);
        const { position } = this.getViewPositionAndLocation();
        if (position === Position.RIGHT) {
          return (this.lastDimensions?.width ?? width) - sessionsViewerSidebarWidth;
        }
        return sessionsViewerSidebarWidth;
      }
    }, { orientation: Orientation.VERTICAL }));
    let sashStartWidth;
    disposables.add(sash.onDidStart(() => sashStartWidth = this.sessionsViewerSidebarWidth));
    disposables.add(sash.onDidEnd(() => sashStartWidth = void 0));
    disposables.add(sash.onDidChange((e) => {
      if (sashStartWidth === void 0 || !this.lastDimensions) {
        return;
      }
      const { position } = this.getViewPositionAndLocation();
      const delta = e.currentX - e.startX;
      const newWidth = position === Position.RIGHT ? sashStartWidth - delta : sashStartWidth + delta;
      if (newWidth < ChatViewPane.SESSIONS_SIDEBAR_SNAP_THRESHOLD) {
        this.updateConfiguredSessionsViewerOrientation("stacked");
        return;
      }
      this.sessionsViewerSidebarWidth = this.computeEffectiveSideBySideSessionsSidebarWidth(this.lastDimensions.width, newWidth);
      this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;
      this.layoutBody(this.lastDimensions.height, this.lastDimensions.width);
    }));
    disposables.add(sash.onDidReset(() => {
      this.sessionsViewerSidebarWidth = ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH;
      this.viewState.sessionsSidebarWidth = this.sessionsViewerSidebarWidth;
      this.relayout();
    }));
  }
  //#endregion
  saveState() {
    if (this._widget?.viewModel) {
      this._widget.saveState();
      this.updateViewState();
      this.memento.saveMemento();
    }
    super.saveState();
  }
  updateViewState(viewState) {
    const newViewState = viewState ?? this._widget.getViewState();
    if (newViewState) {
      for (const [key, value] of Object.entries(newViewState)) {
        this.viewState[key] = value;
      }
    }
  }
  shouldShowWelcome() {
    const noPersistedSessions = !this.chatService.hasSessions();
    const hasCoreAgent = this.chatAgentService.getAgents().some((agent) => agent.isCore && agent.locations.includes(ChatAgentLocation.Chat));
    const hasDefaultAgent = this.chatAgentService.getDefaultAgent(ChatAgentLocation.Chat) !== void 0;
    const shouldShow = !hasCoreAgent && (!hasDefaultAgent || !this._widget?.viewModel && noPersistedSessions);
    this.logService.trace(`ChatViewPane#shouldShowWelcome() = ${shouldShow}: hasCoreAgent=${hasCoreAgent} hasDefaultAgent=${hasDefaultAgent} || noViewModel=${!this._widget?.viewModel} && noPersistedSessions=${noPersistedSessions}`);
    return !!shouldShow;
  }
  getMatchingWelcomeView() {
    return this.welcomeController?.getMatchingWelcomeView();
  }
  getActionsContext() {
    return this._widget?.viewModel ? {
      sessionResource: this._widget.viewModel.sessionResource,
      $mid: MarshalledId.ChatViewContext
    } : void 0;
  }
};
//#endregion
//#region Sessions Control
ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH = 200;
ChatViewPane.SESSIONS_SIDEBAR_SNAP_THRESHOLD = ChatViewPane.SESSIONS_SIDEBAR_MIN_WIDTH / 2;
// snap to hide when dragged below half of minimum width
ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH = 300;
ChatViewPane.CHAT_WIDGET_DEFAULT_WIDTH = 300;
ChatViewPane.SESSIONS_SIDEBAR_VIEW_MIN_WIDTH = ChatViewPane.CHAT_WIDGET_DEFAULT_WIDTH + ChatViewPane.SESSIONS_SIDEBAR_DEFAULT_WIDTH;
//#endregion
//#region Chat Control
ChatViewPane.MIN_CHAT_WIDGET_HEIGHT = 116;
ChatViewPane = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IChatService),
  __decorateParam(12, IChatAgentService),
  __decorateParam(13, ILogService),
  __decorateParam(14, INotificationService),
  __decorateParam(15, IWorkbenchLayoutService),
  __decorateParam(16, IChatSessionsService),
  __decorateParam(17, ITelemetryService),
  __decorateParam(18, ILifecycleService),
  __decorateParam(19, IProgressService),
  __decorateParam(20, IAgentSessionsService),
  __decorateParam(21, IChatEntitlementService),
  __decorateParam(22, ICommandService),
  __decorateParam(23, IActivityService),
  __decorateParam(24, IHostService),
  __decorateParam(25, IMicCaptureService),
  __decorateParam(26, ITtsPlaybackService),
  __decorateParam(27, IVoiceSessionController),
  __decorateParam(28, IVoiceInputModeService),
  __decorateParam(29, IChatWidgetService),
  __decorateParam(30, IAgentTitleBarStatusService),
  __decorateParam(31, IVoicePlaybackService),
  __decorateParam(32, IWorkbenchEnvironmentService),
  __decorateParam(33, IWorkspaceContextService),
  __decorateParam(34, IAgentHostEnablementService),
  __decorateParam(35, IAccessibilityService)
], ChatViewPane);
export {
  ChatViewPane
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXRIb3N0cy92aWV3UGFuZS9jaGF0Vmlld1BhbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhdFZpZXdQYW5lLmNzcyc7XG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgRXZlbnRIZWxwZXIsIEV2ZW50VHlwZSwgZ2V0V2luZG93LCBzZXRWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiwgU2FzaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNYXJzaGFsbGVkSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZ0lkcy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEJ1dHRvblN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdUaXRsZUNvbnRyb2wgfSBmcm9tICcuL2NoYXRWaWV3VGl0bGVDb250cm9sLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBNZW1lbnRvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL21lbWVudG8uanMnO1xuaW1wb3J0IHsgU0lERV9CQVJfRk9SRUdST1VORCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIFN0YXJ0dXBLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNoYXRWaWV3VGl0bGVBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwsIElDaGF0TW9kZWxJbnB1dFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDSEFUX1BST1ZJREVSX0lEIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0UGFydGljaXBhbnRDb250cmliVHlwZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbFJlZmVyZW5jZSwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQ2hhdFNlc3Npb25VcmksIGdldENoYXRTZXNzaW9uVHlwZSwgaXNVbnRpdGxlZENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQsIGdldERlZmF1bHROZXdDaGF0U2Vzc2lvblJlc291cmNlLCBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb25zQ29udHJvbCB9IGZyb20gJy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0NvbnRyb2wuanMnO1xuaW1wb3J0IHsgQUNUSU9OX0lEX05FV19DSEFUIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0LCBsYXlvdXRDaGF0V2lkZ2V0Rm9ySW5wdXRIZWlnaHQgfSBmcm9tICcuLi8uLi93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld1dlbGNvbWVDb250cm9sbGVyLCBJVmlld1dlbGNvbWVEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL3ZpZXdzV2VsY29tZS9jaGF0Vmlld1dlbGNvbWVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElDaGF0Vmlld3NXZWxjb21lRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uL3ZpZXdzV2VsY29tZS9jaGF0Vmlld3NXZWxjb21lLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBMYXlvdXRTZXR0aW5ncywgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiwgQWdlbnRTZXNzaW9uc1ZpZXdlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXRTZXJ2aWNlLCBzZXRNb2RlbFByZXNlcnZpbmdJbnB1dFR5cGVkV2hpbGVMb2FkaW5nIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBQcm9ncmVzc0JhZGdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc0ZpbHRlciwgQWdlbnRTZXNzaW9uc0dyb3VwaW5nIH0gZnJvbSAnLi4vLi4vYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zRmlsdGVyLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnRDb250ZXh0S2V5cywgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElNaWNDYXB0dXJlU2VydmljZSB9IGZyb20gJy4uLy4uL3ZvaWNlQ2xpZW50L21pY0NhcHR1cmVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUdHNQbGF5YmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi92b2ljZUNsaWVudC90dHNQbGF5YmFja1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElWb2ljZUlucHV0TW9kZVNlcnZpY2UsIFNpbXVsYXRlZFZvaWNlU3RhdGUgfSBmcm9tICcuLi8uLi92b2ljZUlucHV0TW9kZS92b2ljZUlucHV0TW9kZS5qcyc7XG5pbXBvcnQgeyBpc0dsb3dpbmdWb2ljZVN0YXRlLCByZWFkVm9pY2VHbG93SW50ZW5zaXR5LCByZXNvbHZlVm9pY2VHbG93Q29sb3JzLCBWb2ljZUdsb3dTdGF0ZSB9IGZyb20gJy4uLy4uL3ZvaWNlQ2xpZW50L3ZvaWNlR2xvdy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVWb2ljZUdsb3dDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vdm9pY2VDbGllbnQvdm9pY2VHbG93Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBjb21iaW5lVm9pY2VJbnB1dCB9IGZyb20gJy4uLy4uL3ZvaWNlQ2xpZW50L3ZvaWNlSW5wdXRVdGlscy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL2FnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElWb2ljZVBsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92b2ljZVBsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWT0lDRV9BR0VOVF9QUk9HUkVTU19TRVRUSU5HIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZvaWNlQ2xpZW50L3ZvaWNlQ2xpZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJQ2hhdFZpZXdQYW5lU3RhdGUgZXh0ZW5kcyBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPiB7XG5cdC8qKlxuXHQgKiBAZGVwcmVjYXRlZCBUaGlzIGlzIGtlcHQgYXJvdW5kIHRvIHN1cHBvcnQgb2xkIHZpZXcgc3RhdGVzLiBIb3dldmVyIGl0IHNob3VsZCBub3QgYmUgc2V0IG9uIG5ldyBzdGF0ZXMgYW5kIGBzZXNzaW9uUmVzb3VyY2VgIHNob3VsZCBiZSB1c2VkIGluc3RlYWQuXG5cdCAqL1xuXHRzZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdHNlc3Npb25SZXNvdXJjZT86IFVSSTtcblxuXHRzZXNzaW9uc1NpZGViYXJXaWR0aD86IG51bWJlcjtcbn1cblxudHlwZSBDaGF0Vmlld1BhbmVPcGVuZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYmF0dGVuJztcblx0Y29tbWVudDogJ0V2ZW50IGZpcmVkIHdoZW4gdGhlIGNoYXQgdmlldyBwYW5lIGlzIG9wZW5lZCc7XG59O1xuXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXdQYW5lIGV4dGVuZHMgVmlld1BhbmUgaW1wbGVtZW50cyBJVmlld1dlbGNvbWVEZWxlZ2F0ZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtZW1lbnRvOiBNZW1lbnRvPElDaGF0Vmlld1BhbmVTdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld1N0YXRlOiBJQ2hhdFZpZXdQYW5lU3RhdGU7XG5cblx0cHJpdmF0ZSB2aWV3UGFuZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhdFZpZXdMb2NhdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PFZpZXdDb250YWluZXJMb2NhdGlvbj47XG5cblx0cHJpdmF0ZSBsYXN0RGltZW5zaW9uczogeyBoZWlnaHQ6IG51bWJlcjsgd2lkdGg6IG51bWJlciB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGxhc3REaW1lbnNpb25zUGVyT3JpZW50YXRpb246IE1hcDxBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24sIHsgaGVpZ2h0OiBudW1iZXI7IHdpZHRoOiBudW1iZXIgfT4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSB3ZWxjb21lQ29udHJvbGxlcjogQ2hhdFZpZXdXZWxjb21lQ29udHJvbGxlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlc3RvcmluZ1Nlc3Npb246IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbG9hZFNlc3Npb25DdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hcHBseU1vZGVsQ3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpKTtcblx0LyoqIFdoaWxlID4gMCB0aGUgc2Vzc2lvbnMgbGlzdCBpcyBzdXBwcmVzc2VkIHNvIGEgc2Vzc2lvbiB0cmFuc2l0aW9uJ3MgdHJhbnNpZW50bHktZW1wdHkgd2lkZ2V0IGRvZXMgbm90IHJldmVhbCBpdCAoc2VlIHtAbGluayBiZWdpblNlc3Npb25zTGlzdFN1cHByZXNzaW9ufSkuICovXG5cdHByaXZhdGUgX3Nlc3Npb25zTGlzdFN1cHByZXNzaW9uQ291bnQgPSAwO1xuXHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsUmVmID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElDaGF0TW9kZWxSZWZlcmVuY2U+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlCYWRnZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VycmVudFNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkkgfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCk7XG5cdC8qKlxuXHQgKiBTZXNzaW9uIHJlc291cmNlIG9mIHRoZSBsYXN0LWZvY3VzZWQgY2hhdCB3aWRnZXQsIG9yIHRoaXMgcGFuZSdzIG93blxuXHQgKiBzZXNzaW9uIHdoZW4gbm8gY2hhdCB3aWRnZXQgaXMgZm9jdXNlZC4gVXNlZCB0byBiaW5kIHRoZSB2b2ljZSBnbG93IC9cblx0ICogdHJhbnNjcmlwdCB0byB0aGUgc2luZ2xlIGlucHV0IHZvaWNlIHRhcmdldHMsIHNvIHdpdGggc2V2ZXJhbCBjaGF0IGlucHV0c1xuXHQgKiBvcGVuIChlLmcuIHRoaXMgcGFuZSBwbHVzIGEgY2hhdCBlZGl0b3IpIG9ubHkgdGhlIGZvY3VzZWQgb25lIGxpZ2h0cyB1cC5cblx0ICovXG5cdHByaXZhdGUgX2ZvY3VzZWRTZXNzaW9uUmVzb3VyY2UhOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTI6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASUFnZW50U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRTZXNzaW9uc1NlcnZpY2U6IElBZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASU1pY0NhcHR1cmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWljQ2FwdHVyZVNlcnZpY2U6IElNaWNDYXB0dXJlU2VydmljZSxcblx0XHRASVR0c1BsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR0c1BsYXliYWNrU2VydmljZTogSVR0c1BsYXliYWNrU2VydmljZSxcblx0XHRASVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgcHJpdmF0ZSByZWFkb25seSB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASVZvaWNlSW5wdXRNb2RlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZvaWNlSW5wdXRNb2RlU2VydmljZTogSVZvaWNlSW5wdXRNb2RlU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlIF9hZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZTogSUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJVm9pY2VQbGF5YmFja1NlcnZpY2UgX3ZvaWNlUGxheWJhY2tTZXJ2aWNlOiBJVm9pY2VQbGF5YmFja1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgX3dvcmtiZW5jaEVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UyLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gVmlldyBzdGF0ZSBmb3IgdGhlIFZpZXdQYW5lIGlzIGN1cnJlbnRseSBnbG9iYWwgcGVyLXByb3ZpZGVyIGJhc2ljYWxseSxcblx0XHQvLyBidXQgc29tZSBvdGhlciBzdHJpY3RseSBwZXItbW9kZWwgc3RhdGUgd2lsbCByZXF1aXJlIGEgc2VwYXJhdGUgbWVtZW50by5cblx0XHR0aGlzLm1lbWVudG8gPSBuZXcgTWVtZW50byhgaW50ZXJhY3RpdmUtc2Vzc2lvbi12aWV3LSR7Q0hBVF9QUk9WSURFUl9JRH1gLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLnZpZXdTdGF0ZSA9IHRoaXMubWVtZW50by5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0aWYgKFxuXHRcdFx0bGlmZWN5Y2xlU2VydmljZS5zdGFydHVwS2luZCAhPT0gU3RhcnR1cEtpbmQuUmVsb2FkZWRXaW5kb3cgJiZcblx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uUmVzdG9yZUxhc3RQYW5lbFNlc3Npb24pID09PSBmYWxzZVxuXHRcdCkge1xuXHRcdFx0Ly8gY2xlYXIgcGVyc2lzdGVkIHNlc3Npb24gb24gZnJlc2ggc3RhcnRcblx0XHRcdHRoaXMudmlld1N0YXRlLnNlc3Npb25JZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMudmlld1N0YXRlLnNlc3Npb25SZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclZpc2libGUgPSBmYWxzZTsgLy8gd2lsbCBiZSB1cGRhdGVkIGZyb20gbGF5b3V0IGNvZGVcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoID0gTWF0aC5tYXgoQ2hhdFZpZXdQYW5lLlNFU1NJT05TX1NJREVCQVJfTUlOX1dJRFRILCB0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uc1NpZGViYXJXaWR0aCA/PyBDaGF0Vmlld1BhbmUuU0VTU0lPTlNfU0lERUJBUl9ERUZBVUxUX1dJRFRIKTtcblxuXHRcdC8vIENvbnRleHRrZXlzXG5cdFx0dGhpcy5jaGF0Vmlld0xvY2F0aW9uQ29udGV4dCA9IENoYXRDb250ZXh0S2V5cy5wYW5lbExvY2F0aW9uLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29udGV4dCA9IENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyUG9zaXRpb25Db250ZXh0ID0gQ2hhdENvbnRleHRLZXlzLmFnZW50U2Vzc2lvbnNWaWV3ZXJQb3NpdGlvbi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJWaXNpYmlsaXR5Q29udGV4dCA9IENoYXRDb250ZXh0S2V5cy5hZ2VudFNlc3Npb25zVmlld2VyVmlzaWJsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy51cGRhdGVDb250ZXh0S2V5cygpO1xuXG5cdFx0Ly8gVHJhY2tzIHRoZSBzZXNzaW9uIG9mIHRoZSBsYXN0LWZvY3VzZWQgY2hhdCB3aWRnZXQgc28gdGhlIHZvaWNlIFVJIGNhblxuXHRcdC8vIGJpbmQgdG8gZXhhY3RseSBvbmUgaW5wdXQgZXZlbiB3aGVuIHNldmVyYWwgYXJlIG9wZW4uXG5cdFx0dGhpcy5fZm9jdXNlZFNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbixcblx0XHRcdCgpID0+IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgeyBwb3NpdGlvbiwgbG9jYXRpb24gfSA9IHRoaXMuZ2V0Vmlld1Bvc2l0aW9uQW5kTG9jYXRpb24oKTtcblxuXHRcdHRoaXMuY2hhdFZpZXdMb2NhdGlvbkNvbnRleHQuc2V0KGxvY2F0aW9uID8/IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpO1xuXHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbkNvbnRleHQuc2V0KHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbik7XG5cdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclBvc2l0aW9uQ29udGV4dC5zZXQocG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUID8gQWdlbnRTZXNzaW9uc1ZpZXdlclBvc2l0aW9uLlJpZ2h0IDogQWdlbnRTZXNzaW9uc1ZpZXdlclBvc2l0aW9uLkxlZnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3UG9zaXRpb25BbmRMb2NhdGlvbigpOiB7IHBvc2l0aW9uOiBQb3NpdGlvbjsgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiB9IHtcblx0XHRjb25zdCB2aWV3TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpO1xuXHRcdGNvbnN0IHNpZGVCYXJQb3NpdGlvbiA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKTtcblx0XHRjb25zdCBwYW5lbFBvc2l0aW9uID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldFBhbmVsUG9zaXRpb24oKTtcblxuXHRcdGxldCBzaWRlU2Vzc2lvbnNPblJpZ2h0UG9zaXRpb246IGJvb2xlYW47XG5cdFx0c3dpdGNoICh2aWV3TG9jYXRpb24pIHtcblx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXI6XG5cdFx0XHRcdHNpZGVTZXNzaW9uc09uUmlnaHRQb3NpdGlvbiA9IHNpZGVCYXJQb3NpdGlvbiA9PT0gUG9zaXRpb24uUklHSFQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWw6XG5cdFx0XHRcdHNpZGVTZXNzaW9uc09uUmlnaHRQb3NpdGlvbiA9IHBhbmVsUG9zaXRpb24gIT09IFBvc2l0aW9uLkxFRlQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0c2lkZVNlc3Npb25zT25SaWdodFBvc2l0aW9uID0gc2lkZUJhclBvc2l0aW9uID09PSBQb3NpdGlvbi5MRUZUO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cG9zaXRpb246IHNpZGVTZXNzaW9uc09uUmlnaHRQb3NpdGlvbiA/IFBvc2l0aW9uLlJJR0hUIDogUG9zaXRpb24uTEVGVCxcblx0XHRcdGxvY2F0aW9uOiB2aWV3TG9jYXRpb24gPz8gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcixcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXNzaW9uSG92ZXJQb3NpdGlvbigpIHtcblx0XHRjb25zdCB2aWV3TG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHRoaXMuaWQpO1xuXHRcdGNvbnN0IHNpZGVCYXJQb3NpdGlvbiA9IHRoaXMubGF5b3V0U2VydmljZS5nZXRTaWRlQmFyUG9zaXRpb24oKTtcblxuXHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlKSB7XG5cdFx0XHRyZXR1cm4gdmlld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciAmJiBzaWRlQmFyUG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUID8gSG92ZXJQb3NpdGlvbi5MRUZUIDogSG92ZXJQb3NpdGlvbi5SSUdIVDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0W1Bvc2l0aW9uLkxFRlRdOiBIb3ZlclBvc2l0aW9uLlJJR0hULFxuXHRcdFx0W1Bvc2l0aW9uLlJJR0hUXTogSG92ZXJQb3NpdGlvbi5MRUZULFxuXHRcdFx0W1Bvc2l0aW9uLlRPUF06IEhvdmVyUG9zaXRpb24uQkVMT1csXG5cdFx0XHRbUG9zaXRpb24uQk9UVE9NXTogSG92ZXJQb3NpdGlvbi5BQk9WRVxuXHRcdH1bdmlld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgPyB0aGlzLmxheW91dFNlcnZpY2UuZ2V0UGFuZWxQb3NpdGlvbigpIDogc2lkZUJhclBvc2l0aW9uXTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVmlld1BhbmVDbGFzc2VzKGZyb21FdmVudDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2aXR5QmFyTG9jYXRpb25EZWZhdWx0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KExheW91dFNldHRpbmdzLkFDVElWSVRZX0JBUl9MT0NBVElPTikgPT09ICdkZWZhdWx0Jztcblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdhY3Rpdml0eS1iYXItbG9jYXRpb24tZGVmYXVsdCcsIGFjdGl2aXR5QmFyTG9jYXRpb25EZWZhdWx0KTtcblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyPy5jbGFzc0xpc3QudG9nZ2xlKCdhY3Rpdml0eS1iYXItbG9jYXRpb24tb3RoZXInLCAhYWN0aXZpdHlCYXJMb2NhdGlvbkRlZmF1bHQpO1xuXG5cdFx0Y29uc3QgeyBwb3NpdGlvbiwgbG9jYXRpb24gfSA9IHRoaXMuZ2V0Vmlld1Bvc2l0aW9uQW5kTG9jYXRpb24oKTtcblxuXHRcdHRoaXMudmlld1BhbmVDb250YWluZXI/LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdmlldy1sb2NhdGlvbi1hdXhpbGlhcnliYXInLCBsb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC12aWV3LWxvY2F0aW9uLXNpZGViYXInLCBsb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdHRoaXMudmlld1BhbmVDb250YWluZXI/LmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtdmlldy1sb2NhdGlvbi1wYW5lbCcsIGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC12aWV3LXBvc2l0aW9uLWxlZnQnLCBwb3NpdGlvbiA9PT0gUG9zaXRpb24uTEVGVCk7XG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lcj8uY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC12aWV3LXBvc2l0aW9uLXJpZ2h0JywgcG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUKTtcblxuXHRcdGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gQWdlbnQgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdEFnZW50U2VydmljZS5vbkRpZENoYW5nZUFnZW50cygoKSA9PiB0aGlzLm9uRGlkQ2hhbmdlQWdlbnRzKCkpKTtcblxuXHRcdC8vIFNlc3Npb24gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5vbkRpZENvbW1pdFNlc3Npb24oYXN5bmMgKGUpID0+IHtcblx0XHRcdGlmICghdGhpcy5tb2RlbFJlZi52YWx1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXNFcXVhbChlLm9yaWdpbmFsLCB0aGlzLm1vZGVsUmVmLnZhbHVlLm9iamVjdC5zZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKGUuY29tbWl0dGVkLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnQ2hhdFZpZXdQYW5lI29uRGlkQ29tbWl0U2Vzc2lvbicpO1xuXHRcdFx0YXdhaXQgdGhpcy5zaG93TW9kZWwoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSwgbW9kZWxSZWYpO1xuXHRcdH0pKTtcblxuXHRcdC8vIExheW91dCBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuYW55KFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3dvcmtiZW5jaC5zaWRlQmFyLmxvY2F0aW9uJykpLFxuXHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFuZWxQb3NpdGlvbixcblx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZUNvbnRhaW5lckxvY2F0aW9uLCBlID0+IGUudmlld0NvbnRhaW5lciA9PT0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHRoaXMuaWQpKVxuXHRcdCkoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZXh0S2V5cygpO1xuXHRcdFx0dGhpcy51cGRhdGVWaWV3UGFuZUNsYXNzZXModHJ1ZSAvKiBsYXlvdXQgaGVyZSAqLyk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU2V0dGluZ3MgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiB7XG5cdFx0XHRyZXR1cm4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihMYXlvdXRTZXR0aW5ncy5BQ1RJVklUWV9CQVJfTE9DQVRJT04pO1xuXHRcdH0pKCgpID0+IHRoaXMudXBkYXRlVmlld1BhbmVDbGFzc2VzKHRydWUpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQWdlbnRzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKSB7XG5cdFx0XHRpZiAoIXRoaXMuX3dpZGdldD8udmlld01vZGVsICYmICF0aGlzLnJlc3RvcmluZ1Nlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5yZXN0b3JpbmdTZXNzaW9uID1cblx0XHRcdFx0XHR0aGlzLmFjcXVpcmVUcmFuc2ZlcnJlZE9yUGVyc2lzdGVkU2Vzc2lvbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnQ2hhdFZpZXdQYW5lI29uRGlkQ2hhbmdlQWdlbnRzJykudGhlbihhc3luYyBtb2RlbFJlZiA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuX3dpZGdldCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47IC8vIHJlbmRlckJvZHkgaGFzIG5vdCBiZWVuIGNhbGxlZCB5ZXRcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gVGhlIHdpZGdldCBtYXkgYmUgaGlkZGVuIGF0IHRoaXMgcG9pbnQsIGJlY2F1c2Ugd2VsY29tZSB2aWV3cyB3ZXJlIGFsbG93ZWQuIFVzZSBzZXRWaXNpYmxlIHRvXG5cdFx0XHRcdFx0XHQvLyBhdm9pZCBkb2luZyBhIHJlbmRlciB3aGlsZSB0aGUgd2lkZ2V0IGlzIGhpZGRlbi4gVGhpcyBpcyBjaGFuZ2luZyB0aGUgY29uZGl0aW9uIGluIGBzaG91bGRTaG93V2VsY29tZWBcblx0XHRcdFx0XHRcdC8vIHNvIGl0IHNob3VsZCBmaXJlIG9uRGlkQ2hhbmdlVmlld1dlbGNvbWVTdGF0ZS5cblx0XHRcdFx0XHRcdGNvbnN0IHdhc1Zpc2libGUgPSB0aGlzLl93aWRnZXQudmlzaWJsZTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRWaXNpYmxlKGZhbHNlKTtcblxuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnNob3dNb2RlbChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCBtb2RlbFJlZiwgdHJ1ZSwgIW1vZGVsUmVmKTtcblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRWaXNpYmxlKHdhc1Zpc2libGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMucmVzdG9yaW5nU2Vzc2lvbi5maW5hbGx5KCgpID0+IHRoaXMucmVzdG9yaW5nU2Vzc2lvbiA9IHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VWaWV3V2VsY29tZVN0YXRlLmZpcmUoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VHJhbnNmZXJyZWRPclBlcnNpc3RlZFNlc3Npb25JbmZvKCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuY2hhdFNlcnZpY2UudHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLmNoYXRTZXJ2aWNlLnRyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudmlld1N0YXRlLnNlc3Npb25JZCA/IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbih0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uSWQpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckJvZHkocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlckJvZHkocGFyZW50KTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPHt9LCBDaGF0Vmlld1BhbmVPcGVuZWRDbGFzc2lmaWNhdGlvbj4oJ2NoYXRWaWV3UGFuZU9wZW5lZCcpO1xuXG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lciA9IHBhcmVudDtcblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NoYXQtdmlld3BhbmUnKTtcblx0XHR0aGlzLnVwZGF0ZVZpZXdQYW5lQ2xhc3NlcyhmYWxzZSk7XG5cblx0XHQvLyBDb250cm9scyB3cmFwcGVyIFx1MjAxNCBzZXNzaW9ucyArIGNoYXQgbGl2ZSBpbnNpZGUgaGVyZVxuXHRcdGNvbnN0IGNvbnRyb2xzV3JhcHBlciA9IGFwcGVuZChwYXJlbnQsICQoJy52b2ljZS1hZ2VudC1jb250cm9scy13cmFwcGVyJykpO1xuXHRcdHRoaXMuY3JlYXRlQ29udHJvbHMoY29udHJvbHNXcmFwcGVyKTtcblxuXHRcdC8vIFZvaWNlIGJhciBcdTIwMTQgaGlkZGVuIGJ5IGRlZmF1bHQsIHZvaWNlIGlzIGFjdGl2YXRlZCB2aWEgbWljIGJ1dHRvbiBpbiB0b29sYmFyLlxuXHRcdC8vIFRoZSB3aWRnZXQgaXMgc3RpbGwgY3JlYXRlZCBmb3IgUFRUIGtleWJpbmRpbmcgc3VwcG9ydCBhbmQgc2Vzc2lvbiBiaW5kaW5nLlxuXHRcdHRoaXMuX3ZvaWNlQmFyQ29udGFpbmVyID0gJCgnLnZvaWNlLWFnZW50LWJhci1ob3N0Jyk7XG5cdFx0dGhpcy5fdm9pY2VCYXJDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR0aGlzLl91cGRhdGVWb2ljZUJhcih0aGlzLl92b2ljZUJhckNvbnRhaW5lcik7XG5cblx0XHQvLyBUcmFuc2NyaXB0IG92ZXJsYXkgXHUyMDE0IHNob3duIGluc2lkZSB0aGUgaW5wdXQgY29udGFpbmVyIHdoZW4gdm9pY2UgaXMgYWN0aXZlXG5cdFx0Y29uc3QgaW5wdXRDb250YWluZXJFbCA9IHRoaXMuX3dpZGdldC5pbnB1dFBhcnQuaW5wdXRDb250YWluZXJFbGVtZW50O1xuXHRcdGlmIChpbnB1dENvbnRhaW5lckVsKSB7XG5cdFx0XHR0aGlzLl9zZXR1cFZvaWNlVHJhbnNjcmlwdE92ZXJsYXkoaW5wdXRDb250YWluZXJFbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLmVuYWJsZWQnKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVWb2ljZUJhcih0aGlzLl92b2ljZUJhckNvbnRhaW5lciEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2V0dXBDb250ZXh0TWVudShwYXJlbnQpO1xuXG5cdFx0dGhpcy5hcHBseU1vZGVsKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbnRyb2xzKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblxuXHRcdC8vIFNlc3Npb25zIENvbnRyb2xcblx0XHRjb25zdCBzZXNzaW9uc0NvbnRyb2wgPSB0aGlzLmNyZWF0ZVNlc3Npb25zQ29udHJvbChwYXJlbnQpO1xuXG5cdFx0Ly8gV2VsY29tZSBDb250cm9sICh1c2VkIHRvIHNob3cgY2hhdCBzcGVjaWZpYyBleHRlbnNpb24gcHJvdmlkZWQgd2VsY29tZSB2aWV3cyB2aWEgYGNoYXRWaWV3c1dlbGNvbWVgIGNvbnRyaWJ1dGlvbiBwb2ludClcblx0XHRjb25zdCB3ZWxjb21lQ29udHJvbGxlciA9IHRoaXMud2VsY29tZUNvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRWaWV3V2VsY29tZUNvbnRyb2xsZXIsIHBhcmVudCwgdGhpcywgQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXG5cdFx0Ly8gQ2hhdCBDb250cm9sXG5cdFx0Y29uc3QgY2hhdFdpZGdldCA9IHRoaXMuY3JlYXRlQ2hhdENvbnRyb2wocGFyZW50KTtcblxuXHRcdC8vIENvbnRyb2xzIExpc3RlbmVyc1xuXHRcdHRoaXMucmVnaXN0ZXJDb250cm9sc0xpc3RlbmVycyhzZXNzaW9uc0NvbnRyb2wsIGNoYXRXaWRnZXQsIHdlbGNvbWVDb250cm9sbGVyKTtcblxuXHRcdC8vIFVwZGF0ZSBzZXNzaW9ucyBjb250cm9sIHZpc2liaWxpdHkgd2hlbiBhbGwgY29udHJvbHMgYXJlIGNyZWF0ZWRcblx0XHR0aGlzLnVwZGF0ZVNlc3Npb25zQ29udHJvbFZpc2liaWxpdHkoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBWb2ljZSBBZ2VudCBCYXJcblxuXHRwcml2YXRlIF92b2ljZUJhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZvaWNlQmFyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgX3VwZGF0ZVZvaWNlQmFyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl92b2ljZUJhckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbigpO1xuXG5cdFx0Ly8gQWx3YXlzIGtlZXAgdGhlIGNvbnRhaW5lciBoaWRkZW4gXHUyMDE0IHZvaWNlIFVJIGlzIG5vdyB0aGUgbWljIHRvb2xiYXJcblx0XHQvLyBidXR0b24gKyB0cmFuc2NyaXB0IG92ZXJsYXkuIFdlIHN0aWxsIHJlZ2lzdGVyIHRoZSBjb21tYW5kIGJyaWRnZXNcblx0XHQvLyBuZWVkZWQgYnkgVm9pY2VTZXNzaW9uQ29udHJvbGxlci5cblx0XHRjb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdhZ2VudHMudm9pY2UuZW5hYmxlZCcpKSB7XG5cdFx0XHQvLyBWb2ljZSBjb21tYW5kIGJyaWRnZSBcdTIwMTQgbGV0cyB0aGUgVm9pY2VTZXNzaW9uQ29udHJvbGxlciByZWFjaCBpbnRvIHRoZSBjaGF0IHdpZGdldFxuXHRcdFx0dGhpcy5fdm9pY2VCYXJEaXNwb3NhYmxlcy5hZGQoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19jaGF0LnZvaWNlLmFjY2VwdElucHV0JywgKGFjY2Vzc29yLCB0ZXh0OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRcdFx0Ly8gSWdub3JlIGxhc3RGb2N1c2VkV2lkZ2V0IHdoZW4gaXRzIGlucHV0IG5vIGxvbmdlciBoYXMgZm9jdXMgYmVjYXVzZSBibHVyIGRvZXMgbm90IGNsZWFyIGl0LlxuXHRcdFx0XHRjb25zdCBmb2N1c2VkV2lkZ2V0ID0gY2hhdFdpZGdldFNlcnZpY2UubGFzdEZvY3VzZWRXaWRnZXQ7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IGZvY3VzZWRXaWRnZXQ/Lmhhc0lucHV0Rm9jdXMoKSA/IGZvY3VzZWRXaWRnZXQgOiB0aGlzLl93aWRnZXQ7XG5cdFx0XHRcdGlmICh0ZXh0ICYmIHdpZGdldD8udmlld01vZGVsKSB7XG5cdFx0XHRcdFx0aWYgKHdpZGdldC52aWV3TW9kZWwuZWRpdGluZykge1xuXHRcdFx0XHRcdFx0Ly8gV2hlbiBlZGl0aW5nIGFuIG9sZCBtZXNzYWdlLCBwb3B1bGF0ZSB0aGUgYWN0aXZlIGlucHV0XG5cdFx0XHRcdFx0XHQvLyBlZGl0b3Igc28gdGhlIHVzZXIgY2FuIHJldmlldyBiZWZvcmUgc3VibWl0dGluZy5cblx0XHRcdFx0XHRcdHdpZGdldC5pbnB1dC5zZXRWYWx1ZSh0ZXh0LCBmYWxzZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFByZXNlcnZlIGFueSB0ZXh0IHRoZSB1c2VyIGFscmVhZHkgdHlwZWQgaW4gdGhlIGlucHV0LlxuXHRcdFx0XHRcdFx0cmV0dXJuIHdpZGdldC5hY2NlcHRJbnB1dChjb21iaW5lVm9pY2VJbnB1dCh3aWRnZXQuZ2V0SW5wdXQoKSwgdGV4dCksIHtcblx0XHRcdFx0XHRcdFx0cHJlc2VydmVGb2N1czogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0aXNWb2ljZU1vZGVJbnB1dDogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihWT0lDRV9BR0VOVF9QUk9HUkVTU19TRVRUSU5HKSA9PT0gdHJ1ZSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fdm9pY2VCYXJEaXNwb3NhYmxlcy5hZGQoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ19jaGF0LnZvaWNlLnN3aXRjaFRvU2Vzc2lvbicsIGFzeW5jIChfYWNjZXNzb3IsIHJlc291cmNlU3RyOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+ID0+IHtcblx0XHRcdFx0aWYgKCFyZXNvdXJjZVN0cikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKHJlc291cmNlU3RyKTtcblx0XHRcdFx0XHR0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uUmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHRcdFx0XHR0aGlzLmFwcGx5TW9kZWwoKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnJlc3RvcmluZ1Nlc3Npb247XG5cdFx0XHRcdFx0Y29uc3QgcmVzdG9yZWRSZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0cmV0dXJuICEhcmVzdG9yZWRSZXNvdXJjZSAmJiBpc0VxdWFsKHJlc3RvcmVkUmVzb3VyY2UsIHJlc291cmNlKTtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl92b2ljZUJhckRpc3Bvc2FibGVzLmFkZChDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnX2NoYXQudm9pY2UuZ2V0Q3VycmVudFNlc3Npb24nLCAoX2FjY2Vzc29yKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U/LnRvU3RyaW5nKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzaW5nbGUgY2hhdCBpbnB1dCB2b2ljZSBtb2RlIGlzIGN1cnJlbnRseSBib3VuZCB0by4gTWlycm9ycyB0aGUgcm91dGluZ1xuXHQgKiB1c2VkIGJ5IGBfY2hhdC52b2ljZS5hY2NlcHRJbnB1dGA6IGFuIGV4cGxpY2l0IHRhcmdldCBzZXNzaW9uIChzZXQgYnkgdGhlXG5cdCAqIGZsb2F0aW5nIGF1eCB3aW5kb3cpIHdpbnMsIG90aGVyd2lzZSB0aGUgbGFzdC1mb2N1c2VkIGNoYXQgd2lkZ2V0J3Mgc2Vzc2lvbixcblx0ICogZmFsbGluZyBiYWNrIHRvIHRoaXMgcGFuZSdzIG93biBzZXNzaW9uLiBUaGUgZ2xvdyAvIHRyYW5zY3JpcHQgcmVuZGVyIG9ubHkgb25cblx0ICogdGhlIHBhbmUgd2hvc2Ugc2Vzc2lvbiBtYXRjaGVzIHRoaXMsIHNvIHdpdGggc2V2ZXJhbCBjaGF0IGlucHV0cyBvcGVuIChlLmcuXG5cdCAqIHRoaXMgcGFuZSBwbHVzIGEgY2hhdCBlZGl0b3IpIGV4YWN0bHkgb25lIGxpZ2h0cyB1cC5cblx0ICovXG5cdHByaXZhdGUgX2N1cnJlbnRWb2ljZUlucHV0UmVzb3VyY2UocmVhZGVyPzogSVJlYWRlcik6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gcmVhZGVyID8gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnRhcmdldFNlc3Npb24ucmVhZChyZWFkZXIpIDogdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnRhcmdldFNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKHRhcmdldCkge1xuXHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHJlYWRlciA/IHRoaXMuX2ZvY3VzZWRTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpIDogdGhpcy5fZm9jdXNlZFNlc3Npb25SZXNvdXJjZS5nZXQoKTtcblx0XHRyZXR1cm4gZm9jdXNlZCA/PyB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBWb2ljZVRyYW5zY3JpcHRPdmVybGF5KGlucHV0Q29udGFpbmVyRWw6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aW5wdXRDb250YWluZXJFbC5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0Y29uc3Qgc2hvd1RyYW5zY3JpcHRTZXR0aW5nID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdHRoaXMsXG5cdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLnNob3dUcmFuc2NyaXB0JykpLFxuXHRcdFx0KCkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignYWdlbnRzLnZvaWNlLnNob3dUcmFuc2NyaXB0JykgIT09IGZhbHNlXG5cdFx0KTtcblx0XHRjb25zdCBzaG93TGl2ZVRyYW5zY3JpcHRTZXR0aW5nID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdHRoaXMsXG5cdFx0XHRFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbignYWdlbnRzLnZvaWNlLmxpdmVUcmFuc2NyaXB0JykpLFxuXHRcdFx0KCkgPT4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignYWdlbnRzLnZvaWNlLmxpdmVUcmFuc2NyaXB0JykgIT09IGZhbHNlXG5cdFx0KTtcblx0XHRjb25zdCB0cmFuc2NyaXB0T3ZlcmxheSA9ICQoJy52b2ljZS10cmFuc2NyaXB0LW92ZXJsYXknKTtcblx0XHRjb25zdCB0cmFuc2NyaXB0U2Nyb2xsYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21TY3JvbGxhYmxlRWxlbWVudCh0cmFuc2NyaXB0T3ZlcmxheSwge1xuXHRcdFx0aG9yaXpvbnRhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvLFxuXHRcdH0pKTtcblx0XHRjb25zdCB0cmFuc2NyaXB0T3ZlcmxheU5vZGUgPSB0cmFuc2NyaXB0U2Nyb2xsYWJsZS5nZXREb21Ob2RlKCk7XG5cdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLmNsYXNzTGlzdC5hZGQoJ3ZvaWNlLXRyYW5zY3JpcHQtb3ZlcmxheS1zY3JvbGxhYmxlJyk7XG5cdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0aW5wdXRDb250YWluZXJFbC5hcHBlbmQodHJhbnNjcmlwdE92ZXJsYXlOb2RlKTtcblxuXHRcdC8vIER5bmFtaWMgYXVkaW8tcmVhY3RpdmUgZ2xvdyBhbmltYXRpb24gKG1hdGNoZXMgYXV4IHdpbmRvdyBiZWhhdmlvcilcblx0XHRsZXQgYW5pbUZyYW1lSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBnbG93RGF0YUFycmF5UmVmOiB7IHZhbHVlOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkIH0gPSB7IHZhbHVlOiB1bmRlZmluZWQgfTtcblx0XHRjb25zdCB3aW4gPSBnZXRXaW5kb3coaW5wdXRDb250YWluZXJFbCk7XG5cdFx0Y29uc3QgZ2xvd0NvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVWb2ljZUdsb3dDb250cm9sbGVyKFxuXHRcdFx0aW5wdXRDb250YWluZXJFbCxcblx0XHRcdCgpID0+IGlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkgPyAnZGFyaycgOiAnbGlnaHQnLFxuXHRcdFx0KCkgPT4gcmVzb2x2ZVZvaWNlR2xvd0NvbG9ycyh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiBnbG93Q29udHJvbGxlci5yZWZyZXNoVGhlbWUoKSkpO1xuXHRcdC8vIE1lcmdlIHRoZSByZWFsIHZvaWNlIHNlc3Npb24gd2l0aCBhbnkgZGV2L3ByZXZpZXcgc2ltdWxhdGlvbiBzbyB0aGUgd2Fsa3Rocm91Z2hcblx0XHQvLyBjb21tYW5kcyBkcml2ZSB0aGUgaW5wdXQtYm94IGdsb3cgZXhhY3RseSBhcyBhIGxpdmUgc2Vzc2lvbiB3b3VsZC5cblx0XHRjb25zdCBnZXRFZmZlY3RpdmVWb2ljZSA9ICgpOiB7IGNvbm5lY3RlZDogYm9vbGVhbjsgdm9pY2VTdGF0ZTogVm9pY2VHbG93U3RhdGU7IHNpbXVsYXRpbmc6IGJvb2xlYW4gfSA9PiB7XG5cdFx0XHRjb25zdCBzaW06IFNpbXVsYXRlZFZvaWNlU3RhdGUgfCB1bmRlZmluZWQgPSB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5zaW11bGF0ZWRWb2ljZVN0YXRlLmdldCgpO1xuXHRcdFx0aWYgKHNpbSA9PT0gJ2lkbGUnIHx8IHNpbSA9PT0gJ2xpc3RlbmluZycgfHwgc2ltID09PSAnc3BlYWtpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbm5lY3RlZDogdHJ1ZSwgdm9pY2VTdGF0ZTogc2ltLCBzaW11bGF0aW5nOiB0cnVlIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2ltID09PSAnb2ZmJyB8fCBzaW0gPT09ICdjb25uZWN0aW5nJyB8fCBzaW0gPT09ICdkaWN0YXRpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB7IGNvbm5lY3RlZDogZmFsc2UsIHZvaWNlU3RhdGU6ICdpZGxlJywgc2ltdWxhdGluZzogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Y29ubmVjdGVkOiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCksXG5cdFx0XHRcdHZvaWNlU3RhdGU6IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci52b2ljZVN0YXRlLmdldCgpIGFzIFZvaWNlR2xvd1N0YXRlLFxuXHRcdFx0XHRzaW11bGF0aW5nOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0fTtcblx0XHRjb25zdCBzdGFydEdsb3dBbmltYXRpb24gPSAoKSA9PiB7XG5cdFx0XHRpZiAoYW5pbUZyYW1lSWQgIT09IHVuZGVmaW5lZCkgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IGFuaW1hdGUgPSAoKSA9PiB7XG5cdFx0XHRcdGFuaW1GcmFtZUlkID0gd2luLnJlcXVlc3RBbmltYXRpb25GcmFtZShhbmltYXRlKTtcblx0XHRcdFx0Y29uc3QgeyBjb25uZWN0ZWQsIHZvaWNlU3RhdGUsIHNpbXVsYXRpbmcgfSA9IGdldEVmZmVjdGl2ZVZvaWNlKCk7XG5cdFx0XHRcdC8vIE9ubHkgZ2xvdyB0aGUgaW5wdXQgb2YgdGhlIHNlc3Npb24gdm9pY2UgaXMgYm91bmQgdG8uIE1pcnJvcnMgdGhlXG5cdFx0XHRcdC8vIHRyYW5zY3JpcHQgb3ZlcmxheSdzIG93bmVyc2hpcCB0ZXN0IChzZWUgYmVsb3cpIHNvIHRoZSBnbG93IGFuZFxuXHRcdFx0XHQvLyB0aGUgXCJMaXN0ZW5pbmcuLi5cIi90cmFuc2NyaXB0IG92ZXJsYXkgYWx3YXlzIHJlbmRlciBvbiB0aGUgc2FtZVxuXHRcdFx0XHQvLyBwYW5lIGFuZCBuZXZlciBvbiBhIGRpZmZlcmVudCBzcGxpdC93aW5kb3cgKCM4NTE0KSBvciBhIGNoYXRcblx0XHRcdFx0Ly8gZWRpdG9yIG9wZW4gYWxvbmdzaWRlIHRoaXMgcGFuZS4gQSBkZXYvcHJldmlldyBzaW11bGF0aW9uIGJ5cGFzc2VzXG5cdFx0XHRcdC8vIG93bmVyc2hpcCBzbyB0aGUgd2Fsa3Rocm91Z2ggY2FuIGxpZ2h0IHVwIGhlcmUuXG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uID0gdGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZS5nZXQoKTtcblx0XHRcdFx0Y29uc3QgYm91bmRSZXNvdXJjZSA9IHRoaXMuX2N1cnJlbnRWb2ljZUlucHV0UmVzb3VyY2UoKTtcblx0XHRcdFx0Y29uc3QgaXNPd25lciA9ICEhY3VycmVudFNlc3Npb24gJiYgISFib3VuZFJlc291cmNlICYmIGlzRXF1YWwoY3VycmVudFNlc3Npb24sIGJvdW5kUmVzb3VyY2UpO1xuXHRcdFx0XHRjb25zdCBnbG93QWN0aXZlID0gY29ubmVjdGVkICYmIGlzR2xvd2luZ1ZvaWNlU3RhdGUodm9pY2VTdGF0ZSkgJiYgKHNpbXVsYXRpbmcgfHwgaXNPd25lcik7XG5cblx0XHRcdFx0aWYgKCFnbG93QWN0aXZlKSB7XG5cdFx0XHRcdFx0Z2xvd0NvbnRyb2xsZXIuY2xlYXIoKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBHZXQgYXVkaW8gaW50ZW5zaXR5IGZyb20gYW5hbHlzZXJcblx0XHRcdFx0Y29uc3QgYW5hbHlzZXIgPSB0aGlzLnR0c1BsYXliYWNrU2VydmljZS5hbmFseXNlck5vZGVcblx0XHRcdFx0XHQ/PyAodm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycgPyB0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLmFuYWx5c2VyTm9kZSA6IG51bGwpXG5cdFx0XHRcdFx0Pz8gbnVsbDtcblx0XHRcdFx0bGV0IGludGVuc2l0eTogbnVtYmVyO1xuXHRcdFx0XHRpZiAoIWFuYWx5c2VyICYmIHNpbXVsYXRpbmcpIHtcblx0XHRcdFx0XHQvLyBObyBsaXZlIGF1ZGlvIChhIHNpbXVsYXRpb24pOiBzeW50aGVzaXplIGEgbGl2ZWx5IHB1bHNpbmcgaW50ZW5zaXR5XG5cdFx0XHRcdFx0Ly8gc28gdGhlIHdhbGt0aHJvdWdoIGdsb3cgYmVoYXZlcyBsaWtlIHJlYWwgc3BlZWNoIGluc3RlYWQgb2Ygc2l0dGluZyBmbGF0LlxuXHRcdFx0XHRcdGNvbnN0IHQgPSBEYXRlLm5vdygpIC8gMTAwMDtcblx0XHRcdFx0XHRpbnRlbnNpdHkgPSBNYXRoLm1pbigxLCAwLjI4ICsgMC4zNCAqIE1hdGguYWJzKE1hdGguc2luKHQgKiA2LjEpKSArIDAuMjIgKiBNYXRoLmFicyhNYXRoLnNpbih0ICogMTEuMyArIDEpKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW50ZW5zaXR5ID0gcmVhZFZvaWNlR2xvd0ludGVuc2l0eShhbmFseXNlciwgZ2xvd0RhdGFBcnJheVJlZik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRnbG93Q29udHJvbGxlci5yZW5kZXIodm9pY2VTdGF0ZSwgaW50ZW5zaXR5LCB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzTW90aW9uUmVkdWNlZCgpKTtcblx0XHRcdH07XG5cdFx0XHRhbmltRnJhbWVJZCA9IHdpbi5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XG5cdFx0fTtcblx0XHRjb25zdCBzdG9wR2xvd0FuaW1hdGlvbiA9ICgpID0+IHtcblx0XHRcdGlmIChhbmltRnJhbWVJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHdpbi5jYW5jZWxBbmltYXRpb25GcmFtZShhbmltRnJhbWVJZCk7XG5cdFx0XHRcdGFuaW1GcmFtZUlkID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Z2xvd0NvbnRyb2xsZXIuY2xlYXIoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY29ubmVjdGVkID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZvaWNlU3RhdGUgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHQvLyBPbmx5IHJ1biB0aGUgcGVyLWZyYW1lIGdsb3cgbG9vcCBmb3Igc3RhdGVzIHRoYXQgYWN0dWFsbHkgcmVuZGVyIGFcblx0XHRcdC8vIGdsb3cuIElkbGUgcmVuZGVycyBub25lLCBzbyBrZWVwaW5nIHRoZSBsb29wIGFsaXZlIHRoZW4gd291bGQgYnVybiBhXG5cdFx0XHQvLyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgY2FsbGJhY2sgZXZlcnkgZnJhbWUgZm9yIG5vdGhpbmcuIFJlYWN0IHRvXG5cdFx0XHQvLyBzaW11bGF0ZWQgc3RhdGVzIHRvbywgc28gdGhlIHdhbGt0aHJvdWdoIGNvbW1hbmRzIGxpZ2h0IHVwIHRoZSBnbG93LlxuXHRcdFx0Y29uc3Qgc2ltID0gdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uuc2ltdWxhdGVkVm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzaW1HbG93ID0gc2ltID09PSAnbGlzdGVuaW5nJyB8fCBzaW0gPT09ICdzcGVha2luZyc7XG5cdFx0XHRpZiAoc2ltR2xvdyB8fCAoY29ubmVjdGVkICYmIGlzR2xvd2luZ1ZvaWNlU3RhdGUodm9pY2VTdGF0ZSkpKSB7XG5cdFx0XHRcdHN0YXJ0R2xvd0FuaW1hdGlvbigpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3RvcEdsb3dBbmltYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBzdG9wR2xvd0FuaW1hdGlvbigpIH0pO1xuXG5cdFx0Ly8gVm9pY2UgdHJhbnNjcmlwdCBpcyBwZXItc2Vzc2lvbi4gVGhlIHRyYW5zY3JpcHQgaXMgXCJvd25lZFwiIGJ5IHRoZVxuXHRcdC8vIHNlc3Npb24gdGhlIHVzZXIgaXMgZGljdGF0aW5nIGludG8gKHRoZSBleHBsaWNpdCB0YXJnZXQgc2Vzc2lvbiwgb3IgdGhlXG5cdFx0Ly8gZm9jdXNlZCBzZXNzaW9uIHdoZW4gZGljdGF0aW9uIGJlZ2FuKSBhbmQgaXMgb25seSBzaG93biBpbiB0aGF0XG5cdFx0Ly8gc2Vzc2lvbidzIHZpZXcuIFN3aXRjaGluZyBmb2N1cyB0byBhIGRpZmZlcmVudCBzZXNzaW9uIGhpZGVzIHRoZVxuXHRcdC8vIHRyYW5zY3JpcHQgaGVyZTsgc3dpdGNoaW5nIHRvIGFub3RoZXIgZXhpc3Rpbmcgc2Vzc2lvbiBzdG9wc1xuXHRcdC8vIHRyYW5zY3JpcHRpb24gc28gaXQgaXNuJ3QgbWlzcm91dGVkIHRoZXJlLiBBbnl0aGluZyBhbHJlYWR5IGRpY3RhdGVkIGlzXG5cdFx0Ly8gc3VibWl0dGVkIHRvIHRoZSBvcmlnaW5hbCBzZXNzaW9uOyBhbiBpZGxlIGhhbmRzLWZyZWUgdHVybiBtYXkgaW5zdGVhZFxuXHRcdC8vIGZvbGxvdyBhbiB1bnRpdGxlZCBcIk5ldyBDaGF0XCIgc2Vzc2lvbiBiZWZvcmUgYW55IGRpY3RhdGlvbiBzdGFydHMuXG5cdFx0bGV0IGxpc3RlbmluZ1Nlc3Npb246IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgb3duZXJTZXNzaW9uOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Ly8gRGV2L3ByZXZpZXc6IHdoZW4gYSB3YWxrdGhyb3VnaCBpcyBzaW11bGF0aW5nLCBkcml2ZSB0aGUgb3ZlcmxheSBoaW50IGZyb20gdGhlXG5cdFx0XHQvLyBzaW11bGF0ZWQgc3RhdGUgKyB2ZXJzaW9uIHNvIGVhY2ggZGVzaWduIHNob3dzIGl0cyBvd24gaW5zdHJ1Y3Rpb24uXG5cdFx0XHRjb25zdCBzaW1TdGF0ZSA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2ltVmVyc2lvbiA9IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZlcnNpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHNpbVN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKHNpbVN0YXRlID09PSAnaWRsZScgJiYgc2ltVmVyc2lvbikge1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy10cmFuc2NyaXB0Jyk7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRcdFx0Y29uc3QgaGludCA9ICQoJ3NwYW4ucGFydGlhbCcpO1xuXHRcdFx0XHRcdHN3aXRjaCAoc2ltVmVyc2lvbikge1xuXHRcdFx0XHRcdFx0Y2FzZSAnaGFuZHNGcmVlJzpcblx0XHRcdFx0XHRcdFx0aGludC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd2b2ljZU1vZGUuc2ltSGludC5oYW5kc0ZyZWUnLCBcIkhhbmRzLWZyZWUgXFx1MjAxNCBqdXN0IHN0YXJ0IHRhbGtpbmdcIik7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0Y2FzZSAna2V5Ym9hcmRIb2xkJzoge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBrYkxhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCd3b3JrYmVuY2guYWN0aW9uLmNoYXQudm9pY2VJbnB1dE1vZGUuaG9sZFRvVGFsaycpPy5nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdFx0XHRoaW50LnRleHRDb250ZW50ID0ga2JMYWJlbFxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlTW9kZS5wdHRIaW50JywgXCJIb2xkIHswfSB0byB0YWxrXCIsIGtiTGFiZWwpXG5cdFx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgndm9pY2VNb2RlLnNpbUhpbnQua2V5Ym9hcmRIb2xkJywgXCJIb2xkIFNwYWNlIHRvIHRhbGtcIik7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2FzZSAnYnV0dG9uSG9sZCc6XG5cdFx0XHRcdFx0XHRcdGhpbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndm9pY2VNb2RlLnNpbUhpbnQuYnV0dG9uSG9sZCcsIFwiSG9sZCB0aGUgYnV0dG9uIHRvIHRhbGssIHRhcCB0byB0dXJuIG9mZlwiKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICdjbGlja1RvZ2dsZSc6XG5cdFx0XHRcdFx0XHRcdGhpbnQudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgndm9pY2VNb2RlLnNpbUhpbnQuY2xpY2tUb2dnbGUnLCBcIlRhcCB0aGUgYnV0dG9uIHRvIHN0YXJ0IGxpc3RlbmluZ1wiKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5LmFwcGVuZChoaW50KTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0U2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtdHJhbnNjcmlwdCcpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHVybnMgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudHJhbnNjcmlwdFR1cm5zLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGNvbm5lY3RlZCA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB2b2ljZVN0YXRlID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgdGFyZ2V0U2Vzc2lvbiA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci50YXJnZXRTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uID0gdGhpcy5fY3VycmVudFNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzaG93VHJhbnNjcmlwdCA9IHNob3dUcmFuc2NyaXB0U2V0dGluZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzaG93TGl2ZVRyYW5zY3JpcHQgPSBzaG93TGl2ZVRyYW5zY3JpcHRTZXR0aW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZpc2libGUgPSB0dXJucy5maWx0ZXIodCA9PiB0LnRleHQubGVuZ3RoID4gMCB8fCAodC5zcGVha2VyID09PSAndXNlcicgJiYgdC5pc1BhcnRpYWwpKTtcblx0XHRcdGNvbnN0IHNob3dMaXN0ZW5pbmdQbGFjZWhvbGRlciA9IHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnICYmICghc2hvd1RyYW5zY3JpcHQgfHwgIXNob3dMaXZlVHJhbnNjcmlwdCk7XG5cblx0XHRcdGlmICghY29ubmVjdGVkKSB7XG5cdFx0XHRcdGxpc3RlbmluZ1Nlc3Npb24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdG93bmVyU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtdHJhbnNjcmlwdCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIENhcHR1cmUgLyBtYWludGFpbiB0aGUgc2Vzc2lvbiB0aGUgY3VycmVudCB0cmFuc2NyaXB0IGJlbG9uZ3MgdG8uXG5cdFx0XHRpZiAodm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycpIHtcblx0XHRcdFx0aWYgKCFsaXN0ZW5pbmdTZXNzaW9uKSB7XG5cdFx0XHRcdFx0bGlzdGVuaW5nU2Vzc2lvbiA9IHRhcmdldFNlc3Npb24gPz8gY3VycmVudFNlc3Npb247XG5cdFx0XHRcdFx0b3duZXJTZXNzaW9uID0gbGlzdGVuaW5nU2Vzc2lvbjtcblx0XHRcdFx0fSBlbHNlIGlmICghdGFyZ2V0U2Vzc2lvbiAmJiBjdXJyZW50U2Vzc2lvbiAmJiAhaXNFcXVhbChjdXJyZW50U2Vzc2lvbiwgbGlzdGVuaW5nU2Vzc2lvbikpIHtcblx0XHRcdFx0XHRjb25zdCBkaWN0YXRpb25TZXNzaW9uID0gbGlzdGVuaW5nU2Vzc2lvbjtcblx0XHRcdFx0XHRjb25zdCBhY3RpdmVseURpY3RhdGluZyA9IHR1cm5zLnNvbWUodCA9PiB0LnNwZWFrZXIgPT09ICd1c2VyJyAmJiB0LmlzUGFydGlhbCAmJiB0LnRleHQudHJpbSgpLmxlbmd0aCA+IDApO1xuXHRcdFx0XHRcdGlmIChhY3RpdmVseURpY3RhdGluZykge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIHVzZXIgaGFzIGFscmVhZHkgc3Bva2VuIFx1MjAxNCBzdWJtaXQgdGhlaXIgd29yZHMgdG8gdGhlXG5cdFx0XHRcdFx0XHQvLyBzZXNzaW9uIHRoZXkgd2VyZSBkaWN0YXRpbmcgaW50byByYXRoZXIgdGhhbiBsb3NpbmcgdGhlbVxuXHRcdFx0XHRcdFx0Ly8gb3IgbWlzcm91dGluZyB0byB0aGUgbmV3bHkgZm9jdXNlZCBzZXNzaW9uLlxuXHRcdFx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmZpbmlzaExpc3RlbmluZ0FuZFN1Ym1pdFRvKGRpY3RhdGlvblNlc3Npb24pO1xuXHRcdFx0XHRcdFx0bGlzdGVuaW5nU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihjdXJyZW50U2Vzc2lvbikpIHtcblx0XHRcdFx0XHRcdC8vIElkbGUgaGFuZHMtZnJlZSBsaXN0ZW4gZm9sbG93aW5nIGludG8gYSBmcmVzaCBOZXcgQ2hhdC5cblx0XHRcdFx0XHRcdGxpc3RlbmluZ1Nlc3Npb24gPSBjdXJyZW50U2Vzc2lvbjtcblx0XHRcdFx0XHRcdG93bmVyU2Vzc2lvbiA9IGN1cnJlbnRTZXNzaW9uO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBJZGxlIGxpc3RlbiBhbmQgdGhlIHVzZXIgc3dpdGNoZWQgdG8gYW5vdGhlciBleGlzdGluZ1xuXHRcdFx0XHRcdFx0Ly8gc2Vzc2lvbiBiZWZvcmUgc2F5aW5nIGFueXRoaW5nIFx1MjAxNCBub3RoaW5nIHRvIHN1Ym1pdC5cblx0XHRcdFx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5kaXNjYXJkTGlzdGVuaW5nKCk7XG5cdFx0XHRcdFx0XHRsaXN0ZW5pbmdTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQWxsb3cgdGhlIG5leHQgZGljdGF0aW9uIHRvIHJlLWNhcHR1cmUgdGhlIG93bmluZyBzZXNzaW9uLlxuXHRcdFx0XHRsaXN0ZW5pbmdTZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEb24ndCBzaG93IGEgdHJhbnNjcmlwdCB0aGF0IGJlbG9uZ3MgdG8gYSBkaWZmZXJlbnQgc2Vzc2lvbiBoZXJlLCBvclxuXHRcdFx0Ly8gb24gYSBwYW5lIHRoYXQgaXNuJ3QgdGhlIHNpbmdsZSBpbnB1dCB2b2ljZSBpcyBib3VuZCB0byAoZm9jdXMtYXdhcmUsXG5cdFx0XHQvLyBzbyBhIGNoYXQgZWRpdG9yIG9wZW4gYWxvbmdzaWRlIHRoaXMgcGFuZSBkb2Vzbid0IGFsc28gc2hvdyBpdCkuXG5cdFx0XHRjb25zdCBib3VuZFJlc291cmNlID0gdGhpcy5fY3VycmVudFZvaWNlSW5wdXRSZXNvdXJjZShyZWFkZXIpO1xuXHRcdFx0aWYgKGJvdW5kUmVzb3VyY2UgJiYgY3VycmVudFNlc3Npb24gJiYgIWlzRXF1YWwoYm91bmRSZXNvdXJjZSwgY3VycmVudFNlc3Npb24pKSB7XG5cdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZWZmZWN0aXZlT3duZXIgPSB0YXJnZXRTZXNzaW9uID8/IG93bmVyU2Vzc2lvbjtcblx0XHRcdGlmIChlZmZlY3RpdmVPd25lciAmJiBjdXJyZW50U2Vzc2lvbiAmJiAhaXNFcXVhbChlZmZlY3RpdmVPd25lciwgY3VycmVudFNlc3Npb24pKSB7XG5cdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IGhpbnQgd2hlbiBjb25uZWN0ZWQgYnV0IG5vIHRyYW5zY3JpcHQgeWV0XG5cdFx0XHRpZiAodmlzaWJsZS5sZW5ndGggPT09IDAgfHwgIXNob3dUcmFuc2NyaXB0IHx8IHNob3dMaXN0ZW5pbmdQbGFjZWhvbGRlcikge1xuXHRcdFx0XHRjb25zdCBoYW5kc0ZyZWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdhZ2VudHMudm9pY2UuaGFuZHNGcmVlJykgPT09IHRydWU7XG5cdFx0XHRcdGlmIChzaG93TGlzdGVuaW5nUGxhY2Vob2xkZXIpIHtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtdHJhbnNjcmlwdCcpO1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5LnJlcGxhY2VDaGlsZHJlbigpO1xuXHRcdFx0XHRcdGNvbnN0IGxpc3RlbmluZyA9ICQoJ3NwYW4ubGlzdGVuaW5nJyk7XG5cdFx0XHRcdFx0bGlzdGVuaW5nLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3ZvaWNlTW9kZS5saXN0ZW5pbmcnLCBcIkxpc3RlbmluZy4uLlwiKTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheS5hcHBlbmQobGlzdGVuaW5nKTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0U2Nyb2xsYWJsZS5zY2FuRG9tTm9kZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKCFzaG93VHJhbnNjcmlwdCAmJiB2b2ljZVN0YXRlID09PSAnc3BlYWtpbmcnKSB7XG5cdFx0XHRcdFx0Ly8gVHJhbnNjcmlwdCBpcyBkaXNhYmxlZDogaGludCB0aGF0IHRoZSB1c2VyIGNhbiBpbnRlcnJ1cHQgcGxheWJhY2suXG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheS5yZXBsYWNlQ2hpbGRyZW4oKTtcblx0XHRcdFx0XHRjb25zdCBoaW50ID0gJCgnc3Bhbi5wYXJ0aWFsJyk7XG5cdFx0XHRcdFx0Y29uc3Qga2IgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC52b2ljZUlucHV0TW9kZS5ob2xkVG9UYWxrJylcblx0XHRcdFx0XHRcdD8/IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnYWdlbnRzVm9pY2UucHVzaFRvVGFsaycpO1xuXHRcdFx0XHRcdGNvbnN0IGtiTGFiZWwgPSBrYj8uZ2V0TGFiZWwoKTtcblx0XHRcdFx0XHRoaW50LnRleHRDb250ZW50ID0ga2JMYWJlbFxuXHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgndm9pY2VNb2RlLmJhcmdlSW5IaW50JywgXCJTcGVhayBvciB1c2UgezB9XCIsIGtiTGFiZWwpXG5cdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCd2b2ljZU1vZGUuYmFyZ2VJbkhpbnROb0tiJywgXCJTcGVhayB0byBiYXJnZSBpblwiKTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheS5hcHBlbmQoaGludCk7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdFNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRcdFx0fSBlbHNlIGlmICh2b2ljZVN0YXRlID09PSAnaWRsZScgJiYgdmlzaWJsZS5sZW5ndGggPT09IDAgJiYgc2hvd1RyYW5zY3JpcHQgJiYgIWhhbmRzRnJlZSkge1xuXHRcdFx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXlOb2RlLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy10cmFuc2NyaXB0Jyk7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdE92ZXJsYXkucmVwbGFjZUNoaWxkcmVuKCk7XG5cdFx0XHRcdFx0Y29uc3QgaGludCA9ICQoJ3NwYW4ucGFydGlhbCcpO1xuXHRcdFx0XHRcdGNvbnN0IGtiID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKCdhZ2VudHNWb2ljZS5wdXNoVG9UYWxrJyk7XG5cdFx0XHRcdFx0Y29uc3Qga2JMYWJlbCA9IGtiPy5nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdGhpbnQudGV4dENvbnRlbnQgPSBrYkxhYmVsXG5cdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCd2b2ljZU1vZGUucHR0T3JCYXJnZUluSGludCcsIFwiUHJlc3MgezB9IHRvIHRhbGsgb3IgYmFyZ2UgaW5cIiwga2JMYWJlbClcblx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5jbGlja01pY09yQmFyZ2VJbkhpbnQnLCBcIkNsaWNrIHZvaWNlIG1vZGUgdG8gdGFsayBvciBiYXJnZSBpblwiKTtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheS5hcHBlbmQoaGludCk7XG5cdFx0XHRcdFx0dHJhbnNjcmlwdFNjcm9sbGFibGUuc2NhbkRvbU5vZGUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyYW5zY3JpcHRPdmVybGF5Tm9kZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0cmFuc2NyaXB0T3ZlcmxheU5vZGUuY2xhc3NMaXN0LmFkZCgnaGFzLXRyYW5zY3JpcHQnKTtcblx0XHRcdC8vIFNob3cgb25seSB0aGUgbGF0ZXN0IHZpc2libGUgdHVyblxuXHRcdFx0Y29uc3QgbGFzdFR1cm4gPSB2aXNpYmxlW3Zpc2libGUubGVuZ3RoIC0gMV07XG5cdFx0XHRjb25zdCBjb250ZW50RWxlbWVudHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0XHRcdGlmIChsYXN0VHVybi5zcGVha2VyID09PSAndXNlcicpIHtcblx0XHRcdFx0Y29uc3Qgc3BhbiA9ICQoJ3NwYW4nKTtcblx0XHRcdFx0aWYgKGxhc3RUdXJuLmlzUGFydGlhbCkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1pdHRlZFBhcnQgPSBsYXN0VHVybi5jb21taXR0ZWQgfHwgJyc7XG5cdFx0XHRcdFx0Y29uc3QgdW5zdXJlUGFydCA9IGxhc3RUdXJuLnRleHQuc2xpY2UoY29tbWl0dGVkUGFydC5sZW5ndGgpO1xuXHRcdFx0XHRcdGlmIChjb21taXR0ZWRQYXJ0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjID0gJCgnc3Bhbi5jb21taXR0ZWQnKTtcblx0XHRcdFx0XHRcdGMudGV4dENvbnRlbnQgPSBjb21taXR0ZWRQYXJ0O1xuXHRcdFx0XHRcdFx0c3Bhbi5hcHBlbmQoYyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHUgPSAkKCdzcGFuLnBhcnRpYWwnKTtcblx0XHRcdFx0XHR1LnRleHRDb250ZW50ID0gdW5zdXJlUGFydCArICdcXHUyNTg5Jztcblx0XHRcdFx0XHRzcGFuLmFwcGVuZCh1KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzcGFuLmNsYXNzTmFtZSA9ICdjb21taXR0ZWQnO1xuXHRcdFx0XHRcdHNwYW4udGV4dENvbnRlbnQgPSBsYXN0VHVybi50ZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRlbnRFbGVtZW50cy5wdXNoKHNwYW4pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgZGl2ID0gJCgnZGl2LmFzc2lzdGFudC10ZXh0Jyk7XG5cdFx0XHRcdGRpdi50ZXh0Q29udGVudCA9IGxhc3RUdXJuLnRleHQ7XG5cdFx0XHRcdGNvbnRlbnRFbGVtZW50cy5wdXNoKGRpdik7XG5cdFx0XHR9XG5cdFx0XHR0cmFuc2NyaXB0T3ZlcmxheS5yZXBsYWNlQ2hpbGRyZW4oLi4uY29udGVudEVsZW1lbnRzKTtcblx0XHRcdHRyYW5zY3JpcHRTY3JvbGxhYmxlLnNjYW5Eb21Ob2RlKCk7XG5cdFx0XHR0cmFuc2NyaXB0U2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogMCB9KTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU2Vzc2lvbnMgQ29udHJvbFxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFU1NJT05TX1NJREVCQVJfTUlOX1dJRFRIID0gMjAwO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTRVNTSU9OU19TSURFQkFSX1NOQVBfVEhSRVNIT0xEID0gdGhpcy5TRVNTSU9OU19TSURFQkFSX01JTl9XSURUSCAvIDI7IC8vIHNuYXAgdG8gaGlkZSB3aGVuIGRyYWdnZWQgYmVsb3cgaGFsZiBvZiBtaW5pbXVtIHdpZHRoXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFU1NJT05TX1NJREVCQVJfREVGQVVMVF9XSURUSCA9IDMwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0hBVF9XSURHRVRfREVGQVVMVF9XSURUSCA9IDMwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0VTU0lPTlNfU0lERUJBUl9WSUVXX01JTl9XSURUSCA9IHRoaXMuQ0hBVF9XSURHRVRfREVGQVVMVF9XSURUSCArIHRoaXMuU0VTU0lPTlNfU0lERUJBUl9ERUZBVUxUX1dJRFRIO1xuXG5cdHByaXZhdGUgc2Vzc2lvbnNDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zVGl0bGVDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zVGl0bGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zTmV3QnV0dG9uQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzZXNzaW9uc0NvbnRyb2xDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zQ29udHJvbDogQWdlbnRTZXNzaW9uc0NvbnRyb2wgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGFnZW50U2Vzc2lvbnNDb250cm9sKCk6IEFnZW50U2Vzc2lvbnNDb250cm9sIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuc2Vzc2lvbnNDb250cm9sOyB9XG5cblx0cHJpdmF0ZSBzZXNzaW9uc1ZpZXdlclZpc2libGU6IGJvb2xlYW47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkO1xuXHRwcml2YXRlIHNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db25maWd1cmF0aW9uOiAnc3RhY2tlZCcgfCAnc2lkZUJ5U2lkZScgPSAnc2lkZUJ5U2lkZSc7XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbj47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJWaXNpYmlsaXR5Q29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJQb3NpdGlvbkNvbnRleHQ6IElDb250ZXh0S2V5PEFnZW50U2Vzc2lvbnNWaWV3ZXJQb3NpdGlvbj47XG5cdHByaXZhdGUgc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGg6IG51bWJlcjtcblx0cHJpdmF0ZSBzZXNzaW9uc1ZpZXdlclNhc2g6IFNhc2ggfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNWaWV3ZXJTYXNoRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblxuXHRwcml2YXRlIGNyZWF0ZVNlc3Npb25zQ29udHJvbChwYXJlbnQ6IEhUTUxFbGVtZW50KTogQWdlbnRTZXNzaW9uc0NvbnRyb2wge1xuXHRcdGNvbnN0IHNlc3Npb25zQ29udGFpbmVyID0gdGhpcy5zZXNzaW9uc0NvbnRhaW5lciA9IHBhcmVudC5hcHBlbmRDaGlsZCgkKCcuYWdlbnQtc2Vzc2lvbnMtY29udGFpbmVyJykpO1xuXG5cdFx0Ly8gU2Vzc2lvbnMgVGl0bGVcblx0XHRjb25zdCBzZXNzaW9uc1RpdGxlQ29udGFpbmVyID0gdGhpcy5zZXNzaW9uc1RpdGxlQ29udGFpbmVyID0gYXBwZW5kKHNlc3Npb25zQ29udGFpbmVyLCAkKCcuYWdlbnQtc2Vzc2lvbnMtdGl0bGUtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHNlc3Npb25zVGl0bGUgPSB0aGlzLnNlc3Npb25zVGl0bGUgPSBhcHBlbmQoc2Vzc2lvbnNUaXRsZUNvbnRhaW5lciwgJCgnc3Bhbi5hZ2VudC1zZXNzaW9ucy10aXRsZScpKTtcblx0XHRzZXNzaW9uc1RpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3Nlc3Npb25zJywgXCJTZXNzaW9uc1wiKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2Vzc2lvbnNUaXRsZSwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbD8uc2Nyb2xsVG9Ub3AoKTtcblx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5mb2N1cygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNlc3Npb25zIFRvb2xiYXJcblx0XHRjb25zdCBzZXNzaW9uc1Rvb2xiYXJDb250YWluZXIgPSBhcHBlbmQoc2Vzc2lvbnNUaXRsZUNvbnRhaW5lciwgJCgnLmFnZW50LXNlc3Npb25zLXRvb2xiYXInKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgc2Vzc2lvbnNUb29sYmFyQ29udGFpbmVyLCBNZW51SWQuQWdlbnRTZXNzaW9uc1Rvb2xiYXIsIHtcblx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH1cblx0XHR9KSk7XG5cblx0XHQvLyBTZXNzaW9ucyBGaWx0ZXJcblx0XHRjb25zdCBzZXNzaW9uc0ZpbHRlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc0ZpbHRlciwge1xuXHRcdFx0ZmlsdGVyTWVudUlkOiBNZW51SWQuQWdlbnRTZXNzaW9uc1ZpZXdlckZpbHRlclN1Yk1lbnUsXG5cdFx0XHRncm91cFJlc3VsdHM6ICgpID0+IHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQgPyBBZ2VudFNlc3Npb25zR3JvdXBpbmcuQ2FwcGVkIDogQWdlbnRTZXNzaW9uc0dyb3VwaW5nLkRhdGVcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHNlc3Npb25zRmlsdGVyLm9uRGlkQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRzZXNzaW9uc1Rvb2xiYXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZmlsdGVyZWQnLCAhc2Vzc2lvbnNGaWx0ZXIuaXNEZWZhdWx0KCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIE5ldyBTZXNzaW9uIEJ1dHRvblxuXHRcdGNvbnN0IG5ld1Nlc3Npb25CdXR0b25Db250YWluZXIgPSB0aGlzLnNlc3Npb25zTmV3QnV0dG9uQ29udGFpbmVyID0gYXBwZW5kKHNlc3Npb25zQ29udGFpbmVyLCAkKCcuYWdlbnQtc2Vzc2lvbnMtbmV3LWJ1dHRvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbkJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24obmV3U2Vzc2lvbkJ1dHRvbkNvbnRhaW5lciwgeyAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzLCBzZWNvbmRhcnk6IHRydWUgfSkpO1xuXHRcdG5ld1Nlc3Npb25CdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnbmV3U2Vzc2lvbicsIFwiTmV3IFNlc3Npb25cIik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3U2Vzc2lvbkJ1dHRvbi5vbkRpZENsaWNrKCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQUNUSU9OX0lEX05FV19DSEFULCB0aGlzLmdldEFjdGlvbnNDb250ZXh0KCkpKSk7XG5cblx0XHQvLyBTZXNzaW9ucyBDb250cm9sXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIgPSBhcHBlbmQoc2Vzc2lvbnNDb250YWluZXIsICQoJy5hZ2VudC1zZXNzaW9ucy1jb250cm9sLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCBzZXNzaW9uc0NvbnRyb2wgPSB0aGlzLnNlc3Npb25zQ29udHJvbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRTZXNzaW9uc0NvbnRyb2wsIHRoaXMuc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyLCB7XG5cdFx0XHRzb3VyY2U6ICdjaGF0Vmlld1BhbmUnLFxuXHRcdFx0ZmlsdGVyOiBzZXNzaW9uc0ZpbHRlcixcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRnZXRIb3ZlclBvc2l0aW9uOiAoKSA9PiB0aGlzLmdldFNlc3Npb25Ib3ZlclBvc2l0aW9uKCksXG5cdFx0XHR0cmFja0FjdGl2ZUVkaXRvclNlc3Npb246ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuICF0aGlzLl93aWRnZXQgfHwgdGhpcy5fd2lkZ2V0LmlzRW1wdHkoKTsgLy8gb25seSB0cmFjayBhbmQgcmV2ZWFsIGlmIGNoYXQgd2lkZ2V0IGlzIGVtcHR5XG5cdFx0XHR9LFxuXHRcdFx0b3ZlcnJpZGVTZXNzaW9uT3Blbk9wdGlvbnM6IG9wZW5FdmVudCA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkICYmICFvcGVuRXZlbnQuc2lkZUJ5U2lkZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLm9wZW5FdmVudCwgZWRpdG9yT3B0aW9uczogeyAuLi5vcGVuRXZlbnQuZWRpdG9yT3B0aW9ucywgcHJlc2VydmVGb2N1czogZmFsc2UgLyogZm9jdXMgdGhlIGNoYXQgd2lkZ2V0IHdoZW4gb3BlbmluZyBmcm9tIHN0YWNrZWQgc2Vzc2lvbnMgdmlld2VyIHNpbmNlIHRoaXMgY2xvc2VzIHRoZSBzdGFja2VkIHZpZXdlciAqLyB9IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9wZW5FdmVudDtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSh2aXNpYmxlID0+IHNlc3Npb25zQ29udHJvbC5zZXRWaXNpYmxlKHZpc2libGUpKSk7XG5cblx0XHRzZXNzaW9uc1Rvb2xiYXIuY29udGV4dCA9IHNlc3Npb25zQ29udHJvbDtcblxuXHRcdC8vIFJlZnJlc2ggc2Vzc2lvbnMgd2hlbiB3aW5kb3cgZ2V0cyBmb2N1cyB0byBjb21wZW5zYXRlIGZvciBtaXNzaW5nIGV2ZW50c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhoYXNGb2N1cyA9PiB7XG5cdFx0XHRpZiAoaGFzRm9jdXMpIHtcblx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBEZWFsIHdpdGggb3JpZW50YXRpb24gY29uZmlndXJhdGlvblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShFdmVudC5maWx0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24sIGUgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb24pKSwgZSA9PiB7XG5cdFx0XHRjb25zdCBuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbiA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3N0YWNrZWQnIHwgJ3NpZGVCeVNpZGUnIHwgdW5rbm93bj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc09yaWVudGF0aW9uKTtcblx0XHRcdHRoaXMuZG9VcGRhdGVDb25maWd1cmVkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbihuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbiwgeyB1cGRhdGVDb25maWd1cmF0aW9uOiBmYWxzZSwgbGF5b3V0OiAhIWUgfSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHNlc3Npb25zQ29udHJvbDtcblx0fVxuXG5cdGdldFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24oKTogQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uO1xuXHR9XG5cblx0dXBkYXRlQ29uZmlndXJlZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24ob3JpZW50YXRpb246ICdzdGFja2VkJyB8ICdzaWRlQnlTaWRlJyB8IHVua25vd24pOiB2b2lkIHtcblx0XHRyZXR1cm4gdGhpcy5kb1VwZGF0ZUNvbmZpZ3VyZWRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uKG9yaWVudGF0aW9uLCB7IHVwZGF0ZUNvbmZpZ3VyYXRpb246IHRydWUsIGxheW91dDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVDb25maWd1cmVkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbihvcmllbnRhdGlvbjogJ3N0YWNrZWQnIHwgJ3NpZGVCeVNpZGUnIHwgdW5rbm93biwgb3B0aW9uczogeyB1cGRhdGVDb25maWd1cmF0aW9uOiBib29sZWFuOyBsYXlvdXQ6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IG9sZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db25maWd1cmF0aW9uID0gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbjtcblxuXHRcdGxldCB2YWxpZGF0ZWRPcmllbnRhdGlvbjogJ3N0YWNrZWQnIHwgJ3NpZGVCeVNpZGUnO1xuXHRcdGlmIChvcmllbnRhdGlvbiA9PT0gJ3N0YWNrZWQnIHx8IG9yaWVudGF0aW9uID09PSAnc2lkZUJ5U2lkZScpIHtcblx0XHRcdHZhbGlkYXRlZE9yaWVudGF0aW9uID0gb3JpZW50YXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbGlkYXRlZE9yaWVudGF0aW9uID0gJ3NpZGVCeVNpZGUnOyAvLyBkZWZhdWx0XG5cdFx0fVxuXHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbkNvbmZpZ3VyYXRpb24gPSB2YWxpZGF0ZWRPcmllbnRhdGlvbjtcblxuXHRcdGlmIChvbGRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbiA9PT0gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uQ29uZmlndXJhdGlvbikge1xuXHRcdFx0cmV0dXJuOyAvLyBubyBjaGFuZ2UgZnJvbSBvdXIgZXhpc3RpbmcgY29uZmlnXG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMudXBkYXRlQ29uZmlndXJhdGlvbikge1xuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0Q29uZmlndXJhdGlvbi5DaGF0Vmlld1Nlc3Npb25zT3JpZW50YXRpb24sIHZhbGlkYXRlZE9yaWVudGF0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5sYXlvdXQpIHtcblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNlc3Npb25zQ29udHJvbFZpc2liaWxpdHkoKTogeyBjaGFuZ2VkOiBib29sZWFuOyB2aXNpYmxlOiBib29sZWFuIH0ge1xuXHRcdGlmICghdGhpcy5zZXNzaW9uc0NvbnRhaW5lciB8fCAhdGhpcy52aWV3UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIHsgY2hhbmdlZDogZmFsc2UsIHZpc2libGU6IGZhbHNlIH07XG5cdFx0fVxuXG5cdFx0bGV0IG5ld1Nlc3Npb25zQ29udGFpbmVyVmlzaWJsZTogYm9vbGVhbjtcblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQpKSB7XG5cdFx0XHRuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUgPSBmYWxzZTsgLy8gZGlzYWJsZWQgaW4gc2V0dGluZ3Ncblx0XHR9IGVsc2Uge1xuXG5cdFx0XHQvLyBTZXNzaW9ucyBjb250cm9sOiBzdGFja2VkXG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCkge1xuXHRcdFx0XHRuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUgPVxuXHRcdFx0XHRcdCghIXRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuY29tcGxldGVkIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5oYXNCeW9rTW9kZWxzKSAmJlx0XHRcdFx0XHQvLyBjaGF0IGlzIHNldHVwIChvdGhlcndpc2UgbWFrZSByb29tIGZvciB0ZXJtcyBhbmQgd2VsY29tZSlcblx0XHRcdFx0XHQoIXRoaXMuX3dpZGdldCB8fCAodGhpcy5fd2lkZ2V0LmlzRW1wdHkoKSAmJiAhIXRoaXMuX3dpZGdldC52aWV3TW9kZWwgJiYgIXRoaXMuX3dpZGdldC52aWV3TW9kZWwubW9kZWwudGl0bGUpKSAmJlx0Ly8gY2hhdCB3aWRnZXQgZW1wdHkgKGJ1dCBub3Qgd2hlbiBtb2RlbCBpcyBsb2FkaW5nIG9yIGhhcyBhIHRpdGxlKVxuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25zTGlzdFN1cHByZXNzaW9uQ291bnQgPT09IDAgJiZcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIG5vdCBtaWQtdHJhbnNpdGlvbiAoYSBzbG93IHNlc3Npb24gdHJhbnNpZW50bHkgc2hvd3MgYW4gZW1wdHkgd2lkZ2V0KVxuXHRcdFx0XHRcdCF0aGlzLndlbGNvbWVDb250cm9sbGVyPy5pc1Nob3dpbmdXZWxjb21lLmdldCgpO1x0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyB3ZWxjb21lIG5vdCBzaG93aW5nXG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlc3Npb25zIGNvbnRyb2w6IHNpZGViYXJcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUgPVxuXHRcdFx0XHRcdCF0aGlzLndlbGNvbWVDb250cm9sbGVyPy5pc1Nob3dpbmdXZWxjb21lLmdldCgpICYmXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyB3ZWxjb21lIG5vdCBzaG93aW5nXG5cdFx0XHRcdFx0ISF0aGlzLmxhc3REaW1lbnNpb25zICYmIHRoaXMubGFzdERpbWVuc2lvbnMud2lkdGggPj0gQ2hhdFZpZXdQYW5lLlNFU1NJT05TX1NJREVCQVJfVklFV19NSU5fV0lEVEg7XHQvLyBoYXMgc2Vzc2lvbnMgb3IgaXMgc2hvd2luZyBhbGwgc2Vzc2lvbnNcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1zZXNzaW9ucy1jb250cm9sJywgbmV3U2Vzc2lvbnNDb250YWluZXJWaXNpYmxlKTtcblxuXHRcdGNvbnN0IHNlc3Npb25zQ29udGFpbmVyVmlzaWJsZSA9IHRoaXMuc2Vzc2lvbnNDb250YWluZXIuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuXHRcdHNldFZpc2liaWxpdHkobmV3U2Vzc2lvbnNDb250YWluZXJWaXNpYmxlLCB0aGlzLnNlc3Npb25zQ29udGFpbmVyKTtcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyVmlzaWJsZSA9IG5ld1Nlc3Npb25zQ29udGFpbmVyVmlzaWJsZTtcblx0XHR0aGlzLnNlc3Npb25zVmlld2VyVmlzaWJpbGl0eUNvbnRleHQuc2V0KG5ld1Nlc3Npb25zQ29udGFpbmVyVmlzaWJsZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y2hhbmdlZDogc2Vzc2lvbnNDb250YWluZXJWaXNpYmxlICE9PSBuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGUsXG5cdFx0XHR2aXNpYmxlOiBuZXdTZXNzaW9uc0NvbnRhaW5lclZpc2libGVcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCB7IGNoYW5nZWQgfSA9IHRoaXMudXBkYXRlU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHR0aGlzLnJlbGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN1cHByZXNzZXMgdGhlIHNlc3Npb25zIGxpc3QgdW50aWwgdGhlIHJldHVybmVkIGRpc3Bvc2FibGUgaXMgZGlzcG9zZWQuXG5cdCAqIFVzZWQgdG8gc3BhbiBhIHdob2xlIHNlc3Npb24gdHJhbnNpdGlvbiAoZS5nLiBhIFwiQ29udGludWUgaW5cdTIwMjZcIiBtaWdyYXRpb246XG5cdCAqIGxvYWQgXHUyMTkyIG1hdGVyaWFsaXppbmcgc2VuZCBcdTIxOTIgcmViaW5kKSBzbyB0aGUgdHJhbnNpZW50bHktZW1wdHkgd2lkZ2V0IG5ldmVyXG5cdCAqIGZhbGxzIGJhY2sgdG8gdGhlIGxpc3QuXG5cdCAqL1xuXHRiZWdpblNlc3Npb25zTGlzdFN1cHByZXNzaW9uKCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9zZXNzaW9uc0xpc3RTdXBwcmVzc2lvbkNvdW50Kys7XG5cdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNMaXN0U3VwcHJlc3Npb25Db3VudC0tO1xuXHRcdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZFNlc3Npb25zKCk6IElBZ2VudFNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnNDb250cm9sPy5nZXRGb2N1cygpID8/IFtdO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIENoYXQgQ29udHJvbFxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1JTl9DSEFUX1dJREdFVF9IRUlHSFQgPSAxMTY7XG5cblx0cHJpdmF0ZSBfd2lkZ2V0ITogQ2hhdFdpZGdldDtcblx0Z2V0IHdpZGdldCgpOiBDaGF0V2lkZ2V0IHsgcmV0dXJuIHRoaXMuX3dpZGdldDsgfVxuXG5cdHByaXZhdGUgdGl0bGVDb250cm9sOiBDaGF0Vmlld1RpdGxlQ29udHJvbCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGNyZWF0ZUNoYXRDb250cm9sKHBhcmVudDogSFRNTEVsZW1lbnQpOiBDaGF0V2lkZ2V0IHtcblx0XHRjb25zdCBjaGF0Q29udHJvbHNDb250YWluZXIgPSBhcHBlbmQocGFyZW50LCAkKCcuY2hhdC1jb250cm9scy1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBsb2NhdGlvbkJhc2VkQ29sb3JzID0gdGhpcy5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCk7XG5cblx0XHRjb25zdCBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihnZXRXaW5kb3coY2hhdENvbnRyb2xzQ29udGFpbmVyKSkuYXBwZW5kQ2hpbGQoJCgnLmNoYXQtZWRpdG9yLW92ZXJmbG93Lm1vbmFjby1lZGl0b3InKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUucmVtb3ZlKCkpKTtcblxuXHRcdC8vIENoYXQgVGl0bGVcblx0XHR0aGlzLmNyZWF0ZUNoYXRUaXRsZUNvbnRyb2woY2hhdENvbnRyb2xzQ29udGFpbmVyKTtcblxuXHRcdC8vIENoYXQgV2lkZ2V0XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblx0XHR0aGlzLl93aWRnZXQgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRXaWRnZXQsXG5cdFx0XHRDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0eyB2aWV3SWQ6IHRoaXMuaWQgfSxcblx0XHRcdHtcblx0XHRcdFx0YXV0b1Njcm9sbDogbW9kZSA9PiBtb2RlICE9PSBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRyZW5kZXJGb2xsb3d1cHM6IHRydWUsXG5cdFx0XHRcdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXM6IHRydWUsXG5cdFx0XHRcdGNsZWFyOiAoKSA9PiB0aGlzLmNsZWFyKCksXG5cdFx0XHRcdHJlbmRlcmVyT3B0aW9uczoge1xuXHRcdFx0XHRcdHJlbmRlclRleHRFZGl0c0FzU3VtbWFyeTogKHVyaSkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZWZlcmVuY2VzRXhwYW5kZWRXaGVuRW1wdHlSZXNwb25zZTogZmFsc2UsXG5cdFx0XHRcdFx0cHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlOiBtb2RlID0+IG1vZGUgIT09IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRcdGVuYWJsZUltcGxpY2l0Q29udGV4dDogdHJ1ZSxcblx0XHRcdFx0ZW5hYmxlV29ya2luZ1NldDogJ2V4cGxpY2l0Jyxcblx0XHRcdFx0c3VwcG9ydHNDaGFuZ2luZ01vZGVzOiB0cnVlLFxuXHRcdFx0XHRkbmRDb250YWluZXI6IHBhcmVudCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiBTSURFX0JBUl9GT1JFR1JPVU5ELFxuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogbG9jYXRpb25CYXNlZENvbG9ycy5iYWNrZ3JvdW5kLFxuXHRcdFx0XHRvdmVybGF5QmFja2dyb3VuZDogbG9jYXRpb25CYXNlZENvbG9ycy5vdmVybGF5QmFja2dyb3VuZCxcblx0XHRcdFx0aW5wdXRFZGl0b3JCYWNrZ3JvdW5kOiBsb2NhdGlvbkJhc2VkQ29sb3JzLmJhY2tncm91bmQsXG5cdFx0XHRcdHJlc3VsdEVkaXRvckJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHR9KSk7XG5cdFx0dGhpcy5fd2lkZ2V0LnJlbmRlcihjaGF0Q29udHJvbHNDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdXBkYXRlV2lkZ2V0VmlzaWJpbGl0eSA9IChyZWFkZXI/OiBJUmVhZGVyKSA9PiB0aGlzLl93aWRnZXQuc2V0VmlzaWJsZSh0aGlzLmlzQm9keVZpc2libGUoKSAmJiAhdGhpcy53ZWxjb21lQ29udHJvbGxlcj8uaXNTaG93aW5nV2VsY29tZS5yZWFkKHJlYWRlcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSgoKSA9PiB1cGRhdGVXaWRnZXRWaXNpYmlsaXR5KCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB1cGRhdGVXaWRnZXRWaXNpYmlsaXR5KHJlYWRlcikpKTtcblxuXHRcdHJldHVybiB0aGlzLl93aWRnZXQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNoYXRUaXRsZUNvbnRyb2wocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMudGl0bGVDb250cm9sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Vmlld1RpdGxlQ29udHJvbCxcblx0XHRcdHBhcmVudCxcblx0XHRcdHtcblx0XHRcdFx0Zm9jdXNDaGF0OiAoKSA9PiB0aGlzLl93aWRnZXQuZm9jdXNJbnB1dCgpXG5cdFx0XHR9XG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRpdGxlQ29udHJvbC5vbkRpZENoYW5nZUhlaWdodCgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlbGF5b3V0KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbnRyb2xzTGlzdGVuZXJzKHNlc3Npb25zQ29udHJvbDogQWdlbnRTZXNzaW9uc0NvbnRyb2wsIGNoYXRXaWRnZXQ6IENoYXRXaWRnZXQsIHdlbGNvbWVDb250cm9sbGVyOiBDaGF0Vmlld1dlbGNvbWVDb250cm9sbGVyKTogdm9pZCB7XG5cblx0XHQvLyBTZXNzaW9ucyBjb250cm9sIHZpc2liaWxpdHkgaXMgaW1wYWN0ZWQgYnkgbXVsdGlwbGUgdGhpbmdzOlxuXHRcdC8vIC0gY2hhdCB3aWRnZXQgYmVpbmcgaW4gZW1wdHkgc3RhdGUgb3Igc2hvd2luZyBhIGNoYXRcblx0XHQvLyAtIGV4dGVuc2lvbnMgcHJvdmlkZWQgd2VsY29tZSB2aWV3IHNob3dpbmcgb3Igbm90XG5cdFx0Ly8gLSBjb25maWd1cmF0aW9uIHNldHRpbmdcblx0XHQvLyAtIGBoYXNCeW9rTW9kZWxzYCBmbGlwcGluZyAoQllPSyBtb2RlbHMgYmVjb21pbmcgYXZhaWxhYmxlIG9yIGdvaW5nIGF3YXkpXG5cdFx0Y29uc3QgaGFzQnlva01vZGVsc0NvbnRleHRLZXlzID0gbmV3IFNldChbQ2hhdEVudGl0bGVtZW50Q29udGV4dEtleXMuaGFzQnlva01vZGVscy5rZXldKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnkoXG5cdFx0XHRjaGF0V2lkZ2V0Lm9uRGlkQ2hhbmdlRW1wdHlTdGF0ZSxcblx0XHRcdEV2ZW50LmZyb21PYnNlcnZhYmxlKHdlbGNvbWVDb250cm9sbGVyLmlzU2hvd2luZ1dlbGNvbWUpLFxuXHRcdFx0RXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdFZpZXdTZXNzaW9uc0VuYWJsZWQpKSxcblx0XHRcdEV2ZW50LmZpbHRlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCwgZSA9PiBlLmFmZmVjdHNTb21lKGhhc0J5b2tNb2RlbHNDb250ZXh0S2V5cykpXG5cdFx0KSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCkge1xuXHRcdFx0XHRzZXNzaW9uc0NvbnRyb2wuY2xlYXJGb2N1cygpOyAvLyBpbXByb3ZlIHZpc3VhbCBhcHBlYXJhbmNlIHdoZW4gc3dpdGNoaW5nIHZpc2liaWxpdHkgYnkgY2xlYXJpbmcgZm9jdXNcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgY2hhbmdlZDogdmlzaWJpbGl0eUNoYW5nZWQgfSA9IHRoaXMudXBkYXRlU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXHRcdFx0aWYgKHZpc2liaWxpdHlDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayB0aGUgYWN0aXZlIGNoYXQgbW9kZWwgYW5kIHJldmVhbCBpdCBpbiB0aGUgc2Vzc2lvbnMgY29udHJvbCBpZiBzaWRlLWJ5LXNpZGVcblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0V2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKCgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gY2hhdFdpZGdldC52aWV3TW9kZWw/Lm1vZGVsO1xuXHRcdFx0dGhpcy50aXRsZUNvbnRyb2w/LnVwZGF0ZShtb2RlbCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50U2Vzc2lvblJlc291cmNlLnNldChjaGF0V2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG9ubHkgcmV2ZWFsIGluIHNpZGUtYnktc2lkZSBtb2RlXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGNoYXRXaWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IHJldmVhbGVkID0gc2Vzc2lvbnNDb250cm9sLnJldmVhbChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIXJldmVhbGVkKSB7XG5cdFx0XHRcdFx0Ly8gU2Vzc2lvbiBkb2Vzbid0IGV4aXN0IGluIHRoZSBsaXN0IHlldCAoZS5nLiwgbmV3IHVudGl0bGVkIHNlc3Npb24pLFxuXHRcdFx0XHRcdC8vIGNsZWFyIHRoZSBzZWxlY3Rpb24gc28gdGhlIGxpc3QgZG9lc24ndCBzaG93IHN0YWxlIHNlbGVjdGlvblxuXHRcdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbGVhckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIHNlc3Npb25zIGNoYW5nZSAoZS5nLiwgYWZ0ZXIgZmlyc3QgbWVzc2FnZSBpbiBhIG5ldyBzZXNzaW9uKVxuXHRcdC8vIHJldmVhbCBpdCB1bmxlc3MgdGhlIHVzZXIgaXMgaW50ZXJhY3Rpbmcgd2l0aCB0aGUgbGlzdCBhbHJlYWR5XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5vbkRpZENoYW5nZVNlc3Npb25zKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gb25seSByZXZlYWwgaW4gc2lkZS1ieS1zaWRlIG1vZGVcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlc3Npb25zQ29udHJvbC5oYXNGb2N1c09yU2VsZWN0aW9uKCkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBkbyBub3QgcmV2ZWFsIGlmIHVzZXIgaXMgaW50ZXJhY3Rpbmcgd2l0aCBzZXNzaW9ucyBjb250cm9sXG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IGNoYXRXaWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRpZiAoc2Vzc2lvblJlc291cmNlKSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5yZXZlYWwoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIHRoZSBjdXJyZW50bHkgZGlzcGxheWVkIHNlc3Npb24gaXMgYXJjaGl2ZWQsIHN0YXJ0IGEgbmV3IHNlc3Npb25cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLm9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGUoZSA9PiB7XG5cdFx0XHRpZiAoZS5pc0FyY2hpdmVkKCkpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb25SZXNvdXJjZSA9IGNoYXRXaWRnZXQudmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdGlmIChjdXJyZW50U2Vzc2lvblJlc291cmNlICYmIGlzRXF1YWwoY3VycmVudFNlc3Npb25SZXNvdXJjZSwgZS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHR0aGlzLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuIHNob3dpbmcgc2Vzc2lvbnMgc3RhY2tlZCwgYWRqdXN0IHRoZSBoZWlnaHQgb2YgdGhlIHNlc3Npb25zIGxpc3QgdG8gbWFrZSByb29tIGZvciBjaGF0IGlucHV0XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y2hhdFdpZGdldC5pbnB1dFBhcnQuaGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyVmlzaWJsZSAmJiB0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkKSB7XG5cdFx0XHRcdHRoaXMucmVsYXlvdXRGb3JJbnB1dEhlaWdodCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNob3cgcHJvZ3Jlc3MgYmFkZ2Ugd2hlbiB0aGUgY3VycmVudCBzZXNzaW9uIGlzIGluIHByb2dyZXNzXG5cdFx0Y29uc3QgcHJvZ3Jlc3NCYWRnZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdFx0Y29uc3QgdXBkYXRlUHJvZ3Jlc3NCYWRnZSA9ICgpID0+IHtcblx0XHRcdHByb2dyZXNzQmFkZ2VEaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0aWYgKCF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3UHJvZ3Jlc3NCYWRnZUVuYWJsZWQpKSB7XG5cdFx0XHRcdHRoaXMuYWN0aXZpdHlCYWRnZS5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gY2hhdFdpZGdldC52aWV3TW9kZWw/Lm1vZGVsO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHByb2dyZXNzQmFkZ2VEaXNwb3NhYmxlcy52YWx1ZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGlmIChtb2RlbC5yZXF1ZXN0SW5Qcm9ncmVzcy5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZpdHlCYWRnZS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dWaWV3QWN0aXZpdHkodGhpcy5pZCwge1xuXHRcdFx0XHRcdFx0XHRiYWRnZTogbmV3IFByb2dyZXNzQmFkZ2UoKCkgPT4gbG9jYWxpemUoJ3Nlc3Npb25JblByb2dyZXNzJywgXCJBZ2VudCBTZXNzaW9uIGluIFByb2dyZXNzXCIpKVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuYWN0aXZpdHlCYWRnZS5jbGVhcigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hY3Rpdml0eUJhZGdlLmNsZWFyKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9yZWdpc3RlcihjaGF0V2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01vZGVsKCgpID0+IHVwZGF0ZVByb2dyZXNzQmFkZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkNoYXRWaWV3UHJvZ3Jlc3NCYWRnZUVuYWJsZWQpKSgoKSA9PiB1cGRhdGVQcm9ncmVzc0JhZGdlKCkpKTtcblx0XHR1cGRhdGVQcm9ncmVzc0JhZGdlKCk7XG5cdH1cblxuXHRwcml2YXRlIHNldHVwQ29udGV4dE1lbnUocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYXJlbnQsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0bWVudUlkOiBNZW51SWQuQ2hhdFdlbGNvbWVDb250ZXh0LFxuXHRcdFx0XHRjb250ZXh0S2V5U2VydmljZTogdGhpcy5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyhwYXJlbnQpLCBlKVxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIE1vZGVsIE1hbmFnZW1lbnRcblxuXHRwcml2YXRlIGFwcGx5TW9kZWwoKTogdm9pZCB7XG5cdFx0Ly8gTWFrZSB0aGUgaW5pdGlhbCBzZXNzaW9uIHJlc29sdXRpb24gY2FuY2VsYWJsZSBzbyBhbiBleHBsaWNpdCByZXF1ZXN0XG5cdFx0Ly8gKGUuZy4gTmV3IExvY2FsIENoYXQgdmlhIGBzdGFydE5ld0xvY2FsU2Vzc2lvbmApIGNhbiBwcmVlbXB0IGEgc2xvdyAvXG5cdFx0Ly8gYmxvY2tpbmcgZGVmYXVsdC1wcm92aWRlciByZXNvbHV0aW9uIGluc3RlYWQgb2Ygd2FpdGluZyBmb3IgaXQuXG5cdFx0Ly8gQ2FuY2VsIGFueSBwcmV2aW91cyBpbi1mbGlnaHQgcmVzb2x1dGlvbiBmaXJzdDogYXNzaWduaW5nIHRvIHRoZVxuXHRcdC8vIE11dGFibGVEaXNwb3NhYmxlIG9ubHkgZGlzcG9zZXMgdGhlIG9sZCBzb3VyY2UsIGFuZCBkaXNwb3NpbmcgYVxuXHRcdC8vIENhbmNlbGxhdGlvblRva2VuU291cmNlIGRvZXMgbm90IGNhbmNlbCBpdC5cblx0XHR0aGlzLl9hcHBseU1vZGVsQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRjb25zdCBjdHMgPSB0aGlzLl9hcHBseU1vZGVsQ3RzLnZhbHVlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5yZXN0b3JpbmdTZXNzaW9uID0gdGhpcy5fYXBwbHlNb2RlbChjdHMudG9rZW4pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0NoYXRWaWV3UGFuZSNhcHBseU1vZGVsIGZhaWxlZCcsIGVycik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5yZXN0b3JpbmdTZXNzaW9uLmZpbmFsbHkoKCkgPT4gdGhpcy5yZXN0b3JpbmdTZXNzaW9uID0gdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5TW9kZWwodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbW9kZWxSZWYgPSBhd2FpdCB0aGlzLmFjcXVpcmVUcmFuc2ZlcnJlZE9yUGVyc2lzdGVkU2Vzc2lvbih0b2tlbiwgJ0NoYXRWaWV3UGFuZSNhcHBseU1vZGVsJyk7XG5cdFx0YXdhaXQgdGhpcy5zaG93TW9kZWwodG9rZW4sIG1vZGVsUmVmLCB0cnVlLCAhbW9kZWxSZWYpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmNlLXN0YXJ0IGEgbmV3IGxvY2FsIGNoYXQgc2Vzc2lvbiBpbiB0aGUgdmlldywgYnlwYXNzaW5nIHRoZVxuXHQgKiBkZWZhdWx0LXByb3ZpZGVyIG92ZXJyaWRlIGFwcGxpZWQgYnkgYHNob3dNb2RlbCgpYC4gVXNlZCBieSB0aGVcblx0ICogcGlja2VyIHdoZW4gdGhlIHVzZXIgZXhwbGljaXRseSBzZWxlY3RzIFwiTG9jYWxcIiwgYW5kIGJ5IE5ldyBMb2NhbCBDaGF0LlxuXHQgKi9cblx0YXN5bmMgc3RhcnROZXdMb2NhbFNlc3Npb24oKTogUHJvbWlzZTxJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gUHJlZW1wdCBhbnkgaW4tZmxpZ2h0IGluaXRpYWwgc2Vzc2lvbiByZXNvbHV0aW9uIChlLmcuIHRoZSBjb21wdXRlZFxuXHRcdC8vIGRlZmF1bHQgcHJvdmlkZXIpLiBXaXRob3V0IHRoaXMsIG9wZW5pbmcgdGhlIHZpZXcga2lja3Mgb2ZmIGEgZGVmYXVsdFxuXHRcdC8vIHJlc29sdXRpb24gdGhhdCwgd2hlbiB0aGUgZGVmYXVsdCBpcyBhIG5vbi1sb2NhbCBoYXJuZXNzLCBibG9ja3Mgb25cblx0XHQvLyBhZ2VudCBob3N0IGFjdGl2YXRpb247IGNhbmNlbGluZyBpdCBsZXRzIHRoaXMgZXhwbGljaXQgbG9jYWwgcmVxdWVzdFxuXHRcdC8vIHdpbiBpbW1lZGlhdGVseS5cblx0XHR0aGlzLl9hcHBseU1vZGVsQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRjb25zdCByZWYgPSB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHsgZGVidWdPd25lcjogJ0NoYXRWaWV3UGFuZSNzdGFydE5ld0xvY2FsU2Vzc2lvbicgfSk7XG5cdFx0cmV0dXJuIHRoaXMuc2hvd01vZGVsKENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHJlZik7XG5cdH1cblxuXHQvKipcblx0ICogV2hlbiB0aGUgcmVtZW1iZXJlZCBvciBjb21wdXRlZCBkZWZhdWx0IHNlc3Npb24gdHlwZSBpcyBhIG5vbi1sb2NhbFxuXHQgKiBwcm92aWRlciAoZm9yIGV4YW1wbGUgd2hlbiB0aGUgYWdlbnQgaG9zdCBpcyBlbmFibGVkKSwgcmV0dXJuIGEgbmV3IHNlc3Npb25cblx0ICogcmVmZXJlbmNlIGZvciBpdCBpbnN0ZWFkIG9mIHRoZSBidWlsdC1pbiBsb2NhbCBwcm92aWRlci4gUmV0dXJuc1xuXHQgKiBgdW5kZWZpbmVkYCB0byBmYWxsIGJhY2sgdG8gYHN0YXJ0TmV3TG9jYWxTZXNzaW9uYC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgYWNxdWlyZURlZmF1bHROZXdTZXNzaW9uKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgZGVmYXVsdFR5cGUgPSBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgd29ya3NwYWNlLCB0aGlzLmFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCkpO1xuXHRcdGlmIChkZWZhdWx0VHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gZ2V0RGVmYXVsdE5ld0NoYXRTZXNzaW9uUmVzb3VyY2UodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2UsIHRoaXMuYWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UuZW5hYmxlZC5nZXQoKSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB0b2tlbiwgJ0NoYXRWaWV3UGFuZSNhY3F1aXJlRGVmYXVsdE5ld1Nlc3Npb24nKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gQSBjYW5jZWxsYXRpb24gbWVhbnMgdGhlIGNhbGxlciAoZS5nLiBgc3RhcnROZXdMb2NhbFNlc3Npb25gKVxuXHRcdFx0Ly8gZGVsaWJlcmF0ZWx5IHByZWVtcHRlZCB0aGlzIHJlc29sdXRpb247IHByb3BhZ2F0ZSBpdCBzbyB0aGVcblx0XHRcdC8vIGluaXRpYWwgYGFwcGx5TW9kZWxgIGJhaWxzIGluc3RlYWQgb2YgY3JlYXRpbmcgYSBmYWxsYmFjayBzZXNzaW9uLlxuXHRcdFx0aWYgKGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFtDaGF0Vmlld1BhbmVdIEZhaWxlZCB0byBhY3F1aXJlIGRlZmF1bHQgYWdlbnQtaG9zdCBzZXNzaW9uLCBmYWxsaW5nIGJhY2sgdG8gbG9jYWxgLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWNxdWlyZVRyYW5zZmVycmVkT3JQZXJzaXN0ZWRTZXNzaW9uKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgZGVidWdPd25lcjogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gdGhpcy5nZXRUcmFuc2ZlcnJlZE9yUGVyc2lzdGVkU2Vzc2lvbkluZm8oKTtcblx0XHRpZiAoIXNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB0b2tlbiwgZGVidWdPd25lcik7XG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaG91bGRTa2lwUmVzdG9yZWRMb2NhbFNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBtb2RlbFJlZi5vYmplY3QpKSB7XG5cdFx0XHRtb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbFJlZjtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2tpcFJlc3RvcmVkTG9jYWxTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBtb2RlbDogSUNoYXRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgZGVmYXVsdFR5cGUgPSBnZXREZWZhdWx0TmV3Q2hhdFNlc3Npb25UeXBlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuY2hhdFNlc3Npb25zU2VydmljZSwgdGhpcy5zdG9yYWdlU2VydmljZSwgd29ya3NwYWNlLCB0aGlzLmFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmVuYWJsZWQuZ2V0KCkpO1xuXHRcdHJldHVybiBkZWZhdWx0VHlwZSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGVcblx0XHRcdCYmIGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZVxuXHRcdFx0JiYgIW1vZGVsLmhhc1JlcXVlc3RzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93TW9kZWwodG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBtb2RlbFJlZj86IElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQsIHN0YXJ0TmV3U2Vzc2lvbiA9IHRydWUsIGlnbm9yZVRyYW5zZmVycmVkU2Vzc2lvbiA9IGZhbHNlLCBpbnB1dEJlZm9yZUxvYWQ/OiBzdHJpbmcpOiBQcm9taXNlPElDaGF0TW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBvbGRNb2RlbFJlc291cmNlID0gdGhpcy5tb2RlbFJlZi52YWx1ZT8ub2JqZWN0LnNlc3Npb25SZXNvdXJjZTtcblx0XHR0aGlzLm1vZGVsUmVmLnZhbHVlID0gdW5kZWZpbmVkO1xuXG5cdFx0Ly8gQmFzZWxpbmUgZHJhZnQgZm9yIHByZXNlcnZpbmcgdGV4dCB0eXBlZCBkdXJpbmcgbG9hZGluZy4gYGxvYWRTZXNzaW9uYFxuXHRcdC8vIG9wZW5zIGl0cyBsb2FkIHdpbmRvdyBiZWZvcmUgY2FsbGluZyB1cywgc28gaXQgcGFzc2VzIGl0cyBvd24gYmFzZWxpbmU7XG5cdFx0Ly8gb3RoZXJ3aXNlIHRoaXMgY2FsbCdzIG93biBhd2FpdCBpcyB0aGUgbG9hZCB3aW5kb3cuIFNlZSAjMzI1MzIzLlxuXHRcdGNvbnN0IGJhc2VsaW5lSW5wdXQgPSBpbnB1dEJlZm9yZUxvYWQgPz8gdGhpcy5fd2lkZ2V0Py5nZXRJbnB1dCgpID8/ICcnO1xuXG5cdFx0bGV0IHJlZjogSUNoYXRNb2RlbFJlZmVyZW5jZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc3RhcnROZXdTZXNzaW9uKSB7XG5cdFx0XHRpZiAobW9kZWxSZWYpIHtcblx0XHRcdFx0cmVmID0gbW9kZWxSZWY7XG5cdFx0XHR9IGVsc2UgaWYgKCFpZ25vcmVUcmFuc2ZlcnJlZFNlc3Npb24gJiYgdGhpcy5jaGF0U2VydmljZS50cmFuc2ZlcnJlZFNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRyZWYgPSBhd2FpdCB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHRoaXMuY2hhdFNlcnZpY2UudHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHRva2VuLCAnQ2hhdFZpZXdQYW5lI3Nob3dNb2RlbCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVmID0gYXdhaXQgdGhpcy5hY3F1aXJlRGVmYXVsdE5ld1Nlc3Npb24odG9rZW4pID8/IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCwgeyBkZWJ1Z093bmVyOiAnQ2hhdFZpZXdQYW5lI3Nob3dNb2RlbCcgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlZikge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBzdGFydCBjaGF0IHNlc3Npb24nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJlZj8uZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLm1vZGVsUmVmLnZhbHVlID0gcmVmO1xuXHRcdGNvbnN0IG1vZGVsID0gcmVmPy5vYmplY3Q7XG5cblx0XHRpZiAobW9kZWwpIHtcblx0XHRcdGF3YWl0IHRoaXMudXBkYXRlV2lkZ2V0TG9ja1N0YXRlKGdldENoYXRTZXNzaW9uVHlwZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpKTsgLy8gVXBkYXRlIHdpZGdldCBsb2NrIHN0YXRlIGJhc2VkIG9uIHNlc3Npb24gdHlwZVxuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5tb2RlbFJlZi52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gcmVtZW1iZXIgYXMgbW9kZWwgdG8gcmVzdG9yZSBpbiB2aWV3IHN0YXRlXG5cdFx0XHR0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uUmVzb3VyY2UgPSBtb2RlbC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRzZXRNb2RlbFByZXNlcnZpbmdJbnB1dFR5cGVkV2hpbGVMb2FkaW5nKHRoaXMuX3dpZGdldCwgYmFzZWxpbmVJbnB1dCwgKCkgPT4gdGhpcy5fd2lkZ2V0LnNldE1vZGVsKG1vZGVsKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRNb2RlbChtb2RlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRpdGxlIGNvbnRyb2xcblx0XHR0aGlzLnRpdGxlQ29udHJvbD8udXBkYXRlKG1vZGVsKTtcblxuXHRcdC8vIFVwZGF0ZSB0aGUgdG9vbGJhciBjb250ZXh0IHdpdGggbmV3IHNlc3Npb25JZFxuXHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXG5cdFx0Ly8gTWFyayB0aGUgb2xkIG1vZGVsIGFzIHJlYWQgd2hlbiBjbG9zaW5nIHVubGVzcyBleHBsaWNpdGx5IG1hcmtlZCB1bnJlYWQuXG5cdFx0Ly8gRGVmZXJyZWQgYmVjYXVzZSBzZXRSZWFkIGZpcmVzIF9vbkRpZENoYW5nZVNlc3Npb25zIHdoaWNoIHN5bmNocm9ub3VzbHlcblx0XHQvLyByZS1yZW5kZXJzIHRoZSBzZXNzaW9ucyBsaXN0ICh+MjUwbXMpLCBhbmQgdGhhdCBkb2Vzbid0IG5lZWQgdG8gYmxvY2tcblx0XHQvLyB0aGUgbmV3IGNoYXQgZnJvbSBkaXNwbGF5aW5nLlxuXHRcdGlmIChvbGRNb2RlbFJlc291cmNlKSB7XG5cdFx0XHRjb25zdCBjYXB0dXJlZE9sZFJlc291cmNlID0gb2xkTW9kZWxSZXNvdXJjZTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2xkU2Vzc2lvbiA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuZ2V0U2Vzc2lvbihjYXB0dXJlZE9sZFJlc291cmNlKTtcblx0XHRcdFx0aWYgKG9sZFNlc3Npb24gJiYgIW9sZFNlc3Npb24uaXNNYXJrZWRVbnJlYWQoKSkge1xuXHRcdFx0XHRcdG9sZFNlc3Npb24uc2V0UmVhZCh0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlV2lkZ2V0TG9ja1N0YXRlKHNlc3Npb25UeXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQudW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNhblJlc29sdmUgPSBmYWxzZTtcblx0XHR0cnkge1xuXHRcdFx0Y2FuUmVzb2x2ZSA9IGF3YWl0IHRoaXMuY2hhdFNlc3Npb25zU2VydmljZS5jYW5SZXNvbHZlQ2hhdFNlc3Npb24oc2Vzc2lvblR5cGUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRmFpbGVkIHRvIHJlc29sdmUgY2hhdCBzZXNzaW9uIHR5cGUgJyR7c2Vzc2lvblR5cGV9JyBmb3IgbG9ja2luZ2AsIGVycm9yKTtcblx0XHR9XG5cblx0XHRpZiAoIWNhblJlc29sdmUpIHtcblx0XHRcdHRoaXMuX3dpZGdldC51bmxvY2tGcm9tQ29kaW5nQWdlbnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oc2Vzc2lvblR5cGUpO1xuXHRcdGlmIChjb250cmlidXRpb24pIHtcblx0XHRcdHRoaXMuX3dpZGdldC5sb2NrVG9Db2RpbmdBZ2VudChjb250cmlidXRpb24ubmFtZSwgY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lLCBzZXNzaW9uVHlwZSwgY29udHJpYnV0aW9uLmFnZW50SG9zdFByb3ZpZGVySWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93aWRnZXQudW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCBsb2FkU2Vzc2lvbiBjYWxsIHRvIHByZXZlbnQgaXQgZnJvbVxuXHRcdC8vIG92ZXJ3cml0aW5nIHRoZSBmcmVzaCBzZXNzaW9uIHdlIGFyZSBhYm91dCB0byBjcmVhdGUuXG5cdFx0dGhpcy5sb2FkU2Vzc2lvbkN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cblx0XHQvLyBHcmFiIHRoZSB3aWRnZXQncyBsYXRlc3QgdmlldyBzdGF0ZSBiZWNhdXNlIGl0IHdpbGwgYmUgbG9hZGVkIGJhY2sgaW50byB0aGUgd2lkZ2V0XG5cdFx0dGhpcy51cGRhdGVWaWV3U3RhdGUoKTtcblx0XHRhd2FpdCB0aGlzLnNob3dNb2RlbChDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdC8vIFVwZGF0ZSB0aGUgdG9vbGJhciBjb250ZXh0IHdpdGggbmV3IHNlc3Npb25JZFxuXHRcdHRoaXMudXBkYXRlQWN0aW9ucygpO1xuXHR9XG5cblx0YXN5bmMgbG9hZFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPElDaGF0TW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB0MCA9IERhdGUubm93KCk7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdFZpZXdQYW5lXSBsb2FkU2Vzc2lvbiBzdGFydCB1cmk9JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblxuXHRcdC8vIENhcHR1cmUgdGhlIGlucHV0IGRyYWZ0IHVwIGZyb250OiB0aGUgbG9hZCB3aW5kb3cgKGNsZWFyICsgYWNxdWlyZSBiZWxvdylcblx0XHQvLyBvcGVucyBiZWZvcmUgYHNob3dNb2RlbGAgYmluZHMsIHNvIHRleHQgdHlwZWQgZHVyaW5nIGxvYWRpbmcgbXVzdCBiZVxuXHRcdC8vIGJhc2VsaW5lZCBoZXJlIHRvIGJlIHByZXNlcnZlZCByYXRoZXIgdGhhbiBlcmFzZWQuIFNlZSAjMzI1MzIzLlxuXHRcdGNvbnN0IGlucHV0QmVmb3JlTG9hZCA9IHRoaXMuX3dpZGdldD8uZ2V0SW5wdXQoKSA/PyAnJztcblxuXHRcdC8vIENhbmNlbCBhbnkgaW4tZmxpZ2h0IGxvYWRTZXNzaW9uIGNhbGwgc28gdGhlIGxhc3Qgb25lIGFsd2F5cyB3aW5zXG5cdFx0dGhpcy5sb2FkU2Vzc2lvbkN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0Y29uc3QgY3RzID0gdGhpcy5sb2FkU2Vzc2lvbkN0cy52YWx1ZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHRva2VuID0gY3RzLnRva2VuO1xuXG5cdFx0Ly8gV2FpdCBmb3IgYW55IGluLXByb2dyZXNzIHNlc3Npb24gcmVzdG9yZSAoZS5nLiBmcm9tIG9uRGlkQ2hhbmdlQWdlbnRzKVxuXHRcdC8vIHRvIGZpbmlzaCBmaXJzdCwgc28gb3VyIHNob3dNb2RlbCBjYWxsIGlzIGd1YXJhbnRlZWQgdG8gYmUgdGhlIGxhc3Qgb25lLlxuXHRcdGlmICh0aGlzLnJlc3RvcmluZ1Nlc3Npb24pIHtcblx0XHRcdGF3YWl0IHRoaXMucmVzdG9yaW5nU2Vzc2lvbjtcblx0XHR9XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0NoYXRWaWV3UGFuZV0gbG9hZFNlc3Npb24gZG9uZSB0b3RhbD0ke0RhdGUubm93KCkgLSB0MH1tcyB1cmk9JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gY2FuY2VsbGVkPXRydWUgcGhhc2U9cHJlQWNxdWlyZWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IENoYXRWaWV3SWQsIGRlbGF5OiAyMDAgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IHF1ZXVlOiBQcm9taXNlPHZvaWQ+ID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cblx0XHRcdC8vIEEgZGVsYXkgaGVyZSB0byBhdm9pZCBibGlua2luZyBiZWNhdXNlIG9ubHkgQ2xvdWQgc2Vzc2lvbnMgYXJlIHNsb3csIG1vc3Qgb3RoZXJzIGFyZSBmYXN0XG5cdFx0XHRjb25zdCBjbGVhcldpZGdldCA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Ly8gT25seSBjbGVhciB0aGUgY3VycmVudCBtb2RlbCBpZiB0aGlzIGxvYWRTZXNzaW9uIGNhbGwgaXMgc3RpbGwgdGhlIGFjdGl2ZSBvbmVcblx0XHRcdFx0Ly8gYW5kIGhhcyBub3QgYmVlbiBjYW5jZWxsZWQuIFRoaXMgcHJlc2VydmVzIHRoZSBcImxhc3QgY2FsbCB3aW5zXCIgYmVoYXZpb3IuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCB0aGlzLmxvYWRTZXNzaW9uQ3RzLnZhbHVlICE9PSBjdHMpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gY2xlYXIgY3VycmVudCBtb2RlbCB3aXRob3V0IHN0YXJ0aW5nIGEgbmV3IG9uZVxuXHRcdFx0XHRxdWV1ZSA9IHRoaXMuc2hvd01vZGVsKHRva2VuLCB1bmRlZmluZWQsIGZhbHNlKS50aGVuKCgpID0+IHsgfSk7XG5cdFx0XHR9LCAxMDApO1xuXHRcdFx0Y29uc3QgY2xlYXJXaWRnZXRDYW5jZWxsYXRpb25MaXN0ZW5lciA9IHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGNsZWFyV2lkZ2V0LmRpc3Bvc2UoKSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG5ld01vZGVsUmVmID0gYXdhaXQgdGhpcy5jaGF0U2VydmljZS5hY3F1aXJlT3JMb2FkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIHRva2VuLCAnQ2hhdFZpZXdQYW5lI2xvYWRTZXNzaW9uJyk7XG5cdFx0XHRcdGNsZWFyV2lkZ2V0LmRpc3Bvc2UoKTtcblx0XHRcdFx0YXdhaXQgcXVldWU7XG5cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0bmV3TW9kZWxSZWY/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtDaGF0Vmlld1BhbmVdIGxvYWRTZXNzaW9uIGRvbmUgdG90YWw9JHtEYXRlLm5vdygpIC0gdDB9bXMgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IGNhbmNlbGxlZD10cnVlIHBoYXNlPXBvc3RBY3F1aXJlYCk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2hvd01vZGVsKHRva2VuLCBuZXdNb2RlbFJlZiwgdHJ1ZSwgZmFsc2UsIGlucHV0QmVmb3JlTG9hZCk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0NoYXRWaWV3UGFuZV0gbG9hZFNlc3Npb24gZG9uZSB0b3RhbD0ke0RhdGUubm93KCkgLSB0MH1tcyB1cmk9JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRjbGVhcldpZGdldC5kaXNwb3NlKCk7XG5cdFx0XHRcdGF3YWl0IHF1ZXVlO1xuXG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0NoYXRWaWV3UGFuZV0gbG9hZFNlc3Npb24gZG9uZSB0b3RhbD0ke0RhdGUubm93KCkgLSB0MH1tcyB1cmk9JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gY2FuY2VsbGVkPXRydWUgcGhhc2U9ZXJyb3JgKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVjb3ZlciBieSBzdGFydGluZyBhIGZyZXNoIGVtcHR5IHNlc3Npb24gc28gdGhlIHdpZGdldFxuXHRcdFx0XHQvLyBpcyBub3QgbGVmdCBpbiBhIGJyb2tlbiBzdGF0ZSB3aXRob3V0IHRpdGxlIG9yIGJhY2sgYnV0dG9uLlxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBsb2FkIGNoYXQgc2Vzc2lvbiAnJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0nYCwgZXJyKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjaGF0LmxvYWRTZXNzaW9uRmFpbGVkJywgXCJGYWlsZWQgdG8gb3BlbiBjaGF0IHNlc3Npb246IHswfVwiLCB0b0Vycm9yTWVzc2FnZShlcnIpKSk7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2hvd01vZGVsKHRva2VuLCB1bmRlZmluZWQsIHRydWUsIGZhbHNlLCBpbnB1dEJlZm9yZUxvYWQpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtDaGF0Vmlld1BhbmVdIGxvYWRTZXNzaW9uIGRvbmUgdG90YWw9JHtEYXRlLm5vdygpIC0gdDB9bXMgdXJpPSR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IGVycm9yPXRydWVgKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGNsZWFyV2lkZ2V0Q2FuY2VsbGF0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdHRoaXMuZm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0Zm9jdXNJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuZm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0Zm9jdXNTZXNzaW9ucygpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5zZXNzaW9uc0NvbnRhaW5lcj8uc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIG5vdCB2aXNpYmxlXG5cdFx0fVxuXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2w/LmZvY3VzKCk7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBMYXlvdXRcblxuXHRwcml2YXRlIGxheW91dGluZ0JvZHkgPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlbGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2lkZ2V0Py52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubGFzdERpbWVuc2lvbnMpIHtcblx0XHRcdHRoaXMubGF5b3V0Qm9keSh0aGlzLmxhc3REaW1lbnNpb25zLmhlaWdodCwgdGhpcy5sYXN0RGltZW5zaW9ucy53aWR0aCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWxheW91dEZvcklucHV0SGVpZ2h0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxheW91dGluZ0JvZHkgfHwgIXRoaXMuX3dpZGdldD8udmlzaWJsZSB8fCAhdGhpcy5sYXN0RGltZW5zaW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0Q2hhdEFuZFNlc3Npb25zKHRoaXMubGFzdERpbWVuc2lvbnMuaGVpZ2h0LCB0aGlzLmxhc3REaW1lbnNpb25zLndpZHRoLCBmYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxheW91dGluZ0JvZHkpIHtcblx0XHRcdHJldHVybjsgLy8gcHJldmVudCByZS1lbnRyYW5jeVxuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0aW5nQm9keSA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuZG9MYXlvdXRCb2R5KGhlaWdodCwgd2lkdGgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmxheW91dGluZ0JvZHkgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvTGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cblx0XHR0aGlzLmxhc3REaW1lbnNpb25zID0geyBoZWlnaHQsIHdpZHRoIH07XG5cdFx0dGhpcy5sYXlvdXRDaGF0QW5kU2Vzc2lvbnMoaGVpZ2h0LCB3aWR0aCwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dENoYXRBbmRTZXNzaW9ucyhoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlciwgbGF5b3V0SW5wdXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQgcmVtYWluaW5nSGVpZ2h0ID0gaGVpZ2h0O1xuXHRcdGNvbnN0IHJlbWFpbmluZ1dpZHRoID0gd2lkdGg7XG5cblx0XHQvLyBWb2ljZSBiYXIgaXMgbm93IGluc2lkZSB0aGUgaW5wdXQgY29udGFpbmVyLCBubyBzZXBhcmF0ZSBoZWlnaHQgZGVkdWN0aW9uIG5lZWRlZFxuXG5cdFx0Ly8gVGl0bGUgQ29udHJvbFxuXHRcdGNvbnN0IHRpdGxlSGVpZ2h0ID0gdGhpcy50aXRsZUNvbnRyb2w/LmdldEhlaWdodCgpID8/IDA7XG5cdFx0cmVtYWluaW5nSGVpZ2h0IC09IHRpdGxlSGVpZ2h0O1xuXG5cdFx0Ly8gU2Vzc2lvbnMgQ29udHJvbFxuXHRcdGNvbnN0IHsgaGVpZ2h0UmVkdWN0aW9uLCB3aWR0aFJlZHVjdGlvbiB9ID0gdGhpcy5sYXlvdXRTZXNzaW9uc0NvbnRyb2wocmVtYWluaW5nSGVpZ2h0LCByZW1haW5pbmdXaWR0aCk7XG5cblx0XHQvLyBJbiBzdGFja2VkIG1vZGUgdGhlIHNlc3Npb25zIHZpZXdlciBzaXRzIGFib3ZlIHRoZSBjaGF0IHdpZGdldCwgc28gdGhlXG5cdFx0Ly8gd2lkZ2V0J3MgbGF5b3V0IGhlaWdodCBpcyByZWR1Y2VkIGJ5IGBoZWlnaHRSZWR1Y3Rpb25gLiBIb3dldmVyLCB0aGUgaW5wdXRcblx0XHQvLyBwYXJ0J3MgbWF4LWhlaWdodCBuZWVkcyB0byBiZSBiYXNlZCBvbiB0aGUgZnVsbCBgcmVtYWluaW5nSGVpZ2h0YCAoYmVmb3JlXG5cdFx0Ly8gdGhlIHNlc3Npb25zIHZpZXdlciBkZWR1Y3Rpb24pIHNvIHRoZSBpbnB1dCBjYW4gZ3JvdyBmcmVlbHkuIEFzIHRoZSBpbnB1dFxuXHRcdC8vIGdyb3dzLCBhbiBhdXRvcnVuIHRyaWdnZXJzIHJlbGF5b3V0IHdoaWNoIHNocmlua3MgdGhlIHNlc3Npb25zIHZpZXdlcixcblx0XHQvLyBnaXZpbmcgdGhlIHdpZGdldCBtb3JlIHNwYWNlIGFuZCBjb252ZXJnaW5nIHRvIHRoZSByaWdodCBzaXplcy5cblx0XHRjb25zdCBpbnB1dE1heEhlaWdodCA9IHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQgPyByZW1haW5pbmdIZWlnaHQgOiB1bmRlZmluZWQ7XG5cblx0XHQvLyBDaGF0IFdpZGdldFxuXHRcdGlmIChsYXlvdXRJbnB1dCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldElucHV0UGFydE1heEhlaWdodE92ZXJyaWRlKGlucHV0TWF4SGVpZ2h0KTtcblx0XHRcdHRoaXMuX3dpZGdldC5sYXlvdXQocmVtYWluaW5nSGVpZ2h0IC0gaGVpZ2h0UmVkdWN0aW9uLCByZW1haW5pbmdXaWR0aCAtIHdpZHRoUmVkdWN0aW9uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGF5b3V0Q2hhdFdpZGdldEZvcklucHV0SGVpZ2h0KHRoaXMuX3dpZGdldCwgaW5wdXRNYXhIZWlnaHQsIHJlbWFpbmluZ0hlaWdodCAtIGhlaWdodFJlZHVjdGlvbiwgcmVtYWluaW5nV2lkdGggLSB3aWR0aFJlZHVjdGlvbik7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgbGFzdCBkaW1lbnNpb25zIHBlciBvcmllbnRhdGlvblxuXHRcdHRoaXMubGFzdERpbWVuc2lvbnNQZXJPcmllbnRhdGlvbi5zZXQodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLCB7IGhlaWdodCwgd2lkdGggfSk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFNlc3Npb25zQ29udHJvbChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHsgaGVpZ2h0UmVkdWN0aW9uOiBudW1iZXI7IHdpZHRoUmVkdWN0aW9uOiBudW1iZXIgfSB7XG5cdFx0bGV0IGhlaWdodFJlZHVjdGlvbiA9IDA7XG5cdFx0bGV0IHdpZHRoUmVkdWN0aW9uID0gMDtcblxuXHRcdGlmICghdGhpcy5zZXNzaW9uc0NvbnRhaW5lciB8fCAhdGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIgfHwgIXRoaXMuc2Vzc2lvbnNDb250cm9sIHx8ICF0aGlzLnZpZXdQYW5lQ29udGFpbmVyIHx8ICF0aGlzLnNlc3Npb25zVGl0bGVDb250YWluZXIgfHwgIXRoaXMuc2Vzc2lvbnNUaXRsZSkge1xuXHRcdFx0cmV0dXJuIHsgaGVpZ2h0UmVkdWN0aW9uLCB3aWR0aFJlZHVjdGlvbiB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPSB0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb247XG5cdFx0bGV0IG5ld1Nlc3Npb25zVmlld2VyT3JpZW50YXRpb246IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbjtcblx0XHRzd2l0Y2ggKHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbkNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdC8vIFN0YWNrZWRcblx0XHRcdGNhc2UgJ3N0YWNrZWQnOlxuXHRcdFx0XHRuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Ly8gVXBkYXRlIG9yaWVudGF0aW9uIGJhc2VkIG9uIGF2YWlsYWJsZSB3aWR0aFxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0bmV3U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9IHdpZHRoID49IENoYXRWaWV3UGFuZS5TRVNTSU9OU19TSURFQkFSX1ZJRVdfTUlOX1dJRFRIID8gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlNpZGVCeVNpZGUgOiBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZDtcblx0XHR9XG5cblx0XHR0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPSBuZXdTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uO1xuXG5cdFx0aWYgKG5ld1Nlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlKSB7XG5cdFx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3Nlc3Npb25zLWNvbnRyb2wtb3JpZW50YXRpb24tc2lkZWJ5c2lkZScsIHRydWUpO1xuXHRcdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzZXNzaW9ucy1jb250cm9sLW9yaWVudGF0aW9uLXN0YWNrZWQnLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb25Db250ZXh0LnNldChBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlld1BhbmVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2Vzc2lvbnMtY29udHJvbC1vcmllbnRhdGlvbi1zaWRlYnlzaWRlJywgZmFsc2UpO1xuXHRcdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzZXNzaW9ucy1jb250cm9sLW9yaWVudGF0aW9uLXN0YWNrZWQnLCB0cnVlKTtcblx0XHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbkNvbnRleHQuc2V0KEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TdGFja2VkKTtcblx0XHR9XG5cblx0XHRpZiAob2xkU2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiAhPT0gdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uKSB7XG5cdFx0XHRjb25zdCB1cGRhdGVQcm9taXNlID0gdGhpcy5zZXNzaW9uc0NvbnRyb2wudXBkYXRlKCk7IC8vIENoYW5naW5nIG9yaWVudGF0aW9uIGhhcyBhbiBpbXBhY3QgdG8gZ3JvdXBpbmcsIHNvIHdlIG5lZWQgdG8gdXBkYXRlXG5cblx0XHRcdC8vIFN3aXRjaGluZyB0byBzaWRlLWJ5LXNpZGUsIHJldmVhbCB0aGUgY3VycmVudCBzZXNzaW9uIGFmdGVyIGVsZW1lbnRzIGhhdmUgbG9hZGVkXG5cdFx0XHRpZiAodGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU2lkZUJ5U2lkZSkge1xuXHRcdFx0XHR1cGRhdGVQcm9taXNlLnRoZW4oZGlkVXBkYXRlID0+IHtcblx0XHRcdFx0XHRpZiAoIWRpZFVwZGF0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHRoaXMuX3dpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdFx0aWYgKHNlc3Npb25SZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2w/LnJldmVhbChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIHZpc2liaWxpdHkgaXMgaW4gc3luYyBiZWZvcmUgd2UgbGF5b3V0XG5cdFx0Y29uc3QgeyB2aXNpYmxlOiBzZXNzaW9uc0NvbnRhaW5lclZpc2libGUgfSA9IHRoaXMudXBkYXRlU2Vzc2lvbnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXG5cdFx0Ly8gSGFuZGxlIFNhc2ggKG9ubHkgdmlzaWJsZSBpbiBzaWRlLWJ5LXNpZGUpXG5cdFx0aWYgKCFzZXNzaW9uc0NvbnRhaW5lclZpc2libGUgfHwgdGhpcy5zZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uID09PSBBZ2VudFNlc3Npb25zVmlld2VyT3JpZW50YXRpb24uU3RhY2tlZCkge1xuXHRcdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclNhc2hEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclNhc2ggPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlKSB7XG5cdFx0XHRpZiAoIXRoaXMuc2Vzc2lvbnNWaWV3ZXJTYXNoRGlzcG9zYWJsZXMudmFsdWUgJiYgdGhpcy52aWV3UGFuZUNvbnRhaW5lcikge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVNlc3Npb25zVmlld2VyU2FzaCh0aGlzLnZpZXdQYW5lQ29udGFpbmVyLCBoZWlnaHQsIHdpZHRoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNlc3Npb25zQ29udGFpbmVyVmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuIHsgaGVpZ2h0UmVkdWN0aW9uOiAwLCB3aWR0aFJlZHVjdGlvbjogMCB9O1xuXHRcdH1cblxuXHRcdGxldCBhdmFpbGFibGVTZXNzaW9uc0hlaWdodCA9IGhlaWdodCAtIHRoaXMuc2Vzc2lvbnNUaXRsZUNvbnRhaW5lci5vZmZzZXRIZWlnaHQ7XG5cdFx0aWYgKHRoaXMuc2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbiA9PT0gQWdlbnRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uLlN0YWNrZWQpIHtcblx0XHRcdGF2YWlsYWJsZVNlc3Npb25zSGVpZ2h0IC09IE1hdGgubWF4KENoYXRWaWV3UGFuZS5NSU5fQ0hBVF9XSURHRVRfSEVJR0hULCB0aGlzLl93aWRnZXQ/LmlucHV0Py5oZWlnaHQuZ2V0KCkgPz8gMCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF2YWlsYWJsZVNlc3Npb25zSGVpZ2h0IC09IHRoaXMuc2Vzc2lvbnNOZXdCdXR0b25Db250YWluZXI/Lm9mZnNldEhlaWdodCA/PyAwO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgYXMgc2lkZWJhclxuXHRcdGlmICh0aGlzLnNlc3Npb25zVmlld2VyT3JpZW50YXRpb24gPT09IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbi5TaWRlQnlTaWRlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCA9IHRoaXMuY29tcHV0ZUVmZmVjdGl2ZVNpZGVCeVNpZGVTZXNzaW9uc1NpZGViYXJXaWR0aCh3aWR0aCk7XG5cblx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2F2YWlsYWJsZVNlc3Npb25zSGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7c2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGh9cHhgO1xuXHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wubGF5b3V0KGF2YWlsYWJsZVNlc3Npb25zSGVpZ2h0LCBzZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCk7XG5cdFx0XHR0aGlzLnNlc3Npb25zVmlld2VyU2FzaD8ubGF5b3V0KCk7XG5cblx0XHRcdGhlaWdodFJlZHVjdGlvbiA9IDA7IC8vIHNpZGUgYnkgc2lkZSB0byBjaGF0IHdpZGdldFxuXHRcdFx0d2lkdGhSZWR1Y3Rpb24gPSB0aGlzLnNlc3Npb25zQ29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgc3RhY2tlZFxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7YXZhaWxhYmxlU2Vzc2lvbnNIZWlnaHR9cHhgO1xuXHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIuc3R5bGUud2lkdGggPSBgYDtcblx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sLmxheW91dChhdmFpbGFibGVTZXNzaW9uc0hlaWdodCwgd2lkdGgpO1xuXG5cdFx0XHRoZWlnaHRSZWR1Y3Rpb24gPSB0aGlzLnNlc3Npb25zQ29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHRcdHdpZHRoUmVkdWN0aW9uID0gMDsgLy8gc3RhY2tlZCBvbiB0b3Agb2YgdGhlIGNoYXQgd2lkZ2V0XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgaGVpZ2h0UmVkdWN0aW9uLCB3aWR0aFJlZHVjdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlRWZmZWN0aXZlU2lkZUJ5U2lkZVNlc3Npb25zU2lkZWJhcldpZHRoKHdpZHRoOiBudW1iZXIsIHNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoID0gdGhpcy5zZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgubWF4KFxuXHRcdFx0Q2hhdFZpZXdQYW5lLlNFU1NJT05TX1NJREVCQVJfTUlOX1dJRFRILFx0XHRcdC8vIG5ldmVyIHNtYWxsZXIgdGhhbiBtaW4gd2lkdGggZm9yIHNpZGUgYnkgc2lkZSBzZXNzaW9uc1xuXHRcdFx0TWF0aC5taW4oXG5cdFx0XHRcdHNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoLFxuXHRcdFx0XHR3aWR0aCAtIENoYXRWaWV3UGFuZS5DSEFUX1dJREdFVF9ERUZBVUxUX1dJRFRIXHQvLyBuZXZlciBzbyB3aWRlIHRoYXQgY2hhdCB3aWRnZXQgaXMgc21hbGxlciB0aGFuIGRlZmF1bHQgd2lkdGhcblx0XHRcdClcblx0XHQpO1xuXHR9XG5cblx0Z2V0TGFzdERpbWVuc2lvbnMob3JpZW50YXRpb246IEFnZW50U2Vzc2lvbnNWaWV3ZXJPcmllbnRhdGlvbik6IHsgaGVpZ2h0OiBudW1iZXI7IHdpZHRoOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMubGFzdERpbWVuc2lvbnNQZXJPcmllbnRhdGlvbi5nZXQob3JpZW50YXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXNzaW9uc1ZpZXdlclNhc2goY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IHRoaXMuc2Vzc2lvbnNWaWV3ZXJTYXNoRGlzcG9zYWJsZXMudmFsdWUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBzYXNoID0gdGhpcy5zZXNzaW9uc1ZpZXdlclNhc2ggPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNhc2goY29udGFpbmVyLCB7XG5cdFx0XHRnZXRWZXJ0aWNhbFNhc2hMZWZ0OiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoID0gdGhpcy5jb21wdXRlRWZmZWN0aXZlU2lkZUJ5U2lkZVNlc3Npb25zU2lkZWJhcldpZHRoKHRoaXMubGFzdERpbWVuc2lvbnM/LndpZHRoID8/IHdpZHRoKTtcblx0XHRcdFx0Y29uc3QgeyBwb3NpdGlvbiB9ID0gdGhpcy5nZXRWaWV3UG9zaXRpb25BbmRMb2NhdGlvbigpO1xuXHRcdFx0XHRpZiAocG9zaXRpb24gPT09IFBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRcdFx0cmV0dXJuICh0aGlzLmxhc3REaW1lbnNpb25zPy53aWR0aCA/PyB3aWR0aCkgLSBzZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aDtcblx0XHRcdH1cblx0XHR9LCB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCB9KSk7XG5cblx0XHRsZXQgc2FzaFN0YXJ0V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2FzaC5vbkRpZFN0YXJ0KCgpID0+IHNhc2hTdGFydFdpZHRoID0gdGhpcy5zZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkRW5kKCgpID0+IHNhc2hTdGFydFdpZHRoID0gdW5kZWZpbmVkKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2FzaC5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChzYXNoU3RhcnRXaWR0aCA9PT0gdW5kZWZpbmVkIHx8ICF0aGlzLmxhc3REaW1lbnNpb25zKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgeyBwb3NpdGlvbiB9ID0gdGhpcy5nZXRWaWV3UG9zaXRpb25BbmRMb2NhdGlvbigpO1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBlLmN1cnJlbnRYIC0gZS5zdGFydFg7XG5cdFx0XHRjb25zdCBuZXdXaWR0aCA9IHBvc2l0aW9uID09PSBQb3NpdGlvbi5SSUdIVCA/IHNhc2hTdGFydFdpZHRoIC0gZGVsdGEgOiBzYXNoU3RhcnRXaWR0aCArIGRlbHRhO1xuXG5cdFx0XHRpZiAobmV3V2lkdGggPCBDaGF0Vmlld1BhbmUuU0VTU0lPTlNfU0lERUJBUl9TTkFQX1RIUkVTSE9MRCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyZWRTZXNzaW9uc1ZpZXdlck9yaWVudGF0aW9uKCdzdGFja2VkJyk7IC8vIHNuYXAgdG8gc3RhY2tlZCB3aGVuIHNpemVkIHNtYWxsIGVub3VnaFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGggPSB0aGlzLmNvbXB1dGVFZmZlY3RpdmVTaWRlQnlTaWRlU2Vzc2lvbnNTaWRlYmFyV2lkdGgodGhpcy5sYXN0RGltZW5zaW9ucy53aWR0aCwgbmV3V2lkdGgpO1xuXHRcdFx0dGhpcy52aWV3U3RhdGUuc2Vzc2lvbnNTaWRlYmFyV2lkdGggPSB0aGlzLnNlc3Npb25zVmlld2VyU2lkZWJhcldpZHRoO1xuXG5cdFx0XHR0aGlzLmxheW91dEJvZHkodGhpcy5sYXN0RGltZW5zaW9ucy5oZWlnaHQsIHRoaXMubGFzdERpbWVuc2lvbnMud2lkdGgpO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzYXNoLm9uRGlkUmVzZXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXNzaW9uc1ZpZXdlclNpZGViYXJXaWR0aCA9IENoYXRWaWV3UGFuZS5TRVNTSU9OU19TSURFQkFSX0RFRkFVTFRfV0lEVEg7XG5cdFx0XHR0aGlzLnZpZXdTdGF0ZS5zZXNzaW9uc1NpZGViYXJXaWR0aCA9IHRoaXMuc2Vzc2lvbnNWaWV3ZXJTaWRlYmFyV2lkdGg7XG5cblx0XHRcdHRoaXMucmVsYXlvdXQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBEb24ndCBkbyBzYXZlU3RhdGUgd2hlbiBubyB3aWRnZXQsIG9yIG5vIHZpZXdNb2RlbCBpbiB3aGljaCBjYXNlXG5cdFx0Ly8gdGhlIHN0YXRlIGhhcyBub3QgeWV0IGJlZW4gcmVzdG9yZWQgLSBpbiB0aGF0IGNhc2UgdGhlIGRlZmF1bHRcblx0XHQvLyBzdGF0ZSB3b3VsZCBvdmVyd3JpdGUgdGhlIHJlYWwgc3RhdGVcblx0XHRpZiAodGhpcy5fd2lkZ2V0Py52aWV3TW9kZWwpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zYXZlU3RhdGUoKTtcblxuXHRcdFx0dGhpcy51cGRhdGVWaWV3U3RhdGUoKTtcblx0XHRcdHRoaXMubWVtZW50by5zYXZlTWVtZW50bygpO1xuXHRcdH1cblxuXHRcdHN1cGVyLnNhdmVTdGF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVWaWV3U3RhdGUodmlld1N0YXRlPzogSUNoYXRNb2RlbElucHV0U3RhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdWaWV3U3RhdGUgPSB2aWV3U3RhdGUgPz8gdGhpcy5fd2lkZ2V0LmdldFZpZXdTdGF0ZSgpO1xuXHRcdGlmIChuZXdWaWV3U3RhdGUpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG5ld1ZpZXdTdGF0ZSkpIHtcblx0XHRcdFx0KHRoaXMudmlld1N0YXRlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVtrZXldID0gdmFsdWU7IC8vIEFzc2lnbiBhbGwgcHJvcHMgdG8gdGhlIG1lbWVudG8gc28gdGhleSBnZXQgc2F2ZWRcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzaG91bGRTaG93V2VsY29tZSgpOiBib29sZWFuIHtcblx0XHRjb25zdCBub1BlcnNpc3RlZFNlc3Npb25zID0gIXRoaXMuY2hhdFNlcnZpY2UuaGFzU2Vzc2lvbnMoKTtcblx0XHRjb25zdCBoYXNDb3JlQWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnRzKCkuc29tZShhZ2VudCA9PiBhZ2VudC5pc0NvcmUgJiYgYWdlbnQubG9jYXRpb25zLmluY2x1ZGVzKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpKTtcblx0XHRjb25zdCBoYXNEZWZhdWx0QWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpICE9PSB1bmRlZmluZWQ7IC8vIG9ubHkgZmFsc2Ugd2hlbiBIaWRlIEFJIEZlYXR1cmVzIGhhcyBydW4gYW5kIHVucmVnaXN0ZXJlZCB0aGUgc2V0dXAgYWdlbnRzXG5cdFx0Y29uc3Qgc2hvdWxkU2hvdyA9ICFoYXNDb3JlQWdlbnQgJiYgKCFoYXNEZWZhdWx0QWdlbnQgfHwgIXRoaXMuX3dpZGdldD8udmlld01vZGVsICYmIG5vUGVyc2lzdGVkU2Vzc2lvbnMpO1xuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBDaGF0Vmlld1BhbmUjc2hvdWxkU2hvd1dlbGNvbWUoKSA9ICR7c2hvdWxkU2hvd306IGhhc0NvcmVBZ2VudD0ke2hhc0NvcmVBZ2VudH0gaGFzRGVmYXVsdEFnZW50PSR7aGFzRGVmYXVsdEFnZW50fSB8fCBub1ZpZXdNb2RlbD0keyF0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbH0gJiYgbm9QZXJzaXN0ZWRTZXNzaW9ucz0ke25vUGVyc2lzdGVkU2Vzc2lvbnN9YCk7XG5cblx0XHRyZXR1cm4gISFzaG91bGRTaG93O1xuXHR9XG5cblx0Z2V0TWF0Y2hpbmdXZWxjb21lVmlldygpOiBJQ2hhdFZpZXdzV2VsY29tZURlc2NyaXB0b3IgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLndlbGNvbWVDb250cm9sbGVyPy5nZXRNYXRjaGluZ1dlbGNvbWVWaWV3KCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRBY3Rpb25zQ29udGV4dCgpOiBJQ2hhdFZpZXdUaXRsZUFjdGlvbkNvbnRleHQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQ/LnZpZXdNb2RlbCA/IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdGhpcy5fd2lkZ2V0LnZpZXdNb2RlbC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHQkbWlkOiBNYXJzaGFsbGVkSWQuQ2hhdFZpZXdDb250ZXh0XG5cdFx0fSA6IHVuZGVmaW5lZDtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsYUFBYSxXQUFXLFdBQVcscUJBQXFCO0FBQ25HLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsY0FBYztBQUN2QixTQUFTLGFBQWEsWUFBWTtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNB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
