import * as arrays from "../../../base/common/arrays.js";
import * as objects from "../../../base/common/objects.js";
import * as platform from "../../../base/common/platform.js";
import { ScrollbarVisibility } from "../../../base/common/scrollable.js";
import { Constants } from "../../../base/common/uint.js";
import { EDITOR_FONT_DEFAULTS, FONT_VARIATION_OFF, FONT_VARIATION_TRANSLATE, FontInfo } from "./fontInfo.js";
import { EDITOR_MODEL_DEFAULTS } from "../core/misc/textModelDefaults.js";
import { USUAL_WORD_SEPARATORS } from "../core/wordHelper.js";
import * as nls from "../../../nls.js";
import { AccessibilitySupport } from "../../../platform/accessibility/common/accessibility.js";
var EditorAutoIndentStrategy = /* @__PURE__ */ ((EditorAutoIndentStrategy2) => {
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["None"] = 0] = "None";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Keep"] = 1] = "Keep";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Brackets"] = 2] = "Brackets";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Advanced"] = 3] = "Advanced";
  EditorAutoIndentStrategy2[EditorAutoIndentStrategy2["Full"] = 4] = "Full";
  return EditorAutoIndentStrategy2;
})(EditorAutoIndentStrategy || {});
const MINIMAP_GUTTER_WIDTH = 8;
class ConfigurationChangedEvent {
  /**
   * @internal
   */
  constructor(values) {
    this._values = values;
  }
  hasChanged(id) {
    return this._values[id];
  }
}
class ComputeOptionsMemory {
  constructor() {
    this.stableMinimapLayoutInput = null;
    this.stableFitMaxMinimapScale = 0;
    this.stableFitRemainingWidth = 0;
  }
}
class BaseEditorOption {
  constructor(id, name, defaultValue, schema) {
    this.id = id;
    this.name = name;
    this.defaultValue = defaultValue;
    this.schema = schema;
  }
  applyUpdate(value, update) {
    return applyUpdate(value, update);
  }
  compute(env, options, value) {
    return value;
  }
}
class ApplyUpdateResult {
  constructor(newValue, didChange) {
    this.newValue = newValue;
    this.didChange = didChange;
  }
}
function applyUpdate(value, update) {
  if (typeof value !== "object" || typeof update !== "object" || !value || !update) {
    return new ApplyUpdateResult(update, value !== update);
  }
  if (Array.isArray(value) || Array.isArray(update)) {
    const arrayEquals = Array.isArray(value) && Array.isArray(update) && arrays.equals(value, update);
    return new ApplyUpdateResult(update, !arrayEquals);
  }
  let didChange = false;
  for (const key in update) {
    if (update.hasOwnProperty(key)) {
      const result = applyUpdate(value[key], update[key]);
      if (result.didChange) {
        value[key] = result.newValue;
        didChange = true;
      }
    }
  }
  return new ApplyUpdateResult(value, didChange);
}
class ComputedEditorOption {
  constructor(id, defaultValue) {
    this.schema = void 0;
    this.id = id;
    this.name = "_never_";
    this.defaultValue = defaultValue;
  }
  applyUpdate(value, update) {
    return applyUpdate(value, update);
  }
  validate(input) {
    return this.defaultValue;
  }
}
class SimpleEditorOption {
  constructor(id, name, defaultValue, schema) {
    this.id = id;
    this.name = name;
    this.defaultValue = defaultValue;
    this.schema = schema;
  }
  applyUpdate(value, update) {
    return applyUpdate(value, update);
  }
  compute(env, options, value) {
    return value;
  }
}
function boolean(value, defaultValue) {
  if (typeof value === "undefined") {
    return defaultValue;
  }
  if (value === "false") {
    return false;
  }
  return Boolean(value);
}
class EditorBooleanOption extends SimpleEditorOption {
  constructor(id, name, defaultValue, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "boolean";
      schema.default = defaultValue;
    }
    super(id, name, defaultValue, schema);
  }
  validate(input) {
    return boolean(input, this.defaultValue);
  }
}
function clampedInt(value, defaultValue, minimum, maximum) {
  if (typeof value === "string") {
    value = parseInt(value, 10);
  }
  if (typeof value !== "number" || isNaN(value)) {
    return defaultValue;
  }
  let r = value;
  r = Math.max(minimum, r);
  r = Math.min(maximum, r);
  return r | 0;
}
class EditorIntOption extends SimpleEditorOption {
  static clampedInt(value, defaultValue, minimum, maximum) {
    return clampedInt(value, defaultValue, minimum, maximum);
  }
  constructor(id, name, defaultValue, minimum, maximum, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "integer";
      schema.default = defaultValue;
      schema.minimum = minimum;
      schema.maximum = maximum;
    }
    super(id, name, defaultValue, schema);
    this.minimum = minimum;
    this.maximum = maximum;
  }
  validate(input) {
    return EditorIntOption.clampedInt(input, this.defaultValue, this.minimum, this.maximum);
  }
}
function clampedFloat(value, defaultValue, minimum, maximum) {
  if (typeof value === "undefined") {
    return defaultValue;
  }
  const r = EditorFloatOption.float(value, defaultValue);
  return EditorFloatOption.clamp(r, minimum, maximum);
}
class EditorFloatOption extends SimpleEditorOption {
  static clamp(n, min, max) {
    if (n < min) {
      return min;
    }
    if (n > max) {
      return max;
    }
    return n;
  }
  static float(value, defaultValue) {
    if (typeof value === "string") {
      value = parseFloat(value);
    }
    if (typeof value !== "number" || isNaN(value)) {
      return defaultValue;
    }
    return value;
  }
  constructor(id, name, defaultValue, validationFn, schema, minimum, maximum) {
    if (typeof schema !== "undefined") {
      schema.type = "number";
      schema.default = defaultValue;
      schema.minimum = minimum;
      schema.maximum = maximum;
    }
    super(id, name, defaultValue, schema);
    this.validationFn = validationFn;
    this.minimum = minimum;
    this.maximum = maximum;
  }
  validate(input) {
    return this.validationFn(EditorFloatOption.float(input, this.defaultValue));
  }
}
class EditorStringOption extends SimpleEditorOption {
  static string(value, defaultValue) {
    if (typeof value !== "string") {
      return defaultValue;
    }
    return value;
  }
  constructor(id, name, defaultValue, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "string";
      schema.default = defaultValue;
    }
    super(id, name, defaultValue, schema);
  }
  validate(input) {
    return EditorStringOption.string(input, this.defaultValue);
  }
}
function stringSet(value, defaultValue, allowedValues, renamedValues) {
  if (typeof value !== "string") {
    return defaultValue;
  }
  if (renamedValues && value in renamedValues) {
    return renamedValues[value];
  }
  if (allowedValues.indexOf(value) === -1) {
    return defaultValue;
  }
  return value;
}
class EditorStringEnumOption extends SimpleEditorOption {
  constructor(id, name, defaultValue, allowedValues, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "string";
      schema.enum = allowedValues.slice(0);
      schema.default = defaultValue;
    }
    super(id, name, defaultValue, schema);
    this._allowedValues = allowedValues;
  }
  validate(input) {
    return stringSet(input, this.defaultValue, this._allowedValues);
  }
}
class EditorEnumOption extends BaseEditorOption {
  constructor(id, name, defaultValue, defaultStringValue, allowedValues, convert, schema = void 0) {
    if (typeof schema !== "undefined") {
      schema.type = "string";
      schema.enum = allowedValues;
      schema.default = defaultStringValue;
    }
    super(id, name, defaultValue, schema);
    this._allowedValues = allowedValues;
    this._convert = convert;
  }
  validate(input) {
    if (typeof input !== "string") {
      return this.defaultValue;
    }
    if (this._allowedValues.indexOf(input) === -1) {
      return this.defaultValue;
    }
    return this._convert(input);
  }
}
function _autoIndentFromString(autoIndent) {
  switch (autoIndent) {
    case "none":
      return 0 /* None */;
    case "keep":
      return 1 /* Keep */;
    case "brackets":
      return 2 /* Brackets */;
    case "advanced":
      return 3 /* Advanced */;
    case "full":
      return 4 /* Full */;
  }
}
class EditorAccessibilitySupport extends BaseEditorOption {
  constructor() {
    super(
      2 /* accessibilitySupport */,
      "accessibilitySupport",
      AccessibilitySupport.Unknown,
      {
        type: "string",
        enum: ["auto", "on", "off"],
        enumDescriptions: [
          nls.localize("accessibilitySupport.auto", "Use platform APIs to detect when a Screen Reader is attached."),
          nls.localize("accessibilitySupport.on", "Optimize for usage with a Screen Reader."),
          nls.localize("accessibilitySupport.off", "Assume a screen reader is not attached.")
        ],
        default: "auto",
        tags: ["accessibility"],
        description: nls.localize("accessibilitySupport", "Controls if the UI should run in a mode where it is optimized for screen readers.")
      }
    );
  }
  validate(input) {
    switch (input) {
      case "auto":
        return AccessibilitySupport.Unknown;
      case "off":
        return AccessibilitySupport.Disabled;
      case "on":
        return AccessibilitySupport.Enabled;
    }
    return this.defaultValue;
  }
  compute(env, options, value) {
    if (value === AccessibilitySupport.Unknown) {
      return env.accessibilitySupport;
    }
    return value;
  }
}
class EditorComments extends BaseEditorOption {
  constructor() {
    const defaults = {
      insertSpace: true,
      ignoreEmptyLines: true
    };
    super(
      29 /* comments */,
      "comments",
      defaults,
      {
        "editor.comments.insertSpace": {
          type: "boolean",
          default: defaults.insertSpace,
          description: nls.localize("comments.insertSpace", "Controls whether a space character is inserted when commenting.")
        },
        "editor.comments.ignoreEmptyLines": {
          type: "boolean",
          default: defaults.ignoreEmptyLines,
          description: nls.localize("comments.ignoreEmptyLines", "Controls if empty lines should be ignored with toggle, add or remove actions for line comments.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      insertSpace: boolean(input.insertSpace, this.defaultValue.insertSpace),
      ignoreEmptyLines: boolean(input.ignoreEmptyLines, this.defaultValue.ignoreEmptyLines)
    };
  }
}
var TextEditorCursorBlinkingStyle = /* @__PURE__ */ ((TextEditorCursorBlinkingStyle2) => {
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Hidden"] = 0] = "Hidden";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Blink"] = 1] = "Blink";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Smooth"] = 2] = "Smooth";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Phase"] = 3] = "Phase";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Expand"] = 4] = "Expand";
  TextEditorCursorBlinkingStyle2[TextEditorCursorBlinkingStyle2["Solid"] = 5] = "Solid";
  return TextEditorCursorBlinkingStyle2;
})(TextEditorCursorBlinkingStyle || {});
function cursorBlinkingStyleFromString(cursorBlinkingStyle) {
  switch (cursorBlinkingStyle) {
    case "blink":
      return 1 /* Blink */;
    case "smooth":
      return 2 /* Smooth */;
    case "phase":
      return 3 /* Phase */;
    case "expand":
      return 4 /* Expand */;
    case "solid":
      return 5 /* Solid */;
  }
}
var TextEditorCursorStyle = /* @__PURE__ */ ((TextEditorCursorStyle2) => {
  TextEditorCursorStyle2[TextEditorCursorStyle2["Line"] = 1] = "Line";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Block"] = 2] = "Block";
  TextEditorCursorStyle2[TextEditorCursorStyle2["Underline"] = 3] = "Underline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["LineThin"] = 4] = "LineThin";
  TextEditorCursorStyle2[TextEditorCursorStyle2["BlockOutline"] = 5] = "BlockOutline";
  TextEditorCursorStyle2[TextEditorCursorStyle2["UnderlineThin"] = 6] = "UnderlineThin";
  return TextEditorCursorStyle2;
})(TextEditorCursorStyle || {});
function cursorStyleToString(cursorStyle) {
  switch (cursorStyle) {
    case 1 /* Line */:
      return "line";
    case 2 /* Block */:
      return "block";
    case 3 /* Underline */:
      return "underline";
    case 4 /* LineThin */:
      return "line-thin";
    case 5 /* BlockOutline */:
      return "block-outline";
    case 6 /* UnderlineThin */:
      return "underline-thin";
  }
}
function cursorStyleFromString(cursorStyle) {
  switch (cursorStyle) {
    case "line":
      return 1 /* Line */;
    case "block":
      return 2 /* Block */;
    case "underline":
      return 3 /* Underline */;
    case "line-thin":
      return 4 /* LineThin */;
    case "block-outline":
      return 5 /* BlockOutline */;
    case "underline-thin":
      return 6 /* UnderlineThin */;
  }
}
class EditorClassName extends ComputedEditorOption {
  constructor() {
    super(162 /* editorClassName */, "");
  }
  compute(env, options, _) {
    const classNames = ["monaco-editor"];
    if (options.get(48 /* extraEditorClassName */)) {
      classNames.push(options.get(48 /* extraEditorClassName */));
    }
    if (env.extraEditorClassName) {
      classNames.push(env.extraEditorClassName);
    }
    if (options.get(82 /* mouseStyle */) === "default") {
      classNames.push("mouse-default");
    } else if (options.get(82 /* mouseStyle */) === "copy") {
      classNames.push("mouse-copy");
    }
    if (options.get(127 /* showUnused */)) {
      classNames.push("showUnused");
    }
    if (options.get(157 /* showDeprecated */)) {
      classNames.push("showDeprecated");
    }
    return classNames.join(" ");
  }
}
class EditorEmptySelectionClipboard extends EditorBooleanOption {
  constructor() {
    super(
      45 /* emptySelectionClipboard */,
      "emptySelectionClipboard",
      true,
      { description: nls.localize("emptySelectionClipboard", "Controls whether copying without a selection copies the current line.") }
    );
  }
  compute(env, options, value) {
    return value && env.emptySelectionClipboard;
  }
}
class EditorFind extends BaseEditorOption {
  constructor() {
    const defaults = {
      cursorMoveOnType: true,
      findOnType: true,
      seedSearchStringFromSelection: "always",
      autoFindInSelection: "never",
      globalFindClipboard: false,
      addExtraSpaceOnTop: true,
      loop: true,
      closeOnResult: false,
      history: "workspace",
      replaceHistory: "workspace"
    };
    super(
      50 /* find */,
      "find",
      defaults,
      {
        "editor.find.cursorMoveOnType": {
          type: "boolean",
          default: defaults.cursorMoveOnType,
          description: nls.localize("find.cursorMoveOnType", "Controls whether the cursor should jump to find matches while typing.")
        },
        "editor.find.seedSearchStringFromSelection": {
          type: "string",
          enum: ["never", "always", "selection"],
          default: defaults.seedSearchStringFromSelection,
          enumDescriptions: [
            nls.localize("editor.find.seedSearchStringFromSelection.never", "Never seed search string from the editor selection."),
            nls.localize("editor.find.seedSearchStringFromSelection.always", "Always seed search string from the editor selection, including word at cursor position."),
            nls.localize("editor.find.seedSearchStringFromSelection.selection", "Only seed search string from the editor selection.")
          ],
          description: nls.localize("find.seedSearchStringFromSelection", "Controls whether the search string in the Find Widget is seeded from the editor selection.")
        },
        "editor.find.autoFindInSelection": {
          type: "string",
          enum: ["never", "always", "multiline"],
          default: defaults.autoFindInSelection,
          enumDescriptions: [
            nls.localize("editor.find.autoFindInSelection.never", "Never turn on Find in Selection automatically (default)."),
            nls.localize("editor.find.autoFindInSelection.always", "Always turn on Find in Selection automatically."),
            nls.localize("editor.find.autoFindInSelection.multiline", "Turn on Find in Selection automatically when multiple lines of content are selected.")
          ],
          description: nls.localize("find.autoFindInSelection", "Controls the condition for turning on Find in Selection automatically.")
        },
        "editor.find.globalFindClipboard": {
          type: "boolean",
          default: defaults.globalFindClipboard,
          description: nls.localize("find.globalFindClipboard", "Controls whether the Find Widget should read or modify the shared find clipboard on macOS."),
          included: platform.isMacintosh
        },
        "editor.find.addExtraSpaceOnTop": {
          type: "boolean",
          default: defaults.addExtraSpaceOnTop,
          description: nls.localize("find.addExtraSpaceOnTop", "Controls whether the Find Widget should add extra lines on top of the editor. When true, you can scroll beyond the first line when the Find Widget is visible.")
        },
        "editor.find.loop": {
          type: "boolean",
          default: defaults.loop,
          description: nls.localize("find.loop", "Controls whether the search automatically restarts from the beginning (or the end) when no further matches can be found.")
        },
        "editor.find.closeOnResult": {
          type: "boolean",
          default: defaults.closeOnResult,
          description: nls.localize("find.closeOnResult", "Controls whether the Find Widget closes after an explicit find navigation command lands on a result.")
        },
        "editor.find.history": {
          type: "string",
          enum: ["never", "workspace"],
          default: "workspace",
          enumDescriptions: [
            nls.localize("editor.find.history.never", "Do not store search history from the find widget."),
            nls.localize("editor.find.history.workspace", "Store search history across the active workspace")
          ],
          description: nls.localize("find.history", "Controls how the find widget history should be stored")
        },
        "editor.find.replaceHistory": {
          type: "string",
          enum: ["never", "workspace"],
          default: "workspace",
          enumDescriptions: [
            nls.localize("editor.find.replaceHistory.never", "Do not store history from the replace widget."),
            nls.localize("editor.find.replaceHistory.workspace", "Store replace history across the active workspace")
          ],
          description: nls.localize("find.replaceHistory", "Controls how the replace widget history should be stored")
        },
        "editor.find.findOnType": {
          type: "boolean",
          default: defaults.findOnType,
          description: nls.localize("find.findOnType", "Controls whether the Find Widget should search as you type.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      cursorMoveOnType: boolean(input.cursorMoveOnType, this.defaultValue.cursorMoveOnType),
      findOnType: boolean(input.findOnType, this.defaultValue.findOnType),
      seedSearchStringFromSelection: typeof input.seedSearchStringFromSelection === "boolean" ? input.seedSearchStringFromSelection ? "always" : "never" : stringSet(input.seedSearchStringFromSelection, this.defaultValue.seedSearchStringFromSelection, ["never", "always", "selection"]),
      autoFindInSelection: typeof input.autoFindInSelection === "boolean" ? input.autoFindInSelection ? "always" : "never" : stringSet(input.autoFindInSelection, this.defaultValue.autoFindInSelection, ["never", "always", "multiline"]),
      globalFindClipboard: boolean(input.globalFindClipboard, this.defaultValue.globalFindClipboard),
      addExtraSpaceOnTop: boolean(input.addExtraSpaceOnTop, this.defaultValue.addExtraSpaceOnTop),
      loop: boolean(input.loop, this.defaultValue.loop),
      closeOnResult: boolean(input.closeOnResult, this.defaultValue.closeOnResult),
      history: stringSet(input.history, this.defaultValue.history, ["never", "workspace"]),
      replaceHistory: stringSet(input.replaceHistory, this.defaultValue.replaceHistory, ["never", "workspace"])
    };
  }
}
const _EditorFontLigatures = class _EditorFontLigatures extends BaseEditorOption {
  constructor() {
    super(
      60 /* fontLigatures */,
      "fontLigatures",
      _EditorFontLigatures.OFF,
      {
        anyOf: [
          {
            type: "boolean",
            description: nls.localize("fontLigatures", "Enables/Disables font ligatures ('calt' and 'liga' font features). Change this to a string for fine-grained control of the 'font-feature-settings' CSS property.")
          },
          {
            type: "string",
            description: nls.localize("fontFeatureSettings", "Explicit 'font-feature-settings' CSS property. A boolean can be passed instead if one only needs to turn on/off ligatures.")
          }
        ],
        description: nls.localize("fontLigaturesGeneral", "Configures font ligatures or font features. Can be either a boolean to enable/disable ligatures or a string for the value of the CSS 'font-feature-settings' property."),
        default: false
      }
    );
  }
  validate(input) {
    if (typeof input === "undefined") {
      return this.defaultValue;
    }
    if (typeof input === "string") {
      if (input === "false" || input.length === 0) {
        return _EditorFontLigatures.OFF;
      }
      if (input === "true") {
        return _EditorFontLigatures.ON;
      }
      return input;
    }
    if (Boolean(input)) {
      return _EditorFontLigatures.ON;
    }
    return _EditorFontLigatures.OFF;
  }
};
_EditorFontLigatures.OFF = '"liga" off, "calt" off';
_EditorFontLigatures.ON = '"liga" on, "calt" on';
let EditorFontLigatures = _EditorFontLigatures;
const _EditorFontVariations = class _EditorFontVariations extends BaseEditorOption {
  constructor() {
    super(
      63 /* fontVariations */,
      "fontVariations",
      _EditorFontVariations.OFF,
      {
        anyOf: [
          {
            type: "boolean",
            description: nls.localize("fontVariations", "Enables/Disables the translation from font-weight to font-variation-settings. Change this to a string for fine-grained control of the 'font-variation-settings' CSS property.")
          },
          {
            type: "string",
            description: nls.localize("fontVariationSettings", "Explicit 'font-variation-settings' CSS property. A boolean can be passed instead if one only needs to translate font-weight to font-variation-settings.")
          }
        ],
        description: nls.localize("fontVariationsGeneral", "Configures font variations. Can be either a boolean to enable/disable the translation from font-weight to font-variation-settings or a string for the value of the CSS 'font-variation-settings' property."),
        default: false
      }
    );
  }
  validate(input) {
    if (typeof input === "undefined") {
      return this.defaultValue;
    }
    if (typeof input === "string") {
      if (input === "false") {
        return _EditorFontVariations.OFF;
      }
      if (input === "true") {
        return _EditorFontVariations.TRANSLATE;
      }
      return input;
    }
    if (Boolean(input)) {
      return _EditorFontVariations.TRANSLATE;
    }
    return _EditorFontVariations.OFF;
  }
  compute(env, options, value) {
    return env.fontInfo.fontVariationSettings;
  }
};
// Text is laid out using default settings.
_EditorFontVariations.OFF = FONT_VARIATION_OFF;
// Translate `fontWeight` config to the `font-variation-settings` CSS property.
_EditorFontVariations.TRANSLATE = FONT_VARIATION_TRANSLATE;
let EditorFontVariations = _EditorFontVariations;
class EditorFontInfo extends ComputedEditorOption {
  constructor() {
    super(59 /* fontInfo */, new FontInfo({
      pixelRatio: 0,
      fontFamily: "",
      fontWeight: "",
      fontSize: 0,
      fontFeatureSettings: "",
      fontVariationSettings: "",
      lineHeight: 0,
      letterSpacing: 0,
      isMonospace: false,
      typicalHalfwidthCharacterWidth: 0,
      typicalFullwidthCharacterWidth: 0,
      canUseHalfwidthRightwardsArrow: false,
      spaceWidth: 0,
      middotWidth: 0,
      wsmiddotWidth: 0,
      maxDigitWidth: 0
    }, false));
  }
  compute(env, options, _) {
    return env.fontInfo;
  }
}
class EffectiveCursorStyle extends ComputedEditorOption {
  constructor() {
    super(161 /* effectiveCursorStyle */, 1 /* Line */);
  }
  compute(env, options, _) {
    return env.inputMode === "overtype" ? options.get(92 /* overtypeCursorStyle */) : options.get(34 /* cursorStyle */);
  }
}
class EffectiveEditContextEnabled extends ComputedEditorOption {
  constructor() {
    super(170 /* effectiveEditContext */, false);
  }
  compute(env, options) {
    return env.editContextSupported && options.get(44 /* editContext */);
  }
}
class EffectiveAllowVariableFonts extends ComputedEditorOption {
  constructor() {
    super(172 /* effectiveAllowVariableFonts */, false);
  }
  compute(env, options) {
    const accessibilitySupport = env.accessibilitySupport;
    if (accessibilitySupport === AccessibilitySupport.Enabled) {
      return options.get(7 /* allowVariableFontsInAccessibilityMode */);
    } else {
      return options.get(6 /* allowVariableFonts */);
    }
  }
}
class EditorFontSize extends SimpleEditorOption {
  constructor() {
    super(
      61 /* fontSize */,
      "fontSize",
      EDITOR_FONT_DEFAULTS.fontSize,
      {
        type: "number",
        minimum: 6,
        maximum: 100,
        default: EDITOR_FONT_DEFAULTS.fontSize,
        description: nls.localize("fontSize", "Controls the font size in pixels.")
      }
    );
  }
  validate(input) {
    const r = EditorFloatOption.float(input, this.defaultValue);
    if (r === 0) {
      return EDITOR_FONT_DEFAULTS.fontSize;
    }
    return EditorFloatOption.clamp(r, 6, 100);
  }
  compute(env, options, value) {
    return env.fontInfo.fontSize;
  }
}
const _EditorFontWeight = class _EditorFontWeight extends BaseEditorOption {
  constructor() {
    super(
      62 /* fontWeight */,
      "fontWeight",
      EDITOR_FONT_DEFAULTS.fontWeight,
      {
        anyOf: [
          {
            type: "number",
            minimum: _EditorFontWeight.MINIMUM_VALUE,
            maximum: _EditorFontWeight.MAXIMUM_VALUE,
            errorMessage: nls.localize("fontWeightErrorMessage", 'Only "normal" and "bold" keywords or numbers between 1 and 1000 are allowed.')
          },
          {
            type: "string",
            pattern: "^(normal|bold|1000|[1-9][0-9]{0,2})$"
          },
          {
            enum: _EditorFontWeight.SUGGESTION_VALUES
          }
        ],
        default: EDITOR_FONT_DEFAULTS.fontWeight,
        description: nls.localize("fontWeight", 'Controls the font weight. Accepts "normal" and "bold" keywords or numbers between 1 and 1000.')
      }
    );
  }
  validate(input) {
    if (input === "normal" || input === "bold") {
      return input;
    }
    return String(EditorIntOption.clampedInt(input, EDITOR_FONT_DEFAULTS.fontWeight, _EditorFontWeight.MINIMUM_VALUE, _EditorFontWeight.MAXIMUM_VALUE));
  }
};
_EditorFontWeight.SUGGESTION_VALUES = ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
_EditorFontWeight.MINIMUM_VALUE = 1;
_EditorFontWeight.MAXIMUM_VALUE = 1e3;
let EditorFontWeight = _EditorFontWeight;
class EditorGoToLocation extends BaseEditorOption {
  constructor() {
    const defaults = {
      multiple: "peek",
      multipleDefinitions: "peek",
      multipleTypeDefinitions: "peek",
      multipleDeclarations: "peek",
      multipleImplementations: "peek",
      multipleReferences: "peek",
      multipleTests: "peek",
      alternativeDefinitionCommand: "editor.action.goToReferences",
      alternativeTypeDefinitionCommand: "editor.action.goToReferences",
      alternativeDeclarationCommand: "editor.action.goToReferences",
      alternativeImplementationCommand: "",
      alternativeReferenceCommand: "",
      alternativeTestsCommand: ""
    };
    const jsonSubset = {
      type: "string",
      enum: ["peek", "gotoAndPeek", "goto"],
      default: defaults.multiple,
      enumDescriptions: [
        nls.localize("editor.gotoLocation.multiple.peek", "Show Peek view of the results (default)"),
        nls.localize("editor.gotoLocation.multiple.gotoAndPeek", "Go to the primary result and show a Peek view"),
        nls.localize("editor.gotoLocation.multiple.goto", "Go to the primary result and enable Peek-less navigation to others")
      ]
    };
    const alternativeCommandOptions = ["", "editor.action.referenceSearch.trigger", "editor.action.goToReferences", "editor.action.peekImplementation", "editor.action.goToImplementation", "editor.action.peekTypeDefinition", "editor.action.goToTypeDefinition", "editor.action.peekDeclaration", "editor.action.revealDeclaration", "editor.action.peekDefinition", "editor.action.revealDefinitionAside", "editor.action.revealDefinition"];
    super(
      67 /* gotoLocation */,
      "gotoLocation",
      defaults,
      {
        "editor.gotoLocation.multiple": {
          deprecationMessage: nls.localize("editor.gotoLocation.multiple.deprecated", "This setting is deprecated, please use separate settings like 'editor.editor.gotoLocation.multipleDefinitions' or 'editor.editor.gotoLocation.multipleImplementations' instead.")
        },
        "editor.gotoLocation.multipleDefinitions": {
          description: nls.localize("editor.editor.gotoLocation.multipleDefinitions", "Controls the behavior the 'Go to Definition'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleTypeDefinitions": {
          description: nls.localize("editor.editor.gotoLocation.multipleTypeDefinitions", "Controls the behavior the 'Go to Type Definition'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleDeclarations": {
          description: nls.localize("editor.editor.gotoLocation.multipleDeclarations", "Controls the behavior the 'Go to Declaration'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleImplementations": {
          description: nls.localize("editor.editor.gotoLocation.multipleImplemenattions", "Controls the behavior the 'Go to Implementations'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.multipleReferences": {
          description: nls.localize("editor.editor.gotoLocation.multipleReferences", "Controls the behavior the 'Go to References'-command when multiple target locations exist."),
          ...jsonSubset
        },
        "editor.gotoLocation.alternativeDefinitionCommand": {
          type: "string",
          default: defaults.alternativeDefinitionCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeDefinitionCommand", "Alternative command id that is being executed when the result of 'Go to Definition' is the current location.")
        },
        "editor.gotoLocation.alternativeTypeDefinitionCommand": {
          type: "string",
          default: defaults.alternativeTypeDefinitionCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeTypeDefinitionCommand", "Alternative command id that is being executed when the result of 'Go to Type Definition' is the current location.")
        },
        "editor.gotoLocation.alternativeDeclarationCommand": {
          type: "string",
          default: defaults.alternativeDeclarationCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeDeclarationCommand", "Alternative command id that is being executed when the result of 'Go to Declaration' is the current location.")
        },
        "editor.gotoLocation.alternativeImplementationCommand": {
          type: "string",
          default: defaults.alternativeImplementationCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeImplementationCommand", "Alternative command id that is being executed when the result of 'Go to Implementation' is the current location.")
        },
        "editor.gotoLocation.alternativeReferenceCommand": {
          type: "string",
          default: defaults.alternativeReferenceCommand,
          enum: alternativeCommandOptions,
          description: nls.localize("alternativeReferenceCommand", "Alternative command id that is being executed when the result of 'Go to Reference' is the current location.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      multiple: stringSet(input.multiple, this.defaultValue.multiple, ["peek", "gotoAndPeek", "goto"]),
      multipleDefinitions: stringSet(input.multipleDefinitions, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleTypeDefinitions: stringSet(input.multipleTypeDefinitions, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleDeclarations: stringSet(input.multipleDeclarations, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleImplementations: stringSet(input.multipleImplementations, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleReferences: stringSet(input.multipleReferences, "peek", ["peek", "gotoAndPeek", "goto"]),
      multipleTests: stringSet(input.multipleTests, "peek", ["peek", "gotoAndPeek", "goto"]),
      alternativeDefinitionCommand: EditorStringOption.string(input.alternativeDefinitionCommand, this.defaultValue.alternativeDefinitionCommand),
      alternativeTypeDefinitionCommand: EditorStringOption.string(input.alternativeTypeDefinitionCommand, this.defaultValue.alternativeTypeDefinitionCommand),
      alternativeDeclarationCommand: EditorStringOption.string(input.alternativeDeclarationCommand, this.defaultValue.alternativeDeclarationCommand),
      alternativeImplementationCommand: EditorStringOption.string(input.alternativeImplementationCommand, this.defaultValue.alternativeImplementationCommand),
      alternativeReferenceCommand: EditorStringOption.string(input.alternativeReferenceCommand, this.defaultValue.alternativeReferenceCommand),
      alternativeTestsCommand: EditorStringOption.string(input.alternativeTestsCommand, this.defaultValue.alternativeTestsCommand)
    };
  }
}
class EditorHover extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: "on",
      delay: 300,
      hidingDelay: 300,
      sticky: true,
      above: true,
      showLongLineWarning: true
    };
    super(
      69 /* hover */,
      "hover",
      defaults,
      {
        "editor.hover.enabled": {
          type: "string",
          enum: ["on", "off", "onKeyboardModifier"],
          default: defaults.enabled,
          markdownEnumDescriptions: [
            nls.localize("hover.enabled.on", "Hover is enabled."),
            nls.localize("hover.enabled.off", "Hover is disabled."),
            nls.localize("hover.enabled.onKeyboardModifier", "Hover is shown when holding `{0}` or `Alt` (the opposite modifier of `#editor.multiCursorModifier#`)", platform.isMacintosh ? `Command` : `Control`)
          ],
          description: nls.localize("hover.enabled", "Controls whether the hover is shown."),
          keywords: ["hint", "info", "tooltip"]
        },
        "editor.hover.delay": {
          type: "number",
          default: defaults.delay,
          minimum: 0,
          maximum: 1e4,
          description: nls.localize("hover.delay", "Controls the delay in milliseconds after which the hover is shown.")
        },
        "editor.hover.sticky": {
          type: "boolean",
          default: defaults.sticky,
          description: nls.localize("hover.sticky", "Controls whether the hover should remain visible when mouse is moved over it.")
        },
        "editor.hover.hidingDelay": {
          type: "integer",
          minimum: 0,
          default: defaults.hidingDelay,
          markdownDescription: nls.localize("hover.hidingDelay", "Controls the delay in milliseconds after which the hover is hidden. Requires `#editor.hover.sticky#` to be enabled.")
        },
        "editor.hover.above": {
          type: "boolean",
          default: defaults.above,
          description: nls.localize("hover.above", "Prefer showing hovers above the line, if there's space.")
        },
        "editor.hover.showLongLineWarning": {
          type: "boolean",
          default: defaults.showLongLineWarning,
          description: nls.localize("hover.showLongLineWarning", "Controls whether long line warning hovers are shown, such as when tokenization is skipped or rendering is paused.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: stringSet(input.enabled, this.defaultValue.enabled, ["on", "off", "onKeyboardModifier"]),
      delay: EditorIntOption.clampedInt(input.delay, this.defaultValue.delay, 0, 1e4),
      sticky: boolean(input.sticky, this.defaultValue.sticky),
      hidingDelay: EditorIntOption.clampedInt(input.hidingDelay, this.defaultValue.hidingDelay, 0, 6e5),
      above: boolean(input.above, this.defaultValue.above),
      showLongLineWarning: boolean(input.showLongLineWarning, this.defaultValue.showLongLineWarning)
    };
  }
}
var RenderMinimap = /* @__PURE__ */ ((RenderMinimap2) => {
  RenderMinimap2[RenderMinimap2["None"] = 0] = "None";
  RenderMinimap2[RenderMinimap2["Text"] = 1] = "Text";
  RenderMinimap2[RenderMinimap2["Blocks"] = 2] = "Blocks";
  return RenderMinimap2;
})(RenderMinimap || {});
class EditorLayoutInfoComputer extends ComputedEditorOption {
  constructor() {
    super(165 /* layoutInfo */, {
      width: 0,
      height: 0,
      glyphMarginLeft: 0,
      glyphMarginWidth: 0,
      glyphMarginDecorationLaneCount: 0,
      lineNumbersLeft: 0,
      lineNumbersWidth: 0,
      decorationsLeft: 0,
      decorationsWidth: 0,
      contentLeft: 0,
      contentWidth: 0,
      minimap: {
        renderMinimap: 0 /* None */,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: 0,
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: 0
      },
      viewportColumn: 0,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1,
      verticalScrollbarWidth: 0,
      horizontalScrollbarHeight: 0,
      overviewRuler: {
        top: 0,
        width: 0,
        height: 0,
        right: 0
      }
    });
  }
  compute(env, options, _) {
    return EditorLayoutInfoComputer.computeLayout(options, {
      memory: env.memory,
      outerWidth: env.outerWidth,
      outerHeight: env.outerHeight,
      isDominatedByLongLines: env.isDominatedByLongLines,
      lineHeight: env.fontInfo.lineHeight,
      viewLineCount: env.viewLineCount,
      lineNumbersDigitCount: env.lineNumbersDigitCount,
      typicalHalfwidthCharacterWidth: env.fontInfo.typicalHalfwidthCharacterWidth,
      maxDigitWidth: env.fontInfo.maxDigitWidth,
      pixelRatio: env.pixelRatio,
      glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount
    });
  }
  static computeContainedMinimapLineCount(input) {
    const typicalViewportLineCount = input.height / input.lineHeight;
    const extraLinesBeforeFirstLine = Math.floor(input.paddingTop / input.lineHeight);
    let extraLinesBeyondLastLine = Math.floor(input.paddingBottom / input.lineHeight);
    if (input.scrollBeyondLastLine) {
      extraLinesBeyondLastLine = Math.max(extraLinesBeyondLastLine, typicalViewportLineCount - 1);
    }
    const desiredRatio = (extraLinesBeforeFirstLine + input.viewLineCount + extraLinesBeyondLastLine) / (input.pixelRatio * input.height);
    const minimapLineCount = Math.floor(input.viewLineCount / desiredRatio);
    return { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount };
  }
  static _computeMinimapLayout(input, memory) {
    const outerWidth = input.outerWidth;
    const outerHeight = input.outerHeight;
    const pixelRatio = input.pixelRatio;
    if (!input.minimap.enabled) {
      return {
        renderMinimap: 0 /* None */,
        minimapLeft: 0,
        minimapWidth: 0,
        minimapHeightIsEditorHeight: false,
        minimapIsSampling: false,
        minimapScale: 1,
        minimapLineHeight: 1,
        minimapCanvasInnerWidth: 0,
        minimapCanvasInnerHeight: Math.floor(pixelRatio * outerHeight),
        minimapCanvasOuterWidth: 0,
        minimapCanvasOuterHeight: outerHeight
      };
    }
    const stableMinimapLayoutInput = memory.stableMinimapLayoutInput;
    const couldUseMemory = stableMinimapLayoutInput && input.outerHeight === stableMinimapLayoutInput.outerHeight && input.lineHeight === stableMinimapLayoutInput.lineHeight && input.typicalHalfwidthCharacterWidth === stableMinimapLayoutInput.typicalHalfwidthCharacterWidth && input.pixelRatio === stableMinimapLayoutInput.pixelRatio && input.scrollBeyondLastLine === stableMinimapLayoutInput.scrollBeyondLastLine && input.paddingTop === stableMinimapLayoutInput.paddingTop && input.paddingBottom === stableMinimapLayoutInput.paddingBottom && input.minimap.enabled === stableMinimapLayoutInput.minimap.enabled && input.minimap.side === stableMinimapLayoutInput.minimap.side && input.minimap.size === stableMinimapLayoutInput.minimap.size && input.minimap.showSlider === stableMinimapLayoutInput.minimap.showSlider && input.minimap.renderCharacters === stableMinimapLayoutInput.minimap.renderCharacters && input.minimap.maxColumn === stableMinimapLayoutInput.minimap.maxColumn && input.minimap.scale === stableMinimapLayoutInput.minimap.scale && input.verticalScrollbarWidth === stableMinimapLayoutInput.verticalScrollbarWidth && input.isViewportWrapping === stableMinimapLayoutInput.isViewportWrapping;
    const lineHeight = input.lineHeight;
    const typicalHalfwidthCharacterWidth = input.typicalHalfwidthCharacterWidth;
    const scrollBeyondLastLine = input.scrollBeyondLastLine;
    const minimapRenderCharacters = input.minimap.renderCharacters;
    let minimapScale = pixelRatio >= 2 ? Math.round(input.minimap.scale * 2) : input.minimap.scale;
    const minimapMaxColumn = input.minimap.maxColumn;
    const minimapSize = input.minimap.size;
    const minimapSide = input.minimap.side;
    const verticalScrollbarWidth = input.verticalScrollbarWidth;
    const viewLineCount = input.viewLineCount;
    const remainingWidth = input.remainingWidth;
    const isViewportWrapping = input.isViewportWrapping;
    const baseCharHeight = minimapRenderCharacters ? 2 : 3;
    let minimapCanvasInnerHeight = Math.floor(pixelRatio * outerHeight);
    const minimapCanvasOuterHeight = minimapCanvasInnerHeight / pixelRatio;
    let minimapHeightIsEditorHeight = false;
    let minimapIsSampling = false;
    let minimapLineHeight = baseCharHeight * minimapScale;
    let minimapCharWidth = minimapScale / pixelRatio;
    let minimapWidthMultiplier = 1;
    if (minimapSize === "fill" || minimapSize === "fit") {
      const { typicalViewportLineCount, extraLinesBeforeFirstLine, extraLinesBeyondLastLine, desiredRatio, minimapLineCount } = EditorLayoutInfoComputer.computeContainedMinimapLineCount({
        viewLineCount,
        scrollBeyondLastLine,
        paddingTop: input.paddingTop,
        paddingBottom: input.paddingBottom,
        height: outerHeight,
        lineHeight,
        pixelRatio
      });
      const ratio = viewLineCount / minimapLineCount;
      if (ratio > 1) {
        minimapHeightIsEditorHeight = true;
        minimapIsSampling = true;
        minimapScale = 1;
        minimapLineHeight = 1;
        minimapCharWidth = minimapScale / pixelRatio;
      } else {
        let fitBecomesFill = false;
        let maxMinimapScale = minimapScale + 1;
        if (minimapSize === "fit") {
          const effectiveMinimapHeight = Math.ceil((extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine) * minimapLineHeight);
          if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
            fitBecomesFill = true;
            maxMinimapScale = memory.stableFitMaxMinimapScale;
          } else {
            fitBecomesFill = effectiveMinimapHeight > minimapCanvasInnerHeight;
          }
        }
        if (minimapSize === "fill" || fitBecomesFill) {
          minimapHeightIsEditorHeight = true;
          const configuredMinimapScale = minimapScale;
          minimapLineHeight = Math.min(lineHeight * pixelRatio, Math.max(1, Math.floor(1 / desiredRatio)));
          if (isViewportWrapping && couldUseMemory && remainingWidth <= memory.stableFitRemainingWidth) {
            maxMinimapScale = memory.stableFitMaxMinimapScale;
          }
          minimapScale = Math.min(maxMinimapScale, Math.max(1, Math.floor(minimapLineHeight / baseCharHeight)));
          if (minimapScale > configuredMinimapScale) {
            minimapWidthMultiplier = Math.min(2, minimapScale / configuredMinimapScale);
          }
          minimapCharWidth = minimapScale / pixelRatio / minimapWidthMultiplier;
          minimapCanvasInnerHeight = Math.ceil(Math.max(typicalViewportLineCount, extraLinesBeforeFirstLine + viewLineCount + extraLinesBeyondLastLine) * minimapLineHeight);
          if (isViewportWrapping) {
            memory.stableMinimapLayoutInput = input;
            memory.stableFitRemainingWidth = remainingWidth;
            memory.stableFitMaxMinimapScale = minimapScale;
          } else {
            memory.stableMinimapLayoutInput = null;
            memory.stableFitRemainingWidth = 0;
          }
        }
      }
    }
    const minimapMaxWidth = Math.floor(minimapMaxColumn * minimapCharWidth);
    const minimapWidth = Math.min(minimapMaxWidth, Math.max(0, Math.floor((remainingWidth - verticalScrollbarWidth - 2) * minimapCharWidth / (typicalHalfwidthCharacterWidth + minimapCharWidth))) + MINIMAP_GUTTER_WIDTH);
    let minimapCanvasInnerWidth = Math.floor(pixelRatio * minimapWidth);
    const minimapCanvasOuterWidth = minimapCanvasInnerWidth / pixelRatio;
    minimapCanvasInnerWidth = Math.floor(minimapCanvasInnerWidth * minimapWidthMultiplier);
    const renderMinimap = minimapRenderCharacters ? 1 /* Text */ : 2 /* Blocks */;
    const minimapLeft = minimapSide === "left" ? 0 : outerWidth - minimapWidth - verticalScrollbarWidth;
    return {
      renderMinimap,
      minimapLeft,
      minimapWidth,
      minimapHeightIsEditorHeight,
      minimapIsSampling,
      minimapScale,
      minimapLineHeight,
      minimapCanvasInnerWidth,
      minimapCanvasInnerHeight,
      minimapCanvasOuterWidth,
      minimapCanvasOuterHeight
    };
  }
  static computeLayout(options, env) {
    const outerWidth = env.outerWidth | 0;
    const outerHeight = env.outerHeight | 0;
    const lineHeight = env.lineHeight | 0;
    const lineNumbersDigitCount = env.lineNumbersDigitCount | 0;
    const typicalHalfwidthCharacterWidth = env.typicalHalfwidthCharacterWidth;
    const maxDigitWidth = env.maxDigitWidth;
    const pixelRatio = env.pixelRatio;
    const viewLineCount = env.viewLineCount;
    const wordWrapOverride2 = options.get(154 /* wordWrapOverride2 */);
    const wordWrapOverride1 = wordWrapOverride2 === "inherit" ? options.get(153 /* wordWrapOverride1 */) : wordWrapOverride2;
    const wordWrap = wordWrapOverride1 === "inherit" ? options.get(149 /* wordWrap */) : wordWrapOverride1;
    const wordWrapColumn = options.get(152 /* wordWrapColumn */);
    const isDominatedByLongLines = env.isDominatedByLongLines;
    const showGlyphMargin = options.get(66 /* glyphMargin */);
    const showLineNumbers = options.get(76 /* lineNumbers */).renderType !== 0 /* Off */;
    const lineNumbersMinChars = options.get(77 /* lineNumbersMinChars */);
    const scrollBeyondLastLine = options.get(119 /* scrollBeyondLastLine */);
    const padding = options.get(96 /* padding */);
    const minimap = options.get(81 /* minimap */);
    const scrollbar = options.get(117 /* scrollbar */);
    const verticalScrollbarWidth = scrollbar.verticalScrollbarSize;
    const verticalScrollbarHasArrows = scrollbar.verticalHasArrows;
    const scrollbarArrowSize = scrollbar.arrowSize;
    const horizontalScrollbarHeight = scrollbar.horizontalScrollbarSize;
    const folding = options.get(52 /* folding */);
    const showFoldingDecoration = options.get(126 /* showFoldingControls */) !== "never";
    let lineDecorationsWidth = options.get(74 /* lineDecorationsWidth */);
    if (folding && showFoldingDecoration) {
      lineDecorationsWidth += 16;
    }
    let lineNumbersWidth = 0;
    if (showLineNumbers) {
      const digitCount = Math.max(lineNumbersDigitCount, lineNumbersMinChars);
      lineNumbersWidth = Math.round(digitCount * maxDigitWidth);
    }
    let glyphMarginWidth = 0;
    if (showGlyphMargin) {
      glyphMarginWidth = lineHeight * env.glyphMarginDecorationLaneCount;
    }
    let glyphMarginLeft = 0;
    let lineNumbersLeft = glyphMarginLeft + glyphMarginWidth;
    let decorationsLeft = lineNumbersLeft + lineNumbersWidth;
    let contentLeft = decorationsLeft + lineDecorationsWidth;
    const remainingWidth = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth;
    let isWordWrapMinified = false;
    let isViewportWrapping = false;
    let wrappingColumn = -1;
    if (options.get(2 /* accessibilitySupport */) === AccessibilitySupport.Enabled && wordWrapOverride1 === "inherit" && isDominatedByLongLines) {
      isWordWrapMinified = true;
      isViewportWrapping = true;
    } else if (wordWrap === "on" || wordWrap === "bounded") {
      isViewportWrapping = true;
    } else if (wordWrap === "wordWrapColumn") {
      wrappingColumn = wordWrapColumn;
    }
    const minimapLayout = EditorLayoutInfoComputer._computeMinimapLayout({
      outerWidth,
      outerHeight,
      lineHeight,
      typicalHalfwidthCharacterWidth,
      pixelRatio,
      scrollBeyondLastLine,
      paddingTop: padding.top,
      paddingBottom: padding.bottom,
      minimap,
      verticalScrollbarWidth,
      viewLineCount,
      remainingWidth,
      isViewportWrapping
    }, env.memory || new ComputeOptionsMemory());
    if (minimapLayout.renderMinimap !== 0 /* None */ && minimapLayout.minimapLeft === 0) {
      glyphMarginLeft += minimapLayout.minimapWidth;
      lineNumbersLeft += minimapLayout.minimapWidth;
      decorationsLeft += minimapLayout.minimapWidth;
      contentLeft += minimapLayout.minimapWidth;
    }
    const contentWidth = remainingWidth - minimapLayout.minimapWidth;
    const viewportColumn = Math.max(1, Math.floor((contentWidth - verticalScrollbarWidth - 2) / typicalHalfwidthCharacterWidth));
    const verticalArrowSize = verticalScrollbarHasArrows ? scrollbarArrowSize : 0;
    if (isViewportWrapping) {
      wrappingColumn = Math.max(1, viewportColumn);
      if (wordWrap === "bounded") {
        wrappingColumn = Math.min(wrappingColumn, wordWrapColumn);
      }
    }
    return {
      width: outerWidth,
      height: outerHeight,
      glyphMarginLeft,
      glyphMarginWidth,
      glyphMarginDecorationLaneCount: env.glyphMarginDecorationLaneCount,
      lineNumbersLeft,
      lineNumbersWidth,
      decorationsLeft,
      decorationsWidth: lineDecorationsWidth,
      contentLeft,
      contentWidth,
      minimap: minimapLayout,
      viewportColumn,
      isWordWrapMinified,
      isViewportWrapping,
      wrappingColumn,
      verticalScrollbarWidth,
      horizontalScrollbarHeight,
      overviewRuler: {
        top: verticalArrowSize,
        width: verticalScrollbarWidth,
        height: outerHeight - 2 * verticalArrowSize,
        right: 0
      }
    };
  }
}
class WrappingStrategy extends BaseEditorOption {
  constructor() {
    super(
      156 /* wrappingStrategy */,
      "wrappingStrategy",
      "simple",
      {
        "editor.wrappingStrategy": {
          enumDescriptions: [
            nls.localize("wrappingStrategy.simple", "Assumes that all characters are of the same width. This is a fast algorithm that works correctly for monospace fonts and certain scripts (like Latin characters) where glyphs are of equal width."),
            nls.localize("wrappingStrategy.advanced", "Delegates wrapping points computation to the browser. This is a slow algorithm, that might cause freezes for large files, but it works correctly in all cases.")
          ],
          type: "string",
          enum: ["simple", "advanced"],
          default: "simple",
          description: nls.localize("wrappingStrategy", "Controls the algorithm that computes wrapping points. Note that when in accessibility mode, advanced will be used for the best experience.")
        }
      }
    );
  }
  validate(input) {
    return stringSet(input, "simple", ["simple", "advanced"]);
  }
  compute(env, options, value) {
    const accessibilitySupport = options.get(2 /* accessibilitySupport */);
    if (accessibilitySupport === AccessibilitySupport.Enabled) {
      return "advanced";
    }
    return value;
  }
}
var ShowLightbulbIconMode = /* @__PURE__ */ ((ShowLightbulbIconMode2) => {
  ShowLightbulbIconMode2["Off"] = "off";
  ShowLightbulbIconMode2["OnCode"] = "onCode";
  ShowLightbulbIconMode2["On"] = "on";
  return ShowLightbulbIconMode2;
})(ShowLightbulbIconMode || {});
class EditorLightbulb extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: "onCode" /* OnCode */ };
    super(
      73 /* lightbulb */,
      "lightbulb",
      defaults,
      {
        "editor.lightbulb.enabled": {
          type: "string",
          enum: ["off" /* Off */, "onCode" /* OnCode */, "on" /* On */],
          default: defaults.enabled,
          enumDescriptions: [
            nls.localize("editor.lightbulb.enabled.off", "Disable the code action menu."),
            nls.localize("editor.lightbulb.enabled.onCode", "Show the code action menu when the cursor is on lines with code."),
            nls.localize("editor.lightbulb.enabled.on", "Show the code action menu when the cursor is on lines with code or on empty lines.")
          ],
          description: nls.localize("enabled", "Enables the Code Action lightbulb in the editor.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: stringSet(input.enabled, this.defaultValue.enabled, ["off" /* Off */, "onCode" /* OnCode */, "on" /* On */])
    };
  }
}
class EditorStickyScroll extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: true, maxLineCount: 5, defaultModel: "outlineModel", scrollWithEditor: true };
    super(
      131 /* stickyScroll */,
      "stickyScroll",
      defaults,
      {
        "editor.stickyScroll.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("editor.stickyScroll.enabled", "Shows the nested current scopes during the scroll at the top of the editor.")
        },
        "editor.stickyScroll.maxLineCount": {
          type: "number",
          default: defaults.maxLineCount,
          minimum: 1,
          maximum: 20,
          description: nls.localize("editor.stickyScroll.maxLineCount", "Defines the maximum number of sticky lines to show.")
        },
        "editor.stickyScroll.defaultModel": {
          type: "string",
          enum: ["outlineModel", "foldingProviderModel", "indentationModel"],
          default: defaults.defaultModel,
          description: nls.localize("editor.stickyScroll.defaultModel", "Defines the model to use for determining which lines to stick. If the outline model does not exist, it will fall back on the folding provider model which falls back on the indentation model. This order is respected in all three cases.")
        },
        "editor.stickyScroll.scrollWithEditor": {
          type: "boolean",
          default: defaults.scrollWithEditor,
          description: nls.localize("editor.stickyScroll.scrollWithEditor", "Enable scrolling of Sticky Scroll with the editor's horizontal scrollbar.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      maxLineCount: EditorIntOption.clampedInt(input.maxLineCount, this.defaultValue.maxLineCount, 1, 20),
      defaultModel: stringSet(input.defaultModel, this.defaultValue.defaultModel, ["outlineModel", "foldingProviderModel", "indentationModel"]),
      scrollWithEditor: boolean(input.scrollWithEditor, this.defaultValue.scrollWithEditor)
    };
  }
}
class EditorInlayHints extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: "on", fontSize: 0, fontFamily: "", padding: false, maximumLength: 43 };
    super(
      159 /* inlayHints */,
      "inlayHints",
      defaults,
      {
        "editor.inlayHints.enabled": {
          type: "string",
          default: defaults.enabled,
          description: nls.localize("inlayHints.enable", "Enables the inlay hints in the editor."),
          enum: ["on", "onUnlessPressed", "offUnlessPressed", "off"],
          markdownEnumDescriptions: [
            nls.localize("editor.inlayHints.on", "Inlay hints are enabled"),
            nls.localize("editor.inlayHints.onUnlessPressed", "Inlay hints are showing by default and hide when holding {0}", platform.isMacintosh ? `Ctrl+Option` : `Ctrl+Alt`),
            nls.localize("editor.inlayHints.offUnlessPressed", "Inlay hints are hidden by default and show when holding {0}", platform.isMacintosh ? `Ctrl+Option` : `Ctrl+Alt`),
            nls.localize("editor.inlayHints.off", "Inlay hints are disabled")
          ]
        },
        "editor.inlayHints.fontSize": {
          type: "number",
          default: defaults.fontSize,
          markdownDescription: nls.localize("inlayHints.fontSize", "Controls font size of inlay hints in the editor. As default the {0} is used when the configured value is less than {1} or greater than the editor font size.", "`#editor.fontSize#`", "`5`")
        },
        "editor.inlayHints.fontFamily": {
          type: "string",
          default: defaults.fontFamily,
          markdownDescription: nls.localize("inlayHints.fontFamily", "Controls font family of inlay hints in the editor. When set to empty, the {0} is used.", "`#editor.fontFamily#`")
        },
        "editor.inlayHints.padding": {
          type: "boolean",
          default: defaults.padding,
          description: nls.localize("inlayHints.padding", "Enables the padding around the inlay hints in the editor.")
        },
        "editor.inlayHints.maximumLength": {
          type: "number",
          default: defaults.maximumLength,
          markdownDescription: nls.localize("inlayHints.maximumLength", "Maximum overall length of inlay hints, for a single line, before they get truncated by the editor. Set to `0` to never truncate")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    if (typeof input.enabled === "boolean") {
      input.enabled = input.enabled ? "on" : "off";
    }
    return {
      enabled: stringSet(input.enabled, this.defaultValue.enabled, ["on", "off", "offUnlessPressed", "onUnlessPressed"]),
      fontSize: EditorIntOption.clampedInt(input.fontSize, this.defaultValue.fontSize, 0, 100),
      fontFamily: EditorStringOption.string(input.fontFamily, this.defaultValue.fontFamily),
      padding: boolean(input.padding, this.defaultValue.padding),
      maximumLength: EditorIntOption.clampedInt(input.maximumLength, this.defaultValue.maximumLength, 0, Number.MAX_SAFE_INTEGER)
    };
  }
}
class EditorLineDecorationsWidth extends BaseEditorOption {
  constructor() {
    super(74 /* lineDecorationsWidth */, "lineDecorationsWidth", 10);
  }
  validate(input) {
    if (typeof input === "string" && /^\d+(\.\d+)?ch$/.test(input)) {
      const multiple = parseFloat(input.substring(0, input.length - 2));
      return -multiple;
    } else {
      return EditorIntOption.clampedInt(input, this.defaultValue, 0, 1e3);
    }
  }
  compute(env, options, value) {
    if (value < 0) {
      return EditorIntOption.clampedInt(-value * env.fontInfo.typicalHalfwidthCharacterWidth, this.defaultValue, 0, 1e3);
    } else {
      return value;
    }
  }
}
class EditorLineHeight extends EditorFloatOption {
  constructor() {
    super(
      75 /* lineHeight */,
      "lineHeight",
      EDITOR_FONT_DEFAULTS.lineHeight,
      (x) => EditorFloatOption.clamp(x, 0, 150),
      { markdownDescription: nls.localize("lineHeight", "Controls the line height. \n - Use 0 to automatically compute the line height from the font size.\n - Values between 0 and 8 will be used as a multiplier with the font size.\n - Values greater than or equal to 8 will be used as effective values.") },
      0,
      150
    );
  }
  compute(env, options, value) {
    return env.fontInfo.lineHeight;
  }
}
class EditorMinimap extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: true,
      size: "proportional",
      side: "right",
      showSlider: "mouseover",
      autohide: "none",
      renderCharacters: true,
      maxColumn: 120,
      scale: 1,
      showRegionSectionHeaders: true,
      showMarkSectionHeaders: true,
      markSectionHeaderRegex: "\\bMARK:\\s*(?<separator>-?)\\s*(?<label>.*)$",
      sectionHeaderFontSize: 9,
      sectionHeaderLetterSpacing: 1
    };
    super(
      81 /* minimap */,
      "minimap",
      defaults,
      {
        "editor.minimap.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("minimap.enabled", "Controls whether the minimap is shown.")
        },
        "editor.minimap.autohide": {
          type: "string",
          enum: ["none", "mouseover", "scroll"],
          enumDescriptions: [
            nls.localize("minimap.autohide.none", "The minimap is always shown."),
            nls.localize("minimap.autohide.mouseover", "The minimap is hidden when mouse is not over the minimap and shown when mouse is over the minimap."),
            nls.localize("minimap.autohide.scroll", "The minimap is only shown when the editor is scrolled")
          ],
          default: defaults.autohide,
          description: nls.localize("minimap.autohide", "Controls whether the minimap is hidden automatically.")
        },
        "editor.minimap.size": {
          type: "string",
          enum: ["proportional", "fill", "fit"],
          enumDescriptions: [
            nls.localize("minimap.size.proportional", "The minimap has the same size as the editor contents (and might scroll)."),
            nls.localize("minimap.size.fill", "The minimap will stretch or shrink as necessary to fill the height of the editor (no scrolling)."),
            nls.localize("minimap.size.fit", "The minimap will shrink as necessary to never be larger than the editor (no scrolling).")
          ],
          default: defaults.size,
          description: nls.localize("minimap.size", "Controls the size of the minimap.")
        },
        "editor.minimap.side": {
          type: "string",
          enum: ["left", "right"],
          default: defaults.side,
          description: nls.localize("minimap.side", "Controls the side where to render the minimap.")
        },
        "editor.minimap.showSlider": {
          type: "string",
          enum: ["always", "mouseover"],
          default: defaults.showSlider,
          description: nls.localize("minimap.showSlider", "Controls when the minimap slider is shown.")
        },
        "editor.minimap.scale": {
          type: "number",
          default: defaults.scale,
          minimum: 1,
          maximum: 3,
          enum: [1, 2, 3],
          description: nls.localize("minimap.scale", "Scale of content drawn in the minimap: 1, 2 or 3.")
        },
        "editor.minimap.renderCharacters": {
          type: "boolean",
          default: defaults.renderCharacters,
          description: nls.localize("minimap.renderCharacters", "Render the actual characters on a line as opposed to color blocks.")
        },
        "editor.minimap.maxColumn": {
          type: "number",
          default: defaults.maxColumn,
          description: nls.localize("minimap.maxColumn", "Limit the width of the minimap to render at most a certain number of columns.")
        },
        "editor.minimap.showRegionSectionHeaders": {
          type: "boolean",
          default: defaults.showRegionSectionHeaders,
          description: nls.localize("minimap.showRegionSectionHeaders", "Controls whether named regions are shown as section headers in the minimap.")
        },
        "editor.minimap.showMarkSectionHeaders": {
          type: "boolean",
          default: defaults.showMarkSectionHeaders,
          description: nls.localize("minimap.showMarkSectionHeaders", "Controls whether MARK: comments are shown as section headers in the minimap.")
        },
        "editor.minimap.markSectionHeaderRegex": {
          type: "string",
          default: defaults.markSectionHeaderRegex,
          description: nls.localize("minimap.markSectionHeaderRegex", "Defines the regular expression used to find section headers in comments. The regex must contain a named match group `label` (written as `(?<label>.+)`) that encapsulates the section header, otherwise it will not work. Optionally you can include another match group named `separator`. Use \\n in the pattern to match multi-line headers.")
        },
        "editor.minimap.sectionHeaderFontSize": {
          type: "number",
          default: defaults.sectionHeaderFontSize,
          description: nls.localize("minimap.sectionHeaderFontSize", "Controls the font size of section headers in the minimap.")
        },
        "editor.minimap.sectionHeaderLetterSpacing": {
          type: "number",
          default: defaults.sectionHeaderLetterSpacing,
          description: nls.localize("minimap.sectionHeaderLetterSpacing", "Controls the amount of space (in pixels) between characters of section header. This helps the readability of the header in small font sizes.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    let markSectionHeaderRegex = this.defaultValue.markSectionHeaderRegex;
    const inputRegex = input.markSectionHeaderRegex;
    if (typeof inputRegex === "string") {
      try {
        new RegExp(inputRegex, "d");
        markSectionHeaderRegex = inputRegex;
      } catch {
      }
    }
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      autohide: stringSet(input.autohide, this.defaultValue.autohide, ["none", "mouseover", "scroll"]),
      size: stringSet(input.size, this.defaultValue.size, ["proportional", "fill", "fit"]),
      side: stringSet(input.side, this.defaultValue.side, ["right", "left"]),
      showSlider: stringSet(input.showSlider, this.defaultValue.showSlider, ["always", "mouseover"]),
      renderCharacters: boolean(input.renderCharacters, this.defaultValue.renderCharacters),
      scale: EditorIntOption.clampedInt(input.scale, 1, 1, 3),
      maxColumn: EditorIntOption.clampedInt(input.maxColumn, this.defaultValue.maxColumn, 1, 1e4),
      showRegionSectionHeaders: boolean(input.showRegionSectionHeaders, this.defaultValue.showRegionSectionHeaders),
      showMarkSectionHeaders: boolean(input.showMarkSectionHeaders, this.defaultValue.showMarkSectionHeaders),
      markSectionHeaderRegex,
      sectionHeaderFontSize: EditorFloatOption.clamp(EditorFloatOption.float(input.sectionHeaderFontSize, this.defaultValue.sectionHeaderFontSize), 4, 32),
      sectionHeaderLetterSpacing: EditorFloatOption.clamp(EditorFloatOption.float(input.sectionHeaderLetterSpacing, this.defaultValue.sectionHeaderLetterSpacing), 0, 5)
    };
  }
}
function _multiCursorModifierFromString(multiCursorModifier) {
  if (multiCursorModifier === "ctrlCmd") {
    return platform.isMacintosh ? "metaKey" : "ctrlKey";
  }
  return "altKey";
}
class EditorPadding extends BaseEditorOption {
  constructor() {
    super(
      96 /* padding */,
      "padding",
      { top: 0, bottom: 0 },
      {
        "editor.padding.top": {
          type: "number",
          default: 0,
          minimum: 0,
          maximum: 1e3,
          description: nls.localize("padding.top", "Controls the amount of space between the top edge of the editor and the first line.")
        },
        "editor.padding.bottom": {
          type: "number",
          default: 0,
          minimum: 0,
          maximum: 1e3,
          description: nls.localize("padding.bottom", "Controls the amount of space between the bottom edge of the editor and the last line.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      top: EditorIntOption.clampedInt(input.top, 0, 0, 1e3),
      bottom: EditorIntOption.clampedInt(input.bottom, 0, 0, 1e3)
    };
  }
}
class EditorParameterHints extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: true,
      cycle: true
    };
    super(
      98 /* parameterHints */,
      "parameterHints",
      defaults,
      {
        "editor.parameterHints.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("parameterHints.enabled", "Enables a pop-up that shows parameter documentation and type information as you type.")
        },
        "editor.parameterHints.cycle": {
          type: "boolean",
          default: defaults.cycle,
          description: nls.localize("parameterHints.cycle", "Controls whether the parameter hints menu cycles or closes when reaching the end of the list.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      cycle: boolean(input.cycle, this.defaultValue.cycle)
    };
  }
}
class EditorPixelRatio extends ComputedEditorOption {
  constructor() {
    super(163 /* pixelRatio */, 1);
  }
  compute(env, options, _) {
    return env.pixelRatio;
  }
}
class PlaceholderOption extends BaseEditorOption {
  constructor() {
    super(100 /* placeholder */, "placeholder", void 0);
  }
  validate(input) {
    if (typeof input === "undefined") {
      return this.defaultValue;
    }
    if (typeof input === "string") {
      return input;
    }
    return this.defaultValue;
  }
}
class EditorQuickSuggestions extends BaseEditorOption {
  constructor() {
    const defaults = {
      other: "offWhenInlineCompletions",
      comments: "off",
      strings: "off"
    };
    const types = [
      { type: "boolean" },
      {
        type: "string",
        enum: ["on", "inline", "off", "offWhenInlineCompletions"],
        enumDescriptions: [nls.localize("on", "Quick suggestions show inside the suggest widget"), nls.localize("inline", "Quick suggestions show as ghost text"), nls.localize("off", "Quick suggestions are disabled"), nls.localize("offWhenInlineCompletions", "Quick suggestions are disabled when inline completions are showing")]
      }
    ];
    super(102 /* quickSuggestions */, "quickSuggestions", defaults, {
      anyOf: [
        { type: "boolean" },
        {
          type: "string",
          enum: ["on", "inline", "off", "offWhenInlineCompletions"],
          enumDescriptions: [nls.localize("quickSuggestions.topLevel.on", "Quick suggestions are enabled for all token types"), nls.localize("quickSuggestions.topLevel.inline", "Quick suggestions show as ghost text for all token types"), nls.localize("quickSuggestions.topLevel.off", "Quick suggestions are disabled for all token types"), nls.localize("quickSuggestions.topLevel.offWhenInlineCompletions", "Quick suggestions are disabled for all token types when inline completions are showing")]
        },
        {
          type: "object",
          additionalProperties: false,
          properties: {
            strings: {
              anyOf: types,
              default: defaults.strings,
              description: nls.localize("quickSuggestions.strings", "Enable quick suggestions inside strings.")
            },
            comments: {
              anyOf: types,
              default: defaults.comments,
              description: nls.localize("quickSuggestions.comments", "Enable quick suggestions inside comments.")
            },
            other: {
              anyOf: types,
              default: defaults.other,
              description: nls.localize("quickSuggestions.other", "Enable quick suggestions outside of strings and comments.")
            }
          }
        }
      ],
      default: defaults,
      markdownDescription: nls.localize("quickSuggestions", "Controls whether suggestions should automatically show up while typing. This can be controlled for typing in comments, strings, and other code. Quick suggestion can be configured to show as ghost text or with the suggest widget. Also be aware of the {0}-setting which controls if suggestions are triggered by special characters.", "`#editor.suggestOnTriggerCharacters#`"),
      experiment: {
        mode: "auto"
      }
    });
    this.defaultValue = defaults;
  }
  validate(input) {
    if (typeof input === "boolean") {
      const value = input ? "on" : "off";
      return { comments: value, strings: value, other: value };
    }
    if (typeof input === "string") {
      const allowedValues2 = ["on", "inline", "off", "offWhenInlineCompletions"];
      const validated = stringSet(input, this.defaultValue.other, allowedValues2);
      return { comments: validated, strings: validated, other: validated };
    }
    if (!input || typeof input !== "object") {
      return this.defaultValue;
    }
    const { other, comments, strings } = input;
    const allowedValues = ["on", "inline", "off", "offWhenInlineCompletions"];
    let validatedOther;
    let validatedComments;
    let validatedStrings;
    if (typeof other === "boolean") {
      validatedOther = other ? "on" : "off";
    } else {
      validatedOther = stringSet(other, this.defaultValue.other, allowedValues);
    }
    if (typeof comments === "boolean") {
      validatedComments = comments ? "on" : "off";
    } else {
      validatedComments = stringSet(comments, this.defaultValue.comments, allowedValues);
    }
    if (typeof strings === "boolean") {
      validatedStrings = strings ? "on" : "off";
    } else {
      validatedStrings = stringSet(strings, this.defaultValue.strings, allowedValues);
    }
    return {
      other: validatedOther,
      comments: validatedComments,
      strings: validatedStrings
    };
  }
}
var RenderLineNumbersType = /* @__PURE__ */ ((RenderLineNumbersType2) => {
  RenderLineNumbersType2[RenderLineNumbersType2["Off"] = 0] = "Off";
  RenderLineNumbersType2[RenderLineNumbersType2["On"] = 1] = "On";
  RenderLineNumbersType2[RenderLineNumbersType2["Relative"] = 2] = "Relative";
  RenderLineNumbersType2[RenderLineNumbersType2["Interval"] = 3] = "Interval";
  RenderLineNumbersType2[RenderLineNumbersType2["Custom"] = 4] = "Custom";
  return RenderLineNumbersType2;
})(RenderLineNumbersType || {});
class EditorRenderLineNumbersOption extends BaseEditorOption {
  constructor() {
    super(
      76 /* lineNumbers */,
      "lineNumbers",
      { renderType: 1 /* On */, renderFn: null },
      {
        type: "string",
        enum: ["off", "on", "relative", "interval"],
        enumDescriptions: [
          nls.localize("lineNumbers.off", "Line numbers are not rendered."),
          nls.localize("lineNumbers.on", "Line numbers are rendered as absolute number."),
          nls.localize("lineNumbers.relative", "Line numbers are rendered as distance in lines to cursor position."),
          nls.localize("lineNumbers.interval", "Line numbers are rendered every 10 lines.")
        ],
        default: "on",
        description: nls.localize("lineNumbers", "Controls the display of line numbers.")
      }
    );
  }
  validate(lineNumbers) {
    let renderType = this.defaultValue.renderType;
    let renderFn = this.defaultValue.renderFn;
    if (typeof lineNumbers !== "undefined") {
      if (typeof lineNumbers === "function") {
        renderType = 4 /* Custom */;
        renderFn = lineNumbers;
      } else if (lineNumbers === "interval") {
        renderType = 3 /* Interval */;
      } else if (lineNumbers === "relative") {
        renderType = 2 /* Relative */;
      } else if (lineNumbers === "on") {
        renderType = 1 /* On */;
      } else {
        renderType = 0 /* Off */;
      }
    }
    return {
      renderType,
      renderFn
    };
  }
}
function filterValidationDecorations(options) {
  const renderValidationDecorations = options.get(112 /* renderValidationDecorations */);
  if (renderValidationDecorations === "editable") {
    return options.get(104 /* readOnly */);
  }
  return renderValidationDecorations === "on" ? false : true;
}
function filterFontDecorations(options) {
  return !options.get(172 /* effectiveAllowVariableFonts */);
}
class EditorRulers extends BaseEditorOption {
  constructor() {
    const defaults = [];
    const columnSchema = { type: "number", description: nls.localize("rulers.size", "Number of monospace characters at which this editor ruler will render.") };
    super(
      116 /* rulers */,
      "rulers",
      defaults,
      {
        type: "array",
        items: {
          anyOf: [
            columnSchema,
            {
              type: [
                "object"
              ],
              properties: {
                column: columnSchema,
                color: {
                  type: "string",
                  description: nls.localize("rulers.color", "Color of this editor ruler."),
                  format: "color-hex"
                }
              }
            }
          ]
        },
        default: defaults,
        description: nls.localize("rulers", "Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers. No rulers are drawn if array is empty.")
      }
    );
  }
  validate(input) {
    if (Array.isArray(input)) {
      const rulers = [];
      for (const _element of input) {
        if (typeof _element === "number") {
          rulers.push({
            column: EditorIntOption.clampedInt(_element, 0, 0, 1e4),
            color: null
          });
        } else if (_element && typeof _element === "object") {
          const element = _element;
          rulers.push({
            column: EditorIntOption.clampedInt(element.column, 0, 0, 1e4),
            color: element.color
          });
        }
      }
      rulers.sort((a, b) => a.column - b.column);
      return rulers;
    }
    return this.defaultValue;
  }
}
class ReadonlyMessage extends BaseEditorOption {
  constructor() {
    const defaults = void 0;
    super(
      105 /* readOnlyMessage */,
      "readOnlyMessage",
      defaults
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    return _input;
  }
}
function _scrollbarVisibilityFromString(visibility, defaultValue) {
  if (typeof visibility !== "string") {
    return defaultValue;
  }
  switch (visibility) {
    case "hidden":
      return ScrollbarVisibility.Hidden;
    case "visible":
      return ScrollbarVisibility.Visible;
    default:
      return ScrollbarVisibility.Auto;
  }
}
class EditorScrollbar extends BaseEditorOption {
  constructor() {
    const defaults = {
      vertical: ScrollbarVisibility.Auto,
      horizontal: ScrollbarVisibility.Auto,
      arrowSize: 11,
      useShadows: true,
      verticalHasArrows: false,
      horizontalHasArrows: false,
      horizontalScrollbarSize: 12,
      horizontalSliderSize: 12,
      verticalScrollbarSize: 14,
      verticalSliderSize: 14,
      handleMouseWheel: true,
      alwaysConsumeMouseWheel: true,
      scrollByPage: false,
      ignoreHorizontalScrollbarInContentHeight: false
    };
    super(
      117 /* scrollbar */,
      "scrollbar",
      defaults,
      {
        "editor.scrollbar.vertical": {
          type: "string",
          enum: ["auto", "visible", "hidden"],
          enumDescriptions: [
            nls.localize("scrollbar.vertical.auto", "The vertical scrollbar will be visible only when necessary."),
            nls.localize("scrollbar.vertical.visible", "The vertical scrollbar will always be visible."),
            nls.localize("scrollbar.vertical.fit", "The vertical scrollbar will always be hidden.")
          ],
          default: "auto",
          description: nls.localize("scrollbar.vertical", "Controls the visibility of the vertical scrollbar.")
        },
        "editor.scrollbar.horizontal": {
          type: "string",
          enum: ["auto", "visible", "hidden"],
          enumDescriptions: [
            nls.localize("scrollbar.horizontal.auto", "The horizontal scrollbar will be visible only when necessary."),
            nls.localize("scrollbar.horizontal.visible", "The horizontal scrollbar will always be visible."),
            nls.localize("scrollbar.horizontal.fit", "The horizontal scrollbar will always be hidden.")
          ],
          default: "auto",
          description: nls.localize("scrollbar.horizontal", "Controls the visibility of the horizontal scrollbar.")
        },
        "editor.scrollbar.verticalScrollbarSize": {
          type: "number",
          default: defaults.verticalScrollbarSize,
          description: nls.localize("scrollbar.verticalScrollbarSize", "The width of the vertical scrollbar.")
        },
        "editor.scrollbar.horizontalScrollbarSize": {
          type: "number",
          default: defaults.horizontalScrollbarSize,
          description: nls.localize("scrollbar.horizontalScrollbarSize", "The height of the horizontal scrollbar.")
        },
        "editor.scrollbar.scrollByPage": {
          type: "boolean",
          default: defaults.scrollByPage,
          description: nls.localize("scrollbar.scrollByPage", "Controls whether clicks scroll by page or jump to click position.")
        },
        "editor.scrollbar.ignoreHorizontalScrollbarInContentHeight": {
          type: "boolean",
          default: defaults.ignoreHorizontalScrollbarInContentHeight,
          description: nls.localize("scrollbar.ignoreHorizontalScrollbarInContentHeight", "When set, the horizontal scrollbar will not increase the size of the editor's content.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    const horizontalScrollbarSize = EditorIntOption.clampedInt(input.horizontalScrollbarSize, this.defaultValue.horizontalScrollbarSize, 0, 1e3);
    const verticalScrollbarSize = EditorIntOption.clampedInt(input.verticalScrollbarSize, this.defaultValue.verticalScrollbarSize, 0, 1e3);
    return {
      arrowSize: EditorIntOption.clampedInt(input.arrowSize, this.defaultValue.arrowSize, 0, 1e3),
      vertical: _scrollbarVisibilityFromString(input.vertical, this.defaultValue.vertical),
      horizontal: _scrollbarVisibilityFromString(input.horizontal, this.defaultValue.horizontal),
      useShadows: boolean(input.useShadows, this.defaultValue.useShadows),
      verticalHasArrows: boolean(input.verticalHasArrows, this.defaultValue.verticalHasArrows),
      horizontalHasArrows: boolean(input.horizontalHasArrows, this.defaultValue.horizontalHasArrows),
      handleMouseWheel: boolean(input.handleMouseWheel, this.defaultValue.handleMouseWheel),
      alwaysConsumeMouseWheel: boolean(input.alwaysConsumeMouseWheel, this.defaultValue.alwaysConsumeMouseWheel),
      horizontalScrollbarSize,
      horizontalSliderSize: EditorIntOption.clampedInt(input.horizontalSliderSize, horizontalScrollbarSize, 0, 1e3),
      verticalScrollbarSize,
      verticalSliderSize: EditorIntOption.clampedInt(input.verticalSliderSize, verticalScrollbarSize, 0, 1e3),
      scrollByPage: boolean(input.scrollByPage, this.defaultValue.scrollByPage),
      ignoreHorizontalScrollbarInContentHeight: boolean(input.ignoreHorizontalScrollbarInContentHeight, this.defaultValue.ignoreHorizontalScrollbarInContentHeight)
    };
  }
}
const inUntrustedWorkspace = "inUntrustedWorkspace";
const unicodeHighlightConfigKeys = {
  allowedCharacters: "editor.unicodeHighlight.allowedCharacters",
  invisibleCharacters: "editor.unicodeHighlight.invisibleCharacters",
  nonBasicASCII: "editor.unicodeHighlight.nonBasicASCII",
  ambiguousCharacters: "editor.unicodeHighlight.ambiguousCharacters",
  includeComments: "editor.unicodeHighlight.includeComments",
  includeStrings: "editor.unicodeHighlight.includeStrings",
  allowedLocales: "editor.unicodeHighlight.allowedLocales"
};
class UnicodeHighlight extends BaseEditorOption {
  constructor() {
    const defaults = {
      nonBasicASCII: inUntrustedWorkspace,
      invisibleCharacters: true,
      ambiguousCharacters: true,
      includeComments: inUntrustedWorkspace,
      includeStrings: true,
      allowedCharacters: {},
      allowedLocales: { _os: true, _vscode: true }
    };
    super(
      142 /* unicodeHighlighting */,
      "unicodeHighlight",
      defaults,
      {
        [unicodeHighlightConfigKeys.nonBasicASCII]: {
          restricted: true,
          type: ["boolean", "string"],
          enum: [true, false, inUntrustedWorkspace],
          default: defaults.nonBasicASCII,
          description: nls.localize("unicodeHighlight.nonBasicASCII", "Controls whether all non-basic ASCII characters are highlighted. Only characters between U+0020 and U+007E, tab, line-feed and carriage-return are considered basic ASCII.")
        },
        [unicodeHighlightConfigKeys.invisibleCharacters]: {
          restricted: true,
          type: "boolean",
          default: defaults.invisibleCharacters,
          description: nls.localize("unicodeHighlight.invisibleCharacters", "Controls whether characters that just reserve space or have no width at all are highlighted.")
        },
        [unicodeHighlightConfigKeys.ambiguousCharacters]: {
          restricted: true,
          type: "boolean",
          default: defaults.ambiguousCharacters,
          description: nls.localize("unicodeHighlight.ambiguousCharacters", "Controls whether characters are highlighted that can be confused with basic ASCII characters, except those that are common in the current user locale.")
        },
        [unicodeHighlightConfigKeys.includeComments]: {
          restricted: true,
          type: ["boolean", "string"],
          enum: [true, false, inUntrustedWorkspace],
          default: defaults.includeComments,
          description: nls.localize("unicodeHighlight.includeComments", "Controls whether characters in comments should also be subject to Unicode highlighting.")
        },
        [unicodeHighlightConfigKeys.includeStrings]: {
          restricted: true,
          type: ["boolean", "string"],
          enum: [true, false, inUntrustedWorkspace],
          default: defaults.includeStrings,
          description: nls.localize("unicodeHighlight.includeStrings", "Controls whether characters in strings should also be subject to Unicode highlighting.")
        },
        [unicodeHighlightConfigKeys.allowedCharacters]: {
          restricted: true,
          type: "object",
          default: defaults.allowedCharacters,
          description: nls.localize("unicodeHighlight.allowedCharacters", "Defines allowed characters that are not being highlighted."),
          additionalProperties: {
            type: "boolean"
          }
        },
        [unicodeHighlightConfigKeys.allowedLocales]: {
          restricted: true,
          type: "object",
          additionalProperties: {
            type: "boolean"
          },
          default: defaults.allowedLocales,
          description: nls.localize("unicodeHighlight.allowedLocales", "Unicode characters that are common in allowed locales are not being highlighted.")
        }
      }
    );
  }
  applyUpdate(value, update) {
    let didChange = false;
    if (update.allowedCharacters && value) {
      if (!objects.equals(value.allowedCharacters, update.allowedCharacters)) {
        value = { ...value, allowedCharacters: update.allowedCharacters };
        didChange = true;
      }
    }
    if (update.allowedLocales && value) {
      if (!objects.equals(value.allowedLocales, update.allowedLocales)) {
        value = { ...value, allowedLocales: update.allowedLocales };
        didChange = true;
      }
    }
    const result = super.applyUpdate(value, update);
    if (didChange) {
      return new ApplyUpdateResult(result.newValue, true);
    }
    return result;
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      nonBasicASCII: primitiveSet(input.nonBasicASCII, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
      invisibleCharacters: boolean(input.invisibleCharacters, this.defaultValue.invisibleCharacters),
      ambiguousCharacters: boolean(input.ambiguousCharacters, this.defaultValue.ambiguousCharacters),
      includeComments: primitiveSet(input.includeComments, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
      includeStrings: primitiveSet(input.includeStrings, inUntrustedWorkspace, [true, false, inUntrustedWorkspace]),
      allowedCharacters: this.validateBooleanMap(input.allowedCharacters, this.defaultValue.allowedCharacters),
      allowedLocales: this.validateBooleanMap(input.allowedLocales, this.defaultValue.allowedLocales)
    };
  }
  validateBooleanMap(map, defaultValue) {
    if (typeof map !== "object" || !map) {
      return defaultValue;
    }
    const result = {};
    for (const [key, value] of Object.entries(map)) {
      if (value === true) {
        result[key] = true;
      }
    }
    return result;
  }
}
class InlineEditorSuggest extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: true,
      mode: "subwordSmart",
      showToolbar: "onHover",
      suppressSuggestions: false,
      keepOnBlur: false,
      fontFamily: "default",
      syntaxHighlightingEnabled: true,
      minShowDelay: 0,
      suppressInSnippetMode: true,
      edits: {
        enabled: true,
        showCollapsed: false,
        renderSideBySide: "auto",
        allowCodeShifting: "always",
        showLongDistanceHint: true,
        longDistanceHintContextLineCount: 0
      },
      triggerCommandOnProviderChange: false,
      experimental: {
        suppressInlineSuggestions: "",
        showOnSuggestConflict: "never",
        emptyResponseInformation: true
      }
    };
    super(
      71 /* inlineSuggest */,
      "inlineSuggest",
      defaults,
      {
        "editor.inlineSuggest.enabled": {
          type: "boolean",
          default: defaults.enabled,
          description: nls.localize("inlineSuggest.enabled", "Controls whether to automatically show inline suggestions in the editor.")
        },
        "editor.inlineSuggest.showToolbar": {
          type: "string",
          default: defaults.showToolbar,
          enum: ["always", "onHover", "never"],
          enumDescriptions: [
            nls.localize("inlineSuggest.showToolbar.always", "Show the inline suggestion toolbar whenever an inline suggestion is shown."),
            nls.localize("inlineSuggest.showToolbar.onHover", "Show the inline suggestion toolbar when hovering over an inline suggestion."),
            nls.localize("inlineSuggest.showToolbar.never", "Never show the inline suggestion toolbar.")
          ],
          description: nls.localize("inlineSuggest.showToolbar", "Controls when to show the inline suggestion toolbar.")
        },
        "editor.inlineSuggest.syntaxHighlightingEnabled": {
          type: "boolean",
          default: defaults.syntaxHighlightingEnabled,
          description: nls.localize("inlineSuggest.syntaxHighlightingEnabled", "Controls whether to show syntax highlighting for inline suggestions in the editor.")
        },
        "editor.inlineSuggest.suppressSuggestions": {
          type: "boolean",
          default: defaults.suppressSuggestions,
          description: nls.localize("inlineSuggest.suppressSuggestions", "Controls how inline suggestions interact with the suggest widget. If enabled, the suggest widget is not shown automatically when inline suggestions are available.")
        },
        "editor.inlineSuggest.suppressInSnippetMode": {
          type: "boolean",
          default: defaults.suppressInSnippetMode,
          description: nls.localize("inlineSuggest.suppressInSnippetMode", "Controls whether inline suggestions are suppressed when in snippet mode.")
        },
        "editor.inlineSuggest.minShowDelay": {
          type: "number",
          default: 0,
          minimum: 0,
          maximum: 1e4,
          description: nls.localize("inlineSuggest.minShowDelay", "Controls the minimal delay in milliseconds after which inline suggestions are shown after typing.")
        },
        "editor.inlineSuggest.experimental.suppressInlineSuggestions": {
          type: "string",
          default: defaults.experimental.suppressInlineSuggestions,
          tags: ["experimental"],
          description: nls.localize("inlineSuggest.suppressInlineSuggestions", "Suppresses inline completions for specified extension IDs -- comma separated."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.experimental.emptyResponseInformation": {
          type: "boolean",
          default: defaults.experimental.emptyResponseInformation,
          tags: ["experimental"],
          description: nls.localize("inlineSuggest.emptyResponseInformation", "Controls whether to send request information from the inline suggestion provider."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.triggerCommandOnProviderChange": {
          type: "boolean",
          default: defaults.triggerCommandOnProviderChange,
          tags: ["experimental"],
          description: nls.localize("inlineSuggest.triggerCommandOnProviderChange", "Controls whether to trigger a command when the inline suggestion provider changes."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.experimental.showOnSuggestConflict": {
          type: "string",
          default: defaults.experimental.showOnSuggestConflict,
          tags: ["experimental"],
          enum: ["always", "never", "whenSuggestListIsIncomplete"],
          description: nls.localize("inlineSuggest.showOnSuggestConflict", "Controls whether to show inline suggestions when there is a suggest conflict."),
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.fontFamily": {
          type: "string",
          default: defaults.fontFamily,
          description: nls.localize("inlineSuggest.fontFamily", "Controls the font family of the inline suggestions.")
        },
        "editor.inlineSuggest.edits.allowCodeShifting": {
          type: "string",
          default: defaults.edits.allowCodeShifting,
          description: nls.localize("inlineSuggest.edits.allowCodeShifting", "Controls whether showing a suggestion will shift the code to make space for the suggestion inline."),
          enum: ["always", "horizontal", "never"],
          tags: ["nextEditSuggestions"]
        },
        "editor.inlineSuggest.edits.showLongDistanceHint": {
          type: "boolean",
          default: defaults.edits.showLongDistanceHint,
          description: nls.localize("inlineSuggest.edits.showLongDistanceHint", "Controls whether long distance inline suggestions are shown."),
          tags: ["nextEditSuggestions", "experimental"]
        },
        "editor.inlineSuggest.edits.longDistanceHintContextLineCount": {
          type: "number",
          default: defaults.edits.longDistanceHintContextLineCount,
          minimum: 0,
          maximum: 10,
          description: nls.localize("inlineSuggest.edits.longDistanceHintContextLineCount", "Controls how many lines of surrounding context are shown above and below the target line in the long distance inline suggestion preview. Set to 0 to only show the target line."),
          tags: ["nextEditSuggestions", "experimental"],
          experiment: {
            mode: "auto"
          }
        },
        "editor.inlineSuggest.edits.renderSideBySide": {
          type: "string",
          default: defaults.edits.renderSideBySide,
          description: nls.localize("inlineSuggest.edits.renderSideBySide", "Controls whether larger suggestions can be shown side by side."),
          enum: ["auto", "never"],
          enumDescriptions: [
            nls.localize("editor.inlineSuggest.edits.renderSideBySide.auto", "Larger suggestions will show side by side if there is enough space, otherwise they will be shown below."),
            nls.localize("editor.inlineSuggest.edits.renderSideBySide.never", "Larger suggestions are never shown side by side and will always be shown below.")
          ],
          tags: ["nextEditSuggestions"]
        },
        "editor.inlineSuggest.edits.showCollapsed": {
          type: "boolean",
          default: defaults.edits.showCollapsed,
          description: nls.localize("inlineSuggest.edits.showCollapsed", "Controls whether the suggestion will show as collapsed until jumping to it."),
          tags: ["nextEditSuggestions"]
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      mode: stringSet(input.mode, this.defaultValue.mode, ["prefix", "subword", "subwordSmart"]),
      showToolbar: stringSet(input.showToolbar, this.defaultValue.showToolbar, ["always", "onHover", "never"]),
      suppressSuggestions: boolean(input.suppressSuggestions, this.defaultValue.suppressSuggestions),
      keepOnBlur: boolean(input.keepOnBlur, this.defaultValue.keepOnBlur),
      fontFamily: EditorStringOption.string(input.fontFamily, this.defaultValue.fontFamily),
      syntaxHighlightingEnabled: boolean(input.syntaxHighlightingEnabled, this.defaultValue.syntaxHighlightingEnabled),
      minShowDelay: EditorIntOption.clampedInt(input.minShowDelay, 0, 0, 1e4),
      suppressInSnippetMode: boolean(input.suppressInSnippetMode, this.defaultValue.suppressInSnippetMode),
      edits: this._validateEdits(input.edits),
      triggerCommandOnProviderChange: boolean(input.triggerCommandOnProviderChange, this.defaultValue.triggerCommandOnProviderChange),
      experimental: this._validateExperimental(input.experimental)
    };
  }
  _validateEdits(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue.edits;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.edits.enabled),
      showCollapsed: boolean(input.showCollapsed, this.defaultValue.edits.showCollapsed),
      allowCodeShifting: stringSet(input.allowCodeShifting, this.defaultValue.edits.allowCodeShifting, ["always", "horizontal", "never"]),
      showLongDistanceHint: boolean(input.showLongDistanceHint, this.defaultValue.edits.showLongDistanceHint),
      longDistanceHintContextLineCount: EditorIntOption.clampedInt(input.longDistanceHintContextLineCount, this.defaultValue.edits.longDistanceHintContextLineCount, 0, 10),
      renderSideBySide: stringSet(input.renderSideBySide, this.defaultValue.edits.renderSideBySide, ["never", "auto"])
    };
  }
  _validateExperimental(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue.experimental;
    }
    const input = _input;
    return {
      suppressInlineSuggestions: EditorStringOption.string(input.suppressInlineSuggestions, this.defaultValue.experimental.suppressInlineSuggestions),
      showOnSuggestConflict: stringSet(input.showOnSuggestConflict, this.defaultValue.experimental.showOnSuggestConflict, ["always", "never", "whenSuggestListIsIncomplete"]),
      emptyResponseInformation: boolean(input.emptyResponseInformation, this.defaultValue.experimental.emptyResponseInformation)
    };
  }
}
class BracketPairColorization extends BaseEditorOption {
  constructor() {
    const defaults = {
      enabled: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions.enabled,
      independentColorPoolPerBracketType: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions.independentColorPoolPerBracketType
    };
    super(
      21 /* bracketPairColorization */,
      "bracketPairColorization",
      defaults,
      {
        "editor.bracketPairColorization.enabled": {
          type: "boolean",
          default: defaults.enabled,
          markdownDescription: nls.localize("bracketPairColorization.enabled", "Controls whether bracket pair colorization is enabled or not. Use {0} to override the bracket highlight colors.", "`#workbench.colorCustomizations#`")
        },
        "editor.bracketPairColorization.independentColorPoolPerBracketType": {
          type: "boolean",
          default: defaults.independentColorPoolPerBracketType,
          description: nls.localize("bracketPairColorization.independentColorPoolPerBracketType", "Controls whether each bracket type has its own independent color pool.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      independentColorPoolPerBracketType: boolean(input.independentColorPoolPerBracketType, this.defaultValue.independentColorPoolPerBracketType)
    };
  }
}
class GuideOptions extends BaseEditorOption {
  constructor() {
    const defaults = {
      bracketPairs: false,
      bracketPairsHorizontal: "active",
      highlightActiveBracketPair: true,
      indentation: true,
      highlightActiveIndentation: true
    };
    super(
      22 /* guides */,
      "guides",
      defaults,
      {
        "editor.guides.bracketPairs": {
          type: ["boolean", "string"],
          enum: [true, "active", false],
          enumDescriptions: [
            nls.localize("editor.guides.bracketPairs.true", "Enables bracket pair guides."),
            nls.localize("editor.guides.bracketPairs.active", "Enables bracket pair guides only for the active bracket pair."),
            nls.localize("editor.guides.bracketPairs.false", "Disables bracket pair guides.")
          ],
          default: defaults.bracketPairs,
          description: nls.localize("editor.guides.bracketPairs", "Controls whether bracket pair guides are enabled or not.")
        },
        "editor.guides.bracketPairsHorizontal": {
          type: ["boolean", "string"],
          enum: [true, "active", false],
          enumDescriptions: [
            nls.localize("editor.guides.bracketPairsHorizontal.true", "Enables horizontal guides as addition to vertical bracket pair guides."),
            nls.localize("editor.guides.bracketPairsHorizontal.active", "Enables horizontal guides only for the active bracket pair."),
            nls.localize("editor.guides.bracketPairsHorizontal.false", "Disables horizontal bracket pair guides.")
          ],
          default: defaults.bracketPairsHorizontal,
          description: nls.localize("editor.guides.bracketPairsHorizontal", "Controls whether horizontal bracket pair guides are enabled or not.")
        },
        "editor.guides.highlightActiveBracketPair": {
          type: "boolean",
          default: defaults.highlightActiveBracketPair,
          description: nls.localize("editor.guides.highlightActiveBracketPair", "Controls whether the editor should highlight the active bracket pair.")
        },
        "editor.guides.indentation": {
          type: "boolean",
          default: defaults.indentation,
          description: nls.localize("editor.guides.indentation", "Controls whether the editor should render indent guides.")
        },
        "editor.guides.highlightActiveIndentation": {
          type: ["boolean", "string"],
          enum: [true, "always", false],
          enumDescriptions: [
            nls.localize("editor.guides.highlightActiveIndentation.true", "Highlights the active indent guide."),
            nls.localize("editor.guides.highlightActiveIndentation.always", "Highlights the active indent guide even if bracket guides are highlighted."),
            nls.localize("editor.guides.highlightActiveIndentation.false", "Do not highlight the active indent guide.")
          ],
          default: defaults.highlightActiveIndentation,
          description: nls.localize("editor.guides.highlightActiveIndentation", "Controls whether the editor should highlight the active indent guide.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      bracketPairs: primitiveSet(input.bracketPairs, this.defaultValue.bracketPairs, [true, false, "active"]),
      bracketPairsHorizontal: primitiveSet(input.bracketPairsHorizontal, this.defaultValue.bracketPairsHorizontal, [true, false, "active"]),
      highlightActiveBracketPair: boolean(input.highlightActiveBracketPair, this.defaultValue.highlightActiveBracketPair),
      indentation: boolean(input.indentation, this.defaultValue.indentation),
      highlightActiveIndentation: primitiveSet(input.highlightActiveIndentation, this.defaultValue.highlightActiveIndentation, [true, false, "always"])
    };
  }
}
function primitiveSet(value, defaultValue, allowedValues) {
  const idx = allowedValues.indexOf(value);
  if (idx === -1) {
    return defaultValue;
  }
  return allowedValues[idx];
}
class EditorSuggest extends BaseEditorOption {
  constructor() {
    const defaults = {
      insertMode: "insert",
      filterGraceful: true,
      snippetsPreventQuickSuggestions: false,
      localityBonus: false,
      shareSuggestSelections: false,
      selectionMode: "always",
      showIcons: true,
      showStatusBar: false,
      preview: false,
      previewMode: "subwordSmart",
      showInlineDetails: true,
      fitWidthToDetails: false,
      showMethods: true,
      showFunctions: true,
      showConstructors: true,
      showDeprecated: true,
      matchOnWordStartOnly: true,
      showFields: true,
      showVariables: true,
      showClasses: true,
      showStructs: true,
      showInterfaces: true,
      showModules: true,
      showProperties: true,
      showEvents: true,
      showOperators: true,
      showUnits: true,
      showValues: true,
      showConstants: true,
      showEnums: true,
      showEnumMembers: true,
      showKeywords: true,
      showWords: true,
      showColors: true,
      showFiles: true,
      showReferences: true,
      showFolders: true,
      showTypeParameters: true,
      showSnippets: true,
      showUsers: true,
      showIssues: true
    };
    super(
      134 /* suggest */,
      "suggest",
      defaults,
      {
        "editor.suggest.insertMode": {
          type: "string",
          enum: ["insert", "replace"],
          enumDescriptions: [
            nls.localize("suggest.insertMode.insert", "Insert suggestion without overwriting text right of the cursor."),
            nls.localize("suggest.insertMode.replace", "Insert suggestion and overwrite text right of the cursor.")
          ],
          default: defaults.insertMode,
          description: nls.localize("suggest.insertMode", "Controls whether words are overwritten when accepting completions. Note that this depends on extensions opting into this feature.")
        },
        "editor.suggest.filterGraceful": {
          type: "boolean",
          default: defaults.filterGraceful,
          description: nls.localize("suggest.filterGraceful", "Controls whether filtering and sorting suggestions accounts for small typos.")
        },
        "editor.suggest.localityBonus": {
          type: "boolean",
          default: defaults.localityBonus,
          description: nls.localize("suggest.localityBonus", "Controls whether sorting favors words that appear close to the cursor.")
        },
        "editor.suggest.shareSuggestSelections": {
          type: "boolean",
          default: defaults.shareSuggestSelections,
          markdownDescription: nls.localize("suggest.shareSuggestSelections", "Controls whether remembered suggestion selections are shared between multiple workspaces and windows (needs `#editor.suggestSelection#`).")
        },
        "editor.suggest.selectionMode": {
          type: "string",
          enum: ["always", "never", "whenTriggerCharacter", "whenQuickSuggestion"],
          enumDescriptions: [
            nls.localize("suggest.insertMode.always", "Always select a suggestion when automatically triggering IntelliSense."),
            nls.localize("suggest.insertMode.never", "Never select a suggestion when automatically triggering IntelliSense."),
            nls.localize("suggest.insertMode.whenTriggerCharacter", "Select a suggestion only when triggering IntelliSense from a trigger character."),
            nls.localize("suggest.insertMode.whenQuickSuggestion", "Select a suggestion only when triggering IntelliSense as you type.")
          ],
          default: defaults.selectionMode,
          markdownDescription: nls.localize("suggest.selectionMode", "Controls whether a suggestion is selected when the widget shows. Note that this only applies to automatically triggered suggestions ({0} and {1}) and that a suggestion is always selected when explicitly invoked, e.g via `Ctrl+Space`.", "`#editor.quickSuggestions#`", "`#editor.suggestOnTriggerCharacters#`")
        },
        "editor.suggest.snippetsPreventQuickSuggestions": {
          type: "boolean",
          default: defaults.snippetsPreventQuickSuggestions,
          description: nls.localize("suggest.snippetsPreventQuickSuggestions", "Controls whether an active snippet prevents quick suggestions.")
        },
        "editor.suggest.showIcons": {
          type: "boolean",
          default: defaults.showIcons,
          description: nls.localize("suggest.showIcons", "Controls whether to show or hide icons in suggestions.")
        },
        "editor.suggest.showStatusBar": {
          type: "boolean",
          default: defaults.showStatusBar,
          description: nls.localize("suggest.showStatusBar", "Controls the visibility of the status bar at the bottom of the suggest widget.")
        },
        "editor.suggest.preview": {
          type: "boolean",
          default: defaults.preview,
          description: nls.localize("suggest.preview", "Controls whether to preview the suggestion outcome in the editor.")
        },
        "editor.suggest.showInlineDetails": {
          type: "boolean",
          default: defaults.showInlineDetails,
          description: nls.localize("suggest.showInlineDetails", "Controls whether suggest details show inline with the label or only in the details widget.")
        },
        "editor.suggest.filteredTypes": {
          type: "object",
          deprecationMessage: nls.localize("deprecated", "This setting is deprecated, please use separate settings like 'editor.suggest.showKeywords' or 'editor.suggest.showSnippets' instead.")
        },
        "editor.suggest.showMethods": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showMethods", "When enabled IntelliSense shows `method`-suggestions.")
        },
        "editor.suggest.showFunctions": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFunctions", "When enabled IntelliSense shows `function`-suggestions.")
        },
        "editor.suggest.showConstructors": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showConstructors", "When enabled IntelliSense shows `constructor`-suggestions.")
        },
        "editor.suggest.showDeprecated": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showDeprecated", "When enabled IntelliSense shows `deprecated`-suggestions.")
        },
        "editor.suggest.matchOnWordStartOnly": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.matchOnWordStartOnly", "When enabled IntelliSense filtering requires that the first character matches on a word start. For example, `c` on `Console` or `WebContext` but _not_ on `description`. When disabled IntelliSense will show more results but still sorts them by match quality.")
        },
        "editor.suggest.showFields": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFields", "When enabled IntelliSense shows `field`-suggestions.")
        },
        "editor.suggest.showVariables": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showVariables", "When enabled IntelliSense shows `variable`-suggestions.")
        },
        "editor.suggest.showClasses": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showClasss", "When enabled IntelliSense shows `class`-suggestions.")
        },
        "editor.suggest.showStructs": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showStructs", "When enabled IntelliSense shows `struct`-suggestions.")
        },
        "editor.suggest.showInterfaces": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showInterfaces", "When enabled IntelliSense shows `interface`-suggestions.")
        },
        "editor.suggest.showModules": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showModules", "When enabled IntelliSense shows `module`-suggestions.")
        },
        "editor.suggest.showProperties": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showPropertys", "When enabled IntelliSense shows `property`-suggestions.")
        },
        "editor.suggest.showEvents": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showEvents", "When enabled IntelliSense shows `event`-suggestions.")
        },
        "editor.suggest.showOperators": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showOperators", "When enabled IntelliSense shows `operator`-suggestions.")
        },
        "editor.suggest.showUnits": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showUnits", "When enabled IntelliSense shows `unit`-suggestions.")
        },
        "editor.suggest.showValues": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showValues", "When enabled IntelliSense shows `value`-suggestions.")
        },
        "editor.suggest.showConstants": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showConstants", "When enabled IntelliSense shows `constant`-suggestions.")
        },
        "editor.suggest.showEnums": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showEnums", "When enabled IntelliSense shows `enum`-suggestions.")
        },
        "editor.suggest.showEnumMembers": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showEnumMembers", "When enabled IntelliSense shows `enumMember`-suggestions.")
        },
        "editor.suggest.showKeywords": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showKeywords", "When enabled IntelliSense shows `keyword`-suggestions.")
        },
        "editor.suggest.showWords": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showTexts", "When enabled IntelliSense shows `text`-suggestions.")
        },
        "editor.suggest.showColors": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showColors", "When enabled IntelliSense shows `color`-suggestions.")
        },
        "editor.suggest.showFiles": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFiles", "When enabled IntelliSense shows `file`-suggestions.")
        },
        "editor.suggest.showReferences": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showReferences", "When enabled IntelliSense shows `reference`-suggestions.")
        },
        "editor.suggest.showCustomcolors": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showCustomcolors", "When enabled IntelliSense shows `customcolor`-suggestions.")
        },
        "editor.suggest.showFolders": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showFolders", "When enabled IntelliSense shows `folder`-suggestions.")
        },
        "editor.suggest.showTypeParameters": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showTypeParameters", "When enabled IntelliSense shows `typeParameter`-suggestions.")
        },
        "editor.suggest.showSnippets": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showSnippets", "When enabled IntelliSense shows `snippet`-suggestions.")
        },
        "editor.suggest.showUsers": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showUsers", "When enabled IntelliSense shows `user`-suggestions.")
        },
        "editor.suggest.showIssues": {
          type: "boolean",
          default: true,
          markdownDescription: nls.localize("editor.suggest.showIssues", "When enabled IntelliSense shows `issues`-suggestions.")
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      insertMode: stringSet(input.insertMode, this.defaultValue.insertMode, ["insert", "replace"]),
      filterGraceful: boolean(input.filterGraceful, this.defaultValue.filterGraceful),
      snippetsPreventQuickSuggestions: boolean(input.snippetsPreventQuickSuggestions, this.defaultValue.filterGraceful),
      localityBonus: boolean(input.localityBonus, this.defaultValue.localityBonus),
      shareSuggestSelections: boolean(input.shareSuggestSelections, this.defaultValue.shareSuggestSelections),
      selectionMode: stringSet(input.selectionMode, this.defaultValue.selectionMode, ["always", "never", "whenQuickSuggestion", "whenTriggerCharacter"]),
      showIcons: boolean(input.showIcons, this.defaultValue.showIcons),
      showStatusBar: boolean(input.showStatusBar, this.defaultValue.showStatusBar),
      preview: boolean(input.preview, this.defaultValue.preview),
      previewMode: stringSet(input.previewMode, this.defaultValue.previewMode, ["prefix", "subword", "subwordSmart"]),
      showInlineDetails: boolean(input.showInlineDetails, this.defaultValue.showInlineDetails),
      fitWidthToDetails: boolean(input.fitWidthToDetails, this.defaultValue.fitWidthToDetails),
      showMethods: boolean(input.showMethods, this.defaultValue.showMethods),
      showFunctions: boolean(input.showFunctions, this.defaultValue.showFunctions),
      showConstructors: boolean(input.showConstructors, this.defaultValue.showConstructors),
      showDeprecated: boolean(input.showDeprecated, this.defaultValue.showDeprecated),
      matchOnWordStartOnly: boolean(input.matchOnWordStartOnly, this.defaultValue.matchOnWordStartOnly),
      showFields: boolean(input.showFields, this.defaultValue.showFields),
      showVariables: boolean(input.showVariables, this.defaultValue.showVariables),
      showClasses: boolean(input.showClasses, this.defaultValue.showClasses),
      showStructs: boolean(input.showStructs, this.defaultValue.showStructs),
      showInterfaces: boolean(input.showInterfaces, this.defaultValue.showInterfaces),
      showModules: boolean(input.showModules, this.defaultValue.showModules),
      showProperties: boolean(input.showProperties, this.defaultValue.showProperties),
      showEvents: boolean(input.showEvents, this.defaultValue.showEvents),
      showOperators: boolean(input.showOperators, this.defaultValue.showOperators),
      showUnits: boolean(input.showUnits, this.defaultValue.showUnits),
      showValues: boolean(input.showValues, this.defaultValue.showValues),
      showConstants: boolean(input.showConstants, this.defaultValue.showConstants),
      showEnums: boolean(input.showEnums, this.defaultValue.showEnums),
      showEnumMembers: boolean(input.showEnumMembers, this.defaultValue.showEnumMembers),
      showKeywords: boolean(input.showKeywords, this.defaultValue.showKeywords),
      showWords: boolean(input.showWords, this.defaultValue.showWords),
      showColors: boolean(input.showColors, this.defaultValue.showColors),
      showFiles: boolean(input.showFiles, this.defaultValue.showFiles),
      showReferences: boolean(input.showReferences, this.defaultValue.showReferences),
      showFolders: boolean(input.showFolders, this.defaultValue.showFolders),
      showTypeParameters: boolean(input.showTypeParameters, this.defaultValue.showTypeParameters),
      showSnippets: boolean(input.showSnippets, this.defaultValue.showSnippets),
      showUsers: boolean(input.showUsers, this.defaultValue.showUsers),
      showIssues: boolean(input.showIssues, this.defaultValue.showIssues)
    };
  }
}
class SmartSelect extends BaseEditorOption {
  constructor() {
    super(
      129 /* smartSelect */,
      "smartSelect",
      {
        selectLeadingAndTrailingWhitespace: true,
        selectSubwords: true
      },
      {
        "editor.smartSelect.selectLeadingAndTrailingWhitespace": {
          description: nls.localize("selectLeadingAndTrailingWhitespace", "Whether leading and trailing whitespace should always be selected."),
          default: true,
          type: "boolean"
        },
        "editor.smartSelect.selectSubwords": {
          description: nls.localize("selectSubwords", "Whether subwords (like 'foo' in 'fooBar' or 'foo_bar') should be selected."),
          default: true,
          type: "boolean"
        }
      }
    );
  }
  validate(input) {
    if (!input || typeof input !== "object") {
      return this.defaultValue;
    }
    return {
      selectLeadingAndTrailingWhitespace: boolean(input.selectLeadingAndTrailingWhitespace, this.defaultValue.selectLeadingAndTrailingWhitespace),
      selectSubwords: boolean(input.selectSubwords, this.defaultValue.selectSubwords)
    };
  }
}
class WordSegmenterLocales extends BaseEditorOption {
  constructor() {
    const defaults = [];
    super(
      147 /* wordSegmenterLocales */,
      "wordSegmenterLocales",
      defaults,
      {
        anyOf: [
          {
            type: "string"
          },
          {
            type: "array",
            items: {
              type: "string"
            }
          }
        ],
        description: nls.localize("wordSegmenterLocales", "Locales to be used for word segmentation when doing word related navigations or operations. Specify the BCP 47 language tag of the word you wish to recognize (e.g., ja, zh-CN, zh-Hant-TW, etc.)."),
        type: "array",
        items: {
          type: "string"
        },
        default: defaults
      }
    );
  }
  validate(input) {
    if (typeof input === "string") {
      input = [input];
    }
    if (Array.isArray(input)) {
      const validLocales = [];
      for (const locale of input) {
        if (typeof locale === "string") {
          try {
            if (Intl.Segmenter.supportedLocalesOf(locale).length > 0) {
              validLocales.push(locale);
            }
          } catch {
          }
        }
      }
      return validLocales;
    }
    return this.defaultValue;
  }
}
var WrappingIndent = /* @__PURE__ */ ((WrappingIndent2) => {
  WrappingIndent2[WrappingIndent2["None"] = 0] = "None";
  WrappingIndent2[WrappingIndent2["Same"] = 1] = "Same";
  WrappingIndent2[WrappingIndent2["Indent"] = 2] = "Indent";
  WrappingIndent2[WrappingIndent2["DeepIndent"] = 3] = "DeepIndent";
  return WrappingIndent2;
})(WrappingIndent || {});
class WrappingIndentOption extends BaseEditorOption {
  constructor() {
    super(
      155 /* wrappingIndent */,
      "wrappingIndent",
      1 /* Same */,
      {
        "editor.wrappingIndent": {
          type: "string",
          enum: ["none", "same", "indent", "deepIndent"],
          enumDescriptions: [
            nls.localize("wrappingIndent.none", "No indentation. Wrapped lines begin at column 1."),
            nls.localize("wrappingIndent.same", "Wrapped lines get the same indentation as the parent."),
            nls.localize("wrappingIndent.indent", "Wrapped lines get +1 indentation toward the parent."),
            nls.localize("wrappingIndent.deepIndent", "Wrapped lines get +2 indentation toward the parent.")
          ],
          description: nls.localize("wrappingIndent", "Controls the indentation of wrapped lines."),
          default: "same"
        }
      }
    );
  }
  validate(input) {
    switch (input) {
      case "none":
        return 0 /* None */;
      case "same":
        return 1 /* Same */;
      case "indent":
        return 2 /* Indent */;
      case "deepIndent":
        return 3 /* DeepIndent */;
    }
    return 1 /* Same */;
  }
  compute(env, options, value) {
    const accessibilitySupport = options.get(2 /* accessibilitySupport */);
    if (accessibilitySupport === AccessibilitySupport.Enabled) {
      return 0 /* None */;
    }
    return value;
  }
}
class EditorWrappingInfoComputer extends ComputedEditorOption {
  constructor() {
    super(166 /* wrappingInfo */, {
      isDominatedByLongLines: false,
      isWordWrapMinified: false,
      isViewportWrapping: false,
      wrappingColumn: -1
    });
  }
  compute(env, options, _) {
    const layoutInfo = options.get(165 /* layoutInfo */);
    return {
      isDominatedByLongLines: env.isDominatedByLongLines,
      isWordWrapMinified: layoutInfo.isWordWrapMinified,
      isViewportWrapping: layoutInfo.isViewportWrapping,
      wrappingColumn: layoutInfo.wrappingColumn
    };
  }
}
class EditorDropIntoEditor extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: true, showDropSelector: "afterDrop" };
    super(
      43 /* dropIntoEditor */,
      "dropIntoEditor",
      defaults,
      {
        "editor.dropIntoEditor.enabled": {
          type: "boolean",
          default: defaults.enabled,
          markdownDescription: nls.localize("dropIntoEditor.enabled", "Controls whether you can drag and drop a file into a text editor by holding down the `Shift` key (instead of opening the file in an editor).")
        },
        "editor.dropIntoEditor.showDropSelector": {
          type: "string",
          markdownDescription: nls.localize("dropIntoEditor.showDropSelector", "Controls if a widget is shown when dropping files into the editor. This widget lets you control how the file is dropped."),
          enum: [
            "afterDrop",
            "never"
          ],
          enumDescriptions: [
            nls.localize("dropIntoEditor.showDropSelector.afterDrop", "Show the drop selector widget after a file is dropped into the editor."),
            nls.localize("dropIntoEditor.showDropSelector.never", "Never show the drop selector widget. Instead the default drop provider is always used.")
          ],
          default: "afterDrop"
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      showDropSelector: stringSet(input.showDropSelector, this.defaultValue.showDropSelector, ["afterDrop", "never"])
    };
  }
}
class EditorPasteAs extends BaseEditorOption {
  constructor() {
    const defaults = { enabled: true, showPasteSelector: "afterPaste" };
    super(
      97 /* pasteAs */,
      "pasteAs",
      defaults,
      {
        "editor.pasteAs.enabled": {
          type: "boolean",
          default: defaults.enabled,
          markdownDescription: nls.localize("pasteAs.enabled", "Controls whether you can paste content in different ways.")
        },
        "editor.pasteAs.showPasteSelector": {
          type: "string",
          markdownDescription: nls.localize("pasteAs.showPasteSelector", "Controls if a widget is shown when pasting content in to the editor. This widget lets you control how the file is pasted."),
          enum: [
            "afterPaste",
            "never"
          ],
          enumDescriptions: [
            nls.localize("pasteAs.showPasteSelector.afterPaste", "Show the paste selector widget after content is pasted into the editor."),
            nls.localize("pasteAs.showPasteSelector.never", "Never show the paste selector widget. Instead the default pasting behavior is always used.")
          ],
          default: "afterPaste"
        }
      }
    );
  }
  validate(_input) {
    if (!_input || typeof _input !== "object") {
      return this.defaultValue;
    }
    const input = _input;
    return {
      enabled: boolean(input.enabled, this.defaultValue.enabled),
      showPasteSelector: stringSet(input.showPasteSelector, this.defaultValue.showPasteSelector, ["afterPaste", "never"])
    };
  }
}
const editorOptionsRegistry = [];
function register(option) {
  editorOptionsRegistry[option.id] = option;
  return option;
}
var EditorOption = /* @__PURE__ */ ((EditorOption2) => {
  EditorOption2[EditorOption2["acceptSuggestionOnCommitCharacter"] = 0] = "acceptSuggestionOnCommitCharacter";
  EditorOption2[EditorOption2["acceptSuggestionOnEnter"] = 1] = "acceptSuggestionOnEnter";
  EditorOption2[EditorOption2["accessibilitySupport"] = 2] = "accessibilitySupport";
  EditorOption2[EditorOption2["accessibilityPageSize"] = 3] = "accessibilityPageSize";
  EditorOption2[EditorOption2["allowOverflow"] = 4] = "allowOverflow";
  EditorOption2[EditorOption2["allowVariableLineHeights"] = 5] = "allowVariableLineHeights";
  EditorOption2[EditorOption2["allowVariableFonts"] = 6] = "allowVariableFonts";
  EditorOption2[EditorOption2["allowVariableFontsInAccessibilityMode"] = 7] = "allowVariableFontsInAccessibilityMode";
  EditorOption2[EditorOption2["ariaLabel"] = 8] = "ariaLabel";
  EditorOption2[EditorOption2["ariaRequired"] = 9] = "ariaRequired";
  EditorOption2[EditorOption2["autoClosingBrackets"] = 10] = "autoClosingBrackets";
  EditorOption2[EditorOption2["autoClosingComments"] = 11] = "autoClosingComments";
  EditorOption2[EditorOption2["screenReaderAnnounceInlineSuggestion"] = 12] = "screenReaderAnnounceInlineSuggestion";
  EditorOption2[EditorOption2["autoClosingDelete"] = 13] = "autoClosingDelete";
  EditorOption2[EditorOption2["autoClosingOvertype"] = 14] = "autoClosingOvertype";
  EditorOption2[EditorOption2["autoClosingQuotes"] = 15] = "autoClosingQuotes";
  EditorOption2[EditorOption2["autoIndent"] = 16] = "autoIndent";
  EditorOption2[EditorOption2["autoIndentOnPaste"] = 17] = "autoIndentOnPaste";
  EditorOption2[EditorOption2["autoIndentOnPasteWithinString"] = 18] = "autoIndentOnPasteWithinString";
  EditorOption2[EditorOption2["automaticLayout"] = 19] = "automaticLayout";
  EditorOption2[EditorOption2["autoSurround"] = 20] = "autoSurround";
  EditorOption2[EditorOption2["bracketPairColorization"] = 21] = "bracketPairColorization";
  EditorOption2[EditorOption2["guides"] = 22] = "guides";
  EditorOption2[EditorOption2["codeLens"] = 23] = "codeLens";
  EditorOption2[EditorOption2["codeLensFontFamily"] = 24] = "codeLensFontFamily";
  EditorOption2[EditorOption2["codeLensFontSize"] = 25] = "codeLensFontSize";
  EditorOption2[EditorOption2["colorDecorators"] = 26] = "colorDecorators";
  EditorOption2[EditorOption2["colorDecoratorsLimit"] = 27] = "colorDecoratorsLimit";
  EditorOption2[EditorOption2["columnSelection"] = 28] = "columnSelection";
  EditorOption2[EditorOption2["comments"] = 29] = "comments";
  EditorOption2[EditorOption2["contextmenu"] = 30] = "contextmenu";
  EditorOption2[EditorOption2["copyWithSyntaxHighlighting"] = 31] = "copyWithSyntaxHighlighting";
  EditorOption2[EditorOption2["cursorBlinking"] = 32] = "cursorBlinking";
  EditorOption2[EditorOption2["cursorSmoothCaretAnimation"] = 33] = "cursorSmoothCaretAnimation";
  EditorOption2[EditorOption2["cursorStyle"] = 34] = "cursorStyle";
  EditorOption2[EditorOption2["cursorSurroundingLines"] = 35] = "cursorSurroundingLines";
  EditorOption2[EditorOption2["cursorSurroundingLinesStyle"] = 36] = "cursorSurroundingLinesStyle";
  EditorOption2[EditorOption2["cursorWidth"] = 37] = "cursorWidth";
  EditorOption2[EditorOption2["cursorHeight"] = 38] = "cursorHeight";
  EditorOption2[EditorOption2["disableLayerHinting"] = 39] = "disableLayerHinting";
  EditorOption2[EditorOption2["disableMonospaceOptimizations"] = 40] = "disableMonospaceOptimizations";
  EditorOption2[EditorOption2["domReadOnly"] = 41] = "domReadOnly";
  EditorOption2[EditorOption2["dragAndDrop"] = 42] = "dragAndDrop";
  EditorOption2[EditorOption2["dropIntoEditor"] = 43] = "dropIntoEditor";
  EditorOption2[EditorOption2["editContext"] = 44] = "editContext";
  EditorOption2[EditorOption2["emptySelectionClipboard"] = 45] = "emptySelectionClipboard";
  EditorOption2[EditorOption2["experimentalGpuAcceleration"] = 46] = "experimentalGpuAcceleration";
  EditorOption2[EditorOption2["experimentalWhitespaceRendering"] = 47] = "experimentalWhitespaceRendering";
  EditorOption2[EditorOption2["extraEditorClassName"] = 48] = "extraEditorClassName";
  EditorOption2[EditorOption2["fastScrollSensitivity"] = 49] = "fastScrollSensitivity";
  EditorOption2[EditorOption2["find"] = 50] = "find";
  EditorOption2[EditorOption2["fixedOverflowWidgets"] = 51] = "fixedOverflowWidgets";
  EditorOption2[EditorOption2["folding"] = 52] = "folding";
  EditorOption2[EditorOption2["foldingStrategy"] = 53] = "foldingStrategy";
  EditorOption2[EditorOption2["foldingHighlight"] = 54] = "foldingHighlight";
  EditorOption2[EditorOption2["foldingImportsByDefault"] = 55] = "foldingImportsByDefault";
  EditorOption2[EditorOption2["foldingMaximumRegions"] = 56] = "foldingMaximumRegions";
  EditorOption2[EditorOption2["unfoldOnClickAfterEndOfLine"] = 57] = "unfoldOnClickAfterEndOfLine";
  EditorOption2[EditorOption2["fontFamily"] = 58] = "fontFamily";
  EditorOption2[EditorOption2["fontInfo"] = 59] = "fontInfo";
  EditorOption2[EditorOption2["fontLigatures"] = 60] = "fontLigatures";
  EditorOption2[EditorOption2["fontSize"] = 61] = "fontSize";
  EditorOption2[EditorOption2["fontWeight"] = 62] = "fontWeight";
  EditorOption2[EditorOption2["fontVariations"] = 63] = "fontVariations";
  EditorOption2[EditorOption2["formatOnPaste"] = 64] = "formatOnPaste";
  EditorOption2[EditorOption2["formatOnType"] = 65] = "formatOnType";
  EditorOption2[EditorOption2["glyphMargin"] = 66] = "glyphMargin";
  EditorOption2[EditorOption2["gotoLocation"] = 67] = "gotoLocation";
  EditorOption2[EditorOption2["hideCursorInOverviewRuler"] = 68] = "hideCursorInOverviewRuler";
  EditorOption2[EditorOption2["hover"] = 69] = "hover";
  EditorOption2[EditorOption2["inDiffEditor"] = 70] = "inDiffEditor";
  EditorOption2[EditorOption2["inlineSuggest"] = 71] = "inlineSuggest";
  EditorOption2[EditorOption2["letterSpacing"] = 72] = "letterSpacing";
  EditorOption2[EditorOption2["lightbulb"] = 73] = "lightbulb";
  EditorOption2[EditorOption2["lineDecorationsWidth"] = 74] = "lineDecorationsWidth";
  EditorOption2[EditorOption2["lineHeight"] = 75] = "lineHeight";
  EditorOption2[EditorOption2["lineNumbers"] = 76] = "lineNumbers";
  EditorOption2[EditorOption2["lineNumbersMinChars"] = 77] = "lineNumbersMinChars";
  EditorOption2[EditorOption2["linkedEditing"] = 78] = "linkedEditing";
  EditorOption2[EditorOption2["links"] = 79] = "links";
  EditorOption2[EditorOption2["matchBrackets"] = 80] = "matchBrackets";
  EditorOption2[EditorOption2["minimap"] = 81] = "minimap";
  EditorOption2[EditorOption2["mouseStyle"] = 82] = "mouseStyle";
  EditorOption2[EditorOption2["mouseWheelScrollSensitivity"] = 83] = "mouseWheelScrollSensitivity";
  EditorOption2[EditorOption2["mouseWheelZoom"] = 84] = "mouseWheelZoom";
  EditorOption2[EditorOption2["multiCursorMergeOverlapping"] = 85] = "multiCursorMergeOverlapping";
  EditorOption2[EditorOption2["multiCursorModifier"] = 86] = "multiCursorModifier";
  EditorOption2[EditorOption2["mouseMiddleClickAction"] = 87] = "mouseMiddleClickAction";
  EditorOption2[EditorOption2["multiCursorPaste"] = 88] = "multiCursorPaste";
  EditorOption2[EditorOption2["multiCursorLimit"] = 89] = "multiCursorLimit";
  EditorOption2[EditorOption2["occurrencesHighlight"] = 90] = "occurrencesHighlight";
  EditorOption2[EditorOption2["occurrencesHighlightDelay"] = 91] = "occurrencesHighlightDelay";
  EditorOption2[EditorOption2["overtypeCursorStyle"] = 92] = "overtypeCursorStyle";
  EditorOption2[EditorOption2["overtypeOnPaste"] = 93] = "overtypeOnPaste";
  EditorOption2[EditorOption2["overviewRulerBorder"] = 94] = "overviewRulerBorder";
  EditorOption2[EditorOption2["overviewRulerLanes"] = 95] = "overviewRulerLanes";
  EditorOption2[EditorOption2["padding"] = 96] = "padding";
  EditorOption2[EditorOption2["pasteAs"] = 97] = "pasteAs";
  EditorOption2[EditorOption2["parameterHints"] = 98] = "parameterHints";
  EditorOption2[EditorOption2["peekWidgetDefaultFocus"] = 99] = "peekWidgetDefaultFocus";
  EditorOption2[EditorOption2["placeholder"] = 100] = "placeholder";
  EditorOption2[EditorOption2["definitionLinkOpensInPeek"] = 101] = "definitionLinkOpensInPeek";
  EditorOption2[EditorOption2["quickSuggestions"] = 102] = "quickSuggestions";
  EditorOption2[EditorOption2["quickSuggestionsDelay"] = 103] = "quickSuggestionsDelay";
  EditorOption2[EditorOption2["readOnly"] = 104] = "readOnly";
  EditorOption2[EditorOption2["readOnlyMessage"] = 105] = "readOnlyMessage";
  EditorOption2[EditorOption2["renameOnType"] = 106] = "renameOnType";
  EditorOption2[EditorOption2["renderRichScreenReaderContent"] = 107] = "renderRichScreenReaderContent";
  EditorOption2[EditorOption2["renderControlCharacters"] = 108] = "renderControlCharacters";
  EditorOption2[EditorOption2["renderFinalNewline"] = 109] = "renderFinalNewline";
  EditorOption2[EditorOption2["renderLineHighlight"] = 110] = "renderLineHighlight";
  EditorOption2[EditorOption2["renderLineHighlightOnlyWhenFocus"] = 111] = "renderLineHighlightOnlyWhenFocus";
  EditorOption2[EditorOption2["renderValidationDecorations"] = 112] = "renderValidationDecorations";
  EditorOption2[EditorOption2["renderWhitespace"] = 113] = "renderWhitespace";
  EditorOption2[EditorOption2["revealHorizontalRightPadding"] = 114] = "revealHorizontalRightPadding";
  EditorOption2[EditorOption2["roundedSelection"] = 115] = "roundedSelection";
  EditorOption2[EditorOption2["rulers"] = 116] = "rulers";
  EditorOption2[EditorOption2["scrollbar"] = 117] = "scrollbar";
  EditorOption2[EditorOption2["scrollBeyondLastColumn"] = 118] = "scrollBeyondLastColumn";
  EditorOption2[EditorOption2["scrollBeyondLastLine"] = 119] = "scrollBeyondLastLine";
  EditorOption2[EditorOption2["scrollPredominantAxis"] = 120] = "scrollPredominantAxis";
  EditorOption2[EditorOption2["selectionClipboard"] = 121] = "selectionClipboard";
  EditorOption2[EditorOption2["selectionHighlight"] = 122] = "selectionHighlight";
  EditorOption2[EditorOption2["selectionHighlightMaxLength"] = 123] = "selectionHighlightMaxLength";
  EditorOption2[EditorOption2["selectionHighlightMultiline"] = 124] = "selectionHighlightMultiline";
  EditorOption2[EditorOption2["selectOnLineNumbers"] = 125] = "selectOnLineNumbers";
  EditorOption2[EditorOption2["showFoldingControls"] = 126] = "showFoldingControls";
  EditorOption2[EditorOption2["showUnused"] = 127] = "showUnused";
  EditorOption2[EditorOption2["snippetSuggestions"] = 128] = "snippetSuggestions";
  EditorOption2[EditorOption2["smartSelect"] = 129] = "smartSelect";
  EditorOption2[EditorOption2["smoothScrolling"] = 130] = "smoothScrolling";
  EditorOption2[EditorOption2["stickyScroll"] = 131] = "stickyScroll";
  EditorOption2[EditorOption2["stickyTabStops"] = 132] = "stickyTabStops";
  EditorOption2[EditorOption2["stopRenderingLineAfter"] = 133] = "stopRenderingLineAfter";
  EditorOption2[EditorOption2["suggest"] = 134] = "suggest";
  EditorOption2[EditorOption2["suggestFontSize"] = 135] = "suggestFontSize";
  EditorOption2[EditorOption2["suggestLineHeight"] = 136] = "suggestLineHeight";
  EditorOption2[EditorOption2["suggestOnTriggerCharacters"] = 137] = "suggestOnTriggerCharacters";
  EditorOption2[EditorOption2["suggestSelection"] = 138] = "suggestSelection";
  EditorOption2[EditorOption2["tabCompletion"] = 139] = "tabCompletion";
  EditorOption2[EditorOption2["tabIndex"] = 140] = "tabIndex";
  EditorOption2[EditorOption2["trimWhitespaceOnDelete"] = 141] = "trimWhitespaceOnDelete";
  EditorOption2[EditorOption2["unicodeHighlighting"] = 142] = "unicodeHighlighting";
  EditorOption2[EditorOption2["unusualLineTerminators"] = 143] = "unusualLineTerminators";
  EditorOption2[EditorOption2["useShadowDOM"] = 144] = "useShadowDOM";
  EditorOption2[EditorOption2["useTabStops"] = 145] = "useTabStops";
  EditorOption2[EditorOption2["wordBreak"] = 146] = "wordBreak";
  EditorOption2[EditorOption2["wordSegmenterLocales"] = 147] = "wordSegmenterLocales";
  EditorOption2[EditorOption2["wordSeparators"] = 148] = "wordSeparators";
  EditorOption2[EditorOption2["wordWrap"] = 149] = "wordWrap";
  EditorOption2[EditorOption2["wordWrapBreakAfterCharacters"] = 150] = "wordWrapBreakAfterCharacters";
  EditorOption2[EditorOption2["wordWrapBreakBeforeCharacters"] = 151] = "wordWrapBreakBeforeCharacters";
  EditorOption2[EditorOption2["wordWrapColumn"] = 152] = "wordWrapColumn";
  EditorOption2[EditorOption2["wordWrapOverride1"] = 153] = "wordWrapOverride1";
  EditorOption2[EditorOption2["wordWrapOverride2"] = 154] = "wordWrapOverride2";
  EditorOption2[EditorOption2["wrappingIndent"] = 155] = "wrappingIndent";
  EditorOption2[EditorOption2["wrappingStrategy"] = 156] = "wrappingStrategy";
  EditorOption2[EditorOption2["showDeprecated"] = 157] = "showDeprecated";
  EditorOption2[EditorOption2["inertialScroll"] = 158] = "inertialScroll";
  EditorOption2[EditorOption2["inlayHints"] = 159] = "inlayHints";
  EditorOption2[EditorOption2["wrapOnEscapedLineFeeds"] = 160] = "wrapOnEscapedLineFeeds";
  EditorOption2[EditorOption2["effectiveCursorStyle"] = 161] = "effectiveCursorStyle";
  EditorOption2[EditorOption2["editorClassName"] = 162] = "editorClassName";
  EditorOption2[EditorOption2["pixelRatio"] = 163] = "pixelRatio";
  EditorOption2[EditorOption2["tabFocusMode"] = 164] = "tabFocusMode";
  EditorOption2[EditorOption2["layoutInfo"] = 165] = "layoutInfo";
  EditorOption2[EditorOption2["wrappingInfo"] = 166] = "wrappingInfo";
  EditorOption2[EditorOption2["defaultColorDecorators"] = 167] = "defaultColorDecorators";
  EditorOption2[EditorOption2["colorDecoratorsActivatedOn"] = 168] = "colorDecoratorsActivatedOn";
  EditorOption2[EditorOption2["inlineCompletionsAccessibilityVerbose"] = 169] = "inlineCompletionsAccessibilityVerbose";
  EditorOption2[EditorOption2["effectiveEditContext"] = 170] = "effectiveEditContext";
  EditorOption2[EditorOption2["scrollOnMiddleClick"] = 171] = "scrollOnMiddleClick";
  EditorOption2[EditorOption2["effectiveAllowVariableFonts"] = 172] = "effectiveAllowVariableFonts";
  EditorOption2[EditorOption2["doubleClickSelectsBlock"] = 173] = "doubleClickSelectsBlock";
  return EditorOption2;
})(EditorOption || {});
const EditorOptions = {
  acceptSuggestionOnCommitCharacter: register(new EditorBooleanOption(
    0 /* acceptSuggestionOnCommitCharacter */,
    "acceptSuggestionOnCommitCharacter",
    true,
    { markdownDescription: nls.localize("acceptSuggestionOnCommitCharacter", "Controls whether suggestions should be accepted on commit characters. For example, in JavaScript, the semi-colon (`;`) can be a commit character that accepts a suggestion and types that character.") }
  )),
  acceptSuggestionOnEnter: register(new EditorStringEnumOption(
    1 /* acceptSuggestionOnEnter */,
    "acceptSuggestionOnEnter",
    "on",
    ["on", "smart", "off"],
    {
      markdownEnumDescriptions: [
        "",
        nls.localize("acceptSuggestionOnEnterSmart", "Only accept a suggestion with `Enter` when it makes a textual change."),
        ""
      ],
      markdownDescription: nls.localize("acceptSuggestionOnEnter", "Controls whether suggestions should be accepted on `Enter`, in addition to `Tab`. Helps to avoid ambiguity between inserting new lines or accepting suggestions.")
    }
  )),
  accessibilitySupport: register(new EditorAccessibilitySupport()),
  accessibilityPageSize: register(new EditorIntOption(
    3 /* accessibilityPageSize */,
    "accessibilityPageSize",
    500,
    1,
    Constants.MAX_SAFE_SMALL_INTEGER,
    {
      description: nls.localize("accessibilityPageSize", "Controls the number of lines in the editor that can be read out by a screen reader at once. When we detect a screen reader we automatically set the default to be 500. Warning: this has a performance implication for numbers larger than the default."),
      tags: ["accessibility"]
    }
  )),
  allowOverflow: register(new EditorBooleanOption(
    4 /* allowOverflow */,
    "allowOverflow",
    true
  )),
  allowVariableLineHeights: register(new EditorBooleanOption(
    5 /* allowVariableLineHeights */,
    "allowVariableLineHeights",
    true,
    {
      description: nls.localize("allowVariableLineHeights", "Controls whether to allow using variable line heights in the editor.")
    }
  )),
  allowVariableFonts: register(new EditorBooleanOption(
    6 /* allowVariableFonts */,
    "allowVariableFonts",
    true,
    {
      description: nls.localize("allowVariableFonts", "Controls whether to allow using variable fonts in the editor.")
    }
  )),
  allowVariableFontsInAccessibilityMode: register(new EditorBooleanOption(
    7 /* allowVariableFontsInAccessibilityMode */,
    "allowVariableFontsInAccessibilityMode",
    false,
    {
      description: nls.localize("allowVariableFontsInAccessibilityMode", "Controls whether to allow using variable fonts in the editor in the accessibility mode."),
      tags: ["accessibility"]
    }
  )),
  ariaLabel: register(new EditorStringOption(
    8 /* ariaLabel */,
    "ariaLabel",
    nls.localize("editorViewAccessibleLabel", "Editor content")
  )),
  ariaRequired: register(new EditorBooleanOption(
    9 /* ariaRequired */,
    "ariaRequired",
    false,
    void 0
  )),
  screenReaderAnnounceInlineSuggestion: register(new EditorBooleanOption(
    12 /* screenReaderAnnounceInlineSuggestion */,
    "screenReaderAnnounceInlineSuggestion",
    true,
    {
      description: nls.localize("screenReaderAnnounceInlineSuggestion", "Control whether inline suggestions are announced by a screen reader."),
      tags: ["accessibility"]
    }
  )),
  autoClosingBrackets: register(new EditorStringEnumOption(
    10 /* autoClosingBrackets */,
    "autoClosingBrackets",
    "languageDefined",
    ["always", "languageDefined", "beforeWhitespace", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingBrackets.languageDefined", "Use language configurations to determine when to autoclose brackets."),
        nls.localize("editor.autoClosingBrackets.beforeWhitespace", "Autoclose brackets only when the cursor is to the left of whitespace."),
        ""
      ],
      description: nls.localize("autoClosingBrackets", "Controls whether the editor should automatically close brackets after the user adds an opening bracket.")
    }
  )),
  autoClosingComments: register(new EditorStringEnumOption(
    11 /* autoClosingComments */,
    "autoClosingComments",
    "languageDefined",
    ["always", "languageDefined", "beforeWhitespace", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingComments.languageDefined", "Use language configurations to determine when to autoclose comments."),
        nls.localize("editor.autoClosingComments.beforeWhitespace", "Autoclose comments only when the cursor is to the left of whitespace."),
        ""
      ],
      description: nls.localize("autoClosingComments", "Controls whether the editor should automatically close comments after the user adds an opening comment.")
    }
  )),
  autoClosingDelete: register(new EditorStringEnumOption(
    13 /* autoClosingDelete */,
    "autoClosingDelete",
    "auto",
    ["always", "auto", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingDelete.auto", "Remove adjacent closing quotes or brackets only if they were automatically inserted."),
        ""
      ],
      description: nls.localize("autoClosingDelete", "Controls whether the editor should remove adjacent closing quotes or brackets when deleting.")
    }
  )),
  autoClosingOvertype: register(new EditorStringEnumOption(
    14 /* autoClosingOvertype */,
    "autoClosingOvertype",
    "auto",
    ["always", "auto", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingOvertype.auto", "Type over closing quotes or brackets only if they were automatically inserted."),
        ""
      ],
      description: nls.localize("autoClosingOvertype", "Controls whether the editor should type over closing quotes or brackets.")
    }
  )),
  autoClosingQuotes: register(new EditorStringEnumOption(
    15 /* autoClosingQuotes */,
    "autoClosingQuotes",
    "languageDefined",
    ["always", "languageDefined", "beforeWhitespace", "never"],
    {
      enumDescriptions: [
        "",
        nls.localize("editor.autoClosingQuotes.languageDefined", "Use language configurations to determine when to autoclose quotes."),
        nls.localize("editor.autoClosingQuotes.beforeWhitespace", "Autoclose quotes only when the cursor is to the left of whitespace."),
        ""
      ],
      description: nls.localize("autoClosingQuotes", "Controls whether the editor should automatically close quotes after the user adds an opening quote.")
    }
  )),
  autoIndent: register(new EditorEnumOption(
    16 /* autoIndent */,
    "autoIndent",
    4 /* Full */,
    "full",
    ["none", "keep", "brackets", "advanced", "full"],
    _autoIndentFromString,
    {
      enumDescriptions: [
        nls.localize("editor.autoIndent.none", "The editor will not insert indentation automatically."),
        nls.localize("editor.autoIndent.keep", "The editor will keep the current line's indentation."),
        nls.localize("editor.autoIndent.brackets", "The editor will keep the current line's indentation and honor language defined brackets."),
        nls.localize("editor.autoIndent.advanced", "The editor will keep the current line's indentation, honor language defined brackets and invoke special onEnterRules defined by languages."),
        nls.localize("editor.autoIndent.full", "The editor will keep the current line's indentation, honor language defined brackets, invoke special onEnterRules defined by languages, and honor indentationRules defined by languages.")
      ],
      description: nls.localize("autoIndent", "Controls whether the editor should automatically adjust the indentation when users type, paste, move or indent lines.")
    }
  )),
  autoIndentOnPaste: register(new EditorBooleanOption(
    17 /* autoIndentOnPaste */,
    "autoIndentOnPaste",
    false,
    { description: nls.localize("autoIndentOnPaste", "Controls whether the editor should automatically auto-indent the pasted content.") }
  )),
  autoIndentOnPasteWithinString: register(new EditorBooleanOption(
    18 /* autoIndentOnPasteWithinString */,
    "autoIndentOnPasteWithinString",
    true,
    { description: nls.localize("autoIndentOnPasteWithinString", "Controls whether the editor should automatically auto-indent the pasted content when pasted within a string. This takes effect when autoIndentOnPaste is true.") }
  )),
  automaticLayout: register(new EditorBooleanOption(
    19 /* automaticLayout */,
    "automaticLayout",
    false
  )),
  autoSurround: register(new EditorStringEnumOption(
    20 /* autoSurround */,
    "autoSurround",
    "languageDefined",
    ["languageDefined", "quotes", "brackets", "never"],
    {
      enumDescriptions: [
        nls.localize("editor.autoSurround.languageDefined", "Use language configurations to determine when to automatically surround selections."),
        nls.localize("editor.autoSurround.quotes", "Surround with quotes but not brackets."),
        nls.localize("editor.autoSurround.brackets", "Surround with brackets but not quotes."),
        ""
      ],
      description: nls.localize("autoSurround", "Controls whether the editor should automatically surround selections when typing quotes or brackets.")
    }
  )),
  bracketPairColorization: register(new BracketPairColorization()),
  bracketPairGuides: register(new GuideOptions()),
  stickyTabStops: register(new EditorBooleanOption(
    132 /* stickyTabStops */,
    "stickyTabStops",
    false,
    { description: nls.localize("stickyTabStops", "Emulate selection behavior of tab characters when using spaces for indentation. Selection will stick to tab stops.") }
  )),
  codeLens: register(new EditorBooleanOption(
    23 /* codeLens */,
    "codeLens",
    true,
    { description: nls.localize("codeLens", "Controls whether the editor shows CodeLens.") }
  )),
  codeLensFontFamily: register(new EditorStringOption(
    24 /* codeLensFontFamily */,
    "codeLensFontFamily",
    "",
    { description: nls.localize("codeLensFontFamily", "Controls the font family for CodeLens.") }
  )),
  codeLensFontSize: register(new EditorIntOption(25 /* codeLensFontSize */, "codeLensFontSize", 0, 0, 100, {
    type: "number",
    default: 0,
    minimum: 0,
    maximum: 100,
    markdownDescription: nls.localize("codeLensFontSize", "Controls the font size in pixels for CodeLens. When set to 0, 90% of `#editor.fontSize#` is used.")
  })),
  colorDecorators: register(new EditorBooleanOption(
    26 /* colorDecorators */,
    "colorDecorators",
    true,
    { description: nls.localize("colorDecorators", "Controls whether the editor should render the inline color decorators and color picker.") }
  )),
  colorDecoratorActivatedOn: register(new EditorStringEnumOption(168 /* colorDecoratorsActivatedOn */, "colorDecoratorsActivatedOn", "clickAndHover", ["clickAndHover", "hover", "click"], {
    enumDescriptions: [
      nls.localize("editor.colorDecoratorActivatedOn.clickAndHover", "Make the color picker appear both on click and hover of the color decorator"),
      nls.localize("editor.colorDecoratorActivatedOn.hover", "Make the color picker appear on hover of the color decorator"),
      nls.localize("editor.colorDecoratorActivatedOn.click", "Make the color picker appear on click of the color decorator")
    ],
    description: nls.localize("colorDecoratorActivatedOn", "Controls the condition to make a color picker appear from a color decorator.")
  })),
  colorDecoratorsLimit: register(new EditorIntOption(
    27 /* colorDecoratorsLimit */,
    "colorDecoratorsLimit",
    500,
    1,
    1e6,
    {
      markdownDescription: nls.localize("colorDecoratorsLimit", "Controls the max number of color decorators that can be rendered in an editor at once.")
    }
  )),
  columnSelection: register(new EditorBooleanOption(
    28 /* columnSelection */,
    "columnSelection",
    false,
    { description: nls.localize("columnSelection", "Enable that the selection with the mouse and keys is doing column selection.") }
  )),
  comments: register(new EditorComments()),
  contextmenu: register(new EditorBooleanOption(
    30 /* contextmenu */,
    "contextmenu",
    true
  )),
  copyWithSyntaxHighlighting: register(new EditorBooleanOption(
    31 /* copyWithSyntaxHighlighting */,
    "copyWithSyntaxHighlighting",
    true,
    { description: nls.localize("copyWithSyntaxHighlighting", "Controls whether syntax highlighting should be copied into the clipboard.") }
  )),
  cursorBlinking: register(new EditorEnumOption(
    32 /* cursorBlinking */,
    "cursorBlinking",
    1 /* Blink */,
    "blink",
    ["blink", "smooth", "phase", "expand", "solid"],
    cursorBlinkingStyleFromString,
    { description: nls.localize("cursorBlinking", "Control the cursor animation style.") }
  )),
  cursorSmoothCaretAnimation: register(new EditorStringEnumOption(
    33 /* cursorSmoothCaretAnimation */,
    "cursorSmoothCaretAnimation",
    "off",
    ["off", "explicit", "on"],
    {
      enumDescriptions: [
        nls.localize("cursorSmoothCaretAnimation.off", "Smooth caret animation is disabled."),
        nls.localize("cursorSmoothCaretAnimation.explicit", "Smooth caret animation is enabled only when the user moves the cursor with an explicit gesture."),
        nls.localize("cursorSmoothCaretAnimation.on", "Smooth caret animation is always enabled.")
      ],
      description: nls.localize("cursorSmoothCaretAnimation", "Controls whether the smooth caret animation should be enabled.")
    }
  )),
  cursorStyle: register(new EditorEnumOption(
    34 /* cursorStyle */,
    "cursorStyle",
    1 /* Line */,
    "line",
    ["line", "block", "underline", "line-thin", "block-outline", "underline-thin"],
    cursorStyleFromString,
    { description: nls.localize("cursorStyle", "Controls the cursor style in insert input mode.") }
  )),
  overtypeCursorStyle: register(new EditorEnumOption(
    92 /* overtypeCursorStyle */,
    "overtypeCursorStyle",
    2 /* Block */,
    "block",
    ["line", "block", "underline", "line-thin", "block-outline", "underline-thin"],
    cursorStyleFromString,
    { description: nls.localize("overtypeCursorStyle", "Controls the cursor style in overtype input mode.") }
  )),
  cursorSurroundingLines: register(new EditorIntOption(
    35 /* cursorSurroundingLines */,
    "cursorSurroundingLines",
    0,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { description: nls.localize("cursorSurroundingLines", "Controls the minimal number of visible leading lines (minimum 0) and trailing lines (minimum 1) surrounding the cursor. Known as 'scrollOff' or 'scrollOffset' in some other editors.") }
  )),
  cursorSurroundingLinesStyle: register(new EditorStringEnumOption(
    36 /* cursorSurroundingLinesStyle */,
    "cursorSurroundingLinesStyle",
    "default",
    ["default", "all"],
    {
      enumDescriptions: [
        nls.localize("cursorSurroundingLinesStyle.default", "`cursorSurroundingLines` is enforced only when triggered via the keyboard or API."),
        nls.localize("cursorSurroundingLinesStyle.all", "`cursorSurroundingLines` is enforced always.")
      ],
      markdownDescription: nls.localize("cursorSurroundingLinesStyle", "Controls when `#editor.cursorSurroundingLines#` should be enforced.")
    }
  )),
  cursorWidth: register(new EditorIntOption(
    37 /* cursorWidth */,
    "cursorWidth",
    0,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { markdownDescription: nls.localize("cursorWidth", "Controls the width of the cursor when `#editor.cursorStyle#` is set to `line`.") }
  )),
  cursorHeight: register(new EditorIntOption(
    38 /* cursorHeight */,
    "cursorHeight",
    0,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { markdownDescription: nls.localize("cursorHeight", "Controls the height of the cursor when `#editor.cursorStyle#` is set to `line`. Cursor's max height depends on line height.") }
  )),
  disableLayerHinting: register(new EditorBooleanOption(
    39 /* disableLayerHinting */,
    "disableLayerHinting",
    false
  )),
  disableMonospaceOptimizations: register(new EditorBooleanOption(
    40 /* disableMonospaceOptimizations */,
    "disableMonospaceOptimizations",
    false
  )),
  domReadOnly: register(new EditorBooleanOption(
    41 /* domReadOnly */,
    "domReadOnly",
    false
  )),
  doubleClickSelectsBlock: register(new EditorBooleanOption(
    173 /* doubleClickSelectsBlock */,
    "doubleClickSelectsBlock",
    true,
    { description: nls.localize("doubleClickSelectsBlock", "Controls whether double-clicking next to a bracket or quote selects the content inside.") }
  )),
  dragAndDrop: register(new EditorBooleanOption(
    42 /* dragAndDrop */,
    "dragAndDrop",
    true,
    { description: nls.localize("dragAndDrop", "Controls whether the editor should allow moving selections via drag and drop.") }
  )),
  emptySelectionClipboard: register(new EditorEmptySelectionClipboard()),
  dropIntoEditor: register(new EditorDropIntoEditor()),
  editContext: register(new EditorBooleanOption(
    44 /* editContext */,
    "editContext",
    true,
    {
      description: nls.localize("editContext", "Sets whether the EditContext API should be used instead of the text area to power input in the editor."),
      included: platform.isChrome || platform.isEdge || platform.isNative
    }
  )),
  renderRichScreenReaderContent: register(new EditorBooleanOption(
    107 /* renderRichScreenReaderContent */,
    "renderRichScreenReaderContent",
    false,
    {
      markdownDescription: nls.localize("renderRichScreenReaderContent", "Whether to render rich screen reader content when the `#editor.editContext#` setting is enabled.")
    }
  )),
  stickyScroll: register(new EditorStickyScroll()),
  experimentalGpuAcceleration: register(new EditorStringEnumOption(
    46 /* experimentalGpuAcceleration */,
    "experimentalGpuAcceleration",
    "off",
    ["off", "on"],
    {
      tags: ["experimental"],
      enumDescriptions: [
        nls.localize("experimentalGpuAcceleration.off", "Use regular DOM-based rendering."),
        nls.localize("experimentalGpuAcceleration.on", "Use GPU acceleration.")
      ],
      description: nls.localize("experimentalGpuAcceleration", "Controls whether to use the experimental GPU acceleration to render the editor.")
    }
  )),
  experimentalWhitespaceRendering: register(new EditorStringEnumOption(
    47 /* experimentalWhitespaceRendering */,
    "experimentalWhitespaceRendering",
    "svg",
    ["svg", "font", "off"],
    {
      enumDescriptions: [
        nls.localize("experimentalWhitespaceRendering.svg", "Use a new rendering method with svgs."),
        nls.localize("experimentalWhitespaceRendering.font", "Use a new rendering method with font characters."),
        nls.localize("experimentalWhitespaceRendering.off", "Use the stable rendering method.")
      ],
      description: nls.localize("experimentalWhitespaceRendering", "Controls whether whitespace is rendered with a new, experimental method.")
    }
  )),
  extraEditorClassName: register(new EditorStringOption(
    48 /* extraEditorClassName */,
    "extraEditorClassName",
    ""
  )),
  fastScrollSensitivity: register(new EditorFloatOption(
    49 /* fastScrollSensitivity */,
    "fastScrollSensitivity",
    5,
    (x) => x <= 0 ? 5 : x,
    { markdownDescription: nls.localize("fastScrollSensitivity", "Scrolling speed multiplier when pressing `Alt`.") }
  )),
  find: register(new EditorFind()),
  fixedOverflowWidgets: register(new EditorBooleanOption(
    51 /* fixedOverflowWidgets */,
    "fixedOverflowWidgets",
    false
  )),
  folding: register(new EditorBooleanOption(
    52 /* folding */,
    "folding",
    true,
    { description: nls.localize("folding", "Controls whether the editor has code folding enabled.") }
  )),
  foldingStrategy: register(new EditorStringEnumOption(
    53 /* foldingStrategy */,
    "foldingStrategy",
    "auto",
    ["auto", "indentation"],
    {
      enumDescriptions: [
        nls.localize("foldingStrategy.auto", "Use a language-specific folding strategy if available, else the indentation-based one."),
        nls.localize("foldingStrategy.indentation", "Use the indentation-based folding strategy.")
      ],
      description: nls.localize("foldingStrategy", "Controls the strategy for computing folding ranges.")
    }
  )),
  foldingHighlight: register(new EditorBooleanOption(
    54 /* foldingHighlight */,
    "foldingHighlight",
    true,
    { description: nls.localize("foldingHighlight", "Controls whether the editor should highlight folded ranges.") }
  )),
  foldingImportsByDefault: register(new EditorBooleanOption(
    55 /* foldingImportsByDefault */,
    "foldingImportsByDefault",
    false,
    { description: nls.localize("foldingImportsByDefault", "Controls whether the editor automatically collapses import ranges.") }
  )),
  foldingMaximumRegions: register(new EditorIntOption(
    56 /* foldingMaximumRegions */,
    "foldingMaximumRegions",
    5e3,
    10,
    65e3,
    // limit must be less than foldingRanges MAX_FOLDING_REGIONS
    { description: nls.localize("foldingMaximumRegions", "The maximum number of foldable regions. Increasing this value may result in the editor becoming less responsive when the current source has a large number of foldable regions.") }
  )),
  unfoldOnClickAfterEndOfLine: register(new EditorBooleanOption(
    57 /* unfoldOnClickAfterEndOfLine */,
    "unfoldOnClickAfterEndOfLine",
    false,
    { description: nls.localize("unfoldOnClickAfterEndOfLine", "Controls whether clicking on the empty content after a folded line will unfold the line.") }
  )),
  fontFamily: register(new EditorStringOption(
    58 /* fontFamily */,
    "fontFamily",
    EDITOR_FONT_DEFAULTS.fontFamily,
    { description: nls.localize("fontFamily", "Controls the font family.") }
  )),
  fontInfo: register(new EditorFontInfo()),
  fontLigatures2: register(new EditorFontLigatures()),
  fontSize: register(new EditorFontSize()),
  fontWeight: register(new EditorFontWeight()),
  fontVariations: register(new EditorFontVariations()),
  formatOnPaste: register(new EditorBooleanOption(
    64 /* formatOnPaste */,
    "formatOnPaste",
    false,
    { description: nls.localize("formatOnPaste", "Controls whether the editor should automatically format the pasted content. A formatter must be available and the formatter should be able to format a range in a document.") }
  )),
  formatOnType: register(new EditorBooleanOption(
    65 /* formatOnType */,
    "formatOnType",
    false,
    { description: nls.localize("formatOnType", "Controls whether the editor should automatically format the line after typing.") }
  )),
  glyphMargin: register(new EditorBooleanOption(
    66 /* glyphMargin */,
    "glyphMargin",
    true,
    { description: nls.localize("glyphMargin", "Controls whether the editor should render the vertical glyph margin. Glyph margin is mostly used for debugging.") }
  )),
  gotoLocation: register(new EditorGoToLocation()),
  hideCursorInOverviewRuler: register(new EditorBooleanOption(
    68 /* hideCursorInOverviewRuler */,
    "hideCursorInOverviewRuler",
    false,
    { description: nls.localize("hideCursorInOverviewRuler", "Controls whether the cursor should be hidden in the overview ruler.") }
  )),
  hover: register(new EditorHover()),
  inDiffEditor: register(new EditorBooleanOption(
    70 /* inDiffEditor */,
    "inDiffEditor",
    false
  )),
  inertialScroll: register(new EditorBooleanOption(
    158 /* inertialScroll */,
    "inertialScroll",
    false,
    { description: nls.localize("inertialScroll", "Make scrolling inertial - mostly useful with touchpad on linux.") }
  )),
  letterSpacing: register(new EditorFloatOption(
    72 /* letterSpacing */,
    "letterSpacing",
    EDITOR_FONT_DEFAULTS.letterSpacing,
    (x) => EditorFloatOption.clamp(x, -5, 20),
    { description: nls.localize("letterSpacing", "Controls the letter spacing in pixels.") }
  )),
  lightbulb: register(new EditorLightbulb()),
  lineDecorationsWidth: register(new EditorLineDecorationsWidth()),
  lineHeight: register(new EditorLineHeight()),
  lineNumbers: register(new EditorRenderLineNumbersOption()),
  lineNumbersMinChars: register(new EditorIntOption(
    77 /* lineNumbersMinChars */,
    "lineNumbersMinChars",
    5,
    1,
    300
  )),
  linkedEditing: register(new EditorBooleanOption(
    78 /* linkedEditing */,
    "linkedEditing",
    false,
    { description: nls.localize("linkedEditing", "Controls whether the editor has linked editing enabled. Depending on the language, related symbols such as HTML tags, are updated while editing.") }
  )),
  links: register(new EditorBooleanOption(
    79 /* links */,
    "links",
    true,
    { description: nls.localize("links", "Controls whether the editor should detect links and make them clickable.") }
  )),
  matchBrackets: register(new EditorStringEnumOption(
    80 /* matchBrackets */,
    "matchBrackets",
    "always",
    ["always", "near", "never"],
    { description: nls.localize("matchBrackets", "Highlight matching brackets.") }
  )),
  minimap: register(new EditorMinimap()),
  mouseStyle: register(new EditorStringEnumOption(
    82 /* mouseStyle */,
    "mouseStyle",
    "text",
    ["text", "default", "copy"]
  )),
  mouseWheelScrollSensitivity: register(new EditorFloatOption(
    83 /* mouseWheelScrollSensitivity */,
    "mouseWheelScrollSensitivity",
    1,
    (x) => x === 0 ? 1 : x,
    { markdownDescription: nls.localize("mouseWheelScrollSensitivity", "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.") }
  )),
  mouseWheelZoom: register(new EditorBooleanOption(
    84 /* mouseWheelZoom */,
    "mouseWheelZoom",
    false,
    {
      markdownDescription: platform.isMacintosh ? nls.localize("mouseWheelZoom.mac", "Zoom the font of the editor when using mouse wheel and holding `Cmd`.") : nls.localize("mouseWheelZoom", "Zoom the font of the editor when using mouse wheel and holding `Ctrl`.")
    }
  )),
  multiCursorMergeOverlapping: register(new EditorBooleanOption(
    85 /* multiCursorMergeOverlapping */,
    "multiCursorMergeOverlapping",
    true,
    { description: nls.localize("multiCursorMergeOverlapping", "Merge multiple cursors when they are overlapping.") }
  )),
  multiCursorModifier: register(new EditorEnumOption(
    86 /* multiCursorModifier */,
    "multiCursorModifier",
    "altKey",
    "alt",
    ["ctrlCmd", "alt"],
    _multiCursorModifierFromString,
    {
      markdownEnumDescriptions: [
        nls.localize("multiCursorModifier.ctrlCmd", "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
        nls.localize("multiCursorModifier.alt", "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
      ],
      markdownDescription: nls.localize({
        key: "multiCursorModifier",
        comment: [
          "- `ctrlCmd` refers to a value the setting can take and should not be localized.",
          "- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized."
        ]
      }, "The modifier to be used to add multiple cursors with the mouse. The Go to Definition and Open Link mouse gestures will adapt such that they do not conflict with the [multicursor modifier](https://code.visualstudio.com/docs/editor/codebasics#_multicursor-modifier).")
    }
  )),
  mouseMiddleClickAction: register(new EditorStringEnumOption(
    87 /* mouseMiddleClickAction */,
    "mouseMiddleClickAction",
    "default",
    ["default", "openLink", "ctrlLeftClick"],
    { description: nls.localize("mouseMiddleClickAction", "Controls what happens when middle mouse button is clicked in the editor.") }
  )),
  multiCursorPaste: register(new EditorStringEnumOption(
    88 /* multiCursorPaste */,
    "multiCursorPaste",
    "spread",
    ["spread", "full"],
    {
      markdownEnumDescriptions: [
        nls.localize("multiCursorPaste.spread", "Each cursor pastes a single line of the text."),
        nls.localize("multiCursorPaste.full", "Each cursor pastes the full text.")
      ],
      markdownDescription: nls.localize("multiCursorPaste", "Controls pasting when the line count of the pasted text matches the cursor count.")
    }
  )),
  multiCursorLimit: register(new EditorIntOption(
    89 /* multiCursorLimit */,
    "multiCursorLimit",
    1e4,
    1,
    1e5,
    {
      markdownDescription: nls.localize("multiCursorLimit", "Controls the max number of cursors that can be in an active editor at once.")
    }
  )),
  occurrencesHighlight: register(new EditorStringEnumOption(
    90 /* occurrencesHighlight */,
    "occurrencesHighlight",
    "singleFile",
    ["off", "singleFile", "multiFile"],
    {
      markdownEnumDescriptions: [
        nls.localize("occurrencesHighlight.off", "Does not highlight occurrences."),
        nls.localize("occurrencesHighlight.singleFile", "Highlights occurrences only in the current file."),
        nls.localize("occurrencesHighlight.multiFile", "Experimental: Highlights occurrences across all valid open files.")
      ],
      markdownDescription: nls.localize("occurrencesHighlight", "Controls whether occurrences should be highlighted across open files.")
    }
  )),
  occurrencesHighlightDelay: register(new EditorIntOption(
    91 /* occurrencesHighlightDelay */,
    "occurrencesHighlightDelay",
    0,
    0,
    2e3,
    {
      description: nls.localize("occurrencesHighlightDelay", "Controls the delay in milliseconds after which occurrences are highlighted."),
      tags: ["preview"]
    }
  )),
  overtypeOnPaste: register(new EditorBooleanOption(
    93 /* overtypeOnPaste */,
    "overtypeOnPaste",
    true,
    { description: nls.localize("overtypeOnPaste", "Controls whether pasting should overtype.") }
  )),
  overviewRulerBorder: register(new EditorBooleanOption(
    94 /* overviewRulerBorder */,
    "overviewRulerBorder",
    true,
    { description: nls.localize("overviewRulerBorder", "Controls whether a border should be drawn around the overview ruler.") }
  )),
  overviewRulerLanes: register(new EditorIntOption(
    95 /* overviewRulerLanes */,
    "overviewRulerLanes",
    3,
    0,
    3
  )),
  padding: register(new EditorPadding()),
  pasteAs: register(new EditorPasteAs()),
  parameterHints: register(new EditorParameterHints()),
  peekWidgetDefaultFocus: register(new EditorStringEnumOption(
    99 /* peekWidgetDefaultFocus */,
    "peekWidgetDefaultFocus",
    "tree",
    ["tree", "editor"],
    {
      enumDescriptions: [
        nls.localize("peekWidgetDefaultFocus.tree", "Focus the tree when opening peek"),
        nls.localize("peekWidgetDefaultFocus.editor", "Focus the editor when opening peek")
      ],
      description: nls.localize("peekWidgetDefaultFocus", "Controls whether to focus the inline editor or the tree in the peek widget.")
    }
  )),
  placeholder: register(new PlaceholderOption()),
  definitionLinkOpensInPeek: register(new EditorBooleanOption(
    101 /* definitionLinkOpensInPeek */,
    "definitionLinkOpensInPeek",
    false,
    { description: nls.localize("definitionLinkOpensInPeek", "Controls whether the Go to Definition mouse gesture always opens the peek widget.") }
  )),
  quickSuggestions: register(new EditorQuickSuggestions()),
  quickSuggestionsDelay: register(new EditorIntOption(
    103 /* quickSuggestionsDelay */,
    "quickSuggestionsDelay",
    10,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    {
      description: nls.localize("quickSuggestionsDelay", "Controls the delay in milliseconds after which quick suggestions will show up."),
      experiment: {
        mode: "auto"
      }
    }
  )),
  readOnly: register(new EditorBooleanOption(
    104 /* readOnly */,
    "readOnly",
    false
  )),
  readOnlyMessage: register(new ReadonlyMessage()),
  renameOnType: register(new EditorBooleanOption(
    106 /* renameOnType */,
    "renameOnType",
    false,
    { description: nls.localize("renameOnType", "Controls whether the editor auto renames on type."), markdownDeprecationMessage: nls.localize("renameOnTypeDeprecate", "Deprecated, use `#editor.linkedEditing#` instead.") }
  )),
  renderControlCharacters: register(new EditorBooleanOption(
    108 /* renderControlCharacters */,
    "renderControlCharacters",
    true,
    { description: nls.localize("renderControlCharacters", "Controls whether the editor should render control characters."), restricted: true }
  )),
  renderFinalNewline: register(new EditorStringEnumOption(
    109 /* renderFinalNewline */,
    "renderFinalNewline",
    platform.isLinux ? "dimmed" : "on",
    ["off", "on", "dimmed"],
    { description: nls.localize("renderFinalNewline", "Render last line number when the file ends with a newline.") }
  )),
  renderLineHighlight: register(new EditorStringEnumOption(
    110 /* renderLineHighlight */,
    "renderLineHighlight",
    "line",
    ["none", "gutter", "line", "all"],
    {
      enumDescriptions: [
        "",
        "",
        "",
        nls.localize("renderLineHighlight.all", "Highlights both the gutter and the current line.")
      ],
      description: nls.localize("renderLineHighlight", "Controls how the editor should render the current line highlight.")
    }
  )),
  renderLineHighlightOnlyWhenFocus: register(new EditorBooleanOption(
    111 /* renderLineHighlightOnlyWhenFocus */,
    "renderLineHighlightOnlyWhenFocus",
    false,
    { description: nls.localize("renderLineHighlightOnlyWhenFocus", "Controls if the editor should render the current line highlight only when the editor is focused.") }
  )),
  renderValidationDecorations: register(new EditorStringEnumOption(
    112 /* renderValidationDecorations */,
    "renderValidationDecorations",
    "editable",
    ["editable", "on", "off"]
  )),
  renderWhitespace: register(new EditorStringEnumOption(
    113 /* renderWhitespace */,
    "renderWhitespace",
    "selection",
    ["none", "boundary", "selection", "trailing", "all"],
    {
      enumDescriptions: [
        "",
        nls.localize("renderWhitespace.boundary", "Render whitespace characters except for single spaces between words."),
        nls.localize("renderWhitespace.selection", "Render whitespace characters only on selected text."),
        nls.localize("renderWhitespace.trailing", "Render only trailing whitespace characters."),
        ""
      ],
      description: nls.localize("renderWhitespace", "Controls how the editor should render whitespace characters.")
    }
  )),
  revealHorizontalRightPadding: register(new EditorIntOption(
    114 /* revealHorizontalRightPadding */,
    "revealHorizontalRightPadding",
    15,
    0,
    1e3
  )),
  roundedSelection: register(new EditorBooleanOption(
    115 /* roundedSelection */,
    "roundedSelection",
    true,
    { description: nls.localize("roundedSelection", "Controls whether selections should have rounded corners.") }
  )),
  rulers: register(new EditorRulers()),
  scrollbar: register(new EditorScrollbar()),
  scrollBeyondLastColumn: register(new EditorIntOption(
    118 /* scrollBeyondLastColumn */,
    "scrollBeyondLastColumn",
    4,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { description: nls.localize("scrollBeyondLastColumn", "Controls the number of extra characters beyond which the editor will scroll horizontally.") }
  )),
  scrollBeyondLastLine: register(new EditorBooleanOption(
    119 /* scrollBeyondLastLine */,
    "scrollBeyondLastLine",
    true,
    { description: nls.localize("scrollBeyondLastLine", "Controls whether the editor will scroll beyond the last line.") }
  )),
  scrollOnMiddleClick: register(new EditorBooleanOption(
    171 /* scrollOnMiddleClick */,
    "scrollOnMiddleClick",
    false,
    { description: nls.localize("scrollOnMiddleClick", "Controls whether the editor will scroll when the middle button is pressed.") }
  )),
  scrollPredominantAxis: register(new EditorBooleanOption(
    120 /* scrollPredominantAxis */,
    "scrollPredominantAxis",
    true,
    { description: nls.localize("scrollPredominantAxis", "Scroll only along the predominant axis when scrolling both vertically and horizontally at the same time. Prevents horizontal drift when scrolling vertically on a trackpad.") }
  )),
  selectionClipboard: register(new EditorBooleanOption(
    121 /* selectionClipboard */,
    "selectionClipboard",
    true,
    {
      description: nls.localize("selectionClipboard", "Controls whether the Linux primary clipboard should be supported."),
      included: platform.isLinux
    }
  )),
  selectionHighlight: register(new EditorBooleanOption(
    122 /* selectionHighlight */,
    "selectionHighlight",
    true,
    { description: nls.localize("selectionHighlight", "Controls whether the editor should highlight matches similar to the selection.") }
  )),
  selectionHighlightMaxLength: register(new EditorIntOption(
    123 /* selectionHighlightMaxLength */,
    "selectionHighlightMaxLength",
    200,
    0,
    Constants.MAX_SAFE_SMALL_INTEGER,
    { description: nls.localize("selectionHighlightMaxLength", "Controls how many characters can be in the selection before similiar matches are not highlighted. Set to zero for unlimited.") }
  )),
  selectionHighlightMultiline: register(new EditorBooleanOption(
    124 /* selectionHighlightMultiline */,
    "selectionHighlightMultiline",
    false,
    { description: nls.localize("selectionHighlightMultiline", "Controls whether the editor should highlight selection matches that span multiple lines.") }
  )),
  selectOnLineNumbers: register(new EditorBooleanOption(
    125 /* selectOnLineNumbers */,
    "selectOnLineNumbers",
    true
  )),
  showFoldingControls: register(new EditorStringEnumOption(
    126 /* showFoldingControls */,
    "showFoldingControls",
    "mouseover",
    ["always", "never", "mouseover"],
    {
      enumDescriptions: [
        nls.localize("showFoldingControls.always", "Always show the folding controls."),
        nls.localize("showFoldingControls.never", "Never show the folding controls and reduce the gutter size."),
        nls.localize("showFoldingControls.mouseover", "Only show the folding controls when the mouse is over the gutter.")
      ],
      description: nls.localize("showFoldingControls", "Controls when the folding controls on the gutter are shown.")
    }
  )),
  showUnused: register(new EditorBooleanOption(
    127 /* showUnused */,
    "showUnused",
    true,
    { description: nls.localize("showUnused", "Controls fading out of unused code.") }
  )),
  showDeprecated: register(new EditorBooleanOption(
    157 /* showDeprecated */,
    "showDeprecated",
    true,
    { description: nls.localize("showDeprecated", "Controls strikethrough deprecated variables.") }
  )),
  inlayHints: register(new EditorInlayHints()),
  snippetSuggestions: register(new EditorStringEnumOption(
    128 /* snippetSuggestions */,
    "snippetSuggestions",
    "inline",
    ["top", "bottom", "inline", "none"],
    {
      enumDescriptions: [
        nls.localize("snippetSuggestions.top", "Show snippet suggestions on top of other suggestions."),
        nls.localize("snippetSuggestions.bottom", "Show snippet suggestions below other suggestions."),
        nls.localize("snippetSuggestions.inline", "Show snippets suggestions with other suggestions."),
        nls.localize("snippetSuggestions.none", "Do not show snippet suggestions.")
      ],
      description: nls.localize("snippetSuggestions", "Controls whether snippets are shown with other suggestions and how they are sorted.")
    }
  )),
  smartSelect: register(new SmartSelect()),
  smoothScrolling: register(new EditorBooleanOption(
    130 /* smoothScrolling */,
    "smoothScrolling",
    false,
    { description: nls.localize("smoothScrolling", "Controls whether the editor will scroll using an animation.") }
  )),
  stopRenderingLineAfter: register(new EditorIntOption(
    133 /* stopRenderingLineAfter */,
    "stopRenderingLineAfter",
    1e4,
    -1,
    Constants.MAX_SAFE_SMALL_INTEGER
  )),
  suggest: register(new EditorSuggest()),
  inlineSuggest: register(new InlineEditorSuggest()),
  inlineCompletionsAccessibilityVerbose: register(new EditorBooleanOption(
    169 /* inlineCompletionsAccessibilityVerbose */,
    "inlineCompletionsAccessibilityVerbose",
    false,
    { description: nls.localize("inlineCompletionsAccessibilityVerbose", "Controls whether the accessibility hint should be provided to screen reader users when an inline completion is shown.") }
  )),
  suggestFontSize: register(new EditorIntOption(
    135 /* suggestFontSize */,
    "suggestFontSize",
    0,
    0,
    1e3,
    { markdownDescription: nls.localize("suggestFontSize", "Font size for the suggest widget. When set to {0}, the value of {1} is used.", "`0`", "`#editor.fontSize#`") }
  )),
  suggestLineHeight: register(new EditorIntOption(
    136 /* suggestLineHeight */,
    "suggestLineHeight",
    0,
    0,
    1e3,
    { markdownDescription: nls.localize("suggestLineHeight", "Line height for the suggest widget. When set to {0}, the value of {1} is used. The minimum value is 8.", "`0`", "`#editor.lineHeight#`") }
  )),
  suggestOnTriggerCharacters: register(new EditorBooleanOption(
    137 /* suggestOnTriggerCharacters */,
    "suggestOnTriggerCharacters",
    true,
    { description: nls.localize("suggestOnTriggerCharacters", "Controls whether suggestions should automatically show up when typing trigger characters.") }
  )),
  suggestSelection: register(new EditorStringEnumOption(
    138 /* suggestSelection */,
    "suggestSelection",
    "first",
    ["first", "recentlyUsed", "recentlyUsedByPrefix"],
    {
      markdownEnumDescriptions: [
        nls.localize("suggestSelection.first", "Always select the first suggestion."),
        nls.localize("suggestSelection.recentlyUsed", "Select recent suggestions unless further typing selects one, e.g. `console.| -> console.log` because `log` has been completed recently."),
        nls.localize("suggestSelection.recentlyUsedByPrefix", "Select suggestions based on previous prefixes that have completed those suggestions, e.g. `co -> console` and `con -> const`.")
      ],
      description: nls.localize("suggestSelection", "Controls how suggestions are pre-selected when showing the suggest list.")
    }
  )),
  tabCompletion: register(new EditorStringEnumOption(
    139 /* tabCompletion */,
    "tabCompletion",
    "off",
    ["on", "off", "onlySnippets"],
    {
      enumDescriptions: [
        nls.localize("tabCompletion.on", "Tab complete will insert the best matching suggestion when pressing tab."),
        nls.localize("tabCompletion.off", "Disable tab completions."),
        nls.localize("tabCompletion.onlySnippets", "Tab complete snippets when their prefix match. Works best when 'quickSuggestions' aren't enabled.")
      ],
      description: nls.localize("tabCompletion", "Enables tab completions.")
    }
  )),
  tabIndex: register(new EditorIntOption(
    140 /* tabIndex */,
    "tabIndex",
    0,
    -1,
    Constants.MAX_SAFE_SMALL_INTEGER
  )),
  trimWhitespaceOnDelete: register(new EditorBooleanOption(
    141 /* trimWhitespaceOnDelete */,
    "trimWhitespaceOnDelete",
    false,
    { description: nls.localize("trimWhitespaceOnDelete", "Controls whether the editor will also delete the next line's indentation whitespace when deleting a newline.") }
  )),
  unicodeHighlight: register(new UnicodeHighlight()),
  unusualLineTerminators: register(new EditorStringEnumOption(
    143 /* unusualLineTerminators */,
    "unusualLineTerminators",
    "prompt",
    ["auto", "off", "prompt"],
    {
      enumDescriptions: [
        nls.localize("unusualLineTerminators.auto", "Unusual line terminators are automatically removed."),
        nls.localize("unusualLineTerminators.off", "Unusual line terminators are ignored."),
        nls.localize("unusualLineTerminators.prompt", "Unusual line terminators prompt to be removed.")
      ],
      description: nls.localize("unusualLineTerminators", "Remove unusual line terminators that might cause problems.")
    }
  )),
  useShadowDOM: register(new EditorBooleanOption(
    144 /* useShadowDOM */,
    "useShadowDOM",
    true
  )),
  useTabStops: register(new EditorBooleanOption(
    145 /* useTabStops */,
    "useTabStops",
    true,
    { description: nls.localize("useTabStops", "Spaces and tabs are inserted and deleted in alignment with tab stops.") }
  )),
  wordBreak: register(new EditorStringEnumOption(
    146 /* wordBreak */,
    "wordBreak",
    "normal",
    ["normal", "keepAll"],
    {
      markdownEnumDescriptions: [
        nls.localize("wordBreak.normal", "Use the default line break rule."),
        nls.localize("wordBreak.keepAll", "Word breaks should not be used for Chinese/Japanese/Korean (CJK) text. Non-CJK text behavior is the same as for normal.")
      ],
      description: nls.localize("wordBreak", "Controls the word break rules used for Chinese/Japanese/Korean (CJK) text.")
    }
  )),
  wordSegmenterLocales: register(new WordSegmenterLocales()),
  wordSeparators: register(new EditorStringOption(
    148 /* wordSeparators */,
    "wordSeparators",
    USUAL_WORD_SEPARATORS,
    { description: nls.localize("wordSeparators", "Characters that will be used as word separators when doing word related navigations or operations.") }
  )),
  wordWrap: register(new EditorStringEnumOption(
    149 /* wordWrap */,
    "wordWrap",
    "off",
    ["off", "on", "wordWrapColumn", "bounded"],
    {
      markdownEnumDescriptions: [
        nls.localize("wordWrap.off", "Lines will never wrap."),
        nls.localize("wordWrap.on", "Lines will wrap at the viewport width."),
        nls.localize({
          key: "wordWrap.wordWrapColumn",
          comment: [
            "- `editor.wordWrapColumn` refers to a different setting and should not be localized."
          ]
        }, "Lines will wrap at `#editor.wordWrapColumn#`."),
        nls.localize({
          key: "wordWrap.bounded",
          comment: [
            "- viewport means the edge of the visible window size.",
            "- `editor.wordWrapColumn` refers to a different setting and should not be localized."
          ]
        }, "Lines will wrap at the minimum of viewport and `#editor.wordWrapColumn#`.")
      ],
      description: nls.localize({
        key: "wordWrap",
        comment: [
          "- 'off', 'on', 'wordWrapColumn' and 'bounded' refer to values the setting can take and should not be localized.",
          "- `editor.wordWrapColumn` refers to a different setting and should not be localized."
        ]
      }, "Controls how lines should wrap.")
    }
  )),
  wordWrapBreakAfterCharacters: register(new EditorStringOption(
    150 /* wordWrapBreakAfterCharacters */,
    "wordWrapBreakAfterCharacters",
    // allow-any-unicode-next-line
    " 	})]?|/&.,;\xA2\xB0\u2032\u2033\u2030\u2103\u3001\u3002\uFF61\uFF64\uFFE0\uFF0C\uFF0E\uFF1A\uFF1B\uFF1F\uFF01\uFF05\u30FB\uFF65\u309D\u309E\u30FD\u30FE\u30FC\u30A1\u30A3\u30A5\u30A7\u30A9\u30C3\u30E3\u30E5\u30E7\u30EE\u30F5\u30F6\u3041\u3043\u3045\u3047\u3049\u3063\u3083\u3085\u3087\u308E\u3095\u3096\u31F0\u31F1\u31F2\u31F3\u31F4\u31F5\u31F6\u31F7\u31F8\u31F9\u31FA\u31FB\u31FC\u31FD\u31FE\u31FF\u3005\u303B\uFF67\uFF68\uFF69\uFF6A\uFF6B\uFF6C\uFF6D\uFF6E\uFF6F\uFF70\u201D\u3009\u300B\u300D\u300F\u3011\u3015\uFF09\uFF3D\uFF5D\uFF63"
  )),
  wordWrapBreakBeforeCharacters: register(new EditorStringOption(
    151 /* wordWrapBreakBeforeCharacters */,
    "wordWrapBreakBeforeCharacters",
    // allow-any-unicode-next-line
    "([{\u2018\u201C\u3008\u300A\u300C\u300E\u3010\u3014\uFF08\uFF3B\uFF5B\uFF62\xA3\xA5\uFF04\uFFE1\uFFE5+\uFF0B"
  )),
  wordWrapColumn: register(new EditorIntOption(
    152 /* wordWrapColumn */,
    "wordWrapColumn",
    80,
    1,
    Constants.MAX_SAFE_SMALL_INTEGER,
    {
      markdownDescription: nls.localize({
        key: "wordWrapColumn",
        comment: [
          "- `editor.wordWrap` refers to a different setting and should not be localized.",
          "- 'wordWrapColumn' and 'bounded' refer to values the different setting can take and should not be localized."
        ]
      }, "Controls the wrapping column of the editor when `#editor.wordWrap#` is `wordWrapColumn` or `bounded`.")
    }
  )),
  wordWrapOverride1: register(new EditorStringEnumOption(
    153 /* wordWrapOverride1 */,
    "wordWrapOverride1",
    "inherit",
    ["off", "on", "inherit"]
  )),
  wordWrapOverride2: register(new EditorStringEnumOption(
    154 /* wordWrapOverride2 */,
    "wordWrapOverride2",
    "inherit",
    ["off", "on", "inherit"]
  )),
  wrapOnEscapedLineFeeds: register(new EditorBooleanOption(
    160 /* wrapOnEscapedLineFeeds */,
    "wrapOnEscapedLineFeeds",
    false,
    { markdownDescription: nls.localize("wrapOnEscapedLineFeeds", 'Controls whether literal `\\n` shall trigger a wordWrap when `#editor.wordWrap#` is enabled.\n\nFor example:\n```c\nchar* str="hello\\nworld"\n```\nwill be displayed as\n```c\nchar* str="hello\\n\n           world"\n```') }
  )),
  // Leave these at the end (because they have dependencies!)
  effectiveCursorStyle: register(new EffectiveCursorStyle()),
  editorClassName: register(new EditorClassName()),
  defaultColorDecorators: register(new EditorStringEnumOption(
    167 /* defaultColorDecorators */,
    "defaultColorDecorators",
    "auto",
    ["auto", "always", "never"],
    {
      enumDescriptions: [
        nls.localize("editor.defaultColorDecorators.auto", "Show default color decorators only when no extension provides colors decorators."),
        nls.localize("editor.defaultColorDecorators.always", "Always show default color decorators."),
        nls.localize("editor.defaultColorDecorators.never", "Never show default color decorators.")
      ],
      description: nls.localize("defaultColorDecorators", "Controls whether inline color decorations should be shown using the default document color provider.")
    }
  )),
  pixelRatio: register(new EditorPixelRatio()),
  tabFocusMode: register(new EditorBooleanOption(
    164 /* tabFocusMode */,
    "tabFocusMode",
    false,
    { markdownDescription: nls.localize("tabFocusMode", "Controls whether the editor receives tabs or defers them to the workbench for navigation.") }
  )),
  layoutInfo: register(new EditorLayoutInfoComputer()),
  wrappingInfo: register(new EditorWrappingInfoComputer()),
  wrappingIndent: register(new WrappingIndentOption()),
  wrappingStrategy: register(new WrappingStrategy()),
  effectiveEditContextEnabled: register(new EffectiveEditContextEnabled()),
  effectiveAllowVariableFonts: register(new EffectiveAllowVariableFonts())
};
export {
  ApplyUpdateResult,
  ComputeOptionsMemory,
  ConfigurationChangedEvent,
  EditorAutoIndentStrategy,
  EditorFontLigatures,
  EditorFontVariations,
  EditorLayoutInfoComputer,
  EditorOption,
  EditorOptions,
  MINIMAP_GUTTER_WIDTH,
  RenderLineNumbersType,
  RenderMinimap,
  ShowLightbulbIconMode,
  TextEditorCursorBlinkingStyle,
  TextEditorCursorStyle,
  WrappingIndent,
  boolean,
  clampedFloat,
  clampedInt,
  cursorBlinkingStyleFromString,
  cursorStyleFromString,
  cursorStyleToString,
  editorOptionsRegistry,
  filterFontDecorations,
  filterValidationDecorations,
  inUntrustedWorkspace,
  stringSet,
  unicodeHighlightConfigKeys
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdWludC5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRk9OVF9ERUZBVUxUUywgRk9OVF9WQVJJQVRJT05fT0ZGLCBGT05UX1ZBUklBVElPTl9UUkFOU0xBVEUsIEZvbnRJbmZvIH0gZnJvbSAnLi9mb250SW5mby5qcyc7XG5pbXBvcnQgeyBFRElUT1JfTU9ERUxfREVGQVVMVFMgfSBmcm9tICcuLi9jb3JlL21pc2MvdGV4dE1vZGVsRGVmYXVsdHMuanMnO1xuaW1wb3J0IHsgVVNVQUxfV09SRF9TRVBBUkFUT1JTIH0gZnJvbSAnLi4vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuXG4vLyNyZWdpb24gdHlwZWQgb3B0aW9uc1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgYXV0byBjbG9zaW5nIHF1b3RlcyBhbmQgYnJhY2tldHNcbiAqL1xuZXhwb3J0IHR5cGUgRWRpdG9yQXV0b0Nsb3NpbmdTdHJhdGVneSA9ICdhbHdheXMnIHwgJ2xhbmd1YWdlRGVmaW5lZCcgfCAnYmVmb3JlV2hpdGVzcGFjZScgfCAnbmV2ZXInO1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgYXV0byB3cmFwcGluZyBxdW90ZXMgYW5kIGJyYWNrZXRzXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvckF1dG9TdXJyb3VuZFN0cmF0ZWd5ID0gJ2xhbmd1YWdlRGVmaW5lZCcgfCAncXVvdGVzJyB8ICdicmFja2V0cycgfCAnbmV2ZXInO1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdHlwaW5nIG92ZXIgY2xvc2luZyBxdW90ZXMgb3IgYnJhY2tldHNcbiAqL1xuZXhwb3J0IHR5cGUgRWRpdG9yQXV0b0Nsb3NpbmdFZGl0U3RyYXRlZ3kgPSAnYWx3YXlzJyB8ICdhdXRvJyB8ICduZXZlcic7XG5cbnR5cGUgVW5rbm93bjxUPiA9IHsgW0sgaW4ga2V5b2YgVF06IHVua25vd24gfTtcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGF1dG8gaW5kZW50YXRpb24gaW4gdGhlIGVkaXRvclxuICovXG5leHBvcnQgY29uc3QgZW51bSBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kge1xuXHROb25lID0gMCxcblx0S2VlcCA9IDEsXG5cdEJyYWNrZXRzID0gMixcblx0QWR2YW5jZWQgPSAzLFxuXHRGdWxsID0gNFxufVxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIGVkaXRvci5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGlzIGVkaXRvciBpcyB1c2VkIGluc2lkZSBhIGRpZmYgZWRpdG9yLlxuXHQgKi9cblx0aW5EaWZmRWRpdG9yPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoaXMgZWRpdG9yIGlzIGFsbG93ZWQgdG8gdXNlIHZhcmlhYmxlIGxpbmUgaGVpZ2h0cy5cblx0ICovXG5cdGFsbG93VmFyaWFibGVMaW5lSGVpZ2h0cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGlzIGVkaXRvciBpcyBhbGxvd2VkIHRvIHVzZSB2YXJpYWJsZSBmb250LXNpemVzIGFuZCBmb250LWZhbWlsaWVzXG5cdCAqL1xuXHRhbGxvd1ZhcmlhYmxlRm9udHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhpcyBlZGl0b3IgaXMgYWxsb3dlZCB0byB1c2UgdmFyaWFibGUgZm9udC1zaXplcyBhbmQgZm9udC1mYW1pbGllcyBpbiBhY2Nlc3NpYmlsaXR5IG1vZGVcblx0ICovXG5cdGFsbG93VmFyaWFibGVGb250c0luQWNjZXNzaWJpbGl0eU1vZGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhlIGFyaWEgbGFiZWwgZm9yIHRoZSBlZGl0b3IncyB0ZXh0YXJlYSAod2hlbiBpdCBpcyBmb2N1c2VkKS5cblx0ICovXG5cdGFyaWFMYWJlbD86IHN0cmluZztcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgYXJpYS1yZXF1aXJlZCBhdHRyaWJ1dGUgc2hvdWxkIGJlIHNldCBvbiB0aGUgZWRpdG9ycyB0ZXh0YXJlYS5cblx0ICovXG5cdGFyaWFSZXF1aXJlZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9sIHdoZXRoZXIgYSBzY3JlZW4gcmVhZGVyIGFubm91bmNlcyBpbmxpbmUgc3VnZ2VzdGlvbiBjb250ZW50IGltbWVkaWF0ZWx5LlxuXHQgKi9cblx0c2NyZWVuUmVhZGVyQW5ub3VuY2VJbmxpbmVTdWdnZXN0aW9uPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSBgdGFiaW5kZXhgIHByb3BlcnR5IG9mIHRoZSBlZGl0b3IncyB0ZXh0YXJlYVxuXHQgKi9cblx0dGFiSW5kZXg/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBSZW5kZXIgdmVydGljYWwgbGluZXMgYXQgdGhlIHNwZWNpZmllZCBjb2x1bW5zLlxuXHQgKiBEZWZhdWx0cyB0byBlbXB0eSBhcnJheS5cblx0ICovXG5cdHJ1bGVycz86IChudW1iZXIgfCBJUnVsZXJPcHRpb24pW107XG5cdC8qKlxuXHQgKiBMb2NhbGVzIHVzZWQgZm9yIHNlZ21lbnRpbmcgbGluZXMgaW50byB3b3JkcyB3aGVuIGRvaW5nIHdvcmQgcmVsYXRlZCBuYXZpZ2F0aW9ucyBvciBvcGVyYXRpb25zLlxuXHQgKlxuXHQgKiBTcGVjaWZ5IHRoZSBCQ1AgNDcgbGFuZ3VhZ2UgdGFnIG9mIHRoZSB3b3JkIHlvdSB3aXNoIHRvIHJlY29nbml6ZSAoZS5nLiwgamEsIHpoLUNOLCB6aC1IYW50LVRXLCBldGMuKS5cblx0ICogRGVmYXVsdHMgdG8gZW1wdHkgYXJyYXlcblx0ICovXG5cdHdvcmRTZWdtZW50ZXJMb2NhbGVzPzogc3RyaW5nIHwgc3RyaW5nW107XG5cdC8qKlxuXHQgKiBBIHN0cmluZyBjb250YWluaW5nIHRoZSB3b3JkIHNlcGFyYXRvcnMgdXNlZCB3aGVuIGRvaW5nIHdvcmQgbmF2aWdhdGlvbi5cblx0ICogRGVmYXVsdHMgdG8gYH4hQCMkJV4mKigpLT0rW3tdfVxcXFx8OzpcXCdcIiwuPD4vP1xuXHQgKi9cblx0d29yZFNlcGFyYXRvcnM/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBFbmFibGUgTGludXggcHJpbWFyeSBjbGlwYm9hcmQuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzZWxlY3Rpb25DbGlwYm9hcmQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgcmVuZGVyaW5nIG9mIGxpbmUgbnVtYmVycy5cblx0ICogSWYgaXQgaXMgYSBmdW5jdGlvbiwgaXQgd2lsbCBiZSBpbnZva2VkIHdoZW4gcmVuZGVyaW5nIGEgbGluZSBudW1iZXIgYW5kIHRoZSByZXR1cm4gdmFsdWUgd2lsbCBiZSByZW5kZXJlZC5cblx0ICogT3RoZXJ3aXNlLCBpZiBpdCBpcyBhIHRydXRoeSwgbGluZSBudW1iZXJzIHdpbGwgYmUgcmVuZGVyZWQgbm9ybWFsbHkgKGVxdWl2YWxlbnQgb2YgdXNpbmcgYW4gaWRlbnRpdHkgZnVuY3Rpb24pLlxuXHQgKiBPdGhlcndpc2UsIGxpbmUgbnVtYmVycyB3aWxsIG5vdCBiZSByZW5kZXJlZC5cblx0ICogRGVmYXVsdHMgdG8gYG9uYC5cblx0ICovXG5cdGxpbmVOdW1iZXJzPzogTGluZU51bWJlcnNUeXBlO1xuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIG1pbmltYWwgbnVtYmVyIG9mIHZpc2libGUgbGVhZGluZyBhbmQgdHJhaWxpbmcgbGluZXMgc3Vycm91bmRpbmcgdGhlIGN1cnNvci5cblx0ICogRGVmYXVsdHMgdG8gMC5cblx0Ki9cblx0Y3Vyc29yU3Vycm91bmRpbmdMaW5lcz86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZW4gYGN1cnNvclN1cnJvdW5kaW5nTGluZXNgIHNob3VsZCBiZSBlbmZvcmNlZFxuXHQgKiBEZWZhdWx0cyB0byBgZGVmYXVsdGAsIGBjdXJzb3JTdXJyb3VuZGluZ0xpbmVzYCBpcyBub3QgZW5mb3JjZWQgd2hlbiBjdXJzb3IgcG9zaXRpb24gaXMgY2hhbmdlZFxuXHQgKiBieSBtb3VzZS5cblx0Ki9cblx0Y3Vyc29yU3Vycm91bmRpbmdMaW5lc1N0eWxlPzogJ2RlZmF1bHQnIHwgJ2FsbCc7XG5cdC8qKlxuXHQgKiBSZW5kZXIgbGFzdCBsaW5lIG51bWJlciB3aGVuIHRoZSBmaWxlIGVuZHMgd2l0aCBhIG5ld2xpbmUuXG5cdCAqIERlZmF1bHRzIHRvICdvbicgZm9yIFdpbmRvd3MgYW5kIG1hY09TIGFuZCAnZGltbWVkJyBmb3IgTGludXguXG5cdCovXG5cdHJlbmRlckZpbmFsTmV3bGluZT86ICdvbicgfCAnb2ZmJyB8ICdkaW1tZWQnO1xuXHQvKipcblx0ICogUmVtb3ZlIHVudXN1YWwgbGluZSB0ZXJtaW5hdG9ycyBsaWtlIExJTkUgU0VQQVJBVE9SIChMUyksIFBBUkFHUkFQSCBTRVBBUkFUT1IgKFBTKS5cblx0ICogRGVmYXVsdHMgdG8gJ3Byb21wdCcuXG5cdCAqL1xuXHR1bnVzdWFsTGluZVRlcm1pbmF0b3JzPzogJ2F1dG8nIHwgJ29mZicgfCAncHJvbXB0Jztcblx0LyoqXG5cdCAqIFNob3VsZCB0aGUgY29ycmVzcG9uZGluZyBsaW5lIGJlIHNlbGVjdGVkIHdoZW4gY2xpY2tpbmcgb24gdGhlIGxpbmUgbnVtYmVyP1xuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2VsZWN0T25MaW5lTnVtYmVycz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSB3aWR0aCBvZiBsaW5lIG51bWJlcnMsIGJ5IHJlc2VydmluZyBob3Jpem9udGFsIHNwYWNlIGZvciByZW5kZXJpbmcgYXQgbGVhc3QgYW4gYW1vdW50IG9mIGRpZ2l0cy5cblx0ICogRGVmYXVsdHMgdG8gNS5cblx0ICovXG5cdGxpbmVOdW1iZXJzTWluQ2hhcnM/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhlIHJlbmRlcmluZyBvZiB0aGUgZ2x5cGggbWFyZ2luLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlIGluIHZzY29kZSBhbmQgdG8gZmFsc2UgaW4gbW9uYWNvLWVkaXRvci5cblx0ICovXG5cdGdseXBoTWFyZ2luPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFRoZSB3aWR0aCByZXNlcnZlZCBmb3IgbGluZSBkZWNvcmF0aW9ucyAoaW4gcHgpLlxuXHQgKiBMaW5lIGRlY29yYXRpb25zIGFyZSBwbGFjZWQgYmV0d2VlbiBsaW5lIG51bWJlcnMgYW5kIHRoZSBlZGl0b3IgY29udGVudC5cblx0ICogWW91IGNhbiBwYXNzIGluIGEgc3RyaW5nIGluIHRoZSBmb3JtYXQgZmxvYXRpbmcgcG9pbnQgZm9sbG93ZWQgYnkgXCJjaFwiLiBlLmcuIDEuM2NoLlxuXHQgKiBEZWZhdWx0cyB0byAxMC5cblx0ICovXG5cdGxpbmVEZWNvcmF0aW9uc1dpZHRoPzogbnVtYmVyIHwgc3RyaW5nO1xuXHQvKipcblx0ICogV2hlbiByZXZlYWxpbmcgdGhlIGN1cnNvciwgYSB2aXJ0dWFsIHBhZGRpbmcgKHB4KSBpcyBhZGRlZCB0byB0aGUgY3Vyc29yLCB0dXJuaW5nIGl0IGludG8gYSByZWN0YW5nbGUuXG5cdCAqIFRoaXMgdmlydHVhbCBwYWRkaW5nIGVuc3VyZXMgdGhhdCB0aGUgY3Vyc29yIGdldHMgcmV2ZWFsZWQgYmVmb3JlIGhpdHRpbmcgdGhlIGVkZ2Ugb2YgdGhlIHZpZXdwb3J0LlxuXHQgKiBEZWZhdWx0cyB0byAzMCAocHgpLlxuXHQgKi9cblx0cmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZz86IG51bWJlcjtcblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgZWRpdG9yIHNlbGVjdGlvbiB3aXRoIHJvdW5kZWQgYm9yZGVycy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHJvdW5kZWRTZWxlY3Rpb24/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ2xhc3MgbmFtZSB0byBiZSBhZGRlZCB0byB0aGUgZWRpdG9yLlxuXHQgKi9cblx0ZXh0cmFFZGl0b3JDbGFzc05hbWU/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBTaG91bGQgdGhlIGVkaXRvciBiZSByZWFkIG9ubHkuIFNlZSBhbHNvIGBkb21SZWFkT25seWAuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0cmVhZE9ubHk/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhlIG1lc3NhZ2UgdG8gZGlzcGxheSB3aGVuIHRoZSBlZGl0b3IgaXMgcmVhZG9ubHkuXG5cdCAqL1xuXHRyZWFkT25seU1lc3NhZ2U/OiBJTWFya2Rvd25TdHJpbmc7XG5cdC8qKlxuXHQgKiBTaG91bGQgdGhlIHRleHRhcmVhIHVzZWQgZm9yIGlucHV0IHVzZSB0aGUgRE9NIGByZWFkb25seWAgYXR0cmlidXRlLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGRvbVJlYWRPbmx5PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSBsaW5rZWQgZWRpdGluZy5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRsaW5rZWRFZGl0aW5nPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIGRlcHJlY2F0ZWQsIHVzZSBsaW5rZWRFZGl0aW5nIGluc3RlYWRcblx0ICovXG5cdHJlbmFtZU9uVHlwZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG91bGQgdGhlIGVkaXRvciByZW5kZXIgdmFsaWRhdGlvbiBkZWNvcmF0aW9ucy5cblx0ICogRGVmYXVsdHMgdG8gZWRpdGFibGUuXG5cdCAqL1xuXHRyZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnM/OiAnZWRpdGFibGUnIHwgJ29uJyB8ICdvZmYnO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgYmVoYXZpb3IgYW5kIHJlbmRlcmluZyBvZiB0aGUgc2Nyb2xsYmFycy5cblx0ICovXG5cdHNjcm9sbGJhcj86IElFZGl0b3JTY3JvbGxiYXJPcHRpb25zO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgYmVoYXZpb3Igb2Ygc3RpY2t5IHNjcm9sbCBvcHRpb25zXG5cdCAqL1xuXHRzdGlja3lTY3JvbGw/OiBJRWRpdG9yU3RpY2t5U2Nyb2xsT3B0aW9ucztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGJlaGF2aW9yIGFuZCByZW5kZXJpbmcgb2YgdGhlIG1pbmltYXAuXG5cdCAqL1xuXHRtaW5pbWFwPzogSUVkaXRvck1pbmltYXBPcHRpb25zO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgYmVoYXZpb3Igb2YgdGhlIGZpbmQgd2lkZ2V0LlxuXHQgKi9cblx0ZmluZD86IElFZGl0b3JGaW5kT3B0aW9ucztcblx0LyoqXG5cdCAqIERpc3BsYXkgb3ZlcmZsb3cgd2lkZ2V0cyBhcyBgZml4ZWRgLlxuXHQgKiBEZWZhdWx0cyB0byBgZmFsc2VgLlxuXHQgKi9cblx0Zml4ZWRPdmVyZmxvd1dpZGdldHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogQWxsb3cgY29udGVudCB3aWRnZXRzIGFuZCBvdmVyZmxvdyB3aWRnZXRzIHRvIG92ZXJmbG93IHRoZSBlZGl0b3Igdmlld3BvcnQuXG5cdCAqIERlZmF1bHRzIHRvIGB0cnVlYC5cblx0ICovXG5cdGFsbG93T3ZlcmZsb3c/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhlIG51bWJlciBvZiB2ZXJ0aWNhbCBsYW5lcyB0aGUgb3ZlcnZpZXcgcnVsZXIgc2hvdWxkIHJlbmRlci5cblx0ICogRGVmYXVsdHMgdG8gMy5cblx0ICovXG5cdG92ZXJ2aWV3UnVsZXJMYW5lcz86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIGlmIGEgYm9yZGVyIHNob3VsZCBiZSBkcmF3biBhcm91bmQgdGhlIG92ZXJ2aWV3IHJ1bGVyLlxuXHQgKiBEZWZhdWx0cyB0byBgdHJ1ZWAuXG5cdCAqL1xuXHRvdmVydmlld1J1bGVyQm9yZGVyPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIGN1cnNvciBhbmltYXRpb24gc3R5bGUsIHBvc3NpYmxlIHZhbHVlcyBhcmUgJ2JsaW5rJywgJ3Ntb290aCcsICdwaGFzZScsICdleHBhbmQnIGFuZCAnc29saWQnLlxuXHQgKiBEZWZhdWx0cyB0byAnYmxpbmsnLlxuXHQgKi9cblx0Y3Vyc29yQmxpbmtpbmc/OiAnYmxpbmsnIHwgJ3Ntb290aCcgfCAncGhhc2UnIHwgJ2V4cGFuZCcgfCAnc29saWQnO1xuXHQvKipcblx0ICogWm9vbSB0aGUgZm9udCBpbiB0aGUgZWRpdG9yIHdoZW4gdXNpbmcgdGhlIG1vdXNlIHdoZWVsIGluIGNvbWJpbmF0aW9uIHdpdGggaG9sZGluZyBDdHJsLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdG1vdXNlV2hlZWxab29tPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIG1vdXNlIHBvaW50ZXIgc3R5bGUsIGVpdGhlciAndGV4dCcgb3IgJ2RlZmF1bHQnIG9yICdjb3B5J1xuXHQgKiBEZWZhdWx0cyB0byAndGV4dCdcblx0ICovXG5cdG1vdXNlU3R5bGU/OiAndGV4dCcgfCAnZGVmYXVsdCcgfCAnY29weSc7XG5cdC8qKlxuXHQgKiBFbmFibGUgc21vb3RoIGNhcmV0IGFuaW1hdGlvbi5cblx0ICogRGVmYXVsdHMgdG8gJ29mZicuXG5cdCAqL1xuXHRjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbj86ICdvZmYnIHwgJ2V4cGxpY2l0JyB8ICdvbic7XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSBjdXJzb3Igc3R5bGUgaW4gaW5zZXJ0IG1vZGUuXG5cdCAqIERlZmF1bHRzIHRvICdsaW5lJy5cblx0ICovXG5cdGN1cnNvclN0eWxlPzogJ2xpbmUnIHwgJ2Jsb2NrJyB8ICd1bmRlcmxpbmUnIHwgJ2xpbmUtdGhpbicgfCAnYmxvY2stb3V0bGluZScgfCAndW5kZXJsaW5lLXRoaW4nO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgY3Vyc29yIHN0eWxlIGluIG92ZXJ0eXBlIG1vZGUuXG5cdCAqIERlZmF1bHRzIHRvICdibG9jaycuXG5cdCAqL1xuXHRvdmVydHlwZUN1cnNvclN0eWxlPzogJ2xpbmUnIHwgJ2Jsb2NrJyB8ICd1bmRlcmxpbmUnIHwgJ2xpbmUtdGhpbicgfCAnYmxvY2stb3V0bGluZScgfCAndW5kZXJsaW5lLXRoaW4nO1xuXHQvKipcblx0ICogIENvbnRyb2xzIHdoZXRoZXIgcGFzdGUgaW4gb3ZlcnR5cGUgbW9kZSBzaG91bGQgb3ZlcndyaXRlIG9yIGluc2VydC5cblx0ICovXG5cdG92ZXJ0eXBlT25QYXN0ZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSB3aWR0aCBvZiB0aGUgY3Vyc29yIHdoZW4gY3Vyc29yU3R5bGUgaXMgc2V0IHRvICdsaW5lJ1xuXHQgKi9cblx0Y3Vyc29yV2lkdGg/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSBoZWlnaHQgb2YgdGhlIGN1cnNvciB3aGVuIGN1cnNvclN0eWxlIGlzIHNldCB0byAnbGluZSdcblx0ICovXG5cdGN1cnNvckhlaWdodD86IG51bWJlcjtcblx0LyoqXG5cdCAqIEVuYWJsZSBmb250IGxpZ2F0dXJlcy5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRmb250TGlnYXR1cmVzPzogYm9vbGVhbiB8IHN0cmluZztcblx0LyoqXG5cdCAqIEVuYWJsZSBmb250IHZhcmlhdGlvbnMuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0Zm9udFZhcmlhdGlvbnM/OiBib29sZWFuIHwgc3RyaW5nO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byB1c2UgZGVmYXVsdCBjb2xvciBkZWNvcmF0aW9ucyBvciBub3QgdXNpbmcgdGhlIGRlZmF1bHQgZG9jdW1lbnQgY29sb3IgcHJvdmlkZXJcblx0ICovXG5cdGRlZmF1bHRDb2xvckRlY29yYXRvcnM/OiAnYXV0bycgfCAnYWx3YXlzJyB8ICduZXZlcic7XG5cdC8qKlxuXHQgKiBEaXNhYmxlIHRoZSB1c2Ugb2YgYHRyYW5zZm9ybTogdHJhbnNsYXRlM2QoMHB4LCAwcHgsIDBweClgIGZvciB0aGUgZWRpdG9yIG1hcmdpbiBhbmQgbGluZXMgbGF5ZXJzLlxuXHQgKiBUaGUgdXNhZ2Ugb2YgYHRyYW5zZm9ybTogdHJhbnNsYXRlM2QoMHB4LCAwcHgsIDBweClgIGFjdHMgYXMgYSBoaW50IGZvciBicm93c2VycyB0byBjcmVhdGUgYW4gZXh0cmEgbGF5ZXIuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0ZGlzYWJsZUxheWVySGludGluZz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBEaXNhYmxlIHRoZSBvcHRpbWl6YXRpb25zIGZvciBtb25vc3BhY2UgZm9udHMuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0ZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdWxkIHRoZSBjdXJzb3IgYmUgaGlkZGVuIGluIHRoZSBvdmVydmlldyBydWxlci5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRoaWRlQ3Vyc29ySW5PdmVydmlld1J1bGVyPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSB0aGF0IHNjcm9sbGluZyBjYW4gZ28gb25lIHNjcmVlbiBzaXplIGFmdGVyIHRoZSBsYXN0IGxpbmUuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzY3JvbGxCZXlvbmRMYXN0TGluZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTY3JvbGwgZWRpdG9yIG9uIG1pZGRsZSBjbGlja1xuXHQgKi9cblx0c2Nyb2xsT25NaWRkbGVDbGljaz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhhdCBzY3JvbGxpbmcgY2FuIGdvIGJleW9uZCB0aGUgbGFzdCBjb2x1bW4gYnkgYSBudW1iZXIgb2YgY29sdW1ucy5cblx0ICogRGVmYXVsdHMgdG8gNS5cblx0ICovXG5cdHNjcm9sbEJleW9uZExhc3RDb2x1bW4/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhhdCB0aGUgZWRpdG9yIGFuaW1hdGVzIHNjcm9sbGluZyB0byBhIHBvc2l0aW9uLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdHNtb290aFNjcm9sbGluZz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhhdCB0aGUgZWRpdG9yIHdpbGwgaW5zdGFsbCBhIFJlc2l6ZU9ic2VydmVyIHRvIGNoZWNrIGlmIGl0cyBjb250YWluZXIgZG9tIG5vZGUgc2l6ZSBoYXMgY2hhbmdlZC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRhdXRvbWF0aWNMYXlvdXQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgd3JhcHBpbmcgb2YgdGhlIGVkaXRvci5cblx0ICogV2hlbiBgd29yZFdyYXBgID0gXCJvZmZcIiwgdGhlIGxpbmVzIHdpbGwgbmV2ZXIgd3JhcC5cblx0ICogV2hlbiBgd29yZFdyYXBgID0gXCJvblwiLCB0aGUgbGluZXMgd2lsbCB3cmFwIGF0IHRoZSB2aWV3cG9ydCB3aWR0aC5cblx0ICogV2hlbiBgd29yZFdyYXBgID0gXCJ3b3JkV3JhcENvbHVtblwiLCB0aGUgbGluZXMgd2lsbCB3cmFwIGF0IGB3b3JkV3JhcENvbHVtbmAuXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwiYm91bmRlZFwiLCB0aGUgbGluZXMgd2lsbCB3cmFwIGF0IG1pbih2aWV3cG9ydCB3aWR0aCwgd29yZFdyYXBDb2x1bW4pLlxuXHQgKiBEZWZhdWx0cyB0byBcIm9mZlwiLlxuXHQgKi9cblx0d29yZFdyYXA/OiAnb2ZmJyB8ICdvbicgfCAnd29yZFdyYXBDb2x1bW4nIHwgJ2JvdW5kZWQnO1xuXHQvKipcblx0ICogT3ZlcnJpZGUgdGhlIGB3b3JkV3JhcGAgc2V0dGluZy5cblx0ICovXG5cdHdvcmRXcmFwT3ZlcnJpZGUxPzogJ29mZicgfCAnb24nIHwgJ2luaGVyaXQnO1xuXHQvKipcblx0ICogT3ZlcnJpZGUgdGhlIGB3b3JkV3JhcE92ZXJyaWRlMWAgc2V0dGluZy5cblx0ICovXG5cdHdvcmRXcmFwT3ZlcnJpZGUyPzogJ29mZicgfCAnb24nIHwgJ2luaGVyaXQnO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgd3JhcHBpbmcgb2YgdGhlIGVkaXRvci5cblx0ICogV2hlbiBgd29yZFdyYXBgID0gXCJvZmZcIiwgdGhlIGxpbmVzIHdpbGwgbmV2ZXIgd3JhcC5cblx0ICogV2hlbiBgd29yZFdyYXBgID0gXCJvblwiLCB0aGUgbGluZXMgd2lsbCB3cmFwIGF0IHRoZSB2aWV3cG9ydCB3aWR0aC5cblx0ICogV2hlbiBgd29yZFdyYXBgID0gXCJ3b3JkV3JhcENvbHVtblwiLCB0aGUgbGluZXMgd2lsbCB3cmFwIGF0IGB3b3JkV3JhcENvbHVtbmAuXG5cdCAqIFdoZW4gYHdvcmRXcmFwYCA9IFwiYm91bmRlZFwiLCB0aGUgbGluZXMgd2lsbCB3cmFwIGF0IG1pbih2aWV3cG9ydCB3aWR0aCwgd29yZFdyYXBDb2x1bW4pLlxuXHQgKiBEZWZhdWx0cyB0byA4MC5cblx0ICovXG5cdHdvcmRXcmFwQ29sdW1uPzogbnVtYmVyO1xuXHQvKipcblx0ICogQ29udHJvbCBpbmRlbnRhdGlvbiBvZiB3cmFwcGVkIGxpbmVzLiBDYW4gYmU6ICdub25lJywgJ3NhbWUnLCAnaW5kZW50JyBvciAnZGVlcEluZGVudCcuXG5cdCAqIERlZmF1bHRzIHRvICdzYW1lJyBpbiB2c2NvZGUgYW5kIHRvICdub25lJyBpbiBtb25hY28tZWRpdG9yLlxuXHQgKi9cblx0d3JhcHBpbmdJbmRlbnQ/OiAnbm9uZScgfCAnc2FtZScgfCAnaW5kZW50JyB8ICdkZWVwSW5kZW50Jztcblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSB3cmFwcGluZyBzdHJhdGVneSB0byB1c2UuXG5cdCAqIERlZmF1bHRzIHRvICdzaW1wbGUnLlxuXHQgKi9cblx0d3JhcHBpbmdTdHJhdGVneT86ICdzaW1wbGUnIHwgJ2FkdmFuY2VkJztcblx0LyoqXG5cdCAqIENyZWF0ZSBhIHNvZnR3cmFwIG9uIGV2ZXJ5IHF1b3RlZCBcIlxcblwiIGxpdGVyYWwuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0d3JhcE9uRXNjYXBlZExpbmVGZWVkcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb25maWd1cmUgd29yZCB3cmFwcGluZyBjaGFyYWN0ZXJzLiBBIGJyZWFrIHdpbGwgYmUgaW50cm9kdWNlZCBiZWZvcmUgdGhlc2UgY2hhcmFjdGVycy5cblx0ICovXG5cdHdvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzPzogc3RyaW5nO1xuXHQvKipcblx0ICogQ29uZmlndXJlIHdvcmQgd3JhcHBpbmcgY2hhcmFjdGVycy4gQSBicmVhayB3aWxsIGJlIGludHJvZHVjZWQgYWZ0ZXIgdGhlc2UgY2hhcmFjdGVycy5cblx0ICovXG5cdHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnM/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBTZXRzIHdoZXRoZXIgbGluZSBicmVha3MgYXBwZWFyIHdoZXJldmVyIHRoZSB0ZXh0IHdvdWxkIG90aGVyd2lzZSBvdmVyZmxvdyBpdHMgY29udGVudCBib3guXG5cdCAqIFdoZW4gd29yZEJyZWFrID0gJ25vcm1hbCcsIFVzZSB0aGUgZGVmYXVsdCBsaW5lIGJyZWFrIHJ1bGUuXG5cdCAqIFdoZW4gd29yZEJyZWFrID0gJ2tlZXBBbGwnLCBXb3JkIGJyZWFrcyBzaG91bGQgbm90IGJlIHVzZWQgZm9yIENoaW5lc2UvSmFwYW5lc2UvS29yZWFuIChDSkspIHRleHQuIE5vbi1DSksgdGV4dCBiZWhhdmlvciBpcyB0aGUgc2FtZSBhcyBmb3Igbm9ybWFsLlxuXHQgKi9cblx0d29yZEJyZWFrPzogJ25vcm1hbCcgfCAna2VlcEFsbCc7XG5cdC8qKlxuXHQgKiBQZXJmb3JtYW5jZSBndWFyZDogU3RvcCByZW5kZXJpbmcgYSBsaW5lIGFmdGVyIHggY2hhcmFjdGVycy5cblx0ICogRGVmYXVsdHMgdG8gMTAwMDAuXG5cdCAqIFVzZSAtMSB0byBuZXZlciBzdG9wIHJlbmRlcmluZ1xuXHQgKi9cblx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcj86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbmZpZ3VyZSB0aGUgZWRpdG9yJ3MgaG92ZXIuXG5cdCAqL1xuXHRob3Zlcj86IElFZGl0b3JIb3Zlck9wdGlvbnM7XG5cdC8qKlxuXHQgKiBFbmFibGUgZGV0ZWN0aW5nIGxpbmtzIGFuZCBtYWtpbmcgdGhlbSBjbGlja2FibGUuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRsaW5rcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgaW5saW5lIGNvbG9yIGRlY29yYXRvcnMgYW5kIGNvbG9yIHBpY2tlciByZW5kZXJpbmcuXG5cdCAqL1xuXHRjb2xvckRlY29yYXRvcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hhdCBpcyB0aGUgY29uZGl0aW9uIHRvIHNwYXduIGEgY29sb3IgcGlja2VyIGZyb20gYSBjb2xvciBkZWN0b3JhdG9yXG5cdCAqL1xuXHRjb2xvckRlY29yYXRvcnNBY3RpdmF0ZWRPbj86ICdjbGlja0FuZEhvdmVyJyB8ICdjbGljaycgfCAnaG92ZXInO1xuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIG1heCBudW1iZXIgb2YgY29sb3IgZGVjb3JhdG9ycyB0aGF0IGNhbiBiZSByZW5kZXJlZCBpbiBhbiBlZGl0b3IgYXQgb25jZS5cblx0ICovXG5cdGNvbG9yRGVjb3JhdG9yc0xpbWl0PzogbnVtYmVyO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgYmVoYXZpb3VyIG9mIGNvbW1lbnRzIGluIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRjb21tZW50cz86IElFZGl0b3JDb21tZW50c09wdGlvbnM7XG5cdC8qKlxuXHQgKiBFbmFibGUgY3VzdG9tIGNvbnRleHRtZW51LlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0Y29udGV4dG1lbnU/OiBib29sZWFuO1xuXHQvKipcblx0ICogQSBtdWx0aXBsaWVyIHRvIGJlIHVzZWQgb24gdGhlIGBkZWx0YVhgIGFuZCBgZGVsdGFZYCBvZiBtb3VzZSB3aGVlbCBzY3JvbGwgZXZlbnRzLlxuXHQgKiBEZWZhdWx0cyB0byAxLlxuXHQgKi9cblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5PzogbnVtYmVyO1xuXHQvKipcblx0ICogRmFzdFNjcm9sbGluZyBtdWxpdHBsaWVyIHNwZWVkIHdoZW4gcHJlc3NpbmcgYEFsdGBcblx0ICogRGVmYXVsdHMgdG8gNS5cblx0ICovXG5cdGZhc3RTY3JvbGxTZW5zaXRpdml0eT86IG51bWJlcjtcblx0LyoqXG5cdCAqIEVuYWJsZSB0aGF0IHRoZSBlZGl0b3Igc2Nyb2xscyBvbmx5IHRoZSBwcmVkb21pbmFudCBheGlzLiBQcmV2ZW50cyBob3Jpem9udGFsIGRyaWZ0IHdoZW4gc2Nyb2xsaW5nIHZlcnRpY2FsbHkgb24gYSB0cmFja3BhZC5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNjcm9sbFByZWRvbWluYW50QXhpcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBNYWtlIHNjcm9sbGluZyBpbmVydGlhbCAtIG1vc3RseSB1c2VmdWwgd2l0aCB0b3VjaHBhZCBvbiBsaW51eC5cblx0ICovXG5cdGluZXJ0aWFsU2Nyb2xsPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSB0aGF0IHRoZSBzZWxlY3Rpb24gd2l0aCB0aGUgbW91c2UgYW5kIGtleXMgaXMgZG9pbmcgY29sdW1uIHNlbGVjdGlvbi5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRjb2x1bW5TZWxlY3Rpb24/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGhlIG1vZGlmaWVyIHRvIGJlIHVzZWQgdG8gYWRkIG11bHRpcGxlIGN1cnNvcnMgd2l0aCB0aGUgbW91c2UuXG5cdCAqIERlZmF1bHRzIHRvICdhbHQnXG5cdCAqL1xuXHRtdWx0aUN1cnNvck1vZGlmaWVyPzogJ2N0cmxDbWQnIHwgJ2FsdCc7XG5cdC8qKlxuXHQgKiBNZXJnZSBvdmVybGFwcGluZyBzZWxlY3Rpb25zLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlXG5cdCAqL1xuXHRtdWx0aUN1cnNvck1lcmdlT3ZlcmxhcHBpbmc/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29uZmlndXJlIHRoZSBiZWhhdmlvdXIgd2hlbiBwYXN0aW5nIGEgdGV4dCB3aXRoIHRoZSBsaW5lIGNvdW50IGVxdWFsIHRvIHRoZSBjdXJzb3IgY291bnQuXG5cdCAqIERlZmF1bHRzIHRvICdzcHJlYWQnLlxuXHQgKi9cblx0bXVsdGlDdXJzb3JQYXN0ZT86ICdzcHJlYWQnIHwgJ2Z1bGwnO1xuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIG1heCBudW1iZXIgb2YgdGV4dCBjdXJzb3JzIHRoYXQgY2FuIGJlIGluIGFuIGFjdGl2ZSBlZGl0b3IgYXQgb25jZS5cblx0ICovXG5cdG11bHRpQ3Vyc29yTGltaXQ/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGVzIG1pZGRsZSBtb3VzZSBidXR0b24gdG8gb3BlbiBsaW5rcyBhbmQgR28gVG8gRGVmaW5pdGlvblxuXHQgKi9cblx0bW91c2VNaWRkbGVDbGlja0FjdGlvbj86IE1vdXNlTWlkZGxlQ2xpY2tBY3Rpb247XG5cdC8qKlxuXHQgKiBDb25maWd1cmUgdGhlIGVkaXRvcidzIGFjY2Vzc2liaWxpdHkgc3VwcG9ydC5cblx0ICogRGVmYXVsdHMgdG8gJ2F1dG8nLiBJdCBpcyBiZXN0IHRvIGxlYXZlIHRoaXMgdG8gJ2F1dG8nLlxuXHQgKi9cblx0YWNjZXNzaWJpbGl0eVN1cHBvcnQ/OiAnYXV0bycgfCAnb2ZmJyB8ICdvbic7XG5cdC8qKlxuXHQgKiBDb250cm9scyB0aGUgbnVtYmVyIG9mIGxpbmVzIGluIHRoZSBlZGl0b3IgdGhhdCBjYW4gYmUgcmVhZCBvdXQgYnkgYSBzY3JlZW4gcmVhZGVyXG5cdCAqL1xuXHRhY2Nlc3NpYmlsaXR5UGFnZVNpemU/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBTdWdnZXN0IG9wdGlvbnMuXG5cdCAqL1xuXHRzdWdnZXN0PzogSVN1Z2dlc3RPcHRpb25zO1xuXHRpbmxpbmVTdWdnZXN0PzogSUlubGluZVN1Z2dlc3RPcHRpb25zO1xuXHQvKipcblx0ICogU21hcnQgc2VsZWN0IG9wdGlvbnMuXG5cdCAqL1xuXHRzbWFydFNlbGVjdD86IElTbWFydFNlbGVjdE9wdGlvbnM7XG5cdC8qKlxuXHQgKlxuXHQgKi9cblx0Z290b0xvY2F0aW9uPzogSUdvdG9Mb2NhdGlvbk9wdGlvbnM7XG5cdC8qKlxuXHQgKiBFbmFibGUgcXVpY2sgc3VnZ2VzdGlvbnMgKHNoYWRvdyBzdWdnZXN0aW9ucylcblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHF1aWNrU3VnZ2VzdGlvbnM/OiBib29sZWFuIHwgUXVpY2tTdWdnZXN0aW9uc1ZhbHVlIHwgSVF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zO1xuXHQvKipcblx0ICogUXVpY2sgc3VnZ2VzdGlvbnMgc2hvdyBkZWxheSAoaW4gbXMpXG5cdCAqIERlZmF1bHRzIHRvIDEwIChtcylcblx0ICovXG5cdHF1aWNrU3VnZ2VzdGlvbnNEZWxheT86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHRoZSBzcGFjaW5nIGFyb3VuZCB0aGUgZWRpdG9yLlxuXHQgKi9cblx0cGFkZGluZz86IElFZGl0b3JQYWRkaW5nT3B0aW9ucztcblx0LyoqXG5cdCAqIFBhcmFtZXRlciBoaW50IG9wdGlvbnMuXG5cdCAqL1xuXHRwYXJhbWV0ZXJIaW50cz86IElFZGl0b3JQYXJhbWV0ZXJIaW50T3B0aW9ucztcblx0LyoqXG5cdCAqIE9wdGlvbnMgZm9yIGF1dG8gY2xvc2luZyBicmFja2V0cy5cblx0ICogRGVmYXVsdHMgdG8gbGFuZ3VhZ2UgZGVmaW5lZCBiZWhhdmlvci5cblx0ICovXG5cdGF1dG9DbG9zaW5nQnJhY2tldHM/OiBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5O1xuXHQvKipcblx0ICogT3B0aW9ucyBmb3IgYXV0byBjbG9zaW5nIGNvbW1lbnRzLlxuXHQgKiBEZWZhdWx0cyB0byBsYW5ndWFnZSBkZWZpbmVkIGJlaGF2aW9yLlxuXHQgKi9cblx0YXV0b0Nsb3NpbmdDb21tZW50cz86IEVkaXRvckF1dG9DbG9zaW5nU3RyYXRlZ3k7XG5cdC8qKlxuXHQgKiBPcHRpb25zIGZvciBhdXRvIGNsb3NpbmcgcXVvdGVzLlxuXHQgKiBEZWZhdWx0cyB0byBsYW5ndWFnZSBkZWZpbmVkIGJlaGF2aW9yLlxuXHQgKi9cblx0YXV0b0Nsb3NpbmdRdW90ZXM/OiBFZGl0b3JBdXRvQ2xvc2luZ1N0cmF0ZWd5O1xuXHQvKipcblx0ICogT3B0aW9ucyBmb3IgcHJlc3NpbmcgYmFja3NwYWNlIG5lYXIgcXVvdGVzIG9yIGJyYWNrZXQgcGFpcnMuXG5cdCAqL1xuXHRhdXRvQ2xvc2luZ0RlbGV0ZT86IEVkaXRvckF1dG9DbG9zaW5nRWRpdFN0cmF0ZWd5O1xuXHQvKipcblx0ICogT3B0aW9ucyBmb3IgdHlwaW5nIG92ZXIgY2xvc2luZyBxdW90ZXMgb3IgYnJhY2tldHMuXG5cdCAqL1xuXHRhdXRvQ2xvc2luZ092ZXJ0eXBlPzogRWRpdG9yQXV0b0Nsb3NpbmdFZGl0U3RyYXRlZ3k7XG5cdC8qKlxuXHQgKiBPcHRpb25zIGZvciBhdXRvIHN1cnJvdW5kaW5nLlxuXHQgKiBEZWZhdWx0cyB0byBhbHdheXMgYWxsb3dpbmcgYXV0byBzdXJyb3VuZGluZy5cblx0ICovXG5cdGF1dG9TdXJyb3VuZD86IEVkaXRvckF1dG9TdXJyb3VuZFN0cmF0ZWd5O1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IGFkanVzdCB0aGUgaW5kZW50YXRpb24gd2hlbiB1c2VycyB0eXBlLCBwYXN0ZSwgbW92ZSBvciBpbmRlbnQgbGluZXMuXG5cdCAqIERlZmF1bHRzIHRvIGFkdmFuY2VkLlxuXHQgKi9cblx0YXV0b0luZGVudD86ICdub25lJyB8ICdrZWVwJyB8ICdicmFja2V0cycgfCAnYWR2YW5jZWQnIHwgJ2Z1bGwnO1xuXHQvKipcblx0ICogQm9vbGVhbiB3aGljaCBjb250cm9scyB3aGV0aGVyIHRvIGF1dG9pbmRlbnQgb24gcGFzdGVcblx0ICovXG5cdGF1dG9JbmRlbnRPblBhc3RlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEJvb2xlYW4gd2hpY2ggY29udHJvbHMgd2hldGhlciB0byBhdXRvaW5kZW50IG9uIHBhc3RlIHdpdGhpbiBhIHN0cmluZyB3aGVuIGF1dG9JbmRlbnRPblBhc3RlIGlzIGVuYWJsZWQuXG5cdCAqL1xuXHRhdXRvSW5kZW50T25QYXN0ZVdpdGhpblN0cmluZz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbXVsYXRlIHNlbGVjdGlvbiBiZWhhdmlvdXIgb2YgdGFiIGNoYXJhY3RlcnMgd2hlbiB1c2luZyBzcGFjZXMgZm9yIGluZGVudGF0aW9uLlxuXHQgKiBUaGlzIG1lYW5zIHNlbGVjdGlvbiB3aWxsIHN0aWNrIHRvIHRhYiBzdG9wcy5cblx0ICovXG5cdHN0aWNreVRhYlN0b3BzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSBmb3JtYXQgb24gdHlwZS5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRmb3JtYXRPblR5cGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIGZvcm1hdCBvbiBwYXN0ZS5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRmb3JtYXRPblBhc3RlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgZG91YmxlLWNsaWNraW5nIG5leHQgdG8gYSBicmFja2V0IG9yIHF1b3RlIHNlbGVjdHMgdGhlIGNvbnRlbnQgaW5zaWRlLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0ZG91YmxlQ2xpY2tTZWxlY3RzQmxvY2s/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgaWYgdGhlIGVkaXRvciBzaG91bGQgYWxsb3cgdG8gbW92ZSBzZWxlY3Rpb25zIHZpYSBkcmFnIGFuZCBkcm9wLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGRyYWdBbmREcm9wPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSB0aGUgc3VnZ2VzdGlvbiBib3ggdG8gcG9wLXVwIG9uIHRyaWdnZXIgY2hhcmFjdGVycy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHN1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEFjY2VwdCBzdWdnZXN0aW9ucyBvbiBFTlRFUi5cblx0ICogRGVmYXVsdHMgdG8gJ29uJy5cblx0ICovXG5cdGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyPzogJ29uJyB8ICdzbWFydCcgfCAnb2ZmJztcblx0LyoqXG5cdCAqIEFjY2VwdCBzdWdnZXN0aW9ucyBvbiBwcm92aWRlciBkZWZpbmVkIGNoYXJhY3RlcnMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRhY2NlcHRTdWdnZXN0aW9uT25Db21taXRDaGFyYWN0ZXI/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIHNuaXBwZXQgc3VnZ2VzdGlvbnMuIERlZmF1bHQgdG8gJ3RydWUnLlxuXHQgKi9cblx0c25pcHBldFN1Z2dlc3Rpb25zPzogJ3RvcCcgfCAnYm90dG9tJyB8ICdpbmxpbmUnIHwgJ25vbmUnO1xuXHQvKipcblx0ICogQ29weWluZyB3aXRob3V0IGEgc2VsZWN0aW9uIGNvcGllcyB0aGUgY3VycmVudCBsaW5lLlxuXHQgKi9cblx0ZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogU3ludGF4IGhpZ2hsaWdodGluZyBpcyBjb3BpZWQuXG5cdCAqL1xuXHRjb3B5V2l0aFN5bnRheEhpZ2hsaWdodGluZz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGUgaGlzdG9yeSBtb2RlIGZvciBzdWdnZXN0aW9ucy5cblx0ICovXG5cdHN1Z2dlc3RTZWxlY3Rpb24/OiAnZmlyc3QnIHwgJ3JlY2VudGx5VXNlZCcgfCAncmVjZW50bHlVc2VkQnlQcmVmaXgnO1xuXHQvKipcblx0ICogVGhlIGZvbnQgc2l6ZSBmb3IgdGhlIHN1Z2dlc3Qgd2lkZ2V0LlxuXHQgKiBEZWZhdWx0cyB0byB0aGUgZWRpdG9yIGZvbnQgc2l6ZS5cblx0ICovXG5cdHN1Z2dlc3RGb250U2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBsaW5lIGhlaWdodCBmb3IgdGhlIHN1Z2dlc3Qgd2lkZ2V0LlxuXHQgKiBEZWZhdWx0cyB0byB0aGUgZWRpdG9yIGxpbmUgaGVpZ2h0LlxuXHQgKi9cblx0c3VnZ2VzdExpbmVIZWlnaHQ/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGFiIGNvbXBsZXRpb24uXG5cdCAqL1xuXHR0YWJDb21wbGV0aW9uPzogJ29uJyB8ICdvZmYnIHwgJ29ubHlTbmlwcGV0cyc7XG5cdC8qKlxuXHQgKiBFbmFibGUgc2VsZWN0aW9uIGhpZ2hsaWdodC5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNlbGVjdGlvbkhpZ2hsaWdodD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgc2VsZWN0aW9uIGhpZ2hsaWdodCBmb3IgbXVsdGlsaW5lIHNlbGVjdGlvbnMuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0c2VsZWN0aW9uSGlnaGxpZ2h0TXVsdGlsaW5lPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIE1heGltdW0gbGVuZ3RoIChpbiBjaGFyYWN0ZXJzKSBmb3Igc2VsZWN0aW9uIGhpZ2hsaWdodHMuXG5cdCAqIFNldCB0byAwIHRvIGhhdmUgYW4gdW5saW1pdGVkIGxlbmd0aC5cblx0ICovXG5cdHNlbGVjdGlvbkhpZ2hsaWdodE1heExlbmd0aD86IG51bWJlcjtcblx0LyoqXG5cdCAqIEVuYWJsZSBzZW1hbnRpYyBvY2N1cnJlbmNlcyBoaWdobGlnaHQuXG5cdCAqIERlZmF1bHRzIHRvICdzaW5nbGVGaWxlJy5cblx0ICogJ29mZicgZGlzYWJsZXMgb2NjdXJyZW5jZSBoaWdobGlnaHRpbmdcblx0ICogJ3NpbmdsZUZpbGUnIHRyaWdnZXJzIG9jY3VycmVuY2UgaGlnaGxpZ2h0aW5nIGluIHRoZSBjdXJyZW50IGRvY3VtZW50XG5cdCAqICdtdWx0aUZpbGUnICB0cmlnZ2VycyBvY2N1cnJlbmNlIGhpZ2hsaWdodGluZyBhY3Jvc3MgdmFsaWQgb3BlbiBkb2N1bWVudHNcblx0ICovXG5cdG9jY3VycmVuY2VzSGlnaGxpZ2h0PzogJ29mZicgfCAnc2luZ2xlRmlsZScgfCAnbXVsdGlGaWxlJztcblx0LyoqXG5cdCAqIENvbnRyb2xzIGRlbGF5IGZvciBvY2N1cnJlbmNlcyBoaWdobGlnaHRpbmdcblx0ICogRGVmYXVsdHMgdG8gMjUwLlxuXHQgKiBNaW5pbXVtIHZhbHVlIGlzIDBcblx0ICogTWF4aW11bSB2YWx1ZSBpcyAyMDAwXG5cdCAqL1xuXHRvY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5PzogbnVtYmVyO1xuXHQvKipcblx0ICogU2hvdyBjb2RlIGxlbnNcblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGNvZGVMZW5zPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvZGUgbGVucyBmb250IGZhbWlseS4gRGVmYXVsdHMgdG8gZWRpdG9yIGZvbnQgZmFtaWx5LlxuXHQgKi9cblx0Y29kZUxlbnNGb250RmFtaWx5Pzogc3RyaW5nO1xuXHQvKipcblx0ICogQ29kZSBsZW5zIGZvbnQgc2l6ZS4gRGVmYXVsdCB0byA5MCUgb2YgdGhlIGVkaXRvciBmb250IHNpemVcblx0ICovXG5cdGNvZGVMZW5zRm9udFNpemU/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSBiZWhhdmlvciBhbmQgcmVuZGVyaW5nIG9mIHRoZSBjb2RlIGFjdGlvbiBsaWdodGJ1bGIuXG5cdCAqL1xuXHRsaWdodGJ1bGI/OiBJRWRpdG9yTGlnaHRidWxiT3B0aW9ucztcblx0LyoqXG5cdCAqIFRpbWVvdXQgZm9yIHJ1bm5pbmcgY29kZSBhY3Rpb25zIG9uIHNhdmUuXG5cdCAqL1xuXHRjb2RlQWN0aW9uc09uU2F2ZVRpbWVvdXQ/OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBFbmFibGUgY29kZSBmb2xkaW5nLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0Zm9sZGluZz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTZWxlY3RzIHRoZSBmb2xkaW5nIHN0cmF0ZWd5LiAnYXV0bycgdXNlcyB0aGUgc3RyYXRlZ2llcyBjb250cmlidXRlZCBmb3IgdGhlIGN1cnJlbnQgZG9jdW1lbnQsICdpbmRlbnRhdGlvbicgdXNlcyB0aGUgaW5kZW50YXRpb24gYmFzZWQgZm9sZGluZyBzdHJhdGVneS5cblx0ICogRGVmYXVsdHMgdG8gJ2F1dG8nLlxuXHQgKi9cblx0Zm9sZGluZ1N0cmF0ZWd5PzogJ2F1dG8nIHwgJ2luZGVudGF0aW9uJztcblx0LyoqXG5cdCAqIEVuYWJsZSBoaWdobGlnaHQgZm9yIGZvbGRlZCByZWdpb25zLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0Zm9sZGluZ0hpZ2hsaWdodD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBBdXRvIGZvbGQgaW1wb3J0cyBmb2xkaW5nIHJlZ2lvbnMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRmb2xkaW5nSW1wb3J0c0J5RGVmYXVsdD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBNYXhpbXVtIG51bWJlciBvZiBmb2xkYWJsZSByZWdpb25zLlxuXHQgKiBEZWZhdWx0cyB0byA1MDAwLlxuXHQgKi9cblx0Zm9sZGluZ01heGltdW1SZWdpb25zPzogbnVtYmVyO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgZm9sZCBhY3Rpb25zIGluIHRoZSBndXR0ZXIgc3RheSBhbHdheXMgdmlzaWJsZSBvciBoaWRlIHVubGVzcyB0aGUgbW91c2UgaXMgb3ZlciB0aGUgZ3V0dGVyLlxuXHQgKiBEZWZhdWx0cyB0byAnbW91c2VvdmVyJy5cblx0ICovXG5cdHNob3dGb2xkaW5nQ29udHJvbHM/OiAnYWx3YXlzJyB8ICduZXZlcicgfCAnbW91c2VvdmVyJztcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgY2xpY2tpbmcgb24gdGhlIGVtcHR5IGNvbnRlbnQgYWZ0ZXIgYSBmb2xkZWQgbGluZSB3aWxsIHVuZm9sZCB0aGUgbGluZS5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHR1bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmU/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIGhpZ2hsaWdodGluZyBvZiBtYXRjaGluZyBicmFja2V0cy5cblx0ICogRGVmYXVsdHMgdG8gJ2Fsd2F5cycuXG5cdCAqL1xuXHRtYXRjaEJyYWNrZXRzPzogJ25ldmVyJyB8ICduZWFyJyB8ICdhbHdheXMnO1xuXHQvKipcblx0ICogRW5hYmxlIGV4cGVyaW1lbnRhbCByZW5kZXJpbmcgdXNpbmcgV2ViR1BVLlxuXHQgKiBEZWZhdWx0cyB0byAnb2ZmJy5cblx0ICovXG5cdGV4cGVyaW1lbnRhbEdwdUFjY2VsZXJhdGlvbj86ICdvbicgfCAnb2ZmJztcblx0LyoqXG5cdCAqIEVuYWJsZSBleHBlcmltZW50YWwgd2hpdGVzcGFjZSByZW5kZXJpbmcuXG5cdCAqIERlZmF1bHRzIHRvICdzdmcnLlxuXHQgKi9cblx0ZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZz86ICdzdmcnIHwgJ2ZvbnQnIHwgJ29mZic7XG5cdC8qKlxuXHQgKiBFbmFibGUgcmVuZGVyaW5nIG9mIHdoaXRlc3BhY2UuXG5cdCAqIERlZmF1bHRzIHRvICdzZWxlY3Rpb24nLlxuXHQgKi9cblx0cmVuZGVyV2hpdGVzcGFjZT86ICdub25lJyB8ICdib3VuZGFyeScgfCAnc2VsZWN0aW9uJyB8ICd0cmFpbGluZycgfCAnYWxsJztcblx0LyoqXG5cdCAqIEVuYWJsZSByZW5kZXJpbmcgb2YgY29udHJvbCBjaGFyYWN0ZXJzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0cmVuZGVyQ29udHJvbENoYXJhY3RlcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogRW5hYmxlIHJlbmRlcmluZyBvZiBjdXJyZW50IGxpbmUgaGlnaGxpZ2h0LlxuXHQgKiBEZWZhdWx0cyB0byBhbGwuXG5cdCAqL1xuXHRyZW5kZXJMaW5lSGlnaGxpZ2h0PzogJ25vbmUnIHwgJ2d1dHRlcicgfCAnbGluZScgfCAnYWxsJztcblx0LyoqXG5cdCAqIENvbnRyb2wgaWYgdGhlIGN1cnJlbnQgbGluZSBoaWdobGlnaHQgc2hvdWxkIGJlIHJlbmRlcmVkIG9ubHkgdGhlIGVkaXRvciBpcyBmb2N1c2VkLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdHJlbmRlckxpbmVIaWdobGlnaHRPbmx5V2hlbkZvY3VzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEluc2VydGluZyBhbmQgZGVsZXRpbmcgd2hpdGVzcGFjZSBmb2xsb3dzIHRhYiBzdG9wcy5cblx0ICovXG5cdHVzZVRhYlN0b3BzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgYXV0b21hdGljYWxseSByZW1vdmUgaW5kZW50YXRpb24gd2hpdGVzcGFjZSB3aGVuIGpvaW5pbmcgbGluZXMgd2l0aCBEZWxldGUuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0dHJpbVdoaXRlc3BhY2VPbkRlbGV0ZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBUaGUgZm9udCBmYW1pbHlcblx0ICovXG5cdGZvbnRGYW1pbHk/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgZm9udCB3ZWlnaHRcblx0ICovXG5cdGZvbnRXZWlnaHQ/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgZm9udCBzaXplXG5cdCAqL1xuXHRmb250U2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBsaW5lIGhlaWdodFxuXHQgKi9cblx0bGluZUhlaWdodD86IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSBsZXR0ZXIgc3BhY2luZ1xuXHQgKi9cblx0bGV0dGVyU3BhY2luZz86IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIGZhZGluZyBvdXQgb2YgdW51c2VkIHZhcmlhYmxlcy5cblx0ICovXG5cdHNob3dVbnVzZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byBmb2N1cyB0aGUgaW5saW5lIGVkaXRvciBpbiB0aGUgcGVlayB3aWRnZXQgYnkgZGVmYXVsdC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRwZWVrV2lkZ2V0RGVmYXVsdEZvY3VzPzogJ3RyZWUnIHwgJ2VkaXRvcic7XG5cblx0LyoqXG5cdCAqIFNldHMgYSBwbGFjZWhvbGRlciBmb3IgdGhlIGVkaXRvci5cblx0ICogSWYgc2V0LCB0aGUgcGxhY2Vob2xkZXIgaXMgc2hvd24gaWYgdGhlIGVkaXRvciBpcyBlbXB0eS5cblx0Ki9cblx0cGxhY2Vob2xkZXI/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGRlZmluaXRpb24gbGluayBvcGVucyBlbGVtZW50IGluIHRoZSBwZWVrIHdpZGdldC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRkZWZpbml0aW9uTGlua09wZW5zSW5QZWVrPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHN0cmlrZXRocm91Z2ggZGVwcmVjYXRlZCB2YXJpYWJsZXMuXG5cdCAqL1xuXHRzaG93RGVwcmVjYXRlZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHN1Z2dlc3Rpb25zIGFsbG93IG1hdGNoZXMgaW4gdGhlIG1pZGRsZSBvZiB0aGUgd29yZCBpbnN0ZWFkIG9mIG9ubHkgYXQgdGhlIGJlZ2lubmluZ1xuXHQgKi9cblx0bWF0Y2hPbldvcmRTdGFydE9ubHk/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgYmVoYXZpb3IgYW5kIHJlbmRlcmluZyBvZiB0aGUgaW5saW5lIGhpbnRzLlxuXHQgKi9cblx0aW5sYXlIaW50cz86IElFZGl0b3JJbmxheUhpbnRzT3B0aW9ucztcblx0LyoqXG5cdCAqIENvbnRyb2wgaWYgdGhlIGVkaXRvciBzaG91bGQgdXNlIHNoYWRvdyBET00uXG5cdCAqL1xuXHR1c2VTaGFkb3dET00/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgdGhlIGJlaGF2aW9yIG9mIGVkaXRvciBndWlkZXMuXG5cdCovXG5cdGd1aWRlcz86IElHdWlkZXNPcHRpb25zO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB0aGUgYmVoYXZpb3Igb2YgdGhlIHVuaWNvZGUgaGlnaGxpZ2h0IGZlYXR1cmVcblx0ICogKGJ5IGRlZmF1bHQsIGFtYmlndW91cyBhbmQgaW52aXNpYmxlIGNoYXJhY3RlcnMgYXJlIGhpZ2hsaWdodGVkKS5cblx0ICovXG5cdHVuaWNvZGVIaWdobGlnaHQ/OiBJVW5pY29kZUhpZ2hsaWdodE9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIENvbmZpZ3VyZXMgYnJhY2tldCBwYWlyIGNvbG9yaXphdGlvbiAoZGlzYWJsZWQgYnkgZGVmYXVsdCkuXG5cdCovXG5cdGJyYWNrZXRQYWlyQ29sb3JpemF0aW9uPzogSUJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucztcblxuXHQvKipcblx0ICogQ29udHJvbHMgZHJvcHBpbmcgaW50byB0aGUgZWRpdG9yIGZyb20gYW4gZXh0ZXJuYWwgc291cmNlLlxuXHQgKlxuXHQgKiBXaGVuIGVuYWJsZWQsIHRoaXMgc2hvd3MgYSBwcmV2aWV3IG9mIHRoZSBkcm9wIGxvY2F0aW9uIGFuZCB0cmlnZ2VycyBhbiBgb25Ecm9wSW50b0VkaXRvcmAgZXZlbnQuXG5cdCAqL1xuXHRkcm9wSW50b0VkaXRvcj86IElEcm9wSW50b0VkaXRvck9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIFNldHMgd2hldGhlciB0aGUgbmV3IGV4cGVyaW1lbnRhbCBlZGl0IGNvbnRleHQgc2hvdWxkIGJlIHVzZWQgaW5zdGVhZCBvZiB0aGUgdGV4dCBhcmVhLlxuXHQgKi9cblx0ZWRpdENvbnRleHQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIHRvIHJlbmRlciByaWNoIEhUTUwgc2NyZWVuIHJlYWRlciBjb250ZW50IHdoZW4gdGhlIEVkaXRDb250ZXh0IGlzIGVuYWJsZWRcblx0ICovXG5cdHJlbmRlclJpY2hTY3JlZW5SZWFkZXJDb250ZW50PzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgc3VwcG9ydCBmb3IgY2hhbmdpbmcgaG93IGNvbnRlbnQgaXMgcGFzdGVkIGludG8gdGhlIGVkaXRvci5cblx0ICovXG5cdHBhc3RlQXM/OiBJUGFzdGVBc09wdGlvbnM7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciAvIHRlcm1pbmFsIHJlY2VpdmVzIHRhYnMgb3IgZGVmZXJzIHRoZW0gdG8gdGhlIHdvcmtiZW5jaCBmb3IgbmF2aWdhdGlvbi5cblx0ICovXG5cdHRhYkZvY3VzTW9kZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIGFjY2Vzc2liaWxpdHkgaGludCBzaG91bGQgYmUgcHJvdmlkZWQgdG8gc2NyZWVuIHJlYWRlciB1c2VycyB3aGVuIGFuIGlubGluZSBjb21wbGV0aW9uIGlzIHNob3duLlxuXHQgKi9cblx0aW5saW5lQ29tcGxldGlvbnNBY2Nlc3NpYmlsaXR5VmVyYm9zZT86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKiBUaGUgd2lkdGggb2YgdGhlIG1pbmltYXAgZ3V0dGVyLCBpbiBwaXhlbHMuXG4gKi9cbmV4cG9ydCBjb25zdCBNSU5JTUFQX0dVVFRFUl9XSURUSCA9IDg7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpZmZFZGl0b3JCYXNlT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBBbGxvdyB0aGUgdXNlciB0byByZXNpemUgdGhlIGRpZmYgZWRpdG9yIHNwbGl0IHZpZXcuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRlbmFibGVTcGxpdFZpZXdSZXNpemluZz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBkZWZhdWx0IHJhdGlvIHdoZW4gcmVuZGVyaW5nIHNpZGUtYnktc2lkZSBlZGl0b3JzLlxuXHQgKiBNdXN0IGJlIGEgbnVtYmVyIGJldHdlZW4gMCBhbmQgMSwgbWluIHNpemVzIGFwcGx5LlxuXHQgKiBEZWZhdWx0cyB0byAwLjVcblx0ICovXG5cdHNwbGl0Vmlld0RlZmF1bHRSYXRpbz86IG51bWJlcjtcblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBkaWZmZXJlbmNlcyBpbiB0d28gc2lkZS1ieS1zaWRlIGVkaXRvcnMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRyZW5kZXJTaWRlQnlTaWRlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hlbiBgcmVuZGVyU2lkZUJ5U2lkZWAgaXMgZW5hYmxlZCwgYHVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWRgIGlzIHNldCxcblx0ICogYW5kIHRoZSBkaWZmIGVkaXRvciBoYXMgYSB3aWR0aCBsZXNzIHRoYW4gYHJlbmRlclNpZGVCeVNpZGVJbmxpbmVCcmVha3BvaW50YCwgdGhlIGlubGluZSB2aWV3IGlzIHVzZWQuXG5cdCAqL1xuXHRyZW5kZXJTaWRlQnlTaWRlSW5saW5lQnJlYWtwb2ludD86IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2hlbiBgcmVuZGVyU2lkZUJ5U2lkZWAgaXMgZW5hYmxlZCwgYHVzZUlubGluZVZpZXdXaGVuU3BhY2VJc0xpbWl0ZWRgIGlzIHNldCxcblx0ICogYW5kIHRoZSBkaWZmIGVkaXRvciBoYXMgYSB3aWR0aCBsZXNzIHRoYW4gYHJlbmRlclNpZGVCeVNpZGVJbmxpbmVCcmVha3BvaW50YCwgdGhlIGlubGluZSB2aWV3IGlzIHVzZWQuXG5cdCAqL1xuXHR1c2VJbmxpbmVWaWV3V2hlblNwYWNlSXNMaW1pdGVkPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSWYgc2V0LCB0aGUgZGlmZiBlZGl0b3IgaXMgb3B0aW1pemVkIGZvciBzbWFsbCB2aWV3cy5cblx0ICogRGVmYXVsdHMgdG8gYGZhbHNlYC5cblx0Ki9cblx0Y29tcGFjdE1vZGU/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJZiBzZXQsIHRoZSBvcmlnaW5hbCBlZGl0b3IncyBsaW5lIG51bWJlcnMgYXJlIGhpZGRlbiBpbiB0aGUgaW5saW5lIHZpZXcuXG5cdCAqIERlZmF1bHRzIHRvIGBmYWxzZWAuXG5cdCAqIEBpbnRlcm5hbFxuXHQqL1xuXHRoaWRlT3JpZ2luYWxMaW5lTnVtYmVycz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRpbWVvdXQgaW4gbWlsbGlzZWNvbmRzIGFmdGVyIHdoaWNoIGRpZmYgY29tcHV0YXRpb24gaXMgY2FuY2VsbGVkLlxuXHQgKiBEZWZhdWx0cyB0byA1MDAwLlxuXHQgKi9cblx0bWF4Q29tcHV0YXRpb25UaW1lPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBNYXhpbXVtIHN1cHBvcnRlZCBmaWxlIHNpemUgaW4gTUIuXG5cdCAqIERlZmF1bHRzIHRvIDUwLlxuXHQgKi9cblx0bWF4RmlsZVNpemU/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIENvbXB1dGUgdGhlIGRpZmYgYnkgaWdub3JpbmcgbGVhZGluZy90cmFpbGluZyB3aGl0ZXNwYWNlXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRpZ25vcmVUcmltV2hpdGVzcGFjZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFJlbmRlciArLy0gaW5kaWNhdG9ycyBmb3IgYWRkZWQvZGVsZXRlZCBjaGFuZ2VzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0cmVuZGVySW5kaWNhdG9ycz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFNob3dzIGljb25zIGluIHRoZSBnbHlwaCBtYXJnaW4gdG8gcmV2ZXJ0IGNoYW5nZXMuXG5cdCAqIERlZmF1bHQgdG8gdHJ1ZS5cblx0ICovXG5cdHJlbmRlck1hcmdpblJldmVydEljb24/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBJbmRpY2F0ZXMgaWYgdGhlIGd1dHRlciBtZW51IHNob3VsZCBiZSByZW5kZXJlZC5cblx0Ki9cblx0cmVuZGVyR3V0dGVyTWVudT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIE9yaWdpbmFsIG1vZGVsIHNob3VsZCBiZSBlZGl0YWJsZT9cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRvcmlnaW5hbEVkaXRhYmxlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2hvdWxkIHRoZSBkaWZmIGVkaXRvciBlbmFibGUgY29kZSBsZW5zP1xuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICovXG5cdGRpZmZDb2RlTGVucz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIElzIHRoZSBkaWZmIGVkaXRvciBzaG91bGQgcmVuZGVyIG92ZXJ2aWV3IHJ1bGVyXG5cdCAqIERlZmF1bHRzIHRvIHRydWVcblx0ICovXG5cdHJlbmRlck92ZXJ2aWV3UnVsZXI/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSB3cmFwcGluZyBvZiB0aGUgZGlmZiBlZGl0b3IuXG5cdCAqL1xuXHRkaWZmV29yZFdyYXA/OiAnb2ZmJyB8ICdvbicgfCAnaW5oZXJpdCc7XG5cblx0LyoqXG5cdCAqIERpZmYgQWxnb3JpdGhtXG5cdCovXG5cdGRpZmZBbGdvcml0aG0/OiAnbGVnYWN5JyB8ICdhZHZhbmNlZCcgfCAnYWR2YW5jZWQtZXh0ZXJuYWwnIHwgJ2FkdmFuY2VkLXdhc20nO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBkaWZmIGVkaXRvciBhcmlhIGxhYmVsIHNob3VsZCBiZSB2ZXJib3NlLlxuXHQgKi9cblx0YWNjZXNzaWJpbGl0eVZlcmJvc2U/OiBib29sZWFuO1xuXG5cdGV4cGVyaW1lbnRhbD86IHtcblx0XHQvKipcblx0XHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0XHQgKi9cblx0XHRzaG93TW92ZXM/OiBib29sZWFuO1xuXG5cdFx0c2hvd0VtcHR5RGVjb3JhdGlvbnM/OiBib29sZWFuO1xuXG5cdFx0LyoqXG5cdFx0ICogT25seSBhcHBsaWVzIHdoZW4gYHJlbmRlclNpZGVCeVNpZGVgIGlzIHNldCB0byBmYWxzZS5cblx0XHQqL1xuXHRcdHVzZVRydWVJbmxpbmVWaWV3PzogYm9vbGVhbjtcblx0fTtcblxuXHQvKipcblx0ICogSXMgdGhlIGRpZmYgZWRpdG9yIGluc2lkZSBhbm90aGVyIGVkaXRvclxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZVxuXHQgKi9cblx0aXNJbkVtYmVkZGVkRWRpdG9yPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogSWYgdGhlIGRpZmYgZWRpdG9yIHNob3VsZCBvbmx5IHNob3cgdGhlIGRpZmZlcmVuY2UgcmV2aWV3IG1vZGUuXG5cdCAqL1xuXHRvbmx5U2hvd0FjY2Vzc2libGVEaWZmVmlld2VyPzogYm9vbGVhbjtcblxuXHRoaWRlVW5jaGFuZ2VkUmVnaW9ucz86IHtcblx0XHRlbmFibGVkPzogYm9vbGVhbjtcblx0XHRyZXZlYWxMaW5lQ291bnQ/OiBudW1iZXI7XG5cdFx0bWluaW11bUxpbmVDb3VudD86IG51bWJlcjtcblx0XHRjb250ZXh0TGluZUNvdW50PzogbnVtYmVyO1xuXHR9O1xufVxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIGRpZmYgZWRpdG9yLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElEaWZmRWRpdG9yT3B0aW9ucyBleHRlbmRzIElFZGl0b3JPcHRpb25zLCBJRGlmZkVkaXRvckJhc2VPcHRpb25zIHtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgVmFsaWREaWZmRWRpdG9yQmFzZU9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJRGlmZkVkaXRvckJhc2VPcHRpb25zPj47XG5cbi8vI2VuZHJlZ2lvblxuXG4vKipcbiAqIEFuIGV2ZW50IGRlc2NyaWJpbmcgdGhhdCB0aGUgY29uZmlndXJhdGlvbiBvZiB0aGUgZWRpdG9yIGhhcyBjaGFuZ2VkLlxuICovXG5leHBvcnQgY2xhc3MgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZhbHVlczogYm9vbGVhbltdO1xuXHQvKipcblx0ICogQGludGVybmFsXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcih2YWx1ZXM6IGJvb2xlYW5bXSkge1xuXHRcdHRoaXMuX3ZhbHVlcyA9IHZhbHVlcztcblx0fVxuXHRwdWJsaWMgaGFzQ2hhbmdlZChpZDogRWRpdG9yT3B0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlc1tpZF07XG5cdH1cbn1cblxuLyoqXG4gKiBBbGwgY29tcHV0ZWQgZWRpdG9yIG9wdGlvbnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyB7XG5cdGdldDxUIGV4dGVuZHMgRWRpdG9yT3B0aW9uPihpZDogVCk6IEZpbmRDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlQnlJZDxUPjtcbn1cblxuLy8jcmVnaW9uIElFZGl0b3JPcHRpb25cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRW52aXJvbm1lbnRhbE9wdGlvbnMge1xuXHRyZWFkb25seSBtZW1vcnk6IENvbXB1dGVPcHRpb25zTWVtb3J5IHwgbnVsbDtcblx0cmVhZG9ubHkgb3V0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRlckhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBmb250SW5mbzogRm9udEluZm87XG5cdHJlYWRvbmx5IGV4dHJhRWRpdG9yQ2xhc3NOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzRG9taW5hdGVkQnlMb25nTGluZXM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZpZXdMaW5lQ291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbGluZU51bWJlcnNEaWdpdENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkOiBib29sZWFuO1xuXHRyZWFkb25seSBwaXhlbFJhdGlvOiBudW1iZXI7XG5cdHJlYWRvbmx5IHRhYkZvY3VzTW9kZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5wdXRNb2RlOiAnaW5zZXJ0JyB8ICdvdmVydHlwZSc7XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTdXBwb3J0OiBBY2Nlc3NpYmlsaXR5U3VwcG9ydDtcblx0cmVhZG9ubHkgZ2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGVkaXRDb250ZXh0U3VwcG9ydGVkOiBib29sZWFuO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgY2xhc3MgQ29tcHV0ZU9wdGlvbnNNZW1vcnkge1xuXG5cdHB1YmxpYyBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQ6IElNaW5pbWFwTGF5b3V0SW5wdXQgfCBudWxsO1xuXHRwdWJsaWMgc3RhYmxlRml0TWF4TWluaW1hcFNjYWxlOiBudW1iZXI7XG5cdHB1YmxpYyBzdGFibGVGaXRSZW1haW5pbmdXaWR0aDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuc3RhYmxlTWluaW1hcExheW91dElucHV0ID0gbnVsbDtcblx0XHR0aGlzLnN0YWJsZUZpdE1heE1pbmltYXBTY2FsZSA9IDA7XG5cdFx0dGhpcy5zdGFibGVGaXRSZW1haW5pbmdXaWR0aCA9IDA7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yT3B0aW9uPEsgZXh0ZW5kcyBFZGl0b3JPcHRpb24sIFY+IHtcblx0cmVhZG9ubHkgaWQ6IEs7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0ZGVmYXVsdFZhbHVlOiBWO1xuXHQvKipcblx0ICogQGludGVybmFsXG5cdCAqL1xuXHRyZWFkb25seSBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB7IFtwYXRoOiBzdHJpbmddOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBAaW50ZXJuYWxcblx0ICovXG5cdHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogVjtcblx0LyoqXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0Y29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IFYpOiBWO1xuXG5cdC8qKlxuXHQgKiBNaWdodCBtb2RpZnkgYHZhbHVlYC5cblx0Ki9cblx0YXBwbHlVcGRhdGUodmFsdWU6IFYgfCB1bmRlZmluZWQsIHVwZGF0ZTogVik6IEFwcGx5VXBkYXRlUmVzdWx0PFY+O1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG50eXBlIFBvc3NpYmxlS2V5TmFtZTA8Vj4gPSB7IFtLIGluIGtleW9mIElFZGl0b3JPcHRpb25zXTogSUVkaXRvck9wdGlvbnNbS10gZXh0ZW5kcyBWIHwgdW5kZWZpbmVkID8gSyA6IG5ldmVyIH1ba2V5b2YgSUVkaXRvck9wdGlvbnNdO1xuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xudHlwZSBQb3NzaWJsZUtleU5hbWU8Vj4gPSBOb25OdWxsYWJsZTxQb3NzaWJsZUtleU5hbWUwPFY+PjtcblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuYWJzdHJhY3QgY2xhc3MgQmFzZUVkaXRvck9wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uLCBULCBWPiBpbXBsZW1lbnRzIElFZGl0b3JPcHRpb248SywgVj4ge1xuXG5cdHB1YmxpYyByZWFkb25seSBpZDogSztcblx0cHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cHVibGljIHJlYWRvbmx5IGRlZmF1bHRWYWx1ZTogVjtcblx0cHVibGljIHJlYWRvbmx5IHNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHsgW3BhdGg6IHN0cmluZ106IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihpZDogSywgbmFtZTogUG9zc2libGVLZXlOYW1lPFQ+LCBkZWZhdWx0VmFsdWU6IFYsIHNjaGVtYT86IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB7IFtwYXRoOiBzdHJpbmddOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0pIHtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmRlZmF1bHRWYWx1ZSA9IGRlZmF1bHRWYWx1ZTtcblx0XHR0aGlzLnNjaGVtYSA9IHNjaGVtYTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseVVwZGF0ZSh2YWx1ZTogViB8IHVuZGVmaW5lZCwgdXBkYXRlOiBWKTogQXBwbHlVcGRhdGVSZXN1bHQ8Vj4ge1xuXHRcdHJldHVybiBhcHBseVVwZGF0ZSh2YWx1ZSwgdXBkYXRlKTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFY7XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIHZhbHVlOiBWKTogViB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBcHBseVVwZGF0ZVJlc3VsdDxUPiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBuZXdWYWx1ZTogVCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGlkQ2hhbmdlOiBib29sZWFuXG5cdCkgeyB9XG59XG5cbmZ1bmN0aW9uIGFwcGx5VXBkYXRlPFQ+KHZhbHVlOiBUIHwgdW5kZWZpbmVkLCB1cGRhdGU6IFQpOiBBcHBseVVwZGF0ZVJlc3VsdDxUPiB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IHR5cGVvZiB1cGRhdGUgIT09ICdvYmplY3QnIHx8ICF2YWx1ZSB8fCAhdXBkYXRlKSB7XG5cdFx0cmV0dXJuIG5ldyBBcHBseVVwZGF0ZVJlc3VsdCh1cGRhdGUsIHZhbHVlICE9PSB1cGRhdGUpO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSB8fCBBcnJheS5pc0FycmF5KHVwZGF0ZSkpIHtcblx0XHRjb25zdCBhcnJheUVxdWFscyA9IEFycmF5LmlzQXJyYXkodmFsdWUpICYmIEFycmF5LmlzQXJyYXkodXBkYXRlKSAmJiBhcnJheXMuZXF1YWxzKHZhbHVlLCB1cGRhdGUpO1xuXHRcdHJldHVybiBuZXcgQXBwbHlVcGRhdGVSZXN1bHQodXBkYXRlLCAhYXJyYXlFcXVhbHMpO1xuXHR9XG5cdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblx0Zm9yIChjb25zdCBrZXkgaW4gdXBkYXRlKSB7XG5cdFx0aWYgKHVwZGF0ZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhcHBseVVwZGF0ZSh2YWx1ZVtrZXldLCB1cGRhdGVba2V5XSk7XG5cdFx0XHRpZiAocmVzdWx0LmRpZENoYW5nZSkge1xuXHRcdFx0XHR2YWx1ZVtrZXldID0gcmVzdWx0Lm5ld1ZhbHVlO1xuXHRcdFx0XHRkaWRDaGFuZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRyZXR1cm4gbmV3IEFwcGx5VXBkYXRlUmVzdWx0KHZhbHVlLCBkaWRDaGFuZ2UpO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5hYnN0cmFjdCBjbGFzcyBDb21wdXRlZEVkaXRvck9wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uLCBWPiBpbXBsZW1lbnRzIElFZGl0b3JPcHRpb248SywgVj4ge1xuXG5cdHB1YmxpYyByZWFkb25seSBpZDogSztcblx0cHVibGljIHJlYWRvbmx5IG5hbWU6ICdfbmV2ZXJfJztcblx0cHVibGljIHJlYWRvbmx5IGRlZmF1bHRWYWx1ZTogVjtcblx0cHVibGljIHJlYWRvbmx5IHNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihpZDogSywgZGVmYXVsdFZhbHVlOiBWKSB7XG5cdFx0dGhpcy5pZCA9IGlkO1xuXHRcdHRoaXMubmFtZSA9ICdfbmV2ZXJfJztcblx0XHR0aGlzLmRlZmF1bHRWYWx1ZSA9IGRlZmF1bHRWYWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseVVwZGF0ZSh2YWx1ZTogViB8IHVuZGVmaW5lZCwgdXBkYXRlOiBWKTogQXBwbHlVcGRhdGVSZXN1bHQ8Vj4ge1xuXHRcdHJldHVybiBhcHBseVVwZGF0ZSh2YWx1ZSwgdXBkYXRlKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFYge1xuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogVik6IFY7XG59XG5cbmFic3RyYWN0IGNsYXNzIFNpbXBsZUVkaXRvck9wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uLCBWPiBpbXBsZW1lbnRzIElFZGl0b3JPcHRpb248SywgVj4ge1xuXG5cdHB1YmxpYyByZWFkb25seSBpZDogSztcblx0cHVibGljIHJlYWRvbmx5IG5hbWU6IFBvc3NpYmxlS2V5TmFtZTxWPjtcblx0cHVibGljIHJlYWRvbmx5IGRlZmF1bHRWYWx1ZTogVjtcblx0cHVibGljIHJlYWRvbmx5IHNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihpZDogSywgbmFtZTogUG9zc2libGVLZXlOYW1lPFY+LCBkZWZhdWx0VmFsdWU6IFYsIHNjaGVtYT86IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEpIHtcblx0XHR0aGlzLmlkID0gaWQ7XG5cdFx0dGhpcy5uYW1lID0gbmFtZTtcblx0XHR0aGlzLmRlZmF1bHRWYWx1ZSA9IGRlZmF1bHRWYWx1ZTtcblx0XHR0aGlzLnNjaGVtYSA9IHNjaGVtYTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseVVwZGF0ZSh2YWx1ZTogViB8IHVuZGVmaW5lZCwgdXBkYXRlOiBWKTogQXBwbHlVcGRhdGVSZXN1bHQ8Vj4ge1xuXHRcdHJldHVybiBhcHBseVVwZGF0ZSh2YWx1ZSwgdXBkYXRlKTtcblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFY7XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIHZhbHVlOiBWKTogViB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBib29sZWFuKHZhbHVlOiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdGlmICh2YWx1ZSA9PT0gJ2ZhbHNlJykge1xuXHRcdC8vIHRyZWF0IHRoZSBzdHJpbmcgJ2ZhbHNlJyBhcyBmYWxzZVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gQm9vbGVhbih2YWx1ZSk7XG59XG5cbmNsYXNzIEVkaXRvckJvb2xlYW5PcHRpb248SyBleHRlbmRzIEVkaXRvck9wdGlvbj4gZXh0ZW5kcyBTaW1wbGVFZGl0b3JPcHRpb248SywgYm9vbGVhbj4ge1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBLLCBuYW1lOiBQb3NzaWJsZUtleU5hbWU8Ym9vbGVhbj4sIGRlZmF1bHRWYWx1ZTogYm9vbGVhbiwgc2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKSB7XG5cdFx0aWYgKHR5cGVvZiBzY2hlbWEgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRzY2hlbWEudHlwZSA9ICdib29sZWFuJztcblx0XHRcdHNjaGVtYS5kZWZhdWx0ID0gZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRzdXBlcihpZCwgbmFtZSwgZGVmYXVsdFZhbHVlLCBzY2hlbWEpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGJvb2xlYW4oaW5wdXQsIHRoaXMuZGVmYXVsdFZhbHVlKTtcblx0fVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xhbXBlZEludDxUID0gbnVtYmVyPih2YWx1ZTogdW5rbm93biwgZGVmYXVsdFZhbHVlOiBULCBtaW5pbXVtOiBudW1iZXIsIG1heGltdW06IG51bWJlcik6IG51bWJlciB8IFQge1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdHZhbHVlID0gcGFyc2VJbnQodmFsdWUsIDEwKTtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnbnVtYmVyJyB8fCBpc05hTih2YWx1ZSkpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdGxldCByID0gdmFsdWU7XG5cdHIgPSBNYXRoLm1heChtaW5pbXVtLCByKTtcblx0ciA9IE1hdGgubWluKG1heGltdW0sIHIpO1xuXHRyZXR1cm4gciB8IDA7XG59XG5cbmNsYXNzIEVkaXRvckludE9wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uPiBleHRlbmRzIFNpbXBsZUVkaXRvck9wdGlvbjxLLCBudW1iZXI+IHtcblxuXHRwdWJsaWMgc3RhdGljIGNsYW1wZWRJbnQ8VD4odmFsdWU6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogVCwgbWluaW11bTogbnVtYmVyLCBtYXhpbXVtOiBudW1iZXIpOiBudW1iZXIgfCBUIHtcblx0XHRyZXR1cm4gY2xhbXBlZEludCh2YWx1ZSwgZGVmYXVsdFZhbHVlLCBtaW5pbXVtLCBtYXhpbXVtKTtcblx0fVxuXG5cdHB1YmxpYyByZWFkb25seSBtaW5pbXVtOiBudW1iZXI7XG5cdHB1YmxpYyByZWFkb25seSBtYXhpbXVtOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoaWQ6IEssIG5hbWU6IFBvc3NpYmxlS2V5TmFtZTxudW1iZXI+LCBkZWZhdWx0VmFsdWU6IG51bWJlciwgbWluaW11bTogbnVtYmVyLCBtYXhpbXVtOiBudW1iZXIsIHNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0eXBlb2Ygc2NoZW1hICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0c2NoZW1hLnR5cGUgPSAnaW50ZWdlcic7XG5cdFx0XHRzY2hlbWEuZGVmYXVsdCA9IGRlZmF1bHRWYWx1ZTtcblx0XHRcdHNjaGVtYS5taW5pbXVtID0gbWluaW11bTtcblx0XHRcdHNjaGVtYS5tYXhpbXVtID0gbWF4aW11bTtcblx0XHR9XG5cdFx0c3VwZXIoaWQsIG5hbWUsIGRlZmF1bHRWYWx1ZSwgc2NoZW1hKTtcblx0XHR0aGlzLm1pbmltdW0gPSBtaW5pbXVtO1xuXHRcdHRoaXMubWF4aW11bSA9IG1heGltdW07XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBudW1iZXIge1xuXHRcdHJldHVybiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dCwgdGhpcy5kZWZhdWx0VmFsdWUsIHRoaXMubWluaW11bSwgdGhpcy5tYXhpbXVtKTtcblx0fVxufVxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsYW1wZWRGbG9hdDxUIGV4dGVuZHMgbnVtYmVyPih2YWx1ZTogdW5rbm93biwgZGVmYXVsdFZhbHVlOiBULCBtaW5pbXVtOiBudW1iZXIsIG1heGltdW06IG51bWJlcik6IG51bWJlciB8IFQge1xuXHRpZiAodHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJykge1xuXHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdH1cblx0Y29uc3QgciA9IEVkaXRvckZsb2F0T3B0aW9uLmZsb2F0KHZhbHVlLCBkZWZhdWx0VmFsdWUpO1xuXHRyZXR1cm4gRWRpdG9yRmxvYXRPcHRpb24uY2xhbXAociwgbWluaW11bSwgbWF4aW11bSk7XG59XG5cbmNsYXNzIEVkaXRvckZsb2F0T3B0aW9uPEsgZXh0ZW5kcyBFZGl0b3JPcHRpb24+IGV4dGVuZHMgU2ltcGxlRWRpdG9yT3B0aW9uPEssIG51bWJlcj4ge1xuXG5cdHB1YmxpYyByZWFkb25seSBtaW5pbXVtOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyByZWFkb25seSBtYXhpbXVtOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHN0YXRpYyBjbGFtcChuOiBudW1iZXIsIG1pbjogbnVtYmVyLCBtYXg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0aWYgKG4gPCBtaW4pIHtcblx0XHRcdHJldHVybiBtaW47XG5cdFx0fVxuXHRcdGlmIChuID4gbWF4KSB7XG5cdFx0XHRyZXR1cm4gbWF4O1xuXHRcdH1cblx0XHRyZXR1cm4gbjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZmxvYXQodmFsdWU6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dmFsdWUgPSBwYXJzZUZsb2F0KHZhbHVlKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicgfHwgaXNOYU4odmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgcmVhZG9ubHkgdmFsaWRhdGlvbkZuOiAodmFsdWU6IG51bWJlcikgPT4gbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGlkOiBLLCBuYW1lOiBQb3NzaWJsZUtleU5hbWU8bnVtYmVyPiwgZGVmYXVsdFZhbHVlOiBudW1iZXIsIHZhbGlkYXRpb25GbjogKHZhbHVlOiBudW1iZXIpID0+IG51bWJlciwgc2NoZW1hPzogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgbWluaW11bT86IG51bWJlciwgbWF4aW11bT86IG51bWJlcikge1xuXHRcdGlmICh0eXBlb2Ygc2NoZW1hICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0c2NoZW1hLnR5cGUgPSAnbnVtYmVyJztcblx0XHRcdHNjaGVtYS5kZWZhdWx0ID0gZGVmYXVsdFZhbHVlO1xuXHRcdFx0c2NoZW1hLm1pbmltdW0gPSBtaW5pbXVtO1xuXHRcdFx0c2NoZW1hLm1heGltdW0gPSBtYXhpbXVtO1xuXHRcdH1cblx0XHRzdXBlcihpZCwgbmFtZSwgZGVmYXVsdFZhbHVlLCBzY2hlbWEpO1xuXHRcdHRoaXMudmFsaWRhdGlvbkZuID0gdmFsaWRhdGlvbkZuO1xuXHRcdHRoaXMubWluaW11bSA9IG1pbmltdW07XG5cdFx0dGhpcy5tYXhpbXVtID0gbWF4aW11bTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmFsaWRhdGlvbkZuKEVkaXRvckZsb2F0T3B0aW9uLmZsb2F0KGlucHV0LCB0aGlzLmRlZmF1bHRWYWx1ZSkpO1xuXHR9XG59XG5cbmNsYXNzIEVkaXRvclN0cmluZ09wdGlvbjxLIGV4dGVuZHMgRWRpdG9yT3B0aW9uPiBleHRlbmRzIFNpbXBsZUVkaXRvck9wdGlvbjxLLCBzdHJpbmc+IHtcblxuXHRwdWJsaWMgc3RhdGljIHN0cmluZyh2YWx1ZTogdW5rbm93biwgZGVmYXVsdFZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihpZDogSywgbmFtZTogUG9zc2libGVLZXlOYW1lPHN0cmluZz4sIGRlZmF1bHRWYWx1ZTogc3RyaW5nLCBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpIHtcblx0XHRpZiAodHlwZW9mIHNjaGVtYSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHNjaGVtYS50eXBlID0gJ3N0cmluZyc7XG5cdFx0XHRzY2hlbWEuZGVmYXVsdCA9IGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0c3VwZXIoaWQsIG5hbWUsIGRlZmF1bHRWYWx1ZSwgc2NoZW1hKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQsIHRoaXMuZGVmYXVsdFZhbHVlKTtcblx0fVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nU2V0PFQgZXh0ZW5kcyBzdHJpbmc+KHZhbHVlOiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IFQsIGFsbG93ZWRWYWx1ZXM6IFJlYWRvbmx5QXJyYXk8VD4sIHJlbmFtZWRWYWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCBUPik6IFQge1xuXHRpZiAodHlwZW9mIHZhbHVlICE9PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdH1cblx0aWYgKHJlbmFtZWRWYWx1ZXMgJiYgdmFsdWUgaW4gcmVuYW1lZFZhbHVlcykge1xuXHRcdHJldHVybiByZW5hbWVkVmFsdWVzW3ZhbHVlXTtcblx0fVxuXHRpZiAoYWxsb3dlZFZhbHVlcy5pbmRleE9mKHZhbHVlIGFzIFQpID09PSAtMSkge1xuXHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdH1cblx0cmV0dXJuIHZhbHVlIGFzIFQ7XG59XG5cbmNsYXNzIEVkaXRvclN0cmluZ0VudW1PcHRpb248SyBleHRlbmRzIEVkaXRvck9wdGlvbiwgViBleHRlbmRzIHN0cmluZz4gZXh0ZW5kcyBTaW1wbGVFZGl0b3JPcHRpb248SywgVj4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbG93ZWRWYWx1ZXM6IFJlYWRvbmx5QXJyYXk8Vj47XG5cblx0Y29uc3RydWN0b3IoaWQ6IEssIG5hbWU6IFBvc3NpYmxlS2V5TmFtZTxWPiwgZGVmYXVsdFZhbHVlOiBWLCBhbGxvd2VkVmFsdWVzOiBSZWFkb25seUFycmF5PFY+LCBzY2hlbWE6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpIHtcblx0XHRpZiAodHlwZW9mIHNjaGVtYSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHNjaGVtYS50eXBlID0gJ3N0cmluZyc7XG5cdFx0XHRzY2hlbWEuZW51bSA9IGFsbG93ZWRWYWx1ZXMuc2xpY2UoMCk7XG5cdFx0XHRzY2hlbWEuZGVmYXVsdCA9IGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0c3VwZXIoaWQsIG5hbWUsIGRlZmF1bHRWYWx1ZSwgc2NoZW1hKTtcblx0XHR0aGlzLl9hbGxvd2VkVmFsdWVzID0gYWxsb3dlZFZhbHVlcztcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFYge1xuXHRcdHJldHVybiBzdHJpbmdTZXQ8Vj4oaW5wdXQsIHRoaXMuZGVmYXVsdFZhbHVlLCB0aGlzLl9hbGxvd2VkVmFsdWVzKTtcblx0fVxufVxuXG5jbGFzcyBFZGl0b3JFbnVtT3B0aW9uPEsgZXh0ZW5kcyBFZGl0b3JPcHRpb24sIFQgZXh0ZW5kcyBzdHJpbmcsIFY+IGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxLLCBULCBWPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWxsb3dlZFZhbHVlczogVFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb252ZXJ0OiAodmFsdWU6IFQpID0+IFY7XG5cblx0Y29uc3RydWN0b3IoaWQ6IEssIG5hbWU6IFBvc3NpYmxlS2V5TmFtZTxUPiwgZGVmYXVsdFZhbHVlOiBWLCBkZWZhdWx0U3RyaW5nVmFsdWU6IHN0cmluZywgYWxsb3dlZFZhbHVlczogVFtdLCBjb252ZXJ0OiAodmFsdWU6IFQpID0+IFYsIHNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0eXBlb2Ygc2NoZW1hICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0c2NoZW1hLnR5cGUgPSAnc3RyaW5nJztcblx0XHRcdHNjaGVtYS5lbnVtID0gYWxsb3dlZFZhbHVlcztcblx0XHRcdHNjaGVtYS5kZWZhdWx0ID0gZGVmYXVsdFN0cmluZ1ZhbHVlO1xuXHRcdH1cblx0XHRzdXBlcihpZCwgbmFtZSwgZGVmYXVsdFZhbHVlLCBzY2hlbWEpO1xuXHRcdHRoaXMuX2FsbG93ZWRWYWx1ZXMgPSBhbGxvd2VkVmFsdWVzO1xuXHRcdHRoaXMuX2NvbnZlcnQgPSBjb252ZXJ0O1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogViB7XG5cdFx0aWYgKHR5cGVvZiBpbnB1dCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2FsbG93ZWRWYWx1ZXMuaW5kZXhPZig8VD5pbnB1dCkgPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jb252ZXJ0KDxUPmlucHV0KTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGF1dG9JbmRlbnRcblxuZnVuY3Rpb24gX2F1dG9JbmRlbnRGcm9tU3RyaW5nKGF1dG9JbmRlbnQ6ICdub25lJyB8ICdrZWVwJyB8ICdicmFja2V0cycgfCAnYWR2YW5jZWQnIHwgJ2Z1bGwnKTogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IHtcblx0c3dpdGNoIChhdXRvSW5kZW50KSB7XG5cdFx0Y2FzZSAnbm9uZSc6IHJldHVybiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuTm9uZTtcblx0XHRjYXNlICdrZWVwJzogcmV0dXJuIEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5LZWVwO1xuXHRcdGNhc2UgJ2JyYWNrZXRzJzogcmV0dXJuIEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5CcmFja2V0cztcblx0XHRjYXNlICdhZHZhbmNlZCc6IHJldHVybiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuQWR2YW5jZWQ7XG5cdFx0Y2FzZSAnZnVsbCc6IHJldHVybiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGFjY2Vzc2liaWxpdHlTdXBwb3J0XG5cbmNsYXNzIEVkaXRvckFjY2Vzc2liaWxpdHlTdXBwb3J0IGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQsICdhdXRvJyB8ICdvZmYnIHwgJ29uJywgQWNjZXNzaWJpbGl0eVN1cHBvcnQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCwgJ2FjY2Vzc2liaWxpdHlTdXBwb3J0JywgQWNjZXNzaWJpbGl0eVN1cHBvcnQuVW5rbm93bixcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnYXV0bycsICdvbicsICdvZmYnXSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVN1cHBvcnQuYXV0bycsIFwiVXNlIHBsYXRmb3JtIEFQSXMgdG8gZGV0ZWN0IHdoZW4gYSBTY3JlZW4gUmVhZGVyIGlzIGF0dGFjaGVkLlwiKSxcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTdXBwb3J0Lm9uJywgXCJPcHRpbWl6ZSBmb3IgdXNhZ2Ugd2l0aCBhIFNjcmVlbiBSZWFkZXIuXCIpLFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVN1cHBvcnQub2ZmJywgXCJBc3N1bWUgYSBzY3JlZW4gcmVhZGVyIGlzIG5vdCBhdHRhY2hlZC5cIiksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlZmF1bHQ6ICdhdXRvJyxcblx0XHRcdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlTdXBwb3J0JywgXCJDb250cm9scyBpZiB0aGUgVUkgc2hvdWxkIHJ1biBpbiBhIG1vZGUgd2hlcmUgaXQgaXMgb3B0aW1pemVkIGZvciBzY3JlZW4gcmVhZGVycy5cIilcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogQWNjZXNzaWJpbGl0eVN1cHBvcnQge1xuXHRcdHN3aXRjaCAoaW5wdXQpIHtcblx0XHRcdGNhc2UgJ2F1dG8nOiByZXR1cm4gQWNjZXNzaWJpbGl0eVN1cHBvcnQuVW5rbm93bjtcblx0XHRcdGNhc2UgJ29mZic6IHJldHVybiBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5EaXNhYmxlZDtcblx0XHRcdGNhc2UgJ29uJzogcmV0dXJuIEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogQWNjZXNzaWJpbGl0eVN1cHBvcnQpOiBBY2Nlc3NpYmlsaXR5U3VwcG9ydCB7XG5cdFx0aWYgKHZhbHVlID09PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5Vbmtub3duKSB7XG5cdFx0XHQvLyBUaGUgZWRpdG9yIHJlYWRzIHRoZSBgYWNjZXNzaWJpbGl0eVN1cHBvcnRgIGZyb20gdGhlIGVudmlyb25tZW50XG5cdFx0XHRyZXR1cm4gZW52LmFjY2Vzc2liaWxpdHlTdXBwb3J0O1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBjb21tZW50c1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIGNvbW1lbnRzXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvckNvbW1lbnRzT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBJbnNlcnQgYSBzcGFjZSBhZnRlciB0aGUgbGluZSBjb21tZW50IHRva2VuIGFuZCBpbnNpZGUgdGhlIGJsb2NrIGNvbW1lbnRzIHRva2Vucy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGluc2VydFNwYWNlPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIElnbm9yZSBlbXB0eSBsaW5lcyB3aGVuIGluc2VydGluZyBsaW5lIGNvbW1lbnRzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0aWdub3JlRW1wdHlMaW5lcz86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvckNvbW1lbnRzT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JDb21tZW50c09wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9yQ29tbWVudHMgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5jb21tZW50cywgSUVkaXRvckNvbW1lbnRzT3B0aW9ucywgRWRpdG9yQ29tbWVudHNPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvckNvbW1lbnRzT3B0aW9ucyA9IHtcblx0XHRcdGluc2VydFNwYWNlOiB0cnVlLFxuXHRcdFx0aWdub3JlRW1wdHlMaW5lczogdHJ1ZSxcblx0XHR9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmNvbW1lbnRzLCAnY29tbWVudHMnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5jb21tZW50cy5pbnNlcnRTcGFjZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuaW5zZXJ0U3BhY2UsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29tbWVudHMuaW5zZXJ0U3BhY2UnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYSBzcGFjZSBjaGFyYWN0ZXIgaXMgaW5zZXJ0ZWQgd2hlbiBjb21tZW50aW5nLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmNvbW1lbnRzLmlnbm9yZUVtcHR5TGluZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmlnbm9yZUVtcHR5TGluZXMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29tbWVudHMuaWdub3JlRW1wdHlMaW5lcycsICdDb250cm9scyBpZiBlbXB0eSBsaW5lcyBzaG91bGQgYmUgaWdub3JlZCB3aXRoIHRvZ2dsZSwgYWRkIG9yIHJlbW92ZSBhY3Rpb25zIGZvciBsaW5lIGNvbW1lbnRzLicpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBFZGl0b3JDb21tZW50c09wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvckNvbW1lbnRzT3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluc2VydFNwYWNlOiBib29sZWFuKGlucHV0Lmluc2VydFNwYWNlLCB0aGlzLmRlZmF1bHRWYWx1ZS5pbnNlcnRTcGFjZSksXG5cdFx0XHRpZ25vcmVFbXB0eUxpbmVzOiBib29sZWFuKGlucHV0Lmlnbm9yZUVtcHR5TGluZXMsIHRoaXMuZGVmYXVsdFZhbHVlLmlnbm9yZUVtcHR5TGluZXMpLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBjdXJzb3JCbGlua2luZ1xuXG4vKipcbiAqIFRoZSBraW5kIG9mIGFuaW1hdGlvbiBpbiB3aGljaCB0aGUgZWRpdG9yJ3MgY3Vyc29yIHNob3VsZCBiZSByZW5kZXJlZC5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUge1xuXHQvKipcblx0ICogSGlkZGVuXG5cdCAqL1xuXHRIaWRkZW4gPSAwLFxuXHQvKipcblx0ICogQmxpbmtpbmdcblx0ICovXG5cdEJsaW5rID0gMSxcblx0LyoqXG5cdCAqIEJsaW5raW5nIHdpdGggc21vb3RoIGZhZGluZ1xuXHQgKi9cblx0U21vb3RoID0gMixcblx0LyoqXG5cdCAqIEJsaW5raW5nIHdpdGggcHJvbG9uZ2VkIGZpbGxlZCBzdGF0ZSBhbmQgc21vb3RoIGZhZGluZ1xuXHQgKi9cblx0UGhhc2UgPSAzLFxuXHQvKipcblx0ICogRXhwYW5kIGNvbGxhcHNlIGFuaW1hdGlvbiBvbiB0aGUgeSBheGlzXG5cdCAqL1xuXHRFeHBhbmQgPSA0LFxuXHQvKipcblx0ICogTm8tQmxpbmtpbmdcblx0ICovXG5cdFNvbGlkID0gNVxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3Vyc29yQmxpbmtpbmdTdHlsZUZyb21TdHJpbmcoY3Vyc29yQmxpbmtpbmdTdHlsZTogJ2JsaW5rJyB8ICdzbW9vdGgnIHwgJ3BoYXNlJyB8ICdleHBhbmQnIHwgJ3NvbGlkJyk6IFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlIHtcblx0c3dpdGNoIChjdXJzb3JCbGlua2luZ1N0eWxlKSB7XG5cdFx0Y2FzZSAnYmxpbmsnOiByZXR1cm4gVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUuQmxpbms7XG5cdFx0Y2FzZSAnc21vb3RoJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLlNtb290aDtcblx0XHRjYXNlICdwaGFzZSc6IHJldHVybiBUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZS5QaGFzZTtcblx0XHRjYXNlICdleHBhbmQnOiByZXR1cm4gVGV4dEVkaXRvckN1cnNvckJsaW5raW5nU3R5bGUuRXhwYW5kO1xuXHRcdGNhc2UgJ3NvbGlkJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLlNvbGlkO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gY3Vyc29yU3R5bGVcblxuLyoqXG4gKiBUaGUgc3R5bGUgaW4gd2hpY2ggdGhlIGVkaXRvcidzIGN1cnNvciBzaG91bGQgYmUgcmVuZGVyZWQuXG4gKi9cbmV4cG9ydCBlbnVtIFRleHRFZGl0b3JDdXJzb3JTdHlsZSB7XG5cdC8qKlxuXHQgKiBBcyBhIHZlcnRpY2FsIGxpbmUgKHNpdHRpbmcgYmV0d2VlbiB0d28gY2hhcmFjdGVycykuXG5cdCAqL1xuXHRMaW5lID0gMSxcblx0LyoqXG5cdCAqIEFzIGEgYmxvY2sgKHNpdHRpbmcgb24gdG9wIG9mIGEgY2hhcmFjdGVyKS5cblx0ICovXG5cdEJsb2NrID0gMixcblx0LyoqXG5cdCAqIEFzIGEgaG9yaXpvbnRhbCBsaW5lIChzaXR0aW5nIHVuZGVyIGEgY2hhcmFjdGVyKS5cblx0ICovXG5cdFVuZGVybGluZSA9IDMsXG5cdC8qKlxuXHQgKiBBcyBhIHRoaW4gdmVydGljYWwgbGluZSAoc2l0dGluZyBiZXR3ZWVuIHR3byBjaGFyYWN0ZXJzKS5cblx0ICovXG5cdExpbmVUaGluID0gNCxcblx0LyoqXG5cdCAqIEFzIGFuIG91dGxpbmVkIGJsb2NrIChzaXR0aW5nIG9uIHRvcCBvZiBhIGNoYXJhY3RlcikuXG5cdCAqL1xuXHRCbG9ja091dGxpbmUgPSA1LFxuXHQvKipcblx0ICogQXMgYSB0aGluIGhvcml6b250YWwgbGluZSAoc2l0dGluZyB1bmRlciBhIGNoYXJhY3RlcikuXG5cdCAqL1xuXHRVbmRlcmxpbmVUaGluID0gNlxufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3Vyc29yU3R5bGVUb1N0cmluZyhjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlKTogJ2xpbmUnIHwgJ2Jsb2NrJyB8ICd1bmRlcmxpbmUnIHwgJ2xpbmUtdGhpbicgfCAnYmxvY2stb3V0bGluZScgfCAndW5kZXJsaW5lLXRoaW4nIHtcblx0c3dpdGNoIChjdXJzb3JTdHlsZSkge1xuXHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmU6IHJldHVybiAnbGluZSc7XG5cdFx0Y2FzZSBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2s6IHJldHVybiAnYmxvY2snO1xuXHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLlVuZGVybGluZTogcmV0dXJuICd1bmRlcmxpbmUnO1xuXHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmVUaGluOiByZXR1cm4gJ2xpbmUtdGhpbic7XG5cdFx0Y2FzZSBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuQmxvY2tPdXRsaW5lOiByZXR1cm4gJ2Jsb2NrLW91dGxpbmUnO1xuXHRcdGNhc2UgVGV4dEVkaXRvckN1cnNvclN0eWxlLlVuZGVybGluZVRoaW46IHJldHVybiAndW5kZXJsaW5lLXRoaW4nO1xuXHR9XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjdXJzb3JTdHlsZUZyb21TdHJpbmcoY3Vyc29yU3R5bGU6ICdsaW5lJyB8ICdibG9jaycgfCAndW5kZXJsaW5lJyB8ICdsaW5lLXRoaW4nIHwgJ2Jsb2NrLW91dGxpbmUnIHwgJ3VuZGVybGluZS10aGluJyk6IFRleHRFZGl0b3JDdXJzb3JTdHlsZSB7XG5cdHN3aXRjaCAoY3Vyc29yU3R5bGUpIHtcblx0XHRjYXNlICdsaW5lJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lO1xuXHRcdGNhc2UgJ2Jsb2NrJzogcmV0dXJuIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9jaztcblx0XHRjYXNlICd1bmRlcmxpbmUnOiByZXR1cm4gVGV4dEVkaXRvckN1cnNvclN0eWxlLlVuZGVybGluZTtcblx0XHRjYXNlICdsaW5lLXRoaW4nOiByZXR1cm4gVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmVUaGluO1xuXHRcdGNhc2UgJ2Jsb2NrLW91dGxpbmUnOiByZXR1cm4gVGV4dEVkaXRvckN1cnNvclN0eWxlLkJsb2NrT3V0bGluZTtcblx0XHRjYXNlICd1bmRlcmxpbmUtdGhpbic6IHJldHVybiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUuVW5kZXJsaW5lVGhpbjtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGVkaXRvckNsYXNzTmFtZVxuXG5jbGFzcyBFZGl0b3JDbGFzc05hbWUgZXh0ZW5kcyBDb21wdXRlZEVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZWRpdG9yQ2xhc3NOYW1lLCBzdHJpbmc+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24uZWRpdG9yQ2xhc3NOYW1lLCAnJyk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgXzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBjbGFzc05hbWVzID0gWydtb25hY28tZWRpdG9yJ107XG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5leHRyYUVkaXRvckNsYXNzTmFtZSkpIHtcblx0XHRcdGNsYXNzTmFtZXMucHVzaChvcHRpb25zLmdldChFZGl0b3JPcHRpb24uZXh0cmFFZGl0b3JDbGFzc05hbWUpKTtcblx0XHR9XG5cdFx0aWYgKGVudi5leHRyYUVkaXRvckNsYXNzTmFtZSkge1xuXHRcdFx0Y2xhc3NOYW1lcy5wdXNoKGVudi5leHRyYUVkaXRvckNsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubW91c2VTdHlsZSkgPT09ICdkZWZhdWx0Jykge1xuXHRcdFx0Y2xhc3NOYW1lcy5wdXNoKCdtb3VzZS1kZWZhdWx0Jyk7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubW91c2VTdHlsZSkgPT09ICdjb3B5Jykge1xuXHRcdFx0Y2xhc3NOYW1lcy5wdXNoKCdtb3VzZS1jb3B5Jyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zaG93VW51c2VkKSkge1xuXHRcdFx0Y2xhc3NOYW1lcy5wdXNoKCdzaG93VW51c2VkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zaG93RGVwcmVjYXRlZCkpIHtcblx0XHRcdGNsYXNzTmFtZXMucHVzaCgnc2hvd0RlcHJlY2F0ZWQnKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2xhc3NOYW1lcy5qb2luKCcgJyk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBlbXB0eVNlbGVjdGlvbkNsaXBib2FyZFxuXG5jbGFzcyBFZGl0b3JFbXB0eVNlbGVjdGlvbkNsaXBib2FyZCBleHRlbmRzIEVkaXRvckJvb2xlYW5PcHRpb248RWRpdG9yT3B0aW9uLmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uZW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQsICdlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCcsIHRydWUsXG5cdFx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkJywgXCJDb250cm9scyB3aGV0aGVyIGNvcHlpbmcgd2l0aG91dCBhIHNlbGVjdGlvbiBjb3BpZXMgdGhlIGN1cnJlbnQgbGluZS5cIikgfVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdmFsdWUgJiYgZW52LmVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZmluZFxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIGZpbmQgd2lkZ2V0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvckZpbmRPcHRpb25zIHtcblx0LyoqXG5cdCogQ29udHJvbHMgd2hldGhlciB0aGUgY3Vyc29yIHNob3VsZCBtb3ZlIHRvIGZpbmQgbWF0Y2hlcyB3aGlsZSB0eXBpbmcuXG5cdCovXG5cdGN1cnNvck1vdmVPblR5cGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgZmluZCB3aWRnZXQgc2hvdWxkIHNlYXJjaCBhcyB5b3UgdHlwZS5cblx0ICovXG5cdGZpbmRPblR5cGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgaWYgd2Ugc2VlZCBzZWFyY2ggc3RyaW5nIGluIHRoZSBGaW5kIFdpZGdldCB3aXRoIGVkaXRvciBzZWxlY3Rpb24uXG5cdCAqL1xuXHRzZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbj86ICduZXZlcicgfCAnYWx3YXlzJyB8ICdzZWxlY3Rpb24nO1xuXHQvKipcblx0ICogQ29udHJvbHMgaWYgRmluZCBpbiBTZWxlY3Rpb24gZmxhZyBpcyB0dXJuZWQgb24gaW4gdGhlIGVkaXRvci5cblx0ICovXG5cdGF1dG9GaW5kSW5TZWxlY3Rpb24/OiAnbmV2ZXInIHwgJ2Fsd2F5cycgfCAnbXVsdGlsaW5lJztcblx0Lypcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgRmluZCBXaWRnZXQgc2hvdWxkIGFkZCBleHRyYSBsaW5lcyBvbiB0b3Agb2YgdGhlIGVkaXRvci5cblx0ICovXG5cdGFkZEV4dHJhU3BhY2VPblRvcD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBAaW50ZXJuYWxcblx0ICogQ29udHJvbHMgaWYgdGhlIEZpbmQgV2lkZ2V0IHNob3VsZCByZWFkIG9yIG1vZGlmeSB0aGUgc2hhcmVkIGZpbmQgY2xpcGJvYXJkIG9uIG1hY09TXG5cdCAqL1xuXHRnbG9iYWxGaW5kQ2xpcGJvYXJkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHNlYXJjaCByZXN1bHQgYW5kIGRpZmYgcmVzdWx0IGF1dG9tYXRpY2FsbHkgcmVzdGFydHMgZnJvbSB0aGUgYmVnaW5uaW5nIChvciB0aGUgZW5kKSB3aGVuIG5vIGZ1cnRoZXIgbWF0Y2hlcyBjYW4gYmUgZm91bmRcblx0ICovXG5cdGxvb3A/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byBjbG9zZSB0aGUgRmluZCBXaWRnZXQgYWZ0ZXIgYW4gZXhwbGljaXQgZmluZCBuYXZpZ2F0aW9uIGNvbW1hbmQgbGFuZHMgb24gYSBtYXRjaC5cblx0ICovXG5cdGNsb3NlT25SZXN1bHQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQGludGVybmFsXG5cdCAqIENvbnRyb2xzIGhvdyB0aGUgZmluZCB3aWRnZXQgc2VhcmNoIGhpc3Rvcnkgc2hvdWxkIGJlIHN0b3JlZFxuXHQgKi9cblx0aGlzdG9yeT86ICduZXZlcicgfCAnd29ya3NwYWNlJztcblx0LyoqXG5cdCAqIEBpbnRlcm5hbFxuXHQgKiBDb250cm9scyBob3cgdGhlIHJlcGxhY2Ugd2lkZ2V0IHNlYXJjaCBoaXN0b3J5IHNob3VsZCBiZSBzdG9yZWRcblx0ICovXG5cdHJlcGxhY2VIaXN0b3J5PzogJ25ldmVyJyB8ICd3b3Jrc3BhY2UnO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBFZGl0b3JGaW5kT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JGaW5kT3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JGaW5kIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZmluZCwgSUVkaXRvckZpbmRPcHRpb25zLCBFZGl0b3JGaW5kT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBFZGl0b3JGaW5kT3B0aW9ucyA9IHtcblx0XHRcdGN1cnNvck1vdmVPblR5cGU6IHRydWUsXG5cdFx0XHRmaW5kT25UeXBlOiB0cnVlLFxuXHRcdFx0c2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb246ICdhbHdheXMnLFxuXHRcdFx0YXV0b0ZpbmRJblNlbGVjdGlvbjogJ25ldmVyJyxcblx0XHRcdGdsb2JhbEZpbmRDbGlwYm9hcmQ6IGZhbHNlLFxuXHRcdFx0YWRkRXh0cmFTcGFjZU9uVG9wOiB0cnVlLFxuXHRcdFx0bG9vcDogdHJ1ZSxcblx0XHRcdGNsb3NlT25SZXN1bHQ6IGZhbHNlLFxuXHRcdFx0aGlzdG9yeTogJ3dvcmtzcGFjZScsXG5cdFx0XHRyZXBsYWNlSGlzdG9yeTogJ3dvcmtzcGFjZScsXG5cdFx0fTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5maW5kLCAnZmluZCcsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLmZpbmQuY3Vyc29yTW92ZU9uVHlwZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuY3Vyc29yTW92ZU9uVHlwZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaW5kLmN1cnNvck1vdmVPblR5cGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGN1cnNvciBzaG91bGQganVtcCB0byBmaW5kIG1hdGNoZXMgd2hpbGUgdHlwaW5nLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmZpbmQuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWyduZXZlcicsICdhbHdheXMnLCAnc2VsZWN0aW9uJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZmluZC5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbi5uZXZlcicsICdOZXZlciBzZWVkIHNlYXJjaCBzdHJpbmcgZnJvbSB0aGUgZWRpdG9yIHNlbGVjdGlvbi4nKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmZpbmQuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24uYWx3YXlzJywgJ0Fsd2F5cyBzZWVkIHNlYXJjaCBzdHJpbmcgZnJvbSB0aGUgZWRpdG9yIHNlbGVjdGlvbiwgaW5jbHVkaW5nIHdvcmQgYXQgY3Vyc29yIHBvc2l0aW9uLicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZmluZC5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbi5zZWxlY3Rpb24nLCAnT25seSBzZWVkIHNlYXJjaCBzdHJpbmcgZnJvbSB0aGUgZWRpdG9yIHNlbGVjdGlvbi4nKVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgc2VhcmNoIHN0cmluZyBpbiB0aGUgRmluZCBXaWRnZXQgaXMgc2VlZGVkIGZyb20gdGhlIGVkaXRvciBzZWxlY3Rpb24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZmluZC5hdXRvRmluZEluU2VsZWN0aW9uJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnbmV2ZXInLCAnYWx3YXlzJywgJ211bHRpbGluZSddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmF1dG9GaW5kSW5TZWxlY3Rpb24sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZmluZC5hdXRvRmluZEluU2VsZWN0aW9uLm5ldmVyJywgJ05ldmVyIHR1cm4gb24gRmluZCBpbiBTZWxlY3Rpb24gYXV0b21hdGljYWxseSAoZGVmYXVsdCkuJyksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5maW5kLmF1dG9GaW5kSW5TZWxlY3Rpb24uYWx3YXlzJywgJ0Fsd2F5cyB0dXJuIG9uIEZpbmQgaW4gU2VsZWN0aW9uIGF1dG9tYXRpY2FsbHkuJyksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5maW5kLmF1dG9GaW5kSW5TZWxlY3Rpb24ubXVsdGlsaW5lJywgJ1R1cm4gb24gRmluZCBpbiBTZWxlY3Rpb24gYXV0b21hdGljYWxseSB3aGVuIG11bHRpcGxlIGxpbmVzIG9mIGNvbnRlbnQgYXJlIHNlbGVjdGVkLicpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaW5kLmF1dG9GaW5kSW5TZWxlY3Rpb24nLCBcIkNvbnRyb2xzIHRoZSBjb25kaXRpb24gZm9yIHR1cm5pbmcgb24gRmluZCBpbiBTZWxlY3Rpb24gYXV0b21hdGljYWxseS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5maW5kLmdsb2JhbEZpbmRDbGlwYm9hcmQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmdsb2JhbEZpbmRDbGlwYm9hcmQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5nbG9iYWxGaW5kQ2xpcGJvYXJkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBGaW5kIFdpZGdldCBzaG91bGQgcmVhZCBvciBtb2RpZnkgdGhlIHNoYXJlZCBmaW5kIGNsaXBib2FyZCBvbiBtYWNPUy5cIiksXG5cdFx0XHRcdFx0aW5jbHVkZWQ6IHBsYXRmb3JtLmlzTWFjaW50b3NoXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZmluZC5hZGRFeHRyYVNwYWNlT25Ub3AnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmFkZEV4dHJhU3BhY2VPblRvcCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaW5kLmFkZEV4dHJhU3BhY2VPblRvcCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRmluZCBXaWRnZXQgc2hvdWxkIGFkZCBleHRyYSBsaW5lcyBvbiB0b3Agb2YgdGhlIGVkaXRvci4gV2hlbiB0cnVlLCB5b3UgY2FuIHNjcm9sbCBiZXlvbmQgdGhlIGZpcnN0IGxpbmUgd2hlbiB0aGUgRmluZCBXaWRnZXQgaXMgdmlzaWJsZS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5maW5kLmxvb3AnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmxvb3AsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5sb29wJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBzZWFyY2ggYXV0b21hdGljYWxseSByZXN0YXJ0cyBmcm9tIHRoZSBiZWdpbm5pbmcgKG9yIHRoZSBlbmQpIHdoZW4gbm8gZnVydGhlciBtYXRjaGVzIGNhbiBiZSBmb3VuZC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5maW5kLmNsb3NlT25SZXN1bHQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmNsb3NlT25SZXN1bHQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmluZC5jbG9zZU9uUmVzdWx0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBGaW5kIFdpZGdldCBjbG9zZXMgYWZ0ZXIgYW4gZXhwbGljaXQgZmluZCBuYXZpZ2F0aW9uIGNvbW1hbmQgbGFuZHMgb24gYSByZXN1bHQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZmluZC5oaXN0b3J5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnbmV2ZXInLCAnd29ya3NwYWNlJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZmluZC5oaXN0b3J5Lm5ldmVyJywgJ0RvIG5vdCBzdG9yZSBzZWFyY2ggaGlzdG9yeSBmcm9tIHRoZSBmaW5kIHdpZGdldC4nKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmZpbmQuaGlzdG9yeS53b3Jrc3BhY2UnLCAnU3RvcmUgc2VhcmNoIGhpc3RvcnkgYWNyb3NzIHRoZSBhY3RpdmUgd29ya3NwYWNlJyksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaW5kLmhpc3RvcnknLCBcIkNvbnRyb2xzIGhvdyB0aGUgZmluZCB3aWRnZXQgaGlzdG9yeSBzaG91bGQgYmUgc3RvcmVkXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZmluZC5yZXBsYWNlSGlzdG9yeSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ25ldmVyJywgJ3dvcmtzcGFjZSddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmZpbmQucmVwbGFjZUhpc3RvcnkubmV2ZXInLCAnRG8gbm90IHN0b3JlIGhpc3RvcnkgZnJvbSB0aGUgcmVwbGFjZSB3aWRnZXQuJyksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5maW5kLnJlcGxhY2VIaXN0b3J5LndvcmtzcGFjZScsICdTdG9yZSByZXBsYWNlIGhpc3RvcnkgYWNyb3NzIHRoZSBhY3RpdmUgd29ya3NwYWNlJyksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaW5kLnJlcGxhY2VIaXN0b3J5JywgXCJDb250cm9scyBob3cgdGhlIHJlcGxhY2Ugd2lkZ2V0IGhpc3Rvcnkgc2hvdWxkIGJlIHN0b3JlZFwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmZpbmQuZmluZE9uVHlwZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZmluZE9uVHlwZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaW5kLmZpbmRPblR5cGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEZpbmQgV2lkZ2V0IHNob3VsZCBzZWFyY2ggYXMgeW91IHR5cGUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBFZGl0b3JGaW5kT3B0aW9ucyB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJRWRpdG9yRmluZE9wdGlvbnM+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRjdXJzb3JNb3ZlT25UeXBlOiBib29sZWFuKGlucHV0LmN1cnNvck1vdmVPblR5cGUsIHRoaXMuZGVmYXVsdFZhbHVlLmN1cnNvck1vdmVPblR5cGUpLFxuXHRcdFx0ZmluZE9uVHlwZTogYm9vbGVhbihpbnB1dC5maW5kT25UeXBlLCB0aGlzLmRlZmF1bHRWYWx1ZS5maW5kT25UeXBlKSxcblx0XHRcdHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uOiB0eXBlb2YgaW5wdXQuc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICdib29sZWFuJ1xuXHRcdFx0XHQ/IChpbnB1dC5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiA/ICdhbHdheXMnIDogJ25ldmVyJylcblx0XHRcdFx0OiBzdHJpbmdTZXQ8J25ldmVyJyB8ICdhbHdheXMnIHwgJ3NlbGVjdGlvbic+KGlucHV0LnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uLCB0aGlzLmRlZmF1bHRWYWx1ZS5zZWVkU2VhcmNoU3RyaW5nRnJvbVNlbGVjdGlvbiwgWyduZXZlcicsICdhbHdheXMnLCAnc2VsZWN0aW9uJ10pLFxuXHRcdFx0YXV0b0ZpbmRJblNlbGVjdGlvbjogdHlwZW9mIGlucHV0LmF1dG9GaW5kSW5TZWxlY3Rpb24gPT09ICdib29sZWFuJ1xuXHRcdFx0XHQ/IChpbnB1dC5hdXRvRmluZEluU2VsZWN0aW9uID8gJ2Fsd2F5cycgOiAnbmV2ZXInKVxuXHRcdFx0XHQ6IHN0cmluZ1NldDwnbmV2ZXInIHwgJ2Fsd2F5cycgfCAnbXVsdGlsaW5lJz4oaW5wdXQuYXV0b0ZpbmRJblNlbGVjdGlvbiwgdGhpcy5kZWZhdWx0VmFsdWUuYXV0b0ZpbmRJblNlbGVjdGlvbiwgWyduZXZlcicsICdhbHdheXMnLCAnbXVsdGlsaW5lJ10pLFxuXHRcdFx0Z2xvYmFsRmluZENsaXBib2FyZDogYm9vbGVhbihpbnB1dC5nbG9iYWxGaW5kQ2xpcGJvYXJkLCB0aGlzLmRlZmF1bHRWYWx1ZS5nbG9iYWxGaW5kQ2xpcGJvYXJkKSxcblx0XHRcdGFkZEV4dHJhU3BhY2VPblRvcDogYm9vbGVhbihpbnB1dC5hZGRFeHRyYVNwYWNlT25Ub3AsIHRoaXMuZGVmYXVsdFZhbHVlLmFkZEV4dHJhU3BhY2VPblRvcCksXG5cdFx0XHRsb29wOiBib29sZWFuKGlucHV0Lmxvb3AsIHRoaXMuZGVmYXVsdFZhbHVlLmxvb3ApLFxuXHRcdFx0Y2xvc2VPblJlc3VsdDogYm9vbGVhbihpbnB1dC5jbG9zZU9uUmVzdWx0LCB0aGlzLmRlZmF1bHRWYWx1ZS5jbG9zZU9uUmVzdWx0KSxcblx0XHRcdGhpc3Rvcnk6IHN0cmluZ1NldDwnbmV2ZXInIHwgJ3dvcmtzcGFjZSc+KGlucHV0Lmhpc3RvcnksIHRoaXMuZGVmYXVsdFZhbHVlLmhpc3RvcnksIFsnbmV2ZXInLCAnd29ya3NwYWNlJ10pLFxuXHRcdFx0cmVwbGFjZUhpc3Rvcnk6IHN0cmluZ1NldDwnbmV2ZXInIHwgJ3dvcmtzcGFjZSc+KGlucHV0LnJlcGxhY2VIaXN0b3J5LCB0aGlzLmRlZmF1bHRWYWx1ZS5yZXBsYWNlSGlzdG9yeSwgWyduZXZlcicsICd3b3Jrc3BhY2UnXSksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGZvbnRMaWdhdHVyZXNcblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNsYXNzIEVkaXRvckZvbnRMaWdhdHVyZXMgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5mb250TGlnYXR1cmVzLCBib29sZWFuIHwgc3RyaW5nLCBzdHJpbmc+IHtcblxuXHRwdWJsaWMgc3RhdGljIE9GRiA9ICdcImxpZ2FcIiBvZmYsIFwiY2FsdFwiIG9mZic7XG5cdHB1YmxpYyBzdGF0aWMgT04gPSAnXCJsaWdhXCIgb24sIFwiY2FsdFwiIG9uJztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5mb250TGlnYXR1cmVzLCAnZm9udExpZ2F0dXJlcycsIEVkaXRvckZvbnRMaWdhdHVyZXMuT0ZGLFxuXHRcdFx0e1xuXHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbnRMaWdhdHVyZXMnLCBcIkVuYWJsZXMvRGlzYWJsZXMgZm9udCBsaWdhdHVyZXMgKCdjYWx0JyBhbmQgJ2xpZ2EnIGZvbnQgZmVhdHVyZXMpLiBDaGFuZ2UgdGhpcyB0byBhIHN0cmluZyBmb3IgZmluZS1ncmFpbmVkIGNvbnRyb2wgb2YgdGhlICdmb250LWZlYXR1cmUtc2V0dGluZ3MnIENTUyBwcm9wZXJ0eS5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbnRGZWF0dXJlU2V0dGluZ3MnLCBcIkV4cGxpY2l0ICdmb250LWZlYXR1cmUtc2V0dGluZ3MnIENTUyBwcm9wZXJ0eS4gQSBib29sZWFuIGNhbiBiZSBwYXNzZWQgaW5zdGVhZCBpZiBvbmUgb25seSBuZWVkcyB0byB0dXJuIG9uL29mZiBsaWdhdHVyZXMuXCIpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb250TGlnYXR1cmVzR2VuZXJhbCcsIFwiQ29uZmlndXJlcyBmb250IGxpZ2F0dXJlcyBvciBmb250IGZlYXR1cmVzLiBDYW4gYmUgZWl0aGVyIGEgYm9vbGVhbiB0byBlbmFibGUvZGlzYWJsZSBsaWdhdHVyZXMgb3IgYSBzdHJpbmcgZm9yIHRoZSB2YWx1ZSBvZiB0aGUgQ1NTICdmb250LWZlYXR1cmUtc2V0dGluZ3MnIHByb3BlcnR5LlwiKSxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogc3RyaW5nIHtcblx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0aWYgKGlucHV0ID09PSAnZmFsc2UnIHx8IGlucHV0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gRWRpdG9yRm9udExpZ2F0dXJlcy5PRkY7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaW5wdXQgPT09ICd0cnVlJykge1xuXHRcdFx0XHRyZXR1cm4gRWRpdG9yRm9udExpZ2F0dXJlcy5PTjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnB1dDtcblx0XHR9XG5cdFx0aWYgKEJvb2xlYW4oaW5wdXQpKSB7XG5cdFx0XHRyZXR1cm4gRWRpdG9yRm9udExpZ2F0dXJlcy5PTjtcblx0XHR9XG5cdFx0cmV0dXJuIEVkaXRvckZvbnRMaWdhdHVyZXMuT0ZGO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZm9udFZhcmlhdGlvbnNcblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNsYXNzIEVkaXRvckZvbnRWYXJpYXRpb25zIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZm9udFZhcmlhdGlvbnMsIGJvb2xlYW4gfCBzdHJpbmcsIHN0cmluZz4ge1xuXHQvLyBUZXh0IGlzIGxhaWQgb3V0IHVzaW5nIGRlZmF1bHQgc2V0dGluZ3MuXG5cdHB1YmxpYyBzdGF0aWMgT0ZGID0gRk9OVF9WQVJJQVRJT05fT0ZGO1xuXG5cdC8vIFRyYW5zbGF0ZSBgZm9udFdlaWdodGAgY29uZmlnIHRvIHRoZSBgZm9udC12YXJpYXRpb24tc2V0dGluZ3NgIENTUyBwcm9wZXJ0eS5cblx0cHVibGljIHN0YXRpYyBUUkFOU0xBVEUgPSBGT05UX1ZBUklBVElPTl9UUkFOU0xBVEU7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uZm9udFZhcmlhdGlvbnMsICdmb250VmFyaWF0aW9ucycsIEVkaXRvckZvbnRWYXJpYXRpb25zLk9GRixcblx0XHRcdHtcblx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb250VmFyaWF0aW9ucycsIFwiRW5hYmxlcy9EaXNhYmxlcyB0aGUgdHJhbnNsYXRpb24gZnJvbSBmb250LXdlaWdodCB0byBmb250LXZhcmlhdGlvbi1zZXR0aW5ncy4gQ2hhbmdlIHRoaXMgdG8gYSBzdHJpbmcgZm9yIGZpbmUtZ3JhaW5lZCBjb250cm9sIG9mIHRoZSAnZm9udC12YXJpYXRpb24tc2V0dGluZ3MnIENTUyBwcm9wZXJ0eS5cIiksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbnRWYXJpYXRpb25TZXR0aW5ncycsIFwiRXhwbGljaXQgJ2ZvbnQtdmFyaWF0aW9uLXNldHRpbmdzJyBDU1MgcHJvcGVydHkuIEEgYm9vbGVhbiBjYW4gYmUgcGFzc2VkIGluc3RlYWQgaWYgb25lIG9ubHkgbmVlZHMgdG8gdHJhbnNsYXRlIGZvbnQtd2VpZ2h0IHRvIGZvbnQtdmFyaWF0aW9uLXNldHRpbmdzLlwiKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9udFZhcmlhdGlvbnNHZW5lcmFsJywgXCJDb25maWd1cmVzIGZvbnQgdmFyaWF0aW9ucy4gQ2FuIGJlIGVpdGhlciBhIGJvb2xlYW4gdG8gZW5hYmxlL2Rpc2FibGUgdGhlIHRyYW5zbGF0aW9uIGZyb20gZm9udC13ZWlnaHQgdG8gZm9udC12YXJpYXRpb24tc2V0dGluZ3Mgb3IgYSBzdHJpbmcgZm9yIHRoZSB2YWx1ZSBvZiB0aGUgQ1NTICdmb250LXZhcmlhdGlvbi1zZXR0aW5ncycgcHJvcGVydHkuXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBzdHJpbmcge1xuXHRcdGlmICh0eXBlb2YgaW5wdXQgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRpZiAoaW5wdXQgPT09ICdmYWxzZScpIHtcblx0XHRcdFx0cmV0dXJuIEVkaXRvckZvbnRWYXJpYXRpb25zLk9GRjtcblx0XHRcdH1cblx0XHRcdGlmIChpbnB1dCA9PT0gJ3RydWUnKSB7XG5cdFx0XHRcdHJldHVybiBFZGl0b3JGb250VmFyaWF0aW9ucy5UUkFOU0xBVEU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fVxuXHRcdGlmIChCb29sZWFuKGlucHV0KSkge1xuXHRcdFx0cmV0dXJuIEVkaXRvckZvbnRWYXJpYXRpb25zLlRSQU5TTEFURTtcblx0XHR9XG5cdFx0cmV0dXJuIEVkaXRvckZvbnRWYXJpYXRpb25zLk9GRjtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHQvLyBUaGUgdmFsdWUgaXMgY29tcHV0ZWQgZnJvbSB0aGUgZm9udFdlaWdodCBpZiBpdCBpcyB0cnVlLlxuXHRcdC8vIFNvIHRha2UgdGhlIHJlc3VsdCBmcm9tIGVudi5mb250SW5mb1xuXHRcdHJldHVybiBlbnYuZm9udEluZm8uZm9udFZhcmlhdGlvblNldHRpbmdzO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZm9udEluZm9cblxuY2xhc3MgRWRpdG9yRm9udEluZm8gZXh0ZW5kcyBDb21wdXRlZEVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZm9udEluZm8sIEZvbnRJbmZvPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLmZvbnRJbmZvLCBuZXcgRm9udEluZm8oe1xuXHRcdFx0cGl4ZWxSYXRpbzogMCxcblx0XHRcdGZvbnRGYW1pbHk6ICcnLFxuXHRcdFx0Zm9udFdlaWdodDogJycsXG5cdFx0XHRmb250U2l6ZTogMCxcblx0XHRcdGZvbnRGZWF0dXJlU2V0dGluZ3M6ICcnLFxuXHRcdFx0Zm9udFZhcmlhdGlvblNldHRpbmdzOiAnJyxcblx0XHRcdGxpbmVIZWlnaHQ6IDAsXG5cdFx0XHRsZXR0ZXJTcGFjaW5nOiAwLFxuXHRcdFx0aXNNb25vc3BhY2U6IGZhbHNlLFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiAwLFxuXHRcdFx0dHlwaWNhbEZ1bGx3aWR0aENoYXJhY3RlcldpZHRoOiAwLFxuXHRcdFx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBmYWxzZSxcblx0XHRcdHNwYWNlV2lkdGg6IDAsXG5cdFx0XHRtaWRkb3RXaWR0aDogMCxcblx0XHRcdHdzbWlkZG90V2lkdGg6IDAsXG5cdFx0XHRtYXhEaWdpdFdpZHRoOiAwLFxuXHRcdH0sIGZhbHNlKSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgXzogRm9udEluZm8pOiBGb250SW5mbyB7XG5cdFx0cmV0dXJuIGVudi5mb250SW5mbztcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGVmZmVjdGl2ZUN1cnNvclN0eWxlXG5cbmNsYXNzIEVmZmVjdGl2ZUN1cnNvclN0eWxlIGV4dGVuZHMgQ29tcHV0ZWRFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUN1cnNvclN0eWxlLCBUZXh0RWRpdG9yQ3Vyc29yU3R5bGU+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24uZWZmZWN0aXZlQ3Vyc29yU3R5bGUsIFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCBfOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUpOiBUZXh0RWRpdG9yQ3Vyc29yU3R5bGUge1xuXHRcdHJldHVybiBlbnYuaW5wdXRNb2RlID09PSAnb3ZlcnR5cGUnID9cblx0XHRcdG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5vdmVydHlwZUN1cnNvclN0eWxlKSA6XG5cdFx0XHRvcHRpb25zLmdldChFZGl0b3JPcHRpb24uY3Vyc29yU3R5bGUpO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZWZmZWN0aXZlRXhwZXJpbWVudGFsRWRpdENvbnRleHRcblxuY2xhc3MgRWZmZWN0aXZlRWRpdENvbnRleHRFbmFibGVkIGV4dGVuZHMgQ29tcHV0ZWRFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUVkaXRDb250ZXh0LCBib29sZWFuPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUVkaXRDb250ZXh0LCBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlbnYuZWRpdENvbnRleHRTdXBwb3J0ZWQgJiYgb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmVkaXRDb250ZXh0KTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGVmZmVjdGl2ZUFsbG93VmFyaWFibGVGb250c1xuXG5jbGFzcyBFZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHMgZXh0ZW5kcyBDb21wdXRlZEVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZWZmZWN0aXZlQWxsb3dWYXJpYWJsZUZvbnRzLCBib29sZWFuPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLmVmZmVjdGl2ZUFsbG93VmFyaWFibGVGb250cywgZmFsc2UpO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5U3VwcG9ydCA9IGVudi5hY2Nlc3NpYmlsaXR5U3VwcG9ydDtcblx0XHRpZiAoYWNjZXNzaWJpbGl0eVN1cHBvcnQgPT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQpIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uYWxsb3dWYXJpYWJsZUZvbnRzSW5BY2Nlc3NpYmlsaXR5TW9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uYWxsb3dWYXJpYWJsZUZvbnRzKTtcblx0XHR9XG5cdH1cbn1cblxuLy8jZW5ncmVnaW9uXG5cbi8vI3JlZ2lvbiBmb250U2l6ZVxuXG5jbGFzcyBFZGl0b3JGb250U2l6ZSBleHRlbmRzIFNpbXBsZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZm9udFNpemUsIG51bWJlcj4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmZvbnRTaXplLCAnZm9udFNpemUnLCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250U2l6ZSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdG1pbmltdW06IDYsXG5cdFx0XHRcdG1heGltdW06IDEwMCxcblx0XHRcdFx0ZGVmYXVsdDogRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udFNpemUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbnRTaXplJywgXCJDb250cm9scyB0aGUgZm9udCBzaXplIGluIHBpeGVscy5cIilcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogbnVtYmVyIHtcblx0XHRjb25zdCByID0gRWRpdG9yRmxvYXRPcHRpb24uZmxvYXQoaW5wdXQsIHRoaXMuZGVmYXVsdFZhbHVlKTtcblx0XHRpZiAociA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRTaXplO1xuXHRcdH1cblx0XHRyZXR1cm4gRWRpdG9yRmxvYXRPcHRpb24uY2xhbXAociwgNiwgMTAwKTtcblx0fVxuXHRwdWJsaWMgb3ZlcnJpZGUgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgdmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Ly8gVGhlIGZpbmFsIGZvbnRTaXplIHJlc3BlY3RzIHRoZSBlZGl0b3Igem9vbSBsZXZlbC5cblx0XHQvLyBTbyB0YWtlIHRoZSByZXN1bHQgZnJvbSBlbnYuZm9udEluZm9cblx0XHRyZXR1cm4gZW52LmZvbnRJbmZvLmZvbnRTaXplO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZm9udFdlaWdodFxuXG5jbGFzcyBFZGl0b3JGb250V2VpZ2h0IGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZm9udFdlaWdodCwgc3RyaW5nLCBzdHJpbmc+IHtcblx0cHJpdmF0ZSBzdGF0aWMgU1VHR0VTVElPTl9WQUxVRVMgPSBbJ25vcm1hbCcsICdib2xkJywgJzEwMCcsICcyMDAnLCAnMzAwJywgJzQwMCcsICc1MDAnLCAnNjAwJywgJzcwMCcsICc4MDAnLCAnOTAwJ107XG5cdHByaXZhdGUgc3RhdGljIE1JTklNVU1fVkFMVUUgPSAxO1xuXHRwcml2YXRlIHN0YXRpYyBNQVhJTVVNX1ZBTFVFID0gMTAwMDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5mb250V2VpZ2h0LCAnZm9udFdlaWdodCcsIEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRXZWlnaHQsXG5cdFx0XHR7XG5cdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0XHRtaW5pbXVtOiBFZGl0b3JGb250V2VpZ2h0Lk1JTklNVU1fVkFMVUUsXG5cdFx0XHRcdFx0XHRtYXhpbXVtOiBFZGl0b3JGb250V2VpZ2h0Lk1BWElNVU1fVkFMVUUsXG5cdFx0XHRcdFx0XHRlcnJvck1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZm9udFdlaWdodEVycm9yTWVzc2FnZScsIFwiT25seSBcXFwibm9ybWFsXFxcIiBhbmQgXFxcImJvbGRcXFwiIGtleXdvcmRzIG9yIG51bWJlcnMgYmV0d2VlbiAxIGFuZCAxMDAwIGFyZSBhbGxvd2VkLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiAnXihub3JtYWx8Ym9sZHwxMDAwfFsxLTldWzAtOV17MCwyfSkkJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZW51bTogRWRpdG9yRm9udFdlaWdodC5TVUdHRVNUSU9OX1ZBTFVFU1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0ZGVmYXVsdDogRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udFdlaWdodCxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9udFdlaWdodCcsIFwiQ29udHJvbHMgdGhlIGZvbnQgd2VpZ2h0LiBBY2NlcHRzIFxcXCJub3JtYWxcXFwiIGFuZCBcXFwiYm9sZFxcXCIga2V5d29yZHMgb3IgbnVtYmVycyBiZXR3ZWVuIDEgYW5kIDEwMDAuXCIpXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IHN0cmluZyB7XG5cdFx0aWYgKGlucHV0ID09PSAnbm9ybWFsJyB8fCBpbnB1dCA9PT0gJ2JvbGQnKSB7XG5cdFx0XHRyZXR1cm4gaW5wdXQ7XG5cdFx0fVxuXHRcdHJldHVybiBTdHJpbmcoRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQsIEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRXZWlnaHQsIEVkaXRvckZvbnRXZWlnaHQuTUlOSU1VTV9WQUxVRSwgRWRpdG9yRm9udFdlaWdodC5NQVhJTVVNX1ZBTFVFKSk7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBnb3RvTG9jYXRpb25cblxuZXhwb3J0IHR5cGUgR29Ub0xvY2F0aW9uVmFsdWVzID0gJ3BlZWsnIHwgJ2dvdG9BbmRQZWVrJyB8ICdnb3RvJztcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGdvIHRvIGxvY2F0aW9uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUdvdG9Mb2NhdGlvbk9wdGlvbnMge1xuXG5cdG11bHRpcGxlPzogR29Ub0xvY2F0aW9uVmFsdWVzO1xuXG5cdG11bHRpcGxlRGVmaW5pdGlvbnM/OiBHb1RvTG9jYXRpb25WYWx1ZXM7XG5cdG11bHRpcGxlVHlwZURlZmluaXRpb25zPzogR29Ub0xvY2F0aW9uVmFsdWVzO1xuXHRtdWx0aXBsZURlY2xhcmF0aW9ucz86IEdvVG9Mb2NhdGlvblZhbHVlcztcblx0bXVsdGlwbGVJbXBsZW1lbnRhdGlvbnM/OiBHb1RvTG9jYXRpb25WYWx1ZXM7XG5cdG11bHRpcGxlUmVmZXJlbmNlcz86IEdvVG9Mb2NhdGlvblZhbHVlcztcblx0bXVsdGlwbGVUZXN0cz86IEdvVG9Mb2NhdGlvblZhbHVlcztcblxuXHRhbHRlcm5hdGl2ZURlZmluaXRpb25Db21tYW5kPzogc3RyaW5nO1xuXHRhbHRlcm5hdGl2ZVR5cGVEZWZpbml0aW9uQ29tbWFuZD86IHN0cmluZztcblx0YWx0ZXJuYXRpdmVEZWNsYXJhdGlvbkNvbW1hbmQ/OiBzdHJpbmc7XG5cdGFsdGVybmF0aXZlSW1wbGVtZW50YXRpb25Db21tYW5kPzogc3RyaW5nO1xuXHRhbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQ/OiBzdHJpbmc7XG5cdGFsdGVybmF0aXZlVGVzdHNDb21tYW5kPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBHb1RvTG9jYXRpb25PcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SUdvdG9Mb2NhdGlvbk9wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9yR29Ub0xvY2F0aW9uIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uZ290b0xvY2F0aW9uLCBJR290b0xvY2F0aW9uT3B0aW9ucywgR29Ub0xvY2F0aW9uT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBHb1RvTG9jYXRpb25PcHRpb25zID0ge1xuXHRcdFx0bXVsdGlwbGU6ICdwZWVrJyxcblx0XHRcdG11bHRpcGxlRGVmaW5pdGlvbnM6ICdwZWVrJyxcblx0XHRcdG11bHRpcGxlVHlwZURlZmluaXRpb25zOiAncGVlaycsXG5cdFx0XHRtdWx0aXBsZURlY2xhcmF0aW9uczogJ3BlZWsnLFxuXHRcdFx0bXVsdGlwbGVJbXBsZW1lbnRhdGlvbnM6ICdwZWVrJyxcblx0XHRcdG11bHRpcGxlUmVmZXJlbmNlczogJ3BlZWsnLFxuXHRcdFx0bXVsdGlwbGVUZXN0czogJ3BlZWsnLFxuXHRcdFx0YWx0ZXJuYXRpdmVEZWZpbml0aW9uQ29tbWFuZDogJ2VkaXRvci5hY3Rpb24uZ29Ub1JlZmVyZW5jZXMnLFxuXHRcdFx0YWx0ZXJuYXRpdmVUeXBlRGVmaW5pdGlvbkNvbW1hbmQ6ICdlZGl0b3IuYWN0aW9uLmdvVG9SZWZlcmVuY2VzJyxcblx0XHRcdGFsdGVybmF0aXZlRGVjbGFyYXRpb25Db21tYW5kOiAnZWRpdG9yLmFjdGlvbi5nb1RvUmVmZXJlbmNlcycsXG5cdFx0XHRhbHRlcm5hdGl2ZUltcGxlbWVudGF0aW9uQ29tbWFuZDogJycsXG5cdFx0XHRhbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQ6ICcnLFxuXHRcdFx0YWx0ZXJuYXRpdmVUZXN0c0NvbW1hbmQ6ICcnLFxuXHRcdH07XG5cdFx0Y29uc3QganNvblN1YnNldDogSUpTT05TY2hlbWEgPSB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10sXG5cdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5tdWx0aXBsZSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlLnBlZWsnLCAnU2hvdyBQZWVrIHZpZXcgb2YgdGhlIHJlc3VsdHMgKGRlZmF1bHQpJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZS5nb3RvQW5kUGVlaycsICdHbyB0byB0aGUgcHJpbWFyeSByZXN1bHQgYW5kIHNob3cgYSBQZWVrIHZpZXcnKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlLmdvdG8nLCAnR28gdG8gdGhlIHByaW1hcnkgcmVzdWx0IGFuZCBlbmFibGUgUGVlay1sZXNzIG5hdmlnYXRpb24gdG8gb3RoZXJzJylcblx0XHRcdF1cblx0XHR9O1xuXHRcdGNvbnN0IGFsdGVybmF0aXZlQ29tbWFuZE9wdGlvbnMgPSBbJycsICdlZGl0b3IuYWN0aW9uLnJlZmVyZW5jZVNlYXJjaC50cmlnZ2VyJywgJ2VkaXRvci5hY3Rpb24uZ29Ub1JlZmVyZW5jZXMnLCAnZWRpdG9yLmFjdGlvbi5wZWVrSW1wbGVtZW50YXRpb24nLCAnZWRpdG9yLmFjdGlvbi5nb1RvSW1wbGVtZW50YXRpb24nLCAnZWRpdG9yLmFjdGlvbi5wZWVrVHlwZURlZmluaXRpb24nLCAnZWRpdG9yLmFjdGlvbi5nb1RvVHlwZURlZmluaXRpb24nLCAnZWRpdG9yLmFjdGlvbi5wZWVrRGVjbGFyYXRpb24nLCAnZWRpdG9yLmFjdGlvbi5yZXZlYWxEZWNsYXJhdGlvbicsICdlZGl0b3IuYWN0aW9uLnBlZWtEZWZpbml0aW9uJywgJ2VkaXRvci5hY3Rpb24ucmV2ZWFsRGVmaW5pdGlvbkFzaWRlJywgJ2VkaXRvci5hY3Rpb24ucmV2ZWFsRGVmaW5pdGlvbiddO1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmdvdG9Mb2NhdGlvbiwgJ2dvdG9Mb2NhdGlvbicsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZSc6IHtcblx0XHRcdFx0XHRkZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZS5kZXByZWNhdGVkJywgXCJUaGlzIHNldHRpbmcgaXMgZGVwcmVjYXRlZCwgcGxlYXNlIHVzZSBzZXBhcmF0ZSBzZXR0aW5ncyBsaWtlICdlZGl0b3IuZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZURlZmluaXRpb25zJyBvciAnZWRpdG9yLmVkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVJbXBsZW1lbnRhdGlvbnMnIGluc3RlYWQuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZURlZmluaXRpb25zJzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5lZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlRGVmaW5pdGlvbnMnLCBcIkNvbnRyb2xzIHRoZSBiZWhhdmlvciB0aGUgJ0dvIHRvIERlZmluaXRpb24nLWNvbW1hbmQgd2hlbiBtdWx0aXBsZSB0YXJnZXQgbG9jYXRpb25zIGV4aXN0LlwiKSxcblx0XHRcdFx0XHQuLi5qc29uU3Vic2V0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZVR5cGVEZWZpbml0aW9ucyc6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZVR5cGVEZWZpbml0aW9ucycsIFwiQ29udHJvbHMgdGhlIGJlaGF2aW9yIHRoZSAnR28gdG8gVHlwZSBEZWZpbml0aW9uJy1jb21tYW5kIHdoZW4gbXVsdGlwbGUgdGFyZ2V0IGxvY2F0aW9ucyBleGlzdC5cIiksXG5cdFx0XHRcdFx0Li4uanNvblN1YnNldCxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVEZWNsYXJhdGlvbnMnOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmVkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVEZWNsYXJhdGlvbnMnLCBcIkNvbnRyb2xzIHRoZSBiZWhhdmlvciB0aGUgJ0dvIHRvIERlY2xhcmF0aW9uJy1jb21tYW5kIHdoZW4gbXVsdGlwbGUgdGFyZ2V0IGxvY2F0aW9ucyBleGlzdC5cIiksXG5cdFx0XHRcdFx0Li4uanNvblN1YnNldCxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVJbXBsZW1lbnRhdGlvbnMnOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmVkaXRvci5nb3RvTG9jYXRpb24ubXVsdGlwbGVJbXBsZW1lbmF0dGlvbnMnLCBcIkNvbnRyb2xzIHRoZSBiZWhhdmlvciB0aGUgJ0dvIHRvIEltcGxlbWVudGF0aW9ucyctY29tbWFuZCB3aGVuIG11bHRpcGxlIHRhcmdldCBsb2NhdGlvbnMgZXhpc3QuXCIpLFxuXHRcdFx0XHRcdC4uLmpzb25TdWJzZXQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ290b0xvY2F0aW9uLm11bHRpcGxlUmVmZXJlbmNlcyc6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZWRpdG9yLmdvdG9Mb2NhdGlvbi5tdWx0aXBsZVJlZmVyZW5jZXMnLCBcIkNvbnRyb2xzIHRoZSBiZWhhdmlvciB0aGUgJ0dvIHRvIFJlZmVyZW5jZXMnLWNvbW1hbmQgd2hlbiBtdWx0aXBsZSB0YXJnZXQgbG9jYXRpb25zIGV4aXN0LlwiKSxcblx0XHRcdFx0XHQuLi5qc29uU3Vic2V0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmdvdG9Mb2NhdGlvbi5hbHRlcm5hdGl2ZURlZmluaXRpb25Db21tYW5kJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmFsdGVybmF0aXZlRGVmaW5pdGlvbkNvbW1hbmQsXG5cdFx0XHRcdFx0ZW51bTogYWx0ZXJuYXRpdmVDb21tYW5kT3B0aW9ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbHRlcm5hdGl2ZURlZmluaXRpb25Db21tYW5kJywgXCJBbHRlcm5hdGl2ZSBjb21tYW5kIGlkIHRoYXQgaXMgYmVpbmcgZXhlY3V0ZWQgd2hlbiB0aGUgcmVzdWx0IG9mICdHbyB0byBEZWZpbml0aW9uJyBpcyB0aGUgY3VycmVudCBsb2NhdGlvbi5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24uYWx0ZXJuYXRpdmVUeXBlRGVmaW5pdGlvbkNvbW1hbmQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYWx0ZXJuYXRpdmVUeXBlRGVmaW5pdGlvbkNvbW1hbmQsXG5cdFx0XHRcdFx0ZW51bTogYWx0ZXJuYXRpdmVDb21tYW5kT3B0aW9ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbHRlcm5hdGl2ZVR5cGVEZWZpbml0aW9uQ29tbWFuZCcsIFwiQWx0ZXJuYXRpdmUgY29tbWFuZCBpZCB0aGF0IGlzIGJlaW5nIGV4ZWN1dGVkIHdoZW4gdGhlIHJlc3VsdCBvZiAnR28gdG8gVHlwZSBEZWZpbml0aW9uJyBpcyB0aGUgY3VycmVudCBsb2NhdGlvbi5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5nb3RvTG9jYXRpb24uYWx0ZXJuYXRpdmVEZWNsYXJhdGlvbkNvbW1hbmQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYWx0ZXJuYXRpdmVEZWNsYXJhdGlvbkNvbW1hbmQsXG5cdFx0XHRcdFx0ZW51bTogYWx0ZXJuYXRpdmVDb21tYW5kT3B0aW9ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbHRlcm5hdGl2ZURlY2xhcmF0aW9uQ29tbWFuZCcsIFwiQWx0ZXJuYXRpdmUgY29tbWFuZCBpZCB0aGF0IGlzIGJlaW5nIGV4ZWN1dGVkIHdoZW4gdGhlIHJlc3VsdCBvZiAnR28gdG8gRGVjbGFyYXRpb24nIGlzIHRoZSBjdXJyZW50IGxvY2F0aW9uLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmdvdG9Mb2NhdGlvbi5hbHRlcm5hdGl2ZUltcGxlbWVudGF0aW9uQ29tbWFuZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5hbHRlcm5hdGl2ZUltcGxlbWVudGF0aW9uQ29tbWFuZCxcblx0XHRcdFx0XHRlbnVtOiBhbHRlcm5hdGl2ZUNvbW1hbmRPcHRpb25zLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2FsdGVybmF0aXZlSW1wbGVtZW50YXRpb25Db21tYW5kJywgXCJBbHRlcm5hdGl2ZSBjb21tYW5kIGlkIHRoYXQgaXMgYmVpbmcgZXhlY3V0ZWQgd2hlbiB0aGUgcmVzdWx0IG9mICdHbyB0byBJbXBsZW1lbnRhdGlvbicgaXMgdGhlIGN1cnJlbnQgbG9jYXRpb24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ290b0xvY2F0aW9uLmFsdGVybmF0aXZlUmVmZXJlbmNlQ29tbWFuZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5hbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQsXG5cdFx0XHRcdFx0ZW51bTogYWx0ZXJuYXRpdmVDb21tYW5kT3B0aW9ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQnLCBcIkFsdGVybmF0aXZlIGNvbW1hbmQgaWQgdGhhdCBpcyBiZWluZyBleGVjdXRlZCB3aGVuIHRoZSByZXN1bHQgb2YgJ0dvIHRvIFJlZmVyZW5jZScgaXMgdGhlIGN1cnJlbnQgbG9jYXRpb24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBHb1RvTG9jYXRpb25PcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElHb3RvTG9jYXRpb25PcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bXVsdGlwbGU6IHN0cmluZ1NldDxHb1RvTG9jYXRpb25WYWx1ZXM+KGlucHV0Lm11bHRpcGxlLCB0aGlzLmRlZmF1bHRWYWx1ZS5tdWx0aXBsZSwgWydwZWVrJywgJ2dvdG9BbmRQZWVrJywgJ2dvdG8nXSksXG5cdFx0XHRtdWx0aXBsZURlZmluaXRpb25zOiBzdHJpbmdTZXQ8R29Ub0xvY2F0aW9uVmFsdWVzPihpbnB1dC5tdWx0aXBsZURlZmluaXRpb25zLCAncGVlaycsIFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10pLFxuXHRcdFx0bXVsdGlwbGVUeXBlRGVmaW5pdGlvbnM6IHN0cmluZ1NldDxHb1RvTG9jYXRpb25WYWx1ZXM+KGlucHV0Lm11bHRpcGxlVHlwZURlZmluaXRpb25zLCAncGVlaycsIFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10pLFxuXHRcdFx0bXVsdGlwbGVEZWNsYXJhdGlvbnM6IHN0cmluZ1NldDxHb1RvTG9jYXRpb25WYWx1ZXM+KGlucHV0Lm11bHRpcGxlRGVjbGFyYXRpb25zLCAncGVlaycsIFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10pLFxuXHRcdFx0bXVsdGlwbGVJbXBsZW1lbnRhdGlvbnM6IHN0cmluZ1NldDxHb1RvTG9jYXRpb25WYWx1ZXM+KGlucHV0Lm11bHRpcGxlSW1wbGVtZW50YXRpb25zLCAncGVlaycsIFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10pLFxuXHRcdFx0bXVsdGlwbGVSZWZlcmVuY2VzOiBzdHJpbmdTZXQ8R29Ub0xvY2F0aW9uVmFsdWVzPihpbnB1dC5tdWx0aXBsZVJlZmVyZW5jZXMsICdwZWVrJywgWydwZWVrJywgJ2dvdG9BbmRQZWVrJywgJ2dvdG8nXSksXG5cdFx0XHRtdWx0aXBsZVRlc3RzOiBzdHJpbmdTZXQ8R29Ub0xvY2F0aW9uVmFsdWVzPihpbnB1dC5tdWx0aXBsZVRlc3RzLCAncGVlaycsIFsncGVlaycsICdnb3RvQW5kUGVlaycsICdnb3RvJ10pLFxuXHRcdFx0YWx0ZXJuYXRpdmVEZWZpbml0aW9uQ29tbWFuZDogRWRpdG9yU3RyaW5nT3B0aW9uLnN0cmluZyhpbnB1dC5hbHRlcm5hdGl2ZURlZmluaXRpb25Db21tYW5kLCB0aGlzLmRlZmF1bHRWYWx1ZS5hbHRlcm5hdGl2ZURlZmluaXRpb25Db21tYW5kKSxcblx0XHRcdGFsdGVybmF0aXZlVHlwZURlZmluaXRpb25Db21tYW5kOiBFZGl0b3JTdHJpbmdPcHRpb24uc3RyaW5nKGlucHV0LmFsdGVybmF0aXZlVHlwZURlZmluaXRpb25Db21tYW5kLCB0aGlzLmRlZmF1bHRWYWx1ZS5hbHRlcm5hdGl2ZVR5cGVEZWZpbml0aW9uQ29tbWFuZCksXG5cdFx0XHRhbHRlcm5hdGl2ZURlY2xhcmF0aW9uQ29tbWFuZDogRWRpdG9yU3RyaW5nT3B0aW9uLnN0cmluZyhpbnB1dC5hbHRlcm5hdGl2ZURlY2xhcmF0aW9uQ29tbWFuZCwgdGhpcy5kZWZhdWx0VmFsdWUuYWx0ZXJuYXRpdmVEZWNsYXJhdGlvbkNvbW1hbmQpLFxuXHRcdFx0YWx0ZXJuYXRpdmVJbXBsZW1lbnRhdGlvbkNvbW1hbmQ6IEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQuYWx0ZXJuYXRpdmVJbXBsZW1lbnRhdGlvbkNvbW1hbmQsIHRoaXMuZGVmYXVsdFZhbHVlLmFsdGVybmF0aXZlSW1wbGVtZW50YXRpb25Db21tYW5kKSxcblx0XHRcdGFsdGVybmF0aXZlUmVmZXJlbmNlQ29tbWFuZDogRWRpdG9yU3RyaW5nT3B0aW9uLnN0cmluZyhpbnB1dC5hbHRlcm5hdGl2ZVJlZmVyZW5jZUNvbW1hbmQsIHRoaXMuZGVmYXVsdFZhbHVlLmFsdGVybmF0aXZlUmVmZXJlbmNlQ29tbWFuZCksXG5cdFx0XHRhbHRlcm5hdGl2ZVRlc3RzQ29tbWFuZDogRWRpdG9yU3RyaW5nT3B0aW9uLnN0cmluZyhpbnB1dC5hbHRlcm5hdGl2ZVRlc3RzQ29tbWFuZCwgdGhpcy5kZWZhdWx0VmFsdWUuYWx0ZXJuYXRpdmVUZXN0c0NvbW1hbmQpLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBob3ZlclxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIGhvdmVyXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvckhvdmVyT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhlIGhvdmVyLlxuXHQgKiBEZWZhdWx0cyB0byAnb24nLlxuXHQgKi9cblx0ZW5hYmxlZD86ICdvbicgfCAnb2ZmJyB8ICdvbktleWJvYXJkTW9kaWZpZXInO1xuXHQvKipcblx0ICogRGVsYXkgZm9yIHNob3dpbmcgdGhlIGhvdmVyLlxuXHQgKiBEZWZhdWx0cyB0byAzMDAuXG5cdCAqL1xuXHRkZWxheT86IG51bWJlcjtcblx0LyoqXG5cdCAqIElzIHRoZSBob3ZlciBzdGlja3kgc3VjaCB0aGF0IGl0IGNhbiBiZSBjbGlja2VkIGFuZCBpdHMgY29udGVudHMgc2VsZWN0ZWQ/XG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzdGlja3k/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgaG93IGxvbmcgdGhlIGhvdmVyIGlzIHZpc2libGUgYWZ0ZXIgeW91IGhvdmVyZWQgb3V0IG9mIGl0LlxuXHQgKiBSZXF1aXJlIHN0aWNreSBzZXR0aW5nIHRvIGJlIHRydWUuXG5cdCAqL1xuXHRoaWRpbmdEZWxheT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFNob3VsZCB0aGUgaG92ZXIgYmUgc2hvd24gYWJvdmUgdGhlIGxpbmUgaWYgcG9zc2libGU/XG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0YWJvdmU/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdWxkIGxvbmcgbGluZSB3YXJuaW5nIGhvdmVycyBiZSBzaG93biAodG9rZW5pemF0aW9uIHNraXBwZWQsIHJlbmRlcmluZyBwYXVzZWQpP1xuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2hvd0xvbmdMaW5lV2FybmluZz86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvckhvdmVyT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JIb3Zlck9wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9ySG92ZXIgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5ob3ZlciwgSUVkaXRvckhvdmVyT3B0aW9ucywgRWRpdG9ySG92ZXJPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvckhvdmVyT3B0aW9ucyA9IHtcblx0XHRcdGVuYWJsZWQ6ICdvbicsXG5cdFx0XHRkZWxheTogMzAwLFxuXHRcdFx0aGlkaW5nRGVsYXk6IDMwMCxcblx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdGFib3ZlOiB0cnVlLFxuXHRcdFx0c2hvd0xvbmdMaW5lV2FybmluZzogdHJ1ZSxcblx0XHR9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmhvdmVyLCAnaG92ZXInLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5ob3Zlci5lbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnb24nLCAnb2ZmJywgJ29uS2V5Ym9hcmRNb2RpZmllciddLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2hvdmVyLmVuYWJsZWQub24nLCBcIkhvdmVyIGlzIGVuYWJsZWQuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdob3Zlci5lbmFibGVkLm9mZicsIFwiSG92ZXIgaXMgZGlzYWJsZWQuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdob3Zlci5lbmFibGVkLm9uS2V5Ym9hcmRNb2RpZmllcicsIFwiSG92ZXIgaXMgc2hvd24gd2hlbiBob2xkaW5nIGB7MH1gIG9yIGBBbHRgICh0aGUgb3Bwb3NpdGUgbW9kaWZpZXIgb2YgYCNlZGl0b3IubXVsdGlDdXJzb3JNb2RpZmllciNgKVwiLCBwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGBDb21tYW5kYCA6IGBDb250cm9sYClcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvdmVyLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGhvdmVyIGlzIHNob3duLlwiKSxcblx0XHRcdFx0XHRrZXl3b3JkczogWydoaW50JywgJ2luZm8nLCAndG9vbHRpcCddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaG92ZXIuZGVsYXknOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZGVsYXksXG5cdFx0XHRcdFx0bWluaW11bTogMCxcblx0XHRcdFx0XHRtYXhpbXVtOiAxMDAwMCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdob3Zlci5kZWxheScsIFwiQ29udHJvbHMgdGhlIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCB0aGUgaG92ZXIgaXMgc2hvd24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaG92ZXIuc3RpY2t5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zdGlja3ksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaG92ZXIuc3RpY2t5JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBob3ZlciBzaG91bGQgcmVtYWluIHZpc2libGUgd2hlbiBtb3VzZSBpcyBtb3ZlZCBvdmVyIGl0LlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmhvdmVyLmhpZGluZ0RlbGF5Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmhpZGluZ0RlbGF5LFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaG92ZXIuaGlkaW5nRGVsYXknLCBcIkNvbnRyb2xzIHRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYWZ0ZXIgd2hpY2ggdGhlIGhvdmVyIGlzIGhpZGRlbi4gUmVxdWlyZXMgYCNlZGl0b3IuaG92ZXIuc3RpY2t5I2AgdG8gYmUgZW5hYmxlZC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5ob3Zlci5hYm92ZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYWJvdmUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaG92ZXIuYWJvdmUnLCBcIlByZWZlciBzaG93aW5nIGhvdmVycyBhYm92ZSB0aGUgbGluZSwgaWYgdGhlcmUncyBzcGFjZS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5ob3Zlci5zaG93TG9uZ0xpbmVXYXJuaW5nJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93TG9uZ0xpbmVXYXJuaW5nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hvdmVyLnNob3dMb25nTGluZVdhcm5pbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbG9uZyBsaW5lIHdhcm5pbmcgaG92ZXJzIGFyZSBzaG93biwgc3VjaCBhcyB3aGVuIHRva2VuaXphdGlvbiBpcyBza2lwcGVkIG9yIHJlbmRlcmluZyBpcyBwYXVzZWQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBFZGl0b3JIb3Zlck9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvckhvdmVyT3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZWQ6IHN0cmluZ1NldDwnb24nIHwgJ29mZicgfCAnb25LZXlib2FyZE1vZGlmaWVyJz4oaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCwgWydvbicsICdvZmYnLCAnb25LZXlib2FyZE1vZGlmaWVyJ10pLFxuXHRcdFx0ZGVsYXk6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LmRlbGF5LCB0aGlzLmRlZmF1bHRWYWx1ZS5kZWxheSwgMCwgMTAwMDApLFxuXHRcdFx0c3RpY2t5OiBib29sZWFuKGlucHV0LnN0aWNreSwgdGhpcy5kZWZhdWx0VmFsdWUuc3RpY2t5KSxcblx0XHRcdGhpZGluZ0RlbGF5OiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5oaWRpbmdEZWxheSwgdGhpcy5kZWZhdWx0VmFsdWUuaGlkaW5nRGVsYXksIDAsIDYwMDAwMCksXG5cdFx0XHRhYm92ZTogYm9vbGVhbihpbnB1dC5hYm92ZSwgdGhpcy5kZWZhdWx0VmFsdWUuYWJvdmUpLFxuXHRcdFx0c2hvd0xvbmdMaW5lV2FybmluZzogYm9vbGVhbihpbnB1dC5zaG93TG9uZ0xpbmVXYXJuaW5nLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93TG9uZ0xpbmVXYXJuaW5nKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gbGF5b3V0SW5mb1xuXG4vKipcbiAqIEEgZGVzY3JpcHRpb24gZm9yIHRoZSBvdmVydmlldyBydWxlciBwb3NpdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBPdmVydmlld1J1bGVyUG9zaXRpb24ge1xuXHQvKipcblx0ICogV2lkdGggb2YgdGhlIG92ZXJ2aWV3IHJ1bGVyXG5cdCAqL1xuXHRyZWFkb25seSB3aWR0aDogbnVtYmVyO1xuXHQvKipcblx0ICogSGVpZ2h0IG9mIHRoZSBvdmVydmlldyBydWxlclxuXHQgKi9cblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUb3AgcG9zaXRpb24gZm9yIHRoZSBvdmVydmlldyBydWxlclxuXHQgKi9cblx0cmVhZG9ubHkgdG9wOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBSaWdodCBwb3NpdGlvbiBmb3IgdGhlIG92ZXJ2aWV3IHJ1bGVyXG5cdCAqL1xuXHRyZWFkb25seSByaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBSZW5kZXJNaW5pbWFwIHtcblx0Tm9uZSA9IDAsXG5cdFRleHQgPSAxLFxuXHRCbG9ja3MgPSAyLFxufVxuXG4vKipcbiAqIFRoZSBpbnRlcm5hbCBsYXlvdXQgZGV0YWlscyBvZiB0aGUgZWRpdG9yLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEVkaXRvckxheW91dEluZm8ge1xuXG5cdC8qKlxuXHQgKiBGdWxsIGVkaXRvciB3aWR0aC5cblx0ICovXG5cdHJlYWRvbmx5IHdpZHRoOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBGdWxsIGVkaXRvciBoZWlnaHQuXG5cdCAqL1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcblxuXHQvKipcblx0ICogTGVmdCBwb3NpdGlvbiBmb3IgdGhlIGdseXBoIG1hcmdpbi5cblx0ICovXG5cdHJlYWRvbmx5IGdseXBoTWFyZ2luTGVmdDogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlIHdpZHRoIG9mIHRoZSBnbHlwaCBtYXJnaW4uXG5cdCAqL1xuXHRyZWFkb25seSBnbHlwaE1hcmdpbldpZHRoOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgZGVjb3JhdGlvbiBsYW5lcyB0byByZW5kZXIgaW4gdGhlIGdseXBoIG1hcmdpbi5cblx0ICovXG5cdHJlYWRvbmx5IGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBMZWZ0IHBvc2l0aW9uIGZvciB0aGUgbGluZSBudW1iZXJzLlxuXHQgKi9cblx0cmVhZG9ubHkgbGluZU51bWJlcnNMZWZ0OiBudW1iZXI7XG5cdC8qKlxuXHQgKiBUaGUgd2lkdGggb2YgdGhlIGxpbmUgbnVtYmVycy5cblx0ICovXG5cdHJlYWRvbmx5IGxpbmVOdW1iZXJzV2lkdGg6IG51bWJlcjtcblxuXHQvKipcblx0ICogTGVmdCBwb3NpdGlvbiBmb3IgdGhlIGxpbmUgZGVjb3JhdGlvbnMuXG5cdCAqL1xuXHRyZWFkb25seSBkZWNvcmF0aW9uc0xlZnQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSB3aWR0aCBvZiB0aGUgbGluZSBkZWNvcmF0aW9ucy5cblx0ICovXG5cdHJlYWRvbmx5IGRlY29yYXRpb25zV2lkdGg6IG51bWJlcjtcblxuXHQvKipcblx0ICogTGVmdCBwb3NpdGlvbiBmb3IgdGhlIGNvbnRlbnQgKGFjdHVhbCB0ZXh0KVxuXHQgKi9cblx0cmVhZG9ubHkgY29udGVudExlZnQ6IG51bWJlcjtcblx0LyoqXG5cdCAqIFRoZSB3aWR0aCBvZiB0aGUgY29udGVudCAoYWN0dWFsIHRleHQpXG5cdCAqL1xuXHRyZWFkb25seSBjb250ZW50V2lkdGg6IG51bWJlcjtcblxuXHQvKipcblx0ICogTGF5b3V0IGluZm9ybWF0aW9uIGZvciB0aGUgbWluaW1hcFxuXHQgKi9cblx0cmVhZG9ubHkgbWluaW1hcDogRWRpdG9yTWluaW1hcExheW91dEluZm87XG5cblx0LyoqXG5cdCAqIFRoZSBudW1iZXIgb2YgY29sdW1ucyAob2YgdHlwaWNhbCBjaGFyYWN0ZXJzKSBmaXR0aW5nIG9uIGEgdmlld3BvcnQgbGluZS5cblx0ICovXG5cdHJlYWRvbmx5IHZpZXdwb3J0Q29sdW1uOiBudW1iZXI7XG5cblx0cmVhZG9ubHkgaXNXb3JkV3JhcE1pbmlmaWVkOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1ZpZXdwb3J0V3JhcHBpbmc6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdyYXBwaW5nQ29sdW1uOiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSB3aWR0aCBvZiB0aGUgdmVydGljYWwgc2Nyb2xsYmFyLlxuXHQgKi9cblx0cmVhZG9ubHkgdmVydGljYWxTY3JvbGxiYXJXaWR0aDogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlIGhlaWdodCBvZiB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIuXG5cdCAqL1xuXHRyZWFkb25seSBob3Jpem9udGFsU2Nyb2xsYmFySGVpZ2h0OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFRoZSBwb3NpdGlvbiBvZiB0aGUgb3ZlcnZpZXcgcnVsZXIuXG5cdCAqL1xuXHRyZWFkb25seSBvdmVydmlld1J1bGVyOiBPdmVydmlld1J1bGVyUG9zaXRpb247XG59XG5cbi8qKlxuICogVGhlIGludGVybmFsIGxheW91dCBkZXRhaWxzIG9mIHRoZSBlZGl0b3IuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRWRpdG9yTWluaW1hcExheW91dEluZm8ge1xuXHRyZWFkb25seSByZW5kZXJNaW5pbWFwOiBSZW5kZXJNaW5pbWFwO1xuXHRyZWFkb25seSBtaW5pbWFwTGVmdDogbnVtYmVyO1xuXHRyZWFkb25seSBtaW5pbWFwV2lkdGg6IG51bWJlcjtcblx0cmVhZG9ubHkgbWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBib29sZWFuO1xuXHRyZWFkb25seSBtaW5pbWFwSXNTYW1wbGluZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWluaW1hcFNjYWxlOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbmltYXBMaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbmltYXBDYW52YXNJbm5lckhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBtaW5pbWFwQ2FudmFzT3V0ZXJIZWlnaHQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXJFbnYge1xuXHRyZWFkb25seSBtZW1vcnk6IENvbXB1dGVPcHRpb25zTWVtb3J5IHwgbnVsbDtcblx0cmVhZG9ubHkgb3V0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBvdXRlckhlaWdodDogbnVtYmVyO1xuXHRyZWFkb25seSBpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzOiBib29sZWFuO1xuXHRyZWFkb25seSBsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IHZpZXdMaW5lQ291bnQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbGluZU51bWJlcnNEaWdpdENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBtYXhEaWdpdFdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBpeGVsUmF0aW86IG51bWJlcjtcblx0cmVhZG9ubHkgZ2x5cGhNYXJnaW5EZWNvcmF0aW9uTGFuZUNvdW50OiBudW1iZXI7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvckxheW91dENvbXB1dGVySW5wdXQge1xuXHRyZWFkb25seSBvdXRlcldpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dGVySGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGlzRG9taW5hdGVkQnlMb25nTGluZXM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxpbmVIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgbGluZU51bWJlcnNEaWdpdENvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSBtYXhEaWdpdFdpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBpeGVsUmF0aW86IG51bWJlcjtcblx0cmVhZG9ubHkgZ2x5cGhNYXJnaW46IGJvb2xlYW47XG5cdHJlYWRvbmx5IGxpbmVEZWNvcmF0aW9uc1dpZHRoOiBzdHJpbmcgfCBudW1iZXI7XG5cdHJlYWRvbmx5IGZvbGRpbmc6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1pbmltYXA6IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JNaW5pbWFwT3B0aW9ucz4+O1xuXHRyZWFkb25seSBzY3JvbGxiYXI6IEludGVybmFsRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucztcblx0cmVhZG9ubHkgbGluZU51bWJlcnM6IEludGVybmFsRWRpdG9yUmVuZGVyTGluZU51bWJlcnNPcHRpb25zO1xuXHRyZWFkb25seSBsaW5lTnVtYmVyc01pbkNoYXJzOiBudW1iZXI7XG5cdHJlYWRvbmx5IHNjcm9sbEJleW9uZExhc3RMaW5lOiBib29sZWFuO1xuXHRyZWFkb25seSB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJyB8ICdvbicgfCAnb2ZmJyB8ICdib3VuZGVkJztcblx0cmVhZG9ubHkgd29yZFdyYXBDb2x1bW46IG51bWJlcjtcblx0cmVhZG9ubHkgd29yZFdyYXBNaW5pZmllZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eVN1cHBvcnQ6IEFjY2Vzc2liaWxpdHlTdXBwb3J0O1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgaW50ZXJmYWNlIElNaW5pbWFwTGF5b3V0SW5wdXQge1xuXHRyZWFkb25seSBvdXRlcldpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dGVySGVpZ2h0OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxpbmVIZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBpeGVsUmF0aW86IG51bWJlcjtcblx0cmVhZG9ubHkgc2Nyb2xsQmV5b25kTGFzdExpbmU6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBhZGRpbmdUb3A6IG51bWJlcjtcblx0cmVhZG9ubHkgcGFkZGluZ0JvdHRvbTogbnVtYmVyO1xuXHRyZWFkb25seSBtaW5pbWFwOiBSZWFkb25seTxSZXF1aXJlZDxJRWRpdG9yTWluaW1hcE9wdGlvbnM+Pjtcblx0cmVhZG9ubHkgdmVydGljYWxTY3JvbGxiYXJXaWR0aDogbnVtYmVyO1xuXHRyZWFkb25seSB2aWV3TGluZUNvdW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbWFpbmluZ1dpZHRoOiBudW1iZXI7XG5cdHJlYWRvbmx5IGlzVmlld3BvcnRXcmFwcGluZzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNsYXNzIEVkaXRvckxheW91dEluZm9Db21wdXRlciBleHRlbmRzIENvbXB1dGVkRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5sYXlvdXRJbmZvLCBFZGl0b3JMYXlvdXRJbmZvPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLmxheW91dEluZm8sIHtcblx0XHRcdHdpZHRoOiAwLFxuXHRcdFx0aGVpZ2h0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5MZWZ0OiAwLFxuXHRcdFx0Z2x5cGhNYXJnaW5XaWR0aDogMCxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogMCxcblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogMCxcblx0XHRcdGxpbmVOdW1iZXJzV2lkdGg6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc0xlZnQ6IDAsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiAwLFxuXHRcdFx0Y29udGVudExlZnQ6IDAsXG5cdFx0XHRjb250ZW50V2lkdGg6IDAsXG5cdFx0XHRtaW5pbWFwOiB7XG5cdFx0XHRcdHJlbmRlck1pbmltYXA6IFJlbmRlck1pbmltYXAuTm9uZSxcblx0XHRcdFx0bWluaW1hcExlZnQ6IDAsXG5cdFx0XHRcdG1pbmltYXBXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwU2NhbGU6IDEsXG5cdFx0XHRcdG1pbmltYXBMaW5lSGVpZ2h0OiAxLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0OiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzT3V0ZXJXaWR0aDogMCxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0OiAwLFxuXHRcdFx0fSxcblx0XHRcdHZpZXdwb3J0Q29sdW1uOiAwLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBmYWxzZSxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogZmFsc2UsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogLTEsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoOiAwLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhckhlaWdodDogMCxcblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiAwLFxuXHRcdFx0XHR3aWR0aDogMCxcblx0XHRcdFx0aGVpZ2h0OiAwLFxuXHRcdFx0XHRyaWdodDogMFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIF86IEVkaXRvckxheW91dEluZm8pOiBFZGl0b3JMYXlvdXRJbmZvIHtcblx0XHRyZXR1cm4gRWRpdG9yTGF5b3V0SW5mb0NvbXB1dGVyLmNvbXB1dGVMYXlvdXQob3B0aW9ucywge1xuXHRcdFx0bWVtb3J5OiBlbnYubWVtb3J5LFxuXHRcdFx0b3V0ZXJXaWR0aDogZW52Lm91dGVyV2lkdGgsXG5cdFx0XHRvdXRlckhlaWdodDogZW52Lm91dGVySGVpZ2h0LFxuXHRcdFx0aXNEb21pbmF0ZWRCeUxvbmdMaW5lczogZW52LmlzRG9taW5hdGVkQnlMb25nTGluZXMsXG5cdFx0XHRsaW5lSGVpZ2h0OiBlbnYuZm9udEluZm8ubGluZUhlaWdodCxcblx0XHRcdHZpZXdMaW5lQ291bnQ6IGVudi52aWV3TGluZUNvdW50LFxuXHRcdFx0bGluZU51bWJlcnNEaWdpdENvdW50OiBlbnYubGluZU51bWJlcnNEaWdpdENvdW50LFxuXHRcdFx0dHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoOiBlbnYuZm9udEluZm8udHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoLFxuXHRcdFx0bWF4RGlnaXRXaWR0aDogZW52LmZvbnRJbmZvLm1heERpZ2l0V2lkdGgsXG5cdFx0XHRwaXhlbFJhdGlvOiBlbnYucGl4ZWxSYXRpbyxcblx0XHRcdGdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDogZW52LmdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wdXRlQ29udGFpbmVkTWluaW1hcExpbmVDb3VudChpbnB1dDoge1xuXHRcdHZpZXdMaW5lQ291bnQ6IG51bWJlcjtcblx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogYm9vbGVhbjtcblx0XHRwYWRkaW5nVG9wOiBudW1iZXI7XG5cdFx0cGFkZGluZ0JvdHRvbTogbnVtYmVyO1xuXHRcdGhlaWdodDogbnVtYmVyO1xuXHRcdGxpbmVIZWlnaHQ6IG51bWJlcjtcblx0XHRwaXhlbFJhdGlvOiBudW1iZXI7XG5cdH0pOiB7IHR5cGljYWxWaWV3cG9ydExpbmVDb3VudDogbnVtYmVyOyBleHRyYUxpbmVzQmVmb3JlRmlyc3RMaW5lOiBudW1iZXI7IGV4dHJhTGluZXNCZXlvbmRMYXN0TGluZTogbnVtYmVyOyBkZXNpcmVkUmF0aW86IG51bWJlcjsgbWluaW1hcExpbmVDb3VudDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IHR5cGljYWxWaWV3cG9ydExpbmVDb3VudCA9IGlucHV0LmhlaWdodCAvIGlucHV0LmxpbmVIZWlnaHQ7XG5cdFx0Y29uc3QgZXh0cmFMaW5lc0JlZm9yZUZpcnN0TGluZSA9IE1hdGguZmxvb3IoaW5wdXQucGFkZGluZ1RvcCAvIGlucHV0LmxpbmVIZWlnaHQpO1xuXHRcdGxldCBleHRyYUxpbmVzQmV5b25kTGFzdExpbmUgPSBNYXRoLmZsb29yKGlucHV0LnBhZGRpbmdCb3R0b20gLyBpbnB1dC5saW5lSGVpZ2h0KTtcblx0XHRpZiAoaW5wdXQuc2Nyb2xsQmV5b25kTGFzdExpbmUpIHtcblx0XHRcdGV4dHJhTGluZXNCZXlvbmRMYXN0TGluZSA9IE1hdGgubWF4KGV4dHJhTGluZXNCZXlvbmRMYXN0TGluZSwgdHlwaWNhbFZpZXdwb3J0TGluZUNvdW50IC0gMSk7XG5cdFx0fVxuXHRcdGNvbnN0IGRlc2lyZWRSYXRpbyA9IChleHRyYUxpbmVzQmVmb3JlRmlyc3RMaW5lICsgaW5wdXQudmlld0xpbmVDb3VudCArIGV4dHJhTGluZXNCZXlvbmRMYXN0TGluZSkgLyAoaW5wdXQucGl4ZWxSYXRpbyAqIGlucHV0LmhlaWdodCk7XG5cdFx0Y29uc3QgbWluaW1hcExpbmVDb3VudCA9IE1hdGguZmxvb3IoaW5wdXQudmlld0xpbmVDb3VudCAvIGRlc2lyZWRSYXRpbyk7XG5cdFx0cmV0dXJuIHsgdHlwaWNhbFZpZXdwb3J0TGluZUNvdW50LCBleHRyYUxpbmVzQmVmb3JlRmlyc3RMaW5lLCBleHRyYUxpbmVzQmV5b25kTGFzdExpbmUsIGRlc2lyZWRSYXRpbywgbWluaW1hcExpbmVDb3VudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvbXB1dGVNaW5pbWFwTGF5b3V0KGlucHV0OiBJTWluaW1hcExheW91dElucHV0LCBtZW1vcnk6IENvbXB1dGVPcHRpb25zTWVtb3J5KTogRWRpdG9yTWluaW1hcExheW91dEluZm8ge1xuXHRcdGNvbnN0IG91dGVyV2lkdGggPSBpbnB1dC5vdXRlcldpZHRoO1xuXHRcdGNvbnN0IG91dGVySGVpZ2h0ID0gaW5wdXQub3V0ZXJIZWlnaHQ7XG5cdFx0Y29uc3QgcGl4ZWxSYXRpbyA9IGlucHV0LnBpeGVsUmF0aW87XG5cblx0XHRpZiAoIWlucHV0Lm1pbmltYXAuZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVuZGVyTWluaW1hcDogUmVuZGVyTWluaW1hcC5Ob25lLFxuXHRcdFx0XHRtaW5pbWFwTGVmdDogMCxcblx0XHRcdFx0bWluaW1hcFdpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRtaW5pbWFwSXNTYW1wbGluZzogZmFsc2UsXG5cdFx0XHRcdG1pbmltYXBTY2FsZTogMSxcblx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQ6IDEsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoOiAwLFxuXHRcdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQ6IE1hdGguZmxvb3IocGl4ZWxSYXRpbyAqIG91dGVySGVpZ2h0KSxcblx0XHRcdFx0bWluaW1hcENhbnZhc091dGVyV2lkdGg6IDAsXG5cdFx0XHRcdG1pbmltYXBDYW52YXNPdXRlckhlaWdodDogb3V0ZXJIZWlnaHQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIENhbiB1c2UgbWVtb3J5IGlmIG9ubHkgdGhlIGB2aWV3TGluZUNvdW50YCBhbmQgYHJlbWFpbmluZ1dpZHRoYCBoYXZlIGNoYW5nZWRcblx0XHRjb25zdCBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQgPSBtZW1vcnkuc3RhYmxlTWluaW1hcExheW91dElucHV0O1xuXHRcdGNvbnN0IGNvdWxkVXNlTWVtb3J5ID0gKFxuXHRcdFx0c3RhYmxlTWluaW1hcExheW91dElucHV0XG5cdFx0XHQvLyAmJiBpbnB1dC5vdXRlcldpZHRoID09PSBsYXN0TWluaW1hcExheW91dElucHV0Lm91dGVyV2lkdGggISEhIElOVEVOVElPTkFMIE9NSVRURURcblx0XHRcdCYmIGlucHV0Lm91dGVySGVpZ2h0ID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQub3V0ZXJIZWlnaHRcblx0XHRcdCYmIGlucHV0LmxpbmVIZWlnaHQgPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5saW5lSGVpZ2h0XG5cdFx0XHQmJiBpbnB1dC50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGhcblx0XHRcdCYmIGlucHV0LnBpeGVsUmF0aW8gPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5waXhlbFJhdGlvXG5cdFx0XHQmJiBpbnB1dC5zY3JvbGxCZXlvbmRMYXN0TGluZSA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0LnNjcm9sbEJleW9uZExhc3RMaW5lXG5cdFx0XHQmJiBpbnB1dC5wYWRkaW5nVG9wID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQucGFkZGluZ1RvcFxuXHRcdFx0JiYgaW5wdXQucGFkZGluZ0JvdHRvbSA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0LnBhZGRpbmdCb3R0b21cblx0XHRcdCYmIGlucHV0Lm1pbmltYXAuZW5hYmxlZCA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0Lm1pbmltYXAuZW5hYmxlZFxuXHRcdFx0JiYgaW5wdXQubWluaW1hcC5zaWRlID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQubWluaW1hcC5zaWRlXG5cdFx0XHQmJiBpbnB1dC5taW5pbWFwLnNpemUgPT09IHN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dC5taW5pbWFwLnNpemVcblx0XHRcdCYmIGlucHV0Lm1pbmltYXAuc2hvd1NsaWRlciA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0Lm1pbmltYXAuc2hvd1NsaWRlclxuXHRcdFx0JiYgaW5wdXQubWluaW1hcC5yZW5kZXJDaGFyYWN0ZXJzID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQubWluaW1hcC5yZW5kZXJDaGFyYWN0ZXJzXG5cdFx0XHQmJiBpbnB1dC5taW5pbWFwLm1heENvbHVtbiA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0Lm1pbmltYXAubWF4Q29sdW1uXG5cdFx0XHQmJiBpbnB1dC5taW5pbWFwLnNjYWxlID09PSBzdGFibGVNaW5pbWFwTGF5b3V0SW5wdXQubWluaW1hcC5zY2FsZVxuXHRcdFx0JiYgaW5wdXQudmVydGljYWxTY3JvbGxiYXJXaWR0aCA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0LnZlcnRpY2FsU2Nyb2xsYmFyV2lkdGhcblx0XHRcdC8vICYmIGlucHV0LnZpZXdMaW5lQ291bnQgPT09IGxhc3RNaW5pbWFwTGF5b3V0SW5wdXQudmlld0xpbmVDb3VudCAhISEgSU5URU5USU9OQUwgT01JVFRFRFxuXHRcdFx0Ly8gJiYgaW5wdXQucmVtYWluaW5nV2lkdGggPT09IGxhc3RNaW5pbWFwTGF5b3V0SW5wdXQucmVtYWluaW5nV2lkdGggISEhIElOVEVOVElPTkFMIE9NSVRURURcblx0XHRcdCYmIGlucHV0LmlzVmlld3BvcnRXcmFwcGluZyA9PT0gc3RhYmxlTWluaW1hcExheW91dElucHV0LmlzVmlld3BvcnRXcmFwcGluZ1xuXHRcdCk7XG5cblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gaW5wdXQubGluZUhlaWdodDtcblx0XHRjb25zdCB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggPSBpbnB1dC50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0Y29uc3Qgc2Nyb2xsQmV5b25kTGFzdExpbmUgPSBpbnB1dC5zY3JvbGxCZXlvbmRMYXN0TGluZTtcblx0XHRjb25zdCBtaW5pbWFwUmVuZGVyQ2hhcmFjdGVycyA9IGlucHV0Lm1pbmltYXAucmVuZGVyQ2hhcmFjdGVycztcblx0XHRsZXQgbWluaW1hcFNjYWxlID0gKHBpeGVsUmF0aW8gPj0gMiA/IE1hdGgucm91bmQoaW5wdXQubWluaW1hcC5zY2FsZSAqIDIpIDogaW5wdXQubWluaW1hcC5zY2FsZSk7XG5cdFx0Y29uc3QgbWluaW1hcE1heENvbHVtbiA9IGlucHV0Lm1pbmltYXAubWF4Q29sdW1uO1xuXHRcdGNvbnN0IG1pbmltYXBTaXplID0gaW5wdXQubWluaW1hcC5zaXplO1xuXHRcdGNvbnN0IG1pbmltYXBTaWRlID0gaW5wdXQubWluaW1hcC5zaWRlO1xuXHRcdGNvbnN0IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggPSBpbnB1dC52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoO1xuXHRcdGNvbnN0IHZpZXdMaW5lQ291bnQgPSBpbnB1dC52aWV3TGluZUNvdW50O1xuXHRcdGNvbnN0IHJlbWFpbmluZ1dpZHRoID0gaW5wdXQucmVtYWluaW5nV2lkdGg7XG5cdFx0Y29uc3QgaXNWaWV3cG9ydFdyYXBwaW5nID0gaW5wdXQuaXNWaWV3cG9ydFdyYXBwaW5nO1xuXG5cdFx0Y29uc3QgYmFzZUNoYXJIZWlnaHQgPSBtaW5pbWFwUmVuZGVyQ2hhcmFjdGVycyA/IDIgOiAzO1xuXHRcdGxldCBtaW5pbWFwQ2FudmFzSW5uZXJIZWlnaHQgPSBNYXRoLmZsb29yKHBpeGVsUmF0aW8gKiBvdXRlckhlaWdodCk7XG5cdFx0Y29uc3QgbWluaW1hcENhbnZhc091dGVySGVpZ2h0ID0gbWluaW1hcENhbnZhc0lubmVySGVpZ2h0IC8gcGl4ZWxSYXRpbztcblx0XHRsZXQgbWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0ID0gZmFsc2U7XG5cdFx0bGV0IG1pbmltYXBJc1NhbXBsaW5nID0gZmFsc2U7XG5cdFx0bGV0IG1pbmltYXBMaW5lSGVpZ2h0ID0gYmFzZUNoYXJIZWlnaHQgKiBtaW5pbWFwU2NhbGU7XG5cdFx0bGV0IG1pbmltYXBDaGFyV2lkdGggPSBtaW5pbWFwU2NhbGUgLyBwaXhlbFJhdGlvO1xuXHRcdGxldCBtaW5pbWFwV2lkdGhNdWx0aXBsaWVyOiBudW1iZXIgPSAxO1xuXG5cdFx0aWYgKG1pbmltYXBTaXplID09PSAnZmlsbCcgfHwgbWluaW1hcFNpemUgPT09ICdmaXQnKSB7XG5cdFx0XHRjb25zdCB7IHR5cGljYWxWaWV3cG9ydExpbmVDb3VudCwgZXh0cmFMaW5lc0JlZm9yZUZpcnN0TGluZSwgZXh0cmFMaW5lc0JleW9uZExhc3RMaW5lLCBkZXNpcmVkUmF0aW8sIG1pbmltYXBMaW5lQ291bnQgfSA9IEVkaXRvckxheW91dEluZm9Db21wdXRlci5jb21wdXRlQ29udGFpbmVkTWluaW1hcExpbmVDb3VudCh7XG5cdFx0XHRcdHZpZXdMaW5lQ291bnQ6IHZpZXdMaW5lQ291bnQsXG5cdFx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBzY3JvbGxCZXlvbmRMYXN0TGluZSxcblx0XHRcdFx0cGFkZGluZ1RvcDogaW5wdXQucGFkZGluZ1RvcCxcblx0XHRcdFx0cGFkZGluZ0JvdHRvbTogaW5wdXQucGFkZGluZ0JvdHRvbSxcblx0XHRcdFx0aGVpZ2h0OiBvdXRlckhlaWdodCxcblx0XHRcdFx0bGluZUhlaWdodDogbGluZUhlaWdodCxcblx0XHRcdFx0cGl4ZWxSYXRpbzogcGl4ZWxSYXRpb1xuXHRcdFx0fSk7XG5cdFx0XHQvLyByYXRpbyBpcyBpbnRlbnRpb25hbGx5IG5vdCBwYXJ0IG9mIHRoZSBsYXlvdXQgdG8gYXZvaWQgdGhlIGxheW91dCBjaGFuZ2luZyBhbGwgdGhlIHRpbWVcblx0XHRcdC8vIHdoZW4gZG9pbmcgc2FtcGxpbmdcblx0XHRcdGNvbnN0IHJhdGlvID0gdmlld0xpbmVDb3VudCAvIG1pbmltYXBMaW5lQ291bnQ7XG5cblx0XHRcdGlmIChyYXRpbyA+IDEpIHtcblx0XHRcdFx0bWluaW1hcEhlaWdodElzRWRpdG9ySGVpZ2h0ID0gdHJ1ZTtcblx0XHRcdFx0bWluaW1hcElzU2FtcGxpbmcgPSB0cnVlO1xuXHRcdFx0XHRtaW5pbWFwU2NhbGUgPSAxO1xuXHRcdFx0XHRtaW5pbWFwTGluZUhlaWdodCA9IDE7XG5cdFx0XHRcdG1pbmltYXBDaGFyV2lkdGggPSBtaW5pbWFwU2NhbGUgLyBwaXhlbFJhdGlvO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bGV0IGZpdEJlY29tZXNGaWxsID0gZmFsc2U7XG5cdFx0XHRcdGxldCBtYXhNaW5pbWFwU2NhbGUgPSBtaW5pbWFwU2NhbGUgKyAxO1xuXG5cdFx0XHRcdGlmIChtaW5pbWFwU2l6ZSA9PT0gJ2ZpdCcpIHtcblx0XHRcdFx0XHRjb25zdCBlZmZlY3RpdmVNaW5pbWFwSGVpZ2h0ID0gTWF0aC5jZWlsKChleHRyYUxpbmVzQmVmb3JlRmlyc3RMaW5lICsgdmlld0xpbmVDb3VudCArIGV4dHJhTGluZXNCZXlvbmRMYXN0TGluZSkgKiBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0XHRcdFx0aWYgKGlzVmlld3BvcnRXcmFwcGluZyAmJiBjb3VsZFVzZU1lbW9yeSAmJiByZW1haW5pbmdXaWR0aCA8PSBtZW1vcnkuc3RhYmxlRml0UmVtYWluaW5nV2lkdGgpIHtcblx0XHRcdFx0XHRcdC8vIFRoZXJlIGlzIGEgbG9vcCB3aGVuIHVzaW5nIGBmaXRgIGFuZCB2aWV3cG9ydCB3cmFwcGluZzpcblx0XHRcdFx0XHRcdC8vIC0gdmlldyBsaW5lIGNvdW50IGltcGFjdHMgbWluaW1hcCBsYXlvdXRcblx0XHRcdFx0XHRcdC8vIC0gbWluaW1hcCBsYXlvdXQgaW1wYWN0cyB2aWV3cG9ydCB3aWR0aFxuXHRcdFx0XHRcdFx0Ly8gLSB2aWV3cG9ydCB3aWR0aCBpbXBhY3RzIHZpZXcgbGluZSBjb3VudFxuXHRcdFx0XHRcdFx0Ly8gVG8gYnJlYWsgdGhlIGxvb3AsIG9uY2Ugd2UgZ28gdG8gYSBzbWFsbGVyIG1pbmltYXAgc2NhbGUsIHdlIHRyeSB0byBzdGljayB3aXRoIGl0LlxuXHRcdFx0XHRcdFx0Zml0QmVjb21lc0ZpbGwgPSB0cnVlO1xuXHRcdFx0XHRcdFx0bWF4TWluaW1hcFNjYWxlID0gbWVtb3J5LnN0YWJsZUZpdE1heE1pbmltYXBTY2FsZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Zml0QmVjb21lc0ZpbGwgPSAoZWZmZWN0aXZlTWluaW1hcEhlaWdodCA+IG1pbmltYXBDYW52YXNJbm5lckhlaWdodCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1pbmltYXBTaXplID09PSAnZmlsbCcgfHwgZml0QmVjb21lc0ZpbGwpIHtcblx0XHRcdFx0XHRtaW5pbWFwSGVpZ2h0SXNFZGl0b3JIZWlnaHQgPSB0cnVlO1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRNaW5pbWFwU2NhbGUgPSBtaW5pbWFwU2NhbGU7XG5cdFx0XHRcdFx0bWluaW1hcExpbmVIZWlnaHQgPSBNYXRoLm1pbihsaW5lSGVpZ2h0ICogcGl4ZWxSYXRpbywgTWF0aC5tYXgoMSwgTWF0aC5mbG9vcigxIC8gZGVzaXJlZFJhdGlvKSkpO1xuXHRcdFx0XHRcdGlmIChpc1ZpZXdwb3J0V3JhcHBpbmcgJiYgY291bGRVc2VNZW1vcnkgJiYgcmVtYWluaW5nV2lkdGggPD0gbWVtb3J5LnN0YWJsZUZpdFJlbWFpbmluZ1dpZHRoKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGVyZSBpcyBhIGxvb3Agd2hlbiB1c2luZyBgZmlsbGAgYW5kIHZpZXdwb3J0IHdyYXBwaW5nOlxuXHRcdFx0XHRcdFx0Ly8gLSB2aWV3IGxpbmUgY291bnQgaW1wYWN0cyBtaW5pbWFwIGxheW91dFxuXHRcdFx0XHRcdFx0Ly8gLSBtaW5pbWFwIGxheW91dCBpbXBhY3RzIHZpZXdwb3J0IHdpZHRoXG5cdFx0XHRcdFx0XHQvLyAtIHZpZXdwb3J0IHdpZHRoIGltcGFjdHMgdmlldyBsaW5lIGNvdW50XG5cdFx0XHRcdFx0XHQvLyBUbyBicmVhayB0aGUgbG9vcCwgb25jZSB3ZSBnbyB0byBhIHNtYWxsZXIgbWluaW1hcCBzY2FsZSwgd2UgdHJ5IHRvIHN0aWNrIHdpdGggaXQuXG5cdFx0XHRcdFx0XHRtYXhNaW5pbWFwU2NhbGUgPSBtZW1vcnkuc3RhYmxlRml0TWF4TWluaW1hcFNjYWxlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtaW5pbWFwU2NhbGUgPSBNYXRoLm1pbihtYXhNaW5pbWFwU2NhbGUsIE1hdGgubWF4KDEsIE1hdGguZmxvb3IobWluaW1hcExpbmVIZWlnaHQgLyBiYXNlQ2hhckhlaWdodCkpKTtcblx0XHRcdFx0XHRpZiAobWluaW1hcFNjYWxlID4gY29uZmlndXJlZE1pbmltYXBTY2FsZSkge1xuXHRcdFx0XHRcdFx0bWluaW1hcFdpZHRoTXVsdGlwbGllciA9IE1hdGgubWluKDIsIG1pbmltYXBTY2FsZSAvIGNvbmZpZ3VyZWRNaW5pbWFwU2NhbGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRtaW5pbWFwQ2hhcldpZHRoID0gbWluaW1hcFNjYWxlIC8gcGl4ZWxSYXRpbyAvIG1pbmltYXBXaWR0aE11bHRpcGxpZXI7XG5cdFx0XHRcdFx0bWluaW1hcENhbnZhc0lubmVySGVpZ2h0ID0gTWF0aC5jZWlsKChNYXRoLm1heCh0eXBpY2FsVmlld3BvcnRMaW5lQ291bnQsIGV4dHJhTGluZXNCZWZvcmVGaXJzdExpbmUgKyB2aWV3TGluZUNvdW50ICsgZXh0cmFMaW5lc0JleW9uZExhc3RMaW5lKSkgKiBtaW5pbWFwTGluZUhlaWdodCk7XG5cdFx0XHRcdFx0aWYgKGlzVmlld3BvcnRXcmFwcGluZykge1xuXHRcdFx0XHRcdFx0Ly8gcmVtZW1iZXIgZm9yIG5leHQgdGltZVxuXHRcdFx0XHRcdFx0bWVtb3J5LnN0YWJsZU1pbmltYXBMYXlvdXRJbnB1dCA9IGlucHV0O1xuXHRcdFx0XHRcdFx0bWVtb3J5LnN0YWJsZUZpdFJlbWFpbmluZ1dpZHRoID0gcmVtYWluaW5nV2lkdGg7XG5cdFx0XHRcdFx0XHRtZW1vcnkuc3RhYmxlRml0TWF4TWluaW1hcFNjYWxlID0gbWluaW1hcFNjYWxlO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtZW1vcnkuc3RhYmxlTWluaW1hcExheW91dElucHV0ID0gbnVsbDtcblx0XHRcdFx0XHRcdG1lbW9yeS5zdGFibGVGaXRSZW1haW5pbmdXaWR0aCA9IDA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gR2l2ZW46XG5cdFx0Ly8gKGxlYXZpbmcgMnB4IGZvciB0aGUgY3Vyc29yIHRvIGhhdmUgc3BhY2UgYWZ0ZXIgdGhlIGxhc3QgY2hhcmFjdGVyKVxuXHRcdC8vIHZpZXdwb3J0Q29sdW1uID0gKGNvbnRlbnRXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLSAyKSAvIHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aFxuXHRcdC8vIG1pbmltYXBXaWR0aCA9IHZpZXdwb3J0Q29sdW1uICogbWluaW1hcENoYXJXaWR0aFxuXHRcdC8vIGNvbnRlbnRXaWR0aCA9IHJlbWFpbmluZ1dpZHRoIC0gbWluaW1hcFdpZHRoXG5cdFx0Ly8gV2hhdCBhcmUgZ29vZCB2YWx1ZXMgZm9yIGNvbnRlbnRXaWR0aCBhbmQgbWluaW1hcFdpZHRoID9cblxuXHRcdC8vIG1pbmltYXBXaWR0aCA9ICgoY29udGVudFdpZHRoIC0gdmVydGljYWxTY3JvbGxiYXJXaWR0aCAtIDIpIC8gdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKSAqIG1pbmltYXBDaGFyV2lkdGhcblx0XHQvLyB0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGggKiBtaW5pbWFwV2lkdGggPSAoY29udGVudFdpZHRoIC0gdmVydGljYWxTY3JvbGxiYXJXaWR0aCAtIDIpICogbWluaW1hcENoYXJXaWR0aFxuXHRcdC8vIHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCAqIG1pbmltYXBXaWR0aCA9IChyZW1haW5pbmdXaWR0aCAtIG1pbmltYXBXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLSAyKSAqIG1pbmltYXBDaGFyV2lkdGhcblx0XHQvLyAodHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoICsgbWluaW1hcENoYXJXaWR0aCkgKiBtaW5pbWFwV2lkdGggPSAocmVtYWluaW5nV2lkdGggLSB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoIC0gMikgKiBtaW5pbWFwQ2hhcldpZHRoXG5cdFx0Ly8gbWluaW1hcFdpZHRoID0gKChyZW1haW5pbmdXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLSAyKSAqIG1pbmltYXBDaGFyV2lkdGgpIC8gKHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCArIG1pbmltYXBDaGFyV2lkdGgpXG5cblx0XHRjb25zdCBtaW5pbWFwTWF4V2lkdGggPSBNYXRoLmZsb29yKG1pbmltYXBNYXhDb2x1bW4gKiBtaW5pbWFwQ2hhcldpZHRoKTtcblx0XHRjb25zdCBtaW5pbWFwV2lkdGggPSBNYXRoLm1pbihtaW5pbWFwTWF4V2lkdGgsIE1hdGgubWF4KDAsIE1hdGguZmxvb3IoKChyZW1haW5pbmdXaWR0aCAtIHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGggLSAyKSAqIG1pbmltYXBDaGFyV2lkdGgpIC8gKHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCArIG1pbmltYXBDaGFyV2lkdGgpKSkgKyBNSU5JTUFQX0dVVFRFUl9XSURUSCk7XG5cblx0XHRsZXQgbWluaW1hcENhbnZhc0lubmVyV2lkdGggPSBNYXRoLmZsb29yKHBpeGVsUmF0aW8gKiBtaW5pbWFwV2lkdGgpO1xuXHRcdGNvbnN0IG1pbmltYXBDYW52YXNPdXRlcldpZHRoID0gbWluaW1hcENhbnZhc0lubmVyV2lkdGggLyBwaXhlbFJhdGlvO1xuXHRcdG1pbmltYXBDYW52YXNJbm5lcldpZHRoID0gTWF0aC5mbG9vcihtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aCAqIG1pbmltYXBXaWR0aE11bHRpcGxpZXIpO1xuXG5cdFx0Y29uc3QgcmVuZGVyTWluaW1hcCA9IChtaW5pbWFwUmVuZGVyQ2hhcmFjdGVycyA/IFJlbmRlck1pbmltYXAuVGV4dCA6IFJlbmRlck1pbmltYXAuQmxvY2tzKTtcblx0XHRjb25zdCBtaW5pbWFwTGVmdCA9IChtaW5pbWFwU2lkZSA9PT0gJ2xlZnQnID8gMCA6IChvdXRlcldpZHRoIC0gbWluaW1hcFdpZHRoIC0gdmVydGljYWxTY3JvbGxiYXJXaWR0aCkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlbmRlck1pbmltYXAsXG5cdFx0XHRtaW5pbWFwTGVmdCxcblx0XHRcdG1pbmltYXBXaWR0aCxcblx0XHRcdG1pbmltYXBIZWlnaHRJc0VkaXRvckhlaWdodCxcblx0XHRcdG1pbmltYXBJc1NhbXBsaW5nLFxuXHRcdFx0bWluaW1hcFNjYWxlLFxuXHRcdFx0bWluaW1hcExpbmVIZWlnaHQsXG5cdFx0XHRtaW5pbWFwQ2FudmFzSW5uZXJXaWR0aCxcblx0XHRcdG1pbmltYXBDYW52YXNJbm5lckhlaWdodCxcblx0XHRcdG1pbmltYXBDYW52YXNPdXRlcldpZHRoLFxuXHRcdFx0bWluaW1hcENhbnZhc091dGVySGVpZ2h0LFxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGNvbXB1dGVMYXlvdXQob3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgZW52OiBFZGl0b3JMYXlvdXRJbmZvQ29tcHV0ZXJFbnYpOiBFZGl0b3JMYXlvdXRJbmZvIHtcblx0XHRjb25zdCBvdXRlcldpZHRoID0gZW52Lm91dGVyV2lkdGggfCAwO1xuXHRcdGNvbnN0IG91dGVySGVpZ2h0ID0gZW52Lm91dGVySGVpZ2h0IHwgMDtcblx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gZW52LmxpbmVIZWlnaHQgfCAwO1xuXHRcdGNvbnN0IGxpbmVOdW1iZXJzRGlnaXRDb3VudCA9IGVudi5saW5lTnVtYmVyc0RpZ2l0Q291bnQgfCAwO1xuXHRcdGNvbnN0IHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCA9IGVudi50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0Y29uc3QgbWF4RGlnaXRXaWR0aCA9IGVudi5tYXhEaWdpdFdpZHRoO1xuXHRcdGNvbnN0IHBpeGVsUmF0aW8gPSBlbnYucGl4ZWxSYXRpbztcblx0XHRjb25zdCB2aWV3TGluZUNvdW50ID0gZW52LnZpZXdMaW5lQ291bnQ7XG5cblx0XHRjb25zdCB3b3JkV3JhcE92ZXJyaWRlMiA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcE92ZXJyaWRlMik7XG5cdFx0Y29uc3Qgd29yZFdyYXBPdmVycmlkZTEgPSAod29yZFdyYXBPdmVycmlkZTIgPT09ICdpbmhlcml0JyA/IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcE92ZXJyaWRlMSkgOiB3b3JkV3JhcE92ZXJyaWRlMik7XG5cdFx0Y29uc3Qgd29yZFdyYXAgPSAod29yZFdyYXBPdmVycmlkZTEgPT09ICdpbmhlcml0JyA/IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcCkgOiB3b3JkV3JhcE92ZXJyaWRlMSk7XG5cblx0XHRjb25zdCB3b3JkV3JhcENvbHVtbiA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53b3JkV3JhcENvbHVtbik7XG5cdFx0Y29uc3QgaXNEb21pbmF0ZWRCeUxvbmdMaW5lcyA9IGVudi5pc0RvbWluYXRlZEJ5TG9uZ0xpbmVzO1xuXG5cdFx0Y29uc3Qgc2hvd0dseXBoTWFyZ2luID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmdseXBoTWFyZ2luKTtcblx0XHRjb25zdCBzaG93TGluZU51bWJlcnMgPSAob3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzKS5yZW5kZXJUeXBlICE9PSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT2ZmKTtcblx0XHRjb25zdCBsaW5lTnVtYmVyc01pbkNoYXJzID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzTWluQ2hhcnMpO1xuXHRcdGNvbnN0IHNjcm9sbEJleW9uZExhc3RMaW5lID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnNjcm9sbEJleW9uZExhc3RMaW5lKTtcblx0XHRjb25zdCBwYWRkaW5nID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnBhZGRpbmcpO1xuXHRcdGNvbnN0IG1pbmltYXAgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubWluaW1hcCk7XG5cblx0XHRjb25zdCBzY3JvbGxiYXIgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uc2Nyb2xsYmFyKTtcblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhcldpZHRoID0gc2Nyb2xsYmFyLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTtcblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93cyA9IHNjcm9sbGJhci52ZXJ0aWNhbEhhc0Fycm93cztcblx0XHRjb25zdCBzY3JvbGxiYXJBcnJvd1NpemUgPSBzY3JvbGxiYXIuYXJyb3dTaXplO1xuXHRcdGNvbnN0IGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQgPSBzY3JvbGxiYXIuaG9yaXpvbnRhbFNjcm9sbGJhclNpemU7XG5cblx0XHRjb25zdCBmb2xkaW5nID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmZvbGRpbmcpO1xuXHRcdGNvbnN0IHNob3dGb2xkaW5nRGVjb3JhdGlvbiA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zaG93Rm9sZGluZ0NvbnRyb2xzKSAhPT0gJ25ldmVyJztcblxuXHRcdGxldCBsaW5lRGVjb3JhdGlvbnNXaWR0aCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5saW5lRGVjb3JhdGlvbnNXaWR0aCk7XG5cdFx0aWYgKGZvbGRpbmcgJiYgc2hvd0ZvbGRpbmdEZWNvcmF0aW9uKSB7XG5cdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aCArPSAxNjtcblx0XHR9XG5cblx0XHRsZXQgbGluZU51bWJlcnNXaWR0aCA9IDA7XG5cdFx0aWYgKHNob3dMaW5lTnVtYmVycykge1xuXHRcdFx0Y29uc3QgZGlnaXRDb3VudCA9IE1hdGgubWF4KGxpbmVOdW1iZXJzRGlnaXRDb3VudCwgbGluZU51bWJlcnNNaW5DaGFycyk7XG5cdFx0XHRsaW5lTnVtYmVyc1dpZHRoID0gTWF0aC5yb3VuZChkaWdpdENvdW50ICogbWF4RGlnaXRXaWR0aCk7XG5cdFx0fVxuXG5cdFx0bGV0IGdseXBoTWFyZ2luV2lkdGggPSAwO1xuXHRcdGlmIChzaG93R2x5cGhNYXJnaW4pIHtcblx0XHRcdGdseXBoTWFyZ2luV2lkdGggPSBsaW5lSGVpZ2h0ICogZW52LmdseXBoTWFyZ2luRGVjb3JhdGlvbkxhbmVDb3VudDtcblx0XHR9XG5cblx0XHRsZXQgZ2x5cGhNYXJnaW5MZWZ0ID0gMDtcblx0XHRsZXQgbGluZU51bWJlcnNMZWZ0ID0gZ2x5cGhNYXJnaW5MZWZ0ICsgZ2x5cGhNYXJnaW5XaWR0aDtcblx0XHRsZXQgZGVjb3JhdGlvbnNMZWZ0ID0gbGluZU51bWJlcnNMZWZ0ICsgbGluZU51bWJlcnNXaWR0aDtcblx0XHRsZXQgY29udGVudExlZnQgPSBkZWNvcmF0aW9uc0xlZnQgKyBsaW5lRGVjb3JhdGlvbnNXaWR0aDtcblxuXHRcdGNvbnN0IHJlbWFpbmluZ1dpZHRoID0gb3V0ZXJXaWR0aCAtIGdseXBoTWFyZ2luV2lkdGggLSBsaW5lTnVtYmVyc1dpZHRoIC0gbGluZURlY29yYXRpb25zV2lkdGg7XG5cblx0XHRsZXQgaXNXb3JkV3JhcE1pbmlmaWVkID0gZmFsc2U7XG5cdFx0bGV0IGlzVmlld3BvcnRXcmFwcGluZyA9IGZhbHNlO1xuXHRcdGxldCB3cmFwcGluZ0NvbHVtbiA9IC0xO1xuXG5cdFx0aWYgKG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5hY2Nlc3NpYmlsaXR5U3VwcG9ydCkgPT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQgJiYgd29yZFdyYXBPdmVycmlkZTEgPT09ICdpbmhlcml0JyAmJiBpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzKSB7XG5cdFx0XHQvLyBGb3JjZSB2aWV3cG9ydCB3aWR0aCB3cmFwcGluZyBpZiBtb2RlbCBpcyBkb21pbmF0ZWQgYnkgbG9uZyBsaW5lc1xuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkID0gdHJ1ZTtcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZyA9IHRydWU7XG5cdFx0fSBlbHNlIGlmICh3b3JkV3JhcCA9PT0gJ29uJyB8fCB3b3JkV3JhcCA9PT0gJ2JvdW5kZWQnKSB7XG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmcgPSB0cnVlO1xuXHRcdH0gZWxzZSBpZiAod29yZFdyYXAgPT09ICd3b3JkV3JhcENvbHVtbicpIHtcblx0XHRcdHdyYXBwaW5nQ29sdW1uID0gd29yZFdyYXBDb2x1bW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWluaW1hcExheW91dCA9IEVkaXRvckxheW91dEluZm9Db21wdXRlci5fY29tcHV0ZU1pbmltYXBMYXlvdXQoe1xuXHRcdFx0b3V0ZXJXaWR0aDogb3V0ZXJXaWR0aCxcblx0XHRcdG91dGVySGVpZ2h0OiBvdXRlckhlaWdodCxcblx0XHRcdGxpbmVIZWlnaHQ6IGxpbmVIZWlnaHQsXG5cdFx0XHR0eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg6IHR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCxcblx0XHRcdHBpeGVsUmF0aW86IHBpeGVsUmF0aW8sXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogc2Nyb2xsQmV5b25kTGFzdExpbmUsXG5cdFx0XHRwYWRkaW5nVG9wOiBwYWRkaW5nLnRvcCxcblx0XHRcdHBhZGRpbmdCb3R0b206IHBhZGRpbmcuYm90dG9tLFxuXHRcdFx0bWluaW1hcDogbWluaW1hcCxcblx0XHRcdHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGg6IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgsXG5cdFx0XHR2aWV3TGluZUNvdW50OiB2aWV3TGluZUNvdW50LFxuXHRcdFx0cmVtYWluaW5nV2lkdGg6IHJlbWFpbmluZ1dpZHRoLFxuXHRcdFx0aXNWaWV3cG9ydFdyYXBwaW5nOiBpc1ZpZXdwb3J0V3JhcHBpbmcsXG5cdFx0fSwgZW52Lm1lbW9yeSB8fCBuZXcgQ29tcHV0ZU9wdGlvbnNNZW1vcnkoKSk7XG5cblx0XHRpZiAobWluaW1hcExheW91dC5yZW5kZXJNaW5pbWFwICE9PSBSZW5kZXJNaW5pbWFwLk5vbmUgJiYgbWluaW1hcExheW91dC5taW5pbWFwTGVmdCA9PT0gMCkge1xuXHRcdFx0Ly8gdGhlIG1pbmltYXAgaXMgcmVuZGVyZWQgdG8gdGhlIGxlZnQsIHNvIG1vdmUgZXZlcnl0aGluZyB0byB0aGUgcmlnaHRcblx0XHRcdGdseXBoTWFyZ2luTGVmdCArPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBXaWR0aDtcblx0XHRcdGxpbmVOdW1iZXJzTGVmdCArPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBXaWR0aDtcblx0XHRcdGRlY29yYXRpb25zTGVmdCArPSBtaW5pbWFwTGF5b3V0Lm1pbmltYXBXaWR0aDtcblx0XHRcdGNvbnRlbnRMZWZ0ICs9IG1pbmltYXBMYXlvdXQubWluaW1hcFdpZHRoO1xuXHRcdH1cblx0XHRjb25zdCBjb250ZW50V2lkdGggPSByZW1haW5pbmdXaWR0aCAtIG1pbmltYXBMYXlvdXQubWluaW1hcFdpZHRoO1xuXG5cdFx0Ly8gKGxlYXZpbmcgMnB4IGZvciB0aGUgY3Vyc29yIHRvIGhhdmUgc3BhY2UgYWZ0ZXIgdGhlIGxhc3QgY2hhcmFjdGVyKVxuXHRcdGNvbnN0IHZpZXdwb3J0Q29sdW1uID0gTWF0aC5tYXgoMSwgTWF0aC5mbG9vcigoY29udGVudFdpZHRoIC0gdmVydGljYWxTY3JvbGxiYXJXaWR0aCAtIDIpIC8gdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoKSk7XG5cblx0XHRjb25zdCB2ZXJ0aWNhbEFycm93U2l6ZSA9ICh2ZXJ0aWNhbFNjcm9sbGJhckhhc0Fycm93cyA/IHNjcm9sbGJhckFycm93U2l6ZSA6IDApO1xuXG5cdFx0aWYgKGlzVmlld3BvcnRXcmFwcGluZykge1xuXHRcdFx0Ly8gY29tcHV0ZSB0aGUgYWN0dWFsIHdyYXBwaW5nQ29sdW1uXG5cdFx0XHR3cmFwcGluZ0NvbHVtbiA9IE1hdGgubWF4KDEsIHZpZXdwb3J0Q29sdW1uKTtcblx0XHRcdGlmICh3b3JkV3JhcCA9PT0gJ2JvdW5kZWQnKSB7XG5cdFx0XHRcdHdyYXBwaW5nQ29sdW1uID0gTWF0aC5taW4od3JhcHBpbmdDb2x1bW4sIHdvcmRXcmFwQ29sdW1uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0d2lkdGg6IG91dGVyV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IG91dGVySGVpZ2h0LFxuXG5cdFx0XHRnbHlwaE1hcmdpbkxlZnQ6IGdseXBoTWFyZ2luTGVmdCxcblx0XHRcdGdseXBoTWFyZ2luV2lkdGg6IGdseXBoTWFyZ2luV2lkdGgsXG5cdFx0XHRnbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQ6IGVudi5nbHlwaE1hcmdpbkRlY29yYXRpb25MYW5lQ291bnQsXG5cblx0XHRcdGxpbmVOdW1iZXJzTGVmdDogbGluZU51bWJlcnNMZWZ0LFxuXHRcdFx0bGluZU51bWJlcnNXaWR0aDogbGluZU51bWJlcnNXaWR0aCxcblxuXHRcdFx0ZGVjb3JhdGlvbnNMZWZ0OiBkZWNvcmF0aW9uc0xlZnQsXG5cdFx0XHRkZWNvcmF0aW9uc1dpZHRoOiBsaW5lRGVjb3JhdGlvbnNXaWR0aCxcblxuXHRcdFx0Y29udGVudExlZnQ6IGNvbnRlbnRMZWZ0LFxuXHRcdFx0Y29udGVudFdpZHRoOiBjb250ZW50V2lkdGgsXG5cblx0XHRcdG1pbmltYXA6IG1pbmltYXBMYXlvdXQsXG5cblx0XHRcdHZpZXdwb3J0Q29sdW1uOiB2aWV3cG9ydENvbHVtbixcblxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBpc1dvcmRXcmFwTWluaWZpZWQsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGlzVmlld3BvcnRXcmFwcGluZyxcblx0XHRcdHdyYXBwaW5nQ29sdW1uOiB3cmFwcGluZ0NvbHVtbixcblxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJXaWR0aDogdmVydGljYWxTY3JvbGxiYXJXaWR0aCxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQ6IGhvcml6b250YWxTY3JvbGxiYXJIZWlnaHQsXG5cblx0XHRcdG92ZXJ2aWV3UnVsZXI6IHtcblx0XHRcdFx0dG9wOiB2ZXJ0aWNhbEFycm93U2l6ZSxcblx0XHRcdFx0d2lkdGg6IHZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgsXG5cdFx0XHRcdGhlaWdodDogKG91dGVySGVpZ2h0IC0gMiAqIHZlcnRpY2FsQXJyb3dTaXplKSxcblx0XHRcdFx0cmlnaHQ6IDBcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gV3JhcHBpbmdTdHJhdGVneVxuY2xhc3MgV3JhcHBpbmdTdHJhdGVneSBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLndyYXBwaW5nU3RyYXRlZ3ksICdzaW1wbGUnIHwgJ2FkdmFuY2VkJywgJ3NpbXBsZScgfCAnYWR2YW5jZWQnPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoRWRpdG9yT3B0aW9uLndyYXBwaW5nU3RyYXRlZ3ksICd3cmFwcGluZ1N0cmF0ZWd5JywgJ3NpbXBsZScsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3Iud3JhcHBpbmdTdHJhdGVneSc6IHtcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3dyYXBwaW5nU3RyYXRlZ3kuc2ltcGxlJywgXCJBc3N1bWVzIHRoYXQgYWxsIGNoYXJhY3RlcnMgYXJlIG9mIHRoZSBzYW1lIHdpZHRoLiBUaGlzIGlzIGEgZmFzdCBhbGdvcml0aG0gdGhhdCB3b3JrcyBjb3JyZWN0bHkgZm9yIG1vbm9zcGFjZSBmb250cyBhbmQgY2VydGFpbiBzY3JpcHRzIChsaWtlIExhdGluIGNoYXJhY3RlcnMpIHdoZXJlIGdseXBocyBhcmUgb2YgZXF1YWwgd2lkdGguXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd3cmFwcGluZ1N0cmF0ZWd5LmFkdmFuY2VkJywgXCJEZWxlZ2F0ZXMgd3JhcHBpbmcgcG9pbnRzIGNvbXB1dGF0aW9uIHRvIHRoZSBicm93c2VyLiBUaGlzIGlzIGEgc2xvdyBhbGdvcml0aG0sIHRoYXQgbWlnaHQgY2F1c2UgZnJlZXplcyBmb3IgbGFyZ2UgZmlsZXMsIGJ1dCBpdCB3b3JrcyBjb3JyZWN0bHkgaW4gYWxsIGNhc2VzLlwiKVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydzaW1wbGUnLCAnYWR2YW5jZWQnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnc2ltcGxlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3cmFwcGluZ1N0cmF0ZWd5JywgXCJDb250cm9scyB0aGUgYWxnb3JpdGhtIHRoYXQgY29tcHV0ZXMgd3JhcHBpbmcgcG9pbnRzLiBOb3RlIHRoYXQgd2hlbiBpbiBhY2Nlc3NpYmlsaXR5IG1vZGUsIGFkdmFuY2VkIHdpbGwgYmUgdXNlZCBmb3IgdGhlIGJlc3QgZXhwZXJpZW5jZS5cIilcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiAnc2ltcGxlJyB8ICdhZHZhbmNlZCcge1xuXHRcdHJldHVybiBzdHJpbmdTZXQ8J3NpbXBsZScgfCAnYWR2YW5jZWQnPihpbnB1dCwgJ3NpbXBsZScsIFsnc2ltcGxlJywgJ2FkdmFuY2VkJ10pO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGNvbXB1dGUoZW52OiBJRW52aXJvbm1lbnRhbE9wdGlvbnMsIG9wdGlvbnM6IElDb21wdXRlZEVkaXRvck9wdGlvbnMsIHZhbHVlOiAnc2ltcGxlJyB8ICdhZHZhbmNlZCcpOiAnc2ltcGxlJyB8ICdhZHZhbmNlZCcge1xuXHRcdGNvbnN0IGFjY2Vzc2liaWxpdHlTdXBwb3J0ID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlTdXBwb3J0KTtcblx0XHRpZiAoYWNjZXNzaWJpbGl0eVN1cHBvcnQgPT09IEFjY2Vzc2liaWxpdHlTdXBwb3J0LkVuYWJsZWQpIHtcblx0XHRcdC8vIGlmIHdlIGtub3cgZm9yIGEgZmFjdCB0aGF0IGEgc2NyZWVuIHJlYWRlciBpcyBhdHRhY2hlZCwgd2Ugc3dpdGNoIG91ciBzdHJhdGVneSB0byBhZHZhbmNlZCB0b1xuXHRcdFx0Ly8gaGVscCB0aGF0IHRoZSBlZGl0b3IncyB3cmFwcGluZyBwb2ludHMgbWF0Y2ggdGhlIHRleHRhcmVhJ3Mgd3JhcHBpbmcgcG9pbnRzXG5cdFx0XHRyZXR1cm4gJ2FkdmFuY2VkJztcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIGxpZ2h0YnVsYlxuXG5leHBvcnQgZW51bSBTaG93TGlnaHRidWxiSWNvbk1vZGUge1xuXHRPZmYgPSAnb2ZmJyxcblx0T25Db2RlID0gJ29uQ29kZScsXG5cdE9uID0gJ29uJ1xufVxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIGxpZ2h0YnVsYlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JMaWdodGJ1bGJPcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSB0aGUgbGlnaHRidWxiIGNvZGUgYWN0aW9uLlxuXHQgKiBUaGUgdGhyZWUgcG9zc2libGUgdmFsdWVzIGFyZSBgb2ZmYCwgYG9uYCBhbmQgYG9uQ29kZWAgYW5kIHRoZSBkZWZhdWx0IGlzIGBvbkNvZGVgLlxuXHQgKiBgb2ZmYCBkaXNhYmxlcyB0aGUgY29kZSBhY3Rpb24gbWVudS5cblx0ICogYG9uYCBzaG93cyB0aGUgY29kZSBhY3Rpb24gbWVudSBvbiBjb2RlIGFuZCBvbiBlbXB0eSBsaW5lcy5cblx0ICogYG9uQ29kZWAgc2hvd3MgdGhlIGNvZGUgYWN0aW9uIG1lbnUgb24gY29kZSBvbmx5LlxuXHQgKi9cblx0ZW5hYmxlZD86IFNob3dMaWdodGJ1bGJJY29uTW9kZTtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgRWRpdG9yTGlnaHRidWxiT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JMaWdodGJ1bGJPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvckxpZ2h0YnVsYiBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmxpZ2h0YnVsYiwgSUVkaXRvckxpZ2h0YnVsYk9wdGlvbnMsIEVkaXRvckxpZ2h0YnVsYk9wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogRWRpdG9yTGlnaHRidWxiT3B0aW9ucyA9IHsgZW5hYmxlZDogU2hvd0xpZ2h0YnVsYkljb25Nb2RlLk9uQ29kZSB9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmxpZ2h0YnVsYiwgJ2xpZ2h0YnVsYicsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLmxpZ2h0YnVsYi5lbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFtTaG93TGlnaHRidWxiSWNvbk1vZGUuT2ZmLCBTaG93TGlnaHRidWxiSWNvbk1vZGUuT25Db2RlLCBTaG93TGlnaHRidWxiSWNvbk1vZGUuT25dLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IubGlnaHRidWxiLmVuYWJsZWQub2ZmJywgJ0Rpc2FibGUgdGhlIGNvZGUgYWN0aW9uIG1lbnUuJyksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5saWdodGJ1bGIuZW5hYmxlZC5vbkNvZGUnLCAnU2hvdyB0aGUgY29kZSBhY3Rpb24gbWVudSB3aGVuIHRoZSBjdXJzb3IgaXMgb24gbGluZXMgd2l0aCBjb2RlLicpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IubGlnaHRidWxiLmVuYWJsZWQub24nLCAnU2hvdyB0aGUgY29kZSBhY3Rpb24gbWVudSB3aGVuIHRoZSBjdXJzb3IgaXMgb24gbGluZXMgd2l0aCBjb2RlIG9yIG9uIGVtcHR5IGxpbmVzLicpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZW5hYmxlZCcsIFwiRW5hYmxlcyB0aGUgQ29kZSBBY3Rpb24gbGlnaHRidWxiIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEVkaXRvckxpZ2h0YnVsYk9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvckxpZ2h0YnVsYk9wdGlvbnM+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBzdHJpbmdTZXQoaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCwgW1Nob3dMaWdodGJ1bGJJY29uTW9kZS5PZmYsIFNob3dMaWdodGJ1bGJJY29uTW9kZS5PbkNvZGUsIFNob3dMaWdodGJ1bGJJY29uTW9kZS5Pbl0pXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHN0aWNreVNjcm9sbFxuXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JTdGlja3lTY3JvbGxPcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSB0aGUgc3RpY2t5IHNjcm9sbFxuXHQgKi9cblx0ZW5hYmxlZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBNYXhpbXVtIG51bWJlciBvZiBzdGlja3kgbGluZXMgdG8gc2hvd1xuXHQgKi9cblx0bWF4TGluZUNvdW50PzogbnVtYmVyO1xuXHQvKipcblx0ICogTW9kZWwgdG8gY2hvb3NlIGZvciBzdGlja3kgc2Nyb2xsIGJ5IGRlZmF1bHRcblx0ICovXG5cdGRlZmF1bHRNb2RlbD86ICdvdXRsaW5lTW9kZWwnIHwgJ2ZvbGRpbmdQcm92aWRlck1vZGVsJyB8ICdpbmRlbnRhdGlvbk1vZGVsJztcblx0LyoqXG5cdCAqIERlZmluZSB3aGV0aGVyIHRvIHNjcm9sbCBzdGlja3kgc2Nyb2xsIHdpdGggZWRpdG9yIGhvcml6b250YWwgc2Nyb2xsYmFlXG5cdCAqL1xuXHRzY3JvbGxXaXRoRWRpdG9yPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgRWRpdG9yU3RpY2t5U2Nyb2xsT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JTdGlja3lTY3JvbGxPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvclN0aWNreVNjcm9sbCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCwgSUVkaXRvclN0aWNreVNjcm9sbE9wdGlvbnMsIEVkaXRvclN0aWNreVNjcm9sbE9wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogRWRpdG9yU3RpY2t5U2Nyb2xsT3B0aW9ucyA9IHsgZW5hYmxlZDogdHJ1ZSwgbWF4TGluZUNvdW50OiA1LCBkZWZhdWx0TW9kZWw6ICdvdXRsaW5lTW9kZWwnLCBzY3JvbGxXaXRoRWRpdG9yOiB0cnVlIH07XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsLCAnc3RpY2t5U2Nyb2xsJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3Iuc3RpY2t5U2Nyb2xsLmVuYWJsZWQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN0aWNreVNjcm9sbC5lbmFibGVkJywgXCJTaG93cyB0aGUgbmVzdGVkIGN1cnJlbnQgc2NvcGVzIGR1cmluZyB0aGUgc2Nyb2xsIGF0IHRoZSB0b3Agb2YgdGhlIGVkaXRvci5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdGlja3lTY3JvbGwubWF4TGluZUNvdW50Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLm1heExpbmVDb3VudCxcblx0XHRcdFx0XHRtaW5pbXVtOiAxLFxuXHRcdFx0XHRcdG1heGltdW06IDIwLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdGlja3lTY3JvbGwubWF4TGluZUNvdW50JywgXCJEZWZpbmVzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBzdGlja3kgbGluZXMgdG8gc2hvdy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdGlja3lTY3JvbGwuZGVmYXVsdE1vZGVsJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnb3V0bGluZU1vZGVsJywgJ2ZvbGRpbmdQcm92aWRlck1vZGVsJywgJ2luZGVudGF0aW9uTW9kZWwnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5kZWZhdWx0TW9kZWwsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN0aWNreVNjcm9sbC5kZWZhdWx0TW9kZWwnLCBcIkRlZmluZXMgdGhlIG1vZGVsIHRvIHVzZSBmb3IgZGV0ZXJtaW5pbmcgd2hpY2ggbGluZXMgdG8gc3RpY2suIElmIHRoZSBvdXRsaW5lIG1vZGVsIGRvZXMgbm90IGV4aXN0LCBpdCB3aWxsIGZhbGwgYmFjayBvbiB0aGUgZm9sZGluZyBwcm92aWRlciBtb2RlbCB3aGljaCBmYWxscyBiYWNrIG9uIHRoZSBpbmRlbnRhdGlvbiBtb2RlbC4gVGhpcyBvcmRlciBpcyByZXNwZWN0ZWQgaW4gYWxsIHRocmVlIGNhc2VzLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN0aWNreVNjcm9sbC5zY3JvbGxXaXRoRWRpdG9yJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zY3JvbGxXaXRoRWRpdG9yLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdGlja3lTY3JvbGwuc2Nyb2xsV2l0aEVkaXRvcicsIFwiRW5hYmxlIHNjcm9sbGluZyBvZiBTdGlja3kgU2Nyb2xsIHdpdGggdGhlIGVkaXRvcidzIGhvcml6b250YWwgc2Nyb2xsYmFyLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9yU3RpY2t5U2Nyb2xsT3B0aW9ucyB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJRWRpdG9yU3RpY2t5U2Nyb2xsT3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZWQ6IGJvb2xlYW4oaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCksXG5cdFx0XHRtYXhMaW5lQ291bnQ6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0Lm1heExpbmVDb3VudCwgdGhpcy5kZWZhdWx0VmFsdWUubWF4TGluZUNvdW50LCAxLCAyMCksXG5cdFx0XHRkZWZhdWx0TW9kZWw6IHN0cmluZ1NldDwnb3V0bGluZU1vZGVsJyB8ICdmb2xkaW5nUHJvdmlkZXJNb2RlbCcgfCAnaW5kZW50YXRpb25Nb2RlbCc+KGlucHV0LmRlZmF1bHRNb2RlbCwgdGhpcy5kZWZhdWx0VmFsdWUuZGVmYXVsdE1vZGVsLCBbJ291dGxpbmVNb2RlbCcsICdmb2xkaW5nUHJvdmlkZXJNb2RlbCcsICdpbmRlbnRhdGlvbk1vZGVsJ10pLFxuXHRcdFx0c2Nyb2xsV2l0aEVkaXRvcjogYm9vbGVhbihpbnB1dC5zY3JvbGxXaXRoRWRpdG9yLCB0aGlzLmRlZmF1bHRWYWx1ZS5zY3JvbGxXaXRoRWRpdG9yKVxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBpbmxheUhpbnRzXG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBlZGl0b3IgaW5sYXlIaW50c1xuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JJbmxheUhpbnRzT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgdGhlIGlubGluZSBoaW50cy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGVuYWJsZWQ/OiAnb24nIHwgJ29mZicgfCAnb2ZmVW5sZXNzUHJlc3NlZCcgfCAnb25Vbmxlc3NQcmVzc2VkJztcblxuXHQvKipcblx0ICogRm9udCBzaXplIG9mIGlubGluZSBoaW50cy5cblx0ICogRGVmYXVsdCB0byA5MCUgb2YgdGhlIGVkaXRvciBmb250IHNpemUuXG5cdCAqL1xuXHRmb250U2l6ZT86IG51bWJlcjtcblxuXHQvKipcblx0ICogRm9udCBmYW1pbHkgb2YgaW5saW5lIGhpbnRzLlxuXHQgKiBEZWZhdWx0cyB0byBlZGl0b3IgZm9udCBmYW1pbHkuXG5cdCAqL1xuXHRmb250RmFtaWx5Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBFbmFibGVzIHRoZSBwYWRkaW5nIGFyb3VuZCB0aGUgaW5sYXkgaGludC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRwYWRkaW5nPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogTWF4aW11bSBsZW5ndGggZm9yIGlubGF5IGhpbnRzIHBlciBsaW5lXG5cdCAqIFNldCB0byAwIHRvIGhhdmUgYW4gdW5saW1pdGVkIGxlbmd0aC5cblx0ICovXG5cdG1heGltdW1MZW5ndGg/OiBudW1iZXI7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvcklubGF5SGludHNPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SUVkaXRvcklubGF5SGludHNPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvcklubGF5SGludHMgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5pbmxheUhpbnRzLCBJRWRpdG9ySW5sYXlIaW50c09wdGlvbnMsIEVkaXRvcklubGF5SGludHNPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvcklubGF5SGludHNPcHRpb25zID0geyBlbmFibGVkOiAnb24nLCBmb250U2l6ZTogMCwgZm9udEZhbWlseTogJycsIHBhZGRpbmc6IGZhbHNlLCBtYXhpbXVtTGVuZ3RoOiA0MyB9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmlubGF5SGludHMsICdpbmxheUhpbnRzJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IuaW5sYXlIaW50cy5lbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5sYXlIaW50cy5lbmFibGUnLCBcIkVuYWJsZXMgdGhlIGlubGF5IGhpbnRzIGluIHRoZSBlZGl0b3IuXCIpLFxuXHRcdFx0XHRcdGVudW06IFsnb24nLCAnb25Vbmxlc3NQcmVzc2VkJywgJ29mZlVubGVzc1ByZXNzZWQnLCAnb2ZmJ10sXG5cdFx0XHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5pbmxheUhpbnRzLm9uJywgXCJJbmxheSBoaW50cyBhcmUgZW5hYmxlZFwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmlubGF5SGludHMub25Vbmxlc3NQcmVzc2VkJywgXCJJbmxheSBoaW50cyBhcmUgc2hvd2luZyBieSBkZWZhdWx0IGFuZCBoaWRlIHdoZW4gaG9sZGluZyB7MH1cIiwgcGxhdGZvcm0uaXNNYWNpbnRvc2ggPyBgQ3RybCtPcHRpb25gIDogYEN0cmwrQWx0YCksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5pbmxheUhpbnRzLm9mZlVubGVzc1ByZXNzZWQnLCBcIklubGF5IGhpbnRzIGFyZSBoaWRkZW4gYnkgZGVmYXVsdCBhbmQgc2hvdyB3aGVuIGhvbGRpbmcgezB9XCIsIHBsYXRmb3JtLmlzTWFjaW50b3NoID8gYEN0cmwrT3B0aW9uYCA6IGBDdHJsK0FsdGApLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuaW5sYXlIaW50cy5vZmYnLCBcIklubGF5IGhpbnRzIGFyZSBkaXNhYmxlZFwiKSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGF5SGludHMuZm9udFNpemUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZm9udFNpemUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxheUhpbnRzLmZvbnRTaXplJywgXCJDb250cm9scyBmb250IHNpemUgb2YgaW5sYXkgaGludHMgaW4gdGhlIGVkaXRvci4gQXMgZGVmYXVsdCB0aGUgezB9IGlzIHVzZWQgd2hlbiB0aGUgY29uZmlndXJlZCB2YWx1ZSBpcyBsZXNzIHRoYW4gezF9IG9yIGdyZWF0ZXIgdGhhbiB0aGUgZWRpdG9yIGZvbnQgc2l6ZS5cIiwgJ2AjZWRpdG9yLmZvbnRTaXplI2AnLCAnYDVgJylcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxheUhpbnRzLmZvbnRGYW1pbHknOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZm9udEZhbWlseSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGF5SGludHMuZm9udEZhbWlseScsIFwiQ29udHJvbHMgZm9udCBmYW1pbHkgb2YgaW5sYXkgaGludHMgaW4gdGhlIGVkaXRvci4gV2hlbiBzZXQgdG8gZW1wdHksIHRoZSB7MH0gaXMgdXNlZC5cIiwgJ2AjZWRpdG9yLmZvbnRGYW1pbHkjYCcpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5sYXlIaW50cy5wYWRkaW5nJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5wYWRkaW5nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGF5SGludHMucGFkZGluZycsIFwiRW5hYmxlcyB0aGUgcGFkZGluZyBhcm91bmQgdGhlIGlubGF5IGhpbnRzIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5sYXlIaW50cy5tYXhpbXVtTGVuZ3RoJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLm1heGltdW1MZW5ndGgsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxheUhpbnRzLm1heGltdW1MZW5ndGgnLCBcIk1heGltdW0gb3ZlcmFsbCBsZW5ndGggb2YgaW5sYXkgaGludHMsIGZvciBhIHNpbmdsZSBsaW5lLCBiZWZvcmUgdGhleSBnZXQgdHJ1bmNhdGVkIGJ5IHRoZSBlZGl0b3IuIFNldCB0byBgMGAgdG8gbmV2ZXIgdHJ1bmNhdGVcIilcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9ySW5sYXlIaW50c09wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvcklubGF5SGludHNPcHRpb25zPjtcblx0XHRpZiAodHlwZW9mIGlucHV0LmVuYWJsZWQgPT09ICdib29sZWFuJykge1xuXHRcdFx0aW5wdXQuZW5hYmxlZCA9IGlucHV0LmVuYWJsZWQgPyAnb24nIDogJ29mZic7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBzdHJpbmdTZXQ8J29uJyB8ICdvZmYnIHwgJ29mZlVubGVzc1ByZXNzZWQnIHwgJ29uVW5sZXNzUHJlc3NlZCc+KGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVuYWJsZWQsIFsnb24nLCAnb2ZmJywgJ29mZlVubGVzc1ByZXNzZWQnLCAnb25Vbmxlc3NQcmVzc2VkJ10pLFxuXHRcdFx0Zm9udFNpemU6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LmZvbnRTaXplLCB0aGlzLmRlZmF1bHRWYWx1ZS5mb250U2l6ZSwgMCwgMTAwKSxcblx0XHRcdGZvbnRGYW1pbHk6IEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQuZm9udEZhbWlseSwgdGhpcy5kZWZhdWx0VmFsdWUuZm9udEZhbWlseSksXG5cdFx0XHRwYWRkaW5nOiBib29sZWFuKGlucHV0LnBhZGRpbmcsIHRoaXMuZGVmYXVsdFZhbHVlLnBhZGRpbmcpLFxuXHRcdFx0bWF4aW11bUxlbmd0aDogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQubWF4aW11bUxlbmd0aCwgdGhpcy5kZWZhdWx0VmFsdWUubWF4aW11bUxlbmd0aCwgMCwgTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIpLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBsaW5lRGVjb3JhdGlvbnNXaWR0aFxuXG5jbGFzcyBFZGl0b3JMaW5lRGVjb3JhdGlvbnNXaWR0aCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmxpbmVEZWNvcmF0aW9uc1dpZHRoLCBudW1iZXIgfCBzdHJpbmcsIG51bWJlcj4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi5saW5lRGVjb3JhdGlvbnNXaWR0aCwgJ2xpbmVEZWNvcmF0aW9uc1dpZHRoJywgMTApO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogbnVtYmVyIHtcblx0XHRpZiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJyAmJiAvXlxcZCsoXFwuXFxkKyk/Y2gkLy50ZXN0KGlucHV0KSkge1xuXHRcdFx0Y29uc3QgbXVsdGlwbGUgPSBwYXJzZUZsb2F0KGlucHV0LnN1YnN0cmluZygwLCBpbnB1dC5sZW5ndGggLSAyKSk7XG5cdFx0XHRyZXR1cm4gLW11bHRpcGxlOyAvLyBuZWdhdGl2ZSBudW1iZXJzIHNpZ25hbCBhIG11bHRpcGxlXG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dCwgdGhpcy5kZWZhdWx0VmFsdWUsIDAsIDEwMDApO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAodmFsdWUgPCAwKSB7XG5cdFx0XHQvLyBuZWdhdGl2ZSBudW1iZXJzIHNpZ25hbCBhIG11bHRpcGxlXG5cdFx0XHRyZXR1cm4gRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoLXZhbHVlICogZW52LmZvbnRJbmZvLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aCwgdGhpcy5kZWZhdWx0VmFsdWUsIDAsIDEwMDApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gbGluZUhlaWdodFxuXG5jbGFzcyBFZGl0b3JMaW5lSGVpZ2h0IGV4dGVuZHMgRWRpdG9yRmxvYXRPcHRpb248RWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0LCAnbGluZUhlaWdodCcsXG5cdFx0XHRFRElUT1JfRk9OVF9ERUZBVUxUUy5saW5lSGVpZ2h0LFxuXHRcdFx0eCA9PiBFZGl0b3JGbG9hdE9wdGlvbi5jbGFtcCh4LCAwLCAxNTApLFxuXHRcdFx0eyBtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2xpbmVIZWlnaHQnLCBcIkNvbnRyb2xzIHRoZSBsaW5lIGhlaWdodC4gXFxuIC0gVXNlIDAgdG8gYXV0b21hdGljYWxseSBjb21wdXRlIHRoZSBsaW5lIGhlaWdodCBmcm9tIHRoZSBmb250IHNpemUuXFxuIC0gVmFsdWVzIGJldHdlZW4gMCBhbmQgOCB3aWxsIGJlIHVzZWQgYXMgYSBtdWx0aXBsaWVyIHdpdGggdGhlIGZvbnQgc2l6ZS5cXG4gLSBWYWx1ZXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIDggd2lsbCBiZSB1c2VkIGFzIGVmZmVjdGl2ZSB2YWx1ZXMuXCIpIH0sXG5cdFx0XHQwLFxuXHRcdFx0MTUwXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogbnVtYmVyKTogbnVtYmVyIHtcblx0XHQvLyBUaGUgbGluZUhlaWdodCBpcyBjb21wdXRlZCBmcm9tIHRoZSBmb250U2l6ZSBpZiBpdCBpcyAwLlxuXHRcdC8vIE1vcmVvdmVyLCB0aGUgZmluYWwgbGluZUhlaWdodCByZXNwZWN0cyB0aGUgZWRpdG9yIHpvb20gbGV2ZWwuXG5cdFx0Ly8gU28gdGFrZSB0aGUgcmVzdWx0IGZyb20gZW52LmZvbnRJbmZvXG5cdFx0cmV0dXJuIGVudi5mb250SW5mby5saW5lSGVpZ2h0O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gbWluaW1hcFxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIG1pbmltYXBcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yTWluaW1hcE9wdGlvbnMge1xuXHQvKipcblx0ICogRW5hYmxlIHRoZSByZW5kZXJpbmcgb2YgdGhlIG1pbmltYXAuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRlbmFibGVkPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIHJlbmRlcmluZyBvZiBtaW5pbWFwLlxuXHQgKi9cblx0YXV0b2hpZGU/OiAnbm9uZScgfCAnbW91c2VvdmVyJyB8ICdzY3JvbGwnO1xuXHQvKipcblx0ICogQ29udHJvbCB0aGUgc2lkZSBvZiB0aGUgbWluaW1hcCBpbiBlZGl0b3IuXG5cdCAqIERlZmF1bHRzIHRvICdyaWdodCcuXG5cdCAqL1xuXHRzaWRlPzogJ3JpZ2h0JyB8ICdsZWZ0Jztcblx0LyoqXG5cdCAqIENvbnRyb2wgdGhlIG1pbmltYXAgcmVuZGVyaW5nIG1vZGUuXG5cdCAqIERlZmF1bHRzIHRvICdhY3R1YWwnLlxuXHQgKi9cblx0c2l6ZT86ICdwcm9wb3J0aW9uYWwnIHwgJ2ZpbGwnIHwgJ2ZpdCc7XG5cdC8qKlxuXHQgKiBDb250cm9sIHRoZSByZW5kZXJpbmcgb2YgdGhlIG1pbmltYXAgc2xpZGVyLlxuXHQgKiBEZWZhdWx0cyB0byAnbW91c2VvdmVyJy5cblx0ICovXG5cdHNob3dTbGlkZXI/OiAnYWx3YXlzJyB8ICdtb3VzZW92ZXInO1xuXHQvKipcblx0ICogUmVuZGVyIHRoZSBhY3R1YWwgdGV4dCBvbiBhIGxpbmUgKGFzIG9wcG9zZWQgdG8gY29sb3IgYmxvY2tzKS5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHJlbmRlckNoYXJhY3RlcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogTGltaXQgdGhlIHdpZHRoIG9mIHRoZSBtaW5pbWFwIHRvIHJlbmRlciBhdCBtb3N0IGEgY2VydGFpbiBudW1iZXIgb2YgY29sdW1ucy5cblx0ICogRGVmYXVsdHMgdG8gMTIwLlxuXHQgKi9cblx0bWF4Q29sdW1uPzogbnVtYmVyO1xuXHQvKipcblx0ICogUmVsYXRpdmUgc2l6ZSBvZiB0aGUgZm9udCBpbiB0aGUgbWluaW1hcC4gRGVmYXVsdHMgdG8gMS5cblx0ICovXG5cdHNjYWxlPzogbnVtYmVyO1xuXHQvKipcblx0ICogV2hldGhlciB0byBzaG93IG5hbWVkIHJlZ2lvbnMgYXMgc2VjdGlvbiBoZWFkZXJzLiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2hvd1JlZ2lvblNlY3Rpb25IZWFkZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gc2hvdyBNQVJLOiBjb21tZW50cyBhcyBzZWN0aW9uIGhlYWRlcnMuIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzaG93TWFya1NlY3Rpb25IZWFkZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFdoZW4gc3BlY2lmaWVkLCBpcyB1c2VkIHRvIGNyZWF0ZSBhIGN1c3RvbSBzZWN0aW9uIGhlYWRlciBwYXJzZXIgcmVnZXhwLlxuXHQgKiBNdXN0IGNvbnRhaW4gYSBtYXRjaCBncm91cCBuYW1lZCAnbGFiZWwnICh3cml0dGVuIGFzICg/PGxhYmVsPi4rKSkgdGhhdCBlbmNhcHN1bGF0ZXMgdGhlIHNlY3Rpb24gaGVhZGVyLlxuXHQgKiBPcHRpb25hbGx5IGNhbiBpbmNsdWRlIGFub3RoZXIgbWF0Y2ggZ3JvdXAgbmFtZWQgJ3NlcGFyYXRvcicuXG5cdCAqIFRvIG1hdGNoIG11bHRpLWxpbmUgaGVhZGVycyBsaWtlOlxuXHQgKiAgIC8vID09PT09PT09PT1cblx0ICogICAvLyBNeSBTZWN0aW9uXG5cdCAqICAgLy8gPT09PT09PT09PVxuXHQgKiBVc2UgYSBwYXR0ZXJuIGxpa2U6IF49ezMsfVxcbl5cXC9cXC8gKig/PGxhYmVsPlteXFxuXSo/KVxcbl49ezMsfSRcblx0ICovXG5cdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBGb250IHNpemUgb2Ygc2VjdGlvbiBoZWFkZXJzLiBEZWZhdWx0cyB0byA5LlxuXHQgKi9cblx0c2VjdGlvbkhlYWRlckZvbnRTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogU3BhY2luZyBiZXR3ZWVuIHRoZSBzZWN0aW9uIGhlYWRlciBjaGFyYWN0ZXJzIChpbiBDU1MgcHgpLiBEZWZhdWx0cyB0byAxLlxuXHQgKi9cblx0c2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmc/OiBudW1iZXI7XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEVkaXRvck1pbmltYXBPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SUVkaXRvck1pbmltYXBPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvck1pbmltYXAgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5taW5pbWFwLCBJRWRpdG9yTWluaW1hcE9wdGlvbnMsIEVkaXRvck1pbmltYXBPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEVkaXRvck1pbmltYXBPcHRpb25zID0ge1xuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdHNpemU6ICdwcm9wb3J0aW9uYWwnLFxuXHRcdFx0c2lkZTogJ3JpZ2h0Jyxcblx0XHRcdHNob3dTbGlkZXI6ICdtb3VzZW92ZXInLFxuXHRcdFx0YXV0b2hpZGU6ICdub25lJyxcblx0XHRcdHJlbmRlckNoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRtYXhDb2x1bW46IDEyMCxcblx0XHRcdHNjYWxlOiAxLFxuXHRcdFx0c2hvd1JlZ2lvblNlY3Rpb25IZWFkZXJzOiB0cnVlLFxuXHRcdFx0c2hvd01hcmtTZWN0aW9uSGVhZGVyczogdHJ1ZSxcblx0XHRcdG1hcmtTZWN0aW9uSGVhZGVyUmVnZXg6ICdcXFxcYk1BUks6XFxcXHMqKD88c2VwYXJhdG9yPlxcLT8pXFxcXHMqKD88bGFiZWw+LiopJCcsXG5cdFx0XHRzZWN0aW9uSGVhZGVyRm9udFNpemU6IDksXG5cdFx0XHRzZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZzogMSxcblx0XHR9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLm1pbmltYXAsICdtaW5pbWFwJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5lbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lbmFibGVkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgbWluaW1hcCBpcyBzaG93bi5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLmF1dG9oaWRlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnbm9uZScsICdtb3VzZW92ZXInLCAnc2Nyb2xsJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdtaW5pbWFwLmF1dG9oaWRlLm5vbmUnLCBcIlRoZSBtaW5pbWFwIGlzIGFsd2F5cyBzaG93bi5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ21pbmltYXAuYXV0b2hpZGUubW91c2VvdmVyJywgXCJUaGUgbWluaW1hcCBpcyBoaWRkZW4gd2hlbiBtb3VzZSBpcyBub3Qgb3ZlciB0aGUgbWluaW1hcCBhbmQgc2hvd24gd2hlbiBtb3VzZSBpcyBvdmVyIHRoZSBtaW5pbWFwLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnbWluaW1hcC5hdXRvaGlkZS5zY3JvbGwnLCBcIlRoZSBtaW5pbWFwIGlzIG9ubHkgc2hvd24gd2hlbiB0aGUgZWRpdG9yIGlzIHNjcm9sbGVkXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYXV0b2hpZGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWluaW1hcC5hdXRvaGlkZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgbWluaW1hcCBpcyBoaWRkZW4gYXV0b21hdGljYWxseS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLnNpemUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydwcm9wb3J0aW9uYWwnLCAnZmlsbCcsICdmaXQnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ21pbmltYXAuc2l6ZS5wcm9wb3J0aW9uYWwnLCBcIlRoZSBtaW5pbWFwIGhhcyB0aGUgc2FtZSBzaXplIGFzIHRoZSBlZGl0b3IgY29udGVudHMgKGFuZCBtaWdodCBzY3JvbGwpLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnbWluaW1hcC5zaXplLmZpbGwnLCBcIlRoZSBtaW5pbWFwIHdpbGwgc3RyZXRjaCBvciBzaHJpbmsgYXMgbmVjZXNzYXJ5IHRvIGZpbGwgdGhlIGhlaWdodCBvZiB0aGUgZWRpdG9yIChubyBzY3JvbGxpbmcpLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnbWluaW1hcC5zaXplLmZpdCcsIFwiVGhlIG1pbmltYXAgd2lsbCBzaHJpbmsgYXMgbmVjZXNzYXJ5IHRvIG5ldmVyIGJlIGxhcmdlciB0aGFuIHRoZSBlZGl0b3IgKG5vIHNjcm9sbGluZykuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2l6ZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLnNpemUnLCBcIkNvbnRyb2xzIHRoZSBzaXplIG9mIHRoZSBtaW5pbWFwLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAuc2lkZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ2xlZnQnLCAncmlnaHQnXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaWRlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuc2lkZScsIFwiQ29udHJvbHMgdGhlIHNpZGUgd2hlcmUgdG8gcmVuZGVyIHRoZSBtaW5pbWFwLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAuc2hvd1NsaWRlcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdtb3VzZW92ZXInXSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93U2xpZGVyLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuc2hvd1NsaWRlcicsIFwiQ29udHJvbHMgd2hlbiB0aGUgbWluaW1hcCBzbGlkZXIgaXMgc2hvd24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5zY2FsZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zY2FsZSxcblx0XHRcdFx0XHRtaW5pbXVtOiAxLFxuXHRcdFx0XHRcdG1heGltdW06IDMsXG5cdFx0XHRcdFx0ZW51bTogWzEsIDIsIDNdLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuc2NhbGUnLCBcIlNjYWxlIG9mIGNvbnRlbnQgZHJhd24gaW4gdGhlIG1pbmltYXA6IDEsIDIgb3IgMy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLnJlbmRlckNoYXJhY3RlcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnJlbmRlckNoYXJhY3RlcnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWluaW1hcC5yZW5kZXJDaGFyYWN0ZXJzJywgXCJSZW5kZXIgdGhlIGFjdHVhbCBjaGFyYWN0ZXJzIG9uIGEgbGluZSBhcyBvcHBvc2VkIHRvIGNvbG9yIGJsb2Nrcy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLm1heENvbHVtbic6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5tYXhDb2x1bW4sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWluaW1hcC5tYXhDb2x1bW4nLCBcIkxpbWl0IHRoZSB3aWR0aCBvZiB0aGUgbWluaW1hcCB0byByZW5kZXIgYXQgbW9zdCBhIGNlcnRhaW4gbnVtYmVyIG9mIGNvbHVtbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5zaG93UmVnaW9uU2VjdGlvbkhlYWRlcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNob3dSZWdpb25TZWN0aW9uSGVhZGVycyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtaW5pbWFwLnNob3dSZWdpb25TZWN0aW9uSGVhZGVycycsIFwiQ29udHJvbHMgd2hldGhlciBuYW1lZCByZWdpb25zIGFyZSBzaG93biBhcyBzZWN0aW9uIGhlYWRlcnMgaW4gdGhlIG1pbmltYXAuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IubWluaW1hcC5zaG93TWFya1NlY3Rpb25IZWFkZXJzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93TWFya1NlY3Rpb25IZWFkZXJzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAuc2hvd01hcmtTZWN0aW9uSGVhZGVycycsIFwiQ29udHJvbHMgd2hldGhlciBNQVJLOiBjb21tZW50cyBhcmUgc2hvd24gYXMgc2VjdGlvbiBoZWFkZXJzIGluIHRoZSBtaW5pbWFwLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAubWFya1NlY3Rpb25IZWFkZXJSZWdleCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5tYXJrU2VjdGlvbkhlYWRlclJlZ2V4LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21pbmltYXAubWFya1NlY3Rpb25IZWFkZXJSZWdleCcsIFwiRGVmaW5lcyB0aGUgcmVndWxhciBleHByZXNzaW9uIHVzZWQgdG8gZmluZCBzZWN0aW9uIGhlYWRlcnMgaW4gY29tbWVudHMuIFRoZSByZWdleCBtdXN0IGNvbnRhaW4gYSBuYW1lZCBtYXRjaCBncm91cCBgbGFiZWxgICh3cml0dGVuIGFzIGAoPzxsYWJlbD4uKylgKSB0aGF0IGVuY2Fwc3VsYXRlcyB0aGUgc2VjdGlvbiBoZWFkZXIsIG90aGVyd2lzZSBpdCB3aWxsIG5vdCB3b3JrLiBPcHRpb25hbGx5IHlvdSBjYW4gaW5jbHVkZSBhbm90aGVyIG1hdGNoIGdyb3VwIG5hbWVkIGBzZXBhcmF0b3JgLiBVc2UgXFxcXG4gaW4gdGhlIHBhdHRlcm4gdG8gbWF0Y2ggbXVsdGktbGluZSBoZWFkZXJzLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5taW5pbWFwLnNlY3Rpb25IZWFkZXJGb250U2l6ZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zZWN0aW9uSGVhZGVyRm9udFNpemUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWluaW1hcC5zZWN0aW9uSGVhZGVyRm9udFNpemUnLCBcIkNvbnRyb2xzIHRoZSBmb250IHNpemUgb2Ygc2VjdGlvbiBoZWFkZXJzIGluIHRoZSBtaW5pbWFwLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLm1pbmltYXAuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbWluaW1hcC5zZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZycsIFwiQ29udHJvbHMgdGhlIGFtb3VudCBvZiBzcGFjZSAoaW4gcGl4ZWxzKSBiZXR3ZWVuIGNoYXJhY3RlcnMgb2Ygc2VjdGlvbiBoZWFkZXIuIFRoaXMgaGVscHMgdGhlIHJlYWRhYmlsaXR5IG9mIHRoZSBoZWFkZXIgaW4gc21hbGwgZm9udCBzaXplcy5cIilcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9yTWluaW1hcE9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvck1pbmltYXBPcHRpb25zPjtcblxuXHRcdC8vIFZhbGlkYXRlIG1hcmsgc2VjdGlvbiBoZWFkZXIgcmVnZXhcblx0XHRsZXQgbWFya1NlY3Rpb25IZWFkZXJSZWdleCA9IHRoaXMuZGVmYXVsdFZhbHVlLm1hcmtTZWN0aW9uSGVhZGVyUmVnZXg7XG5cdFx0Y29uc3QgaW5wdXRSZWdleCA9IGlucHV0Lm1hcmtTZWN0aW9uSGVhZGVyUmVnZXg7XG5cdFx0aWYgKHR5cGVvZiBpbnB1dFJlZ2V4ID09PSAnc3RyaW5nJykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bmV3IFJlZ0V4cChpbnB1dFJlZ2V4LCAnZCcpO1xuXHRcdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4ID0gaW5wdXRSZWdleDtcblx0XHRcdH0gY2F0Y2ggeyB9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZWQ6IGJvb2xlYW4oaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCksXG5cdFx0XHRhdXRvaGlkZTogc3RyaW5nU2V0PCdub25lJyB8ICdtb3VzZW92ZXInIHwgJ3Njcm9sbCc+KGlucHV0LmF1dG9oaWRlLCB0aGlzLmRlZmF1bHRWYWx1ZS5hdXRvaGlkZSwgWydub25lJywgJ21vdXNlb3ZlcicsICdzY3JvbGwnXSksXG5cdFx0XHRzaXplOiBzdHJpbmdTZXQ8J3Byb3BvcnRpb25hbCcgfCAnZmlsbCcgfCAnZml0Jz4oaW5wdXQuc2l6ZSwgdGhpcy5kZWZhdWx0VmFsdWUuc2l6ZSwgWydwcm9wb3J0aW9uYWwnLCAnZmlsbCcsICdmaXQnXSksXG5cdFx0XHRzaWRlOiBzdHJpbmdTZXQ8J3JpZ2h0JyB8ICdsZWZ0Jz4oaW5wdXQuc2lkZSwgdGhpcy5kZWZhdWx0VmFsdWUuc2lkZSwgWydyaWdodCcsICdsZWZ0J10pLFxuXHRcdFx0c2hvd1NsaWRlcjogc3RyaW5nU2V0PCdhbHdheXMnIHwgJ21vdXNlb3Zlcic+KGlucHV0LnNob3dTbGlkZXIsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dTbGlkZXIsIFsnYWx3YXlzJywgJ21vdXNlb3ZlciddKSxcblx0XHRcdHJlbmRlckNoYXJhY3RlcnM6IGJvb2xlYW4oaW5wdXQucmVuZGVyQ2hhcmFjdGVycywgdGhpcy5kZWZhdWx0VmFsdWUucmVuZGVyQ2hhcmFjdGVycyksXG5cdFx0XHRzY2FsZTogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQuc2NhbGUsIDEsIDEsIDMpLFxuXHRcdFx0bWF4Q29sdW1uOiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5tYXhDb2x1bW4sIHRoaXMuZGVmYXVsdFZhbHVlLm1heENvbHVtbiwgMSwgMTAwMDApLFxuXHRcdFx0c2hvd1JlZ2lvblNlY3Rpb25IZWFkZXJzOiBib29sZWFuKGlucHV0LnNob3dSZWdpb25TZWN0aW9uSGVhZGVycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd1JlZ2lvblNlY3Rpb25IZWFkZXJzKSxcblx0XHRcdHNob3dNYXJrU2VjdGlvbkhlYWRlcnM6IGJvb2xlYW4oaW5wdXQuc2hvd01hcmtTZWN0aW9uSGVhZGVycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd01hcmtTZWN0aW9uSGVhZGVycyksXG5cdFx0XHRtYXJrU2VjdGlvbkhlYWRlclJlZ2V4OiBtYXJrU2VjdGlvbkhlYWRlclJlZ2V4LFxuXHRcdFx0c2VjdGlvbkhlYWRlckZvbnRTaXplOiBFZGl0b3JGbG9hdE9wdGlvbi5jbGFtcChFZGl0b3JGbG9hdE9wdGlvbi5mbG9hdChpbnB1dC5zZWN0aW9uSGVhZGVyRm9udFNpemUsIHRoaXMuZGVmYXVsdFZhbHVlLnNlY3Rpb25IZWFkZXJGb250U2l6ZSksIDQsIDMyKSxcblx0XHRcdHNlY3Rpb25IZWFkZXJMZXR0ZXJTcGFjaW5nOiBFZGl0b3JGbG9hdE9wdGlvbi5jbGFtcChFZGl0b3JGbG9hdE9wdGlvbi5mbG9hdChpbnB1dC5zZWN0aW9uSGVhZGVyTGV0dGVyU3BhY2luZywgdGhpcy5kZWZhdWx0VmFsdWUuc2VjdGlvbkhlYWRlckxldHRlclNwYWNpbmcpLCAwLCA1KSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gbXVsdGlDdXJzb3JNb2RpZmllclxuXG5mdW5jdGlvbiBfbXVsdGlDdXJzb3JNb2RpZmllckZyb21TdHJpbmcobXVsdGlDdXJzb3JNb2RpZmllcjogJ2N0cmxDbWQnIHwgJ2FsdCcpOiAnYWx0S2V5JyB8ICdtZXRhS2V5JyB8ICdjdHJsS2V5JyB7XG5cdGlmIChtdWx0aUN1cnNvck1vZGlmaWVyID09PSAnY3RybENtZCcpIHtcblx0XHRyZXR1cm4gKHBsYXRmb3JtLmlzTWFjaW50b3NoID8gJ21ldGFLZXknIDogJ2N0cmxLZXknKTtcblx0fVxuXHRyZXR1cm4gJ2FsdEtleSc7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gcGFkZGluZ1xuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIHBhZGRpbmdcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRWRpdG9yUGFkZGluZ09wdGlvbnMge1xuXHQvKipcblx0ICogU3BhY2luZyBiZXR3ZWVuIHRvcCBlZGdlIG9mIGVkaXRvciBhbmQgZmlyc3QgbGluZS5cblx0ICovXG5cdHRvcD86IG51bWJlcjtcblx0LyoqXG5cdCAqIFNwYWNpbmcgYmV0d2VlbiBib3R0b20gZWRnZSBvZiBlZGl0b3IgYW5kIGxhc3QgbGluZS5cblx0ICovXG5cdGJvdHRvbT86IG51bWJlcjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgSW50ZXJuYWxFZGl0b3JQYWRkaW5nT3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElFZGl0b3JQYWRkaW5nT3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JQYWRkaW5nIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ucGFkZGluZywgSUVkaXRvclBhZGRpbmdPcHRpb25zLCBJbnRlcm5hbEVkaXRvclBhZGRpbmdPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24ucGFkZGluZywgJ3BhZGRpbmcnLCB7IHRvcDogMCwgYm90dG9tOiAwIH0sXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IucGFkZGluZy50b3AnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRcdG1heGltdW06IDEwMDAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncGFkZGluZy50b3AnLCBcIkNvbnRyb2xzIHRoZSBhbW91bnQgb2Ygc3BhY2UgYmV0d2VlbiB0aGUgdG9wIGVkZ2Ugb2YgdGhlIGVkaXRvciBhbmQgdGhlIGZpcnN0IGxpbmUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IucGFkZGluZy5ib3R0b20nOiB7XG5cdFx0XHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogMCxcblx0XHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRcdG1heGltdW06IDEwMDAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncGFkZGluZy5ib3R0b20nLCBcIkNvbnRyb2xzIHRoZSBhbW91bnQgb2Ygc3BhY2UgYmV0d2VlbiB0aGUgYm90dG9tIGVkZ2Ugb2YgdGhlIGVkaXRvciBhbmQgdGhlIGxhc3QgbGluZS5cIilcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogSW50ZXJuYWxFZGl0b3JQYWRkaW5nT3B0aW9ucyB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJRWRpdG9yUGFkZGluZ09wdGlvbnM+O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvcDogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQudG9wLCAwLCAwLCAxMDAwKSxcblx0XHRcdGJvdHRvbTogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQuYm90dG9tLCAwLCAwLCAxMDAwKVxuXHRcdH07XG5cdH1cbn1cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gcGFyYW1ldGVySGludHNcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHBhcmFtZXRlciBoaW50c1xuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JQYXJhbWV0ZXJIaW50T3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBFbmFibGUgcGFyYW1ldGVyIGhpbnRzLlxuXHQgKiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0ZW5hYmxlZD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgY3ljbGluZyBvZiBwYXJhbWV0ZXIgaGludHMuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0Y3ljbGU/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBJbnRlcm5hbFBhcmFtZXRlckhpbnRPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SUVkaXRvclBhcmFtZXRlckhpbnRPcHRpb25zPj47XG5cbmNsYXNzIEVkaXRvclBhcmFtZXRlckhpbnRzIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ucGFyYW1ldGVySGludHMsIElFZGl0b3JQYXJhbWV0ZXJIaW50T3B0aW9ucywgSW50ZXJuYWxQYXJhbWV0ZXJIaW50T3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBJbnRlcm5hbFBhcmFtZXRlckhpbnRPcHRpb25zID0ge1xuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGN5Y2xlOiB0cnVlXG5cdFx0fTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5wYXJhbWV0ZXJIaW50cywgJ3BhcmFtZXRlckhpbnRzJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IucGFyYW1ldGVySGludHMuZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZW5hYmxlZCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwYXJhbWV0ZXJIaW50cy5lbmFibGVkJywgXCJFbmFibGVzIGEgcG9wLXVwIHRoYXQgc2hvd3MgcGFyYW1ldGVyIGRvY3VtZW50YXRpb24gYW5kIHR5cGUgaW5mb3JtYXRpb24gYXMgeW91IHR5cGUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IucGFyYW1ldGVySGludHMuY3ljbGUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmN5Y2xlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3BhcmFtZXRlckhpbnRzLmN5Y2xlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBwYXJhbWV0ZXIgaGludHMgbWVudSBjeWNsZXMgb3IgY2xvc2VzIHdoZW4gcmVhY2hpbmcgdGhlIGVuZCBvZiB0aGUgbGlzdC5cIilcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsUGFyYW1ldGVySGludE9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUVkaXRvclBhcmFtZXRlckhpbnRPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogYm9vbGVhbihpbnB1dC5lbmFibGVkLCB0aGlzLmRlZmF1bHRWYWx1ZS5lbmFibGVkKSxcblx0XHRcdGN5Y2xlOiBib29sZWFuKGlucHV0LmN5Y2xlLCB0aGlzLmRlZmF1bHRWYWx1ZS5jeWNsZSlcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gcGl4ZWxSYXRpb1xuXG5jbGFzcyBFZGl0b3JQaXhlbFJhdGlvIGV4dGVuZHMgQ29tcHV0ZWRFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnBpeGVsUmF0aW8sIG51bWJlcj4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi5waXhlbFJhdGlvLCAxKTtcblx0fVxuXG5cdHB1YmxpYyBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCBfOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiBlbnYucGl4ZWxSYXRpbztcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uXG5cbmNsYXNzIFBsYWNlaG9sZGVyT3B0aW9uIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ucGxhY2Vob2xkZXIsIHN0cmluZyB8IHVuZGVmaW5lZCwgc3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKEVkaXRvck9wdGlvbi5wbGFjZWhvbGRlciwgJ3BsYWNlaG9sZGVyJywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBpbnB1dDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHR9XG59XG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHF1aWNrU3VnZ2VzdGlvbnNcblxuZXhwb3J0IHR5cGUgUXVpY2tTdWdnZXN0aW9uc1ZhbHVlID0gJ29uJyB8ICdpbmxpbmUnIHwgJ29mZicgfCAnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJztcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHF1aWNrIHN1Z2dlc3Rpb25zXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zIHtcblx0b3RoZXI/OiBib29sZWFuIHwgUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xuXHRjb21tZW50cz86IGJvb2xlYW4gfCBRdWlja1N1Z2dlc3Rpb25zVmFsdWU7XG5cdHN0cmluZ3M/OiBib29sZWFuIHwgUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMge1xuXHRyZWFkb25seSBvdGhlcjogUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xuXHRyZWFkb25seSBjb21tZW50czogUXVpY2tTdWdnZXN0aW9uc1ZhbHVlO1xuXHRyZWFkb25seSBzdHJpbmdzOiBRdWlja1N1Z2dlc3Rpb25zVmFsdWU7XG59XG5cbmNsYXNzIEVkaXRvclF1aWNrU3VnZ2VzdGlvbnMgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5xdWlja1N1Z2dlc3Rpb25zLCBib29sZWFuIHwgUXVpY2tTdWdnZXN0aW9uc1ZhbHVlIHwgSVF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zLCBJbnRlcm5hbFF1aWNrU3VnZ2VzdGlvbnNPcHRpb25zPiB7XG5cblx0cHVibGljIG92ZXJyaWRlIHJlYWRvbmx5IGRlZmF1bHRWYWx1ZTogSW50ZXJuYWxRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogSW50ZXJuYWxRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucyA9IHtcblx0XHRcdG90aGVyOiAnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJyxcblx0XHRcdGNvbW1lbnRzOiAnb2ZmJyxcblx0XHRcdHN0cmluZ3M6ICdvZmYnXG5cdFx0fTtcblx0XHRjb25zdCB0eXBlczogSUpTT05TY2hlbWFbXSA9IFtcblx0XHRcdHsgdHlwZTogJ2Jvb2xlYW4nIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ29uJywgJ2lubGluZScsICdvZmYnLCAnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJ10sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtubHMubG9jYWxpemUoJ29uJywgXCJRdWljayBzdWdnZXN0aW9ucyBzaG93IGluc2lkZSB0aGUgc3VnZ2VzdCB3aWRnZXRcIiksIG5scy5sb2NhbGl6ZSgnaW5saW5lJywgXCJRdWljayBzdWdnZXN0aW9ucyBzaG93IGFzIGdob3N0IHRleHRcIiksIG5scy5sb2NhbGl6ZSgnb2ZmJywgXCJRdWljayBzdWdnZXN0aW9ucyBhcmUgZGlzYWJsZWRcIiksIG5scy5sb2NhbGl6ZSgnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJywgXCJRdWljayBzdWdnZXN0aW9ucyBhcmUgZGlzYWJsZWQgd2hlbiBpbmxpbmUgY29tcGxldGlvbnMgYXJlIHNob3dpbmdcIildXG5cdFx0XHR9XG5cdFx0XTtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24ucXVpY2tTdWdnZXN0aW9ucywgJ3F1aWNrU3VnZ2VzdGlvbnMnLCBkZWZhdWx0cywge1xuXHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0eyB0eXBlOiAnYm9vbGVhbicgfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnb24nLCAnaW5saW5lJywgJ29mZicsICdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbbmxzLmxvY2FsaXplKCdxdWlja1N1Z2dlc3Rpb25zLnRvcExldmVsLm9uJywgXCJRdWljayBzdWdnZXN0aW9ucyBhcmUgZW5hYmxlZCBmb3IgYWxsIHRva2VuIHR5cGVzXCIpLCBubHMubG9jYWxpemUoJ3F1aWNrU3VnZ2VzdGlvbnMudG9wTGV2ZWwuaW5saW5lJywgXCJRdWljayBzdWdnZXN0aW9ucyBzaG93IGFzIGdob3N0IHRleHQgZm9yIGFsbCB0b2tlbiB0eXBlc1wiKSwgbmxzLmxvY2FsaXplKCdxdWlja1N1Z2dlc3Rpb25zLnRvcExldmVsLm9mZicsIFwiUXVpY2sgc3VnZ2VzdGlvbnMgYXJlIGRpc2FibGVkIGZvciBhbGwgdG9rZW4gdHlwZXNcIiksIG5scy5sb2NhbGl6ZSgncXVpY2tTdWdnZXN0aW9ucy50b3BMZXZlbC5vZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnLCBcIlF1aWNrIHN1Z2dlc3Rpb25zIGFyZSBkaXNhYmxlZCBmb3IgYWxsIHRva2VuIHR5cGVzIHdoZW4gaW5saW5lIGNvbXBsZXRpb25zIGFyZSBzaG93aW5nXCIpXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHN0cmluZ3M6IHtcblx0XHRcdFx0XHRcdFx0YW55T2Y6IHR5cGVzLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zdHJpbmdzLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdxdWlja1N1Z2dlc3Rpb25zLnN0cmluZ3MnLCBcIkVuYWJsZSBxdWljayBzdWdnZXN0aW9ucyBpbnNpZGUgc3RyaW5ncy5cIilcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjb21tZW50czoge1xuXHRcdFx0XHRcdFx0XHRhbnlPZjogdHlwZXMsXG5cdFx0XHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmNvbW1lbnRzLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdxdWlja1N1Z2dlc3Rpb25zLmNvbW1lbnRzJywgXCJFbmFibGUgcXVpY2sgc3VnZ2VzdGlvbnMgaW5zaWRlIGNvbW1lbnRzLlwiKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG90aGVyOiB7XG5cdFx0XHRcdFx0XHRcdGFueU9mOiB0eXBlcyxcblx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMub3RoZXIsXG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3F1aWNrU3VnZ2VzdGlvbnMub3RoZXInLCBcIkVuYWJsZSBxdWljayBzdWdnZXN0aW9ucyBvdXRzaWRlIG9mIHN0cmluZ3MgYW5kIGNvbW1lbnRzLlwiKVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3F1aWNrU3VnZ2VzdGlvbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc3VnZ2VzdGlvbnMgc2hvdWxkIGF1dG9tYXRpY2FsbHkgc2hvdyB1cCB3aGlsZSB0eXBpbmcuIFRoaXMgY2FuIGJlIGNvbnRyb2xsZWQgZm9yIHR5cGluZyBpbiBjb21tZW50cywgc3RyaW5ncywgYW5kIG90aGVyIGNvZGUuIFF1aWNrIHN1Z2dlc3Rpb24gY2FuIGJlIGNvbmZpZ3VyZWQgdG8gc2hvdyBhcyBnaG9zdCB0ZXh0IG9yIHdpdGggdGhlIHN1Z2dlc3Qgd2lkZ2V0LiBBbHNvIGJlIGF3YXJlIG9mIHRoZSB7MH0tc2V0dGluZyB3aGljaCBjb250cm9scyBpZiBzdWdnZXN0aW9ucyBhcmUgdHJpZ2dlcmVkIGJ5IHNwZWNpYWwgY2hhcmFjdGVycy5cIiwgJ2AjZWRpdG9yLnN1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzI2AnKSxcblx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5kZWZhdWx0VmFsdWUgPSBkZWZhdWx0cztcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IEludGVybmFsUXVpY2tTdWdnZXN0aW9uc09wdGlvbnMge1xuXHRcdGlmICh0eXBlb2YgaW5wdXQgPT09ICdib29sZWFuJykge1xuXHRcdFx0Ly8gYm9vbGVhbiAtPiBhbGwgb24vb2ZmXG5cdFx0XHRjb25zdCB2YWx1ZSA9IGlucHV0ID8gJ29uJyA6ICdvZmYnO1xuXHRcdFx0cmV0dXJuIHsgY29tbWVudHM6IHZhbHVlLCBzdHJpbmdzOiB2YWx1ZSwgb3RoZXI6IHZhbHVlIH07XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHQvLyBzdHJpbmcgc2hvcnRoYW5kIC0+IGFwcGx5IHNhbWUgdmFsdWUgdG8gYWxsIHRva2VuIHR5cGVzXG5cdFx0XHRjb25zdCBhbGxvd2VkVmFsdWVzOiBRdWlja1N1Z2dlc3Rpb25zVmFsdWVbXSA9IFsnb24nLCAnaW5saW5lJywgJ29mZicsICdvZmZXaGVuSW5saW5lQ29tcGxldGlvbnMnXTtcblx0XHRcdGNvbnN0IHZhbGlkYXRlZCA9IHN0cmluZ1NldDxRdWlja1N1Z2dlc3Rpb25zVmFsdWU+KGlucHV0IGFzIFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZSwgdGhpcy5kZWZhdWx0VmFsdWUub3RoZXIsIGFsbG93ZWRWYWx1ZXMpO1xuXHRcdFx0cmV0dXJuIHsgY29tbWVudHM6IHZhbGlkYXRlZCwgc3RyaW5nczogdmFsaWRhdGVkLCBvdGhlcjogdmFsaWRhdGVkIH07XG5cdFx0fVxuXHRcdGlmICghaW5wdXQgfHwgdHlwZW9mIGlucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0Ly8gaW52YWxpZCBpbnB1dFxuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgb3RoZXIsIGNvbW1lbnRzLCBzdHJpbmdzIH0gPSAoPElRdWlja1N1Z2dlc3Rpb25zT3B0aW9ucz5pbnB1dCk7XG5cdFx0Y29uc3QgYWxsb3dlZFZhbHVlczogUXVpY2tTdWdnZXN0aW9uc1ZhbHVlW10gPSBbJ29uJywgJ2lubGluZScsICdvZmYnLCAnb2ZmV2hlbklubGluZUNvbXBsZXRpb25zJ107XG5cdFx0bGV0IHZhbGlkYXRlZE90aGVyOiBRdWlja1N1Z2dlc3Rpb25zVmFsdWU7XG5cdFx0bGV0IHZhbGlkYXRlZENvbW1lbnRzOiBRdWlja1N1Z2dlc3Rpb25zVmFsdWU7XG5cdFx0bGV0IHZhbGlkYXRlZFN0cmluZ3M6IFF1aWNrU3VnZ2VzdGlvbnNWYWx1ZTtcblxuXHRcdGlmICh0eXBlb2Ygb3RoZXIgPT09ICdib29sZWFuJykge1xuXHRcdFx0dmFsaWRhdGVkT3RoZXIgPSBvdGhlciA/ICdvbicgOiAnb2ZmJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFsaWRhdGVkT3RoZXIgPSBzdHJpbmdTZXQob3RoZXIsIHRoaXMuZGVmYXVsdFZhbHVlLm90aGVyLCBhbGxvd2VkVmFsdWVzKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBjb21tZW50cyA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR2YWxpZGF0ZWRDb21tZW50cyA9IGNvbW1lbnRzID8gJ29uJyA6ICdvZmYnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YWxpZGF0ZWRDb21tZW50cyA9IHN0cmluZ1NldChjb21tZW50cywgdGhpcy5kZWZhdWx0VmFsdWUuY29tbWVudHMsIGFsbG93ZWRWYWx1ZXMpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIHN0cmluZ3MgPT09ICdib29sZWFuJykge1xuXHRcdFx0dmFsaWRhdGVkU3RyaW5ncyA9IHN0cmluZ3MgPyAnb24nIDogJ29mZic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhbGlkYXRlZFN0cmluZ3MgPSBzdHJpbmdTZXQoc3RyaW5ncywgdGhpcy5kZWZhdWx0VmFsdWUuc3RyaW5ncywgYWxsb3dlZFZhbHVlcyk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRvdGhlcjogdmFsaWRhdGVkT3RoZXIsXG5cdFx0XHRjb21tZW50czogdmFsaWRhdGVkQ29tbWVudHMsXG5cdFx0XHRzdHJpbmdzOiB2YWxpZGF0ZWRTdHJpbmdzXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHJlbmRlckxpbmVOdW1iZXJzXG5cbmV4cG9ydCB0eXBlIExpbmVOdW1iZXJzVHlwZSA9ICdvbicgfCAnb2ZmJyB8ICdyZWxhdGl2ZScgfCAnaW50ZXJ2YWwnIHwgKChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHN0cmluZyk7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFJlbmRlckxpbmVOdW1iZXJzVHlwZSB7XG5cdE9mZiA9IDAsXG5cdE9uID0gMSxcblx0UmVsYXRpdmUgPSAyLFxuXHRJbnRlcnZhbCA9IDMsXG5cdEN1c3RvbSA9IDRcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnRlcm5hbEVkaXRvclJlbmRlckxpbmVOdW1iZXJzT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHJlbmRlclR5cGU6IFJlbmRlckxpbmVOdW1iZXJzVHlwZTtcblx0cmVhZG9ubHkgcmVuZGVyRm46ICgobGluZU51bWJlcjogbnVtYmVyKSA9PiBzdHJpbmcpIHwgbnVsbDtcbn1cblxuY2xhc3MgRWRpdG9yUmVuZGVyTGluZU51bWJlcnNPcHRpb24gZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5saW5lTnVtYmVycywgTGluZU51bWJlcnNUeXBlLCBJbnRlcm5hbEVkaXRvclJlbmRlckxpbmVOdW1iZXJzT3B0aW9ucz4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzLCAnbGluZU51bWJlcnMnLCB7IHJlbmRlclR5cGU6IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PbiwgcmVuZGVyRm46IG51bGwgfSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGVudW06IFsnb2ZmJywgJ29uJywgJ3JlbGF0aXZlJywgJ2ludGVydmFsJ10sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2xpbmVOdW1iZXJzLm9mZicsIFwiTGluZSBudW1iZXJzIGFyZSBub3QgcmVuZGVyZWQuXCIpLFxuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnbGluZU51bWJlcnMub24nLCBcIkxpbmUgbnVtYmVycyBhcmUgcmVuZGVyZWQgYXMgYWJzb2x1dGUgbnVtYmVyLlwiKSxcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2xpbmVOdW1iZXJzLnJlbGF0aXZlJywgXCJMaW5lIG51bWJlcnMgYXJlIHJlbmRlcmVkIGFzIGRpc3RhbmNlIGluIGxpbmVzIHRvIGN1cnNvciBwb3NpdGlvbi5cIiksXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdsaW5lTnVtYmVycy5pbnRlcnZhbCcsIFwiTGluZSBudW1iZXJzIGFyZSByZW5kZXJlZCBldmVyeSAxMCBsaW5lcy5cIilcblx0XHRcdFx0XSxcblx0XHRcdFx0ZGVmYXVsdDogJ29uJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbGluZU51bWJlcnMnLCBcIkNvbnRyb2xzIHRoZSBkaXNwbGF5IG9mIGxpbmUgbnVtYmVycy5cIilcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGxpbmVOdW1iZXJzOiB1bmtub3duKTogSW50ZXJuYWxFZGl0b3JSZW5kZXJMaW5lTnVtYmVyc09wdGlvbnMge1xuXHRcdGxldCByZW5kZXJUeXBlOiBSZW5kZXJMaW5lTnVtYmVyc1R5cGUgPSB0aGlzLmRlZmF1bHRWYWx1ZS5yZW5kZXJUeXBlO1xuXHRcdGxldCByZW5kZXJGbjogKChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHN0cmluZykgfCBudWxsID0gdGhpcy5kZWZhdWx0VmFsdWUucmVuZGVyRm47XG5cblx0XHRpZiAodHlwZW9mIGxpbmVOdW1iZXJzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0aWYgKHR5cGVvZiBsaW5lTnVtYmVycyA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0XHRyZW5kZXJUeXBlID0gUmVuZGVyTGluZU51bWJlcnNUeXBlLkN1c3RvbTtcblx0XHRcdFx0cmVuZGVyRm4gPSBsaW5lTnVtYmVycyBhcyAoKGxpbmVOdW1iZXI6IG51bWJlcikgPT4gc3RyaW5nKTtcblx0XHRcdH0gZWxzZSBpZiAobGluZU51bWJlcnMgPT09ICdpbnRlcnZhbCcpIHtcblx0XHRcdFx0cmVuZGVyVHlwZSA9IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5JbnRlcnZhbDtcblx0XHRcdH0gZWxzZSBpZiAobGluZU51bWJlcnMgPT09ICdyZWxhdGl2ZScpIHtcblx0XHRcdFx0cmVuZGVyVHlwZSA9IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5SZWxhdGl2ZTtcblx0XHRcdH0gZWxzZSBpZiAobGluZU51bWJlcnMgPT09ICdvbicpIHtcblx0XHRcdFx0cmVuZGVyVHlwZSA9IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5Pbjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlbmRlclR5cGUgPSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT2ZmO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZW5kZXJUeXBlLFxuXHRcdFx0cmVuZGVyRm5cblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gcmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zXG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMob3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRjb25zdCByZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVuZGVyVmFsaWRhdGlvbkRlY29yYXRpb25zKTtcblx0aWYgKHJlbmRlclZhbGlkYXRpb25EZWNvcmF0aW9ucyA9PT0gJ2VkaXRhYmxlJykge1xuXHRcdHJldHVybiBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ucmVhZE9ubHkpO1xuXHR9XG5cdHJldHVybiByZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMgPT09ICdvbicgPyBmYWxzZSA6IHRydWU7XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZmlsdGVyRm9udERlY29yYXRpb25zXG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmaWx0ZXJGb250RGVjb3JhdGlvbnMob3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIW9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5lZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHMpO1xufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHJ1bGVyc1xuXG5leHBvcnQgaW50ZXJmYWNlIElSdWxlck9wdGlvbiB7XG5cdHJlYWRvbmx5IGNvbHVtbjogbnVtYmVyO1xuXHRyZWFkb25seSBjb2xvcjogc3RyaW5nIHwgbnVsbDtcbn1cblxuY2xhc3MgRWRpdG9yUnVsZXJzIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ucnVsZXJzLCAobnVtYmVyIHwgSVJ1bGVyT3B0aW9uKVtdLCBJUnVsZXJPcHRpb25bXT4ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGNvbnN0IGRlZmF1bHRzOiBJUnVsZXJPcHRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbHVtblNjaGVtYTogSUpTT05TY2hlbWEgPSB7IHR5cGU6ICdudW1iZXInLCBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdydWxlcnMuc2l6ZScsIFwiTnVtYmVyIG9mIG1vbm9zcGFjZSBjaGFyYWN0ZXJzIGF0IHdoaWNoIHRoaXMgZWRpdG9yIHJ1bGVyIHdpbGwgcmVuZGVyLlwiKSB9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLnJ1bGVycywgJ3J1bGVycycsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRjb2x1bW5TY2hlbWEsXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdHR5cGU6IFtcblx0XHRcdFx0XHRcdFx0XHQnb2JqZWN0J1xuXHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29sdW1uOiBjb2x1bW5TY2hlbWEsXG5cdFx0XHRcdFx0XHRcdFx0Y29sb3I6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVsZXJzLmNvbG9yJywgXCJDb2xvciBvZiB0aGlzIGVkaXRvciBydWxlci5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRmb3JtYXQ6ICdjb2xvci1oZXgnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVsZXJzJywgXCJSZW5kZXIgdmVydGljYWwgcnVsZXJzIGFmdGVyIGEgY2VydGFpbiBudW1iZXIgb2YgbW9ub3NwYWNlIGNoYXJhY3RlcnMuIFVzZSBtdWx0aXBsZSB2YWx1ZXMgZm9yIG11bHRpcGxlIHJ1bGVycy4gTm8gcnVsZXJzIGFyZSBkcmF3biBpZiBhcnJheSBpcyBlbXB0eS5cIilcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKGlucHV0OiB1bmtub3duKTogSVJ1bGVyT3B0aW9uW10ge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGlucHV0KSkge1xuXHRcdFx0Y29uc3QgcnVsZXJzOiBJUnVsZXJPcHRpb25bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBfZWxlbWVudCBvZiBpbnB1dCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIF9lbGVtZW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHJ1bGVycy5wdXNoKHtcblx0XHRcdFx0XHRcdGNvbHVtbjogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoX2VsZW1lbnQsIDAsIDAsIDEwMDAwKSxcblx0XHRcdFx0XHRcdGNvbG9yOiBudWxsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoX2VsZW1lbnQgJiYgdHlwZW9mIF9lbGVtZW50ID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBfZWxlbWVudCBhcyBJUnVsZXJPcHRpb247XG5cdFx0XHRcdFx0cnVsZXJzLnB1c2goe1xuXHRcdFx0XHRcdFx0Y29sdW1uOiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChlbGVtZW50LmNvbHVtbiwgMCwgMCwgMTAwMDApLFxuXHRcdFx0XHRcdFx0Y29sb3I6IGVsZW1lbnQuY29sb3Jcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cnVsZXJzLnNvcnQoKGEsIGIpID0+IGEuY29sdW1uIC0gYi5jb2x1bW4pO1xuXHRcdFx0cmV0dXJuIHJ1bGVycztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gcmVhZG9ubHlcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHJlYWRvbmx5IG1lc3NhZ2VcbiAqL1xuY2xhc3MgUmVhZG9ubHlNZXNzYWdlIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ucmVhZE9ubHlNZXNzYWdlLCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQsIElNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0cyA9IHVuZGVmaW5lZDtcblxuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLnJlYWRPbmx5TWVzc2FnZSwgJ3JlYWRPbmx5TWVzc2FnZScsIGRlZmF1bHRzXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiBfaW5wdXQgYXMgSU1hcmtkb3duU3RyaW5nO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc2Nyb2xsYmFyXG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBlZGl0b3Igc2Nyb2xsYmFyc1xuICovXG5leHBvcnQgaW50ZXJmYWNlIElFZGl0b3JTY3JvbGxiYXJPcHRpb25zIHtcblx0LyoqXG5cdCAqIFRoZSBzaXplIG9mIGFycm93cyAoaWYgZGlzcGxheWVkKS5cblx0ICogRGVmYXVsdHMgdG8gMTEuXG5cdCAqICoqTk9URSoqOiBUaGlzIG9wdGlvbiBjYW5ub3QgYmUgdXBkYXRlZCB1c2luZyBgdXBkYXRlT3B0aW9ucygpYFxuXHQgKi9cblx0YXJyb3dTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogUmVuZGVyIHZlcnRpY2FsIHNjcm9sbGJhci5cblx0ICogRGVmYXVsdHMgdG8gJ2F1dG8nLlxuXHQgKi9cblx0dmVydGljYWw/OiAnYXV0bycgfCAndmlzaWJsZScgfCAnaGlkZGVuJztcblx0LyoqXG5cdCAqIFJlbmRlciBob3Jpem9udGFsIHNjcm9sbGJhci5cblx0ICogRGVmYXVsdHMgdG8gJ2F1dG8nLlxuXHQgKi9cblx0aG9yaXpvbnRhbD86ICdhdXRvJyB8ICd2aXNpYmxlJyB8ICdoaWRkZW4nO1xuXHQvKipcblx0ICogQ2FzdCBob3Jpem9udGFsIGFuZCB2ZXJ0aWNhbCBzaGFkb3dzIHdoZW4gdGhlIGNvbnRlbnQgaXMgc2Nyb2xsZWQuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqICoqTk9URSoqOiBUaGlzIG9wdGlvbiBjYW5ub3QgYmUgdXBkYXRlZCB1c2luZyBgdXBkYXRlT3B0aW9ucygpYFxuXHQgKi9cblx0dXNlU2hhZG93cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBSZW5kZXIgYXJyb3dzIGF0IHRoZSB0b3AgYW5kIGJvdHRvbSBvZiB0aGUgdmVydGljYWwgc2Nyb2xsYmFyLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0ICogKipOT1RFKio6IFRoaXMgb3B0aW9uIGNhbm5vdCBiZSB1cGRhdGVkIHVzaW5nIGB1cGRhdGVPcHRpb25zKClgXG5cdCAqL1xuXHR2ZXJ0aWNhbEhhc0Fycm93cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBSZW5kZXIgYXJyb3dzIGF0IHRoZSBsZWZ0IGFuZCByaWdodCBvZiB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIuXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKiAqKk5PVEUqKjogVGhpcyBvcHRpb24gY2Fubm90IGJlIHVwZGF0ZWQgdXNpbmcgYHVwZGF0ZU9wdGlvbnMoKWBcblx0ICovXG5cdGhvcml6b250YWxIYXNBcnJvd3M/OiBib29sZWFuO1xuXHQvKipcblx0ICogTGlzdGVuIHRvIG1vdXNlIHdoZWVsIGV2ZW50cyBhbmQgcmVhY3QgdG8gdGhlbSBieSBzY3JvbGxpbmcuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRoYW5kbGVNb3VzZVdoZWVsPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEFsd2F5cyBjb25zdW1lIG1vdXNlIHdoZWVsIGV2ZW50cyAoYWx3YXlzIGNhbGwgcHJldmVudERlZmF1bHQoKSBhbmQgc3RvcFByb3BhZ2F0aW9uKCkgb24gdGhlIGJyb3dzZXIgZXZlbnRzKS5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICogKipOT1RFKio6IFRoaXMgb3B0aW9uIGNhbm5vdCBiZSB1cGRhdGVkIHVzaW5nIGB1cGRhdGVPcHRpb25zKClgXG5cdCAqL1xuXHRhbHdheXNDb25zdW1lTW91c2VXaGVlbD86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBIZWlnaHQgaW4gcGl4ZWxzIGZvciB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIuXG5cdCAqIERlZmF1bHRzIHRvIDEyIChweCkuXG5cdCAqL1xuXHRob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFdpZHRoIGluIHBpeGVscyBmb3IgdGhlIHZlcnRpY2FsIHNjcm9sbGJhci5cblx0ICogRGVmYXVsdHMgdG8gMTQgKHB4KS5cblx0ICovXG5cdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZT86IG51bWJlcjtcblx0LyoqXG5cdCAqIFdpZHRoIGluIHBpeGVscyBmb3IgdGhlIHZlcnRpY2FsIHNsaWRlci5cblx0ICogRGVmYXVsdHMgdG8gYHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZWAuXG5cdCAqICoqTk9URSoqOiBUaGlzIG9wdGlvbiBjYW5ub3QgYmUgdXBkYXRlZCB1c2luZyBgdXBkYXRlT3B0aW9ucygpYFxuXHQgKi9cblx0dmVydGljYWxTbGlkZXJTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogSGVpZ2h0IGluIHBpeGVscyBmb3IgdGhlIGhvcml6b250YWwgc2xpZGVyLlxuXHQgKiBEZWZhdWx0cyB0byBgaG9yaXpvbnRhbFNjcm9sbGJhclNpemVgLlxuXHQgKiAqKk5PVEUqKjogVGhpcyBvcHRpb24gY2Fubm90IGJlIHVwZGF0ZWQgdXNpbmcgYHVwZGF0ZU9wdGlvbnMoKWBcblx0ICovXG5cdGhvcml6b250YWxTbGlkZXJTaXplPzogbnVtYmVyO1xuXHQvKipcblx0ICogU2Nyb2xsIGd1dHRlciBjbGlja3MgbW92ZSBieSBwYWdlIHZzIGp1bXAgdG8gcG9zaXRpb24uXG5cdCAqIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKi9cblx0c2Nyb2xsQnlQYWdlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogV2hlbiBzZXQsIHRoZSBob3Jpem9udGFsIHNjcm9sbGJhciB3aWxsIG5vdCBpbmNyZWFzZSBjb250ZW50IGhlaWdodC5cblx0ICogRGVmYXVsdHMgdG8gZmFsc2UuXG5cdCAqL1xuXHRpZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJbnRlcm5hbEVkaXRvclNjcm9sbGJhck9wdGlvbnMge1xuXHRyZWFkb25seSBhcnJvd1NpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgdmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHk7XG5cdHJlYWRvbmx5IGhvcml6b250YWw6IFNjcm9sbGJhclZpc2liaWxpdHk7XG5cdHJlYWRvbmx5IHVzZVNoYWRvd3M6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZlcnRpY2FsSGFzQXJyb3dzOiBib29sZWFuO1xuXHRyZWFkb25seSBob3Jpem9udGFsSGFzQXJyb3dzOiBib29sZWFuO1xuXHRyZWFkb25seSBoYW5kbGVNb3VzZVdoZWVsOiBib29sZWFuO1xuXHRyZWFkb25seSBhbHdheXNDb25zdW1lTW91c2VXaGVlbDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbFNjcm9sbGJhclNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbFNsaWRlclNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgdmVydGljYWxTY3JvbGxiYXJTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IHZlcnRpY2FsU2xpZGVyU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBzY3JvbGxCeVBhZ2U6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQ6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIF9zY3JvbGxiYXJWaXNpYmlsaXR5RnJvbVN0cmluZyh2aXNpYmlsaXR5OiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IFNjcm9sbGJhclZpc2liaWxpdHkpOiBTY3JvbGxiYXJWaXNpYmlsaXR5IHtcblx0aWYgKHR5cGVvZiB2aXNpYmlsaXR5ICE9PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBkZWZhdWx0VmFsdWU7XG5cdH1cblx0c3dpdGNoICh2aXNpYmlsaXR5KSB7XG5cdFx0Y2FzZSAnaGlkZGVuJzogcmV0dXJuIFNjcm9sbGJhclZpc2liaWxpdHkuSGlkZGVuO1xuXHRcdGNhc2UgJ3Zpc2libGUnOiByZXR1cm4gU2Nyb2xsYmFyVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdGRlZmF1bHQ6IHJldHVybiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG87XG5cdH1cbn1cblxuY2xhc3MgRWRpdG9yU2Nyb2xsYmFyIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uc2Nyb2xsYmFyLCBJRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucywgSW50ZXJuYWxFZGl0b3JTY3JvbGxiYXJPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEludGVybmFsRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucyA9IHtcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRob3Jpem9udGFsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0XHRhcnJvd1NpemU6IDExLFxuXHRcdFx0dXNlU2hhZG93czogdHJ1ZSxcblx0XHRcdHZlcnRpY2FsSGFzQXJyb3dzOiBmYWxzZSxcblx0XHRcdGhvcml6b250YWxIYXNBcnJvd3M6IGZhbHNlLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGJhclNpemU6IDEyLFxuXHRcdFx0aG9yaXpvbnRhbFNsaWRlclNpemU6IDEyLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiAxNCxcblx0XHRcdHZlcnRpY2FsU2xpZGVyU2l6ZTogMTQsXG5cdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsXG5cdFx0XHRzY3JvbGxCeVBhZ2U6IGZhbHNlLFxuXHRcdFx0aWdub3JlSG9yaXpvbnRhbFNjcm9sbGJhckluQ29udGVudEhlaWdodDogZmFsc2UsXG5cdFx0fTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5zY3JvbGxiYXIsICdzY3JvbGxiYXInLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5zY3JvbGxiYXIudmVydGljYWwnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydhdXRvJywgJ3Zpc2libGUnLCAnaGlkZGVuJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY3JvbGxiYXIudmVydGljYWwuYXV0bycsIFwiVGhlIHZlcnRpY2FsIHNjcm9sbGJhciB3aWxsIGJlIHZpc2libGUgb25seSB3aGVuIG5lY2Vzc2FyeS5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Njcm9sbGJhci52ZXJ0aWNhbC52aXNpYmxlJywgXCJUaGUgdmVydGljYWwgc2Nyb2xsYmFyIHdpbGwgYWx3YXlzIGJlIHZpc2libGUuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY3JvbGxiYXIudmVydGljYWwuZml0JywgXCJUaGUgdmVydGljYWwgc2Nyb2xsYmFyIHdpbGwgYWx3YXlzIGJlIGhpZGRlbi5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnYXV0bycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLnZlcnRpY2FsJywgXCJDb250cm9scyB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgdmVydGljYWwgc2Nyb2xsYmFyLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnNjcm9sbGJhci5ob3Jpem9udGFsJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnYXV0bycsICd2aXNpYmxlJywgJ2hpZGRlbiddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLmhvcml6b250YWwuYXV0bycsIFwiVGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIHdpbGwgYmUgdmlzaWJsZSBvbmx5IHdoZW4gbmVjZXNzYXJ5LlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLmhvcml6b250YWwudmlzaWJsZScsIFwiVGhlIGhvcml6b250YWwgc2Nyb2xsYmFyIHdpbGwgYWx3YXlzIGJlIHZpc2libGUuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzY3JvbGxiYXIuaG9yaXpvbnRhbC5maXQnLCBcIlRoZSBob3Jpem9udGFsIHNjcm9sbGJhciB3aWxsIGFsd2F5cyBiZSBoaWRkZW4uXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ2F1dG8nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbGJhci5ob3Jpem9udGFsJywgXCJDb250cm9scyB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc2Nyb2xsYmFyLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy52ZXJ0aWNhbFNjcm9sbGJhclNpemUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZScsIFwiVGhlIHdpZHRoIG9mIHRoZSB2ZXJ0aWNhbCBzY3JvbGxiYXIuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc2Nyb2xsYmFyLmhvcml6b250YWxTY3JvbGxiYXJTaXplJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmhvcml6b250YWxTY3JvbGxiYXJTaXplLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbGJhci5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZScsIFwiVGhlIGhlaWdodCBvZiB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc2Nyb2xsYmFyLnNjcm9sbEJ5UGFnZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc2Nyb2xsQnlQYWdlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbGJhci5zY3JvbGxCeVBhZ2UnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2xpY2tzIHNjcm9sbCBieSBwYWdlIG9yIGp1bXAgdG8gY2xpY2sgcG9zaXRpb24uXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc2Nyb2xsYmFyLmlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2Nyb2xsYmFyLmlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQnLCBcIldoZW4gc2V0LCB0aGUgaG9yaXpvbnRhbCBzY3JvbGxiYXIgd2lsbCBub3QgaW5jcmVhc2UgdGhlIHNpemUgb2YgdGhlIGVkaXRvcidzIGNvbnRlbnQuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucyB7XG5cdFx0aWYgKCFfaW5wdXQgfHwgdHlwZW9mIF9pbnB1dCAhPT0gJ29iamVjdCcpIHtcblx0XHRcdHJldHVybiB0aGlzLmRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJRWRpdG9yU2Nyb2xsYmFyT3B0aW9ucz47XG5cdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbGJhclNpemUgPSBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSwgdGhpcy5kZWZhdWx0VmFsdWUuaG9yaXpvbnRhbFNjcm9sbGJhclNpemUsIDAsIDEwMDApO1xuXHRcdGNvbnN0IHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSA9IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSwgdGhpcy5kZWZhdWx0VmFsdWUudmVydGljYWxTY3JvbGxiYXJTaXplLCAwLCAxMDAwKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YXJyb3dTaXplOiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5hcnJvd1NpemUsIHRoaXMuZGVmYXVsdFZhbHVlLmFycm93U2l6ZSwgMCwgMTAwMCksXG5cdFx0XHR2ZXJ0aWNhbDogX3Njcm9sbGJhclZpc2liaWxpdHlGcm9tU3RyaW5nKGlucHV0LnZlcnRpY2FsLCB0aGlzLmRlZmF1bHRWYWx1ZS52ZXJ0aWNhbCksXG5cdFx0XHRob3Jpem9udGFsOiBfc2Nyb2xsYmFyVmlzaWJpbGl0eUZyb21TdHJpbmcoaW5wdXQuaG9yaXpvbnRhbCwgdGhpcy5kZWZhdWx0VmFsdWUuaG9yaXpvbnRhbCksXG5cdFx0XHR1c2VTaGFkb3dzOiBib29sZWFuKGlucHV0LnVzZVNoYWRvd3MsIHRoaXMuZGVmYXVsdFZhbHVlLnVzZVNoYWRvd3MpLFxuXHRcdFx0dmVydGljYWxIYXNBcnJvd3M6IGJvb2xlYW4oaW5wdXQudmVydGljYWxIYXNBcnJvd3MsIHRoaXMuZGVmYXVsdFZhbHVlLnZlcnRpY2FsSGFzQXJyb3dzKSxcblx0XHRcdGhvcml6b250YWxIYXNBcnJvd3M6IGJvb2xlYW4oaW5wdXQuaG9yaXpvbnRhbEhhc0Fycm93cywgdGhpcy5kZWZhdWx0VmFsdWUuaG9yaXpvbnRhbEhhc0Fycm93cyksXG5cdFx0XHRoYW5kbGVNb3VzZVdoZWVsOiBib29sZWFuKGlucHV0LmhhbmRsZU1vdXNlV2hlZWwsIHRoaXMuZGVmYXVsdFZhbHVlLmhhbmRsZU1vdXNlV2hlZWwpLFxuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IGJvb2xlYW4oaW5wdXQuYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWwsIHRoaXMuZGVmYXVsdFZhbHVlLmFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsKSxcblx0XHRcdGhvcml6b250YWxTY3JvbGxiYXJTaXplOiBob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSxcblx0XHRcdGhvcml6b250YWxTbGlkZXJTaXplOiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5ob3Jpem9udGFsU2xpZGVyU2l6ZSwgaG9yaXpvbnRhbFNjcm9sbGJhclNpemUsIDAsIDEwMDApLFxuXHRcdFx0dmVydGljYWxTY3JvbGxiYXJTaXplOiB2ZXJ0aWNhbFNjcm9sbGJhclNpemUsXG5cdFx0XHR2ZXJ0aWNhbFNsaWRlclNpemU6IEVkaXRvckludE9wdGlvbi5jbGFtcGVkSW50KGlucHV0LnZlcnRpY2FsU2xpZGVyU2l6ZSwgdmVydGljYWxTY3JvbGxiYXJTaXplLCAwLCAxMDAwKSxcblx0XHRcdHNjcm9sbEJ5UGFnZTogYm9vbGVhbihpbnB1dC5zY3JvbGxCeVBhZ2UsIHRoaXMuZGVmYXVsdFZhbHVlLnNjcm9sbEJ5UGFnZSksXG5cdFx0XHRpZ25vcmVIb3Jpem9udGFsU2Nyb2xsYmFySW5Db250ZW50SGVpZ2h0OiBib29sZWFuKGlucHV0Lmlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQsIHRoaXMuZGVmYXVsdFZhbHVlLmlnbm9yZUhvcml6b250YWxTY3JvbGxiYXJJbkNvbnRlbnRIZWlnaHQpLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBVbmljb2RlSGlnaGxpZ2h0XG5cbmV4cG9ydCB0eXBlIEluVW50cnVzdGVkV29ya3NwYWNlID0gJ2luVW50cnVzdGVkV29ya3NwYWNlJztcblxuLyoqXG4gKiBAaW50ZXJuYWxcbiovXG5leHBvcnQgY29uc3QgaW5VbnRydXN0ZWRXb3Jrc3BhY2U6IEluVW50cnVzdGVkV29ya3NwYWNlID0gJ2luVW50cnVzdGVkV29ya3NwYWNlJztcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHVuaWNvZGUgaGlnaGxpZ2h0aW5nLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgYWxsIG5vbi1iYXNpYyBBU0NJSSBjaGFyYWN0ZXJzIGFyZSBoaWdobGlnaHRlZC4gT25seSBjaGFyYWN0ZXJzIGJldHdlZW4gVSswMDIwIGFuZCBVKzAwN0UsIHRhYiwgbGluZS1mZWVkIGFuZCBjYXJyaWFnZS1yZXR1cm4gYXJlIGNvbnNpZGVyZWQgYmFzaWMgQVNDSUkuXG5cdCAqL1xuXHRub25CYXNpY0FTQ0lJPzogYm9vbGVhbiB8IEluVW50cnVzdGVkV29ya3NwYWNlO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGNoYXJhY3RlcnMgdGhhdCBqdXN0IHJlc2VydmUgc3BhY2Ugb3IgaGF2ZSBubyB3aWR0aCBhdCBhbGwgYXJlIGhpZ2hsaWdodGVkLlxuXHQgKi9cblx0aW52aXNpYmxlQ2hhcmFjdGVycz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgY2hhcmFjdGVycyBhcmUgaGlnaGxpZ2h0ZWQgdGhhdCBjYW4gYmUgY29uZnVzZWQgd2l0aCBiYXNpYyBBU0NJSSBjaGFyYWN0ZXJzLCBleGNlcHQgdGhvc2UgdGhhdCBhcmUgY29tbW9uIGluIHRoZSBjdXJyZW50IHVzZXIgbG9jYWxlLlxuXHQgKi9cblx0YW1iaWd1b3VzQ2hhcmFjdGVycz86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgY2hhcmFjdGVycyBpbiBjb21tZW50cyBzaG91bGQgYWxzbyBiZSBzdWJqZWN0IHRvIHVuaWNvZGUgaGlnaGxpZ2h0aW5nLlxuXHQgKi9cblx0aW5jbHVkZUNvbW1lbnRzPzogYm9vbGVhbiB8IEluVW50cnVzdGVkV29ya3NwYWNlO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyB3aGV0aGVyIGNoYXJhY3RlcnMgaW4gc3RyaW5ncyBzaG91bGQgYWxzbyBiZSBzdWJqZWN0IHRvIHVuaWNvZGUgaGlnaGxpZ2h0aW5nLlxuXHQgKi9cblx0aW5jbHVkZVN0cmluZ3M/OiBib29sZWFuIHwgSW5VbnRydXN0ZWRXb3Jrc3BhY2U7XG5cblx0LyoqXG5cdCAqIERlZmluZXMgYWxsb3dlZCBjaGFyYWN0ZXJzIHRoYXQgYXJlIG5vdCBiZWluZyBoaWdobGlnaHRlZC5cblx0ICovXG5cdGFsbG93ZWRDaGFyYWN0ZXJzPzogUmVjb3JkPHN0cmluZywgdHJ1ZT47XG5cblx0LyoqXG5cdCAqIFVuaWNvZGUgY2hhcmFjdGVycyB0aGF0IGFyZSBjb21tb24gaW4gYWxsb3dlZCBsb2NhbGVzIGFyZSBub3QgYmVpbmcgaGlnaGxpZ2h0ZWQuXG5cdCAqL1xuXHRhbGxvd2VkTG9jYWxlcz86IFJlY29yZDxzdHJpbmcgfCAnX29zJyB8ICdfdnNjb2RlJywgdHJ1ZT47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIEludGVybmFsVW5pY29kZUhpZ2hsaWdodE9wdGlvbnMgPSBSZXF1aXJlZDxSZWFkb25seTxJVW5pY29kZUhpZ2hsaWdodE9wdGlvbnM+PjtcblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNvbnN0IHVuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzID0ge1xuXHRhbGxvd2VkQ2hhcmFjdGVyczogJ2VkaXRvci51bmljb2RlSGlnaGxpZ2h0LmFsbG93ZWRDaGFyYWN0ZXJzJyxcblx0aW52aXNpYmxlQ2hhcmFjdGVyczogJ2VkaXRvci51bmljb2RlSGlnaGxpZ2h0LmludmlzaWJsZUNoYXJhY3RlcnMnLFxuXHRub25CYXNpY0FTQ0lJOiAnZWRpdG9yLnVuaWNvZGVIaWdobGlnaHQubm9uQmFzaWNBU0NJSScsXG5cdGFtYmlndW91c0NoYXJhY3RlcnM6ICdlZGl0b3IudW5pY29kZUhpZ2hsaWdodC5hbWJpZ3VvdXNDaGFyYWN0ZXJzJyxcblx0aW5jbHVkZUNvbW1lbnRzOiAnZWRpdG9yLnVuaWNvZGVIaWdobGlnaHQuaW5jbHVkZUNvbW1lbnRzJyxcblx0aW5jbHVkZVN0cmluZ3M6ICdlZGl0b3IudW5pY29kZUhpZ2hsaWdodC5pbmNsdWRlU3RyaW5ncycsXG5cdGFsbG93ZWRMb2NhbGVzOiAnZWRpdG9yLnVuaWNvZGVIaWdobGlnaHQuYWxsb3dlZExvY2FsZXMnLFxufTtcblxuY2xhc3MgVW5pY29kZUhpZ2hsaWdodCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnVuaWNvZGVIaWdobGlnaHRpbmcsIElVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucywgSW50ZXJuYWxVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogSW50ZXJuYWxVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucyA9IHtcblx0XHRcdG5vbkJhc2ljQVNDSUk6IGluVW50cnVzdGVkV29ya3NwYWNlLFxuXHRcdFx0aW52aXNpYmxlQ2hhcmFjdGVyczogdHJ1ZSxcblx0XHRcdGFtYmlndW91c0NoYXJhY3RlcnM6IHRydWUsXG5cdFx0XHRpbmNsdWRlQ29tbWVudHM6IGluVW50cnVzdGVkV29ya3NwYWNlLFxuXHRcdFx0aW5jbHVkZVN0cmluZ3M6IHRydWUsXG5cdFx0XHRhbGxvd2VkQ2hhcmFjdGVyczoge30sXG5cdFx0XHRhbGxvd2VkTG9jYWxlczogeyBfb3M6IHRydWUsIF92c2NvZGU6IHRydWUgfSxcblx0XHR9O1xuXG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24udW5pY29kZUhpZ2hsaWdodGluZywgJ3VuaWNvZGVIaWdobGlnaHQnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0W3VuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLm5vbkJhc2ljQVNDSUldOiB7XG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0ZW51bTogW3RydWUsIGZhbHNlLCBpblVudHJ1c3RlZFdvcmtzcGFjZV0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMubm9uQmFzaWNBU0NJSSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd1bmljb2RlSGlnaGxpZ2h0Lm5vbkJhc2ljQVNDSUknLCBcIkNvbnRyb2xzIHdoZXRoZXIgYWxsIG5vbi1iYXNpYyBBU0NJSSBjaGFyYWN0ZXJzIGFyZSBoaWdobGlnaHRlZC4gT25seSBjaGFyYWN0ZXJzIGJldHdlZW4gVSswMDIwIGFuZCBVKzAwN0UsIHRhYiwgbGluZS1mZWVkIGFuZCBjYXJyaWFnZS1yZXR1cm4gYXJlIGNvbnNpZGVyZWQgYmFzaWMgQVNDSUkuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFt1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5pbnZpc2libGVDaGFyYWN0ZXJzXToge1xuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmludmlzaWJsZUNoYXJhY3RlcnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5pbnZpc2libGVDaGFyYWN0ZXJzJywgXCJDb250cm9scyB3aGV0aGVyIGNoYXJhY3RlcnMgdGhhdCBqdXN0IHJlc2VydmUgc3BhY2Ugb3IgaGF2ZSBubyB3aWR0aCBhdCBhbGwgYXJlIGhpZ2hsaWdodGVkLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRbdW5pY29kZUhpZ2hsaWdodENvbmZpZ0tleXMuYW1iaWd1b3VzQ2hhcmFjdGVyc106IHtcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5hbWJpZ3VvdXNDaGFyYWN0ZXJzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuYW1iaWd1b3VzQ2hhcmFjdGVycycsIFwiQ29udHJvbHMgd2hldGhlciBjaGFyYWN0ZXJzIGFyZSBoaWdobGlnaHRlZCB0aGF0IGNhbiBiZSBjb25mdXNlZCB3aXRoIGJhc2ljIEFTQ0lJIGNoYXJhY3RlcnMsIGV4Y2VwdCB0aG9zZSB0aGF0IGFyZSBjb21tb24gaW4gdGhlIGN1cnJlbnQgdXNlciBsb2NhbGUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFt1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5pbmNsdWRlQ29tbWVudHNdOiB7XG5cdFx0XHRcdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0ZW51bTogW3RydWUsIGZhbHNlLCBpblVudHJ1c3RlZFdvcmtzcGFjZV0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuaW5jbHVkZUNvbW1lbnRzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuaW5jbHVkZUNvbW1lbnRzJywgXCJDb250cm9scyB3aGV0aGVyIGNoYXJhY3RlcnMgaW4gY29tbWVudHMgc2hvdWxkIGFsc28gYmUgc3ViamVjdCB0byBVbmljb2RlIGhpZ2hsaWdodGluZy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0W3VuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmluY2x1ZGVTdHJpbmdzXToge1xuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGVudW06IFt0cnVlLCBmYWxzZSwgaW5VbnRydXN0ZWRXb3Jrc3BhY2VdLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmluY2x1ZGVTdHJpbmdzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuaW5jbHVkZVN0cmluZ3MnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2hhcmFjdGVycyBpbiBzdHJpbmdzIHNob3VsZCBhbHNvIGJlIHN1YmplY3QgdG8gVW5pY29kZSBoaWdobGlnaHRpbmcuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFt1bmljb2RlSGlnaGxpZ2h0Q29uZmlnS2V5cy5hbGxvd2VkQ2hhcmFjdGVyc106IHtcblx0XHRcdFx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmFsbG93ZWRDaGFyYWN0ZXJzLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VuaWNvZGVIaWdobGlnaHQuYWxsb3dlZENoYXJhY3RlcnMnLCBcIkRlZmluZXMgYWxsb3dlZCBjaGFyYWN0ZXJzIHRoYXQgYXJlIG5vdCBiZWluZyBoaWdobGlnaHRlZC5cIiksXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0W3VuaWNvZGVIaWdobGlnaHRDb25maWdLZXlzLmFsbG93ZWRMb2NhbGVzXToge1xuXHRcdFx0XHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuYWxsb3dlZExvY2FsZXMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndW5pY29kZUhpZ2hsaWdodC5hbGxvd2VkTG9jYWxlcycsIFwiVW5pY29kZSBjaGFyYWN0ZXJzIHRoYXQgYXJlIGNvbW1vbiBpbiBhbGxvd2VkIGxvY2FsZXMgYXJlIG5vdCBiZWluZyBoaWdobGlnaHRlZC5cIilcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGFwcGx5VXBkYXRlKHZhbHVlOiBSZXF1aXJlZDxSZWFkb25seTxJVW5pY29kZUhpZ2hsaWdodE9wdGlvbnM+PiB8IHVuZGVmaW5lZCwgdXBkYXRlOiBSZXF1aXJlZDxSZWFkb25seTxJVW5pY29kZUhpZ2hsaWdodE9wdGlvbnM+Pik6IEFwcGx5VXBkYXRlUmVzdWx0PFJlcXVpcmVkPFJlYWRvbmx5PElVbmljb2RlSGlnaGxpZ2h0T3B0aW9ucz4+PiB7XG5cdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdGlmICh1cGRhdGUuYWxsb3dlZENoYXJhY3RlcnMgJiYgdmFsdWUpIHtcblx0XHRcdC8vIFRyZWF0IGFsbG93ZWRDaGFyYWN0ZXJzIGF0b21pY2FsbHlcblx0XHRcdGlmICghb2JqZWN0cy5lcXVhbHModmFsdWUuYWxsb3dlZENoYXJhY3RlcnMsIHVwZGF0ZS5hbGxvd2VkQ2hhcmFjdGVycykpIHtcblx0XHRcdFx0dmFsdWUgPSB7IC4uLnZhbHVlLCBhbGxvd2VkQ2hhcmFjdGVyczogdXBkYXRlLmFsbG93ZWRDaGFyYWN0ZXJzIH07XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh1cGRhdGUuYWxsb3dlZExvY2FsZXMgJiYgdmFsdWUpIHtcblx0XHRcdC8vIFRyZWF0IGFsbG93ZWRMb2NhbGVzIGF0b21pY2FsbHlcblx0XHRcdGlmICghb2JqZWN0cy5lcXVhbHModmFsdWUuYWxsb3dlZExvY2FsZXMsIHVwZGF0ZS5hbGxvd2VkTG9jYWxlcykpIHtcblx0XHRcdFx0dmFsdWUgPSB7IC4uLnZhbHVlLCBhbGxvd2VkTG9jYWxlczogdXBkYXRlLmFsbG93ZWRMb2NhbGVzIH07XG5cdFx0XHRcdGRpZENoYW5nZSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc3VwZXIuYXBwbHlVcGRhdGUodmFsdWUsIHVwZGF0ZSk7XG5cdFx0aWYgKGRpZENoYW5nZSkge1xuXHRcdFx0cmV0dXJuIG5ldyBBcHBseVVwZGF0ZVJlc3VsdChyZXN1bHQubmV3VmFsdWUsIHRydWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsVW5pY29kZUhpZ2hsaWdodE9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SVVuaWNvZGVIaWdobGlnaHRPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bm9uQmFzaWNBU0NJSTogcHJpbWl0aXZlU2V0PGJvb2xlYW4gfCBJblVudHJ1c3RlZFdvcmtzcGFjZT4oaW5wdXQubm9uQmFzaWNBU0NJSSwgaW5VbnRydXN0ZWRXb3Jrc3BhY2UsIFt0cnVlLCBmYWxzZSwgaW5VbnRydXN0ZWRXb3Jrc3BhY2VdKSxcblx0XHRcdGludmlzaWJsZUNoYXJhY3RlcnM6IGJvb2xlYW4oaW5wdXQuaW52aXNpYmxlQ2hhcmFjdGVycywgdGhpcy5kZWZhdWx0VmFsdWUuaW52aXNpYmxlQ2hhcmFjdGVycyksXG5cdFx0XHRhbWJpZ3VvdXNDaGFyYWN0ZXJzOiBib29sZWFuKGlucHV0LmFtYmlndW91c0NoYXJhY3RlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLmFtYmlndW91c0NoYXJhY3RlcnMpLFxuXHRcdFx0aW5jbHVkZUNvbW1lbnRzOiBwcmltaXRpdmVTZXQ8Ym9vbGVhbiB8IEluVW50cnVzdGVkV29ya3NwYWNlPihpbnB1dC5pbmNsdWRlQ29tbWVudHMsIGluVW50cnVzdGVkV29ya3NwYWNlLCBbdHJ1ZSwgZmFsc2UsIGluVW50cnVzdGVkV29ya3NwYWNlXSksXG5cdFx0XHRpbmNsdWRlU3RyaW5nczogcHJpbWl0aXZlU2V0PGJvb2xlYW4gfCBJblVudHJ1c3RlZFdvcmtzcGFjZT4oaW5wdXQuaW5jbHVkZVN0cmluZ3MsIGluVW50cnVzdGVkV29ya3NwYWNlLCBbdHJ1ZSwgZmFsc2UsIGluVW50cnVzdGVkV29ya3NwYWNlXSksXG5cdFx0XHRhbGxvd2VkQ2hhcmFjdGVyczogdGhpcy52YWxpZGF0ZUJvb2xlYW5NYXAoaW5wdXQuYWxsb3dlZENoYXJhY3RlcnMsIHRoaXMuZGVmYXVsdFZhbHVlLmFsbG93ZWRDaGFyYWN0ZXJzKSxcblx0XHRcdGFsbG93ZWRMb2NhbGVzOiB0aGlzLnZhbGlkYXRlQm9vbGVhbk1hcChpbnB1dC5hbGxvd2VkTG9jYWxlcywgdGhpcy5kZWZhdWx0VmFsdWUuYWxsb3dlZExvY2FsZXMpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQm9vbGVhbk1hcChtYXA6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogUmVjb3JkPHN0cmluZywgdHJ1ZT4pOiBSZWNvcmQ8c3RyaW5nLCB0cnVlPiB7XG5cdFx0aWYgKCh0eXBlb2YgbWFwICE9PSAnb2JqZWN0JykgfHwgIW1hcCkge1xuXHRcdFx0cmV0dXJuIGRlZmF1bHRWYWx1ZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBSZWNvcmQ8c3RyaW5nLCB0cnVlPiA9IHt9O1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG1hcCkpIHtcblx0XHRcdGlmICh2YWx1ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXN1bHRba2V5XSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBpbmxpbmVTdWdnZXN0XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUlubGluZVN1Z2dlc3RPcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSBvciBkaXNhYmxlIHRoZSByZW5kZXJpbmcgb2YgYXV0b21hdGljIGlubGluZSBjb21wbGV0aW9ucy5cblx0Ki9cblx0ZW5hYmxlZD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbmZpZ3VyZXMgdGhlIG1vZGUuXG5cdCAqIFVzZSBgcHJlZml4YCB0byBvbmx5IHNob3cgZ2hvc3QgdGV4dCBpZiB0aGUgdGV4dCB0byByZXBsYWNlIGlzIGEgcHJlZml4IG9mIHRoZSBzdWdnZXN0aW9uIHRleHQuXG5cdCAqIFVzZSBgc3Vid29yZGAgdG8gb25seSBzaG93IGdob3N0IHRleHQgaWYgdGhlIHJlcGxhY2UgdGV4dCBpcyBhIHN1YndvcmQgb2YgdGhlIHN1Z2dlc3Rpb24gdGV4dC5cblx0ICogVXNlIGBzdWJ3b3JkU21hcnRgIHRvIG9ubHkgc2hvdyBnaG9zdCB0ZXh0IGlmIHRoZSByZXBsYWNlIHRleHQgaXMgYSBzdWJ3b3JkIG9mIHRoZSBzdWdnZXN0aW9uIHRleHQsIGJ1dCB0aGUgc3Vid29yZCBtdXN0IHN0YXJ0IGFmdGVyIHRoZSBjdXJzb3IgcG9zaXRpb24uXG5cdCAqIERlZmF1bHRzIHRvIGBwcmVmaXhgLlxuXHQqL1xuXHRtb2RlPzogJ3ByZWZpeCcgfCAnc3Vid29yZCcgfCAnc3Vid29yZFNtYXJ0JztcblxuXHRzaG93VG9vbGJhcj86ICdhbHdheXMnIHwgJ29uSG92ZXInIHwgJ25ldmVyJztcblxuXHRzeW50YXhIaWdobGlnaHRpbmdFbmFibGVkPzogYm9vbGVhbjtcblxuXHRzdXBwcmVzc1N1Z2dlc3Rpb25zPzogYm9vbGVhbjtcblxuXHRtaW5TaG93RGVsYXk/OiBudW1iZXI7XG5cdHN1cHByZXNzSW5TbmlwcGV0TW9kZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBEb2VzIG5vdCBjbGVhciBhY3RpdmUgaW5saW5lIHN1Z2dlc3Rpb25zIHdoZW4gdGhlIGVkaXRvciBsb3NlcyBmb2N1cy5cblx0ICovXG5cdGtlZXBPbkJsdXI/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBGb250IGZhbWlseSBmb3IgaW5saW5lIHN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0Zm9udEZhbWlseT86IHN0cmluZyB8ICdkZWZhdWx0JztcblxuXHRlZGl0cz86IHtcblx0XHRhbGxvd0NvZGVTaGlmdGluZz86ICdhbHdheXMnIHwgJ2hvcml6b250YWwnIHwgJ25ldmVyJztcblxuXHRcdHJlbmRlclNpZGVCeVNpZGU/OiAnbmV2ZXInIHwgJ2F1dG8nO1xuXG5cdFx0c2hvd0NvbGxhcHNlZD86IGJvb2xlYW47XG5cblx0XHRzaG93TG9uZ0Rpc3RhbmNlSGludD86IGJvb2xlYW47XG5cblx0XHQvKipcblx0XHQgKiBDb250cm9scyBob3cgbWFueSBsaW5lcyBvZiBzdXJyb3VuZGluZyBjb250ZXh0IGFyZSBzaG93biBhYm92ZSBhbmQgYmVsb3cgdGhlIHRhcmdldCBsaW5lXG5cdFx0ICogaW4gdGhlIGxvbmcgZGlzdGFuY2UgaW5saW5lIHN1Z2dlc3Rpb24gaGludCBwcmV2aWV3LiBgMGAgc2hvd3Mgb25seSB0aGUgdGFyZ2V0IGxpbmUuXG5cdFx0ICovXG5cdFx0bG9uZ0Rpc3RhbmNlSGludENvbnRleHRMaW5lQ291bnQ/OiBudW1iZXI7XG5cblx0XHQvKipcblx0XHQqIEBpbnRlcm5hbFxuXHRcdCovXG5cdFx0ZW5hYmxlZD86IGJvb2xlYW47XG5cdH07XG5cblx0LyoqXG5cdCogQGludGVybmFsXG5cdCovXG5cdHRyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCogQGludGVybmFsXG5cdCovXG5cdGV4cGVyaW1lbnRhbD86IHtcblx0XHQvKipcblx0XHQqIEBpbnRlcm5hbFxuXHRcdCovXG5cdFx0c3VwcHJlc3NJbmxpbmVTdWdnZXN0aW9ucz86IHN0cmluZztcblxuXHRcdC8qKlxuXHRcdCogQGludGVybmFsXG5cdFx0Ki9cblx0XHRlbXB0eVJlc3BvbnNlSW5mb3JtYXRpb24/OiBib29sZWFuO1xuXG5cdFx0c2hvd09uU3VnZ2VzdENvbmZsaWN0PzogJ2Fsd2F5cycgfCAnbmV2ZXInIHwgJ3doZW5TdWdnZXN0TGlzdElzSW5jb21wbGV0ZSc7XG5cdH07XG59XG5cbnR5cGUgUmVxdWlyZWRSZWN1cnNpdmU8VD4gPSB7XG5cdFtQIGluIGtleW9mIFRdLT86IFRbUF0gZXh0ZW5kcyBvYmplY3QgfCB1bmRlZmluZWQgPyBSZXF1aXJlZFJlY3Vyc2l2ZTxUW1BdPiA6IFRbUF07XG59O1xuXG4vKipcbiAqIEBpbnRlcm5hbFxuICovXG5leHBvcnQgdHlwZSBJbnRlcm5hbElubGluZVN1Z2dlc3RPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWRSZWN1cnNpdmU8SUlubGluZVN1Z2dlc3RPcHRpb25zPj47XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBpbmxpbmUgc3VnZ2VzdGlvbnNcbiAqL1xuY2xhc3MgSW5saW5lRWRpdG9yU3VnZ2VzdCBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QsIElJbmxpbmVTdWdnZXN0T3B0aW9ucywgSW50ZXJuYWxJbmxpbmVTdWdnZXN0T3B0aW9ucz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogSW50ZXJuYWxJbmxpbmVTdWdnZXN0T3B0aW9ucyA9IHtcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRtb2RlOiAnc3Vid29yZFNtYXJ0Jyxcblx0XHRcdHNob3dUb29sYmFyOiAnb25Ib3ZlcicsXG5cdFx0XHRzdXBwcmVzc1N1Z2dlc3Rpb25zOiBmYWxzZSxcblx0XHRcdGtlZXBPbkJsdXI6IGZhbHNlLFxuXHRcdFx0Zm9udEZhbWlseTogJ2RlZmF1bHQnLFxuXHRcdFx0c3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZDogdHJ1ZSxcblx0XHRcdG1pblNob3dEZWxheTogMCxcblx0XHRcdHN1cHByZXNzSW5TbmlwcGV0TW9kZTogdHJ1ZSxcblx0XHRcdGVkaXRzOiB7XG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHNob3dDb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRyZW5kZXJTaWRlQnlTaWRlOiAnYXV0bycsXG5cdFx0XHRcdGFsbG93Q29kZVNoaWZ0aW5nOiAnYWx3YXlzJyxcblx0XHRcdFx0c2hvd0xvbmdEaXN0YW5jZUhpbnQ6IHRydWUsXG5cdFx0XHRcdGxvbmdEaXN0YW5jZUhpbnRDb250ZXh0TGluZUNvdW50OiAwLFxuXHRcdFx0fSxcblx0XHRcdHRyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZTogZmFsc2UsXG5cdFx0XHRleHBlcmltZW50YWw6IHtcblx0XHRcdFx0c3VwcHJlc3NJbmxpbmVTdWdnZXN0aW9uczogJycsXG5cdFx0XHRcdHNob3dPblN1Z2dlc3RDb25mbGljdDogJ25ldmVyJyxcblx0XHRcdFx0ZW1wdHlSZXNwb25zZUluZm9ybWF0aW9uOiB0cnVlLFxuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uaW5saW5lU3VnZ2VzdCwgJ2lubGluZVN1Z2dlc3QnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmVuYWJsZWQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVuYWJsZWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5lbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGF1dG9tYXRpY2FsbHkgc2hvdyBpbmxpbmUgc3VnZ2VzdGlvbnMgaW4gdGhlIGVkaXRvci5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LnNob3dUb29sYmFyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNob3dUb29sYmFyLFxuXHRcdFx0XHRcdGVudW06IFsnYWx3YXlzJywgJ29uSG92ZXInLCAnbmV2ZXInXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3Quc2hvd1Rvb2xiYXIuYWx3YXlzJywgXCJTaG93IHRoZSBpbmxpbmUgc3VnZ2VzdGlvbiB0b29sYmFyIHdoZW5ldmVyIGFuIGlubGluZSBzdWdnZXN0aW9uIGlzIHNob3duLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5zaG93VG9vbGJhci5vbkhvdmVyJywgXCJTaG93IHRoZSBpbmxpbmUgc3VnZ2VzdGlvbiB0b29sYmFyIHdoZW4gaG92ZXJpbmcgb3ZlciBhbiBpbmxpbmUgc3VnZ2VzdGlvbi5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3Quc2hvd1Rvb2xiYXIubmV2ZXInLCBcIk5ldmVyIHNob3cgdGhlIGlubGluZSBzdWdnZXN0aW9uIHRvb2xiYXIuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5zaG93VG9vbGJhcicsIFwiQ29udHJvbHMgd2hlbiB0byBzaG93IHRoZSBpbmxpbmUgc3VnZ2VzdGlvbiB0b29sYmFyLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LnN5bnRheEhpZ2hsaWdodGluZ0VuYWJsZWQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnN5bnRheEhpZ2hsaWdodGluZ0VuYWJsZWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5zeW50YXhIaWdobGlnaHRpbmdFbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgc3ludGF4IGhpZ2hsaWdodGluZyBmb3IgaW5saW5lIHN1Z2dlc3Rpb25zIGluIHRoZSBlZGl0b3IuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3Quc3VwcHJlc3NTdWdnZXN0aW9ucyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc3VwcHJlc3NTdWdnZXN0aW9ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LnN1cHByZXNzU3VnZ2VzdGlvbnMnLCBcIkNvbnRyb2xzIGhvdyBpbmxpbmUgc3VnZ2VzdGlvbnMgaW50ZXJhY3Qgd2l0aCB0aGUgc3VnZ2VzdCB3aWRnZXQuIElmIGVuYWJsZWQsIHRoZSBzdWdnZXN0IHdpZGdldCBpcyBub3Qgc2hvd24gYXV0b21hdGljYWxseSB3aGVuIGlubGluZSBzdWdnZXN0aW9ucyBhcmUgYXZhaWxhYmxlLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3Quc3VwcHJlc3NJblNuaXBwZXRNb2RlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zdXBwcmVzc0luU25pcHBldE1vZGUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5zdXBwcmVzc0luU25pcHBldE1vZGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgaW5saW5lIHN1Z2dlc3Rpb25zIGFyZSBzdXBwcmVzc2VkIHdoZW4gaW4gc25pcHBldCBtb2RlLlwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0Lm1pblNob3dEZWxheSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAwLFxuXHRcdFx0XHRcdG1pbmltdW06IDAsXG5cdFx0XHRcdFx0bWF4aW11bTogMTAwMDAsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5taW5TaG93RGVsYXknLCBcIkNvbnRyb2xzIHRoZSBtaW5pbWFsIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCBpbmxpbmUgc3VnZ2VzdGlvbnMgYXJlIHNob3duIGFmdGVyIHR5cGluZy5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5leHBlcmltZW50YWwuc3VwcHJlc3NJbmxpbmVTdWdnZXN0aW9ucyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5leHBlcmltZW50YWwuc3VwcHJlc3NJbmxpbmVTdWdnZXN0aW9ucyxcblx0XHRcdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3Quc3VwcHJlc3NJbmxpbmVTdWdnZXN0aW9ucycsIFwiU3VwcHJlc3NlcyBpbmxpbmUgY29tcGxldGlvbnMgZm9yIHNwZWNpZmllZCBleHRlbnNpb24gSURzIC0tIGNvbW1hIHNlcGFyYXRlZC5cIiksXG5cdFx0XHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QuZXhwZXJpbWVudGFsLmVtcHR5UmVzcG9uc2VJbmZvcm1hdGlvbic6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZXhwZXJpbWVudGFsLmVtcHR5UmVzcG9uc2VJbmZvcm1hdGlvbixcblx0XHRcdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QuZW1wdHlSZXNwb25zZUluZm9ybWF0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNlbmQgcmVxdWVzdCBpbmZvcm1hdGlvbiBmcm9tIHRoZSBpbmxpbmUgc3VnZ2VzdGlvbiBwcm92aWRlci5cIiksXG5cdFx0XHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QudHJpZ2dlckNvbW1hbmRPblByb3ZpZGVyQ2hhbmdlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy50cmlnZ2VyQ29tbWFuZE9uUHJvdmlkZXJDaGFuZ2UsXG5cdFx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LnRyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZScsIFwiQ29udHJvbHMgd2hldGhlciB0byB0cmlnZ2VyIGEgY29tbWFuZCB3aGVuIHRoZSBpbmxpbmUgc3VnZ2VzdGlvbiBwcm92aWRlciBjaGFuZ2VzLlwiKSxcblx0XHRcdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdFx0XHRtb2RlOiAnYXV0bydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5leHBlcmltZW50YWwuc2hvd09uU3VnZ2VzdENvbmZsaWN0Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmV4cGVyaW1lbnRhbC5zaG93T25TdWdnZXN0Q29uZmxpY3QsXG5cdFx0XHRcdFx0dGFnczogWydleHBlcmltZW50YWwnXSxcblx0XHRcdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICduZXZlcicsICd3aGVuU3VnZ2VzdExpc3RJc0luY29tcGxldGUnXSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LnNob3dPblN1Z2dlc3RDb25mbGljdCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IGlubGluZSBzdWdnZXN0aW9ucyB3aGVuIHRoZXJlIGlzIGEgc3VnZ2VzdCBjb25mbGljdC5cIiksXG5cdFx0XHRcdFx0ZXhwZXJpbWVudDoge1xuXHRcdFx0XHRcdFx0bW9kZTogJ2F1dG8nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmlubGluZVN1Z2dlc3QuZm9udEZhbWlseSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5mb250RmFtaWx5LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QuZm9udEZhbWlseScsIFwiQ29udHJvbHMgdGhlIGZvbnQgZmFtaWx5IG9mIHRoZSBpbmxpbmUgc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5hbGxvd0NvZGVTaGlmdGluZyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lZGl0cy5hbGxvd0NvZGVTaGlmdGluZyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LmVkaXRzLmFsbG93Q29kZVNoaWZ0aW5nJywgXCJDb250cm9scyB3aGV0aGVyIHNob3dpbmcgYSBzdWdnZXN0aW9uIHdpbGwgc2hpZnQgdGhlIGNvZGUgdG8gbWFrZSBzcGFjZSBmb3IgdGhlIHN1Z2dlc3Rpb24gaW5saW5lLlwiKSxcblx0XHRcdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICdob3Jpem9udGFsJywgJ25ldmVyJ10sXG5cdFx0XHRcdFx0dGFnczogWyduZXh0RWRpdFN1Z2dlc3Rpb25zJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmVkaXRzLnNob3dMb25nRGlzdGFuY2VIaW50Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lZGl0cy5zaG93TG9uZ0Rpc3RhbmNlSGludCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LmVkaXRzLnNob3dMb25nRGlzdGFuY2VIaW50JywgXCJDb250cm9scyB3aGV0aGVyIGxvbmcgZGlzdGFuY2UgaW5saW5lIHN1Z2dlc3Rpb25zIGFyZSBzaG93bi5cIiksXG5cdFx0XHRcdFx0dGFnczogWyduZXh0RWRpdFN1Z2dlc3Rpb25zJywgJ2V4cGVyaW1lbnRhbCddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5sb25nRGlzdGFuY2VIaW50Q29udGV4dExpbmVDb3VudCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lZGl0cy5sb25nRGlzdGFuY2VIaW50Q29udGV4dExpbmVDb3VudCxcblx0XHRcdFx0XHRtaW5pbXVtOiAwLFxuXHRcdFx0XHRcdG1heGltdW06IDEwLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZVN1Z2dlc3QuZWRpdHMubG9uZ0Rpc3RhbmNlSGludENvbnRleHRMaW5lQ291bnQnLCBcIkNvbnRyb2xzIGhvdyBtYW55IGxpbmVzIG9mIHN1cnJvdW5kaW5nIGNvbnRleHQgYXJlIHNob3duIGFib3ZlIGFuZCBiZWxvdyB0aGUgdGFyZ2V0IGxpbmUgaW4gdGhlIGxvbmcgZGlzdGFuY2UgaW5saW5lIHN1Z2dlc3Rpb24gcHJldmlldy4gU2V0IHRvIDAgdG8gb25seSBzaG93IHRoZSB0YXJnZXQgbGluZS5cIiksXG5cdFx0XHRcdFx0dGFnczogWyduZXh0RWRpdFN1Z2dlc3Rpb25zJywgJ2V4cGVyaW1lbnRhbCddLFxuXHRcdFx0XHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmVkaXRzLnJlbmRlclNpZGVCeVNpZGUnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZWRpdHMucmVuZGVyU2lkZUJ5U2lkZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdpbmxpbmVTdWdnZXN0LmVkaXRzLnJlbmRlclNpZGVCeVNpZGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbGFyZ2VyIHN1Z2dlc3Rpb25zIGNhbiBiZSBzaG93biBzaWRlIGJ5IHNpZGUuXCIpLFxuXHRcdFx0XHRcdGVudW06IFsnYXV0bycsICduZXZlciddLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmlubGluZVN1Z2dlc3QuZWRpdHMucmVuZGVyU2lkZUJ5U2lkZS5hdXRvJywgXCJMYXJnZXIgc3VnZ2VzdGlvbnMgd2lsbCBzaG93IHNpZGUgYnkgc2lkZSBpZiB0aGVyZSBpcyBlbm91Z2ggc3BhY2UsIG90aGVyd2lzZSB0aGV5IHdpbGwgYmUgc2hvd24gYmVsb3cuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuaW5saW5lU3VnZ2VzdC5lZGl0cy5yZW5kZXJTaWRlQnlTaWRlLm5ldmVyJywgXCJMYXJnZXIgc3VnZ2VzdGlvbnMgYXJlIG5ldmVyIHNob3duIHNpZGUgYnkgc2lkZSBhbmQgd2lsbCBhbHdheXMgYmUgc2hvd24gYmVsb3cuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0dGFnczogWyduZXh0RWRpdFN1Z2dlc3Rpb25zJ11cblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5pbmxpbmVTdWdnZXN0LmVkaXRzLnNob3dDb2xsYXBzZWQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLmVkaXRzLnNob3dDb2xsYXBzZWQsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdC5lZGl0cy5zaG93Q29sbGFwc2VkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBzdWdnZXN0aW9uIHdpbGwgc2hvdyBhcyBjb2xsYXBzZWQgdW50aWwganVtcGluZyB0byBpdC5cIiksXG5cdFx0XHRcdFx0dGFnczogWyduZXh0RWRpdFN1Z2dlc3Rpb25zJ11cblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsSW5saW5lU3VnZ2VzdE9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SUlubGluZVN1Z2dlc3RPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogYm9vbGVhbihpbnB1dC5lbmFibGVkLCB0aGlzLmRlZmF1bHRWYWx1ZS5lbmFibGVkKSxcblx0XHRcdG1vZGU6IHN0cmluZ1NldChpbnB1dC5tb2RlLCB0aGlzLmRlZmF1bHRWYWx1ZS5tb2RlLCBbJ3ByZWZpeCcsICdzdWJ3b3JkJywgJ3N1YndvcmRTbWFydCddKSxcblx0XHRcdHNob3dUb29sYmFyOiBzdHJpbmdTZXQoaW5wdXQuc2hvd1Rvb2xiYXIsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dUb29sYmFyLCBbJ2Fsd2F5cycsICdvbkhvdmVyJywgJ25ldmVyJ10pLFxuXHRcdFx0c3VwcHJlc3NTdWdnZXN0aW9uczogYm9vbGVhbihpbnB1dC5zdXBwcmVzc1N1Z2dlc3Rpb25zLCB0aGlzLmRlZmF1bHRWYWx1ZS5zdXBwcmVzc1N1Z2dlc3Rpb25zKSxcblx0XHRcdGtlZXBPbkJsdXI6IGJvb2xlYW4oaW5wdXQua2VlcE9uQmx1ciwgdGhpcy5kZWZhdWx0VmFsdWUua2VlcE9uQmx1ciksXG5cdFx0XHRmb250RmFtaWx5OiBFZGl0b3JTdHJpbmdPcHRpb24uc3RyaW5nKGlucHV0LmZvbnRGYW1pbHksIHRoaXMuZGVmYXVsdFZhbHVlLmZvbnRGYW1pbHkpLFxuXHRcdFx0c3ludGF4SGlnaGxpZ2h0aW5nRW5hYmxlZDogYm9vbGVhbihpbnB1dC5zeW50YXhIaWdobGlnaHRpbmdFbmFibGVkLCB0aGlzLmRlZmF1bHRWYWx1ZS5zeW50YXhIaWdobGlnaHRpbmdFbmFibGVkKSxcblx0XHRcdG1pblNob3dEZWxheTogRWRpdG9ySW50T3B0aW9uLmNsYW1wZWRJbnQoaW5wdXQubWluU2hvd0RlbGF5LCAwLCAwLCAxMDAwMCksXG5cdFx0XHRzdXBwcmVzc0luU25pcHBldE1vZGU6IGJvb2xlYW4oaW5wdXQuc3VwcHJlc3NJblNuaXBwZXRNb2RlLCB0aGlzLmRlZmF1bHRWYWx1ZS5zdXBwcmVzc0luU25pcHBldE1vZGUpLFxuXHRcdFx0ZWRpdHM6IHRoaXMuX3ZhbGlkYXRlRWRpdHMoaW5wdXQuZWRpdHMpLFxuXHRcdFx0dHJpZ2dlckNvbW1hbmRPblByb3ZpZGVyQ2hhbmdlOiBib29sZWFuKGlucHV0LnRyaWdnZXJDb21tYW5kT25Qcm92aWRlckNoYW5nZSwgdGhpcy5kZWZhdWx0VmFsdWUudHJpZ2dlckNvbW1hbmRPblByb3ZpZGVyQ2hhbmdlKSxcblx0XHRcdGV4cGVyaW1lbnRhbDogdGhpcy5fdmFsaWRhdGVFeHBlcmltZW50YWwoaW5wdXQuZXhwZXJpbWVudGFsKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGVFZGl0cyhfaW5wdXQ6IHVua25vd24pOiBJbnRlcm5hbElubGluZVN1Z2dlc3RPcHRpb25zWydlZGl0cyddIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlLmVkaXRzO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPEludGVybmFsSW5saW5lU3VnZ2VzdE9wdGlvbnNbJ2VkaXRzJ10+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBib29sZWFuKGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVkaXRzLmVuYWJsZWQpLFxuXHRcdFx0c2hvd0NvbGxhcHNlZDogYm9vbGVhbihpbnB1dC5zaG93Q29sbGFwc2VkLCB0aGlzLmRlZmF1bHRWYWx1ZS5lZGl0cy5zaG93Q29sbGFwc2VkKSxcblx0XHRcdGFsbG93Q29kZVNoaWZ0aW5nOiBzdHJpbmdTZXQoaW5wdXQuYWxsb3dDb2RlU2hpZnRpbmcsIHRoaXMuZGVmYXVsdFZhbHVlLmVkaXRzLmFsbG93Q29kZVNoaWZ0aW5nLCBbJ2Fsd2F5cycsICdob3Jpem9udGFsJywgJ25ldmVyJ10pLFxuXHRcdFx0c2hvd0xvbmdEaXN0YW5jZUhpbnQ6IGJvb2xlYW4oaW5wdXQuc2hvd0xvbmdEaXN0YW5jZUhpbnQsIHRoaXMuZGVmYXVsdFZhbHVlLmVkaXRzLnNob3dMb25nRGlzdGFuY2VIaW50KSxcblx0XHRcdGxvbmdEaXN0YW5jZUhpbnRDb250ZXh0TGluZUNvdW50OiBFZGl0b3JJbnRPcHRpb24uY2xhbXBlZEludChpbnB1dC5sb25nRGlzdGFuY2VIaW50Q29udGV4dExpbmVDb3VudCwgdGhpcy5kZWZhdWx0VmFsdWUuZWRpdHMubG9uZ0Rpc3RhbmNlSGludENvbnRleHRMaW5lQ291bnQsIDAsIDEwKSxcblx0XHRcdHJlbmRlclNpZGVCeVNpZGU6IHN0cmluZ1NldChpbnB1dC5yZW5kZXJTaWRlQnlTaWRlLCB0aGlzLmRlZmF1bHRWYWx1ZS5lZGl0cy5yZW5kZXJTaWRlQnlTaWRlLCBbJ25ldmVyJywgJ2F1dG8nXSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3ZhbGlkYXRlRXhwZXJpbWVudGFsKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsSW5saW5lU3VnZ2VzdE9wdGlvbnNbJ2V4cGVyaW1lbnRhbCddIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlLmV4cGVyaW1lbnRhbDtcblx0XHR9XG5cdFx0Y29uc3QgaW5wdXQgPSBfaW5wdXQgYXMgVW5rbm93bjxJbnRlcm5hbElubGluZVN1Z2dlc3RPcHRpb25zWydleHBlcmltZW50YWwnXT47XG5cdFx0cmV0dXJuIHtcblx0XHRcdHN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnM6IEVkaXRvclN0cmluZ09wdGlvbi5zdHJpbmcoaW5wdXQuc3VwcHJlc3NJbmxpbmVTdWdnZXN0aW9ucywgdGhpcy5kZWZhdWx0VmFsdWUuZXhwZXJpbWVudGFsLnN1cHByZXNzSW5saW5lU3VnZ2VzdGlvbnMpLFxuXHRcdFx0c2hvd09uU3VnZ2VzdENvbmZsaWN0OiBzdHJpbmdTZXQoaW5wdXQuc2hvd09uU3VnZ2VzdENvbmZsaWN0LCB0aGlzLmRlZmF1bHRWYWx1ZS5leHBlcmltZW50YWwuc2hvd09uU3VnZ2VzdENvbmZsaWN0LCBbJ2Fsd2F5cycsICduZXZlcicsICd3aGVuU3VnZ2VzdExpc3RJc0luY29tcGxldGUnXSksXG5cdFx0XHRlbXB0eVJlc3BvbnNlSW5mb3JtYXRpb246IGJvb2xlYW4oaW5wdXQuZW1wdHlSZXNwb25zZUluZm9ybWF0aW9uLCB0aGlzLmRlZmF1bHRWYWx1ZS5leHBlcmltZW50YWwuZW1wdHlSZXNwb25zZUluZm9ybWF0aW9uKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gYnJhY2tldFBhaXJDb2xvcml6YXRpb25cblxuZXhwb3J0IGludGVyZmFjZSBJQnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSBvciBkaXNhYmxlIGJyYWNrZXQgcGFpciBjb2xvcml6YXRpb24uXG5cdCovXG5cdGVuYWJsZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBVc2UgaW5kZXBlbmRlbnQgY29sb3IgcG9vbCBwZXIgYnJhY2tldCB0eXBlLlxuXHQqL1xuXHRpbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgSW50ZXJuYWxCcmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJQnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zPj47XG5cbi8qKlxuICogQ29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBpbmxpbmUgc3VnZ2VzdGlvbnNcbiAqL1xuY2xhc3MgQnJhY2tldFBhaXJDb2xvcml6YXRpb24gZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5icmFja2V0UGFpckNvbG9yaXphdGlvbiwgSUJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucywgSW50ZXJuYWxCcmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEludGVybmFsQnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zID0ge1xuXHRcdFx0ZW5hYmxlZDogRURJVE9SX01PREVMX0RFRkFVTFRTLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucy5lbmFibGVkLFxuXHRcdFx0aW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZTogRURJVE9SX01PREVMX0RFRkFVTFRTLmJyYWNrZXRQYWlyQ29sb3JpemF0aW9uT3B0aW9ucy5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlLFxuXHRcdH07XG5cblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5icmFja2V0UGFpckNvbG9yaXphdGlvbiwgJ2JyYWNrZXRQYWlyQ29sb3JpemF0aW9uJywgZGVmYXVsdHMsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3IuYnJhY2tldFBhaXJDb2xvcml6YXRpb24uZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZW5hYmxlZCxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2JyYWNrZXRQYWlyQ29sb3JpemF0aW9uLmVuYWJsZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYnJhY2tldCBwYWlyIGNvbG9yaXphdGlvbiBpcyBlbmFibGVkIG9yIG5vdC4gVXNlIHswfSB0byBvdmVycmlkZSB0aGUgYnJhY2tldCBoaWdobGlnaHQgY29sb3JzLlwiLCAnYCN3b3JrYmVuY2guY29sb3JDdXN0b21pemF0aW9ucyNgJylcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5icmFja2V0UGFpckNvbG9yaXphdGlvbi5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2JyYWNrZXRQYWlyQ29sb3JpemF0aW9uLmluZGVwZW5kZW50Q29sb3JQb29sUGVyQnJhY2tldFR5cGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZWFjaCBicmFja2V0IHR5cGUgaGFzIGl0cyBvd24gaW5kZXBlbmRlbnQgY29sb3IgcG9vbC5cIilcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsQnJhY2tldFBhaXJDb2xvcml6YXRpb25PcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElCcmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM+O1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbmFibGVkOiBib29sZWFuKGlucHV0LmVuYWJsZWQsIHRoaXMuZGVmYXVsdFZhbHVlLmVuYWJsZWQpLFxuXHRcdFx0aW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZTogYm9vbGVhbihpbnB1dC5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlLCB0aGlzLmRlZmF1bHRWYWx1ZS5pbmRlcGVuZGVudENvbG9yUG9vbFBlckJyYWNrZXRUeXBlKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZ3VpZGVzXG5cbmV4cG9ydCBpbnRlcmZhY2UgSUd1aWRlc09wdGlvbnMge1xuXHQvKipcblx0ICogRW5hYmxlIHJlbmRlcmluZyBvZiBicmFja2V0IHBhaXIgZ3VpZGVzLlxuXHQgKiBEZWZhdWx0cyB0byBmYWxzZS5cblx0Ki9cblx0YnJhY2tldFBhaXJzPzogYm9vbGVhbiB8ICdhY3RpdmUnO1xuXG5cdC8qKlxuXHQgKiBFbmFibGUgcmVuZGVyaW5nIG9mIHZlcnRpY2FsIGJyYWNrZXQgcGFpciBndWlkZXMuXG5cdCAqIERlZmF1bHRzIHRvICdhY3RpdmUnLlxuXHQgKi9cblx0YnJhY2tldFBhaXJzSG9yaXpvbnRhbD86IGJvb2xlYW4gfCAnYWN0aXZlJztcblxuXHQvKipcblx0ICogRW5hYmxlIGhpZ2hsaWdodGluZyBvZiB0aGUgYWN0aXZlIGJyYWNrZXQgcGFpci5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0Ki9cblx0aGlnaGxpZ2h0QWN0aXZlQnJhY2tldFBhaXI/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBFbmFibGUgcmVuZGVyaW5nIG9mIGluZGVudCBndWlkZXMuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRpbmRlbnRhdGlvbj86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEVuYWJsZSBoaWdobGlnaHRpbmcgb2YgdGhlIGFjdGl2ZSBpbmRlbnQgZ3VpZGUuXG5cdCAqIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRoaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbj86IGJvb2xlYW4gfCAnYWx3YXlzJztcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgSW50ZXJuYWxHdWlkZXNPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SUd1aWRlc09wdGlvbnM+PjtcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGlubGluZSBzdWdnZXN0aW9uc1xuICovXG5jbGFzcyBHdWlkZU9wdGlvbnMgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5ndWlkZXMsIElHdWlkZXNPcHRpb25zLCBJbnRlcm5hbEd1aWRlc09wdGlvbnM+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEludGVybmFsR3VpZGVzT3B0aW9ucyA9IHtcblx0XHRcdGJyYWNrZXRQYWlyczogZmFsc2UsXG5cdFx0XHRicmFja2V0UGFpcnNIb3Jpem9udGFsOiAnYWN0aXZlJyxcblx0XHRcdGhpZ2hsaWdodEFjdGl2ZUJyYWNrZXRQYWlyOiB0cnVlLFxuXG5cdFx0XHRpbmRlbnRhdGlvbjogdHJ1ZSxcblx0XHRcdGhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uOiB0cnVlXG5cdFx0fTtcblxuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmd1aWRlcywgJ2d1aWRlcycsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGVudW06IFt0cnVlLCAnYWN0aXZlJywgZmFsc2VdLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnMudHJ1ZScsIFwiRW5hYmxlcyBicmFja2V0IHBhaXIgZ3VpZGVzLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnMuYWN0aXZlJywgXCJFbmFibGVzIGJyYWNrZXQgcGFpciBndWlkZXMgb25seSBmb3IgdGhlIGFjdGl2ZSBicmFja2V0IHBhaXIuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmJyYWNrZXRQYWlycy5mYWxzZScsIFwiRGlzYWJsZXMgYnJhY2tldCBwYWlyIGd1aWRlcy5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5icmFja2V0UGFpcnMsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYnJhY2tldCBwYWlyIGd1aWRlcyBhcmUgZW5hYmxlZCBvciBub3QuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ3VpZGVzLmJyYWNrZXRQYWlyc0hvcml6b250YWwnOiB7XG5cdFx0XHRcdFx0dHlwZTogWydib29sZWFuJywgJ3N0cmluZyddLFxuXHRcdFx0XHRcdGVudW06IFt0cnVlLCAnYWN0aXZlJywgZmFsc2VdLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5icmFja2V0UGFpcnNIb3Jpem9udGFsLnRydWUnLCBcIkVuYWJsZXMgaG9yaXpvbnRhbCBndWlkZXMgYXMgYWRkaXRpb24gdG8gdmVydGljYWwgYnJhY2tldCBwYWlyIGd1aWRlcy5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuYnJhY2tldFBhaXJzSG9yaXpvbnRhbC5hY3RpdmUnLCBcIkVuYWJsZXMgaG9yaXpvbnRhbCBndWlkZXMgb25seSBmb3IgdGhlIGFjdGl2ZSBicmFja2V0IHBhaXIuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmJyYWNrZXRQYWlyc0hvcml6b250YWwuZmFsc2UnLCBcIkRpc2FibGVzIGhvcml6b250YWwgYnJhY2tldCBwYWlyIGd1aWRlcy5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5icmFja2V0UGFpcnNIb3Jpem9udGFsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuYnJhY2tldFBhaXJzSG9yaXpvbnRhbCcsIFwiQ29udHJvbHMgd2hldGhlciBob3Jpem9udGFsIGJyYWNrZXQgcGFpciBndWlkZXMgYXJlIGVuYWJsZWQgb3Igbm90LlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmd1aWRlcy5oaWdobGlnaHRBY3RpdmVCcmFja2V0UGFpcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuaGlnaGxpZ2h0QWN0aXZlQnJhY2tldFBhaXIsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmd1aWRlcy5oaWdobGlnaHRBY3RpdmVCcmFja2V0UGFpcicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBoaWdobGlnaHQgdGhlIGFjdGl2ZSBicmFja2V0IHBhaXIuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZ3VpZGVzLmluZGVudGF0aW9uJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5pbmRlbnRhdGlvbixcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmluZGVudGF0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIHJlbmRlciBpbmRlbnQgZ3VpZGVzLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLmd1aWRlcy5oaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbic6IHtcblx0XHRcdFx0XHR0eXBlOiBbJ2Jvb2xlYW4nLCAnc3RyaW5nJ10sXG5cdFx0XHRcdFx0ZW51bTogW3RydWUsICdhbHdheXMnLCBmYWxzZV0sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uLnRydWUnLCBcIkhpZ2hsaWdodHMgdGhlIGFjdGl2ZSBpbmRlbnQgZ3VpZGUuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uLmFsd2F5cycsIFwiSGlnaGxpZ2h0cyB0aGUgYWN0aXZlIGluZGVudCBndWlkZSBldmVuIGlmIGJyYWNrZXQgZ3VpZGVzIGFyZSBoaWdobGlnaHRlZC5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5ndWlkZXMuaGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb24uZmFsc2UnLCBcIkRvIG5vdCBoaWdobGlnaHQgdGhlIGFjdGl2ZSBpbmRlbnQgZ3VpZGUuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuaGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb24sXG5cblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3IuZ3VpZGVzLmhpZ2hsaWdodEFjdGl2ZUluZGVudGF0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGhpZ2hsaWdodCB0aGUgYWN0aXZlIGluZGVudCBndWlkZS5cIilcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogSW50ZXJuYWxHdWlkZXNPcHRpb25zIHtcblx0XHRpZiAoIV9pbnB1dCB8fCB0eXBlb2YgX2lucHV0ICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dCA9IF9pbnB1dCBhcyBVbmtub3duPElHdWlkZXNPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YnJhY2tldFBhaXJzOiBwcmltaXRpdmVTZXQoaW5wdXQuYnJhY2tldFBhaXJzLCB0aGlzLmRlZmF1bHRWYWx1ZS5icmFja2V0UGFpcnMsIFt0cnVlLCBmYWxzZSwgJ2FjdGl2ZSddKSxcblx0XHRcdGJyYWNrZXRQYWlyc0hvcml6b250YWw6IHByaW1pdGl2ZVNldChpbnB1dC5icmFja2V0UGFpcnNIb3Jpem9udGFsLCB0aGlzLmRlZmF1bHRWYWx1ZS5icmFja2V0UGFpcnNIb3Jpem9udGFsLCBbdHJ1ZSwgZmFsc2UsICdhY3RpdmUnXSksXG5cdFx0XHRoaWdobGlnaHRBY3RpdmVCcmFja2V0UGFpcjogYm9vbGVhbihpbnB1dC5oaWdobGlnaHRBY3RpdmVCcmFja2V0UGFpciwgdGhpcy5kZWZhdWx0VmFsdWUuaGlnaGxpZ2h0QWN0aXZlQnJhY2tldFBhaXIpLFxuXG5cdFx0XHRpbmRlbnRhdGlvbjogYm9vbGVhbihpbnB1dC5pbmRlbnRhdGlvbiwgdGhpcy5kZWZhdWx0VmFsdWUuaW5kZW50YXRpb24pLFxuXHRcdFx0aGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb246IHByaW1pdGl2ZVNldChpbnB1dC5oaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbiwgdGhpcy5kZWZhdWx0VmFsdWUuaGlnaGxpZ2h0QWN0aXZlSW5kZW50YXRpb24sIFt0cnVlLCBmYWxzZSwgJ2Fsd2F5cyddKSxcblx0XHR9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHByaW1pdGl2ZVNldDxUIGV4dGVuZHMgc3RyaW5nIHwgYm9vbGVhbj4odmFsdWU6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogVCwgYWxsb3dlZFZhbHVlczogVFtdKTogVCB7XG5cdGNvbnN0IGlkeCA9IGFsbG93ZWRWYWx1ZXMuaW5kZXhPZih2YWx1ZSBhcyBUKTtcblx0aWYgKGlkeCA9PT0gLTEpIHtcblx0XHRyZXR1cm4gZGVmYXVsdFZhbHVlO1xuXHR9XG5cdHJldHVybiBhbGxvd2VkVmFsdWVzW2lkeF07XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc3VnZ2VzdFxuXG4vKipcbiAqIENvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgZWRpdG9yIHN1Z2dlc3Qgd2lkZ2V0XG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVN1Z2dlc3RPcHRpb25zIHtcblx0LyoqXG5cdCAqIE92ZXJ3cml0ZSB3b3JkIGVuZHMgb24gYWNjZXB0LiBEZWZhdWx0IHRvIGZhbHNlLlxuXHQgKi9cblx0aW5zZXJ0TW9kZT86ICdpbnNlcnQnIHwgJ3JlcGxhY2UnO1xuXHQvKipcblx0ICogRW5hYmxlIGdyYWNlZnVsIG1hdGNoaW5nLiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0ZmlsdGVyR3JhY2VmdWw/OiBib29sZWFuO1xuXHQvKipcblx0ICogUHJldmVudCBxdWljayBzdWdnZXN0aW9ucyB3aGVuIGEgc25pcHBldCBpcyBhY3RpdmUuIERlZmF1bHRzIHRvIHRydWUuXG5cdCAqL1xuXHRzbmlwcGV0c1ByZXZlbnRRdWlja1N1Z2dlc3Rpb25zPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEZhdm9ycyB3b3JkcyB0aGF0IGFwcGVhciBjbG9zZSB0byB0aGUgY3Vyc29yLlxuXHQgKi9cblx0bG9jYWxpdHlCb251cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBFbmFibGUgdXNpbmcgZ2xvYmFsIHN0b3JhZ2UgZm9yIHJlbWVtYmVyaW5nIHN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hhcmVTdWdnZXN0U2VsZWN0aW9ucz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTZWxlY3Qgc3VnZ2VzdGlvbnMgd2hlbiB0cmlnZ2VyZWQgdmlhIHF1aWNrIHN1Z2dlc3Qgb3IgdHJpZ2dlciBjaGFyYWN0ZXJzXG5cdCAqL1xuXHRzZWxlY3Rpb25Nb2RlPzogJ2Fsd2F5cycgfCAnbmV2ZXInIHwgJ3doZW5UcmlnZ2VyQ2hhcmFjdGVyJyB8ICd3aGVuUXVpY2tTdWdnZXN0aW9uJztcblx0LyoqXG5cdCAqIEVuYWJsZSBvciBkaXNhYmxlIGljb25zIGluIHN1Z2dlc3Rpb25zLiBEZWZhdWx0cyB0byB0cnVlLlxuXHQgKi9cblx0c2hvd0ljb25zPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSBvciBkaXNhYmxlIHRoZSBzdWdnZXN0IHN0YXR1cyBiYXIuXG5cdCAqL1xuXHRzaG93U3RhdHVzQmFyPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEVuYWJsZSBvciBkaXNhYmxlIHRoZSByZW5kZXJpbmcgb2YgdGhlIHN1Z2dlc3Rpb24gcHJldmlldy5cblx0ICovXG5cdHByZXZpZXc/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29uZmlndXJlcyB0aGUgbW9kZSBvZiB0aGUgcHJldmlldy5cblx0Ki9cblx0cHJldmlld01vZGU/OiAncHJlZml4JyB8ICdzdWJ3b3JkJyB8ICdzdWJ3b3JkU21hcnQnO1xuXHQvKipcblx0ICogU2hvdyBkZXRhaWxzIGlubGluZSB3aXRoIHRoZSBsYWJlbC4gRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdHNob3dJbmxpbmVEZXRhaWxzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIEdyb3cgdGhlIHN1Z2dlc3Qgd2lkZ2V0J3MgcHJlZmVycmVkIHdpZHRoIHRvIGZpdCB0aGUgaW5saW5lIGRldGFpbCB0ZXh0IHNvIGl0XG5cdCAqIGlzIG5vdCB0cnVuY2F0ZWQuIERlZmF1bHRzIHRvIGZhbHNlLlxuXHQgKiBAaW50ZXJuYWxcblx0ICovXG5cdGZpdFdpZHRoVG9EZXRhaWxzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgbWV0aG9kLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd01ldGhvZHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBmdW5jdGlvbi1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dGdW5jdGlvbnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBjb25zdHJ1Y3Rvci1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dDb25zdHJ1Y3RvcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBkZXByZWNhdGVkLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0RlcHJlY2F0ZWQ/OiBib29sZWFuO1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciBzdWdnZXN0aW9ucyBhbGxvdyBtYXRjaGVzIGluIHRoZSBtaWRkbGUgb2YgdGhlIHdvcmQgaW5zdGVhZCBvZiBvbmx5IGF0IHRoZSBiZWdpbm5pbmdcblx0ICovXG5cdG1hdGNoT25Xb3JkU3RhcnRPbmx5PzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgZmllbGQtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93RmllbGRzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgdmFyaWFibGUtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93VmFyaWFibGVzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgY2xhc3Mtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93Q2xhc3Nlcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IHN0cnVjdC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dTdHJ1Y3RzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgaW50ZXJmYWNlLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0ludGVyZmFjZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBtb2R1bGUtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93TW9kdWxlcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IHByb3BlcnR5LXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd1Byb3BlcnRpZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBldmVudC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dFdmVudHM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBvcGVyYXRvci1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dPcGVyYXRvcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyB1bml0LXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd1VuaXRzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgdmFsdWUtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93VmFsdWVzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgY29uc3RhbnQtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93Q29uc3RhbnRzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgZW51bS1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dFbnVtcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGVudW1NZW1iZXItc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93RW51bU1lbWJlcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBrZXl3b3JkLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0tleXdvcmRzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgdGV4dC1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dXb3Jkcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGNvbG9yLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0NvbG9ycz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGZpbGUtc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93RmlsZXM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyByZWZlcmVuY2Utc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93UmVmZXJlbmNlcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGZvbGRlci1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dGb2xkZXJzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIFNob3cgdHlwZVBhcmFtZXRlci1zdWdnZXN0aW9ucy5cblx0ICovXG5cdHNob3dUeXBlUGFyYW1ldGVycz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IGlzc3VlLXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd0lzc3Vlcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBTaG93IHVzZXItc3VnZ2VzdGlvbnMuXG5cdCAqL1xuXHRzaG93VXNlcnM/OiBib29sZWFuO1xuXHQvKipcblx0ICogU2hvdyBzbmlwcGV0LXN1Z2dlc3Rpb25zLlxuXHQgKi9cblx0c2hvd1NuaXBwZXRzPzogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgSW50ZXJuYWxTdWdnZXN0T3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElTdWdnZXN0T3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JTdWdnZXN0IGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24uc3VnZ2VzdCwgSVN1Z2dlc3RPcHRpb25zLCBJbnRlcm5hbFN1Z2dlc3RPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IEludGVybmFsU3VnZ2VzdE9wdGlvbnMgPSB7XG5cdFx0XHRpbnNlcnRNb2RlOiAnaW5zZXJ0Jyxcblx0XHRcdGZpbHRlckdyYWNlZnVsOiB0cnVlLFxuXHRcdFx0c25pcHBldHNQcmV2ZW50UXVpY2tTdWdnZXN0aW9uczogZmFsc2UsXG5cdFx0XHRsb2NhbGl0eUJvbnVzOiBmYWxzZSxcblx0XHRcdHNoYXJlU3VnZ2VzdFNlbGVjdGlvbnM6IGZhbHNlLFxuXHRcdFx0c2VsZWN0aW9uTW9kZTogJ2Fsd2F5cycsXG5cdFx0XHRzaG93SWNvbnM6IHRydWUsXG5cdFx0XHRzaG93U3RhdHVzQmFyOiBmYWxzZSxcblx0XHRcdHByZXZpZXc6IGZhbHNlLFxuXHRcdFx0cHJldmlld01vZGU6ICdzdWJ3b3JkU21hcnQnLFxuXHRcdFx0c2hvd0lubGluZURldGFpbHM6IHRydWUsXG5cdFx0XHRmaXRXaWR0aFRvRGV0YWlsczogZmFsc2UsXG5cdFx0XHRzaG93TWV0aG9kczogdHJ1ZSxcblx0XHRcdHNob3dGdW5jdGlvbnM6IHRydWUsXG5cdFx0XHRzaG93Q29uc3RydWN0b3JzOiB0cnVlLFxuXHRcdFx0c2hvd0RlcHJlY2F0ZWQ6IHRydWUsXG5cdFx0XHRtYXRjaE9uV29yZFN0YXJ0T25seTogdHJ1ZSxcblx0XHRcdHNob3dGaWVsZHM6IHRydWUsXG5cdFx0XHRzaG93VmFyaWFibGVzOiB0cnVlLFxuXHRcdFx0c2hvd0NsYXNzZXM6IHRydWUsXG5cdFx0XHRzaG93U3RydWN0czogdHJ1ZSxcblx0XHRcdHNob3dJbnRlcmZhY2VzOiB0cnVlLFxuXHRcdFx0c2hvd01vZHVsZXM6IHRydWUsXG5cdFx0XHRzaG93UHJvcGVydGllczogdHJ1ZSxcblx0XHRcdHNob3dFdmVudHM6IHRydWUsXG5cdFx0XHRzaG93T3BlcmF0b3JzOiB0cnVlLFxuXHRcdFx0c2hvd1VuaXRzOiB0cnVlLFxuXHRcdFx0c2hvd1ZhbHVlczogdHJ1ZSxcblx0XHRcdHNob3dDb25zdGFudHM6IHRydWUsXG5cdFx0XHRzaG93RW51bXM6IHRydWUsXG5cdFx0XHRzaG93RW51bU1lbWJlcnM6IHRydWUsXG5cdFx0XHRzaG93S2V5d29yZHM6IHRydWUsXG5cdFx0XHRzaG93V29yZHM6IHRydWUsXG5cdFx0XHRzaG93Q29sb3JzOiB0cnVlLFxuXHRcdFx0c2hvd0ZpbGVzOiB0cnVlLFxuXHRcdFx0c2hvd1JlZmVyZW5jZXM6IHRydWUsXG5cdFx0XHRzaG93Rm9sZGVyczogdHJ1ZSxcblx0XHRcdHNob3dUeXBlUGFyYW1ldGVyczogdHJ1ZSxcblx0XHRcdHNob3dTbmlwcGV0czogdHJ1ZSxcblx0XHRcdHNob3dVc2VyczogdHJ1ZSxcblx0XHRcdHNob3dJc3N1ZXM6IHRydWUsXG5cdFx0fTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5zdWdnZXN0LCAnc3VnZ2VzdCcsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3QuaW5zZXJ0TW9kZSc6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRlbnVtOiBbJ2luc2VydCcsICdyZXBsYWNlJ10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzdWdnZXN0Lmluc2VydE1vZGUuaW5zZXJ0JywgXCJJbnNlcnQgc3VnZ2VzdGlvbiB3aXRob3V0IG92ZXJ3cml0aW5nIHRleHQgcmlnaHQgb2YgdGhlIGN1cnNvci5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3N1Z2dlc3QuaW5zZXJ0TW9kZS5yZXBsYWNlJywgXCJJbnNlcnQgc3VnZ2VzdGlvbiBhbmQgb3ZlcndyaXRlIHRleHQgcmlnaHQgb2YgdGhlIGN1cnNvci5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5pbnNlcnRNb2RlLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1Z2dlc3QuaW5zZXJ0TW9kZScsIFwiQ29udHJvbHMgd2hldGhlciB3b3JkcyBhcmUgb3ZlcndyaXR0ZW4gd2hlbiBhY2NlcHRpbmcgY29tcGxldGlvbnMuIE5vdGUgdGhhdCB0aGlzIGRlcGVuZHMgb24gZXh0ZW5zaW9ucyBvcHRpbmcgaW50byB0aGlzIGZlYXR1cmUuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5maWx0ZXJHcmFjZWZ1bCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZmlsdGVyR3JhY2VmdWwsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5maWx0ZXJHcmFjZWZ1bCcsIFwiQ29udHJvbHMgd2hldGhlciBmaWx0ZXJpbmcgYW5kIHNvcnRpbmcgc3VnZ2VzdGlvbnMgYWNjb3VudHMgZm9yIHNtYWxsIHR5cG9zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3QubG9jYWxpdHlCb251cyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMubG9jYWxpdHlCb251cyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0LmxvY2FsaXR5Qm9udXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc29ydGluZyBmYXZvcnMgd29yZHMgdGhhdCBhcHBlYXIgY2xvc2UgdG8gdGhlIGN1cnNvci5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNoYXJlU3VnZ2VzdFNlbGVjdGlvbnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNoYXJlU3VnZ2VzdFNlbGVjdGlvbnMsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0LnNoYXJlU3VnZ2VzdFNlbGVjdGlvbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgcmVtZW1iZXJlZCBzdWdnZXN0aW9uIHNlbGVjdGlvbnMgYXJlIHNoYXJlZCBiZXR3ZWVuIG11bHRpcGxlIHdvcmtzcGFjZXMgYW5kIHdpbmRvd3MgKG5lZWRzIGAjZWRpdG9yLnN1Z2dlc3RTZWxlY3Rpb24jYCkuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zZWxlY3Rpb25Nb2RlJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGVudW06IFsnYWx3YXlzJywgJ25ldmVyJywgJ3doZW5UcmlnZ2VyQ2hhcmFjdGVyJywgJ3doZW5RdWlja1N1Z2dlc3Rpb24nXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3N1Z2dlc3QuaW5zZXJ0TW9kZS5hbHdheXMnLCBcIkFsd2F5cyBzZWxlY3QgYSBzdWdnZXN0aW9uIHdoZW4gYXV0b21hdGljYWxseSB0cmlnZ2VyaW5nIEludGVsbGlTZW5zZS5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3N1Z2dlc3QuaW5zZXJ0TW9kZS5uZXZlcicsIFwiTmV2ZXIgc2VsZWN0IGEgc3VnZ2VzdGlvbiB3aGVuIGF1dG9tYXRpY2FsbHkgdHJpZ2dlcmluZyBJbnRlbGxpU2Vuc2UuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzdWdnZXN0Lmluc2VydE1vZGUud2hlblRyaWdnZXJDaGFyYWN0ZXInLCBcIlNlbGVjdCBhIHN1Z2dlc3Rpb24gb25seSB3aGVuIHRyaWdnZXJpbmcgSW50ZWxsaVNlbnNlIGZyb20gYSB0cmlnZ2VyIGNoYXJhY3Rlci5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3N1Z2dlc3QuaW5zZXJ0TW9kZS53aGVuUXVpY2tTdWdnZXN0aW9uJywgXCJTZWxlY3QgYSBzdWdnZXN0aW9uIG9ubHkgd2hlbiB0cmlnZ2VyaW5nIEludGVsbGlTZW5zZSBhcyB5b3UgdHlwZS5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zZWxlY3Rpb25Nb2RlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdC5zZWxlY3Rpb25Nb2RlJywgXCJDb250cm9scyB3aGV0aGVyIGEgc3VnZ2VzdGlvbiBpcyBzZWxlY3RlZCB3aGVuIHRoZSB3aWRnZXQgc2hvd3MuIE5vdGUgdGhhdCB0aGlzIG9ubHkgYXBwbGllcyB0byBhdXRvbWF0aWNhbGx5IHRyaWdnZXJlZCBzdWdnZXN0aW9ucyAoezB9IGFuZCB7MX0pIGFuZCB0aGF0IGEgc3VnZ2VzdGlvbiBpcyBhbHdheXMgc2VsZWN0ZWQgd2hlbiBleHBsaWNpdGx5IGludm9rZWQsIGUuZyB2aWEgYEN0cmwrU3BhY2VgLlwiLCAnYCNlZGl0b3IucXVpY2tTdWdnZXN0aW9ucyNgJywgJ2AjZWRpdG9yLnN1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzI2AnKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc25pcHBldHNQcmV2ZW50UXVpY2tTdWdnZXN0aW9ucyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuc25pcHBldHNQcmV2ZW50UXVpY2tTdWdnZXN0aW9ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0LnNuaXBwZXRzUHJldmVudFF1aWNrU3VnZ2VzdGlvbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYW4gYWN0aXZlIHNuaXBwZXQgcHJldmVudHMgcXVpY2sgc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93SWNvbnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGRlZmF1bHRzLnNob3dJY29ucyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0LnNob3dJY29ucycsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IG9yIGhpZGUgaWNvbnMgaW4gc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93U3RhdHVzQmFyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93U3RhdHVzQmFyLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1Z2dlc3Quc2hvd1N0YXR1c0JhcicsIFwiQ29udHJvbHMgdGhlIHZpc2liaWxpdHkgb2YgdGhlIHN0YXR1cyBiYXIgYXQgdGhlIGJvdHRvbSBvZiB0aGUgc3VnZ2VzdCB3aWRnZXQuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5wcmV2aWV3Jzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5wcmV2aWV3LFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1Z2dlc3QucHJldmlldycsIFwiQ29udHJvbHMgd2hldGhlciB0byBwcmV2aWV3IHRoZSBzdWdnZXN0aW9uIG91dGNvbWUgaW4gdGhlIGVkaXRvci5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dJbmxpbmVEZXRhaWxzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5zaG93SW5saW5lRGV0YWlscyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0LnNob3dJbmxpbmVEZXRhaWxzJywgXCJDb250cm9scyB3aGV0aGVyIHN1Z2dlc3QgZGV0YWlscyBzaG93IGlubGluZSB3aXRoIHRoZSBsYWJlbCBvciBvbmx5IGluIHRoZSBkZXRhaWxzIHdpZGdldC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LmZpbHRlcmVkVHlwZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ2RlcHJlY2F0ZWQnLCBcIlRoaXMgc2V0dGluZyBpcyBkZXByZWNhdGVkLCBwbGVhc2UgdXNlIHNlcGFyYXRlIHNldHRpbmdzIGxpa2UgJ2VkaXRvci5zdWdnZXN0LnNob3dLZXl3b3Jkcycgb3IgJ2VkaXRvci5zdWdnZXN0LnNob3dTbmlwcGV0cycgaW5zdGVhZC5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dNZXRob2RzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd01ldGhvZHMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYG1ldGhvZGAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93RnVuY3Rpb25zJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0Z1bmN0aW9ucycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgZnVuY3Rpb25gLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0NvbnN0cnVjdG9ycyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dDb25zdHJ1Y3RvcnMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGNvbnN0cnVjdG9yYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dEZXByZWNhdGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0RlcHJlY2F0ZWQnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGRlcHJlY2F0ZWRgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3QubWF0Y2hPbldvcmRTdGFydE9ubHknOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5tYXRjaE9uV29yZFN0YXJ0T25seScsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBmaWx0ZXJpbmcgcmVxdWlyZXMgdGhhdCB0aGUgZmlyc3QgY2hhcmFjdGVyIG1hdGNoZXMgb24gYSB3b3JkIHN0YXJ0LiBGb3IgZXhhbXBsZSwgYGNgIG9uIGBDb25zb2xlYCBvciBgV2ViQ29udGV4dGAgYnV0IF9ub3RfIG9uIGBkZXNjcmlwdGlvbmAuIFdoZW4gZGlzYWJsZWQgSW50ZWxsaVNlbnNlIHdpbGwgc2hvdyBtb3JlIHJlc3VsdHMgYnV0IHN0aWxsIHNvcnRzIHRoZW0gYnkgbWF0Y2ggcXVhbGl0eS5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dGaWVsZHMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93RmllbGRzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBmaWVsZGAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93VmFyaWFibGVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd1ZhcmlhYmxlcycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgdmFyaWFibGVgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0NsYXNzZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93Q2xhc3NzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBjbGFzc2Atc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93U3RydWN0cyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dTdHJ1Y3RzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBzdHJ1Y3RgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0ludGVyZmFjZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93SW50ZXJmYWNlcycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgaW50ZXJmYWNlYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dNb2R1bGVzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd01vZHVsZXMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYG1vZHVsZWAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93UHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dQcm9wZXJ0eXMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYHByb3BlcnR5YC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dFdmVudHMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93RXZlbnRzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBldmVudGAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93T3BlcmF0b3JzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd09wZXJhdG9ycycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgb3BlcmF0b3JgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1VuaXRzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd1VuaXRzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGB1bml0YC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dWYWx1ZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93VmFsdWVzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGB2YWx1ZWAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93Q29uc3RhbnRzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0NvbnN0YW50cycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgY29uc3RhbnRgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0VudW1zJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd0VudW1zJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBlbnVtYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dFbnVtTWVtYmVycyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dFbnVtTWVtYmVycycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgZW51bU1lbWJlcmAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93S2V5d29yZHMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93S2V5d29yZHMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGtleXdvcmRgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1dvcmRzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd1RleHRzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGB0ZXh0YC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dDb2xvcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93Q29sb3JzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBjb2xvcmAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93RmlsZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93RmlsZXMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGZpbGVgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1JlZmVyZW5jZXMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93UmVmZXJlbmNlcycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgcmVmZXJlbmNlYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dDdXN0b21jb2xvcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93Q3VzdG9tY29sb3JzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBjdXN0b21jb2xvcmAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93Rm9sZGVycyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dGb2xkZXJzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGBmb2xkZXJgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd1R5cGVQYXJhbWV0ZXJzJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLnN1Z2dlc3Quc2hvd1R5cGVQYXJhbWV0ZXJzJywgXCJXaGVuIGVuYWJsZWQgSW50ZWxsaVNlbnNlIHNob3dzIGB0eXBlUGFyYW1ldGVyYC1zdWdnZXN0aW9ucy5cIilcblx0XHRcdFx0fSxcblx0XHRcdFx0J2VkaXRvci5zdWdnZXN0LnNob3dTbmlwcGV0cyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dTbmlwcGV0cycsIFwiV2hlbiBlbmFibGVkIEludGVsbGlTZW5zZSBzaG93cyBgc25pcHBldGAtc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3Iuc3VnZ2VzdC5zaG93VXNlcnMnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdlZGl0b3Iuc3VnZ2VzdC5zaG93VXNlcnMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYHVzZXJgLXN1Z2dlc3Rpb25zLlwiKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnN1Z2dlc3Quc2hvd0lzc3Vlcyc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2VkaXRvci5zdWdnZXN0LnNob3dJc3N1ZXMnLCBcIldoZW4gZW5hYmxlZCBJbnRlbGxpU2Vuc2Ugc2hvd3MgYGlzc3Vlc2Atc3VnZ2VzdGlvbnMuXCIpXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKF9pbnB1dDogdW5rbm93bik6IEludGVybmFsU3VnZ2VzdE9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SVN1Z2dlc3RPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW5zZXJ0TW9kZTogc3RyaW5nU2V0KGlucHV0Lmluc2VydE1vZGUsIHRoaXMuZGVmYXVsdFZhbHVlLmluc2VydE1vZGUsIFsnaW5zZXJ0JywgJ3JlcGxhY2UnXSksXG5cdFx0XHRmaWx0ZXJHcmFjZWZ1bDogYm9vbGVhbihpbnB1dC5maWx0ZXJHcmFjZWZ1bCwgdGhpcy5kZWZhdWx0VmFsdWUuZmlsdGVyR3JhY2VmdWwpLFxuXHRcdFx0c25pcHBldHNQcmV2ZW50UXVpY2tTdWdnZXN0aW9uczogYm9vbGVhbihpbnB1dC5zbmlwcGV0c1ByZXZlbnRRdWlja1N1Z2dlc3Rpb25zLCB0aGlzLmRlZmF1bHRWYWx1ZS5maWx0ZXJHcmFjZWZ1bCksXG5cdFx0XHRsb2NhbGl0eUJvbnVzOiBib29sZWFuKGlucHV0LmxvY2FsaXR5Qm9udXMsIHRoaXMuZGVmYXVsdFZhbHVlLmxvY2FsaXR5Qm9udXMpLFxuXHRcdFx0c2hhcmVTdWdnZXN0U2VsZWN0aW9uczogYm9vbGVhbihpbnB1dC5zaGFyZVN1Z2dlc3RTZWxlY3Rpb25zLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaGFyZVN1Z2dlc3RTZWxlY3Rpb25zKSxcblx0XHRcdHNlbGVjdGlvbk1vZGU6IHN0cmluZ1NldChpbnB1dC5zZWxlY3Rpb25Nb2RlLCB0aGlzLmRlZmF1bHRWYWx1ZS5zZWxlY3Rpb25Nb2RlLCBbJ2Fsd2F5cycsICduZXZlcicsICd3aGVuUXVpY2tTdWdnZXN0aW9uJywgJ3doZW5UcmlnZ2VyQ2hhcmFjdGVyJ10pLFxuXHRcdFx0c2hvd0ljb25zOiBib29sZWFuKGlucHV0LnNob3dJY29ucywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0ljb25zKSxcblx0XHRcdHNob3dTdGF0dXNCYXI6IGJvb2xlYW4oaW5wdXQuc2hvd1N0YXR1c0JhciwgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd1N0YXR1c0JhciksXG5cdFx0XHRwcmV2aWV3OiBib29sZWFuKGlucHV0LnByZXZpZXcsIHRoaXMuZGVmYXVsdFZhbHVlLnByZXZpZXcpLFxuXHRcdFx0cHJldmlld01vZGU6IHN0cmluZ1NldChpbnB1dC5wcmV2aWV3TW9kZSwgdGhpcy5kZWZhdWx0VmFsdWUucHJldmlld01vZGUsIFsncHJlZml4JywgJ3N1YndvcmQnLCAnc3Vid29yZFNtYXJ0J10pLFxuXHRcdFx0c2hvd0lubGluZURldGFpbHM6IGJvb2xlYW4oaW5wdXQuc2hvd0lubGluZURldGFpbHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dJbmxpbmVEZXRhaWxzKSxcblx0XHRcdGZpdFdpZHRoVG9EZXRhaWxzOiBib29sZWFuKGlucHV0LmZpdFdpZHRoVG9EZXRhaWxzLCB0aGlzLmRlZmF1bHRWYWx1ZS5maXRXaWR0aFRvRGV0YWlscyksXG5cdFx0XHRzaG93TWV0aG9kczogYm9vbGVhbihpbnB1dC5zaG93TWV0aG9kcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd01ldGhvZHMpLFxuXHRcdFx0c2hvd0Z1bmN0aW9uczogYm9vbGVhbihpbnB1dC5zaG93RnVuY3Rpb25zLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93RnVuY3Rpb25zKSxcblx0XHRcdHNob3dDb25zdHJ1Y3RvcnM6IGJvb2xlYW4oaW5wdXQuc2hvd0NvbnN0cnVjdG9ycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0NvbnN0cnVjdG9ycyksXG5cdFx0XHRzaG93RGVwcmVjYXRlZDogYm9vbGVhbihpbnB1dC5zaG93RGVwcmVjYXRlZCwgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0RlcHJlY2F0ZWQpLFxuXHRcdFx0bWF0Y2hPbldvcmRTdGFydE9ubHk6IGJvb2xlYW4oaW5wdXQubWF0Y2hPbldvcmRTdGFydE9ubHksIHRoaXMuZGVmYXVsdFZhbHVlLm1hdGNoT25Xb3JkU3RhcnRPbmx5KSxcblx0XHRcdHNob3dGaWVsZHM6IGJvb2xlYW4oaW5wdXQuc2hvd0ZpZWxkcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0ZpZWxkcyksXG5cdFx0XHRzaG93VmFyaWFibGVzOiBib29sZWFuKGlucHV0LnNob3dWYXJpYWJsZXMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dWYXJpYWJsZXMpLFxuXHRcdFx0c2hvd0NsYXNzZXM6IGJvb2xlYW4oaW5wdXQuc2hvd0NsYXNzZXMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dDbGFzc2VzKSxcblx0XHRcdHNob3dTdHJ1Y3RzOiBib29sZWFuKGlucHV0LnNob3dTdHJ1Y3RzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93U3RydWN0cyksXG5cdFx0XHRzaG93SW50ZXJmYWNlczogYm9vbGVhbihpbnB1dC5zaG93SW50ZXJmYWNlcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0ludGVyZmFjZXMpLFxuXHRcdFx0c2hvd01vZHVsZXM6IGJvb2xlYW4oaW5wdXQuc2hvd01vZHVsZXMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dNb2R1bGVzKSxcblx0XHRcdHNob3dQcm9wZXJ0aWVzOiBib29sZWFuKGlucHV0LnNob3dQcm9wZXJ0aWVzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93UHJvcGVydGllcyksXG5cdFx0XHRzaG93RXZlbnRzOiBib29sZWFuKGlucHV0LnNob3dFdmVudHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dFdmVudHMpLFxuXHRcdFx0c2hvd09wZXJhdG9yczogYm9vbGVhbihpbnB1dC5zaG93T3BlcmF0b3JzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93T3BlcmF0b3JzKSxcblx0XHRcdHNob3dVbml0czogYm9vbGVhbihpbnB1dC5zaG93VW5pdHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dVbml0cyksXG5cdFx0XHRzaG93VmFsdWVzOiBib29sZWFuKGlucHV0LnNob3dWYWx1ZXMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dWYWx1ZXMpLFxuXHRcdFx0c2hvd0NvbnN0YW50czogYm9vbGVhbihpbnB1dC5zaG93Q29uc3RhbnRzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93Q29uc3RhbnRzKSxcblx0XHRcdHNob3dFbnVtczogYm9vbGVhbihpbnB1dC5zaG93RW51bXMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dFbnVtcyksXG5cdFx0XHRzaG93RW51bU1lbWJlcnM6IGJvb2xlYW4oaW5wdXQuc2hvd0VudW1NZW1iZXJzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93RW51bU1lbWJlcnMpLFxuXHRcdFx0c2hvd0tleXdvcmRzOiBib29sZWFuKGlucHV0LnNob3dLZXl3b3JkcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0tleXdvcmRzKSxcblx0XHRcdHNob3dXb3JkczogYm9vbGVhbihpbnB1dC5zaG93V29yZHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dXb3JkcyksXG5cdFx0XHRzaG93Q29sb3JzOiBib29sZWFuKGlucHV0LnNob3dDb2xvcnMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dDb2xvcnMpLFxuXHRcdFx0c2hvd0ZpbGVzOiBib29sZWFuKGlucHV0LnNob3dGaWxlcywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0ZpbGVzKSxcblx0XHRcdHNob3dSZWZlcmVuY2VzOiBib29sZWFuKGlucHV0LnNob3dSZWZlcmVuY2VzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93UmVmZXJlbmNlcyksXG5cdFx0XHRzaG93Rm9sZGVyczogYm9vbGVhbihpbnB1dC5zaG93Rm9sZGVycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0ZvbGRlcnMpLFxuXHRcdFx0c2hvd1R5cGVQYXJhbWV0ZXJzOiBib29sZWFuKGlucHV0LnNob3dUeXBlUGFyYW1ldGVycywgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd1R5cGVQYXJhbWV0ZXJzKSxcblx0XHRcdHNob3dTbmlwcGV0czogYm9vbGVhbihpbnB1dC5zaG93U25pcHBldHMsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dTbmlwcGV0cyksXG5cdFx0XHRzaG93VXNlcnM6IGJvb2xlYW4oaW5wdXQuc2hvd1VzZXJzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93VXNlcnMpLFxuXHRcdFx0c2hvd0lzc3VlczogYm9vbGVhbihpbnB1dC5zaG93SXNzdWVzLCB0aGlzLmRlZmF1bHRWYWx1ZS5zaG93SXNzdWVzKSxcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gc21hcnQgc2VsZWN0XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNtYXJ0U2VsZWN0T3B0aW9ucyB7XG5cdHNlbGVjdExlYWRpbmdBbmRUcmFpbGluZ1doaXRlc3BhY2U/OiBib29sZWFuO1xuXHRzZWxlY3RTdWJ3b3Jkcz86IGJvb2xlYW47XG59XG5cbi8qKlxuICogQGludGVybmFsXG4gKi9cbmV4cG9ydCB0eXBlIFNtYXJ0U2VsZWN0T3B0aW9ucyA9IFJlYWRvbmx5PFJlcXVpcmVkPElTbWFydFNlbGVjdE9wdGlvbnM+PjtcblxuY2xhc3MgU21hcnRTZWxlY3QgZXh0ZW5kcyBCYXNlRWRpdG9yT3B0aW9uPEVkaXRvck9wdGlvbi5zbWFydFNlbGVjdCwgSVNtYXJ0U2VsZWN0T3B0aW9ucywgU21hcnRTZWxlY3RPcHRpb25zPiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoXG5cdFx0XHRFZGl0b3JPcHRpb24uc21hcnRTZWxlY3QsICdzbWFydFNlbGVjdCcsXG5cdFx0XHR7XG5cdFx0XHRcdHNlbGVjdExlYWRpbmdBbmRUcmFpbGluZ1doaXRlc3BhY2U6IHRydWUsXG5cdFx0XHRcdHNlbGVjdFN1YndvcmRzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5zbWFydFNlbGVjdC5zZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlJzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlbGVjdExlYWRpbmdBbmRUcmFpbGluZ1doaXRlc3BhY2UnLCBcIldoZXRoZXIgbGVhZGluZyBhbmQgdHJhaWxpbmcgd2hpdGVzcGFjZSBzaG91bGQgYWx3YXlzIGJlIHNlbGVjdGVkLlwiKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnNtYXJ0U2VsZWN0LnNlbGVjdFN1YndvcmRzJzoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlbGVjdFN1YndvcmRzJywgXCJXaGV0aGVyIHN1YndvcmRzIChsaWtlICdmb28nIGluICdmb29CYXInIG9yICdmb29fYmFyJykgc2hvdWxkIGJlIHNlbGVjdGVkLlwiKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFJlYWRvbmx5PFJlcXVpcmVkPElTbWFydFNlbGVjdE9wdGlvbnM+PiB7XG5cdFx0aWYgKCFpbnB1dCB8fCB0eXBlb2YgaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRzZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlOiBib29sZWFuKChpbnB1dCBhcyBJU21hcnRTZWxlY3RPcHRpb25zKS5zZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlLCB0aGlzLmRlZmF1bHRWYWx1ZS5zZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlKSxcblx0XHRcdHNlbGVjdFN1YndvcmRzOiBib29sZWFuKChpbnB1dCBhcyBJU21hcnRTZWxlY3RPcHRpb25zKS5zZWxlY3RTdWJ3b3JkcywgdGhpcy5kZWZhdWx0VmFsdWUuc2VsZWN0U3Vid29yZHMpLFxuXHRcdH07XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiB3b3JkU2VnbWVudGVyTG9jYWxlc1xuXG4vKipcbiAqIExvY2FsZXMgdXNlZCBmb3Igc2VnbWVudGluZyBsaW5lcyBpbnRvIHdvcmRzIHdoZW4gZG9pbmcgd29yZCByZWxhdGVkIG5hdmlnYXRpb25zIG9yIG9wZXJhdGlvbnMuXG4gKlxuICogU3BlY2lmeSB0aGUgQkNQIDQ3IGxhbmd1YWdlIHRhZyBvZiB0aGUgd29yZCB5b3Ugd2lzaCB0byByZWNvZ25pemUgKGUuZy4sIGphLCB6aC1DTiwgemgtSGFudC1UVywgZXRjLikuXG4gKi9cbmNsYXNzIFdvcmRTZWdtZW50ZXJMb2NhbGVzIGV4dGVuZHMgQmFzZUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ud29yZFNlZ21lbnRlckxvY2FsZXMsIHN0cmluZyB8IHN0cmluZ1tdLCBzdHJpbmdbXT4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogc3RyaW5nW10gPSBbXTtcblxuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLndvcmRTZWdtZW50ZXJMb2NhbGVzLCAnd29yZFNlZ21lbnRlckxvY2FsZXMnLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3dvcmRTZWdtZW50ZXJMb2NhbGVzJywgXCJMb2NhbGVzIHRvIGJlIHVzZWQgZm9yIHdvcmQgc2VnbWVudGF0aW9uIHdoZW4gZG9pbmcgd29yZCByZWxhdGVkIG5hdmlnYXRpb25zIG9yIG9wZXJhdGlvbnMuIFNwZWNpZnkgdGhlIEJDUCA0NyBsYW5ndWFnZSB0YWcgb2YgdGhlIHdvcmQgeW91IHdpc2ggdG8gcmVjb2duaXplIChlLmcuLCBqYSwgemgtQ04sIHpoLUhhbnQtVFcsIGV0Yy4pLlwiKSxcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoaW5wdXQ6IHVua25vd24pOiBzdHJpbmdbXSB7XG5cdFx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGlucHV0ID0gW2lucHV0XTtcblx0XHR9XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpKSB7XG5cdFx0XHRjb25zdCB2YWxpZExvY2FsZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGxvY2FsZSBvZiBpbnB1dCkge1xuXHRcdFx0XHRpZiAodHlwZW9mIGxvY2FsZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aWYgKEludGwuU2VnbWVudGVyLnN1cHBvcnRlZExvY2FsZXNPZihsb2NhbGUpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0dmFsaWRMb2NhbGVzLnB1c2gobG9jYWxlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdC8vIGlnbm9yZSBpbnZhbGlkIGxvY2FsZXNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWxpZExvY2FsZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGVmYXVsdFZhbHVlO1xuXHR9XG59XG5cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiB3cmFwcGluZ0luZGVudFxuXG4vKipcbiAqIERlc2NyaWJlcyBob3cgdG8gaW5kZW50IHdyYXBwZWQgbGluZXMuXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIFdyYXBwaW5nSW5kZW50IHtcblx0LyoqXG5cdCAqIE5vIGluZGVudGF0aW9uID0+IHdyYXBwZWQgbGluZXMgYmVnaW4gYXQgY29sdW1uIDEuXG5cdCAqL1xuXHROb25lID0gMCxcblx0LyoqXG5cdCAqIFNhbWUgPT4gd3JhcHBlZCBsaW5lcyBnZXQgdGhlIHNhbWUgaW5kZW50YXRpb24gYXMgdGhlIHBhcmVudC5cblx0ICovXG5cdFNhbWUgPSAxLFxuXHQvKipcblx0ICogSW5kZW50ID0+IHdyYXBwZWQgbGluZXMgZ2V0ICsxIGluZGVudGF0aW9uIHRvd2FyZCB0aGUgcGFyZW50LlxuXHQgKi9cblx0SW5kZW50ID0gMixcblx0LyoqXG5cdCAqIERlZXBJbmRlbnQgPT4gd3JhcHBlZCBsaW5lcyBnZXQgKzIgaW5kZW50YXRpb24gdG93YXJkIHRoZSBwYXJlbnQuXG5cdCAqL1xuXHREZWVwSW5kZW50ID0gM1xufVxuXG5jbGFzcyBXcmFwcGluZ0luZGVudE9wdGlvbiBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLndyYXBwaW5nSW5kZW50LCAnbm9uZScgfCAnc2FtZScgfCAnaW5kZW50JyB8ICdkZWVwSW5kZW50JywgV3JhcHBpbmdJbmRlbnQ+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmRlbnQsICd3cmFwcGluZ0luZGVudCcsIFdyYXBwaW5nSW5kZW50LlNhbWUsXG5cdFx0XHR7XG5cdFx0XHRcdCdlZGl0b3Iud3JhcHBpbmdJbmRlbnQnOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydub25lJywgJ3NhbWUnLCAnaW5kZW50JywgJ2RlZXBJbmRlbnQnXSxcblx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3dyYXBwaW5nSW5kZW50Lm5vbmUnLCBcIk5vIGluZGVudGF0aW9uLiBXcmFwcGVkIGxpbmVzIGJlZ2luIGF0IGNvbHVtbiAxLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnd3JhcHBpbmdJbmRlbnQuc2FtZScsIFwiV3JhcHBlZCBsaW5lcyBnZXQgdGhlIHNhbWUgaW5kZW50YXRpb24gYXMgdGhlIHBhcmVudC5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3dyYXBwaW5nSW5kZW50LmluZGVudCcsIFwiV3JhcHBlZCBsaW5lcyBnZXQgKzEgaW5kZW50YXRpb24gdG93YXJkIHRoZSBwYXJlbnQuXCIpLFxuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCd3cmFwcGluZ0luZGVudC5kZWVwSW5kZW50JywgXCJXcmFwcGVkIGxpbmVzIGdldCArMiBpbmRlbnRhdGlvbiB0b3dhcmQgdGhlIHBhcmVudC5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3cmFwcGluZ0luZGVudCcsIFwiQ29udHJvbHMgdGhlIGluZGVudGF0aW9uIG9mIHdyYXBwZWQgbGluZXMuXCIpLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICdzYW1lJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShpbnB1dDogdW5rbm93bik6IFdyYXBwaW5nSW5kZW50IHtcblx0XHRzd2l0Y2ggKGlucHV0KSB7XG5cdFx0XHRjYXNlICdub25lJzogcmV0dXJuIFdyYXBwaW5nSW5kZW50Lk5vbmU7XG5cdFx0XHRjYXNlICdzYW1lJzogcmV0dXJuIFdyYXBwaW5nSW5kZW50LlNhbWU7XG5cdFx0XHRjYXNlICdpbmRlbnQnOiByZXR1cm4gV3JhcHBpbmdJbmRlbnQuSW5kZW50O1xuXHRcdFx0Y2FzZSAnZGVlcEluZGVudCc6IHJldHVybiBXcmFwcGluZ0luZGVudC5EZWVwSW5kZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gV3JhcHBpbmdJbmRlbnQuU2FtZTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBjb21wdXRlKGVudjogSUVudmlyb25tZW50YWxPcHRpb25zLCBvcHRpb25zOiBJQ29tcHV0ZWRFZGl0b3JPcHRpb25zLCB2YWx1ZTogV3JhcHBpbmdJbmRlbnQpOiBXcmFwcGluZ0luZGVudCB7XG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVN1cHBvcnQgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQpO1xuXHRcdGlmIChhY2Nlc3NpYmlsaXR5U3VwcG9ydCA9PT0gQWNjZXNzaWJpbGl0eVN1cHBvcnQuRW5hYmxlZCkge1xuXHRcdFx0Ly8gaWYgd2Uga25vdyBmb3IgYSBmYWN0IHRoYXQgYSBzY3JlZW4gcmVhZGVyIGlzIGF0dGFjaGVkLCB3ZSB1c2Ugbm8gaW5kZW50IHdyYXBwaW5nIHRvXG5cdFx0XHQvLyBoZWxwIHRoYXQgdGhlIGVkaXRvcidzIHdyYXBwaW5nIHBvaW50cyBtYXRjaCB0aGUgdGV4dGFyZWEncyB3cmFwcGluZyBwb2ludHNcblx0XHRcdHJldHVybiBXcmFwcGluZ0luZGVudC5Ob25lO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiB3cmFwcGluZ0luZm9cblxuZXhwb3J0IGludGVyZmFjZSBFZGl0b3JXcmFwcGluZ0luZm8ge1xuXHRyZWFkb25seSBpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzOiBib29sZWFuO1xuXHRyZWFkb25seSBpc1dvcmRXcmFwTWluaWZpZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVmlld3BvcnRXcmFwcGluZzogYm9vbGVhbjtcblx0cmVhZG9ubHkgd3JhcHBpbmdDb2x1bW46IG51bWJlcjtcbn1cblxuY2xhc3MgRWRpdG9yV3JhcHBpbmdJbmZvQ29tcHV0ZXIgZXh0ZW5kcyBDb21wdXRlZEVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvLCBFZGl0b3JXcmFwcGluZ0luZm8+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcihFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmZvLCB7XG5cdFx0XHRpc0RvbWluYXRlZEJ5TG9uZ0xpbmVzOiBmYWxzZSxcblx0XHRcdGlzV29yZFdyYXBNaW5pZmllZDogZmFsc2UsXG5cdFx0XHRpc1ZpZXdwb3J0V3JhcHBpbmc6IGZhbHNlLFxuXHRcdFx0d3JhcHBpbmdDb2x1bW46IC0xXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgY29tcHV0ZShlbnY6IElFbnZpcm9ubWVudGFsT3B0aW9ucywgb3B0aW9uczogSUNvbXB1dGVkRWRpdG9yT3B0aW9ucywgXzogRWRpdG9yV3JhcHBpbmdJbmZvKTogRWRpdG9yV3JhcHBpbmdJbmZvIHtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzRG9taW5hdGVkQnlMb25nTGluZXM6IGVudi5pc0RvbWluYXRlZEJ5TG9uZ0xpbmVzLFxuXHRcdFx0aXNXb3JkV3JhcE1pbmlmaWVkOiBsYXlvdXRJbmZvLmlzV29yZFdyYXBNaW5pZmllZCxcblx0XHRcdGlzVmlld3BvcnRXcmFwcGluZzogbGF5b3V0SW5mby5pc1ZpZXdwb3J0V3JhcHBpbmcsXG5cdFx0XHR3cmFwcGluZ0NvbHVtbjogbGF5b3V0SW5mby53cmFwcGluZ0NvbHVtbixcblx0XHR9O1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vLyNyZWdpb24gZHJvcEludG9FZGl0b3JcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBkcm9wIGludG8gYmVoYXZpb3JcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRHJvcEludG9FZGl0b3JPcHRpb25zIHtcblx0LyoqXG5cdCAqIEVuYWJsZSBkcm9wcGluZyBpbnRvIGVkaXRvci5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGVuYWJsZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyBpZiBhIHdpZGdldCBpcyBzaG93biBhZnRlciBhIGRyb3AuXG5cdCAqIERlZmF1bHRzIHRvICdhZnRlckRyb3AnLlxuXHQgKi9cblx0c2hvd0Ryb3BTZWxlY3Rvcj86ICdhZnRlckRyb3AnIHwgJ25ldmVyJztcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgRWRpdG9yRHJvcEludG9FZGl0b3JPcHRpb25zID0gUmVhZG9ubHk8UmVxdWlyZWQ8SURyb3BJbnRvRWRpdG9yT3B0aW9ucz4+O1xuXG5jbGFzcyBFZGl0b3JEcm9wSW50b0VkaXRvciBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLmRyb3BJbnRvRWRpdG9yLCBJRHJvcEludG9FZGl0b3JPcHRpb25zLCBFZGl0b3JEcm9wSW50b0VkaXRvck9wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogRWRpdG9yRHJvcEludG9FZGl0b3JPcHRpb25zID0geyBlbmFibGVkOiB0cnVlLCBzaG93RHJvcFNlbGVjdG9yOiAnYWZ0ZXJEcm9wJyB9O1xuXHRcdHN1cGVyKFxuXHRcdFx0RWRpdG9yT3B0aW9uLmRyb3BJbnRvRWRpdG9yLCAnZHJvcEludG9FZGl0b3InLCBkZWZhdWx0cyxcblx0XHRcdHtcblx0XHRcdFx0J2VkaXRvci5kcm9wSW50b0VkaXRvci5lbmFibGVkJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBkZWZhdWx0cy5lbmFibGVkLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZHJvcEludG9FZGl0b3IuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB5b3UgY2FuIGRyYWcgYW5kIGRyb3AgYSBmaWxlIGludG8gYSB0ZXh0IGVkaXRvciBieSBob2xkaW5nIGRvd24gdGhlIGBTaGlmdGAga2V5IChpbnN0ZWFkIG9mIG9wZW5pbmcgdGhlIGZpbGUgaW4gYW4gZWRpdG9yKS5cIiksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdlZGl0b3IuZHJvcEludG9FZGl0b3Iuc2hvd0Ryb3BTZWxlY3Rvcic6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2Ryb3BJbnRvRWRpdG9yLnNob3dEcm9wU2VsZWN0b3InLCBcIkNvbnRyb2xzIGlmIGEgd2lkZ2V0IGlzIHNob3duIHdoZW4gZHJvcHBpbmcgZmlsZXMgaW50byB0aGUgZWRpdG9yLiBUaGlzIHdpZGdldCBsZXRzIHlvdSBjb250cm9sIGhvdyB0aGUgZmlsZSBpcyBkcm9wcGVkLlwiKSxcblx0XHRcdFx0XHRlbnVtOiBbXG5cdFx0XHRcdFx0XHQnYWZ0ZXJEcm9wJyxcblx0XHRcdFx0XHRcdCduZXZlcidcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnZHJvcEludG9FZGl0b3Iuc2hvd0Ryb3BTZWxlY3Rvci5hZnRlckRyb3AnLCBcIlNob3cgdGhlIGRyb3Agc2VsZWN0b3Igd2lkZ2V0IGFmdGVyIGEgZmlsZSBpcyBkcm9wcGVkIGludG8gdGhlIGVkaXRvci5cIiksXG5cdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2Ryb3BJbnRvRWRpdG9yLnNob3dEcm9wU2VsZWN0b3IubmV2ZXInLCBcIk5ldmVyIHNob3cgdGhlIGRyb3Agc2VsZWN0b3Igd2lkZ2V0LiBJbnN0ZWFkIHRoZSBkZWZhdWx0IGRyb3AgcHJvdmlkZXIgaXMgYWx3YXlzIHVzZWQuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ2FmdGVyRHJvcCcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZShfaW5wdXQ6IHVua25vd24pOiBFZGl0b3JEcm9wSW50b0VkaXRvck9wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SURyb3BJbnRvRWRpdG9yT3B0aW9ucz47XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVuYWJsZWQ6IGJvb2xlYW4oaW5wdXQuZW5hYmxlZCwgdGhpcy5kZWZhdWx0VmFsdWUuZW5hYmxlZCksXG5cdFx0XHRzaG93RHJvcFNlbGVjdG9yOiBzdHJpbmdTZXQoaW5wdXQuc2hvd0Ryb3BTZWxlY3RvciwgdGhpcy5kZWZhdWx0VmFsdWUuc2hvd0Ryb3BTZWxlY3RvciwgWydhZnRlckRyb3AnLCAnbmV2ZXInXSksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLy8jcmVnaW9uIHBhc3RlQXNcblxuLyoqXG4gKiBDb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGVkaXRvciBwYXN0aW5nIGFzIGludG8gYmVoYXZpb3JcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUGFzdGVBc09wdGlvbnMge1xuXHQvKipcblx0ICogRW5hYmxlIHBhc3RlIGFzIGZ1bmN0aW9uYWxpdHkgaW4gZWRpdG9ycy5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZS5cblx0ICovXG5cdGVuYWJsZWQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyBpZiBhIHdpZGdldCBpcyBzaG93biBhZnRlciBhIGRyb3AuXG5cdCAqIERlZmF1bHRzIHRvICdhZnRlclBhc3RlJy5cblx0ICovXG5cdHNob3dQYXN0ZVNlbGVjdG9yPzogJ2FmdGVyUGFzdGUnIHwgJ25ldmVyJztcbn1cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IHR5cGUgRWRpdG9yUGFzdGVBc09wdGlvbnMgPSBSZWFkb25seTxSZXF1aXJlZDxJUGFzdGVBc09wdGlvbnM+PjtcblxuY2xhc3MgRWRpdG9yUGFzdGVBcyBleHRlbmRzIEJhc2VFZGl0b3JPcHRpb248RWRpdG9yT3B0aW9uLnBhc3RlQXMsIElQYXN0ZUFzT3B0aW9ucywgRWRpdG9yUGFzdGVBc09wdGlvbnM+IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25zdCBkZWZhdWx0czogRWRpdG9yUGFzdGVBc09wdGlvbnMgPSB7IGVuYWJsZWQ6IHRydWUsIHNob3dQYXN0ZVNlbGVjdG9yOiAnYWZ0ZXJQYXN0ZScgfTtcblx0XHRzdXBlcihcblx0XHRcdEVkaXRvck9wdGlvbi5wYXN0ZUFzLCAncGFzdGVBcycsIGRlZmF1bHRzLFxuXHRcdFx0e1xuXHRcdFx0XHQnZWRpdG9yLnBhc3RlQXMuZW5hYmxlZCc6IHtcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZGVmYXVsdHMuZW5hYmxlZCxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Bhc3RlQXMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB5b3UgY2FuIHBhc3RlIGNvbnRlbnQgaW4gZGlmZmVyZW50IHdheXMuXCIpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnZWRpdG9yLnBhc3RlQXMuc2hvd1Bhc3RlU2VsZWN0b3InOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdwYXN0ZUFzLnNob3dQYXN0ZVNlbGVjdG9yJywgXCJDb250cm9scyBpZiBhIHdpZGdldCBpcyBzaG93biB3aGVuIHBhc3RpbmcgY29udGVudCBpbiB0byB0aGUgZWRpdG9yLiBUaGlzIHdpZGdldCBsZXRzIHlvdSBjb250cm9sIGhvdyB0aGUgZmlsZSBpcyBwYXN0ZWQuXCIpLFxuXHRcdFx0XHRcdGVudW06IFtcblx0XHRcdFx0XHRcdCdhZnRlclBhc3RlJyxcblx0XHRcdFx0XHRcdCduZXZlcidcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgncGFzdGVBcy5zaG93UGFzdGVTZWxlY3Rvci5hZnRlclBhc3RlJywgXCJTaG93IHRoZSBwYXN0ZSBzZWxlY3RvciB3aWRnZXQgYWZ0ZXIgY29udGVudCBpcyBwYXN0ZWQgaW50byB0aGUgZWRpdG9yLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgncGFzdGVBcy5zaG93UGFzdGVTZWxlY3Rvci5uZXZlcicsIFwiTmV2ZXIgc2hvdyB0aGUgcGFzdGUgc2VsZWN0b3Igd2lkZ2V0LiBJbnN0ZWFkIHRoZSBkZWZhdWx0IHBhc3RpbmcgYmVoYXZpb3IgaXMgYWx3YXlzIHVzZWQuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ2FmdGVyUGFzdGUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdCk7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGUoX2lucHV0OiB1bmtub3duKTogRWRpdG9yUGFzdGVBc09wdGlvbnMge1xuXHRcdGlmICghX2lucHV0IHx8IHR5cGVvZiBfaW5wdXQgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kZWZhdWx0VmFsdWU7XG5cdFx0fVxuXHRcdGNvbnN0IGlucHV0ID0gX2lucHV0IGFzIFVua25vd248SVBhc3RlQXNPcHRpb25zPjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlZDogYm9vbGVhbihpbnB1dC5lbmFibGVkLCB0aGlzLmRlZmF1bHRWYWx1ZS5lbmFibGVkKSxcblx0XHRcdHNob3dQYXN0ZVNlbGVjdG9yOiBzdHJpbmdTZXQoaW5wdXQuc2hvd1Bhc3RlU2VsZWN0b3IsIHRoaXMuZGVmYXVsdFZhbHVlLnNob3dQYXN0ZVNlbGVjdG9yLCBbJ2FmdGVyUGFzdGUnLCAnbmV2ZXInXSksXG5cdFx0fTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuLyoqXG4gKiBAaW50ZXJuYWxcbiAqL1xuZXhwb3J0IGNvbnN0IGVkaXRvck9wdGlvbnNSZWdpc3RyeTogSUVkaXRvck9wdGlvbjxFZGl0b3JPcHRpb24sIHVua25vd24+W10gPSBbXTtcblxuZnVuY3Rpb24gcmVnaXN0ZXI8SyBleHRlbmRzIEVkaXRvck9wdGlvbiwgVj4ob3B0aW9uOiBJRWRpdG9yT3B0aW9uPEssIFY+KTogSUVkaXRvck9wdGlvbjxLLCBWPiB7XG5cdGVkaXRvck9wdGlvbnNSZWdpc3RyeVtvcHRpb24uaWRdID0gb3B0aW9uO1xuXHRyZXR1cm4gb3B0aW9uO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBFZGl0b3JPcHRpb24ge1xuXHRhY2NlcHRTdWdnZXN0aW9uT25Db21taXRDaGFyYWN0ZXIsXG5cdGFjY2VwdFN1Z2dlc3Rpb25PbkVudGVyLFxuXHRhY2Nlc3NpYmlsaXR5U3VwcG9ydCxcblx0YWNjZXNzaWJpbGl0eVBhZ2VTaXplLFxuXHRhbGxvd092ZXJmbG93LFxuXHRhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMsXG5cdGFsbG93VmFyaWFibGVGb250cyxcblx0YWxsb3dWYXJpYWJsZUZvbnRzSW5BY2Nlc3NpYmlsaXR5TW9kZSxcblx0YXJpYUxhYmVsLFxuXHRhcmlhUmVxdWlyZWQsXG5cdGF1dG9DbG9zaW5nQnJhY2tldHMsXG5cdGF1dG9DbG9zaW5nQ29tbWVudHMsXG5cdHNjcmVlblJlYWRlckFubm91bmNlSW5saW5lU3VnZ2VzdGlvbixcblx0YXV0b0Nsb3NpbmdEZWxldGUsXG5cdGF1dG9DbG9zaW5nT3ZlcnR5cGUsXG5cdGF1dG9DbG9zaW5nUXVvdGVzLFxuXHRhdXRvSW5kZW50LFxuXHRhdXRvSW5kZW50T25QYXN0ZSxcblx0YXV0b0luZGVudE9uUGFzdGVXaXRoaW5TdHJpbmcsXG5cdGF1dG9tYXRpY0xheW91dCxcblx0YXV0b1N1cnJvdW5kLFxuXHRicmFja2V0UGFpckNvbG9yaXphdGlvbixcblx0Z3VpZGVzLFxuXHRjb2RlTGVucyxcblx0Y29kZUxlbnNGb250RmFtaWx5LFxuXHRjb2RlTGVuc0ZvbnRTaXplLFxuXHRjb2xvckRlY29yYXRvcnMsXG5cdGNvbG9yRGVjb3JhdG9yc0xpbWl0LFxuXHRjb2x1bW5TZWxlY3Rpb24sXG5cdGNvbW1lbnRzLFxuXHRjb250ZXh0bWVudSxcblx0Y29weVdpdGhTeW50YXhIaWdobGlnaHRpbmcsXG5cdGN1cnNvckJsaW5raW5nLFxuXHRjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbixcblx0Y3Vyc29yU3R5bGUsXG5cdGN1cnNvclN1cnJvdW5kaW5nTGluZXMsXG5cdGN1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZSxcblx0Y3Vyc29yV2lkdGgsXG5cdGN1cnNvckhlaWdodCxcblx0ZGlzYWJsZUxheWVySGludGluZyxcblx0ZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMsXG5cdGRvbVJlYWRPbmx5LFxuXHRkcmFnQW5kRHJvcCxcblx0ZHJvcEludG9FZGl0b3IsXG5cdGVkaXRDb250ZXh0LFxuXHRlbXB0eVNlbGVjdGlvbkNsaXBib2FyZCxcblx0ZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uLFxuXHRleHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nLFxuXHRleHRyYUVkaXRvckNsYXNzTmFtZSxcblx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5LFxuXHRmaW5kLFxuXHRmaXhlZE92ZXJmbG93V2lkZ2V0cyxcblx0Zm9sZGluZyxcblx0Zm9sZGluZ1N0cmF0ZWd5LFxuXHRmb2xkaW5nSGlnaGxpZ2h0LFxuXHRmb2xkaW5nSW1wb3J0c0J5RGVmYXVsdCxcblx0Zm9sZGluZ01heGltdW1SZWdpb25zLFxuXHR1bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUsXG5cdGZvbnRGYW1pbHksXG5cdGZvbnRJbmZvLFxuXHRmb250TGlnYXR1cmVzLFxuXHRmb250U2l6ZSxcblx0Zm9udFdlaWdodCxcblx0Zm9udFZhcmlhdGlvbnMsXG5cdGZvcm1hdE9uUGFzdGUsXG5cdGZvcm1hdE9uVHlwZSxcblx0Z2x5cGhNYXJnaW4sXG5cdGdvdG9Mb2NhdGlvbixcblx0aGlkZUN1cnNvckluT3ZlcnZpZXdSdWxlcixcblx0aG92ZXIsXG5cdGluRGlmZkVkaXRvcixcblx0aW5saW5lU3VnZ2VzdCxcblx0bGV0dGVyU3BhY2luZyxcblx0bGlnaHRidWxiLFxuXHRsaW5lRGVjb3JhdGlvbnNXaWR0aCxcblx0bGluZUhlaWdodCxcblx0bGluZU51bWJlcnMsXG5cdGxpbmVOdW1iZXJzTWluQ2hhcnMsXG5cdGxpbmtlZEVkaXRpbmcsXG5cdGxpbmtzLFxuXHRtYXRjaEJyYWNrZXRzLFxuXHRtaW5pbWFwLFxuXHRtb3VzZVN0eWxlLFxuXHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHksXG5cdG1vdXNlV2hlZWxab29tLFxuXHRtdWx0aUN1cnNvck1lcmdlT3ZlcmxhcHBpbmcsXG5cdG11bHRpQ3Vyc29yTW9kaWZpZXIsXG5cdG1vdXNlTWlkZGxlQ2xpY2tBY3Rpb24sXG5cdG11bHRpQ3Vyc29yUGFzdGUsXG5cdG11bHRpQ3Vyc29yTGltaXQsXG5cdG9jY3VycmVuY2VzSGlnaGxpZ2h0LFxuXHRvY2N1cnJlbmNlc0hpZ2hsaWdodERlbGF5LFxuXHRvdmVydHlwZUN1cnNvclN0eWxlLFxuXHRvdmVydHlwZU9uUGFzdGUsXG5cdG92ZXJ2aWV3UnVsZXJCb3JkZXIsXG5cdG92ZXJ2aWV3UnVsZXJMYW5lcyxcblx0cGFkZGluZyxcblx0cGFzdGVBcyxcblx0cGFyYW1ldGVySGludHMsXG5cdHBlZWtXaWRnZXREZWZhdWx0Rm9jdXMsXG5cdHBsYWNlaG9sZGVyLFxuXHRkZWZpbml0aW9uTGlua09wZW5zSW5QZWVrLFxuXHRxdWlja1N1Z2dlc3Rpb25zLFxuXHRxdWlja1N1Z2dlc3Rpb25zRGVsYXksXG5cdHJlYWRPbmx5LFxuXHRyZWFkT25seU1lc3NhZ2UsXG5cdHJlbmFtZU9uVHlwZSxcblx0cmVuZGVyUmljaFNjcmVlblJlYWRlckNvbnRlbnQsXG5cdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzLFxuXHRyZW5kZXJGaW5hbE5ld2xpbmUsXG5cdHJlbmRlckxpbmVIaWdobGlnaHQsXG5cdHJlbmRlckxpbmVIaWdobGlnaHRPbmx5V2hlbkZvY3VzLFxuXHRyZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMsXG5cdHJlbmRlcldoaXRlc3BhY2UsXG5cdHJldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmcsXG5cdHJvdW5kZWRTZWxlY3Rpb24sXG5cdHJ1bGVycyxcblx0c2Nyb2xsYmFyLFxuXHRzY3JvbGxCZXlvbmRMYXN0Q29sdW1uLFxuXHRzY3JvbGxCZXlvbmRMYXN0TGluZSxcblx0c2Nyb2xsUHJlZG9taW5hbnRBeGlzLFxuXHRzZWxlY3Rpb25DbGlwYm9hcmQsXG5cdHNlbGVjdGlvbkhpZ2hsaWdodCxcblx0c2VsZWN0aW9uSGlnaGxpZ2h0TWF4TGVuZ3RoLFxuXHRzZWxlY3Rpb25IaWdobGlnaHRNdWx0aWxpbmUsXG5cdHNlbGVjdE9uTGluZU51bWJlcnMsXG5cdHNob3dGb2xkaW5nQ29udHJvbHMsXG5cdHNob3dVbnVzZWQsXG5cdHNuaXBwZXRTdWdnZXN0aW9ucyxcblx0c21hcnRTZWxlY3QsXG5cdHNtb290aFNjcm9sbGluZyxcblx0c3RpY2t5U2Nyb2xsLFxuXHRzdGlja3lUYWJTdG9wcyxcblx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcixcblx0c3VnZ2VzdCxcblx0c3VnZ2VzdEZvbnRTaXplLFxuXHRzdWdnZXN0TGluZUhlaWdodCxcblx0c3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnMsXG5cdHN1Z2dlc3RTZWxlY3Rpb24sXG5cdHRhYkNvbXBsZXRpb24sXG5cdHRhYkluZGV4LFxuXHR0cmltV2hpdGVzcGFjZU9uRGVsZXRlLFxuXHR1bmljb2RlSGlnaGxpZ2h0aW5nLFxuXHR1bnVzdWFsTGluZVRlcm1pbmF0b3JzLFxuXHR1c2VTaGFkb3dET00sXG5cdHVzZVRhYlN0b3BzLFxuXHR3b3JkQnJlYWssXG5cdHdvcmRTZWdtZW50ZXJMb2NhbGVzLFxuXHR3b3JkU2VwYXJhdG9ycyxcblx0d29yZFdyYXAsXG5cdHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMsXG5cdHdvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzLFxuXHR3b3JkV3JhcENvbHVtbixcblx0d29yZFdyYXBPdmVycmlkZTEsXG5cdHdvcmRXcmFwT3ZlcnJpZGUyLFxuXHR3cmFwcGluZ0luZGVudCxcblx0d3JhcHBpbmdTdHJhdGVneSxcblx0c2hvd0RlcHJlY2F0ZWQsXG5cdGluZXJ0aWFsU2Nyb2xsLFxuXHRpbmxheUhpbnRzLFxuXHR3cmFwT25Fc2NhcGVkTGluZUZlZWRzLFxuXHQvLyBMZWF2ZSB0aGVzZSBhdCB0aGUgZW5kIChiZWNhdXNlIHRoZXkgaGF2ZSBkZXBlbmRlbmNpZXMhKVxuXHRlZmZlY3RpdmVDdXJzb3JTdHlsZSxcblx0ZWRpdG9yQ2xhc3NOYW1lLFxuXHRwaXhlbFJhdGlvLFxuXHR0YWJGb2N1c01vZGUsXG5cdGxheW91dEluZm8sXG5cdHdyYXBwaW5nSW5mbyxcblx0ZGVmYXVsdENvbG9yRGVjb3JhdG9ycyxcblx0Y29sb3JEZWNvcmF0b3JzQWN0aXZhdGVkT24sXG5cdGlubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2UsXG5cdGVmZmVjdGl2ZUVkaXRDb250ZXh0LFxuXHRzY3JvbGxPbk1pZGRsZUNsaWNrLFxuXHRlZmZlY3RpdmVBbGxvd1ZhcmlhYmxlRm9udHMsXG5cdGRvdWJsZUNsaWNrU2VsZWN0c0Jsb2NrXG59XG5cbmV4cG9ydCBjb25zdCBFZGl0b3JPcHRpb25zID0ge1xuXHRhY2NlcHRTdWdnZXN0aW9uT25Db21taXRDaGFyYWN0ZXI6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hY2NlcHRTdWdnZXN0aW9uT25Db21taXRDaGFyYWN0ZXIsICdhY2NlcHRTdWdnZXN0aW9uT25Db21taXRDaGFyYWN0ZXInLCB0cnVlLFxuXHRcdHsgbWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhY2NlcHRTdWdnZXN0aW9uT25Db21taXRDaGFyYWN0ZXInLCBcIkNvbnRyb2xzIHdoZXRoZXIgc3VnZ2VzdGlvbnMgc2hvdWxkIGJlIGFjY2VwdGVkIG9uIGNvbW1pdCBjaGFyYWN0ZXJzLiBGb3IgZXhhbXBsZSwgaW4gSmF2YVNjcmlwdCwgdGhlIHNlbWktY29sb24gKGA7YCkgY2FuIGJlIGEgY29tbWl0IGNoYXJhY3RlciB0aGF0IGFjY2VwdHMgYSBzdWdnZXN0aW9uIGFuZCB0eXBlcyB0aGF0IGNoYXJhY3Rlci5cIikgfVxuXHQpKSxcblx0YWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXI6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hY2NlcHRTdWdnZXN0aW9uT25FbnRlciwgJ2FjY2VwdFN1Z2dlc3Rpb25PbkVudGVyJyxcblx0XHQnb24nIGFzICdvbicgfCAnc21hcnQnIHwgJ29mZicsXG5cdFx0WydvbicsICdzbWFydCcsICdvZmYnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXJTbWFydCcsIFwiT25seSBhY2NlcHQgYSBzdWdnZXN0aW9uIHdpdGggYEVudGVyYCB3aGVuIGl0IG1ha2VzIGEgdGV4dHVhbCBjaGFuZ2UuXCIpLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWNjZXB0U3VnZ2VzdGlvbk9uRW50ZXInLCBcIkNvbnRyb2xzIHdoZXRoZXIgc3VnZ2VzdGlvbnMgc2hvdWxkIGJlIGFjY2VwdGVkIG9uIGBFbnRlcmAsIGluIGFkZGl0aW9uIHRvIGBUYWJgLiBIZWxwcyB0byBhdm9pZCBhbWJpZ3VpdHkgYmV0d2VlbiBpbnNlcnRpbmcgbmV3IGxpbmVzIG9yIGFjY2VwdGluZyBzdWdnZXN0aW9ucy5cIilcblx0XHR9XG5cdCkpLFxuXHRhY2Nlc3NpYmlsaXR5U3VwcG9ydDogcmVnaXN0ZXIobmV3IEVkaXRvckFjY2Vzc2liaWxpdHlTdXBwb3J0KCkpLFxuXHRhY2Nlc3NpYmlsaXR5UGFnZVNpemU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oRWRpdG9yT3B0aW9uLmFjY2Vzc2liaWxpdHlQYWdlU2l6ZSwgJ2FjY2Vzc2liaWxpdHlQYWdlU2l6ZScsIDUwMCwgMSwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eVBhZ2VTaXplJywgXCJDb250cm9scyB0aGUgbnVtYmVyIG9mIGxpbmVzIGluIHRoZSBlZGl0b3IgdGhhdCBjYW4gYmUgcmVhZCBvdXQgYnkgYSBzY3JlZW4gcmVhZGVyIGF0IG9uY2UuIFdoZW4gd2UgZGV0ZWN0IGEgc2NyZWVuIHJlYWRlciB3ZSBhdXRvbWF0aWNhbGx5IHNldCB0aGUgZGVmYXVsdCB0byBiZSA1MDAuIFdhcm5pbmc6IHRoaXMgaGFzIGEgcGVyZm9ybWFuY2UgaW1wbGljYXRpb24gZm9yIG51bWJlcnMgbGFyZ2VyIHRoYW4gdGhlIGRlZmF1bHQuXCIpLFxuXHRcdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9XG5cdCkpLFxuXHRhbGxvd092ZXJmbG93OiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYWxsb3dPdmVyZmxvdywgJ2FsbG93T3ZlcmZsb3cnLCB0cnVlLFxuXHQpKSxcblx0YWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzLCAnYWxsb3dWYXJpYWJsZUxpbmVIZWlnaHRzJywgdHJ1ZSxcblx0XHR7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbGxvd1ZhcmlhYmxlTGluZUhlaWdodHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gYWxsb3cgdXNpbmcgdmFyaWFibGUgbGluZSBoZWlnaHRzIGluIHRoZSBlZGl0b3IuXCIpXG5cdFx0fVxuXHQpKSxcblx0YWxsb3dWYXJpYWJsZUZvbnRzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYWxsb3dWYXJpYWJsZUZvbnRzLCAnYWxsb3dWYXJpYWJsZUZvbnRzJywgdHJ1ZSxcblx0XHR7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbGxvd1ZhcmlhYmxlRm9udHMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gYWxsb3cgdXNpbmcgdmFyaWFibGUgZm9udHMgaW4gdGhlIGVkaXRvci5cIilcblx0XHR9XG5cdCkpLFxuXHRhbGxvd1ZhcmlhYmxlRm9udHNJbkFjY2Vzc2liaWxpdHlNb2RlOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYWxsb3dWYXJpYWJsZUZvbnRzSW5BY2Nlc3NpYmlsaXR5TW9kZSwgJ2FsbG93VmFyaWFibGVGb250c0luQWNjZXNzaWJpbGl0eU1vZGUnLCBmYWxzZSxcblx0XHR7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhbGxvd1ZhcmlhYmxlRm9udHNJbkFjY2Vzc2liaWxpdHlNb2RlJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGFsbG93IHVzaW5nIHZhcmlhYmxlIGZvbnRzIGluIHRoZSBlZGl0b3IgaW4gdGhlIGFjY2Vzc2liaWxpdHkgbW9kZS5cIiksXG5cdFx0XHR0YWdzOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHRcdH1cblx0KSksXG5cdGFyaWFMYWJlbDogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ09wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXJpYUxhYmVsLCAnYXJpYUxhYmVsJywgbmxzLmxvY2FsaXplKCdlZGl0b3JWaWV3QWNjZXNzaWJsZUxhYmVsJywgXCJFZGl0b3IgY29udGVudFwiKVxuXHQpKSxcblx0YXJpYVJlcXVpcmVkOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXJpYVJlcXVpcmVkLCAnYXJpYVJlcXVpcmVkJywgZmFsc2UsIHVuZGVmaW5lZFxuXHQpKSxcblx0c2NyZWVuUmVhZGVyQW5ub3VuY2VJbmxpbmVTdWdnZXN0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2NyZWVuUmVhZGVyQW5ub3VuY2VJbmxpbmVTdWdnZXN0aW9uLCAnc2NyZWVuUmVhZGVyQW5ub3VuY2VJbmxpbmVTdWdnZXN0aW9uJywgdHJ1ZSxcblx0XHR7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY3JlZW5SZWFkZXJBbm5vdW5jZUlubGluZVN1Z2dlc3Rpb24nLCBcIkNvbnRyb2wgd2hldGhlciBpbmxpbmUgc3VnZ2VzdGlvbnMgYXJlIGFubm91bmNlZCBieSBhIHNjcmVlbiByZWFkZXIuXCIpLFxuXHRcdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9XG5cdCkpLFxuXHRhdXRvQ2xvc2luZ0JyYWNrZXRzOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdCcmFja2V0cywgJ2F1dG9DbG9zaW5nQnJhY2tldHMnLFxuXHRcdCdsYW5ndWFnZURlZmluZWQnIGFzICdhbHdheXMnIHwgJ2xhbmd1YWdlRGVmaW5lZCcgfCAnYmVmb3JlV2hpdGVzcGFjZScgfCAnbmV2ZXInLFxuXHRcdFsnYWx3YXlzJywgJ2xhbmd1YWdlRGVmaW5lZCcsICdiZWZvcmVXaGl0ZXNwYWNlJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0Nsb3NpbmdCcmFja2V0cy5sYW5ndWFnZURlZmluZWQnLCBcIlVzZSBsYW5ndWFnZSBjb25maWd1cmF0aW9ucyB0byBkZXRlcm1pbmUgd2hlbiB0byBhdXRvY2xvc2UgYnJhY2tldHMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvQ2xvc2luZ0JyYWNrZXRzLmJlZm9yZVdoaXRlc3BhY2UnLCBcIkF1dG9jbG9zZSBicmFja2V0cyBvbmx5IHdoZW4gdGhlIGN1cnNvciBpcyB0byB0aGUgbGVmdCBvZiB3aGl0ZXNwYWNlLlwiKSxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXV0b0Nsb3NpbmdCcmFja2V0cycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IGNsb3NlIGJyYWNrZXRzIGFmdGVyIHRoZSB1c2VyIGFkZHMgYW4gb3BlbmluZyBicmFja2V0LlwiKVxuXHRcdH1cblx0KSksXG5cdGF1dG9DbG9zaW5nQ29tbWVudHM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hdXRvQ2xvc2luZ0NvbW1lbnRzLCAnYXV0b0Nsb3NpbmdDb21tZW50cycsXG5cdFx0J2xhbmd1YWdlRGVmaW5lZCcgYXMgJ2Fsd2F5cycgfCAnbGFuZ3VhZ2VEZWZpbmVkJyB8ICdiZWZvcmVXaGl0ZXNwYWNlJyB8ICduZXZlcicsXG5cdFx0WydhbHdheXMnLCAnbGFuZ3VhZ2VEZWZpbmVkJywgJ2JlZm9yZVdoaXRlc3BhY2UnLCAnbmV2ZXInXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvQ2xvc2luZ0NvbW1lbnRzLmxhbmd1YWdlRGVmaW5lZCcsIFwiVXNlIGxhbmd1YWdlIGNvbmZpZ3VyYXRpb25zIHRvIGRldGVybWluZSB3aGVuIHRvIGF1dG9jbG9zZSBjb21tZW50cy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9DbG9zaW5nQ29tbWVudHMuYmVmb3JlV2hpdGVzcGFjZScsIFwiQXV0b2Nsb3NlIGNvbW1lbnRzIG9ubHkgd2hlbiB0aGUgY3Vyc29yIGlzIHRvIHRoZSBsZWZ0IG9mIHdoaXRlc3BhY2UuXCIpLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhdXRvQ2xvc2luZ0NvbW1lbnRzJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgY2xvc2UgY29tbWVudHMgYWZ0ZXIgdGhlIHVzZXIgYWRkcyBhbiBvcGVuaW5nIGNvbW1lbnQuXCIpXG5cdFx0fVxuXHQpKSxcblx0YXV0b0Nsb3NpbmdEZWxldGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hdXRvQ2xvc2luZ0RlbGV0ZSwgJ2F1dG9DbG9zaW5nRGVsZXRlJyxcblx0XHQnYXV0bycgYXMgJ2Fsd2F5cycgfCAnYXV0bycgfCAnbmV2ZXInLFxuXHRcdFsnYWx3YXlzJywgJ2F1dG8nLCAnbmV2ZXInXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvQ2xvc2luZ0RlbGV0ZS5hdXRvJywgXCJSZW1vdmUgYWRqYWNlbnQgY2xvc2luZyBxdW90ZXMgb3IgYnJhY2tldHMgb25seSBpZiB0aGV5IHdlcmUgYXV0b21hdGljYWxseSBpbnNlcnRlZC5cIiksXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2F1dG9DbG9zaW5nRGVsZXRlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIHJlbW92ZSBhZGphY2VudCBjbG9zaW5nIHF1b3RlcyBvciBicmFja2V0cyB3aGVuIGRlbGV0aW5nLlwiKVxuXHRcdH1cblx0KSksXG5cdGF1dG9DbG9zaW5nT3ZlcnR5cGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hdXRvQ2xvc2luZ092ZXJ0eXBlLCAnYXV0b0Nsb3NpbmdPdmVydHlwZScsXG5cdFx0J2F1dG8nIGFzICdhbHdheXMnIHwgJ2F1dG8nIHwgJ25ldmVyJyxcblx0XHRbJ2Fsd2F5cycsICdhdXRvJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0Nsb3NpbmdPdmVydHlwZS5hdXRvJywgXCJUeXBlIG92ZXIgY2xvc2luZyBxdW90ZXMgb3IgYnJhY2tldHMgb25seSBpZiB0aGV5IHdlcmUgYXV0b21hdGljYWxseSBpbnNlcnRlZC5cIiksXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2F1dG9DbG9zaW5nT3ZlcnR5cGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgdHlwZSBvdmVyIGNsb3NpbmcgcXVvdGVzIG9yIGJyYWNrZXRzLlwiKVxuXHRcdH1cblx0KSksXG5cdGF1dG9DbG9zaW5nUXVvdGVzOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXV0b0Nsb3NpbmdRdW90ZXMsICdhdXRvQ2xvc2luZ1F1b3RlcycsXG5cdFx0J2xhbmd1YWdlRGVmaW5lZCcgYXMgJ2Fsd2F5cycgfCAnbGFuZ3VhZ2VEZWZpbmVkJyB8ICdiZWZvcmVXaGl0ZXNwYWNlJyB8ICduZXZlcicsXG5cdFx0WydhbHdheXMnLCAnbGFuZ3VhZ2VEZWZpbmVkJywgJ2JlZm9yZVdoaXRlc3BhY2UnLCAnbmV2ZXInXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvQ2xvc2luZ1F1b3Rlcy5sYW5ndWFnZURlZmluZWQnLCBcIlVzZSBsYW5ndWFnZSBjb25maWd1cmF0aW9ucyB0byBkZXRlcm1pbmUgd2hlbiB0byBhdXRvY2xvc2UgcXVvdGVzLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0Nsb3NpbmdRdW90ZXMuYmVmb3JlV2hpdGVzcGFjZScsIFwiQXV0b2Nsb3NlIHF1b3RlcyBvbmx5IHdoZW4gdGhlIGN1cnNvciBpcyB0byB0aGUgbGVmdCBvZiB3aGl0ZXNwYWNlLlwiKSxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXV0b0Nsb3NpbmdRdW90ZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgYXV0b21hdGljYWxseSBjbG9zZSBxdW90ZXMgYWZ0ZXIgdGhlIHVzZXIgYWRkcyBhbiBvcGVuaW5nIHF1b3RlLlwiKVxuXHRcdH1cblx0KSksXG5cdGF1dG9JbmRlbnQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5hdXRvSW5kZW50LCAnYXV0b0luZGVudCcsXG5cdFx0RWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwsICdmdWxsJyxcblx0XHRbJ25vbmUnLCAna2VlcCcsICdicmFja2V0cycsICdhZHZhbmNlZCcsICdmdWxsJ10sXG5cdFx0X2F1dG9JbmRlbnRGcm9tU3RyaW5nLFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0luZGVudC5ub25lJywgXCJUaGUgZWRpdG9yIHdpbGwgbm90IGluc2VydCBpbmRlbnRhdGlvbiBhdXRvbWF0aWNhbGx5LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b0luZGVudC5rZWVwJywgXCJUaGUgZWRpdG9yIHdpbGwga2VlcCB0aGUgY3VycmVudCBsaW5lJ3MgaW5kZW50YXRpb24uXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvSW5kZW50LmJyYWNrZXRzJywgXCJUaGUgZWRpdG9yIHdpbGwga2VlcCB0aGUgY3VycmVudCBsaW5lJ3MgaW5kZW50YXRpb24gYW5kIGhvbm9yIGxhbmd1YWdlIGRlZmluZWQgYnJhY2tldHMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvSW5kZW50LmFkdmFuY2VkJywgXCJUaGUgZWRpdG9yIHdpbGwga2VlcCB0aGUgY3VycmVudCBsaW5lJ3MgaW5kZW50YXRpb24sIGhvbm9yIGxhbmd1YWdlIGRlZmluZWQgYnJhY2tldHMgYW5kIGludm9rZSBzcGVjaWFsIG9uRW50ZXJSdWxlcyBkZWZpbmVkIGJ5IGxhbmd1YWdlcy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9JbmRlbnQuZnVsbCcsIFwiVGhlIGVkaXRvciB3aWxsIGtlZXAgdGhlIGN1cnJlbnQgbGluZSdzIGluZGVudGF0aW9uLCBob25vciBsYW5ndWFnZSBkZWZpbmVkIGJyYWNrZXRzLCBpbnZva2Ugc3BlY2lhbCBvbkVudGVyUnVsZXMgZGVmaW5lZCBieSBsYW5ndWFnZXMsIGFuZCBob25vciBpbmRlbnRhdGlvblJ1bGVzIGRlZmluZWQgYnkgbGFuZ3VhZ2VzLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdhdXRvSW5kZW50JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgYWRqdXN0IHRoZSBpbmRlbnRhdGlvbiB3aGVuIHVzZXJzIHR5cGUsIHBhc3RlLCBtb3ZlIG9yIGluZGVudCBsaW5lcy5cIilcblx0XHR9XG5cdCkpLFxuXHRhdXRvSW5kZW50T25QYXN0ZTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmF1dG9JbmRlbnRPblBhc3RlLCAnYXV0b0luZGVudE9uUGFzdGUnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2F1dG9JbmRlbnRPblBhc3RlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgYXV0by1pbmRlbnQgdGhlIHBhc3RlZCBjb250ZW50LlwiKSB9XG5cdCkpLFxuXHRhdXRvSW5kZW50T25QYXN0ZVdpdGhpblN0cmluZzogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmF1dG9JbmRlbnRPblBhc3RlV2l0aGluU3RyaW5nLCAnYXV0b0luZGVudE9uUGFzdGVXaXRoaW5TdHJpbmcnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXV0b0luZGVudE9uUGFzdGVXaXRoaW5TdHJpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgYXV0b21hdGljYWxseSBhdXRvLWluZGVudCB0aGUgcGFzdGVkIGNvbnRlbnQgd2hlbiBwYXN0ZWQgd2l0aGluIGEgc3RyaW5nLiBUaGlzIHRha2VzIGVmZmVjdCB3aGVuIGF1dG9JbmRlbnRPblBhc3RlIGlzIHRydWUuXCIpIH1cblx0KSksXG5cdGF1dG9tYXRpY0xheW91dDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmF1dG9tYXRpY0xheW91dCwgJ2F1dG9tYXRpY0xheW91dCcsIGZhbHNlLFxuXHQpKSxcblx0YXV0b1N1cnJvdW5kOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uYXV0b1N1cnJvdW5kLCAnYXV0b1N1cnJvdW5kJyxcblx0XHQnbGFuZ3VhZ2VEZWZpbmVkJyBhcyAnbGFuZ3VhZ2VEZWZpbmVkJyB8ICdxdW90ZXMnIHwgJ2JyYWNrZXRzJyB8ICduZXZlcicsXG5cdFx0WydsYW5ndWFnZURlZmluZWQnLCAncXVvdGVzJywgJ2JyYWNrZXRzJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5hdXRvU3Vycm91bmQubGFuZ3VhZ2VEZWZpbmVkJywgXCJVc2UgbGFuZ3VhZ2UgY29uZmlndXJhdGlvbnMgdG8gZGV0ZXJtaW5lIHdoZW4gdG8gYXV0b21hdGljYWxseSBzdXJyb3VuZCBzZWxlY3Rpb25zLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlZGl0b3IuYXV0b1N1cnJvdW5kLnF1b3RlcycsIFwiU3Vycm91bmQgd2l0aCBxdW90ZXMgYnV0IG5vdCBicmFja2V0cy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmF1dG9TdXJyb3VuZC5icmFja2V0cycsIFwiU3Vycm91bmQgd2l0aCBicmFja2V0cyBidXQgbm90IHF1b3Rlcy5cIiksXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnYXV0b1N1cnJvdW5kJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgc3Vycm91bmQgc2VsZWN0aW9ucyB3aGVuIHR5cGluZyBxdW90ZXMgb3IgYnJhY2tldHMuXCIpXG5cdFx0fVxuXHQpKSxcblx0YnJhY2tldFBhaXJDb2xvcml6YXRpb246IHJlZ2lzdGVyKG5ldyBCcmFja2V0UGFpckNvbG9yaXphdGlvbigpKSxcblx0YnJhY2tldFBhaXJHdWlkZXM6IHJlZ2lzdGVyKG5ldyBHdWlkZU9wdGlvbnMoKSksXG5cdHN0aWNreVRhYlN0b3BzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc3RpY2t5VGFiU3RvcHMsICdzdGlja3lUYWJTdG9wcycsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3RpY2t5VGFiU3RvcHMnLCBcIkVtdWxhdGUgc2VsZWN0aW9uIGJlaGF2aW9yIG9mIHRhYiBjaGFyYWN0ZXJzIHdoZW4gdXNpbmcgc3BhY2VzIGZvciBpbmRlbnRhdGlvbi4gU2VsZWN0aW9uIHdpbGwgc3RpY2sgdG8gdGFiIHN0b3BzLlwiKSB9XG5cdCkpLFxuXHRjb2RlTGVuczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmNvZGVMZW5zLCAnY29kZUxlbnMnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29kZUxlbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG93cyBDb2RlTGVucy5cIikgfVxuXHQpKSxcblx0Y29kZUxlbnNGb250RmFtaWx5OiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jb2RlTGVuc0ZvbnRGYW1pbHksICdjb2RlTGVuc0ZvbnRGYW1pbHknLCAnJyxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvZGVMZW5zRm9udEZhbWlseScsIFwiQ29udHJvbHMgdGhlIGZvbnQgZmFtaWx5IGZvciBDb2RlTGVucy5cIikgfVxuXHQpKSxcblx0Y29kZUxlbnNGb250U2l6ZTogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihFZGl0b3JPcHRpb24uY29kZUxlbnNGb250U2l6ZSwgJ2NvZGVMZW5zRm9udFNpemUnLCAwLCAwLCAxMDAsIHtcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRkZWZhdWx0OiAwLFxuXHRcdG1pbmltdW06IDAsXG5cdFx0bWF4aW11bTogMTAwLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29kZUxlbnNGb250U2l6ZScsIFwiQ29udHJvbHMgdGhlIGZvbnQgc2l6ZSBpbiBwaXhlbHMgZm9yIENvZGVMZW5zLiBXaGVuIHNldCB0byAwLCA5MCUgb2YgYCNlZGl0b3IuZm9udFNpemUjYCBpcyB1c2VkLlwiKVxuXHR9KSksXG5cdGNvbG9yRGVjb3JhdG9yczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmNvbG9yRGVjb3JhdG9ycywgJ2NvbG9yRGVjb3JhdG9ycycsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb2xvckRlY29yYXRvcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgcmVuZGVyIHRoZSBpbmxpbmUgY29sb3IgZGVjb3JhdG9ycyBhbmQgY29sb3IgcGlja2VyLlwiKSB9XG5cdCkpLFxuXHRjb2xvckRlY29yYXRvckFjdGl2YXRlZE9uOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihFZGl0b3JPcHRpb24uY29sb3JEZWNvcmF0b3JzQWN0aXZhdGVkT24sICdjb2xvckRlY29yYXRvcnNBY3RpdmF0ZWRPbicsICdjbGlja0FuZEhvdmVyJyBhcyAnY2xpY2tBbmRIb3ZlcicgfCAnaG92ZXInIHwgJ2NsaWNrJywgWydjbGlja0FuZEhvdmVyJywgJ2hvdmVyJywgJ2NsaWNrJ10gYXMgY29uc3QsIHtcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5jb2xvckRlY29yYXRvckFjdGl2YXRlZE9uLmNsaWNrQW5kSG92ZXInLCBcIk1ha2UgdGhlIGNvbG9yIHBpY2tlciBhcHBlYXIgYm90aCBvbiBjbGljayBhbmQgaG92ZXIgb2YgdGhlIGNvbG9yIGRlY29yYXRvclwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmNvbG9yRGVjb3JhdG9yQWN0aXZhdGVkT24uaG92ZXInLCBcIk1ha2UgdGhlIGNvbG9yIHBpY2tlciBhcHBlYXIgb24gaG92ZXIgb2YgdGhlIGNvbG9yIGRlY29yYXRvclwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmNvbG9yRGVjb3JhdG9yQWN0aXZhdGVkT24uY2xpY2snLCBcIk1ha2UgdGhlIGNvbG9yIHBpY2tlciBhcHBlYXIgb24gY2xpY2sgb2YgdGhlIGNvbG9yIGRlY29yYXRvclwiKVxuXHRcdF0sXG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29sb3JEZWNvcmF0b3JBY3RpdmF0ZWRPbicsIFwiQ29udHJvbHMgdGhlIGNvbmRpdGlvbiB0byBtYWtlIGEgY29sb3IgcGlja2VyIGFwcGVhciBmcm9tIGEgY29sb3IgZGVjb3JhdG9yLlwiKVxuXHR9KSksXG5cdGNvbG9yRGVjb3JhdG9yc0xpbWl0OiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jb2xvckRlY29yYXRvcnNMaW1pdCwgJ2NvbG9yRGVjb3JhdG9yc0xpbWl0JywgNTAwLCAxLCAxMDAwMDAwLFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29sb3JEZWNvcmF0b3JzTGltaXQnLCBcIkNvbnRyb2xzIHRoZSBtYXggbnVtYmVyIG9mIGNvbG9yIGRlY29yYXRvcnMgdGhhdCBjYW4gYmUgcmVuZGVyZWQgaW4gYW4gZWRpdG9yIGF0IG9uY2UuXCIpXG5cdFx0fVxuXHQpKSxcblx0Y29sdW1uU2VsZWN0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY29sdW1uU2VsZWN0aW9uLCAnY29sdW1uU2VsZWN0aW9uJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb2x1bW5TZWxlY3Rpb24nLCBcIkVuYWJsZSB0aGF0IHRoZSBzZWxlY3Rpb24gd2l0aCB0aGUgbW91c2UgYW5kIGtleXMgaXMgZG9pbmcgY29sdW1uIHNlbGVjdGlvbi5cIikgfVxuXHQpKSxcblx0Y29tbWVudHM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JDb21tZW50cygpKSxcblx0Y29udGV4dG1lbnU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jb250ZXh0bWVudSwgJ2NvbnRleHRtZW51JywgdHJ1ZSxcblx0KSksXG5cdGNvcHlXaXRoU3ludGF4SGlnaGxpZ2h0aW5nOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY29weVdpdGhTeW50YXhIaWdobGlnaHRpbmcsICdjb3B5V2l0aFN5bnRheEhpZ2hsaWdodGluZycsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb3B5V2l0aFN5bnRheEhpZ2hsaWdodGluZycsIFwiQ29udHJvbHMgd2hldGhlciBzeW50YXggaGlnaGxpZ2h0aW5nIHNob3VsZCBiZSBjb3BpZWQgaW50byB0aGUgY2xpcGJvYXJkLlwiKSB9XG5cdCkpLFxuXHRjdXJzb3JCbGlua2luZzogcmVnaXN0ZXIobmV3IEVkaXRvckVudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmN1cnNvckJsaW5raW5nLCAnY3Vyc29yQmxpbmtpbmcnLFxuXHRcdFRleHRFZGl0b3JDdXJzb3JCbGlua2luZ1N0eWxlLkJsaW5rLCAnYmxpbmsnLFxuXHRcdFsnYmxpbmsnLCAnc21vb3RoJywgJ3BoYXNlJywgJ2V4cGFuZCcsICdzb2xpZCddLFxuXHRcdGN1cnNvckJsaW5raW5nU3R5bGVGcm9tU3RyaW5nLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY3Vyc29yQmxpbmtpbmcnLCBcIkNvbnRyb2wgdGhlIGN1cnNvciBhbmltYXRpb24gc3R5bGUuXCIpIH1cblx0KSksXG5cdGN1cnNvclNtb290aENhcmV0QW5pbWF0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY3Vyc29yU21vb3RoQ2FyZXRBbmltYXRpb24sICdjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbicsXG5cdFx0J29mZicgYXMgJ29mZicgfCAnZXhwbGljaXQnIHwgJ29uJyxcblx0XHRbJ29mZicsICdleHBsaWNpdCcsICdvbiddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbi5vZmYnLCBcIlNtb290aCBjYXJldCBhbmltYXRpb24gaXMgZGlzYWJsZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2N1cnNvclNtb290aENhcmV0QW5pbWF0aW9uLmV4cGxpY2l0JywgXCJTbW9vdGggY2FyZXQgYW5pbWF0aW9uIGlzIGVuYWJsZWQgb25seSB3aGVuIHRoZSB1c2VyIG1vdmVzIHRoZSBjdXJzb3Igd2l0aCBhbiBleHBsaWNpdCBnZXN0dXJlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbi5vbicsIFwiU21vb3RoIGNhcmV0IGFuaW1hdGlvbiBpcyBhbHdheXMgZW5hYmxlZC5cIilcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjdXJzb3JTbW9vdGhDYXJldEFuaW1hdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgc21vb3RoIGNhcmV0IGFuaW1hdGlvbiBzaG91bGQgYmUgZW5hYmxlZC5cIilcblx0XHR9XG5cdCkpLFxuXHRjdXJzb3JTdHlsZTogcmVnaXN0ZXIobmV3IEVkaXRvckVudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmN1cnNvclN0eWxlLCAnY3Vyc29yU3R5bGUnLFxuXHRcdFRleHRFZGl0b3JDdXJzb3JTdHlsZS5MaW5lLCAnbGluZScsXG5cdFx0WydsaW5lJywgJ2Jsb2NrJywgJ3VuZGVybGluZScsICdsaW5lLXRoaW4nLCAnYmxvY2stb3V0bGluZScsICd1bmRlcmxpbmUtdGhpbiddLFxuXHRcdGN1cnNvclN0eWxlRnJvbVN0cmluZyxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2N1cnNvclN0eWxlJywgXCJDb250cm9scyB0aGUgY3Vyc29yIHN0eWxlIGluIGluc2VydCBpbnB1dCBtb2RlLlwiKSB9XG5cdCkpLFxuXHRvdmVydHlwZUN1cnNvclN0eWxlOiByZWdpc3RlcihuZXcgRWRpdG9yRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ub3ZlcnR5cGVDdXJzb3JTdHlsZSwgJ292ZXJ0eXBlQ3Vyc29yU3R5bGUnLFxuXHRcdFRleHRFZGl0b3JDdXJzb3JTdHlsZS5CbG9jaywgJ2Jsb2NrJyxcblx0XHRbJ2xpbmUnLCAnYmxvY2snLCAndW5kZXJsaW5lJywgJ2xpbmUtdGhpbicsICdibG9jay1vdXRsaW5lJywgJ3VuZGVybGluZS10aGluJ10sXG5cdFx0Y3Vyc29yU3R5bGVGcm9tU3RyaW5nLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb3ZlcnR5cGVDdXJzb3JTdHlsZScsIFwiQ29udHJvbHMgdGhlIGN1cnNvciBzdHlsZSBpbiBvdmVydHlwZSBpbnB1dCBtb2RlLlwiKSB9XG5cdCkpLFxuXHRjdXJzb3JTdXJyb3VuZGluZ0xpbmVzOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5jdXJzb3JTdXJyb3VuZGluZ0xpbmVzLCAnY3Vyc29yU3Vycm91bmRpbmdMaW5lcycsXG5cdFx0MCwgMCwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjdXJzb3JTdXJyb3VuZGluZ0xpbmVzJywgXCJDb250cm9scyB0aGUgbWluaW1hbCBudW1iZXIgb2YgdmlzaWJsZSBsZWFkaW5nIGxpbmVzIChtaW5pbXVtIDApIGFuZCB0cmFpbGluZyBsaW5lcyAobWluaW11bSAxKSBzdXJyb3VuZGluZyB0aGUgY3Vyc29yLiBLbm93biBhcyAnc2Nyb2xsT2ZmJyBvciAnc2Nyb2xsT2Zmc2V0JyBpbiBzb21lIG90aGVyIGVkaXRvcnMuXCIpIH1cblx0KSksXG5cdGN1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmN1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZSwgJ2N1cnNvclN1cnJvdW5kaW5nTGluZXNTdHlsZScsXG5cdFx0J2RlZmF1bHQnIGFzICdkZWZhdWx0JyB8ICdhbGwnLFxuXHRcdFsnZGVmYXVsdCcsICdhbGwnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY3Vyc29yU3Vycm91bmRpbmdMaW5lc1N0eWxlLmRlZmF1bHQnLCBcImBjdXJzb3JTdXJyb3VuZGluZ0xpbmVzYCBpcyBlbmZvcmNlZCBvbmx5IHdoZW4gdHJpZ2dlcmVkIHZpYSB0aGUga2V5Ym9hcmQgb3IgQVBJLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjdXJzb3JTdXJyb3VuZGluZ0xpbmVzU3R5bGUuYWxsJywgXCJgY3Vyc29yU3Vycm91bmRpbmdMaW5lc2AgaXMgZW5mb3JjZWQgYWx3YXlzLlwiKVxuXHRcdFx0XSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY3Vyc29yU3Vycm91bmRpbmdMaW5lc1N0eWxlJywgXCJDb250cm9scyB3aGVuIGAjZWRpdG9yLmN1cnNvclN1cnJvdW5kaW5nTGluZXMjYCBzaG91bGQgYmUgZW5mb3JjZWQuXCIpXG5cdFx0fVxuXHQpKSxcblx0Y3Vyc29yV2lkdGg6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmN1cnNvcldpZHRoLCAnY3Vyc29yV2lkdGgnLFxuXHRcdDAsIDAsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdHsgbWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjdXJzb3JXaWR0aCcsIFwiQ29udHJvbHMgdGhlIHdpZHRoIG9mIHRoZSBjdXJzb3Igd2hlbiBgI2VkaXRvci5jdXJzb3JTdHlsZSNgIGlzIHNldCB0byBgbGluZWAuXCIpIH1cblx0KSksXG5cdGN1cnNvckhlaWdodDogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uY3Vyc29ySGVpZ2h0LCAnY3Vyc29ySGVpZ2h0Jyxcblx0XHQwLCAwLCBDb25zdGFudHMuTUFYX1NBRkVfU01BTExfSU5URUdFUixcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY3Vyc29ySGVpZ2h0JywgXCJDb250cm9scyB0aGUgaGVpZ2h0IG9mIHRoZSBjdXJzb3Igd2hlbiBgI2VkaXRvci5jdXJzb3JTdHlsZSNgIGlzIHNldCB0byBgbGluZWAuIEN1cnNvcidzIG1heCBoZWlnaHQgZGVwZW5kcyBvbiBsaW5lIGhlaWdodC5cIikgfVxuXHQpKSxcblx0ZGlzYWJsZUxheWVySGludGluZzogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmRpc2FibGVMYXllckhpbnRpbmcsICdkaXNhYmxlTGF5ZXJIaW50aW5nJywgZmFsc2UsXG5cdCkpLFxuXHRkaXNhYmxlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmRpc2FibGVNb25vc3BhY2VPcHRpbWl6YXRpb25zLCAnZGlzYWJsZU1vbm9zcGFjZU9wdGltaXphdGlvbnMnLCBmYWxzZVxuXHQpKSxcblx0ZG9tUmVhZE9ubHk6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5kb21SZWFkT25seSwgJ2RvbVJlYWRPbmx5JywgZmFsc2UsXG5cdCkpLFxuXHRkb3VibGVDbGlja1NlbGVjdHNCbG9jazogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmRvdWJsZUNsaWNrU2VsZWN0c0Jsb2NrLCAnZG91YmxlQ2xpY2tTZWxlY3RzQmxvY2snLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZG91YmxlQ2xpY2tTZWxlY3RzQmxvY2snLCBcIkNvbnRyb2xzIHdoZXRoZXIgZG91YmxlLWNsaWNraW5nIG5leHQgdG8gYSBicmFja2V0IG9yIHF1b3RlIHNlbGVjdHMgdGhlIGNvbnRlbnQgaW5zaWRlLlwiKSB9XG5cdCkpLFxuXHRkcmFnQW5kRHJvcDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmRyYWdBbmREcm9wLCAnZHJhZ0FuZERyb3AnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZHJhZ0FuZERyb3AnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgYWxsb3cgbW92aW5nIHNlbGVjdGlvbnMgdmlhIGRyYWcgYW5kIGRyb3AuXCIpIH1cblx0KSksXG5cdGVtcHR5U2VsZWN0aW9uQ2xpcGJvYXJkOiByZWdpc3RlcihuZXcgRWRpdG9yRW1wdHlTZWxlY3Rpb25DbGlwYm9hcmQoKSksXG5cdGRyb3BJbnRvRWRpdG9yOiByZWdpc3RlcihuZXcgRWRpdG9yRHJvcEludG9FZGl0b3IoKSksXG5cdGVkaXRDb250ZXh0OiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZWRpdENvbnRleHQsICdlZGl0Q29udGV4dCcsIHRydWUsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdENvbnRleHQnLCBcIlNldHMgd2hldGhlciB0aGUgRWRpdENvbnRleHQgQVBJIHNob3VsZCBiZSB1c2VkIGluc3RlYWQgb2YgdGhlIHRleHQgYXJlYSB0byBwb3dlciBpbnB1dCBpbiB0aGUgZWRpdG9yLlwiKSxcblx0XHRcdGluY2x1ZGVkOiBwbGF0Zm9ybS5pc0Nocm9tZSB8fCBwbGF0Zm9ybS5pc0VkZ2UgfHwgcGxhdGZvcm0uaXNOYXRpdmVcblx0XHR9XG5cdCkpLFxuXHRyZW5kZXJSaWNoU2NyZWVuUmVhZGVyQ29udGVudDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnJlbmRlclJpY2hTY3JlZW5SZWFkZXJDb250ZW50LCAncmVuZGVyUmljaFNjcmVlblJlYWRlckNvbnRlbnQnLCBmYWxzZSxcblx0XHR7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3JlbmRlclJpY2hTY3JlZW5SZWFkZXJDb250ZW50JywgXCJXaGV0aGVyIHRvIHJlbmRlciByaWNoIHNjcmVlbiByZWFkZXIgY29udGVudCB3aGVuIHRoZSBgI2VkaXRvci5lZGl0Q29udGV4dCNgIHNldHRpbmcgaXMgZW5hYmxlZC5cIiksXG5cdFx0fVxuXHQpKSxcblx0c3RpY2t5U2Nyb2xsOiByZWdpc3RlcihuZXcgRWRpdG9yU3RpY2t5U2Nyb2xsKCkpLFxuXHRleHBlcmltZW50YWxHcHVBY2NlbGVyYXRpb246IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5leHBlcmltZW50YWxHcHVBY2NlbGVyYXRpb24sICdleHBlcmltZW50YWxHcHVBY2NlbGVyYXRpb24nLFxuXHRcdCdvZmYnIGFzICdvZmYnIHwgJ29uJyxcblx0XHRbJ29mZicsICdvbiddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uLm9mZicsIFwiVXNlIHJlZ3VsYXIgRE9NLWJhc2VkIHJlbmRlcmluZy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uLm9uJywgXCJVc2UgR1BVIGFjY2VsZXJhdGlvbi5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXhwZXJpbWVudGFsR3B1QWNjZWxlcmF0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHVzZSB0aGUgZXhwZXJpbWVudGFsIEdQVSBhY2NlbGVyYXRpb24gdG8gcmVuZGVyIHRoZSBlZGl0b3IuXCIpXG5cdFx0fVxuXHQpKSxcblx0ZXhwZXJpbWVudGFsV2hpdGVzcGFjZVJlbmRlcmluZzogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmV4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmcsICdleHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nJyxcblx0XHQnc3ZnJyBhcyAnc3ZnJyB8ICdmb250JyB8ICdvZmYnLFxuXHRcdFsnc3ZnJywgJ2ZvbnQnLCAnb2ZmJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2V4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmcuc3ZnJywgXCJVc2UgYSBuZXcgcmVuZGVyaW5nIG1ldGhvZCB3aXRoIHN2Z3MuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2V4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmcuZm9udCcsIFwiVXNlIGEgbmV3IHJlbmRlcmluZyBtZXRob2Qgd2l0aCBmb250IGNoYXJhY3RlcnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2V4cGVyaW1lbnRhbFdoaXRlc3BhY2VSZW5kZXJpbmcub2ZmJywgXCJVc2UgdGhlIHN0YWJsZSByZW5kZXJpbmcgbWV0aG9kLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHBlcmltZW50YWxXaGl0ZXNwYWNlUmVuZGVyaW5nJywgXCJDb250cm9scyB3aGV0aGVyIHdoaXRlc3BhY2UgaXMgcmVuZGVyZWQgd2l0aCBhIG5ldywgZXhwZXJpbWVudGFsIG1ldGhvZC5cIilcblx0XHR9XG5cdCkpLFxuXHRleHRyYUVkaXRvckNsYXNzTmFtZTogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ09wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZXh0cmFFZGl0b3JDbGFzc05hbWUsICdleHRyYUVkaXRvckNsYXNzTmFtZScsICcnLFxuXHQpKSxcblx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiByZWdpc3RlcihuZXcgRWRpdG9yRmxvYXRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmZhc3RTY3JvbGxTZW5zaXRpdml0eSwgJ2Zhc3RTY3JvbGxTZW5zaXRpdml0eScsXG5cdFx0NSwgeCA9PiAoeCA8PSAwID8gNSA6IHgpLFxuXHRcdHsgbWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmYXN0U2Nyb2xsU2Vuc2l0aXZpdHknLCBcIlNjcm9sbGluZyBzcGVlZCBtdWx0aXBsaWVyIHdoZW4gcHJlc3NpbmcgYEFsdGAuXCIpIH1cblx0KSksXG5cdGZpbmQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JGaW5kKCkpLFxuXHRmaXhlZE92ZXJmbG93V2lkZ2V0czogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmZpeGVkT3ZlcmZsb3dXaWRnZXRzLCAnZml4ZWRPdmVyZmxvd1dpZGdldHMnLCBmYWxzZSxcblx0KSksXG5cdGZvbGRpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mb2xkaW5nLCAnZm9sZGluZycsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb2xkaW5nJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3IgaGFzIGNvZGUgZm9sZGluZyBlbmFibGVkLlwiKSB9XG5cdCkpLFxuXHRmb2xkaW5nU3RyYXRlZ3k6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mb2xkaW5nU3RyYXRlZ3ksICdmb2xkaW5nU3RyYXRlZ3knLFxuXHRcdCdhdXRvJyBhcyAnYXV0bycgfCAnaW5kZW50YXRpb24nLFxuXHRcdFsnYXV0bycsICdpbmRlbnRhdGlvbiddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdmb2xkaW5nU3RyYXRlZ3kuYXV0bycsIFwiVXNlIGEgbGFuZ3VhZ2Utc3BlY2lmaWMgZm9sZGluZyBzdHJhdGVneSBpZiBhdmFpbGFibGUsIGVsc2UgdGhlIGluZGVudGF0aW9uLWJhc2VkIG9uZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZm9sZGluZ1N0cmF0ZWd5LmluZGVudGF0aW9uJywgXCJVc2UgdGhlIGluZGVudGF0aW9uLWJhc2VkIGZvbGRpbmcgc3RyYXRlZ3kuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbGRpbmdTdHJhdGVneScsIFwiQ29udHJvbHMgdGhlIHN0cmF0ZWd5IGZvciBjb21wdXRpbmcgZm9sZGluZyByYW5nZXMuXCIpXG5cdFx0fVxuXHQpKSxcblx0Zm9sZGluZ0hpZ2hsaWdodDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmZvbGRpbmdIaWdobGlnaHQsICdmb2xkaW5nSGlnaGxpZ2h0JywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbGRpbmdIaWdobGlnaHQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgaGlnaGxpZ2h0IGZvbGRlZCByYW5nZXMuXCIpIH1cblx0KSksXG5cdGZvbGRpbmdJbXBvcnRzQnlEZWZhdWx0OiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQsICdmb2xkaW5nSW1wb3J0c0J5RGVmYXVsdCcsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9sZGluZ0ltcG9ydHNCeURlZmF1bHQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBhdXRvbWF0aWNhbGx5IGNvbGxhcHNlcyBpbXBvcnQgcmFuZ2VzLlwiKSB9XG5cdCkpLFxuXHRmb2xkaW5nTWF4aW11bVJlZ2lvbnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmZvbGRpbmdNYXhpbXVtUmVnaW9ucywgJ2ZvbGRpbmdNYXhpbXVtUmVnaW9ucycsXG5cdFx0NTAwMCwgMTAsIDY1MDAwLCAvLyBsaW1pdCBtdXN0IGJlIGxlc3MgdGhhbiBmb2xkaW5nUmFuZ2VzIE1BWF9GT0xESU5HX1JFR0lPTlNcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2ZvbGRpbmdNYXhpbXVtUmVnaW9ucycsIFwiVGhlIG1heGltdW0gbnVtYmVyIG9mIGZvbGRhYmxlIHJlZ2lvbnMuIEluY3JlYXNpbmcgdGhpcyB2YWx1ZSBtYXkgcmVzdWx0IGluIHRoZSBlZGl0b3IgYmVjb21pbmcgbGVzcyByZXNwb25zaXZlIHdoZW4gdGhlIGN1cnJlbnQgc291cmNlIGhhcyBhIGxhcmdlIG51bWJlciBvZiBmb2xkYWJsZSByZWdpb25zLlwiKSB9XG5cdCkpLFxuXHR1bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi51bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUsICd1bmZvbGRPbkNsaWNrQWZ0ZXJFbmRPZkxpbmUnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VuZm9sZE9uQ2xpY2tBZnRlckVuZE9mTGluZScsIFwiQ29udHJvbHMgd2hldGhlciBjbGlja2luZyBvbiB0aGUgZW1wdHkgY29udGVudCBhZnRlciBhIGZvbGRlZCBsaW5lIHdpbGwgdW5mb2xkIHRoZSBsaW5lLlwiKSB9XG5cdCkpLFxuXHRmb250RmFtaWx5OiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mb250RmFtaWx5LCAnZm9udEZhbWlseScsIEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRGYW1pbHksXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmb250RmFtaWx5JywgXCJDb250cm9scyB0aGUgZm9udCBmYW1pbHkuXCIpIH1cblx0KSksXG5cdGZvbnRJbmZvOiByZWdpc3RlcihuZXcgRWRpdG9yRm9udEluZm8oKSksXG5cdGZvbnRMaWdhdHVyZXMyOiByZWdpc3RlcihuZXcgRWRpdG9yRm9udExpZ2F0dXJlcygpKSxcblx0Zm9udFNpemU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JGb250U2l6ZSgpKSxcblx0Zm9udFdlaWdodDogcmVnaXN0ZXIobmV3IEVkaXRvckZvbnRXZWlnaHQoKSksXG5cdGZvbnRWYXJpYXRpb25zOiByZWdpc3RlcihuZXcgRWRpdG9yRm9udFZhcmlhdGlvbnMoKSksXG5cdGZvcm1hdE9uUGFzdGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5mb3JtYXRPblBhc3RlLCAnZm9ybWF0T25QYXN0ZScsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9ybWF0T25QYXN0ZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBhdXRvbWF0aWNhbGx5IGZvcm1hdCB0aGUgcGFzdGVkIGNvbnRlbnQuIEEgZm9ybWF0dGVyIG11c3QgYmUgYXZhaWxhYmxlIGFuZCB0aGUgZm9ybWF0dGVyIHNob3VsZCBiZSBhYmxlIHRvIGZvcm1hdCBhIHJhbmdlIGluIGEgZG9jdW1lbnQuXCIpIH1cblx0KSksXG5cdGZvcm1hdE9uVHlwZTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmZvcm1hdE9uVHlwZSwgJ2Zvcm1hdE9uVHlwZScsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZm9ybWF0T25UeXBlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGF1dG9tYXRpY2FsbHkgZm9ybWF0IHRoZSBsaW5lIGFmdGVyIHR5cGluZy5cIikgfVxuXHQpKSxcblx0Z2x5cGhNYXJnaW46IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5nbHlwaE1hcmdpbiwgJ2dseXBoTWFyZ2luJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2dseXBoTWFyZ2luJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIHJlbmRlciB0aGUgdmVydGljYWwgZ2x5cGggbWFyZ2luLiBHbHlwaCBtYXJnaW4gaXMgbW9zdGx5IHVzZWQgZm9yIGRlYnVnZ2luZy5cIikgfVxuXHQpKSxcblx0Z290b0xvY2F0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yR29Ub0xvY2F0aW9uKCkpLFxuXHRoaWRlQ3Vyc29ySW5PdmVydmlld1J1bGVyOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uaGlkZUN1cnNvckluT3ZlcnZpZXdSdWxlciwgJ2hpZGVDdXJzb3JJbk92ZXJ2aWV3UnVsZXInLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2hpZGVDdXJzb3JJbk92ZXJ2aWV3UnVsZXInLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGN1cnNvciBzaG91bGQgYmUgaGlkZGVuIGluIHRoZSBvdmVydmlldyBydWxlci5cIikgfVxuXHQpKSxcblx0aG92ZXI6IHJlZ2lzdGVyKG5ldyBFZGl0b3JIb3ZlcigpKSxcblx0aW5EaWZmRWRpdG9yOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uaW5EaWZmRWRpdG9yLCAnaW5EaWZmRWRpdG9yJywgZmFsc2Vcblx0KSksXG5cdGluZXJ0aWFsU2Nyb2xsOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uaW5lcnRpYWxTY3JvbGwsICdpbmVydGlhbFNjcm9sbCcsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnaW5lcnRpYWxTY3JvbGwnLCBcIk1ha2Ugc2Nyb2xsaW5nIGluZXJ0aWFsIC0gbW9zdGx5IHVzZWZ1bCB3aXRoIHRvdWNocGFkIG9uIGxpbnV4LlwiKSB9XG5cdCkpLFxuXHRsZXR0ZXJTcGFjaW5nOiByZWdpc3RlcihuZXcgRWRpdG9yRmxvYXRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmxldHRlclNwYWNpbmcsICdsZXR0ZXJTcGFjaW5nJyxcblx0XHRFRElUT1JfRk9OVF9ERUZBVUxUUy5sZXR0ZXJTcGFjaW5nLCB4ID0+IEVkaXRvckZsb2F0T3B0aW9uLmNsYW1wKHgsIC01LCAyMCksXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdsZXR0ZXJTcGFjaW5nJywgXCJDb250cm9scyB0aGUgbGV0dGVyIHNwYWNpbmcgaW4gcGl4ZWxzLlwiKSB9XG5cdCkpLFxuXHRsaWdodGJ1bGI6IHJlZ2lzdGVyKG5ldyBFZGl0b3JMaWdodGJ1bGIoKSksXG5cdGxpbmVEZWNvcmF0aW9uc1dpZHRoOiByZWdpc3RlcihuZXcgRWRpdG9yTGluZURlY29yYXRpb25zV2lkdGgoKSksXG5cdGxpbmVIZWlnaHQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JMaW5lSGVpZ2h0KCkpLFxuXHRsaW5lTnVtYmVyczogcmVnaXN0ZXIobmV3IEVkaXRvclJlbmRlckxpbmVOdW1iZXJzT3B0aW9uKCkpLFxuXHRsaW5lTnVtYmVyc01pbkNoYXJzOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5saW5lTnVtYmVyc01pbkNoYXJzLCAnbGluZU51bWJlcnNNaW5DaGFycycsXG5cdFx0NSwgMSwgMzAwXG5cdCkpLFxuXHRsaW5rZWRFZGl0aW5nOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubGlua2VkRWRpdGluZywgJ2xpbmtlZEVkaXRpbmcnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2xpbmtlZEVkaXRpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBoYXMgbGlua2VkIGVkaXRpbmcgZW5hYmxlZC4gRGVwZW5kaW5nIG9uIHRoZSBsYW5ndWFnZSwgcmVsYXRlZCBzeW1ib2xzIHN1Y2ggYXMgSFRNTCB0YWdzLCBhcmUgdXBkYXRlZCB3aGlsZSBlZGl0aW5nLlwiKSB9XG5cdCkpLFxuXHRsaW5rczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmxpbmtzLCAnbGlua3MnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbGlua3MnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciBzaG91bGQgZGV0ZWN0IGxpbmtzIGFuZCBtYWtlIHRoZW0gY2xpY2thYmxlLlwiKSB9XG5cdCkpLFxuXHRtYXRjaEJyYWNrZXRzOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubWF0Y2hCcmFja2V0cywgJ21hdGNoQnJhY2tldHMnLFxuXHRcdCdhbHdheXMnIGFzICduZXZlcicgfCAnbmVhcicgfCAnYWx3YXlzJyxcblx0XHRbJ2Fsd2F5cycsICduZWFyJywgJ25ldmVyJ10gYXMgY29uc3QsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtYXRjaEJyYWNrZXRzJywgXCJIaWdobGlnaHQgbWF0Y2hpbmcgYnJhY2tldHMuXCIpIH1cblx0KSksXG5cdG1pbmltYXA6IHJlZ2lzdGVyKG5ldyBFZGl0b3JNaW5pbWFwKCkpLFxuXHRtb3VzZVN0eWxlOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubW91c2VTdHlsZSwgJ21vdXNlU3R5bGUnLFxuXHRcdCd0ZXh0JyBhcyAndGV4dCcgfCAnZGVmYXVsdCcgfCAnY29weScsXG5cdFx0Wyd0ZXh0JywgJ2RlZmF1bHQnLCAnY29weSddIGFzIGNvbnN0LFxuXHQpKSxcblx0bW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5OiByZWdpc3RlcihuZXcgRWRpdG9yRmxvYXRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSwgJ21vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eScsXG5cdFx0MSwgeCA9PiAoeCA9PT0gMCA/IDEgOiB4KSxcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5JywgXCJBIG11bHRpcGxpZXIgdG8gYmUgdXNlZCBvbiB0aGUgYGRlbHRhWGAgYW5kIGBkZWx0YVlgIG9mIG1vdXNlIHdoZWVsIHNjcm9sbCBldmVudHMuXCIpIH1cblx0KSksXG5cdG1vdXNlV2hlZWxab29tOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubW91c2VXaGVlbFpvb20sICdtb3VzZVdoZWVsWm9vbScsIGZhbHNlLFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IHBsYXRmb3JtLmlzTWFjaW50b3NoXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdtb3VzZVdoZWVsWm9vbS5tYWMnLCBcIlpvb20gdGhlIGZvbnQgb2YgdGhlIGVkaXRvciB3aGVuIHVzaW5nIG1vdXNlIHdoZWVsIGFuZCBob2xkaW5nIGBDbWRgLlwiKVxuXHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnbW91c2VXaGVlbFpvb20nLCBcIlpvb20gdGhlIGZvbnQgb2YgdGhlIGVkaXRvciB3aGVuIHVzaW5nIG1vdXNlIHdoZWVsIGFuZCBob2xkaW5nIGBDdHJsYC5cIilcblx0XHR9XG5cdCkpLFxuXHRtdWx0aUN1cnNvck1lcmdlT3ZlcmxhcHBpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5tdWx0aUN1cnNvck1lcmdlT3ZlcmxhcHBpbmcsICdtdWx0aUN1cnNvck1lcmdlT3ZlcmxhcHBpbmcnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbXVsdGlDdXJzb3JNZXJnZU92ZXJsYXBwaW5nJywgXCJNZXJnZSBtdWx0aXBsZSBjdXJzb3JzIHdoZW4gdGhleSBhcmUgb3ZlcmxhcHBpbmcuXCIpIH1cblx0KSksXG5cdG11bHRpQ3Vyc29yTW9kaWZpZXI6IHJlZ2lzdGVyKG5ldyBFZGl0b3JFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5tdWx0aUN1cnNvck1vZGlmaWVyLCAnbXVsdGlDdXJzb3JNb2RpZmllcicsXG5cdFx0J2FsdEtleScsICdhbHQnLFxuXHRcdFsnY3RybENtZCcsICdhbHQnXSxcblx0XHRfbXVsdGlDdXJzb3JNb2RpZmllckZyb21TdHJpbmcsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnbXVsdGlDdXJzb3JNb2RpZmllci5jdHJsQ21kJywgXCJNYXBzIHRvIGBDb250cm9sYCBvbiBXaW5kb3dzIGFuZCBMaW51eCBhbmQgdG8gYENvbW1hbmRgIG9uIG1hY09TLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdtdWx0aUN1cnNvck1vZGlmaWVyLmFsdCcsIFwiTWFwcyB0byBgQWx0YCBvbiBXaW5kb3dzIGFuZCBMaW51eCBhbmQgdG8gYE9wdGlvbmAgb24gbWFjT1MuXCIpXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnbXVsdGlDdXJzb3JNb2RpZmllcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnLSBgY3RybENtZGAgcmVmZXJzIHRvIGEgdmFsdWUgdGhlIHNldHRpbmcgY2FuIHRha2UgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLicsXG5cdFx0XHRcdFx0Jy0gYENvbnRyb2xgIGFuZCBgQ29tbWFuZGAgcmVmZXIgdG8gdGhlIG1vZGlmaWVyIGtleXMgQ3RybCBvciBDbWQgb24gdGhlIGtleWJvYXJkIGFuZCBjYW4gYmUgbG9jYWxpemVkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJUaGUgbW9kaWZpZXIgdG8gYmUgdXNlZCB0byBhZGQgbXVsdGlwbGUgY3Vyc29ycyB3aXRoIHRoZSBtb3VzZS4gVGhlIEdvIHRvIERlZmluaXRpb24gYW5kIE9wZW4gTGluayBtb3VzZSBnZXN0dXJlcyB3aWxsIGFkYXB0IHN1Y2ggdGhhdCB0aGV5IGRvIG5vdCBjb25mbGljdCB3aXRoIHRoZSBbbXVsdGljdXJzb3IgbW9kaWZpZXJdKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2NvZGViYXNpY3MjX211bHRpY3Vyc29yLW1vZGlmaWVyKS5cIilcblx0XHR9XG5cdCkpLFxuXHRtb3VzZU1pZGRsZUNsaWNrQWN0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubW91c2VNaWRkbGVDbGlja0FjdGlvbiwgJ21vdXNlTWlkZGxlQ2xpY2tBY3Rpb24nLCAnZGVmYXVsdCcgYXMgTW91c2VNaWRkbGVDbGlja0FjdGlvbixcblx0XHRbJ2RlZmF1bHQnLCAnb3BlbkxpbmsnLCAnY3RybExlZnRDbGljayddIGFzIE1vdXNlTWlkZGxlQ2xpY2tBY3Rpb25bXSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ21vdXNlTWlkZGxlQ2xpY2tBY3Rpb24nLCBcIkNvbnRyb2xzIHdoYXQgaGFwcGVucyB3aGVuIG1pZGRsZSBtb3VzZSBidXR0b24gaXMgY2xpY2tlZCBpbiB0aGUgZWRpdG9yLlwiKSB9XG5cdCkpLFxuXHRtdWx0aUN1cnNvclBhc3RlOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ubXVsdGlDdXJzb3JQYXN0ZSwgJ211bHRpQ3Vyc29yUGFzdGUnLFxuXHRcdCdzcHJlYWQnIGFzICdzcHJlYWQnIHwgJ2Z1bGwnLFxuXHRcdFsnc3ByZWFkJywgJ2Z1bGwnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdtdWx0aUN1cnNvclBhc3RlLnNwcmVhZCcsIFwiRWFjaCBjdXJzb3IgcGFzdGVzIGEgc2luZ2xlIGxpbmUgb2YgdGhlIHRleHQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ211bHRpQ3Vyc29yUGFzdGUuZnVsbCcsIFwiRWFjaCBjdXJzb3IgcGFzdGVzIHRoZSBmdWxsIHRleHQuXCIpXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtdWx0aUN1cnNvclBhc3RlJywgXCJDb250cm9scyBwYXN0aW5nIHdoZW4gdGhlIGxpbmUgY291bnQgb2YgdGhlIHBhc3RlZCB0ZXh0IG1hdGNoZXMgdGhlIGN1cnNvciBjb3VudC5cIilcblx0XHR9XG5cdCkpLFxuXHRtdWx0aUN1cnNvckxpbWl0OiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5tdWx0aUN1cnNvckxpbWl0LCAnbXVsdGlDdXJzb3JMaW1pdCcsIDEwMDAwLCAxLCAxMDAwMDAsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdtdWx0aUN1cnNvckxpbWl0JywgXCJDb250cm9scyB0aGUgbWF4IG51bWJlciBvZiBjdXJzb3JzIHRoYXQgY2FuIGJlIGluIGFuIGFjdGl2ZSBlZGl0b3IgYXQgb25jZS5cIilcblx0XHR9XG5cdCkpLFxuXHRvY2N1cnJlbmNlc0hpZ2hsaWdodDogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLm9jY3VycmVuY2VzSGlnaGxpZ2h0LCAnb2NjdXJyZW5jZXNIaWdobGlnaHQnLFxuXHRcdCdzaW5nbGVGaWxlJyBhcyAnb2ZmJyB8ICdzaW5nbGVGaWxlJyB8ICdtdWx0aUZpbGUnLFxuXHRcdFsnb2ZmJywgJ3NpbmdsZUZpbGUnLCAnbXVsdGlGaWxlJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnb2NjdXJyZW5jZXNIaWdobGlnaHQub2ZmJywgXCJEb2VzIG5vdCBoaWdobGlnaHQgb2NjdXJyZW5jZXMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ29jY3VycmVuY2VzSGlnaGxpZ2h0LnNpbmdsZUZpbGUnLCBcIkhpZ2hsaWdodHMgb2NjdXJyZW5jZXMgb25seSBpbiB0aGUgY3VycmVudCBmaWxlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdvY2N1cnJlbmNlc0hpZ2hsaWdodC5tdWx0aUZpbGUnLCBcIkV4cGVyaW1lbnRhbDogSGlnaGxpZ2h0cyBvY2N1cnJlbmNlcyBhY3Jvc3MgYWxsIHZhbGlkIG9wZW4gZmlsZXMuXCIpXG5cdFx0XHRdLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdvY2N1cnJlbmNlc0hpZ2hsaWdodCcsIFwiQ29udHJvbHMgd2hldGhlciBvY2N1cnJlbmNlcyBzaG91bGQgYmUgaGlnaGxpZ2h0ZWQgYWNyb3NzIG9wZW4gZmlsZXMuXCIpXG5cdFx0fVxuXHQpKSxcblx0b2NjdXJyZW5jZXNIaWdobGlnaHREZWxheTogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ub2NjdXJyZW5jZXNIaWdobGlnaHREZWxheSwgJ29jY3VycmVuY2VzSGlnaGxpZ2h0RGVsYXknLFxuXHRcdDAsIDAsIDIwMDAsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb2NjdXJyZW5jZXNIaWdobGlnaHREZWxheScsIFwiQ29udHJvbHMgdGhlIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBhZnRlciB3aGljaCBvY2N1cnJlbmNlcyBhcmUgaGlnaGxpZ2h0ZWQuXCIpLFxuXHRcdFx0dGFnczogWydwcmV2aWV3J11cblx0XHR9XG5cdCkpLFxuXHRvdmVydHlwZU9uUGFzdGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5vdmVydHlwZU9uUGFzdGUsICdvdmVydHlwZU9uUGFzdGUnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb3ZlcnR5cGVPblBhc3RlJywgXCJDb250cm9scyB3aGV0aGVyIHBhc3Rpbmcgc2hvdWxkIG92ZXJ0eXBlLlwiKSB9XG5cdCkpLFxuXHRvdmVydmlld1J1bGVyQm9yZGVyOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ub3ZlcnZpZXdSdWxlckJvcmRlciwgJ292ZXJ2aWV3UnVsZXJCb3JkZXInLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnb3ZlcnZpZXdSdWxlckJvcmRlcicsIFwiQ29udHJvbHMgd2hldGhlciBhIGJvcmRlciBzaG91bGQgYmUgZHJhd24gYXJvdW5kIHRoZSBvdmVydmlldyBydWxlci5cIikgfVxuXHQpKSxcblx0b3ZlcnZpZXdSdWxlckxhbmVzOiByZWdpc3RlcihuZXcgRWRpdG9ySW50T3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5vdmVydmlld1J1bGVyTGFuZXMsICdvdmVydmlld1J1bGVyTGFuZXMnLFxuXHRcdDMsIDAsIDNcblx0KSksXG5cdHBhZGRpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JQYWRkaW5nKCkpLFxuXHRwYXN0ZUFzOiByZWdpc3RlcihuZXcgRWRpdG9yUGFzdGVBcygpKSxcblx0cGFyYW1ldGVySGludHM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JQYXJhbWV0ZXJIaW50cygpKSxcblx0cGVla1dpZGdldERlZmF1bHRGb2N1czogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnBlZWtXaWRnZXREZWZhdWx0Rm9jdXMsICdwZWVrV2lkZ2V0RGVmYXVsdEZvY3VzJyxcblx0XHQndHJlZScgYXMgJ3RyZWUnIHwgJ2VkaXRvcicsXG5cdFx0Wyd0cmVlJywgJ2VkaXRvciddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdwZWVrV2lkZ2V0RGVmYXVsdEZvY3VzLnRyZWUnLCBcIkZvY3VzIHRoZSB0cmVlIHdoZW4gb3BlbmluZyBwZWVrXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3BlZWtXaWRnZXREZWZhdWx0Rm9jdXMuZWRpdG9yJywgXCJGb2N1cyB0aGUgZWRpdG9yIHdoZW4gb3BlbmluZyBwZWVrXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncGVla1dpZGdldERlZmF1bHRGb2N1cycsIFwiQ29udHJvbHMgd2hldGhlciB0byBmb2N1cyB0aGUgaW5saW5lIGVkaXRvciBvciB0aGUgdHJlZSBpbiB0aGUgcGVlayB3aWRnZXQuXCIpXG5cdFx0fVxuXHQpKSxcblx0cGxhY2Vob2xkZXI6IHJlZ2lzdGVyKG5ldyBQbGFjZWhvbGRlck9wdGlvbigpKSxcblx0ZGVmaW5pdGlvbkxpbmtPcGVuc0luUGVlazogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLmRlZmluaXRpb25MaW5rT3BlbnNJblBlZWssICdkZWZpbml0aW9uTGlua09wZW5zSW5QZWVrJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkZWZpbml0aW9uTGlua09wZW5zSW5QZWVrJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBHbyB0byBEZWZpbml0aW9uIG1vdXNlIGdlc3R1cmUgYWx3YXlzIG9wZW5zIHRoZSBwZWVrIHdpZGdldC5cIikgfVxuXHQpKSxcblx0cXVpY2tTdWdnZXN0aW9uczogcmVnaXN0ZXIobmV3IEVkaXRvclF1aWNrU3VnZ2VzdGlvbnMoKSksXG5cdHF1aWNrU3VnZ2VzdGlvbnNEZWxheTogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucXVpY2tTdWdnZXN0aW9uc0RlbGF5LCAncXVpY2tTdWdnZXN0aW9uc0RlbGF5Jyxcblx0XHQxMCwgMCwgQ29uc3RhbnRzLk1BWF9TQUZFX1NNQUxMX0lOVEVHRVIsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncXVpY2tTdWdnZXN0aW9uc0RlbGF5JywgXCJDb250cm9scyB0aGUgZGVsYXkgaW4gbWlsbGlzZWNvbmRzIGFmdGVyIHdoaWNoIHF1aWNrIHN1Z2dlc3Rpb25zIHdpbGwgc2hvdyB1cC5cIiksXG5cdFx0XHRleHBlcmltZW50OiB7XG5cdFx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdFx0fVxuXHRcdH1cblx0KSksXG5cdHJlYWRPbmx5OiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVhZE9ubHksICdyZWFkT25seScsIGZhbHNlLFxuXHQpKSxcblx0cmVhZE9ubHlNZXNzYWdlOiByZWdpc3RlcihuZXcgUmVhZG9ubHlNZXNzYWdlKCkpLFxuXHRyZW5hbWVPblR5cGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5yZW5hbWVPblR5cGUsICdyZW5hbWVPblR5cGUnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3JlbmFtZU9uVHlwZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIGF1dG8gcmVuYW1lcyBvbiB0eXBlLlwiKSwgbWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgncmVuYW1lT25UeXBlRGVwcmVjYXRlJywgXCJEZXByZWNhdGVkLCB1c2UgYCNlZGl0b3IubGlua2VkRWRpdGluZyNgIGluc3RlYWQuXCIpIH1cblx0KSksXG5cdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVuZGVyQ29udHJvbENoYXJhY3RlcnMsICdyZW5kZXJDb250cm9sQ2hhcmFjdGVycycsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5kZXJDb250cm9sQ2hhcmFjdGVycycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCByZW5kZXIgY29udHJvbCBjaGFyYWN0ZXJzLlwiKSwgcmVzdHJpY3RlZDogdHJ1ZSB9XG5cdCkpLFxuXHRyZW5kZXJGaW5hbE5ld2xpbmU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5yZW5kZXJGaW5hbE5ld2xpbmUsICdyZW5kZXJGaW5hbE5ld2xpbmUnLFxuXHRcdChwbGF0Zm9ybS5pc0xpbnV4ID8gJ2RpbW1lZCcgOiAnb24nKSBhcyAnb2ZmJyB8ICdvbicgfCAnZGltbWVkJyxcblx0XHRbJ29mZicsICdvbicsICdkaW1tZWQnXSBhcyBjb25zdCxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3JlbmRlckZpbmFsTmV3bGluZScsIFwiUmVuZGVyIGxhc3QgbGluZSBudW1iZXIgd2hlbiB0aGUgZmlsZSBlbmRzIHdpdGggYSBuZXdsaW5lLlwiKSB9XG5cdCkpLFxuXHRyZW5kZXJMaW5lSGlnaGxpZ2h0OiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVuZGVyTGluZUhpZ2hsaWdodCwgJ3JlbmRlckxpbmVIaWdobGlnaHQnLFxuXHRcdCdsaW5lJyBhcyAnbm9uZScgfCAnZ3V0dGVyJyB8ICdsaW5lJyB8ICdhbGwnLFxuXHRcdFsnbm9uZScsICdndXR0ZXInLCAnbGluZScsICdhbGwnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVuZGVyTGluZUhpZ2hsaWdodC5hbGwnLCBcIkhpZ2hsaWdodHMgYm90aCB0aGUgZ3V0dGVyIGFuZCB0aGUgY3VycmVudCBsaW5lLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyZW5kZXJMaW5lSGlnaGxpZ2h0JywgXCJDb250cm9scyBob3cgdGhlIGVkaXRvciBzaG91bGQgcmVuZGVyIHRoZSBjdXJyZW50IGxpbmUgaGlnaGxpZ2h0LlwiKVxuXHRcdH1cblx0KSksXG5cdHJlbmRlckxpbmVIaWdobGlnaHRPbmx5V2hlbkZvY3VzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVuZGVyTGluZUhpZ2hsaWdodE9ubHlXaGVuRm9jdXMsICdyZW5kZXJMaW5lSGlnaGxpZ2h0T25seVdoZW5Gb2N1cycsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncmVuZGVyTGluZUhpZ2hsaWdodE9ubHlXaGVuRm9jdXMnLCBcIkNvbnRyb2xzIGlmIHRoZSBlZGl0b3Igc2hvdWxkIHJlbmRlciB0aGUgY3VycmVudCBsaW5lIGhpZ2hsaWdodCBvbmx5IHdoZW4gdGhlIGVkaXRvciBpcyBmb2N1c2VkLlwiKSB9XG5cdCkpLFxuXHRyZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5yZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMsICdyZW5kZXJWYWxpZGF0aW9uRGVjb3JhdGlvbnMnLFxuXHRcdCdlZGl0YWJsZScgYXMgJ2VkaXRhYmxlJyB8ICdvbicgfCAnb2ZmJyxcblx0XHRbJ2VkaXRhYmxlJywgJ29uJywgJ29mZiddIGFzIGNvbnN0XG5cdCkpLFxuXHRyZW5kZXJXaGl0ZXNwYWNlOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ucmVuZGVyV2hpdGVzcGFjZSwgJ3JlbmRlcldoaXRlc3BhY2UnLFxuXHRcdCdzZWxlY3Rpb24nIGFzICdzZWxlY3Rpb24nIHwgJ25vbmUnIHwgJ2JvdW5kYXJ5JyB8ICd0cmFpbGluZycgfCAnYWxsJyxcblx0XHRbJ25vbmUnLCAnYm91bmRhcnknLCAnc2VsZWN0aW9uJywgJ3RyYWlsaW5nJywgJ2FsbCddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVuZGVyV2hpdGVzcGFjZS5ib3VuZGFyeScsIFwiUmVuZGVyIHdoaXRlc3BhY2UgY2hhcmFjdGVycyBleGNlcHQgZm9yIHNpbmdsZSBzcGFjZXMgYmV0d2VlbiB3b3Jkcy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgncmVuZGVyV2hpdGVzcGFjZS5zZWxlY3Rpb24nLCBcIlJlbmRlciB3aGl0ZXNwYWNlIGNoYXJhY3RlcnMgb25seSBvbiBzZWxlY3RlZCB0ZXh0LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZW5kZXJXaGl0ZXNwYWNlLnRyYWlsaW5nJywgXCJSZW5kZXIgb25seSB0cmFpbGluZyB3aGl0ZXNwYWNlIGNoYXJhY3RlcnMuXCIpLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3JlbmRlcldoaXRlc3BhY2UnLCBcIkNvbnRyb2xzIGhvdyB0aGUgZWRpdG9yIHNob3VsZCByZW5kZXIgd2hpdGVzcGFjZSBjaGFyYWN0ZXJzLlwiKVxuXHRcdH1cblx0KSksXG5cdHJldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmc6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnJldmVhbEhvcml6b250YWxSaWdodFBhZGRpbmcsICdyZXZlYWxIb3Jpem9udGFsUmlnaHRQYWRkaW5nJyxcblx0XHQxNSwgMCwgMTAwMCxcblx0KSksXG5cdHJvdW5kZWRTZWxlY3Rpb246IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5yb3VuZGVkU2VsZWN0aW9uLCAncm91bmRlZFNlbGVjdGlvbicsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdyb3VuZGVkU2VsZWN0aW9uJywgXCJDb250cm9scyB3aGV0aGVyIHNlbGVjdGlvbnMgc2hvdWxkIGhhdmUgcm91bmRlZCBjb3JuZXJzLlwiKSB9XG5cdCkpLFxuXHRydWxlcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JSdWxlcnMoKSksXG5cdHNjcm9sbGJhcjogcmVnaXN0ZXIobmV3IEVkaXRvclNjcm9sbGJhcigpKSxcblx0c2Nyb2xsQmV5b25kTGFzdENvbHVtbjogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2Nyb2xsQmV5b25kTGFzdENvbHVtbiwgJ3Njcm9sbEJleW9uZExhc3RDb2x1bW4nLFxuXHRcdDQsIDAsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2Nyb2xsQmV5b25kTGFzdENvbHVtbicsIFwiQ29udHJvbHMgdGhlIG51bWJlciBvZiBleHRyYSBjaGFyYWN0ZXJzIGJleW9uZCB3aGljaCB0aGUgZWRpdG9yIHdpbGwgc2Nyb2xsIGhvcml6b250YWxseS5cIikgfVxuXHQpKSxcblx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zY3JvbGxCZXlvbmRMYXN0TGluZSwgJ3Njcm9sbEJleW9uZExhc3RMaW5lJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbEJleW9uZExhc3RMaW5lJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igd2lsbCBzY3JvbGwgYmV5b25kIHRoZSBsYXN0IGxpbmUuXCIpIH1cblx0KSksXG5cdHNjcm9sbE9uTWlkZGxlQ2xpY2s6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zY3JvbGxPbk1pZGRsZUNsaWNrLCAnc2Nyb2xsT25NaWRkbGVDbGljaycsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2Nyb2xsT25NaWRkbGVDbGljaycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHdpbGwgc2Nyb2xsIHdoZW4gdGhlIG1pZGRsZSBidXR0b24gaXMgcHJlc3NlZC5cIikgfVxuXHQpKSxcblx0c2Nyb2xsUHJlZG9taW5hbnRBeGlzOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2Nyb2xsUHJlZG9taW5hbnRBeGlzLCAnc2Nyb2xsUHJlZG9taW5hbnRBeGlzJywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Njcm9sbFByZWRvbWluYW50QXhpcycsIFwiU2Nyb2xsIG9ubHkgYWxvbmcgdGhlIHByZWRvbWluYW50IGF4aXMgd2hlbiBzY3JvbGxpbmcgYm90aCB2ZXJ0aWNhbGx5IGFuZCBob3Jpem9udGFsbHkgYXQgdGhlIHNhbWUgdGltZS4gUHJldmVudHMgaG9yaXpvbnRhbCBkcmlmdCB3aGVuIHNjcm9sbGluZyB2ZXJ0aWNhbGx5IG9uIGEgdHJhY2twYWQuXCIpIH1cblx0KSksXG5cdHNlbGVjdGlvbkNsaXBib2FyZDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNlbGVjdGlvbkNsaXBib2FyZCwgJ3NlbGVjdGlvbkNsaXBib2FyZCcsIHRydWUsXG5cdFx0e1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VsZWN0aW9uQ2xpcGJvYXJkJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBMaW51eCBwcmltYXJ5IGNsaXBib2FyZCBzaG91bGQgYmUgc3VwcG9ydGVkLlwiKSxcblx0XHRcdGluY2x1ZGVkOiBwbGF0Zm9ybS5pc0xpbnV4XG5cdFx0fVxuXHQpKSxcblx0c2VsZWN0aW9uSGlnaGxpZ2h0OiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2VsZWN0aW9uSGlnaGxpZ2h0LCAnc2VsZWN0aW9uSGlnaGxpZ2h0JywgdHJ1ZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NlbGVjdGlvbkhpZ2hsaWdodCcsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgZWRpdG9yIHNob3VsZCBoaWdobGlnaHQgbWF0Y2hlcyBzaW1pbGFyIHRvIHRoZSBzZWxlY3Rpb24uXCIpIH1cblx0KSksXG5cdHNlbGVjdGlvbkhpZ2hsaWdodE1heExlbmd0aDogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2VsZWN0aW9uSGlnaGxpZ2h0TWF4TGVuZ3RoLCAnc2VsZWN0aW9uSGlnaGxpZ2h0TWF4TGVuZ3RoJyxcblx0XHQyMDAsIDAsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VsZWN0aW9uSGlnaGxpZ2h0TWF4TGVuZ3RoJywgXCJDb250cm9scyBob3cgbWFueSBjaGFyYWN0ZXJzIGNhbiBiZSBpbiB0aGUgc2VsZWN0aW9uIGJlZm9yZSBzaW1pbGlhciBtYXRjaGVzIGFyZSBub3QgaGlnaGxpZ2h0ZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXCIpIH1cblx0KSksXG5cdHNlbGVjdGlvbkhpZ2hsaWdodE11bHRpbGluZTogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNlbGVjdGlvbkhpZ2hsaWdodE11bHRpbGluZSwgJ3NlbGVjdGlvbkhpZ2hsaWdodE11bHRpbGluZScsIGZhbHNlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2VsZWN0aW9uSGlnaGxpZ2h0TXVsdGlsaW5lJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3Igc2hvdWxkIGhpZ2hsaWdodCBzZWxlY3Rpb24gbWF0Y2hlcyB0aGF0IHNwYW4gbXVsdGlwbGUgbGluZXMuXCIpIH1cblx0KSksXG5cdHNlbGVjdE9uTGluZU51bWJlcnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zZWxlY3RPbkxpbmVOdW1iZXJzLCAnc2VsZWN0T25MaW5lTnVtYmVycycsIHRydWUsXG5cdCkpLFxuXHRzaG93Rm9sZGluZ0NvbnRyb2xzOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc2hvd0ZvbGRpbmdDb250cm9scywgJ3Nob3dGb2xkaW5nQ29udHJvbHMnLFxuXHRcdCdtb3VzZW92ZXInIGFzICdhbHdheXMnIHwgJ25ldmVyJyB8ICdtb3VzZW92ZXInLFxuXHRcdFsnYWx3YXlzJywgJ25ldmVyJywgJ21vdXNlb3ZlciddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzaG93Rm9sZGluZ0NvbnRyb2xzLmFsd2F5cycsIFwiQWx3YXlzIHNob3cgdGhlIGZvbGRpbmcgY29udHJvbHMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Nob3dGb2xkaW5nQ29udHJvbHMubmV2ZXInLCBcIk5ldmVyIHNob3cgdGhlIGZvbGRpbmcgY29udHJvbHMgYW5kIHJlZHVjZSB0aGUgZ3V0dGVyIHNpemUuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3Nob3dGb2xkaW5nQ29udHJvbHMubW91c2VvdmVyJywgXCJPbmx5IHNob3cgdGhlIGZvbGRpbmcgY29udHJvbHMgd2hlbiB0aGUgbW91c2UgaXMgb3ZlciB0aGUgZ3V0dGVyLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzaG93Rm9sZGluZ0NvbnRyb2xzJywgXCJDb250cm9scyB3aGVuIHRoZSBmb2xkaW5nIGNvbnRyb2xzIG9uIHRoZSBndXR0ZXIgYXJlIHNob3duLlwiKVxuXHRcdH1cblx0KSksXG5cdHNob3dVbnVzZWQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zaG93VW51c2VkLCAnc2hvd1VudXNlZCcsIHRydWUsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzaG93VW51c2VkJywgXCJDb250cm9scyBmYWRpbmcgb3V0IG9mIHVudXNlZCBjb2RlLlwiKSB9XG5cdCkpLFxuXHRzaG93RGVwcmVjYXRlZDogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnNob3dEZXByZWNhdGVkLCAnc2hvd0RlcHJlY2F0ZWQnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2hvd0RlcHJlY2F0ZWQnLCBcIkNvbnRyb2xzIHN0cmlrZXRocm91Z2ggZGVwcmVjYXRlZCB2YXJpYWJsZXMuXCIpIH1cblx0KSksXG5cdGlubGF5SGludHM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbmxheUhpbnRzKCkpLFxuXHRzbmlwcGV0U3VnZ2VzdGlvbnM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zbmlwcGV0U3VnZ2VzdGlvbnMsICdzbmlwcGV0U3VnZ2VzdGlvbnMnLFxuXHRcdCdpbmxpbmUnIGFzICd0b3AnIHwgJ2JvdHRvbScgfCAnaW5saW5lJyB8ICdub25lJyxcblx0XHRbJ3RvcCcsICdib3R0b20nLCAnaW5saW5lJywgJ25vbmUnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc25pcHBldFN1Z2dlc3Rpb25zLnRvcCcsIFwiU2hvdyBzbmlwcGV0IHN1Z2dlc3Rpb25zIG9uIHRvcCBvZiBvdGhlciBzdWdnZXN0aW9ucy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc25pcHBldFN1Z2dlc3Rpb25zLmJvdHRvbScsIFwiU2hvdyBzbmlwcGV0IHN1Z2dlc3Rpb25zIGJlbG93IG90aGVyIHN1Z2dlc3Rpb25zLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzbmlwcGV0U3VnZ2VzdGlvbnMuaW5saW5lJywgXCJTaG93IHNuaXBwZXRzIHN1Z2dlc3Rpb25zIHdpdGggb3RoZXIgc3VnZ2VzdGlvbnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NuaXBwZXRTdWdnZXN0aW9ucy5ub25lJywgXCJEbyBub3Qgc2hvdyBzbmlwcGV0IHN1Z2dlc3Rpb25zLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzbmlwcGV0U3VnZ2VzdGlvbnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc25pcHBldHMgYXJlIHNob3duIHdpdGggb3RoZXIgc3VnZ2VzdGlvbnMgYW5kIGhvdyB0aGV5IGFyZSBzb3J0ZWQuXCIpXG5cdFx0fVxuXHQpKSxcblx0c21hcnRTZWxlY3Q6IHJlZ2lzdGVyKG5ldyBTbWFydFNlbGVjdCgpKSxcblx0c21vb3RoU2Nyb2xsaW5nOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc21vb3RoU2Nyb2xsaW5nLCAnc21vb3RoU2Nyb2xsaW5nJywgZmFsc2UsXG5cdFx0eyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzbW9vdGhTY3JvbGxpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciB3aWxsIHNjcm9sbCB1c2luZyBhbiBhbmltYXRpb24uXCIpIH1cblx0KSksXG5cdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXIsICdzdG9wUmVuZGVyaW5nTGluZUFmdGVyJyxcblx0XHQxMDAwMCwgLTEsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHQpKSxcblx0c3VnZ2VzdDogcmVnaXN0ZXIobmV3IEVkaXRvclN1Z2dlc3QoKSksXG5cdGlubGluZVN1Z2dlc3Q6IHJlZ2lzdGVyKG5ldyBJbmxpbmVFZGl0b3JTdWdnZXN0KCkpLFxuXHRpbmxpbmVDb21wbGV0aW9uc0FjY2Vzc2liaWxpdHlWZXJib3NlOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihFZGl0b3JPcHRpb24uaW5saW5lQ29tcGxldGlvbnNBY2Nlc3NpYmlsaXR5VmVyYm9zZSwgJ2lubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2UnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2lubGluZUNvbXBsZXRpb25zQWNjZXNzaWJpbGl0eVZlcmJvc2UnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGFjY2Vzc2liaWxpdHkgaGludCBzaG91bGQgYmUgcHJvdmlkZWQgdG8gc2NyZWVuIHJlYWRlciB1c2VycyB3aGVuIGFuIGlubGluZSBjb21wbGV0aW9uIGlzIHNob3duLlwiKSB9KSksXG5cdHN1Z2dlc3RGb250U2l6ZTogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uc3VnZ2VzdEZvbnRTaXplLCAnc3VnZ2VzdEZvbnRTaXplJyxcblx0XHQwLCAwLCAxMDAwLFxuXHRcdHsgbWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0Rm9udFNpemUnLCBcIkZvbnQgc2l6ZSBmb3IgdGhlIHN1Z2dlc3Qgd2lkZ2V0LiBXaGVuIHNldCB0byB7MH0sIHRoZSB2YWx1ZSBvZiB7MX0gaXMgdXNlZC5cIiwgJ2AwYCcsICdgI2VkaXRvci5mb250U2l6ZSNgJykgfVxuXHQpKSxcblx0c3VnZ2VzdExpbmVIZWlnaHQ6IHJlZ2lzdGVyKG5ldyBFZGl0b3JJbnRPcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnN1Z2dlc3RMaW5lSGVpZ2h0LCAnc3VnZ2VzdExpbmVIZWlnaHQnLFxuXHRcdDAsIDAsIDEwMDAsXG5cdFx0eyBtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3N1Z2dlc3RMaW5lSGVpZ2h0JywgXCJMaW5lIGhlaWdodCBmb3IgdGhlIHN1Z2dlc3Qgd2lkZ2V0LiBXaGVuIHNldCB0byB7MH0sIHRoZSB2YWx1ZSBvZiB7MX0gaXMgdXNlZC4gVGhlIG1pbmltdW0gdmFsdWUgaXMgOC5cIiwgJ2AwYCcsICdgI2VkaXRvci5saW5lSGVpZ2h0I2AnKSB9XG5cdCkpLFxuXHRzdWdnZXN0T25UcmlnZ2VyQ2hhcmFjdGVyczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnN1Z2dlc3RPblRyaWdnZXJDaGFyYWN0ZXJzLCAnc3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnMnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc3VnZ2VzdE9uVHJpZ2dlckNoYXJhY3RlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgc3VnZ2VzdGlvbnMgc2hvdWxkIGF1dG9tYXRpY2FsbHkgc2hvdyB1cCB3aGVuIHR5cGluZyB0cmlnZ2VyIGNoYXJhY3RlcnMuXCIpIH1cblx0KSksXG5cdHN1Z2dlc3RTZWxlY3Rpb246IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi5zdWdnZXN0U2VsZWN0aW9uLCAnc3VnZ2VzdFNlbGVjdGlvbicsXG5cdFx0J2ZpcnN0JyBhcyAnZmlyc3QnIHwgJ3JlY2VudGx5VXNlZCcgfCAncmVjZW50bHlVc2VkQnlQcmVmaXgnLFxuXHRcdFsnZmlyc3QnLCAncmVjZW50bHlVc2VkJywgJ3JlY2VudGx5VXNlZEJ5UHJlZml4J10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc3VnZ2VzdFNlbGVjdGlvbi5maXJzdCcsIFwiQWx3YXlzIHNlbGVjdCB0aGUgZmlyc3Qgc3VnZ2VzdGlvbi5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc3VnZ2VzdFNlbGVjdGlvbi5yZWNlbnRseVVzZWQnLCBcIlNlbGVjdCByZWNlbnQgc3VnZ2VzdGlvbnMgdW5sZXNzIGZ1cnRoZXIgdHlwaW5nIHNlbGVjdHMgb25lLCBlLmcuIGBjb25zb2xlLnwgLT4gY29uc29sZS5sb2dgIGJlY2F1c2UgYGxvZ2AgaGFzIGJlZW4gY29tcGxldGVkIHJlY2VudGx5LlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzdWdnZXN0U2VsZWN0aW9uLnJlY2VudGx5VXNlZEJ5UHJlZml4JywgXCJTZWxlY3Qgc3VnZ2VzdGlvbnMgYmFzZWQgb24gcHJldmlvdXMgcHJlZml4ZXMgdGhhdCBoYXZlIGNvbXBsZXRlZCB0aG9zZSBzdWdnZXN0aW9ucywgZS5nLiBgY28gLT4gY29uc29sZWAgYW5kIGBjb24gLT4gY29uc3RgLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzdWdnZXN0U2VsZWN0aW9uJywgXCJDb250cm9scyBob3cgc3VnZ2VzdGlvbnMgYXJlIHByZS1zZWxlY3RlZCB3aGVuIHNob3dpbmcgdGhlIHN1Z2dlc3QgbGlzdC5cIilcblx0XHR9XG5cdCkpLFxuXHR0YWJDb21wbGV0aW9uOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24udGFiQ29tcGxldGlvbiwgJ3RhYkNvbXBsZXRpb24nLFxuXHRcdCdvZmYnIGFzICdvbicgfCAnb2ZmJyB8ICdvbmx5U25pcHBldHMnLFxuXHRcdFsnb24nLCAnb2ZmJywgJ29ubHlTbmlwcGV0cyddIGFzIGNvbnN0LFxuXHRcdHtcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YWJDb21wbGV0aW9uLm9uJywgXCJUYWIgY29tcGxldGUgd2lsbCBpbnNlcnQgdGhlIGJlc3QgbWF0Y2hpbmcgc3VnZ2VzdGlvbiB3aGVuIHByZXNzaW5nIHRhYi5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndGFiQ29tcGxldGlvbi5vZmYnLCBcIkRpc2FibGUgdGFiIGNvbXBsZXRpb25zLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YWJDb21wbGV0aW9uLm9ubHlTbmlwcGV0cycsIFwiVGFiIGNvbXBsZXRlIHNuaXBwZXRzIHdoZW4gdGhlaXIgcHJlZml4IG1hdGNoLiBXb3JrcyBiZXN0IHdoZW4gJ3F1aWNrU3VnZ2VzdGlvbnMnIGFyZW4ndCBlbmFibGVkLlwiKSxcblx0XHRcdF0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YWJDb21wbGV0aW9uJywgXCJFbmFibGVzIHRhYiBjb21wbGV0aW9ucy5cIilcblx0XHR9XG5cdCkpLFxuXHR0YWJJbmRleDogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24udGFiSW5kZXgsICd0YWJJbmRleCcsXG5cdFx0MCwgLTEsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSXG5cdCkpLFxuXHR0cmltV2hpdGVzcGFjZU9uRGVsZXRlOiByZWdpc3RlcihuZXcgRWRpdG9yQm9vbGVhbk9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24udHJpbVdoaXRlc3BhY2VPbkRlbGV0ZSwgJ3RyaW1XaGl0ZXNwYWNlT25EZWxldGUnLCBmYWxzZSxcblx0XHR7IGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3RyaW1XaGl0ZXNwYWNlT25EZWxldGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGVkaXRvciB3aWxsIGFsc28gZGVsZXRlIHRoZSBuZXh0IGxpbmUncyBpbmRlbnRhdGlvbiB3aGl0ZXNwYWNlIHdoZW4gZGVsZXRpbmcgYSBuZXdsaW5lLlwiKSB9XG5cdCkpLFxuXHR1bmljb2RlSGlnaGxpZ2h0OiByZWdpc3RlcihuZXcgVW5pY29kZUhpZ2hsaWdodCgpKSxcblx0dW51c3VhbExpbmVUZXJtaW5hdG9yczogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ0VudW1PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnVudXN1YWxMaW5lVGVybWluYXRvcnMsICd1bnVzdWFsTGluZVRlcm1pbmF0b3JzJyxcblx0XHQncHJvbXB0JyBhcyAnYXV0bycgfCAnb2ZmJyB8ICdwcm9tcHQnLFxuXHRcdFsnYXV0bycsICdvZmYnLCAncHJvbXB0J10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3VudXN1YWxMaW5lVGVybWluYXRvcnMuYXV0bycsIFwiVW51c3VhbCBsaW5lIHRlcm1pbmF0b3JzIGFyZSBhdXRvbWF0aWNhbGx5IHJlbW92ZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3VudXN1YWxMaW5lVGVybWluYXRvcnMub2ZmJywgXCJVbnVzdWFsIGxpbmUgdGVybWluYXRvcnMgYXJlIGlnbm9yZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3VudXN1YWxMaW5lVGVybWluYXRvcnMucHJvbXB0JywgXCJVbnVzdWFsIGxpbmUgdGVybWluYXRvcnMgcHJvbXB0IHRvIGJlIHJlbW92ZWQuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3VudXN1YWxMaW5lVGVybWluYXRvcnMnLCBcIlJlbW92ZSB1bnVzdWFsIGxpbmUgdGVybWluYXRvcnMgdGhhdCBtaWdodCBjYXVzZSBwcm9ibGVtcy5cIilcblx0XHR9XG5cdCkpLFxuXHR1c2VTaGFkb3dET006IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi51c2VTaGFkb3dET00sICd1c2VTaGFkb3dET00nLCB0cnVlXG5cdCkpLFxuXHR1c2VUYWJTdG9wczogcmVnaXN0ZXIobmV3IEVkaXRvckJvb2xlYW5PcHRpb24oXG5cdFx0RWRpdG9yT3B0aW9uLnVzZVRhYlN0b3BzLCAndXNlVGFiU3RvcHMnLCB0cnVlLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndXNlVGFiU3RvcHMnLCBcIlNwYWNlcyBhbmQgdGFicyBhcmUgaW5zZXJ0ZWQgYW5kIGRlbGV0ZWQgaW4gYWxpZ25tZW50IHdpdGggdGFiIHN0b3BzLlwiKSB9XG5cdCkpLFxuXHR3b3JkQnJlYWs6IHJlZ2lzdGVyKG5ldyBFZGl0b3JTdHJpbmdFbnVtT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi53b3JkQnJlYWssICd3b3JkQnJlYWsnLFxuXHRcdCdub3JtYWwnIGFzICdub3JtYWwnIHwgJ2tlZXBBbGwnLFxuXHRcdFsnbm9ybWFsJywgJ2tlZXBBbGwnXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkQnJlYWsubm9ybWFsJywgXCJVc2UgdGhlIGRlZmF1bHQgbGluZSBicmVhayBydWxlLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd3b3JkQnJlYWsua2VlcEFsbCcsIFwiV29yZCBicmVha3Mgc2hvdWxkIG5vdCBiZSB1c2VkIGZvciBDaGluZXNlL0phcGFuZXNlL0tvcmVhbiAoQ0pLKSB0ZXh0LiBOb24tQ0pLIHRleHQgYmVoYXZpb3IgaXMgdGhlIHNhbWUgYXMgZm9yIG5vcm1hbC5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29yZEJyZWFrJywgXCJDb250cm9scyB0aGUgd29yZCBicmVhayBydWxlcyB1c2VkIGZvciBDaGluZXNlL0phcGFuZXNlL0tvcmVhbiAoQ0pLKSB0ZXh0LlwiKVxuXHRcdH1cblx0KSksXG5cdHdvcmRTZWdtZW50ZXJMb2NhbGVzOiByZWdpc3RlcihuZXcgV29yZFNlZ21lbnRlckxvY2FsZXMoKSksXG5cdHdvcmRTZXBhcmF0b3JzOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi53b3JkU2VwYXJhdG9ycywgJ3dvcmRTZXBhcmF0b3JzJywgVVNVQUxfV09SRF9TRVBBUkFUT1JTLFxuXHRcdHsgZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnd29yZFNlcGFyYXRvcnMnLCBcIkNoYXJhY3RlcnMgdGhhdCB3aWxsIGJlIHVzZWQgYXMgd29yZCBzZXBhcmF0b3JzIHdoZW4gZG9pbmcgd29yZCByZWxhdGVkIG5hdmlnYXRpb25zIG9yIG9wZXJhdGlvbnMuXCIpIH1cblx0KSksXG5cdHdvcmRXcmFwOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZFdyYXAsICd3b3JkV3JhcCcsXG5cdFx0J29mZicgYXMgJ29mZicgfCAnb24nIHwgJ3dvcmRXcmFwQ29sdW1uJyB8ICdib3VuZGVkJyxcblx0XHRbJ29mZicsICdvbicsICd3b3JkV3JhcENvbHVtbicsICdib3VuZGVkJ10gYXMgY29uc3QsXG5cdFx0e1xuXHRcdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnd29yZFdyYXAub2ZmJywgXCJMaW5lcyB3aWxsIG5ldmVyIHdyYXAuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3dvcmRXcmFwLm9uJywgXCJMaW5lcyB3aWxsIHdyYXAgYXQgdGhlIHZpZXdwb3J0IHdpZHRoLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICd3b3JkV3JhcC53b3JkV3JhcENvbHVtbicsXG5cdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0Jy0gYGVkaXRvci53b3JkV3JhcENvbHVtbmAgcmVmZXJzIHRvIGEgZGlmZmVyZW50IHNldHRpbmcgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLidcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sIFwiTGluZXMgd2lsbCB3cmFwIGF0IGAjZWRpdG9yLndvcmRXcmFwQ29sdW1uI2AuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdGtleTogJ3dvcmRXcmFwLmJvdW5kZWQnLFxuXHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdCctIHZpZXdwb3J0IG1lYW5zIHRoZSBlZGdlIG9mIHRoZSB2aXNpYmxlIHdpbmRvdyBzaXplLicsXG5cdFx0XHRcdFx0XHQnLSBgZWRpdG9yLndvcmRXcmFwQ29sdW1uYCByZWZlcnMgdG8gYSBkaWZmZXJlbnQgc2V0dGluZyBhbmQgc2hvdWxkIG5vdCBiZSBsb2NhbGl6ZWQuJ1xuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSwgXCJMaW5lcyB3aWxsIHdyYXAgYXQgdGhlIG1pbmltdW0gb2Ygdmlld3BvcnQgYW5kIGAjZWRpdG9yLndvcmRXcmFwQ29sdW1uI2AuXCIpLFxuXHRcdFx0XSxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoe1xuXHRcdFx0XHRrZXk6ICd3b3JkV3JhcCcsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnLSBcXCdvZmZcXCcsIFxcJ29uXFwnLCBcXCd3b3JkV3JhcENvbHVtblxcJyBhbmQgXFwnYm91bmRlZFxcJyByZWZlciB0byB2YWx1ZXMgdGhlIHNldHRpbmcgY2FuIHRha2UgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLicsXG5cdFx0XHRcdFx0Jy0gYGVkaXRvci53b3JkV3JhcENvbHVtbmAgcmVmZXJzIHRvIGEgZGlmZmVyZW50IHNldHRpbmcgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJDb250cm9scyBob3cgbGluZXMgc2hvdWxkIHdyYXAuXCIpXG5cdFx0fVxuXHQpKSxcblx0d29yZFdyYXBCcmVha0FmdGVyQ2hhcmFjdGVyczogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ09wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZFdyYXBCcmVha0FmdGVyQ2hhcmFjdGVycywgJ3dvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMnLFxuXHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdCcgXFx0fSldP3wvJi4sO1x1MDBBMlx1MDBCMFx1MjAzMlx1MjAzM1x1MjAzMFx1MjEwM1x1MzAwMVx1MzAwMlx1RkY2MVx1RkY2NFx1RkZFMFx1RkYwQ1x1RkYwRVx1RkYxQVx1RkYxQlx1RkYxRlx1RkYwMVx1RkYwNVx1MzBGQlx1RkY2NVx1MzA5RFx1MzA5RVx1MzBGRFx1MzBGRVx1MzBGQ1x1MzBBMVx1MzBBM1x1MzBBNVx1MzBBN1x1MzBBOVx1MzBDM1x1MzBFM1x1MzBFNVx1MzBFN1x1MzBFRVx1MzBGNVx1MzBGNlx1MzA0MVx1MzA0M1x1MzA0NVx1MzA0N1x1MzA0OVx1MzA2M1x1MzA4M1x1MzA4NVx1MzA4N1x1MzA4RVx1MzA5NVx1MzA5Nlx1MzFGMFx1MzFGMVx1MzFGMlx1MzFGM1x1MzFGNFx1MzFGNVx1MzFGNlx1MzFGN1x1MzFGOFx1MzFGOVx1MzFGQVx1MzFGQlx1MzFGQ1x1MzFGRFx1MzFGRVx1MzFGRlx1MzAwNVx1MzAzQlx1RkY2N1x1RkY2OFx1RkY2OVx1RkY2QVx1RkY2Qlx1RkY2Q1x1RkY2RFx1RkY2RVx1RkY2Rlx1RkY3MFx1MjAxRFx1MzAwOVx1MzAwQlx1MzAwRFx1MzAwRlx1MzAxMVx1MzAxNVx1RkYwOVx1RkYzRFx1RkY1RFx1RkY2MycsXG5cdCkpLFxuXHR3b3JkV3JhcEJyZWFrQmVmb3JlQ2hhcmFjdGVyczogcmVnaXN0ZXIobmV3IEVkaXRvclN0cmluZ09wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnMsICd3b3JkV3JhcEJyZWFrQmVmb3JlQ2hhcmFjdGVycycsXG5cdFx0Ly8gYWxsb3ctYW55LXVuaWNvZGUtbmV4dC1saW5lXG5cdFx0Jyhbe1x1MjAxOFx1MjAxQ1x1MzAwOFx1MzAwQVx1MzAwQ1x1MzAwRVx1MzAxMFx1MzAxNFx1RkYwOFx1RkYzQlx1RkY1Qlx1RkY2Mlx1MDBBM1x1MDBBNVx1RkYwNFx1RkZFMVx1RkZFNStcdUZGMEInXG5cdCkpLFxuXHR3b3JkV3JhcENvbHVtbjogcmVnaXN0ZXIobmV3IEVkaXRvckludE9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZFdyYXBDb2x1bW4sICd3b3JkV3JhcENvbHVtbicsXG5cdFx0ODAsIDEsIENvbnN0YW50cy5NQVhfU0FGRV9TTUFMTF9JTlRFR0VSLFxuXHRcdHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ3dvcmRXcmFwQ29sdW1uJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCctIGBlZGl0b3Iud29yZFdyYXBgIHJlZmVycyB0byBhIGRpZmZlcmVudCBzZXR0aW5nIGFuZCBzaG91bGQgbm90IGJlIGxvY2FsaXplZC4nLFxuXHRcdFx0XHRcdCctIFxcJ3dvcmRXcmFwQ29sdW1uXFwnIGFuZCBcXCdib3VuZGVkXFwnIHJlZmVyIHRvIHZhbHVlcyB0aGUgZGlmZmVyZW50IHNldHRpbmcgY2FuIHRha2UgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJDb250cm9scyB0aGUgd3JhcHBpbmcgY29sdW1uIG9mIHRoZSBlZGl0b3Igd2hlbiBgI2VkaXRvci53b3JkV3JhcCNgIGlzIGB3b3JkV3JhcENvbHVtbmAgb3IgYGJvdW5kZWRgLlwiKVxuXHRcdH1cblx0KSksXG5cdHdvcmRXcmFwT3ZlcnJpZGUxOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZFdyYXBPdmVycmlkZTEsICd3b3JkV3JhcE92ZXJyaWRlMScsXG5cdFx0J2luaGVyaXQnIGFzICdvZmYnIHwgJ29uJyB8ICdpbmhlcml0Jyxcblx0XHRbJ29mZicsICdvbicsICdpbmhlcml0J10gYXMgY29uc3Rcblx0KSksXG5cdHdvcmRXcmFwT3ZlcnJpZGUyOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24ud29yZFdyYXBPdmVycmlkZTIsICd3b3JkV3JhcE92ZXJyaWRlMicsXG5cdFx0J2luaGVyaXQnIGFzICdvZmYnIHwgJ29uJyB8ICdpbmhlcml0Jyxcblx0XHRbJ29mZicsICdvbicsICdpbmhlcml0J10gYXMgY29uc3Rcblx0KSksXG5cdHdyYXBPbkVzY2FwZWRMaW5lRmVlZHM6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKFxuXHRcdEVkaXRvck9wdGlvbi53cmFwT25Fc2NhcGVkTGluZUZlZWRzLCAnd3JhcE9uRXNjYXBlZExpbmVGZWVkcycsIGZhbHNlLFxuXHRcdHsgbWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd3cmFwT25Fc2NhcGVkTGluZUZlZWRzJywgXCJDb250cm9scyB3aGV0aGVyIGxpdGVyYWwgYFxcXFxuYCBzaGFsbCB0cmlnZ2VyIGEgd29yZFdyYXAgd2hlbiBgI2VkaXRvci53b3JkV3JhcCNgIGlzIGVuYWJsZWQuXFxuXFxuRm9yIGV4YW1wbGU6XFxuYGBgY1xcbmNoYXIqIHN0cj1cXFwiaGVsbG9cXFxcbndvcmxkXFxcIlxcbmBgYFxcbndpbGwgYmUgZGlzcGxheWVkIGFzXFxuYGBgY1xcbmNoYXIqIHN0cj1cXFwiaGVsbG9cXFxcblxcbiAgICAgICAgICAgd29ybGRcXFwiXFxuYGBgXCIpIH1cblx0KSksXG5cblx0Ly8gTGVhdmUgdGhlc2UgYXQgdGhlIGVuZCAoYmVjYXVzZSB0aGV5IGhhdmUgZGVwZW5kZW5jaWVzISlcblx0ZWZmZWN0aXZlQ3Vyc29yU3R5bGU6IHJlZ2lzdGVyKG5ldyBFZmZlY3RpdmVDdXJzb3JTdHlsZSgpKSxcblx0ZWRpdG9yQ2xhc3NOYW1lOiByZWdpc3RlcihuZXcgRWRpdG9yQ2xhc3NOYW1lKCkpLFxuXHRkZWZhdWx0Q29sb3JEZWNvcmF0b3JzOiByZWdpc3RlcihuZXcgRWRpdG9yU3RyaW5nRW51bU9wdGlvbihcblx0XHRFZGl0b3JPcHRpb24uZGVmYXVsdENvbG9yRGVjb3JhdG9ycywgJ2RlZmF1bHRDb2xvckRlY29yYXRvcnMnLCAnYXV0bycgYXMgJ2F1dG8nIHwgJ2Fsd2F5cycgfCAnbmV2ZXInLFxuXHRcdFsnYXV0bycsICdhbHdheXMnLCAnbmV2ZXInXSBhcyBjb25zdCxcblx0XHR7XG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmRlZmF1bHRDb2xvckRlY29yYXRvcnMuYXV0bycsIFwiU2hvdyBkZWZhdWx0IGNvbG9yIGRlY29yYXRvcnMgb25seSB3aGVuIG5vIGV4dGVuc2lvbiBwcm92aWRlcyBjb2xvcnMgZGVjb3JhdG9ycy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZWRpdG9yLmRlZmF1bHRDb2xvckRlY29yYXRvcnMuYWx3YXlzJywgXCJBbHdheXMgc2hvdyBkZWZhdWx0IGNvbG9yIGRlY29yYXRvcnMuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VkaXRvci5kZWZhdWx0Q29sb3JEZWNvcmF0b3JzLm5ldmVyJywgXCJOZXZlciBzaG93IGRlZmF1bHQgY29sb3IgZGVjb3JhdG9ycy5cIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZGVmYXVsdENvbG9yRGVjb3JhdG9ycycsIFwiQ29udHJvbHMgd2hldGhlciBpbmxpbmUgY29sb3IgZGVjb3JhdGlvbnMgc2hvdWxkIGJlIHNob3duIHVzaW5nIHRoZSBkZWZhdWx0IGRvY3VtZW50IGNvbG9yIHByb3ZpZGVyLlwiKVxuXHRcdH1cblx0KSksXG5cdHBpeGVsUmF0aW86IHJlZ2lzdGVyKG5ldyBFZGl0b3JQaXhlbFJhdGlvKCkpLFxuXHR0YWJGb2N1c01vZGU6IHJlZ2lzdGVyKG5ldyBFZGl0b3JCb29sZWFuT3B0aW9uKEVkaXRvck9wdGlvbi50YWJGb2N1c01vZGUsICd0YWJGb2N1c01vZGUnLCBmYWxzZSxcblx0XHR7IG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFiRm9jdXNNb2RlJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBlZGl0b3IgcmVjZWl2ZXMgdGFicyBvciBkZWZlcnMgdGhlbSB0byB0aGUgd29ya2JlbmNoIGZvciBuYXZpZ2F0aW9uLlwiKSB9XG5cdCkpLFxuXHRsYXlvdXRJbmZvOiByZWdpc3RlcihuZXcgRWRpdG9yTGF5b3V0SW5mb0NvbXB1dGVyKCkpLFxuXHR3cmFwcGluZ0luZm86IHJlZ2lzdGVyKG5ldyBFZGl0b3JXcmFwcGluZ0luZm9Db21wdXRlcigpKSxcblx0d3JhcHBpbmdJbmRlbnQ6IHJlZ2lzdGVyKG5ldyBXcmFwcGluZ0luZGVudE9wdGlvbigpKSxcblx0d3JhcHBpbmdTdHJhdGVneTogcmVnaXN0ZXIobmV3IFdyYXBwaW5nU3RyYXRlZ3koKSksXG5cdGVmZmVjdGl2ZUVkaXRDb250ZXh0RW5hYmxlZDogcmVnaXN0ZXIobmV3IEVmZmVjdGl2ZUVkaXRDb250ZXh0RW5hYmxlZCgpKSxcblx0ZWZmZWN0aXZlQWxsb3dWYXJpYWJsZUZvbnRzOiByZWdpc3RlcihuZXcgRWZmZWN0aXZlQWxsb3dWYXJpYWJsZUZvbnRzKCkpXG59O1xuXG50eXBlIEVkaXRvck9wdGlvbnNUeXBlID0gdHlwZW9mIEVkaXRvck9wdGlvbnM7XG50eXBlIEZpbmRFZGl0b3JPcHRpb25zS2V5QnlJZDxUIGV4dGVuZHMgRWRpdG9yT3B0aW9uPiA9IHsgW0sgaW4ga2V5b2YgRWRpdG9yT3B0aW9uc1R5cGVdOiBFZGl0b3JPcHRpb25zVHlwZVtLXVsnaWQnXSBleHRlbmRzIFQgPyBLIDogbmV2ZXIgfVtrZXlvZiBFZGl0b3JPcHRpb25zVHlwZV07XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxudHlwZSBDb21wdXRlZEVkaXRvck9wdGlvblZhbHVlPFQgZXh0ZW5kcyBJRWRpdG9yT3B0aW9uPGFueSwgYW55Pj4gPSBUIGV4dGVuZHMgSUVkaXRvck9wdGlvbjxhbnksIGluZmVyIFI+ID8gUiA6IG5ldmVyO1xuZXhwb3J0IHR5cGUgRmluZENvbXB1dGVkRWRpdG9yT3B0aW9uVmFsdWVCeUlkPFQgZXh0ZW5kcyBFZGl0b3JPcHRpb24+ID0gTm9uTnVsbGFibGU8Q29tcHV0ZWRFZGl0b3JPcHRpb25WYWx1ZTxFZGl0b3JPcHRpb25zVHlwZVtGaW5kRWRpdG9yT3B0aW9uc0tleUJ5SWQ8VD5dPj47XG5cbmV4cG9ydCB0eXBlIE1vdXNlTWlkZGxlQ2xpY2tBY3Rpb24gPSAnZGVmYXVsdCcgfCAnb3BlbkxpbmsnIHwgJ2N0cmxMZWZ0Q2xpY2snO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBR3hCLFlBQVksYUFBYTtBQUN6QixZQUFZLGNBQWM7QUFDMUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxzQkFBc0Isb0JBQW9CLDBCQUEwQixnQkFBZ0I7QUFDN0YsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNEJBQTRCO0FBeUI5QixJQUFXLDJCQUFYLGtCQUFXQSw4QkFBWDtBQUNOLEVBQUFBLG9EQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLG9EQUFBLFVBQU8sS0FBUDtBQUNBLEVBQUFBLG9EQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLG9EQUFBLGNBQVcsS0FBWDtBQUNBLEVBQUFBLG9EQUFBLFVBQU8sS0FBUDtBQUxpQixTQUFBQTtBQUFBLEdBQUE7QUFzekJYLE1BQU0sdUJBQXVCO0FBb0s3QixNQUFNLDBCQUEwQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS3RDLFlBQVksUUFBbUI7QUFDOUIsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFBQSxFQUNPLFdBQVcsSUFBMkI7QUFDNUMsV0FBTyxLQUFLLFFBQVEsRUFBRTtBQUFBLEVBQ3ZCO0FBQ0Q7QUFtQ08sTUFBTSxxQkFBcUI7QUFBQSxFQU1qQyxjQUFjO0FBQ2IsU0FBSywyQkFBMkI7QUFDaEMsU0FBSywyQkFBMkI7QUFDaEMsU0FBSywwQkFBMEI7QUFBQSxFQUNoQztBQUNEO0FBcUNBLE1BQWUsaUJBQThFO0FBQUEsRUFPNUYsWUFBWSxJQUFPLE1BQTBCLGNBQWlCLFFBQTBGO0FBQ3ZKLFNBQUssS0FBSztBQUNWLFNBQUssT0FBTztBQUNaLFNBQUssZUFBZTtBQUNwQixTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFTyxZQUFZLE9BQXNCLFFBQWlDO0FBQ3pFLFdBQU8s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QUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFBO0FBQ0EsRUFBQUEsNEJBQUE7QUFDQSxFQUFBQSw0QkFBQTtBQUNBLEVBQUFBLDRCQUFB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QUFBQSxRQUM1RixJQUFJLFNBQVMsdUNBQXVDLHNDQUFzQztBQUFBLE1BQzNGO0FBQUEsTUFDQSxhQUFhLElBQUksU0FBUywwQkFBMEIsc0dBQXNHO0FBQUEsSUFDM0o7QUFBQSxFQUNELENBQUM7QUFBQSxFQUNELFlBQVksU0FBUyxJQUFJLGlCQUFpQixDQUFDO0FBQUEsRUFDM0MsY0FBYyxTQUFTLElBQUk7QUFBQSxJQUFvQjtBQUFBLElBQTJCO0FBQUEsSUFBZ0I7QUFBQSxJQUN6RixFQUFFLHFCQUFxQixJQUFJLFNBQVMsZ0JBQWdCLDJGQUEyRixFQUFFO0FBQUEsRUFDbEosQ0FBQztBQUFBLEVBQ0QsWUFBWSxTQUFTLElBQUkseUJBQXlCLENBQUM7QUFBQSxFQUNuRCxjQUFjLFNBQVMsSUFBSSwyQkFBMkIsQ0FBQztBQUFBLEVBQ3ZELGdCQUFnQixTQUFTLElBQUkscUJBQXFCLENBQUM7QUFBQSxFQUNuRCxrQkFBa0IsU0FBUyxJQUFJLGlCQUFpQixDQUFDO0FBQUEsRUFDakQsNkJBQTZCLFNBQVMsSUFBSSw0QkFBNEIsQ0FBQztBQUFBLEVBQ3ZFLDZCQUE2QixTQUFTLElBQUksNEJBQTRCLENBQUM7QUFDeEU7IiwKICAibmFtZXMiOiBbIkVkaXRvckF1dG9JbmRlbnRTdHJhdGVneSIsICJUZXh0RWRpdG9yQ3Vyc29yQmxpbmtpbmdTdHlsZSIsICJUZXh0RWRpdG9yQ3Vyc29yU3R5bGUiLCAiUmVuZGVyTWluaW1hcCIsICJTaG93TGlnaHRidWxiSWNvbk1vZGUiLCAiYWxsb3dlZFZhbHVlcyIsICJSZW5kZXJMaW5lTnVtYmVyc1R5cGUiLCAiV3JhcHBpbmdJbmRlbnQiLCAiRWRpdG9yT3B0aW9uIl0KfQo=
