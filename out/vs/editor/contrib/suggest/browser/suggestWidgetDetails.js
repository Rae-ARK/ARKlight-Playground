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
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import * as nls from "../../../../nls.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
function canExpandCompletionItem(item) {
  return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}
let SuggestDetailsWidget = class {
  constructor(_editor, _themeService, _markdownRendererService) {
    this._editor = _editor;
    this._themeService = _themeService;
    this._markdownRendererService = _markdownRendererService;
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeContents = new Emitter();
    this.onDidChangeContents = this._onDidChangeContents.event;
    this._disposables = new DisposableStore();
    this._renderDisposeable = new DisposableStore();
    this._size = new dom.Dimension(330, 0);
    this.domNode = dom.$(".suggest-details");
    this.domNode.classList.add("no-docs");
    this._body = dom.$(".body");
    this._scrollbar = new DomScrollableElement(this._body, {
      alwaysConsumeMouseWheel: true
    });
    dom.append(this.domNode, this._scrollbar.getDomNode());
    this._disposables.add(this._scrollbar);
    this._header = dom.append(this._body, dom.$(".header"));
    this._close = dom.append(this._header, dom.$("span" + ThemeIcon.asCSSSelector(Codicon.close)));
    this._close.title = nls.localize("details.close", "Close");
    this._close.ariaLabel = nls.localize("details.close", "Close");
    this._close.role = "button";
    this._close.tabIndex = -1;
    this._type = dom.append(this._header, dom.$("p.type"));
    this._docs = dom.append(this._body, dom.$("p.docs"));
    this._configureFont();
    this._disposables.add(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._configureFont();
      }
    }));
  }
  dispose() {
    this._disposables.dispose();
    this._renderDisposeable.dispose();
    this._onDidClose.dispose();
    this._onDidChangeContents.dispose();
  }
  _configureFont() {
    const options = this._editor.getOptions();
    const fontInfo = options.get(EditorOption.fontInfo);
    const fontFamily = fontInfo.getMassagedFontFamily();
    const fontSize = options.get(EditorOption.suggestFontSize) || fontInfo.fontSize;
    const lineHeight = options.get(EditorOption.suggestLineHeight) || fontInfo.lineHeight;
    const fontWeight = fontInfo.fontWeight;
    const fontSizePx = `${fontSize}px`;
    const lineHeightPx = `${lineHeight}px`;
    this.domNode.style.fontSize = fontSizePx;
    this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
    this.domNode.style.fontWeight = fontWeight;
    this.domNode.style.fontFeatureSettings = fontInfo.fontFeatureSettings;
    this._type.style.fontFamily = fontFamily;
    this._close.style.height = lineHeightPx;
    this._close.style.width = lineHeightPx;
  }
  getLayoutInfo() {
    const lineHeight = this._editor.getOption(EditorOption.suggestLineHeight) || this._editor.getOption(EditorOption.fontInfo).lineHeight;
    const borderWidth = isHighContrast(this._themeService.getColorTheme().type) ? 2 : 1;
    const borderHeight = borderWidth * 2;
    return {
      lineHeight,
      borderWidth,
      borderHeight,
      verticalPadding: 22,
      horizontalPadding: 14
    };
  }
  renderLoading() {
    this._type.textContent = nls.localize("loading", "Loading...");
    this._docs.textContent = "";
    this.domNode.classList.remove("no-docs", "no-type");
    this.layout(this.size.width, this.getLayoutInfo().lineHeight * 2);
    this._onDidChangeContents.fire(this);
  }
  renderItem(item, explainMode) {
    this._renderDisposeable.clear();
    let { detail, documentation } = item.completion;
    if (explainMode) {
      let md = "";
      md += `score: ${item.score[0]}
`;
      md += `prefix: ${item.word ?? "(no prefix)"}
`;
      md += `word: ${item.completion.filterText ? item.completion.filterText + " (filterText)" : item.textLabel}
`;
      md += `distance: ${item.distance} (localityBonus-setting)
`;
      md += `index: ${item.idx}, based on ${item.completion.sortText && `sortText: "${item.completion.sortText}"` || "label"}
`;
      md += `commit_chars: ${item.completion.commitCharacters?.join("")}
`;
      documentation = new MarkdownString().appendCodeblock("empty", md);
      detail = `Provider: ${item.provider._debugDisplayName}`;
    }
    if (!explainMode && !canExpandCompletionItem(item)) {
      this.clearContents();
      return;
    }
    this.domNode.classList.remove("no-docs", "no-type");
    if (detail) {
      const cappedDetail = detail.length > 1e5 ? `${detail.substr(0, 1e5)}\u2026` : detail;
      this._type.textContent = cappedDetail;
      this._type.title = cappedDetail;
      dom.show(this._type);
      this._type.classList.toggle("auto-wrap", !/\r?\n^\s+/gmi.test(cappedDetail));
    } else {
      dom.clearNode(this._type);
      this._type.title = "";
      dom.hide(this._type);
      this.domNode.classList.add("no-type");
    }
    dom.clearNode(this._docs);
    if (typeof documentation === "string") {
      this._docs.classList.remove("markdown-docs");
      this._docs.textContent = documentation;
    } else if (documentation) {
      this._docs.classList.add("markdown-docs");
      dom.clearNode(this._docs);
      const renderedContents = this._markdownRendererService.render(documentation, {
        context: this._editor,
        asyncRenderCallback: () => {
          this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
          this._onDidChangeContents.fire(this);
        }
      });
      this._docs.appendChild(renderedContents.element);
      this._renderDisposeable.add(renderedContents);
    }
    this.domNode.classList.toggle("detail-and-doc", !!detail && !!documentation);
    this.domNode.style.userSelect = "text";
    this.domNode.tabIndex = -1;
    this._close.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    this._close.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._onDidClose.fire();
    };
    this._body.scrollTop = 0;
    this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
    this._onDidChangeContents.fire(this);
  }
  clearContents() {
    this.domNode.classList.add("no-docs");
    this._type.textContent = "";
    this._docs.textContent = "";
  }
  get isEmpty() {
    return this.domNode.classList.contains("no-docs");
  }
  get size() {
    return this._size;
  }
  layout(width, height) {
    const newSize = new dom.Dimension(width, height);
    if (!dom.Dimension.equals(newSize, this._size)) {
      this._size = newSize;
      dom.size(this.domNode, width, height);
    }
    this._scrollbar.scanDomNode();
  }
  scrollDown(much = 8) {
    this._body.scrollTop += much;
  }
  scrollUp(much = 8) {
    this._body.scrollTop -= much;
  }
  scrollTop() {
    this._body.scrollTop = 0;
  }
  scrollBottom() {
    this._body.scrollTop = this._body.scrollHeight;
  }
  pageDown() {
    this.scrollDown(80);
  }
  pageUp() {
    this.scrollUp(80);
  }
  focus() {
    this.domNode.focus();
  }
};
SuggestDetailsWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IMarkdownRendererService)
], SuggestDetailsWidget);
class SuggestDetailsOverlay {
  constructor(widget, _editor) {
    this.widget = widget;
    this._editor = _editor;
    this.allowEditorOverflow = true;
    this._disposables = new DisposableStore();
    this._added = false;
    this._preferAlignAtTop = true;
    this._resizable = new ResizableHTMLElement();
    this._resizable.domNode.classList.add("suggest-details-container");
    this._resizable.domNode.appendChild(widget.domNode);
    this._resizable.enableSashes(false, true, true, false);
    let topLeftNow;
    let sizeNow;
    let deltaTop = 0;
    let deltaLeft = 0;
    this._disposables.add(this._resizable.onDidWillResize(() => {
      topLeftNow = this._topLeft;
      sizeNow = this._resizable.size;
    }));
    this._disposables.add(this._resizable.onDidResize((e) => {
      if (topLeftNow && sizeNow) {
        this.widget.layout(e.dimension.width, e.dimension.height);
        let updateTopLeft = false;
        if (e.west) {
          deltaLeft = sizeNow.width - e.dimension.width;
          updateTopLeft = true;
        }
        if (e.north) {
          deltaTop = sizeNow.height - e.dimension.height;
          updateTopLeft = true;
        }
        if (updateTopLeft) {
          this._applyTopLeft({
            top: topLeftNow.top + deltaTop,
            left: topLeftNow.left + deltaLeft
          });
        }
      }
      if (e.done) {
        topLeftNow = void 0;
        sizeNow = void 0;
        deltaTop = 0;
        deltaLeft = 0;
        this._userSize = e.dimension;
      }
    }));
    this._disposables.add(this.widget.onDidChangeContents(() => {
      if (this._anchorBox) {
        this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, this._preferAlignAtTop);
      }
    }));
  }
  dispose() {
    this._resizable.dispose();
    this._disposables.dispose();
    this.hide();
  }
  getId() {
    return "suggest.details";
  }
  getDomNode() {
    return this._resizable.domNode;
  }
  getPosition() {
    return this._topLeft ? { preference: this._topLeft } : null;
  }
  show() {
    if (!this._added) {
      this._editor.addOverlayWidget(this);
      this._added = true;
    }
  }
  hide(sessionEnded = false) {
    this._resizable.clearSashHoverState();
    if (this._added) {
      this._editor.removeOverlayWidget(this);
      this._added = false;
      this._anchorBox = void 0;
      this._topLeft = void 0;
    }
    if (sessionEnded) {
      this._userSize = void 0;
      this.widget.clearContents();
    }
  }
  placeAtAnchor(anchor, preferAlignAtTop) {
    const anchorBox = anchor.getBoundingClientRect();
    this._anchorBox = anchorBox;
    this._preferAlignAtTop = preferAlignAtTop;
    this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size, preferAlignAtTop);
  }
  _placeAtAnchor(anchorBox, size, preferAlignAtTop) {
    const bodyBox = dom.getClientArea(this.getDomNode().ownerDocument.body);
    const info = this.widget.getLayoutInfo();
    const defaultMinSize = new dom.Dimension(220, 2 * info.lineHeight);
    const defaultTop = anchorBox.top;
    const eastPlacement = (function() {
      const width = bodyBox.width - (anchorBox.left + anchorBox.width + info.borderWidth + info.horizontalPadding);
      const left2 = -info.borderWidth + anchorBox.left + anchorBox.width;
      const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
      const maxSizeBottom = maxSizeTop.with(void 0, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
      return { top: defaultTop, left: left2, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
    })();
    const westPlacement = (function() {
      const width = anchorBox.left - info.borderWidth - info.horizontalPadding;
      const left2 = Math.max(info.horizontalPadding, anchorBox.left - size.width - info.borderWidth);
      const maxSizeTop = new dom.Dimension(width, bodyBox.height - anchorBox.top - info.borderHeight - info.verticalPadding);
      const maxSizeBottom = maxSizeTop.with(void 0, anchorBox.top + anchorBox.height - info.borderHeight - info.verticalPadding);
      return { top: defaultTop, left: left2, fit: width - size.width, maxSizeTop, maxSizeBottom, minSize: defaultMinSize.with(Math.min(width, defaultMinSize.width)) };
    })();
    const southPlacement = (function() {
      const left2 = anchorBox.left;
      const top2 = -info.borderWidth + anchorBox.top + anchorBox.height;
      const maxSizeBottom = new dom.Dimension(anchorBox.width - info.borderHeight, bodyBox.height - anchorBox.top - anchorBox.height - info.verticalPadding);
      return { top: top2, left: left2, fit: maxSizeBottom.height - size.height, maxSizeBottom, maxSizeTop: maxSizeBottom, minSize: defaultMinSize.with(maxSizeBottom.width) };
    })();
    const northPlacement = (function() {
      const left2 = anchorBox.left;
      const maxSizeTop = new dom.Dimension(anchorBox.width - info.borderHeight, anchorBox.top - info.verticalPadding);
      const top2 = Math.max(info.verticalPadding, anchorBox.top - size.height);
      return { top: top2, left: left2, fit: maxSizeTop.height - size.height, maxSizeTop, maxSizeBottom: maxSizeTop, minSize: defaultMinSize.with(maxSizeTop.width) };
    })();
    const verticalPlacement = preferAlignAtTop ? southPlacement : northPlacement;
    const placements = [eastPlacement, westPlacement, verticalPlacement];
    const placement = placements.find((p) => p.fit >= 0) ?? placements.sort((a, b) => b.fit - a.fit)[0];
    const bottom = anchorBox.top + anchorBox.height - info.borderHeight;
    let alignAtTop;
    let height = size.height;
    const maxHeight = Math.max(placement.maxSizeTop.height, placement.maxSizeBottom.height);
    if (height > maxHeight) {
      height = maxHeight;
    }
    let maxSize;
    if (preferAlignAtTop) {
      if (height <= placement.maxSizeTop.height) {
        alignAtTop = true;
        maxSize = placement.maxSizeTop;
      } else {
        alignAtTop = false;
        maxSize = placement.maxSizeBottom;
      }
    } else {
      if (height <= placement.maxSizeBottom.height) {
        alignAtTop = false;
        maxSize = placement.maxSizeBottom;
      } else {
        alignAtTop = true;
        maxSize = placement.maxSizeTop;
      }
    }
    let { top, left } = placement;
    if (placement === northPlacement) {
      top = anchorBox.top - height + info.borderWidth;
    } else if (!alignAtTop && height > anchorBox.height) {
      top = bottom - height;
    }
    const editorDomNode = this._editor.getDomNode();
    if (editorDomNode) {
      const editorBoundingBox = editorDomNode.getBoundingClientRect();
      top -= editorBoundingBox.top;
      left -= editorBoundingBox.left;
    }
    this._applyTopLeft({ left, top });
    if (placement === northPlacement) {
      this._resizable.enableSashes(true, false, false, true);
    } else {
      this._resizable.enableSashes(!alignAtTop, placement === eastPlacement, alignAtTop, placement !== eastPlacement);
    }
    this._resizable.minSize = placement.minSize;
    this._resizable.maxSize = maxSize;
    this._resizable.layout(height, Math.min(maxSize.width, size.width));
    this.widget.layout(this._resizable.size.width, this._resizable.size.height);
  }
  _applyTopLeft(topLeft) {
    this._topLeft = topLeft;
    this._editor.layoutOverlayWidget(this);
  }
}
export {
  SuggestDetailsOverlay,
  SuggestDetailsWidget,
  canExpandCompletionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0V2lkZ2V0RGV0YWlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFJlc2l6YWJsZUhUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Jlc2l6YWJsZS9yZXNpemFibGUuanMnO1xuaW1wb3J0IHsgRG9tU2Nyb2xsYWJsZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGlzSGlnaENvbnRyYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJT3ZlcmxheVdpZGdldCwgSU92ZXJsYXlXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtIH0gZnJvbSAnLi9zdWdnZXN0LmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNhbkV4cGFuZENvbXBsZXRpb25JdGVtKGl0ZW06IENvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIWl0ZW0gJiYgQm9vbGVhbihpdGVtLmNvbXBsZXRpb24uZG9jdW1lbnRhdGlvbiB8fCBpdGVtLmNvbXBsZXRpb24uZGV0YWlsICYmIGl0ZW0uY29tcGxldGlvbi5kZXRhaWwgIT09IGl0ZW0uY29tcGxldGlvbi5sYWJlbCk7XG59XG5cbmV4cG9ydCBjbGFzcyBTdWdnZXN0RGV0YWlsc1dpZGdldCB7XG5cblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTERpdkVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnRzID0gbmV3IEVtaXR0ZXI8dGhpcz4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50czogRXZlbnQ8dGhpcz4gPSB0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nsb3NlOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Nyb2xsYmFyOiBEb21TY3JvbGxhYmxlRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfYm9keTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hlYWRlcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3R5cGU6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb2NzOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyRGlzcG9zZWFibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX3NpemUgPSBuZXcgZG9tLkRpbWVuc2lvbigzMzAsIDApO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2Rvd25SZW5kZXJlclNlcnZpY2U6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy5zdWdnZXN0LWRldGFpbHMnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbm8tZG9jcycpO1xuXG5cblx0XHR0aGlzLl9ib2R5ID0gZG9tLiQoJy5ib2R5Jyk7XG5cblx0XHR0aGlzLl9zY3JvbGxiYXIgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fYm9keSwge1xuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsXG5cdFx0fSk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIHRoaXMuX3Njcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9zY3JvbGxiYXIpO1xuXG5cdFx0dGhpcy5faGVhZGVyID0gZG9tLmFwcGVuZCh0aGlzLl9ib2R5LCBkb20uJCgnLmhlYWRlcicpKTtcblx0XHR0aGlzLl9jbG9zZSA9IGRvbS5hcHBlbmQodGhpcy5faGVhZGVyLCBkb20uJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLmNsb3NlKSkpO1xuXHRcdHRoaXMuX2Nsb3NlLnRpdGxlID0gbmxzLmxvY2FsaXplKCdkZXRhaWxzLmNsb3NlJywgXCJDbG9zZVwiKTtcblx0XHR0aGlzLl9jbG9zZS5hcmlhTGFiZWwgPSBubHMubG9jYWxpemUoJ2RldGFpbHMuY2xvc2UnLCBcIkNsb3NlXCIpO1xuXHRcdHRoaXMuX2Nsb3NlLnJvbGUgPSAnYnV0dG9uJztcblx0XHR0aGlzLl9jbG9zZS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMuX3R5cGUgPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlciwgZG9tLiQoJ3AudHlwZScpKTtcblxuXHRcdHRoaXMuX2RvY3MgPSBkb20uYXBwZW5kKHRoaXMuX2JvZHksIGRvbS4kKCdwLmRvY3MnKSk7XG5cblx0XHR0aGlzLl9jb25maWd1cmVGb250KCk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSkge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmVGb250KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zZWFibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2xvc2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudHMuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlndXJlRm9udCgpOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbnMoKTtcblx0XHRjb25zdCBmb250SW5mbyA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3QgZm9udEZhbWlseSA9IGZvbnRJbmZvLmdldE1hc3NhZ2VkRm9udEZhbWlseSgpO1xuXHRcdGNvbnN0IGZvbnRTaXplID0gb3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLnN1Z2dlc3RGb250U2l6ZSkgfHwgZm9udEluZm8uZm9udFNpemU7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IG9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5zdWdnZXN0TGluZUhlaWdodCkgfHwgZm9udEluZm8ubGluZUhlaWdodDtcblx0XHRjb25zdCBmb250V2VpZ2h0ID0gZm9udEluZm8uZm9udFdlaWdodDtcblx0XHRjb25zdCBmb250U2l6ZVB4ID0gYCR7Zm9udFNpemV9cHhgO1xuXHRcdGNvbnN0IGxpbmVIZWlnaHRQeCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmZvbnRTaXplID0gZm9udFNpemVQeDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUubGluZUhlaWdodCA9IGAke2xpbmVIZWlnaHQgLyBmb250U2l6ZX1gO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5mb250V2VpZ2h0ID0gZm9udFdlaWdodDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZm9udEZlYXR1cmVTZXR0aW5ncyA9IGZvbnRJbmZvLmZvbnRGZWF0dXJlU2V0dGluZ3M7XG5cdFx0dGhpcy5fdHlwZS5zdHlsZS5mb250RmFtaWx5ID0gZm9udEZhbWlseTtcblx0XHR0aGlzLl9jbG9zZS5zdHlsZS5oZWlnaHQgPSBsaW5lSGVpZ2h0UHg7XG5cdFx0dGhpcy5fY2xvc2Uuc3R5bGUud2lkdGggPSBsaW5lSGVpZ2h0UHg7XG5cdH1cblxuXHRnZXRMYXlvdXRJbmZvKCkge1xuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdWdnZXN0TGluZUhlaWdodCkgfHwgdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pLmxpbmVIZWlnaHQ7XG5cdFx0Y29uc3QgYm9yZGVyV2lkdGggPSBpc0hpZ2hDb250cmFzdCh0aGlzLl90aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpID8gMiA6IDE7XG5cdFx0Y29uc3QgYm9yZGVySGVpZ2h0ID0gYm9yZGVyV2lkdGggKiAyO1xuXHRcdHJldHVybiB7XG5cdFx0XHRsaW5lSGVpZ2h0LFxuXHRcdFx0Ym9yZGVyV2lkdGgsXG5cdFx0XHRib3JkZXJIZWlnaHQsXG5cdFx0XHR2ZXJ0aWNhbFBhZGRpbmc6IDIyLFxuXHRcdFx0aG9yaXpvbnRhbFBhZGRpbmc6IDE0XG5cdFx0fTtcblx0fVxuXG5cblx0cmVuZGVyTG9hZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl90eXBlLnRleHRDb250ZW50ID0gbmxzLmxvY2FsaXplKCdsb2FkaW5nJywgXCJMb2FkaW5nLi4uXCIpO1xuXHRcdHRoaXMuX2RvY3MudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnbm8tZG9jcycsICduby10eXBlJyk7XG5cdFx0dGhpcy5sYXlvdXQodGhpcy5zaXplLndpZHRoLCB0aGlzLmdldExheW91dEluZm8oKS5saW5lSGVpZ2h0ICogMik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50cy5maXJlKHRoaXMpO1xuXHR9XG5cblx0cmVuZGVySXRlbShpdGVtOiBDb21wbGV0aW9uSXRlbSwgZXhwbGFpbk1vZGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NlYWJsZS5jbGVhcigpO1xuXG5cdFx0bGV0IHsgZGV0YWlsLCBkb2N1bWVudGF0aW9uIH0gPSBpdGVtLmNvbXBsZXRpb247XG5cblx0XHRpZiAoZXhwbGFpbk1vZGUpIHtcblx0XHRcdGxldCBtZCA9ICcnO1xuXHRcdFx0bWQgKz0gYHNjb3JlOiAke2l0ZW0uc2NvcmVbMF19XFxuYDtcblx0XHRcdG1kICs9IGBwcmVmaXg6ICR7aXRlbS53b3JkID8/ICcobm8gcHJlZml4KSd9XFxuYDtcblx0XHRcdG1kICs9IGB3b3JkOiAke2l0ZW0uY29tcGxldGlvbi5maWx0ZXJUZXh0ID8gaXRlbS5jb21wbGV0aW9uLmZpbHRlclRleHQgKyAnIChmaWx0ZXJUZXh0KScgOiBpdGVtLnRleHRMYWJlbH1cXG5gO1xuXHRcdFx0bWQgKz0gYGRpc3RhbmNlOiAke2l0ZW0uZGlzdGFuY2V9IChsb2NhbGl0eUJvbnVzLXNldHRpbmcpXFxuYDtcblx0XHRcdG1kICs9IGBpbmRleDogJHtpdGVtLmlkeH0sIGJhc2VkIG9uICR7aXRlbS5jb21wbGV0aW9uLnNvcnRUZXh0ICYmIGBzb3J0VGV4dDogXCIke2l0ZW0uY29tcGxldGlvbi5zb3J0VGV4dH1cImAgfHwgJ2xhYmVsJ31cXG5gO1xuXHRcdFx0bWQgKz0gYGNvbW1pdF9jaGFyczogJHtpdGVtLmNvbXBsZXRpb24uY29tbWl0Q2hhcmFjdGVycz8uam9pbignJyl9XFxuYDtcblx0XHRcdGRvY3VtZW50YXRpb24gPSBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRDb2RlYmxvY2soJ2VtcHR5JywgbWQpO1xuXHRcdFx0ZGV0YWlsID0gYFByb3ZpZGVyOiAke2l0ZW0ucHJvdmlkZXIuX2RlYnVnRGlzcGxheU5hbWV9YDtcblx0XHR9XG5cblx0XHRpZiAoIWV4cGxhaW5Nb2RlICYmICFjYW5FeHBhbmRDb21wbGV0aW9uSXRlbShpdGVtKSkge1xuXHRcdFx0dGhpcy5jbGVhckNvbnRlbnRzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5yZW1vdmUoJ25vLWRvY3MnLCAnbm8tdHlwZScpO1xuXG5cdFx0Ly8gLS0tIGRldGFpbHNcblxuXHRcdGlmIChkZXRhaWwpIHtcblx0XHRcdGNvbnN0IGNhcHBlZERldGFpbCA9IGRldGFpbC5sZW5ndGggPiAxMDAwMDAgPyBgJHtkZXRhaWwuc3Vic3RyKDAsIDEwMDAwMCl9XHUyMDI2YCA6IGRldGFpbDtcblx0XHRcdHRoaXMuX3R5cGUudGV4dENvbnRlbnQgPSBjYXBwZWREZXRhaWw7XG5cdFx0XHR0aGlzLl90eXBlLnRpdGxlID0gY2FwcGVkRGV0YWlsO1xuXHRcdFx0ZG9tLnNob3codGhpcy5fdHlwZSk7XG5cdFx0XHR0aGlzLl90eXBlLmNsYXNzTGlzdC50b2dnbGUoJ2F1dG8td3JhcCcsICEvXFxyP1xcbl5cXHMrL2dtaS50ZXN0KGNhcHBlZERldGFpbCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX3R5cGUpO1xuXHRcdFx0dGhpcy5fdHlwZS50aXRsZSA9ICcnO1xuXHRcdFx0ZG9tLmhpZGUodGhpcy5fdHlwZSk7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbm8tdHlwZScpO1xuXHRcdH1cblxuXHRcdC8vIC0tLSBkb2N1bWVudGF0aW9uXG5cdFx0ZG9tLmNsZWFyTm9kZSh0aGlzLl9kb2NzKTtcblx0XHRpZiAodHlwZW9mIGRvY3VtZW50YXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9kb2NzLmNsYXNzTGlzdC5yZW1vdmUoJ21hcmtkb3duLWRvY3MnKTtcblx0XHRcdHRoaXMuX2RvY3MudGV4dENvbnRlbnQgPSBkb2N1bWVudGF0aW9uO1xuXG5cdFx0fSBlbHNlIGlmIChkb2N1bWVudGF0aW9uKSB7XG5cdFx0XHR0aGlzLl9kb2NzLmNsYXNzTGlzdC5hZGQoJ21hcmtkb3duLWRvY3MnKTtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5fZG9jcyk7XG5cdFx0XHRjb25zdCByZW5kZXJlZENvbnRlbnRzID0gdGhpcy5fbWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGRvY3VtZW50YXRpb24sIHtcblx0XHRcdFx0Y29udGV4dDogdGhpcy5fZWRpdG9yLFxuXHRcdFx0XHRhc3luY1JlbmRlckNhbGxiYWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fc2l6ZS53aWR0aCwgdGhpcy5fdHlwZS5jbGllbnRIZWlnaHQgKyB0aGlzLl9kb2NzLmNsaWVudEhlaWdodCk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50cy5maXJlKHRoaXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2RvY3MuYXBwZW5kQ2hpbGQocmVuZGVyZWRDb250ZW50cy5lbGVtZW50KTtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2VhYmxlLmFkZChyZW5kZXJlZENvbnRlbnRzKTtcblx0XHR9XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZGV0YWlsLWFuZC1kb2MnLCAhIWRldGFpbCAmJiAhIWRvY3VtZW50YXRpb24pO1xuXG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLnVzZXJTZWxlY3QgPSAndGV4dCc7XG5cdFx0dGhpcy5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cblx0XHR0aGlzLl9jbG9zZS5vbm1vdXNlZG93biA9IGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9O1xuXHRcdHRoaXMuX2Nsb3NlLm9uY2xpY2sgPSBlID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fYm9keS5zY3JvbGxUb3AgPSAwO1xuXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5fc2l6ZS53aWR0aCwgdGhpcy5fdHlwZS5jbGllbnRIZWlnaHQgKyB0aGlzLl9kb2NzLmNsaWVudEhlaWdodCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50cy5maXJlKHRoaXMpO1xuXHR9XG5cblx0Y2xlYXJDb250ZW50cygpIHtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbm8tZG9jcycpO1xuXHRcdHRoaXMuX3R5cGUudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLl9kb2NzLnRleHRDb250ZW50ID0gJyc7XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnbm8tZG9jcycpO1xuXHR9XG5cblx0Z2V0IHNpemUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpemU7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdTaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0aWYgKCFkb20uRGltZW5zaW9uLmVxdWFscyhuZXdTaXplLCB0aGlzLl9zaXplKSkge1xuXHRcdFx0dGhpcy5fc2l6ZSA9IG5ld1NpemU7XG5cdFx0XHRkb20uc2l6ZSh0aGlzLmRvbU5vZGUsIHdpZHRoLCBoZWlnaHQpO1xuXHRcdH1cblx0XHR0aGlzLl9zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHNjcm9sbERvd24obXVjaCA9IDgpOiB2b2lkIHtcblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCArPSBtdWNoO1xuXHR9XG5cblx0c2Nyb2xsVXAobXVjaCA9IDgpOiB2b2lkIHtcblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCAtPSBtdWNoO1xuXHR9XG5cblx0c2Nyb2xsVG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wID0gMDtcblx0fVxuXG5cdHNjcm9sbEJvdHRvbSgpOiB2b2lkIHtcblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCA9IHRoaXMuX2JvZHkuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0cGFnZURvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5zY3JvbGxEb3duKDgwKTtcblx0fVxuXG5cdHBhZ2VVcCgpOiB2b2lkIHtcblx0XHR0aGlzLnNjcm9sbFVwKDgwKTtcblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG59XG5cbmludGVyZmFjZSBUb3BMZWZ0UG9zaXRpb24ge1xuXHR0b3A6IG51bWJlcjtcblx0bGVmdDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgU3VnZ2VzdERldGFpbHNPdmVybGF5IGltcGxlbWVudHMgSU92ZXJsYXlXaWRnZXQge1xuXG5cdHJlYWRvbmx5IGFsbG93RWRpdG9yT3ZlcmZsb3cgPSB0cnVlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNpemFibGU6IFJlc2l6YWJsZUhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgX2FkZGVkOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2FuY2hvckJveD86IGRvbS5JRG9tTm9kZVBhZ2VQb3NpdGlvbjtcblx0cHJpdmF0ZSBfcHJlZmVyQWxpZ25BdFRvcDogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgX3VzZXJTaXplPzogZG9tLkRpbWVuc2lvbjtcblx0cHJpdmF0ZSBfdG9wTGVmdD86IFRvcExlZnRQb3NpdGlvbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSB3aWRnZXQ6IFN1Z2dlc3REZXRhaWxzV2lkZ2V0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdCkge1xuXG5cdFx0dGhpcy5fcmVzaXphYmxlID0gbmV3IFJlc2l6YWJsZUhUTUxFbGVtZW50KCk7XG5cdFx0dGhpcy5fcmVzaXphYmxlLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnc3VnZ2VzdC1kZXRhaWxzLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlLmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0XHR0aGlzLl9yZXNpemFibGUuZW5hYmxlU2FzaGVzKGZhbHNlLCB0cnVlLCB0cnVlLCBmYWxzZSk7XG5cblx0XHRsZXQgdG9wTGVmdE5vdzogVG9wTGVmdFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzaXplTm93OiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWx0YVRvcDogbnVtYmVyID0gMDtcblx0XHRsZXQgZGVsdGFMZWZ0OiBudW1iZXIgPSAwO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZXNpemFibGUub25EaWRXaWxsUmVzaXplKCgpID0+IHtcblx0XHRcdHRvcExlZnROb3cgPSB0aGlzLl90b3BMZWZ0O1xuXHRcdFx0c2l6ZU5vdyA9IHRoaXMuX3Jlc2l6YWJsZS5zaXplO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZXNpemFibGUub25EaWRSZXNpemUoZSA9PiB7XG5cdFx0XHRpZiAodG9wTGVmdE5vdyAmJiBzaXplTm93KSB7XG5cdFx0XHRcdHRoaXMud2lkZ2V0LmxheW91dChlLmRpbWVuc2lvbi53aWR0aCwgZS5kaW1lbnNpb24uaGVpZ2h0KTtcblxuXHRcdFx0XHRsZXQgdXBkYXRlVG9wTGVmdCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoZS53ZXN0KSB7XG5cdFx0XHRcdFx0ZGVsdGFMZWZ0ID0gc2l6ZU5vdy53aWR0aCAtIGUuZGltZW5zaW9uLndpZHRoO1xuXHRcdFx0XHRcdHVwZGF0ZVRvcExlZnQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLm5vcnRoKSB7XG5cdFx0XHRcdFx0ZGVsdGFUb3AgPSBzaXplTm93LmhlaWdodCAtIGUuZGltZW5zaW9uLmhlaWdodDtcblx0XHRcdFx0XHR1cGRhdGVUb3BMZWZ0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodXBkYXRlVG9wTGVmdCkge1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5VG9wTGVmdCh7XG5cdFx0XHRcdFx0XHR0b3A6IHRvcExlZnROb3cudG9wICsgZGVsdGFUb3AsXG5cdFx0XHRcdFx0XHRsZWZ0OiB0b3BMZWZ0Tm93LmxlZnQgKyBkZWx0YUxlZnQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChlLmRvbmUpIHtcblx0XHRcdFx0dG9wTGVmdE5vdyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c2l6ZU5vdyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0ZGVsdGFUb3AgPSAwO1xuXHRcdFx0XHRkZWx0YUxlZnQgPSAwO1xuXHRcdFx0XHR0aGlzLl91c2VyU2l6ZSA9IGUuZGltZW5zaW9uO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLndpZGdldC5vbkRpZENoYW5nZUNvbnRlbnRzKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9hbmNob3JCb3gpIHtcblx0XHRcdFx0dGhpcy5fcGxhY2VBdEFuY2hvcih0aGlzLl9hbmNob3JCb3gsIHRoaXMuX3VzZXJTaXplID8/IHRoaXMud2lkZ2V0LnNpemUsIHRoaXMuX3ByZWZlckFsaWduQXRUb3ApO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzaXphYmxlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnc3VnZ2VzdC5kZXRhaWxzJztcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9yZXNpemFibGUuZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9wTGVmdCA/IHsgcHJlZmVyZW5jZTogdGhpcy5fdG9wTGVmdCB9IDogbnVsbDtcblx0fVxuXG5cdHNob3coKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9hZGRlZCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLmFkZE92ZXJsYXlXaWRnZXQodGhpcyk7XG5cdFx0XHR0aGlzLl9hZGRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0aGlkZShzZXNzaW9uRW5kZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5jbGVhclNhc2hIb3ZlclN0YXRlKCk7XG5cblx0XHRpZiAodGhpcy5fYWRkZWQpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdFx0dGhpcy5fYWRkZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2FuY2hvckJveCA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3RvcExlZnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uRW5kZWQpIHtcblx0XHRcdHRoaXMuX3VzZXJTaXplID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy53aWRnZXQuY2xlYXJDb250ZW50cygpO1xuXHRcdH1cblx0fVxuXG5cdHBsYWNlQXRBbmNob3IoYW5jaG9yOiBIVE1MRWxlbWVudCwgcHJlZmVyQWxpZ25BdFRvcDogYm9vbGVhbikge1xuXHRcdGNvbnN0IGFuY2hvckJveCA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHR0aGlzLl9hbmNob3JCb3ggPSBhbmNob3JCb3g7XG5cdFx0dGhpcy5fcHJlZmVyQWxpZ25BdFRvcCA9IHByZWZlckFsaWduQXRUb3A7XG5cdFx0dGhpcy5fcGxhY2VBdEFuY2hvcih0aGlzLl9hbmNob3JCb3gsIHRoaXMuX3VzZXJTaXplID8/IHRoaXMud2lkZ2V0LnNpemUsIHByZWZlckFsaWduQXRUb3ApO1xuXHR9XG5cblx0X3BsYWNlQXRBbmNob3IoYW5jaG9yQm94OiBkb20uSURvbU5vZGVQYWdlUG9zaXRpb24sIHNpemU6IGRvbS5EaW1lbnNpb24sIHByZWZlckFsaWduQXRUb3A6IGJvb2xlYW4pIHtcblx0XHRjb25zdCBib2R5Qm94ID0gZG9tLmdldENsaWVudEFyZWEodGhpcy5nZXREb21Ob2RlKCkub3duZXJEb2N1bWVudC5ib2R5KTtcblxuXHRcdGNvbnN0IGluZm8gPSB0aGlzLndpZGdldC5nZXRMYXlvdXRJbmZvKCk7XG5cblx0XHRjb25zdCBkZWZhdWx0TWluU2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKDIyMCwgMiAqIGluZm8ubGluZUhlaWdodCk7XG5cdFx0Y29uc3QgZGVmYXVsdFRvcCA9IGFuY2hvckJveC50b3A7XG5cblx0XHR0eXBlIFBsYWNlbWVudCA9IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgZml0OiBudW1iZXI7IG1heFNpemVUb3A6IGRvbS5EaW1lbnNpb247IG1heFNpemVCb3R0b206IGRvbS5EaW1lbnNpb247IG1pblNpemU6IGRvbS5EaW1lbnNpb24gfTtcblxuXHRcdC8vIEVBU1Rcblx0XHRjb25zdCBlYXN0UGxhY2VtZW50OiBQbGFjZW1lbnQgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBib2R5Qm94LndpZHRoIC0gKGFuY2hvckJveC5sZWZ0ICsgYW5jaG9yQm94LndpZHRoICsgaW5mby5ib3JkZXJXaWR0aCArIGluZm8uaG9yaXpvbnRhbFBhZGRpbmcpO1xuXHRcdFx0Y29uc3QgbGVmdCA9IC1pbmZvLmJvcmRlcldpZHRoICsgYW5jaG9yQm94LmxlZnQgKyBhbmNob3JCb3gud2lkdGg7XG5cdFx0XHRjb25zdCBtYXhTaXplVG9wID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGJvZHlCb3guaGVpZ2h0IC0gYW5jaG9yQm94LnRvcCAtIGluZm8uYm9yZGVySGVpZ2h0IC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcpO1xuXHRcdFx0Y29uc3QgbWF4U2l6ZUJvdHRvbSA9IG1heFNpemVUb3Aud2l0aCh1bmRlZmluZWQsIGFuY2hvckJveC50b3AgKyBhbmNob3JCb3guaGVpZ2h0IC0gaW5mby5ib3JkZXJIZWlnaHQgLSBpbmZvLnZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRyZXR1cm4geyB0b3A6IGRlZmF1bHRUb3AsIGxlZnQsIGZpdDogd2lkdGggLSBzaXplLndpZHRoLCBtYXhTaXplVG9wLCBtYXhTaXplQm90dG9tLCBtaW5TaXplOiBkZWZhdWx0TWluU2l6ZS53aXRoKE1hdGgubWluKHdpZHRoLCBkZWZhdWx0TWluU2l6ZS53aWR0aCkpIH07XG5cdFx0fSkoKTtcblxuXHRcdC8vIFdFU1Rcblx0XHRjb25zdCB3ZXN0UGxhY2VtZW50OiBQbGFjZW1lbnQgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBhbmNob3JCb3gubGVmdCAtIGluZm8uYm9yZGVyV2lkdGggLSBpbmZvLmhvcml6b250YWxQYWRkaW5nO1xuXHRcdFx0Y29uc3QgbGVmdCA9IE1hdGgubWF4KGluZm8uaG9yaXpvbnRhbFBhZGRpbmcsIGFuY2hvckJveC5sZWZ0IC0gc2l6ZS53aWR0aCAtIGluZm8uYm9yZGVyV2lkdGgpO1xuXHRcdFx0Y29uc3QgbWF4U2l6ZVRvcCA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBib2R5Qm94LmhlaWdodCAtIGFuY2hvckJveC50b3AgLSBpbmZvLmJvcmRlckhlaWdodCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdGNvbnN0IG1heFNpemVCb3R0b20gPSBtYXhTaXplVG9wLndpdGgodW5kZWZpbmVkLCBhbmNob3JCb3gudG9wICsgYW5jaG9yQm94LmhlaWdodCAtIGluZm8uYm9yZGVySGVpZ2h0IC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcpO1xuXHRcdFx0cmV0dXJuIHsgdG9wOiBkZWZhdWx0VG9wLCBsZWZ0LCBmaXQ6IHdpZHRoIC0gc2l6ZS53aWR0aCwgbWF4U2l6ZVRvcCwgbWF4U2l6ZUJvdHRvbSwgbWluU2l6ZTogZGVmYXVsdE1pblNpemUud2l0aChNYXRoLm1pbih3aWR0aCwgZGVmYXVsdE1pblNpemUud2lkdGgpKSB9O1xuXHRcdH0pKCk7XG5cblx0XHQvLyBTT1VUSFxuXHRcdGNvbnN0IHNvdXRoUGxhY2VtZW50OiBQbGFjZW1lbnQgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgbGVmdCA9IGFuY2hvckJveC5sZWZ0O1xuXHRcdFx0Y29uc3QgdG9wID0gLWluZm8uYm9yZGVyV2lkdGggKyBhbmNob3JCb3gudG9wICsgYW5jaG9yQm94LmhlaWdodDtcblx0XHRcdGNvbnN0IG1heFNpemVCb3R0b20gPSBuZXcgZG9tLkRpbWVuc2lvbihhbmNob3JCb3gud2lkdGggLSBpbmZvLmJvcmRlckhlaWdodCwgYm9keUJveC5oZWlnaHQgLSBhbmNob3JCb3gudG9wIC0gYW5jaG9yQm94LmhlaWdodCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdHJldHVybiB7IHRvcCwgbGVmdCwgZml0OiBtYXhTaXplQm90dG9tLmhlaWdodCAtIHNpemUuaGVpZ2h0LCBtYXhTaXplQm90dG9tLCBtYXhTaXplVG9wOiBtYXhTaXplQm90dG9tLCBtaW5TaXplOiBkZWZhdWx0TWluU2l6ZS53aXRoKG1heFNpemVCb3R0b20ud2lkdGgpIH07XG5cdFx0fSkoKTtcblxuXHRcdC8vIE5PUlRIXG5cdFx0Y29uc3Qgbm9ydGhQbGFjZW1lbnQ6IFBsYWNlbWVudCA9IChmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBsZWZ0ID0gYW5jaG9yQm94LmxlZnQ7XG5cdFx0XHRjb25zdCBtYXhTaXplVG9wID0gbmV3IGRvbS5EaW1lbnNpb24oYW5jaG9yQm94LndpZHRoIC0gaW5mby5ib3JkZXJIZWlnaHQsIGFuY2hvckJveC50b3AgLSBpbmZvLnZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRjb25zdCB0b3AgPSBNYXRoLm1heChpbmZvLnZlcnRpY2FsUGFkZGluZywgYW5jaG9yQm94LnRvcCAtIHNpemUuaGVpZ2h0KTtcblx0XHRcdHJldHVybiB7IHRvcCwgbGVmdCwgZml0OiBtYXhTaXplVG9wLmhlaWdodCAtIHNpemUuaGVpZ2h0LCBtYXhTaXplVG9wLCBtYXhTaXplQm90dG9tOiBtYXhTaXplVG9wLCBtaW5TaXplOiBkZWZhdWx0TWluU2l6ZS53aXRoKG1heFNpemVUb3Aud2lkdGgpIH07XG5cdFx0fSkoKTtcblxuXHRcdC8vIHRha2UgZmlyc3QgcGxhY2VtZW50IHRoYXQgZml0cyBvciB0aGUgZmlyc3Qgd2l0aCBcImxlYXN0IGJhZFwiIGZpdFxuXHRcdC8vIHdoZW4gdGhlIHN1Z2dlc3Qgd2lkZ2V0IGlzIHJlbmRlcmluZyBhYm92ZSB0aGUgY3Vyc29yIChwcmVmZXJBbGlnbkF0VG9wPWZhbHNlKSwgcHJlZmVyIE5PUlRIIG92ZXIgU09VVEhcblx0XHRjb25zdCB2ZXJ0aWNhbFBsYWNlbWVudCA9IHByZWZlckFsaWduQXRUb3AgPyBzb3V0aFBsYWNlbWVudCA6IG5vcnRoUGxhY2VtZW50O1xuXHRcdGNvbnN0IHBsYWNlbWVudHMgPSBbZWFzdFBsYWNlbWVudCwgd2VzdFBsYWNlbWVudCwgdmVydGljYWxQbGFjZW1lbnRdO1xuXHRcdGNvbnN0IHBsYWNlbWVudCA9IHBsYWNlbWVudHMuZmluZChwID0+IHAuZml0ID49IDApID8/IHBsYWNlbWVudHMuc29ydCgoYSwgYikgPT4gYi5maXQgLSBhLmZpdClbMF07XG5cdFx0Ly8gdG9wL2JvdHRvbSBwbGFjZW1lbnRcblx0XHRjb25zdCBib3R0b20gPSBhbmNob3JCb3gudG9wICsgYW5jaG9yQm94LmhlaWdodCAtIGluZm8uYm9yZGVySGVpZ2h0O1xuXHRcdGxldCBhbGlnbkF0VG9wOiBib29sZWFuO1xuXHRcdGxldCBoZWlnaHQgPSBzaXplLmhlaWdodDtcblx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1heChwbGFjZW1lbnQubWF4U2l6ZVRvcC5oZWlnaHQsIHBsYWNlbWVudC5tYXhTaXplQm90dG9tLmhlaWdodCk7XG5cdFx0aWYgKGhlaWdodCA+IG1heEhlaWdodCkge1xuXHRcdFx0aGVpZ2h0ID0gbWF4SGVpZ2h0O1xuXHRcdH1cblx0XHRsZXQgbWF4U2l6ZTogZG9tLkRpbWVuc2lvbjtcblx0XHRpZiAocHJlZmVyQWxpZ25BdFRvcCkge1xuXHRcdFx0aWYgKGhlaWdodCA8PSBwbGFjZW1lbnQubWF4U2l6ZVRvcC5oZWlnaHQpIHtcblx0XHRcdFx0YWxpZ25BdFRvcCA9IHRydWU7XG5cdFx0XHRcdG1heFNpemUgPSBwbGFjZW1lbnQubWF4U2l6ZVRvcDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFsaWduQXRUb3AgPSBmYWxzZTtcblx0XHRcdFx0bWF4U2l6ZSA9IHBsYWNlbWVudC5tYXhTaXplQm90dG9tO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaGVpZ2h0IDw9IHBsYWNlbWVudC5tYXhTaXplQm90dG9tLmhlaWdodCkge1xuXHRcdFx0XHRhbGlnbkF0VG9wID0gZmFsc2U7XG5cdFx0XHRcdG1heFNpemUgPSBwbGFjZW1lbnQubWF4U2l6ZUJvdHRvbTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGFsaWduQXRUb3AgPSB0cnVlO1xuXHRcdFx0XHRtYXhTaXplID0gcGxhY2VtZW50Lm1heFNpemVUb3A7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCB7IHRvcCwgbGVmdCB9ID0gcGxhY2VtZW50O1xuXHRcdGlmIChwbGFjZW1lbnQgPT09IG5vcnRoUGxhY2VtZW50KSB7XG5cdFx0XHQvLyBGb3IgTk9SVEggcGxhY2VtZW50LCBwb3NpdGlvbiB0aGUgZGV0YWlscyBhYm92ZSB0aGUgYW5jaG9yXG5cdFx0XHR0b3AgPSBhbmNob3JCb3gudG9wIC0gaGVpZ2h0ICsgaW5mby5ib3JkZXJXaWR0aDtcblx0XHR9IGVsc2UgaWYgKCFhbGlnbkF0VG9wICYmIGhlaWdodCA+IGFuY2hvckJveC5oZWlnaHQpIHtcblx0XHRcdHRvcCA9IGJvdHRvbSAtIGhlaWdodDtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yRG9tTm9kZSA9IHRoaXMuX2VkaXRvci5nZXREb21Ob2RlKCk7XG5cdFx0aWYgKGVkaXRvckRvbU5vZGUpIHtcblx0XHRcdC8vIGdldCBib3VuZGluZyByZWN0YW5nbGUgb2YgdGhlIHN1Z2dlc3Qgd2lkZ2V0IHJlbGF0aXZlIHRvIHRoZSBlZGl0b3Jcblx0XHRcdGNvbnN0IGVkaXRvckJvdW5kaW5nQm94ID0gZWRpdG9yRG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdHRvcCAtPSBlZGl0b3JCb3VuZGluZ0JveC50b3A7XG5cdFx0XHRsZWZ0IC09IGVkaXRvckJvdW5kaW5nQm94LmxlZnQ7XG5cdFx0fVxuXHRcdHRoaXMuX2FwcGx5VG9wTGVmdCh7IGxlZnQsIHRvcCB9KTtcblxuXHRcdC8vIGVuYWJsZVNhc2hlcyhub3J0aCwgZWFzdCwgc291dGgsIHdlc3QpXG5cdFx0Ly8gRm9yIE5PUlRIIHBsYWNlbWVudDogZW5hYmxlIG5vcnRoIHNhc2ggKHJlc2l6ZSB1cHdhcmQgZnJvbSB0b3ApLCBkaXNhYmxlIHNvdXRoIChjYW4ndCByZXNpemUgaW50byB0aGUgYW5jaG9yKVxuXHRcdC8vIEFsc28gZW5hYmxlIHdlc3Qgc2FzaCBmb3IgaG9yaXpvbnRhbCByZXNpemluZywgY29uc2lzdGVudCB3aXRoIFNPVVRIIHBsYWNlbWVudFxuXHRcdC8vIEZvciBTT1VUSCBwbGFjZW1lbnQgYW5kIEVBU1QvV0VTVCBwbGFjZW1lbnRzOiB1c2UgZXhpc3RpbmcgbG9naWMgYmFzZWQgb24gYWxpZ25BdFRvcFxuXHRcdGlmIChwbGFjZW1lbnQgPT09IG5vcnRoUGxhY2VtZW50KSB7XG5cdFx0XHR0aGlzLl9yZXNpemFibGUuZW5hYmxlU2FzaGVzKHRydWUsIGZhbHNlLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Jlc2l6YWJsZS5lbmFibGVTYXNoZXMoIWFsaWduQXRUb3AsIHBsYWNlbWVudCA9PT0gZWFzdFBsYWNlbWVudCwgYWxpZ25BdFRvcCwgcGxhY2VtZW50ICE9PSBlYXN0UGxhY2VtZW50KTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZXNpemFibGUubWluU2l6ZSA9IHBsYWNlbWVudC5taW5TaXplO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5tYXhTaXplID0gbWF4U2l6ZTtcblx0XHR0aGlzLl9yZXNpemFibGUubGF5b3V0KGhlaWdodCwgTWF0aC5taW4obWF4U2l6ZS53aWR0aCwgc2l6ZS53aWR0aCkpO1xuXHRcdHRoaXMud2lkZ2V0LmxheW91dCh0aGlzLl9yZXNpemFibGUuc2l6ZS53aWR0aCwgdGhpcy5fcmVzaXphYmxlLnNpemUuaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VG9wTGVmdCh0b3BMZWZ0OiBUb3BMZWZ0UG9zaXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl90b3BMZWZ0ID0gdG9wTGVmdDtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0T3ZlcmxheVdpZGdldCh0aGlzKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUI7QUFDMUIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0JBQW9CO0FBR3RCLFNBQVMsd0JBQXdCLE1BQTJDO0FBQ2xGLFNBQU8sQ0FBQyxDQUFDLFFBQVEsUUFBUSxLQUFLLFdBQVcsaUJBQWlCLEtBQUssV0FBVyxVQUFVLEtBQUssV0FBVyxXQUFXLEtBQUssV0FBVyxLQUFLO0FBQ3JJO0FBRU8sSUFBTSx1QkFBTixNQUEyQjtBQUFBLEVBcUJqQyxZQUNrQixTQUNlLGVBQ1csMEJBQzFDO0FBSGdCO0FBQ2U7QUFDVztBQXBCNUMsU0FBaUIsY0FBYyxJQUFJLFFBQWM7QUFDakQsU0FBUyxhQUEwQixLQUFLLFlBQVk7QUFFcEQsU0FBaUIsdUJBQXVCLElBQUksUUFBYztBQUMxRCxTQUFTLHNCQUFtQyxLQUFLLHFCQUFxQjtBQVF0RSxTQUFpQixlQUFlLElBQUksZ0JBQWdCO0FBRXBELFNBQWlCLHFCQUFxQixJQUFJLGdCQUFnQjtBQUMxRCxTQUFRLFFBQVEsSUFBSSxJQUFJLFVBQVUsS0FBSyxDQUFDO0FBT3ZDLFNBQUssVUFBVSxJQUFJLEVBQUUsa0JBQWtCO0FBQ3ZDLFNBQUssUUFBUSxVQUFVLElBQUksU0FBUztBQUdwQyxTQUFLLFFBQVEsSUFBSSxFQUFFLE9BQU87QUFFMUIsU0FBSyxhQUFhLElBQUkscUJBQXFCLEtBQUssT0FBTztBQUFBLE1BQ3RELHlCQUF5QjtBQUFBLElBQzFCLENBQUM7QUFDRCxRQUFJLE9BQU8sS0FBSyxTQUFTLEtBQUssV0FBVyxXQUFXLENBQUM7QUFDckQsU0FBSyxhQUFhLElBQUksS0FBSyxVQUFVO0FBRXJDLFNBQUssVUFBVSxJQUFJLE9BQU8sS0FBSyxPQUFPLElBQUksRUFBRSxTQUFTLENBQUM7QUFDdEQsU0FBSyxTQUFTLElBQUksT0FBTyxLQUFLLFNBQVMsSUFBSSxFQUFFLFNBQVMsVUFBVSxjQUFjLFFBQVEsS0FBSyxDQUFDLENBQUM7QUFDN0YsU0FBSyxPQUFPLFFBQVEsSUFBSSxTQUFTLGlCQUFpQixPQUFPO0FBQ3pELFNBQUssT0FBTyxZQUFZLElBQUksU0FBUyxpQkFBaUIsT0FBTztBQUM3RCxTQUFLLE9BQU8sT0FBTztBQUNuQixTQUFLLE9BQU8sV0FBVztBQUN2QixTQUFLLFFBQVEsSUFBSSxPQUFPLEtBQUssU0FBUyxJQUFJLEVBQUUsUUFBUSxDQUFDO0FBRXJELFNBQUssUUFBUSxJQUFJLE9BQU8sS0FBSyxPQUFPLElBQUksRUFBRSxRQUFRLENBQUM7QUFFbkQsU0FBSyxlQUFlO0FBRXBCLFNBQUssYUFBYSxJQUFJLEtBQUssUUFBUSx5QkFBeUIsT0FBSztBQUNoRSxVQUFJLEVBQUUsV0FBVyxhQUFhLFFBQVEsR0FBRztBQUN4QyxhQUFLLGVBQWU7QUFBQSxNQUNyQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLGFBQWEsUUFBUTtBQUMxQixTQUFLLG1CQUFtQixRQUFRO0FBQ2hDLFNBQUssWUFBWSxRQUFRO0FBQ3pCLFNBQUsscUJBQXFCLFFBQVE7QUFBQSxFQUNuQztBQUFBLEVBRVEsaUJBQXVCO0FBQzlCLFVBQU0sVUFBVSxLQUFLLFFBQVEsV0FBVztBQUN4QyxVQUFNLFdBQVcsUUFBUSxJQUFJLGFBQWEsUUFBUTtBQUNsRCxVQUFNLGFBQWEsU0FBUyxzQkFBc0I7QUFDbEQsVUFBTSxXQUFXLFFBQVEsSUFBSSxhQUFhLGVBQWUsS0FBSyxTQUFTO0FBQ3ZFLFVBQU0sYUFBYSxRQUFRLElBQUksYUFBYSxpQkFBaUIsS0FBSyxTQUFTO0FBQzNFLFVBQU0sYUFBYSxTQUFTO0FBQzVCLFVBQU0sYUFBYSxHQUFHLFFBQVE7QUFDOUIsVUFBTSxlQUFlLEdBQUcsVUFBVTtBQUVsQyxTQUFLLFFBQVEsTUFBTSxXQUFXO0FBQzlCLFNBQUssUUFBUSxNQUFNLGFBQWEsR0FBRyxhQUFhLFFBQVE7QUFDeEQsU0FBSyxRQUFRLE1BQU0sYUFBYTtBQUNoQyxTQUFLLFFBQVEsTUFBTSxzQkFBc0IsU0FBUztBQUNsRCxTQUFLLE1BQU0sTUFBTSxhQUFhO0FBQzlCLFNBQUssT0FBTyxNQUFNLFNBQVM7QUFDM0IsU0FBSyxPQUFPLE1BQU0sUUFBUTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxnQkFBZ0I7QUFDZixVQUFNLGFBQWEsS0FBSyxRQUFRLFVBQVUsYUFBYSxpQkFBaUIsS0FBSyxLQUFLLFFBQVEsVUFBVSxhQUFhLFFBQVEsRUFBRTtBQUMzSCxVQUFNLGNBQWMsZUFBZSxLQUFLLGNBQWMsY0FBYyxFQUFFLElBQUksSUFBSSxJQUFJO0FBQ2xGLFVBQU0sZUFBZSxjQUFjO0FBQ25DLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLE1BQ2pCLG1CQUFtQjtBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUFBLEVBR0EsZ0JBQXNCO0FBQ3JCLFNBQUssTUFBTSxjQUFjLElBQUksU0FBUyxXQUFXLFlBQVk7QUFDN0QsU0FBSyxNQUFNLGNBQWM7QUFDekIsU0FBSyxRQUFRLFVBQVUsT0FBTyxXQUFXLFNBQVM7QUFDbEQsU0FBSyxPQUFPLEtBQUssS0FBSyxPQUFPLEtBQUssY0FBYyxFQUFFLGFBQWEsQ0FBQztBQUNoRSxTQUFLLHFCQUFxQixLQUFLLElBQUk7QUFBQSxFQUNwQztBQUFBLEVBRUEsV0FBVyxNQUFzQixhQUE0QjtBQUM1RCxTQUFLLG1CQUFtQixNQUFNO0FBRTlCLFFBQUksRUFBRSxRQUFRLGNBQWMsSUFBSSxLQUFLO0FBRXJDLFFBQUksYUFBYTtBQUNoQixVQUFJLEtBQUs7QUFDVCxZQUFNLFVBQVUsS0FBSyxNQUFNLENBQUMsQ0FBQztBQUFBO0FBQzdCLFlBQU0sV0FBVyxLQUFLLFFBQVEsYUFBYTtBQUFBO0FBQzNDLFlBQU0sU0FBUyxLQUFLLFdBQVcsYUFBYSxLQUFLLFdBQVcsYUFBYSxrQkFBa0IsS0FBSyxTQUFTO0FBQUE7QUFDekcsWUFBTSxhQUFhLEtBQUssUUFBUTtBQUFBO0FBQ2hDLFlBQU0sVUFBVSxLQUFLLEdBQUcsY0FBYyxLQUFLLFdBQVcsWUFBWSxjQUFjLEtBQUssV0FBVyxRQUFRLE9BQU8sT0FBTztBQUFBO0FBQ3RILFlBQU0saUJBQWlCLEtBQUssV0FBVyxrQkFBa0IsS0FBSyxFQUFFLENBQUM7QUFBQTtBQUNqRSxzQkFBZ0IsSUFBSSxlQUFlLEVBQUUsZ0JBQWdCLFNBQVMsRUFBRTtBQUNoRSxlQUFTLGFBQWEsS0FBSyxTQUFTLGlCQUFpQjtBQUFBLElBQ3REO0FBRUEsUUFBSSxDQUFDLGVBQWUsQ0FBQyx3QkFBd0IsSUFBSSxHQUFHO0FBQ25ELFdBQUssY0FBYztBQUNuQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLFFBQVEsVUFBVSxPQUFPLFdBQVcsU0FBUztBQUlsRCxRQUFJLFFBQVE7QUFDWCxZQUFNLGVBQWUsT0FBTyxTQUFTLE1BQVMsR0FBRyxPQUFPLE9BQU8sR0FBRyxHQUFNLENBQUMsV0FBTTtBQUMvRSxXQUFLLE1BQU0sY0FBYztBQUN6QixXQUFLLE1BQU0sUUFBUTtBQUNuQixVQUFJLEtBQUssS0FBSyxLQUFLO0FBQ25CLFdBQUssTUFBTSxVQUFVLE9BQU8sYUFBYSxDQUFDLGVBQWUsS0FBSyxZQUFZLENBQUM7QUFBQSxJQUM1RSxPQUFPO0FBQ04sVUFBSSxVQUFVLEtBQUssS0FBSztBQUN4QixXQUFLLE1BQU0sUUFBUTtBQUNuQixVQUFJLEtBQUssS0FBSyxLQUFLO0FBQ25CLFdBQUssUUFBUSxVQUFVLElBQUksU0FBUztBQUFBLElBQ3JDO0FBR0EsUUFBSSxVQUFVLEtBQUssS0FBSztBQUN4QixRQUFJLE9BQU8sa0JBQWtCLFVBQVU7QUFDdEMsV0FBSyxNQUFNLFVBQVUsT0FBTyxlQUFlO0FBQzNDLFdBQUssTUFBTSxjQUFjO0FBQUEsSUFFMUIsV0FBVyxlQUFlO0FBQ3pCLFdBQUssTUFBTSxVQUFVLElBQUksZUFBZTtBQUN4QyxVQUFJLFVBQVUsS0FBSyxLQUFLO0FBQ3hCLFlBQU0sbUJBQW1CLEtBQUsseUJBQXlCLE9BQU8sZUFBZTtBQUFBLFFBQzVFLFNBQVMsS0FBSztBQUFBLFFBQ2QscUJBQXFCLE1BQU07QUFDMUIsZUFBSyxPQUFPLEtBQUssTUFBTSxPQUFPLEtBQUssTUFBTSxlQUFlLEtBQUssTUFBTSxZQUFZO0FBQy9FLGVBQUsscUJBQXFCLEtBQUssSUFBSTtBQUFBLFFBQ3BDO0FBQUEsTUFDRCxDQUFDO0FBQ0QsV0FBSyxNQUFNLFlBQVksaUJBQWlCLE9BQU87QUFDL0MsV0FBSyxtQkFBbUIsSUFBSSxnQkFBZ0I7QUFBQSxJQUM3QztBQUVBLFNBQUssUUFBUSxVQUFVLE9BQU8sa0JBQWtCLENBQUMsQ0FBQyxVQUFVLENBQUMsQ0FBQyxhQUFhO0FBRTNFLFNBQUssUUFBUSxNQUFNLGFBQWE7QUFDaEMsU0FBSyxRQUFRLFdBQVc7QUFFeEIsU0FBSyxPQUFPLGNBQWMsT0FBSztBQUM5QixRQUFFLGVBQWU7QUFDakIsUUFBRSxnQkFBZ0I7QUFBQSxJQUNuQjtBQUNBLFNBQUssT0FBTyxVQUFVLE9BQUs7QUFDMUIsUUFBRSxlQUFlO0FBQ2pCLFFBQUUsZ0JBQWdCO0FBQ2xCLFdBQUssWUFBWSxLQUFLO0FBQUEsSUFDdkI7QUFFQSxTQUFLLE1BQU0sWUFBWTtBQUV2QixTQUFLLE9BQU8sS0FBSyxNQUFNLE9BQU8sS0FBSyxNQUFNLGVBQWUsS0FBSyxNQUFNLFlBQVk7QUFDL0UsU0FBSyxxQkFBcUIsS0FBSyxJQUFJO0FBQUEsRUFDcEM7QUFBQSxFQUVBLGdCQUFnQjtBQUNmLFNBQUssUUFBUSxVQUFVLElBQUksU0FBUztBQUNwQyxTQUFLLE1BQU0sY0FBYztBQUN6QixTQUFLLE1BQU0sY0FBYztBQUFBLEVBQzFCO0FBQUEsRUFFQSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sS0FBSyxRQUFRLFVBQVUsU0FBUyxTQUFTO0FBQUEsRUFDakQ7QUFBQSxFQUVBLElBQUksT0FBTztBQUNWLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE9BQU8sT0FBZSxRQUFzQjtBQUMzQyxVQUFNLFVBQVUsSUFBSSxJQUFJLFVBQVUsT0FBTyxNQUFNO0FBQy9DLFFBQUksQ0FBQyxJQUFJLFVBQVUsT0FBTyxTQUFTLEtBQUssS0FBSyxHQUFHO0FBQy9DLFdBQUssUUFBUTtBQUNiLFVBQUksS0FBSyxLQUFLLFNBQVMsT0FBTyxNQUFNO0FBQUEsSUFDckM7QUFDQSxTQUFLLFdBQVcsWUFBWTtBQUFBLEVBQzdCO0FBQUEsRUFFQSxXQUFXLE9BQU8sR0FBUztBQUMxQixTQUFLLE1BQU0sYUFBYTtBQUFBLEVBQ3pCO0FBQUEsRUFFQSxTQUFTLE9BQU8sR0FBUztBQUN4QixTQUFLLE1BQU0sYUFBYTtBQUFBLEVBQ3pCO0FBQUEsRUFFQSxZQUFrQjtBQUNqQixTQUFLLE1BQU0sWUFBWTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSxlQUFxQjtBQUNwQixTQUFLLE1BQU0sWUFBWSxLQUFLLE1BQU07QUFBQSxFQUNuQztBQUFBLEVBRUEsV0FBaUI7QUFDaEIsU0FBSyxXQUFXLEVBQUU7QUFBQSxFQUNuQjtBQUFBLEVBRUEsU0FBZTtBQUNkLFNBQUssU0FBUyxFQUFFO0FBQUEsRUFDakI7QUFBQSxFQUVBLFFBQVE7QUFDUCxTQUFLLFFBQVEsTUFBTTtBQUFBLEVBQ3BCO0FBQ0Q7QUEzT2EsdUJBQU47QUFBQSxFQXVCSjtBQUFBLEVBQ0E7QUFBQSxHQXhCVTtBQWtQTixNQUFNLHNCQUFnRDtBQUFBLEVBYTVELFlBQ1UsUUFDUSxTQUNoQjtBQUZRO0FBQ1E7QUFibEIsU0FBUyxzQkFBc0I7QUFFL0IsU0FBaUIsZUFBZSxJQUFJLGdCQUFnQjtBQUdwRCxTQUFRLFNBQWtCO0FBRTFCLFNBQVEsb0JBQTZCO0FBU3BDLFNBQUssYUFBYSxJQUFJLHFCQUFxQjtBQUMzQyxTQUFLLFdBQVcsUUFBUSxVQUFVLElBQUksMkJBQTJCO0FBQ2pFLFNBQUssV0FBVyxRQUFRLFlBQVksT0FBTyxPQUFPO0FBQ2xELFNBQUssV0FBVyxhQUFhLE9BQU8sTUFBTSxNQUFNLEtBQUs7QUFFckQsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLFdBQW1CO0FBQ3ZCLFFBQUksWUFBb0I7QUFDeEIsU0FBSyxhQUFhLElBQUksS0FBSyxXQUFXLGdCQUFnQixNQUFNO0FBQzNELG1CQUFhLEtBQUs7QUFDbEIsZ0JBQVUsS0FBSyxXQUFXO0FBQUEsSUFDM0IsQ0FBQyxDQUFDO0FBRUYsU0FBSyxhQUFhLElBQUksS0FBSyxXQUFXLFlBQVksT0FBSztBQUN0RCxVQUFJLGNBQWMsU0FBUztBQUMxQixhQUFLLE9BQU8sT0FBTyxFQUFFLFVBQVUsT0FBTyxFQUFFLFVBQVUsTUFBTTtBQUV4RCxZQUFJLGdCQUFnQjtBQUNwQixZQUFJLEVBQUUsTUFBTTtBQUNYLHNCQUFZLFFBQVEsUUFBUSxFQUFFLFVBQVU7QUFDeEMsMEJBQWdCO0FBQUEsUUFDakI7QUFDQSxZQUFJLEVBQUUsT0FBTztBQUNaLHFCQUFXLFFBQVEsU0FBUyxFQUFFLFVBQVU7QUFDeEMsMEJBQWdCO0FBQUEsUUFDakI7QUFDQSxZQUFJLGVBQWU7QUFDbEIsZUFBSyxjQUFjO0FBQUEsWUFDbEIsS0FBSyxXQUFXLE1BQU07QUFBQSxZQUN0QixNQUFNLFdBQVcsT0FBTztBQUFBLFVBQ3pCLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUNBLFVBQUksRUFBRSxNQUFNO0FBQ1gscUJBQWE7QUFDYixrQkFBVTtBQUNWLG1CQUFXO0FBQ1gsb0JBQVk7QUFDWixhQUFLLFlBQVksRUFBRTtBQUFBLE1BQ3BCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLGFBQWEsSUFBSSxLQUFLLE9BQU8sb0JBQW9CLE1BQU07QUFDM0QsVUFBSSxLQUFLLFlBQVk7QUFDcEIsYUFBSyxlQUFlLEtBQUssWUFBWSxLQUFLLGFBQWEsS0FBSyxPQUFPLE1BQU0sS0FBSyxpQkFBaUI7QUFBQSxNQUNoRztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLFdBQVcsUUFBUTtBQUN4QixTQUFLLGFBQWEsUUFBUTtBQUMxQixTQUFLLEtBQUs7QUFBQSxFQUNYO0FBQUEsRUFFQSxRQUFnQjtBQUNmLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxhQUEwQjtBQUN6QixXQUFPLEtBQUssV0FBVztBQUFBLEVBQ3hCO0FBQUEsRUFFQSxjQUE2QztBQUM1QyxXQUFPLEtBQUssV0FBVyxFQUFFLFlBQVksS0FBSyxTQUFTLElBQUk7QUFBQSxFQUN4RDtBQUFBLEVBRUEsT0FBYTtBQUNaLFFBQUksQ0FBQyxLQUFLLFFBQVE7QUFDakIsV0FBSyxRQUFRLGlCQUFpQixJQUFJO0FBQ2xDLFdBQUssU0FBUztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFQSxLQUFLLGVBQXdCLE9BQWE7QUFDekMsU0FBSyxXQUFXLG9CQUFvQjtBQUVwQyxRQUFJLEtBQUssUUFBUTtBQUNoQixXQUFLLFFBQVEsb0JBQW9CLElBQUk7QUFDckMsV0FBSyxTQUFTO0FBQ2QsV0FBSyxhQUFhO0FBQ2xCLFdBQUssV0FBVztBQUFBLElBQ2pCO0FBQ0EsUUFBSSxjQUFjO0FBQ2pCLFdBQUssWUFBWTtBQUNqQixXQUFLLE9BQU8sY0FBYztBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUFBLEVBRUEsY0FBYyxRQUFxQixrQkFBMkI7QUFDN0QsVUFBTSxZQUFZLE9BQU8sc0JBQXNCO0FBQy9DLFNBQUssYUFBYTtBQUNsQixTQUFLLG9CQUFvQjtBQUN6QixTQUFLLGVBQWUsS0FBSyxZQUFZLEtBQUssYUFBYSxLQUFLLE9BQU8sTUFBTSxnQkFBZ0I7QUFBQSxFQUMxRjtBQUFBLEVBRUEsZUFBZSxXQUFxQyxNQUFxQixrQkFBMkI7QUFDbkcsVUFBTSxVQUFVLElBQUksY0FBYyxLQUFLLFdBQVcsRUFBRSxjQUFjLElBQUk7QUFFdEUsVUFBTSxPQUFPLEtBQUssT0FBTyxjQUFjO0FBRXZDLFVBQU0saUJBQWlCLElBQUksSUFBSSxVQUFVLEtBQUssSUFBSSxLQUFLLFVBQVU7QUFDakUsVUFBTSxhQUFhLFVBQVU7QUFLN0IsVUFBTSxpQkFBNEIsV0FBWTtBQUM3QyxZQUFNLFFBQVEsUUFBUSxTQUFTLFVBQVUsT0FBTyxVQUFVLFFBQVEsS0FBSyxjQUFjLEtBQUs7QUFDMUYsWUFBTUEsUUFBTyxDQUFDLEtBQUssY0FBYyxVQUFVLE9BQU8sVUFBVTtBQUM1RCxZQUFNLGFBQWEsSUFBSSxJQUFJLFVBQVUsT0FBTyxRQUFRLFNBQVMsVUFBVSxNQUFNLEtBQUssZUFBZSxLQUFLLGVBQWU7QUFDckgsWUFBTSxnQkFBZ0IsV0FBVyxLQUFLLFFBQVcsVUFBVSxNQUFNLFVBQVUsU0FBUyxLQUFLLGVBQWUsS0FBSyxlQUFlO0FBQzVILGFBQU8sRUFBRSxLQUFLLFlBQVksTUFBQUEsT0FBTSxLQUFLLFFBQVEsS0FBSyxPQUFPLFlBQVksZUFBZSxTQUFTLGVBQWUsS0FBSyxLQUFLLElBQUksT0FBTyxlQUFlLEtBQUssQ0FBQyxFQUFFO0FBQUEsSUFDekosR0FBRztBQUdILFVBQU0saUJBQTRCLFdBQVk7QUFDN0MsWUFBTSxRQUFRLFVBQVUsT0FBTyxLQUFLLGNBQWMsS0FBSztBQUN2RCxZQUFNQSxRQUFPLEtBQUssSUFBSSxLQUFLLG1CQUFtQixVQUFVLE9BQU8sS0FBSyxRQUFRLEtBQUssV0FBVztBQUM1RixZQUFNLGFBQWEsSUFBSSxJQUFJLFVBQVUsT0FBTyxRQUFRLFNBQVMsVUFBVSxNQUFNLEtBQUssZUFBZSxLQUFLLGVBQWU7QUFDckgsWUFBTSxnQkFBZ0IsV0FBVyxLQUFLLFFBQVcsVUFBVSxNQUFNLFVBQVUsU0FBUyxLQUFLLGVBQWUsS0FBSyxlQUFlO0FBQzVILGFBQU8sRUFBRSxLQUFLLFlBQVksTUFBQUEsT0FBTSxLQUFLLFFBQVEsS0FBSyxPQUFPLFlBQVksZUFBZSxTQUFTLGVBQWUsS0FBSyxLQUFLLElBQUksT0FBTyxlQUFlLEtBQUssQ0FBQyxFQUFFO0FBQUEsSUFDekosR0FBRztBQUdILFVBQU0sa0JBQTZCLFdBQVk7QUFDOUMsWUFBTUEsUUFBTyxVQUFVO0FBQ3ZCLFlBQU1DLE9BQU0sQ0FBQyxLQUFLLGNBQWMsVUFBVSxNQUFNLFVBQVU7QUFDMUQsWUFBTSxnQkFBZ0IsSUFBSSxJQUFJLFVBQVUsVUFBVSxRQUFRLEtBQUssY0FBYyxRQUFRLFNBQVMsVUFBVSxNQUFNLFVBQVUsU0FBUyxLQUFLLGVBQWU7QUFDckosYUFBTyxFQUFFLEtBQUFBLE1BQUssTUFBQUQsT0FBTSxLQUFLLGNBQWMsU0FBUyxLQUFLLFFBQVEsZUFBZSxZQUFZLGVBQWUsU0FBUyxlQUFlLEtBQUssY0FBYyxLQUFLLEVBQUU7QUFBQSxJQUMxSixHQUFHO0FBR0gsVUFBTSxrQkFBNkIsV0FBWTtBQUM5QyxZQUFNQSxRQUFPLFVBQVU7QUFDdkIsWUFBTSxhQUFhLElBQUksSUFBSSxVQUFVLFVBQVUsUUFBUSxLQUFLLGNBQWMsVUFBVSxNQUFNLEtBQUssZUFBZTtBQUM5RyxZQUFNQyxPQUFNLEtBQUssSUFBSSxLQUFLLGlCQUFpQixVQUFVLE1BQU0sS0FBSyxNQUFNO0FBQ3RFLGFBQU8sRUFBRSxLQUFBQSxNQUFLLE1BQUFELE9BQU0sS0FBSyxXQUFXLFNBQVMsS0FBSyxRQUFRLFlBQVksZUFBZSxZQUFZLFNBQVMsZUFBZSxLQUFLLFdBQVcsS0FBSyxFQUFFO0FBQUEsSUFDakosR0FBRztBQUlILFVBQU0sb0JBQW9CLG1CQUFtQixpQkFBaUI7QUFDOUQsVUFBTSxhQUFhLENBQUMsZUFBZSxlQUFlLGlCQUFpQjtBQUNuRSxVQUFNLFlBQVksV0FBVyxLQUFLLE9BQUssRUFBRSxPQUFPLENBQUMsS0FBSyxXQUFXLEtBQUssQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFFaEcsVUFBTSxTQUFTLFVBQVUsTUFBTSxVQUFVLFNBQVMsS0FBSztBQUN2RCxRQUFJO0FBQ0osUUFBSSxTQUFTLEtBQUs7QUFDbEIsVUFBTSxZQUFZLEtBQUssSUFBSSxVQUFVLFdBQVcsUUFBUSxVQUFVLGNBQWMsTUFBTTtBQUN0RixRQUFJLFNBQVMsV0FBVztBQUN2QixlQUFTO0FBQUEsSUFDVjtBQUNBLFFBQUk7QUFDSixRQUFJLGtCQUFrQjtBQUNyQixVQUFJLFVBQVUsVUFBVSxXQUFXLFFBQVE7QUFDMUMscUJBQWE7QUFDYixrQkFBVSxVQUFVO0FBQUEsTUFDckIsT0FBTztBQUNOLHFCQUFhO0FBQ2Isa0JBQVUsVUFBVTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxPQUFPO0FBQ04sVUFBSSxVQUFVLFVBQVUsY0FBYyxRQUFRO0FBQzdDLHFCQUFhO0FBQ2Isa0JBQVUsVUFBVTtBQUFBLE1BQ3JCLE9BQU87QUFDTixxQkFBYTtBQUNiLGtCQUFVLFVBQVU7QUFBQSxNQUNyQjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEVBQUUsS0FBSyxLQUFLLElBQUk7QUFDcEIsUUFBSSxjQUFjLGdCQUFnQjtBQUVqQyxZQUFNLFVBQVUsTUFBTSxTQUFTLEtBQUs7QUFBQSxJQUNyQyxXQUFXLENBQUMsY0FBYyxTQUFTLFVBQVUsUUFBUTtBQUNwRCxZQUFNLFNBQVM7QUFBQSxJQUNoQjtBQUNBLFVBQU0sZ0JBQWdCLEtBQUssUUFBUSxXQUFXO0FBQzlDLFFBQUksZUFBZTtBQUVsQixZQUFNLG9CQUFvQixjQUFjLHNCQUFzQjtBQUM5RCxhQUFPLGtCQUFrQjtBQUN6QixjQUFRLGtCQUFrQjtBQUFBLElBQzNCO0FBQ0EsU0FBSyxjQUFjLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFNaEMsUUFBSSxjQUFjLGdCQUFnQjtBQUNqQyxXQUFLLFdBQVcsYUFBYSxNQUFNLE9BQU8sT0FBTyxJQUFJO0FBQUEsSUFDdEQsT0FBTztBQUNOLFdBQUssV0FBVyxhQUFhLENBQUMsWUFBWSxjQUFjLGVBQWUsWUFBWSxjQUFjLGFBQWE7QUFBQSxJQUMvRztBQUVBLFNBQUssV0FBVyxVQUFVLFVBQVU7QUFDcEMsU0FBSyxXQUFXLFVBQVU7QUFDMUIsU0FBSyxXQUFXLE9BQU8sUUFBUSxLQUFLLElBQUksUUFBUSxPQUFPLEtBQUssS0FBSyxDQUFDO0FBQ2xFLFNBQUssT0FBTyxPQUFPLEtBQUssV0FBVyxLQUFLLE9BQU8sS0FBSyxXQUFXLEtBQUssTUFBTTtBQUFBLEVBQzNFO0FBQUEsRUFFUSxjQUFjLFNBQWdDO0FBQ3JELFNBQUssV0FBVztBQUNoQixTQUFLLFFBQVEsb0JBQW9CLElBQUk7QUFBQSxFQUN0QztBQUNEOyIsCiAgIm5hbWVzIjogWyJsZWZ0IiwgInRvcCJdCn0K
