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
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { HoverStartSource } from "./hoverOperation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ResizableContentWidget } from "./resizableContentWidget.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { getHoverAccessibleViewHint, HoverWidget } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { PositionAffinity } from "../../../common/model.js";
import { Emitter } from "../../../../base/common/event.js";
const HORIZONTAL_SCROLLING_BY = 30;
let ContentHoverWidget = class extends ResizableContentWidget {
  constructor(editor, contextKeyService, _configurationService, _accessibilityService, _keybindingService) {
    const minimumHeight = editor.getOption(EditorOption.lineHeight) + 8;
    const minimumWidth = 150;
    const minimumSize = new dom.Dimension(minimumWidth, minimumHeight);
    super(editor, minimumSize);
    this._configurationService = _configurationService;
    this._accessibilityService = _accessibilityService;
    this._keybindingService = _keybindingService;
    this._hover = this._register(new HoverWidget(true));
    this._onDidResize = this._register(new Emitter());
    this.onDidResize = this._onDidResize.event;
    this._onDidScroll = this._register(new Emitter());
    this.onDidScroll = this._onDidScroll.event;
    this._onContentsChanged = this._register(new Emitter());
    this.onContentsChanged = this._onContentsChanged.event;
    this._minimumSize = minimumSize;
    this._hoverVisibleKey = EditorContextKeys.hoverVisible.bindTo(contextKeyService);
    this._hoverFocusedKey = EditorContextKeys.hoverFocused.bindTo(contextKeyService);
    dom.append(this._resizableNode.domNode, this._hover.containerDomNode);
    this._resizableNode.domNode.style.zIndex = "50";
    this._resizableNode.domNode.className = "monaco-resizable-hover";
    this._register(this._editor.onDidLayoutChange(() => {
      if (this.isVisible) {
        this._updateMaxDimensions();
      }
    }));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.fontInfo)) {
        this._updateFont();
      }
    }));
    const focusTracker = this._register(dom.trackFocus(this._resizableNode.domNode));
    this._register(focusTracker.onDidFocus(() => {
      this._hoverFocusedKey.set(true);
    }));
    this._register(focusTracker.onDidBlur(() => {
      this._hoverFocusedKey.set(false);
    }));
    this._register(this._hover.scrollbar.onScroll((e) => {
      this._onDidScroll.fire(e);
    }));
    this._setRenderedHover(void 0);
    this._editor.addContentWidget(this);
  }
  get isVisibleFromKeyboard() {
    return this._renderedHover?.source === HoverStartSource.Keyboard;
  }
  get isVisible() {
    return this._hoverVisibleKey.get() ?? false;
  }
  get isFocused() {
    return this._hoverFocusedKey.get() ?? false;
  }
  dispose() {
    super.dispose();
    this._renderedHover?.dispose();
    this._editor.removeContentWidget(this);
  }
  getId() {
    return ContentHoverWidget.ID;
  }
  static _applyDimensions(container, width, height) {
    const transformedWidth = typeof width === "number" ? `${width}px` : width;
    const transformedHeight = typeof height === "number" ? `${height}px` : height;
    container.style.width = transformedWidth;
    container.style.height = transformedHeight;
  }
  _setContentsDomNodeDimensions(width, height) {
    const contentsDomNode = this._hover.contentsDomNode;
    return ContentHoverWidget._applyDimensions(contentsDomNode, width, height);
  }
  _setContainerDomNodeDimensions(width, height) {
    const containerDomNode = this._hover.containerDomNode;
    return ContentHoverWidget._applyDimensions(containerDomNode, width, height);
  }
  _setScrollableElementDimensions(width, height) {
    const scrollbarDomElement = this._hover.scrollbar.getDomNode();
    return ContentHoverWidget._applyDimensions(scrollbarDomElement, width, height);
  }
  _setHoverWidgetDimensions(width, height) {
    this._setContainerDomNodeDimensions(width, height);
    this._setScrollableElementDimensions(width, height);
    this._setContentsDomNodeDimensions(width, height);
    this._layoutContentWidget();
  }
  static _applyMaxDimensions(container, width, height) {
    const transformedWidth = typeof width === "number" ? `${width}px` : width;
    const transformedHeight = typeof height === "number" ? `${height}px` : height;
    container.style.maxWidth = transformedWidth;
    container.style.maxHeight = transformedHeight;
  }
  _setHoverWidgetMaxDimensions(width, height) {
    ContentHoverWidget._applyMaxDimensions(this._hover.contentsDomNode, width, height);
    ContentHoverWidget._applyMaxDimensions(this._hover.scrollbar.getDomNode(), width, height);
    ContentHoverWidget._applyMaxDimensions(this._hover.containerDomNode, width, height);
    this._hover.containerDomNode.style.setProperty("--vscode-hover-maxWidth", typeof width === "number" ? `${width}px` : width);
    this._layoutContentWidget();
  }
  _setAdjustedHoverWidgetDimensions(size) {
    this._setHoverWidgetMaxDimensions("none", "none");
    this._setHoverWidgetDimensions(size.width, size.height);
  }
  _updateResizableNodeMaxDimensions() {
    const maxRenderingWidth = this._findMaximumRenderingWidth() ?? Infinity;
    const maxRenderingHeight = this._findMaximumRenderingHeight() ?? Infinity;
    this._resizableNode.maxSize = new dom.Dimension(maxRenderingWidth, maxRenderingHeight);
    this._setHoverWidgetMaxDimensions(maxRenderingWidth, maxRenderingHeight);
  }
  _resize(size) {
    ContentHoverWidget._lastDimensions = new dom.Dimension(size.width, size.height);
    this._setAdjustedHoverWidgetDimensions(size);
    this._resizableNode.layout(size.height, size.width);
    this._updateResizableNodeMaxDimensions();
    this._hover.scrollbar.scanDomNode();
    this._editor.layoutContentWidget(this);
    this._onDidResize.fire();
  }
  _findAvailableSpaceVertically() {
    const position = this._renderedHover?.showAtPosition;
    if (!position) {
      return;
    }
    return this._positionPreference === ContentWidgetPositionPreference.ABOVE ? this._availableVerticalSpaceAbove(position) : this._availableVerticalSpaceBelow(position);
  }
  _findMaximumRenderingHeight() {
    const availableSpace = this._findAvailableSpaceVertically();
    if (!availableSpace) {
      return;
    }
    const children = this._hover.contentsDomNode.children;
    let maximumHeight = children.length - 1;
    Array.from(this._hover.contentsDomNode.children).forEach((hoverPart) => {
      maximumHeight += hoverPart.clientHeight;
    });
    return Math.min(availableSpace, maximumHeight);
  }
  _isHoverTextOverflowing() {
    this._hover.containerDomNode.style.setProperty("--vscode-hover-whiteSpace", "nowrap");
    this._hover.containerDomNode.style.setProperty("--vscode-hover-sourceWhiteSpace", "nowrap");
    const overflowing = Array.from(this._hover.contentsDomNode.children).some((hoverElement) => {
      return hoverElement.scrollWidth > hoverElement.clientWidth;
    });
    this._hover.containerDomNode.style.removeProperty("--vscode-hover-whiteSpace");
    this._hover.containerDomNode.style.removeProperty("--vscode-hover-sourceWhiteSpace");
    return overflowing;
  }
  _findMaximumRenderingWidth() {
    if (!this._editor || !this._editor.hasModel()) {
      return;
    }
    const overflowing = this._isHoverTextOverflowing();
    const initialWidth = typeof this._contentWidth === "undefined" ? 0 : this._contentWidth;
    if (overflowing || this._hover.containerDomNode.clientWidth < initialWidth) {
      const bodyBoxWidth = dom.getClientArea(this._hover.containerDomNode.ownerDocument.body).width;
      const horizontalPadding = 14;
      return bodyBoxWidth - horizontalPadding;
    } else {
      return this._hover.containerDomNode.clientWidth;
    }
  }
  isMouseGettingCloser(posx, posy) {
    if (!this._renderedHover) {
      return false;
    }
    if (this._renderedHover.initialMousePosX === void 0 || this._renderedHover.initialMousePosY === void 0) {
      this._renderedHover.initialMousePosX = posx;
      this._renderedHover.initialMousePosY = posy;
      return false;
    }
    const widgetRect = dom.getDomNodePagePosition(this.getDomNode());
    if (this._renderedHover.closestMouseDistance === void 0) {
      this._renderedHover.closestMouseDistance = computeDistanceFromPointToRectangle(
        this._renderedHover.initialMousePosX,
        this._renderedHover.initialMousePosY,
        widgetRect.left,
        widgetRect.top,
        widgetRect.width,
        widgetRect.height
      );
    }
    const distance = computeDistanceFromPointToRectangle(
      posx,
      posy,
      widgetRect.left,
      widgetRect.top,
      widgetRect.width,
      widgetRect.height
    );
    if (distance > this._renderedHover.closestMouseDistance + 4) {
      return false;
    }
    this._renderedHover.closestMouseDistance = Math.min(this._renderedHover.closestMouseDistance, distance);
    return true;
  }
  _setRenderedHover(renderedHover) {
    this._renderedHover?.dispose();
    this._renderedHover = renderedHover;
    this._hoverVisibleKey.set(!!renderedHover);
    this._hover.containerDomNode.classList.toggle("hidden", !renderedHover);
  }
  _updateFont() {
    const { fontSize, lineHeight } = this._editor.getOption(EditorOption.fontInfo);
    const contentsDomNode = this._hover.contentsDomNode;
    contentsDomNode.style.fontSize = `${fontSize}px`;
    contentsDomNode.style.lineHeight = `${lineHeight / fontSize}`;
    const codeClasses = Array.prototype.slice.call(this._hover.contentsDomNode.getElementsByClassName("code"));
    codeClasses.forEach((node) => this._editor.applyFontInfo(node));
  }
  _updateContent(node) {
    const contentsDomNode = this._hover.contentsDomNode;
    contentsDomNode.style.paddingBottom = "";
    contentsDomNode.textContent = "";
    contentsDomNode.appendChild(node);
  }
  _layoutContentWidget() {
    this._editor.layoutContentWidget(this);
    this._hover.onContentsChanged();
  }
  _updateMaxDimensions() {
    const height = Math.max(this._editor.getLayoutInfo().height / 4, 250, ContentHoverWidget._lastDimensions.height);
    const width = Math.max(this._editor.getLayoutInfo().width * 0.66, 750, ContentHoverWidget._lastDimensions.width);
    this._resizableNode.maxSize = new dom.Dimension(width, height);
    this._setHoverWidgetMaxDimensions(width, height);
  }
  _render(renderedHover) {
    this._setRenderedHover(renderedHover);
    this._updateFont();
    this._updateContent(renderedHover.domNode);
    this.handleContentsChanged();
    this._editor.render();
  }
  getPosition() {
    if (!this._renderedHover) {
      return null;
    }
    return {
      position: this._renderedHover.showAtPosition,
      secondaryPosition: this._renderedHover.showAtSecondaryPosition,
      positionAffinity: this._renderedHover.shouldAppearBeforeContent ? PositionAffinity.LeftOfInjectedText : void 0,
      preference: [this._positionPreference ?? ContentWidgetPositionPreference.ABOVE]
    };
  }
  show(renderedHover) {
    if (!this._editor || !this._editor.hasModel()) {
      return;
    }
    this._render(renderedHover);
    const widgetHeight = dom.getTotalHeight(this._hover.containerDomNode);
    const widgetPosition = renderedHover.showAtPosition;
    this._positionPreference = this._findPositionPreference(widgetHeight, widgetPosition) ?? ContentWidgetPositionPreference.ABOVE;
    this.handleContentsChanged();
    if (renderedHover.shouldFocus) {
      this._hover.containerDomNode.focus();
    }
    this._onDidResize.fire();
    const hoverFocused = this._hover.containerDomNode.ownerDocument.activeElement === this._hover.containerDomNode;
    const accessibleViewHint = hoverFocused && getHoverAccessibleViewHint(
      this._configurationService.getValue("accessibility.verbosity.hover") === true && this._accessibilityService.isScreenReaderOptimized(),
      this._keybindingService.lookupKeybinding("editor.action.accessibleView")?.getAriaLabel() ?? ""
    );
    if (accessibleViewHint) {
      this._hover.contentsDomNode.ariaLabel = this._hover.contentsDomNode.textContent + ", " + accessibleViewHint;
    }
  }
  hide() {
    if (!this._renderedHover) {
      return;
    }
    const hoverStoleFocus = this._renderedHover.shouldFocus || this._hoverFocusedKey.get();
    this._setRenderedHover(void 0);
    this._resizableNode.maxSize = new dom.Dimension(Infinity, Infinity);
    this._resizableNode.clearSashHoverState();
    this._hoverFocusedKey.set(false);
    this._editor.layoutContentWidget(this);
    if (hoverStoleFocus) {
      this._editor.focus();
    }
  }
  _removeConstraintsRenderNormally() {
    const layoutInfo = this._editor.getLayoutInfo();
    this._resizableNode.layout(layoutInfo.height, layoutInfo.width);
    this._setHoverWidgetDimensions("auto", "auto");
    this._updateMaxDimensions();
  }
  setMinimumDimensions(dimensions) {
    this._minimumSize = new dom.Dimension(
      Math.max(this._minimumSize.width, dimensions.width),
      Math.max(this._minimumSize.height, dimensions.height)
    );
    this._updateMinimumWidth();
  }
  _updateMinimumWidth() {
    const width = typeof this._contentWidth === "undefined" ? this._minimumSize.width : Math.min(this._contentWidth, this._minimumSize.width);
    this._resizableNode.minSize = new dom.Dimension(width, this._minimumSize.height);
  }
  handleContentsChanged() {
    this._removeConstraintsRenderNormally();
    const contentsDomNode = this._hover.contentsDomNode;
    let height = dom.getTotalHeight(contentsDomNode);
    let width = dom.getTotalWidth(contentsDomNode) + 2;
    this._resizableNode.layout(height, width);
    this._setHoverWidgetDimensions(width, height);
    height = dom.getTotalHeight(contentsDomNode);
    width = dom.getTotalWidth(contentsDomNode);
    this._contentWidth = width;
    this._updateMinimumWidth();
    this._resizableNode.layout(height, width);
    if (this._renderedHover?.showAtPosition) {
      const widgetHeight = dom.getTotalHeight(this._hover.containerDomNode);
      this._positionPreference = this._findPositionPreference(widgetHeight, this._renderedHover.showAtPosition);
    }
    this._layoutContentWidget();
    this._onContentsChanged.fire();
  }
  focus() {
    this._hover.containerDomNode.focus();
  }
  scrollUp() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - fontInfo.lineHeight });
  }
  scrollDown() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const fontInfo = this._editor.getOption(EditorOption.fontInfo);
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + fontInfo.lineHeight });
  }
  scrollLeft() {
    const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
    this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft - HORIZONTAL_SCROLLING_BY });
  }
  scrollRight() {
    const scrollLeft = this._hover.scrollbar.getScrollPosition().scrollLeft;
    this._hover.scrollbar.setScrollPosition({ scrollLeft: scrollLeft + HORIZONTAL_SCROLLING_BY });
  }
  pageUp() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop - scrollHeight });
  }
  pageDown() {
    const scrollTop = this._hover.scrollbar.getScrollPosition().scrollTop;
    const scrollHeight = this._hover.scrollbar.getScrollDimensions().height;
    this._hover.scrollbar.setScrollPosition({ scrollTop: scrollTop + scrollHeight });
  }
  goToTop() {
    this._hover.scrollbar.setScrollPosition({ scrollTop: 0 });
  }
  goToBottom() {
    this._hover.scrollbar.setScrollPosition({ scrollTop: this._hover.scrollbar.getScrollDimensions().scrollHeight });
  }
};
ContentHoverWidget.ID = "editor.contrib.resizableContentHoverWidget";
ContentHoverWidget._lastDimensions = new dom.Dimension(0, 0);
ContentHoverWidget = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IAccessibilityService),
  __decorateParam(4, IKeybindingService)
], ContentHoverWidget);
function computeDistanceFromPointToRectangle(pointX, pointY, left, top, width, height) {
  const x = left + width / 2;
  const y = top + height / 2;
  const dx = Math.max(Math.abs(pointX - x) - width / 2, 0);
  const dy = Math.max(Math.abs(pointY - y) - height / 2, 0);
  return Math.sqrt(dx * dx + dy * dy);
}
export {
  ContentHoverWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvY29udGVudEhvdmVyV2lkZ2V0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSwgSUNvZGVFZGl0b3IsIElDb250ZW50V2lkZ2V0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IEhvdmVyU3RhcnRTb3VyY2UgfSBmcm9tICcuL2hvdmVyT3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVzaXphYmxlQ29udGVudFdpZGdldCB9IGZyb20gJy4vcmVzaXphYmxlQ29udGVudFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgZ2V0SG92ZXJBY2Nlc3NpYmxlVmlld0hpbnQsIEhvdmVyV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uQWZmaW5pdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFJlbmRlcmVkQ29udGVudEhvdmVyIH0gZnJvbSAnLi9jb250ZW50SG92ZXJSZW5kZXJlZC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuXG5jb25zdCBIT1JJWk9OVEFMX1NDUk9MTElOR19CWSA9IDMwO1xuXG5leHBvcnQgY2xhc3MgQ29udGVudEhvdmVyV2lkZ2V0IGV4dGVuZHMgUmVzaXphYmxlQ29udGVudFdpZGdldCB7XG5cblx0cHVibGljIHN0YXRpYyBJRCA9ICdlZGl0b3IuY29udHJpYi5yZXNpemFibGVDb250ZW50SG92ZXJXaWRnZXQnO1xuXHRwcml2YXRlIHN0YXRpYyBfbGFzdERpbWVuc2lvbnM6IGRvbS5EaW1lbnNpb24gPSBuZXcgZG9tLkRpbWVuc2lvbigwLCAwKTtcblxuXHRwcml2YXRlIF9yZW5kZXJlZEhvdmVyOiBSZW5kZXJlZENvbnRlbnRIb3ZlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcG9zaXRpb25QcmVmZXJlbmNlOiBDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9taW5pbXVtU2l6ZTogZG9tLkRpbWVuc2lvbjtcblx0cHJpdmF0ZSBfY29udGVudFdpZHRoOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXI6IEhvdmVyV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEhvdmVyV2lkZ2V0KHRydWUpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJWaXNpYmxlS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJGb2N1c2VkS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlc2l6ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRSZXNpemUgPSB0aGlzLl9vbkRpZFJlc2l6ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNjcm9sbEV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkU2Nyb2xsID0gdGhpcy5fb25EaWRTY3JvbGwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Db250ZW50c0NoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQ29udGVudHNDaGFuZ2VkID0gdGhpcy5fb25Db250ZW50c0NoYW5nZWQuZXZlbnQ7XG5cblx0cHVibGljIGdldCBpc1Zpc2libGVGcm9tS2V5Ym9hcmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICh0aGlzLl9yZW5kZXJlZEhvdmVyPy5zb3VyY2UgPT09IEhvdmVyU3RhcnRTb3VyY2UuS2V5Ym9hcmQpO1xuXHR9XG5cblx0cHVibGljIGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvdmVyVmlzaWJsZUtleS5nZXQoKSA/PyBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9ob3ZlckZvY3VzZWRLZXkuZ2V0KCkgPz8gZmFsc2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBtaW5pbXVtSGVpZ2h0ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgKyA4O1xuXHRcdGNvbnN0IG1pbmltdW1XaWR0aCA9IDE1MDtcblx0XHRjb25zdCBtaW5pbXVtU2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKG1pbmltdW1XaWR0aCwgbWluaW11bUhlaWdodCk7XG5cdFx0c3VwZXIoZWRpdG9yLCBtaW5pbXVtU2l6ZSk7XG5cblx0XHR0aGlzLl9taW5pbXVtU2l6ZSA9IG1pbmltdW1TaXplO1xuXHRcdHRoaXMuX2hvdmVyVmlzaWJsZUtleSA9IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyVmlzaWJsZS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2hvdmVyRm9jdXNlZEtleSA9IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0ZG9tLmFwcGVuZCh0aGlzLl9yZXNpemFibGVOb2RlLmRvbU5vZGUsIHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUuZG9tTm9kZS5zdHlsZS56SW5kZXggPSAnNTAnO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUuZG9tTm9kZS5jbGFzc05hbWUgPSAnbW9uYWNvLXJlc2l6YWJsZS1ob3Zlcic7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRMYXlvdXRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuaXNWaXNpYmxlKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZU1heERpbWVuc2lvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZTogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uZm9udEluZm8pKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUZvbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIoZG9tLnRyYWNrRm9jdXModGhpcy5fcmVzaXphYmxlTm9kZS5kb21Ob2RlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5faG92ZXJGb2N1c2VkS2V5LnNldCh0cnVlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLl9ob3ZlckZvY3VzZWRLZXkuc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faG92ZXIuc2Nyb2xsYmFyLm9uU2Nyb2xsKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZFNjcm9sbC5maXJlKGUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zZXRSZW5kZXJlZEhvdmVyKHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fZWRpdG9yLmFkZENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcmVuZGVyZWRIb3Zlcj8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VkaXRvci5yZW1vdmVDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIENvbnRlbnRIb3ZlcldpZGdldC5JRDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9hcHBseURpbWVuc2lvbnMoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgd2lkdGg6IG51bWJlciB8IHN0cmluZywgaGVpZ2h0OiBudW1iZXIgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFuc2Zvcm1lZFdpZHRoID0gdHlwZW9mIHdpZHRoID09PSAnbnVtYmVyJyA/IGAke3dpZHRofXB4YCA6IHdpZHRoO1xuXHRcdGNvbnN0IHRyYW5zZm9ybWVkSGVpZ2h0ID0gdHlwZW9mIGhlaWdodCA9PT0gJ251bWJlcicgPyBgJHtoZWlnaHR9cHhgIDogaGVpZ2h0O1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IHRyYW5zZm9ybWVkV2lkdGg7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9IHRyYW5zZm9ybWVkSGVpZ2h0O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q29udGVudHNEb21Ob2RlRGltZW5zaW9ucyh3aWR0aDogbnVtYmVyIHwgc3RyaW5nLCBoZWlnaHQ6IG51bWJlciB8IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRlbnRzRG9tTm9kZSA9IHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZTtcblx0XHRyZXR1cm4gQ29udGVudEhvdmVyV2lkZ2V0Ll9hcHBseURpbWVuc2lvbnMoY29udGVudHNEb21Ob2RlLCB3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldENvbnRhaW5lckRvbU5vZGVEaW1lbnNpb25zKHdpZHRoOiBudW1iZXIgfCBzdHJpbmcsIGhlaWdodDogbnVtYmVyIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGFpbmVyRG9tTm9kZSA9IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGU7XG5cdFx0cmV0dXJuIENvbnRlbnRIb3ZlcldpZGdldC5fYXBwbHlEaW1lbnNpb25zKGNvbnRhaW5lckRvbU5vZGUsIHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0U2Nyb2xsYWJsZUVsZW1lbnREaW1lbnNpb25zKHdpZHRoOiBudW1iZXIgfCBzdHJpbmcsIGhlaWdodDogbnVtYmVyIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsYmFyRG9tRWxlbWVudCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXREb21Ob2RlKCk7XG5cdFx0cmV0dXJuIENvbnRlbnRIb3ZlcldpZGdldC5fYXBwbHlEaW1lbnNpb25zKHNjcm9sbGJhckRvbUVsZW1lbnQsIHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SG92ZXJXaWRnZXREaW1lbnNpb25zKHdpZHRoOiBudW1iZXIgfCBzdHJpbmcsIGhlaWdodDogbnVtYmVyIHwgc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0Q29udGFpbmVyRG9tTm9kZURpbWVuc2lvbnMod2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5fc2V0U2Nyb2xsYWJsZUVsZW1lbnREaW1lbnNpb25zKHdpZHRoLCBoZWlnaHQpO1xuXHRcdHRoaXMuX3NldENvbnRlbnRzRG9tTm9kZURpbWVuc2lvbnMod2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5fbGF5b3V0Q29udGVudFdpZGdldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2FwcGx5TWF4RGltZW5zaW9ucyhjb250YWluZXI6IEhUTUxFbGVtZW50LCB3aWR0aDogbnVtYmVyIHwgc3RyaW5nLCBoZWlnaHQ6IG51bWJlciB8IHN0cmluZykge1xuXHRcdGNvbnN0IHRyYW5zZm9ybWVkV2lkdGggPSB0eXBlb2Ygd2lkdGggPT09ICdudW1iZXInID8gYCR7d2lkdGh9cHhgIDogd2lkdGg7XG5cdFx0Y29uc3QgdHJhbnNmb3JtZWRIZWlnaHQgPSB0eXBlb2YgaGVpZ2h0ID09PSAnbnVtYmVyJyA/IGAke2hlaWdodH1weGAgOiBoZWlnaHQ7XG5cdFx0Y29udGFpbmVyLnN0eWxlLm1heFdpZHRoID0gdHJhbnNmb3JtZWRXaWR0aDtcblx0XHRjb250YWluZXIuc3R5bGUubWF4SGVpZ2h0ID0gdHJhbnNmb3JtZWRIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRIb3ZlcldpZGdldE1heERpbWVuc2lvbnMod2lkdGg6IG51bWJlciB8IHN0cmluZywgaGVpZ2h0OiBudW1iZXIgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHRDb250ZW50SG92ZXJXaWRnZXQuX2FwcGx5TWF4RGltZW5zaW9ucyh0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUsIHdpZHRoLCBoZWlnaHQpO1xuXHRcdENvbnRlbnRIb3ZlcldpZGdldC5fYXBwbHlNYXhEaW1lbnNpb25zKHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXREb21Ob2RlKCksIHdpZHRoLCBoZWlnaHQpO1xuXHRcdENvbnRlbnRIb3ZlcldpZGdldC5fYXBwbHlNYXhEaW1lbnNpb25zKHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUsIHdpZHRoLCBoZWlnaHQpO1xuXHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWhvdmVyLW1heFdpZHRoJywgdHlwZW9mIHdpZHRoID09PSAnbnVtYmVyJyA/IGAke3dpZHRofXB4YCA6IHdpZHRoKTtcblx0XHR0aGlzLl9sYXlvdXRDb250ZW50V2lkZ2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRBZGp1c3RlZEhvdmVyV2lkZ2V0RGltZW5zaW9ucyhzaXplOiBkb20uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2V0SG92ZXJXaWRnZXRNYXhEaW1lbnNpb25zKCdub25lJywgJ25vbmUnKTtcblx0XHR0aGlzLl9zZXRIb3ZlcldpZGdldERpbWVuc2lvbnMoc2l6ZS53aWR0aCwgc2l6ZS5oZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUmVzaXphYmxlTm9kZU1heERpbWVuc2lvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgbWF4UmVuZGVyaW5nV2lkdGggPSB0aGlzLl9maW5kTWF4aW11bVJlbmRlcmluZ1dpZHRoKCkgPz8gSW5maW5pdHk7XG5cdFx0Y29uc3QgbWF4UmVuZGVyaW5nSGVpZ2h0ID0gdGhpcy5fZmluZE1heGltdW1SZW5kZXJpbmdIZWlnaHQoKSA/PyBJbmZpbml0eTtcblx0XHR0aGlzLl9yZXNpemFibGVOb2RlLm1heFNpemUgPSBuZXcgZG9tLkRpbWVuc2lvbihtYXhSZW5kZXJpbmdXaWR0aCwgbWF4UmVuZGVyaW5nSGVpZ2h0KTtcblx0XHR0aGlzLl9zZXRIb3ZlcldpZGdldE1heERpbWVuc2lvbnMobWF4UmVuZGVyaW5nV2lkdGgsIG1heFJlbmRlcmluZ0hlaWdodCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3Jlc2l6ZShzaXplOiBkb20uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0Q29udGVudEhvdmVyV2lkZ2V0Ll9sYXN0RGltZW5zaW9ucyA9IG5ldyBkb20uRGltZW5zaW9uKHNpemUud2lkdGgsIHNpemUuaGVpZ2h0KTtcblx0XHR0aGlzLl9zZXRBZGp1c3RlZEhvdmVyV2lkZ2V0RGltZW5zaW9ucyhzaXplKTtcblx0XHR0aGlzLl9yZXNpemFibGVOb2RlLmxheW91dChzaXplLmhlaWdodCwgc2l6ZS53aWR0aCk7XG5cdFx0dGhpcy5fdXBkYXRlUmVzaXphYmxlTm9kZU1heERpbWVuc2lvbnMoKTtcblx0XHR0aGlzLl9ob3Zlci5zY3JvbGxiYXIuc2NhbkRvbU5vZGUoKTtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLl9vbkRpZFJlc2l6ZS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kQXZhaWxhYmxlU3BhY2VWZXJ0aWNhbGx5KCk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSB0aGlzLl9yZW5kZXJlZEhvdmVyPy5zaG93QXRQb3NpdGlvbjtcblx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9wb3NpdGlvblByZWZlcmVuY2UgPT09IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkUgP1xuXHRcdFx0dGhpcy5fYXZhaWxhYmxlVmVydGljYWxTcGFjZUFib3ZlKHBvc2l0aW9uKVxuXHRcdFx0OiB0aGlzLl9hdmFpbGFibGVWZXJ0aWNhbFNwYWNlQmVsb3cocG9zaXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZE1heGltdW1SZW5kZXJpbmdIZWlnaHQoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdmFpbGFibGVTcGFjZSA9IHRoaXMuX2ZpbmRBdmFpbGFibGVTcGFjZVZlcnRpY2FsbHkoKTtcblx0XHRpZiAoIWF2YWlsYWJsZVNwYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoaWxkcmVuID0gdGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlLmNoaWxkcmVuO1xuXHRcdGxldCBtYXhpbXVtSGVpZ2h0ID0gY2hpbGRyZW4ubGVuZ3RoIC0gMTtcblx0XHRBcnJheS5mcm9tKHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZS5jaGlsZHJlbikuZm9yRWFjaCgoaG92ZXJQYXJ0KSA9PiB7XG5cdFx0XHRtYXhpbXVtSGVpZ2h0ICs9IGhvdmVyUGFydC5jbGllbnRIZWlnaHQ7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIE1hdGgubWluKGF2YWlsYWJsZVNwYWNlLCBtYXhpbXVtSGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSG92ZXJUZXh0T3ZlcmZsb3dpbmcoKTogYm9vbGVhbiB7XG5cdFx0Ly8gVG8gZmluZCBvdXQgaWYgdGhlIHRleHQgaXMgb3ZlcmZsb3dpbmcsIHdlIHdpbGwgZGlzYWJsZSB3cmFwcGluZywgY2hlY2sgdGhlIHdpZHRocywgYW5kIHRoZW4gcmUtZW5hYmxlIHdyYXBwaW5nXG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtaG92ZXItd2hpdGVTcGFjZScsICdub3dyYXAnKTtcblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLnN0eWxlLnNldFByb3BlcnR5KCctLXZzY29kZS1ob3Zlci1zb3VyY2VXaGl0ZVNwYWNlJywgJ25vd3JhcCcpO1xuXG5cdFx0Y29uc3Qgb3ZlcmZsb3dpbmcgPSBBcnJheS5mcm9tKHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZS5jaGlsZHJlbikuc29tZSgoaG92ZXJFbGVtZW50KSA9PiB7XG5cdFx0XHRyZXR1cm4gaG92ZXJFbGVtZW50LnNjcm9sbFdpZHRoID4gaG92ZXJFbGVtZW50LmNsaWVudFdpZHRoO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS12c2NvZGUtaG92ZXItd2hpdGVTcGFjZScpO1xuXHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdnNjb2RlLWhvdmVyLXNvdXJjZVdoaXRlU3BhY2UnKTtcblxuXHRcdHJldHVybiBvdmVyZmxvd2luZztcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRNYXhpbXVtUmVuZGVyaW5nV2lkdGgoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvciB8fCAhdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBvdmVyZmxvd2luZyA9IHRoaXMuX2lzSG92ZXJUZXh0T3ZlcmZsb3dpbmcoKTtcblx0XHRjb25zdCBpbml0aWFsV2lkdGggPSAoXG5cdFx0XHR0eXBlb2YgdGhpcy5fY29udGVudFdpZHRoID09PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHQ/IDBcblx0XHRcdFx0OiB0aGlzLl9jb250ZW50V2lkdGhcblx0XHQpO1xuXG5cdFx0aWYgKG92ZXJmbG93aW5nIHx8IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggPCBpbml0aWFsV2lkdGgpIHtcblx0XHRcdGNvbnN0IGJvZHlCb3hXaWR0aCA9IGRvbS5nZXRDbGllbnRBcmVhKHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUub3duZXJEb2N1bWVudC5ib2R5KS53aWR0aDtcblx0XHRcdGNvbnN0IGhvcml6b250YWxQYWRkaW5nID0gMTQ7XG5cdFx0XHRyZXR1cm4gYm9keUJveFdpZHRoIC0gaG9yaXpvbnRhbFBhZGRpbmc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsaWVudFdpZHRoO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBpc01vdXNlR2V0dGluZ0Nsb3Nlcihwb3N4OiBudW1iZXIsIHBvc3k6IG51bWJlcik6IGJvb2xlYW4ge1xuXG5cdFx0aWYgKCF0aGlzLl9yZW5kZXJlZEhvdmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9yZW5kZXJlZEhvdmVyLmluaXRpYWxNb3VzZVBvc1ggPT09IHVuZGVmaW5lZCB8fCB0aGlzLl9yZW5kZXJlZEhvdmVyLmluaXRpYWxNb3VzZVBvc1kgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcmVuZGVyZWRIb3Zlci5pbml0aWFsTW91c2VQb3NYID0gcG9zeDtcblx0XHRcdHRoaXMuX3JlbmRlcmVkSG92ZXIuaW5pdGlhbE1vdXNlUG9zWSA9IHBvc3k7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0UmVjdCA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuZ2V0RG9tTm9kZSgpKTtcblx0XHRpZiAodGhpcy5fcmVuZGVyZWRIb3Zlci5jbG9zZXN0TW91c2VEaXN0YW5jZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyLmNsb3Nlc3RNb3VzZURpc3RhbmNlID0gY29tcHV0ZURpc3RhbmNlRnJvbVBvaW50VG9SZWN0YW5nbGUoXG5cdFx0XHRcdHRoaXMuX3JlbmRlcmVkSG92ZXIuaW5pdGlhbE1vdXNlUG9zWCxcblx0XHRcdFx0dGhpcy5fcmVuZGVyZWRIb3Zlci5pbml0aWFsTW91c2VQb3NZLFxuXHRcdFx0XHR3aWRnZXRSZWN0LmxlZnQsXG5cdFx0XHRcdHdpZGdldFJlY3QudG9wLFxuXHRcdFx0XHR3aWRnZXRSZWN0LndpZHRoLFxuXHRcdFx0XHR3aWRnZXRSZWN0LmhlaWdodFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRjb25zdCBkaXN0YW5jZSA9IGNvbXB1dGVEaXN0YW5jZUZyb21Qb2ludFRvUmVjdGFuZ2xlKFxuXHRcdFx0cG9zeCxcblx0XHRcdHBvc3ksXG5cdFx0XHR3aWRnZXRSZWN0LmxlZnQsXG5cdFx0XHR3aWRnZXRSZWN0LnRvcCxcblx0XHRcdHdpZGdldFJlY3Qud2lkdGgsXG5cdFx0XHR3aWRnZXRSZWN0LmhlaWdodFxuXHRcdCk7XG5cdFx0aWYgKGRpc3RhbmNlID4gdGhpcy5fcmVuZGVyZWRIb3Zlci5jbG9zZXN0TW91c2VEaXN0YW5jZSArIDQgLyogdG9sZXJhbmNlIG9mIDQgcGl4ZWxzICovKSB7XG5cdFx0XHQvLyBUaGUgbW91c2UgaXMgZ2V0dGluZyBmYXJ0aGVyIGF3YXlcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyLmNsb3Nlc3RNb3VzZURpc3RhbmNlID0gTWF0aC5taW4odGhpcy5fcmVuZGVyZWRIb3Zlci5jbG9zZXN0TW91c2VEaXN0YW5jZSwgZGlzdGFuY2UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UmVuZGVyZWRIb3ZlcihyZW5kZXJlZEhvdmVyOiBSZW5kZXJlZENvbnRlbnRIb3ZlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbmRlcmVkSG92ZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyID0gcmVuZGVyZWRIb3Zlcjtcblx0XHR0aGlzLl9ob3ZlclZpc2libGVLZXkuc2V0KCEhcmVuZGVyZWRIb3Zlcik7XG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhcmVuZGVyZWRIb3Zlcik7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVGb250KCk6IHZvaWQge1xuXHRcdGNvbnN0IHsgZm9udFNpemUsIGxpbmVIZWlnaHQgfSA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHRjb25zdCBjb250ZW50c0RvbU5vZGUgPSB0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGU7XG5cdFx0Y29udGVudHNEb21Ob2RlLnN0eWxlLmZvbnRTaXplID0gYCR7Zm9udFNpemV9cHhgO1xuXHRcdGNvbnRlbnRzRG9tTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7bGluZUhlaWdodCAvIGZvbnRTaXplfWA7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgY29kZUNsYXNzZXM6IEhUTUxFbGVtZW50W10gPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbCh0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuZ2V0RWxlbWVudHNCeUNsYXNzTmFtZSgnY29kZScpKTtcblx0XHRjb2RlQ2xhc3Nlcy5mb3JFYWNoKG5vZGUgPT4gdGhpcy5fZWRpdG9yLmFwcGx5Rm9udEluZm8obm9kZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29udGVudChub2RlOiBEb2N1bWVudEZyYWdtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY29udGVudHNEb21Ob2RlID0gdGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlO1xuXHRcdGNvbnRlbnRzRG9tTm9kZS5zdHlsZS5wYWRkaW5nQm90dG9tID0gJyc7XG5cdFx0Y29udGVudHNEb21Ob2RlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0Y29udGVudHNEb21Ob2RlLmFwcGVuZENoaWxkKG5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbGF5b3V0Q29udGVudFdpZGdldCgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3IubGF5b3V0Q29udGVudFdpZGdldCh0aGlzKTtcblx0XHR0aGlzLl9ob3Zlci5vbkNvbnRlbnRzQ2hhbmdlZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTWF4RGltZW5zaW9ucygpIHtcblx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1heCh0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLmhlaWdodCAvIDQsIDI1MCwgQ29udGVudEhvdmVyV2lkZ2V0Ll9sYXN0RGltZW5zaW9ucy5oZWlnaHQpO1xuXHRcdGNvbnN0IHdpZHRoID0gTWF0aC5tYXgodGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKS53aWR0aCAqIDAuNjYsIDc1MCwgQ29udGVudEhvdmVyV2lkZ2V0Ll9sYXN0RGltZW5zaW9ucy53aWR0aCk7XG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5tYXhTaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5fc2V0SG92ZXJXaWRnZXRNYXhEaW1lbnNpb25zKHdpZHRoLCBoZWlnaHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyKHJlbmRlcmVkSG92ZXI6IFJlbmRlcmVkQ29udGVudEhvdmVyKSB7XG5cdFx0dGhpcy5fc2V0UmVuZGVyZWRIb3ZlcihyZW5kZXJlZEhvdmVyKTtcblx0XHR0aGlzLl91cGRhdGVGb250KCk7XG5cdFx0dGhpcy5fdXBkYXRlQ29udGVudChyZW5kZXJlZEhvdmVyLmRvbU5vZGUpO1xuXHRcdHRoaXMuaGFuZGxlQ29udGVudHNDaGFuZ2VkKCk7XG5cdFx0Ly8gU2ltcGx5IGZvcmNlIGEgc3luY2hyb25vdXMgcmVuZGVyIG9uIHRoZSBlZGl0b3Jcblx0XHQvLyBzdWNoIHRoYXQgdGhlIHdpZGdldCBkb2VzIG5vdCByZWFsbHkgcmVuZGVyIHdpdGggbGVmdCA9ICcwcHgnXG5cdFx0dGhpcy5fZWRpdG9yLnJlbmRlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0UG9zaXRpb24oKTogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdGlmICghdGhpcy5fcmVuZGVyZWRIb3Zlcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogdGhpcy5fcmVuZGVyZWRIb3Zlci5zaG93QXRQb3NpdGlvbixcblx0XHRcdHNlY29uZGFyeVBvc2l0aW9uOiB0aGlzLl9yZW5kZXJlZEhvdmVyLnNob3dBdFNlY29uZGFyeVBvc2l0aW9uLFxuXHRcdFx0cG9zaXRpb25BZmZpbml0eTogdGhpcy5fcmVuZGVyZWRIb3Zlci5zaG91bGRBcHBlYXJCZWZvcmVDb250ZW50ID8gUG9zaXRpb25BZmZpbml0eS5MZWZ0T2ZJbmplY3RlZFRleHQgOiB1bmRlZmluZWQsXG5cdFx0XHRwcmVmZXJlbmNlOiBbdGhpcy5fcG9zaXRpb25QcmVmZXJlbmNlID8/IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UuQUJPVkVdXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBzaG93KHJlbmRlcmVkSG92ZXI6IFJlbmRlcmVkQ29udGVudEhvdmVyKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IgfHwgIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlcihyZW5kZXJlZEhvdmVyKTtcblx0XHRjb25zdCB3aWRnZXRIZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0UG9zaXRpb24gPSByZW5kZXJlZEhvdmVyLnNob3dBdFBvc2l0aW9uO1xuXHRcdHRoaXMuX3Bvc2l0aW9uUHJlZmVyZW5jZSA9IHRoaXMuX2ZpbmRQb3NpdGlvblByZWZlcmVuY2Uod2lkZ2V0SGVpZ2h0LCB3aWRnZXRQb3NpdGlvbikgPz8gQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5BQk9WRTtcblxuXHRcdC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQwMzM5XG5cdFx0Ly8gVE9ETzogRG9pbmcgYSBzZWNvbmQgbGF5b3V0IG9mIHRoZSBob3ZlciBhZnRlciBmb3JjZSByZW5kZXJpbmcgdGhlIGVkaXRvclxuXHRcdHRoaXMuaGFuZGxlQ29udGVudHNDaGFuZ2VkKCk7XG5cdFx0aWYgKHJlbmRlcmVkSG92ZXIuc2hvdWxkRm9jdXMpIHtcblx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuZm9jdXMoKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRSZXNpemUuZmlyZSgpO1xuXHRcdC8vIFRoZSBhcmlhIGxhYmVsIG92ZXJyaWRlcyB0aGUgbGFiZWwsIHNvIGlmIHdlIGFkZCB0byBpdCwgYWRkIHRoZSBjb250ZW50cyBvZiB0aGUgaG92ZXJcblx0XHRjb25zdCBob3ZlckZvY3VzZWQgPSB0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZTtcblx0XHRjb25zdCBhY2Nlc3NpYmxlVmlld0hpbnQgPSBob3ZlckZvY3VzZWQgJiYgZ2V0SG92ZXJBY2Nlc3NpYmxlVmlld0hpbnQoXG5cdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuaG92ZXInKSA9PT0gdHJ1ZSAmJiB0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpLFxuXHRcdFx0dGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnZWRpdG9yLmFjdGlvbi5hY2Nlc3NpYmxlVmlldycpPy5nZXRBcmlhTGFiZWwoKSA/PyAnJ1xuXHRcdCk7XG5cblx0XHRpZiAoYWNjZXNzaWJsZVZpZXdIaW50KSB7XG5cdFx0XHR0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuYXJpYUxhYmVsID0gdGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlLnRleHRDb250ZW50ICsgJywgJyArIGFjY2Vzc2libGVWaWV3SGludDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGlkZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkSG92ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaG92ZXJTdG9sZUZvY3VzID0gdGhpcy5fcmVuZGVyZWRIb3Zlci5zaG91bGRGb2N1cyB8fCB0aGlzLl9ob3ZlckZvY3VzZWRLZXkuZ2V0KCk7XG5cdFx0dGhpcy5fc2V0UmVuZGVyZWRIb3Zlcih1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUubWF4U2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKEluZmluaXR5LCBJbmZpbml0eSk7XG5cdFx0dGhpcy5fcmVzaXphYmxlTm9kZS5jbGVhclNhc2hIb3ZlclN0YXRlKCk7XG5cdFx0dGhpcy5faG92ZXJGb2N1c2VkS2V5LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fZWRpdG9yLmxheW91dENvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0aWYgKGhvdmVyU3RvbGVGb2N1cykge1xuXHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlQ29uc3RyYWludHNSZW5kZXJOb3JtYWxseSgpOiB2b2lkIHtcblx0XHQvLyBBZGRlZCBiZWNhdXNlIG90aGVyd2lzZSB0aGUgaW5pdGlhbCBzaXplIG9mIHRoZSBob3ZlciBjb250ZW50IGlzIHNtYWxsZXIgdGhhbiBzaG91bGQgYmVcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHR0aGlzLl9yZXNpemFibGVOb2RlLmxheW91dChsYXlvdXRJbmZvLmhlaWdodCwgbGF5b3V0SW5mby53aWR0aCk7XG5cdFx0dGhpcy5fc2V0SG92ZXJXaWRnZXREaW1lbnNpb25zKCdhdXRvJywgJ2F1dG8nKTtcblx0XHR0aGlzLl91cGRhdGVNYXhEaW1lbnNpb25zKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0TWluaW11bURpbWVuc2lvbnMoZGltZW5zaW9uczogZG9tLkRpbWVuc2lvbik6IHZvaWQge1xuXHRcdC8vIFdlIGNvbWJpbmUgdGhlIG5ldyBtaW5pbXVtIGRpbWVuc2lvbnMgd2l0aCB0aGUgcHJldmlvdXMgb25lc1xuXHRcdHRoaXMuX21pbmltdW1TaXplID0gbmV3IGRvbS5EaW1lbnNpb24oXG5cdFx0XHRNYXRoLm1heCh0aGlzLl9taW5pbXVtU2l6ZS53aWR0aCwgZGltZW5zaW9ucy53aWR0aCksXG5cdFx0XHRNYXRoLm1heCh0aGlzLl9taW5pbXVtU2l6ZS5oZWlnaHQsIGRpbWVuc2lvbnMuaGVpZ2h0KVxuXHRcdCk7XG5cdFx0dGhpcy5fdXBkYXRlTWluaW11bVdpZHRoKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVNaW5pbXVtV2lkdGgoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2lkdGggPSAoXG5cdFx0XHR0eXBlb2YgdGhpcy5fY29udGVudFdpZHRoID09PSAndW5kZWZpbmVkJ1xuXHRcdFx0XHQ/IHRoaXMuX21pbmltdW1TaXplLndpZHRoXG5cdFx0XHRcdDogTWF0aC5taW4odGhpcy5fY29udGVudFdpZHRoLCB0aGlzLl9taW5pbXVtU2l6ZS53aWR0aClcblx0XHQpO1xuXHRcdC8vIFdlIHdhbnQgdG8gYXZvaWQgdGhhdCB0aGUgaG92ZXIgaXMgYXJ0aWZpY2lhbGx5IGxhcmdlLCBzbyB3ZSB1c2UgdGhlIGNvbnRlbnQgd2lkdGggYXMgbWluaW11bSB3aWR0aFxuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUubWluU2l6ZSA9IG5ldyBkb20uRGltZW5zaW9uKHdpZHRoLCB0aGlzLl9taW5pbXVtU2l6ZS5oZWlnaHQpO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZUNvbnRlbnRzQ2hhbmdlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZW1vdmVDb25zdHJhaW50c1JlbmRlck5vcm1hbGx5KCk7XG5cdFx0Y29uc3QgY29udGVudHNEb21Ob2RlID0gdGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlO1xuXG5cdFx0bGV0IGhlaWdodCA9IGRvbS5nZXRUb3RhbEhlaWdodChjb250ZW50c0RvbU5vZGUpO1xuXHRcdGxldCB3aWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKGNvbnRlbnRzRG9tTm9kZSkgKyAyO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXG5cdFx0dGhpcy5fc2V0SG92ZXJXaWRnZXREaW1lbnNpb25zKHdpZHRoLCBoZWlnaHQpO1xuXG5cdFx0aGVpZ2h0ID0gZG9tLmdldFRvdGFsSGVpZ2h0KGNvbnRlbnRzRG9tTm9kZSk7XG5cdFx0d2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aChjb250ZW50c0RvbU5vZGUpO1xuXHRcdHRoaXMuX2NvbnRlbnRXaWR0aCA9IHdpZHRoO1xuXHRcdHRoaXMuX3VwZGF0ZU1pbmltdW1XaWR0aCgpO1xuXHRcdHRoaXMuX3Jlc2l6YWJsZU5vZGUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXG5cdFx0aWYgKHRoaXMuX3JlbmRlcmVkSG92ZXI/LnNob3dBdFBvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCB3aWRnZXRIZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZSk7XG5cdFx0XHR0aGlzLl9wb3NpdGlvblByZWZlcmVuY2UgPSB0aGlzLl9maW5kUG9zaXRpb25QcmVmZXJlbmNlKHdpZGdldEhlaWdodCwgdGhpcy5fcmVuZGVyZWRIb3Zlci5zaG93QXRQb3NpdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX2xheW91dENvbnRlbnRXaWRnZXQoKTtcblx0XHR0aGlzLl9vbkNvbnRlbnRzQ2hhbmdlZC5maXJlKCk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIHNjcm9sbFVwKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbFRvcDtcblx0XHRjb25zdCBmb250SW5mbyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKTtcblx0XHR0aGlzLl9ob3Zlci5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFRvcCAtIGZvbnRJbmZvLmxpbmVIZWlnaHQgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2Nyb2xsRG93bigpOiB2b2lkIHtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLl9ob3Zlci5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxUb3A7XG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0dGhpcy5faG92ZXIuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsVG9wOiBzY3JvbGxUb3AgKyBmb250SW5mby5saW5lSGVpZ2h0IH0pO1xuXHR9XG5cblx0cHVibGljIHNjcm9sbExlZnQoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsTGVmdCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbExlZnQ7XG5cdFx0dGhpcy5faG92ZXIuc2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHsgc2Nyb2xsTGVmdDogc2Nyb2xsTGVmdCAtIEhPUklaT05UQUxfU0NST0xMSU5HX0JZIH0pO1xuXHR9XG5cblx0cHVibGljIHNjcm9sbFJpZ2h0KCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjcm9sbExlZnQgPSB0aGlzLl9ob3Zlci5zY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxMZWZ0O1xuXHRcdHRoaXMuX2hvdmVyLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbExlZnQ6IHNjcm9sbExlZnQgKyBIT1JJWk9OVEFMX1NDUk9MTElOR19CWSB9KTtcblx0fVxuXG5cdHB1YmxpYyBwYWdlVXAoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gdGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsVG9wO1xuXHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXRTY3JvbGxEaW1lbnNpb25zKCkuaGVpZ2h0O1xuXHRcdHRoaXMuX2hvdmVyLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogc2Nyb2xsVG9wIC0gc2Nyb2xsSGVpZ2h0IH0pO1xuXHR9XG5cblx0cHVibGljIHBhZ2VEb3duKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMuX2hvdmVyLnNjcm9sbGJhci5nZXRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbFRvcDtcblx0XHRjb25zdCBzY3JvbGxIZWlnaHQgPSB0aGlzLl9ob3Zlci5zY3JvbGxiYXIuZ2V0U2Nyb2xsRGltZW5zaW9ucygpLmhlaWdodDtcblx0XHR0aGlzLl9ob3Zlci5zY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3A6IHNjcm9sbFRvcCArIHNjcm9sbEhlaWdodCB9KTtcblx0fVxuXG5cdHB1YmxpYyBnb1RvVG9wKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hvdmVyLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogMCB9KTtcblx0fVxuXG5cdHB1YmxpYyBnb1RvQm90dG9tKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hvdmVyLnNjcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogdGhpcy5faG92ZXIuc2Nyb2xsYmFyLmdldFNjcm9sbERpbWVuc2lvbnMoKS5zY3JvbGxIZWlnaHQgfSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcHV0ZURpc3RhbmNlRnJvbVBvaW50VG9SZWN0YW5nbGUocG9pbnRYOiBudW1iZXIsIHBvaW50WTogbnVtYmVyLCBsZWZ0OiBudW1iZXIsIHRvcDogbnVtYmVyLCB3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG5cdGNvbnN0IHggPSAobGVmdCArIHdpZHRoIC8gMik7IC8vIHggY2VudGVyIG9mIHJlY3RhbmdsZVxuXHRjb25zdCB5ID0gKHRvcCArIGhlaWdodCAvIDIpOyAvLyB5IGNlbnRlciBvZiByZWN0YW5nbGVcblx0Y29uc3QgZHggPSBNYXRoLm1heChNYXRoLmFicyhwb2ludFggLSB4KSAtIHdpZHRoIC8gMiwgMCk7XG5cdGNvbnN0IGR5ID0gTWF0aC5tYXgoTWF0aC5hYnMocG9pbnRZIC0geSkgLSBoZWlnaHQgLyAyLCAwKTtcblx0cmV0dXJuIE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLHVDQUE0RTtBQUNyRixTQUFvQyxvQkFBb0I7QUFDeEQsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNEJBQTRCLG1CQUFtQjtBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGVBQWU7QUFJeEIsTUFBTSwwQkFBMEI7QUFFekIsSUFBTSxxQkFBTixjQUFpQyx1QkFBdUI7QUFBQSxFQW1DOUQsWUFDQyxRQUNvQixtQkFDb0IsdUJBQ0EsdUJBQ0gsb0JBQ3BDO0FBQ0QsVUFBTSxnQkFBZ0IsT0FBTyxVQUFVLGFBQWEsVUFBVSxJQUFJO0FBQ2xFLFVBQU0sZUFBZTtBQUNyQixVQUFNLGNBQWMsSUFBSSxJQUFJLFVBQVUsY0FBYyxhQUFhO0FBQ2pFLFVBQU0sUUFBUSxXQUFXO0FBUGU7QUFDQTtBQUNIO0FBOUJ0QyxTQUFpQixTQUFzQixLQUFLLFVBQVUsSUFBSSxZQUFZLElBQUksQ0FBQztBQUkzRSxTQUFpQixlQUFlLEtBQUssVUFBVSxJ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
