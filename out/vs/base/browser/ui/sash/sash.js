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
import { $, addDisposableListener, append, EventHelper, getWindow, isHTMLElement } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { DomEmitter } from "../../event.js";
import { EventType, Gesture } from "../../touch.js";
import { Delayer } from "../../../common/async.js";
import { memoize } from "../../../common/decorators.js";
import { Emitter } from "../../../common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import "./sash.css";
const DEBUG = false;
var OrthogonalEdge = /* @__PURE__ */ ((OrthogonalEdge2) => {
  OrthogonalEdge2["North"] = "north";
  OrthogonalEdge2["South"] = "south";
  OrthogonalEdge2["East"] = "east";
  OrthogonalEdge2["West"] = "west";
  return OrthogonalEdge2;
})(OrthogonalEdge || {});
var Orientation = /* @__PURE__ */ ((Orientation2) => {
  Orientation2[Orientation2["VERTICAL"] = 0] = "VERTICAL";
  Orientation2[Orientation2["HORIZONTAL"] = 1] = "HORIZONTAL";
  return Orientation2;
})(Orientation || {});
var SashState = /* @__PURE__ */ ((SashState2) => {
  SashState2[SashState2["Disabled"] = 0] = "Disabled";
  SashState2[SashState2["AtMinimum"] = 1] = "AtMinimum";
  SashState2[SashState2["AtMaximum"] = 2] = "AtMaximum";
  SashState2[SashState2["Enabled"] = 3] = "Enabled";
  return SashState2;
})(SashState || {});
let globalSize = 4;
const onDidChangeGlobalSize = new Emitter();
function setGlobalSashSize(size) {
  globalSize = size;
  onDidChangeGlobalSize.fire(size);
}
let globalHoverDelay = 300;
const onDidChangeHoverDelay = new Emitter();
function setGlobalHoverDelay(size) {
  globalHoverDelay = size;
  onDidChangeHoverDelay.fire(size);
}
class MouseEventFactory {
  constructor(el) {
    this.el = el;
    this.disposables = new DisposableStore();
  }
  get onPointerMove() {
    return this.disposables.add(new DomEmitter(getWindow(this.el), "mousemove")).event;
  }
  get onPointerUp() {
    return this.disposables.add(new DomEmitter(getWindow(this.el), "mouseup")).event;
  }
  dispose() {
    this.disposables.dispose();
  }
}
__decorateClass([
  memoize
], MouseEventFactory.prototype, "onPointerMove", 1);
__decorateClass([
  memoize
], MouseEventFactory.prototype, "onPointerUp", 1);
class GestureEventFactory {
  constructor(el) {
    this.el = el;
    this.disposables = new DisposableStore();
  }
  get onPointerMove() {
    return this.disposables.add(new DomEmitter(this.el, EventType.Change)).event;
  }
  get onPointerUp() {
    return this.disposables.add(new DomEmitter(this.el, EventType.End)).event;
  }
  dispose() {
    this.disposables.dispose();
  }
}
__decorateClass([
  memoize
], GestureEventFactory.prototype, "onPointerMove", 1);
__decorateClass([
  memoize
], GestureEventFactory.prototype, "onPointerUp", 1);
class OrthogonalPointerEventFactory {
  constructor(factory) {
    this.factory = factory;
  }
  get onPointerMove() {
    return this.factory.onPointerMove;
  }
  get onPointerUp() {
    return this.factory.onPointerUp;
  }
  dispose() {
  }
}
__decorateClass([
  memoize
], OrthogonalPointerEventFactory.prototype, "onPointerMove", 1);
__decorateClass([
  memoize
], OrthogonalPointerEventFactory.prototype, "onPointerUp", 1);
const PointerEventsDisabledCssClass = "pointer-events-disabled";
class Sash extends Disposable {
  constructor(container, layoutProvider, options) {
    super();
    this.hoverDelay = globalHoverDelay;
    this.hoverDelayer = this._register(new Delayer(this.hoverDelay));
    this._state = 3 /* Enabled */;
    this.onDidEnablementChange = this._register(new Emitter());
    this._onDidStart = this._register(new Emitter());
    this._onDidChange = this._register(new Emitter());
    this._onDidReset = this._register(new Emitter());
    this._onDidEnd = this._register(new Emitter());
    this.orthogonalStartSashDisposables = this._register(new DisposableStore());
    this.orthogonalStartDragHandleDisposables = this._register(new DisposableStore());
    this.orthogonalEndSashDisposables = this._register(new DisposableStore());
    this.orthogonalEndDragHandleDisposables = this._register(new DisposableStore());
    /**
     * A linked sash will be forwarded the same user interactions and events
     * so it moves exactly the same way as this sash.
     *
     * Useful in 2x2 grids. Not meant for widespread usage.
     */
    this.linkedSash = void 0;
    this.el = append(container, $(".monaco-sash"));
    if (options.orthogonalEdge) {
      this.el.classList.add(`orthogonal-edge-${options.orthogonalEdge}`);
    }
    if (isMacintosh) {
      this.el.classList.add("mac");
    }
    this._register(addDisposableListener(this.el, "mousedown", (e) => this.onPointerStart(e, new MouseEventFactory(container))));
    this._register(addDisposableListener(this.el, "dblclick", (e) => this.onPointerDoublePress(e)));
    this._register(addDisposableListener(this.el, "mouseenter", () => Sash.onMouseEnter(this)));
    this._register(addDisposableListener(this.el, "mouseleave", () => Sash.onMouseLeave(this)));
    this._register(Gesture.addTarget(this.el));
    this._register(addDisposableListener(this.el, EventType.Start, (e) => this.onPointerStart(e, new GestureEventFactory(this.el))));
    let doubleTapTimeout = void 0;
    this._register(addDisposableListener(this.el, EventType.Tap, (event) => {
      if (doubleTapTimeout) {
        clearTimeout(doubleTapTimeout);
        doubleTapTimeout = void 0;
        this.onPointerDoublePress(event);
        return;
      }
      clearTimeout(doubleTapTimeout);
      doubleTapTimeout = setTimeout(() => doubleTapTimeout = void 0, 250);
    }));
    if (typeof options.size === "number") {
      this.size = options.size;
      if (options.orientation === 0 /* VERTICAL */) {
        this.el.style.width = `${this.size}px`;
      } else {
        this.el.style.height = `${this.size}px`;
      }
    } else {
      this.size = globalSize;
      this._register(onDidChangeGlobalSize.event((size) => {
        this.size = size;
        this.layout();
      }));
    }
    this._register(onDidChangeHoverDelay.event((delay) => this.hoverDelay = delay));
    this.layoutProvider = layoutProvider;
    this.orthogonalStartSash = options.orthogonalStartSash;
    this.orthogonalEndSash = options.orthogonalEndSash;
    this.orientation = options.orientation || 0 /* VERTICAL */;
    if (this.orientation === 1 /* HORIZONTAL */) {
      this.el.classList.add("horizontal");
      this.el.classList.remove("vertical");
    } else {
      this.el.classList.remove("horizontal");
      this.el.classList.add("vertical");
    }
    this.el.classList.toggle("debug", DEBUG);
    this.layout();
  }
  get state() {
    return this._state;
  }
  get orthogonalStartSash() {
    return this._orthogonalStartSash;
  }
  get orthogonalEndSash() {
    return this._orthogonalEndSash;
  }
  /**
   * The state of a sash defines whether it can be interacted with by the user
   * as well as what mouse cursor to use, when hovered.
   */
  set state(state) {
    if (this._state === state) {
      return;
    }
    this.el.classList.toggle("disabled", state === 0 /* Disabled */);
    this.el.classList.toggle("minimum", state === 1 /* AtMinimum */);
    this.el.classList.toggle("maximum", state === 2 /* AtMaximum */);
    this._state = state;
    this.onDidEnablementChange.fire(state);
  }
  /**
   * An event which fires whenever the user starts dragging this sash.
   */
  get onDidStart() {
    return this._onDidStart.event;
  }
  /**
   * An event which fires whenever the user moves the mouse while
   * dragging this sash.
   */
  get onDidChange() {
    return this._onDidChange.event;
  }
  /**
   * An event which fires whenever the user double clicks this sash.
   */
  get onDidReset() {
    return this._onDidReset.event;
  }
  /**
   * An event which fires whenever the user stops dragging this sash.
   */
  get onDidEnd() {
    return this._onDidEnd.event;
  }
  /**
   * A reference to another sash, perpendicular to this one, which
   * aligns at the start of this one. A corner sash will be created
   * automatically at that location.
   *
   * The start of a horizontal sash is its left-most position.
   * The start of a vertical sash is its top-most position.
   */
  set orthogonalStartSash(sash) {
    if (this._orthogonalStartSash === sash) {
      return;
    }
    this.orthogonalStartDragHandleDisposables.clear();
    this.orthogonalStartSashDisposables.clear();
    if (sash) {
      const onChange = (state) => {
        this.orthogonalStartDragHandleDisposables.clear();
        if (state !== 0 /* Disabled */) {
          this._orthogonalStartDragHandle = append(this.el, $(".orthogonal-drag-handle.start"));
          this.orthogonalStartDragHandleDisposables.add(toDisposable(() => this._orthogonalStartDragHandle.remove()));
          this.orthogonalStartDragHandleDisposables.add(addDisposableListener(this._orthogonalStartDragHandle, "mouseenter", () => Sash.onMouseEnter(sash)));
          this.orthogonalStartDragHandleDisposables.add(addDisposableListener(this._orthogonalStartDragHandle, "mouseleave", () => Sash.onMouseLeave(sash)));
        }
      };
      this.orthogonalStartSashDisposables.add(sash.onDidEnablementChange.event(onChange, this));
      onChange(sash.state);
    }
    this._orthogonalStartSash = sash;
  }
  /**
   * A reference to another sash, perpendicular to this one, which
   * aligns at the end of this one. A corner sash will be created
   * automatically at that location.
   *
   * The end of a horizontal sash is its right-most position.
   * The end of a vertical sash is its bottom-most position.
   */
  set orthogonalEndSash(sash) {
    if (this._orthogonalEndSash === sash) {
      return;
    }
    this.orthogonalEndDragHandleDisposables.clear();
    this.orthogonalEndSashDisposables.clear();
    if (sash) {
      const onChange = (state) => {
        this.orthogonalEndDragHandleDisposables.clear();
        if (state !== 0 /* Disabled */) {
          this._orthogonalEndDragHandle = append(this.el, $(".orthogonal-drag-handle.end"));
          this.orthogonalEndDragHandleDisposables.add(toDisposable(() => this._orthogonalEndDragHandle.remove()));
          this.orthogonalEndDragHandleDisposables.add(addDisposableListener(this._orthogonalEndDragHandle, "mouseenter", () => Sash.onMouseEnter(sash)));
          this.orthogonalEndDragHandleDisposables.add(addDisposableListener(this._orthogonalEndDragHandle, "mouseleave", () => Sash.onMouseLeave(sash)));
        }
      };
      this.orthogonalEndSashDisposables.add(sash.onDidEnablementChange.event(onChange, this));
      onChange(sash.state);
    }
    this._orthogonalEndSash = sash;
  }
  onPointerStart(event, pointerEventFactory) {
    EventHelper.stop(event);
    let isMultisashResize = false;
    if (!event.__orthogonalSashEvent) {
      const orthogonalSash = this.getOrthogonalSash(event);
      if (orthogonalSash) {
        isMultisashResize = true;
        event.__orthogonalSashEvent = true;
        orthogonalSash.onPointerStart(event, new OrthogonalPointerEventFactory(pointerEventFactory));
      }
    }
    if (this.linkedSash && !event.__linkedSashEvent) {
      event.__linkedSashEvent = true;
      this.linkedSash.onPointerStart(event, new OrthogonalPointerEventFactory(pointerEventFactory));
    }
    if (!this.state) {
      return;
    }
    const iframes = this.el.ownerDocument.getElementsByTagName("iframe");
    for (const iframe of iframes) {
      iframe.classList.add(PointerEventsDisabledCssClass);
    }
    const startX = event.pageX;
    const startY = event.pageY;
    const altKey = event.altKey;
    const startEvent = { startX, currentX: startX, startY, currentY: startY, altKey };
    this.el.classList.add("active");
    this._onDidStart.fire(startEvent);
    const style = createStyleSheet(this.el);
    const updateStyle = () => {
      let cursor = "";
      if (isMultisashResize) {
        cursor = "all-scroll";
      } else if (this.orientation === 1 /* HORIZONTAL */) {
        if (this.state === 1 /* AtMinimum */) {
          cursor = "s-resize";
        } else if (this.state === 2 /* AtMaximum */) {
          cursor = "n-resize";
        } else {
          cursor = isMacintosh ? "row-resize" : "ns-resize";
        }
      } else {
        if (this.state === 1 /* AtMinimum */) {
          cursor = "e-resize";
        } else if (this.state === 2 /* AtMaximum */) {
          cursor = "w-resize";
        } else {
          cursor = isMacintosh ? "col-resize" : "ew-resize";
        }
      }
      style.textContent = `* { cursor: ${cursor} !important; }`;
    };
    const disposables = new DisposableStore();
    updateStyle();
    if (!isMultisashResize) {
      this.onDidEnablementChange.event(updateStyle, null, disposables);
    }
    const onPointerMove = (e) => {
      EventHelper.stop(e, false);
      const event2 = { startX, currentX: e.pageX, startY, currentY: e.pageY, altKey };
      this._onDidChange.fire(event2);
    };
    const onPointerUp = (e) => {
      EventHelper.stop(e, false);
      style.remove();
      this.el.classList.remove("active");
      this._onDidEnd.fire();
      disposables.dispose();
      for (const iframe of iframes) {
        iframe.classList.remove(PointerEventsDisabledCssClass);
      }
    };
    pointerEventFactory.onPointerMove(onPointerMove, null, disposables);
    pointerEventFactory.onPointerUp(onPointerUp, null, disposables);
    disposables.add(pointerEventFactory);
  }
  onPointerDoublePress(e) {
    const orthogonalSash = this.getOrthogonalSash(e);
    if (orthogonalSash) {
      orthogonalSash._onDidReset.fire();
    }
    if (this.linkedSash) {
      this.linkedSash._onDidReset.fire();
    }
    this._onDidReset.fire();
  }
  static onMouseEnter(sash, fromLinkedSash = false) {
    if (sash.el.classList.contains("active")) {
      sash.hoverDelayer.cancel();
      sash.el.classList.add("hover");
    } else {
      sash.hoverDelayer.trigger(() => sash.el.classList.add("hover"), sash.hoverDelay).then(void 0, () => {
      });
    }
    if (!fromLinkedSash && sash.linkedSash) {
      Sash.onMouseEnter(sash.linkedSash, true);
    }
  }
  static onMouseLeave(sash, fromLinkedSash = false) {
    sash.hoverDelayer.cancel();
    sash.el.classList.remove("hover");
    if (!fromLinkedSash && sash.linkedSash) {
      Sash.onMouseLeave(sash.linkedSash, true);
    }
  }
  /**
   * Forcefully stop any user interactions with this sash.
   * Useful when hiding a parent component, while the user is still
   * interacting with the sash.
   */
  clearSashHoverState() {
    Sash.onMouseLeave(this);
  }
  /**
   * Layout the sash. The sash will size and position itself
   * based on its provided {@link ISashLayoutProvider layout provider}.
   */
  layout() {
    if (this.orientation === 0 /* VERTICAL */) {
      const verticalProvider = this.layoutProvider;
      this.el.style.left = verticalProvider.getVerticalSashLeft(this) - this.size / 2 + "px";
      if (verticalProvider.getVerticalSashTop) {
        this.el.style.top = verticalProvider.getVerticalSashTop(this) + "px";
      }
      if (verticalProvider.getVerticalSashHeight) {
        this.el.style.height = verticalProvider.getVerticalSashHeight(this) + "px";
      }
    } else {
      const horizontalProvider = this.layoutProvider;
      this.el.style.top = horizontalProvider.getHorizontalSashTop(this) - this.size / 2 + "px";
      if (horizontalProvider.getHorizontalSashLeft) {
        this.el.style.left = horizontalProvider.getHorizontalSashLeft(this) + "px";
      }
      if (horizontalProvider.getHorizontalSashWidth) {
        this.el.style.width = horizontalProvider.getHorizontalSashWidth(this) + "px";
      }
    }
  }
  getOrthogonalSash(e) {
    const target = e.initialTarget ?? e.target;
    if (!target || !isHTMLElement(target)) {
      return void 0;
    }
    if (target.classList.contains("orthogonal-drag-handle")) {
      return target.classList.contains("start") ? this.orthogonalStartSash : this.orthogonalEndSash;
    }
    return void 0;
  }
  dispose() {
    super.dispose();
    this.el.remove();
  }
}
export {
  Orientation,
  OrthogonalEdge,
  Sash,
  SashState,
  setGlobalHoverDelay,
  setGlobalSashSize
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2gudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGFwcGVuZCwgRXZlbnRIZWxwZXIsIEV2ZW50TGlrZSwgZ2V0V2luZG93LCBpc0hUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZVN0eWxlU2hlZXQgfSBmcm9tICcuLi8uLi9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBEb21FbWl0dGVyIH0gZnJvbSAnLi4vLi4vZXZlbnQuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlLCBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vdG91Y2guanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAnLi9zYXNoLmNzcyc7XG5cbi8qKlxuICogQWxsb3cgdGhlIHNhc2hlcyB0byBiZSB2aXNpYmxlIGF0IHJ1bnRpbWUuXG4gKiBAcmVtYXJrIFVzZSBmb3IgZGV2ZWxvcG1lbnQgcHVycG9zZXMgb25seS5cbiAqL1xuY29uc3QgREVCVUcgPSBmYWxzZTtcbi8vIERFQlVHID0gQm9vbGVhbihcInRydWVcIik7IC8vIGRvbmUgXCJ3ZWlyZGx5XCIgc28gdGhhdCBhIGxpbnQgd2FybmluZyBwcmV2ZW50cyB5b3UgZnJvbSBwdXNoaW5nIHRoaXNcblxuLyoqXG4gKiBBIHZlcnRpY2FsIHNhc2ggbGF5b3V0IHByb3ZpZGVyIHByb3ZpZGVzIHBvc2l0aW9uIGFuZCBoZWlnaHQgZm9yIGEgc2FzaC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVmVydGljYWxTYXNoTGF5b3V0UHJvdmlkZXIge1xuXHRnZXRWZXJ0aWNhbFNhc2hMZWZ0KHNhc2g6IFNhc2gpOiBudW1iZXI7XG5cdGdldFZlcnRpY2FsU2FzaFRvcD8oc2FzaDogU2FzaCk6IG51bWJlcjtcblx0Z2V0VmVydGljYWxTYXNoSGVpZ2h0PyhzYXNoOiBTYXNoKTogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgdmVydGljYWwgc2FzaCBsYXlvdXQgcHJvdmlkZXIgcHJvdmlkZXMgcG9zaXRpb24gYW5kIHdpZHRoIGZvciBhIHNhc2guXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUhvcml6b250YWxTYXNoTGF5b3V0UHJvdmlkZXIge1xuXHRnZXRIb3Jpem9udGFsU2FzaFRvcChzYXNoOiBTYXNoKTogbnVtYmVyO1xuXHRnZXRIb3Jpem9udGFsU2FzaExlZnQ/KHNhc2g6IFNhc2gpOiBudW1iZXI7XG5cdGdldEhvcml6b250YWxTYXNoV2lkdGg/KHNhc2g6IFNhc2gpOiBudW1iZXI7XG59XG5cbnR5cGUgSVNhc2hMYXlvdXRQcm92aWRlciA9IElWZXJ0aWNhbFNhc2hMYXlvdXRQcm92aWRlciB8IElIb3Jpem9udGFsU2FzaExheW91dFByb3ZpZGVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTYXNoRXZlbnQge1xuXHRyZWFkb25seSBzdGFydFg6IG51bWJlcjtcblx0cmVhZG9ubHkgY3VycmVudFg6IG51bWJlcjtcblx0cmVhZG9ubHkgc3RhcnRZOiBudW1iZXI7XG5cdHJlYWRvbmx5IGN1cnJlbnRZOiBudW1iZXI7XG5cdHJlYWRvbmx5IGFsdEtleTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGVudW0gT3J0aG9nb25hbEVkZ2Uge1xuXHROb3J0aCA9ICdub3J0aCcsXG5cdFNvdXRoID0gJ3NvdXRoJyxcblx0RWFzdCA9ICdlYXN0Jyxcblx0V2VzdCA9ICd3ZXN0J1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCb3VuZGFyeVNhc2hlcyB7XG5cdHJlYWRvbmx5IHRvcD86IFNhc2g7XG5cdHJlYWRvbmx5IHJpZ2h0PzogU2FzaDtcblx0cmVhZG9ubHkgYm90dG9tPzogU2FzaDtcblx0cmVhZG9ubHkgbGVmdD86IFNhc2g7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNhc2hPcHRpb25zIHtcblxuXHQvKipcblx0ICogV2hldGhlciBhIHNhc2ggaXMgaG9yaXpvbnRhbCBvciB2ZXJ0aWNhbC5cblx0ICovXG5cdHJlYWRvbmx5IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbjtcblxuXHQvKipcblx0ICogVGhlIHdpZHRoIG9yIGhlaWdodCBvZiBhIHZlcnRpY2FsIG9yIGhvcml6b250YWwgc2FzaCwgcmVzcGVjdGl2ZWx5LlxuXHQgKi9cblx0cmVhZG9ubHkgc2l6ZT86IG51bWJlcjtcblxuXHQvKipcblx0ICogQSByZWZlcmVuY2UgdG8gYW5vdGhlciBzYXNoLCBwZXJwZW5kaWN1bGFyIHRvIHRoaXMgb25lLCB3aGljaFxuXHQgKiBhbGlnbnMgYXQgdGhlIHN0YXJ0IG9mIHRoaXMgb25lLiBBIGNvcm5lciBzYXNoIHdpbGwgYmUgY3JlYXRlZFxuXHQgKiBhdXRvbWF0aWNhbGx5IGF0IHRoYXQgbG9jYXRpb24uXG5cdCAqXG5cdCAqIFRoZSBzdGFydCBvZiBhIGhvcml6b250YWwgc2FzaCBpcyBpdHMgbGVmdC1tb3N0IHBvc2l0aW9uLlxuXHQgKiBUaGUgc3RhcnQgb2YgYSB2ZXJ0aWNhbCBzYXNoIGlzIGl0cyB0b3AtbW9zdCBwb3NpdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxTdGFydFNhc2g/OiBTYXNoO1xuXG5cdC8qKlxuXHQgKiBBIHJlZmVyZW5jZSB0byBhbm90aGVyIHNhc2gsIHBlcnBlbmRpY3VsYXIgdG8gdGhpcyBvbmUsIHdoaWNoXG5cdCAqIGFsaWducyBhdCB0aGUgZW5kIG9mIHRoaXMgb25lLiBBIGNvcm5lciBzYXNoIHdpbGwgYmUgY3JlYXRlZFxuXHQgKiBhdXRvbWF0aWNhbGx5IGF0IHRoYXQgbG9jYXRpb24uXG5cdCAqXG5cdCAqIFRoZSBlbmQgb2YgYSBob3Jpem9udGFsIHNhc2ggaXMgaXRzIHJpZ2h0LW1vc3QgcG9zaXRpb24uXG5cdCAqIFRoZSBlbmQgb2YgYSB2ZXJ0aWNhbCBzYXNoIGlzIGl0cyBib3R0b20tbW9zdCBwb3NpdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxFbmRTYXNoPzogU2FzaDtcblxuXHQvKipcblx0ICogUHJvdmlkZXMgYSBoaW50IGFzIHRvIHdoYXQgbW91c2UgY3Vyc29yIHRvIHVzZSB3aGVuZXZlciB0aGUgdXNlclxuXHQgKiBob3ZlcnMgb3ZlciBhIGNvcm5lciBzYXNoIHByb3ZpZGVkIGJ5IHRoaXMgYW5kIGFuIG9ydGhvZ29uYWwgc2FzaC5cblx0ICovXG5cdHJlYWRvbmx5IG9ydGhvZ29uYWxFZGdlPzogT3J0aG9nb25hbEVkZ2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZlcnRpY2FsU2FzaE9wdGlvbnMgZXh0ZW5kcyBJU2FzaE9wdGlvbnMge1xuXHRyZWFkb25seSBvcmllbnRhdGlvbjogT3JpZW50YXRpb24uVkVSVElDQUw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhvcml6b250YWxTYXNoT3B0aW9ucyBleHRlbmRzIElTYXNoT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5IT1JJWk9OVEFMO1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBPcmllbnRhdGlvbiB7XG5cdFZFUlRJQ0FMLFxuXHRIT1JJWk9OVEFMXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNhc2hTdGF0ZSB7XG5cblx0LyoqXG5cdCAqIERpc2FibGUgYW55IFVJIGludGVyYWN0aW9uLlxuXHQgKi9cblx0RGlzYWJsZWQsXG5cblx0LyoqXG5cdCAqIEFsbG93IGRyYWdnaW5nIGRvd24gb3IgdG8gdGhlIHJpZ2h0LCBkZXBlbmRpbmcgb24gdGhlIHNhc2ggb3JpZW50YXRpb24uXG5cdCAqXG5cdCAqIFNvbWUgT1NzIGFsbG93IGN1c3RvbWl6aW5nIHRoZSBtb3VzZSBjdXJzb3IgZGlmZmVyZW50bHkgd2hlbmV2ZXJcblx0ICogc29tZSByZXNpemFibGUgY29tcG9uZW50IGNhbid0IGJlIGFueSBzbWFsbGVyLCBidXQgY2FuIGJlIGxhcmdlci5cblx0ICovXG5cdEF0TWluaW11bSxcblxuXHQvKipcblx0ICogQWxsb3cgZHJhZ2dpbmcgdXAgb3IgdG8gdGhlIGxlZnQsIGRlcGVuZGluZyBvbiB0aGUgc2FzaCBvcmllbnRhdGlvbi5cblx0ICpcblx0ICogU29tZSBPU3MgYWxsb3cgY3VzdG9taXppbmcgdGhlIG1vdXNlIGN1cnNvciBkaWZmZXJlbnRseSB3aGVuZXZlclxuXHQgKiBzb21lIHJlc2l6YWJsZSBjb21wb25lbnQgY2FuJ3QgYmUgYW55IGxhcmdlciwgYnV0IGNhbiBiZSBzbWFsbGVyLlxuXHQgKi9cblx0QXRNYXhpbXVtLFxuXG5cdC8qKlxuXHQgKiBFbmFibGUgZHJhZ2dpbmcuXG5cdCAqL1xuXHRFbmFibGVkXG59XG5cbmxldCBnbG9iYWxTaXplID0gNDtcbmNvbnN0IG9uRGlkQ2hhbmdlR2xvYmFsU2l6ZSA9IG5ldyBFbWl0dGVyPG51bWJlcj4oKTtcbmV4cG9ydCBmdW5jdGlvbiBzZXRHbG9iYWxTYXNoU2l6ZShzaXplOiBudW1iZXIpOiB2b2lkIHtcblx0Z2xvYmFsU2l6ZSA9IHNpemU7XG5cdG9uRGlkQ2hhbmdlR2xvYmFsU2l6ZS5maXJlKHNpemUpO1xufVxuXG5sZXQgZ2xvYmFsSG92ZXJEZWxheSA9IDMwMDtcbmNvbnN0IG9uRGlkQ2hhbmdlSG92ZXJEZWxheSA9IG5ldyBFbWl0dGVyPG51bWJlcj4oKTtcbmV4cG9ydCBmdW5jdGlvbiBzZXRHbG9iYWxIb3ZlckRlbGF5KHNpemU6IG51bWJlcik6IHZvaWQge1xuXHRnbG9iYWxIb3ZlckRlbGF5ID0gc2l6ZTtcblx0b25EaWRDaGFuZ2VIb3ZlckRlbGF5LmZpcmUoc2l6ZSk7XG59XG5cbmludGVyZmFjZSBQb2ludGVyRXZlbnQgZXh0ZW5kcyBFdmVudExpa2Uge1xuXHRyZWFkb25seSBwYWdlWDogbnVtYmVyO1xuXHRyZWFkb25seSBwYWdlWTogbnVtYmVyO1xuXHRyZWFkb25seSBhbHRLZXk6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsO1xuXHRyZWFkb25seSBpbml0aWFsVGFyZ2V0PzogRXZlbnRUYXJnZXQgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJUG9pbnRlckV2ZW50RmFjdG9yeSB7XG5cdHJlYWRvbmx5IG9uUG9pbnRlck1vdmU6IEV2ZW50PFBvaW50ZXJFdmVudD47XG5cdHJlYWRvbmx5IG9uUG9pbnRlclVwOiBFdmVudDxQb2ludGVyRXZlbnQ+O1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmNsYXNzIE1vdXNlRXZlbnRGYWN0b3J5IGltcGxlbWVudHMgSVBvaW50ZXJFdmVudEZhY3Rvcnkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBlbDogSFRNTEVsZW1lbnQpIHsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBvblBvaW50ZXJNb3ZlKCk6IEV2ZW50PFBvaW50ZXJFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcihnZXRXaW5kb3codGhpcy5lbCksICdtb3VzZW1vdmUnKSkuZXZlbnQ7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyVXAoKTogRXZlbnQ8UG9pbnRlckV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKGdldFdpbmRvdyh0aGlzLmVsKSwgJ21vdXNldXAnKSkuZXZlbnQ7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEdlc3R1cmVFdmVudEZhY3RvcnkgaW1wbGVtZW50cyBJUG9pbnRlckV2ZW50RmFjdG9yeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyTW92ZSgpOiBFdmVudDxQb2ludGVyRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy5lbCwgRXZlbnRUeXBlLkNoYW5nZSkpLmV2ZW50O1xuXHR9XG5cblx0QG1lbW9pemVcblx0Z2V0IG9uUG9pbnRlclVwKCk6IEV2ZW50PFBvaW50ZXJFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLmVsLCBFdmVudFR5cGUuRW5kKSkuZXZlbnQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGVsOiBIVE1MRWxlbWVudCkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBPcnRob2dvbmFsUG9pbnRlckV2ZW50RmFjdG9yeSBpbXBsZW1lbnRzIElQb2ludGVyRXZlbnRGYWN0b3J5IHtcblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyTW92ZSgpOiBFdmVudDxQb2ludGVyRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5mYWN0b3J5Lm9uUG9pbnRlck1vdmU7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25Qb2ludGVyVXAoKTogRXZlbnQ8UG9pbnRlckV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuZmFjdG9yeS5vblBvaW50ZXJVcDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZmFjdG9yeTogSVBvaW50ZXJFdmVudEZhY3RvcnkpIHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmNvbnN0IFBvaW50ZXJFdmVudHNEaXNhYmxlZENzc0NsYXNzID0gJ3BvaW50ZXItZXZlbnRzLWRpc2FibGVkJztcblxuLyoqXG4gKiBUaGUge0BsaW5rIFNhc2h9IGlzIHRoZSBVSSBjb21wb25lbnQgd2hpY2ggYWxsb3dzIHRoZSB1c2VyIHRvIHJlc2l6ZSBvdGhlclxuICogY29tcG9uZW50cy4gSXQncyB1c3VhbGx5IGFuIGludmlzaWJsZSBob3Jpem9udGFsIG9yIHZlcnRpY2FsIGxpbmUgd2hpY2gsIHdoZW5cbiAqIGhvdmVyZWQsIGJlY29tZXMgaGlnaGxpZ2h0ZWQgYW5kIGNhbiBiZSBkcmFnZ2VkIGFsb25nIHRoZSBwZXJwZW5kaWN1bGFyIGRpbWVuc2lvblxuICogdG8gaXRzIGRpcmVjdGlvbi5cbiAqXG4gKiBGZWF0dXJlczpcbiAqIC0gVG91Y2ggZXZlbnQgaGFuZGxpbmdcbiAqIC0gQ29ybmVyIHNhc2ggc3VwcG9ydFxuICogLSBIb3ZlciB3aXRoIGRpZmZlcmVudCBtb3VzZSBjdXJzb3Igc3VwcG9ydFxuICogLSBDb25maWd1cmFibGUgaG92ZXIgc2l6ZVxuICogLSBMaW5rZWQgc2FzaCBzdXBwb3J0LCBmb3IgMngyIGNvcm5lciBzYXNoZXNcbiAqL1xuZXhwb3J0IGNsYXNzIFNhc2ggZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGVsOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBsYXlvdXRQcm92aWRlcjogSVNhc2hMYXlvdXRQcm92aWRlcjtcblx0cHJpdmF0ZSBvcmllbnRhdGlvbjogT3JpZW50YXRpb247XG5cdHByaXZhdGUgc2l6ZTogbnVtYmVyO1xuXHRwcml2YXRlIGhvdmVyRGVsYXkgPSBnbG9iYWxIb3ZlckRlbGF5O1xuXHRwcml2YXRlIGhvdmVyRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyKHRoaXMuaG92ZXJEZWxheSkpO1xuXG5cdHByaXZhdGUgX3N0YXRlOiBTYXNoU3RhdGUgPSBTYXNoU3RhdGUuRW5hYmxlZDtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZEVuYWJsZW1lbnRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxTYXNoU3RhdGU+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN0YXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNhc2hFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNhc2hFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVzZXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvcnRob2dvbmFsU3RhcnRTYXNoRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9vcnRob2dvbmFsU3RhcnRTYXNoOiBTYXNoIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9ydGhvZ29uYWxTdGFydERyYWdIYW5kbGVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX29ydGhvZ29uYWxTdGFydERyYWdIYW5kbGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9ydGhvZ29uYWxFbmRTYXNoRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9vcnRob2dvbmFsRW5kU2FzaDogU2FzaCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBvcnRob2dvbmFsRW5kRHJhZ0hhbmRsZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfb3J0aG9nb25hbEVuZERyYWdIYW5kbGU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdGdldCBzdGF0ZSgpOiBTYXNoU3RhdGUgeyByZXR1cm4gdGhpcy5fc3RhdGU7IH1cblx0Z2V0IG9ydGhvZ29uYWxTdGFydFNhc2goKTogU2FzaCB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9vcnRob2dvbmFsU3RhcnRTYXNoOyB9XG5cdGdldCBvcnRob2dvbmFsRW5kU2FzaCgpOiBTYXNoIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX29ydGhvZ29uYWxFbmRTYXNoOyB9XG5cblx0LyoqXG5cdCAqIFRoZSBzdGF0ZSBvZiBhIHNhc2ggZGVmaW5lcyB3aGV0aGVyIGl0IGNhbiBiZSBpbnRlcmFjdGVkIHdpdGggYnkgdGhlIHVzZXJcblx0ICogYXMgd2VsbCBhcyB3aGF0IG1vdXNlIGN1cnNvciB0byB1c2UsIHdoZW4gaG92ZXJlZC5cblx0ICovXG5cdHNldCBzdGF0ZShzdGF0ZTogU2FzaFN0YXRlKSB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSBzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZWwuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCBzdGF0ZSA9PT0gU2FzaFN0YXRlLkRpc2FibGVkKTtcblx0XHR0aGlzLmVsLmNsYXNzTGlzdC50b2dnbGUoJ21pbmltdW0nLCBzdGF0ZSA9PT0gU2FzaFN0YXRlLkF0TWluaW11bSk7XG5cdFx0dGhpcy5lbC5jbGFzc0xpc3QudG9nZ2xlKCdtYXhpbXVtJywgc3RhdGUgPT09IFNhc2hTdGF0ZS5BdE1heGltdW0pO1xuXG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLm9uRGlkRW5hYmxlbWVudENoYW5nZS5maXJlKHN0YXRlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuZXZlciB0aGUgdXNlciBzdGFydHMgZHJhZ2dpbmcgdGhpcyBzYXNoLlxuXHQgKi9cblx0Z2V0IG9uRGlkU3RhcnQoKSB7IHJldHVybiB0aGlzLl9vbkRpZFN0YXJ0LmV2ZW50OyB9XG5cblx0LyoqXG5cdCAqIEFuIGV2ZW50IHdoaWNoIGZpcmVzIHdoZW5ldmVyIHRoZSB1c2VyIG1vdmVzIHRoZSBtb3VzZSB3aGlsZVxuXHQgKiBkcmFnZ2luZyB0aGlzIHNhc2guXG5cdCAqL1xuXHRnZXQgb25EaWRDaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDsgfVxuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuZXZlciB0aGUgdXNlciBkb3VibGUgY2xpY2tzIHRoaXMgc2FzaC5cblx0ICovXG5cdGdldCBvbkRpZFJlc2V0KCkgeyByZXR1cm4gdGhpcy5fb25EaWRSZXNldC5ldmVudDsgfVxuXG5cdC8qKlxuXHQgKiBBbiBldmVudCB3aGljaCBmaXJlcyB3aGVuZXZlciB0aGUgdXNlciBzdG9wcyBkcmFnZ2luZyB0aGlzIHNhc2guXG5cdCAqL1xuXHRnZXQgb25EaWRFbmQoKSB7IHJldHVybiB0aGlzLl9vbkRpZEVuZC5ldmVudDsgfVxuXG5cdC8qKlxuXHQgKiBBIGxpbmtlZCBzYXNoIHdpbGwgYmUgZm9yd2FyZGVkIHRoZSBzYW1lIHVzZXIgaW50ZXJhY3Rpb25zIGFuZCBldmVudHNcblx0ICogc28gaXQgbW92ZXMgZXhhY3RseSB0aGUgc2FtZSB3YXkgYXMgdGhpcyBzYXNoLlxuXHQgKlxuXHQgKiBVc2VmdWwgaW4gMngyIGdyaWRzLiBOb3QgbWVhbnQgZm9yIHdpZGVzcHJlYWQgdXNhZ2UuXG5cdCAqL1xuXHRsaW5rZWRTYXNoOiBTYXNoIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBBIHJlZmVyZW5jZSB0byBhbm90aGVyIHNhc2gsIHBlcnBlbmRpY3VsYXIgdG8gdGhpcyBvbmUsIHdoaWNoXG5cdCAqIGFsaWducyBhdCB0aGUgc3RhcnQgb2YgdGhpcyBvbmUuIEEgY29ybmVyIHNhc2ggd2lsbCBiZSBjcmVhdGVkXG5cdCAqIGF1dG9tYXRpY2FsbHkgYXQgdGhhdCBsb2NhdGlvbi5cblx0ICpcblx0ICogVGhlIHN0YXJ0IG9mIGEgaG9yaXpvbnRhbCBzYXNoIGlzIGl0cyBsZWZ0LW1vc3QgcG9zaXRpb24uXG5cdCAqIFRoZSBzdGFydCBvZiBhIHZlcnRpY2FsIHNhc2ggaXMgaXRzIHRvcC1tb3N0IHBvc2l0aW9uLlxuXHQgKi9cblx0c2V0IG9ydGhvZ29uYWxTdGFydFNhc2goc2FzaDogU2FzaCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9vcnRob2dvbmFsU3RhcnRTYXNoID09PSBzYXNoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5vcnRob2dvbmFsU3RhcnREcmFnSGFuZGxlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLm9ydGhvZ29uYWxTdGFydFNhc2hEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKHNhc2gpIHtcblx0XHRcdGNvbnN0IG9uQ2hhbmdlID0gKHN0YXRlOiBTYXNoU3RhdGUpID0+IHtcblx0XHRcdFx0dGhpcy5vcnRob2dvbmFsU3RhcnREcmFnSGFuZGxlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0XHRpZiAoc3RhdGUgIT09IFNhc2hTdGF0ZS5EaXNhYmxlZCkge1xuXHRcdFx0XHRcdHRoaXMuX29ydGhvZ29uYWxTdGFydERyYWdIYW5kbGUgPSBhcHBlbmQodGhpcy5lbCwgJCgnLm9ydGhvZ29uYWwtZHJhZy1oYW5kbGUuc3RhcnQnKSk7XG5cdFx0XHRcdFx0dGhpcy5vcnRob2dvbmFsU3RhcnREcmFnSGFuZGxlRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9vcnRob2dvbmFsU3RhcnREcmFnSGFuZGxlIS5yZW1vdmUoKSkpO1xuXHRcdFx0XHRcdHRoaXMub3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fb3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZSwgJ21vdXNlZW50ZXInLCAoKSA9PiBTYXNoLm9uTW91c2VFbnRlcihzYXNoKSkpO1xuXHRcdFx0XHRcdHRoaXMub3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fb3J0aG9nb25hbFN0YXJ0RHJhZ0hhbmRsZSwgJ21vdXNlbGVhdmUnLCAoKSA9PiBTYXNoLm9uTW91c2VMZWF2ZShzYXNoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLm9ydGhvZ29uYWxTdGFydFNhc2hEaXNwb3NhYmxlcy5hZGQoc2FzaC5vbkRpZEVuYWJsZW1lbnRDaGFuZ2UuZXZlbnQob25DaGFuZ2UsIHRoaXMpKTtcblx0XHRcdG9uQ2hhbmdlKHNhc2guc3RhdGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29ydGhvZ29uYWxTdGFydFNhc2ggPSBzYXNoO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgcmVmZXJlbmNlIHRvIGFub3RoZXIgc2FzaCwgcGVycGVuZGljdWxhciB0byB0aGlzIG9uZSwgd2hpY2hcblx0ICogYWxpZ25zIGF0IHRoZSBlbmQgb2YgdGhpcyBvbmUuIEEgY29ybmVyIHNhc2ggd2lsbCBiZSBjcmVhdGVkXG5cdCAqIGF1dG9tYXRpY2FsbHkgYXQgdGhhdCBsb2NhdGlvbi5cblx0ICpcblx0ICogVGhlIGVuZCBvZiBhIGhvcml6b250YWwgc2FzaCBpcyBpdHMgcmlnaHQtbW9zdCBwb3NpdGlvbi5cblx0ICogVGhlIGVuZCBvZiBhIHZlcnRpY2FsIHNhc2ggaXMgaXRzIGJvdHRvbS1tb3N0IHBvc2l0aW9uLlxuXHQgKi9cblxuXHRzZXQgb3J0aG9nb25hbEVuZFNhc2goc2FzaDogU2FzaCB8IHVuZGVmaW5lZCkge1xuXHRcdGlmICh0aGlzLl9vcnRob2dvbmFsRW5kU2FzaCA9PT0gc2FzaCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub3J0aG9nb25hbEVuZERyYWdIYW5kbGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMub3J0aG9nb25hbEVuZFNhc2hEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKHNhc2gpIHtcblx0XHRcdGNvbnN0IG9uQ2hhbmdlID0gKHN0YXRlOiBTYXNoU3RhdGUpID0+IHtcblx0XHRcdFx0dGhpcy5vcnRob2dvbmFsRW5kRHJhZ0hhbmRsZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdFx0aWYgKHN0YXRlICE9PSBTYXNoU3RhdGUuRGlzYWJsZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vcnRob2dvbmFsRW5kRHJhZ0hhbmRsZSA9IGFwcGVuZCh0aGlzLmVsLCAkKCcub3J0aG9nb25hbC1kcmFnLWhhbmRsZS5lbmQnKSk7XG5cdFx0XHRcdFx0dGhpcy5vcnRob2dvbmFsRW5kRHJhZ0hhbmRsZURpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fb3J0aG9nb25hbEVuZERyYWdIYW5kbGUhLnJlbW92ZSgpKSk7XG5cdFx0XHRcdFx0dGhpcy5vcnRob2dvbmFsRW5kRHJhZ0hhbmRsZURpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fb3J0aG9nb25hbEVuZERyYWdIYW5kbGUsICdtb3VzZWVudGVyJywgKCkgPT4gU2FzaC5vbk1vdXNlRW50ZXIoc2FzaCkpKTtcblx0XHRcdFx0XHR0aGlzLm9ydGhvZ29uYWxFbmREcmFnSGFuZGxlRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9vcnRob2dvbmFsRW5kRHJhZ0hhbmRsZSwgJ21vdXNlbGVhdmUnLCAoKSA9PiBTYXNoLm9uTW91c2VMZWF2ZShzYXNoKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHR0aGlzLm9ydGhvZ29uYWxFbmRTYXNoRGlzcG9zYWJsZXMuYWRkKHNhc2gub25EaWRFbmFibGVtZW50Q2hhbmdlLmV2ZW50KG9uQ2hhbmdlLCB0aGlzKSk7XG5cdFx0XHRvbkNoYW5nZShzYXNoLnN0YXRlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vcnRob2dvbmFsRW5kU2FzaCA9IHNhc2g7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHZlcnRpY2FsIHNhc2guXG5cdCAqXG5cdCAqIEBwYXJhbSBjb250YWluZXIgQSBET00gbm9kZSB0byBhcHBlbmQgdGhlIHNhc2ggdG8uXG5cdCAqIEBwYXJhbSB2ZXJ0aWNhbExheW91dFByb3ZpZGVyIEEgdmVydGljYWwgbGF5b3V0IHByb3ZpZGVyLlxuXHQgKiBAcGFyYW0gb3B0aW9ucyBUaGUgb3B0aW9ucy5cblx0ICovXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHZlcnRpY2FsTGF5b3V0UHJvdmlkZXI6IElWZXJ0aWNhbFNhc2hMYXlvdXRQcm92aWRlciwgb3B0aW9uczogSVZlcnRpY2FsU2FzaE9wdGlvbnMpO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgaG9yaXpvbnRhbCBzYXNoLlxuXHQgKlxuXHQgKiBAcGFyYW0gY29udGFpbmVyIEEgRE9NIG5vZGUgdG8gYXBwZW5kIHRoZSBzYXNoIHRvLlxuXHQgKiBAcGFyYW0gaG9yaXpvbnRhbExheW91dFByb3ZpZGVyIEEgaG9yaXpvbnRhbCBsYXlvdXQgcHJvdmlkZXIuXG5cdCAqIEBwYXJhbSBvcHRpb25zIFRoZSBvcHRpb25zLlxuXHQgKi9cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaG9yaXpvbnRhbExheW91dFByb3ZpZGVyOiBJSG9yaXpvbnRhbFNhc2hMYXlvdXRQcm92aWRlciwgb3B0aW9uczogSUhvcml6b250YWxTYXNoT3B0aW9ucyk7XG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGxheW91dFByb3ZpZGVyOiBJU2FzaExheW91dFByb3ZpZGVyLCBvcHRpb25zOiBJU2FzaE9wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lbCA9IGFwcGVuZChjb250YWluZXIsICQoJy5tb25hY28tc2FzaCcpKTtcblxuXHRcdGlmIChvcHRpb25zLm9ydGhvZ29uYWxFZGdlKSB7XG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5hZGQoYG9ydGhvZ29uYWwtZWRnZS0ke29wdGlvbnMub3J0aG9nb25hbEVkZ2V9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5hZGQoJ21hYycpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsLCAnbW91c2Vkb3duJywgZSA9PiB0aGlzLm9uUG9pbnRlclN0YXJ0KGUsIG5ldyBNb3VzZUV2ZW50RmFjdG9yeShjb250YWluZXIpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsLCAnZGJsY2xpY2snLCBlID0+IHRoaXMub25Qb2ludGVyRG91YmxlUHJlc3MoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbCwgJ21vdXNlZW50ZXInLCAoKSA9PiBTYXNoLm9uTW91c2VFbnRlcih0aGlzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmVsLCAnbW91c2VsZWF2ZScsICgpID0+IFNhc2gub25Nb3VzZUxlYXZlKHRoaXMpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLmVsKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbCwgRXZlbnRUeXBlLlN0YXJ0LCBlID0+IHRoaXMub25Qb2ludGVyU3RhcnQoZSwgbmV3IEdlc3R1cmVFdmVudEZhY3RvcnkodGhpcy5lbCkpKSk7XG5cblx0XHRsZXQgZG91YmxlVGFwVGltZW91dDogVGltZW91dCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5lbCwgRXZlbnRUeXBlLlRhcCwgZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGRvdWJsZVRhcFRpbWVvdXQpIHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KGRvdWJsZVRhcFRpbWVvdXQpO1xuXHRcdFx0XHRkb3VibGVUYXBUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLm9uUG9pbnRlckRvdWJsZVByZXNzKGV2ZW50KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjbGVhclRpbWVvdXQoZG91YmxlVGFwVGltZW91dCk7XG5cdFx0XHRkb3VibGVUYXBUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiBkb3VibGVUYXBUaW1lb3V0ID0gdW5kZWZpbmVkLCAyNTApO1xuXHRcdH0pKTtcblxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5zaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5zaXplID0gb3B0aW9ucy5zaXplO1xuXG5cdFx0XHRpZiAob3B0aW9ucy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uVkVSVElDQUwpIHtcblx0XHRcdFx0dGhpcy5lbC5zdHlsZS53aWR0aCA9IGAke3RoaXMuc2l6ZX1weGA7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmVsLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuc2l6ZX1weGA7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2l6ZSA9IGdsb2JhbFNpemU7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZUdsb2JhbFNpemUuZXZlbnQoc2l6ZSA9PiB7XG5cdFx0XHRcdHRoaXMuc2l6ZSA9IHNpemU7XG5cdFx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VIb3ZlckRlbGF5LmV2ZW50KGRlbGF5ID0+IHRoaXMuaG92ZXJEZWxheSA9IGRlbGF5KSk7XG5cblx0XHR0aGlzLmxheW91dFByb3ZpZGVyID0gbGF5b3V0UHJvdmlkZXI7XG5cblx0XHR0aGlzLm9ydGhvZ29uYWxTdGFydFNhc2ggPSBvcHRpb25zLm9ydGhvZ29uYWxTdGFydFNhc2g7XG5cdFx0dGhpcy5vcnRob2dvbmFsRW5kU2FzaCA9IG9wdGlvbnMub3J0aG9nb25hbEVuZFNhc2g7XG5cblx0XHR0aGlzLm9yaWVudGF0aW9uID0gb3B0aW9ucy5vcmllbnRhdGlvbiB8fCBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblxuXHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMKSB7XG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5hZGQoJ2hvcml6b250YWwnKTtcblx0XHRcdHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZSgndmVydGljYWwnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lbC5jbGFzc0xpc3QucmVtb3ZlKCdob3Jpem9udGFsJyk7XG5cdFx0XHR0aGlzLmVsLmNsYXNzTGlzdC5hZGQoJ3ZlcnRpY2FsJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5lbC5jbGFzc0xpc3QudG9nZ2xlKCdkZWJ1ZycsIERFQlVHKTtcblxuXHRcdHRoaXMubGF5b3V0KCk7XG5cdH1cblxuXHRwcml2YXRlIG9uUG9pbnRlclN0YXJ0KGV2ZW50OiBQb2ludGVyRXZlbnQsIHBvaW50ZXJFdmVudEZhY3Rvcnk6IElQb2ludGVyRXZlbnRGYWN0b3J5KTogdm9pZCB7XG5cdFx0RXZlbnRIZWxwZXIuc3RvcChldmVudCk7XG5cblx0XHRsZXQgaXNNdWx0aXNhc2hSZXNpemUgPSBmYWxzZTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGlmICghKGV2ZW50IGFzIGFueSkuX19vcnRob2dvbmFsU2FzaEV2ZW50KSB7XG5cdFx0XHRjb25zdCBvcnRob2dvbmFsU2FzaCA9IHRoaXMuZ2V0T3J0aG9nb25hbFNhc2goZXZlbnQpO1xuXG5cdFx0XHRpZiAob3J0aG9nb25hbFNhc2gpIHtcblx0XHRcdFx0aXNNdWx0aXNhc2hSZXNpemUgPSB0cnVlO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0KGV2ZW50IGFzIGFueSkuX19vcnRob2dvbmFsU2FzaEV2ZW50ID0gdHJ1ZTtcblx0XHRcdFx0b3J0aG9nb25hbFNhc2gub25Qb2ludGVyU3RhcnQoZXZlbnQsIG5ldyBPcnRob2dvbmFsUG9pbnRlckV2ZW50RmFjdG9yeShwb2ludGVyRXZlbnRGYWN0b3J5KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0aWYgKHRoaXMubGlua2VkU2FzaCAmJiAhKGV2ZW50IGFzIGFueSkuX19saW5rZWRTYXNoRXZlbnQpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0KGV2ZW50IGFzIGFueSkuX19saW5rZWRTYXNoRXZlbnQgPSB0cnVlO1xuXHRcdFx0dGhpcy5saW5rZWRTYXNoLm9uUG9pbnRlclN0YXJ0KGV2ZW50LCBuZXcgT3J0aG9nb25hbFBvaW50ZXJFdmVudEZhY3RvcnkocG9pbnRlckV2ZW50RmFjdG9yeSkpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGlmcmFtZXMgPSB0aGlzLmVsLm93bmVyRG9jdW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoJ2lmcmFtZScpO1xuXHRcdGZvciAoY29uc3QgaWZyYW1lIG9mIGlmcmFtZXMpIHtcblx0XHRcdGlmcmFtZS5jbGFzc0xpc3QuYWRkKFBvaW50ZXJFdmVudHNEaXNhYmxlZENzc0NsYXNzKTsgLy8gZGlzYWJsZSBtb3VzZSBldmVudHMgb24gaWZyYW1lcyBhcyBsb25nIGFzIHdlIGRyYWcgdGhlIHNhc2hcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydFggPSBldmVudC5wYWdlWDtcblx0XHRjb25zdCBzdGFydFkgPSBldmVudC5wYWdlWTtcblx0XHRjb25zdCBhbHRLZXkgPSBldmVudC5hbHRLZXk7XG5cdFx0Y29uc3Qgc3RhcnRFdmVudDogSVNhc2hFdmVudCA9IHsgc3RhcnRYLCBjdXJyZW50WDogc3RhcnRYLCBzdGFydFksIGN1cnJlbnRZOiBzdGFydFksIGFsdEtleSB9O1xuXG5cdFx0dGhpcy5lbC5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKTtcblx0XHR0aGlzLl9vbkRpZFN0YXJ0LmZpcmUoc3RhcnRFdmVudCk7XG5cblx0XHQvLyBmaXggaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIxNjc1XG5cdFx0Y29uc3Qgc3R5bGUgPSBjcmVhdGVTdHlsZVNoZWV0KHRoaXMuZWwpO1xuXHRcdGNvbnN0IHVwZGF0ZVN0eWxlID0gKCkgPT4ge1xuXHRcdFx0bGV0IGN1cnNvciA9ICcnO1xuXG5cdFx0XHRpZiAoaXNNdWx0aXNhc2hSZXNpemUpIHtcblx0XHRcdFx0Y3Vyc29yID0gJ2FsbC1zY3JvbGwnO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMKSB7XG5cdFx0XHRcdGlmICh0aGlzLnN0YXRlID09PSBTYXNoU3RhdGUuQXRNaW5pbXVtKSB7XG5cdFx0XHRcdFx0Y3Vyc29yID0gJ3MtcmVzaXplJztcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBTYXNoU3RhdGUuQXRNYXhpbXVtKSB7XG5cdFx0XHRcdFx0Y3Vyc29yID0gJ24tcmVzaXplJztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjdXJzb3IgPSBpc01hY2ludG9zaCA/ICdyb3ctcmVzaXplJyA6ICducy1yZXNpemUnO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gU2FzaFN0YXRlLkF0TWluaW11bSkge1xuXHRcdFx0XHRcdGN1cnNvciA9ICdlLXJlc2l6ZSc7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gU2FzaFN0YXRlLkF0TWF4aW11bSkge1xuXHRcdFx0XHRcdGN1cnNvciA9ICd3LXJlc2l6ZSc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y3Vyc29yID0gaXNNYWNpbnRvc2ggPyAnY29sLXJlc2l6ZScgOiAnZXctcmVzaXplJztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRzdHlsZS50ZXh0Q29udGVudCA9IGAqIHsgY3Vyc29yOiAke2N1cnNvcn0gIWltcG9ydGFudDsgfWA7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0dXBkYXRlU3R5bGUoKTtcblxuXHRcdGlmICghaXNNdWx0aXNhc2hSZXNpemUpIHtcblx0XHRcdHRoaXMub25EaWRFbmFibGVtZW50Q2hhbmdlLmV2ZW50KHVwZGF0ZVN0eWxlLCBudWxsLCBkaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb25Qb2ludGVyTW92ZSA9IChlOiBQb2ludGVyRXZlbnQpID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgZmFsc2UpO1xuXHRcdFx0Y29uc3QgZXZlbnQ6IElTYXNoRXZlbnQgPSB7IHN0YXJ0WCwgY3VycmVudFg6IGUucGFnZVgsIHN0YXJ0WSwgY3VycmVudFk6IGUucGFnZVksIGFsdEtleSB9O1xuXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGV2ZW50KTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgb25Qb2ludGVyVXAgPSAoZTogUG9pbnRlckV2ZW50KSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIGZhbHNlKTtcblxuXHRcdFx0c3R5bGUucmVtb3ZlKCk7XG5cblx0XHRcdHRoaXMuZWwuY2xhc3NMaXN0LnJlbW92ZSgnYWN0aXZlJyk7XG5cdFx0XHR0aGlzLl9vbkRpZEVuZC5maXJlKCk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdFx0Zm9yIChjb25zdCBpZnJhbWUgb2YgaWZyYW1lcykge1xuXHRcdFx0XHRpZnJhbWUuY2xhc3NMaXN0LnJlbW92ZShQb2ludGVyRXZlbnRzRGlzYWJsZWRDc3NDbGFzcyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHBvaW50ZXJFdmVudEZhY3Rvcnkub25Qb2ludGVyTW92ZShvblBvaW50ZXJNb3ZlLCBudWxsLCBkaXNwb3NhYmxlcyk7XG5cdFx0cG9pbnRlckV2ZW50RmFjdG9yeS5vblBvaW50ZXJVcChvblBvaW50ZXJVcCwgbnVsbCwgZGlzcG9zYWJsZXMpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwb2ludGVyRXZlbnRGYWN0b3J5KTtcblx0fVxuXG5cdHByaXZhdGUgb25Qb2ludGVyRG91YmxlUHJlc3MoZTogTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IG9ydGhvZ29uYWxTYXNoID0gdGhpcy5nZXRPcnRob2dvbmFsU2FzaChlKTtcblxuXHRcdGlmIChvcnRob2dvbmFsU2FzaCkge1xuXHRcdFx0b3J0aG9nb25hbFNhc2guX29uRGlkUmVzZXQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxpbmtlZFNhc2gpIHtcblx0XHRcdHRoaXMubGlua2VkU2FzaC5fb25EaWRSZXNldC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRSZXNldC5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBvbk1vdXNlRW50ZXIoc2FzaDogU2FzaCwgZnJvbUxpbmtlZFNhc2g6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmIChzYXNoLmVsLmNsYXNzTGlzdC5jb250YWlucygnYWN0aXZlJykpIHtcblx0XHRcdHNhc2guaG92ZXJEZWxheWVyLmNhbmNlbCgpO1xuXHRcdFx0c2FzaC5lbC5jbGFzc0xpc3QuYWRkKCdob3ZlcicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzYXNoLmhvdmVyRGVsYXllci50cmlnZ2VyKCgpID0+IHNhc2guZWwuY2xhc3NMaXN0LmFkZCgnaG92ZXInKSwgc2FzaC5ob3ZlckRlbGF5KS50aGVuKHVuZGVmaW5lZCwgKCkgPT4geyB9KTtcblx0XHR9XG5cblx0XHRpZiAoIWZyb21MaW5rZWRTYXNoICYmIHNhc2gubGlua2VkU2FzaCkge1xuXHRcdFx0U2FzaC5vbk1vdXNlRW50ZXIoc2FzaC5saW5rZWRTYXNoLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBvbk1vdXNlTGVhdmUoc2FzaDogU2FzaCwgZnJvbUxpbmtlZFNhc2g6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdHNhc2guaG92ZXJEZWxheWVyLmNhbmNlbCgpO1xuXHRcdHNhc2guZWwuY2xhc3NMaXN0LnJlbW92ZSgnaG92ZXInKTtcblxuXHRcdGlmICghZnJvbUxpbmtlZFNhc2ggJiYgc2FzaC5saW5rZWRTYXNoKSB7XG5cdFx0XHRTYXNoLm9uTW91c2VMZWF2ZShzYXNoLmxpbmtlZFNhc2gsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGb3JjZWZ1bGx5IHN0b3AgYW55IHVzZXIgaW50ZXJhY3Rpb25zIHdpdGggdGhpcyBzYXNoLlxuXHQgKiBVc2VmdWwgd2hlbiBoaWRpbmcgYSBwYXJlbnQgY29tcG9uZW50LCB3aGlsZSB0aGUgdXNlciBpcyBzdGlsbFxuXHQgKiBpbnRlcmFjdGluZyB3aXRoIHRoZSBzYXNoLlxuXHQgKi9cblx0Y2xlYXJTYXNoSG92ZXJTdGF0ZSgpOiB2b2lkIHtcblx0XHRTYXNoLm9uTW91c2VMZWF2ZSh0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlvdXQgdGhlIHNhc2guIFRoZSBzYXNoIHdpbGwgc2l6ZSBhbmQgcG9zaXRpb24gaXRzZWxmXG5cdCAqIGJhc2VkIG9uIGl0cyBwcm92aWRlZCB7QGxpbmsgSVNhc2hMYXlvdXRQcm92aWRlciBsYXlvdXQgcHJvdmlkZXJ9LlxuXHQgKi9cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5WRVJUSUNBTCkge1xuXHRcdFx0Y29uc3QgdmVydGljYWxQcm92aWRlciA9ICg8SVZlcnRpY2FsU2FzaExheW91dFByb3ZpZGVyPnRoaXMubGF5b3V0UHJvdmlkZXIpO1xuXHRcdFx0dGhpcy5lbC5zdHlsZS5sZWZ0ID0gdmVydGljYWxQcm92aWRlci5nZXRWZXJ0aWNhbFNhc2hMZWZ0KHRoaXMpIC0gKHRoaXMuc2l6ZSAvIDIpICsgJ3B4JztcblxuXHRcdFx0aWYgKHZlcnRpY2FsUHJvdmlkZXIuZ2V0VmVydGljYWxTYXNoVG9wKSB7XG5cdFx0XHRcdHRoaXMuZWwuc3R5bGUudG9wID0gdmVydGljYWxQcm92aWRlci5nZXRWZXJ0aWNhbFNhc2hUb3AodGhpcykgKyAncHgnO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmVydGljYWxQcm92aWRlci5nZXRWZXJ0aWNhbFNhc2hIZWlnaHQpIHtcblx0XHRcdFx0dGhpcy5lbC5zdHlsZS5oZWlnaHQgPSB2ZXJ0aWNhbFByb3ZpZGVyLmdldFZlcnRpY2FsU2FzaEhlaWdodCh0aGlzKSArICdweCc7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGhvcml6b250YWxQcm92aWRlciA9ICg8SUhvcml6b250YWxTYXNoTGF5b3V0UHJvdmlkZXI+dGhpcy5sYXlvdXRQcm92aWRlcik7XG5cdFx0XHR0aGlzLmVsLnN0eWxlLnRvcCA9IGhvcml6b250YWxQcm92aWRlci5nZXRIb3Jpem9udGFsU2FzaFRvcCh0aGlzKSAtICh0aGlzLnNpemUgLyAyKSArICdweCc7XG5cblx0XHRcdGlmIChob3Jpem9udGFsUHJvdmlkZXIuZ2V0SG9yaXpvbnRhbFNhc2hMZWZ0KSB7XG5cdFx0XHRcdHRoaXMuZWwuc3R5bGUubGVmdCA9IGhvcml6b250YWxQcm92aWRlci5nZXRIb3Jpem9udGFsU2FzaExlZnQodGhpcykgKyAncHgnO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaG9yaXpvbnRhbFByb3ZpZGVyLmdldEhvcml6b250YWxTYXNoV2lkdGgpIHtcblx0XHRcdFx0dGhpcy5lbC5zdHlsZS53aWR0aCA9IGhvcml6b250YWxQcm92aWRlci5nZXRIb3Jpem9udGFsU2FzaFdpZHRoKHRoaXMpICsgJ3B4Jztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE9ydGhvZ29uYWxTYXNoKGU6IFBvaW50ZXJFdmVudCk6IFNhc2ggfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IGUuaW5pdGlhbFRhcmdldCA/PyBlLnRhcmdldDtcblxuXHRcdGlmICghdGFyZ2V0IHx8ICEoaXNIVE1MRWxlbWVudCh0YXJnZXQpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnb3J0aG9nb25hbC1kcmFnLWhhbmRsZScpKSB7XG5cdFx0XHRyZXR1cm4gdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnc3RhcnQnKSA/IHRoaXMub3J0aG9nb25hbFN0YXJ0U2FzaCA6IHRoaXMub3J0aG9nb25hbEVuZFNhc2g7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWwucmVtb3ZlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7QUFLQSxTQUFTLEdBQUcsdUJBQXVCLFFBQVEsYUFBd0IsV0FBVyxxQkFBcUI7QUFDbkcsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXLGVBQWU7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsbUJBQW1CO0FBQzVCLE9BQU87QUFNUCxNQUFNLFFBQVE7QUErQlAsSUFBSyxpQkFBTCxrQkFBS0Esb0JBQUw7QUFDTixFQUFBQSxnQkFBQSxXQUFRO0FBQ1IsRUFBQUEsZ0JBQUEsV0FBUTtBQUNSLEVBQUFBLGdCQUFBLFVBQU87QUFDUCxFQUFBQSxnQkFBQSxVQUFPO0FBSkksU0FBQUE7QUFBQSxHQUFBO0FBNkRMLElBQVcsY0FBWCxrQkFBV0MsaUJBQVg7QUFDTixFQUFBQSwwQkFBQTtBQUNBLEVBQUFBLDBCQUFBO0FBRmlCLFNBQUFBO0FBQUEsR0FBQTtBQUtYLElBQVcsWUFBWCxrQkFBV0MsZUFBWDtBQUtOLEVBQUFBLHNCQUFB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
