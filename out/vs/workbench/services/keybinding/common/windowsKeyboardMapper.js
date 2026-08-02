import { CharCode } from "../../../../base/common/charCode.js";
import { KeyCode, KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, ScanCode, ScanCodeUtils, NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE } from "../../../../base/common/keyCodes.js";
import { KeyCodeChord, ScanCodeChord } from "../../../../base/common/keybindings.js";
import { UILabelProvider } from "../../../../base/common/keybindingLabels.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { BaseResolvedKeybinding } from "../../../../platform/keybinding/common/baseResolvedKeybinding.js";
import { toEmptyArrayIfContainsNull } from "../../../../platform/keybinding/common/resolvedKeybindingItem.js";
const LOG = false;
function log(str) {
  if (LOG) {
    console.info(str);
  }
}
class WindowsNativeResolvedKeybinding extends BaseResolvedKeybinding {
  constructor(mapper, chords) {
    super(OperatingSystem.Windows, chords);
    this._mapper = mapper;
  }
  _getLabel(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return this._mapper.getUILabelForKeyCode(chord.keyCode);
  }
  _getUSLabelForKeybinding(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return KeyCodeUtils.toString(chord.keyCode);
  }
  getUSLabel() {
    return UILabelProvider.toLabel(this._os, this._chords, (keybinding) => this._getUSLabelForKeybinding(keybinding));
  }
  _getAriaLabel(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return this._mapper.getAriaLabelForKeyCode(chord.keyCode);
  }
  _getElectronAccelerator(chord) {
    return this._mapper.getElectronAcceleratorForKeyBinding(chord);
  }
  _getUserSettingsLabel(chord) {
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    const result = this._mapper.getUserSettingsLabelForKeyCode(chord.keyCode);
    return result ? result.toLowerCase() : result;
  }
  _isWYSIWYG(chord) {
    return this.__isWYSIWYG(chord.keyCode);
  }
  __isWYSIWYG(keyCode) {
    if (keyCode === KeyCode.LeftArrow || keyCode === KeyCode.UpArrow || keyCode === KeyCode.RightArrow || keyCode === KeyCode.DownArrow) {
      return true;
    }
    const ariaLabel = this._mapper.getAriaLabelForKeyCode(keyCode);
    const userSettingsLabel = this._mapper.getUserSettingsLabelForKeyCode(keyCode);
    return ariaLabel === userSettingsLabel;
  }
  _getChordDispatch(chord) {
    if (chord.isModifierKey()) {
      return null;
    }
    let result = "";
    if (chord.ctrlKey) {
      result += "ctrl+";
    }
    if (chord.shiftKey) {
      result += "shift+";
    }
    if (chord.altKey) {
      result += "alt+";
    }
    if (chord.metaKey) {
      result += "meta+";
    }
    result += KeyCodeUtils.toString(chord.keyCode);
    return result;
  }
  _getSingleModifierChordDispatch(chord) {
    if (chord.keyCode === KeyCode.Ctrl && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
      return "ctrl";
    }
    if (chord.keyCode === KeyCode.Shift && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
      return "shift";
    }
    if (chord.keyCode === KeyCode.Alt && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
      return "alt";
    }
    if (chord.keyCode === KeyCode.Meta && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
      return "meta";
    }
    return null;
  }
  static getProducedCharCode(chord, mapping) {
    if (!mapping) {
      return null;
    }
    if (chord.ctrlKey && chord.shiftKey && chord.altKey) {
      return mapping.withShiftAltGr;
    }
    if (chord.ctrlKey && chord.altKey) {
      return mapping.withAltGr;
    }
    if (chord.shiftKey) {
      return mapping.withShift;
    }
    return mapping.value;
  }
  static getProducedChar(chord, mapping) {
    const char = this.getProducedCharCode(chord, mapping);
    if (char === null || char.length === 0) {
      return " --- ";
    }
    return "  " + char + "  ";
  }
}
class WindowsKeyboardMapper {
  constructor(_isUSStandard, rawMappings, _mapAltGrToCtrlAlt) {
    this._isUSStandard = _isUSStandard;
    this._mapAltGrToCtrlAlt = _mapAltGrToCtrlAlt;
    this._keyCodeToLabel = [];
    this._scanCodeToKeyCode = [];
    this._keyCodeToLabel = [];
    this._keyCodeExists = [];
    this._keyCodeToLabel[KeyCode.Unknown] = KeyCodeUtils.toString(KeyCode.Unknown);
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
      if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
        this._scanCodeToKeyCode[scanCode] = immutableKeyCode;
        this._keyCodeToLabel[immutableKeyCode] = KeyCodeUtils.toString(immutableKeyCode);
        this._keyCodeExists[immutableKeyCode] = true;
      }
    }
    const producesLetter = [];
    let producesLetters = false;
    this._codeInfo = [];
    for (const strCode in rawMappings) {
      if (rawMappings.hasOwnProperty(strCode)) {
        const scanCode = ScanCodeUtils.toEnum(strCode);
        if (scanCode === ScanCode.None) {
          log(`Unknown scanCode ${strCode} in mapping.`);
          continue;
        }
        const rawMapping = rawMappings[strCode];
        const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
        if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
          const keyCode2 = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;
          if (keyCode2 === KeyCode.Unknown || immutableKeyCode === keyCode2) {
            continue;
          }
          if (scanCode !== ScanCode.NumpadComma) {
            continue;
          }
        }
        const value = rawMapping.value;
        const withShift = rawMapping.withShift;
        const withAltGr = rawMapping.withAltGr;
        const withShiftAltGr = rawMapping.withShiftAltGr;
        const keyCode = NATIVE_WINDOWS_KEY_CODE_TO_KEY_CODE[rawMapping.vkey] || KeyCode.Unknown;
        const mapping = {
          scanCode,
          keyCode,
          value,
          withShift,
          withAltGr,
          withShiftAltGr
        };
        this._codeInfo[scanCode] = mapping;
        this._scanCodeToKeyCode[scanCode] = keyCode;
        if (keyCode === KeyCode.Unknown) {
          continue;
        }
        this._keyCodeExists[keyCode] = true;
        if (value.length === 0) {
          this._keyCodeToLabel[keyCode] = null;
        } else if (value.length > 1) {
          this._keyCodeToLabel[keyCode] = value;
        } else {
          const charCode = value.charCodeAt(0);
          if (charCode >= CharCode.a && charCode <= CharCode.z) {
            const upperCaseValue = CharCode.A + (charCode - CharCode.a);
            producesLetter[upperCaseValue] = true;
            producesLetters = true;
            this._keyCodeToLabel[keyCode] = String.fromCharCode(CharCode.A + (charCode - CharCode.a));
          } else if (charCode >= CharCode.A && charCode <= CharCode.Z) {
            producesLetter[charCode] = true;
            producesLetters = true;
            this._keyCodeToLabel[keyCode] = value;
          } else {
            this._keyCodeToLabel[keyCode] = value;
          }
        }
      }
    }
    const _registerLetterIfMissing = (charCode, keyCode) => {
      if (!producesLetter[charCode]) {
        this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
      }
    };
    _registerLetterIfMissing(CharCode.A, KeyCode.KeyA);
    _registerLetterIfMissing(CharCode.B, KeyCode.KeyB);
    _registerLetterIfMissing(CharCode.C, KeyCode.KeyC);
    _registerLetterIfMissing(CharCode.D, KeyCode.KeyD);
    _registerLetterIfMissing(CharCode.E, KeyCode.KeyE);
    _registerLetterIfMissing(CharCode.F, KeyCode.KeyF);
    _registerLetterIfMissing(CharCode.G, KeyCode.KeyG);
    _registerLetterIfMissing(CharCode.H, KeyCode.KeyH);
    _registerLetterIfMissing(CharCode.I, KeyCode.KeyI);
    _registerLetterIfMissing(CharCode.J, KeyCode.KeyJ);
    _registerLetterIfMissing(CharCode.K, KeyCode.KeyK);
    _registerLetterIfMissing(CharCode.L, KeyCode.KeyL);
    _registerLetterIfMissing(CharCode.M, KeyCode.KeyM);
    _registerLetterIfMissing(CharCode.N, KeyCode.KeyN);
    _registerLetterIfMissing(CharCode.O, KeyCode.KeyO);
    _registerLetterIfMissing(CharCode.P, KeyCode.KeyP);
    _registerLetterIfMissing(CharCode.Q, KeyCode.KeyQ);
    _registerLetterIfMissing(CharCode.R, KeyCode.KeyR);
    _registerLetterIfMissing(CharCode.S, KeyCode.KeyS);
    _registerLetterIfMissing(CharCode.T, KeyCode.KeyT);
    _registerLetterIfMissing(CharCode.U, KeyCode.KeyU);
    _registerLetterIfMissing(CharCode.V, KeyCode.KeyV);
    _registerLetterIfMissing(CharCode.W, KeyCode.KeyW);
    _registerLetterIfMissing(CharCode.X, KeyCode.KeyX);
    _registerLetterIfMissing(CharCode.Y, KeyCode.KeyY);
    _registerLetterIfMissing(CharCode.Z, KeyCode.KeyZ);
    if (!producesLetters) {
      const _registerLabel = (keyCode, charCode) => {
        this._keyCodeToLabel[keyCode] = String.fromCharCode(charCode);
      };
      _registerLabel(KeyCode.Semicolon, CharCode.Semicolon);
      _registerLabel(KeyCode.Equal, CharCode.Equals);
      _registerLabel(KeyCode.Comma, CharCode.Comma);
      _registerLabel(KeyCode.Minus, CharCode.Dash);
      _registerLabel(KeyCode.Period, CharCode.Period);
      _registerLabel(KeyCode.Slash, CharCode.Slash);
      _registerLabel(KeyCode.Backquote, CharCode.BackTick);
      _registerLabel(KeyCode.BracketLeft, CharCode.OpenSquareBracket);
      _registerLabel(KeyCode.Backslash, CharCode.Backslash);
      _registerLabel(KeyCode.BracketRight, CharCode.CloseSquareBracket);
      _registerLabel(KeyCode.Quote, CharCode.SingleQuote);
    }
  }
  dumpDebugInfo() {
    const result = [];
    const immutableSamples = [
      ScanCode.ArrowUp,
      ScanCode.Numpad0
    ];
    let cnt = 0;
    result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
        if (immutableSamples.indexOf(scanCode) === -1) {
          continue;
        }
      }
      if (cnt % 6 === 0) {
        result.push(`|       HW Code combination      |  Key  |    KeyCode combination    |          UI label         |        User settings       | WYSIWYG |`);
        result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
      }
      cnt++;
      const mapping = this._codeInfo[scanCode];
      const strCode = ScanCodeUtils.toString(scanCode);
      const mods = [0, 2, 5, 7];
      for (const mod of mods) {
        const ctrlKey = mod & 1 ? true : false;
        const shiftKey = mod & 2 ? true : false;
        const altKey = mod & 4 ? true : false;
        const scanCodeChord = new ScanCodeChord(ctrlKey, shiftKey, altKey, false, scanCode);
        const keyCodeChord = this._resolveChord(scanCodeChord);
        const strKeyCode = keyCodeChord ? KeyCodeUtils.toString(keyCodeChord.keyCode) : null;
        const resolvedKb = keyCodeChord ? new WindowsNativeResolvedKeybinding(this, [keyCodeChord]) : null;
        const outScanCode = `${ctrlKey ? "Ctrl+" : ""}${shiftKey ? "Shift+" : ""}${altKey ? "Alt+" : ""}${strCode}`;
        const ariaLabel = resolvedKb ? resolvedKb.getAriaLabel() : null;
        const outUILabel = ariaLabel ? ariaLabel.replace(/Control\+/, "Ctrl+") : null;
        const outUserSettings = resolvedKb ? resolvedKb.getUserSettingsLabel() : null;
        const outKey = WindowsNativeResolvedKeybinding.getProducedChar(scanCodeChord, mapping);
        const outKb = strKeyCode ? `${ctrlKey ? "Ctrl+" : ""}${shiftKey ? "Shift+" : ""}${altKey ? "Alt+" : ""}${strKeyCode}` : null;
        const isWYSIWYG = resolvedKb ? resolvedKb.isWYSIWYG() : false;
        const outWYSIWYG = isWYSIWYG ? "       " : "   NO  ";
        result.push(`| ${this._leftPad(outScanCode, 30)} | ${outKey} | ${this._leftPad(outKb, 25)} | ${this._leftPad(outUILabel, 25)} |  ${this._leftPad(outUserSettings, 25)} | ${outWYSIWYG} |`);
      }
      result.push(`-----------------------------------------------------------------------------------------------------------------------------------------`);
    }
    return result.join("\n");
  }
  _leftPad(str, cnt) {
    if (str === null) {
      str = "null";
    }
    while (str.length < cnt) {
      str = " " + str;
    }
    return str;
  }
  getUILabelForKeyCode(keyCode) {
    return this._getLabelForKeyCode(keyCode);
  }
  getAriaLabelForKeyCode(keyCode) {
    return this._getLabelForKeyCode(keyCode);
  }
  getUserSettingsLabelForKeyCode(keyCode) {
    if (this._isUSStandard) {
      return KeyCodeUtils.toUserSettingsUS(keyCode);
    }
    return KeyCodeUtils.toUserSettingsGeneral(keyCode);
  }
  getElectronAcceleratorForKeyBinding(chord) {
    return KeyCodeUtils.toElectronAccelerator(chord.keyCode);
  }
  _getLabelForKeyCode(keyCode) {
    return this._keyCodeToLabel[keyCode] || KeyCodeUtils.toString(KeyCode.Unknown);
  }
  resolveKeyboardEvent(keyboardEvent) {
    const ctrlKey = keyboardEvent.ctrlKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const altKey = keyboardEvent.altKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const chord = new KeyCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, keyboardEvent.keyCode);
    return new WindowsNativeResolvedKeybinding(this, [chord]);
  }
  _resolveChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord instanceof KeyCodeChord) {
      if (!this._keyCodeExists[chord.keyCode]) {
        return null;
      }
      return chord;
    }
    const keyCode = this._scanCodeToKeyCode[chord.scanCode] || KeyCode.Unknown;
    if (keyCode === KeyCode.Unknown || !this._keyCodeExists[keyCode]) {
      return null;
    }
    return new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, keyCode);
  }
  resolveKeybinding(keybinding) {
    const chords = toEmptyArrayIfContainsNull(keybinding.chords.map((chord) => this._resolveChord(chord)));
    if (chords.length > 0) {
      return [new WindowsNativeResolvedKeybinding(this, chords)];
    }
    return [];
  }
}
export {
  WindowsKeyboardMapper,
  WindowsNativeResolvedKeybinding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2NvbW1vbi93aW5kb3dzS2V5Ym9hcmRNYXBwZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDaGFyQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NoYXJDb2RlLmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleUNvZGVVdGlscywgSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREUsIFNjYW5Db2RlLCBTY2FuQ29kZVV0aWxzLCBOQVRJVkVfV0lORE9XU19LRVlfQ09ERV9UT19LRVlfQ09ERSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZywgS2V5Q29kZUNob3JkLCBTaW5nbGVNb2RpZmllckNob3JkLCBTY2FuQ29kZUNob3JkLCBLZXliaW5kaW5nLCBDaG9yZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IFVJTGFiZWxQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdMYWJlbHMuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElLZXlib2FyZE1hcHBlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZE1hcHBlci5qcyc7XG5pbXBvcnQgeyBCYXNlUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24vYmFzZVJlc29sdmVkS2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyB0b0VtcHR5QXJyYXlJZkNvbnRhaW5zTnVsbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL3Jlc29sdmVkS2V5YmluZGluZ0l0ZW0uanMnO1xuaW1wb3J0IHsgSVdpbmRvd3NLZXlib2FyZE1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRMYXlvdXQuanMnO1xuXG5jb25zdCBMT0cgPSBmYWxzZTtcbmZ1bmN0aW9uIGxvZyhzdHI6IHN0cmluZyk6IHZvaWQge1xuXHRpZiAoTE9HKSB7XG5cdFx0Y29uc29sZS5pbmZvKHN0cik7XG5cdH1cbn1cblxuXG5leHBvcnQgaW50ZXJmYWNlIElTY2FuQ29kZU1hcHBpbmcge1xuXHRzY2FuQ29kZTogU2NhbkNvZGU7XG5cdGtleUNvZGU6IEtleUNvZGU7XG5cdHZhbHVlOiBzdHJpbmc7XG5cdHdpdGhTaGlmdDogc3RyaW5nO1xuXHR3aXRoQWx0R3I6IHN0cmluZztcblx0d2l0aFNoaWZ0QWx0R3I6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIFdpbmRvd3NOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmcgZXh0ZW5kcyBCYXNlUmVzb2x2ZWRLZXliaW5kaW5nPEtleUNvZGVDaG9yZD4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21hcHBlcjogV2luZG93c0tleWJvYXJkTWFwcGVyO1xuXG5cdGNvbnN0cnVjdG9yKG1hcHBlcjogV2luZG93c0tleWJvYXJkTWFwcGVyLCBjaG9yZHM6IEtleUNvZGVDaG9yZFtdKSB7XG5cdFx0c3VwZXIoT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIGNob3Jkcyk7XG5cdFx0dGhpcy5fbWFwcGVyID0gbWFwcGVyO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRMYWJlbChjaG9yZDogS2V5Q29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGNob3JkLmlzRHVwbGljYXRlTW9kaWZpZXJDYXNlKCkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21hcHBlci5nZXRVSUxhYmVsRm9yS2V5Q29kZShjaG9yZC5rZXlDb2RlKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFVTTGFiZWxGb3JLZXliaW5kaW5nKGNob3JkOiBLZXlDb2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoY2hvcmQuaXNEdXBsaWNhdGVNb2RpZmllckNhc2UoKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvU3RyaW5nKGNob3JkLmtleUNvZGUpO1xuXHR9XG5cblx0cHVibGljIGdldFVTTGFiZWwoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIFVJTGFiZWxQcm92aWRlci50b0xhYmVsKHRoaXMuX29zLCB0aGlzLl9jaG9yZHMsIChrZXliaW5kaW5nKSA9PiB0aGlzLl9nZXRVU0xhYmVsRm9yS2V5YmluZGluZyhrZXliaW5kaW5nKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldEFyaWFMYWJlbChjaG9yZDogS2V5Q29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGNob3JkLmlzRHVwbGljYXRlTW9kaWZpZXJDYXNlKCkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21hcHBlci5nZXRBcmlhTGFiZWxGb3JLZXlDb2RlKGNob3JkLmtleUNvZGUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRFbGVjdHJvbkFjY2VsZXJhdG9yKGNob3JkOiBLZXlDb2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFwcGVyLmdldEVsZWN0cm9uQWNjZWxlcmF0b3JGb3JLZXlCaW5kaW5nKGNob3JkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0VXNlclNldHRpbmdzTGFiZWwoY2hvcmQ6IEtleUNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChjaG9yZC5pc0R1cGxpY2F0ZU1vZGlmaWVyQ2FzZSgpKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX21hcHBlci5nZXRVc2VyU2V0dGluZ3NMYWJlbEZvcktleUNvZGUoY2hvcmQua2V5Q29kZSk7XG5cdFx0cmV0dXJuIChyZXN1bHQgPyByZXN1bHQudG9Mb3dlckNhc2UoKSA6IHJlc3VsdCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2lzV1lTSVdZRyhjaG9yZDogS2V5Q29kZUNob3JkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX19pc1dZU0lXWUcoY2hvcmQua2V5Q29kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9faXNXWVNJV1lHKGtleUNvZGU6IEtleUNvZGUpOiBib29sZWFuIHtcblx0XHRpZiAoXG5cdFx0XHRrZXlDb2RlID09PSBLZXlDb2RlLkxlZnRBcnJvd1xuXHRcdFx0fHwga2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93XG5cdFx0XHR8fCBrZXlDb2RlID09PSBLZXlDb2RlLlJpZ2h0QXJyb3dcblx0XHRcdHx8IGtleUNvZGUgPT09IEtleUNvZGUuRG93bkFycm93XG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy5fbWFwcGVyLmdldEFyaWFMYWJlbEZvcktleUNvZGUoa2V5Q29kZSk7XG5cdFx0Y29uc3QgdXNlclNldHRpbmdzTGFiZWwgPSB0aGlzLl9tYXBwZXIuZ2V0VXNlclNldHRpbmdzTGFiZWxGb3JLZXlDb2RlKGtleUNvZGUpO1xuXHRcdHJldHVybiAoYXJpYUxhYmVsID09PSB1c2VyU2V0dGluZ3NMYWJlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldENob3JkRGlzcGF0Y2goY2hvcmQ6IEtleUNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmIChjaG9yZC5pc01vZGlmaWVyS2V5KCkpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0ID0gJyc7XG5cblx0XHRpZiAoY2hvcmQuY3RybEtleSkge1xuXHRcdFx0cmVzdWx0ICs9ICdjdHJsKyc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5zaGlmdEtleSkge1xuXHRcdFx0cmVzdWx0ICs9ICdzaGlmdCsnO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuYWx0S2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ2FsdCsnO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQubWV0YUtleSkge1xuXHRcdFx0cmVzdWx0ICs9ICdtZXRhKyc7XG5cdFx0fVxuXHRcdHJlc3VsdCArPSBLZXlDb2RlVXRpbHMudG9TdHJpbmcoY2hvcmQua2V5Q29kZSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRTaW5nbGVNb2RpZmllckNob3JkRGlzcGF0Y2goY2hvcmQ6IEtleUNvZGVDaG9yZCk6IFNpbmdsZU1vZGlmaWVyQ2hvcmQgfCBudWxsIHtcblx0XHRpZiAoY2hvcmQua2V5Q29kZSA9PT0gS2V5Q29kZS5DdHJsICYmICFjaG9yZC5zaGlmdEtleSAmJiAhY2hvcmQuYWx0S2V5ICYmICFjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXR1cm4gJ2N0cmwnO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQua2V5Q29kZSA9PT0gS2V5Q29kZS5TaGlmdCAmJiAhY2hvcmQuY3RybEtleSAmJiAhY2hvcmQuYWx0S2V5ICYmICFjaG9yZC5tZXRhS2V5KSB7XG5cdFx0XHRyZXR1cm4gJ3NoaWZ0Jztcblx0XHR9XG5cdFx0aWYgKGNob3JkLmtleUNvZGUgPT09IEtleUNvZGUuQWx0ICYmICFjaG9yZC5jdHJsS2V5ICYmICFjaG9yZC5zaGlmdEtleSAmJiAhY2hvcmQubWV0YUtleSkge1xuXHRcdFx0cmV0dXJuICdhbHQnO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQua2V5Q29kZSA9PT0gS2V5Q29kZS5NZXRhICYmICFjaG9yZC5jdHJsS2V5ICYmICFjaG9yZC5zaGlmdEtleSAmJiAhY2hvcmQuYWx0S2V5KSB7XG5cdFx0XHRyZXR1cm4gJ21ldGEnO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIGdldFByb2R1Y2VkQ2hhckNvZGUoY2hvcmQ6IFNjYW5Db2RlQ2hvcmQsIG1hcHBpbmc6IElTY2FuQ29kZU1hcHBpbmcpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIW1hcHBpbmcpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuY3RybEtleSAmJiBjaG9yZC5zaGlmdEtleSAmJiBjaG9yZC5hbHRLZXkpIHtcblx0XHRcdHJldHVybiBtYXBwaW5nLndpdGhTaGlmdEFsdEdyO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuY3RybEtleSAmJiBjaG9yZC5hbHRLZXkpIHtcblx0XHRcdHJldHVybiBtYXBwaW5nLndpdGhBbHRHcjtcblx0XHR9XG5cdFx0aWYgKGNob3JkLnNoaWZ0S2V5KSB7XG5cdFx0XHRyZXR1cm4gbWFwcGluZy53aXRoU2hpZnQ7XG5cdFx0fVxuXHRcdHJldHVybiBtYXBwaW5nLnZhbHVlO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXRQcm9kdWNlZENoYXIoY2hvcmQ6IFNjYW5Db2RlQ2hvcmQsIG1hcHBpbmc6IElTY2FuQ29kZU1hcHBpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoYXIgPSB0aGlzLmdldFByb2R1Y2VkQ2hhckNvZGUoY2hvcmQsIG1hcHBpbmcpO1xuXHRcdGlmIChjaGFyID09PSBudWxsIHx8IGNoYXIubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyAtLS0gJztcblx0XHR9XG5cdFx0cmV0dXJuICcgICcgKyBjaGFyICsgJyAgJztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV2luZG93c0tleWJvYXJkTWFwcGVyIGltcGxlbWVudHMgSUtleWJvYXJkTWFwcGVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlSW5mbzogSVNjYW5Db2RlTWFwcGluZ1tdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2FuQ29kZVRvS2V5Q29kZTogS2V5Q29kZVtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXlDb2RlVG9MYWJlbDogQXJyYXk8c3RyaW5nIHwgbnVsbD4gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfa2V5Q29kZUV4aXN0czogYm9vbGVhbltdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzVVNTdGFuZGFyZDogYm9vbGVhbixcblx0XHRyYXdNYXBwaW5nczogSVdpbmRvd3NLZXlib2FyZE1hcHBpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbWFwQWx0R3JUb0N0cmxBbHQ6IGJvb2xlYW5cblx0KSB7XG5cdFx0dGhpcy5fc2NhbkNvZGVUb0tleUNvZGUgPSBbXTtcblx0XHR0aGlzLl9rZXlDb2RlVG9MYWJlbCA9IFtdO1xuXHRcdHRoaXMuX2tleUNvZGVFeGlzdHMgPSBbXTtcblx0XHR0aGlzLl9rZXlDb2RlVG9MYWJlbFtLZXlDb2RlLlVua25vd25dID0gS2V5Q29kZVV0aWxzLnRvU3RyaW5nKEtleUNvZGUuVW5rbm93bik7XG5cblx0XHRmb3IgKGxldCBzY2FuQ29kZSA9IFNjYW5Db2RlLk5vbmU7IHNjYW5Db2RlIDwgU2NhbkNvZGUuTUFYX1ZBTFVFOyBzY2FuQ29kZSsrKSB7XG5cdFx0XHRjb25zdCBpbW11dGFibGVLZXlDb2RlID0gSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbc2NhbkNvZGVdO1xuXHRcdFx0aWYgKGltbXV0YWJsZUtleUNvZGUgIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0tleUNvZGVbc2NhbkNvZGVdID0gaW1tdXRhYmxlS2V5Q29kZTtcblx0XHRcdFx0dGhpcy5fa2V5Q29kZVRvTGFiZWxbaW1tdXRhYmxlS2V5Q29kZV0gPSBLZXlDb2RlVXRpbHMudG9TdHJpbmcoaW1tdXRhYmxlS2V5Q29kZSk7XG5cdFx0XHRcdHRoaXMuX2tleUNvZGVFeGlzdHNbaW1tdXRhYmxlS2V5Q29kZV0gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHByb2R1Y2VzTGV0dGVyOiBib29sZWFuW10gPSBbXTtcblx0XHRsZXQgcHJvZHVjZXNMZXR0ZXJzID0gZmFsc2U7XG5cblx0XHR0aGlzLl9jb2RlSW5mbyA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc3RyQ29kZSBpbiByYXdNYXBwaW5ncykge1xuXHRcdFx0aWYgKHJhd01hcHBpbmdzLmhhc093blByb3BlcnR5KHN0ckNvZGUpKSB7XG5cdFx0XHRcdGNvbnN0IHNjYW5Db2RlID0gU2NhbkNvZGVVdGlscy50b0VudW0oc3RyQ29kZSk7XG5cdFx0XHRcdGlmIChzY2FuQ29kZSA9PT0gU2NhbkNvZGUuTm9uZSkge1xuXHRcdFx0XHRcdGxvZyhgVW5rbm93biBzY2FuQ29kZSAke3N0ckNvZGV9IGluIG1hcHBpbmcuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmF3TWFwcGluZyA9IHJhd01hcHBpbmdzW3N0ckNvZGVdO1xuXG5cdFx0XHRcdGNvbnN0IGltbXV0YWJsZUtleUNvZGUgPSBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtzY2FuQ29kZV07XG5cdFx0XHRcdGlmIChpbW11dGFibGVLZXlDb2RlICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5Q29kZSA9IE5BVElWRV9XSU5ET1dTX0tFWV9DT0RFX1RPX0tFWV9DT0RFW3Jhd01hcHBpbmcudmtleV0gfHwgS2V5Q29kZS5Vbmtub3duO1xuXHRcdFx0XHRcdGlmIChrZXlDb2RlID09PSBLZXlDb2RlLlVua25vd24gfHwgaW1tdXRhYmxlS2V5Q29kZSA9PT0ga2V5Q29kZSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChzY2FuQ29kZSAhPT0gU2NhbkNvZGUuTnVtcGFkQ29tbWEpIHtcblx0XHRcdFx0XHRcdC8vIExvb2tzIGxpa2UgU2NhbkNvZGUuTnVtcGFkQ29tbWEgZG9lc24ndCBhbHdheXMgbWFwIHRvIEtleUNvZGUuTlVNUEFEX1NFUEFSQVRPUlxuXHRcdFx0XHRcdFx0Ly8gZS5nLiBvbiBQT1IgLSBQVEJcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcmF3TWFwcGluZy52YWx1ZTtcblx0XHRcdFx0Y29uc3Qgd2l0aFNoaWZ0ID0gcmF3TWFwcGluZy53aXRoU2hpZnQ7XG5cdFx0XHRcdGNvbnN0IHdpdGhBbHRHciA9IHJhd01hcHBpbmcud2l0aEFsdEdyO1xuXHRcdFx0XHRjb25zdCB3aXRoU2hpZnRBbHRHciA9IHJhd01hcHBpbmcud2l0aFNoaWZ0QWx0R3I7XG5cdFx0XHRcdGNvbnN0IGtleUNvZGUgPSBOQVRJVkVfV0lORE9XU19LRVlfQ09ERV9UT19LRVlfQ09ERVtyYXdNYXBwaW5nLnZrZXldIHx8IEtleUNvZGUuVW5rbm93bjtcblxuXHRcdFx0XHRjb25zdCBtYXBwaW5nOiBJU2NhbkNvZGVNYXBwaW5nID0ge1xuXHRcdFx0XHRcdHNjYW5Db2RlOiBzY2FuQ29kZSxcblx0XHRcdFx0XHRrZXlDb2RlOiBrZXlDb2RlLFxuXHRcdFx0XHRcdHZhbHVlOiB2YWx1ZSxcblx0XHRcdFx0XHR3aXRoU2hpZnQ6IHdpdGhTaGlmdCxcblx0XHRcdFx0XHR3aXRoQWx0R3I6IHdpdGhBbHRHcixcblx0XHRcdFx0XHR3aXRoU2hpZnRBbHRHcjogd2l0aFNoaWZ0QWx0R3IsXG5cdFx0XHRcdH07XG5cdFx0XHRcdHRoaXMuX2NvZGVJbmZvW3NjYW5Db2RlXSA9IG1hcHBpbmc7XG5cdFx0XHRcdHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlW3NjYW5Db2RlXSA9IGtleUNvZGU7XG5cblx0XHRcdFx0aWYgKGtleUNvZGUgPT09IEtleUNvZGUuVW5rbm93bikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2tleUNvZGVFeGlzdHNba2V5Q29kZV0gPSB0cnVlO1xuXG5cdFx0XHRcdGlmICh2YWx1ZS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBUaGlzIGtleSBkb2VzIG5vdCBwcm9kdWNlIHN0cmluZ3Ncblx0XHRcdFx0XHR0aGlzLl9rZXlDb2RlVG9MYWJlbFtrZXlDb2RlXSA9IG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbHNlIGlmICh2YWx1ZS5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBrZXkgcHJvZHVjZXMgYSBsZXR0ZXIgcmVwcmVzZW50YWJsZSB3aXRoIG11bHRpcGxlIFVURi0xNiBjb2RlIHVuaXRzLlxuXHRcdFx0XHRcdHRoaXMuX2tleUNvZGVUb0xhYmVsW2tleUNvZGVdID0gdmFsdWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBjaGFyQ29kZSA9IHZhbHVlLmNoYXJDb2RlQXQoMCk7XG5cblx0XHRcdFx0XHRpZiAoY2hhckNvZGUgPj0gQ2hhckNvZGUuYSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS56KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cHBlckNhc2VWYWx1ZSA9IENoYXJDb2RlLkEgKyAoY2hhckNvZGUgLSBDaGFyQ29kZS5hKTtcblx0XHRcdFx0XHRcdHByb2R1Y2VzTGV0dGVyW3VwcGVyQ2FzZVZhbHVlXSA9IHRydWU7XG5cdFx0XHRcdFx0XHRwcm9kdWNlc0xldHRlcnMgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5fa2V5Q29kZVRvTGFiZWxba2V5Q29kZV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKENoYXJDb2RlLkEgKyAoY2hhckNvZGUgLSBDaGFyQ29kZS5hKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZWxzZSBpZiAoY2hhckNvZGUgPj0gQ2hhckNvZGUuQSAmJiBjaGFyQ29kZSA8PSBDaGFyQ29kZS5aKSB7XG5cdFx0XHRcdFx0XHRwcm9kdWNlc0xldHRlcltjaGFyQ29kZV0gPSB0cnVlO1xuXHRcdFx0XHRcdFx0cHJvZHVjZXNMZXR0ZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRoaXMuX2tleUNvZGVUb0xhYmVsW2tleUNvZGVdID0gdmFsdWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9rZXlDb2RlVG9MYWJlbFtrZXlDb2RlXSA9IHZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBrZXlib2FyZCBsYXlvdXRzIHdoZXJlIGxhdGluIGNoYXJhY3RlcnMgYXJlIG5vdCBwcm9kdWNlZCBlLmcuIEN5cmlsbGljXG5cdFx0Y29uc3QgX3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nID0gKGNoYXJDb2RlOiBDaGFyQ29kZSwga2V5Q29kZTogS2V5Q29kZSk6IHZvaWQgPT4ge1xuXHRcdFx0aWYgKCFwcm9kdWNlc0xldHRlcltjaGFyQ29kZV0pIHtcblx0XHRcdFx0dGhpcy5fa2V5Q29kZVRvTGFiZWxba2V5Q29kZV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGNoYXJDb2RlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5BLCBLZXlDb2RlLktleUEpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5CLCBLZXlDb2RlLktleUIpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5DLCBLZXlDb2RlLktleUMpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5ELCBLZXlDb2RlLktleUQpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5FLCBLZXlDb2RlLktleUUpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5GLCBLZXlDb2RlLktleUYpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5HLCBLZXlDb2RlLktleUcpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5ILCBLZXlDb2RlLktleUgpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5JLCBLZXlDb2RlLktleUkpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5KLCBLZXlDb2RlLktleUopO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5LLCBLZXlDb2RlLktleUspO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5MLCBLZXlDb2RlLktleUwpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5NLCBLZXlDb2RlLktleU0pO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5OLCBLZXlDb2RlLktleU4pO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5PLCBLZXlDb2RlLktleU8pO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5QLCBLZXlDb2RlLktleVApO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5RLCBLZXlDb2RlLktleVEpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5SLCBLZXlDb2RlLktleVIpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5TLCBLZXlDb2RlLktleVMpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5ULCBLZXlDb2RlLktleVQpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5VLCBLZXlDb2RlLktleVUpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5WLCBLZXlDb2RlLktleVYpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5XLCBLZXlDb2RlLktleVcpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5YLCBLZXlDb2RlLktleVgpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5ZLCBLZXlDb2RlLktleVkpO1xuXHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5aLCBLZXlDb2RlLktleVopO1xuXG5cdFx0aWYgKCFwcm9kdWNlc0xldHRlcnMpIHtcblx0XHRcdC8vIFNpbmNlIHRoaXMga2V5Ym9hcmQgbGF5b3V0IHByb2R1Y2VzIG5vIGxhdGluIGxldHRlcnMgYXQgYWxsLCBtb3N0IG9mIHRoZSBVSSB3aWxsIHVzZSB0aGVcblx0XHRcdC8vIFVTIGtiIGxheW91dCBlcXVpdmFsZW50IGZvciBVSSBsYWJlbHMsIHNvIGFsc28gdHJ5IHRvIHJlbmRlciBvdGhlciBrZXlzIHdpdGggdGhlIFVTIGxhYmVsc1xuXHRcdFx0Ly8gZm9yIGNvbnNpc3RlbmN5Li4uXG5cdFx0XHRjb25zdCBfcmVnaXN0ZXJMYWJlbCA9IChrZXlDb2RlOiBLZXlDb2RlLCBjaGFyQ29kZTogQ2hhckNvZGUpOiB2b2lkID0+IHtcblx0XHRcdFx0Ly8gY29uc3QgZXhpc3RpbmdMYWJlbCA9IHRoaXMuX2tleUNvZGVUb0xhYmVsW2tleUNvZGVdO1xuXHRcdFx0XHQvLyBjb25zdCBleGlzdGluZ0NoYXJDb2RlID0gKGV4aXN0aW5nTGFiZWwgPyBleGlzdGluZ0xhYmVsLmNoYXJDb2RlQXQoMCkgOiBDaGFyQ29kZS5OdWxsKTtcblx0XHRcdFx0Ly8gaWYgKGV4aXN0aW5nQ2hhckNvZGUgPCAzMiB8fCBleGlzdGluZ0NoYXJDb2RlID4gMTI2KSB7XG5cdFx0XHRcdHRoaXMuX2tleUNvZGVUb0xhYmVsW2tleUNvZGVdID0gU3RyaW5nLmZyb21DaGFyQ29kZShjaGFyQ29kZSk7XG5cdFx0XHRcdC8vIH1cblx0XHRcdH07XG5cdFx0XHRfcmVnaXN0ZXJMYWJlbChLZXlDb2RlLlNlbWljb2xvbiwgQ2hhckNvZGUuU2VtaWNvbG9uKTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuRXF1YWwsIENoYXJDb2RlLkVxdWFscyk7XG5cdFx0XHRfcmVnaXN0ZXJMYWJlbChLZXlDb2RlLkNvbW1hLCBDaGFyQ29kZS5Db21tYSk7XG5cdFx0XHRfcmVnaXN0ZXJMYWJlbChLZXlDb2RlLk1pbnVzLCBDaGFyQ29kZS5EYXNoKTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuUGVyaW9kLCBDaGFyQ29kZS5QZXJpb2QpO1xuXHRcdFx0X3JlZ2lzdGVyTGFiZWwoS2V5Q29kZS5TbGFzaCwgQ2hhckNvZGUuU2xhc2gpO1xuXHRcdFx0X3JlZ2lzdGVyTGFiZWwoS2V5Q29kZS5CYWNrcXVvdGUsIENoYXJDb2RlLkJhY2tUaWNrKTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuQnJhY2tldExlZnQsIENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0KTtcblx0XHRcdF9yZWdpc3RlckxhYmVsKEtleUNvZGUuQmFja3NsYXNoLCBDaGFyQ29kZS5CYWNrc2xhc2gpO1xuXHRcdFx0X3JlZ2lzdGVyTGFiZWwoS2V5Q29kZS5CcmFja2V0UmlnaHQsIENoYXJDb2RlLkNsb3NlU3F1YXJlQnJhY2tldCk7XG5cdFx0XHRfcmVnaXN0ZXJMYWJlbChLZXlDb2RlLlF1b3RlLCBDaGFyQ29kZS5TaW5nbGVRdW90ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGR1bXBEZWJ1Z0luZm8oKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBpbW11dGFibGVTYW1wbGVzID0gW1xuXHRcdFx0U2NhbkNvZGUuQXJyb3dVcCxcblx0XHRcdFNjYW5Db2RlLk51bXBhZDBcblx0XHRdO1xuXG5cdFx0bGV0IGNudCA9IDA7XG5cdFx0cmVzdWx0LnB1c2goYC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tYCk7XG5cdFx0Zm9yIChsZXQgc2NhbkNvZGUgPSBTY2FuQ29kZS5Ob25lOyBzY2FuQ29kZSA8IFNjYW5Db2RlLk1BWF9WQUxVRTsgc2NhbkNvZGUrKykge1xuXHRcdFx0aWYgKElNTVVUQUJMRV9DT0RFX1RPX0tFWV9DT0RFW3NjYW5Db2RlXSAhPT0gS2V5Q29kZS5EZXBlbmRzT25LYkxheW91dCkge1xuXHRcdFx0XHRpZiAoaW1tdXRhYmxlU2FtcGxlcy5pbmRleE9mKHNjYW5Db2RlKSA9PT0gLTEpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY250ICUgNiA9PT0gMCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaChgfCAgICAgICBIVyBDb2RlIGNvbWJpbmF0aW9uICAgICAgfCAgS2V5ICB8ICAgIEtleUNvZGUgY29tYmluYXRpb24gICAgfCAgICAgICAgICBVSSBsYWJlbCAgICAgICAgIHwgICAgICAgIFVzZXIgc2V0dGluZ3MgICAgICAgfCBXWVNJV1lHIHxgKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goYC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tYCk7XG5cdFx0XHR9XG5cdFx0XHRjbnQrKztcblxuXHRcdFx0Y29uc3QgbWFwcGluZyA9IHRoaXMuX2NvZGVJbmZvW3NjYW5Db2RlXTtcblx0XHRcdGNvbnN0IHN0ckNvZGUgPSBTY2FuQ29kZVV0aWxzLnRvU3RyaW5nKHNjYW5Db2RlKTtcblxuXHRcdFx0Y29uc3QgbW9kcyA9IFswYjAwMCwgMGIwMTAsIDBiMTAxLCAwYjExMV07XG5cdFx0XHRmb3IgKGNvbnN0IG1vZCBvZiBtb2RzKSB7XG5cdFx0XHRcdGNvbnN0IGN0cmxLZXkgPSAobW9kICYgMGIwMDEpID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBzaGlmdEtleSA9IChtb2QgJiAwYjAxMCkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRcdGNvbnN0IGFsdEtleSA9IChtb2QgJiAwYjEwMCkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHNjYW5Db2RlQ2hvcmQgPSBuZXcgU2NhbkNvZGVDaG9yZChjdHJsS2V5LCBzaGlmdEtleSwgYWx0S2V5LCBmYWxzZSwgc2NhbkNvZGUpO1xuXHRcdFx0XHRjb25zdCBrZXlDb2RlQ2hvcmQgPSB0aGlzLl9yZXNvbHZlQ2hvcmQoc2NhbkNvZGVDaG9yZCk7XG5cdFx0XHRcdGNvbnN0IHN0cktleUNvZGUgPSAoa2V5Q29kZUNob3JkID8gS2V5Q29kZVV0aWxzLnRvU3RyaW5nKGtleUNvZGVDaG9yZC5rZXlDb2RlKSA6IG51bGwpO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZEtiID0gKGtleUNvZGVDaG9yZCA/IG5ldyBXaW5kb3dzTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nKHRoaXMsIFtrZXlDb2RlQ2hvcmRdKSA6IG51bGwpO1xuXG5cdFx0XHRcdGNvbnN0IG91dFNjYW5Db2RlID0gYCR7Y3RybEtleSA/ICdDdHJsKycgOiAnJ30ke3NoaWZ0S2V5ID8gJ1NoaWZ0KycgOiAnJ30ke2FsdEtleSA/ICdBbHQrJyA6ICcnfSR7c3RyQ29kZX1gO1xuXHRcdFx0XHRjb25zdCBhcmlhTGFiZWwgPSAocmVzb2x2ZWRLYiA/IHJlc29sdmVkS2IuZ2V0QXJpYUxhYmVsKCkgOiBudWxsKTtcblx0XHRcdFx0Y29uc3Qgb3V0VUlMYWJlbCA9IChhcmlhTGFiZWwgPyBhcmlhTGFiZWwucmVwbGFjZSgvQ29udHJvbFxcKy8sICdDdHJsKycpIDogbnVsbCk7XG5cdFx0XHRcdGNvbnN0IG91dFVzZXJTZXR0aW5ncyA9IChyZXNvbHZlZEtiID8gcmVzb2x2ZWRLYi5nZXRVc2VyU2V0dGluZ3NMYWJlbCgpIDogbnVsbCk7XG5cdFx0XHRcdGNvbnN0IG91dEtleSA9IFdpbmRvd3NOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmcuZ2V0UHJvZHVjZWRDaGFyKHNjYW5Db2RlQ2hvcmQsIG1hcHBpbmcpO1xuXHRcdFx0XHRjb25zdCBvdXRLYiA9IChzdHJLZXlDb2RlID8gYCR7Y3RybEtleSA/ICdDdHJsKycgOiAnJ30ke3NoaWZ0S2V5ID8gJ1NoaWZ0KycgOiAnJ30ke2FsdEtleSA/ICdBbHQrJyA6ICcnfSR7c3RyS2V5Q29kZX1gIDogbnVsbCk7XG5cdFx0XHRcdGNvbnN0IGlzV1lTSVdZRyA9IChyZXNvbHZlZEtiID8gcmVzb2x2ZWRLYi5pc1dZU0lXWUcoKSA6IGZhbHNlKTtcblx0XHRcdFx0Y29uc3Qgb3V0V1lTSVdZRyA9IChpc1dZU0lXWUcgPyAnICAgICAgICcgOiAnICAgTk8gICcpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChgfCAke3RoaXMuX2xlZnRQYWQob3V0U2NhbkNvZGUsIDMwKX0gfCAke291dEtleX0gfCAke3RoaXMuX2xlZnRQYWQob3V0S2IsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQob3V0VUlMYWJlbCwgMjUpfSB8ICAke3RoaXMuX2xlZnRQYWQob3V0VXNlclNldHRpbmdzLCAyNSl9IHwgJHtvdXRXWVNJV1lHfSB8YCk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaChgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcblx0XHR9XG5cblxuXHRcdHJldHVybiByZXN1bHQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIF9sZWZ0UGFkKHN0cjogc3RyaW5nIHwgbnVsbCwgY250OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGlmIChzdHIgPT09IG51bGwpIHtcblx0XHRcdHN0ciA9ICdudWxsJztcblx0XHR9XG5cdFx0d2hpbGUgKHN0ci5sZW5ndGggPCBjbnQpIHtcblx0XHRcdHN0ciA9ICcgJyArIHN0cjtcblx0XHR9XG5cdFx0cmV0dXJuIHN0cjtcblx0fVxuXG5cdHB1YmxpYyBnZXRVSUxhYmVsRm9yS2V5Q29kZShrZXlDb2RlOiBLZXlDb2RlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0TGFiZWxGb3JLZXlDb2RlKGtleUNvZGUpO1xuXHR9XG5cblx0cHVibGljIGdldEFyaWFMYWJlbEZvcktleUNvZGUoa2V5Q29kZTogS2V5Q29kZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldExhYmVsRm9yS2V5Q29kZShrZXlDb2RlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRVc2VyU2V0dGluZ3NMYWJlbEZvcktleUNvZGUoa2V5Q29kZTogS2V5Q29kZSk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX2lzVVNTdGFuZGFyZCkge1xuXHRcdFx0cmV0dXJuIEtleUNvZGVVdGlscy50b1VzZXJTZXR0aW5nc1VTKGtleUNvZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvVXNlclNldHRpbmdzR2VuZXJhbChrZXlDb2RlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbGVjdHJvbkFjY2VsZXJhdG9yRm9yS2V5QmluZGluZyhjaG9yZDogS2V5Q29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIEtleUNvZGVVdGlscy50b0VsZWN0cm9uQWNjZWxlcmF0b3IoY2hvcmQua2V5Q29kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYWJlbEZvcktleUNvZGUoa2V5Q29kZTogS2V5Q29kZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2tleUNvZGVUb0xhYmVsW2tleUNvZGVdIHx8IEtleUNvZGVVdGlscy50b1N0cmluZyhLZXlDb2RlLlVua25vd24pO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVLZXlib2FyZEV2ZW50KGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KTogV2luZG93c05hdGl2ZVJlc29sdmVkS2V5YmluZGluZyB7XG5cdFx0Y29uc3QgY3RybEtleSA9IGtleWJvYXJkRXZlbnQuY3RybEtleSB8fCAodGhpcy5fbWFwQWx0R3JUb0N0cmxBbHQgJiYga2V5Ym9hcmRFdmVudC5hbHRHcmFwaEtleSk7XG5cdFx0Y29uc3QgYWx0S2V5ID0ga2V5Ym9hcmRFdmVudC5hbHRLZXkgfHwgKHRoaXMuX21hcEFsdEdyVG9DdHJsQWx0ICYmIGtleWJvYXJkRXZlbnQuYWx0R3JhcGhLZXkpO1xuXHRcdGNvbnN0IGNob3JkID0gbmV3IEtleUNvZGVDaG9yZChjdHJsS2V5LCBrZXlib2FyZEV2ZW50LnNoaWZ0S2V5LCBhbHRLZXksIGtleWJvYXJkRXZlbnQubWV0YUtleSwga2V5Ym9hcmRFdmVudC5rZXlDb2RlKTtcblx0XHRyZXR1cm4gbmV3IFdpbmRvd3NOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmcodGhpcywgW2Nob3JkXSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQ2hvcmQoY2hvcmQ6IENob3JkIHwgbnVsbCk6IEtleUNvZGVDaG9yZCB8IG51bGwge1xuXHRcdGlmICghY2hvcmQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQgaW5zdGFuY2VvZiBLZXlDb2RlQ2hvcmQpIHtcblx0XHRcdGlmICghdGhpcy5fa2V5Q29kZUV4aXN0c1tjaG9yZC5rZXlDb2RlXSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjaG9yZDtcblx0XHR9XG5cdFx0Y29uc3Qga2V5Q29kZSA9IHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlW2Nob3JkLnNjYW5Db2RlXSB8fCBLZXlDb2RlLlVua25vd247XG5cdFx0aWYgKGtleUNvZGUgPT09IEtleUNvZGUuVW5rbm93biB8fCAhdGhpcy5fa2V5Q29kZUV4aXN0c1trZXlDb2RlXSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgS2V5Q29kZUNob3JkKGNob3JkLmN0cmxLZXksIGNob3JkLnNoaWZ0S2V5LCBjaG9yZC5hbHRLZXksIGNob3JkLm1ldGFLZXksIGtleUNvZGUpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVLZXliaW5kaW5nKGtleWJpbmRpbmc6IEtleWJpbmRpbmcpOiBSZXNvbHZlZEtleWJpbmRpbmdbXSB7XG5cdFx0Y29uc3QgY2hvcmRzOiBLZXlDb2RlQ2hvcmRbXSA9IHRvRW1wdHlBcnJheUlmQ29udGFpbnNOdWxsKGtleWJpbmRpbmcuY2hvcmRzLm1hcChjaG9yZCA9PiB0aGlzLl9yZXNvbHZlQ2hvcmQoY2hvcmQpKSk7XG5cdFx0aWYgKGNob3Jkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gW25ldyBXaW5kb3dzTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nKHRoaXMsIGNob3JkcyldO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsU0FBUyxjQUFjLDRCQUE0QixVQUFVLGVBQWUsMkNBQTJDO0FBQ2hJLFNBQTZCLGNBQW1DLHFCQUF3QztBQUN4RyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUdoQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGtDQUFrQztBQUczQyxNQUFNLE1BQU07QUFDWixTQUFTLElBQUksS0FBbUI7QUFDL0IsTUFBSSxLQUFLO0FBQ1IsWUFBUSxLQUFLLEdBQUc7QUFBQSxFQUNqQjtBQUNEO0FBWU8sTUFBTSx3Q0FBd0MsdUJBQXFDO0FBQUEsRUFJekYsWUFBWSxRQUErQixRQUF3QjtBQUNsRSxVQUFNLGdCQUFnQixTQUFTLE1BQU07QUFDckMsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUVVLFVBQVUsT0FBb0M7QUFDdkQsUUFBSSxNQUFNLHdCQUF3QixHQUFHO0FBQ3BDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLFFBQVEscUJBQXFCLE1BQU0sT0FBTztBQUFBLEVBQ3ZEO0FBQUEsRUFFUSx5QkFBeUIsT0FBb0M7QUFDcEUsUUFBSSxNQUFNLHdCQUF3QixHQUFHO0FBQ3BDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxhQUFhLFNBQVMsTUFBTSxPQUFPO0FBQUEsRUFDM0M7QUFBQSxFQUVPLGFBQTRCO0FBQ2xDLFdBQU8sZ0JBQWdCLFFBQVEsS0FBSyxLQUFLLEtBQUssU0FBUyxDQUFDLGVBQWUsS0FBSyx5QkFBeUIsVUFBVSxDQUFDO0FBQUEsRUFDakg7QUFBQSxFQUVVLGNBQWMsT0FBb0M7QUFDM0QsUUFBSSxNQUFNLHdCQUF3QixHQUFHO0FBQ3BDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLFFBQVEsdUJBQXVCLE1BQU0sT0FBTztBQUFBLEVBQ3pEO0FBQUEsRUFF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QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBQ2pELDZCQUF5QixTQUFTLEdBQUcsUUFBUSxJQUFJO0FBRWpELFFBQUksQ0FBQyxpQkFBaUI7QUFJckIsWUFBTSxpQkFBaUIsQ0FBQyxTQUFrQixhQUE2QjtBQUl0RSxhQUFLLGdCQUFnQixPQUFPLElBQUks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
