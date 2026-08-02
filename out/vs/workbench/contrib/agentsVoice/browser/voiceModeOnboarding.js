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
import * as dom from "../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../base/browser/formattedTextRenderer.js";
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { FileAccess } from "../../../../base/common/network.js";
import { localize } from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { ChatInputOnboarding, ChatInputOnboardingCard } from "../../chat/browser/widget/input/chatInputOnboarding.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { defaultSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { AgentsVoiceStorageKeys } from "../common/agentsVoice.js";
import { buildMicrophoneOptions, indexOfMicrophone } from "../../chat/browser/speechToText/dictationOnboarding.js";
import "./media/voiceModeOnboarding.css";
const VOICE_SETTING = "agents.voice.voice";
const VOICE_LANGUAGE_SETTING = "agents.voice.language";
const VOICE_SETTINGS_COMMAND = "agentsVoice.openSettings";
const VOICES = [
  {
    id: "maya_neutral",
    label: localize("voiceMode.onboarding.voice.maya", "Maya (Default)"),
    // Flowing mid-range: even spread, gentle drift.
    signature: [
      { frequency: 1, amplitude: 0.42, speed: 0.42, phase: 0 },
      { frequency: 1.7, amplitude: 0.26, speed: -0.31, phase: 1.1 },
      { frequency: 2.6, amplitude: 0.19, speed: 0.24, phase: 2.4 },
      { frequency: 4.1, amplitude: 0.13, speed: -0.18, phase: 0.7 }
    ]
  },
  {
    id: "victoria_neutral",
    label: localize("voiceMode.onboarding.voice.victoria", "Victoria"),
    // Bright and quick: higher frequencies, tighter ripple.
    signature: [
      { frequency: 1.4, amplitude: 0.38, speed: 0.52, phase: 0 },
      { frequency: 2.3, amplitude: 0.27, speed: -0.38, phase: 1.1 },
      { frequency: 3.6, amplitude: 0.21, speed: 0.3, phase: 2.4 },
      { frequency: 5.2, amplitude: 0.14, speed: -0.22, phase: 0.7 }
    ]
  },
  {
    id: "kevin_neutral",
    label: localize("voiceMode.onboarding.voice.kevin", "Kevin"),
    // Low and broad: long swells with little high-frequency detail.
    signature: [
      { frequency: 0.7, amplitude: 0.48, speed: 0.3, phase: 0.4 },
      { frequency: 1.2, amplitude: 0.28, speed: -0.22, phase: 1.7 },
      { frequency: 2, amplitude: 0.16, speed: 0.18, phase: 0.9 },
      { frequency: 3.1, amplitude: 0.09, speed: -0.14, phase: 2.2 }
    ]
  },
  {
    id: "daniel_neutral",
    label: localize("voiceMode.onboarding.voice.daniel", "Daniel"),
    // Steady and measured: slow drift, calm regular crests.
    signature: [
      { frequency: 0.9, amplitude: 0.44, speed: 0.24, phase: 1.3 },
      { frequency: 1.5, amplitude: 0.3, speed: -0.18, phase: 0.2 },
      { frequency: 2.4, amplitude: 0.14, speed: 0.15, phase: 2 },
      { frequency: 3.4, amplitude: 0.1, speed: -0.12, phase: 1.5 }
    ]
  }
];
const LOCALIZED_VOICES = {
  de: { id: "de_marc_neutral", label: localize("voiceMode.onboarding.voice.marc", "Marc") },
  es: { id: "es-ES_maria_neutral", label: localize("voiceMode.onboarding.voice.maria", "Maria") },
  fr: { id: "fr_david_neutral", label: localize("voiceMode.onboarding.voice.david", "David") },
  it: { id: "it_eva_neutral", label: localize("voiceMode.onboarding.voice.eva", "Eva") },
  ja: { id: "ja_aruha_neutral", label: localize("voiceMode.onboarding.voice.aruha", "Aruha") },
  ko: { id: "ko_jiyon_neutral", label: localize("voiceMode.onboarding.voice.jiyon", "Jiyon") },
  pt: { id: "pt-BR_gil_neutral", label: localize("voiceMode.onboarding.voice.gil", "Gil") },
  zh: { id: "zh_wuzhi_neutral", label: localize("voiceMode.onboarding.voice.wuzhi", "Wuzhi") }
};
function localizedVoiceForLanguage(language) {
  try {
    const canonical = Intl.getCanonicalLocales(language.trim())[0];
    const base = canonical?.split("-")[0].toLowerCase();
    return base ? LOCALIZED_VOICES[base] : void 0;
  } catch {
    return void 0;
  }
}
const RESTING_SIGNATURE = VOICES[0].signature.map((_, index) => {
  const components = VOICES.map((voice) => voice.signature[index]);
  const mean = (pick) => components.reduce((sum, wave) => sum + pick(wave), 0) / components.length;
  return {
    frequency: mean((wave) => wave.frequency),
    amplitude: mean((wave) => wave.amplitude),
    speed: mean((wave) => wave.speed),
    phase: mean((wave) => wave.phase)
  };
});
const IDLE_CYCLE_SECONDS = 2.6;
const WAVE_TEMPO = 2 * Math.PI / IDLE_CYCLE_SECONDS / Math.abs(RESTING_SIGNATURE[0].speed);
const IDLE_GAIN = 0.5;
const SPEAKING_GAIN = 0.45;
const IDLE_MOTION = 0.2;
const SPEAKING_MOTION = 0.8;
const LEVEL_EASING = 0.08;
const SIGNATURE_EASING = 0.06;
const REFERENCE_FRAME_SECONDS = 1 / 60;
const BAR_WIDTH = 1;
const BAR_GAP = 2;
const BAR_MIN = 1;
function cloneSignature(signature) {
  return signature.map((wave) => ({ ...wave, oscillation: 0 }));
}
function easingFactor(perFrameEasing, dt) {
  return 1 - Math.pow(1 - perFrameEasing, dt / REFERENCE_FRAME_SECONDS);
}
function easeSignature(current, target, factor) {
  for (let i = 0; i < current.length && i < target.length; i++) {
    current[i].frequency += (target[i].frequency - current[i].frequency) * factor;
    current[i].amplitude += (target[i].amplitude - current[i].amplitude) * factor;
    current[i].speed += (target[i].speed - current[i].speed) * factor;
    current[i].phase += (target[i].phase - current[i].phase) * factor;
  }
}
function advanceOscillation(waves, dt) {
  const tau = 2 * Math.PI;
  for (const wave of waves) {
    wave.oscillation = (wave.oscillation + wave.speed * WAVE_TEMPO * dt) % tau;
  }
}
function drawBars(context, width, height, waves, gain) {
  const pitch = BAR_WIDTH + BAR_GAP;
  const count = Math.max(1, Math.floor(width / pitch));
  const inset = (width - (count * pitch - BAR_GAP)) / 2;
  const centerY = height / 2;
  const maxHalf = height / 2;
  for (let index = 0; index < count; index++) {
    const position = count > 1 ? index / (count - 1) : 0;
    const amount = bandFraction(position, waves) * gain;
    const half = Math.max(BAR_MIN / 2, Math.min(maxHalf, amount * maxHalf));
    context.beginPath();
    context.roundRect(inset + index * pitch, centerY - half, BAR_WIDTH, half * 2, BAR_WIDTH / 2);
    context.fill();
  }
}
function bandFraction(position, waves) {
  let amplitude = 0;
  let total = 0;
  for (const wave of waves) {
    const phase = position * wave.frequency * Math.PI * 2 + wave.oscillation + wave.phase;
    amplitude += (0.5 + 0.5 * Math.sin(phase)) * wave.amplitude;
    total += wave.amplitude;
  }
  if (total === 0) {
    return 0;
  }
  const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, position)));
  return amplitude / total * (0.35 + 0.65 * taper);
}
let VoiceModeOnboardingAnimator = class extends Disposable {
  constructor(canvas, container, source, themeService, accessibilityService) {
    super();
    this.canvas = canvas;
    this.container = container;
    this.source = source;
    this.themeService = themeService;
    this.accessibilityService = accessibilityService;
    this.animationFrame = this._register(new MutableDisposable());
    this.width = 0;
    this.height = 0;
    this.running = false;
    this.level = 0;
    /**
     * The stroke colour, taken from the canvas's own computed `color` so CSS
     * owns the tier and theme overrides work for free - the same `currentColor`
     * arrangement the toolbar waveform uses. Cached rather than read per frame:
     * `getComputedStyle` inside the animation loop forces a style recalculation
     * on every tick.
     */
    this.stroke = "";
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create the Voice Mode onboarding canvas context");
    }
    this.context = context;
    this.waves = cloneSignature(this.source.getSignature());
    const targetWindow = dom.getWindow(container);
    const observer = new targetWindow.ResizeObserver(() => this.resize());
    observer.observe(container);
    this._register(toDisposable(() => observer.disconnect()));
    this._register(this.themeService.onDidColorThemeChange(() => {
      this.readStroke();
      this.draw(targetWindow.performance.now());
    }));
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => this.updateMotion()));
    this._register(toDisposable(() => this.stop()));
    this.readStroke();
    this.resize();
    this.updateMotion();
  }
  readStroke() {
    this.stroke = dom.getWindow(this.canvas).getComputedStyle(this.canvas).color;
  }
  updateMotion() {
    if (this.accessibilityService.isMotionReduced()) {
      this.stop();
      this.draw(dom.getWindow(this.container).performance.now());
    } else {
      this.start();
    }
  }
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    const targetWindow = dom.getWindow(this.container);
    const tick = (time) => {
      if (!this.running) {
        return;
      }
      this.draw(time);
      this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(targetWindow.performance.now()));
    };
    this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, () => tick(targetWindow.performance.now()));
  }
  stop() {
    this.running = false;
    this.animationFrame.clear();
  }
  resize() {
    const targetWindow = dom.getWindow(this.container);
    const devicePixelRatio = targetWindow.devicePixelRatio || 1;
    this.width = this.container.offsetWidth;
    this.height = this.container.offsetHeight;
    if (!this.width || !this.height) {
      return;
    }
    this.canvas.width = this.width * devicePixelRatio;
    this.canvas.height = this.height * devicePixelRatio;
    this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    this.draw(targetWindow.performance.now());
  }
  draw(timestamp) {
    if (!this.width || !this.height) {
      return;
    }
    const dt = this.lastTimestamp === void 0 ? 0 : Math.max(0, (timestamp - this.lastTimestamp) * 1e-3);
    this.lastTimestamp = timestamp;
    this.level += (this.source.getLevel() - this.level) * easingFactor(LEVEL_EASING, dt);
    easeSignature(this.waves, this.source.getSignature(), easingFactor(SIGNATURE_EASING, dt));
    advanceOscillation(this.waves, dt * (IDLE_MOTION + this.level * SPEAKING_MOTION));
    const gain = IDLE_GAIN + this.level * SPEAKING_GAIN;
    this.context.clearRect(0, 0, this.width, this.height);
    this.context.fillStyle = this.stroke;
    drawBars(this.context, this.width, this.height, this.waves, gain);
  }
};
VoiceModeOnboardingAnimator = __decorateClass([
  __decorateParam(3, IThemeService),
  __decorateParam(4, IAccessibilityService)
], VoiceModeOnboardingAnimator);
let VoiceSamplePlayer = class extends Disposable {
  constructor(element, audioFactory, logService) {
    super();
    this.element = element;
    this.audioFactory = audioFactory;
    this.logService = logService;
    this.playback = this._register(new MutableDisposable());
    this._onDidChangePlayingVoice = this._register(new Emitter());
    /** Fires with the voice currently being heard, or `undefined` once it stops. */
    this.onDidChangePlayingVoice = this._onDidChangePlayingVoice.event;
    this._register(toDisposable(() => this.stop()));
  }
  get playingVoice() {
    return this._playingVoice;
  }
  /**
   * Current loudness of the sample being played, `0` when silent. The waveform
   * reads this so it moves to the voice the user is actually hearing.
   */
  getLevel() {
    if (!this.analyser || !this.levels || !this._playingVoice) {
      return 0;
    }
    this.analyser.getByteTimeDomainData(this.levels);
    let sum = 0;
    for (const sample of this.levels) {
      const centered = (sample - 128) / 128;
      sum += centered * centered;
    }
    return Math.min(1, Math.sqrt(sum / this.levels.length) * 3.2);
  }
  play(sampleId) {
    this.stop();
    try {
      const audio = this.ensureAudio();
      audio.src = FileAccess.asBrowserUri(`vs/workbench/contrib/agentsVoice/browser/media/${sampleId}.mp3`).toString(true);
      const store = new DisposableStore();
      store.add(dom.addDisposableListener(audio, "ended", () => this.stop()));
      store.add(dom.addDisposableListener(audio, "error", () => this.stop()));
      store.add(toDisposable(() => audio.pause()));
      this.playback.value = store;
      this.setPlayingVoice(sampleId);
      audio.play().catch((error) => {
        this.logService.trace(`[voice] Voice Mode onboarding preview failed: ${error}`);
        this.stop();
      });
    } catch (error) {
      this.logService.trace(`[voice] Voice Mode onboarding preview unavailable: ${error}`);
      this.stop();
    }
  }
  /**
   * Build the audio element and, best-effort, the analyser graph feeding the
   * waveform. Analysis is a nicety: if the Web Audio graph cannot be created
   * the sample still plays, the waveform just keeps its idle motion.
   */
  ensureAudio() {
    if (this.audio) {
      return this.audio;
    }
    const targetWindow = dom.getWindow(this.element);
    const audio = this.audioFactory?.() ?? new targetWindow.Audio();
    this.audio = audio;
    this._register(toDisposable(() => {
      audio.pause();
      audio.src = "";
    }));
    try {
      const context = new targetWindow.AudioContext();
      this._register(toDisposable(() => void context.close().catch(() => {
      })));
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaElementSource(audio).connect(analyser);
      analyser.connect(context.destination);
      this.analyser = analyser;
      this.levels = new Uint8Array(analyser.fftSize);
    } catch (error) {
      this.logService.trace(`[voice] Voice Mode onboarding analyser unavailable: ${error}`);
    }
    return audio;
  }
  stop() {
    this.playback.clear();
    this.setPlayingVoice(void 0);
  }
  setPlayingVoice(voiceId) {
    if (this._playingVoice === voiceId) {
      return;
    }
    this._playingVoice = voiceId;
    this._onDidChangePlayingVoice.fire(voiceId);
  }
};
VoiceSamplePlayer = __decorateClass([
  __decorateParam(2, ILogService)
], VoiceSamplePlayer);
let VoiceModeOnboardingBanner = class extends Disposable {
  constructor(options, commandService, configurationService, contextViewService, accessibilityService, instantiationService, logService, storageService, telemetryService) {
    super();
    this.commandService = commandService;
    this.configurationService = configurationService;
    this.contextViewService = contextViewService;
    this.accessibilityService = accessibilityService;
    this.logService = logService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.microphonePicker = this._register(new MutableDisposable());
    this.microphoneOptions = [];
    this.voiceElements = /* @__PURE__ */ new Map();
    this.options = options;
    this.card = this._register(new ChatInputOnboardingCard({
      container: options.container,
      className: "voice-mode-onboarding-banner",
      ariaLabel: localize("voiceMode.onboarding.region", "Voice Mode introduction"),
      onEscape: () => {
        this.logAction("escape");
        this.options.onDismiss();
      }
    }));
    this.domNode = this.card.domNode;
    this.localizedVoice = localizedVoiceForLanguage(this.resolveSpokenLanguage());
    this.player = this._register(instantiationService.createInstance(VoiceSamplePlayer, this.domNode, options.audioFactory));
    this._register(this.player.onDidChangePlayingVoice((voiceId) => this.updatePlaying(voiceId)));
    const copy = dom.append(this.domNode, dom.$(".voice-mode-onboarding-copy"));
    const title = dom.append(copy, dom.$(".voice-mode-onboarding-title"));
    title.textContent = localize("voiceMode.onboarding.title", "Welcome to Voice Mode");
    this.renderDescription(copy);
    this.renderSharedWaveform(instantiationService);
    this.renderMicrophonePicker();
    const actions = dom.append(this.domNode, dom.$(".voice-mode-onboarding-actions"));
    this.renderVoices(actions);
    this.renderClose();
    this.logAction("shown");
    this.focusForScreenReader();
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.focusForScreenReader()));
  }
  /**
   * The signature the shared trace should be showing: the selected voice's, or
   * {@link RESTING_SIGNATURE} before anything has been chosen.
   */
  currentSignature() {
    return this.selectedVoice?.signature ?? RESTING_SIGNATURE;
  }
  /** The single full-width trace the whole card shares. */
  renderSharedWaveform(instantiationService) {
    const wave = dom.append(this.domNode, dom.$(".voice-mode-onboarding-wave"));
    const canvas = dom.append(wave, dom.$("canvas.voice-mode-onboarding-canvas"));
    canvas.setAttribute("aria-hidden", "true");
    this._register(instantiationService.createInstance(VoiceModeOnboardingAnimator, canvas, wave, {
      getLevel: () => this.player.getLevel(),
      getSignature: () => this.currentSignature()
    }));
  }
  renderMicrophonePicker() {
    this.microphonePickerContainer = dom.append(this.domNode, dom.$(".voice-mode-onboarding-microphone-picker"));
    this.microphoneOptions = [{
      deviceId: "",
      label: localize("voiceMode.onboarding.systemDefault", "System default")
    }];
    this.updateMicrophonePicker();
    const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
    if (mediaDevices) {
      this._register(dom.addDisposableListener(mediaDevices, "devicechange", () => void this.refreshMicrophones()));
      void this.refreshMicrophones();
    }
  }
  async refreshMicrophones() {
    const mediaDevices = dom.getWindow(this.domNode).navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) {
      return;
    }
    let devices;
    try {
      devices = await mediaDevices.enumerateDevices();
    } catch (error) {
      this.logService.trace(`[voice] could not enumerate microphones: ${error}`);
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    const options = buildMicrophoneOptions(devices);
    if (this.microphoneOptions.length > 1 && !options.some((option) => option.deviceId && option.label)) {
      return;
    }
    this.microphoneOptions = options;
    this.updateMicrophonePicker();
  }
  updateMicrophonePicker() {
    if (!this.microphonePickerContainer) {
      return;
    }
    this.microphonePicker.clear();
    dom.clearNode(this.microphonePickerContainer);
    this.microphonePickerContainer.hidden = this.microphoneOptions.length <= 1;
    if (this.microphonePickerContainer.hidden) {
      return;
    }
    dom.append(this.microphonePickerContainer, dom.$(`span.codicon.codicon-${Codicon.mic.id}.voice-mode-onboarding-microphone-icon`)).setAttribute("aria-hidden", "true");
    const selected = indexOfMicrophone(this.microphoneOptions, this.currentMicrophoneId());
    const store = new DisposableStore();
    const selectBox = store.add(new SelectBox(
      this.microphoneOptions.map((option) => ({ text: option.label })),
      selected,
      this.contextViewService,
      { ...defaultSelectBoxStyles, selectBackground: void 0, selectBorder: void 0, selectForeground: void 0 },
      { ariaLabel: localize("voiceMode.onboarding.microphone", "Microphone"), useCustomDrawn: true }
    ));
    selectBox.render(this.microphonePickerContainer);
    store.add(selectBox.onDidSelect((event) => this.selectMicrophone(event.index)));
    this.microphonePicker.value = store;
  }
  currentMicrophoneId() {
    return this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, "");
  }
  selectMicrophone(index) {
    const option = this.microphoneOptions[index];
    if (!option) {
      return;
    }
    this.logAction("selectMicrophone");
    if (option.deviceId) {
      this.storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, option.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
    }
    status(localize("voiceMode.onboarding.microphoneSelected", "{0} selected.", option.label));
  }
  /**
   * The voices as real buttons - border, hover lift, pressed feedback -
   * because bare text gave no sign it could be clicked at all. In a language
   * Voice Mode speaks natively there is only one voice, so the card previews
   * that voice instead of offering the English chooser.
   */
  renderVoices(container) {
    const labelText = localize("voiceMode.onboarding.voices", "Agent Voice:");
    const label = dom.append(container, dom.$(".voice-mode-onboarding-voices-label"));
    label.textContent = labelText;
    if (this.localizedVoice) {
      this.renderLocalizedVoice(container, labelText, this.localizedVoice);
      return;
    }
    const group = dom.append(container, dom.$(".voice-mode-onboarding-voices"));
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", labelText);
    for (const voice of VOICES) {
      const option = dom.append(group, dom.$(".voice-mode-onboarding-voice"));
      option.setAttribute("role", "radio");
      const restingAria = localize("voiceMode.onboarding.voice.ariaLabel", "{0}. Hear this voice and use it for every conversation.", voice.label);
      option.setAttribute("aria-label", restingAria);
      this.appendVoiceIcon(option);
      const label2 = dom.append(option, dom.$("span.voice-mode-onboarding-voice-label"));
      label2.textContent = voice.label;
      this.voiceElements.set(voice.id, { element: option, label: voice.label, restingAria });
      this._register(dom.addDisposableListener(option, dom.EventType.CLICK, () => this.selectVoice(voice)));
      this._register(dom.addDisposableListener(option, dom.EventType.KEY_DOWN, (event) => this.handleOptionKey(event, voice)));
    }
    this.updateSelection();
  }
  /**
   * The single native voice for the spoken language, as a preview button:
   * there is nothing to choose, so it only ever plays and stops.
   */
  renderLocalizedVoice(container, ariaLabel, voice) {
    const group = dom.append(container, dom.$(".voice-mode-onboarding-voices"));
    group.setAttribute("aria-label", ariaLabel);
    const option = dom.append(group, dom.$(".voice-mode-onboarding-voice"));
    option.setAttribute("role", "button");
    option.tabIndex = 0;
    const restingAria = localize("voiceMode.onboarding.voice.previewAriaLabel", "{0}. Hear how your agent will sound.", voice.label);
    option.setAttribute("aria-label", restingAria);
    this.appendVoiceIcon(option);
    const label = dom.append(option, dom.$("span.voice-mode-onboarding-voice-label"));
    label.textContent = voice.label;
    this.voiceElements.set(voice.id, { element: option, label: voice.label, restingAria });
    this._register(dom.addDisposableListener(option, dom.EventType.CLICK, () => this.previewLocalizedVoice(voice)));
    this._register(dom.addDisposableListener(option, dom.EventType.KEY_DOWN, (event) => {
      const keyboardEvent = new StandardKeyboardEvent(event);
      if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
        keyboardEvent.preventDefault();
        this.previewLocalizedVoice(voice);
      }
    }));
  }
  /**
   * The icon is the affordance: it says "this will speak" before the click,
   * animating bars while it speaks, then a check once a voice is chosen.
   */
  appendVoiceIcon(option) {
    const icon = dom.append(option, dom.$("span.voice-mode-onboarding-voice-icon"));
    dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.play.id}.voice-mode-onboarding-voice-idle`)).setAttribute("aria-hidden", "true");
    dom.append(icon, dom.$(`span.codicon.codicon-${Codicon.checkCompact.id}.voice-mode-onboarding-voice-chosen`)).setAttribute("aria-hidden", "true");
    const bars = dom.append(icon, dom.$("span.voice-mode-onboarding-voice-bars"));
    bars.setAttribute("aria-hidden", "true");
    for (let bar = 0; bar < 3; bar++) {
      dom.append(bars, dom.$("span.voice-mode-onboarding-voice-bar"));
    }
  }
  // --- Shared behaviour ---
  handleOptionKey(event, voice) {
    const keyboardEvent = new StandardKeyboardEvent(event);
    if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
      keyboardEvent.preventDefault();
      this.selectVoice(voice);
      return;
    }
    const forward = keyboardEvent.equals(KeyCode.RightArrow) || keyboardEvent.equals(KeyCode.DownArrow);
    const backward = keyboardEvent.equals(KeyCode.LeftArrow) || keyboardEvent.equals(KeyCode.UpArrow);
    if (forward || backward) {
      keyboardEvent.preventDefault();
      const index = VOICES.indexOf(voice);
      const next = VOICES[(index + (forward ? 1 : VOICES.length - 1)) % VOICES.length];
      this.selectVoice(next);
      this.voiceElements.get(next.id)?.element.focus();
    }
  }
  /**
   * One short paragraph: what Voice Mode does, and where to change its
   * settings.
   *
   * `[[...]]` marks each clause that becomes a link, so translators can place
   * it naturally in the sentence instead of receiving a fixed phrase
   * concatenated onto the end.
   */
  renderDescription(container) {
    const description = dom.append(container, dom.$(".voice-mode-onboarding-description"));
    const text = localize({
      key: "voiceMode.onboarding.description",
      comment: [
        "Preserve the double square brackets: they mark the text that becomes a link.",
        "The link opens Voice Mode settings."
      ]
    }, "Choose how your agent speaks to you. Adjust [[settings]] anytime.");
    dom.append(description, renderFormattedText(text, {
      actionHandler: {
        callback: () => {
          this.logAction("openSettings");
          this.commandService.executeCommand(VOICE_SETTINGS_COMMAND).catch((error) => this.logService.error(`[voice] Failed to run ${VOICE_SETTINGS_COMMAND}: ${error}`));
        },
        disposables: this._store
      }
    }, dom.$("span")));
    for (const link of description.querySelectorAll("a")) {
      link.tabIndex = 0;
      link.setAttribute("role", "button");
      this._register(dom.addDisposableListener(link, dom.EventType.KEY_DOWN, (event) => {
        const keyboardEvent = new StandardKeyboardEvent(event);
        if (keyboardEvent.equals(KeyCode.Enter) || keyboardEvent.equals(KeyCode.Space)) {
          keyboardEvent.preventDefault();
          link.click();
        }
      }));
    }
  }
  /**
   * Dismissal is always available and never gated: a disabled close would trap
   * someone in the card. Choosing a voice already commits it, so this is only
   * ever "I am done here" - and closing is what hands the session back.
   */
  renderClose() {
    this.card.addAction({
      className: "voice-mode-onboarding-close",
      ariaLabel: localize("voiceMode.onboarding.close", "Close the introduction"),
      icon: Codicon.closeCompact,
      onActivate: () => this.finish()
    });
  }
  focusForScreenReader() {
    if (this.accessibilityService.isScreenReaderOptimized()) {
      this.domNode.tabIndex = -1;
      this.domNode.focus();
    }
  }
  selectVoice(voice) {
    if (this.player.playingVoice === voice.id) {
      this.player.stop();
      status(localize("voiceMode.onboarding.voice.previewStopped", "{0} preview stopped.", voice.label));
      return;
    }
    this.logAction("selectVoice");
    this.selectedVoice = voice;
    this.updateSelection();
    this.player.play(voice.id);
    status(localize("voiceMode.onboarding.voice.selected", "{0} selected.", voice.label));
    this.configurationService.updateValue(VOICE_SETTING, voice.id, ConfigurationTarget.USER).catch((error) => this.logService.error(`[voice] Failed to persist the Voice Mode voice: ${error}`));
  }
  /**
   * The localized voice is not a choice - it is the only voice for the
   * language - so previewing it just plays and stops, and never persists.
   */
  previewLocalizedVoice(voice) {
    if (this.player.playingVoice === voice.id) {
      this.player.stop();
      status(localize("voiceMode.onboarding.voice.localizedStopped", "{0} preview stopped.", voice.label));
      return;
    }
    this.logAction("previewVoice");
    this.player.play(voice.id);
    status(localize("voiceMode.onboarding.voice.localizedPlaying", "Playing {0} preview.", voice.label));
  }
  /**
   * The spoken language, mirroring the resolution the voice client uses: an
   * explicit test override, then the configured language (unless `auto`), then
   * the window's language.
   */
  resolveSpokenLanguage() {
    if (this.options.voiceLanguage) {
      return this.options.voiceLanguage;
    }
    const configuredLanguage = this.configurationService.getValue(VOICE_LANGUAGE_SETTING)?.trim();
    if (configuredLanguage && configuredLanguage.toLowerCase() !== "auto") {
      return configuredLanguage;
    }
    return dom.getWindow(this.domNode).navigator.language;
  }
  updateSelection() {
    for (const [id, entry] of this.voiceElements) {
      const selected = id === this.selectedVoice?.id;
      entry.element.classList.toggle("selected", selected);
      entry.element.setAttribute("aria-checked", String(selected));
    }
    this.updateTabStop();
  }
  /**
   * Keeps a single tab stop on the group: the chosen voice, or the first one
   * when nothing has been chosen yet.
   */
  updateTabStop() {
    let first = true;
    for (const [id, entry] of this.voiceElements) {
      const isTabStop = this.selectedVoice === void 0 ? first : id === this.selectedVoice.id;
      entry.element.tabIndex = isTabStop ? 0 : -1;
      first = false;
    }
  }
  updatePlaying(playingVoice) {
    for (const [id, entry] of this.voiceElements) {
      const playing = id === playingVoice;
      entry.element.classList.toggle("playing", playing);
      entry.element.setAttribute("aria-label", playing ? localize("voiceMode.onboarding.voice.stopPreview", "Stop {0} preview.", entry.label) : entry.restingAria);
    }
    this.domNode.classList.toggle("playing", playingVoice !== void 0);
  }
  finish() {
    this.player.stop();
    this.logAction("close");
    this.options.onDismiss();
  }
  logAction(action) {
    this.telemetryService.publicLog2(
      "voiceModeOnboarding.action",
      { action, source: this.options.source }
    );
  }
};
VoiceModeOnboardingBanner = __decorateClass([
  __decorateParam(1, ICommandService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IAccessibilityService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, ITelemetryService)
], VoiceModeOnboardingBanner);
const IVoiceModeOnboardingService = createDecorator("voiceModeOnboardingService");
let VoiceModeOnboardingService = class extends Disposable {
  constructor(instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.onboarding = this._register(this.instantiationService.createInstance(ChatInputOnboarding, {
      storageKey: AgentsVoiceStorageKeys.IntroBannerShown,
      hostClass: "has-voice-mode-onboarding"
    }));
  }
  get isVisible() {
    return this.onboarding.isVisible;
  }
  registerHost(container, focusRoot, focus, tipContainer, onDidChangeVisible) {
    return this.onboarding.registerHost(container, focusRoot, focus, tipContainer, onDidChangeVisible);
  }
  showIfNeeded() {
    this.onboarding.showIfNeeded((context) => this.createBanner(context, "automatic"));
  }
  show() {
    return this.onboarding.show((context) => this.createBanner(context, "manual"));
  }
  createBanner(context, source) {
    return this.instantiationService.createInstance(VoiceModeOnboardingBanner, {
      container: context.container,
      onDismiss: () => context.dismiss(dom.isAncestorOfActiveElement(context.container)),
      source
    });
  }
};
VoiceModeOnboardingService = __decorateClass([
  __decorateParam(0, IInstantiationService)
], VoiceModeOnboardingService);
registerSingleton(IVoiceModeOnboardingService, VoiceModeOnboardingService, InstantiationType.Delayed);
export {
  IVoiceModeOnboardingService,
  VoiceModeOnboardingBanner,
  VoiceModeOnboardingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvdm9pY2VNb2RlT25ib2FyZGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0T25ib2FyZGluZywgQ2hhdElucHV0T25ib2FyZGluZ0NhcmQsIElDaGF0SW5wdXRPbmJvYXJkaW5nQ29udGV4dCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0T25ib2FyZGluZy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0U2VsZWN0Qm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IEFnZW50c1ZvaWNlU3RvcmFnZUtleXMgfSBmcm9tICcuLi9jb21tb24vYWdlbnRzVm9pY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRNaWNyb3Bob25lT3B0aW9ucywgSU1pY3JvcGhvbmVPcHRpb24sIGluZGV4T2ZNaWNyb3Bob25lIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3NwZWVjaFRvVGV4dC9kaWN0YXRpb25PbmJvYXJkaW5nLmpzJztcbmltcG9ydCAnLi9tZWRpYS92b2ljZU1vZGVPbmJvYXJkaW5nLmNzcyc7XG5cbi8qKiBTZXR0aW5nIHRoZSBiYW5uZXIgd3JpdGVzIHdoZW4gYSB2b2ljZSBjaGlwIGlzIHBpY2tlZC4gKi9cbmNvbnN0IFZPSUNFX1NFVFRJTkcgPSAnYWdlbnRzLnZvaWNlLnZvaWNlJztcblxuLyoqIFNldHRpbmcgdGhhdCBjb250cm9scyB0aGUgbGFuZ3VhZ2UgVm9pY2UgTW9kZSBzcGVha3MuICovXG5jb25zdCBWT0lDRV9MQU5HVUFHRV9TRVRUSU5HID0gJ2FnZW50cy52b2ljZS5sYW5ndWFnZSc7XG5cbi8qKiBXaGVyZSB0aGUgZmlyc3QgbGluayBzZW5kcyBhbnlvbmUgd2hvIHdhbnRzIHRvIGNoYW5nZSB0aGVpciBtaW5kIGxhdGVyLiAqL1xuY29uc3QgVk9JQ0VfU0VUVElOR1NfQ09NTUFORCA9ICdhZ2VudHNWb2ljZS5vcGVuU2V0dGluZ3MnO1xuXG50eXBlIFZvaWNlTW9kZU9uYm9hcmRpbmdBY3Rpb24gPSAnc2hvd24nIHwgJ3NlbGVjdFZvaWNlJyB8ICdwcmV2aWV3Vm9pY2UnIHwgJ3NlbGVjdE1pY3JvcGhvbmUnIHwgJ29wZW5TZXR0aW5ncycgfCAnY2xvc2UnIHwgJ2VzY2FwZSc7XG5cbnR5cGUgVm9pY2VNb2RlT25ib2FyZGluZ0FjdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRhY3Rpb246IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGFjdGlvbiB0YWtlbiBpbiB0aGUgVm9pY2UgTW9kZSBvbmJvYXJkaW5nIGNhcmQuJyB9O1xuXHRzb3VyY2U6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgY2FyZCBhcHBlYXJlZCBhdXRvbWF0aWNhbGx5IG9uIGZpcnN0IHVzZSBvciB3YXMgb3BlbmVkIG1hbnVhbGx5LicgfTtcblx0b3duZXI6ICdtZWdhbnJvZ2dlJztcblx0Y29tbWVudDogJ1RyYWNrcyBlbmdhZ2VtZW50IHdpdGggdGhlIFZvaWNlIE1vZGUgb25ib2FyZGluZyBjYXJkLic7XG59O1xuXG50eXBlIFZvaWNlTW9kZU9uYm9hcmRpbmdBY3Rpb25FdmVudCA9IHtcblx0YWN0aW9uOiBWb2ljZU1vZGVPbmJvYXJkaW5nQWN0aW9uO1xuXHRzb3VyY2U6ICdhdXRvbWF0aWMnIHwgJ21hbnVhbCc7XG59O1xuXG4vKipcbiAqIFRoZSB2b2ljZXMgVm9pY2UgTW9kZSBhY3R1YWxseSBzcGVha3Mgd2l0aCAobWlycm9ycyB0aGUgYGFnZW50cy52b2ljZS52b2ljZWBcbiAqIGVudW0pLiBFYWNoIG9uZSBzaGlwcyBhIHNob3J0IHByZS1yZWNvcmRlZCBzYW1wbGUgcmVuZGVyZWQgd2l0aCB0aGF0IGV4YWN0XG4gKiBtb2RlbCB2b2ljZSwgc28gdGhlIHByZXZpZXcgYSB1c2VyIGhlYXJzIGluIHRoZSBiYW5uZXIgaXMgd2hhdCB0aGV5IGdldCBpbiBhXG4gKiByZWFsIGNvbnZlcnNhdGlvbi5cbiAqL1xuaW50ZXJmYWNlIElWb2ljZU1vZGVWb2ljZSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdC8qKiBUaGlzIHZvaWNlJ3Mgd2F2ZWZvcm0gdGV4dHVyZS4gU2VlIHtAbGluayBJV2F2ZX0uICovXG5cdHJlYWRvbmx5IHNpZ25hdHVyZTogcmVhZG9ubHkgSVdhdmVbXTtcbn1cblxuLyoqXG4gKiBPbmUgc2luZSBjb21wb25lbnQgb2YgYSB3YXZlZm9ybSB0ZXh0dXJlLiBBIHZvaWNlJ3Mgc2lnbmF0dXJlIGlzIGEgaGFuZGZ1bCBvZlxuICogdGhlc2Ugc3VtbWVkIHRvZ2V0aGVyLCB3aGljaCBpcyB3aGF0IGdpdmVzIGVhY2ggdm9pY2UgYSByZWNvZ25pc2FibHlcbiAqIGRpZmZlcmVudCB0cmFjZSByYXRoZXIgdGhhbiBmb3VyIGNvcGllcyBvZiB0aGUgc2FtZSByaXBwbGUuXG4gKi9cbmludGVyZmFjZSBJV2F2ZSB7XG5cdHJlYWRvbmx5IGZyZXF1ZW5jeTogbnVtYmVyO1xuXHRyZWFkb25seSBhbXBsaXR1ZGU6IG51bWJlcjtcblx0cmVhZG9ubHkgc3BlZWQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcGhhc2U6IG51bWJlcjtcbn1cblxuY29uc3QgVk9JQ0VTOiByZWFkb25seSBJVm9pY2VNb2RlVm9pY2VbXSA9IFtcblx0e1xuXHRcdGlkOiAnbWF5YV9uZXV0cmFsJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLm1heWEnLCBcIk1heWEgKERlZmF1bHQpXCIpLFxuXHRcdC8vIEZsb3dpbmcgbWlkLXJhbmdlOiBldmVuIHNwcmVhZCwgZ2VudGxlIGRyaWZ0LlxuXHRcdHNpZ25hdHVyZTogW1xuXHRcdFx0eyBmcmVxdWVuY3k6IDEuMCwgYW1wbGl0dWRlOiAwLjQyLCBzcGVlZDogMC40MiwgcGhhc2U6IDAuMCB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDEuNywgYW1wbGl0dWRlOiAwLjI2LCBzcGVlZDogLTAuMzEsIHBoYXNlOiAxLjEgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiAyLjYsIGFtcGxpdHVkZTogMC4xOSwgc3BlZWQ6IDAuMjQsIHBoYXNlOiAyLjQgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiA0LjEsIGFtcGxpdHVkZTogMC4xMywgc3BlZWQ6IC0wLjE4LCBwaGFzZTogMC43IH0sXG5cdFx0XSxcblx0fSxcblx0e1xuXHRcdGlkOiAndmljdG9yaWFfbmV1dHJhbCcsXG5cdFx0bGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS52aWN0b3JpYScsIFwiVmljdG9yaWFcIiksXG5cdFx0Ly8gQnJpZ2h0IGFuZCBxdWljazogaGlnaGVyIGZyZXF1ZW5jaWVzLCB0aWdodGVyIHJpcHBsZS5cblx0XHRzaWduYXR1cmU6IFtcblx0XHRcdHsgZnJlcXVlbmN5OiAxLjQsIGFtcGxpdHVkZTogMC4zOCwgc3BlZWQ6IDAuNTIsIHBoYXNlOiAwLjAgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiAyLjMsIGFtcGxpdHVkZTogMC4yNywgc3BlZWQ6IC0wLjM4LCBwaGFzZTogMS4xIH0sXG5cdFx0XHR7IGZyZXF1ZW5jeTogMy42LCBhbXBsaXR1ZGU6IDAuMjEsIHNwZWVkOiAwLjMwLCBwaGFzZTogMi40IH0sXG5cdFx0XHR7IGZyZXF1ZW5jeTogNS4yLCBhbXBsaXR1ZGU6IDAuMTQsIHNwZWVkOiAtMC4yMiwgcGhhc2U6IDAuNyB9LFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHRpZDogJ2tldmluX25ldXRyYWwnLFxuXHRcdGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2Uua2V2aW4nLCBcIktldmluXCIpLFxuXHRcdC8vIExvdyBhbmQgYnJvYWQ6IGxvbmcgc3dlbGxzIHdpdGggbGl0dGxlIGhpZ2gtZnJlcXVlbmN5IGRldGFpbC5cblx0XHRzaWduYXR1cmU6IFtcblx0XHRcdHsgZnJlcXVlbmN5OiAwLjcsIGFtcGxpdHVkZTogMC40OCwgc3BlZWQ6IDAuMzAsIHBoYXNlOiAwLjQgfSxcblx0XHRcdHsgZnJlcXVlbmN5OiAxLjIsIGFtcGxpdHVkZTogMC4yOCwgc3BlZWQ6IC0wLjIyLCBwaGFzZTogMS43IH0sXG5cdFx0XHR7IGZyZXF1ZW5jeTogMi4wLCBhbXBsaXR1ZGU6IDAuMTYsIHNwZWVkOiAwLjE4LCBwaGFzZTogMC45IH0sXG5cdFx0XHR7IGZyZXF1ZW5jeTogMy4xLCBhbXBsaXR1ZGU6IDAuMDksIHNwZWVkOiAtMC4xNCwgcGhhc2U6IDIuMiB9LFxuXHRcdF0sXG5cdH0sXG5cdHtcblx0XHRpZDogJ2RhbmllbF9uZXV0cmFsJyxcblx0XHRsYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLmRhbmllbCcsIFwiRGFuaWVsXCIpLFxuXHRcdC8vIFN0ZWFkeSBhbmQgbWVhc3VyZWQ6IHNsb3cgZHJpZnQsIGNhbG0gcmVndWxhciBjcmVzdHMuXG5cdFx0c2lnbmF0dXJlOiBbXG5cdFx0XHR7IGZyZXF1ZW5jeTogMC45LCBhbXBsaXR1ZGU6IDAuNDQsIHNwZWVkOiAwLjI0LCBwaGFzZTogMS4zIH0sXG5cdFx0XHR7IGZyZXF1ZW5jeTogMS41LCBhbXBsaXR1ZGU6IDAuMzAsIHNwZWVkOiAtMC4xOCwgcGhhc2U6IDAuMiB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDIuNCwgYW1wbGl0dWRlOiAwLjE0LCBzcGVlZDogMC4xNSwgcGhhc2U6IDIuMCB9LFxuXHRcdFx0eyBmcmVxdWVuY3k6IDMuNCwgYW1wbGl0dWRlOiAwLjEwLCBzcGVlZDogLTAuMTIsIHBoYXNlOiAxLjUgfSxcblx0XHRdLFxuXHR9LFxuXTtcblxuLyoqXG4gKiBBIGxhbmd1YWdlIFZvaWNlIE1vZGUgc3BlYWtzIG5hdGl2ZWx5LCBhbmQgdGhlIHNpbmdsZSB2b2ljZSBpdHMgYmFja2VuZCB1c2VzXG4gKiBmb3IgdGhhdCBsYW5ndWFnZS4gQ2hvb3NpbmcgYmV0d2VlbiB2b2ljZXMgaXMgYW4gRW5nbGlzaC1vbmx5IGFmZm9yZGFuY2UsIHNvXG4gKiBmb3IgdGhlc2UgbGFuZ3VhZ2VzIHRoZSBjYXJkIHByZXZpZXdzIHRoaXMgb25lIHZvaWNlIHJhdGhlciB0aGFuIHRoZSBmb3VyXG4gKiBFbmdsaXNoIG9wdGlvbnMuXG4gKi9cbmludGVyZmFjZSBJTG9jYWxpemVkVm9pY2Uge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG5jb25zdCBMT0NBTElaRURfVk9JQ0VTOiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBJTG9jYWxpemVkVm9pY2U+PiA9IHtcblx0ZGU6IHsgaWQ6ICdkZV9tYXJjX25ldXRyYWwnLCBsYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLm1hcmMnLCBcIk1hcmNcIikgfSxcblx0ZXM6IHsgaWQ6ICdlcy1FU19tYXJpYV9uZXV0cmFsJywgbGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5tYXJpYScsIFwiTWFyaWFcIikgfSxcblx0ZnI6IHsgaWQ6ICdmcl9kYXZpZF9uZXV0cmFsJywgbGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5kYXZpZCcsIFwiRGF2aWRcIikgfSxcblx0aXQ6IHsgaWQ6ICdpdF9ldmFfbmV1dHJhbCcsIGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UuZXZhJywgXCJFdmFcIikgfSxcblx0amE6IHsgaWQ6ICdqYV9hcnVoYV9uZXV0cmFsJywgbGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5hcnVoYScsIFwiQXJ1aGFcIikgfSxcblx0a286IHsgaWQ6ICdrb19qaXlvbl9uZXV0cmFsJywgbGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS5qaXlvbicsIFwiSml5b25cIikgfSxcblx0cHQ6IHsgaWQ6ICdwdC1CUl9naWxfbmV1dHJhbCcsIGxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UuZ2lsJywgXCJHaWxcIikgfSxcblx0emg6IHsgaWQ6ICd6aF93dXpoaV9uZXV0cmFsJywgbGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy52b2ljZS53dXpoaScsIFwiV3V6aGlcIikgfSxcbn07XG5cbi8qKlxuICogVGhlIG5hdGl2ZSB2b2ljZSBmb3IgYSBzcG9rZW4gbGFuZ3VhZ2UsIG9yIGB1bmRlZmluZWRgIHdoZW4gdGhlIGxhbmd1YWdlIGhhc1xuICogbm8gbmF0aXZlIHZvaWNlIGFuZCB0aGUgY2FyZCBzaG91bGQgZmFsbCBiYWNrIHRvIHRoZSBFbmdsaXNoIHZvaWNlIGNob29zZXIuXG4gKi9cbmZ1bmN0aW9uIGxvY2FsaXplZFZvaWNlRm9yTGFuZ3VhZ2UobGFuZ3VhZ2U6IHN0cmluZyk6IElMb2NhbGl6ZWRWb2ljZSB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgY2Fub25pY2FsID0gSW50bC5nZXRDYW5vbmljYWxMb2NhbGVzKGxhbmd1YWdlLnRyaW0oKSlbMF07XG5cdFx0Y29uc3QgYmFzZSA9IGNhbm9uaWNhbD8uc3BsaXQoJy0nKVswXS50b0xvd2VyQ2FzZSgpO1xuXHRcdHJldHVybiBiYXNlID8gTE9DQUxJWkVEX1ZPSUNFU1tiYXNlXSA6IHVuZGVmaW5lZDtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFRoZSB0cmFjZSBiZWZvcmUgYW55b25lIGhhcyBjaG9zZW46IHRoZSBmb3VyIHNpZ25hdHVyZXMgYXZlcmFnZWQgY29tcG9uZW50IGJ5XG4gKiBjb21wb25lbnQsIHNvIGl0IGJlbG9uZ3MgdG8gbm8gdm9pY2UgaW4gcGFydGljdWxhciByYXRoZXIgdGhhbiBxdWlldGx5IGJlaW5nXG4gKiB0aGUgZmlyc3Qgb25lIGluIHRoZSBsaXN0LiBUaGUgZGVjbGFyZWQgcGhhc2VzIGFsbCBzaXQgd2l0aGluIGEgY291cGxlIG9mXG4gKiByYWRpYW5zIG9mIGVhY2ggb3RoZXIsIHNvIGEgcGxhaW4gbWVhbiBsYW5kcyBiZXR3ZWVuIHRoZW0gcmF0aGVyIHRoYW4gb24gdGhlXG4gKiBmYXIgc2lkZSBvZiB0aGUgY2lyY2xlLlxuICovXG5jb25zdCBSRVNUSU5HX1NJR05BVFVSRTogcmVhZG9ubHkgSVdhdmVbXSA9IFZPSUNFU1swXS5zaWduYXR1cmUubWFwKChfLCBpbmRleCkgPT4ge1xuXHRjb25zdCBjb21wb25lbnRzID0gVk9JQ0VTLm1hcCh2b2ljZSA9PiB2b2ljZS5zaWduYXR1cmVbaW5kZXhdKTtcblx0Y29uc3QgbWVhbiA9IChwaWNrOiAod2F2ZTogSVdhdmUpID0+IG51bWJlcikgPT5cblx0XHRjb21wb25lbnRzLnJlZHVjZSgoc3VtLCB3YXZlKSA9PiBzdW0gKyBwaWNrKHdhdmUpLCAwKSAvIGNvbXBvbmVudHMubGVuZ3RoO1xuXHRyZXR1cm4ge1xuXHRcdGZyZXF1ZW5jeTogbWVhbih3YXZlID0+IHdhdmUuZnJlcXVlbmN5KSxcblx0XHRhbXBsaXR1ZGU6IG1lYW4od2F2ZSA9PiB3YXZlLmFtcGxpdHVkZSksXG5cdFx0c3BlZWQ6IG1lYW4od2F2ZSA9PiB3YXZlLnNwZWVkKSxcblx0XHRwaGFzZTogbWVhbih3YXZlID0+IHdhdmUucGhhc2UpLFxuXHR9O1xufSk7XG5cbi8qKlxuICogSG93IGxvbmcgdGhlIGRvbWluYW50IGNvbXBvbmVudCB0YWtlcyB0byBjb21wbGV0ZSBvbmUgY3ljbGUsIG1hdGNoaW5nIHRoZVxuICogYGNoYXQtdm9pY2UtaW5wdXQtbW9kZS13YXZlYCBrZXlmcmFtZSB0aGUgdG9vbGJhciB3YXZlZm9ybSBpZGxlcyBvbi4gU2FtZVxuICogaW5zdHJ1bWVudCwgc2FtZSB0ZW1wby5cbiAqL1xuY29uc3QgSURMRV9DWUNMRV9TRUNPTkRTID0gMi42O1xuXG4vKipcbiAqIFNjYWxlcyBldmVyeSBkZWNsYXJlZCBgc3BlZWRgIHNvIHRoZSByZXN0aW5nIHRyYWNlIGN5Y2xlcyBhdFxuICoge0BsaW5rIElETEVfQ1lDTEVfU0VDT05EU30uIFRoZSBzaWduYXR1cmVzIGFyZSB3cml0dGVuIGFzIGEgKnJlbGF0aXZlKiBzZXQgLVxuICogY29tcG9uZW50IDEgZHJpZnRzIGFnYWluc3QgY29tcG9uZW50IDAsIGFuZCBzbyBvbiAtIHdoaWNoIG1ha2VzIHRoZW1cbiAqIHJlYWRhYmxlLCBidXQgdGFrZW4gbGl0ZXJhbGx5IHRoZSBkb21pbmFudCBjb21wb25lbnQgdHVybnMgb25jZSBldmVyeSB+MTdcbiAqIHNlY29uZHMuIFRoYXQgaXMgcm91Z2hseSAxcHggb2YgbW92ZW1lbnQgcGVyIGJhciBwZXIgc2Vjb25kOiB0ZWNobmljYWxseVxuICogYW5pbWF0aW5nLCB2aXNpYmx5IGZyb3plbi4gRGVyaXZlZCByYXRoZXIgdGhhbiBoYXJkY29kZWQgc28gZWRpdGluZyBhXG4gKiBzaWduYXR1cmUgY2Fubm90IHNpbGVudGx5IHB1dCB0aGUgdHJhY2UgYmFjayB0byBzbGVlcC5cbiAqL1xuY29uc3QgV0FWRV9URU1QTyA9ICgyICogTWF0aC5QSSkgLyBJRExFX0NZQ0xFX1NFQ09ORFMgLyBNYXRoLmFicyhSRVNUSU5HX1NJR05BVFVSRVswXS5zcGVlZCk7XG5cbi8vIC0tLSBXYXZlZm9ybSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogQW1wbGl0dWRlIHdpdGggbm90aGluZyBwbGF5aW5nOiBwcmVzZW50LCBidXQgY2xlYXJseSBhdCByZXN0LiAqL1xuY29uc3QgSURMRV9HQUlOID0gMC41O1xuLyoqXG4gKiBFeHRyYSBhbXBsaXR1ZGUgYXQgcGVhayBsb3VkbmVzcy4gTWF0Y2hlZCB0byB0aGUgZGljdGF0aW9uIGNhcmQncyB3YXZlZm9ybSBzb1xuICogdGhlIHRyYWNlIGNsZWFybHkgc3dlbGxzIHdpdGggdGhlIHZvaWNlIGJlaW5nIHByZXZpZXdlZCByYXRoZXIgdGhhbiBvbmx5XG4gKiBudWRnaW5nIC0gdGhlIGNhcmQncyBqb2IgaXMgdG8gbGV0IHlvdSBoZWFyIChhbmQgc2VlKSBlYWNoIHZvaWNlLCBhbmQgYSB0cmFjZVxuICogdGhhdCBhbnN3ZXJzIHRoZSBzYW1wbGUgcmVhZHMgYXMgcmVzcG9uZGluZyB0byBpdC5cbiAqL1xuY29uc3QgU1BFQUtJTkdfR0FJTiA9IDAuNDU7XG4vKipcbiAqIEhvdyBtdWNoIG9mIHRoZSB0cmF2ZWxsaW5nIG1vdGlvbiBpcyBhbHdheXMgcHJlc2VudCwgdmVyc3VzIGRyaXZlbiBieSB0aGVcbiAqIHNhbXBsZS4gQXQgcmVzdCB0aGUgdHJhY2UgZHJpZnRzIHNsb3dseSAtIGFsaXZlLCBub3QgZnJvemVuIC0gYW5kIGl0IGZsb3dzIGluXG4gKiBlYXJuZXN0IG9ubHkgd2hpbGUgYSB2b2ljZSBwbGF5cywgc28gdGhlIG1vdmVtZW50IGl0c2VsZiByZWFkcyBhcyBhIHJlc3BvbnNlIHRvXG4gKiB0aGUgdm9pY2UgeW91IGp1c3QgcGlja2VkIHJhdGhlciB0aGFuIGlkbGUgZGVjb3JhdGlvbi5cbiAqL1xuY29uc3QgSURMRV9NT1RJT04gPSAwLjI7XG4vKiogQWRkaXRpb25hbCB0cmF2ZWxsaW5nIHNwZWVkIGF0IHBlYWsgbG91ZG5lc3MsIG9uIHRvcCBvZiB7QGxpbmsgSURMRV9NT1RJT059LiAqL1xuY29uc3QgU1BFQUtJTkdfTU9USU9OID0gMC44O1xuLyoqXG4gKiBIb3cgcXVpY2tseSB0aGUgYmFuZCBjaGFzZXMgdGhlIGF1ZGlvLCBwZXIge0BsaW5rIFJFRkVSRU5DRV9GUkFNRV9TRUNPTkRTfS5cbiAqIExvdyBhbmQgc2xvdyByZWFkcyBhcyBzbW9vdGguXG4gKi9cbmNvbnN0IExFVkVMX0VBU0lORyA9IDAuMDg7XG4vKipcbiAqIEhvdyBxdWlja2x5IHRoZSB0cmFjZSBtb3JwaHMgZnJvbSBvbmUgdm9pY2UncyBzaWduYXR1cmUgdG8gYW5vdGhlciwgcGVyXG4gKiB7QGxpbmsgUkVGRVJFTkNFX0ZSQU1FX1NFQ09ORFN9LlxuICovXG5jb25zdCBTSUdOQVRVUkVfRUFTSU5HID0gMC4wNjtcbi8qKlxuICogVGhlIGZyYW1lIGR1cmF0aW9uIHRoZSBlYXNlZCBjb25zdGFudHMgYWJvdmUgYXJlIHR1bmVkIGFnYWluc3QgKDYwZnBzKS4gRWFzaW5nXG4gKiBhbmQgdGhlIHBoYXNlIGFkdmFuY2UgYXJlIHNjYWxlZCBieSB0aGUgcmVhbCBlbGFwc2VkIHRpbWUgZWFjaCBmcmFtZSBzbyB0aGVcbiAqIG1vdGlvbiBydW5zIGF0IHRoZSBzYW1lIHJlYWwtdGltZSBwYWNlIHdoZXRoZXIgZnJhbWVzIGFycml2ZSBvbiB0aW1lIG9yIHN0dXR0ZXJcbiAqIC0gd2hpY2ggdGhleSBkbyB3aGlsZSBhIHNhbXBsZSBwbGF5cyBhbmQgdGhlIHBlci1mcmFtZSBhbmFseXNlciByZWFkIGNvbXBldGVzXG4gKiBmb3IgdGhlIG1haW4gdGhyZWFkLiBTY2FsaW5nIGJ5IHJlYWwgdGltZSAocmF0aGVyIHRoYW4gYSBmaXhlZCBwZXItZnJhbWUgc3RlcClcbiAqIGlzIHdoYXQga2VlcHMgdGhlIHRyYWNlIG1vdmluZyBhdCBmdWxsIHNwZWVkIHVuZGVyIHRoYXQgbG9hZCBpbnN0ZWFkIG9mIHN0YWxsaW5nLlxuICovXG5jb25zdCBSRUZFUkVOQ0VfRlJBTUVfU0VDT05EUyA9IDEgLyA2MDtcbi8qKlxuICogQmFyIG1ldHJpY3MsIHRha2VuIGZyb20gVm9pY2UgTW9kZSdzIG93biB3YXZlZm9ybSBpbiBgdm9pY2VJbnB1dE1vZGUuY3NzYCxcbiAqIHdoaWNoIHN0YXRlcyB0aGUgcnVsZSBkaXJlY3RseTogKmJhcnMgYXJlIHN0cm9rZXMsIG5vdCBzaGFwZXMqIC0gdGhleSBjYXJyeVxuICogdGhlIHNhbWUgdmlzdWFsIHdlaWdodCBhcyB0aGUgY29kaWNvbiBnbHlwaHMgYmVzaWRlIHRoZW0gc28gdGhlIHdhdmVmb3JtXG4gKiBuZXZlciByZWFkcyBhcyBib2xkZXIgdGhhbiB0aGUgbWljLiBTYW1lIDFweCBzdHJva2UgYW5kIDJweCBnYXAgaGVyZSwganVzdFxuICogbWFueSBtb3JlIG9mIHRoZW0uXG4gKi9cbmNvbnN0IEJBUl9XSURUSCA9IDE7XG5jb25zdCBCQVJfR0FQID0gMjtcbi8qKiBTaG9ydGVzdCBhIGJhciBldmVyIGdldHM6IGEgZG90LCBzbyBhIHJlc3RpbmcgYmFyIGtlZXBzIGl0cyByb3VuZCBjYXAuICovXG5jb25zdCBCQVJfTUlOID0gMTtcblxuLyoqIEEgc2lnbmF0dXJlIGNvbXBvbmVudCB3aXRoIGFuIGluY3JlbWVudGFsbHkgYWNjdW11bGF0ZWQgYW5pbWF0aW9uIHBoYXNlLiAqL1xudHlwZSBNdXRhYmxlV2F2ZSA9IHsgZnJlcXVlbmN5OiBudW1iZXI7IGFtcGxpdHVkZTogbnVtYmVyOyBzcGVlZDogbnVtYmVyOyBwaGFzZTogbnVtYmVyOyBvc2NpbGxhdGlvbjogbnVtYmVyIH07XG5cbmZ1bmN0aW9uIGNsb25lU2lnbmF0dXJlKHNpZ25hdHVyZTogcmVhZG9ubHkgSVdhdmVbXSk6IE11dGFibGVXYXZlW10ge1xuXHRyZXR1cm4gc2lnbmF0dXJlLm1hcCh3YXZlID0+ICh7IC4uLndhdmUsIG9zY2lsbGF0aW9uOiAwIH0pKTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0IGEgcGVyLXtAbGluayBSRUZFUkVOQ0VfRlJBTUVfU0VDT05EU30gZWFzaW5nIGNvbnN0YW50IGludG8gdGhlIGZyYWN0aW9uXG4gKiB0byBlYXNlIGJ5IGFjcm9zcyBgZHRgIHNlY29uZHMsIHNvIHRoZSBtb3JwaCBzZXR0bGVzIGF0IHRoZSBzYW1lIHJlYWwtdGltZSByYXRlXG4gKiByZWdhcmRsZXNzIG9mIGZyYW1lIHJhdGUuIFJlZHVjZXMgdG8gdGhlIHJhdyBjb25zdGFudCB3aGVuIGBkdGAgaXMgZXhhY3RseSBvbmVcbiAqIHJlZmVyZW5jZSBmcmFtZS5cbiAqL1xuZnVuY3Rpb24gZWFzaW5nRmFjdG9yKHBlckZyYW1lRWFzaW5nOiBudW1iZXIsIGR0OiBudW1iZXIpOiBudW1iZXIge1xuXHRyZXR1cm4gMSAtIE1hdGgucG93KDEgLSBwZXJGcmFtZUVhc2luZywgZHQgLyBSRUZFUkVOQ0VfRlJBTUVfU0VDT05EUyk7XG59XG5cbi8qKlxuICogRWFzZSBhIHNpZ25hdHVyZSB0b3dhcmRzIGEgdGFyZ2V0IGluIHBsYWNlLiBNb3JwaGluZyB0aGUgbnVtYmVycyByYXRoZXIgdGhhblxuICogc3dhcHBpbmcgdGhlbSBpcyB3aGF0IG1ha2VzIGEgdm9pY2UgY2hhbmdlIHJlYWQgYXMgdGhlIHRyYWNlICpiZWNvbWluZyogdGhlXG4gKiBuZXcgdm9pY2UgaW5zdGVhZCBvZiBjdXR0aW5nIHRvIGl0LlxuICpcbiAqIGBwaGFzZWAgZWFzZXMgd2l0aCB0aGUgcmVzdDogaXQgaXMgYSBzdGF0aWMgb2Zmc2V0IHBlciBjb21wb25lbnQgKHRoZSBtb3Rpb25cbiAqIGNvbWVzIGZyb20gdGhlIGFjY3VtdWxhdGVkIGBvc2NpbGxhdGlvbmApLCBzbyBsZWF2aW5nIGl0IGJlaGluZCB3b3VsZCBzdHJhbmRcbiAqIGV2ZXJ5IHZvaWNlIG9uIHdoaWNoZXZlciBwaGFzZXMgdGhlIHRyYWNlIGhhcHBlbmVkIHRvIHN0YXJ0IHdpdGguIEV2ZXJ5IGRlY2xhcmVkXG4gKiBwaGFzZSBzaXRzIHdpdGhpbiBhIHJhZGlhbiBvciB0d28gb2YgaXRzIG5laWdoYm91cnMsIHdlbGwgaW5zaWRlIGhhbGYgYSB0dXJuLCBzb1xuICogZWFzaW5nIHN0cmFpZ2h0IHRvIHRoZSB0YXJnZXQgaXMgYWxzbyB0aGUgc2hvcnRlc3Qgd2F5IHJvdW5kIHRoZSBjaXJjbGUuXG4gKlxuICogYG9zY2lsbGF0aW9uYCBpcyBkZWxpYmVyYXRlbHkgbGVmdCB1bnRvdWNoZWQ6IGl0IGlzIHdoZXJlIHRoZSBjb21wb25lbnQgaXMgaW4gaXRzXG4gKiBjeWNsZSwgbm90IHBhcnQgb2YgdGhlIHRhcmdldCB0ZXh0dXJlLCBzbyBpdCBrZWVwcyBmbG93aW5nIGFjcm9zcyB0aGUgbW9ycGguXG4gKi9cbmZ1bmN0aW9uIGVhc2VTaWduYXR1cmUoY3VycmVudDogTXV0YWJsZVdhdmVbXSwgdGFyZ2V0OiByZWFkb25seSBJV2F2ZVtdLCBmYWN0b3I6IG51bWJlcik6IHZvaWQge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGN1cnJlbnQubGVuZ3RoICYmIGkgPCB0YXJnZXQubGVuZ3RoOyBpKyspIHtcblx0XHRjdXJyZW50W2ldLmZyZXF1ZW5jeSArPSAodGFyZ2V0W2ldLmZyZXF1ZW5jeSAtIGN1cnJlbnRbaV0uZnJlcXVlbmN5KSAqIGZhY3Rvcjtcblx0XHRjdXJyZW50W2ldLmFtcGxpdHVkZSArPSAodGFyZ2V0W2ldLmFtcGxpdHVkZSAtIGN1cnJlbnRbaV0uYW1wbGl0dWRlKSAqIGZhY3Rvcjtcblx0XHRjdXJyZW50W2ldLnNwZWVkICs9ICh0YXJnZXRbaV0uc3BlZWQgLSBjdXJyZW50W2ldLnNwZWVkKSAqIGZhY3Rvcjtcblx0XHRjdXJyZW50W2ldLnBoYXNlICs9ICh0YXJnZXRbaV0ucGhhc2UgLSBjdXJyZW50W2ldLnBoYXNlKSAqIGZhY3Rvcjtcblx0fVxufVxuXG4vKipcbiAqIEFkdmFuY2UgZWFjaCBjb21wb25lbnQncyBhY2N1bXVsYXRlZCBhbmltYXRpb24gcGhhc2UgYnkgdGhlIGN1cnJlbnQgc3BlZWQgb3ZlclxuICogYGR0YCBzZWNvbmRzLCB3cmFwcGluZyB0byBrZWVwIGl0IGJvdW5kZWQgb3ZlciBsb25nIHNlc3Npb25zLiBCZWNhdXNlIHRoaXMgb25seVxuICogZXZlciBhZGRzIHRvIGBvc2NpbGxhdGlvbmAsIGNoYW5naW5nIGBzcGVlZGAgbWlkLW1vcnBoIGJlbmRzIHRoZSBtb3Rpb24gc21vb3RobHlcbiAqIGluc3RlYWQgb2YgdGVsZXBvcnRpbmcgaXQuXG4gKi9cbmZ1bmN0aW9uIGFkdmFuY2VPc2NpbGxhdGlvbih3YXZlczogcmVhZG9ubHkgTXV0YWJsZVdhdmVbXSwgZHQ6IG51bWJlcik6IHZvaWQge1xuXHRjb25zdCB0YXUgPSAyICogTWF0aC5QSTtcblx0Zm9yIChjb25zdCB3YXZlIG9mIHdhdmVzKSB7XG5cdFx0d2F2ZS5vc2NpbGxhdGlvbiA9ICh3YXZlLm9zY2lsbGF0aW9uICsgd2F2ZS5zcGVlZCAqIFdBVkVfVEVNUE8gKiBkdCkgJSB0YXU7XG5cdH1cbn1cblxuLyoqXG4gKiBEcmF3IHRoZSByb3cgb2YgYmFycy4gSGVpZ2h0cyBhcmUgc3ltbWV0cmljIGFib3V0IHRoZSBjZW50cmUgbGluZSBhbmQgZm9sbG93XG4gKiB0aGUgc2FtZSBjZW50cmUtcGVhayBzaWxob3VldHRlIGFzIHRoZSB0b29sYmFyIHdhdmVmb3JtLCBzbyB0aGUgdHdvIHJlYWQgYXNcbiAqIHRoZSBzYW1lIGluc3RydW1lbnQgYXQgZGlmZmVyZW50IHNpemVzLlxuICovXG5mdW5jdGlvbiBkcmF3QmFycyhcblx0Y29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJELFxuXHR3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcixcblx0d2F2ZXM6IHJlYWRvbmx5IE11dGFibGVXYXZlW10sIGdhaW46IG51bWJlcixcbik6IHZvaWQge1xuXHRjb25zdCBwaXRjaCA9IEJBUl9XSURUSCArIEJBUl9HQVA7XG5cdGNvbnN0IGNvdW50ID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcih3aWR0aCAvIHBpdGNoKSk7XG5cdC8vIENlbnRyZSB0aGUgcm93OiB3aGF0ZXZlciBkb2VzIG5vdCBkaXZpZGUgZXZlbmx5IGJlY29tZXMgZXZlbiBtYXJnaW5zXG5cdC8vIHJhdGhlciB0aGFuIGEgcmFnZ2VkIHJpZ2h0IGVkZ2UuXG5cdGNvbnN0IGluc2V0ID0gKHdpZHRoIC0gKGNvdW50ICogcGl0Y2ggLSBCQVJfR0FQKSkgLyAyO1xuXHRjb25zdCBjZW50ZXJZID0gaGVpZ2h0IC8gMjtcblx0Y29uc3QgbWF4SGFsZiA9IGhlaWdodCAvIDI7XG5cblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGNvdW50OyBpbmRleCsrKSB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBjb3VudCA+IDEgPyBpbmRleCAvIChjb3VudCAtIDEpIDogMDtcblx0XHRjb25zdCBhbW91bnQgPSBiYW5kRnJhY3Rpb24ocG9zaXRpb24sIHdhdmVzKSAqIGdhaW47XG5cdFx0Y29uc3QgaGFsZiA9IE1hdGgubWF4KEJBUl9NSU4gLyAyLCBNYXRoLm1pbihtYXhIYWxmLCBhbW91bnQgKiBtYXhIYWxmKSk7XG5cdFx0Y29udGV4dC5iZWdpblBhdGgoKTtcblx0XHRjb250ZXh0LnJvdW5kUmVjdChpbnNldCArIGluZGV4ICogcGl0Y2gsIGNlbnRlclkgLSBoYWxmLCBCQVJfV0lEVEgsIGhhbGYgKiAyLCBCQVJfV0lEVEggLyAyKTtcblx0XHRjb250ZXh0LmZpbGwoKTtcblx0fVxufVxuXG4vKipcbiAqIEhhbGYtaGVpZ2h0IG9mIHRoZSBiYW5kIGF0IGBwb3NpdGlvbmAgKDAuLjEgYWNyb3NzIHRoZSBzdHJpcCksIGFzIGEgZnJhY3Rpb25cbiAqIG9mIHRoZSBhdmFpbGFibGUgaGFsZi1oZWlnaHQuXG4gKlxuICogRWFjaCBjb21wb25lbnQgY29udHJpYnV0ZXMgYW4gYWxyZWFkeS1wb3NpdGl2ZSwgY3VzcC1mcmVlIGN1cnZlLiBTdW1taW5nIHJhd1xuICogc2luZXMgYW5kIHRha2luZyB0aGVpciBtYWduaXR1ZGUgd291bGQgcHV0IGEgc2hhcnAgY29ybmVyIGF0IGV2ZXJ5IHplcm9cbiAqIGNyb3NzaW5nIC0gdGhhdCBpcyB3aGF0IG1ha2VzIGFuIEFTQ0lJIHdhdmVmb3JtIGxvb2sgbGlrZSBpdCBpcyBzbmFwcGluZyB1cFxuICogYW5kIGRvd24gcmF0aGVyIHRoYW4gZmxvd2luZy5cbiAqL1xuZnVuY3Rpb24gYmFuZEZyYWN0aW9uKHBvc2l0aW9uOiBudW1iZXIsIHdhdmVzOiByZWFkb25seSBNdXRhYmxlV2F2ZVtdKTogbnVtYmVyIHtcblx0bGV0IGFtcGxpdHVkZSA9IDA7XG5cdGxldCB0b3RhbCA9IDA7XG5cdGZvciAoY29uc3Qgd2F2ZSBvZiB3YXZlcykge1xuXHRcdGNvbnN0IHBoYXNlID0gcG9zaXRpb24gKiB3YXZlLmZyZXF1ZW5jeSAqIE1hdGguUEkgKiAyICsgd2F2ZS5vc2NpbGxhdGlvbiArIHdhdmUucGhhc2U7XG5cdFx0YW1wbGl0dWRlICs9ICgwLjUgKyAwLjUgKiBNYXRoLnNpbihwaGFzZSkpICogd2F2ZS5hbXBsaXR1ZGU7XG5cdFx0dG90YWwgKz0gd2F2ZS5hbXBsaXR1ZGU7XG5cdH1cblx0aWYgKHRvdGFsID09PSAwKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblx0Ly8gQ2VudHJlLXBlYWsgc2lsaG91ZXR0ZSwgbWF0Y2hpbmcgdGhlIHRvb2xiYXIgd2F2ZWZvcm06IHRhbGxlc3QgaW4gdGhlXG5cdC8vIG1pZGRsZSwgdGFwZXJpbmcgdG8gdGhlIGVuZHMsIHNvIHRoZSByb3cgcmVhZHMgYXMgb25lIGluc3RydW1lbnQgcmF0aGVyXG5cdC8vIHRoYW4gYSBzdHJpcCBjdXQgb2ZmIGF0IGJvdGggZWRnZXMuXG5cdGNvbnN0IHRhcGVyID0gTWF0aC5zaW4oTWF0aC5QSSAqIE1hdGgubWluKDEsIE1hdGgubWF4KDAsIHBvc2l0aW9uKSkpO1xuXHRyZXR1cm4gKGFtcGxpdHVkZSAvIHRvdGFsKSAqICgwLjM1ICsgMC42NSAqIHRhcGVyKTtcbn1cblxuLyoqIFdoYXQgdGhlIGFuaW1hdG9yIG5lZWRzIHRvIGtub3cgZWFjaCBmcmFtZSwgc3VwcGxpZWQgYnkgdGhlIGJhbm5lci4gKi9cbmludGVyZmFjZSBJV2F2ZWZvcm1Tb3VyY2Uge1xuXHQvKiogTG91ZG5lc3Mgb2YgdGhlIHZvaWNlIGJlaW5nIHByZXZpZXdlZCwgYDBgIHdoZW4gc2lsZW50LiAqL1xuXHRnZXRMZXZlbCgpOiBudW1iZXI7XG5cdC8qKiBUaGUgc2lnbmF0dXJlIHRoZSB0cmFjZSBzaG91bGQgYmUgZWFzaW5nIHRvd2FyZHMuICovXG5cdGdldFNpZ25hdHVyZSgpOiByZWFkb25seSBJV2F2ZVtdO1xufVxuXG4vKipcbiAqIERyYXdzIHRoZSBhbmltYXRlZCB3YXZlZm9ybS4gT3ducyBhIHNpbmdsZSBjYW52YXMsIGEgYFJlc2l6ZU9ic2VydmVyYCBhbmQgYW5cbiAqIGFuaW1hdGlvbi1mcmFtZSBsb29wOyBkaXNwb3Npbmcgc3RvcHMgYm90aC4gSG9ub3JzIHJlZHVjZWQgbW90aW9uIGJ5IHBhaW50aW5nXG4gKiBhIHNpbmdsZSBzdGF0aWMgZnJhbWUgaW5zdGVhZCBvZiBhbmltYXRpbmcuXG4gKi9cbmNsYXNzIFZvaWNlTW9kZU9uYm9hcmRpbmdBbmltYXRvciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dDogQ2FudmFzUmVuZGVyaW5nQ29udGV4dDJEO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFuaW1hdGlvbkZyYW1lID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSB3aWR0aCA9IDA7XG5cdHByaXZhdGUgaGVpZ2h0ID0gMDtcblx0cHJpdmF0ZSBydW5uaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgbGV2ZWwgPSAwO1xuXHQvKiogVGltZXN0YW1wIG9mIHRoZSBwcmV2aW91cyBmcmFtZSwgZm9yIHRoZSBlbGFwc2VkLXRpbWUgZWFjaCBkcmF3IGVhc2VzIG92ZXIuICovXG5cdHByaXZhdGUgbGFzdFRpbWVzdGFtcDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHdhdmVzOiBNdXRhYmxlV2F2ZVtdO1xuXHQvKipcblx0ICogVGhlIHN0cm9rZSBjb2xvdXIsIHRha2VuIGZyb20gdGhlIGNhbnZhcydzIG93biBjb21wdXRlZCBgY29sb3JgIHNvIENTU1xuXHQgKiBvd25zIHRoZSB0aWVyIGFuZCB0aGVtZSBvdmVycmlkZXMgd29yayBmb3IgZnJlZSAtIHRoZSBzYW1lIGBjdXJyZW50Q29sb3JgXG5cdCAqIGFycmFuZ2VtZW50IHRoZSB0b29sYmFyIHdhdmVmb3JtIHVzZXMuIENhY2hlZCByYXRoZXIgdGhhbiByZWFkIHBlciBmcmFtZTpcblx0ICogYGdldENvbXB1dGVkU3R5bGVgIGluc2lkZSB0aGUgYW5pbWF0aW9uIGxvb3AgZm9yY2VzIGEgc3R5bGUgcmVjYWxjdWxhdGlvblxuXHQgKiBvbiBldmVyeSB0aWNrLlxuXHQgKi9cblx0cHJpdmF0ZSBzdHJva2UgPSAnJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhbnZhczogSFRNTENhbnZhc0VsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc291cmNlOiBJV2F2ZWZvcm1Tb3VyY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBjcmVhdGUgdGhlIFZvaWNlIE1vZGUgb25ib2FyZGluZyBjYW52YXMgY29udGV4dCcpO1xuXHRcdH1cblx0XHR0aGlzLmNvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMud2F2ZXMgPSBjbG9uZVNpZ25hdHVyZSh0aGlzLnNvdXJjZS5nZXRTaWduYXR1cmUoKSk7XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgdGFyZ2V0V2luZG93LlJlc2l6ZU9ic2VydmVyKCgpID0+IHRoaXMucmVzaXplKCkpO1xuXHRcdG9ic2VydmVyLm9ic2VydmUoY29udGFpbmVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gb2JzZXJ2ZXIuZGlzY29ubmVjdCgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWFkU3Ryb2tlKCk7XG5cdFx0XHR0aGlzLmRyYXcodGFyZ2V0V2luZG93LnBlcmZvcm1hbmNlLm5vdygpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVJlZHVjZWRNb3Rpb24oKCkgPT4gdGhpcy51cGRhdGVNb3Rpb24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnN0b3AoKSkpO1xuXG5cdFx0dGhpcy5yZWFkU3Ryb2tlKCk7XG5cdFx0dGhpcy5yZXNpemUoKTtcblx0XHR0aGlzLnVwZGF0ZU1vdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkU3Ryb2tlKCk6IHZvaWQge1xuXHRcdHRoaXMuc3Ryb2tlID0gZG9tLmdldFdpbmRvdyh0aGlzLmNhbnZhcykuZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLmNhbnZhcykuY29sb3I7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1vdGlvbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0dGhpcy5zdG9wKCk7XG5cdFx0XHR0aGlzLmRyYXcoZG9tLmdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikucGVyZm9ybWFuY2Uubm93KCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0YXJ0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGFydCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5ydW5uaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucnVubmluZyA9IHRydWU7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGljayA9ICh0aW1lOiBudW1iZXIpID0+IHtcblx0XHRcdGlmICghdGhpcy5ydW5uaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZHJhdyh0aW1lKTtcblx0XHRcdHRoaXMuYW5pbWF0aW9uRnJhbWUudmFsdWUgPSBkb20uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZSh0YXJnZXRXaW5kb3csICgpID0+IHRpY2sodGFyZ2V0V2luZG93LnBlcmZvcm1hbmNlLm5vdygpKSk7XG5cdFx0fTtcblx0XHR0aGlzLmFuaW1hdGlvbkZyYW1lLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCAoKSA9PiB0aWNrKHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9wKCk6IHZvaWQge1xuXHRcdHRoaXMucnVubmluZyA9IGZhbHNlO1xuXHRcdHRoaXMuYW5pbWF0aW9uRnJhbWUuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzaXplKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5jb250YWluZXIpO1xuXHRcdGNvbnN0IGRldmljZVBpeGVsUmF0aW8gPSB0YXJnZXRXaW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyB8fCAxO1xuXHRcdHRoaXMud2lkdGggPSB0aGlzLmNvbnRhaW5lci5vZmZzZXRXaWR0aDtcblx0XHR0aGlzLmhlaWdodCA9IHRoaXMuY29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHRpZiAoIXRoaXMud2lkdGggfHwgIXRoaXMuaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuY2FudmFzLndpZHRoID0gdGhpcy53aWR0aCAqIGRldmljZVBpeGVsUmF0aW87XG5cdFx0dGhpcy5jYW52YXMuaGVpZ2h0ID0gdGhpcy5oZWlnaHQgKiBkZXZpY2VQaXhlbFJhdGlvO1xuXHRcdHRoaXMuY29udGV4dC5zZXRUcmFuc2Zvcm0oZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCwgZGV2aWNlUGl4ZWxSYXRpbywgMCwgMCk7XG5cdFx0dGhpcy5kcmF3KHRhcmdldFdpbmRvdy5wZXJmb3JtYW5jZS5ub3coKSk7XG5cdH1cblxuXHRwcml2YXRlIGRyYXcodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMud2lkdGggfHwgIXRoaXMuaGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVhbCB0aW1lIGVsYXBzZWQgc2luY2UgdGhlIHByZXZpb3VzIGZyYW1lLiBCb3RoIHRoZSBlYXNpbmcgYW5kIHRoZSBwaGFzZVxuXHRcdC8vIGFkdmFuY2Ugc2NhbGUgYnkgdGhpcywgc28gdGhlIHRyYWNlIGtlZXBzIGl0cyByZWFsLXRpbWUgc3BlZWQgd2hldGhlclxuXHRcdC8vIGZyYW1lcyBhcnJpdmUgYXQgNjBmcHMgb3IgZHJvcCB3aGlsZSBhIHNhbXBsZSBwbGF5cyAtIHJhdGhlciB0aGFuIHNsb3dpbmdcblx0XHQvLyBkb3duIHVuZGVyIHRoZSBleHRyYSBsb2FkLiBBIGJpZyBnYXAgKGEgaGl0Y2gsIG9yIGEgYmFja2dyb3VuZGVkIHRhYiB0aGF0XG5cdFx0Ly8gcGF1c2VkIHRoZSBsb29wKSBzaW1wbHkgYWR2YW5jZXMgdGhlIHRyYWNlIHRvIHdoZXJlIGl0IHNob3VsZCBiZTogdGhlXG5cdFx0Ly8gcGhhc2UgaXMgcGVyaW9kaWMgYW5kIHRoZSBlYXNpbmcgZmFjdG9yIHN0YXlzIGJvdW5kZWQsIHNvIHRoZXJlIGlzIG5vXG5cdFx0Ly8gbHVyY2ggdG8gZ3VhcmQgYWdhaW5zdC5cblx0XHRjb25zdCBkdCA9IHRoaXMubGFzdFRpbWVzdGFtcCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IDBcblx0XHRcdDogTWF0aC5tYXgoMCwgKHRpbWVzdGFtcCAtIHRoaXMubGFzdFRpbWVzdGFtcCkgKiAwLjAwMSk7XG5cdFx0dGhpcy5sYXN0VGltZXN0YW1wID0gdGltZXN0YW1wO1xuXG5cdFx0Ly8gSWRsZSwgdGhlIHdhdmVmb3JtIGRyaWZ0cyBnZW50bHk7IHdoaWxlIGEgdm9pY2UgcGxheXMgaXQgZmxvd3MgYW5kIHN3ZWxsc1xuXHRcdC8vIHdpdGggdGhhdCB2b2ljZS4gQm90aCB0aGUgbGV2ZWwgYW5kIHRoZSBzaGFwZSBhcmUgZWFzZWQgc28gdGhlIHJpYmJvblxuXHRcdC8vIGdsaWRlcyByYXRoZXIgdGhhbiBzbmFwcGluZyBiZXR3ZWVuIGZyYW1lcy5cblx0XHR0aGlzLmxldmVsICs9ICh0aGlzLnNvdXJjZS5nZXRMZXZlbCgpIC0gdGhpcy5sZXZlbCkgKiBlYXNpbmdGYWN0b3IoTEVWRUxfRUFTSU5HLCBkdCk7XG5cdFx0ZWFzZVNpZ25hdHVyZSh0aGlzLndhdmVzLCB0aGlzLnNvdXJjZS5nZXRTaWduYXR1cmUoKSwgZWFzaW5nRmFjdG9yKFNJR05BVFVSRV9FQVNJTkcsIGR0KSk7XG5cdFx0Ly8gRHJpdmUgdGhlIHRyYXZlbGxpbmcgbW90aW9uIGZyb20gdGhlIHNhbXBsZTogbmVhcmx5IHN0aWxsIGF0IHJlc3QsIGZsb3dpbmdcblx0XHQvLyB3aGlsZSBhIHZvaWNlIHBsYXlzLCBzbyB0aGUgbW92ZW1lbnQgcmVhZHMgYXMgYSByZXNwb25zZSB0byB0aGUgcHJldmlld2VkXG5cdFx0Ly8gdm9pY2UgcmF0aGVyIHRoYW4gY29uc3RhbnQgaWRsZSBtb3Rpb24uXG5cdFx0YWR2YW5jZU9zY2lsbGF0aW9uKHRoaXMud2F2ZXMsIGR0ICogKElETEVfTU9USU9OICsgdGhpcy5sZXZlbCAqIFNQRUFLSU5HX01PVElPTikpO1xuXHRcdGNvbnN0IGdhaW4gPSBJRExFX0dBSU4gKyB0aGlzLmxldmVsICogU1BFQUtJTkdfR0FJTjtcblxuXHRcdHRoaXMuY29udGV4dC5jbGVhclJlY3QoMCwgMCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQpO1xuXHRcdHRoaXMuY29udGV4dC5maWxsU3R5bGUgPSB0aGlzLnN0cm9rZTtcblxuXHRcdGRyYXdCYXJzKHRoaXMuY29udGV4dCwgdGhpcy53aWR0aCwgdGhpcy5oZWlnaHQsIHRoaXMud2F2ZXMsIGdhaW4pO1xuXHR9XG5cbn1cblxuLy8gLS0tIEJhbm5lciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogUGxheXMgdGhlIHByZS1yZWNvcmRlZCB2b2ljZSBzYW1wbGVzIHRoYXQgc2hpcCBuZXh0IHRvIHRoaXMgZmlsZS4gT25lIGVsZW1lbnRcbiAqIGlzIHJldXNlZCBmb3IgZXZlcnkgcHJldmlldyBzbyBwaWNraW5nIGEgc2Vjb25kIHZvaWNlIGN1dHMgdGhlIGZpcnN0IG9uZSBvZmYuXG4gKi9cbmNsYXNzIFZvaWNlU2FtcGxlUGxheWVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwbGF5YmFjayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXG5cdC8qKiBSZXVzZWQgYWNyb3NzIHByZXZpZXdzOiBhIG1lZGlhIGVsZW1lbnQgc291cmNlIGNhbiBvbmx5IGJlIGNyZWF0ZWQgb25jZVxuXHQgKiBwZXIgZWxlbWVudCwgc28gdGhlIGVsZW1lbnQsIGNvbnRleHQgYW5kIGFuYWx5c2VyIGFyZSBhbGwgbG9uZy1saXZlZC4gKi9cblx0cHJpdmF0ZSBhdWRpbzogSFRNTEF1ZGlvRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBhbmFseXNlcjogQW5hbHlzZXJOb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGxldmVsczogVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQbGF5aW5nVm9pY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmcgfCB1bmRlZmluZWQ+KCkpO1xuXHQvKiogRmlyZXMgd2l0aCB0aGUgdm9pY2UgY3VycmVudGx5IGJlaW5nIGhlYXJkLCBvciBgdW5kZWZpbmVkYCBvbmNlIGl0IHN0b3BzLiAqL1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBsYXlpbmdWb2ljZSA9IHRoaXMuX29uRGlkQ2hhbmdlUGxheWluZ1ZvaWNlLmV2ZW50O1xuXG5cdHByaXZhdGUgX3BsYXlpbmdWb2ljZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXQgcGxheWluZ1ZvaWNlKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wbGF5aW5nVm9pY2U7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYXVkaW9GYWN0b3J5OiAoKCkgPT4gSFRNTEF1ZGlvRWxlbWVudCkgfCB1bmRlZmluZWQsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuc3RvcCgpKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ3VycmVudCBsb3VkbmVzcyBvZiB0aGUgc2FtcGxlIGJlaW5nIHBsYXllZCwgYDBgIHdoZW4gc2lsZW50LiBUaGUgd2F2ZWZvcm1cblx0ICogcmVhZHMgdGhpcyBzbyBpdCBtb3ZlcyB0byB0aGUgdm9pY2UgdGhlIHVzZXIgaXMgYWN0dWFsbHkgaGVhcmluZy5cblx0ICovXG5cdGdldExldmVsKCk6IG51bWJlciB7XG5cdFx0aWYgKCF0aGlzLmFuYWx5c2VyIHx8ICF0aGlzLmxldmVscyB8fCAhdGhpcy5fcGxheWluZ1ZvaWNlKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0dGhpcy5hbmFseXNlci5nZXRCeXRlVGltZURvbWFpbkRhdGEodGhpcy5sZXZlbHMpO1xuXHRcdGxldCBzdW0gPSAwO1xuXHRcdGZvciAoY29uc3Qgc2FtcGxlIG9mIHRoaXMubGV2ZWxzKSB7XG5cdFx0XHRjb25zdCBjZW50ZXJlZCA9IChzYW1wbGUgLSAxMjgpIC8gMTI4O1xuXHRcdFx0c3VtICs9IGNlbnRlcmVkICogY2VudGVyZWQ7XG5cdFx0fVxuXHRcdC8vIFJNUywgc2NhbGVkIHNvIG9yZGluYXJ5IHNwZWVjaCBsYW5kcyBuZWFyIDEgcmF0aGVyIHRoYW4gYSBmcmFjdGlvbi5cblx0XHRyZXR1cm4gTWF0aC5taW4oMSwgTWF0aC5zcXJ0KHN1bSAvIHRoaXMubGV2ZWxzLmxlbmd0aCkgKiAzLjIpO1xuXHR9XG5cblx0cGxheShzYW1wbGVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9wKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGF1ZGlvID0gdGhpcy5lbnN1cmVBdWRpbygpO1xuXHRcdFx0YXVkaW8uc3JjID0gRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYHZzL3dvcmtiZW5jaC9jb250cmliL2FnZW50c1ZvaWNlL2Jyb3dzZXIvbWVkaWEvJHtzYW1wbGVJZH0ubXAzYCkudG9TdHJpbmcodHJ1ZSk7XG5cblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0c3RvcmUuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYXVkaW8sICdlbmRlZCcsICgpID0+IHRoaXMuc3RvcCgpKSk7XG5cdFx0XHRzdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihhdWRpbywgJ2Vycm9yJywgKCkgPT4gdGhpcy5zdG9wKCkpKTtcblx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYXVkaW8ucGF1c2UoKSkpO1xuXHRcdFx0dGhpcy5wbGF5YmFjay52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0XHR0aGlzLnNldFBsYXlpbmdWb2ljZShzYW1wbGVJZCk7XG5cdFx0XHRhdWRpby5wbGF5KCkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gVm9pY2UgTW9kZSBvbmJvYXJkaW5nIHByZXZpZXcgZmFpbGVkOiAke2Vycm9yfWApO1xuXHRcdFx0XHR0aGlzLnN0b3AoKTtcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFt2b2ljZV0gVm9pY2UgTW9kZSBvbmJvYXJkaW5nIHByZXZpZXcgdW5hdmFpbGFibGU6ICR7ZXJyb3J9YCk7XG5cdFx0XHR0aGlzLnN0b3AoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIGF1ZGlvIGVsZW1lbnQgYW5kLCBiZXN0LWVmZm9ydCwgdGhlIGFuYWx5c2VyIGdyYXBoIGZlZWRpbmcgdGhlXG5cdCAqIHdhdmVmb3JtLiBBbmFseXNpcyBpcyBhIG5pY2V0eTogaWYgdGhlIFdlYiBBdWRpbyBncmFwaCBjYW5ub3QgYmUgY3JlYXRlZFxuXHQgKiB0aGUgc2FtcGxlIHN0aWxsIHBsYXlzLCB0aGUgd2F2ZWZvcm0ganVzdCBrZWVwcyBpdHMgaWRsZSBtb3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGVuc3VyZUF1ZGlvKCk6IEhUTUxBdWRpb0VsZW1lbnQge1xuXHRcdGlmICh0aGlzLmF1ZGlvKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5hdWRpbztcblx0XHR9XG5cblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuZWxlbWVudCk7XG5cdFx0Y29uc3QgYXVkaW8gPSB0aGlzLmF1ZGlvRmFjdG9yeT8uKCkgPz8gbmV3IHRhcmdldFdpbmRvdy5BdWRpbygpO1xuXHRcdHRoaXMuYXVkaW8gPSBhdWRpbztcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0YXVkaW8ucGF1c2UoKTtcblx0XHRcdGF1ZGlvLnNyYyA9ICcnO1xuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gbmV3IHRhcmdldFdpbmRvdy5BdWRpb0NvbnRleHQoKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB2b2lkIGNvbnRleHQuY2xvc2UoKS5jYXRjaCgoKSA9PiB7IC8qIGFscmVhZHkgY2xvc2luZyAqLyB9KSkpO1xuXHRcdFx0Y29uc3QgYW5hbHlzZXIgPSBjb250ZXh0LmNyZWF0ZUFuYWx5c2VyKCk7XG5cdFx0XHRhbmFseXNlci5mZnRTaXplID0gMjU2O1xuXHRcdFx0Y29udGV4dC5jcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UoYXVkaW8pLmNvbm5lY3QoYW5hbHlzZXIpO1xuXHRcdFx0YW5hbHlzZXIuY29ubmVjdChjb250ZXh0LmRlc3RpbmF0aW9uKTtcblx0XHRcdHRoaXMuYW5hbHlzZXIgPSBhbmFseXNlcjtcblx0XHRcdHRoaXMubGV2ZWxzID0gbmV3IFVpbnQ4QXJyYXkoYW5hbHlzZXIuZmZ0U2l6ZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBWb2ljZSBNb2RlIG9uYm9hcmRpbmcgYW5hbHlzZXIgdW5hdmFpbGFibGU6ICR7ZXJyb3J9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGF1ZGlvO1xuXHR9XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHR0aGlzLnBsYXliYWNrLmNsZWFyKCk7XG5cdFx0dGhpcy5zZXRQbGF5aW5nVm9pY2UodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UGxheWluZ1ZvaWNlKHZvaWNlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wbGF5aW5nVm9pY2UgPT09IHZvaWNlSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGxheWluZ1ZvaWNlID0gdm9pY2VJZDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBsYXlpbmdWb2ljZS5maXJlKHZvaWNlSWQpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZvaWNlTW9kZU9uYm9hcmRpbmdCYW5uZXJPcHRpb25zIHtcblx0LyoqIFRoZSBlbGVtZW50IHRoZSBiYW5uZXIgYXR0YWNoZXMgaXRzZWxmIHRvLiAqL1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBvbkRpc21pc3M6ICgpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IHNvdXJjZTogJ2F1dG9tYXRpYycgfCAnbWFudWFsJztcblx0LyoqIEFsbG93cyB0ZXN0cyB0byBwcm92aWRlIGEgZGV0ZXJtaW5pc3RpYyBtZWRpYSBlbGVtZW50LiAqL1xuXHRyZWFkb25seSBhdWRpb0ZhY3Rvcnk/OiAoKSA9PiBIVE1MQXVkaW9FbGVtZW50O1xuXHQvKiogQWxsb3dzIHRlc3RzIHRvIHByb3ZpZGUgYSBkZXRlcm1pbmlzdGljIHNwb2tlbiBsYW5ndWFnZS4gKi9cblx0cmVhZG9ubHkgdm9pY2VMYW5ndWFnZT86IHN0cmluZztcbn1cblxuLyoqIEEgcmVuZGVyZWQgdm9pY2Ugb3B0aW9uLCB3aXRoIHRoZSBzdHJpbmdzIGl0cyBwbGF5IHN0YXRlIHN3YXBzIGJldHdlZW4uICovXG5pbnRlcmZhY2UgSVZvaWNlRWxlbWVudCB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSByZXN0aW5nQXJpYTogc3RyaW5nO1xufVxuXG4vKipcbiAqIFRoZSBmaXJzdC1ydW4gVm9pY2UgTW9kZSBjYXJkOiB3aGF0IFZvaWNlIE1vZGUgaXMsIHRoYXQgaXQgY29zdHMgbm90aGluZywgdGhlXG4gKiB2b2ljZXMgaXQgY2FuIHNwZWFrIHdpdGgsIGFuZCB0aGUgbWljIGFzIHRoZSBhbHRlcm5hdGl2ZSBmb3IgYW55b25lIHdobyB3b3VsZFxuICogcmF0aGVyIG5vdCBiZSBzcG9rZW4gdG8gYXQgYWxsLlxuICpcbiAqIENsaWNraW5nIGEgdm9pY2UgYm90aCBwbGF5cyBpdCBhbmQgYWRvcHRzIGl0LCBzbyB0aGVyZSBpcyBub3RoaW5nIHRvIGNvbmZpcm1cbiAqIGFmdGVyd2FyZHMuIFRoZSBsZWFkaW5nIGljb24gY2FycmllcyB0aGF0IHN0b3J5OiBwbGF5IGJlZm9yZSB0aGUgY2xpY2ssXG4gKiBhbmltYXRpbmcgYmFycyB3aGlsZSBpdCBzcGVha3MsIHRoZW4gYSBjaGVjayBvbmNlIGl0IGlzIHlvdXJzLlxuICovXG5leHBvcnQgY2xhc3MgVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2FyZDogQ2hhdElucHV0T25ib2FyZGluZ0NhcmQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgcGxheWVyOiBWb2ljZVNhbXBsZVBsYXllcjtcblx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lck9wdGlvbnM7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWljcm9waG9uZVBpY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIG1pY3JvcGhvbmVPcHRpb25zOiBJTWljcm9waG9uZU9wdGlvbltdID0gW107XG5cdHByaXZhdGUgbWljcm9waG9uZVBpY2tlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2b2ljZUVsZW1lbnRzID0gbmV3IE1hcDxzdHJpbmcsIElWb2ljZUVsZW1lbnQ+KCk7XG5cblx0LyoqIFRoZSBuYXRpdmUgdm9pY2UgZm9yIHRoZSBzcG9rZW4gbGFuZ3VhZ2UsIHdoZW4gb25lIGV4aXN0cy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBsb2NhbGl6ZWRWb2ljZTogSUxvY2FsaXplZFZvaWNlIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBUaGUgdm9pY2UgYmVpbmcgYXVkaXRpb25lZCwgYW5kIHRoZSBvbmUgdGhhdCB3aWxsIGJlIGNvbW1pdHRlZC4gKi9cblx0cHJpdmF0ZSBzZWxlY3RlZFZvaWNlOiBJVm9pY2VNb2RlVm9pY2UgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZvaWNlTW9kZU9uYm9hcmRpbmdCYW5uZXJPcHRpb25zLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cblx0XHR0aGlzLmNhcmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2hhdElucHV0T25ib2FyZGluZ0NhcmQoe1xuXHRcdFx0Y29udGFpbmVyOiBvcHRpb25zLmNvbnRhaW5lcixcblx0XHRcdGNsYXNzTmFtZTogJ3ZvaWNlLW1vZGUtb25ib2FyZGluZy1iYW5uZXInLFxuXHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcucmVnaW9uJywgXCJWb2ljZSBNb2RlIGludHJvZHVjdGlvblwiKSxcblx0XHRcdG9uRXNjYXBlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMubG9nQWN0aW9uKCdlc2NhcGUnKTtcblx0XHRcdFx0dGhpcy5vcHRpb25zLm9uRGlzbWlzcygpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gdGhpcy5jYXJkLmRvbU5vZGU7XG5cdFx0dGhpcy5sb2NhbGl6ZWRWb2ljZSA9IGxvY2FsaXplZFZvaWNlRm9yTGFuZ3VhZ2UodGhpcy5yZXNvbHZlU3Bva2VuTGFuZ3VhZ2UoKSk7XG5cdFx0dGhpcy5wbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZVNhbXBsZVBsYXllciwgdGhpcy5kb21Ob2RlLCBvcHRpb25zLmF1ZGlvRmFjdG9yeSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGxheWVyLm9uRGlkQ2hhbmdlUGxheWluZ1ZvaWNlKHZvaWNlSWQgPT4gdGhpcy51cGRhdGVQbGF5aW5nKHZvaWNlSWQpKSk7XG5cblx0XHRjb25zdCBjb3B5ID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLWNvcHknKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBkb20uYXBwZW5kKGNvcHksIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXRpdGxlJykpO1xuXHRcdHRpdGxlLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnRpdGxlJywgXCJXZWxjb21lIHRvIFZvaWNlIE1vZGVcIik7XG5cdFx0dGhpcy5yZW5kZXJEZXNjcmlwdGlvbihjb3B5KTtcblxuXHRcdHRoaXMucmVuZGVyU2hhcmVkV2F2ZWZvcm0oaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMucmVuZGVyTWljcm9waG9uZVBpY2tlcigpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy1hY3Rpb25zJykpO1xuXHRcdHRoaXMucmVuZGVyVm9pY2VzKGFjdGlvbnMpO1xuXHRcdHRoaXMucmVuZGVyQ2xvc2UoKTtcblx0XHR0aGlzLmxvZ0FjdGlvbignc2hvd24nKTtcblxuXHRcdHRoaXMuZm9jdXNGb3JTY3JlZW5SZWFkZXIoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkKCgpID0+IHRoaXMuZm9jdXNGb3JTY3JlZW5SZWFkZXIoKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBzaWduYXR1cmUgdGhlIHNoYXJlZCB0cmFjZSBzaG91bGQgYmUgc2hvd2luZzogdGhlIHNlbGVjdGVkIHZvaWNlJ3MsIG9yXG5cdCAqIHtAbGluayBSRVNUSU5HX1NJR05BVFVSRX0gYmVmb3JlIGFueXRoaW5nIGhhcyBiZWVuIGNob3Nlbi5cblx0ICovXG5cdHByaXZhdGUgY3VycmVudFNpZ25hdHVyZSgpOiByZWFkb25seSBJV2F2ZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5zZWxlY3RlZFZvaWNlPy5zaWduYXR1cmUgPz8gUkVTVElOR19TSUdOQVRVUkU7XG5cdH1cblxuXHQvKiogVGhlIHNpbmdsZSBmdWxsLXdpZHRoIHRyYWNlIHRoZSB3aG9sZSBjYXJkIHNoYXJlcy4gKi9cblx0cHJpdmF0ZSByZW5kZXJTaGFyZWRXYXZlZm9ybShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2F2ZSA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy13YXZlJykpO1xuXHRcdGNvbnN0IGNhbnZhcyA9IGRvbS5hcHBlbmQod2F2ZSwgZG9tLiQoJ2NhbnZhcy52b2ljZS1tb2RlLW9uYm9hcmRpbmctY2FudmFzJykpIGFzIEhUTUxDYW52YXNFbGVtZW50O1xuXHRcdGNhbnZhcy5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHR0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWb2ljZU1vZGVPbmJvYXJkaW5nQW5pbWF0b3IsIGNhbnZhcywgd2F2ZSwge1xuXHRcdFx0Z2V0TGV2ZWw6ICgpID0+IHRoaXMucGxheWVyLmdldExldmVsKCksXG5cdFx0XHRnZXRTaWduYXR1cmU6ICgpID0+IHRoaXMuY3VycmVudFNpZ25hdHVyZSgpLFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWljcm9waG9uZVBpY2tlcigpOiB2b2lkIHtcblx0XHR0aGlzLm1pY3JvcGhvbmVQaWNrZXJDb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctbWljcm9waG9uZS1waWNrZXInKSk7XG5cdFx0dGhpcy5taWNyb3Bob25lT3B0aW9ucyA9IFt7XG5cdFx0XHRkZXZpY2VJZDogJycsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnN5c3RlbURlZmF1bHQnLCBcIlN5c3RlbSBkZWZhdWx0XCIpLFxuXHRcdH1dO1xuXHRcdHRoaXMudXBkYXRlTWljcm9waG9uZVBpY2tlcigpO1xuXG5cdFx0Y29uc3QgbWVkaWFEZXZpY2VzID0gZG9tLmdldFdpbmRvdyh0aGlzLmRvbU5vZGUpLm5hdmlnYXRvci5tZWRpYURldmljZXM7XG5cdFx0aWYgKG1lZGlhRGV2aWNlcykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtZWRpYURldmljZXMsICdkZXZpY2VjaGFuZ2UnLCAoKSA9PiB2b2lkIHRoaXMucmVmcmVzaE1pY3JvcGhvbmVzKCkpKTtcblx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoTWljcm9waG9uZXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hNaWNyb3Bob25lcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtZWRpYURldmljZXMgPSBkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSkubmF2aWdhdG9yLm1lZGlhRGV2aWNlcztcblx0XHRpZiAoIW1lZGlhRGV2aWNlcz8uZW51bWVyYXRlRGV2aWNlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkZXZpY2VzOiBNZWRpYURldmljZUluZm9bXTtcblx0XHR0cnkge1xuXHRcdFx0ZGV2aWNlcyA9IGF3YWl0IG1lZGlhRGV2aWNlcy5lbnVtZXJhdGVEZXZpY2VzKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW3ZvaWNlXSBjb3VsZCBub3QgZW51bWVyYXRlIG1pY3JvcGhvbmVzOiAke2Vycm9yfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSBidWlsZE1pY3JvcGhvbmVPcHRpb25zKGRldmljZXMpO1xuXHRcdGlmICh0aGlzLm1pY3JvcGhvbmVPcHRpb25zLmxlbmd0aCA+IDEgJiYgIW9wdGlvbnMuc29tZShvcHRpb24gPT4gb3B0aW9uLmRldmljZUlkICYmIG9wdGlvbi5sYWJlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5taWNyb3Bob25lT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy51cGRhdGVNaWNyb3Bob25lUGlja2VyKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1pY3JvcGhvbmVQaWNrZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pY3JvcGhvbmVQaWNrZXJDb250YWluZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5taWNyb3Bob25lUGlja2VyLmNsZWFyKCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLm1pY3JvcGhvbmVQaWNrZXJDb250YWluZXIpO1xuXG5cdFx0dGhpcy5taWNyb3Bob25lUGlja2VyQ29udGFpbmVyLmhpZGRlbiA9IHRoaXMubWljcm9waG9uZU9wdGlvbnMubGVuZ3RoIDw9IDE7XG5cdFx0aWYgKHRoaXMubWljcm9waG9uZVBpY2tlckNvbnRhaW5lci5oaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRkb20uYXBwZW5kKHRoaXMubWljcm9waG9uZVBpY2tlckNvbnRhaW5lciwgZG9tLiQoYHNwYW4uY29kaWNvbi5jb2RpY29uLSR7Q29kaWNvbi5taWMuaWR9LnZvaWNlLW1vZGUtb25ib2FyZGluZy1taWNyb3Bob25lLWljb25gKSlcblx0XHRcdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkID0gaW5kZXhPZk1pY3JvcGhvbmUodGhpcy5taWNyb3Bob25lT3B0aW9ucywgdGhpcy5jdXJyZW50TWljcm9waG9uZUlkKCkpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc2VsZWN0Qm94ID0gc3RvcmUuYWRkKG5ldyBTZWxlY3RCb3goXG5cdFx0XHR0aGlzLm1pY3JvcGhvbmVPcHRpb25zLm1hcChvcHRpb24gPT4gKHsgdGV4dDogb3B0aW9uLmxhYmVsIH0pKSxcblx0XHRcdHNlbGVjdGVkLFxuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHR7IC4uLmRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsIHNlbGVjdEJhY2tncm91bmQ6IHVuZGVmaW5lZCwgc2VsZWN0Qm9yZGVyOiB1bmRlZmluZWQsIHNlbGVjdEZvcmVncm91bmQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBhcmlhTGFiZWw6IGxvY2FsaXplKCd2b2ljZU1vZGUub25ib2FyZGluZy5taWNyb3Bob25lJywgXCJNaWNyb3Bob25lXCIpLCB1c2VDdXN0b21EcmF3bjogdHJ1ZSB9LFxuXHRcdCkpO1xuXHRcdHNlbGVjdEJveC5yZW5kZXIodGhpcy5taWNyb3Bob25lUGlja2VyQ29udGFpbmVyKTtcblx0XHRzdG9yZS5hZGQoc2VsZWN0Qm94Lm9uRGlkU2VsZWN0KGV2ZW50ID0+IHRoaXMuc2VsZWN0TWljcm9waG9uZShldmVudC5pbmRleCkpKTtcblx0XHR0aGlzLm1pY3JvcGhvbmVQaWNrZXIudmFsdWUgPSBzdG9yZTtcblx0fVxuXG5cdHByaXZhdGUgY3VycmVudE1pY3JvcGhvbmVJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk1pY3JvcGhvbmVEZXZpY2UsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3RNaWNyb3Bob25lKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb24gPSB0aGlzLm1pY3JvcGhvbmVPcHRpb25zW2luZGV4XTtcblx0XHRpZiAoIW9wdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxvZ0FjdGlvbignc2VsZWN0TWljcm9waG9uZScpO1xuXHRcdGlmIChvcHRpb24uZGV2aWNlSWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5NaWNyb3Bob25lRGV2aWNlLCBvcHRpb24uZGV2aWNlSWQsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoQWdlbnRzVm9pY2VTdG9yYWdlS2V5cy5NaWNyb3Bob25lRGV2aWNlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblx0XHRzdGF0dXMobG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLm1pY3JvcGhvbmVTZWxlY3RlZCcsIFwiezB9IHNlbGVjdGVkLlwiLCBvcHRpb24ubGFiZWwpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgdm9pY2VzIGFzIHJlYWwgYnV0dG9ucyAtIGJvcmRlciwgaG92ZXIgbGlmdCwgcHJlc3NlZCBmZWVkYmFjayAtXG5cdCAqIGJlY2F1c2UgYmFyZSB0ZXh0IGdhdmUgbm8gc2lnbiBpdCBjb3VsZCBiZSBjbGlja2VkIGF0IGFsbC4gSW4gYSBsYW5ndWFnZVxuXHQgKiBWb2ljZSBNb2RlIHNwZWFrcyBuYXRpdmVseSB0aGVyZSBpcyBvbmx5IG9uZSB2b2ljZSwgc28gdGhlIGNhcmQgcHJldmlld3Ncblx0ICogdGhhdCB2b2ljZSBpbnN0ZWFkIG9mIG9mZmVyaW5nIHRoZSBFbmdsaXNoIGNob29zZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlclZvaWNlcyhjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgbGFiZWxUZXh0ID0gbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlcycsIFwiQWdlbnQgVm9pY2U6XCIpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlcy1sYWJlbCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxhYmVsVGV4dDtcblxuXHRcdGlmICh0aGlzLmxvY2FsaXplZFZvaWNlKSB7XG5cdFx0XHR0aGlzLnJlbmRlckxvY2FsaXplZFZvaWNlKGNvbnRhaW5lciwgbGFiZWxUZXh0LCB0aGlzLmxvY2FsaXplZFZvaWNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZXMnKSk7XG5cdFx0Z3JvdXAuc2V0QXR0cmlidXRlKCdyb2xlJywgJ3JhZGlvZ3JvdXAnKTtcblx0XHRncm91cC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbFRleHQpO1xuXG5cdFx0Zm9yIChjb25zdCB2b2ljZSBvZiBWT0lDRVMpIHtcblx0XHRcdGNvbnN0IG9wdGlvbiA9IGRvbS5hcHBlbmQoZ3JvdXAsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlJykpO1xuXHRcdFx0b3B0aW9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdyYWRpbycpO1xuXHRcdFx0Y29uc3QgcmVzdGluZ0FyaWEgPSBsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UuYXJpYUxhYmVsJywgXCJ7MH0uIEhlYXIgdGhpcyB2b2ljZSBhbmQgdXNlIGl0IGZvciBldmVyeSBjb252ZXJzYXRpb24uXCIsIHZvaWNlLmxhYmVsKTtcblx0XHRcdG9wdGlvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCByZXN0aW5nQXJpYSk7XG5cblx0XHRcdHRoaXMuYXBwZW5kVm9pY2VJY29uKG9wdGlvbik7XG5cblx0XHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChvcHRpb24sIGRvbS4kKCdzcGFuLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS1sYWJlbCcpKTtcblx0XHRcdGxhYmVsLnRleHRDb250ZW50ID0gdm9pY2UubGFiZWw7XG5cdFx0XHR0aGlzLnZvaWNlRWxlbWVudHMuc2V0KHZvaWNlLmlkLCB7IGVsZW1lbnQ6IG9wdGlvbiwgbGFiZWw6IHZvaWNlLmxhYmVsLCByZXN0aW5nQXJpYSB9KTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihvcHRpb24sIGRvbS5FdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuc2VsZWN0Vm9pY2Uodm9pY2UpKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG9wdGlvbiwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZXZlbnQgPT4gdGhpcy5oYW5kbGVPcHRpb25LZXkoZXZlbnQsIHZvaWNlKSkpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlU2VsZWN0aW9uKCk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHNpbmdsZSBuYXRpdmUgdm9pY2UgZm9yIHRoZSBzcG9rZW4gbGFuZ3VhZ2UsIGFzIGEgcHJldmlldyBidXR0b246XG5cdCAqIHRoZXJlIGlzIG5vdGhpbmcgdG8gY2hvb3NlLCBzbyBpdCBvbmx5IGV2ZXIgcGxheXMgYW5kIHN0b3BzLlxuXHQgKi9cblx0cHJpdmF0ZSByZW5kZXJMb2NhbGl6ZWRWb2ljZShjb250YWluZXI6IEhUTUxFbGVtZW50LCBhcmlhTGFiZWw6IHN0cmluZywgdm9pY2U6IElMb2NhbGl6ZWRWb2ljZSk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcudm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlcycpKTtcblx0XHRncm91cC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uID0gZG9tLmFwcGVuZChncm91cCwgZG9tLiQoJy52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UnKSk7XG5cdFx0b3B0aW9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRvcHRpb24udGFiSW5kZXggPSAwO1xuXHRcdGNvbnN0IHJlc3RpbmdBcmlhID0gbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLnByZXZpZXdBcmlhTGFiZWwnLCBcInswfS4gSGVhciBob3cgeW91ciBhZ2VudCB3aWxsIHNvdW5kLlwiLCB2b2ljZS5sYWJlbCk7XG5cdFx0b3B0aW9uLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHJlc3RpbmdBcmlhKTtcblxuXHRcdHRoaXMuYXBwZW5kVm9pY2VJY29uKG9wdGlvbik7XG5cblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQob3B0aW9uLCBkb20uJCgnc3Bhbi52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UtbGFiZWwnKSk7XG5cdFx0bGFiZWwudGV4dENvbnRlbnQgPSB2b2ljZS5sYWJlbDtcblx0XHR0aGlzLnZvaWNlRWxlbWVudHMuc2V0KHZvaWNlLmlkLCB7IGVsZW1lbnQ6IG9wdGlvbiwgbGFiZWw6IHZvaWNlLmxhYmVsLCByZXN0aW5nQXJpYSB9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIob3B0aW9uLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLnByZXZpZXdMb2NhbGl6ZWRWb2ljZSh2b2ljZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG9wdGlvbiwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRcdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0dGhpcy5wcmV2aWV3TG9jYWxpemVkVm9pY2Uodm9pY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaWNvbiBpcyB0aGUgYWZmb3JkYW5jZTogaXQgc2F5cyBcInRoaXMgd2lsbCBzcGVha1wiIGJlZm9yZSB0aGUgY2xpY2ssXG5cdCAqIGFuaW1hdGluZyBiYXJzIHdoaWxlIGl0IHNwZWFrcywgdGhlbiBhIGNoZWNrIG9uY2UgYSB2b2ljZSBpcyBjaG9zZW4uXG5cdCAqL1xuXHRwcml2YXRlIGFwcGVuZFZvaWNlSWNvbihvcHRpb246IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQob3B0aW9uLCBkb20uJCgnc3Bhbi52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UtaWNvbicpKTtcblx0XHRkb20uYXBwZW5kKGljb24sIGRvbS4kKGBzcGFuLmNvZGljb24uY29kaWNvbi0ke0NvZGljb24ucGxheS5pZH0udm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlLWlkbGVgKSkuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0ZG9tLmFwcGVuZChpY29uLCBkb20uJChgc3Bhbi5jb2RpY29uLmNvZGljb24tJHtDb2RpY29uLmNoZWNrQ29tcGFjdC5pZH0udm9pY2UtbW9kZS1vbmJvYXJkaW5nLXZvaWNlLWNob3NlbmApKS5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBiYXJzID0gZG9tLmFwcGVuZChpY29uLCBkb20uJCgnc3Bhbi52b2ljZS1tb2RlLW9uYm9hcmRpbmctdm9pY2UtYmFycycpKTtcblx0XHRiYXJzLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdGZvciAobGV0IGJhciA9IDA7IGJhciA8IDM7IGJhcisrKSB7XG5cdFx0XHRkb20uYXBwZW5kKGJhcnMsIGRvbS4kKCdzcGFuLnZvaWNlLW1vZGUtb25ib2FyZGluZy12b2ljZS1iYXInKSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tIFNoYXJlZCBiZWhhdmlvdXIgLS0tXG5cblx0cHJpdmF0ZSBoYW5kbGVPcHRpb25LZXkoZXZlbnQ6IEtleWJvYXJkRXZlbnQsIHZvaWNlOiBJVm9pY2VNb2RlVm9pY2UpOiB2b2lkIHtcblx0XHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChldmVudCk7XG5cdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR0aGlzLnNlbGVjdFZvaWNlKHZvaWNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBIHJhZGlvZ3JvdXAgaXMgYSBzaW5nbGUgdGFiIHN0b3A6IHRoZSBhcnJvdyBrZXlzIG1vdmUgYmV0d2VlbiB0aGVcblx0XHQvLyBvcHRpb25zIChzZWxlY3RpbmcgYXMgdGhleSBnbywgYXMgYSByYWRpbyBncm91cCBzaG91bGQpIHJhdGhlciB0aGFuIFRhYlxuXHRcdC8vIHdhbGtpbmcgdGhyb3VnaCBldmVyeSBvbmUgb2YgdGhlbS5cblx0XHRjb25zdCBmb3J3YXJkID0ga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdyk7XG5cdFx0Y29uc3QgYmFja3dhcmQgPSBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykgfHwga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KTtcblx0XHRpZiAoZm9yd2FyZCB8fCBiYWNrd2FyZCkge1xuXHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0Y29uc3QgaW5kZXggPSBWT0lDRVMuaW5kZXhPZih2b2ljZSk7XG5cdFx0XHRjb25zdCBuZXh0ID0gVk9JQ0VTWyhpbmRleCArIChmb3J3YXJkID8gMSA6IFZPSUNFUy5sZW5ndGggLSAxKSkgJSBWT0lDRVMubGVuZ3RoXTtcblx0XHRcdHRoaXMuc2VsZWN0Vm9pY2UobmV4dCk7XG5cdFx0XHR0aGlzLnZvaWNlRWxlbWVudHMuZ2V0KG5leHQuaWQpPy5lbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE9uZSBzaG9ydCBwYXJhZ3JhcGg6IHdoYXQgVm9pY2UgTW9kZSBkb2VzLCBhbmQgd2hlcmUgdG8gY2hhbmdlIGl0c1xuXHQgKiBzZXR0aW5ncy5cblx0ICpcblx0ICogYFtbLi4uXV1gIG1hcmtzIGVhY2ggY2xhdXNlIHRoYXQgYmVjb21lcyBhIGxpbmssIHNvIHRyYW5zbGF0b3JzIGNhbiBwbGFjZVxuXHQgKiBpdCBuYXR1cmFsbHkgaW4gdGhlIHNlbnRlbmNlIGluc3RlYWQgb2YgcmVjZWl2aW5nIGEgZml4ZWQgcGhyYXNlXG5cdCAqIGNvbmNhdGVuYXRlZCBvbnRvIHRoZSBlbmQuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlckRlc2NyaXB0aW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnZvaWNlLW1vZGUtb25ib2FyZGluZy1kZXNjcmlwdGlvbicpKTtcblx0XHRjb25zdCB0ZXh0ID0gbG9jYWxpemUoe1xuXHRcdFx0a2V5OiAndm9pY2VNb2RlLm9uYm9hcmRpbmcuZGVzY3JpcHRpb24nLFxuXHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHQnUHJlc2VydmUgdGhlIGRvdWJsZSBzcXVhcmUgYnJhY2tldHM6IHRoZXkgbWFyayB0aGUgdGV4dCB0aGF0IGJlY29tZXMgYSBsaW5rLicsXG5cdFx0XHRcdCdUaGUgbGluayBvcGVucyBWb2ljZSBNb2RlIHNldHRpbmdzLicsXG5cdFx0XHRdLFxuXHRcdH0sIFwiQ2hvb3NlIGhvdyB5b3VyIGFnZW50IHNwZWFrcyB0byB5b3UuIEFkanVzdCBbW3NldHRpbmdzXV0gYW55dGltZS5cIik7XG5cblx0XHRkb20uYXBwZW5kKGRlc2NyaXB0aW9uLCByZW5kZXJGb3JtYXR0ZWRUZXh0KHRleHQsIHtcblx0XHRcdGFjdGlvbkhhbmRsZXI6IHtcblx0XHRcdFx0Y2FsbGJhY2s6ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxvZ0FjdGlvbignb3BlblNldHRpbmdzJyk7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChWT0lDRV9TRVRUSU5HU19DT01NQU5EKVxuXHRcdFx0XHRcdFx0LmNhdGNoKGVycm9yID0+IHRoaXMubG9nU2VydmljZS5lcnJvcihgW3ZvaWNlXSBGYWlsZWQgdG8gcnVuICR7Vk9JQ0VfU0VUVElOR1NfQ09NTUFORH06ICR7ZXJyb3J9YCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUsXG5cdFx0XHR9LFxuXHRcdH0sIGRvbS4kKCdzcGFuJykpKTtcblxuXHRcdC8vIGByZW5kZXJGb3JtYXR0ZWRUZXh0YCBnaXZlcyBlYWNoIGFuY2hvciBhIGNsaWNrIGxpc3RlbmVyIGFuZCBub3RoaW5nXG5cdFx0Ly8gZWxzZSwgc28gbWFrZSB0aGVtIHJlYWwgY29udHJvbHM6IHJlYWNoYWJsZSBieSBUYWIgYW5kIG9wZXJhYmxlIGJ5XG5cdFx0Ly8gRW50ZXIgb3IgU3BhY2UgbGlrZSBhbnkgb3RoZXIgYnV0dG9uLiBUaGUgcmVuZGVyZXIgb3ducyB0aGlzIERPTSwgc28gYVxuXHRcdC8vIHNlbGVjdG9yIGlzIHRoZSBvbmx5IGhhbmRsZSBvbiBpdCAtIHNhbWUgYXMgdGhlIGVtcHR5LWVkaXRvciBoaW50LlxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGZvciAoY29uc3QgbGluayBvZiBkZXNjcmlwdGlvbi5xdWVyeVNlbGVjdG9yQWxsKCdhJykpIHtcblx0XHRcdGxpbmsudGFiSW5kZXggPSAwO1xuXHRcdFx0bGluay5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGxpbmssIGRvbS5FdmVudFR5cGUuS0VZX0RPV04sIGV2ZW50ID0+IHtcblx0XHRcdFx0Y29uc3Qga2V5Ym9hcmRFdmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZXZlbnQpO1xuXHRcdFx0XHRpZiAoa2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwga2V5Ym9hcmRFdmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpIHtcblx0XHRcdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0bGluay5jbGljaygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERpc21pc3NhbCBpcyBhbHdheXMgYXZhaWxhYmxlIGFuZCBuZXZlciBnYXRlZDogYSBkaXNhYmxlZCBjbG9zZSB3b3VsZCB0cmFwXG5cdCAqIHNvbWVvbmUgaW4gdGhlIGNhcmQuIENob29zaW5nIGEgdm9pY2UgYWxyZWFkeSBjb21taXRzIGl0LCBzbyB0aGlzIGlzIG9ubHlcblx0ICogZXZlciBcIkkgYW0gZG9uZSBoZXJlXCIgLSBhbmQgY2xvc2luZyBpcyB3aGF0IGhhbmRzIHRoZSBzZXNzaW9uIGJhY2suXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlckNsb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2FyZC5hZGRBY3Rpb24oe1xuXHRcdFx0Y2xhc3NOYW1lOiAndm9pY2UtbW9kZS1vbmJvYXJkaW5nLWNsb3NlJyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLmNsb3NlJywgXCJDbG9zZSB0aGUgaW50cm9kdWN0aW9uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZUNvbXBhY3QsXG5cdFx0XHRvbkFjdGl2YXRlOiAoKSA9PiB0aGlzLmZpbmlzaCgpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0ZvclNjcmVlblJlYWRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0Vm9pY2Uodm9pY2U6IElWb2ljZU1vZGVWb2ljZSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnBsYXllci5wbGF5aW5nVm9pY2UgPT09IHZvaWNlLmlkKSB7XG5cdFx0XHR0aGlzLnBsYXllci5zdG9wKCk7XG5cdFx0XHRzdGF0dXMobG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLnByZXZpZXdTdG9wcGVkJywgXCJ7MH0gcHJldmlldyBzdG9wcGVkLlwiLCB2b2ljZS5sYWJlbCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxvZ0FjdGlvbignc2VsZWN0Vm9pY2UnKTtcblx0XHR0aGlzLnNlbGVjdGVkVm9pY2UgPSB2b2ljZTtcblx0XHR0aGlzLnVwZGF0ZVNlbGVjdGlvbigpO1xuXHRcdHRoaXMucGxheWVyLnBsYXkodm9pY2UuaWQpO1xuXHRcdHN0YXR1cyhsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2Uuc2VsZWN0ZWQnLCBcInswfSBzZWxlY3RlZC5cIiwgdm9pY2UubGFiZWwpKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFZPSUNFX1NFVFRJTkcsIHZvaWNlLmlkLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpXG5cdFx0XHQuY2F0Y2goZXJyb3IgPT4gdGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbdm9pY2VdIEZhaWxlZCB0byBwZXJzaXN0IHRoZSBWb2ljZSBNb2RlIHZvaWNlOiAke2Vycm9yfWApKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbG9jYWxpemVkIHZvaWNlIGlzIG5vdCBhIGNob2ljZSAtIGl0IGlzIHRoZSBvbmx5IHZvaWNlIGZvciB0aGVcblx0ICogbGFuZ3VhZ2UgLSBzbyBwcmV2aWV3aW5nIGl0IGp1c3QgcGxheXMgYW5kIHN0b3BzLCBhbmQgbmV2ZXIgcGVyc2lzdHMuXG5cdCAqL1xuXHRwcml2YXRlIHByZXZpZXdMb2NhbGl6ZWRWb2ljZSh2b2ljZTogSUxvY2FsaXplZFZvaWNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucGxheWVyLnBsYXlpbmdWb2ljZSA9PT0gdm9pY2UuaWQpIHtcblx0XHRcdHRoaXMucGxheWVyLnN0b3AoKTtcblx0XHRcdHN0YXR1cyhsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UubG9jYWxpemVkU3RvcHBlZCcsIFwiezB9IHByZXZpZXcgc3RvcHBlZC5cIiwgdm9pY2UubGFiZWwpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sb2dBY3Rpb24oJ3ByZXZpZXdWb2ljZScpO1xuXHRcdHRoaXMucGxheWVyLnBsYXkodm9pY2UuaWQpO1xuXHRcdHN0YXR1cyhsb2NhbGl6ZSgndm9pY2VNb2RlLm9uYm9hcmRpbmcudm9pY2UubG9jYWxpemVkUGxheWluZycsIFwiUGxheWluZyB7MH0gcHJldmlldy5cIiwgdm9pY2UubGFiZWwpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc3Bva2VuIGxhbmd1YWdlLCBtaXJyb3JpbmcgdGhlIHJlc29sdXRpb24gdGhlIHZvaWNlIGNsaWVudCB1c2VzOiBhblxuXHQgKiBleHBsaWNpdCB0ZXN0IG92ZXJyaWRlLCB0aGVuIHRoZSBjb25maWd1cmVkIGxhbmd1YWdlICh1bmxlc3MgYGF1dG9gKSwgdGhlblxuXHQgKiB0aGUgd2luZG93J3MgbGFuZ3VhZ2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlc29sdmVTcG9rZW5MYW5ndWFnZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMudm9pY2VMYW5ndWFnZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3B0aW9ucy52b2ljZUxhbmd1YWdlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRMYW5ndWFnZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihWT0lDRV9MQU5HVUFHRV9TRVRUSU5HKT8udHJpbSgpO1xuXHRcdGlmIChjb25maWd1cmVkTGFuZ3VhZ2UgJiYgY29uZmlndXJlZExhbmd1YWdlLnRvTG93ZXJDYXNlKCkgIT09ICdhdXRvJykge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyZWRMYW5ndWFnZTtcblx0XHR9XG5cdFx0cmV0dXJuIGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKS5uYXZpZ2F0b3IubGFuZ3VhZ2U7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNlbGVjdGlvbigpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtpZCwgZW50cnldIG9mIHRoaXMudm9pY2VFbGVtZW50cykge1xuXHRcdFx0Y29uc3Qgc2VsZWN0ZWQgPSBpZCA9PT0gdGhpcy5zZWxlY3RlZFZvaWNlPy5pZDtcblx0XHRcdGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBzZWxlY3RlZCk7XG5cdFx0XHRlbnRyeS5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgU3RyaW5nKHNlbGVjdGVkKSk7XG5cdFx0fVxuXHRcdHRoaXMudXBkYXRlVGFiU3RvcCgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEtlZXBzIGEgc2luZ2xlIHRhYiBzdG9wIG9uIHRoZSBncm91cDogdGhlIGNob3NlbiB2b2ljZSwgb3IgdGhlIGZpcnN0IG9uZVxuXHQgKiB3aGVuIG5vdGhpbmcgaGFzIGJlZW4gY2hvc2VuIHlldC5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlVGFiU3RvcCgpOiB2b2lkIHtcblx0XHRsZXQgZmlyc3QgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgW2lkLCBlbnRyeV0gb2YgdGhpcy52b2ljZUVsZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBpc1RhYlN0b3AgPSB0aGlzLnNlbGVjdGVkVm9pY2UgPT09IHVuZGVmaW5lZCA/IGZpcnN0IDogaWQgPT09IHRoaXMuc2VsZWN0ZWRWb2ljZS5pZDtcblx0XHRcdGVudHJ5LmVsZW1lbnQudGFiSW5kZXggPSBpc1RhYlN0b3AgPyAwIDogLTE7XG5cdFx0XHRmaXJzdCA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUGxheWluZyhwbGF5aW5nVm9pY2U6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2lkLCBlbnRyeV0gb2YgdGhpcy52b2ljZUVsZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBwbGF5aW5nID0gaWQgPT09IHBsYXlpbmdWb2ljZTtcblx0XHRcdGVudHJ5LmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgncGxheWluZycsIHBsYXlpbmcpO1xuXHRcdFx0ZW50cnkuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBwbGF5aW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ3ZvaWNlTW9kZS5vbmJvYXJkaW5nLnZvaWNlLnN0b3BQcmV2aWV3JywgXCJTdG9wIHswfSBwcmV2aWV3LlwiLCBlbnRyeS5sYWJlbClcblx0XHRcdFx0OiBlbnRyeS5yZXN0aW5nQXJpYSk7XG5cdFx0fVxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdwbGF5aW5nJywgcGxheWluZ1ZvaWNlICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5pc2goKTogdm9pZCB7XG5cdFx0dGhpcy5wbGF5ZXIuc3RvcCgpO1xuXHRcdHRoaXMubG9nQWN0aW9uKCdjbG9zZScpO1xuXHRcdHRoaXMub3B0aW9ucy5vbkRpc21pc3MoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9nQWN0aW9uKGFjdGlvbjogVm9pY2VNb2RlT25ib2FyZGluZ0FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFZvaWNlTW9kZU9uYm9hcmRpbmdBY3Rpb25FdmVudCwgVm9pY2VNb2RlT25ib2FyZGluZ0FjdGlvbkNsYXNzaWZpY2F0aW9uPihcblx0XHRcdCd2b2ljZU1vZGVPbmJvYXJkaW5nLmFjdGlvbicsXG5cdFx0XHR7IGFjdGlvbiwgc291cmNlOiB0aGlzLm9wdGlvbnMuc291cmNlIH1cblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlPigndm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlzVmlzaWJsZTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUmVnaXN0ZXIgYSBjb250YWluZXIgdGhhdCBjYW4gaG9zdCB0aGUgYmFubmVyIChhIGNoYXQgaW5wdXQpLiBUaGUgbW9zdFxuXHQgKiByZWNlbnRseSBmb2N1c2VkIGhvc3Qgd2lucyB3aGVuIHRoZSBiYW5uZXIgaXMgc2hvd24uXG5cdCAqXG5cdCAqIEBwYXJhbSBjb250YWluZXIgdGhlIGVsZW1lbnQgdGhlIGJhbm5lciBpcyBhcHBlbmRlZCB0by5cblx0ICogQHBhcmFtIGZvY3VzUm9vdCB0aGUgZWxlbWVudCB3aG9zZSBmb2N1cyBtYXJrcyB0aGlzIGhvc3QgYXMgdGhlIGFjdGl2ZSBvbmVcblx0ICogKHR5cGljYWxseSB0aGUgY2hhdCBpbnB1dCBwYXJ0IHRoZSBjb250YWluZXIgbGl2ZXMgaW4pLlxuXHQgKiBAcGFyYW0gZm9jdXMgaGFuZHMgZm9jdXMgYmFjayB0byB0aGlzIGhvc3QncyBpbnB1dCB3aGVuIHRoZSBiYW5uZXIgY2xvc2VzLlxuXHQgKiBQYXNzZWQgZXhwbGljaXRseSBiZWNhdXNlIGBmb2N1c1Jvb3RgIGlzIGEgY29udGFpbmVyLCBub3QgYSBjb250cm9sIC0gdGhlXG5cdCAqIGhvc3Qga25vd3Mgd2hlcmUgaXRzIGNhcmV0IGJlbG9uZ3MgYW5kIHRoaXMgc2VydmljZSBkb2VzIG5vdC5cblx0ICovXG5cdHJlZ2lzdGVySG9zdChjb250YWluZXI6IEhUTUxFbGVtZW50LCBmb2N1c1Jvb3Q6IEhUTUxFbGVtZW50LCBmb2N1czogKCkgPT4gdm9pZCwgdGlwQ29udGFpbmVyPzogSFRNTEVsZW1lbnQsIG9uRGlkQ2hhbmdlVmlzaWJsZT86ICh2aXNpYmxlOiBib29sZWFuKSA9PiB2b2lkKTogSURpc3Bvc2FibGU7XG5cblx0LyoqXG5cdCAqIFNob3cgdGhlIGludHJvZHVjdGlvbiBpZiB0aGUgdXNlciBoYXMgbmV2ZXIgc2VlbiBpdC4gTWFya3MgaXQgYXMgc2VlbiBvblxuXHQgKiB0aGUgZmlyc3Qgc3VjY2Vzc2Z1bCBzaG93LCBzbyBpdCBuZXZlciBhcHBlYXJzIGFnYWluLlxuXHQgKi9cblx0c2hvd0lmTmVlZGVkKCk6IHZvaWQ7XG5cblx0LyoqIFNob3cgdGhlIGludHJvZHVjdGlvbiBhZ2FpbiByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQgaGFzIGJlZW4gc2Vlbi4gKi9cblx0c2hvdygpOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVm9pY2VNb2RlT25ib2FyZGluZ1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uYm9hcmRpbmc6IENoYXRJbnB1dE9uYm9hcmRpbmc7XG5cblx0Z2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLmlzVmlzaWJsZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5vbmJvYXJkaW5nID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRPbmJvYXJkaW5nLCB7XG5cdFx0XHRzdG9yYWdlS2V5OiBBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLkludHJvQmFubmVyU2hvd24sXG5cdFx0XHRob3N0Q2xhc3M6ICdoYXMtdm9pY2UtbW9kZS1vbmJvYXJkaW5nJyxcblx0XHR9KSk7XG5cdH1cblxuXHRyZWdpc3Rlckhvc3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZm9jdXNSb290OiBIVE1MRWxlbWVudCwgZm9jdXM6ICgpID0+IHZvaWQsIHRpcENvbnRhaW5lcj86IEhUTUxFbGVtZW50LCBvbkRpZENoYW5nZVZpc2libGU/OiAodmlzaWJsZTogYm9vbGVhbikgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLnJlZ2lzdGVySG9zdChjb250YWluZXIsIGZvY3VzUm9vdCwgZm9jdXMsIHRpcENvbnRhaW5lciwgb25EaWRDaGFuZ2VWaXNpYmxlKTtcblx0fVxuXG5cdHNob3dJZk5lZWRlZCgpOiB2b2lkIHtcblx0XHR0aGlzLm9uYm9hcmRpbmcuc2hvd0lmTmVlZGVkKGNvbnRleHQgPT4gdGhpcy5jcmVhdGVCYW5uZXIoY29udGV4dCwgJ2F1dG9tYXRpYycpKTtcblx0fVxuXG5cdHNob3coKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMub25ib2FyZGluZy5zaG93KGNvbnRleHQgPT4gdGhpcy5jcmVhdGVCYW5uZXIoY29udGV4dCwgJ21hbnVhbCcpKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQmFubmVyKGNvbnRleHQ6IElDaGF0SW5wdXRPbmJvYXJkaW5nQ29udGV4dCwgc291cmNlOiAnYXV0b21hdGljJyB8ICdtYW51YWwnKTogVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lciB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVm9pY2VNb2RlT25ib2FyZGluZ0Jhbm5lciwge1xuXHRcdFx0Y29udGFpbmVyOiBjb250ZXh0LmNvbnRhaW5lcixcblx0XHRcdG9uRGlzbWlzczogKCkgPT4gY29udGV4dC5kaXNtaXNzKGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGNvbnRleHQuY29udGFpbmVyKSksXG5cdFx0XHRzb3VyY2UsXG5cdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVZvaWNlTW9kZU9uYm9hcmRpbmdTZXJ2aWNlLCBWb2ljZU1vZGVPbmJvYXJkaW5nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7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
