import { basename } from "../../../../base/common/path.js";
import * as Json from "../../../../base/common/json.js";
import { Color } from "../../../../base/common/color.js";
import { ExtensionData, THEME_SCOPE_CLOSE_PAREN, THEME_SCOPE_OPEN_PAREN, themeScopeRegex, THEME_SCOPE_WILDCARD } from "./workbenchThemeService.js";
import { convertSettings } from "./themeCompatibility.js";
import * as nls from "../../../../nls.js";
import * as types from "../../../../base/common/types.js";
import * as resources from "../../../../base/common/resources.js";
import { Extensions as ColorRegistryExtensions, editorBackground, editorForeground, DEFAULT_COLOR_CONFIG_VALUE } from "../../../../platform/theme/common/colorRegistry.js";
import { getThemeTypeSelector } from "../../../../platform/theme/common/themeService.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { getParseErrorMessage } from "../../../../base/common/jsonErrorMessages.js";
import { parse as parsePList } from "./plistParser.js";
import { TokenStyle, SemanticTokenRule, getTokenClassificationRegistry, parseClassifierString } from "../../../../platform/theme/common/tokenClassificationRegistry.js";
import { createMatchers } from "./textMateScopeMatcher.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ColorScheme, ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
import { ColorId, FontStyle, MetadataConsts } from "../../../../editor/common/encodedTokenAttributes.js";
import { toStandardTokenType } from "../../../../editor/common/languages/supports/tokenization.js";
const colorRegistry = Registry.as(ColorRegistryExtensions.ColorContribution);
const tokenClassificationRegistry = getTokenClassificationRegistry();
const tokenGroupToScopesMap = {
  comments: ["comment", "punctuation.definition.comment"],
  strings: ["string", "meta.embedded.assembly"],
  keywords: ["keyword - keyword.operator", "keyword.control", "storage", "storage.type"],
  numbers: ["constant.numeric"],
  types: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
  functions: ["entity.name.function", "support.function"],
  variables: ["variable", "entity.name.variable"]
};
const _ColorThemeData = class _ColorThemeData {
  // created on demand
  constructor(id, label, settingsId) {
    this.themeTokenColors = [];
    this.customTokenColors = [];
    this.colorMap = {};
    this.customColorMap = {};
    this.semanticTokenRules = [];
    this.customSemanticTokenRules = [];
    this.textMateThemingRules = void 0;
    // created on demand
    this.tokenColorIndex = void 0;
    // created on demand
    this.tokenFontIndex = void 0;
    this.id = id;
    this.label = label;
    this.settingsId = settingsId;
    this.isLoaded = false;
  }
  get semanticHighlighting() {
    if (this.customSemanticHighlighting !== void 0) {
      return this.customSemanticHighlighting;
    }
    if (this.customSemanticHighlightingDeprecated !== void 0) {
      return this.customSemanticHighlightingDeprecated;
    }
    return !!this.themeSemanticHighlighting;
  }
  get tokenColors() {
    if (!this.textMateThemingRules) {
      let addRule2 = function(rule) {
        if (rule.scope && rule.settings) {
          if (rule.scope === "token.info-token") {
            hasDefaultTokens = true;
          }
          const ruleSettings = rule.settings;
          result.push({
            scope: rule.scope,
            settings: {
              foreground: normalizeColor(ruleSettings.foreground),
              background: normalizeColor(ruleSettings.background),
              fontStyle: ruleSettings.fontStyle,
              fontSize: ruleSettings.fontSize,
              fontFamily: ruleSettings.fontFamily,
              lineHeight: ruleSettings.lineHeight
            }
          });
        }
      };
      var addRule = addRule2;
      const result = [];
      const foreground = this.getColor(editorForeground) || this.getDefault(editorForeground);
      const background = this.getColor(editorBackground) || this.getDefault(editorBackground);
      result.push({
        settings: {
          foreground: normalizeColor(foreground),
          background: normalizeColor(background)
        }
      });
      let hasDefaultTokens = false;
      this.themeTokenColors.forEach(addRule2);
      this.customTokenColors.forEach(addRule2);
      if (!hasDefaultTokens) {
        defaultThemeColors[this.type].forEach(addRule2);
      }
      this.textMateThemingRules = result;
    }
    return this.textMateThemingRules;
  }
  getColor(colorId, useDefault) {
    const customColor = this.customColorMap[colorId];
    if (customColor instanceof Color) {
      return customColor;
    }
    if (customColor === void 0) {
      const color = this.colorMap[colorId];
      if (color !== void 0) {
        return color;
      }
    }
    if (useDefault !== false) {
      return this.getDefault(colorId);
    }
    return void 0;
  }
  getTokenStyle(type, modifiers, language, useDefault = true, definitions = {}) {
    const result = {
      foreground: void 0,
      bold: void 0,
      underline: void 0,
      strikethrough: void 0,
      italic: void 0
    };
    const score = {
      foreground: -1,
      bold: -1,
      underline: -1,
      strikethrough: -1,
      italic: -1,
      fontFamily: -1,
      fontSize: -1,
      lineHeight: -1
    };
    function _processStyle(matchScore, style, definition) {
      if (style.foreground && score.foreground <= matchScore) {
        score.foreground = matchScore;
        result.foreground = style.foreground;
        definitions.foreground = definition;
      }
      for (const p of ["bold", "underline", "strikethrough", "italic"]) {
        const property = p;
        const info = style[property];
        if (info !== void 0) {
          if (score[property] <= matchScore) {
            score[property] = matchScore;
            result[property] = info;
            definitions[property] = definition;
          }
        }
      }
    }
    function _processSemanticTokenRule(rule) {
      const matchScore = rule.selector.match(type, modifiers, language);
      if (matchScore >= 0) {
        _processStyle(matchScore, rule.style, rule);
      }
    }
    this.semanticTokenRules.forEach(_processSemanticTokenRule);
    this.customSemanticTokenRules.forEach(_processSemanticTokenRule);
    let hasUndefinedStyleProperty = false;
    for (const k in score) {
      const key = k;
      if (score[key] === -1) {
        hasUndefinedStyleProperty = true;
      } else {
        score[key] = Number.MAX_VALUE;
      }
    }
    if (hasUndefinedStyleProperty) {
      for (const rule of tokenClassificationRegistry.getTokenStylingDefaultRules()) {
        const matchScore = rule.selector.match(type, modifiers, language);
        if (matchScore >= 0) {
          let style;
          if (rule.defaults.scopesToProbe) {
            style = this.resolveScopes(rule.defaults.scopesToProbe);
            if (style) {
              _processStyle(matchScore, style, rule.defaults.scopesToProbe);
            }
          }
          if (!style && useDefault !== false) {
            const tokenStyleValue = rule.defaults[this.type];
            style = this.resolveTokenStyleValue(tokenStyleValue);
            if (style) {
              _processStyle(matchScore, style, tokenStyleValue);
            }
          }
        }
      }
    }
    return TokenStyle.fromData(result);
  }
  /**
   * @param tokenStyleValue Resolve a tokenStyleValue in the context of a theme
   */
  resolveTokenStyleValue(tokenStyleValue) {
    if (tokenStyleValue === void 0) {
      return void 0;
    } else if (typeof tokenStyleValue === "string") {
      const { type, modifiers, language } = parseClassifierString(tokenStyleValue, "");
      return this.getTokenStyle(type, modifiers, language);
    } else if (typeof tokenStyleValue === "object") {
      return tokenStyleValue;
    }
    return void 0;
  }
  getTokenColorIndex() {
    if (!this.tokenColorIndex) {
      const index = new TokenColorIndex();
      this.tokenColors.forEach((rule) => {
        index.add(rule.settings.foreground);
        index.add(rule.settings.background);
      });
      this.semanticTokenRules.forEach((r) => index.add(r.style.foreground));
      tokenClassificationRegistry.getTokenStylingDefaultRules().forEach((r) => {
        const defaultColor = r.defaults[this.type];
        if (defaultColor && typeof defaultColor === "object") {
          index.add(defaultColor.foreground);
        }
      });
      this.customSemanticTokenRules.forEach((r) => index.add(r.style.foreground));
      this.tokenColorIndex = index;
    }
    return this.tokenColorIndex;
  }
  getTokenFontIndex() {
    if (!this.tokenFontIndex) {
      const index = new TokenFontIndex();
      this.tokenColors.forEach((r) => index.add(r.settings.fontFamily, r.settings.fontSize, r.settings.lineHeight));
      this.tokenFontIndex = index;
    }
    return this.tokenFontIndex;
  }
  get tokenColorMap() {
    return this.getTokenColorIndex().asArray();
  }
  get tokenFontMap() {
    return this.getTokenFontIndex().asArray();
  }
  getTokenStyleMetadata(typeWithLanguage, modifiers, defaultLanguage, useDefault = true, definitions = {}) {
    const { type, language } = parseClassifierString(typeWithLanguage, defaultLanguage);
    const style = this.getTokenStyle(type, modifiers, language, useDefault, definitions);
    if (!style) {
      return void 0;
    }
    return {
      foreground: this.getTokenColorIndex().get(style.foreground),
      bold: style.bold,
      underline: style.underline,
      strikethrough: style.strikethrough,
      italic: style.italic
    };
  }
  getTokenStylingRuleScope(rule) {
    if (this.customSemanticTokenRules.indexOf(rule) !== -1) {
      return "setting";
    }
    if (this.semanticTokenRules.indexOf(rule) !== -1) {
      return "theme";
    }
    return void 0;
  }
  getDefault(colorId) {
    return colorRegistry.resolveDefaultColor(colorId, this);
  }
  resolveScopes(scopes, definitions) {
    if (!this.themeTokenScopeMatchers) {
      this.themeTokenScopeMatchers = this.themeTokenColors.map(getScopeMatcher);
    }
    if (!this.customTokenScopeMatchers) {
      this.customTokenScopeMatchers = this.customTokenColors.map(getScopeMatcher);
    }
    for (const scope of scopes) {
      let findTokenStyleForScopeInScopes2 = function(scopeMatchers, themingRules) {
        for (let i = 0; i < scopeMatchers.length; i++) {
          const score = scopeMatchers[i](scope);
          if (score >= 0) {
            const themingRule = themingRules[i];
            const settings = themingRules[i].settings;
            if (score >= foregroundScore && settings.foreground) {
              foreground = settings.foreground;
              foregroundScore = score;
              foregroundThemingRule = themingRule;
            }
            if (score >= fontStyleScore && types.isString(settings.fontStyle)) {
              fontStyle = settings.fontStyle;
              fontStyleScore = score;
              fontStyleThemingRule = themingRule;
            }
          }
        }
      };
      var findTokenStyleForScopeInScopes = findTokenStyleForScopeInScopes2;
      let foreground = void 0;
      let fontStyle = void 0;
      let foregroundScore = -1;
      let fontStyleScore = -1;
      let fontStyleThemingRule = void 0;
      let foregroundThemingRule = void 0;
      findTokenStyleForScopeInScopes2(this.themeTokenScopeMatchers, this.themeTokenColors);
      findTokenStyleForScopeInScopes2(this.customTokenScopeMatchers, this.customTokenColors);
      if (foreground !== void 0 || fontStyle !== void 0) {
        if (definitions) {
          definitions.foreground = foregroundThemingRule;
          definitions.bold = definitions.italic = definitions.underline = definitions.strikethrough = fontStyleThemingRule;
          definitions.scope = scope;
        }
        return TokenStyle.fromSettings(foreground, fontStyle);
      }
    }
    return void 0;
  }
  defines(colorId) {
    const customColor = this.customColorMap[colorId];
    if (customColor instanceof Color) {
      return true;
    }
    return customColor === void 0 && this.colorMap.hasOwnProperty(colorId);
  }
  setCustomizations(settings) {
    this.setCustomColors(settings.colorCustomizations);
    this.setCustomTokenColors(settings.tokenColorCustomizations);
    this.setCustomSemanticTokenColors(settings.semanticTokenColorCustomizations);
  }
  setCustomColors(colors) {
    this.customColorMap = {};
    this.overwriteCustomColors(colors);
    const themeSpecificColors = this.getThemeSpecificColors(colors);
    if (types.isObject(themeSpecificColors)) {
      this.overwriteCustomColors(themeSpecificColors);
    }
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
    this.customTokenScopeMatchers = void 0;
  }
  overwriteCustomColors(colors) {
    for (const id in colors) {
      const colorVal = colors[id];
      if (colorVal === DEFAULT_COLOR_CONFIG_VALUE) {
        this.customColorMap[id] = DEFAULT_COLOR_CONFIG_VALUE;
      } else if (typeof colorVal === "string") {
        this.customColorMap[id] = Color.fromHex(colorVal);
      }
    }
  }
  setCustomTokenColors(customTokenColors) {
    this.customTokenColors = [];
    this.customSemanticHighlightingDeprecated = void 0;
    this.addCustomTokenColors(customTokenColors);
    const themeSpecificTokenColors = this.getThemeSpecificColors(customTokenColors);
    if (types.isObject(themeSpecificTokenColors)) {
      this.addCustomTokenColors(themeSpecificTokenColors);
    }
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
    this.customTokenScopeMatchers = void 0;
  }
  setCustomSemanticTokenColors(semanticTokenColors) {
    this.customSemanticTokenRules = [];
    this.customSemanticHighlighting = void 0;
    if (semanticTokenColors) {
      this.customSemanticHighlighting = semanticTokenColors.enabled;
      if (semanticTokenColors.rules) {
        this.readSemanticTokenRules(semanticTokenColors.rules);
      }
      const themeSpecificColors = this.getThemeSpecificColors(semanticTokenColors);
      if (types.isObject(themeSpecificColors)) {
        if (themeSpecificColors.enabled !== void 0) {
          this.customSemanticHighlighting = themeSpecificColors.enabled;
        }
        if (themeSpecificColors.rules) {
          this.readSemanticTokenRules(themeSpecificColors.rules);
        }
      }
    }
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
  }
  isThemeScope(key) {
    return key.charAt(0) === THEME_SCOPE_OPEN_PAREN && key.charAt(key.length - 1) === THEME_SCOPE_CLOSE_PAREN;
  }
  isThemeScopeMatch(themeId) {
    const themeIdFirstChar = themeId.charAt(0);
    const themeIdLastChar = themeId.charAt(themeId.length - 1);
    const themeIdPrefix = themeId.slice(0, -1);
    const themeIdInfix = themeId.slice(1, -1);
    const themeIdSuffix = themeId.slice(1);
    return themeId === this.settingsId || this.settingsId.includes(themeIdInfix) && themeIdFirstChar === THEME_SCOPE_WILDCARD && themeIdLastChar === THEME_SCOPE_WILDCARD || this.settingsId.startsWith(themeIdPrefix) && themeIdLastChar === THEME_SCOPE_WILDCARD || this.settingsId.endsWith(themeIdSuffix) && themeIdFirstChar === THEME_SCOPE_WILDCARD;
  }
  getThemeSpecificColors(colors) {
    let themeSpecificColors;
    for (const key in colors) {
      const scopedColors = colors[key];
      if (this.isThemeScope(key) && scopedColors instanceof Object && !Array.isArray(scopedColors)) {
        const themeScopeList = key.match(themeScopeRegex) || [];
        for (const themeScope of themeScopeList) {
          const themeId = themeScope.substring(1, themeScope.length - 1);
          if (this.isThemeScopeMatch(themeId)) {
            if (!themeSpecificColors) {
              themeSpecificColors = {};
            }
            const scopedThemeSpecificColors = scopedColors;
            for (const subkey in scopedThemeSpecificColors) {
              const originalColors = themeSpecificColors[subkey];
              const overrideColors = scopedThemeSpecificColors[subkey];
              if (Array.isArray(originalColors) && Array.isArray(overrideColors)) {
                themeSpecificColors[subkey] = originalColors.concat(overrideColors);
              } else if (overrideColors) {
                themeSpecificColors[subkey] = overrideColors;
              }
            }
          }
        }
      }
    }
    return themeSpecificColors;
  }
  readSemanticTokenRules(tokenStylingRuleSection) {
    for (const key in tokenStylingRuleSection) {
      if (!this.isThemeScope(key)) {
        try {
          const rule = readSemanticTokenRule(key, tokenStylingRuleSection[key]);
          if (rule) {
            this.customSemanticTokenRules.push(rule);
          }
        } catch (e) {
        }
      }
    }
  }
  addCustomTokenColors(customTokenColors) {
    for (const tokenGroup in tokenGroupToScopesMap) {
      const group = tokenGroup;
      const value = customTokenColors[group];
      if (value) {
        const settings = typeof value === "string" ? { foreground: value } : value;
        const scopes = tokenGroupToScopesMap[group];
        for (const scope of scopes) {
          this.customTokenColors.push({ scope, settings });
        }
      }
    }
    if (Array.isArray(customTokenColors.textMateRules)) {
      for (const rule of customTokenColors.textMateRules) {
        if (rule.scope && rule.settings) {
          this.customTokenColors.push(rule);
        }
      }
    }
    if (customTokenColors.semanticHighlighting !== void 0) {
      this.customSemanticHighlightingDeprecated = customTokenColors.semanticHighlighting;
    }
  }
  ensureLoaded(extensionResourceLoaderService) {
    return !this.isLoaded ? this.load(extensionResourceLoaderService) : Promise.resolve(void 0);
  }
  reload(extensionResourceLoaderService) {
    return this.load(extensionResourceLoaderService);
  }
  load(extensionResourceLoaderService) {
    if (!this.location) {
      return Promise.resolve(void 0);
    }
    this.themeTokenColors = [];
    this.clearCaches();
    const result = {
      colors: {},
      textMateRules: [],
      semanticTokenRules: [],
      semanticHighlighting: false
    };
    return _loadColorTheme(extensionResourceLoaderService, this.location, result).then((_) => {
      this.isLoaded = true;
      this.semanticTokenRules = result.semanticTokenRules;
      this.colorMap = result.colors;
      this.themeTokenColors = result.textMateRules;
      this.themeSemanticHighlighting = result.semanticHighlighting;
    });
  }
  clearCaches() {
    this.tokenColorIndex = void 0;
    this.tokenFontIndex = void 0;
    this.textMateThemingRules = void 0;
    this.themeTokenScopeMatchers = void 0;
    this.customTokenScopeMatchers = void 0;
  }
  toStorage(storageService) {
    const colorMapData = {};
    for (const key in this.colorMap) {
      colorMapData[key] = Color.Format.CSS.formatHexA(this.colorMap[key], true);
    }
    const value = JSON.stringify({
      id: this.id,
      label: this.label,
      settingsId: this.settingsId,
      themeTokenColors: this.themeTokenColors.map((tc) => ({ settings: tc.settings, scope: tc.scope })),
      // don't persist names
      semanticTokenRules: this.semanticTokenRules.map(SemanticTokenRule.toJSONObject),
      extensionData: ExtensionData.toJSONObject(this.extensionData),
      themeSemanticHighlighting: this.themeSemanticHighlighting,
      colorMap: colorMapData,
      watch: this.watch
    });
    storageService.store(_ColorThemeData.STORAGE_KEY, value, StorageScope.PROFILE, StorageTarget.USER);
  }
  get themeTypeSelector() {
    return this.classNames[0];
  }
  get classNames() {
    return this.id.split(" ");
  }
  get type() {
    switch (this.themeTypeSelector) {
      case ThemeTypeSelector.VS:
        return ColorScheme.LIGHT;
      case ThemeTypeSelector.HC_BLACK:
        return ColorScheme.HIGH_CONTRAST_DARK;
      case ThemeTypeSelector.HC_LIGHT:
        return ColorScheme.HIGH_CONTRAST_LIGHT;
      default:
        return ColorScheme.DARK;
    }
  }
  // constructors
  static createUnloadedThemeForThemeType(themeType, colorMap) {
    return _ColorThemeData.createUnloadedTheme(getThemeTypeSelector(themeType), colorMap);
  }
  static createUnloadedTheme(id, colorMap) {
    const themeData = new _ColorThemeData(id, "", "__" + id);
    themeData.isLoaded = false;
    themeData.themeTokenColors = [];
    themeData.watch = false;
    if (colorMap) {
      for (const id2 in colorMap) {
        themeData.colorMap[id2] = Color.fromHex(colorMap[id2]);
      }
    }
    return themeData;
  }
  static createLoadedEmptyTheme(id, settingsId) {
    const themeData = new _ColorThemeData(id, "", settingsId);
    themeData.isLoaded = true;
    themeData.themeTokenColors = [];
    themeData.watch = false;
    return themeData;
  }
  static fromStorageData(storageService) {
    const input = storageService.get(_ColorThemeData.STORAGE_KEY, StorageScope.PROFILE);
    if (!input) {
      return void 0;
    }
    try {
      const data = JSON.parse(input);
      const theme = new _ColorThemeData("", "", "");
      for (const key in data) {
        switch (key) {
          case "colorMap": {
            const colorMapData = data[key];
            for (const id in colorMapData) {
              theme.colorMap[id] = Color.fromHex(colorMapData[id]);
            }
            break;
          }
          case "themeTokenColors":
          case "id":
          case "label":
          case "settingsId":
          case "watch":
          case "themeSemanticHighlighting":
            theme[key] = data[key];
            break;
          case "semanticTokenRules": {
            const rulesData = data[key];
            if (Array.isArray(rulesData)) {
              for (const d of rulesData) {
                const rule = SemanticTokenRule.fromJSONObject(tokenClassificationRegistry, d);
                if (rule) {
                  theme.semanticTokenRules.push(rule);
                }
              }
            }
            break;
          }
          case "location":
            break;
          case "extensionData":
            theme.extensionData = ExtensionData.fromJSONObject(data.extensionData);
            break;
        }
      }
      if (!theme.id || !theme.settingsId) {
        return void 0;
      }
      return theme;
    } catch (e) {
      return void 0;
    }
  }
  static fromExtensionTheme(theme, colorThemeLocation, extensionData) {
    const baseTheme = theme["uiTheme"] || "vs-dark";
    const themeSelector = toCSSSelector(extensionData.extensionId, theme.path);
    const id = `${baseTheme} ${themeSelector}`;
    const label = theme.label || basename(theme.path);
    const settingsId = theme.id || label;
    const themeData = new _ColorThemeData(id, label, settingsId);
    themeData.description = theme.description;
    themeData.watch = theme._watch === true;
    themeData.location = colorThemeLocation;
    themeData.extensionData = extensionData;
    themeData.isLoaded = false;
    return themeData;
  }
};
_ColorThemeData.STORAGE_KEY = "colorThemeData";
let ColorThemeData = _ColorThemeData;
function toCSSSelector(extensionId, path) {
  if (path.startsWith("./")) {
    path = path.substr(2);
  }
  let str = `${extensionId}-${path}`;
  str = str.replace(/[^_a-zA-Z0-9-]/g, "-");
  if (str.charAt(0).match(/[0-9-]/)) {
    str = "_" + str;
  }
  return str;
}
async function _loadColorTheme(extensionResourceLoaderService, themeLocation, result) {
  if (resources.extname(themeLocation) === ".json") {
    const content = await extensionResourceLoaderService.readExtensionResource(themeLocation);
    const errors = [];
    const contentValue = Json.parse(content, errors);
    if (errors.length > 0) {
      return Promise.reject(new Error(nls.localize("error.cannotparsejson", "Problems parsing JSON theme file: {0}", errors.map((e) => getParseErrorMessage(e.error)).join(", "))));
    } else if (Json.getNodeType(contentValue) !== "object") {
      return Promise.reject(new Error(nls.localize("error.invalidformat", "Invalid format for JSON theme file: Object expected.")));
    }
    if (contentValue.include) {
      await _loadColorTheme(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), contentValue.include), result);
    }
    if (Array.isArray(contentValue.settings)) {
      convertSettings(contentValue.settings, result);
      return null;
    }
    result.semanticHighlighting = result.semanticHighlighting || contentValue.semanticHighlighting;
    const colors = contentValue.colors;
    if (colors) {
      if (typeof colors !== "object") {
        return Promise.reject(new Error(nls.localize({ key: "error.invalidformat.colors", comment: ["{0} will be replaced by a path. Values in quotes should not be translated."] }, "Problem parsing color theme file: {0}. Property 'colors' is not of type 'object'.", themeLocation.toString())));
      }
      for (const colorId in colors) {
        const colorVal = colors[colorId];
        if (colorVal === DEFAULT_COLOR_CONFIG_VALUE) {
          delete result.colors[colorId];
        } else if (typeof colorVal === "string") {
          result.colors[colorId] = Color.fromHex(colors[colorId]);
        }
      }
    }
    const tokenColors = contentValue.tokenColors;
    if (tokenColors) {
      if (Array.isArray(tokenColors)) {
        result.textMateRules.push(...tokenColors);
      } else if (typeof tokenColors === "string") {
        await _loadSyntaxTokens(extensionResourceLoaderService, resources.joinPath(resources.dirname(themeLocation), tokenColors), result);
      } else {
        return Promise.reject(new Error(nls.localize({ key: "error.invalidformat.tokenColors", comment: ["{0} will be replaced by a path. Values in quotes should not be translated."] }, "Problem parsing color theme file: {0}. Property 'tokenColors' should be either an array specifying colors or a path to a TextMate theme file", themeLocation.toString())));
      }
    }
    const semanticTokenColors = contentValue.semanticTokenColors;
    if (semanticTokenColors && typeof semanticTokenColors === "object") {
      for (const key in semanticTokenColors) {
        try {
          const rule = readSemanticTokenRule(key, semanticTokenColors[key]);
          if (rule) {
            result.semanticTokenRules.push(rule);
          }
        } catch (e) {
          return Promise.reject(new Error(nls.localize({ key: "error.invalidformat.semanticTokenColors", comment: ["{0} will be replaced by a path. Values in quotes should not be translated."] }, "Problem parsing color theme file: {0}. Property 'semanticTokenColors' contains a invalid selector", themeLocation.toString())));
        }
      }
    }
  } else {
    return _loadSyntaxTokens(extensionResourceLoaderService, themeLocation, result);
  }
}
function _loadSyntaxTokens(extensionResourceLoaderService, themeLocation, result) {
  return extensionResourceLoaderService.readExtensionResource(themeLocation).then((content) => {
    try {
      const contentValue = parsePList(content);
      const settings = contentValue.settings;
      if (!Array.isArray(settings)) {
        return Promise.reject(new Error(nls.localize("error.plist.invalidformat", "Problem parsing tmTheme file: {0}. 'settings' is not array.")));
      }
      convertSettings(settings, result);
      return Promise.resolve(null);
    } catch (e) {
      return Promise.reject(new Error(nls.localize("error.cannotparse", "Problems parsing tmTheme file: {0}", e.message)));
    }
  }, (error) => {
    return Promise.reject(new Error(nls.localize("error.cannotload", "Problems loading tmTheme file {0}: {1}", themeLocation.toString(), error.message)));
  });
}
const defaultThemeColors = {
  "light": [
    { scope: "token.info-token", settings: { foreground: "#316bcd" } },
    { scope: "token.warn-token", settings: { foreground: "#cd9731" } },
    { scope: "token.error-token", settings: { foreground: "#cd3131" } },
    { scope: "token.debug-token", settings: { foreground: "#800080" } }
  ],
  "dark": [
    { scope: "token.info-token", settings: { foreground: "#6796e6" } },
    { scope: "token.warn-token", settings: { foreground: "#cd9731" } },
    { scope: "token.error-token", settings: { foreground: "#f44747" } },
    { scope: "token.debug-token", settings: { foreground: "#b267e6" } }
  ],
  "hcLight": [
    { scope: "token.info-token", settings: { foreground: "#316bcd" } },
    { scope: "token.warn-token", settings: { foreground: "#cd9731" } },
    { scope: "token.error-token", settings: { foreground: "#cd3131" } },
    { scope: "token.debug-token", settings: { foreground: "#800080" } }
  ],
  "hcDark": [
    { scope: "token.info-token", settings: { foreground: "#6796e6" } },
    { scope: "token.warn-token", settings: { foreground: "#008000" } },
    { scope: "token.error-token", settings: { foreground: "#FF0000" } },
    { scope: "token.debug-token", settings: { foreground: "#b267e6" } }
  ]
};
const noMatch = (_scope) => -1;
function nameMatcher(identifiers, scopes) {
  if (scopes.length < identifiers.length) {
    return -1;
  }
  let score = void 0;
  const every = identifiers.every((identifier) => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopesAreMatching(scopes[i], identifier)) {
        score = (i + 1) * 65536 + identifier.length;
        return true;
      }
    }
    return false;
  });
  return every && score !== void 0 ? score : -1;
}
function scopesAreMatching(thisScopeName, scopeName) {
  if (!thisScopeName) {
    return false;
  }
  if (thisScopeName === scopeName) {
    return true;
  }
  const len = scopeName.length;
  return thisScopeName.length > len && thisScopeName.substr(0, len) === scopeName && thisScopeName[len] === ".";
}
function getScopeMatcher(rule) {
  const ruleScope = rule.scope;
  if (!ruleScope || !rule.settings) {
    return noMatch;
  }
  const matchers = [];
  if (Array.isArray(ruleScope)) {
    for (const rs of ruleScope) {
      createMatchers(rs, nameMatcher, matchers);
    }
  } else {
    createMatchers(ruleScope, nameMatcher, matchers);
  }
  if (matchers.length === 0) {
    return noMatch;
  }
  return (scope) => {
    let max = matchers[0].matcher(scope);
    for (let i = 1; i < matchers.length; i++) {
      max = Math.max(max, matchers[i].matcher(scope));
    }
    return max;
  };
}
function readSemanticTokenRule(selectorString, settings) {
  const selector = tokenClassificationRegistry.parseTokenSelector(selectorString);
  let style;
  if (typeof settings === "string") {
    style = TokenStyle.fromSettings(settings, void 0);
  } else if (isSemanticTokenColorizationSetting(settings)) {
    style = TokenStyle.fromSettings(settings.foreground, settings.fontStyle, settings.bold, settings.underline, settings.strikethrough, settings.italic);
  }
  if (style) {
    return { selector, style };
  }
  return void 0;
}
function isSemanticTokenColorizationSetting(style) {
  return style && (types.isString(style.foreground) || types.isString(style.fontStyle) || types.isBoolean(style.italic) || types.isBoolean(style.underline) || types.isBoolean(style.strikethrough) || types.isBoolean(style.bold));
}
function findMetadata(colorThemeData, captureNames, languageId, bracket) {
  let metadata = 0;
  metadata |= languageId << MetadataConsts.LANGUAGEID_OFFSET;
  const definitions = {};
  const tokenStyle = colorThemeData.resolveScopes([captureNames], definitions);
  if (captureNames.length > 0) {
    const standardToken = toStandardTokenType(captureNames[captureNames.length - 1]);
    metadata |= standardToken << MetadataConsts.TOKEN_TYPE_OFFSET;
  }
  const fontStyle = definitions.foreground?.settings.fontStyle || definitions.bold?.settings.fontStyle;
  if (fontStyle?.includes("italic")) {
    metadata |= FontStyle.Italic | MetadataConsts.ITALIC_MASK;
  }
  if (fontStyle?.includes("bold")) {
    metadata |= FontStyle.Bold | MetadataConsts.BOLD_MASK;
  }
  if (fontStyle?.includes("underline")) {
    metadata |= FontStyle.Underline | MetadataConsts.UNDERLINE_MASK;
  }
  if (fontStyle?.includes("strikethrough")) {
    metadata |= FontStyle.Strikethrough | MetadataConsts.STRIKETHROUGH_MASK;
  }
  const foreground = tokenStyle?.foreground;
  const tokenStyleForeground = foreground !== void 0 ? colorThemeData.getTokenColorIndex().get(foreground) : ColorId.DefaultForeground;
  metadata |= tokenStyleForeground << MetadataConsts.FOREGROUND_OFFSET;
  if (bracket) {
    metadata |= MetadataConsts.BALANCED_BRACKETS_MASK;
  }
  return metadata;
}
class TokenColorIndex {
  constructor() {
    this._lastColorId = 0;
    this._id2color = [];
    this._color2id = /* @__PURE__ */ Object.create(null);
  }
  add(color) {
    color = normalizeColor(color);
    if (color === void 0) {
      return 0;
    }
    let value = this._color2id[color];
    if (value) {
      return value;
    }
    value = ++this._lastColorId;
    this._color2id[color] = value;
    this._id2color[value] = color;
    return value;
  }
  get(color) {
    color = normalizeColor(color);
    if (color === void 0) {
      return 0;
    }
    const value = this._color2id[color];
    if (value) {
      return value;
    }
    console.log(`Color ${color} not in index.`);
    return 0;
  }
  asArray() {
    return this._id2color.slice(0);
  }
}
class TokenFontIndex {
  constructor() {
    this._lastFontId = 0;
    this._id2font = [];
    this._font2id = /* @__PURE__ */ new Map();
  }
  add(fontFamily, fontSizeMultiplier, lineHeightMultiplier) {
    const font = { fontFamily, fontSizeMultiplier, lineHeightMultiplier };
    let value = this._font2id.get(font);
    if (value) {
      return value;
    }
    value = ++this._lastFontId;
    this._font2id.set(font, value);
    this._id2font[value] = font;
    return value;
  }
  get(font) {
    const value = this._font2id.get(font);
    if (value) {
      return value;
    }
    return 0;
  }
  asArray() {
    return this._id2font.slice(0);
  }
}
function normalizeColor(color) {
  if (!color) {
    return void 0;
  }
  if (typeof color !== "string") {
    color = Color.Format.CSS.formatHexA(color, true);
  }
  const len = color.length;
  if (color.charCodeAt(0) !== CharCode.Hash || len !== 4 && len !== 5 && len !== 7 && len !== 9) {
    return void 0;
  }
  const result = [CharCode.Hash];
  for (let i = 1; i < len; i++) {
    const upper = hexUpper(color.charCodeAt(i));
    if (!upper) {
      return void 0;
    }
    result.push(upper);
    if (len === 4 || len === 5) {
      result.push(upper);
    }
  }
  if (result.length === 9 && result[7] === CharCode.F && result[8] === CharCode.F) {
    result.length = 7;
  }
  return String.fromCharCode(...result);
}
function hexUpper(charCode) {
  if (charCode >= CharCode.Digit0 && charCode <= CharCode.Digit9 || charCode >= CharCode.A && charCode <= CharCode.F) {
    return charCode;
  } else if (charCode >= CharCode.a && charCode <= CharCode.f) {
    return charCode - CharCode.a + CharCode.A;
  }
  return 0;
}
export {
  ColorThemeData,
  findMetadata
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yVGhlbWVEYXRhLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIEpzb24gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkRhdGEsIElUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMsIElUZXh0TWF0ZVRoZW1pbmdSdWxlLCBJV29ya2JlbmNoQ29sb3JUaGVtZSwgSUNvbG9yTWFwLCBJVGhlbWVFeHRlbnNpb25Qb2ludCwgSUNvbG9yQ3VzdG9taXphdGlvbnMsIElTZW1hbnRpY1Rva2VuUnVsZXMsIElTZW1hbnRpY1Rva2VuQ29sb3JpemF0aW9uU2V0dGluZywgSVNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zLCBJVGhlbWVTY29wYWJsZUN1c3RvbWl6YXRpb25zLCBJVGhlbWVTY29wZWRDdXN0b21pemF0aW9ucywgVEhFTUVfU0NPUEVfQ0xPU0VfUEFSRU4sIFRIRU1FX1NDT1BFX09QRU5fUEFSRU4sIHRoZW1lU2NvcGVSZWdleCwgVEhFTUVfU0NPUEVfV0lMRENBUkQgfSBmcm9tICcuL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb252ZXJ0U2V0dGluZ3MgfSBmcm9tICcuL3RoZW1lQ29tcGF0aWJpbGl0eS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb2xvclJlZ2lzdHJ5RXh0ZW5zaW9ucywgSUNvbG9yUmVnaXN0cnksIENvbG9ySWRlbnRpZmllciwgZWRpdG9yQmFja2dyb3VuZCwgZWRpdG9yRm9yZWdyb3VuZCwgREVGQVVMVF9DT0xPUl9DT05GSUdfVkFMVUUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRm9udFRva2VuT3B0aW9ucywgSVRva2VuU3R5bGUsIGdldFRoZW1lVHlwZVNlbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBnZXRQYXJzZUVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBwYXJzZSBhcyBwYXJzZVBMaXN0IH0gZnJvbSAnLi9wbGlzdFBhcnNlci5qcyc7XG5pbXBvcnQgeyBUb2tlblN0eWxlLCBTZW1hbnRpY1Rva2VuUnVsZSwgUHJvYmVTY29wZSwgZ2V0VG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LCBUb2tlblN0eWxlVmFsdWUsIFRva2VuU3R5bGVEYXRhLCBwYXJzZUNsYXNzaWZpZXJTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE1hdGNoZXJXaXRoUHJpb3JpdHksIE1hdGNoZXIsIGNyZWF0ZU1hdGNoZXJzIH0gZnJvbSAnLi90ZXh0TWF0ZVNjb3BlTWF0Y2hlci5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXIvY29tbW9uL2V4dGVuc2lvblJlc291cmNlTG9hZGVyLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgU3RvcmFnZVNjb3BlLCBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRoZW1lQ29uZmlndXJhdGlvbiB9IGZyb20gJy4vdGhlbWVDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lLCBUaGVtZVR5cGVTZWxlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBDb2xvcklkLCBGb250U3R5bGUsIE1ldGFkYXRhQ29uc3RzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IHRvU3RhbmRhcmRUb2tlblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9zdXBwb3J0cy90b2tlbml6YXRpb24uanMnO1xuXG5jb25zdCBjb2xvclJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbG9yUmVnaXN0cnk+KENvbG9yUmVnaXN0cnlFeHRlbnNpb25zLkNvbG9yQ29udHJpYnV0aW9uKTtcblxuY29uc3QgdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5ID0gZ2V0VG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5KCk7XG5cbmNvbnN0IHRva2VuR3JvdXBUb1Njb3Blc01hcCA9IHtcblx0Y29tbWVudHM6IFsnY29tbWVudCcsICdwdW5jdHVhdGlvbi5kZWZpbml0aW9uLmNvbW1lbnQnXSxcblx0c3RyaW5nczogWydzdHJpbmcnLCAnbWV0YS5lbWJlZGRlZC5hc3NlbWJseSddLFxuXHRrZXl3b3JkczogWydrZXl3b3JkIC0ga2V5d29yZC5vcGVyYXRvcicsICdrZXl3b3JkLmNvbnRyb2wnLCAnc3RvcmFnZScsICdzdG9yYWdlLnR5cGUnXSxcblx0bnVtYmVyczogWydjb25zdGFudC5udW1lcmljJ10sXG5cdHR5cGVzOiBbJ2VudGl0eS5uYW1lLnR5cGUnLCAnZW50aXR5Lm5hbWUuY2xhc3MnLCAnc3VwcG9ydC50eXBlJywgJ3N1cHBvcnQuY2xhc3MnXSxcblx0ZnVuY3Rpb25zOiBbJ2VudGl0eS5uYW1lLmZ1bmN0aW9uJywgJ3N1cHBvcnQuZnVuY3Rpb24nXSxcblx0dmFyaWFibGVzOiBbJ3ZhcmlhYmxlJywgJ2VudGl0eS5uYW1lLnZhcmlhYmxlJ11cbn07XG5cblxuZXhwb3J0IHR5cGUgVG9rZW5TdHlsZURlZmluaXRpb24gPSBTZW1hbnRpY1Rva2VuUnVsZSB8IFByb2JlU2NvcGVbXSB8IFRva2VuU3R5bGVWYWx1ZTtcbmV4cG9ydCB0eXBlIFRva2VuU3R5bGVEZWZpbml0aW9ucyA9IHsgW1AgaW4ga2V5b2YgVG9rZW5TdHlsZURhdGFdPzogVG9rZW5TdHlsZURlZmluaXRpb24gfCB1bmRlZmluZWQgfTtcblxuZXhwb3J0IHR5cGUgVGV4dE1hdGVUaGVtaW5nUnVsZURlZmluaXRpb25zID0geyBbUCBpbiBrZXlvZiBUb2tlblN0eWxlRGF0YV0/OiBJVGV4dE1hdGVUaGVtaW5nUnVsZSB8IHVuZGVmaW5lZDsgfSAmIHsgc2NvcGU/OiBQcm9iZVNjb3BlIH07XG5cbmludGVyZmFjZSBJQ29sb3JPckRlZmF1bHRNYXAge1xuXHRbaWQ6IHN0cmluZ106IENvbG9yIHwgdHlwZW9mIERFRkFVTFRfQ09MT1JfQ09ORklHX1ZBTFVFO1xufVxuXG5leHBvcnQgY2xhc3MgQ29sb3JUaGVtZURhdGEgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29sb3JUaGVtZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFNUT1JBR0VfS0VZID0gJ2NvbG9yVGhlbWVEYXRhJztcblxuXHRpZDogc3RyaW5nO1xuXHRsYWJlbDogc3RyaW5nO1xuXHRzZXR0aW5nc0lkOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRpc0xvYWRlZDogYm9vbGVhbjtcblx0bG9jYXRpb24/OiBVUkk7IC8vIG9ubHkgc2V0IGZvciBleHRlbnNpb24gZnJvbSB0aGUgcmVnaXN0cnksIG5vdCBmb3IgdGhlbWVzIHJlc3RvcmVkIGZyb20gdGhlIHN0b3JhZ2Vcblx0d2F0Y2g/OiBib29sZWFuO1xuXHRleHRlbnNpb25EYXRhPzogRXh0ZW5zaW9uRGF0YTtcblxuXHRwcml2YXRlIHRoZW1lU2VtYW50aWNIaWdobGlnaHRpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VzdG9tU2VtYW50aWNIaWdobGlnaHRpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY3VzdG9tU2VtYW50aWNIaWdobGlnaHRpbmdEZXByZWNhdGVkOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgdGhlbWVUb2tlbkNvbG9yczogSVRleHRNYXRlVGhlbWluZ1J1bGVbXSA9IFtdO1xuXHRwcml2YXRlIGN1c3RvbVRva2VuQ29sb3JzOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdID0gW107XG5cdHByaXZhdGUgY29sb3JNYXA6IElDb2xvck1hcCA9IHt9O1xuXHRwcml2YXRlIGN1c3RvbUNvbG9yTWFwOiBJQ29sb3JPckRlZmF1bHRNYXAgPSB7fTtcblxuXHRwcml2YXRlIHNlbWFudGljVG9rZW5SdWxlczogU2VtYW50aWNUb2tlblJ1bGVbXSA9IFtdO1xuXHRwcml2YXRlIGN1c3RvbVNlbWFudGljVG9rZW5SdWxlczogU2VtYW50aWNUb2tlblJ1bGVbXSA9IFtdO1xuXG5cdHByaXZhdGUgdGhlbWVUb2tlblNjb3BlTWF0Y2hlcnM6IE1hdGNoZXI8UHJvYmVTY29wZT5bXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXN0b21Ub2tlblNjb3BlTWF0Y2hlcnM6IE1hdGNoZXI8UHJvYmVTY29wZT5bXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHRleHRNYXRlVGhlbWluZ1J1bGVzOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkOyAvLyBjcmVhdGVkIG9uIGRlbWFuZFxuXHRwcml2YXRlIHRva2VuQ29sb3JJbmRleDogVG9rZW5Db2xvckluZGV4IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkOyAvLyBjcmVhdGVkIG9uIGRlbWFuZFxuXHRwcml2YXRlIHRva2VuRm9udEluZGV4OiBUb2tlbkZvbnRJbmRleCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDsgLy8gY3JlYXRlZCBvbiBkZW1hbmRcblxuXHRwcml2YXRlIGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcsIHNldHRpbmdzSWQ6IHN0cmluZykge1xuXHRcdHRoaXMuaWQgPSBpZDtcblx0XHR0aGlzLmxhYmVsID0gbGFiZWw7XG5cdFx0dGhpcy5zZXR0aW5nc0lkID0gc2V0dGluZ3NJZDtcblx0XHR0aGlzLmlzTG9hZGVkID0gZmFsc2U7XG5cdH1cblxuXHRnZXQgc2VtYW50aWNIaWdobGlnaHRpbmcoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY3VzdG9tU2VtYW50aWNIaWdobGlnaHRpbmcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3VzdG9tU2VtYW50aWNIaWdobGlnaHRpbmc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmN1c3RvbVNlbWFudGljSGlnaGxpZ2h0aW5nRGVwcmVjYXRlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jdXN0b21TZW1hbnRpY0hpZ2hsaWdodGluZ0RlcHJlY2F0ZWQ7XG5cdFx0fVxuXHRcdHJldHVybiAhIXRoaXMudGhlbWVTZW1hbnRpY0hpZ2hsaWdodGluZztcblx0fVxuXG5cdGdldCB0b2tlbkNvbG9ycygpOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdIHtcblx0XHRpZiAoIXRoaXMudGV4dE1hdGVUaGVtaW5nUnVsZXMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRleHRNYXRlVGhlbWluZ1J1bGVbXSA9IFtdO1xuXG5cdFx0XHQvLyB0aGUgZGVmYXVsdCBydWxlIChzY29wZSBlbXB0eSkgaXMgYWx3YXlzIHRoZSBmaXJzdCBydWxlLiBJZ25vcmUgYWxsIG90aGVyIGRlZmF1bHQgcnVsZXMuXG5cdFx0XHRjb25zdCBmb3JlZ3JvdW5kID0gdGhpcy5nZXRDb2xvcihlZGl0b3JGb3JlZ3JvdW5kKSB8fCB0aGlzLmdldERlZmF1bHQoZWRpdG9yRm9yZWdyb3VuZCkhO1xuXHRcdFx0Y29uc3QgYmFja2dyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoZWRpdG9yQmFja2dyb3VuZCkgfHwgdGhpcy5nZXREZWZhdWx0KGVkaXRvckJhY2tncm91bmQpITtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0XHRmb3JlZ3JvdW5kOiBub3JtYWxpemVDb2xvcihmb3JlZ3JvdW5kKSxcblx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBub3JtYWxpemVDb2xvcihiYWNrZ3JvdW5kKVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0bGV0IGhhc0RlZmF1bHRUb2tlbnMgPSBmYWxzZTtcblxuXHRcdFx0ZnVuY3Rpb24gYWRkUnVsZShydWxlOiBJVGV4dE1hdGVUaGVtaW5nUnVsZSkge1xuXHRcdFx0XHRpZiAocnVsZS5zY29wZSAmJiBydWxlLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0aWYgKHJ1bGUuc2NvcGUgPT09ICd0b2tlbi5pbmZvLXRva2VuJykge1xuXHRcdFx0XHRcdFx0aGFzRGVmYXVsdFRva2VucyA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJ1bGVTZXR0aW5ncyA9IHJ1bGUuc2V0dGluZ3M7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0c2NvcGU6IHJ1bGUuc2NvcGUsIHNldHRpbmdzOiB7XG5cdFx0XHRcdFx0XHRcdGZvcmVncm91bmQ6IG5vcm1hbGl6ZUNvbG9yKHJ1bGVTZXR0aW5ncy5mb3JlZ3JvdW5kKSxcblx0XHRcdFx0XHRcdFx0YmFja2dyb3VuZDogbm9ybWFsaXplQ29sb3IocnVsZVNldHRpbmdzLmJhY2tncm91bmQpLFxuXHRcdFx0XHRcdFx0XHRmb250U3R5bGU6IHJ1bGVTZXR0aW5ncy5mb250U3R5bGUsXG5cdFx0XHRcdFx0XHRcdGZvbnRTaXplOiBydWxlU2V0dGluZ3MuZm9udFNpemUsXG5cdFx0XHRcdFx0XHRcdGZvbnRGYW1pbHk6IHJ1bGVTZXR0aW5ncy5mb250RmFtaWx5LFxuXHRcdFx0XHRcdFx0XHRsaW5lSGVpZ2h0OiBydWxlU2V0dGluZ3MubGluZUhlaWdodFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudGhlbWVUb2tlbkNvbG9ycy5mb3JFYWNoKGFkZFJ1bGUpO1xuXHRcdFx0Ly8gQWRkIHRoZSBjdXN0b20gY29sb3JzIGFmdGVyIHRoZSB0aGVtZSBjb2xvcnNcblx0XHRcdC8vIHNvIHRoYXQgdGhleSB3aWxsIG92ZXJyaWRlIHRoZW1cblx0XHRcdHRoaXMuY3VzdG9tVG9rZW5Db2xvcnMuZm9yRWFjaChhZGRSdWxlKTtcblxuXHRcdFx0aWYgKCFoYXNEZWZhdWx0VG9rZW5zKSB7XG5cdFx0XHRcdGRlZmF1bHRUaGVtZUNvbG9yc1t0aGlzLnR5cGVdLmZvckVhY2goYWRkUnVsZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRleHRNYXRlVGhlbWluZ1J1bGVzID0gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50ZXh0TWF0ZVRoZW1pbmdSdWxlcztcblx0fVxuXG5cdHB1YmxpYyBnZXRDb2xvcihjb2xvcklkOiBDb2xvcklkZW50aWZpZXIsIHVzZURlZmF1bHQ/OiBib29sZWFuKTogQ29sb3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGN1c3RvbUNvbG9yID0gdGhpcy5jdXN0b21Db2xvck1hcFtjb2xvcklkXTtcblx0XHRpZiAoY3VzdG9tQ29sb3IgaW5zdGFuY2VvZiBDb2xvcikge1xuXHRcdFx0cmV0dXJuIGN1c3RvbUNvbG9yO1xuXHRcdH1cblx0XHRpZiAoY3VzdG9tQ29sb3IgPT09IHVuZGVmaW5lZCkgeyAvKiAhPT0gREVGQVVMVF9DT0xPUl9DT05GSUdfVkFMVUUgKi9cblx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy5jb2xvck1hcFtjb2xvcklkXTtcblx0XHRcdGlmIChjb2xvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBjb2xvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHVzZURlZmF1bHQgIT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5nZXREZWZhdWx0KGNvbG9ySWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb2tlblN0eWxlKHR5cGU6IHN0cmluZywgbW9kaWZpZXJzOiBzdHJpbmdbXSwgbGFuZ3VhZ2U6IHN0cmluZywgdXNlRGVmYXVsdCA9IHRydWUsIGRlZmluaXRpb25zOiBUb2tlblN0eWxlRGVmaW5pdGlvbnMgPSB7fSk6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlc3VsdDogYW55ID0ge1xuXHRcdFx0Zm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0Ym9sZDogdW5kZWZpbmVkLFxuXHRcdFx0dW5kZXJsaW5lOiB1bmRlZmluZWQsXG5cdFx0XHRzdHJpa2V0aHJvdWdoOiB1bmRlZmluZWQsXG5cdFx0XHRpdGFsaWM6IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0Y29uc3Qgc2NvcmUgPSB7XG5cdFx0XHRmb3JlZ3JvdW5kOiAtMSxcblx0XHRcdGJvbGQ6IC0xLFxuXHRcdFx0dW5kZXJsaW5lOiAtMSxcblx0XHRcdHN0cmlrZXRocm91Z2g6IC0xLFxuXHRcdFx0aXRhbGljOiAtMSxcblx0XHRcdGZvbnRGYW1pbHk6IC0xLFxuXHRcdFx0Zm9udFNpemU6IC0xLFxuXHRcdFx0bGluZUhlaWdodDogLTFcblx0XHR9O1xuXG5cdFx0ZnVuY3Rpb24gX3Byb2Nlc3NTdHlsZShtYXRjaFNjb3JlOiBudW1iZXIsIHN0eWxlOiBUb2tlblN0eWxlLCBkZWZpbml0aW9uOiBUb2tlblN0eWxlRGVmaW5pdGlvbikge1xuXHRcdFx0aWYgKHN0eWxlLmZvcmVncm91bmQgJiYgc2NvcmUuZm9yZWdyb3VuZCA8PSBtYXRjaFNjb3JlKSB7XG5cdFx0XHRcdHNjb3JlLmZvcmVncm91bmQgPSBtYXRjaFNjb3JlO1xuXHRcdFx0XHRyZXN1bHQuZm9yZWdyb3VuZCA9IHN0eWxlLmZvcmVncm91bmQ7XG5cdFx0XHRcdGRlZmluaXRpb25zLmZvcmVncm91bmQgPSBkZWZpbml0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwIG9mIFsnYm9sZCcsICd1bmRlcmxpbmUnLCAnc3RyaWtldGhyb3VnaCcsICdpdGFsaWMnXSkge1xuXHRcdFx0XHRjb25zdCBwcm9wZXJ0eSA9IHAgYXMga2V5b2YgVG9rZW5TdHlsZTtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IHN0eWxlW3Byb3BlcnR5XTtcblx0XHRcdFx0aWYgKGluZm8gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGlmIChzY29yZVtwcm9wZXJ0eV0gPD0gbWF0Y2hTY29yZSkge1xuXHRcdFx0XHRcdFx0c2NvcmVbcHJvcGVydHldID0gbWF0Y2hTY29yZTtcblx0XHRcdFx0XHRcdHJlc3VsdFtwcm9wZXJ0eV0gPSBpbmZvO1xuXHRcdFx0XHRcdFx0ZGVmaW5pdGlvbnNbcHJvcGVydHldID0gZGVmaW5pdGlvbjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZnVuY3Rpb24gX3Byb2Nlc3NTZW1hbnRpY1Rva2VuUnVsZShydWxlOiBTZW1hbnRpY1Rva2VuUnVsZSkge1xuXHRcdFx0Y29uc3QgbWF0Y2hTY29yZSA9IHJ1bGUuc2VsZWN0b3IubWF0Y2godHlwZSwgbW9kaWZpZXJzLCBsYW5ndWFnZSk7XG5cdFx0XHRpZiAobWF0Y2hTY29yZSA+PSAwKSB7XG5cdFx0XHRcdF9wcm9jZXNzU3R5bGUobWF0Y2hTY29yZSwgcnVsZS5zdHlsZSwgcnVsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zZW1hbnRpY1Rva2VuUnVsZXMuZm9yRWFjaChfcHJvY2Vzc1NlbWFudGljVG9rZW5SdWxlKTtcblx0XHR0aGlzLmN1c3RvbVNlbWFudGljVG9rZW5SdWxlcy5mb3JFYWNoKF9wcm9jZXNzU2VtYW50aWNUb2tlblJ1bGUpO1xuXG5cdFx0bGV0IGhhc1VuZGVmaW5lZFN0eWxlUHJvcGVydHkgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IGsgaW4gc2NvcmUpIHtcblx0XHRcdGNvbnN0IGtleSA9IGsgYXMga2V5b2YgVG9rZW5TdHlsZTtcblx0XHRcdGlmIChzY29yZVtrZXldID09PSAtMSkge1xuXHRcdFx0XHRoYXNVbmRlZmluZWRTdHlsZVByb3BlcnR5ID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNjb3JlW2tleV0gPSBOdW1iZXIuTUFYX1ZBTFVFOyAvLyBzZXQgaXQgdG8gdGhlIG1heCwgc28gaXQgd29uJ3QgYmUgcmVwbGFjZWQgYnkgYSBkZWZhdWx0XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChoYXNVbmRlZmluZWRTdHlsZVByb3BlcnR5KSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmdldFRva2VuU3R5bGluZ0RlZmF1bHRSdWxlcygpKSB7XG5cdFx0XHRcdGNvbnN0IG1hdGNoU2NvcmUgPSBydWxlLnNlbGVjdG9yLm1hdGNoKHR5cGUsIG1vZGlmaWVycywgbGFuZ3VhZ2UpO1xuXHRcdFx0XHRpZiAobWF0Y2hTY29yZSA+PSAwKSB7XG5cdFx0XHRcdFx0bGV0IHN0eWxlOiBUb2tlblN0eWxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChydWxlLmRlZmF1bHRzLnNjb3Blc1RvUHJvYmUpIHtcblx0XHRcdFx0XHRcdHN0eWxlID0gdGhpcy5yZXNvbHZlU2NvcGVzKHJ1bGUuZGVmYXVsdHMuc2NvcGVzVG9Qcm9iZSk7XG5cdFx0XHRcdFx0XHRpZiAoc3R5bGUpIHtcblx0XHRcdFx0XHRcdFx0X3Byb2Nlc3NTdHlsZShtYXRjaFNjb3JlLCBzdHlsZSwgcnVsZS5kZWZhdWx0cy5zY29wZXNUb1Byb2JlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFzdHlsZSAmJiB1c2VEZWZhdWx0ICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW5TdHlsZVZhbHVlID0gcnVsZS5kZWZhdWx0c1t0aGlzLnR5cGVdO1xuXHRcdFx0XHRcdFx0c3R5bGUgPSB0aGlzLnJlc29sdmVUb2tlblN0eWxlVmFsdWUodG9rZW5TdHlsZVZhbHVlKTtcblx0XHRcdFx0XHRcdGlmIChzdHlsZSkge1xuXHRcdFx0XHRcdFx0XHRfcHJvY2Vzc1N0eWxlKG1hdGNoU2NvcmUsIHN0eWxlLCB0b2tlblN0eWxlVmFsdWUhKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFRva2VuU3R5bGUuZnJvbURhdGEocmVzdWx0KTtcblxuXHR9XG5cblx0LyoqXG5cdCAqIEBwYXJhbSB0b2tlblN0eWxlVmFsdWUgUmVzb2x2ZSBhIHRva2VuU3R5bGVWYWx1ZSBpbiB0aGUgY29udGV4dCBvZiBhIHRoZW1lXG5cdCAqL1xuXHRwdWJsaWMgcmVzb2x2ZVRva2VuU3R5bGVWYWx1ZSh0b2tlblN0eWxlVmFsdWU6IFRva2VuU3R5bGVWYWx1ZSB8IHVuZGVmaW5lZCk6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0b2tlblN0eWxlVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiB0b2tlblN0eWxlVmFsdWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb25zdCB7IHR5cGUsIG1vZGlmaWVycywgbGFuZ3VhZ2UgfSA9IHBhcnNlQ2xhc3NpZmllclN0cmluZyh0b2tlblN0eWxlVmFsdWUsICcnKTtcblx0XHRcdHJldHVybiB0aGlzLmdldFRva2VuU3R5bGUodHlwZSwgbW9kaWZpZXJzLCBsYW5ndWFnZSk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgdG9rZW5TdHlsZVZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0cmV0dXJuIHRva2VuU3R5bGVWYWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlbkNvbG9ySW5kZXgoKTogVG9rZW5Db2xvckluZGV4IHtcblx0XHQvLyBjb2xsZWN0IGFsbCBjb2xvcnMgdGhhdCB0b2tlbnMgY2FuIGhhdmVcblx0XHRpZiAoIXRoaXMudG9rZW5Db2xvckluZGV4KSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IG5ldyBUb2tlbkNvbG9ySW5kZXgoKTtcblx0XHRcdHRoaXMudG9rZW5Db2xvcnMuZm9yRWFjaChydWxlID0+IHtcblx0XHRcdFx0aW5kZXguYWRkKHJ1bGUuc2V0dGluZ3MuZm9yZWdyb3VuZCk7XG5cdFx0XHRcdGluZGV4LmFkZChydWxlLnNldHRpbmdzLmJhY2tncm91bmQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMuc2VtYW50aWNUb2tlblJ1bGVzLmZvckVhY2gociA9PiBpbmRleC5hZGQoci5zdHlsZS5mb3JlZ3JvdW5kKSk7XG5cdFx0XHR0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuZ2V0VG9rZW5TdHlsaW5nRGVmYXVsdFJ1bGVzKCkuZm9yRWFjaChyID0+IHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdENvbG9yID0gci5kZWZhdWx0c1t0aGlzLnR5cGVdO1xuXHRcdFx0XHRpZiAoZGVmYXVsdENvbG9yICYmIHR5cGVvZiBkZWZhdWx0Q29sb3IgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdFx0aW5kZXguYWRkKGRlZmF1bHRDb2xvci5mb3JlZ3JvdW5kKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmN1c3RvbVNlbWFudGljVG9rZW5SdWxlcy5mb3JFYWNoKHIgPT4gaW5kZXguYWRkKHIuc3R5bGUuZm9yZWdyb3VuZCkpO1xuXG5cdFx0XHR0aGlzLnRva2VuQ29sb3JJbmRleCA9IGluZGV4O1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy50b2tlbkNvbG9ySW5kZXg7XG5cdH1cblxuXG5cdHB1YmxpYyBnZXRUb2tlbkZvbnRJbmRleCgpOiBUb2tlbkZvbnRJbmRleCB7XG5cdFx0aWYgKCF0aGlzLnRva2VuRm9udEluZGV4KSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IG5ldyBUb2tlbkZvbnRJbmRleCgpO1xuXHRcdFx0dGhpcy50b2tlbkNvbG9ycy5mb3JFYWNoKHIgPT4gaW5kZXguYWRkKHIuc2V0dGluZ3MuZm9udEZhbWlseSwgci5zZXR0aW5ncy5mb250U2l6ZSwgci5zZXR0aW5ncy5saW5lSGVpZ2h0KSk7XG5cdFx0XHR0aGlzLnRva2VuRm9udEluZGV4ID0gaW5kZXg7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRva2VuRm9udEluZGV4O1xuXHR9XG5cblx0cHVibGljIGdldCB0b2tlbkNvbG9yTWFwKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUb2tlbkNvbG9ySW5kZXgoKS5hc0FycmF5KCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRva2VuRm9udE1hcCgpOiBJRm9udFRva2VuT3B0aW9uc1tdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRUb2tlbkZvbnRJbmRleCgpLmFzQXJyYXkoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlblN0eWxlTWV0YWRhdGEodHlwZVdpdGhMYW5ndWFnZTogc3RyaW5nLCBtb2RpZmllcnM6IHN0cmluZ1tdLCBkZWZhdWx0TGFuZ3VhZ2U6IHN0cmluZywgdXNlRGVmYXVsdCA9IHRydWUsIGRlZmluaXRpb25zOiBUb2tlblN0eWxlRGVmaW5pdGlvbnMgPSB7fSk6IElUb2tlblN0eWxlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB7IHR5cGUsIGxhbmd1YWdlIH0gPSBwYXJzZUNsYXNzaWZpZXJTdHJpbmcodHlwZVdpdGhMYW5ndWFnZSwgZGVmYXVsdExhbmd1YWdlKTtcblx0XHRjb25zdCBzdHlsZSA9IHRoaXMuZ2V0VG9rZW5TdHlsZSh0eXBlLCBtb2RpZmllcnMsIGxhbmd1YWdlLCB1c2VEZWZhdWx0LCBkZWZpbml0aW9ucyk7XG5cdFx0aWYgKCFzdHlsZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9yZWdyb3VuZDogdGhpcy5nZXRUb2tlbkNvbG9ySW5kZXgoKS5nZXQoc3R5bGUuZm9yZWdyb3VuZCksXG5cdFx0XHRib2xkOiBzdHlsZS5ib2xkLFxuXHRcdFx0dW5kZXJsaW5lOiBzdHlsZS51bmRlcmxpbmUsXG5cdFx0XHRzdHJpa2V0aHJvdWdoOiBzdHlsZS5zdHJpa2V0aHJvdWdoLFxuXHRcdFx0aXRhbGljOiBzdHlsZS5pdGFsaWMsXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb2tlblN0eWxpbmdSdWxlU2NvcGUocnVsZTogU2VtYW50aWNUb2tlblJ1bGUpOiAnc2V0dGluZycgfCAndGhlbWUnIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5jdXN0b21TZW1hbnRpY1Rva2VuUnVsZXMuaW5kZXhPZihydWxlKSAhPT0gLTEpIHtcblx0XHRcdHJldHVybiAnc2V0dGluZyc7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNlbWFudGljVG9rZW5SdWxlcy5pbmRleE9mKHJ1bGUpICE9PSAtMSkge1xuXHRcdFx0cmV0dXJuICd0aGVtZSc7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RGVmYXVsdChjb2xvcklkOiBDb2xvcklkZW50aWZpZXIpOiBDb2xvciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGNvbG9yUmVnaXN0cnkucmVzb2x2ZURlZmF1bHRDb2xvcihjb2xvcklkLCB0aGlzKTtcblx0fVxuXG5cblx0cHVibGljIHJlc29sdmVTY29wZXMoc2NvcGVzOiBQcm9iZVNjb3BlW10sIGRlZmluaXRpb25zPzogVGV4dE1hdGVUaGVtaW5nUnVsZURlZmluaXRpb25zKTogVG9rZW5TdHlsZSB8IHVuZGVmaW5lZCB7XG5cblx0XHRpZiAoIXRoaXMudGhlbWVUb2tlblNjb3BlTWF0Y2hlcnMpIHtcblx0XHRcdHRoaXMudGhlbWVUb2tlblNjb3BlTWF0Y2hlcnMgPSB0aGlzLnRoZW1lVG9rZW5Db2xvcnMubWFwKGdldFNjb3BlTWF0Y2hlcik7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5jdXN0b21Ub2tlblNjb3BlTWF0Y2hlcnMpIHtcblx0XHRcdHRoaXMuY3VzdG9tVG9rZW5TY29wZU1hdGNoZXJzID0gdGhpcy5jdXN0b21Ub2tlbkNvbG9ycy5tYXAoZ2V0U2NvcGVNYXRjaGVyKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHNjb3BlIG9mIHNjb3Blcykge1xuXHRcdFx0bGV0IGZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBmb250U3R5bGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBmb3JlZ3JvdW5kU2NvcmUgPSAtMTtcblx0XHRcdGxldCBmb250U3R5bGVTY29yZSA9IC0xO1xuXHRcdFx0bGV0IGZvbnRTdHlsZVRoZW1pbmdSdWxlOiBJVGV4dE1hdGVUaGVtaW5nUnVsZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBmb3JlZ3JvdW5kVGhlbWluZ1J1bGU6IElUZXh0TWF0ZVRoZW1pbmdSdWxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRmdW5jdGlvbiBmaW5kVG9rZW5TdHlsZUZvclNjb3BlSW5TY29wZXMoc2NvcGVNYXRjaGVyczogTWF0Y2hlcjxQcm9iZVNjb3BlPltdLCB0aGVtaW5nUnVsZXM6IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10pIHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzY29wZU1hdGNoZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2NvcmUgPSBzY29wZU1hdGNoZXJzW2ldKHNjb3BlKTtcblx0XHRcdFx0XHRpZiAoc2NvcmUgPj0gMCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdGhlbWluZ1J1bGUgPSB0aGVtaW5nUnVsZXNbaV07XG5cdFx0XHRcdFx0XHRjb25zdCBzZXR0aW5ncyA9IHRoZW1pbmdSdWxlc1tpXS5zZXR0aW5ncztcblx0XHRcdFx0XHRcdGlmIChzY29yZSA+PSBmb3JlZ3JvdW5kU2NvcmUgJiYgc2V0dGluZ3MuZm9yZWdyb3VuZCkge1xuXHRcdFx0XHRcdFx0XHRmb3JlZ3JvdW5kID0gc2V0dGluZ3MuZm9yZWdyb3VuZDtcblx0XHRcdFx0XHRcdFx0Zm9yZWdyb3VuZFNjb3JlID0gc2NvcmU7XG5cdFx0XHRcdFx0XHRcdGZvcmVncm91bmRUaGVtaW5nUnVsZSA9IHRoZW1pbmdSdWxlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHNjb3JlID49IGZvbnRTdHlsZVNjb3JlICYmIHR5cGVzLmlzU3RyaW5nKHNldHRpbmdzLmZvbnRTdHlsZSkpIHtcblx0XHRcdFx0XHRcdFx0Zm9udFN0eWxlID0gc2V0dGluZ3MuZm9udFN0eWxlO1xuXHRcdFx0XHRcdFx0XHRmb250U3R5bGVTY29yZSA9IHNjb3JlO1xuXHRcdFx0XHRcdFx0XHRmb250U3R5bGVUaGVtaW5nUnVsZSA9IHRoZW1pbmdSdWxlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZmluZFRva2VuU3R5bGVGb3JTY29wZUluU2NvcGVzKHRoaXMudGhlbWVUb2tlblNjb3BlTWF0Y2hlcnMsIHRoaXMudGhlbWVUb2tlbkNvbG9ycyk7XG5cdFx0XHRmaW5kVG9rZW5TdHlsZUZvclNjb3BlSW5TY29wZXModGhpcy5jdXN0b21Ub2tlblNjb3BlTWF0Y2hlcnMsIHRoaXMuY3VzdG9tVG9rZW5Db2xvcnMpO1xuXHRcdFx0aWYgKGZvcmVncm91bmQgIT09IHVuZGVmaW5lZCB8fCBmb250U3R5bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpZiAoZGVmaW5pdGlvbnMpIHtcblx0XHRcdFx0XHRkZWZpbml0aW9ucy5mb3JlZ3JvdW5kID0gZm9yZWdyb3VuZFRoZW1pbmdSdWxlO1xuXHRcdFx0XHRcdGRlZmluaXRpb25zLmJvbGQgPSBkZWZpbml0aW9ucy5pdGFsaWMgPSBkZWZpbml0aW9ucy51bmRlcmxpbmUgPSBkZWZpbml0aW9ucy5zdHJpa2V0aHJvdWdoID0gZm9udFN0eWxlVGhlbWluZ1J1bGU7XG5cdFx0XHRcdFx0ZGVmaW5pdGlvbnMuc2NvcGUgPSBzY29wZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBUb2tlblN0eWxlLmZyb21TZXR0aW5ncyhmb3JlZ3JvdW5kLCBmb250U3R5bGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGRlZmluZXMoY29sb3JJZDogQ29sb3JJZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY3VzdG9tQ29sb3IgPSB0aGlzLmN1c3RvbUNvbG9yTWFwW2NvbG9ySWRdO1xuXHRcdGlmIChjdXN0b21Db2xvciBpbnN0YW5jZW9mIENvbG9yKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGN1c3RvbUNvbG9yID09PSB1bmRlZmluZWQgLyogIT09IERFRkFVTFRfQ09MT1JfQ09ORklHX1ZBTFVFICovICYmIHRoaXMuY29sb3JNYXAuaGFzT3duUHJvcGVydHkoY29sb3JJZCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q3VzdG9taXphdGlvbnMoc2V0dGluZ3M6IFRoZW1lQ29uZmlndXJhdGlvbikge1xuXHRcdHRoaXMuc2V0Q3VzdG9tQ29sb3JzKHNldHRpbmdzLmNvbG9yQ3VzdG9taXphdGlvbnMpO1xuXHRcdHRoaXMuc2V0Q3VzdG9tVG9rZW5Db2xvcnMoc2V0dGluZ3MudG9rZW5Db2xvckN1c3RvbWl6YXRpb25zKTtcblx0XHR0aGlzLnNldEN1c3RvbVNlbWFudGljVG9rZW5Db2xvcnMoc2V0dGluZ3Muc2VtYW50aWNUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIHNldEN1c3RvbUNvbG9ycyhjb2xvcnM6IElDb2xvckN1c3RvbWl6YXRpb25zKSB7XG5cdFx0dGhpcy5jdXN0b21Db2xvck1hcCA9IHt9O1xuXHRcdHRoaXMub3ZlcndyaXRlQ3VzdG9tQ29sb3JzKGNvbG9ycyk7XG5cblx0XHRjb25zdCB0aGVtZVNwZWNpZmljQ29sb3JzID0gdGhpcy5nZXRUaGVtZVNwZWNpZmljQ29sb3JzKGNvbG9ycykgYXMgSUNvbG9yQ3VzdG9taXphdGlvbnM7XG5cdFx0aWYgKHR5cGVzLmlzT2JqZWN0KHRoZW1lU3BlY2lmaWNDb2xvcnMpKSB7XG5cdFx0XHR0aGlzLm92ZXJ3cml0ZUN1c3RvbUNvbG9ycyh0aGVtZVNwZWNpZmljQ29sb3JzKTtcblx0XHR9XG5cblx0XHR0aGlzLnRva2VuQ29sb3JJbmRleCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRva2VuRm9udEluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudGV4dE1hdGVUaGVtaW5nUnVsZXMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5jdXN0b21Ub2tlblNjb3BlTWF0Y2hlcnMgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIG92ZXJ3cml0ZUN1c3RvbUNvbG9ycyhjb2xvcnM6IElDb2xvckN1c3RvbWl6YXRpb25zKSB7XG5cdFx0Zm9yIChjb25zdCBpZCBpbiBjb2xvcnMpIHtcblx0XHRcdGNvbnN0IGNvbG9yVmFsID0gY29sb3JzW2lkXTtcblx0XHRcdGlmIChjb2xvclZhbCA9PT0gREVGQVVMVF9DT0xPUl9DT05GSUdfVkFMVUUpIHtcblx0XHRcdFx0dGhpcy5jdXN0b21Db2xvck1hcFtpZF0gPSBERUZBVUxUX0NPTE9SX0NPTkZJR19WQUxVRTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGNvbG9yVmFsID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aGlzLmN1c3RvbUNvbG9yTWFwW2lkXSA9IENvbG9yLmZyb21IZXgoY29sb3JWYWwpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRDdXN0b21Ub2tlbkNvbG9ycyhjdXN0b21Ub2tlbkNvbG9yczogSVRva2VuQ29sb3JDdXN0b21pemF0aW9ucykge1xuXHRcdHRoaXMuY3VzdG9tVG9rZW5Db2xvcnMgPSBbXTtcblx0XHR0aGlzLmN1c3RvbVNlbWFudGljSGlnaGxpZ2h0aW5nRGVwcmVjYXRlZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIGZpcnN0IGFkZCB0aGUgbm9uLXRoZW1lIHNwZWNpZmljIHNldHRpbmdzXG5cdFx0dGhpcy5hZGRDdXN0b21Ub2tlbkNvbG9ycyhjdXN0b21Ub2tlbkNvbG9ycyk7XG5cblx0XHQvLyBhcHBlbmQgdGhlbWUgc3BlY2lmaWMgc2V0dGluZ3MuIExhc3QgcnVsZXMgd2lsbCB3aW4uXG5cdFx0Y29uc3QgdGhlbWVTcGVjaWZpY1Rva2VuQ29sb3JzID0gdGhpcy5nZXRUaGVtZVNwZWNpZmljQ29sb3JzKGN1c3RvbVRva2VuQ29sb3JzKSBhcyBJVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zO1xuXHRcdGlmICh0eXBlcy5pc09iamVjdCh0aGVtZVNwZWNpZmljVG9rZW5Db2xvcnMpKSB7XG5cdFx0XHR0aGlzLmFkZEN1c3RvbVRva2VuQ29sb3JzKHRoZW1lU3BlY2lmaWNUb2tlbkNvbG9ycyk7XG5cdFx0fVxuXG5cdFx0dGhpcy50b2tlbkNvbG9ySW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50b2tlbkZvbnRJbmRleCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRleHRNYXRlVGhlbWluZ1J1bGVzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VzdG9tVG9rZW5TY29wZU1hdGNoZXJzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIHNldEN1c3RvbVNlbWFudGljVG9rZW5Db2xvcnMoc2VtYW50aWNUb2tlbkNvbG9yczogSVNlbWFudGljVG9rZW5Db2xvckN1c3RvbWl6YXRpb25zIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5jdXN0b21TZW1hbnRpY1Rva2VuUnVsZXMgPSBbXTtcblx0XHR0aGlzLmN1c3RvbVNlbWFudGljSGlnaGxpZ2h0aW5nID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHNlbWFudGljVG9rZW5Db2xvcnMpIHtcblx0XHRcdHRoaXMuY3VzdG9tU2VtYW50aWNIaWdobGlnaHRpbmcgPSBzZW1hbnRpY1Rva2VuQ29sb3JzLmVuYWJsZWQ7XG5cdFx0XHRpZiAoc2VtYW50aWNUb2tlbkNvbG9ycy5ydWxlcykge1xuXHRcdFx0XHR0aGlzLnJlYWRTZW1hbnRpY1Rva2VuUnVsZXMoc2VtYW50aWNUb2tlbkNvbG9ycy5ydWxlcyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0aGVtZVNwZWNpZmljQ29sb3JzID0gdGhpcy5nZXRUaGVtZVNwZWNpZmljQ29sb3JzKHNlbWFudGljVG9rZW5Db2xvcnMpIGFzIElTZW1hbnRpY1Rva2VuQ29sb3JDdXN0b21pemF0aW9ucztcblx0XHRcdGlmICh0eXBlcy5pc09iamVjdCh0aGVtZVNwZWNpZmljQ29sb3JzKSkge1xuXHRcdFx0XHRpZiAodGhlbWVTcGVjaWZpY0NvbG9ycy5lbmFibGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLmN1c3RvbVNlbWFudGljSGlnaGxpZ2h0aW5nID0gdGhlbWVTcGVjaWZpY0NvbG9ycy5lbmFibGVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGVtZVNwZWNpZmljQ29sb3JzLnJ1bGVzKSB7XG5cdFx0XHRcdFx0dGhpcy5yZWFkU2VtYW50aWNUb2tlblJ1bGVzKHRoZW1lU3BlY2lmaWNDb2xvcnMucnVsZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy50b2tlbkNvbG9ySW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50b2tlbkZvbnRJbmRleCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRleHRNYXRlVGhlbWluZ1J1bGVzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGlzVGhlbWVTY29wZShrZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBrZXkuY2hhckF0KDApID09PSBUSEVNRV9TQ09QRV9PUEVOX1BBUkVOICYmIGtleS5jaGFyQXQoa2V5Lmxlbmd0aCAtIDEpID09PSBUSEVNRV9TQ09QRV9DTE9TRV9QQVJFTjtcblx0fVxuXG5cdHB1YmxpYyBpc1RoZW1lU2NvcGVNYXRjaCh0aGVtZUlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCB0aGVtZUlkRmlyc3RDaGFyID0gdGhlbWVJZC5jaGFyQXQoMCk7XG5cdFx0Y29uc3QgdGhlbWVJZExhc3RDaGFyID0gdGhlbWVJZC5jaGFyQXQodGhlbWVJZC5sZW5ndGggLSAxKTtcblx0XHRjb25zdCB0aGVtZUlkUHJlZml4ID0gdGhlbWVJZC5zbGljZSgwLCAtMSk7XG5cdFx0Y29uc3QgdGhlbWVJZEluZml4ID0gdGhlbWVJZC5zbGljZSgxLCAtMSk7XG5cdFx0Y29uc3QgdGhlbWVJZFN1ZmZpeCA9IHRoZW1lSWQuc2xpY2UoMSk7XG5cdFx0cmV0dXJuIHRoZW1lSWQgPT09IHRoaXMuc2V0dGluZ3NJZFxuXHRcdFx0fHwgKHRoaXMuc2V0dGluZ3NJZC5pbmNsdWRlcyh0aGVtZUlkSW5maXgpICYmIHRoZW1lSWRGaXJzdENoYXIgPT09IFRIRU1FX1NDT1BFX1dJTERDQVJEICYmIHRoZW1lSWRMYXN0Q2hhciA9PT0gVEhFTUVfU0NPUEVfV0lMRENBUkQpXG5cdFx0XHR8fCAodGhpcy5zZXR0aW5nc0lkLnN0YXJ0c1dpdGgodGhlbWVJZFByZWZpeCkgJiYgdGhlbWVJZExhc3RDaGFyID09PSBUSEVNRV9TQ09QRV9XSUxEQ0FSRClcblx0XHRcdHx8ICh0aGlzLnNldHRpbmdzSWQuZW5kc1dpdGgodGhlbWVJZFN1ZmZpeCkgJiYgdGhlbWVJZEZpcnN0Q2hhciA9PT0gVEhFTUVfU0NPUEVfV0lMRENBUkQpO1xuXHR9XG5cblx0cHVibGljIGdldFRoZW1lU3BlY2lmaWNDb2xvcnMoY29sb3JzOiBJVGhlbWVTY29wYWJsZUN1c3RvbWl6YXRpb25zKTogSVRoZW1lU2NvcGVkQ3VzdG9taXphdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGxldCB0aGVtZVNwZWNpZmljQ29sb3JzOiBJVGhlbWVTY29wZWRDdXN0b21pemF0aW9ucyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiBjb2xvcnMpIHtcblx0XHRcdGNvbnN0IHNjb3BlZENvbG9ycyA9IGNvbG9yc1trZXldO1xuXHRcdFx0aWYgKHRoaXMuaXNUaGVtZVNjb3BlKGtleSkgJiYgc2NvcGVkQ29sb3JzIGluc3RhbmNlb2YgT2JqZWN0ICYmICFBcnJheS5pc0FycmF5KHNjb3BlZENvbG9ycykpIHtcblx0XHRcdFx0Y29uc3QgdGhlbWVTY29wZUxpc3QgPSBrZXkubWF0Y2godGhlbWVTY29wZVJlZ2V4KSB8fCBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCB0aGVtZVNjb3BlIG9mIHRoZW1lU2NvcGVMaXN0KSB7XG5cdFx0XHRcdFx0Y29uc3QgdGhlbWVJZCA9IHRoZW1lU2NvcGUuc3Vic3RyaW5nKDEsIHRoZW1lU2NvcGUubGVuZ3RoIC0gMSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNUaGVtZVNjb3BlTWF0Y2godGhlbWVJZCkpIHtcblx0XHRcdFx0XHRcdGlmICghdGhlbWVTcGVjaWZpY0NvbG9ycykge1xuXHRcdFx0XHRcdFx0XHR0aGVtZVNwZWNpZmljQ29sb3JzID0ge307XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBzY29wZWRUaGVtZVNwZWNpZmljQ29sb3JzID0gc2NvcGVkQ29sb3JzIGFzIElUaGVtZVNjb3BlZEN1c3RvbWl6YXRpb25zO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBzdWJrZXkgaW4gc2NvcGVkVGhlbWVTcGVjaWZpY0NvbG9ycykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbENvbG9ycyA9IHRoZW1lU3BlY2lmaWNDb2xvcnNbc3Via2V5XTtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgb3ZlcnJpZGVDb2xvcnMgPSBzY29wZWRUaGVtZVNwZWNpZmljQ29sb3JzW3N1YmtleV07XG5cdFx0XHRcdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KG9yaWdpbmFsQ29sb3JzKSAmJiBBcnJheS5pc0FycmF5KG92ZXJyaWRlQ29sb3JzKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoZW1lU3BlY2lmaWNDb2xvcnNbc3Via2V5XSA9IG9yaWdpbmFsQ29sb3JzLmNvbmNhdChvdmVycmlkZUNvbG9ycyk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAob3ZlcnJpZGVDb2xvcnMpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGVtZVNwZWNpZmljQ29sb3JzW3N1YmtleV0gPSBvdmVycmlkZUNvbG9ycztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhlbWVTcGVjaWZpY0NvbG9ycztcblx0fVxuXG5cdHByaXZhdGUgcmVhZFNlbWFudGljVG9rZW5SdWxlcyh0b2tlblN0eWxpbmdSdWxlU2VjdGlvbjogSVNlbWFudGljVG9rZW5SdWxlcykge1xuXHRcdGZvciAoY29uc3Qga2V5IGluIHRva2VuU3R5bGluZ1J1bGVTZWN0aW9uKSB7XG5cdFx0XHRpZiAoIXRoaXMuaXNUaGVtZVNjb3BlKGtleSkpIHsgLy8gc3RpbGwgZG8gdGhpcyB0ZXN0IHVudGlsIGV4cGVyaW1lbnRhbCBzZXR0aW5ncyBhcmUgZ29uZVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHJ1bGUgPSByZWFkU2VtYW50aWNUb2tlblJ1bGUoa2V5LCB0b2tlblN0eWxpbmdSdWxlU2VjdGlvbltrZXldKTtcblx0XHRcdFx0XHRpZiAocnVsZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5jdXN0b21TZW1hbnRpY1Rva2VuUnVsZXMucHVzaChydWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHQvLyBpbnZhbGlkIHNlbGVjdG9yLCBpZ25vcmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRkQ3VzdG9tVG9rZW5Db2xvcnMoY3VzdG9tVG9rZW5Db2xvcnM6IElUb2tlbkNvbG9yQ3VzdG9taXphdGlvbnMpIHtcblx0XHQvLyBQdXQgdGhlIGdlbmVyYWwgY3VzdG9taXphdGlvbnMgc3VjaCBhcyBjb21tZW50cywgc3RyaW5ncywgZXRjLiBmaXJzdCBzbyB0aGF0XG5cdFx0Ly8gdGhleSBjYW4gYmUgb3ZlcnJpZGRlbiBieSBzcGVjaWZpYyBjdXN0b21pemF0aW9ucyBsaWtlIFwic3RyaW5nLmludGVycG9sYXRlZFwiXG5cdFx0Zm9yIChjb25zdCB0b2tlbkdyb3VwIGluIHRva2VuR3JvdXBUb1Njb3Blc01hcCkge1xuXHRcdFx0Y29uc3QgZ3JvdXAgPSA8a2V5b2YgdHlwZW9mIHRva2VuR3JvdXBUb1Njb3Blc01hcD50b2tlbkdyb3VwOyAvLyBUUyBkb2Vzbid0IHR5cGUgJ3Rva2VuR3JvdXAnIHByb3Blcmx5XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGN1c3RvbVRva2VuQ29sb3JzW2dyb3VwXTtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRjb25zdCBzZXR0aW5ncyA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyB7IGZvcmVncm91bmQ6IHZhbHVlIH0gOiB2YWx1ZTtcblx0XHRcdFx0Y29uc3Qgc2NvcGVzID0gdG9rZW5Hcm91cFRvU2NvcGVzTWFwW2dyb3VwXTtcblx0XHRcdFx0Zm9yIChjb25zdCBzY29wZSBvZiBzY29wZXMpIHtcblx0XHRcdFx0XHR0aGlzLmN1c3RvbVRva2VuQ29sb3JzLnB1c2goeyBzY29wZSwgc2V0dGluZ3MgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBzcGVjaWZpYyBjdXN0b21pemF0aW9uc1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGN1c3RvbVRva2VuQ29sb3JzLnRleHRNYXRlUnVsZXMpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJ1bGUgb2YgY3VzdG9tVG9rZW5Db2xvcnMudGV4dE1hdGVSdWxlcykge1xuXHRcdFx0XHRpZiAocnVsZS5zY29wZSAmJiBydWxlLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0dGhpcy5jdXN0b21Ub2tlbkNvbG9ycy5wdXNoKHJ1bGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjdXN0b21Ub2tlbkNvbG9ycy5zZW1hbnRpY0hpZ2hsaWdodGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmN1c3RvbVNlbWFudGljSGlnaGxpZ2h0aW5nRGVwcmVjYXRlZCA9IGN1c3RvbVRva2VuQ29sb3JzLnNlbWFudGljSGlnaGxpZ2h0aW5nO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBlbnN1cmVMb2FkZWQoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuICF0aGlzLmlzTG9hZGVkID8gdGhpcy5sb2FkKGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSkgOiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyByZWxvYWQoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMubG9hZChleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2FkKGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZTogSUV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5sb2NhdGlvbikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHR0aGlzLnRoZW1lVG9rZW5Db2xvcnMgPSBbXTtcblx0XHR0aGlzLmNsZWFyQ2FjaGVzKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSB7XG5cdFx0XHRjb2xvcnM6IHt9LFxuXHRcdFx0dGV4dE1hdGVSdWxlczogW10sXG5cdFx0XHRzZW1hbnRpY1Rva2VuUnVsZXM6IFtdLFxuXHRcdFx0c2VtYW50aWNIaWdobGlnaHRpbmc6IGZhbHNlXG5cdFx0fTtcblx0XHRyZXR1cm4gX2xvYWRDb2xvclRoZW1lKGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZSwgdGhpcy5sb2NhdGlvbiwgcmVzdWx0KS50aGVuKF8gPT4ge1xuXHRcdFx0dGhpcy5pc0xvYWRlZCA9IHRydWU7XG5cdFx0XHR0aGlzLnNlbWFudGljVG9rZW5SdWxlcyA9IHJlc3VsdC5zZW1hbnRpY1Rva2VuUnVsZXM7XG5cdFx0XHR0aGlzLmNvbG9yTWFwID0gcmVzdWx0LmNvbG9ycztcblx0XHRcdHRoaXMudGhlbWVUb2tlbkNvbG9ycyA9IHJlc3VsdC50ZXh0TWF0ZVJ1bGVzO1xuXHRcdFx0dGhpcy50aGVtZVNlbWFudGljSGlnaGxpZ2h0aW5nID0gcmVzdWx0LnNlbWFudGljSGlnaGxpZ2h0aW5nO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGNsZWFyQ2FjaGVzKCkge1xuXHRcdHRoaXMudG9rZW5Db2xvckluZGV4ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMudG9rZW5Gb250SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy50ZXh0TWF0ZVRoZW1pbmdSdWxlcyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRoZW1lVG9rZW5TY29wZU1hdGNoZXJzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuY3VzdG9tVG9rZW5TY29wZU1hdGNoZXJzID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0dG9TdG9yYWdlKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpIHtcblx0XHRjb25zdCBjb2xvck1hcERhdGE6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiB0aGlzLmNvbG9yTWFwKSB7XG5cdFx0XHRjb2xvck1hcERhdGFba2V5XSA9IENvbG9yLkZvcm1hdC5DU1MuZm9ybWF0SGV4QSh0aGlzLmNvbG9yTWFwW2tleV0sIHRydWUpO1xuXHRcdH1cblx0XHQvLyBubyBuZWVkIHRvIHBlcnNpc3QgY3VzdG9tIGNvbG9ycywgdGhleSB3aWxsIGJlIHRha2VuIGZyb20gdGhlIHNldHRpbmdzXG5cdFx0Y29uc3QgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRpZDogdGhpcy5pZCxcblx0XHRcdGxhYmVsOiB0aGlzLmxhYmVsLFxuXHRcdFx0c2V0dGluZ3NJZDogdGhpcy5zZXR0aW5nc0lkLFxuXHRcdFx0dGhlbWVUb2tlbkNvbG9yczogdGhpcy50aGVtZVRva2VuQ29sb3JzLm1hcCh0YyA9PiAoeyBzZXR0aW5nczogdGMuc2V0dGluZ3MsIHNjb3BlOiB0Yy5zY29wZSB9KSksIC8vIGRvbid0IHBlcnNpc3QgbmFtZXNcblx0XHRcdHNlbWFudGljVG9rZW5SdWxlczogdGhpcy5zZW1hbnRpY1Rva2VuUnVsZXMubWFwKFNlbWFudGljVG9rZW5SdWxlLnRvSlNPTk9iamVjdCksXG5cdFx0XHRleHRlbnNpb25EYXRhOiBFeHRlbnNpb25EYXRhLnRvSlNPTk9iamVjdCh0aGlzLmV4dGVuc2lvbkRhdGEpLFxuXHRcdFx0dGhlbWVTZW1hbnRpY0hpZ2hsaWdodGluZzogdGhpcy50aGVtZVNlbWFudGljSGlnaGxpZ2h0aW5nLFxuXHRcdFx0Y29sb3JNYXA6IGNvbG9yTWFwRGF0YSxcblx0XHRcdHdhdGNoOiB0aGlzLndhdGNoXG5cdFx0fSk7XG5cblx0XHQvLyByb2FtIHBlcnNpc3RlZCBjb2xvciB0aGVtZSBjb2xvcnMuIERvbid0IGVuYWJsZSBmb3IgaWNvbnMgYXMgdGhleSBjb250YWluIHJlZmVyZW5jZXMgdG8gZm9udHMgYW5kIGltYWdlcy5cblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShDb2xvclRoZW1lRGF0YS5TVE9SQUdFX0tFWSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0Z2V0IHRoZW1lVHlwZVNlbGVjdG9yKCk6IFRoZW1lVHlwZVNlbGVjdG9yIHtcblx0XHRyZXR1cm4gdGhpcy5jbGFzc05hbWVzWzBdIGFzIFRoZW1lVHlwZVNlbGVjdG9yO1xuXHR9XG5cblx0Z2V0IGNsYXNzTmFtZXMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmlkLnNwbGl0KCcgJyk7XG5cdH1cblxuXHRnZXQgdHlwZSgpOiBDb2xvclNjaGVtZSB7XG5cdFx0c3dpdGNoICh0aGlzLnRoZW1lVHlwZVNlbGVjdG9yKSB7XG5cdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLlZTOiByZXR1cm4gQ29sb3JTY2hlbWUuTElHSFQ7XG5cdFx0XHRjYXNlIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0JMQUNLOiByZXR1cm4gQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLO1xuXHRcdFx0Y2FzZSBUaGVtZVR5cGVTZWxlY3Rvci5IQ19MSUdIVDogcmV0dXJuIENvbG9yU2NoZW1lLkhJR0hfQ09OVFJBU1RfTElHSFQ7XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gQ29sb3JTY2hlbWUuREFSSztcblx0XHR9XG5cdH1cblxuXHQvLyBjb25zdHJ1Y3RvcnNcblxuXHRzdGF0aWMgY3JlYXRlVW5sb2FkZWRUaGVtZUZvclRoZW1lVHlwZSh0aGVtZVR5cGU6IENvbG9yU2NoZW1lLCBjb2xvck1hcD86IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfSk6IENvbG9yVGhlbWVEYXRhIHtcblx0XHRyZXR1cm4gQ29sb3JUaGVtZURhdGEuY3JlYXRlVW5sb2FkZWRUaGVtZShnZXRUaGVtZVR5cGVTZWxlY3Rvcih0aGVtZVR5cGUpLCBjb2xvck1hcCk7XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlVW5sb2FkZWRUaGVtZShpZDogc3RyaW5nLCBjb2xvck1hcD86IHsgW2lkOiBzdHJpbmddOiBzdHJpbmcgfSk6IENvbG9yVGhlbWVEYXRhIHtcblx0XHRjb25zdCB0aGVtZURhdGEgPSBuZXcgQ29sb3JUaGVtZURhdGEoaWQsICcnLCAnX18nICsgaWQpO1xuXHRcdHRoZW1lRGF0YS5pc0xvYWRlZCA9IGZhbHNlO1xuXHRcdHRoZW1lRGF0YS50aGVtZVRva2VuQ29sb3JzID0gW107XG5cdFx0dGhlbWVEYXRhLndhdGNoID0gZmFsc2U7XG5cdFx0aWYgKGNvbG9yTWFwKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGlkIGluIGNvbG9yTWFwKSB7XG5cdFx0XHRcdHRoZW1lRGF0YS5jb2xvck1hcFtpZF0gPSBDb2xvci5mcm9tSGV4KGNvbG9yTWFwW2lkXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGVtZURhdGE7XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlTG9hZGVkRW1wdHlUaGVtZShpZDogc3RyaW5nLCBzZXR0aW5nc0lkOiBzdHJpbmcpOiBDb2xvclRoZW1lRGF0YSB7XG5cdFx0Y29uc3QgdGhlbWVEYXRhID0gbmV3IENvbG9yVGhlbWVEYXRhKGlkLCAnJywgc2V0dGluZ3NJZCk7XG5cdFx0dGhlbWVEYXRhLmlzTG9hZGVkID0gdHJ1ZTtcblx0XHR0aGVtZURhdGEudGhlbWVUb2tlbkNvbG9ycyA9IFtdO1xuXHRcdHRoZW1lRGF0YS53YXRjaCA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGVtZURhdGE7XG5cdH1cblxuXHRzdGF0aWMgZnJvbVN0b3JhZ2VEYXRhKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpOiBDb2xvclRoZW1lRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5wdXQgPSBzdG9yYWdlU2VydmljZS5nZXQoQ29sb3JUaGVtZURhdGEuU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoIWlucHV0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IEpTT04ucGFyc2UoaW5wdXQpO1xuXHRcdFx0Y29uc3QgdGhlbWUgPSBuZXcgQ29sb3JUaGVtZURhdGEoJycsICcnLCAnJyk7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBkYXRhKSB7XG5cdFx0XHRcdHN3aXRjaCAoa2V5KSB7XG5cdFx0XHRcdFx0Y2FzZSAnY29sb3JNYXAnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2xvck1hcERhdGEgPSBkYXRhW2tleV07XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGlkIGluIGNvbG9yTWFwRGF0YSkge1xuXHRcdFx0XHRcdFx0XHR0aGVtZS5jb2xvck1hcFtpZF0gPSBDb2xvci5mcm9tSGV4KGNvbG9yTWFwRGF0YVtpZF0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ3RoZW1lVG9rZW5Db2xvcnMnOlxuXHRcdFx0XHRcdGNhc2UgJ2lkJzogY2FzZSAnbGFiZWwnOiBjYXNlICdzZXR0aW5nc0lkJzogY2FzZSAnd2F0Y2gnOiBjYXNlICd0aGVtZVNlbWFudGljSGlnaGxpZ2h0aW5nJzpcblx0XHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdFx0KHRoZW1lIGFzIGFueSlba2V5XSA9IGRhdGFba2V5XTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3NlbWFudGljVG9rZW5SdWxlcyc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHJ1bGVzRGF0YSA9IGRhdGFba2V5XTtcblx0XHRcdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHJ1bGVzRGF0YSkpIHtcblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBkIG9mIHJ1bGVzRGF0YSkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJ1bGUgPSBTZW1hbnRpY1Rva2VuUnVsZS5mcm9tSlNPTk9iamVjdCh0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnksIGQpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChydWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGVtZS5zZW1hbnRpY1Rva2VuUnVsZXMucHVzaChydWxlKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICdsb2NhdGlvbic6XG5cdFx0XHRcdFx0XHQvLyBpZ25vcmUsIG5vIGxvbmdlciByZXN0b3JlXG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdleHRlbnNpb25EYXRhJzpcblx0XHRcdFx0XHRcdHRoZW1lLmV4dGVuc2lvbkRhdGEgPSBFeHRlbnNpb25EYXRhLmZyb21KU09OT2JqZWN0KGRhdGEuZXh0ZW5zaW9uRGF0YSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGVtZS5pZCB8fCAhdGhlbWUuc2V0dGluZ3NJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoZW1lO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0c3RhdGljIGZyb21FeHRlbnNpb25UaGVtZSh0aGVtZTogSVRoZW1lRXh0ZW5zaW9uUG9pbnQsIGNvbG9yVGhlbWVMb2NhdGlvbjogVVJJLCBleHRlbnNpb25EYXRhOiBFeHRlbnNpb25EYXRhKTogQ29sb3JUaGVtZURhdGEge1xuXHRcdGNvbnN0IGJhc2VUaGVtZTogc3RyaW5nID0gdGhlbWVbJ3VpVGhlbWUnXSB8fCAndnMtZGFyayc7XG5cdFx0Y29uc3QgdGhlbWVTZWxlY3RvciA9IHRvQ1NTU2VsZWN0b3IoZXh0ZW5zaW9uRGF0YS5leHRlbnNpb25JZCwgdGhlbWUucGF0aCk7XG5cdFx0Y29uc3QgaWQgPSBgJHtiYXNlVGhlbWV9ICR7dGhlbWVTZWxlY3Rvcn1gO1xuXHRcdGNvbnN0IGxhYmVsID0gdGhlbWUubGFiZWwgfHwgYmFzZW5hbWUodGhlbWUucGF0aCk7XG5cdFx0Y29uc3Qgc2V0dGluZ3NJZCA9IHRoZW1lLmlkIHx8IGxhYmVsO1xuXHRcdGNvbnN0IHRoZW1lRGF0YSA9IG5ldyBDb2xvclRoZW1lRGF0YShpZCwgbGFiZWwsIHNldHRpbmdzSWQpO1xuXHRcdHRoZW1lRGF0YS5kZXNjcmlwdGlvbiA9IHRoZW1lLmRlc2NyaXB0aW9uO1xuXHRcdHRoZW1lRGF0YS53YXRjaCA9IHRoZW1lLl93YXRjaCA9PT0gdHJ1ZTtcblx0XHR0aGVtZURhdGEubG9jYXRpb24gPSBjb2xvclRoZW1lTG9jYXRpb247XG5cdFx0dGhlbWVEYXRhLmV4dGVuc2lvbkRhdGEgPSBleHRlbnNpb25EYXRhO1xuXHRcdHRoZW1lRGF0YS5pc0xvYWRlZCA9IGZhbHNlO1xuXHRcdHJldHVybiB0aGVtZURhdGE7XG5cdH1cbn1cblxuZnVuY3Rpb24gdG9DU1NTZWxlY3RvcihleHRlbnNpb25JZDogc3RyaW5nLCBwYXRoOiBzdHJpbmcpIHtcblx0aWYgKHBhdGguc3RhcnRzV2l0aCgnLi8nKSkge1xuXHRcdHBhdGggPSBwYXRoLnN1YnN0cigyKTtcblx0fVxuXHRsZXQgc3RyID0gYCR7ZXh0ZW5zaW9uSWR9LSR7cGF0aH1gO1xuXG5cdC8vcmVtb3ZlIGFsbCBjaGFyYWN0ZXJzIHRoYXQgYXJlIG5vdCBhbGxvd2VkIGluIGNzc1xuXHRzdHIgPSBzdHIucmVwbGFjZSgvW15fYS16QS1aMC05LV0vZywgJy0nKTtcblx0aWYgKHN0ci5jaGFyQXQoMCkubWF0Y2goL1swLTktXS8pKSB7XG5cdFx0c3RyID0gJ18nICsgc3RyO1xuXHR9XG5cdHJldHVybiBzdHI7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIF9sb2FkQ29sb3JUaGVtZShleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2U6IElFeHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsIHRoZW1lTG9jYXRpb246IFVSSSwgcmVzdWx0OiB7IHRleHRNYXRlUnVsZXM6IElUZXh0TWF0ZVRoZW1pbmdSdWxlW107IGNvbG9yczogSUNvbG9yTWFwOyBzZW1hbnRpY1Rva2VuUnVsZXM6IFNlbWFudGljVG9rZW5SdWxlW107IHNlbWFudGljSGlnaGxpZ2h0aW5nOiBib29sZWFuIH0pOiBQcm9taXNlPGFueT4ge1xuXHRpZiAocmVzb3VyY2VzLmV4dG5hbWUodGhlbWVMb2NhdGlvbikgPT09ICcuanNvbicpIHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLnJlYWRFeHRlbnNpb25SZXNvdXJjZSh0aGVtZUxvY2F0aW9uKTtcblx0XHRjb25zdCBlcnJvcnM6IEpzb24uUGFyc2VFcnJvcltdID0gW107XG5cdFx0Y29uc3QgY29udGVudFZhbHVlID0gSnNvbi5wYXJzZShjb250ZW50LCBlcnJvcnMpO1xuXHRcdGlmIChlcnJvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Vycm9yLmNhbm5vdHBhcnNlanNvbicsIFwiUHJvYmxlbXMgcGFyc2luZyBKU09OIHRoZW1lIGZpbGU6IHswfVwiLCBlcnJvcnMubWFwKGUgPT4gZ2V0UGFyc2VFcnJvck1lc3NhZ2UoZS5lcnJvcikpLmpvaW4oJywgJykpKSk7XG5cdFx0fSBlbHNlIGlmIChKc29uLmdldE5vZGVUeXBlKGNvbnRlbnRWYWx1ZSkgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZXJyb3IuaW52YWxpZGZvcm1hdCcsIFwiSW52YWxpZCBmb3JtYXQgZm9yIEpTT04gdGhlbWUgZmlsZTogT2JqZWN0IGV4cGVjdGVkLlwiKSkpO1xuXHRcdH1cblx0XHRpZiAoY29udGVudFZhbHVlLmluY2x1ZGUpIHtcblx0XHRcdGF3YWl0IF9sb2FkQ29sb3JUaGVtZShleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsIHJlc291cmNlcy5qb2luUGF0aChyZXNvdXJjZXMuZGlybmFtZSh0aGVtZUxvY2F0aW9uKSwgY29udGVudFZhbHVlLmluY2x1ZGUpLCByZXN1bHQpO1xuXHRcdH1cblx0XHRpZiAoQXJyYXkuaXNBcnJheShjb250ZW50VmFsdWUuc2V0dGluZ3MpKSB7XG5cdFx0XHRjb252ZXJ0U2V0dGluZ3MoY29udGVudFZhbHVlLnNldHRpbmdzLCByZXN1bHQpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJlc3VsdC5zZW1hbnRpY0hpZ2hsaWdodGluZyA9IHJlc3VsdC5zZW1hbnRpY0hpZ2hsaWdodGluZyB8fCBjb250ZW50VmFsdWUuc2VtYW50aWNIaWdobGlnaHRpbmc7XG5cdFx0Y29uc3QgY29sb3JzID0gY29udGVudFZhbHVlLmNvbG9ycztcblx0XHRpZiAoY29sb3JzKSB7XG5cdFx0XHRpZiAodHlwZW9mIGNvbG9ycyAhPT0gJ29iamVjdCcpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoeyBrZXk6ICdlcnJvci5pbnZhbGlkZm9ybWF0LmNvbG9ycycsIGNvbW1lbnQ6IFsnezB9IHdpbGwgYmUgcmVwbGFjZWQgYnkgYSBwYXRoLiBWYWx1ZXMgaW4gcXVvdGVzIHNob3VsZCBub3QgYmUgdHJhbnNsYXRlZC4nXSB9LCBcIlByb2JsZW0gcGFyc2luZyBjb2xvciB0aGVtZSBmaWxlOiB7MH0uIFByb3BlcnR5ICdjb2xvcnMnIGlzIG5vdCBvZiB0eXBlICdvYmplY3QnLlwiLCB0aGVtZUxvY2F0aW9uLnRvU3RyaW5nKCkpKSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBuZXcgSlNPTiBjb2xvciB0aGVtZXMgZm9ybWF0XG5cdFx0XHRmb3IgKGNvbnN0IGNvbG9ySWQgaW4gY29sb3JzKSB7XG5cdFx0XHRcdGNvbnN0IGNvbG9yVmFsID0gY29sb3JzW2NvbG9ySWRdO1xuXHRcdFx0XHRpZiAoY29sb3JWYWwgPT09IERFRkFVTFRfQ09MT1JfQ09ORklHX1ZBTFVFKSB7IC8vIGlnbm9yZSBjb2xvcnMgdGhhdCBhcmUgc2V0IHRvIHRvIGRlZmF1bHRcblx0XHRcdFx0XHRkZWxldGUgcmVzdWx0LmNvbG9yc1tjb2xvcklkXTtcblx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgY29sb3JWYWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmNvbG9yc1tjb2xvcklkXSA9IENvbG9yLmZyb21IZXgoY29sb3JzW2NvbG9ySWRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCB0b2tlbkNvbG9ycyA9IGNvbnRlbnRWYWx1ZS50b2tlbkNvbG9ycztcblx0XHRpZiAodG9rZW5Db2xvcnMpIHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHRva2VuQ29sb3JzKSkge1xuXHRcdFx0XHRyZXN1bHQudGV4dE1hdGVSdWxlcy5wdXNoKC4uLnRva2VuQ29sb3JzKTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIHRva2VuQ29sb3JzID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRhd2FpdCBfbG9hZFN5bnRheFRva2VucyhleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsIHJlc291cmNlcy5qb2luUGF0aChyZXNvdXJjZXMuZGlybmFtZSh0aGVtZUxvY2F0aW9uKSwgdG9rZW5Db2xvcnMpLCByZXN1bHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoeyBrZXk6ICdlcnJvci5pbnZhbGlkZm9ybWF0LnRva2VuQ29sb3JzJywgY29tbWVudDogWyd7MH0gd2lsbCBiZSByZXBsYWNlZCBieSBhIHBhdGguIFZhbHVlcyBpbiBxdW90ZXMgc2hvdWxkIG5vdCBiZSB0cmFuc2xhdGVkLiddIH0sIFwiUHJvYmxlbSBwYXJzaW5nIGNvbG9yIHRoZW1lIGZpbGU6IHswfS4gUHJvcGVydHkgJ3Rva2VuQ29sb3JzJyBzaG91bGQgYmUgZWl0aGVyIGFuIGFycmF5IHNwZWNpZnlpbmcgY29sb3JzIG9yIGEgcGF0aCB0byBhIFRleHRNYXRlIHRoZW1lIGZpbGVcIiwgdGhlbWVMb2NhdGlvbi50b1N0cmluZygpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZW1hbnRpY1Rva2VuQ29sb3JzID0gY29udGVudFZhbHVlLnNlbWFudGljVG9rZW5Db2xvcnM7XG5cdFx0aWYgKHNlbWFudGljVG9rZW5Db2xvcnMgJiYgdHlwZW9mIHNlbWFudGljVG9rZW5Db2xvcnMgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBpbiBzZW1hbnRpY1Rva2VuQ29sb3JzKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgcnVsZSA9IHJlYWRTZW1hbnRpY1Rva2VuUnVsZShrZXksIHNlbWFudGljVG9rZW5Db2xvcnNba2V5XSk7XG5cdFx0XHRcdFx0aWYgKHJ1bGUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5zZW1hbnRpY1Rva2VuUnVsZXMucHVzaChydWxlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKG5scy5sb2NhbGl6ZSh7IGtleTogJ2Vycm9yLmludmFsaWRmb3JtYXQuc2VtYW50aWNUb2tlbkNvbG9ycycsIGNvbW1lbnQ6IFsnezB9IHdpbGwgYmUgcmVwbGFjZWQgYnkgYSBwYXRoLiBWYWx1ZXMgaW4gcXVvdGVzIHNob3VsZCBub3QgYmUgdHJhbnNsYXRlZC4nXSB9LCBcIlByb2JsZW0gcGFyc2luZyBjb2xvciB0aGVtZSBmaWxlOiB7MH0uIFByb3BlcnR5ICdzZW1hbnRpY1Rva2VuQ29sb3JzJyBjb250YWlucyBhIGludmFsaWQgc2VsZWN0b3JcIiwgdGhlbWVMb2NhdGlvbi50b1N0cmluZygpKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBfbG9hZFN5bnRheFRva2VucyhleHRlbnNpb25SZXNvdXJjZUxvYWRlclNlcnZpY2UsIHRoZW1lTG9jYXRpb24sIHJlc3VsdCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gX2xvYWRTeW50YXhUb2tlbnMoZXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uUmVzb3VyY2VMb2FkZXJTZXJ2aWNlLCB0aGVtZUxvY2F0aW9uOiBVUkksIHJlc3VsdDogeyB0ZXh0TWF0ZVJ1bGVzOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdOyBjb2xvcnM6IElDb2xvck1hcCB9KTogUHJvbWlzZTxhbnk+IHtcblx0cmV0dXJuIGV4dGVuc2lvblJlc291cmNlTG9hZGVyU2VydmljZS5yZWFkRXh0ZW5zaW9uUmVzb3VyY2UodGhlbWVMb2NhdGlvbikudGhlbihjb250ZW50ID0+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudFZhbHVlID0gcGFyc2VQTGlzdChjb250ZW50KTtcblx0XHRcdGNvbnN0IHNldHRpbmdzOiBJVGV4dE1hdGVUaGVtaW5nUnVsZVtdID0gY29udGVudFZhbHVlLnNldHRpbmdzO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KHNldHRpbmdzKSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZXJyb3IucGxpc3QuaW52YWxpZGZvcm1hdCcsIFwiUHJvYmxlbSBwYXJzaW5nIHRtVGhlbWUgZmlsZTogezB9LiAnc2V0dGluZ3MnIGlzIG5vdCBhcnJheS5cIikpKTtcblx0XHRcdH1cblx0XHRcdGNvbnZlcnRTZXR0aW5ncyhzZXR0aW5ncywgcmVzdWx0KTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihubHMubG9jYWxpemUoJ2Vycm9yLmNhbm5vdHBhcnNlJywgXCJQcm9ibGVtcyBwYXJzaW5nIHRtVGhlbWUgZmlsZTogezB9XCIsIGUubWVzc2FnZSkpKTtcblx0XHR9XG5cdH0sIGVycm9yID0+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZXJyb3IuY2Fubm90bG9hZCcsIFwiUHJvYmxlbXMgbG9hZGluZyB0bVRoZW1lIGZpbGUgezB9OiB7MX1cIiwgdGhlbWVMb2NhdGlvbi50b1N0cmluZygpLCBlcnJvci5tZXNzYWdlKSkpO1xuXHR9KTtcbn1cblxuY29uc3QgZGVmYXVsdFRoZW1lQ29sb3JzOiB7IFtiYXNlVGhlbWU6IHN0cmluZ106IElUZXh0TWF0ZVRoZW1pbmdSdWxlW10gfSA9IHtcblx0J2xpZ2h0JzogW1xuXHRcdHsgc2NvcGU6ICd0b2tlbi5pbmZvLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyMzMTZiY2QnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4ud2Fybi10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjY2Q5NzMxJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLmVycm9yLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyNjZDMxMzEnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4uZGVidWctdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnIzgwMDA4MCcgfSB9XG5cdF0sXG5cdCdkYXJrJzogW1xuXHRcdHsgc2NvcGU6ICd0b2tlbi5pbmZvLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyM2Nzk2ZTYnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4ud2Fybi10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjY2Q5NzMxJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLmVycm9yLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyNmNDQ3NDcnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4uZGVidWctdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnI2IyNjdlNicgfSB9XG5cdF0sXG5cdCdoY0xpZ2h0JzogW1xuXHRcdHsgc2NvcGU6ICd0b2tlbi5pbmZvLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyMzMTZiY2QnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4ud2Fybi10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjY2Q5NzMxJyB9IH0sXG5cdFx0eyBzY29wZTogJ3Rva2VuLmVycm9yLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyNjZDMxMzEnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4uZGVidWctdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnIzgwMDA4MCcgfSB9XG5cdF0sXG5cdCdoY0RhcmsnOiBbXG5cdFx0eyBzY29wZTogJ3Rva2VuLmluZm8tdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnIzY3OTZlNicgfSB9LFxuXHRcdHsgc2NvcGU6ICd0b2tlbi53YXJuLXRva2VuJywgc2V0dGluZ3M6IHsgZm9yZWdyb3VuZDogJyMwMDgwMDAnIH0gfSxcblx0XHR7IHNjb3BlOiAndG9rZW4uZXJyb3ItdG9rZW4nLCBzZXR0aW5nczogeyBmb3JlZ3JvdW5kOiAnI0ZGMDAwMCcgfSB9LFxuXHRcdHsgc2NvcGU6ICd0b2tlbi5kZWJ1Zy10b2tlbicsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICcjYjI2N2U2JyB9IH1cblx0XVxufTtcblxuY29uc3Qgbm9NYXRjaCA9IChfc2NvcGU6IFByb2JlU2NvcGUpID0+IC0xO1xuXG5mdW5jdGlvbiBuYW1lTWF0Y2hlcihpZGVudGlmaWVyczogc3RyaW5nW10sIHNjb3BlczogUHJvYmVTY29wZSk6IG51bWJlciB7XG5cdGlmIChzY29wZXMubGVuZ3RoIDwgaWRlbnRpZmllcnMubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0bGV0IHNjb3JlOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdGNvbnN0IGV2ZXJ5ID0gaWRlbnRpZmllcnMuZXZlcnkoKGlkZW50aWZpZXIpID0+IHtcblx0XHRmb3IgKGxldCBpID0gc2NvcGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRpZiAoc2NvcGVzQXJlTWF0Y2hpbmcoc2NvcGVzW2ldLCBpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRzY29yZSA9IChpICsgMSkgKiAweDEwMDAwICsgaWRlbnRpZmllci5sZW5ndGg7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH0pO1xuXHRyZXR1cm4gZXZlcnkgJiYgc2NvcmUgIT09IHVuZGVmaW5lZCA/IHNjb3JlIDogLTE7XG59XG5mdW5jdGlvbiBzY29wZXNBcmVNYXRjaGluZyh0aGlzU2NvcGVOYW1lOiBzdHJpbmcsIHNjb3BlTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmICghdGhpc1Njb3BlTmFtZSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAodGhpc1Njb3BlTmFtZSA9PT0gc2NvcGVOYW1lKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3QgbGVuID0gc2NvcGVOYW1lLmxlbmd0aDtcblx0cmV0dXJuIHRoaXNTY29wZU5hbWUubGVuZ3RoID4gbGVuICYmIHRoaXNTY29wZU5hbWUuc3Vic3RyKDAsIGxlbikgPT09IHNjb3BlTmFtZSAmJiB0aGlzU2NvcGVOYW1lW2xlbl0gPT09ICcuJztcbn1cblxuZnVuY3Rpb24gZ2V0U2NvcGVNYXRjaGVyKHJ1bGU6IElUZXh0TWF0ZVRoZW1pbmdSdWxlKTogTWF0Y2hlcjxQcm9iZVNjb3BlPiB7XG5cdGNvbnN0IHJ1bGVTY29wZSA9IHJ1bGUuc2NvcGU7XG5cdGlmICghcnVsZVNjb3BlIHx8ICFydWxlLnNldHRpbmdzKSB7XG5cdFx0cmV0dXJuIG5vTWF0Y2g7XG5cdH1cblx0Y29uc3QgbWF0Y2hlcnM6IE1hdGNoZXJXaXRoUHJpb3JpdHk8UHJvYmVTY29wZT5bXSA9IFtdO1xuXHRpZiAoQXJyYXkuaXNBcnJheShydWxlU2NvcGUpKSB7XG5cdFx0Zm9yIChjb25zdCBycyBvZiBydWxlU2NvcGUpIHtcblx0XHRcdGNyZWF0ZU1hdGNoZXJzKHJzLCBuYW1lTWF0Y2hlciwgbWF0Y2hlcnMpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHRjcmVhdGVNYXRjaGVycyhydWxlU2NvcGUsIG5hbWVNYXRjaGVyLCBtYXRjaGVycyk7XG5cdH1cblxuXHRpZiAobWF0Y2hlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIG5vTWF0Y2g7XG5cdH1cblx0cmV0dXJuIChzY29wZTogUHJvYmVTY29wZSkgPT4ge1xuXHRcdGxldCBtYXggPSBtYXRjaGVyc1swXS5tYXRjaGVyKHNjb3BlKTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IG1hdGNoZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRtYXggPSBNYXRoLm1heChtYXgsIG1hdGNoZXJzW2ldLm1hdGNoZXIoc2NvcGUpKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1heDtcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVhZFNlbWFudGljVG9rZW5SdWxlKHNlbGVjdG9yU3RyaW5nOiBzdHJpbmcsIHNldHRpbmdzOiBJU2VtYW50aWNUb2tlbkNvbG9yaXphdGlvblNldHRpbmcgfCBzdHJpbmcgfCBib29sZWFuIHwgdW5kZWZpbmVkKTogU2VtYW50aWNUb2tlblJ1bGUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzZWxlY3RvciA9IHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5wYXJzZVRva2VuU2VsZWN0b3Ioc2VsZWN0b3JTdHJpbmcpO1xuXHRsZXQgc3R5bGU6IFRva2VuU3R5bGUgfCB1bmRlZmluZWQ7XG5cdGlmICh0eXBlb2Ygc2V0dGluZ3MgPT09ICdzdHJpbmcnKSB7XG5cdFx0c3R5bGUgPSBUb2tlblN0eWxlLmZyb21TZXR0aW5ncyhzZXR0aW5ncywgdW5kZWZpbmVkKTtcblx0fSBlbHNlIGlmIChpc1NlbWFudGljVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nKHNldHRpbmdzKSkge1xuXHRcdHN0eWxlID0gVG9rZW5TdHlsZS5mcm9tU2V0dGluZ3Moc2V0dGluZ3MuZm9yZWdyb3VuZCwgc2V0dGluZ3MuZm9udFN0eWxlLCBzZXR0aW5ncy5ib2xkLCBzZXR0aW5ncy51bmRlcmxpbmUsIHNldHRpbmdzLnN0cmlrZXRocm91Z2gsIHNldHRpbmdzLml0YWxpYyk7XG5cdH1cblx0aWYgKHN0eWxlKSB7XG5cdFx0cmV0dXJuIHsgc2VsZWN0b3IsIHN0eWxlIH07XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNTZW1hbnRpY1Rva2VuQ29sb3JpemF0aW9uU2V0dGluZyhzdHlsZTogYW55KTogc3R5bGUgaXMgSVNlbWFudGljVG9rZW5Db2xvcml6YXRpb25TZXR0aW5nIHtcblx0cmV0dXJuIHN0eWxlICYmICh0eXBlcy5pc1N0cmluZyhzdHlsZS5mb3JlZ3JvdW5kKSB8fCB0eXBlcy5pc1N0cmluZyhzdHlsZS5mb250U3R5bGUpIHx8IHR5cGVzLmlzQm9vbGVhbihzdHlsZS5pdGFsaWMpXG5cdFx0fHwgdHlwZXMuaXNCb29sZWFuKHN0eWxlLnVuZGVybGluZSkgfHwgdHlwZXMuaXNCb29sZWFuKHN0eWxlLnN0cmlrZXRocm91Z2gpIHx8IHR5cGVzLmlzQm9vbGVhbihzdHlsZS5ib2xkKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5kTWV0YWRhdGEoY29sb3JUaGVtZURhdGE6IENvbG9yVGhlbWVEYXRhLCBjYXB0dXJlTmFtZXM6IHN0cmluZ1tdLCBsYW5ndWFnZUlkOiBudW1iZXIsIGJyYWNrZXQ6IGJvb2xlYW4pOiBudW1iZXIge1xuXHRsZXQgbWV0YWRhdGEgPSAwO1xuXG5cdG1ldGFkYXRhIHw9IChsYW5ndWFnZUlkIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKTtcblxuXHRjb25zdCBkZWZpbml0aW9uczogVGV4dE1hdGVUaGVtaW5nUnVsZURlZmluaXRpb25zID0ge307XG5cdGNvbnN0IHRva2VuU3R5bGUgPSBjb2xvclRoZW1lRGF0YS5yZXNvbHZlU2NvcGVzKFtjYXB0dXJlTmFtZXNdLCBkZWZpbml0aW9ucyk7XG5cblx0aWYgKGNhcHR1cmVOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0Y29uc3Qgc3RhbmRhcmRUb2tlbiA9IHRvU3RhbmRhcmRUb2tlblR5cGUoY2FwdHVyZU5hbWVzW2NhcHR1cmVOYW1lcy5sZW5ndGggLSAxXSk7XG5cdFx0bWV0YWRhdGEgfD0gKHN0YW5kYXJkVG9rZW4gPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpO1xuXHR9XG5cblx0Y29uc3QgZm9udFN0eWxlID0gZGVmaW5pdGlvbnMuZm9yZWdyb3VuZD8uc2V0dGluZ3MuZm9udFN0eWxlIHx8IGRlZmluaXRpb25zLmJvbGQ/LnNldHRpbmdzLmZvbnRTdHlsZTtcblx0aWYgKGZvbnRTdHlsZT8uaW5jbHVkZXMoJ2l0YWxpYycpKSB7XG5cdFx0bWV0YWRhdGEgfD0gRm9udFN0eWxlLkl0YWxpYyB8IE1ldGFkYXRhQ29uc3RzLklUQUxJQ19NQVNLO1xuXHR9XG5cdGlmIChmb250U3R5bGU/LmluY2x1ZGVzKCdib2xkJykpIHtcblx0XHRtZXRhZGF0YSB8PSBGb250U3R5bGUuQm9sZCB8IE1ldGFkYXRhQ29uc3RzLkJPTERfTUFTSztcblx0fVxuXHRpZiAoZm9udFN0eWxlPy5pbmNsdWRlcygndW5kZXJsaW5lJykpIHtcblx0XHRtZXRhZGF0YSB8PSBGb250U3R5bGUuVW5kZXJsaW5lIHwgTWV0YWRhdGFDb25zdHMuVU5ERVJMSU5FX01BU0s7XG5cdH1cblx0aWYgKGZvbnRTdHlsZT8uaW5jbHVkZXMoJ3N0cmlrZXRocm91Z2gnKSkge1xuXHRcdG1ldGFkYXRhIHw9IEZvbnRTdHlsZS5TdHJpa2V0aHJvdWdoIHwgTWV0YWRhdGFDb25zdHMuU1RSSUtFVEhST1VHSF9NQVNLO1xuXHR9XG5cblx0Y29uc3QgZm9yZWdyb3VuZCA9IHRva2VuU3R5bGU/LmZvcmVncm91bmQ7XG5cdGNvbnN0IHRva2VuU3R5bGVGb3JlZ3JvdW5kID0gKGZvcmVncm91bmQgIT09IHVuZGVmaW5lZCkgPyBjb2xvclRoZW1lRGF0YS5nZXRUb2tlbkNvbG9ySW5kZXgoKS5nZXQoZm9yZWdyb3VuZCkgOiBDb2xvcklkLkRlZmF1bHRGb3JlZ3JvdW5kO1xuXHRtZXRhZGF0YSB8PSB0b2tlblN0eWxlRm9yZWdyb3VuZCA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVDtcblxuXHRpZiAoYnJhY2tldCkge1xuXHRcdG1ldGFkYXRhIHw9IE1ldGFkYXRhQ29uc3RzLkJBTEFOQ0VEX0JSQUNLRVRTX01BU0s7XG5cdH1cblxuXHRyZXR1cm4gbWV0YWRhdGE7XG59XG5cbmNsYXNzIFRva2VuQ29sb3JJbmRleCB7XG5cblx0cHJpdmF0ZSBfbGFzdENvbG9ySWQ6IG51bWJlcjtcblx0cHJpdmF0ZSBfaWQyY29sb3I6IHN0cmluZ1tdO1xuXHRwcml2YXRlIF9jb2xvcjJpZDogeyBbY29sb3I6IHN0cmluZ106IG51bWJlciB9O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHRoaXMuX2xhc3RDb2xvcklkID0gMDtcblx0XHR0aGlzLl9pZDJjb2xvciA9IFtdO1xuXHRcdHRoaXMuX2NvbG9yMmlkID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBhZGQoY29sb3I6IHN0cmluZyB8IENvbG9yIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0XHRjb2xvciA9IG5vcm1hbGl6ZUNvbG9yKGNvbG9yKTtcblx0XHRpZiAoY29sb3IgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0bGV0IHZhbHVlID0gdGhpcy5fY29sb3IyaWRbY29sb3JdO1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHR2YWx1ZSA9ICsrdGhpcy5fbGFzdENvbG9ySWQ7XG5cdFx0dGhpcy5fY29sb3IyaWRbY29sb3JdID0gdmFsdWU7XG5cdFx0dGhpcy5faWQyY29sb3JbdmFsdWVdID0gY29sb3I7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHVibGljIGdldChjb2xvcjogc3RyaW5nIHwgQ29sb3IgfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRcdGNvbG9yID0gbm9ybWFsaXplQ29sb3IoY29sb3IpO1xuXHRcdGlmIChjb2xvciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9jb2xvcjJpZFtjb2xvcl07XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHRcdGNvbnNvbGUubG9nKGBDb2xvciAke2NvbG9yfSBub3QgaW4gaW5kZXguYCk7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRwdWJsaWMgYXNBcnJheSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2lkMmNvbG9yLnNsaWNlKDApO1xuXHR9XG59XG5cbmNsYXNzIFRva2VuRm9udEluZGV4IHtcblxuXHRwcml2YXRlIF9sYXN0Rm9udElkOiBudW1iZXI7XG5cdHByaXZhdGUgX2lkMmZvbnQ6IElGb250VG9rZW5PcHRpb25zW107XG5cdHByaXZhdGUgX2ZvbnQyaWQ6IE1hcDxJRm9udFRva2VuT3B0aW9ucywgbnVtYmVyPjtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHR0aGlzLl9sYXN0Rm9udElkID0gMDtcblx0XHR0aGlzLl9pZDJmb250ID0gW107XG5cdFx0dGhpcy5fZm9udDJpZCA9IG5ldyBNYXAoKTtcblx0fVxuXG5cdHB1YmxpYyBhZGQoZm9udEZhbWlseTogc3RyaW5nIHwgdW5kZWZpbmVkLCBmb250U2l6ZU11bHRpcGxpZXI6IG51bWJlciB8IHVuZGVmaW5lZCwgbGluZUhlaWdodE11bHRpcGxpZXI6IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZm9udDogSUZvbnRUb2tlbk9wdGlvbnMgPSB7IGZvbnRGYW1pbHksIGZvbnRTaXplTXVsdGlwbGllciwgbGluZUhlaWdodE11bHRpcGxpZXIgfTtcblx0XHRsZXQgdmFsdWUgPSB0aGlzLl9mb250MmlkLmdldChmb250KTtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdFx0dmFsdWUgPSArK3RoaXMuX2xhc3RGb250SWQ7XG5cdFx0dGhpcy5fZm9udDJpZC5zZXQoZm9udCwgdmFsdWUpO1xuXHRcdHRoaXMuX2lkMmZvbnRbdmFsdWVdID0gZm9udDtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KGZvbnQ6IElGb250VG9rZW5PcHRpb25zKTogbnVtYmVyIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX2ZvbnQyaWQuZ2V0KGZvbnQpO1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0XHRyZXR1cm4gMDtcblx0fVxuXG5cdHB1YmxpYyBhc0FycmF5KCk6IElGb250VG9rZW5PcHRpb25zW10ge1xuXHRcdHJldHVybiB0aGlzLl9pZDJmb250LnNsaWNlKDApO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNvbG9yKGNvbG9yOiBzdHJpbmcgfCBDb2xvciB8IHVuZGVmaW5lZCB8IG51bGwpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIWNvbG9yKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodHlwZW9mIGNvbG9yICE9PSAnc3RyaW5nJykge1xuXHRcdGNvbG9yID0gQ29sb3IuRm9ybWF0LkNTUy5mb3JtYXRIZXhBKGNvbG9yLCB0cnVlKTtcblx0fVxuXHRjb25zdCBsZW4gPSBjb2xvci5sZW5ndGg7XG5cdGlmIChjb2xvci5jaGFyQ29kZUF0KDApICE9PSBDaGFyQ29kZS5IYXNoIHx8IChsZW4gIT09IDQgJiYgbGVuICE9PSA1ICYmIGxlbiAhPT0gNyAmJiBsZW4gIT09IDkpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZXN1bHQgPSBbQ2hhckNvZGUuSGFzaF07XG5cblx0Zm9yIChsZXQgaSA9IDE7IGkgPCBsZW47IGkrKykge1xuXHRcdGNvbnN0IHVwcGVyID0gaGV4VXBwZXIoY29sb3IuY2hhckNvZGVBdChpKSk7XG5cdFx0aWYgKCF1cHBlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmVzdWx0LnB1c2godXBwZXIpO1xuXHRcdGlmIChsZW4gPT09IDQgfHwgbGVuID09PSA1KSB7XG5cdFx0XHRyZXN1bHQucHVzaCh1cHBlcik7XG5cdFx0fVxuXHR9XG5cblx0aWYgKHJlc3VsdC5sZW5ndGggPT09IDkgJiYgcmVzdWx0WzddID09PSBDaGFyQ29kZS5GICYmIHJlc3VsdFs4XSA9PT0gQ2hhckNvZGUuRikge1xuXHRcdHJlc3VsdC5sZW5ndGggPSA3O1xuXHR9XG5cdHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLnJlc3VsdCk7XG59XG5cbmZ1bmN0aW9uIGhleFVwcGVyKGNoYXJDb2RlOiBDaGFyQ29kZSk6IG51bWJlciB7XG5cdGlmIChjaGFyQ29kZSA+PSBDaGFyQ29kZS5EaWdpdDAgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUuRGlnaXQ5IHx8IGNoYXJDb2RlID49IENoYXJDb2RlLkEgJiYgY2hhckNvZGUgPD0gQ2hhckNvZGUuRikge1xuXHRcdHJldHVybiBjaGFyQ29kZTtcblx0fSBlbHNlIGlmIChjaGFyQ29kZSA+PSBDaGFyQ29kZS5hICYmIGNoYXJDb2RlIDw9IENoYXJDb2RlLmYpIHtcblx0XHRyZXR1cm4gY2hhckNvZGUgLSBDaGFyQ29kZS5hICsgQ2hhckNvZGUuQTtcblx0fVxuXHRyZXR1cm4gMDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksVUFBVTtBQUN0QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFrUyx5QkFBeUIsd0JBQXdCLGlCQUFpQiw0QkFBNEI7QUFDelksU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxTQUFTO0FBQ3JCLFlBQVksV0FBVztBQUN2QixZQUFZLGVBQWU7QUFDM0IsU0FBUyxjQUFjLHlCQUEwRCxrQkFBa0Isa0JBQWtCLGtDQUFrQztBQUN2SixTQUF5Qyw0QkFBNEI7QUFDckUsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxTQUFTLGtCQUFrQjtBQUNwQyxTQUFTLFlBQVksbUJBQStCLGdDQUFpRSw2QkFBNkI7QUFDbEosU0FBdUMsc0JBQXNCO0FBRTdELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBK0IscUJBQXFCO0FBRTdELFNBQVMsYUFBYSx5QkFBeUI7QUFDL0MsU0FBUyxTQUFTLFdBQVcsc0JBQXNCO0FBQ25ELFNBQVMsMkJBQTJCO0FBRXBDLE1BQU0sZ0JBQWdCLFNBQVMsR0FBbUIsd0JBQXdCLGlCQUFpQjtBQUUzRixNQUFNLDhCQUE4QiwrQkFBK0I7QUFFbkUsTUFBTSx3QkFBd0I7QUFBQSxFQUM3QixVQUFVLENBQUMsV0FBVyxnQ0FBZ0M7QUFBQSxFQUN0RCxTQUFTLENBQUMsVUFBVSx3QkFBd0I7QUFBQSxFQUM1QyxVQUFVLENBQUMsOEJBQThCLG1CQUFtQixXQUFXLGNBQWM7QUFBQSxFQUNyRixTQUFTLENBQUMsa0JBQWtCO0FBQUEsRUFDNUIsT0FBTyxDQUFDLG9CQUFvQixxQkFBcUIsZ0JBQWdCLGVBQWU7QUFBQSxFQUNoRixXQUFXLENBQUMsd0JBQXdCLGtCQUFrQjtBQUFBLEVBQ3RELFdBQVcsQ0FBQyxZQUFZLHNCQUFzQjtBQUMvQztBQVlPLE1BQU0sa0JBQU4sTUFBTSxnQkFBK0M7QUFBQTtBQUFBLEVBZ0NuRCxZQUFZLElBQVksT0FBZSxZQUFvQjtBQWZuRSxTQUFRLG1CQUEyQyxDQUFDO0FBQ3BELFNBQVEsb0JBQTRDLENBQUM7QUFDckQsU0FBUSxXQUFzQixDQUFDO0FBQy9CLFNBQVEsaUJBQXFDLENBQUM7QUFFOUMsU0FBUSxxQkFBMEMsQ0FBQztBQUNuRCxTQUFRLDJCQUFnRCxDQUFDO0FBS3pELFNBQVEsdUJBQTJEO0FBQ25FO0FBQUEsU0FBUSxrQkFBK0M7QUFDdkQ7QUFBQSxTQUFRLGlCQUE2QztBQUdwRCxTQUFLLEtBQUs7QUFDVixTQUFLLFFBQVE7QUFDYixTQUFLLGFBQWE7QUFDbEIsU0FBSyxXQUFXO0FBQUEsRUFDakI7QUFBQSxFQUVBLElBQUksdUJBQWdDO0FBQ25DLFFBQUksS0FBSywrQkFBK0IsUUFBVztBQUNsRCxhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsUUFBSSxLQUFLLHlDQUF5QyxRQUFXO0FBQzVELGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxXQUFPLENBQUMsQ0FBQyxLQUFLO0FBQUEsRUFDZjtBQUFBLEVBRUEsSUFBSSxjQUFzQztBQUN6QyxRQUFJLENBQUMsS0FBSyxzQkFBc0I7QUFlL0IsVUFBU0EsV0FBVCxTQUFpQixNQUE0QjtBQUM1QyxZQUFJLEtBQUssU0FBUyxLQUFLLFVBQVU7QUFDaEMsY0FBSSxLQUFLLFVBQVUsb0JBQW9CO0FBQ3RDLCtCQUFtQjtBQUFBLFVBQ3BCO0FBQ0EsZ0JBQU0sZUFBZSxLQUFLO0FBQzFCLGlCQUFPLEtBQUs7QUFBQSxZQUNYLE9BQU8sS0FBSztBQUFBLFlBQU8sVUFBVTtBQUFBLGNBQzVCLFlBQVksZUFBZSxhQUFhLFVBQVU7QUFBQSxjQUNsRCxZQUFZLGVBQWUsYUFBYSxVQUFVO0FBQUEsY0FDbEQsV0FBVyxhQUFhO0FBQUEsY0FDeEIsVUFBVSxhQUFhO0FBQUEsY0FDdkIsWUFBWSxhQUFhO0FBQUEsY0FDekIsWUFBWSxhQUFhO0FBQUEsWUFDMUI7QUFBQSxVQUNELENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQWpCUyxvQkFBQUE7QUFkVCxZQUFNLFNBQWlDLENBQUM7QUFHeEMsWUFBTSxhQUFhLEtBQUssU0FBUyxnQkFBZ0IsS0FBSyxLQUFLLFdBQVcsZ0JBQWdCO0FBQ3RGLFlBQU0sYUFBYSxLQUFLLFNBQVMsZ0JBQWdCLEtBQUssS0FBSyxXQUFXLGdCQUFnQjtBQUN0RixhQUFPLEtBQUs7QUFBQSxRQUNYLFVBQVU7QUFBQSxVQUNULFlBQVksZUFBZSxVQUFVO0FBQUEsVUFDckMsWUFBWSxlQUFlLFVBQVU7QUFBQSxRQUN0QztBQUFBLE1BQ0QsQ0FBQztBQUVELFVBQUksbUJBQW1CO0FBcUJ2QixXQUFLLGlCQUFpQixRQUFRQSxRQUFPO0FBR3JDLFdBQUssa0JBQWtCLFFBQVFBLFFBQU87QUFFdEMsVUFBSSxDQUFDLGtCQUFrQjtBQUN0QiwyQkFBbUIsS0FBSyxJQUFJLEVBQUUsUUFBUUEsUUFBTztBQUFBLE1BQzlDO0FBQ0EsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QjtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVPLFNBQVMsU0FBMEIsWUFBeUM7QUFDbEYsVUFBTSxjQUFjLEtBQUssZUFBZSxPQUFPO0FBQy9DLFFBQUksdUJBQXVCLE9BQU87QUFDakMsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLGdCQUFnQixRQUFXO0FBQzlCLFlBQU0sUUFBUSxLQUFLLFNBQVMsT0FBTztBQUNuQyxVQUFJLFVBQVUsUUFBVztBQUN4QixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxRQUFJLGVBQWUsT0FBTztBQUN6QixhQUFPLEtBQUssV0FBVyxPQUFPO0FBQUEsSUFDL0I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsY0FBYyxNQUFjLFdBQXFCLFVBQWtCLGFBQWEsTUFBTSxjQUFxQyxDQUFDLEdBQTJCO0FBQzlKLFVBQU0sU0FBYztBQUFBLE1BQ25CLFlBQVk7QUFBQSxNQUNaLE1BQU07QUFBQSxNQUNOLFdBQVc7QUFBQSxNQUNYLGVBQWU7QUFBQSxNQUNmLFFBQVE7QUFBQSxJQUNUO0FBQ0EsVUFBTSxRQUFRO0FBQUEsTUFDYixZQUFZO0FBQUEsTUFDWixNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxlQUFlO0FBQUEsTUFDZixRQUFRO0FBQUEsTUFDUixZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsSUFDYjtBQUVBLGFBQVMsY0FBYyxZQUFvQixPQUFtQixZQUFrQztBQUMvRixVQUFJLE1BQU0sY0FBYyxNQUFNLGNBQWMsWUFBWTtBQUN2RCxjQUFNLGFBQWE7QUFDbkIsZUFBTyxhQUFhLE1BQU07QUFDMUIsb0JBQVksYUFBYTtBQUFBLE1BQzFCO0FBQ0EsaUJBQVcsS0FBSyxDQUFDLFFBQVEsYUFBYSxpQkFBaUIsUUFBUSxHQUFHO0FBQ2pFLGNBQU0sV0FBVztBQUNqQixjQUFNLE9BQU8sTUFBTSxRQUFRO0FBQzNCLFlBQUksU0FBUyxRQUFXO0FBQ3ZCLGNBQUksTUFBTSxRQUFRLEtBQUssWUFBWTtBQUNsQyxrQkFBTSxRQUFRLElBQUk7QUFDbEIsbUJBQU8sUUFBUSxJQUFJO0FBQ25CLHdCQUFZLFFBQVEsSUFBSTtBQUFBLFVBQ3pCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsYUFBUywwQkFBMEIsTUFBeUI7QUFDM0QsWUFBTSxhQUFhLEtBQUssU0FBUyxNQUFNLE1BQU0sV0FBVyxRQUFRO0FBQ2hFLFVBQUksY0FBYyxHQUFHO0FBQ3BCLHNCQUFjLFlBQVksS0FBSyxPQUFPLElBQUk7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFFQSxTQUFLLG1CQUFtQixRQUFRLHlCQUF5QjtBQUN6RCxTQUFLLHlCQUF5QixRQUFRLHlCQUF5QjtBQUUvRCxRQUFJLDRCQUE0QjtBQUNoQyxlQUFXLEtBQUssT0FBTztBQUN0QixZQUFNLE1BQU07QUFDWixVQUFJLE1BQU0sR0FBRyxNQUFNLElBQUk7QUFDdEIsb0NBQTRCO0FBQUEsTUFDN0IsT0FBTztBQUNOLGNBQU0sR0FBRyxJQUFJLE9BQU87QUFBQSxNQUNyQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLDJCQUEyQjtBQUM5QixpQkFBVyxRQUFRLDRCQUE0Qiw0QkFBNEIsR0FBRztBQUM3RSxjQUFNLGFBQWEsS0FBSyxTQUFTLE1BQU0sTUFBTSxXQUFXLFFBQVE7QUFDaEUsWUFBSSxjQUFjLEdBQUc7QUFDcEIsY0FBSTtBQUNKLGNBQUksS0FBSyxTQUFTLGVBQWU7QUFDaEMsb0JBQVEsS0FBSyxjQUFjLEtBQUssU0FBUyxhQUFhO0FBQ3RELGdCQUFJLE9BQU87QUFDViw0QkFBYyxZQUFZLE9BQU8sS0FBSyxTQUFTLGFBQWE7QUFBQSxZQUM3RDtBQUFBLFVBQ0Q7QUFDQSxjQUFJLENBQUMsU0FBUyxlQUFlLE9BQU87QUFDbkMsa0JBQU0sa0JBQWtCLEtBQUssU0FBUyxLQUFLLElBQUk7QUFDL0Msb0JBQVEsS0FBSyx1QkFBdUIsZUFBZTtBQUNuRCxnQkFBSSxPQUFPO0FBQ1YsNEJBQWMsWUFBWSxPQUFPLGVBQWdCO0FBQUEsWUFDbEQ7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTyxXQUFXLFNBQVMsTUFBTTtBQUFBLEVBRWxDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyx1QkFBdUIsaUJBQXNFO0FBQ25HLFFBQUksb0JBQW9CLFFBQVc7QUFDbEMsYUFBTztBQUFBLElBQ1IsV0FBVyxPQUFPLG9CQUFvQixVQUFVO0FBQy9DLFlBQU0sRUFBRSxNQUFNLFdBQVcsU0FBUyxJQUFJLHNCQUFzQixpQkFBaUIsRUFBRTtBQUMvRSxhQUFPLEtBQUssY0FBYyxNQUFNLFdBQVcsUUFBUTtBQUFBLElBQ3BELFdBQVcsT0FBTyxvQkFBb0IsVUFBVTtBQUMvQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxxQkFBc0M7QUFFNUMsUUFBSSxDQUFDLEtBQUssaUJBQWlCO0FBQzFCLFlBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxXQUFLLFlBQVksUUFBUSxVQUFRO0FBQ2hDLGNBQU0sSUFBSSxLQUFLLFNBQVMsVUFBVTtBQUNsQyxjQUFNLElBQUksS0FBSyxTQUFTLFVBQVU7QUFBQSxNQUNuQyxDQUFDO0FBRUQsV0FBSyxtQkFBbUIsUUFBUSxPQUFLLE1BQU0sSUFBSSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBQ2xFLGtDQUE0Qiw0QkFBNEIsRUFBRSxRQUFRLE9BQUs7QUFDdEUsY0FBTSxlQUFlLEVBQUUsU0FBUyxLQUFLLElBQUk7QUFDekMsWUFBSSxnQkFBZ0IsT0FBTyxpQkFBaUIsVUFBVTtBQUNyRCxnQkFBTSxJQUFJLGFBQWEsVUFBVTtBQUFBLFFBQ2xDO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyx5QkFBeUIsUUFBUSxPQUFLLE1BQU0sSUFBSSxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRXhFLFdBQUssa0JBQWtCO0FBQUEsSUFDeEI7QUFDQSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFHTyxvQkFBb0M7QUFDMUMsUUFBSSxDQUFDLEtBQUssZ0JBQWdCO0FBQ3pCLFlBQU0sUUFBUSxJQUFJLGVBQWU7QUFDakMsV0FBSyxZQUFZLFFBQVEsT0FBSyxNQUFNLElBQUksRUFBRSxTQUFTLFlBQVksRUFBRSxTQUFTLFVBQVUsRUFBRSxTQUFTLFVBQVUsQ0FBQztBQUMxRyxXQUFLLGlCQUFpQjtBQUFBLElBQ3ZCO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBVyxnQkFBMEI7QUFDcEMsV0FBTyxLQUFLLG1CQUFtQixFQUFFLFFBQVE7QUFBQSxFQUMxQztBQUFBLEVBRUEsSUFBVyxlQUFvQztBQUM5QyxXQUFPLEtBQUssa0JBQWtCLEVBQUUsUUFBUTtBQUFBLEVBQ3pDO0FBQUEsRUFFTyxzQkFBc0Isa0JBQTBCLFdBQXFCLGlCQUF5QixhQUFhLE1BQU0sY0FBcUMsQ0FBQyxHQUE0QjtBQUN6TCxVQUFNLEVBQUUsTUFBTSxTQUFTLElBQUksc0JBQXNCLGtCQUFrQixlQUFlO0FBQ2xGLFVBQU0sUUFBUSxLQUFLLGNBQWMsTUFBTSxXQUFXLFVBQVUsWUFBWSxXQUFXO0FBQ25GLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsTUFDTixZQUFZLEtBQUssbUJBQW1CLEVBQUUsSUFBSSxNQUFNLFVBQVU7QUFBQSxNQUMxRCxNQUFNLE1BQU07QUFBQSxNQUNaLFdBQVcsTUFBTTtBQUFBLE1BQ2pCLGVBQWUsTUFBTTtBQUFBLE1BQ3JCLFFBQVEsTUFBTTtBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFTyx5QkFBeUIsTUFBMEQ7QUFDekYsUUFBSSxLQUFLLHlCQUF5QixRQUFRLElBQUksTUFBTSxJQUFJO0FBQ3ZELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFLLG1CQUFtQixRQUFRLElBQUksTUFBTSxJQUFJO0FBQ2pELGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFdBQVcsU0FBNkM7QUFDOUQsV0FBTyxjQUFjLG9CQUFvQixTQUFTLElBQUk7QUFBQSxFQUN2RDtBQUFBLEVBR08sY0FBYyxRQUFzQixhQUFzRTtBQUVoSCxRQUFJLENBQUMsS0FBSyx5QkFBeUI7QUFDbEMsV0FBSywwQkFBMEIsS0FBSyxpQkFBaUIsSUFBSSxlQUFlO0FBQUEsSUFDekU7QUFDQSxRQUFJLENBQUMsS0FBSywwQkFBMEI7QUFDbkMsV0FBSywyQkFBMkIsS0FBSyxrQkFBa0IsSUFBSSxlQUFlO0FBQUEsSUFDM0U7QUFFQSxlQUFXLFNBQVMsUUFBUTtBQVEzQixVQUFTQyxrQ0FBVCxTQUF3QyxlQUFzQyxjQUFzQztBQUNuSCxpQkFBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUM5QyxnQkFBTSxRQUFRLGNBQWMsQ0FBQyxFQUFFLEtBQUs7QUFDcEMsY0FBSSxTQUFTLEdBQUc7QUFDZixrQkFBTSxjQUFjLGFBQWEsQ0FBQztBQUNsQyxrQkFBTSxXQUFXLGFBQWEsQ0FBQyxFQUFFO0FBQ2pDLGdCQUFJLFNBQVMsbUJBQW1CLFNBQVMsWUFBWTtBQUNwRCwyQkFBYSxTQUFTO0FBQ3RCLGdDQUFrQjtBQUNsQixzQ0FBd0I7QUFBQSxZQUN6QjtBQUNBLGdCQUFJLFNBQVMsa0JBQWtCLE1BQU0sU0FBUyxTQUFTLFNBQVMsR0FBRztBQUNsRSwwQkFBWSxTQUFTO0FBQ3JCLCtCQUFpQjtBQUNqQixxQ0FBdUI7QUFBQSxZQUN4QjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQWxCUywyQ0FBQUE7QUFQVCxVQUFJLGFBQWlDO0FBQ3JDLFVBQUksWUFBZ0M7QUFDcEMsVUFBSSxrQkFBa0I7QUFDdEIsVUFBSSxpQkFBaUI7QUFDckIsVUFBSSx1QkFBeUQ7QUFDN0QsVUFBSSx3QkFBMEQ7QUFxQjlELE1BQUFBLGdDQUErQixLQUFLLHlCQUF5QixLQUFLLGdCQUFnQjtBQUNsRixNQUFBQSxnQ0FBK0IsS0FBSywwQkFBMEIsS0FBSyxpQkFBaUI7QUFDcEYsVUFBSSxlQUFlLFVBQWEsY0FBYyxRQUFXO0FBQ3hELFlBQUksYUFBYTtBQUNoQixzQkFBWSxhQUFhO0FBQ3pCLHNCQUFZLE9BQU8sWUFBWSxTQUFTLFlBQVksWUFBWSxZQUFZLGdCQUFnQjtBQUM1RixzQkFBWSxRQUFRO0FBQUEsUUFDckI7QUFFQSxlQUFPLFdBQVcsYUFBYSxZQUFZLFNBQVM7QUFBQSxNQUNyRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sUUFBUSxTQUFtQztBQUNqRCxVQUFNLGNBQWMsS0FBSyxlQUFlLE9BQU87QUFDL0MsUUFBSSx1QkFBdUIsT0FBTztBQUNqQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sZ0JBQWdCLFVBQWtELEtBQUssU0FBUyxlQUFlLE9BQU87QUFBQSxFQUM5RztBQUFBLEVBRU8sa0JBQWtCLFVBQThCO0FBQ3RELFNBQUssZ0JBQWdCLFNBQVMsbUJBQW1CO0FBQ2pELFNBQUsscUJBQXFCLFNBQVMsd0JBQXdCO0FBQzNELFNBQUssNkJBQTZCLFNBQVMsZ0NBQWdDO0FBQUEsRUFDNUU7QUFBQSxFQUVPLGdCQUFnQixRQUE4QjtBQUNwRCxTQUFLLGlCQUFpQixDQUFDO0FBQ3ZCLFNBQUssc0JBQXNCLE1BQU07QUFFakMsVUFBTSxzQkFBc0IsS0FBSyx1QkFBdUIsTUFBTTtBQUM5RCxRQUFJLE1BQU0sU0FBUyxtQkFBbUIsR0FBRztBQUN4QyxXQUFLLHNCQUFzQixtQkFBbUI7QUFBQSxJQUMvQztBQUVBLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssdUJBQXVCO0FBQzVCLFNBQUssMkJBQTJCO0FBQUEsRUFDakM7QUFBQSxFQUVRLHNCQUFzQixRQUE4QjtBQUMzRCxlQUFXLE1BQU0sUUFBUTtBQUN4QixZQUFNLFdBQVcsT0FBTyxFQUFFO0FBQzFCLFVBQUksYUFBYSw0QkFBNEI7QUFDNUMsYUFBSyxlQUFlLEVBQUUsSUFBSTtBQUFBLE1BQzNCLFdBQVcsT0FBTyxhQUFhLFVBQVU7QUFDeEMsYUFBSyxlQUFlLEVBQUUsSUFBSSxNQUFNLFFBQVEsUUFBUTtBQUFBLE1BQ2pEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLHFCQUFxQixtQkFBOEM7QUFDekUsU0FBSyxvQkFBb0IsQ0FBQztBQUMxQixTQUFLLHVDQUF1QztBQUc1QyxTQUFLLHFCQUFxQixpQkFBaUI7QUFHM0MsVUFBTSwyQkFBMkIsS0FBSyx1QkFBdUIsaUJBQWlCO0FBQzlFLFFBQUksTUFBTSxTQUFTLHdCQUF3QixHQUFHO0FBQzdDLFdBQUsscUJBQXFCLHdCQUF3QjtBQUFBLElBQ25EO0FBRUEsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxpQkFBaUI7QUFDdEIsU0FBSyx1QkFBdUI7QUFDNUIsU0FBSywyQkFBMkI7QUFBQSxFQUNqQztBQUFBLEVBRU8sNkJBQTZCLHFCQUFvRTtBQUN2RyxTQUFLLDJCQUEyQixDQUFDO0FBQ2pDLFNBQUssNkJBQTZCO0FBRWxDLFFBQUkscUJBQXFCO0FBQ3hCLFdBQUssNkJBQTZCLG9CQUFvQjtBQUN0RCxVQUFJLG9CQUFvQixPQUFPO0FBQzlCLGFBQUssdUJBQXVCLG9CQUFvQixLQUFLO0FBQUEsTUFDdEQ7QUFDQSxZQUFNLHNCQUFzQixLQUFLLHVCQUF1QixtQkFBbUI7QUFDM0UsVUFBSSxNQUFNLFNBQVMsbUJBQW1CLEdBQUc7QUFDeEMsWUFBSSxvQkFBb0IsWUFBWSxRQUFXO0FBQzlDLGVBQUssNkJBQTZCLG9CQUFvQjtBQUFBLFFBQ3ZEO0FBQ0EsWUFBSSxvQkFBb0IsT0FBTztBQUM5QixlQUFLLHVCQUF1QixvQkFBb0IsS0FBSztBQUFBLFFBQ3REO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFFTyxhQUFhLEtBQXNCO0FBQ3pDLFdBQU8sSUFBSSxPQUFPLENBQUMsTUFBTSwwQkFBMEIsSUFBSSxPQUFPLElBQUksU0FBUyxDQUFDLE1BQU07QUFBQSxFQUNuRjtBQUFBLEVBRU8sa0JBQWtCLFNBQTBCO0FBQ2xELFVBQU0sbUJBQW1CLFFBQVEsT0FBTyxDQUFDO0FBQ3pDLFVBQU0sa0JBQWtCLFFBQVEsT0FBTyxRQUFRLFNBQVMsQ0FBQztBQUN6RCxVQUFNLGdCQUFnQixRQUFRLE1BQU0sR0FBRyxFQUFFO0FBQ3pDLFVBQU0sZUFBZSxRQUFRLE1BQU0sR0FBRyxFQUFFO0FBQ3hDLFVBQU0sZ0JBQWdCLFFBQVEsTUFBTSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxLQUFLLGNBQ25CLEtBQUssV0FBVyxTQUFTLFlBQVksS0FBSyxxQkFBcUIsd0JBQXdCLG9CQUFvQix3QkFDM0csS0FBSyxXQUFXLFdBQVcsYUFBYSxLQUFLLG9CQUFvQix3QkFDakUsS0FBSyxXQUFXLFNBQVMsYUFBYSxLQUFLLHFCQUFxQjtBQUFBLEVBQ3RFO0FBQUEsRUFFTyx1QkFBdUIsUUFBOEU7QUFDM0csUUFBSTtBQUNKLGVBQVcsT0FBTyxRQUFRO0FBQ3pCLFlBQU0sZUFBZSxPQUFPLEdBQUc7QUFDL0IsVUFBSSxLQUFLLGFBQWEsR0FBRyxLQUFLLHdCQUF3QixVQUFVLENBQUMsTUFBTSxRQUFRLFlBQVksR0FBRztBQUM3RixjQUFNLGlCQUFpQixJQUFJLE1BQU0sZUFBZSxLQUFLLENBQUM7QUFDdEQsbUJBQVcsY0FBYyxnQkFBZ0I7QUFDeEMsZ0JBQU0sVUFBVSxXQUFXLFVBQVUsR0FBRyxXQUFXLFNBQVMsQ0FBQztBQUM3RCxjQUFJLEtBQUssa0JBQWtCLE9BQU8sR0FBRztBQUNwQyxnQkFBSSxDQUFDLHFCQUFxQjtBQUN6QixvQ0FBc0IsQ0FBQztBQUFBLFlBQ3hCO0FBQ0Esa0JBQU0sNEJBQTRCO0FBQ2xDLHVCQUFXLFVBQVUsMkJBQTJCO0FBQy9DLG9CQUFNLGlCQUFpQixvQkFBb0IsTUFBTTtBQUNqRCxvQkFBTSxpQkFBaUIsMEJBQTBCLE1BQU07QUFDdkQsa0JBQUksTUFBTSxRQUFRLGNBQWMsS0FBSyxNQUFNLFFBQVEsY0FBYyxHQUFHO0FBQ25FLG9DQUFvQixNQUFNLElBQUksZUFBZSxPQUFPLGNBQWM7QUFBQSxjQUNuRSxXQUFXLGdCQUFnQjtBQUMxQixvQ0FBb0IsTUFBTSxJQUFJO0FBQUEsY0FDL0I7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSx1QkFBdUIseUJBQThDO0FBQzVFLGVBQVcsT0FBTyx5QkFBeUI7QUFDMUMsVUFBSSxDQUFDLEtBQUssYUFBYSxHQUFHLEdBQUc7QUFDNUIsWUFBSTtBQUNILGdCQUFNLE9BQU8sc0JBQXNCLEtBQUssd0JBQXdCLEdBQUcsQ0FBQztBQUNwRSxjQUFJLE1BQU07QUFDVCxpQkFBSyx5QkFBeUIsS0FBSyxJQUFJO0FBQUEsVUFDeEM7QUFBQSxRQUNELFNBQVMsR0FBRztBQUFBLFFBRVo7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixtQkFBOEM7QUFHMUUsZUFBVyxjQUFjLHVCQUF1QjtBQUMvQyxZQUFNLFFBQTRDO0FBQ2xELFlBQU0sUUFBUSxrQkFBa0IsS0FBSztBQUNyQyxVQUFJLE9BQU87QUFDVixjQUFNLFdBQVcsT0FBTyxVQUFVLFdBQVcsRUFBRSxZQUFZLE1BQU0sSUFBSTtBQUNyRSxjQUFNLFNBQVMsc0JBQXNCLEtBQUs7QUFDMUMsbUJBQVcsU0FBUyxRQUFRO0FBQzNCLGVBQUssa0JBQWtCLEtBQUssRUFBRSxPQUFPLFNBQVMsQ0FBQztBQUFBLFFBQ2hEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLE1BQU0sUUFBUSxrQkFBa0IsYUFBYSxHQUFHO0FBQ25ELGlCQUFXLFFBQVEsa0JBQWtCLGVBQWU7QUFDbkQsWUFBSSxLQUFLLFNBQVMsS0FBSyxVQUFVO0FBQ2hDLGVBQUssa0JBQWtCLEtBQUssSUFBSTtBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLGtCQUFrQix5QkFBeUIsUUFBVztBQUN6RCxXQUFLLHVDQUF1QyxrQkFBa0I7QUFBQSxJQUMvRDtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGFBQWEsZ0NBQWdGO0FBQ25HLFdBQU8sQ0FBQyxLQUFLLFdBQVcsS0FBSyxLQUFLLDhCQUE4QixJQUFJLFFBQVEsUUFBUSxNQUFTO0FBQUEsRUFDOUY7QUFBQSxFQUVPLE9BQU8sZ0NBQWdGO0FBQzdGLFdBQU8sS0FBSyxLQUFLLDhCQUE4QjtBQUFBLEVBQ2hEO0FBQUEsRUFFUSxLQUFLLGdDQUFnRjtBQUM1RixRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CLGFBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxJQUNqQztBQUNBLFNBQUssbUJBQW1CLENBQUM7QUFDekIsU0FBSyxZQUFZO0FBRWpCLFVBQU0sU0FBUztBQUFBLE1BQ2QsUUFBUSxDQUFDO0FBQUEsTUFDVCxlQUFlLENBQUM7QUFBQSxNQUNoQixvQkFBb0IsQ0FBQztBQUFBLE1BQ3JCLHNCQUFzQjtBQUFBLElBQ3ZCO0FBQ0EsV0FBTyxnQkFBZ0IsZ0NBQWdDLEtBQUssVUFBVSxNQUFNLEVBQUUsS0FBSyxPQUFLO0FBQ3ZGLFdBQUssV0FBVztBQUNoQixXQUFLLHFCQUFxQixPQUFPO0FBQ2pDLFdBQUssV0FBVyxPQUFPO0FBQ3ZCLFdBQUssbUJBQW1CLE9BQU87QUFDL0IsV0FBSyw0QkFBNEIsT0FBTztBQUFBLElBQ3pDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxjQUFjO0FBQ3BCLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssdUJBQXVCO0FBQzVCLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssMkJBQTJCO0FBQUEsRUFDakM7QUFBQSxFQUVBLFVBQVUsZ0JBQWlDO0FBQzFDLFVBQU0sZUFBMEMsQ0FBQztBQUNqRCxlQUFXLE9BQU8sS0FBSyxVQUFVO0FBQ2hDLG1CQUFhLEdBQUcsSUFBSSxNQUFNLE9BQU8sSUFBSSxXQUFXLEtBQUssU0FBUyxHQUFHLEdBQUcsSUFBSTtBQUFBLElBQ3pFO0FBRUEsVUFBTSxRQUFRLEtBQUssVUFBVTtBQUFBLE1BQzVCLElBQUksS0FBSztBQUFBLE1BQ1QsT0FBTyxLQUFLO0FBQUEsTUFDWixZQUFZLEtBQUs7QUFBQSxNQUNqQixrQkFBa0IsS0FBSyxpQkFBaUIsSUFBSSxTQUFPLEVBQUUsVUFBVSxHQUFHLFVBQVUsT0FBTyxHQUFHLE1BQU0sRUFBRTtBQUFBO0FBQUEsTUFDOUYsb0JBQW9CLEtBQUssbUJBQW1CLElBQUksa0JBQWtCLFlBQVk7QUFBQSxNQUM5RSxlQUFlLGNBQWMsYUFBYSxLQUFLLGFBQWE7QUFBQSxNQUM1RCwyQkFBMkIsS0FBSztBQUFBLE1BQ2hDLFVBQVU7QUFBQSxNQUNWLE9BQU8sS0FBSztBQUFBLElBQ2IsQ0FBQztBQUdELG1CQUFlLE1BQU0sZ0JBQWUsYUFBYSxPQUFPLGFBQWEsU0FBUyxjQUFjLElBQUk7QUFBQSxFQUNqRztBQUFBLEVBRUEsSUFBSSxvQkFBdUM7QUFDMUMsV0FBTyxLQUFLLFdBQVcsQ0FBQztBQUFBLEVBQ3pCO0FBQUEsRUFFQSxJQUFJLGFBQXVCO0FBQzFCLFdBQU8sS0FBSyxHQUFHLE1BQU0sR0FBRztBQUFBLEVBQ3pCO0FBQUEsRUFFQSxJQUFJLE9BQW9CO0FBQ3ZCLFlBQVEsS0FBSyxtQkFBbUI7QUFBQSxNQUMvQixLQUFLLGtCQUFrQjtBQUFJLGVBQU8sWUFBWTtBQUFBLE1BQzlDLEtBQUssa0JBQWtCO0FBQVUsZUFBTyxZQUFZO0FBQUEsTUFDcEQsS0FBSyxrQkFBa0I7QUFBVSxlQUFPLFlBQVk7QUFBQSxNQUNwRDtBQUFTLGVBQU8sWUFBWTtBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFJQSxPQUFPLGdDQUFnQyxXQUF3QixVQUFxRDtBQUNuSCxXQUFPLGdCQUFlLG9CQUFvQixxQkFBcUIsU0FBUyxHQUFHLFFBQVE7QUFBQSxFQUNwRjtBQUFBLEVBRUEsT0FBTyxvQkFBb0IsSUFBWSxVQUFxRDtBQUMzRixVQUFNLFlBQVksSUFBSSxnQkFBZSxJQUFJLElBQUksT0FBTyxFQUFFO0FBQ3RELGNBQVUsV0FBVztBQUNyQixjQUFVLG1CQUFtQixDQUFDO0FBQzlCLGNBQVUsUUFBUTtBQUNsQixRQUFJLFVBQVU7QUFDYixpQkFBV0MsT0FBTSxVQUFVO0FBQzFCLGtCQUFVLFNBQVNBLEdBQUUsSUFBSSxNQUFNLFFBQVEsU0FBU0EsR0FBRSxDQUFDO0FBQUEsTUFDcEQ7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE9BQU8sdUJBQXVCLElBQVksWUFBb0M7QUFDN0UsVUFBTSxZQUFZLElBQUksZ0JBQWUsSUFBSSxJQUFJLFVBQVU7QUFDdkQsY0FBVSxXQUFXO0FBQ3JCLGNBQVUsbUJBQW1CLENBQUM7QUFDOUIsY0FBVSxRQUFRO0FBQ2xCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFPLGdCQUFnQixnQkFBNkQ7QUFDbkYsVUFBTSxRQUFRLGVBQWUsSUFBSSxnQkFBZSxhQUFhLGFBQWEsT0FBTztBQUNqRixRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUNILFlBQU0sT0FBTyxLQUFLLE1BQU0sS0FBSztBQUM3QixZQUFNLFFBQVEsSUFBSSxnQkFBZSxJQUFJLElBQUksRUFBRTtBQUMzQyxpQkFBVyxPQUFPLE1BQU07QUFDdkIsZ0JBQVEsS0FBSztBQUFBLFVBQ1osS0FBSyxZQUFZO0FBQ2hCLGtCQUFNLGVBQWUsS0FBSyxHQUFHO0FBQzdCLHVCQUFXLE1BQU0sY0FBYztBQUM5QixvQkFBTSxTQUFTLEVBQUUsSUFBSSxNQUFNLFFBQVEsYUFBYSxFQUFFLENBQUM7QUFBQSxZQUNwRDtBQUNBO0FBQUEsVUFDRDtBQUFBLFVBQ0EsS0FBSztBQUFBLFVBQ0wsS0FBSztBQUFBLFVBQU0sS0FBSztBQUFBLFVBQVMsS0FBSztBQUFBLFVBQWMsS0FBSztBQUFBLFVBQVMsS0FBSztBQUU5RCxZQUFDLE1BQWMsR0FBRyxJQUFJLEtBQUssR0FBRztBQUM5QjtBQUFBLFVBQ0QsS0FBSyxzQkFBc0I7QUFDMUIsa0JBQU0sWUFBWSxLQUFLLEdBQUc7QUFDMUIsZ0JBQUksTUFBTSxRQUFRLFNBQVMsR0FBRztBQUM3Qix5QkFBVyxLQUFLLFdBQVc7QUFDMUIsc0JBQU0sT0FBTyxrQkFBa0IsZUFBZSw2QkFBNkIsQ0FBQztBQUM1RSxvQkFBSSxNQUFNO0FBQ1Qsd0JBQU0sbUJBQW1CLEtBQUssSUFBSTtBQUFBLGdCQUNuQztBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQ0E7QUFBQSxVQUNEO0FBQUEsVUFDQSxLQUFLO0FBRUo7QUFBQSxVQUNELEtBQUs7QUFDSixrQkFBTSxnQkFBZ0IsY0FBYyxlQUFlLEtBQUssYUFBYTtBQUNyRTtBQUFBLFFBQ0Y7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLE1BQU0sTUFBTSxDQUFDLE1BQU0sWUFBWTtBQUNuQyxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSLFNBQVMsR0FBRztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBTyxtQkFBbUIsT0FBNkIsb0JBQXlCLGVBQThDO0FBQzdILFVBQU0sWUFBb0IsTUFBTSxTQUFTLEtBQUs7QUFDOUMsVUFBTSxnQkFBZ0IsY0FBYyxjQUFjLGFBQWEsTUFBTSxJQUFJO0FBQ3pFLFVBQU0sS0FBSyxHQUFHLFNBQVMsSUFBSSxhQUFhO0FBQ3hDLFVBQU0sUUFBUSxNQUFNLFNBQVMsU0FBUyxNQUFNLElBQUk7QUFDaEQsVUFBTSxhQUFhLE1BQU0sTUFBTTtBQUMvQixVQUFNLFlBQVksSUFBSSxnQkFBZSxJQUFJLE9BQU8sVUFBVTtBQUMxRCxjQUFVLGNBQWMsTUFBTTtBQUM5QixjQUFVLFFBQVEsTUFBTSxXQUFXO0FBQ25DLGNBQVUsV0FBVztBQUNyQixjQUFVLGdCQUFnQjtBQUMxQixjQUFVLFdBQVc7QUFDckIsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWxxQmEsZ0JBRUksY0FBYztBQUZ4QixJQUFNLGlCQUFOO0FBb3FCUCxTQUFTLGNBQWMsYUFBcUIsTUFBYztBQUN6RCxNQUFJLEtBQUssV0FBVyxJQUFJLEdBQUc7QUFDMUIsV0FBTyxLQUFLLE9BQU8sQ0FBQztBQUFBLEVBQ3JCO0FBQ0EsTUFBSSxNQUFNLEdBQUcsV0FBVyxJQUFJLElBQUk7QUFHaEMsUUFBTSxJQUFJLFFBQVEsbUJBQW1CLEdBQUc7QUFDeEMsTUFBSSxJQUFJLE9BQU8sQ0FBQyxFQUFFLE1BQU0sUUFBUSxHQUFHO0FBQ2xDLFVBQU0sTUFBTTtBQUFBLEVBQ2I7QUFDQSxTQUFPO0FBQ1I7QUFFQSxlQUFlLGdCQUFnQixnQ0FBaUUsZUFBb0IsUUFBNEo7QUFDL1EsTUFBSSxVQUFVLFFBQVEsYUFBYSxNQUFNLFNBQVM7QUFDakQsVUFBTSxVQUFVLE1BQU0sK0JBQStCLHNCQUFzQixhQUFhO0FBQ3hGLFVBQU0sU0FBNEIsQ0FBQztBQUNuQyxVQUFNLGVBQWUsS0FBSyxNQUFNLFNBQVMsTUFBTTtBQUMvQyxRQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLGFBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxJQUFJLFNBQVMseUJBQXlCLHlDQUF5QyxPQUFPLElBQUksT0FBSyxxQkFBcUIsRUFBRSxLQUFLLENBQUMsRUFBRSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUMzSyxXQUFXLEtBQUssWUFBWSxZQUFZLE1BQU0sVUFBVTtBQUN2RCxhQUFPLFFBQVEsT0FBTyxJQUFJLE1BQU0sSUFBSSxTQUFTLHVCQUF1QixzREFBc0QsQ0FBQyxDQUFDO0FBQUEsSUFDN0g7QUFDQSxRQUFJLGFBQWEsU0FBUztBQUN6QixZQUFNLGdCQUFnQixnQ0FBZ0MsVUFBVSxTQUFTLFVBQVUsUUFBUSxhQUFhLEdBQUcsYUFBYSxPQUFPLEdBQUcsTUFBTTtBQUFBLElBQ3pJO0FBQ0EsUUFBSSxNQUFNLFFBQVEsYUFBYSxRQUFRLEdBQUc7QUFDekMsc0JBQWdCLGFBQWEsVUFBVSxNQUFNO0FBQzdDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyx1QkFBdUIsT0FBTyx3QkFBd0IsYUFBYTtBQUMxRSxVQUFNLFNBQVMsYUFBYTtBQUM1QixRQUFJLFFBQVE7QUFDWCxVQUFJLE9BQU8sV0FBVyxVQUFVO0FBQy9CLGVBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxJQUFJLFNBQVMsRUFBRSxLQUFLLDhCQUE4QixTQUFTLENBQUMsNEVBQTRFLEVBQUUsR0FBRyxxRkFBcUYsY0FBYyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDN1I7QUFFQSxpQkFBVyxXQUFXLFFBQVE7QUFDN0IsY0FBTSxXQUFXLE9BQU8sT0FBTztBQUMvQixZQUFJLGFBQWEsNEJBQTRCO0FBQzVDLGlCQUFPLE9BQU8sT0FBTyxPQUFPO0FBQUEsUUFDN0IsV0FBVyxPQUFPLGFBQWEsVUFBVTtBQUN4QyxpQkFBTyxPQUFPLE9BQU8sSUFBSSxNQUFNLFFBQVEsT0FBTyxPQUFPLENBQUM7QUFBQSxRQUN2RDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSxjQUFjLGFBQWE7QUFDakMsUUFBSSxhQUFhO0FBQ2hCLFVBQUksTUFBTSxRQUFRLFdBQVcsR0FBRztBQUMvQixlQUFPLGNBQWMsS0FBSyxHQUFHLFdBQVc7QUFBQSxNQUN6QyxXQUFXLE9BQU8sZ0JBQWdCLFVBQVU7QUFDM0MsY0FBTSxrQkFBa0IsZ0NBQWdDLFVBQVUsU0FBUyxVQUFVLFFBQVEsYUFBYSxHQUFHLFdBQVcsR0FBRyxNQUFNO0FBQUEsTUFDbEksT0FBTztBQUNOLGVBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxJQUFJLFNBQVMsRUFBRSxLQUFLLG1DQUFtQyxTQUFTLENBQUMsNEVBQTRFLEVBQUUsR0FBRyxnSkFBZ0osY0FBYyxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDN1Y7QUFBQSxJQUNEO0FBQ0EsVUFBTSxzQkFBc0IsYUFBYTtBQUN6QyxRQUFJLHVCQUF1QixPQUFPLHdCQUF3QixVQUFVO0FBQ25FLGlCQUFXLE9BQU8scUJBQXFCO0FBQ3RDLFlBQUk7QUFDSCxnQkFBTSxPQUFPLHNCQUFzQixLQUFLLG9CQUFvQixHQUFHLENBQUM7QUFDaEUsY0FBSSxNQUFNO0FBQ1QsbUJBQU8sbUJBQW1CLEtBQUssSUFBSTtBQUFBLFVBQ3BDO0FBQUEsUUFDRCxTQUFTLEdBQUc7QUFDWCxpQkFBTyxRQUFRLE9BQU8sSUFBSSxNQUFNLElBQUksU0FBUyxFQUFFLEtBQUssMkNBQTJDLFNBQVMsQ0FBQyw0RUFBNEUsRUFBRSxHQUFHLHFHQUFxRyxjQUFjLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFBQSxRQUMxVDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxPQUFPO0FBQ04sV0FBTyxrQkFBa0IsZ0NBQWdDLGVBQWUsTUFBTTtBQUFBLEVBQy9FO0FBQ0Q7QUFFQSxTQUFTLGtCQUFrQixnQ0FBaUUsZUFBb0IsUUFBb0Y7QUFDbk0sU0FBTywrQkFBK0Isc0JBQXNCLGFBQWEsRUFBRSxLQUFLLGFBQVc7QUFDMUYsUUFBSTtBQUNILFlBQU0sZUFBZSxXQUFXLE9BQU87QUFDdkMsWUFBTSxXQUFtQyxhQUFhO0FBQ3RELFVBQUksQ0FBQyxNQUFNLFFBQVEsUUFBUSxHQUFHO0FBQzdCLGVBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxJQUFJLFNBQVMsNkJBQTZCLDZEQUE2RCxDQUFDLENBQUM7QUFBQSxNQUMxSTtBQUNBLHNCQUFnQixVQUFVLE1BQU07QUFDaEMsYUFBTyxRQUFRLFFBQVEsSUFBSTtBQUFBLElBQzVCLFNBQVMsR0FBRztBQUNYLGFBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxJQUFJLFNBQVMscUJBQXFCLHNDQUFzQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDcEg7QUFBQSxFQUNELEdBQUcsV0FBUztBQUNYLFdBQU8sUUFBUSxPQUFPLElBQUksTUFBTSxJQUFJLFNBQVMsb0JBQW9CLDBDQUEwQyxjQUFjLFNBQVMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxDQUFDO0FBQUEsRUFDckosQ0FBQztBQUNGO0FBRUEsTUFBTSxxQkFBc0U7QUFBQSxFQUMzRSxTQUFTO0FBQUEsSUFDUixFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxvQkFBb0IsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDakUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNsRSxFQUFFLE9BQU8scUJBQXFCLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLEVBQ25FO0FBQUEsRUFDQSxRQUFRO0FBQUEsSUFDUCxFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxvQkFBb0IsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDakUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNsRSxFQUFFLE9BQU8scUJBQXFCLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLEVBQ25FO0FBQUEsRUFDQSxXQUFXO0FBQUEsSUFDVixFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxvQkFBb0IsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDakUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNsRSxFQUFFLE9BQU8scUJBQXFCLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLEVBQ25FO0FBQUEsRUFDQSxVQUFVO0FBQUEsSUFDVCxFQUFFLE9BQU8sb0JBQW9CLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLElBQ2pFLEVBQUUsT0FBTyxvQkFBb0IsVUFBVSxFQUFFLFlBQVksVUFBVSxFQUFFO0FBQUEsSUFDakUsRUFBRSxPQUFPLHFCQUFxQixVQUFVLEVBQUUsWUFBWSxVQUFVLEVBQUU7QUFBQSxJQUNsRSxFQUFFLE9BQU8scUJBQXFCLFVBQVUsRUFBRSxZQUFZLFVBQVUsRUFBRTtBQUFBLEVBQ25FO0FBQ0Q7QUFFQSxNQUFNLFVBQVUsQ0FBQyxXQUF1QjtBQUV4QyxTQUFTLFlBQVksYUFBdUIsUUFBNEI7QUFDdkUsTUFBSSxPQUFPLFNBQVMsWUFBWSxRQUFRO0FBQ3ZDLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxRQUE0QjtBQUNoQyxRQUFNLFFBQVEsWUFBWSxNQUFNLENBQUMsZUFBZTtBQUMvQyxhQUFTLElBQUksT0FBTyxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDNUMsVUFBSSxrQkFBa0IsT0FBTyxDQUFDLEdBQUcsVUFBVSxHQUFHO0FBQzdDLGlCQUFTLElBQUksS0FBSyxRQUFVLFdBQVc7QUFDdkMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1IsQ0FBQztBQUNELFNBQU8sU0FBUyxVQUFVLFNBQVksUUFBUTtBQUMvQztBQUNBLFNBQVMsa0JBQWtCLGVBQXVCLFdBQTRCO0FBQzdFLE1BQUksQ0FBQyxlQUFlO0FBQ25CLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxrQkFBa0IsV0FBVztBQUNoQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sTUFBTSxVQUFVO0FBQ3RCLFNBQU8sY0FBYyxTQUFTLE9BQU8sY0FBYyxPQUFPLEdBQUcsR0FBRyxNQUFNLGFBQWEsY0FBYyxHQUFHLE1BQU07QUFDM0c7QUFFQSxTQUFTLGdCQUFnQixNQUFpRDtBQUN6RSxRQUFNLFlBQVksS0FBSztBQUN2QixNQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssVUFBVTtBQUNqQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sV0FBOEMsQ0FBQztBQUNyRCxNQUFJLE1BQU0sUUFBUSxTQUFTLEdBQUc7QUFDN0IsZUFBVyxNQUFNLFdBQVc7QUFDM0IscUJBQWUsSUFBSSxhQUFhLFFBQVE7QUFBQSxJQUN6QztBQUFBLEVBQ0QsT0FBTztBQUNOLG1CQUFlLFdBQVcsYUFBYSxRQUFRO0FBQUEsRUFDaEQ7QUFFQSxNQUFJLFNBQVMsV0FBVyxHQUFHO0FBQzFCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxDQUFDLFVBQXNCO0FBQzdCLFFBQUksTUFBTSxTQUFTLENBQUMsRUFBRSxRQUFRLEtBQUs7QUFDbkMsYUFBUyxJQUFJLEdBQUcsSUFBSSxTQUFTLFFBQVEsS0FBSztBQUN6QyxZQUFNLEtBQUssSUFBSSxLQUFLLFNBQVMsQ0FBQyxFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQUEsSUFDL0M7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsU0FBUyxzQkFBc0IsZ0JBQXdCLFVBQTJHO0FBQ2pLLFFBQU0sV0FBVyw0QkFBNEIsbUJBQW1CLGNBQWM7QUFDOUUsTUFBSTtBQUNKLE1BQUksT0FBTyxhQUFhLFVBQVU7QUFDakMsWUFBUSxXQUFXLGFBQWEsVUFBVSxNQUFTO0FBQUEsRUFDcEQsV0FBVyxtQ0FBbUMsUUFBUSxHQUFHO0FBQ3hELFlBQVEsV0FBVyxhQUFhLFNBQVMsWUFBWSxTQUFTLFdBQVcsU0FBUyxNQUFNLFNBQVMsV0FBVyxTQUFTLGVBQWUsU0FBUyxNQUFNO0FBQUEsRUFDcEo7QUFDQSxNQUFJLE9BQU87QUFDVixXQUFPLEVBQUUsVUFBVSxNQUFNO0FBQUEsRUFDMUI7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLG1DQUFtQyxPQUF3RDtBQUNuRyxTQUFPLFVBQVUsTUFBTSxTQUFTLE1BQU0sVUFBVSxLQUFLLE1BQU0sU0FBUyxNQUFNLFNBQVMsS0FBSyxNQUFNLFVBQVUsTUFBTSxNQUFNLEtBQ2hILE1BQU0sVUFBVSxNQUFNLFNBQVMsS0FBSyxNQUFNLFVBQVUsTUFBTSxhQUFhLEtBQUssTUFBTSxVQUFVLE1BQU0sSUFBSTtBQUMzRztBQUVPLFNBQVMsYUFBYSxnQkFBZ0MsY0FBd0IsWUFBb0IsU0FBMEI7QUFDbEksTUFBSSxXQUFXO0FBRWYsY0FBYSxjQUFjLGVBQWU7QUFFMUMsUUFBTSxjQUE4QyxDQUFDO0FBQ3JELFFBQU0sYUFBYSxlQUFlLGNBQWMsQ0FBQyxZQUFZLEdBQUcsV0FBVztBQUUzRSxNQUFJLGFBQWEsU0FBUyxHQUFHO0FBQzVCLFVBQU0sZ0JBQWdCLG9CQUFvQixhQUFhLGFBQWEsU0FBUyxDQUFDLENBQUM7QUFDL0UsZ0JBQWEsaUJBQWlCLGVBQWU7QUFBQSxFQUM5QztBQUVBLFFBQU0sWUFBWSxZQUFZLFlBQVksU0FBUyxhQUFhLFlBQVksTUFBTSxTQUFTO0FBQzNGLE1BQUksV0FBVyxTQUFTLFFBQVEsR0FBRztBQUNsQyxnQkFBWSxVQUFVLFNBQVMsZUFBZTtBQUFBLEVBQy9DO0FBQ0EsTUFBSSxXQUFXLFNBQVMsTUFBTSxHQUFHO0FBQ2hDLGdCQUFZLFVBQVUsT0FBTyxlQUFlO0FBQUEsRUFDN0M7QUFDQSxNQUFJLFdBQVcsU0FBUyxXQUFXLEdBQUc7QUFDckMsZ0JBQVksVUFBVSxZQUFZLGVBQWU7QUFBQSxFQUNsRDtBQUNBLE1BQUksV0FBVyxTQUFTLGVBQWUsR0FBRztBQUN6QyxnQkFBWSxVQUFVLGdCQUFnQixlQUFlO0FBQUEsRUFDdEQ7QUFFQSxRQUFNLGFBQWEsWUFBWTtBQUMvQixRQUFNLHVCQUF3QixlQUFlLFNBQWEsZUFBZSxtQkFBbUIsRUFBRSxJQUFJLFVBQVUsSUFBSSxRQUFRO0FBQ3hILGNBQVksd0JBQXdCLGVBQWU7QUFFbkQsTUFBSSxTQUFTO0FBQ1osZ0JBQVksZUFBZTtBQUFBLEVBQzVCO0FBRUEsU0FBTztBQUNSO0FBRUEsTUFBTSxnQkFBZ0I7QUFBQSxFQU1yQixjQUFjO0FBQ2IsU0FBSyxlQUFlO0FBQ3BCLFNBQUssWUFBWSxDQUFDO0FBQ2xCLFNBQUssWUFBWSx1QkFBTyxPQUFPLElBQUk7QUFBQSxFQUNwQztBQUFBLEVBRU8sSUFBSSxPQUEyQztBQUNyRCxZQUFRLGVBQWUsS0FBSztBQUM1QixRQUFJLFVBQVUsUUFBVztBQUN4QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksUUFBUSxLQUFLLFVBQVUsS0FBSztBQUNoQyxRQUFJLE9BQU87QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFlBQVEsRUFBRSxLQUFLO0FBQ2YsU0FBSyxVQUFVLEtBQUssSUFBSTtBQUN4QixTQUFLLFVBQVUsS0FBSyxJQUFJO0FBQ3hCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxJQUFJLE9BQTJDO0FBQ3JELFlBQVEsZUFBZSxLQUFLO0FBQzVCLFFBQUksVUFBVSxRQUFXO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUssVUFBVSxLQUFLO0FBQ2xDLFFBQUksT0FBTztBQUNWLGFBQU87QUFBQSxJQUNSO0FBQ0EsWUFBUSxJQUFJLFNBQVMsS0FBSyxnQkFBZ0I7QUFDMUMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLFVBQW9CO0FBQzFCLFdBQU8sS0FBSyxVQUFVLE1BQU0sQ0FBQztBQUFBLEVBQzlCO0FBQ0Q7QUFFQSxNQUFNLGVBQWU7QUFBQSxFQU1wQixjQUFjO0FBQ2IsU0FBSyxjQUFjO0FBQ25CLFNBQUssV0FBVyxDQUFDO0FBQ2pCLFNBQUssV0FBVyxvQkFBSSxJQUFJO0FBQUEsRUFDekI7QUFBQSxFQUVPLElBQUksWUFBZ0Msb0JBQXdDLHNCQUFrRDtBQUNwSSxVQUFNLE9BQTBCLEVBQUUsWUFBWSxvQkFBb0IscUJBQXFCO0FBQ3ZGLFFBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxJQUFJO0FBQ2xDLFFBQUksT0FBTztBQUNWLGFBQU87QUFBQSxJQUNSO0FBQ0EsWUFBUSxFQUFFLEtBQUs7QUFDZixTQUFLLFNBQVMsSUFBSSxNQUFNLEtBQUs7QUFDN0IsU0FBSyxTQUFTLEtBQUssSUFBSTtBQUN2QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sSUFBSSxNQUFpQztBQUMzQyxVQUFNLFFBQVEsS0FBSyxTQUFTLElBQUksSUFBSTtBQUNwQyxRQUFJLE9BQU87QUFDVixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxVQUErQjtBQUNyQyxXQUFPLEtBQUssU0FBUyxNQUFNLENBQUM7QUFBQSxFQUM3QjtBQUNEO0FBRUEsU0FBUyxlQUFlLE9BQThEO0FBQ3JGLE1BQUksQ0FBQyxPQUFPO0FBQ1gsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFlBQVEsTUFBTSxPQUFPLElBQUksV0FBVyxPQUFPLElBQUk7QUFBQSxFQUNoRDtBQUNBLFFBQU0sTUFBTSxNQUFNO0FBQ2xCLE1BQUksTUFBTSxXQUFXLENBQUMsTUFBTSxTQUFTLFFBQVMsUUFBUSxLQUFLLFFBQVEsS0FBSyxRQUFRLEtBQUssUUFBUSxHQUFJO0FBQ2hHLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxTQUFTLENBQUMsU0FBUyxJQUFJO0FBRTdCLFdBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxLQUFLO0FBQzdCLFVBQU0sUUFBUSxTQUFTLE1BQU0sV0FBVyxDQUFDLENBQUM7QUFDMUMsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxLQUFLO0FBQ2pCLFFBQUksUUFBUSxLQUFLLFFBQVEsR0FBRztBQUMzQixhQUFPLEtBQUssS0FBSztBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUVBLE1BQUksT0FBTyxXQUFXLEtBQUssT0FBTyxDQUFDLE1BQU0sU0FBUyxLQUFLLE9BQU8sQ0FBQyxNQUFNLFNBQVMsR0FBRztBQUNoRixXQUFPLFNBQVM7QUFBQSxFQUNqQjtBQUNBLFNBQU8sT0FBTyxhQUFhLEdBQUcsTUFBTTtBQUNyQztBQUVBLFNBQVMsU0FBUyxVQUE0QjtBQUM3QyxNQUFJLFlBQVksU0FBUyxVQUFVLFlBQVksU0FBUyxVQUFVLFlBQVksU0FBUyxLQUFLLFlBQVksU0FBUyxHQUFHO0FBQ25ILFdBQU87QUFBQSxFQUNSLFdBQVcsWUFBWSxTQUFTLEtBQUssWUFBWSxTQUFTLEdBQUc7QUFDNUQsV0FBTyxXQUFXLFNBQVMsSUFBSSxTQUFTO0FBQUEsRUFDekM7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbImFkZFJ1bGUiLCAiZmluZFRva2VuU3R5bGVGb3JTY29wZUluU2NvcGVzIiwgImlkIl0KfQo=
