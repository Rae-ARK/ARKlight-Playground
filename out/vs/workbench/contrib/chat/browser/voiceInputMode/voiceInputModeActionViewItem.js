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
import * as dom from "../../../../../base/browser/dom.js";
import "../../../../../base/browser/ui/segmentedIconToggle/segmentedIconToggle.css";
import "./media/voiceInputMode.css";
import { getActiveWindow, getWindow } from "../../../../../base/browser/dom.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { ContextKeyExpr } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsDevelopmentContext } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { resolveVoiceGlowColors } from "../voiceClient/voiceGlow.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { ChatAgentLocation } from "../../common/constants.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IVoiceSessionController } from "../voiceClient/voiceSessionController.js";
import { IMicCaptureService } from "../voiceClient/micCaptureService.js";
import { ITtsPlaybackService } from "../voiceClient/ttsPlaybackService.js";
import { ChatSpeechToTextState, IChatSpeechToTextService } from "../speechToText/chatSpeechToTextService.js";
import { setupDictationMicGlow } from "../speechToText/dictationMicGlow.js";
import { DictationDownloadRing, getDictationPreparingLabel } from "../speechToText/dictationDownloadRing.js";
import { getDictationHoverContent, getVoiceModeHoverContent } from "../speechToText/micButtonHovers.js";
import { addMicButtonContextMenuListener, getDictationContextMenuActions, getVoiceModeContextMenuActions } from "../speechToText/micButtonMenuActions.js";
import { IVoiceInputModeService } from "./voiceInputMode.js";
import { SegmentedVoiceInputModePillActive } from "./voiceInputModeContextKeys.js";
const DICTATION_TOGGLE_COMMAND_ID = "workbench.action.chat.toggleSpeechToText";
const VOICE_START_COMMAND_ID = "agentsVoice.startVoiceInChat";
const WAVEFORM_BAR_COUNT = 5;
const WAVEFORM_BAR_MIN_HEIGHT = 2;
const WAVEFORM_BAR_MAX_HEIGHT = 10;
const _ChatVoiceInputModeAction = class _ChatVoiceInputModeAction extends Action2 {
  constructor() {
    super({
      id: _ChatVoiceInputModeAction.ID,
      title: localize2("voiceInputMode", "Voice Input Mode"),
      icon: Codicon.mic,
      precondition: SegmentedVoiceInputModePillActive,
      menu: {
        id: MenuId.ChatExecute,
        when: ContextKeyExpr.and(
          SegmentedVoiceInputModePillActive,
          ChatContextKeys.location.isEqualTo(ChatAgentLocation.Chat),
          ChatContextKeys.currentlyEditing.negate()
        ),
        group: "navigation",
        order: -11
      }
    });
  }
  run(_accessor) {
  }
};
_ChatVoiceInputModeAction.ID = "workbench.action.chat.voiceInputMode";
let ChatVoiceInputModeAction = _ChatVoiceInputModeAction;
const _ChatVoiceInputModeToggleListenAction = class _ChatVoiceInputModeToggleListenAction extends Action2 {
  constructor() {
    super({
      id: _ChatVoiceInputModeToggleListenAction.ID,
      title: localize2("voiceInputMode.holdToTalk", "Voice Mode: Hold to Talk"),
      // A hold-only action cannot be invoked safely from the Command Palette: a
      // mouse click produces no key-up (leaving the turn pending) and a keyboard
      // invocation creates an immediate empty turn. Keep it keybinding-only.
      f1: false,
      precondition: ContextKeyExpr.equals("config.agents.voice.enabled", true),
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Space,
        when: ContextKeyExpr.and(
          ContextKeyExpr.equals("config.agents.voice.enabled", true),
          ChatContextKeys.inChatInput
        )
      }
    });
    this._holdActive = false;
  }
  async run(accessor) {
    if (this._holdActive) {
      return;
    }
    const controller = accessor.get(IVoiceSessionController);
    const keybindingService = accessor.get(IKeybindingService);
    const speechToText = accessor.get(IChatSpeechToTextService);
    if (speechToText.state !== ChatSpeechToTextState.Idle) {
      speechToText.cancel();
    }
    const holdMode = keybindingService.enableKeybindingHoldMode(_ChatVoiceInputModeToggleListenAction.ID);
    const win = getActiveWindow();
    let keyReleased = false;
    const releaseListener = dom.addDisposableListener(win, dom.EventType.KEY_UP, () => {
      keyReleased = true;
    });
    this._holdActive = true;
    try {
      if (!controller.isConnected.get() && !controller.isConnecting.get()) {
        await controller.connect(win);
      }
      if (keyReleased) {
        return;
      }
      if (controller.isConnected.get()) {
        controller.pttDown("explicit", true);
        if (holdMode) {
          await holdMode;
        } else if (!keyReleased) {
          await new Promise((resolve) => {
            const l = dom.addDisposableListener(win, dom.EventType.KEY_UP, () => {
              l.dispose();
              resolve();
            });
          });
        }
        controller.pttUp("explicit", true);
      }
    } finally {
      releaseListener.dispose();
      this._holdActive = false;
    }
  }
};
_ChatVoiceInputModeToggleListenAction.ID = "workbench.action.chat.voiceInputMode.holdToTalk";
let ChatVoiceInputModeToggleListenAction = _ChatVoiceInputModeToggleListenAction;
const SIMULATE_STATES = [
  { id: "off", label: "Off (Disconnected)", state: "off" },
  { id: "connecting", label: "Connecting", state: "connecting" },
  { id: "idle", label: "Connected (Idle)", state: "idle" },
  { id: "listening", label: "Listening", state: "listening" },
  { id: "speaking", label: "Speaking", state: "speaking" },
  { id: "dictating", label: "Dictating", state: "dictating" }
];
function registerVoiceInputModeSimulateActions() {
  const VERSIONS = [
    { version: "handsFree", label: "v4 \u2014 Hands-Free (Auto-Listen)" },
    { version: "keyboardHold", label: "v1 \u2014 Keyboard Hold-to-Talk (Walkie-Talkie)" },
    { version: "buttonHold", label: "v2 \u2014 Button Hold-to-Talk" },
    { version: "clickToggle", label: "v3 \u2014 Button Click-to-Toggle Listening" }
  ];
  for (const { version, label } of VERSIONS) {
    registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.chat.voiceInputMode.simulate.walkthrough.${version}`,
          title: { value: `Voice Input Mode: Prototype Walkthrough \u2014 ${label}`, original: `Voice Input Mode: Prototype Walkthrough \u2014 ${label}` },
          category: { value: "Developer", original: "Developer" },
          precondition: IsDevelopmentContext,
          f1: true
        });
      }
      run(accessor) {
        accessor.get(IVoiceInputModeService).startVoiceStateWalkthrough(version);
      }
    });
  }
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.voiceInputMode.simulate.step",
        title: { value: "Voice Input Mode: Prototype Step (Next State)", original: "Voice Input Mode: Prototype Step (Next State)" },
        category: { value: "Developer", original: "Developer" },
        precondition: IsDevelopmentContext,
        f1: true
      });
    }
    run(accessor) {
      accessor.get(IVoiceInputModeService).stepVoiceStateWalkthrough();
    }
  });
  registerAction2(class extends Action2 {
    constructor() {
      super({
        id: "workbench.action.chat.voiceInputMode.simulate.clear",
        title: { value: "Voice Input Mode: Simulate \u2014 Clear", original: "Voice Input Mode: Simulate \u2014 Clear" },
        category: { value: "Developer", original: "Developer" },
        precondition: IsDevelopmentContext,
        f1: true
      });
    }
    run(accessor) {
      accessor.get(IVoiceInputModeService).clearSimulation();
    }
  });
  for (const { id, label, state } of SIMULATE_STATES) {
    registerAction2(class extends Action2 {
      constructor() {
        super({
          id: `workbench.action.chat.voiceInputMode.simulate.${id}`,
          // Dev-only utility — not localized.
          title: { value: `Voice Input Mode: Simulate \u2014 ${label}`, original: `Voice Input Mode: Simulate \u2014 ${label}` },
          category: { value: "Developer", original: "Developer" },
          precondition: IsDevelopmentContext,
          f1: true
        });
      }
      run(accessor) {
        accessor.get(IVoiceInputModeService).setSimulatedVoiceState(state);
      }
    });
  }
}
let VoiceInputModeActionViewItem = class extends BaseActionViewItem {
  constructor(action, _options, voiceInputModeService, voiceSessionController, commandService, configurationService, keybindingService, contextMenuService, hoverService, micCaptureService, ttsPlaybackService, chatSpeechToTextService, accessibilityService, themeService) {
    super(void 0, action);
    this._options = _options;
    this.voiceInputModeService = voiceInputModeService;
    this.voiceSessionController = voiceSessionController;
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.contextMenuService = contextMenuService;
    this.hoverService = hoverService;
    this.micCaptureService = micCaptureService;
    this.ttsPlaybackService = ttsPlaybackService;
    this.chatSpeechToTextService = chatSpeechToTextService;
    this.accessibilityService = accessibilityService;
    this.themeService = themeService;
    this._voiceBarEls = [];
    this._voiceHovering = false;
    this._voiceLive = false;
    this._listenHoldListening = false;
    this._listenHoldGesture = false;
    this._listenSuppressClick = false;
    this._listenPointerUp = this._register(new MutableDisposable());
    // Progress ring shown over the dictation glyph during an actual on-disk
    // model download (cache miss), mirroring the standalone toolbar button.
    this._dictationRing = this._register(new MutableDisposable());
  }
  _getLabelWithKeybinding(label, commandId) {
    return this.keybindingService.appendKeybinding(label, commandId);
  }
  _updateAriaLabels() {
    this._dictationCell?.setAttribute("aria-label", this._dictationCell.classList.contains("preparing") ? localize("voiceInputMode.dictationPreparing", "Preparing Speech to Text Model\u2026") : this._getLabelWithKeybinding(localize("voiceInputMode.dictation", "Dictation"), DICTATION_TOGGLE_COMMAND_ID));
    this._voiceCell?.setAttribute("aria-label", this._voiceCell.classList.contains("on") ? localize("voiceInputMode.disconnect", "Turn Off Voice Mode") : this._getLabelWithKeybinding(localize("voiceInputMode.voice", "Voice Mode"), VOICE_START_COMMAND_ID));
    this._listenCell?.setAttribute("aria-label", this._listenCell.classList.contains("active") ? this._getLabelWithKeybinding(localize("voiceInputMode.stopListening", "Stop Listening"), ChatVoiceInputModeToggleListenAction.ID) : this._getLabelWithKeybinding(localize("voiceInputMode.startListening", "Start Listening"), ChatVoiceInputModeToggleListenAction.ID));
  }
  /** Set the per-state pill/waveform colors from the theme-derived voice accent. */
  _updateVoiceStateColors(container) {
    const colors = resolveVoiceGlowColors(this.themeService.getColorTheme());
    container.style.setProperty("--voice-color-listening", colors.listening.toString());
    container.style.setProperty("--voice-color-speaking", colors.speaking.toString());
  }
  render(container) {
    super.render(container);
    container.classList.add("monaco-segmented-icon-toggle-container", "chat-voice-input-mode-item");
    this._updateVoiceStateColors(container);
    this._register(this.themeService.onDidColorThemeChange(() => this._updateVoiceStateColors(container)));
    const pill = dom.append(container, dom.$(".monaco-segmented-icon-toggle.chat-voice-input-mode"));
    this._reel = dom.append(pill, dom.$(".monaco-segmented-icon-toggle-reel.chat-voice-input-mode-reel"));
    this._dictationCell = dom.append(this._reel, dom.$("button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.dictation"));
    this._dictationCell.setAttribute("type", "button");
    this._dictationCell.setAttribute("role", "button");
    this._dictationIcon = dom.append(this._dictationCell, dom.$("span.chat-voice-input-mode-icon"));
    this._register(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._dictationCell,
      () => getDictationHoverContent(this._getLabelWithKeybinding(localize("voiceInputMode.dictation", "Dictation"), DICTATION_TOGGLE_COMMAND_ID), this.configurationService)
    ));
    this._register(dom.addDisposableListener(this._dictationCell, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._onClickDictation();
    }));
    this._register(addMicButtonContextMenuListener(
      this._dictationCell,
      () => getDictationContextMenuActions(this.commandService, this.configurationService, this.keybindingService, DICTATION_TOGGLE_COMMAND_ID),
      this.contextMenuService
    ));
    this._register(setupDictationMicGlow(this._dictationCell, this.chatSpeechToTextService, this.accessibilityService, this._options?.isActive, this.themeService));
    this._voiceCell = dom.append(this._reel, dom.$("button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.voice"));
    this._voiceCell.setAttribute("type", "button");
    this._voiceCell.setAttribute("role", "button");
    this._voiceBars = dom.append(this._voiceCell, dom.$("span.chat-voice-input-mode-bars"));
    for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
      this._voiceBarEls.push(dom.append(this._voiceBars, dom.$("span.chat-voice-input-mode-bar")));
    }
    this._register(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._voiceCell,
      () => {
        const connectedish = this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get() || this.voiceInputModeService.simulatedVoiceState.get() === "idle" || this.voiceInputModeService.simulatedVoiceState.get() === "listening" || this.voiceInputModeService.simulatedVoiceState.get() === "speaking";
        return getVoiceModeHoverContent(connectedish ? localize("voiceInputMode.disconnect", "Turn Off Voice Mode") : this._getLabelWithKeybinding(localize("voiceInputMode.voice", "Voice Mode"), VOICE_START_COMMAND_ID));
      }
    ));
    this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._onClickVoicePowerToggle();
    }));
    this._register(addMicButtonContextMenuListener(
      this._voiceCell,
      () => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, VOICE_START_COMMAND_ID),
      this.contextMenuService
    ));
    this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_ENTER, () => {
      this._voiceHovering = true;
      this._stopBarAnimation();
    }));
    this._register(dom.addDisposableListener(this._voiceCell, dom.EventType.MOUSE_LEAVE, () => {
      this._voiceHovering = false;
      this._syncBarAnimation();
    }));
    this._listenCell = dom.append(this._reel, dom.$("button.monaco-segmented-icon-toggle-cell.chat-voice-input-mode-cell.listen"));
    this._listenCell.setAttribute("type", "button");
    this._listenCell.setAttribute("role", "button");
    this._listenIcon = dom.append(this._listenCell, dom.$("span.chat-voice-input-mode-icon"));
    this._updateAriaLabels();
    this._register(this.keybindingService.onDidUpdateKeybindings(() => this._updateAriaLabels()));
    this._register(addMicButtonContextMenuListener(
      this._listenCell,
      () => getVoiceModeContextMenuActions(this.commandService, this.configurationService, this.keybindingService, VOICE_START_COMMAND_ID),
      this.contextMenuService
    ));
    this._register(this.hoverService.setupManagedHover(
      getDefaultHoverDelegate("element"),
      this._listenCell,
      () => this.voiceSessionController.voiceState.get() === "listening" ? this._getLabelWithKeybinding(localize("voiceInputMode.stopListening", "Stop Listening"), ChatVoiceInputModeToggleListenAction.ID) : this._getLabelWithKeybinding(localize("voiceInputMode.startOrHoldListening", "Tap to start, or hold to talk"), ChatVoiceInputModeToggleListenAction.ID)
    ));
    this._register(dom.addDisposableGenericMouseDownListener(this._listenCell, (e) => {
      if (e.button !== 0) {
        return;
      }
      this._onListenPointerDown();
    }));
    this._register(dom.addDisposableListener(this._listenCell, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      if (this._listenSuppressClick) {
        this._listenSuppressClick = false;
        return;
      }
      this._onClickListen();
    }));
    const dictationActive = observableFromEvent(
      this,
      this.chatSpeechToTextService.onDidChangeState,
      () => this.chatSpeechToTextService.state !== ChatSpeechToTextState.Idle
    );
    const dictationPreparing = observableFromEvent(
      this,
      this.chatSpeechToTextService.onDidChangePreparingModel,
      () => this.chatSpeechToTextService.isPreparingModel
    );
    const dictationDownloading = observableFromEvent(
      this,
      this.chatSpeechToTextService.onDidChangeDownloadingModel,
      () => this.chatSpeechToTextService.isDownloadingModel
    );
    this._register(autorun((reader) => {
      const dictationAvailable = this.voiceInputModeService.dictationAvailable.read(reader);
      const voiceAvailable = this.voiceInputModeService.voiceAvailable.read(reader);
      const simHandsFree = this.voiceInputModeService.simulatedHandsFree.read(reader);
      const handsFree = simHandsFree ?? this.voiceInputModeService.handsFree.read(reader);
      const sim = this.voiceInputModeService.simulatedVoiceState.read(reader);
      const isActive = sim !== void 0 || (this._options?.isActive?.read(reader) ?? true);
      let isDictating;
      let connected;
      let connecting;
      let listening;
      let speaking;
      if (sim !== void 0) {
        isDictating = sim === "dictating";
        connecting = sim === "connecting";
        connected = sim === "idle" || sim === "listening" || sim === "speaking";
        listening = sim === "listening";
        speaking = sim === "speaking";
      } else {
        isDictating = isActive && dictationActive.read(reader);
        connected = isActive && this.voiceSessionController.isConnected.read(reader);
        connecting = isActive && this.voiceSessionController.isConnecting.read(reader);
        const voiceState = this.voiceSessionController.voiceState.read(reader);
        listening = connected && voiceState === "listening";
        speaking = connected && voiceState === "speaking";
      }
      const voiceLive = listening || speaking;
      const voiceOn = connected || connecting;
      this._voiceLive = voiceLive;
      const dictationBusy = sim === void 0 && isActive && dictationPreparing.read(reader);
      const showListen = voiceOn && !handsFree;
      const dictationPresent = dictationAvailable && !voiceOn;
      const voicePresent = voiceAvailable && !isDictating && !dictationBusy;
      const listenPresent = showListen;
      const presentCount = (dictationPresent ? 1 : 0) + (voicePresent ? 1 : 0) + (listenPresent ? 1 : 0);
      container.classList.toggle("connected", voiceOn);
      container.classList.toggle("single", presentCount === 1);
      this._dictationCell.classList.toggle("collapsed", !dictationPresent);
      this._dictationCell.classList.toggle("active", isDictating || dictationBusy);
      this._dictationCell.classList.toggle("preparing", dictationBusy);
      this._dictationCell.setAttribute("aria-pressed", String(isDictating));
      this._dictationCell.setAttribute("aria-label", dictationBusy ? localize("voiceInputMode.dictationPreparingCancelable", "Cancel Dictation. {0}", getDictationPreparingLabel(this.chatSpeechToTextService)) : localize("voiceInputMode.dictation", "Dictation"));
      const dictationIcon = dictationBusy ? dictationDownloading.read(reader) ? Codicon.micDownloadCompact : Codicon.loadingCompact : isDictating ? Codicon.micFilled : Codicon.mic;
      this._dictationIcon.className = `chat-voice-input-mode-icon ${ThemeIcon.asClassName(dictationIcon)}`;
      if (dictationBusy && dictationDownloading.read(reader)) {
        if (!this._dictationRing.value) {
          this._dictationRing.value = new DictationDownloadRing(this._dictationCell, this.chatSpeechToTextService);
        }
      } else {
        this._dictationRing.clear();
      }
      this._voiceCell.classList.toggle("collapsed", !voicePresent);
      this._voiceCell.classList.toggle("on", voiceOn);
      this._voiceCell.classList.toggle("idle-on", voiceOn && !voiceLive);
      this._voiceCell.classList.toggle("listening", listening);
      this._voiceCell.classList.toggle("speaking", speaking);
      this._voiceCell.setAttribute("aria-pressed", String(voiceOn));
      this._voiceCell.classList.toggle("sim-hover", this.voiceInputModeService.simulatedHover.read(reader));
      this._listenCell.classList.toggle("collapsed", !listenPresent);
      this._listenCell.classList.toggle("active", listening);
      this._listenCell.classList.toggle("muted", !listening);
      this._listenCell.setAttribute("aria-pressed", String(listening));
      this._listenIcon.className = `chat-voice-input-mode-icon ${ThemeIcon.asClassName(listening ? Codicon.personVoiceFilledCompact : Codicon.personVoiceCompact)}`;
      this._updateAriaLabels();
      this._syncBarAnimation();
    }));
    this._register({ dispose: () => this._stopBarAnimation() });
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => {
      this._stopBarAnimation();
      this._syncBarAnimation();
    }));
  }
  /** Start or stop the audio-reactive bar loop based on live + hover state. */
  _syncBarAnimation() {
    if (this._voiceLive && !this._voiceHovering) {
      this._startBarAnimation();
    } else {
      this._stopBarAnimation();
    }
  }
  /**
   * Animate the waveform bars from live audio. Uses the mic analyser while listening
   * and the TTS analyser while the assistant speaks. When no analyser is available
   * (e.g. reduced motion or pre-capture), the CSS keyframe fallback drives the bars.
   */
  _startBarAnimation() {
    if (this._barAnimationFrame !== void 0) {
      return;
    }
    if (this.accessibilityService.isMotionReduced()) {
      for (const bar of this._voiceBarEls) {
        bar.style.animation = "none";
        bar.style.height = `${WAVEFORM_BAR_MIN_HEIGHT}px`;
      }
      return;
    }
    const win = getWindow(this._voiceCell);
    const tick = () => {
      this._barAnimationFrame = win.requestAnimationFrame(tick);
      const analyser = this.voiceSessionController.voiceState.get() === "speaking" ? this.ttsPlaybackService.analyserNode : this.micCaptureService.analyserNode;
      if (!analyser) {
        for (const bar of this._voiceBarEls) {
          bar.style.removeProperty("height");
          bar.style.removeProperty("animation");
        }
        return;
      }
      if (!this._barData || this._barData.length !== analyser.frequencyBinCount) {
        this._barData = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(this._barData);
      const bins = this._barData.length;
      const step = Math.max(1, Math.floor(bins / this._voiceBarEls.length));
      for (let i = 0; i < this._voiceBarEls.length; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) {
          sum += this._barData[Math.min(bins - 1, i * step + j)];
        }
        const intensity = Math.min(1, sum / step / 180);
        const heightPx = WAVEFORM_BAR_MIN_HEIGHT + intensity * (WAVEFORM_BAR_MAX_HEIGHT - WAVEFORM_BAR_MIN_HEIGHT);
        this._voiceBarEls[i].style.animation = "none";
        this._voiceBarEls[i].style.height = `${heightPx}px`;
      }
    };
    this._barAnimationFrame = win.requestAnimationFrame(tick);
  }
  _stopBarAnimation() {
    if (this._barAnimationFrame !== void 0 && this._voiceCell) {
      getWindow(this._voiceCell).cancelAnimationFrame(this._barAnimationFrame);
    }
    this._barAnimationFrame = void 0;
    for (const bar of this._voiceBarEls) {
      bar.style.removeProperty("height");
      bar.style.removeProperty("animation");
    }
  }
  /**
   * Toggle built-in on-device dictation. By default this runs the shared
   * {@link DICTATION_TOGGLE_COMMAND_ID} command (which targets the last focused
   * chat widget); a host that isn't an `IChatWidget` (e.g. the agents-window
   * composer) can inject its own toggle via {@link IVoiceInputModePillOptions}.
   */
  _toggleDictation() {
    if (this._options?.toggleDictation) {
      this._options.toggleDictation();
    } else {
      this.commandService.executeCommand(DICTATION_TOGGLE_COMMAND_ID);
    }
  }
  _onClickDictation() {
    this.voiceInputModeService.setSelectedMode("dictation");
    if (this.voiceSessionController.isConnected.get() || this.voiceSessionController.isConnecting.get()) {
      this.voiceSessionController.disconnect();
    }
    this._toggleDictation();
  }
  /** The voice button connects or disconnects; hands-free mode starts listening after connect. */
  _onClickVoicePowerToggle() {
    this.voiceInputModeService.setSelectedMode("voice");
    if (this.chatSpeechToTextService.state !== ChatSpeechToTextState.Idle) {
      this._toggleDictation();
    }
    const controller = this.voiceSessionController;
    if (controller.isConnected.get() || controller.isConnecting.get()) {
      controller.disconnect();
    } else {
      const targetWindow = getWindow(this._voiceCell);
      controller.connect(targetWindow).catch(() => {
      });
    }
  }
  /** Tap the listen cell to toggle listening on and off. */
  _onClickListen() {
    const controller = this.voiceSessionController;
    if (!controller.isConnected.get()) {
      return;
    }
    if (controller.voiceState.get() === "listening") {
      controller.stopListening();
    } else {
      controller.pttDown();
      controller.pttUp();
    }
  }
  _onListenPointerDown() {
    const controller = this.voiceSessionController;
    if (!controller.isConnected.get() || controller.voiceState.get() === "listening") {
      return;
    }
    this._listenHoldGesture = true;
    this._listenHoldListening = false;
    this._listenSuppressClick = false;
    const win = getWindow(this._listenCell);
    this._listenHoldTimer = win.setTimeout(() => {
      this._listenHoldTimer = void 0;
      if (controller.isConnected.get()) {
        this._listenHoldListening = true;
        controller.pttDown("explicit", true);
      }
    }, VoiceInputModeActionViewItem.HOLD_THRESHOLD_MS);
    this._listenPointerUp.value = dom.addDisposableGenericMouseUpListener(win, (e) => this._endListenPointerHold(e));
  }
  _endListenPointerHold(e) {
    if (!this._listenHoldGesture) {
      return;
    }
    this._listenHoldGesture = false;
    this._listenPointerUp.clear();
    if (this._listenHoldTimer !== void 0) {
      getWindow(this._listenCell).clearTimeout(this._listenHoldTimer);
      this._listenHoldTimer = void 0;
      this._listenSuppressClick = false;
    } else if (this._listenHoldListening) {
      this._listenHoldListening = false;
      const releasedOnCell = !!e?.target && this._listenCell.contains(e.target);
      this._listenSuppressClick = releasedOnCell;
      this.voiceSessionController.pttUp("explicit", true);
    }
  }
  dispose() {
    if (this._listenHoldGesture || this._listenHoldTimer !== void 0) {
      this._endListenPointerHold();
    }
    super.dispose();
  }
};
/** Threshold (ms) separating a quick tap (toggle) from a press-and-hold (talk). */
VoiceInputModeActionViewItem.HOLD_THRESHOLD_MS = 180;
VoiceInputModeActionViewItem = __decorateClass([
  __decorateParam(2, IVoiceInputModeService),
  __decorateParam(3, IVoiceSessionController),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IContextMenuService),
  __decorateParam(8, IHoverService),
  __decorateParam(9, IMicCaptureService),
  __decorateParam(10, ITtsPlaybackService),
  __decorateParam(11, IChatSpeechToTextService),
  __decorateParam(12, IAccessibilityService),
  __decorateParam(13, IThemeService)
], VoiceInputModeActionViewItem);
function isVoiceInputModeAvailable(voiceInputModeService) {
  const dictation = voiceInputModeService.dictationAvailable.get();
  const voice = voiceInputModeService.voiceAvailable.get();
  if (dictation && voice) {
    return "both";
  }
  if (dictation) {
    return "dictation";
  }
  if (voice) {
    return "voice";
  }
  return void 0;
}
export {
  ChatVoiceInputModeAction,
  ChatVoiceInputModeToggleListenAction,
  VoiceInputModeActionViewItem,
  isVoiceInputModeAvailable,
  registerVoiceInputModeSimulateActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUlucHV0TW9kZS92b2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2VnbWVudGVkSWNvblRvZ2dsZS9zZWdtZW50ZWRJY29uVG9nZ2xlLmNzcyc7XG5pbXBvcnQgJy4vbWVkaWEvdm9pY2VJbnB1dE1vZGUuY3NzJztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdywgZ2V0V2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSXNEZXZlbG9wbWVudENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlc29sdmVWb2ljZUdsb3dDb2xvcnMgfSBmcm9tICcuLi92b2ljZUNsaWVudC92b2ljZUdsb3cuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElWb2ljZVNlc3Npb25Db250cm9sbGVyIH0gZnJvbSAnLi4vdm9pY2VDbGllbnQvdm9pY2VTZXNzaW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJTWljQ2FwdHVyZVNlcnZpY2UgfSBmcm9tICcuLi92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVHRzUGxheWJhY2tTZXJ2aWNlIH0gZnJvbSAnLi4vdm9pY2VDbGllbnQvdHRzUGxheWJhY2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTcGVlY2hUb1RleHRTdGF0ZSwgSUNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlIH0gZnJvbSAnLi4vc3BlZWNoVG9UZXh0L2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHNldHVwRGljdGF0aW9uTWljR2xvdyB9IGZyb20gJy4uL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25NaWNHbG93LmpzJztcbmltcG9ydCB7IERpY3RhdGlvbkRvd25sb2FkUmluZywgZ2V0RGljdGF0aW9uUHJlcGFyaW5nTGFiZWwgfSBmcm9tICcuLi9zcGVlY2hUb1RleHQvZGljdGF0aW9uRG93bmxvYWRSaW5nLmpzJztcbmltcG9ydCB7IGdldERpY3RhdGlvbkhvdmVyQ29udGVudCwgZ2V0Vm9pY2VNb2RlSG92ZXJDb250ZW50IH0gZnJvbSAnLi4vc3BlZWNoVG9UZXh0L21pY0J1dHRvbkhvdmVycy5qcyc7XG5pbXBvcnQgeyBhZGRNaWNCdXR0b25Db250ZXh0TWVudUxpc3RlbmVyLCBnZXREaWN0YXRpb25Db250ZXh0TWVudUFjdGlvbnMsIGdldFZvaWNlTW9kZUNvbnRleHRNZW51QWN0aW9ucyB9IGZyb20gJy4uL3NwZWVjaFRvVGV4dC9taWNCdXR0b25NZW51QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVm9pY2VJbnB1dE1vZGVTZXJ2aWNlLCBTaW11bGF0ZWRWb2ljZVN0YXRlLCBWb2ljZUlucHV0TW9kZSwgVm9pY2VXYWxrdGhyb3VnaFZlcnNpb24gfSBmcm9tICcuL3ZvaWNlSW5wdXRNb2RlLmpzJztcbmltcG9ydCB7IFNlZ21lbnRlZFZvaWNlSW5wdXRNb2RlUGlsbEFjdGl2ZSB9IGZyb20gJy4vdm9pY2VJbnB1dE1vZGVDb250ZXh0S2V5cy5qcyc7XG5cbi8qKiBCdWlsdC1pbiBvbi1kZXZpY2UgZGljdGF0aW9uIHRvZ2dsZSAoc3RhcnQvc3RvcCkuICovXG5jb25zdCBESUNUQVRJT05fVE9HR0xFX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRvZ2dsZVNwZWVjaFRvVGV4dCc7XG5cbi8qKlxuICogU3RhYmxlIGNvbW1hbmQgdGhlIFZvaWNlIE1vZGUgXCJDb25maWd1cmUgS2V5YmluZGluZ1wiIGNvbnRleHQtbWVudSBlbnRyeSB0YXJnZXRzLlxuICogVGhlIHJlbmRlcmVkIHZvaWNlIGFmZm9yZGFuY2Ugc3dhcHMgYmV0d2VlbiBzdGF0ZXMsIGJ1dCB0aGUga2V5YmluZGluZyBsaXZlcyBvblxuICogdGhlIHN0YXJ0IGNvbW1hbmQsIHNvIHRhcmdldCBpdCBpbiBldmVyeSBzdGF0ZS5cbiAqL1xuY29uc3QgVk9JQ0VfU1RBUlRfQ09NTUFORF9JRCA9ICdhZ2VudHNWb2ljZS5zdGFydFZvaWNlSW5DaGF0JztcblxuLyoqIE51bWJlciBvZiBhbmltYXRlZCB3YXZlZm9ybSBiYXJzIHNob3duIGluIHRoZSB2b2ljZSBzZWdtZW50LiAqL1xuY29uc3QgV0FWRUZPUk1fQkFSX0NPVU5UID0gNTtcblxuLyoqXG4gKiBIZWlnaHQgYm91bmRzIChweCkgb2YgYW4gYXVkaW8tcmVhY3RpdmUgd2F2ZWZvcm0gYmFyLiBUaGVzZSBtaXJyb3IgdGhlXG4gKiBgY2hhdC12b2ljZS1pbnB1dC1tb2RlLWVxYCBrZXlmcmFtZXMgaW4gYHZvaWNlSW5wdXRNb2RlLmNzc2AsIHdoaWNoIGRyaXZlIHRoZSBiYXJzXG4gKiB3aGVuZXZlciBubyBhbmFseXNlciBpcyBhdmFpbGFibGUsIHNvIHRoZSB0d28gbXVzdCBiZSBrZXB0IGluIHN5bmM7IGJvdGggYXJlIHNpemVkXG4gKiBhZ2FpbnN0IHRoZSAxMnB4IHdhdmVmb3JtIGJveC5cbiAqL1xuY29uc3QgV0FWRUZPUk1fQkFSX01JTl9IRUlHSFQgPSAyO1xuY29uc3QgV0FWRUZPUk1fQkFSX01BWF9IRUlHSFQgPSAxMDtcblxuLyoqXG4gKiBNZW51IHBsYWNlaG9sZGVyIGFjdGlvbiBmb3IgdGhlIHNlZ21lbnRlZCB2b2ljZSBpbnB1dCBtb2RlIHRvZ2dsZS4gVGhlIGFjdHVhbCBVSSBpc1xuICogcmVuZGVyZWQgYnkge0BsaW5rIFZvaWNlSW5wdXRNb2RlQWN0aW9uVmlld0l0ZW19OyBydW5uaW5nIHRoZSBhY3Rpb24gaXMgYSBuby1vcC5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYXRWb2ljZUlucHV0TW9kZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudm9pY2VJbnB1dE1vZGUnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBDaGF0Vm9pY2VJbnB1dE1vZGVBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd2b2ljZUlucHV0TW9kZScsIFwiVm9pY2UgSW5wdXQgTW9kZVwiKSxcblx0XHRcdGljb246IENvZGljb24ubWljLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBTZWdtZW50ZWRWb2ljZUlucHV0TW9kZVBpbGxBY3RpdmUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdEV4ZWN1dGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRTZWdtZW50ZWRWb2ljZUlucHV0TW9kZVBpbGxBY3RpdmUsXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmxvY2F0aW9uLmlzRXF1YWxUbyhDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSxcblx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY3VycmVudGx5RWRpdGluZy5uZWdhdGUoKSxcblx0XHRcdFx0KSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IC0xMSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRydW4oX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Ly8gTm8tb3AgXHUyMDE0IGludGVyYWN0aW9uIGhhbmRsZWQgYnkgVm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbS5cblx0fVxufVxuXG4vKipcbiAqIEhvbGQtdG8tdGFsayAod2Fsa2llLXRhbGtpZSkga2V5YmluZGluZyBmb3IgdGhlIHNlZ21lbnRlZCB2b2ljZSB0b2dnbGUuIFdoaWxlIHRoZSBrZXlcbiAqIGlzIGhlbGQgdGhlIG1pY3JvcGhvbmUgbGlzdGVuczsgcmVsZWFzaW5nIGl0IGVuZHMgdGhlIHR1cm4gYW5kIHNlbmRzLiBIb2xkaW5nIGFsc29cbiAqIGludGVycnVwdHMgdGhlIGFzc2lzdGFudCB0byBiYXJnZSBpbi4gV29ya3MgdGhlIHNhbWUgaW4gaGFuZHMtZnJlZSBhbmQgbWFudWFsIG1vZGVzIGFuZFxuICogbmV2ZXIgZGlzY29ubmVjdHMuIEF1dG8tY29ubmVjdHMgb24gdGhlIGZpcnN0IGhvbGQgc28gYSBzaW5nbGUgc2hvcnRjdXQgc3RhcnRzIHRhbGtpbmcuXG4gKi9cbmV4cG9ydCBjbGFzcyBDaGF0Vm9pY2VJbnB1dE1vZGVUb2dnbGVMaXN0ZW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlSW5wdXRNb2RlLmhvbGRUb1RhbGsnO1xuXG5cdHByaXZhdGUgX2hvbGRBY3RpdmUgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQ2hhdFZvaWNlSW5wdXRNb2RlVG9nZ2xlTGlzdGVuQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndm9pY2VJbnB1dE1vZGUuaG9sZFRvVGFsaycsIFwiVm9pY2UgTW9kZTogSG9sZCB0byBUYWxrXCIpLFxuXHRcdFx0Ly8gQSBob2xkLW9ubHkgYWN0aW9uIGNhbm5vdCBiZSBpbnZva2VkIHNhZmVseSBmcm9tIHRoZSBDb21tYW5kIFBhbGV0dGU6IGFcblx0XHRcdC8vIG1vdXNlIGNsaWNrIHByb2R1Y2VzIG5vIGtleS11cCAobGVhdmluZyB0aGUgdHVybiBwZW5kaW5nKSBhbmQgYSBrZXlib2FyZFxuXHRcdFx0Ly8gaW52b2NhdGlvbiBjcmVhdGVzIGFuIGltbWVkaWF0ZSBlbXB0eSB0dXJuLiBLZWVwIGl0IGtleWJpbmRpbmctb25seS5cblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdjb25maWcuYWdlbnRzLnZvaWNlLmVuYWJsZWQnLCB0cnVlKSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5TcGFjZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLmFnZW50cy52b2ljZS5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLmluQ2hhdElucHV0LFxuXHRcdFx0XHQpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIElnbm9yZSBrZXktcmVwZWF0IHJlLWVudHJ5IHdoaWxlIGEgaG9sZCBpcyBhbHJlYWR5IGluIHByb2dyZXNzLlxuXHRcdGlmICh0aGlzLl9ob2xkQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBhY2Nlc3Nvci5nZXQoSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElLZXliaW5kaW5nU2VydmljZSk7XG5cblx0XHQvLyBFbmZvcmNlIG11dHVhbCBleGNsdXNpb246IGlmIGJ1aWx0LWluIGRpY3RhdGlvbiBpcyByZWNvcmRpbmcsIGNhbmNlbCBpdFxuXHRcdC8vIGJlZm9yZSBzdGFydGluZyB2b2ljZSBjYXB0dXJlIHNvIHRoZSB0d28gbmV2ZXIgcmVjb3JkIHNpbXVsdGFuZW91c2x5LlxuXHRcdGNvbnN0IHNwZWVjaFRvVGV4dCA9IGFjY2Vzc29yLmdldChJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UpO1xuXHRcdGlmIChzcGVlY2hUb1RleHQuc3RhdGUgIT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlKSB7XG5cdFx0XHRzcGVlY2hUb1RleHQuY2FuY2VsKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUga2V5LWhvbGQgRklSU1QgKHN5bmNocm9ub3VzbHkpIFx1MjAxNCBpdCBtdXN0IGJlIHJlcXVlc3RlZCBiZWZvcmUgYW55IGF3YWl0LlxuXHRcdGNvbnN0IGhvbGRNb2RlID0ga2V5YmluZGluZ1NlcnZpY2UuZW5hYmxlS2V5YmluZGluZ0hvbGRNb2RlKENoYXRWb2ljZUlucHV0TW9kZVRvZ2dsZUxpc3RlbkFjdGlvbi5JRCk7XG5cblx0XHRjb25zdCB3aW4gPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRsZXQga2V5UmVsZWFzZWQgPSBmYWxzZTtcblx0XHRjb25zdCByZWxlYXNlTGlzdGVuZXIgPSBkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgZG9tLkV2ZW50VHlwZS5LRVlfVVAsICgpID0+IHtcblx0XHRcdGtleVJlbGVhc2VkID0gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2hvbGRBY3RpdmUgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBBdXRvLWNvbm5lY3Qgb24gdGhlIGZpcnN0IGhvbGQgc28gdXNlcnMgY2FuIHN0YXJ0IHRhbGtpbmcgd2l0aCBvbmUgc2hvcnRjdXQuXG5cdFx0XHRpZiAoIWNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkgJiYgIWNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLmdldCgpKSB7XG5cdFx0XHRcdGF3YWl0IGNvbnRyb2xsZXIuY29ubmVjdCh3aW4pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGtleVJlbGVhc2VkKSB7XG5cdFx0XHRcdC8vIFRoZSBzaG9ydGN1dCB3YXMgcmVsZWFzZWQgd2hpbGUgdGhlIGNvbm5lY3Rpb24gd2FzIHN0aWxsIGJlaW5nXG5cdFx0XHRcdC8vIGVzdGFibGlzaGVkLCBzbyB0aGUgaG9sZCBhbHJlYWR5IGVuZGVkLiBTdGFydGluZyBwdXNoLXRvLXRhbGsgbm93XG5cdFx0XHRcdC8vIHdvdWxkIGltbWVkaWF0ZWx5IGZvcmNlIGFuIGVtcHR5IHR1cm4sIHNvIGJhaWwgb3V0IGluc3RlYWQuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpKSB7XG5cdFx0XHRcdGNvbnRyb2xsZXIucHR0RG93bignZXhwbGljaXQnLCB0cnVlKTsgIC8vIGZvcmNlIGNsZWFuIG5ldyB0dXJuXG5cdFx0XHRcdGlmIChob2xkTW9kZSkge1xuXHRcdFx0XHRcdGF3YWl0IGhvbGRNb2RlOyAgICAgICAgLy8gd2FpdCBmb3Iga2V5IHJlbGVhc2Vcblx0XHRcdFx0fSBlbHNlIGlmICgha2V5UmVsZWFzZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGwgPSBkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbiwgZG9tLkV2ZW50VHlwZS5LRVlfVVAsICgpID0+IHtcblx0XHRcdFx0XHRcdFx0bC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRyb2xsZXIucHR0VXAoJ2V4cGxpY2l0JywgdHJ1ZSk7ICAgIC8vIGZvcmNlIGZpbmlzaCB0dXJuIGFuZCBzZW5kXG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlbGVhc2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9ob2xkQWN0aXZlID0gZmFsc2U7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogRGV2L3ByZXZpZXcgY29tbWFuZHMgdG8gZm9yY2UgdGhlIHZvaWNlLWNlbGwgdmlzdWFsIHN0YXRlcyB3aXRob3V0IGEgbGl2ZSBiYWNrZW5kXG4gKiBjb25uZWN0aW9uLiBSZWdpc3RlcmVkIHZpYSB7QGxpbmsgcmVnaXN0ZXJWb2ljZUlucHV0TW9kZVNpbXVsYXRlQWN0aW9uc30uXG4gKi9cbmNvbnN0IFNJTVVMQVRFX1NUQVRFUzogeyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBsYWJlbDogc3RyaW5nOyByZWFkb25seSBzdGF0ZTogU2ltdWxhdGVkVm9pY2VTdGF0ZSB8IHVuZGVmaW5lZCB9W10gPSBbXG5cdHsgaWQ6ICdvZmYnLCBsYWJlbDogJ09mZiAoRGlzY29ubmVjdGVkKScsIHN0YXRlOiAnb2ZmJyB9LFxuXHR7IGlkOiAnY29ubmVjdGluZycsIGxhYmVsOiAnQ29ubmVjdGluZycsIHN0YXRlOiAnY29ubmVjdGluZycgfSxcblx0eyBpZDogJ2lkbGUnLCBsYWJlbDogJ0Nvbm5lY3RlZCAoSWRsZSknLCBzdGF0ZTogJ2lkbGUnIH0sXG5cdHsgaWQ6ICdsaXN0ZW5pbmcnLCBsYWJlbDogJ0xpc3RlbmluZycsIHN0YXRlOiAnbGlzdGVuaW5nJyB9LFxuXHR7IGlkOiAnc3BlYWtpbmcnLCBsYWJlbDogJ1NwZWFraW5nJywgc3RhdGU6ICdzcGVha2luZycgfSxcblx0eyBpZDogJ2RpY3RhdGluZycsIGxhYmVsOiAnRGljdGF0aW5nJywgc3RhdGU6ICdkaWN0YXRpbmcnIH0sXG5dO1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJWb2ljZUlucHV0TW9kZVNpbXVsYXRlQWN0aW9ucygpOiB2b2lkIHtcblx0Ly8gUHJvdG90eXBlIHdhbGt0aHJvdWdocyBcdTIwMTQgb25lIHBlciBwdXNoLXRvLXRhbGsgZGVzaWduLiBFYWNoIGF1dG8tcGxheXMgKGxvb3BpbmcpXG5cdC8vIHRocm91Z2ggdGhlIGZ1bGwgbGlmZWN5Y2xlIHdpdGggYWNjdXJhdGUgYmFycywgY29sb3JzLCBob3ZlciBwcmV2aWV3cyBhbmQgdGhlIHJlYWxcblx0Ly8gaW5wdXQtYm94IGdsb3csIHNvIHRoZSBmb3VyIGludGVyYWN0aW9uIG1vZGVscyBjYW4gYmUgY29tcGFyZWQgc2lkZSBieSBzaWRlLlxuXHRjb25zdCBWRVJTSU9OUzogeyByZWFkb25seSB2ZXJzaW9uOiBWb2ljZVdhbGt0aHJvdWdoVmVyc2lvbjsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyB9W10gPSBbXG5cdFx0eyB2ZXJzaW9uOiAnaGFuZHNGcmVlJywgbGFiZWw6ICd2NCBcXHUyMDE0IEhhbmRzLUZyZWUgKEF1dG8tTGlzdGVuKScgfSxcblx0XHR7IHZlcnNpb246ICdrZXlib2FyZEhvbGQnLCBsYWJlbDogJ3YxIFxcdTIwMTQgS2V5Ym9hcmQgSG9sZC10by1UYWxrIChXYWxraWUtVGFsa2llKScgfSxcblx0XHR7IHZlcnNpb246ICdidXR0b25Ib2xkJywgbGFiZWw6ICd2MiBcXHUyMDE0IEJ1dHRvbiBIb2xkLXRvLVRhbGsnIH0sXG5cdFx0eyB2ZXJzaW9uOiAnY2xpY2tUb2dnbGUnLCBsYWJlbDogJ3YzIFxcdTIwMTQgQnV0dG9uIENsaWNrLXRvLVRvZ2dsZSBMaXN0ZW5pbmcnIH0sXG5cdF07XG5cdGZvciAoY29uc3QgeyB2ZXJzaW9uLCBsYWJlbCB9IG9mIFZFUlNJT05TKSB7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0LnZvaWNlSW5wdXRNb2RlLnNpbXVsYXRlLndhbGt0aHJvdWdoLiR7dmVyc2lvbn1gLFxuXHRcdFx0XHRcdHRpdGxlOiB7IHZhbHVlOiBgVm9pY2UgSW5wdXQgTW9kZTogUHJvdG90eXBlIFdhbGt0aHJvdWdoIFxcdTIwMTQgJHtsYWJlbH1gLCBvcmlnaW5hbDogYFZvaWNlIElucHV0IE1vZGU6IFByb3RvdHlwZSBXYWxrdGhyb3VnaCBcXHUyMDE0ICR7bGFiZWx9YCB9LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiB7IHZhbHVlOiAnRGV2ZWxvcGVyJywgb3JpZ2luYWw6ICdEZXZlbG9wZXInIH0sXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBJc0RldmVsb3BtZW50Q29udGV4dCxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElWb2ljZUlucHV0TW9kZVNlcnZpY2UpLnN0YXJ0Vm9pY2VTdGF0ZVdhbGt0aHJvdWdoKHZlcnNpb24pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gTWFudWFsIHN0ZXAgXHUyMDE0IGFkdmFuY2UgdG8gdGhlIG5leHQgc3RhdGUgb24gZWFjaCBpbnZvY2F0aW9uIChiaW5kIGEga2V5IHRvIGNsaWNrIHRocm91Z2gpLlxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudm9pY2VJbnB1dE1vZGUuc2ltdWxhdGUuc3RlcCcsXG5cdFx0XHRcdHRpdGxlOiB7IHZhbHVlOiAnVm9pY2UgSW5wdXQgTW9kZTogUHJvdG90eXBlIFN0ZXAgKE5leHQgU3RhdGUpJywgb3JpZ2luYWw6ICdWb2ljZSBJbnB1dCBNb2RlOiBQcm90b3R5cGUgU3RlcCAoTmV4dCBTdGF0ZSknIH0sXG5cdFx0XHRcdGNhdGVnb3J5OiB7IHZhbHVlOiAnRGV2ZWxvcGVyJywgb3JpZ2luYWw6ICdEZXZlbG9wZXInIH0sXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogSXNEZXZlbG9wbWVudENvbnRleHQsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElWb2ljZUlucHV0TW9kZVNlcnZpY2UpLnN0ZXBWb2ljZVN0YXRlV2Fsa3Rocm91Z2goKTtcblx0XHR9XG5cdH0pO1xuXG5cdC8vIENsZWFyIFx1MjAxNCBzdG9wIGFueSB3YWxrdGhyb3VnaCBhbmQgcmV0dXJuIHRvIHRoZSByZWFsIHN0YXRlLlxuXHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdHN1cGVyKHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudm9pY2VJbnB1dE1vZGUuc2ltdWxhdGUuY2xlYXInLFxuXHRcdFx0XHR0aXRsZTogeyB2YWx1ZTogJ1ZvaWNlIElucHV0IE1vZGU6IFNpbXVsYXRlIFxcdTIwMTQgQ2xlYXInLCBvcmlnaW5hbDogJ1ZvaWNlIElucHV0IE1vZGU6IFNpbXVsYXRlIFxcdTIwMTQgQ2xlYXInIH0sXG5cdFx0XHRcdGNhdGVnb3J5OiB7IHZhbHVlOiAnRGV2ZWxvcGVyJywgb3JpZ2luYWw6ICdEZXZlbG9wZXInIH0sXG5cdFx0XHRcdHByZWNvbmRpdGlvbjogSXNEZXZlbG9wbWVudENvbnRleHQsXG5cdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdFx0YWNjZXNzb3IuZ2V0KElWb2ljZUlucHV0TW9kZVNlcnZpY2UpLmNsZWFyU2ltdWxhdGlvbigpO1xuXHRcdH1cblx0fSk7XG5cblx0Zm9yIChjb25zdCB7IGlkLCBsYWJlbCwgc3RhdGUgfSBvZiBTSU1VTEFURV9TVEFURVMpIHtcblx0XHRyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQudm9pY2VJbnB1dE1vZGUuc2ltdWxhdGUuJHtpZH1gLFxuXHRcdFx0XHRcdC8vIERldi1vbmx5IHV0aWxpdHkgXHUyMDE0IG5vdCBsb2NhbGl6ZWQuXG5cdFx0XHRcdFx0dGl0bGU6IHsgdmFsdWU6IGBWb2ljZSBJbnB1dCBNb2RlOiBTaW11bGF0ZSBcXHUyMDE0ICR7bGFiZWx9YCwgb3JpZ2luYWw6IGBWb2ljZSBJbnB1dCBNb2RlOiBTaW11bGF0ZSBcXHUyMDE0ICR7bGFiZWx9YCB9LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiB7IHZhbHVlOiAnRGV2ZWxvcGVyJywgb3JpZ2luYWw6ICdEZXZlbG9wZXInIH0sXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBJc0RldmVsb3BtZW50Q29udGV4dCxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElWb2ljZUlucHV0TW9kZVNlcnZpY2UpLnNldFNpbXVsYXRlZFZvaWNlU3RhdGUoc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogT3B0aW9uYWwgaG9zdCBob29rcyBmb3IgcmV1c2luZyB7QGxpbmsgVm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbX0gb3V0c2lkZSB0aGVcbiAqIG1haW4gY2hhdCBpbnB1dCAoZS5nLiB0aGUgYWdlbnRzLXdpbmRvdyBuZXctc2Vzc2lvbiBjb21wb3NlciksIHdoZXJlIGRpY3RhdGlvbiBhbmRcbiAqIHZvaWNlIG11c3QgdGFyZ2V0IHRoYXQgc3VyZmFjZSByYXRoZXIgdGhhbiB0aGUgbGFzdCBmb2N1c2VkIGNoYXQgd2lkZ2V0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElWb2ljZUlucHV0TW9kZVBpbGxPcHRpb25zIHtcblx0LyoqIFRvZ2dsZSBkaWN0YXRpb24gZm9yIHRoZSBob3N0IHN1cmZhY2UgKGRlZmF1bHRzIHRvIHRoZSBzaGFyZWQgdG9nZ2xlIGNvbW1hbmQpLiAqL1xuXHRyZWFkb25seSB0b2dnbGVEaWN0YXRpb24/OiAoKSA9PiB2b2lkO1xuXHQvKiogV2hldGhlciB0aGlzIGlzIHRoZSBmb2N1c2VkIG9yIGxhc3QtZm9jdXNlZCBjaGF0IGlucHV0IHRoYXQgb3ducyBsaXZlIHN0YXRlLiAqL1xuXHRyZWFkb25seSBpc0FjdGl2ZT86IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xufVxuXG4vKipcbiAqIEEgc2luZ2xlIHNlZ21lbnRlZCBjb250cm9sIGluIHRoZSBjaGF0IGlucHV0IHRoYXQgaG9zdHMgYm90aCB2b2ljZSBpbnB1dCBtb2RlczpcbiAqIGEgRGljdGF0aW9uIHNlZ21lbnQgKHNwZWVjaC10by10ZXh0IGludG8gdGhlIGlucHV0KSBhbmQgYSBWb2ljZSBNb2RlIHNlZ21lbnQgKGxpdmVcbiAqIGNvbnZlcnNhdGlvbmFsIGFnZW50KS4gT25seSBvbmUgbW9kZSBjYW4gYmUgYWN0aXZlIGF0IGEgdGltZSBcdTIwMTQgYWN0aXZhdGluZyBvbmUgc3RvcHNcbiAqIHRoZSBvdGhlci4gQm90aCBzZWdtZW50cyBzdGF5IHZpc2libGUgKHdoZW4gYXZhaWxhYmxlKSBzbyB1c2VycyBkaXNjb3ZlciBib3RoIG1vZGVzLlxuICovXG5leHBvcnQgY2xhc3MgVm9pY2VJbnB1dE1vZGVBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBfcmVlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2RpY3RhdGlvbkNlbGw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92b2ljZUNlbGw6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9saXN0ZW5DZWxsOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGljdGF0aW9uSWNvbjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xpc3Rlbkljb246IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92b2ljZUJhcnM6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92b2ljZUJhckVsczogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIF9iYXJBbmltYXRpb25GcmFtZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF92b2ljZUhvdmVyaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX3ZvaWNlTGl2ZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9iYXJEYXRhOiBVaW50OEFycmF5IHwgdW5kZWZpbmVkO1xuXG5cdC8vIEhvbGQtdG8tdGFsayBnZXN0dXJlIHN0YXRlIGZvciB0aGUgbGlzdGVuIGNlbGw6IHByZXNzLWFuZC1ob2xkIHJlY29yZHMsIHJlbGVhc2Ugc2VuZHMuXG5cdHByaXZhdGUgX2xpc3RlbkhvbGRUaW1lcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9saXN0ZW5Ib2xkTGlzdGVuaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2xpc3RlbkhvbGRHZXN0dXJlID0gZmFsc2U7XG5cdHByaXZhdGUgX2xpc3RlblN1cHByZXNzQ2xpY2sgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdGVuUG9pbnRlclVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHQvLyBQcm9ncmVzcyByaW5nIHNob3duIG92ZXIgdGhlIGRpY3RhdGlvbiBnbHlwaCBkdXJpbmcgYW4gYWN0dWFsIG9uLWRpc2tcblx0Ly8gbW9kZWwgZG93bmxvYWQgKGNhY2hlIG1pc3MpLCBtaXJyb3JpbmcgdGhlIHN0YW5kYWxvbmUgdG9vbGJhciBidXR0b24uXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpY3RhdGlvblJpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGljdGF0aW9uRG93bmxvYWRSaW5nPigpKTtcblxuXHRwcml2YXRlIF9nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxhYmVsOiBzdHJpbmcsIGNvbW1hbmRJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5rZXliaW5kaW5nU2VydmljZS5hcHBlbmRLZXliaW5kaW5nKGxhYmVsLCBjb21tYW5kSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQXJpYUxhYmVscygpOiB2b2lkIHtcblx0XHR0aGlzLl9kaWN0YXRpb25DZWxsPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLl9kaWN0YXRpb25DZWxsLmNsYXNzTGlzdC5jb250YWlucygncHJlcGFyaW5nJylcblx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpY3RhdGlvblByZXBhcmluZycsIFwiUHJlcGFyaW5nIFNwZWVjaCB0byBUZXh0IE1vZGVsXHUyMDI2XCIpXG5cdFx0XHQ6IHRoaXMuX2dldExhYmVsV2l0aEtleWJpbmRpbmcobG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpY3RhdGlvbicsIFwiRGljdGF0aW9uXCIpLCBESUNUQVRJT05fVE9HR0xFX0NPTU1BTkRfSUQpKTtcblx0XHR0aGlzLl92b2ljZUNlbGw/LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuX3ZvaWNlQ2VsbC5jbGFzc0xpc3QuY29udGFpbnMoJ29uJylcblx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpc2Nvbm5lY3QnLCBcIlR1cm4gT2ZmIFZvaWNlIE1vZGVcIilcblx0XHRcdDogdGhpcy5fZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUudm9pY2UnLCBcIlZvaWNlIE1vZGVcIiksIFZPSUNFX1NUQVJUX0NPTU1BTkRfSUQpKTtcblx0XHR0aGlzLl9saXN0ZW5DZWxsPy5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLl9saXN0ZW5DZWxsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJylcblx0XHRcdD8gdGhpcy5fZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUuc3RvcExpc3RlbmluZycsIFwiU3RvcCBMaXN0ZW5pbmdcIiksIENoYXRWb2ljZUlucHV0TW9kZVRvZ2dsZUxpc3RlbkFjdGlvbi5JRClcblx0XHRcdDogdGhpcy5fZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUuc3RhcnRMaXN0ZW5pbmcnLCBcIlN0YXJ0IExpc3RlbmluZ1wiKSwgQ2hhdFZvaWNlSW5wdXRNb2RlVG9nZ2xlTGlzdGVuQWN0aW9uLklEKSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVZvaWNlSW5wdXRNb2RlUGlsbE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElWb2ljZUlucHV0TW9kZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2b2ljZUlucHV0TW9kZVNlcnZpY2U6IElWb2ljZUlucHV0TW9kZVNlcnZpY2UsXG5cdFx0QElWb2ljZVNlc3Npb25Db250cm9sbGVyIHByaXZhdGUgcmVhZG9ubHkgdm9pY2VTZXNzaW9uQ29udHJvbGxlcjogSVZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElNaWNDYXB0dXJlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1pY0NhcHR1cmVTZXJ2aWNlOiBJTWljQ2FwdHVyZVNlcnZpY2UsXG5cdFx0QElUdHNQbGF5YmFja1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0dHNQbGF5YmFja1NlcnZpY2U6IElUdHNQbGF5YmFja1NlcnZpY2UsXG5cdFx0QElDaGF0U3BlZWNoVG9UZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlOiBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uKTtcblx0fVxuXG5cdC8qKiBTZXQgdGhlIHBlci1zdGF0ZSBwaWxsL3dhdmVmb3JtIGNvbG9ycyBmcm9tIHRoZSB0aGVtZS1kZXJpdmVkIHZvaWNlIGFjY2VudC4gKi9cblx0cHJpdmF0ZSBfdXBkYXRlVm9pY2VTdGF0ZUNvbG9ycyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29sb3JzID0gcmVzb2x2ZVZvaWNlR2xvd0NvbG9ycyh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12b2ljZS1jb2xvci1saXN0ZW5pbmcnLCBjb2xvcnMubGlzdGVuaW5nLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12b2ljZS1jb2xvci1zcGVha2luZycsIGNvbG9ycy5zcGVha2luZy50b1N0cmluZygpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vbmFjby1zZWdtZW50ZWQtaWNvbi10b2dnbGUtY29udGFpbmVyJywgJ2NoYXQtdm9pY2UtaW5wdXQtbW9kZS1pdGVtJyk7XG5cblx0XHQvLyBEcml2ZSB0aGUgcGlsbCArIHdhdmVmb3JtIGNvbG9ycyBmcm9tIHRoZSBzYW1lIHRoZW1lLWRlcml2ZWQgYWNjZW50IGFzIHRoZVxuXHRcdC8vIGlucHV0LWJveCBnbG93LCBzbyBhbGwgdGhyZWUgYWx3YXlzIG1hdGNoIGFuZCBhZGFwdCB0byB0aGUgYWN0aXZlIHRoZW1lLlxuXHRcdHRoaXMuX3VwZGF0ZVZvaWNlU3RhdGVDb2xvcnMoY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5fdXBkYXRlVm9pY2VTdGF0ZUNvbG9ycyhjb250YWluZXIpKSk7XG5cblx0XHQvLyBBIG1hc2tlZCAyLXNsb3Qgdmlld3BvcnQgKFwic2xvdCBtYWNoaW5lIHJlZWxcIikuIFRoZSByZWVsIGhvbGRzIHRocmVlIGNlbGxzOlxuXHRcdC8vICAgWyBkaWN0YXRpb24gXVsgdm9pY2UgXVsgbGlzdGVuIF1cblx0XHQvLyBEaXNjb25uZWN0ZWQgXHUyMTkyIHRoZSByZWVsIHNob3dzIHNsb3RzIDAuLjEgKGRpY3RhdGlvbiArIHZvaWNlLWNvbm5lY3QpLlxuXHRcdC8vIENvbm5lY3RlZCAgICBcdTIxOTIgdGhlIHJlZWwgc2xpZGVzIGxlZnQgb25lIHNsb3QgdG8gc2hvdyBzbG90cyAxLi4yLCBzbyB0aGUgdm9pY2Vcblx0XHQvLyAgICAgICAgICAgICAgICBjZWxsIHRha2VzIHRoZSBkaWN0YXRpb24gY2VsbCdzIHBsYWNlIChub3cgYW5pbWF0ZWQgKyBkaXNjb25uZWN0KVxuXHRcdC8vICAgICAgICAgICAgICAgIGFuZCB0aGUgbGlzdGVuIHRvZ2dsZSBzbGlkZXMgaW4gZnJvbSB0aGUgcmlnaHQuXG5cdFx0Y29uc3QgcGlsbCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLm1vbmFjby1zZWdtZW50ZWQtaWNvbi10b2dnbGUuY2hhdC12b2ljZS1pbnB1dC1tb2RlJykpO1xuXHRcdHRoaXMuX3JlZWwgPSBkb20uYXBwZW5kKHBpbGwsIGRvbS4kKCcubW9uYWNvLXNlZ21lbnRlZC1pY29uLXRvZ2dsZS1yZWVsLmNoYXQtdm9pY2UtaW5wdXQtbW9kZS1yZWVsJykpO1xuXG5cdFx0Ly8gLS0tIERpY3RhdGlvbiBjZWxsIC0tLVxuXHRcdHRoaXMuX2RpY3RhdGlvbkNlbGwgPSBkb20uYXBwZW5kKHRoaXMuX3JlZWwsIGRvbS4kKCdidXR0b24ubW9uYWNvLXNlZ21lbnRlZC1pY29uLXRvZ2dsZS1jZWxsLmNoYXQtdm9pY2UtaW5wdXQtbW9kZS1jZWxsLmRpY3RhdGlvbicpKTtcblx0XHR0aGlzLl9kaWN0YXRpb25DZWxsLnNldEF0dHJpYnV0ZSgndHlwZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9kaWN0YXRpb25DZWxsLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl9kaWN0YXRpb25JY29uID0gZG9tLmFwcGVuZCh0aGlzLl9kaWN0YXRpb25DZWxsLCBkb20uJCgnc3Bhbi5jaGF0LXZvaWNlLWlucHV0LW1vZGUtaWNvbicpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCB0aGlzLl9kaWN0YXRpb25DZWxsLFxuXHRcdFx0KCkgPT4gZ2V0RGljdGF0aW9uSG92ZXJDb250ZW50KHRoaXMuX2dldExhYmVsV2l0aEtleWJpbmRpbmcobG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpY3RhdGlvbicsIFwiRGljdGF0aW9uXCIpLCBESUNUQVRJT05fVE9HR0xFX0NPTU1BTkRfSUQpLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZGljdGF0aW9uQ2VsbCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdHRoaXMuX29uQ2xpY2tEaWN0YXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkTWljQnV0dG9uQ29udGV4dE1lbnVMaXN0ZW5lcihcblx0XHRcdHRoaXMuX2RpY3RhdGlvbkNlbGwsXG5cdFx0XHQoKSA9PiBnZXREaWN0YXRpb25Db250ZXh0TWVudUFjdGlvbnModGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgRElDVEFUSU9OX1RPR0dMRV9DT01NQU5EX0lEKSxcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNldHVwRGljdGF0aW9uTWljR2xvdyh0aGlzLl9kaWN0YXRpb25DZWxsLCB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLCB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLCB0aGlzLl9vcHRpb25zPy5pc0FjdGl2ZSwgdGhpcy50aGVtZVNlcnZpY2UpKTtcblxuXHRcdC8vIC0tLSBWb2ljZSBjZWxsOiBhIHNpbmdsZSB3YXZlZm9ybSB0aGF0IHRyYW5zZm9ybXMgYWNyb3NzIHN0YXRlcyAobm8gZ2x5cGgpLiAtLS1cblx0XHR0aGlzLl92b2ljZUNlbGwgPSBkb20uYXBwZW5kKHRoaXMuX3JlZWwsIGRvbS4kKCdidXR0b24ubW9uYWNvLXNlZ21lbnRlZC1pY29uLXRvZ2dsZS1jZWxsLmNoYXQtdm9pY2UtaW5wdXQtbW9kZS1jZWxsLnZvaWNlJykpO1xuXHRcdHRoaXMuX3ZvaWNlQ2VsbC5zZXRBdHRyaWJ1dGUoJ3R5cGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5fdm9pY2VDZWxsLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHR0aGlzLl92b2ljZUJhcnMgPSBkb20uYXBwZW5kKHRoaXMuX3ZvaWNlQ2VsbCwgZG9tLiQoJ3NwYW4uY2hhdC12b2ljZS1pbnB1dC1tb2RlLWJhcnMnKSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBXQVZFRk9STV9CQVJfQ09VTlQ7IGkrKykge1xuXHRcdFx0dGhpcy5fdm9pY2VCYXJFbHMucHVzaChkb20uYXBwZW5kKHRoaXMuX3ZvaWNlQmFycywgZG9tLiQoJ3NwYW4uY2hhdC12b2ljZS1pbnB1dC1tb2RlLWJhcicpKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMuX3ZvaWNlQ2VsbCxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGVkaXNoID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpIHx8IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCkgfHwgdGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uuc2ltdWxhdGVkVm9pY2VTdGF0ZS5nZXQoKSA9PT0gJ2lkbGUnIHx8IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUuZ2V0KCkgPT09ICdsaXN0ZW5pbmcnIHx8IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZFZvaWNlU3RhdGUuZ2V0KCkgPT09ICdzcGVha2luZyc7XG5cdFx0XHRcdHJldHVybiBnZXRWb2ljZU1vZGVIb3ZlckNvbnRlbnQoY29ubmVjdGVkaXNoXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUuZGlzY29ubmVjdCcsIFwiVHVybiBPZmYgVm9pY2UgTW9kZVwiKVxuXHRcdFx0XHRcdDogdGhpcy5fZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUudm9pY2UnLCBcIlZvaWNlIE1vZGVcIiksIFZPSUNFX1NUQVJUX0NPTU1BTkRfSUQpKTtcblx0XHRcdH0pKTtcblx0XHQvLyBUaGUgdm9pY2UgYnV0dG9uIGlzIGEgcGxhaW4gcG93ZXIgdG9nZ2xlIChjb25uZWN0IC8gZGlzY29ubmVjdCkuIExpc3RlbmluZyBpc1xuXHRcdC8vIGRyaXZlbiBieSB0aGUgc2VwYXJhdGUgbGlzdGVuIGNlbGwgaW4gbWFudWFsIG1vZGUgYW5kIGJ5IHRoZSBhdXRvLWxpc3RlbiBsb29wXG5cdFx0Ly8gaW4gaGFuZHMtZnJlZSBtb2RlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdm9pY2VDZWxsLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0dGhpcy5fb25DbGlja1ZvaWNlUG93ZXJUb2dnbGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkTWljQnV0dG9uQ29udGV4dE1lbnVMaXN0ZW5lcihcblx0XHRcdHRoaXMuX3ZvaWNlQ2VsbCxcblx0XHRcdCgpID0+IGdldFZvaWNlTW9kZUNvbnRleHRNZW51QWN0aW9ucyh0aGlzLmNvbW1hbmRTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLCBWT0lDRV9TVEFSVF9DT01NQU5EX0lEKSxcblx0XHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdC8vIFBhdXNlIHRoZSBhdWRpby1yZWFjdGl2ZSBiYXJzIHdoaWxlIGhvdmVyaW5nIHNvIHRoZSBDU1MgXCJzaWxlbnRcIiBwcmV2aWV3IHNob3dzLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdm9pY2VDZWxsLCBkb20uRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl92b2ljZUhvdmVyaW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX3N0b3BCYXJBbmltYXRpb24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl92b2ljZUNlbGwsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdHRoaXMuX3ZvaWNlSG92ZXJpbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3N5bmNCYXJBbmltYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHQvLyAtLS0gTGlzdGVuIGNlbGw6IG1pYy9zdG9wIGljb24gdGhhdCB0b2dnbGVzIGxpc3RlbmluZyBpbiBtYW51YWwgdm9pY2UgbW9kZS4gLS0tXG5cdFx0dGhpcy5fbGlzdGVuQ2VsbCA9IGRvbS5hcHBlbmQodGhpcy5fcmVlbCwgZG9tLiQoJ2J1dHRvbi5tb25hY28tc2VnbWVudGVkLWljb24tdG9nZ2xlLWNlbGwuY2hhdC12b2ljZS1pbnB1dC1tb2RlLWNlbGwubGlzdGVuJykpO1xuXHRcdHRoaXMuX2xpc3RlbkNlbGwuc2V0QXR0cmlidXRlKCd0eXBlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2xpc3RlbkNlbGwuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdHRoaXMuX2xpc3Rlbkljb24gPSBkb20uYXBwZW5kKHRoaXMuX2xpc3RlbkNlbGwsIGRvbS4kKCdzcGFuLmNoYXQtdm9pY2UtaW5wdXQtbW9kZS1pY29uJykpO1xuXHRcdHRoaXMuX3VwZGF0ZUFyaWFMYWJlbHMoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MoKCkgPT4gdGhpcy5fdXBkYXRlQXJpYUxhYmVscygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkTWljQnV0dG9uQ29udGV4dE1lbnVMaXN0ZW5lcihcblx0XHRcdHRoaXMuX2xpc3RlbkNlbGwsXG5cdFx0XHQoKSA9PiBnZXRWb2ljZU1vZGVDb250ZXh0TWVudUFjdGlvbnModGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5rZXliaW5kaW5nU2VydmljZSwgVk9JQ0VfU1RBUlRfQ09NTUFORF9JRCksXG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCB0aGlzLl9saXN0ZW5DZWxsLFxuXHRcdFx0KCkgPT4gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnZvaWNlU3RhdGUuZ2V0KCkgPT09ICdsaXN0ZW5pbmcnXG5cdFx0XHRcdD8gdGhpcy5fZ2V0TGFiZWxXaXRoS2V5YmluZGluZyhsb2NhbGl6ZSgndm9pY2VJbnB1dE1vZGUuc3RvcExpc3RlbmluZycsIFwiU3RvcCBMaXN0ZW5pbmdcIiksIENoYXRWb2ljZUlucHV0TW9kZVRvZ2dsZUxpc3RlbkFjdGlvbi5JRClcblx0XHRcdFx0OiB0aGlzLl9nZXRMYWJlbFdpdGhLZXliaW5kaW5nKGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS5zdGFydE9ySG9sZExpc3RlbmluZycsIFwiVGFwIHRvIHN0YXJ0LCBvciBob2xkIHRvIHRhbGtcIiksIENoYXRWb2ljZUlucHV0TW9kZVRvZ2dsZUxpc3RlbkFjdGlvbi5JRCkpKTtcblx0XHQvLyBUaGUgbGlzdGVuIGNlbGwgc3VwcG9ydHMgdHdvIGdlc3R1cmVzOiBhIHRhcCB0b2dnbGVzIGxpc3RlbmluZyBvbi9vZmYsIGFuZCBhXG5cdFx0Ly8gcHJlc3MtYW5kLWhvbGQgcmVjb3JkcyB3aGlsZSBoZWxkIGFuZCBzZW5kcyBvbiByZWxlYXNlIChob2xkLXRvLXRhbGspLiBVc2UgdGhlXG5cdFx0Ly8gZ2VuZXJpYyBwb2ludGVyLWF3YXJlIGxpc3RlbmVyIHNvIHByZXNzLWFuZC1ob2xkIGFsc28gc3RhcnRzIG9uIGlPUy5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcih0aGlzLl9saXN0ZW5DZWxsLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuYnV0dG9uICE9PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uTGlzdGVuUG9pbnRlckRvd24oKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9saXN0ZW5DZWxsLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0aWYgKHRoaXMuX2xpc3RlblN1cHByZXNzQ2xpY2spIHtcblx0XHRcdFx0dGhpcy5fbGlzdGVuU3VwcHJlc3NDbGljayA9IGZhbHNlO1xuXHRcdFx0XHRyZXR1cm47IC8vIHRyYWlsaW5nIGNsaWNrIGFmdGVyIGEgaG9sZCBcdTIwMTQgdGhlIHJlbGVhc2UgYWxyZWFkeSBoYW5kbGVkIGl0XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkNsaWNrTGlzdGVuKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRGljdGF0aW9uIGFjdGl2aXR5OiBkcml2ZW4gZGlyZWN0bHkgYnkgdGhlIGJ1aWx0LWluIG9uLWRldmljZSBzcGVlY2gtdG8tdGV4dFxuXHRcdC8vIHNlcnZpY2Ugc28gdGhlIG1pYyByZWxpYWJseSBmaWxscyB3aGlsZSBhIGRpY3RhdGlvbiBzZXNzaW9uIGlzIHJlY29yZGluZyBvclxuXHRcdC8vIHRyYW5zY3JpYmluZyAoZ2xvYmFsLCBub3Qgc2NvcGUtZGVwZW5kZW50KS5cblx0XHRjb25zdCBkaWN0YXRpb25BY3RpdmUgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdGUsXG5cdFx0XHQoKSA9PiB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLnN0YXRlICE9PSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZSk7XG5cblx0XHQvLyBNb2RlbCBwcmVwYXJhdGlvbjogb24gZmlyc3QgdXNlIHRoZSBvbi1kZXZpY2UgbW9kZWwgZG93bmxvYWRzL2xvYWRzLiBTd2FwIHRoZVxuXHRcdC8vIG1pYyBmb3IgYSBkb3dubG9hZCBhZmZvcmRhbmNlIHdoaWxlIHByZXBhcmluZywgbWlycm9yaW5nIHRoZSBzdGFuZGFsb25lIGJ1dHRvbi5cblx0XHRjb25zdCBkaWN0YXRpb25QcmVwYXJpbmcgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlUHJlcGFyaW5nTW9kZWwsXG5cdFx0XHQoKSA9PiB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmlzUHJlcGFyaW5nTW9kZWwpO1xuXHRcdC8vIFN1Yi1zdGF0ZSBvZiBwcmVwYXJpbmc6IGB0cnVlYCBvbmx5IGR1cmluZyBhIGNvbmZpcm1lZCBvbi1kaXNrIGRvd25sb2FkXG5cdFx0Ly8gKGNhY2hlIG1pc3MpLCBgZmFsc2VgIHdoaWxlIGxvYWRpbmcgYW4gYWxyZWFkeS1jYWNoZWQgbW9kZWwuIERyaXZlcyB0aGVcblx0XHQvLyBkb3dubG9hZC12cy1zcGlubmVyIGdseXBoIGJlbG93LlxuXHRcdGNvbnN0IGRpY3RhdGlvbkRvd25sb2FkaW5nID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLFxuXHRcdFx0dGhpcy5jaGF0U3BlZWNoVG9UZXh0U2VydmljZS5vbkRpZENoYW5nZURvd25sb2FkaW5nTW9kZWwsXG5cdFx0XHQoKSA9PiB0aGlzLmNoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmlzRG93bmxvYWRpbmdNb2RlbCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBkaWN0YXRpb25BdmFpbGFibGUgPSB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5kaWN0YXRpb25BdmFpbGFibGUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgdm9pY2VBdmFpbGFibGUgPSB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS52b2ljZUF2YWlsYWJsZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzaW1IYW5kc0ZyZWUgPSB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5zaW11bGF0ZWRIYW5kc0ZyZWUucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaGFuZHNGcmVlID0gc2ltSGFuZHNGcmVlID8/IHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLmhhbmRzRnJlZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzaW0gPSB0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5zaW11bGF0ZWRWb2ljZVN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGlzQWN0aXZlID0gc2ltICE9PSB1bmRlZmluZWQgfHwgKHRoaXMuX29wdGlvbnM/LmlzQWN0aXZlPy5yZWFkKHJlYWRlcikgPz8gdHJ1ZSk7XG5cblx0XHRcdC8vIFJlc29sdmUgdGhlIGVmZmVjdGl2ZSBzdGF0ZSBcdTIwMTQgYSBzaW11bGF0aW9uIG92ZXJyaWRlIHdpbnMgb3ZlciBsaXZlIHN0YXRlLlxuXHRcdFx0bGV0IGlzRGljdGF0aW5nOiBib29sZWFuO1xuXHRcdFx0bGV0IGNvbm5lY3RlZDogYm9vbGVhbjtcblx0XHRcdGxldCBjb25uZWN0aW5nOiBib29sZWFuO1xuXHRcdFx0bGV0IGxpc3RlbmluZzogYm9vbGVhbjtcblx0XHRcdGxldCBzcGVha2luZzogYm9vbGVhbjtcblx0XHRcdGlmIChzaW0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpc0RpY3RhdGluZyA9IHNpbSA9PT0gJ2RpY3RhdGluZyc7XG5cdFx0XHRcdGNvbm5lY3RpbmcgPSBzaW0gPT09ICdjb25uZWN0aW5nJztcblx0XHRcdFx0Y29ubmVjdGVkID0gc2ltID09PSAnaWRsZScgfHwgc2ltID09PSAnbGlzdGVuaW5nJyB8fCBzaW0gPT09ICdzcGVha2luZyc7XG5cdFx0XHRcdGxpc3RlbmluZyA9IHNpbSA9PT0gJ2xpc3RlbmluZyc7XG5cdFx0XHRcdHNwZWFraW5nID0gc2ltID09PSAnc3BlYWtpbmcnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aXNEaWN0YXRpbmcgPSBpc0FjdGl2ZSAmJiBkaWN0YXRpb25BY3RpdmUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25uZWN0ZWQgPSBpc0FjdGl2ZSAmJiB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIuaXNDb25uZWN0ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25uZWN0aW5nID0gaXNBY3RpdmUgJiYgdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGluZy5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IHZvaWNlU3RhdGUgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXIudm9pY2VTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGxpc3RlbmluZyA9IGNvbm5lY3RlZCAmJiB2b2ljZVN0YXRlID09PSAnbGlzdGVuaW5nJztcblx0XHRcdFx0c3BlYWtpbmcgPSBjb25uZWN0ZWQgJiYgdm9pY2VTdGF0ZSA9PT0gJ3NwZWFraW5nJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZvaWNlTGl2ZSA9IGxpc3RlbmluZyB8fCBzcGVha2luZztcblx0XHRcdGNvbnN0IHZvaWNlT24gPSBjb25uZWN0ZWQgfHwgY29ubmVjdGluZztcblx0XHRcdHRoaXMuX3ZvaWNlTGl2ZSA9IHZvaWNlTGl2ZTtcblx0XHRcdC8vIEZpcnN0LXVzZSBtb2RlbCBkb3dubG9hZC9sb2FkIChyZWFsIHN0YXRlIG9ubHk7IHNpbXVsYXRpb25zIG5ldmVyIHByZXBhcmUpLlxuXHRcdFx0Y29uc3QgZGljdGF0aW9uQnVzeSA9IHNpbSA9PT0gdW5kZWZpbmVkICYmIGlzQWN0aXZlICYmIGRpY3RhdGlvblByZXBhcmluZy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFRoZSBkZWRpY2F0ZWQgbGlzdGVuIChzdGFydC9zdG9wIHNwZWFraW5nKSB0b2dnbGUgc2hvd3MgaW4gbWFudWFsXG5cdFx0XHQvLyAobm9uLWhhbmRzLWZyZWUpIGNvbm5lY3RlZCB2b2ljZSBtb2RlLiBJbiBoYW5kcy1mcmVlIG1vZGUgdGhlIGF1dG8tbGlzdGVuXG5cdFx0XHQvLyBsb29wIGRyaXZlcyBsaXN0ZW5pbmcsIHNvIHRoZXJlIGlzIG5vIGxpc3RlbiBjZWxsLlxuXHRcdFx0Y29uc3Qgc2hvd0xpc3RlbiA9IHZvaWNlT24gJiYgIWhhbmRzRnJlZTtcblxuXHRcdFx0Ly8gUHJlc2VuY2Ugb2YgZWFjaCBjZWxsLiBUaGUgaG91c2luZyBpcyBhIGNvbnN0YW50IHNpemU7IHRoZSBhYnNlbnQgY2VsbFxuXHRcdFx0Ly8gY29sbGFwc2VzIGl0cyB3aWR0aCB0byAwIChtYXNrIHJlY2VudGVycykgc28gaWNvbnMgc2xpZGUgaW50byBwbGFjZS5cblx0XHRcdC8vICAgLSBkaWN0YXRpb246IHNob3duIHdoZW4gTk9UIGluIHZvaWNlIG1vZGUgKGhvbWUgbWVudSAvIGRpY3RhdGluZylcblx0XHRcdC8vICAgLSB2b2ljZTogICAgIHNob3duIHVubGVzcyBkaWN0YXRpb24gaXMgYWN0aXZlbHkgcmVjb3JkaW5nXG5cdFx0XHQvLyAgIC0gbGlzdGVuOiAgICBzaG93biBvbmx5IGluIG1hbnVhbC1jb25uZWN0ZWQgdm9pY2UgbW9kZVxuXHRcdFx0Y29uc3QgZGljdGF0aW9uUHJlc2VudCA9IGRpY3RhdGlvbkF2YWlsYWJsZSAmJiAhdm9pY2VPbjtcblx0XHRcdGNvbnN0IHZvaWNlUHJlc2VudCA9IHZvaWNlQXZhaWxhYmxlICYmICFpc0RpY3RhdGluZyAmJiAhZGljdGF0aW9uQnVzeTtcblx0XHRcdGNvbnN0IGxpc3RlblByZXNlbnQgPSBzaG93TGlzdGVuO1xuXG5cdFx0XHQvLyBFeGFjdGx5IG9uZSBpY29uIFx1MjE5MiBzaW5nbGUtaWNvbiB2aWV3ICh0aGUgbG9uZSBidXR0b24gZmlsbHMgdGhlIHdob2xlIHBpbGwpLlxuXHRcdFx0Y29uc3QgcHJlc2VudENvdW50ID0gKGRpY3RhdGlvblByZXNlbnQgPyAxIDogMCkgKyAodm9pY2VQcmVzZW50ID8gMSA6IDApICsgKGxpc3RlblByZXNlbnQgPyAxIDogMCk7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY29ubmVjdGVkJywgdm9pY2VPbik7XG5cdFx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2luZ2xlJywgcHJlc2VudENvdW50ID09PSAxKTtcblxuXHRcdFx0Ly8gRGljdGF0aW9uIGNlbGwgXHUyMDE0IGRvd25sb2FkIGFmZm9yZGFuY2Ugd2hpbGUgdGhlIG1vZGVsIHByZXBhcmVzLCBlbHNlIGZpbGxzXG5cdFx0XHQvLyB0aGUgbWljIHdoaWxlIGRpY3RhdGluZy5cblx0XHRcdHRoaXMuX2RpY3RhdGlvbkNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsICFkaWN0YXRpb25QcmVzZW50KTtcblx0XHRcdHRoaXMuX2RpY3RhdGlvbkNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzRGljdGF0aW5nIHx8IGRpY3RhdGlvbkJ1c3kpO1xuXHRcdFx0dGhpcy5fZGljdGF0aW9uQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgncHJlcGFyaW5nJywgZGljdGF0aW9uQnVzeSk7XG5cdFx0XHR0aGlzLl9kaWN0YXRpb25DZWxsIS5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhpc0RpY3RhdGluZykpO1xuXHRcdFx0dGhpcy5fZGljdGF0aW9uQ2VsbCEuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgZGljdGF0aW9uQnVzeVxuXHRcdFx0XHQ/IGxvY2FsaXplKCd2b2ljZUlucHV0TW9kZS5kaWN0YXRpb25QcmVwYXJpbmdDYW5jZWxhYmxlJywgXCJDYW5jZWwgRGljdGF0aW9uLiB7MH1cIiwgZ2V0RGljdGF0aW9uUHJlcGFyaW5nTGFiZWwodGhpcy5jaGF0U3BlZWNoVG9UZXh0U2VydmljZSkpXG5cdFx0XHRcdDogbG9jYWxpemUoJ3ZvaWNlSW5wdXRNb2RlLmRpY3RhdGlvbicsIFwiRGljdGF0aW9uXCIpKTtcblx0XHRcdC8vIEdseXBocyByZW5kZXIgYXQgdGhlIGNvbXBhY3QgMTJweCBzaXplLCBzbyB1c2UgdGhlIGAqQ29tcGFjdGAgdmFyaWFudHNcblx0XHRcdC8vIHdoZXJldmVyIG9uZSBleGlzdHMgKGBtaWNgIC8gYG1pY0ZpbGxlZGAgaGF2ZSBub25lIGFuZCBzdGF5IGFzLWlzKS5cblx0XHRcdC8vIFdoaWxlIHByZXBhcmluZywgc2hvdyB0aGUgZG93bmxvYWQgZ2x5cGggb25seSBkdXJpbmcgYW4gYWN0dWFsIG9uLWRpc2tcblx0XHRcdC8vIGRvd25sb2FkIChjYWNoZSBtaXNzKTsgb3RoZXJ3aXNlIChsb2FkaW5nIGEgY2FjaGVkIG1vZGVsKSBzaG93IGFcblx0XHRcdC8vIHNwaW5uZXIsIHdoaWNoIHRoZSBgLnByZXBhcmluZ2AgQ1NTIGFuaW1hdGVzLlxuXHRcdFx0Y29uc3QgZGljdGF0aW9uSWNvbiA9IGRpY3RhdGlvbkJ1c3lcblx0XHRcdFx0PyBkaWN0YXRpb25Eb3dubG9hZGluZy5yZWFkKHJlYWRlcikgPyBDb2RpY29uLm1pY0Rvd25sb2FkQ29tcGFjdCA6IENvZGljb24ubG9hZGluZ0NvbXBhY3Rcblx0XHRcdFx0OiBpc0RpY3RhdGluZyA/IENvZGljb24ubWljRmlsbGVkIDogQ29kaWNvbi5taWM7XG5cdFx0XHR0aGlzLl9kaWN0YXRpb25JY29uIS5jbGFzc05hbWUgPSBgY2hhdC12b2ljZS1pbnB1dC1tb2RlLWljb24gJHtUaGVtZUljb24uYXNDbGFzc05hbWUoZGljdGF0aW9uSWNvbil9YDtcblxuXHRcdFx0Ly8gV3JhcCB0aGUgZG93bmxvYWQgZ2x5cGggaW4gYSBkZXRlcm1pbmF0ZSBwcm9ncmVzcyByaW5nIGR1cmluZyBhblxuXHRcdFx0Ly8gYWN0dWFsIG9uLWRpc2sgZG93bmxvYWQsIG1hdGNoaW5nIHRoZSBzdGFuZGFsb25lIHRvb2xiYXIgYnV0dG9uLlxuXHRcdFx0Ly8gVGhlIHJpbmcgaXMgdG9ybiBkb3duIGFzIHNvb24gYXMgdGhlIGRvd25sb2FkIGNvbXBsZXRlcyAobG9hZGluZyBhXG5cdFx0XHQvLyBjYWNoZWQgbW9kZWwsIG9yIG5vdCBwcmVwYXJpbmcgYXQgYWxsKS5cblx0XHRcdGlmIChkaWN0YXRpb25CdXN5ICYmIGRpY3RhdGlvbkRvd25sb2FkaW5nLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2RpY3RhdGlvblJpbmcudmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLl9kaWN0YXRpb25SaW5nLnZhbHVlID0gbmV3IERpY3RhdGlvbkRvd25sb2FkUmluZyh0aGlzLl9kaWN0YXRpb25DZWxsISwgdGhpcy5jaGF0U3BlZWNoVG9UZXh0U2VydmljZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2RpY3RhdGlvblJpbmcuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVm9pY2UgY2VsbCBcdTIwMTQgRGV2aWNlIEVRIGJhcnMgdGhhdCB0cmFuc2Zvcm06XG5cdFx0XHQvLyAgIGRpc2Nvbm5lY3RlZCBcdTIxOTIgdGhpbiBncmV5IGJhcnMgKGNsaWNrIHRvIGNvbm5lY3QpXG5cdFx0XHQvLyAgIGNvbm5lY3RlZC9pZGxlIFx1MjE5MiBkYXJrZXIgYmFycywgY2FsbSB1bmR1bGF0aW5nIHdhdmVcblx0XHRcdC8vICAgbGlzdGVuaW5nIFx1MjE5MiBCTFVFIGJhcnMsIGF1ZGlvLXJlYWN0aXZlIHRvIHRoZSB1c2VyJ3Mgdm9pY2Vcblx0XHRcdC8vICAgc3BlYWtpbmcgXHUyMTkyIFBVUlBMRSBiYXJzLCBhdWRpby1yZWFjdGl2ZSB0byB0aGUgYXNzaXN0YW50XG5cdFx0XHQvLyAgIGhvdmVyLXdoaWxlLWNvbm5lY3RlZCBcdTIxOTIgc2hvcnQgZXZlbiBcInNpbGVudFwiIGJhcnMgKHByZXZpZXdzIGRpc2Nvbm5lY3Q7IENTUylcblx0XHRcdHRoaXMuX3ZvaWNlQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgIXZvaWNlUHJlc2VudCk7XG5cdFx0XHR0aGlzLl92b2ljZUNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ29uJywgdm9pY2VPbik7XG5cdFx0XHR0aGlzLl92b2ljZUNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ2lkbGUtb24nLCB2b2ljZU9uICYmICF2b2ljZUxpdmUpO1xuXHRcdFx0dGhpcy5fdm9pY2VDZWxsIS5jbGFzc0xpc3QudG9nZ2xlKCdsaXN0ZW5pbmcnLCBsaXN0ZW5pbmcpO1xuXHRcdFx0dGhpcy5fdm9pY2VDZWxsIS5jbGFzc0xpc3QudG9nZ2xlKCdzcGVha2luZycsIHNwZWFraW5nKTtcblx0XHRcdHRoaXMuX3ZvaWNlQ2VsbCEuc2V0QXR0cmlidXRlKCdhcmlhLXByZXNzZWQnLCBTdHJpbmcodm9pY2VPbikpO1xuXHRcdFx0Ly8gU2ltdWxhdGVkIGhvdmVyICh3YWxrdGhyb3VnaCBvbmx5KSBtaXJyb3JzIHRoZSByZWFsIDpob3ZlciBkaXNjb25uZWN0IHByZXZpZXcuXG5cdFx0XHR0aGlzLl92b2ljZUNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ3NpbS1ob3ZlcicsIHRoaXMudm9pY2VJbnB1dE1vZGVTZXJ2aWNlLnNpbXVsYXRlZEhvdmVyLnJlYWQocmVhZGVyKSk7XG5cblx0XHRcdC8vIExpc3RlbiAvIHN0b3Atc3BlYWtpbmcgdG9nZ2xlOiBtaWMgdG8gc3RhcnQsIHN0b3AgdG8gZW5kLlxuXHRcdFx0dGhpcy5fbGlzdGVuQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnY29sbGFwc2VkJywgIWxpc3RlblByZXNlbnQpO1xuXHRcdFx0dGhpcy5fbGlzdGVuQ2VsbCEuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aXZlJywgbGlzdGVuaW5nKTtcblx0XHRcdHRoaXMuX2xpc3RlbkNlbGwhLmNsYXNzTGlzdC50b2dnbGUoJ211dGVkJywgIWxpc3RlbmluZyk7XG5cdFx0XHR0aGlzLl9saXN0ZW5DZWxsIS5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIFN0cmluZyhsaXN0ZW5pbmcpKTtcblx0XHRcdHRoaXMuX2xpc3Rlbkljb24hLmNsYXNzTmFtZSA9IGBjaGF0LXZvaWNlLWlucHV0LW1vZGUtaWNvbiAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShsaXN0ZW5pbmcgPyBDb2RpY29uLnBlcnNvblZvaWNlRmlsbGVkQ29tcGFjdCA6IENvZGljb24ucGVyc29uVm9pY2VDb21wYWN0KX1gO1xuXHRcdFx0dGhpcy5fdXBkYXRlQXJpYUxhYmVscygpO1xuXG5cdFx0XHQvLyBBdWRpby1yZWFjdGl2ZSBiYXJzIG9ubHkgd2hpbGUgbGl2ZSAoYW5kIG5vdCBob3ZlcmluZyB0aGUgZGlzY29ubmVjdCBwcmV2aWV3KS5cblx0XHRcdHRoaXMuX3N5bmNCYXJBbmltYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih7IGRpc3Bvc2U6ICgpID0+IHRoaXMuX3N0b3BCYXJBbmltYXRpb24oKSB9KTtcblx0XHQvLyBSZS1zeW5jIGlmIHRoZSByZWR1Y2VkLW1vdGlvbiBwcmVmZXJlbmNlIGNoYW5nZXMgd2hpbGUgdGhlIHZvaWNlIGNlbGwgaXMgbGl2ZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdG9wQmFyQW5pbWF0aW9uKCk7XG5cdFx0XHR0aGlzLl9zeW5jQmFyQW5pbWF0aW9uKCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqIFN0YXJ0IG9yIHN0b3AgdGhlIGF1ZGlvLXJlYWN0aXZlIGJhciBsb29wIGJhc2VkIG9uIGxpdmUgKyBob3ZlciBzdGF0ZS4gKi9cblx0cHJpdmF0ZSBfc3luY0JhckFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdm9pY2VMaXZlICYmICF0aGlzLl92b2ljZUhvdmVyaW5nKSB7XG5cdFx0XHR0aGlzLl9zdGFydEJhckFuaW1hdGlvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdG9wQmFyQW5pbWF0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFuaW1hdGUgdGhlIHdhdmVmb3JtIGJhcnMgZnJvbSBsaXZlIGF1ZGlvLiBVc2VzIHRoZSBtaWMgYW5hbHlzZXIgd2hpbGUgbGlzdGVuaW5nXG5cdCAqIGFuZCB0aGUgVFRTIGFuYWx5c2VyIHdoaWxlIHRoZSBhc3Npc3RhbnQgc3BlYWtzLiBXaGVuIG5vIGFuYWx5c2VyIGlzIGF2YWlsYWJsZVxuXHQgKiAoZS5nLiByZWR1Y2VkIG1vdGlvbiBvciBwcmUtY2FwdHVyZSksIHRoZSBDU1Mga2V5ZnJhbWUgZmFsbGJhY2sgZHJpdmVzIHRoZSBiYXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRCYXJBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUmVzcGVjdCByZWR1Y2VkLW1vdGlvbjogc2tpcCBib3RoIHRoZSByQUYgYXVkaW8tcmVhY3RpdmUgbG9vcCBhbmQgdGhlIENTU1xuXHRcdC8vIGtleWZyYW1lIGZhbGxiYWNrLCByZW5kZXJpbmcgdGhlIGJhcnMgYXQgYSBmbGF0IHN0YXRpYyBoZWlnaHQgaW5zdGVhZC5cblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBiYXIgb2YgdGhpcy5fdm9pY2VCYXJFbHMpIHtcblx0XHRcdFx0YmFyLnN0eWxlLmFuaW1hdGlvbiA9ICdub25lJztcblx0XHRcdFx0YmFyLnN0eWxlLmhlaWdodCA9IGAke1dBVkVGT1JNX0JBUl9NSU5fSEVJR0hUfXB4YDtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgd2luID0gZ2V0V2luZG93KHRoaXMuX3ZvaWNlQ2VsbCk7XG5cdFx0Y29uc3QgdGljayA9ICgpID0+IHtcblx0XHRcdHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lID0gd2luLnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcblx0XHRcdC8vIFJlYWQgdGhlIGxpdmUgc3RhdGUgZWFjaCBmcmFtZSBzbyBsaXN0ZW5pbmc8LT5zcGVha2luZyBwaWNrcyB0aGUgcmlnaHQgYW5hbHlzZXIuXG5cdFx0XHRjb25zdCBhbmFseXNlciA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci52b2ljZVN0YXRlLmdldCgpID09PSAnc3BlYWtpbmcnXG5cdFx0XHRcdD8gdGhpcy50dHNQbGF5YmFja1NlcnZpY2UuYW5hbHlzZXJOb2RlXG5cdFx0XHRcdDogdGhpcy5taWNDYXB0dXJlU2VydmljZS5hbmFseXNlck5vZGU7XG5cdFx0XHRpZiAoIWFuYWx5c2VyKSB7XG5cdFx0XHRcdC8vIExldCB0aGUgQ1NTIGtleWZyYW1lIGFuaW1hdGlvbiB0YWtlIG92ZXIuXG5cdFx0XHRcdGZvciAoY29uc3QgYmFyIG9mIHRoaXMuX3ZvaWNlQmFyRWxzKSB7XG5cdFx0XHRcdFx0YmFyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCdoZWlnaHQnKTtcblx0XHRcdFx0XHRiYXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJ2FuaW1hdGlvbicpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghdGhpcy5fYmFyRGF0YSB8fCB0aGlzLl9iYXJEYXRhLmxlbmd0aCAhPT0gYW5hbHlzZXIuZnJlcXVlbmN5QmluQ291bnQpIHtcblx0XHRcdFx0dGhpcy5fYmFyRGF0YSA9IG5ldyBVaW50OEFycmF5KGFuYWx5c2VyLmZyZXF1ZW5jeUJpbkNvdW50KTtcblx0XHRcdH1cblx0XHRcdGFuYWx5c2VyLmdldEJ5dGVGcmVxdWVuY3lEYXRhKHRoaXMuX2JhckRhdGEgYXMgVWludDhBcnJheTxBcnJheUJ1ZmZlcj4pO1xuXHRcdFx0Y29uc3QgYmlucyA9IHRoaXMuX2JhckRhdGEubGVuZ3RoO1xuXHRcdFx0Y29uc3Qgc3RlcCA9IE1hdGgubWF4KDEsIE1hdGguZmxvb3IoYmlucyAvIHRoaXMuX3ZvaWNlQmFyRWxzLmxlbmd0aCkpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl92b2ljZUJhckVscy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRsZXQgc3VtID0gMDtcblx0XHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBzdGVwOyBqKyspIHtcblx0XHRcdFx0XHRzdW0gKz0gdGhpcy5fYmFyRGF0YVtNYXRoLm1pbihiaW5zIC0gMSwgaSAqIHN0ZXAgKyBqKV07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaW50ZW5zaXR5ID0gTWF0aC5taW4oMSwgKHN1bSAvIHN0ZXApIC8gMTgwKTtcblx0XHRcdFx0Y29uc3QgaGVpZ2h0UHggPSBXQVZFRk9STV9CQVJfTUlOX0hFSUdIVCArIGludGVuc2l0eSAqIChXQVZFRk9STV9CQVJfTUFYX0hFSUdIVCAtIFdBVkVGT1JNX0JBUl9NSU5fSEVJR0hUKTtcblx0XHRcdFx0Ly8gRGlzYWJsZSB0aGUgQ1NTIGtleWZyYW1lIGZhbGxiYWNrIHdoaWxlIHdlIGRyaXZlIGhlaWdodHMgZnJvbSBsaXZlIGF1ZGlvLlxuXHRcdFx0XHR0aGlzLl92b2ljZUJhckVsc1tpXS5zdHlsZS5hbmltYXRpb24gPSAnbm9uZSc7XG5cdFx0XHRcdHRoaXMuX3ZvaWNlQmFyRWxzW2ldLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodFB4fXB4YDtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lID0gd2luLnJlcXVlc3RBbmltYXRpb25GcmFtZSh0aWNrKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3BCYXJBbmltYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lICE9PSB1bmRlZmluZWQgJiYgdGhpcy5fdm9pY2VDZWxsKSB7XG5cdFx0XHRnZXRXaW5kb3codGhpcy5fdm9pY2VDZWxsKS5jYW5jZWxBbmltYXRpb25GcmFtZSh0aGlzLl9iYXJBbmltYXRpb25GcmFtZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2JhckFuaW1hdGlvbkZyYW1lID0gdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgYmFyIG9mIHRoaXMuX3ZvaWNlQmFyRWxzKSB7XG5cdFx0XHRiYXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJ2hlaWdodCcpO1xuXHRcdFx0YmFyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCdhbmltYXRpb24nKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVG9nZ2xlIGJ1aWx0LWluIG9uLWRldmljZSBkaWN0YXRpb24uIEJ5IGRlZmF1bHQgdGhpcyBydW5zIHRoZSBzaGFyZWRcblx0ICoge0BsaW5rIERJQ1RBVElPTl9UT0dHTEVfQ09NTUFORF9JRH0gY29tbWFuZCAod2hpY2ggdGFyZ2V0cyB0aGUgbGFzdCBmb2N1c2VkXG5cdCAqIGNoYXQgd2lkZ2V0KTsgYSBob3N0IHRoYXQgaXNuJ3QgYW4gYElDaGF0V2lkZ2V0YCAoZS5nLiB0aGUgYWdlbnRzLXdpbmRvd1xuXHQgKiBjb21wb3NlcikgY2FuIGluamVjdCBpdHMgb3duIHRvZ2dsZSB2aWEge0BsaW5rIElWb2ljZUlucHV0TW9kZVBpbGxPcHRpb25zfS5cblx0ICovXG5cdHByaXZhdGUgX3RvZ2dsZURpY3RhdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8udG9nZ2xlRGljdGF0aW9uKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLnRvZ2dsZURpY3RhdGlvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKERJQ1RBVElPTl9UT0dHTEVfQ09NTUFORF9JRCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25DbGlja0RpY3RhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnZvaWNlSW5wdXRNb2RlU2VydmljZS5zZXRTZWxlY3RlZE1vZGUoJ2RpY3RhdGlvbicpO1xuXG5cdFx0Ly8gTXV0dWFsIGV4Y2x1c2lvbjogc3RvcCBsaXZlIFZvaWNlIE1vZGUgYmVmb3JlIHN0YXJ0aW5nIGRpY3RhdGlvbi5cblx0XHRpZiAodGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpIHx8IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5pc0Nvbm5lY3RpbmcuZ2V0KCkpIHtcblx0XHRcdHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlci5kaXNjb25uZWN0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdG9nZ2xlRGljdGF0aW9uKCk7XG5cdH1cblxuXHQvKiogVGhlIHZvaWNlIGJ1dHRvbiBjb25uZWN0cyBvciBkaXNjb25uZWN0czsgaGFuZHMtZnJlZSBtb2RlIHN0YXJ0cyBsaXN0ZW5pbmcgYWZ0ZXIgY29ubmVjdC4gKi9cblx0cHJpdmF0ZSBfb25DbGlja1ZvaWNlUG93ZXJUb2dnbGUoKTogdm9pZCB7XG5cdFx0dGhpcy52b2ljZUlucHV0TW9kZVNlcnZpY2Uuc2V0U2VsZWN0ZWRNb2RlKCd2b2ljZScpO1xuXG5cdFx0Ly8gTXV0dWFsIGV4Y2x1c2lvbjogc3RvcCBkaWN0YXRpb24gYmVmb3JlIGVudGVyaW5nIFZvaWNlIE1vZGUuXG5cdFx0aWYgKHRoaXMuY2hhdFNwZWVjaFRvVGV4dFNlcnZpY2Uuc3RhdGUgIT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlKSB7XG5cdFx0XHR0aGlzLl90b2dnbGVEaWN0YXRpb24oKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyO1xuXHRcdGlmIChjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpIHx8IGNvbnRyb2xsZXIuaXNDb25uZWN0aW5nLmdldCgpKSB7XG5cdFx0XHRjb250cm9sbGVyLmRpc2Nvbm5lY3QoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KHRoaXMuX3ZvaWNlQ2VsbCk7XG5cdFx0XHRjb250cm9sbGVyLmNvbm5lY3QodGFyZ2V0V2luZG93KS5jYXRjaCgoKSA9PiB7IC8qIGNvbm5lY3QgZmFpbHVyZXMgYXJlIHN1cmZhY2VkL2xvZ2dlZCBieSB0aGUgY29udHJvbGxlciAqLyB9KTtcblx0XHR9XG5cdH1cblxuXHQvKiogVGFwIHRoZSBsaXN0ZW4gY2VsbCB0byB0b2dnbGUgbGlzdGVuaW5nIG9uIGFuZCBvZmYuICovXG5cdHByaXZhdGUgX29uQ2xpY2tMaXN0ZW4oKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMudm9pY2VTZXNzaW9uQ29udHJvbGxlcjtcblx0XHRpZiAoIWNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGNvbnRyb2xsZXIudm9pY2VTdGF0ZS5nZXQoKSA9PT0gJ2xpc3RlbmluZycpIHtcblx0XHRcdGNvbnRyb2xsZXIuc3RvcExpc3RlbmluZygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb250cm9sbGVyLnB0dERvd24oKTtcblx0XHRcdGNvbnRyb2xsZXIucHR0VXAoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogVGhyZXNob2xkIChtcykgc2VwYXJhdGluZyBhIHF1aWNrIHRhcCAodG9nZ2xlKSBmcm9tIGEgcHJlc3MtYW5kLWhvbGQgKHRhbGspLiAqL1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBIT0xEX1RIUkVTSE9MRF9NUyA9IDE4MDtcblxuXHRwcml2YXRlIF9vbkxpc3RlblBvaW50ZXJEb3duKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLnZvaWNlU2Vzc2lvbkNvbnRyb2xsZXI7XG5cdFx0Ly8gSG9sZC10by10YWxrIG9ubHkgYXBwbGllcyB0byBhIGNvbm5lY3RlZCwgbm9uLWxpc3RlbmluZyBzZXNzaW9uOyBvdGhlcndpc2UgbGV0XG5cdFx0Ly8gdGhlIHRyYWlsaW5nIGNsaWNrIGRyaXZlIHRoZSBwbGFpbiB0b2dnbGUuXG5cdFx0aWYgKCFjb250cm9sbGVyLmlzQ29ubmVjdGVkLmdldCgpIHx8IGNvbnRyb2xsZXIudm9pY2VTdGF0ZS5nZXQoKSA9PT0gJ2xpc3RlbmluZycpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGlzdGVuSG9sZEdlc3R1cmUgPSB0cnVlO1xuXHRcdHRoaXMuX2xpc3RlbkhvbGRMaXN0ZW5pbmcgPSBmYWxzZTtcblx0XHQvLyBGcmVzaCBnZXN0dXJlOiBjbGVhciBhbnkgc3VwcHJlc3Npb24gbGVmdCBvdmVyIGZyb20gYSBwcmlvciBob2xkIHdob3NlIHJlbGVhc2Vcblx0XHQvLyBsYW5kZWQgb2ZmLWJ1dHRvbiAoYW5kIHRoZXJlZm9yZSBwcm9kdWNlZCBubyB0cmFpbGluZyBjbGljayB0byBjb25zdW1lIGl0KS5cblx0XHR0aGlzLl9saXN0ZW5TdXBwcmVzc0NsaWNrID0gZmFsc2U7XG5cdFx0Y29uc3Qgd2luID0gZ2V0V2luZG93KHRoaXMuX2xpc3RlbkNlbGwpO1xuXHRcdC8vIFN0YXJ0IGxpc3RlbmluZyBvbmx5IGFmdGVyIHRoZSBob2xkIHRocmVzaG9sZCwgc28gYSBxdWljayB0YXAgKHRvZ2dsZSkgZG9lcyBub3Rcblx0XHQvLyBicmllZmx5IGZsYXNoIHRoZSBsaXN0ZW5pbmcgc3RhdGUuXG5cdFx0dGhpcy5fbGlzdGVuSG9sZFRpbWVyID0gd2luLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fbGlzdGVuSG9sZFRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNvbnRyb2xsZXIuaXNDb25uZWN0ZWQuZ2V0KCkpIHtcblx0XHRcdFx0dGhpcy5fbGlzdGVuSG9sZExpc3RlbmluZyA9IHRydWU7XG5cdFx0XHRcdGNvbnRyb2xsZXIucHR0RG93bignZXhwbGljaXQnLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9LCBWb2ljZUlucHV0TW9kZUFjdGlvblZpZXdJdGVtLkhPTERfVEhSRVNIT0xEX01TKTtcblx0XHQvLyBFbmQgdGhlIGdlc3R1cmUgb24gcmVsZWFzZSBhbnl3aGVyZSAoaW4gY2FzZSB0aGUgcG9pbnRlciBsZWF2ZXMgdGhlIGJ1dHRvbikuXG5cdFx0Ly8gR2VuZXJpYyBwb2ludGVyLWF3YXJlIGxpc3RlbmVyIHNvIGFuIGlPUyBwb2ludGVyIGhvbGQgYWxzbyBmaW5pc2hlcyBhbmQgc2VuZHMuXG5cdFx0dGhpcy5fbGlzdGVuUG9pbnRlclVwLnZhbHVlID0gZG9tLmFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VVcExpc3RlbmVyKHdpbiwgKGU6IE1vdXNlRXZlbnQpID0+IHRoaXMuX2VuZExpc3RlblBvaW50ZXJIb2xkKGUpKTtcblx0fVxuXG5cdHByaXZhdGUgX2VuZExpc3RlblBvaW50ZXJIb2xkKGU/OiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9saXN0ZW5Ib2xkR2VzdHVyZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9saXN0ZW5Ib2xkR2VzdHVyZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2xpc3RlblBvaW50ZXJVcC5jbGVhcigpO1xuXHRcdGlmICh0aGlzLl9saXN0ZW5Ib2xkVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gUmVsZWFzZWQgYmVmb3JlIHRoZSB0aHJlc2hvbGQgXHUyMTkyIGEgdGFwOyBsZXQgdGhlIHRyYWlsaW5nIGNsaWNrIHRvZ2dsZSBsaXN0ZW5pbmcuXG5cdFx0XHRnZXRXaW5kb3codGhpcy5fbGlzdGVuQ2VsbCkuY2xlYXJUaW1lb3V0KHRoaXMuX2xpc3RlbkhvbGRUaW1lcik7XG5cdFx0XHR0aGlzLl9saXN0ZW5Ib2xkVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9saXN0ZW5TdXBwcmVzc0NsaWNrID0gZmFsc2U7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9saXN0ZW5Ib2xkTGlzdGVuaW5nKSB7XG5cdFx0XHQvLyBIZWxkIHBhc3QgdGhlIHRocmVzaG9sZCBcdTIxOTIgZW5kIHRoZSB0dXJuIGFuZCBzZW5kLiBBIHRyYWlsaW5nIGBjbGlja2Agb25seSBmaXJlc1xuXHRcdFx0Ly8gd2hlbiB0aGUgcmVsZWFzZSBsYW5kcyBvbiB0aGUgYnV0dG9uLCBzbyBvbmx5IGFybSBzdXBwcmVzc2lvbiBpbiB0aGF0IGNhc2UgXHUyMDE0XG5cdFx0XHQvLyBvdGhlcndpc2UgYSBzdGFsZSBmbGFnIHdvdWxkIHN3YWxsb3cgdGhlIG5leHQgKGUuZy4ga2V5Ym9hcmQpIGFjdGl2YXRpb24uXG5cdFx0XHR0aGlzLl9saXN0ZW5Ib2xkTGlzdGVuaW5nID0gZmFsc2U7XG5cdFx0XHRjb25zdCByZWxlYXNlZE9uQ2VsbCA9ICEhZT8udGFyZ2V0ICYmIHRoaXMuX2xpc3RlbkNlbGwhLmNvbnRhaW5zKGUudGFyZ2V0IGFzIE5vZGUpO1xuXHRcdFx0dGhpcy5fbGlzdGVuU3VwcHJlc3NDbGljayA9IHJlbGVhc2VkT25DZWxsO1xuXHRcdFx0dGhpcy52b2ljZVNlc3Npb25Db250cm9sbGVyLnB0dFVwKCdleHBsaWNpdCcsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gSWYgZGlzcG9zZWQgbWlkLWhvbGQgKHdpZGdldCBjbG9zZWQvcmVyZW5kZXJlZCksIGZpbmFsaXplIHRoZSBnZXN0dXJlIHNvIHRoZVxuXHRcdC8vIGNvbnRyb2xsZXIgZG9lcyBub3Qga2VlcCByZWNvcmRpbmcgdW50aWwgaXRzIG1heC1kdXJhdGlvbiB0aW1lb3V0LlxuXHRcdGlmICh0aGlzLl9saXN0ZW5Ib2xkR2VzdHVyZSB8fCB0aGlzLl9saXN0ZW5Ib2xkVGltZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZW5kTGlzdGVuUG9pbnRlckhvbGQoKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1ZvaWNlSW5wdXRNb2RlQXZhaWxhYmxlKHZvaWNlSW5wdXRNb2RlU2VydmljZTogSVZvaWNlSW5wdXRNb2RlU2VydmljZSk6IFZvaWNlSW5wdXRNb2RlIHwgJ2JvdGgnIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgZGljdGF0aW9uID0gdm9pY2VJbnB1dE1vZGVTZXJ2aWNlLmRpY3RhdGlvbkF2YWlsYWJsZS5nZXQoKTtcblx0Y29uc3Qgdm9pY2UgPSB2b2ljZUlucHV0TW9kZVNlcnZpY2Uudm9pY2VBdmFpbGFibGUuZ2V0KCk7XG5cdGlmIChkaWN0YXRpb24gJiYgdm9pY2UpIHtcblx0XHRyZXR1cm4gJ2JvdGgnO1xuXHR9XG5cdGlmIChkaWN0YXRpb24pIHtcblx0XHRyZXR1cm4gJ2RpY3RhdGlvbic7XG5cdH1cblx0aWYgKHZvaWNlKSB7XG5cdFx0cmV0dXJuICd2b2ljZSc7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cbiJdLAog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
