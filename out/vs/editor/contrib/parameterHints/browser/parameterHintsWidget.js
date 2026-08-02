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
import * as dom from "../../../../base/browser/dom.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { escapeRegExpCharacters } from "../../../../base/common/strings.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import "./parameterHints.css";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EDITOR_FONT_DEFAULTS } from "../../../common/config/fontInfo.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { Context } from "./provideSignatureHelp.js";
import * as nls from "../../../../nls.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { listHighlightForeground, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
const $ = dom.$;
const parameterHintsNextIcon = registerIcon("parameter-hints-next", Codicon.chevronDown, nls.localize("parameterHintsNextIcon", "Icon for show next parameter hint."));
const parameterHintsPreviousIcon = registerIcon("parameter-hints-previous", Codicon.chevronUp, nls.localize("parameterHintsPreviousIcon", "Icon for show previous parameter hint."));
let ParameterHintsWidget = class extends Disposable {
  constructor(editor, model, contextKeyService, markdownRendererService) {
    super();
    this.editor = editor;
    this.model = model;
    this.markdownRendererService = markdownRendererService;
    this.renderDisposeables = this._register(new DisposableStore());
    this.visible = false;
    this.announcedLabel = null;
    // Editor.IContentWidget.allowEditorOverflow
    this.allowEditorOverflow = true;
    this.keyVisible = Context.Visible.bindTo(contextKeyService);
    this.keyMultipleSignatures = Context.MultipleSignatures.bindTo(contextKeyService);
  }
  createParameterHintDOMNodes() {
    const element = $(".editor-widget.parameter-hints-widget");
    const wrapper = dom.append(element, $(".phwrapper"));
    wrapper.tabIndex = -1;
    const controls = dom.append(wrapper, $(".controls"));
    const previous = dom.append(controls, $(".button" + ThemeIcon.asCSSSelector(parameterHintsPreviousIcon)));
    const overloads = dom.append(controls, $(".overloads"));
    const next = dom.append(controls, $(".button" + ThemeIcon.asCSSSelector(parameterHintsNextIcon)));
    this._register(dom.addDisposableListener(previous, "click", (e) => {
      dom.EventHelper.stop(e);
      this.previous();
    }));
    this._register(dom.addDisposableListener(next, "click", (e) => {
      dom.EventHelper.stop(e);
      this.next();
    }));
    const body = $(".body");
    const scrollbar = new DomScrollableElement(body, {
      alwaysConsumeMouseWheel: true
    });
    this._register(scrollbar);
    wrapper.appendChild(scrollbar.getDomNode());
    const signature = dom.append(body, $(".signature"));
    const docs = dom.append(body, $(".docs"));
    element.style.userSelect = "text";
    this.domNodes = {
      element,
      signature,
      overloads,
      docs,
      scrollbar
    };
    this.editor.addContentWidget(this);
    this.hide();
    this._register(this.editor.onDidChangeCursorSelection((e) => {
      if (this.visible) {
        this.editor.layoutContentWidget(this);
      }
    }));
    const updateFont = () => {
      if (!this.domNodes) {
        return;
      }
      const fontInfo = this.editor.getOption(EditorOption.fontInfo);
      const element2 = this.domNodes.element;
      element2.style.fontSize = `${fontInfo.fontSize}px`;
      element2.style.lineHeight = `${fontInfo.lineHeight / fontInfo.fontSize}`;
      element2.style.setProperty("--vscode-parameterHintsWidget-editorFontFamily", fontInfo.fontFamily);
      element2.style.setProperty("--vscode-parameterHintsWidget-editorFontFamilyDefault", EDITOR_FONT_DEFAULTS.fontFamily);
    };
    updateFont();
    this._register(Event.chain(
      this.editor.onDidChangeConfiguration.bind(this.editor),
      ($2) => $2.filter((e) => e.hasChanged(EditorOption.fontInfo))
    )(updateFont));
    this._register(this.editor.onDidLayoutChange((e) => this.updateMaxHeight()));
    this.updateMaxHeight();
  }
  show() {
    if (this.visible) {
      return;
    }
    if (!this.domNodes) {
      this.createParameterHintDOMNodes();
    }
    this.keyVisible.set(true);
    this.visible = true;
    setTimeout(() => {
      this.domNodes?.element.classList.add("visible");
    }, 100);
    this.editor.layoutContentWidget(this);
  }
  hide() {
    this.renderDisposeables.clear();
    if (!this.visible) {
      return;
    }
    this.keyVisible.reset();
    this.visible = false;
    this.announcedLabel = null;
    this.domNodes?.element.classList.remove("visible");
    this.editor.layoutContentWidget(this);
  }
  getPosition() {
    if (this.visible) {
      return {
        position: this.editor.getPosition(),
        preference: [ContentWidgetPositionPreference.ABOVE, ContentWidgetPositionPreference.BELOW]
      };
    }
    return null;
  }
  render(hints) {
    this.renderDisposeables.clear();
    if (!this.domNodes) {
      return;
    }
    const multiple = hints.signatures.length > 1;
    this.domNodes.element.classList.toggle("multiple", multiple);
    this.keyMultipleSignatures.set(multiple);
    this.domNodes.signature.innerText = "";
    this.domNodes.docs.innerText = "";
    const signature = hints.signatures[hints.activeSignature];
    if (!signature) {
      return;
    }
    const code = dom.append(this.domNodes.signature, $(".code"));
    const hasParameters = signature.parameters.length > 0;
    const activeParameterIndex = signature.activeParameter ?? hints.activeParameter;
    if (!hasParameters) {
      const label = dom.append(code, $("span"));
      label.textContent = signature.label;
    } else {
      this.renderParameters(code, signature, activeParameterIndex);
    }
    const activeParameter = signature.parameters[activeParameterIndex];
    if (activeParameter?.documentation) {
      const documentation = $("span.documentation");
      if (typeof activeParameter.documentation === "string") {
        documentation.textContent = activeParameter.documentation;
      } else {
        const renderedContents = this.renderMarkdownDocs(activeParameter.documentation);
        documentation.appendChild(renderedContents.element);
      }
      dom.append(this.domNodes.docs, $("p", {}, documentation));
    }
    if (signature.documentation === void 0) {
    } else if (typeof signature.documentation === "string") {
      dom.append(this.domNodes.docs, $("p", {}, signature.documentation));
    } else {
      const renderedContents = this.renderMarkdownDocs(signature.documentation);
      dom.append(this.domNodes.docs, renderedContents.element);
    }
    const hasDocs = this.hasDocs(signature, activeParameter);
    this.domNodes.signature.classList.toggle("has-docs", hasDocs);
    this.domNodes.docs.classList.toggle("empty", !hasDocs);
    this.domNodes.overloads.textContent = String(hints.activeSignature + 1).padStart(hints.signatures.length.toString().length, "0") + "/" + hints.signatures.length;
    if (activeParameter) {
      let labelToAnnounce = "";
      const param = signature.parameters[activeParameterIndex];
      if (Array.isArray(param.label)) {
        labelToAnnounce = signature.label.substring(param.label[0], param.label[1]);
      } else {
        labelToAnnounce = param.label;
      }
      if (param.documentation) {
        labelToAnnounce += typeof param.documentation === "string" ? `, ${param.documentation}` : `, ${param.documentation.value}`;
      }
      if (signature.documentation) {
        labelToAnnounce += typeof signature.documentation === "string" ? `, ${signature.documentation}` : `, ${signature.documentation.value}`;
      }
      if (this.announcedLabel !== labelToAnnounce) {
        aria.alert(nls.localize("hint", "{0}, hint", labelToAnnounce));
        this.announcedLabel = labelToAnnounce;
      }
    }
    this.editor.layoutContentWidget(this);
    this.domNodes.scrollbar.scanDomNode();
  }
  renderMarkdownDocs(markdown) {
    const renderedContents = this.renderDisposeables.add(this.markdownRendererService.render(markdown, {
      context: this.editor,
      asyncRenderCallback: () => {
        this.domNodes?.scrollbar.scanDomNode();
      }
    }));
    renderedContents.element.classList.add("markdown-docs");
    return renderedContents;
  }
  hasDocs(signature, activeParameter) {
    if (activeParameter && typeof activeParameter.documentation === "string" && assertReturnsDefined(activeParameter.documentation).length > 0) {
      return true;
    }
    if (activeParameter && typeof activeParameter.documentation === "object" && assertReturnsDefined(activeParameter.documentation).value.length > 0) {
      return true;
    }
    if (signature.documentation && typeof signature.documentation === "string" && assertReturnsDefined(signature.documentation).length > 0) {
      return true;
    }
    if (signature.documentation && typeof signature.documentation === "object" && assertReturnsDefined(signature.documentation.value).length > 0) {
      return true;
    }
    return false;
  }
  renderParameters(parent, signature, activeParameterIndex) {
    const [start, end] = this.getParameterLabelOffsets(signature, activeParameterIndex);
    const beforeSpan = document.createElement("span");
    beforeSpan.textContent = signature.label.substring(0, start);
    const paramSpan = document.createElement("span");
    paramSpan.textContent = signature.label.substring(start, end);
    paramSpan.className = "parameter active";
    const afterSpan = document.createElement("span");
    afterSpan.textContent = signature.label.substring(end);
    dom.append(parent, beforeSpan, paramSpan, afterSpan);
  }
  getParameterLabelOffsets(signature, paramIdx) {
    const param = signature.parameters[paramIdx];
    if (!param) {
      return [0, 0];
    } else if (Array.isArray(param.label)) {
      return param.label;
    } else if (!param.label.length) {
      return [0, 0];
    } else {
      const regex = new RegExp(`(\\W|^)${escapeRegExpCharacters(param.label)}(?=\\W|$)`, "g");
      regex.test(signature.label);
      const idx = regex.lastIndex - param.label.length;
      return idx >= 0 ? [idx, regex.lastIndex] : [0, 0];
    }
  }
  next() {
    this.editor.focus();
    this.model.next();
  }
  previous() {
    this.editor.focus();
    this.model.previous();
  }
  getDomNode() {
    if (!this.domNodes) {
      this.createParameterHintDOMNodes();
    }
    return this.domNodes.element;
  }
  getId() {
    return ParameterHintsWidget.ID;
  }
  updateMaxHeight() {
    if (!this.domNodes) {
      return;
    }
    const height = Math.max(this.editor.getLayoutInfo().height / 4, 250);
    const maxHeight = `${height}px`;
    this.domNodes.element.style.maxHeight = maxHeight;
    const wrapper = this.domNodes.element.getElementsByClassName("phwrapper");
    if (wrapper.length) {
      wrapper[0].style.maxHeight = maxHeight;
    }
  }
};
ParameterHintsWidget.ID = "editor.widget.parameterHintsWidget";
ParameterHintsWidget = __decorateClass([
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IMarkdownRendererService)
], ParameterHintsWidget);
registerColor("editorHoverWidget.highlightForeground", listHighlightForeground, nls.localize("editorHoverWidgetHighlightForeground", "Foreground color of the active item in the parameter hint."));
export {
  ParameterHintsWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3BhcmFtZXRlckhpbnRzL2Jyb3dzZXIvcGFyYW1ldGVySGludHNXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAnLi9wYXJhbWV0ZXJIaW50cy5jc3MnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0LCBJQ29udGVudFdpZGdldFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFRElUT1JfRk9OVF9ERUZBVUxUUyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZm9udEluZm8uanMnO1xuaW1wb3J0ICogYXMgbGFuZ3VhZ2VzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElSZW5kZXJlZE1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgUGFyYW1ldGVySGludHNNb2RlbCB9IGZyb20gJy4vcGFyYW1ldGVySGludHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBDb250ZXh0IH0gZnJvbSAnLi9wcm92aWRlU2lnbmF0dXJlSGVscC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGxpc3RIaWdobGlnaHRGb3JlZ3JvdW5kLCByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5cbmNvbnN0IHBhcmFtZXRlckhpbnRzTmV4dEljb24gPSByZWdpc3Rlckljb24oJ3BhcmFtZXRlci1oaW50cy1uZXh0JywgQ29kaWNvbi5jaGV2cm9uRG93biwgbmxzLmxvY2FsaXplKCdwYXJhbWV0ZXJIaW50c05leHRJY29uJywgJ0ljb24gZm9yIHNob3cgbmV4dCBwYXJhbWV0ZXIgaGludC4nKSk7XG5jb25zdCBwYXJhbWV0ZXJIaW50c1ByZXZpb3VzSWNvbiA9IHJlZ2lzdGVySWNvbigncGFyYW1ldGVyLWhpbnRzLXByZXZpb3VzJywgQ29kaWNvbi5jaGV2cm9uVXAsIG5scy5sb2NhbGl6ZSgncGFyYW1ldGVySGludHNQcmV2aW91c0ljb24nLCAnSWNvbiBmb3Igc2hvdyBwcmV2aW91cyBwYXJhbWV0ZXIgaGludC4nKSk7XG5cbmV4cG9ydCBjbGFzcyBQYXJhbWV0ZXJIaW50c1dpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLndpZGdldC5wYXJhbWV0ZXJIaW50c1dpZGdldCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJEaXNwb3NlYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGtleVZpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGtleU11bHRpcGxlU2lnbmF0dXJlczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBkb21Ob2Rlcz86IHtcblx0XHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0XHRyZWFkb25seSBzaWduYXR1cmU6IEhUTUxFbGVtZW50O1xuXHRcdHJlYWRvbmx5IGRvY3M6IEhUTUxFbGVtZW50O1xuXHRcdHJlYWRvbmx5IG92ZXJsb2FkczogSFRNTEVsZW1lbnQ7XG5cdFx0cmVhZG9ubHkgc2Nyb2xsYmFyOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0fTtcblxuXHRwcml2YXRlIHZpc2libGU6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBhbm5vdW5jZWRMYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0Ly8gRWRpdG9yLklDb250ZW50V2lkZ2V0LmFsbG93RWRpdG9yT3ZlcmZsb3dcblx0YWxsb3dFZGl0b3JPdmVyZmxvdyA9IHRydWU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IFBhcmFtZXRlckhpbnRzTW9kZWwsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5rZXlWaXNpYmxlID0gQ29udGV4dC5WaXNpYmxlLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5rZXlNdWx0aXBsZVNpZ25hdHVyZXMgPSBDb250ZXh0Lk11bHRpcGxlU2lnbmF0dXJlcy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVQYXJhbWV0ZXJIaW50RE9NTm9kZXMoKSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9ICQoJy5lZGl0b3Itd2lkZ2V0LnBhcmFtZXRlci1oaW50cy13aWRnZXQnKTtcblx0XHRjb25zdCB3cmFwcGVyID0gZG9tLmFwcGVuZChlbGVtZW50LCAkKCcucGh3cmFwcGVyJykpO1xuXHRcdHdyYXBwZXIudGFiSW5kZXggPSAtMTtcblxuXHRcdGNvbnN0IGNvbnRyb2xzID0gZG9tLmFwcGVuZCh3cmFwcGVyLCAkKCcuY29udHJvbHMnKSk7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSBkb20uYXBwZW5kKGNvbnRyb2xzLCAkKCcuYnV0dG9uJyArIFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHBhcmFtZXRlckhpbnRzUHJldmlvdXNJY29uKSkpO1xuXHRcdGNvbnN0IG92ZXJsb2FkcyA9IGRvbS5hcHBlbmQoY29udHJvbHMsICQoJy5vdmVybG9hZHMnKSk7XG5cdFx0Y29uc3QgbmV4dCA9IGRvbS5hcHBlbmQoY29udHJvbHMsICQoJy5idXR0b24nICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IocGFyYW1ldGVySGludHNOZXh0SWNvbikpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocHJldmlvdXMsICdjbGljaycsIGUgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHR0aGlzLnByZXZpb3VzKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihuZXh0LCAnY2xpY2snLCBlID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0dGhpcy5uZXh0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYm9keSA9ICQoJy5ib2R5Jyk7XG5cdFx0Y29uc3Qgc2Nyb2xsYmFyID0gbmV3IERvbVNjcm9sbGFibGVFbGVtZW50KGJvZHksIHtcblx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNjcm9sbGJhcik7XG5cdFx0d3JhcHBlci5hcHBlbmRDaGlsZChzY3JvbGxiYXIuZ2V0RG9tTm9kZSgpKTtcblxuXHRcdGNvbnN0IHNpZ25hdHVyZSA9IGRvbS5hcHBlbmQoYm9keSwgJCgnLnNpZ25hdHVyZScpKTtcblx0XHRjb25zdCBkb2NzID0gZG9tLmFwcGVuZChib2R5LCAkKCcuZG9jcycpKTtcblxuXHRcdGVsZW1lbnQuc3R5bGUudXNlclNlbGVjdCA9ICd0ZXh0JztcblxuXHRcdHRoaXMuZG9tTm9kZXMgPSB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0c2lnbmF0dXJlLFxuXHRcdFx0b3ZlcmxvYWRzLFxuXHRcdFx0ZG9jcyxcblx0XHRcdHNjcm9sbGJhcixcblx0XHR9O1xuXG5cdFx0dGhpcy5lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLmhpZGUoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUZvbnQgPSAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZG9tTm9kZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZG9tTm9kZXMuZWxlbWVudDtcblx0XHRcdGVsZW1lbnQuc3R5bGUuZm9udFNpemUgPSBgJHtmb250SW5mby5mb250U2l6ZX1weGA7XG5cdFx0XHRlbGVtZW50LnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtmb250SW5mby5saW5lSGVpZ2h0IC8gZm9udEluZm8uZm9udFNpemV9YDtcblx0XHRcdGVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLXBhcmFtZXRlckhpbnRzV2lkZ2V0LWVkaXRvckZvbnRGYW1pbHknLCBmb250SW5mby5mb250RmFtaWx5KTtcblx0XHRcdGVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLXBhcmFtZXRlckhpbnRzV2lkZ2V0LWVkaXRvckZvbnRGYW1pbHlEZWZhdWx0JywgRURJVE9SX0ZPTlRfREVGQVVMVFMuZm9udEZhbWlseSk7XG5cdFx0fTtcblxuXHRcdHVwZGF0ZUZvbnQoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmNoYWluKFxuXHRcdFx0dGhpcy5lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLmJpbmQodGhpcy5lZGl0b3IpLFxuXHRcdFx0JCA9PiAkLmZpbHRlcihlID0+IGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pKVxuXHRcdCkodXBkYXRlRm9udCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3Iub25EaWRMYXlvdXRDaGFuZ2UoZSA9PiB0aGlzLnVwZGF0ZU1heEhlaWdodCgpKSk7XG5cdFx0dGhpcy51cGRhdGVNYXhIZWlnaHQoKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZG9tTm9kZXMpIHtcblx0XHRcdHRoaXMuY3JlYXRlUGFyYW1ldGVySGludERPTU5vZGVzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5rZXlWaXNpYmxlLnNldCh0cnVlKTtcblx0XHR0aGlzLnZpc2libGUgPSB0cnVlO1xuXHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5kb21Ob2Rlcz8uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCd2aXNpYmxlJyk7XG5cdFx0fSwgMTAwKTtcblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NlYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5rZXlWaXNpYmxlLnJlc2V0KCk7XG5cdFx0dGhpcy52aXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5hbm5vdW5jZWRMYWJlbCA9IG51bGw7XG5cdFx0dGhpcy5kb21Ob2Rlcz8uZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCd2aXNpYmxlJyk7XG5cdFx0dGhpcy5lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRpZiAodGhpcy52aXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRwb3NpdGlvbjogdGhpcy5lZGl0b3IuZ2V0UG9zaXRpb24oKSxcblx0XHRcdFx0cHJlZmVyZW5jZTogW0NvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkUsIENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQkVMT1ddXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoaGludHM6IGxhbmd1YWdlcy5TaWduYXR1cmVIZWxwKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJEaXNwb3NlYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICghdGhpcy5kb21Ob2Rlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG11bHRpcGxlID0gaGludHMuc2lnbmF0dXJlcy5sZW5ndGggPiAxO1xuXHRcdHRoaXMuZG9tTm9kZXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtdWx0aXBsZScsIG11bHRpcGxlKTtcblx0XHR0aGlzLmtleU11bHRpcGxlU2lnbmF0dXJlcy5zZXQobXVsdGlwbGUpO1xuXG5cdFx0dGhpcy5kb21Ob2Rlcy5zaWduYXR1cmUuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5kb21Ob2Rlcy5kb2NzLmlubmVyVGV4dCA9ICcnO1xuXG5cdFx0Y29uc3Qgc2lnbmF0dXJlID0gaGludHMuc2lnbmF0dXJlc1toaW50cy5hY3RpdmVTaWduYXR1cmVdO1xuXHRcdGlmICghc2lnbmF0dXJlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZSA9IGRvbS5hcHBlbmQodGhpcy5kb21Ob2Rlcy5zaWduYXR1cmUsICQoJy5jb2RlJykpO1xuXHRcdGNvbnN0IGhhc1BhcmFtZXRlcnMgPSBzaWduYXR1cmUucGFyYW1ldGVycy5sZW5ndGggPiAwO1xuXHRcdGNvbnN0IGFjdGl2ZVBhcmFtZXRlckluZGV4ID0gc2lnbmF0dXJlLmFjdGl2ZVBhcmFtZXRlciA/PyBoaW50cy5hY3RpdmVQYXJhbWV0ZXI7XG5cblx0XHRpZiAoIWhhc1BhcmFtZXRlcnMpIHtcblx0XHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb2RlLCAkKCdzcGFuJykpO1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBzaWduYXR1cmUubGFiZWw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMucmVuZGVyUGFyYW1ldGVycyhjb2RlLCBzaWduYXR1cmUsIGFjdGl2ZVBhcmFtZXRlckluZGV4KTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVQYXJhbWV0ZXI6IGxhbmd1YWdlcy5QYXJhbWV0ZXJJbmZvcm1hdGlvbiB8IHVuZGVmaW5lZCA9IHNpZ25hdHVyZS5wYXJhbWV0ZXJzW2FjdGl2ZVBhcmFtZXRlckluZGV4XTtcblx0XHRpZiAoYWN0aXZlUGFyYW1ldGVyPy5kb2N1bWVudGF0aW9uKSB7XG5cdFx0XHRjb25zdCBkb2N1bWVudGF0aW9uID0gJCgnc3Bhbi5kb2N1bWVudGF0aW9uJyk7XG5cdFx0XHRpZiAodHlwZW9mIGFjdGl2ZVBhcmFtZXRlci5kb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRkb2N1bWVudGF0aW9uLnRleHRDb250ZW50ID0gYWN0aXZlUGFyYW1ldGVyLmRvY3VtZW50YXRpb247XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZW5kZXJlZENvbnRlbnRzID0gdGhpcy5yZW5kZXJNYXJrZG93bkRvY3MoYWN0aXZlUGFyYW1ldGVyLmRvY3VtZW50YXRpb24pO1xuXHRcdFx0XHRkb2N1bWVudGF0aW9uLmFwcGVuZENoaWxkKHJlbmRlcmVkQ29udGVudHMuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRkb20uYXBwZW5kKHRoaXMuZG9tTm9kZXMuZG9jcywgJCgncCcsIHt9LCBkb2N1bWVudGF0aW9uKSk7XG5cdFx0fVxuXG5cdFx0aWYgKHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdC8qKiBubyBvcCAqL1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0ZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGVzLmRvY3MsICQoJ3AnLCB7fSwgc2lnbmF0dXJlLmRvY3VtZW50YXRpb24pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRDb250ZW50cyA9IHRoaXMucmVuZGVyTWFya2Rvd25Eb2NzKHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uKTtcblx0XHRcdGRvbS5hcHBlbmQodGhpcy5kb21Ob2Rlcy5kb2NzLCByZW5kZXJlZENvbnRlbnRzLmVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0RvY3MgPSB0aGlzLmhhc0RvY3Moc2lnbmF0dXJlLCBhY3RpdmVQYXJhbWV0ZXIpO1xuXG5cdFx0dGhpcy5kb21Ob2Rlcy5zaWduYXR1cmUuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWRvY3MnLCBoYXNEb2NzKTtcblx0XHR0aGlzLmRvbU5vZGVzLmRvY3MuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHknLCAhaGFzRG9jcyk7XG5cblx0XHR0aGlzLmRvbU5vZGVzLm92ZXJsb2Fkcy50ZXh0Q29udGVudCA9XG5cdFx0XHRTdHJpbmcoaGludHMuYWN0aXZlU2lnbmF0dXJlICsgMSkucGFkU3RhcnQoaGludHMuc2lnbmF0dXJlcy5sZW5ndGgudG9TdHJpbmcoKS5sZW5ndGgsICcwJykgKyAnLycgKyBoaW50cy5zaWduYXR1cmVzLmxlbmd0aDtcblxuXHRcdGlmIChhY3RpdmVQYXJhbWV0ZXIpIHtcblx0XHRcdGxldCBsYWJlbFRvQW5ub3VuY2UgPSAnJztcblx0XHRcdGNvbnN0IHBhcmFtID0gc2lnbmF0dXJlLnBhcmFtZXRlcnNbYWN0aXZlUGFyYW1ldGVySW5kZXhdO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocGFyYW0ubGFiZWwpKSB7XG5cdFx0XHRcdGxhYmVsVG9Bbm5vdW5jZSA9IHNpZ25hdHVyZS5sYWJlbC5zdWJzdHJpbmcocGFyYW0ubGFiZWxbMF0sIHBhcmFtLmxhYmVsWzFdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhYmVsVG9Bbm5vdW5jZSA9IHBhcmFtLmxhYmVsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhcmFtLmRvY3VtZW50YXRpb24pIHtcblx0XHRcdFx0bGFiZWxUb0Fubm91bmNlICs9IHR5cGVvZiBwYXJhbS5kb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJyA/IGAsICR7cGFyYW0uZG9jdW1lbnRhdGlvbn1gIDogYCwgJHtwYXJhbS5kb2N1bWVudGF0aW9uLnZhbHVlfWA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2lnbmF0dXJlLmRvY3VtZW50YXRpb24pIHtcblx0XHRcdFx0bGFiZWxUb0Fubm91bmNlICs9IHR5cGVvZiBzaWduYXR1cmUuZG9jdW1lbnRhdGlvbiA9PT0gJ3N0cmluZycgPyBgLCAke3NpZ25hdHVyZS5kb2N1bWVudGF0aW9ufWAgOiBgLCAke3NpZ25hdHVyZS5kb2N1bWVudGF0aW9uLnZhbHVlfWA7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNlbGVjdCBtZXRob2QgZ2V0cyBjYWxsZWQgb24gZXZlcnkgdXNlciB0eXBlIHdoaWxlIHBhcmFtZXRlciBoaW50cyBhcmUgdmlzaWJsZS5cblx0XHRcdC8vIFdlIGRvIG5vdCB3YW50IHRvIHNwYW0gdGhlIHVzZXIgd2l0aCBzYW1lIGFubm91bmNlbWVudHMsIHNvIHdlIG9ubHkgYW5ub3VuY2UgaWYgdGhlIGN1cnJlbnQgcGFyYW1ldGVyIGNoYW5nZWQuXG5cblx0XHRcdGlmICh0aGlzLmFubm91bmNlZExhYmVsICE9PSBsYWJlbFRvQW5ub3VuY2UpIHtcblx0XHRcdFx0YXJpYS5hbGVydChubHMubG9jYWxpemUoJ2hpbnQnLCBcInswfSwgaGludFwiLCBsYWJlbFRvQW5ub3VuY2UpKTtcblx0XHRcdFx0dGhpcy5hbm5vdW5jZWRMYWJlbCA9IGxhYmVsVG9Bbm5vdW5jZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmVkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuZG9tTm9kZXMuc2Nyb2xsYmFyLnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck1hcmtkb3duRG9jcyhtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nKTogSVJlbmRlcmVkTWFya2Rvd24ge1xuXHRcdGNvbnN0IHJlbmRlcmVkQ29udGVudHMgPSB0aGlzLnJlbmRlckRpc3Bvc2VhYmxlcy5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobWFya2Rvd24sIHtcblx0XHRcdGNvbnRleHQ6IHRoaXMuZWRpdG9yLFxuXHRcdFx0YXN5bmNSZW5kZXJDYWxsYmFjazogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRvbU5vZGVzPy5zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmVuZGVyZWRDb250ZW50cy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21hcmtkb3duLWRvY3MnKTtcblx0XHRyZXR1cm4gcmVuZGVyZWRDb250ZW50cztcblx0fVxuXG5cdHByaXZhdGUgaGFzRG9jcyhzaWduYXR1cmU6IGxhbmd1YWdlcy5TaWduYXR1cmVJbmZvcm1hdGlvbiwgYWN0aXZlUGFyYW1ldGVyOiBsYW5ndWFnZXMuUGFyYW1ldGVySW5mb3JtYXRpb24gfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoYWN0aXZlUGFyYW1ldGVyICYmIHR5cGVvZiBhY3RpdmVQYXJhbWV0ZXIuZG9jdW1lbnRhdGlvbiA9PT0gJ3N0cmluZycgJiYgYXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZlUGFyYW1ldGVyLmRvY3VtZW50YXRpb24pLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoYWN0aXZlUGFyYW1ldGVyICYmIHR5cGVvZiBhY3RpdmVQYXJhbWV0ZXIuZG9jdW1lbnRhdGlvbiA9PT0gJ29iamVjdCcgJiYgYXNzZXJ0UmV0dXJuc0RlZmluZWQoYWN0aXZlUGFyYW1ldGVyLmRvY3VtZW50YXRpb24pLnZhbHVlLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoc2lnbmF0dXJlLmRvY3VtZW50YXRpb24gJiYgdHlwZW9mIHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uID09PSAnc3RyaW5nJyAmJiBhc3NlcnRSZXR1cm5zRGVmaW5lZChzaWduYXR1cmUuZG9jdW1lbnRhdGlvbikubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChzaWduYXR1cmUuZG9jdW1lbnRhdGlvbiAmJiB0eXBlb2Ygc2lnbmF0dXJlLmRvY3VtZW50YXRpb24gPT09ICdvYmplY3QnICYmIGFzc2VydFJldHVybnNEZWZpbmVkKHNpZ25hdHVyZS5kb2N1bWVudGF0aW9uLnZhbHVlKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQYXJhbWV0ZXJzKHBhcmVudDogSFRNTEVsZW1lbnQsIHNpZ25hdHVyZTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUluZm9ybWF0aW9uLCBhY3RpdmVQYXJhbWV0ZXJJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgW3N0YXJ0LCBlbmRdID0gdGhpcy5nZXRQYXJhbWV0ZXJMYWJlbE9mZnNldHMoc2lnbmF0dXJlLCBhY3RpdmVQYXJhbWV0ZXJJbmRleCk7XG5cblx0XHRjb25zdCBiZWZvcmVTcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGJlZm9yZVNwYW4udGV4dENvbnRlbnQgPSBzaWduYXR1cmUubGFiZWwuc3Vic3RyaW5nKDAsIHN0YXJ0KTtcblxuXHRcdGNvbnN0IHBhcmFtU3BhbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRwYXJhbVNwYW4udGV4dENvbnRlbnQgPSBzaWduYXR1cmUubGFiZWwuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpO1xuXHRcdHBhcmFtU3Bhbi5jbGFzc05hbWUgPSAncGFyYW1ldGVyIGFjdGl2ZSc7XG5cblx0XHRjb25zdCBhZnRlclNwYW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0YWZ0ZXJTcGFuLnRleHRDb250ZW50ID0gc2lnbmF0dXJlLmxhYmVsLnN1YnN0cmluZyhlbmQpO1xuXG5cdFx0ZG9tLmFwcGVuZChwYXJlbnQsIGJlZm9yZVNwYW4sIHBhcmFtU3BhbiwgYWZ0ZXJTcGFuKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGFyYW1ldGVyTGFiZWxPZmZzZXRzKHNpZ25hdHVyZTogbGFuZ3VhZ2VzLlNpZ25hdHVyZUluZm9ybWF0aW9uLCBwYXJhbUlkeDogbnVtYmVyKTogW251bWJlciwgbnVtYmVyXSB7XG5cdFx0Y29uc3QgcGFyYW0gPSBzaWduYXR1cmUucGFyYW1ldGVyc1twYXJhbUlkeF07XG5cdFx0aWYgKCFwYXJhbSkge1xuXHRcdFx0cmV0dXJuIFswLCAwXTtcblx0XHR9IGVsc2UgaWYgKEFycmF5LmlzQXJyYXkocGFyYW0ubGFiZWwpKSB7XG5cdFx0XHRyZXR1cm4gcGFyYW0ubGFiZWw7XG5cdFx0fSBlbHNlIGlmICghcGFyYW0ubGFiZWwubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gWzAsIDBdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZWdleCA9IG5ldyBSZWdFeHAoYChcXFxcV3xeKSR7ZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhwYXJhbS5sYWJlbCl9KD89XFxcXFd8JClgLCAnZycpO1xuXHRcdFx0cmVnZXgudGVzdChzaWduYXR1cmUubGFiZWwpO1xuXHRcdFx0Y29uc3QgaWR4ID0gcmVnZXgubGFzdEluZGV4IC0gcGFyYW0ubGFiZWwubGVuZ3RoO1xuXHRcdFx0cmV0dXJuIGlkeCA+PSAwXG5cdFx0XHRcdD8gW2lkeCwgcmVnZXgubGFzdEluZGV4XVxuXHRcdFx0XHQ6IFswLCAwXTtcblx0XHR9XG5cdH1cblxuXHRuZXh0KCk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0dGhpcy5tb2RlbC5uZXh0KCk7XG5cdH1cblxuXHRwcmV2aW91cygpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvci5mb2N1cygpO1xuXHRcdHRoaXMubW9kZWwucHJldmlvdXMoKTtcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdGlmICghdGhpcy5kb21Ob2Rlcykge1xuXHRcdFx0dGhpcy5jcmVhdGVQYXJhbWV0ZXJIaW50RE9NTm9kZXMoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZXMhLmVsZW1lbnQ7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBQYXJhbWV0ZXJIaW50c1dpZGdldC5JRDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWF4SGVpZ2h0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kb21Ob2Rlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1heCh0aGlzLmVkaXRvci5nZXRMYXlvdXRJbmZvKCkuaGVpZ2h0IC8gNCwgMjUwKTtcblx0XHRjb25zdCBtYXhIZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXHRcdHRoaXMuZG9tTm9kZXMuZWxlbWVudC5zdHlsZS5tYXhIZWlnaHQgPSBtYXhIZWlnaHQ7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuZG9tTm9kZXMuZWxlbWVudC5nZXRFbGVtZW50c0J5Q2xhc3NOYW1lKCdwaHdyYXBwZXInKSBhcyBIVE1MQ29sbGVjdGlvbk9mPEhUTUxFbGVtZW50Pjtcblx0XHRpZiAod3JhcHBlci5sZW5ndGgpIHtcblx0XHRcdHdyYXBwZXJbMF0uc3R5bGUubWF4SGVpZ2h0ID0gbWF4SGVpZ2h0O1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckNvbG9yKCdlZGl0b3JIb3ZlcldpZGdldC5oaWdobGlnaHRGb3JlZ3JvdW5kJywgbGlzdEhpZ2hsaWdodEZvcmVncm91bmQsIG5scy5sb2NhbGl6ZSgnZWRpdG9ySG92ZXJXaWRnZXRIaWdobGlnaHRGb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3Igb2YgdGhlIGFjdGl2ZSBpdGVtIGluIHRoZSBwYXJhbWV0ZXIgaGludC4nKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLFVBQVU7QUFDdEIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBYTtBQUV0QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCO0FBQ3JDLE9BQU87QUFDUCxTQUFTLHVDQUE0RjtBQUNyRyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLGdDQUFnQztBQUd6QyxTQUFTLGVBQWU7QUFDeEIsWUFBWSxTQUFTO0FBQ3JCLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHlCQUF5QixxQkFBcUI7QUFDdkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFFMUIsTUFBTSxJQUFJLElBQUk7QUFFZCxNQUFNLHlCQUF5QixhQUFhLHdCQUF3QixRQUFRLGFBQWEsSUFBSSxTQUFTLDBCQUEwQixvQ0FBb0MsQ0FBQztBQUNySyxNQUFNLDZCQUE2QixhQUFhLDRCQUE0QixRQUFRLFdBQVcsSUFBSSxTQUFTLDhCQUE4Qix3Q0FBd0MsQ0FBQztBQUU1SyxJQUFNLHVCQUFOLGNBQW1DLFdBQXFDO0FBQUEsRUFzQjlFLFlBQ2tCLFFBQ0EsT0FDRyxtQkFDdUIseUJBQzFDO0FBQ0QsVUFBTTtBQUxXO0FBQ0E7QUFFMEI7QUF0QjVDLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQVkxRSxTQUFRLFVBQW1CO0FBQzNCLFNBQVEsaUJBQWdDO0FBR3hDO0FBQUEsK0JBQXNCO0FBVXJCLFNBQUssYUFBYSxRQUFRLFFBQVEsT0FBTyxpQkFBaUI7QUFDMUQsU0FBSyx3QkFBd0IsUUFBUSxtQkFBbUIsT0FBTyxpQkFBaUI7QUFBQSxFQUNqRjtBQUFBLEVBRVEsOEJBQThCO0FBQ3JDLFVBQU0sVUFBVSxFQUFFLHVDQUF1QztBQUN6RCxVQUFNLFVBQVUsSUFBSSxPQUFPLFNBQVMsRUFBRSxZQUFZLENBQUM7QUFDbkQsWUFBUSxXQUFXO0FBRW5CLFVBQU0sV0FBVyxJQUFJLE9BQU8sU0FBUyxFQUFFLFdBQVcsQ0FBQztBQUNuRCxVQUFNLFdBQVcsSUFBSSxPQUFPLFVBQVUsRUFBRSxZQUFZLFVBQVUsY0FBYywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3hHLFVBQU0sWUFBWSxJQUFJLE9BQU8sVUFBVSxFQUFFLFlBQVksQ0FBQztBQUN0RCxVQUFNLE9BQU8sSUFBSSxPQUFPLFVBQVUsRUFBRSxZQUFZLFVBQVUsY0FBYyxzQkFBc0IsQ0FBQyxDQUFDO0FBRWhHLFNBQUssVUFBVSxJQUFJLHNCQUFzQixVQUFVLFNBQVMsT0FBSztBQUNoRSxVQUFJLFlBQVksS0FBSyxDQUFDO0FBQ3RCLFdBQUssU0FBUztBQUFBLElBQ2YsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLElBQUksc0JBQXNCLE1BQU0sU0FBUyxPQUFLO0FBQzVELFVBQUksWUFBWSxLQUFLLENBQUM7QUFDdEIsV0FBSyxLQUFLO0FBQUEsSUFDWCxDQUFDLENBQUM7QUFFRixVQUFNLE9BQU8sRUFBRSxPQUFPO0FBQ3RCLFVBQU0sWUFBWSxJQUFJLHFCQUFxQixNQUFNO0FBQUEsTUFDaEQseUJBQXlCO0FBQUEsSUFDMUIsQ0FBQztBQUNELFNBQUssVUFBVSxTQUFTO0FBQ3hCLFlBQVEsWUFBWSxVQUFVLFdBQVcsQ0FBQztBQUUxQyxVQUFNLFlBQVksSUFBSSxPQUFPLE1BQU0sRUFBRSxZQUFZLENBQUM7QUFDbEQsVUFBTSxPQUFPLElBQUksT0FBTyxNQUFNLEVBQUUsT0FBTyxDQUFDO0FBRXhDLFlBQVEsTUFBTSxhQUFhO0FBRTNCLFNBQUssV0FBVztBQUFBLE1BQ2Y7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLFNBQUssT0FBTyxpQkFBaUIsSUFBSTtBQUNqQyxTQUFLLEtBQUs7QUFFVixTQUFLLFVBQVUsS0FBSyxPQUFPLDJCQUEyQixPQUFLO0FBQzFELFVBQUksS0FBSyxTQUFTO0FBQ2pCLGFBQUssT0FBTyxvQkFBb0IsSUFBSTtBQUFBLE1BQ3JDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLGFBQWEsTUFBTTtBQUN4QixVQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CO0FBQUEsTUFDRDtBQUVBLFlBQU0sV0FBVyxLQUFLLE9BQU8sVUFBVSxhQUFhLFFBQVE7QUFDNUQsWUFBTUEsV0FBVSxLQUFLLFNBQVM7QUFDOUIsTUFBQUEsU0FBUSxNQUFNLFdBQVcsR0FBRyxTQUFTLFFBQVE7QUFDN0MsTUFBQUEsU0FBUSxNQUFNLGFBQWEsR0FBRyxTQUFTLGFBQWEsU0FBUyxRQUFRO0FBQ3JFLE1BQUFBLFNBQVEsTUFBTSxZQUFZLGtEQUFrRCxTQUFTLFVBQVU7QUFDL0YsTUFBQUEsU0FBUSxNQUFNLFlBQVkseURBQXlELHFCQUFxQixVQUFVO0FBQUEsSUFDbkg7QUFFQSxlQUFXO0FBRVgsU0FBSyxVQUFVLE1BQU07QUFBQSxNQUNwQixLQUFLLE9BQU8seUJBQXlCLEtBQUssS0FBSyxNQUFNO0FBQUEsTUFDckQsQ0FBQUMsT0FBS0EsR0FBRSxPQUFPLE9BQUssRUFBRSxXQUFXLGFBQWEsUUFBUSxDQUFDO0FBQUEsSUFDdkQsRUFBRSxVQUFVLENBQUM7QUFFYixTQUFLLFVBQVUsS0FBSyxPQUFPLGtCQUFrQixPQUFLLEtBQUssZ0JBQWdCLENBQUMsQ0FBQztBQUN6RSxTQUFLLGdCQUFnQjtBQUFBLEVBQ3RCO0FBQUEsRUFFTyxPQUFhO0FBQ25CLFFBQUksS0FBSyxTQUFTO0FBQ2pCO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxLQUFLLFVBQVU7QUFDbkIsV0FBSyw0QkFBNEI7QUFBQSxJQUNsQztBQUVBLFNBQUssV0FBVyxJQUFJLElBQUk7QUFDeEIsU0FBSyxVQUFVO0FBQ2YsZUFBVyxNQUFNO0FBQ2hCLFdBQUssVUFBVSxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBQUEsSUFDL0MsR0FBRyxHQUFHO0FBQ04sU0FBSyxPQUFPLG9CQUFvQixJQUFJO0FBQUEsRUFDckM7QUFBQSxFQUVPLE9BQWE7QUFDbkIsU0FBSyxtQkFBbUIsTUFBTTtBQUU5QixRQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsSUFDRDtBQUVBLFNBQUssV0FBVyxNQUFNO0FBQ3RCLFNBQUssVUFBVTtBQUNmLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssVUFBVSxRQUFRLFVBQVUsT0FBTyxTQUFTO0FBQ2pELFNBQUssT0FBTyxvQkFBb0IsSUFBSTtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxjQUE2QztBQUM1QyxRQUFJLEtBQUssU0FBUztBQUNqQixhQUFPO0FBQUEsUUFDTixVQUFVLEtBQUssT0FBTyxZQUFZO0FBQUEsUUFDbEMsWUFBWSxDQUFDLGdDQUFnQyxPQUFPLGdDQUFnQyxLQUFLO0FBQUEsTUFDMUY7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLE9BQU8sT0FBc0M7QUFDbkQsU0FBSyxtQkFBbUIsTUFBTTtBQUU5QixRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CO0FBQUEsSUFDRDtBQUVBLFVBQU0sV0FBVyxNQUFNLFdBQVcsU0FBUztBQUMzQyxTQUFLLFNBQVMsUUFBUSxVQUFVLE9BQU8sWUFBWSxRQUFRO0FBQzNELFNBQUssc0JBQXNCLElBQUksUUFBUTtBQUV2QyxTQUFLLFNBQVMsVUFBVSxZQUFZO0FBQ3BDLFNBQUssU0FBUyxLQUFLLFlBQVk7QUFFL0IsVUFBTSxZQUFZLE1BQU0sV0FBVyxNQUFNLGVBQWU7QUFDeEQsUUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLElBQ0Q7QUFFQSxVQUFNLE9BQU8sSUFBSSxPQUFPLEtBQUssU0FBUyxXQUFXLEVBQUUsT0FBTyxDQUFDO0FBQzNELFVBQU0sZ0JBQWdCLFVBQVUsV0FBVyxTQUFTO0FBQ3BELFVBQU0sdUJBQXVCLFVBQVUsbUJBQW1CLE1BQU07QUFFaEUsUUFBSSxDQUFDLGVBQWU7QUFDbkIsWUFBTSxRQUFRLElBQUksT0FBTyxNQUFNLEVBQUUsTUFBTSxDQUFDO0FBQ3hDLFlBQU0sY0FBYyxVQUFVO0FBQUEsSUFDL0IsT0FBTztBQUNOLFdBQUssaUJBQWlCLE1BQU0sV0FBVyxvQkFBb0I7QUFBQSxJQUM1RDtBQUVBLFVBQU0sa0JBQThELFVBQVUsV0FBVyxvQkFBb0I7QUFDN0csUUFBSSxpQkFBaUIsZUFBZTtBQUNuQyxZQUFNLGdCQUFnQixFQUFFLG9CQUFvQjtBQUM1QyxVQUFJLE9BQU8sZ0JBQWdCLGtCQUFrQixVQUFVO0FBQ3RELHNCQUFjLGNBQWMsZ0JBQWdCO0FBQUEsTUFDN0MsT0FBTztBQUNOLGNBQU0sbUJBQW1CLEtBQUssbUJBQW1CLGdCQUFnQixhQUFhO0FBQzlFLHNCQUFjLFlBQVksaUJBQWlCLE9BQU87QUFBQSxNQUNuRDtBQUNBLFVBQUksT0FBTyxLQUFLLFNBQVMsTUFBTSxFQUFFLEtBQUssQ0FBQyxHQUFHLGFBQWEsQ0FBQztBQUFBLElBQ3pEO0FBRUEsUUFBSSxVQUFVLGtCQUFrQixRQUFXO0FBQUEsSUFFM0MsV0FBVyxPQUFPLFVBQVUsa0JBQWtCLFVBQVU7QUFDdkQsVUFBSSxPQUFPLEtBQUssU0FBUyxNQUFNLEVBQUUsS0FBSyxDQUFDLEdBQUcsVUFBVSxhQUFhLENBQUM7QUFBQSxJQUNuRSxPQUFPO0FBQ04sWUFBTSxtQkFBbUIsS0FBSyxtQkFBbUIsVUFBVSxhQUFhO0FBQ3hFLFVBQUksT0FBTyxLQUFLLFNBQVMsTUFBTSxpQkFBaUIsT0FBTztBQUFBLElBQ3hEO0FBRUEsVUFBTSxVQUFVLEtBQUssUUFBUSxXQUFXLGVBQWU7QUFFdkQsU0FBSyxTQUFTLFVBQVUsVUFBVSxPQUFPLFlBQVksT0FBTztBQUM1RCxTQUFLLFNBQVMsS0FBSyxVQUFVLE9BQU8sU0FBUyxDQUFDLE9BQU87QUFFckQsU0FBSyxTQUFTLFVBQVUsY0FDdkIsT0FBTyxNQUFNLGtCQUFrQixDQUFDLEVBQUUsU0FBUyxNQUFNLFdBQVcsT0FBTyxTQUFTLEVBQUUsUUFBUSxHQUFHLElBQUksTUFBTSxNQUFNLFdBQVc7QUFFckgsUUFBSSxpQkFBaUI7QUFDcEIsVUFBSSxrQkFBa0I7QUFDdEIsWUFBTSxRQUFRLFVBQVUsV0FBVyxvQkFBb0I7QUFDdkQsVUFBSSxNQUFNLFFBQVEsTUFBTSxLQUFLLEdBQUc7QUFDL0IsMEJBQWtCLFVBQVUsTUFBTSxVQUFVLE1BQU0sTUFBTSxDQUFDLEdBQUcsTUFBTSxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQzNFLE9BQU87QUFDTiwwQkFBa0IsTUFBTTtBQUFBLE1BQ3pCO0FBQ0EsVUFBSSxNQUFNLGVBQWU7QUFDeEIsMkJBQW1CLE9BQU8sTUFBTSxrQkFBa0IsV0FBVyxLQUFLLE1BQU0sYUFBYSxLQUFLLEtBQUssTUFBTSxjQUFjLEtBQUs7QUFBQSxNQUN6SDtBQUNBLFVBQUksVUFBVSxlQUFlO0FBQzVCLDJCQUFtQixPQUFPLFVBQVUsa0JBQWtCLFdBQVcsS0FBSyxVQUFVLGFBQWEsS0FBSyxLQUFLLFVBQVUsY0FBYyxLQUFLO0FBQUEsTUFDckk7QUFLQSxVQUFJLEtBQUssbUJBQW1CLGlCQUFpQjtBQUM1QyxhQUFLLE1BQU0sSUFBSSxTQUFTLFFBQVEsYUFBYSxlQUFlLENBQUM7QUFDN0QsYUFBSyxpQkFBaUI7QUFBQSxNQUN2QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLE9BQU8sb0JBQW9CLElBQUk7QUFDcEMsU0FBSyxTQUFTLFVBQVUsWUFBWTtBQUFBLEVBQ3JDO0FBQUEsRUFFUSxtQkFBbUIsVUFBOEM7QUFDeEUsVUFBTSxtQkFBbUIsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLHdCQUF3QixPQUFPLFVBQVU7QUFBQSxNQUNsRyxTQUFTLEtBQUs7QUFBQSxNQUNkLHFCQUFxQixNQUFNO0FBQzFCLGFBQUssVUFBVSxVQUFVLFlBQVk7QUFBQSxNQUN0QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YscUJBQWlCLFFBQVEsVUFBVSxJQUFJLGVBQWU7QUFDdEQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLFFBQVEsV0FBMkMsaUJBQXNFO0FBQ2hJLFFBQUksbUJBQW1CLE9BQU8sZ0JBQWdCLGtCQUFrQixZQUFZLHFCQUFxQixnQkFBZ0IsYUFBYSxFQUFFLFNBQVMsR0FBRztBQUMzSSxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksbUJBQW1CLE9BQU8sZ0JBQWdCLGtCQUFrQixZQUFZLHFCQUFxQixnQkFBZ0IsYUFBYSxFQUFFLE1BQU0sU0FBUyxHQUFHO0FBQ2pKLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxVQUFVLGlCQUFpQixPQUFPLFVBQVUsa0JBQWtCLFlBQVkscUJBQXFCLFVBQVUsYUFBYSxFQUFFLFNBQVMsR0FBRztBQUN2SSxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksVUFBVSxpQkFBaUIsT0FBTyxVQUFVLGtCQUFrQixZQUFZLHFCQUFxQixVQUFVLGNBQWMsS0FBSyxFQUFFLFNBQVMsR0FBRztBQUM3SSxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxpQkFBaUIsUUFBcUIsV0FBMkMsc0JBQW9DO0FBQzVILFVBQU0sQ0FBQyxPQUFPLEdBQUcsSUFBSSxLQUFLLHlCQUF5QixXQUFXLG9CQUFvQjtBQUVsRixVQUFNLGFBQWEsU0FBUyxjQUFjLE1BQU07QUFDaEQsZUFBVyxjQUFjLFVBQVUsTUFBTSxVQUFVLEdBQUcsS0FBSztBQUUzRCxVQUFNLFlBQVksU0FBUyxjQUFjLE1BQU07QUFDL0MsY0FBVSxjQUFjLFVBQVUsTUFBTSxVQUFVLE9BQU8sR0FBRztBQUM1RCxjQUFVLFlBQVk7QUFFdEIsVUFBTSxZQUFZLFNBQVMsY0FBYyxNQUFNO0FBQy9DLGNBQVUsY0FBYyxVQUFVLE1BQU0sVUFBVSxHQUFHO0FBRXJELFFBQUksT0FBTyxRQUFRLFlBQVksV0FBVyxTQUFTO0FBQUEsRUFDcEQ7QUFBQSxFQUVRLHlCQUF5QixXQUEyQyxVQUFvQztBQUMvRyxVQUFNLFFBQVEsVUFBVSxXQUFXLFFBQVE7QUFDM0MsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDYixXQUFXLE1BQU0sUUFBUSxNQUFNLEtBQUssR0FBRztBQUN0QyxhQUFPLE1BQU07QUFBQSxJQUNkLFdBQVcsQ0FBQyxNQUFNLE1BQU0sUUFBUTtBQUMvQixhQUFPLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDYixPQUFPO0FBQ04sWUFBTSxRQUFRLElBQUksT0FBTyxVQUFVLHVCQUF1QixNQUFNLEtBQUssQ0FBQyxhQUFhLEdBQUc7QUFDdEYsWUFBTSxLQUFLLFVBQVUsS0FBSztBQUMxQixZQUFNLE1BQU0sTUFBTSxZQUFZLE1BQU0sTUFBTTtBQUMxQyxhQUFPLE9BQU8sSUFDWCxDQUFDLEtBQUssTUFBTSxTQUFTLElBQ3JCLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWE7QUFDWixTQUFLLE9BQU8sTUFBTTtBQUNsQixTQUFLLE1BQU0sS0FBSztBQUFBLEVBQ2pCO0FBQUEsRUFFQSxXQUFpQjtBQUNoQixTQUFLLE9BQU8sTUFBTTtBQUNsQixTQUFLLE1BQU0sU0FBUztBQUFBLEVBQ3JCO0FBQUEsRUFFQSxhQUEwQjtBQUN6QixRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CLFdBQUssNEJBQTRCO0FBQUEsSUFDbEM7QUFDQSxXQUFPLEtBQUssU0FBVTtBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxRQUFnQjtBQUNmLFdBQU8scUJBQXFCO0FBQUEsRUFDN0I7QUFBQSxFQUVRLGtCQUF3QjtBQUMvQixRQUFJLENBQUMsS0FBSyxVQUFVO0FBQ25CO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxLQUFLLElBQUksS0FBSyxPQUFPLGNBQWMsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUNuRSxVQUFNLFlBQVksR0FBRyxNQUFNO0FBQzNCLFNBQUssU0FBUyxRQUFRLE1BQU0sWUFBWTtBQUV4QyxVQUFNLFVBQVUsS0FBSyxTQUFTLFFBQVEsdUJBQXVCLFdBQVc7QUFDeEUsUUFBSSxRQUFRLFFBQVE7QUFDbkIsY0FBUSxDQUFDLEVBQUUsTUFBTSxZQUFZO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQ0Q7QUExVWEscUJBRVksS0FBSztBQUZqQix1QkFBTjtBQUFBLEVBeUJKO0FBQUEsRUFDQTtBQUFBLEdBMUJVO0FBNFViLGNBQWMseUNBQXlDLHlCQUF5QixJQUFJLFNBQVMsd0NBQXdDLDREQUE0RCxDQUFDOyIsCiAgIm5hbWVzIjogWyJlbGVtZW50IiwgIiQiXQp9Cg==
