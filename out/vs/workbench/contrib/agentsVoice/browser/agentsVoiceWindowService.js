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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { disposableWindowInterval, getWindow } from "../../../../base/browser/dom.js";
import { FileAccess } from "../../../../base/common/network.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IAuxiliaryWindowService } from "../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { IAgentsVoiceWindowService, AgentsVoiceStorageKeys, AGENTS_VOICE_WINDOW_DEFAULT_WIDTH, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT } from "../common/agentsVoice.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IAgentSessionsService } from "../../chat/browser/agentSessions/agentSessionsService.js";
import { IAgentTitleBarStatusService } from "../../chat/browser/agentSessions/experiments/agentTitleBarStatusService.js";
import { IMicCaptureService } from "../../chat/browser/voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../../chat/browser/voiceClient/ttsPlaybackService.js";
import { IVoiceSessionController } from "../../chat/browser/voiceClient/voiceSessionController.js";
import { IVoicePlaybackService } from "../../chat/common/voicePlaybackService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { resolveVoiceGlowColors } from "../../chat/browser/voiceClient/voiceGlow.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { inputBackground, inputBorder } from "../../../../platform/theme/common/colors/inputColors.js";
import { AgentsVoiceWidget } from "./agentsVoiceWidget.js";
import { bindWidgetToController } from "./agentsVoiceWidgetBinding.js";
import { AgentsVoiceSessionsPicker } from "./agentsVoiceSessionsPicker.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { getVoiceModeContextMenuActions } from "../../chat/browser/speechToText/micButtonMenuActions.js";
let AgentsVoiceWindowService = class extends Disposable {
  /**
   * Calls setWindowAlwaysOnTop via a registered command (Electron only).
   * Avoids importing INativeHostService in the browser layer.
   */
  constructor(auxiliaryWindowService, storageService, configurationService, hostService, agentSessionsService, agentTitleBarStatusService, micCaptureService, ttsPlaybackService, voiceSessionController, voicePlaybackService, commandService, chatService, workspaceContextService, environmentService, themeService, accessibilityService, keybindingService, instantiationService, contextMenuService) {
    super();
    this.auxiliaryWindowService = auxiliaryWindowService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.agentSessionsService = agentSessionsService;
    this.agentTitleBarStatusService = agentTitleBarStatusService;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.voiceSessionController = voiceSessionController;
    this.voicePlaybackService = voicePlaybackService;
    this.commandService = commandService;
    this.chatService = chatService;
    this.workspaceContextService = workspaceContextService;
    this.environmentService = environmentService;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
    this.keybindingService = keybindingService;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this._onDidChangeOpen = this._register(new Emitter());
    this.onDidChangeOpen = this._onDidChangeOpen.event;
    this._auxiliaryWindowRef = this._register(new MutableDisposable());
    this._windowDisposables = this._register(new DisposableStore());
    const ownershipChannel = new BroadcastChannel("agents-voice-ownership");
    ownershipChannel.onmessage = (e) => {
      if (e.data?.type === "claim" && this._window) {
        this.closeWindow();
      }
    };
    this._register({ dispose: () => ownershipChannel.close() });
    this._ownershipChannel = ownershipChannel;
    const onBeforeUnload = () => {
      if (this._window) {
        this.closeWindow();
      }
    };
    mainWindow.addEventListener("beforeunload", onBeforeUnload);
    this._register({ dispose: () => mainWindow.removeEventListener("beforeunload", onBeforeUnload) });
    const wasOpen = this.storageService.getBoolean(AgentsVoiceStorageKeys.WindowOpen, StorageScope.WORKSPACE, false);
    if (wasOpen) {
      this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }
  }
  get isOpen() {
    return !!this._window;
  }
  async openWindow() {
    if (this._window) {
      return;
    }
    const bounds = this.loadBounds();
    const auxiliaryWindow = await this.auxiliaryWindowService.open({
      bounds,
      alwaysOnTop: true,
      frameless: true,
      transparent: false,
      disableFullscreen: true,
      nativeTitlebar: false,
      noBackgroundThrottling: true,
      backgroundColor: this.themeService.getColorTheme().getColor(editorBackground)?.toString() ?? "#1e1e1e"
    });
    this._window = auxiliaryWindow;
    this._auxiliaryWindowRef.value = auxiliaryWindow;
    const workspace = this.workspaceContextService.getWorkspace();
    const projectName = workspace.folders.length > 0 ? workspace.folders[0].name : "";
    auxiliaryWindow.window.document.title = projectName ? `Agents Voice \u2014 ${projectName}` : "Agents Voice";
    auxiliaryWindow.container.style.overflow = "hidden";
    auxiliaryWindow.window.document.body.style.setProperty("margin", "0", "important");
    const theme = this.themeService.getColorTheme();
    const bgColor = theme.getColor(editorBackground)?.toString() ?? "#1e1e1e";
    const inputBg = theme.getColor(inputBackground)?.toString() ?? "#3C3C3C";
    const inputBd = theme.getColor(inputBorder)?.toString() ?? "transparent";
    auxiliaryWindow.container.style.setProperty("--vscode-agents-background", bgColor);
    auxiliaryWindow.container.style.backgroundColor = inputBg;
    auxiliaryWindow.container.style.border = `1px solid ${inputBd}`;
    auxiliaryWindow.container.style.boxSizing = "border-box";
    auxiliaryWindow.window.document.body.style.setProperty("background-color", inputBg, "important");
    this._windowDisposables.clear();
    const widget = new AgentsVoiceWidget(auxiliaryWindow.container, {
      copilotIconSrc: FileAccess.asBrowserUri("vs/sessions/browser/media/sessions-icon.svg").toString(true),
      hideDisconnect: this.configurationService.getValue("agents.voice.handsFree") === true,
      connect: () => {
        this.storageService.store(AgentsVoiceStorageKeys.OnboardingCompleted, true, StorageScope.PROFILE, StorageTarget.USER);
        this.voiceSessionController.connect(mainWindow);
      },
      disconnect: () => this.voiceSessionController.disconnect("explicit"),
      pttDown: () => {
        if (!this.voiceSessionController.isConnected.get() && !this.voiceSessionController.isConnecting.get()) {
          this.voiceSessionController.connect(mainWindow).then(() => {
            if (this.voiceSessionController.isConnected.get()) {
              this.voiceSessionController.pttDown();
            }
          });
          return;
        }
        this.voiceSessionController.pttDown();
      },
      pttUp: () => this.voiceSessionController.pttUp(),
      closeWindow: () => this.closeWindow(),
      stopPlayback: () => this.ttsPlaybackService.stopPlayback(),
      openSession: (resource) => {
        this.commandService.executeCommand("_chat.voice.switchToSession", resource.toString());
        this.hostService.focus(mainWindow);
      },
      stopSession: (resource) => {
        const model = this.chatService.getSession(resource);
        if (model) {
          const lastReq = model.getRequests().at(-1);
          if (lastReq) {
            this.voiceSessionController.markUserCancelled(resource.toString());
            this.chatService.cancelCurrentRequestForSession(resource);
          }
        }
      },
      cancelSession: (resource) => {
        this.voiceSessionController.markUserCancelled(resource.toString());
        this.chatService.cancelCurrentRequestForSession(resource);
      },
      selectTargetSession: (resource) => {
        this.voiceSessionController.setTargetSession(resource);
        if (resource) {
          this.commandService.executeCommand("_chat.voice.switchToSession", resource.toString()).catch(() => {
          });
        }
      },
      newSessionAsTarget: () => {
        this.voiceSessionController.newSessionAsTarget();
      },
      getAnalyserNode: () => {
        const state = this.voiceSessionController.voiceState.get();
        return this.ttsPlaybackService.analyserNode ?? (state === "listening" ? this.micCaptureService.analyserNode : null) ?? null;
      },
      onResize: () => this._resizeWindow(auxiliaryWindow),
      getGlowTheme: () => isDark(this.themeService.getColorTheme().type) ? "dark" : "light",
      getGlowColors: () => resolveVoiceGlowColors(this.themeService.getColorTheme()),
      isMotionReduced: () => this.accessibilityService.isMotionReduced(),
      onDidChangeGlowTheme: Event.map(this.themeService.onDidColorThemeChange, () => void 0),
      openPttKeySettings: () => this.commandService.executeCommand("workbench.action.openGlobalKeybindings", "agentsVoice.pushToTalk"),
      showVoiceContextMenu: (e) => {
        const anchor = new StandardMouseEvent(getWindow(e.target ?? auxiliaryWindow.container), e);
        this.contextMenuService.showContextMenu({
          getAnchor: () => anchor,
          getActions: () => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, "agentsVoice.pushToTalk")
        });
      },
      submitFeedback: (text) => this.voiceSessionController.submitFeedback(text),
      showSessionsPicker: () => {
        const picker = this.instantiationService.createInstance(
          AgentsVoiceSessionsPicker,
          (resource) => this.voiceSessionController.setTargetSession(resource)
        );
        picker.show();
      }
    }, {
      defaultExpanded: false,
      inputBoxLayout: true,
      // Make the aux-window container focusable so keyboard Push-to-Talk
      // (the `agentsVoice.pushToTalk` keybinding) can be received and its
      // key-release tracking is registered. Without this the keyboard-PTT
      // handlers are never wired and a held key never stops recording.
      focusable: true
    });
    this._windowDisposables.add(widget);
    const getPttLabel = () => this.keybindingService.lookupKeybinding("agentsVoice.pushToTalk")?.getLabel() ?? void 0;
    widget.setPttKeyLabel(getPttLabel());
    this._windowDisposables.add(this.keybindingService.onDidUpdateKeybindings(() => {
      widget.setPttKeyLabel(getPttLabel());
    }));
    this._windowDisposables.add(bindWidgetToController(widget, {
      voiceSessionController: this.voiceSessionController,
      agentSessionsService: this.agentSessionsService,
      agentTitleBarStatusService: this.agentTitleBarStatusService,
      voicePlaybackService: this.voicePlaybackService,
      environmentService: this.environmentService,
      chatService: this.chatService,
      configurationService: this.configurationService
    }));
    this.agentSessionsService.model.resolve(void 0);
    this._windowDisposables.add(disposableWindowInterval(auxiliaryWindow.window, () => {
      this.agentSessionsService.model.resolve(void 0);
    }, 3e3));
    Event.once(auxiliaryWindow.onUnload)(() => {
      this.voiceSessionController.setTargetSession(void 0);
      this.voiceSessionController.disconnect();
      this._window = void 0;
      this._windowDisposables.clear();
      this._auxiliaryWindowRef.value = void 0;
      this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
      this._onDidChangeOpen.fire(false);
    });
    this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._onDidChangeOpen.fire(true);
  }
  closeWindow() {
    if (!this._window) {
      return;
    }
    this.saveBounds(this._window);
    this.voiceSessionController.setTargetSession(void 0);
    this.storageService.store(AgentsVoiceStorageKeys.WindowOpen, false, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._window = void 0;
    this._windowDisposables.clear();
    this._auxiliaryWindowRef.value = void 0;
    this._onDidChangeOpen.fire(false);
  }
  async toggleWindow() {
    if (this.isOpen) {
      this.closeWindow();
    } else {
      this._ownershipChannel.postMessage({ type: "claim" });
      await this.openWindow();
    }
  }
  // --- Window sizing ---
  _resizeWindow(auxiliaryWindow) {
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
    }
    this._resizeTimeout = setTimeout(() => {
      this._resizeTimeout = void 0;
      this._doResizeWindow(auxiliaryWindow);
    }, 100);
  }
  _doResizeWindow(auxiliaryWindow) {
    const pill = auxiliaryWindow.container.querySelector("div");
    if (!pill) {
      return;
    }
    void pill.offsetWidth;
    const pillWidth = pill.offsetWidth;
    const pillHeight = pill.offsetHeight;
    if (pillWidth <= 0 || pillHeight <= 0) {
      return;
    }
    const currentWidth = auxiliaryWindow.window.outerWidth;
    const currentHeight = auxiliaryWindow.window.outerHeight;
    if (pillWidth !== currentWidth || pillHeight !== currentHeight) {
      try {
        const screenBottom = auxiliaryWindow.window.screen.availHeight;
        const maxHeight = screenBottom - auxiliaryWindow.window.screenY;
        const clampedHeight = Math.min(pillHeight, Math.max(maxHeight, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT));
        auxiliaryWindow.window.resizeTo(pillWidth, clampedHeight);
      } catch {
      }
    }
  }
  // --- Bounds persistence ---
  _defaultBounds() {
    const x = Math.round(mainWindow.screenX + (mainWindow.outerWidth - AGENTS_VOICE_WINDOW_DEFAULT_WIDTH) / 2);
    const y = mainWindow.screenY + mainWindow.outerHeight - AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT - 100;
    return {
      x,
      y,
      width: AGENTS_VOICE_WINDOW_DEFAULT_WIDTH,
      height: AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT
    };
  }
  loadBounds() {
    return this._defaultBounds();
  }
  saveBounds(_window) {
  }
};
AgentsVoiceWindowService = __decorateClass([
  __decorateParam(0, IAuxiliaryWindowService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IHostService),
  __decorateParam(4, IAgentSessionsService),
  __decorateParam(5, IAgentTitleBarStatusService),
  __decorateParam(6, IMicCaptureService),
  __decorateParam(7, ITtsPlaybackService),
  __decorateParam(8, IVoiceSessionController),
  __decorateParam(9, IVoicePlaybackService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IChatService),
  __decorateParam(12, IWorkspaceContextService),
  __decorateParam(13, IWorkbenchEnvironmentService),
  __decorateParam(14, IThemeService),
  __decorateParam(15, IAccessibilityService),
  __decorateParam(16, IKeybindingService),
  __decorateParam(17, IInstantiationService),
  __decorateParam(18, IContextMenuService)
], AgentsVoiceWindowService);
registerSingleton(IAgentsVoiceWindowService, AgentsVoiceWindowService, InstantiationType.Delayed);
export {
  AgentsVoiceWindowService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvYWdlbnRzVm9pY2VXaW5kb3dTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbCwgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93U2VydmljZSwgSUF1eGlsaWFyeVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1eGlsaWFyeVdpbmRvdy9icm93c2VyL2F1eGlsaWFyeVdpbmRvd1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50c1ZvaWNlV2luZG93U2VydmljZSwgQWdlbnRzVm9pY2VTdG9yYWdlS2V5cywgQUdFTlRTX1ZPSUNFX1dJTkRPV19ERUZBVUxUX1dJRFRILCBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfSEVJR0hUIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50c1ZvaWNlLmpzJztcbmltcG9ydCB7IElSZWN0YW5nbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL2FnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNaWNDYXB0dXJlU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHRzUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3R0c1BsYXliYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZVNlc3Npb25Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElWb2ljZVBsYXliYWNrU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL3ZvaWNlUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IHJlc29sdmVWb2ljZUdsb3dDb2xvcnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VHbG93LmpzJztcbmltcG9ydCB7IGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpbnB1dEJhY2tncm91bmQsIGlucHV0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9pbnB1dENvbG9ycy5qcyc7XG5pbXBvcnQgeyBBZ2VudHNWb2ljZVdpZGdldCB9IGZyb20gJy4vYWdlbnRzVm9pY2VXaWRnZXQuanMnO1xuaW1wb3J0IHsgYmluZFdpZGdldFRvQ29udHJvbGxlciB9IGZyb20gJy4vYWdlbnRzVm9pY2VXaWRnZXRCaW5kaW5nLmpzJztcbmltcG9ydCB7IEFnZW50c1ZvaWNlU2Vzc2lvbnNQaWNrZXIgfSBmcm9tICcuL2FnZW50c1ZvaWNlU2Vzc2lvbnNQaWNrZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBnZXRWb2ljZU1vZGVDb250ZXh0TWVudUFjdGlvbnMgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvc3BlZWNoVG9UZXh0L21pY0J1dHRvbk1lbnVBY3Rpb25zLmpzJztcblxuZXhwb3J0IGNsYXNzIEFnZW50c1ZvaWNlV2luZG93U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRzVm9pY2VXaW5kb3dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU9wZW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPcGVuOiBFdmVudDxib29sZWFuPiA9IHRoaXMuX29uRGlkQ2hhbmdlT3Blbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdXhpbGlhcnlXaW5kb3dSZWYgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgX3dpbmRvdzogSUF1eGlsaWFyeVdpbmRvdyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfd2luZG93RGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vd25lcnNoaXBDaGFubmVsOiBCcm9hZGNhc3RDaGFubmVsO1xuXHRwcml2YXRlIF9yZXNpemVUaW1lb3V0OiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblxuXHRnZXQgaXNPcGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX3dpbmRvdztcblx0fVxuXG5cdC8qKlxuXHQgKiBDYWxscyBzZXRXaW5kb3dBbHdheXNPblRvcCB2aWEgYSByZWdpc3RlcmVkIGNvbW1hbmQgKEVsZWN0cm9uIG9ubHkpLlxuXHQgKiBBdm9pZHMgaW1wb3J0aW5nIElOYXRpdmVIb3N0U2VydmljZSBpbiB0aGUgYnJvd3NlciBsYXllci5cblx0ICovXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQXV4aWxpYXJ5V2luZG93U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGF1eGlsaWFyeVdpbmRvd1NlcnZpY2U6IElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFNlc3Npb25zU2VydmljZTogSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQWdlbnRUaXRsZUJhclN0YXR1c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhZ2VudFRpdGxlQmFyU3RhdHVzU2VydmljZTogSUFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLFxuXHRcdEBJTWljQ2FwdHVyZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtaWNDYXB0dXJlU2VydmljZTogSU1pY0NhcHR1cmVTZXJ2aWNlLFxuXHRcdEBJVHRzUGxheWJhY2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHRzUGxheWJhY2tTZXJ2aWNlOiBJVHRzUGxheWJhY2tTZXJ2aWNlLFxuXHRcdEBJVm9pY2VTZXNzaW9uQ29udHJvbGxlciBwcml2YXRlIHJlYWRvbmx5IHZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI6IElWb2ljZVNlc3Npb25Db250cm9sbGVyLFxuXHRcdEBJVm9pY2VQbGF5YmFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2b2ljZVBsYXliYWNrU2VydmljZTogSVZvaWNlUGxheWJhY2tTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgb3duZXJzaGlwQ2hhbm5lbCA9IG5ldyBCcm9hZGNhc3RDaGFubmVsKCdhZ2VudHMtdm9pY2Utb3duZXJzaGlwJyk7XG5cdFx0b3duZXJzaGlwQ2hhbm5lbC5vbm1lc3NhZ2UgPSAoZSkgPT4ge1xuXHRcdFx0aWYgKGUuZGF0YT8udHlwZSA9PT0gJ2NsYWltJyAmJiB0aGlzLl93aW5kb3cpIHtcblx0XHRcdFx0dGhpcy5jbG9zZVdpbmRvdygpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBvd25lcnNoaXBDaGFubmVsLmNsb3NlKCkgfSk7XG5cdFx0dGhpcy5fb3duZXJzaGlwQ2hhbm5lbCA9IG93bmVyc2hpcENoYW5uZWw7XG5cblx0XHRjb25zdCBvbkJlZm9yZVVubG9hZCA9ICgpID0+IHtcblx0XHRcdGlmICh0aGlzLl93aW5kb3cpIHtcblx0XHRcdFx0dGhpcy5jbG9zZVdpbmRvdygpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bWFpbldpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdiZWZvcmV1bmxvYWQnLCBvbkJlZm9yZVVubG9hZCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlOiAoKSA9PiBtYWluV2luZG93LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2JlZm9yZXVubG9hZCcsIG9uQmVmb3JlVW5sb2FkKSB9KTtcblxuXHRcdGNvbnN0IHdhc09wZW4gPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5XaW5kb3dPcGVuLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSk7XG5cdFx0aWYgKHdhc09wZW4pIHtcblx0XHRcdC8vIENsZWFyIHRoZSBzdG9yZWQgc3RhdGUgc28gaXQgZG9lc24ndCB0cnkgdG8gcmVvcGVuIGluIHRoZSBmdXR1cmVcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5XaW5kb3dPcGVuLCBmYWxzZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBvcGVuV2luZG93KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl93aW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBib3VuZHMgPSB0aGlzLmxvYWRCb3VuZHMoKTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvdyA9IGF3YWl0IHRoaXMuYXV4aWxpYXJ5V2luZG93U2VydmljZS5vcGVuKHtcblx0XHRcdGJvdW5kcyxcblx0XHRcdGFsd2F5c09uVG9wOiB0cnVlLFxuXHRcdFx0ZnJhbWVsZXNzOiB0cnVlLFxuXHRcdFx0dHJhbnNwYXJlbnQ6IGZhbHNlLFxuXHRcdFx0ZGlzYWJsZUZ1bGxzY3JlZW46IHRydWUsXG5cdFx0XHRuYXRpdmVUaXRsZWJhcjogZmFsc2UsXG5cdFx0XHRub0JhY2tncm91bmRUaHJvdHRsaW5nOiB0cnVlLFxuXHRcdFx0YmFja2dyb3VuZENvbG9yOiB0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IoZWRpdG9yQmFja2dyb3VuZCk/LnRvU3RyaW5nKCkgPz8gJyMxZTFlMWUnLFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fd2luZG93ID0gYXV4aWxpYXJ5V2luZG93O1xuXHRcdHRoaXMuX2F1eGlsaWFyeVdpbmRvd1JlZi52YWx1ZSA9IGF1eGlsaWFyeVdpbmRvdztcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3QgcHJvamVjdE5hbWUgPSB3b3Jrc3BhY2UuZm9sZGVycy5sZW5ndGggPiAwID8gd29ya3NwYWNlLmZvbGRlcnNbMF0ubmFtZSA6ICcnO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuZG9jdW1lbnQudGl0bGUgPSBwcm9qZWN0TmFtZSA/IGBBZ2VudHMgVm9pY2UgXHUyMDE0ICR7cHJvamVjdE5hbWV9YCA6ICdBZ2VudHMgVm9pY2UnO1xuXG5cdFx0YXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lci5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy53aW5kb3cuZG9jdW1lbnQuYm9keS5zdHlsZS5zZXRQcm9wZXJ0eSgnbWFyZ2luJywgJzAnLCAnaW1wb3J0YW50Jyk7XG5cblx0XHQvLyBSZXNvbHZlIHRoZW1lIGNvbG9ycyBzbyB0aGUgYXV4IHdpbmRvdyBtYXRjaGVzIHRoZSBjaGF0IGlucHV0IGJveFxuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdGNvbnN0IGJnQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JCYWNrZ3JvdW5kKT8udG9TdHJpbmcoKSA/PyAnIzFlMWUxZSc7XG5cdFx0Y29uc3QgaW5wdXRCZyA9IHRoZW1lLmdldENvbG9yKGlucHV0QmFja2dyb3VuZCk/LnRvU3RyaW5nKCkgPz8gJyMzQzNDM0MnO1xuXHRcdGNvbnN0IGlucHV0QmQgPSB0aGVtZS5nZXRDb2xvcihpbnB1dEJvcmRlcik/LnRvU3RyaW5nKCkgPz8gJ3RyYW5zcGFyZW50JztcblxuXHRcdGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWFnZW50cy1iYWNrZ3JvdW5kJywgYmdDb2xvcik7XG5cdFx0YXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBpbnB1dEJnO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCAke2lucHV0QmR9YDtcblx0XHRhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94Jztcblx0XHRhdXhpbGlhcnlXaW5kb3cud2luZG93LmRvY3VtZW50LmJvZHkuc3R5bGUuc2V0UHJvcGVydHkoJ2JhY2tncm91bmQtY29sb3InLCBpbnB1dEJnLCAnaW1wb3J0YW50Jyk7XG5cblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRoZSB3aWRnZXQgXHUyMDE0IGF1eCB3aW5kb3cgdXNlcyB0aGUgZGVmYXVsdCBvcHRpb25zIChkcmFnZ2FibGUsIGZpeGVkXG5cdFx0Ly8gd2lkdGgsIGNsb3NlIGJ1dHRvbiwgZXhwYW5kIGNoZXZyb24sIHN0YXR1cyByb3dzLCBubyBzdGF0dXMtdGV4dCBsYWJlbCxcblx0XHQvLyBubyBwb3BvdXQgYnV0dG9uKS4gU2Vzc2lvbnMgYXJlIGNvbGxhcHNlZCBieSBkZWZhdWx0OyB0aGUgdXNlciBjYW5cblx0XHQvLyBleHBhbmQgdGhlbSB2aWEgdGhlIGNoZXZyb24uXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gbmV3IEFnZW50c1ZvaWNlV2lkZ2V0KGF1eGlsaWFyeVdpbmRvdy5jb250YWluZXIsIHtcblx0XHRcdGNvcGlsb3RJY29uU3JjOiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaSgndnMvc2Vzc2lvbnMvYnJvd3Nlci9tZWRpYS9zZXNzaW9ucy1pY29uLnN2ZycpLnRvU3RyaW5nKHRydWUpLFxuXHRcdFx0aGlkZURpc2Nvbm5lY3Q6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2FnZW50cy52b2ljZS5oYW5kc0ZyZWUnKSA9PT0gdHJ1ZSxcblx0XHRcdGNvbm5lY3Q6ICgpID0+IHtcblx0XHRcdFx0Ly8gQ29ubmVjdGluZyBmcm9tIGFueSBzdXJmYWNlIG1hcmtzIG9uYm9hcmRpbmcgYXMgY29tcGxldGVkIHNvXG5cdFx0XHRcdC8vIHRoZSBtYWluIHBhbmVsIGRyb3BzIGl0IHRvby5cblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk9uYm9hcmRpbmdDb21wbGV0ZWQsIHRydWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KTtcblx0XHRcdH0sXG5cdFx0XHRkaXNjb25uZWN0OiAoKSA9PiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuZGlzY29ubmVjdCgnZXhwbGljaXQnKSxcblx0XHRcdHB0dERvd246ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkgJiYgIXRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCkpIHtcblx0XHRcdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuY29ubmVjdChtYWluV2luZG93KS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnB0dERvd24oKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnB0dERvd24oKTtcblx0XHRcdH0sXG5cdFx0XHRwdHRVcDogKCkgPT4gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnB0dFVwKCksXG5cdFx0XHRjbG9zZVdpbmRvdzogKCkgPT4gdGhpcy5jbG9zZVdpbmRvdygpLFxuXHRcdFx0c3RvcFBsYXliYWNrOiAoKSA9PiB0aGlzLnR0c1BsYXliYWNrU2VydmljZS5zdG9wUGxheWJhY2soKSxcblx0XHRcdG9wZW5TZXNzaW9uOiAocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX2NoYXQudm9pY2Uuc3dpdGNoVG9TZXNzaW9uJywgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHRoaXMuaG9zdFNlcnZpY2UuZm9jdXMobWFpbldpbmRvdyk7XG5cdFx0XHR9LFxuXHRcdFx0c3RvcFNlc3Npb246IChyZXNvdXJjZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChtb2RlbCkge1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RSZXEgPSBtb2RlbC5nZXRSZXF1ZXN0cygpLmF0KC0xKTtcblx0XHRcdFx0XHRpZiAobGFzdFJlcSkge1xuXHRcdFx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm1hcmtVc2VyQ2FuY2VsbGVkKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0dGhpcy5jaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNhbmNlbFNlc3Npb246IChyZXNvdXJjZSkgPT4ge1xuXHRcdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIubWFya1VzZXJDYW5jZWxsZWQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2UuY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uKHJlc291cmNlKTtcblx0XHRcdH0sXG5cdFx0XHRzZWxlY3RUYXJnZXRTZXNzaW9uOiAocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnNldFRhcmdldFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHQvLyBSZXZlYWwgdGhlIHNlbGVjdGVkIHNlc3Npb24gaW4gdGhlIGNoYXQgcGFuZWxcblx0XHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnX2NoYXQudm9pY2Uuc3dpdGNoVG9TZXNzaW9uJywgcmVzb3VyY2UudG9TdHJpbmcoKSkuY2F0Y2goKCkgPT4geyAvKiBpZ25vcmUgKi8gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRuZXdTZXNzaW9uQXNUYXJnZXQ6ICgpID0+IHtcblx0XHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLm5ld1Nlc3Npb25Bc1RhcmdldCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldEFuYWx5c2VyTm9kZTogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci52b2ljZVN0YXRlLmdldCgpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy50dHNQbGF5YmFja1NlcnZpY2UuYW5hbHlzZXJOb2RlXG5cdFx0XHRcdFx0Pz8gKHN0YXRlID09PSAnbGlzdGVuaW5nJyA/IHRoaXMubWljQ2FwdHVyZVNlcnZpY2UuYW5hbHlzZXJOb2RlIDogbnVsbClcblx0XHRcdFx0XHQ/PyBudWxsO1xuXHRcdFx0fSxcblx0XHRcdG9uUmVzaXplOiAoKSA9PiB0aGlzLl9yZXNpemVXaW5kb3coYXV4aWxpYXJ5V2luZG93KSxcblx0XHRcdGdldEdsb3dUaGVtZTogKCkgPT4gaXNEYXJrKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKSA/ICdkYXJrJyA6ICdsaWdodCcsXG5cdFx0XHRnZXRHbG93Q29sb3JzOiAoKSA9PiByZXNvbHZlVm9pY2VHbG93Q29sb3JzKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKSksXG5cdFx0XHRpc01vdGlvblJlZHVjZWQ6ICgpID0+IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCksXG5cdFx0XHRvbkRpZENoYW5nZUdsb3dUaGVtZTogRXZlbnQubWFwKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSwgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdG9wZW5QdHRLZXlTZXR0aW5nczogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5vcGVuR2xvYmFsS2V5YmluZGluZ3MnLCAnYWdlbnRzVm9pY2UucHVzaFRvVGFsaycpLFxuXHRcdFx0c2hvd1ZvaWNlQ29udGV4dE1lbnU6IChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGFuY2hvciA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KGUudGFyZ2V0IGFzIE5vZGUgPz8gYXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lciksIGUpO1xuXHRcdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRcdGdldEFuY2hvcjogKCkgPT4gYW5jaG9yLFxuXHRcdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGdldFZvaWNlTW9kZUNvbnRleHRNZW51QWN0aW9ucyh0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCAnYWdlbnRzVm9pY2UucHVzaFRvVGFsaycpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRzdWJtaXRGZWVkYmFjazogKHRleHQpID0+IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5zdWJtaXRGZWVkYmFjayh0ZXh0KSxcblx0XHRcdHNob3dTZXNzaW9uc1BpY2tlcjogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwaWNrZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdEFnZW50c1ZvaWNlU2Vzc2lvbnNQaWNrZXIsXG5cdFx0XHRcdFx0KHJlc291cmNlKSA9PiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc2V0VGFyZ2V0U2Vzc2lvbihyZXNvdXJjZSksXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHBpY2tlci5zaG93KCk7XG5cdFx0XHR9LFxuXHRcdH0sIHtcblx0XHRcdGRlZmF1bHRFeHBhbmRlZDogZmFsc2UsXG5cdFx0XHRpbnB1dEJveExheW91dDogdHJ1ZSxcblx0XHRcdC8vIE1ha2UgdGhlIGF1eC13aW5kb3cgY29udGFpbmVyIGZvY3VzYWJsZSBzbyBrZXlib2FyZCBQdXNoLXRvLVRhbGtcblx0XHRcdC8vICh0aGUgYGFnZW50c1ZvaWNlLnB1c2hUb1RhbGtgIGtleWJpbmRpbmcpIGNhbiBiZSByZWNlaXZlZCBhbmQgaXRzXG5cdFx0XHQvLyBrZXktcmVsZWFzZSB0cmFja2luZyBpcyByZWdpc3RlcmVkLiBXaXRob3V0IHRoaXMgdGhlIGtleWJvYXJkLVBUVFxuXHRcdFx0Ly8gaGFuZGxlcnMgYXJlIG5ldmVyIHdpcmVkIGFuZCBhIGhlbGQga2V5IG5ldmVyIHN0b3BzIHJlY29yZGluZy5cblx0XHRcdGZvY3VzYWJsZTogdHJ1ZSxcblx0XHR9KTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQod2lkZ2V0KTtcblxuXHRcdC8vIFBUVCBrZXkgbGFiZWwgZnJvbSBrZXliaW5kaW5nXG5cdFx0Y29uc3QgZ2V0UHR0TGFiZWwgPSAoKSA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGsnKT8uZ2V0TGFiZWwoKSA/PyB1bmRlZmluZWQ7XG5cdFx0d2lkZ2V0LnNldFB0dEtleUxhYmVsKGdldFB0dExhYmVsKCkpO1xuXHRcdHRoaXMuX3dpbmRvd0Rpc3Bvc2FibGVzLmFkZCh0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MoKCkgPT4ge1xuXHRcdFx0d2lkZ2V0LnNldFB0dEtleUxhYmVsKGdldFB0dExhYmVsKCkpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNoYXJlZCBjb250cm9sbGVyXHUyMTkyd2lkZ2V0IGJpbmRpbmcgKGFsc28gdXNlZCBieSBjaGF0Vmlld1BhbmUpXG5cdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuYWRkKGJpbmRXaWRnZXRUb0NvbnRyb2xsZXIod2lkZ2V0LCB7XG5cdFx0XHR2b2ljZVNlc3Npb25Db250cm9sbGVyOiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsXG5cdFx0XHRhZ2VudFNlc3Npb25zU2VydmljZTogdGhpcy5hZ2VudFNlc3Npb25zU2VydmljZSxcblx0XHRcdGFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlOiB0aGlzLmFnZW50VGl0bGVCYXJTdGF0dXNTZXJ2aWNlLFxuXHRcdFx0dm9pY2VQbGF5YmFja1NlcnZpY2U6IHRoaXMudm9pY2VQbGF5YmFja1NlcnZpY2UsXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2U6IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdFx0Y2hhdFNlcnZpY2U6IHRoaXMuY2hhdFNlcnZpY2UsXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHR9KSk7XG5cblx0XHQvLyBQb2xsIGZvciBzZXNzaW9uIHVwZGF0ZXNcblx0XHR0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKGF1eGlsaWFyeVdpbmRvdy53aW5kb3csICgpID0+IHtcblx0XHRcdHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH0sIDMwMDApKTtcblxuXG5cdFx0Ly8gQ2xlYW4gdXAgd2hlbiB1c2VyIGNsb3NlcyB3aW5kb3cgdmlhIE9TIGNvbnRyb2xzXG5cdFx0RXZlbnQub25jZShhdXhpbGlhcnlXaW5kb3cub25VbmxvYWQpKCgpID0+IHtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5zZXRUYXJnZXRTZXNzaW9uKHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuZGlzY29ubmVjdCgpO1xuXHRcdFx0dGhpcy5fd2luZG93ID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fd2luZG93RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2F1eGlsaWFyeVdpbmRvd1JlZi52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5XaW5kb3dPcGVuLCBmYWxzZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlT3Blbi5maXJlKGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5XaW5kb3dPcGVuLCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlT3Blbi5maXJlKHRydWUpO1xuXHR9XG5cblx0Y2xvc2VXaW5kb3coKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl93aW5kb3cpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLnNhdmVCb3VuZHModGhpcy5fd2luZG93KTtcblx0XHQvLyBEb24ndCBkaXNjb25uZWN0IFx1MjAxNCBjbG9zaW5nIHRoZSBmbG9hdGluZyB3aW5kb3cgbWluaW1pemVzIHRoZSBVSSBidXRcblx0XHQvLyBrZWVwcyB0aGUgdm9pY2Ugc2Vzc2lvbiBhbGl2ZS4gVGhlIHNlc3Npb24gZW5kcyBvbiB0ZXJtaW5hbCBkaXNjb25uZWN0XG5cdFx0Ly8gKERpc2Nvbm5lY3QgYnV0dG9uIG9yIGFwcCBleGl0IHZpYSBvblVubG9hZCkuXG5cdFx0Ly8gQ2xlYXIgdGFyZ2V0IHNlc3Npb24gc2VsZWN0aW9uIHNvIGl0IGRvZXNuJ3Qgc2lsZW50bHkgcGVyc2lzdC5cblx0XHR0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuc2V0VGFyZ2V0U2Vzc2lvbih1bmRlZmluZWQpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5XaW5kb3dPcGVuLCBmYWxzZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdHRoaXMuX3dpbmRvdyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl93aW5kb3dEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2F1eGlsaWFyeVdpbmRvd1JlZi52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU9wZW4uZmlyZShmYWxzZSk7XG5cdH1cblxuXHRhc3luYyB0b2dnbGVXaW5kb3coKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuaXNPcGVuKSB7XG5cdFx0XHR0aGlzLmNsb3NlV2luZG93KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX293bmVyc2hpcENoYW5uZWwucG9zdE1lc3NhZ2UoeyB0eXBlOiAnY2xhaW0nIH0pO1xuXHRcdFx0YXdhaXQgdGhpcy5vcGVuV2luZG93KCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFdpbmRvdyBzaXppbmcgLS0tXG5cblx0cHJpdmF0ZSBfcmVzaXplV2luZG93KGF1eGlsaWFyeVdpbmRvdzogSUF1eGlsaWFyeVdpbmRvdyk6IHZvaWQge1xuXHRcdC8vIERlYm91bmNlIHJlc2l6ZSB0byBhdm9pZCBmaWdodGluZyB1c2VyIGRyYWcgb3BlcmF0aW9uc1xuXHRcdGlmICh0aGlzLl9yZXNpemVUaW1lb3V0KSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fcmVzaXplVGltZW91dCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc2l6ZVRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3Jlc2l6ZVRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9kb1Jlc2l6ZVdpbmRvdyhhdXhpbGlhcnlXaW5kb3cpO1xuXHRcdH0sIDEwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9kb1Jlc2l6ZVdpbmRvdyhhdXhpbGlhcnlXaW5kb3c6IElBdXhpbGlhcnlXaW5kb3cpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBwaWxsID0gYXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCdkaXYnKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG5cdFx0aWYgKCFwaWxsKSB7IHJldHVybjsgfVxuXHRcdHZvaWQgcGlsbC5vZmZzZXRXaWR0aDtcblx0XHRjb25zdCBwaWxsV2lkdGggPSBwaWxsLm9mZnNldFdpZHRoO1xuXHRcdGNvbnN0IHBpbGxIZWlnaHQgPSBwaWxsLm9mZnNldEhlaWdodDtcblx0XHRpZiAocGlsbFdpZHRoIDw9IDAgfHwgcGlsbEhlaWdodCA8PSAwKSB7IHJldHVybjsgfVxuXHRcdGNvbnN0IGN1cnJlbnRXaWR0aCA9IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cub3V0ZXJXaWR0aDtcblx0XHRjb25zdCBjdXJyZW50SGVpZ2h0ID0gYXV4aWxpYXJ5V2luZG93LndpbmRvdy5vdXRlckhlaWdodDtcblx0XHRpZiAocGlsbFdpZHRoICE9PSBjdXJyZW50V2lkdGggfHwgcGlsbEhlaWdodCAhPT0gY3VycmVudEhlaWdodCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gQ2xhbXAgaGVpZ2h0IHNvIHdpbmRvdyBkb2Vzbid0IGV4Y2VlZCBhdmFpbGFibGUgc2NyZWVuIHNwYWNlLlxuXHRcdFx0XHRjb25zdCBzY3JlZW5Cb3R0b20gPSBhdXhpbGlhcnlXaW5kb3cud2luZG93LnNjcmVlbi5hdmFpbEhlaWdodDtcblx0XHRcdFx0Y29uc3QgbWF4SGVpZ2h0ID0gc2NyZWVuQm90dG9tIC0gYXV4aWxpYXJ5V2luZG93LndpbmRvdy5zY3JlZW5ZO1xuXHRcdFx0XHRjb25zdCBjbGFtcGVkSGVpZ2h0ID0gTWF0aC5taW4ocGlsbEhlaWdodCwgTWF0aC5tYXgobWF4SGVpZ2h0LCBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfSEVJR0hUKSk7XG5cdFx0XHRcdC8vIHJlc2l6ZVRvIG9ubHkgXHUyMDE0IG5vIG1vdmVUby4gT24gbWFjT1MgdGhpcyBrZWVwcyB0b3AtbGVmdCBmaXhlZCxcblx0XHRcdFx0Ly8gd2luZG93IGdyb3dzL3Nocmlua3MgZG93bndhcmQuIE5vIHZpc2libGUgcG9zaXRpb24gY2hhbmdlLlxuXHRcdFx0XHRhdXhpbGlhcnlXaW5kb3cud2luZG93LnJlc2l6ZVRvKHBpbGxXaWR0aCwgY2xhbXBlZEhlaWdodCk7XG5cdFx0XHR9IGNhdGNoIHsgLyogcmVzaXplIG1heSBub3QgYmUgc3VwcG9ydGVkICovIH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gQm91bmRzIHBlcnNpc3RlbmNlIC0tLVxuXG5cdHByaXZhdGUgX2RlZmF1bHRCb3VuZHMoKTogSVJlY3RhbmdsZSB7XG5cdFx0Ly8gQ2VudGVyIGhvcml6b250YWxseSB3aXRoaW4gdGhlIG1haW4gVlMgQ29kZSB3aW5kb3csIG5lYXIgYm90dG9tLlxuXHRcdGNvbnN0IHggPSBNYXRoLnJvdW5kKG1haW5XaW5kb3cuc2NyZWVuWCArIChtYWluV2luZG93Lm91dGVyV2lkdGggLSBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfV0lEVEgpIC8gMik7XG5cdFx0Y29uc3QgeSA9IG1haW5XaW5kb3cuc2NyZWVuWSArIG1haW5XaW5kb3cub3V0ZXJIZWlnaHQgLSBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfSEVJR0hUIC0gMTAwO1xuXHRcdHJldHVybiB7XG5cdFx0XHR4LFxuXHRcdFx0eSxcblx0XHRcdHdpZHRoOiBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfV0lEVEgsXG5cdFx0XHRoZWlnaHQ6IEFHRU5UU19WT0lDRV9XSU5ET1dfREVGQVVMVF9IRUlHSFQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZEJvdW5kcygpOiBJUmVjdGFuZ2xlIHtcblx0XHQvLyBBbHdheXMgY29tcHV0ZSBmcmVzaCBib3VuZHMgZnJvbSB0aGUgY3VycmVudCBtYWluIHdpbmRvdyBwb3NpdGlvbi5cblx0XHQvLyBUaGlzIGVuc3VyZXMgdGhlIGF1eCB3aW5kb3cgaXMgYWx3YXlzIGNlbnRlcmVkIHdpdGhpbiBWUyBDb2RlLlxuXHRcdHJldHVybiB0aGlzLl9kZWZhdWx0Qm91bmRzKCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVCb3VuZHMoX3dpbmRvdzogSUF1eGlsaWFyeVdpbmRvdyk6IHZvaWQge1xuXHRcdC8vIEJvdW5kcyBwZXJzaXN0ZW5jZSBkaXNhYmxlZCBcdTIwMTQgYWx3YXlzIHVzZSBmcmVzaCBkZWZhdWx0cyBmb3Igbm93LlxuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElBZ2VudHNWb2ljZVdpbmRvd1NlcnZpY2UsIEFnZW50c1ZvaWNlV2luZG93U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxpQkFBaUIseUJBQXlCO0FBQy9ELFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsMEJBQTBCLGlCQUFpQjtBQUNwRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUywrQkFBaUQ7QUFDMUQsU0FBUywyQkFBMkIsd0JBQXdCLG1DQUFtQywwQ0FBMEM7QUFFekksU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQ0FBbUM7QUFDNUMs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
