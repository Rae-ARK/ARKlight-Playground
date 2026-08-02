import * as arrays from "../../../base/common/arrays.js";
import { IntervalTimer, TimeoutTimer } from "../../../base/common/async.js";
import { illegalState } from "../../../base/common/errors.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { IME } from "../../../base/common/ime.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import * as nls from "../../../nls.js";
import { ResultKind, NoMatchingKb } from "./keybindingResolver.js";
const HIGH_FREQ_COMMANDS = /^(cursor|delete|undo|redo|tab|editor\.action\.clipboard)/;
function isKeyInComposition(e) {
  return e.keyCode === KeyCode.KEY_IN_COMPOSITION;
}
class AbstractKeybindingService extends Disposable {
  constructor(_contextKeyService, _commandService, _telemetryService, _notificationService, _logService) {
    super();
    this._contextKeyService = _contextKeyService;
    this._commandService = _commandService;
    this._telemetryService = _telemetryService;
    this._notificationService = _notificationService;
    this._logService = _logService;
    this._onDidUpdateKeybindings = this._register(new Emitter());
    this._currentChords = [];
    this._currentChordChecker = new IntervalTimer();
    this._currentChordStatusMessage = null;
    this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
    this._currentSingleModifier = null;
    this._currentSingleModifierClearTimeout = new TimeoutTimer();
    this._currentlyDispatchingCommandId = null;
    this._logging = false;
  }
  get onDidUpdateKeybindings() {
    return this._onDidUpdateKeybindings ? this._onDidUpdateKeybindings.event : Event.None;
  }
  get inChordMode() {
    return this._currentChords.length > 0;
  }
  getDefaultKeybindingsContent() {
    return "";
  }
  toggleLogging() {
    this._logging = !this._logging;
    return this._logging;
  }
  _log(str) {
    if (this._logging) {
      this._logService.info(`[KeybindingService]: ${str}`);
    }
  }
  getDefaultKeybindings() {
    return this._getResolver().getDefaultKeybindings();
  }
  getKeybindings() {
    return this._getResolver().getKeybindings();
  }
  customKeybindingsCount() {
    return 0;
  }
  lookupKeybindings(commandId) {
    return arrays.coalesce(
      this._getResolver().lookupKeybindings(commandId).map((item) => item.resolvedKeybinding)
    );
  }
  lookupKeybinding(commandId, context, enforceContextCheck = false) {
    const result = this._getResolver().lookupPrimaryKeybinding(commandId, context || this._contextKeyService, enforceContextCheck);
    if (!result) {
      return void 0;
    }
    return result.resolvedKeybinding;
  }
  dispatchEvent(e, target) {
    return this._dispatch(e, target);
  }
  // TODO@ulugbekna: update namings to align with `_doDispatch`
  // TODO@ulugbekna: this fn doesn't seem to take into account single-modifier keybindings, eg `shift shift`
  softDispatch(e, target) {
    this._log(`/ Soft dispatching keyboard event`);
    if (isKeyInComposition(e)) {
      this._log(`\\ Keyboard event is part of an IME composition`);
      return NoMatchingKb;
    }
    const keybinding = this.resolveKeyboardEvent(e);
    if (keybinding.hasMultipleChords()) {
      console.warn("keyboard event should not be mapped to multiple chords");
      return NoMatchingKb;
    }
    const [firstChord] = keybinding.getDispatchChords();
    if (firstChord === null) {
      this._log(`\\ Keyboard event cannot be dispatched`);
      return NoMatchingKb;
    }
    const contextValue = this._contextKeyService.getContext(target);
    const currentChords = this._currentChords.map((({ keypress }) => keypress));
    return this._getResolver().resolve(contextValue, currentChords, firstChord);
  }
  _scheduleLeaveChordMode() {
    const chordLastInteractedTime = Date.now();
    this._currentChordChecker.cancelAndSet(() => {
      if (!this._documentHasFocus()) {
        this._leaveChordMode();
        return;
      }
      if (Date.now() - chordLastInteractedTime > 5e3) {
        this._leaveChordMode();
      }
    }, 500);
  }
  _expectAnotherChord(firstChord, keypressLabel) {
    this._currentChords.push({ keypress: firstChord, label: keypressLabel });
    switch (this._currentChords.length) {
      case 0:
        throw illegalState("impossible");
      case 1:
        this._currentChordStatusMessage = this._notificationService.status(nls.localize("first.chord", "({0}) was pressed. Waiting for second key of chord...", keypressLabel));
        break;
      default: {
        const fullKeypressLabel = this._currentChords.map(({ label }) => label).join(", ");
        this._currentChordStatusMessage = this._notificationService.status(nls.localize("next.chord", "({0}) was pressed. Waiting for next key of chord...", fullKeypressLabel));
      }
    }
    this._scheduleLeaveChordMode();
    if (IME.enabled) {
      IME.disable();
    }
  }
  _leaveChordMode() {
    if (this._currentChordStatusMessage) {
      this._currentChordStatusMessage.close();
      this._currentChordStatusMessage = null;
    }
    this._currentChordChecker.cancel();
    this._currentChords = [];
    IME.enable();
  }
  dispatchByUserSettingsLabel(userSettingsLabel, target) {
    this._log(`/ Dispatching keybinding triggered via menu entry accelerator - ${userSettingsLabel}`);
    const keybindings = this.resolveUserBinding(userSettingsLabel);
    if (keybindings.length === 0) {
      this._log(`\\ Could not resolve - ${userSettingsLabel}`);
    } else {
      this._doDispatch(
        keybindings[0],
        target,
        /*isSingleModiferChord*/
        false
      );
    }
  }
  _dispatch(e, target) {
    if (isKeyInComposition(e)) {
      this._log(`+ Ignoring keybinding dispatch because an IME composition is in progress.`);
      return false;
    }
    return this._doDispatch(
      this.resolveKeyboardEvent(e),
      target,
      /*isSingleModiferChord*/
      false
    );
  }
  _singleModifierDispatch(e, target) {
    if (isKeyInComposition(e)) {
      return false;
    }
    const keybinding = this.resolveKeyboardEvent(e);
    const [singleModifier] = keybinding.getSingleModifierDispatchChords();
    if (singleModifier) {
      if (this._ignoreSingleModifiers.has(singleModifier)) {
        this._log(`+ Ignoring single modifier ${singleModifier} due to it being pressed together with other keys.`);
        this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
        this._currentSingleModifierClearTimeout.cancel();
        this._currentSingleModifier = null;
        return false;
      }
      this._ignoreSingleModifiers = KeybindingModifierSet.EMPTY;
      if (this._currentSingleModifier === null) {
        this._log(`+ Storing single modifier for possible chord ${singleModifier}.`);
        this._currentSingleModifier = singleModifier;
        this._currentSingleModifierClearTimeout.cancelAndSet(() => {
          this._log(`+ Clearing single modifier due to 300ms elapsed.`);
          this._currentSingleModifier = null;
        }, 300);
        return false;
      }
      if (singleModifier === this._currentSingleModifier) {
        this._log(`/ Dispatching single modifier chord ${singleModifier} ${singleModifier}`);
        this._currentSingleModifierClearTimeout.cancel();
        this._currentSingleModifier = null;
        return this._doDispatch(
          keybinding,
          target,
          /*isSingleModiferChord*/
          true
        );
      }
      this._log(`+ Clearing single modifier due to modifier mismatch: ${this._currentSingleModifier} ${singleModifier}`);
      this._currentSingleModifierClearTimeout.cancel();
      this._currentSingleModifier = null;
      return false;
    }
    const [firstChord] = keybinding.getChords();
    this._ignoreSingleModifiers = new KeybindingModifierSet(firstChord);
    if (this._currentSingleModifier !== null) {
      this._log(`+ Clearing single modifier due to other key up.`);
    }
    this._currentSingleModifierClearTimeout.cancel();
    this._currentSingleModifier = null;
    return false;
  }
  _doDispatch(userKeypress, target, isSingleModiferChord = false) {
    let shouldPreventDefault = false;
    if (userKeypress.hasMultipleChords()) {
      console.warn("Unexpected keyboard event mapped to multiple chords");
      return false;
    }
    let userPressedChord = null;
    let currentChords = null;
    if (isSingleModiferChord) {
      const [dispatchKeyname] = userKeypress.getSingleModifierDispatchChords();
      userPressedChord = dispatchKeyname;
      currentChords = dispatchKeyname ? [dispatchKeyname] : [];
    } else {
      [userPressedChord] = userKeypress.getDispatchChords();
      currentChords = this._currentChords.map(({ keypress }) => keypress);
    }
    if (userPressedChord === null) {
      this._log(`\\ Keyboard event cannot be dispatched in keydown phase.`);
      return shouldPreventDefault;
    }
    const contextValue = this._contextKeyService.getContext(target);
    const keypressLabel = userKeypress.getLabel();
    const resolveResult = this._getResolver().resolve(contextValue, currentChords, userPressedChord);
    switch (resolveResult.kind) {
      case ResultKind.NoMatchingKb: {
        this._logService.trace("KeybindingService#dispatch", keypressLabel, `[ No matching keybinding ]`);
        if (this.inChordMode) {
          const currentChordsLabel = this._currentChords.map(({ label }) => label).join(", ");
          this._log(`+ Leaving multi-chord mode: Nothing bound to "${currentChordsLabel}, ${keypressLabel}".`);
          this._notificationService.status(nls.localize("missing.chord", "The key combination ({0}, {1}) is not a command.", currentChordsLabel, keypressLabel), {
            hideAfter: 10 * 1e3
            /* 10s */
          });
          this._leaveChordMode();
          shouldPreventDefault = true;
        }
        return shouldPreventDefault;
      }
      case ResultKind.MoreChordsNeeded: {
        this._logService.trace("KeybindingService#dispatch", keypressLabel, `[ Several keybindings match - more chords needed ]`);
        shouldPreventDefault = true;
        this._expectAnotherChord(userPressedChord, keypressLabel);
        this._log(this._currentChords.length === 1 ? `+ Entering multi-chord mode...` : `+ Continuing multi-chord mode...`);
        return shouldPreventDefault;
      }
      case ResultKind.KbFound: {
        this._logService.trace("KeybindingService#dispatch", keypressLabel, `[ Will dispatch command ${resolveResult.commandId} ]`);
        if (resolveResult.commandId === null || resolveResult.commandId === "") {
          if (this.inChordMode) {
            const currentChordsLabel = this._currentChords.map(({ label }) => label).join(", ");
            this._log(`+ Leaving chord mode: Nothing bound to "${currentChordsLabel}, ${keypressLabel}".`);
            this._notificationService.status(nls.localize("missing.chord", "The key combination ({0}, {1}) is not a command.", currentChordsLabel, keypressLabel), {
              hideAfter: 10 * 1e3
              /* 10s */
            });
            this._leaveChordMode();
            shouldPreventDefault = true;
          }
        } else {
          if (this.inChordMode) {
            this._leaveChordMode();
          }
          if (!resolveResult.isBubble) {
            shouldPreventDefault = true;
          }
          this._log(`+ Invoking command ${resolveResult.commandId}.`);
          this._currentlyDispatchingCommandId = resolveResult.commandId;
          try {
            if (typeof resolveResult.commandArgs === "undefined") {
              this._commandService.executeCommand(resolveResult.commandId).then(void 0, (err) => this._notificationService.warn(err));
            } else {
              this._commandService.executeCommand(resolveResult.commandId, resolveResult.commandArgs).then(void 0, (err) => this._notificationService.warn(err));
            }
          } finally {
            this._currentlyDispatchingCommandId = null;
          }
          if (!HIGH_FREQ_COMMANDS.test(resolveResult.commandId)) {
            this._telemetryService.publicLog2("workbenchActionExecuted", { id: resolveResult.commandId, from: "keybinding", detail: userKeypress.getUserSettingsLabel() ?? void 0 });
          }
        }
        return shouldPreventDefault;
      }
    }
  }
  mightProducePrintableCharacter(event) {
    if (event.ctrlKey || event.metaKey) {
      return false;
    }
    if (event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ || event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9) {
      return true;
    }
    return false;
  }
  appendKeybinding(label, commandId, context, enforceContextCheck) {
    if (commandId) {
      const keybindingLabel = this.lookupKeybinding(commandId, context, enforceContextCheck)?.getLabel();
      if (keybindingLabel) {
        return nls.localize(
          { key: "keybindingLabel", comment: ["UI element label", "A keybinding label"] },
          "{0} ({1})",
          label,
          keybindingLabel
        );
      }
    }
    return label;
  }
}
const _KeybindingModifierSet = class _KeybindingModifierSet {
  constructor(source) {
    this._ctrlKey = source ? source.ctrlKey : false;
    this._shiftKey = source ? source.shiftKey : false;
    this._altKey = source ? source.altKey : false;
    this._metaKey = source ? source.metaKey : false;
  }
  has(modifier) {
    switch (modifier) {
      case "ctrl":
        return this._ctrlKey;
      case "shift":
        return this._shiftKey;
      case "alt":
        return this._altKey;
      case "meta":
        return this._metaKey;
    }
  }
};
_KeybindingModifierSet.EMPTY = new _KeybindingModifierSet(null);
let KeybindingModifierSet = _KeybindingModifierSet;
export {
  AbstractKeybindingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2Fic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IEludGVydmFsVGltZXIsIFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlsbGVnYWxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNRSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ltZS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZywgUmVzb2x2ZWRDaG9yZCwgUmVzb2x2ZWRLZXliaW5kaW5nLCBTaW5nbGVNb2RpZmllckNob3JkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5U2VydmljZVRhcmdldCB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlLCBJS2V5Ym9hcmRFdmVudCwgS2V5YmluZGluZ3NTY2hlbWFDb250cmlidXRpb24gfSBmcm9tICcuL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVzb2x1dGlvblJlc3VsdCwgS2V5YmluZGluZ1Jlc29sdmVyLCBSZXN1bHRLaW5kLCBOb01hdGNoaW5nS2IgfSBmcm9tICcuL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmdJdGVtIH0gZnJvbSAnLi9yZXNvbHZlZEtleWJpbmRpbmdJdGVtLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElTdGF0dXNIYW5kbGUgfSBmcm9tICcuLi8uLi9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcblxuaW50ZXJmYWNlIEN1cnJlbnRDaG9yZCB7XG5cdGtleXByZXNzOiBzdHJpbmc7XG5cdGxhYmVsOiBzdHJpbmcgfCBudWxsO1xufVxuXG5jb25zdCBISUdIX0ZSRVFfQ09NTUFORFMgPSAvXihjdXJzb3J8ZGVsZXRlfHVuZG98cmVkb3x0YWJ8ZWRpdG9yXFwuYWN0aW9uXFwuY2xpcGJvYXJkKS87XG5cbi8qKlxuICogV2hldGhlciB0aGUga2V5c3Ryb2tlIGJlbG9uZ3MgdG8gYW4gaW4tZmxpZ2h0IElNRSBjb21wb3NpdGlvbi4gYFN0YW5kYXJkS2V5Ym9hcmRFdmVudGAgbm9ybWFsaXplc1xuICogZXZlcnkgY29tcG9zaW5nIGtleXN0cm9rZSB0byB7QGxpbmsgS2V5Q29kZS5LRVlfSU5fQ09NUE9TSVRJT059LCBpbmNsdWRpbmcgdGhlIHBsYXRmb3JtL0lNRVxuICogY29tYmluYXRpb25zIHRoYXQgd291bGQgb3RoZXJ3aXNlIHJlcG9ydCB0aGUgcmVhbCBrZXkgY29kZSBmb3Iga2V5cyB0aGUgSU1FIG93bnMuXG4gKi9cbmZ1bmN0aW9uIGlzS2V5SW5Db21wb3NpdGlvbihlOiBJS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZS5rZXlDb2RlID09PSBLZXlDb2RlLktFWV9JTl9DT01QT1NJVElPTjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0S2V5YmluZGluZ1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUtleWJpbmRpbmdTZXJ2aWNlIHtcblxuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRVcGRhdGVLZXliaW5kaW5nczogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaWRVcGRhdGVLZXliaW5kaW5ncygpOiBFdmVudDx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkVXBkYXRlS2V5YmluZGluZ3MgPyB0aGlzLl9vbkRpZFVwZGF0ZUtleWJpbmRpbmdzLmV2ZW50IDogRXZlbnQuTm9uZTsgLy8gU2lub24gc3R1YmJpbmcgd2Fsa3MgcHJvcGVydGllcyBvbiBwcm90b3R5cGVcblx0fVxuXG5cdC8qKiByZWNlbnRseSByZWNvcmRlZCBrZXlwcmVzc2VzIHRoYXQgY2FuIHRyaWdnZXIgYSBrZXliaW5kaW5nO1xuXHQgKlxuXHQgKiBleGFtcGxlOiBzYXksIHRoZXJlJ3MgXCJjbWQrayBjbWQraVwiIGtleWJpbmRpbmc7XG5cdCAqIHRoZSB1c2VyIHByZXNzZWQgXCJjbWQra1wiIChiZWZvcmUgdGhleSBwcmVzcyBcImNtZCtpXCIpXG5cdCAqIFwiY21kK2tcIiB3b3VsZCBiZSBzdG9yZWQgaW4gdGhpcyBhcnJheSwgd2hlbiBvbiBwcmVzc2luZyBcImNtZCtpXCIsIHRoZSBzZXJ2aWNlXG5cdCAqIHdvdWxkIGludm9rZSB0aGUgY29tbWFuZCBib3VuZCBieSB0aGUga2V5YmluZGluZ1xuXHQgKi9cblx0cHJpdmF0ZSBfY3VycmVudENob3JkczogQ3VycmVudENob3JkW107XG5cblx0cHJpdmF0ZSBfY3VycmVudENob3JkQ2hlY2tlcjogSW50ZXJ2YWxUaW1lcjtcblx0cHJpdmF0ZSBfY3VycmVudENob3JkU3RhdHVzTWVzc2FnZTogSVN0YXR1c0hhbmRsZSB8IG51bGw7XG5cdHByaXZhdGUgX2lnbm9yZVNpbmdsZU1vZGlmaWVyczogS2V5YmluZGluZ01vZGlmaWVyU2V0O1xuXHRwcml2YXRlIF9jdXJyZW50U2luZ2xlTW9kaWZpZXI6IFNpbmdsZU1vZGlmaWVyQ2hvcmQgfCBudWxsO1xuXHRwcml2YXRlIF9jdXJyZW50U2luZ2xlTW9kaWZpZXJDbGVhclRpbWVvdXQ6IFRpbWVvdXRUaW1lcjtcblx0cHJvdGVjdGVkIF9jdXJyZW50bHlEaXNwYXRjaGluZ0NvbW1hbmRJZDogc3RyaW5nIHwgbnVsbDtcblxuXHRwcm90ZWN0ZWQgX2xvZ2dpbmc6IGJvb2xlYW47XG5cblx0cHVibGljIGdldCBpbkNob3JkTW9kZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudENob3Jkcy5sZW5ndGggPiAwO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRwcm90ZWN0ZWQgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0cHJvdGVjdGVkIF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRwcml2YXRlIF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY3VycmVudENob3JkcyA9IFtdO1xuXHRcdHRoaXMuX2N1cnJlbnRDaG9yZENoZWNrZXIgPSBuZXcgSW50ZXJ2YWxUaW1lcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRDaG9yZFN0YXR1c01lc3NhZ2UgPSBudWxsO1xuXHRcdHRoaXMuX2lnbm9yZVNpbmdsZU1vZGlmaWVycyA9IEtleWJpbmRpbmdNb2RpZmllclNldC5FTVBUWTtcblx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllckNsZWFyVGltZW91dCA9IG5ldyBUaW1lb3V0VGltZXIoKTtcblx0XHR0aGlzLl9jdXJyZW50bHlEaXNwYXRjaGluZ0NvbW1hbmRJZCA9IG51bGw7XG5cdFx0dGhpcy5fbG9nZ2luZyA9IGZhbHNlO1xuXHR9XG5cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2dldFJlc29sdmVyKCk6IEtleWJpbmRpbmdSZXNvbHZlcjtcblx0cHJvdGVjdGVkIGFic3RyYWN0IF9kb2N1bWVudEhhc0ZvY3VzKCk6IGJvb2xlYW47XG5cdHB1YmxpYyBhYnN0cmFjdCByZXNvbHZlS2V5YmluZGluZyhrZXliaW5kaW5nOiBLZXliaW5kaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW107XG5cdHB1YmxpYyBhYnN0cmFjdCByZXNvbHZlS2V5Ym9hcmRFdmVudChrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCk6IFJlc29sdmVkS2V5YmluZGluZztcblx0cHVibGljIGFic3RyYWN0IHJlc29sdmVVc2VyQmluZGluZyh1c2VyQmluZGluZzogc3RyaW5nKTogUmVzb2x2ZWRLZXliaW5kaW5nW107XG5cdHB1YmxpYyBhYnN0cmFjdCByZWdpc3RlclNjaGVtYUNvbnRyaWJ1dGlvbihjb250cmlidXRpb246IEtleWJpbmRpbmdzU2NoZW1hQ29udHJpYnV0aW9uKTogSURpc3Bvc2FibGU7XG5cdHB1YmxpYyBhYnN0cmFjdCBfZHVtcERlYnVnSW5mbygpOiBzdHJpbmc7XG5cdHB1YmxpYyBhYnN0cmFjdCBfZHVtcERlYnVnSW5mb0pTT04oKTogc3RyaW5nO1xuXG5cdHB1YmxpYyBnZXREZWZhdWx0S2V5YmluZGluZ3NDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHVibGljIHRvZ2dsZUxvZ2dpbmcoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbG9nZ2luZyA9ICF0aGlzLl9sb2dnaW5nO1xuXHRcdHJldHVybiB0aGlzLl9sb2dnaW5nO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9sb2coc3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbG9nZ2luZykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbS2V5YmluZGluZ1NlcnZpY2VdOiAke3N0cn1gKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVmYXVsdEtleWJpbmRpbmdzKCk6IHJlYWRvbmx5IFJlc29sdmVkS2V5YmluZGluZ0l0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldFJlc29sdmVyKCkuZ2V0RGVmYXVsdEtleWJpbmRpbmdzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0S2V5YmluZGluZ3MoKTogcmVhZG9ubHkgUmVzb2x2ZWRLZXliaW5kaW5nSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0UmVzb2x2ZXIoKS5nZXRLZXliaW5kaW5ncygpO1xuXHR9XG5cblx0cHVibGljIGN1c3RvbUtleWJpbmRpbmdzQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBsb29rdXBLZXliaW5kaW5ncyhjb21tYW5kSWQ6IHN0cmluZyk6IFJlc29sdmVkS2V5YmluZGluZ1tdIHtcblx0XHRyZXR1cm4gYXJyYXlzLmNvYWxlc2NlKFxuXHRcdFx0dGhpcy5fZ2V0UmVzb2x2ZXIoKS5sb29rdXBLZXliaW5kaW5ncyhjb21tYW5kSWQpLm1hcChpdGVtID0+IGl0ZW0ucmVzb2x2ZWRLZXliaW5kaW5nKVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgbG9va3VwS2V5YmluZGluZyhjb21tYW5kSWQ6IHN0cmluZywgY29udGV4dD86IElDb250ZXh0S2V5U2VydmljZSwgZW5mb3JjZUNvbnRleHRDaGVjayA9IGZhbHNlKTogUmVzb2x2ZWRLZXliaW5kaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9nZXRSZXNvbHZlcigpLmxvb2t1cFByaW1hcnlLZXliaW5kaW5nKGNvbW1hbmRJZCwgY29udGV4dCB8fCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSwgZW5mb3JjZUNvbnRleHRDaGVjayk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQucmVzb2x2ZWRLZXliaW5kaW5nO1xuXHR9XG5cblx0cHVibGljIGRpc3BhdGNoRXZlbnQoZTogSUtleWJvYXJkRXZlbnQsIHRhcmdldDogSUNvbnRleHRLZXlTZXJ2aWNlVGFyZ2V0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3BhdGNoKGUsIHRhcmdldCk7XG5cdH1cblxuXHQvLyBUT0RPQHVsdWdiZWtuYTogdXBkYXRlIG5hbWluZ3MgdG8gYWxpZ24gd2l0aCBgX2RvRGlzcGF0Y2hgXG5cdC8vIFRPRE9AdWx1Z2Jla25hOiB0aGlzIGZuIGRvZXNuJ3Qgc2VlbSB0byB0YWtlIGludG8gYWNjb3VudCBzaW5nbGUtbW9kaWZpZXIga2V5YmluZGluZ3MsIGVnIGBzaGlmdCBzaGlmdGBcblx0cHVibGljIHNvZnREaXNwYXRjaChlOiBJS2V5Ym9hcmRFdmVudCwgdGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQpOiBSZXNvbHV0aW9uUmVzdWx0IHtcblx0XHR0aGlzLl9sb2coYC8gU29mdCBkaXNwYXRjaGluZyBrZXlib2FyZCBldmVudGApO1xuXHRcdGlmIChpc0tleUluQ29tcG9zaXRpb24oZSkpIHtcblx0XHRcdC8vIE11c3QgYWdyZWUgd2l0aCBgX2Rpc3BhdGNoYDogY2FsbGVycyB1c2UgdGhpcyB0byBkZWNpZGUgd2hldGhlciB0aGUgd29ya2JlbmNoIHdpbGxcblx0XHRcdC8vIGNsYWltIHRoZSBrZXksIGFuZCBhIFwieWVzXCIgaGVyZSBmb2xsb3dlZCBieSBhIFwibm9cIiB0aGVyZSB3b3VsZCBkcm9wIHRoZSBrZXlzdHJva2Ugb25cblx0XHRcdC8vIHRoZSBmbG9vciAtIHN0b3BwaW5nIHRoZSB3aWRnZXQgKGUuZy4gdGhlIHRlcm1pbmFsKSBmcm9tIHBhc3NpbmcgaXQgdG8gdGhlIElNRS5cblx0XHRcdHRoaXMuX2xvZyhgXFxcXCBLZXlib2FyZCBldmVudCBpcyBwYXJ0IG9mIGFuIElNRSBjb21wb3NpdGlvbmApO1xuXHRcdFx0cmV0dXJuIE5vTWF0Y2hpbmdLYjtcblx0XHR9XG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMucmVzb2x2ZUtleWJvYXJkRXZlbnQoZSk7XG5cdFx0aWYgKGtleWJpbmRpbmcuaGFzTXVsdGlwbGVDaG9yZHMoKSkge1xuXHRcdFx0Y29uc29sZS53YXJuKCdrZXlib2FyZCBldmVudCBzaG91bGQgbm90IGJlIG1hcHBlZCB0byBtdWx0aXBsZSBjaG9yZHMnKTtcblx0XHRcdHJldHVybiBOb01hdGNoaW5nS2I7XG5cdFx0fVxuXHRcdGNvbnN0IFtmaXJzdENob3JkLF0gPSBrZXliaW5kaW5nLmdldERpc3BhdGNoQ2hvcmRzKCk7XG5cdFx0aWYgKGZpcnN0Q2hvcmQgPT09IG51bGwpIHtcblx0XHRcdC8vIGNhbm5vdCBiZSBkaXNwYXRjaGVkLCBwcm9iYWJseSBvbmx5IG1vZGlmaWVyIGtleXNcblx0XHRcdHRoaXMuX2xvZyhgXFxcXCBLZXlib2FyZCBldmVudCBjYW5ub3QgYmUgZGlzcGF0Y2hlZGApO1xuXHRcdFx0cmV0dXJuIE5vTWF0Y2hpbmdLYjtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0VmFsdWUgPSB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0KHRhcmdldCk7XG5cdFx0Y29uc3QgY3VycmVudENob3JkcyA9IHRoaXMuX2N1cnJlbnRDaG9yZHMubWFwKCgoeyBrZXlwcmVzcyB9KSA9PiBrZXlwcmVzcykpO1xuXHRcdHJldHVybiB0aGlzLl9nZXRSZXNvbHZlcigpLnJlc29sdmUoY29udGV4dFZhbHVlLCBjdXJyZW50Q2hvcmRzLCBmaXJzdENob3JkKTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlTGVhdmVDaG9yZE1vZGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hvcmRMYXN0SW50ZXJhY3RlZFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMuX2N1cnJlbnRDaG9yZENoZWNrZXIuY2FuY2VsQW5kU2V0KCgpID0+IHtcblxuXHRcdFx0aWYgKCF0aGlzLl9kb2N1bWVudEhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0Ly8gRm9jdXMgaGFzIGJlZW4gbG9zdCA9PiBsZWF2ZSBjaG9yZCBtb2RlXG5cdFx0XHRcdHRoaXMuX2xlYXZlQ2hvcmRNb2RlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKERhdGUubm93KCkgLSBjaG9yZExhc3RJbnRlcmFjdGVkVGltZSA+IDUwMDApIHtcblx0XHRcdFx0Ly8gNSBzZWNvbmRzIGVsYXBzZWQgPT4gbGVhdmUgY2hvcmQgbW9kZVxuXHRcdFx0XHR0aGlzLl9sZWF2ZUNob3JkTW9kZSgpO1xuXHRcdFx0fVxuXG5cdFx0fSwgNTAwKTtcblx0fVxuXG5cdHByaXZhdGUgX2V4cGVjdEFub3RoZXJDaG9yZChmaXJzdENob3JkOiBzdHJpbmcsIGtleXByZXNzTGFiZWw6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcblxuXHRcdHRoaXMuX2N1cnJlbnRDaG9yZHMucHVzaCh7IGtleXByZXNzOiBmaXJzdENob3JkLCBsYWJlbDoga2V5cHJlc3NMYWJlbCB9KTtcblxuXHRcdHN3aXRjaCAodGhpcy5fY3VycmVudENob3Jkcy5sZW5ndGgpIHtcblx0XHRcdGNhc2UgMDpcblx0XHRcdFx0dGhyb3cgaWxsZWdhbFN0YXRlKCdpbXBvc3NpYmxlJyk7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdC8vIFRPRE9AdWx1Z2Jla25hOiByZXZpc2UgdGhpcyBtZXNzYWdlIGFuZCB0aGUgb25lIGJlbG93IChhdCBsZWFzdCwgZml4IHRlcm1pbm9sb2d5KVxuXHRcdFx0XHR0aGlzLl9jdXJyZW50Q2hvcmRTdGF0dXNNZXNzYWdlID0gdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5zdGF0dXMobmxzLmxvY2FsaXplKCdmaXJzdC5jaG9yZCcsIFwiKHswfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIHNlY29uZCBrZXkgb2YgY2hvcmQuLi5cIiwga2V5cHJlc3NMYWJlbCkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0Y29uc3QgZnVsbEtleXByZXNzTGFiZWwgPSB0aGlzLl9jdXJyZW50Q2hvcmRzLm1hcCgoeyBsYWJlbCB9KSA9PiBsYWJlbCkuam9pbignLCAnKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudENob3JkU3RhdHVzTWVzc2FnZSA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uuc3RhdHVzKG5scy5sb2NhbGl6ZSgnbmV4dC5jaG9yZCcsIFwiKHswfSkgd2FzIHByZXNzZWQuIFdhaXRpbmcgZm9yIG5leHQga2V5IG9mIGNob3JkLi4uXCIsIGZ1bGxLZXlwcmVzc0xhYmVsKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2NoZWR1bGVMZWF2ZUNob3JkTW9kZSgpO1xuXG5cdFx0aWYgKElNRS5lbmFibGVkKSB7XG5cdFx0XHRJTUUuZGlzYWJsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2xlYXZlQ2hvcmRNb2RlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50Q2hvcmRTdGF0dXNNZXNzYWdlKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q2hvcmRTdGF0dXNNZXNzYWdlLmNsb3NlKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50Q2hvcmRTdGF0dXNNZXNzYWdlID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudENob3JkQ2hlY2tlci5jYW5jZWwoKTtcblx0XHR0aGlzLl9jdXJyZW50Q2hvcmRzID0gW107XG5cdFx0SU1FLmVuYWJsZSgpO1xuXHR9XG5cblx0cHVibGljIGRpc3BhdGNoQnlVc2VyU2V0dGluZ3NMYWJlbCh1c2VyU2V0dGluZ3NMYWJlbDogc3RyaW5nLCB0YXJnZXQ6IElDb250ZXh0S2V5U2VydmljZVRhcmdldCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZyhgLyBEaXNwYXRjaGluZyBrZXliaW5kaW5nIHRyaWdnZXJlZCB2aWEgbWVudSBlbnRyeSBhY2NlbGVyYXRvciAtICR7dXNlclNldHRpbmdzTGFiZWx9YCk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ3MgPSB0aGlzLnJlc29sdmVVc2VyQmluZGluZyh1c2VyU2V0dGluZ3NMYWJlbCk7XG5cdFx0aWYgKGtleWJpbmRpbmdzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbG9nKGBcXFxcIENvdWxkIG5vdCByZXNvbHZlIC0gJHt1c2VyU2V0dGluZ3NMYWJlbH1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZG9EaXNwYXRjaChrZXliaW5kaW5nc1swXSwgdGFyZ2V0LCAvKmlzU2luZ2xlTW9kaWZlckNob3JkKi9mYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIF9kaXNwYXRjaChlOiBJS2V5Ym9hcmRFdmVudCwgdGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQpOiBib29sZWFuIHtcblx0XHRpZiAoaXNLZXlJbkNvbXBvc2l0aW9uKGUpKSB7XG5cdFx0XHQvLyBUaGUga2V5c3Ryb2tlIGJlbG9uZ3MgdG8gdGhlIElNRSwgd2hpY2ggb3ducyBFbnRlciAoY29tbWl0KSwgU3BhY2UgYW5kIHRoZSBhcnJvd3Ncblx0XHRcdC8vIChjYW5kaWRhdGUgc2VsZWN0aW9uKSBhbmQgRXNjYXBlIChjYW5jZWwpIGZvciB0aGUgZHVyYXRpb24gb2YgdGhlIGNvbXBvc2l0aW9uLlxuXHRcdFx0Ly8gRGlzcGF0Y2hpbmcgd291bGQgcnVuIGNvbW1hbmRzIHRoZSB1c2VyIG5ldmVyIGludm9rZWQgLSBlLmcuIGFjY2VwdGluZyBhIHBpY2tlciBvclxuXHRcdFx0Ly8gc3VibWl0dGluZyBhIGZvcm0gd2hpbGUgdGhleSBhcmUgc3RpbGwgY2hvb3NpbmcgY2hhcmFjdGVycy5cblx0XHRcdHRoaXMuX2xvZyhgKyBJZ25vcmluZyBrZXliaW5kaW5nIGRpc3BhdGNoIGJlY2F1c2UgYW4gSU1FIGNvbXBvc2l0aW9uIGlzIGluIHByb2dyZXNzLmApO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZG9EaXNwYXRjaCh0aGlzLnJlc29sdmVLZXlib2FyZEV2ZW50KGUpLCB0YXJnZXQsIC8qaXNTaW5nbGVNb2RpZmVyQ2hvcmQqL2ZhbHNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfc2luZ2xlTW9kaWZpZXJEaXNwYXRjaChlOiBJS2V5Ym9hcmRFdmVudCwgdGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQpOiBib29sZWFuIHtcblx0XHRpZiAoaXNLZXlJbkNvbXBvc2l0aW9uKGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLnJlc29sdmVLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGNvbnN0IFtzaW5nbGVNb2RpZmllcixdID0ga2V5YmluZGluZy5nZXRTaW5nbGVNb2RpZmllckRpc3BhdGNoQ2hvcmRzKCk7XG5cblx0XHRpZiAoc2luZ2xlTW9kaWZpZXIpIHtcblxuXHRcdFx0aWYgKHRoaXMuX2lnbm9yZVNpbmdsZU1vZGlmaWVycy5oYXMoc2luZ2xlTW9kaWZpZXIpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhgKyBJZ25vcmluZyBzaW5nbGUgbW9kaWZpZXIgJHtzaW5nbGVNb2RpZmllcn0gZHVlIHRvIGl0IGJlaW5nIHByZXNzZWQgdG9nZXRoZXIgd2l0aCBvdGhlciBrZXlzLmApO1xuXHRcdFx0XHR0aGlzLl9pZ25vcmVTaW5nbGVNb2RpZmllcnMgPSBLZXliaW5kaW5nTW9kaWZpZXJTZXQuRU1QVFk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllckNsZWFyVGltZW91dC5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyID0gbnVsbDtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9pZ25vcmVTaW5nbGVNb2RpZmllcnMgPSBLZXliaW5kaW5nTW9kaWZpZXJTZXQuRU1QVFk7XG5cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgPT09IG51bGwpIHtcblx0XHRcdFx0Ly8gd2UgaGF2ZSBhIHZhbGlkIGBzaW5nbGVNb2RpZmllcmAsIHN0b3JlIGl0IGZvciB0aGUgbmV4dCBrZXl1cCwgYnV0IGNsZWFyIGl0IGluIDMwMG1zXG5cdFx0XHRcdHRoaXMuX2xvZyhgKyBTdG9yaW5nIHNpbmdsZSBtb2RpZmllciBmb3IgcG9zc2libGUgY2hvcmQgJHtzaW5nbGVNb2RpZmllcn0uYCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllciA9IHNpbmdsZU1vZGlmaWVyO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXJDbGVhclRpbWVvdXQuY2FuY2VsQW5kU2V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2coYCsgQ2xlYXJpbmcgc2luZ2xlIG1vZGlmaWVyIGR1ZSB0byAzMDBtcyBlbGFwc2VkLmApO1xuXHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllciA9IG51bGw7XG5cdFx0XHRcdH0sIDMwMCk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNpbmdsZU1vZGlmaWVyID09PSB0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIpIHtcblx0XHRcdFx0Ly8gYmluZ28hXG5cdFx0XHRcdHRoaXMuX2xvZyhgLyBEaXNwYXRjaGluZyBzaW5nbGUgbW9kaWZpZXIgY2hvcmQgJHtzaW5nbGVNb2RpZmllcn0gJHtzaW5nbGVNb2RpZmllcn1gKTtcblx0XHRcdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyQ2xlYXJUaW1lb3V0LmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgPSBudWxsO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZG9EaXNwYXRjaChrZXliaW5kaW5nLCB0YXJnZXQsIC8qaXNTaW5nbGVNb2RpZmVyQ2hvcmQqL3RydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2coYCsgQ2xlYXJpbmcgc2luZ2xlIG1vZGlmaWVyIGR1ZSB0byBtb2RpZmllciBtaXNtYXRjaDogJHt0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXJ9ICR7c2luZ2xlTW9kaWZpZXJ9YCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXJDbGVhclRpbWVvdXQuY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgPSBudWxsO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gcHJlc3NpbmcgYSBtb2RpZmllciBhbmQgaG9sZGluZyBpdCBwcmVzc2VkIHdpdGggYW55IG90aGVyIG1vZGlmaWVyIG9yIGtleSBjb21iaW5hdGlvbixcblx0XHQvLyB0aGUgcHJlc3NlZCBtb2RpZmllcnMgc2hvdWxkIG5vIGxvbmdlciBiZSBjb25zaWRlcmVkIGZvciBzaW5nbGUgbW9kaWZpZXIgZGlzcGF0Y2guXG5cdFx0Y29uc3QgW2ZpcnN0Q2hvcmQsXSA9IGtleWJpbmRpbmcuZ2V0Q2hvcmRzKCk7XG5cdFx0dGhpcy5faWdub3JlU2luZ2xlTW9kaWZpZXJzID0gbmV3IEtleWJpbmRpbmdNb2RpZmllclNldChmaXJzdENob3JkKTtcblxuXHRcdGlmICh0aGlzLl9jdXJyZW50U2luZ2xlTW9kaWZpZXIgIT09IG51bGwpIHtcblx0XHRcdHRoaXMuX2xvZyhgKyBDbGVhcmluZyBzaW5nbGUgbW9kaWZpZXIgZHVlIHRvIG90aGVyIGtleSB1cC5gKTtcblx0XHR9XG5cdFx0dGhpcy5fY3VycmVudFNpbmdsZU1vZGlmaWVyQ2xlYXJUaW1lb3V0LmNhbmNlbCgpO1xuXHRcdHRoaXMuX2N1cnJlbnRTaW5nbGVNb2RpZmllciA9IG51bGw7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9EaXNwYXRjaCh1c2VyS2V5cHJlc3M6IFJlc29sdmVkS2V5YmluZGluZywgdGFyZ2V0OiBJQ29udGV4dEtleVNlcnZpY2VUYXJnZXQsIGlzU2luZ2xlTW9kaWZlckNob3JkID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRsZXQgc2hvdWxkUHJldmVudERlZmF1bHQgPSBmYWxzZTtcblxuXHRcdGlmICh1c2VyS2V5cHJlc3MuaGFzTXVsdGlwbGVDaG9yZHMoKSkgeyAvLyB3YXJuIC0gYmVjYXVzZSB1c2VyIGNhbiBwcmVzcyBhIHNpbmdsZSBjaG9yZCBhdCBhIHRpbWVcblx0XHRcdGNvbnNvbGUud2FybignVW5leHBlY3RlZCBrZXlib2FyZCBldmVudCBtYXBwZWQgdG8gbXVsdGlwbGUgY2hvcmRzJyk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0bGV0IHVzZXJQcmVzc2VkQ2hvcmQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdGxldCBjdXJyZW50Q2hvcmRzOiBzdHJpbmdbXSB8IG51bGwgPSBudWxsO1xuXG5cdFx0aWYgKGlzU2luZ2xlTW9kaWZlckNob3JkKSB7XG5cdFx0XHQvLyBUaGUga2V5YmluZGluZyBpcyB0aGUgc2Vjb25kIGtleXByZXNzIG9mIGEgc2luZ2xlIG1vZGlmaWVyIGNob3JkLCBlLmcuIFwic2hpZnQgc2hpZnRcIi5cblx0XHRcdC8vIEEgc2luZ2xlIG1vZGlmaWVyIGNhbiBvbmx5IG9jY3VyIHdoZW4gdGhlIHNhbWUgbW9kaWZpZXIgaXMgcHJlc3NlZCBpbiBzaG9ydCBzZXF1ZW5jZSxcblx0XHRcdC8vIGhlbmNlIHdlIGRpc3JlZ2FyZCBgX2N1cnJlbnRDaG9yZGAgYW5kIHVzZSB0aGUgc2FtZSBtb2RpZmllciBpbnN0ZWFkLlxuXHRcdFx0Y29uc3QgW2Rpc3BhdGNoS2V5bmFtZSxdID0gdXNlcktleXByZXNzLmdldFNpbmdsZU1vZGlmaWVyRGlzcGF0Y2hDaG9yZHMoKTtcblx0XHRcdHVzZXJQcmVzc2VkQ2hvcmQgPSBkaXNwYXRjaEtleW5hbWU7XG5cdFx0XHRjdXJyZW50Q2hvcmRzID0gZGlzcGF0Y2hLZXluYW1lID8gW2Rpc3BhdGNoS2V5bmFtZV0gOiBbXTsgLy8gVE9ET0B1bHVnYmVrbmE6IGluIHRoZSBgZWxzZWAgY2FzZSB3ZSBhc3NpZ24gYW4gZW1wdHkgYXJyYXkgLSBtYWtlIHN1cmUgYHJlc29sdmVgIGNhbiBoYW5kbGUgYW4gZW1wdHkgYXJyYXkgd2VsbFxuXHRcdH0gZWxzZSB7XG5cdFx0XHRbdXNlclByZXNzZWRDaG9yZCxdID0gdXNlcktleXByZXNzLmdldERpc3BhdGNoQ2hvcmRzKCk7XG5cdFx0XHRjdXJyZW50Q2hvcmRzID0gdGhpcy5fY3VycmVudENob3Jkcy5tYXAoKHsga2V5cHJlc3MgfSkgPT4ga2V5cHJlc3MpO1xuXHRcdH1cblxuXHRcdGlmICh1c2VyUHJlc3NlZENob3JkID09PSBudWxsKSB7XG5cdFx0XHR0aGlzLl9sb2coYFxcXFwgS2V5Ym9hcmQgZXZlbnQgY2Fubm90IGJlIGRpc3BhdGNoZWQgaW4ga2V5ZG93biBwaGFzZS5gKTtcblx0XHRcdC8vIGNhbm5vdCBiZSBkaXNwYXRjaGVkLCBwcm9iYWJseSBvbmx5IG1vZGlmaWVyIGtleXNcblx0XHRcdHJldHVybiBzaG91bGRQcmV2ZW50RGVmYXVsdDtcblx0XHR9XG5cblx0XHRjb25zdCBjb250ZXh0VmFsdWUgPSB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0KHRhcmdldCk7XG5cdFx0Y29uc3Qga2V5cHJlc3NMYWJlbCA9IHVzZXJLZXlwcmVzcy5nZXRMYWJlbCgpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZVJlc3VsdCA9IHRoaXMuX2dldFJlc29sdmVyKCkucmVzb2x2ZShjb250ZXh0VmFsdWUsIGN1cnJlbnRDaG9yZHMsIHVzZXJQcmVzc2VkQ2hvcmQpO1xuXG5cdFx0c3dpdGNoIChyZXNvbHZlUmVzdWx0LmtpbmQpIHtcblxuXHRcdFx0Y2FzZSBSZXN1bHRLaW5kLk5vTWF0Y2hpbmdLYjoge1xuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0tleWJpbmRpbmdTZXJ2aWNlI2Rpc3BhdGNoJywga2V5cHJlc3NMYWJlbCwgYFsgTm8gbWF0Y2hpbmcga2V5YmluZGluZyBdYCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuaW5DaG9yZE1vZGUpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50Q2hvcmRzTGFiZWwgPSB0aGlzLl9jdXJyZW50Q2hvcmRzLm1hcCgoeyBsYWJlbCB9KSA9PiBsYWJlbCkuam9pbignLCAnKTtcblx0XHRcdFx0XHR0aGlzLl9sb2coYCsgTGVhdmluZyBtdWx0aS1jaG9yZCBtb2RlOiBOb3RoaW5nIGJvdW5kIHRvIFwiJHtjdXJyZW50Q2hvcmRzTGFiZWx9LCAke2tleXByZXNzTGFiZWx9XCIuYCk7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5zdGF0dXMobmxzLmxvY2FsaXplKCdtaXNzaW5nLmNob3JkJywgXCJUaGUga2V5IGNvbWJpbmF0aW9uICh7MH0sIHsxfSkgaXMgbm90IGEgY29tbWFuZC5cIiwgY3VycmVudENob3Jkc0xhYmVsLCBrZXlwcmVzc0xhYmVsKSwgeyBoaWRlQWZ0ZXI6IDEwICogMTAwMCAvKiAxMHMgKi8gfSk7XG5cdFx0XHRcdFx0dGhpcy5fbGVhdmVDaG9yZE1vZGUoKTtcblxuXHRcdFx0XHRcdHNob3VsZFByZXZlbnREZWZhdWx0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gc2hvdWxkUHJldmVudERlZmF1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdGNhc2UgUmVzdWx0S2luZC5Nb3JlQ2hvcmRzTmVlZGVkOiB7XG5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnS2V5YmluZGluZ1NlcnZpY2UjZGlzcGF0Y2gnLCBrZXlwcmVzc0xhYmVsLCBgWyBTZXZlcmFsIGtleWJpbmRpbmdzIG1hdGNoIC0gbW9yZSBjaG9yZHMgbmVlZGVkIF1gKTtcblxuXHRcdFx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2V4cGVjdEFub3RoZXJDaG9yZCh1c2VyUHJlc3NlZENob3JkLCBrZXlwcmVzc0xhYmVsKTtcblx0XHRcdFx0dGhpcy5fbG9nKHRoaXMuX2N1cnJlbnRDaG9yZHMubGVuZ3RoID09PSAxID8gYCsgRW50ZXJpbmcgbXVsdGktY2hvcmQgbW9kZS4uLmAgOiBgKyBDb250aW51aW5nIG11bHRpLWNob3JkIG1vZGUuLi5gKTtcblx0XHRcdFx0cmV0dXJuIHNob3VsZFByZXZlbnREZWZhdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIFJlc3VsdEtpbmQuS2JGb3VuZDoge1xuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ0tleWJpbmRpbmdTZXJ2aWNlI2Rpc3BhdGNoJywga2V5cHJlc3NMYWJlbCwgYFsgV2lsbCBkaXNwYXRjaCBjb21tYW5kICR7cmVzb2x2ZVJlc3VsdC5jb21tYW5kSWR9IF1gKTtcblxuXHRcdFx0XHRpZiAocmVzb2x2ZVJlc3VsdC5jb21tYW5kSWQgPT09IG51bGwgfHwgcmVzb2x2ZVJlc3VsdC5jb21tYW5kSWQgPT09ICcnKSB7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5pbkNob3JkTW9kZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudENob3Jkc0xhYmVsID0gdGhpcy5fY3VycmVudENob3Jkcy5tYXAoKHsgbGFiZWwgfSkgPT4gbGFiZWwpLmpvaW4oJywgJyk7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2coYCsgTGVhdmluZyBjaG9yZCBtb2RlOiBOb3RoaW5nIGJvdW5kIHRvIFwiJHtjdXJyZW50Q2hvcmRzTGFiZWx9LCAke2tleXByZXNzTGFiZWx9XCIuYCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnN0YXR1cyhubHMubG9jYWxpemUoJ21pc3NpbmcuY2hvcmQnLCBcIlRoZSBrZXkgY29tYmluYXRpb24gKHswfSwgezF9KSBpcyBub3QgYSBjb21tYW5kLlwiLCBjdXJyZW50Q2hvcmRzTGFiZWwsIGtleXByZXNzTGFiZWwpLCB7IGhpZGVBZnRlcjogMTAgKiAxMDAwIC8qIDEwcyAqLyB9KTtcblx0XHRcdFx0XHRcdHRoaXMuX2xlYXZlQ2hvcmRNb2RlKCk7XG5cdFx0XHRcdFx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaW5DaG9yZE1vZGUpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xlYXZlQ2hvcmRNb2RlKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFyZXNvbHZlUmVzdWx0LmlzQnViYmxlKSB7XG5cdFx0XHRcdFx0XHRzaG91bGRQcmV2ZW50RGVmYXVsdCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fbG9nKGArIEludm9raW5nIGNvbW1hbmQgJHtyZXNvbHZlUmVzdWx0LmNvbW1hbmRJZH0uYCk7XG5cdFx0XHRcdFx0dGhpcy5fY3VycmVudGx5RGlzcGF0Y2hpbmdDb21tYW5kSWQgPSByZXNvbHZlUmVzdWx0LmNvbW1hbmRJZDtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlUmVzdWx0LmNvbW1hbmRBcmdzID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChyZXNvbHZlUmVzdWx0LmNvbW1hbmRJZCkudGhlbih1bmRlZmluZWQsIGVyciA9PiB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4oZXJyKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChyZXNvbHZlUmVzdWx0LmNvbW1hbmRJZCwgcmVzb2x2ZVJlc3VsdC5jb21tYW5kQXJncykudGhlbih1bmRlZmluZWQsIGVyciA9PiB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4oZXJyKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRseURpc3BhdGNoaW5nQ29tbWFuZElkID0gbnVsbDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIUhJR0hfRlJFUV9DT01NQU5EUy50ZXN0KHJlc29sdmVSZXN1bHQuY29tbWFuZElkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IHJlc29sdmVSZXN1bHQuY29tbWFuZElkLCBmcm9tOiAna2V5YmluZGluZycsIGRldGFpbDogdXNlcktleXByZXNzLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkgPz8gdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBzaG91bGRQcmV2ZW50RGVmYXVsdDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhYnN0cmFjdCBlbmFibGVLZXliaW5kaW5nSG9sZE1vZGUoY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdG1pZ2h0UHJvZHVjZVByaW50YWJsZUNoYXJhY3RlcihldmVudDogSUtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoZXZlbnQuY3RybEtleSB8fCBldmVudC5tZXRhS2V5KSB7XG5cdFx0XHQvLyBpZ25vcmUgY3RybC9jbWQtY29tYmluYXRpb24gYnV0IG5vdCBzaGlmdC9hbHQtY29tYmluYXRpb3Ncblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gd2VhayBjaGVjayBmb3IgY2VydGFpbiByYW5nZXMuIHRoaXMgaXMgcHJvcGVybHkgaW1wbGVtZW50ZWQgaW4gYSBzdWJjbGFzc1xuXHRcdC8vIHdpdGggYWNjZXNzIHRvIHRoZSBLZXlib2FyZE1hcHBlckZhY3RvcnkuXG5cdFx0aWYgKChldmVudC5rZXlDb2RlID49IEtleUNvZGUuS2V5QSAmJiBldmVudC5rZXlDb2RlIDw9IEtleUNvZGUuS2V5Wilcblx0XHRcdHx8IChldmVudC5rZXlDb2RlID49IEtleUNvZGUuRGlnaXQwICYmIGV2ZW50LmtleUNvZGUgPD0gS2V5Q29kZS5EaWdpdDkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGFwcGVuZEtleWJpbmRpbmcobGFiZWw6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsLCBjb250ZXh0PzogSUNvbnRleHRLZXlTZXJ2aWNlLCBlbmZvcmNlQ29udGV4dENoZWNrPzogYm9vbGVhbik6IHN0cmluZyB7XG5cdFx0aWYgKGNvbW1hbmRJZCkge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gdGhpcy5sb29rdXBLZXliaW5kaW5nKGNvbW1hbmRJZCwgY29udGV4dCwgZW5mb3JjZUNvbnRleHRDaGVjayk/LmdldExhYmVsKCk7XG5cdFx0XHRpZiAoa2V5YmluZGluZ0xhYmVsKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoXG5cdFx0XHRcdFx0eyBrZXk6ICdrZXliaW5kaW5nTGFiZWwnLCBjb21tZW50OiBbJ1VJIGVsZW1lbnQgbGFiZWwnLCAnQSBrZXliaW5kaW5nIGxhYmVsJ10gfSxcblx0XHRcdFx0XHRcInswfSAoezF9KVwiLFxuXHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsYWJlbDtcblx0fVxufVxuXG5jbGFzcyBLZXliaW5kaW5nTW9kaWZpZXJTZXQge1xuXG5cdHB1YmxpYyBzdGF0aWMgRU1QVFkgPSBuZXcgS2V5YmluZGluZ01vZGlmaWVyU2V0KG51bGwpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0cmxLZXk6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NoaWZ0S2V5OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hbHRLZXk6IGJvb2xlYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFLZXk6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3Ioc291cmNlOiBSZXNvbHZlZENob3JkIHwgbnVsbCkge1xuXHRcdHRoaXMuX2N0cmxLZXkgPSBzb3VyY2UgPyBzb3VyY2UuY3RybEtleSA6IGZhbHNlO1xuXHRcdHRoaXMuX3NoaWZ0S2V5ID0gc291cmNlID8gc291cmNlLnNoaWZ0S2V5IDogZmFsc2U7XG5cdFx0dGhpcy5fYWx0S2V5ID0gc291cmNlID8gc291cmNlLmFsdEtleSA6IGZhbHNlO1xuXHRcdHRoaXMuX21ldGFLZXkgPSBzb3VyY2UgPyBzb3VyY2UubWV0YUtleSA6IGZhbHNlO1xuXHR9XG5cblx0aGFzKG1vZGlmaWVyOiBTaW5nbGVNb2RpZmllckNob3JkKSB7XG5cdFx0c3dpdGNoIChtb2RpZmllcikge1xuXHRcdFx0Y2FzZSAnY3RybCc6IHJldHVybiB0aGlzLl9jdHJsS2V5O1xuXHRcdFx0Y2FzZSAnc2hpZnQnOiByZXR1cm4gdGhpcy5fc2hpZnRLZXk7XG5cdFx0XHRjYXNlICdhbHQnOiByZXR1cm4gdGhpcy5fYWx0S2V5O1xuXHRcdFx0Y2FzZSAnbWV0YSc6IHJldHVybiB0aGlzLl9tZXRhS2V5O1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsZUFBZSxvQkFBb0I7QUFDNUMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGtCQUErQjtBQUN4QyxZQUFZLFNBQVM7QUFLckIsU0FBK0MsWUFBWSxvQkFBb0I7QUFXL0UsTUFBTSxxQkFBcUI7QUFPM0IsU0FBUyxtQkFBbUIsR0FBNEI7QUFDdkQsU0FBTyxFQUFFLFlBQVksUUFBUTtBQUM5QjtBQUVPLE1BQWUsa0NBQWtDLFdBQXlDO0FBQUEsRUErQmhHLFlBQ1Msb0JBQ0UsaUJBQ0EsbUJBQ0Ysc0JBQ0UsYUFDVDtBQUNELFVBQU07QUFORTtBQUNFO0FBQ0E7QUFDRjtBQUNFO0FBaENYLFNBQW1CLDBCQUF5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
