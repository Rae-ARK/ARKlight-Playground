import { CharCode } from "../../../../base/common/charCode.js";
import { KeyCode, KeyCodeUtils, IMMUTABLE_CODE_TO_KEY_CODE, IMMUTABLE_KEY_CODE_TO_CODE, ScanCode, ScanCodeUtils, isModifierKey } from "../../../../base/common/keyCodes.js";
import { KeyCodeChord, ScanCodeChord } from "../../../../base/common/keybindings.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { BaseResolvedKeybinding } from "../../../../platform/keybinding/common/baseResolvedKeybinding.js";
const CHAR_CODE_TO_KEY_CODE = [];
class NativeResolvedKeybinding extends BaseResolvedKeybinding {
  constructor(mapper, os, chords) {
    super(os, chords);
    this._mapper = mapper;
  }
  _getLabel(chord) {
    return this._mapper.getUILabelForScanCodeChord(chord);
  }
  _getAriaLabel(chord) {
    return this._mapper.getAriaLabelForScanCodeChord(chord);
  }
  _getElectronAccelerator(chord) {
    return this._mapper.getElectronAcceleratorLabelForScanCodeChord(chord);
  }
  _getUserSettingsLabel(chord) {
    return this._mapper.getUserSettingsLabelForScanCodeChord(chord);
  }
  _isWYSIWYG(binding) {
    if (!binding) {
      return true;
    }
    if (IMMUTABLE_CODE_TO_KEY_CODE[binding.scanCode] !== KeyCode.DependsOnKbLayout) {
      return true;
    }
    const a = this._mapper.getAriaLabelForScanCodeChord(binding);
    const b = this._mapper.getUserSettingsLabelForScanCodeChord(binding);
    if (!a && !b) {
      return true;
    }
    if (!a || !b) {
      return false;
    }
    return a.toLowerCase() === b.toLowerCase();
  }
  _getChordDispatch(chord) {
    return this._mapper.getDispatchStrForScanCodeChord(chord);
  }
  _getSingleModifierChordDispatch(chord) {
    if ((chord.scanCode === ScanCode.ControlLeft || chord.scanCode === ScanCode.ControlRight) && !chord.shiftKey && !chord.altKey && !chord.metaKey) {
      return "ctrl";
    }
    if ((chord.scanCode === ScanCode.AltLeft || chord.scanCode === ScanCode.AltRight) && !chord.ctrlKey && !chord.shiftKey && !chord.metaKey) {
      return "alt";
    }
    if ((chord.scanCode === ScanCode.ShiftLeft || chord.scanCode === ScanCode.ShiftRight) && !chord.ctrlKey && !chord.altKey && !chord.metaKey) {
      return "shift";
    }
    if ((chord.scanCode === ScanCode.MetaLeft || chord.scanCode === ScanCode.MetaRight) && !chord.ctrlKey && !chord.shiftKey && !chord.altKey) {
      return "meta";
    }
    return null;
  }
}
class ScanCodeCombo {
  constructor(ctrlKey, shiftKey, altKey, scanCode) {
    this.ctrlKey = ctrlKey;
    this.shiftKey = shiftKey;
    this.altKey = altKey;
    this.scanCode = scanCode;
  }
  toString() {
    return `${this.ctrlKey ? "Ctrl+" : ""}${this.shiftKey ? "Shift+" : ""}${this.altKey ? "Alt+" : ""}${ScanCodeUtils.toString(this.scanCode)}`;
  }
  equals(other) {
    return this.ctrlKey === other.ctrlKey && this.shiftKey === other.shiftKey && this.altKey === other.altKey && this.scanCode === other.scanCode;
  }
  getProducedCharCode(mapping) {
    if (!mapping) {
      return "";
    }
    if (this.ctrlKey && this.shiftKey && this.altKey) {
      return mapping.withShiftAltGr;
    }
    if (this.ctrlKey && this.altKey) {
      return mapping.withAltGr;
    }
    if (this.shiftKey) {
      return mapping.withShift;
    }
    return mapping.value;
  }
  getProducedChar(mapping) {
    const charCode = MacLinuxKeyboardMapper.getCharCode(this.getProducedCharCode(mapping));
    if (charCode === 0) {
      return " --- ";
    }
    if (charCode >= CharCode.U_Combining_Grave_Accent && charCode <= CharCode.U_Combining_Latin_Small_Letter_X) {
      return "U+" + charCode.toString(16);
    }
    return "  " + String.fromCharCode(charCode) + "  ";
  }
}
class KeyCodeCombo {
  constructor(ctrlKey, shiftKey, altKey, keyCode) {
    this.ctrlKey = ctrlKey;
    this.shiftKey = shiftKey;
    this.altKey = altKey;
    this.keyCode = keyCode;
  }
  toString() {
    return `${this.ctrlKey ? "Ctrl+" : ""}${this.shiftKey ? "Shift+" : ""}${this.altKey ? "Alt+" : ""}${KeyCodeUtils.toString(this.keyCode)}`;
  }
}
class ScanCodeKeyCodeMapper {
  constructor() {
    /**
     * ScanCode combination => KeyCode combination.
     * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
     */
    this._scanCodeToKeyCode = [];
    /**
     * inverse of `_scanCodeToKeyCode`.
     * KeyCode combination => ScanCode combination.
     * Only covers relevant modifiers ctrl, shift, alt (since meta does not influence the mappings).
     */
    this._keyCodeToScanCode = [];
    this._scanCodeToKeyCode = [];
    this._keyCodeToScanCode = [];
  }
  registrationComplete() {
    this._moveToEnd(ScanCode.IntlHash);
    this._moveToEnd(ScanCode.IntlBackslash);
  }
  _moveToEnd(scanCode) {
    for (let mod = 0; mod < 8; mod++) {
      const encodedKeyCodeCombos = this._scanCodeToKeyCode[(scanCode << 3) + mod];
      if (!encodedKeyCodeCombos) {
        continue;
      }
      for (let i = 0, len = encodedKeyCodeCombos.length; i < len; i++) {
        const encodedScanCodeCombos = this._keyCodeToScanCode[encodedKeyCodeCombos[i]];
        if (encodedScanCodeCombos.length === 1) {
          continue;
        }
        for (let j = 0, len2 = encodedScanCodeCombos.length; j < len2; j++) {
          const entry = encodedScanCodeCombos[j];
          const entryScanCode = entry >>> 3;
          if (entryScanCode === scanCode) {
            for (let k = j + 1; k < len2; k++) {
              encodedScanCodeCombos[k - 1] = encodedScanCodeCombos[k];
            }
            encodedScanCodeCombos[len2 - 1] = entry;
          }
        }
      }
    }
  }
  registerIfUnknown(scanCodeCombo, keyCodeCombo) {
    if (keyCodeCombo.keyCode === KeyCode.Unknown) {
      return;
    }
    const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
    const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
    const keyCodeIsDigit = keyCodeCombo.keyCode >= KeyCode.Digit0 && keyCodeCombo.keyCode <= KeyCode.Digit9;
    const keyCodeIsLetter = keyCodeCombo.keyCode >= KeyCode.KeyA && keyCodeCombo.keyCode <= KeyCode.KeyZ;
    const existingKeyCodeCombos = this._scanCodeToKeyCode[scanCodeComboEncoded];
    if (keyCodeIsDigit || keyCodeIsLetter) {
      if (existingKeyCodeCombos) {
        for (let i = 0, len = existingKeyCodeCombos.length; i < len; i++) {
          if (existingKeyCodeCombos[i] === keyCodeComboEncoded) {
            return;
          }
        }
      }
    } else {
      if (existingKeyCodeCombos && existingKeyCodeCombos.length !== 0) {
        return;
      }
    }
    this._scanCodeToKeyCode[scanCodeComboEncoded] = this._scanCodeToKeyCode[scanCodeComboEncoded] || [];
    this._scanCodeToKeyCode[scanCodeComboEncoded].unshift(keyCodeComboEncoded);
    this._keyCodeToScanCode[keyCodeComboEncoded] = this._keyCodeToScanCode[keyCodeComboEncoded] || [];
    this._keyCodeToScanCode[keyCodeComboEncoded].unshift(scanCodeComboEncoded);
  }
  lookupKeyCodeCombo(keyCodeCombo) {
    const keyCodeComboEncoded = this._encodeKeyCodeCombo(keyCodeCombo);
    const scanCodeCombosEncoded = this._keyCodeToScanCode[keyCodeComboEncoded];
    if (!scanCodeCombosEncoded || scanCodeCombosEncoded.length === 0) {
      return [];
    }
    const result = [];
    for (let i = 0, len = scanCodeCombosEncoded.length; i < len; i++) {
      const scanCodeComboEncoded = scanCodeCombosEncoded[i];
      const ctrlKey = scanCodeComboEncoded & 1 ? true : false;
      const shiftKey = scanCodeComboEncoded & 2 ? true : false;
      const altKey = scanCodeComboEncoded & 4 ? true : false;
      const scanCode = scanCodeComboEncoded >>> 3;
      result[i] = new ScanCodeCombo(ctrlKey, shiftKey, altKey, scanCode);
    }
    return result;
  }
  lookupScanCodeCombo(scanCodeCombo) {
    const scanCodeComboEncoded = this._encodeScanCodeCombo(scanCodeCombo);
    const keyCodeCombosEncoded = this._scanCodeToKeyCode[scanCodeComboEncoded];
    if (!keyCodeCombosEncoded || keyCodeCombosEncoded.length === 0) {
      return [];
    }
    const result = [];
    for (let i = 0, len = keyCodeCombosEncoded.length; i < len; i++) {
      const keyCodeComboEncoded = keyCodeCombosEncoded[i];
      const ctrlKey = keyCodeComboEncoded & 1 ? true : false;
      const shiftKey = keyCodeComboEncoded & 2 ? true : false;
      const altKey = keyCodeComboEncoded & 4 ? true : false;
      const keyCode = keyCodeComboEncoded >>> 3;
      result[i] = new KeyCodeCombo(ctrlKey, shiftKey, altKey, keyCode);
    }
    return result;
  }
  guessStableKeyCode(scanCode) {
    if (scanCode >= ScanCode.Digit1 && scanCode <= ScanCode.Digit0) {
      switch (scanCode) {
        case ScanCode.Digit1:
          return KeyCode.Digit1;
        case ScanCode.Digit2:
          return KeyCode.Digit2;
        case ScanCode.Digit3:
          return KeyCode.Digit3;
        case ScanCode.Digit4:
          return KeyCode.Digit4;
        case ScanCode.Digit5:
          return KeyCode.Digit5;
        case ScanCode.Digit6:
          return KeyCode.Digit6;
        case ScanCode.Digit7:
          return KeyCode.Digit7;
        case ScanCode.Digit8:
          return KeyCode.Digit8;
        case ScanCode.Digit9:
          return KeyCode.Digit9;
        case ScanCode.Digit0:
          return KeyCode.Digit0;
      }
    }
    const keyCodeCombos1 = this.lookupScanCodeCombo(new ScanCodeCombo(false, false, false, scanCode));
    const keyCodeCombos2 = this.lookupScanCodeCombo(new ScanCodeCombo(false, true, false, scanCode));
    if (keyCodeCombos1.length === 1 && keyCodeCombos2.length === 1) {
      const shiftKey1 = keyCodeCombos1[0].shiftKey;
      const keyCode1 = keyCodeCombos1[0].keyCode;
      const shiftKey2 = keyCodeCombos2[0].shiftKey;
      const keyCode2 = keyCodeCombos2[0].keyCode;
      if (keyCode1 === keyCode2 && shiftKey1 !== shiftKey2) {
        return keyCode1;
      }
    }
    return KeyCode.DependsOnKbLayout;
  }
  _encodeScanCodeCombo(scanCodeCombo) {
    return this._encode(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, scanCodeCombo.scanCode);
  }
  _encodeKeyCodeCombo(keyCodeCombo) {
    return this._encode(keyCodeCombo.ctrlKey, keyCodeCombo.shiftKey, keyCodeCombo.altKey, keyCodeCombo.keyCode);
  }
  _encode(ctrlKey, shiftKey, altKey, principal) {
    return ((ctrlKey ? 1 : 0) << 0 | (shiftKey ? 1 : 0) << 1 | (altKey ? 1 : 0) << 2 | principal << 3) >>> 0;
  }
}
class MacLinuxKeyboardMapper {
  constructor(_isUSStandard, rawMappings, _mapAltGrToCtrlAlt, _OS) {
    this._isUSStandard = _isUSStandard;
    this._mapAltGrToCtrlAlt = _mapAltGrToCtrlAlt;
    this._OS = _OS;
    /**
     * UI label for a ScanCode.
     */
    this._scanCodeToLabel = [];
    /**
     * Dispatching string for a ScanCode.
     */
    this._scanCodeToDispatch = [];
    this._codeInfo = [];
    this._scanCodeKeyCodeMapper = new ScanCodeKeyCodeMapper();
    this._scanCodeToLabel = [];
    this._scanCodeToDispatch = [];
    const _registerIfUnknown = (hwCtrlKey, hwShiftKey, hwAltKey, scanCode, kbCtrlKey, kbShiftKey, kbAltKey, keyCode) => {
      this._scanCodeKeyCodeMapper.registerIfUnknown(
        new ScanCodeCombo(hwCtrlKey ? true : false, hwShiftKey ? true : false, hwAltKey ? true : false, scanCode),
        new KeyCodeCombo(kbCtrlKey ? true : false, kbShiftKey ? true : false, kbAltKey ? true : false, keyCode)
      );
    };
    const _registerAllCombos = (_ctrlKey, _shiftKey, _altKey, scanCode, keyCode) => {
      for (let ctrlKey = _ctrlKey; ctrlKey <= 1; ctrlKey++) {
        for (let shiftKey = _shiftKey; shiftKey <= 1; shiftKey++) {
          for (let altKey = _altKey; altKey <= 1; altKey++) {
            _registerIfUnknown(
              ctrlKey,
              shiftKey,
              altKey,
              scanCode,
              ctrlKey,
              shiftKey,
              altKey,
              keyCode
            );
          }
        }
      }
    };
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      this._scanCodeToLabel[scanCode] = null;
    }
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      this._scanCodeToDispatch[scanCode] = null;
    }
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      const keyCode = IMMUTABLE_CODE_TO_KEY_CODE[scanCode];
      if (keyCode !== KeyCode.DependsOnKbLayout) {
        _registerAllCombos(0, 0, 0, scanCode, keyCode);
        this._scanCodeToLabel[scanCode] = KeyCodeUtils.toString(keyCode);
        if (keyCode === KeyCode.Unknown || isModifierKey(keyCode)) {
          this._scanCodeToDispatch[scanCode] = null;
        } else {
          this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
        }
      }
    }
    const missingLatinLettersOverride = {};
    {
      const producesLatinLetter = [];
      for (const strScanCode in rawMappings) {
        if (rawMappings.hasOwnProperty(strScanCode)) {
          const scanCode = ScanCodeUtils.toEnum(strScanCode);
          if (scanCode === ScanCode.None) {
            continue;
          }
          if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
            continue;
          }
          const rawMapping = rawMappings[strScanCode];
          const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);
          if (value >= CharCode.a && value <= CharCode.z) {
            const upperCaseValue = CharCode.A + (value - CharCode.a);
            producesLatinLetter[upperCaseValue] = true;
          }
        }
      }
      const _registerLetterIfMissing = (charCode, scanCode, value, withShift) => {
        if (!producesLatinLetter[charCode]) {
          missingLatinLettersOverride[ScanCodeUtils.toString(scanCode)] = {
            value,
            withShift,
            withAltGr: "",
            withShiftAltGr: ""
          };
        }
      };
      _registerLetterIfMissing(CharCode.A, ScanCode.KeyA, "a", "A");
      _registerLetterIfMissing(CharCode.B, ScanCode.KeyB, "b", "B");
      _registerLetterIfMissing(CharCode.C, ScanCode.KeyC, "c", "C");
      _registerLetterIfMissing(CharCode.D, ScanCode.KeyD, "d", "D");
      _registerLetterIfMissing(CharCode.E, ScanCode.KeyE, "e", "E");
      _registerLetterIfMissing(CharCode.F, ScanCode.KeyF, "f", "F");
      _registerLetterIfMissing(CharCode.G, ScanCode.KeyG, "g", "G");
      _registerLetterIfMissing(CharCode.H, ScanCode.KeyH, "h", "H");
      _registerLetterIfMissing(CharCode.I, ScanCode.KeyI, "i", "I");
      _registerLetterIfMissing(CharCode.J, ScanCode.KeyJ, "j", "J");
      _registerLetterIfMissing(CharCode.K, ScanCode.KeyK, "k", "K");
      _registerLetterIfMissing(CharCode.L, ScanCode.KeyL, "l", "L");
      _registerLetterIfMissing(CharCode.M, ScanCode.KeyM, "m", "M");
      _registerLetterIfMissing(CharCode.N, ScanCode.KeyN, "n", "N");
      _registerLetterIfMissing(CharCode.O, ScanCode.KeyO, "o", "O");
      _registerLetterIfMissing(CharCode.P, ScanCode.KeyP, "p", "P");
      _registerLetterIfMissing(CharCode.Q, ScanCode.KeyQ, "q", "Q");
      _registerLetterIfMissing(CharCode.R, ScanCode.KeyR, "r", "R");
      _registerLetterIfMissing(CharCode.S, ScanCode.KeyS, "s", "S");
      _registerLetterIfMissing(CharCode.T, ScanCode.KeyT, "t", "T");
      _registerLetterIfMissing(CharCode.U, ScanCode.KeyU, "u", "U");
      _registerLetterIfMissing(CharCode.V, ScanCode.KeyV, "v", "V");
      _registerLetterIfMissing(CharCode.W, ScanCode.KeyW, "w", "W");
      _registerLetterIfMissing(CharCode.X, ScanCode.KeyX, "x", "X");
      _registerLetterIfMissing(CharCode.Y, ScanCode.KeyY, "y", "Y");
      _registerLetterIfMissing(CharCode.Z, ScanCode.KeyZ, "z", "Z");
    }
    const mappings = [];
    let mappingsLen = 0;
    for (const strScanCode in rawMappings) {
      if (rawMappings.hasOwnProperty(strScanCode)) {
        const scanCode = ScanCodeUtils.toEnum(strScanCode);
        if (scanCode === ScanCode.None) {
          continue;
        }
        if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
          continue;
        }
        this._codeInfo[scanCode] = rawMappings[strScanCode];
        const rawMapping = missingLatinLettersOverride[strScanCode] || rawMappings[strScanCode];
        const value = MacLinuxKeyboardMapper.getCharCode(rawMapping.value);
        const withShift = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShift);
        const withAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withAltGr);
        const withShiftAltGr = MacLinuxKeyboardMapper.getCharCode(rawMapping.withShiftAltGr);
        const mapping = {
          scanCode,
          value,
          withShift,
          withAltGr,
          withShiftAltGr
        };
        mappings[mappingsLen++] = mapping;
        this._scanCodeToDispatch[scanCode] = `[${ScanCodeUtils.toString(scanCode)}]`;
        if (value >= CharCode.a && value <= CharCode.z) {
          const upperCaseValue = CharCode.A + (value - CharCode.a);
          this._scanCodeToLabel[scanCode] = String.fromCharCode(upperCaseValue);
        } else if (value >= CharCode.A && value <= CharCode.Z) {
          this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
        } else if (value) {
          this._scanCodeToLabel[scanCode] = String.fromCharCode(value);
        } else {
          this._scanCodeToLabel[scanCode] = null;
        }
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const withShiftAltGr = mapping.withShiftAltGr;
      if (withShiftAltGr === mapping.withAltGr || withShiftAltGr === mapping.withShift || withShiftAltGr === mapping.value) {
        continue;
      }
      const kb = MacLinuxKeyboardMapper._charCodeToKb(withShiftAltGr);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(1, 1, 1, scanCode, 0, 1, 0, keyCode);
      } else {
        _registerIfUnknown(1, 1, 1, scanCode, 0, 0, 0, keyCode);
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const withAltGr = mapping.withAltGr;
      if (withAltGr === mapping.withShift || withAltGr === mapping.value) {
        continue;
      }
      const kb = MacLinuxKeyboardMapper._charCodeToKb(withAltGr);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(1, 0, 1, scanCode, 0, 1, 0, keyCode);
      } else {
        _registerIfUnknown(1, 0, 1, scanCode, 0, 0, 0, keyCode);
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const withShift = mapping.withShift;
      if (withShift === mapping.value) {
        continue;
      }
      const kb = MacLinuxKeyboardMapper._charCodeToKb(withShift);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode);
      } else {
        _registerIfUnknown(0, 1, 0, scanCode, 0, 0, 0, keyCode);
        _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 0, 1, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 0, 0, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 0, 1, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode);
      }
    }
    for (let i = mappings.length - 1; i >= 0; i--) {
      const mapping = mappings[i];
      const scanCode = mapping.scanCode;
      const kb = MacLinuxKeyboardMapper._charCodeToKb(mapping.value);
      if (!kb) {
        continue;
      }
      const kbShiftKey = kb.shiftKey;
      const keyCode = kb.keyCode;
      if (kbShiftKey) {
        _registerIfUnknown(0, 0, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 0, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 0, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 0, 1, scanCode, 1, 1, 1, keyCode);
      } else {
        _registerIfUnknown(0, 0, 0, scanCode, 0, 0, 0, keyCode);
        _registerIfUnknown(0, 0, 1, scanCode, 0, 0, 1, keyCode);
        _registerIfUnknown(0, 1, 0, scanCode, 0, 1, 0, keyCode);
        _registerIfUnknown(0, 1, 1, scanCode, 0, 1, 1, keyCode);
        _registerIfUnknown(1, 0, 0, scanCode, 1, 0, 0, keyCode);
        _registerIfUnknown(1, 0, 1, scanCode, 1, 0, 1, keyCode);
        _registerIfUnknown(1, 1, 0, scanCode, 1, 1, 0, keyCode);
        _registerIfUnknown(1, 1, 1, scanCode, 1, 1, 1, keyCode);
      }
    }
    _registerAllCombos(0, 0, 0, ScanCode.Digit1, KeyCode.Digit1);
    _registerAllCombos(0, 0, 0, ScanCode.Digit2, KeyCode.Digit2);
    _registerAllCombos(0, 0, 0, ScanCode.Digit3, KeyCode.Digit3);
    _registerAllCombos(0, 0, 0, ScanCode.Digit4, KeyCode.Digit4);
    _registerAllCombos(0, 0, 0, ScanCode.Digit5, KeyCode.Digit5);
    _registerAllCombos(0, 0, 0, ScanCode.Digit6, KeyCode.Digit6);
    _registerAllCombos(0, 0, 0, ScanCode.Digit7, KeyCode.Digit7);
    _registerAllCombos(0, 0, 0, ScanCode.Digit8, KeyCode.Digit8);
    _registerAllCombos(0, 0, 0, ScanCode.Digit9, KeyCode.Digit9);
    _registerAllCombos(0, 0, 0, ScanCode.Digit0, KeyCode.Digit0);
    this._scanCodeKeyCodeMapper.registrationComplete();
  }
  dumpDebugInfo() {
    const result = [];
    const immutableSamples = [
      ScanCode.ArrowUp,
      ScanCode.Numpad0
    ];
    let cnt = 0;
    result.push(`isUSStandard: ${this._isUSStandard}`);
    result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
    for (let scanCode = ScanCode.None; scanCode < ScanCode.MAX_VALUE; scanCode++) {
      if (IMMUTABLE_CODE_TO_KEY_CODE[scanCode] !== KeyCode.DependsOnKbLayout) {
        if (immutableSamples.indexOf(scanCode) === -1) {
          continue;
        }
      }
      if (cnt % 4 === 0) {
        result.push(`|       HW Code combination      |  Key  |    KeyCode combination    | Pri |          UI label         |         User settings          |    Electron accelerator   |       Dispatching string       | WYSIWYG |`);
        result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
      }
      cnt++;
      const mapping = this._codeInfo[scanCode];
      for (let mod = 0; mod < 8; mod++) {
        const hwCtrlKey = mod & 1 ? true : false;
        const hwShiftKey = mod & 2 ? true : false;
        const hwAltKey = mod & 4 ? true : false;
        const scanCodeCombo = new ScanCodeCombo(hwCtrlKey, hwShiftKey, hwAltKey, scanCode);
        const resolvedKb = this.resolveKeyboardEvent({
          _standardKeyboardEventBrand: true,
          ctrlKey: scanCodeCombo.ctrlKey,
          shiftKey: scanCodeCombo.shiftKey,
          altKey: scanCodeCombo.altKey,
          metaKey: false,
          altGraphKey: false,
          keyCode: KeyCode.DependsOnKbLayout,
          code: ScanCodeUtils.toString(scanCode)
        });
        const outScanCodeCombo = scanCodeCombo.toString();
        const outKey = scanCodeCombo.getProducedChar(mapping);
        const ariaLabel = resolvedKb.getAriaLabel();
        const outUILabel = ariaLabel ? ariaLabel.replace(/Control\+/, "Ctrl+") : null;
        const outUserSettings = resolvedKb.getUserSettingsLabel();
        const outElectronAccelerator = resolvedKb.getElectronAccelerator();
        const outDispatchStr = resolvedKb.getDispatchChords()[0];
        const isWYSIWYG = resolvedKb ? resolvedKb.isWYSIWYG() : false;
        const outWYSIWYG = isWYSIWYG ? "       " : "   NO  ";
        const kbCombos = this._scanCodeKeyCodeMapper.lookupScanCodeCombo(scanCodeCombo);
        if (kbCombos.length === 0) {
          result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad("", 25)} | ${this._leftPad("", 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
        } else {
          for (let i = 0, len = kbCombos.length; i < len; i++) {
            const kbCombo = kbCombos[i];
            let colPriority;
            const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(kbCombo);
            if (scanCodeCombos.length === 1) {
              colPriority = "";
            } else {
              let priority = -1;
              for (let j = 0; j < scanCodeCombos.length; j++) {
                if (scanCodeCombos[j].equals(scanCodeCombo)) {
                  priority = j + 1;
                  break;
                }
              }
              colPriority = String(priority);
            }
            const outKeybinding = kbCombo.toString();
            if (i === 0) {
              result.push(`| ${this._leftPad(outScanCodeCombo, 30)} | ${outKey} | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad(outUILabel, 25)} | ${this._leftPad(outUserSettings, 30)} | ${this._leftPad(outElectronAccelerator, 25)} | ${this._leftPad(outDispatchStr, 30)} | ${outWYSIWYG} |`);
            } else {
              result.push(`| ${this._leftPad("", 30)} |       | ${this._leftPad(outKeybinding, 25)} | ${this._leftPad(colPriority, 3)} | ${this._leftPad("", 25)} | ${this._leftPad("", 30)} | ${this._leftPad("", 25)} | ${this._leftPad("", 30)} |         |`);
            }
          }
        }
      }
      result.push(`----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------`);
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
  keyCodeChordToScanCodeChord(chord) {
    if (chord.keyCode === KeyCode.Enter) {
      return [new ScanCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, ScanCode.Enter)];
    }
    const scanCodeCombos = this._scanCodeKeyCodeMapper.lookupKeyCodeCombo(
      new KeyCodeCombo(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.keyCode)
    );
    const result = [];
    for (let i = 0, len = scanCodeCombos.length; i < len; i++) {
      const scanCodeCombo = scanCodeCombos[i];
      result[i] = new ScanCodeChord(scanCodeCombo.ctrlKey, scanCodeCombo.shiftKey, scanCodeCombo.altKey, chord.metaKey, scanCodeCombo.scanCode);
    }
    return result;
  }
  getUILabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    if (this._OS === OperatingSystem.Macintosh) {
      switch (chord.scanCode) {
        case ScanCode.ArrowLeft:
          return "\u2190";
        case ScanCode.ArrowUp:
          return "\u2191";
        case ScanCode.ArrowRight:
          return "\u2192";
        case ScanCode.ArrowDown:
          return "\u2193";
      }
    }
    return this._scanCodeToLabel[chord.scanCode];
  }
  getAriaLabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    return this._scanCodeToLabel[chord.scanCode];
  }
  getDispatchStrForScanCodeChord(chord) {
    const codeDispatch = this._scanCodeToDispatch[chord.scanCode];
    if (!codeDispatch) {
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
    result += codeDispatch;
    return result;
  }
  getUserSettingsLabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    if (chord.isDuplicateModifierCase()) {
      return "";
    }
    const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
    if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
      return KeyCodeUtils.toUserSettingsUS(immutableKeyCode).toLowerCase();
    }
    const constantKeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);
    if (constantKeyCode !== KeyCode.DependsOnKbLayout) {
      const reverseChords = this.keyCodeChordToScanCodeChord(new KeyCodeChord(chord.ctrlKey, chord.shiftKey, chord.altKey, chord.metaKey, constantKeyCode));
      for (let i = 0, len = reverseChords.length; i < len; i++) {
        const reverseChord = reverseChords[i];
        if (reverseChord.scanCode === chord.scanCode) {
          return KeyCodeUtils.toUserSettingsUS(constantKeyCode).toLowerCase();
        }
      }
    }
    return this._scanCodeToDispatch[chord.scanCode];
  }
  getElectronAcceleratorLabelForScanCodeChord(chord) {
    if (!chord) {
      return null;
    }
    const immutableKeyCode = IMMUTABLE_CODE_TO_KEY_CODE[chord.scanCode];
    if (immutableKeyCode !== KeyCode.DependsOnKbLayout) {
      return KeyCodeUtils.toElectronAccelerator(immutableKeyCode);
    }
    const constantKeyCode = this._scanCodeKeyCodeMapper.guessStableKeyCode(chord.scanCode);
    if (this._OS === OperatingSystem.Linux && !this._isUSStandard) {
      const isOEMKey = constantKeyCode === KeyCode.Semicolon || constantKeyCode === KeyCode.Equal || constantKeyCode === KeyCode.Comma || constantKeyCode === KeyCode.Minus || constantKeyCode === KeyCode.Period || constantKeyCode === KeyCode.Slash || constantKeyCode === KeyCode.Backquote || constantKeyCode === KeyCode.BracketLeft || constantKeyCode === KeyCode.Backslash || constantKeyCode === KeyCode.BracketRight;
      if (isOEMKey) {
        return null;
      }
    }
    if (constantKeyCode !== KeyCode.DependsOnKbLayout) {
      return KeyCodeUtils.toElectronAccelerator(constantKeyCode);
    }
    return null;
  }
  _toResolvedKeybinding(chordParts) {
    if (chordParts.length === 0) {
      return [];
    }
    const result = [];
    this._generateResolvedKeybindings(chordParts, 0, [], result);
    return result;
  }
  _generateResolvedKeybindings(chordParts, currentIndex, previousParts, result) {
    const chordPart = chordParts[currentIndex];
    const isFinalIndex = currentIndex === chordParts.length - 1;
    for (let i = 0, len = chordPart.length; i < len; i++) {
      const chords = [...previousParts, chordPart[i]];
      if (isFinalIndex) {
        result.push(new NativeResolvedKeybinding(this, this._OS, chords));
      } else {
        this._generateResolvedKeybindings(chordParts, currentIndex + 1, chords, result);
      }
    }
  }
  resolveKeyboardEvent(keyboardEvent) {
    let code = ScanCodeUtils.toEnum(keyboardEvent.code);
    if (code === ScanCode.NumpadEnter) {
      code = ScanCode.Enter;
    }
    const keyCode = keyboardEvent.keyCode;
    if (keyCode === KeyCode.LeftArrow || keyCode === KeyCode.UpArrow || keyCode === KeyCode.RightArrow || keyCode === KeyCode.DownArrow || keyCode === KeyCode.Delete || keyCode === KeyCode.Insert || keyCode === KeyCode.Home || keyCode === KeyCode.End || keyCode === KeyCode.PageDown || keyCode === KeyCode.PageUp || keyCode === KeyCode.Backspace) {
      const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
      if (immutableScanCode !== ScanCode.DependsOnKbLayout) {
        code = immutableScanCode;
      }
    } else {
      if (code === ScanCode.Numpad1 || code === ScanCode.Numpad2 || code === ScanCode.Numpad3 || code === ScanCode.Numpad4 || code === ScanCode.Numpad5 || code === ScanCode.Numpad6 || code === ScanCode.Numpad7 || code === ScanCode.Numpad8 || code === ScanCode.Numpad9 || code === ScanCode.Numpad0 || code === ScanCode.NumpadDecimal) {
        if (keyCode >= 0) {
          const immutableScanCode = IMMUTABLE_KEY_CODE_TO_CODE[keyCode];
          if (immutableScanCode !== ScanCode.DependsOnKbLayout) {
            code = immutableScanCode;
          }
        }
      }
    }
    const ctrlKey = keyboardEvent.ctrlKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const altKey = keyboardEvent.altKey || this._mapAltGrToCtrlAlt && keyboardEvent.altGraphKey;
    const chord = new ScanCodeChord(ctrlKey, keyboardEvent.shiftKey, altKey, keyboardEvent.metaKey, code);
    return new NativeResolvedKeybinding(this, this._OS, [chord]);
  }
  _resolveChord(chord) {
    if (!chord) {
      return [];
    }
    if (chord instanceof ScanCodeChord) {
      return [chord];
    }
    return this.keyCodeChordToScanCodeChord(chord);
  }
  resolveKeybinding(keybinding) {
    const chords = keybinding.chords.map((chord) => this._resolveChord(chord));
    return this._toResolvedKeybinding(chords);
  }
  static _redirectCharCode(charCode) {
    switch (charCode) {
      // allow-any-unicode-next-line
      // CJK: 。 「 」 【 】 ； ，
      // map: . [ ] [ ] ; ,
      case CharCode.U_IDEOGRAPHIC_FULL_STOP:
        return CharCode.Period;
      case CharCode.U_LEFT_CORNER_BRACKET:
        return CharCode.OpenSquareBracket;
      case CharCode.U_RIGHT_CORNER_BRACKET:
        return CharCode.CloseSquareBracket;
      case CharCode.U_LEFT_BLACK_LENTICULAR_BRACKET:
        return CharCode.OpenSquareBracket;
      case CharCode.U_RIGHT_BLACK_LENTICULAR_BRACKET:
        return CharCode.CloseSquareBracket;
      case CharCode.U_FULLWIDTH_SEMICOLON:
        return CharCode.Semicolon;
      case CharCode.U_FULLWIDTH_COMMA:
        return CharCode.Comma;
    }
    return charCode;
  }
  static _charCodeToKb(charCode) {
    charCode = this._redirectCharCode(charCode);
    if (charCode < CHAR_CODE_TO_KEY_CODE.length) {
      return CHAR_CODE_TO_KEY_CODE[charCode];
    }
    return null;
  }
  /**
   * Attempt to map a combining character to a regular one that renders the same way.
   *
   * https://www.compart.com/en/unicode/bidiclass/NSM
   */
  static getCharCode(char) {
    if (char.length === 0) {
      return 0;
    }
    const charCode = char.charCodeAt(0);
    switch (charCode) {
      case CharCode.U_Combining_Grave_Accent:
        return CharCode.U_GRAVE_ACCENT;
      case CharCode.U_Combining_Acute_Accent:
        return CharCode.U_ACUTE_ACCENT;
      case CharCode.U_Combining_Circumflex_Accent:
        return CharCode.U_CIRCUMFLEX;
      case CharCode.U_Combining_Tilde:
        return CharCode.U_SMALL_TILDE;
      case CharCode.U_Combining_Macron:
        return CharCode.U_MACRON;
      case CharCode.U_Combining_Overline:
        return CharCode.U_OVERLINE;
      case CharCode.U_Combining_Breve:
        return CharCode.U_BREVE;
      case CharCode.U_Combining_Dot_Above:
        return CharCode.U_DOT_ABOVE;
      case CharCode.U_Combining_Diaeresis:
        return CharCode.U_DIAERESIS;
      case CharCode.U_Combining_Ring_Above:
        return CharCode.U_RING_ABOVE;
      case CharCode.U_Combining_Double_Acute_Accent:
        return CharCode.U_DOUBLE_ACUTE_ACCENT;
    }
    return charCode;
  }
}
(function() {
  function define(charCode, keyCode, shiftKey) {
    for (let i = CHAR_CODE_TO_KEY_CODE.length; i < charCode; i++) {
      CHAR_CODE_TO_KEY_CODE[i] = null;
    }
    CHAR_CODE_TO_KEY_CODE[charCode] = { keyCode, shiftKey };
  }
  for (let chCode = CharCode.A; chCode <= CharCode.Z; chCode++) {
    define(chCode, KeyCode.KeyA + (chCode - CharCode.A), true);
  }
  for (let chCode = CharCode.a; chCode <= CharCode.z; chCode++) {
    define(chCode, KeyCode.KeyA + (chCode - CharCode.a), false);
  }
  define(CharCode.Semicolon, KeyCode.Semicolon, false);
  define(CharCode.Colon, KeyCode.Semicolon, true);
  define(CharCode.Equals, KeyCode.Equal, false);
  define(CharCode.Plus, KeyCode.Equal, true);
  define(CharCode.Comma, KeyCode.Comma, false);
  define(CharCode.LessThan, KeyCode.Comma, true);
  define(CharCode.Dash, KeyCode.Minus, false);
  define(CharCode.Underline, KeyCode.Minus, true);
  define(CharCode.Period, KeyCode.Period, false);
  define(CharCode.GreaterThan, KeyCode.Period, true);
  define(CharCode.Slash, KeyCode.Slash, false);
  define(CharCode.QuestionMark, KeyCode.Slash, true);
  define(CharCode.BackTick, KeyCode.Backquote, false);
  define(CharCode.Tilde, KeyCode.Backquote, true);
  define(CharCode.OpenSquareBracket, KeyCode.BracketLeft, false);
  define(CharCode.OpenCurlyBrace, KeyCode.BracketLeft, true);
  define(CharCode.Backslash, KeyCode.Backslash, false);
  define(CharCode.Pipe, KeyCode.Backslash, true);
  define(CharCode.CloseSquareBracket, KeyCode.BracketRight, false);
  define(CharCode.CloseCurlyBrace, KeyCode.BracketRight, true);
  define(CharCode.SingleQuote, KeyCode.Quote, false);
  define(CharCode.DoubleQuote, KeyCode.Quote, true);
})();
export {
  MacLinuxKeyboardMapper,
  NativeResolvedKeybinding
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2NvbW1vbi9tYWNMaW51eEtleWJvYXJkTWFwcGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlDb2RlVXRpbHMsIElNTVVUQUJMRV9DT0RFX1RPX0tFWV9DT0RFLCBJTU1VVEFCTEVfS0VZX0NPREVfVE9fQ09ERSwgU2NhbkNvZGUsIFNjYW5Db2RlVXRpbHMsIGlzTW9kaWZpZXJLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcsIEtleUNvZGVDaG9yZCwgU2luZ2xlTW9kaWZpZXJDaG9yZCwgU2NhbkNvZGVDaG9yZCwgS2V5YmluZGluZywgQ2hvcmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkTWFwcGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkTWFwcGVyLmpzJztcbmltcG9ydCB7IEJhc2VSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9iYXNlUmVzb2x2ZWRLZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElNYWNMaW51eEtleWJvYXJkTWFwcGluZywgSU1hY0xpbnV4S2V5TWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZExheW91dC5qcyc7XG5cbi8qKlxuICogQSBtYXAgZnJvbSBjaGFyYWN0ZXIgdG8ga2V5IGNvZGVzLlxuICogZS5nLiBDb250YWlucyBlbnRyaWVzIHN1Y2ggYXM6XG4gKiAgLSAnLycgPT4geyBrZXlDb2RlOiBLZXlDb2RlLlVTX1NMQVNILCBzaGlmdEtleTogZmFsc2UgfVxuICogIC0gJz8nID0+IHsga2V5Q29kZTogS2V5Q29kZS5VU19TTEFTSCwgc2hpZnRLZXk6IHRydWUgfVxuICovXG5jb25zdCBDSEFSX0NPREVfVE9fS0VZX0NPREU6ICh7IGtleUNvZGU6IEtleUNvZGU7IHNoaWZ0S2V5OiBib29sZWFuIH0gfCBudWxsKVtdID0gW107XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmcgZXh0ZW5kcyBCYXNlUmVzb2x2ZWRLZXliaW5kaW5nPFNjYW5Db2RlQ2hvcmQ+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tYXBwZXI6IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXI7XG5cblx0Y29uc3RydWN0b3IobWFwcGVyOiBNYWNMaW51eEtleWJvYXJkTWFwcGVyLCBvczogT3BlcmF0aW5nU3lzdGVtLCBjaG9yZHM6IFNjYW5Db2RlQ2hvcmRbXSkge1xuXHRcdHN1cGVyKG9zLCBjaG9yZHMpO1xuXHRcdHRoaXMuX21hcHBlciA9IG1hcHBlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0TGFiZWwoY2hvcmQ6IFNjYW5Db2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFwcGVyLmdldFVJTGFiZWxGb3JTY2FuQ29kZUNob3JkKGNob3JkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0QXJpYUxhYmVsKGNob3JkOiBTY2FuQ29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcHBlci5nZXRBcmlhTGFiZWxGb3JTY2FuQ29kZUNob3JkKGNob3JkKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0RWxlY3Ryb25BY2NlbGVyYXRvcihjaG9yZDogU2NhbkNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9tYXBwZXIuZ2V0RWxlY3Ryb25BY2NlbGVyYXRvckxhYmVsRm9yU2NhbkNvZGVDaG9yZChjaG9yZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFVzZXJTZXR0aW5nc0xhYmVsKGNob3JkOiBTY2FuQ29kZUNob3JkKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcHBlci5nZXRVc2VyU2V0dGluZ3NMYWJlbEZvclNjYW5Db2RlQ2hvcmQoY2hvcmQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9pc1dZU0lXWUcoYmluZGluZzogU2NhbkNvZGVDaG9yZCB8IG51bGwpOiBib29sZWFuIHtcblx0XHRpZiAoIWJpbmRpbmcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbYmluZGluZy5zY2FuQ29kZV0gIT09IEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBhID0gdGhpcy5fbWFwcGVyLmdldEFyaWFMYWJlbEZvclNjYW5Db2RlQ2hvcmQoYmluZGluZyk7XG5cdFx0Y29uc3QgYiA9IHRoaXMuX21hcHBlci5nZXRVc2VyU2V0dGluZ3NMYWJlbEZvclNjYW5Db2RlQ2hvcmQoYmluZGluZyk7XG5cblx0XHRpZiAoIWEgJiYgIWIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWEgfHwgIWIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIChhLnRvTG93ZXJDYXNlKCkgPT09IGIudG9Mb3dlckNhc2UoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldENob3JkRGlzcGF0Y2goY2hvcmQ6IFNjYW5Db2RlQ2hvcmQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fbWFwcGVyLmdldERpc3BhdGNoU3RyRm9yU2NhbkNvZGVDaG9yZChjaG9yZCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFNpbmdsZU1vZGlmaWVyQ2hvcmREaXNwYXRjaChjaG9yZDogU2NhbkNvZGVDaG9yZCk6IFNpbmdsZU1vZGlmaWVyQ2hvcmQgfCBudWxsIHtcblx0XHRpZiAoKGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5Db250cm9sTGVmdCB8fCBjaG9yZC5zY2FuQ29kZSA9PT0gU2NhbkNvZGUuQ29udHJvbFJpZ2h0KSAmJiAhY2hvcmQuc2hpZnRLZXkgJiYgIWNob3JkLmFsdEtleSAmJiAhY2hvcmQubWV0YUtleSkge1xuXHRcdFx0cmV0dXJuICdjdHJsJztcblx0XHR9XG5cdFx0aWYgKChjaG9yZC5zY2FuQ29kZSA9PT0gU2NhbkNvZGUuQWx0TGVmdCB8fCBjaG9yZC5zY2FuQ29kZSA9PT0gU2NhbkNvZGUuQWx0UmlnaHQpICYmICFjaG9yZC5jdHJsS2V5ICYmICFjaG9yZC5zaGlmdEtleSAmJiAhY2hvcmQubWV0YUtleSkge1xuXHRcdFx0cmV0dXJuICdhbHQnO1xuXHRcdH1cblx0XHRpZiAoKGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5TaGlmdExlZnQgfHwgY2hvcmQuc2NhbkNvZGUgPT09IFNjYW5Db2RlLlNoaWZ0UmlnaHQpICYmICFjaG9yZC5jdHJsS2V5ICYmICFjaG9yZC5hbHRLZXkgJiYgIWNob3JkLm1ldGFLZXkpIHtcblx0XHRcdHJldHVybiAnc2hpZnQnO1xuXHRcdH1cblx0XHRpZiAoKGNob3JkLnNjYW5Db2RlID09PSBTY2FuQ29kZS5NZXRhTGVmdCB8fCBjaG9yZC5zY2FuQ29kZSA9PT0gU2NhbkNvZGUuTWV0YVJpZ2h0KSAmJiAhY2hvcmQuY3RybEtleSAmJiAhY2hvcmQuc2hpZnRLZXkgJiYgIWNob3JkLmFsdEtleSkge1xuXHRcdFx0cmV0dXJuICdtZXRhJztcblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTY2FuQ29kZU1hcHBpbmcge1xuXHRzY2FuQ29kZTogU2NhbkNvZGU7XG5cdHZhbHVlOiBudW1iZXI7XG5cdHdpdGhTaGlmdDogbnVtYmVyO1xuXHR3aXRoQWx0R3I6IG51bWJlcjtcblx0d2l0aFNoaWZ0QWx0R3I6IG51bWJlcjtcbn1cblxuY2xhc3MgU2NhbkNvZGVDb21ibyB7XG5cdHB1YmxpYyByZWFkb25seSBjdHJsS2V5OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hpZnRLZXk6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBhbHRLZXk6IGJvb2xlYW47XG5cdHB1YmxpYyByZWFkb25seSBzY2FuQ29kZTogU2NhbkNvZGU7XG5cblx0Y29uc3RydWN0b3IoY3RybEtleTogYm9vbGVhbiwgc2hpZnRLZXk6IGJvb2xlYW4sIGFsdEtleTogYm9vbGVhbiwgc2NhbkNvZGU6IFNjYW5Db2RlKSB7XG5cdFx0dGhpcy5jdHJsS2V5ID0gY3RybEtleTtcblx0XHR0aGlzLnNoaWZ0S2V5ID0gc2hpZnRLZXk7XG5cdFx0dGhpcy5hbHRLZXkgPSBhbHRLZXk7XG5cdFx0dGhpcy5zY2FuQ29kZSA9IHNjYW5Db2RlO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3RoaXMuY3RybEtleSA/ICdDdHJsKycgOiAnJ30ke3RoaXMuc2hpZnRLZXkgPyAnU2hpZnQrJyA6ICcnfSR7dGhpcy5hbHRLZXkgPyAnQWx0KycgOiAnJ30ke1NjYW5Db2RlVXRpbHMudG9TdHJpbmcodGhpcy5zY2FuQ29kZSl9YDtcblx0fVxuXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IFNjYW5Db2RlQ29tYm8pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0dGhpcy5jdHJsS2V5ID09PSBvdGhlci5jdHJsS2V5XG5cdFx0XHQmJiB0aGlzLnNoaWZ0S2V5ID09PSBvdGhlci5zaGlmdEtleVxuXHRcdFx0JiYgdGhpcy5hbHRLZXkgPT09IG90aGVyLmFsdEtleVxuXHRcdFx0JiYgdGhpcy5zY2FuQ29kZSA9PT0gb3RoZXIuc2NhbkNvZGVcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWNlZENoYXJDb2RlKG1hcHBpbmc6IElNYWNMaW51eEtleU1hcHBpbmcpOiBzdHJpbmcge1xuXHRcdGlmICghbWFwcGluZykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jdHJsS2V5ICYmIHRoaXMuc2hpZnRLZXkgJiYgdGhpcy5hbHRLZXkpIHtcblx0XHRcdHJldHVybiBtYXBwaW5nLndpdGhTaGlmdEFsdEdyO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jdHJsS2V5ICYmIHRoaXMuYWx0S2V5KSB7XG5cdFx0XHRyZXR1cm4gbWFwcGluZy53aXRoQWx0R3I7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNoaWZ0S2V5KSB7XG5cdFx0XHRyZXR1cm4gbWFwcGluZy53aXRoU2hpZnQ7XG5cdFx0fVxuXHRcdHJldHVybiBtYXBwaW5nLnZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldFByb2R1Y2VkQ2hhcihtYXBwaW5nOiBJTWFjTGludXhLZXlNYXBwaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBjaGFyQ29kZSA9IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuZ2V0Q2hhckNvZGUodGhpcy5nZXRQcm9kdWNlZENoYXJDb2RlKG1hcHBpbmcpKTtcblx0XHRpZiAoY2hhckNvZGUgPT09IDApIHtcblx0XHRcdHJldHVybiAnIC0tLSAnO1xuXHRcdH1cblx0XHRpZiAoY2hhckNvZGUgPj0gQ2hhckNvZGUuVV9Db21iaW5pbmdfR3JhdmVfQWNjZW50ICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLlVfQ29tYmluaW5nX0xhdGluX1NtYWxsX0xldHRlcl9YKSB7XG5cdFx0XHQvLyBjb21iaW5pbmdcblx0XHRcdHJldHVybiAnVSsnICsgY2hhckNvZGUudG9TdHJpbmcoMTYpO1xuXHRcdH1cblx0XHRyZXR1cm4gJyAgJyArIFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhckNvZGUpICsgJyAgJztcblx0fVxufVxuXG5jbGFzcyBLZXlDb2RlQ29tYm8ge1xuXHRwdWJsaWMgcmVhZG9ubHkgY3RybEtleTogYm9vbGVhbjtcblx0cHVibGljIHJlYWRvbmx5IHNoaWZ0S2V5OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgYWx0S2V5OiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkga2V5Q29kZTogS2V5Q29kZTtcblxuXHRjb25zdHJ1Y3RvcihjdHJsS2V5OiBib29sZWFuLCBzaGlmdEtleTogYm9vbGVhbiwgYWx0S2V5OiBib29sZWFuLCBrZXlDb2RlOiBLZXlDb2RlKSB7XG5cdFx0dGhpcy5jdHJsS2V5ID0gY3RybEtleTtcblx0XHR0aGlzLnNoaWZ0S2V5ID0gc2hpZnRLZXk7XG5cdFx0dGhpcy5hbHRLZXkgPSBhbHRLZXk7XG5cdFx0dGhpcy5rZXlDb2RlID0ga2V5Q29kZTtcblx0fVxuXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLmN0cmxLZXkgPyAnQ3RybCsnIDogJyd9JHt0aGlzLnNoaWZ0S2V5ID8gJ1NoaWZ0KycgOiAnJ30ke3RoaXMuYWx0S2V5ID8gJ0FsdCsnIDogJyd9JHtLZXlDb2RlVXRpbHMudG9TdHJpbmcodGhpcy5rZXlDb2RlKX1gO1xuXHR9XG59XG5cbmNsYXNzIFNjYW5Db2RlS2V5Q29kZU1hcHBlciB7XG5cblx0LyoqXG5cdCAqIFNjYW5Db2RlIGNvbWJpbmF0aW9uID0+IEtleUNvZGUgY29tYmluYXRpb24uXG5cdCAqIE9ubHkgY292ZXJzIHJlbGV2YW50IG1vZGlmaWVycyBjdHJsLCBzaGlmdCwgYWx0IChzaW5jZSBtZXRhIGRvZXMgbm90IGluZmx1ZW5jZSB0aGUgbWFwcGluZ3MpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2NhbkNvZGVUb0tleUNvZGU6IG51bWJlcltdW10gPSBbXTtcblx0LyoqXG5cdCAqIGludmVyc2Ugb2YgYF9zY2FuQ29kZVRvS2V5Q29kZWAuXG5cdCAqIEtleUNvZGUgY29tYmluYXRpb24gPT4gU2NhbkNvZGUgY29tYmluYXRpb24uXG5cdCAqIE9ubHkgY292ZXJzIHJlbGV2YW50IG1vZGlmaWVycyBjdHJsLCBzaGlmdCwgYWx0IChzaW5jZSBtZXRhIGRvZXMgbm90IGluZmx1ZW5jZSB0aGUgbWFwcGluZ3MpLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfa2V5Q29kZVRvU2NhbkNvZGU6IG51bWJlcltdW10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9zY2FuQ29kZVRvS2V5Q29kZSA9IFtdO1xuXHRcdHRoaXMuX2tleUNvZGVUb1NjYW5Db2RlID0gW107XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0cmF0aW9uQ29tcGxldGUoKTogdm9pZCB7XG5cdFx0Ly8gSW50bEhhc2ggYW5kIEludGxCYWNrc2xhc2ggYXJlIHJhcmUga2V5cywgc28gZW5zdXJlIHRoZXkgZG9uJ3QgZW5kIHVwIGJlaW5nIHRoZSBwcmVmZXJyZWQuLi5cblx0XHR0aGlzLl9tb3ZlVG9FbmQoU2NhbkNvZGUuSW50bEhhc2gpO1xuXHRcdHRoaXMuX21vdmVUb0VuZChTY2FuQ29kZS5JbnRsQmFja3NsYXNoKTtcblx0fVxuXG5cdHByaXZhdGUgX21vdmVUb0VuZChzY2FuQ29kZTogU2NhbkNvZGUpOiB2b2lkIHtcblx0XHRmb3IgKGxldCBtb2QgPSAwOyBtb2QgPCA4OyBtb2QrKykge1xuXHRcdFx0Y29uc3QgZW5jb2RlZEtleUNvZGVDb21ib3MgPSB0aGlzLl9zY2FuQ29kZVRvS2V5Q29kZVsoc2NhbkNvZGUgPDwgMykgKyBtb2RdO1xuXHRcdFx0aWYgKCFlbmNvZGVkS2V5Q29kZUNvbWJvcykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBlbmNvZGVkS2V5Q29kZUNvbWJvcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBlbmNvZGVkU2NhbkNvZGVDb21ib3MgPSB0aGlzLl9rZXlDb2RlVG9TY2FuQ29kZVtlbmNvZGVkS2V5Q29kZUNvbWJvc1tpXV07XG5cdFx0XHRcdGlmIChlbmNvZGVkU2NhbkNvZGVDb21ib3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChsZXQgaiA9IDAsIGxlbiA9IGVuY29kZWRTY2FuQ29kZUNvbWJvcy5sZW5ndGg7IGogPCBsZW47IGorKykge1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0gZW5jb2RlZFNjYW5Db2RlQ29tYm9zW2pdO1xuXHRcdFx0XHRcdGNvbnN0IGVudHJ5U2NhbkNvZGUgPSAoZW50cnkgPj4+IDMpO1xuXHRcdFx0XHRcdGlmIChlbnRyeVNjYW5Db2RlID09PSBzY2FuQ29kZSkge1xuXHRcdFx0XHRcdFx0Ly8gTW92ZSB0aGlzIGVudHJ5IHRvIHRoZSBlbmRcblx0XHRcdFx0XHRcdGZvciAobGV0IGsgPSBqICsgMTsgayA8IGxlbjsgaysrKSB7XG5cdFx0XHRcdFx0XHRcdGVuY29kZWRTY2FuQ29kZUNvbWJvc1trIC0gMV0gPSBlbmNvZGVkU2NhbkNvZGVDb21ib3Nba107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRlbmNvZGVkU2NhbkNvZGVDb21ib3NbbGVuIC0gMV0gPSBlbnRyeTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJJZlVua25vd24oc2NhbkNvZGVDb21ibzogU2NhbkNvZGVDb21ibywga2V5Q29kZUNvbWJvOiBLZXlDb2RlQ29tYm8pOiB2b2lkIHtcblx0XHRpZiAoa2V5Q29kZUNvbWJvLmtleUNvZGUgPT09IEtleUNvZGUuVW5rbm93bikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzY2FuQ29kZUNvbWJvRW5jb2RlZCA9IHRoaXMuX2VuY29kZVNjYW5Db2RlQ29tYm8oc2NhbkNvZGVDb21ibyk7XG5cdFx0Y29uc3Qga2V5Q29kZUNvbWJvRW5jb2RlZCA9IHRoaXMuX2VuY29kZUtleUNvZGVDb21ibyhrZXlDb2RlQ29tYm8pO1xuXG5cdFx0Y29uc3Qga2V5Q29kZUlzRGlnaXQgPSAoa2V5Q29kZUNvbWJvLmtleUNvZGUgPj0gS2V5Q29kZS5EaWdpdDAgJiYga2V5Q29kZUNvbWJvLmtleUNvZGUgPD0gS2V5Q29kZS5EaWdpdDkpO1xuXHRcdGNvbnN0IGtleUNvZGVJc0xldHRlciA9IChrZXlDb2RlQ29tYm8ua2V5Q29kZSA+PSBLZXlDb2RlLktleUEgJiYga2V5Q29kZUNvbWJvLmtleUNvZGUgPD0gS2V5Q29kZS5LZXlaKTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nS2V5Q29kZUNvbWJvcyA9IHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlW3NjYW5Db2RlQ29tYm9FbmNvZGVkXTtcblxuXHRcdC8vIEFsbG93IGEgc2NhbiBjb2RlIHRvIG1hcCB0byBtdWx0aXBsZSBrZXkgY29kZXMgaWYgaXQgaXMgYSBkaWdpdCBvciBhIGxldHRlciBrZXkgY29kZVxuXHRcdGlmIChrZXlDb2RlSXNEaWdpdCB8fCBrZXlDb2RlSXNMZXR0ZXIpIHtcblx0XHRcdC8vIE9ubHkgY2hlY2sgdGhhdCB3ZSBkb24ndCBpbnNlcnQgdGhlIHNhbWUgZW50cnkgdHdpY2Vcblx0XHRcdGlmIChleGlzdGluZ0tleUNvZGVDb21ib3MpIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGV4aXN0aW5nS2V5Q29kZUNvbWJvcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRcdGlmIChleGlzdGluZ0tleUNvZGVDb21ib3NbaV0gPT09IGtleUNvZGVDb21ib0VuY29kZWQpIHtcblx0XHRcdFx0XHRcdC8vIGF2b2lkIGR1cGxpY2F0ZXNcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRG9uJ3QgYWxsb3cgbXVsdGlwbGVzXG5cdFx0XHRpZiAoZXhpc3RpbmdLZXlDb2RlQ29tYm9zICYmIGV4aXN0aW5nS2V5Q29kZUNvbWJvcy5sZW5ndGggIT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlW3NjYW5Db2RlQ29tYm9FbmNvZGVkXSA9IHRoaXMuX3NjYW5Db2RlVG9LZXlDb2RlW3NjYW5Db2RlQ29tYm9FbmNvZGVkXSB8fCBbXTtcblx0XHR0aGlzLl9zY2FuQ29kZVRvS2V5Q29kZVtzY2FuQ29kZUNvbWJvRW5jb2RlZF0udW5zaGlmdChrZXlDb2RlQ29tYm9FbmNvZGVkKTtcblxuXHRcdHRoaXMuX2tleUNvZGVUb1NjYW5Db2RlW2tleUNvZGVDb21ib0VuY29kZWRdID0gdGhpcy5fa2V5Q29kZVRvU2NhbkNvZGVba2V5Q29kZUNvbWJvRW5jb2RlZF0gfHwgW107XG5cdFx0dGhpcy5fa2V5Q29kZVRvU2NhbkNvZGVba2V5Q29kZUNvbWJvRW5jb2RlZF0udW5zaGlmdChzY2FuQ29kZUNvbWJvRW5jb2RlZCk7XG5cdH1cblxuXHRwdWJsaWMgbG9va3VwS2V5Q29kZUNvbWJvKGtleUNvZGVDb21ibzogS2V5Q29kZUNvbWJvKTogU2NhbkNvZGVDb21ib1tdIHtcblx0XHRjb25zdCBrZXlDb2RlQ29tYm9FbmNvZGVkID0gdGhpcy5fZW5jb2RlS2V5Q29kZUNvbWJvKGtleUNvZGVDb21ibyk7XG5cdFx0Y29uc3Qgc2NhbkNvZGVDb21ib3NFbmNvZGVkID0gdGhpcy5fa2V5Q29kZVRvU2NhbkNvZGVba2V5Q29kZUNvbWJvRW5jb2RlZF07XG5cdFx0aWYgKCFzY2FuQ29kZUNvbWJvc0VuY29kZWQgfHwgc2NhbkNvZGVDb21ib3NFbmNvZGVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogU2NhbkNvZGVDb21ib1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNjYW5Db2RlQ29tYm9zRW5jb2RlZC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgc2NhbkNvZGVDb21ib0VuY29kZWQgPSBzY2FuQ29kZUNvbWJvc0VuY29kZWRbaV07XG5cblx0XHRcdGNvbnN0IGN0cmxLZXkgPSAoc2NhbkNvZGVDb21ib0VuY29kZWQgJiAwYjAwMSkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRjb25zdCBzaGlmdEtleSA9IChzY2FuQ29kZUNvbWJvRW5jb2RlZCAmIDBiMDEwKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdGNvbnN0IGFsdEtleSA9IChzY2FuQ29kZUNvbWJvRW5jb2RlZCAmIDBiMTAwKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdGNvbnN0IHNjYW5Db2RlOiBTY2FuQ29kZSA9IChzY2FuQ29kZUNvbWJvRW5jb2RlZCA+Pj4gMyk7XG5cblx0XHRcdHJlc3VsdFtpXSA9IG5ldyBTY2FuQ29kZUNvbWJvKGN0cmxLZXksIHNoaWZ0S2V5LCBhbHRLZXksIHNjYW5Db2RlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBsb29rdXBTY2FuQ29kZUNvbWJvKHNjYW5Db2RlQ29tYm86IFNjYW5Db2RlQ29tYm8pOiBLZXlDb2RlQ29tYm9bXSB7XG5cdFx0Y29uc3Qgc2NhbkNvZGVDb21ib0VuY29kZWQgPSB0aGlzLl9lbmNvZGVTY2FuQ29kZUNvbWJvKHNjYW5Db2RlQ29tYm8pO1xuXHRcdGNvbnN0IGtleUNvZGVDb21ib3NFbmNvZGVkID0gdGhpcy5fc2NhbkNvZGVUb0tleUNvZGVbc2NhbkNvZGVDb21ib0VuY29kZWRdO1xuXHRcdGlmICgha2V5Q29kZUNvbWJvc0VuY29kZWQgfHwga2V5Q29kZUNvbWJvc0VuY29kZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBLZXlDb2RlQ29tYm9bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBrZXlDb2RlQ29tYm9zRW5jb2RlZC5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qga2V5Q29kZUNvbWJvRW5jb2RlZCA9IGtleUNvZGVDb21ib3NFbmNvZGVkW2ldO1xuXG5cdFx0XHRjb25zdCBjdHJsS2V5ID0gKGtleUNvZGVDb21ib0VuY29kZWQgJiAwYjAwMSkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRjb25zdCBzaGlmdEtleSA9IChrZXlDb2RlQ29tYm9FbmNvZGVkICYgMGIwMTApID8gdHJ1ZSA6IGZhbHNlO1xuXHRcdFx0Y29uc3QgYWx0S2V5ID0gKGtleUNvZGVDb21ib0VuY29kZWQgJiAwYjEwMCkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRjb25zdCBrZXlDb2RlOiBLZXlDb2RlID0gKGtleUNvZGVDb21ib0VuY29kZWQgPj4+IDMpO1xuXG5cdFx0XHRyZXN1bHRbaV0gPSBuZXcgS2V5Q29kZUNvbWJvKGN0cmxLZXksIHNoaWZ0S2V5LCBhbHRLZXksIGtleUNvZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGd1ZXNzU3RhYmxlS2V5Q29kZShzY2FuQ29kZTogU2NhbkNvZGUpOiBLZXlDb2RlIHtcblx0XHRpZiAoc2NhbkNvZGUgPj0gU2NhbkNvZGUuRGlnaXQxICYmIHNjYW5Db2RlIDw9IFNjYW5Db2RlLkRpZ2l0MCkge1xuXHRcdFx0Ly8gZGlnaXRzIGFyZSBva1xuXHRcdFx0c3dpdGNoIChzY2FuQ29kZSkge1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0MTogcmV0dXJuIEtleUNvZGUuRGlnaXQxO1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0MjogcmV0dXJuIEtleUNvZGUuRGlnaXQyO1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0MzogcmV0dXJuIEtleUNvZGUuRGlnaXQzO1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0NDogcmV0dXJuIEtleUNvZGUuRGlnaXQ0O1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0NTogcmV0dXJuIEtleUNvZGUuRGlnaXQ1O1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0NjogcmV0dXJuIEtleUNvZGUuRGlnaXQ2O1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0NzogcmV0dXJuIEtleUNvZGUuRGlnaXQ3O1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0ODogcmV0dXJuIEtleUNvZGUuRGlnaXQ4O1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0OTogcmV0dXJuIEtleUNvZGUuRGlnaXQ5O1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkRpZ2l0MDogcmV0dXJuIEtleUNvZGUuRGlnaXQwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIExvb2t1cCB0aGUgc2NhbkNvZGUgd2l0aCBhbmQgd2l0aG91dCBzaGlmdCBhbmQgc2VlIGlmIHRoZSBrZXlDb2RlIGlzIHN0YWJsZVxuXHRcdGNvbnN0IGtleUNvZGVDb21ib3MxID0gdGhpcy5sb29rdXBTY2FuQ29kZUNvbWJvKG5ldyBTY2FuQ29kZUNvbWJvKGZhbHNlLCBmYWxzZSwgZmFsc2UsIHNjYW5Db2RlKSk7XG5cdFx0Y29uc3Qga2V5Q29kZUNvbWJvczIgPSB0aGlzLmxvb2t1cFNjYW5Db2RlQ29tYm8obmV3IFNjYW5Db2RlQ29tYm8oZmFsc2UsIHRydWUsIGZhbHNlLCBzY2FuQ29kZSkpO1xuXHRcdGlmIChrZXlDb2RlQ29tYm9zMS5sZW5ndGggPT09IDEgJiYga2V5Q29kZUNvbWJvczIubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBzaGlmdEtleTEgPSBrZXlDb2RlQ29tYm9zMVswXS5zaGlmdEtleTtcblx0XHRcdGNvbnN0IGtleUNvZGUxID0ga2V5Q29kZUNvbWJvczFbMF0ua2V5Q29kZTtcblx0XHRcdGNvbnN0IHNoaWZ0S2V5MiA9IGtleUNvZGVDb21ib3MyWzBdLnNoaWZ0S2V5O1xuXHRcdFx0Y29uc3Qga2V5Q29kZTIgPSBrZXlDb2RlQ29tYm9zMlswXS5rZXlDb2RlO1xuXHRcdFx0aWYgKGtleUNvZGUxID09PSBrZXlDb2RlMiAmJiBzaGlmdEtleTEgIT09IHNoaWZ0S2V5Mikge1xuXHRcdFx0XHQvLyBUaGlzIGxvb2tzIGxpa2UgYSBzdGFibGUgbWFwcGluZ1xuXHRcdFx0XHRyZXR1cm4ga2V5Q29kZTE7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIEtleUNvZGUuRGVwZW5kc09uS2JMYXlvdXQ7XG5cdH1cblxuXHRwcml2YXRlIF9lbmNvZGVTY2FuQ29kZUNvbWJvKHNjYW5Db2RlQ29tYm86IFNjYW5Db2RlQ29tYm8pOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9lbmNvZGUoc2NhbkNvZGVDb21iby5jdHJsS2V5LCBzY2FuQ29kZUNvbWJvLnNoaWZ0S2V5LCBzY2FuQ29kZUNvbWJvLmFsdEtleSwgc2NhbkNvZGVDb21iby5zY2FuQ29kZSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbmNvZGVLZXlDb2RlQ29tYm8oa2V5Q29kZUNvbWJvOiBLZXlDb2RlQ29tYm8pOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9lbmNvZGUoa2V5Q29kZUNvbWJvLmN0cmxLZXksIGtleUNvZGVDb21iby5zaGlmdEtleSwga2V5Q29kZUNvbWJvLmFsdEtleSwga2V5Q29kZUNvbWJvLmtleUNvZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5jb2RlKGN0cmxLZXk6IGJvb2xlYW4sIHNoaWZ0S2V5OiBib29sZWFuLCBhbHRLZXk6IGJvb2xlYW4sIHByaW5jaXBhbDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0KChjdHJsS2V5ID8gMSA6IDApIDw8IDApXG5cdFx0XHR8ICgoc2hpZnRLZXkgPyAxIDogMCkgPDwgMSlcblx0XHRcdHwgKChhbHRLZXkgPyAxIDogMCkgPDwgMilcblx0XHRcdHwgcHJpbmNpcGFsIDw8IDNcblx0XHQpID4+PiAwO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYWNMaW51eEtleWJvYXJkTWFwcGVyIGltcGxlbWVudHMgSUtleWJvYXJkTWFwcGVyIHtcblxuXHQvKipcblx0ICogdXNlZCBvbmx5IGZvciBkZWJ1ZyBwdXJwb3Nlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvZGVJbmZvOiBJTWFjTGludXhLZXlNYXBwaW5nW107XG5cdC8qKlxuXHQgKiBNYXBzIFNjYW5Db2RlIGNvbWJvcyA8LT4gS2V5Q29kZSBjb21ib3MuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2FuQ29kZUtleUNvZGVNYXBwZXI6IFNjYW5Db2RlS2V5Q29kZU1hcHBlcjtcblx0LyoqXG5cdCAqIFVJIGxhYmVsIGZvciBhIFNjYW5Db2RlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2NhbkNvZGVUb0xhYmVsOiBBcnJheTxzdHJpbmcgfCBudWxsPiA9IFtdO1xuXHQvKipcblx0ICogRGlzcGF0Y2hpbmcgc3RyaW5nIGZvciBhIFNjYW5Db2RlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2NhbkNvZGVUb0Rpc3BhdGNoOiBBcnJheTxzdHJpbmcgfCBudWxsPiA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzVVNTdGFuZGFyZDogYm9vbGVhbixcblx0XHRyYXdNYXBwaW5nczogSU1hY0xpbnV4S2V5Ym9hcmRNYXBwaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21hcEFsdEdyVG9DdHJsQWx0OiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX09TOiBPcGVyYXRpbmdTeXN0ZW0sXG5cdCkge1xuXHRcdHRoaXMuX2NvZGVJbmZvID0gW107XG5cdFx0dGhpcy5fc2NhbkNvZGVLZXlDb2RlTWFwcGVyID0gbmV3IFNjYW5Db2RlS2V5Q29kZU1hcHBlcigpO1xuXHRcdHRoaXMuX3NjYW5Db2RlVG9MYWJlbCA9IFtdO1xuXHRcdHRoaXMuX3NjYW5Db2RlVG9EaXNwYXRjaCA9IFtdO1xuXG5cdFx0Y29uc3QgX3JlZ2lzdGVySWZVbmtub3duID0gKFxuXHRcdFx0aHdDdHJsS2V5OiAwIHwgMSwgaHdTaGlmdEtleTogMCB8IDEsIGh3QWx0S2V5OiAwIHwgMSwgc2NhbkNvZGU6IFNjYW5Db2RlLFxuXHRcdFx0a2JDdHJsS2V5OiAwIHwgMSwga2JTaGlmdEtleTogMCB8IDEsIGtiQWx0S2V5OiAwIHwgMSwga2V5Q29kZTogS2V5Q29kZSxcblx0XHQpOiB2b2lkID0+IHtcblx0XHRcdHRoaXMuX3NjYW5Db2RlS2V5Q29kZU1hcHBlci5yZWdpc3RlcklmVW5rbm93bihcblx0XHRcdFx0bmV3IFNjYW5Db2RlQ29tYm8oaHdDdHJsS2V5ID8gdHJ1ZSA6IGZhbHNlLCBod1NoaWZ0S2V5ID8gdHJ1ZSA6IGZhbHNlLCBod0FsdEtleSA/IHRydWUgOiBmYWxzZSwgc2NhbkNvZGUpLFxuXHRcdFx0XHRuZXcgS2V5Q29kZUNvbWJvKGtiQ3RybEtleSA/IHRydWUgOiBmYWxzZSwga2JTaGlmdEtleSA/IHRydWUgOiBmYWxzZSwga2JBbHRLZXkgPyB0cnVlIDogZmFsc2UsIGtleUNvZGUpXG5cdFx0XHQpO1xuXHRcdH07XG5cblx0XHRjb25zdCBfcmVnaXN0ZXJBbGxDb21ib3MgPSAoX2N0cmxLZXk6IDAgfCAxLCBfc2hpZnRLZXk6IDAgfCAxLCBfYWx0S2V5OiAwIHwgMSwgc2NhbkNvZGU6IFNjYW5Db2RlLCBrZXlDb2RlOiBLZXlDb2RlKTogdm9pZCA9PiB7XG5cdFx0XHRmb3IgKGxldCBjdHJsS2V5ID0gX2N0cmxLZXk7IGN0cmxLZXkgPD0gMTsgY3RybEtleSsrKSB7XG5cdFx0XHRcdGZvciAobGV0IHNoaWZ0S2V5ID0gX3NoaWZ0S2V5OyBzaGlmdEtleSA8PSAxOyBzaGlmdEtleSsrKSB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgYWx0S2V5ID0gX2FsdEtleTsgYWx0S2V5IDw9IDE7IGFsdEtleSsrKSB7XG5cdFx0XHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oXG5cdFx0XHRcdFx0XHRcdGN0cmxLZXksIHNoaWZ0S2V5LCBhbHRLZXksIHNjYW5Db2RlLFxuXHRcdFx0XHRcdFx0XHRjdHJsS2V5LCBzaGlmdEtleSwgYWx0S2V5LCBrZXlDb2RlXG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBJbml0aWFsaXplIGBfc2NhbkNvZGVUb0xhYmVsYFxuXHRcdGZvciAobGV0IHNjYW5Db2RlID0gU2NhbkNvZGUuTm9uZTsgc2NhbkNvZGUgPCBTY2FuQ29kZS5NQVhfVkFMVUU7IHNjYW5Db2RlKyspIHtcblx0XHRcdHRoaXMuX3NjYW5Db2RlVG9MYWJlbFtzY2FuQ29kZV0gPSBudWxsO1xuXHRcdH1cblxuXHRcdC8vIEluaXRpYWxpemUgYF9zY2FuQ29kZVRvRGlzcGF0Y2hgXG5cdFx0Zm9yIChsZXQgc2NhbkNvZGUgPSBTY2FuQ29kZS5Ob25lOyBzY2FuQ29kZSA8IFNjYW5Db2RlLk1BWF9WQUxVRTsgc2NhbkNvZGUrKykge1xuXHRcdFx0dGhpcy5fc2NhbkNvZGVUb0Rpc3BhdGNoW3NjYW5Db2RlXSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGltbXV0YWJsZSBtYXBwaW5nc1xuXHRcdGZvciAobGV0IHNjYW5Db2RlID0gU2NhbkNvZGUuTm9uZTsgc2NhbkNvZGUgPCBTY2FuQ29kZS5NQVhfVkFMVUU7IHNjYW5Db2RlKyspIHtcblx0XHRcdGNvbnN0IGtleUNvZGUgPSBJTU1VVEFCTEVfQ09ERV9UT19LRVlfQ09ERVtzY2FuQ29kZV07XG5cdFx0XHRpZiAoa2V5Q29kZSAhPT0gS2V5Q29kZS5EZXBlbmRzT25LYkxheW91dCkge1xuXHRcdFx0XHRfcmVnaXN0ZXJBbGxDb21ib3MoMCwgMCwgMCwgc2NhbkNvZGUsIGtleUNvZGUpO1xuXHRcdFx0XHR0aGlzLl9zY2FuQ29kZVRvTGFiZWxbc2NhbkNvZGVdID0gS2V5Q29kZVV0aWxzLnRvU3RyaW5nKGtleUNvZGUpO1xuXG5cdFx0XHRcdGlmIChrZXlDb2RlID09PSBLZXlDb2RlLlVua25vd24gfHwgaXNNb2RpZmllcktleShrZXlDb2RlKSkge1xuXHRcdFx0XHRcdHRoaXMuX3NjYW5Db2RlVG9EaXNwYXRjaFtzY2FuQ29kZV0gPSBudWxsOyAvLyBjYW5ub3QgZGlzcGF0Y2ggb24gdGhpcyBTY2FuQ29kZVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3NjYW5Db2RlVG9EaXNwYXRjaFtzY2FuQ29kZV0gPSBgWyR7U2NhbkNvZGVVdGlscy50b1N0cmluZyhzY2FuQ29kZSl9XWA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gaWRlbnRpZnkga2V5Ym9hcmQgbGF5b3V0cyB3aGVyZSBjaGFyYWN0ZXJzIEEtWiBhcmUgbWlzc2luZ1xuXHRcdC8vIGFuZCBmb3JjaWJseSBtYXAgdGhlbSB0byB0aGVpciBjb3JyZXNwb25kaW5nIHNjYW4gY29kZXMgaWYgdGhhdCBpcyB0aGUgY2FzZVxuXHRcdGNvbnN0IG1pc3NpbmdMYXRpbkxldHRlcnNPdmVycmlkZTogeyBbc2NhbkNvZGU6IHN0cmluZ106IElNYWNMaW51eEtleU1hcHBpbmcgfSA9IHt9O1xuXG5cdFx0e1xuXHRcdFx0Y29uc3QgcHJvZHVjZXNMYXRpbkxldHRlcjogYm9vbGVhbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHN0clNjYW5Db2RlIGluIHJhd01hcHBpbmdzKSB7XG5cdFx0XHRcdGlmIChyYXdNYXBwaW5ncy5oYXNPd25Qcm9wZXJ0eShzdHJTY2FuQ29kZSkpIHtcblx0XHRcdFx0XHRjb25zdCBzY2FuQ29kZSA9IFNjYW5Db2RlVXRpbHMudG9FbnVtKHN0clNjYW5Db2RlKTtcblx0XHRcdFx0XHRpZiAoc2NhbkNvZGUgPT09IFNjYW5Db2RlLk5vbmUpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbc2NhbkNvZGVdICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByYXdNYXBwaW5nID0gcmF3TWFwcGluZ3Nbc3RyU2NhbkNvZGVdO1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gTWFjTGludXhLZXlib2FyZE1hcHBlci5nZXRDaGFyQ29kZShyYXdNYXBwaW5nLnZhbHVlKTtcblxuXHRcdFx0XHRcdGlmICh2YWx1ZSA+PSBDaGFyQ29kZS5hICYmIHZhbHVlIDw9IENoYXJDb2RlLnopIHtcblx0XHRcdFx0XHRcdGNvbnN0IHVwcGVyQ2FzZVZhbHVlID0gQ2hhckNvZGUuQSArICh2YWx1ZSAtIENoYXJDb2RlLmEpO1xuXHRcdFx0XHRcdFx0cHJvZHVjZXNMYXRpbkxldHRlclt1cHBlckNhc2VWYWx1ZV0gPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcgPSAoY2hhckNvZGU6IENoYXJDb2RlLCBzY2FuQ29kZTogU2NhbkNvZGUsIHZhbHVlOiBzdHJpbmcsIHdpdGhTaGlmdDogc3RyaW5nKTogdm9pZCA9PiB7XG5cdFx0XHRcdGlmICghcHJvZHVjZXNMYXRpbkxldHRlcltjaGFyQ29kZV0pIHtcblx0XHRcdFx0XHRtaXNzaW5nTGF0aW5MZXR0ZXJzT3ZlcnJpZGVbU2NhbkNvZGVVdGlscy50b1N0cmluZyhzY2FuQ29kZSldID0ge1xuXHRcdFx0XHRcdFx0dmFsdWU6IHZhbHVlLFxuXHRcdFx0XHRcdFx0d2l0aFNoaWZ0OiB3aXRoU2hpZnQsXG5cdFx0XHRcdFx0XHR3aXRoQWx0R3I6ICcnLFxuXHRcdFx0XHRcdFx0d2l0aFNoaWZ0QWx0R3I6ICcnXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gRW5zdXJlIGxldHRlcnMgYXJlIG1hcHBlZFxuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkEsIFNjYW5Db2RlLktleUEsICdhJywgJ0EnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5CLCBTY2FuQ29kZS5LZXlCLCAnYicsICdCJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuQywgU2NhbkNvZGUuS2V5QywgJ2MnLCAnQycpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkQsIFNjYW5Db2RlLktleUQsICdkJywgJ0QnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5FLCBTY2FuQ29kZS5LZXlFLCAnZScsICdFJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuRiwgU2NhbkNvZGUuS2V5RiwgJ2YnLCAnRicpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkcsIFNjYW5Db2RlLktleUcsICdnJywgJ0cnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5ILCBTY2FuQ29kZS5LZXlILCAnaCcsICdIJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuSSwgU2NhbkNvZGUuS2V5SSwgJ2knLCAnSScpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLkosIFNjYW5Db2RlLktleUosICdqJywgJ0onKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5LLCBTY2FuQ29kZS5LZXlLLCAnaycsICdLJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuTCwgU2NhbkNvZGUuS2V5TCwgJ2wnLCAnTCcpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLk0sIFNjYW5Db2RlLktleU0sICdtJywgJ00nKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5OLCBTY2FuQ29kZS5LZXlOLCAnbicsICdOJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuTywgU2NhbkNvZGUuS2V5TywgJ28nLCAnTycpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlAsIFNjYW5Db2RlLktleVAsICdwJywgJ1AnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5RLCBTY2FuQ29kZS5LZXlRLCAncScsICdRJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuUiwgU2NhbkNvZGUuS2V5UiwgJ3InLCAnUicpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlMsIFNjYW5Db2RlLktleVMsICdzJywgJ1MnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5ULCBTY2FuQ29kZS5LZXlULCAndCcsICdUJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuVSwgU2NhbkNvZGUuS2V5VSwgJ3UnLCAnVScpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlYsIFNjYW5Db2RlLktleVYsICd2JywgJ1YnKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5XLCBTY2FuQ29kZS5LZXlXLCAndycsICdXJyk7XG5cdFx0XHRfcmVnaXN0ZXJMZXR0ZXJJZk1pc3NpbmcoQ2hhckNvZGUuWCwgU2NhbkNvZGUuS2V5WCwgJ3gnLCAnWCcpO1xuXHRcdFx0X3JlZ2lzdGVyTGV0dGVySWZNaXNzaW5nKENoYXJDb2RlLlksIFNjYW5Db2RlLktleVksICd5JywgJ1knKTtcblx0XHRcdF9yZWdpc3RlckxldHRlcklmTWlzc2luZyhDaGFyQ29kZS5aLCBTY2FuQ29kZS5LZXlaLCAneicsICdaJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFwcGluZ3M6IElTY2FuQ29kZU1hcHBpbmdbXSA9IFtdO1xuXHRcdGxldCBtYXBwaW5nc0xlbiA9IDA7XG5cdFx0Zm9yIChjb25zdCBzdHJTY2FuQ29kZSBpbiByYXdNYXBwaW5ncykge1xuXHRcdFx0aWYgKHJhd01hcHBpbmdzLmhhc093blByb3BlcnR5KHN0clNjYW5Db2RlKSkge1xuXHRcdFx0XHRjb25zdCBzY2FuQ29kZSA9IFNjYW5Db2RlVXRpbHMudG9FbnVtKHN0clNjYW5Db2RlKTtcblx0XHRcdFx0aWYgKHNjYW5Db2RlID09PSBTY2FuQ29kZS5Ob25lKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKElNTVVUQUJMRV9DT0RFX1RPX0tFWV9DT0RFW3NjYW5Db2RlXSAhPT0gS2V5Q29kZS5EZXBlbmRzT25LYkxheW91dCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fY29kZUluZm9bc2NhbkNvZGVdID0gcmF3TWFwcGluZ3Nbc3RyU2NhbkNvZGVdO1xuXG5cdFx0XHRcdGNvbnN0IHJhd01hcHBpbmcgPSBtaXNzaW5nTGF0aW5MZXR0ZXJzT3ZlcnJpZGVbc3RyU2NhbkNvZGVdIHx8IHJhd01hcHBpbmdzW3N0clNjYW5Db2RlXTtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLmdldENoYXJDb2RlKHJhd01hcHBpbmcudmFsdWUpO1xuXHRcdFx0XHRjb25zdCB3aXRoU2hpZnQgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLmdldENoYXJDb2RlKHJhd01hcHBpbmcud2l0aFNoaWZ0KTtcblx0XHRcdFx0Y29uc3Qgd2l0aEFsdEdyID0gTWFjTGludXhLZXlib2FyZE1hcHBlci5nZXRDaGFyQ29kZShyYXdNYXBwaW5nLndpdGhBbHRHcik7XG5cdFx0XHRcdGNvbnN0IHdpdGhTaGlmdEFsdEdyID0gTWFjTGludXhLZXlib2FyZE1hcHBlci5nZXRDaGFyQ29kZShyYXdNYXBwaW5nLndpdGhTaGlmdEFsdEdyKTtcblxuXHRcdFx0XHRjb25zdCBtYXBwaW5nOiBJU2NhbkNvZGVNYXBwaW5nID0ge1xuXHRcdFx0XHRcdHNjYW5Db2RlOiBzY2FuQ29kZSxcblx0XHRcdFx0XHR2YWx1ZTogdmFsdWUsXG5cdFx0XHRcdFx0d2l0aFNoaWZ0OiB3aXRoU2hpZnQsXG5cdFx0XHRcdFx0d2l0aEFsdEdyOiB3aXRoQWx0R3IsXG5cdFx0XHRcdFx0d2l0aFNoaWZ0QWx0R3I6IHdpdGhTaGlmdEFsdEdyLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRtYXBwaW5nc1ttYXBwaW5nc0xlbisrXSA9IG1hcHBpbmc7XG5cblx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0Rpc3BhdGNoW3NjYW5Db2RlXSA9IGBbJHtTY2FuQ29kZVV0aWxzLnRvU3RyaW5nKHNjYW5Db2RlKX1dYDtcblxuXHRcdFx0XHRpZiAodmFsdWUgPj0gQ2hhckNvZGUuYSAmJiB2YWx1ZSA8PSBDaGFyQ29kZS56KSB7XG5cdFx0XHRcdFx0Y29uc3QgdXBwZXJDYXNlVmFsdWUgPSBDaGFyQ29kZS5BICsgKHZhbHVlIC0gQ2hhckNvZGUuYSk7XG5cdFx0XHRcdFx0dGhpcy5fc2NhbkNvZGVUb0xhYmVsW3NjYW5Db2RlXSA9IFN0cmluZy5mcm9tQ2hhckNvZGUodXBwZXJDYXNlVmFsdWUpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHZhbHVlID49IENoYXJDb2RlLkEgJiYgdmFsdWUgPD0gQ2hhckNvZGUuWikge1xuXHRcdFx0XHRcdHRoaXMuX3NjYW5Db2RlVG9MYWJlbFtzY2FuQ29kZV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3NjYW5Db2RlVG9MYWJlbFtzY2FuQ29kZV0gPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zY2FuQ29kZVRvTGFiZWxbc2NhbkNvZGVdID0gbnVsbDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBhbGwgYHdpdGhTaGlmdEFsdEdyYCBlbnRyaWVzXG5cdFx0Zm9yIChsZXQgaSA9IG1hcHBpbmdzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBtYXBwaW5nID0gbWFwcGluZ3NbaV07XG5cdFx0XHRjb25zdCBzY2FuQ29kZSA9IG1hcHBpbmcuc2NhbkNvZGU7XG5cdFx0XHRjb25zdCB3aXRoU2hpZnRBbHRHciA9IG1hcHBpbmcud2l0aFNoaWZ0QWx0R3I7XG5cdFx0XHRpZiAod2l0aFNoaWZ0QWx0R3IgPT09IG1hcHBpbmcud2l0aEFsdEdyIHx8IHdpdGhTaGlmdEFsdEdyID09PSBtYXBwaW5nLndpdGhTaGlmdCB8fCB3aXRoU2hpZnRBbHRHciA9PT0gbWFwcGluZy52YWx1ZSkge1xuXHRcdFx0XHQvLyBoYW5kbGVkIGJlbG93XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2IgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLl9jaGFyQ29kZVRvS2Iod2l0aFNoaWZ0QWx0R3IpO1xuXHRcdFx0aWYgKCFrYikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtiU2hpZnRLZXkgPSBrYi5zaGlmdEtleTtcblx0XHRcdGNvbnN0IGtleUNvZGUgPSBrYi5rZXlDb2RlO1xuXG5cdFx0XHRpZiAoa2JTaGlmdEtleSkge1xuXHRcdFx0XHQvLyBDdHJsK1NoaWZ0K0FsdCtTY2FuQ29kZSA9PiBTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAxLCAxLCBzY2FuQ29kZSwgMCwgMSwgMCwga2V5Q29kZSk7IC8vICAgICAgIEN0cmwrQWx0K1NjYW5Db2RlID0+ICAgICAgICAgIFNoaWZ0K0tleUNvZGVcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEN0cmwrU2hpZnQrQWx0K1NjYW5Db2RlID0+IEtleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDEsIDEsIHNjYW5Db2RlLCAwLCAwLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgQ3RybCtBbHQrU2NhbkNvZGUgPT4gICAgICAgICAgICAgICAgS2V5Q29kZVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBIYW5kbGUgYWxsIGB3aXRoQWx0R3JgIGVudHJpZXNcblx0XHRmb3IgKGxldCBpID0gbWFwcGluZ3MubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG1hcHBpbmcgPSBtYXBwaW5nc1tpXTtcblx0XHRcdGNvbnN0IHNjYW5Db2RlID0gbWFwcGluZy5zY2FuQ29kZTtcblx0XHRcdGNvbnN0IHdpdGhBbHRHciA9IG1hcHBpbmcud2l0aEFsdEdyO1xuXHRcdFx0aWYgKHdpdGhBbHRHciA9PT0gbWFwcGluZy53aXRoU2hpZnQgfHwgd2l0aEFsdEdyID09PSBtYXBwaW5nLnZhbHVlKSB7XG5cdFx0XHRcdC8vIGhhbmRsZWQgYmVsb3dcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrYiA9IE1hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuX2NoYXJDb2RlVG9LYih3aXRoQWx0R3IpO1xuXHRcdFx0aWYgKCFrYikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtiU2hpZnRLZXkgPSBrYi5zaGlmdEtleTtcblx0XHRcdGNvbnN0IGtleUNvZGUgPSBrYi5rZXlDb2RlO1xuXG5cdFx0XHRpZiAoa2JTaGlmdEtleSkge1xuXHRcdFx0XHQvLyBDdHJsK0FsdCtTY2FuQ29kZSA9PiBTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAwLCAxLCBzY2FuQ29kZSwgMCwgMSwgMCwga2V5Q29kZSk7IC8vICAgICAgIEN0cmwrQWx0K1NjYW5Db2RlID0+ICAgICAgICAgIFNoaWZ0K0tleUNvZGVcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEN0cmwrQWx0K1NjYW5Db2RlID0+IEtleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDAsIDEsIHNjYW5Db2RlLCAwLCAwLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgQ3RybCtBbHQrU2NhbkNvZGUgPT4gICAgICAgICAgICAgICAgS2V5Q29kZVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBIYW5kbGUgYWxsIGB3aXRoU2hpZnRgIGVudHJpZXNcblx0XHRmb3IgKGxldCBpID0gbWFwcGluZ3MubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IG1hcHBpbmcgPSBtYXBwaW5nc1tpXTtcblx0XHRcdGNvbnN0IHNjYW5Db2RlID0gbWFwcGluZy5zY2FuQ29kZTtcblx0XHRcdGNvbnN0IHdpdGhTaGlmdCA9IG1hcHBpbmcud2l0aFNoaWZ0O1xuXHRcdFx0aWYgKHdpdGhTaGlmdCA9PT0gbWFwcGluZy52YWx1ZSkge1xuXHRcdFx0XHQvLyBoYW5kbGVkIGJlbG93XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2IgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLl9jaGFyQ29kZVRvS2Iod2l0aFNoaWZ0KTtcblx0XHRcdGlmICgha2IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBrYlNoaWZ0S2V5ID0ga2Iuc2hpZnRLZXk7XG5cdFx0XHRjb25zdCBrZXlDb2RlID0ga2Iua2V5Q29kZTtcblxuXHRcdFx0aWYgKGtiU2hpZnRLZXkpIHtcblx0XHRcdFx0Ly8gU2hpZnQrU2NhbkNvZGUgPT4gU2hpZnQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMSwgMCwgc2NhbkNvZGUsIDAsIDEsIDAsIGtleUNvZGUpOyAvLyAgICAgICAgICBTaGlmdCtTY2FuQ29kZSA9PiAgICAgICAgICBTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAxLCAxLCBzY2FuQ29kZSwgMCwgMSwgMSwga2V5Q29kZSk7IC8vICAgICAgU2hpZnQrQWx0K1NjYW5Db2RlID0+ICAgICAgU2hpZnQrQWx0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDEsIDAsIHNjYW5Db2RlLCAxLCAxLCAwLCBrZXlDb2RlKTsgLy8gICAgIEN0cmwrU2hpZnQrU2NhbkNvZGUgPT4gICAgIEN0cmwrU2hpZnQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMSwgMSwgc2NhbkNvZGUsIDEsIDEsIDEsIGtleUNvZGUpOyAvLyBDdHJsK1NoaWZ0K0FsdCtTY2FuQ29kZSA9PiBDdHJsK1NoaWZ0K0FsdCtLZXlDb2RlXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTaGlmdCtTY2FuQ29kZSA9PiBLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAxLCAwLCBzY2FuQ29kZSwgMCwgMCwgMCwga2V5Q29kZSk7IC8vICAgICAgICAgIFNoaWZ0K1NjYW5Db2RlID0+ICAgICAgICAgICAgICAgIEtleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDAsIDEsIDAsIHNjYW5Db2RlLCAwLCAxLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgICAgU2hpZnQrU2NhbkNvZGUgPT4gICAgICAgICAgU2hpZnQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMSwgMSwgc2NhbkNvZGUsIDAsIDAsIDEsIGtleUNvZGUpOyAvLyAgICAgIFNoaWZ0K0FsdCtTY2FuQ29kZSA9PiAgICAgICAgICAgIEFsdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAxLCAxLCBzY2FuQ29kZSwgMCwgMSwgMSwga2V5Q29kZSk7IC8vICAgICAgU2hpZnQrQWx0K1NjYW5Db2RlID0+ICAgICAgU2hpZnQrQWx0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDEsIDAsIHNjYW5Db2RlLCAxLCAwLCAwLCBrZXlDb2RlKTsgLy8gICAgIEN0cmwrU2hpZnQrU2NhbkNvZGUgPT4gICAgICAgICAgIEN0cmwrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMSwgMCwgc2NhbkNvZGUsIDEsIDEsIDAsIGtleUNvZGUpOyAvLyAgICAgQ3RybCtTaGlmdCtTY2FuQ29kZSA9PiAgICAgQ3RybCtTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAxLCAxLCBzY2FuQ29kZSwgMSwgMCwgMSwga2V5Q29kZSk7IC8vIEN0cmwrU2hpZnQrQWx0K1NjYW5Db2RlID0+ICAgICAgIEN0cmwrQWx0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDEsIDEsIHNjYW5Db2RlLCAxLCAxLCAxLCBrZXlDb2RlKTsgLy8gQ3RybCtTaGlmdCtBbHQrU2NhbkNvZGUgPT4gQ3RybCtTaGlmdCtBbHQrS2V5Q29kZVxuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBIYW5kbGUgYWxsIGB2YWx1ZWAgZW50cmllc1xuXHRcdGZvciAobGV0IGkgPSBtYXBwaW5ncy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgbWFwcGluZyA9IG1hcHBpbmdzW2ldO1xuXHRcdFx0Y29uc3Qgc2NhbkNvZGUgPSBtYXBwaW5nLnNjYW5Db2RlO1xuXHRcdFx0Y29uc3Qga2IgPSBNYWNMaW51eEtleWJvYXJkTWFwcGVyLl9jaGFyQ29kZVRvS2IobWFwcGluZy52YWx1ZSk7XG5cdFx0XHRpZiAoIWtiKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2JTaGlmdEtleSA9IGtiLnNoaWZ0S2V5O1xuXHRcdFx0Y29uc3Qga2V5Q29kZSA9IGtiLmtleUNvZGU7XG5cblx0XHRcdGlmIChrYlNoaWZ0S2V5KSB7XG5cdFx0XHRcdC8vIFNjYW5Db2RlID0+IFNoaWZ0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDAsIDAsIDAsIHNjYW5Db2RlLCAwLCAxLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgICAgICAgICAgU2NhbkNvZGUgPT4gICAgICAgICAgU2hpZnQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMCwgMSwgc2NhbkNvZGUsIDAsIDEsIDEsIGtleUNvZGUpOyAvLyAgICAgICAgICAgIEFsdCtTY2FuQ29kZSA9PiAgICAgIFNoaWZ0K0FsdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAwLCAwLCBzY2FuQ29kZSwgMSwgMSwgMCwga2V5Q29kZSk7IC8vICAgICAgICAgICBDdHJsK1NjYW5Db2RlID0+ICAgICBDdHJsK1NoaWZ0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDAsIDEsIHNjYW5Db2RlLCAxLCAxLCAxLCBrZXlDb2RlKTsgLy8gICAgICAgQ3RybCtBbHQrU2NhbkNvZGUgPT4gQ3RybCtTaGlmdCtBbHQrS2V5Q29kZVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gU2NhbkNvZGUgPT4gS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMCwgMCwgc2NhbkNvZGUsIDAsIDAsIDAsIGtleUNvZGUpOyAvLyAgICAgICAgICAgICAgICBTY2FuQ29kZSA9PiAgICAgICAgICAgICAgICBLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigwLCAwLCAxLCBzY2FuQ29kZSwgMCwgMCwgMSwga2V5Q29kZSk7IC8vICAgICAgICAgICAgQWx0K1NjYW5Db2RlID0+ICAgICAgICAgICAgQWx0K0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDAsIDEsIDAsIHNjYW5Db2RlLCAwLCAxLCAwLCBrZXlDb2RlKTsgLy8gICAgICAgICAgU2hpZnQrU2NhbkNvZGUgPT4gICAgICAgICAgU2hpZnQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMCwgMSwgMSwgc2NhbkNvZGUsIDAsIDEsIDEsIGtleUNvZGUpOyAvLyAgICAgIFNoaWZ0K0FsdCtTY2FuQ29kZSA9PiAgICAgIFNoaWZ0K0FsdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAwLCAwLCBzY2FuQ29kZSwgMSwgMCwgMCwga2V5Q29kZSk7IC8vICAgICAgICAgICBDdHJsK1NjYW5Db2RlID0+ICAgICAgICAgICBDdHJsK0tleUNvZGVcblx0XHRcdFx0X3JlZ2lzdGVySWZVbmtub3duKDEsIDAsIDEsIHNjYW5Db2RlLCAxLCAwLCAxLCBrZXlDb2RlKTsgLy8gICAgICAgQ3RybCtBbHQrU2NhbkNvZGUgPT4gICAgICAgQ3RybCtBbHQrS2V5Q29kZVxuXHRcdFx0XHRfcmVnaXN0ZXJJZlVua25vd24oMSwgMSwgMCwgc2NhbkNvZGUsIDEsIDEsIDAsIGtleUNvZGUpOyAvLyAgICAgQ3RybCtTaGlmdCtTY2FuQ29kZSA9PiAgICAgQ3RybCtTaGlmdCtLZXlDb2RlXG5cdFx0XHRcdF9yZWdpc3RlcklmVW5rbm93bigxLCAxLCAxLCBzY2FuQ29kZSwgMSwgMSwgMSwga2V5Q29kZSk7IC8vIEN0cmwrU2hpZnQrQWx0K1NjYW5Db2RlID0+IEN0cmwrU2hpZnQrQWx0K0tleUNvZGVcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gSGFuZGxlIGFsbCBsZWZ0LW92ZXIgYXZhaWxhYmxlIGRpZ2l0c1xuXHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBTY2FuQ29kZS5EaWdpdDEsIEtleUNvZGUuRGlnaXQxKTtcblx0XHRfcmVnaXN0ZXJBbGxDb21ib3MoMCwgMCwgMCwgU2NhbkNvZGUuRGlnaXQyLCBLZXlDb2RlLkRpZ2l0Mik7XG5cdFx0X3JlZ2lzdGVyQWxsQ29tYm9zKDAsIDAsIDAsIFNjYW5Db2RlLkRpZ2l0MywgS2V5Q29kZS5EaWdpdDMpO1xuXHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBTY2FuQ29kZS5EaWdpdDQsIEtleUNvZGUuRGlnaXQ0KTtcblx0XHRfcmVnaXN0ZXJBbGxDb21ib3MoMCwgMCwgMCwgU2NhbkNvZGUuRGlnaXQ1LCBLZXlDb2RlLkRpZ2l0NSk7XG5cdFx0X3JlZ2lzdGVyQWxsQ29tYm9zKDAsIDAsIDAsIFNjYW5Db2RlLkRpZ2l0NiwgS2V5Q29kZS5EaWdpdDYpO1xuXHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBTY2FuQ29kZS5EaWdpdDcsIEtleUNvZGUuRGlnaXQ3KTtcblx0XHRfcmVnaXN0ZXJBbGxDb21ib3MoMCwgMCwgMCwgU2NhbkNvZGUuRGlnaXQ4LCBLZXlDb2RlLkRpZ2l0OCk7XG5cdFx0X3JlZ2lzdGVyQWxsQ29tYm9zKDAsIDAsIDAsIFNjYW5Db2RlLkRpZ2l0OSwgS2V5Q29kZS5EaWdpdDkpO1xuXHRcdF9yZWdpc3RlckFsbENvbWJvcygwLCAwLCAwLCBTY2FuQ29kZS5EaWdpdDAsIEtleUNvZGUuRGlnaXQwKTtcblxuXHRcdHRoaXMuX3NjYW5Db2RlS2V5Q29kZU1hcHBlci5yZWdpc3RyYXRpb25Db21wbGV0ZSgpO1xuXHR9XG5cblx0cHVibGljIGR1bXBEZWJ1Z0luZm8oKTogc3RyaW5nIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCBpbW11dGFibGVTYW1wbGVzID0gW1xuXHRcdFx0U2NhbkNvZGUuQXJyb3dVcCxcblx0XHRcdFNjYW5Db2RlLk51bXBhZDBcblx0XHRdO1xuXG5cdFx0bGV0IGNudCA9IDA7XG5cdFx0cmVzdWx0LnB1c2goYGlzVVNTdGFuZGFyZDogJHt0aGlzLl9pc1VTU3RhbmRhcmR9YCk7XG5cdFx0cmVzdWx0LnB1c2goYC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcblx0XHRmb3IgKGxldCBzY2FuQ29kZSA9IFNjYW5Db2RlLk5vbmU7IHNjYW5Db2RlIDwgU2NhbkNvZGUuTUFYX1ZBTFVFOyBzY2FuQ29kZSsrKSB7XG5cdFx0XHRpZiAoSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbc2NhbkNvZGVdICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRcdGlmIChpbW11dGFibGVTYW1wbGVzLmluZGV4T2Yoc2NhbkNvZGUpID09PSAtMSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjbnQgJSA0ID09PSAwKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGB8ICAgICAgIEhXIENvZGUgY29tYmluYXRpb24gICAgICB8ICBLZXkgIHwgICAgS2V5Q29kZSBjb21iaW5hdGlvbiAgICB8IFByaSB8ICAgICAgICAgIFVJIGxhYmVsICAgICAgICAgfCAgICAgICAgIFVzZXIgc2V0dGluZ3MgICAgICAgICAgfCAgICBFbGVjdHJvbiBhY2NlbGVyYXRvciAgIHwgICAgICAgRGlzcGF0Y2hpbmcgc3RyaW5nICAgICAgIHwgV1lTSVdZRyB8YCk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tYCk7XG5cdFx0XHR9XG5cdFx0XHRjbnQrKztcblxuXHRcdFx0Y29uc3QgbWFwcGluZyA9IHRoaXMuX2NvZGVJbmZvW3NjYW5Db2RlXTtcblxuXHRcdFx0Zm9yIChsZXQgbW9kID0gMDsgbW9kIDwgODsgbW9kKyspIHtcblx0XHRcdFx0Y29uc3QgaHdDdHJsS2V5ID0gKG1vZCAmIDBiMDAxKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdFx0Y29uc3QgaHdTaGlmdEtleSA9IChtb2QgJiAwYjAxMCkgPyB0cnVlIDogZmFsc2U7XG5cdFx0XHRcdGNvbnN0IGh3QWx0S2V5ID0gKG1vZCAmIDBiMTAwKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdFx0Y29uc3Qgc2NhbkNvZGVDb21ibyA9IG5ldyBTY2FuQ29kZUNvbWJvKGh3Q3RybEtleSwgaHdTaGlmdEtleSwgaHdBbHRLZXksIHNjYW5Db2RlKTtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRLYiA9IHRoaXMucmVzb2x2ZUtleWJvYXJkRXZlbnQoe1xuXHRcdFx0XHRcdF9zdGFuZGFyZEtleWJvYXJkRXZlbnRCcmFuZDogdHJ1ZSxcblx0XHRcdFx0XHRjdHJsS2V5OiBzY2FuQ29kZUNvbWJvLmN0cmxLZXksXG5cdFx0XHRcdFx0c2hpZnRLZXk6IHNjYW5Db2RlQ29tYm8uc2hpZnRLZXksXG5cdFx0XHRcdFx0YWx0S2V5OiBzY2FuQ29kZUNvbWJvLmFsdEtleSxcblx0XHRcdFx0XHRtZXRhS2V5OiBmYWxzZSxcblx0XHRcdFx0XHRhbHRHcmFwaEtleTogZmFsc2UsXG5cdFx0XHRcdFx0a2V5Q29kZTogS2V5Q29kZS5EZXBlbmRzT25LYkxheW91dCxcblx0XHRcdFx0XHRjb2RlOiBTY2FuQ29kZVV0aWxzLnRvU3RyaW5nKHNjYW5Db2RlKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBvdXRTY2FuQ29kZUNvbWJvID0gc2NhbkNvZGVDb21iby50b1N0cmluZygpO1xuXHRcdFx0XHRjb25zdCBvdXRLZXkgPSBzY2FuQ29kZUNvbWJvLmdldFByb2R1Y2VkQ2hhcihtYXBwaW5nKTtcblx0XHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gcmVzb2x2ZWRLYi5nZXRBcmlhTGFiZWwoKTtcblx0XHRcdFx0Y29uc3Qgb3V0VUlMYWJlbCA9IChhcmlhTGFiZWwgPyBhcmlhTGFiZWwucmVwbGFjZSgvQ29udHJvbFxcKy8sICdDdHJsKycpIDogbnVsbCk7XG5cdFx0XHRcdGNvbnN0IG91dFVzZXJTZXR0aW5ncyA9IHJlc29sdmVkS2IuZ2V0VXNlclNldHRpbmdzTGFiZWwoKTtcblx0XHRcdFx0Y29uc3Qgb3V0RWxlY3Ryb25BY2NlbGVyYXRvciA9IHJlc29sdmVkS2IuZ2V0RWxlY3Ryb25BY2NlbGVyYXRvcigpO1xuXHRcdFx0XHRjb25zdCBvdXREaXNwYXRjaFN0ciA9IHJlc29sdmVkS2IuZ2V0RGlzcGF0Y2hDaG9yZHMoKVswXTtcblxuXHRcdFx0XHRjb25zdCBpc1dZU0lXWUcgPSAocmVzb2x2ZWRLYiA/IHJlc29sdmVkS2IuaXNXWVNJV1lHKCkgOiBmYWxzZSk7XG5cdFx0XHRcdGNvbnN0IG91dFdZU0lXWUcgPSAoaXNXWVNJV1lHID8gJyAgICAgICAnIDogJyAgIE5PICAnKTtcblxuXHRcdFx0XHRjb25zdCBrYkNvbWJvcyA9IHRoaXMuX3NjYW5Db2RlS2V5Q29kZU1hcHBlci5sb29rdXBTY2FuQ29kZUNvbWJvKHNjYW5Db2RlQ29tYm8pO1xuXHRcdFx0XHRpZiAoa2JDb21ib3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goYHwgJHt0aGlzLl9sZWZ0UGFkKG91dFNjYW5Db2RlQ29tYm8sIDMwKX0gfCAke291dEtleX0gfCAke3RoaXMuX2xlZnRQYWQoJycsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQoJycsIDMpfSB8ICR7dGhpcy5fbGVmdFBhZChvdXRVSUxhYmVsLCAyNSl9IHwgJHt0aGlzLl9sZWZ0UGFkKG91dFVzZXJTZXR0aW5ncywgMzApfSB8ICR7dGhpcy5fbGVmdFBhZChvdXRFbGVjdHJvbkFjY2VsZXJhdG9yLCAyNSl9IHwgJHt0aGlzLl9sZWZ0UGFkKG91dERpc3BhdGNoU3RyLCAzMCl9IHwgJHtvdXRXWVNJV1lHfSB8YCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGtiQ29tYm9zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBrYkNvbWJvID0ga2JDb21ib3NbaV07XG5cdFx0XHRcdFx0XHQvLyBmaW5kIG91dCB0aGUgcHJpb3JpdHkgb2YgdGhpcyBzY2FuIGNvZGUgZm9yIHRoaXMga2V5IGNvZGVcblx0XHRcdFx0XHRcdGxldCBjb2xQcmlvcml0eTogc3RyaW5nO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBzY2FuQ29kZUNvbWJvcyA9IHRoaXMuX3NjYW5Db2RlS2V5Q29kZU1hcHBlci5sb29rdXBLZXlDb2RlQ29tYm8oa2JDb21ibyk7XG5cdFx0XHRcdFx0XHRpZiAoc2NhbkNvZGVDb21ib3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdC8vIG5vIG5lZWQgZm9yIHByaW9yaXR5LCB0aGlzIGtleSBjb2RlIGNvbWJvIG1hcHMgdG8gcHJlY2lzZWx5IHRoaXMgc2NhbiBjb2RlIGNvbWJvXG5cdFx0XHRcdFx0XHRcdGNvbFByaW9yaXR5ID0gJyc7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRsZXQgcHJpb3JpdHkgPSAtMTtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaiA9IDA7IGogPCBzY2FuQ29kZUNvbWJvcy5sZW5ndGg7IGorKykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChzY2FuQ29kZUNvbWJvc1tqXS5lcXVhbHMoc2NhbkNvZGVDb21ibykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHByaW9yaXR5ID0gaiArIDE7XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29sUHJpb3JpdHkgPSBTdHJpbmcocHJpb3JpdHkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBvdXRLZXliaW5kaW5nID0ga2JDb21iby50b1N0cmluZygpO1xuXHRcdFx0XHRcdFx0aWYgKGkgPT09IDApIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2goYHwgJHt0aGlzLl9sZWZ0UGFkKG91dFNjYW5Db2RlQ29tYm8sIDMwKX0gfCAke291dEtleX0gfCAke3RoaXMuX2xlZnRQYWQob3V0S2V5YmluZGluZywgMjUpfSB8ICR7dGhpcy5fbGVmdFBhZChjb2xQcmlvcml0eSwgMyl9IHwgJHt0aGlzLl9sZWZ0UGFkKG91dFVJTGFiZWwsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQob3V0VXNlclNldHRpbmdzLCAzMCl9IHwgJHt0aGlzLl9sZWZ0UGFkKG91dEVsZWN0cm9uQWNjZWxlcmF0b3IsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQob3V0RGlzcGF0Y2hTdHIsIDMwKX0gfCAke291dFdZU0lXWUd9IHxgKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIHNlY29uZGFyeSBrZXliaW5kaW5nc1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQucHVzaChgfCAke3RoaXMuX2xlZnRQYWQoJycsIDMwKX0gfCAgICAgICB8ICR7dGhpcy5fbGVmdFBhZChvdXRLZXliaW5kaW5nLCAyNSl9IHwgJHt0aGlzLl9sZWZ0UGFkKGNvbFByaW9yaXR5LCAzKX0gfCAke3RoaXMuX2xlZnRQYWQoJycsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQoJycsIDMwKX0gfCAke3RoaXMuX2xlZnRQYWQoJycsIDI1KX0gfCAke3RoaXMuX2xlZnRQYWQoJycsIDMwKX0gfCAgICAgICAgIHxgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goYC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LmpvaW4oJ1xcbicpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGVmdFBhZChzdHI6IHN0cmluZyB8IG51bGwsIGNudDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRpZiAoc3RyID09PSBudWxsKSB7XG5cdFx0XHRzdHIgPSAnbnVsbCc7XG5cdFx0fVxuXHRcdHdoaWxlIChzdHIubGVuZ3RoIDwgY250KSB7XG5cdFx0XHRzdHIgPSAnICcgKyBzdHI7XG5cdFx0fVxuXHRcdHJldHVybiBzdHI7XG5cdH1cblxuXHRwdWJsaWMga2V5Q29kZUNob3JkVG9TY2FuQ29kZUNob3JkKGNob3JkOiBLZXlDb2RlQ2hvcmQpOiBTY2FuQ29kZUNob3JkW10ge1xuXHRcdC8vIEF2b2lkIGRvdWJsZSBFbnRlciBiaW5kaW5ncyAoYm90aCBTY2FuQ29kZS5OdW1wYWRFbnRlciBhbmQgU2NhbkNvZGUuRW50ZXIgcG9pbnQgdG8gS2V5Q29kZS5FbnRlcilcblx0XHRpZiAoY2hvcmQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikge1xuXHRcdFx0cmV0dXJuIFtuZXcgU2NhbkNvZGVDaG9yZChjaG9yZC5jdHJsS2V5LCBjaG9yZC5zaGlmdEtleSwgY2hvcmQuYWx0S2V5LCBjaG9yZC5tZXRhS2V5LCBTY2FuQ29kZS5FbnRlcildO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjYW5Db2RlQ29tYm9zID0gdGhpcy5fc2NhbkNvZGVLZXlDb2RlTWFwcGVyLmxvb2t1cEtleUNvZGVDb21ibyhcblx0XHRcdG5ldyBLZXlDb2RlQ29tYm8oY2hvcmQuY3RybEtleSwgY2hvcmQuc2hpZnRLZXksIGNob3JkLmFsdEtleSwgY2hvcmQua2V5Q29kZSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBTY2FuQ29kZUNob3JkW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gc2NhbkNvZGVDb21ib3MubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNjYW5Db2RlQ29tYm8gPSBzY2FuQ29kZUNvbWJvc1tpXTtcblx0XHRcdHJlc3VsdFtpXSA9IG5ldyBTY2FuQ29kZUNob3JkKHNjYW5Db2RlQ29tYm8uY3RybEtleSwgc2NhbkNvZGVDb21iby5zaGlmdEtleSwgc2NhbkNvZGVDb21iby5hbHRLZXksIGNob3JkLm1ldGFLZXksIHNjYW5Db2RlQ29tYm8uc2NhbkNvZGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldFVJTGFiZWxGb3JTY2FuQ29kZUNob3JkKGNob3JkOiBTY2FuQ29kZUNob3JkIHwgbnVsbCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGlmICghY2hvcmQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuaXNEdXBsaWNhdGVNb2RpZmllckNhc2UoKSkge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fT1MgPT09IE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpIHtcblx0XHRcdHN3aXRjaCAoY2hvcmQuc2NhbkNvZGUpIHtcblx0XHRcdFx0Y2FzZSBTY2FuQ29kZS5BcnJvd0xlZnQ6XG5cdFx0XHRcdFx0cmV0dXJuICdcdTIxOTAnO1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkFycm93VXA6XG5cdFx0XHRcdFx0cmV0dXJuICdcdTIxOTEnO1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkFycm93UmlnaHQ6XG5cdFx0XHRcdFx0cmV0dXJuICdcdTIxOTInO1xuXHRcdFx0XHRjYXNlIFNjYW5Db2RlLkFycm93RG93bjpcblx0XHRcdFx0XHRyZXR1cm4gJ1x1MjE5Myc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zY2FuQ29kZVRvTGFiZWxbY2hvcmQuc2NhbkNvZGVdO1xuXHR9XG5cblx0cHVibGljIGdldEFyaWFMYWJlbEZvclNjYW5Db2RlQ2hvcmQoY2hvcmQ6IFNjYW5Db2RlQ2hvcmQgfCBudWxsKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKCFjaG9yZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5pc0R1cGxpY2F0ZU1vZGlmaWVyQ2FzZSgpKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zY2FuQ29kZVRvTGFiZWxbY2hvcmQuc2NhbkNvZGVdO1xuXHR9XG5cblx0cHVibGljIGdldERpc3BhdGNoU3RyRm9yU2NhbkNvZGVDaG9yZChjaG9yZDogU2NhbkNvZGVDaG9yZCk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IGNvZGVEaXNwYXRjaCA9IHRoaXMuX3NjYW5Db2RlVG9EaXNwYXRjaFtjaG9yZC5zY2FuQ29kZV07XG5cdFx0aWYgKCFjb2RlRGlzcGF0Y2gpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0ID0gJyc7XG5cblx0XHRpZiAoY2hvcmQuY3RybEtleSkge1xuXHRcdFx0cmVzdWx0ICs9ICdjdHJsKyc7XG5cdFx0fVxuXHRcdGlmIChjaG9yZC5zaGlmdEtleSkge1xuXHRcdFx0cmVzdWx0ICs9ICdzaGlmdCsnO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQuYWx0S2V5KSB7XG5cdFx0XHRyZXN1bHQgKz0gJ2FsdCsnO1xuXHRcdH1cblx0XHRpZiAoY2hvcmQubWV0YUtleSkge1xuXHRcdFx0cmVzdWx0ICs9ICdtZXRhKyc7XG5cdFx0fVxuXHRcdHJlc3VsdCArPSBjb2RlRGlzcGF0Y2g7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGdldFVzZXJTZXR0aW5nc0xhYmVsRm9yU2NhbkNvZGVDaG9yZChjaG9yZDogU2NhbkNvZGVDaG9yZCB8IG51bGwpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIWNob3JkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGNob3JkLmlzRHVwbGljYXRlTW9kaWZpZXJDYXNlKCkpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRjb25zdCBpbW11dGFibGVLZXlDb2RlID0gSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbY2hvcmQuc2NhbkNvZGVdO1xuXHRcdGlmIChpbW11dGFibGVLZXlDb2RlICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvVXNlclNldHRpbmdzVVMoaW1tdXRhYmxlS2V5Q29kZSkudG9Mb3dlckNhc2UoKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGlzIHNjYW5Db2RlIGFsd2F5cyBtYXBzIHRvIHRoZSBzYW1lIGtleUNvZGUgYW5kIGJhY2tcblx0XHRjb25zdCBjb25zdGFudEtleUNvZGU6IEtleUNvZGUgPSB0aGlzLl9zY2FuQ29kZUtleUNvZGVNYXBwZXIuZ3Vlc3NTdGFibGVLZXlDb2RlKGNob3JkLnNjYW5Db2RlKTtcblx0XHRpZiAoY29uc3RhbnRLZXlDb2RlICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHQvLyBWZXJpZnkgdGhhdCB0aGlzIGlzIGEgZ29vZCBrZXkgY29kZSB0aGF0IGNhbiBiZSBtYXBwZWQgYmFjayB0byB0aGUgc2FtZSBzY2FuIGNvZGVcblx0XHRcdGNvbnN0IHJldmVyc2VDaG9yZHMgPSB0aGlzLmtleUNvZGVDaG9yZFRvU2NhbkNvZGVDaG9yZChuZXcgS2V5Q29kZUNob3JkKGNob3JkLmN0cmxLZXksIGNob3JkLnNoaWZ0S2V5LCBjaG9yZC5hbHRLZXksIGNob3JkLm1ldGFLZXksIGNvbnN0YW50S2V5Q29kZSkpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJldmVyc2VDaG9yZHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgcmV2ZXJzZUNob3JkID0gcmV2ZXJzZUNob3Jkc1tpXTtcblx0XHRcdFx0aWYgKHJldmVyc2VDaG9yZC5zY2FuQ29kZSA9PT0gY2hvcmQuc2NhbkNvZGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvVXNlclNldHRpbmdzVVMoY29uc3RhbnRLZXlDb2RlKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3NjYW5Db2RlVG9EaXNwYXRjaFtjaG9yZC5zY2FuQ29kZV07XG5cdH1cblxuXHRwdWJsaWMgZ2V0RWxlY3Ryb25BY2NlbGVyYXRvckxhYmVsRm9yU2NhbkNvZGVDaG9yZChjaG9yZDogU2NhbkNvZGVDaG9yZCB8IG51bGwpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIWNob3JkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBpbW11dGFibGVLZXlDb2RlID0gSU1NVVRBQkxFX0NPREVfVE9fS0VZX0NPREVbY2hvcmQuc2NhbkNvZGVdO1xuXHRcdGlmIChpbW11dGFibGVLZXlDb2RlICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvRWxlY3Ryb25BY2NlbGVyYXRvcihpbW11dGFibGVLZXlDb2RlKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGlzIHNjYW5Db2RlIGFsd2F5cyBtYXBzIHRvIHRoZSBzYW1lIGtleUNvZGUgYW5kIGJhY2tcblx0XHRjb25zdCBjb25zdGFudEtleUNvZGU6IEtleUNvZGUgPSB0aGlzLl9zY2FuQ29kZUtleUNvZGVNYXBwZXIuZ3Vlc3NTdGFibGVLZXlDb2RlKGNob3JkLnNjYW5Db2RlKTtcblxuXHRcdGlmICh0aGlzLl9PUyA9PT0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4ICYmICF0aGlzLl9pc1VTU3RhbmRhcmQpIHtcblx0XHRcdC8vIFtFbGVjdHJvbiBBY2NlbGVyYXRvcnNdIE9uIExpbnV4LCBFbGVjdHJvbiBkb2VzIG5vdCBoYW5kbGUgY29ycmVjdGx5IE9FTSBrZXlzLlxuXHRcdFx0Ly8gd2hlbiB1c2luZyBhIGRpZmZlcmVudCBrZXlib2FyZCBsYXlvdXQgdGhhbiBVUyBTdGFuZGFyZC5cblx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjM3MDZcblx0XHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEzNDg5MCNpc3N1ZWNvbW1lbnQtOTQxNjcxNzkxXG5cdFx0XHRjb25zdCBpc09FTUtleSA9IChcblx0XHRcdFx0Y29uc3RhbnRLZXlDb2RlID09PSBLZXlDb2RlLlNlbWljb2xvblxuXHRcdFx0XHR8fCBjb25zdGFudEtleUNvZGUgPT09IEtleUNvZGUuRXF1YWxcblx0XHRcdFx0fHwgY29uc3RhbnRLZXlDb2RlID09PSBLZXlDb2RlLkNvbW1hXG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5NaW51c1xuXHRcdFx0XHR8fCBjb25zdGFudEtleUNvZGUgPT09IEtleUNvZGUuUGVyaW9kXG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5TbGFzaFxuXHRcdFx0XHR8fCBjb25zdGFudEtleUNvZGUgPT09IEtleUNvZGUuQmFja3F1b3RlXG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5CcmFja2V0TGVmdFxuXHRcdFx0XHR8fCBjb25zdGFudEtleUNvZGUgPT09IEtleUNvZGUuQmFja3NsYXNoXG5cdFx0XHRcdHx8IGNvbnN0YW50S2V5Q29kZSA9PT0gS2V5Q29kZS5CcmFja2V0UmlnaHRcblx0XHRcdCk7XG5cblx0XHRcdGlmIChpc09FTUtleSkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY29uc3RhbnRLZXlDb2RlICE9PSBLZXlDb2RlLkRlcGVuZHNPbktiTGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gS2V5Q29kZVV0aWxzLnRvRWxlY3Ryb25BY2NlbGVyYXRvcihjb25zdGFudEtleUNvZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9SZXNvbHZlZEtleWJpbmRpbmcoY2hvcmRQYXJ0czogU2NhbkNvZGVDaG9yZFtdW10pOiBOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmdbXSB7XG5cdFx0aWYgKGNob3JkUGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogTmF0aXZlUmVzb2x2ZWRLZXliaW5kaW5nW10gPSBbXTtcblx0XHR0aGlzLl9nZW5lcmF0ZVJlc29sdmVkS2V5YmluZGluZ3MoY2hvcmRQYXJ0cywgMCwgW10sIHJlc3VsdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2dlbmVyYXRlUmVzb2x2ZWRLZXliaW5kaW5ncyhjaG9yZFBhcnRzOiBTY2FuQ29kZUNob3JkW11bXSwgY3VycmVudEluZGV4OiBudW1iZXIsIHByZXZpb3VzUGFydHM6IFNjYW5Db2RlQ2hvcmRbXSwgcmVzdWx0OiBOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmdbXSkge1xuXHRcdGNvbnN0IGNob3JkUGFydCA9IGNob3JkUGFydHNbY3VycmVudEluZGV4XTtcblx0XHRjb25zdCBpc0ZpbmFsSW5kZXggPSBjdXJyZW50SW5kZXggPT09IGNob3JkUGFydHMubGVuZ3RoIC0gMTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY2hvcmRQYXJ0Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBjaG9yZHMgPSBbLi4ucHJldmlvdXNQYXJ0cywgY2hvcmRQYXJ0W2ldXTtcblx0XHRcdGlmIChpc0ZpbmFsSW5kZXgpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2gobmV3IE5hdGl2ZVJlc29sdmVkS2V5YmluZGluZyh0aGlzLCB0aGlzLl9PUywgY2hvcmRzKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9nZW5lcmF0ZVJlc29sdmVkS2V5YmluZGluZ3MoY2hvcmRQYXJ0cywgY3VycmVudEluZGV4ICsgMSwgY2hvcmRzLCByZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlS2V5Ym9hcmRFdmVudChrZXlib2FyZEV2ZW50OiBJS2V5Ym9hcmRFdmVudCk6IE5hdGl2ZVJlc29sdmVkS2V5YmluZGluZyB7XG5cdFx0bGV0IGNvZGUgPSBTY2FuQ29kZVV0aWxzLnRvRW51bShrZXlib2FyZEV2ZW50LmNvZGUpO1xuXG5cdFx0Ly8gVHJlYXQgTnVtcGFkRW50ZXIgYXMgRW50ZXJcblx0XHRpZiAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkRW50ZXIpIHtcblx0XHRcdGNvZGUgPSBTY2FuQ29kZS5FbnRlcjtcblx0XHR9XG5cblx0XHRjb25zdCBrZXlDb2RlID0ga2V5Ym9hcmRFdmVudC5rZXlDb2RlO1xuXG5cdFx0aWYgKFxuXHRcdFx0KGtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93KVxuXHRcdFx0fHwgKGtleUNvZGUgPT09IEtleUNvZGUuVXBBcnJvdylcblx0XHRcdHx8IChrZXlDb2RlID09PSBLZXlDb2RlLlJpZ2h0QXJyb3cpXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cpXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5EZWxldGUpXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5JbnNlcnQpXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5Ib21lKVxuXHRcdFx0fHwgKGtleUNvZGUgPT09IEtleUNvZGUuRW5kKVxuXHRcdFx0fHwgKGtleUNvZGUgPT09IEtleUNvZGUuUGFnZURvd24pXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5QYWdlVXApXG5cdFx0XHR8fCAoa2V5Q29kZSA9PT0gS2V5Q29kZS5CYWNrc3BhY2UpXG5cdFx0KSB7XG5cdFx0XHQvLyBcIkRpc3BhdGNoXCIgb24ga2V5Q29kZSBmb3IgdGhlc2Uga2V5IGNvZGVzIHRvIHdvcmthcm91bmQgaXNzdWVzIHdpdGggcmVtb3RlIGRlc2t0b3Bpbmcgc29mdHdhcmVcblx0XHRcdC8vIHdoZXJlIHRoZSBzY2FuIGNvZGVzIGFwcGVhciB0byBiZSBpbmNvcnJlY3QgKHNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjQxMDcpXG5cdFx0XHRjb25zdCBpbW11dGFibGVTY2FuQ29kZSA9IElNTVVUQUJMRV9LRVlfQ09ERV9UT19DT0RFW2tleUNvZGVdO1xuXHRcdFx0aWYgKGltbXV0YWJsZVNjYW5Db2RlICE9PSBTY2FuQ29kZS5EZXBlbmRzT25LYkxheW91dCkge1xuXHRcdFx0XHRjb2RlID0gaW1tdXRhYmxlU2NhbkNvZGU7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2Uge1xuXG5cdFx0XHRpZiAoXG5cdFx0XHRcdChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWQxKVxuXHRcdFx0XHR8fCAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkMilcblx0XHRcdFx0fHwgKGNvZGUgPT09IFNjYW5Db2RlLk51bXBhZDMpXG5cdFx0XHRcdHx8IChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWQ0KVxuXHRcdFx0XHR8fCAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkNSlcblx0XHRcdFx0fHwgKGNvZGUgPT09IFNjYW5Db2RlLk51bXBhZDYpXG5cdFx0XHRcdHx8IChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWQ3KVxuXHRcdFx0XHR8fCAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkOClcblx0XHRcdFx0fHwgKGNvZGUgPT09IFNjYW5Db2RlLk51bXBhZDkpXG5cdFx0XHRcdHx8IChjb2RlID09PSBTY2FuQ29kZS5OdW1wYWQwKVxuXHRcdFx0XHR8fCAoY29kZSA9PT0gU2NhbkNvZGUuTnVtcGFkRGVjaW1hbClcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBcIkRpc3BhdGNoXCIgb24ga2V5Q29kZSBmb3IgYWxsIG51bXBhZCBrZXlzIGluIG9yZGVyIGZvciBOdW1Mb2NrIHRvIHdvcmsgY29ycmVjdGx5XG5cdFx0XHRcdGlmIChrZXlDb2RlID49IDApIHtcblx0XHRcdFx0XHRjb25zdCBpbW11dGFibGVTY2FuQ29kZSA9IElNTVVUQUJMRV9LRVlfQ09ERV9UT19DT0RFW2tleUNvZGVdO1xuXHRcdFx0XHRcdGlmIChpbW11dGFibGVTY2FuQ29kZSAhPT0gU2NhbkNvZGUuRGVwZW5kc09uS2JMYXlvdXQpIHtcblx0XHRcdFx0XHRcdGNvZGUgPSBpbW11dGFibGVTY2FuQ29kZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjdHJsS2V5ID0ga2V5Ym9hcmRFdmVudC5jdHJsS2V5IHx8ICh0aGlzLl9tYXBBbHRHclRvQ3RybEFsdCAmJiBrZXlib2FyZEV2ZW50LmFsdEdyYXBoS2V5KTtcblx0XHRjb25zdCBhbHRLZXkgPSBrZXlib2FyZEV2ZW50LmFsdEtleSB8fCAodGhpcy5fbWFwQWx0R3JUb0N0cmxBbHQgJiYga2V5Ym9hcmRFdmVudC5hbHRHcmFwaEtleSk7XG5cdFx0Y29uc3QgY2hvcmQgPSBuZXcgU2NhbkNvZGVDaG9yZChjdHJsS2V5LCBrZXlib2FyZEV2ZW50LnNoaWZ0S2V5LCBhbHRLZXksIGtleWJvYXJkRXZlbnQubWV0YUtleSwgY29kZSk7XG5cdFx0cmV0dXJuIG5ldyBOYXRpdmVSZXNvbHZlZEtleWJpbmRpbmcodGhpcywgdGhpcy5fT1MsIFtjaG9yZF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUNob3JkKGNob3JkOiBDaG9yZCB8IG51bGwpOiBTY2FuQ29kZUNob3JkW10ge1xuXHRcdGlmICghY2hvcmQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0aWYgKGNob3JkIGluc3RhbmNlb2YgU2NhbkNvZGVDaG9yZCkge1xuXHRcdFx0cmV0dXJuIFtjaG9yZF07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmtleUNvZGVDaG9yZFRvU2NhbkNvZGVDaG9yZChjaG9yZCk7XG5cdH1cblxuXHRwdWJsaWMgcmVzb2x2ZUtleWJpbmRpbmcoa2V5YmluZGluZzogS2V5YmluZGluZyk6IFJlc29sdmVkS2V5YmluZGluZ1tdIHtcblx0XHRjb25zdCBjaG9yZHM6IFNjYW5Db2RlQ2hvcmRbXVtdID0ga2V5YmluZGluZy5jaG9yZHMubWFwKGNob3JkID0+IHRoaXMuX3Jlc29sdmVDaG9yZChjaG9yZCkpO1xuXHRcdHJldHVybiB0aGlzLl90b1Jlc29sdmVkS2V5YmluZGluZyhjaG9yZHMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlZGlyZWN0Q2hhckNvZGUoY2hhckNvZGU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0c3dpdGNoIChjaGFyQ29kZSkge1xuXHRcdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0XHQvLyBDSks6IFx1MzAwMiBcdTMwMEMgXHUzMDBEIFx1MzAxMCBcdTMwMTEgXHVGRjFCIFx1RkYwQ1xuXHRcdFx0Ly8gbWFwOiAuIFsgXSBbIF0gOyAsXG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfSURFT0dSQVBISUNfRlVMTF9TVE9QOiByZXR1cm4gQ2hhckNvZGUuUGVyaW9kO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0xFRlRfQ09STkVSX0JSQUNLRVQ6IHJldHVybiBDaGFyQ29kZS5PcGVuU3F1YXJlQnJhY2tldDtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9SSUdIVF9DT1JORVJfQlJBQ0tFVDogcmV0dXJuIENoYXJDb2RlLkNsb3NlU3F1YXJlQnJhY2tldDtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9MRUZUX0JMQUNLX0xFTlRJQ1VMQVJfQlJBQ0tFVDogcmV0dXJuIENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0O1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX1JJR0hUX0JMQUNLX0xFTlRJQ1VMQVJfQlJBQ0tFVDogcmV0dXJuIENoYXJDb2RlLkNsb3NlU3F1YXJlQnJhY2tldDtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9GVUxMV0lEVEhfU0VNSUNPTE9OOiByZXR1cm4gQ2hhckNvZGUuU2VtaWNvbG9uO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0ZVTExXSURUSF9DT01NQTogcmV0dXJuIENoYXJDb2RlLkNvbW1hO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hhckNvZGU7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfY2hhckNvZGVUb0tiKGNoYXJDb2RlOiBudW1iZXIpOiB7IGtleUNvZGU6IEtleUNvZGU7IHNoaWZ0S2V5OiBib29sZWFuIH0gfCBudWxsIHtcblx0XHRjaGFyQ29kZSA9IHRoaXMuX3JlZGlyZWN0Q2hhckNvZGUoY2hhckNvZGUpO1xuXHRcdGlmIChjaGFyQ29kZSA8IENIQVJfQ09ERV9UT19LRVlfQ09ERS5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBDSEFSX0NPREVfVE9fS0VZX0NPREVbY2hhckNvZGVdO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBdHRlbXB0IHRvIG1hcCBhIGNvbWJpbmluZyBjaGFyYWN0ZXIgdG8gYSByZWd1bGFyIG9uZSB0aGF0IHJlbmRlcnMgdGhlIHNhbWUgd2F5LlxuXHQgKlxuXHQgKiBodHRwczovL3d3dy5jb21wYXJ0LmNvbS9lbi91bmljb2RlL2JpZGljbGFzcy9OU01cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgZ2V0Q2hhckNvZGUoY2hhcjogc3RyaW5nKTogbnVtYmVyIHtcblx0XHRpZiAoY2hhci5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRjb25zdCBjaGFyQ29kZSA9IGNoYXIuY2hhckNvZGVBdCgwKTtcblx0XHRzd2l0Y2ggKGNoYXJDb2RlKSB7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfQ29tYmluaW5nX0dyYXZlX0FjY2VudDogcmV0dXJuIENoYXJDb2RlLlVfR1JBVkVfQUNDRU5UO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0NvbWJpbmluZ19BY3V0ZV9BY2NlbnQ6IHJldHVybiBDaGFyQ29kZS5VX0FDVVRFX0FDQ0VOVDtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfQ2lyY3VtZmxleF9BY2NlbnQ6IHJldHVybiBDaGFyQ29kZS5VX0NJUkNVTUZMRVg7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfQ29tYmluaW5nX1RpbGRlOiByZXR1cm4gQ2hhckNvZGUuVV9TTUFMTF9USUxERTtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfTWFjcm9uOiByZXR1cm4gQ2hhckNvZGUuVV9NQUNST047XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfQ29tYmluaW5nX092ZXJsaW5lOiByZXR1cm4gQ2hhckNvZGUuVV9PVkVSTElORTtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfQnJldmU6IHJldHVybiBDaGFyQ29kZS5VX0JSRVZFO1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5VX0NvbWJpbmluZ19Eb3RfQWJvdmU6IHJldHVybiBDaGFyQ29kZS5VX0RPVF9BQk9WRTtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVV9Db21iaW5pbmdfRGlhZXJlc2lzOiByZXR1cm4gQ2hhckNvZGUuVV9ESUFFUkVTSVM7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfQ29tYmluaW5nX1JpbmdfQWJvdmU6IHJldHVybiBDaGFyQ29kZS5VX1JJTkdfQUJPVkU7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlVfQ29tYmluaW5nX0RvdWJsZV9BY3V0ZV9BY2NlbnQ6IHJldHVybiBDaGFyQ29kZS5VX0RPVUJMRV9BQ1VURV9BQ0NFTlQ7XG5cdFx0fVxuXHRcdHJldHVybiBjaGFyQ29kZTtcblx0fVxufVxuXG4oZnVuY3Rpb24gKCkge1xuXHRmdW5jdGlvbiBkZWZpbmUoY2hhckNvZGU6IG51bWJlciwga2V5Q29kZTogS2V5Q29kZSwgc2hpZnRLZXk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gQ0hBUl9DT0RFX1RPX0tFWV9DT0RFLmxlbmd0aDsgaSA8IGNoYXJDb2RlOyBpKyspIHtcblx0XHRcdENIQVJfQ09ERV9UT19LRVlfQ09ERVtpXSA9IG51bGw7XG5cdFx0fVxuXHRcdENIQVJfQ09ERV9UT19LRVlfQ09ERVtjaGFyQ29kZV0gPSB7IGtleUNvZGU6IGtleUNvZGUsIHNoaWZ0S2V5OiBzaGlmdEtleSB9O1xuXHR9XG5cblx0Zm9yIChsZXQgY2hDb2RlID0gQ2hhckNvZGUuQTsgY2hDb2RlIDw9IENoYXJDb2RlLlo7IGNoQ29kZSsrKSB7XG5cdFx0ZGVmaW5lKGNoQ29kZSwgS2V5Q29kZS5LZXlBICsgKGNoQ29kZSAtIENoYXJDb2RlLkEpLCB0cnVlKTtcblx0fVxuXG5cdGZvciAobGV0IGNoQ29kZSA9IENoYXJDb2RlLmE7IGNoQ29kZSA8PSBDaGFyQ29kZS56OyBjaENvZGUrKykge1xuXHRcdGRlZmluZShjaENvZGUsIEtleUNvZGUuS2V5QSArIChjaENvZGUgLSBDaGFyQ29kZS5hKSwgZmFsc2UpO1xuXHR9XG5cblx0ZGVmaW5lKENoYXJDb2RlLlNlbWljb2xvbiwgS2V5Q29kZS5TZW1pY29sb24sIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLkNvbG9uLCBLZXlDb2RlLlNlbWljb2xvbiwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLkVxdWFscywgS2V5Q29kZS5FcXVhbCwgZmFsc2UpO1xuXHRkZWZpbmUoQ2hhckNvZGUuUGx1cywgS2V5Q29kZS5FcXVhbCwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLkNvbW1hLCBLZXlDb2RlLkNvbW1hLCBmYWxzZSk7XG5cdGRlZmluZShDaGFyQ29kZS5MZXNzVGhhbiwgS2V5Q29kZS5Db21tYSwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLkRhc2gsIEtleUNvZGUuTWludXMsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLlVuZGVybGluZSwgS2V5Q29kZS5NaW51cywgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLlBlcmlvZCwgS2V5Q29kZS5QZXJpb2QsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLkdyZWF0ZXJUaGFuLCBLZXlDb2RlLlBlcmlvZCwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLlNsYXNoLCBLZXlDb2RlLlNsYXNoLCBmYWxzZSk7XG5cdGRlZmluZShDaGFyQ29kZS5RdWVzdGlvbk1hcmssIEtleUNvZGUuU2xhc2gsIHRydWUpO1xuXG5cdGRlZmluZShDaGFyQ29kZS5CYWNrVGljaywgS2V5Q29kZS5CYWNrcXVvdGUsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLlRpbGRlLCBLZXlDb2RlLkJhY2txdW90ZSwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLk9wZW5TcXVhcmVCcmFja2V0LCBLZXlDb2RlLkJyYWNrZXRMZWZ0LCBmYWxzZSk7XG5cdGRlZmluZShDaGFyQ29kZS5PcGVuQ3VybHlCcmFjZSwgS2V5Q29kZS5CcmFja2V0TGVmdCwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLkJhY2tzbGFzaCwgS2V5Q29kZS5CYWNrc2xhc2gsIGZhbHNlKTtcblx0ZGVmaW5lKENoYXJDb2RlLlBpcGUsIEtleUNvZGUuQmFja3NsYXNoLCB0cnVlKTtcblxuXHRkZWZpbmUoQ2hhckNvZGUuQ2xvc2VTcXVhcmVCcmFja2V0LCBLZXlDb2RlLkJyYWNrZXRSaWdodCwgZmFsc2UpO1xuXHRkZWZpbmUoQ2hhckNvZGUuQ2xvc2VDdXJseUJyYWNlLCBLZXlDb2RlLkJyYWNrZXRSaWdodCwgdHJ1ZSk7XG5cblx0ZGVmaW5lKENoYXJDb2RlLlNpbmdsZVF1b3RlLCBLZXlDb2RlLlF1b3RlLCBmYWxzZSk7XG5cdGRlZmluZShDaGFyQ29kZS5Eb3VibGVRdW90ZSwgS2V5Q29kZS5RdW90ZSwgdHJ1ZSk7XG59KSgpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxTQUFTLGNBQWMsNEJBQTRCLDRCQUE0QixVQUFVLGVBQWUscUJBQXFCO0FBQ3RJLFNBQTZCLGNBQW1DLHFCQUF3QztBQUN4RyxTQUFTLHVCQUF1QjtBQUdoQyxTQUFTLDhCQUE4QjtBQVN2QyxNQUFNLHdCQUE0RSxDQUFDO0FBRTVFLE1BQU0saUNBQWlDLHVCQUFzQztBQUFBLEVBSW5GLFlBQVksUUFBZ0MsSUFBcUIsUUFBeUI7QUFDekYsVUFBTSxJQUFJLE1BQU07QUFDaEIsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUVVLFVBQVUsT0FBcUM7QUFDeEQsV0FBTyxLQUFLLFFBQVEsMkJBQTJCLEtBQUs7QUFBQSxFQUNyRDtBQUFBLEVBRVUsY0FBYyxPQUFxQztBQUM1RCxXQUFPLEtBQUssUUFBUSw2QkFBNkIsS0FBSztBQUFBLEVBQ3ZEO0FBQUEsRUFFVSx3QkFBd0IsT0FBcUM7QUFDdEUsV0FBTyxLQUFLLFFBQVEsNENBQTRDLEtBQUs7QUFBQSxFQUN0RTtBQUFBLEVBRVUsc0JBQXNCLE9BQXFDO0FBQ3BFLFdBQU8sS0FBSyxRQUFRLHFDQUFxQyxLQUFLO0FBQUEsRUFDL0Q7QUFBQSxFQUVVLFdBQVcsU0FBd0M7QUFDNUQsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksMkJBQTJCLFFBQVEsUUFBUSxNQUFNLFFBQVEsbUJBQW1CO0FBQy9FLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxJQUFJLEtBQUssUUFBUSw2QkFBNkIsT0FBTztBQUMzRCxVQUFNLElBQUksS0FBSyxRQUFRLHFDQUFxQyxPQUFPO0FBRW5FLFFBQUksQ0FB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QUFJLFlBQVk7QUFFZiwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQ3RELDJCQUFtQixHQUFHLEdBQUcsR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLE9BQU87QUFDdEQsMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUN0RCwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQUEsTUFDdkQsT0FBTztBQUVOLDJCQUFtQixHQUFHLEdBQUcsR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLE9BQU87QUFDdEQsMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUN0RCwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQ3RELDJCQUFtQixHQUFHLEdBQUcsR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLE9BQU87QUFDdEQsMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUN0RCwyQkFBbUIsR0FBRyxHQUFHLEdBQUcsVUFBVSxHQUFHLEdBQUcsR0FBRyxPQUFPO0FBQ3RELDJCQUFtQixHQUFHLEdBQUcsR0FBRyxVQUFVLEdBQUcsR0FBRyxHQUFHLE9BQU87QUFDdEQsMkJBQW1CLEdBQUcsR0FBRyxHQUFHLFVBQVUsR0FBRyxHQUFHLEdBQUcsT0FBTztBQUFBLE1BQ3ZEO0FBQUEsSUFDRDtBQUVBLHVCQUFtQixHQUFHLEdBQUcsR0FBRyxTQUFTLFFBQVEsUUFBUSxNQUFNO0FBQzNELHVCQUFtQixHQUFHLEdBQUcsR0FBRyxTQUFTLFFBQVEsUUFBUSxNQUFNO0FBQzNELHVCQUFtQixHQUFHLEdBQUcsR0FBRyxTQUFTLFFBQVEsUUFBUSxNQUFNO0FBQzNELHVCQUFtQixHQUFHLEdBQUcsR0FBRyxTQUFTLFFBQVEsUUFBUSxNQUFNO0FBQzNELHVCQUFtQixHQUFHLEdBQUcsR0FBRyxT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
