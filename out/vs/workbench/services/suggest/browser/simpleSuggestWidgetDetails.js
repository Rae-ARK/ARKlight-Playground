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
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ResizableHTMLElement } from "../../../../base/browser/ui/resizable/resizable.js";
import * as nls from "../../../../nls.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
function canExpandCompletionItem(item) {
  return !!item && Boolean(item.completion.documentation || item.completion.detail && item.completion.detail !== item.completion.label);
}
const SuggestDetailsClassName = "suggest-details";
var SimpleSuggestDetailsPlacement = /* @__PURE__ */ ((SimpleSuggestDetailsPlacement2) => {
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["East"] = 0] = "East";
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["West"] = 1] = "West";
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["South"] = 2] = "South";
  SimpleSuggestDetailsPlacement2[SimpleSuggestDetailsPlacement2["North"] = 3] = "North";
  return SimpleSuggestDetailsPlacement2;
})(SimpleSuggestDetailsPlacement || {});
let SimpleSuggestDetailsWidget = class {
  constructor(_getFontInfo, onDidFontInfoChange, _getAdvancedExplainModeDetails, instaService, markdownRendererService) {
    this._getFontInfo = _getFontInfo;
    this._getAdvancedExplainModeDetails = _getAdvancedExplainModeDetails;
    this.markdownRendererService = markdownRendererService;
    this._onDidClose = new Emitter();
    this.onDidClose = this._onDidClose.event;
    this._onDidChangeContents = new Emitter();
    this.onDidChangeContents = this._onDidChangeContents.event;
    this._disposables = new DisposableStore();
    this._renderDisposeable = this._disposables.add(new DisposableStore());
    this._borderWidth = 1;
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
    this._close.role = "button";
    this._close.tabIndex = -1;
    this._type = dom.append(this._header, dom.$("p.type"));
    this._docs = dom.append(this._body, dom.$("p.docs"));
    this._configureFont();
    this._disposables.add(onDidFontInfoChange(() => this._configureFont()));
  }
  _configureFont() {
    const fontInfo = this._getFontInfo();
    const fontFamily = fontInfo.fontFamily;
    const fontSize = fontInfo.fontSize;
    const lineHeight = fontInfo.lineHeight;
    const fontWeight = fontInfo.fontWeight;
    const fontSizePx = `${fontSize}px`;
    const lineHeightPx = `${lineHeight}px`;
    this.domNode.style.fontSize = fontSizePx;
    this.domNode.style.lineHeight = `${lineHeight / fontSize}`;
    this.domNode.style.fontWeight = fontWeight;
    this._type.style.fontFamily = fontFamily;
    this._close.style.height = lineHeightPx;
    this._close.style.width = lineHeightPx;
  }
  dispose() {
    this._disposables.dispose();
    this._onDidClose.dispose();
    this._onDidChangeContents.dispose();
  }
  getLayoutInfo() {
    const lineHeight = this._getFontInfo().lineHeight;
    const borderWidth = this._borderWidth;
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
    let md = "";
    if (explainMode) {
      md += `score: ${item.score[0]}
`;
      md += `prefix: ${item.word ?? "(no prefix)"}
`;
      const vs = item.completion.replacementRange;
      md += `valueSelection: ${vs ? `[${vs[0]}, ${vs[1]}]` : "undefined"}
`;
      md += `index: ${item.idx}
`;
      if (this._getAdvancedExplainModeDetails) {
        const advancedDetails = this._getAdvancedExplainModeDetails();
        if (advancedDetails) {
          md += `${advancedDetails}
`;
        }
      }
      detail = `Provider: ${item.completion.provider}`;
      documentation = new MarkdownString().appendCodeblock("empty", md);
    }
    const hasDetail = typeof detail === "string" ? detail.trim().length > 0 : !!detail;
    const hasDocs = typeof documentation === "string" ? documentation.trim().length > 0 : !!(documentation && documentation.value?.trim().length > 0);
    const updateSize = () => {
      this.layout(this._size.width, this._type.clientHeight + this._docs.clientHeight);
      this._onDidChangeContents.fire(this);
    };
    if (!explainMode && (!canExpandCompletionItem(item) || !hasDetail && !hasDocs)) {
      this.clearContents();
      return;
    }
    this.domNode.classList.remove("no-docs", "no-type");
    if (hasDetail && detail) {
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
    if (hasDocs && typeof documentation === "string") {
      this._docs.classList.remove("markdown-docs");
      this._docs.textContent = documentation;
    } else if (hasDocs && documentation && typeof documentation !== "string") {
      this._docs.classList.add("markdown-docs");
      dom.clearNode(this._docs);
      const renderedContents = this.markdownRendererService.render(documentation, {
        asyncRenderCallback: () => {
          updateSize();
        }
      });
      this._docs.appendChild(renderedContents.element);
      this._renderDisposeable.add(renderedContents);
    } else {
      this._docs.classList.remove("markdown-docs");
    }
    this.domNode.classList.toggle("detail-and-doc", hasDetail && hasDocs);
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
    updateSize();
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
  set borderWidth(width) {
    this._borderWidth = width;
  }
  get borderWidth() {
    return this._borderWidth;
  }
  focus() {
    this.domNode.focus();
  }
};
SimpleSuggestDetailsWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IMarkdownRendererService)
], SimpleSuggestDetailsWidget);
class SimpleSuggestDetailsOverlay {
  constructor(widget, _container, preventPlacements) {
    this.widget = widget;
    this._container = _container;
    this._disposables = new DisposableStore();
    this._added = false;
    this._resizable = this._disposables.add(new ResizableHTMLElement());
    this._resizable.domNode.classList.add("suggest-details-container");
    this._resizable.domNode.appendChild(widget.domNode);
    this._resizable.enableSashes(false, true, true, false);
    this._preventPlacements = preventPlacements && preventPlacements.length ? new Set(preventPlacements) : void 0;
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
        this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
      }
    }));
  }
  dispose() {
    this.widget.dispose();
    this._disposables.dispose();
    this.hide();
  }
  getId() {
    return "suggest.details";
  }
  getDomNode() {
    return this._resizable.domNode;
  }
  show() {
    if (!this._added) {
      this._container.appendChild(this._resizable.domNode);
      this._added = true;
    }
  }
  hide(sessionEnded = false) {
    this._resizable.clearSashHoverState();
    if (this._added) {
      this._container.removeChild(this._resizable.domNode);
      this._added = false;
      this._anchorBox = void 0;
    }
    if (sessionEnded) {
      this._userSize = void 0;
      this.widget.clearContents();
    }
  }
  placeAtAnchor(anchor) {
    const anchorBox = anchor.getBoundingClientRect();
    this._anchorBox = anchorBox;
    this.widget.layout(this._resizable.size.width, this._resizable.size.height);
    this._placeAtAnchor(this._anchorBox, this._userSize ?? this.widget.size);
  }
  _placeAtAnchor(anchorBox, size) {
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
      const width = Math.max(anchorBox.width - info.borderHeight, 0);
      const left2 = anchorBox.left;
      const maxHeightAbove = Math.max(anchorBox.top - info.verticalPadding, 0);
      const heightForTop = Math.min(size.height, maxHeightAbove);
      const top2 = anchorBox.top - info.borderWidth - heightForTop;
      const maxSize2 = new dom.Dimension(width, Math.max(maxHeightAbove, 0));
      return { top: top2, left: left2, fit: maxSize2.height - size.height, maxSizeTop: maxSize2, maxSizeBottom: maxSize2, minSize: defaultMinSize.with(maxSize2.width) };
    })();
    const placementEntries = [
      [0 /* East */, eastPlacement],
      [2 /* South */, southPlacement],
      [3 /* North */, northPlacement],
      [1 /* West */, westPlacement]
    ];
    const orientations = (this._preventPlacements ? placementEntries.filter(([direction]) => !this._preventPlacements.has(direction)) : placementEntries).map(([, entry]) => entry);
    const candidates = orientations.length ? orientations : placementEntries.map(([, entry]) => entry);
    const placement = candidates.find((p) => p.fit >= 0) ?? candidates.reduce((best, current) => !best || current.fit > best.fit ? current : best, void 0) ?? eastPlacement;
    const bottom = anchorBox.top + anchorBox.height - info.borderHeight;
    let alignAtTop;
    let height = size.height;
    const maxHeight = Math.max(placement.maxSizeTop.height, placement.maxSizeBottom.height);
    if (height > maxHeight) {
      height = maxHeight;
    }
    let maxSize;
    if (height <= placement.maxSizeTop.height) {
      alignAtTop = true;
      maxSize = placement.maxSizeTop;
    } else {
      alignAtTop = false;
      maxSize = placement.maxSizeBottom;
    }
    let { top, left } = placement;
    if (!alignAtTop && height > anchorBox.height) {
      top = bottom - height;
    }
    const editorDomNode = this._container;
    if (editorDomNode) {
      const editorBoundingBox = editorDomNode.getBoundingClientRect();
      top -= editorBoundingBox.top;
      left -= editorBoundingBox.left;
    }
    this._applyTopLeft({ left, top });
    this._resizable.enableSashes(!alignAtTop, placement === eastPlacement, alignAtTop, placement !== eastPlacement);
    this._resizable.minSize = placement.minSize;
    this._resizable.maxSize = maxSize;
    this._resizable.layout(height, Math.min(maxSize.width, size.width));
    this.widget.layout(this._resizable.size.width, this._resizable.size.height);
  }
  _applyTopLeft(topLeft) {
    this._topLeft = topLeft;
    this._resizable.domNode.style.top = `${topLeft.top}px`;
    this._resizable.domNode.style.left = `${topLeft.left}px`;
    this._resizable.domNode.style.position = "absolute";
  }
}
export {
  SimpleSuggestDetailsOverlay,
  SimpleSuggestDetailsPlacement,
  SimpleSuggestDetailsWidget,
  SuggestDetailsClassName,
  canExpandCompletionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlU3VnZ2VzdFdpZGdldERldGFpbHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBEb21TY3JvbGxhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNpemFibGVIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9yZXNpemFibGUvcmVzaXphYmxlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgU2ltcGxlQ29tcGxldGlvbkl0ZW0gfSBmcm9tICcuL3NpbXBsZUNvbXBsZXRpb25JdGVtLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVNpbXBsZVN1Z2dlc3RXaWRnZXRGb250SW5mbyB9IGZyb20gJy4vc2ltcGxlU3VnZ2VzdFdpZGdldFJlbmRlcmVyLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNhbkV4cGFuZENvbXBsZXRpb25JdGVtKGl0ZW06IFNpbXBsZUNvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIWl0ZW0gJiYgQm9vbGVhbihpdGVtLmNvbXBsZXRpb24uZG9jdW1lbnRhdGlvbiB8fCBpdGVtLmNvbXBsZXRpb24uZGV0YWlsICYmIGl0ZW0uY29tcGxldGlvbi5kZXRhaWwgIT09IGl0ZW0uY29tcGxldGlvbi5sYWJlbCk7XG59XG5cbmV4cG9ydCBjb25zdCBTdWdnZXN0RGV0YWlsc0NsYXNzTmFtZSA9ICdzdWdnZXN0LWRldGFpbHMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudCB7XG5cdEVhc3QgPSAwLFxuXHRXZXN0ID0gMSxcblx0U291dGggPSAyLFxuXHROb3J0aCA9IDNcbn1cblxuZXhwb3J0IGNsYXNzIFNpbXBsZVN1Z2dlc3REZXRhaWxzV2lkZ2V0IHtcblxuXHRyZWFkb25seSBkb21Ob2RlOiBIVE1MRGl2RWxlbWVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENsb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ29udGVudHMgPSBuZXcgRW1pdHRlcjx0aGlzPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUNvbnRlbnRzOiBFdmVudDx0aGlzPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudHMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2xvc2U6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY3JvbGxiYXI6IERvbVNjcm9sbGFibGVFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ib2R5OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfaGVhZGVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdHlwZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3M6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJEaXNwb3NlYWJsZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9ib3JkZXJXaWR0aDogbnVtYmVyID0gMTtcblx0cHJpdmF0ZSBfc2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKDMzMCwgMCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0Rm9udEluZm86ICgpID0+IElTaW1wbGVTdWdnZXN0V2lkZ2V0Rm9udEluZm8sXG5cdFx0b25EaWRGb250SW5mb0NoYW5nZTogRXZlbnQ8dm9pZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0QWR2YW5jZWRFeHBsYWluTW9kZURldGFpbHM6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZG93blJlbmRlcmVyU2VydmljZTogSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb20uJCgnLnN1Z2dlc3QtZGV0YWlscycpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCduby1kb2NzJyk7XG5cblx0XHR0aGlzLl9ib2R5ID0gZG9tLiQoJy5ib2R5Jyk7XG5cblx0XHR0aGlzLl9zY3JvbGxiYXIgPSBuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5fYm9keSwge1xuXHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWUsXG5cdFx0fSk7XG5cdFx0ZG9tLmFwcGVuZCh0aGlzLmRvbU5vZGUsIHRoaXMuX3Njcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9zY3JvbGxiYXIpO1xuXG5cdFx0dGhpcy5faGVhZGVyID0gZG9tLmFwcGVuZCh0aGlzLl9ib2R5LCBkb20uJCgnLmhlYWRlcicpKTtcblx0XHR0aGlzLl9jbG9zZSA9IGRvbS5hcHBlbmQodGhpcy5faGVhZGVyLCBkb20uJCgnc3BhbicgKyBUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLmNsb3NlKSkpO1xuXHRcdHRoaXMuX2Nsb3NlLnRpdGxlID0gbmxzLmxvY2FsaXplKCdkZXRhaWxzLmNsb3NlJywgXCJDbG9zZVwiKTtcblx0XHR0aGlzLl9jbG9zZS5yb2xlID0gJ2J1dHRvbic7XG5cdFx0dGhpcy5fY2xvc2UudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLl90eXBlID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXIsIGRvbS4kKCdwLnR5cGUnKSk7XG5cblx0XHR0aGlzLl9kb2NzID0gZG9tLmFwcGVuZCh0aGlzLl9ib2R5LCBkb20uJCgncC5kb2NzJykpO1xuXG5cdFx0dGhpcy5fY29uZmlndXJlRm9udCgpO1xuXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKG9uRGlkRm9udEluZm9DaGFuZ2UoKCkgPT4gdGhpcy5fY29uZmlndXJlRm9udCgpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maWd1cmVGb250KCk6IHZvaWQge1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gdGhpcy5fZ2V0Rm9udEluZm8oKTtcblx0XHRjb25zdCBmb250RmFtaWx5ID0gZm9udEluZm8uZm9udEZhbWlseTtcblxuXHRcdGNvbnN0IGZvbnRTaXplID0gZm9udEluZm8uZm9udFNpemU7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IGZvbnRJbmZvLmxpbmVIZWlnaHQ7XG5cdFx0Y29uc3QgZm9udFdlaWdodCA9IGZvbnRJbmZvLmZvbnRXZWlnaHQ7XG5cdFx0Y29uc3QgZm9udFNpemVQeCA9IGAke2ZvbnRTaXplfXB4YDtcblx0XHRjb25zdCBsaW5lSGVpZ2h0UHggPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblxuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5mb250U2l6ZSA9IGZvbnRTaXplUHg7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtsaW5lSGVpZ2h0IC8gZm9udFNpemV9YDtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuZm9udFdlaWdodCA9IGZvbnRXZWlnaHQ7XG5cdFx0Ly8gdGhpcy5kb21Ob2RlLnN0eWxlLmZvbnRGZWF0dXJlU2V0dGluZ3MgPSBmb250SW5mby5mb250RmVhdHVyZVNldHRpbmdzO1xuXHRcdHRoaXMuX3R5cGUuc3R5bGUuZm9udEZhbWlseSA9IGZvbnRGYW1pbHk7XG5cdFx0dGhpcy5fY2xvc2Uuc3R5bGUuaGVpZ2h0ID0gbGluZUhlaWdodFB4O1xuXHRcdHRoaXMuX2Nsb3NlLnN0eWxlLndpZHRoID0gbGluZUhlaWdodFB4O1xuXG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENsb3NlLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGdldExheW91dEluZm8oKSB7XG5cdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2dldEZvbnRJbmZvKCkubGluZUhlaWdodDtcblx0XHRjb25zdCBib3JkZXJXaWR0aCA9IHRoaXMuX2JvcmRlcldpZHRoO1xuXHRcdGNvbnN0IGJvcmRlckhlaWdodCA9IGJvcmRlcldpZHRoICogMjtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGluZUhlaWdodCxcblx0XHRcdGJvcmRlcldpZHRoLFxuXHRcdFx0Ym9yZGVySGVpZ2h0LFxuXHRcdFx0dmVydGljYWxQYWRkaW5nOiAyMixcblx0XHRcdGhvcml6b250YWxQYWRkaW5nOiAxNFxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJMb2FkaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuX3R5cGUudGV4dENvbnRlbnQgPSBubHMubG9jYWxpemUoJ2xvYWRpbmcnLCBcIkxvYWRpbmcuLi5cIik7XG5cdFx0dGhpcy5fZG9jcy50ZXh0Q29udGVudCA9ICcnO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCduby1kb2NzJywgJ25vLXR5cGUnKTtcblx0XHR0aGlzLmxheW91dCh0aGlzLnNpemUud2lkdGgsIHRoaXMuZ2V0TGF5b3V0SW5mbygpLmxpbmVIZWlnaHQgKiAyKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRzLmZpcmUodGhpcyk7XG5cdH1cblxuXHRyZW5kZXJJdGVtKGl0ZW06IFNpbXBsZUNvbXBsZXRpb25JdGVtLCBleHBsYWluTW9kZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2VhYmxlLmNsZWFyKCk7XG5cblx0XHRsZXQgeyBkZXRhaWwsIGRvY3VtZW50YXRpb24gfSA9IGl0ZW0uY29tcGxldGlvbjtcblxuXHRcdGxldCBtZCA9ICcnO1xuXG5cdFx0aWYgKGV4cGxhaW5Nb2RlKSB7XG5cdFx0XHRtZCArPSBgc2NvcmU6ICR7aXRlbS5zY29yZVswXX1cXG5gO1xuXHRcdFx0bWQgKz0gYHByZWZpeDogJHtpdGVtLndvcmQgPz8gJyhubyBwcmVmaXgpJ31cXG5gO1xuXHRcdFx0Y29uc3QgdnMgPSBpdGVtLmNvbXBsZXRpb24ucmVwbGFjZW1lbnRSYW5nZTtcblx0XHRcdG1kICs9IGB2YWx1ZVNlbGVjdGlvbjogJHt2cyA/IGBbJHt2c1swXX0sICR7dnNbMV19XWAgOiAndW5kZWZpbmVkJ31cXG5gO1xuXHRcdFx0bWQgKz0gYGluZGV4OiAke2l0ZW0uaWR4fVxcbmA7XG5cdFx0XHRpZiAodGhpcy5fZ2V0QWR2YW5jZWRFeHBsYWluTW9kZURldGFpbHMpIHtcblx0XHRcdFx0Y29uc3QgYWR2YW5jZWREZXRhaWxzID0gdGhpcy5fZ2V0QWR2YW5jZWRFeHBsYWluTW9kZURldGFpbHMoKTtcblx0XHRcdFx0aWYgKGFkdmFuY2VkRGV0YWlscykge1xuXHRcdFx0XHRcdG1kICs9IGAke2FkdmFuY2VkRGV0YWlsc31cXG5gO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRkZXRhaWwgPSBgUHJvdmlkZXI6ICR7aXRlbS5jb21wbGV0aW9uLnByb3ZpZGVyfWA7XG5cdFx0XHRkb2N1bWVudGF0aW9uID0gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kQ29kZWJsb2NrKCdlbXB0eScsIG1kKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNEZXRhaWwgPSB0eXBlb2YgZGV0YWlsID09PSAnc3RyaW5nJyA/IGRldGFpbC50cmltKCkubGVuZ3RoID4gMCA6ICEhZGV0YWlsO1xuXHRcdGNvbnN0IGhhc0RvY3MgPSB0eXBlb2YgZG9jdW1lbnRhdGlvbiA9PT0gJ3N0cmluZydcblx0XHRcdD8gZG9jdW1lbnRhdGlvbi50cmltKCkubGVuZ3RoID4gMFxuXHRcdFx0OiAhIShkb2N1bWVudGF0aW9uICYmIGRvY3VtZW50YXRpb24udmFsdWU/LnRyaW0oKS5sZW5ndGggPiAwKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVNpemUgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmxheW91dCh0aGlzLl9zaXplLndpZHRoLCB0aGlzLl90eXBlLmNsaWVudEhlaWdodCArIHRoaXMuX2RvY3MuY2xpZW50SGVpZ2h0KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29udGVudHMuZmlyZSh0aGlzKTtcblx0XHR9O1xuXG5cdFx0aWYgKCFleHBsYWluTW9kZSAmJiAoIWNhbkV4cGFuZENvbXBsZXRpb25JdGVtKGl0ZW0pIHx8ICghaGFzRGV0YWlsICYmICFoYXNEb2NzKSkpIHtcblx0XHRcdHRoaXMuY2xlYXJDb250ZW50cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCduby1kb2NzJywgJ25vLXR5cGUnKTtcblxuXHRcdC8vIC0tLSBkZXRhaWxzXG5cblx0XHRpZiAoaGFzRGV0YWlsICYmIGRldGFpbCkge1xuXHRcdFx0Y29uc3QgY2FwcGVkRGV0YWlsID0gZGV0YWlsLmxlbmd0aCA+IDEwMDAwMCA/IGAke2RldGFpbC5zdWJzdHIoMCwgMTAwMDAwKX1cdTIwMjZgIDogZGV0YWlsO1xuXHRcdFx0dGhpcy5fdHlwZS50ZXh0Q29udGVudCA9IGNhcHBlZERldGFpbDtcblx0XHRcdHRoaXMuX3R5cGUudGl0bGUgPSBjYXBwZWREZXRhaWw7XG5cdFx0XHRkb20uc2hvdyh0aGlzLl90eXBlKTtcblx0XHRcdHRoaXMuX3R5cGUuY2xhc3NMaXN0LnRvZ2dsZSgnYXV0by13cmFwJywgIS9cXHI/XFxuXlxccysvZ21pLnRlc3QoY2FwcGVkRGV0YWlsKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5fdHlwZSk7XG5cdFx0XHR0aGlzLl90eXBlLnRpdGxlID0gJyc7XG5cdFx0XHRkb20uaGlkZSh0aGlzLl90eXBlKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCduby10eXBlJyk7XG5cdFx0fVxuXG5cdFx0Ly8gLy8gLS0tIGRvY3VtZW50YXRpb25cblxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fZG9jcyk7XG5cdFx0aWYgKGhhc0RvY3MgJiYgdHlwZW9mIGRvY3VtZW50YXRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9kb2NzLmNsYXNzTGlzdC5yZW1vdmUoJ21hcmtkb3duLWRvY3MnKTtcblx0XHRcdHRoaXMuX2RvY3MudGV4dENvbnRlbnQgPSBkb2N1bWVudGF0aW9uO1xuXG5cdFx0fSBlbHNlIGlmIChoYXNEb2NzICYmIGRvY3VtZW50YXRpb24gJiYgdHlwZW9mIGRvY3VtZW50YXRpb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9kb2NzLmNsYXNzTGlzdC5hZGQoJ21hcmtkb3duLWRvY3MnKTtcblx0XHRcdGRvbS5jbGVhck5vZGUodGhpcy5fZG9jcyk7XG5cdFx0XHRjb25zdCByZW5kZXJlZENvbnRlbnRzID0gdGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIoZG9jdW1lbnRhdGlvbiwge1xuXHRcdFx0XHRhc3luY1JlbmRlckNhbGxiYWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0dXBkYXRlU2l6ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2RvY3MuYXBwZW5kQ2hpbGQocmVuZGVyZWRDb250ZW50cy5lbGVtZW50KTtcblx0XHRcdHRoaXMuX3JlbmRlckRpc3Bvc2VhYmxlLmFkZChyZW5kZXJlZENvbnRlbnRzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZG9jcy5jbGFzc0xpc3QucmVtb3ZlKCdtYXJrZG93bi1kb2NzJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2RldGFpbC1hbmQtZG9jJywgaGFzRGV0YWlsICYmIGhhc0RvY3MpO1xuXG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLnVzZXJTZWxlY3QgPSAndGV4dCc7XG5cdFx0dGhpcy5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cblx0XHR0aGlzLl9jbG9zZS5vbm1vdXNlZG93biA9IGUgPT4ge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR9O1xuXHRcdHRoaXMuX2Nsb3NlLm9uY2xpY2sgPSBlID0+IHtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENsb3NlLmZpcmUoKTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fYm9keS5zY3JvbGxUb3AgPSAwO1xuXG5cdFx0dXBkYXRlU2l6ZSgpO1xuXHR9XG5cblx0Y2xlYXJDb250ZW50cygpIHtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnbm8tZG9jcycpO1xuXHRcdHRoaXMuX3R5cGUudGV4dENvbnRlbnQgPSAnJztcblx0XHR0aGlzLl9kb2NzLnRleHRDb250ZW50ID0gJyc7XG5cdH1cblxuXHRnZXQgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5jb250YWlucygnbm8tZG9jcycpO1xuXHR9XG5cblx0Z2V0IHNpemUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpemU7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdTaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0aWYgKCFkb20uRGltZW5zaW9uLmVxdWFscyhuZXdTaXplLCB0aGlzLl9zaXplKSkge1xuXHRcdFx0dGhpcy5fc2l6ZSA9IG5ld1NpemU7XG5cdFx0XHRkb20uc2l6ZSh0aGlzLmRvbU5vZGUsIHdpZHRoLCBoZWlnaHQpO1xuXHRcdH1cblx0XHR0aGlzLl9zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHNjcm9sbERvd24obXVjaCA9IDgpOiB2b2lkIHtcblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCArPSBtdWNoO1xuXHR9XG5cblx0c2Nyb2xsVXAobXVjaCA9IDgpOiB2b2lkIHtcblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCAtPSBtdWNoO1xuXHR9XG5cblx0c2Nyb2xsVG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX2JvZHkuc2Nyb2xsVG9wID0gMDtcblx0fVxuXG5cdHNjcm9sbEJvdHRvbSgpOiB2b2lkIHtcblx0XHR0aGlzLl9ib2R5LnNjcm9sbFRvcCA9IHRoaXMuX2JvZHkuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0cGFnZURvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5zY3JvbGxEb3duKDgwKTtcblx0fVxuXG5cdHBhZ2VVcCgpOiB2b2lkIHtcblx0XHR0aGlzLnNjcm9sbFVwKDgwKTtcblx0fVxuXG5cdHNldCBib3JkZXJXaWR0aCh3aWR0aDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fYm9yZGVyV2lkdGggPSB3aWR0aDtcblx0fVxuXG5cdGdldCBib3JkZXJXaWR0aCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fYm9yZGVyV2lkdGg7XG5cdH1cblxuXHRmb2N1cygpIHtcblx0XHR0aGlzLmRvbU5vZGUuZm9jdXMoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2ltcGxlU3VnZ2VzdERldGFpbHNPdmVybGF5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzaXphYmxlOiBSZXNpemFibGVIVE1MRWxlbWVudDtcblxuXHRwcml2YXRlIF9hZGRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9hbmNob3JCb3g/OiBkb20uSURvbU5vZGVQYWdlUG9zaXRpb247XG5cdC8vIHByaXZhdGUgX3ByZWZlckFsaWduQXRUb3A6IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIF91c2VyU2l6ZT86IGRvbS5EaW1lbnNpb247XG5cdHByaXZhdGUgX3RvcExlZnQ/OiBUb3BMZWZ0UG9zaXRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZlbnRQbGFjZW1lbnRzPzogUmVhZG9ubHlTZXQ8U2ltcGxlU3VnZ2VzdERldGFpbHNQbGFjZW1lbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdpZGdldDogU2ltcGxlU3VnZ2VzdERldGFpbHNXaWRnZXQsXG5cdFx0cHJpdmF0ZSBfY29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRwcmV2ZW50UGxhY2VtZW50cz86IHJlYWRvbmx5IFNpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50W11cblx0KSB7XG5cblx0XHR0aGlzLl9yZXNpemFibGUgPSB0aGlzLl9kaXNwb3NhYmxlcy5hZGQobmV3IFJlc2l6YWJsZUhUTUxFbGVtZW50KCkpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3N1Z2dlc3QtZGV0YWlscy1jb250YWluZXInKTtcblx0XHR0aGlzLl9yZXNpemFibGUuZG9tTm9kZS5hcHBlbmRDaGlsZCh3aWRnZXQuZG9tTm9kZSk7XG5cdFx0dGhpcy5fcmVzaXphYmxlLmVuYWJsZVNhc2hlcyhmYWxzZSwgdHJ1ZSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdHRoaXMuX3ByZXZlbnRQbGFjZW1lbnRzID0gcHJldmVudFBsYWNlbWVudHMgJiYgcHJldmVudFBsYWNlbWVudHMubGVuZ3RoID8gbmV3IFNldChwcmV2ZW50UGxhY2VtZW50cykgOiB1bmRlZmluZWQ7XG5cblx0XHRsZXQgdG9wTGVmdE5vdzogVG9wTGVmdFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzaXplTm93OiBkb20uRGltZW5zaW9uIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBkZWx0YVRvcDogbnVtYmVyID0gMDtcblx0XHRsZXQgZGVsdGFMZWZ0OiBudW1iZXIgPSAwO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZXNpemFibGUub25EaWRXaWxsUmVzaXplKCgpID0+IHtcblx0XHRcdHRvcExlZnROb3cgPSB0aGlzLl90b3BMZWZ0O1xuXHRcdFx0c2l6ZU5vdyA9IHRoaXMuX3Jlc2l6YWJsZS5zaXplO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9yZXNpemFibGUub25EaWRSZXNpemUoZSA9PiB7XG5cdFx0XHRpZiAodG9wTGVmdE5vdyAmJiBzaXplTm93KSB7XG5cdFx0XHRcdHRoaXMud2lkZ2V0LmxheW91dChlLmRpbWVuc2lvbi53aWR0aCwgZS5kaW1lbnNpb24uaGVpZ2h0KTtcblxuXHRcdFx0XHRsZXQgdXBkYXRlVG9wTGVmdCA9IGZhbHNlO1xuXHRcdFx0XHRpZiAoZS53ZXN0KSB7XG5cdFx0XHRcdFx0ZGVsdGFMZWZ0ID0gc2l6ZU5vdy53aWR0aCAtIGUuZGltZW5zaW9uLndpZHRoO1xuXHRcdFx0XHRcdHVwZGF0ZVRvcExlZnQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLm5vcnRoKSB7XG5cdFx0XHRcdFx0ZGVsdGFUb3AgPSBzaXplTm93LmhlaWdodCAtIGUuZGltZW5zaW9uLmhlaWdodDtcblx0XHRcdFx0XHR1cGRhdGVUb3BMZWZ0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodXBkYXRlVG9wTGVmdCkge1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5VG9wTGVmdCh7XG5cdFx0XHRcdFx0XHR0b3A6IHRvcExlZnROb3cudG9wICsgZGVsdGFUb3AsXG5cdFx0XHRcdFx0XHRsZWZ0OiB0b3BMZWZ0Tm93LmxlZnQgKyBkZWx0YUxlZnQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChlLmRvbmUpIHtcblx0XHRcdFx0dG9wTGVmdE5vdyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c2l6ZU5vdyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0ZGVsdGFUb3AgPSAwO1xuXHRcdFx0XHRkZWx0YUxlZnQgPSAwO1xuXHRcdFx0XHR0aGlzLl91c2VyU2l6ZSA9IGUuZGltZW5zaW9uO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLndpZGdldC5vbkRpZENoYW5nZUNvbnRlbnRzKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9hbmNob3JCb3gpIHtcblx0XHRcdFx0dGhpcy5fcGxhY2VBdEFuY2hvcih0aGlzLl9hbmNob3JCb3gsIHRoaXMuX3VzZXJTaXplID8/IHRoaXMud2lkZ2V0LnNpemUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy53aWRnZXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmhpZGUoKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdzdWdnZXN0LmRldGFpbHMnO1xuXHR9XG5cblx0Z2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlO1xuXHR9XG5cblx0c2hvdygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2FkZGVkKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fcmVzaXphYmxlLmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5fYWRkZWQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdGhpZGUoc2Vzc2lvbkVuZGVkOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXNpemFibGUuY2xlYXJTYXNoSG92ZXJTdGF0ZSgpO1xuXG5cdFx0aWYgKHRoaXMuX2FkZGVkKSB7XG5cdFx0XHR0aGlzLl9jb250YWluZXIucmVtb3ZlQ2hpbGQodGhpcy5fcmVzaXphYmxlLmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5fYWRkZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2FuY2hvckJveCA9IHVuZGVmaW5lZDtcblx0XHRcdC8vIHRoaXMuX3RvcExlZnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChzZXNzaW9uRW5kZWQpIHtcblx0XHRcdHRoaXMuX3VzZXJTaXplID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy53aWRnZXQuY2xlYXJDb250ZW50cygpO1xuXHRcdH1cblx0fVxuXG5cdHBsYWNlQXRBbmNob3IoYW5jaG9yOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IGFuY2hvckJveCA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHR0aGlzLl9hbmNob3JCb3ggPSBhbmNob3JCb3g7XG5cdFx0dGhpcy53aWRnZXQubGF5b3V0KHRoaXMuX3Jlc2l6YWJsZS5zaXplLndpZHRoLCB0aGlzLl9yZXNpemFibGUuc2l6ZS5oZWlnaHQpO1xuXHRcdHRoaXMuX3BsYWNlQXRBbmNob3IodGhpcy5fYW5jaG9yQm94LCB0aGlzLl91c2VyU2l6ZSA/PyB0aGlzLndpZGdldC5zaXplKTtcblx0fVxuXG5cdF9wbGFjZUF0QW5jaG9yKGFuY2hvckJveDogZG9tLklEb21Ob2RlUGFnZVBvc2l0aW9uLCBzaXplOiBkb20uRGltZW5zaW9uKSB7XG5cdFx0Y29uc3QgYm9keUJveCA9IGRvbS5nZXRDbGllbnRBcmVhKHRoaXMuZ2V0RG9tTm9kZSgpLm93bmVyRG9jdW1lbnQuYm9keSk7XG5cblx0XHRjb25zdCBpbmZvID0gdGhpcy53aWRnZXQuZ2V0TGF5b3V0SW5mbygpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdE1pblNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbigyMjAsIDIgKiBpbmZvLmxpbmVIZWlnaHQpO1xuXHRcdGNvbnN0IGRlZmF1bHRUb3AgPSBhbmNob3JCb3gudG9wO1xuXG5cdFx0dHlwZSBQbGFjZW1lbnQgPSB7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXI7IGZpdDogbnVtYmVyOyBtYXhTaXplVG9wOiBkb20uRGltZW5zaW9uOyBtYXhTaXplQm90dG9tOiBkb20uRGltZW5zaW9uOyBtaW5TaXplOiBkb20uRGltZW5zaW9uIH07XG5cblx0XHQvLyBFQVNUXG5cdFx0Y29uc3QgZWFzdFBsYWNlbWVudDogUGxhY2VtZW50ID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHdpZHRoID0gYm9keUJveC53aWR0aCAtIChhbmNob3JCb3gubGVmdCArIGFuY2hvckJveC53aWR0aCArIGluZm8uYm9yZGVyV2lkdGggKyBpbmZvLmhvcml6b250YWxQYWRkaW5nKTtcblx0XHRcdGNvbnN0IGxlZnQgPSAtaW5mby5ib3JkZXJXaWR0aCArIGFuY2hvckJveC5sZWZ0ICsgYW5jaG9yQm94LndpZHRoO1xuXHRcdFx0Y29uc3QgbWF4U2l6ZVRvcCA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCBib2R5Qm94LmhlaWdodCAtIGFuY2hvckJveC50b3AgLSBpbmZvLmJvcmRlckhlaWdodCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdGNvbnN0IG1heFNpemVCb3R0b20gPSBtYXhTaXplVG9wLndpdGgodW5kZWZpbmVkLCBhbmNob3JCb3gudG9wICsgYW5jaG9yQm94LmhlaWdodCAtIGluZm8uYm9yZGVySGVpZ2h0IC0gaW5mby52ZXJ0aWNhbFBhZGRpbmcpO1xuXHRcdFx0cmV0dXJuIHsgdG9wOiBkZWZhdWx0VG9wLCBsZWZ0LCBmaXQ6IHdpZHRoIC0gc2l6ZS53aWR0aCwgbWF4U2l6ZVRvcCwgbWF4U2l6ZUJvdHRvbSwgbWluU2l6ZTogZGVmYXVsdE1pblNpemUud2l0aChNYXRoLm1pbih3aWR0aCwgZGVmYXVsdE1pblNpemUud2lkdGgpKSB9O1xuXHRcdH0pKCk7XG5cblx0XHQvLyBXRVNUXG5cdFx0Y29uc3Qgd2VzdFBsYWNlbWVudDogUGxhY2VtZW50ID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IHdpZHRoID0gYW5jaG9yQm94LmxlZnQgLSBpbmZvLmJvcmRlcldpZHRoIC0gaW5mby5ob3Jpem9udGFsUGFkZGluZztcblx0XHRcdGNvbnN0IGxlZnQgPSBNYXRoLm1heChpbmZvLmhvcml6b250YWxQYWRkaW5nLCBhbmNob3JCb3gubGVmdCAtIHNpemUud2lkdGggLSBpbmZvLmJvcmRlcldpZHRoKTtcblx0XHRcdGNvbnN0IG1heFNpemVUb3AgPSBuZXcgZG9tLkRpbWVuc2lvbih3aWR0aCwgYm9keUJveC5oZWlnaHQgLSBhbmNob3JCb3gudG9wIC0gaW5mby5ib3JkZXJIZWlnaHQgLSBpbmZvLnZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRjb25zdCBtYXhTaXplQm90dG9tID0gbWF4U2l6ZVRvcC53aXRoKHVuZGVmaW5lZCwgYW5jaG9yQm94LnRvcCArIGFuY2hvckJveC5oZWlnaHQgLSBpbmZvLmJvcmRlckhlaWdodCAtIGluZm8udmVydGljYWxQYWRkaW5nKTtcblx0XHRcdHJldHVybiB7IHRvcDogZGVmYXVsdFRvcCwgbGVmdCwgZml0OiB3aWR0aCAtIHNpemUud2lkdGgsIG1heFNpemVUb3AsIG1heFNpemVCb3R0b20sIG1pblNpemU6IGRlZmF1bHRNaW5TaXplLndpdGgoTWF0aC5taW4od2lkdGgsIGRlZmF1bHRNaW5TaXplLndpZHRoKSkgfTtcblx0XHR9KSgpO1xuXG5cdFx0Ly8gU09VVEhcblx0XHRjb25zdCBzb3V0aFBsYWNlbWVudDogUGxhY2VtZW50ID0gKGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGxlZnQgPSBhbmNob3JCb3gubGVmdDtcblx0XHRcdGNvbnN0IHRvcCA9IC1pbmZvLmJvcmRlcldpZHRoICsgYW5jaG9yQm94LnRvcCArIGFuY2hvckJveC5oZWlnaHQ7XG5cdFx0XHRjb25zdCBtYXhTaXplQm90dG9tID0gbmV3IGRvbS5EaW1lbnNpb24oYW5jaG9yQm94LndpZHRoIC0gaW5mby5ib3JkZXJIZWlnaHQsIGJvZHlCb3guaGVpZ2h0IC0gYW5jaG9yQm94LnRvcCAtIGFuY2hvckJveC5oZWlnaHQgLSBpbmZvLnZlcnRpY2FsUGFkZGluZyk7XG5cdFx0XHRyZXR1cm4geyB0b3AsIGxlZnQsIGZpdDogbWF4U2l6ZUJvdHRvbS5oZWlnaHQgLSBzaXplLmhlaWdodCwgbWF4U2l6ZUJvdHRvbSwgbWF4U2l6ZVRvcDogbWF4U2l6ZUJvdHRvbSwgbWluU2l6ZTogZGVmYXVsdE1pblNpemUud2l0aChtYXhTaXplQm90dG9tLndpZHRoKSB9O1xuXHRcdH0pKCk7XG5cblx0XHQvLyBOT1JUSFxuXHRcdGNvbnN0IG5vcnRoUGxhY2VtZW50OiBQbGFjZW1lbnQgPSAoZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSBNYXRoLm1heChhbmNob3JCb3gud2lkdGggLSBpbmZvLmJvcmRlckhlaWdodCwgMCk7XG5cdFx0XHRjb25zdCBsZWZ0ID0gYW5jaG9yQm94LmxlZnQ7XG5cdFx0XHRjb25zdCBtYXhIZWlnaHRBYm92ZSA9IE1hdGgubWF4KGFuY2hvckJveC50b3AgLSBpbmZvLnZlcnRpY2FsUGFkZGluZywgMCk7XG5cdFx0XHRjb25zdCBoZWlnaHRGb3JUb3AgPSBNYXRoLm1pbihzaXplLmhlaWdodCwgbWF4SGVpZ2h0QWJvdmUpO1xuXHRcdFx0Y29uc3QgdG9wID0gYW5jaG9yQm94LnRvcCAtIGluZm8uYm9yZGVyV2lkdGggLSBoZWlnaHRGb3JUb3A7XG5cdFx0XHRjb25zdCBtYXhTaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIE1hdGgubWF4KG1heEhlaWdodEFib3ZlLCAwKSk7XG5cdFx0XHRyZXR1cm4geyB0b3AsIGxlZnQsIGZpdDogbWF4U2l6ZS5oZWlnaHQgLSBzaXplLmhlaWdodCwgbWF4U2l6ZVRvcDogbWF4U2l6ZSwgbWF4U2l6ZUJvdHRvbTogbWF4U2l6ZSwgbWluU2l6ZTogZGVmYXVsdE1pblNpemUud2l0aChtYXhTaXplLndpZHRoKSB9O1xuXHRcdH0pKCk7XG5cblx0XHQvLyB0YWtlIGZpcnN0IHBsYWNlbWVudCB0aGF0IGZpdHMgb3IgdGhlIGZpcnN0IHdpdGggXCJsZWFzdCBiYWRcIiBmaXRcblx0XHRjb25zdCBwbGFjZW1lbnRFbnRyaWVzOiBbU2ltcGxlU3VnZ2VzdERldGFpbHNQbGFjZW1lbnQsIFBsYWNlbWVudF1bXSA9IFtcblx0XHRcdFtTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudC5FYXN0LCBlYXN0UGxhY2VtZW50XSxcblx0XHRcdFtTaW1wbGVTdWdnZXN0RGV0YWlsc1BsYWNlbWVudC5Tb3V0aCwgc291dGhQbGFjZW1lbnRdLFxuXHRcdFx0W1NpbXBsZVN1Z2dlc3REZXRhaWxzUGxhY2VtZW50Lk5vcnRoLCBub3J0aFBsYWNlbWVudF0sXG5cdFx0XHRbU2ltcGxlU3VnZ2VzdERldGFpbHNQbGFjZW1lbnQuV2VzdCwgd2VzdFBsYWNlbWVudF1cblx0XHRdO1xuXHRcdGNvbnN0IG9yaWVudGF0aW9ucyA9ICh0aGlzLl9wcmV2ZW50UGxhY2VtZW50c1xuXHRcdFx0PyBwbGFjZW1lbnRFbnRyaWVzLmZpbHRlcigoW2RpcmVjdGlvbl0pID0+ICF0aGlzLl9wcmV2ZW50UGxhY2VtZW50cyEuaGFzKGRpcmVjdGlvbikpXG5cdFx0XHQ6IHBsYWNlbWVudEVudHJpZXMpLm1hcCgoWywgZW50cnldKSA9PiBlbnRyeSk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IG9yaWVudGF0aW9ucy5sZW5ndGggPyBvcmllbnRhdGlvbnMgOiBwbGFjZW1lbnRFbnRyaWVzLm1hcCgoWywgZW50cnldKSA9PiBlbnRyeSk7XG5cdFx0Y29uc3QgcGxhY2VtZW50ID0gY2FuZGlkYXRlcy5maW5kKHAgPT4gcC5maXQgPj0gMClcblx0XHRcdD8/IGNhbmRpZGF0ZXMucmVkdWNlPFBsYWNlbWVudCB8IHVuZGVmaW5lZD4oKGJlc3QsIGN1cnJlbnQpID0+ICFiZXN0IHx8IGN1cnJlbnQuZml0ID4gYmVzdC5maXQgPyBjdXJyZW50IDogYmVzdCwgdW5kZWZpbmVkKVxuXHRcdFx0Pz8gZWFzdFBsYWNlbWVudDtcblxuXHRcdC8vIHRvcC9ib3R0b20gcGxhY2VtZW50XG5cdFx0Y29uc3QgYm90dG9tID0gYW5jaG9yQm94LnRvcCArIGFuY2hvckJveC5oZWlnaHQgLSBpbmZvLmJvcmRlckhlaWdodDtcblx0XHRsZXQgYWxpZ25BdFRvcDogYm9vbGVhbjtcblx0XHRsZXQgaGVpZ2h0ID0gc2l6ZS5oZWlnaHQ7XG5cdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5tYXgocGxhY2VtZW50Lm1heFNpemVUb3AuaGVpZ2h0LCBwbGFjZW1lbnQubWF4U2l6ZUJvdHRvbS5oZWlnaHQpO1xuXHRcdGlmIChoZWlnaHQgPiBtYXhIZWlnaHQpIHtcblx0XHRcdGhlaWdodCA9IG1heEhlaWdodDtcblx0XHR9XG5cdFx0bGV0IG1heFNpemU6IGRvbS5EaW1lbnNpb247XG5cdFx0Ly8gaWYgKHByZWZlckFsaWduQXRUb3ApIHtcblx0XHRpZiAoaGVpZ2h0IDw9IHBsYWNlbWVudC5tYXhTaXplVG9wLmhlaWdodCkge1xuXHRcdFx0YWxpZ25BdFRvcCA9IHRydWU7XG5cdFx0XHRtYXhTaXplID0gcGxhY2VtZW50Lm1heFNpemVUb3A7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFsaWduQXRUb3AgPSBmYWxzZTtcblx0XHRcdG1heFNpemUgPSBwbGFjZW1lbnQubWF4U2l6ZUJvdHRvbTtcblx0XHR9XG5cdFx0Ly8gfSBlbHNlIHtcblx0XHQvLyBcdGlmIChoZWlnaHQgPD0gcGxhY2VtZW50Lm1heFNpemVCb3R0b20uaGVpZ2h0KSB7XG5cdFx0Ly8gXHRcdGFsaWduQXRUb3AgPSBmYWxzZTtcblx0XHQvLyBcdFx0bWF4U2l6ZSA9IHBsYWNlbWVudC5tYXhTaXplQm90dG9tO1xuXHRcdC8vIFx0fSBlbHNlIHtcblx0XHQvLyBcdFx0YWxpZ25BdFRvcCA9IHRydWU7XG5cdFx0Ly8gXHRcdG1heFNpemUgPSBwbGFjZW1lbnQubWF4U2l6ZVRvcDtcblx0XHQvLyBcdH1cblx0XHQvLyB9XG5cblx0XHRsZXQgeyB0b3AsIGxlZnQgfSA9IHBsYWNlbWVudDtcblx0XHRpZiAoIWFsaWduQXRUb3AgJiYgaGVpZ2h0ID4gYW5jaG9yQm94LmhlaWdodCkge1xuXHRcdFx0dG9wID0gYm90dG9tIC0gaGVpZ2h0O1xuXHRcdH1cblx0XHRjb25zdCBlZGl0b3JEb21Ob2RlID0gdGhpcy5fY29udGFpbmVyO1xuXHRcdGlmIChlZGl0b3JEb21Ob2RlKSB7XG5cdFx0XHQvLyBnZXQgYm91bmRpbmcgcmVjdGFuZ2xlIG9mIHRoZSBzdWdnZXN0IHdpZGdldCByZWxhdGl2ZSB0byB0aGUgZWRpdG9yXG5cdFx0XHRjb25zdCBlZGl0b3JCb3VuZGluZ0JveCA9IGVkaXRvckRvbU5vZGUuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHR0b3AgLT0gZWRpdG9yQm91bmRpbmdCb3gudG9wO1xuXHRcdFx0bGVmdCAtPSBlZGl0b3JCb3VuZGluZ0JveC5sZWZ0O1xuXHRcdH1cblx0XHR0aGlzLl9hcHBseVRvcExlZnQoeyBsZWZ0LCB0b3AgfSk7XG5cblx0XHR0aGlzLl9yZXNpemFibGUuZW5hYmxlU2FzaGVzKCFhbGlnbkF0VG9wLCBwbGFjZW1lbnQgPT09IGVhc3RQbGFjZW1lbnQsIGFsaWduQXRUb3AsIHBsYWNlbWVudCAhPT0gZWFzdFBsYWNlbWVudCk7XG5cblx0XHR0aGlzLl9yZXNpemFibGUubWluU2l6ZSA9IHBsYWNlbWVudC5taW5TaXplO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5tYXhTaXplID0gbWF4U2l6ZTtcblx0XHR0aGlzLl9yZXNpemFibGUubGF5b3V0KGhlaWdodCwgTWF0aC5taW4obWF4U2l6ZS53aWR0aCwgc2l6ZS53aWR0aCkpO1xuXHRcdHRoaXMud2lkZ2V0LmxheW91dCh0aGlzLl9yZXNpemFibGUuc2l6ZS53aWR0aCwgdGhpcy5fcmVzaXphYmxlLnNpemUuaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5VG9wTGVmdCh0b3BMZWZ0OiB7IGxlZnQ6IG51bWJlcjsgdG9wOiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdHRoaXMuX3RvcExlZnQgPSB0b3BMZWZ0O1xuXHRcdC8vIHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZS5kb21Ob2RlLnN0eWxlLnRvcCA9IGAke3RvcExlZnQudG9wfXB4YDtcblx0XHR0aGlzLl9yZXNpemFibGUuZG9tTm9kZS5zdHlsZS5sZWZ0ID0gYCR7dG9wTGVmdC5sZWZ0fXB4YDtcblx0XHR0aGlzLl9yZXNpemFibGUuZG9tTm9kZS5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdH1cbn1cblxuaW50ZXJmYWNlIFRvcExlZnRQb3NpdGlvbiB7XG5cdHRvcDogbnVtYmVyO1xuXHRsZWZ0OiBudW1iZXI7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUNyQyxZQUFZLFNBQVM7QUFFckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFHL0IsU0FBUyx3QkFBd0IsTUFBaUQ7QUFDeEYsU0FBTyxDQUFDLENBQUMsUUFBUSxRQUFRLEtBQUssV0FBVyxpQkFBaUIsS0FBSyxXQUFXLFVBQVUsS0FBSyxXQUFXLFdBQVcsS0FBSyxXQUFXLEtBQUs7QUFDckk7QUFFTyxNQUFNLDBCQUEwQjtBQUVoQyxJQUFXLGdDQUFYLGtCQUFXQSxtQ0FBWDtBQUNOLEVBQUFBLDhEQUFBLFVBQU8sS0FBUDtB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
