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
import "./hover.css";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import * as dom from "../../../base/browser/dom.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { HoverAction, HoverPosition, HoverWidget as BaseHoverWidget, getHoverAccessibleViewHint } from "../../../base/browser/ui/hover/hoverWidget.js";
import { Widget } from "../../../base/browser/ui/widget.js";
import { AnchorPosition } from "../../../base/browser/ui/contextview/contextview.js";
import { IMarkdownRendererService } from "../../markdown/browser/markdownRenderer.js";
import { isMarkdownString } from "../../../base/common/htmlContent.js";
import { localize } from "../../../nls.js";
import { isMacintosh } from "../../../base/common/platform.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { status } from "../../../base/browser/ui/aria/aria.js";
import { HoverStyle } from "../../../base/browser/ui/hover/hover.js";
import { TimeoutTimer } from "../../../base/common/async.js";
import { isNumber } from "../../../base/common/types.js";
const $ = dom.$;
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["PointerSize"] = 3] = "PointerSize";
  Constants2[Constants2["HoverBorderWidth"] = 2] = "HoverBorderWidth";
  Constants2[Constants2["HoverWindowEdgeMargin"] = 2] = "HoverWindowEdgeMargin";
  return Constants2;
})(Constants || {});
let HoverWidget = class extends Widget {
  constructor(options, _keybindingService, _configurationService, _markdownRenderer, _accessibilityService) {
    super();
    this._keybindingService = _keybindingService;
    this._configurationService = _configurationService;
    this._markdownRenderer = _markdownRenderer;
    this._accessibilityService = _accessibilityService;
    this._messageListeners = new DisposableStore();
    this._isDisposed = false;
    this._forcePosition = false;
    this._x = 0;
    this._y = 0;
    this._isLocked = false;
    this._enableFocusTraps = false;
    this._addedFocusTrap = false;
    this._maxHeightRatioRelativeToWindow = 0.5;
    this._onDispose = this._register(new Emitter());
    this._onRequestLayout = this._register(new Emitter());
    this._linkHandler = options.linkHandler;
    this._target = "targetElements" in options.target ? options.target : new ElementHoverTarget(options.target);
    if (options.style) {
      switch (options.style) {
        case HoverStyle.Pointer: {
          options.appearance ??= {};
          options.appearance.compact ??= true;
          options.appearance.showPointer ??= true;
          break;
        }
        case HoverStyle.Mouse: {
          options.appearance ??= {};
          options.appearance.compact ??= true;
          break;
        }
      }
    }
    this._hoverPointer = options.appearance?.showPointer ? $("div.workbench-hover-pointer") : void 0;
    this._hover = this._register(new BaseHoverWidget(!options.appearance?.skipFadeInAnimation));
    this._hover.containerDomNode.classList.add("workbench-hover");
    if (options.appearance?.compact) {
      this._hover.containerDomNode.classList.add("workbench-hover", "compact");
    }
    if (this._hoverPointer) {
      this._hover.containerDomNode.classList.add("with-pointer");
    }
    if (options.additionalClasses) {
      this._hover.containerDomNode.classList.add(...options.additionalClasses);
    }
    if (options.position?.forcePosition) {
      this._forcePosition = true;
    }
    if (options.trapFocus) {
      this._enableFocusTraps = true;
    }
    const maxHeightRatio = options.appearance?.maxHeightRatio;
    if (maxHeightRatio !== void 0 && maxHeightRatio > 0 && maxHeightRatio <= 1) {
      this._maxHeightRatioRelativeToWindow = maxHeightRatio;
    }
    this._hoverPosition = options.position?.hoverPosition === void 0 ? HoverPosition.ABOVE : isNumber(options.position.hoverPosition) ? options.position.hoverPosition : HoverPosition.BELOW;
    this.onmousedown(this._hover.containerDomNode, (e) => e.stopPropagation());
    this.onkeydown(this._hover.containerDomNode, (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.dispose();
      }
    });
    this._register(dom.addDisposableListener(this._targetWindow, "blur", () => this.dispose()));
    const rowElement = $("div.hover-row.markdown-hover");
    const contentsElement = $("div.hover-contents");
    if (typeof options.content === "string") {
      contentsElement.textContent = options.content;
      contentsElement.style.whiteSpace = "pre-wrap";
    } else if (dom.isHTMLElement(options.content)) {
      contentsElement.appendChild(options.content);
      contentsElement.classList.add("html-hover-contents");
      const resizeObserver = new ResizeObserver(() => {
        this.layout();
        this._onRequestLayout.fire();
      });
      resizeObserver.observe(contentsElement);
      this._register(toDisposable(() => resizeObserver.disconnect()));
    } else {
      const markdown = options.content;
      const { element } = this._register(this._markdownRenderer.render(markdown, {
        actionHandler: this._linkHandler,
        asyncRenderCallback: () => {
          contentsElement.classList.add("code-hover-contents");
          this.layout();
          this._onRequestLayout.fire();
        }
      }));
      contentsElement.appendChild(element);
    }
    rowElement.appendChild(contentsElement);
    this._hover.contentsDomNode.appendChild(rowElement);
    if (options.actions && options.actions.length > 0) {
      const statusBarElement = $("div.hover-row.status-bar");
      const actionsElement = $("div.actions");
      options.actions.forEach((action) => {
        const keybinding = this._keybindingService.lookupKeybinding(action.commandId);
        const keybindingLabel = keybinding ? keybinding.getLabel() : null;
        this._register(HoverAction.render(actionsElement, {
          label: action.label,
          commandId: action.commandId,
          run: (e) => {
            action.run(e);
            this.dispose();
          },
          iconClass: action.iconClass
        }, keybindingLabel));
      });
      statusBarElement.appendChild(actionsElement);
      this._hover.containerDomNode.appendChild(statusBarElement);
    }
    this._hoverContainer = $("div.workbench-hover-container");
    if (this._hoverPointer) {
      this._hoverContainer.appendChild(this._hoverPointer);
    }
    this._hoverContainer.appendChild(this._hover.containerDomNode);
    let hideOnHover;
    if (options.actions && options.actions.length > 0) {
      hideOnHover = false;
    } else {
      if (options.persistence?.hideOnHover === void 0) {
        hideOnHover = typeof options.content === "string" || isMarkdownString(options.content) && !options.content.value.includes("](") && !options.content.value.includes("</a>");
      } else {
        hideOnHover = options.persistence.hideOnHover;
      }
    }
    if (options.appearance?.showHoverHint) {
      const statusBarElement = $("div.hover-row.status-bar");
      const infoElement = $("div.info");
      infoElement.textContent = localize("hoverhint", "Hold {0} key to mouse over", isMacintosh ? "Option" : "Alt");
      statusBarElement.appendChild(infoElement);
      this._hover.containerDomNode.appendChild(statusBarElement);
    }
    const mouseTrackerTargets = [...this._target.targetElements];
    if (!hideOnHover) {
      mouseTrackerTargets.push(this._hoverContainer);
    }
    const mouseTracker = this._mouseTracker = this._register(new CompositeMouseTracker(mouseTrackerTargets));
    this._register(mouseTracker.onMouseOut(() => {
      if (!this._isLocked) {
        this.dispose();
      }
    }));
    if (hideOnHover) {
      const mouseTracker2Targets = [...this._target.targetElements, this._hoverContainer];
      this._lockMouseTracker = this._register(new CompositeMouseTracker(mouseTracker2Targets));
      this._register(this._lockMouseTracker.onMouseOut(() => {
        if (!this._isLocked) {
          this.dispose();
        }
      }));
    } else {
      this._lockMouseTracker = mouseTracker;
    }
  }
  get _targetWindow() {
    return dom.getWindow(this._target.targetElements[0]);
  }
  get _targetDocumentElement() {
    return dom.getWindow(this._target.targetElements[0]).document.documentElement;
  }
  get isDisposed() {
    return this._isDisposed;
  }
  get isMouseIn() {
    return this._lockMouseTracker.isMouseIn;
  }
  get domNode() {
    return this._hover.containerDomNode;
  }
  get onDispose() {
    return this._onDispose.event;
  }
  get onRequestLayout() {
    return this._onRequestLayout.event;
  }
  get anchor() {
    return this._hoverPosition === HoverPosition.BELOW ? AnchorPosition.BELOW : AnchorPosition.ABOVE;
  }
  get x() {
    return this._x;
  }
  get y() {
    return this._y;
  }
  /**
   * Whether the hover is "locked" by holding the alt/option key. When locked, the hover will not
   * hide and can be hovered regardless of whether the `hideOnHover` hover option is set.
   */
  get isLocked() {
    return this._isLocked;
  }
  set isLocked(value) {
    if (this._isLocked === value) {
      return;
    }
    this._isLocked = value;
    this._hoverContainer.classList.toggle("locked", this._isLocked);
  }
  /**
   * Adds an element to be tracked by this hover's mouse tracker. Mouse events on
   * this element will be considered as being "inside" the hover, preventing it
   * from closing. This is used for nested hovers where the child hover's container
   * should be treated as part of the parent hover.
   */
  addMouseTrackingElement(element) {
    return this._lockMouseTracker.addElement(element);
  }
  addFocusTrap() {
    if (!this._enableFocusTraps || this._addedFocusTrap) {
      return;
    }
    this._addedFocusTrap = true;
    const firstContainerFocusElement = this._hover.containerDomNode;
    const lastContainerFocusElement = this.findLastFocusableChild(this._hover.containerDomNode);
    if (lastContainerFocusElement) {
      const beforeContainerFocusElement = dom.prepend(this._hoverContainer, $("div"));
      const afterContainerFocusElement = dom.append(this._hoverContainer, $("div"));
      beforeContainerFocusElement.tabIndex = 0;
      afterContainerFocusElement.tabIndex = 0;
      this._register(dom.addDisposableListener(afterContainerFocusElement, "focus", (e) => {
        firstContainerFocusElement.focus();
        e.preventDefault();
      }));
      this._register(dom.addDisposableListener(beforeContainerFocusElement, "focus", (e) => {
        lastContainerFocusElement.focus();
        e.preventDefault();
      }));
    }
  }
  findLastFocusableChild(root) {
    if (root.hasChildNodes()) {
      for (let i = 0; i < root.childNodes.length; i++) {
        const node = root.childNodes.item(root.childNodes.length - i - 1);
        if (node.nodeType === node.ELEMENT_NODE) {
          const parsedNode = node;
          if (typeof parsedNode.tabIndex === "number" && parsedNode.tabIndex >= 0) {
            return parsedNode;
          }
        }
        const recursivelyFoundElement = this.findLastFocusableChild(node);
        if (recursivelyFoundElement) {
          return recursivelyFoundElement;
        }
      }
    }
    return void 0;
  }
  render(container) {
    container.appendChild(this._hoverContainer);
    const hoverFocused = this._hoverContainer.contains(this._hoverContainer.ownerDocument.activeElement);
    const accessibleViewHint = hoverFocused && getHoverAccessibleViewHint(this._configurationService.getValue("accessibility.verbosity.hover") === true && this._accessibilityService.isScreenReaderOptimized(), this._keybindingService.lookupKeybinding("editor.action.accessibleView")?.getAriaLabel());
    if (accessibleViewHint) {
      status(accessibleViewHint);
    }
    this.layout();
    this.addFocusTrap();
  }
  layout() {
    this._mouseTracker?.suppressPendingMouseOut();
    if (this._lockMouseTracker !== this._mouseTracker) {
      this._lockMouseTracker?.suppressPendingMouseOut();
    }
    this._hover.containerDomNode.classList.remove("right-aligned");
    this._hover.contentsDomNode.style.maxHeight = "";
    const getZoomAccountedBoundingClientRect = (e) => {
      const zoom = dom.getDomNodeZoomLevel(e);
      const boundingRect = e.getBoundingClientRect();
      return {
        top: boundingRect.top * zoom,
        bottom: boundingRect.bottom * zoom,
        right: boundingRect.right * zoom,
        left: boundingRect.left * zoom
      };
    };
    const targetBounds = this._target.targetElements.map((e) => getZoomAccountedBoundingClientRect(e));
    const { top, right, bottom, left } = targetBounds[0];
    const width = right - left;
    const height = bottom - top;
    const targetRect = {
      top,
      right,
      bottom,
      left,
      width,
      height,
      center: {
        x: left + width / 2,
        y: top + height / 2
      }
    };
    this.adjustHorizontalHoverPosition(targetRect);
    this.adjustVerticalHoverPosition(targetRect);
    this.adjustHoverMaxHeight(targetRect);
    this._hoverContainer.style.padding = "";
    this._hoverContainer.style.margin = "";
    if (this._hoverPointer) {
      switch (this._hoverPosition) {
        case HoverPosition.RIGHT:
          targetRect.left += 3 /* PointerSize */;
          targetRect.right += 3 /* PointerSize */;
          this._hoverContainer.style.paddingLeft = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginLeft = `${-3}px`;
          break;
        case HoverPosition.LEFT:
          targetRect.left -= 3 /* PointerSize */;
          targetRect.right -= 3 /* PointerSize */;
          this._hoverContainer.style.paddingRight = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginRight = `${-3}px`;
          break;
        case HoverPosition.BELOW:
          targetRect.top += 3 /* PointerSize */;
          targetRect.bottom += 3 /* PointerSize */;
          this._hoverContainer.style.paddingTop = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginTop = `${-3}px`;
          break;
        case HoverPosition.ABOVE:
          targetRect.top -= 3 /* PointerSize */;
          targetRect.bottom -= 3 /* PointerSize */;
          this._hoverContainer.style.paddingBottom = `${3 /* PointerSize */}px`;
          this._hoverContainer.style.marginBottom = `${-3}px`;
          break;
      }
      targetRect.center.x = targetRect.left + width / 2;
      targetRect.center.y = targetRect.top + height / 2;
    }
    this.computeXCordinate(targetRect);
    this.computeYCordinate(targetRect);
    if (this._hoverPointer) {
      this._hoverPointer.classList.remove("top");
      this._hoverPointer.classList.remove("left");
      this._hoverPointer.classList.remove("right");
      this._hoverPointer.classList.remove("bottom");
      this.setHoverPointerPosition(targetRect);
    }
    this._hover.onContentsChanged();
  }
  computeXCordinate(target) {
    const hoverWidth = this._hover.containerDomNode.clientWidth + 2 /* HoverBorderWidth */;
    if (this._target.x !== void 0) {
      this._x = this._target.x;
    } else if (this._hoverPosition === HoverPosition.RIGHT) {
      this._x = target.right;
    } else if (this._hoverPosition === HoverPosition.LEFT) {
      this._x = target.left - hoverWidth;
    } else {
      if (this._hoverPointer) {
        this._x = target.center.x - this._hover.containerDomNode.clientWidth / 2;
      } else {
        this._x = target.left;
      }
      if (this._x + hoverWidth >= this._targetDocumentElement.clientWidth) {
        this._hover.containerDomNode.classList.add("right-aligned");
        this._x = Math.max(this._targetDocumentElement.clientWidth - hoverWidth - 2 /* HoverWindowEdgeMargin */, this._targetDocumentElement.clientLeft);
      }
    }
    if (this._x < this._targetDocumentElement.clientLeft) {
      this._x = target.left + 2 /* HoverWindowEdgeMargin */;
    }
  }
  computeYCordinate(target) {
    if (this._target.y !== void 0) {
      this._y = this._target.y;
    } else if (this._hoverPosition === HoverPosition.ABOVE) {
      this._y = target.top;
    } else if (this._hoverPosition === HoverPosition.BELOW) {
      this._y = target.bottom - 2;
    } else {
      if (this._hoverPointer) {
        this._y = target.center.y + this._hover.containerDomNode.clientHeight / 2;
      } else {
        this._y = target.bottom;
      }
    }
    if (this._y > this._targetWindow.innerHeight) {
      this._y = target.bottom;
    }
  }
  adjustHorizontalHoverPosition(target) {
    if (this._target.x !== void 0) {
      return;
    }
    const hoverPointerOffset = this._hoverPointer ? 3 /* PointerSize */ : 0;
    if (this._forcePosition) {
      const padding = hoverPointerOffset + 2 /* HoverBorderWidth */;
      if (this._hoverPosition === HoverPosition.RIGHT) {
        this._hover.containerDomNode.style.maxWidth = `${this._targetDocumentElement.clientWidth - target.right - padding}px`;
      } else if (this._hoverPosition === HoverPosition.LEFT) {
        this._hover.containerDomNode.style.maxWidth = `${target.left - padding}px`;
      }
      return;
    }
    if (this._hoverPosition === HoverPosition.RIGHT) {
      const roomOnRight = this._targetDocumentElement.clientWidth - target.right;
      if (roomOnRight < this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
        const roomOnLeft = target.left;
        if (roomOnLeft >= this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
          this._hoverPosition = HoverPosition.LEFT;
        } else {
          this._hoverPosition = HoverPosition.BELOW;
        }
      }
    } else if (this._hoverPosition === HoverPosition.LEFT) {
      const roomOnLeft = target.left;
      if (roomOnLeft < this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
        const roomOnRight = this._targetDocumentElement.clientWidth - target.right;
        if (roomOnRight >= this._hover.containerDomNode.clientWidth + hoverPointerOffset) {
          this._hoverPosition = HoverPosition.RIGHT;
        } else {
          this._hoverPosition = HoverPosition.BELOW;
        }
      }
      if (target.left - this._hover.containerDomNode.clientWidth - hoverPointerOffset <= this._targetDocumentElement.clientLeft) {
        this._hoverPosition = HoverPosition.RIGHT;
      }
    }
  }
  adjustVerticalHoverPosition(target) {
    if (this._target.y !== void 0 || this._forcePosition) {
      return;
    }
    const hoverPointerOffset = this._hoverPointer ? 3 /* PointerSize */ : 0;
    if (this._hoverPosition === HoverPosition.ABOVE) {
      if (target.top - this._hover.containerDomNode.clientHeight - hoverPointerOffset < 0) {
        this._hoverPosition = HoverPosition.BELOW;
      }
    } else if (this._hoverPosition === HoverPosition.BELOW) {
      if (target.bottom + this._hover.containerDomNode.offsetHeight + hoverPointerOffset > this._targetWindow.innerHeight) {
        this._hoverPosition = HoverPosition.ABOVE;
      }
    }
  }
  adjustHoverMaxHeight(target) {
    let maxHeight = this._targetWindow.innerHeight * this._maxHeightRatioRelativeToWindow;
    if (this._forcePosition) {
      const padding = (this._hoverPointer ? 3 /* PointerSize */ : 0) + 2 /* HoverBorderWidth */;
      if (this._hoverPosition === HoverPosition.ABOVE) {
        maxHeight = Math.min(maxHeight, target.top - padding);
      } else if (this._hoverPosition === HoverPosition.BELOW) {
        maxHeight = Math.min(maxHeight, this._targetWindow.innerHeight - target.bottom - padding);
      }
    }
    this._hover.containerDomNode.style.maxHeight = `${maxHeight}px`;
    if (this._hover.contentsDomNode.clientHeight < this._hover.contentsDomNode.scrollHeight) {
      const extraRightPadding = `${this._hover.scrollbar.options.verticalScrollbarSize}px`;
      if (this._hover.contentsDomNode.style.paddingRight !== extraRightPadding) {
        this._hover.contentsDomNode.style.paddingRight = extraRightPadding;
      }
    }
  }
  setHoverPointerPosition(target) {
    if (!this._hoverPointer) {
      return;
    }
    switch (this._hoverPosition) {
      case HoverPosition.LEFT:
      case HoverPosition.RIGHT: {
        this._hoverPointer.classList.add(this._hoverPosition === HoverPosition.LEFT ? "right" : "left");
        const hoverHeight = this._hover.containerDomNode.clientHeight;
        if (hoverHeight > target.height) {
          this._hoverPointer.style.top = `${target.center.y - (this._y - hoverHeight) - 3 /* PointerSize */}px`;
        } else {
          this._hoverPointer.style.top = `${Math.round(hoverHeight / 2) - 3 /* PointerSize */}px`;
        }
        break;
      }
      case HoverPosition.ABOVE:
      case HoverPosition.BELOW: {
        this._hoverPointer.classList.add(this._hoverPosition === HoverPosition.ABOVE ? "bottom" : "top");
        const hoverWidth = this._hover.containerDomNode.clientWidth;
        let pointerLeftPosition = Math.round(hoverWidth / 2) - 3 /* PointerSize */;
        const pointerX = this._x + pointerLeftPosition;
        if (pointerX < target.left || pointerX > target.right) {
          pointerLeftPosition = target.center.x - this._x - 3 /* PointerSize */;
        }
        this._hoverPointer.style.left = `${pointerLeftPosition}px`;
        break;
      }
    }
  }
  focus() {
    this._hover.containerDomNode.focus();
  }
  hide() {
    this.dispose();
  }
  dispose() {
    if (!this._isDisposed) {
      this._onDispose.fire();
      this._target.dispose?.();
      this._hoverContainer.remove();
      this._messageListeners.dispose();
      super.dispose();
    }
    this._isDisposed = true;
  }
};
HoverWidget = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IMarkdownRendererService),
  __decorateParam(4, IAccessibilityService)
], HoverWidget);
class CompositeMouseTracker extends Widget {
  /**
   * @param _elements The target elements to track mouse in/out events on.
   * @param _eventDebounceDelay The delay in ms to debounce the event firing. This is used to
   * allow a short period for the mouse to move into the hover or a nearby target element. For
   * example hovering a scroll bar will not hide the hover immediately.
   */
  constructor(_elements, _eventDebounceDelay = 200) {
    super();
    this._elements = _elements;
    this._eventDebounceDelay = _eventDebounceDelay;
    this._isMouseIn = true;
    this._suppressNextMouseOut = false;
    this._mouseTimer = this._register(new MutableDisposable());
    this._onMouseOut = this._register(new Emitter());
    for (const element of this._elements) {
      this.onmouseover(element, () => this._onTargetMouseOver());
      this.onmouseleave(element, () => this._onTargetMouseLeave());
    }
  }
  get onMouseOut() {
    return this._onMouseOut.event;
  }
  get isMouseIn() {
    return this._isMouseIn;
  }
  _onTargetMouseOver() {
    this._isMouseIn = true;
    this._suppressNextMouseOut = false;
    this._mouseTimer.clear();
  }
  _onTargetMouseLeave() {
    this._isMouseIn = false;
    this._mouseTimer.value = new TimeoutTimer(() => this._fireIfMouseOutside(), this._eventDebounceDelay);
  }
  _fireIfMouseOutside() {
    if (!this._isMouseIn && !this._suppressNextMouseOut) {
      this._onMouseOut.fire();
    }
  }
  /**
   * Suppresses the next pending mouseout dismissal. Call this when tracked
   * elements are being resized or repositioned to avoid spurious dismissals
   * caused by the element shrinking away from the cursor. The suppression
   * is cleared when the mouse next enters a tracked element.
   */
  suppressPendingMouseOut() {
    if (!this._isMouseIn) {
      this._suppressNextMouseOut = true;
    }
  }
  /**
   * Adds an element to be tracked by this mouse tracker. Mouse events on this
   * element will be considered as being "inside" the tracked area.
   */
  addElement(element) {
    if (this._elements.includes(element)) {
      return Disposable.None;
    }
    this._elements.push(element);
    const store = new DisposableStore();
    store.add(dom.addDisposableListener(element, dom.EventType.MOUSE_OVER, () => this._onTargetMouseOver()));
    store.add(dom.addDisposableListener(element, dom.EventType.MOUSE_LEAVE, () => this._onTargetMouseLeave()));
    store.add(toDisposable(() => {
      const index = this._elements.indexOf(element);
      if (index >= 0) {
        this._elements.splice(index, 1);
      }
    }));
    return store;
  }
}
class ElementHoverTarget {
  constructor(_element) {
    this._element = _element;
    this.targetElements = [this._element];
  }
  dispose() {
  }
}
export {
  HoverWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXJXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vaG92ZXIuY3NzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEhvdmVyQWN0aW9uLCBIb3ZlclBvc2l0aW9uLCBIb3ZlcldpZGdldCBhcyBCYXNlSG92ZXJXaWRnZXQsIGdldEhvdmVyQWNjZXNzaWJsZVZpZXdIaW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS93aWRnZXQuanMnO1xuaW1wb3J0IHsgQW5jaG9yUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGlzTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgc3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBIb3ZlclN0eWxlLCB0eXBlIElIb3Zlck9wdGlvbnMsIHR5cGUgSUhvdmVyVGFyZ2V0LCB0eXBlIElIb3ZlcldpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xudHlwZSBUYXJnZXRSZWN0ID0ge1xuXHRsZWZ0OiBudW1iZXI7XG5cdHJpZ2h0OiBudW1iZXI7XG5cdHRvcDogbnVtYmVyO1xuXHRib3R0b206IG51bWJlcjtcblx0d2lkdGg6IG51bWJlcjtcblx0aGVpZ2h0OiBudW1iZXI7XG5cdGNlbnRlcjogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9O1xufTtcblxuY29uc3QgZW51bSBDb25zdGFudHMge1xuXHRQb2ludGVyU2l6ZSA9IDMsXG5cdEhvdmVyQm9yZGVyV2lkdGggPSAyLFxuXHRIb3ZlcldpbmRvd0VkZ2VNYXJnaW4gPSAyLFxufVxuXG5leHBvcnQgY2xhc3MgSG92ZXJXaWRnZXQgZXh0ZW5kcyBXaWRnZXQgaW1wbGVtZW50cyBJSG92ZXJXaWRnZXQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXNzYWdlTGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2NrTW91c2VUcmFja2VyOiBDb21wb3NpdGVNb3VzZVRyYWNrZXI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXI6IEJhc2VIb3ZlcldpZGdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJQb2ludGVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXJnZXQ6IElIb3ZlclRhcmdldDtcblx0cHJpdmF0ZSByZWFkb25seSBfbGlua0hhbmRsZXI6ICgodXJsOiBzdHJpbmcpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2lzRGlzcG9zZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbjtcblx0cHJpdmF0ZSBfZm9yY2VQb3NpdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF94OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF95OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9pc0xvY2tlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9lbmFibGVGb2N1c1RyYXBzOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2FkZGVkRm9jdXNUcmFwOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX21heEhlaWdodFJhdGlvUmVsYXRpdmVUb1dpbmRvdzogbnVtYmVyID0gMC41O1xuXHRwcml2YXRlIF9tb3VzZVRyYWNrZXI6IENvbXBvc2l0ZU1vdXNlVHJhY2tlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGdldCBfdGFyZ2V0V2luZG93KCk6IFdpbmRvdyB7XG5cdFx0cmV0dXJuIGRvbS5nZXRXaW5kb3codGhpcy5fdGFyZ2V0LnRhcmdldEVsZW1lbnRzWzBdKTtcblx0fVxuXHRwcml2YXRlIGdldCBfdGFyZ2V0RG9jdW1lbnRFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gZG9tLmdldFdpbmRvdyh0aGlzLl90YXJnZXQudGFyZ2V0RWxlbWVudHNbMF0pLmRvY3VtZW50LmRvY3VtZW50RWxlbWVudDtcblx0fVxuXG5cdGdldCBpc0Rpc3Bvc2VkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNEaXNwb3NlZDsgfVxuXHRnZXQgaXNNb3VzZUluKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fbG9ja01vdXNlVHJhY2tlci5pc01vdXNlSW47IH1cblx0Z2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRnZXQgb25EaXNwb3NlKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlzcG9zZS5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlcXVlc3RMYXlvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uUmVxdWVzdExheW91dCgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vblJlcXVlc3RMYXlvdXQuZXZlbnQ7IH1cblxuXHRnZXQgYW5jaG9yKCk6IEFuY2hvclBvc2l0aW9uIHsgcmV0dXJuIHRoaXMuX2hvdmVyUG9zaXRpb24gPT09IEhvdmVyUG9zaXRpb24uQkVMT1cgPyBBbmNob3JQb3NpdGlvbi5CRUxPVyA6IEFuY2hvclBvc2l0aW9uLkFCT1ZFOyB9XG5cdGdldCB4KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl94OyB9XG5cdGdldCB5KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl95OyB9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGhvdmVyIGlzIFwibG9ja2VkXCIgYnkgaG9sZGluZyB0aGUgYWx0L29wdGlvbiBrZXkuIFdoZW4gbG9ja2VkLCB0aGUgaG92ZXIgd2lsbCBub3Rcblx0ICogaGlkZSBhbmQgY2FuIGJlIGhvdmVyZWQgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIHRoZSBgaGlkZU9uSG92ZXJgIGhvdmVyIG9wdGlvbiBpcyBzZXQuXG5cdCAqL1xuXHRnZXQgaXNMb2NrZWQoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc0xvY2tlZDsgfVxuXHRzZXQgaXNMb2NrZWQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRpZiAodGhpcy5faXNMb2NrZWQgPT09IHZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2lzTG9ja2VkID0gdmFsdWU7XG5cdFx0dGhpcy5faG92ZXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbG9ja2VkJywgdGhpcy5faXNMb2NrZWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFkZHMgYW4gZWxlbWVudCB0byBiZSB0cmFja2VkIGJ5IHRoaXMgaG92ZXIncyBtb3VzZSB0cmFja2VyLiBNb3VzZSBldmVudHMgb25cblx0ICogdGhpcyBlbGVtZW50IHdpbGwgYmUgY29uc2lkZXJlZCBhcyBiZWluZyBcImluc2lkZVwiIHRoZSBob3ZlciwgcHJldmVudGluZyBpdFxuXHQgKiBmcm9tIGNsb3NpbmcuIFRoaXMgaXMgdXNlZCBmb3IgbmVzdGVkIGhvdmVycyB3aGVyZSB0aGUgY2hpbGQgaG92ZXIncyBjb250YWluZXJcblx0ICogc2hvdWxkIGJlIHRyZWF0ZWQgYXMgcGFydCBvZiB0aGUgcGFyZW50IGhvdmVyLlxuXHQgKi9cblx0YWRkTW91c2VUcmFja2luZ0VsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xvY2tNb3VzZVRyYWNrZXIuYWRkRWxlbWVudChlbGVtZW50KTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElIb3Zlck9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21hcmtkb3duUmVuZGVyZXI6IElNYXJrZG93blJlbmRlcmVyU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2xpbmtIYW5kbGVyID0gb3B0aW9ucy5saW5rSGFuZGxlcjtcblxuXHRcdHRoaXMuX3RhcmdldCA9ICd0YXJnZXRFbGVtZW50cycgaW4gb3B0aW9ucy50YXJnZXQgPyBvcHRpb25zLnRhcmdldCA6IG5ldyBFbGVtZW50SG92ZXJUYXJnZXQob3B0aW9ucy50YXJnZXQpO1xuXG5cdFx0aWYgKG9wdGlvbnMuc3R5bGUpIHtcblx0XHRcdHN3aXRjaCAob3B0aW9ucy5zdHlsZSkge1xuXHRcdFx0XHRjYXNlIEhvdmVyU3R5bGUuUG9pbnRlcjoge1xuXHRcdFx0XHRcdG9wdGlvbnMuYXBwZWFyYW5jZSA/Pz0ge307XG5cdFx0XHRcdFx0b3B0aW9ucy5hcHBlYXJhbmNlLmNvbXBhY3QgPz89IHRydWU7XG5cdFx0XHRcdFx0b3B0aW9ucy5hcHBlYXJhbmNlLnNob3dQb2ludGVyID8/PSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgSG92ZXJTdHlsZS5Nb3VzZToge1xuXHRcdFx0XHRcdG9wdGlvbnMuYXBwZWFyYW5jZSA/Pz0ge307XG5cdFx0XHRcdFx0b3B0aW9ucy5hcHBlYXJhbmNlLmNvbXBhY3QgPz89IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9ob3ZlclBvaW50ZXIgPSBvcHRpb25zLmFwcGVhcmFuY2U/LnNob3dQb2ludGVyID8gJCgnZGl2LndvcmtiZW5jaC1ob3Zlci1wb2ludGVyJykgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faG92ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQmFzZUhvdmVyV2lkZ2V0KCFvcHRpb25zLmFwcGVhcmFuY2U/LnNraXBGYWRlSW5BbmltYXRpb24pKTtcblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ3dvcmtiZW5jaC1ob3ZlcicpO1xuXHRcdGlmIChvcHRpb25zLmFwcGVhcmFuY2U/LmNvbXBhY3QpIHtcblx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnd29ya2JlbmNoLWhvdmVyJywgJ2NvbXBhY3QnKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2hvdmVyUG9pbnRlcikge1xuXHRcdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGFzc0xpc3QuYWRkKCd3aXRoLXBvaW50ZXInKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMuYWRkaXRpb25hbENsYXNzZXMpIHtcblx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xhc3NMaXN0LmFkZCguLi5vcHRpb25zLmFkZGl0aW9uYWxDbGFzc2VzKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMucG9zaXRpb24/LmZvcmNlUG9zaXRpb24pIHtcblx0XHRcdHRoaXMuX2ZvcmNlUG9zaXRpb24gPSB0cnVlO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy50cmFwRm9jdXMpIHtcblx0XHRcdHRoaXMuX2VuYWJsZUZvY3VzVHJhcHMgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1heEhlaWdodFJhdGlvID0gb3B0aW9ucy5hcHBlYXJhbmNlPy5tYXhIZWlnaHRSYXRpbztcblx0XHRpZiAobWF4SGVpZ2h0UmF0aW8gIT09IHVuZGVmaW5lZCAmJiBtYXhIZWlnaHRSYXRpbyA+IDAgJiYgbWF4SGVpZ2h0UmF0aW8gPD0gMSkge1xuXHRcdFx0dGhpcy5fbWF4SGVpZ2h0UmF0aW9SZWxhdGl2ZVRvV2luZG93ID0gbWF4SGVpZ2h0UmF0aW87XG5cdFx0fVxuXG5cdFx0Ly8gRGVmYXVsdCB0byBwb3NpdGlvbiBhYm92ZSB3aGVuIHRoZSBwb3NpdGlvbiBpcyB1bnNwZWNpZmllZCBvciBhIG1vdXNlIGV2ZW50XG5cdFx0dGhpcy5faG92ZXJQb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb24/LmhvdmVyUG9zaXRpb24gPT09IHVuZGVmaW5lZFxuXHRcdFx0PyBIb3ZlclBvc2l0aW9uLkFCT1ZFXG5cdFx0XHQ6IGlzTnVtYmVyKG9wdGlvbnMucG9zaXRpb24uaG92ZXJQb3NpdGlvbilcblx0XHRcdFx0PyBvcHRpb25zLnBvc2l0aW9uLmhvdmVyUG9zaXRpb25cblx0XHRcdFx0OiBIb3ZlclBvc2l0aW9uLkJFTE9XO1xuXG5cdFx0Ly8gRG9uJ3QgYWxsb3cgbW91c2Vkb3duIG91dCBvZiB0aGUgd2lkZ2V0LCBvdGhlcndpc2UgcHJldmVudERlZmF1bHQgd2lsbCBjYWxsIGFuZCB0ZXh0IHdpbGxcblx0XHQvLyBub3QgYmUgc2VsZWN0ZWQuXG5cdFx0dGhpcy5vbm1vdXNlZG93bih0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpO1xuXG5cdFx0Ly8gSGlkZSBob3ZlciBvbiBlc2NhcGVcblx0XHR0aGlzLm9ua2V5ZG93bih0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLCBlID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBIaWRlIHdoZW4gdGhlIHdpbmRvdyBsb3NlcyBmb2N1c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fdGFyZ2V0V2luZG93LCAnYmx1cicsICgpID0+IHRoaXMuZGlzcG9zZSgpKSk7XG5cblx0XHRjb25zdCByb3dFbGVtZW50ID0gJCgnZGl2LmhvdmVyLXJvdy5tYXJrZG93bi1ob3ZlcicpO1xuXHRcdGNvbnN0IGNvbnRlbnRzRWxlbWVudCA9ICQoJ2Rpdi5ob3Zlci1jb250ZW50cycpO1xuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5jb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdFx0Y29udGVudHNFbGVtZW50LnRleHRDb250ZW50ID0gb3B0aW9ucy5jb250ZW50O1xuXHRcdFx0Y29udGVudHNFbGVtZW50LnN0eWxlLndoaXRlU3BhY2UgPSAncHJlLXdyYXAnO1xuXG5cdFx0fSBlbHNlIGlmIChkb20uaXNIVE1MRWxlbWVudChvcHRpb25zLmNvbnRlbnQpKSB7XG5cdFx0XHRjb250ZW50c0VsZW1lbnQuYXBwZW5kQ2hpbGQob3B0aW9ucy5jb250ZW50KTtcblx0XHRcdGNvbnRlbnRzRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdodG1sLWhvdmVyLWNvbnRlbnRzJyk7XG5cblx0XHRcdC8vIFdhdGNoIGZvciBzaXplIGNoYW5nZXMgZnJvbSBkeW5hbWljIEhUTUwgY29udGVudCAoZS5nLiBjb2xsYXBzaWJsZSByZWdpb25zKS5cblx0XHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gbmV3IFJlc2l6ZU9ic2VydmVyKCgpID0+IHtcblx0XHRcdFx0dGhpcy5sYXlvdXQoKTtcblx0XHRcdFx0dGhpcy5fb25SZXF1ZXN0TGF5b3V0LmZpcmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShjb250ZW50c0VsZW1lbnQpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gb3B0aW9ucy5jb250ZW50O1xuXG5cdFx0XHRjb25zdCB7IGVsZW1lbnQgfSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21hcmtkb3duUmVuZGVyZXIucmVuZGVyKG1hcmtkb3duLCB7XG5cdFx0XHRcdGFjdGlvbkhhbmRsZXI6IHRoaXMuX2xpbmtIYW5kbGVyLFxuXHRcdFx0XHRhc3luY1JlbmRlckNhbGxiYWNrOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y29udGVudHNFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NvZGUtaG92ZXItY29udGVudHMnKTtcblx0XHRcdFx0XHR0aGlzLmxheW91dCgpO1xuXHRcdFx0XHRcdC8vIFRoaXMgY2hhbmdlcyB0aGUgZGltZW5zaW9ucyBvZiB0aGUgaG92ZXIgc28gdHJpZ2dlciBhIGxheW91dFxuXHRcdFx0XHRcdHRoaXMuX29uUmVxdWVzdExheW91dC5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGNvbnRlbnRzRWxlbWVudC5hcHBlbmRDaGlsZChlbGVtZW50KTtcblx0XHR9XG5cdFx0cm93RWxlbWVudC5hcHBlbmRDaGlsZChjb250ZW50c0VsZW1lbnQpO1xuXHRcdHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZS5hcHBlbmRDaGlsZChyb3dFbGVtZW50KTtcblxuXHRcdGlmIChvcHRpb25zLmFjdGlvbnMgJiYgb3B0aW9ucy5hY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHN0YXR1c0JhckVsZW1lbnQgPSAkKCdkaXYuaG92ZXItcm93LnN0YXR1cy1iYXInKTtcblx0XHRcdGNvbnN0IGFjdGlvbnNFbGVtZW50ID0gJCgnZGl2LmFjdGlvbnMnKTtcblx0XHRcdG9wdGlvbnMuYWN0aW9ucy5mb3JFYWNoKGFjdGlvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5jb21tYW5kSWQpO1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWwgPSBrZXliaW5kaW5nID8ga2V5YmluZGluZy5nZXRMYWJlbCgpIDogbnVsbDtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoSG92ZXJBY3Rpb24ucmVuZGVyKGFjdGlvbnNFbGVtZW50LCB7XG5cdFx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRjb21tYW5kSWQ6IGFjdGlvbi5jb21tYW5kSWQsXG5cdFx0XHRcdFx0cnVuOiBlID0+IHtcblx0XHRcdFx0XHRcdGFjdGlvbi5ydW4oZSk7XG5cdFx0XHRcdFx0XHR0aGlzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGljb25DbGFzczogYWN0aW9uLmljb25DbGFzc1xuXHRcdFx0XHR9LCBrZXliaW5kaW5nTGFiZWwpKTtcblx0XHRcdH0pO1xuXHRcdFx0c3RhdHVzQmFyRWxlbWVudC5hcHBlbmRDaGlsZChhY3Rpb25zRWxlbWVudCk7XG5cdFx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmFwcGVuZENoaWxkKHN0YXR1c0JhckVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyID0gJCgnZGl2LndvcmtiZW5jaC1ob3Zlci1jb250YWluZXInKTtcblx0XHRpZiAodGhpcy5faG92ZXJQb2ludGVyKSB7XG5cdFx0XHR0aGlzLl9ob3ZlckNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9ob3ZlclBvaW50ZXIpO1xuXHRcdH1cblx0XHR0aGlzLl9ob3ZlckNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlKTtcblxuXHRcdC8vIERldGVybWluZSB3aGV0aGVyIHRvIGhpZGUgb24gaG92ZXJcblx0XHRsZXQgaGlkZU9uSG92ZXI6IGJvb2xlYW47XG5cdFx0aWYgKG9wdGlvbnMuYWN0aW9ucyAmJiBvcHRpb25zLmFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gSWYgdGhlcmUgYXJlIGFjdGlvbnMsIHJlcXVpcmUgaG92ZXIgc28gdGhleSBjYW4gYmUgYWNjZXNzZWRcblx0XHRcdGhpZGVPbkhvdmVyID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChvcHRpb25zLnBlcnNpc3RlbmNlPy5oaWRlT25Ib3ZlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIFdoZW4gdW5zZXQsIHdpbGwgZGVmYXVsdCB0byB0cnVlIHdoZW4gaXQncyBhIHN0cmluZyBvciB3aGVuIGl0J3MgbWFya2Rvd24gdGhhdFxuXHRcdFx0XHQvLyBhcHBlYXJzIHRvIGhhdmUgYSBsaW5rIHVzaW5nIGEgbmFpdmUgY2hlY2sgZm9yICddKCcgYW5kICc8L2E+J1xuXHRcdFx0XHRoaWRlT25Ib3ZlciA9IHR5cGVvZiBvcHRpb25zLmNvbnRlbnQgPT09ICdzdHJpbmcnIHx8XG5cdFx0XHRcdFx0aXNNYXJrZG93blN0cmluZyhvcHRpb25zLmNvbnRlbnQpICYmICFvcHRpb25zLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ10oJykgJiYgIW9wdGlvbnMuY29udGVudC52YWx1ZS5pbmNsdWRlcygnPC9hPicpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gSXQncyBzZXQgZXhwbGljaXRseVxuXHRcdFx0XHRoaWRlT25Ib3ZlciA9IG9wdGlvbnMucGVyc2lzdGVuY2UuaGlkZU9uSG92ZXI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyB0aGUgaG92ZXIgaGludCBpZiBuZWVkZWRcblx0XHRpZiAob3B0aW9ucy5hcHBlYXJhbmNlPy5zaG93SG92ZXJIaW50KSB7XG5cdFx0XHRjb25zdCBzdGF0dXNCYXJFbGVtZW50ID0gJCgnZGl2LmhvdmVyLXJvdy5zdGF0dXMtYmFyJyk7XG5cdFx0XHRjb25zdCBpbmZvRWxlbWVudCA9ICQoJ2Rpdi5pbmZvJyk7XG5cdFx0XHRpbmZvRWxlbWVudC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdob3ZlcmhpbnQnLCAnSG9sZCB7MH0ga2V5IHRvIG1vdXNlIG92ZXInLCBpc01hY2ludG9zaCA/ICdPcHRpb24nIDogJ0FsdCcpO1xuXHRcdFx0c3RhdHVzQmFyRWxlbWVudC5hcHBlbmRDaGlsZChpbmZvRWxlbWVudCk7XG5cdFx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmFwcGVuZENoaWxkKHN0YXR1c0JhckVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vdXNlVHJhY2tlclRhcmdldHMgPSBbLi4udGhpcy5fdGFyZ2V0LnRhcmdldEVsZW1lbnRzXTtcblx0XHRpZiAoIWhpZGVPbkhvdmVyKSB7XG5cdFx0XHRtb3VzZVRyYWNrZXJUYXJnZXRzLnB1c2godGhpcy5faG92ZXJDb250YWluZXIpO1xuXHRcdH1cblx0XHRjb25zdCBtb3VzZVRyYWNrZXIgPSB0aGlzLl9tb3VzZVRyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29tcG9zaXRlTW91c2VUcmFja2VyKG1vdXNlVHJhY2tlclRhcmdldHMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb3VzZVRyYWNrZXIub25Nb3VzZU91dCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzTG9ja2VkKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFNldHVwIGFub3RoZXIgbW91c2UgdHJhY2tlciB3aGVuIGhpZGVPbkhvdmVyIGlzIHNldCBpbiBvcmRlciB0byB0cmFjayB0aGUgaG92ZXIgYXMgd2VsbFxuXHRcdC8vIHdoZW4gaXQgaXMgbG9ja2VkLiBUaGlzIGVuc3VyZXMgdGhlIGhvdmVyIHdpbGwgaGlkZSBvbiBtb3VzZW91dCBhZnRlciBhbHQgaGFzIGJlZW5cblx0XHQvLyByZWxlYXNlZCB0byB1bmxvY2sgdGhlIGVsZW1lbnQuXG5cdFx0aWYgKGhpZGVPbkhvdmVyKSB7XG5cdFx0XHRjb25zdCBtb3VzZVRyYWNrZXIyVGFyZ2V0cyA9IFsuLi50aGlzLl90YXJnZXQudGFyZ2V0RWxlbWVudHMsIHRoaXMuX2hvdmVyQ29udGFpbmVyXTtcblx0XHRcdHRoaXMuX2xvY2tNb3VzZVRyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ29tcG9zaXRlTW91c2VUcmFja2VyKG1vdXNlVHJhY2tlcjJUYXJnZXRzKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sb2NrTW91c2VUcmFja2VyLm9uTW91c2VPdXQoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX2lzTG9ja2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9ja01vdXNlVHJhY2tlciA9IG1vdXNlVHJhY2tlcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFkZEZvY3VzVHJhcCgpIHtcblx0XHRpZiAoIXRoaXMuX2VuYWJsZUZvY3VzVHJhcHMgfHwgdGhpcy5fYWRkZWRGb2N1c1RyYXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWRkZWRGb2N1c1RyYXAgPSB0cnVlO1xuXG5cdFx0Ly8gQWRkIGEgaG92ZXIgdGFiIGxvb3AgaWYgdGhlIGhvdmVyIGhhcyBhdCBsZWFzdCBvbmUgZWxlbWVudCB3aXRoIGEgdmFsaWQgdGFiSW5kZXhcblx0XHRjb25zdCBmaXJzdENvbnRhaW5lckZvY3VzRWxlbWVudCA9IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGU7XG5cdFx0Y29uc3QgbGFzdENvbnRhaW5lckZvY3VzRWxlbWVudCA9IHRoaXMuZmluZExhc3RGb2N1c2FibGVDaGlsZCh0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlKTtcblx0XHRpZiAobGFzdENvbnRhaW5lckZvY3VzRWxlbWVudCkge1xuXHRcdFx0Y29uc3QgYmVmb3JlQ29udGFpbmVyRm9jdXNFbGVtZW50ID0gZG9tLnByZXBlbmQodGhpcy5faG92ZXJDb250YWluZXIsICQoJ2RpdicpKTtcblx0XHRcdGNvbnN0IGFmdGVyQ29udGFpbmVyRm9jdXNFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLl9ob3ZlckNvbnRhaW5lciwgJCgnZGl2JykpO1xuXHRcdFx0YmVmb3JlQ29udGFpbmVyRm9jdXNFbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdGFmdGVyQ29udGFpbmVyRm9jdXNFbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYWZ0ZXJDb250YWluZXJGb2N1c0VsZW1lbnQsICdmb2N1cycsIChlKSA9PiB7XG5cdFx0XHRcdGZpcnN0Q29udGFpbmVyRm9jdXNFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYmVmb3JlQ29udGFpbmVyRm9jdXNFbGVtZW50LCAnZm9jdXMnLCAoZSkgPT4ge1xuXHRcdFx0XHRsYXN0Q29udGFpbmVyRm9jdXNFbGVtZW50LmZvY3VzKCk7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbmRMYXN0Rm9jdXNhYmxlQ2hpbGQocm9vdDogTm9kZSk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocm9vdC5oYXNDaGlsZE5vZGVzKCkpIHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcm9vdC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IG5vZGUgPSByb290LmNoaWxkTm9kZXMuaXRlbShyb290LmNoaWxkTm9kZXMubGVuZ3RoIC0gaSAtIDEpO1xuXHRcdFx0XHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gbm9kZS5FTEVNRU5UX05PREUpIHtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWROb2RlID0gbm9kZSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIHBhcnNlZE5vZGUudGFiSW5kZXggPT09ICdudW1iZXInICYmIHBhcnNlZE5vZGUudGFiSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHBhcnNlZE5vZGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlY3Vyc2l2ZWx5Rm91bmRFbGVtZW50ID0gdGhpcy5maW5kTGFzdEZvY3VzYWJsZUNoaWxkKG5vZGUpO1xuXHRcdFx0XHRpZiAocmVjdXJzaXZlbHlGb3VuZEVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcmVjdXJzaXZlbHlGb3VuZEVsZW1lbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9ob3ZlckNvbnRhaW5lcik7XG5cdFx0Y29uc3QgaG92ZXJGb2N1c2VkID0gdGhpcy5faG92ZXJDb250YWluZXIuY29udGFpbnModGhpcy5faG92ZXJDb250YWluZXIub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50KTtcblx0XHRjb25zdCBhY2Nlc3NpYmxlVmlld0hpbnQgPSBob3ZlckZvY3VzZWQgJiYgZ2V0SG92ZXJBY2Nlc3NpYmxlVmlld0hpbnQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmhvdmVyJykgPT09IHRydWUgJiYgdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnZWRpdG9yLmFjdGlvbi5hY2Nlc3NpYmxlVmlldycpPy5nZXRBcmlhTGFiZWwoKSk7XG5cdFx0aWYgKGFjY2Vzc2libGVWaWV3SGludCkge1xuXG5cdFx0XHRzdGF0dXMoYWNjZXNzaWJsZVZpZXdIaW50KTtcblx0XHR9XG5cdFx0dGhpcy5sYXlvdXQoKTtcblx0XHR0aGlzLmFkZEZvY3VzVHJhcCgpO1xuXHR9XG5cblx0cHVibGljIGxheW91dCgpIHtcblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgbW91c2VvdXQgdGltZXJzIHNpbmNlIHRoZSBob3ZlciBpcyBiZWluZ1xuXHRcdC8vIHJlcG9zaXRpb25lZCAoZS5nLiBkdWUgdG8gY29udGVudCByZXNpemUgZnJvbSBjb2xsYXBzaWJsZSBzZWN0aW9ucykuXG5cdFx0Ly8gVGhlIG1vdXNlIG1heSBlbmQgdXAgYmFjayBpbnNpZGUgdGhlIGhvdmVyIGFmdGVyIHRoZSBsYXlvdXQuXG5cdFx0dGhpcy5fbW91c2VUcmFja2VyPy5zdXBwcmVzc1BlbmRpbmdNb3VzZU91dCgpO1xuXHRcdGlmICh0aGlzLl9sb2NrTW91c2VUcmFja2VyICE9PSB0aGlzLl9tb3VzZVRyYWNrZXIpIHtcblx0XHRcdHRoaXMuX2xvY2tNb3VzZVRyYWNrZXI/LnN1cHByZXNzUGVuZGluZ01vdXNlT3V0KCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKCdyaWdodC1hbGlnbmVkJyk7XG5cdFx0dGhpcy5faG92ZXIuY29udGVudHNEb21Ob2RlLnN0eWxlLm1heEhlaWdodCA9ICcnO1xuXG5cdFx0Y29uc3QgZ2V0Wm9vbUFjY291bnRlZEJvdW5kaW5nQ2xpZW50UmVjdCA9IChlOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0Y29uc3Qgem9vbSA9IGRvbS5nZXREb21Ob2RlWm9vbUxldmVsKGUpO1xuXG5cdFx0XHRjb25zdCBib3VuZGluZ1JlY3QgPSBlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9wOiBib3VuZGluZ1JlY3QudG9wICogem9vbSxcblx0XHRcdFx0Ym90dG9tOiBib3VuZGluZ1JlY3QuYm90dG9tICogem9vbSxcblx0XHRcdFx0cmlnaHQ6IGJvdW5kaW5nUmVjdC5yaWdodCAqIHpvb20sXG5cdFx0XHRcdGxlZnQ6IGJvdW5kaW5nUmVjdC5sZWZ0ICogem9vbSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRhcmdldEJvdW5kcyA9IHRoaXMuX3RhcmdldC50YXJnZXRFbGVtZW50cy5tYXAoZSA9PiBnZXRab29tQWNjb3VudGVkQm91bmRpbmdDbGllbnRSZWN0KGUpKTtcblx0XHRjb25zdCB7IHRvcCwgcmlnaHQsIGJvdHRvbSwgbGVmdCB9ID0gdGFyZ2V0Qm91bmRzWzBdO1xuXHRcdGNvbnN0IHdpZHRoID0gcmlnaHQgLSBsZWZ0O1xuXHRcdGNvbnN0IGhlaWdodCA9IGJvdHRvbSAtIHRvcDtcblxuXHRcdGNvbnN0IHRhcmdldFJlY3Q6IFRhcmdldFJlY3QgPSB7XG5cdFx0XHR0b3AsIHJpZ2h0LCBib3R0b20sIGxlZnQsIHdpZHRoLCBoZWlnaHQsXG5cdFx0XHRjZW50ZXI6IHtcblx0XHRcdFx0eDogbGVmdCArICh3aWR0aCAvIDIpLFxuXHRcdFx0XHR5OiB0b3AgKyAoaGVpZ2h0IC8gMilcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Ly8gVGhlc2UgY2FsbHMgYWRqdXN0IHRoZSBwb3NpdGlvbiBkZXBlbmRpbmcgb24gc3BhY2luZy5cblx0XHR0aGlzLmFkanVzdEhvcml6b250YWxIb3ZlclBvc2l0aW9uKHRhcmdldFJlY3QpO1xuXHRcdHRoaXMuYWRqdXN0VmVydGljYWxIb3ZlclBvc2l0aW9uKHRhcmdldFJlY3QpO1xuXHRcdC8vIFRoaXMgY2FsbCBsaW1pdHMgdGhlIG1heGltdW0gaGVpZ2h0IG9mIHRoZSBob3Zlci5cblx0XHR0aGlzLmFkanVzdEhvdmVyTWF4SGVpZ2h0KHRhcmdldFJlY3QpO1xuXG5cdFx0Ly8gT2Zmc2V0IHRoZSBob3ZlciBwb3NpdGlvbiBpZiB0aGVyZSBpcyBhIHBvaW50ZXIgc28gaXQgYWxpZ25zIHdpdGggdGhlIHRhcmdldCBlbGVtZW50XG5cdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcnO1xuXHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLm1hcmdpbiA9ICcnO1xuXHRcdGlmICh0aGlzLl9ob3ZlclBvaW50ZXIpIHtcblx0XHRcdHN3aXRjaCAodGhpcy5faG92ZXJQb3NpdGlvbikge1xuXHRcdFx0XHRjYXNlIEhvdmVyUG9zaXRpb24uUklHSFQ6XG5cdFx0XHRcdFx0dGFyZ2V0UmVjdC5sZWZ0ICs9IENvbnN0YW50cy5Qb2ludGVyU2l6ZTtcblx0XHRcdFx0XHR0YXJnZXRSZWN0LnJpZ2h0ICs9IENvbnN0YW50cy5Qb2ludGVyU2l6ZTtcblx0XHRcdFx0XHR0aGlzLl9ob3ZlckNvbnRhaW5lci5zdHlsZS5wYWRkaW5nTGVmdCA9IGAke0NvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUubWFyZ2luTGVmdCA9IGAkey1Db25zdGFudHMuUG9pbnRlclNpemV9cHhgO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEhvdmVyUG9zaXRpb24uTEVGVDpcblx0XHRcdFx0XHR0YXJnZXRSZWN0LmxlZnQgLT0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXHRcdFx0XHRcdHRhcmdldFJlY3QucmlnaHQgLT0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLnBhZGRpbmdSaWdodCA9IGAke0NvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUubWFyZ2luUmlnaHQgPSBgJHstQ29uc3RhbnRzLlBvaW50ZXJTaXplfXB4YDtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBIb3ZlclBvc2l0aW9uLkJFTE9XOlxuXHRcdFx0XHRcdHRhcmdldFJlY3QudG9wICs9IENvbnN0YW50cy5Qb2ludGVyU2l6ZTtcblx0XHRcdFx0XHR0YXJnZXRSZWN0LmJvdHRvbSArPSBDb25zdGFudHMuUG9pbnRlclNpemU7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUucGFkZGluZ1RvcCA9IGAke0NvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0dGhpcy5faG92ZXJDb250YWluZXIuc3R5bGUubWFyZ2luVG9wID0gYCR7LUNvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgSG92ZXJQb3NpdGlvbi5BQk9WRTpcblx0XHRcdFx0XHR0YXJnZXRSZWN0LnRvcCAtPSBDb25zdGFudHMuUG9pbnRlclNpemU7XG5cdFx0XHRcdFx0dGFyZ2V0UmVjdC5ib3R0b20gLT0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLnBhZGRpbmdCb3R0b20gPSBgJHtDb25zdGFudHMuUG9pbnRlclNpemV9cHhgO1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyQ29udGFpbmVyLnN0eWxlLm1hcmdpbkJvdHRvbSA9IGAkey1Db25zdGFudHMuUG9pbnRlclNpemV9cHhgO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHR0YXJnZXRSZWN0LmNlbnRlci54ID0gdGFyZ2V0UmVjdC5sZWZ0ICsgKHdpZHRoIC8gMik7XG5cdFx0XHR0YXJnZXRSZWN0LmNlbnRlci55ID0gdGFyZ2V0UmVjdC50b3AgKyAoaGVpZ2h0IC8gMik7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb21wdXRlWENvcmRpbmF0ZSh0YXJnZXRSZWN0KTtcblx0XHR0aGlzLmNvbXB1dGVZQ29yZGluYXRlKHRhcmdldFJlY3QpO1xuXG5cdFx0aWYgKHRoaXMuX2hvdmVyUG9pbnRlcikge1xuXHRcdFx0Ly8gcmVzZXRcblx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5jbGFzc0xpc3QucmVtb3ZlKCd0b3AnKTtcblx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5jbGFzc0xpc3QucmVtb3ZlKCdsZWZ0Jyk7XG5cdFx0XHR0aGlzLl9ob3ZlclBvaW50ZXIuY2xhc3NMaXN0LnJlbW92ZSgncmlnaHQnKTtcblx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5jbGFzc0xpc3QucmVtb3ZlKCdib3R0b20nKTtcblxuXHRcdFx0dGhpcy5zZXRIb3ZlclBvaW50ZXJQb3NpdGlvbih0YXJnZXRSZWN0KTtcblx0XHR9XG5cdFx0dGhpcy5faG92ZXIub25Db250ZW50c0NoYW5nZWQoKTtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZVhDb3JkaW5hdGUodGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0Y29uc3QgaG92ZXJXaWR0aCA9IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggKyBDb25zdGFudHMuSG92ZXJCb3JkZXJXaWR0aDtcblxuXHRcdGlmICh0aGlzLl90YXJnZXQueCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl94ID0gdGhpcy5fdGFyZ2V0Lng7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5SSUdIVCkge1xuXHRcdFx0dGhpcy5feCA9IHRhcmdldC5yaWdodDtcblx0XHR9XG5cblx0XHRlbHNlIGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkxFRlQpIHtcblx0XHRcdHRoaXMuX3ggPSB0YXJnZXQubGVmdCAtIGhvdmVyV2lkdGg7XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5faG92ZXJQb2ludGVyKSB7XG5cdFx0XHRcdHRoaXMuX3ggPSB0YXJnZXQuY2VudGVyLnggLSAodGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRXaWR0aCAvIDIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5feCA9IHRhcmdldC5sZWZ0O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIb3ZlciBpcyBnb2luZyBiZXlvbmQgd2luZG93IHRvd2FyZHMgcmlnaHQgZW5kXG5cdFx0XHRpZiAodGhpcy5feCArIGhvdmVyV2lkdGggPj0gdGhpcy5fdGFyZ2V0RG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoKSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xhc3NMaXN0LmFkZCgncmlnaHQtYWxpZ25lZCcpO1xuXHRcdFx0XHR0aGlzLl94ID0gTWF0aC5tYXgodGhpcy5fdGFyZ2V0RG9jdW1lbnRFbGVtZW50LmNsaWVudFdpZHRoIC0gaG92ZXJXaWR0aCAtIENvbnN0YW50cy5Ib3ZlcldpbmRvd0VkZ2VNYXJnaW4sIHRoaXMuX3RhcmdldERvY3VtZW50RWxlbWVudC5jbGllbnRMZWZ0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIb3ZlciBpcyBnb2luZyBiZXlvbmQgd2luZG93IHRvd2FyZHMgbGVmdCBlbmRcblx0XHRpZiAodGhpcy5feCA8IHRoaXMuX3RhcmdldERvY3VtZW50RWxlbWVudC5jbGllbnRMZWZ0KSB7XG5cdFx0XHR0aGlzLl94ID0gdGFyZ2V0LmxlZnQgKyBDb25zdGFudHMuSG92ZXJXaW5kb3dFZGdlTWFyZ2luO1xuXHRcdH1cblxuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlWUNvcmRpbmF0ZSh0YXJnZXQ6IFRhcmdldFJlY3QpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fdGFyZ2V0LnkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5feSA9IHRoaXMuX3RhcmdldC55O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHRoaXMuX2hvdmVyUG9zaXRpb24gPT09IEhvdmVyUG9zaXRpb24uQUJPVkUpIHtcblx0XHRcdHRoaXMuX3kgPSB0YXJnZXQudG9wO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHRoaXMuX2hvdmVyUG9zaXRpb24gPT09IEhvdmVyUG9zaXRpb24uQkVMT1cpIHtcblx0XHRcdHRoaXMuX3kgPSB0YXJnZXQuYm90dG9tIC0gMjtcblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdGlmICh0aGlzLl9ob3ZlclBvaW50ZXIpIHtcblx0XHRcdFx0dGhpcy5feSA9IHRhcmdldC5jZW50ZXIueSArICh0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsaWVudEhlaWdodCAvIDIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5feSA9IHRhcmdldC5ib3R0b207XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSG92ZXIgb24gYm90dG9tIGlzIGdvaW5nIGJleW9uZCB3aW5kb3dcblx0XHRpZiAodGhpcy5feSA+IHRoaXMuX3RhcmdldFdpbmRvdy5pbm5lckhlaWdodCkge1xuXHRcdFx0dGhpcy5feSA9IHRhcmdldC5ib3R0b207XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGp1c3RIb3Jpem9udGFsSG92ZXJQb3NpdGlvbih0YXJnZXQ6IFRhcmdldFJlY3QpOiB2b2lkIHtcblx0XHQvLyBEbyBub3QgYWRqdXN0IGhvcml6b250YWwgaG92ZXIgcG9zaXRpb24gaWYgeCBjb3JkaWFudGUgaXMgcHJvdmlkZWRcblx0XHRpZiAodGhpcy5fdGFyZ2V0LnggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVyUG9pbnRlck9mZnNldCA9ICh0aGlzLl9ob3ZlclBvaW50ZXIgPyBDb25zdGFudHMuUG9pbnRlclNpemUgOiAwKTtcblxuXHRcdC8vIFdoZW4gZm9yY2UgcG9zaXRpb24gaXMgZW5hYmxlZCwgcmVzdHJpY3QgbWF4IHdpZHRoXG5cdFx0aWYgKHRoaXMuX2ZvcmNlUG9zaXRpb24pIHtcblx0XHRcdGNvbnN0IHBhZGRpbmcgPSBob3ZlclBvaW50ZXJPZmZzZXQgKyBDb25zdGFudHMuSG92ZXJCb3JkZXJXaWR0aDtcblx0XHRcdGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUubWF4V2lkdGggPSBgJHt0aGlzLl90YXJnZXREb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGggLSB0YXJnZXQucmlnaHQgLSBwYWRkaW5nfXB4YDtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5MRUZUKSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuc3R5bGUubWF4V2lkdGggPSBgJHt0YXJnZXQubGVmdCAtIHBhZGRpbmd9cHhgO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFBvc2l0aW9uIGhvdmVyIG9uIHJpZ2h0IHRvIHRhcmdldFxuXHRcdGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLlJJR0hUKSB7XG5cdFx0XHRjb25zdCByb29tT25SaWdodCA9IHRoaXMuX3RhcmdldERvY3VtZW50RWxlbWVudC5jbGllbnRXaWR0aCAtIHRhcmdldC5yaWdodDtcblx0XHRcdC8vIEhvdmVyIG9uIHRoZSByaWdodCBpcyBnb2luZyBiZXlvbmQgd2luZG93LlxuXHRcdFx0aWYgKHJvb21PblJpZ2h0IDwgdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRXaWR0aCArIGhvdmVyUG9pbnRlck9mZnNldCkge1xuXHRcdFx0XHRjb25zdCByb29tT25MZWZ0ID0gdGFyZ2V0LmxlZnQ7XG5cdFx0XHRcdC8vIFRoZXJlJ3MgZW5vdWdoIHJvb20gb24gdGhlIGxlZnQsIGZsaXAgdGhlIGhvdmVyIHBvc2l0aW9uXG5cdFx0XHRcdGlmIChyb29tT25MZWZ0ID49IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggKyBob3ZlclBvaW50ZXJPZmZzZXQpIHtcblx0XHRcdFx0XHR0aGlzLl9ob3ZlclBvc2l0aW9uID0gSG92ZXJQb3NpdGlvbi5MRUZUO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhvdmVyIG9uIHRoZSBsZWZ0IHdvdWxkIGdvIGJleW9uZCB3aW5kb3cgdG9vXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9zaXRpb24gPSBIb3ZlclBvc2l0aW9uLkJFTE9XO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIFBvc2l0aW9uIGhvdmVyIG9uIGxlZnQgdG8gdGFyZ2V0XG5cdFx0ZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5MRUZUKSB7XG5cblx0XHRcdGNvbnN0IHJvb21PbkxlZnQgPSB0YXJnZXQubGVmdDtcblx0XHRcdC8vIEhvdmVyIG9uIHRoZSBsZWZ0IGlzIGdvaW5nIGJleW9uZCB3aW5kb3cuXG5cdFx0XHRpZiAocm9vbU9uTGVmdCA8IHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggKyBob3ZlclBvaW50ZXJPZmZzZXQpIHtcblx0XHRcdFx0Y29uc3Qgcm9vbU9uUmlnaHQgPSB0aGlzLl90YXJnZXREb2N1bWVudEVsZW1lbnQuY2xpZW50V2lkdGggLSB0YXJnZXQucmlnaHQ7XG5cdFx0XHRcdC8vIFRoZXJlJ3MgZW5vdWdoIHJvb20gb24gdGhlIHJpZ2h0LCBmbGlwIHRoZSBob3ZlciBwb3NpdGlvblxuXHRcdFx0XHRpZiAocm9vbU9uUmlnaHQgPj0gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRXaWR0aCArIGhvdmVyUG9pbnRlck9mZnNldCkge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9zaXRpb24gPSBIb3ZlclBvc2l0aW9uLlJJR0hUO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhvdmVyIG9uIHRoZSByaWdodCB3b3VsZCBnbyBiZXlvbmQgd2luZG93IHRvb1xuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9ob3ZlclBvc2l0aW9uID0gSG92ZXJQb3NpdGlvbi5CRUxPVztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gSG92ZXIgb24gdGhlIGxlZnQgaXMgZ29pbmcgYmV5b25kIHdpbmRvdy5cblx0XHRcdGlmICh0YXJnZXQubGVmdCAtIHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUuY2xpZW50V2lkdGggLSBob3ZlclBvaW50ZXJPZmZzZXQgPD0gdGhpcy5fdGFyZ2V0RG9jdW1lbnRFbGVtZW50LmNsaWVudExlZnQpIHtcblx0XHRcdFx0dGhpcy5faG92ZXJQb3NpdGlvbiA9IEhvdmVyUG9zaXRpb24uUklHSFQ7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZGp1c3RWZXJ0aWNhbEhvdmVyUG9zaXRpb24odGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0Ly8gRG8gbm90IGFkanVzdCB2ZXJ0aWNhbCBob3ZlciBwb3NpdGlvbiBpZiB0aGUgeSBjb29yZGluYXRlIGlzIHByb3ZpZGVkXG5cdFx0Ly8gb3IgdGhlIHBvc2l0aW9uIGlzIGZvcmNlZFxuXHRcdGlmICh0aGlzLl90YXJnZXQueSAhPT0gdW5kZWZpbmVkIHx8IHRoaXMuX2ZvcmNlUG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBob3ZlclBvaW50ZXJPZmZzZXQgPSAodGhpcy5faG92ZXJQb2ludGVyID8gQ29uc3RhbnRzLlBvaW50ZXJTaXplIDogMCk7XG5cblx0XHQvLyBQb3NpdGlvbiBob3ZlciBvbiB0b3Agb2YgdGhlIHRhcmdldFxuXHRcdGlmICh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkFCT1ZFKSB7XG5cdFx0XHQvLyBIb3ZlciBvbiB0b3AgaXMgZ29pbmcgYmV5b25kIHdpbmRvd1xuXHRcdFx0aWYgKHRhcmdldC50b3AgLSB0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsaWVudEhlaWdodCAtIGhvdmVyUG9pbnRlck9mZnNldCA8IDApIHtcblx0XHRcdFx0dGhpcy5faG92ZXJQb3NpdGlvbiA9IEhvdmVyUG9zaXRpb24uQkVMT1c7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUG9zaXRpb24gaG92ZXIgYmVsb3cgdGhlIHRhcmdldFxuXHRcdGVsc2UgaWYgKHRoaXMuX2hvdmVyUG9zaXRpb24gPT09IEhvdmVyUG9zaXRpb24uQkVMT1cpIHtcblx0XHRcdC8vIEhvdmVyIG9uIGJvdHRvbSBpcyBnb2luZyBiZXlvbmQgd2luZG93XG5cdFx0XHRpZiAodGFyZ2V0LmJvdHRvbSArIHRoaXMuX2hvdmVyLmNvbnRhaW5lckRvbU5vZGUub2Zmc2V0SGVpZ2h0ICsgaG92ZXJQb2ludGVyT2Zmc2V0ID4gdGhpcy5fdGFyZ2V0V2luZG93LmlubmVySGVpZ2h0KSB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyUG9zaXRpb24gPSBIb3ZlclBvc2l0aW9uLkFCT1ZFO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYWRqdXN0SG92ZXJNYXhIZWlnaHQodGFyZ2V0OiBUYXJnZXRSZWN0KTogdm9pZCB7XG5cdFx0bGV0IG1heEhlaWdodCA9IHRoaXMuX3RhcmdldFdpbmRvdy5pbm5lckhlaWdodCAqIHRoaXMuX21heEhlaWdodFJhdGlvUmVsYXRpdmVUb1dpbmRvdztcblxuXHRcdC8vIFdoZW4gZm9yY2UgcG9zaXRpb24gaXMgZW5hYmxlZCwgcmVzdHJpY3QgbWF4IGhlaWdodFxuXHRcdGlmICh0aGlzLl9mb3JjZVBvc2l0aW9uKSB7XG5cdFx0XHRjb25zdCBwYWRkaW5nID0gKHRoaXMuX2hvdmVyUG9pbnRlciA/IENvbnN0YW50cy5Qb2ludGVyU2l6ZSA6IDApICsgQ29uc3RhbnRzLkhvdmVyQm9yZGVyV2lkdGg7XG5cdFx0XHRpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5BQk9WRSkge1xuXHRcdFx0XHRtYXhIZWlnaHQgPSBNYXRoLm1pbihtYXhIZWlnaHQsIHRhcmdldC50b3AgLSBwYWRkaW5nKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5CRUxPVykge1xuXHRcdFx0XHRtYXhIZWlnaHQgPSBNYXRoLm1pbihtYXhIZWlnaHQsIHRoaXMuX3RhcmdldFdpbmRvdy5pbm5lckhlaWdodCAtIHRhcmdldC5ib3R0b20gLSBwYWRkaW5nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLnN0eWxlLm1heEhlaWdodCA9IGAke21heEhlaWdodH1weGA7XG5cdFx0aWYgKHRoaXMuX2hvdmVyLmNvbnRlbnRzRG9tTm9kZS5jbGllbnRIZWlnaHQgPCB0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuc2Nyb2xsSGVpZ2h0KSB7XG5cdFx0XHQvLyBBZGQgcGFkZGluZyBmb3IgYSB2ZXJ0aWNhbCBzY3JvbGxiYXJcblx0XHRcdGNvbnN0IGV4dHJhUmlnaHRQYWRkaW5nID0gYCR7dGhpcy5faG92ZXIuc2Nyb2xsYmFyLm9wdGlvbnMudmVydGljYWxTY3JvbGxiYXJTaXplfXB4YDtcblx0XHRcdGlmICh0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuc3R5bGUucGFkZGluZ1JpZ2h0ICE9PSBleHRyYVJpZ2h0UGFkZGluZykge1xuXHRcdFx0XHR0aGlzLl9ob3Zlci5jb250ZW50c0RvbU5vZGUuc3R5bGUucGFkZGluZ1JpZ2h0ID0gZXh0cmFSaWdodFBhZGRpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRIb3ZlclBvaW50ZXJQb3NpdGlvbih0YXJnZXQ6IFRhcmdldFJlY3QpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hvdmVyUG9pbnRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN3aXRjaCAodGhpcy5faG92ZXJQb3NpdGlvbikge1xuXHRcdFx0Y2FzZSBIb3ZlclBvc2l0aW9uLkxFRlQ6XG5cdFx0XHRjYXNlIEhvdmVyUG9zaXRpb24uUklHSFQ6IHtcblx0XHRcdFx0dGhpcy5faG92ZXJQb2ludGVyLmNsYXNzTGlzdC5hZGQodGhpcy5faG92ZXJQb3NpdGlvbiA9PT0gSG92ZXJQb3NpdGlvbi5MRUZUID8gJ3JpZ2h0JyA6ICdsZWZ0Jyk7XG5cdFx0XHRcdGNvbnN0IGhvdmVySGVpZ2h0ID0gdGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5jbGllbnRIZWlnaHQ7XG5cblx0XHRcdFx0Ly8gSWYgaG92ZXIgaXMgdGFsbGVyIHRoYW4gdGFyZ2V0LCB0aGVuIHNob3cgdGhlIHBvaW50ZXIgYXQgdGhlIGNlbnRlciBvZiB0YXJnZXRcblx0XHRcdFx0aWYgKGhvdmVySGVpZ2h0ID4gdGFyZ2V0LmhlaWdodCkge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5zdHlsZS50b3AgPSBgJHt0YXJnZXQuY2VudGVyLnkgLSAodGhpcy5feSAtIGhvdmVySGVpZ2h0KSAtIENvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBPdGhlcndpc2Ugc2hvdyB0aGUgcG9pbnRlciBhdCB0aGUgY2VudGVyIG9mIGhvdmVyXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2hvdmVyUG9pbnRlci5zdHlsZS50b3AgPSBgJHtNYXRoLnJvdW5kKChob3ZlckhlaWdodCAvIDIpKSAtIENvbnN0YW50cy5Qb2ludGVyU2l6ZX1weGA7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgSG92ZXJQb3NpdGlvbi5BQk9WRTpcblx0XHRcdGNhc2UgSG92ZXJQb3NpdGlvbi5CRUxPVzoge1xuXHRcdFx0XHR0aGlzLl9ob3ZlclBvaW50ZXIuY2xhc3NMaXN0LmFkZCh0aGlzLl9ob3ZlclBvc2l0aW9uID09PSBIb3ZlclBvc2l0aW9uLkFCT1ZFID8gJ2JvdHRvbScgOiAndG9wJyk7XG5cdFx0XHRcdGNvbnN0IGhvdmVyV2lkdGggPSB0aGlzLl9ob3Zlci5jb250YWluZXJEb21Ob2RlLmNsaWVudFdpZHRoO1xuXG5cdFx0XHRcdC8vIFBvc2l0aW9uIHBvaW50ZXIgYXQgdGhlIGNlbnRlciBvZiB0aGUgaG92ZXJcblx0XHRcdFx0bGV0IHBvaW50ZXJMZWZ0UG9zaXRpb24gPSBNYXRoLnJvdW5kKChob3ZlcldpZHRoIC8gMikpIC0gQ29uc3RhbnRzLlBvaW50ZXJTaXplO1xuXG5cdFx0XHRcdC8vIElmIHBvaW50ZXIgZ29lcyBiZXlvbmQgdGFyZ2V0IHRoZW4gcG9zaXRpb24gaXQgYXQgdGhlIGNlbnRlciBvZiB0aGUgdGFyZ2V0XG5cdFx0XHRcdGNvbnN0IHBvaW50ZXJYID0gdGhpcy5feCArIHBvaW50ZXJMZWZ0UG9zaXRpb247XG5cdFx0XHRcdGlmIChwb2ludGVyWCA8IHRhcmdldC5sZWZ0IHx8IHBvaW50ZXJYID4gdGFyZ2V0LnJpZ2h0KSB7XG5cdFx0XHRcdFx0cG9pbnRlckxlZnRQb3NpdGlvbiA9IHRhcmdldC5jZW50ZXIueCAtIHRoaXMuX3ggLSBDb25zdGFudHMuUG9pbnRlclNpemU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9ob3ZlclBvaW50ZXIuc3R5bGUubGVmdCA9IGAke3BvaW50ZXJMZWZ0UG9zaXRpb259cHhgO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKSB7XG5cdFx0dGhpcy5faG92ZXIuY29udGFpbmVyRG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX29uRGlzcG9zZS5maXJlKCk7XG5cdFx0XHR0aGlzLl90YXJnZXQuZGlzcG9zZT8uKCk7XG5cdFx0XHR0aGlzLl9ob3ZlckNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdHRoaXMuX21lc3NhZ2VMaXN0ZW5lcnMuZGlzcG9zZSgpO1xuXHRcdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0fVxufVxuXG5jbGFzcyBDb21wb3NpdGVNb3VzZVRyYWNrZXIgZXh0ZW5kcyBXaWRnZXQge1xuXHRwcml2YXRlIF9pc01vdXNlSW46IGJvb2xlYW4gPSB0cnVlO1xuXHRwcml2YXRlIF9zdXBwcmVzc05leHRNb3VzZU91dDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb3VzZVRpbWVyOiBNdXRhYmxlRGlzcG9zYWJsZTxUaW1lb3V0VGltZXI+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTW91c2VPdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uTW91c2VPdXQoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy5fb25Nb3VzZU91dC5ldmVudDsgfVxuXG5cdGdldCBpc01vdXNlSW4oKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc01vdXNlSW47IH1cblxuXHQvKipcblx0ICogQHBhcmFtIF9lbGVtZW50cyBUaGUgdGFyZ2V0IGVsZW1lbnRzIHRvIHRyYWNrIG1vdXNlIGluL291dCBldmVudHMgb24uXG5cdCAqIEBwYXJhbSBfZXZlbnREZWJvdW5jZURlbGF5IFRoZSBkZWxheSBpbiBtcyB0byBkZWJvdW5jZSB0aGUgZXZlbnQgZmlyaW5nLiBUaGlzIGlzIHVzZWQgdG9cblx0ICogYWxsb3cgYSBzaG9ydCBwZXJpb2QgZm9yIHRoZSBtb3VzZSB0byBtb3ZlIGludG8gdGhlIGhvdmVyIG9yIGEgbmVhcmJ5IHRhcmdldCBlbGVtZW50LiBGb3Jcblx0ICogZXhhbXBsZSBob3ZlcmluZyBhIHNjcm9sbCBiYXIgd2lsbCBub3QgaGlkZSB0aGUgaG92ZXIgaW1tZWRpYXRlbHkuXG5cdCAqL1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF9lbGVtZW50czogSFRNTEVsZW1lbnRbXSxcblx0XHRwcml2YXRlIF9ldmVudERlYm91bmNlRGVsYXk6IG51bWJlciA9IDIwMFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuX2VsZW1lbnRzKSB7XG5cdFx0XHR0aGlzLm9ubW91c2VvdmVyKGVsZW1lbnQsICgpID0+IHRoaXMuX29uVGFyZ2V0TW91c2VPdmVyKCkpO1xuXHRcdFx0dGhpcy5vbm1vdXNlbGVhdmUoZWxlbWVudCwgKCkgPT4gdGhpcy5fb25UYXJnZXRNb3VzZUxlYXZlKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uVGFyZ2V0TW91c2VPdmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzTW91c2VJbiA9IHRydWU7XG5cdFx0dGhpcy5fc3VwcHJlc3NOZXh0TW91c2VPdXQgPSBmYWxzZTtcblx0XHR0aGlzLl9tb3VzZVRpbWVyLmNsZWFyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblRhcmdldE1vdXNlTGVhdmUoKTogdm9pZCB7XG5cdFx0dGhpcy5faXNNb3VzZUluID0gZmFsc2U7XG5cdFx0Ly8gRXZhbHVhdGUgd2hldGhlciB0aGUgbW91c2UgaXMgc3RpbGwgb3V0c2lkZSBhc3luY2hyb25vdXNseSBzdWNoIHRoYXQgb3RoZXIgbW91c2UgdGFyZ2V0c1xuXHRcdC8vIGhhdmUgdGhlIG9wcG9ydHVuaXR5IHRvIGZpcnN0IHRoZWlyIG1vdXNlIGluIGV2ZW50LlxuXHRcdHRoaXMuX21vdXNlVGltZXIudmFsdWUgPSBuZXcgVGltZW91dFRpbWVyKCgpID0+IHRoaXMuX2ZpcmVJZk1vdXNlT3V0c2lkZSgpLCB0aGlzLl9ldmVudERlYm91bmNlRGVsYXkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZUlmTW91c2VPdXRzaWRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNNb3VzZUluICYmICF0aGlzLl9zdXBwcmVzc05leHRNb3VzZU91dCkge1xuXHRcdFx0dGhpcy5fb25Nb3VzZU91dC5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFN1cHByZXNzZXMgdGhlIG5leHQgcGVuZGluZyBtb3VzZW91dCBkaXNtaXNzYWwuIENhbGwgdGhpcyB3aGVuIHRyYWNrZWRcblx0ICogZWxlbWVudHMgYXJlIGJlaW5nIHJlc2l6ZWQgb3IgcmVwb3NpdGlvbmVkIHRvIGF2b2lkIHNwdXJpb3VzIGRpc21pc3NhbHNcblx0ICogY2F1c2VkIGJ5IHRoZSBlbGVtZW50IHNocmlua2luZyBhd2F5IGZyb20gdGhlIGN1cnNvci4gVGhlIHN1cHByZXNzaW9uXG5cdCAqIGlzIGNsZWFyZWQgd2hlbiB0aGUgbW91c2UgbmV4dCBlbnRlcnMgYSB0cmFja2VkIGVsZW1lbnQuXG5cdCAqL1xuXHRzdXBwcmVzc1BlbmRpbmdNb3VzZU91dCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2lzTW91c2VJbikge1xuXHRcdFx0dGhpcy5fc3VwcHJlc3NOZXh0TW91c2VPdXQgPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBZGRzIGFuIGVsZW1lbnQgdG8gYmUgdHJhY2tlZCBieSB0aGlzIG1vdXNlIHRyYWNrZXIuIE1vdXNlIGV2ZW50cyBvbiB0aGlzXG5cdCAqIGVsZW1lbnQgd2lsbCBiZSBjb25zaWRlcmVkIGFzIGJlaW5nIFwiaW5zaWRlXCIgdGhlIHRyYWNrZWQgYXJlYS5cblx0ICovXG5cdGFkZEVsZW1lbnQoZWxlbWVudDogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMuX2VsZW1lbnRzLmluY2x1ZGVzKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblx0XHR0aGlzLl9lbGVtZW50cy5wdXNoKGVsZW1lbnQpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfT1ZFUiwgKCkgPT4gdGhpcy5fb25UYXJnZXRNb3VzZU92ZXIoKSkpO1xuXHRcdHN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHRoaXMuX29uVGFyZ2V0TW91c2VMZWF2ZSgpKSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2VsZW1lbnRzLmluZGV4T2YoZWxlbWVudCk7XG5cdFx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50cy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cbn1cblxuY2xhc3MgRWxlbWVudEhvdmVyVGFyZ2V0IGltcGxlbWVudHMgSUhvdmVyVGFyZ2V0IHtcblx0cmVhZG9ubHkgdGFyZ2V0RWxlbWVudHM6IHJlYWRvbmx5IEhUTUxFbGVtZW50W107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfZWxlbWVudDogSFRNTEVsZW1lbnRcblx0KSB7XG5cdFx0dGhpcy50YXJnZXRFbGVtZW50cyA9IFt0aGlzLl9lbGVtZW50XTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsWUFBWSxpQkFBOEIsbUJBQW1CLG9CQUFvQjtBQUMxRixTQUFnQixlQUFlO0FBQy9CLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhLGVBQWUsZUFBZSxpQkFBaUIsa0NBQWtDO0FBQ3ZHLFNBQVMsY0FBYztBQUN2QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBNEU7QUFDckYsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFFekIsTUFBTSxJQUFJLElBQUk7QUFXZCxJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFDQyxFQUFBQSxzQkFBQSxpQkFBYyxLQUFkO0FBQ0EsRUFBQUEsc0JBQUEsc0JBQW1CLEtBQW5CO0FBQ0EsRUFBQUEsc0JBQUEsMkJBQXdCLEtBQXhCO0FBSFUsU0FBQUE7QUFBQSxHQUFBO0FBTUosSUFBTSxjQUFOLGNBQTBCLE9BQStCO0FBQUEsRUFnRS9ELFlBQ0MsU0FDcUMsb0JBQ0csdUJBQ0csbUJBQ0gsdUJBQ3ZDO0FBQ0QsVUFBTTtBQUwrQjtBQUNHO0FBQ0c7QUFDSDtBQXBFekMsU0FBaUIsb0JBQW9CLElBQUksZ0JBQWdCO0FBU3pELFNBQVEsY0FBdUI7QUFFL0IsU0FBUSxpQkFBMEI7QUFDbEMsU0FBUSxL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
