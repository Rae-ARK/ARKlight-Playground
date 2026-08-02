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
import * as dom from "../../../base/browser/dom.js";
import * as domStylesheets from "../../../base/browser/domStylesheets.js";
import * as cssJs from "../../../base/browser/cssValue.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, Disposable, toDisposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { LinkedList } from "../../../base/common/linkedList.js";
import * as strings from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { isThemeColor } from "../../common/editorCommon.js";
import { OverviewRulerLane } from "../../common/model.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
let AbstractCodeEditorService = class extends Disposable {
  constructor(_themeService) {
    super();
    this._themeService = _themeService;
    this._onWillCreateCodeEditor = this._register(new Emitter());
    this.onWillCreateCodeEditor = this._onWillCreateCodeEditor.event;
    this._onCodeEditorAdd = this._register(new Emitter());
    this.onCodeEditorAdd = this._onCodeEditorAdd.event;
    this._onCodeEditorRemove = this._register(new Emitter());
    this.onCodeEditorRemove = this._onCodeEditorRemove.event;
    this._onWillCreateDiffEditor = this._register(new Emitter());
    this.onWillCreateDiffEditor = this._onWillCreateDiffEditor.event;
    this._onDiffEditorAdd = this._register(new Emitter());
    this.onDiffEditorAdd = this._onDiffEditorAdd.event;
    this._onDiffEditorRemove = this._register(new Emitter());
    this.onDiffEditorRemove = this._onDiffEditorRemove.event;
    this._onDidChangeTransientModelProperty = this._register(new Emitter());
    this.onDidChangeTransientModelProperty = this._onDidChangeTransientModelProperty.event;
    this._onDecorationTypeRegistered = this._register(new Emitter());
    this.onDecorationTypeRegistered = this._onDecorationTypeRegistered.event;
    this._decorationOptionProviders = /* @__PURE__ */ new Map();
    this._editorStyleSheets = /* @__PURE__ */ new Map();
    this._codeEditorOpenHandlers = new LinkedList();
    this._transientWatchers = this._register(new DisposableMap());
    this._modelProperties = /* @__PURE__ */ new Map();
    this._codeEditors = /* @__PURE__ */ Object.create(null);
    this._diffEditors = /* @__PURE__ */ Object.create(null);
    this._globalStyleSheet = null;
  }
  willCreateCodeEditor() {
    this._onWillCreateCodeEditor.fire();
  }
  addCodeEditor(editor) {
    this._codeEditors[editor.getId()] = editor;
    this._onCodeEditorAdd.fire(editor);
  }
  removeCodeEditor(editor) {
    if (delete this._codeEditors[editor.getId()]) {
      this._onCodeEditorRemove.fire(editor);
    }
  }
  listCodeEditors() {
    return Object.keys(this._codeEditors).map((id) => this._codeEditors[id]);
  }
  willCreateDiffEditor() {
    this._onWillCreateDiffEditor.fire();
  }
  addDiffEditor(editor) {
    this._diffEditors[editor.getId()] = editor;
    this._onDiffEditorAdd.fire(editor);
  }
  removeDiffEditor(editor) {
    if (delete this._diffEditors[editor.getId()]) {
      this._onDiffEditorRemove.fire(editor);
    }
  }
  listDiffEditors() {
    return Object.keys(this._diffEditors).map((id) => this._diffEditors[id]);
  }
  getFocusedCodeEditor() {
    let editorWithWidgetFocus = null;
    const editors = this.listCodeEditors();
    for (const editor of editors) {
      if (editor.hasTextFocus()) {
        return editor;
      }
      if (editor.hasWidgetFocus()) {
        editorWithWidgetFocus = editor;
      }
    }
    return editorWithWidgetFocus;
  }
  _getOrCreateGlobalStyleSheet() {
    if (!this._globalStyleSheet) {
      this._globalStyleSheet = this._createGlobalStyleSheet();
    }
    return this._globalStyleSheet;
  }
  _createGlobalStyleSheet() {
    return new GlobalStyleSheet(domStylesheets.createStyleSheet());
  }
  _getOrCreateStyleSheet(editor) {
    if (!editor) {
      return this._getOrCreateGlobalStyleSheet();
    }
    const domNode = editor.getContainerDomNode();
    if (!dom.isInShadowDOM(domNode)) {
      return this._getOrCreateGlobalStyleSheet();
    }
    const editorId = editor.getId();
    if (!this._editorStyleSheets.has(editorId)) {
      const refCountedStyleSheet = new RefCountedStyleSheet(this, editorId, domStylesheets.createStyleSheet(domNode));
      this._editorStyleSheets.set(editorId, refCountedStyleSheet);
    }
    return this._editorStyleSheets.get(editorId);
  }
  _removeEditorStyleSheets(editorId) {
    this._editorStyleSheets.delete(editorId);
  }
  registerDecorationType(description, key, options, parentTypeKey, editor) {
    let provider = this._decorationOptionProviders.get(key);
    if (!provider) {
      const styleSheet = this._getOrCreateStyleSheet(editor);
      const providerArgs = {
        styleSheet,
        key,
        parentTypeKey,
        options: options || /* @__PURE__ */ Object.create(null)
      };
      if (!parentTypeKey) {
        provider = new DecorationTypeOptionsProvider(description, this._themeService, styleSheet, providerArgs);
      } else {
        provider = new DecorationSubTypeOptionsProvider(this._themeService, styleSheet, providerArgs);
      }
      this._decorationOptionProviders.set(key, provider);
      this._onDecorationTypeRegistered.fire(key);
    }
    provider.refCount++;
    return {
      dispose: () => {
        this.removeDecorationType(key);
      }
    };
  }
  listDecorationTypes() {
    return Array.from(this._decorationOptionProviders.keys());
  }
  removeDecorationType(key) {
    const provider = this._decorationOptionProviders.get(key);
    if (provider) {
      provider.refCount--;
      if (provider.refCount <= 0) {
        this._decorationOptionProviders.delete(key);
        provider.dispose();
        this.listCodeEditors().forEach((ed) => ed.removeDecorationsByType(key));
      }
    }
  }
  resolveDecorationOptions(decorationTypeKey, writable) {
    const provider = this._decorationOptionProviders.get(decorationTypeKey);
    if (!provider) {
      throw new Error("Unknown decoration type key: " + decorationTypeKey);
    }
    return provider.getOptions(this, writable);
  }
  resolveDecorationCSSRules(decorationTypeKey) {
    const provider = this._decorationOptionProviders.get(decorationTypeKey);
    if (!provider) {
      return null;
    }
    return provider.resolveDecorationCSSRules();
  }
  setModelProperty(resource, key, value) {
    const key1 = resource.toString();
    let dest;
    if (this._modelProperties.has(key1)) {
      dest = this._modelProperties.get(key1);
    } else {
      dest = /* @__PURE__ */ new Map();
      this._modelProperties.set(key1, dest);
    }
    dest.set(key, value);
  }
  getModelProperty(resource, key) {
    const key1 = resource.toString();
    if (this._modelProperties.has(key1)) {
      const innerMap = this._modelProperties.get(key1);
      return innerMap.get(key);
    }
    return void 0;
  }
  setTransientModelProperty(model, key, value) {
    const uri = model.uri.toString();
    let w = this._transientWatchers.get(uri);
    if (!w) {
      w = new ModelTransientSettingWatcher(uri, model, this);
      this._transientWatchers.set(uri, w);
    }
    const previousValue = w.get(key);
    if (previousValue !== value) {
      w.set(key, value);
      this._onDidChangeTransientModelProperty.fire(model);
    }
  }
  getTransientModelProperty(model, key) {
    const uri = model.uri.toString();
    const watcher = this._transientWatchers.get(uri);
    if (!watcher) {
      return void 0;
    }
    return watcher.get(key);
  }
  getTransientModelProperties(model) {
    const uri = model.uri.toString();
    const watcher = this._transientWatchers.get(uri);
    if (!watcher) {
      return void 0;
    }
    return watcher.keys().map((key) => [key, watcher.get(key)]);
  }
  _removeWatcher(w) {
    this._transientWatchers.deleteAndDispose(w.uri);
  }
  async openCodeEditor(input, source, sideBySide) {
    for (const handler of this._codeEditorOpenHandlers) {
      const candidate = await handler(input, source, sideBySide);
      if (candidate !== null) {
        return candidate;
      }
    }
    return null;
  }
  registerCodeEditorOpenHandler(handler) {
    const rm = this._codeEditorOpenHandlers.unshift(handler);
    return toDisposable(rm);
  }
};
AbstractCodeEditorService = __decorateClass([
  __decorateParam(0, IThemeService)
], AbstractCodeEditorService);
class ModelTransientSettingWatcher extends Disposable {
  constructor(uri, model, owner) {
    super();
    this.uri = uri;
    this._values = {};
    this._register(model.onWillDispose(() => owner._removeWatcher(this)));
  }
  set(key, value) {
    this._values[key] = value;
  }
  get(key) {
    return this._values[key];
  }
  keys() {
    return Object.keys(this._values);
  }
}
class RefCountedStyleSheet {
  get sheet() {
    return this._styleSheet.sheet;
  }
  constructor(parent, editorId, styleSheet) {
    this._parent = parent;
    this._editorId = editorId;
    this._styleSheet = styleSheet;
    this._refCount = 0;
  }
  ref() {
    this._refCount++;
  }
  unref() {
    this._refCount--;
    if (this._refCount === 0) {
      this._styleSheet.remove();
      this._parent._removeEditorStyleSheets(this._editorId);
    }
  }
  insertRule(selector, rule) {
    domStylesheets.createCSSRule(selector, rule, this._styleSheet);
  }
  removeRulesContainingSelector(ruleName) {
    domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
  }
}
class GlobalStyleSheet {
  get sheet() {
    return this._styleSheet.sheet;
  }
  constructor(styleSheet) {
    this._styleSheet = styleSheet;
  }
  ref() {
  }
  unref() {
  }
  insertRule(selector, rule) {
    domStylesheets.createCSSRule(selector, rule, this._styleSheet);
  }
  removeRulesContainingSelector(ruleName) {
    domStylesheets.removeCSSRulesContainingSelector(ruleName, this._styleSheet);
  }
}
class DecorationSubTypeOptionsProvider {
  constructor(themeService, styleSheet, providerArgs) {
    this._styleSheet = styleSheet;
    this._styleSheet.ref();
    this._parentTypeKey = providerArgs.parentTypeKey;
    this.refCount = 0;
    this._beforeContentRules = new DecorationCSSRules(3 /* BeforeContentClassName */, providerArgs, themeService);
    this._afterContentRules = new DecorationCSSRules(4 /* AfterContentClassName */, providerArgs, themeService);
  }
  getOptions(codeEditorService, writable) {
    const options = codeEditorService.resolveDecorationOptions(this._parentTypeKey, true);
    if (this._beforeContentRules) {
      options.beforeContentClassName = this._beforeContentRules.className;
    }
    if (this._afterContentRules) {
      options.afterContentClassName = this._afterContentRules.className;
    }
    return options;
  }
  resolveDecorationCSSRules() {
    return this._styleSheet.sheet.cssRules;
  }
  dispose() {
    if (this._beforeContentRules) {
      this._beforeContentRules.dispose();
      this._beforeContentRules = null;
    }
    if (this._afterContentRules) {
      this._afterContentRules.dispose();
      this._afterContentRules = null;
    }
    this._styleSheet.unref();
  }
}
class DecorationTypeOptionsProvider {
  constructor(description, themeService, styleSheet, providerArgs) {
    this._disposables = new DisposableStore();
    this.description = description;
    this._styleSheet = styleSheet;
    this._styleSheet.ref();
    this.refCount = 0;
    const createCSSRules = (type) => {
      const rules = new DecorationCSSRules(type, providerArgs, themeService);
      this._disposables.add(rules);
      if (rules.hasContent) {
        return rules.className;
      }
      return void 0;
    };
    const createInlineCSSRules = (type) => {
      const rules = new DecorationCSSRules(type, providerArgs, themeService);
      this._disposables.add(rules);
      if (rules.hasContent) {
        return { className: rules.className, hasLetterSpacing: rules.hasLetterSpacing };
      }
      return null;
    };
    this.className = createCSSRules(0 /* ClassName */);
    const inlineData = createInlineCSSRules(1 /* InlineClassName */);
    if (inlineData) {
      this.inlineClassName = inlineData.className;
      this.inlineClassNameAffectsLetterSpacing = inlineData.hasLetterSpacing;
    }
    this.beforeContentClassName = createCSSRules(3 /* BeforeContentClassName */);
    this.afterContentClassName = createCSSRules(4 /* AfterContentClassName */);
    if (providerArgs.options.beforeInjectedText && providerArgs.options.beforeInjectedText.contentText) {
      const beforeInlineData = createInlineCSSRules(5 /* BeforeInjectedTextClassName */);
      this.beforeInjectedText = {
        content: providerArgs.options.beforeInjectedText.contentText,
        inlineClassName: beforeInlineData?.className,
        inlineClassNameAffectsLetterSpacing: beforeInlineData?.hasLetterSpacing || providerArgs.options.beforeInjectedText.affectsLetterSpacing
      };
    }
    if (providerArgs.options.afterInjectedText && providerArgs.options.afterInjectedText.contentText) {
      const afterInlineData = createInlineCSSRules(6 /* AfterInjectedTextClassName */);
      this.afterInjectedText = {
        content: providerArgs.options.afterInjectedText.contentText,
        inlineClassName: afterInlineData?.className,
        inlineClassNameAffectsLetterSpacing: afterInlineData?.hasLetterSpacing || providerArgs.options.afterInjectedText.affectsLetterSpacing
      };
    }
    this.glyphMarginClassName = createCSSRules(2 /* GlyphMarginClassName */);
    const options = providerArgs.options;
    this.isWholeLine = Boolean(options.isWholeLine);
    this.lineHeight = options.lineHeight;
    this.fontFamily = options.fontFamily;
    this.fontSize = options.fontSize;
    this.fontWeight = options.fontWeight;
    this.fontStyle = options.fontStyle;
    this.stickiness = options.rangeBehavior;
    const lightOverviewRulerColor = options.light && options.light.overviewRulerColor || options.overviewRulerColor;
    const darkOverviewRulerColor = options.dark && options.dark.overviewRulerColor || options.overviewRulerColor;
    if (typeof lightOverviewRulerColor !== "undefined" || typeof darkOverviewRulerColor !== "undefined") {
      this.overviewRuler = {
        color: lightOverviewRulerColor || darkOverviewRulerColor,
        darkColor: darkOverviewRulerColor || lightOverviewRulerColor,
        position: options.overviewRulerLane || OverviewRulerLane.Center
      };
    }
  }
  getOptions(codeEditorService, writable) {
    if (!writable) {
      return this;
    }
    return {
      description: this.description,
      inlineClassName: this.inlineClassName,
      beforeContentClassName: this.beforeContentClassName,
      afterContentClassName: this.afterContentClassName,
      className: this.className,
      glyphMarginClassName: this.glyphMarginClassName,
      isWholeLine: this.isWholeLine,
      lineHeight: this.lineHeight,
      fontFamily: this.fontFamily,
      fontSize: this.fontSize,
      fontWeight: this.fontWeight,
      fontStyle: this.fontStyle,
      overviewRuler: this.overviewRuler,
      stickiness: this.stickiness,
      before: this.beforeInjectedText,
      after: this.afterInjectedText
    };
  }
  resolveDecorationCSSRules() {
    return this._styleSheet.sheet.rules;
  }
  dispose() {
    this._disposables.dispose();
    this._styleSheet.unref();
  }
}
const _CSS_MAP = {
  color: "color:{0} !important;",
  opacity: "opacity:{0};",
  backgroundColor: "background-color:{0};",
  outline: "outline:{0};",
  outlineColor: "outline-color:{0};",
  outlineStyle: "outline-style:{0};",
  outlineWidth: "outline-width:{0};",
  border: "border:{0};",
  borderColor: "border-color:{0};",
  borderRadius: "border-radius:{0};",
  borderSpacing: "border-spacing:{0};",
  borderStyle: "border-style:{0};",
  borderWidth: "border-width:{0};",
  fontStyle: "font-style:{0};",
  fontWeight: "font-weight:{0};",
  fontSize: "font-size:{0};",
  fontFamily: "font-family:{0};",
  textDecoration: "text-decoration:{0};",
  cursor: "cursor:{0};",
  letterSpacing: "letter-spacing:{0};",
  gutterIconPath: "background:{0} center center no-repeat;",
  gutterIconSize: "background-size:{0};",
  contentText: "content:'{0}';",
  contentIconPath: "content:{0};",
  margin: "margin:{0};",
  padding: "padding:{0};",
  width: "width:{0};",
  height: "height:{0};",
  verticalAlign: "vertical-align:{0};"
};
class DecorationCSSRules {
  constructor(ruleType, providerArgs, themeService) {
    this._theme = themeService.getColorTheme();
    this._ruleType = ruleType;
    this._providerArgs = providerArgs;
    this._usesThemeColors = false;
    this._hasContent = false;
    this._hasLetterSpacing = false;
    let className = CSSNameHelper.getClassName(this._providerArgs.key, ruleType);
    if (this._providerArgs.parentTypeKey) {
      className = className + " " + CSSNameHelper.getClassName(this._providerArgs.parentTypeKey, ruleType);
    }
    this._className = className;
    this._unThemedSelector = CSSNameHelper.getSelector(this._providerArgs.key, this._providerArgs.parentTypeKey, ruleType);
    this._buildCSS();
    if (this._usesThemeColors) {
      this._themeListener = themeService.onDidColorThemeChange((theme) => {
        this._theme = themeService.getColorTheme();
        this._removeCSS();
        this._buildCSS();
      });
    } else {
      this._themeListener = null;
    }
  }
  dispose() {
    if (this._hasContent) {
      this._removeCSS();
      this._hasContent = false;
    }
    if (this._themeListener) {
      this._themeListener.dispose();
      this._themeListener = null;
    }
  }
  get hasContent() {
    return this._hasContent;
  }
  get hasLetterSpacing() {
    return this._hasLetterSpacing;
  }
  get className() {
    return this._className;
  }
  _buildCSS() {
    const options = this._providerArgs.options;
    let unthemedCSS, lightCSS, darkCSS;
    switch (this._ruleType) {
      case 0 /* ClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationClassName(options);
        lightCSS = this.getCSSTextForModelDecorationClassName(options.light);
        darkCSS = this.getCSSTextForModelDecorationClassName(options.dark);
        break;
      case 1 /* InlineClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationInlineClassName(options);
        lightCSS = this.getCSSTextForModelDecorationInlineClassName(options.light);
        darkCSS = this.getCSSTextForModelDecorationInlineClassName(options.dark);
        break;
      case 2 /* GlyphMarginClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options);
        lightCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.light);
        darkCSS = this.getCSSTextForModelDecorationGlyphMarginClassName(options.dark);
        break;
      case 3 /* BeforeContentClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.before);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.before);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.before);
        break;
      case 4 /* AfterContentClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.after);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.after);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.after);
        break;
      case 5 /* BeforeInjectedTextClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.beforeInjectedText);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.beforeInjectedText);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.beforeInjectedText);
        break;
      case 6 /* AfterInjectedTextClassName */:
        unthemedCSS = this.getCSSTextForModelDecorationContentClassName(options.afterInjectedText);
        lightCSS = this.getCSSTextForModelDecorationContentClassName(options.light && options.light.afterInjectedText);
        darkCSS = this.getCSSTextForModelDecorationContentClassName(options.dark && options.dark.afterInjectedText);
        break;
      default:
        throw new Error("Unknown rule type: " + this._ruleType);
    }
    const sheet = this._providerArgs.styleSheet;
    let hasContent = false;
    if (unthemedCSS.length > 0) {
      sheet.insertRule(this._unThemedSelector, unthemedCSS);
      hasContent = true;
    }
    if (lightCSS.length > 0) {
      sheet.insertRule(`.vs${this._unThemedSelector}, .hc-light${this._unThemedSelector}`, lightCSS);
      hasContent = true;
    }
    if (darkCSS.length > 0) {
      sheet.insertRule(`.vs-dark${this._unThemedSelector}, .hc-black${this._unThemedSelector}`, darkCSS);
      hasContent = true;
    }
    this._hasContent = hasContent;
  }
  _removeCSS() {
    this._providerArgs.styleSheet.removeRulesContainingSelector(this._unThemedSelector);
  }
  /**
   * Build the CSS for decorations styled via `className`.
   */
  getCSSTextForModelDecorationClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    this.collectCSSText(opts, ["backgroundColor"], cssTextArr);
    this.collectCSSText(opts, ["outline", "outlineColor", "outlineStyle", "outlineWidth"], cssTextArr);
    this.collectBorderSettingsCSSText(opts, cssTextArr);
    return cssTextArr.join("");
  }
  /**
   * Build the CSS for decorations styled via `inlineClassName`.
   */
  getCSSTextForModelDecorationInlineClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    this.collectCSSText(opts, ["fontStyle", "fontWeight", "fontFamily", "fontSize", "textDecoration", "cursor", "color", "opacity", "letterSpacing"], cssTextArr);
    if (opts.letterSpacing) {
      this._hasLetterSpacing = true;
    }
    return cssTextArr.join("");
  }
  /**
   * Build the CSS for decorations styled before or after content.
   */
  getCSSTextForModelDecorationContentClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    if (typeof opts !== "undefined") {
      this.collectBorderSettingsCSSText(opts, cssTextArr);
      if (typeof opts.contentIconPath !== "undefined") {
        cssTextArr.push(strings.format(_CSS_MAP.contentIconPath, cssJs.asCSSUrl(URI.revive(opts.contentIconPath))));
      }
      if (typeof opts.contentText === "string") {
        const truncated = opts.contentText.match(/^.*$/m)[0];
        const escaped = truncated.replace(/['\\]/g, "\\$&");
        cssTextArr.push(strings.format(_CSS_MAP.contentText, escaped));
      }
      this.collectCSSText(opts, ["verticalAlign", "fontStyle", "fontWeight", "fontSize", "fontFamily", "textDecoration", "color", "opacity", "backgroundColor", "margin", "padding"], cssTextArr);
      if (this.collectCSSText(opts, ["width", "height"], cssTextArr)) {
        cssTextArr.push("display:inline-block;");
      }
    }
    return cssTextArr.join("");
  }
  /**
   * Build the CSS for decorations styled via `glyphMarginClassName`.
   */
  getCSSTextForModelDecorationGlyphMarginClassName(opts) {
    if (!opts) {
      return "";
    }
    const cssTextArr = [];
    if (typeof opts.gutterIconPath !== "undefined") {
      cssTextArr.push(strings.format(_CSS_MAP.gutterIconPath, cssJs.asCSSUrl(URI.revive(opts.gutterIconPath))));
      if (typeof opts.gutterIconSize !== "undefined") {
        cssTextArr.push(strings.format(_CSS_MAP.gutterIconSize, opts.gutterIconSize));
      }
    }
    return cssTextArr.join("");
  }
  collectBorderSettingsCSSText(opts, cssTextArr) {
    if (this.collectCSSText(opts, ["border", "borderColor", "borderRadius", "borderSpacing", "borderStyle", "borderWidth"], cssTextArr)) {
      cssTextArr.push(strings.format("box-sizing: border-box;"));
      return true;
    }
    return false;
  }
  collectCSSText(opts, properties, cssTextArr) {
    const lenBefore = cssTextArr.length;
    for (const property of properties) {
      const value = this.resolveValue(opts[property]);
      if (typeof value === "string") {
        cssTextArr.push(strings.format(_CSS_MAP[property], value));
      }
    }
    return cssTextArr.length !== lenBefore;
  }
  resolveValue(value) {
    if (isThemeColor(value)) {
      this._usesThemeColors = true;
      const color = this._theme.getColor(value.id);
      if (color) {
        return color.toString();
      }
      return "transparent";
    }
    return value;
  }
}
var ModelDecorationCSSRuleType = /* @__PURE__ */ ((ModelDecorationCSSRuleType2) => {
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["ClassName"] = 0] = "ClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["InlineClassName"] = 1] = "InlineClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["GlyphMarginClassName"] = 2] = "GlyphMarginClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["BeforeContentClassName"] = 3] = "BeforeContentClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["AfterContentClassName"] = 4] = "AfterContentClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["BeforeInjectedTextClassName"] = 5] = "BeforeInjectedTextClassName";
  ModelDecorationCSSRuleType2[ModelDecorationCSSRuleType2["AfterInjectedTextClassName"] = 6] = "AfterInjectedTextClassName";
  return ModelDecorationCSSRuleType2;
})(ModelDecorationCSSRuleType || {});
class CSSNameHelper {
  static getClassName(key, type) {
    return "ced-" + key + "-" + type;
  }
  static getSelector(key, parentKey, ruleType) {
    let selector = ".monaco-editor ." + this.getClassName(key, ruleType);
    if (parentKey) {
      selector = selector + "." + this.getClassName(parentKey, ruleType);
    }
    if (ruleType === 3 /* BeforeContentClassName */) {
      selector += "::before";
    } else if (ruleType === 4 /* AfterContentClassName */) {
      selector += "::after";
    }
    return selector;
  }
}
export {
  AbstractCodeEditorService,
  GlobalStyleSheet,
  ModelTransientSettingWatcher,
  _CSS_MAP
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2Fic3RyYWN0Q29kZUVkaXRvclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBkb21TdHlsZXNoZWV0cyBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0ICogYXMgY3NzSnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IExpbmtlZExpc3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saW5rZWRMaXN0LmpzJztcbmltcG9ydCAqIGFzIHN0cmluZ3MgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvck9wZW5IYW5kbGVyLCBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZW50RGVjb3JhdGlvblJlbmRlck9wdGlvbnMsIElEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucywgSVRoZW1lRGVjb3JhdGlvblJlbmRlck9wdGlvbnMsIGlzVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnMsIElNb2RlbERlY29yYXRpb25PdmVydmlld1J1bGVyT3B0aW9ucywgSW5qZWN0ZWRUZXh0T3B0aW9ucywgSVRleHRNb2RlbCwgT3ZlcnZpZXdSdWxlckxhbmUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJQ29sb3JUaGVtZSwgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdENvZGVFZGl0b3JTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDb2RlRWRpdG9yU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsQ3JlYXRlQ29kZUVkaXRvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25XaWxsQ3JlYXRlQ29kZUVkaXRvciA9IHRoaXMuX29uV2lsbENyZWF0ZUNvZGVFZGl0b3IuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Db2RlRWRpdG9yQWRkOiBFbWl0dGVyPElDb2RlRWRpdG9yPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDb2RlRWRpdG9yPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQ29kZUVkaXRvckFkZDogRXZlbnQ8SUNvZGVFZGl0b3I+ID0gdGhpcy5fb25Db2RlRWRpdG9yQWRkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29kZUVkaXRvclJlbW92ZTogRW1pdHRlcjxJQ29kZUVkaXRvcj4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ29kZUVkaXRvcj4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkNvZGVFZGl0b3JSZW1vdmU6IEV2ZW50PElDb2RlRWRpdG9yPiA9IHRoaXMuX29uQ29kZUVkaXRvclJlbW92ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxDcmVhdGVEaWZmRWRpdG9yID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbldpbGxDcmVhdGVEaWZmRWRpdG9yID0gdGhpcy5fb25XaWxsQ3JlYXRlRGlmZkVkaXRvci5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZmZFZGl0b3JBZGQ6IEVtaXR0ZXI8SURpZmZFZGl0b3I+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SURpZmZFZGl0b3I+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWZmRWRpdG9yQWRkOiBFdmVudDxJRGlmZkVkaXRvcj4gPSB0aGlzLl9vbkRpZmZFZGl0b3JBZGQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWZmRWRpdG9yUmVtb3ZlOiBFbWl0dGVyPElEaWZmRWRpdG9yPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElEaWZmRWRpdG9yPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlmZkVkaXRvclJlbW92ZTogRXZlbnQ8SURpZmZFZGl0b3I+ID0gdGhpcy5fb25EaWZmRWRpdG9yUmVtb3ZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVHJhbnNpZW50TW9kZWxQcm9wZXJ0eTogRW1pdHRlcjxJVGV4dE1vZGVsPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXh0TW9kZWw+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VUcmFuc2llbnRNb2RlbFByb3BlcnR5OiBFdmVudDxJVGV4dE1vZGVsPiA9IHRoaXMuX29uRGlkQ2hhbmdlVHJhbnNpZW50TW9kZWxQcm9wZXJ0eS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGVjb3JhdGlvblR5cGVSZWdpc3RlcmVkOiBFbWl0dGVyPHN0cmluZz4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRwdWJsaWMgb25EZWNvcmF0aW9uVHlwZVJlZ2lzdGVyZWQ6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vbkRlY29yYXRpb25UeXBlUmVnaXN0ZXJlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2RlRWRpdG9yczogeyBbZWRpdG9ySWQ6IHN0cmluZ106IElDb2RlRWRpdG9yIH07XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZFZGl0b3JzOiB7IFtlZGl0b3JJZDogc3RyaW5nXTogSURpZmZFZGl0b3IgfTtcblx0cHJvdGVjdGVkIF9nbG9iYWxTdHlsZVNoZWV0OiBHbG9iYWxTdHlsZVNoZWV0IHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbk9wdGlvblByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJTW9kZWxEZWNvcmF0aW9uT3B0aW9uc1Byb3ZpZGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTdHlsZVNoZWV0cyA9IG5ldyBNYXA8c3RyaW5nLCBSZWZDb3VudGVkU3R5bGVTaGVldD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvck9wZW5IYW5kbGVycyA9IG5ldyBMaW5rZWRMaXN0PElDb2RlRWRpdG9yT3BlbkhhbmRsZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9kaWZmRWRpdG9ycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fZ2xvYmFsU3R5bGVTaGVldCA9IG51bGw7XG5cdH1cblxuXHR3aWxsQ3JlYXRlQ29kZUVkaXRvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxDcmVhdGVDb2RlRWRpdG9yLmZpcmUoKTtcblx0fVxuXG5cdGFkZENvZGVFZGl0b3IoZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvZGVFZGl0b3JzW2VkaXRvci5nZXRJZCgpXSA9IGVkaXRvcjtcblx0XHR0aGlzLl9vbkNvZGVFZGl0b3JBZGQuZmlyZShlZGl0b3IpO1xuXHR9XG5cblx0cmVtb3ZlQ29kZUVkaXRvcihlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKGRlbGV0ZSB0aGlzLl9jb2RlRWRpdG9yc1tlZGl0b3IuZ2V0SWQoKV0pIHtcblx0XHRcdHRoaXMuX29uQ29kZUVkaXRvclJlbW92ZS5maXJlKGVkaXRvcik7XG5cdFx0fVxuXHR9XG5cblx0bGlzdENvZGVFZGl0b3JzKCk6IElDb2RlRWRpdG9yW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9jb2RlRWRpdG9ycykubWFwKGlkID0+IHRoaXMuX2NvZGVFZGl0b3JzW2lkXSk7XG5cdH1cblxuXHR3aWxsQ3JlYXRlRGlmZkVkaXRvcigpOiB2b2lkIHtcblx0XHR0aGlzLl9vbldpbGxDcmVhdGVEaWZmRWRpdG9yLmZpcmUoKTtcblx0fVxuXG5cdGFkZERpZmZFZGl0b3IoZWRpdG9yOiBJRGlmZkVkaXRvcik6IHZvaWQge1xuXHRcdHRoaXMuX2RpZmZFZGl0b3JzW2VkaXRvci5nZXRJZCgpXSA9IGVkaXRvcjtcblx0XHR0aGlzLl9vbkRpZmZFZGl0b3JBZGQuZmlyZShlZGl0b3IpO1xuXHR9XG5cblx0cmVtb3ZlRGlmZkVkaXRvcihlZGl0b3I6IElEaWZmRWRpdG9yKTogdm9pZCB7XG5cdFx0aWYgKGRlbGV0ZSB0aGlzLl9kaWZmRWRpdG9yc1tlZGl0b3IuZ2V0SWQoKV0pIHtcblx0XHRcdHRoaXMuX29uRGlmZkVkaXRvclJlbW92ZS5maXJlKGVkaXRvcik7XG5cdFx0fVxuXHR9XG5cblx0bGlzdERpZmZFZGl0b3JzKCk6IElEaWZmRWRpdG9yW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl9kaWZmRWRpdG9ycykubWFwKGlkID0+IHRoaXMuX2RpZmZFZGl0b3JzW2lkXSk7XG5cdH1cblxuXHRnZXRGb2N1c2VkQ29kZUVkaXRvcigpOiBJQ29kZUVkaXRvciB8IG51bGwge1xuXHRcdGxldCBlZGl0b3JXaXRoV2lkZ2V0Rm9jdXM6IElDb2RlRWRpdG9yIHwgbnVsbCA9IG51bGw7XG5cblx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5saXN0Q29kZUVkaXRvcnMoKTtcblx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JzKSB7XG5cblx0XHRcdGlmIChlZGl0b3IuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdFx0Ly8gYmluZ28hXG5cdFx0XHRcdHJldHVybiBlZGl0b3I7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChlZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0XHRlZGl0b3JXaXRoV2lkZ2V0Rm9jdXMgPSBlZGl0b3I7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvcldpdGhXaWRnZXRGb2N1cztcblx0fVxuXG5cblx0cHJpdmF0ZSBfZ2V0T3JDcmVhdGVHbG9iYWxTdHlsZVNoZWV0KCk6IEdsb2JhbFN0eWxlU2hlZXQge1xuXHRcdGlmICghdGhpcy5fZ2xvYmFsU3R5bGVTaGVldCkge1xuXHRcdFx0dGhpcy5fZ2xvYmFsU3R5bGVTaGVldCA9IHRoaXMuX2NyZWF0ZUdsb2JhbFN0eWxlU2hlZXQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dsb2JhbFN0eWxlU2hlZXQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZUdsb2JhbFN0eWxlU2hlZXQoKTogR2xvYmFsU3R5bGVTaGVldCB7XG5cdFx0cmV0dXJuIG5ldyBHbG9iYWxTdHlsZVNoZWV0KGRvbVN0eWxlc2hlZXRzLmNyZWF0ZVN0eWxlU2hlZXQoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZVN0eWxlU2hlZXQoZWRpdG9yOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCk6IEdsb2JhbFN0eWxlU2hlZXQgfCBSZWZDb3VudGVkU3R5bGVTaGVldCB7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiB0aGlzLl9nZXRPckNyZWF0ZUdsb2JhbFN0eWxlU2hlZXQoKTtcblx0XHR9XG5cdFx0Y29uc3QgZG9tTm9kZSA9IGVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCk7XG5cdFx0aWYgKCFkb20uaXNJblNoYWRvd0RPTShkb21Ob2RlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldE9yQ3JlYXRlR2xvYmFsU3R5bGVTaGVldCgpO1xuXHRcdH1cblx0XHRjb25zdCBlZGl0b3JJZCA9IGVkaXRvci5nZXRJZCgpO1xuXHRcdGlmICghdGhpcy5fZWRpdG9yU3R5bGVTaGVldHMuaGFzKGVkaXRvcklkKSkge1xuXHRcdFx0Y29uc3QgcmVmQ291bnRlZFN0eWxlU2hlZXQgPSBuZXcgUmVmQ291bnRlZFN0eWxlU2hlZXQodGhpcywgZWRpdG9ySWQsIGRvbVN0eWxlc2hlZXRzLmNyZWF0ZVN0eWxlU2hlZXQoZG9tTm9kZSkpO1xuXHRcdFx0dGhpcy5fZWRpdG9yU3R5bGVTaGVldHMuc2V0KGVkaXRvcklkLCByZWZDb3VudGVkU3R5bGVTaGVldCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JTdHlsZVNoZWV0cy5nZXQoZWRpdG9ySWQpITtcblx0fVxuXG5cdF9yZW1vdmVFZGl0b3JTdHlsZVNoZWV0cyhlZGl0b3JJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yU3R5bGVTaGVldHMuZGVsZXRlKGVkaXRvcklkKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlckRlY29yYXRpb25UeXBlKGRlc2NyaXB0aW9uOiBzdHJpbmcsIGtleTogc3RyaW5nLCBvcHRpb25zOiBJRGVjb3JhdGlvblJlbmRlck9wdGlvbnMsIHBhcmVudFR5cGVLZXk/OiBzdHJpbmcsIGVkaXRvcj86IElDb2RlRWRpdG9yKTogSURpc3Bvc2FibGUge1xuXHRcdGxldCBwcm92aWRlciA9IHRoaXMuX2RlY29yYXRpb25PcHRpb25Qcm92aWRlcnMuZ2V0KGtleSk7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0Y29uc3Qgc3R5bGVTaGVldCA9IHRoaXMuX2dldE9yQ3JlYXRlU3R5bGVTaGVldChlZGl0b3IpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJBcmdzOiBQcm92aWRlckFyZ3VtZW50cyA9IHtcblx0XHRcdFx0c3R5bGVTaGVldDogc3R5bGVTaGVldCxcblx0XHRcdFx0a2V5OiBrZXksXG5cdFx0XHRcdHBhcmVudFR5cGVLZXk6IHBhcmVudFR5cGVLZXksXG5cdFx0XHRcdG9wdGlvbnM6IG9wdGlvbnMgfHwgT2JqZWN0LmNyZWF0ZShudWxsKVxuXHRcdFx0fTtcblx0XHRcdGlmICghcGFyZW50VHlwZUtleSkge1xuXHRcdFx0XHRwcm92aWRlciA9IG5ldyBEZWNvcmF0aW9uVHlwZU9wdGlvbnNQcm92aWRlcihkZXNjcmlwdGlvbiwgdGhpcy5fdGhlbWVTZXJ2aWNlLCBzdHlsZVNoZWV0LCBwcm92aWRlckFyZ3MpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJvdmlkZXIgPSBuZXcgRGVjb3JhdGlvblN1YlR5cGVPcHRpb25zUHJvdmlkZXIodGhpcy5fdGhlbWVTZXJ2aWNlLCBzdHlsZVNoZWV0LCBwcm92aWRlckFyZ3MpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZGVjb3JhdGlvbk9wdGlvblByb3ZpZGVycy5zZXQoa2V5LCBwcm92aWRlcik7XG5cdFx0XHR0aGlzLl9vbkRlY29yYXRpb25UeXBlUmVnaXN0ZXJlZC5maXJlKGtleSk7XG5cdFx0fVxuXHRcdHByb3ZpZGVyLnJlZkNvdW50Kys7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5yZW1vdmVEZWNvcmF0aW9uVHlwZShrZXkpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgbGlzdERlY29yYXRpb25UeXBlcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fZGVjb3JhdGlvbk9wdGlvblByb3ZpZGVycy5rZXlzKCkpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZURlY29yYXRpb25UeXBlKGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9kZWNvcmF0aW9uT3B0aW9uUHJvdmlkZXJzLmdldChrZXkpO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0cHJvdmlkZXIucmVmQ291bnQtLTtcblx0XHRcdGlmIChwcm92aWRlci5yZWZDb3VudCA8PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRpb25PcHRpb25Qcm92aWRlcnMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdHByb3ZpZGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5saXN0Q29kZUVkaXRvcnMoKS5mb3JFYWNoKChlZCkgPT4gZWQucmVtb3ZlRGVjb3JhdGlvbnNCeVR5cGUoa2V5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlc29sdmVEZWNvcmF0aW9uT3B0aW9ucyhkZWNvcmF0aW9uVHlwZUtleTogc3RyaW5nLCB3cml0YWJsZTogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2RlY29yYXRpb25PcHRpb25Qcm92aWRlcnMuZ2V0KGRlY29yYXRpb25UeXBlS2V5KTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZGVjb3JhdGlvbiB0eXBlIGtleTogJyArIGRlY29yYXRpb25UeXBlS2V5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyLmdldE9wdGlvbnModGhpcywgd3JpdGFibGUpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVEZWNvcmF0aW9uQ1NTUnVsZXMoZGVjb3JhdGlvblR5cGVLZXk6IHN0cmluZykge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZGVjb3JhdGlvbk9wdGlvblByb3ZpZGVycy5nZXQoZGVjb3JhdGlvblR5cGVLZXkpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIucmVzb2x2ZURlY29yYXRpb25DU1NSdWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNpZW50V2F0Y2hlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIE1vZGVsVHJhbnNpZW50U2V0dGluZ1dhdGNoZXI+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFByb3BlcnRpZXMgPSBuZXcgTWFwPHN0cmluZywgTWFwPHN0cmluZywgdW5rbm93bj4+KCk7XG5cblx0cHVibGljIHNldE1vZGVsUHJvcGVydHkocmVzb3VyY2U6IFVSSSwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5MSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0bGV0IGRlc3Q6IE1hcDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGlmICh0aGlzLl9tb2RlbFByb3BlcnRpZXMuaGFzKGtleTEpKSB7XG5cdFx0XHRkZXN0ID0gdGhpcy5fbW9kZWxQcm9wZXJ0aWVzLmdldChrZXkxKSE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRlc3QgPSBuZXcgTWFwPHN0cmluZywgdW5rbm93bj4oKTtcblx0XHRcdHRoaXMuX21vZGVsUHJvcGVydGllcy5zZXQoa2V5MSwgZGVzdCk7XG5cdFx0fVxuXG5cdFx0ZGVzdC5zZXQoa2V5LCB2YWx1ZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW9kZWxQcm9wZXJ0eShyZXNvdXJjZTogVVJJLCBrZXk6IHN0cmluZyk6IHVua25vd24ge1xuXHRcdGNvbnN0IGtleTEgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmICh0aGlzLl9tb2RlbFByb3BlcnRpZXMuaGFzKGtleTEpKSB7XG5cdFx0XHRjb25zdCBpbm5lck1hcCA9IHRoaXMuX21vZGVsUHJvcGVydGllcy5nZXQoa2V5MSkhO1xuXHRcdFx0cmV0dXJuIGlubmVyTWFwLmdldChrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIHNldFRyYW5zaWVudE1vZGVsUHJvcGVydHkobW9kZWw6IElUZXh0TW9kZWwsIGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuXHRcdGNvbnN0IHVyaSA9IG1vZGVsLnVyaS50b1N0cmluZygpO1xuXG5cdFx0bGV0IHcgPSB0aGlzLl90cmFuc2llbnRXYXRjaGVycy5nZXQodXJpKTtcblx0XHRpZiAoIXcpIHtcblx0XHRcdHcgPSBuZXcgTW9kZWxUcmFuc2llbnRTZXR0aW5nV2F0Y2hlcih1cmksIG1vZGVsLCB0aGlzKTtcblx0XHRcdHRoaXMuX3RyYW5zaWVudFdhdGNoZXJzLnNldCh1cmksIHcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzVmFsdWUgPSB3LmdldChrZXkpO1xuXHRcdGlmIChwcmV2aW91c1ZhbHVlICE9PSB2YWx1ZSkge1xuXHRcdFx0dy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRyYW5zaWVudE1vZGVsUHJvcGVydHkuZmlyZShtb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFRyYW5zaWVudE1vZGVsUHJvcGVydHkobW9kZWw6IElUZXh0TW9kZWwsIGtleTogc3RyaW5nKTogdW5rbm93biB7XG5cdFx0Y29uc3QgdXJpID0gbW9kZWwudXJpLnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCB3YXRjaGVyID0gdGhpcy5fdHJhbnNpZW50V2F0Y2hlcnMuZ2V0KHVyaSk7XG5cdFx0aWYgKCF3YXRjaGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB3YXRjaGVyLmdldChrZXkpO1xuXHR9XG5cblx0cHVibGljIGdldFRyYW5zaWVudE1vZGVsUHJvcGVydGllcyhtb2RlbDogSVRleHRNb2RlbCk6IFtzdHJpbmcsIHVua25vd25dW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHVyaSA9IG1vZGVsLnVyaS50b1N0cmluZygpO1xuXG5cdFx0Y29uc3Qgd2F0Y2hlciA9IHRoaXMuX3RyYW5zaWVudFdhdGNoZXJzLmdldCh1cmkpO1xuXHRcdGlmICghd2F0Y2hlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gd2F0Y2hlci5rZXlzKCkubWFwKGtleSA9PiBba2V5LCB3YXRjaGVyLmdldChrZXkpXSk7XG5cdH1cblxuXHRfcmVtb3ZlV2F0Y2hlcih3OiBNb2RlbFRyYW5zaWVudFNldHRpbmdXYXRjaGVyKTogdm9pZCB7XG5cdFx0dGhpcy5fdHJhbnNpZW50V2F0Y2hlcnMuZGVsZXRlQW5kRGlzcG9zZSh3LnVyaSk7XG5cdH1cblxuXHRhYnN0cmFjdCBnZXRBY3RpdmVDb2RlRWRpdG9yKCk6IElDb2RlRWRpdG9yIHwgbnVsbDtcblxuXHRhc3luYyBvcGVuQ29kZUVkaXRvcihpbnB1dDogSVJlc291cmNlRWRpdG9ySW5wdXQsIHNvdXJjZTogSUNvZGVFZGl0b3IgfCBudWxsLCBzaWRlQnlTaWRlPzogYm9vbGVhbik6IFByb21pc2U8SUNvZGVFZGl0b3IgfCBudWxsPiB7XG5cdFx0Zm9yIChjb25zdCBoYW5kbGVyIG9mIHRoaXMuX2NvZGVFZGl0b3JPcGVuSGFuZGxlcnMpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IGF3YWl0IGhhbmRsZXIoaW5wdXQsIHNvdXJjZSwgc2lkZUJ5U2lkZSk7XG5cdFx0XHRpZiAoY2FuZGlkYXRlICE9PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiBjYW5kaWRhdGU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cmVnaXN0ZXJDb2RlRWRpdG9yT3BlbkhhbmRsZXIoaGFuZGxlcjogSUNvZGVFZGl0b3JPcGVuSGFuZGxlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBybSA9IHRoaXMuX2NvZGVFZGl0b3JPcGVuSGFuZGxlcnMudW5zaGlmdChoYW5kbGVyKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKHJtKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW9kZWxUcmFuc2llbnRTZXR0aW5nV2F0Y2hlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgdXJpOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ZhbHVlczogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH07XG5cblx0Y29uc3RydWN0b3IodXJpOiBzdHJpbmcsIG1vZGVsOiBJVGV4dE1vZGVsLCBvd25lcjogQWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnVyaSA9IHVyaTtcblx0XHR0aGlzLl92YWx1ZXMgPSB7fTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbldpbGxEaXNwb3NlKCgpID0+IG93bmVyLl9yZW1vdmVXYXRjaGVyKHRoaXMpKSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlc1trZXldID0gdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KGtleTogc3RyaW5nKTogdW5rbm93biB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbHVlc1trZXldO1xuXHR9XG5cblx0cHVibGljIGtleXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl92YWx1ZXMpO1xuXHR9XG59XG5cbmNsYXNzIFJlZkNvdW50ZWRTdHlsZVNoZWV0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnQ6IEFic3RyYWN0Q29kZUVkaXRvclNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcklkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0eWxlU2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByaXZhdGUgX3JlZkNvdW50OiBudW1iZXI7XG5cblx0cHVibGljIGdldCBzaGVldCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc3R5bGVTaGVldC5zaGVldCBhcyBDU1NTdHlsZVNoZWV0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IocGFyZW50OiBBYnN0cmFjdENvZGVFZGl0b3JTZXJ2aWNlLCBlZGl0b3JJZDogc3RyaW5nLCBzdHlsZVNoZWV0OiBIVE1MU3R5bGVFbGVtZW50KSB7XG5cdFx0dGhpcy5fcGFyZW50ID0gcGFyZW50O1xuXHRcdHRoaXMuX2VkaXRvcklkID0gZWRpdG9ySWQ7XG5cdFx0dGhpcy5fc3R5bGVTaGVldCA9IHN0eWxlU2hlZXQ7XG5cdFx0dGhpcy5fcmVmQ291bnQgPSAwO1xuXHR9XG5cblx0cHVibGljIHJlZigpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWZDb3VudCsrO1xuXHR9XG5cblx0cHVibGljIHVucmVmKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZkNvdW50LS07XG5cdFx0aWYgKHRoaXMuX3JlZkNvdW50ID09PSAwKSB7XG5cdFx0XHR0aGlzLl9zdHlsZVNoZWV0LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5fcGFyZW50Ll9yZW1vdmVFZGl0b3JTdHlsZVNoZWV0cyh0aGlzLl9lZGl0b3JJZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGluc2VydFJ1bGUoc2VsZWN0b3I6IHN0cmluZywgcnVsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0ZG9tU3R5bGVzaGVldHMuY3JlYXRlQ1NTUnVsZShzZWxlY3RvciwgcnVsZSwgdGhpcy5fc3R5bGVTaGVldCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlUnVsZXNDb250YWluaW5nU2VsZWN0b3IocnVsZU5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGRvbVN0eWxlc2hlZXRzLnJlbW92ZUNTU1J1bGVzQ29udGFpbmluZ1NlbGVjdG9yKHJ1bGVOYW1lLCB0aGlzLl9zdHlsZVNoZWV0KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR2xvYmFsU3R5bGVTaGVldCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0eWxlU2hlZXQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cblx0cHVibGljIGdldCBzaGVldCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc3R5bGVTaGVldC5zaGVldCBhcyBDU1NTdHlsZVNoZWV0O1xuXHR9XG5cblx0Y29uc3RydWN0b3Ioc3R5bGVTaGVldDogSFRNTFN0eWxlRWxlbWVudCkge1xuXHRcdHRoaXMuX3N0eWxlU2hlZXQgPSBzdHlsZVNoZWV0O1xuXHR9XG5cblx0cHVibGljIHJlZigpOiB2b2lkIHtcblx0fVxuXG5cdHB1YmxpYyB1bnJlZigpOiB2b2lkIHtcblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRSdWxlKHNlbGVjdG9yOiBzdHJpbmcsIHJ1bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGRvbVN0eWxlc2hlZXRzLmNyZWF0ZUNTU1J1bGUoc2VsZWN0b3IsIHJ1bGUsIHRoaXMuX3N0eWxlU2hlZXQpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZVJ1bGVzQ29udGFpbmluZ1NlbGVjdG9yKHJ1bGVOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRkb21TdHlsZXNoZWV0cy5yZW1vdmVDU1NSdWxlc0NvbnRhaW5pbmdTZWxlY3RvcihydWxlTmFtZSwgdGhpcy5fc3R5bGVTaGVldCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNb2RlbERlY29yYXRpb25PcHRpb25zUHJvdmlkZXIgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdHJlZkNvdW50OiBudW1iZXI7XG5cdGdldE9wdGlvbnMoY29kZUVkaXRvclNlcnZpY2U6IEFic3RyYWN0Q29kZUVkaXRvclNlcnZpY2UsIHdyaXRhYmxlOiBib29sZWFuKTogSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnM7XG5cdHJlc29sdmVEZWNvcmF0aW9uQ1NTUnVsZXMoKTogQ1NTUnVsZUxpc3Q7XG59XG5cbmNsYXNzIERlY29yYXRpb25TdWJUeXBlT3B0aW9uc1Byb3ZpZGVyIGltcGxlbWVudHMgSU1vZGVsRGVjb3JhdGlvbk9wdGlvbnNQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3R5bGVTaGVldDogR2xvYmFsU3R5bGVTaGVldCB8IFJlZkNvdW50ZWRTdHlsZVNoZWV0O1xuXHRwdWJsaWMgcmVmQ291bnQ6IG51bWJlcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnRUeXBlS2V5OiBzdHJpbmc7XG5cdHByaXZhdGUgX2JlZm9yZUNvbnRlbnRSdWxlczogRGVjb3JhdGlvbkNTU1J1bGVzIHwgbnVsbDtcblx0cHJpdmF0ZSBfYWZ0ZXJDb250ZW50UnVsZXM6IERlY29yYXRpb25DU1NSdWxlcyB8IG51bGw7XG5cblx0Y29uc3RydWN0b3IodGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLCBzdHlsZVNoZWV0OiBHbG9iYWxTdHlsZVNoZWV0IHwgUmVmQ291bnRlZFN0eWxlU2hlZXQsIHByb3ZpZGVyQXJnczogUHJvdmlkZXJBcmd1bWVudHMpIHtcblx0XHR0aGlzLl9zdHlsZVNoZWV0ID0gc3R5bGVTaGVldDtcblx0XHR0aGlzLl9zdHlsZVNoZWV0LnJlZigpO1xuXHRcdHRoaXMuX3BhcmVudFR5cGVLZXkgPSBwcm92aWRlckFyZ3MucGFyZW50VHlwZUtleSE7XG5cdFx0dGhpcy5yZWZDb3VudCA9IDA7XG5cblx0XHR0aGlzLl9iZWZvcmVDb250ZW50UnVsZXMgPSBuZXcgRGVjb3JhdGlvbkNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkJlZm9yZUNvbnRlbnRDbGFzc05hbWUsIHByb3ZpZGVyQXJncywgdGhlbWVTZXJ2aWNlKTtcblx0XHR0aGlzLl9hZnRlckNvbnRlbnRSdWxlcyA9IG5ldyBEZWNvcmF0aW9uQ1NTUnVsZXMoTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQWZ0ZXJDb250ZW50Q2xhc3NOYW1lLCBwcm92aWRlckFyZ3MsIHRoZW1lU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3B0aW9ucyhjb2RlRWRpdG9yU2VydmljZTogQWJzdHJhY3RDb2RlRWRpdG9yU2VydmljZSwgd3JpdGFibGU6IGJvb2xlYW4pOiBJTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGNvZGVFZGl0b3JTZXJ2aWNlLnJlc29sdmVEZWNvcmF0aW9uT3B0aW9ucyh0aGlzLl9wYXJlbnRUeXBlS2V5LCB0cnVlKTtcblx0XHRpZiAodGhpcy5fYmVmb3JlQ29udGVudFJ1bGVzKSB7XG5cdFx0XHRvcHRpb25zLmJlZm9yZUNvbnRlbnRDbGFzc05hbWUgPSB0aGlzLl9iZWZvcmVDb250ZW50UnVsZXMuY2xhc3NOYW1lO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYWZ0ZXJDb250ZW50UnVsZXMpIHtcblx0XHRcdG9wdGlvbnMuYWZ0ZXJDb250ZW50Q2xhc3NOYW1lID0gdGhpcy5fYWZ0ZXJDb250ZW50UnVsZXMuY2xhc3NOYW1lO1xuXHRcdH1cblx0XHRyZXR1cm4gb3B0aW9ucztcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlRGVjb3JhdGlvbkNTU1J1bGVzKCk6IENTU1J1bGVMaXN0IHtcblx0XHRyZXR1cm4gdGhpcy5fc3R5bGVTaGVldC5zaGVldC5jc3NSdWxlcztcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9iZWZvcmVDb250ZW50UnVsZXMpIHtcblx0XHRcdHRoaXMuX2JlZm9yZUNvbnRlbnRSdWxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9iZWZvcmVDb250ZW50UnVsZXMgPSBudWxsO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fYWZ0ZXJDb250ZW50UnVsZXMpIHtcblx0XHRcdHRoaXMuX2FmdGVyQ29udGVudFJ1bGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2FmdGVyQ29udGVudFJ1bGVzID0gbnVsbDtcblx0XHR9XG5cdFx0dGhpcy5fc3R5bGVTaGVldC51bnJlZigpO1xuXHR9XG59XG5cbmludGVyZmFjZSBQcm92aWRlckFyZ3VtZW50cyB7XG5cdHN0eWxlU2hlZXQ6IEdsb2JhbFN0eWxlU2hlZXQgfCBSZWZDb3VudGVkU3R5bGVTaGVldDtcblx0a2V5OiBzdHJpbmc7XG5cdHBhcmVudFR5cGVLZXk/OiBzdHJpbmc7XG5cdG9wdGlvbnM6IElEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucztcbn1cblxuXG5jbGFzcyBEZWNvcmF0aW9uVHlwZU9wdGlvbnNQcm92aWRlciBpbXBsZW1lbnRzIElNb2RlbERlY29yYXRpb25PcHRpb25zUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdHlsZVNoZWV0OiBHbG9iYWxTdHlsZVNoZWV0IHwgUmVmQ291bnRlZFN0eWxlU2hlZXQ7XG5cdHB1YmxpYyByZWZDb3VudDogbnVtYmVyO1xuXG5cdHB1YmxpYyBkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRwdWJsaWMgY2xhc3NOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBpbmxpbmVDbGFzc05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHVibGljIGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgYmVmb3JlQ29udGVudENsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgYWZ0ZXJDb250ZW50Q2xhc3NOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnbHlwaE1hcmdpbkNsYXNzTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgaXNXaG9sZUxpbmU6IGJvb2xlYW47XG5cdHB1YmxpYyBsaW5lSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBmb250U2l6ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZm9udEZhbWlseTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZm9udFdlaWdodDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZm9udFN0eWxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBvdmVydmlld1J1bGVyOiBJTW9kZWxEZWNvcmF0aW9uT3ZlcnZpZXdSdWxlck9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgYmVmb3JlSW5qZWN0ZWRUZXh0OiBJbmplY3RlZFRleHRPcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgYWZ0ZXJJbmplY3RlZFRleHQ6IEluamVjdGVkVGV4dE9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoZGVzY3JpcHRpb246IHN0cmluZywgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLCBzdHlsZVNoZWV0OiBHbG9iYWxTdHlsZVNoZWV0IHwgUmVmQ291bnRlZFN0eWxlU2hlZXQsIHByb3ZpZGVyQXJnczogUHJvdmlkZXJBcmd1bWVudHMpIHtcblx0XHR0aGlzLmRlc2NyaXB0aW9uID0gZGVzY3JpcHRpb247XG5cblx0XHR0aGlzLl9zdHlsZVNoZWV0ID0gc3R5bGVTaGVldDtcblx0XHR0aGlzLl9zdHlsZVNoZWV0LnJlZigpO1xuXHRcdHRoaXMucmVmQ291bnQgPSAwO1xuXG5cdFx0Y29uc3QgY3JlYXRlQ1NTUnVsZXMgPSAodHlwZTogTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUpID0+IHtcblx0XHRcdGNvbnN0IHJ1bGVzID0gbmV3IERlY29yYXRpb25DU1NSdWxlcyh0eXBlLCBwcm92aWRlckFyZ3MsIHRoZW1lU2VydmljZSk7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQocnVsZXMpO1xuXHRcdFx0aWYgKHJ1bGVzLmhhc0NvbnRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIHJ1bGVzLmNsYXNzTmFtZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRjb25zdCBjcmVhdGVJbmxpbmVDU1NSdWxlcyA9ICh0eXBlOiBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZSkgPT4ge1xuXHRcdFx0Y29uc3QgcnVsZXMgPSBuZXcgRGVjb3JhdGlvbkNTU1J1bGVzKHR5cGUsIHByb3ZpZGVyQXJncywgdGhlbWVTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChydWxlcyk7XG5cdFx0XHRpZiAocnVsZXMuaGFzQ29udGVudCkge1xuXHRcdFx0XHRyZXR1cm4geyBjbGFzc05hbWU6IHJ1bGVzLmNsYXNzTmFtZSwgaGFzTGV0dGVyU3BhY2luZzogcnVsZXMuaGFzTGV0dGVyU3BhY2luZyB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fTtcblxuXHRcdHRoaXMuY2xhc3NOYW1lID0gY3JlYXRlQ1NTUnVsZXMoTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQ2xhc3NOYW1lKTtcblx0XHRjb25zdCBpbmxpbmVEYXRhID0gY3JlYXRlSW5saW5lQ1NTUnVsZXMoTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuSW5saW5lQ2xhc3NOYW1lKTtcblx0XHRpZiAoaW5saW5lRGF0YSkge1xuXHRcdFx0dGhpcy5pbmxpbmVDbGFzc05hbWUgPSBpbmxpbmVEYXRhLmNsYXNzTmFtZTtcblx0XHRcdHRoaXMuaW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmcgPSBpbmxpbmVEYXRhLmhhc0xldHRlclNwYWNpbmc7XG5cdFx0fVxuXHRcdHRoaXMuYmVmb3JlQ29udGVudENsYXNzTmFtZSA9IGNyZWF0ZUNTU1J1bGVzKE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkJlZm9yZUNvbnRlbnRDbGFzc05hbWUpO1xuXHRcdHRoaXMuYWZ0ZXJDb250ZW50Q2xhc3NOYW1lID0gY3JlYXRlQ1NTUnVsZXMoTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQWZ0ZXJDb250ZW50Q2xhc3NOYW1lKTtcblxuXHRcdGlmIChwcm92aWRlckFyZ3Mub3B0aW9ucy5iZWZvcmVJbmplY3RlZFRleHQgJiYgcHJvdmlkZXJBcmdzLm9wdGlvbnMuYmVmb3JlSW5qZWN0ZWRUZXh0LmNvbnRlbnRUZXh0KSB7XG5cdFx0XHRjb25zdCBiZWZvcmVJbmxpbmVEYXRhID0gY3JlYXRlSW5saW5lQ1NTUnVsZXMoTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQmVmb3JlSW5qZWN0ZWRUZXh0Q2xhc3NOYW1lKTtcblx0XHRcdHRoaXMuYmVmb3JlSW5qZWN0ZWRUZXh0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBwcm92aWRlckFyZ3Mub3B0aW9ucy5iZWZvcmVJbmplY3RlZFRleHQuY29udGVudFRleHQsXG5cdFx0XHRcdGlubGluZUNsYXNzTmFtZTogYmVmb3JlSW5saW5lRGF0YT8uY2xhc3NOYW1lLFxuXHRcdFx0XHRpbmxpbmVDbGFzc05hbWVBZmZlY3RzTGV0dGVyU3BhY2luZzogYmVmb3JlSW5saW5lRGF0YT8uaGFzTGV0dGVyU3BhY2luZyB8fCBwcm92aWRlckFyZ3Mub3B0aW9ucy5iZWZvcmVJbmplY3RlZFRleHQuYWZmZWN0c0xldHRlclNwYWNpbmdcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHByb3ZpZGVyQXJncy5vcHRpb25zLmFmdGVySW5qZWN0ZWRUZXh0ICYmIHByb3ZpZGVyQXJncy5vcHRpb25zLmFmdGVySW5qZWN0ZWRUZXh0LmNvbnRlbnRUZXh0KSB7XG5cdFx0XHRjb25zdCBhZnRlcklubGluZURhdGEgPSBjcmVhdGVJbmxpbmVDU1NSdWxlcyhNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5BZnRlckluamVjdGVkVGV4dENsYXNzTmFtZSk7XG5cdFx0XHR0aGlzLmFmdGVySW5qZWN0ZWRUZXh0ID0ge1xuXHRcdFx0XHRjb250ZW50OiBwcm92aWRlckFyZ3Mub3B0aW9ucy5hZnRlckluamVjdGVkVGV4dC5jb250ZW50VGV4dCxcblx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lOiBhZnRlcklubGluZURhdGE/LmNsYXNzTmFtZSxcblx0XHRcdFx0aW5saW5lQ2xhc3NOYW1lQWZmZWN0c0xldHRlclNwYWNpbmc6IGFmdGVySW5saW5lRGF0YT8uaGFzTGV0dGVyU3BhY2luZyB8fCBwcm92aWRlckFyZ3Mub3B0aW9ucy5hZnRlckluamVjdGVkVGV4dC5hZmZlY3RzTGV0dGVyU3BhY2luZ1xuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLmdseXBoTWFyZ2luQ2xhc3NOYW1lID0gY3JlYXRlQ1NTUnVsZXMoTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuR2x5cGhNYXJnaW5DbGFzc05hbWUpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHByb3ZpZGVyQXJncy5vcHRpb25zO1xuXHRcdHRoaXMuaXNXaG9sZUxpbmUgPSBCb29sZWFuKG9wdGlvbnMuaXNXaG9sZUxpbmUpO1xuXHRcdHRoaXMubGluZUhlaWdodCA9IG9wdGlvbnMubGluZUhlaWdodDtcblx0XHR0aGlzLmZvbnRGYW1pbHkgPSBvcHRpb25zLmZvbnRGYW1pbHk7XG5cdFx0dGhpcy5mb250U2l6ZSA9IG9wdGlvbnMuZm9udFNpemU7XG5cdFx0dGhpcy5mb250V2VpZ2h0ID0gb3B0aW9ucy5mb250V2VpZ2h0O1xuXHRcdHRoaXMuZm9udFN0eWxlID0gb3B0aW9ucy5mb250U3R5bGU7XG5cdFx0dGhpcy5zdGlja2luZXNzID0gb3B0aW9ucy5yYW5nZUJlaGF2aW9yO1xuXG5cdFx0Y29uc3QgbGlnaHRPdmVydmlld1J1bGVyQ29sb3IgPSBvcHRpb25zLmxpZ2h0ICYmIG9wdGlvbnMubGlnaHQub3ZlcnZpZXdSdWxlckNvbG9yIHx8IG9wdGlvbnMub3ZlcnZpZXdSdWxlckNvbG9yO1xuXHRcdGNvbnN0IGRhcmtPdmVydmlld1J1bGVyQ29sb3IgPSBvcHRpb25zLmRhcmsgJiYgb3B0aW9ucy5kYXJrLm92ZXJ2aWV3UnVsZXJDb2xvciB8fCBvcHRpb25zLm92ZXJ2aWV3UnVsZXJDb2xvcjtcblx0XHRpZiAoXG5cdFx0XHR0eXBlb2YgbGlnaHRPdmVydmlld1J1bGVyQ29sb3IgIT09ICd1bmRlZmluZWQnXG5cdFx0XHR8fCB0eXBlb2YgZGFya092ZXJ2aWV3UnVsZXJDb2xvciAhPT0gJ3VuZGVmaW5lZCdcblx0XHQpIHtcblx0XHRcdHRoaXMub3ZlcnZpZXdSdWxlciA9IHtcblx0XHRcdFx0Y29sb3I6IGxpZ2h0T3ZlcnZpZXdSdWxlckNvbG9yIHx8IGRhcmtPdmVydmlld1J1bGVyQ29sb3IsXG5cdFx0XHRcdGRhcmtDb2xvcjogZGFya092ZXJ2aWV3UnVsZXJDb2xvciB8fCBsaWdodE92ZXJ2aWV3UnVsZXJDb2xvcixcblx0XHRcdFx0cG9zaXRpb246IG9wdGlvbnMub3ZlcnZpZXdSdWxlckxhbmUgfHwgT3ZlcnZpZXdSdWxlckxhbmUuQ2VudGVyXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRPcHRpb25zKGNvZGVFZGl0b3JTZXJ2aWNlOiBBYnN0cmFjdENvZGVFZGl0b3JTZXJ2aWNlLCB3cml0YWJsZTogYm9vbGVhbik6IElNb2RlbERlY29yYXRpb25PcHRpb25zIHtcblx0XHRpZiAoIXdyaXRhYmxlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuZGVzY3JpcHRpb24sXG5cdFx0XHRpbmxpbmVDbGFzc05hbWU6IHRoaXMuaW5saW5lQ2xhc3NOYW1lLFxuXHRcdFx0YmVmb3JlQ29udGVudENsYXNzTmFtZTogdGhpcy5iZWZvcmVDb250ZW50Q2xhc3NOYW1lLFxuXHRcdFx0YWZ0ZXJDb250ZW50Q2xhc3NOYW1lOiB0aGlzLmFmdGVyQ29udGVudENsYXNzTmFtZSxcblx0XHRcdGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUsXG5cdFx0XHRnbHlwaE1hcmdpbkNsYXNzTmFtZTogdGhpcy5nbHlwaE1hcmdpbkNsYXNzTmFtZSxcblx0XHRcdGlzV2hvbGVMaW5lOiB0aGlzLmlzV2hvbGVMaW5lLFxuXHRcdFx0bGluZUhlaWdodDogdGhpcy5saW5lSGVpZ2h0LFxuXHRcdFx0Zm9udEZhbWlseTogdGhpcy5mb250RmFtaWx5LFxuXHRcdFx0Zm9udFNpemU6IHRoaXMuZm9udFNpemUsXG5cdFx0XHRmb250V2VpZ2h0OiB0aGlzLmZvbnRXZWlnaHQsXG5cdFx0XHRmb250U3R5bGU6IHRoaXMuZm9udFN0eWxlLFxuXHRcdFx0b3ZlcnZpZXdSdWxlcjogdGhpcy5vdmVydmlld1J1bGVyLFxuXHRcdFx0c3RpY2tpbmVzczogdGhpcy5zdGlja2luZXNzLFxuXHRcdFx0YmVmb3JlOiB0aGlzLmJlZm9yZUluamVjdGVkVGV4dCxcblx0XHRcdGFmdGVyOiB0aGlzLmFmdGVySW5qZWN0ZWRUZXh0XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyByZXNvbHZlRGVjb3JhdGlvbkNTU1J1bGVzKCk6IENTU1J1bGVMaXN0IHtcblx0XHRyZXR1cm4gdGhpcy5fc3R5bGVTaGVldC5zaGVldC5ydWxlcztcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdHlsZVNoZWV0LnVucmVmKCk7XG5cdH1cbn1cblxuXG5leHBvcnQgY29uc3QgX0NTU19NQVA6IHsgW3Byb3A6IHN0cmluZ106IHN0cmluZyB9ID0ge1xuXHRjb2xvcjogJ2NvbG9yOnswfSAhaW1wb3J0YW50OycsXG5cdG9wYWNpdHk6ICdvcGFjaXR5OnswfTsnLFxuXHRiYWNrZ3JvdW5kQ29sb3I6ICdiYWNrZ3JvdW5kLWNvbG9yOnswfTsnLFxuXG5cdG91dGxpbmU6ICdvdXRsaW5lOnswfTsnLFxuXHRvdXRsaW5lQ29sb3I6ICdvdXRsaW5lLWNvbG9yOnswfTsnLFxuXHRvdXRsaW5lU3R5bGU6ICdvdXRsaW5lLXN0eWxlOnswfTsnLFxuXHRvdXRsaW5lV2lkdGg6ICdvdXRsaW5lLXdpZHRoOnswfTsnLFxuXG5cdGJvcmRlcjogJ2JvcmRlcjp7MH07Jyxcblx0Ym9yZGVyQ29sb3I6ICdib3JkZXItY29sb3I6ezB9OycsXG5cdGJvcmRlclJhZGl1czogJ2JvcmRlci1yYWRpdXM6ezB9OycsXG5cdGJvcmRlclNwYWNpbmc6ICdib3JkZXItc3BhY2luZzp7MH07Jyxcblx0Ym9yZGVyU3R5bGU6ICdib3JkZXItc3R5bGU6ezB9OycsXG5cdGJvcmRlcldpZHRoOiAnYm9yZGVyLXdpZHRoOnswfTsnLFxuXG5cdGZvbnRTdHlsZTogJ2ZvbnQtc3R5bGU6ezB9OycsXG5cdGZvbnRXZWlnaHQ6ICdmb250LXdlaWdodDp7MH07Jyxcblx0Zm9udFNpemU6ICdmb250LXNpemU6ezB9OycsXG5cdGZvbnRGYW1pbHk6ICdmb250LWZhbWlseTp7MH07Jyxcblx0dGV4dERlY29yYXRpb246ICd0ZXh0LWRlY29yYXRpb246ezB9OycsXG5cdGN1cnNvcjogJ2N1cnNvcjp7MH07Jyxcblx0bGV0dGVyU3BhY2luZzogJ2xldHRlci1zcGFjaW5nOnswfTsnLFxuXG5cdGd1dHRlckljb25QYXRoOiAnYmFja2dyb3VuZDp7MH0gY2VudGVyIGNlbnRlciBuby1yZXBlYXQ7Jyxcblx0Z3V0dGVySWNvblNpemU6ICdiYWNrZ3JvdW5kLXNpemU6ezB9OycsXG5cblx0Y29udGVudFRleHQ6ICdjb250ZW50OlxcJ3swfVxcJzsnLFxuXHRjb250ZW50SWNvblBhdGg6ICdjb250ZW50OnswfTsnLFxuXHRtYXJnaW46ICdtYXJnaW46ezB9OycsXG5cdHBhZGRpbmc6ICdwYWRkaW5nOnswfTsnLFxuXHR3aWR0aDogJ3dpZHRoOnswfTsnLFxuXHRoZWlnaHQ6ICdoZWlnaHQ6ezB9OycsXG5cblx0dmVydGljYWxBbGlnbjogJ3ZlcnRpY2FsLWFsaWduOnswfTsnLFxufTtcblxuXG5jbGFzcyBEZWNvcmF0aW9uQ1NTUnVsZXMge1xuXG5cdHByaXZhdGUgX3RoZW1lOiBJQ29sb3JUaGVtZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xhc3NOYW1lOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3VuVGhlbWVkU2VsZWN0b3I6IHN0cmluZztcblx0cHJpdmF0ZSBfaGFzQ29udGVudDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfaGFzTGV0dGVyU3BhY2luZzogYm9vbGVhbjtcblx0cHJpdmF0ZSByZWFkb25seSBfcnVsZVR5cGU6IE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlO1xuXHRwcml2YXRlIF90aGVtZUxpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyQXJnczogUHJvdmlkZXJBcmd1bWVudHM7XG5cdHByaXZhdGUgX3VzZXNUaGVtZUNvbG9yczogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3RvcihydWxlVHlwZTogTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUsIHByb3ZpZGVyQXJnczogUHJvdmlkZXJBcmd1bWVudHMsIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSkge1xuXHRcdHRoaXMuX3RoZW1lID0gdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHR0aGlzLl9ydWxlVHlwZSA9IHJ1bGVUeXBlO1xuXHRcdHRoaXMuX3Byb3ZpZGVyQXJncyA9IHByb3ZpZGVyQXJncztcblx0XHR0aGlzLl91c2VzVGhlbWVDb2xvcnMgPSBmYWxzZTtcblx0XHR0aGlzLl9oYXNDb250ZW50ID0gZmFsc2U7XG5cdFx0dGhpcy5faGFzTGV0dGVyU3BhY2luZyA9IGZhbHNlO1xuXG5cdFx0bGV0IGNsYXNzTmFtZSA9IENTU05hbWVIZWxwZXIuZ2V0Q2xhc3NOYW1lKHRoaXMuX3Byb3ZpZGVyQXJncy5rZXksIHJ1bGVUeXBlKTtcblx0XHRpZiAodGhpcy5fcHJvdmlkZXJBcmdzLnBhcmVudFR5cGVLZXkpIHtcblx0XHRcdGNsYXNzTmFtZSA9IGNsYXNzTmFtZSArICcgJyArIENTU05hbWVIZWxwZXIuZ2V0Q2xhc3NOYW1lKHRoaXMuX3Byb3ZpZGVyQXJncy5wYXJlbnRUeXBlS2V5LCBydWxlVHlwZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2NsYXNzTmFtZSA9IGNsYXNzTmFtZTtcblxuXHRcdHRoaXMuX3VuVGhlbWVkU2VsZWN0b3IgPSBDU1NOYW1lSGVscGVyLmdldFNlbGVjdG9yKHRoaXMuX3Byb3ZpZGVyQXJncy5rZXksIHRoaXMuX3Byb3ZpZGVyQXJncy5wYXJlbnRUeXBlS2V5LCBydWxlVHlwZSk7XG5cblx0XHR0aGlzLl9idWlsZENTUygpO1xuXG5cdFx0aWYgKHRoaXMuX3VzZXNUaGVtZUNvbG9ycykge1xuXHRcdFx0dGhpcy5fdGhlbWVMaXN0ZW5lciA9IHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UodGhlbWUgPT4ge1xuXHRcdFx0XHR0aGlzLl90aGVtZSA9IHRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZUNTUygpO1xuXHRcdFx0XHR0aGlzLl9idWlsZENTUygpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3RoZW1lTGlzdGVuZXIgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCkge1xuXHRcdGlmICh0aGlzLl9oYXNDb250ZW50KSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVDU1MoKTtcblx0XHRcdHRoaXMuX2hhc0NvbnRlbnQgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3RoZW1lTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuX3RoZW1lTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fdGhlbWVMaXN0ZW5lciA9IG51bGw7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBoYXNDb250ZW50KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oYXNDb250ZW50O1xuXHR9XG5cblx0cHVibGljIGdldCBoYXNMZXR0ZXJTcGFjaW5nKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9oYXNMZXR0ZXJTcGFjaW5nO1xuXHR9XG5cblx0cHVibGljIGdldCBjbGFzc05hbWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fY2xhc3NOYW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRDU1MoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX3Byb3ZpZGVyQXJncy5vcHRpb25zO1xuXHRcdGxldCB1bnRoZW1lZENTUzogc3RyaW5nLCBsaWdodENTUzogc3RyaW5nLCBkYXJrQ1NTOiBzdHJpbmc7XG5cdFx0c3dpdGNoICh0aGlzLl9ydWxlVHlwZSkge1xuXHRcdFx0Y2FzZSBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5DbGFzc05hbWU6XG5cdFx0XHRcdHVudGhlbWVkQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ2xhc3NOYW1lKG9wdGlvbnMpO1xuXHRcdFx0XHRsaWdodENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNsYXNzTmFtZShvcHRpb25zLmxpZ2h0KTtcblx0XHRcdFx0ZGFya0NTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNsYXNzTmFtZShvcHRpb25zLmRhcmspO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuSW5saW5lQ2xhc3NOYW1lOlxuXHRcdFx0XHR1bnRoZW1lZENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbklubGluZUNsYXNzTmFtZShvcHRpb25zKTtcblx0XHRcdFx0bGlnaHRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25JbmxpbmVDbGFzc05hbWUob3B0aW9ucy5saWdodCk7XG5cdFx0XHRcdGRhcmtDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25JbmxpbmVDbGFzc05hbWUob3B0aW9ucy5kYXJrKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkdseXBoTWFyZ2luQ2xhc3NOYW1lOlxuXHRcdFx0XHR1bnRoZW1lZENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkdseXBoTWFyZ2luQ2xhc3NOYW1lKG9wdGlvbnMpO1xuXHRcdFx0XHRsaWdodENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkdseXBoTWFyZ2luQ2xhc3NOYW1lKG9wdGlvbnMubGlnaHQpO1xuXHRcdFx0XHRkYXJrQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uR2x5cGhNYXJnaW5DbGFzc05hbWUob3B0aW9ucy5kYXJrKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkJlZm9yZUNvbnRlbnRDbGFzc05hbWU6XG5cdFx0XHRcdHVudGhlbWVkQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmJlZm9yZSk7XG5cdFx0XHRcdGxpZ2h0Q1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmxpZ2h0ICYmIG9wdGlvbnMubGlnaHQuYmVmb3JlKTtcblx0XHRcdFx0ZGFya0NTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5kYXJrICYmIG9wdGlvbnMuZGFyay5iZWZvcmUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQWZ0ZXJDb250ZW50Q2xhc3NOYW1lOlxuXHRcdFx0XHR1bnRoZW1lZENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5hZnRlcik7XG5cdFx0XHRcdGxpZ2h0Q1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmxpZ2h0ICYmIG9wdGlvbnMubGlnaHQuYWZ0ZXIpO1xuXHRcdFx0XHRkYXJrQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmRhcmsgJiYgb3B0aW9ucy5kYXJrLmFmdGVyKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlLkJlZm9yZUluamVjdGVkVGV4dENsYXNzTmFtZTpcblx0XHRcdFx0dW50aGVtZWRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdGlvbnMuYmVmb3JlSW5qZWN0ZWRUZXh0KTtcblx0XHRcdFx0bGlnaHRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdGlvbnMubGlnaHQgJiYgb3B0aW9ucy5saWdodC5iZWZvcmVJbmplY3RlZFRleHQpO1xuXHRcdFx0XHRkYXJrQ1NTID0gdGhpcy5nZXRDU1NUZXh0Rm9yTW9kZWxEZWNvcmF0aW9uQ29udGVudENsYXNzTmFtZShvcHRpb25zLmRhcmsgJiYgb3B0aW9ucy5kYXJrLmJlZm9yZUluamVjdGVkVGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5BZnRlckluamVjdGVkVGV4dENsYXNzTmFtZTpcblx0XHRcdFx0dW50aGVtZWRDU1MgPSB0aGlzLmdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25Db250ZW50Q2xhc3NOYW1lKG9wdGlvbnMuYWZ0ZXJJbmplY3RlZFRleHQpO1xuXHRcdFx0XHRsaWdodENTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5saWdodCAmJiBvcHRpb25zLmxpZ2h0LmFmdGVySW5qZWN0ZWRUZXh0KTtcblx0XHRcdFx0ZGFya0NTUyA9IHRoaXMuZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0aW9ucy5kYXJrICYmIG9wdGlvbnMuZGFyay5hZnRlckluamVjdGVkVGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIHJ1bGUgdHlwZTogJyArIHRoaXMuX3J1bGVUeXBlKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2hlZXQgPSB0aGlzLl9wcm92aWRlckFyZ3Muc3R5bGVTaGVldDtcblxuXHRcdGxldCBoYXNDb250ZW50ID0gZmFsc2U7XG5cdFx0aWYgKHVudGhlbWVkQ1NTLmxlbmd0aCA+IDApIHtcblx0XHRcdHNoZWV0Lmluc2VydFJ1bGUodGhpcy5fdW5UaGVtZWRTZWxlY3RvciwgdW50aGVtZWRDU1MpO1xuXHRcdFx0aGFzQ29udGVudCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChsaWdodENTUy5sZW5ndGggPiAwKSB7XG5cdFx0XHRzaGVldC5pbnNlcnRSdWxlKGAudnMke3RoaXMuX3VuVGhlbWVkU2VsZWN0b3J9LCAuaGMtbGlnaHQke3RoaXMuX3VuVGhlbWVkU2VsZWN0b3J9YCwgbGlnaHRDU1MpO1xuXHRcdFx0aGFzQ29udGVudCA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChkYXJrQ1NTLmxlbmd0aCA+IDApIHtcblx0XHRcdHNoZWV0Lmluc2VydFJ1bGUoYC52cy1kYXJrJHt0aGlzLl91blRoZW1lZFNlbGVjdG9yfSwgLmhjLWJsYWNrJHt0aGlzLl91blRoZW1lZFNlbGVjdG9yfWAsIGRhcmtDU1MpO1xuXHRcdFx0aGFzQ29udGVudCA9IHRydWU7XG5cdFx0fVxuXHRcdHRoaXMuX2hhc0NvbnRlbnQgPSBoYXNDb250ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlQ1NTKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Byb3ZpZGVyQXJncy5zdHlsZVNoZWV0LnJlbW92ZVJ1bGVzQ29udGFpbmluZ1NlbGVjdG9yKHRoaXMuX3VuVGhlbWVkU2VsZWN0b3IpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIHRoZSBDU1MgZm9yIGRlY29yYXRpb25zIHN0eWxlZCB2aWEgYGNsYXNzTmFtZWAuXG5cdCAqL1xuXHRwcml2YXRlIGdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25DbGFzc05hbWUob3B0czogSVRoZW1lRGVjb3JhdGlvblJlbmRlck9wdGlvbnMgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICghb3B0cykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBjc3NUZXh0QXJyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHRoaXMuY29sbGVjdENTU1RleHQob3B0cywgWydiYWNrZ3JvdW5kQ29sb3InXSwgY3NzVGV4dEFycik7XG5cdFx0dGhpcy5jb2xsZWN0Q1NTVGV4dChvcHRzLCBbJ291dGxpbmUnLCAnb3V0bGluZUNvbG9yJywgJ291dGxpbmVTdHlsZScsICdvdXRsaW5lV2lkdGgnXSwgY3NzVGV4dEFycik7XG5cdFx0dGhpcy5jb2xsZWN0Qm9yZGVyU2V0dGluZ3NDU1NUZXh0KG9wdHMsIGNzc1RleHRBcnIpO1xuXHRcdHJldHVybiBjc3NUZXh0QXJyLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIHRoZSBDU1MgZm9yIGRlY29yYXRpb25zIHN0eWxlZCB2aWEgYGlubGluZUNsYXNzTmFtZWAuXG5cdCAqL1xuXHRwcml2YXRlIGdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25JbmxpbmVDbGFzc05hbWUob3B0czogSVRoZW1lRGVjb3JhdGlvblJlbmRlck9wdGlvbnMgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmICghb3B0cykge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblx0XHRjb25zdCBjc3NUZXh0QXJyOiBzdHJpbmdbXSA9IFtdO1xuXHRcdHRoaXMuY29sbGVjdENTU1RleHQob3B0cywgWydmb250U3R5bGUnLCAnZm9udFdlaWdodCcsICdmb250RmFtaWx5JywgJ2ZvbnRTaXplJywgJ3RleHREZWNvcmF0aW9uJywgJ2N1cnNvcicsICdjb2xvcicsICdvcGFjaXR5JywgJ2xldHRlclNwYWNpbmcnXSwgY3NzVGV4dEFycik7XG5cdFx0aWYgKG9wdHMubGV0dGVyU3BhY2luZykge1xuXHRcdFx0dGhpcy5faGFzTGV0dGVyU3BhY2luZyA9IHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBjc3NUZXh0QXJyLmpvaW4oJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIHRoZSBDU1MgZm9yIGRlY29yYXRpb25zIHN0eWxlZCBiZWZvcmUgb3IgYWZ0ZXIgY29udGVudC5cblx0ICovXG5cdHByaXZhdGUgZ2V0Q1NTVGV4dEZvck1vZGVsRGVjb3JhdGlvbkNvbnRlbnRDbGFzc05hbWUob3B0czogSUNvbnRlbnREZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKCFvcHRzKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IGNzc1RleHRBcnI6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAodHlwZW9mIG9wdHMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmNvbGxlY3RCb3JkZXJTZXR0aW5nc0NTU1RleHQob3B0cywgY3NzVGV4dEFycik7XG5cdFx0XHRpZiAodHlwZW9mIG9wdHMuY29udGVudEljb25QYXRoICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRjc3NUZXh0QXJyLnB1c2goc3RyaW5ncy5mb3JtYXQoX0NTU19NQVAuY29udGVudEljb25QYXRoLCBjc3NKcy5hc0NTU1VybChVUkkucmV2aXZlKG9wdHMuY29udGVudEljb25QYXRoKSkpKTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2Ygb3B0cy5jb250ZW50VGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uc3QgdHJ1bmNhdGVkID0gb3B0cy5jb250ZW50VGV4dC5tYXRjaCgvXi4qJC9tKSFbMF07IC8vIG9ubHkgdGFrZSBmaXJzdCBsaW5lXG5cdFx0XHRcdGNvbnN0IGVzY2FwZWQgPSB0cnVuY2F0ZWQucmVwbGFjZSgvWydcXFxcXS9nLCAnXFxcXCQmJyk7XG5cblx0XHRcdFx0Y3NzVGV4dEFyci5wdXNoKHN0cmluZ3MuZm9ybWF0KF9DU1NfTUFQLmNvbnRlbnRUZXh0LCBlc2NhcGVkKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvbGxlY3RDU1NUZXh0KG9wdHMsIFsndmVydGljYWxBbGlnbicsICdmb250U3R5bGUnLCAnZm9udFdlaWdodCcsICdmb250U2l6ZScsICdmb250RmFtaWx5JywgJ3RleHREZWNvcmF0aW9uJywgJ2NvbG9yJywgJ29wYWNpdHknLCAnYmFja2dyb3VuZENvbG9yJywgJ21hcmdpbicsICdwYWRkaW5nJ10sIGNzc1RleHRBcnIpO1xuXHRcdFx0aWYgKHRoaXMuY29sbGVjdENTU1RleHQob3B0cywgWyd3aWR0aCcsICdoZWlnaHQnXSwgY3NzVGV4dEFycikpIHtcblx0XHRcdFx0Y3NzVGV4dEFyci5wdXNoKCdkaXNwbGF5OmlubGluZS1ibG9jazsnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY3NzVGV4dEFyci5qb2luKCcnKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCB0aGUgQ1NTIGZvciBkZWNvcmF0aW9ucyBzdHlsZWQgdmlhIGBnbHlwaE1hcmdpbkNsYXNzTmFtZWAuXG5cdCAqL1xuXHRwcml2YXRlIGdldENTU1RleHRGb3JNb2RlbERlY29yYXRpb25HbHlwaE1hcmdpbkNsYXNzTmFtZShvcHRzOiBJVGhlbWVEZWNvcmF0aW9uUmVuZGVyT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0aWYgKCFvcHRzKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXHRcdGNvbnN0IGNzc1RleHRBcnI6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAodHlwZW9mIG9wdHMuZ3V0dGVySWNvblBhdGggIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjc3NUZXh0QXJyLnB1c2goc3RyaW5ncy5mb3JtYXQoX0NTU19NQVAuZ3V0dGVySWNvblBhdGgsIGNzc0pzLmFzQ1NTVXJsKFVSSS5yZXZpdmUob3B0cy5ndXR0ZXJJY29uUGF0aCkpKSk7XG5cdFx0XHRpZiAodHlwZW9mIG9wdHMuZ3V0dGVySWNvblNpemUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGNzc1RleHRBcnIucHVzaChzdHJpbmdzLmZvcm1hdChfQ1NTX01BUC5ndXR0ZXJJY29uU2l6ZSwgb3B0cy5ndXR0ZXJJY29uU2l6ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBjc3NUZXh0QXJyLmpvaW4oJycpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb2xsZWN0Qm9yZGVyU2V0dGluZ3NDU1NUZXh0KG9wdHM6IHVua25vd24sIGNzc1RleHRBcnI6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY29sbGVjdENTU1RleHQob3B0cywgWydib3JkZXInLCAnYm9yZGVyQ29sb3InLCAnYm9yZGVyUmFkaXVzJywgJ2JvcmRlclNwYWNpbmcnLCAnYm9yZGVyU3R5bGUnLCAnYm9yZGVyV2lkdGgnXSwgY3NzVGV4dEFycikpIHtcblx0XHRcdGNzc1RleHRBcnIucHVzaChzdHJpbmdzLmZvcm1hdCgnYm94LXNpemluZzogYm9yZGVyLWJveDsnKSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBjb2xsZWN0Q1NTVGV4dChvcHRzOiB1bmtub3duLCBwcm9wZXJ0aWVzOiBzdHJpbmdbXSwgY3NzVGV4dEFycjogc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRjb25zdCBsZW5CZWZvcmUgPSBjc3NUZXh0QXJyLmxlbmd0aDtcblx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIHByb3BlcnRpZXMpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gdGhpcy5yZXNvbHZlVmFsdWUoKG9wdHMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3Byb3BlcnR5XSBhcyBzdHJpbmcgfCBUaGVtZUNvbG9yKTtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGNzc1RleHRBcnIucHVzaChzdHJpbmdzLmZvcm1hdChfQ1NTX01BUFtwcm9wZXJ0eV0sIHZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjc3NUZXh0QXJyLmxlbmd0aCAhPT0gbGVuQmVmb3JlO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNvbHZlVmFsdWUodmFsdWU6IHN0cmluZyB8IFRoZW1lQ29sb3IpOiBzdHJpbmcge1xuXHRcdGlmIChpc1RoZW1lQ29sb3IodmFsdWUpKSB7XG5cdFx0XHR0aGlzLl91c2VzVGhlbWVDb2xvcnMgPSB0cnVlO1xuXHRcdFx0Y29uc3QgY29sb3IgPSB0aGlzLl90aGVtZS5nZXRDb2xvcih2YWx1ZS5pZCk7XG5cdFx0XHRpZiAoY29sb3IpIHtcblx0XHRcdFx0cmV0dXJuIGNvbG9yLnRvU3RyaW5nKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gJ3RyYW5zcGFyZW50Jztcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbmNvbnN0IGVudW0gTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUge1xuXHRDbGFzc05hbWUgPSAwLFxuXHRJbmxpbmVDbGFzc05hbWUgPSAxLFxuXHRHbHlwaE1hcmdpbkNsYXNzTmFtZSA9IDIsXG5cdEJlZm9yZUNvbnRlbnRDbGFzc05hbWUgPSAzLFxuXHRBZnRlckNvbnRlbnRDbGFzc05hbWUgPSA0LFxuXHRCZWZvcmVJbmplY3RlZFRleHRDbGFzc05hbWUgPSA1LFxuXHRBZnRlckluamVjdGVkVGV4dENsYXNzTmFtZSA9IDYsXG59XG5cbmNsYXNzIENTU05hbWVIZWxwZXIge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0Q2xhc3NOYW1lKGtleTogc3RyaW5nLCB0eXBlOiBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdjZWQtJyArIGtleSArICctJyArIHR5cGU7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldFNlbGVjdG9yKGtleTogc3RyaW5nLCBwYXJlbnRLZXk6IHN0cmluZyB8IHVuZGVmaW5lZCwgcnVsZVR5cGU6IE1vZGVsRGVjb3JhdGlvbkNTU1J1bGVUeXBlKTogc3RyaW5nIHtcblx0XHRsZXQgc2VsZWN0b3IgPSAnLm1vbmFjby1lZGl0b3IgLicgKyB0aGlzLmdldENsYXNzTmFtZShrZXksIHJ1bGVUeXBlKTtcblx0XHRpZiAocGFyZW50S2V5KSB7XG5cdFx0XHRzZWxlY3RvciA9IHNlbGVjdG9yICsgJy4nICsgdGhpcy5nZXRDbGFzc05hbWUocGFyZW50S2V5LCBydWxlVHlwZSk7XG5cdFx0fVxuXHRcdGlmIChydWxlVHlwZSA9PT0gTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUuQmVmb3JlQ29udGVudENsYXNzTmFtZSkge1xuXHRcdFx0c2VsZWN0b3IgKz0gJzo6YmVmb3JlJztcblx0XHR9IGVsc2UgaWYgKHJ1bGVUeXBlID09PSBNb2RlbERlY29yYXRpb25DU1NSdWxlVHlwZS5BZnRlckNvbnRlbnRDbGFzc05hbWUpIHtcblx0XHRcdHNlbGVjdG9yICs9ICc6OmFmdGVyJztcblx0XHR9XG5cdFx0cmV0dXJuIHNlbGVjdG9yO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLG9CQUFvQjtBQUNoQyxZQUFZLFdBQVc7QUFDdkIsU0FBUyxlQUFzQjtBQUMvQixTQUFzQixpQkFBaUIsWUFBWSxjQUFjLHFCQUFxQjtBQUN0RixTQUFTLGtCQUFrQjtBQUMzQixZQUFZLGFBQWE7QUFDekIsU0FBUyxXQUFXO0FBR3BCLFNBQW1HLG9CQUFvQjtBQUN2SCxTQUF5Ryx5QkFBaUQ7QUFFMUosU0FBc0IscUJBQXFCO0FBR3BDLElBQWUsNEJBQWYsY0FBaUQsV0FBeUM7QUFBQSxFQW1DaEcsWUFDaUMsZUFDL0I7QUFDRCxVQUFNO0FBRjBCO0FBaENqQyxTQUFpQiwwQkFBMEIsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQzdFLFNBQWdCLHlCQUF5QixLQUFLLHdCQUF3QjtBQUV0RSxTQUFpQixtQkFBeUMsS0FBSyxVQUFVLElBQUksUUFBcUIsQ0FBQztBQUNuRyxTQUFnQixrQkFBc0MsS0FBSyxpQkFBaUI7QUFFNUUsU0FBaUIsc0JBQTRDLEtBQUssVUFBVSxJQUFJLFFBQXFCLENBQUM7QUFDdEcsU0FBZ0IscUJBQXlDLEtBQUssb0JBQW9CO0FBRWxGLFNBQWlCLDBCQUEwQixLQUFLLFVBQVUsSUFBSSxR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TUFBTSxDQUFDLFVBQVUsZUFBZSxnQkFBZ0IsaUJBQWlCLGVBQWUsYUFBYSxHQUFHLFVBQVUsR0FBRztBQUNwSSxpQkFBVyxLQUFLLFFBQVEsT0FBTyx5QkFBeUIsQ0FBQztBQUN6RCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxlQUFlLE1BQWUsWUFBc0IsWUFBK0I7QUFDMUYsVUFBTSxZQUFZLFdBQVc7QUFDN0IsZUFBVyxZQUFZLFlBQVk7QUFDbEMsWUFBTSxRQUFRLEtBQUssYUFBYyxLQUFpQyxRQUFRLENBQXdCO0FBQ2xHLFVBQUksT0FBTyxVQUFVLFVBQVU7QUFDOUIsbUJBQVcsS0FBSyxRQUFRLE9BQU8sU0FBUyxRQUFRLEdBQUcsS0FBSyxDQUFDO0FBQUEsTUFDMUQ7QUFBQSxJQUNEO0FBQ0EsV0FBTyxXQUFXLFdBQVc7QUFBQSxFQUM5QjtBQUFBLEVBRVEsYUFBYSxPQUFvQztBQUN4RCxRQUFJLGFBQWEsS0FBSyxHQUFHO0FBQ3hCLFdBQUssbUJBQW1CO0FBQ3hCLFlBQU0sUUFBUSxLQUFLLE9BQU8sU0FBUyxNQUFNLEVBQUU7QUFDM0MsVUFBSSxPQUFPO0FBQ1YsZUFBTyxNQUFNLFNBQVM7QUFBQSxNQUN2QjtBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLElBQVcsNkJBQVgsa0JBQVdBLGdDQUFYO0FBQ0MsRUFBQUEsd0RBQUEsZUFBWSxLQUFaO0FBQ0EsRUFBQUEsd0RBQUEscUJBQWtCLEtBQWxCO0FBQ0EsRUFBQUEsd0RBQUEsMEJBQXVCLEtBQXZCO0FBQ0EsRUFBQUEsd0RBQUEsNEJBQXlCLEtBQXpCO0FBQ0EsRUFBQUEsd0RBQUEsMkJBQXdCLEtBQXhCO0FBQ0EsRUFBQUEsd0RBQUEsaUNBQThCLEtBQTlCO0FBQ0EsRUFBQUEsd0RBQUEsZ0NBQTZCLEtBQTdCO0FBUFUsU0FBQUE7QUFBQSxHQUFBO0FBVVgsTUFBTSxjQUFjO0FBQUEsRUFFbkIsT0FBYyxhQUFhLEtBQWEsTUFBMEM7QUFDakYsV0FBTyxTQUFTLE1BQU0sTUFBTTtBQUFBLEVBQzdCO0FBQUEsRUFFQSxPQUFjLFlBQVksS0FBYSxXQUErQixVQUE4QztBQUNuSCxRQUFJLFdBQVcscUJBQXFCLEtBQUssYUFBYSxLQUFLLFFBQVE7QUFDbkUsUUFBSSxXQUFXO0FBQ2QsaUJBQVcsV0FBVyxNQUFNLEtBQUssYUFBYSxXQUFXLFFBQVE7QUFBQSxJQUNsRTtBQUNBLFFBQUksYUFBYSxnQ0FBbUQ7QUFDbkUsa0JBQVk7QUFBQSxJQUNiLFdBQVcsYUFBYSwrQkFBa0Q7QUFDekUsa0JBQVk7QUFBQSxJQUNiO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsiTW9kZWxEZWNvcmF0aW9uQ1NTUnVsZVR5cGUiXQp9Cg==
