import { getZoomFactor, isChrome } from "../../browser.js";
import * as dom from "../../dom.js";
import { createFastDomNode } from "../../fastDomNode.js";
import { StandardWheelEvent } from "../../mouseEvent.js";
import { HorizontalScrollbar } from "./horizontalScrollbar.js";
import { VerticalScrollbar } from "./verticalScrollbar.js";
import { Widget } from "../widget.js";
import { TimeoutTimer } from "../../../common/async.js";
import { Emitter } from "../../../common/event.js";
import { dispose } from "../../../common/lifecycle.js";
import * as platform from "../../../common/platform.js";
import { Scrollable, ScrollbarVisibility } from "../../../common/scrollable.js";
import "./media/scrollbars.css";
const HIDE_TIMEOUT = 500;
const SCROLL_WHEEL_SENSITIVITY = 50;
const SCROLL_WHEEL_SMOOTH_SCROLL_ENABLED = true;
const DEFAULT_SCROLLBAR_SIZE = 10;
let globalDefaultScrollbarSize = DEFAULT_SCROLLBAR_SIZE;
const _onDidChangeDefaultScrollbarSizeEmitter = new Emitter();
const onDidChangeDefaultScrollbarSize = _onDidChangeDefaultScrollbarSizeEmitter.event;
function setGlobalDefaultScrollbarSize(size) {
  if (size !== globalDefaultScrollbarSize) {
    globalDefaultScrollbarSize = size;
    _onDidChangeDefaultScrollbarSizeEmitter.fire(size);
  }
}
class MouseWheelClassifierItem {
  constructor(timestamp, deltaX, deltaY) {
    this.timestamp = timestamp;
    this.deltaX = deltaX;
    this.deltaY = deltaY;
    this.score = 0;
  }
}
const _MouseWheelClassifier = class _MouseWheelClassifier {
  constructor() {
    this._capacity = 5;
    this._memory = [];
    this._front = -1;
    this._rear = -1;
  }
  isPhysicalMouseWheel() {
    if (this._front === -1 && this._rear === -1) {
      return false;
    }
    let remainingInfluence = 1;
    let score = 0;
    let iteration = 1;
    let index = this._rear;
    do {
      const influence = index === this._front ? remainingInfluence : Math.pow(2, -iteration);
      remainingInfluence -= influence;
      score += this._memory[index].score * influence;
      if (index === this._front) {
        break;
      }
      index = (this._capacity + index - 1) % this._capacity;
      iteration++;
    } while (true);
    return score <= 0.5;
  }
  acceptStandardWheelEvent(e) {
    if (isChrome) {
      const targetWindow = dom.getWindow(e.browserEvent);
      const pageZoomFactor = getZoomFactor(targetWindow);
      this.accept(Date.now(), e.deltaX * pageZoomFactor, e.deltaY * pageZoomFactor);
    } else {
      this.accept(Date.now(), e.deltaX, e.deltaY);
    }
  }
  accept(timestamp, deltaX, deltaY) {
    let previousItem = null;
    const item = new MouseWheelClassifierItem(timestamp, deltaX, deltaY);
    if (this._front === -1 && this._rear === -1) {
      this._memory[0] = item;
      this._front = 0;
      this._rear = 0;
    } else {
      previousItem = this._memory[this._rear];
      this._rear = (this._rear + 1) % this._capacity;
      if (this._rear === this._front) {
        this._front = (this._front + 1) % this._capacity;
      }
      this._memory[this._rear] = item;
    }
    item.score = this._computeScore(item, previousItem);
  }
  /**
   * A score between 0 and 1 for `item`.
   *  - a score towards 0 indicates that the source appears to be a physical mouse wheel
   *  - a score towards 1 indicates that the source appears to be a touchpad or magic mouse, etc.
   */
  _computeScore(item, previousItem) {
    if (Math.abs(item.deltaX) > 0 && Math.abs(item.deltaY) > 0) {
      return 1;
    }
    let score = 0.5;
    if (!this._isAlmostInt(item.deltaX) || !this._isAlmostInt(item.deltaY)) {
      score += 0.25;
    }
    if (previousItem) {
      const absDeltaX = Math.abs(item.deltaX);
      const absDeltaY = Math.abs(item.deltaY);
      const absPreviousDeltaX = Math.abs(previousItem.deltaX);
      const absPreviousDeltaY = Math.abs(previousItem.deltaY);
      const minDeltaX = Math.max(Math.min(absDeltaX, absPreviousDeltaX), 1);
      const minDeltaY = Math.max(Math.min(absDeltaY, absPreviousDeltaY), 1);
      const maxDeltaX = Math.max(absDeltaX, absPreviousDeltaX);
      const maxDeltaY = Math.max(absDeltaY, absPreviousDeltaY);
      const isSameModulo = maxDeltaX % minDeltaX === 0 && maxDeltaY % minDeltaY === 0;
      if (isSameModulo) {
        score -= 0.5;
      }
    }
    return Math.min(Math.max(score, 0), 1);
  }
  _isAlmostInt(value) {
    const epsilon = Number.EPSILON * 100;
    const delta = Math.abs(Math.round(value) - value);
    return delta < 0.01 + epsilon;
  }
};
_MouseWheelClassifier.INSTANCE = new _MouseWheelClassifier();
let MouseWheelClassifier = _MouseWheelClassifier;
class AbstractScrollableElement extends Widget {
  constructor(element, options, scrollable) {
    super();
    this._inertialTimeout = null;
    this._inertialSpeed = { X: 0, Y: 0 };
    this._onScroll = this._register(new Emitter());
    this._onWillScroll = this._register(new Emitter());
    element.style.overflow = "hidden";
    this._options = resolveOptions(options);
    this._scrollable = scrollable;
    this._register(this._scrollable.onScroll((e) => {
      this._onWillScroll.fire(e);
      this._onDidScroll(e);
      this._onScroll.fire(e);
    }));
    const scrollbarHost = {
      onMouseWheel: (mouseWheelEvent) => this._onMouseWheel(mouseWheelEvent),
      onDragStart: () => this._onDragStart(),
      onDragEnd: () => this._onDragEnd()
    };
    this._verticalScrollbar = this._register(new VerticalScrollbar(this._scrollable, this._options, scrollbarHost));
    this._horizontalScrollbar = this._register(new HorizontalScrollbar(this._scrollable, this._options, scrollbarHost));
    this._domNode = document.createElement("div");
    this._domNode.className = "monaco-scrollable-element " + this._options.className;
    this._domNode.setAttribute("role", "presentation");
    this._domNode.style.position = "relative";
    this._domNode.style.overflow = "hidden";
    this._domNode.appendChild(element);
    this._domNode.appendChild(this._horizontalScrollbar.domNode.domNode);
    this._domNode.appendChild(this._verticalScrollbar.domNode.domNode);
    if (this._options.useShadows) {
      this._leftShadowDomNode = createFastDomNode(document.createElement("div"));
      this._leftShadowDomNode.setClassName("shadow");
      this._domNode.appendChild(this._leftShadowDomNode.domNode);
      this._topShadowDomNode = createFastDomNode(document.createElement("div"));
      this._topShadowDomNode.setClassName("shadow");
      this._domNode.appendChild(this._topShadowDomNode.domNode);
      this._topLeftShadowDomNode = createFastDomNode(document.createElement("div"));
      this._topLeftShadowDomNode.setClassName("shadow");
      this._domNode.appendChild(this._topLeftShadowDomNode.domNode);
    } else {
      this._leftShadowDomNode = null;
      this._topShadowDomNode = null;
      this._topLeftShadowDomNode = null;
    }
    this._listenOnDomNode = this._options.listenOnDomNode || this._domNode;
    this._mouseWheelToDispose = [];
    this._setListeningToMouseWheel(this._options.handleMouseWheel);
    this.onmouseover(this._listenOnDomNode, (e) => this._onMouseOver(e));
    this.onmouseleave(this._listenOnDomNode, (e) => this._onMouseLeave(e));
    this._hideTimeout = this._register(new TimeoutTimer());
    this._isDragging = false;
    this._mouseIsOver = false;
    this._shouldRender = true;
    this._revealOnScroll = true;
    const hSizeExplicit = typeof options.horizontalScrollbarSize !== "undefined";
    const vSizeExplicit = typeof options.verticalScrollbarSize !== "undefined";
    if (!hSizeExplicit || !vSizeExplicit) {
      this._register(onDidChangeDefaultScrollbarSize((newSize) => {
        this.updateOptions({
          ...!hSizeExplicit ? { horizontalScrollbarSize: newSize } : {},
          ...!vSizeExplicit ? { verticalScrollbarSize: newSize } : {}
        });
      }));
    }
  }
  get onScroll() {
    return this._onScroll.event;
  }
  get onWillScroll() {
    return this._onWillScroll.event;
  }
  get options() {
    return this._options;
  }
  dispose() {
    this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);
    if (this._inertialTimeout) {
      this._inertialTimeout.dispose();
      this._inertialTimeout = null;
    }
    super.dispose();
  }
  /**
   * Get the generated 'scrollable' dom node
   */
  getDomNode() {
    return this._domNode;
  }
  getOverviewRulerLayoutInfo() {
    return {
      parent: this._domNode,
      insertBefore: this._verticalScrollbar.domNode.domNode
    };
  }
  /**
   * Delegate a pointer down event to the vertical scrollbar.
   * This is to help with clicking somewhere else and having the scrollbar react.
   */
  delegateVerticalScrollbarPointerDown(browserEvent) {
    this._verticalScrollbar.delegatePointerDown(browserEvent);
  }
  getScrollDimensions() {
    return this._scrollable.getScrollDimensions();
  }
  setScrollDimensions(dimensions) {
    this._scrollable.setScrollDimensions(dimensions, false);
  }
  /**
   * Update the class name of the scrollable element.
   */
  updateClassName(newClassName) {
    this._options.className = newClassName;
    if (platform.isMacintosh) {
      this._options.className += " mac";
    }
    this._domNode.className = "monaco-scrollable-element " + this._options.className;
  }
  /**
   * Update configuration options for the scrollbar.
   */
  updateOptions(newOptions) {
    if (typeof newOptions.handleMouseWheel !== "undefined") {
      this._options.handleMouseWheel = newOptions.handleMouseWheel;
      this._setListeningToMouseWheel(this._options.handleMouseWheel);
    }
    if (typeof newOptions.mouseWheelScrollSensitivity !== "undefined") {
      this._options.mouseWheelScrollSensitivity = newOptions.mouseWheelScrollSensitivity;
    }
    if (typeof newOptions.fastScrollSensitivity !== "undefined") {
      this._options.fastScrollSensitivity = newOptions.fastScrollSensitivity;
    }
    if (typeof newOptions.scrollPredominantAxis !== "undefined") {
      this._options.scrollPredominantAxis = newOptions.scrollPredominantAxis;
    }
    if (typeof newOptions.horizontal !== "undefined") {
      this._options.horizontal = newOptions.horizontal;
    }
    if (typeof newOptions.vertical !== "undefined") {
      this._options.vertical = newOptions.vertical;
    }
    if (typeof newOptions.horizontalScrollbarSize !== "undefined") {
      this._options.horizontalScrollbarSize = newOptions.horizontalScrollbarSize;
    }
    if (typeof newOptions.verticalScrollbarSize !== "undefined") {
      this._options.verticalScrollbarSize = newOptions.verticalScrollbarSize;
    }
    if (typeof newOptions.scrollByPage !== "undefined") {
      this._options.scrollByPage = newOptions.scrollByPage;
    }
    this._horizontalScrollbar.updateOptions(this._options);
    this._verticalScrollbar.updateOptions(this._options);
    if (!this._options.lazyRender) {
      this._render();
    }
  }
  setRevealOnScroll(value) {
    this._revealOnScroll = value;
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this._onMouseWheel(new StandardWheelEvent(browserEvent));
  }
  async _periodicSync() {
    let scheduleAgain = false;
    if (this._inertialSpeed.X !== 0 || this._inertialSpeed.Y !== 0) {
      this._scrollable.setScrollPositionNow({
        scrollTop: this._scrollable.getCurrentScrollPosition().scrollTop - this._inertialSpeed.Y * 100,
        scrollLeft: this._scrollable.getCurrentScrollPosition().scrollLeft - this._inertialSpeed.X * 100
      });
      this._inertialSpeed.X *= 0.9;
      this._inertialSpeed.Y *= 0.9;
      if (Math.abs(this._inertialSpeed.X) < 0.01) {
        this._inertialSpeed.X = 0;
      }
      if (Math.abs(this._inertialSpeed.Y) < 0.01) {
        this._inertialSpeed.Y = 0;
      }
      scheduleAgain = this._inertialSpeed.X !== 0 || this._inertialSpeed.Y !== 0;
    }
    if (scheduleAgain) {
      if (!this._inertialTimeout) {
        this._inertialTimeout = new TimeoutTimer();
      }
      this._inertialTimeout.cancelAndSet(() => this._periodicSync(), 1e3 / 60);
    } else {
      this._inertialTimeout?.dispose();
      this._inertialTimeout = null;
    }
  }
  // -------------------- mouse wheel scrolling --------------------
  _setListeningToMouseWheel(shouldListen) {
    const isListening = this._mouseWheelToDispose.length > 0;
    if (isListening === shouldListen) {
      return;
    }
    this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);
    if (shouldListen) {
      const onMouseWheel = (browserEvent) => {
        this._onMouseWheel(new StandardWheelEvent(browserEvent));
      };
      this._mouseWheelToDispose.push(dom.addDisposableListener(this._listenOnDomNode, dom.EventType.MOUSE_WHEEL, onMouseWheel, { passive: false }));
    }
  }
  _onMouseWheel(e) {
    if (e.browserEvent?.defaultPrevented) {
      return;
    }
    const classifier = MouseWheelClassifier.INSTANCE;
    if (SCROLL_WHEEL_SMOOTH_SCROLL_ENABLED) {
      classifier.acceptStandardWheelEvent(e);
    }
    let didScroll = false;
    if (e.deltaY || e.deltaX) {
      let deltaY = e.deltaY * this._options.mouseWheelScrollSensitivity;
      let deltaX = e.deltaX * this._options.mouseWheelScrollSensitivity;
      if (this._options.scrollPredominantAxis) {
        if (this._options.scrollYToX && deltaX + deltaY === 0) {
          deltaX = deltaY = 0;
        } else if (Math.abs(deltaY) >= Math.abs(deltaX)) {
          deltaX = 0;
        } else {
          deltaY = 0;
        }
      }
      if (this._options.flipAxes) {
        [deltaY, deltaX] = [deltaX, deltaY];
      }
      const shiftConvert = !platform.isMacintosh && e.browserEvent && e.browserEvent.shiftKey;
      if ((this._options.scrollYToX || shiftConvert) && !deltaX) {
        deltaX = deltaY;
        deltaY = 0;
      }
      if (e.browserEvent && e.browserEvent.altKey) {
        deltaX = deltaX * this._options.fastScrollSensitivity;
        deltaY = deltaY * this._options.fastScrollSensitivity;
      }
      const futureScrollPosition = this._scrollable.getFutureScrollPosition();
      let desiredScrollPosition = {};
      if (deltaY) {
        const deltaScrollTop = SCROLL_WHEEL_SENSITIVITY * deltaY;
        const desiredScrollTop = futureScrollPosition.scrollTop - (deltaScrollTop < 0 ? Math.floor(deltaScrollTop) : Math.ceil(deltaScrollTop));
        this._verticalScrollbar.writeScrollPosition(desiredScrollPosition, desiredScrollTop);
      }
      if (deltaX) {
        const deltaScrollLeft = SCROLL_WHEEL_SENSITIVITY * deltaX;
        const desiredScrollLeft = futureScrollPosition.scrollLeft - (deltaScrollLeft < 0 ? Math.floor(deltaScrollLeft) : Math.ceil(deltaScrollLeft));
        this._horizontalScrollbar.writeScrollPosition(desiredScrollPosition, desiredScrollLeft);
      }
      desiredScrollPosition = this._scrollable.validateScrollPosition(desiredScrollPosition);
      if (this._options.inertialScroll && (deltaX || deltaY) && !classifier.isPhysicalMouseWheel()) {
        let startPeriodic = false;
        if (this._inertialSpeed.X === 0 && this._inertialSpeed.Y === 0) {
          startPeriodic = true;
        }
        this._inertialSpeed.Y = (deltaY < 0 ? -1 : 1) * Math.abs(deltaY) ** 1.02;
        this._inertialSpeed.X = (deltaX < 0 ? -1 : 1) * Math.abs(deltaX) ** 1.02;
        if (startPeriodic) {
          this._periodicSync();
        }
      }
      if (futureScrollPosition.scrollLeft !== desiredScrollPosition.scrollLeft || futureScrollPosition.scrollTop !== desiredScrollPosition.scrollTop) {
        const canPerformSmoothScroll = SCROLL_WHEEL_SMOOTH_SCROLL_ENABLED && this._options.mouseWheelSmoothScroll && classifier.isPhysicalMouseWheel();
        if (canPerformSmoothScroll) {
          this._scrollable.setScrollPositionSmooth(desiredScrollPosition);
        } else {
          this._scrollable.setScrollPositionNow(desiredScrollPosition);
        }
        didScroll = true;
      }
    }
    let consumeMouseWheel = didScroll;
    if (!consumeMouseWheel && this._options.alwaysConsumeMouseWheel) {
      consumeMouseWheel = true;
    }
    if (!consumeMouseWheel && this._options.consumeMouseWheelIfScrollbarIsNeeded && (this._verticalScrollbar.isNeeded() || this._horizontalScrollbar.isNeeded())) {
      consumeMouseWheel = true;
    }
    if (consumeMouseWheel) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
  _onDidScroll(e) {
    this._shouldRender = this._horizontalScrollbar.onDidScroll(e) || this._shouldRender;
    this._shouldRender = this._verticalScrollbar.onDidScroll(e) || this._shouldRender;
    if (this._options.useShadows) {
      this._shouldRender = true;
    }
    if (this._revealOnScroll) {
      this._reveal();
    }
    if (!this._options.lazyRender) {
      this._render();
    }
  }
  /**
   * Render / mutate the DOM now.
   * Should be used together with the ctor option `lazyRender`.
   */
  renderNow() {
    if (!this._options.lazyRender) {
      throw new Error("Please use `lazyRender` together with `renderNow`!");
    }
    this._render();
  }
  _render() {
    if (!this._shouldRender) {
      return;
    }
    this._shouldRender = false;
    this._horizontalScrollbar.render();
    this._verticalScrollbar.render();
    if (this._options.useShadows) {
      const scrollState = this._scrollable.getCurrentScrollPosition();
      const enableTop = scrollState.scrollTop > 0;
      const enableLeft = scrollState.scrollLeft > 0;
      const leftClassName = enableLeft ? " left" : "";
      const topClassName = enableTop ? " top" : "";
      const topLeftClassName = enableLeft || enableTop ? " top-left-corner" : "";
      this._leftShadowDomNode.setClassName(`shadow${leftClassName}`);
      this._topShadowDomNode.setClassName(`shadow${topClassName}`);
      this._topLeftShadowDomNode.setClassName(`shadow${topLeftClassName}${topClassName}${leftClassName}`);
    }
  }
  // -------------------- fade in / fade out --------------------
  _onDragStart() {
    this._isDragging = true;
    this._reveal();
  }
  _onDragEnd() {
    this._isDragging = false;
    this._hide();
  }
  _onMouseLeave(e) {
    this._mouseIsOver = false;
    this._hide();
  }
  _onMouseOver(e) {
    this._mouseIsOver = true;
    this._reveal();
  }
  _reveal() {
    this._verticalScrollbar.beginReveal();
    this._horizontalScrollbar.beginReveal();
    this._scheduleHide();
  }
  _hide() {
    if (!this._mouseIsOver && !this._isDragging) {
      this._verticalScrollbar.beginHide();
      this._horizontalScrollbar.beginHide();
    }
  }
  _scheduleHide() {
    if (!this._mouseIsOver && !this._isDragging) {
      this._hideTimeout.cancelAndSet(() => this._hide(), HIDE_TIMEOUT);
    }
  }
}
class ScrollableElement extends AbstractScrollableElement {
  constructor(element, options) {
    options = options || {};
    options.mouseWheelSmoothScroll = false;
    const scrollable = new Scrollable({
      forceIntegerValues: true,
      smoothScrollDuration: 0,
      scheduleAtNextAnimationFrame: (callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(element), callback)
    });
    super(element, options, scrollable);
    this._register(scrollable);
  }
  setScrollPosition(update) {
    this._scrollable.setScrollPositionNow(update);
  }
  getScrollPosition() {
    return this._scrollable.getCurrentScrollPosition();
  }
}
class SmoothScrollableElement extends AbstractScrollableElement {
  constructor(element, options, scrollable) {
    super(element, options, scrollable);
  }
  setScrollPosition(update) {
    if (update.reuseAnimation) {
      this._scrollable.setScrollPositionSmooth(update, update.reuseAnimation);
    } else {
      this._scrollable.setScrollPositionNow(update);
    }
  }
  getScrollPosition() {
    return this._scrollable.getCurrentScrollPosition();
  }
}
class DomScrollableElement extends AbstractScrollableElement {
  constructor(element, options) {
    options = options || {};
    options.mouseWheelSmoothScroll = false;
    const scrollable = new Scrollable({
      forceIntegerValues: false,
      // See https://github.com/microsoft/vscode/issues/139877
      smoothScrollDuration: 0,
      scheduleAtNextAnimationFrame: (callback) => dom.scheduleAtNextAnimationFrame(dom.getWindow(element), callback)
    });
    super(element, options, scrollable);
    this._register(scrollable);
    this._element = element;
    this._register(this.onScroll((e) => {
      if (e.scrollTopChanged) {
        this._element.scrollTop = e.scrollTop;
      }
      if (e.scrollLeftChanged) {
        this._element.scrollLeft = e.scrollLeft;
      }
    }));
    this.scanDomNode();
  }
  setScrollPosition(update) {
    this._scrollable.setScrollPositionNow(update);
  }
  getScrollPosition() {
    return this._scrollable.getCurrentScrollPosition();
  }
  scanDomNode() {
    this.setScrollDimensions({
      width: this._element.clientWidth,
      scrollWidth: this._element.scrollWidth,
      height: this._element.clientHeight,
      scrollHeight: this._element.scrollHeight
    });
    this.setScrollPosition({
      scrollLeft: this._element.scrollLeft,
      scrollTop: this._element.scrollTop
    });
  }
}
function resolveOptions(opts) {
  const result = {
    lazyRender: typeof opts.lazyRender !== "undefined" ? opts.lazyRender : false,
    className: typeof opts.className !== "undefined" ? opts.className : "",
    useShadows: typeof opts.useShadows !== "undefined" ? opts.useShadows : true,
    handleMouseWheel: typeof opts.handleMouseWheel !== "undefined" ? opts.handleMouseWheel : true,
    flipAxes: typeof opts.flipAxes !== "undefined" ? opts.flipAxes : false,
    consumeMouseWheelIfScrollbarIsNeeded: typeof opts.consumeMouseWheelIfScrollbarIsNeeded !== "undefined" ? opts.consumeMouseWheelIfScrollbarIsNeeded : false,
    alwaysConsumeMouseWheel: typeof opts.alwaysConsumeMouseWheel !== "undefined" ? opts.alwaysConsumeMouseWheel : false,
    scrollYToX: typeof opts.scrollYToX !== "undefined" ? opts.scrollYToX : false,
    mouseWheelScrollSensitivity: typeof opts.mouseWheelScrollSensitivity !== "undefined" ? opts.mouseWheelScrollSensitivity : 1,
    fastScrollSensitivity: typeof opts.fastScrollSensitivity !== "undefined" ? opts.fastScrollSensitivity : 5,
    scrollPredominantAxis: typeof opts.scrollPredominantAxis !== "undefined" ? opts.scrollPredominantAxis : true,
    mouseWheelSmoothScroll: typeof opts.mouseWheelSmoothScroll !== "undefined" ? opts.mouseWheelSmoothScroll : true,
    inertialScroll: typeof opts.inertialScroll !== "undefined" ? opts.inertialScroll : false,
    arrowSize: typeof opts.arrowSize !== "undefined" ? opts.arrowSize : 11,
    listenOnDomNode: typeof opts.listenOnDomNode !== "undefined" ? opts.listenOnDomNode : null,
    horizontal: typeof opts.horizontal !== "undefined" ? opts.horizontal : ScrollbarVisibility.Auto,
    horizontalScrollbarSize: typeof opts.horizontalScrollbarSize !== "undefined" ? opts.horizontalScrollbarSize : globalDefaultScrollbarSize,
    horizontalSliderSize: typeof opts.horizontalSliderSize !== "undefined" ? opts.horizontalSliderSize : 0,
    horizontalHasArrows: typeof opts.horizontalHasArrows !== "undefined" ? opts.horizontalHasArrows : false,
    vertical: typeof opts.vertical !== "undefined" ? opts.vertical : ScrollbarVisibility.Auto,
    verticalScrollbarSize: typeof opts.verticalScrollbarSize !== "undefined" ? opts.verticalScrollbarSize : globalDefaultScrollbarSize,
    verticalHasArrows: typeof opts.verticalHasArrows !== "undefined" ? opts.verticalHasArrows : false,
    verticalSliderSize: typeof opts.verticalSliderSize !== "undefined" ? opts.verticalSliderSize : 0,
    scrollByPage: typeof opts.scrollByPage !== "undefined" ? opts.scrollByPage : false
  };
  result.horizontalSliderSize = typeof opts.horizontalSliderSize !== "undefined" ? opts.horizontalSliderSize : result.horizontalScrollbarSize;
  result.verticalSliderSize = typeof opts.verticalSliderSize !== "undefined" ? opts.verticalSliderSize : result.verticalScrollbarSize;
  if (platform.isMacintosh) {
    result.className += " mac";
  }
  return result;
}
export {
  AbstractScrollableElement,
  DEFAULT_SCROLLBAR_SIZE,
  DomScrollableElement,
  MouseWheelClassifier,
  ScrollableElement,
  SmoothScrollableElement,
  onDidChangeDefaultScrollbarSize,
  setGlobalDefaultScrollbarSize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9zY3JvbGxiYXIvc2Nyb2xsYWJsZUVsZW1lbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZXRab29tRmFjdG9yLCBpc0Nocm9tZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBGYXN0RG9tTm9kZSwgY3JlYXRlRmFzdERvbU5vZGUgfSBmcm9tICcuLi8uLi9mYXN0RG9tTm9kZS5qcyc7XG5pbXBvcnQgeyBJTW91c2VFdmVudCwgSU1vdXNlV2hlZWxFdmVudCwgU3RhbmRhcmRXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJIb3N0IH0gZnJvbSAnLi9hYnN0cmFjdFNjcm9sbGJhci5qcyc7XG5pbXBvcnQgeyBIb3Jpem9udGFsU2Nyb2xsYmFyIH0gZnJvbSAnLi9ob3Jpem9udGFsU2Nyb2xsYmFyLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGVFbGVtZW50Q2hhbmdlT3B0aW9ucywgU2Nyb2xsYWJsZUVsZW1lbnRDcmVhdGlvbk9wdGlvbnMsIFNjcm9sbGFibGVFbGVtZW50UmVzb2x2ZWRPcHRpb25zIH0gZnJvbSAnLi9zY3JvbGxhYmxlRWxlbWVudE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgVmVydGljYWxTY3JvbGxiYXIgfSBmcm9tICcuL3ZlcnRpY2FsU2Nyb2xsYmFyLmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC5qcyc7XG5pbXBvcnQgeyBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJTmV3U2Nyb2xsRGltZW5zaW9ucywgSU5ld1Njcm9sbFBvc2l0aW9uLCBJU2Nyb2xsRGltZW5zaW9ucywgSVNjcm9sbFBvc2l0aW9uLCBTY3JvbGxFdmVudCwgU2Nyb2xsYWJsZSwgU2Nyb2xsYmFyVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCAnLi9tZWRpYS9zY3JvbGxiYXJzLmNzcyc7XG5cbmNvbnN0IEhJREVfVElNRU9VVCA9IDUwMDtcbmNvbnN0IFNDUk9MTF9XSEVFTF9TRU5TSVRJVklUWSA9IDUwO1xuY29uc3QgU0NST0xMX1dIRUVMX1NNT09USF9TQ1JPTExfRU5BQkxFRCA9IHRydWU7XG5cbi8qKiBUaGUgZGVmYXVsdCBzaXplIChweCkgdXNlZCB3aGVuIGEgc2Nyb2xsYmFyIGVsZW1lbnQgZG9lcyBub3QgcGFzcyBhbiBleHBsaWNpdCBzaXplLiAqL1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfU0NST0xMQkFSX1NJWkUgPSAxMDtcbmxldCBnbG9iYWxEZWZhdWx0U2Nyb2xsYmFyU2l6ZSA9IERFRkFVTFRfU0NST0xMQkFSX1NJWkU7XG5jb25zdCBfb25EaWRDaGFuZ2VEZWZhdWx0U2Nyb2xsYmFyU2l6ZUVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxudW1iZXI+KCk7XG5leHBvcnQgY29uc3Qgb25EaWRDaGFuZ2VEZWZhdWx0U2Nyb2xsYmFyU2l6ZTogRXZlbnQ8bnVtYmVyPiA9IF9vbkRpZENoYW5nZURlZmF1bHRTY3JvbGxiYXJTaXplRW1pdHRlci5ldmVudDtcblxuLyoqXG4gKiBVcGRhdGUgdGhlIGRlZmF1bHQgc2Nyb2xsYmFyIHNpemUgdXNlZCBieSBhbGwgc2Nyb2xsYWJsZSBlbGVtZW50cyB0aGF0IHdlcmVcbiAqIGNyZWF0ZWQgd2l0aG91dCBhbiBleHBsaWNpdCBob3Jpem9udGFsL3ZlcnRpY2FsIHNjcm9sbGJhciBzaXplIG9wdGlvbi5cbiAqIEVsZW1lbnRzIHdpdGggZXhwbGljaXQgc2l6ZXMgKGUuZy4gdGhlIGVkaXRvciwgbWVudXMpIGFyZSB1bmFmZmVjdGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0R2xvYmFsRGVmYXVsdFNjcm9sbGJhclNpemUoc2l6ZTogbnVtYmVyKTogdm9pZCB7XG5cdGlmIChzaXplICE9PSBnbG9iYWxEZWZhdWx0U2Nyb2xsYmFyU2l6ZSkge1xuXHRcdGdsb2JhbERlZmF1bHRTY3JvbGxiYXJTaXplID0gc2l6ZTtcblx0XHRfb25EaWRDaGFuZ2VEZWZhdWx0U2Nyb2xsYmFyU2l6ZUVtaXR0ZXIuZmlyZShzaXplKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPdmVydmlld1J1bGVyTGF5b3V0SW5mbyB7XG5cdHBhcmVudDogSFRNTEVsZW1lbnQ7XG5cdGluc2VydEJlZm9yZTogSFRNTEVsZW1lbnQ7XG59XG5cbmNsYXNzIE1vdXNlV2hlZWxDbGFzc2lmaWVySXRlbSB7XG5cdHB1YmxpYyB0aW1lc3RhbXA6IG51bWJlcjtcblx0cHVibGljIGRlbHRhWDogbnVtYmVyO1xuXHRwdWJsaWMgZGVsdGFZOiBudW1iZXI7XG5cdHB1YmxpYyBzY29yZTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHRpbWVzdGFtcDogbnVtYmVyLCBkZWx0YVg6IG51bWJlciwgZGVsdGFZOiBudW1iZXIpIHtcblx0XHR0aGlzLnRpbWVzdGFtcCA9IHRpbWVzdGFtcDtcblx0XHR0aGlzLmRlbHRhWCA9IGRlbHRhWDtcblx0XHR0aGlzLmRlbHRhWSA9IGRlbHRhWTtcblx0XHR0aGlzLnNjb3JlID0gMDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTW91c2VXaGVlbENsYXNzaWZpZXIge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSU5TVEFOQ0UgPSBuZXcgTW91c2VXaGVlbENsYXNzaWZpZXIoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jYXBhY2l0eTogbnVtYmVyO1xuXHRwcml2YXRlIF9tZW1vcnk6IE1vdXNlV2hlZWxDbGFzc2lmaWVySXRlbVtdO1xuXHRwcml2YXRlIF9mcm9udDogbnVtYmVyO1xuXHRwcml2YXRlIF9yZWFyOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0dGhpcy5fY2FwYWNpdHkgPSA1O1xuXHRcdHRoaXMuX21lbW9yeSA9IFtdO1xuXHRcdHRoaXMuX2Zyb250ID0gLTE7XG5cdFx0dGhpcy5fcmVhciA9IC0xO1xuXHR9XG5cblx0cHVibGljIGlzUGh5c2ljYWxNb3VzZVdoZWVsKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9mcm9udCA9PT0gLTEgJiYgdGhpcy5fcmVhciA9PT0gLTEpIHtcblx0XHRcdC8vIG5vIGVsZW1lbnRzXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gMC41ICogbGFzdCArIDAuMjUgKiAybmQgbGFzdCArIDAuMTI1ICogM3JkIGxhc3QgKyAuLi5cblx0XHRsZXQgcmVtYWluaW5nSW5mbHVlbmNlID0gMTtcblx0XHRsZXQgc2NvcmUgPSAwO1xuXHRcdGxldCBpdGVyYXRpb24gPSAxO1xuXG5cdFx0bGV0IGluZGV4ID0gdGhpcy5fcmVhcjtcblx0XHRkbyB7XG5cdFx0XHRjb25zdCBpbmZsdWVuY2UgPSAoaW5kZXggPT09IHRoaXMuX2Zyb250ID8gcmVtYWluaW5nSW5mbHVlbmNlIDogTWF0aC5wb3coMiwgLWl0ZXJhdGlvbikpO1xuXHRcdFx0cmVtYWluaW5nSW5mbHVlbmNlIC09IGluZmx1ZW5jZTtcblx0XHRcdHNjb3JlICs9IHRoaXMuX21lbW9yeVtpbmRleF0uc2NvcmUgKiBpbmZsdWVuY2U7XG5cblx0XHRcdGlmIChpbmRleCA9PT0gdGhpcy5fZnJvbnQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGluZGV4ID0gKHRoaXMuX2NhcGFjaXR5ICsgaW5kZXggLSAxKSAlIHRoaXMuX2NhcGFjaXR5O1xuXHRcdFx0aXRlcmF0aW9uKys7XG5cdFx0fSB3aGlsZSAodHJ1ZSk7XG5cblx0XHRyZXR1cm4gKHNjb3JlIDw9IDAuNSk7XG5cdH1cblxuXHRwdWJsaWMgYWNjZXB0U3RhbmRhcmRXaGVlbEV2ZW50KGU6IFN0YW5kYXJkV2hlZWxFdmVudCk6IHZvaWQge1xuXHRcdGlmIChpc0Nocm9tZSkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyhlLmJyb3dzZXJFdmVudCk7XG5cdFx0XHRjb25zdCBwYWdlWm9vbUZhY3RvciA9IGdldFpvb21GYWN0b3IodGFyZ2V0V2luZG93KTtcblx0XHRcdC8vIE9uIENocm9tZSwgdGhlIGluY29taW5nIGRlbHRhIGV2ZW50cyBhcmUgbXVsdGlwbGllZCB3aXRoIHRoZSBPUyB6b29tIGZhY3Rvci5cblx0XHRcdC8vIFRoZSBPUyB6b29tIGZhY3RvciBjYW4gYmUgcmV2ZXJzZSBlbmdpbmVlcmVkIGJ5IHVzaW5nIHRoZSBkZXZpY2UgcGl4ZWwgcmF0aW8gYW5kIHRoZSBjb25maWd1cmVkIHpvb20gZmFjdG9yIGludG8gYWNjb3VudC5cblx0XHRcdHRoaXMuYWNjZXB0KERhdGUubm93KCksIGUuZGVsdGFYICogcGFnZVpvb21GYWN0b3IsIGUuZGVsdGFZICogcGFnZVpvb21GYWN0b3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjY2VwdChEYXRlLm5vdygpLCBlLmRlbHRhWCwgZS5kZWx0YVkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhY2NlcHQodGltZXN0YW1wOiBudW1iZXIsIGRlbHRhWDogbnVtYmVyLCBkZWx0YVk6IG51bWJlcik6IHZvaWQge1xuXHRcdGxldCBwcmV2aW91c0l0ZW0gPSBudWxsO1xuXHRcdGNvbnN0IGl0ZW0gPSBuZXcgTW91c2VXaGVlbENsYXNzaWZpZXJJdGVtKHRpbWVzdGFtcCwgZGVsdGFYLCBkZWx0YVkpO1xuXG5cdFx0aWYgKHRoaXMuX2Zyb250ID09PSAtMSAmJiB0aGlzLl9yZWFyID09PSAtMSkge1xuXHRcdFx0dGhpcy5fbWVtb3J5WzBdID0gaXRlbTtcblx0XHRcdHRoaXMuX2Zyb250ID0gMDtcblx0XHRcdHRoaXMuX3JlYXIgPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcmV2aW91c0l0ZW0gPSB0aGlzLl9tZW1vcnlbdGhpcy5fcmVhcl07XG5cblx0XHRcdHRoaXMuX3JlYXIgPSAodGhpcy5fcmVhciArIDEpICUgdGhpcy5fY2FwYWNpdHk7XG5cdFx0XHRpZiAodGhpcy5fcmVhciA9PT0gdGhpcy5fZnJvbnQpIHtcblx0XHRcdFx0Ly8gRHJvcCBvbGRlc3Rcblx0XHRcdFx0dGhpcy5fZnJvbnQgPSAodGhpcy5fZnJvbnQgKyAxKSAlIHRoaXMuX2NhcGFjaXR5O1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbWVtb3J5W3RoaXMuX3JlYXJdID0gaXRlbTtcblx0XHR9XG5cblx0XHRpdGVtLnNjb3JlID0gdGhpcy5fY29tcHV0ZVNjb3JlKGl0ZW0sIHByZXZpb3VzSXRlbSk7XG5cdH1cblxuXHQvKipcblx0ICogQSBzY29yZSBiZXR3ZWVuIDAgYW5kIDEgZm9yIGBpdGVtYC5cblx0ICogIC0gYSBzY29yZSB0b3dhcmRzIDAgaW5kaWNhdGVzIHRoYXQgdGhlIHNvdXJjZSBhcHBlYXJzIHRvIGJlIGEgcGh5c2ljYWwgbW91c2Ugd2hlZWxcblx0ICogIC0gYSBzY29yZSB0b3dhcmRzIDEgaW5kaWNhdGVzIHRoYXQgdGhlIHNvdXJjZSBhcHBlYXJzIHRvIGJlIGEgdG91Y2hwYWQgb3IgbWFnaWMgbW91c2UsIGV0Yy5cblx0ICovXG5cdHByaXZhdGUgX2NvbXB1dGVTY29yZShpdGVtOiBNb3VzZVdoZWVsQ2xhc3NpZmllckl0ZW0sIHByZXZpb3VzSXRlbTogTW91c2VXaGVlbENsYXNzaWZpZXJJdGVtIHwgbnVsbCk6IG51bWJlciB7XG5cblx0XHRpZiAoTWF0aC5hYnMoaXRlbS5kZWx0YVgpID4gMCAmJiBNYXRoLmFicyhpdGVtLmRlbHRhWSkgPiAwKSB7XG5cdFx0XHQvLyBib3RoIGF4ZXMgZXhlcmNpc2VkID0+IGRlZmluaXRlbHkgbm90IGEgcGh5c2ljYWwgbW91c2Ugd2hlZWxcblx0XHRcdHJldHVybiAxO1xuXHRcdH1cblxuXHRcdGxldCBzY29yZTogbnVtYmVyID0gMC41O1xuXG5cdFx0aWYgKCF0aGlzLl9pc0FsbW9zdEludChpdGVtLmRlbHRhWCkgfHwgIXRoaXMuX2lzQWxtb3N0SW50KGl0ZW0uZGVsdGFZKSkge1xuXHRcdFx0Ly8gbm9uLWludGVnZXIgZGVsdGFzID0+IGluZGljYXRvciB0aGF0IHRoaXMgaXMgbm90IGEgcGh5c2ljYWwgbW91c2Ugd2hlZWxcblx0XHRcdHNjb3JlICs9IDAuMjU7XG5cdFx0fVxuXG5cdFx0Ly8gTm9uLWFjY2VsZXJhdGluZyBzY3JvbGwgPT4gaW5kaWNhdG9yIHRoYXQgdGhpcyBpcyBhIHBoeXNpY2FsIG1vdXNlIHdoZWVsXG5cdFx0Ly8gVGhlc2UgY2FuIGJlIGlkZW50aWZpZWQgYnkgc2VlaW5nIHdoZXRoZXIgdGhleSBhcmUgdGhlIG1vZHVsZSBvZiBvbmUgYW5vdGhlci5cblx0XHRpZiAocHJldmlvdXNJdGVtKSB7XG5cdFx0XHRjb25zdCBhYnNEZWx0YVggPSBNYXRoLmFicyhpdGVtLmRlbHRhWCk7XG5cdFx0XHRjb25zdCBhYnNEZWx0YVkgPSBNYXRoLmFicyhpdGVtLmRlbHRhWSk7XG5cblx0XHRcdGNvbnN0IGFic1ByZXZpb3VzRGVsdGFYID0gTWF0aC5hYnMocHJldmlvdXNJdGVtLmRlbHRhWCk7XG5cdFx0XHRjb25zdCBhYnNQcmV2aW91c0RlbHRhWSA9IE1hdGguYWJzKHByZXZpb3VzSXRlbS5kZWx0YVkpO1xuXG5cdFx0XHQvLyBNaW4gMSB0byBhdm9pZCBkaXZpc2lvbiBieSB6ZXJvLCBtb2R1bGUgMSB3aWxsIHN0aWxsIGJlIDAuXG5cdFx0XHRjb25zdCBtaW5EZWx0YVggPSBNYXRoLm1heChNYXRoLm1pbihhYnNEZWx0YVgsIGFic1ByZXZpb3VzRGVsdGFYKSwgMSk7XG5cdFx0XHRjb25zdCBtaW5EZWx0YVkgPSBNYXRoLm1heChNYXRoLm1pbihhYnNEZWx0YVksIGFic1ByZXZpb3VzRGVsdGFZKSwgMSk7XG5cblx0XHRcdGNvbnN0IG1heERlbHRhWCA9IE1hdGgubWF4KGFic0RlbHRhWCwgYWJzUHJldmlvdXNEZWx0YVgpO1xuXHRcdFx0Y29uc3QgbWF4RGVsdGFZID0gTWF0aC5tYXgoYWJzRGVsdGFZLCBhYnNQcmV2aW91c0RlbHRhWSk7XG5cblx0XHRcdGNvbnN0IGlzU2FtZU1vZHVsbyA9IChtYXhEZWx0YVggJSBtaW5EZWx0YVggPT09IDAgJiYgbWF4RGVsdGFZICUgbWluRGVsdGFZID09PSAwKTtcblx0XHRcdGlmIChpc1NhbWVNb2R1bG8pIHtcblx0XHRcdFx0c2NvcmUgLT0gMC41O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBNYXRoLm1pbihNYXRoLm1heChzY29yZSwgMCksIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNBbG1vc3RJbnQodmFsdWU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVwc2lsb24gPSBOdW1iZXIuRVBTSUxPTiAqIDEwMDsgLy8gVXNlIGEgc21hbGwgdG9sZXJhbmNlIGZhY3RvciBmb3IgZmxvYXRpbmctcG9pbnQgZXJyb3JzXG5cdFx0Y29uc3QgZGVsdGEgPSBNYXRoLmFicyhNYXRoLnJvdW5kKHZhbHVlKSAtIHZhbHVlKTtcblx0XHRyZXR1cm4gKGRlbHRhIDwgMC4wMSArIGVwc2lsb24pO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdFNjcm9sbGFibGVFbGVtZW50IGV4dGVuZHMgV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBTY3JvbGxhYmxlRWxlbWVudFJlc29sdmVkT3B0aW9ucztcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zY3JvbGxhYmxlOiBTY3JvbGxhYmxlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF92ZXJ0aWNhbFNjcm9sbGJhcjogVmVydGljYWxTY3JvbGxiYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvcml6b250YWxTY3JvbGxiYXI6IEhvcml6b250YWxTY3JvbGxiYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xlZnRTaGFkb3dEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b3BTaGFkb3dEb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4gfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b3BMZWZ0U2hhZG93RG9tTm9kZTogRmFzdERvbU5vZGU8SFRNTEVsZW1lbnQ+IHwgbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saXN0ZW5PbkRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgX21vdXNlV2hlZWxUb0Rpc3Bvc2U6IElEaXNwb3NhYmxlW107XG5cblx0cHJpdmF0ZSBfaXNEcmFnZ2luZzogYm9vbGVhbjtcblx0cHJpdmF0ZSBfbW91c2VJc092ZXI6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGlkZVRpbWVvdXQ6IFRpbWVvdXRUaW1lcjtcblx0cHJpdmF0ZSBfc2hvdWxkUmVuZGVyOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX3JldmVhbE9uU2Nyb2xsOiBib29sZWFuO1xuXG5cdHByaXZhdGUgX2luZXJ0aWFsVGltZW91dDogVGltZW91dFRpbWVyIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2luZXJ0aWFsU3BlZWQ6IHsgWDogbnVtYmVyOyBZOiBudW1iZXIgfSA9IHsgWDogMCwgWTogMCB9O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU2Nyb2xsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U2Nyb2xsRXZlbnQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uU2Nyb2xsKCk6IEV2ZW50PFNjcm9sbEV2ZW50PiB7IHJldHVybiB0aGlzLl9vblNjcm9sbC5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNjcm9sbEV2ZW50PigpKTtcblx0cHVibGljIGdldCBvbldpbGxTY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uV2lsbFNjcm9sbC5ldmVudDsgfVxuXG5cdHB1YmxpYyBnZXQgb3B0aW9ucygpOiBSZWFkb25seTxTY3JvbGxhYmxlRWxlbWVudFJlc29sdmVkT3B0aW9ucz4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBTY3JvbGxhYmxlRWxlbWVudENyZWF0aW9uT3B0aW9ucywgc2Nyb2xsYWJsZTogU2Nyb2xsYWJsZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0ZWxlbWVudC5zdHlsZS5vdmVyZmxvdyA9ICdoaWRkZW4nO1xuXHRcdHRoaXMuX29wdGlvbnMgPSByZXNvbHZlT3B0aW9ucyhvcHRpb25zKTtcblx0XHR0aGlzLl9zY3JvbGxhYmxlID0gc2Nyb2xsYWJsZTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Njcm9sbGFibGUub25TY3JvbGwoKGUpID0+IHtcblx0XHRcdHRoaXMuX29uV2lsbFNjcm9sbC5maXJlKGUpO1xuXHRcdFx0dGhpcy5fb25EaWRTY3JvbGwoZSk7XG5cdFx0XHR0aGlzLl9vblNjcm9sbC5maXJlKGUpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHNjcm9sbGJhckhvc3Q6IFNjcm9sbGJhckhvc3QgPSB7XG5cdFx0XHRvbk1vdXNlV2hlZWw6IChtb3VzZVdoZWVsRXZlbnQ6IFN0YW5kYXJkV2hlZWxFdmVudCkgPT4gdGhpcy5fb25Nb3VzZVdoZWVsKG1vdXNlV2hlZWxFdmVudCksXG5cdFx0XHRvbkRyYWdTdGFydDogKCkgPT4gdGhpcy5fb25EcmFnU3RhcnQoKSxcblx0XHRcdG9uRHJhZ0VuZDogKCkgPT4gdGhpcy5fb25EcmFnRW5kKCksXG5cdFx0fTtcblx0XHR0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBWZXJ0aWNhbFNjcm9sbGJhcih0aGlzLl9zY3JvbGxhYmxlLCB0aGlzLl9vcHRpb25zLCBzY3JvbGxiYXJIb3N0KSk7XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBIb3Jpem9udGFsU2Nyb2xsYmFyKHRoaXMuX3Njcm9sbGFibGUsIHRoaXMuX29wdGlvbnMsIHNjcm9sbGJhckhvc3QpKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTmFtZSA9ICdtb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ICcgKyB0aGlzLl9vcHRpb25zLmNsYXNzTmFtZTtcblx0XHR0aGlzLl9kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdwcmVzZW50YXRpb24nKTtcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHR0aGlzLl9kb21Ob2RlLnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZChlbGVtZW50KTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIuZG9tTm9kZS5kb21Ob2RlKTtcblx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3ZlcnRpY2FsU2Nyb2xsYmFyLmRvbU5vZGUuZG9tTm9kZSk7XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy51c2VTaGFkb3dzKSB7XG5cdFx0XHR0aGlzLl9sZWZ0U2hhZG93RG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRcdHRoaXMuX2xlZnRTaGFkb3dEb21Ob2RlLnNldENsYXNzTmFtZSgnc2hhZG93Jyk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX2xlZnRTaGFkb3dEb21Ob2RlLmRvbU5vZGUpO1xuXG5cdFx0XHR0aGlzLl90b3BTaGFkb3dEb21Ob2RlID0gY3JlYXRlRmFzdERvbU5vZGUoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JykpO1xuXHRcdFx0dGhpcy5fdG9wU2hhZG93RG9tTm9kZS5zZXRDbGFzc05hbWUoJ3NoYWRvdycpO1xuXHRcdFx0dGhpcy5fZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl90b3BTaGFkb3dEb21Ob2RlLmRvbU5vZGUpO1xuXG5cdFx0XHR0aGlzLl90b3BMZWZ0U2hhZG93RG9tTm9kZSA9IGNyZWF0ZUZhc3REb21Ob2RlKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpKTtcblx0XHRcdHRoaXMuX3RvcExlZnRTaGFkb3dEb21Ob2RlLnNldENsYXNzTmFtZSgnc2hhZG93Jyk7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmFwcGVuZENoaWxkKHRoaXMuX3RvcExlZnRTaGFkb3dEb21Ob2RlLmRvbU5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9sZWZ0U2hhZG93RG9tTm9kZSA9IG51bGw7XG5cdFx0XHR0aGlzLl90b3BTaGFkb3dEb21Ob2RlID0gbnVsbDtcblx0XHRcdHRoaXMuX3RvcExlZnRTaGFkb3dEb21Ob2RlID0gbnVsbDtcblx0XHR9XG5cblx0XHR0aGlzLl9saXN0ZW5PbkRvbU5vZGUgPSB0aGlzLl9vcHRpb25zLmxpc3Rlbk9uRG9tTm9kZSB8fCB0aGlzLl9kb21Ob2RlO1xuXG5cdFx0dGhpcy5fbW91c2VXaGVlbFRvRGlzcG9zZSA9IFtdO1xuXHRcdHRoaXMuX3NldExpc3RlbmluZ1RvTW91c2VXaGVlbCh0aGlzLl9vcHRpb25zLmhhbmRsZU1vdXNlV2hlZWwpO1xuXG5cdFx0dGhpcy5vbm1vdXNlb3Zlcih0aGlzLl9saXN0ZW5PbkRvbU5vZGUsIChlKSA9PiB0aGlzLl9vbk1vdXNlT3ZlcihlKSk7XG5cdFx0dGhpcy5vbm1vdXNlbGVhdmUodGhpcy5fbGlzdGVuT25Eb21Ob2RlLCAoZSkgPT4gdGhpcy5fb25Nb3VzZUxlYXZlKGUpKTtcblxuXHRcdHRoaXMuX2hpZGVUaW1lb3V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRpbWVvdXRUaW1lcigpKTtcblx0XHR0aGlzLl9pc0RyYWdnaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fbW91c2VJc092ZXIgPSBmYWxzZTtcblxuXHRcdHRoaXMuX3Nob3VsZFJlbmRlciA9IHRydWU7XG5cblx0XHR0aGlzLl9yZXZlYWxPblNjcm9sbCA9IHRydWU7XG5cblx0XHQvLyBTdWJzY3JpYmUgdG8gZ2xvYmFsIGRlZmF1bHQgc2l6ZSBjaGFuZ2VzLCBidXQgb25seSBmb3IgYXhlcyB3aG9zZSBzaXplXG5cdFx0Ly8gd2FzIE5PVCBleHBsaWNpdGx5IHByb3ZpZGVkLiBFbGVtZW50cyB3aXRoIGV4cGxpY2l0IHNpemVzIChlZGl0b3IsXG5cdFx0Ly8gbWVudXMsIHBlZWssIGNoYXQgaW5wdXQsIGV0Yy4pIHVzZSBhIGZpeGVkIHNpemUgYW5kIG11c3Qgbm90IGJlIHVwZGF0ZWQuXG5cdFx0Y29uc3QgaFNpemVFeHBsaWNpdCA9IHR5cGVvZiBvcHRpb25zLmhvcml6b250YWxTY3JvbGxiYXJTaXplICE9PSAndW5kZWZpbmVkJztcblx0XHRjb25zdCB2U2l6ZUV4cGxpY2l0ID0gdHlwZW9mIG9wdGlvbnMudmVydGljYWxTY3JvbGxiYXJTaXplICE9PSAndW5kZWZpbmVkJztcblx0XHRpZiAoIWhTaXplRXhwbGljaXQgfHwgIXZTaXplRXhwbGljaXQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlRGVmYXVsdFNjcm9sbGJhclNpemUobmV3U2l6ZSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdFx0Li4uKCFoU2l6ZUV4cGxpY2l0ID8geyBob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTogbmV3U2l6ZSB9IDoge30pLFxuXHRcdFx0XHRcdC4uLighdlNpemVFeHBsaWNpdCA/IHsgdmVydGljYWxTY3JvbGxiYXJTaXplOiBuZXdTaXplIH0gOiB7fSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX21vdXNlV2hlZWxUb0Rpc3Bvc2UgPSBkaXNwb3NlKHRoaXMuX21vdXNlV2hlZWxUb0Rpc3Bvc2UpO1xuXHRcdGlmICh0aGlzLl9pbmVydGlhbFRpbWVvdXQpIHtcblx0XHRcdHRoaXMuX2luZXJ0aWFsVGltZW91dC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9pbmVydGlhbFRpbWVvdXQgPSBudWxsO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IHRoZSBnZW5lcmF0ZWQgJ3Njcm9sbGFibGUnIGRvbSBub2RlXG5cdCAqL1xuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RvbU5vZGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0T3ZlcnZpZXdSdWxlckxheW91dEluZm8oKTogSU92ZXJ2aWV3UnVsZXJMYXlvdXRJbmZvIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFyZW50OiB0aGlzLl9kb21Ob2RlLFxuXHRcdFx0aW5zZXJ0QmVmb3JlOiB0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci5kb21Ob2RlLmRvbU5vZGUsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZWxlZ2F0ZSBhIHBvaW50ZXIgZG93biBldmVudCB0byB0aGUgdmVydGljYWwgc2Nyb2xsYmFyLlxuXHQgKiBUaGlzIGlzIHRvIGhlbHAgd2l0aCBjbGlja2luZyBzb21ld2hlcmUgZWxzZSBhbmQgaGF2aW5nIHRoZSBzY3JvbGxiYXIgcmVhY3QuXG5cdCAqL1xuXHRwdWJsaWMgZGVsZWdhdGVWZXJ0aWNhbFNjcm9sbGJhclBvaW50ZXJEb3duKGJyb3dzZXJFdmVudDogUG9pbnRlckV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fdmVydGljYWxTY3JvbGxiYXIuZGVsZWdhdGVQb2ludGVyRG93bihicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIGdldFNjcm9sbERpbWVuc2lvbnMoKTogSVNjcm9sbERpbWVuc2lvbnMge1xuXHRcdHJldHVybiB0aGlzLl9zY3JvbGxhYmxlLmdldFNjcm9sbERpbWVuc2lvbnMoKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTY3JvbGxEaW1lbnNpb25zKGRpbWVuc2lvbnM6IElOZXdTY3JvbGxEaW1lbnNpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZS5zZXRTY3JvbGxEaW1lbnNpb25zKGRpbWVuc2lvbnMsIGZhbHNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGUgdGhlIGNsYXNzIG5hbWUgb2YgdGhlIHNjcm9sbGFibGUgZWxlbWVudC5cblx0ICovXG5cdHB1YmxpYyB1cGRhdGVDbGFzc05hbWUobmV3Q2xhc3NOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9vcHRpb25zLmNsYXNzTmFtZSA9IG5ld0NsYXNzTmFtZTtcblx0XHQvLyBEZWZhdWx0cyBhcmUgZGlmZmVyZW50IG9uIE1hY3Ncblx0XHRpZiAocGxhdGZvcm0uaXNNYWNpbnRvc2gpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMuY2xhc3NOYW1lICs9ICcgbWFjJztcblx0XHR9XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc05hbWUgPSAnbW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAnICsgdGhpcy5fb3B0aW9ucy5jbGFzc05hbWU7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIGNvbmZpZ3VyYXRpb24gb3B0aW9ucyBmb3IgdGhlIHNjcm9sbGJhci5cblx0ICovXG5cdHB1YmxpYyB1cGRhdGVPcHRpb25zKG5ld09wdGlvbnM6IFNjcm9sbGFibGVFbGVtZW50Q2hhbmdlT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5oYW5kbGVNb3VzZVdoZWVsICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5oYW5kbGVNb3VzZVdoZWVsID0gbmV3T3B0aW9ucy5oYW5kbGVNb3VzZVdoZWVsO1xuXHRcdFx0dGhpcy5fc2V0TGlzdGVuaW5nVG9Nb3VzZVdoZWVsKHRoaXMuX29wdGlvbnMuaGFuZGxlTW91c2VXaGVlbCk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSA9IG5ld09wdGlvbnMubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5O1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgPSBuZXdPcHRpb25zLmZhc3RTY3JvbGxTZW5zaXRpdml0eTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLnNjcm9sbFByZWRvbWluYW50QXhpcyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuX29wdGlvbnMuc2Nyb2xsUHJlZG9taW5hbnRBeGlzID0gbmV3T3B0aW9ucy5zY3JvbGxQcmVkb21pbmFudEF4aXM7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy5ob3Jpem9udGFsICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5ob3Jpem9udGFsID0gbmV3T3B0aW9ucy5ob3Jpem9udGFsO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMudmVydGljYWwgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLnZlcnRpY2FsID0gbmV3T3B0aW9ucy52ZXJ0aWNhbDtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdPcHRpb25zLmhvcml6b250YWxTY3JvbGxiYXJTaXplICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSA9IG5ld09wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGJhclNpemU7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgbmV3T3B0aW9ucy52ZXJ0aWNhbFNjcm9sbGJhclNpemUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSA9IG5ld09wdGlvbnMudmVydGljYWxTY3JvbGxiYXJTaXplO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld09wdGlvbnMuc2Nyb2xsQnlQYWdlICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5zY3JvbGxCeVBhZ2UgPSBuZXdPcHRpb25zLnNjcm9sbEJ5UGFnZTtcblx0XHR9XG5cdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci51cGRhdGVPcHRpb25zKHRoaXMuX29wdGlvbnMpO1xuXHRcdHRoaXMuX3ZlcnRpY2FsU2Nyb2xsYmFyLnVwZGF0ZU9wdGlvbnModGhpcy5fb3B0aW9ucyk7XG5cblx0XHRpZiAoIXRoaXMuX29wdGlvbnMubGF6eVJlbmRlcikge1xuXHRcdFx0dGhpcy5fcmVuZGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldFJldmVhbE9uU2Nyb2xsKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fcmV2ZWFsT25TY3JvbGwgPSB2YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBkZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSB7XG5cdFx0dGhpcy5fb25Nb3VzZVdoZWVsKG5ldyBTdGFuZGFyZFdoZWVsRXZlbnQoYnJvd3NlckV2ZW50KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wZXJpb2RpY1N5bmMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IHNjaGVkdWxlQWdhaW4gPSBmYWxzZTtcblxuXHRcdGlmICh0aGlzLl9pbmVydGlhbFNwZWVkLlggIT09IDAgfHwgdGhpcy5faW5lcnRpYWxTcGVlZC5ZICE9PSAwKSB7XG5cdFx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbFBvc2l0aW9uTm93KHtcblx0XHRcdFx0c2Nyb2xsVG9wOiB0aGlzLl9zY3JvbGxhYmxlLmdldEN1cnJlbnRTY3JvbGxQb3NpdGlvbigpLnNjcm9sbFRvcCAtIHRoaXMuX2luZXJ0aWFsU3BlZWQuWSAqIDEwMCxcblx0XHRcdFx0c2Nyb2xsTGVmdDogdGhpcy5fc2Nyb2xsYWJsZS5nZXRDdXJyZW50U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxMZWZ0IC0gdGhpcy5faW5lcnRpYWxTcGVlZC5YICogMTAwXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2luZXJ0aWFsU3BlZWQuWCAqPSAwLjk7XG5cdFx0XHR0aGlzLl9pbmVydGlhbFNwZWVkLlkgKj0gMC45O1xuXHRcdFx0aWYgKE1hdGguYWJzKHRoaXMuX2luZXJ0aWFsU3BlZWQuWCkgPCAwLjAxKSB7XG5cdFx0XHRcdHRoaXMuX2luZXJ0aWFsU3BlZWQuWCA9IDA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoTWF0aC5hYnModGhpcy5faW5lcnRpYWxTcGVlZC5ZKSA8IDAuMDEpIHtcblx0XHRcdFx0dGhpcy5faW5lcnRpYWxTcGVlZC5ZID0gMDtcblx0XHRcdH1cblxuXHRcdFx0c2NoZWR1bGVBZ2FpbiA9ICh0aGlzLl9pbmVydGlhbFNwZWVkLlggIT09IDAgfHwgdGhpcy5faW5lcnRpYWxTcGVlZC5ZICE9PSAwKTtcblx0XHR9XG5cblx0XHRpZiAoc2NoZWR1bGVBZ2Fpbikge1xuXHRcdFx0aWYgKCF0aGlzLl9pbmVydGlhbFRpbWVvdXQpIHtcblx0XHRcdFx0dGhpcy5faW5lcnRpYWxUaW1lb3V0ID0gbmV3IFRpbWVvdXRUaW1lcigpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW5lcnRpYWxUaW1lb3V0LmNhbmNlbEFuZFNldCgoKSA9PiB0aGlzLl9wZXJpb2RpY1N5bmMoKSwgMTAwMCAvIDYwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faW5lcnRpYWxUaW1lb3V0Py5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9pbmVydGlhbFRpbWVvdXQgPSBudWxsO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tIG1vdXNlIHdoZWVsIHNjcm9sbGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgX3NldExpc3RlbmluZ1RvTW91c2VXaGVlbChzaG91bGRMaXN0ZW46IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBpc0xpc3RlbmluZyA9ICh0aGlzLl9tb3VzZVdoZWVsVG9EaXNwb3NlLmxlbmd0aCA+IDApO1xuXG5cdFx0aWYgKGlzTGlzdGVuaW5nID09PSBzaG91bGRMaXN0ZW4pIHtcblx0XHRcdC8vIE5vIGNoYW5nZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFN0b3AgbGlzdGVuaW5nIChpZiBuZWNlc3NhcnkpXG5cdFx0dGhpcy5fbW91c2VXaGVlbFRvRGlzcG9zZSA9IGRpc3Bvc2UodGhpcy5fbW91c2VXaGVlbFRvRGlzcG9zZSk7XG5cblx0XHQvLyBTdGFydCBsaXN0ZW5pbmcgKGlmIG5lY2Vzc2FyeSlcblx0XHRpZiAoc2hvdWxkTGlzdGVuKSB7XG5cdFx0XHRjb25zdCBvbk1vdXNlV2hlZWwgPSAoYnJvd3NlckV2ZW50OiBJTW91c2VXaGVlbEV2ZW50KSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uTW91c2VXaGVlbChuZXcgU3RhbmRhcmRXaGVlbEV2ZW50KGJyb3dzZXJFdmVudCkpO1xuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fbW91c2VXaGVlbFRvRGlzcG9zZS5wdXNoKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fbGlzdGVuT25Eb21Ob2RlLCBkb20uRXZlbnRUeXBlLk1PVVNFX1dIRUVMLCBvbk1vdXNlV2hlZWwsIHsgcGFzc2l2ZTogZmFsc2UgfSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uTW91c2VXaGVlbChlOiBTdGFuZGFyZFdoZWVsRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZS5icm93c2VyRXZlbnQ/LmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjbGFzc2lmaWVyID0gTW91c2VXaGVlbENsYXNzaWZpZXIuSU5TVEFOQ0U7XG5cdFx0aWYgKFNDUk9MTF9XSEVFTF9TTU9PVEhfU0NST0xMX0VOQUJMRUQpIHtcblx0XHRcdGNsYXNzaWZpZXIuYWNjZXB0U3RhbmRhcmRXaGVlbEV2ZW50KGUpO1xuXHRcdH1cblxuXHRcdC8vIHVzZWZ1bCBmb3IgY3JlYXRpbmcgdW5pdCB0ZXN0czpcblx0XHQvLyBjb25zb2xlLmxvZyhgJHtEYXRlLm5vdygpfSwgJHtlLmRlbHRhWX0sICR7ZS5kZWx0YVh9YCk7XG5cblx0XHRsZXQgZGlkU2Nyb2xsID0gZmFsc2U7XG5cblx0XHRpZiAoZS5kZWx0YVkgfHwgZS5kZWx0YVgpIHtcblx0XHRcdGxldCBkZWx0YVkgPSBlLmRlbHRhWSAqIHRoaXMuX29wdGlvbnMubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5O1xuXHRcdFx0bGV0IGRlbHRhWCA9IGUuZGVsdGFYICogdGhpcy5fb3B0aW9ucy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk7XG5cblx0XHRcdGlmICh0aGlzLl9vcHRpb25zLnNjcm9sbFByZWRvbWluYW50QXhpcykge1xuXHRcdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5zY3JvbGxZVG9YICYmIGRlbHRhWCArIGRlbHRhWSA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIHdoZW4gY29uZmlndXJlZCB0byBtYXAgWSB0byBYIGFuZCB3ZSBib3RoIHNlZVxuXHRcdFx0XHRcdC8vIG5vIGRvbWluYW50IGF4aXMgYW5kIFggYW5kIFkgYXJlIGNvbXBldGluZyB3aXRoXG5cdFx0XHRcdFx0Ly8gaWRlbnRpY2FsIHZhbHVlcyBpbnRvIG9wcG9zaXRlIGRpcmVjdGlvbnMsIHdlXG5cdFx0XHRcdFx0Ly8gaWdub3JlIHRoZSBkZWx0YSBhcyB3ZSBjYW5ub3QgbWFrZSBhIGRlY2lzaW9uIHRoZW5cblx0XHRcdFx0XHRkZWx0YVggPSBkZWx0YVkgPSAwO1xuXHRcdFx0XHR9IGVsc2UgaWYgKE1hdGguYWJzKGRlbHRhWSkgPj0gTWF0aC5hYnMoZGVsdGFYKSkge1xuXHRcdFx0XHRcdGRlbHRhWCA9IDA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVsdGFZID0gMDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5mbGlwQXhlcykge1xuXHRcdFx0XHRbZGVsdGFZLCBkZWx0YVhdID0gW2RlbHRhWCwgZGVsdGFZXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29udmVydCB2ZXJ0aWNhbCBzY3JvbGxpbmcgdG8gaG9yaXpvbnRhbCBpZiBzaGlmdCBpcyBoZWxkLCB0aGlzXG5cdFx0XHQvLyBpcyBoYW5kbGVkIGF0IGEgaGlnaGVyIGxldmVsIG9uIE1hY1xuXHRcdFx0Y29uc3Qgc2hpZnRDb252ZXJ0ID0gIXBsYXRmb3JtLmlzTWFjaW50b3NoICYmIGUuYnJvd3NlckV2ZW50ICYmIGUuYnJvd3NlckV2ZW50LnNoaWZ0S2V5O1xuXHRcdFx0aWYgKCh0aGlzLl9vcHRpb25zLnNjcm9sbFlUb1ggfHwgc2hpZnRDb252ZXJ0KSAmJiAhZGVsdGFYKSB7XG5cdFx0XHRcdGRlbHRhWCA9IGRlbHRhWTtcblx0XHRcdFx0ZGVsdGFZID0gMDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGUuYnJvd3NlckV2ZW50ICYmIGUuYnJvd3NlckV2ZW50LmFsdEtleSkge1xuXHRcdFx0XHQvLyBmYXN0U2Nyb2xsaW5nXG5cdFx0XHRcdGRlbHRhWCA9IGRlbHRhWCAqIHRoaXMuX29wdGlvbnMuZmFzdFNjcm9sbFNlbnNpdGl2aXR5O1xuXHRcdFx0XHRkZWx0YVkgPSBkZWx0YVkgKiB0aGlzLl9vcHRpb25zLmZhc3RTY3JvbGxTZW5zaXRpdml0eTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZnV0dXJlU2Nyb2xsUG9zaXRpb24gPSB0aGlzLl9zY3JvbGxhYmxlLmdldEZ1dHVyZVNjcm9sbFBvc2l0aW9uKCk7XG5cblx0XHRcdGxldCBkZXNpcmVkU2Nyb2xsUG9zaXRpb246IElOZXdTY3JvbGxQb3NpdGlvbiA9IHt9O1xuXHRcdFx0aWYgKGRlbHRhWSkge1xuXHRcdFx0XHRjb25zdCBkZWx0YVNjcm9sbFRvcCA9IFNDUk9MTF9XSEVFTF9TRU5TSVRJVklUWSAqIGRlbHRhWTtcblx0XHRcdFx0Ly8gSGVyZSB3ZSBjb252ZXJ0IHZhbHVlcyBzdWNoIGFzIC0wLjMgdG8gLTEgb3IgMC4zIHRvIDEsIG90aGVyd2lzZSBsb3cgc3BlZWQgc2Nyb2xsaW5nIHdpbGwgbmV2ZXIgc2Nyb2xsXG5cdFx0XHRcdGNvbnN0IGRlc2lyZWRTY3JvbGxUb3AgPSBmdXR1cmVTY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AgLSAoZGVsdGFTY3JvbGxUb3AgPCAwID8gTWF0aC5mbG9vcihkZWx0YVNjcm9sbFRvcCkgOiBNYXRoLmNlaWwoZGVsdGFTY3JvbGxUb3ApKTtcblx0XHRcdFx0dGhpcy5fdmVydGljYWxTY3JvbGxiYXIud3JpdGVTY3JvbGxQb3NpdGlvbihkZXNpcmVkU2Nyb2xsUG9zaXRpb24sIGRlc2lyZWRTY3JvbGxUb3ApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRlbHRhWCkge1xuXHRcdFx0XHRjb25zdCBkZWx0YVNjcm9sbExlZnQgPSBTQ1JPTExfV0hFRUxfU0VOU0lUSVZJVFkgKiBkZWx0YVg7XG5cdFx0XHRcdC8vIEhlcmUgd2UgY29udmVydCB2YWx1ZXMgc3VjaCBhcyAtMC4zIHRvIC0xIG9yIDAuMyB0byAxLCBvdGhlcndpc2UgbG93IHNwZWVkIHNjcm9sbGluZyB3aWxsIG5ldmVyIHNjcm9sbFxuXHRcdFx0XHRjb25zdCBkZXNpcmVkU2Nyb2xsTGVmdCA9IGZ1dHVyZVNjcm9sbFBvc2l0aW9uLnNjcm9sbExlZnQgLSAoZGVsdGFTY3JvbGxMZWZ0IDwgMCA/IE1hdGguZmxvb3IoZGVsdGFTY3JvbGxMZWZ0KSA6IE1hdGguY2VpbChkZWx0YVNjcm9sbExlZnQpKTtcblx0XHRcdFx0dGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci53cml0ZVNjcm9sbFBvc2l0aW9uKGRlc2lyZWRTY3JvbGxQb3NpdGlvbiwgZGVzaXJlZFNjcm9sbExlZnQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayB0aGF0IHdlIGFyZSBzY3JvbGxpbmcgdG93YXJkcyBhIGxvY2F0aW9uIHdoaWNoIGlzIHZhbGlkXG5cdFx0XHRkZXNpcmVkU2Nyb2xsUG9zaXRpb24gPSB0aGlzLl9zY3JvbGxhYmxlLnZhbGlkYXRlU2Nyb2xsUG9zaXRpb24oZGVzaXJlZFNjcm9sbFBvc2l0aW9uKTtcblxuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMuaW5lcnRpYWxTY3JvbGwgJiYgKGRlbHRhWCB8fCBkZWx0YVkpICYmICFjbGFzc2lmaWVyLmlzUGh5c2ljYWxNb3VzZVdoZWVsKCkpIHtcblx0XHRcdFx0bGV0IHN0YXJ0UGVyaW9kaWMgPSBmYWxzZTtcblx0XHRcdFx0Ly8gT25seSBzdGFydCBwZXJpb2RpYyBpZiBpdCdzIG5vdCBydW5uaW5nXG5cdFx0XHRcdGlmICh0aGlzLl9pbmVydGlhbFNwZWVkLlggPT09IDAgJiYgdGhpcy5faW5lcnRpYWxTcGVlZC5ZID09PSAwKSB7XG5cdFx0XHRcdFx0c3RhcnRQZXJpb2RpYyA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5faW5lcnRpYWxTcGVlZC5ZID0gKGRlbHRhWSA8IDAgPyAtMSA6IDEpICogKE1hdGguYWJzKGRlbHRhWSkgKiogMS4wMik7XG5cdFx0XHRcdHRoaXMuX2luZXJ0aWFsU3BlZWQuWCA9IChkZWx0YVggPCAwID8gLTEgOiAxKSAqIChNYXRoLmFicyhkZWx0YVgpICoqIDEuMDIpO1xuXHRcdFx0XHRpZiAoc3RhcnRQZXJpb2RpYykge1xuXHRcdFx0XHRcdHRoaXMuX3BlcmlvZGljU3luYygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmdXR1cmVTY3JvbGxQb3NpdGlvbi5zY3JvbGxMZWZ0ICE9PSBkZXNpcmVkU2Nyb2xsUG9zaXRpb24uc2Nyb2xsTGVmdCB8fCBmdXR1cmVTY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3AgIT09IGRlc2lyZWRTY3JvbGxQb3NpdGlvbi5zY3JvbGxUb3ApIHtcblxuXHRcdFx0XHRjb25zdCBjYW5QZXJmb3JtU21vb3RoU2Nyb2xsID0gKFxuXHRcdFx0XHRcdFNDUk9MTF9XSEVFTF9TTU9PVEhfU0NST0xMX0VOQUJMRURcblx0XHRcdFx0XHQmJiB0aGlzLl9vcHRpb25zLm1vdXNlV2hlZWxTbW9vdGhTY3JvbGxcblx0XHRcdFx0XHQmJiBjbGFzc2lmaWVyLmlzUGh5c2ljYWxNb3VzZVdoZWVsKClcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAoY2FuUGVyZm9ybVNtb290aFNjcm9sbCkge1xuXHRcdFx0XHRcdHRoaXMuX3Njcm9sbGFibGUuc2V0U2Nyb2xsUG9zaXRpb25TbW9vdGgoZGVzaXJlZFNjcm9sbFBvc2l0aW9uKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zY3JvbGxhYmxlLnNldFNjcm9sbFBvc2l0aW9uTm93KGRlc2lyZWRTY3JvbGxQb3NpdGlvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRkaWRTY3JvbGwgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBjb25zdW1lTW91c2VXaGVlbCA9IGRpZFNjcm9sbDtcblx0XHRpZiAoIWNvbnN1bWVNb3VzZVdoZWVsICYmIHRoaXMuX29wdGlvbnMuYWx3YXlzQ29uc3VtZU1vdXNlV2hlZWwpIHtcblx0XHRcdGNvbnN1bWVNb3VzZVdoZWVsID0gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFjb25zdW1lTW91c2VXaGVlbCAmJiB0aGlzLl9vcHRpb25zLmNvbnN1bWVNb3VzZVdoZWVsSWZTY3JvbGxiYXJJc05lZWRlZCAmJiAodGhpcy5fdmVydGljYWxTY3JvbGxiYXIuaXNOZWVkZWQoKSB8fCB0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyLmlzTmVlZGVkKCkpKSB7XG5cdFx0XHRjb25zdW1lTW91c2VXaGVlbCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbnN1bWVNb3VzZVdoZWVsKSB7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uRGlkU2Nyb2xsKGU6IFNjcm9sbEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fc2hvdWxkUmVuZGVyID0gdGhpcy5faG9yaXpvbnRhbFNjcm9sbGJhci5vbkRpZFNjcm9sbChlKSB8fCB0aGlzLl9zaG91bGRSZW5kZXI7XG5cdFx0dGhpcy5fc2hvdWxkUmVuZGVyID0gdGhpcy5fdmVydGljYWxTY3JvbGxiYXIub25EaWRTY3JvbGwoZSkgfHwgdGhpcy5fc2hvdWxkUmVuZGVyO1xuXG5cdFx0aWYgKHRoaXMuX29wdGlvbnMudXNlU2hhZG93cykge1xuXHRcdFx0dGhpcy5fc2hvdWxkUmVuZGVyID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcmV2ZWFsT25TY3JvbGwpIHtcblx0XHRcdHRoaXMuX3JldmVhbCgpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fb3B0aW9ucy5sYXp5UmVuZGVyKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXIoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIC8gbXV0YXRlIHRoZSBET00gbm93LlxuXHQgKiBTaG91bGQgYmUgdXNlZCB0b2dldGhlciB3aXRoIHRoZSBjdG9yIG9wdGlvbiBgbGF6eVJlbmRlcmAuXG5cdCAqL1xuXHRwdWJsaWMgcmVuZGVyTm93KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fb3B0aW9ucy5sYXp5UmVuZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1BsZWFzZSB1c2UgYGxhenlSZW5kZXJgIHRvZ2V0aGVyIHdpdGggYHJlbmRlck5vd2AhJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zaG91bGRSZW5kZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zaG91bGRSZW5kZXIgPSBmYWxzZTtcblxuXHRcdHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIucmVuZGVyKCk7XG5cdFx0dGhpcy5fdmVydGljYWxTY3JvbGxiYXIucmVuZGVyKCk7XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy51c2VTaGFkb3dzKSB7XG5cdFx0XHRjb25zdCBzY3JvbGxTdGF0ZSA9IHRoaXMuX3Njcm9sbGFibGUuZ2V0Q3VycmVudFNjcm9sbFBvc2l0aW9uKCk7XG5cdFx0XHRjb25zdCBlbmFibGVUb3AgPSBzY3JvbGxTdGF0ZS5zY3JvbGxUb3AgPiAwO1xuXHRcdFx0Y29uc3QgZW5hYmxlTGVmdCA9IHNjcm9sbFN0YXRlLnNjcm9sbExlZnQgPiAwO1xuXG5cdFx0XHRjb25zdCBsZWZ0Q2xhc3NOYW1lID0gKGVuYWJsZUxlZnQgPyAnIGxlZnQnIDogJycpO1xuXHRcdFx0Y29uc3QgdG9wQ2xhc3NOYW1lID0gKGVuYWJsZVRvcCA/ICcgdG9wJyA6ICcnKTtcblx0XHRcdGNvbnN0IHRvcExlZnRDbGFzc05hbWUgPSAoZW5hYmxlTGVmdCB8fCBlbmFibGVUb3AgPyAnIHRvcC1sZWZ0LWNvcm5lcicgOiAnJyk7XG5cdFx0XHR0aGlzLl9sZWZ0U2hhZG93RG9tTm9kZSEuc2V0Q2xhc3NOYW1lKGBzaGFkb3cke2xlZnRDbGFzc05hbWV9YCk7XG5cdFx0XHR0aGlzLl90b3BTaGFkb3dEb21Ob2RlIS5zZXRDbGFzc05hbWUoYHNoYWRvdyR7dG9wQ2xhc3NOYW1lfWApO1xuXHRcdFx0dGhpcy5fdG9wTGVmdFNoYWRvd0RvbU5vZGUhLnNldENsYXNzTmFtZShgc2hhZG93JHt0b3BMZWZ0Q2xhc3NOYW1lfSR7dG9wQ2xhc3NOYW1lfSR7bGVmdENsYXNzTmFtZX1gKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLSBmYWRlIGluIC8gZmFkZSBvdXQgLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9vbkRyYWdTdGFydCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0RyYWdnaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9yZXZlYWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX29uRHJhZ0VuZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0RyYWdnaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5faGlkZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Nb3VzZUxlYXZlKGU6IElNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fbW91c2VJc092ZXIgPSBmYWxzZTtcblx0XHR0aGlzLl9oaWRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbk1vdXNlT3ZlcihlOiBJTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX21vdXNlSXNPdmVyID0gdHJ1ZTtcblx0XHR0aGlzLl9yZXZlYWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JldmVhbCgpOiB2b2lkIHtcblx0XHR0aGlzLl92ZXJ0aWNhbFNjcm9sbGJhci5iZWdpblJldmVhbCgpO1xuXHRcdHRoaXMuX2hvcml6b250YWxTY3JvbGxiYXIuYmVnaW5SZXZlYWwoKTtcblx0XHR0aGlzLl9zY2hlZHVsZUhpZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9tb3VzZUlzT3ZlciAmJiAhdGhpcy5faXNEcmFnZ2luZykge1xuXHRcdFx0dGhpcy5fdmVydGljYWxTY3JvbGxiYXIuYmVnaW5IaWRlKCk7XG5cdFx0XHR0aGlzLl9ob3Jpem9udGFsU2Nyb2xsYmFyLmJlZ2luSGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlSGlkZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX21vdXNlSXNPdmVyICYmICF0aGlzLl9pc0RyYWdnaW5nKSB7XG5cdFx0XHR0aGlzLl9oaWRlVGltZW91dC5jYW5jZWxBbmRTZXQoKCkgPT4gdGhpcy5faGlkZSgpLCBISURFX1RJTUVPVVQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2Nyb2xsYWJsZUVsZW1lbnQgZXh0ZW5kcyBBYnN0cmFjdFNjcm9sbGFibGVFbGVtZW50IHtcblxuXHRjb25zdHJ1Y3RvcihlbGVtZW50OiBIVE1MRWxlbWVudCwgb3B0aW9uczogU2Nyb2xsYWJsZUVsZW1lbnRDcmVhdGlvbk9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblx0XHRvcHRpb25zLm1vdXNlV2hlZWxTbW9vdGhTY3JvbGwgPSBmYWxzZTtcblx0XHRjb25zdCBzY3JvbGxhYmxlID0gbmV3IFNjcm9sbGFibGUoe1xuXHRcdFx0Zm9yY2VJbnRlZ2VyVmFsdWVzOiB0cnVlLFxuXHRcdFx0c21vb3RoU2Nyb2xsRHVyYXRpb246IDAsXG5cdFx0XHRzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lOiAoY2FsbGJhY2spID0+IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coZWxlbWVudCksIGNhbGxiYWNrKVxuXHRcdH0pO1xuXHRcdHN1cGVyKGVsZW1lbnQsIG9wdGlvbnMsIHNjcm9sbGFibGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNjcm9sbGFibGUpO1xuXHR9XG5cblx0cHVibGljIHNldFNjcm9sbFBvc2l0aW9uKHVwZGF0ZTogSU5ld1Njcm9sbFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvbk5vdyh1cGRhdGUpO1xuXHR9XG5cblx0cHVibGljIGdldFNjcm9sbFBvc2l0aW9uKCk6IElTY3JvbGxQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Njcm9sbGFibGUuZ2V0Q3VycmVudFNjcm9sbFBvc2l0aW9uKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNtb290aFNjcm9sbGFibGVFbGVtZW50IGV4dGVuZHMgQWJzdHJhY3RTY3JvbGxhYmxlRWxlbWVudCB7XG5cblx0Y29uc3RydWN0b3IoZWxlbWVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IFNjcm9sbGFibGVFbGVtZW50Q3JlYXRpb25PcHRpb25zLCBzY3JvbGxhYmxlOiBTY3JvbGxhYmxlKSB7XG5cdFx0c3VwZXIoZWxlbWVudCwgb3B0aW9ucywgc2Nyb2xsYWJsZSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0U2Nyb2xsUG9zaXRpb24odXBkYXRlOiBJTmV3U2Nyb2xsUG9zaXRpb24gJiB7IHJldXNlQW5pbWF0aW9uPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0aWYgKHVwZGF0ZS5yZXVzZUFuaW1hdGlvbikge1xuXHRcdFx0dGhpcy5fc2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvblNtb290aCh1cGRhdGUsIHVwZGF0ZS5yZXVzZUFuaW1hdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Njcm9sbGFibGUuc2V0U2Nyb2xsUG9zaXRpb25Ob3codXBkYXRlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0U2Nyb2xsUG9zaXRpb24oKTogSVNjcm9sbFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Nyb2xsYWJsZS5nZXRDdXJyZW50U2Nyb2xsUG9zaXRpb24oKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBEb21TY3JvbGxhYmxlRWxlbWVudCBleHRlbmRzIEFic3RyYWN0U2Nyb2xsYWJsZUVsZW1lbnQge1xuXG5cdHByaXZhdGUgX2VsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBTY3JvbGxhYmxlRWxlbWVudENyZWF0aW9uT3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXHRcdG9wdGlvbnMubW91c2VXaGVlbFNtb290aFNjcm9sbCA9IGZhbHNlO1xuXHRcdGNvbnN0IHNjcm9sbGFibGUgPSBuZXcgU2Nyb2xsYWJsZSh7XG5cdFx0XHRmb3JjZUludGVnZXJWYWx1ZXM6IGZhbHNlLCAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzOTg3N1xuXHRcdFx0c21vb3RoU2Nyb2xsRHVyYXRpb246IDAsXG5cdFx0XHRzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lOiAoY2FsbGJhY2spID0+IGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3coZWxlbWVudCksIGNhbGxiYWNrKVxuXHRcdH0pO1xuXHRcdHN1cGVyKGVsZW1lbnQsIG9wdGlvbnMsIHNjcm9sbGFibGUpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHNjcm9sbGFibGUpO1xuXHRcdHRoaXMuX2VsZW1lbnQgPSBlbGVtZW50O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25TY3JvbGwoKGUpID0+IHtcblx0XHRcdGlmIChlLnNjcm9sbFRvcENoYW5nZWQpIHtcblx0XHRcdFx0dGhpcy5fZWxlbWVudC5zY3JvbGxUb3AgPSBlLnNjcm9sbFRvcDtcblx0XHRcdH1cblx0XHRcdGlmIChlLnNjcm9sbExlZnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX2VsZW1lbnQuc2Nyb2xsTGVmdCA9IGUuc2Nyb2xsTGVmdDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5zY2FuRG9tTm9kZSgpO1xuXHR9XG5cblx0cHVibGljIHNldFNjcm9sbFBvc2l0aW9uKHVwZGF0ZTogSU5ld1Njcm9sbFBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Nyb2xsYWJsZS5zZXRTY3JvbGxQb3NpdGlvbk5vdyh1cGRhdGUpO1xuXHR9XG5cblx0cHVibGljIGdldFNjcm9sbFBvc2l0aW9uKCk6IElTY3JvbGxQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Njcm9sbGFibGUuZ2V0Q3VycmVudFNjcm9sbFBvc2l0aW9uKCk7XG5cdH1cblxuXHRwdWJsaWMgc2NhbkRvbU5vZGUoKTogdm9pZCB7XG5cdFx0Ly8gd2lkdGgsIHNjcm9sbExlZnQsIHNjcm9sbFdpZHRoLCBoZWlnaHQsIHNjcm9sbFRvcCwgc2Nyb2xsSGVpZ2h0XG5cdFx0dGhpcy5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdHdpZHRoOiB0aGlzLl9lbGVtZW50LmNsaWVudFdpZHRoLFxuXHRcdFx0c2Nyb2xsV2lkdGg6IHRoaXMuX2VsZW1lbnQuc2Nyb2xsV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IHRoaXMuX2VsZW1lbnQuY2xpZW50SGVpZ2h0LFxuXHRcdFx0c2Nyb2xsSGVpZ2h0OiB0aGlzLl9lbGVtZW50LnNjcm9sbEhlaWdodFxuXHRcdH0pO1xuXHRcdHRoaXMuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0c2Nyb2xsTGVmdDogdGhpcy5fZWxlbWVudC5zY3JvbGxMZWZ0LFxuXHRcdFx0c2Nyb2xsVG9wOiB0aGlzLl9lbGVtZW50LnNjcm9sbFRvcCxcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiByZXNvbHZlT3B0aW9ucyhvcHRzOiBTY3JvbGxhYmxlRWxlbWVudENyZWF0aW9uT3B0aW9ucyk6IFNjcm9sbGFibGVFbGVtZW50UmVzb2x2ZWRPcHRpb25zIHtcblx0Y29uc3QgcmVzdWx0OiBTY3JvbGxhYmxlRWxlbWVudFJlc29sdmVkT3B0aW9ucyA9IHtcblx0XHRsYXp5UmVuZGVyOiAodHlwZW9mIG9wdHMubGF6eVJlbmRlciAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmxhenlSZW5kZXIgOiBmYWxzZSksXG5cdFx0Y2xhc3NOYW1lOiAodHlwZW9mIG9wdHMuY2xhc3NOYW1lICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuY2xhc3NOYW1lIDogJycpLFxuXHRcdHVzZVNoYWRvd3M6ICh0eXBlb2Ygb3B0cy51c2VTaGFkb3dzICE9PSAndW5kZWZpbmVkJyA/IG9wdHMudXNlU2hhZG93cyA6IHRydWUpLFxuXHRcdGhhbmRsZU1vdXNlV2hlZWw6ICh0eXBlb2Ygb3B0cy5oYW5kbGVNb3VzZVdoZWVsICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuaGFuZGxlTW91c2VXaGVlbCA6IHRydWUpLFxuXHRcdGZsaXBBeGVzOiAodHlwZW9mIG9wdHMuZmxpcEF4ZXMgIT09ICd1bmRlZmluZWQnID8gb3B0cy5mbGlwQXhlcyA6IGZhbHNlKSxcblx0XHRjb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQ6ICh0eXBlb2Ygb3B0cy5jb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQgIT09ICd1bmRlZmluZWQnID8gb3B0cy5jb25zdW1lTW91c2VXaGVlbElmU2Nyb2xsYmFySXNOZWVkZWQgOiBmYWxzZSksXG5cdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6ICh0eXBlb2Ygb3B0cy5hbHdheXNDb25zdW1lTW91c2VXaGVlbCAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsIDogZmFsc2UpLFxuXHRcdHNjcm9sbFlUb1g6ICh0eXBlb2Ygb3B0cy5zY3JvbGxZVG9YICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuc2Nyb2xsWVRvWCA6IGZhbHNlKSxcblx0XHRtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHk6ICh0eXBlb2Ygb3B0cy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgIT09ICd1bmRlZmluZWQnID8gb3B0cy5tb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgOiAxKSxcblx0XHRmYXN0U2Nyb2xsU2Vuc2l0aXZpdHk6ICh0eXBlb2Ygb3B0cy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgIT09ICd1bmRlZmluZWQnID8gb3B0cy5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgOiA1KSxcblx0XHRzY3JvbGxQcmVkb21pbmFudEF4aXM6ICh0eXBlb2Ygb3B0cy5zY3JvbGxQcmVkb21pbmFudEF4aXMgIT09ICd1bmRlZmluZWQnID8gb3B0cy5zY3JvbGxQcmVkb21pbmFudEF4aXMgOiB0cnVlKSxcblx0XHRtb3VzZVdoZWVsU21vb3RoU2Nyb2xsOiAodHlwZW9mIG9wdHMubW91c2VXaGVlbFNtb290aFNjcm9sbCAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLm1vdXNlV2hlZWxTbW9vdGhTY3JvbGwgOiB0cnVlKSxcblx0XHRpbmVydGlhbFNjcm9sbDogKHR5cGVvZiBvcHRzLmluZXJ0aWFsU2Nyb2xsICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuaW5lcnRpYWxTY3JvbGwgOiBmYWxzZSksXG5cdFx0YXJyb3dTaXplOiAodHlwZW9mIG9wdHMuYXJyb3dTaXplICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuYXJyb3dTaXplIDogMTEpLFxuXG5cdFx0bGlzdGVuT25Eb21Ob2RlOiAodHlwZW9mIG9wdHMubGlzdGVuT25Eb21Ob2RlICE9PSAndW5kZWZpbmVkJyA/IG9wdHMubGlzdGVuT25Eb21Ob2RlIDogbnVsbCksXG5cblx0XHRob3Jpem9udGFsOiAodHlwZW9mIG9wdHMuaG9yaXpvbnRhbCAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmhvcml6b250YWwgOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8pLFxuXHRcdGhvcml6b250YWxTY3JvbGxiYXJTaXplOiAodHlwZW9mIG9wdHMuaG9yaXpvbnRhbFNjcm9sbGJhclNpemUgIT09ICd1bmRlZmluZWQnID8gb3B0cy5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSA6IGdsb2JhbERlZmF1bHRTY3JvbGxiYXJTaXplKSxcblx0XHRob3Jpem9udGFsU2xpZGVyU2l6ZTogKHR5cGVvZiBvcHRzLmhvcml6b250YWxTbGlkZXJTaXplICE9PSAndW5kZWZpbmVkJyA/IG9wdHMuaG9yaXpvbnRhbFNsaWRlclNpemUgOiAwKSxcblx0XHRob3Jpem9udGFsSGFzQXJyb3dzOiAodHlwZW9mIG9wdHMuaG9yaXpvbnRhbEhhc0Fycm93cyAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLmhvcml6b250YWxIYXNBcnJvd3MgOiBmYWxzZSksXG5cblx0XHR2ZXJ0aWNhbDogKHR5cGVvZiBvcHRzLnZlcnRpY2FsICE9PSAndW5kZWZpbmVkJyA/IG9wdHMudmVydGljYWwgOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8pLFxuXHRcdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogKHR5cGVvZiBvcHRzLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRzLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSA6IGdsb2JhbERlZmF1bHRTY3JvbGxiYXJTaXplKSxcblx0XHR2ZXJ0aWNhbEhhc0Fycm93czogKHR5cGVvZiBvcHRzLnZlcnRpY2FsSGFzQXJyb3dzICE9PSAndW5kZWZpbmVkJyA/IG9wdHMudmVydGljYWxIYXNBcnJvd3MgOiBmYWxzZSksXG5cdFx0dmVydGljYWxTbGlkZXJTaXplOiAodHlwZW9mIG9wdHMudmVydGljYWxTbGlkZXJTaXplICE9PSAndW5kZWZpbmVkJyA/IG9wdHMudmVydGljYWxTbGlkZXJTaXplIDogMCksXG5cblx0XHRzY3JvbGxCeVBhZ2U6ICh0eXBlb2Ygb3B0cy5zY3JvbGxCeVBhZ2UgIT09ICd1bmRlZmluZWQnID8gb3B0cy5zY3JvbGxCeVBhZ2UgOiBmYWxzZSlcblx0fTtcblxuXHRyZXN1bHQuaG9yaXpvbnRhbFNsaWRlclNpemUgPSAodHlwZW9mIG9wdHMuaG9yaXpvbnRhbFNsaWRlclNpemUgIT09ICd1bmRlZmluZWQnID8gb3B0cy5ob3Jpem9udGFsU2xpZGVyU2l6ZSA6IHJlc3VsdC5ob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZSk7XG5cdHJlc3VsdC52ZXJ0aWNhbFNsaWRlclNpemUgPSAodHlwZW9mIG9wdHMudmVydGljYWxTbGlkZXJTaXplICE9PSAndW5kZWZpbmVkJyA/IG9wdHMudmVydGljYWxTbGlkZXJTaXplIDogcmVzdWx0LnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZSk7XG5cblx0Ly8gRGVmYXVsdHMgYXJlIGRpZmZlcmVudCBvbiBNYWNzXG5cdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdHJlc3VsdC5jbGFzc05hbWUgKz0gJyBtYWMnO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZSxnQkFBZ0I7QUFDeEMsWUFBWSxTQUFTO0FBQ3JCLFNBQXNCLHlCQUF5QjtBQUMvQyxTQUF3QywwQkFBMEI7QUFFbEUsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBc0I7QUFDL0IsU0FBc0IsZUFBZTtBQUNyQyxZQUFZLGNBQWM7QUFDMUIsU0FBb0csWUFBWSwyQkFBMkI7QUFDM0ksT0FBTztBQUVQLE1BQU0sZUFBZTtBQUNyQixNQUFNLDJCQUEyQjtBQUNqQyxNQUFNLHFDQUFxQztBQUdwQyxNQUFNLHlCQUF5QjtBQUN0QyxJQUFJLDZCQUE2QjtBQUNqQyxNQUFNLDBDQUEwQyxJQUFJLFFBQWdCO0FBQzdELE1BQU0sa0NBQWlELHdDQUF3QztBQU8vRixTQUFTLDhCQUE4QixNQUFvQjtBQUNqRSxN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
