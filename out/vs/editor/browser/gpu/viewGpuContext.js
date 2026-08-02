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
import * as nls from "../../../nls.js";
import { addDisposableListener, getActiveWindow } from "../../../base/browser/dom.js";
import { createFastDomNode } from "../../../base/browser/fastDomNode.js";
import { Color } from "../../../base/common/color.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { observableValue, runOnChange } from "../../../base/common/observable.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { TextureAtlas } from "./atlas/textureAtlas.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { INotificationService, Severity } from "../../../platform/notification/common/notification.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { GPULifecycle } from "./gpuDisposable.js";
import { ensureNonNullable, observeDevicePixelDimensions } from "./gpuUtils.js";
import { RectangleRenderer } from "./rectangleRenderer.js";
import { DecorationCssRuleExtractor } from "./css/decorationCssRuleExtractor.js";
import { Event } from "../../../base/common/event.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { DecorationStyleCache } from "./css/decorationStyleCache.js";
import { InlineDecorationType } from "../../common/viewModel/inlineDecorations.js";
let ViewGpuContext = class extends Disposable {
  constructor(context, _instantiationService, _notificationService, configurationService, _themeService) {
    super();
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this.configurationService = configurationService;
    this._themeService = _themeService;
    /**
     * The hard cap for line columns rendered by the GPU renderer.
     */
    this.maxGpuCols = 2e3;
    this.canvas = createFastDomNode(document.createElement("canvas"));
    this.canvas.setClassName("editorCanvas");
    this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, (e) => {
      if (!e || e.affectsConfiguration("editor.scrollbar.verticalScrollbarSize")) {
        const verticalScrollbarSize = configurationService.getValue("editor").scrollbar?.verticalScrollbarSize ?? 14;
        this.canvas.domNode.style.boxSizing = "border-box";
        this.canvas.domNode.style.paddingRight = `${verticalScrollbarSize}px`;
      }
    }));
    this.ctx = ensureNonNullable(this.canvas.domNode.getContext("webgpu"));
    if (!ViewGpuContext.device) {
      ViewGpuContext.device = GPULifecycle.requestDevice((message) => {
        const choices = [{
          label: nls.localize("editor.dom.render", "Use DOM-based rendering"),
          run: () => this.configurationService.updateValue("editor.experimentalGpuAcceleration", "off")
        }];
        this._notificationService.prompt(Severity.Warning, message, choices);
      }).then((ref) => {
        ViewGpuContext.deviceSync = ref.object;
        if (!ViewGpuContext._atlas) {
          ViewGpuContext._atlas = this._instantiationService.createInstance(TextureAtlas, ref.object.limits.maxTextureDimension2D, void 0, ViewGpuContext.decorationStyleCache);
        }
        return ref.object;
      });
    }
    const dprObs = observableValue(this, getActiveWindow().devicePixelRatio);
    this._register(addDisposableListener(getActiveWindow(), "resize", () => {
      dprObs.set(getActiveWindow().devicePixelRatio, void 0);
    }));
    this.devicePixelRatio = dprObs;
    this._register(runOnChange(this.devicePixelRatio, () => ViewGpuContext.atlas?.clear()));
    this._register(this._themeService.onDidColorThemeChange(() => {
      ViewGpuContext.decorationCssRuleExtractor.clear();
      ViewGpuContext.atlas?.clear();
    }));
    const canvasDevicePixelDimensions = observableValue(this, { width: this.canvas.domNode.width, height: this.canvas.domNode.height });
    this._register(observeDevicePixelDimensions(
      this.canvas.domNode,
      getActiveWindow(),
      (width, height) => {
        this.canvas.domNode.width = width;
        this.canvas.domNode.height = height;
        canvasDevicePixelDimensions.set({ width, height }, void 0);
      }
    ));
    this.canvasDevicePixelDimensions = canvasDevicePixelDimensions;
    const contentLeft = observableValue(this, 0);
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      contentLeft.set(context.configuration.options.get(EditorOption.layoutInfo).contentLeft, void 0);
    }));
    this.contentLeft = contentLeft;
    this.rectangleRenderer = this._register(this._instantiationService.createInstance(RectangleRenderer, context, this.contentLeft, this.devicePixelRatio, this.canvas.domNode, this.ctx, ViewGpuContext.device));
  }
  static get decorationCssRuleExtractor() {
    return ViewGpuContext._decorationCssRuleExtractor;
  }
  static get decorationStyleCache() {
    return ViewGpuContext._decorationStyleCache;
  }
  /**
   * The shared texture atlas to use across all views.
   *
   * @throws if called before the GPU device is resolved
   */
  static get atlas() {
    if (!ViewGpuContext._atlas) {
      throw new BugIndicatingError("Cannot call ViewGpuContext.textureAtlas before device is resolved");
    }
    return ViewGpuContext._atlas;
  }
  /**
   * The shared texture atlas to use across all views. This is a convenience alias for
   * {@link ViewGpuContext.atlas}.
   *
   * @throws if called before the GPU device is resolved
   */
  get atlas() {
    return ViewGpuContext.atlas;
  }
  /**
   * This method determines which lines can be and are allowed to be rendered using the GPU
   * renderer. Eventually this should trend all lines, except maybe exceptional cases like
   * decorations that use class names.
   */
  canRender(options, viewportData, lineNumber) {
    const data = viewportData.getViewLineRenderingData(lineNumber);
    if (data.containsRTL || data.maxColumn > this.maxGpuCols) {
      return false;
    }
    if (data.inlineDecorations.length > 0) {
      let supported = true;
      for (const decoration of data.inlineDecorations) {
        if (decoration.type !== InlineDecorationType.Regular) {
          supported = false;
          break;
        }
        const styleRules = ViewGpuContext._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
        supported &&= styleRules.every((rule) => {
          if (rule.selectorText.includes(":")) {
            return false;
          }
          for (const r of rule.style) {
            if (!supportsCssRule(r, rule.style)) {
              return false;
            }
          }
          return true;
        });
        if (!supported) {
          break;
        }
      }
      return supported;
    }
    return true;
  }
  /**
   * Like {@link canRender} but returns detailed information about why the line cannot be rendered.
   */
  canRenderDetailed(options, viewportData, lineNumber) {
    const data = viewportData.getViewLineRenderingData(lineNumber);
    const reasons = [];
    if (data.containsRTL) {
      reasons.push("containsRTL");
    }
    if (data.maxColumn > this.maxGpuCols) {
      reasons.push("maxColumn > maxGpuCols");
    }
    if (data.inlineDecorations.length > 0) {
      let supported = true;
      const problemTypes = [];
      const problemSelectors = [];
      const problemRules = [];
      for (const decoration of data.inlineDecorations) {
        if (decoration.type !== InlineDecorationType.Regular) {
          problemTypes.push(decoration.type);
          supported = false;
          continue;
        }
        const styleRules = ViewGpuContext._decorationCssRuleExtractor.getStyleRules(this.canvas.domNode, decoration.inlineClassName);
        supported &&= styleRules.every((rule) => {
          if (rule.selectorText.includes(":")) {
            problemSelectors.push(rule.selectorText);
            return false;
          }
          for (const r of rule.style) {
            if (!supportsCssRule(r, rule.style)) {
              problemRules.push(`${r}: ${rule.style[r]}`);
              return false;
            }
          }
          return true;
        });
        if (!supported) {
          continue;
        }
      }
      if (problemTypes.length > 0) {
        reasons.push(`inlineDecorations with unsupported types (${problemTypes.map((e) => `\`${e}\``).join(", ")})`);
      }
      if (problemRules.length > 0) {
        reasons.push(`inlineDecorations with unsupported CSS rules (${problemRules.map((e) => `\`${e}\``).join(", ")})`);
      }
      if (problemSelectors.length > 0) {
        reasons.push(`inlineDecorations with unsupported CSS selectors (${problemSelectors.map((e) => `\`${e}\``).join(", ")})`);
      }
    }
    return reasons;
  }
};
ViewGpuContext._decorationCssRuleExtractor = new DecorationCssRuleExtractor();
ViewGpuContext._decorationStyleCache = new DecorationStyleCache();
ViewGpuContext = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IThemeService)
], ViewGpuContext);
const gpuSupportedDecorationCssRules = [
  "color",
  "font-weight",
  "opacity",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-thickness"
];
function supportsCssRule(rule, style) {
  if (!gpuSupportedDecorationCssRules.includes(rule)) {
    return false;
  }
  switch (rule) {
    case "text-decoration":
    case "text-decoration-line": {
      const value = style.getPropertyValue(rule);
      return value === "line-through";
    }
    case "text-decoration-color": {
      const value = style.getPropertyValue(rule);
      if (/^var\(--[^,]+,\s*(?:initial|inherit)\)$/.test(value)) {
        return true;
      }
      return Color.Format.CSS.parse(value) !== null;
    }
    case "text-decoration-style": {
      const value = style.getPropertyValue(rule);
      return value === "initial";
    }
    case "text-decoration-thickness": {
      const value = style.getPropertyValue(rule);
      return value === "initial" || /^\d+(\.\d+)?px$/.test(value);
    }
    default:
      return true;
  }
}
export {
  ViewGpuContext
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL2dwdS92aWV3R3B1Q29udGV4dC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZhc3REb21Ob2RlLCB0eXBlIEZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3cG9ydERhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZXNWaWV3cG9ydERhdGEuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3TGluZU9wdGlvbnMgfSBmcm9tICcuLi92aWV3UGFydHMvdmlld0xpbmVzL3ZpZXdMaW5lT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUsIHJ1bk9uQ2hhbmdlLCB0eXBlIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRleHR1cmVBdGxhcyB9IGZyb20gJy4vYXRsYXMvdGV4dHVyZUF0bGFzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR1BVTGlmZWN5Y2xlIH0gZnJvbSAnLi9ncHVEaXNwb3NhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vbk51bGxhYmxlLCBvYnNlcnZlRGV2aWNlUGl4ZWxEaW1lbnNpb25zIH0gZnJvbSAnLi9ncHVVdGlscy5qcyc7XG5pbXBvcnQgeyBSZWN0YW5nbGVSZW5kZXJlciB9IGZyb20gJy4vcmVjdGFuZ2xlUmVuZGVyZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgRGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IgfSBmcm9tICcuL2Nzcy9kZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvci5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiwgdHlwZSBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBEZWNvcmF0aW9uU3R5bGVDYWNoZSB9IGZyb20gJy4vY3NzL2RlY29yYXRpb25TdHlsZUNhY2hlLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBWaWV3R3B1Q29udGV4dCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHQvKipcblx0ICogVGhlIGhhcmQgY2FwIGZvciBsaW5lIGNvbHVtbnMgcmVuZGVyZWQgYnkgdGhlIEdQVSByZW5kZXJlci5cblx0ICovXG5cdHJlYWRvbmx5IG1heEdwdUNvbHMgPSAyMDAwO1xuXG5cdHJlYWRvbmx5IGNhbnZhczogRmFzdERvbU5vZGU8SFRNTENhbnZhc0VsZW1lbnQ+O1xuXHRyZWFkb25seSBjdHg6IEdQVUNhbnZhc0NvbnRleHQ7XG5cblx0c3RhdGljIGRldmljZTogUHJvbWlzZTxHUFVEZXZpY2U+O1xuXHRzdGF0aWMgZGV2aWNlU3luYzogR1BVRGV2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IHJlY3RhbmdsZVJlbmRlcmVyOiBSZWN0YW5nbGVSZW5kZXJlcjtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IgPSBuZXcgRGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IoKTtcblx0c3RhdGljIGdldCBkZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3RvcigpOiBEZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3RvciB7XG5cdFx0cmV0dXJuIFZpZXdHcHVDb250ZXh0Ll9kZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvcjtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9kZWNvcmF0aW9uU3R5bGVDYWNoZSA9IG5ldyBEZWNvcmF0aW9uU3R5bGVDYWNoZSgpO1xuXHRzdGF0aWMgZ2V0IGRlY29yYXRpb25TdHlsZUNhY2hlKCk6IERlY29yYXRpb25TdHlsZUNhY2hlIHtcblx0XHRyZXR1cm4gVmlld0dwdUNvbnRleHQuX2RlY29yYXRpb25TdHlsZUNhY2hlO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2F0bGFzOiBUZXh0dXJlQXRsYXMgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFRoZSBzaGFyZWQgdGV4dHVyZSBhdGxhcyB0byB1c2UgYWNyb3NzIGFsbCB2aWV3cy5cblx0ICpcblx0ICogQHRocm93cyBpZiBjYWxsZWQgYmVmb3JlIHRoZSBHUFUgZGV2aWNlIGlzIHJlc29sdmVkXG5cdCAqL1xuXHRzdGF0aWMgZ2V0IGF0bGFzKCk6IFRleHR1cmVBdGxhcyB7XG5cdFx0aWYgKCFWaWV3R3B1Q29udGV4dC5fYXRsYXMpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0Nhbm5vdCBjYWxsIFZpZXdHcHVDb250ZXh0LnRleHR1cmVBdGxhcyBiZWZvcmUgZGV2aWNlIGlzIHJlc29sdmVkJyk7XG5cdFx0fVxuXHRcdHJldHVybiBWaWV3R3B1Q29udGV4dC5fYXRsYXM7XG5cdH1cblx0LyoqXG5cdCAqIFRoZSBzaGFyZWQgdGV4dHVyZSBhdGxhcyB0byB1c2UgYWNyb3NzIGFsbCB2aWV3cy4gVGhpcyBpcyBhIGNvbnZlbmllbmNlIGFsaWFzIGZvclxuXHQgKiB7QGxpbmsgVmlld0dwdUNvbnRleHQuYXRsYXN9LlxuXHQgKlxuXHQgKiBAdGhyb3dzIGlmIGNhbGxlZCBiZWZvcmUgdGhlIEdQVSBkZXZpY2UgaXMgcmVzb2x2ZWRcblx0ICovXG5cdGdldCBhdGxhcygpOiBUZXh0dXJlQXRsYXMge1xuXHRcdHJldHVybiBWaWV3R3B1Q29udGV4dC5hdGxhcztcblx0fVxuXG5cdHJlYWRvbmx5IGNhbnZhc0RldmljZVBpeGVsRGltZW5zaW9uczogSU9ic2VydmFibGU8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9Pjtcblx0cmVhZG9ubHkgZGV2aWNlUGl4ZWxSYXRpbzogSU9ic2VydmFibGU8bnVtYmVyPjtcblx0cmVhZG9ubHkgY29udGVudExlZnQ6IElPYnNlcnZhYmxlPG51bWJlcj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDogVmlld0NvbnRleHQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNhbnZhcyA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpKTtcblx0XHR0aGlzLmNhbnZhcy5zZXRDbGFzc05hbWUoJ2VkaXRvckNhbnZhcycpO1xuXG5cdFx0Ly8gQWRqdXN0IHRoZSBjYW52YXMgc2l6ZSB0byBhdm9pZCBkcmF3aW5nIHVuZGVyIHRoZSBzY3JvbGwgYmFyXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiB7XG5cdFx0XHRpZiAoIWUgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLnNjcm9sbGJhci52ZXJ0aWNhbFNjcm9sbGJhclNpemUnKSkge1xuXHRcdFx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhclNpemUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpLnNjcm9sbGJhcj8udmVydGljYWxTY3JvbGxiYXJTaXplID8/IDE0O1xuXHRcdFx0XHR0aGlzLmNhbnZhcy5kb21Ob2RlLnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94Jztcblx0XHRcdFx0dGhpcy5jYW52YXMuZG9tTm9kZS5zdHlsZS5wYWRkaW5nUmlnaHQgPSBgJHt2ZXJ0aWNhbFNjcm9sbGJhclNpemV9cHhgO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY3R4ID0gZW5zdXJlTm9uTnVsbGFibGUodGhpcy5jYW52YXMuZG9tTm9kZS5nZXRDb250ZXh0KCd3ZWJncHUnKSk7XG5cblx0XHQvLyBSZXF1ZXN0IHRoZSBHUFUgZGV2aWNlLCB3ZSBvbmx5IHdhbnQgdG8gZG8gdGhpcyBhIHNpbmdsZSB0aW1lIHBlciB3aW5kb3cgYXMgaXQncyBhc3luY1xuXHRcdC8vIGFuZCBjYW4gZGVsYXkgdGhlIGluaXRpYWwgcmVuZGVyLlxuXHRcdGlmICghVmlld0dwdUNvbnRleHQuZGV2aWNlKSB7XG5cdFx0XHRWaWV3R3B1Q29udGV4dC5kZXZpY2UgPSBHUFVMaWZlY3ljbGUucmVxdWVzdERldmljZSgobWVzc2FnZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBjaG9pY2VzOiBJUHJvbXB0Q2hvaWNlW10gPSBbe1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2VkaXRvci5kb20ucmVuZGVyJywgXCJVc2UgRE9NLWJhc2VkIHJlbmRlcmluZ1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2VkaXRvci5leHBlcmltZW50YWxHcHVBY2NlbGVyYXRpb24nLCAnb2ZmJyksXG5cdFx0XHRcdH1dO1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlLCBjaG9pY2VzKTtcblx0XHRcdH0pLnRoZW4ocmVmID0+IHtcblx0XHRcdFx0Vmlld0dwdUNvbnRleHQuZGV2aWNlU3luYyA9IHJlZi5vYmplY3Q7XG5cdFx0XHRcdGlmICghVmlld0dwdUNvbnRleHQuX2F0bGFzKSB7XG5cdFx0XHRcdFx0Vmlld0dwdUNvbnRleHQuX2F0bGFzID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dHVyZUF0bGFzLCByZWYub2JqZWN0LmxpbWl0cy5tYXhUZXh0dXJlRGltZW5zaW9uMkQsIHVuZGVmaW5lZCwgVmlld0dwdUNvbnRleHQuZGVjb3JhdGlvblN0eWxlQ2FjaGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZWYub2JqZWN0O1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHByT2JzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGdldEFjdGl2ZVdpbmRvdygpLmRldmljZVBpeGVsUmF0aW8pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihnZXRBY3RpdmVXaW5kb3coKSwgJ3Jlc2l6ZScsICgpID0+IHtcblx0XHRcdGRwck9icy5zZXQoZ2V0QWN0aXZlV2luZG93KCkuZGV2aWNlUGl4ZWxSYXRpbywgdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kZXZpY2VQaXhlbFJhdGlvID0gZHByT2JzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJ1bk9uQ2hhbmdlKHRoaXMuZGV2aWNlUGl4ZWxSYXRpbywgKCkgPT4gVmlld0dwdUNvbnRleHQuYXRsYXM/LmNsZWFyKCkpKTtcblxuXHRcdC8vIENsZWFyIGRlY29yYXRpb24gQ1NTIGNhY2hlcyB3aGVuIHRoZW1lIGNoYW5nZXMgYXMgQ1NTIHZhcmlhYmxlcyBtYXkgaGF2ZSBkaWZmZXJlbnQgdmFsdWVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHRWaWV3R3B1Q29udGV4dC5kZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvci5jbGVhcigpO1xuXHRcdFx0Vmlld0dwdUNvbnRleHQuYXRsYXM/LmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY2FudmFzRGV2aWNlUGl4ZWxEaW1lbnNpb25zID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHsgd2lkdGg6IHRoaXMuY2FudmFzLmRvbU5vZGUud2lkdGgsIGhlaWdodDogdGhpcy5jYW52YXMuZG9tTm9kZS5oZWlnaHQgfSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIob2JzZXJ2ZURldmljZVBpeGVsRGltZW5zaW9ucyhcblx0XHRcdHRoaXMuY2FudmFzLmRvbU5vZGUsXG5cdFx0XHRnZXRBY3RpdmVXaW5kb3coKSxcblx0XHRcdCh3aWR0aCwgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMuY2FudmFzLmRvbU5vZGUud2lkdGggPSB3aWR0aDtcblx0XHRcdFx0dGhpcy5jYW52YXMuZG9tTm9kZS5oZWlnaHQgPSBoZWlnaHQ7XG5cdFx0XHRcdGNhbnZhc0RldmljZVBpeGVsRGltZW5zaW9ucy5zZXQoeyB3aWR0aCwgaGVpZ2h0IH0sIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0dGhpcy5jYW52YXNEZXZpY2VQaXhlbERpbWVuc2lvbnMgPSBjYW52YXNEZXZpY2VQaXhlbERpbWVuc2lvbnM7XG5cblx0XHRjb25zdCBjb250ZW50TGVmdCA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCAwKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGNvbnRlbnRMZWZ0LnNldChjb250ZXh0LmNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pLmNvbnRlbnRMZWZ0LCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmNvbnRlbnRMZWZ0ID0gY29udGVudExlZnQ7XG5cblx0XHR0aGlzLnJlY3RhbmdsZVJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVjdGFuZ2xlUmVuZGVyZXIsIGNvbnRleHQsIHRoaXMuY29udGVudExlZnQsIHRoaXMuZGV2aWNlUGl4ZWxSYXRpbywgdGhpcy5jYW52YXMuZG9tTm9kZSwgdGhpcy5jdHgsIFZpZXdHcHVDb250ZXh0LmRldmljZSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoaXMgbWV0aG9kIGRldGVybWluZXMgd2hpY2ggbGluZXMgY2FuIGJlIGFuZCBhcmUgYWxsb3dlZCB0byBiZSByZW5kZXJlZCB1c2luZyB0aGUgR1BVXG5cdCAqIHJlbmRlcmVyLiBFdmVudHVhbGx5IHRoaXMgc2hvdWxkIHRyZW5kIGFsbCBsaW5lcywgZXhjZXB0IG1heWJlIGV4Y2VwdGlvbmFsIGNhc2VzIGxpa2Vcblx0ICogZGVjb3JhdGlvbnMgdGhhdCB1c2UgY2xhc3MgbmFtZXMuXG5cdCAqL1xuXHRwdWJsaWMgY2FuUmVuZGVyKG9wdGlvbnM6IFZpZXdMaW5lT3B0aW9ucywgdmlld3BvcnREYXRhOiBWaWV3cG9ydERhdGEsIGxpbmVOdW1iZXI6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGRhdGEgPSB2aWV3cG9ydERhdGEuZ2V0Vmlld0xpbmVSZW5kZXJpbmdEYXRhKGxpbmVOdW1iZXIpO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIGxpbmUgaGFzIHNpbXBsZSBhdHRyaWJ1dGVzIHRoYXQgYXJlbid0IHN1cHBvcnRlZFxuXHRcdGlmIChcblx0XHRcdGRhdGEuY29udGFpbnNSVEwgfHxcblx0XHRcdGRhdGEubWF4Q29sdW1uID4gdGhpcy5tYXhHcHVDb2xzXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYWxsIGlubGluZSBkZWNvcmF0aW9ucyBhcmUgc3VwcG9ydGVkXG5cdFx0aWYgKGRhdGEuaW5saW5lRGVjb3JhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0bGV0IHN1cHBvcnRlZCA9IHRydWU7XG5cdFx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb24gb2YgZGF0YS5pbmxpbmVEZWNvcmF0aW9ucykge1xuXHRcdFx0XHRpZiAoZGVjb3JhdGlvbi50eXBlICE9PSBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKSB7XG5cdFx0XHRcdFx0c3VwcG9ydGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3R5bGVSdWxlcyA9IFZpZXdHcHVDb250ZXh0Ll9kZWNvcmF0aW9uQ3NzUnVsZUV4dHJhY3Rvci5nZXRTdHlsZVJ1bGVzKHRoaXMuY2FudmFzLmRvbU5vZGUsIGRlY29yYXRpb24uaW5saW5lQ2xhc3NOYW1lKTtcblx0XHRcdFx0c3VwcG9ydGVkICYmPSBzdHlsZVJ1bGVzLmV2ZXJ5KHJ1bGUgPT4ge1xuXHRcdFx0XHRcdC8vIFBzZXVkbyBjbGFzc2VzIGFyZW4ndCBzdXBwb3J0ZWQgY3VycmVudGx5XG5cdFx0XHRcdFx0aWYgKHJ1bGUuc2VsZWN0b3JUZXh0LmluY2x1ZGVzKCc6JykpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJ1bGUuc3R5bGUpIHtcblx0XHRcdFx0XHRcdGlmICghc3VwcG9ydHNDc3NSdWxlKHIsIHJ1bGUuc3R5bGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIXN1cHBvcnRlZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc3VwcG9ydGVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIExpa2Uge0BsaW5rIGNhblJlbmRlcn0gYnV0IHJldHVybnMgZGV0YWlsZWQgaW5mb3JtYXRpb24gYWJvdXQgd2h5IHRoZSBsaW5lIGNhbm5vdCBiZSByZW5kZXJlZC5cblx0ICovXG5cdHB1YmxpYyBjYW5SZW5kZXJEZXRhaWxlZChvcHRpb25zOiBWaWV3TGluZU9wdGlvbnMsIHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhLCBsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgZGF0YSA9IHZpZXdwb3J0RGF0YS5nZXRWaWV3TGluZVJlbmRlcmluZ0RhdGEobGluZU51bWJlcik7XG5cdFx0Y29uc3QgcmVhc29uczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoZGF0YS5jb250YWluc1JUTCkge1xuXHRcdFx0cmVhc29ucy5wdXNoKCdjb250YWluc1JUTCcpO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5tYXhDb2x1bW4gPiB0aGlzLm1heEdwdUNvbHMpIHtcblx0XHRcdHJlYXNvbnMucHVzaCgnbWF4Q29sdW1uID4gbWF4R3B1Q29scycpO1xuXHRcdH1cblx0XHRpZiAoZGF0YS5pbmxpbmVEZWNvcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgc3VwcG9ydGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHByb2JsZW1UeXBlczogSW5saW5lRGVjb3JhdGlvblR5cGVbXSA9IFtdO1xuXHRcdFx0Y29uc3QgcHJvYmxlbVNlbGVjdG9yczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHByb2JsZW1SdWxlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBkYXRhLmlubGluZURlY29yYXRpb25zKSB7XG5cdFx0XHRcdGlmIChkZWNvcmF0aW9uLnR5cGUgIT09IElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpIHtcblx0XHRcdFx0XHRwcm9ibGVtVHlwZXMucHVzaChkZWNvcmF0aW9uLnR5cGUpO1xuXHRcdFx0XHRcdHN1cHBvcnRlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHN0eWxlUnVsZXMgPSBWaWV3R3B1Q29udGV4dC5fZGVjb3JhdGlvbkNzc1J1bGVFeHRyYWN0b3IuZ2V0U3R5bGVSdWxlcyh0aGlzLmNhbnZhcy5kb21Ob2RlLCBkZWNvcmF0aW9uLmlubGluZUNsYXNzTmFtZSk7XG5cdFx0XHRcdHN1cHBvcnRlZCAmJj0gc3R5bGVSdWxlcy5ldmVyeShydWxlID0+IHtcblx0XHRcdFx0XHQvLyBQc2V1ZG8gY2xhc3NlcyBhcmVuJ3Qgc3VwcG9ydGVkIGN1cnJlbnRseVxuXHRcdFx0XHRcdGlmIChydWxlLnNlbGVjdG9yVGV4dC5pbmNsdWRlcygnOicpKSB7XG5cdFx0XHRcdFx0XHRwcm9ibGVtU2VsZWN0b3JzLnB1c2gocnVsZS5zZWxlY3RvclRleHQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRmb3IgKGNvbnN0IHIgb2YgcnVsZS5zdHlsZSkge1xuXHRcdFx0XHRcdFx0aWYgKCFzdXBwb3J0c0Nzc1J1bGUociwgcnVsZS5zdHlsZSkpIHtcblx0XHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdFx0XHRcdHByb2JsZW1SdWxlcy5wdXNoKGAke3J9OiAke3J1bGUuc3R5bGVbciBhcyBhbnldfWApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFzdXBwb3J0ZWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2JsZW1UeXBlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJlYXNvbnMucHVzaChgaW5saW5lRGVjb3JhdGlvbnMgd2l0aCB1bnN1cHBvcnRlZCB0eXBlcyAoJHtwcm9ibGVtVHlwZXMubWFwKGUgPT4gYFxcYCR7ZX1cXGBgKS5qb2luKCcsICcpfSlgKTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9ibGVtUnVsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZWFzb25zLnB1c2goYGlubGluZURlY29yYXRpb25zIHdpdGggdW5zdXBwb3J0ZWQgQ1NTIHJ1bGVzICgke3Byb2JsZW1SdWxlcy5tYXAoZSA9PiBgXFxgJHtlfVxcYGApLmpvaW4oJywgJyl9KWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb2JsZW1TZWxlY3RvcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZWFzb25zLnB1c2goYGlubGluZURlY29yYXRpb25zIHdpdGggdW5zdXBwb3J0ZWQgQ1NTIHNlbGVjdG9ycyAoJHtwcm9ibGVtU2VsZWN0b3JzLm1hcChlID0+IGBcXGAke2V9XFxgYCkuam9pbignLCAnKX0pYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZWFzb25zO1xuXHR9XG59XG5cbi8qKlxuICogQSBsaXN0IG9mIHN1cHBvcnRlZCBkZWNvcmF0aW9uIENTUyBydWxlcyB0aGF0IGNhbiBiZSB1c2VkIGluIHRoZSBHUFUgcmVuZGVyZXIuXG4gKi9cbmNvbnN0IGdwdVN1cHBvcnRlZERlY29yYXRpb25Dc3NSdWxlcyA9IFtcblx0J2NvbG9yJyxcblx0J2ZvbnQtd2VpZ2h0Jyxcblx0J29wYWNpdHknLFxuXHQndGV4dC1kZWNvcmF0aW9uJyxcblx0J3RleHQtZGVjb3JhdGlvbi1jb2xvcicsXG5cdCd0ZXh0LWRlY29yYXRpb24tbGluZScsXG5cdCd0ZXh0LWRlY29yYXRpb24tc3R5bGUnLFxuXHQndGV4dC1kZWNvcmF0aW9uLXRoaWNrbmVzcycsXG5dO1xuXG5mdW5jdGlvbiBzdXBwb3J0c0Nzc1J1bGUocnVsZTogc3RyaW5nLCBzdHlsZTogQ1NTU3R5bGVEZWNsYXJhdGlvbikge1xuXHRpZiAoIWdwdVN1cHBvcnRlZERlY29yYXRpb25Dc3NSdWxlcy5pbmNsdWRlcyhydWxlKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHQvLyBDaGVjayBmb3IgdmFsdWVzIHRoYXQgYXJlbid0IHN1cHBvcnRlZFxuXHRzd2l0Y2ggKHJ1bGUpIHtcblx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24nOlxuXHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi1saW5lJzoge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBzdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKHJ1bGUpO1xuXHRcdFx0Ly8gT25seSBsaW5lLXRocm91Z2ggaXMgc3VwcG9ydGVkIGN1cnJlbnRseVxuXHRcdFx0cmV0dXJuIHZhbHVlID09PSAnbGluZS10aHJvdWdoJztcblx0XHR9XG5cdFx0Y2FzZSAndGV4dC1kZWNvcmF0aW9uLWNvbG9yJzoge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBzdHlsZS5nZXRQcm9wZXJ0eVZhbHVlKHJ1bGUpO1xuXHRcdFx0Ly8gU3VwcG9ydCB2YXIoLS1zb21ldGhpbmcsIGluaXRpYWwvaW5oZXJpdCkgd2hpY2ggZmFsbHMgYmFjayB0byBjdXJyZW50Y29sb3Jcblx0XHRcdGlmICgvXnZhclxcKC0tW14sXSssXFxzKig/OmluaXRpYWx8aW5oZXJpdClcXCkkLy50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdC8vIFN1cHBvcnQgcGFyc2VkIGNvbG9yIHZhbHVlc1xuXHRcdFx0cmV0dXJuIENvbG9yLkZvcm1hdC5DU1MucGFyc2UodmFsdWUpICE9PSBudWxsO1xuXHRcdH1cblx0XHRjYXNlICd0ZXh0LWRlY29yYXRpb24tc3R5bGUnOiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHN0eWxlLmdldFByb3BlcnR5VmFsdWUocnVsZSk7XG5cdFx0XHQvLyBPbmx5ICdpbml0aWFsJyAoc29saWQpIGlzIHN1cHBvcnRlZFxuXHRcdFx0cmV0dXJuIHZhbHVlID09PSAnaW5pdGlhbCc7XG5cdFx0fVxuXHRcdGNhc2UgJ3RleHQtZGVjb3JhdGlvbi10aGlja25lc3MnOiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHN0eWxlLmdldFByb3BlcnR5VmFsdWUocnVsZSk7XG5cdFx0XHQvLyBPbmx5IHBpeGVsIHZhbHVlcyBhbmQgJ2luaXRpYWwnIGFyZSBzdXBwb3J0ZWRcblx0XHRcdHJldHVybiB2YWx1ZSA9PT0gJ2luaXRpYWwnIHx8IC9eXFxkKyhcXC5cXGQrKT9weCQvLnRlc3QodmFsdWUpO1xuXHRcdH1cblx0XHRkZWZhdWx0OiByZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx1QkFBdUIsdUJBQXVCO0FBQ3ZELFNBQVMseUJBQTJDO0FBQ3BELFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUczQixTQUFTLGlCQUFpQixtQkFBcUM7QUFDL0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBcUMsZ0JBQWdCO0FBQzlELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJB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
