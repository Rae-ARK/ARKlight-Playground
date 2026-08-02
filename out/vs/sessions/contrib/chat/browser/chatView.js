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
import "./media/chatView.css";
import "./media/voiceChatView.css";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IMicCaptureService } from "../../../../workbench/contrib/chat/browser/voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../../../workbench/contrib/chat/browser/voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../../../workbench/contrib/chat/browser/voiceClient/voiceSessionController.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { EDITOR_DRAG_AND_DROP_BACKGROUND } from "../../../../workbench/common/theme.js";
import { ChatWidget } from "../../../../workbench/contrib/chat/browser/widget/chatWidget.js";
import { setModelPreservingInputTypedWhileLoading } from "../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../workbench/contrib/chat/common/constants.js";
import { getChatSessionType } from "../../../../workbench/contrib/chat/common/model/chatUri.js";
import { IChatSessionsService, localChatSessionType } from "../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { AbstractChatView } from "../../../browser/parts/chatView.js";
import { ChatInteractivity } from "../../../services/sessions/common/session.js";
import { NewChatWidget } from "./newChatWidget.js";
import { NewChatInSessionWidget } from "./newChatInSessionWidget.js";
import { SessionInputBanners } from "../../sessionInputBanners/browser/sessionInputBanners.js";
import { SessionChatInputToolbar } from "./sessionChatInputToolbar.js";
import { ResponseSelectionSideChatController } from "./responseSelectionSideChatController.js";
import { ISessionChatPillsDebugService } from "./sessionChatInputToolbarDebug.js";
import { AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING } from "./sessionsChatHistory.js";
import { activeSessionViewBackground, activeSessionViewForeground, agentsPanelBackground, inactiveSessionViewBackground, inactiveSessionViewForeground } from "../../../common/theme.js";
import { isEqual } from "../../../../base/common/resources.js";
import { setupVoiceInputDecorations } from "./voiceInputDecorations.js";
import { INewChatVoiceTargetService } from "./newChatVoice.js";
let NewChatView = class extends AbstractChatView {
  constructor(isNewChatInSession, options, instantiationService) {
    super();
    this.element.classList.add("chat-view-new");
    this.kind = isNewChatInSession ? "newChatInSession" : "newSession";
    this._widget = this._register(isNewChatInSession ? instantiationService.createInstance(NewChatInSessionWidget, options) : instantiationService.createInstance(NewChatWidget, options));
    this._widget.render(this.element);
  }
  toJSON() {
    return { type: NewChatView.TYPE };
  }
  doLayout(width, height, _top, _left) {
    this._widget.layout(height, width);
  }
  focus() {
    this._widget.focusInput();
  }
  selectWorkspace(folderUri, providerId) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.selectWorkspace(folderUri, providerId);
    }
  }
  prefillInput(text) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.prefillInput(text);
    }
  }
  sendQuery(text) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.sendQuery(text);
    }
  }
  submitInput() {
    return this._widget instanceof NewChatWidget ? this._widget.submitInput() : Promise.resolve(false);
  }
  attach(uris) {
    this._widget.attach(uris);
  }
  setVisible(visible) {
    if (this._widget instanceof NewChatWidget) {
      this._widget.setHostVisible(visible);
    }
  }
};
NewChatView.TYPE = "sessions.newSession";
NewChatView = __decorateClass([
  __decorateParam(2, IInstantiationService)
], NewChatView);
let ChatView = class extends AbstractChatView {
  constructor(instantiationService, contextKeyService, chatService, chatSessionsService, configurationService, logService, keybindingService, themeService, accessibilityService, voiceSessionController, micCaptureService, ttsPlaybackService, chatPillsDebugService, newChatVoiceTargetService) {
    super();
    this.chatService = chatService;
    this.chatSessionsService = chatSessionsService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.keybindingService = keybindingService;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
    this.voiceSessionController = voiceSessionController;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.chatPillsDebugService = chatPillsDebugService;
    this.newChatVoiceTargetService = newChatVoiceTargetService;
    this.kind = "chat";
    /** Reference to the loaded chat model; disposing releases the model. */
    this._modelRef = this._register(new MutableDisposable());
    /** Cancels any in-flight model load when a new session is set or the view disposes. */
    this._loadCts = this._register(new MutableDisposable());
    /** Tracks the current chat's interactivity and hides the input for read-only chats. */
    this._interactiveDisposable = this._register(new MutableDisposable());
    /** Whether this view currently represents the active session. */
    this._isActive = true;
    /** Observable mirror of {@link _isActive} so the voice overlay can react. */
    this._isActiveObs = observableValue(this, true);
    this.element.classList.add("chat-view-chat");
    const scopedContextKeyService = this._register(contextKeyService.createScoped(this.element));
    const scopedInstantiationService = this._register(instantiationService.createChild(
      new ServiceCollection([IContextKeyService, scopedContextKeyService])
    ));
    this._voiceInitiatedHereKey = scopedContextKeyService.createKey("agentsVoiceInitiatedHere", false);
    this._widget = this._register(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      void 0,
      {
        autoScroll: (mode) => mode !== ChatModeKind.Ask,
        renderFollowups: true,
        supportsFileReferences: true,
        rendererOptions: {
          referencesExpandedWhenEmptyResponse: false,
          progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
        },
        enableImplicitContext: true,
        enableWorkingSet: "implicit",
        supportsChangingModes: true,
        inputEditorMinLines: 2,
        isSessionsWindow: true
      },
      this._buildStyles(this._isActive)
    ));
    this._widget.render(this.element);
    this._selectionSideChatController = this._register(scopedInstantiationService.createInstance(ResponseSelectionSideChatController, this._widget));
    this._banners = this._register(instantiationService.createInstance(SessionInputBanners));
    this._banners.setActive(this._isActive);
    this._chatPills = this._register(instantiationService.createInstance(SessionChatInputToolbar));
    this._register(chatPillsDebugService.register(this._chatPills, this._banners, this._isActiveObs));
    this._ensureBannersMounted();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING)) {
        this._applyHistoryKey();
      }
    }));
    this._setupVoiceOverlay();
    this._register(autorun((reader) => {
      const active = this._isActiveObs.read(reader);
      const voiceActive = this.voiceSessionController.isConnected.read(reader) || this.voiceSessionController.isConnecting.read(reader);
      this._voiceInitiatedHereKey.set(active && voiceActive);
    }));
  }
  dispose() {
    this._loadCts.value?.cancel();
    super.dispose();
  }
  _buildStyles(active) {
    return {
      listForeground: active ? activeSessionViewForeground : inactiveSessionViewForeground,
      listBackground: active ? activeSessionViewBackground : inactiveSessionViewBackground,
      overlayBackground: EDITOR_DRAG_AND_DROP_BACKGROUND,
      inputEditorBackground: inactiveSessionViewBackground,
      resultEditorBackground: agentsPanelBackground
    };
  }
  /** The underlying chat widget. */
  get widget() {
    return this._widget;
  }
  setChat(chat, historyKey) {
    this.chatPillsDebugService.clear(this._chatPills);
    const resource = chat.resource;
    this._historyKey = historyKey;
    this._applyHistoryKey();
    this._chatPills.setChat(chat);
    this._selectionSideChatController.setChat(chat);
    this._banners.setDebugData(void 0);
    this._interactiveDisposable.value = autorun((reader) => {
      this._widget.setReadOnly(chat.interactivity.read(reader) !== ChatInteractivity.Full);
    });
    if (isEqual(this._currentChatResource, resource)) {
      return;
    }
    const previousChatResource = this._currentChatResource;
    this._currentChatResource = resource;
    this._loadCts.value?.cancel();
    if (previousChatResource) {
      this._clearCurrentChat();
    }
    const cts = new CancellationTokenSource();
    this._loadCts.value = cts;
    const token = cts.token;
    const inputBeforeLoad = this._widget.getInput();
    const loadPromise = this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, token, "ChatView").then((ref) => {
      if (token.isCancellationRequested || !ref || !isEqual(this._currentChatResource, resource)) {
        ref?.dispose();
        return;
      }
      this._modelRef.value = ref;
      this._updateWidgetLockState(getChatSessionType(ref.object.sessionResource));
      setModelPreservingInputTypedWhileLoading(this._widget, inputBeforeLoad, () => this._widget.setModel(ref.object));
      this.element.dataset.boundChatResource = resource.toString();
    }, (err) => {
      if (!token.isCancellationRequested) {
        this.logService.error("[ChatView] Failed to load chat model for chat", err);
      }
      if (isEqual(this._currentChatResource, resource)) {
        this._currentChatResource = void 0;
      }
    });
    this.showProgressWhile(loadPromise, 800);
  }
  _clearCurrentChat() {
    this._widget.clear().catch((err) => this.logService.error("[ChatView] Failed to clear chat widget", err));
    this._widget.setModel(void 0);
    this._modelRef.clear();
    delete this.element.dataset.boundChatResource;
  }
  _applyHistoryKey() {
    const scopedHistory = this.configurationService.getValue(AGENT_SESSIONS_SCOPED_INPUT_HISTORY_SETTING) !== false;
    this._widget.inputPart.setHistoryKey(scopedHistory ? this._historyKey : void 0);
  }
  _updateWidgetLockState(sessionType) {
    if (sessionType === localChatSessionType) {
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
  toJSON() {
    return { type: ChatView.TYPE };
  }
  doLayout(width, height, _top, _left) {
    this._ensureBannersMounted();
    this._widget.layout(height, width);
  }
  /**
   * Mounts the status pills and session banners above the chat input.
   */
  _ensureBannersMounted() {
    const inputPartElement = this._widget.inputPart.element;
    const persistentContentContainer = this._widget.inputPart.persistentContentContainerElement;
    const pillsNode = this._chatPills.element;
    const bannersNode = this._banners.domNode;
    if (persistentContentContainer.firstChild !== pillsNode) {
      persistentContentContainer.insertBefore(pillsNode, persistentContentContainer.firstChild);
    }
    if (persistentContentContainer.nextSibling !== bannersNode) {
      inputPartElement.insertBefore(bannersNode, persistentContentContainer.nextSibling);
    }
  }
  //#region Voice overlay
  /**
   * Sets up this view's transcript overlay and input glow, mirroring `ChatViewPane`.
   * Shows only while voice is connected and targeting this active session.
   */
  _setupVoiceOverlay() {
    const inputContainerEl = this._widget.inputPart.inputContainerElement;
    if (!inputContainerEl) {
      return;
    }
    this._register(setupVoiceInputDecorations({
      voiceSessionController: this.voiceSessionController,
      ttsPlaybackService: this.ttsPlaybackService,
      micCaptureService: this.micCaptureService,
      configurationService: this.configurationService,
      keybindingService: this.keybindingService,
      themeService: this.themeService,
      accessibilityService: this.accessibilityService
    }, {
      inputContainer: inputContainerEl,
      isActive: this._isActiveObs,
      getCurrentResource: () => this._currentChatResource,
      currentVoiceInputResource: this.newChatVoiceTargetService.currentVoiceInputResource
    }));
  }
  //#endregion
  focus() {
    this._widget.focusInput();
  }
  attach(uris) {
    for (const uri of uris) {
      this._widget.attachmentModel.addFile(uri).catch((err) => this.logService.error("[ChatView] Failed to attach file as context", err));
    }
  }
  setActive(active) {
    if (this._isActive === active) {
      return;
    }
    this._isActive = active;
    this._isActiveObs.set(active, void 0);
    this._banners.setActive(active);
    this._widget.setStyles(this._buildStyles(active));
  }
  setVisible(visible) {
    if (this._isVisible === visible) {
      return;
    }
    this._isVisible = visible;
    this._widget.setVisible(visible);
  }
};
ChatView.TYPE = "sessions.session";
ChatView = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatSessionsService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IAccessibilityService),
  __decorateParam(9, IVoiceSessionController),
  __decorateParam(10, IMicCaptureService),
  __decorateParam(11, ITtsPlaybackService),
  __decorateParam(12, ISessionChatPillsDebugService),
  __decorateParam(13, INewChatVoiceTargetService)
], ChatView);
let ChatViewFactory = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
  }
  createNewChatView(isNewChatInSession, options) {
    return this.instantiationService.createInstance(NewChatView, isNewChatInSession, options);
  }
  createChatView() {
    return this.instantiationService.createInstance(ChatView);
  }
};
ChatViewFactory = __decorateClass([
  __decorateParam(0, IInstantiationService)
], ChatViewFactory);
export {
  ChatView,
  ChatViewFactory,
  NewChatView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRWaWV3LmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvdm9pY2VDaGF0Vmlldy5jc3MnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNaWNDYXB0dXJlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHRzUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3R0c1BsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgQ2hhdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvY2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBzZXRNb2RlbFByZXNlcnZpbmdJbnB1dFR5cGVkV2hpbGVMb2FkaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbFJlZmVyZW5jZSwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RDaGF0VmlldywgQ2hhdFZpZXdLaW5kLCBJQ2hhdFZpZXdPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9jaGF0Vmlldy5qcyc7XG5pbXBvcnQgeyBDaGF0SW50ZXJhY3Rpdml0eSwgSUNoYXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZpZXdGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdFZpZXcvYnJvd3Nlci9jaGF0Vmlld0ZhY3RvcnkuanMnO1xuaW1wb3J0IHsgTmV3Q2hhdFdpZGdldCB9IGZyb20gJy4vbmV3Q2hhdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBOZXdDaGF0SW5TZXNzaW9uV2lkZ2V0IH0gZnJvbSAnLi9uZXdDaGF0SW5TZXNzaW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IFNlc3Npb25JbnB1dEJhbm5lcnMgfSBmcm9tICcuLi8uLi9zZXNzaW9uSW5wdXRCYW5uZXJzL2Jyb3dzZXIvc2Vzc2lvbklucHV0QmFubmVycy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ2hhdElucHV0VG9vbGJhciB9IGZyb20gJy4vc2Vzc2lvbkNoYXRJbnB1dFRvb2xiYXIuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2VTZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIgfSBmcm9tICcuL3Jlc3BvbnNlU2VsZWN0aW9uU2lkZUNoYXRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi9zZXNzaW9uQ2hhdElucHV0VG9vbGJhckRlYnVnLmpzJztcbmltcG9ydCB7IEFHRU5UX1NFU1NJT05TX1NDT1BFRF9JTlBVVF9ISVNUT1JZX1NFVFRJTkcgfSBmcm9tICcuL3Nlc3Npb25zQ2hhdEhpc3RvcnkuanMnO1xuaW1wb3J0IHsgYWN0aXZlU2Vzc2lvblZpZXdCYWNrZ3JvdW5kLCBhY3RpdmVTZXNzaW9uVmlld0ZvcmVncm91bmQsIGFnZW50c1BhbmVsQmFja2dyb3VuZCwgaW5hY3RpdmVTZXNzaW9uVmlld0JhY2tncm91bmQsIGluYWN0aXZlU2Vzc2lvblZpZXdGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgc2V0dXBWb2ljZUlucHV0RGVjb3JhdGlvbnMgfSBmcm9tICcuL3ZvaWNlSW5wdXREZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSB9IGZyb20gJy4vbmV3Q2hhdFZvaWNlLmpzJztcblxuLyoqXG4gKiBBIHNlc3Npb24gdmlldyB0aGF0IGhvc3RzIGEge0BsaW5rIE5ld0NoYXRXaWRnZXR9IFx1MjAxNCB0aGUgXCJuZXcgc2Vzc2lvblwiIFVJXG4gKiBzaG93biBiZWZvcmUgYSBzZXNzaW9uIGhhcyBiZWVuIGNyZWF0ZWQuIFRoaXMgaXMgdGhlIGRlZmF1bHQgdmlldyB0aGF0XG4gKiB0aGUgYFNlc3Npb25zUGFydGAgZ3JpZCBpcyBzZWVkZWQgd2l0aC5cbiAqL1xuZXhwb3J0IGNsYXNzIE5ld0NoYXRWaWV3IGV4dGVuZHMgQWJzdHJhY3RDaGF0VmlldyB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRZUEUgPSAnc2Vzc2lvbnMubmV3U2Vzc2lvbic7XG5cblx0b3ZlcnJpZGUgcmVhZG9ubHkga2luZDogQ2hhdFZpZXdLaW5kO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldDogTmV3Q2hhdFdpZGdldCB8IE5ld0NoYXRJblNlc3Npb25XaWRnZXQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aXNOZXdDaGF0SW5TZXNzaW9uOiBib29sZWFuLFxuXHRcdG9wdGlvbnM6IElDaGF0Vmlld09wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC12aWV3LW5ldycpO1xuXHRcdHRoaXMua2luZCA9IGlzTmV3Q2hhdEluU2Vzc2lvbiA/ICduZXdDaGF0SW5TZXNzaW9uJyA6ICduZXdTZXNzaW9uJztcblx0XHR0aGlzLl93aWRnZXQgPSB0aGlzLl9yZWdpc3Rlcihpc05ld0NoYXRJblNlc3Npb25cblx0XHRcdD8gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3Q2hhdEluU2Vzc2lvbldpZGdldCwgb3B0aW9ucylcblx0XHRcdDogaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV3Q2hhdFdpZGdldCwgb3B0aW9ucykpO1xuXHRcdHRoaXMuX3dpZGdldC5yZW5kZXIodGhpcy5lbGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIHRvSlNPTigpOiBvYmplY3Qge1xuXHRcdHJldHVybiB7IHR5cGU6IE5ld0NoYXRWaWV3LlRZUEUgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBkb0xheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgX3RvcDogbnVtYmVyLCBfbGVmdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5mb2N1c0lucHV0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZWxlY3RXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkksIHByb3ZpZGVySWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0IGluc3RhbmNlb2YgTmV3Q2hhdFdpZGdldCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNlbGVjdFdvcmtzcGFjZShmb2xkZXJVcmksIHByb3ZpZGVySWQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHByZWZpbGxJbnB1dCh0ZXh0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fd2lkZ2V0IGluc3RhbmNlb2YgTmV3Q2hhdFdpZGdldCkge1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnByZWZpbGxJbnB1dCh0ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZW5kUXVlcnkodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZW5kUXVlcnkodGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc3VibWl0SW5wdXQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQgPyB0aGlzLl93aWRnZXQuc3VibWl0SW5wdXQoKSA6IFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhdHRhY2godXJpczogVVJJW10pOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuYXR0YWNoKHVyaXMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3dpZGdldCBpbnN0YW5jZW9mIE5ld0NoYXRXaWRnZXQpIHtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRIb3N0VmlzaWJsZSh2aXNpYmxlKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBIHNlc3Npb24gdmlldyB0aGF0IGhvc3RzIHRoZSBzdGFuZGFyZCBjaGF0IHtAbGluayBDaGF0V2lkZ2V0fSBcdTIwMTQgdXNlZCB0b1xuICogcmVuZGVyIGFuIGFjdGl2ZSBjaGF0IHNlc3Npb24gaW5zaWRlIHRoZSBgU2Vzc2lvbnNQYXJ0YCBncmlkLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXcgZXh0ZW5kcyBBYnN0cmFjdENoYXRWaWV3IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVFlQRSA9ICdzZXNzaW9ucy5zZXNzaW9uJztcblxuXHRvdmVycmlkZSByZWFkb25seSBraW5kOiBDaGF0Vmlld0tpbmQgPSAnY2hhdCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBDaGF0V2lkZ2V0O1xuXG5cdC8qKiBTZXNzaW9uIGJhbm5lcnMgKENJIGZhaWx1cmVzLCBjcmVhdGVkIGNvbW1lbnRzKSBzaG93biBhYm92ZSB0aGUgY2hhdCBpbnB1dC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYmFubmVyczogU2Vzc2lvbklucHV0QmFubmVycztcblx0LyoqIEZsb2F0aW5nIHN0YXR1cyBwaWxscyAoY2hhbmdlcywgcHJldmlldywgYmFja2dyb3VuZCBhY3Rpdml0eSkgYWJvdmUgdGhlIGlucHV0LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0UGlsbHM6IFNlc3Npb25DaGF0SW5wdXRUb29sYmFyO1xuXG5cdC8qKiBTaG93cyBhbiBcIkFzayBRdWVzdGlvblwiIGlucHV0IHdoZW4gdGhlIHVzZXIgc2VsZWN0cyBhc3Npc3RhbnQgbWFya2Rvd24gdGV4dC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0aW9uU2lkZUNoYXRDb250cm9sbGVyOiBSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlcjtcblxuXHQvKiogUmVmZXJlbmNlIHRvIHRoZSBsb2FkZWQgY2hhdCBtb2RlbDsgZGlzcG9zaW5nIHJlbGVhc2VzIHRoZSBtb2RlbC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SUNoYXRNb2RlbFJlZmVyZW5jZT4oKSk7XG5cblx0LyoqIENhbmNlbHMgYW55IGluLWZsaWdodCBtb2RlbCBsb2FkIHdoZW4gYSBuZXcgc2Vzc2lvbiBpcyBzZXQgb3IgdGhlIHZpZXcgZGlzcG9zZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvYWRDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXG5cdC8qKiBUcmFja3MgdGhlIGN1cnJlbnQgY2hhdCdzIGludGVyYWN0aXZpdHkgYW5kIGhpZGVzIHRoZSBpbnB1dCBmb3IgcmVhZC1vbmx5IGNoYXRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnRlcmFjdGl2ZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0LyoqIFRyYWNrcyB0aGUgY3VycmVudGx5IGxvYWRlZCBjaGF0IHJlc291cmNlIHRvIGF2b2lkIHJlZHVuZGFudCByZWxvYWRzLiAqL1xuXHRwcml2YXRlIF9jdXJyZW50Q2hhdFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hpc3RvcnlLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKiogV2hldGhlciB0aGlzIHZpZXcgY3VycmVudGx5IHJlcHJlc2VudHMgdGhlIGFjdGl2ZSBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIF9pc0FjdGl2ZSA9IHRydWU7XG5cdC8qKiBPYnNlcnZhYmxlIG1pcnJvciBvZiB7QGxpbmsgX2lzQWN0aXZlfSBzbyB0aGUgdm9pY2Ugb3ZlcmxheSBjYW4gcmVhY3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQWN0aXZlT2JzID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KHRoaXMsIHRydWUpO1xuXG5cdC8qKiBXaGV0aGVyIHRoaXMgdmlldyBpcyBjdXJyZW50bHkgdmlzaWJsZS4gYHVuZGVmaW5lZGAgc28gdGhlIGZpcnN0IHB1c2ggYWx3YXlzIHJlYWNoZXMgdGhlIHdpZGdldC4gKi9cblx0cHJpdmF0ZSBfaXNWaXNpYmxlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBQZXItdmlldyBtaXJyb3Igb2YgYGFnZW50c1ZvaWNlSW5pdGlhdGVkSGVyZWAsIHNjb3BlZCBhYm92ZSB0aGUgY2hhdCB3aWRnZXQuXG5cdCAqIEtlZXBzIHBvc3QtY29ubmVjdCB2b2ljZSBjb250cm9scyBhbmNob3JlZCB0byB0aGUgYWN0aXZlIHNlc3Npb24gdmlldy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZvaWNlSW5pdGlhdGVkSGVyZUtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIgcHJpdmF0ZSByZWFkb25seSB2b2ljZVNlc3Npb25Db250cm9sbGVyOiBJVm9pY2VTZXNzaW9uQ29udHJvbGxlcixcblx0XHRASU1pY0NhcHR1cmVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWljQ2FwdHVyZVNlcnZpY2U6IElNaWNDYXB0dXJlU2VydmljZSxcblx0XHRASVR0c1BsYXliYWNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHR0c1BsYXliYWNrU2VydmljZTogSVR0c1BsYXliYWNrU2VydmljZSxcblx0XHRASVNlc3Npb25DaGF0UGlsbHNEZWJ1Z1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0UGlsbHNEZWJ1Z1NlcnZpY2U6IElTZXNzaW9uQ2hhdFBpbGxzRGVidWdTZXJ2aWNlLFxuXHRcdEBJTmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5ld0NoYXRWb2ljZVRhcmdldFNlcnZpY2U6IElOZXdDaGF0Vm9pY2VUYXJnZXRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtdmlldy1jaGF0Jyk7XG5cblx0XHRjb25zdCBzY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmVsZW1lbnQpKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKFxuXHRcdFx0bmV3IFNlcnZpY2VDb2xsZWN0aW9uKFtJQ29udGV4dEtleVNlcnZpY2UsIHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlXSlcblx0XHQpKTtcblxuXHRcdC8vIE1hdGNoZXMgYEFHRU5UU19WT0lDRV9JTklUSUFURURfSEVSRWAgaW4gYWdlbnRzVm9pY2UuY29udHJpYnV0aW9uLnRzLlxuXHRcdHRoaXMuX3ZvaWNlSW5pdGlhdGVkSGVyZUtleSA9IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignYWdlbnRzVm9pY2VJbml0aWF0ZWRIZXJlJywgZmFsc2UpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0V2lkZ2V0LFxuXHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0YXV0b1Njcm9sbDogbW9kZSA9PiBtb2RlICE9PSBDaGF0TW9kZUtpbmQuQXNrLFxuXHRcdFx0XHRyZW5kZXJGb2xsb3d1cHM6IHRydWUsXG5cdFx0XHRcdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXM6IHRydWUsXG5cdFx0XHRcdHJlbmRlcmVyT3B0aW9uczoge1xuXHRcdFx0XHRcdHJlZmVyZW5jZXNFeHBhbmRlZFdoZW5FbXB0eVJlc3BvbnNlOiBmYWxzZSxcblx0XHRcdFx0XHRwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2U6IG1vZGUgPT4gbW9kZSAhPT0gQ2hhdE1vZGVLaW5kLkFzayxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5hYmxlSW1wbGljaXRDb250ZXh0OiB0cnVlLFxuXHRcdFx0XHRlbmFibGVXb3JraW5nU2V0OiAnaW1wbGljaXQnLFxuXHRcdFx0XHRzdXBwb3J0c0NoYW5naW5nTW9kZXM6IHRydWUsXG5cdFx0XHRcdGlucHV0RWRpdG9yTWluTGluZXM6IDIsXG5cdFx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR0aGlzLl9idWlsZFN0eWxlcyh0aGlzLl9pc0FjdGl2ZSlcblx0XHQpKTtcblx0XHR0aGlzLl93aWRnZXQucmVuZGVyKHRoaXMuZWxlbWVudCk7XG5cblx0XHR0aGlzLl9zZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNwb25zZVNlbGVjdGlvblNpZGVDaGF0Q29udHJvbGxlciwgdGhpcy5fd2lkZ2V0KSk7XG5cblx0XHQvLyBNb3VudCB0aGUgc2Vzc2lvbiBiYW5uZXJzIGRpcmVjdGx5IGFib3ZlIHRoZSBjaGF0IGlucHV0LlxuXHRcdHRoaXMuX2Jhbm5lcnMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uSW5wdXRCYW5uZXJzKSk7XG5cdFx0dGhpcy5fYmFubmVycy5zZXRBY3RpdmUodGhpcy5faXNBY3RpdmUpO1xuXG5cdFx0Ly8gRmxvYXRpbmcgc3RhdHVzIHBpbGxzIGFib3ZlIHRoZSBpbnB1dC5cblx0XHR0aGlzLl9jaGF0UGlsbHMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ2hhdElucHV0VG9vbGJhcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNoYXRQaWxsc0RlYnVnU2VydmljZS5yZWdpc3Rlcih0aGlzLl9jaGF0UGlsbHMsIHRoaXMuX2Jhbm5lcnMsIHRoaXMuX2lzQWN0aXZlT2JzKSk7XG5cdFx0dGhpcy5fZW5zdXJlQmFubmVyc01vdW50ZWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQUdFTlRfU0VTU0lPTlNfU0NPUEVEX0lOUFVUX0hJU1RPUllfU0VUVElORykpIHtcblx0XHRcdFx0dGhpcy5fYXBwbHlIaXN0b3J5S2V5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVm9pY2UgdHJhbnNjcmlwdCBvdmVybGF5ICsgaW5wdXQgZ2xvdy5cblx0XHR0aGlzLl9zZXR1cFZvaWNlT3ZlcmxheSgpO1xuXG5cdFx0Ly8gQW5jaG9yIHBvc3QtY29ubmVjdCB2b2ljZSBjb250cm9scyB0byB0aGlzIGFjdGl2ZSB2b2ljZSB2aWV3LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZSA9IHRoaXMuX2lzQWN0aXZlT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHZvaWNlQWN0aXZlID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLnJlYWQocmVhZGVyKVxuXHRcdFx0XHR8fCB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3ZvaWNlSW5pdGlhdGVkSGVyZUtleS5zZXQoYWN0aXZlICYmIHZvaWNlQWN0aXZlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvYWRDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkU3R5bGVzKGFjdGl2ZTogYm9vbGVhbikge1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaXN0Rm9yZWdyb3VuZDogYWN0aXZlID8gYWN0aXZlU2Vzc2lvblZpZXdGb3JlZ3JvdW5kIDogaW5hY3RpdmVTZXNzaW9uVmlld0ZvcmVncm91bmQsXG5cdFx0XHRsaXN0QmFja2dyb3VuZDogYWN0aXZlID8gYWN0aXZlU2Vzc2lvblZpZXdCYWNrZ3JvdW5kIDogaW5hY3RpdmVTZXNzaW9uVmlld0JhY2tncm91bmQsXG5cdFx0XHRvdmVybGF5QmFja2dyb3VuZDogRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCxcblx0XHRcdGlucHV0RWRpdG9yQmFja2dyb3VuZDogaW5hY3RpdmVTZXNzaW9uVmlld0JhY2tncm91bmQsXG5cdFx0XHRyZXN1bHRFZGl0b3JCYWNrZ3JvdW5kOiBhZ2VudHNQYW5lbEJhY2tncm91bmQsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBUaGUgdW5kZXJseWluZyBjaGF0IHdpZGdldC4gKi9cblx0Z2V0IHdpZGdldCgpOiBDaGF0V2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0O1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Q2hhdChjaGF0OiBJQ2hhdCwgaGlzdG9yeUtleT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuY2hhdFBpbGxzRGVidWdTZXJ2aWNlLmNsZWFyKHRoaXMuX2NoYXRQaWxscyk7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBjaGF0LnJlc291cmNlO1xuXHRcdHRoaXMuX2hpc3RvcnlLZXkgPSBoaXN0b3J5S2V5O1xuXHRcdHRoaXMuX2FwcGx5SGlzdG9yeUtleSgpO1xuXG5cdFx0Ly8gUmVmbGVjdCB0aGlzIGNoYXQncyBsYXN0LXR1cm4gY2hhbmdlcywgc3RhdHVzLCBhbmQgYmFja2dyb3VuZCBhY3Rpdml0eS5cblx0XHR0aGlzLl9jaGF0UGlsbHMuc2V0Q2hhdChjaGF0KTtcblx0XHR0aGlzLl9zZWxlY3Rpb25TaWRlQ2hhdENvbnRyb2xsZXIuc2V0Q2hhdChjaGF0KTtcblx0XHR0aGlzLl9iYW5uZXJzLnNldERlYnVnRGF0YSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gUmVmbGVjdCByZWFkLW9ubHkgKG5vbi1pbnRlcmFjdGl2ZSkgY2hhdHM6IGhpZGUgdGhlIGNvbXBvc2VyIGFuZCBnYXRlXG5cdFx0Ly8gbXV0YXRpbmcgYWN0aW9ucyAoU3RhcnQgT3ZlciAvIFJlc3RvcmUgQ2hlY2twb2ludCkgdmlhIHRoZSB3aWRnZXQuIEFueVxuXHRcdC8vIG5vbi1GdWxsIGludGVyYWN0aXZpdHkgaXMgdHJlYXRlZCBhcyByZWFkLW9ubHkgaGVyZSAoaGlkZGVuIGNoYXRzIGFyZVxuXHRcdC8vIGZpbHRlcmVkIG91dCBvZiB0aGUgdmlzaWJsZSBtb2RlbCBiZWZvcmUgdGhleSByZWFjaCBhIENoYXRWaWV3KS5cblx0XHR0aGlzLl9pbnRlcmFjdGl2ZURpc3Bvc2FibGUudmFsdWUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0UmVhZE9ubHkoY2hhdC5pbnRlcmFjdGl2aXR5LnJlYWQocmVhZGVyKSAhPT0gQ2hhdEludGVyYWN0aXZpdHkuRnVsbCk7XG5cdFx0fSk7XG5cblx0XHQvLyBTa2lwIGxvYWRpbmcgaWYgd2UncmUgYWxyZWFkeSBzaG93aW5nIHRoaXMgY2hhdFxuXHRcdGlmIChpc0VxdWFsKHRoaXMuX2N1cnJlbnRDaGF0UmVzb3VyY2UsIHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzQ2hhdFJlc291cmNlID0gdGhpcy5fY3VycmVudENoYXRSZXNvdXJjZTtcblx0XHR0aGlzLl9jdXJyZW50Q2hhdFJlc291cmNlID0gcmVzb3VyY2U7XG5cblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCBsb2FkIGZvciB0aGUgcHJldmlvdXMgY2hhdCBhbmQgc3RhcnQgYSBmcmVzaCBvbmUuXG5cdFx0dGhpcy5fbG9hZEN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0aWYgKHByZXZpb3VzQ2hhdFJlc291cmNlKSB7XG5cdFx0XHR0aGlzLl9jbGVhckN1cnJlbnRDaGF0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX2xvYWRDdHMudmFsdWUgPSBjdHM7XG5cdFx0Y29uc3QgdG9rZW4gPSBjdHMudG9rZW47XG5cblx0XHQvLyBDYXB0dXJlIHRoZSBpbnB1dCBkcmFmdCBiZWZvcmUgdGhlIGxvYWQgd2luZG93IG9wZW5zIHNvIHRleHQgdHlwZWRcblx0XHQvLyBkdXJpbmcgbG9hZGluZyBpcyBwcmVzZXJ2ZWQgd2hlbiB0aGUgbW9kZWwgYmluZHMuIFNlZSAjMzI1MzIzLlxuXHRcdGNvbnN0IGlucHV0QmVmb3JlTG9hZCA9IHRoaXMuX3dpZGdldC5nZXRJbnB1dCgpO1xuXG5cdFx0Y29uc3QgbG9hZFByb21pc2UgPSB0aGlzLmNoYXRTZXJ2aWNlLmFjcXVpcmVPckxvYWRTZXNzaW9uKHJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCB0b2tlbiwgJ0NoYXRWaWV3JykudGhlbihyZWYgPT4ge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICFyZWYgfHwgIWlzRXF1YWwodGhpcy5fY3VycmVudENoYXRSZXNvdXJjZSwgcmVzb3VyY2UpKSB7XG5cdFx0XHRcdHJlZj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9tb2RlbFJlZi52YWx1ZSA9IHJlZjtcblx0XHRcdHRoaXMuX3VwZGF0ZVdpZGdldExvY2tTdGF0ZShnZXRDaGF0U2Vzc2lvblR5cGUocmVmLm9iamVjdC5zZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRcdHNldE1vZGVsUHJlc2VydmluZ0lucHV0VHlwZWRXaGlsZUxvYWRpbmcodGhpcy5fd2lkZ2V0LCBpbnB1dEJlZm9yZUxvYWQsICgpID0+IHRoaXMuX3dpZGdldC5zZXRNb2RlbChyZWYub2JqZWN0KSk7XG5cdFx0XHQvLyBFeHBvc2UgdGhlIGJvdW5kIGNoYXQgcmVzb3VyY2Ugb24gdGhlIERPTSBzbyB0ZXN0IGF1dG9tYXRpb25cblx0XHRcdC8vIGNhbiBzeW5jaHJvbml6ZSB3aXRoIHRoZSBwb3N0LXJlYmluZCBzdGF0ZSB3aXRob3V0IHBvbGxpbmcgdGltZW91dHMuXG5cdFx0XHQvLyBTZXQgQUZURVIgYHNldE1vZGVsYCBzbyBvYnNlcnZlcnMgc2VlIHRoZSBhdHRyaWJ1dGUgb25seSBvbmNlIHRoZVxuXHRcdFx0Ly8gaW5uZXIgd2lkZ2V0IGlzIGZ1bGx5IGF0dGFjaGVkIHRvIHRoZSBsb2FkZWQgbW9kZWwuXG5cdFx0XHR0aGlzLmVsZW1lbnQuZGF0YXNldC5ib3VuZENoYXRSZXNvdXJjZSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdGlmICghdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQ2hhdFZpZXddIEZhaWxlZCB0byBsb2FkIGNoYXQgbW9kZWwgZm9yIGNoYXQnLCBlcnIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzRXF1YWwodGhpcy5fY3VycmVudENoYXRSZXNvdXJjZSwgcmVzb3VyY2UpKSB7IC8vIG1pZ2h0IGhhdmUgY2hhbmdlZCB3aGlsZSB3ZSB3ZXJlIHdhaXRpbmcsIG9ubHkgcmVzZXQgaWYgaXQgaXMgc3RpbGwgdGhlIHNhbWVcblx0XHRcdFx0dGhpcy5fY3VycmVudENoYXRSZXNvdXJjZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIFN1cmZhY2UgcHJvZ3Jlc3Mgb24gdGhpcyBsZWFmJ3Mgb3duIGJhciB3aGlsZSB0aGUgY2hhdCBtb2RlbCBsb2Fkcyxcblx0XHQvLyBtYXRjaGluZyBob3cgZWFjaCBlZGl0b3IgZ3JvdXAgc2hvd3MgcHJvZ3Jlc3MgaW5kZXBlbmRlbnRseS4gVGhlIHNob3J0XG5cdFx0Ly8gZGVsYXkgYXZvaWRzIGZsYXNoaW5nIHRoZSBiYXIgZm9yIGZhc3QgY2FjaGVkIGxvYWRzLlxuXHRcdHRoaXMuc2hvd1Byb2dyZXNzV2hpbGUobG9hZFByb21pc2UsIDgwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckN1cnJlbnRDaGF0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5jbGVhcigpLmNhdGNoKGVyciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tDaGF0Vmlld10gRmFpbGVkIHRvIGNsZWFyIGNoYXQgd2lkZ2V0JywgZXJyKSk7XG5cdFx0dGhpcy5fd2lkZ2V0LnNldE1vZGVsKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fbW9kZWxSZWYuY2xlYXIoKTtcblx0XHQvLyBDbGVhciB0aGUgYm91bmQtcmVzb3VyY2UgYXR0cmlidXRlIHdoaWxlIHRoZSByZWJpbmQgaXMgaW4gZmxpZ2h0IHNvXG5cdFx0Ly8gdGVzdCBhdXRvbWF0aW9uIGNhbiB3YWl0IGZvciB0aGUgbmV4dCBgc2V0Q2hhdGAgY3ljbGUgdG8gZmluaXNoXG5cdFx0Ly8gYmVmb3JlIGFjdGluZyBvbiB0aGUgdmlldy5cblx0XHRkZWxldGUgdGhpcy5lbGVtZW50LmRhdGFzZXQuYm91bmRDaGF0UmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseUhpc3RvcnlLZXkoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2NvcGVkSGlzdG9yeSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQUdFTlRfU0VTU0lPTlNfU0NPUEVEX0lOUFVUX0hJU1RPUllfU0VUVElORykgIT09IGZhbHNlO1xuXHRcdHRoaXMuX3dpZGdldC5pbnB1dFBhcnQuc2V0SGlzdG9yeUtleShzY29wZWRIaXN0b3J5ID8gdGhpcy5faGlzdG9yeUtleSA6IHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVXaWRnZXRMb2NrU3RhdGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChzZXNzaW9uVHlwZSA9PT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIHtcblx0XHRcdHRoaXMuX3dpZGdldC51bmxvY2tGcm9tQ29kaW5nQWdlbnQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oc2Vzc2lvblR5cGUpO1xuXHRcdGlmIChjb250cmlidXRpb24pIHtcblx0XHRcdHRoaXMuX3dpZGdldC5sb2NrVG9Db2RpbmdBZ2VudChjb250cmlidXRpb24ubmFtZSwgY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lLCBzZXNzaW9uVHlwZSwgY29udHJpYnV0aW9uLmFnZW50SG9zdFByb3ZpZGVySWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl93aWRnZXQudW5sb2NrRnJvbUNvZGluZ0FnZW50KCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgdG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHsgdHlwZTogQ2hhdFZpZXcuVFlQRSB9O1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGRvTGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCBfdG9wOiBudW1iZXIsIF9sZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9lbnN1cmVCYW5uZXJzTW91bnRlZCgpO1xuXHRcdHRoaXMuX3dpZGdldC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHQvKipcblx0ICogTW91bnRzIHRoZSBzdGF0dXMgcGlsbHMgYW5kIHNlc3Npb24gYmFubmVycyBhYm92ZSB0aGUgY2hhdCBpbnB1dC5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZUJhbm5lcnNNb3VudGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0UGFydEVsZW1lbnQgPSB0aGlzLl93aWRnZXQuaW5wdXRQYXJ0LmVsZW1lbnQ7XG5cdFx0Y29uc3QgcGVyc2lzdGVudENvbnRlbnRDb250YWluZXIgPSB0aGlzLl93aWRnZXQuaW5wdXRQYXJ0LnBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyRWxlbWVudDtcblx0XHRjb25zdCBwaWxsc05vZGUgPSB0aGlzLl9jaGF0UGlsbHMuZWxlbWVudDtcblx0XHRjb25zdCBiYW5uZXJzTm9kZSA9IHRoaXMuX2Jhbm5lcnMuZG9tTm9kZTtcblx0XHRpZiAocGVyc2lzdGVudENvbnRlbnRDb250YWluZXIuZmlyc3RDaGlsZCAhPT0gcGlsbHNOb2RlKSB7XG5cdFx0XHRwZXJzaXN0ZW50Q29udGVudENvbnRhaW5lci5pbnNlcnRCZWZvcmUocGlsbHNOb2RlLCBwZXJzaXN0ZW50Q29udGVudENvbnRhaW5lci5maXJzdENoaWxkKTtcblx0XHR9XG5cdFx0aWYgKHBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyLm5leHRTaWJsaW5nICE9PSBiYW5uZXJzTm9kZSkge1xuXHRcdFx0aW5wdXRQYXJ0RWxlbWVudC5pbnNlcnRCZWZvcmUoYmFubmVyc05vZGUsIHBlcnNpc3RlbnRDb250ZW50Q29udGFpbmVyLm5leHRTaWJsaW5nKTtcblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gVm9pY2Ugb3ZlcmxheVxuXG5cdC8qKlxuXHQgKiBTZXRzIHVwIHRoaXMgdmlldydzIHRyYW5zY3JpcHQgb3ZlcmxheSBhbmQgaW5wdXQgZ2xvdywgbWlycm9yaW5nIGBDaGF0Vmlld1BhbmVgLlxuXHQgKiBTaG93cyBvbmx5IHdoaWxlIHZvaWNlIGlzIGNvbm5lY3RlZCBhbmQgdGFyZ2V0aW5nIHRoaXMgYWN0aXZlIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zZXR1cFZvaWNlT3ZlcmxheSgpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dENvbnRhaW5lckVsID0gdGhpcy5fd2lkZ2V0LmlucHV0UGFydC5pbnB1dENvbnRhaW5lckVsZW1lbnQ7XG5cdFx0aWYgKCFpbnB1dENvbnRhaW5lckVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc2V0dXBWb2ljZUlucHV0RGVjb3JhdGlvbnMoe1xuXHRcdFx0dm9pY2VTZXNzaW9uQ29udHJvbGxlcjogdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdFx0dHRzUGxheWJhY2tTZXJ2aWNlOiB0aGlzLnR0c1BsYXliYWNrU2VydmljZSxcblx0XHRcdG1pY0NhcHR1cmVTZXJ2aWNlOiB0aGlzLm1pY0NhcHR1cmVTZXJ2aWNlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRrZXliaW5kaW5nU2VydmljZTogdGhpcy5rZXliaW5kaW5nU2VydmljZSxcblx0XHRcdHRoZW1lU2VydmljZTogdGhpcy50aGVtZVNlcnZpY2UsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5U2VydmljZTogdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHR9LCB7XG5cdFx0XHRpbnB1dENvbnRhaW5lcjogaW5wdXRDb250YWluZXJFbCxcblx0XHRcdGlzQWN0aXZlOiB0aGlzLl9pc0FjdGl2ZU9icyxcblx0XHRcdGdldEN1cnJlbnRSZXNvdXJjZTogKCkgPT4gdGhpcy5fY3VycmVudENoYXRSZXNvdXJjZSxcblx0XHRcdGN1cnJlbnRWb2ljZUlucHV0UmVzb3VyY2U6IHRoaXMubmV3Q2hhdFZvaWNlVGFyZ2V0U2VydmljZS5jdXJyZW50Vm9pY2VJbnB1dFJlc291cmNlLFxuXHRcdH0pKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5mb2N1c0lucHV0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBhdHRhY2godXJpczogVVJJW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB1cmlzKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZEZpbGUodXJpKS5jYXRjaChlcnIgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQ2hhdFZpZXddIEZhaWxlZCB0byBhdHRhY2ggZmlsZSBhcyBjb250ZXh0JywgZXJyKSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0QWN0aXZlKGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9pc0FjdGl2ZSA9PT0gYWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzQWN0aXZlID0gYWN0aXZlO1xuXHRcdHRoaXMuX2lzQWN0aXZlT2JzLnNldChhY3RpdmUsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fYmFubmVycy5zZXRBY3RpdmUoYWN0aXZlKTtcblx0XHR0aGlzLl93aWRnZXQuc2V0U3R5bGVzKHRoaXMuX2J1aWxkU3R5bGVzKGFjdGl2ZSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzVmlzaWJsZSA9PT0gdmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9pc1Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX3dpZGdldC5zZXRWaXNpYmxlKHZpc2libGUpO1xuXHR9XG59XG5cbi8qKlxuICogRGVmYXVsdCB7QGxpbmsgSUNoYXRWaWV3RmFjdG9yeX0gaW1wbGVtZW50YXRpb24uIExpdmVzIGluIHRoZSBjb250cmliXG4gKiBsYXllciB3aGVyZSB0aGUgY29uY3JldGUgdmlld3MgYXJlIGRlZmluZWQgYW5kIGlzIHJlZ2lzdGVyZWQgYXMgYW4gZWFnZXJcbiAqIHNpbmdsZXRvbiB2aWEgdGhlIGVudHJ5IHBvaW50LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFZpZXdGYWN0b3J5IGltcGxlbWVudHMgSUNoYXRWaWV3RmFjdG9yeSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7IH1cblxuXHRjcmVhdGVOZXdDaGF0Vmlldyhpc05ld0NoYXRJblNlc3Npb246IGJvb2xlYW4sIG9wdGlvbnM6IElDaGF0Vmlld09wdGlvbnMpOiBBYnN0cmFjdENoYXRWaWV3IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOZXdDaGF0VmlldywgaXNOZXdDaGF0SW5TZXNzaW9uLCBvcHRpb25zKTtcblx0fVxuXG5cdGNyZWF0ZUNoYXRWaWV3KCk6IEFic3RyYWN0Q2hhdFZpZXcge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3Rh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
