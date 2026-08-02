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
import { renderFormattedText } from "../../../../../base/browser/formattedTextRenderer.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { status } from "../../../../../base/browser/ui/aria/aria.js";
import { SelectBox } from "../../../../../base/browser/ui/selectBox/selectBox.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { localize } from "../../../../../nls.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { createDecorator, IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { defaultSelectBoxStyles } from "../../../../../platform/theme/browser/defaultStyles.js";
import { AgentsVoiceStorageKeys } from "../../../agentsVoice/common/agentsVoice.js";
import { CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID } from "../actions/configureVoiceInstructionsAction.js";
import { ChatInputOnboarding, ChatInputOnboardingCard } from "../widget/input/chatInputOnboarding.js";
import "./media/dictationOnboarding.css";
const DICTATION_INTRO_SHOWN_KEY = "chat.dictation.introShown";
const SHOW_DICTATION_ONBOARDING_COMMAND = "workbench.action.chat.showSpeechToTextIntroduction";
const RESET_DICTATION_ONBOARDING_COMMAND = "workbench.action.chat.resetSpeechToTextIntroduction";
const OPEN_SETTINGS_COMMAND = "workbench.action.openSettings";
const DICTATION_SETTINGS_QUERY = "dictation";
const SYSTEM_DEFAULT_DEVICE_ID = "";
const BAR_WIDTH = 1;
const BAR_GAP = 2;
const IDLE_GAIN = 0.55;
const SPEAKING_GAIN = 0.45;
const LEVEL_EASING = 0.12;
const RESTING_OPACITY = 0.35;
const SPEAKING_OPACITY = 0.5;
const UNAVAILABLE_OPACITY = 0.2;
const REDUCED_MOTION_PAINT_INTERVAL_MS = 100;
function readMicrophoneLevel(analyser, waveform) {
  if (!analyser || !waveform) {
    return 0;
  }
  analyser.getByteTimeDomainData(waveform);
  let sum = 0;
  for (const sample of waveform) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / waveform.length) * 4);
}
const WAVES = [
  { frequency: 1, amplitude: 0.42, speed: 0.42, phase: 0 },
  { frequency: 1.7, amplitude: 0.26, speed: -0.31, phase: 1.1 },
  { frequency: 2.6, amplitude: 0.19, speed: 0.24, phase: 2.4 },
  { frequency: 4.1, amplitude: 0.13, speed: -0.18, phase: 0.7 }
];
function bandFraction(position, time) {
  let amplitude = 0;
  let total = 0;
  for (const wave of WAVES) {
    const phase = position * wave.frequency * Math.PI * 2 + time * wave.speed + wave.phase;
    amplitude += (0.5 + 0.5 * Math.sin(phase)) * wave.amplitude;
    total += wave.amplitude;
  }
  if (total === 0) {
    return 0;
  }
  const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, position)));
  return amplitude / total * (0.35 + 0.65 * taper);
}
var MicrophonePreviewError = /* @__PURE__ */ ((MicrophonePreviewError2) => {
  MicrophonePreviewError2["Denied"] = "denied";
  MicrophonePreviewError2["NoDevice"] = "noDevice";
  MicrophonePreviewError2["Unavailable"] = "unavailable";
  return MicrophonePreviewError2;
})(MicrophonePreviewError || {});
let MicrophonePreview = class extends Disposable {
  constructor(element, mediaDevices, logService) {
    super();
    this.element = element;
    this.mediaDevices = mediaDevices;
    this.logService = logService;
    this.session = this._register(new MutableDisposable());
    this._onDidChangeError = this._register(new Emitter());
    /** Fires with the reason no level is available, or `undefined` once one is. */
    this.onDidChangeError = this._onDidChangeError.event;
  }
  get error() {
    return this._error;
  }
  /**
   * Current loudness, `0..1`, or `0` when nothing is being heard. Read every
   * frame, so it stays allocation-free.
   */
  getLevel() {
    return readMicrophoneLevel(this.analyser, this.waveform);
  }
  /**
   * Listen to `deviceId` (empty means the system default). Replaces any stream
   * already running, so switching devices never leaves two microphones open.
   */
  async listen(deviceId) {
    if (this._store.isDisposed) {
      return;
    }
    this.releaseMicrophone();
    const targetWindow = dom.getWindow(this.element);
    if (!this.mediaDevices?.getUserMedia) {
      this.setError("unavailable" /* Unavailable */);
      return;
    }
    const constraints = { channelCount: 1, echoCancellation: true, noiseSuppression: true };
    if (deviceId) {
      constraints.deviceId = { exact: deviceId };
    }
    let stream;
    try {
      stream = await this.mediaDevices.getUserMedia({ audio: constraints });
    } catch (error) {
      this.setError(toPreviewError(error));
      this.logService.trace(`[chat-stt] microphone preview unavailable: ${error}`);
      return;
    }
    const store = new DisposableStore();
    store.add(toDisposable(() => stream.getTracks().forEach((track) => track.stop())));
    let analyser;
    try {
      const context = new targetWindow.AudioContext();
      store.add(toDisposable(() => void context.close().catch(() => {
      })));
      if (context.state === "suspended") {
        await context.resume();
      }
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
    } catch (error) {
      store.dispose();
      this.setError("unavailable" /* Unavailable */);
      this.logService.trace(`[chat-stt] microphone preview analyser unavailable: ${error}`);
      return;
    }
    if (this._store.isDisposed) {
      store.dispose();
      return;
    }
    this.session.value = store;
    this.analyser = analyser;
    this.waveform = new Uint8Array(analyser.fftSize);
    this.setError(void 0);
  }
  /**
   * Hand the microphone back. Called before dictation acquires its own stream:
   * two captures of one device is what makes the audio service drop the
   * capture, so the preview always lets go first.
   */
  releaseMicrophone() {
    this.analyser = void 0;
    this.waveform = void 0;
    this.session.clear();
  }
  setError(error) {
    if (this._error === error) {
      return;
    }
    this._error = error;
    this._onDidChangeError.fire(error);
  }
};
MicrophonePreview = __decorateClass([
  __decorateParam(2, ILogService)
], MicrophonePreview);
function toPreviewError(error) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "denied" /* Denied */;
    }
    if (error.name === "NotFoundError" || error.name === "OverconstrainedError") {
      return "noDevice" /* NoDevice */;
    }
  }
  return "unavailable" /* Unavailable */;
}
let MicrophoneWaveform = class extends Disposable {
  constructor(container, source, observerCtor, accessibilityService) {
    super();
    this.container = container;
    this.source = source;
    this.accessibilityService = accessibilityService;
    this.bars = [];
    this.animationFrame = this._register(new MutableDisposable());
    this.running = false;
    this.lastPaint = 0;
    this.level = 0;
    container.setAttribute("aria-hidden", "true");
    const observer = new (observerCtor ?? dom.getWindow(container).ResizeObserver)(() => this.layout());
    observer.observe(container);
    this._register(toDisposable(() => observer.disconnect()));
    this.layout();
    this._register(toDisposable(() => this.stop()));
  }
  /** Rebuild the row for the current width, if the count actually changed. */
  layout() {
    const width = this.container.clientWidth;
    if (!width) {
      return;
    }
    const count = Math.max(1, Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)));
    if (count === this.bars.length) {
      return;
    }
    dom.clearNode(this.container);
    this.bars = [];
    for (let i = 0; i < count; i++) {
      this.bars.push(dom.append(this.container, dom.$("span.dictation-onboarding-bar")));
    }
  }
  start() {
    if (this.running) {
      return;
    }
    this.running = true;
    const targetWindow = dom.getWindow(this.container);
    const tick = () => {
      if (!this.running) {
        return;
      }
      this.update(targetWindow.performance.now());
      this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
    };
    this.animationFrame.value = dom.scheduleAtNextAnimationFrame(targetWindow, tick);
  }
  stop() {
    this.running = false;
    this.animationFrame.clear();
  }
  update(timestamp) {
    const interval = this.accessibilityService.isMotionReduced() ? REDUCED_MOTION_PAINT_INTERVAL_MS : 0;
    if (timestamp - this.lastPaint < interval) {
      return;
    }
    this.lastPaint = timestamp;
    this.level += (this.source.getLevel() - this.level) * LEVEL_EASING;
    const gain = IDLE_GAIN + this.level * SPEAKING_GAIN;
    const time = timestamp * 1e-3;
    this.container.style.opacity = (this.source.isAvailable() ? RESTING_OPACITY + this.level * SPEAKING_OPACITY : UNAVAILABLE_OPACITY).toFixed(3);
    const count = this.bars.length;
    for (let i = 0; i < count; i++) {
      const position = count > 1 ? i / (count - 1) : 0;
      const amount = Math.max(0.08, Math.min(1, bandFraction(position, time) * gain));
      this.bars[i].style.transform = `scaleY(${amount.toFixed(3)})`;
    }
  }
};
MicrophoneWaveform = __decorateClass([
  __decorateParam(3, IAccessibilityService)
], MicrophoneWaveform);
function buildMicrophoneOptions(devices) {
  const seen = /* @__PURE__ */ new Set();
  const microphones = [];
  for (const device of devices) {
    if (device.kind !== "audioinput" || device.deviceId === "default" || device.deviceId === "communications") {
      continue;
    }
    if (seen.has(device.deviceId)) {
      continue;
    }
    seen.add(device.deviceId);
    microphones.push(device);
  }
  if (microphones.length === 0) {
    return [{
      deviceId: SYSTEM_DEFAULT_DEVICE_ID,
      label: localize("dictation.onboarding.systemDefault", "System default")
    }];
  }
  const defaultDevice = devices.find((device) => device.kind === "audioinput" && device.deviceId === "default");
  const defaultLabel = defaultDevice?.label.replace(/^(?:default|system default)\s*-\s*/i, "").trim();
  const defaultMicrophone = defaultDevice ? microphones.find(
    (device) => defaultDevice.groupId && device.groupId === defaultDevice.groupId || defaultLabel && device.label === defaultLabel
  ) ?? microphones[0] : void 0;
  const options = [];
  if (defaultDevice) {
    const label = defaultMicrophone?.label || defaultLabel;
    options.push({
      deviceId: SYSTEM_DEFAULT_DEVICE_ID,
      label: label ? localize("dictation.onboarding.defaultDevice", "{0} (System default)", label) : localize("dictation.onboarding.systemDefault", "System default")
    });
  }
  for (const device of microphones) {
    if (device === defaultMicrophone) {
      continue;
    }
    options.push({
      deviceId: device.deviceId,
      // Labels are empty until microphone permission has been granted at
      // least once; a truncated id is still better than a blank row.
      label: device.label || localize("dictation.onboarding.unknownDevice", "Unknown device ({0})", device.deviceId.slice(0, 8))
    });
  }
  return options;
}
function indexOfMicrophone(options, deviceId) {
  const index = options.findIndex((option) => option.deviceId === deviceId);
  return index === -1 ? 0 : index;
}
let DictationOnboardingBanner = class extends Disposable {
  constructor(bannerOptions, mediaDevices, commandService, contextViewService, instantiationService, logService, storageService, telemetryService) {
    super();
    this.bannerOptions = bannerOptions;
    this.mediaDevices = mediaDevices;
    this.commandService = commandService;
    this.contextViewService = contextViewService;
    this.logService = logService;
    this.storageService = storageService;
    this.telemetryService = telemetryService;
    this.picker = this._register(new MutableDisposable());
    this.options = [];
    this.card = this._register(new ChatInputOnboardingCard({
      container: bannerOptions.container,
      className: "dictation-onboarding-banner",
      ariaLabel: localize("dictation.onboarding.region", "Dictation introduction"),
      ariaDescription: bannerOptions.previewMicrophone ? localize("dictation.onboarding.regionDescription.preview", "Say anything to check your microphone.") : localize("dictation.onboarding.regionDescription", "Speak and it becomes text."),
      onEscape: () => this.dismiss("escape")
    }));
    this.domNode = this.card.domNode;
    const header = dom.append(this.domNode, dom.$(".dictation-onboarding-header"));
    const title = dom.append(header, dom.$(".dictation-onboarding-title"));
    title.textContent = localize("dictation.onboarding.title", "Dictation");
    this.renderDescription(header);
    this.renderClose();
    const device = dom.append(this.domNode, dom.$(".dictation-onboarding-device"));
    this.pickerContainer = dom.append(device, dom.$(".dictation-onboarding-picker"));
    this.options = [{
      deviceId: SYSTEM_DEFAULT_DEVICE_ID,
      label: localize("dictation.onboarding.systemDefault", "System default")
    }];
    this.renderPicker();
    if (this.mediaDevices) {
      this._register(dom.addDisposableListener(this.mediaDevices, "devicechange", () => void this.refreshMicrophones()));
    }
    const waveformContainer = dom.append(device, dom.$(".dictation-onboarding-waveform"));
    if (this.bannerOptions.previewMicrophone) {
      const preview = this.preview = this._register(instantiationService.createInstance(MicrophonePreview, this.domNode, this.mediaDevices));
      this.waveform = this._register(instantiationService.createInstance(MicrophoneWaveform, waveformContainer, {
        getLevel: () => preview.getLevel(),
        isAvailable: () => preview.error === void 0
      }, void 0));
      this._register(preview.onDidChangeError(() => this.updateHint()));
      this.hint = dom.append(this.domNode, dom.$(".dictation-onboarding-hint"));
      this.hint.setAttribute("aria-live", "polite");
      this.updateHint();
      void this.startPreview();
    } else {
      this.waveform = this._register(instantiationService.createInstance(MicrophoneWaveform, waveformContainer, {
        getLevel: () => readMicrophoneLevel(this.dictationAnalyser, this.dictationWaveform),
        isAvailable: () => this.dictationAnalyser !== void 0
      }, void 0));
      void this.refreshMicrophones();
    }
    this.waveform.start();
    this.logAction("shown");
  }
  /**
   * What dictation is, and that none of it is fixed. The card is shown once, so
   * the two things a user might want to change afterwards - whether dictation
   * runs at all, and how it writes what they say - have to be reachable from
   * here rather than left to a command nobody knows to look for.
   *
   * `[[...]]` marks the clauses that become links, so translators can keep the
   * sentence natural instead of having fixed phrases concatenated on.
   */
  renderDescription(container) {
    const description = dom.append(container, dom.$(".dictation-onboarding-description"));
    const text = localize({
      key: "dictation.onboarding.description",
      comment: ["Preserve the double square brackets: they mark the text that becomes a link. Keep both links, in this order - the first opens settings, the second opens the customization file."]
    }, "Speak and it becomes text. Adjust [[settings]] or [[how it's written]] any time.");
    dom.append(description, renderFormattedText(text, {
      actionHandler: {
        // The handler is given the link's index, so the two are told apart
        // by position - hence the ordering note to translators above.
        callback: (index) => {
          const [commandId, ...args] = index === "0" ? [OPEN_SETTINGS_COMMAND, { query: DICTATION_SETTINGS_QUERY }] : [CONFIGURE_DICTATION_INSTRUCTIONS_ACTION_ID];
          this.logAction(index === "0" ? "openSettings" : "openInstructions");
          this.commandService.executeCommand(commandId, ...args).catch((error) => this.logService.error(`[chat-stt] failed to open dictation customization: ${error}`));
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
   * Bring the card to life. The device list and the microphone are started
   * together rather than in sequence: `getUserMedia` can take a second or more
   * to return, and waiting for it would leave the picker empty for that whole
   * time. Enumeration is repeated once the microphone is live, because device
   * labels stay blank until permission has been granted at least once.
   */
  async startPreview() {
    if (!this.preview) {
      return;
    }
    const listening = this.preview.listen(this.currentDeviceId());
    await Promise.all([listening, this.refreshMicrophones()]);
    await this.refreshMicrophones();
  }
  currentDeviceId() {
    return this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION, SYSTEM_DEFAULT_DEVICE_ID);
  }
  async refreshMicrophones(analyserNode, switchMicrophone) {
    if (this._store.isDisposed) {
      return;
    }
    this.switchMicrophone = switchMicrophone ?? this.switchMicrophone;
    if (!this.preview && analyserNode) {
      this.dictationAnalyser = analyserNode;
      this.dictationWaveform = new Uint8Array(analyserNode.fftSize);
    }
    if (!this.preview && !this.dictationAnalyser) {
      return;
    }
    if (!this.mediaDevices?.enumerateDevices) {
      return;
    }
    let devices;
    try {
      devices = await this.mediaDevices.enumerateDevices();
    } catch (error) {
      this.logService.trace(`[chat-stt] could not enumerate microphones: ${error}`);
      return;
    }
    if (this._store.isDisposed) {
      return;
    }
    const options = buildMicrophoneOptions(devices);
    if (this.options.length > 1 && !options.some((option) => option.deviceId && option.label)) {
      return;
    }
    this.options = options;
    this.renderPicker();
  }
  /** A picker with one entry is not a choice, so only show this row for multiple microphones. */
  renderPicker() {
    if (!this.pickerContainer) {
      return;
    }
    this.picker.clear();
    dom.clearNode(this.pickerContainer);
    this.pickerContainer.hidden = this.options.length <= 1;
    if (this.pickerContainer.hidden) {
      return;
    }
    dom.append(this.pickerContainer, dom.$(`span.codicon.codicon-${Codicon.mic.id}.dictation-onboarding-picker-icon`)).setAttribute("aria-hidden", "true");
    const selected = indexOfMicrophone(this.options, this.currentDeviceId());
    const store = new DisposableStore();
    const selectBox = store.add(new SelectBox(
      this.options.map((option) => ({ text: option.label })),
      selected,
      this.contextViewService,
      { ...defaultSelectBoxStyles, selectBackground: void 0, selectBorder: void 0, selectForeground: void 0 },
      { ariaLabel: localize("dictation.onboarding.microphone", "Microphone"), useCustomDrawn: true }
    ));
    selectBox.render(this.pickerContainer);
    store.add(selectBox.onDidSelect((event) => this.selectMicrophone(event.index)));
    this.picker.value = store;
  }
  selectMicrophone(index) {
    const option = this.options[index];
    if (!option) {
      return;
    }
    this.logAction("selectMicrophone");
    if (option.deviceId) {
      this.storageService.store(AgentsVoiceStorageKeys.MicrophoneDevice, option.deviceId, StorageScope.APPLICATION, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
    }
    status(localize("dictation.onboarding.microphoneSelected", "{0} selected.", option.label));
    if (this.preview) {
      void this.preview.listen(option.deviceId).then(() => this.updateHint());
    } else if (this.switchMicrophone) {
      void this.switchMicrophone(option.deviceId).then((analyser) => this.refreshMicrophones(analyser)).catch((error) => this.logService.error(`[chat-stt] failed to switch dictation microphone: ${error}`));
    }
  }
  /**
   * The hint only speaks when the microphone cannot be read. At rest the
   * moving waveform is the instruction - a line of text telling you to talk is
   * one the card can do without.
   */
  updateHint() {
    if (!this.preview || !this.hint) {
      return;
    }
    const error = this.preview.error;
    this.domNode.classList.toggle("has-error", error !== void 0);
    this.hint.textContent = error === void 0 ? "" : hintForError(error);
  }
  renderClose() {
    this.card.addAction({
      className: "dictation-onboarding-close",
      ariaLabel: localize("dictation.onboarding.close", "Close the introduction"),
      icon: Codicon.close,
      onActivate: () => this.dismiss("close")
    });
  }
  dismiss(action) {
    this.logAction(action);
    this.waveform.stop();
    this.preview?.releaseMicrophone();
    this.bannerOptions.onDismiss();
  }
  logAction(action) {
    this.telemetryService.publicLog2(
      "dictationOnboarding.action",
      { action, source: this.bannerOptions.source }
    );
  }
};
DictationOnboardingBanner = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IContextViewService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ILogService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, ITelemetryService)
], DictationOnboardingBanner);
function hintForError(error) {
  switch (error) {
    case "denied" /* Denied */:
      return localize("dictation.onboarding.denied", "No microphone access. Check your system privacy settings.");
    case "noDevice" /* NoDevice */:
      return localize("dictation.onboarding.noDevice", "No microphone found.");
    default:
      return localize("dictation.onboarding.unavailable", "Can't read the microphone level.");
  }
}
const IDictationOnboardingService = createDecorator("dictationOnboardingService");
let DictationOnboardingService = class extends Disposable {
  constructor(instantiationService, storageService) {
    super();
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.onboarding = this._register(this.instantiationService.createInstance(ChatInputOnboarding, {
      storageKey: DICTATION_INTRO_SHOWN_KEY,
      hostClass: "has-dictation-onboarding"
    }));
  }
  get isVisible() {
    return this.onboarding.isVisible;
  }
  registerHost(container, focusRoot, tipContainer, onDidChangeVisible) {
    return this.onboarding.registerHost(container, focusRoot, void 0, tipContainer, onDidChangeVisible);
  }
  showIfNeeded() {
    return this.onboarding.showIfNeeded((context) => this.createBanner(context.container, context.dismiss, "automatic", false));
  }
  show() {
    return this.onboarding.show((context) => this.createBanner(context.container, context.dismiss, "manual", true));
  }
  refreshMicrophones(analyserNode, switchMicrophone) {
    if (this.onboarding.isVisible) {
      void this.currentBanner?.refreshMicrophones(analyserNode, switchMicrophone);
    }
  }
  reset() {
    this.storageService.remove(DICTATION_INTRO_SHOWN_KEY, StorageScope.APPLICATION);
  }
  createBanner(container, dismiss, source, previewMicrophone) {
    const banner = this.instantiationService.createInstance(DictationOnboardingBanner, {
      container,
      onDismiss: dismiss,
      previewMicrophone,
      source
    }, dom.getWindow(container).navigator.mediaDevices);
    this.currentBanner = banner;
    return banner;
  }
};
DictationOnboardingService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService)
], DictationOnboardingService);
registerSingleton(IDictationOnboardingService, DictationOnboardingService, InstantiationType.Delayed);
export {
  DictationOnboardingBanner,
  DictationOnboardingService,
  IDictationOnboardingService,
  RESET_DICTATION_ONBOARDING_COMMAND,
  SHOW_DICTATION_ONBOARDING_COMMAND,
  buildMicrophoneOptions,
  indexOfMicrophone
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uT25ib2FyZGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IHN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgU2VsZWN0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NlbGVjdEJveC9zZWxlY3RCb3guanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRzVm9pY2VTdG9yYWdlS2V5cyB9IGZyb20gJy4uLy4uLy4uL2FnZW50c1ZvaWNlL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBDT05GSUdVUkVfRElDVEFUSU9OX0lOU1RSVUNUSU9OU19BQ1RJT05fSUQgfSBmcm9tICcuLi9hY3Rpb25zL2NvbmZpZ3VyZVZvaWNlSW5zdHJ1Y3Rpb25zQWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE9uYm9hcmRpbmcsIENoYXRJbnB1dE9uYm9hcmRpbmdDYXJkIH0gZnJvbSAnLi4vd2lkZ2V0L2lucHV0L2NoYXRJbnB1dE9uYm9hcmRpbmcuanMnO1xuaW1wb3J0ICcuL21lZGlhL2RpY3RhdGlvbk9uYm9hcmRpbmcuY3NzJztcblxuLyoqXG4gKiBNYXJrcyB0aGUgaW50cm9kdWN0aW9uIGFzIHNlZW4uIERpY3RhdGlvbi1zY29wZWQgYW5kIGRlbGliZXJhdGVseSBzZXBhcmF0ZVxuICogZnJvbSB0aGUgVm9pY2UgTW9kZSBpbnRyb2R1Y3Rpb24sIHNvIG5laXRoZXIgZmVhdHVyZSdzIGNhcmQgc3VwcHJlc3NlcyB0aGVcbiAqIG90aGVyJ3MuXG4gKi9cbmNvbnN0IERJQ1RBVElPTl9JTlRST19TSE9XTl9LRVkgPSAnY2hhdC5kaWN0YXRpb24uaW50cm9TaG93bic7XG5cbmV4cG9ydCBjb25zdCBTSE9XX0RJQ1RBVElPTl9PTkJPQVJESU5HX0NPTU1BTkQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnNob3dTcGVlY2hUb1RleHRJbnRyb2R1Y3Rpb24nO1xuZXhwb3J0IGNvbnN0IFJFU0VUX0RJQ1RBVElPTl9PTkJPQVJESU5HX0NPTU1BTkQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnJlc2V0U3BlZWNoVG9UZXh0SW50cm9kdWN0aW9uJztcblxuLyoqIE9wZW5zIHRoZSBzZXR0aW5ncyBlZGl0b3IsIGZpbHRlcmVkIGJ5IHRoZSBxdWVyeSBiZWxvdy4gKi9cbmNvbnN0IE9QRU5fU0VUVElOR1NfQ09NTUFORCA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5TZXR0aW5ncyc7XG5cbi8qKiBOYXJyb3dzIHNldHRpbmdzIHRvIGRpY3RhdGlvbidzIG93bjogZW5hYmxlZCwgbW9kZWwsIHNob3dUcmFuc2NyaXB0LiAqL1xuY29uc3QgRElDVEFUSU9OX1NFVFRJTkdTX1FVRVJZID0gJ2RpY3RhdGlvbic7XG5cbi8qKiBUaGUgYGRldmljZUlkYCB2YWx1ZSB0aGF0IG1lYW5zIFwid2hhdGV2ZXIgdGhlIHN5c3RlbSBpcyB1c2luZ1wiLiAqL1xuY29uc3QgU1lTVEVNX0RFRkFVTFRfREVWSUNFX0lEID0gJyc7XG5cbnR5cGUgRGljdGF0aW9uTWVkaWFEZXZpY2VzID0gUGljazxNZWRpYURldmljZXMsICdhZGRFdmVudExpc3RlbmVyJyB8ICdyZW1vdmVFdmVudExpc3RlbmVyJyB8ICdkaXNwYXRjaEV2ZW50JyB8ICdlbnVtZXJhdGVEZXZpY2VzJyB8ICdnZXRVc2VyTWVkaWEnPjtcbnR5cGUgU3dpdGNoTWljcm9waG9uZSA9IChkZXZpY2VJZDogc3RyaW5nKSA9PiBQcm9taXNlPEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZD47XG5cbnR5cGUgRGljdGF0aW9uT25ib2FyZGluZ0FjdGlvbiA9ICdzaG93bicgfCAnc2VsZWN0TWljcm9waG9uZScgfCAnb3BlblNldHRpbmdzJyB8ICdvcGVuSW5zdHJ1Y3Rpb25zJyB8ICdjbG9zZScgfCAnZXNjYXBlJztcblxudHlwZSBEaWN0YXRpb25PbmJvYXJkaW5nQWN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWN0aW9uIHRha2VuIGluIHRoZSBEaWN0YXRpb24gb25ib2FyZGluZyBjYXJkLicgfTtcblx0c291cmNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIGNhcmQgYXBwZWFyZWQgYXV0b21hdGljYWxseSBvbiBmaXJzdCB1c2Ugb3Igd2FzIG9wZW5lZCBtYW51YWxseS4nIH07XG5cdG93bmVyOiAnbWVnYW5yb2dnZSc7XG5cdGNvbW1lbnQ6ICdUcmFja3MgZW5nYWdlbWVudCB3aXRoIHRoZSBEaWN0YXRpb24gb25ib2FyZGluZyBjYXJkLic7XG59O1xuXG50eXBlIERpY3RhdGlvbk9uYm9hcmRpbmdBY3Rpb25FdmVudCA9IHtcblx0YWN0aW9uOiBEaWN0YXRpb25PbmJvYXJkaW5nQWN0aW9uO1xuXHRzb3VyY2U6ICdhdXRvbWF0aWMnIHwgJ21hbnVhbCc7XG59O1xuXG4vLyAtLS0gTGV2ZWwgbWV0ZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQmFyIG1ldHJpY3MuIFZvaWNlIE1vZGUncyB3YXZlZm9ybSAtIGJvdGggdGhlIHRvb2xiYXIgcGlsbCBhbmQgaXRzIG93blxuICogaW50cm9kdWN0aW9uIGNhcmQgLSBpcyBhIHJvdyBvZiBoYWlybGluZSBzdHJva2VzIHdpdGggYSBoYWlybGluZSBvZiBhaXJcbiAqIGJlc2lkZSBlYWNoLCBzbyB0aGlzIHVzZXMgdGhlIHNhbWUgaW5zdHJ1bWVudCBhdCBhIGxhcmdlciBzaXplLlxuICovXG5jb25zdCBCQVJfV0lEVEggPSAxO1xuY29uc3QgQkFSX0dBUCA9IDI7XG5cbi8qKiBBbXBsaXR1ZGUgd2l0aCBub3RoaW5nIGJlaW5nIHNhaWQ6IHByZXNlbnQsIGJ1dCBjbGVhcmx5IGF0IHJlc3QuICovXG5jb25zdCBJRExFX0dBSU4gPSAwLjU1O1xuXG4vKiogRXh0cmEgYW1wbGl0dWRlIGF0IHBlYWsgbG91ZG5lc3MuICovXG5jb25zdCBTUEVBS0lOR19HQUlOID0gMC40NTtcblxuLyoqIEhvdyBxdWlja2x5IHRoZSByb3cgY2hhc2VzIHRoZSBtaWNyb3Bob25lLiBMb3cgYW5kIHNsb3cgcmVhZHMgYXMgc21vb3RoOyBhXG4gKiByb3cgdGhhdCB0cmFja3MgZXZlcnkgZnJhbWUgZXhhY3RseSByZWFkcyBhcyBmbGlja2VyIHJhdGhlciB0aGFuIGFzIGxldmVsLiAqL1xuY29uc3QgTEVWRUxfRUFTSU5HID0gMC4xMjtcblxuLyoqIE9wYWNpdHkgb2YgdGhlIHJvdyB3aGVuIG5vdGhpbmcgaXMgYmVpbmcgc2FpZC4gKi9cbmNvbnN0IFJFU1RJTkdfT1BBQ0lUWSA9IDAuMzU7XG5cbi8qKiBFeHRyYSBvcGFjaXR5IGF0IHBlYWsgbG91ZG5lc3MsIHNvIHRoZSByb3cgYnJpZ2h0ZW5zIGFzIHRoZSB1c2VyIHNwZWFrcy4gKi9cbmNvbnN0IFNQRUFLSU5HX09QQUNJVFkgPSAwLjU7XG5cbi8qKlxuICogT3BhY2l0eSB3aGVuIHRoZSBtaWNyb3Bob25lIGNhbm5vdCBiZSByZWFkIGF0IGFsbC4gRGltbWVyIHRoYW4gcmVzdCwgYmVjYXVzZVxuICogYSByb3cgYXQgcmVzdGluZyBzdHJlbmd0aCBpbXBsaWVzIGEgd29ya2luZyBkZXZpY2UgdGhhdCBzaW1wbHkgaXMgbm90IGhlYXJpbmdcbiAqIGFueXRoaW5nIC0gd2hpY2ggaXMgdGhlIG9wcG9zaXRlIG9mIHdoYXQgaXMgdHJ1ZS5cbiAqL1xuY29uc3QgVU5BVkFJTEFCTEVfT1BBQ0lUWSA9IDAuMjtcblxuLyoqXG4gKiBTaG9ydGVzdCBnYXAgYmV0d2VlbiByZXBhaW50cyB3aGVuIHJlZHVjZWQgbW90aW9uIGlzIG9uLiBUaGUgbWV0ZXIgaXNcbiAqIGZlZWRiYWNrLCBub3QgZGVjb3JhdGlvbiAtIHN3aXRjaGluZyBpdCBvZmYgd291bGQgcmVtb3ZlIHRoZSBvbmx5IGFuc3dlciB0aGVcbiAqIGNhcmQgaGFzIHRvIFwiaXMgbXkgbWljcm9waG9uZSB3b3JraW5nXCIgLSBzbyBpdCBpcyBzbG93ZWQgdG8gYSByZWFkYWJsZSBzdGVwXG4gKiByYXRoZXIgdGhhbiBzdG9wcGVkLlxuICovXG5jb25zdCBSRURVQ0VEX01PVElPTl9QQUlOVF9JTlRFUlZBTF9NUyA9IDEwMDtcblxuLyoqXG4gKiBPbmUgc2luZSBjb21wb25lbnQgb2YgdGhlIHdhdmVmb3JtJ3MgdGV4dHVyZS4gVGhlIHRyYWNlIGlzIGEgaGFuZGZ1bCBvZiB0aGVzZVxuICogc3VtbWVkIHRvZ2V0aGVyLCB3aGljaCBpcyB3aGF0IGdpdmVzIGl0IGEgcmVjb2duaXNhYmxlIHJpcHBsZSByYXRoZXIgdGhhbiBhXG4gKiBzaW5nbGUgcHVsc2luZyBjdXJ2ZS5cbiAqL1xuaW50ZXJmYWNlIElXYXZlIHtcblx0cmVhZG9ubHkgZnJlcXVlbmN5OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFtcGxpdHVkZTogbnVtYmVyO1xuXHRyZWFkb25seSBzcGVlZDogbnVtYmVyO1xuXHRyZWFkb25seSBwaGFzZTogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiByZWFkTWljcm9waG9uZUxldmVsKGFuYWx5c2VyOiBBbmFseXNlck5vZGUgfCB1bmRlZmluZWQsIHdhdmVmb3JtOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdGlmICghYW5hbHlzZXIgfHwgIXdhdmVmb3JtKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblx0YW5hbHlzZXIuZ2V0Qnl0ZVRpbWVEb21haW5EYXRhKHdhdmVmb3JtKTtcblx0bGV0IHN1bSA9IDA7XG5cdGZvciAoY29uc3Qgc2FtcGxlIG9mIHdhdmVmb3JtKSB7XG5cdFx0Y29uc3QgY2VudGVyZWQgPSAoc2FtcGxlIC0gMTI4KSAvIDEyODtcblx0XHRzdW0gKz0gY2VudGVyZWQgKiBjZW50ZXJlZDtcblx0fVxuXHRyZXR1cm4gTWF0aC5taW4oMSwgTWF0aC5zcXJ0KHN1bSAvIHdhdmVmb3JtLmxlbmd0aCkgKiA0KTtcbn1cblxuLyoqXG4gKiBUaGUgd2F2ZWZvcm0ncyB0ZXh0dXJlLiBNaXJyb3JzIHRoZSBzaWduYXR1cmVzIFZvaWNlIE1vZGUncyBpbnRyb2R1Y3Rpb24gdXNlcyxcbiAqIHNvIHRoZSB0d28gY2FyZHMgcmVhZCBhcyB0aGUgc2FtZSBpbnN0cnVtZW50IHJhdGhlciB0aGFuIGFzIHR3byBmZWF0dXJlcyB0aGF0XG4gKiBoYXBwZW4gdG8gYm90aCBkcmF3IGJhcnMuXG4gKi9cbmNvbnN0IFdBVkVTOiByZWFkb25seSBJV2F2ZVtdID0gW1xuXHR7IGZyZXF1ZW5jeTogMS4wLCBhbXBsaXR1ZGU6IDAuNDIsIHNwZWVkOiAwLjQyLCBwaGFzZTogMC4wIH0sXG5cdHsgZnJlcXVlbmN5OiAxLjcsIGFtcGxpdHVkZTogMC4yNiwgc3BlZWQ6IC0wLjMxLCBwaGFzZTogMS4xIH0sXG5cdHsgZnJlcXVlbmN5OiAyLjYsIGFtcGxpdHVkZTogMC4xOSwgc3BlZWQ6IDAuMjQsIHBoYXNlOiAyLjQgfSxcblx0eyBmcmVxdWVuY3k6IDQuMSwgYW1wbGl0dWRlOiAwLjEzLCBzcGVlZDogLTAuMTgsIHBoYXNlOiAwLjcgfSxcbl07XG5cbi8qKlxuICogSGFsZi1oZWlnaHQgb2YgdGhlIHJvdyBhdCBgcG9zaXRpb25gICgwLi4xIGFjcm9zcyB0aGUgc3RyaXApLCBhcyBhIGZyYWN0aW9uIG9mXG4gKiB0aGUgYXZhaWxhYmxlIGhhbGYtaGVpZ2h0LlxuICpcbiAqIEVhY2ggY29tcG9uZW50IGNvbnRyaWJ1dGVzIGFuIGFscmVhZHktcG9zaXRpdmUsIGN1c3AtZnJlZSBjdXJ2ZS4gU3VtbWluZyByYXdcbiAqIHNpbmVzIGFuZCB0YWtpbmcgdGhlaXIgbWFnbml0dWRlIHdvdWxkIHB1dCBhIHNoYXJwIGNvcm5lciBhdCBldmVyeSB6ZXJvXG4gKiBjcm9zc2luZyAtIHRoYXQgaXMgd2hhdCBtYWtlcyBhIHdhdmVmb3JtIGxvb2sgbGlrZSBpdCBpcyBzbmFwcGluZyB1cCBhbmQgZG93blxuICogcmF0aGVyIHRoYW4gZmxvd2luZy5cbiAqL1xuZnVuY3Rpb24gYmFuZEZyYWN0aW9uKHBvc2l0aW9uOiBudW1iZXIsIHRpbWU6IG51bWJlcik6IG51bWJlciB7XG5cdGxldCBhbXBsaXR1ZGUgPSAwO1xuXHRsZXQgdG90YWwgPSAwO1xuXHRmb3IgKGNvbnN0IHdhdmUgb2YgV0FWRVMpIHtcblx0XHRjb25zdCBwaGFzZSA9IHBvc2l0aW9uICogd2F2ZS5mcmVxdWVuY3kgKiBNYXRoLlBJICogMiArIHRpbWUgKiB3YXZlLnNwZWVkICsgd2F2ZS5waGFzZTtcblx0XHRhbXBsaXR1ZGUgKz0gKDAuNSArIDAuNSAqIE1hdGguc2luKHBoYXNlKSkgKiB3YXZlLmFtcGxpdHVkZTtcblx0XHR0b3RhbCArPSB3YXZlLmFtcGxpdHVkZTtcblx0fVxuXHRpZiAodG90YWwgPT09IDApIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXHQvLyBDZW50cmUtcGVhayBzaWxob3VldHRlLCBtYXRjaGluZyB0aGUgdG9vbGJhciB3YXZlZm9ybTogdGFsbGVzdCBpbiB0aGVcblx0Ly8gbWlkZGxlLCB0YXBlcmluZyB0byB0aGUgZW5kcywgc28gdGhlIHJvdyByZWFkcyBhcyBvbmUgaW5zdHJ1bWVudCByYXRoZXJcblx0Ly8gdGhhbiBhIHN0cmlwIGN1dCBvZmYgYXQgYm90aCBlZGdlcy5cblx0Y29uc3QgdGFwZXIgPSBNYXRoLnNpbihNYXRoLlBJICogTWF0aC5taW4oMSwgTWF0aC5tYXgoMCwgcG9zaXRpb24pKSk7XG5cdHJldHVybiAoYW1wbGl0dWRlIC8gdG90YWwpICogKDAuMzUgKyAwLjY1ICogdGFwZXIpO1xufVxuXG4vKiogV2h5IHRoZSBtaWNyb3Bob25lIHByZXZpZXcgaXMgbm90IHNob3dpbmcgYSBsZXZlbC4gKi9cbmNvbnN0IGVudW0gTWljcm9waG9uZVByZXZpZXdFcnJvciB7XG5cdC8qKiBUaGUgdXNlciAob3IgdGhlIE9TKSByZWZ1c2VkIGFjY2VzcyB0byB0aGUgbWljcm9waG9uZS4gKi9cblx0RGVuaWVkID0gJ2RlbmllZCcsXG5cdC8qKiBUaGVyZSBpcyBubyBtaWNyb3Bob25lIHRvIGxpc3RlbiB0by4gKi9cblx0Tm9EZXZpY2UgPSAnbm9EZXZpY2UnLFxuXHQvKiogQW55dGhpbmcgZWxzZSwgaW5jbHVkaW5nIGEgYnJvd3NlciB3aXRob3V0IGBnZXRVc2VyTWVkaWFgLiAqL1xuXHRVbmF2YWlsYWJsZSA9ICd1bmF2YWlsYWJsZScsXG59XG5cbi8qKlxuICogTGlzdGVucyB0byBhIG1pY3JvcGhvbmUgcHVyZWx5IHNvIGl0cyBsb3VkbmVzcyBjYW4gYmUgc2hvd24uIE93bnMgdGhlIG1lZGlhXG4gKiBzdHJlYW0sIHRoZSBhdWRpbyBncmFwaCBhbmQgbm90aGluZyBlbHNlOyByZWxlYXNpbmcgaXQgZnJlZXMgdGhlIG1pY3JvcGhvbmUuXG4gKlxuICogVGhpcyBpcyBkZWxpYmVyYXRlbHkgaW5kZXBlbmRlbnQgb2YgdGhlIGRpY3RhdGlvbiBwaXBlbGluZSBzbyB0aGUgY2FyZCBjYW5cbiAqIHJlbWFpbiBpbmZvcm1hdGlvbmFsIHdoaWxlIHJlY29yZGluZyBzdGFydHMgaW1tZWRpYXRlbHkuXG4gKi9cbmNsYXNzIE1pY3JvcGhvbmVQcmV2aWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cblx0cHJpdmF0ZSBhbmFseXNlcjogQW5hbHlzZXJOb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHdhdmVmb3JtOiBVaW50OEFycmF5PEFycmF5QnVmZmVyPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVycm9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8TWljcm9waG9uZVByZXZpZXdFcnJvciB8IHVuZGVmaW5lZD4oKSk7XG5cdC8qKiBGaXJlcyB3aXRoIHRoZSByZWFzb24gbm8gbGV2ZWwgaXMgYXZhaWxhYmxlLCBvciBgdW5kZWZpbmVkYCBvbmNlIG9uZSBpcy4gKi9cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFcnJvciA9IHRoaXMuX29uRGlkQ2hhbmdlRXJyb3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZXJyb3I6IE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IgfCB1bmRlZmluZWQ7XG5cdGdldCBlcnJvcigpOiBNaWNyb3Bob25lUHJldmlld0Vycm9yIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2Vycm9yOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lZGlhRGV2aWNlczogRGljdGF0aW9uTWVkaWFEZXZpY2VzIHwgdW5kZWZpbmVkLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEN1cnJlbnQgbG91ZG5lc3MsIGAwLi4xYCwgb3IgYDBgIHdoZW4gbm90aGluZyBpcyBiZWluZyBoZWFyZC4gUmVhZCBldmVyeVxuXHQgKiBmcmFtZSwgc28gaXQgc3RheXMgYWxsb2NhdGlvbi1mcmVlLlxuXHQgKi9cblx0Z2V0TGV2ZWwoKTogbnVtYmVyIHtcblx0XHQvLyBSTVMsIHNjYWxlZCBzbyBvcmRpbmFyeSBzcGVlY2ggZmlsbHMgbW9zdCBvZiB0aGUgcm93IHJhdGhlciB0aGFuIGFcblx0XHQvLyBzbGl2ZXIgb2YgaXQuXG5cdFx0cmV0dXJuIHJlYWRNaWNyb3Bob25lTGV2ZWwodGhpcy5hbmFseXNlciwgdGhpcy53YXZlZm9ybSk7XG5cdH1cblxuXHQvKipcblx0ICogTGlzdGVuIHRvIGBkZXZpY2VJZGAgKGVtcHR5IG1lYW5zIHRoZSBzeXN0ZW0gZGVmYXVsdCkuIFJlcGxhY2VzIGFueSBzdHJlYW1cblx0ICogYWxyZWFkeSBydW5uaW5nLCBzbyBzd2l0Y2hpbmcgZGV2aWNlcyBuZXZlciBsZWF2ZXMgdHdvIG1pY3JvcGhvbmVzIG9wZW4uXG5cdCAqL1xuXHRhc3luYyBsaXN0ZW4oZGV2aWNlSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5yZWxlYXNlTWljcm9waG9uZSgpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLmVsZW1lbnQpO1xuXHRcdGlmICghdGhpcy5tZWRpYURldmljZXM/LmdldFVzZXJNZWRpYSkge1xuXHRcdFx0dGhpcy5zZXRFcnJvcihNaWNyb3Bob25lUHJldmlld0Vycm9yLlVuYXZhaWxhYmxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25zdHJhaW50czogTWVkaWFUcmFja0NvbnN0cmFpbnRzID0geyBjaGFubmVsQ291bnQ6IDEsIGVjaG9DYW5jZWxsYXRpb246IHRydWUsIG5vaXNlU3VwcHJlc3Npb246IHRydWUgfTtcblx0XHRpZiAoZGV2aWNlSWQpIHtcblx0XHRcdGNvbnN0cmFpbnRzLmRldmljZUlkID0geyBleGFjdDogZGV2aWNlSWQgfTtcblx0XHR9XG5cblx0XHRsZXQgc3RyZWFtOiBNZWRpYVN0cmVhbTtcblx0XHR0cnkge1xuXHRcdFx0c3RyZWFtID0gYXdhaXQgdGhpcy5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKHsgYXVkaW86IGNvbnN0cmFpbnRzIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLnNldEVycm9yKHRvUHJldmlld0Vycm9yKGVycm9yKSk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtjaGF0LXN0dF0gbWljcm9waG9uZSBwcmV2aWV3IHVuYXZhaWxhYmxlOiAke2Vycm9yfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc3RyZWFtLmdldFRyYWNrcygpLmZvckVhY2godHJhY2sgPT4gdHJhY2suc3RvcCgpKSkpO1xuXG5cdFx0bGV0IGFuYWx5c2VyOiBBbmFseXNlck5vZGU7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRleHQgPSBuZXcgdGFyZ2V0V2luZG93LkF1ZGlvQ29udGV4dCgpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB2b2lkIGNvbnRleHQuY2xvc2UoKS5jYXRjaCgoKSA9PiB7IC8qIGFscmVhZHkgY2xvc2luZyAqLyB9KSkpO1xuXHRcdFx0Ly8gQ2hyb21pdW0gc3RhcnRzIGFuIGBBdWRpb0NvbnRleHRgIHN1c3BlbmRlZCB3aGVuIHRoZSBwYWdlIGhhcyBub1xuXHRcdFx0Ly8gc3RpY2t5IHVzZXIgYWN0aXZhdGlvbiwgYW5kIGEgc3VzcGVuZGVkIGdyYXBoIHJlcG9ydHMgc2lsZW5jZSAtIGFcblx0XHRcdC8vIGRlYWQgbWV0ZXIgdGhhdCBsb29rcyBleGFjdGx5IGxpa2UgYSBkZWFkIG1pY3JvcGhvbmUuXG5cdFx0XHRpZiAoY29udGV4dC5zdGF0ZSA9PT0gJ3N1c3BlbmRlZCcpIHtcblx0XHRcdFx0YXdhaXQgY29udGV4dC5yZXN1bWUoKTtcblx0XHRcdH1cblx0XHRcdGFuYWx5c2VyID0gY29udGV4dC5jcmVhdGVBbmFseXNlcigpO1xuXHRcdFx0Ly8gVGltZS1kb21haW4gb25seTogdGhlIHJvdydzIHNoYXBlIGNvbWVzIGZyb20gdGhlIHRyYXZlbGxpbmcgd2F2ZSxcblx0XHRcdC8vIGFuZCBhbGwgdGhlIGFuYWx5c2VyIGhhcyB0byBzdXBwbHkgaXMgaG93IGxvdWQgdGhlIHJvb20gaXMuXG5cdFx0XHRhbmFseXNlci5mZnRTaXplID0gMjU2O1xuXHRcdFx0Y29udGV4dC5jcmVhdGVNZWRpYVN0cmVhbVNvdXJjZShzdHJlYW0pLmNvbm5lY3QoYW5hbHlzZXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnNldEVycm9yKE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IuVW5hdmFpbGFibGUpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbY2hhdC1zdHRdIG1pY3JvcGhvbmUgcHJldmlldyBhbmFseXNlciB1bmF2YWlsYWJsZTogJHtlcnJvcn1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgY2FyZCBjYW4gYmUgZGlzbWlzc2VkIHdoaWxlIGBnZXRVc2VyTWVkaWFgIGlzIHN0aWxsIHJlc29sdmluZzsgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBpcyBhbHJlYWR5IGNsZWFyZWQgaW4gdGhhdCBjYXNlLCBzbyBhc3NpZ25pbmcgaGVyZSB3b3VsZCBsZWFrIGFcblx0XHQvLyBsaXZlIG1pY3JvcGhvbmUuXG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNlc3Npb24udmFsdWUgPSBzdG9yZTtcblx0XHR0aGlzLmFuYWx5c2VyID0gYW5hbHlzZXI7XG5cdFx0dGhpcy53YXZlZm9ybSA9IG5ldyBVaW50OEFycmF5KGFuYWx5c2VyLmZmdFNpemUpO1xuXHRcdHRoaXMuc2V0RXJyb3IodW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kIHRoZSBtaWNyb3Bob25lIGJhY2suIENhbGxlZCBiZWZvcmUgZGljdGF0aW9uIGFjcXVpcmVzIGl0cyBvd24gc3RyZWFtOlxuXHQgKiB0d28gY2FwdHVyZXMgb2Ygb25lIGRldmljZSBpcyB3aGF0IG1ha2VzIHRoZSBhdWRpbyBzZXJ2aWNlIGRyb3AgdGhlXG5cdCAqIGNhcHR1cmUsIHNvIHRoZSBwcmV2aWV3IGFsd2F5cyBsZXRzIGdvIGZpcnN0LlxuXHQgKi9cblx0cmVsZWFzZU1pY3JvcGhvbmUoKTogdm9pZCB7XG5cdFx0dGhpcy5hbmFseXNlciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLndhdmVmb3JtID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc2Vzc2lvbi5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRFcnJvcihlcnJvcjogTWljcm9waG9uZVByZXZpZXdFcnJvciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9lcnJvciA9PT0gZXJyb3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZXJyb3IgPSBlcnJvcjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUVycm9yLmZpcmUoZXJyb3IpO1xuXHR9XG59XG5cbi8qKiBNYXAgYSBgZ2V0VXNlck1lZGlhYCByZWplY3Rpb24gb250byB0aGUgcmVhc29uIHNob3duIGluIHRoZSBjYXJkLiAqL1xuZnVuY3Rpb24gdG9QcmV2aWV3RXJyb3IoZXJyb3I6IHVua25vd24pOiBNaWNyb3Bob25lUHJldmlld0Vycm9yIHtcblx0aWYgKGVycm9yIGluc3RhbmNlb2YgRE9NRXhjZXB0aW9uKSB7XG5cdFx0aWYgKGVycm9yLm5hbWUgPT09ICdOb3RBbGxvd2VkRXJyb3InIHx8IGVycm9yLm5hbWUgPT09ICdTZWN1cml0eUVycm9yJykge1xuXHRcdFx0cmV0dXJuIE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IuRGVuaWVkO1xuXHRcdH1cblx0XHRpZiAoZXJyb3IubmFtZSA9PT0gJ05vdEZvdW5kRXJyb3InIHx8IGVycm9yLm5hbWUgPT09ICdPdmVyY29uc3RyYWluZWRFcnJvcicpIHtcblx0XHRcdHJldHVybiBNaWNyb3Bob25lUHJldmlld0Vycm9yLk5vRGV2aWNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gTWljcm9waG9uZVByZXZpZXdFcnJvci5VbmF2YWlsYWJsZTtcbn1cblxuLyoqIFdoYXQgdGhlIHdhdmVmb3JtIG5lZWRzIGVhY2ggZnJhbWUsIHN1cHBsaWVkIGJ5IHRoZSBwcmV2aWV3LiAqL1xuaW50ZXJmYWNlIElXYXZlZm9ybVNvdXJjZSB7XG5cdC8qKiBMb3VkbmVzcyBvZiB0aGUgcm9vbSwgYDBgIHdoZW4gbm90aGluZyBpcyBiZWluZyBoZWFyZC4gKi9cblx0Z2V0TGV2ZWwoKTogbnVtYmVyO1xuXHQvKiogYGZhbHNlYCB3aGVuIHRoZSBtaWNyb3Bob25lIGNhbm5vdCBiZSByZWFkIGF0IGFsbC4gKi9cblx0aXNBdmFpbGFibGUoKTogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBUaGUgbGl2ZSB3YXZlZm9ybTogYSByb3cgb2YgaGFpcmxpbmUgc3Ryb2tlcyB3aG9zZSBzaGFwZSBmbG93cyBhbmQgd2hvc2VcbiAqIGhlaWdodCBmb2xsb3dzIHRoZSBtaWNyb3Bob25lLiBUaGUgY2FyZCdzIHdob2xlIGpvYiBpcyB0byBhbnN3ZXIgXCJpcyB0aGlzXG4gKiBkZXZpY2UgaGVhcmluZyBtZVwiLCBhbmQgYSB0cmFjZSB0aGF0IHN3ZWxscyB3aGVuIHlvdSBzcGVhayBhbnN3ZXJzIGl0IGJlZm9yZVxuICogYW55IHdvcmRzIGFyZSByZWFkLlxuICpcbiAqIERlbGliZXJhdGVseSBub3QgYSBzcGVjdHJ1bSBhbmFseXNlci4gUGVyLWJhbmQgYmFycyBtYWtlIG5laWdoYm91cnMganVtcFxuICogaW5kZXBlbmRlbnRseSwgd2hpY2ggcmVhZHMgYXMgYSBjaGFydDsgdGhlIHNoYXBlIGhlcmUgaXMgb25lIGNvbnRpbnVvdXNcbiAqIHRyYXZlbGxpbmcgd2F2ZSAtIHRoZSBzYW1lIGluc3RydW1lbnQgVm9pY2UgTW9kZSB1c2VzIC0gc28gdGhlIHJvdyBtb3ZlcyBsaWtlXG4gKiBhIHZvaWNlLlxuICovXG5jbGFzcyBNaWNyb3Bob25lV2F2ZWZvcm0gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGJhcnM6IEhUTUxFbGVtZW50W10gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBhbmltYXRpb25GcmFtZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cblx0cHJpdmF0ZSBydW5uaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgbGFzdFBhaW50ID0gMDtcblx0cHJpdmF0ZSBsZXZlbCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc291cmNlOiBJV2F2ZWZvcm1Tb3VyY2UsXG5cdFx0b2JzZXJ2ZXJDdG9yOiB0eXBlb2YgUmVzaXplT2JzZXJ2ZXIgfCB1bmRlZmluZWQsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cblx0XHQvLyBUaGUgYmFyIGNvdW50IGZvbGxvd3MgdGhlIG1lYXN1cmVkIHdpZHRoIHJhdGhlciB0aGFuIGJlaW5nIGZpeGVkOiBhdCBhXG5cdFx0Ly8gZml4ZWQgY291bnQgdGhlIGdhcHMgc3RyZXRjaCBvciBjcm93ZCBhcyB0aGUgcGFuZWwgcmVzaXplcywgYW5kIHRoZVxuXHRcdC8vIDFweC8ycHggcmh5dGhtIHRoZSBpbnN0cnVtZW50IGlzIGJ1aWx0IG9uIGlzIHRoZSBmaXJzdCB0aGluZyBsb3N0LlxuXHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IChvYnNlcnZlckN0b3IgPz8gZG9tLmdldFdpbmRvdyhjb250YWluZXIpLlJlc2l6ZU9ic2VydmVyKSgoKSA9PiB0aGlzLmxheW91dCgpKTtcblx0XHRvYnNlcnZlci5vYnNlcnZlKGNvbnRhaW5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXG5cdFx0dGhpcy5sYXlvdXQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5zdG9wKCkpKTtcblx0fVxuXG5cdC8qKiBSZWJ1aWxkIHRoZSByb3cgZm9yIHRoZSBjdXJyZW50IHdpZHRoLCBpZiB0aGUgY291bnQgYWN0dWFsbHkgY2hhbmdlZC4gKi9cblx0cHJpdmF0ZSBsYXlvdXQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkdGggPSB0aGlzLmNvbnRhaW5lci5jbGllbnRXaWR0aDtcblx0XHRpZiAoIXdpZHRoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvdW50ID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcigod2lkdGggKyBCQVJfR0FQKSAvIChCQVJfV0lEVEggKyBCQVJfR0FQKSkpO1xuXHRcdGlmIChjb3VudCA9PT0gdGhpcy5iYXJzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLmJhcnMgPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGNvdW50OyBpKyspIHtcblx0XHRcdHRoaXMuYmFycy5wdXNoKGRvbS5hcHBlbmQodGhpcy5jb250YWluZXIsIGRvbS4kKCdzcGFuLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWJhcicpKSk7XG5cdFx0fVxuXHR9XG5cblx0c3RhcnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMucnVubmluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJ1bm5pbmcgPSB0cnVlO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5jb250YWluZXIpO1xuXHRcdGNvbnN0IHRpY2sgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMucnVubmluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZSh0YXJnZXRXaW5kb3cucGVyZm9ybWFuY2Uubm93KCkpO1xuXHRcdFx0dGhpcy5hbmltYXRpb25GcmFtZS52YWx1ZSA9IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKHRhcmdldFdpbmRvdywgdGljayk7XG5cdFx0fTtcblx0XHR0aGlzLmFuaW1hdGlvbkZyYW1lLnZhbHVlID0gZG9tLnNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUodGFyZ2V0V2luZG93LCB0aWNrKTtcblx0fVxuXG5cdHN0b3AoKTogdm9pZCB7XG5cdFx0dGhpcy5ydW5uaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5hbmltYXRpb25GcmFtZS5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGUodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBpbnRlcnZhbCA9IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCkgPyBSRURVQ0VEX01PVElPTl9QQUlOVF9JTlRFUlZBTF9NUyA6IDA7XG5cdFx0aWYgKHRpbWVzdGFtcCAtIHRoaXMubGFzdFBhaW50IDwgaW50ZXJ2YWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sYXN0UGFpbnQgPSB0aW1lc3RhbXA7XG5cblx0XHQvLyBFYXNlIHRvd2FyZHMgdGhlIG1pY3JvcGhvbmUgcmF0aGVyIHRoYW4gdHJhY2tpbmcgaXQgZXhhY3RseTogdGhlIGxldmVsXG5cdFx0Ly8gaXMgd2hhdCB0aGUgcm93ICptZWFucyosIGFuZCBhIHZhbHVlIHRoYXQganVtcHMgZXZlcnkgZnJhbWUgcmVhZHMgYXNcblx0XHQvLyBmbGlja2VyIGluc3RlYWQgb2YgYXMgbG91ZG5lc3MuXG5cdFx0dGhpcy5sZXZlbCArPSAodGhpcy5zb3VyY2UuZ2V0TGV2ZWwoKSAtIHRoaXMubGV2ZWwpICogTEVWRUxfRUFTSU5HO1xuXHRcdGNvbnN0IGdhaW4gPSBJRExFX0dBSU4gKyB0aGlzLmxldmVsICogU1BFQUtJTkdfR0FJTjtcblx0XHRjb25zdCB0aW1lID0gdGltZXN0YW1wICogMC4wMDE7XG5cblx0XHQvLyBCcmlnaHRuZXNzIHJpZGVzIHRoZSBzYW1lIGxldmVsIGFzIHRoZSBoZWlnaHQsIHNvIHRoZSByb3cgaXMgcXVpZXQgYXRcblx0XHQvLyByZXN0IGFuZCBsaWZ0cyBhcyB0aGUgdXNlciBzcGVha3MgLSBhbmQgZHJvcHMgYmVsb3cgcmVzdCBlbnRpcmVseSB3aGVuXG5cdFx0Ly8gdGhlcmUgaXMgbm8gbWljcm9waG9uZSB0byBoZWFyLiBTZXQgb24gdGhlIGNvbnRhaW5lcjogb25lIHN0eWxlIHdyaXRlXG5cdFx0Ly8gcGVyIGZyYW1lIHJhdGhlciB0aGFuIG9uZSBwZXIgc3Ryb2tlLlxuXHRcdHRoaXMuY29udGFpbmVyLnN0eWxlLm9wYWNpdHkgPSAodGhpcy5zb3VyY2UuaXNBdmFpbGFibGUoKVxuXHRcdFx0PyBSRVNUSU5HX09QQUNJVFkgKyB0aGlzLmxldmVsICogU1BFQUtJTkdfT1BBQ0lUWVxuXHRcdFx0OiBVTkFWQUlMQUJMRV9PUEFDSVRZKS50b0ZpeGVkKDMpO1xuXG5cdFx0Y29uc3QgY291bnQgPSB0aGlzLmJhcnMubGVuZ3RoO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY291bnQ7IGkrKykge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBjb3VudCA+IDEgPyBpIC8gKGNvdW50IC0gMSkgOiAwO1xuXHRcdFx0Ly8gU2NhbGVkIHJhdGhlciB0aGFuIHJlc2l6ZWQ6IHRyYW5zZm9ybSBzdGF5cyBvZmYgdGhlIGxheW91dCBwYXRoLCBzb1xuXHRcdFx0Ly8gYSByb3cgb2YgaGFpcmxpbmVzIGF0IDYwZnBzIG5ldmVyIHJlZmxvd3MgdGhlIGNoYXQgaW5wdXQuIFRoZSBmbG9vclxuXHRcdFx0Ly8gbGVhdmVzIGEgdGhpbiBsaW5lIHJhdGhlciB0aGFuIG5vdGhpbmcsIHNvIGEgc2lsZW50IG1pY3JvcGhvbmVcblx0XHRcdC8vIHN0aWxsIHJlYWRzIGFzIHByZXNlbnQuXG5cdFx0XHRjb25zdCBhbW91bnQgPSBNYXRoLm1heCgwLjA4LCBNYXRoLm1pbigxLCBiYW5kRnJhY3Rpb24ocG9zaXRpb24sIHRpbWUpICogZ2FpbikpO1xuXHRcdFx0dGhpcy5iYXJzW2ldLnN0eWxlLnRyYW5zZm9ybSA9IGBzY2FsZVkoJHthbW91bnQudG9GaXhlZCgzKX0pYDtcblx0XHR9XG5cdH1cbn1cblxuLy8gLS0tIE1pY3JvcGhvbmUgb3B0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogT25lIGVudHJ5IGluIHRoZSBjYXJkJ3MgbWljcm9waG9uZSBwaWNrZXIuICovXG5leHBvcnQgaW50ZXJmYWNlIElNaWNyb3Bob25lT3B0aW9uIHtcblx0cmVhZG9ubHkgZGV2aWNlSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcbn1cblxuLyoqXG4gKiBUaGUgcGlja2FibGUgbWljcm9waG9uZXMsIHdpdGggdGhlIHBoeXNpY2FsIHN5c3RlbS1kZWZhdWx0IGRldmljZSBpZGVudGlmaWVkXG4gKiBpbiBpdHMgbGFiZWwgaW5zdGVhZCBvZiByZXByZXNlbnRlZCBieSBhIHNlcGFyYXRlIHN5bnRoZXRpYyByb3cuXG4gKlxuICogRHJvcHMgdGhlIHZpcnR1YWwgYGRlZmF1bHRgL2Bjb21tdW5pY2F0aW9uc2AgZW50cmllcyAod2hpY2ggZHVwbGljYXRlIGEgcmVhbFxuICogZGV2aWNlIHVuZGVyIGEgc3ludGhldGljIGlkKSBhbmQgZGUtZHVwbGljYXRlcyBieSBgZGV2aWNlSWRgLCBzbyBvbmUgcGh5c2ljYWxcbiAqIG1pY3JvcGhvbmUgYXBwZWFycyBleGFjdGx5IG9uY2UgLSB0aGUgc2FtZSBub3JtYWxpemF0aW9uIHRoZSBcIlNlbGVjdFxuICogTWljcm9waG9uZVwiIHF1aWNrIHBpY2sgZG9lcywga2VwdCBpbiBvbmUgcGxhY2Ugc28gdGhlIHR3byBuZXZlciBkaXNhZ3JlZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWljcm9waG9uZU9wdGlvbnMoZGV2aWNlczogcmVhZG9ubHkgTWVkaWFEZXZpY2VJbmZvW10pOiBJTWljcm9waG9uZU9wdGlvbltdIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBtaWNyb3Bob25lczogTWVkaWFEZXZpY2VJbmZvW10gPSBbXTtcblx0Zm9yIChjb25zdCBkZXZpY2Ugb2YgZGV2aWNlcykge1xuXHRcdGlmIChkZXZpY2Uua2luZCAhPT0gJ2F1ZGlvaW5wdXQnIHx8IGRldmljZS5kZXZpY2VJZCA9PT0gJ2RlZmF1bHQnIHx8IGRldmljZS5kZXZpY2VJZCA9PT0gJ2NvbW11bmljYXRpb25zJykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGlmIChzZWVuLmhhcyhkZXZpY2UuZGV2aWNlSWQpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c2Vlbi5hZGQoZGV2aWNlLmRldmljZUlkKTtcblx0XHRtaWNyb3Bob25lcy5wdXNoKGRldmljZSk7XG5cdH1cblxuXHRpZiAobWljcm9waG9uZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHRkZXZpY2VJZDogU1lTVEVNX0RFRkFVTFRfREVWSUNFX0lELFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5zeXN0ZW1EZWZhdWx0JywgXCJTeXN0ZW0gZGVmYXVsdFwiKSxcblx0XHR9XTtcblx0fVxuXG5cdGNvbnN0IGRlZmF1bHREZXZpY2UgPSBkZXZpY2VzLmZpbmQoZGV2aWNlID0+IGRldmljZS5raW5kID09PSAnYXVkaW9pbnB1dCcgJiYgZGV2aWNlLmRldmljZUlkID09PSAnZGVmYXVsdCcpO1xuXHRjb25zdCBkZWZhdWx0TGFiZWwgPSBkZWZhdWx0RGV2aWNlPy5sYWJlbC5yZXBsYWNlKC9eKD86ZGVmYXVsdHxzeXN0ZW0gZGVmYXVsdClcXHMqLVxccyovaSwgJycpLnRyaW0oKTtcblx0Y29uc3QgZGVmYXVsdE1pY3JvcGhvbmUgPSBkZWZhdWx0RGV2aWNlXG5cdFx0PyBtaWNyb3Bob25lcy5maW5kKGRldmljZSA9PlxuXHRcdFx0KGRlZmF1bHREZXZpY2UuZ3JvdXBJZCAmJiBkZXZpY2UuZ3JvdXBJZCA9PT0gZGVmYXVsdERldmljZS5ncm91cElkKVxuXHRcdFx0fHwgKGRlZmF1bHRMYWJlbCAmJiBkZXZpY2UubGFiZWwgPT09IGRlZmF1bHRMYWJlbClcblx0XHQpID8/IG1pY3JvcGhvbmVzWzBdXG5cdFx0OiB1bmRlZmluZWQ7XG5cblx0Y29uc3Qgb3B0aW9uczogSU1pY3JvcGhvbmVPcHRpb25bXSA9IFtdO1xuXHRpZiAoZGVmYXVsdERldmljZSkge1xuXHRcdGNvbnN0IGxhYmVsID0gZGVmYXVsdE1pY3JvcGhvbmU/LmxhYmVsIHx8IGRlZmF1bHRMYWJlbDtcblx0XHRvcHRpb25zLnB1c2goe1xuXHRcdFx0ZGV2aWNlSWQ6IFNZU1RFTV9ERUZBVUxUX0RFVklDRV9JRCxcblx0XHRcdGxhYmVsOiBsYWJlbFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5kZWZhdWx0RGV2aWNlJywgXCJ7MH0gKFN5c3RlbSBkZWZhdWx0KVwiLCBsYWJlbClcblx0XHRcdFx0OiBsb2NhbGl6ZSgnZGljdGF0aW9uLm9uYm9hcmRpbmcuc3lzdGVtRGVmYXVsdCcsIFwiU3lzdGVtIGRlZmF1bHRcIiksXG5cdFx0fSk7XG5cdH1cblxuXHRmb3IgKGNvbnN0IGRldmljZSBvZiBtaWNyb3Bob25lcykge1xuXHRcdGlmIChkZXZpY2UgPT09IGRlZmF1bHRNaWNyb3Bob25lKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0b3B0aW9ucy5wdXNoKHtcblx0XHRcdGRldmljZUlkOiBkZXZpY2UuZGV2aWNlSWQsXG5cdFx0XHQvLyBMYWJlbHMgYXJlIGVtcHR5IHVudGlsIG1pY3JvcGhvbmUgcGVybWlzc2lvbiBoYXMgYmVlbiBncmFudGVkIGF0XG5cdFx0XHQvLyBsZWFzdCBvbmNlOyBhIHRydW5jYXRlZCBpZCBpcyBzdGlsbCBiZXR0ZXIgdGhhbiBhIGJsYW5rIHJvdy5cblx0XHRcdGxhYmVsOiBkZXZpY2UubGFiZWwgfHwgbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLnVua25vd25EZXZpY2UnLCBcIlVua25vd24gZGV2aWNlICh7MH0pXCIsIGRldmljZS5kZXZpY2VJZC5zbGljZSgwLCA4KSksXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIG9wdGlvbnM7XG59XG5cbi8qKlxuICogSW5kZXggb2YgdGhlIG1pY3JvcGhvbmUgY3VycmVudGx5IGluIHVzZS4gRmFsbHMgYmFjayB0byB0aGUgc3lzdGVtIGRlZmF1bHRcbiAqIHdoZW4gdGhlIHJlbWVtYmVyZWQgZGV2aWNlIGhhcyBiZWVuIHVucGx1Z2dlZCwgd2hpY2ggaXMgZXhhY3RseSB3aGF0IGRpY3RhdGlvblxuICogaXRzZWxmIGRvZXMgd2hlbiBpdCBhY3F1aXJlcyB0aGUgc3RyZWFtLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaW5kZXhPZk1pY3JvcGhvbmUob3B0aW9uczogcmVhZG9ubHkgSU1pY3JvcGhvbmVPcHRpb25bXSwgZGV2aWNlSWQ6IHN0cmluZyk6IG51bWJlciB7XG5cdGNvbnN0IGluZGV4ID0gb3B0aW9ucy5maW5kSW5kZXgob3B0aW9uID0+IG9wdGlvbi5kZXZpY2VJZCA9PT0gZGV2aWNlSWQpO1xuXHRyZXR1cm4gaW5kZXggPT09IC0xID8gMCA6IGluZGV4O1xufVxuXG4vLyAtLS0gQmFubmVyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpY3RhdGlvbk9uYm9hcmRpbmdCYW5uZXJPcHRpb25zIHtcblx0LyoqIFRoZSBlbGVtZW50IHRoZSBjYXJkIGF0dGFjaGVzIGl0c2VsZiB0by4gKi9cblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgb25EaXNtaXNzOiAoKSA9PiB2b2lkO1xuXHQvKiogV2hldGhlciB0aGlzIG1hbnVhbGx5IG9wZW5lZCBjYXJkIHNob3VsZCBhbHNvIGFjcXVpcmUgYSBtaWNyb3Bob25lIHByZXZpZXcuICovXG5cdHJlYWRvbmx5IHByZXZpZXdNaWNyb3Bob25lOiBib29sZWFuO1xuXHRyZWFkb25seSBzb3VyY2U6ICdhdXRvbWF0aWMnIHwgJ21hbnVhbCc7XG59XG5cbi8qKlxuICogVGhlIGZpcnN0LXJ1biBkaWN0YXRpb24gY2FyZCBleHBsYWlucyB0aGUgZmVhdHVyZSBhbmQgb2ZmZXJzIG1pY3JvcGhvbmVcbiAqIHNlbGVjdGlvbiB3aGlsZSByZWNvcmRpbmcgc3RhcnRzLiBXaGVuIHJlb3BlbmVkIG1hbnVhbGx5LCBpdCBhbHNvIHByZXZpZXdzXG4gKiB0aGUgc2VsZWN0ZWQgbWljcm9waG9uZS5cbiAqXG4gKiBUaGUgY2FyZCBydW5zIGFsb25nc2lkZSB0aGUgZmlyc3QgZGljdGF0aW9uLCBzbyBpdCBleHBsYWlucyB0aGUgZmVhdHVyZVxuICogd2l0aG91dCBkZWxheWluZyB0aGUgYWN0aW9uIHRoZSB1c2VyIGludm9rZWQuXG4gKi9cbmV4cG9ydCBjbGFzcyBEaWN0YXRpb25PbmJvYXJkaW5nQmFubmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjYXJkOiBDaGF0SW5wdXRPbmJvYXJkaW5nQ2FyZDtcblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aWV3OiBNaWNyb3Bob25lUHJldmlldyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSB3YXZlZm9ybTogTWljcm9waG9uZVdhdmVmb3JtO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhpbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHBpY2tlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZGljdGF0aW9uQW5hbHlzZXI6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBkaWN0YXRpb25XYXZlZm9ybTogVWludDhBcnJheTxBcnJheUJ1ZmZlcj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc3dpdGNoTWljcm9waG9uZTogU3dpdGNoTWljcm9waG9uZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBpY2tlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCkpO1xuXHRwcml2YXRlIG9wdGlvbnM6IElNaWNyb3Bob25lT3B0aW9uW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGJhbm5lck9wdGlvbnM6IElEaWN0YXRpb25PbmJvYXJkaW5nQmFubmVyT3B0aW9ucyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1lZGlhRGV2aWNlczogRGljdGF0aW9uTWVkaWFEZXZpY2VzIHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY2FyZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGF0SW5wdXRPbmJvYXJkaW5nQ2FyZCh7XG5cdFx0XHRjb250YWluZXI6IGJhbm5lck9wdGlvbnMuY29udGFpbmVyLFxuXHRcdFx0Y2xhc3NOYW1lOiAnZGljdGF0aW9uLW9uYm9hcmRpbmctYmFubmVyJyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLnJlZ2lvbicsIFwiRGljdGF0aW9uIGludHJvZHVjdGlvblwiKSxcblx0XHRcdGFyaWFEZXNjcmlwdGlvbjogYmFubmVyT3B0aW9ucy5wcmV2aWV3TWljcm9waG9uZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5yZWdpb25EZXNjcmlwdGlvbi5wcmV2aWV3JywgXCJTYXkgYW55dGhpbmcgdG8gY2hlY2sgeW91ciBtaWNyb3Bob25lLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5yZWdpb25EZXNjcmlwdGlvbicsIFwiU3BlYWsgYW5kIGl0IGJlY29tZXMgdGV4dC5cIiksXG5cdFx0XHRvbkVzY2FwZTogKCkgPT4gdGhpcy5kaXNtaXNzKCdlc2NhcGUnKSxcblx0XHR9KSk7XG5cdFx0dGhpcy5kb21Ob2RlID0gdGhpcy5jYXJkLmRvbU5vZGU7XG5cblx0XHRjb25zdCBoZWFkZXIgPSBkb20uYXBwZW5kKHRoaXMuZG9tTm9kZSwgZG9tLiQoJy5kaWN0YXRpb24tb25ib2FyZGluZy1oZWFkZXInKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBkb20uYXBwZW5kKGhlYWRlciwgZG9tLiQoJy5kaWN0YXRpb24tb25ib2FyZGluZy10aXRsZScpKTtcblx0XHR0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy50aXRsZScsIFwiRGljdGF0aW9uXCIpO1xuXHRcdHRoaXMucmVuZGVyRGVzY3JpcHRpb24oaGVhZGVyKTtcblxuXHRcdHRoaXMucmVuZGVyQ2xvc2UoKTtcblxuXHRcdGNvbnN0IGRldmljZSA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCBkb20uJCgnLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWRldmljZScpKTtcblx0XHR0aGlzLnBpY2tlckNvbnRhaW5lciA9IGRvbS5hcHBlbmQoZGV2aWNlLCBkb20uJCgnLmRpY3RhdGlvbi1vbmJvYXJkaW5nLXBpY2tlcicpKTtcblx0XHR0aGlzLm9wdGlvbnMgPSBbe1xuXHRcdFx0ZGV2aWNlSWQ6IFNZU1RFTV9ERUZBVUxUX0RFVklDRV9JRCxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZGljdGF0aW9uLm9uYm9hcmRpbmcuc3lzdGVtRGVmYXVsdCcsIFwiU3lzdGVtIGRlZmF1bHRcIiksXG5cdFx0fV07XG5cdFx0dGhpcy5yZW5kZXJQaWNrZXIoKTtcblxuXHRcdGlmICh0aGlzLm1lZGlhRGV2aWNlcykge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLm1lZGlhRGV2aWNlcywgJ2RldmljZWNoYW5nZScsICgpID0+IHZvaWQgdGhpcy5yZWZyZXNoTWljcm9waG9uZXMoKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdhdmVmb3JtQ29udGFpbmVyID0gZG9tLmFwcGVuZChkZXZpY2UsIGRvbS4kKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctd2F2ZWZvcm0nKSk7XG5cdFx0aWYgKHRoaXMuYmFubmVyT3B0aW9ucy5wcmV2aWV3TWljcm9waG9uZSkge1xuXHRcdFx0Ly8gQXV0b21hdGljIG9uYm9hcmRpbmcgcnVucyBiZXNpZGUgYW4gYWxyZWFkeSBhY3RpdmUgZGljdGF0aW9uXG5cdFx0XHQvLyBzdHJlYW0sIHNvIG9ubHkgdGhlIG1hbnVhbGx5IG9wZW5lZCBpbnRyb2R1Y3Rpb24gb3ducyB0aGlzXG5cdFx0XHQvLyBpbmRlcGVuZGVudCBwcmV2aWV3LlxuXHRcdFx0Y29uc3QgcHJldmlldyA9IHRoaXMucHJldmlldyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1pY3JvcGhvbmVQcmV2aWV3LCB0aGlzLmRvbU5vZGUsIHRoaXMubWVkaWFEZXZpY2VzKSk7XG5cdFx0XHR0aGlzLndhdmVmb3JtID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWljcm9waG9uZVdhdmVmb3JtLCB3YXZlZm9ybUNvbnRhaW5lciwge1xuXHRcdFx0XHRnZXRMZXZlbDogKCkgPT4gcHJldmlldy5nZXRMZXZlbCgpLFxuXHRcdFx0XHRpc0F2YWlsYWJsZTogKCkgPT4gcHJldmlldy5lcnJvciA9PT0gdW5kZWZpbmVkLFxuXHRcdFx0fSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihwcmV2aWV3Lm9uRGlkQ2hhbmdlRXJyb3IoKCkgPT4gdGhpcy51cGRhdGVIaW50KCkpKTtcblxuXHRcdFx0dGhpcy5oaW50ID0gZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIGRvbS4kKCcuZGljdGF0aW9uLW9uYm9hcmRpbmctaGludCcpKTtcblx0XHRcdHRoaXMuaGludC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGl2ZScsICdwb2xpdGUnKTtcblx0XHRcdHRoaXMudXBkYXRlSGludCgpO1xuXG5cdFx0XHR2b2lkIHRoaXMuc3RhcnRQcmV2aWV3KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMud2F2ZWZvcm0gPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNaWNyb3Bob25lV2F2ZWZvcm0sIHdhdmVmb3JtQ29udGFpbmVyLCB7XG5cdFx0XHRcdGdldExldmVsOiAoKSA9PiByZWFkTWljcm9waG9uZUxldmVsKHRoaXMuZGljdGF0aW9uQW5hbHlzZXIsIHRoaXMuZGljdGF0aW9uV2F2ZWZvcm0pLFxuXHRcdFx0XHRpc0F2YWlsYWJsZTogKCkgPT4gdGhpcy5kaWN0YXRpb25BbmFseXNlciAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0fSwgdW5kZWZpbmVkKSk7XG5cdFx0XHR2b2lkIHRoaXMucmVmcmVzaE1pY3JvcGhvbmVzKCk7XG5cdFx0fVxuXHRcdHRoaXMud2F2ZWZvcm0uc3RhcnQoKTtcblx0XHR0aGlzLmxvZ0FjdGlvbignc2hvd24nKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGF0IGRpY3RhdGlvbiBpcywgYW5kIHRoYXQgbm9uZSBvZiBpdCBpcyBmaXhlZC4gVGhlIGNhcmQgaXMgc2hvd24gb25jZSwgc29cblx0ICogdGhlIHR3byB0aGluZ3MgYSB1c2VyIG1pZ2h0IHdhbnQgdG8gY2hhbmdlIGFmdGVyd2FyZHMgLSB3aGV0aGVyIGRpY3RhdGlvblxuXHQgKiBydW5zIGF0IGFsbCwgYW5kIGhvdyBpdCB3cml0ZXMgd2hhdCB0aGV5IHNheSAtIGhhdmUgdG8gYmUgcmVhY2hhYmxlIGZyb21cblx0ICogaGVyZSByYXRoZXIgdGhhbiBsZWZ0IHRvIGEgY29tbWFuZCBub2JvZHkga25vd3MgdG8gbG9vayBmb3IuXG5cdCAqXG5cdCAqIGBbWy4uLl1dYCBtYXJrcyB0aGUgY2xhdXNlcyB0aGF0IGJlY29tZSBsaW5rcywgc28gdHJhbnNsYXRvcnMgY2FuIGtlZXAgdGhlXG5cdCAqIHNlbnRlbmNlIG5hdHVyYWwgaW5zdGVhZCBvZiBoYXZpbmcgZml4ZWQgcGhyYXNlcyBjb25jYXRlbmF0ZWQgb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlckRlc2NyaXB0aW9uKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmRpY3RhdGlvbi1vbmJvYXJkaW5nLWRlc2NyaXB0aW9uJykpO1xuXHRcdGNvbnN0IHRleHQgPSBsb2NhbGl6ZSh7XG5cdFx0XHRrZXk6ICdkaWN0YXRpb24ub25ib2FyZGluZy5kZXNjcmlwdGlvbicsXG5cdFx0XHRjb21tZW50OiBbJ1ByZXNlcnZlIHRoZSBkb3VibGUgc3F1YXJlIGJyYWNrZXRzOiB0aGV5IG1hcmsgdGhlIHRleHQgdGhhdCBiZWNvbWVzIGEgbGluay4gS2VlcCBib3RoIGxpbmtzLCBpbiB0aGlzIG9yZGVyIC0gdGhlIGZpcnN0IG9wZW5zIHNldHRpbmdzLCB0aGUgc2Vjb25kIG9wZW5zIHRoZSBjdXN0b21pemF0aW9uIGZpbGUuJ10sXG5cdFx0fSwgXCJTcGVhayBhbmQgaXQgYmVjb21lcyB0ZXh0LiBBZGp1c3QgW1tzZXR0aW5nc11dIG9yIFtbaG93IGl0J3Mgd3JpdHRlbl1dIGFueSB0aW1lLlwiKTtcblxuXHRcdGRvbS5hcHBlbmQoZGVzY3JpcHRpb24sIHJlbmRlckZvcm1hdHRlZFRleHQodGV4dCwge1xuXHRcdFx0YWN0aW9uSGFuZGxlcjoge1xuXHRcdFx0XHQvLyBUaGUgaGFuZGxlciBpcyBnaXZlbiB0aGUgbGluaydzIGluZGV4LCBzbyB0aGUgdHdvIGFyZSB0b2xkIGFwYXJ0XG5cdFx0XHRcdC8vIGJ5IHBvc2l0aW9uIC0gaGVuY2UgdGhlIG9yZGVyaW5nIG5vdGUgdG8gdHJhbnNsYXRvcnMgYWJvdmUuXG5cdFx0XHRcdGNhbGxiYWNrOiBpbmRleCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgW2NvbW1hbmRJZCwgLi4uYXJnc10gPSBpbmRleCA9PT0gJzAnXG5cdFx0XHRcdFx0XHQ/IFtPUEVOX1NFVFRJTkdTX0NPTU1BTkQsIHsgcXVlcnk6IERJQ1RBVElPTl9TRVRUSU5HU19RVUVSWSB9XVxuXHRcdFx0XHRcdFx0OiBbQ09ORklHVVJFX0RJQ1RBVElPTl9JTlNUUlVDVElPTlNfQUNUSU9OX0lEXTtcblx0XHRcdFx0XHR0aGlzLmxvZ0FjdGlvbihpbmRleCA9PT0gJzAnID8gJ29wZW5TZXR0aW5ncycgOiAnb3Blbkluc3RydWN0aW9ucycpO1xuXHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkIGFzIHN0cmluZywgLi4uYXJncylcblx0XHRcdFx0XHRcdC5jYXRjaChlcnJvciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0LXN0dF0gZmFpbGVkIHRvIG9wZW4gZGljdGF0aW9uIGN1c3RvbWl6YXRpb246ICR7ZXJyb3J9YCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NhYmxlczogdGhpcy5fc3RvcmUsXG5cdFx0XHR9LFxuXHRcdH0sIGRvbS4kKCdzcGFuJykpKTtcblxuXHRcdC8vIGByZW5kZXJGb3JtYXR0ZWRUZXh0YCBnaXZlcyBlYWNoIGFuY2hvciBhIGNsaWNrIGxpc3RlbmVyIGFuZCBub3RoaW5nXG5cdFx0Ly8gZWxzZSwgc28gbWFrZSB0aGVtIHJlYWwgY29udHJvbHM6IHJlYWNoYWJsZSBieSBUYWIgYW5kIG9wZXJhYmxlIGJ5XG5cdFx0Ly8gRW50ZXIgb3IgU3BhY2UgbGlrZSBhbnkgb3RoZXIgYnV0dG9uLiBUaGUgcmVuZGVyZXIgb3ducyB0aGlzIERPTSwgc28gYVxuXHRcdC8vIHNlbGVjdG9yIGlzIHRoZSBvbmx5IGhhbmRsZSBvbiBpdC5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRmb3IgKGNvbnN0IGxpbmsgb2YgZGVzY3JpcHRpb24ucXVlcnlTZWxlY3RvckFsbCgnYScpKSB7XG5cdFx0XHRsaW5rLnRhYkluZGV4ID0gMDtcblx0XHRcdGxpbmsuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihsaW5rLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBldmVudCA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGV2ZW50KTtcblx0XHRcdFx0aWYgKGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGtleWJvYXJkRXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdFx0a2V5Ym9hcmRFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdGxpbmsuY2xpY2soKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCcmluZyB0aGUgY2FyZCB0byBsaWZlLiBUaGUgZGV2aWNlIGxpc3QgYW5kIHRoZSBtaWNyb3Bob25lIGFyZSBzdGFydGVkXG5cdCAqIHRvZ2V0aGVyIHJhdGhlciB0aGFuIGluIHNlcXVlbmNlOiBgZ2V0VXNlck1lZGlhYCBjYW4gdGFrZSBhIHNlY29uZCBvciBtb3JlXG5cdCAqIHRvIHJldHVybiwgYW5kIHdhaXRpbmcgZm9yIGl0IHdvdWxkIGxlYXZlIHRoZSBwaWNrZXIgZW1wdHkgZm9yIHRoYXQgd2hvbGVcblx0ICogdGltZS4gRW51bWVyYXRpb24gaXMgcmVwZWF0ZWQgb25jZSB0aGUgbWljcm9waG9uZSBpcyBsaXZlLCBiZWNhdXNlIGRldmljZVxuXHQgKiBsYWJlbHMgc3RheSBibGFuayB1bnRpbCBwZXJtaXNzaW9uIGhhcyBiZWVuIGdyYW50ZWQgYXQgbGVhc3Qgb25jZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgc3RhcnRQcmV2aWV3KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5wcmV2aWV3KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3RlbmluZyA9IHRoaXMucHJldmlldy5saXN0ZW4odGhpcy5jdXJyZW50RGV2aWNlSWQoKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2xpc3RlbmluZywgdGhpcy5yZWZyZXNoTWljcm9waG9uZXMoKV0pO1xuXHRcdGF3YWl0IHRoaXMucmVmcmVzaE1pY3JvcGhvbmVzKCk7XG5cdH1cblxuXHRwcml2YXRlIGN1cnJlbnREZXZpY2VJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk1pY3JvcGhvbmVEZXZpY2UsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU1lTVEVNX0RFRkFVTFRfREVWSUNFX0lEKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2hNaWNyb3Bob25lcyhhbmFseXNlck5vZGU/OiBBbmFseXNlck5vZGUsIHN3aXRjaE1pY3JvcGhvbmU/OiBTd2l0Y2hNaWNyb3Bob25lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5zd2l0Y2hNaWNyb3Bob25lID0gc3dpdGNoTWljcm9waG9uZSA/PyB0aGlzLnN3aXRjaE1pY3JvcGhvbmU7XG5cdFx0aWYgKCF0aGlzLnByZXZpZXcgJiYgYW5hbHlzZXJOb2RlKSB7XG5cdFx0XHR0aGlzLmRpY3RhdGlvbkFuYWx5c2VyID0gYW5hbHlzZXJOb2RlO1xuXHRcdFx0dGhpcy5kaWN0YXRpb25XYXZlZm9ybSA9IG5ldyBVaW50OEFycmF5KGFuYWx5c2VyTm9kZS5mZnRTaXplKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnByZXZpZXcgJiYgIXRoaXMuZGljdGF0aW9uQW5hbHlzZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLm1lZGlhRGV2aWNlcz8uZW51bWVyYXRlRGV2aWNlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkZXZpY2VzOiBNZWRpYURldmljZUluZm9bXTtcblx0XHR0cnkge1xuXHRcdFx0ZGV2aWNlcyA9IGF3YWl0IHRoaXMubWVkaWFEZXZpY2VzLmVudW1lcmF0ZURldmljZXMoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbY2hhdC1zdHRdIGNvdWxkIG5vdCBlbnVtZXJhdGUgbWljcm9waG9uZXM6ICR7ZXJyb3J9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0gYnVpbGRNaWNyb3Bob25lT3B0aW9ucyhkZXZpY2VzKTtcblx0XHQvLyBCZWZvcmUgcGVybWlzc2lvbiBpcyBncmFudGVkIHRoZSBicm93c2VyIHJlcG9ydHMgdGhlIGRldmljZXMgYnV0IG5vdFxuXHRcdC8vIHRoZWlyIG5hbWVzLiBSZS1yZW5kZXJpbmcgYSBsaXN0IG9mIFwiVW5rbm93biBkZXZpY2VcIiByb3dzIGFuZCB0aGVuXG5cdFx0Ly8gc3dhcHBpbmcgaW4gdGhlIHJlYWwgbmFtZXMgYSBtb21lbnQgbGF0ZXIgaXMgd29yc2UgdGhhbiB3YWl0aW5nOiBrZWVwXG5cdFx0Ly8gdGhlIHJvdyBhcyBpdCBpcyB1bnRpbCB0aGVyZSBpcyBzb21ldGhpbmcgd29ydGggc2hvd2luZy5cblx0XHRpZiAodGhpcy5vcHRpb25zLmxlbmd0aCA+IDEgJiYgIW9wdGlvbnMuc29tZShvcHRpb24gPT4gb3B0aW9uLmRldmljZUlkICYmIG9wdGlvbi5sYWJlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdHRoaXMucmVuZGVyUGlja2VyKCk7XG5cdH1cblxuXHQvKiogQSBwaWNrZXIgd2l0aCBvbmUgZW50cnkgaXMgbm90IGEgY2hvaWNlLCBzbyBvbmx5IHNob3cgdGhpcyByb3cgZm9yIG11bHRpcGxlIG1pY3JvcGhvbmVzLiAqL1xuXHRwcml2YXRlIHJlbmRlclBpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucGlja2VyQ29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMucGlja2VyLmNsZWFyKCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLnBpY2tlckNvbnRhaW5lcik7XG5cblx0XHR0aGlzLnBpY2tlckNvbnRhaW5lci5oaWRkZW4gPSB0aGlzLm9wdGlvbnMubGVuZ3RoIDw9IDE7XG5cdFx0aWYgKHRoaXMucGlja2VyQ29udGFpbmVyLmhpZGRlbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRvbS5hcHBlbmQodGhpcy5waWNrZXJDb250YWluZXIsIGRvbS4kKGBzcGFuLmNvZGljb24uY29kaWNvbi0ke0NvZGljb24ubWljLmlkfS5kaWN0YXRpb24tb25ib2FyZGluZy1waWNrZXItaWNvbmApKVxuXHRcdFx0LnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSBpbmRleE9mTWljcm9waG9uZSh0aGlzLm9wdGlvbnMsIHRoaXMuY3VycmVudERldmljZUlkKCkpO1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Ly8gQ3VzdG9tLWRyYXduIHJhdGhlciB0aGFuIHRoZSBwbGF0Zm9ybSBjb250cm9sLCBhbmQgd2l0aCB0aGUgZmFjZSBjb2xvcnNcblx0XHQvLyBibGFua2VkIHNvIHRoZSByb3cgaW5oZXJpdHMgdGhlIGNhcmQgaW5zdGVhZCBvZiBjYXJyeWluZyB0aGUgcGxhdGZvcm0nc1xuXHRcdC8vIHNlbGVjdCBjaHJvbWUgLSB0aGF0IGZpbGwgaXMgZXhhY3RseSB3aGF0IHRoaXMgcm93IHNob3VsZCBub3QgaGF2ZSBhdFxuXHRcdC8vIHJlc3QuIFRoZSBkcm9wZG93biBrZWVwcyBpdHMgb3duIGNvbG9ycywgc28gb25seSB0aGUgZmFjZSBjaGFuZ2VzLlxuXHRcdGNvbnN0IHNlbGVjdEJveCA9IHN0b3JlLmFkZChuZXcgU2VsZWN0Qm94KFxuXHRcdFx0dGhpcy5vcHRpb25zLm1hcChvcHRpb24gPT4gKHsgdGV4dDogb3B0aW9uLmxhYmVsIH0pKSxcblx0XHRcdHNlbGVjdGVkLFxuXHRcdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0XHR7IC4uLmRlZmF1bHRTZWxlY3RCb3hTdHlsZXMsIHNlbGVjdEJhY2tncm91bmQ6IHVuZGVmaW5lZCwgc2VsZWN0Qm9yZGVyOiB1bmRlZmluZWQsIHNlbGVjdEZvcmVncm91bmQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBhcmlhTGFiZWw6IGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5taWNyb3Bob25lJywgXCJNaWNyb3Bob25lXCIpLCB1c2VDdXN0b21EcmF3bjogdHJ1ZSB9LFxuXHRcdCkpO1xuXHRcdHNlbGVjdEJveC5yZW5kZXIodGhpcy5waWNrZXJDb250YWluZXIpO1xuXHRcdHN0b3JlLmFkZChzZWxlY3RCb3gub25EaWRTZWxlY3QoZXZlbnQgPT4gdGhpcy5zZWxlY3RNaWNyb3Bob25lKGV2ZW50LmluZGV4KSkpO1xuXHRcdHRoaXMucGlja2VyLnZhbHVlID0gc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIHNlbGVjdE1pY3JvcGhvbmUoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbiA9IHRoaXMub3B0aW9uc1tpbmRleF07XG5cdFx0aWYgKCFvcHRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5sb2dBY3Rpb24oJ3NlbGVjdE1pY3JvcGhvbmUnKTtcblxuXHRcdC8vIFNoYXJlZCB3aXRoIFZvaWNlIE1vZGUgYW5kIHdpdGggdGhlIFwiU2VsZWN0IE1pY3JvcGhvbmVcIiBxdWljayBwaWNrLCBzb1xuXHRcdC8vIHRoZSBjaG9pY2UgbWFkZSBoZXJlIGlzIHRoZSBvbmUgZGljdGF0aW9uIGFjdHVhbGx5IHJlY29yZHMgZnJvbS5cblx0XHRpZiAob3B0aW9uLmRldmljZUlkKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuTWljcm9waG9uZURldmljZSwgb3B0aW9uLmRldmljZUlkLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFnZW50c1ZvaWNlU3RvcmFnZUtleXMuTWljcm9waG9uZURldmljZSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR9XG5cblx0XHRzdGF0dXMobG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLm1pY3JvcGhvbmVTZWxlY3RlZCcsIFwiezB9IHNlbGVjdGVkLlwiLCBvcHRpb24ubGFiZWwpKTtcblx0XHRpZiAodGhpcy5wcmV2aWV3KSB7XG5cdFx0XHR2b2lkIHRoaXMucHJldmlldy5saXN0ZW4ob3B0aW9uLmRldmljZUlkKS50aGVuKCgpID0+IHRoaXMudXBkYXRlSGludCgpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuc3dpdGNoTWljcm9waG9uZSkge1xuXHRcdFx0dm9pZCB0aGlzLnN3aXRjaE1pY3JvcGhvbmUob3B0aW9uLmRldmljZUlkKVxuXHRcdFx0XHQudGhlbihhbmFseXNlciA9PiB0aGlzLnJlZnJlc2hNaWNyb3Bob25lcyhhbmFseXNlcikpXG5cdFx0XHRcdC5jYXRjaChlcnJvciA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0LXN0dF0gZmFpbGVkIHRvIHN3aXRjaCBkaWN0YXRpb24gbWljcm9waG9uZTogJHtlcnJvcn1gKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBoaW50IG9ubHkgc3BlYWtzIHdoZW4gdGhlIG1pY3JvcGhvbmUgY2Fubm90IGJlIHJlYWQuIEF0IHJlc3QgdGhlXG5cdCAqIG1vdmluZyB3YXZlZm9ybSBpcyB0aGUgaW5zdHJ1Y3Rpb24gLSBhIGxpbmUgb2YgdGV4dCB0ZWxsaW5nIHlvdSB0byB0YWxrIGlzXG5cdCAqIG9uZSB0aGUgY2FyZCBjYW4gZG8gd2l0aG91dC5cblx0ICovXG5cdHByaXZhdGUgdXBkYXRlSGludCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMucHJldmlldyB8fCAhdGhpcy5oaW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVycm9yID0gdGhpcy5wcmV2aWV3LmVycm9yO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtZXJyb3InLCBlcnJvciAhPT0gdW5kZWZpbmVkKTtcblx0XHR0aGlzLmhpbnQudGV4dENvbnRlbnQgPSBlcnJvciA9PT0gdW5kZWZpbmVkID8gJycgOiBoaW50Rm9yRXJyb3IoZXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNhcmQuYWRkQWN0aW9uKHtcblx0XHRcdGNsYXNzTmFtZTogJ2RpY3RhdGlvbi1vbmJvYXJkaW5nLWNsb3NlJyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLmNsb3NlJywgXCJDbG9zZSB0aGUgaW50cm9kdWN0aW9uXCIpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jbG9zZSxcblx0XHRcdG9uQWN0aXZhdGU6ICgpID0+IHRoaXMuZGlzbWlzcygnY2xvc2UnKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZGlzbWlzcyhhY3Rpb246ICdjbG9zZScgfCAnZXNjYXBlJyk6IHZvaWQge1xuXHRcdHRoaXMubG9nQWN0aW9uKGFjdGlvbik7XG5cdFx0dGhpcy53YXZlZm9ybS5zdG9wKCk7XG5cdFx0dGhpcy5wcmV2aWV3Py5yZWxlYXNlTWljcm9waG9uZSgpO1xuXHRcdHRoaXMuYmFubmVyT3B0aW9ucy5vbkRpc21pc3MoKTtcblx0fVxuXG5cdHByaXZhdGUgbG9nQWN0aW9uKGFjdGlvbjogRGljdGF0aW9uT25ib2FyZGluZ0FjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPERpY3RhdGlvbk9uYm9hcmRpbmdBY3Rpb25FdmVudCwgRGljdGF0aW9uT25ib2FyZGluZ0FjdGlvbkNsYXNzaWZpY2F0aW9uPihcblx0XHRcdCdkaWN0YXRpb25PbmJvYXJkaW5nLmFjdGlvbicsXG5cdFx0XHR7IGFjdGlvbiwgc291cmNlOiB0aGlzLmJhbm5lck9wdGlvbnMuc291cmNlIH1cblx0XHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGhpbnRGb3JFcnJvcihlcnJvcjogTWljcm9waG9uZVByZXZpZXdFcnJvcik6IHN0cmluZyB7XG5cdHN3aXRjaCAoZXJyb3IpIHtcblx0XHRjYXNlIE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IuRGVuaWVkOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy5kZW5pZWQnLCBcIk5vIG1pY3JvcGhvbmUgYWNjZXNzLiBDaGVjayB5b3VyIHN5c3RlbSBwcml2YWN5IHNldHRpbmdzLlwiKTtcblx0XHRjYXNlIE1pY3JvcGhvbmVQcmV2aWV3RXJyb3IuTm9EZXZpY2U6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2RpY3RhdGlvbi5vbmJvYXJkaW5nLm5vRGV2aWNlJywgXCJObyBtaWNyb3Bob25lIGZvdW5kLlwiKTtcblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdkaWN0YXRpb24ub25ib2FyZGluZy51bmF2YWlsYWJsZScsIFwiQ2FuJ3QgcmVhZCB0aGUgbWljcm9waG9uZSBsZXZlbC5cIik7XG5cdH1cbn1cblxuLy8gLS0tIFNlcnZpY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5leHBvcnQgY29uc3QgSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZT4oJ2RpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpc1Zpc2libGU6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGEgY29udGFpbmVyIHRoYXQgY2FuIGhvc3QgdGhlIGNhcmQgKGEgY2hhdCBpbnB1dCkuIFRoZSBtb3N0XG5cdCAqIHJlY2VudGx5IGZvY3VzZWQgaG9zdCB3aW5zIHdoZW4gdGhlIGNhcmQgaXMgc2hvd24uXG5cdCAqXG5cdCAqIEBwYXJhbSBjb250YWluZXIgdGhlIGVsZW1lbnQgdGhlIGNhcmQgaXMgYXBwZW5kZWQgdG8uXG5cdCAqIEBwYXJhbSBmb2N1c1Jvb3QgdGhlIGVsZW1lbnQgd2hvc2UgZm9jdXMgbWFya3MgdGhpcyBob3N0IGFzIHRoZSBhY3RpdmUgb25lXG5cdCAqICh0eXBpY2FsbHkgdGhlIGNoYXQgaW5wdXQgcGFydCB0aGUgY29udGFpbmVyIGxpdmVzIGluKS5cblx0ICovXG5cdHJlZ2lzdGVySG9zdChjb250YWluZXI6IEhUTUxFbGVtZW50LCBmb2N1c1Jvb3Q6IEhUTUxFbGVtZW50LCB0aXBDb250YWluZXI/OiBIVE1MRWxlbWVudCwgb25EaWRDaGFuZ2VWaXNpYmxlPzogKHZpc2libGU6IGJvb2xlYW4pID0+IHZvaWQpOiBJRGlzcG9zYWJsZTtcblxuXHQvKipcblx0ICogU2hvdyB0aGUgY2FyZCBhbG9uZ3NpZGUgdGhlIHVzZXIncyBmaXJzdCBkaWN0YXRpb24uIERpY3RhdGlvbiBzdGFydHNcblx0ICogaW5kZXBlbmRlbnRseSBhbmQgaXMgbmV2ZXIgZ2F0ZWQgb24gdGhlIGNhcmQuXG5cdCAqL1xuXHRzaG93SWZOZWVkZWQoKTogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2hvdyB0aGUgY2FyZCBhZ2FpbiByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXQgaGFzIGJlZW4gc2VlbiwgZm9yIHRoZSBcIlNob3dcblx0ICogSW50cm9kdWN0aW9uXCIgY29tbWFuZC4gUmV0dXJucyBgZmFsc2VgIHdoZW4gdGhlcmUgaXMgbm8gdmlzaWJsZSBjaGF0IGlucHV0XG5cdCAqIHRvIGRvY2sgaXQgdG8sIHNvIHRoZSBjYWxsZXIgY2FuIGV4cGxhaW4gd2h5IG5vdGhpbmcgaGFwcGVuZWQuXG5cdCAqL1xuXHRzaG93KCk6IGJvb2xlYW47XG5cblx0LyoqIFJlZnJlc2ggdGhlIHZpc2libGUgY2FyZCBhZnRlciBkaWN0YXRpb24gYWNxdWlyZXMgbWljcm9waG9uZSBwZXJtaXNzaW9uLiAqL1xuXHRyZWZyZXNoTWljcm9waG9uZXMoYW5hbHlzZXJOb2RlPzogQW5hbHlzZXJOb2RlLCBzd2l0Y2hNaWNyb3Bob25lPzogU3dpdGNoTWljcm9waG9uZSk6IHZvaWQ7XG5cblx0LyoqIFJlc2V0IGZpcnN0LXJ1biBzdGF0ZSBzbyB0aGUgaW50cm9kdWN0aW9uIGlzIHNob3duIG5leHQgdGltZS4gKi9cblx0cmVzZXQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIERpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvbmJvYXJkaW5nOiBDaGF0SW5wdXRPbmJvYXJkaW5nO1xuXHRwcml2YXRlIGN1cnJlbnRCYW5uZXI6IERpY3RhdGlvbk9uYm9hcmRpbmdCYW5uZXIgfCB1bmRlZmluZWQ7XG5cblx0Z2V0IGlzVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLmlzVmlzaWJsZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5vbmJvYXJkaW5nID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXRPbmJvYXJkaW5nLCB7XG5cdFx0XHRzdG9yYWdlS2V5OiBESUNUQVRJT05fSU5UUk9fU0hPV05fS0VZLFxuXHRcdFx0aG9zdENsYXNzOiAnaGFzLWRpY3RhdGlvbi1vbmJvYXJkaW5nJyxcblx0XHR9KSk7XG5cdH1cblxuXHRyZWdpc3Rlckhvc3QoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgZm9jdXNSb290OiBIVE1MRWxlbWVudCwgdGlwQ29udGFpbmVyPzogSFRNTEVsZW1lbnQsIG9uRGlkQ2hhbmdlVmlzaWJsZT86ICh2aXNpYmxlOiBib29sZWFuKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiB0aGlzLm9uYm9hcmRpbmcucmVnaXN0ZXJIb3N0KGNvbnRhaW5lciwgZm9jdXNSb290LCB1bmRlZmluZWQsIHRpcENvbnRhaW5lciwgb25EaWRDaGFuZ2VWaXNpYmxlKTtcblx0fVxuXG5cdHNob3dJZk5lZWRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLnNob3dJZk5lZWRlZChjb250ZXh0ID0+IHRoaXMuY3JlYXRlQmFubmVyKGNvbnRleHQuY29udGFpbmVyLCBjb250ZXh0LmRpc21pc3MsICdhdXRvbWF0aWMnLCBmYWxzZSkpO1xuXHR9XG5cblx0c2hvdygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5vbmJvYXJkaW5nLnNob3coY29udGV4dCA9PiB0aGlzLmNyZWF0ZUJhbm5lcihjb250ZXh0LmNvbnRhaW5lciwgY29udGV4dC5kaXNtaXNzLCAnbWFudWFsJywgdHJ1ZSkpO1xuXHR9XG5cblx0cmVmcmVzaE1pY3JvcGhvbmVzKGFuYWx5c2VyTm9kZT86IEFuYWx5c2VyTm9kZSwgc3dpdGNoTWljcm9waG9uZT86IFN3aXRjaE1pY3JvcGhvbmUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vbmJvYXJkaW5nLmlzVmlzaWJsZSkge1xuXHRcdFx0dm9pZCB0aGlzLmN1cnJlbnRCYW5uZXI/LnJlZnJlc2hNaWNyb3Bob25lcyhhbmFseXNlck5vZGUsIHN3aXRjaE1pY3JvcGhvbmUpO1xuXHRcdH1cblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKERJQ1RBVElPTl9JTlRST19TSE9XTl9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUJhbm5lcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBkaXNtaXNzOiAoKSA9PiB2b2lkLCBzb3VyY2U6ICdhdXRvbWF0aWMnIHwgJ21hbnVhbCcsIHByZXZpZXdNaWNyb3Bob25lOiBib29sZWFuKTogRGljdGF0aW9uT25ib2FyZGluZ0Jhbm5lciB7XG5cdFx0Y29uc3QgYmFubmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWN0YXRpb25PbmJvYXJkaW5nQmFubmVyLCB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRvbkRpc21pc3M6IGRpc21pc3MsXG5cdFx0XHRwcmV2aWV3TWljcm9waG9uZSxcblx0XHRcdHNvdXJjZSxcblx0XHR9LCBkb20uZ2V0V2luZG93KGNvbnRhaW5lcikubmF2aWdhdG9yLm1lZGlhRGV2aWNlcyk7XG5cdFx0dGhpcy5jdXJyZW50QmFubmVyID0gYmFubmVyO1xuXHRcdHJldHVybiBiYW5uZXI7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSURpY3RhdGlvbk9uYm9hcmRpbmdTZXJ2aWNlLCBEaWN0YXRpb25PbmJvYXJkaW5nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxpQkFBaUI7QUFD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
