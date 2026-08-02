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
import { addDisposableListener } from "../../../base/browser/dom.js";
import { CachedFunction } from "../../../base/common/cache.js";
import { getStructuralKey } from "../../../base/common/equals.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { FileAccess } from "../../../base/common/network.js";
import { derived, observableFromEvent, ValueWithChangeEventFromObservable } from "../../../base/common/observable.js";
import { localize } from "../../../nls.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { observableConfigValue } from "../../observable/common/platformObservableUtils.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
const IAccessibilitySignalService = createDecorator("accessibilitySignalService");
const AcknowledgeDocCommentsToken = /* @__PURE__ */ Symbol("AcknowledgeDocCommentsToken");
let AccessibilitySignalService = class extends Disposable {
  constructor(configurationService, accessibilityService, telemetryService) {
    super();
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this.telemetryService = telemetryService;
    this.sounds = /* @__PURE__ */ new Map();
    this.screenReaderAttached = observableFromEvent(
      this,
      this.accessibilityService.onDidChangeScreenReaderOptimized,
      () => (
        /** @description accessibilityService.onDidChangeScreenReaderOptimized */
        this.accessibilityService.isScreenReaderOptimized()
      )
    );
    this.sentTelemetry = /* @__PURE__ */ new Set();
    this.playingSounds = /* @__PURE__ */ new Set();
    this._signalConfigValue = new CachedFunction((signal) => observableConfigValue(signal.settingsKey, { sound: "off", announcement: "off" }, this.configurationService));
    this._signalEnabledState = new CachedFunction(
      { getCacheKey: getStructuralKey },
      (arg) => {
        return derived((reader) => {
          const setting = this._signalConfigValue.get(arg.signal).read(reader);
          if (arg.modality === "sound" || arg.modality === void 0) {
            if (arg.signal.managesOwnEnablement || checkEnabledState(setting.sound, () => this.screenReaderAttached.read(reader), arg.userGesture)) {
              return true;
            }
          }
          if (arg.modality === "announcement" || arg.modality === void 0) {
            if (checkEnabledState(setting.announcement, () => this.screenReaderAttached.read(reader), arg.userGesture)) {
              return true;
            }
          }
          return false;
        }).recomputeInitiallyAndOnChange(this._store);
      }
    );
  }
  getEnabledState(signal, userGesture, modality) {
    return new ValueWithChangeEventFromObservable(this._signalEnabledState.get({ signal, userGesture, modality }));
  }
  async playSignal(signal, options = {}) {
    const shouldPlayAnnouncement = options.modality === "announcement" || options.modality === void 0;
    const announcementMessage = options.customAlertMessage ?? signal.announcementMessage;
    if (shouldPlayAnnouncement && this.isAnnouncementEnabled(signal, options.userGesture) && announcementMessage) {
      this.accessibilityService.status(announcementMessage);
    }
    const shouldPlaySound = options.modality === "sound" || options.modality === void 0;
    if (shouldPlaySound && this.isSoundEnabled(signal, options.userGesture)) {
      this.sendSignalTelemetry(signal, options.source);
      await this.playSound(signal.sound.getSound(), options.allowManyInParallel);
    }
  }
  async playSignals(signals) {
    for (const signal of signals) {
      this.sendSignalTelemetry("signal" in signal ? signal.signal : signal, "source" in signal ? signal.source : void 0);
    }
    const signalArray = signals.map((s) => "signal" in s ? s.signal : s);
    const announcements = signalArray.filter((signal) => this.isAnnouncementEnabled(signal)).map((s) => s.announcementMessage);
    if (announcements.length) {
      this.accessibilityService.status(announcements.join(", "));
    }
    const sounds = new Set(signalArray.filter((signal) => this.isSoundEnabled(signal)).map((signal) => signal.sound.getSound()));
    await Promise.all(Array.from(sounds).map((sound) => this.playSound(sound, true)));
  }
  sendSignalTelemetry(signal, source) {
    const isScreenReaderOptimized = this.accessibilityService.isScreenReaderOptimized();
    const key = signal.name + (source ? `::${source}` : "") + (isScreenReaderOptimized ? "{screenReaderOptimized}" : "");
    if (this.sentTelemetry.has(key) || this.getVolumeInPercent() === 0) {
      return;
    }
    this.sentTelemetry.add(key);
    this.telemetryService.publicLog2("signal.played", {
      signal: signal.name,
      source: source ?? "",
      isScreenReaderOptimized
    });
  }
  getVolumeInPercent() {
    const volume = this.configurationService.getValue("accessibility.signalOptions.volume");
    if (typeof volume !== "number") {
      return 50;
    }
    return Math.max(Math.min(volume, 100), 0);
  }
  async playSound(sound, allowManyInParallel = false) {
    if (!allowManyInParallel && this.playingSounds.has(sound)) {
      return;
    }
    this.playingSounds.add(sound);
    const url = FileAccess.asBrowserUri(`vs/platform/accessibilitySignal/browser/media/${sound.fileName}`).toString(true);
    try {
      const sound2 = this.sounds.get(url);
      if (sound2) {
        sound2.volume = this.getVolumeInPercent() / 100;
        sound2.currentTime = 0;
        await sound2.play();
      } else {
        const playedSound = await playAudio(url, this.getVolumeInPercent() / 100);
        this.sounds.set(url, playedSound);
      }
    } catch (e) {
      if (!e.message.includes("play() can only be initiated by a user gesture")) {
        console.error("Error while playing sound", e);
      }
    } finally {
      this.playingSounds.delete(sound);
    }
  }
  playSignalLoop(signal, milliseconds) {
    let playing = true;
    const playSound = () => {
      if (playing) {
        this.playSignal(signal, { allowManyInParallel: true }).finally(() => {
          setTimeout(() => {
            if (playing) {
              playSound();
            }
          }, milliseconds);
        });
      }
    };
    playSound();
    return toDisposable(() => playing = false);
  }
  isAnnouncementEnabled(signal, userGesture) {
    if (!signal.announcementMessage) {
      return false;
    }
    return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: "announcement" }).get();
  }
  isSoundEnabled(signal, userGesture) {
    return this._signalEnabledState.get({ signal, userGesture: !!userGesture, modality: "sound" }).get();
  }
  onSoundEnabledChanged(signal) {
    return this.getEnabledState(signal, false).onDidChange;
  }
  getDelayMs(signal, modality, mode) {
    if (!this.configurationService.getValue("accessibility.signalOptions.debouncePositionChanges")) {
      return 0;
    }
    let value;
    if (signal.name === AccessibilitySignal.errorAtPosition.name && mode === "positional") {
      value = this.configurationService.getValue("accessibility.signalOptions.experimental.delays.errorAtPosition");
    } else if (signal.name === AccessibilitySignal.warningAtPosition.name && mode === "positional") {
      value = this.configurationService.getValue("accessibility.signalOptions.experimental.delays.warningAtPosition");
    } else {
      value = this.configurationService.getValue("accessibility.signalOptions.experimental.delays.general");
    }
    return modality === "sound" ? value.sound : value.announcement;
  }
};
AccessibilitySignalService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IAccessibilityService),
  __decorateParam(2, ITelemetryService)
], AccessibilitySignalService);
function checkEnabledState(state, getScreenReaderAttached, isTriggeredByUserGesture) {
  return state === "on" || state === "always" || state === "auto" && getScreenReaderAttached() || state === "userGesture" && isTriggeredByUserGesture;
}
async function playAudio(url, volume) {
  const disposables = new DisposableStore();
  try {
    return await doPlayAudio(url, volume, disposables);
  } finally {
    disposables.dispose();
  }
}
function doPlayAudio(url, volume, disposables) {
  return new Promise((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = volume;
    disposables.add(addDisposableListener(audio, "ended", () => {
      resolve(audio);
    }));
    disposables.add(addDisposableListener(audio, "error", (e) => {
      reject(e.error);
    }));
    audio.play().catch((e) => {
      reject(e);
    });
  });
}
const _Sound = class _Sound {
  constructor(fileName) {
    this.fileName = fileName;
  }
  static register(options) {
    const sound = new _Sound(options.fileName);
    return sound;
  }
};
_Sound.error = _Sound.register({ fileName: "error.mp3" });
_Sound.warning = _Sound.register({ fileName: "warning.mp3" });
_Sound.success = _Sound.register({ fileName: "success.mp3" });
_Sound.foldedArea = _Sound.register({ fileName: "foldedAreas.mp3" });
_Sound.break = _Sound.register({ fileName: "break.mp3" });
_Sound.quickFixes = _Sound.register({ fileName: "quickFixes.mp3" });
_Sound.taskCompleted = _Sound.register({ fileName: "taskCompleted.mp3" });
_Sound.taskFailed = _Sound.register({ fileName: "taskFailed.mp3" });
_Sound.terminalBell = _Sound.register({ fileName: "terminalBell.mp3" });
_Sound.diffLineInserted = _Sound.register({ fileName: "diffLineInserted.mp3" });
_Sound.diffLineDeleted = _Sound.register({ fileName: "diffLineDeleted.mp3" });
_Sound.diffLineModified = _Sound.register({ fileName: "diffLineModified.mp3" });
_Sound.requestSent = _Sound.register({ fileName: "requestSent.mp3" });
_Sound.responseReceived1 = _Sound.register({ fileName: "responseReceived1.mp3" });
_Sound.responseReceived2 = _Sound.register({ fileName: "responseReceived2.mp3" });
_Sound.responseReceived3 = _Sound.register({ fileName: "responseReceived3.mp3" });
_Sound.responseReceived4 = _Sound.register({ fileName: "responseReceived4.mp3" });
_Sound.clear = _Sound.register({ fileName: "clear.mp3" });
_Sound.save = _Sound.register({ fileName: "save.mp3" });
_Sound.format = _Sound.register({ fileName: "format.mp3" });
_Sound.voiceRecordingStarted = _Sound.register({ fileName: "voiceRecordingStarted.mp3" });
_Sound.voiceRecordingStopped = _Sound.register({ fileName: "voiceRecordingStopped.mp3" });
_Sound.progress = _Sound.register({ fileName: "progress.mp3" });
_Sound.chatEditModifiedFile = _Sound.register({ fileName: "chatEditModifiedFile.mp3" });
_Sound.editsKept = _Sound.register({ fileName: "editsKept.mp3" });
_Sound.editsUndone = _Sound.register({ fileName: "editsUndone.mp3" });
_Sound.nextEditSuggestion = _Sound.register({ fileName: "nextEditSuggestion.mp3" });
_Sound.terminalCommandSucceeded = _Sound.register({ fileName: "terminalCommandSucceeded.mp3" });
_Sound.chatUserActionRequired = _Sound.register({ fileName: "chatUserActionRequired.mp3" });
_Sound.codeActionTriggered = _Sound.register({ fileName: "codeActionTriggered.mp3" });
_Sound.codeActionApplied = _Sound.register({ fileName: "codeActionApplied.mp3" });
let Sound = _Sound;
class SoundSource {
  constructor(randomOneOf) {
    this.randomOneOf = randomOneOf;
  }
  getSound(deterministic = false) {
    if (deterministic || this.randomOneOf.length === 1) {
      return this.randomOneOf[0];
    } else {
      const index = Math.floor(Math.random() * this.randomOneOf.length);
      return this.randomOneOf[index];
    }
  }
}
const _AccessibilitySignal = class _AccessibilitySignal {
  constructor(sound, name, legacySoundSettingsKey, settingsKey, legacyAnnouncementSettingsKey, announcementMessage, managesOwnEnablement = false) {
    this.sound = sound;
    this.name = name;
    this.legacySoundSettingsKey = legacySoundSettingsKey;
    this.settingsKey = settingsKey;
    this.legacyAnnouncementSettingsKey = legacyAnnouncementSettingsKey;
    this.announcementMessage = announcementMessage;
    this.managesOwnEnablement = managesOwnEnablement;
  }
  static register(options) {
    const soundSource = new SoundSource("randomOneOf" in options.sound ? options.sound.randomOneOf : [options.sound]);
    const signal = new _AccessibilitySignal(
      soundSource,
      options.name,
      options.legacySoundSettingsKey,
      options.settingsKey,
      options.legacyAnnouncementSettingsKey,
      options.announcementMessage,
      options.managesOwnEnablement
    );
    _AccessibilitySignal._signals.add(signal);
    return signal;
  }
  static get allAccessibilitySignals() {
    return [...this._signals];
  }
};
_AccessibilitySignal._signals = /* @__PURE__ */ new Set();
_AccessibilitySignal.errorAtPosition = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.positionHasError.name", "Error at Position"),
  sound: Sound.error,
  announcementMessage: localize("accessibility.signals.positionHasError", "Error"),
  settingsKey: "accessibility.signals.positionHasError",
  delaySettingsKey: "accessibility.signalOptions.delays.errorAtPosition"
});
_AccessibilitySignal.warningAtPosition = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.positionHasWarning.name", "Warning at Position"),
  sound: Sound.warning,
  announcementMessage: localize("accessibility.signals.positionHasWarning", "Warning"),
  settingsKey: "accessibility.signals.positionHasWarning",
  delaySettingsKey: "accessibility.signalOptions.delays.warningAtPosition"
});
_AccessibilitySignal.errorOnLine = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasError.name", "Error on Line"),
  sound: Sound.error,
  legacySoundSettingsKey: "audioCues.lineHasError",
  legacyAnnouncementSettingsKey: "accessibility.alert.error",
  announcementMessage: localize("accessibility.signals.lineHasError", "Error on Line"),
  settingsKey: "accessibility.signals.lineHasError"
});
_AccessibilitySignal.warningOnLine = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasWarning.name", "Warning on Line"),
  sound: Sound.warning,
  legacySoundSettingsKey: "audioCues.lineHasWarning",
  legacyAnnouncementSettingsKey: "accessibility.alert.warning",
  announcementMessage: localize("accessibility.signals.lineHasWarning", "Warning on Line"),
  settingsKey: "accessibility.signals.lineHasWarning"
});
_AccessibilitySignal.foldedArea = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasFoldedArea.name", "Folded Area on Line"),
  sound: Sound.foldedArea,
  legacySoundSettingsKey: "audioCues.lineHasFoldedArea",
  legacyAnnouncementSettingsKey: "accessibility.alert.foldedArea",
  announcementMessage: localize("accessibility.signals.lineHasFoldedArea", "Folded"),
  settingsKey: "accessibility.signals.lineHasFoldedArea"
});
_AccessibilitySignal.break = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasBreakpoint.name", "Breakpoint on Line"),
  sound: Sound.break,
  legacySoundSettingsKey: "audioCues.lineHasBreakpoint",
  legacyAnnouncementSettingsKey: "accessibility.alert.breakpoint",
  announcementMessage: localize("accessibility.signals.lineHasBreakpoint", "Breakpoint"),
  settingsKey: "accessibility.signals.lineHasBreakpoint"
});
_AccessibilitySignal.inlineSuggestion = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.lineHasInlineSuggestion.name", "Inline Suggestion on Line"),
  sound: Sound.quickFixes,
  legacySoundSettingsKey: "audioCues.lineHasInlineSuggestion",
  settingsKey: "accessibility.signals.lineHasInlineSuggestion"
});
_AccessibilitySignal.nextEditSuggestion = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.nextEditSuggestion.name", "Next Edit Suggestion on Line"),
  sound: Sound.nextEditSuggestion,
  legacySoundSettingsKey: "audioCues.nextEditSuggestion",
  settingsKey: "accessibility.signals.nextEditSuggestion",
  announcementMessage: localize("accessibility.signals.nextEditSuggestion", "Next Edit Suggestion")
});
_AccessibilitySignal.terminalQuickFix = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalQuickFix.name", "Terminal Quick Fix"),
  sound: Sound.quickFixes,
  legacySoundSettingsKey: "audioCues.terminalQuickFix",
  legacyAnnouncementSettingsKey: "accessibility.alert.terminalQuickFix",
  announcementMessage: localize("accessibility.signals.terminalQuickFix", "Quick Fix"),
  settingsKey: "accessibility.signals.terminalQuickFix"
});
_AccessibilitySignal.onDebugBreak = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.onDebugBreak.name", "Debugger Stopped on Breakpoint"),
  sound: Sound.break,
  legacySoundSettingsKey: "audioCues.onDebugBreak",
  legacyAnnouncementSettingsKey: "accessibility.alert.onDebugBreak",
  announcementMessage: localize("accessibility.signals.onDebugBreak", "Breakpoint"),
  settingsKey: "accessibility.signals.onDebugBreak"
});
_AccessibilitySignal.noInlayHints = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.noInlayHints", "No Inlay Hints on Line"),
  sound: Sound.error,
  legacySoundSettingsKey: "audioCues.noInlayHints",
  legacyAnnouncementSettingsKey: "accessibility.alert.noInlayHints",
  announcementMessage: localize("accessibility.signals.noInlayHints", "No Inlay Hints"),
  settingsKey: "accessibility.signals.noInlayHints"
});
_AccessibilitySignal.taskCompleted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.taskCompleted", "Task Completed"),
  sound: Sound.taskCompleted,
  legacySoundSettingsKey: "audioCues.taskCompleted",
  legacyAnnouncementSettingsKey: "accessibility.alert.taskCompleted",
  announcementMessage: localize("accessibility.signals.taskCompleted", "Task Completed"),
  settingsKey: "accessibility.signals.taskCompleted"
});
_AccessibilitySignal.taskFailed = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.taskFailed", "Task Failed"),
  sound: Sound.taskFailed,
  legacySoundSettingsKey: "audioCues.taskFailed",
  legacyAnnouncementSettingsKey: "accessibility.alert.taskFailed",
  announcementMessage: localize("accessibility.signals.taskFailed", "Task Failed"),
  settingsKey: "accessibility.signals.taskFailed"
});
_AccessibilitySignal.terminalCommandFailed = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalCommandFailed", "Terminal Command Failed"),
  sound: Sound.error,
  legacySoundSettingsKey: "audioCues.terminalCommandFailed",
  legacyAnnouncementSettingsKey: "accessibility.alert.terminalCommandFailed",
  announcementMessage: localize("accessibility.signals.terminalCommandFailed", "Command Failed"),
  settingsKey: "accessibility.signals.terminalCommandFailed"
});
_AccessibilitySignal.terminalCommandSucceeded = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalCommandSucceeded", "Terminal Command Succeeded"),
  sound: Sound.terminalCommandSucceeded,
  announcementMessage: localize("accessibility.signals.terminalCommandSucceeded", "Command Succeeded"),
  settingsKey: "accessibility.signals.terminalCommandSucceeded"
});
_AccessibilitySignal.terminalBell = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.terminalBell", "Terminal Bell"),
  sound: Sound.terminalBell,
  legacySoundSettingsKey: "audioCues.terminalBell",
  legacyAnnouncementSettingsKey: "accessibility.alert.terminalBell",
  announcementMessage: localize("accessibility.signals.terminalBell", "Terminal Bell"),
  settingsKey: "accessibility.signals.terminalBell"
});
_AccessibilitySignal.notebookCellCompleted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.notebookCellCompleted", "Notebook Cell Completed"),
  sound: Sound.taskCompleted,
  legacySoundSettingsKey: "audioCues.notebookCellCompleted",
  legacyAnnouncementSettingsKey: "accessibility.alert.notebookCellCompleted",
  announcementMessage: localize("accessibility.signals.notebookCellCompleted", "Notebook Cell Completed"),
  settingsKey: "accessibility.signals.notebookCellCompleted"
});
_AccessibilitySignal.notebookCellFailed = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.notebookCellFailed", "Notebook Cell Failed"),
  sound: Sound.taskFailed,
  legacySoundSettingsKey: "audioCues.notebookCellFailed",
  legacyAnnouncementSettingsKey: "accessibility.alert.notebookCellFailed",
  announcementMessage: localize("accessibility.signals.notebookCellFailed", "Notebook Cell Failed"),
  settingsKey: "accessibility.signals.notebookCellFailed"
});
_AccessibilitySignal.diffLineInserted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.diffLineInserted", "Diff Line Inserted"),
  sound: Sound.diffLineInserted,
  legacySoundSettingsKey: "audioCues.diffLineInserted",
  settingsKey: "accessibility.signals.diffLineInserted"
});
_AccessibilitySignal.diffLineDeleted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.diffLineDeleted", "Diff Line Deleted"),
  sound: Sound.diffLineDeleted,
  legacySoundSettingsKey: "audioCues.diffLineDeleted",
  settingsKey: "accessibility.signals.diffLineDeleted"
});
_AccessibilitySignal.diffLineModified = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.diffLineModified", "Diff Line Modified"),
  sound: Sound.diffLineModified,
  legacySoundSettingsKey: "audioCues.diffLineModified",
  settingsKey: "accessibility.signals.diffLineModified"
});
_AccessibilitySignal.chatEditModifiedFile = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatEditModifiedFile", "Chat Edit Modified File"),
  sound: Sound.chatEditModifiedFile,
  announcementMessage: localize("accessibility.signals.chatEditModifiedFile", "File Modified from Chat Edits"),
  settingsKey: "accessibility.signals.chatEditModifiedFile"
});
_AccessibilitySignal.chatRequestSent = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatRequestSent", "Chat Request Sent"),
  sound: Sound.requestSent,
  legacySoundSettingsKey: "audioCues.chatRequestSent",
  legacyAnnouncementSettingsKey: "accessibility.alert.chatRequestSent",
  announcementMessage: localize("accessibility.signals.chatRequestSent", "Chat Request Sent"),
  settingsKey: "accessibility.signals.chatRequestSent"
});
_AccessibilitySignal.chatResponseReceived = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatResponseReceived", "Chat Response Received"),
  legacySoundSettingsKey: "audioCues.chatResponseReceived",
  sound: {
    randomOneOf: [
      Sound.responseReceived1,
      Sound.responseReceived2,
      Sound.responseReceived3,
      Sound.responseReceived4
    ]
  },
  settingsKey: "accessibility.signals.chatResponseReceived"
});
_AccessibilitySignal.codeActionTriggered = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.codeActionRequestTriggered", "Code Action Request Triggered"),
  sound: Sound.codeActionTriggered,
  legacySoundSettingsKey: "audioCues.codeActionRequestTriggered",
  legacyAnnouncementSettingsKey: "accessibility.alert.codeActionRequestTriggered",
  announcementMessage: localize("accessibility.signals.codeActionRequestTriggered", "Code Action Request Triggered"),
  settingsKey: "accessibility.signals.codeActionTriggered"
});
_AccessibilitySignal.codeActionApplied = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.codeActionApplied", "Code Action Applied"),
  legacySoundSettingsKey: "audioCues.codeActionApplied",
  sound: Sound.codeActionApplied,
  settingsKey: "accessibility.signals.codeActionApplied"
});
_AccessibilitySignal.progress = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.progress", "Progress"),
  sound: Sound.progress,
  legacySoundSettingsKey: "audioCues.chatResponsePending",
  legacyAnnouncementSettingsKey: "accessibility.alert.progress",
  announcementMessage: localize("accessibility.signals.progress", "Progress"),
  settingsKey: "accessibility.signals.progress"
});
_AccessibilitySignal.clear = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.clear", "Clear"),
  sound: Sound.clear,
  legacySoundSettingsKey: "audioCues.clear",
  legacyAnnouncementSettingsKey: "accessibility.alert.clear",
  announcementMessage: localize("accessibility.signals.clear", "Clear"),
  settingsKey: "accessibility.signals.clear"
});
_AccessibilitySignal.save = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.save", "Save"),
  sound: Sound.save,
  legacySoundSettingsKey: "audioCues.save",
  legacyAnnouncementSettingsKey: "accessibility.alert.save",
  announcementMessage: localize("accessibility.signals.save", "Save"),
  settingsKey: "accessibility.signals.save"
});
_AccessibilitySignal.format = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.format", "Format"),
  sound: Sound.format,
  legacySoundSettingsKey: "audioCues.format",
  legacyAnnouncementSettingsKey: "accessibility.alert.format",
  announcementMessage: localize("accessibility.signals.format", "Format"),
  settingsKey: "accessibility.signals.format"
});
_AccessibilitySignal.voiceRecordingStarted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceRecordingStarted", "Voice Recording Started"),
  sound: Sound.voiceRecordingStarted,
  legacySoundSettingsKey: "audioCues.voiceRecordingStarted",
  settingsKey: "accessibility.signals.voiceRecordingStarted"
});
_AccessibilitySignal.voiceModeStarted = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceModeStarted", "Voice Mode Started"),
  sound: Sound.voiceRecordingStarted,
  announcementMessage: localize("accessibility.signals.voiceModeStarted", "Voice Mode Started"),
  settingsKey: "accessibility.signals.voiceModeStarted"
});
_AccessibilitySignal.voiceRecordingStopped = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceRecordingStopped", "Voice Recording Stopped"),
  sound: Sound.voiceRecordingStopped,
  legacySoundSettingsKey: "audioCues.voiceRecordingStopped",
  settingsKey: "accessibility.signals.voiceRecordingStopped"
});
_AccessibilitySignal.voiceModeStopped = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.voiceModeStopped", "Voice Mode Stopped"),
  sound: Sound.voiceRecordingStopped,
  announcementMessage: localize("accessibility.signals.voiceModeStopped", "Voice Mode Stopped"),
  settingsKey: "accessibility.signals.voiceModeStopped"
});
_AccessibilitySignal.editsKept = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.editsKept", "Edits Kept"),
  sound: Sound.editsKept,
  announcementMessage: localize("accessibility.signals.editsKept", "Edits Kept"),
  settingsKey: "accessibility.signals.editsKept"
});
_AccessibilitySignal.editsUndone = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.editsUndone", "Undo Edits"),
  sound: Sound.editsUndone,
  announcementMessage: localize("accessibility.signals.editsUndone", "Edits Undone"),
  settingsKey: "accessibility.signals.editsUndone"
});
_AccessibilitySignal.chatUserActionRequired = _AccessibilitySignal.register({
  name: localize("accessibilitySignals.chatUserActionRequired", "Chat User Action Required"),
  sound: Sound.chatUserActionRequired,
  announcementMessage: localize("accessibility.signals.chatUserActionRequired", "Chat User Action Required"),
  settingsKey: "accessibility.signals.chatUserActionRequired"
});
let AccessibilitySignal = _AccessibilitySignal;
export {
  AccessibilitySignal,
  AccessibilitySignalService,
  AcknowledgeDocCommentsToken,
  IAccessibilitySignalService,
  Sound,
  SoundSource
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHlTaWduYWwvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ2FjaGVkRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYWNoZS5qcyc7XG5pbXBvcnQgeyBnZXRTdHJ1Y3R1cmFsS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IEV2ZW50LCBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZGVyaXZlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCwgVmFsdWVXaXRoQ2hhbmdlRXZlbnRGcm9tT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlPignYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHBsYXlTaWduYWwoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBvcHRpb25zPzogSUFjY2Vzc2JpbGl0eVNpZ25hbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xuXHRwbGF5U2lnbmFscyhzaWduYWxzOiAoQWNjZXNzaWJpbGl0eVNpZ25hbCB8IHsgc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsOyBzb3VyY2U6IHN0cmluZyB9KVtdKTogUHJvbWlzZTx2b2lkPjtcblx0cGxheVNpZ25hbExvb3Aoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBtaWxsaXNlY29uZHM6IG51bWJlcik6IElEaXNwb3NhYmxlO1xuXG5cdGdldEVuYWJsZWRTdGF0ZShzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwsIHVzZXJHZXN0dXJlOiBib29sZWFuLCBtb2RhbGl0eT86IEFjY2Vzc2liaWxpdHlNb2RhbGl0eSB8IHVuZGVmaW5lZCk6IElWYWx1ZVdpdGhDaGFuZ2VFdmVudDxib29sZWFuPjtcblx0Z2V0RGVsYXlNcyhzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwsIG1vZGFsaXR5OiBBY2Nlc3NpYmlsaXR5TW9kYWxpdHksIG1vZGU6ICdsaW5lJyB8ICdwb3NpdGlvbmFsJyk6IG51bWJlcjtcblx0LyoqXG5cdCAqIEF2b2lkIHRoaXMgbWV0aG9kIGFuZCBwcmVmZXIgYC5wbGF5U2lnbmFsYCFcblx0ICogT25seSB1c2UgaXQgd2hlbiB5b3Ugd2FudCB0byBwbGF5IHRoZSBzb3VuZCByZWdhcmRsZXNzIG9mIGVuYWJsZW1lbnQsIGUuZy4gaW4gdGhlIHNldHRpbmdzIHF1aWNrIHBpY2suXG5cdCAqL1xuXHRwbGF5U291bmQoc2lnbmFsOiBTb3VuZCwgYWxsb3dNYW55SW5QYXJhbGxlbDogYm9vbGVhbiwgdG9rZW46IHR5cGVvZiBBY2tub3dsZWRnZURvY0NvbW1lbnRzVG9rZW4pOiBQcm9taXNlPHZvaWQ+O1xuXG5cdC8qKiBAZGVwcmVjYXRlZCBVc2UgZ2V0RW5hYmxlZFN0YXRlKC4uLikub25DaGFuZ2UgKi9cblx0aXNTb3VuZEVuYWJsZWQoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsKTogYm9vbGVhbjtcblx0LyoqIEBkZXByZWNhdGVkIFVzZSBnZXRFbmFibGVkU3RhdGUoLi4uKS52YWx1ZSAqL1xuXHRpc0Fubm91bmNlbWVudEVuYWJsZWQoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsKTogYm9vbGVhbjtcblx0LyoqIEBkZXByZWNhdGVkIFVzZSBnZXRFbmFibGVkU3RhdGUoLi4uKS5vbkNoYW5nZSAqL1xuXHRvblNvdW5kRW5hYmxlZENoYW5nZWQoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsKTogRXZlbnQ8dm9pZD47XG59XG5cbi8qKiBNYWtlIHN1cmUgeW91IHVuZGVyc3RhbmQgdGhlIGRvYyBjb21tZW50cyBvZiB0aGUgbWV0aG9kIHlvdSB3YW50IHRvIGNhbGwgd2hlbiB1c2luZyB0aGlzIHRva2VuISAqL1xuZXhwb3J0IGNvbnN0IEFja25vd2xlZGdlRG9jQ29tbWVudHNUb2tlbiA9IFN5bWJvbCgnQWNrbm93bGVkZ2VEb2NDb21tZW50c1Rva2VuJyk7XG5cbmV4cG9ydCB0eXBlIEFjY2Vzc2liaWxpdHlNb2RhbGl0eSA9ICdzb3VuZCcgfCAnYW5ub3VuY2VtZW50JztcblxuZXhwb3J0IGludGVyZmFjZSBJQWNjZXNzYmlsaXR5U2lnbmFsT3B0aW9ucyB7XG5cdGFsbG93TWFueUluUGFyYWxsZWw/OiBib29sZWFuO1xuXG5cdG1vZGFsaXR5PzogQWNjZXNzaWJpbGl0eU1vZGFsaXR5O1xuXG5cdC8qKlxuXHQgKiBUaGUgc291cmNlIHRoYXQgdHJpZ2dlcmVkIHRoZSBzaWduYWwgKGUuZy4gXCJkaWZmRWRpdG9yLmN1cnNvclBvc2l0aW9uQ2hhbmdlZFwiKS5cblx0ICovXG5cdHNvdXJjZT86IHN0cmluZztcblxuXHQvKipcblx0ICogRm9yIGFjdGlvbnMgbGlrZSBzYXZlIG9yIGZvcm1hdCwgZGVwZW5kaW5nIG9uIHRoZVxuXHQgKiBjb25maWd1cmVkIHZhbHVlLCB3ZSB3aWxsIG9ubHlcblx0ICogcGxheSB0aGUgc291bmQgaWYgdGhlIHVzZXIgdHJpZ2dlcmVkIHRoZSBhY3Rpb24uXG5cdCAqL1xuXHR1c2VyR2VzdHVyZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBjdXN0b20gbWVzc2FnZSB0byBhbGVydCB3aXRoLlxuXHQgKiBUaGlzIHdpbGwgb3ZlcnJpZGUgdGhlIGRlZmF1bHQgYW5ub3VuY2VtZW50IG1lc3NhZ2UuXG5cdCAqL1xuXHRjdXN0b21BbGVydE1lc3NhZ2U/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgc291bmRzOiBNYXA8c3RyaW5nLCBIVE1MQXVkaW9FbGVtZW50Pjtcblx0cHJpdmF0ZSByZWFkb25seSBzY3JlZW5SZWFkZXJBdHRhY2hlZDtcblx0cHJpdmF0ZSByZWFkb25seSBzZW50VGVsZW1ldHJ5O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuc291bmRzID0gbmV3IE1hcCgpO1xuXHRcdHRoaXMuc2NyZWVuUmVhZGVyQXR0YWNoZWQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsXG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkLFxuXHRcdFx0KCkgPT4gLyoqIEBkZXNjcmlwdGlvbiBhY2Nlc3NpYmlsaXR5U2VydmljZS5vbkRpZENoYW5nZVNjcmVlblJlYWRlck9wdGltaXplZCAqLyB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKClcblx0XHQpO1xuXHRcdHRoaXMuc2VudFRlbGVtZXRyeSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMucGxheWluZ1NvdW5kcyA9IG5ldyBTZXQ8U291bmQ+KCk7XG5cdFx0dGhpcy5fc2lnbmFsQ29uZmlnVmFsdWUgPSBuZXcgQ2FjaGVkRnVuY3Rpb24oKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCkgPT4gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlPHtcblx0XHRcdHNvdW5kOiBFbmFibGVkU3RhdGU7XG5cdFx0XHRhbm5vdW5jZW1lbnQ6IEVuYWJsZWRTdGF0ZTtcblx0XHR9PihzaWduYWwuc2V0dGluZ3NLZXksIHsgc291bmQ6ICdvZmYnLCBhbm5vdW5jZW1lbnQ6ICdvZmYnIH0sIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9zaWduYWxFbmFibGVkU3RhdGUgPSBuZXcgQ2FjaGVkRnVuY3Rpb24oXG5cdFx0XHR7IGdldENhY2hlS2V5OiBnZXRTdHJ1Y3R1cmFsS2V5IH0sXG5cdFx0XHQoYXJnOiB7IHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbDsgdXNlckdlc3R1cmU6IGJvb2xlYW47IG1vZGFsaXR5PzogQWNjZXNzaWJpbGl0eU1vZGFsaXR5IHwgdW5kZWZpbmVkIH0pID0+IHtcblx0XHRcdFx0cmV0dXJuIGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHNvdW5kIGVuYWJsZWQgKi9cblx0XHRcdFx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5fc2lnbmFsQ29uZmlnVmFsdWUuZ2V0KGFyZy5zaWduYWwpLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0XHRcdGlmIChhcmcubW9kYWxpdHkgPT09ICdzb3VuZCcgfHwgYXJnLm1vZGFsaXR5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGlmIChhcmcuc2lnbmFsLm1hbmFnZXNPd25FbmFibGVtZW50IHx8IGNoZWNrRW5hYmxlZFN0YXRlKHNldHRpbmcuc291bmQsICgpID0+IHRoaXMuc2NyZWVuUmVhZGVyQXR0YWNoZWQucmVhZChyZWFkZXIpLCBhcmcudXNlckdlc3R1cmUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoYXJnLm1vZGFsaXR5ID09PSAnYW5ub3VuY2VtZW50JyB8fCBhcmcubW9kYWxpdHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0aWYgKGNoZWNrRW5hYmxlZFN0YXRlKHNldHRpbmcuYW5ub3VuY2VtZW50LCAoKSA9PiB0aGlzLnNjcmVlblJlYWRlckF0dGFjaGVkLnJlYWQocmVhZGVyKSwgYXJnLnVzZXJHZXN0dXJlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmFibGVkU3RhdGUoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCB1c2VyR2VzdHVyZTogYm9vbGVhbiwgbW9kYWxpdHk/OiBBY2Nlc3NpYmlsaXR5TW9kYWxpdHkgfCB1bmRlZmluZWQpOiBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQ8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBuZXcgVmFsdWVXaXRoQ2hhbmdlRXZlbnRGcm9tT2JzZXJ2YWJsZSh0aGlzLl9zaWduYWxFbmFibGVkU3RhdGUuZ2V0KHsgc2lnbmFsLCB1c2VyR2VzdHVyZSwgbW9kYWxpdHkgfSkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHBsYXlTaWduYWwoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBvcHRpb25zOiBJQWNjZXNzYmlsaXR5U2lnbmFsT3B0aW9ucyA9IHt9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2hvdWxkUGxheUFubm91bmNlbWVudCA9IG9wdGlvbnMubW9kYWxpdHkgPT09ICdhbm5vdW5jZW1lbnQnIHx8IG9wdGlvbnMubW9kYWxpdHkgPT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhbm5vdW5jZW1lbnRNZXNzYWdlID0gb3B0aW9ucy5jdXN0b21BbGVydE1lc3NhZ2UgPz8gc2lnbmFsLmFubm91bmNlbWVudE1lc3NhZ2U7XG5cdFx0aWYgKHNob3VsZFBsYXlBbm5vdW5jZW1lbnQgJiYgdGhpcy5pc0Fubm91bmNlbWVudEVuYWJsZWQoc2lnbmFsLCBvcHRpb25zLnVzZXJHZXN0dXJlKSAmJiBhbm5vdW5jZW1lbnRNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLnN0YXR1cyhhbm5vdW5jZW1lbnRNZXNzYWdlKTtcblx0XHR9XG5cblx0XHRjb25zdCBzaG91bGRQbGF5U291bmQgPSBvcHRpb25zLm1vZGFsaXR5ID09PSAnc291bmQnIHx8IG9wdGlvbnMubW9kYWxpdHkgPT09IHVuZGVmaW5lZDtcblx0XHRpZiAoc2hvdWxkUGxheVNvdW5kICYmIHRoaXMuaXNTb3VuZEVuYWJsZWQoc2lnbmFsLCBvcHRpb25zLnVzZXJHZXN0dXJlKSkge1xuXHRcdFx0dGhpcy5zZW5kU2lnbmFsVGVsZW1ldHJ5KHNpZ25hbCwgb3B0aW9ucy5zb3VyY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5wbGF5U291bmQoc2lnbmFsLnNvdW5kLmdldFNvdW5kKCksIG9wdGlvbnMuYWxsb3dNYW55SW5QYXJhbGxlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIHBsYXlTaWduYWxzKHNpZ25hbHM6IChBY2Nlc3NpYmlsaXR5U2lnbmFsIHwgeyBzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWw7IHNvdXJjZTogc3RyaW5nIH0pW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHNpZ25hbCBvZiBzaWduYWxzKSB7XG5cdFx0XHR0aGlzLnNlbmRTaWduYWxUZWxlbWV0cnkoJ3NpZ25hbCcgaW4gc2lnbmFsID8gc2lnbmFsLnNpZ25hbCA6IHNpZ25hbCwgJ3NvdXJjZScgaW4gc2lnbmFsID8gc2lnbmFsLnNvdXJjZSA6IHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNpZ25hbEFycmF5ID0gc2lnbmFscy5tYXAocyA9PiAnc2lnbmFsJyBpbiBzID8gcy5zaWduYWwgOiBzKTtcblx0XHRjb25zdCBhbm5vdW5jZW1lbnRzID0gc2lnbmFsQXJyYXkuZmlsdGVyKHNpZ25hbCA9PiB0aGlzLmlzQW5ub3VuY2VtZW50RW5hYmxlZChzaWduYWwpKS5tYXAocyA9PiBzLmFubm91bmNlbWVudE1lc3NhZ2UpO1xuXHRcdGlmIChhbm5vdW5jZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5zdGF0dXMoYW5ub3VuY2VtZW50cy5qb2luKCcsICcpKTtcblx0XHR9XG5cblx0XHQvLyBTb21lIHNvdW5kcyBhcmUgcmV1c2VkLiBEb24ndCBwbGF5IHRoZSBzYW1lIHNvdW5kIHR3aWNlLlxuXHRcdGNvbnN0IHNvdW5kcyA9IG5ldyBTZXQoc2lnbmFsQXJyYXkuZmlsdGVyKHNpZ25hbCA9PiB0aGlzLmlzU291bmRFbmFibGVkKHNpZ25hbCkpLm1hcChzaWduYWwgPT4gc2lnbmFsLnNvdW5kLmdldFNvdW5kKCkpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKHNvdW5kcykubWFwKHNvdW5kID0+IHRoaXMucGxheVNvdW5kKHNvdW5kLCB0cnVlKSkpO1xuXG5cdH1cblxuXG5cdHByaXZhdGUgc2VuZFNpZ25hbFRlbGVtZXRyeShzaWduYWw6IEFjY2Vzc2liaWxpdHlTaWduYWwsIHNvdXJjZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQgPSB0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCk7XG5cdFx0Y29uc3Qga2V5ID0gc2lnbmFsLm5hbWUgKyAoc291cmNlID8gYDo6JHtzb3VyY2V9YCA6ICcnKSArIChpc1NjcmVlblJlYWRlck9wdGltaXplZCA/ICd7c2NyZWVuUmVhZGVyT3B0aW1pemVkfScgOiAnJyk7XG5cdFx0Ly8gT25seSBzZW5kIG9uY2UgcGVyIHVzZXIgc2Vzc2lvblxuXHRcdGlmICh0aGlzLnNlbnRUZWxlbWV0cnkuaGFzKGtleSkgfHwgdGhpcy5nZXRWb2x1bWVJblBlcmNlbnQoKSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNlbnRUZWxlbWV0cnkuYWRkKGtleSk7XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjx7XG5cdFx0XHRzaWduYWw6IHN0cmluZztcblx0XHRcdHNvdXJjZTogc3RyaW5nO1xuXHRcdFx0aXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQ6IGJvb2xlYW47XG5cdFx0fSwge1xuXHRcdFx0b3duZXI6ICdoZWRpZXQnO1xuXG5cdFx0XHRzaWduYWw6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc2lnbmFsIHRoYXQgd2FzIHBsYXllZC4nIH07XG5cdFx0XHRzb3VyY2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgc291cmNlIHRoYXQgdHJpZ2dlcmVkIHRoZSBzaWduYWwgKGUuZy4gXCJkaWZmRWRpdG9yTmF2aWdhdGlvblwiKS4nIH07XG5cdFx0XHRpc1NjcmVlblJlYWRlck9wdGltaXplZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doZXRoZXIgdGhlIHVzZXIgaXMgdXNpbmcgYSBzY3JlZW4gcmVhZGVyJyB9O1xuXG5cdFx0XHRjb21tZW50OiAnVGhpcyBkYXRhIGlzIGNvbGxlY3RlZCB0byB1bmRlcnN0YW5kIGhvdyBzaWduYWxzIGFyZSB1c2VkIGFuZCBpZiBtb3JlIHNpZ25hbHMgc2hvdWxkIGJlIGFkZGVkLic7XG5cdFx0fT4oJ3NpZ25hbC5wbGF5ZWQnLCB7XG5cdFx0XHRzaWduYWw6IHNpZ25hbC5uYW1lLFxuXHRcdFx0c291cmNlOiBzb3VyY2UgPz8gJycsXG5cdFx0XHRpc1NjcmVlblJlYWRlck9wdGltaXplZCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vm9sdW1lSW5QZXJjZW50KCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgdm9sdW1lID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMudm9sdW1lJyk7XG5cdFx0aWYgKHR5cGVvZiB2b2x1bWUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gNTA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE1hdGgubWF4KE1hdGgubWluKHZvbHVtZSwgMTAwKSwgMCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHBsYXlpbmdTb3VuZHM7XG5cblx0cHVibGljIGFzeW5jIHBsYXlTb3VuZChzb3VuZDogU291bmQsIGFsbG93TWFueUluUGFyYWxsZWwgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghYWxsb3dNYW55SW5QYXJhbGxlbCAmJiB0aGlzLnBsYXlpbmdTb3VuZHMuaGFzKHNvdW5kKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnBsYXlpbmdTb3VuZHMuYWRkKHNvdW5kKTtcblx0XHRjb25zdCB1cmwgPSBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShgdnMvcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL21lZGlhLyR7c291bmQuZmlsZU5hbWV9YCkudG9TdHJpbmcodHJ1ZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc291bmQgPSB0aGlzLnNvdW5kcy5nZXQodXJsKTtcblx0XHRcdGlmIChzb3VuZCkge1xuXHRcdFx0XHRzb3VuZC52b2x1bWUgPSB0aGlzLmdldFZvbHVtZUluUGVyY2VudCgpIC8gMTAwO1xuXHRcdFx0XHRzb3VuZC5jdXJyZW50VGltZSA9IDA7XG5cdFx0XHRcdGF3YWl0IHNvdW5kLnBsYXkoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHBsYXllZFNvdW5kID0gYXdhaXQgcGxheUF1ZGlvKHVybCwgdGhpcy5nZXRWb2x1bWVJblBlcmNlbnQoKSAvIDEwMCk7XG5cdFx0XHRcdHRoaXMuc291bmRzLnNldCh1cmwsIHBsYXllZFNvdW5kKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAoIWUubWVzc2FnZS5pbmNsdWRlcygncGxheSgpIGNhbiBvbmx5IGJlIGluaXRpYXRlZCBieSBhIHVzZXIgZ2VzdHVyZScpKSB7XG5cdFx0XHRcdC8vIHRyYWNraW5nIHRoaXMgaXNzdWUgaW4gIzE3ODY0Miwgbm8gbmVlZCB0byBzcGFtIHRoZSBjb25zb2xlXG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHdoaWxlIHBsYXlpbmcgc291bmQnLCBlKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5wbGF5aW5nU291bmRzLmRlbGV0ZShzb3VuZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHBsYXlTaWduYWxMb29wKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgbWlsbGlzZWNvbmRzOiBudW1iZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0bGV0IHBsYXlpbmcgPSB0cnVlO1xuXHRcdGNvbnN0IHBsYXlTb3VuZCA9ICgpID0+IHtcblx0XHRcdGlmIChwbGF5aW5nKSB7XG5cdFx0XHRcdHRoaXMucGxheVNpZ25hbChzaWduYWwsIHsgYWxsb3dNYW55SW5QYXJhbGxlbDogdHJ1ZSB9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChwbGF5aW5nKSB7XG5cdFx0XHRcdFx0XHRcdHBsYXlTb3VuZCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIG1pbGxpc2Vjb25kcyk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0cGxheVNvdW5kKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiBwbGF5aW5nID0gZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2lnbmFsQ29uZmlnVmFsdWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2lnbmFsRW5hYmxlZFN0YXRlO1xuXG5cdHB1YmxpYyBpc0Fubm91bmNlbWVudEVuYWJsZWQoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsLCB1c2VyR2VzdHVyZT86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAoIXNpZ25hbC5hbm5vdW5jZW1lbnRNZXNzYWdlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zaWduYWxFbmFibGVkU3RhdGUuZ2V0KHsgc2lnbmFsLCB1c2VyR2VzdHVyZTogISF1c2VyR2VzdHVyZSwgbW9kYWxpdHk6ICdhbm5vdW5jZW1lbnQnIH0pLmdldCgpO1xuXHR9XG5cblx0cHVibGljIGlzU291bmRFbmFibGVkKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgdXNlckdlc3R1cmU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpZ25hbEVuYWJsZWRTdGF0ZS5nZXQoeyBzaWduYWwsIHVzZXJHZXN0dXJlOiAhIXVzZXJHZXN0dXJlLCBtb2RhbGl0eTogJ3NvdW5kJyB9KS5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBvblNvdW5kRW5hYmxlZENoYW5nZWQoc2lnbmFsOiBBY2Nlc3NpYmlsaXR5U2lnbmFsKTogRXZlbnQ8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmdldEVuYWJsZWRTdGF0ZShzaWduYWwsIGZhbHNlKS5vbkRpZENoYW5nZTtcblx0fVxuXG5cdHB1YmxpYyBnZXREZWxheU1zKHNpZ25hbDogQWNjZXNzaWJpbGl0eVNpZ25hbCwgbW9kYWxpdHk6IEFjY2Vzc2liaWxpdHlNb2RhbGl0eSwgbW9kZTogJ2xpbmUnIHwgJ3Bvc2l0aW9uYWwnKTogbnVtYmVyIHtcblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcycpKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0bGV0IHZhbHVlOiB7IHNvdW5kOiBudW1iZXI7IGFubm91bmNlbWVudDogbnVtYmVyIH07XG5cdFx0aWYgKHNpZ25hbC5uYW1lID09PSBBY2Nlc3NpYmlsaXR5U2lnbmFsLmVycm9yQXRQb3NpdGlvbi5uYW1lICYmIG1vZGUgPT09ICdwb3NpdGlvbmFsJykge1xuXHRcdFx0dmFsdWUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZXhwZXJpbWVudGFsLmRlbGF5cy5lcnJvckF0UG9zaXRpb24nKTtcblx0XHR9IGVsc2UgaWYgKHNpZ25hbC5uYW1lID09PSBBY2Nlc3NpYmlsaXR5U2lnbmFsLndhcm5pbmdBdFBvc2l0aW9uLm5hbWUgJiYgbW9kZSA9PT0gJ3Bvc2l0aW9uYWwnKSB7XG5cdFx0XHR2YWx1ZSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLndhcm5pbmdBdFBvc2l0aW9uJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbHVlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmV4cGVyaW1lbnRhbC5kZWxheXMuZ2VuZXJhbCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kYWxpdHkgPT09ICdzb3VuZCcgPyB2YWx1ZS5zb3VuZCA6IHZhbHVlLmFubm91bmNlbWVudDtcblx0fVxufVxuXG50eXBlIEVuYWJsZWRTdGF0ZSA9ICdvbicgfCAnb2ZmJyB8ICdhdXRvJyB8ICd1c2VyR2VzdHVyZScgfCAnYWx3YXlzJyB8ICduZXZlcic7XG5mdW5jdGlvbiBjaGVja0VuYWJsZWRTdGF0ZShzdGF0ZTogRW5hYmxlZFN0YXRlLCBnZXRTY3JlZW5SZWFkZXJBdHRhY2hlZDogKCkgPT4gYm9vbGVhbiwgaXNUcmlnZ2VyZWRCeVVzZXJHZXN0dXJlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiBzdGF0ZSA9PT0gJ29uJyB8fCBzdGF0ZSA9PT0gJ2Fsd2F5cycgfHwgKHN0YXRlID09PSAnYXV0bycgJiYgZ2V0U2NyZWVuUmVhZGVyQXR0YWNoZWQoKSkgfHwgc3RhdGUgPT09ICd1c2VyR2VzdHVyZScgJiYgaXNUcmlnZ2VyZWRCeVVzZXJHZXN0dXJlO1xufVxuXG4vKipcbiAqIFBsYXkgdGhlIGdpdmVuIGF1ZGlvIHVybC5cbiAqIEB2b2x1bWUgdmFsdWUgYmV0d2VlbiAwIGFuZCAxXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHBsYXlBdWRpbyh1cmw6IHN0cmluZywgdm9sdW1lOiBudW1iZXIpOiBQcm9taXNlPEhUTUxBdWRpb0VsZW1lbnQ+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGF3YWl0IGRvUGxheUF1ZGlvKHVybCwgdm9sdW1lLCBkaXNwb3NhYmxlcyk7XG5cdH0gZmluYWxseSB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGRvUGxheUF1ZGlvKHVybDogc3RyaW5nLCB2b2x1bWU6IG51bWJlciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8SFRNTEF1ZGlvRWxlbWVudD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8SFRNTEF1ZGlvRWxlbWVudD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IGF1ZGlvID0gbmV3IEF1ZGlvKHVybCk7XG5cdFx0YXVkaW8udm9sdW1lID0gdm9sdW1lO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYXVkaW8sICdlbmRlZCcsICgpID0+IHtcblx0XHRcdHJlc29sdmUoYXVkaW8pO1xuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGF1ZGlvLCAnZXJyb3InLCAoZSkgPT4ge1xuXHRcdFx0Ly8gV2hlbiB0aGUgZXJyb3IgZXZlbnQgZmlyZXMsIGVuZGVkIG1pZ2h0IG5vdCBiZSBjYWxsZWRcblx0XHRcdHJlamVjdChlLmVycm9yKTtcblx0XHR9KSk7XG5cdFx0YXVkaW8ucGxheSgpLmNhdGNoKGUgPT4ge1xuXHRcdFx0Ly8gV2hlbiBwbGF5IGZhaWxzLCB0aGUgZXJyb3IgZXZlbnQgaXMgbm90IGZpcmVkLlxuXHRcdFx0cmVqZWN0KGUpO1xuXHRcdH0pO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBDb3JyZXNwb25kcyB0byB0aGUgYXVkaW8gZmlsZXMgaW4gLi9tZWRpYS5cbiovXG5leHBvcnQgY2xhc3MgU291bmQge1xuXHRwcml2YXRlIHN0YXRpYyByZWdpc3RlcihvcHRpb25zOiB7IGZpbGVOYW1lOiBzdHJpbmcgfSk6IFNvdW5kIHtcblx0XHRjb25zdCBzb3VuZCA9IG5ldyBTb3VuZChvcHRpb25zLmZpbGVOYW1lKTtcblx0XHRyZXR1cm4gc291bmQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGVycm9yID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2Vycm9yLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgd2FybmluZyA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICd3YXJuaW5nLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgc3VjY2VzcyA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdzdWNjZXNzLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZm9sZGVkQXJlYSA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdmb2xkZWRBcmVhcy5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGJyZWFrID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2JyZWFrLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgcXVpY2tGaXhlcyA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdxdWlja0ZpeGVzLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGFza0NvbXBsZXRlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICd0YXNrQ29tcGxldGVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGFza0ZhaWxlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICd0YXNrRmFpbGVkLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGVybWluYWxCZWxsID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ3Rlcm1pbmFsQmVsbC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRpZmZMaW5lSW5zZXJ0ZWQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnZGlmZkxpbmVJbnNlcnRlZC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRpZmZMaW5lRGVsZXRlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdkaWZmTGluZURlbGV0ZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBkaWZmTGluZU1vZGlmaWVkID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2RpZmZMaW5lTW9kaWZpZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSByZXF1ZXN0U2VudCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdyZXF1ZXN0U2VudC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHJlc3BvbnNlUmVjZWl2ZWQxID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ3Jlc3BvbnNlUmVjZWl2ZWQxLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgcmVzcG9uc2VSZWNlaXZlZDIgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAncmVzcG9uc2VSZWNlaXZlZDIubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSByZXNwb25zZVJlY2VpdmVkMyA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdyZXNwb25zZVJlY2VpdmVkMy5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHJlc3BvbnNlUmVjZWl2ZWQ0ID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ3Jlc3BvbnNlUmVjZWl2ZWQ0Lm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY2xlYXIgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnY2xlYXIubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBzYXZlID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ3NhdmUubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBmb3JtYXQgPSBTb3VuZC5yZWdpc3Rlcih7IGZpbGVOYW1lOiAnZm9ybWF0Lm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdm9pY2VSZWNvcmRpbmdTdGFydGVkID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ3ZvaWNlUmVjb3JkaW5nU3RhcnRlZC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHZvaWNlUmVjb3JkaW5nU3RvcHBlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICd2b2ljZVJlY29yZGluZ1N0b3BwZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBwcm9ncmVzcyA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdwcm9ncmVzcy5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNoYXRFZGl0TW9kaWZpZWRGaWxlID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2NoYXRFZGl0TW9kaWZpZWRGaWxlLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZWRpdHNLZXB0ID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2VkaXRzS2VwdC5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGVkaXRzVW5kb25lID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2VkaXRzVW5kb25lLm1wMycgfSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgbmV4dEVkaXRTdWdnZXN0aW9uID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ25leHRFZGl0U3VnZ2VzdGlvbi5tcDMnIH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRlcm1pbmFsQ29tbWFuZFN1Y2NlZWRlZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICd0ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjaGF0VXNlckFjdGlvblJlcXVpcmVkID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2NoYXRVc2VyQWN0aW9uUmVxdWlyZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjb2RlQWN0aW9uVHJpZ2dlcmVkID0gU291bmQucmVnaXN0ZXIoeyBmaWxlTmFtZTogJ2NvZGVBY3Rpb25UcmlnZ2VyZWQubXAzJyB9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjb2RlQWN0aW9uQXBwbGllZCA9IFNvdW5kLnJlZ2lzdGVyKHsgZmlsZU5hbWU6ICdjb2RlQWN0aW9uQXBwbGllZC5tcDMnIH0pO1xuXG5cdHByaXZhdGUgY29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGZpbGVOYW1lOiBzdHJpbmcpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgU291bmRTb3VyY2Uge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmFuZG9tT25lT2Y6IFNvdW5kW11cblx0KSB7IH1cblxuXHRwdWJsaWMgZ2V0U291bmQoZGV0ZXJtaW5pc3RpYyA9IGZhbHNlKTogU291bmQge1xuXHRcdGlmIChkZXRlcm1pbmlzdGljIHx8IHRoaXMucmFuZG9tT25lT2YubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yYW5kb21PbmVPZlswXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0aGlzLnJhbmRvbU9uZU9mLmxlbmd0aCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5yYW5kb21PbmVPZltpbmRleF07XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBY2Nlc3NpYmlsaXR5U2lnbmFsIHtcblx0cHJpdmF0ZSBjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc291bmQ6IFNvdW5kU291cmNlLFxuXHRcdHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2V0dGluZ3NLZXk6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgYW5ub3VuY2VtZW50TWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyByZWFkb25seSBtYW5hZ2VzT3duRW5hYmxlbWVudDogYm9vbGVhbiA9IGZhbHNlXG5cdCkgeyB9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3NpZ25hbHMgPSBuZXcgU2V0PEFjY2Vzc2liaWxpdHlTaWduYWw+KCk7XG5cdHByaXZhdGUgc3RhdGljIHJlZ2lzdGVyKG9wdGlvbnM6IHtcblx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0c291bmQ6IFNvdW5kIHwge1xuXHRcdFx0LyoqXG5cdFx0XHQgKiBHYW1pbmcgYW5kIG90aGVyIGFwcHMgb2Z0ZW4gcGxheSBhIHNvdW5kIHZhcmlhbnQgd2hlbiB0aGUgc2FtZSBldmVudCBoYXBwZW5zIGFnYWluXG5cdFx0XHQgKiBmb3IgYW4gaW1wcm92ZWQgZXhwZXJpZW5jZS4gVGhpcyBvcHRpb24gZW5hYmxlcyBwbGF5aW5nIGEgcmFuZG9tIHNvdW5kLlxuXHRcdFx0ICovXG5cdFx0XHRyYW5kb21PbmVPZjogU291bmRbXTtcblx0XHR9O1xuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk/OiBzdHJpbmc7XG5cdFx0c2V0dGluZ3NLZXk6IHN0cmluZztcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleT86IHN0cmluZztcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlPzogc3RyaW5nO1xuXHRcdGRlbGF5U2V0dGluZ3NLZXk/OiBzdHJpbmc7XG5cdFx0bWFuYWdlc093bkVuYWJsZW1lbnQ/OiBib29sZWFuO1xuXHR9KTogQWNjZXNzaWJpbGl0eVNpZ25hbCB7XG5cdFx0Y29uc3Qgc291bmRTb3VyY2UgPSBuZXcgU291bmRTb3VyY2UoJ3JhbmRvbU9uZU9mJyBpbiBvcHRpb25zLnNvdW5kID8gb3B0aW9ucy5zb3VuZC5yYW5kb21PbmVPZiA6IFtvcHRpb25zLnNvdW5kXSk7XG5cdFx0Y29uc3Qgc2lnbmFsID0gbmV3IEFjY2Vzc2liaWxpdHlTaWduYWwoXG5cdFx0XHRzb3VuZFNvdXJjZSxcblx0XHRcdG9wdGlvbnMubmFtZSxcblx0XHRcdG9wdGlvbnMubGVnYWN5U291bmRTZXR0aW5nc0tleSxcblx0XHRcdG9wdGlvbnMuc2V0dGluZ3NLZXksXG5cdFx0XHRvcHRpb25zLmxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5LFxuXHRcdFx0b3B0aW9ucy5hbm5vdW5jZW1lbnRNZXNzYWdlLFxuXHRcdFx0b3B0aW9ucy5tYW5hZ2VzT3duRW5hYmxlbWVudFxuXHRcdCk7XG5cdFx0QWNjZXNzaWJpbGl0eVNpZ25hbC5fc2lnbmFscy5hZGQoc2lnbmFsKTtcblx0XHRyZXR1cm4gc2lnbmFsO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXQgYWxsQWNjZXNzaWJpbGl0eVNpZ25hbHMoKSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zaWduYWxzXTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZXJyb3JBdFBvc2l0aW9uID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnBvc2l0aW9uSGFzRXJyb3IubmFtZScsICdFcnJvciBhdCBQb3NpdGlvbicpLFxuXHRcdHNvdW5kOiBTb3VuZC5lcnJvcixcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzRXJyb3InLCAnRXJyb3InKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc0Vycm9yJyxcblx0XHRkZWxheVNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlbGF5cy5lcnJvckF0UG9zaXRpb24nXG5cdH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHdhcm5pbmdBdFBvc2l0aW9uID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnBvc2l0aW9uSGFzV2FybmluZy5uYW1lJywgJ1dhcm5pbmcgYXQgUG9zaXRpb24nKSxcblx0XHRzb3VuZDogU291bmQud2FybmluZyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzV2FybmluZycsICdXYXJuaW5nJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucG9zaXRpb25IYXNXYXJuaW5nJyxcblx0XHRkZWxheVNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlbGF5cy53YXJuaW5nQXRQb3NpdGlvbidcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlcnJvck9uTGluZSA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5saW5lSGFzRXJyb3IubmFtZScsICdFcnJvciBvbiBMaW5lJyksXG5cdFx0c291bmQ6IFNvdW5kLmVycm9yLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMubGluZUhhc0Vycm9yJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQuZXJyb3InLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0Vycm9yJywgJ0Vycm9yIG9uIExpbmUnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzRXJyb3InLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHdhcm5pbmdPbkxpbmUgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMubGluZUhhc1dhcm5pbmcubmFtZScsICdXYXJuaW5nIG9uIExpbmUnKSxcblx0XHRzb3VuZDogU291bmQud2FybmluZyxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmxpbmVIYXNXYXJuaW5nJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQud2FybmluZycsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzV2FybmluZycsICdXYXJuaW5nIG9uIExpbmUnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzV2FybmluZycsXG5cdH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGZvbGRlZEFyZWEgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMubGluZUhhc0ZvbGRlZEFyZWEubmFtZScsICdGb2xkZWQgQXJlYSBvbiBMaW5lJyksXG5cdFx0c291bmQ6IFNvdW5kLmZvbGRlZEFyZWEsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5saW5lSGFzRm9sZGVkQXJlYScsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LmZvbGRlZEFyZWEnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0ZvbGRlZEFyZWEnLCAnRm9sZGVkJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0ZvbGRlZEFyZWEnLFxuXHR9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBicmVhayA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5saW5lSGFzQnJlYWtwb2ludC5uYW1lJywgJ0JyZWFrcG9pbnQgb24gTGluZScpLFxuXHRcdHNvdW5kOiBTb3VuZC5icmVhayxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmxpbmVIYXNCcmVha3BvaW50Jyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQuYnJlYWtwb2ludCcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzQnJlYWtwb2ludCcsICdCcmVha3BvaW50JyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0JyZWFrcG9pbnQnLFxuXHR9KTtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBpbmxpbmVTdWdnZXN0aW9uID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmxpbmVIYXNJbmxpbmVTdWdnZXN0aW9uLm5hbWUnLCAnSW5saW5lIFN1Z2dlc3Rpb24gb24gTGluZScpLFxuXHRcdHNvdW5kOiBTb3VuZC5xdWlja0ZpeGVzLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMubGluZUhhc0lubGluZVN1Z2dlc3Rpb24nLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNJbmxpbmVTdWdnZXN0aW9uJyxcblx0fSk7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgbmV4dEVkaXRTdWdnZXN0aW9uID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLm5leHRFZGl0U3VnZ2VzdGlvbi5uYW1lJywgJ05leHQgRWRpdCBTdWdnZXN0aW9uIG9uIExpbmUnKSxcblx0XHRzb3VuZDogU291bmQubmV4dEVkaXRTdWdnZXN0aW9uLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMubmV4dEVkaXRTdWdnZXN0aW9uJyxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5uZXh0RWRpdFN1Z2dlc3Rpb24nLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubmV4dEVkaXRTdWdnZXN0aW9uJywgJ05leHQgRWRpdCBTdWdnZXN0aW9uJyksXG5cdH0pO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRlcm1pbmFsUXVpY2tGaXggPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMudGVybWluYWxRdWlja0ZpeC5uYW1lJywgJ1Rlcm1pbmFsIFF1aWNrIEZpeCcpLFxuXHRcdHNvdW5kOiBTb3VuZC5xdWlja0ZpeGVzLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMudGVybWluYWxRdWlja0ZpeCcsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LnRlcm1pbmFsUXVpY2tGaXgnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxRdWlja0ZpeCcsICdRdWljayBGaXgnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbFF1aWNrRml4Jyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBvbkRlYnVnQnJlYWsgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMub25EZWJ1Z0JyZWFrLm5hbWUnLCAnRGVidWdnZXIgU3RvcHBlZCBvbiBCcmVha3BvaW50JyksXG5cdFx0c291bmQ6IFNvdW5kLmJyZWFrLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMub25EZWJ1Z0JyZWFrJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQub25EZWJ1Z0JyZWFrJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm9uRGVidWdCcmVhaycsICdCcmVha3BvaW50JyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMub25EZWJ1Z0JyZWFrJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBub0lubGF5SGludHMgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMubm9JbmxheUhpbnRzJywgJ05vIElubGF5IEhpbnRzIG9uIExpbmUnKSxcblx0XHRzb3VuZDogU291bmQuZXJyb3IsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5ub0lubGF5SGludHMnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC5ub0lubGF5SGludHMnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm9JbmxheUhpbnRzJywgJ05vIElubGF5IEhpbnRzJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm9JbmxheUhpbnRzJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0YXNrQ29tcGxldGVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnRhc2tDb21wbGV0ZWQnLCAnVGFzayBDb21wbGV0ZWQnKSxcblx0XHRzb3VuZDogU291bmQudGFza0NvbXBsZXRlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLnRhc2tDb21wbGV0ZWQnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC50YXNrQ29tcGxldGVkJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRhc2tDb21wbGV0ZWQnLCAnVGFzayBDb21wbGV0ZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrQ29tcGxldGVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0YXNrRmFpbGVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnRhc2tGYWlsZWQnLCAnVGFzayBGYWlsZWQnKSxcblx0XHRzb3VuZDogU291bmQudGFza0ZhaWxlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLnRhc2tGYWlsZWQnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC50YXNrRmFpbGVkJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRhc2tGYWlsZWQnLCAnVGFzayBGYWlsZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrRmFpbGVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB0ZXJtaW5hbENvbW1hbmRGYWlsZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMudGVybWluYWxDb21tYW5kRmFpbGVkJywgJ1Rlcm1pbmFsIENvbW1hbmQgRmFpbGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLmVycm9yLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMudGVybWluYWxDb21tYW5kRmFpbGVkJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQudGVybWluYWxDb21tYW5kRmFpbGVkJyxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZEZhaWxlZCcsICdDb21tYW5kIEZhaWxlZCcpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZEZhaWxlZCcsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdGVybWluYWxDb21tYW5kU3VjY2VlZGVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnRlcm1pbmFsQ29tbWFuZFN1Y2NlZWRlZCcsICdUZXJtaW5hbCBDb21tYW5kIFN1Y2NlZWRlZCcpLFxuXHRcdHNvdW5kOiBTb3VuZC50ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQnLCAnQ29tbWFuZCBTdWNjZWVkZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHRlcm1pbmFsQmVsbCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy50ZXJtaW5hbEJlbGwnLCAnVGVybWluYWwgQmVsbCcpLFxuXHRcdHNvdW5kOiBTb3VuZC50ZXJtaW5hbEJlbGwsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy50ZXJtaW5hbEJlbGwnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC50ZXJtaW5hbEJlbGwnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxCZWxsJywgJ1Rlcm1pbmFsIEJlbGwnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbEJlbGwnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IG5vdGVib29rQ2VsbENvbXBsZXRlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5ub3RlYm9va0NlbGxDb21wbGV0ZWQnLCAnTm90ZWJvb2sgQ2VsbCBDb21wbGV0ZWQnKSxcblx0XHRzb3VuZDogU291bmQudGFza0NvbXBsZXRlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLm5vdGVib29rQ2VsbENvbXBsZXRlZCcsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0Lm5vdGVib29rQ2VsbENvbXBsZXRlZCcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxDb21wbGV0ZWQnLCAnTm90ZWJvb2sgQ2VsbCBDb21wbGV0ZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxDb21wbGV0ZWQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IG5vdGVib29rQ2VsbEZhaWxlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5ub3RlYm9va0NlbGxGYWlsZWQnLCAnTm90ZWJvb2sgQ2VsbCBGYWlsZWQnKSxcblx0XHRzb3VuZDogU291bmQudGFza0ZhaWxlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLm5vdGVib29rQ2VsbEZhaWxlZCcsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0Lm5vdGVib29rQ2VsbEZhaWxlZCcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxGYWlsZWQnLCAnTm90ZWJvb2sgQ2VsbCBGYWlsZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxGYWlsZWQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRpZmZMaW5lSW5zZXJ0ZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuZGlmZkxpbmVJbnNlcnRlZCcsICdEaWZmIExpbmUgSW5zZXJ0ZWQnKSxcblx0XHRzb3VuZDogU291bmQuZGlmZkxpbmVJbnNlcnRlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmRpZmZMaW5lSW5zZXJ0ZWQnLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRpZmZMaW5lSW5zZXJ0ZWQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRpZmZMaW5lRGVsZXRlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5kaWZmTGluZURlbGV0ZWQnLCAnRGlmZiBMaW5lIERlbGV0ZWQnKSxcblx0XHRzb3VuZDogU291bmQuZGlmZkxpbmVEZWxldGVkLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMuZGlmZkxpbmVEZWxldGVkJyxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZURlbGV0ZWQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGRpZmZMaW5lTW9kaWZpZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuZGlmZkxpbmVNb2RpZmllZCcsICdEaWZmIExpbmUgTW9kaWZpZWQnKSxcblx0XHRzb3VuZDogU291bmQuZGlmZkxpbmVNb2RpZmllZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmRpZmZMaW5lTW9kaWZpZWQnLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRpZmZMaW5lTW9kaWZpZWQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNoYXRFZGl0TW9kaWZpZWRGaWxlID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmNoYXRFZGl0TW9kaWZpZWRGaWxlJywgJ0NoYXQgRWRpdCBNb2RpZmllZCBGaWxlJyksXG5cdFx0c291bmQ6IFNvdW5kLmNoYXRFZGl0TW9kaWZpZWRGaWxlLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdEVkaXRNb2RpZmllZEZpbGUnLCAnRmlsZSBNb2RpZmllZCBmcm9tIENoYXQgRWRpdHMnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0RWRpdE1vZGlmaWVkRmlsZScsXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgY2hhdFJlcXVlc3RTZW50ID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmNoYXRSZXF1ZXN0U2VudCcsICdDaGF0IFJlcXVlc3QgU2VudCcpLFxuXHRcdHNvdW5kOiBTb3VuZC5yZXF1ZXN0U2VudCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmNoYXRSZXF1ZXN0U2VudCcsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LmNoYXRSZXF1ZXN0U2VudCcsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVxdWVzdFNlbnQnLCAnQ2hhdCBSZXF1ZXN0IFNlbnQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVxdWVzdFNlbnQnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNoYXRSZXNwb25zZVJlY2VpdmVkID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmNoYXRSZXNwb25zZVJlY2VpdmVkJywgJ0NoYXQgUmVzcG9uc2UgUmVjZWl2ZWQnKSxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmNoYXRSZXNwb25zZVJlY2VpdmVkJyxcblx0XHRzb3VuZDoge1xuXHRcdFx0cmFuZG9tT25lT2Y6IFtcblx0XHRcdFx0U291bmQucmVzcG9uc2VSZWNlaXZlZDEsXG5cdFx0XHRcdFNvdW5kLnJlc3BvbnNlUmVjZWl2ZWQyLFxuXHRcdFx0XHRTb3VuZC5yZXNwb25zZVJlY2VpdmVkMyxcblx0XHRcdFx0U291bmQucmVzcG9uc2VSZWNlaXZlZDRcblx0XHRcdF1cblx0XHR9LFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRSZXNwb25zZVJlY2VpdmVkJ1xuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNvZGVBY3Rpb25UcmlnZ2VyZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuY29kZUFjdGlvblJlcXVlc3RUcmlnZ2VyZWQnLCAnQ29kZSBBY3Rpb24gUmVxdWVzdCBUcmlnZ2VyZWQnKSxcblx0XHRzb3VuZDogU291bmQuY29kZUFjdGlvblRyaWdnZXJlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmNvZGVBY3Rpb25SZXF1ZXN0VHJpZ2dlcmVkJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQuY29kZUFjdGlvblJlcXVlc3RUcmlnZ2VyZWQnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY29kZUFjdGlvblJlcXVlc3RUcmlnZ2VyZWQnLCAnQ29kZSBBY3Rpb24gUmVxdWVzdCBUcmlnZ2VyZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jb2RlQWN0aW9uVHJpZ2dlcmVkJyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjb2RlQWN0aW9uQXBwbGllZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5jb2RlQWN0aW9uQXBwbGllZCcsICdDb2RlIEFjdGlvbiBBcHBsaWVkJyksXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5jb2RlQWN0aW9uQXBwbGllZCcsXG5cdFx0c291bmQ6IFNvdW5kLmNvZGVBY3Rpb25BcHBsaWVkLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNvZGVBY3Rpb25BcHBsaWVkJ1xuXHR9KTtcblxuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgcHJvZ3Jlc3MgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMucHJvZ3Jlc3MnLCAnUHJvZ3Jlc3MnKSxcblx0XHRzb3VuZDogU291bmQucHJvZ3Jlc3MsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5jaGF0UmVzcG9uc2VQZW5kaW5nJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQucHJvZ3Jlc3MnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucHJvZ3Jlc3MnLCAnUHJvZ3Jlc3MnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wcm9ncmVzcydcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBjbGVhciA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5jbGVhcicsICdDbGVhcicpLFxuXHRcdHNvdW5kOiBTb3VuZC5jbGVhcixcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLmNsZWFyJyxcblx0XHRsZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuYWxlcnQuY2xlYXInLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2xlYXInLCAnQ2xlYXInKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jbGVhcidcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBzYXZlID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLnNhdmUnLCAnU2F2ZScpLFxuXHRcdHNvdW5kOiBTb3VuZC5zYXZlLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMuc2F2ZScsXG5cdFx0bGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LmFsZXJ0LnNhdmUnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZScsICdTYXZlJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZSdcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBmb3JtYXQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuZm9ybWF0JywgJ0Zvcm1hdCcpLFxuXHRcdHNvdW5kOiBTb3VuZC5mb3JtYXQsXG5cdFx0bGVnYWN5U291bmRTZXR0aW5nc0tleTogJ2F1ZGlvQ3Vlcy5mb3JtYXQnLFxuXHRcdGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5hbGVydC5mb3JtYXQnLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZm9ybWF0JywgJ0Zvcm1hdCcpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdCdcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSB2b2ljZVJlY29yZGluZ1N0YXJ0ZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMudm9pY2VSZWNvcmRpbmdTdGFydGVkJywgJ1ZvaWNlIFJlY29yZGluZyBTdGFydGVkJyksXG5cdFx0c291bmQ6IFNvdW5kLnZvaWNlUmVjb3JkaW5nU3RhcnRlZCxcblx0XHRsZWdhY3lTb3VuZFNldHRpbmdzS2V5OiAnYXVkaW9DdWVzLnZvaWNlUmVjb3JkaW5nU3RhcnRlZCcsXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VSZWNvcmRpbmdTdGFydGVkJ1xuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHZvaWNlTW9kZVN0YXJ0ZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMudm9pY2VNb2RlU3RhcnRlZCcsICdWb2ljZSBNb2RlIFN0YXJ0ZWQnKSxcblx0XHRzb3VuZDogU291bmQudm9pY2VSZWNvcmRpbmdTdGFydGVkLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RhcnRlZCcsICdWb2ljZSBNb2RlIFN0YXJ0ZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZU1vZGVTdGFydGVkJ1xuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IHZvaWNlUmVjb3JkaW5nU3RvcHBlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy52b2ljZVJlY29yZGluZ1N0b3BwZWQnLCAnVm9pY2UgUmVjb3JkaW5nIFN0b3BwZWQnKSxcblx0XHRzb3VuZDogU291bmQudm9pY2VSZWNvcmRpbmdTdG9wcGVkLFxuXHRcdGxlZ2FjeVNvdW5kU2V0dGluZ3NLZXk6ICdhdWRpb0N1ZXMudm9pY2VSZWNvcmRpbmdTdG9wcGVkJyxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZVJlY29yZGluZ1N0b3BwZWQnXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgdm9pY2VNb2RlU3RvcHBlZCA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy52b2ljZU1vZGVTdG9wcGVkJywgJ1ZvaWNlIE1vZGUgU3RvcHBlZCcpLFxuXHRcdHNvdW5kOiBTb3VuZC52b2ljZVJlY29yZGluZ1N0b3BwZWQsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZU1vZGVTdG9wcGVkJywgJ1ZvaWNlIE1vZGUgU3RvcHBlZCcpLFxuXHRcdHNldHRpbmdzS2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlTW9kZVN0b3BwZWQnXG5cdH0pO1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZWRpdHNLZXB0ID0gQWNjZXNzaWJpbGl0eVNpZ25hbC5yZWdpc3Rlcih7XG5cdFx0bmFtZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTaWduYWxzLmVkaXRzS2VwdCcsICdFZGl0cyBLZXB0JyksXG5cdFx0c291bmQ6IFNvdW5kLmVkaXRzS2VwdCxcblx0XHRhbm5vdW5jZW1lbnRNZXNzYWdlOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzS2VwdCcsICdFZGl0cyBLZXB0JyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNLZXB0Jyxcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlZGl0c1VuZG9uZSA9IEFjY2Vzc2liaWxpdHlTaWduYWwucmVnaXN0ZXIoe1xuXHRcdG5hbWU6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5U2lnbmFscy5lZGl0c1VuZG9uZScsICdVbmRvIEVkaXRzJyksXG5cdFx0c291bmQ6IFNvdW5kLmVkaXRzVW5kb25lLFxuXHRcdGFubm91bmNlbWVudE1lc3NhZ2U6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNVbmRvbmUnLCAnRWRpdHMgVW5kb25lJyksXG5cdFx0c2V0dGluZ3NLZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNVbmRvbmUnLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IGNoYXRVc2VyQWN0aW9uUmVxdWlyZWQgPSBBY2Nlc3NpYmlsaXR5U2lnbmFsLnJlZ2lzdGVyKHtcblx0XHRuYW1lOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCcsICdDaGF0IFVzZXIgQWN0aW9uIFJlcXVpcmVkJyksXG5cdFx0c291bmQ6IFNvdW5kLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQsXG5cdFx0YW5ub3VuY2VtZW50TWVzc2FnZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0VXNlckFjdGlvblJlcXVpcmVkJywgJ0NoYXQgVXNlciBBY3Rpb24gUmVxdWlyZWQnKSxcblx0XHRzZXR0aW5nc0tleTogJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0VXNlckFjdGlvblJlcXVpcmVkJ1xuXHR9KTtcbn1cbiJdLAog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
