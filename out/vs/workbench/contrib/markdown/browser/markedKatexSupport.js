import { importAMDNodeModule, resolveAmdNodeModulePath } from "../../../../amdX.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { katexContainerLatexAttributeName, MarkedKatexExtension } from "../common/markedKatexExtension.js";
const _MarkedKatexSupport = class _MarkedKatexSupport {
  static getSanitizerOptions(baseConfig) {
    return {
      allowedTags: {
        override: [
          ...baseConfig.allowedTags,
          ...trustedMathMlTags
        ]
      },
      allowedAttributes: {
        override: [
          ...baseConfig.allowedAttributes,
          // Math
          "stretchy",
          "encoding",
          "accent",
          katexContainerLatexAttributeName,
          // SVG
          "d",
          "viewBox",
          "preserveAspectRatio",
          // Allow all classes since we don't have a list of allowed katex classes
          "class",
          // Sanitize allowed styles for katex
          {
            attributeName: "style",
            shouldKeep: (_el, data) => this.sanitizeKatexStyles(data.attrValue)
          }
        ]
      }
    };
  }
  static sanitizeStyles(styleString, allowedProperties) {
    const style = this.tempSanitizerRule.value;
    style.cssText = styleString;
    const sanitizedProps = [];
    for (let i = 0; i < style.length; i++) {
      const prop = style[i];
      if (allowedProperties.includes(prop)) {
        const value = style.getPropertyValue(prop);
        if (/^(([\d\.\-]+\w*\s?)+|\w+)$/.test(value)) {
          sanitizedProps.push(`${prop}: ${value}`);
        }
      }
    }
    return sanitizedProps.join("; ");
  }
  static sanitizeKatexStyles(styleString) {
    const allowedProperties = [
      "display",
      "position",
      "font-family",
      "font-style",
      "font-weight",
      "font-size",
      "height",
      "min-height",
      "max-height",
      "width",
      "min-width",
      "max-width",
      "margin",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "padding",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "top",
      "left",
      "right",
      "bottom",
      "vertical-align",
      "transform",
      "border",
      "border-top-width",
      "border-right-width",
      "border-bottom-width",
      "border-left-width",
      "color",
      "white-space",
      "text-align",
      "line-height",
      "float",
      "clear"
    ];
    return this.sanitizeStyles(styleString, allowedProperties);
  }
  static getExtension(window, options = {}) {
    if (!this._katex) {
      return void 0;
    }
    this.ensureKatexStyles(window);
    return MarkedKatexExtension.extension(this._katex, options);
  }
  static async loadExtension(window, options = {}) {
    const katex = await this._katexPromise.value;
    this.ensureKatexStyles(window);
    return MarkedKatexExtension.extension(katex, options);
  }
  static ensureKatexStyles(window) {
    const doc = window.document;
    if (!doc.querySelector("link.katex")) {
      const katexStyle = document.createElement("link");
      katexStyle.classList.add("katex");
      katexStyle.rel = "stylesheet";
      katexStyle.href = resolveAmdNodeModulePath("katex", "dist/katex.min.css");
      doc.head.appendChild(katexStyle);
    }
  }
};
_MarkedKatexSupport.tempSanitizerRule = new Lazy(() => {
  const styleSheet = new CSSStyleSheet();
  styleSheet.insertRule(`.temp{}`);
  const rule = styleSheet.cssRules[0];
  if (!(rule instanceof CSSStyleRule)) {
    throw new Error("Invalid CSS rule");
  }
  return rule.style;
});
_MarkedKatexSupport._katexPromise = new Lazy(async () => {
  _MarkedKatexSupport._katex = await importAMDNodeModule("katex", "dist/katex.min.js");
  return _MarkedKatexSupport._katex;
});
let MarkedKatexSupport = _MarkedKatexSupport;
const trustedMathMlTags = Object.freeze([
  "semantics",
  "annotation",
  "math",
  "menclose",
  "merror",
  "mfenced",
  "mfrac",
  "mglyph",
  "mi",
  "mlabeledtr",
  "mmultiscripts",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mroot",
  "mrow",
  "ms",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msup",
  "msubsup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
  "mprescripts",
  // svg tags
  "svg",
  "altglyph",
  "altglyphdef",
  "altglyphitem",
  "circle",
  "clippath",
  "defs",
  "desc",
  "ellipse",
  "filter",
  "font",
  "g",
  "glyph",
  "glyphref",
  "hkern",
  "line",
  "lineargradient",
  "marker",
  "mask",
  "metadata",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialgradient",
  "rect",
  "stop",
  "style",
  "switch",
  "symbol",
  "text",
  "textpath",
  "title",
  "tref",
  "tspan",
  "view",
  "vkern"
]);
export {
  MarkedKatexSupport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtkb3duL2Jyb3dzZXIvbWFya2VkS2F0ZXhTdXBwb3J0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaW1wb3J0QU1ETm9kZU1vZHVsZSwgcmVzb2x2ZUFtZE5vZGVNb2R1bGVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgKiBhcyBkb21TYW5pdGl6ZSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU2FuaXRpemUuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TYW5pdGl6ZXJDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIG1hcmtlZCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IGthdGV4Q29udGFpbmVyTGF0ZXhBdHRyaWJ1dGVOYW1lLCBNYXJrZWRLYXRleEV4dGVuc2lvbiB9IGZyb20gJy4uL2NvbW1vbi9tYXJrZWRLYXRleEV4dGVuc2lvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNYXJrZWRLYXRleFN1cHBvcnQge1xuXG5cdHB1YmxpYyBzdGF0aWMgZ2V0U2FuaXRpemVyT3B0aW9ucyhiYXNlQ29uZmlnOiB7XG5cdFx0cmVhZG9ubHkgYWxsb3dlZFRhZ3M6IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdHJlYWRvbmx5IGFsbG93ZWRBdHRyaWJ1dGVzOiBSZWFkb25seUFycmF5PHN0cmluZyB8IGRvbVNhbml0aXplLlNhbml0aXplQXR0cmlidXRlUnVsZT47XG5cdH0pOiBNYXJrZG93blNhbml0aXplckNvbmZpZyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFsbG93ZWRUYWdzOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBbXG5cdFx0XHRcdFx0Li4uYmFzZUNvbmZpZy5hbGxvd2VkVGFncyxcblx0XHRcdFx0XHQuLi50cnVzdGVkTWF0aE1sVGFncyxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG5cdFx0XHRcdG92ZXJyaWRlOiBbXG5cdFx0XHRcdFx0Li4uYmFzZUNvbmZpZy5hbGxvd2VkQXR0cmlidXRlcyxcblxuXHRcdFx0XHRcdC8vIE1hdGhcblx0XHRcdFx0XHQnc3RyZXRjaHknLFxuXHRcdFx0XHRcdCdlbmNvZGluZycsXG5cdFx0XHRcdFx0J2FjY2VudCcsXG5cdFx0XHRcdFx0a2F0ZXhDb250YWluZXJMYXRleEF0dHJpYnV0ZU5hbWUsXG5cblx0XHRcdFx0XHQvLyBTVkdcblx0XHRcdFx0XHQnZCcsXG5cdFx0XHRcdFx0J3ZpZXdCb3gnLFxuXHRcdFx0XHRcdCdwcmVzZXJ2ZUFzcGVjdFJhdGlvJyxcblxuXHRcdFx0XHRcdC8vIEFsbG93IGFsbCBjbGFzc2VzIHNpbmNlIHdlIGRvbid0IGhhdmUgYSBsaXN0IG9mIGFsbG93ZWQga2F0ZXggY2xhc3Nlc1xuXHRcdFx0XHRcdCdjbGFzcycsXG5cblx0XHRcdFx0XHQvLyBTYW5pdGl6ZSBhbGxvd2VkIHN0eWxlcyBmb3Iga2F0ZXhcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRhdHRyaWJ1dGVOYW1lOiAnc3R5bGUnLFxuXHRcdFx0XHRcdFx0c2hvdWxkS2VlcDogKF9lbCwgZGF0YSkgPT4gdGhpcy5zYW5pdGl6ZUthdGV4U3R5bGVzKGRhdGEuYXR0clZhbHVlKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyB0ZW1wU2FuaXRpemVyUnVsZSA9IG5ldyBMYXp5KCgpID0+IHtcblx0XHQvLyBDcmVhdGUgYSBDU1NTdHlsZURlY2xhcmF0aW9uIG9iamVjdCB2aWEgYSBzdHlsZSBzaGVldCBydWxlXG5cdFx0Y29uc3Qgc3R5bGVTaGVldCA9IG5ldyBDU1NTdHlsZVNoZWV0KCk7XG5cdFx0c3R5bGVTaGVldC5pbnNlcnRSdWxlKGAudGVtcHt9YCk7XG5cdFx0Y29uc3QgcnVsZSA9IHN0eWxlU2hlZXQuY3NzUnVsZXNbMF07XG5cdFx0aWYgKCEocnVsZSBpbnN0YW5jZW9mIENTU1N0eWxlUnVsZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBDU1MgcnVsZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gcnVsZS5zdHlsZTtcblx0fSk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgc2FuaXRpemVTdHlsZXMoc3R5bGVTdHJpbmc6IHN0cmluZywgYWxsb3dlZFByb3BlcnRpZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRjb25zdCBzdHlsZSA9IHRoaXMudGVtcFNhbml0aXplclJ1bGUudmFsdWU7XG5cdFx0c3R5bGUuY3NzVGV4dCA9IHN0eWxlU3RyaW5nO1xuXG5cdFx0Y29uc3Qgc2FuaXRpemVkUHJvcHMgPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc3R5bGUubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHByb3AgPSBzdHlsZVtpXTtcblx0XHRcdGlmIChhbGxvd2VkUHJvcGVydGllcy5pbmNsdWRlcyhwcm9wKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHN0eWxlLmdldFByb3BlcnR5VmFsdWUocHJvcCk7XG5cdFx0XHRcdC8vIEFsbG93IHRocm91Z2ggbGlzdHMgb2YgbnVtYmVycyB3aXRoIHVuaXRzIG9yIGJhcmUgd29yZHMgbGlrZSAnYmxvY2snXG5cdFx0XHRcdC8vIE1haW4gZ29hbCBpcyB0byBibG9jayB0aGluZ3MgbGlrZSAndXJsKCknLlxuXHRcdFx0XHRpZiAoL14oKFtcXGRcXC5cXC1dK1xcdypcXHM/KSt8XFx3KykkLy50ZXN0KHZhbHVlKSkge1xuXHRcdFx0XHRcdHNhbml0aXplZFByb3BzLnB1c2goYCR7cHJvcH06ICR7dmFsdWV9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc2FuaXRpemVkUHJvcHMuam9pbignOyAnKTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHNhbml0aXplS2F0ZXhTdHlsZXMoc3R5bGVTdHJpbmc6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgYWxsb3dlZFByb3BlcnRpZXMgPSBbXG5cdFx0XHQnZGlzcGxheScsXG5cdFx0XHQncG9zaXRpb24nLFxuXHRcdFx0J2ZvbnQtZmFtaWx5Jyxcblx0XHRcdCdmb250LXN0eWxlJyxcblx0XHRcdCdmb250LXdlaWdodCcsXG5cdFx0XHQnZm9udC1zaXplJyxcblx0XHRcdCdoZWlnaHQnLFxuXHRcdFx0J21pbi1oZWlnaHQnLFxuXHRcdFx0J21heC1oZWlnaHQnLFxuXHRcdFx0J3dpZHRoJyxcblx0XHRcdCdtaW4td2lkdGgnLFxuXHRcdFx0J21heC13aWR0aCcsXG5cdFx0XHQnbWFyZ2luJyxcblx0XHRcdCdtYXJnaW4tdG9wJyxcblx0XHRcdCdtYXJnaW4tcmlnaHQnLFxuXHRcdFx0J21hcmdpbi1ib3R0b20nLFxuXHRcdFx0J21hcmdpbi1sZWZ0Jyxcblx0XHRcdCdwYWRkaW5nJyxcblx0XHRcdCdwYWRkaW5nLXRvcCcsXG5cdFx0XHQncGFkZGluZy1yaWdodCcsXG5cdFx0XHQncGFkZGluZy1ib3R0b20nLFxuXHRcdFx0J3BhZGRpbmctbGVmdCcsXG5cdFx0XHQndG9wJyxcblx0XHRcdCdsZWZ0Jyxcblx0XHRcdCdyaWdodCcsXG5cdFx0XHQnYm90dG9tJyxcblx0XHRcdCd2ZXJ0aWNhbC1hbGlnbicsXG5cdFx0XHQndHJhbnNmb3JtJyxcblx0XHRcdCdib3JkZXInLFxuXHRcdFx0J2JvcmRlci10b3Atd2lkdGgnLFxuXHRcdFx0J2JvcmRlci1yaWdodC13aWR0aCcsXG5cdFx0XHQnYm9yZGVyLWJvdHRvbS13aWR0aCcsXG5cdFx0XHQnYm9yZGVyLWxlZnQtd2lkdGgnLFxuXHRcdFx0J2NvbG9yJyxcblx0XHRcdCd3aGl0ZS1zcGFjZScsXG5cdFx0XHQndGV4dC1hbGlnbicsXG5cdFx0XHQnbGluZS1oZWlnaHQnLFxuXHRcdFx0J2Zsb2F0Jyxcblx0XHRcdCdjbGVhcicsXG5cdFx0XTtcblx0XHRyZXR1cm4gdGhpcy5zYW5pdGl6ZVN0eWxlcyhzdHlsZVN0cmluZywgYWxsb3dlZFByb3BlcnRpZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2thdGV4PzogdHlwZW9mIGltcG9ydCgna2F0ZXgnKS5kZWZhdWx0O1xuXHRwcml2YXRlIHN0YXRpYyBfa2F0ZXhQcm9taXNlID0gbmV3IExhenkoYXN5bmMgKCkgPT4ge1xuXHRcdHRoaXMuX2thdGV4ID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdrYXRleCcpLmRlZmF1bHQ+KCdrYXRleCcsICdkaXN0L2thdGV4Lm1pbi5qcycpO1xuXHRcdHJldHVybiB0aGlzLl9rYXRleDtcblx0fSk7XG5cblx0cHVibGljIHN0YXRpYyBnZXRFeHRlbnNpb24od2luZG93OiBDb2RlV2luZG93LCBvcHRpb25zOiBNYXJrZWRLYXRleEV4dGVuc2lvbi5NYXJrZWRLYXRleE9wdGlvbnMgPSB7fSk6IG1hcmtlZC5NYXJrZWRFeHRlbnNpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fa2F0ZXgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbnN1cmVLYXRleFN0eWxlcyh3aW5kb3cpO1xuXHRcdHJldHVybiBNYXJrZWRLYXRleEV4dGVuc2lvbi5leHRlbnNpb24odGhpcy5fa2F0ZXgsIG9wdGlvbnMpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBhc3luYyBsb2FkRXh0ZW5zaW9uKHdpbmRvdzogQ29kZVdpbmRvdywgb3B0aW9uczogTWFya2VkS2F0ZXhFeHRlbnNpb24uTWFya2VkS2F0ZXhPcHRpb25zID0ge30pOiBQcm9taXNlPG1hcmtlZC5NYXJrZWRFeHRlbnNpb24+IHtcblx0XHRjb25zdCBrYXRleCA9IGF3YWl0IHRoaXMuX2thdGV4UHJvbWlzZS52YWx1ZTtcblx0XHR0aGlzLmVuc3VyZUthdGV4U3R5bGVzKHdpbmRvdyk7XG5cdFx0cmV0dXJuIE1hcmtlZEthdGV4RXh0ZW5zaW9uLmV4dGVuc2lvbihrYXRleCwgb3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGVuc3VyZUthdGV4U3R5bGVzKHdpbmRvdzogQ29kZVdpbmRvdykge1xuXHRcdGNvbnN0IGRvYyA9IHdpbmRvdy5kb2N1bWVudDtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRpZiAoIWRvYy5xdWVyeVNlbGVjdG9yKCdsaW5rLmthdGV4JykpIHtcblx0XHRcdGNvbnN0IGthdGV4U3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaW5rJyk7XG5cdFx0XHRrYXRleFN0eWxlLmNsYXNzTGlzdC5hZGQoJ2thdGV4Jyk7XG5cdFx0XHRrYXRleFN0eWxlLnJlbCA9ICdzdHlsZXNoZWV0Jztcblx0XHRcdGthdGV4U3R5bGUuaHJlZiA9IHJlc29sdmVBbWROb2RlTW9kdWxlUGF0aCgna2F0ZXgnLCAnZGlzdC9rYXRleC5taW4uY3NzJyk7XG5cdFx0XHRkb2MuaGVhZC5hcHBlbmRDaGlsZChrYXRleFN0eWxlKTtcblx0XHR9XG5cdH1cbn1cblxuY29uc3QgdHJ1c3RlZE1hdGhNbFRhZ3MgPSBPYmplY3QuZnJlZXplKFtcblx0J3NlbWFudGljcycsXG5cdCdhbm5vdGF0aW9uJyxcblx0J21hdGgnLFxuXHQnbWVuY2xvc2UnLFxuXHQnbWVycm9yJyxcblx0J21mZW5jZWQnLFxuXHQnbWZyYWMnLFxuXHQnbWdseXBoJyxcblx0J21pJyxcblx0J21sYWJlbGVkdHInLFxuXHQnbW11bHRpc2NyaXB0cycsXG5cdCdtbicsXG5cdCdtbycsXG5cdCdtb3ZlcicsXG5cdCdtcGFkZGVkJyxcblx0J21waGFudG9tJyxcblx0J21yb290Jyxcblx0J21yb3cnLFxuXHQnbXMnLFxuXHQnbXNwYWNlJyxcblx0J21zcXJ0Jyxcblx0J21zdHlsZScsXG5cdCdtc3ViJyxcblx0J21zdXAnLFxuXHQnbXN1YnN1cCcsXG5cdCdtdGFibGUnLFxuXHQnbXRkJyxcblx0J210ZXh0Jyxcblx0J210cicsXG5cdCdtdW5kZXInLFxuXHQnbXVuZGVyb3ZlcicsXG5cdCdtcHJlc2NyaXB0cycsXG5cblx0Ly8gc3ZnIHRhZ3Ncblx0J3N2ZycsXG5cdCdhbHRnbHlwaCcsXG5cdCdhbHRnbHlwaGRlZicsXG5cdCdhbHRnbHlwaGl0ZW0nLFxuXHQnY2lyY2xlJyxcblx0J2NsaXBwYXRoJyxcblx0J2RlZnMnLFxuXHQnZGVzYycsXG5cdCdlbGxpcHNlJyxcblx0J2ZpbHRlcicsXG5cdCdmb250Jyxcblx0J2cnLFxuXHQnZ2x5cGgnLFxuXHQnZ2x5cGhyZWYnLFxuXHQnaGtlcm4nLFxuXHQnbGluZScsXG5cdCdsaW5lYXJncmFkaWVudCcsXG5cdCdtYXJrZXInLFxuXHQnbWFzaycsXG5cdCdtZXRhZGF0YScsXG5cdCdtcGF0aCcsXG5cdCdwYXRoJyxcblx0J3BhdHRlcm4nLFxuXHQncG9seWdvbicsXG5cdCdwb2x5bGluZScsXG5cdCdyYWRpYWxncmFkaWVudCcsXG5cdCdyZWN0Jyxcblx0J3N0b3AnLFxuXHQnc3R5bGUnLFxuXHQnc3dpdGNoJyxcblx0J3N5bWJvbCcsXG5cdCd0ZXh0Jyxcblx0J3RleHRwYXRoJyxcblx0J3RpdGxlJyxcblx0J3RyZWYnLFxuXHQndHNwYW4nLFxuXHQndmlldycsXG5cdCd2a2VybicsXG5dKTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxxQkFBcUIsZ0NBQWdDO0FBSTlELFNBQVMsWUFBWTtBQUVyQixTQUFTLGtDQUFrQyw0QkFBNEI7QUFFaEUsTUFBTSxzQkFBTixNQUFNLG9CQUFtQjtBQUFBLEVBRS9CLE9BQWMsb0JBQW9CLFlBR047QUFDM0IsV0FBTztBQUFBLE1BQ04sYUFBYTtBQUFBLFFBQ1osVUFBVTtBQUFBLFVBQ1QsR0FBRyxXQUFXO0FBQUEsVUFDZCxHQUFHO0FBQUEsUUFDSjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLG1CQUFtQjtBQUFBLFFBQ2xCLFVBQVU7QUFBQSxVQUNULEdBQUcsV0FBVztBQUFBO0FBQUEsVUFHZDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBO0FBQUEsVUFHQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUE7QUFBQSxVQUdBO0FBQUE7QUFBQSxVQUdBO0FBQUEsWUFDQyxlQUFlO0FBQUEsWUFDZixZQUFZLENBQUMsS0FBSyxTQUFTLEtBQUssb0JBQW9CLEtBQUssU0FBUztBQUFBLFVBQ25FO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBYUEsT0FBZSxlQUFlLGFBQXFCLG1CQUE4QztBQUNoRyxVQUFNLFFBQVEsS0FBSyxrQkFBa0I7QUFDckMsVUFBTSxVQUFVO0FBRWhCLFVBQU0s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QTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUE7QUFBQSxFQUdBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNELENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
