import * as dom from "../../../../base/browser/dom.js";
import { observableValue, derived, autorun } from "../../../../base/common/observable.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { getWindow } from "../../../../base/browser/dom.js";
import { AGENTS_VOICE_WINDOW_DEFAULT_WIDTH, AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT } from "../common/agentsVoice.js";
import { createHeader } from "./components/headerComponent.js";
import { createStatusRows } from "./components/statusRowsComponent.js";
import { createTranscript } from "./components/transcriptComponent.js";
import { createSessionList } from "./components/sessionListComponent.js";
import { createFeedbackDialog } from "./components/feedbackDialog.js";
import { createOnboarding } from "./components/onboardingComponent.js";
import { createVoiceBar } from "./components/voiceBarComponent.js";
import { FONT_SIZE, addKeyboardActivation, isSecondaryPointerGesture } from "./components/tokens.js";
import { computeVoiceMicGlowBoxShadow, voiceGlowStateColor } from "../../chat/browser/voiceClient/voiceGlow.js";
import { createVoiceGlowController } from "../../chat/browser/voiceClient/voiceGlowController.js";
const DEFAULT_OPTIONS = {
  width: AGENTS_VOICE_WINDOW_DEFAULT_WIDTH,
  draggable: true,
  showClose: true,
  showExpandChevron: true,
  showStatusText: false,
  showStatusCounters: true,
  showCopilotIcon: false,
  centerConnectButton: false,
  title: "",
  subtitle: "",
  focusable: false,
  showOnboarding: false,
  reshowOnboardingOnDisconnect: false,
  defaultExpanded: false,
  inputBoxLayout: false
};
class AgentsVoiceWidget extends Disposable {
  constructor(container, callbacks, options = {}) {
    super();
    this.container = container;
    this.callbacks = callbacks;
    // --- Reactive state ---
    this._isConnected = observableValue(this, false);
    this._isConnecting = observableValue(this, false);
    this._isReconnecting = observableValue(this, false);
    this._voiceState = observableValue(this, "idle");
    this._expanded = observableValue(this, false);
    this._workingCount = observableValue(this, 0);
    this._needsInputCount = observableValue(this, 0);
    this._doneCount = observableValue(this, 0);
    this._pendingToolConfirmations = observableValue(this, []);
    this._speakingSession = observableValue(this, void 0);
    this._speakingSessionLabel = observableValue(this, void 0);
    this._sessions = observableValue(this, []);
    this._sessionGroups = observableValue(this, void 0);
    this._selectedTargetSession = observableValue(this, void 0);
    this._transcriptTurns = observableValue(this, []);
    this._pttKeyLabel = observableValue(this, void 0);
    this._statusText = observableValue(this, "");
    this._popoutAvailable = observableValue(this, true);
    this._feedbackDialogState = observableValue(this, null);
    this._showOnboarding = observableValue(this, false);
    this._onboardingPendingConnect = observableValue(this, false);
    // --- Derived state ---
    this._shouldShowExpanded = derived(this, (reader) => this._expanded.read(reader));
    // --- DOM components ---
    this._headerComponent = createHeader();
    this._onboardingComponent = createOnboarding();
    this._feedbackDialogComponent = createFeedbackDialog();
    this._voiceBarComponent = createVoiceBar();
    this._transcriptComponent = this._register(createTranscript());
    this._inputBoxTranscriptComponent = this._register(createTranscript());
    this._statusRowsComponent = createStatusRows();
    this._sessionListComponent = createSessionList();
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._showOnboarding.set(this._options.showOnboarding, void 0);
    this._expanded.set(this._options.defaultExpanded, void 0);
    const opts = this._options;
    const widthStyle = opts.width === "auto" ? "width:100%;position:relative;" : `position:absolute;top:0;left:0;width:${opts.width}px;${opts.inputBoxLayout ? "" : `min-height:${AGENTS_VOICE_WINDOW_DEFAULT_HEIGHT}px;`}`;
    this._rootDiv = dom.$("div");
    this._rootDiv.style.cssText = `${widthStyle}display:flex;flex-direction:column;user-select:none;font-family:inherit;font-size:${FONT_SIZE.base};color:var(--vscode-foreground);box-sizing:border-box;margin:0;${opts.inputBoxLayout && opts.draggable ? "-webkit-app-region:drag;" : ""}`;
    this._glowDiv = dom.$("div");
    this._glowDiv.style.cssText = "position:absolute;top:0;left:0;right:0;height:50px;pointer-events:none;z-index:0;";
    this._titleRow = dom.$("div");
    this._titleRow.style.cssText = "display:flex;align-items:baseline;gap:6px;padding:8px 14px 0;overflow:hidden;white-space:nowrap;position:relative;z-index:1;";
    if (opts.title) {
      const titleSpan = dom.$("span");
      titleSpan.style.cssText = `font-size:${FONT_SIZE.micro};font-weight:700;color:var(--vscode-sideBarSectionHeader-foreground, var(--vscode-foreground));text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0;user-select:none;`;
      titleSpan.textContent = opts.title;
      this._titleRow.append(titleSpan);
      if (opts.subtitle) {
        const subtitleSpan = dom.$("span");
        subtitleSpan.style.cssText = `font-size:${FONT_SIZE.micro};font-weight:400;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;`;
        subtitleSpan.textContent = opts.subtitle;
        this._titleRow.append(subtitleSpan);
      }
    }
    this._contentDiv = dom.$("div");
    this._contentDiv.style.cssText = "display:flex;flex-direction:column;flex:1;padding:8px 14px 2px;position:relative;z-index:1;";
    this._statusTextDiv = dom.$("div");
    this._statusTextDiv.style.cssText = `text-align:center;font-size:${FONT_SIZE.body};font-weight:500;color:var(--vscode-foreground);padding:2px 0;`;
    this._sessionListWrapper = dom.$("div");
    this._sessionListWrapper.style.cssText = "display:flex;flex-direction:column;-webkit-app-region:no-drag;overflow:hidden;";
    this._sessionListWrapper.append(this._sessionListComponent.element);
    this._expandSpacer = dom.$("div");
    this._expandSpacer.style.cssText = "flex:1;";
    this._chevronWrapper = dom.$("div");
    this._chevronWrapper.role = "button";
    this._chevronWrapper.tabIndex = 0;
    this._chevronWrapper.style.cssText = "display:flex;justify-content:center;cursor:pointer;-webkit-app-region:no-drag;";
    this._chevronIcon = dom.$("span.codicon");
    this._chevronIcon.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);`;
    this._register(dom.addDisposableListener(this._chevronIcon, "mouseenter", () => {
      this._chevronIcon.style.color = "var(--vscode-foreground)";
    }));
    this._register(dom.addDisposableListener(this._chevronIcon, "mouseleave", () => {
      this._chevronIcon.style.color = "var(--vscode-descriptionForeground)";
    }));
    this._chevronWrapper.append(this._chevronIcon);
    this._register(dom.addDisposableListener(this._chevronWrapper, "click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.callbacks.showSessionsPicker) {
        this.callbacks.showSessionsPicker();
      } else {
        this._expanded.set(!this._expanded.get(), void 0);
      }
    }));
    this._register(dom.addDisposableListener(this._chevronWrapper, "keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._chevronWrapper.click();
      }
    }));
    if (opts.inputBoxLayout) {
      const styleEl = dom.$("style");
      styleEl.textContent = `
				@property --voice-processing-angle { syntax: '<angle>'; inherits: false; initial-value: 135deg; }
				@keyframes voice-processing-spin { from { --voice-processing-angle: 135deg; } to { --voice-processing-angle: 495deg; } }
				@keyframes agents-voice-input-icon-pulse {
					0%, 100% { box-shadow: 0 0 4px rgba(var(--agents-voice-input-icon-rgb, 88,166,255), 0.45); }
					50% { box-shadow: 0 0 10px rgba(var(--agents-voice-input-icon-rgb, 88,166,255), 0.75); }
				}
				.monaco-workbench.monaco-enable-motion .agents-voice-mode-button.agents-voice-mode-active {
					animation: agents-voice-input-icon-pulse 1.4s ease-in-out infinite;
				}
				.processing { overflow: visible !important; }
				.processing::before {
					content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
					background: conic-gradient(from var(--voice-processing-angle),
						transparent 0deg, rgba(88,166,255,0.9) 20deg, rgba(88,166,255,1) 30deg,
						rgba(88,166,255,0.6) 50deg, transparent 90deg, transparent 360deg);
					-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					-webkit-mask-composite: xor; mask-composite: exclude;
					animation: voice-processing-spin 3s linear infinite;
					pointer-events: none; z-index: 2;
				}
				.processing::after {
					content: ''; position: absolute; inset: -1px; border-radius: inherit; padding: 2px;
					background: conic-gradient(from var(--voice-processing-angle),
						transparent 0deg, rgba(88,166,255,0.5) 25deg, rgba(88,166,255,0.3) 50deg, transparent 90deg, transparent 360deg);
					-webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
					-webkit-mask-composite: xor; mask-composite: exclude;
					filter: blur(1.5px); animation: voice-processing-spin 3s linear infinite;
					pointer-events: none; z-index: 1;
				}
			`;
      getWindow(this.container).document.head.append(styleEl);
      this._inputBoxContainer = dom.$("div");
      this._inputBoxContainer.style.cssText = "box-sizing:border-box;background-color:var(--vscode-input-background);border:1px solid var(--vscode-input-border, transparent);border-radius:var(--vscode-cornerRadius-large, 8px);padding:10px 12px;width:100%;position:relative;min-height:32px;display:flex;align-items:center;-webkit-app-region:no-drag;";
      this._inputBoxPlaceholder = dom.$("span");
      this._inputBoxPlaceholder.style.cssText = `font-size:${FONT_SIZE.body};color:var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));user-select:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;`;
      this._inputBoxTranscriptComponent.element.style.width = "100%";
      this._inputBoxTranscriptComponent.element.style.display = "none";
      this._inputBoxContainer.append(this._inputBoxPlaceholder, this._inputBoxTranscriptComponent.element);
      this._glowController = this._register(createVoiceGlowController(
        this._inputBoxContainer,
        () => this.callbacks.getGlowTheme(),
        () => this.callbacks.getGlowColors()
      ));
      this._register(this.callbacks.onDidChangeGlowTheme(() => this._glowController?.refreshTheme()));
      this._inputBoxToolbar = dom.$("div");
      this._inputBoxToolbar.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 4px 2px;-webkit-app-region:no-drag;";
      const toolbarBtn = (className, ariaLabel, title) => {
        const el = dom.$(`span.codicon.${className}`);
        el.role = "button";
        el.tabIndex = 0;
        el.ariaLabel = ariaLabel;
        el.title = title;
        el.style.cssText = `font-size:${FONT_SIZE.iconSm};color:var(--vscode-descriptionForeground);cursor:pointer;-webkit-app-region:no-drag;padding:2px;`;
        this._register(dom.addDisposableListener(el, "mouseenter", () => {
          el.style.color = "var(--vscode-foreground)";
        }));
        this._register(dom.addDisposableListener(el, "mouseleave", () => {
          el.style.color = "var(--vscode-descriptionForeground)";
        }));
        addKeyboardActivation(el);
        return el;
      };
      this._inputBoxMicBtn = dom.$("span.codicon.codicon-voice-mode.agents-voice-mode-button");
      this._inputBoxMicBtn.role = "button";
      this._inputBoxMicBtn.tabIndex = 0;
      this._inputBoxMicBtn.ariaLabel = localize("agentsVoice.pushToTalkSpace", "Push to talk (Space)");
      this._inputBoxMicBtn.title = localize("agentsVoice.pushToTalkSpace", "Push to talk (Space)");
      this._inputBoxMicBtn.style.cssText = `font-size:${FONT_SIZE.iconMd};cursor:pointer;-webkit-app-region:no-drag;border-radius:4px;padding:2px;`;
      this._register(dom.addDisposableListener(this._inputBoxMicBtn, "contextmenu", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.callbacks.showVoiceContextMenu(e);
      }));
      this._inputBoxConnIndicator = toolbarBtn(
        "codicon-debug-connected",
        localize("agentsVoice.disconnect", "Disconnect"),
        localize("agentsVoice.disconnect", "Disconnect")
      );
      this._inputBoxFeedbackBtn = toolbarBtn(
        "codicon-feedback",
        localize("agentsVoice.sendFeedback", "Send feedback"),
        localize("agentsVoice.sendFeedback", "Send feedback")
      );
      this._inputBoxSessionsBtn = toolbarBtn(
        "codicon-list-tree",
        localize("agentsVoice.sessions", "Sessions"),
        localize("agentsVoice.sessions", "Sessions")
      );
      this._register(dom.addDisposableListener(this._inputBoxSessionsBtn, "click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._expanded.set(!this._expanded.get(), void 0);
      }));
      this._inputBoxCloseBtn = toolbarBtn(
        "codicon-chrome-minimize",
        localize("agentsVoice.minimize", "Minimize"),
        localize("agentsVoice.minimize", "Minimize")
      );
      const toolbarSpacer = dom.$("span");
      toolbarSpacer.style.flex = "1";
      this._inputBoxToolbar.append(
        this._inputBoxMicBtn,
        this._inputBoxConnIndicator,
        toolbarSpacer,
        this._inputBoxFeedbackBtn,
        this._inputBoxSessionsBtn,
        this._inputBoxCloseBtn
      );
    }
    if (opts.inputBoxLayout) {
      this._contentDiv.append(
        this._onboardingComponent.element,
        this._feedbackDialogComponent.element,
        this._inputBoxToolbar,
        this._transcriptComponent.element,
        this._sessionListWrapper,
        this._statusRowsComponent.element,
        this._inputBoxContainer
      );
    } else {
      this._contentDiv.append(
        this._onboardingComponent.element,
        this._headerComponent.element,
        this._voiceBarComponent.element,
        this._feedbackDialogComponent.element,
        this._statusTextDiv,
        this._transcriptComponent.element,
        this._statusRowsComponent.element,
        this._sessionListWrapper,
        this._expandSpacer,
        this._chevronWrapper
      );
    }
    this._rootDiv.append(this._glowDiv, this._titleRow, this._contentDiv);
    this.container.append(this._rootDiv);
    if (this._options.focusable) {
      this.container.tabIndex = 0;
      const win = getWindow(this.container);
      let pttKeyCode;
      let heldKeyCode;
      let releasedBeforeListening = false;
      const onDocKeydown = (e) => {
        heldKeyCode = e.code;
        releasedBeforeListening = false;
      };
      const onDocKeyup = (e) => {
        if (e.code === heldKeyCode) {
          heldKeyCode = void 0;
          if (pttKeyCode === void 0) {
            releasedBeforeListening = true;
          }
        }
      };
      win.document.addEventListener("keydown", onDocKeydown, true);
      win.document.addEventListener("keyup", onDocKeyup, true);
      this._register(toDisposable(() => {
        win.document.removeEventListener("keydown", onDocKeydown, true);
        win.document.removeEventListener("keyup", onDocKeyup, true);
      }));
      this._register(dom.addDisposableListener(this.container, "keydown", (e) => {
        if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
          e.preventDefault();
        }
      }));
      this._register(dom.addDisposableListener(this.container, "keyup", (e) => {
        if (!_isTextInput(e.target) && pttKeyCode && e.code === pttKeyCode) {
          e.preventDefault();
          pttKeyCode = void 0;
          this.callbacks.pttUp();
        }
      }));
      let wasListening = false;
      this._register(autorun((reader) => {
        const listening = this._voiceState.read(reader) === "listening";
        if (listening && !wasListening && pttKeyCode === void 0) {
          if (heldKeyCode !== void 0) {
            pttKeyCode = heldKeyCode;
          } else if (releasedBeforeListening) {
            releasedBeforeListening = false;
            this.callbacks.pttUp();
          }
        }
        if (!listening) {
          releasedBeforeListening = false;
        }
        wasListening = listening;
      }));
      const onDocPointerUp = () => this.callbacks.pttUp();
      win.document.addEventListener("pointerup", onDocPointerUp);
      this._register(toDisposable(() => win.document.removeEventListener("pointerup", onDocPointerUp)));
    }
    const pttChannel = new BroadcastChannel("vscode-ptt");
    pttChannel.onmessage = (e) => {
      if (e.data === "down") {
        this.callbacks.pttDown();
      }
      if (e.data === "up") {
        this.callbacks.pttUp();
      }
    };
    this._register(toDisposable(() => pttChannel.close()));
    const renderDisposable = autorun((reader) => {
      this._updateDOM(reader);
      getWindow(this.container).requestAnimationFrame(() => {
        this.callbacks.onResize();
      });
    });
    this._register(renderDisposable);
    this._register(toDisposable(() => dom.clearNode(this.container)));
    let sawConnecting = false;
    let failureCheckPending = false;
    let disposed = false;
    const onboardingConnectDisposable = autorun((reader) => {
      if (!this._onboardingPendingConnect.read(reader)) {
        sawConnecting = false;
        return;
      }
      if (this._isConnected.read(reader)) {
        this._onboardingPendingConnect.set(false, void 0);
        sawConnecting = false;
        this._showOnboarding.set(false, void 0);
        this.callbacks.onOnboardingCompleted?.();
        return;
      }
      if (this._isConnecting.read(reader)) {
        sawConnecting = true;
        return;
      }
      if (sawConnecting && !failureCheckPending) {
        failureCheckPending = true;
        queueMicrotask(() => {
          failureCheckPending = false;
          if (disposed) {
            return;
          }
          if (this._onboardingPendingConnect.read(void 0) && !this._isConnected.read(void 0) && !this._isConnecting.read(void 0)) {
            this._onboardingPendingConnect.set(false, void 0);
            sawConnecting = false;
          }
        });
      }
    });
    this._register(toDisposable(() => {
      disposed = true;
    }));
    this._register(onboardingConnectDisposable);
    if (this._options.reshowOnboardingOnDisconnect) {
      const reshowDisposable = autorun((reader) => {
        const connected = this._isConnected.read(reader);
        const connecting = this._isConnecting.read(reader);
        const reconnecting = this._isReconnecting.read(reader);
        const pendingConnect = this._onboardingPendingConnect.read(reader);
        if (!connected && !connecting && !reconnecting && !pendingConnect) {
          if (!this._showOnboarding.read(reader)) {
            this._showOnboarding.set(true, void 0);
          }
        }
      });
      this._register(reshowDisposable);
    }
    this._register(autorun((reader) => {
      const onboarding = this._showOnboarding.read(reader);
      const voiceState = this._voiceState.read(reader);
      if (onboarding || voiceState === "listening" || voiceState === "speaking") {
        this._startWaveformAnimation();
      } else {
        this._stopWaveformAnimation();
      }
    }));
    this._register(toDisposable(() => this._stopWaveformAnimation()));
  }
  _updateDOM(reader) {
    if (this._options.inputBoxLayout) {
      this._updateDOMInputBoxLayout(reader);
    } else {
      this._updateDOMClassicLayout(reader);
    }
  }
  _updateDOMInputBoxLayout(reader) {
    const onboarding = this._showOnboarding.read(reader);
    const voiceState = this._voiceState.read(reader);
    const isConnected = this._isConnected.read(reader);
    const isConnecting = this._isConnecting.read(reader);
    const isReconnecting = this._isReconnecting.read(reader);
    const showConnected = isConnected || isReconnecting;
    const opts = this._options;
    const showExpanded = this._shouldShowExpanded.read(reader) && opts.showExpandChevron;
    const baseWidth = typeof opts.width === "number" ? opts.width : AGENTS_VOICE_WINDOW_DEFAULT_WIDTH;
    this._rootDiv.style.width = `${baseWidth}px`;
    this._titleRow.style.display = onboarding || !opts.title ? "none" : "flex";
    if (onboarding) {
      this._onboardingComponent.element.style.display = "";
      this._feedbackDialogComponent.element.style.display = "none";
      this._inputBoxContainer.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
      this._inputBoxToolbar.style.display = "none";
      this._onboardingComponent.update({
        pttKeyLabel: this._pttKeyLabel.read(reader),
        isConnecting: this._onboardingPendingConnect.read(reader) || isConnecting,
        onGetStarted: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._dismissOnboarding(true);
        },
        onOpenPttKeySettings: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPttKeySettings();
        },
        onOpenPopout: this.callbacks.openPopout ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPopout?.();
        } : void 0
      });
      return;
    }
    this._onboardingComponent.element.style.display = "none";
    const feedbackState = this._feedbackDialogState.read(reader);
    if (feedbackState) {
      this._feedbackDialogComponent.element.style.display = "";
      this._feedbackDialogComponent.update({
        onSubmit: (text) => this._submitFeedback(text),
        onCancel: () => {
          this._feedbackDialogState.set(null, void 0);
        }
      }, feedbackState);
      this._inputBoxContainer.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
      this._inputBoxToolbar.style.display = "none";
      return;
    }
    this._feedbackDialogComponent.element.style.display = "none";
    this._inputBoxContainer.style.display = "flex";
    const transcriptTurns = this._transcriptTurns.read(reader);
    const hasTranscript = transcriptTurns.some((t) => t.text.length > 0 || t.speaker === "user" && t.isPartial);
    const shouldShowInputGlow = showConnected && (voiceState === "listening" || voiceState === "speaking");
    if (!shouldShowInputGlow) {
      this._glowController?.clear();
    }
    this._inputBoxContainer.classList.toggle("processing", voiceState === "processing");
    if (hasTranscript) {
      if (showExpanded) {
        this._transcriptComponent.element.style.display = "";
        this._transcriptComponent.element.style.padding = "8px 12px";
        this._transcriptComponent.element.style.borderBottom = "1px solid var(--vscode-widget-border, var(--vscode-input-border, transparent))";
        this._transcriptComponent.update({ turns: transcriptTurns, chatStyle: true });
        this._inputBoxPlaceholder.style.display = "none";
        this._inputBoxTranscriptComponent.element.style.display = "none";
      } else {
        this._inputBoxPlaceholder.style.display = "none";
        this._transcriptComponent.element.style.display = "none";
        this._transcriptComponent.element.style.padding = "";
        this._transcriptComponent.element.style.borderBottom = "";
        this._inputBoxTranscriptComponent.element.style.display = "";
        this._inputBoxTranscriptComponent.update({ turns: transcriptTurns, chatStyle: true, scrollToTop: true });
      }
    } else {
      this._inputBoxPlaceholder.style.display = "";
      this._inputBoxTranscriptComponent.element.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      const keyLabel2 = this._pttKeyLabel.read(reader);
      if (isReconnecting) {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.reconnecting", "Reconnecting...");
      } else if (isConnecting) {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.connecting", "Connecting...");
      } else if (isConnected && voiceState === "listening") {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.listening", "Listening");
      } else if (isConnected && voiceState === "speaking") {
        this._inputBoxPlaceholder.textContent = keyLabel2 ? localize("agentsVoice.pressToBargeIn", "Speak or use {0}", keyLabel2) : localize("agentsVoice.speakToBargeIn", "Speak to barge in");
      } else if (isConnected) {
        this._inputBoxPlaceholder.textContent = keyLabel2 ? localize("agentsVoice.holdToTalkOrBargeIn", "Hold {0} to talk or barge in", keyLabel2) : localize("agentsVoice.holdMicToTalkOrBargeIn", "Hold the mic to talk or barge in");
      } else if (keyLabel2) {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.holdToTalk", "Hold {0} to talk", keyLabel2);
      } else {
        this._inputBoxPlaceholder.textContent = localize("agentsVoice.clickMicToTalk", "Click voice mode to talk");
      }
    }
    if (!showExpanded) {
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
    } else {
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "";
      this._sessionListWrapper.style.maxHeight = "200px";
      this._sessionListWrapper.style.overflowY = "auto";
      this._sessionListWrapper.style.scrollbarWidth = "none";
      this._sessionListComponent.update({
        sessions: this._sessions.read(reader),
        groups: this._sessionGroups.read(reader),
        selectedTarget: this._selectedTargetSession.read(reader),
        onOpenSession: (r) => this.callbacks.openSession(r),
        onStopSession: (r) => this.callbacks.stopSession(r),
        onCancelSession: (r) => this.callbacks.cancelSession(r),
        onSelectTarget: (r) => {
          this._selectedTargetSession.set(r, void 0);
          this.callbacks.selectTargetSession(r);
        },
        onNewSession: () => this.callbacks.newSessionAsTarget()
      });
    }
    this._inputBoxToolbar.style.display = "flex";
    this._inputBoxMicBtn.style.display = "";
    const keyLabel = this._pttKeyLabel.read(reader);
    const micTooltip = keyLabel ? localize("agentsVoice.pushToTalkKey", "Push to talk ({0})", keyLabel) : localize("agentsVoice.pushToTalk", "Push to talk");
    this._inputBoxMicBtn.title = micTooltip;
    this._inputBoxMicBtn.ariaLabel = micTooltip;
    const micColor = voiceState === "error" ? "var(--vscode-editorError-foreground)" : voiceState === "listening" ? "var(--vscode-editorInfo-foreground)" : voiceState === "speaking" ? "var(--vscode-agentsVoice-speakingForeground)" : "var(--vscode-descriptionForeground)";
    this._inputBoxMicBtn.style.color = micColor;
    const micIsActive = voiceState === "listening" || voiceState === "speaking";
    this._inputBoxMicBtn.classList.toggle("agents-voice-mode-active", micIsActive);
    this._inputBoxMicBtn.style.setProperty("--agents-voice-input-icon-rgb", voiceState === "speaking" ? "163,113,247" : "88,166,255");
    this._inputBoxMicBtn.style.borderRadius = "50%";
    if (!micIsActive) {
      this._inputBoxMicBtn.style.boxShadow = "none";
    }
    this._inputBoxMicBtn.onmousedown = (e) => {
      if (isSecondaryPointerGesture(e)) {
        return;
      }
      e.preventDefault();
      this.callbacks.pttDown();
    };
    this._inputBoxMicBtn.onmouseup = (e) => {
      if (isSecondaryPointerGesture(e)) {
        return;
      }
      this.callbacks.pttUp();
    };
    this._inputBoxConnIndicator.style.display = showConnected ? "" : "none";
    this._inputBoxConnIndicator.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.disconnect();
    };
    this._inputBoxFeedbackBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._toggleFeedbackDialog();
    };
    this._inputBoxSessionsBtn.style.display = "";
    this._inputBoxSessionsBtn.className = `codicon codicon-${showExpanded ? "chevron-up" : "list-tree"}`;
    this._inputBoxSessionsBtn.title = showExpanded ? localize("agentsVoice.collapseSessions", "Collapse sessions") : localize("agentsVoice.sessions", "Sessions");
    this._inputBoxCloseBtn.style.display = opts.showClose ? "" : "none";
    this._inputBoxCloseBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.callbacks.closeWindow();
    };
  }
  _updateDOMClassicLayout(reader) {
    const onboarding = this._showOnboarding.read(reader);
    const voiceState = this._voiceState.read(reader);
    const opts = this._options;
    const showExpanded = this._shouldShowExpanded.read(reader) && opts.showExpandChevron;
    this._titleRow.style.display = onboarding || !opts.title ? "none" : "flex";
    if (onboarding) {
      this._onboardingComponent.element.style.display = "";
      this._headerComponent.element.style.display = "none";
      this._voiceBarComponent.element.style.display = "none";
      this._feedbackDialogComponent.element.style.display = "none";
      this._statusTextDiv.style.display = "none";
      this._transcriptComponent.element.style.display = "none";
      this._statusRowsComponent.element.style.display = "none";
      this._sessionListWrapper.style.display = "none";
      this._expandSpacer.style.display = "none";
      this._chevronWrapper.style.display = "none";
      this._onboardingComponent.update({
        pttKeyLabel: this._pttKeyLabel.read(reader),
        isConnecting: this._onboardingPendingConnect.read(reader) || this._isConnecting.read(reader),
        onGetStarted: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._dismissOnboarding(true);
        },
        onOpenPttKeySettings: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPttKeySettings();
        },
        onOpenPopout: this.callbacks.openPopout ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPopout?.();
        } : void 0
      });
    } else {
      this._onboardingComponent.element.style.display = "none";
      this._headerComponent.element.style.display = "";
      const feedbackState = this._feedbackDialogState.read(reader);
      this._headerComponent.update({
        copilotIconSrc: this.callbacks.copilotIconSrc,
        showCopilotIcon: opts.showCopilotIcon,
        isConnected: this._isConnected.read(reader),
        isConnecting: this._isConnecting.read(reader),
        isReconnecting: this._isReconnecting.read(reader),
        voiceState,
        draggable: opts.draggable,
        showClose: opts.showClose,
        showPopout: !!this.callbacks.openPopout && this._popoutAvailable.read(reader),
        hideDisconnect: this.callbacks.hideDisconnect,
        centerConnectButton: opts.centerConnectButton,
        onMicDown: (e) => {
          e.preventDefault();
          this.callbacks.pttDown();
        },
        onMicUp: () => {
          this.callbacks.pttUp();
        },
        onConnectClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this._isConnecting.get()) {
            return;
          }
          if (this._isConnected.get()) {
            this.callbacks.disconnect();
          } else {
            this.callbacks.connect();
          }
        },
        onDisconnectClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.disconnect();
        },
        onCloseClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.closeWindow();
        },
        onToggleClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._expanded.set(!this._expanded.get(), void 0);
        },
        onMicContextMenu: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.showVoiceContextMenu(e);
        },
        onPopoutClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.callbacks.openPopout?.();
        },
        onFeedbackClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._toggleFeedbackDialog();
        },
        pttKeyLabel: this._pttKeyLabel.read(reader),
        expanded: showExpanded
      });
      if (feedbackState) {
        this._voiceBarComponent.element.style.display = "none";
        this._feedbackDialogComponent.element.style.display = "";
        this._feedbackDialogComponent.update({
          onSubmit: (text) => this._submitFeedback(text),
          onCancel: () => {
            this._feedbackDialogState.set(null, void 0);
          }
        }, feedbackState);
        this._statusTextDiv.style.display = "none";
        this._transcriptComponent.element.style.display = "none";
        this._statusRowsComponent.element.style.display = "none";
        this._sessionListWrapper.style.display = "none";
        this._expandSpacer.style.display = "none";
        this._chevronWrapper.style.display = "none";
      } else {
        this._feedbackDialogComponent.element.style.display = "none";
        this._voiceBarComponent.update({
          voiceState,
          speakingSessionLabel: this._speakingSessionLabel.read(reader),
          speakingSession: this._speakingSession.read(reader),
          onStopSpeech: () => this.callbacks.stopPlayback()
        });
        const statusText = this._statusText.read(reader);
        const isError = voiceState === "error";
        if ((opts.showStatusText || isError) && statusText) {
          this._statusTextDiv.style.display = "";
          this._statusTextDiv.textContent = statusText;
          this._statusTextDiv.style.color = isError ? "var(--vscode-editorError-foreground)" : "var(--vscode-foreground)";
        } else {
          this._statusTextDiv.style.display = "none";
        }
        this._transcriptComponent.update({ turns: this._transcriptTurns.read(reader) });
        if (!showExpanded) {
          this._statusRowsComponent.element.style.display = "";
          this._statusRowsComponent.update({
            workingCount: this._workingCount.read(reader),
            needsInputCount: this._needsInputCount.read(reader),
            doneCount: this._doneCount.read(reader),
            showCounters: opts.showStatusCounters,
            speakingSessionLabel: this._speakingSessionLabel.read(reader),
            speakingSessionResource: this._speakingSession.read(reader),
            pendingToolConfirmations: this._pendingToolConfirmations.read(reader),
            onOpenSession: (r) => this.callbacks.openSession(r)
          });
          this._sessionListWrapper.style.display = "none";
        } else {
          this._statusRowsComponent.element.style.display = "none";
          this._sessionListWrapper.style.display = "";
          this._sessionListComponent.update({
            sessions: this._sessions.read(reader),
            groups: this._sessionGroups.read(reader),
            selectedTarget: this._selectedTargetSession.read(reader),
            onOpenSession: (r) => this.callbacks.openSession(r),
            onStopSession: (r) => this.callbacks.stopSession(r),
            onCancelSession: (r) => this.callbacks.cancelSession(r),
            onSelectTarget: (r) => {
              this._selectedTargetSession.set(r, void 0);
              this.callbacks.selectTargetSession(r);
            },
            onNewSession: () => this.callbacks.newSessionAsTarget()
          });
        }
        this._expandSpacer.style.display = "";
        this._chevronWrapper.style.display = opts.showExpandChevron ? "flex" : "none";
        this._chevronWrapper.title = showExpanded ? "Collapse sessions" : "Expand sessions";
        this._chevronIcon.className = `codicon codicon-${showExpanded ? "chevron-up" : "chevron-down"}`;
      }
    }
  }
  // --- Public state setters (called by the service) ---
  setConnected(connected) {
    this._isConnected.set(connected, void 0);
  }
  setConnecting(connecting) {
    this._isConnecting.set(connecting, void 0);
  }
  setReconnecting(reconnecting) {
    this._isReconnecting.set(reconnecting, void 0);
  }
  setVoiceState(state) {
    this._voiceState.set(state, void 0);
  }
  setStatusCounts(working, needsInput, done) {
    this._workingCount.set(working, void 0);
    this._needsInputCount.set(needsInput, void 0);
    this._doneCount.set(done, void 0);
  }
  setPendingToolConfirmations(confirmations) {
    this._pendingToolConfirmations.set(confirmations, void 0);
  }
  setSpeakingSession(session, label) {
    this._speakingSession.set(session, void 0);
    this._speakingSessionLabel.set(label, void 0);
  }
  setSessions(sessions) {
    this._sessions.set(sessions, void 0);
  }
  setSelectedTargetSession(resource) {
    this._selectedTargetSession.set(resource, void 0);
  }
  setSessionGroups(groups) {
    this._sessionGroups.set(groups, void 0);
  }
  setPttKeyLabel(label) {
    this._pttKeyLabel.set(label, void 0);
  }
  setTranscriptTurns(turns) {
    this._transcriptTurns.set(turns, void 0);
  }
  setStatusText(text) {
    this._statusText.set(text, void 0);
  }
  setPopoutAvailable(available) {
    this._popoutAvailable.set(available, void 0);
  }
  // --- Feedback dialog ---
  _toggleFeedbackDialog() {
    if (this._feedbackDialogState.get()) {
      this._feedbackDialogState.set(null, void 0);
    } else {
      this._showOnboarding.set(false, void 0);
      this._feedbackDialogState.set({ isSubmitting: false, submitted: false }, void 0);
    }
  }
  // --- Onboarding ---
  _dismissOnboarding(connect = false) {
    if (connect) {
      if (this._isConnected.get()) {
        this._showOnboarding.set(false, void 0);
        this.callbacks.onOnboardingCompleted?.();
        return;
      }
      if (!this._isConnecting.get() && !this._onboardingPendingConnect.get()) {
        this._onboardingPendingConnect.set(true, void 0);
        this.callbacks.connect();
      }
    } else {
      this._showOnboarding.set(false, void 0);
      this.callbacks.onOnboardingCompleted?.();
    }
  }
  /**
   * Externally trigger onboarding dismissal (e.g. when the user connects
   * from the floating mini-view, the main panel should drop the onboarding).
   * Also clears any in-flight pending-connect state so a later success
   * doesn't re-trigger the completion callback.
   */
  dismissOnboarding() {
    this._onboardingPendingConnect.set(false, void 0);
    if (this._showOnboarding.get()) {
      this._showOnboarding.set(false, void 0);
    }
  }
  _submitFeedback(text) {
    this._feedbackDialogState.set({ isSubmitting: true, submitted: false }, void 0);
    this.callbacks.submitFeedback(text).then((result) => {
      if (result.ok) {
        this._feedbackDialogState.set({ isSubmitting: false, submitted: true }, void 0);
        setTimeout(() => {
          this._feedbackDialogState.set(null, void 0);
        }, 3e3);
      } else {
        this._feedbackDialogState.set({ isSubmitting: false, submitted: false, error: result.error ?? localize("agentsVoice.feedbackError", "Failed to submit") }, void 0);
      }
    });
  }
  _startWaveformAnimation() {
    if (this._animationFrameId !== void 0) {
      return;
    }
    const animate = () => {
      this._animationFrameId = getWindow(this.container).requestAnimationFrame(animate);
      const onboarding = this._showOnboarding.get();
      const voiceState = this._voiceState.get();
      if (!(onboarding || voiceState === "listening" || voiceState === "speaking")) {
        return;
      }
      const analyser = this.callbacks.getAnalyserNode();
      let intensity;
      if (onboarding) {
        intensity = 0.6;
      } else if (!analyser) {
        intensity = 0.3;
      } else {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        intensity = Math.min(1, sum / dataArray.length / 80);
      }
      if (this._glowController && (voiceState === "listening" || voiceState === "speaking")) {
        this._glowController.render(voiceState, intensity, this.callbacks.isMotionReduced());
      }
      const colors = this.callbacks.getGlowColors();
      if (this._inputBoxMicBtn) {
        const iconGlowActive = voiceState === "listening" || voiceState === "speaking";
        this._inputBoxMicBtn.style.boxShadow = iconGlowActive ? computeVoiceMicGlowBoxShadow(voiceState, intensity, colors) : "none";
      }
      this._glowDiv.style.display = "";
      const baseOpacity = 0.15 + intensity * 0.4;
      const { r, g, b } = voiceGlowStateColor(onboarding ? "speaking" : voiceState, colors).rgba;
      const rgb = `${r},${g},${b}`;
      this._glowDiv.style.background = `radial-gradient(ellipse 40% 70% at 50% 0%, rgba(${rgb},${baseOpacity}) 0%, transparent 100%), radial-gradient(ellipse 70% 100% at 50% 0%, rgba(${rgb},${baseOpacity * 0.4}) 0%, transparent 100%)`;
    };
    this._animationFrameId = getWindow(this.container).requestAnimationFrame(animate);
  }
  _stopWaveformAnimation() {
    if (this._animationFrameId !== void 0) {
      getWindow(this.container).cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = void 0;
    }
    this._glowDiv.style.display = "none";
    this._glowController?.clear();
    if (this._inputBoxMicBtn) {
      this._inputBoxMicBtn.style.boxShadow = "none";
    }
  }
}
function _isTextInput(target) {
  if (!target || typeof target.tagName !== "string") {
    return false;
  }
  const el = target;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") {
    return true;
  }
  return el.isContentEditable === true;
}
export {
  AgentsVoiceWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvYWdlbnRzVm9pY2VXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUsIGRlcml2ZWQsIGF1dG9ydW4sIHR5cGUgSVNldHRhYmxlT2JzZXJ2YWJsZSwgdHlwZSBJUmVhZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfV0lEVEgsIEFHRU5UU19WT0lDRV9XSU5ET1dfREVGQVVMVF9IRUlHSFQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRzVm9pY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlSGVhZGVyIH0gZnJvbSAnLi9jb21wb25lbnRzL2hlYWRlckNvbXBvbmVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdGF0dXNSb3dzIH0gZnJvbSAnLi9jb21wb25lbnRzL3N0YXR1c1Jvd3NDb21wb25lbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlVHJhbnNjcmlwdCB9IGZyb20gJy4vY29tcG9uZW50cy90cmFuc2NyaXB0Q29tcG9uZW50LmpzJztcbmltcG9ydCB7IGNyZWF0ZVNlc3Npb25MaXN0LCB0eXBlIFNlc3Npb25Sb3dEYXRhLCB0eXBlIFNlc3Npb25Hcm91cERhdGEgfSBmcm9tICcuL2NvbXBvbmVudHMvc2Vzc2lvbkxpc3RDb21wb25lbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlRmVlZGJhY2tEaWFsb2csIHR5cGUgRmVlZGJhY2tEaWFsb2dTdGF0ZSB9IGZyb20gJy4vY29tcG9uZW50cy9mZWVkYmFja0RpYWxvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVPbmJvYXJkaW5nIH0gZnJvbSAnLi9jb21wb25lbnRzL29uYm9hcmRpbmdDb21wb25lbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlVm9pY2VCYXIgfSBmcm9tICcuL2NvbXBvbmVudHMvdm9pY2VCYXJDb21wb25lbnQuanMnO1xuaW1wb3J0IHsgRk9OVF9TSVpFLCBhZGRLZXlib2FyZEFjdGl2YXRpb24sIGlzU2Vjb25kYXJ5UG9pbnRlckdlc3R1cmUgfSBmcm9tICcuL2NvbXBvbmVudHMvdG9rZW5zLmpzJztcbmltcG9ydCB0eXBlIHsgVm9pY2VTdGF0ZSwgSVBlbmRpbmdUb29sQ29uZmlybWF0aW9uLCBJVHJhbnNjcmlwdFR1cm4gfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvdm9pY2VDbGllbnQvdm9pY2VTZXNzaW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBjb21wdXRlVm9pY2VNaWNHbG93Qm94U2hhZG93LCBJVm9pY2VHbG93Q29sb3JzLCB2b2ljZUdsb3dTdGF0ZUNvbG9yIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3ZvaWNlQ2xpZW50L3ZvaWNlR2xvdy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVWb2ljZUdsb3dDb250cm9sbGVyLCBHbG93VGhlbWVLaW5kLCBJVm9pY2VHbG93Q29udHJvbGxlciB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC92b2ljZUdsb3dDb250cm9sbGVyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBWb2ljZVdpZGdldENhbGxiYWNrcyB7XG5cdHJlYWRvbmx5IGNvcGlsb3RJY29uU3JjOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhpZGVEaXNjb25uZWN0OiBib29sZWFuO1xuXHRjb25uZWN0KCk6IHZvaWQ7XG5cdGRpc2Nvbm5lY3QoKTogdm9pZDtcblx0cHR0RG93bigpOiB2b2lkO1xuXHRwdHRVcCgpOiB2b2lkO1xuXHRjbG9zZVdpbmRvdygpOiB2b2lkO1xuXHRzdG9wUGxheWJhY2soKTogdm9pZDtcblx0b3BlblNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IHZvaWQ7XG5cdHN0b3BTZXNzaW9uKHJlc291cmNlOiBVUkkpOiB2b2lkO1xuXHRjYW5jZWxTZXNzaW9uKHJlc291cmNlOiBVUkkpOiB2b2lkO1xuXHQvKiogU2VsZWN0IGEgc2Vzc2lvbiBhcyB0aGUgdHJhbnNjcmlwdGlvbiB0YXJnZXQuICovXG5cdHNlbGVjdFRhcmdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdC8qKiBDcmVhdGUgYSBuZXcgc2Vzc2lvbiBhbmQgc2V0IGl0IGFzIHRyYW5zY3JpcHRpb24gdGFyZ2V0LiAqL1xuXHRuZXdTZXNzaW9uQXNUYXJnZXQoKTogdm9pZDtcblx0Z2V0QW5hbHlzZXJOb2RlKCk6IEFuYWx5c2VyTm9kZSB8IG51bGw7XG5cdG9uUmVzaXplKCk6IHZvaWQ7XG5cdG9wZW5QdHRLZXlTZXR0aW5ncygpOiB2b2lkO1xuXHQvKipcblx0ICogU2hvdyB0aGUgVm9pY2UgTW9kZSBjb250ZXh0IG1lbnUgKENvbmZpZ3VyZSwgU2VsZWN0IE1pY3JvcGhvbmUsIERpc2FibGVcblx0ICogVm9pY2UgTW9kZSkgYW5jaG9yZWQgYXQgdGhlIHRyaWdnZXJpbmcgZXZlbnQuIFdpcmVkIHRvIGEgcmlnaHQtY2xpY2sgL1xuXHQgKiBjb250ZXh0LW1lbnUgZ2VzdHVyZSBvbiB0aGUgdm9pY2UgbW9kZSBtaWMgaWNvbi5cblx0ICovXG5cdHNob3dWb2ljZUNvbnRleHRNZW51KGU6IE1vdXNlRXZlbnQpOiB2b2lkO1xuXHQvKiogT3B0aW9uYWwgXHUyMDE0IHdoZW4gcHJvdmlkZWQsIGhlYWRlciByZW5kZXJzIGEgXCJwb3BvdXRcIiBidXR0b24uICovXG5cdG9wZW5Qb3BvdXQ/KCk6IHZvaWQ7XG5cdC8qKiBTdWJtaXQgdXNlciBmZWVkYmFjay4gUmV0dXJucyBzdWNjZXNzL2ZhaWx1cmUuICovXG5cdHN1Ym1pdEZlZWRiYWNrKGZlZWRiYWNrVGV4dDogc3RyaW5nKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyBlcnJvcj86IHN0cmluZyB9Pjtcblx0LyoqIENhbGxlZCB3aGVuIHRoZSB1c2VyIGRpc21pc3NlcyB0aGUgb25ib2FyZGluZyBjYXJkLiAqL1xuXHRvbk9uYm9hcmRpbmdDb21wbGV0ZWQ/KCk6IHZvaWQ7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBcdTIwMTQgd2hlbiBwcm92aWRlZCwgdGhlIGV4cGFuZCBjaGV2cm9uIG9wZW5zIHRoaXMgcGlja2VyIGluc3RlYWQgb2Zcblx0ICogdGhlIGlubGluZSBzZXNzaW9uIGxpc3QuIFVzZWQgYnkgdGhlIGZsb2F0aW5nIHdpbmRvdyB0byBzaG93IHRoZSBhZ2VudFxuXHQgKiBzZXNzaW9ucyBxdWlja3BpY2sgd2l0aCBhIFwic2V0IGFzIHZvaWNlIHRhcmdldFwiIGFjdGlvbi5cblx0ICovXG5cdHNob3dTZXNzaW9uc1BpY2tlcj8oKTogdm9pZDtcblx0LyoqIEFjdGl2ZSB0aGVtZSBraW5kLCBmb3IgdGhlIGFtYmllbnQgdm9pY2UgZ2xvdy4gKi9cblx0Z2V0R2xvd1RoZW1lKCk6IEdsb3dUaGVtZUtpbmQ7XG5cdC8qKiBUaGVtZS1kZXJpdmVkIHBlci1zdGF0ZSBhY2NlbnRzIGZvciB0aGUgYW1iaWVudCB2b2ljZSBnbG93LiAqL1xuXHRnZXRHbG93Q29sb3JzKCk6IElWb2ljZUdsb3dDb2xvcnM7XG5cdC8qKiBXaGV0aGVyIHRoZSB1c2VyIGhhcyBhc2tlZCBmb3IgcmVkdWNlZCBtb3Rpb24uICovXG5cdGlzTW90aW9uUmVkdWNlZCgpOiBib29sZWFuO1xuXHQvKiogRmlyZXMgd2hlbiB0aGUgY29sb3IgdGhlbWUgY2hhbmdlcywgc28gdGhlIGdsb3cgY2FuIHJlLWRlcml2ZSBpdHMgYWNjZW50cy4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHbG93VGhlbWU6IEV2ZW50PHZvaWQ+O1xufVxuXG4vKipcbiAqIEhvc3QtY29uZmlndXJhdGlvbiBmb3IgdGhlIHdpZGdldC4gRGVmYXVsdHMgbWF0Y2ggdGhlIGZsb2F0aW5nIGF1eC13aW5kb3dcbiAqICh0aGUgb3JpZ2luYWwgY29uc3VtZXIpOyB0aGUgY2hhdFZpZXdQYW5lIHZvaWNlIGJhciBvdmVycmlkZXMgZXZlcnl0aGluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBWb2ljZVdpZGdldE9wdGlvbnMge1xuXHQvKiogRml4ZWQgcGl4ZWwgd2lkdGggKGxlZ2FjeSBhdXgtd2luZG93IGJlaGF2aW9yKSBvciBgJ2F1dG8nYCB0byBmbG93LiAqL1xuXHRyZWFkb25seSB3aWR0aD86IG51bWJlciB8ICdhdXRvJztcblx0LyoqIFdoZXRoZXIgdGhlIGhlYWRlciBpcyBhIGRyYWcgaGFuZGxlIChhdXggd2luZG93IG9ubHkpLiAqL1xuXHRyZWFkb25seSBkcmFnZ2FibGU/OiBib29sZWFuO1xuXHQvKiogU2hvdyB0aGUgY2xvc2UgWCBpbiB0aGUgaGVhZGVyLiAqL1xuXHRyZWFkb25seSBzaG93Q2xvc2U/OiBib29sZWFuO1xuXHQvKiogU2hvdyB0aGUgZXhwYW5kL2NvbGxhcHNlIGNoZXZyb24gKyBzZXNzaW9uIGxpc3QuICovXG5cdHJlYWRvbmx5IHNob3dFeHBhbmRDaGV2cm9uPzogYm9vbGVhbjtcblx0LyoqIFNob3cgdGhlIGNlbnRlcmVkIFwiVGFwIHRvIHN0YXJ0IC8gTGlzdGVuaW5nIC8gU3BlYWtpbmdcIiBzdGF0dXMgbGFiZWwuICovXG5cdHJlYWRvbmx5IHNob3dTdGF0dXNUZXh0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgdGhlIHdvcmtpbmcvbmVlZHMtaW5wdXQvZG9uZSBjb3VudGVyIHJvd3MgYW5kIHRoZSBcIk5vIGFjdGl2ZSBzZXNzaW9uc1wiXG5cdCAqIHBsYWNlaG9sZGVyLiBUaGUgc3BlYWtpbmctc2Vzc2lvbiBwaWxsIGFuZCB0b29sIGNvbmZpcm1hdGlvbnMgcmVtYWluXG5cdCAqIHZpc2libGUgcmVnYXJkbGVzcywgc2luY2UgdGhleSBhcmUgaW1wb3J0YW50IGludGVyYWN0aXZlIGNvbnRleHQuXG5cdCAqL1xuXHRyZWFkb25seSBzaG93U3RhdHVzQ291bnRlcnM/OiBib29sZWFuO1xuXHQvKiogU2hvdyB0aGUgY29waWxvdCBpY29uIGF0IHRoZSBzdGFydCBvZiB0aGUgaGVhZGVyLiAqL1xuXHRyZWFkb25seSBzaG93Q29waWxvdEljb24/OiBib29sZWFuO1xuXHQvKiogQ2VudGVyIHRoZSBDb25uZWN0IGJ1dHRvbiBob3Jpem9udGFsbHkgaW5zdGVhZCBvZiBwdXNoaW5nIGl0IHRvIHRoZSByaWdodC4gKi9cblx0cmVhZG9ubHkgY2VudGVyQ29ubmVjdEJ1dHRvbj86IGJvb2xlYW47XG5cdC8qKiBPcHRpb25hbCB0aXRsZSByZW5kZXJlZCBhYm92ZSB0aGUgaGVhZGVyIHJvdyAoZS5nLiBcIlZPSUNFIENIQVRcIikuICovXG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHQvKiogT3B0aW9uYWwgc3VidGl0bGUgcmVuZGVyZWQgbmV4dCB0byB0aGUgdGl0bGUuICovXG5cdHJlYWRvbmx5IHN1YnRpdGxlPzogc3RyaW5nO1xuXHQvKiogU2V0IHRhYkluZGV4PTAgb24gdGhlIHdpZGdldCByb290IGFuZCB3aXJlIFNwYWNlLWtleSBQVFQuICovXG5cdHJlYWRvbmx5IGZvY3VzYWJsZT86IGJvb2xlYW47XG5cdC8qKiBXaGV0aGVyIHRvIHNob3cgdGhlIG9uYm9hcmRpbmcgY2FyZCAoZmlyc3QtdGltZSBleHBlcmllbmNlKS4gKi9cblx0cmVhZG9ubHkgc2hvd09uYm9hcmRpbmc/OiBib29sZWFuO1xuXHQvKipcblx0ICogV2hlbiB0cnVlLCB0aGUgb25ib2FyZGluZyBjYXJkIHJlLWFwcGVhcnMgZXZlcnkgdGltZSB0aGUgd2lkZ2V0IGVudGVyc1xuXHQgKiBhIGZ1bGx5LWRpc2Nvbm5lY3RlZCBzdGF0ZSAoaS5lLiBub3QgY29ubmVjdGVkLCBub3QgY29ubmVjdGluZywgYW5kIG5vdFxuXHQgKiBhdXRvLXJlY29ubmVjdGluZykuIFdoZW4gZmFsc2UgKGRlZmF1bHQpLCBvbmJvYXJkaW5nIGZvbGxvd3MgdGhlIGxlZ2FjeVxuXHQgKiBmaXJzdC10aW1lLW9ubHkgYmVoYXZpb3IgZ2F0ZWQgYnkgYGBzaG93T25ib2FyZGluZ2BgICsgbWFudWFsIGRpc21pc3MuXG5cdCAqL1xuXHRyZWFkb25seSByZXNob3dPbmJvYXJkaW5nT25EaXNjb25uZWN0PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEluaXRpYWwgZXhwYW5kZWQgc3RhdGUgb2YgdGhlIHdpZGdldCBcdTIwMTQgd2hlbiB0cnVlIHRoZSBzZXNzaW9uIGxpc3QgYW5kXG5cdCAqIGV4cGFuZGVkIHNlc3Npb24gZGV0YWlscyBhcmUgc2hvd24gYnkgZGVmYXVsdC4gRGVmYXVsdHMgdG8gZmFsc2Vcblx0ICogKGNvbGxhcHNlZCkgdG8gbWF0Y2ggdGhlIGxlZ2FjeSBmbG9hdGluZyBhdXgtd2luZG93IGJlaGF2aW9yLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVmYXVsdEV4cGFuZGVkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgcmVuZGVycyB0aGUgd2lkZ2V0IGluIGEgY2hhdC1pbnB1dC1ib3ggc3R5bGUgbGF5b3V0OlxuXHQgKiBhIHJvdW5kZWQgYm9yZGVyZWQgY29udGFpbmVyIGZvciB0cmFuc2NyaXB0L3BsYWNlaG9sZGVyIHRleHQgd2l0aCBhXG5cdCAqIHRvb2xiYXIgcm93IGJlbG93IGZvciBhY3Rpb24gaWNvbnMuIE1hdGNoZXMgdGhlIGNoYXQgcGFuZWwgaW5wdXQgYm94XG5cdCAqIGFwcGVhcmFuY2UuXG5cdCAqL1xuXHRyZWFkb25seSBpbnB1dEJveExheW91dD86IGJvb2xlYW47XG59XG5cbmNvbnN0IERFRkFVTFRfT1BUSU9OUzogUmVxdWlyZWQ8Vm9pY2VXaWRnZXRPcHRpb25zPiA9IHtcblx0d2lkdGg6IEFHRU5UU19WT0lDRV9XSU5ET1dfREVGQVVMVF9XSURUSCxcblx0ZHJhZ2dhYmxlOiB0cnVlLFxuXHRzaG93Q2xvc2U6IHRydWUsXG5cdHNob3dFeHBhbmRDaGV2cm9uOiB0cnVlLFxuXHRzaG93U3RhdHVzVGV4dDogZmFsc2UsXG5cdHNob3dTdGF0dXNDb3VudGVyczogdHJ1ZSxcblx0c2hvd0NvcGlsb3RJY29uOiBmYWxzZSxcblx0Y2VudGVyQ29ubmVjdEJ1dHRvbjogZmFsc2UsXG5cdHRpdGxlOiAnJyxcblx0c3VidGl0bGU6ICcnLFxuXHRmb2N1c2FibGU6IGZhbHNlLFxuXHRzaG93T25ib2FyZGluZzogZmFsc2UsXG5cdHJlc2hvd09uYm9hcmRpbmdPbkRpc2Nvbm5lY3Q6IGZhbHNlLFxuXHRkZWZhdWx0RXhwYW5kZWQ6IGZhbHNlLFxuXHRpbnB1dEJveExheW91dDogZmFsc2UsXG59O1xuXG5leHBvcnQgY2xhc3MgQWdlbnRzVm9pY2VXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvLyAtLS0gUmVhY3RpdmUgc3RhdGUgLS0tXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzQ29ubmVjdGVkOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNDb25uZWN0aW5nOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNSZWNvbm5lY3Rpbmc6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92b2ljZVN0YXRlOiBJU2V0dGFibGVPYnNlcnZhYmxlPFZvaWNlU3RhdGU+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsICdpZGxlJyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2V4cGFuZGVkOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0NvdW50OiBJU2V0dGFibGVPYnNlcnZhYmxlPG51bWJlcj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25lZWRzSW5wdXRDb3VudDogSVNldHRhYmxlT2JzZXJ2YWJsZTxudW1iZXI+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb25lQ291bnQ6IElTZXR0YWJsZU9ic2VydmFibGU8bnVtYmVyPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAwKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Rvb2xDb25maXJtYXRpb25zOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElQZW5kaW5nVG9vbENvbmZpcm1hdGlvbltdPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NwZWFraW5nU2Vzc2lvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NwZWFraW5nU2Vzc2lvbkxhYmVsOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgU2Vzc2lvblJvd0RhdGFbXT4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgW10pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uR3JvdXBzOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IFNlc3Npb25Hcm91cERhdGFbXSB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VsZWN0ZWRUYXJnZXRTZXNzaW9uOiBJU2V0dGFibGVPYnNlcnZhYmxlPFVSSSB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNjcmlwdFR1cm5zOiBJU2V0dGFibGVPYnNlcnZhYmxlPHJlYWRvbmx5IElUcmFuc2NyaXB0VHVybltdPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBbXSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B0dEtleUxhYmVsOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdW5kZWZpbmVkKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzVGV4dDogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmc+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsICcnKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcG9wb3V0QXZhaWxhYmxlOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRydWUpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9mZWVkYmFja0RpYWxvZ1N0YXRlOiBJU2V0dGFibGVPYnNlcnZhYmxlPEZlZWRiYWNrRGlhbG9nU3RhdGUgfCBudWxsPiA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBudWxsKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2hvd09uYm9hcmRpbmc6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbmJvYXJkaW5nUGVuZGluZ0Nvbm5lY3Q6IElTZXR0YWJsZU9ic2VydmFibGU8Ym9vbGVhbj4gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdC8vIC0tLSBEZXJpdmVkIHN0YXRlIC0tLVxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRTaG93RXhwYW5kZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl9leHBhbmRlZC5yZWFkKHJlYWRlcikpO1xuXG5cdC8vIC0tLSBET00gY29tcG9uZW50cyAtLS1cblx0cHJpdmF0ZSByZWFkb25seSBfaGVhZGVyQ29tcG9uZW50ID0gY3JlYXRlSGVhZGVyKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uYm9hcmRpbmdDb21wb25lbnQgPSBjcmVhdGVPbmJvYXJkaW5nKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50ID0gY3JlYXRlRmVlZGJhY2tEaWFsb2coKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdm9pY2VCYXJDb21wb25lbnQgPSBjcmVhdGVWb2ljZUJhcigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmFuc2NyaXB0Q29tcG9uZW50ID0gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlVHJhbnNjcmlwdCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRCb3hUcmFuc2NyaXB0Q29tcG9uZW50ID0gdGhpcy5fcmVnaXN0ZXIoY3JlYXRlVHJhbnNjcmlwdCgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHVzUm93c0NvbXBvbmVudCA9IGNyZWF0ZVN0YXR1c1Jvd3MoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkxpc3RDb21wb25lbnQgPSBjcmVhdGVTZXNzaW9uTGlzdCgpO1xuXG5cdC8vIC0tLSBTdGFibGUgRE9NIGVsZW1lbnRzIC0tLVxuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290RGl2OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZ2xvd0RpdjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpdGxlUm93OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudERpdjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXR1c1RleHREaXY6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uTGlzdFdyYXBwZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9leHBhbmRTcGFjZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGV2cm9uV3JhcHBlcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZXZyb25JY29uOiBIVE1MRWxlbWVudDtcblxuXHQvLyAtLS0gSW5wdXQgYm94IGxheW91dCBlbGVtZW50cyAoY3JlYXRlZCBvbmx5IHdoZW4gaW5wdXRCb3hMYXlvdXQ9dHJ1ZSkgLS0tXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRCb3hQbGFjZWhvbGRlcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94VG9vbGJhcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94TWljQnRuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRCb3hDb25uSW5kaWNhdG9yOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0LyoqIEFtYmllbnQgdm9pY2UgZ2xvdyBvbiB0aGUgaW5wdXQgYm94IChpbnB1dC1ib3ggbGF5b3V0IG9ubHkpLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nbG93Q29udHJvbGxlcjogSVZvaWNlR2xvd0NvbnRyb2xsZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0Qm94RmVlZGJhY2tCdG46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnB1dEJveFNlc3Npb25zQnRuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRCb3hDbG9zZUJ0bjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogUmVxdWlyZWQ8Vm9pY2VXaWRnZXRPcHRpb25zPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjYWxsYmFja3M6IFZvaWNlV2lkZ2V0Q2FsbGJhY2tzLFxuXHRcdG9wdGlvbnM6IFZvaWNlV2lkZ2V0T3B0aW9ucyA9IHt9LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fb3B0aW9ucyA9IHsgLi4uREVGQVVMVF9PUFRJT05TLCAuLi5vcHRpb25zIH07XG5cdFx0dGhpcy5fc2hvd09uYm9hcmRpbmcuc2V0KHRoaXMuX29wdGlvbnMuc2hvd09uYm9hcmRpbmcsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fZXhwYW5kZWQuc2V0KHRoaXMuX29wdGlvbnMuZGVmYXVsdEV4cGFuZGVkLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQnVpbGQgc3RhYmxlIERPTSBzdHJ1Y3R1cmVcblx0XHRjb25zdCBvcHRzID0gdGhpcy5fb3B0aW9ucztcblx0XHRjb25zdCB3aWR0aFN0eWxlID0gb3B0cy53aWR0aCA9PT0gJ2F1dG8nXG5cdFx0XHQ/ICd3aWR0aDoxMDAlO3Bvc2l0aW9uOnJlbGF0aXZlOydcblx0XHRcdDogYHBvc2l0aW9uOmFic29sdXRlO3RvcDowO2xlZnQ6MDt3aWR0aDoke29wdHMud2lkdGh9cHg7JHtvcHRzLmlucHV0Qm94TGF5b3V0ID8gJycgOiBgbWluLWhlaWdodDoke0FHRU5UU19WT0lDRV9XSU5ET1dfREVGQVVMVF9IRUlHSFR9cHg7YH1gO1xuXG5cdFx0dGhpcy5fcm9vdERpdiA9IGRvbS4kKCdkaXYnKTtcblx0XHR0aGlzLl9yb290RGl2LnN0eWxlLmNzc1RleHQgPSBgJHt3aWR0aFN0eWxlfWRpc3BsYXk6ZmxleDtmbGV4LWRpcmVjdGlvbjpjb2x1bW47dXNlci1zZWxlY3Q6bm9uZTtmb250LWZhbWlseTppbmhlcml0O2ZvbnQtc2l6ZToke0ZPTlRfU0laRS5iYXNlfTtjb2xvcjp2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCk7Ym94LXNpemluZzpib3JkZXItYm94O21hcmdpbjowOyR7b3B0cy5pbnB1dEJveExheW91dCAmJiBvcHRzLmRyYWdnYWJsZSA/ICctd2Via2l0LWFwcC1yZWdpb246ZHJhZzsnIDogJyd9YDtcblxuXHRcdHRoaXMuX2dsb3dEaXYgPSBkb20uJCgnZGl2Jyk7XG5cdFx0dGhpcy5fZ2xvd0Rpdi5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOmFic29sdXRlO3RvcDowO2xlZnQ6MDtyaWdodDowO2hlaWdodDo1MHB4O3BvaW50ZXItZXZlbnRzOm5vbmU7ei1pbmRleDowOyc7XG5cblx0XHR0aGlzLl90aXRsZVJvdyA9IGRvbS4kKCdkaXYnKTtcblx0XHR0aGlzLl90aXRsZVJvdy5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpiYXNlbGluZTtnYXA6NnB4O3BhZGRpbmc6OHB4IDE0cHggMDtvdmVyZmxvdzpoaWRkZW47d2hpdGUtc3BhY2U6bm93cmFwO3Bvc2l0aW9uOnJlbGF0aXZlO3otaW5kZXg6MTsnO1xuXHRcdGlmIChvcHRzLnRpdGxlKSB7XG5cdFx0XHRjb25zdCB0aXRsZVNwYW4gPSBkb20uJCgnc3BhbicpO1xuXHRcdFx0dGl0bGVTcGFuLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLm1pY3JvfTtmb250LXdlaWdodDo3MDA7Y29sb3I6dmFyKC0tdnNjb2RlLXNpZGVCYXJTZWN0aW9uSGVhZGVyLWZvcmVncm91bmQsIHZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKSk7dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2xldHRlci1zcGFjaW5nOjAuNXB4O2ZsZXgtc2hyaW5rOjA7dXNlci1zZWxlY3Q6bm9uZTtgO1xuXHRcdFx0dGl0bGVTcGFuLnRleHRDb250ZW50ID0gb3B0cy50aXRsZTtcblx0XHRcdHRoaXMuX3RpdGxlUm93LmFwcGVuZCh0aXRsZVNwYW4pO1xuXHRcdFx0aWYgKG9wdHMuc3VidGl0bGUpIHtcblx0XHRcdFx0Y29uc3Qgc3VidGl0bGVTcGFuID0gZG9tLiQoJ3NwYW4nKTtcblx0XHRcdFx0c3VidGl0bGVTcGFuLnN0eWxlLmNzc1RleHQgPSBgZm9udC1zaXplOiR7Rk9OVF9TSVpFLm1pY3JvfTtmb250LXdlaWdodDo0MDA7Y29sb3I6dmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCk7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7YDtcblx0XHRcdFx0c3VidGl0bGVTcGFuLnRleHRDb250ZW50ID0gb3B0cy5zdWJ0aXRsZTtcblx0XHRcdFx0dGhpcy5fdGl0bGVSb3cuYXBwZW5kKHN1YnRpdGxlU3Bhbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGVudERpdiA9IGRvbS4kKCdkaXYnKTtcblx0XHR0aGlzLl9jb250ZW50RGl2LnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjtmbGV4OjE7cGFkZGluZzo4cHggMTRweCAycHg7cG9zaXRpb246cmVsYXRpdmU7ei1pbmRleDoxOyc7XG5cblx0XHR0aGlzLl9zdGF0dXNUZXh0RGl2ID0gZG9tLiQoJ2RpdicpO1xuXHRcdHRoaXMuX3N0YXR1c1RleHREaXYuc3R5bGUuY3NzVGV4dCA9IGB0ZXh0LWFsaWduOmNlbnRlcjtmb250LXNpemU6JHtGT05UX1NJWkUuYm9keX07Zm9udC13ZWlnaHQ6NTAwO2NvbG9yOnZhcigtLXZzY29kZS1mb3JlZ3JvdW5kKTtwYWRkaW5nOjJweCAwO2A7XG5cblx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIgPSBkb20uJCgnZGl2Jyk7XG5cdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2ZsZXgtZGlyZWN0aW9uOmNvbHVtbjstd2Via2l0LWFwcC1yZWdpb246bm8tZHJhZztvdmVyZmxvdzpoaWRkZW47Jztcblx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuYXBwZW5kKHRoaXMuX3Nlc3Npb25MaXN0Q29tcG9uZW50LmVsZW1lbnQpO1xuXG5cdFx0dGhpcy5fZXhwYW5kU3BhY2VyID0gZG9tLiQoJ2RpdicpO1xuXHRcdHRoaXMuX2V4cGFuZFNwYWNlci5zdHlsZS5jc3NUZXh0ID0gJ2ZsZXg6MTsnO1xuXG5cdFx0dGhpcy5fY2hldnJvbldyYXBwZXIgPSBkb20uJCgnZGl2Jyk7XG5cdFx0dGhpcy5fY2hldnJvbldyYXBwZXIucm9sZSA9ICdidXR0b24nO1xuXHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9jaGV2cm9uV3JhcHBlci5zdHlsZS5jc3NUZXh0ID0gJ2Rpc3BsYXk6ZmxleDtqdXN0aWZ5LWNvbnRlbnQ6Y2VudGVyO2N1cnNvcjpwb2ludGVyOy13ZWJraXQtYXBwLXJlZ2lvbjpuby1kcmFnOyc7XG5cdFx0dGhpcy5fY2hldnJvbkljb24gPSBkb20uJCgnc3Bhbi5jb2RpY29uJyk7XG5cdFx0dGhpcy5fY2hldnJvbkljb24uc3R5bGUuY3NzVGV4dCA9IGBmb250LXNpemU6JHtGT05UX1NJWkUuaWNvblNtfTtjb2xvcjp2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKTtgO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY2hldnJvbkljb24sICdtb3VzZWVudGVyJywgKCkgPT4geyB0aGlzLl9jaGV2cm9uSWNvbi5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknOyB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jaGV2cm9uSWNvbiwgJ21vdXNlbGVhdmUnLCAoKSA9PiB7IHRoaXMuX2NoZXZyb25JY29uLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1kZXNjcmlwdGlvbkZvcmVncm91bmQpJzsgfSkpO1xuXHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyLmFwcGVuZCh0aGlzLl9jaGV2cm9uSWNvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jaGV2cm9uV3JhcHBlciwgJ2NsaWNrJywgKGUpID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmICh0aGlzLmNhbGxiYWNrcy5zaG93U2Vzc2lvbnNQaWNrZXIpIHtcblx0XHRcdFx0dGhpcy5jYWxsYmFja3Muc2hvd1Nlc3Npb25zUGlja2VyKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9leHBhbmRlZC5zZXQoIXRoaXMuX2V4cGFuZGVkLmdldCgpLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2NoZXZyb25XcmFwcGVyLCAna2V5ZG93bicsIChlKSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykgeyBlLnByZXZlbnREZWZhdWx0KCk7IHRoaXMuX2NoZXZyb25XcmFwcGVyLmNsaWNrKCk7IH1cblx0XHR9KSk7XG5cblx0XHQvLyAtLS0gSW5wdXQgYm94IGxheW91dCBlbGVtZW50cyAtLS1cblx0XHRpZiAob3B0cy5pbnB1dEJveExheW91dCkge1xuXHRcdFx0Ly8gSW5qZWN0IHByb2Nlc3NpbmcgYW5pbWF0aW9uIENTUyBpbnRvIHRoZSBkb2N1bWVudCBoZWFkXG5cdFx0XHQvLyAoQHByb3BlcnR5IG11c3QgYmUgYXQgZG9jdW1lbnQgbGV2ZWwgdG8gd29yaylcblx0XHRcdGNvbnN0IHN0eWxlRWwgPSBkb20uJCgnc3R5bGUnKTtcblx0XHRcdHN0eWxlRWwudGV4dENvbnRlbnQgPSBgXG5cdFx0XHRcdEBwcm9wZXJ0eSAtLXZvaWNlLXByb2Nlc3NpbmctYW5nbGUgeyBzeW50YXg6ICc8YW5nbGU+JzsgaW5oZXJpdHM6IGZhbHNlOyBpbml0aWFsLXZhbHVlOiAxMzVkZWc7IH1cblx0XHRcdFx0QGtleWZyYW1lcyB2b2ljZS1wcm9jZXNzaW5nLXNwaW4geyBmcm9tIHsgLS12b2ljZS1wcm9jZXNzaW5nLWFuZ2xlOiAxMzVkZWc7IH0gdG8geyAtLXZvaWNlLXByb2Nlc3NpbmctYW5nbGU6IDQ5NWRlZzsgfSB9XG5cdFx0XHRcdEBrZXlmcmFtZXMgYWdlbnRzLXZvaWNlLWlucHV0LWljb24tcHVsc2Uge1xuXHRcdFx0XHRcdDAlLCAxMDAlIHsgYm94LXNoYWRvdzogMCAwIDRweCByZ2JhKHZhcigtLWFnZW50cy12b2ljZS1pbnB1dC1pY29uLXJnYiwgODgsMTY2LDI1NSksIDAuNDUpOyB9XG5cdFx0XHRcdFx0NTAlIHsgYm94LXNoYWRvdzogMCAwIDEwcHggcmdiYSh2YXIoLS1hZ2VudHMtdm9pY2UtaW5wdXQtaWNvbi1yZ2IsIDg4LDE2NiwyNTUpLCAwLjc1KTsgfVxuXHRcdFx0XHR9XG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoLm1vbmFjby1lbmFibGUtbW90aW9uIC5hZ2VudHMtdm9pY2UtbW9kZS1idXR0b24uYWdlbnRzLXZvaWNlLW1vZGUtYWN0aXZlIHtcblx0XHRcdFx0XHRhbmltYXRpb246IGFnZW50cy12b2ljZS1pbnB1dC1pY29uLXB1bHNlIDEuNHMgZWFzZS1pbi1vdXQgaW5maW5pdGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0LnByb2Nlc3NpbmcgeyBvdmVyZmxvdzogdmlzaWJsZSAhaW1wb3J0YW50OyB9XG5cdFx0XHRcdC5wcm9jZXNzaW5nOjpiZWZvcmUge1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcnOyBwb3NpdGlvbjogYWJzb2x1dGU7IGluc2V0OiAtMXB4OyBib3JkZXItcmFkaXVzOiBpbmhlcml0OyBwYWRkaW5nOiAxcHg7XG5cdFx0XHRcdFx0YmFja2dyb3VuZDogY29uaWMtZ3JhZGllbnQoZnJvbSB2YXIoLS12b2ljZS1wcm9jZXNzaW5nLWFuZ2xlKSxcblx0XHRcdFx0XHRcdHRyYW5zcGFyZW50IDBkZWcsIHJnYmEoODgsMTY2LDI1NSwwLjkpIDIwZGVnLCByZ2JhKDg4LDE2NiwyNTUsMSkgMzBkZWcsXG5cdFx0XHRcdFx0XHRyZ2JhKDg4LDE2NiwyNTUsMC42KSA1MGRlZywgdHJhbnNwYXJlbnQgOTBkZWcsIHRyYW5zcGFyZW50IDM2MGRlZyk7XG5cdFx0XHRcdFx0LXdlYmtpdC1tYXNrOiBsaW5lYXItZ3JhZGllbnQoIzAwMCAwIDApIGNvbnRlbnQtYm94LCBsaW5lYXItZ3JhZGllbnQoIzAwMCAwIDApO1xuXHRcdFx0XHRcdG1hc2s6IGxpbmVhci1ncmFkaWVudCgjMDAwIDAgMCkgY29udGVudC1ib3gsIGxpbmVhci1ncmFkaWVudCgjMDAwIDAgMCk7XG5cdFx0XHRcdFx0LXdlYmtpdC1tYXNrLWNvbXBvc2l0ZTogeG9yOyBtYXNrLWNvbXBvc2l0ZTogZXhjbHVkZTtcblx0XHRcdFx0XHRhbmltYXRpb246IHZvaWNlLXByb2Nlc3Npbmctc3BpbiAzcyBsaW5lYXIgaW5maW5pdGU7XG5cdFx0XHRcdFx0cG9pbnRlci1ldmVudHM6IG5vbmU7IHotaW5kZXg6IDI7XG5cdFx0XHRcdH1cblx0XHRcdFx0LnByb2Nlc3Npbmc6OmFmdGVyIHtcblx0XHRcdFx0XHRjb250ZW50OiAnJzsgcG9zaXRpb246IGFic29sdXRlOyBpbnNldDogLTFweDsgYm9yZGVyLXJhZGl1czogaW5oZXJpdDsgcGFkZGluZzogMnB4O1xuXHRcdFx0XHRcdGJhY2tncm91bmQ6IGNvbmljLWdyYWRpZW50KGZyb20gdmFyKC0tdm9pY2UtcHJvY2Vzc2luZy1hbmdsZSksXG5cdFx0XHRcdFx0XHR0cmFuc3BhcmVudCAwZGVnLCByZ2JhKDg4LDE2NiwyNTUsMC41KSAyNWRlZywgcmdiYSg4OCwxNjYsMjU1LDAuMykgNTBkZWcsIHRyYW5zcGFyZW50IDkwZGVnLCB0cmFuc3BhcmVudCAzNjBkZWcpO1xuXHRcdFx0XHRcdC13ZWJraXQtbWFzazogbGluZWFyLWdyYWRpZW50KCMwMDAgMCAwKSBjb250ZW50LWJveCwgbGluZWFyLWdyYWRpZW50KCMwMDAgMCAwKTtcblx0XHRcdFx0XHRtYXNrOiBsaW5lYXItZ3JhZGllbnQoIzAwMCAwIDApIGNvbnRlbnQtYm94LCBsaW5lYXItZ3JhZGllbnQoIzAwMCAwIDApO1xuXHRcdFx0XHRcdC13ZWJraXQtbWFzay1jb21wb3NpdGU6IHhvcjsgbWFzay1jb21wb3NpdGU6IGV4Y2x1ZGU7XG5cdFx0XHRcdFx0ZmlsdGVyOiBibHVyKDEuNXB4KTsgYW5pbWF0aW9uOiB2b2ljZS1wcm9jZXNzaW5nLXNwaW4gM3MgbGluZWFyIGluZmluaXRlO1xuXHRcdFx0XHRcdHBvaW50ZXItZXZlbnRzOiBub25lOyB6LWluZGV4OiAxO1xuXHRcdFx0XHR9XG5cdFx0XHRgO1xuXHRcdFx0Z2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5kb2N1bWVudC5oZWFkLmFwcGVuZChzdHlsZUVsKTtcblxuXHRcdFx0Ly8gUm91bmRlZCBib3JkZXJlZCBjb250YWluZXIgZm9yIHRyYW5zY3JpcHQvcGxhY2Vob2xkZXIgKG1hdGNoZXMgY2hhdC1pbnB1dC1jb250YWluZXIpXG5cdFx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lciA9IGRvbS4kKCdkaXYnKTtcblx0XHRcdHRoaXMuX2lucHV0Qm94Q29udGFpbmVyLnN0eWxlLmNzc1RleHQgPSAnYm94LXNpemluZzpib3JkZXItYm94O2JhY2tncm91bmQtY29sb3I6dmFyKC0tdnNjb2RlLWlucHV0LWJhY2tncm91bmQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tdnNjb2RlLWlucHV0LWJvcmRlciwgdHJhbnNwYXJlbnQpO2JvcmRlci1yYWRpdXM6dmFyKC0tdnNjb2RlLWNvcm5lclJhZGl1cy1sYXJnZSwgOHB4KTtwYWRkaW5nOjEwcHggMTJweDt3aWR0aDoxMDAlO3Bvc2l0aW9uOnJlbGF0aXZlO21pbi1oZWlnaHQ6MzJweDtkaXNwbGF5OmZsZXg7YWxpZ24taXRlbXM6Y2VudGVyOy13ZWJraXQtYXBwLXJlZ2lvbjpuby1kcmFnOyc7XG5cblx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIgPSBkb20uJCgnc3BhbicpO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlci5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5ib2R5fTtjb2xvcjp2YXIoLS12c2NvZGUtaW5wdXQtcGxhY2Vob2xkZXJGb3JlZ3JvdW5kLCB2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSk7dXNlci1zZWxlY3Q6bm9uZTt3aGl0ZS1zcGFjZTpub3dyYXA7b3ZlcmZsb3c6aGlkZGVuO3RleHQtb3ZlcmZsb3c6ZWxsaXBzaXM7ZmxleDoxO2A7XG5cdFx0XHR0aGlzLl9pbnB1dEJveFRyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHRcdHRoaXMuX2lucHV0Qm94VHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lci5hcHBlbmQodGhpcy5faW5wdXRCb3hQbGFjZWhvbGRlciwgdGhpcy5faW5wdXRCb3hUcmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQpO1xuXG5cdFx0XHR0aGlzLl9nbG93Q29udHJvbGxlciA9IHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZVZvaWNlR2xvd0NvbnRyb2xsZXIoXG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94Q29udGFpbmVyLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmNhbGxiYWNrcy5nZXRHbG93VGhlbWUoKSxcblx0XHRcdFx0KCkgPT4gdGhpcy5jYWxsYmFja3MuZ2V0R2xvd0NvbG9ycygpLFxuXHRcdFx0KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNhbGxiYWNrcy5vbkRpZENoYW5nZUdsb3dUaGVtZSgoKSA9PiB0aGlzLl9nbG93Q29udHJvbGxlcj8ucmVmcmVzaFRoZW1lKCkpKTtcblxuXHRcdFx0Ly8gVG9vbGJhciByb3cgYmVsb3cgdGhlIGlucHV0IGJveFxuXHRcdFx0dGhpcy5faW5wdXRCb3hUb29sYmFyID0gZG9tLiQoJ2RpdicpO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hUb29sYmFyLnN0eWxlLmNzc1RleHQgPSAnZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4O3BhZGRpbmc6NnB4IDRweCAycHg7LXdlYmtpdC1hcHAtcmVnaW9uOm5vLWRyYWc7JztcblxuXHRcdFx0Y29uc3QgdG9vbGJhckJ0biA9IChjbGFzc05hbWU6IHN0cmluZywgYXJpYUxhYmVsOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBIVE1MRWxlbWVudCA9PiB7XG5cdFx0XHRcdGNvbnN0IGVsID0gZG9tLiQoYHNwYW4uY29kaWNvbi4ke2NsYXNzTmFtZX1gKTtcblx0XHRcdFx0ZWwucm9sZSA9ICdidXR0b24nO1xuXHRcdFx0XHRlbC50YWJJbmRleCA9IDA7XG5cdFx0XHRcdGVsLmFyaWFMYWJlbCA9IGFyaWFMYWJlbDtcblx0XHRcdFx0ZWwudGl0bGUgPSB0aXRsZTtcblx0XHRcdFx0ZWwuc3R5bGUuY3NzVGV4dCA9IGBmb250LXNpemU6JHtGT05UX1NJWkUuaWNvblNtfTtjb2xvcjp2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKTtjdXJzb3I6cG9pbnRlcjstd2Via2l0LWFwcC1yZWdpb246bm8tZHJhZztwYWRkaW5nOjJweDtgO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsLCAnbW91c2VlbnRlcicsICgpID0+IHsgZWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWZvcmVncm91bmQpJzsgfSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsLCAnbW91c2VsZWF2ZScsICgpID0+IHsgZWwuc3R5bGUuY29sb3IgPSAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknOyB9KSk7XG5cdFx0XHRcdGFkZEtleWJvYXJkQWN0aXZhdGlvbihlbCk7XG5cdFx0XHRcdHJldHVybiBlbDtcblx0XHRcdH07XG5cblx0XHRcdC8vIE1pYyBidXR0b25cblx0XHRcdHRoaXMuX2lucHV0Qm94TWljQnRuID0gZG9tLiQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLXZvaWNlLW1vZGUuYWdlbnRzLXZvaWNlLW1vZGUtYnV0dG9uJyk7XG5cdFx0XHR0aGlzLl9pbnB1dEJveE1pY0J0bi5yb2xlID0gJ2J1dHRvbic7XG5cdFx0XHR0aGlzLl9pbnB1dEJveE1pY0J0bi50YWJJbmRleCA9IDA7XG5cdFx0XHR0aGlzLl9pbnB1dEJveE1pY0J0bi5hcmlhTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UucHVzaFRvVGFsa1NwYWNlJywgXCJQdXNoIHRvIHRhbGsgKFNwYWNlKVwiKTtcblx0XHRcdHRoaXMuX2lucHV0Qm94TWljQnRuLnRpdGxlID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnB1c2hUb1RhbGtTcGFjZScsIFwiUHVzaCB0byB0YWxrIChTcGFjZSlcIik7XG5cdFx0XHR0aGlzLl9pbnB1dEJveE1pY0J0bi5zdHlsZS5jc3NUZXh0ID0gYGZvbnQtc2l6ZToke0ZPTlRfU0laRS5pY29uTWR9O2N1cnNvcjpwb2ludGVyOy13ZWJraXQtYXBwLXJlZ2lvbjpuby1kcmFnO2JvcmRlci1yYWRpdXM6NHB4O3BhZGRpbmc6MnB4O2A7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2lucHV0Qm94TWljQnRuLCAnY29udGV4dG1lbnUnLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuY2FsbGJhY2tzLnNob3dWb2ljZUNvbnRleHRNZW51KGUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHQvLyBDb25uZWN0aW9uIGluZGljYXRvclxuXHRcdFx0dGhpcy5faW5wdXRCb3hDb25uSW5kaWNhdG9yID0gdG9vbGJhckJ0bignY29kaWNvbi1kZWJ1Zy1jb25uZWN0ZWQnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuZGlzY29ubmVjdCcsIFwiRGlzY29ubmVjdFwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLmRpc2Nvbm5lY3QnLCBcIkRpc2Nvbm5lY3RcIikpO1xuXG5cdFx0XHQvLyBGZWVkYmFjayBidXR0b25cblx0XHRcdHRoaXMuX2lucHV0Qm94RmVlZGJhY2tCdG4gPSB0b29sYmFyQnRuKCdjb2RpY29uLWZlZWRiYWNrJyxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLnNlbmRGZWVkYmFjaycsIFwiU2VuZCBmZWVkYmFja1wiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLnNlbmRGZWVkYmFjaycsIFwiU2VuZCBmZWVkYmFja1wiKSk7XG5cblx0XHRcdC8vIFNlc3Npb25zIGRyb3Bkb3duIGJ1dHRvblxuXHRcdFx0dGhpcy5faW5wdXRCb3hTZXNzaW9uc0J0biA9IHRvb2xiYXJCdG4oJ2NvZGljb24tbGlzdC10cmVlJyxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLnNlc3Npb25zJywgXCJTZXNzaW9uc1wiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2FnZW50c1ZvaWNlLnNlc3Npb25zJywgXCJTZXNzaW9uc1wiKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2lucHV0Qm94U2Vzc2lvbnNCdG4sICdjbGljaycsIChlKSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fZXhwYW5kZWQuc2V0KCF0aGlzLl9leHBhbmRlZC5nZXQoKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gQ2xvc2UgYnV0dG9uXG5cdFx0XHR0aGlzLl9pbnB1dEJveENsb3NlQnRuID0gdG9vbGJhckJ0bignY29kaWNvbi1jaHJvbWUtbWluaW1pemUnLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRzVm9pY2UubWluaW1pemUnLCBcIk1pbmltaXplXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRzVm9pY2UubWluaW1pemUnLCBcIk1pbmltaXplXCIpKTtcblxuXHRcdFx0Y29uc3QgdG9vbGJhclNwYWNlciA9IGRvbS4kKCdzcGFuJyk7XG5cdFx0XHR0b29sYmFyU3BhY2VyLnN0eWxlLmZsZXggPSAnMSc7XG5cblx0XHRcdHRoaXMuX2lucHV0Qm94VG9vbGJhci5hcHBlbmQoXG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94TWljQnRuLFxuXHRcdFx0XHR0aGlzLl9pbnB1dEJveENvbm5JbmRpY2F0b3IsXG5cdFx0XHRcdHRvb2xiYXJTcGFjZXIsXG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94RmVlZGJhY2tCdG4sXG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94U2Vzc2lvbnNCdG4sXG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94Q2xvc2VCdG5cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gQXNzZW1ibGU6IGFsbCBjaGlsZHJlbiBhcmUgaW4gdGhlIERPTTsgdmlzaWJpbGl0eSBpcyB0b2dnbGVkIHZpYSBkaXNwbGF5XG5cdFx0aWYgKG9wdHMuaW5wdXRCb3hMYXlvdXQpIHtcblx0XHRcdHRoaXMuX2NvbnRlbnREaXYuYXBwZW5kKFxuXHRcdFx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LmVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50LmVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94VG9vbGJhciEsXG5cdFx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudCxcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLFxuXHRcdFx0XHR0aGlzLl9zdGF0dXNSb3dzQ29tcG9uZW50LmVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94Q29udGFpbmVyISxcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbnRlbnREaXYuYXBwZW5kKFxuXHRcdFx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LmVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX2hlYWRlckNvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl92b2ljZUJhckNvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC5lbGVtZW50LFxuXHRcdFx0XHR0aGlzLl9zdGF0dXNUZXh0RGl2LFxuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQsXG5cdFx0XHRcdHRoaXMuX3N0YXR1c1Jvd3NDb21wb25lbnQuZWxlbWVudCxcblx0XHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLFxuXHRcdFx0XHR0aGlzLl9leHBhbmRTcGFjZXIsXG5cdFx0XHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jvb3REaXYuYXBwZW5kKHRoaXMuX2dsb3dEaXYsIHRoaXMuX3RpdGxlUm93LCB0aGlzLl9jb250ZW50RGl2KTtcblx0XHR0aGlzLmNvbnRhaW5lci5hcHBlbmQodGhpcy5fcm9vdERpdik7XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5mb2N1c2FibGUpIHtcblx0XHRcdHRoaXMuY29udGFpbmVyLnRhYkluZGV4ID0gMDtcblx0XHRcdGNvbnN0IHdpbiA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0XHQvLyBUcmFjayB3aGljaCBrZXkgdHJpZ2dlcmVkIFBUVCBzbyBrZXl1cCByZWxlYXNlcyBjb3JyZWN0bHlcblx0XHRcdC8vIGV2ZW4gd2hlbiB0aGUgdXNlciByZWJpbmRzIHB1c2hUb1RhbGsgdG8gYSBkaWZmZXJlbnQga2V5LlxuXHRcdFx0Ly8gV2UgY2FwdHVyZSB0aGUgbGFzdCBrZXlkb3duIGNvZGUgYXQgdGhlIGRvY3VtZW50IGxldmVsIChjYXB0dXJlXG5cdFx0XHQvLyBwaGFzZSkgYW5kIHNuYXBzaG90IGl0IG9uY2UgcmVjb3JkaW5nIGJlZ2lucyAoc2VlIHRoZSBhdXRvcnVuXG5cdFx0XHQvLyBvbiB0aGUgYGxpc3RlbmluZ2Agc3RhdGUgYmVsb3cpLlxuXHRcdFx0bGV0IHB0dEtleUNvZGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBoZWxkS2V5Q29kZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Ly8gVHJ1ZSB3aGVuIGEga2V5IHdhcyBwcmVzc2VkIGFuZCByZWxlYXNlZCBhZ2FpbiBCRUZPUkUgcmVjb3JkaW5nXG5cdFx0XHQvLyBhY3R1YWxseSBiZWdhbiAoZS5nLiB0aGUgdXNlciB0YXBwZWQgdGhlIFBUVCBrZXkgZHVyaW5nIHRoZSBhc3luY1xuXHRcdFx0Ly8gY29ubmVjdCgpIHRoYXQgcHJlY2VkZXMgdGhlIGZpcnN0IHB0dERvd24oKSkuIFdpdGhvdXQgdGhpcyB0aGVcblx0XHRcdC8vIHJlbGVhc2UgaXMgbG9zdCAtIGxpc3RlbmluZyBzdGFydHMgd2l0aCBubyBrZXkgdG8gd2F0Y2ggZm9yIGFuZFxuXHRcdFx0Ly8gbmV2ZXIgc3RvcHMuIFJlc2V0IHdoZW5ldmVyIHdlIHJldHVybiB0byBhIG5vbi1saXN0ZW5pbmcgc3RhdGUuXG5cdFx0XHRsZXQgcmVsZWFzZWRCZWZvcmVMaXN0ZW5pbmcgPSBmYWxzZTtcblx0XHRcdGNvbnN0IG9uRG9jS2V5ZG93biA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7IGhlbGRLZXlDb2RlID0gZS5jb2RlOyByZWxlYXNlZEJlZm9yZUxpc3RlbmluZyA9IGZhbHNlOyB9O1xuXHRcdFx0Ly8gQ2xlYXIgdGhlIHRyYWNrZWQga2V5IG9uY2UgaXQgaXMgcmVsZWFzZWQgc28gYSBzdGFsZSBjb2RlIGlzXG5cdFx0XHQvLyBuZXZlciBtaXN0YWtlbiBmb3IgYSBoZWxkIFBUVCBrZXkgKGUuZy4gbW91c2UtaW5pdGlhdGVkIFBUVCkuIElmXG5cdFx0XHQvLyByZWNvcmRpbmcgaGFzbid0IGJlZ3VuIHlldCwgcmVtZW1iZXIgdGhhdCB0aGUga2V5IHdhcyByZWxlYXNlZCBzb1xuXHRcdFx0Ly8gdGhlIGxpc3RlbmluZyB0cmFuc2l0aW9uIGJlbG93IGNhbiBzdG9wIGltbWVkaWF0ZWx5LlxuXHRcdFx0Y29uc3Qgb25Eb2NLZXl1cCA9IChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChlLmNvZGUgPT09IGhlbGRLZXlDb2RlKSB7XG5cdFx0XHRcdFx0aGVsZEtleUNvZGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKHB0dEtleUNvZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0cmVsZWFzZWRCZWZvcmVMaXN0ZW5pbmcgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHdpbi5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgb25Eb2NLZXlkb3duLCB0cnVlKTtcblx0XHRcdHdpbi5kb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXl1cCcsIG9uRG9jS2V5dXAsIHRydWUpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0d2luLmRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbkRvY0tleWRvd24sIHRydWUpO1xuXHRcdFx0XHR3aW4uZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5dXAnLCBvbkRvY0tleXVwLCB0cnVlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIV9pc1RleHRJbnB1dChlLnRhcmdldCkgJiYgcHR0S2V5Q29kZSAmJiBlLmNvZGUgPT09IHB0dEtleUNvZGUpIHtcblx0XHRcdFx0XHQvLyBQcmV2ZW50IHJlcGVhdCBrZXlkb3ducyBmcm9tIGFjdGl2YXRpbmcgZm9jdXNlZCBjaGlsZFxuXHRcdFx0XHRcdC8vIGJ1dHRvbnMgKHJvbGU9XCJidXR0b25cIiBlbGVtZW50cyBmaXJlIGNsaWNrIG9uIFNwYWNlKS5cblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIsICdrZXl1cCcsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICghX2lzVGV4dElucHV0KGUudGFyZ2V0KSAmJiBwdHRLZXlDb2RlICYmIGUuY29kZSA9PT0gcHR0S2V5Q29kZSkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRwdHRLZXlDb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuY2FsbGJhY2tzLnB0dFVwKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gU25hcHNob3Qgd2hpY2gga2V5IHN0YXJ0ZWQgUFRUIHdoZW4gcmVjb3JkaW5nIGFjdHVhbGx5IGJlZ2lucy5cblx0XHRcdC8vIFRoZSBrZXlib2FyZCBQdXNoLXRvLVRhbGsgY29tbWFuZCBjYWxscyB0aGUgY29udHJvbGxlcidzXG5cdFx0XHQvLyBgcHR0RG93bigpYCBkaXJlY3RseSAoYnlwYXNzaW5nIGBjYWxsYmFja3MucHR0RG93bmApLCBzbyBob29rIHRoZVxuXHRcdFx0Ly8gcmVzdWx0aW5nIGBsaXN0ZW5pbmdgIHN0YXRlIHRyYW5zaXRpb24gdG8gY2FwdHVyZSB0aGUga2V5IHJhdGhlclxuXHRcdFx0Ly8gdGhhbiB0aGUgY2FsbGJhY2suIE9ubHkgc25hcHNob3Qgd2hlbiBhIGtleSBpcyBwaHlzaWNhbGx5IGhlbGRcblx0XHRcdC8vIChrZXlib2FyZCBQVFQpOyBtb3VzZS9wb2ludGVyIFBUVCBsZWF2ZXMgYGhlbGRLZXlDb2RlYCB1bmRlZmluZWRcblx0XHRcdC8vIGFuZCByZWxlYXNlcyB2aWEgYHBvaW50ZXJ1cGAuXG5cdFx0XHRsZXQgd2FzTGlzdGVuaW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpc3RlbmluZyA9IHRoaXMuX3ZvaWNlU3RhdGUucmVhZChyZWFkZXIpID09PSAnbGlzdGVuaW5nJztcblx0XHRcdFx0aWYgKGxpc3RlbmluZyAmJiAhd2FzTGlzdGVuaW5nICYmIHB0dEtleUNvZGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGlmIChoZWxkS2V5Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRwdHRLZXlDb2RlID0gaGVsZEtleUNvZGU7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChyZWxlYXNlZEJlZm9yZUxpc3RlbmluZykge1xuXHRcdFx0XHRcdFx0Ly8gVGhlIFBUVCBrZXkgd2FzIGFscmVhZHkgcmVsZWFzZWQgd2hpbGUgd2Ugd2VyZSBzdGlsbFxuXHRcdFx0XHRcdFx0Ly8gY29ubmVjdGluZyAtIHN0b3AgcmVjb3JkaW5nIHJpZ2h0IGF3YXkgaW5zdGVhZCBvZlxuXHRcdFx0XHRcdFx0Ly8gZ2V0dGluZyBzdHVjayBsaXN0ZW5pbmcgd2l0aCBubyBrZXkgdG8gcmVsZWFzZS5cblx0XHRcdFx0XHRcdHJlbGVhc2VkQmVmb3JlTGlzdGVuaW5nID0gZmFsc2U7XG5cdFx0XHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5wdHRVcCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWxpc3RlbmluZykge1xuXHRcdFx0XHRcdHJlbGVhc2VkQmVmb3JlTGlzdGVuaW5nID0gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0d2FzTGlzdGVuaW5nID0gbGlzdGVuaW5nO1xuXHRcdFx0fSkpO1xuXHRcdFx0Ly8gQ2F0Y2ggcG9pbnRlcnVwIG91dHNpZGUgdGhlIGNvbnRhaW5lciB0b28gKG1pcnJvcnMgdGhlIGNoYXQgdmlldyBwYW5lIGJlaGF2aW9yKVxuXHRcdFx0Y29uc3Qgb25Eb2NQb2ludGVyVXAgPSAoKSA9PiB0aGlzLmNhbGxiYWNrcy5wdHRVcCgpO1xuXHRcdFx0d2luLmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3BvaW50ZXJ1cCcsIG9uRG9jUG9pbnRlclVwKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB3aW4uZG9jdW1lbnQucmVtb3ZlRXZlbnRMaXN0ZW5lcigncG9pbnRlcnVwJywgb25Eb2NQb2ludGVyVXApKSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHVwIFBUVCB2aWEgQnJvYWRjYXN0Q2hhbm5lbFxuXHRcdGNvbnN0IHB0dENoYW5uZWwgPSBuZXcgQnJvYWRjYXN0Q2hhbm5lbCgndnNjb2RlLXB0dCcpO1xuXHRcdHB0dENoYW5uZWwub25tZXNzYWdlID0gKGUpID0+IHtcblx0XHRcdGlmIChlLmRhdGEgPT09ICdkb3duJykgeyB0aGlzLmNhbGxiYWNrcy5wdHREb3duKCk7IH1cblx0XHRcdGlmIChlLmRhdGEgPT09ICd1cCcpIHsgdGhpcy5jYWxsYmFja3MucHR0VXAoKTsgfVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHB0dENoYW5uZWwuY2xvc2UoKSkpO1xuXG5cdFx0Ly8gQXV0by1yZW5kZXIgb24gb2JzZXJ2YWJsZSBjaGFuZ2VzIChidXQgTk9UIGdsb3cgXHUyMDE0IHRoYXQncyBpbiBSQUYpXG5cdFx0Y29uc3QgcmVuZGVyRGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZURPTShyZWFkZXIpO1xuXHRcdFx0Z2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5vblJlc2l6ZSgpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVuZGVyRGlzcG9zYWJsZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGRvbS5jbGVhck5vZGUodGhpcy5jb250YWluZXIpKSk7XG5cblx0XHQvLyBIYW5kbGUgdGhlIG9uYm9hcmRpbmcgXCJHZXQgU3RhcnRlZCBcdTIxOTIgY29ubmVjdFwiIGZsb3c6IGRpc21pc3Mgb25jZVxuXHRcdC8vIGNvbm5lY3Rpb24gc3VjY2VlZHMsIHJlc2V0IG9ubHkgb24gYWN0dWFsIGZhaWx1cmUuXG5cdFx0Ly8gTm90ZTogdm9pY2VTZXNzaW9uQ29udHJvbGxlciBzZXRzIGlzQ29ubmVjdGluZz1mYWxzZSB0aGVuIGlzQ29ubmVjdGVkPXRydWVcblx0XHQvLyBzZXF1ZW50aWFsbHkgKG5vdCBhdG9taWNhbGx5KSwgc28gd2UgZGVmZXIgdGhlIGZhaWx1cmUgY2hlY2sgb25lXG5cdFx0Ly8gbWljcm90YXNrIHRvIGdpdmUgaXNDb25uZWN0ZWQ9dHJ1ZSBhIGNoYW5jZSB0byBmb2xsb3cuXG5cdFx0bGV0IHNhd0Nvbm5lY3RpbmcgPSBmYWxzZTtcblx0XHRsZXQgZmFpbHVyZUNoZWNrUGVuZGluZyA9IGZhbHNlO1xuXHRcdGxldCBkaXNwb3NlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IG9uYm9hcmRpbmdDb25uZWN0RGlzcG9zYWJsZSA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICghdGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRzYXdDb25uZWN0aW5nID0gZmFsc2U7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0dGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0c2F3Q29ubmVjdGluZyA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9zaG93T25ib2FyZGluZy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuY2FsbGJhY2tzLm9uT25ib2FyZGluZ0NvbXBsZXRlZD8uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9pc0Nvbm5lY3RpbmcucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdHNhd0Nvbm5lY3RpbmcgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2F3Q29ubmVjdGluZyAmJiAhZmFpbHVyZUNoZWNrUGVuZGluZykge1xuXHRcdFx0XHRmYWlsdXJlQ2hlY2tQZW5kaW5nID0gdHJ1ZTtcblx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdGZhaWx1cmVDaGVja1BlbmRpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHRpZiAoZGlzcG9zZWQpIHsgcmV0dXJuOyB9XG5cdFx0XHRcdFx0aWYgKHRoaXMuX29uYm9hcmRpbmdQZW5kaW5nQ29ubmVjdC5yZWFkKHVuZGVmaW5lZCkgJiYgIXRoaXMuX2lzQ29ubmVjdGVkLnJlYWQodW5kZWZpbmVkKSAmJiAhdGhpcy5faXNDb25uZWN0aW5nLnJlYWQodW5kZWZpbmVkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdHNhd0Nvbm5lY3RpbmcgPSBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7IGRpc3Bvc2VkID0gdHJ1ZTsgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uYm9hcmRpbmdDb25uZWN0RGlzcG9zYWJsZSk7XG5cblx0XHQvLyBBbHdheXMtb24td2hlbi1kaXNjb25uZWN0ZWQgb25ib2FyZGluZzogd2hlbiB0aGUgaG9zdCBvcHRzIGluIHZpYVxuXHRcdC8vIGBgcmVzaG93T25ib2FyZGluZ09uRGlzY29ubmVjdGBgLCB0aGUgb25ib2FyZGluZyBjYXJkIHJlLWFwcGVhcnMgYW55XG5cdFx0Ly8gdGltZSB0aGUgd2lkZ2V0IGVudGVycyBhIGZ1bGx5LWRpc2Nvbm5lY3RlZCBzdGF0ZS4gV2UgdHJlYXRcblx0XHQvLyBjb25uZWN0aW5nIGFuZCBhdXRvLXJlY29ubmVjdGluZyBhcyB0cmFuc2llbnQgKG5vIHJlc2hvdykgc28gdGhlIFVJXG5cdFx0Ly8gZG9lc24ndCBmbGlja2VyIG1pZC1yZXRyeS4gVGhlIHVzZXIgY2FuIHN0aWxsIGRpc21pc3MgdGhlIGNhcmQgdmlhXG5cdFx0Ly8gdGhlIEdldCBTdGFydGVkIGJ1dHRvbjsgdGhhdCBkaXNtaXNzYWwgaXMgaG9ub3JlZCB1bnRpbCB0aGUgbmV4dFxuXHRcdC8vIGRpc2Nvbm5lY3QgdHJhbnNpdGlvbi5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5yZXNob3dPbmJvYXJkaW5nT25EaXNjb25uZWN0KSB7XG5cdFx0XHRjb25zdCByZXNob3dEaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBjb25uZWN0ZWQgPSB0aGlzLl9pc0Nvbm5lY3RlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3RpbmcgPSB0aGlzLl9pc0Nvbm5lY3RpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCByZWNvbm5lY3RpbmcgPSB0aGlzLl9pc1JlY29ubmVjdGluZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdDb25uZWN0ID0gdGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFjb25uZWN0ZWQgJiYgIWNvbm5lY3RpbmcgJiYgIXJlY29ubmVjdGluZyAmJiAhcGVuZGluZ0Nvbm5lY3QpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX3Nob3dPbmJvYXJkaW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd09uYm9hcmRpbmcuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHJlc2hvd0Rpc3Bvc2FibGUpO1xuXHRcdH1cblxuXHRcdC8vIFJ1biB0aGUgNjBIeiB3YXZlZm9ybS9nbG93IGxvb3Agb25seSB3aGlsZSB0aGVyZSBpcyBzb21ldGhpbmcgdG9cblx0XHQvLyBhbmltYXRlIChvbmJvYXJkaW5nLCBsaXN0ZW5pbmcsIG9yIHNwZWFraW5nKS4gSWRsZS9kaXNjb25uZWN0ZWQgcmVuZGVyXG5cdFx0Ly8gbm8gZ2xvdywgc28ga2VlcGluZyBhIGZyYW1lIGxvb3AgYWxpdmUgdGhlbiB3b3VsZCBidXJuIENQVSBmb3Igbm90aGluZy5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBvbmJvYXJkaW5nID0gdGhpcy5fc2hvd09uYm9hcmRpbmcucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgdm9pY2VTdGF0ZSA9IHRoaXMuX3ZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKG9uYm9hcmRpbmcgfHwgdm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycgfHwgdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJykge1xuXHRcdFx0XHR0aGlzLl9zdGFydFdhdmVmb3JtQW5pbWF0aW9uKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zdG9wV2F2ZWZvcm1BbmltYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3N0b3BXYXZlZm9ybUFuaW1hdGlvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVET00ocmVhZGVyOiBJUmVhZGVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnMuaW5wdXRCb3hMYXlvdXQpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZURPTUlucHV0Qm94TGF5b3V0KHJlYWRlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3VwZGF0ZURPTUNsYXNzaWNMYXlvdXQocmVhZGVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVET01JbnB1dEJveExheW91dChyZWFkZXI6IElSZWFkZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvbmJvYXJkaW5nID0gdGhpcy5fc2hvd09uYm9hcmRpbmcucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHZvaWNlU3RhdGUgPSB0aGlzLl92b2ljZVN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpc0Nvbm5lY3RlZCA9IHRoaXMuX2lzQ29ubmVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBpc0Nvbm5lY3RpbmcgPSB0aGlzLl9pc0Nvbm5lY3RpbmcucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGlzUmVjb25uZWN0aW5nID0gdGhpcy5faXNSZWNvbm5lY3RpbmcucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHNob3dDb25uZWN0ZWQgPSBpc0Nvbm5lY3RlZCB8fCBpc1JlY29ubmVjdGluZztcblx0XHRjb25zdCBvcHRzID0gdGhpcy5fb3B0aW9ucztcblx0XHRjb25zdCBzaG93RXhwYW5kZWQgPSB0aGlzLl9zaG91bGRTaG93RXhwYW5kZWQucmVhZChyZWFkZXIpICYmIG9wdHMuc2hvd0V4cGFuZENoZXZyb247XG5cblx0XHQvLyBBZGp1c3Qgcm9vdCB3aWR0aCB3aGVuIHNlc3Npb25zIGFyZSBleHBhbmRlZFxuXHRcdGNvbnN0IGJhc2VXaWR0aCA9IHR5cGVvZiBvcHRzLndpZHRoID09PSAnbnVtYmVyJyA/IG9wdHMud2lkdGggOiBBR0VOVFNfVk9JQ0VfV0lORE9XX0RFRkFVTFRfV0lEVEg7XG5cdFx0dGhpcy5fcm9vdERpdi5zdHlsZS53aWR0aCA9IGAke2Jhc2VXaWR0aH1weGA7XG5cblx0XHQvLyBUaXRsZSByb3c6IGhpZGRlbiBkdXJpbmcgb25ib2FyZGluZ1xuXHRcdHRoaXMuX3RpdGxlUm93LnN0eWxlLmRpc3BsYXkgPSAob25ib2FyZGluZyB8fCAhb3B0cy50aXRsZSkgPyAnbm9uZScgOiAnZmxleCc7XG5cblx0XHRpZiAob25ib2FyZGluZykge1xuXHRcdFx0dGhpcy5fb25ib2FyZGluZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2lucHV0Qm94Q29udGFpbmVyIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zdGF0dXNSb3dzQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5faW5wdXRCb3hUb29sYmFyIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LnVwZGF0ZSh7XG5cdFx0XHRcdHB0dEtleUxhYmVsOiB0aGlzLl9wdHRLZXlMYWJlbC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdGlzQ29ubmVjdGluZzogdGhpcy5fb25ib2FyZGluZ1BlbmRpbmdDb25uZWN0LnJlYWQocmVhZGVyKSB8fCBpc0Nvbm5lY3RpbmcsXG5cdFx0XHRcdG9uR2V0U3RhcnRlZDogKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLl9kaXNtaXNzT25ib2FyZGluZyh0cnVlKTsgfSxcblx0XHRcdFx0b25PcGVuUHR0S2V5U2V0dGluZ3M6IChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Mub3BlblB0dEtleVNldHRpbmdzKCk7IH0sXG5cdFx0XHRcdG9uT3BlblBvcG91dDogdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dCA/IChlKSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dD8uKCk7IH0gOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdGNvbnN0IGZlZWRiYWNrU3RhdGUgPSB0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoZmVlZGJhY2tTdGF0ZSkge1xuXHRcdFx0dGhpcy5fZmVlZGJhY2tEaWFsb2dDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC51cGRhdGUoe1xuXHRcdFx0XHRvblN1Ym1pdDogKHRleHQpID0+IHRoaXMuX3N1Ym1pdEZlZWRiYWNrKHRleHQpLFxuXHRcdFx0XHRvbkNhbmNlbDogKCkgPT4geyB0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldChudWxsLCB1bmRlZmluZWQpOyB9LFxuXHRcdFx0fSwgZmVlZGJhY2tTdGF0ZSk7XG5cdFx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lciEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2lucHV0Qm94VG9vbGJhciEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cblx0XHQvLyBJbnB1dCBib3ggY29udGFpbmVyIFx1MjAxNCBzaG93IHRyYW5zY3JpcHQgaW5zaWRlIG9yIHBsYWNlaG9sZGVyXG5cdFx0dGhpcy5faW5wdXRCb3hDb250YWluZXIhLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0Y29uc3QgdHJhbnNjcmlwdFR1cm5zID0gdGhpcy5fdHJhbnNjcmlwdFR1cm5zLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBoYXNUcmFuc2NyaXB0ID0gdHJhbnNjcmlwdFR1cm5zLnNvbWUodCA9PiB0LnRleHQubGVuZ3RoID4gMCB8fCAodC5zcGVha2VyID09PSAndXNlcicgJiYgdC5pc1BhcnRpYWwpKTtcblxuXHRcdC8vIFRoZSBhbWJpZW50IGdsb3cgaXMgb3duZWQgYnkgdGhlIGdsb3cgY29udHJvbGxlcjsgY2xlYXIgaXQgd2hlbmV2ZXIgdGhlXG5cdFx0Ly8gaW5wdXQgYm94IHNob3VsZG4ndCBiZSBsaXQgc28gbm8gc3RhbGUgZnJhbWUgaXMgbGVmdCBiZWhpbmQuXG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0lucHV0R2xvdyA9IHNob3dDb25uZWN0ZWQgJiYgKHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnIHx8IHZvaWNlU3RhdGUgPT09ICdzcGVha2luZycpO1xuXHRcdGlmICghc2hvdWxkU2hvd0lucHV0R2xvdykge1xuXHRcdFx0dGhpcy5fZ2xvd0NvbnRyb2xsZXI/LmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVG9nZ2xlIHByb2Nlc3NpbmcgY29tZXQgYW5pbWF0aW9uIHdoZW4gYWdlbnQgaXMgdGhpbmtpbmdcblx0XHR0aGlzLl9pbnB1dEJveENvbnRhaW5lciEuY2xhc3NMaXN0LnRvZ2dsZSgncHJvY2Vzc2luZycsIHZvaWNlU3RhdGUgPT09ICdwcm9jZXNzaW5nJyk7XG5cblx0XHRpZiAoaGFzVHJhbnNjcmlwdCkge1xuXHRcdFx0aWYgKHNob3dFeHBhbmRlZCkge1xuXHRcdFx0XHQvLyBXaGVuIGV4cGFuZGVkLCBzaG93IGZ1bGwgdHJhbnNjcmlwdCBjb21wb25lbnQgd2l0aCBjaGF0LWxpa2Ugc3R5bGluZ1xuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUucGFkZGluZyA9ICc4cHggMTJweCc7XG5cdFx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5ib3JkZXJCb3R0b20gPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS13aWRnZXQtYm9yZGVyLCB2YXIoLS12c2NvZGUtaW5wdXQtYm9yZGVyLCB0cmFuc3BhcmVudCkpJztcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC51cGRhdGUoeyB0dXJuczogdHJhbnNjcmlwdFR1cm5zLCBjaGF0U3R5bGU6IHRydWUgfSk7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIhLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94VHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLnBhZGRpbmcgPSAnJztcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmJvcmRlckJvdHRvbSA9ICcnO1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFRyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94VHJhbnNjcmlwdENvbXBvbmVudC51cGRhdGUoeyB0dXJuczogdHJhbnNjcmlwdFR1cm5zLCBjaGF0U3R5bGU6IHRydWUsIHNjcm9sbFRvVG9wOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBTaG93IHBsYWNlaG9sZGVyXG5cdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHR0aGlzLl9pbnB1dEJveFRyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRjb25zdCBrZXlMYWJlbCA9IHRoaXMuX3B0dEtleUxhYmVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChpc1JlY29ubmVjdGluZykge1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5yZWNvbm5lY3RpbmcnLCBcIlJlY29ubmVjdGluZy4uLlwiKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNDb25uZWN0aW5nKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIhLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmNvbm5lY3RpbmcnLCBcIkNvbm5lY3RpbmcuLi5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKGlzQ29ubmVjdGVkICYmIHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIhLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmxpc3RlbmluZycsIFwiTGlzdGVuaW5nXCIpO1xuXHRcdFx0fSBlbHNlIGlmIChpc0Nvbm5lY3RlZCAmJiB2b2ljZVN0YXRlID09PSAnc3BlYWtpbmcnKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIhLnRleHRDb250ZW50ID0ga2V5TGFiZWxcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5wcmVzc1RvQmFyZ2VJbicsIFwiU3BlYWsgb3IgdXNlIHswfVwiLCBrZXlMYWJlbClcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5zcGVha1RvQmFyZ2VJbicsIFwiU3BlYWsgdG8gYmFyZ2UgaW5cIik7XG5cdFx0XHR9IGVsc2UgaWYgKGlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIhLnRleHRDb250ZW50ID0ga2V5TGFiZWxcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5ob2xkVG9UYWxrT3JCYXJnZUluJywgXCJIb2xkIHswfSB0byB0YWxrIG9yIGJhcmdlIGluXCIsIGtleUxhYmVsKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmhvbGRNaWNUb1RhbGtPckJhcmdlSW4nLCBcIkhvbGQgdGhlIG1pYyB0byB0YWxrIG9yIGJhcmdlIGluXCIpO1xuXHRcdFx0fSBlbHNlIGlmIChrZXlMYWJlbCkge1xuXHRcdFx0XHR0aGlzLl9pbnB1dEJveFBsYWNlaG9sZGVyIS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdhZ2VudHNWb2ljZS5ob2xkVG9UYWxrJywgXCJIb2xkIHswfSB0byB0YWxrXCIsIGtleUxhYmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2lucHV0Qm94UGxhY2Vob2xkZXIhLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmNsaWNrTWljVG9UYWxrJywgXCJDbGljayB2b2ljZSBtb2RlIHRvIHRhbGtcIik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU3RhdHVzIHJvd3MgXHUyMDE0IGhpZGUgaW4gaW5wdXRCb3hMYXlvdXQgKG5vIFwiTm8gYWN0aXZlIHNlc3Npb25zXCIgdGV4dCBuZWVkZWQpXG5cdFx0aWYgKCFzaG93RXhwYW5kZWQpIHtcblx0XHRcdHRoaXMuX3N0YXR1c1Jvd3NDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0YXR1c1Jvd3NDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbkxpc3RXcmFwcGVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdC8vIENvbnN0cmFpbiBzZXNzaW9uIGxpc3QgaGVpZ2h0IHNvIHRvb2xiYXIgYW5kIHRyYW5zY3JpcHQgYWx3YXlzIHJlbWFpbiB2aXNpYmxlXG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUubWF4SGVpZ2h0ID0gJzIwMHB4Jztcblx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlci5zdHlsZS5vdmVyZmxvd1kgPSAnYXV0byc7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuc2Nyb2xsYmFyV2lkdGggPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdENvbXBvbmVudC51cGRhdGUoe1xuXHRcdFx0XHRzZXNzaW9uczogdGhpcy5fc2Vzc2lvbnMucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRncm91cHM6IHRoaXMuX3Nlc3Npb25Hcm91cHMucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRzZWxlY3RlZFRhcmdldDogdGhpcy5fc2VsZWN0ZWRUYXJnZXRTZXNzaW9uLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0b25PcGVuU2Vzc2lvbjogKHIpID0+IHRoaXMuY2FsbGJhY2tzLm9wZW5TZXNzaW9uKHIpLFxuXHRcdFx0XHRvblN0b3BTZXNzaW9uOiAocikgPT4gdGhpcy5jYWxsYmFja3Muc3RvcFNlc3Npb24ociksXG5cdFx0XHRcdG9uQ2FuY2VsU2Vzc2lvbjogKHIpID0+IHRoaXMuY2FsbGJhY2tzLmNhbmNlbFNlc3Npb24ociksXG5cdFx0XHRcdG9uU2VsZWN0VGFyZ2V0OiAocikgPT4geyB0aGlzLl9zZWxlY3RlZFRhcmdldFNlc3Npb24uc2V0KHIsIHVuZGVmaW5lZCk7IHRoaXMuY2FsbGJhY2tzLnNlbGVjdFRhcmdldFNlc3Npb24ocik7IH0sXG5cdFx0XHRcdG9uTmV3U2Vzc2lvbjogKCkgPT4gdGhpcy5jYWxsYmFja3MubmV3U2Vzc2lvbkFzVGFyZ2V0KCksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBUb29sYmFyIFx1MjAxNCBhbHdheXMgdmlzaWJsZVxuXHRcdHRoaXMuX2lucHV0Qm94VG9vbGJhciEuc3R5bGUuZGlzcGxheSA9ICdmbGV4JztcblxuXHRcdC8vIE1pYyBidXR0b24gXHUyMDE0IGFsd2F5cyB2aXNpYmxlIChwcmltYXJ5IGFjdGlvbilcblx0XHR0aGlzLl9pbnB1dEJveE1pY0J0biEuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdGNvbnN0IGtleUxhYmVsID0gdGhpcy5fcHR0S2V5TGFiZWwucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IG1pY1Rvb2x0aXAgPSBrZXlMYWJlbFxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UucHVzaFRvVGFsa0tleScsIFwiUHVzaCB0byB0YWxrICh7MH0pXCIsIGtleUxhYmVsKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UucHVzaFRvVGFsaycsIFwiUHVzaCB0byB0YWxrXCIpO1xuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS50aXRsZSA9IG1pY1Rvb2x0aXA7XG5cdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4hLmFyaWFMYWJlbCA9IG1pY1Rvb2x0aXA7XG5cdFx0Y29uc3QgbWljQ29sb3IgPSB2b2ljZVN0YXRlID09PSAnZXJyb3InID8gJ3ZhcigtLXZzY29kZS1lZGl0b3JFcnJvci1mb3JlZ3JvdW5kKSdcblx0XHRcdDogdm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycgPyAndmFyKC0tdnNjb2RlLWVkaXRvckluZm8tZm9yZWdyb3VuZCknXG5cdFx0XHRcdDogdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJyA/ICd2YXIoLS12c2NvZGUtYWdlbnRzVm9pY2Utc3BlYWtpbmdGb3JlZ3JvdW5kKSdcblx0XHRcdFx0XHQ6ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKSc7XG5cdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4hLnN0eWxlLmNvbG9yID0gbWljQ29sb3I7XG5cdFx0Y29uc3QgbWljSXNBY3RpdmUgPSB2b2ljZVN0YXRlID09PSAnbGlzdGVuaW5nJyB8fCB2b2ljZVN0YXRlID09PSAnc3BlYWtpbmcnO1xuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5jbGFzc0xpc3QudG9nZ2xlKCdhZ2VudHMtdm9pY2UtbW9kZS1hY3RpdmUnLCBtaWNJc0FjdGl2ZSk7XG5cdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4hLnN0eWxlLnNldFByb3BlcnR5KCctLWFnZW50cy12b2ljZS1pbnB1dC1pY29uLXJnYicsIHZvaWNlU3RhdGUgPT09ICdzcGVha2luZycgPyAnMTYzLDExMywyNDcnIDogJzg4LDE2NiwyNTUnKTtcblx0XHR0aGlzLl9pbnB1dEJveE1pY0J0biEuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzUwJSc7XG5cdFx0aWYgKCFtaWNJc0FjdGl2ZSkge1xuXHRcdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4hLnN0eWxlLmJveFNoYWRvdyA9ICdub25lJztcblx0XHR9XG5cdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4hLm9ubW91c2Vkb3duID0gKGU6IE1vdXNlRXZlbnQpID0+IHsgaWYgKGlzU2Vjb25kYXJ5UG9pbnRlckdlc3R1cmUoZSkpIHsgcmV0dXJuOyB9IGUucHJldmVudERlZmF1bHQoKTsgdGhpcy5jYWxsYmFja3MucHR0RG93bigpOyB9O1xuXHRcdHRoaXMuX2lucHV0Qm94TWljQnRuIS5vbm1vdXNldXAgPSAoZTogTW91c2VFdmVudCkgPT4geyBpZiAoaXNTZWNvbmRhcnlQb2ludGVyR2VzdHVyZShlKSkgeyByZXR1cm47IH0gdGhpcy5jYWxsYmFja3MucHR0VXAoKTsgfTtcblxuXHRcdC8vIENvbm5lY3Rpb24gaW5kaWNhdG9yIFx1MjAxNCB2aXNpYmxlIHdoZW4gY29ubmVjdGVkXG5cdFx0dGhpcy5faW5wdXRCb3hDb25uSW5kaWNhdG9yIS5zdHlsZS5kaXNwbGF5ID0gc2hvd0Nvbm5lY3RlZCA/ICcnIDogJ25vbmUnO1xuXHRcdHRoaXMuX2lucHV0Qm94Q29ubkluZGljYXRvciEub25jbGljayA9IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3MuZGlzY29ubmVjdCgpOyB9O1xuXG5cdFx0Ly8gRmVlZGJhY2sgYnV0dG9uIFx1MjAxNCBhbHdheXMgdmlzaWJsZVxuXHRcdHRoaXMuX2lucHV0Qm94RmVlZGJhY2tCdG4hLm9uY2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHRoaXMuX3RvZ2dsZUZlZWRiYWNrRGlhbG9nKCk7IH07XG5cblx0XHQvLyBTZXNzaW9ucyBidXR0b24gXHUyMDE0IGFsd2F5cyB2aXNpYmxlLCBpY29uIHRvZ2dsZXMgd2l0aCBleHBhbmRlZCBzdGF0ZVxuXHRcdHRoaXMuX2lucHV0Qm94U2Vzc2lvbnNCdG4hLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLl9pbnB1dEJveFNlc3Npb25zQnRuIS5jbGFzc05hbWUgPSBgY29kaWNvbiBjb2RpY29uLSR7c2hvd0V4cGFuZGVkID8gJ2NoZXZyb24tdXAnIDogJ2xpc3QtdHJlZSd9YDtcblx0XHR0aGlzLl9pbnB1dEJveFNlc3Npb25zQnRuIS50aXRsZSA9IHNob3dFeHBhbmRlZFxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRzVm9pY2UuY29sbGFwc2VTZXNzaW9ucycsIFwiQ29sbGFwc2Ugc2Vzc2lvbnNcIilcblx0XHRcdDogbG9jYWxpemUoJ2FnZW50c1ZvaWNlLnNlc3Npb25zJywgXCJTZXNzaW9uc1wiKTtcblxuXHRcdC8vIENsb3NlIGJ1dHRvblxuXHRcdHRoaXMuX2lucHV0Qm94Q2xvc2VCdG4hLnN0eWxlLmRpc3BsYXkgPSBvcHRzLnNob3dDbG9zZSA/ICcnIDogJ25vbmUnO1xuXHRcdHRoaXMuX2lucHV0Qm94Q2xvc2VCdG4hLm9uY2xpY2sgPSAoZTogTW91c2VFdmVudCkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHRoaXMuY2FsbGJhY2tzLmNsb3NlV2luZG93KCk7IH07XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVET01DbGFzc2ljTGF5b3V0KHJlYWRlcjogSVJlYWRlcik6IHZvaWQge1xuXHRcdGNvbnN0IG9uYm9hcmRpbmcgPSB0aGlzLl9zaG93T25ib2FyZGluZy5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3Qgdm9pY2VTdGF0ZSA9IHRoaXMuX3ZvaWNlU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IG9wdHMgPSB0aGlzLl9vcHRpb25zO1xuXHRcdGNvbnN0IHNob3dFeHBhbmRlZCA9IHRoaXMuX3Nob3VsZFNob3dFeHBhbmRlZC5yZWFkKHJlYWRlcikgJiYgb3B0cy5zaG93RXhwYW5kQ2hldnJvbjtcblxuXHRcdC8vIFRpdGxlIHJvdzogaGlkZGVuIGR1cmluZyBvbmJvYXJkaW5nXG5cdFx0dGhpcy5fdGl0bGVSb3cuc3R5bGUuZGlzcGxheSA9IChvbmJvYXJkaW5nIHx8ICFvcHRzLnRpdGxlKSA/ICdub25lJyA6ICdmbGV4JztcblxuXHRcdC8vIE9uYm9hcmRpbmcgdnMgbWFpbiBVSVxuXHRcdGlmIChvbmJvYXJkaW5nKSB7XG5cdFx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5faGVhZGVyQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3ZvaWNlQmFyQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3N0YXR1c1RleHREaXYuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX3RyYW5zY3JpcHRDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2V4cGFuZFNwYWNlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0dGhpcy5fY2hldnJvbldyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdFx0dGhpcy5fb25ib2FyZGluZ0NvbXBvbmVudC51cGRhdGUoe1xuXHRcdFx0XHRwdHRLZXlMYWJlbDogdGhpcy5fcHR0S2V5TGFiZWwucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRpc0Nvbm5lY3Rpbmc6IHRoaXMuX29uYm9hcmRpbmdQZW5kaW5nQ29ubmVjdC5yZWFkKHJlYWRlcikgfHwgdGhpcy5faXNDb25uZWN0aW5nLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0b25HZXRTdGFydGVkOiAoZSkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHRoaXMuX2Rpc21pc3NPbmJvYXJkaW5nKHRydWUpOyB9LFxuXHRcdFx0XHRvbk9wZW5QdHRLZXlTZXR0aW5nczogKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLmNhbGxiYWNrcy5vcGVuUHR0S2V5U2V0dGluZ3MoKTsgfSxcblx0XHRcdFx0b25PcGVuUG9wb3V0OiB0aGlzLmNhbGxiYWNrcy5vcGVuUG9wb3V0ID8gKGUpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLmNhbGxiYWNrcy5vcGVuUG9wb3V0Py4oKTsgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbmJvYXJkaW5nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuX2hlYWRlckNvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnJztcblxuXHRcdFx0Y29uc3QgZmVlZGJhY2tTdGF0ZSA9IHRoaXMuX2ZlZWRiYWNrRGlhbG9nU3RhdGUucmVhZChyZWFkZXIpO1xuXG5cdFx0XHR0aGlzLl9oZWFkZXJDb21wb25lbnQudXBkYXRlKHtcblx0XHRcdFx0Y29waWxvdEljb25TcmM6IHRoaXMuY2FsbGJhY2tzLmNvcGlsb3RJY29uU3JjLFxuXHRcdFx0XHRzaG93Q29waWxvdEljb246IG9wdHMuc2hvd0NvcGlsb3RJY29uLFxuXHRcdFx0XHRpc0Nvbm5lY3RlZDogdGhpcy5faXNDb25uZWN0ZWQucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRpc0Nvbm5lY3Rpbmc6IHRoaXMuX2lzQ29ubmVjdGluZy5yZWFkKHJlYWRlciksXG5cdFx0XHRcdGlzUmVjb25uZWN0aW5nOiB0aGlzLl9pc1JlY29ubmVjdGluZy5yZWFkKHJlYWRlciksXG5cdFx0XHRcdHZvaWNlU3RhdGUsXG5cdFx0XHRcdGRyYWdnYWJsZTogb3B0cy5kcmFnZ2FibGUsXG5cdFx0XHRcdHNob3dDbG9zZTogb3B0cy5zaG93Q2xvc2UsXG5cdFx0XHRcdHNob3dQb3BvdXQ6ICEhdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dCAmJiB0aGlzLl9wb3BvdXRBdmFpbGFibGUucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRoaWRlRGlzY29ubmVjdDogdGhpcy5jYWxsYmFja3MuaGlkZURpc2Nvbm5lY3QsXG5cdFx0XHRcdGNlbnRlckNvbm5lY3RCdXR0b246IG9wdHMuY2VudGVyQ29ubmVjdEJ1dHRvbixcblx0XHRcdFx0b25NaWNEb3duOiAoZTogTW91c2VFdmVudCkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IHRoaXMuY2FsbGJhY2tzLnB0dERvd24oKTsgfSxcblx0XHRcdFx0b25NaWNVcDogKCkgPT4geyB0aGlzLmNhbGxiYWNrcy5wdHRVcCgpOyB9LFxuXHRcdFx0XHRvbkNvbm5lY3RDbGljazogKGU6IE1vdXNlRXZlbnQpID0+IHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRpZiAodGhpcy5faXNDb25uZWN0aW5nLmdldCgpKSB7IHJldHVybjsgfVxuXHRcdFx0XHRcdGlmICh0aGlzLl9pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jYWxsYmFja3MuZGlzY29ubmVjdCgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNhbGxiYWNrcy5jb25uZWN0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRpc2Nvbm5lY3RDbGljazogKGU6IE1vdXNlRXZlbnQpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLmNhbGxiYWNrcy5kaXNjb25uZWN0KCk7IH0sXG5cdFx0XHRcdG9uQ2xvc2VDbGljazogKGU6IE1vdXNlRXZlbnQpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLmNhbGxiYWNrcy5jbG9zZVdpbmRvdygpOyB9LFxuXHRcdFx0XHRvblRvZ2dsZUNsaWNrOiAoZTogTW91c2VFdmVudCkgPT4geyBlLnByZXZlbnREZWZhdWx0KCk7IGUuc3RvcFByb3BhZ2F0aW9uKCk7IHRoaXMuX2V4cGFuZGVkLnNldCghdGhpcy5fZXhwYW5kZWQuZ2V0KCksIHVuZGVmaW5lZCk7IH0sXG5cdFx0XHRcdG9uTWljQ29udGV4dE1lbnU6IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Muc2hvd1ZvaWNlQ29udGV4dE1lbnUoZSk7IH0sXG5cdFx0XHRcdG9uUG9wb3V0Q2xpY2s6IChlOiBNb3VzZUV2ZW50KSA9PiB7IGUucHJldmVudERlZmF1bHQoKTsgZS5zdG9wUHJvcGFnYXRpb24oKTsgdGhpcy5jYWxsYmFja3Mub3BlblBvcG91dD8uKCk7IH0sXG5cdFx0XHRcdG9uRmVlZGJhY2tDbGljazogKGU6IE1vdXNlRXZlbnQpID0+IHsgZS5wcmV2ZW50RGVmYXVsdCgpOyBlLnN0b3BQcm9wYWdhdGlvbigpOyB0aGlzLl90b2dnbGVGZWVkYmFja0RpYWxvZygpOyB9LFxuXHRcdFx0XHRwdHRLZXlMYWJlbDogdGhpcy5fcHR0S2V5TGFiZWwucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRleHBhbmRlZDogc2hvd0V4cGFuZGVkLFxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChmZWVkYmFja1N0YXRlKSB7XG5cdFx0XHRcdHRoaXMuX3ZvaWNlQmFyQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fZmVlZGJhY2tEaWFsb2dDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50LnVwZGF0ZSh7XG5cdFx0XHRcdFx0b25TdWJtaXQ6ICh0ZXh0KSA9PiB0aGlzLl9zdWJtaXRGZWVkYmFjayh0ZXh0KSxcblx0XHRcdFx0XHRvbkNhbmNlbDogKCkgPT4geyB0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldChudWxsLCB1bmRlZmluZWQpOyB9LFxuXHRcdFx0XHR9LCBmZWVkYmFja1N0YXRlKTtcblx0XHRcdFx0Ly8gSGlkZSBldmVyeXRoaW5nIGJlbG93IHdoZW4gZmVlZGJhY2sgZGlhbG9nIGlzIG9wZW5cblx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dERpdi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLl90cmFuc2NyaXB0Q29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0V3JhcHBlci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0XHR0aGlzLl9leHBhbmRTcGFjZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5fY2hldnJvbldyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdFx0XHQvLyBWb2ljZSBiYXIgKGxpc3RlbmluZy9zcGVha2luZyBpbmRpY2F0b3Igd2l0aCBzdG9wIGJ1dHRvbilcblx0XHRcdFx0dGhpcy5fdm9pY2VCYXJDb21wb25lbnQudXBkYXRlKHtcblx0XHRcdFx0XHR2b2ljZVN0YXRlLFxuXHRcdFx0XHRcdHNwZWFraW5nU2Vzc2lvbkxhYmVsOiB0aGlzLl9zcGVha2luZ1Nlc3Npb25MYWJlbC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0c3BlYWtpbmdTZXNzaW9uOiB0aGlzLl9zcGVha2luZ1Nlc3Npb24ucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdG9uU3RvcFNwZWVjaDogKCkgPT4gdGhpcy5jYWxsYmFja3Muc3RvcFBsYXliYWNrKCksXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFN0YXR1cyB0ZXh0IFx1MjAxNCBhbHdheXMgc2hvdyB3aGVuIGluIGVycm9yIHN0YXRlIChlLmcuIG1pYyBkZW5pZWQpXG5cdFx0XHRcdGNvbnN0IHN0YXR1c1RleHQgPSB0aGlzLl9zdGF0dXNUZXh0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgaXNFcnJvciA9IHZvaWNlU3RhdGUgPT09ICdlcnJvcic7XG5cdFx0XHRcdGlmICgob3B0cy5zaG93U3RhdHVzVGV4dCB8fCBpc0Vycm9yKSAmJiBzdGF0dXNUZXh0KSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dERpdi5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dERpdi50ZXh0Q29udGVudCA9IHN0YXR1c1RleHQ7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzVGV4dERpdi5zdHlsZS5jb2xvciA9IGlzRXJyb3IgPyAndmFyKC0tdnNjb2RlLWVkaXRvckVycm9yLWZvcmVncm91bmQpJyA6ICd2YXIoLS12c2NvZGUtZm9yZWdyb3VuZCknO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1c1RleHREaXYuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFRyYW5zY3JpcHRcblx0XHRcdFx0dGhpcy5fdHJhbnNjcmlwdENvbXBvbmVudC51cGRhdGUoeyB0dXJuczogdGhpcy5fdHJhbnNjcmlwdFR1cm5zLnJlYWQocmVhZGVyKSB9KTtcblxuXHRcdFx0XHQvLyBTdGF0dXMgcm93cyAoY29sbGFwc2VkKSBvciBzZXNzaW9uIGxpc3QgKGV4cGFuZGVkKVxuXHRcdFx0XHRpZiAoIXNob3dFeHBhbmRlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3N0YXR1c1Jvd3NDb21wb25lbnQuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdHVzUm93c0NvbXBvbmVudC51cGRhdGUoe1xuXHRcdFx0XHRcdFx0d29ya2luZ0NvdW50OiB0aGlzLl93b3JraW5nQ291bnQucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdFx0bmVlZHNJbnB1dENvdW50OiB0aGlzLl9uZWVkc0lucHV0Q291bnQucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdFx0ZG9uZUNvdW50OiB0aGlzLl9kb25lQ291bnQucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdFx0c2hvd0NvdW50ZXJzOiBvcHRzLnNob3dTdGF0dXNDb3VudGVycyxcblx0XHRcdFx0XHRcdHNwZWFraW5nU2Vzc2lvbkxhYmVsOiB0aGlzLl9zcGVha2luZ1Nlc3Npb25MYWJlbC5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0XHRzcGVha2luZ1Nlc3Npb25SZXNvdXJjZTogdGhpcy5fc3BlYWtpbmdTZXNzaW9uLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdHBlbmRpbmdUb29sQ29uZmlybWF0aW9uczogdGhpcy5fcGVuZGluZ1Rvb2xDb25maXJtYXRpb25zLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdG9uT3BlblNlc3Npb246IChyKSA9PiB0aGlzLmNhbGxiYWNrcy5vcGVuU2Vzc2lvbihyKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0dXNSb3dzQ29tcG9uZW50LmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uTGlzdFdyYXBwZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25MaXN0Q29tcG9uZW50LnVwZGF0ZSh7XG5cdFx0XHRcdFx0XHRzZXNzaW9uczogdGhpcy5fc2Vzc2lvbnMucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdFx0Z3JvdXBzOiB0aGlzLl9zZXNzaW9uR3JvdXBzLnJlYWQocmVhZGVyKSxcblx0XHRcdFx0XHRcdHNlbGVjdGVkVGFyZ2V0OiB0aGlzLl9zZWxlY3RlZFRhcmdldFNlc3Npb24ucmVhZChyZWFkZXIpLFxuXHRcdFx0XHRcdFx0b25PcGVuU2Vzc2lvbjogKHIpID0+IHRoaXMuY2FsbGJhY2tzLm9wZW5TZXNzaW9uKHIpLFxuXHRcdFx0XHRcdFx0b25TdG9wU2Vzc2lvbjogKHIpID0+IHRoaXMuY2FsbGJhY2tzLnN0b3BTZXNzaW9uKHIpLFxuXHRcdFx0XHRcdFx0b25DYW5jZWxTZXNzaW9uOiAocikgPT4gdGhpcy5jYWxsYmFja3MuY2FuY2VsU2Vzc2lvbihyKSxcblx0XHRcdFx0XHRcdG9uU2VsZWN0VGFyZ2V0OiAocikgPT4geyB0aGlzLl9zZWxlY3RlZFRhcmdldFNlc3Npb24uc2V0KHIsIHVuZGVmaW5lZCk7IHRoaXMuY2FsbGJhY2tzLnNlbGVjdFRhcmdldFNlc3Npb24ocik7IH0sXG5cdFx0XHRcdFx0XHRvbk5ld1Nlc3Npb246ICgpID0+IHRoaXMuY2FsbGJhY2tzLm5ld1Nlc3Npb25Bc1RhcmdldCgpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fZXhwYW5kU3BhY2VyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdFx0dGhpcy5fY2hldnJvbldyYXBwZXIuc3R5bGUuZGlzcGxheSA9IG9wdHMuc2hvd0V4cGFuZENoZXZyb24gPyAnZmxleCcgOiAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX2NoZXZyb25XcmFwcGVyLnRpdGxlID0gc2hvd0V4cGFuZGVkID8gJ0NvbGxhcHNlIHNlc3Npb25zJyA6ICdFeHBhbmQgc2Vzc2lvbnMnO1xuXHRcdFx0XHR0aGlzLl9jaGV2cm9uSWNvbi5jbGFzc05hbWUgPSBgY29kaWNvbiBjb2RpY29uLSR7c2hvd0V4cGFuZGVkID8gJ2NoZXZyb24tdXAnIDogJ2NoZXZyb24tZG93bid9YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0gUHVibGljIHN0YXRlIHNldHRlcnMgKGNhbGxlZCBieSB0aGUgc2VydmljZSkgLS0tXG5cblx0c2V0Q29ubmVjdGVkKGNvbm5lY3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2lzQ29ubmVjdGVkLnNldChjb25uZWN0ZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRDb25uZWN0aW5nKGNvbm5lY3Rpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Nvbm5lY3Rpbmcuc2V0KGNvbm5lY3RpbmcsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRSZWNvbm5lY3RpbmcocmVjb25uZWN0aW5nOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5faXNSZWNvbm5lY3Rpbmcuc2V0KHJlY29ubmVjdGluZywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFZvaWNlU3RhdGUoc3RhdGU6IFZvaWNlU3RhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl92b2ljZVN0YXRlLnNldChzdGF0ZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFN0YXR1c0NvdW50cyh3b3JraW5nOiBudW1iZXIsIG5lZWRzSW5wdXQ6IG51bWJlciwgZG9uZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fd29ya2luZ0NvdW50LnNldCh3b3JraW5nLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX25lZWRzSW5wdXRDb3VudC5zZXQobmVlZHNJbnB1dCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9kb25lQ291bnQuc2V0KGRvbmUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRQZW5kaW5nVG9vbENvbmZpcm1hdGlvbnMoY29uZmlybWF0aW9uczogcmVhZG9ubHkgSVBlbmRpbmdUb29sQ29uZmlybWF0aW9uW10pOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nVG9vbENvbmZpcm1hdGlvbnMuc2V0KGNvbmZpcm1hdGlvbnMsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRTcGVha2luZ1Nlc3Npb24oc2Vzc2lvbjogVVJJIHwgdW5kZWZpbmVkLCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc3BlYWtpbmdTZXNzaW9uLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3NwZWFraW5nU2Vzc2lvbkxhYmVsLnNldChsYWJlbCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFNlc3Npb25zKHNlc3Npb25zOiByZWFkb25seSBTZXNzaW9uUm93RGF0YVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25zLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0U2VsZWN0ZWRUYXJnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3RlZFRhcmdldFNlc3Npb24uc2V0KHJlc291cmNlLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c2V0U2Vzc2lvbkdyb3Vwcyhncm91cHM6IHJlYWRvbmx5IFNlc3Npb25Hcm91cERhdGFbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25Hcm91cHMuc2V0KGdyb3VwcywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFB0dEtleUxhYmVsKGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9wdHRLZXlMYWJlbC5zZXQobGFiZWwsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRzZXRUcmFuc2NyaXB0VHVybnModHVybnM6IHJlYWRvbmx5IElUcmFuc2NyaXB0VHVybltdKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhbnNjcmlwdFR1cm5zLnNldCh0dXJucywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFN0YXR1c1RleHQodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdHVzVGV4dC5zZXQodGV4dCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldFBvcG91dEF2YWlsYWJsZShhdmFpbGFibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9wb3BvdXRBdmFpbGFibGUuc2V0KGF2YWlsYWJsZSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8vIC0tLSBGZWVkYmFjayBkaWFsb2cgLS0tXG5cblx0cHJpdmF0ZSBfdG9nZ2xlRmVlZGJhY2tEaWFsb2coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2ZlZWRiYWNrRGlhbG9nU3RhdGUuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nU3RhdGUuc2V0KG51bGwsIHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Nob3dPbmJvYXJkaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nU3RhdGUuc2V0KHsgaXNTdWJtaXR0aW5nOiBmYWxzZSwgc3VibWl0dGVkOiBmYWxzZSB9LCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBPbmJvYXJkaW5nIC0tLVxuXG5cdHByaXZhdGUgX2Rpc21pc3NPbmJvYXJkaW5nKGNvbm5lY3Q6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmIChjb25uZWN0KSB7XG5cdFx0XHQvLyBEb24ndCBkaXNtaXNzIHlldCBcdTIwMTQga2ljayBvZmYgY29ubmVjdGlvbiwgd2FpdCBmb3IgaXQgdG8gc3VjY2VlZFxuXHRcdFx0Ly8gdmlhIHRoZSBlZmZlY3QgdGhhdCB3YXRjaGVzIGlzQ29ubmVjdGVkL2lzQ29ubmVjdGluZy5cblx0XHRcdGlmICh0aGlzLl9pc0Nvbm5lY3RlZC5nZXQoKSkge1xuXHRcdFx0XHQvLyBBbHJlYWR5IGNvbm5lY3RlZCBzb21laG93IFx1MjAxNCBqdXN0IGRpc21pc3MuXG5cdFx0XHRcdHRoaXMuX3Nob3dPbmJvYXJkaW5nLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0dGhpcy5jYWxsYmFja3Mub25PbmJvYXJkaW5nQ29tcGxldGVkPy4oKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9pc0Nvbm5lY3RpbmcuZ2V0KCkgJiYgIXRoaXMuX29uYm9hcmRpbmdQZW5kaW5nQ29ubmVjdC5nZXQoKSkge1xuXHRcdFx0XHR0aGlzLl9vbmJvYXJkaW5nUGVuZGluZ0Nvbm5lY3Quc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuY2FsbGJhY2tzLmNvbm5lY3QoKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2hvd09uYm9hcmRpbmcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5jYWxsYmFja3Mub25PbmJvYXJkaW5nQ29tcGxldGVkPy4oKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRXh0ZXJuYWxseSB0cmlnZ2VyIG9uYm9hcmRpbmcgZGlzbWlzc2FsIChlLmcuIHdoZW4gdGhlIHVzZXIgY29ubmVjdHNcblx0ICogZnJvbSB0aGUgZmxvYXRpbmcgbWluaS12aWV3LCB0aGUgbWFpbiBwYW5lbCBzaG91bGQgZHJvcCB0aGUgb25ib2FyZGluZykuXG5cdCAqIEFsc28gY2xlYXJzIGFueSBpbi1mbGlnaHQgcGVuZGluZy1jb25uZWN0IHN0YXRlIHNvIGEgbGF0ZXIgc3VjY2Vzc1xuXHQgKiBkb2Vzbid0IHJlLXRyaWdnZXIgdGhlIGNvbXBsZXRpb24gY2FsbGJhY2suXG5cdCAqL1xuXHRkaXNtaXNzT25ib2FyZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl9vbmJvYXJkaW5nUGVuZGluZ0Nvbm5lY3Quc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGlmICh0aGlzLl9zaG93T25ib2FyZGluZy5nZXQoKSkge1xuXHRcdFx0dGhpcy5fc2hvd09uYm9hcmRpbmcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N1Ym1pdEZlZWRiYWNrKHRleHQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2ZlZWRiYWNrRGlhbG9nU3RhdGUuc2V0KHsgaXNTdWJtaXR0aW5nOiB0cnVlLCBzdWJtaXR0ZWQ6IGZhbHNlIH0sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5jYWxsYmFja3Muc3VibWl0RmVlZGJhY2sodGV4dCkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0aWYgKHJlc3VsdC5vaykge1xuXHRcdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldCh7IGlzU3VibWl0dGluZzogZmFsc2UsIHN1Ym1pdHRlZDogdHJ1ZSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHsgdGhpcy5fZmVlZGJhY2tEaWFsb2dTdGF0ZS5zZXQobnVsbCwgdW5kZWZpbmVkKTsgfSwgMzAwMCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9mZWVkYmFja0RpYWxvZ1N0YXRlLnNldCh7IGlzU3VibWl0dGluZzogZmFsc2UsIHN1Ym1pdHRlZDogZmFsc2UsIGVycm9yOiByZXN1bHQuZXJyb3IgPz8gbG9jYWxpemUoJ2FnZW50c1ZvaWNlLmZlZWRiYWNrRXJyb3InLCBcIkZhaWxlZCB0byBzdWJtaXRcIikgfSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLSBHbG93IGFuaW1hdGlvbiAoZGVjb3VwbGVkIGZyb20gYXV0b3J1biBcdTIwMTQgZGlyZWN0IERPTSB1cGRhdGVzKSAtLS1cblxuXHRwcml2YXRlIF9hbmltYXRpb25GcmFtZUlkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfc3RhcnRXYXZlZm9ybUFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fYW5pbWF0aW9uRnJhbWVJZCAhPT0gdW5kZWZpbmVkKSB7IHJldHVybjsgfVxuXHRcdGNvbnN0IGFuaW1hdGUgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9hbmltYXRpb25GcmFtZUlkID0gZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XG5cdFx0XHRjb25zdCBvbmJvYXJkaW5nID0gdGhpcy5fc2hvd09uYm9hcmRpbmcuZ2V0KCk7XG5cdFx0XHRjb25zdCB2b2ljZVN0YXRlID0gdGhpcy5fdm9pY2VTdGF0ZS5nZXQoKTtcblx0XHRcdC8vIFRoZSByZWFjdGl2ZSBhdXRvcnVuIHN0YXJ0cy9zdG9wcyB0aGlzIGxvb3A7IGd1YXJkIGFnYWluc3QgYSBmcmFtZVxuXHRcdFx0Ly8gdGhhdCByYWNlcyBhIHRyYW5zaXRpb24gdG8gYSBub24tZ2xvd2luZyBzdGF0ZSAoc3R5bGVzIGFyZSBjbGVhcmVkXG5cdFx0XHQvLyBieSBfc3RvcFdhdmVmb3JtQW5pbWF0aW9uKCkpLlxuXHRcdFx0aWYgKCEob25ib2FyZGluZyB8fCB2b2ljZVN0YXRlID09PSAnbGlzdGVuaW5nJyB8fCB2b2ljZVN0YXRlID09PSAnc3BlYWtpbmcnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFuYWx5c2VyID0gdGhpcy5jYWxsYmFja3MuZ2V0QW5hbHlzZXJOb2RlKCk7XG5cdFx0XHRsZXQgaW50ZW5zaXR5OiBudW1iZXI7XG5cdFx0XHRpZiAob25ib2FyZGluZykge1xuXHRcdFx0XHRpbnRlbnNpdHkgPSAwLjY7XG5cdFx0XHR9IGVsc2UgaWYgKCFhbmFseXNlcikge1xuXHRcdFx0XHRpbnRlbnNpdHkgPSAwLjM7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBkYXRhQXJyYXkgPSBuZXcgVWludDhBcnJheShhbmFseXNlci5mcmVxdWVuY3lCaW5Db3VudCk7XG5cdFx0XHRcdGFuYWx5c2VyLmdldEJ5dGVGcmVxdWVuY3lEYXRhKGRhdGFBcnJheSk7XG5cdFx0XHRcdGxldCBzdW0gPSAwO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGRhdGFBcnJheS5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHN1bSArPSBkYXRhQXJyYXlbaV07XG5cdFx0XHRcdH1cblx0XHRcdFx0aW50ZW5zaXR5ID0gTWF0aC5taW4oMSwgKHN1bSAvIGRhdGFBcnJheS5sZW5ndGgpIC8gODApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBbmltYXRlIGlucHV0IGJveCBjb250YWluZXIgYm9yZGVyL3NoYWRvdyAoaW5wdXRCb3hMYXlvdXQpXG5cdFx0XHRpZiAodGhpcy5fZ2xvd0NvbnRyb2xsZXIgJiYgKHZvaWNlU3RhdGUgPT09ICdsaXN0ZW5pbmcnIHx8IHZvaWNlU3RhdGUgPT09ICdzcGVha2luZycpKSB7XG5cdFx0XHRcdHRoaXMuX2dsb3dDb250cm9sbGVyLnJlbmRlcih2b2ljZVN0YXRlLCBpbnRlbnNpdHksIHRoaXMuY2FsbGJhY2tzLmlzTW90aW9uUmVkdWNlZCgpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29sb3JzID0gdGhpcy5jYWxsYmFja3MuZ2V0R2xvd0NvbG9ycygpO1xuXHRcdFx0aWYgKHRoaXMuX2lucHV0Qm94TWljQnRuKSB7XG5cdFx0XHRcdGNvbnN0IGljb25HbG93QWN0aXZlID0gdm9pY2VTdGF0ZSA9PT0gJ2xpc3RlbmluZycgfHwgdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJztcblx0XHRcdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4uc3R5bGUuYm94U2hhZG93ID0gaWNvbkdsb3dBY3RpdmVcblx0XHRcdFx0XHQ/IGNvbXB1dGVWb2ljZU1pY0dsb3dCb3hTaGFkb3codm9pY2VTdGF0ZSwgaW50ZW5zaXR5LCBjb2xvcnMpXG5cdFx0XHRcdFx0OiAnbm9uZSc7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENsYXNzaWMgbGF5b3V0IGdsb3cgZGl2XG5cdFx0XHR0aGlzLl9nbG93RGl2LnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdGNvbnN0IGJhc2VPcGFjaXR5ID0gMC4xNSArIGludGVuc2l0eSAqIDAuNDtcblx0XHRcdGNvbnN0IHsgciwgZywgYiB9ID0gdm9pY2VHbG93U3RhdGVDb2xvcihvbmJvYXJkaW5nID8gJ3NwZWFraW5nJyA6IHZvaWNlU3RhdGUsIGNvbG9ycykucmdiYTtcblx0XHRcdGNvbnN0IHJnYiA9IGAke3J9LCR7Z30sJHtifWA7XG5cdFx0XHR0aGlzLl9nbG93RGl2LnN0eWxlLmJhY2tncm91bmQgPSBgcmFkaWFsLWdyYWRpZW50KGVsbGlwc2UgNDAlIDcwJSBhdCA1MCUgMCUsIHJnYmEoJHtyZ2J9LCR7YmFzZU9wYWNpdHl9KSAwJSwgdHJhbnNwYXJlbnQgMTAwJSksIHJhZGlhbC1ncmFkaWVudChlbGxpcHNlIDcwJSAxMDAlIGF0IDUwJSAwJSwgcmdiYSgke3JnYn0sJHtiYXNlT3BhY2l0eSAqIDAuNH0pIDAlLCB0cmFuc3BhcmVudCAxMDAlKWA7XG5cdFx0fTtcblx0XHR0aGlzLl9hbmltYXRpb25GcmFtZUlkID0gZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoYW5pbWF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wV2F2ZWZvcm1BbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FuaW1hdGlvbkZyYW1lSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Z2V0V2luZG93KHRoaXMuY29udGFpbmVyKS5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLl9hbmltYXRpb25GcmFtZUlkKTtcblx0XHRcdHRoaXMuX2FuaW1hdGlvbkZyYW1lSWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIENsZWFyIGFueSBnbG93IGxlZnQgYnkgdGhlIGxhc3QgcmVuZGVyZWQgZnJhbWUgc28gaWRsZS9kaXNjb25uZWN0ZWRcblx0XHQvLyBzaG93cyBubyByZXNpZHVhbCBnbG93IG5vdyB0aGF0IHRoZSBsb29wIG5vIGxvbmdlciBydW5zIHdoaWxlIGlkbGUuXG5cdFx0dGhpcy5fZ2xvd0Rpdi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdHRoaXMuX2dsb3dDb250cm9sbGVyPy5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9pbnB1dEJveE1pY0J0bikge1xuXHRcdFx0dGhpcy5faW5wdXRCb3hNaWNCdG4uc3R5bGUuYm94U2hhZG93ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBfaXNUZXh0SW5wdXQodGFyZ2V0OiBFdmVudFRhcmdldCB8IG51bGwpOiBib29sZWFuIHtcblx0aWYgKCF0YXJnZXQgfHwgdHlwZW9mICh0YXJnZXQgYXMgRWxlbWVudCkudGFnTmFtZSAhPT0gJ3N0cmluZycpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdGNvbnN0IGVsID0gdGFyZ2V0IGFzIEVsZW1lbnQ7XG5cdGNvbnN0IHRhZyA9IGVsLnRhZ05hbWU7XG5cdGlmICh0YWcgPT09ICdURVhUQVJFQScgfHwgdGFnID09PSAnSU5QVVQnKSB7IHJldHVybiB0cnVlOyB9XG5cdC8vIEhUTUxFbGVtZW50LmlzQ29udGVudEVkaXRhYmxlIGlzIHJlYWxtLXNwZWNpZmljOyBjaGVjayBkZWZlbnNpdmVseS5cblx0cmV0dXJuIChlbCBhcyBIVE1MRWxlbWVudCAmIHsgaXNDb250ZW50RWRpdGFibGU/OiBib29sZWFuIH0pLmlzQ29udGVudEVkaXRhYmxlID09PSB0cnVlO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsaUJBQWlCLFNBQVMsZUFBdUQ7QUFDMUYsU0FBUyxZQUFZLG9CQUFvQjtBQUV6QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1DQUFtQywwQ0FBMEM7QUFDdEYsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx5QkFBcUU7QUFDOUUsU0FBUyw0QkFBc0Q7QUFDL0QsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUFXLHVCQUF1QixpQ0FBaUM7QUFFNUUsU0FBUyw4QkFBZ0QsMkJBQTJCO0FBQ3BGLFNBQVMsaUNBQXNFO0FBd0cvRSxNQUFNLGtCQUFnRDtBQUFBLEVBQ3JELE9BQU87QUFBQSxFQUNQLFdBQVc7QUFBQSxFQUNYLFdBQVc7QUFBQSxFQUNYLG1CQUFtQjtBQUFBLEVBQ25CLGdCQUFnQjtBQUFBLEVBQ2hCLG9CQUFvQjtBQUFBLEVBQ3BCLGlCQUFpQjtBQUFBLEVBQ2pCLHFCQUFxQjtBQUFBLEVBQ3JCLE9BQU87QUFBQSxFQUNQLFVBQVU7QUFBQSxFQUNWLFdBQVc7QUFBQSxFQUNYLGdCQUFnQjtBQUFBLEVBQ2hCLDhCQUE4QjtBQUFBLEVBQzlCLGlCQUFpQjtBQUFBLEVBQ2pCLGdCQUFnQjtBQUNqQjtBQUVPLE1BQU0sMEJBQTBCLFdBQVc7QUFBQSxFQStEakQsWUFDa0IsV0FDQSxXQUNqQixVQUE4QixDQUFDLEdB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
