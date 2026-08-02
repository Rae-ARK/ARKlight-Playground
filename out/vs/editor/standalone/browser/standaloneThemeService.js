import * as dom from "../../../base/browser/dom.js";
import * as domStylesheetsJs from "../../../base/browser/domStylesheets.js";
import { addMatchMediaChangeListener } from "../../../base/browser/browser.js";
import { Color } from "../../../base/common/color.js";
import { Emitter } from "../../../base/common/event.js";
import { TokenizationRegistry } from "../../common/languages.js";
import { FontStyle, TokenMetadata } from "../../common/encodedTokenAttributes.js";
import { TokenTheme, generateTokensCSSForColorMap } from "../../common/languages/supports/tokenization.js";
import { hc_black, hc_light, vs, vs_dark } from "../common/themes.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { asCssVariableName, Extensions } from "../../../platform/theme/common/colorRegistry.js";
import { Extensions as ThemingExtensions } from "../../../platform/theme/common/themeService.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ColorScheme, isDark, isHighContrast } from "../../../platform/theme/common/theme.js";
import { getIconsStyleSheet, UnthemedProductIconTheme } from "../../../platform/theme/browser/iconsStyleSheet.js";
import { mainWindow } from "../../../base/browser/window.js";
const VS_LIGHT_THEME_NAME = "vs";
const VS_DARK_THEME_NAME = "vs-dark";
const HC_BLACK_THEME_NAME = "hc-black";
const HC_LIGHT_THEME_NAME = "hc-light";
const colorRegistry = Registry.as(Extensions.ColorContribution);
const themingRegistry = Registry.as(ThemingExtensions.ThemingContribution);
class StandaloneTheme {
  constructor(name, standaloneThemeData) {
    this.semanticHighlighting = false;
    this.themeData = standaloneThemeData;
    const base = standaloneThemeData.base;
    if (name.length > 0) {
      if (isBuiltinTheme(name)) {
        this.id = name;
      } else {
        this.id = base + " " + name;
      }
      this.themeName = name;
    } else {
      this.id = base;
      this.themeName = base;
    }
    this.colors = null;
    this.defaultColors = /* @__PURE__ */ Object.create(null);
    this._tokenTheme = null;
  }
  get label() {
    return this.themeName;
  }
  get base() {
    return this.themeData.base;
  }
  notifyBaseUpdated() {
    if (this.themeData.inherit) {
      this.colors = null;
      this._tokenTheme = null;
    }
  }
  getColors() {
    if (!this.colors) {
      const colors = /* @__PURE__ */ new Map();
      for (const id in this.themeData.colors) {
        colors.set(id, Color.fromHex(this.themeData.colors[id]));
      }
      if (this.themeData.inherit) {
        const baseData = getBuiltinRules(this.themeData.base);
        for (const id in baseData.colors) {
          if (!colors.has(id)) {
            colors.set(id, Color.fromHex(baseData.colors[id]));
          }
        }
      }
      this.colors = colors;
    }
    return this.colors;
  }
  getColor(colorId, useDefault) {
    const color = this.getColors().get(colorId);
    if (color) {
      return color;
    }
    if (useDefault !== false) {
      return this.getDefault(colorId);
    }
    return void 0;
  }
  getDefault(colorId) {
    let color = this.defaultColors[colorId];
    if (color) {
      return color;
    }
    color = colorRegistry.resolveDefaultColor(colorId, this);
    this.defaultColors[colorId] = color;
    return color;
  }
  defines(colorId) {
    return this.getColors().has(colorId);
  }
  get type() {
    switch (this.base) {
      case VS_LIGHT_THEME_NAME:
        return ColorScheme.LIGHT;
      case HC_BLACK_THEME_NAME:
        return ColorScheme.HIGH_CONTRAST_DARK;
      case HC_LIGHT_THEME_NAME:
        return ColorScheme.HIGH_CONTRAST_LIGHT;
      default:
        return ColorScheme.DARK;
    }
  }
  get tokenTheme() {
    if (!this._tokenTheme) {
      let rules = [];
      let encodedTokensColors = [];
      if (this.themeData.inherit) {
        const baseData = getBuiltinRules(this.themeData.base);
        rules = baseData.rules;
        if (baseData.encodedTokensColors) {
          encodedTokensColors = baseData.encodedTokensColors;
        }
      }
      const editorForeground = this.themeData.colors["editor.foreground"];
      const editorBackground = this.themeData.colors["editor.background"];
      if (editorForeground || editorBackground) {
        const rule = { token: "" };
        if (editorForeground) {
          rule.foreground = editorForeground;
        }
        if (editorBackground) {
          rule.background = editorBackground;
        }
        rules.push(rule);
      }
      rules = rules.concat(this.themeData.rules);
      if (this.themeData.encodedTokensColors) {
        encodedTokensColors = this.themeData.encodedTokensColors;
      }
      this._tokenTheme = TokenTheme.createFromRawTokenTheme(rules, encodedTokensColors);
    }
    return this._tokenTheme;
  }
  getTokenStyleMetadata(type, modifiers, modelLanguage) {
    const style = this.tokenTheme._match([type].concat(modifiers).join("."));
    const metadata = style.metadata;
    const foreground = TokenMetadata.getForeground(metadata);
    const fontStyle = TokenMetadata.getFontStyle(metadata);
    return {
      foreground,
      italic: Boolean(fontStyle & FontStyle.Italic),
      bold: Boolean(fontStyle & FontStyle.Bold),
      underline: Boolean(fontStyle & FontStyle.Underline),
      strikethrough: Boolean(fontStyle & FontStyle.Strikethrough)
    };
  }
  get tokenColorMap() {
    return [];
  }
  get tokenFontMap() {
    return [];
  }
}
function isBuiltinTheme(themeName) {
  return themeName === VS_LIGHT_THEME_NAME || themeName === VS_DARK_THEME_NAME || themeName === HC_BLACK_THEME_NAME || themeName === HC_LIGHT_THEME_NAME;
}
function getBuiltinRules(builtinTheme) {
  switch (builtinTheme) {
    case VS_LIGHT_THEME_NAME:
      return vs;
    case VS_DARK_THEME_NAME:
      return vs_dark;
    case HC_BLACK_THEME_NAME:
      return hc_black;
    case HC_LIGHT_THEME_NAME:
      return hc_light;
  }
}
function newBuiltInTheme(builtinTheme) {
  const themeData = getBuiltinRules(builtinTheme);
  return new StandaloneTheme(builtinTheme, themeData);
}
class StandaloneThemeService extends Disposable {
  constructor() {
    super();
    this._onColorThemeChange = this._register(new Emitter());
    this.onDidColorThemeChange = this._onColorThemeChange.event;
    this._onFileIconThemeChange = this._register(new Emitter());
    this.onDidFileIconThemeChange = this._onFileIconThemeChange.event;
    this._onProductIconThemeChange = this._register(new Emitter());
    this.onDidProductIconThemeChange = this._onProductIconThemeChange.event;
    this._environment = /* @__PURE__ */ Object.create(null);
    this._builtInProductIconTheme = new UnthemedProductIconTheme();
    this._autoDetectHighContrast = true;
    this._knownThemes = /* @__PURE__ */ new Map();
    this._knownThemes.set(VS_LIGHT_THEME_NAME, newBuiltInTheme(VS_LIGHT_THEME_NAME));
    this._knownThemes.set(VS_DARK_THEME_NAME, newBuiltInTheme(VS_DARK_THEME_NAME));
    this._knownThemes.set(HC_BLACK_THEME_NAME, newBuiltInTheme(HC_BLACK_THEME_NAME));
    this._knownThemes.set(HC_LIGHT_THEME_NAME, newBuiltInTheme(HC_LIGHT_THEME_NAME));
    const iconsStyleSheet = this._register(getIconsStyleSheet(this));
    this._codiconCSS = iconsStyleSheet.getCSS();
    this._themeCSS = "";
    this._allCSS = `${this._codiconCSS}
${this._themeCSS}`;
    this._globalStyleElement = null;
    this._styleElements = [];
    this._colorMapOverride = null;
    this.setTheme(VS_LIGHT_THEME_NAME);
    this._onOSSchemeChanged();
    this._register(iconsStyleSheet.onDidChange(() => {
      this._codiconCSS = iconsStyleSheet.getCSS();
      this._updateCSS();
    }));
    addMatchMediaChangeListener(mainWindow, "(forced-colors: active)", () => {
      this._onOSSchemeChanged();
    });
  }
  registerEditorContainer(domNode) {
    if (dom.isInShadowDOM(domNode)) {
      return this._registerShadowDomContainer(domNode);
    }
    return this._registerRegularEditorContainer();
  }
  _registerRegularEditorContainer() {
    if (!this._globalStyleElement) {
      this._globalStyleElement = domStylesheetsJs.createStyleSheet(void 0, (style) => {
        style.className = "monaco-colors";
        style.textContent = this._allCSS;
      });
      this._styleElements.push(this._globalStyleElement);
    }
    return Disposable.None;
  }
  _registerShadowDomContainer(domNode) {
    const styleElement = domStylesheetsJs.createStyleSheet(domNode, (style) => {
      style.className = "monaco-colors";
      style.textContent = this._allCSS;
    });
    this._styleElements.push(styleElement);
    return {
      dispose: () => {
        for (let i = 0; i < this._styleElements.length; i++) {
          if (this._styleElements[i] === styleElement) {
            this._styleElements.splice(i, 1);
            return;
          }
        }
      }
    };
  }
  defineTheme(themeName, themeData) {
    if (!/^[a-z0-9\-]+$/i.test(themeName)) {
      throw new Error("Illegal theme name!");
    }
    if (!isBuiltinTheme(themeData.base) && !isBuiltinTheme(themeName)) {
      throw new Error("Illegal theme base!");
    }
    this._knownThemes.set(themeName, new StandaloneTheme(themeName, themeData));
    if (isBuiltinTheme(themeName)) {
      this._knownThemes.forEach((theme) => {
        if (theme.base === themeName) {
          theme.notifyBaseUpdated();
        }
      });
    }
    if (this._theme.themeName === themeName) {
      this.setTheme(themeName);
    }
  }
  getColorTheme() {
    return this._theme;
  }
  setColorMapOverride(colorMapOverride) {
    this._colorMapOverride = colorMapOverride;
    this._updateThemeOrColorMap();
  }
  setTheme(themeName) {
    let theme;
    if (this._knownThemes.has(themeName)) {
      theme = this._knownThemes.get(themeName);
    } else {
      theme = this._knownThemes.get(VS_LIGHT_THEME_NAME);
    }
    this._updateActualTheme(theme);
  }
  _updateActualTheme(desiredTheme) {
    if (!desiredTheme || this._theme === desiredTheme) {
      return;
    }
    this._theme = desiredTheme;
    this._updateThemeOrColorMap();
  }
  _onOSSchemeChanged() {
    if (this._autoDetectHighContrast) {
      const wantsHighContrast = mainWindow.matchMedia(`(forced-colors: active)`).matches;
      if (wantsHighContrast !== isHighContrast(this._theme.type)) {
        let newThemeName;
        if (isDark(this._theme.type)) {
          newThemeName = wantsHighContrast ? HC_BLACK_THEME_NAME : VS_DARK_THEME_NAME;
        } else {
          newThemeName = wantsHighContrast ? HC_LIGHT_THEME_NAME : VS_LIGHT_THEME_NAME;
        }
        this._updateActualTheme(this._knownThemes.get(newThemeName));
      }
    }
  }
  setAutoDetectHighContrast(autoDetectHighContrast) {
    this._autoDetectHighContrast = autoDetectHighContrast;
    this._onOSSchemeChanged();
  }
  _updateThemeOrColorMap() {
    const cssRules = [];
    const hasRule = {};
    const ruleCollector = {
      addRule: (rule) => {
        if (!hasRule[rule]) {
          cssRules.push(rule);
          hasRule[rule] = true;
        }
      }
    };
    themingRegistry.getThemingParticipants().forEach((p) => p(this._theme, ruleCollector, this._environment));
    const colorVariables = [];
    for (const item of colorRegistry.getColors()) {
      const color = this._theme.getColor(item.id, true);
      if (color) {
        colorVariables.push(`${asCssVariableName(item.id)}: ${color.toString()};`);
      }
    }
    ruleCollector.addRule(`.monaco-editor, .monaco-diff-editor, .monaco-component { ${colorVariables.join("\n")} }`);
    const colorMap = this._colorMapOverride || this._theme.tokenTheme.getColorMap();
    ruleCollector.addRule(generateTokensCSSForColorMap(colorMap));
    ruleCollector.addRule(`.monaco-editor, .monaco-diff-editor, .monaco-component { forced-color-adjust: none; }`);
    this._themeCSS = cssRules.join("\n");
    this._updateCSS();
    TokenizationRegistry.setColorMap(colorMap);
    this._onColorThemeChange.fire(this._theme);
  }
  _updateCSS() {
    this._allCSS = `${this._codiconCSS}
${this._themeCSS}`;
    this._styleElements.forEach((styleElement) => styleElement.textContent = this._allCSS);
  }
  getFileIconTheme() {
    return {
      hasFileIcons: false,
      hasFolderIcons: false,
      hidesExplorerArrows: false
    };
  }
  getProductIconTheme() {
    return this._builtInProductIconTheme;
  }
}
export {
  HC_BLACK_THEME_NAME,
  HC_LIGHT_THEME_NAME,
  StandaloneThemeService,
  VS_DARK_THEME_NAME,
  VS_LIGHT_THEME_NAME
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9zdGFuZGFsb25lL2Jyb3dzZXIvc3RhbmRhbG9uZVRoZW1lU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzSnMgZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IGFkZE1hdGNoTWVkaWFDaGFuZ2VMaXN0ZW5lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFRva2VuaXphdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBGb250U3R5bGUsIFRva2VuTWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJVG9rZW5UaGVtZVJ1bGUsIFRva2VuVGhlbWUsIGdlbmVyYXRlVG9rZW5zQ1NTRm9yQ29sb3JNYXAgfSBmcm9tICcuLi8uLi9jb21tb24vbGFuZ3VhZ2VzL3N1cHBvcnRzL3Rva2VuaXphdGlvbi5qcyc7XG5pbXBvcnQgeyBCdWlsdGluVGhlbWUsIElTdGFuZGFsb25lVGhlbWUsIElTdGFuZGFsb25lVGhlbWVEYXRhLCBJU3RhbmRhbG9uZVRoZW1lU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zdGFuZGFsb25lVGhlbWUuanMnO1xuaW1wb3J0IHsgaGNfYmxhY2ssIGhjX2xpZ2h0LCB2cywgdnNfZGFyayB9IGZyb20gJy4uL2NvbW1vbi90aGVtZXMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlTmFtZSwgQ29sb3JJZGVudGlmaWVyLCBFeHRlbnNpb25zLCBJQ29sb3JSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgVGhlbWluZ0V4dGVuc2lvbnMsIElDc3NTdHlsZUNvbGxlY3RvciwgSUZpbGVJY29uVGhlbWUsIElQcm9kdWN0SWNvblRoZW1lLCBJVGhlbWluZ1JlZ2lzdHJ5LCBJVG9rZW5TdHlsZSwgSUZvbnRUb2tlbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lLCBpc0RhcmssIGlzSGlnaENvbnRyYXN0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGdldEljb25zU3R5bGVTaGVldCwgVW50aGVtZWRQcm9kdWN0SWNvblRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9pY29uc1N0eWxlU2hlZXQuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuXG5leHBvcnQgY29uc3QgVlNfTElHSFRfVEhFTUVfTkFNRSA9ICd2cyc7XG5leHBvcnQgY29uc3QgVlNfREFSS19USEVNRV9OQU1FID0gJ3ZzLWRhcmsnO1xuZXhwb3J0IGNvbnN0IEhDX0JMQUNLX1RIRU1FX05BTUUgPSAnaGMtYmxhY2snO1xuZXhwb3J0IGNvbnN0IEhDX0xJR0hUX1RIRU1FX05BTUUgPSAnaGMtbGlnaHQnO1xuXG5jb25zdCBjb2xvclJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbG9yUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29sb3JDb250cmlidXRpb24pO1xuY29uc3QgdGhlbWluZ1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVRoZW1pbmdSZWdpc3RyeT4oVGhlbWluZ0V4dGVuc2lvbnMuVGhlbWluZ0NvbnRyaWJ1dGlvbik7XG5cbmNsYXNzIFN0YW5kYWxvbmVUaGVtZSBpbXBsZW1lbnRzIElTdGFuZGFsb25lVGhlbWUge1xuXG5cdHB1YmxpYyByZWFkb25seSBpZDogc3RyaW5nO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGhlbWVOYW1lOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0aGVtZURhdGE6IElTdGFuZGFsb25lVGhlbWVEYXRhO1xuXHRwcml2YXRlIGNvbG9yczogTWFwPHN0cmluZywgQ29sb3I+IHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0Q29sb3JzOiB7IFtjb2xvcklkOiBzdHJpbmddOiBDb2xvciB8IHVuZGVmaW5lZCB9O1xuXHRwcml2YXRlIF90b2tlblRoZW1lOiBUb2tlblRoZW1lIHwgbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihuYW1lOiBzdHJpbmcsIHN0YW5kYWxvbmVUaGVtZURhdGE6IElTdGFuZGFsb25lVGhlbWVEYXRhKSB7XG5cdFx0dGhpcy50aGVtZURhdGEgPSBzdGFuZGFsb25lVGhlbWVEYXRhO1xuXHRcdGNvbnN0IGJhc2UgPSBzdGFuZGFsb25lVGhlbWVEYXRhLmJhc2U7XG5cdFx0aWYgKG5hbWUubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKGlzQnVpbHRpblRoZW1lKG5hbWUpKSB7XG5cdFx0XHRcdHRoaXMuaWQgPSBuYW1lO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5pZCA9IGJhc2UgKyAnICcgKyBuYW1lO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50aGVtZU5hbWUgPSBuYW1lO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmlkID0gYmFzZTtcblx0XHRcdHRoaXMudGhlbWVOYW1lID0gYmFzZTtcblx0XHR9XG5cdFx0dGhpcy5jb2xvcnMgPSBudWxsO1xuXHRcdHRoaXMuZGVmYXVsdENvbG9ycyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5fdG9rZW5UaGVtZSA9IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudGhlbWVOYW1lO1xuXHR9XG5cblx0cHVibGljIGdldCBiYXNlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMudGhlbWVEYXRhLmJhc2U7XG5cdH1cblxuXHRwdWJsaWMgbm90aWZ5QmFzZVVwZGF0ZWQoKSB7XG5cdFx0aWYgKHRoaXMudGhlbWVEYXRhLmluaGVyaXQpIHtcblx0XHRcdHRoaXMuY29sb3JzID0gbnVsbDtcblx0XHRcdHRoaXMuX3Rva2VuVGhlbWUgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29sb3JzKCk6IE1hcDxzdHJpbmcsIENvbG9yPiB7XG5cdFx0aWYgKCF0aGlzLmNvbG9ycykge1xuXHRcdFx0Y29uc3QgY29sb3JzID0gbmV3IE1hcDxzdHJpbmcsIENvbG9yPigpO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBpbiB0aGlzLnRoZW1lRGF0YS5jb2xvcnMpIHtcblx0XHRcdFx0Y29sb3JzLnNldChpZCwgQ29sb3IuZnJvbUhleCh0aGlzLnRoZW1lRGF0YS5jb2xvcnNbaWRdKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy50aGVtZURhdGEuaW5oZXJpdCkge1xuXHRcdFx0XHRjb25zdCBiYXNlRGF0YSA9IGdldEJ1aWx0aW5SdWxlcyh0aGlzLnRoZW1lRGF0YS5iYXNlKTtcblx0XHRcdFx0Zm9yIChjb25zdCBpZCBpbiBiYXNlRGF0YS5jb2xvcnMpIHtcblx0XHRcdFx0XHRpZiAoIWNvbG9ycy5oYXMoaWQpKSB7XG5cdFx0XHRcdFx0XHRjb2xvcnMuc2V0KGlkLCBDb2xvci5mcm9tSGV4KGJhc2VEYXRhLmNvbG9yc1tpZF0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuY29sb3JzID0gY29sb3JzO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jb2xvcnM7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29sb3IoY29sb3JJZDogQ29sb3JJZGVudGlmaWVyLCB1c2VEZWZhdWx0PzogYm9vbGVhbik6IENvbG9yIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb2xvciA9IHRoaXMuZ2V0Q29sb3JzKCkuZ2V0KGNvbG9ySWQpO1xuXHRcdGlmIChjb2xvcikge1xuXHRcdFx0cmV0dXJuIGNvbG9yO1xuXHRcdH1cblx0XHRpZiAodXNlRGVmYXVsdCAhPT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLmdldERlZmF1bHQoY29sb3JJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldERlZmF1bHQoY29sb3JJZDogQ29sb3JJZGVudGlmaWVyKTogQ29sb3IgfCB1bmRlZmluZWQge1xuXHRcdGxldCBjb2xvciA9IHRoaXMuZGVmYXVsdENvbG9yc1tjb2xvcklkXTtcblx0XHRpZiAoY29sb3IpIHtcblx0XHRcdHJldHVybiBjb2xvcjtcblx0XHR9XG5cdFx0Y29sb3IgPSBjb2xvclJlZ2lzdHJ5LnJlc29sdmVEZWZhdWx0Q29sb3IoY29sb3JJZCwgdGhpcyk7XG5cdFx0dGhpcy5kZWZhdWx0Q29sb3JzW2NvbG9ySWRdID0gY29sb3I7XG5cdFx0cmV0dXJuIGNvbG9yO1xuXHR9XG5cblx0cHVibGljIGRlZmluZXMoY29sb3JJZDogQ29sb3JJZGVudGlmaWVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q29sb3JzKCkuaGFzKGNvbG9ySWQpO1xuXHR9XG5cblx0cHVibGljIGdldCB0eXBlKCk6IENvbG9yU2NoZW1lIHtcblx0XHRzd2l0Y2ggKHRoaXMuYmFzZSkge1xuXHRcdFx0Y2FzZSBWU19MSUdIVF9USEVNRV9OQU1FOiByZXR1cm4gQ29sb3JTY2hlbWUuTElHSFQ7XG5cdFx0XHRjYXNlIEhDX0JMQUNLX1RIRU1FX05BTUU6IHJldHVybiBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0RBUks7XG5cdFx0XHRjYXNlIEhDX0xJR0hUX1RIRU1FX05BTUU6IHJldHVybiBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0xJR0hUO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIENvbG9yU2NoZW1lLkRBUks7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCB0b2tlblRoZW1lKCk6IFRva2VuVGhlbWUge1xuXHRcdGlmICghdGhpcy5fdG9rZW5UaGVtZSkge1xuXHRcdFx0bGV0IHJ1bGVzOiBJVG9rZW5UaGVtZVJ1bGVbXSA9IFtdO1xuXHRcdFx0bGV0IGVuY29kZWRUb2tlbnNDb2xvcnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRpZiAodGhpcy50aGVtZURhdGEuaW5oZXJpdCkge1xuXHRcdFx0XHRjb25zdCBiYXNlRGF0YSA9IGdldEJ1aWx0aW5SdWxlcyh0aGlzLnRoZW1lRGF0YS5iYXNlKTtcblx0XHRcdFx0cnVsZXMgPSBiYXNlRGF0YS5ydWxlcztcblx0XHRcdFx0aWYgKGJhc2VEYXRhLmVuY29kZWRUb2tlbnNDb2xvcnMpIHtcblx0XHRcdFx0XHRlbmNvZGVkVG9rZW5zQ29sb3JzID0gYmFzZURhdGEuZW5jb2RlZFRva2Vuc0NvbG9ycztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gUGljayB1cCBkZWZhdWx0IGNvbG9ycyBmcm9tIGBlZGl0b3IuZm9yZWdyb3VuZGAgYW5kIGBlZGl0b3IuYmFja2dyb3VuZGAgaWYgYXZhaWxhYmxlXG5cdFx0XHRjb25zdCBlZGl0b3JGb3JlZ3JvdW5kID0gdGhpcy50aGVtZURhdGEuY29sb3JzWydlZGl0b3IuZm9yZWdyb3VuZCddO1xuXHRcdFx0Y29uc3QgZWRpdG9yQmFja2dyb3VuZCA9IHRoaXMudGhlbWVEYXRhLmNvbG9yc1snZWRpdG9yLmJhY2tncm91bmQnXTtcblx0XHRcdGlmIChlZGl0b3JGb3JlZ3JvdW5kIHx8IGVkaXRvckJhY2tncm91bmQpIHtcblx0XHRcdFx0Y29uc3QgcnVsZTogSVRva2VuVGhlbWVSdWxlID0geyB0b2tlbjogJycgfTtcblx0XHRcdFx0aWYgKGVkaXRvckZvcmVncm91bmQpIHtcblx0XHRcdFx0XHRydWxlLmZvcmVncm91bmQgPSBlZGl0b3JGb3JlZ3JvdW5kO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlZGl0b3JCYWNrZ3JvdW5kKSB7XG5cdFx0XHRcdFx0cnVsZS5iYWNrZ3JvdW5kID0gZWRpdG9yQmFja2dyb3VuZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRydWxlcy5wdXNoKHJ1bGUpO1xuXHRcdFx0fVxuXHRcdFx0cnVsZXMgPSBydWxlcy5jb25jYXQodGhpcy50aGVtZURhdGEucnVsZXMpO1xuXHRcdFx0aWYgKHRoaXMudGhlbWVEYXRhLmVuY29kZWRUb2tlbnNDb2xvcnMpIHtcblx0XHRcdFx0ZW5jb2RlZFRva2Vuc0NvbG9ycyA9IHRoaXMudGhlbWVEYXRhLmVuY29kZWRUb2tlbnNDb2xvcnM7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl90b2tlblRoZW1lID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUmF3VG9rZW5UaGVtZShydWxlcywgZW5jb2RlZFRva2Vuc0NvbG9ycyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90b2tlblRoZW1lO1xuXHR9XG5cblx0cHVibGljIGdldFRva2VuU3R5bGVNZXRhZGF0YSh0eXBlOiBzdHJpbmcsIG1vZGlmaWVyczogc3RyaW5nW10sIG1vZGVsTGFuZ3VhZ2U6IHN0cmluZyk6IElUb2tlblN0eWxlIHwgdW5kZWZpbmVkIHtcblx0XHQvLyB1c2UgdGhlbWUgcnVsZXMgbWF0Y2hcblx0XHRjb25zdCBzdHlsZSA9IHRoaXMudG9rZW5UaGVtZS5fbWF0Y2goW3R5cGVdLmNvbmNhdChtb2RpZmllcnMpLmpvaW4oJy4nKSk7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBzdHlsZS5tZXRhZGF0YTtcblx0XHRjb25zdCBmb3JlZ3JvdW5kID0gVG9rZW5NZXRhZGF0YS5nZXRGb3JlZ3JvdW5kKG1ldGFkYXRhKTtcblx0XHRjb25zdCBmb250U3R5bGUgPSBUb2tlbk1ldGFkYXRhLmdldEZvbnRTdHlsZShtZXRhZGF0YSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGZvcmVncm91bmQ6IGZvcmVncm91bmQsXG5cdFx0XHRpdGFsaWM6IEJvb2xlYW4oZm9udFN0eWxlICYgRm9udFN0eWxlLkl0YWxpYyksXG5cdFx0XHRib2xkOiBCb29sZWFuKGZvbnRTdHlsZSAmIEZvbnRTdHlsZS5Cb2xkKSxcblx0XHRcdHVuZGVybGluZTogQm9vbGVhbihmb250U3R5bGUgJiBGb250U3R5bGUuVW5kZXJsaW5lKSxcblx0XHRcdHN0cmlrZXRocm91Z2g6IEJvb2xlYW4oZm9udFN0eWxlICYgRm9udFN0eWxlLlN0cmlrZXRocm91Z2gpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdG9rZW5Db2xvck1hcCgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHVibGljIGdldCB0b2tlbkZvbnRNYXAoKTogSUZvbnRUb2tlbk9wdGlvbnNbXSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IHNlbWFudGljSGlnaGxpZ2h0aW5nID0gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIGlzQnVpbHRpblRoZW1lKHRoZW1lTmFtZTogc3RyaW5nKTogdGhlbWVOYW1lIGlzIEJ1aWx0aW5UaGVtZSB7XG5cdHJldHVybiAoXG5cdFx0dGhlbWVOYW1lID09PSBWU19MSUdIVF9USEVNRV9OQU1FXG5cdFx0fHwgdGhlbWVOYW1lID09PSBWU19EQVJLX1RIRU1FX05BTUVcblx0XHR8fCB0aGVtZU5hbWUgPT09IEhDX0JMQUNLX1RIRU1FX05BTUVcblx0XHR8fCB0aGVtZU5hbWUgPT09IEhDX0xJR0hUX1RIRU1FX05BTUVcblx0KTtcbn1cblxuZnVuY3Rpb24gZ2V0QnVpbHRpblJ1bGVzKGJ1aWx0aW5UaGVtZTogQnVpbHRpblRoZW1lKTogSVN0YW5kYWxvbmVUaGVtZURhdGEge1xuXHRzd2l0Y2ggKGJ1aWx0aW5UaGVtZSkge1xuXHRcdGNhc2UgVlNfTElHSFRfVEhFTUVfTkFNRTpcblx0XHRcdHJldHVybiB2cztcblx0XHRjYXNlIFZTX0RBUktfVEhFTUVfTkFNRTpcblx0XHRcdHJldHVybiB2c19kYXJrO1xuXHRcdGNhc2UgSENfQkxBQ0tfVEhFTUVfTkFNRTpcblx0XHRcdHJldHVybiBoY19ibGFjaztcblx0XHRjYXNlIEhDX0xJR0hUX1RIRU1FX05BTUU6XG5cdFx0XHRyZXR1cm4gaGNfbGlnaHQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gbmV3QnVpbHRJblRoZW1lKGJ1aWx0aW5UaGVtZTogQnVpbHRpblRoZW1lKTogU3RhbmRhbG9uZVRoZW1lIHtcblx0Y29uc3QgdGhlbWVEYXRhID0gZ2V0QnVpbHRpblJ1bGVzKGJ1aWx0aW5UaGVtZSk7XG5cdHJldHVybiBuZXcgU3RhbmRhbG9uZVRoZW1lKGJ1aWx0aW5UaGVtZSwgdGhlbWVEYXRhKTtcbn1cblxuZXhwb3J0IGNsYXNzIFN0YW5kYWxvbmVUaGVtZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVN0YW5kYWxvbmVUaGVtZVNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ29sb3JUaGVtZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTdGFuZGFsb25lVGhlbWU+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDb2xvclRoZW1lQ2hhbmdlID0gdGhpcy5fb25Db2xvclRoZW1lQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRmlsZUljb25UaGVtZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElGaWxlSWNvblRoZW1lPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSA9IHRoaXMuX29uRmlsZUljb25UaGVtZUNoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2R1Y3RJY29uVGhlbWVDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUHJvZHVjdEljb25UaGVtZT4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFByb2R1Y3RJY29uVGhlbWVDaGFuZ2UgPSB0aGlzLl9vblByb2R1Y3RJY29uVGhlbWVDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnQ6IElFbnZpcm9ubWVudFNlcnZpY2UgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rbm93blRoZW1lczogTWFwPHN0cmluZywgU3RhbmRhbG9uZVRoZW1lPjtcblx0cHJpdmF0ZSBfYXV0b0RldGVjdEhpZ2hDb250cmFzdDogYm9vbGVhbjtcblx0cHJpdmF0ZSBfY29kaWNvbkNTUzogc3RyaW5nO1xuXHRwcml2YXRlIF90aGVtZUNTUzogc3RyaW5nO1xuXHRwcml2YXRlIF9hbGxDU1M6IHN0cmluZztcblx0cHJpdmF0ZSBfZ2xvYmFsU3R5bGVFbGVtZW50OiBIVE1MU3R5bGVFbGVtZW50IHwgbnVsbDtcblx0cHJpdmF0ZSBfc3R5bGVFbGVtZW50czogSFRNTFN0eWxlRWxlbWVudFtdO1xuXHRwcml2YXRlIF9jb2xvck1hcE92ZXJyaWRlOiBDb2xvcltdIHwgbnVsbDtcblx0cHJpdmF0ZSBfdGhlbWUhOiBJU3RhbmRhbG9uZVRoZW1lO1xuXG5cdHByaXZhdGUgX2J1aWx0SW5Qcm9kdWN0SWNvblRoZW1lID0gbmV3IFVudGhlbWVkUHJvZHVjdEljb25UaGVtZSgpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9hdXRvRGV0ZWN0SGlnaENvbnRyYXN0ID0gdHJ1ZTtcblxuXHRcdHRoaXMuX2tub3duVGhlbWVzID0gbmV3IE1hcDxzdHJpbmcsIFN0YW5kYWxvbmVUaGVtZT4oKTtcblx0XHR0aGlzLl9rbm93blRoZW1lcy5zZXQoVlNfTElHSFRfVEhFTUVfTkFNRSwgbmV3QnVpbHRJblRoZW1lKFZTX0xJR0hUX1RIRU1FX05BTUUpKTtcblx0XHR0aGlzLl9rbm93blRoZW1lcy5zZXQoVlNfREFSS19USEVNRV9OQU1FLCBuZXdCdWlsdEluVGhlbWUoVlNfREFSS19USEVNRV9OQU1FKSk7XG5cdFx0dGhpcy5fa25vd25UaGVtZXMuc2V0KEhDX0JMQUNLX1RIRU1FX05BTUUsIG5ld0J1aWx0SW5UaGVtZShIQ19CTEFDS19USEVNRV9OQU1FKSk7XG5cdFx0dGhpcy5fa25vd25UaGVtZXMuc2V0KEhDX0xJR0hUX1RIRU1FX05BTUUsIG5ld0J1aWx0SW5UaGVtZShIQ19MSUdIVF9USEVNRV9OQU1FKSk7XG5cblx0XHRjb25zdCBpY29uc1N0eWxlU2hlZXQgPSB0aGlzLl9yZWdpc3RlcihnZXRJY29uc1N0eWxlU2hlZXQodGhpcykpO1xuXG5cdFx0dGhpcy5fY29kaWNvbkNTUyA9IGljb25zU3R5bGVTaGVldC5nZXRDU1MoKTtcblx0XHR0aGlzLl90aGVtZUNTUyA9ICcnO1xuXHRcdHRoaXMuX2FsbENTUyA9IGAke3RoaXMuX2NvZGljb25DU1N9XFxuJHt0aGlzLl90aGVtZUNTU31gO1xuXHRcdHRoaXMuX2dsb2JhbFN0eWxlRWxlbWVudCA9IG51bGw7XG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50cyA9IFtdO1xuXHRcdHRoaXMuX2NvbG9yTWFwT3ZlcnJpZGUgPSBudWxsO1xuXHRcdHRoaXMuc2V0VGhlbWUoVlNfTElHSFRfVEhFTUVfTkFNRSk7XG5cdFx0dGhpcy5fb25PU1NjaGVtZUNoYW5nZWQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGljb25zU3R5bGVTaGVldC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb2RpY29uQ1NTID0gaWNvbnNTdHlsZVNoZWV0LmdldENTUygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ1NTKCk7XG5cdFx0fSkpO1xuXG5cdFx0YWRkTWF0Y2hNZWRpYUNoYW5nZUxpc3RlbmVyKG1haW5XaW5kb3csICcoZm9yY2VkLWNvbG9yczogYWN0aXZlKScsICgpID0+IHtcblx0XHRcdC8vIFVwZGF0ZSB0aGVtZSBzZWxlY3Rpb24gZm9yIGF1dG8tZGV0ZWN0aW5nIGhpZ2ggY29udHJhc3Rcblx0XHRcdHRoaXMuX29uT1NTY2hlbWVDaGFuZ2VkKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJFZGl0b3JDb250YWluZXIoZG9tTm9kZTogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKGRvbS5pc0luU2hhZG93RE9NKGRvbU5vZGUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVnaXN0ZXJTaGFkb3dEb21Db250YWluZXIoZG9tTm9kZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZWdpc3RlclJlZ3VsYXJFZGl0b3JDb250YWluZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyUmVndWxhckVkaXRvckNvbnRhaW5lcigpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCF0aGlzLl9nbG9iYWxTdHlsZUVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX2dsb2JhbFN0eWxlRWxlbWVudCA9IGRvbVN0eWxlc2hlZXRzSnMuY3JlYXRlU3R5bGVTaGVldCh1bmRlZmluZWQsIHN0eWxlID0+IHtcblx0XHRcdFx0c3R5bGUuY2xhc3NOYW1lID0gJ21vbmFjby1jb2xvcnMnO1xuXHRcdFx0XHRzdHlsZS50ZXh0Q29udGVudCA9IHRoaXMuX2FsbENTUztcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fc3R5bGVFbGVtZW50cy5wdXNoKHRoaXMuX2dsb2JhbFN0eWxlRWxlbWVudCk7XG5cdFx0fVxuXHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclNoYWRvd0RvbUNvbnRhaW5lcihkb21Ob2RlOiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBzdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0c0pzLmNyZWF0ZVN0eWxlU2hlZXQoZG9tTm9kZSwgc3R5bGUgPT4ge1xuXHRcdFx0c3R5bGUuY2xhc3NOYW1lID0gJ21vbmFjby1jb2xvcnMnO1xuXHRcdFx0c3R5bGUudGV4dENvbnRlbnQgPSB0aGlzLl9hbGxDU1M7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc3R5bGVFbGVtZW50cy5wdXNoKHN0eWxlRWxlbWVudCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9zdHlsZUVsZW1lbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3N0eWxlRWxlbWVudHNbaV0gPT09IHN0eWxlRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc3R5bGVFbGVtZW50cy5zcGxpY2UoaSwgMSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBkZWZpbmVUaGVtZSh0aGVtZU5hbWU6IHN0cmluZywgdGhlbWVEYXRhOiBJU3RhbmRhbG9uZVRoZW1lRGF0YSk6IHZvaWQge1xuXHRcdGlmICghL15bYS16MC05XFwtXSskL2kudGVzdCh0aGVtZU5hbWUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgdGhlbWUgbmFtZSEnKTtcblx0XHR9XG5cdFx0aWYgKCFpc0J1aWx0aW5UaGVtZSh0aGVtZURhdGEuYmFzZSkgJiYgIWlzQnVpbHRpblRoZW1lKHRoZW1lTmFtZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSWxsZWdhbCB0aGVtZSBiYXNlIScpO1xuXHRcdH1cblx0XHQvLyBzZXQgb3IgcmVwbGFjZSB0aGVtZVxuXHRcdHRoaXMuX2tub3duVGhlbWVzLnNldCh0aGVtZU5hbWUsIG5ldyBTdGFuZGFsb25lVGhlbWUodGhlbWVOYW1lLCB0aGVtZURhdGEpKTtcblxuXHRcdGlmIChpc0J1aWx0aW5UaGVtZSh0aGVtZU5hbWUpKSB7XG5cdFx0XHR0aGlzLl9rbm93blRoZW1lcy5mb3JFYWNoKHRoZW1lID0+IHtcblx0XHRcdFx0aWYgKHRoZW1lLmJhc2UgPT09IHRoZW1lTmFtZSkge1xuXHRcdFx0XHRcdHRoZW1lLm5vdGlmeUJhc2VVcGRhdGVkKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fdGhlbWUudGhlbWVOYW1lID09PSB0aGVtZU5hbWUpIHtcblx0XHRcdHRoaXMuc2V0VGhlbWUodGhlbWVOYW1lKTsgLy8gcmVmcmVzaCB0aGVtZVxuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRDb2xvclRoZW1lKCk6IElTdGFuZGFsb25lVGhlbWUge1xuXHRcdHJldHVybiB0aGlzLl90aGVtZTtcblx0fVxuXG5cdHB1YmxpYyBzZXRDb2xvck1hcE92ZXJyaWRlKGNvbG9yTWFwT3ZlcnJpZGU6IENvbG9yW10gfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5fY29sb3JNYXBPdmVycmlkZSA9IGNvbG9yTWFwT3ZlcnJpZGU7XG5cdFx0dGhpcy5fdXBkYXRlVGhlbWVPckNvbG9yTWFwKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0VGhlbWUodGhlbWVOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQgdGhlbWU6IFN0YW5kYWxvbmVUaGVtZSB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fa25vd25UaGVtZXMuaGFzKHRoZW1lTmFtZSkpIHtcblx0XHRcdHRoZW1lID0gdGhpcy5fa25vd25UaGVtZXMuZ2V0KHRoZW1lTmFtZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoZW1lID0gdGhpcy5fa25vd25UaGVtZXMuZ2V0KFZTX0xJR0hUX1RIRU1FX05BTUUpO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVBY3R1YWxUaGVtZSh0aGVtZSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVBY3R1YWxUaGVtZShkZXNpcmVkVGhlbWU6IElTdGFuZGFsb25lVGhlbWUgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWRlc2lyZWRUaGVtZSB8fCB0aGlzLl90aGVtZSA9PT0gZGVzaXJlZFRoZW1lKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3RoZW1lID0gZGVzaXJlZFRoZW1lO1xuXHRcdHRoaXMuX3VwZGF0ZVRoZW1lT3JDb2xvck1hcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25PU1NjaGVtZUNoYW5nZWQoKSB7XG5cdFx0aWYgKHRoaXMuX2F1dG9EZXRlY3RIaWdoQ29udHJhc3QpIHtcblx0XHRcdGNvbnN0IHdhbnRzSGlnaENvbnRyYXN0ID0gbWFpbldpbmRvdy5tYXRjaE1lZGlhKGAoZm9yY2VkLWNvbG9yczogYWN0aXZlKWApLm1hdGNoZXM7XG5cdFx0XHRpZiAod2FudHNIaWdoQ29udHJhc3QgIT09IGlzSGlnaENvbnRyYXN0KHRoaXMuX3RoZW1lLnR5cGUpKSB7XG5cdFx0XHRcdC8vIHN3aXRjaCB0byBoaWdoIGNvbnRyYXN0IG9yIG5vbi1oaWdoIGNvbnRyYXN0IGJ1dCBzdGljayB0byBkYXJrIG9yIGxpZ2h0XG5cdFx0XHRcdGxldCBuZXdUaGVtZU5hbWU7XG5cdFx0XHRcdGlmIChpc0RhcmsodGhpcy5fdGhlbWUudHlwZSkpIHtcblx0XHRcdFx0XHRuZXdUaGVtZU5hbWUgPSB3YW50c0hpZ2hDb250cmFzdCA/IEhDX0JMQUNLX1RIRU1FX05BTUUgOiBWU19EQVJLX1RIRU1FX05BTUU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3VGhlbWVOYW1lID0gd2FudHNIaWdoQ29udHJhc3QgPyBIQ19MSUdIVF9USEVNRV9OQU1FIDogVlNfTElHSFRfVEhFTUVfTkFNRTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl91cGRhdGVBY3R1YWxUaGVtZSh0aGlzLl9rbm93blRoZW1lcy5nZXQobmV3VGhlbWVOYW1lKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEF1dG9EZXRlY3RIaWdoQ29udHJhc3QoYXV0b0RldGVjdEhpZ2hDb250cmFzdDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2F1dG9EZXRlY3RIaWdoQ29udHJhc3QgPSBhdXRvRGV0ZWN0SGlnaENvbnRyYXN0O1xuXHRcdHRoaXMuX29uT1NTY2hlbWVDaGFuZ2VkKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVUaGVtZU9yQ29sb3JNYXAoKTogdm9pZCB7XG5cdFx0Y29uc3QgY3NzUnVsZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaGFzUnVsZTogeyBbcnVsZTogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XG5cdFx0Y29uc3QgcnVsZUNvbGxlY3RvcjogSUNzc1N0eWxlQ29sbGVjdG9yID0ge1xuXHRcdFx0YWRkUnVsZTogKHJ1bGU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAoIWhhc1J1bGVbcnVsZV0pIHtcblx0XHRcdFx0XHRjc3NSdWxlcy5wdXNoKHJ1bGUpO1xuXHRcdFx0XHRcdGhhc1J1bGVbcnVsZV0gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGVtaW5nUmVnaXN0cnkuZ2V0VGhlbWluZ1BhcnRpY2lwYW50cygpLmZvckVhY2gocCA9PiBwKHRoaXMuX3RoZW1lLCBydWxlQ29sbGVjdG9yLCB0aGlzLl9lbnZpcm9ubWVudCkpO1xuXG5cdFx0Y29uc3QgY29sb3JWYXJpYWJsZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGNvbG9yUmVnaXN0cnkuZ2V0Q29sb3JzKCkpIHtcblx0XHRcdGNvbnN0IGNvbG9yID0gdGhpcy5fdGhlbWUuZ2V0Q29sb3IoaXRlbS5pZCwgdHJ1ZSk7XG5cdFx0XHRpZiAoY29sb3IpIHtcblx0XHRcdFx0Y29sb3JWYXJpYWJsZXMucHVzaChgJHthc0Nzc1ZhcmlhYmxlTmFtZShpdGVtLmlkKX06ICR7Y29sb3IudG9TdHJpbmcoKX07YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJ1bGVDb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1lZGl0b3IsIC5tb25hY28tZGlmZi1lZGl0b3IsIC5tb25hY28tY29tcG9uZW50IHsgJHtjb2xvclZhcmlhYmxlcy5qb2luKCdcXG4nKX0gfWApO1xuXG5cdFx0Y29uc3QgY29sb3JNYXAgPSB0aGlzLl9jb2xvck1hcE92ZXJyaWRlIHx8IHRoaXMuX3RoZW1lLnRva2VuVGhlbWUuZ2V0Q29sb3JNYXAoKTtcblx0XHRydWxlQ29sbGVjdG9yLmFkZFJ1bGUoZ2VuZXJhdGVUb2tlbnNDU1NGb3JDb2xvck1hcChjb2xvck1hcCkpO1xuXG5cdFx0Ly8gSWYgdGhlIE9TIGhhcyBmb3JjZWQtY29sb3JzIGFjdGl2ZSwgZGlzYWJsZSBmb3JjZWQgY29sb3IgYWRqdXN0bWVudCBmb3Jcblx0XHQvLyBNb25hY28gZWRpdG9yIGVsZW1lbnRzIHNvIHRoYXQgVlMgQ29kZSdzIGJ1aWx0LWluIGhpZ2ggY29udHJhc3QgdGhlbWVzXG5cdFx0Ly8gKGhjLWJsYWNrIC8gaGMtbGlnaHQpIGFyZSB1c2VkIGluc3RlYWQgb2YgdGhlIE9TIGZvcmNpbmcgc3lzdGVtIGNvbG9ycy5cblx0XHRydWxlQ29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28tZWRpdG9yLCAubW9uYWNvLWRpZmYtZWRpdG9yLCAubW9uYWNvLWNvbXBvbmVudCB7IGZvcmNlZC1jb2xvci1hZGp1c3Q6IG5vbmU7IH1gKTtcblxuXHRcdHRoaXMuX3RoZW1lQ1NTID0gY3NzUnVsZXMuam9pbignXFxuJyk7XG5cdFx0dGhpcy5fdXBkYXRlQ1NTKCk7XG5cblx0XHRUb2tlbml6YXRpb25SZWdpc3RyeS5zZXRDb2xvck1hcChjb2xvck1hcCk7XG5cdFx0dGhpcy5fb25Db2xvclRoZW1lQ2hhbmdlLmZpcmUodGhpcy5fdGhlbWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ1NTKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FsbENTUyA9IGAke3RoaXMuX2NvZGljb25DU1N9XFxuJHt0aGlzLl90aGVtZUNTU31gO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudHMuZm9yRWFjaChzdHlsZUVsZW1lbnQgPT4gc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gdGhpcy5fYWxsQ1NTKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRGaWxlSWNvblRoZW1lKCk6IElGaWxlSWNvblRoZW1lIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aGFzRmlsZUljb25zOiBmYWxzZSxcblx0XHRcdGhhc0ZvbGRlckljb25zOiBmYWxzZSxcblx0XHRcdGhpZGVzRXhwbG9yZXJBcnJvd3M6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBnZXRQcm9kdWN0SWNvblRoZW1lKCk6IElQcm9kdWN0SWNvblRoZW1lIHtcblx0XHRyZXR1cm4gdGhpcy5fYnVpbHRJblByb2R1Y3RJY29uVGhlbWU7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksc0JBQXNCO0FBQ2xDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxXQUFXLHFCQUFxQjtBQUN6QyxTQUEwQixZQUFZLG9DQUFvQztBQUUxRSxTQUFTLFVBQVUsVUFBVSxJQUFJLGVBQWU7QUFFaEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBb0Msa0JBQWtDO0FBQy9FLFNBQVMsY0FBYyx5QkFBa0k7QUFDekosU0FBc0Isa0JBQWtCO0FBQ3hDLFNBQVMsYUFBYSxRQUFRLHNCQUFzQjtBQUNwRCxTQUFTLG9CQUFvQixnQ0FBZ0M7QUFDN0QsU0FBUyxrQkFBa0I7QUFFcEIsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSxzQkFBc0I7QUFDNUIsTUFBTSxzQkFBc0I7QUFFbkMsTUFBTSxnQkFBZ0IsU0FBUyxHQUFtQixXQUFXLGlCQUFpQjtBQUM5RSxNQUFNLGtCQUFrQixTQUFTLEdBQXFCLGtCQUFrQixtQkFBbUI7QUFFM0YsTUFBTSxnQkFBNEM7QUFBQSxFQVVqRCxZQUFZLE1BQWMscUJBQTJDO0FBK0lyRSxTQUFnQix1QkFBdUI7QUE5SXRDLFNBQUssWUFBWTtBQUNqQixVQUFNLE9BQU8sb0JBQW9CO0FBQ2pDLFFBQUksS0FBSyxTQUFTLEdBQUc7QUFDcEIsVUFBSSxlQUFlLElBQUksR0FBRztBQUN6QixhQUFLLEtBQUs7QUFBQSxNQUNYLE9BQU87QUFDTixhQUFLLEtBQUssT0FBTyxNQUFNO0FBQUEsTUFDeEI7QUFDQSxXQUFLLFlBQVk7QUFBQSxJQUNsQixPQUFPO0FBQ04sV0FBSyxLQUFLO0FBQ1Ys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
