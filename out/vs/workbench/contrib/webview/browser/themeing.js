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
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { EditorFontLigatures } from "../../../../editor/common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../../editor/common/config/fontInfo.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import * as colorRegistry from "../../../../platform/theme/common/colorRegistry.js";
import { getSizeRegistry, sizeValueToCss } from "../../../../platform/theme/common/sizeRegistry.js";
import { ColorScheme } from "../../../../platform/theme/common/theme.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
let WebviewThemeDataProvider = class extends Disposable {
  constructor(_themeService, _configurationService) {
    super();
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._cachedWebViewThemeData = void 0;
    this._onThemeDataChanged = this._register(new Emitter());
    this.onThemeDataChanged = this._onThemeDataChanged.event;
    this._register(this._themeService.onDidColorThemeChange(() => {
      this._reset();
    }));
    const webviewConfigurationKeys = ["editor.fontFamily", "editor.fontWeight", "editor.fontSize", "editor.fontLigatures", "accessibility.underlineLinks"];
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (webviewConfigurationKeys.some((key) => e.affectsConfiguration(key))) {
        this._reset();
      }
    }));
  }
  getTheme() {
    return this._themeService.getColorTheme();
  }
  getWebviewThemeData() {
    if (!this._cachedWebViewThemeData) {
      const configuration = this._configurationService.getValue("editor");
      const editorFontFamily = configuration.fontFamily || EDITOR_FONT_DEFAULTS.fontFamily;
      const editorFontWeight = configuration.fontWeight || EDITOR_FONT_DEFAULTS.fontWeight;
      const editorFontSize = configuration.fontSize || EDITOR_FONT_DEFAULTS.fontSize;
      const editorFontLigatures = new EditorFontLigatures().validate(configuration.fontLigatures);
      const linkUnderlines = this._configurationService.getValue("accessibility.underlineLinks");
      const theme = this._themeService.getColorTheme();
      const exportedColors = colorRegistry.getColorRegistry().getColors().reduce((colors, entry) => {
        const color = theme.getColor(entry.id);
        if (color) {
          colors["vscode-" + entry.id.replace(".", "-")] = color.toString();
        }
        return colors;
      }, {});
      const sizeRegistry = getSizeRegistry();
      const exportedSizes = sizeRegistry.getSizes().reduce((sizes, entry) => {
        const sizeValue = sizeRegistry.resolveDefaultSize(entry.id, theme);
        if (sizeValue) {
          sizes["vscode-" + entry.id.replace(/\./g, "-")] = sizeValueToCss(sizeValue);
        }
        return sizes;
      }, {});
      const styles = {
        "vscode-font-family": DEFAULT_FONT_FAMILY,
        "vscode-font-weight": "normal",
        "vscode-font-size": "13px",
        "vscode-editor-font-family": editorFontFamily,
        "vscode-editor-font-weight": editorFontWeight,
        "vscode-editor-font-size": editorFontSize + "px",
        "text-link-decoration": linkUnderlines ? "underline" : "none",
        ...exportedColors,
        ...exportedSizes,
        "vscode-editor-font-feature-settings": editorFontLigatures
      };
      const activeTheme = ApiThemeClassName.fromTheme(theme);
      this._cachedWebViewThemeData = { styles, activeTheme, themeLabel: theme.label, themeId: theme.settingsId };
    }
    return this._cachedWebViewThemeData;
  }
  _reset() {
    this._cachedWebViewThemeData = void 0;
    this._onThemeDataChanged.fire();
  }
};
WebviewThemeDataProvider = __decorateClass([
  __decorateParam(0, IWorkbenchThemeService),
  __decorateParam(1, IConfigurationService)
], WebviewThemeDataProvider);
var ApiThemeClassName = /* @__PURE__ */ ((ApiThemeClassName2) => {
  ApiThemeClassName2["light"] = "vscode-light";
  ApiThemeClassName2["dark"] = "vscode-dark";
  ApiThemeClassName2["highContrast"] = "vscode-high-contrast";
  ApiThemeClassName2["highContrastLight"] = "vscode-high-contrast-light";
  return ApiThemeClassName2;
})(ApiThemeClassName || {});
((ApiThemeClassName2) => {
  function fromTheme(theme) {
    switch (theme.type) {
      case ColorScheme.LIGHT:
        return "vscode-light" /* light */;
      case ColorScheme.DARK:
        return "vscode-dark" /* dark */;
      case ColorScheme.HIGH_CONTRAST_DARK:
        return "vscode-high-contrast" /* highContrast */;
      case ColorScheme.HIGH_CONTRAST_LIGHT:
        return "vscode-high-contrast-light" /* highContrastLight */;
    }
  }
  ApiThemeClassName2.fromTheme = fromTheme;
})(ApiThemeClassName || (ApiThemeClassName = {}));
export {
  WebviewThemeDataProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlYnZpZXcvYnJvd3Nlci90aGVtZWluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERFRkFVTFRfRk9OVF9GQU1JTFkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9udHMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMsIEVkaXRvckZvbnRMaWdhdHVyZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEVESVRPUl9GT05UX0RFRkFVTFRTIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBjb2xvclJlZ2lzdHJ5IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldFNpemVSZWdpc3RyeSwgc2l6ZVZhbHVlVG9Dc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vc2l6ZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbG9yU2NoZW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb2xvclRoZW1lLCBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgV2Vidmlld1N0eWxlcyB9IGZyb20gJy4vd2Vidmlldy5qcyc7XG5cbmludGVyZmFjZSBXZWJ2aWV3VGhlbWVEYXRhIHtcblx0cmVhZG9ubHkgYWN0aXZlVGhlbWU6IHN0cmluZztcblx0cmVhZG9ubHkgdGhlbWVMYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSB0aGVtZUlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN0eWxlczogUmVhZG9ubHk8V2Vidmlld1N0eWxlcz47XG59XG5cbmV4cG9ydCBjbGFzcyBXZWJ2aWV3VGhlbWVEYXRhUHJvdmlkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF9jYWNoZWRXZWJWaWV3VGhlbWVEYXRhOiBXZWJ2aWV3VGhlbWVEYXRhIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVGhlbWVEYXRhQ2hhbmdlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25UaGVtZURhdGFDaGFuZ2VkID0gdGhpcy5fb25UaGVtZURhdGFDaGFuZ2VkLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVdvcmtiZW5jaFRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Jlc2V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgd2Vidmlld0NvbmZpZ3VyYXRpb25LZXlzID0gWydlZGl0b3IuZm9udEZhbWlseScsICdlZGl0b3IuZm9udFdlaWdodCcsICdlZGl0b3IuZm9udFNpemUnLCAnZWRpdG9yLmZvbnRMaWdhdHVyZXMnLCAnYWNjZXNzaWJpbGl0eS51bmRlcmxpbmVMaW5rcyddO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmICh3ZWJ2aWV3Q29uZmlndXJhdGlvbktleXMuc29tZShrZXkgPT4gZS5hZmZlY3RzQ29uZmlndXJhdGlvbihrZXkpKSkge1xuXHRcdFx0XHR0aGlzLl9yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUaGVtZSgpOiBJV29ya2JlbmNoQ29sb3JUaGVtZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0V2Vidmlld1RoZW1lRGF0YSgpOiBXZWJ2aWV3VGhlbWVEYXRhIHtcblx0XHRpZiAoIXRoaXMuX2NhY2hlZFdlYlZpZXdUaGVtZURhdGEpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpO1xuXHRcdFx0Y29uc3QgZWRpdG9yRm9udEZhbWlseSA9IGNvbmZpZ3VyYXRpb24uZm9udEZhbWlseSB8fCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250RmFtaWx5O1xuXHRcdFx0Y29uc3QgZWRpdG9yRm9udFdlaWdodCA9IGNvbmZpZ3VyYXRpb24uZm9udFdlaWdodCB8fCBFRElUT1JfRk9OVF9ERUZBVUxUUy5mb250V2VpZ2h0O1xuXHRcdFx0Y29uc3QgZWRpdG9yRm9udFNpemUgPSBjb25maWd1cmF0aW9uLmZvbnRTaXplIHx8IEVESVRPUl9GT05UX0RFRkFVTFRTLmZvbnRTaXplO1xuXHRcdFx0Y29uc3QgZWRpdG9yRm9udExpZ2F0dXJlcyA9IG5ldyBFZGl0b3JGb250TGlnYXR1cmVzKCkudmFsaWRhdGUoY29uZmlndXJhdGlvbi5mb250TGlnYXR1cmVzKTtcblx0XHRcdGNvbnN0IGxpbmtVbmRlcmxpbmVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkudW5kZXJsaW5lTGlua3MnKTtcblxuXHRcdFx0Y29uc3QgdGhlbWUgPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdFx0Y29uc3QgZXhwb3J0ZWRDb2xvcnMgPSBjb2xvclJlZ2lzdHJ5LmdldENvbG9yUmVnaXN0cnkoKS5nZXRDb2xvcnMoKS5yZWR1Y2U8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4oKGNvbG9ycywgZW50cnkpID0+IHtcblx0XHRcdFx0Y29uc3QgY29sb3IgPSB0aGVtZS5nZXRDb2xvcihlbnRyeS5pZCk7XG5cdFx0XHRcdGlmIChjb2xvcikge1xuXHRcdFx0XHRcdGNvbG9yc1sndnNjb2RlLScgKyBlbnRyeS5pZC5yZXBsYWNlKCcuJywgJy0nKV0gPSBjb2xvci50b1N0cmluZygpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBjb2xvcnM7XG5cdFx0XHR9LCB7fSk7XG5cblx0XHRcdGNvbnN0IHNpemVSZWdpc3RyeSA9IGdldFNpemVSZWdpc3RyeSgpO1xuXHRcdFx0Y29uc3QgZXhwb3J0ZWRTaXplcyA9IHNpemVSZWdpc3RyeS5nZXRTaXplcygpLnJlZHVjZTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+Pigoc2l6ZXMsIGVudHJ5KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNpemVWYWx1ZSA9IHNpemVSZWdpc3RyeS5yZXNvbHZlRGVmYXVsdFNpemUoZW50cnkuaWQsIHRoZW1lKTtcblx0XHRcdFx0aWYgKHNpemVWYWx1ZSkge1xuXHRcdFx0XHRcdHNpemVzWyd2c2NvZGUtJyArIGVudHJ5LmlkLnJlcGxhY2UoL1xcLi9nLCAnLScpXSA9IHNpemVWYWx1ZVRvQ3NzKHNpemVWYWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHNpemVzO1xuXHRcdFx0fSwge30pO1xuXG5cdFx0XHRjb25zdCBzdHlsZXMgPSB7XG5cdFx0XHRcdCd2c2NvZGUtZm9udC1mYW1pbHknOiBERUZBVUxUX0ZPTlRfRkFNSUxZLFxuXHRcdFx0XHQndnNjb2RlLWZvbnQtd2VpZ2h0JzogJ25vcm1hbCcsXG5cdFx0XHRcdCd2c2NvZGUtZm9udC1zaXplJzogJzEzcHgnLFxuXHRcdFx0XHQndnNjb2RlLWVkaXRvci1mb250LWZhbWlseSc6IGVkaXRvckZvbnRGYW1pbHksXG5cdFx0XHRcdCd2c2NvZGUtZWRpdG9yLWZvbnQtd2VpZ2h0JzogZWRpdG9yRm9udFdlaWdodCxcblx0XHRcdFx0J3ZzY29kZS1lZGl0b3ItZm9udC1zaXplJzogZWRpdG9yRm9udFNpemUgKyAncHgnLFxuXHRcdFx0XHQndGV4dC1saW5rLWRlY29yYXRpb24nOiBsaW5rVW5kZXJsaW5lcyA/ICd1bmRlcmxpbmUnIDogJ25vbmUnLFxuXHRcdFx0XHQuLi5leHBvcnRlZENvbG9ycyxcblx0XHRcdFx0Li4uZXhwb3J0ZWRTaXplcyxcblx0XHRcdFx0J3ZzY29kZS1lZGl0b3ItZm9udC1mZWF0dXJlLXNldHRpbmdzJzogZWRpdG9yRm9udExpZ2F0dXJlcyxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFjdGl2ZVRoZW1lID0gQXBpVGhlbWVDbGFzc05hbWUuZnJvbVRoZW1lKHRoZW1lKTtcblx0XHRcdHRoaXMuX2NhY2hlZFdlYlZpZXdUaGVtZURhdGEgPSB7IHN0eWxlcywgYWN0aXZlVGhlbWUsIHRoZW1lTGFiZWw6IHRoZW1lLmxhYmVsLCB0aGVtZUlkOiB0aGVtZS5zZXR0aW5nc0lkIH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFdlYlZpZXdUaGVtZURhdGE7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldCgpIHtcblx0XHR0aGlzLl9jYWNoZWRXZWJWaWV3VGhlbWVEYXRhID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uVGhlbWVEYXRhQ2hhbmdlZC5maXJlKCk7XG5cdH1cbn1cblxuZW51bSBBcGlUaGVtZUNsYXNzTmFtZSB7XG5cdGxpZ2h0ID0gJ3ZzY29kZS1saWdodCcsXG5cdGRhcmsgPSAndnNjb2RlLWRhcmsnLFxuXHRoaWdoQ29udHJhc3QgPSAndnNjb2RlLWhpZ2gtY29udHJhc3QnLFxuXHRoaWdoQ29udHJhc3RMaWdodCA9ICd2c2NvZGUtaGlnaC1jb250cmFzdC1saWdodCcsXG59XG5cbm5hbWVzcGFjZSBBcGlUaGVtZUNsYXNzTmFtZSB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tVGhlbWUodGhlbWU6IElXb3JrYmVuY2hDb2xvclRoZW1lKTogQXBpVGhlbWVDbGFzc05hbWUge1xuXHRcdHN3aXRjaCAodGhlbWUudHlwZSkge1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5MSUdIVDogcmV0dXJuIEFwaVRoZW1lQ2xhc3NOYW1lLmxpZ2h0O1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5EQVJLOiByZXR1cm4gQXBpVGhlbWVDbGFzc05hbWUuZGFyaztcblx0XHRcdGNhc2UgQ29sb3JTY2hlbWUuSElHSF9DT05UUkFTVF9EQVJLOiByZXR1cm4gQXBpVGhlbWVDbGFzc05hbWUuaGlnaENvbnRyYXN0O1xuXHRcdFx0Y2FzZSBDb2xvclNjaGVtZS5ISUdIX0NPTlRSQVNUX0xJR0hUOiByZXR1cm4gQXBpVGhlbWVDbGFzc05hbWUuaGlnaENvbnRyYXN0TGlnaHQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUF5QiwyQkFBMkI7QUFDcEQsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsWUFBWSxtQkFBbUI7QUFDL0IsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQVMsbUJBQW1CO0FBQzVCLFNBQStCLDhCQUE4QjtBQVV0RCxJQUFNLDJCQUFOLGNBQXVDLFdBQVc7QUFBQSxFQU94RCxZQUMwQyxlQUNELHVCQUN2QztBQUNELFVBQU07QUFIbUM7QUFDRDtBQVB6QyxTQUFRLDBCQUF3RDtBQUVoRSxTQUFpQixzQkFBc0IsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ3pFLFNBQWdCLHFCQUFxQixLQUFLLG9CQUFvQjtBQVE3RCxTQUFLLFVBQVUsS0FBSyxjQUFjLHNCQUFzQixNQUFNO0FBQzdELFdBQUssT0FBTztBQUFBLElBQ2IsQ0FBQyxDQUFDO0FBRUYsVUFBTSwyQkFBMkIsQ0FBQyxxQkFBcUIscUJBQXFCLG1CQUFtQix3QkFBd0IsOEJBQThCO0FBQ3JKLFNBQUssVUFBVSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUN2RSxVQUFJLHlCQUF5QixLQUFLLFNBQU8sRUFBRSxxQkFBcUIsR0FBRyxDQUFDLEdBQUc7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
