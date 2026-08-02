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
import { InstantiationType, registerSingleton } from "../../instantiation/common/extensions.js";
import { registerThemingParticipant } from "../../theme/common/themeService.js";
import { editorHoverBorder } from "../../theme/common/colorRegistry.js";
import { IHoverService } from "./hover.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { HoverWidget } from "./hoverWidget.js";
import { ContextView, ContextViewDOMPosition } from "../../../base/browser/ui/contextview/contextview.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { addDisposableListener, EventType, getActiveElement, isAncestorOfActiveElement, isAncestor, getWindow, isHTMLElement, isEditableElement } from "../../../base/browser/dom.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { StandardKeyboardEvent } from "../../../base/browser/keyboardEvent.js";
import { ResultKind } from "../../keybinding/common/keybindingResolver.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { ILayoutService } from "../../layout/browser/layoutService.js";
import { mainWindow } from "../../../base/browser/window.js";
import { HoverStyle, isManagedHoverTooltipMarkdownString } from "../../../base/browser/ui/hover/hover.js";
import { ManagedHoverWidget } from "./updatableHoverWidget.js";
import { timeout, TimeoutTimer } from "../../../base/common/async.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { isNumber, isString } from "../../../base/common/types.js";
import { KeyChord, KeyCode, KeyMod } from "../../../base/common/keyCodes.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../keybinding/common/keybindingsRegistry.js";
import { stripIcons } from "../../../base/common/iconLabels.js";
const MAX_HOVER_NESTING_DEPTH = 3;
let HoverService = class extends Disposable {
  constructor(_instantiationService, _configurationService, contextMenuService, _keybindingService, _layoutService, _accessibilityService) {
    super();
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._keybindingService = _keybindingService;
    this._layoutService = _layoutService;
    this._accessibilityService = _accessibilityService;
    /**
     * Stack of currently visible hovers. The last entry is the topmost hover.
     * This enables nested hovers where hovering inside a hover can show another hover.
     */
    this._hoverStack = [];
    this._currentDelayedHoverWasShown = false;
    this._delayedHovers = /* @__PURE__ */ new Map();
    this._managedHovers = /* @__PURE__ */ new Map();
    this._register(contextMenuService.onDidShowContextMenu(() => this.hideHover()));
    this._register(KeybindingsRegistry.registerCommandAndKeybindingRule({
      id: "workbench.action.showHover",
      weight: KeybindingWeight.EditorCore,
      primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
      handler: () => {
        this._showAndFocusHoverForActiveElement();
      }
    }));
  }
  /**
   * Gets the current (topmost) hover from the stack, if any.
   */
  get _currentHover() {
    return this._hoverStack.at(-1)?.hover;
  }
  /**
   * Gets the current (topmost) hover options from the stack, if any.
   */
  get _currentHoverOptions() {
    return this._hoverStack.at(-1)?.options;
  }
  /**
   * Returns whether the target element is inside any of the hovers in the stack.
   * If it is, returns the index of the containing hover, otherwise returns -1.
   */
  _getContainingHoverIndex(target) {
    const targetElements = isHTMLElement(target) ? [target] : target.targetElements;
    for (let i = this._hoverStack.length - 1; i >= 0; i--) {
      for (const targetElement of targetElements) {
        if (isAncestor(targetElement, this._hoverStack[i].hover.domNode)) {
          return i;
        }
      }
    }
    return -1;
  }
  showInstantHover(options, focus, skipLastFocusedUpdate, dontShow) {
    const hover = this._createHover(options, skipLastFocusedUpdate);
    if (!hover) {
      return void 0;
    }
    this._showHover(hover, options, focus);
    return hover.hover;
  }
  showDelayedHover(options, lifecycleOptions) {
    if (options.id === void 0) {
      options.id = getHoverIdFromContent(options.content);
    }
    if (!this._currentDelayedHover || this._currentDelayedHoverWasShown) {
      if (this._currentHover?.isLocked && this._getContainingHoverIndex(options.target) < 0) {
        return void 0;
      }
      if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
        return this._currentHover;
      }
      if (this._currentHover && !this._currentHover.isDisposed && this._currentDelayedHoverGroupId !== void 0 && this._currentDelayedHoverGroupId === lifecycleOptions?.groupId) {
        return this.showInstantHover({
          ...options,
          appearance: {
            ...options.appearance,
            skipFadeInAnimation: true
          }
        });
      }
    } else if (this._currentDelayedHover && getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
      return this._currentDelayedHover;
    }
    const hover = this._createHover(options, void 0);
    if (!hover) {
      this._currentDelayedHover = void 0;
      this._currentDelayedHoverWasShown = false;
      this._currentDelayedHoverGroupId = void 0;
      return void 0;
    }
    this._currentDelayedHover = hover.hover;
    this._currentDelayedHoverWasShown = false;
    this._currentDelayedHoverGroupId = lifecycleOptions?.groupId;
    const delay = lifecycleOptions?.reducedDelay ? this._configurationService.getValue("workbench.hover.reducedDelay") : this._configurationService.getValue("workbench.hover.delay");
    timeout(delay).then(() => {
      if (hover.hover && !hover.hover.isDisposed) {
        this._currentDelayedHoverWasShown = true;
        this._showHover(hover, options);
      }
    });
    return hover.hover;
  }
  setupDelayedHover(target, options, lifecycleOptions) {
    const resolveHoverOptions = (e) => {
      const resolved = {
        ...typeof options === "function" ? options() : options,
        target
      };
      if (resolved.style === HoverStyle.Mouse && e) {
        resolved.target = resolveMouseStyleHoverTarget(target, e);
      }
      return resolved;
    };
    return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
  }
  setupDelayedHoverAtMouse(target, options, lifecycleOptions) {
    const resolveHoverOptions = (e) => ({
      ...typeof options === "function" ? options() : options,
      target: e ? resolveMouseStyleHoverTarget(target, e) : target
    });
    return this._setupDelayedHover(target, resolveHoverOptions, lifecycleOptions);
  }
  _setupDelayedHover(target, resolveHoverOptions, lifecycleOptions) {
    const store = new DisposableStore();
    store.add(addDisposableListener(target, EventType.MOUSE_OVER, (e) => {
      this.showDelayedHover(resolveHoverOptions(e), {
        groupId: lifecycleOptions?.groupId,
        reducedDelay: lifecycleOptions?.reducedDelay
      });
    }));
    if (lifecycleOptions?.setupKeyboardEvents) {
      store.add(addDisposableListener(target, EventType.KEY_DOWN, (e) => {
        const evt = new StandardKeyboardEvent(e);
        if (evt.equals(KeyCode.Space) || evt.equals(KeyCode.Enter)) {
          this.showInstantHover(resolveHoverOptions(), true);
        }
      }));
    }
    this._delayedHovers.set(target, { show: (focus) => {
      this.showInstantHover(resolveHoverOptions(), focus);
    } });
    store.add(toDisposable(() => this._delayedHovers.delete(target)));
    return store;
  }
  _createHover(options, skipLastFocusedUpdate) {
    this._currentDelayedHover?.dispose();
    this._currentDelayedHover = void 0;
    if (options.content === "") {
      return void 0;
    }
    if (options.id === void 0) {
      options.id = getHoverIdFromContent(options.content);
    }
    const containingHoverIndex = this._getContainingHoverIndex(options.target);
    const isNesting = containingHoverIndex >= 0;
    if (isNesting) {
      if (this._hoverStack.length >= MAX_HOVER_NESTING_DEPTH) {
        return void 0;
      }
    } else {
      if (this._currentHover?.isLocked) {
        return void 0;
      }
      if (getHoverOptionsIdentity(this._currentHoverOptions) === getHoverOptionsIdentity(options)) {
        return void 0;
      }
    }
    this._lastHoverOptions = options;
    const trapFocus = options.trapFocus || this._accessibilityService.isScreenReaderOptimized();
    const activeElement = getActiveElement();
    let lastFocusedElementBeforeOpen;
    if (!skipLastFocusedUpdate) {
      if (trapFocus && activeElement) {
        if (!activeElement.classList.contains("monaco-hover")) {
          lastFocusedElementBeforeOpen = activeElement;
        }
      }
    }
    const hoverDisposables = new DisposableStore();
    const hover = this._instantiationService.createInstance(HoverWidget, options);
    if (options.persistence?.sticky) {
      hover.isLocked = true;
    }
    if (options.position?.hoverPosition && !isNumber(options.position.hoverPosition)) {
      options.target = {
        targetElements: isHTMLElement(options.target) ? [options.target] : options.target.targetElements,
        x: options.position.hoverPosition.x + 10
      };
    }
    hover.onDispose(() => {
      const stackIndex = this._hoverStack.findIndex((entry) => entry.hover === hover);
      if (stackIndex >= 0) {
        const entry = this._hoverStack[stackIndex];
        const hoverWasFocused = isAncestorOfActiveElement(hover.domNode);
        if (hoverWasFocused && entry.lastFocusedElementBeforeOpen) {
          entry.lastFocusedElementBeforeOpen.focus();
        }
        while (this._hoverStack.length > stackIndex + 1) {
          const nestedEntry = this._hoverStack.pop();
          nestedEntry.contextView.dispose();
          nestedEntry.hover.dispose();
        }
        this._hoverStack.splice(stackIndex, 1);
        entry.contextView.dispose();
      }
      hoverDisposables.dispose();
    }, void 0, hoverDisposables);
    if (!options.container) {
      const targetElement = isHTMLElement(options.target) ? options.target : options.target.targetElements[0];
      options.container = this._layoutService.getContainer(getWindow(targetElement));
    }
    hoverDisposables.add(addDisposableListener(getWindow(options.container).document, EventType.MOUSE_DOWN, (e) => {
      if (!isAncestor(e.target, hover.domNode)) {
        this._hideHoverAndDescendants(hover);
      }
    }));
    if (!options.persistence?.sticky) {
      if ("targetElements" in options.target) {
        for (const element of options.target.targetElements) {
          hoverDisposables.add(addDisposableListener(element, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
        }
      } else {
        hoverDisposables.add(addDisposableListener(options.target, EventType.CLICK, () => this._hideHoverAndDescendants(hover)));
      }
      const focusedElement = getActiveElement();
      if (focusedElement) {
        const focusedElementDocument = getWindow(focusedElement).document;
        hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_DOWN, (e) => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
        hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_DOWN, (e) => this._keyDown(e, hover, !!options.persistence?.hideOnKeyDown)));
        hoverDisposables.add(addDisposableListener(focusedElement, EventType.KEY_UP, (e) => this._keyUp(e, hover)));
        hoverDisposables.add(addDisposableListener(focusedElementDocument, EventType.KEY_UP, (e) => this._keyUp(e, hover)));
      }
    }
    if ("IntersectionObserver" in mainWindow) {
      const observer = new IntersectionObserver((e) => this._intersectionChange(e, hover), { threshold: 0 });
      const firstTargetElement = "targetElements" in options.target ? options.target.targetElements[0] : options.target;
      observer.observe(firstTargetElement);
      hoverDisposables.add(toDisposable(() => observer.disconnect()));
    }
    return { hover, lastFocusedElementBeforeOpen, store: hoverDisposables };
  }
  _showHover(result, options, focus) {
    const { hover, lastFocusedElementBeforeOpen, store } = result;
    const containingHoverIndex = this._getContainingHoverIndex(options.target);
    const isNesting = containingHoverIndex >= 0;
    if (!isNesting) {
      this._hideAllHovers();
    } else {
      for (let i = this._hoverStack.length - 1; i > containingHoverIndex; i--) {
        this._hoverStack[i].hover.dispose();
      }
      this._hoverStack.length = containingHoverIndex + 1;
    }
    if (isNesting) {
      for (let i = 0; i <= containingHoverIndex; i++) {
        store.add(this._hoverStack[i].hover.addMouseTrackingElement(hover.domNode));
      }
    }
    const container = options.container ?? this._layoutService.getContainer(getWindow(isHTMLElement(options.target) ? options.target : options.target.targetElements[0]));
    const contextView = new ContextView(container, ContextViewDOMPosition.ABSOLUTE);
    const stackEntry = {
      hover,
      options,
      contextView,
      lastFocusedElementBeforeOpen
    };
    this._hoverStack.push(stackEntry);
    const delegate = new HoverContextViewDelegate(hover, focus, this._hoverStack.length);
    contextView.show(delegate);
    store.add(hover.onRequestLayout(() => contextView.layout()));
    if (focus || options.persistence?.sticky) {
      const targetWindow = getWindow(container);
      store.add(addDisposableListener(targetWindow, EventType.RESIZE, () => contextView.layout()));
    }
    if (options.onDidHide) {
      const onDidHide = options.onDidHide;
      store.add(toDisposable(() => onDidHide()));
    }
    options.onDidShow?.();
  }
  /**
   * Hides a specific hover and all hovers nested inside it.
   */
  _hideHoverAndDescendants(hover) {
    const stackIndex = this._hoverStack.findIndex((entry) => entry.hover === hover);
    if (stackIndex < 0) {
      return;
    }
    for (let i = this._hoverStack.length - 1; i >= stackIndex; i--) {
      this._hoverStack[i].hover.dispose();
    }
    this._hoverStack.length = stackIndex;
  }
  /**
   * Hides all hovers in the stack.
   */
  _hideAllHovers() {
    for (let i = this._hoverStack.length - 1; i >= 0; i--) {
      this._hoverStack[i].hover.dispose();
    }
    this._hoverStack.length = 0;
  }
  hideHover(force) {
    if (this._hoverStack.length === 0) {
      return;
    }
    if (!force && this._currentHover?.isLocked) {
      return;
    }
    this.doHideHover();
  }
  doHideHover() {
    const length = this._hoverStack.length;
    this._hoverStack[length - 1]?.hover.dispose();
    this._hoverStack.length = length - 1;
  }
  _intersectionChange(entries, hover) {
    const entry = entries[entries.length - 1];
    if (!entry.isIntersecting) {
      hover.dispose();
    }
  }
  showAndFocusLastHover() {
    if (!this._lastHoverOptions) {
      return;
    }
    this.showInstantHover(this._lastHoverOptions, true, true);
  }
  _showAndFocusHoverForActiveElement() {
    let activeElement = getActiveElement();
    while (activeElement) {
      const hover = this._delayedHovers.get(activeElement) ?? this._managedHovers.get(activeElement);
      if (hover) {
        hover.show(true);
        return;
      }
      activeElement = activeElement.parentElement;
    }
  }
  _keyDown(e, hover, hideOnKeyDown) {
    if (e.key === "Alt") {
      for (const entry of this._hoverStack) {
        entry.hover.isLocked = true;
      }
      return;
    }
    const event = new StandardKeyboardEvent(e);
    const keybinding = this._keybindingService.resolveKeyboardEvent(event);
    if (keybinding.getSingleModifierDispatchChords().some((value) => !!value) || this._keybindingService.softDispatch(event, event.target).kind !== ResultKind.NoMatchingKb) {
      return;
    }
    if (hideOnKeyDown && (!this._currentHoverOptions?.trapFocus || e.key !== "Tab")) {
      const stackEntry = this._hoverStack.find((entry) => entry.hover === hover);
      this._hideHoverAndDescendants(hover);
      stackEntry?.lastFocusedElementBeforeOpen?.focus();
    }
  }
  _keyUp(e, hover) {
    if (e.key === "Alt") {
      for (const entry of this._hoverStack) {
        if (!entry.options.persistence?.sticky) {
          entry.hover.isLocked = false;
        }
      }
      const anyMouseIn = this._hoverStack.some((entry) => entry.hover.isMouseIn);
      if (!anyMouseIn) {
        const topEntry = this._hoverStack[this._hoverStack.length - 1];
        this._hideAllHovers();
        topEntry?.lastFocusedElementBeforeOpen?.focus();
      }
    }
  }
  // TODO: Investigate performance of this function. There seems to be a lot of content created
  //       and thrown away on start up
  setupManagedHover(hoverDelegate, targetElement, content, options) {
    if (hoverDelegate.showNativeHover) {
      return setupNativeHover(targetElement, content);
    }
    targetElement.setAttribute("custom-hover", "true");
    if (targetElement.title !== "") {
      console.warn("HTML element already has a title attribute, which will conflict with the custom hover. Please remove the title attribute.");
      targetElement.title = "";
    }
    let hoverPreparation;
    let hoverWidget;
    const hideHover = (disposeWidget, disposePreparation) => {
      const hadHover = hoverWidget !== void 0;
      if (disposeWidget) {
        hoverWidget?.dispose();
        hoverWidget = void 0;
      }
      if (disposePreparation) {
        hoverPreparation?.dispose();
        hoverPreparation = void 0;
      }
      if (hadHover) {
        hoverDelegate.onDidHideHover?.();
        hoverWidget = void 0;
      }
    };
    const triggerShowHover = (delay, focus, target, trapFocus) => {
      return new TimeoutTimer(async () => {
        if (!hoverWidget || hoverWidget.isDisposed) {
          hoverWidget = new ManagedHoverWidget(hoverDelegate, target || targetElement, delay > 0);
          await hoverWidget.update(typeof content === "function" ? content() : content, focus, { ...options, trapFocus });
        }
      }, delay);
    };
    const store = new DisposableStore();
    let isMouseDown = false;
    store.add(addDisposableListener(targetElement, EventType.MOUSE_DOWN, () => {
      isMouseDown = true;
      hideHover(true, true);
    }, true));
    store.add(addDisposableListener(targetElement, EventType.MOUSE_UP, () => {
      isMouseDown = false;
    }, true));
    store.add(addDisposableListener(targetElement, EventType.MOUSE_LEAVE, (e) => {
      isMouseDown = false;
      hideHover(false, e.fromElement === targetElement);
    }, true));
    store.add(addDisposableListener(targetElement, EventType.MOUSE_OVER, (e) => {
      if (hoverPreparation) {
        return;
      }
      const mouseOverStore = new DisposableStore();
      const target = {
        targetElements: [targetElement],
        dispose: () => {
        }
      };
      if (hoverDelegate.placement === void 0 || hoverDelegate.placement === "mouse") {
        const onMouseMove = (e2) => {
          target.x = e2.x + 10;
          if (!eventIsRelatedToTarget(e2, targetElement)) {
            hideHover(true, true);
          }
        };
        mouseOverStore.add(addDisposableListener(targetElement, EventType.MOUSE_MOVE, onMouseMove, true));
      }
      hoverPreparation = mouseOverStore;
      if (!eventIsRelatedToTarget(e, targetElement)) {
        return;
      }
      mouseOverStore.add(triggerShowHover(typeof hoverDelegate.delay === "function" ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
    }, true));
    const onFocus = (e) => {
      if (isMouseDown || hoverPreparation) {
        return;
      }
      if (hoverWidget?.isDisposed) {
        hoverWidget = void 0;
      }
      const fromHover = isHTMLElement(e.relatedTarget) && e.relatedTarget.closest(".monaco-hover");
      if (fromHover || !e.relatedTarget) {
        return;
      }
      if (!eventIsRelatedToTarget(e, targetElement)) {
        return;
      }
      const target = {
        targetElements: [targetElement],
        dispose: () => {
        }
      };
      const toDispose = new DisposableStore();
      const onBlur = () => hideHover(true, true);
      toDispose.add(addDisposableListener(targetElement, EventType.BLUR, onBlur, true));
      toDispose.add(triggerShowHover(typeof hoverDelegate.delay === "function" ? hoverDelegate.delay(content) : hoverDelegate.delay, false, target));
      hoverPreparation = toDispose;
    };
    if (!isEditableElement(targetElement)) {
      store.add(addDisposableListener(targetElement, EventType.FOCUS, onFocus, true));
    }
    const hover = {
      show: (focus) => {
        hideHover(false, true);
        triggerShowHover(0, focus, void 0, focus);
      },
      hide: () => {
        hideHover(true, true);
      },
      update: async (newContent, hoverOptions) => {
        content = newContent;
        await hoverWidget?.update(content, void 0, hoverOptions);
      },
      dispose: () => {
        this._managedHovers.delete(targetElement);
        store.dispose();
        hideHover(true, true);
      }
    };
    this._managedHovers.set(targetElement, hover);
    return hover;
  }
  showManagedHover(target) {
    const hover = this._managedHovers.get(target);
    if (hover) {
      hover.show(true);
    }
  }
  dispose() {
    this._managedHovers.forEach((hover) => hover.dispose());
    super.dispose();
  }
};
HoverService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, ILayoutService),
  __decorateParam(5, IAccessibilityService)
], HoverService);
function getHoverOptionsIdentity(options) {
  if (options === void 0) {
    return void 0;
  }
  return options?.id ?? options;
}
function getHoverIdFromContent(content) {
  if (isHTMLElement(content)) {
    return void 0;
  }
  if (typeof content === "string") {
    return content.toString();
  }
  return content.value;
}
function getStringContent(contentOrFactory) {
  const content = typeof contentOrFactory === "function" ? contentOrFactory() : contentOrFactory;
  if (isString(content)) {
    return stripIcons(content);
  }
  if (isManagedHoverTooltipMarkdownString(content)) {
    return content.markdownNotSupportedFallback;
  }
  return void 0;
}
function setupNativeHover(targetElement, content) {
  function updateTitle(title) {
    if (title) {
      targetElement.setAttribute("title", title);
    } else {
      targetElement.removeAttribute("title");
    }
  }
  updateTitle(getStringContent(content));
  return {
    update: (content2) => updateTitle(getStringContent(content2)),
    show: () => {
    },
    hide: () => {
    },
    dispose: () => updateTitle(void 0)
  };
}
class HoverContextViewDelegate {
  constructor(_hover, _focus = false, stackDepth = 1) {
    this._hover = _hover;
    this._focus = _focus;
    this.layer = stackDepth;
  }
  get anchorPosition() {
    return this._hover.anchor;
  }
  render(container) {
    this._hover.render(container);
    if (this._focus) {
      this._hover.focus();
    }
    return this._hover;
  }
  getAnchor() {
    return {
      x: this._hover.x,
      y: this._hover.y
    };
  }
  layout() {
    this._hover.layout();
  }
}
function eventIsRelatedToTarget(event, target) {
  return isHTMLElement(event.target) && getHoverTargetElement(event.target, target) === target;
}
function getHoverTargetElement(element, stopElement) {
  stopElement = stopElement ?? getWindow(element).document.body;
  while (!element.hasAttribute("custom-hover") && element !== stopElement) {
    element = element.parentElement;
  }
  return element;
}
function resolveMouseStyleHoverTarget(target, e) {
  return {
    targetElements: [target],
    x: e.x + 10
  };
}
registerSingleton(IHoverService, HoverService, InstantiationType.Delayed);
registerThemingParticipant((theme, collector) => {
  const hoverBorder = theme.getColor(editorHoverBorder);
  if (hoverBorder) {
    collector.addRule(`.monaco-hover.workbench-hover .hover-row:not(:first-child):not(:empty) { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
    collector.addRule(`.monaco-hover.workbench-hover hr { border-top: 1px solid ${hoverBorder.transparent(0.5)}; }`);
  }
});
export {
  HoverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZWRpdG9ySG92ZXJCb3JkZXIgfSBmcm9tICcuLi8uLi90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEhvdmVyV2lkZ2V0IH0gZnJvbSAnLi9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBDb250ZXh0VmlldywgQ29udGV4dFZpZXdET01Qb3NpdGlvbiwgSURlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgZ2V0QWN0aXZlRWxlbWVudCwgaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCwgaXNBbmNlc3RvciwgZ2V0V2luZG93LCBpc0hUTUxFbGVtZW50LCBpc0VkaXRhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBSZXN1bHRLaW5kIH0gZnJvbSAnLi4vLi4va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ1Jlc29sdmVyLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEhvdmVyU3R5bGUsIGlzTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nLCB0eXBlIElIb3ZlckxpZmVjeWNsZU9wdGlvbnMsIHR5cGUgSUhvdmVyT3B0aW9ucywgdHlwZSBJSG92ZXJUYXJnZXQsIHR5cGUgSUhvdmVyV2lkZ2V0LCB0eXBlIElNYW5hZ2VkSG92ZXIsIHR5cGUgSU1hbmFnZWRIb3ZlckNvbnRlbnRPckZhY3RvcnksIHR5cGUgSU1hbmFnZWRIb3Zlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJSG92ZXJEZWxlZ2F0ZSwgSUhvdmVyRGVsZWdhdGVUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBNYW5hZ2VkSG92ZXJXaWRnZXQgfSBmcm9tICcuL3VwZGF0YWJsZUhvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IHRpbWVvdXQsIFRpbWVvdXRUaW1lciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgaXNOdW1iZXIsIGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcblxuLyoqXG4gKiBNYXhpbXVtIG5lc3RpbmcgZGVwdGggZm9yIGhvdmVycy4gVGhpcyBwcmV2ZW50cyBydW5hd2F5IG5lc3RpbmcuXG4gKi9cbmNvbnN0IE1BWF9IT1ZFUl9ORVNUSU5HX0RFUFRIID0gMztcblxuLyoqXG4gKiBBbiBlbnRyeSBpbiB0aGUgaG92ZXIgc3RhY2ssIHJlcHJlc2VudGluZyBhIHNpbmdsZSBob3ZlciBhbmQgaXRzIGFzc29jaWF0ZWQgc3RhdGUuXG4gKi9cbmludGVyZmFjZSBJSG92ZXJTdGFja0VudHJ5IHtcblx0cmVhZG9ubHkgaG92ZXI6IEhvdmVyV2lkZ2V0O1xuXHRyZWFkb25seSBvcHRpb25zOiBJSG92ZXJPcHRpb25zO1xuXHRyZWFkb25seSBjb250ZXh0VmlldzogQ29udGV4dFZpZXc7XG5cdHJlYWRvbmx5IGxhc3RGb2N1c2VkRWxlbWVudEJlZm9yZU9wZW46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJlc3VsdCBvZiBjcmVhdGluZyBhIGhvdmVyLCBjb250YWluaW5nIHRoZSBob3ZlciB3aWRnZXQgYW5kIGFzc29jaWF0ZWQgc3RhdGUuXG4gKi9cbmludGVyZmFjZSBJQ3JlYXRlSG92ZXJSZXN1bHQge1xuXHRyZWFkb25seSBob3ZlcjogSG92ZXJXaWRnZXQ7XG5cdHJlYWRvbmx5IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGxhc3RGb2N1c2VkRWxlbWVudEJlZm9yZU9wZW46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgSG92ZXJTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElIb3ZlclNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU3RhY2sgb2YgY3VycmVudGx5IHZpc2libGUgaG92ZXJzLiBUaGUgbGFzdCBlbnRyeSBpcyB0aGUgdG9wbW9zdCBob3Zlci5cblx0ICogVGhpcyBlbmFibGVzIG5lc3RlZCBob3ZlcnMgd2hlcmUgaG92ZXJpbmcgaW5zaWRlIGEgaG92ZXIgY2FuIHNob3cgYW5vdGhlciBob3Zlci5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU3RhY2s6IElIb3ZlclN0YWNrRW50cnlbXSA9IFtdO1xuXG5cdHByaXZhdGUgX2N1cnJlbnREZWxheWVkSG92ZXI6IEhvdmVyV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50RGVsYXllZEhvdmVyV2FzU2hvd246IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfY3VycmVudERlbGF5ZWRIb3Zlckdyb3VwSWQ6IG51bWJlciB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdEhvdmVyT3B0aW9uczogSUhvdmVyT3B0aW9ucyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVsYXllZEhvdmVycyA9IG5ldyBNYXA8SFRNTEVsZW1lbnQsIHsgc2hvdzogKGZvY3VzOiBib29sZWFuKSA9PiB2b2lkIH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hbmFnZWRIb3ZlcnMgPSBuZXcgTWFwPEhUTUxFbGVtZW50LCBJTWFuYWdlZEhvdmVyPigpO1xuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50ICh0b3Btb3N0KSBob3ZlciBmcm9tIHRoZSBzdGFjaywgaWYgYW55LlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX2N1cnJlbnRIb3ZlcigpOiBIb3ZlcldpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2hvdmVyU3RhY2suYXQoLTEpPy5ob3Zlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50ICh0b3Btb3N0KSBob3ZlciBvcHRpb25zIGZyb20gdGhlIHN0YWNrLCBpZiBhbnkuXG5cdCAqL1xuXHRwcml2YXRlIGdldCBfY3VycmVudEhvdmVyT3B0aW9ucygpOiBJSG92ZXJPcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faG92ZXJTdGFjay5hdCgtMSk/Lm9wdGlvbnM7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB3aGV0aGVyIHRoZSB0YXJnZXQgZWxlbWVudCBpcyBpbnNpZGUgYW55IG9mIHRoZSBob3ZlcnMgaW4gdGhlIHN0YWNrLlxuXHQgKiBJZiBpdCBpcywgcmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGNvbnRhaW5pbmcgaG92ZXIsIG90aGVyd2lzZSByZXR1cm5zIC0xLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0Q29udGFpbmluZ0hvdmVySW5kZXgodGFyZ2V0OiBIVE1MRWxlbWVudCB8IElIb3ZlclRhcmdldCk6IG51bWJlciB7XG5cdFx0Y29uc3QgdGFyZ2V0RWxlbWVudHMgPSBpc0hUTUxFbGVtZW50KHRhcmdldCkgPyBbdGFyZ2V0XSA6IHRhcmdldC50YXJnZXRFbGVtZW50cztcblx0XHQvLyBTZWFyY2ggZnJvbSB0b3Agb2Ygc3RhY2sgdG8gYm90dG9tIChtb3N0IHJlY2VudCBob3ZlciBmaXJzdClcblx0XHRmb3IgKGxldCBpID0gdGhpcy5faG92ZXJTdGFjay5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Zm9yIChjb25zdCB0YXJnZXRFbGVtZW50IG9mIHRhcmdldEVsZW1lbnRzKSB7XG5cdFx0XHRcdGlmIChpc0FuY2VzdG9yKHRhcmdldEVsZW1lbnQsIHRoaXMuX2hvdmVyU3RhY2tbaV0uaG92ZXIuZG9tTm9kZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29udGV4dE1lbnVTZXJ2aWNlLm9uRGlkU2hvd0NvbnRleHRNZW51KCgpID0+IHRoaXMuaGlkZUhvdmVyKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEtleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnNob3dIb3ZlcicsXG5cdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29yZSxcblx0XHRcdHByaW1hcnk6IEtleUNob3JkKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlLLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SSksXG5cdFx0XHRoYW5kbGVyOiAoKSA9PiB7IHRoaXMuX3Nob3dBbmRGb2N1c0hvdmVyRm9yQWN0aXZlRWxlbWVudCgpOyB9LFxuXHRcdH0pKTtcblx0fVxuXG5cdHNob3dJbnN0YW50SG92ZXIob3B0aW9uczogSUhvdmVyT3B0aW9ucywgZm9jdXM/OiBib29sZWFuLCBza2lwTGFzdEZvY3VzZWRVcGRhdGU/OiBib29sZWFuLCBkb250U2hvdz86IGJvb2xlYW4pOiBJSG92ZXJXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGhvdmVyID0gdGhpcy5fY3JlYXRlSG92ZXIob3B0aW9ucywgc2tpcExhc3RGb2N1c2VkVXBkYXRlKTtcblx0XHRpZiAoIWhvdmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9zaG93SG92ZXIoaG92ZXIsIG9wdGlvbnMsIGZvY3VzKTtcblx0XHRyZXR1cm4gaG92ZXIuaG92ZXI7XG5cdH1cblxuXHRzaG93RGVsYXllZEhvdmVyKFxuXHRcdG9wdGlvbnM6IElIb3Zlck9wdGlvbnMsXG5cdFx0bGlmZWN5Y2xlT3B0aW9uczogUGljazxJSG92ZXJMaWZlY3ljbGVPcHRpb25zLCAnZ3JvdXBJZCcgfCAncmVkdWNlZERlbGF5Jz4sXG5cdCk6IElIb3ZlcldpZGdldCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gU2V0IGBpZGAgdG8gZGVmYXVsdCBpZiBpdCdzIHVuZGVmaW5lZFxuXHRcdGlmIChvcHRpb25zLmlkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdG9wdGlvbnMuaWQgPSBnZXRIb3ZlcklkRnJvbUNvbnRlbnQob3B0aW9ucy5jb250ZW50KTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXIgfHwgdGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlcldhc1Nob3duKSB7XG5cdFx0XHQvLyBDdXJyZW50IGhvdmVyIGlzIGxvY2tlZCwgcmVqZWN0IFx1MjAxNCB1bmxlc3MgdGhpcyBpcyBhIG5lc3Rpbmcgc2NlbmFyaW9cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50SG92ZXI/LmlzTG9ja2VkICYmIHRoaXMuX2dldENvbnRhaW5pbmdIb3ZlckluZGV4KG9wdGlvbnMudGFyZ2V0KSA8IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWRlbnRpdHkgaXMgdGhlIHNhbWUsIHJldHVybiBjdXJyZW50IGhvdmVyXG5cdFx0XHRpZiAoZ2V0SG92ZXJPcHRpb25zSWRlbnRpdHkodGhpcy5fY3VycmVudEhvdmVyT3B0aW9ucykgPT09IGdldEhvdmVyT3B0aW9uc0lkZW50aXR5KG9wdGlvbnMpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50SG92ZXI7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGdyb3VwIGlkZW50aXR5LCBpZiBpdCdzIHRoZSBzYW1lIHNraXAgdGhlIGRlbGF5IGFuZCBzaG93IHRoZSBob3ZlciBpbW1lZGlhdGVseVxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRIb3ZlciAmJiAhdGhpcy5fY3VycmVudEhvdmVyLmlzRGlzcG9zZWQgJiYgdGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlckdyb3VwSWQgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyR3JvdXBJZCA9PT0gbGlmZWN5Y2xlT3B0aW9ucz8uZ3JvdXBJZCkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zaG93SW5zdGFudEhvdmVyKHtcblx0XHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRcdC4uLm9wdGlvbnMuYXBwZWFyYW5jZSxcblx0XHRcdFx0XHRcdHNraXBGYWRlSW5BbmltYXRpb246IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5fY3VycmVudERlbGF5ZWRIb3ZlciAmJiBnZXRIb3Zlck9wdGlvbnNJZGVudGl0eSh0aGlzLl9jdXJyZW50SG92ZXJPcHRpb25zKSA9PT0gZ2V0SG92ZXJPcHRpb25zSWRlbnRpdHkob3B0aW9ucykpIHtcblx0XHRcdC8vIElmIHRoZSBob3ZlciBpcyB0aGUgc2FtZSBidXQgdGltZW91dCBpcyBub3QgZmluaXNoZWQgeWV0LCByZXR1cm4gdGhlIGN1cnJlbnQgaG92ZXJcblx0XHRcdHJldHVybiB0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvdmVyID0gdGhpcy5fY3JlYXRlSG92ZXIob3B0aW9ucywgdW5kZWZpbmVkKTtcblx0XHRpZiAoIWhvdmVyKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fY3VycmVudERlbGF5ZWRIb3Zlcldhc1Nob3duID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyR3JvdXBJZCA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY3VycmVudERlbGF5ZWRIb3ZlciA9IGhvdmVyLmhvdmVyO1xuXHRcdHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXJXYXNTaG93biA9IGZhbHNlO1xuXHRcdHRoaXMuX2N1cnJlbnREZWxheWVkSG92ZXJHcm91cElkID0gbGlmZWN5Y2xlT3B0aW9ucz8uZ3JvdXBJZDtcblxuXHRcdGNvbnN0IGRlbGF5ID0gbGlmZWN5Y2xlT3B0aW9ucz8ucmVkdWNlZERlbGF5XG5cdFx0XHQ/IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oJ3dvcmtiZW5jaC5ob3Zlci5yZWR1Y2VkRGVsYXknKVxuXHRcdFx0OiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCd3b3JrYmVuY2guaG92ZXIuZGVsYXknKTtcblx0XHR0aW1lb3V0KGRlbGF5KS50aGVuKCgpID0+IHtcblx0XHRcdGlmIChob3Zlci5ob3ZlciAmJiAhaG92ZXIuaG92ZXIuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyV2FzU2hvd24gPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9zaG93SG92ZXIoaG92ZXIsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGhvdmVyLmhvdmVyO1xuXHR9XG5cblx0c2V0dXBEZWxheWVkSG92ZXIoXG5cdFx0dGFyZ2V0OiBIVE1MRWxlbWVudCxcblx0XHRvcHRpb25zOiAoKCkgPT4gT21pdDxJSG92ZXJPcHRpb25zLCAndGFyZ2V0Jz4pIHwgT21pdDxJSG92ZXJPcHRpb25zLCAndGFyZ2V0Jz4sXG5cdFx0bGlmZWN5Y2xlT3B0aW9ucz86IElIb3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZXNvbHZlSG92ZXJPcHRpb25zID0gKGU/OiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZDogSUhvdmVyT3B0aW9ucyA9IHtcblx0XHRcdFx0Li4udHlwZW9mIG9wdGlvbnMgPT09ICdmdW5jdGlvbicgPyBvcHRpb25zKCkgOiBvcHRpb25zLFxuXHRcdFx0XHR0YXJnZXRcblx0XHRcdH07XG5cdFx0XHRpZiAocmVzb2x2ZWQuc3R5bGUgPT09IEhvdmVyU3R5bGUuTW91c2UgJiYgZSkge1xuXHRcdFx0XHRyZXNvbHZlZC50YXJnZXQgPSByZXNvbHZlTW91c2VTdHlsZUhvdmVyVGFyZ2V0KHRhcmdldCwgZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdFx0fTtcblx0XHRyZXR1cm4gdGhpcy5fc2V0dXBEZWxheWVkSG92ZXIodGFyZ2V0LCByZXNvbHZlSG92ZXJPcHRpb25zLCBsaWZlY3ljbGVPcHRpb25zKTtcblx0fVxuXG5cdHNldHVwRGVsYXllZEhvdmVyQXRNb3VzZShcblx0XHR0YXJnZXQ6IEhUTUxFbGVtZW50LFxuXHRcdG9wdGlvbnM6ICgoKSA9PiBPbWl0PElIb3Zlck9wdGlvbnMsICd0YXJnZXQnIHwgJ3Bvc2l0aW9uJz4pIHwgT21pdDxJSG92ZXJPcHRpb25zLCAndGFyZ2V0JyB8ICdwb3NpdGlvbic+LFxuXHRcdGxpZmVjeWNsZU9wdGlvbnM/OiBJSG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVzb2x2ZUhvdmVyT3B0aW9ucyA9IChlPzogTW91c2VFdmVudCkgPT4gKHtcblx0XHRcdC4uLnR5cGVvZiBvcHRpb25zID09PSAnZnVuY3Rpb24nID8gb3B0aW9ucygpIDogb3B0aW9ucyxcblx0XHRcdHRhcmdldDogZSA/IHJlc29sdmVNb3VzZVN0eWxlSG92ZXJUYXJnZXQodGFyZ2V0LCBlKSA6IHRhcmdldFxuXHRcdH0gc2F0aXNmaWVzIElIb3Zlck9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLl9zZXR1cERlbGF5ZWRIb3Zlcih0YXJnZXQsIHJlc29sdmVIb3Zlck9wdGlvbnMsIGxpZmVjeWNsZU9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0dXBEZWxheWVkSG92ZXIoXG5cdFx0dGFyZ2V0OiBIVE1MRWxlbWVudCxcblx0XHRyZXNvbHZlSG92ZXJPcHRpb25zOiAoKGU/OiBNb3VzZUV2ZW50KSA9PiBJSG92ZXJPcHRpb25zKSxcblx0XHRsaWZlY3ljbGVPcHRpb25zPzogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0KSB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXQsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCBlID0+IHtcblx0XHRcdHRoaXMuc2hvd0RlbGF5ZWRIb3ZlcihyZXNvbHZlSG92ZXJPcHRpb25zKGUpLCB7XG5cdFx0XHRcdGdyb3VwSWQ6IGxpZmVjeWNsZU9wdGlvbnM/Lmdyb3VwSWQsXG5cdFx0XHRcdHJlZHVjZWREZWxheTogbGlmZWN5Y2xlT3B0aW9ucz8ucmVkdWNlZERlbGF5LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdGlmIChsaWZlY3ljbGVPcHRpb25zPy5zZXR1cEtleWJvYXJkRXZlbnRzKSB7XG5cdFx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0aWYgKGV2dC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXZ0LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRcdHRoaXMuc2hvd0luc3RhbnRIb3ZlcihyZXNvbHZlSG92ZXJPcHRpb25zKCksIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVsYXllZEhvdmVycy5zZXQodGFyZ2V0LCB7IHNob3c6IChmb2N1czogYm9vbGVhbikgPT4geyB0aGlzLnNob3dJbnN0YW50SG92ZXIocmVzb2x2ZUhvdmVyT3B0aW9ucygpLCBmb2N1cyk7IH0gfSk7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9kZWxheWVkSG92ZXJzLmRlbGV0ZSh0YXJnZXQpKSk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVIb3ZlcihvcHRpb25zOiBJSG92ZXJPcHRpb25zLCBza2lwTGFzdEZvY3VzZWRVcGRhdGU/OiBib29sZWFuKTogSUNyZWF0ZUhvdmVyUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLl9jdXJyZW50RGVsYXllZEhvdmVyPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3VycmVudERlbGF5ZWRIb3ZlciA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChvcHRpb25zLmNvbnRlbnQgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNldCBgaWRgIHRvIGRlZmF1bHQgaWYgaXQncyB1bmRlZmluZWRcblx0XHRpZiAob3B0aW9ucy5pZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRvcHRpb25zLmlkID0gZ2V0SG92ZXJJZEZyb21Db250ZW50KG9wdGlvbnMuY29udGVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHRhcmdldCBpcyBpbnNpZGUgYW4gZXhpc3RpbmcgaG92ZXIgKG5lc3Rpbmcgc2NlbmFyaW8pXG5cdFx0Y29uc3QgY29udGFpbmluZ0hvdmVySW5kZXggPSB0aGlzLl9nZXRDb250YWluaW5nSG92ZXJJbmRleChvcHRpb25zLnRhcmdldCk7XG5cdFx0Y29uc3QgaXNOZXN0aW5nID0gY29udGFpbmluZ0hvdmVySW5kZXggPj0gMDtcblxuXHRcdGlmIChpc05lc3RpbmcpIHtcblx0XHRcdC8vIENoZWNrIG1heCBuZXN0aW5nIGRlcHRoXG5cdFx0XHRpZiAodGhpcy5faG92ZXJTdGFjay5sZW5ndGggPj0gTUFYX0hPVkVSX05FU1RJTkdfREVQVEgpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdC8vIFdoZW4gbmVzdGluZywgZG9uJ3QgY2hlY2sgaWYgdGhlIHBhcmVudCBpcyBsb2NrZWQgLSB3ZSBhbGxvdyBuZXN0ZWQgaG92ZXJzIGluc2lkZSBsb2NrZWQgcGFyZW50c1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOb3QgbmVzdGluZzogY2hlY2sgaWYgY3VycmVudCB0b3AtbGV2ZWwgaG92ZXIgaXMgbG9ja2VkXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudEhvdmVyPy5pc0xvY2tlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDaGVjayBpZiBpZGVudGl0eSBpcyB0aGUgc2FtZSBhcyBjdXJyZW50IGhvdmVyXG5cdFx0XHRpZiAoZ2V0SG92ZXJPcHRpb25zSWRlbnRpdHkodGhpcy5fY3VycmVudEhvdmVyT3B0aW9ucykgPT09IGdldEhvdmVyT3B0aW9uc0lkZW50aXR5KG9wdGlvbnMpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbGFzdEhvdmVyT3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0Y29uc3QgdHJhcEZvY3VzID0gb3B0aW9ucy50cmFwRm9jdXMgfHwgdGhpcy5fYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKTtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGxldCBsYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHQvLyBIQUNLLCByZW1vdmUgdGhpcyBjaGVjayB3aGVuICMxODkwNzYgaXMgZml4ZWRcblx0XHRpZiAoIXNraXBMYXN0Rm9jdXNlZFVwZGF0ZSkge1xuXHRcdFx0aWYgKHRyYXBGb2N1cyAmJiBhY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRcdGlmICghYWN0aXZlRWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1ob3ZlcicpKSB7XG5cdFx0XHRcdFx0bGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3BlbiA9IGFjdGl2ZUVsZW1lbnQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBob3ZlckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGhvdmVyID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSG92ZXJXaWRnZXQsIG9wdGlvbnMpO1xuXHRcdGlmIChvcHRpb25zLnBlcnNpc3RlbmNlPy5zdGlja3kpIHtcblx0XHRcdGhvdmVyLmlzTG9ja2VkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBBZGp1c3QgdGFyZ2V0IHBvc2l0aW9uIHdoZW4gYSBtb3VzZSBldmVudCBpcyBwcm92aWRlZCBhcyB0aGUgaG92ZXIgcG9zaXRpb25cblx0XHRpZiAob3B0aW9ucy5wb3NpdGlvbj8uaG92ZXJQb3NpdGlvbiAmJiAhaXNOdW1iZXIob3B0aW9ucy5wb3NpdGlvbi5ob3ZlclBvc2l0aW9uKSkge1xuXHRcdFx0b3B0aW9ucy50YXJnZXQgPSB7XG5cdFx0XHRcdHRhcmdldEVsZW1lbnRzOiBpc0hUTUxFbGVtZW50KG9wdGlvbnMudGFyZ2V0KSA/IFtvcHRpb25zLnRhcmdldF0gOiBvcHRpb25zLnRhcmdldC50YXJnZXRFbGVtZW50cyxcblx0XHRcdFx0eDogb3B0aW9ucy5wb3NpdGlvbi5ob3ZlclBvc2l0aW9uLnggKyAxMFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRob3Zlci5vbkRpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0Ly8gUG9wIHRoaXMgaG92ZXIgZnJvbSB0aGUgc3RhY2sgaWYgaXQncyBzdGlsbCB0aGVyZVxuXHRcdFx0Y29uc3Qgc3RhY2tJbmRleCA9IHRoaXMuX2hvdmVyU3RhY2suZmluZEluZGV4KGVudHJ5ID0+IGVudHJ5LmhvdmVyID09PSBob3Zlcik7XG5cdFx0XHRpZiAoc3RhY2tJbmRleCA+PSAwKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5faG92ZXJTdGFja1tzdGFja0luZGV4XTtcblx0XHRcdFx0Ly8gUmVzdG9yZSBmb2N1cyBpZiB0aGlzIGhvdmVyIHdhcyBmb2N1c2VkXG5cdFx0XHRcdGNvbnN0IGhvdmVyV2FzRm9jdXNlZCA9IGlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQoaG92ZXIuZG9tTm9kZSk7XG5cdFx0XHRcdGlmIChob3Zlcldhc0ZvY3VzZWQgJiYgZW50cnkubGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3Blbikge1xuXHRcdFx0XHRcdGVudHJ5Lmxhc3RGb2N1c2VkRWxlbWVudEJlZm9yZU9wZW4uZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBBbHNvIGRpc3Bvc2UgYWxsIG5lc3RlZCBob3ZlcnMgKGhvdmVycyBhdCBoaWdoZXIgaW5kaWNlcyBpbiB0aGUgc3RhY2spXG5cdFx0XHRcdC8vIERpc3Bvc2UgZnJvbSBlbmQgdG8gYXZvaWQgaW5kZXggc2hpZnRpbmcgaXNzdWVzXG5cdFx0XHRcdHdoaWxlICh0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCA+IHN0YWNrSW5kZXggKyAxKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmVzdGVkRW50cnkgPSB0aGlzLl9ob3ZlclN0YWNrLnBvcCgpITtcblx0XHRcdFx0XHRuZXN0ZWRFbnRyeS5jb250ZXh0Vmlldy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0bmVzdGVkRW50cnkuaG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFJlbW92ZSB0aGlzIGhvdmVyIGZyb20gc3RhY2sgYW5kIGRpc3Bvc2UgaXRzIGNvbnRleHQgdmlld1xuXHRcdFx0XHR0aGlzLl9ob3ZlclN0YWNrLnNwbGljZShzdGFja0luZGV4LCAxKTtcblx0XHRcdFx0ZW50cnkuY29udGV4dFZpZXcuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdFx0aG92ZXJEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSwgdW5kZWZpbmVkLCBob3ZlckRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIFNldCB0aGUgY29udGFpbmVyIGV4cGxpY2l0bHkgdG8gZW5hYmxlIGF1eCB3aW5kb3cgc3VwcG9ydFxuXHRcdGlmICghb3B0aW9ucy5jb250YWluZXIpIHtcblx0XHRcdGNvbnN0IHRhcmdldEVsZW1lbnQgPSBpc0hUTUxFbGVtZW50KG9wdGlvbnMudGFyZ2V0KSA/IG9wdGlvbnMudGFyZ2V0IDogb3B0aW9ucy50YXJnZXQudGFyZ2V0RWxlbWVudHNbMF07XG5cdFx0XHRvcHRpb25zLmNvbnRhaW5lciA9IHRoaXMuX2xheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGdldFdpbmRvdyh0YXJnZXRFbGVtZW50KSk7XG5cdFx0fVxuXG5cdFx0aG92ZXJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGdldFdpbmRvdyhvcHRpb25zLmNvbnRhaW5lcikuZG9jdW1lbnQsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHtcblx0XHRcdGlmICghaXNBbmNlc3RvcihlLnRhcmdldCBhcyBIVE1MRWxlbWVudCwgaG92ZXIuZG9tTm9kZSkpIHtcblx0XHRcdFx0dGhpcy5faGlkZUhvdmVyQW5kRGVzY2VuZGFudHMoaG92ZXIpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmICghb3B0aW9ucy5wZXJzaXN0ZW5jZT8uc3RpY2t5KSB7XG5cdFx0XHRpZiAoJ3RhcmdldEVsZW1lbnRzJyBpbiBvcHRpb25zLnRhcmdldCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2Ygb3B0aW9ucy50YXJnZXQudGFyZ2V0RWxlbWVudHMpIHtcblx0XHRcdFx0XHRob3ZlckRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB0aGlzLl9oaWRlSG92ZXJBbmREZXNjZW5kYW50cyhob3ZlcikpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aG92ZXJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG9wdGlvbnMudGFyZ2V0LCBFdmVudFR5cGUuQ0xJQ0ssICgpID0+IHRoaXMuX2hpZGVIb3ZlckFuZERlc2NlbmRhbnRzKGhvdmVyKSkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCk7XG5cdFx0XHRpZiAoZm9jdXNlZEVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnREb2N1bWVudCA9IGdldFdpbmRvdyhmb2N1c2VkRWxlbWVudCkuZG9jdW1lbnQ7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihmb2N1c2VkRWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHRoaXMuX2tleURvd24oZSwgaG92ZXIsICEhb3B0aW9ucy5wZXJzaXN0ZW5jZT8uaGlkZU9uS2V5RG93bikpKTtcblx0XHRcdFx0aG92ZXJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGZvY3VzZWRFbGVtZW50RG9jdW1lbnQsIEV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB0aGlzLl9rZXlEb3duKGUsIGhvdmVyLCAhIW9wdGlvbnMucGVyc2lzdGVuY2U/LmhpZGVPbktleURvd24pKSk7XG5cdFx0XHRcdGhvdmVyRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihmb2N1c2VkRWxlbWVudCwgRXZlbnRUeXBlLktFWV9VUCwgZSA9PiB0aGlzLl9rZXlVcChlLCBob3ZlcikpKTtcblx0XHRcdFx0aG92ZXJEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGZvY3VzZWRFbGVtZW50RG9jdW1lbnQsIEV2ZW50VHlwZS5LRVlfVVAsIGUgPT4gdGhpcy5fa2V5VXAoZSwgaG92ZXIpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCdJbnRlcnNlY3Rpb25PYnNlcnZlcicgaW4gbWFpbldpbmRvdykge1xuXHRcdFx0Y29uc3Qgb2JzZXJ2ZXIgPSBuZXcgSW50ZXJzZWN0aW9uT2JzZXJ2ZXIoZSA9PiB0aGlzLl9pbnRlcnNlY3Rpb25DaGFuZ2UoZSwgaG92ZXIpLCB7IHRocmVzaG9sZDogMCB9KTtcblx0XHRcdGNvbnN0IGZpcnN0VGFyZ2V0RWxlbWVudCA9ICd0YXJnZXRFbGVtZW50cycgaW4gb3B0aW9ucy50YXJnZXQgPyBvcHRpb25zLnRhcmdldC50YXJnZXRFbGVtZW50c1swXSA6IG9wdGlvbnMudGFyZ2V0O1xuXHRcdFx0b2JzZXJ2ZXIub2JzZXJ2ZShmaXJzdFRhcmdldEVsZW1lbnQpO1xuXHRcdFx0aG92ZXJEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGhvdmVyLCBsYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuLCBzdG9yZTogaG92ZXJEaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0hvdmVyKHJlc3VsdDogSUNyZWF0ZUhvdmVyUmVzdWx0LCBvcHRpb25zOiBJSG92ZXJPcHRpb25zLCBmb2N1cz86IGJvb2xlYW4pIHtcblx0XHRjb25zdCB7IGhvdmVyLCBsYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuLCBzdG9yZSB9ID0gcmVzdWx0O1xuXG5cdFx0Ly8gQ2hlY2sgaWYgdGhlIHRhcmdldCBpcyBpbnNpZGUgYW4gZXhpc3RpbmcgaG92ZXIgKG5lc3Rpbmcgc2NlbmFyaW8pXG5cdFx0Y29uc3QgY29udGFpbmluZ0hvdmVySW5kZXggPSB0aGlzLl9nZXRDb250YWluaW5nSG92ZXJJbmRleChvcHRpb25zLnRhcmdldCk7XG5cdFx0Y29uc3QgaXNOZXN0aW5nID0gY29udGFpbmluZ0hvdmVySW5kZXggPj0gMDtcblxuXHRcdC8vIElmIG5vdCBuZXN0aW5nLCBjbG9zZSBhbGwgZXhpc3RpbmcgaG92ZXJzIGZpcnN0XG5cdFx0aWYgKCFpc05lc3RpbmcpIHtcblx0XHRcdHRoaXMuX2hpZGVBbGxIb3ZlcnMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gV2hlbiBuZXN0aW5nLCBjbG9zZSBhbnkgc2libGluZyBob3ZlcnMgKGhvdmVycyBhdCB0aGUgc2FtZSBsZXZlbCBvciBkZWVwZXJcblx0XHRcdC8vIHRoYW4gdGhlIGNvbnRhaW5pbmcgaG92ZXIpLiBUaGlzIGVuc3VyZXMgaG92ZXJzIHdpdGhpbiB0aGUgc2FtZSBjb250YWluZXJcblx0XHRcdC8vIGFyZSBleGNsdXNpdmUuXG5cdFx0XHRmb3IgKGxldCBpID0gdGhpcy5faG92ZXJTdGFjay5sZW5ndGggLSAxOyBpID4gY29udGFpbmluZ0hvdmVySW5kZXg7IGktLSkge1xuXHRcdFx0XHR0aGlzLl9ob3ZlclN0YWNrW2ldLmhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoID0gY29udGFpbmluZ0hvdmVySW5kZXggKyAxO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gbmVzdGluZywgYWRkIHRoZSBuZXcgaG92ZXIncyBjb250YWluZXIgdG8gYWxsIHBhcmVudCBob3ZlcnMnIG1vdXNlIHRyYWNrZXJzLlxuXHRcdC8vIFRoaXMgbWFrZXMgdGhlIHBhcmVudCBob3ZlcnMgdHJlYXQgdGhlIG5lc3RlZCBob3ZlciBhcyBwYXJ0IG9mIHRoZW1zZWx2ZXMsXG5cdFx0Ly8gc28gdGhleSB3b24ndCBjbG9zZSB3aGVuIHRoZSBtb3VzZSBtb3ZlcyBpbnRvIHRoZSBuZXN0ZWQgaG92ZXIuXG5cdFx0aWYgKGlzTmVzdGluZykge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPD0gY29udGFpbmluZ0hvdmVySW5kZXg7IGkrKykge1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5faG92ZXJTdGFja1tpXS5ob3Zlci5hZGRNb3VzZVRyYWNraW5nRWxlbWVudChob3Zlci5kb21Ob2RlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IENvbnRleHRWaWV3IGZvciB0aGlzIGhvdmVyIHdpdGggaGlnaGVyIHotaW5kZXggZm9yIG5lc3RlZCBob3ZlcnNcblx0XHRjb25zdCBjb250YWluZXIgPSBvcHRpb25zLmNvbnRhaW5lciA/PyB0aGlzLl9sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihnZXRXaW5kb3coaXNIVE1MRWxlbWVudChvcHRpb25zLnRhcmdldCkgPyBvcHRpb25zLnRhcmdldCA6IG9wdGlvbnMudGFyZ2V0LnRhcmdldEVsZW1lbnRzWzBdKSk7XG5cdFx0Y29uc3QgY29udGV4dFZpZXcgPSBuZXcgQ29udGV4dFZpZXcoY29udGFpbmVyLCBDb250ZXh0Vmlld0RPTVBvc2l0aW9uLkFCU09MVVRFKTtcblxuXHRcdC8vIFB1c2ggdG8gc3RhY2tcblx0XHRjb25zdCBzdGFja0VudHJ5OiBJSG92ZXJTdGFja0VudHJ5ID0ge1xuXHRcdFx0aG92ZXIsXG5cdFx0XHRvcHRpb25zLFxuXHRcdFx0Y29udGV4dFZpZXcsXG5cdFx0XHRsYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuXG5cdFx0fTtcblx0XHR0aGlzLl9ob3ZlclN0YWNrLnB1c2goc3RhY2tFbnRyeSk7XG5cblx0XHQvLyBTaG93IHRoZSBob3ZlciBpbiBpdHMgY29udGV4dCB2aWV3XG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgSG92ZXJDb250ZXh0Vmlld0RlbGVnYXRlKGhvdmVyLCBmb2N1cywgdGhpcy5faG92ZXJTdGFjay5sZW5ndGgpO1xuXHRcdGNvbnRleHRWaWV3LnNob3coZGVsZWdhdGUpO1xuXG5cdFx0Ly8gU2V0IHVwIGxheW91dCBoYW5kbGluZ1xuXHRcdHN0b3JlLmFkZChob3Zlci5vblJlcXVlc3RMYXlvdXQoKCkgPT4gY29udGV4dFZpZXcubGF5b3V0KCkpKTtcblxuXHRcdC8vIFJlLWxheW91dCB3aGVuIHRoZSB3aW5kb3cgcmVzaXplcyBzbyB0aGUgaG92ZXIgdHJhY2tzIGl0cyBhbmNob3IuXG5cdFx0Ly8gT25seSBmb3IgZm9jdXNlZC9zdGlja3kgaG92ZXJzIHRoYXQgcGVyc2lzdCBsb25nIGVub3VnaCBmb3IgYSByZXNpemVcblx0XHQvLyB0byBtYXR0ZXI7IHRyYW5zaWVudCBob3ZlcnMgZGlzbWlzcyBvbiBtb3VzZSBtb3ZlbWVudCBhbnl3YXkuXG5cdFx0aWYgKGZvY3VzIHx8IG9wdGlvbnMucGVyc2lzdGVuY2U/LnN0aWNreSkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cdFx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgRXZlbnRUeXBlLlJFU0laRSwgKCkgPT4gY29udGV4dFZpZXcubGF5b3V0KCkpKTtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5vbkRpZEhpZGUpIHtcblx0XHRcdGNvbnN0IG9uRGlkSGlkZSA9IG9wdGlvbnMub25EaWRIaWRlO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBvbkRpZEhpZGUoKSkpO1xuXHRcdH1cblx0XHRvcHRpb25zLm9uRGlkU2hvdz8uKCk7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZXMgYSBzcGVjaWZpYyBob3ZlciBhbmQgYWxsIGhvdmVycyBuZXN0ZWQgaW5zaWRlIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfaGlkZUhvdmVyQW5kRGVzY2VuZGFudHMoaG92ZXI6IEhvdmVyV2lkZ2V0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhY2tJbmRleCA9IHRoaXMuX2hvdmVyU3RhY2suZmluZEluZGV4KGVudHJ5ID0+IGVudHJ5LmhvdmVyID09PSBob3Zlcik7XG5cdFx0aWYgKHN0YWNrSW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zZSBhbGwgaG92ZXJzIGZyb20gdGhpcyBpbmRleCBvbndhcmRzIChpbmNsdWRpbmcgbmVzdGVkIG9uZXMpXG5cdFx0Zm9yIChsZXQgaSA9IHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoIC0gMTsgaSA+PSBzdGFja0luZGV4OyBpLS0pIHtcblx0XHRcdHRoaXMuX2hvdmVyU3RhY2tbaV0uaG92ZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCA9IHN0YWNrSW5kZXg7XG5cdH1cblxuXHQvKipcblx0ICogSGlkZXMgYWxsIGhvdmVycyBpbiB0aGUgc3RhY2suXG5cdCAqL1xuXHRwcml2YXRlIF9oaWRlQWxsSG92ZXJzKCk6IHZvaWQge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHR0aGlzLl9ob3ZlclN0YWNrW2ldLmhvdmVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5faG92ZXJTdGFjay5sZW5ndGggPSAwO1xuXHR9XG5cblx0aGlkZUhvdmVyKGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIG5vdCBmb3JjaW5nIGFuZCB0aGUgdG9wbW9zdCBob3ZlciBpcyBsb2NrZWQsIGRvbid0IGhpZGVcblx0XHRpZiAoIWZvcmNlICYmIHRoaXMuX2N1cnJlbnRIb3Zlcj8uaXNMb2NrZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBIaWRlIG9ubHkgdGhlIHRvcG1vc3QgaG92ZXIgKHBvcCBmcm9tIHN0YWNrKVxuXHRcdHRoaXMuZG9IaWRlSG92ZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9IaWRlSG92ZXIoKTogdm9pZCB7XG5cdFx0Ly8gUG9wIGFuZCBkaXNwb3NlIHRoZSB0b3Btb3N0IGhvdmVyXG5cdFx0Y29uc3QgbGVuZ3RoID0gdGhpcy5faG92ZXJTdGFjay5sZW5ndGg7XG5cdFx0dGhpcy5faG92ZXJTdGFja1tsZW5ndGggLSAxXT8uaG92ZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2hvdmVyU3RhY2subGVuZ3RoID0gbGVuZ3RoIC0gMTtcblxuXHRcdC8vIEFmdGVyIHBvcHBpbmcgYSBuZXN0ZWQgaG92ZXIsIHVubG9jayB0aGUgcGFyZW50IGlmIGl0IHdhcyBsb2NrZWQgZHVlIHRvIG5lc3Rpbmdcblx0XHQvLyAoTm90ZTogdGhlIHBhcmVudCBtYXkgaGF2ZSBiZWVuIGV4cGxpY2l0bHkgbG9ja2VkIHZpYSBzdGlja3ksIHNvIHdlIG9ubHkgdW5sb2NrXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHJlbWFpbmluZyBob3ZlcnMgYW5kIHRoZXkncmUgbm90IHN0aWNreSlcblx0XHQvLyBGb3Igc2ltcGxpY2l0eSwgd2UgZG9uJ3QgYXV0by11bmxvY2sgaGVyZSAtIHRoZSBwYXJlbnQgcmVtYWlucyBpbiBpdHMgY3VycmVudCBsb2NrIHN0YXRlXG5cdH1cblxuXHRwcml2YXRlIF9pbnRlcnNlY3Rpb25DaGFuZ2UoZW50cmllczogSW50ZXJzZWN0aW9uT2JzZXJ2ZXJFbnRyeVtdLCBob3ZlcjogSURpc3Bvc2FibGUpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IGVudHJpZXNbZW50cmllcy5sZW5ndGggLSAxXTtcblx0XHRpZiAoIWVudHJ5LmlzSW50ZXJzZWN0aW5nKSB7XG5cdFx0XHRob3Zlci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0c2hvd0FuZEZvY3VzTGFzdEhvdmVyKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fbGFzdEhvdmVyT3B0aW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNob3dJbnN0YW50SG92ZXIodGhpcy5fbGFzdEhvdmVyT3B0aW9ucywgdHJ1ZSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93QW5kRm9jdXNIb3ZlckZvckFjdGl2ZUVsZW1lbnQoKTogdm9pZCB7XG5cdFx0Ly8gVE9ETzogaWYgaG92ZXIgaXMgdmlzaWJsZSwgZm9jdXMgaXQgdG8gYXZvaWQgZmxpY2tlcmluZ1xuXG5cdFx0bGV0IGFjdGl2ZUVsZW1lbnQgPSBnZXRBY3RpdmVFbGVtZW50KCkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdHdoaWxlIChhY3RpdmVFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBob3ZlciA9IHRoaXMuX2RlbGF5ZWRIb3ZlcnMuZ2V0KGFjdGl2ZUVsZW1lbnQpID8/IHRoaXMuX21hbmFnZWRIb3ZlcnMuZ2V0KGFjdGl2ZUVsZW1lbnQpO1xuXHRcdFx0aWYgKGhvdmVyKSB7XG5cdFx0XHRcdGhvdmVyLnNob3codHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YWN0aXZlRWxlbWVudCA9IGFjdGl2ZUVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9rZXlEb3duKGU6IEtleWJvYXJkRXZlbnQsIGhvdmVyOiBIb3ZlcldpZGdldCwgaGlkZU9uS2V5RG93bjogYm9vbGVhbikge1xuXHRcdGlmIChlLmtleSA9PT0gJ0FsdCcpIHtcblx0XHRcdC8vIExvY2sgYWxsIGhvdmVycyBpbiB0aGUgc3RhY2sgd2hlbiBBbHQgaXMgcHJlc3NlZFxuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9ob3ZlclN0YWNrKSB7XG5cdFx0XHRcdGVudHJ5LmhvdmVyLmlzTG9ja2VkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5yZXNvbHZlS2V5Ym9hcmRFdmVudChldmVudCk7XG5cdFx0aWYgKGtleWJpbmRpbmcuZ2V0U2luZ2xlTW9kaWZpZXJEaXNwYXRjaENob3JkcygpLnNvbWUodmFsdWUgPT4gISF2YWx1ZSkgfHwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoKGV2ZW50LCBldmVudC50YXJnZXQpLmtpbmQgIT09IFJlc3VsdEtpbmQuTm9NYXRjaGluZ0tiKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChoaWRlT25LZXlEb3duICYmICghdGhpcy5fY3VycmVudEhvdmVyT3B0aW9ucz8udHJhcEZvY3VzIHx8IGUua2V5ICE9PSAnVGFiJykpIHtcblx0XHRcdC8vIEZpbmQgdGhlIGVudHJ5IGZvciB0aGlzIGhvdmVyIHRvIGdldCBpdHMgbGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3BlblxuXHRcdFx0Y29uc3Qgc3RhY2tFbnRyeSA9IHRoaXMuX2hvdmVyU3RhY2suZmluZChlbnRyeSA9PiBlbnRyeS5ob3ZlciA9PT0gaG92ZXIpO1xuXHRcdFx0dGhpcy5faGlkZUhvdmVyQW5kRGVzY2VuZGFudHMoaG92ZXIpO1xuXHRcdFx0c3RhY2tFbnRyeT8ubGFzdEZvY3VzZWRFbGVtZW50QmVmb3JlT3Blbj8uZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9rZXlVcChlOiBLZXlib2FyZEV2ZW50LCBob3ZlcjogSG92ZXJXaWRnZXQpIHtcblx0XHRpZiAoZS5rZXkgPT09ICdBbHQnKSB7XG5cdFx0XHQvLyBVbmxvY2sgYWxsIGhvdmVycyBpbiB0aGUgc3RhY2sgd2hlbiBBbHQgaXMgcmVsZWFzZWRcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5faG92ZXJTdGFjaykge1xuXHRcdFx0XHQvLyBPbmx5IHVubG9jayBpZiBub3Qgc3RpY2t5XG5cdFx0XHRcdGlmICghZW50cnkub3B0aW9ucy5wZXJzaXN0ZW5jZT8uc3RpY2t5KSB7XG5cdFx0XHRcdFx0ZW50cnkuaG92ZXIuaXNMb2NrZWQgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gSGlkZSBhbGwgaG92ZXJzIGlmIHRoZSBtb3VzZSBpcyBub3Qgb3ZlciBhbnkgb2YgdGhlbVxuXHRcdFx0Y29uc3QgYW55TW91c2VJbiA9IHRoaXMuX2hvdmVyU3RhY2suc29tZShlbnRyeSA9PiBlbnRyeS5ob3Zlci5pc01vdXNlSW4pO1xuXHRcdFx0aWYgKCFhbnlNb3VzZUluKSB7XG5cdFx0XHRcdGNvbnN0IHRvcEVudHJ5ID0gdGhpcy5faG92ZXJTdGFja1t0aGlzLl9ob3ZlclN0YWNrLmxlbmd0aCAtIDFdO1xuXHRcdFx0XHR0aGlzLl9oaWRlQWxsSG92ZXJzKCk7XG5cdFx0XHRcdHRvcEVudHJ5Py5sYXN0Rm9jdXNlZEVsZW1lbnRCZWZvcmVPcGVuPy5mb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFRPRE86IEludmVzdGlnYXRlIHBlcmZvcm1hbmNlIG9mIHRoaXMgZnVuY3Rpb24uIFRoZXJlIHNlZW1zIHRvIGJlIGEgbG90IG9mIGNvbnRlbnQgY3JlYXRlZFxuXHQvLyAgICAgICBhbmQgdGhyb3duIGF3YXkgb24gc3RhcnQgdXBcblx0c2V0dXBNYW5hZ2VkSG92ZXIoaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUsIHRhcmdldEVsZW1lbnQ6IEhUTUxFbGVtZW50LCBjb250ZW50OiBJTWFuYWdlZEhvdmVyQ29udGVudE9yRmFjdG9yeSwgb3B0aW9ucz86IElNYW5hZ2VkSG92ZXJPcHRpb25zIHwgdW5kZWZpbmVkKTogSU1hbmFnZWRIb3ZlciB7XG5cdFx0aWYgKGhvdmVyRGVsZWdhdGUuc2hvd05hdGl2ZUhvdmVyKSB7XG5cdFx0XHRyZXR1cm4gc2V0dXBOYXRpdmVIb3Zlcih0YXJnZXRFbGVtZW50LCBjb250ZW50KTtcblx0XHR9XG5cblx0XHR0YXJnZXRFbGVtZW50LnNldEF0dHJpYnV0ZSgnY3VzdG9tLWhvdmVyJywgJ3RydWUnKTtcblxuXHRcdGlmICh0YXJnZXRFbGVtZW50LnRpdGxlICE9PSAnJykge1xuXHRcdFx0Y29uc29sZS53YXJuKCdIVE1MIGVsZW1lbnQgYWxyZWFkeSBoYXMgYSB0aXRsZSBhdHRyaWJ1dGUsIHdoaWNoIHdpbGwgY29uZmxpY3Qgd2l0aCB0aGUgY3VzdG9tIGhvdmVyLiBQbGVhc2UgcmVtb3ZlIHRoZSB0aXRsZSBhdHRyaWJ1dGUuJyk7XG5cdFx0XHQvLyBjb25zb2xlLnRyYWNlKCdTdGFjayB0cmFjZTonLCB0YXJnZXRFbGVtZW50LnRpdGxlKTtcblx0XHRcdHRhcmdldEVsZW1lbnQudGl0bGUgPSAnJztcblx0XHR9XG5cblx0XHRsZXQgaG92ZXJQcmVwYXJhdGlvbjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGhvdmVyV2lkZ2V0OiBNYW5hZ2VkSG92ZXJXaWRnZXQgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBoaWRlSG92ZXIgPSAoZGlzcG9zZVdpZGdldDogYm9vbGVhbiwgZGlzcG9zZVByZXBhcmF0aW9uOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBoYWRIb3ZlciA9IGhvdmVyV2lkZ2V0ICE9PSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZGlzcG9zZVdpZGdldCkge1xuXHRcdFx0XHRob3ZlcldpZGdldD8uZGlzcG9zZSgpO1xuXHRcdFx0XHRob3ZlcldpZGdldCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChkaXNwb3NlUHJlcGFyYXRpb24pIHtcblx0XHRcdFx0aG92ZXJQcmVwYXJhdGlvbj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRob3ZlclByZXBhcmF0aW9uID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhhZEhvdmVyKSB7XG5cdFx0XHRcdGhvdmVyRGVsZWdhdGUub25EaWRIaWRlSG92ZXI/LigpO1xuXHRcdFx0XHRob3ZlcldpZGdldCA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgdHJpZ2dlclNob3dIb3ZlciA9IChkZWxheTogbnVtYmVyLCBmb2N1cz86IGJvb2xlYW4sIHRhcmdldD86IElIb3ZlckRlbGVnYXRlVGFyZ2V0LCB0cmFwRm9jdXM/OiBib29sZWFuKSA9PiB7XG5cdFx0XHRyZXR1cm4gbmV3IFRpbWVvdXRUaW1lcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmICghaG92ZXJXaWRnZXQgfHwgaG92ZXJXaWRnZXQuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdGhvdmVyV2lkZ2V0ID0gbmV3IE1hbmFnZWRIb3ZlcldpZGdldChob3ZlckRlbGVnYXRlLCB0YXJnZXQgfHwgdGFyZ2V0RWxlbWVudCwgZGVsYXkgPiAwKTtcblx0XHRcdFx0XHRhd2FpdCBob3ZlcldpZGdldC51cGRhdGUodHlwZW9mIGNvbnRlbnQgPT09ICdmdW5jdGlvbicgPyBjb250ZW50KCkgOiBjb250ZW50LCBmb2N1cywgeyAuLi5vcHRpb25zLCB0cmFwRm9jdXMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGRlbGF5KTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bGV0IGlzTW91c2VEb3duID0gZmFsc2U7XG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRFbGVtZW50LCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgKCkgPT4ge1xuXHRcdFx0aXNNb3VzZURvd24gPSB0cnVlO1xuXHRcdFx0aGlkZUhvdmVyKHRydWUsIHRydWUpO1xuXHRcdH0sIHRydWUpKTtcblx0XHRzdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldEVsZW1lbnQsIEV2ZW50VHlwZS5NT1VTRV9VUCwgKCkgPT4ge1xuXHRcdFx0aXNNb3VzZURvd24gPSBmYWxzZTtcblx0XHR9LCB0cnVlKSk7XG5cdFx0c3RvcmUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRFbGVtZW50LCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpc01vdXNlRG93biA9IGZhbHNlO1xuXHRcdFx0Ly8gSEFDSzogYGZyb21FbGVtZW50YCBpcyBhIG5vbi1zdGFuZGFyZCBwcm9wZXJ0eS4gTm90IHN1cmUgd2hhdCB0byByZXBsYWNlIGl0IHdpdGgsXG5cdFx0XHQvLyBgcmVsYXRlZFRhcmdldGAgaXMgTk9UIGVxdWl2YWxlbnQuXG5cdFx0XHRpbnRlcmZhY2UgTW91c2VFdmVudFdpdGhGcm9tIGV4dGVuZHMgTW91c2VFdmVudCB7XG5cdFx0XHRcdGZyb21FbGVtZW50OiBFbGVtZW50IHwgbnVsbDtcblx0XHRcdH1cblx0XHRcdGhpZGVIb3ZlcihmYWxzZSwgKGUgYXMgTW91c2VFdmVudFdpdGhGcm9tKS5mcm9tRWxlbWVudCA9PT0gdGFyZ2V0RWxlbWVudCk7XG5cdFx0fSwgdHJ1ZSkpO1xuXHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0RWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX09WRVIsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoaG92ZXJQcmVwYXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vdXNlT3ZlclN0b3JlOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IHRhcmdldDogSUhvdmVyRGVsZWdhdGVUYXJnZXQgPSB7XG5cdFx0XHRcdHRhcmdldEVsZW1lbnRzOiBbdGFyZ2V0RWxlbWVudF0sXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHRcdGlmIChob3ZlckRlbGVnYXRlLnBsYWNlbWVudCA9PT0gdW5kZWZpbmVkIHx8IGhvdmVyRGVsZWdhdGUucGxhY2VtZW50ID09PSAnbW91c2UnKSB7XG5cdFx0XHRcdC8vIHRyYWNrIHRoZSBtb3VzZSBwb3NpdGlvblxuXHRcdFx0XHRjb25zdCBvbk1vdXNlTW92ZSA9IChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0dGFyZ2V0LnggPSBlLnggKyAxMDtcblx0XHRcdFx0XHRpZiAoIWV2ZW50SXNSZWxhdGVkVG9UYXJnZXQoZSwgdGFyZ2V0RWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdGhpZGVIb3Zlcih0cnVlLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cdFx0XHRcdG1vdXNlT3ZlclN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0RWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX01PVkUsIG9uTW91c2VNb3ZlLCB0cnVlKSk7XG5cdFx0XHR9XG5cblx0XHRcdGhvdmVyUHJlcGFyYXRpb24gPSBtb3VzZU92ZXJTdG9yZTtcblxuXHRcdFx0aWYgKCFldmVudElzUmVsYXRlZFRvVGFyZ2V0KGUsIHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gRG8gbm90IHNob3cgaG92ZXIgd2hlbiB0aGUgbW91c2UgaXMgb3ZlciBhbm90aGVyIGhvdmVyIHRhcmdldFxuXHRcdFx0fVxuXG5cdFx0XHRtb3VzZU92ZXJTdG9yZS5hZGQodHJpZ2dlclNob3dIb3Zlcih0eXBlb2YgaG92ZXJEZWxlZ2F0ZS5kZWxheSA9PT0gJ2Z1bmN0aW9uJyA/IGhvdmVyRGVsZWdhdGUuZGVsYXkoY29udGVudCkgOiBob3ZlckRlbGVnYXRlLmRlbGF5LCBmYWxzZSwgdGFyZ2V0KSk7XG5cdFx0fSwgdHJ1ZSkpO1xuXG5cdFx0Y29uc3Qgb25Gb2N1cyA9IChlOiBGb2N1c0V2ZW50KSA9PiB7XG5cdFx0XHRpZiAoaXNNb3VzZURvd24gfHwgaG92ZXJQcmVwYXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBDbGVhbiB1cCBzdGFsZSByZWZlcmVuY2UgaWYgdGhlIGhvdmVyIHdhcyBkaXNtaXNzZWQgZXh0ZXJuYWxseVxuXHRcdFx0aWYgKGhvdmVyV2lkZ2V0Py5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdGhvdmVyV2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgZm9jdXMgaXMgcmV0dXJuaW5nIGZyb20gYSBkaXNtaXNzZWQgaG92ZXIgKGUuZy4gRXNjKSBvclxuXHRcdFx0Ly8gZnJvbSB3aW5kb3cgcmVhY3RpdmF0aW9uIChlLmcuIEFsdC10YWIpLCBkb24ndCByZS1zaG93LlxuXHRcdFx0Y29uc3QgZnJvbUhvdmVyID0gaXNIVE1MRWxlbWVudChlLnJlbGF0ZWRUYXJnZXQpICYmIGUucmVsYXRlZFRhcmdldC5jbG9zZXN0KCcubW9uYWNvLWhvdmVyJyk7XG5cdFx0XHRpZiAoZnJvbUhvdmVyIHx8ICFlLnJlbGF0ZWRUYXJnZXQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFldmVudElzUmVsYXRlZFRvVGFyZ2V0KGUsIHRhcmdldEVsZW1lbnQpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gRG8gbm90IHNob3cgaG92ZXIgd2hlbiB0aGUgZm9jdXMgaXMgb24gYW5vdGhlciBob3ZlciB0YXJnZXRcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFyZ2V0OiBJSG92ZXJEZWxlZ2F0ZVRhcmdldCA9IHtcblx0XHRcdFx0dGFyZ2V0RWxlbWVudHM6IFt0YXJnZXRFbGVtZW50XSxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdG9EaXNwb3NlOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBvbkJsdXIgPSAoKSA9PiBoaWRlSG92ZXIodHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR0b0Rpc3Bvc2UuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRFbGVtZW50LCBFdmVudFR5cGUuQkxVUiwgb25CbHVyLCB0cnVlKSk7XG5cdFx0XHR0b0Rpc3Bvc2UuYWRkKHRyaWdnZXJTaG93SG92ZXIodHlwZW9mIGhvdmVyRGVsZWdhdGUuZGVsYXkgPT09ICdmdW5jdGlvbicgPyBob3ZlckRlbGVnYXRlLmRlbGF5KGNvbnRlbnQpIDogaG92ZXJEZWxlZ2F0ZS5kZWxheSwgZmFsc2UsIHRhcmdldCkpO1xuXHRcdFx0aG92ZXJQcmVwYXJhdGlvbiA9IHRvRGlzcG9zZTtcblx0XHR9O1xuXG5cdFx0Ly8gRG8gbm90IHNob3cgaG92ZXIgd2hlbiBmb2N1c2luZyBhbiBpbnB1dCBvciB0ZXh0YXJlYVxuXHRcdGlmICghaXNFZGl0YWJsZUVsZW1lbnQodGFyZ2V0RWxlbWVudCkpIHtcblx0XHRcdHN0b3JlLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFyZ2V0RWxlbWVudCwgRXZlbnRUeXBlLkZPQ1VTLCBvbkZvY3VzLCB0cnVlKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaG92ZXI6IElNYW5hZ2VkSG92ZXIgPSB7XG5cdFx0XHRzaG93OiBmb2N1cyA9PiB7XG5cdFx0XHRcdGhpZGVIb3ZlcihmYWxzZSwgdHJ1ZSk7IC8vIHRlcm1pbmF0ZSBhIG9uZ29pbmcgbW91c2Ugb3ZlciBwcmVwYXJhdGlvblxuXHRcdFx0XHR0cmlnZ2VyU2hvd0hvdmVyKDAsIGZvY3VzLCB1bmRlZmluZWQsIGZvY3VzKTsgLy8gc2hvdyBob3ZlciBpbW1lZGlhdGVseVxuXHRcdFx0fSxcblx0XHRcdGhpZGU6ICgpID0+IHtcblx0XHRcdFx0aGlkZUhvdmVyKHRydWUsIHRydWUpO1xuXHRcdFx0fSxcblx0XHRcdHVwZGF0ZTogYXN5bmMgKG5ld0NvbnRlbnQsIGhvdmVyT3B0aW9ucykgPT4ge1xuXHRcdFx0XHRjb250ZW50ID0gbmV3Q29udGVudDtcblx0XHRcdFx0YXdhaXQgaG92ZXJXaWRnZXQ/LnVwZGF0ZShjb250ZW50LCB1bmRlZmluZWQsIGhvdmVyT3B0aW9ucyk7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9tYW5hZ2VkSG92ZXJzLmRlbGV0ZSh0YXJnZXRFbGVtZW50KTtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRoaWRlSG92ZXIodHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLl9tYW5hZ2VkSG92ZXJzLnNldCh0YXJnZXRFbGVtZW50LCBob3Zlcik7XG5cdFx0cmV0dXJuIGhvdmVyO1xuXHR9XG5cblx0c2hvd01hbmFnZWRIb3Zlcih0YXJnZXQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgaG92ZXIgPSB0aGlzLl9tYW5hZ2VkSG92ZXJzLmdldCh0YXJnZXQpO1xuXHRcdGlmIChob3Zlcikge1xuXHRcdFx0aG92ZXIuc2hvdyh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9tYW5hZ2VkSG92ZXJzLmZvckVhY2goaG92ZXIgPT4gaG92ZXIuZGlzcG9zZSgpKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0SG92ZXJPcHRpb25zSWRlbnRpdHkob3B0aW9uczogSUhvdmVyT3B0aW9ucyB8IHVuZGVmaW5lZCk6IElIb3Zlck9wdGlvbnMgfCBudW1iZXIgfCBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAob3B0aW9ucyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gb3B0aW9ucz8uaWQgPz8gb3B0aW9ucztcbn1cblxuZnVuY3Rpb24gZ2V0SG92ZXJJZEZyb21Db250ZW50KGNvbnRlbnQ6IHN0cmluZyB8IEhUTUxFbGVtZW50IHwgSU1hcmtkb3duU3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzSFRNTEVsZW1lbnQoY29udGVudCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gY29udGVudC50b1N0cmluZygpO1xuXHR9XG5cdHJldHVybiBjb250ZW50LnZhbHVlO1xufVxuXG5mdW5jdGlvbiBnZXRTdHJpbmdDb250ZW50KGNvbnRlbnRPckZhY3Rvcnk6IElNYW5hZ2VkSG92ZXJDb250ZW50T3JGYWN0b3J5KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY29udGVudCA9IHR5cGVvZiBjb250ZW50T3JGYWN0b3J5ID09PSAnZnVuY3Rpb24nID8gY29udGVudE9yRmFjdG9yeSgpIDogY29udGVudE9yRmFjdG9yeTtcblx0aWYgKGlzU3RyaW5nKGNvbnRlbnQpKSB7XG5cdFx0Ly8gSWNvbnMgZG9uJ3QgcmVuZGVyIGluIHRoZSBuYXRpdmUgaG92ZXIgc28gd2Ugc3RyaXAgdGhlbSBvdXRcblx0XHRyZXR1cm4gc3RyaXBJY29ucyhjb250ZW50KTtcblx0fVxuXHRpZiAoaXNNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcoY29udGVudCkpIHtcblx0XHRyZXR1cm4gY29udGVudC5tYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNldHVwTmF0aXZlSG92ZXIodGFyZ2V0RWxlbWVudDogSFRNTEVsZW1lbnQsIGNvbnRlbnQ6IElNYW5hZ2VkSG92ZXJDb250ZW50T3JGYWN0b3J5KTogSU1hbmFnZWRIb3ZlciB7XG5cdGZ1bmN0aW9uIHVwZGF0ZVRpdGxlKHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGl0bGUpIHtcblx0XHRcdHRhcmdldEVsZW1lbnQuc2V0QXR0cmlidXRlKCd0aXRsZScsIHRpdGxlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFyZ2V0RWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoJ3RpdGxlJyk7XG5cdFx0fVxuXHR9XG5cblx0dXBkYXRlVGl0bGUoZ2V0U3RyaW5nQ29udGVudChjb250ZW50KSk7XG5cdHJldHVybiB7XG5cdFx0dXBkYXRlOiAoY29udGVudCkgPT4gdXBkYXRlVGl0bGUoZ2V0U3RyaW5nQ29udGVudChjb250ZW50KSksXG5cdFx0c2hvdzogKCkgPT4geyB9LFxuXHRcdGhpZGU6ICgpID0+IHsgfSxcblx0XHRkaXNwb3NlOiAoKSA9PiB1cGRhdGVUaXRsZSh1bmRlZmluZWQpLFxuXHR9O1xufVxuXG5jbGFzcyBIb3ZlckNvbnRleHRWaWV3RGVsZWdhdGUgaW1wbGVtZW50cyBJRGVsZWdhdGUge1xuXG5cdC8vIFJlbmRlciBvdmVyIGFsbCBvdGhlciBjb250ZXh0IHZpZXdzLCB3aXRoIGhpZ2hlciBsYXllcnMgZm9yIG5lc3RlZCBob3ZlcnNcblx0cHVibGljIHJlYWRvbmx5IGxheWVyOiBudW1iZXI7XG5cblx0Z2V0IGFuY2hvclBvc2l0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9ob3Zlci5hbmNob3I7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlcjogSG92ZXJXaWRnZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXM6IGJvb2xlYW4gPSBmYWxzZSxcblx0XHRzdGFja0RlcHRoOiBudW1iZXIgPSAxXG5cdCkge1xuXHRcdC8vIEJhc2UgbGF5ZXIgaXMgMSwgbmVzdGVkIGhvdmVycyBnZXQgaGlnaGVyIGxheWVyc1xuXHRcdHRoaXMubGF5ZXIgPSBzdGFja0RlcHRoO1xuXHR9XG5cblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHR0aGlzLl9ob3Zlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRpZiAodGhpcy5fZm9jdXMpIHtcblx0XHRcdHRoaXMuX2hvdmVyLmZvY3VzKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9ob3Zlcjtcblx0fVxuXG5cdGdldEFuY2hvcigpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0eDogdGhpcy5faG92ZXIueCxcblx0XHRcdHk6IHRoaXMuX2hvdmVyLnlcblx0XHR9O1xuXHR9XG5cblx0bGF5b3V0KCkge1xuXHRcdHRoaXMuX2hvdmVyLmxheW91dCgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGV2ZW50SXNSZWxhdGVkVG9UYXJnZXQoZXZlbnQ6IFVJRXZlbnQsIHRhcmdldDogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzSFRNTEVsZW1lbnQoZXZlbnQudGFyZ2V0KSAmJiBnZXRIb3ZlclRhcmdldEVsZW1lbnQoZXZlbnQudGFyZ2V0LCB0YXJnZXQpID09PSB0YXJnZXQ7XG59XG5cbmZ1bmN0aW9uIGdldEhvdmVyVGFyZ2V0RWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCwgc3RvcEVsZW1lbnQ/OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0c3RvcEVsZW1lbnQgPSBzdG9wRWxlbWVudCA/PyBnZXRXaW5kb3coZWxlbWVudCkuZG9jdW1lbnQuYm9keTtcblx0d2hpbGUgKCFlbGVtZW50Lmhhc0F0dHJpYnV0ZSgnY3VzdG9tLWhvdmVyJykgJiYgZWxlbWVudCAhPT0gc3RvcEVsZW1lbnQpIHtcblx0XHRlbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50ITtcblx0fVxuXHRyZXR1cm4gZWxlbWVudDtcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZU1vdXNlU3R5bGVIb3ZlclRhcmdldCh0YXJnZXQ6IEhUTUxFbGVtZW50LCBlOiBNb3VzZUV2ZW50KTogSUhvdmVyVGFyZ2V0IHtcblx0cmV0dXJuIHtcblx0XHR0YXJnZXRFbGVtZW50czogW3RhcmdldF0sXG5cdFx0eDogZS54ICsgMTBcblx0fTtcbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUhvdmVyU2VydmljZSwgSG92ZXJTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxucmVnaXN0ZXJUaGVtaW5nUGFydGljaXBhbnQoKHRoZW1lLCBjb2xsZWN0b3IpID0+IHtcblx0Y29uc3QgaG92ZXJCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JIb3ZlckJvcmRlcik7XG5cdGlmIChob3ZlckJvcmRlcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWhvdmVyLndvcmtiZW5jaC1ob3ZlciAuaG92ZXItcm93Om5vdCg6Zmlyc3QtY2hpbGQpOm5vdCg6ZW1wdHkpIHsgYm9yZGVyLXRvcDogMXB4IHNvbGlkICR7aG92ZXJCb3JkZXIudHJhbnNwYXJlbnQoMC41KX07IH1gKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLm1vbmFjby1ob3Zlci53b3JrYmVuY2gtaG92ZXIgaHIgeyBib3JkZXItdG9wOiAxcHggc29saWQgJHtob3ZlckJvcmRlci50cmFuc3BhcmVudCgwLjUpfTsgfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYSw4QkFBeUM7QUFDL0QsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyx1QkFBdUIsV0FBVyxrQkFBa0IsMkJBQTJCLFlBQVksV0FBVyxlQUFlLHlCQUF5QjtBQUN2SixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFlBQVksMkNBQXFOO0FBRTFPLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsU0FBUyxvQkFBb0I7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMs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
