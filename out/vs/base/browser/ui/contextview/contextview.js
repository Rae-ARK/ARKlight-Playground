import { BrowserFeatures } from "../../canIUse.js";
import * as DOM from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { Disposable, DisposableStore, toDisposable } from "../../../common/lifecycle.js";
import { AnchorAlignment, AnchorPosition, layout2d } from "../../../common/layout.js";
import * as platform from "../../../common/platform.js";
import "./contextview.css";
import { AnchorAlignment as AnchorAlignment2, AnchorAxisAlignment as AnchorAxisAlignment2, AnchorPosition as AnchorPosition2 } from "../../../common/layout.js";
var ContextViewDOMPosition = /* @__PURE__ */ ((ContextViewDOMPosition2) => {
  ContextViewDOMPosition2[ContextViewDOMPosition2["ABSOLUTE"] = 1] = "ABSOLUTE";
  ContextViewDOMPosition2[ContextViewDOMPosition2["FIXED"] = 2] = "FIXED";
  ContextViewDOMPosition2[ContextViewDOMPosition2["FIXED_SHADOW"] = 3] = "FIXED_SHADOW";
  return ContextViewDOMPosition2;
})(ContextViewDOMPosition || {});
function isAnchor(obj) {
  const anchor = obj;
  return !!anchor && typeof anchor.x === "number" && typeof anchor.y === "number";
}
const CONTEXT_VIEW_MENU_MOTION_CLASS = "context-view-menu-motion";
const CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS = "context-view-menu-motion-closing";
const CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION = 150;
const CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES = ["style-override", "monaco-enable-motion"];
const CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE = "--vscode-context-view-close-animation-duration";
const CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE = "--vscode-context-view-menu-motion-shadow";
const CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE = "--vscode-context-view-menu-motion-close-start-opacity";
const CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE = "--vscode-context-view-menu-motion-close-start-transform";
const CONTEXT_VIEW_MENU_MOTION_OPEN_DURATION_MS = 250;
const CONTEXT_VIEW_MENU_MOTION_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const contextViewMenuCloseAnimation = {
  className: CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS,
  duration: CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION,
  requiredAncestorClasses: CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES
};
function getContextViewMenuMotionCss(enabledSelectorPrefix) {
  return (
    /* css */
    `
	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS} {
		animation: none;
		box-shadow: none;
		overflow: visible;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS} > .monaco-scrollable-element {
		animation: context-view-menu-motion-open ${CONTEXT_VIEW_MENU_MOTION_OPEN_DURATION_MS}ms ${CONTEXT_VIEW_MENU_MOTION_EASING} backwards;
		box-shadow: var(${CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE});
		transform-origin: top left;
		will-change: opacity;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.right > .monaco-scrollable-element {
		transform-origin: top right;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.top > .monaco-scrollable-element {
		transform-origin: bottom left;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.top.right > .monaco-scrollable-element {
		transform-origin: bottom right;
	}

	${enabledSelectorPrefix} .context-view.${CONTEXT_VIEW_MENU_MOTION_CLASS}.${CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS} > .monaco-scrollable-element {
		animation: context-view-menu-motion-close var(${CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE}) ${CONTEXT_VIEW_MENU_MOTION_EASING} both;
		pointer-events: none;
	}

	@keyframes context-view-menu-motion-open {
		0% {
			opacity: 0;
			transform: scale(0.97);
		}

		100% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes context-view-menu-motion-close {
		0% {
			opacity: var(${CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE}, 1);
			transform: var(${CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE}, scale(1));
		}

		100% {
			opacity: 0;
			transform: scale(0.99);
		}
	}`
  );
}
let contextViewMenuMotionStyleSheet;
function ensureContextViewMenuMotionStyleSheet() {
  if (!contextViewMenuMotionStyleSheet) {
    contextViewMenuMotionStyleSheet = createStyleSheet(void 0, (style) => {
      style.textContent = getContextViewMenuMotionCss(".style-override.monaco-enable-motion");
    });
  }
}
function getAnchorRect(anchor) {
  if (DOM.isHTMLElement(anchor)) {
    const elementPosition = DOM.getDomNodePagePosition(anchor);
    const zoom = DOM.getDomNodeZoomLevel(anchor);
    return {
      top: elementPosition.top * zoom,
      left: elementPosition.left * zoom,
      width: elementPosition.width * zoom,
      height: elementPosition.height * zoom
    };
  } else if (isAnchor(anchor)) {
    return {
      top: anchor.y,
      left: anchor.x,
      width: anchor.width || 1,
      height: anchor.height || 2
    };
  } else {
    return {
      top: anchor.posy,
      left: anchor.posx,
      // We are about to position the context view where the mouse
      // cursor is. To prevent the view being exactly under the mouse
      // when showing and thus potentially triggering an action within,
      // we treat the mouse location like a small sized block element.
      width: 2,
      height: 2
    };
  }
}
const _ContextView = class _ContextView extends Disposable {
  constructor(container, domPosition) {
    super();
    this.container = null;
    this.useFixedPosition = false;
    this.useShadowDOM = false;
    this.delegate = null;
    this.toDisposeOnClean = Disposable.None;
    this.toDisposeOnSetContainer = Disposable.None;
    this.shadowRoot = null;
    this.shadowRootHostElement = null;
    ensureContextViewMenuMotionStyleSheet();
    this.view = DOM.$(".context-view");
    DOM.hide(this.view);
    this.setContainer(container, domPosition);
    this._register(toDisposable(() => this.setContainer(null, 1 /* ABSOLUTE */)));
  }
  setContainer(container, domPosition) {
    this.useFixedPosition = domPosition !== 1 /* ABSOLUTE */;
    const usedShadowDOM = this.useShadowDOM;
    this.useShadowDOM = domPosition === 3 /* FIXED_SHADOW */;
    if (container === this.container && usedShadowDOM === this.useShadowDOM) {
      return;
    }
    if (this.container) {
      this.toDisposeOnSetContainer.dispose();
      this.view.remove();
      if (this.shadowRoot) {
        this.shadowRoot = null;
        this.shadowRootHostElement?.remove();
        this.shadowRootHostElement = null;
      }
      this.container = null;
    }
    if (container) {
      this.container = container;
      if (this.useShadowDOM) {
        this.shadowRootHostElement = DOM.$(".shadow-root-host");
        this.container.appendChild(this.shadowRootHostElement);
        this.shadowRoot = this.shadowRootHostElement.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = SHADOW_ROOT_CSS;
        this.shadowRoot.appendChild(style);
        this.shadowRoot.appendChild(this.view);
        this.shadowRoot.appendChild(DOM.$("slot"));
      } else {
        this.container.appendChild(this.view);
      }
      const toDisposeOnSetContainer = new DisposableStore();
      _ContextView.BUBBLE_UP_EVENTS.forEach((event) => {
        toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container, event, (e) => {
          this.onDOMEvent(e, false);
        }));
      });
      _ContextView.BUBBLE_DOWN_EVENTS.forEach((event) => {
        toDisposeOnSetContainer.add(DOM.addStandardDisposableListener(this.container, event, (e) => {
          this.onDOMEvent(e, true);
        }, true));
      });
      this.toDisposeOnSetContainer = toDisposeOnSetContainer;
    }
  }
  show(delegate) {
    this.completeHideAnimation();
    if (this.isVisible()) {
      this.hide(void 0, true);
    }
    DOM.clearNode(this.view);
    this.view.className = "context-view monaco-component";
    this.view.style.top = "0px";
    this.view.style.left = "0px";
    this.view.style.zIndex = `${2575 + (delegate.layer ?? 0)}`;
    this.view.style.position = this.useFixedPosition ? "fixed" : "absolute";
    DOM.show(this.view);
    this.toDisposeOnClean = delegate.render(this.view) || Disposable.None;
    this.delegate = delegate;
    this.doLayout();
    this.delegate.focus?.();
  }
  getViewElement() {
    return this.view;
  }
  layout() {
    if (!this.isVisible()) {
      return;
    }
    if (this.delegate.canRelayout === false && !(platform.isIOS && BrowserFeatures.pointerEvents)) {
      this.hide();
      return;
    }
    this.delegate?.layout?.();
    this.doLayout();
  }
  doLayout() {
    if (!this.isVisible()) {
      return;
    }
    const anchor = getAnchorRect(this.delegate.getAnchor());
    const containerWindow = this.container ? DOM.getWindow(this.container) : DOM.getActiveWindow();
    const viewport = { top: containerWindow.pageYOffset, left: containerWindow.pageXOffset, width: containerWindow.innerWidth, height: containerWindow.innerHeight };
    const view = { width: DOM.getTotalWidth(this.view), height: DOM.getTotalHeight(this.view) };
    const anchorPosition = this.delegate.anchorPosition;
    const anchorAlignment = this.delegate.anchorAlignment;
    const anchorAxisAlignment = this.delegate.anchorAxisAlignment;
    const layoutResult = layout2d(viewport, view, anchor, { anchorAlignment, anchorPosition, anchorAxisAlignment });
    const { top, left } = layoutResult;
    this.view.classList.remove("top", "bottom", "left", "right");
    this.view.classList.add(layoutResult.anchorPosition === AnchorPosition.BELOW ? "bottom" : "top");
    this.view.classList.add(layoutResult.anchorAlignment === AnchorAlignment.LEFT ? "left" : "right");
    this.view.classList.toggle("fixed", this.useFixedPosition);
    const containerPosition = DOM.getDomNodePagePosition(this.container);
    const containerScrollTop = this.container.scrollTop || 0;
    const containerScrollLeft = this.container.scrollLeft || 0;
    this.view.style.top = `${top - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).top : containerPosition.top) + containerScrollTop}px`;
    this.view.style.left = `${left - (this.useFixedPosition ? DOM.getDomNodePagePosition(this.view).left : containerPosition.left) + containerScrollLeft}px`;
    this.view.style.width = "initial";
  }
  hide(data, skipAnimation = false) {
    if (this.hidingContextView) {
      if (skipAnimation) {
        this.completeHideAnimation();
      }
      return;
    }
    const delegate = this.delegate;
    this.delegate = null;
    if (!delegate) {
      return;
    }
    const toDispose = this.toDisposeOnClean;
    this.toDisposeOnClean = Disposable.None;
    delegate.onHide?.(data);
    const closeAnimation = delegate.closeAnimation;
    if (!skipAnimation && closeAnimation && closeAnimation.duration > 0 && this.hasRequiredAncestorClasses(closeAnimation.requiredAncestorClasses)) {
      this.view.style.setProperty(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE, `${closeAnimation.duration}ms`);
      this.prepareMenuCloseAnimation();
      this.view.classList.add(closeAnimation.className);
      const timeout = setTimeout(() => this.completeHideAnimation(), closeAnimation.duration);
      this.hidingContextView = {
        disposable: toDisposable(() => clearTimeout(timeout)),
        toDispose,
        className: closeAnimation.className
      };
      return;
    }
    toDispose.dispose();
    DOM.hide(this.view);
  }
  isVisible() {
    return !!this.delegate;
  }
  completeHideAnimation() {
    const hidingContextView = this.hidingContextView;
    if (!hidingContextView) {
      return;
    }
    this.hidingContextView = void 0;
    hidingContextView.disposable.dispose();
    this.view.classList.remove(hidingContextView.className);
    this.view.style.removeProperty(CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE);
    this.view.style.removeProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE);
    this.view.style.removeProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE);
    hidingContextView.toDispose.dispose();
    DOM.hide(this.view);
  }
  prepareMenuCloseAnimation() {
    if (!this.view.classList.contains(CONTEXT_VIEW_MENU_MOTION_CLASS)) {
      return;
    }
    const surface = Array.from(this.view.children).find((element) => DOM.isHTMLElement(element) && element.classList.contains("monaco-scrollable-element"));
    if (!DOM.isHTMLElement(surface)) {
      return;
    }
    const computedStyle = DOM.getWindow(surface).getComputedStyle(surface);
    this.view.style.setProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_OPACITY_VARIABLE, computedStyle.opacity);
    this.view.style.setProperty(CONTEXT_VIEW_MENU_MOTION_CLOSE_START_TRANSFORM_VARIABLE, computedStyle.transform);
  }
  hasRequiredAncestorClasses(classNames) {
    if (!classNames?.length) {
      return true;
    }
    for (let candidate = this.view; candidate; ) {
      const current = candidate;
      if (classNames.every((className) => current.classList.contains(className))) {
        return true;
      }
      if (current.parentElement) {
        candidate = current.parentElement;
      } else {
        const root = current.getRootNode();
        candidate = root instanceof ShadowRoot && DOM.isHTMLElement(root.host) ? root.host : null;
      }
    }
    return false;
  }
  onDOMEvent(e, onCapture) {
    if (this.delegate) {
      if (this.delegate.onDOMEvent) {
        this.delegate.onDOMEvent(e, DOM.getWindow(e).document.activeElement);
      } else if (onCapture && !DOM.isAncestor(e.target, this.container)) {
        this.hide();
      }
    }
  }
  dispose() {
    this.hide();
    this.completeHideAnimation();
    super.dispose();
  }
};
_ContextView.BUBBLE_UP_EVENTS = ["click", "keydown", "focus", "blur"];
_ContextView.BUBBLE_DOWN_EVENTS = ["click"];
let ContextView = _ContextView;
const SHADOW_ROOT_CSS = (
  /* css */
  `
	:host {
		all: initial; /* 1st rule so subsequent properties are reset. */
	}

	.codicon[class*='codicon-'] {
		font: normal normal normal 16px/1 codicon;
		display: inline-block;
		text-decoration: none;
		text-rendering: auto;
		text-align: center;
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
	}

	:host {
		font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", system-ui, "Ubuntu", "Droid Sans", sans-serif;
	}

	:host-context(.mac) { font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
	:host-context(.mac:lang(zh-Hans)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", sans-serif; }
	:host-context(.mac:lang(zh-Hant)) { font-family: -apple-system, BlinkMacSystemFont, "PingFang TC", sans-serif; }
	:host-context(.mac:lang(ja)) { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic Pro", sans-serif; }
	:host-context(.mac:lang(ko)) { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Nanum Gothic", "AppleGothic", sans-serif; }

	:host-context(.windows) { font-family: "Segoe WPC", "Segoe UI", sans-serif; }
	:host-context(.windows:lang(zh-Hans)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft YaHei", sans-serif; }
	:host-context(.windows:lang(zh-Hant)) { font-family: "Segoe WPC", "Segoe UI", "Microsoft Jhenghei", sans-serif; }
	:host-context(.windows:lang(ja)) { font-family: "Segoe WPC", "Segoe UI", "Yu Gothic UI", "Meiryo UI", sans-serif; }
	:host-context(.windows:lang(ko)) { font-family: "Segoe WPC", "Segoe UI", "Malgun Gothic", "Dotom", sans-serif; }

	:host-context(.linux) { font-family: system-ui, "Ubuntu", "Droid Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hans)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans SC", "Source Han Sans CN", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(zh-Hant)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans TC", "Source Han Sans TW", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ja)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans J", "Source Han Sans JP", "Source Han Sans", sans-serif; }
	:host-context(.linux:lang(ko)) { font-family: system-ui, "Ubuntu", "Droid Sans", "Source Han Sans K", "Source Han Sans JR", "Source Han Sans", "UnDotum", "FBaekmuk Gulim", sans-serif; }
	${getContextViewMenuMotionCss(":host-context(.style-override.monaco-enable-motion)")}
`
);
export {
  AnchorAlignment2 as AnchorAlignment,
  AnchorAxisAlignment2 as AnchorAxisAlignment,
  AnchorPosition2 as AnchorPosition,
  CONTEXT_VIEW_CLOSE_ANIMATION_DURATION_VARIABLE,
  CONTEXT_VIEW_MENU_MOTION_ANCESTOR_CLASSES,
  CONTEXT_VIEW_MENU_MOTION_CLASS,
  CONTEXT_VIEW_MENU_MOTION_CLOSE_ANIMATION_DURATION,
  CONTEXT_VIEW_MENU_MOTION_CLOSING_CLASS,
  CONTEXT_VIEW_MENU_MOTION_SHADOW_VARIABLE,
  ContextView,
  ContextViewDOMPosition,
  contextViewMenuCloseAnimation,
  getAnchorRect,
  isAnchor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEJyb3dzZXJGZWF0dXJlcyB9IGZyb20gJy4uLy4uL2NhbklVc2UuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFuY2hvckFsaWdubWVudCwgQW5jaG9yQXhpc0FsaWdubWVudCwgQW5jaG9yUG9zaXRpb24sIElSZWN0LCBsYXlvdXQyZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYXlvdXQuanMnO1xuaW1wb3J0ICogYXMgcGxhdGZvcm0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IE9taXRPcHRpb25hbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgJy4vY29udGV4dHZpZXcuY3NzJztcblxuZXhwb3J0IHsgQW5jaG9yQWxpZ25tZW50LCBBbmNob3JBeGlzQWxpZ25tZW50LCBBbmNob3JQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYXlvdXQuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBDb250ZXh0Vmlld0RPTVBvc2l0aW9uIHtcblx0QUJTT0xVVEUgPSAxLFxuXHRGSVhFRCxcblx0RklYRURfU0hBRE9XXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFuY2hvciB7XG5cdHg6IG51bWJlcjtcblx0eTogbnVtYmVyO1xuXHR3aWR0aD86IG51bWJlcjtcblx0aGVpZ2h0PzogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBbmNob3Iob2JqOiB1bmtub3duKTogb2JqIGlzIElBbmNob3IgfCBPbWl0T3B0aW9uYWw8SUFuY2hvcj4ge1xuXHRjb25zdCBhbmNob3IgPSBvYmogYXMgSUFuY2hvciB8IE9taXRPcHRpb25hbDxJQW5jaG9yPiB8IHVuZGVmaW5lZDtcblxuXHRyZXR1cm4gISFhbmNob3IgJiYgdHlwZW9mIGFuY2hvci54ID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgYW5jaG9yLnkgPT09ICdudW1iZXInO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEZWxlZ2F0ZSB7XG5cdC8qKlxuXHQgKiBUaGUgYW5jaG9yIHdoZXJlIHRvIHBvc2l0aW9uIHRoZSBjb250ZXh0IHZpZXcuXG5cdCAqIFVzZSBhIGBIVE1MRWxlbWVudGAgdG8gcG9zaXRpb24gdGhlIHZpZXcgYXQgdGhlIGVsZW1lbnQsXG5cdCAqIGEgYFN0YW5kYXJkTW91c2VFdmVudGAgdG8gcG9zaXRpb24gaXQgYXQgdGhlIG1vdXNlIHBvc2l0aW9uXG5cdCAqIG9yIGFuIGBJQW5jaG9yYCB0byBwb3NpdGlvbiBpdCBhdCBhIHNwZWNpZmljIGxvY2F0aW9uLlxuXHQgKi9cblx0Z2V0QW5jaG9yKCk6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50IHwgSUFuY2hvcjtcblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRGlzcG9zYWJsZSB8IG51bGw7XG5cdGZvY3VzPygpOiB2b2lkO1xuXHRsYXlvdXQ/KCk6IHZvaWQ7XG5cdGFuY2hvckFsaWdubWVudD86IEFuY2hvckFsaWdubWVudDsgLy8gZGVmYXVsdDogbGVmdFxuXHRhbmNob3JQb3NpdGlvbj86IEFuY2hvclBvc2l0aW9uOyAvLyBkZWZhdWx0OiBiZWxvd1xuXHRhbmNob3JBeGlzQWxpZ25tZW50PzogQW5jaG9yQXhpc0FsaWdubWVudDsgLy8gZGVmYXVsdDogdmVydGljYWxcblx0Y2FuUmVsYXlvdXQ/OiBib29sZWFuOyAvLyBkZWZhdWx0OiB0cnVlXG5cdG9uRE9NRXZlbnQ/KGU6IEV2ZW50LCBhY3RpdmVFbGVtZW50OiBIVE1MRWxlbWVudCk6IHZvaWQ7XG5cdG9uSGlkZT8oZGF0YT86IHVua25vd24pOiB2b2lkO1xuXHRjbG9zZUFuaW1hdGlvbj86IElDb250ZXh0Vmlld0Nsb3NlQW5pbWF0aW9uO1xuXG5cdC8qKlxuXHQgKiBjb250ZXh0IHZpZXdzIHdpdGggaGlnaGVyIGxheWVycyBhcmUgcmVuZGVyZWQgaGlnaGVyIGluIHotaW5kZXggb3JkZXJcblx0ICovXG5cdGxheWVyPzogbnVtYmVyOyAvLyBEZWZhdWx0OiAwXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRWaWV3Q2xvc2VBbmltYXRpb24ge1xuXHRyZWFkb25seSBjbGFzc05hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcblx0cmVhZG9ubHkgcmVxdWlyZWRBbmNlc3RvckNsYXNzZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNvbnN0IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTEFTUyA9ICdjb250ZXh0LXZpZXctbWVudS1tb3Rpb24nO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TSU5HX0NMQVNTID0gJ2NvbnRleHQtdmlldy1tZW51LW1vdGlvbi1jbG9zaW5nJztcbmV4cG9ydCBjb25zdCBDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xPU0VfQU5JTUFUSU9OX0RVUkFUSU9OID0gMTUwO1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9BTkNFU1RPUl9DTEFTU0VTID0gWydzdHlsZS1vdmVycmlkZScsICdtb25hY28tZW5hYmxlLW1vdGlvbiddIGFzIGNvbnN0O1xuZXhwb3J0IGNvbnN0IENPTlRFWFRfVklFV19DTE9TRV9BTklNQVRJT05fRFVSQVRJT05fVkFSSUFCTEUgPSAnLS12c2NvZGUtY29udGV4dC12aWV3LWNsb3NlLWFuaW1hdGlvbi1kdXJhdGlvbic7XG5leHBvcnQgY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX1NIQURPV19WQVJJQUJMRSA9ICctLXZzY29kZS1jb250ZXh0LXZpZXctbWVudS1tb3Rpb24tc2hhZG93JztcbmNvbnN0IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9TVEFSVF9PUEFDSVRZX1ZBUklBQkxFID0gJy0tdnNjb2RlLWNvbnRleHQtdmlldy1tZW51LW1vdGlvbi1jbG9zZS1zdGFydC1vcGFjaXR5JztcbmNvbnN0IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9TVEFSVF9UUkFOU0ZPUk1fVkFSSUFCTEUgPSAnLS12c2NvZGUtY29udGV4dC12aWV3LW1lbnUtbW90aW9uLWNsb3NlLXN0YXJ0LXRyYW5zZm9ybSc7XG5cbmNvbnN0IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9PUEVOX0RVUkFUSU9OX01TID0gMjUwO1xuY29uc3QgQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0VBU0lORyA9ICdjdWJpYy1iZXppZXIoMC4yMiwgMSwgMC4zNiwgMSknO1xuXG5leHBvcnQgY29uc3QgY29udGV4dFZpZXdNZW51Q2xvc2VBbmltYXRpb246IElDb250ZXh0Vmlld0Nsb3NlQW5pbWF0aW9uID0ge1xuXHRjbGFzc05hbWU6IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TSU5HX0NMQVNTLFxuXHRkdXJhdGlvbjogQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTixcblx0cmVxdWlyZWRBbmNlc3RvckNsYXNzZXM6IENPTlRFWFRfVklFV19NRU5VX01PVElPTl9BTkNFU1RPUl9DTEFTU0VTLFxufTtcblxuZnVuY3Rpb24gZ2V0Q29udGV4dFZpZXdNZW51TW90aW9uQ3NzKGVuYWJsZWRTZWxlY3RvclByZWZpeDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIC8qIGNzcyAqLyBgXG5cdCR7ZW5hYmxlZFNlbGVjdG9yUHJlZml4fSAuY29udGV4dC12aWV3LiR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTfSB7XG5cdFx0YW5pbWF0aW9uOiBub25lO1xuXHRcdGJveC1zaGFkb3c6IG5vbmU7XG5cdFx0b3ZlcmZsb3c6IHZpc2libGU7XG5cdH1cblxuXHQke2VuYWJsZWRTZWxlY3RvclByZWZpeH0gLmNvbnRleHQtdmlldy4ke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTEFTU30gPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCB7XG5cdFx0YW5pbWF0aW9uOiBjb250ZXh0LXZpZXctbWVudS1tb3Rpb24tb3BlbiAke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9PUEVOX0RVUkFUSU9OX01TfW1zICR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0VBU0lOR30gYmFja3dhcmRzO1xuXHRcdGJveC1zaGFkb3c6IHZhcigke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9TSEFET1dfVkFSSUFCTEV9KTtcblx0XHR0cmFuc2Zvcm0tb3JpZ2luOiB0b3AgbGVmdDtcblx0XHR3aWxsLWNoYW5nZTogb3BhY2l0eTtcblx0fVxuXG5cdCR7ZW5hYmxlZFNlbGVjdG9yUHJlZml4fSAuY29udGV4dC12aWV3LiR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMQVNTfS5yaWdodCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IHtcblx0XHR0cmFuc2Zvcm0tb3JpZ2luOiB0b3AgcmlnaHQ7XG5cdH1cblxuXHQke2VuYWJsZWRTZWxlY3RvclByZWZpeH0gLmNvbnRleHQtdmlldy4ke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTEFTU30udG9wID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQge1xuXHRcdHRyYW5zZm9ybS1vcmlnaW46IGJvdHRvbSBsZWZ0O1xuXHR9XG5cblx0JHtlbmFibGVkU2VsZWN0b3JQcmVmaXh9IC5jb250ZXh0LXZpZXcuJHtDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xBU1N9LnRvcC5yaWdodCA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IHtcblx0XHR0cmFuc2Zvcm0tb3JpZ2luOiBib3R0b20gcmlnaHQ7XG5cdH1cblxuXHQke2VuYWJsZWRTZWxlY3RvclByZWZpeH0gLmNvbnRleHQtdmlldy4ke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTEFTU30uJHtDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xPU0lOR19DTEFTU30gPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCB7XG5cdFx0YW5pbWF0aW9uOiBjb250ZXh0LXZpZXctbWVudS1tb3Rpb24tY2xvc2UgdmFyKCR7Q09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRX0pICR7Q09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0VBU0lOR30gYm90aDtcblx0XHRwb2ludGVyLWV2ZW50czogbm9uZTtcblx0fVxuXG5cdEBrZXlmcmFtZXMgY29udGV4dC12aWV3LW1lbnUtbW90aW9uLW9wZW4ge1xuXHRcdDAlIHtcblx0XHRcdG9wYWNpdHk6IDA7XG5cdFx0XHR0cmFuc2Zvcm06IHNjYWxlKDAuOTcpO1xuXHRcdH1cblxuXHRcdDEwMCUge1xuXHRcdFx0b3BhY2l0eTogMTtcblx0XHRcdHRyYW5zZm9ybTogc2NhbGUoMSk7XG5cdFx0fVxuXHR9XG5cblx0QGtleWZyYW1lcyBjb250ZXh0LXZpZXctbWVudS1tb3Rpb24tY2xvc2Uge1xuXHRcdDAlIHtcblx0XHRcdG9wYWNpdHk6IHZhcigke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9TVEFSVF9PUEFDSVRZX1ZBUklBQkxFfSwgMSk7XG5cdFx0XHR0cmFuc2Zvcm06IHZhcigke0NPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9TVEFSVF9UUkFOU0ZPUk1fVkFSSUFCTEV9LCBzY2FsZSgxKSk7XG5cdFx0fVxuXG5cdFx0MTAwJSB7XG5cdFx0XHRvcGFjaXR5OiAwO1xuXHRcdFx0dHJhbnNmb3JtOiBzY2FsZSgwLjk5KTtcblx0XHR9XG5cdH1gO1xufVxuXG5sZXQgY29udGV4dFZpZXdNZW51TW90aW9uU3R5bGVTaGVldDogSFRNTFN0eWxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuZnVuY3Rpb24gZW5zdXJlQ29udGV4dFZpZXdNZW51TW90aW9uU3R5bGVTaGVldCgpOiB2b2lkIHtcblx0aWYgKCFjb250ZXh0Vmlld01lbnVNb3Rpb25TdHlsZVNoZWV0KSB7XG5cdFx0Y29udGV4dFZpZXdNZW51TW90aW9uU3R5bGVTaGVldCA9IGNyZWF0ZVN0eWxlU2hlZXQodW5kZWZpbmVkLCBzdHlsZSA9PiB7XG5cdFx0XHRzdHlsZS50ZXh0Q29udGVudCA9IGdldENvbnRleHRWaWV3TWVudU1vdGlvbkNzcygnLnN0eWxlLW92ZXJyaWRlLm1vbmFjby1lbmFibGUtbW90aW9uJyk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29udGV4dFZpZXdQcm92aWRlciB7XG5cdHNob3dDb250ZXh0VmlldyhkZWxlZ2F0ZTogSURlbGVnYXRlLCBjb250YWluZXI/OiBIVE1MRWxlbWVudCk6IHZvaWQ7XG5cdGhpZGVDb250ZXh0VmlldygpOiB2b2lkO1xuXHRsYXlvdXQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEFuY2hvclJlY3QoYW5jaG9yOiBIVE1MRWxlbWVudCB8IFN0YW5kYXJkTW91c2VFdmVudCB8IElBbmNob3IpOiBJUmVjdCB7XG5cdC8vIEdldCB0aGUgZWxlbWVudCdzIHBvc2l0aW9uIGFuZCBzaXplICh0byBhbmNob3IgdGhlIHZpZXcpXG5cdGlmIChET00uaXNIVE1MRWxlbWVudChhbmNob3IpKSB7XG5cdFx0Y29uc3QgZWxlbWVudFBvc2l0aW9uID0gRE9NLmdldERvbU5vZGVQYWdlUG9zaXRpb24oYW5jaG9yKTtcblxuXHRcdC8vIEluIGFyZWFzIHdoZXJlIHpvb20gaXMgYXBwbGllZCB0byB0aGUgZWxlbWVudCBvciBpdHMgYW5jZXN0b3JzLCB3ZSBuZWVkIHRvIGFkanVzdCB0aGUgc2l6ZSBvZiB0aGUgZWxlbWVudFxuXHRcdC8vIGUuZy4gVGhlIHRpdGxlIGJhciBoYXMgY291bnRlciB6b29tIGJlaGF2aW9yIG1lYW5pbmcgaXQgYXBwbGllcyB0aGUgaW52ZXJzZSBvZiB6b29tIGxldmVsLlxuXHRcdC8vIFdpbmRvdyBab29tIExldmVsOiAxLjUsIFRpdGxlIEJhciBab29tOiAxLzEuNSwgU2l6ZSBNdWx0aXBsaWVyOiAxLjVcblx0XHRjb25zdCB6b29tID0gRE9NLmdldERvbU5vZGVab29tTGV2ZWwoYW5jaG9yKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR0b3A6IGVsZW1lbnRQb3NpdGlvbi50b3AgKiB6b29tLFxuXHRcdFx0bGVmdDogZWxlbWVudFBvc2l0aW9uLmxlZnQgKiB6b29tLFxuXHRcdFx0d2lkdGg6IGVsZW1lbnRQb3NpdGlvbi53aWR0aCAqIHpvb20sXG5cdFx0XHRoZWlnaHQ6IGVsZW1lbnRQb3NpdGlvbi5oZWlnaHQgKiB6b29tXG5cdFx0fTtcblx0fSBlbHNlIGlmIChpc0FuY2hvcihhbmNob3IpKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvcDogYW5jaG9yLnksXG5cdFx0XHRsZWZ0OiBhbmNob3IueCxcblx0XHRcdHdpZHRoOiBhbmNob3Iud2lkdGggfHwgMSxcblx0XHRcdGhlaWdodDogYW5jaG9yLmhlaWdodCB8fCAyXG5cdFx0fTtcblx0fSBlbHNlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9wOiBhbmNob3IucG9zeSxcblx0XHRcdGxlZnQ6IGFuY2hvci5wb3N4LFxuXHRcdFx0Ly8gV2UgYXJlIGFib3V0IHRvIHBvc2l0aW9uIHRoZSBjb250ZXh0IHZpZXcgd2hlcmUgdGhlIG1vdXNlXG5cdFx0XHQvLyBjdXJzb3IgaXMuIFRvIHByZXZlbnQgdGhlIHZpZXcgYmVpbmcgZXhhY3RseSB1bmRlciB0aGUgbW91c2Vcblx0XHRcdC8vIHdoZW4gc2hvd2luZyBhbmQgdGh1cyBwb3RlbnRpYWxseSB0cmlnZ2VyaW5nIGFuIGFjdGlvbiB3aXRoaW4sXG5cdFx0XHQvLyB3ZSB0cmVhdCB0aGUgbW91c2UgbG9jYXRpb24gbGlrZSBhIHNtYWxsIHNpemVkIGJsb2NrIGVsZW1lbnQuXG5cdFx0XHR3aWR0aDogMixcblx0XHRcdGhlaWdodDogMlxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRWaWV3IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQlVCQkxFX1VQX0VWRU5UUyA9IFsnY2xpY2snLCAna2V5ZG93bicsICdmb2N1cycsICdibHVyJ107XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEJVQkJMRV9ET1dOX0VWRU5UUyA9IFsnY2xpY2snXTtcblxuXHRwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB2aWV3OiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB1c2VGaXhlZFBvc2l0aW9uID0gZmFsc2U7XG5cdHByaXZhdGUgdXNlU2hhZG93RE9NID0gZmFsc2U7XG5cdHByaXZhdGUgZGVsZWdhdGU6IElEZWxlZ2F0ZSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHRvRGlzcG9zZU9uQ2xlYW46IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXHRwcml2YXRlIHRvRGlzcG9zZU9uU2V0Q29udGFpbmVyOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSBoaWRpbmdDb250ZXh0VmlldzogeyByZWFkb25seSBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTsgcmVhZG9ubHkgdG9EaXNwb3NlOiBJRGlzcG9zYWJsZTsgcmVhZG9ubHkgY2xhc3NOYW1lOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzaGFkb3dSb290OiBTaGFkb3dSb290IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgc2hhZG93Um9vdEhvc3RFbGVtZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRvbVBvc2l0aW9uOiBDb250ZXh0Vmlld0RPTVBvc2l0aW9uKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGVuc3VyZUNvbnRleHRWaWV3TWVudU1vdGlvblN0eWxlU2hlZXQoKTtcblxuXHRcdHRoaXMudmlldyA9IERPTS4kKCcuY29udGV4dC12aWV3Jyk7XG5cdFx0RE9NLmhpZGUodGhpcy52aWV3KTtcblxuXHRcdHRoaXMuc2V0Q29udGFpbmVyKGNvbnRhaW5lciwgZG9tUG9zaXRpb24pO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnNldENvbnRhaW5lcihudWxsLCBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkFCU09MVVRFKSkpO1xuXHR9XG5cblx0c2V0Q29udGFpbmVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCBudWxsLCBkb21Qb3NpdGlvbjogQ29udGV4dFZpZXdET01Qb3NpdGlvbik6IHZvaWQge1xuXHRcdHRoaXMudXNlRml4ZWRQb3NpdGlvbiA9IGRvbVBvc2l0aW9uICE9PSBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkFCU09MVVRFO1xuXHRcdGNvbnN0IHVzZWRTaGFkb3dET00gPSB0aGlzLnVzZVNoYWRvd0RPTTtcblx0XHR0aGlzLnVzZVNoYWRvd0RPTSA9IGRvbVBvc2l0aW9uID09PSBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkZJWEVEX1NIQURPVztcblxuXHRcdGlmIChjb250YWluZXIgPT09IHRoaXMuY29udGFpbmVyICYmIHVzZWRTaGFkb3dET00gPT09IHRoaXMudXNlU2hhZG93RE9NKSB7XG5cdFx0XHRyZXR1cm47IC8vIGNvbnRhaW5lciBpcyB0aGUgc2FtZSBhbmQgbm8gc2hhZG93IERPTSB1c2FnZSBoYXMgY2hhbmdlZFxuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy50b0Rpc3Bvc2VPblNldENvbnRhaW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdHRoaXMudmlldy5yZW1vdmUoKTtcblx0XHRcdGlmICh0aGlzLnNoYWRvd1Jvb3QpIHtcblx0XHRcdFx0dGhpcy5zaGFkb3dSb290ID0gbnVsbDtcblx0XHRcdFx0dGhpcy5zaGFkb3dSb290SG9zdEVsZW1lbnQ/LnJlbW92ZSgpO1xuXHRcdFx0XHR0aGlzLnNoYWRvd1Jvb3RIb3N0RWxlbWVudCA9IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuY29udGFpbmVyID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoY29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLmNvbnRhaW5lciA9IGNvbnRhaW5lcjtcblxuXHRcdFx0aWYgKHRoaXMudXNlU2hhZG93RE9NKSB7XG5cdFx0XHRcdHRoaXMuc2hhZG93Um9vdEhvc3RFbGVtZW50ID0gRE9NLiQoJy5zaGFkb3ctcm9vdC1ob3N0Jyk7XG5cdFx0XHRcdHRoaXMuY29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2hhZG93Um9vdEhvc3RFbGVtZW50KTtcblx0XHRcdFx0dGhpcy5zaGFkb3dSb290ID0gdGhpcy5zaGFkb3dSb290SG9zdEVsZW1lbnQuYXR0YWNoU2hhZG93KHsgbW9kZTogJ29wZW4nIH0pO1xuXHRcdFx0XHRjb25zdCBzdHlsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N0eWxlJyk7XG5cdFx0XHRcdHN0eWxlLnRleHRDb250ZW50ID0gU0hBRE9XX1JPT1RfQ1NTO1xuXHRcdFx0XHR0aGlzLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQoc3R5bGUpO1xuXHRcdFx0XHR0aGlzLnNoYWRvd1Jvb3QuYXBwZW5kQ2hpbGQodGhpcy52aWV3KTtcblx0XHRcdFx0dGhpcy5zaGFkb3dSb290LmFwcGVuZENoaWxkKERPTS4kKCdzbG90JykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy52aWV3KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9EaXNwb3NlT25TZXRDb250YWluZXIgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdENvbnRleHRWaWV3LkJVQkJMRV9VUF9FVkVOVFMuZm9yRWFjaChldmVudCA9PiB7XG5cdFx0XHRcdHRvRGlzcG9zZU9uU2V0Q29udGFpbmVyLmFkZChET00uYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5jb250YWluZXIhLCBldmVudCwgZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vbkRPTUV2ZW50KGUsIGZhbHNlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdENvbnRleHRWaWV3LkJVQkJMRV9ET1dOX0VWRU5UUy5mb3JFYWNoKGV2ZW50ID0+IHtcblx0XHRcdFx0dG9EaXNwb3NlT25TZXRDb250YWluZXIuYWRkKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciEsIGV2ZW50LCBlID0+IHtcblx0XHRcdFx0XHR0aGlzLm9uRE9NRXZlbnQoZSwgdHJ1ZSk7XG5cdFx0XHRcdH0sIHRydWUpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLnRvRGlzcG9zZU9uU2V0Q29udGFpbmVyID0gdG9EaXNwb3NlT25TZXRDb250YWluZXI7XG5cdFx0fVxuXHR9XG5cblx0c2hvdyhkZWxlZ2F0ZTogSURlbGVnYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wbGV0ZUhpZGVBbmltYXRpb24oKTtcblxuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLmhpZGUodW5kZWZpbmVkLCB0cnVlKTtcblx0XHR9XG5cblx0XHQvLyBTaG93IHN0YXRpYyBib3hcblx0XHRET00uY2xlYXJOb2RlKHRoaXMudmlldyk7XG5cdFx0dGhpcy52aWV3LmNsYXNzTmFtZSA9ICdjb250ZXh0LXZpZXcgbW9uYWNvLWNvbXBvbmVudCc7XG5cdFx0dGhpcy52aWV3LnN0eWxlLnRvcCA9ICcwcHgnO1xuXHRcdHRoaXMudmlldy5zdHlsZS5sZWZ0ID0gJzBweCc7XG5cdFx0dGhpcy52aWV3LnN0eWxlLnpJbmRleCA9IGAkezI1NzUgKyAoZGVsZWdhdGUubGF5ZXIgPz8gMCl9YDtcblx0XHR0aGlzLnZpZXcuc3R5bGUucG9zaXRpb24gPSB0aGlzLnVzZUZpeGVkUG9zaXRpb24gPyAnZml4ZWQnIDogJ2Fic29sdXRlJztcblx0XHRET00uc2hvdyh0aGlzLnZpZXcpO1xuXG5cdFx0Ly8gUmVuZGVyIGNvbnRlbnRcblx0XHR0aGlzLnRvRGlzcG9zZU9uQ2xlYW4gPSBkZWxlZ2F0ZS5yZW5kZXIodGhpcy52aWV3KSB8fCBEaXNwb3NhYmxlLk5vbmU7XG5cblx0XHQvLyBTZXQgYWN0aXZlIGRlbGVnYXRlXG5cdFx0dGhpcy5kZWxlZ2F0ZSA9IGRlbGVnYXRlO1xuXG5cdFx0Ly8gTGF5b3V0XG5cdFx0dGhpcy5kb0xheW91dCgpO1xuXG5cdFx0Ly8gRm9jdXNcblx0XHR0aGlzLmRlbGVnYXRlLmZvY3VzPy4oKTtcblx0fVxuXG5cdGdldFZpZXdFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3O1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmRlbGVnYXRlIS5jYW5SZWxheW91dCA9PT0gZmFsc2UgJiYgIShwbGF0Zm9ybS5pc0lPUyAmJiBCcm93c2VyRmVhdHVyZXMucG9pbnRlckV2ZW50cykpIHtcblx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZGVsZWdhdGU/LmxheW91dD8uKCk7XG5cblx0XHR0aGlzLmRvTGF5b3V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGRvTGF5b3V0KCk6IHZvaWQge1xuXHRcdC8vIENoZWNrIHRoYXQgd2Ugc3RpbGwgaGF2ZSBhIGRlbGVnYXRlIC0gdGhpcy5kZWxlZ2F0ZS5sYXlvdXQgbWF5IGhhdmUgaGlkZGVuXG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IGFuY2hvclxuXHRcdGNvbnN0IGFuY2hvciA9IGdldEFuY2hvclJlY3QodGhpcy5kZWxlZ2F0ZSEuZ2V0QW5jaG9yKCkpO1xuXHRcdGNvbnN0IGNvbnRhaW5lcldpbmRvdyA9IHRoaXMuY29udGFpbmVyID8gRE9NLmdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcikgOiBET00uZ2V0QWN0aXZlV2luZG93KCk7XG5cdFx0Y29uc3Qgdmlld3BvcnQgPSB7IHRvcDogY29udGFpbmVyV2luZG93LnBhZ2VZT2Zmc2V0LCBsZWZ0OiBjb250YWluZXJXaW5kb3cucGFnZVhPZmZzZXQsIHdpZHRoOiBjb250YWluZXJXaW5kb3cuaW5uZXJXaWR0aCwgaGVpZ2h0OiBjb250YWluZXJXaW5kb3cuaW5uZXJIZWlnaHQgfTtcblx0XHRjb25zdCB2aWV3ID0geyB3aWR0aDogRE9NLmdldFRvdGFsV2lkdGgodGhpcy52aWV3KSwgaGVpZ2h0OiBET00uZ2V0VG90YWxIZWlnaHQodGhpcy52aWV3KSB9O1xuXHRcdGNvbnN0IGFuY2hvclBvc2l0aW9uID0gdGhpcy5kZWxlZ2F0ZSEuYW5jaG9yUG9zaXRpb247XG5cdFx0Y29uc3QgYW5jaG9yQWxpZ25tZW50ID0gdGhpcy5kZWxlZ2F0ZSEuYW5jaG9yQWxpZ25tZW50O1xuXHRcdGNvbnN0IGFuY2hvckF4aXNBbGlnbm1lbnQgPSB0aGlzLmRlbGVnYXRlIS5hbmNob3JBeGlzQWxpZ25tZW50O1xuXHRcdGNvbnN0IGxheW91dFJlc3VsdCA9IGxheW91dDJkKHZpZXdwb3J0LCB2aWV3LCBhbmNob3IsIHsgYW5jaG9yQWxpZ25tZW50LCBhbmNob3JQb3NpdGlvbiwgYW5jaG9yQXhpc0FsaWdubWVudCB9KTtcblx0XHRjb25zdCB7IHRvcCwgbGVmdCB9ID0gbGF5b3V0UmVzdWx0O1xuXG5cdFx0dGhpcy52aWV3LmNsYXNzTGlzdC5yZW1vdmUoJ3RvcCcsICdib3R0b20nLCAnbGVmdCcsICdyaWdodCcpO1xuXHRcdHRoaXMudmlldy5jbGFzc0xpc3QuYWRkKGxheW91dFJlc3VsdC5hbmNob3JQb3NpdGlvbiA9PT0gQW5jaG9yUG9zaXRpb24uQkVMT1cgPyAnYm90dG9tJyA6ICd0b3AnKTtcblx0XHR0aGlzLnZpZXcuY2xhc3NMaXN0LmFkZChsYXlvdXRSZXN1bHQuYW5jaG9yQWxpZ25tZW50ID09PSBBbmNob3JBbGlnbm1lbnQuTEVGVCA/ICdsZWZ0JyA6ICdyaWdodCcpO1xuXHRcdHRoaXMudmlldy5jbGFzc0xpc3QudG9nZ2xlKCdmaXhlZCcsIHRoaXMudXNlRml4ZWRQb3NpdGlvbik7XG5cblx0XHRjb25zdCBjb250YWluZXJQb3NpdGlvbiA9IERPTS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuY29udGFpbmVyISk7XG5cblx0XHQvLyBBY2NvdW50IGZvciBjb250YWluZXIgc2Nyb2xsIHdoZW4gcG9zaXRpb25pbmcgdGhlIGNvbnRleHQgdmlld1xuXHRcdGNvbnN0IGNvbnRhaW5lclNjcm9sbFRvcCA9IHRoaXMuY29udGFpbmVyIS5zY3JvbGxUb3AgfHwgMDtcblx0XHRjb25zdCBjb250YWluZXJTY3JvbGxMZWZ0ID0gdGhpcy5jb250YWluZXIhLnNjcm9sbExlZnQgfHwgMDtcblxuXHRcdHRoaXMudmlldy5zdHlsZS50b3AgPSBgJHt0b3AgLSAodGhpcy51c2VGaXhlZFBvc2l0aW9uID8gRE9NLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy52aWV3KS50b3AgOiBjb250YWluZXJQb3NpdGlvbi50b3ApICsgY29udGFpbmVyU2Nyb2xsVG9wfXB4YDtcblx0XHR0aGlzLnZpZXcuc3R5bGUubGVmdCA9IGAke2xlZnQgLSAodGhpcy51c2VGaXhlZFBvc2l0aW9uID8gRE9NLmdldERvbU5vZGVQYWdlUG9zaXRpb24odGhpcy52aWV3KS5sZWZ0IDogY29udGFpbmVyUG9zaXRpb24ubGVmdCkgKyBjb250YWluZXJTY3JvbGxMZWZ0fXB4YDtcblx0XHR0aGlzLnZpZXcuc3R5bGUud2lkdGggPSAnaW5pdGlhbCc7XG5cdH1cblxuXHRoaWRlKGRhdGE/OiB1bmtub3duLCBza2lwQW5pbWF0aW9uID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oaWRpbmdDb250ZXh0Vmlldykge1xuXHRcdFx0aWYgKHNraXBBbmltYXRpb24pIHtcblx0XHRcdFx0dGhpcy5jb21wbGV0ZUhpZGVBbmltYXRpb24oKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IHRoaXMuZGVsZWdhdGU7XG5cdFx0dGhpcy5kZWxlZ2F0ZSA9IG51bGw7XG5cblx0XHRpZiAoIWRlbGVnYXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9EaXNwb3NlID0gdGhpcy50b0Rpc3Bvc2VPbkNsZWFuO1xuXHRcdHRoaXMudG9EaXNwb3NlT25DbGVhbiA9IERpc3Bvc2FibGUuTm9uZTtcblxuXHRcdGRlbGVnYXRlLm9uSGlkZT8uKGRhdGEpO1xuXG5cdFx0Y29uc3QgY2xvc2VBbmltYXRpb24gPSBkZWxlZ2F0ZS5jbG9zZUFuaW1hdGlvbjtcblx0XHRpZiAoIXNraXBBbmltYXRpb24gJiYgY2xvc2VBbmltYXRpb24gJiYgY2xvc2VBbmltYXRpb24uZHVyYXRpb24gPiAwICYmIHRoaXMuaGFzUmVxdWlyZWRBbmNlc3RvckNsYXNzZXMoY2xvc2VBbmltYXRpb24ucmVxdWlyZWRBbmNlc3RvckNsYXNzZXMpKSB7XG5cdFx0XHR0aGlzLnZpZXcuc3R5bGUuc2V0UHJvcGVydHkoQ09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRSwgYCR7Y2xvc2VBbmltYXRpb24uZHVyYXRpb259bXNgKTtcblx0XHRcdHRoaXMucHJlcGFyZU1lbnVDbG9zZUFuaW1hdGlvbigpO1xuXHRcdFx0dGhpcy52aWV3LmNsYXNzTGlzdC5hZGQoY2xvc2VBbmltYXRpb24uY2xhc3NOYW1lKTtcblx0XHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuY29tcGxldGVIaWRlQW5pbWF0aW9uKCksIGNsb3NlQW5pbWF0aW9uLmR1cmF0aW9uKTtcblx0XHRcdHRoaXMuaGlkaW5nQ29udGV4dFZpZXcgPSB7XG5cdFx0XHRcdGRpc3Bvc2FibGU6IHRvRGlzcG9zYWJsZSgoKSA9PiBjbGVhclRpbWVvdXQodGltZW91dCkpLFxuXHRcdFx0XHR0b0Rpc3Bvc2UsXG5cdFx0XHRcdGNsYXNzTmFtZTogY2xvc2VBbmltYXRpb24uY2xhc3NOYW1lXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRvRGlzcG9zZS5kaXNwb3NlKCk7XG5cdFx0RE9NLmhpZGUodGhpcy52aWV3KTtcblx0fVxuXG5cdHByaXZhdGUgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZGVsZWdhdGU7XG5cdH1cblxuXHRwcml2YXRlIGNvbXBsZXRlSGlkZUFuaW1hdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBoaWRpbmdDb250ZXh0VmlldyA9IHRoaXMuaGlkaW5nQ29udGV4dFZpZXc7XG5cdFx0aWYgKCFoaWRpbmdDb250ZXh0Vmlldykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaGlkaW5nQ29udGV4dFZpZXcgPSB1bmRlZmluZWQ7XG5cdFx0aGlkaW5nQ29udGV4dFZpZXcuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy52aWV3LmNsYXNzTGlzdC5yZW1vdmUoaGlkaW5nQ29udGV4dFZpZXcuY2xhc3NOYW1lKTtcblx0XHR0aGlzLnZpZXcuc3R5bGUucmVtb3ZlUHJvcGVydHkoQ09OVEVYVF9WSUVXX0NMT1NFX0FOSU1BVElPTl9EVVJBVElPTl9WQVJJQUJMRSk7XG5cdFx0dGhpcy52aWV3LnN0eWxlLnJlbW92ZVByb3BlcnR5KENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9TVEFSVF9PUEFDSVRZX1ZBUklBQkxFKTtcblx0XHR0aGlzLnZpZXcuc3R5bGUucmVtb3ZlUHJvcGVydHkoQ09OVEVYVF9WSUVXX01FTlVfTU9USU9OX0NMT1NFX1NUQVJUX1RSQU5TRk9STV9WQVJJQUJMRSk7XG5cdFx0aGlkaW5nQ29udGV4dFZpZXcudG9EaXNwb3NlLmRpc3Bvc2UoKTtcblx0XHRET00uaGlkZSh0aGlzLnZpZXcpO1xuXHR9XG5cblx0cHJpdmF0ZSBwcmVwYXJlTWVudUNsb3NlQW5pbWF0aW9uKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy52aWV3LmNsYXNzTGlzdC5jb250YWlucyhDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xBU1MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VyZmFjZSA9IEFycmF5LmZyb20odGhpcy52aWV3LmNoaWxkcmVuKS5maW5kKGVsZW1lbnQgPT4gRE9NLmlzSFRNTEVsZW1lbnQoZWxlbWVudCkgJiYgZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQnKSk7XG5cdFx0aWYgKCFET00uaXNIVE1MRWxlbWVudChzdXJmYWNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbXB1dGVkU3R5bGUgPSBET00uZ2V0V2luZG93KHN1cmZhY2UpLmdldENvbXB1dGVkU3R5bGUoc3VyZmFjZSk7XG5cdFx0dGhpcy52aWV3LnN0eWxlLnNldFByb3BlcnR5KENPTlRFWFRfVklFV19NRU5VX01PVElPTl9DTE9TRV9TVEFSVF9PUEFDSVRZX1ZBUklBQkxFLCBjb21wdXRlZFN0eWxlLm9wYWNpdHkpO1xuXHRcdHRoaXMudmlldy5zdHlsZS5zZXRQcm9wZXJ0eShDT05URVhUX1ZJRVdfTUVOVV9NT1RJT05fQ0xPU0VfU1RBUlRfVFJBTlNGT1JNX1ZBUklBQkxFLCBjb21wdXRlZFN0eWxlLnRyYW5zZm9ybSk7XG5cdH1cblxuXHRwcml2YXRlIGhhc1JlcXVpcmVkQW5jZXN0b3JDbGFzc2VzKGNsYXNzTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjbGFzc05hbWVzPy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGNhbmRpZGF0ZTogSFRNTEVsZW1lbnQgfCBudWxsID0gdGhpcy52aWV3OyBjYW5kaWRhdGU7KSB7XG5cdFx0XHRjb25zdCBjdXJyZW50OiBIVE1MRWxlbWVudCA9IGNhbmRpZGF0ZTtcblx0XHRcdGlmIChjbGFzc05hbWVzLmV2ZXJ5KGNsYXNzTmFtZSA9PiBjdXJyZW50LmNsYXNzTGlzdC5jb250YWlucyhjbGFzc05hbWUpKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGN1cnJlbnQucGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHRjYW5kaWRhdGUgPSBjdXJyZW50LnBhcmVudEVsZW1lbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByb290ID0gY3VycmVudC5nZXRSb290Tm9kZSgpO1xuXHRcdFx0XHRjYW5kaWRhdGUgPSByb290IGluc3RhbmNlb2YgU2hhZG93Um9vdCAmJiBET00uaXNIVE1MRWxlbWVudChyb290Lmhvc3QpID8gcm9vdC5ob3N0IDogbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIG9uRE9NRXZlbnQoZTogVUlFdmVudCwgb25DYXB0dXJlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZGVsZWdhdGUpIHtcblx0XHRcdGlmICh0aGlzLmRlbGVnYXRlLm9uRE9NRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5kZWxlZ2F0ZS5vbkRPTUV2ZW50KGUsIDxIVE1MRWxlbWVudD5ET00uZ2V0V2luZG93KGUpLmRvY3VtZW50LmFjdGl2ZUVsZW1lbnQpO1xuXHRcdFx0fSBlbHNlIGlmIChvbkNhcHR1cmUgJiYgIURPTS5pc0FuY2VzdG9yKDxIVE1MRWxlbWVudD5lLnRhcmdldCwgdGhpcy5jb250YWluZXIpKSB7XG5cdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5oaWRlKCk7XG5cdFx0dGhpcy5jb21wbGV0ZUhpZGVBbmltYXRpb24oKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jb25zdCBTSEFET1dfUk9PVF9DU1MgPSAvKiBjc3MgKi8gYFxuXHQ6aG9zdCB7XG5cdFx0YWxsOiBpbml0aWFsOyAvKiAxc3QgcnVsZSBzbyBzdWJzZXF1ZW50IHByb3BlcnRpZXMgYXJlIHJlc2V0LiAqL1xuXHR9XG5cblx0LmNvZGljb25bY2xhc3MqPSdjb2RpY29uLSddIHtcblx0XHRmb250OiBub3JtYWwgbm9ybWFsIG5vcm1hbCAxNnB4LzEgY29kaWNvbjtcblx0XHRkaXNwbGF5OiBpbmxpbmUtYmxvY2s7XG5cdFx0dGV4dC1kZWNvcmF0aW9uOiBub25lO1xuXHRcdHRleHQtcmVuZGVyaW5nOiBhdXRvO1xuXHRcdHRleHQtYWxpZ246IGNlbnRlcjtcblx0XHQtd2Via2l0LWZvbnQtc21vb3RoaW5nOiBhbnRpYWxpYXNlZDtcblx0XHQtbW96LW9zeC1mb250LXNtb290aGluZzogZ3JheXNjYWxlO1xuXHRcdHVzZXItc2VsZWN0OiBub25lO1xuXHRcdC13ZWJraXQtdXNlci1zZWxlY3Q6IG5vbmU7XG5cdFx0LW1zLXVzZXItc2VsZWN0OiBub25lO1xuXHR9XG5cblx0Omhvc3Qge1xuXHRcdGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiU2Vnb2UgV1BDXCIsIFwiU2Vnb2UgVUlcIiwgXCJIZWx2ZXRpY2FOZXVlLUxpZ2h0XCIsIHN5c3RlbS11aSwgXCJVYnVudHVcIiwgXCJEcm9pZCBTYW5zXCIsIHNhbnMtc2VyaWY7XG5cdH1cblxuXHQ6aG9zdC1jb250ZXh0KC5tYWMpIHsgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC5tYWM6bGFuZyh6aC1IYW5zKSkgeyBmb250LWZhbWlseTogLWFwcGxlLXN5c3RlbSwgQmxpbmtNYWNTeXN0ZW1Gb250LCBcIlBpbmdGYW5nIFNDXCIsIFwiSGlyYWdpbm8gU2FucyBHQlwiLCBzYW5zLXNlcmlmOyB9XG5cdDpob3N0LWNvbnRleHQoLm1hYzpsYW5nKHpoLUhhbnQpKSB7IGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsIFwiUGluZ0ZhbmcgVENcIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC5tYWM6bGFuZyhqYSkpIHsgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJIaXJhZ2lubyBLYWt1IEdvdGhpYyBQcm9cIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC5tYWM6bGFuZyhrbykpIHsgZm9udC1mYW1pbHk6IC1hcHBsZS1zeXN0ZW0sIEJsaW5rTWFjU3lzdGVtRm9udCwgXCJBcHBsZSBTRCBHb3RoaWMgTmVvXCIsIFwiTmFudW0gR290aGljXCIsIFwiQXBwbGVHb3RoaWNcIiwgc2Fucy1zZXJpZjsgfVxuXG5cdDpob3N0LWNvbnRleHQoLndpbmRvd3MpIHsgZm9udC1mYW1pbHk6IFwiU2Vnb2UgV1BDXCIsIFwiU2Vnb2UgVUlcIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC53aW5kb3dzOmxhbmcoemgtSGFucykpIHsgZm9udC1mYW1pbHk6IFwiU2Vnb2UgV1BDXCIsIFwiU2Vnb2UgVUlcIiwgXCJNaWNyb3NvZnQgWWFIZWlcIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC53aW5kb3dzOmxhbmcoemgtSGFudCkpIHsgZm9udC1mYW1pbHk6IFwiU2Vnb2UgV1BDXCIsIFwiU2Vnb2UgVUlcIiwgXCJNaWNyb3NvZnQgSmhlbmdoZWlcIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC53aW5kb3dzOmxhbmcoamEpKSB7IGZvbnQtZmFtaWx5OiBcIlNlZ29lIFdQQ1wiLCBcIlNlZ29lIFVJXCIsIFwiWXUgR290aGljIFVJXCIsIFwiTWVpcnlvIFVJXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgud2luZG93czpsYW5nKGtvKSkgeyBmb250LWZhbWlseTogXCJTZWdvZSBXUENcIiwgXCJTZWdvZSBVSVwiLCBcIk1hbGd1biBHb3RoaWNcIiwgXCJEb3RvbVwiLCBzYW5zLXNlcmlmOyB9XG5cblx0Omhvc3QtY29udGV4dCgubGludXgpIHsgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgXCJVYnVudHVcIiwgXCJEcm9pZCBTYW5zXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgubGludXg6bGFuZyh6aC1IYW5zKSkgeyBmb250LWZhbWlseTogc3lzdGVtLXVpLCBcIlVidW50dVwiLCBcIkRyb2lkIFNhbnNcIiwgXCJTb3VyY2UgSGFuIFNhbnMgU0NcIiwgXCJTb3VyY2UgSGFuIFNhbnMgQ05cIiwgXCJTb3VyY2UgSGFuIFNhbnNcIiwgc2Fucy1zZXJpZjsgfVxuXHQ6aG9zdC1jb250ZXh0KC5saW51eDpsYW5nKHpoLUhhbnQpKSB7IGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIFwiVWJ1bnR1XCIsIFwiRHJvaWQgU2Fuc1wiLCBcIlNvdXJjZSBIYW4gU2FucyBUQ1wiLCBcIlNvdXJjZSBIYW4gU2FucyBUV1wiLCBcIlNvdXJjZSBIYW4gU2Fuc1wiLCBzYW5zLXNlcmlmOyB9XG5cdDpob3N0LWNvbnRleHQoLmxpbnV4OmxhbmcoamEpKSB7IGZvbnQtZmFtaWx5OiBzeXN0ZW0tdWksIFwiVWJ1bnR1XCIsIFwiRHJvaWQgU2Fuc1wiLCBcIlNvdXJjZSBIYW4gU2FucyBKXCIsIFwiU291cmNlIEhhbiBTYW5zIEpQXCIsIFwiU291cmNlIEhhbiBTYW5zXCIsIHNhbnMtc2VyaWY7IH1cblx0Omhvc3QtY29udGV4dCgubGludXg6bGFuZyhrbykpIHsgZm9udC1mYW1pbHk6IHN5c3RlbS11aSwgXCJVYnVudHVcIiwgXCJEcm9pZCBTYW5zXCIsIFwiU291cmNlIEhhbiBTYW5zIEtcIiwgXCJTb3VyY2UgSGFuIFNhbnMgSlJcIiwgXCJTb3VyY2UgSGFuIFNhbnNcIiwgXCJVbkRvdHVtXCIsIFwiRkJhZWttdWsgR3VsaW1cIiwgc2Fucy1zZXJpZjsgfVxuXHQke2dldENvbnRleHRWaWV3TWVudU1vdGlvbkNzcygnOmhvc3QtY29udGV4dCguc3R5bGUtb3ZlcnJpZGUubW9uYWNvLWVuYWJsZS1tb3Rpb24pJyl9XG5gO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsaUJBQXNDLGdCQUF1QixnQkFBZ0I7QUFDdEYsWUFBWSxjQUFjO0FBRTFCLE9BQU87QUFFUCxTQUFTLG1CQUFBQSxrQkFB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QU87QUFDckUsU0FBSyxLQUFLLE1BQU0sWUFBWSx1REFBdUQsY0FBYyxPQUFPO0FBQ3hHLFNBQUssS0FBSyxNQUFNLFlBQVkseURBQXlELGNBQWMsU0FBUztBQUFBLEVBQzdHO0FBQUEsRUFFUSwyQkFBMkIsWUFBb0Q7QUFDdEYsUUFBSSxDQUFDLFlBQVksUUFBUTtBQUN4QixhQUFPO0FBQUEsSUFDUjtBQUVBLGFBQVMsWUFBZ0MsS0FBSyxNQUFNLGFBQVk7QUFDL0QsWUFBTSxVQUF1QjtBQUM3QixVQUFJLFdBQVcsTUFBTSxlQUFhLFFBQVEsVUFBVSxTQUFTLFNBQVMsQ0FBQyxHQUFHO0FBQ3pFLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSSxRQUFRLGVBQWU7QUFDMUIsb0JBQVksUUFBUTtBQUFBLE1BQ3JCLE9BQU87QUFDTixjQUFNLE9BQU8sUUFBUSxZQUFZO0FBQ2pDLG9CQUFZLGdCQUFnQixjQUFjLElBQUksY0FBYyxLQUFLLElBQUksSUFBSSxLQUFLLE9BQU87QUFBQSxNQUN0RjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsV0FBVyxHQUFZLFdBQTBCO0FBQ3hELFFBQUksS0FBSyxVQUFVO0FBQ2xCLFVBQUksS0FBSyxTQUFTLFlBQVk7QUFDN0IsYUFBSyxTQUFTLFdBQVcsR0FBZ0IsSUFBSSxVQUFVLENBQUMsRUFBRSxTQUFTLGFBQWE7QUFBQSxNQUNqRixXQUFXLGFBQWEsQ0FBQyxJQUFJLFdBQXdCLEVBQUUsUUFBUSxLQUFLLFNBQVMsR0FBRztBQUMvRSxhQUFLLEtBQUs7QUFBQSxNQUNYO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFNBQUssS0FBSztBQUNWLFNBQUssc0JBQXNCO0FBRTNCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQXBSYSxhQUVZLG1CQUFtQixDQUFDLFNBQVMsV0FBVyxTQUFTLE1BQU07QUFGbkUsYUFHWSxxQkFBcUIsQ0FBQyxPQUFPO0FBSC9DLElBQU0sY0FBTjtBQXNSUCxNQUFNO0FBQUE7QUFBQSxFQUE0QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxHQXVDL0IsNEJBQTRCLHFEQUFxRCxDQUFDO0FBQUE7QUFBQTsiLAogICJuYW1lcyI6IFsiQW5jaG9yQWxpZ25tZW50IiwgIkFuY2hvckF4aXNBbGlnbm1lbnQiLCAiQW5jaG9yUG9zaXRpb24iLCAiQ29udGV4dFZpZXdET01Qb3NpdGlvbiJdCn0K
