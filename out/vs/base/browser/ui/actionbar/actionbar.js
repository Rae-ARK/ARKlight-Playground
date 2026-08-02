import * as DOM from "../../dom.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem } from "./actionViewItems.js";
import { createInstantHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { ActionRunner, Separator } from "../../../common/actions.js";
import { Emitter } from "../../../common/event.js";
import { KeyCode, KeyMod } from "../../../common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, dispose } from "../../../common/lifecycle.js";
import * as types from "../../../common/types.js";
import "./actionbar.css";
var ActionsOrientation = /* @__PURE__ */ ((ActionsOrientation2) => {
  ActionsOrientation2[ActionsOrientation2["HORIZONTAL"] = 0] = "HORIZONTAL";
  ActionsOrientation2[ActionsOrientation2["VERTICAL"] = 1] = "VERTICAL";
  return ActionsOrientation2;
})(ActionsOrientation || {});
class ActionBar extends Disposable {
  constructor(container, options = {}) {
    super();
    this._actionRunnerDisposables = this._register(new DisposableStore());
    this.viewItemDisposables = this._register(new DisposableMap());
    // Trigger Key Tracking
    this.triggerKeyDown = false;
    this.focusable = true;
    this._onDidBlur = this._register(new Emitter());
    this._onDidCancel = this._register(new Emitter({ onWillAddFirstListener: () => this.cancelHasListener = true }));
    this.cancelHasListener = false;
    this._onDidRun = this._register(new Emitter());
    this._onWillRun = this._register(new Emitter());
    this.options = options;
    this._context = options.context ?? null;
    this._orientation = this.options.orientation ?? 0 /* HORIZONTAL */;
    this._triggerKeys = {
      keyDown: this.options.triggerKeys?.keyDown ?? false,
      keys: this.options.triggerKeys?.keys ?? [KeyCode.Enter, KeyCode.Space]
    };
    this._hoverDelegate = options.hoverDelegate ?? this._register(createInstantHoverDelegate());
    if (this.options.actionRunner) {
      this._actionRunner = this.options.actionRunner;
    } else {
      this._actionRunner = new ActionRunner();
      this._actionRunnerDisposables.add(this._actionRunner);
    }
    this._actionRunnerDisposables.add(this._actionRunner.onDidRun((e) => this._onDidRun.fire(e)));
    this._actionRunnerDisposables.add(this._actionRunner.onWillRun((e) => this._onWillRun.fire(e)));
    this._viewItems = [];
    this.focusedItem = void 0;
    this.domNode = document.createElement("div");
    this.domNode.className = "monaco-action-bar";
    let previousKeys;
    let nextKeys;
    switch (this._orientation) {
      case 0 /* HORIZONTAL */:
        previousKeys = [KeyCode.LeftArrow];
        nextKeys = [KeyCode.RightArrow];
        break;
      case 1 /* VERTICAL */:
        previousKeys = [KeyCode.UpArrow];
        nextKeys = [KeyCode.DownArrow];
        this.domNode.className += " vertical";
        break;
    }
    this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = true;
      const focusedItem = typeof this.focusedItem === "number" ? this.viewItems[this.focusedItem] : void 0;
      if (previousKeys && (event.equals(previousKeys[0]) || event.equals(previousKeys[1]))) {
        eventHandled = this.focusPrevious();
      } else if (nextKeys && (event.equals(nextKeys[0]) || event.equals(nextKeys[1]))) {
        eventHandled = this.focusNext();
      } else if (event.equals(KeyCode.Escape) && this.cancelHasListener) {
        this._onDidCancel.fire();
      } else if (event.equals(KeyCode.Home)) {
        eventHandled = this.focusFirst();
      } else if (event.equals(KeyCode.End)) {
        eventHandled = this.focusLast();
      } else if (event.equals(KeyCode.Tab) && focusedItem instanceof BaseActionViewItem && focusedItem.trapsArrowNavigation) {
        eventHandled = this.focusNext(void 0, true);
      } else if (this.isTriggerKeyEvent(event)) {
        if (this._triggerKeys.keyDown) {
          this.doTrigger(event);
        } else {
          this.triggerKeyDown = true;
        }
      } else {
        eventHandled = false;
      }
      if (eventHandled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }));
    this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (this.isTriggerKeyEvent(event)) {
        if (!this._triggerKeys.keyDown && this.triggerKeyDown) {
          this.triggerKeyDown = false;
          this.doTrigger(event);
        }
        event.preventDefault();
        event.stopPropagation();
      } else if (event.equals(KeyCode.Tab) || event.equals(KeyMod.Shift | KeyCode.Tab) || event.equals(KeyCode.UpArrow) || event.equals(KeyCode.DownArrow) || event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.RightArrow)) {
        this.updateFocusedItem();
      }
    }));
    this.focusTracker = this._register(DOM.trackFocus(this.domNode));
    this._register(this.focusTracker.onDidBlur(() => {
      if (DOM.getActiveElement() === this.domNode || !DOM.isAncestor(DOM.getActiveElement(), this.domNode)) {
        this._onDidBlur.fire();
        this.previouslyFocusedItem = this.focusedItem;
        this.focusedItem = void 0;
        this.triggerKeyDown = false;
      }
    }));
    this._register(this.focusTracker.onDidFocus(() => this.updateFocusedItem()));
    this.actionsList = document.createElement("ul");
    this.actionsList.className = "actions-container";
    if (this.options.highlightToggledItems) {
      this.actionsList.classList.add("highlight-toggled");
    }
    this.actionsList.setAttribute("role", this.options.ariaRole || "toolbar");
    if (this.options.ariaLabel) {
      this.actionsList.setAttribute("aria-label", this.options.ariaLabel);
    }
    this.domNode.appendChild(this.actionsList);
    container.appendChild(this.domNode);
  }
  get viewItems() {
    return this._viewItems;
  }
  get onDidBlur() {
    return this._onDidBlur.event;
  }
  get onDidCancel() {
    return this._onDidCancel.event;
  }
  get onDidRun() {
    return this._onDidRun.event;
  }
  get onWillRun() {
    return this._onWillRun.event;
  }
  refreshRole() {
    if (this.length() >= 1) {
      this.actionsList.setAttribute("role", this.options.ariaRole || "toolbar");
    } else {
      this.actionsList.setAttribute("role", "presentation");
    }
  }
  setAriaLabel(label) {
    if (label) {
      this.actionsList.setAttribute("aria-label", label);
    } else {
      this.actionsList.removeAttribute("aria-label");
    }
  }
  // Some action bars should not be focusable at times
  // When an action bar is not focusable make sure to make all the elements inside it not focusable
  // When an action bar is focusable again, make sure the first item can be focused
  setFocusable(focusable) {
    this.focusable = focusable;
    if (this.focusable) {
      const firstEnabled = this.viewItems.find((vi) => vi instanceof BaseActionViewItem && vi.isEnabled());
      if (firstEnabled instanceof BaseActionViewItem) {
        firstEnabled.setFocusable(true);
      }
    } else {
      this.viewItems.forEach((vi) => {
        if (vi instanceof BaseActionViewItem) {
          vi.setFocusable(false);
        }
      });
    }
  }
  isTriggerKeyEvent(event) {
    let ret = false;
    this._triggerKeys.keys.forEach((keyCode) => {
      ret = ret || event.equals(keyCode);
    });
    return ret;
  }
  updateFocusedItem() {
    for (let i = 0; i < this.actionsList.children.length; i++) {
      const elem = this.actionsList.children[i];
      if (DOM.isAncestor(DOM.getActiveElement(), elem)) {
        this.focusedItem = i;
        this.viewItems[this.focusedItem]?.showHover?.();
        break;
      }
    }
  }
  get context() {
    return this._context;
  }
  set context(context) {
    this._context = context;
    this.viewItems.forEach((i) => i.setActionContext(context));
  }
  get actionRunner() {
    return this._actionRunner;
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
    this._actionRunnerDisposables.clear();
    this._actionRunnerDisposables.add(this._actionRunner.onDidRun((e) => this._onDidRun.fire(e)));
    this._actionRunnerDisposables.add(this._actionRunner.onWillRun((e) => this._onWillRun.fire(e)));
    this.viewItems.forEach((item) => item.actionRunner = actionRunner);
  }
  getContainer() {
    return this.domNode;
  }
  hasAction(action) {
    return this.viewItems.findIndex((candidate) => candidate.action.id === action.id) !== -1;
  }
  getAction(indexOrElement) {
    if (typeof indexOrElement === "number") {
      return this.viewItems[indexOrElement]?.action;
    }
    if (DOM.isHTMLElement(indexOrElement)) {
      while (indexOrElement.parentElement !== this.actionsList) {
        if (!indexOrElement.parentElement) {
          return void 0;
        }
        indexOrElement = indexOrElement.parentElement;
      }
      for (let i = 0; i < this.actionsList.childNodes.length; i++) {
        if (this.actionsList.childNodes[i] === indexOrElement) {
          return this.viewItems[i].action;
        }
      }
    }
    return void 0;
  }
  push(arg, options = {}) {
    const actions = Array.isArray(arg) ? arg : [arg];
    let index = types.isNumber(options.index) ? options.index : null;
    actions.forEach((action) => {
      const actionViewItemElement = document.createElement("li");
      actionViewItemElement.className = "action-item";
      actionViewItemElement.setAttribute("role", "presentation");
      let item;
      const viewItemOptions = { hoverDelegate: this._hoverDelegate, ...options, isTabList: this.options.ariaRole === "tablist" };
      if (this.options.actionViewItemProvider) {
        item = this.options.actionViewItemProvider(action, viewItemOptions);
      }
      if (!item) {
        item = new ActionViewItem(this.context, action, viewItemOptions);
      }
      if (!this.options.allowContextMenu) {
        this.viewItemDisposables.set(item, DOM.addDisposableListener(actionViewItemElement, DOM.EventType.CONTEXT_MENU, (e) => {
          DOM.EventHelper.stop(e, true);
        }));
      }
      item.actionRunner = this._actionRunner;
      item.setActionContext(this.context);
      item.render(actionViewItemElement);
      if (index === null || index < 0 || index >= this.actionsList.children.length) {
        this.actionsList.appendChild(actionViewItemElement);
        this._viewItems.push(item);
      } else {
        this.actionsList.insertBefore(actionViewItemElement, this.actionsList.children[index]);
        this._viewItems.splice(index, 0, item);
        index++;
      }
    });
    if (this.focusable) {
      let didFocus = false;
      for (const item of this.viewItems) {
        if (!(item instanceof BaseActionViewItem)) {
          continue;
        }
        let focus;
        if (didFocus) {
          focus = false;
        } else if (item.action.id === Separator.ID) {
          focus = false;
        } else if (!item.isEnabled() && this.options.focusOnlyEnabledItems) {
          focus = false;
        } else {
          focus = true;
        }
        if (focus) {
          item.setFocusable(true);
          didFocus = true;
        } else {
          item.setFocusable(false);
        }
      }
    }
    if (typeof this.focusedItem === "number") {
      this.focus(this.focusedItem);
    }
    this.refreshRole();
  }
  getWidth(index) {
    return this.actionsList.children.item(index)?.clientWidth ?? 0;
  }
  getHeight(index) {
    return this.actionsList.children.item(index)?.clientHeight ?? 0;
  }
  pull(index) {
    if (index >= 0 && index < this.viewItems.length) {
      this.actionsList.childNodes[index].remove();
      this.viewItemDisposables.deleteAndDispose(this.viewItems[index]);
      dispose(this._viewItems.splice(index, 1));
      this.refreshRole();
    }
  }
  clear() {
    if (this.isEmpty()) {
      return;
    }
    this._viewItems = dispose(this._viewItems);
    this.viewItemDisposables.clearAndDisposeAll();
    DOM.clearNode(this.actionsList);
    this.refreshRole();
  }
  length() {
    return this.viewItems.length;
  }
  isEmpty() {
    return this.viewItems.length === 0;
  }
  isFocused(index) {
    return index === void 0 ? DOM.isAncestor(DOM.getActiveElement(), this.domNode) : DOM.isAncestor(DOM.getActiveElement(), this.actionsList.children[index]);
  }
  focus(arg) {
    let selectFirst = false;
    let index = void 0;
    if (arg === void 0) {
      selectFirst = true;
    } else if (typeof arg === "number") {
      index = arg;
    } else if (typeof arg === "boolean") {
      selectFirst = arg;
    }
    if (selectFirst && typeof this.focusedItem === "undefined") {
      const firstEnabled = this.viewItems.findIndex((item) => item.isEnabled());
      this.focusedItem = firstEnabled === -1 ? void 0 : firstEnabled;
      this.updateFocus(void 0, void 0, true);
    } else {
      if (index !== void 0) {
        this.focusedItem = index;
      }
      this.updateFocus(void 0, void 0, true);
    }
  }
  focusFirst() {
    this.focusedItem = this.length() - 1;
    return this.focusNext(true);
  }
  focusLast() {
    this.focusedItem = 0;
    return this.focusPrevious(true);
  }
  focusNext(forceLoop, forceFocus) {
    if (typeof this.focusedItem === "undefined") {
      this.focusedItem = this.viewItems.length - 1;
    } else if (this.viewItems.length <= 1) {
      return false;
    }
    const startIndex = this.focusedItem;
    let item;
    do {
      if (!forceLoop && this.options.preventLoopNavigation && this.focusedItem + 1 >= this.viewItems.length) {
        this.focusedItem = startIndex;
        return false;
      }
      this.focusedItem = (this.focusedItem + 1) % this.viewItems.length;
      item = this.viewItems[this.focusedItem];
    } while (this.focusedItem !== startIndex && (this.options.focusOnlyEnabledItems && !item.isEnabled() || item.action.id === Separator.ID));
    this.updateFocus(void 0, void 0, forceFocus);
    return true;
  }
  focusPrevious(forceLoop) {
    if (typeof this.focusedItem === "undefined") {
      this.focusedItem = 0;
    } else if (this.viewItems.length <= 1) {
      return false;
    }
    const startIndex = this.focusedItem;
    let item;
    do {
      this.focusedItem = this.focusedItem - 1;
      if (this.focusedItem < 0) {
        if (!forceLoop && this.options.preventLoopNavigation) {
          this.focusedItem = startIndex;
          return false;
        }
        this.focusedItem = this.viewItems.length - 1;
      }
      item = this.viewItems[this.focusedItem];
    } while (this.focusedItem !== startIndex && (this.options.focusOnlyEnabledItems && !item.isEnabled() || item.action.id === Separator.ID));
    this.updateFocus(true);
    return true;
  }
  updateFocus(fromRight, preventScroll, forceFocus = false) {
    if (typeof this.focusedItem === "undefined") {
      this.actionsList.focus({ preventScroll });
    }
    if (this.previouslyFocusedItem !== void 0 && this.previouslyFocusedItem !== this.focusedItem) {
      this.viewItems[this.previouslyFocusedItem]?.blur();
    }
    const actionViewItem = this.focusedItem !== void 0 ? this.viewItems[this.focusedItem] : void 0;
    if (actionViewItem) {
      let focusItem = true;
      if (!types.isFunction(actionViewItem.focus)) {
        focusItem = false;
      }
      if (this.options.focusOnlyEnabledItems && types.isFunction(actionViewItem.isEnabled) && !actionViewItem.isEnabled()) {
        focusItem = false;
      }
      if (actionViewItem.action.id === Separator.ID) {
        focusItem = false;
      }
      if (!focusItem) {
        this.actionsList.focus({ preventScroll });
        this.previouslyFocusedItem = void 0;
      } else if (forceFocus || this.previouslyFocusedItem !== this.focusedItem) {
        actionViewItem.focus(fromRight);
        this.previouslyFocusedItem = this.focusedItem;
      }
      if (focusItem) {
        actionViewItem.showHover?.();
      }
    }
  }
  doTrigger(event) {
    if (typeof this.focusedItem === "undefined") {
      return;
    }
    const actionViewItem = this.viewItems[this.focusedItem];
    if (actionViewItem instanceof BaseActionViewItem) {
      const context = actionViewItem._context === null || actionViewItem._context === void 0 ? event : actionViewItem._context;
      this.run(actionViewItem._action, context);
    }
  }
  async run(action, context) {
    await this._actionRunner.run(action, context);
  }
  dispose() {
    this._context = void 0;
    this._viewItems = dispose(this._viewItems);
    this.getContainer().remove();
    super.dispose();
  }
}
function prepareActions(actions) {
  if (!actions.length) {
    return actions;
  }
  let firstIndexOfAction = -1;
  for (let i = 0; i < actions.length; i++) {
    if (actions[i].id === Separator.ID) {
      continue;
    }
    firstIndexOfAction = i;
    break;
  }
  if (firstIndexOfAction === -1) {
    return [];
  }
  actions = actions.slice(firstIndexOfAction);
  for (let h = actions.length - 1; h >= 0; h--) {
    const isSeparator = actions[h].id === Separator.ID;
    if (isSeparator) {
      actions.splice(h, 1);
    } else {
      break;
    }
  }
  let foundAction = false;
  for (let k = actions.length - 1; k >= 0; k--) {
    const isSeparator = actions[k].id === Separator.ID;
    if (isSeparator && !foundAction) {
      actions.splice(k, 1);
    } else if (!isSeparator) {
      foundAction = true;
    } else if (isSeparator) {
      foundAction = false;
    }
  }
  return actions;
}
export {
  ActionBar,
  ActionsOrientation,
  prepareActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXIsIElBY3Rpb24sIElBY3Rpb25SdW5uZXIsIElSdW5FdmVudCwgU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgdHlwZXMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAnLi9hY3Rpb25iYXIuY3NzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cdGFjdGlvbjogSUFjdGlvbjtcblx0YWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyO1xuXHRzZXRBY3Rpb25Db250ZXh0KGNvbnRleHQ6IHVua25vd24pOiB2b2lkO1xuXHRyZW5kZXIoZWxlbWVudDogSFRNTEVsZW1lbnQpOiB2b2lkO1xuXHRpc0VuYWJsZWQoKTogYm9vbGVhbjtcblx0Zm9jdXMoZnJvbVJpZ2h0PzogYm9vbGVhbik6IHZvaWQ7IC8vIFRPRE9AaXNpZG9ybiB3aGF0IGlzIHRoaXM/XG5cdGJsdXIoKTogdm9pZDtcblx0c2hvd0hvdmVyPygpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIHtcblx0KGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyk6IElBY3Rpb25WaWV3SXRlbSB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWN0aW9uc09yaWVudGF0aW9uIHtcblx0SE9SSVpPTlRBTCxcblx0VkVSVElDQUwsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQWN0aW9uVHJpZ2dlciB7XG5cdGtleXM/OiBLZXlDb2RlW107XG5cdGtleURvd246IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkJhck9wdGlvbnMge1xuXHRyZWFkb25seSBvcmllbnRhdGlvbj86IEFjdGlvbnNPcmllbnRhdGlvbjtcblx0cmVhZG9ubHkgY29udGV4dD86IHVua25vd247XG5cdHJlYWRvbmx5IGFjdGlvblZpZXdJdGVtUHJvdmlkZXI/OiBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlcjtcblx0cmVhZG9ubHkgYWN0aW9uUnVubmVyPzogSUFjdGlvblJ1bm5lcjtcblx0cmVhZG9ubHkgYXJpYUxhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBhcmlhUm9sZT86IHN0cmluZztcblx0cmVhZG9ubHkgdHJpZ2dlcktleXM/OiBBY3Rpb25UcmlnZ2VyO1xuXHRyZWFkb25seSBhbGxvd0NvbnRleHRNZW51PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHJldmVudExvb3BOYXZpZ2F0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZm9jdXNPbmx5RW5hYmxlZEl0ZW1zPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZT86IElIb3ZlckRlbGVnYXRlO1xuXHQvKipcblx0ICogSWYgdHJ1ZSwgdG9nZ2xlZCBwcmltYXJ5IGl0ZW1zIGFyZSBoaWdobGlnaHRlZCB3aXRoIGEgYmFja2dyb3VuZCBjb2xvci5cblx0ICogU29tZSBhY3Rpb24gYmFycyBleGNsdXNpdmVseSB1c2UgaWNvbiBzdGF0ZXMsIHdlIGRvbid0IHdhbnQgdG8gZW5hYmxlIHRoaXMgZm9yIHRoZW0uXG5cdCAqIFRodXMsIHRoaXMgaXMgb3B0LWluLlxuXHQgKi9cblx0cmVhZG9ubHkgaGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uT3B0aW9ucyBleHRlbmRzIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMge1xuXHRpbmRleD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIEFjdGlvbkJhciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWN0aW9uUnVubmVyIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IElBY3Rpb25CYXJPcHRpb25zO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZTtcblxuXHRwcml2YXRlIF9hY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvblJ1bm5lckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBfY29udGV4dDogdW5rbm93bjtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZW50YXRpb246IEFjdGlvbnNPcmllbnRhdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJpZ2dlcktleXM6IHtcblx0XHRrZXlzOiBLZXlDb2RlW107XG5cdFx0a2V5RG93bjogYm9vbGVhbjtcblx0fTtcblxuXHQvLyBWaWV3IEl0ZW1zXG5cdHByaXZhdGUgX3ZpZXdJdGVtczogSUFjdGlvblZpZXdJdGVtW107XG5cdGdldCB2aWV3SXRlbXMoKTogcmVhZG9ubHkgSUFjdGlvblZpZXdJdGVtW10geyByZXR1cm4gdGhpcy5fdmlld0l0ZW1zOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3SXRlbURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8SUFjdGlvblZpZXdJdGVtPigpKTtcblx0cHJpdmF0ZSBwcmV2aW91c2x5Rm9jdXNlZEl0ZW0/OiBudW1iZXI7XG5cdHByb3RlY3RlZCBmb2N1c2VkSXRlbT86IG51bWJlcjtcblx0cHJpdmF0ZSBmb2N1c1RyYWNrZXI6IERPTS5JRm9jdXNUcmFja2VyO1xuXG5cdC8vIFRyaWdnZXIgS2V5IFRyYWNraW5nXG5cdHByaXZhdGUgdHJpZ2dlcktleURvd246IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIGZvY3VzYWJsZTogYm9vbGVhbiA9IHRydWU7XG5cblx0Ly8gRWxlbWVudHNcblx0cmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBhY3Rpb25zTGlzdDogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRCbHVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZEJsdXIoKSB7IHJldHVybiB0aGlzLl9vbkRpZEJsdXIuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENhbmNlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KHsgb25XaWxsQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4gdGhpcy5jYW5jZWxIYXNMaXN0ZW5lciA9IHRydWUgfSkpO1xuXHRnZXQgb25EaWRDYW5jZWwoKSB7IHJldHVybiB0aGlzLl9vbkRpZENhbmNlbC5ldmVudDsgfVxuXHRwcml2YXRlIGNhbmNlbEhhc0xpc3RlbmVyID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSdW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUnVuRXZlbnQ+KCkpO1xuXHRnZXQgb25EaWRSdW4oKSB7IHJldHVybiB0aGlzLl9vbkRpZFJ1bi5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbFJ1biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElSdW5FdmVudD4oKSk7XG5cdGdldCBvbldpbGxSdW4oKSB7IHJldHVybiB0aGlzLl9vbldpbGxSdW4uZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJQWN0aW9uQmFyT3B0aW9ucyA9IHt9KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5fY29udGV4dCA9IG9wdGlvbnMuY29udGV4dCA/PyBudWxsO1xuXHRcdHRoaXMuX29yaWVudGF0aW9uID0gdGhpcy5vcHRpb25zLm9yaWVudGF0aW9uID8/IEFjdGlvbnNPcmllbnRhdGlvbi5IT1JJWk9OVEFMO1xuXHRcdHRoaXMuX3RyaWdnZXJLZXlzID0ge1xuXHRcdFx0a2V5RG93bjogdGhpcy5vcHRpb25zLnRyaWdnZXJLZXlzPy5rZXlEb3duID8/IGZhbHNlLFxuXHRcdFx0a2V5czogdGhpcy5vcHRpb25zLnRyaWdnZXJLZXlzPy5rZXlzID8/IFtLZXlDb2RlLkVudGVyLCBLZXlDb2RlLlNwYWNlXVxuXHRcdH07XG5cblx0XHR0aGlzLl9ob3ZlckRlbGVnYXRlID0gb3B0aW9ucy5ob3ZlckRlbGVnYXRlID8/IHRoaXMuX3JlZ2lzdGVyKGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlKCkpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hY3Rpb25SdW5uZXIpIHtcblx0XHRcdHRoaXMuX2FjdGlvblJ1bm5lciA9IHRoaXMub3B0aW9ucy5hY3Rpb25SdW5uZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2FjdGlvblJ1bm5lciA9IG5ldyBBY3Rpb25SdW5uZXIoKTtcblx0XHRcdHRoaXMuX2FjdGlvblJ1bm5lckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9hY3Rpb25SdW5uZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2FjdGlvblJ1bm5lckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9hY3Rpb25SdW5uZXIub25EaWRSdW4oZSA9PiB0aGlzLl9vbkRpZFJ1bi5maXJlKGUpKSk7XG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2FjdGlvblJ1bm5lci5vbldpbGxSdW4oZSA9PiB0aGlzLl9vbldpbGxSdW4uZmlyZShlKSkpO1xuXG5cdFx0dGhpcy5fdmlld0l0ZW1zID0gW107XG5cdFx0dGhpcy5mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc05hbWUgPSAnbW9uYWNvLWFjdGlvbi1iYXInO1xuXG5cdFx0bGV0IHByZXZpb3VzS2V5czogS2V5Q29kZVtdO1xuXHRcdGxldCBuZXh0S2V5czogS2V5Q29kZVtdO1xuXG5cdFx0c3dpdGNoICh0aGlzLl9vcmllbnRhdGlvbikge1xuXHRcdFx0Y2FzZSBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTDpcblx0XHRcdFx0cHJldmlvdXNLZXlzID0gW0tleUNvZGUuTGVmdEFycm93XTtcblx0XHRcdFx0bmV4dEtleXMgPSBbS2V5Q29kZS5SaWdodEFycm93XTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvbnNPcmllbnRhdGlvbi5WRVJUSUNBTDpcblx0XHRcdFx0cHJldmlvdXNLZXlzID0gW0tleUNvZGUuVXBBcnJvd107XG5cdFx0XHRcdG5leHRLZXlzID0gW0tleUNvZGUuRG93bkFycm93XTtcblx0XHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTmFtZSArPSAnIHZlcnRpY2FsJztcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0bGV0IGV2ZW50SGFuZGxlZCA9IHRydWU7XG5cdFx0XHRjb25zdCBmb2N1c2VkSXRlbSA9IHR5cGVvZiB0aGlzLmZvY3VzZWRJdGVtID09PSAnbnVtYmVyJyA/IHRoaXMudmlld0l0ZW1zW3RoaXMuZm9jdXNlZEl0ZW1dIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAocHJldmlvdXNLZXlzICYmIChldmVudC5lcXVhbHMocHJldmlvdXNLZXlzWzBdKSB8fCBldmVudC5lcXVhbHMocHJldmlvdXNLZXlzWzFdKSkpIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gdGhpcy5mb2N1c1ByZXZpb3VzKCk7XG5cdFx0XHR9IGVsc2UgaWYgKG5leHRLZXlzICYmIChldmVudC5lcXVhbHMobmV4dEtleXNbMF0pIHx8IGV2ZW50LmVxdWFscyhuZXh0S2V5c1sxXSkpKSB7XG5cdFx0XHRcdGV2ZW50SGFuZGxlZCA9IHRoaXMuZm9jdXNOZXh0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkgJiYgdGhpcy5jYW5jZWxIYXNMaXN0ZW5lcikge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENhbmNlbC5maXJlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkhvbWUpKSB7XG5cdFx0XHRcdGV2ZW50SGFuZGxlZCA9IHRoaXMuZm9jdXNGaXJzdCgpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbmQpKSB7XG5cdFx0XHRcdGV2ZW50SGFuZGxlZCA9IHRoaXMuZm9jdXNMYXN0KCk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlRhYikgJiYgZm9jdXNlZEl0ZW0gaW5zdGFuY2VvZiBCYXNlQWN0aW9uVmlld0l0ZW0gJiYgZm9jdXNlZEl0ZW0udHJhcHNBcnJvd05hdmlnYXRpb24pIHtcblx0XHRcdFx0Ly8gVGFiLCBzbyBmb3JjaWJseSBmb2N1cyBuZXh0ICMyMTkxOTlcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gdGhpcy5mb2N1c05leHQodW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5pc1RyaWdnZXJLZXlFdmVudChldmVudCkpIHtcblx0XHRcdFx0Ly8gU3RheWluZyBvdXQgb2YgdGhlIGVsc2UgYnJhbmNoIGV2ZW4gaWYgbm90IHRyaWdnZXJlZFxuXHRcdFx0XHRpZiAodGhpcy5fdHJpZ2dlcktleXMua2V5RG93bikge1xuXHRcdFx0XHRcdHRoaXMuZG9UcmlnZ2VyKGV2ZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXJLZXlEb3duID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChldmVudEhhbmRsZWQpIHtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIERPTS5FdmVudFR5cGUuS0VZX1VQLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0Ly8gUnVuIGFjdGlvbiBvbiBFbnRlci9TcGFjZVxuXHRcdFx0aWYgKHRoaXMuaXNUcmlnZ2VyS2V5RXZlbnQoZXZlbnQpKSB7XG5cdFx0XHRcdGlmICghdGhpcy5fdHJpZ2dlcktleXMua2V5RG93biAmJiB0aGlzLnRyaWdnZXJLZXlEb3duKSB7XG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyS2V5RG93biA9IGZhbHNlO1xuXHRcdFx0XHRcdHRoaXMuZG9UcmlnZ2VyKGV2ZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZWNvbXB1dGUgZm9jdXNlZCBpdGVtXG5cdFx0XHRlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5UYWIpIHx8IGV2ZW50LmVxdWFscyhLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlRhYikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuVXBBcnJvdykgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuRG93bkFycm93KSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRm9jdXNlZEl0ZW0oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKERPTS50cmFja0ZvY3VzKHRoaXMuZG9tTm9kZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHRpZiAoRE9NLmdldEFjdGl2ZUVsZW1lbnQoKSA9PT0gdGhpcy5kb21Ob2RlIHx8ICFET00uaXNBbmNlc3RvcihET00uZ2V0QWN0aXZlRWxlbWVudCgpLCB0aGlzLmRvbU5vZGUpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQmx1ci5maXJlKCk7XG5cdFx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWRJdGVtID0gdGhpcy5mb2N1c2VkSXRlbTtcblx0XHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy50cmlnZ2VyS2V5RG93biA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy51cGRhdGVGb2N1c2VkSXRlbSgpKSk7XG5cblx0XHR0aGlzLmFjdGlvbnNMaXN0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKTtcblx0XHR0aGlzLmFjdGlvbnNMaXN0LmNsYXNzTmFtZSA9ICdhY3Rpb25zLWNvbnRhaW5lcic7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5oaWdobGlnaHRUb2dnbGVkSXRlbXMpIHtcblx0XHRcdHRoaXMuYWN0aW9uc0xpc3QuY2xhc3NMaXN0LmFkZCgnaGlnaGxpZ2h0LXRvZ2dsZWQnKTtcblx0XHR9XG5cdFx0dGhpcy5hY3Rpb25zTGlzdC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCB0aGlzLm9wdGlvbnMuYXJpYVJvbGUgfHwgJ3Rvb2xiYXInKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuYXJpYUxhYmVsKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNMaXN0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMub3B0aW9ucy5hcmlhTGFiZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMuZG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLmFjdGlvbnNMaXN0KTtcblxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLmRvbU5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoUm9sZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sZW5ndGgoKSA+PSAxKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNMaXN0LnNldEF0dHJpYnV0ZSgncm9sZScsIHRoaXMub3B0aW9ucy5hcmlhUm9sZSB8fCAndG9vbGJhcicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNMaXN0LnNldEF0dHJpYnV0ZSgncm9sZScsICdwcmVzZW50YXRpb24nKTtcblx0XHR9XG5cdH1cblxuXHRzZXRBcmlhTGFiZWwobGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChsYWJlbCkge1xuXHRcdFx0dGhpcy5hY3Rpb25zTGlzdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYWN0aW9uc0xpc3QucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gU29tZSBhY3Rpb24gYmFycyBzaG91bGQgbm90IGJlIGZvY3VzYWJsZSBhdCB0aW1lc1xuXHQvLyBXaGVuIGFuIGFjdGlvbiBiYXIgaXMgbm90IGZvY3VzYWJsZSBtYWtlIHN1cmUgdG8gbWFrZSBhbGwgdGhlIGVsZW1lbnRzIGluc2lkZSBpdCBub3QgZm9jdXNhYmxlXG5cdC8vIFdoZW4gYW4gYWN0aW9uIGJhciBpcyBmb2N1c2FibGUgYWdhaW4sIG1ha2Ugc3VyZSB0aGUgZmlyc3QgaXRlbSBjYW4gYmUgZm9jdXNlZFxuXHRzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5mb2N1c2FibGUgPSBmb2N1c2FibGU7XG5cdFx0aWYgKHRoaXMuZm9jdXNhYmxlKSB7XG5cdFx0XHRjb25zdCBmaXJzdEVuYWJsZWQgPSB0aGlzLnZpZXdJdGVtcy5maW5kKHZpID0+IHZpIGluc3RhbmNlb2YgQmFzZUFjdGlvblZpZXdJdGVtICYmIHZpLmlzRW5hYmxlZCgpKTtcblx0XHRcdGlmIChmaXJzdEVuYWJsZWQgaW5zdGFuY2VvZiBCYXNlQWN0aW9uVmlld0l0ZW0pIHtcblx0XHRcdFx0Zmlyc3RFbmFibGVkLnNldEZvY3VzYWJsZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy52aWV3SXRlbXMuZm9yRWFjaCh2aSA9PiB7XG5cdFx0XHRcdGlmICh2aSBpbnN0YW5jZW9mIEJhc2VBY3Rpb25WaWV3SXRlbSkge1xuXHRcdFx0XHRcdHZpLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaXNUcmlnZ2VyS2V5RXZlbnQoZXZlbnQ6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGxldCByZXQgPSBmYWxzZTtcblx0XHR0aGlzLl90cmlnZ2VyS2V5cy5rZXlzLmZvckVhY2goa2V5Q29kZSA9PiB7XG5cdFx0XHRyZXQgPSByZXQgfHwgZXZlbnQuZXF1YWxzKGtleUNvZGUpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHJldDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRm9jdXNlZEl0ZW0oKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbGVtID0gdGhpcy5hY3Rpb25zTGlzdC5jaGlsZHJlbltpXTtcblx0XHRcdGlmIChET00uaXNBbmNlc3RvcihET00uZ2V0QWN0aXZlRWxlbWVudCgpLCBlbGVtKSkge1xuXHRcdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gaTtcblx0XHRcdFx0dGhpcy52aWV3SXRlbXNbdGhpcy5mb2N1c2VkSXRlbV0/LnNob3dIb3Zlcj8uKCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldCBjb250ZXh0KCk6IHVua25vd24ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZXh0O1xuXHR9XG5cblx0c2V0IGNvbnRleHQoY29udGV4dDogdW5rbm93bikge1xuXHRcdHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMudmlld0l0ZW1zLmZvckVhY2goaSA9PiBpLnNldEFjdGlvbkNvbnRleHQoY29udGV4dCkpO1xuXHR9XG5cblx0Z2V0IGFjdGlvblJ1bm5lcigpOiBJQWN0aW9uUnVubmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uUnVubmVyO1xuXHR9XG5cblx0c2V0IGFjdGlvblJ1bm5lcihhY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXIpIHtcblx0XHR0aGlzLl9hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXI7XG5cblx0XHQvLyB3aGVuIHNldHRpbmcgYSBuZXcgYElBY3Rpb25SdW5uZXJgIG1ha2Ugc3VyZSB0byBkaXNwb3NlIG9sZCBsaXN0ZW5lcnMgYW5kXG5cdFx0Ly8gc3RhcnQgdG8gZm9yd2FyZCBldmVudHMgZnJvbSB0aGUgbmV3IGxpc3RlbmVyXG5cdFx0dGhpcy5fYWN0aW9uUnVubmVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9hY3Rpb25SdW5uZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5fYWN0aW9uUnVubmVyLm9uRGlkUnVuKGUgPT4gdGhpcy5fb25EaWRSdW4uZmlyZShlKSkpO1xuXHRcdHRoaXMuX2FjdGlvblJ1bm5lckRpc3Bvc2FibGVzLmFkZCh0aGlzLl9hY3Rpb25SdW5uZXIub25XaWxsUnVuKGUgPT4gdGhpcy5fb25XaWxsUnVuLmZpcmUoZSkpKTtcblx0XHR0aGlzLnZpZXdJdGVtcy5mb3JFYWNoKGl0ZW0gPT4gaXRlbS5hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXIpO1xuXHR9XG5cblx0Z2V0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlO1xuXHR9XG5cblx0aGFzQWN0aW9uKGFjdGlvbjogSUFjdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdJdGVtcy5maW5kSW5kZXgoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5hY3Rpb24uaWQgPT09IGFjdGlvbi5pZCkgIT09IC0xO1xuXHR9XG5cblx0Z2V0QWN0aW9uKGluZGV4T3JFbGVtZW50OiBudW1iZXIgfCBIVE1MRWxlbWVudCk6IElBY3Rpb24gfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gYnkgaW5kZXhcblx0XHRpZiAodHlwZW9mIGluZGV4T3JFbGVtZW50ID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMudmlld0l0ZW1zW2luZGV4T3JFbGVtZW50XT8uYWN0aW9uO1xuXHRcdH1cblxuXHRcdC8vIGJ5IGVsZW1lbnRcblx0XHRpZiAoRE9NLmlzSFRNTEVsZW1lbnQoaW5kZXhPckVsZW1lbnQpKSB7XG5cdFx0XHR3aGlsZSAoaW5kZXhPckVsZW1lbnQucGFyZW50RWxlbWVudCAhPT0gdGhpcy5hY3Rpb25zTGlzdCkge1xuXHRcdFx0XHRpZiAoIWluZGV4T3JFbGVtZW50LnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGluZGV4T3JFbGVtZW50ID0gaW5kZXhPckVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0XHRcdH1cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5hY3Rpb25zTGlzdC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLmFjdGlvbnNMaXN0LmNoaWxkTm9kZXNbaV0gPT09IGluZGV4T3JFbGVtZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudmlld0l0ZW1zW2ldLmFjdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdXNoKGFyZzogSUFjdGlvbiB8IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4sIG9wdGlvbnM6IElBY3Rpb25PcHRpb25zID0ge30pOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb25zOiBSZWFkb25seUFycmF5PElBY3Rpb24+ID0gQXJyYXkuaXNBcnJheShhcmcpID8gYXJnIDogW2FyZ107XG5cblx0XHRsZXQgaW5kZXggPSB0eXBlcy5pc051bWJlcihvcHRpb25zLmluZGV4KSA/IG9wdGlvbnMuaW5kZXggOiBudWxsO1xuXG5cdFx0YWN0aW9ucy5mb3JFYWNoKChhY3Rpb246IElBY3Rpb24pID0+IHtcblx0XHRcdGNvbnN0IGFjdGlvblZpZXdJdGVtRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpJyk7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbUVsZW1lbnQuY2xhc3NOYW1lID0gJ2FjdGlvbi1pdGVtJztcblx0XHRcdGFjdGlvblZpZXdJdGVtRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncHJlc2VudGF0aW9uJyk7XG5cblx0XHRcdGxldCBpdGVtOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IHZpZXdJdGVtT3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucyA9IHsgaG92ZXJEZWxlZ2F0ZTogdGhpcy5faG92ZXJEZWxlZ2F0ZSwgLi4ub3B0aW9ucywgaXNUYWJMaXN0OiB0aGlzLm9wdGlvbnMuYXJpYVJvbGUgPT09ICd0YWJsaXN0JyB9O1xuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyKSB7XG5cdFx0XHRcdGl0ZW0gPSB0aGlzLm9wdGlvbnMuYWN0aW9uVmlld0l0ZW1Qcm92aWRlcihhY3Rpb24sIHZpZXdJdGVtT3B0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRpdGVtID0gbmV3IEFjdGlvblZpZXdJdGVtKHRoaXMuY29udGV4dCwgYWN0aW9uLCB2aWV3SXRlbU9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQcmV2ZW50IG5hdGl2ZSBjb250ZXh0IG1lbnUgb24gYWN0aW9uc1xuXHRcdFx0aWYgKCF0aGlzLm9wdGlvbnMuYWxsb3dDb250ZXh0TWVudSkge1xuXHRcdFx0XHR0aGlzLnZpZXdJdGVtRGlzcG9zYWJsZXMuc2V0KGl0ZW0sIERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoYWN0aW9uVmlld0l0ZW1FbGVtZW50LCBET00uRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgKGU6IERPTS5FdmVudExpa2UpID0+IHtcblx0XHRcdFx0XHRET00uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpdGVtLmFjdGlvblJ1bm5lciA9IHRoaXMuX2FjdGlvblJ1bm5lcjtcblx0XHRcdGl0ZW0uc2V0QWN0aW9uQ29udGV4dCh0aGlzLmNvbnRleHQpO1xuXHRcdFx0aXRlbS5yZW5kZXIoYWN0aW9uVmlld0l0ZW1FbGVtZW50KTtcblxuXHRcdFx0aWYgKGluZGV4ID09PSBudWxsIHx8IGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuLmxlbmd0aCkge1xuXHRcdFx0XHR0aGlzLmFjdGlvbnNMaXN0LmFwcGVuZENoaWxkKGFjdGlvblZpZXdJdGVtRWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX3ZpZXdJdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hY3Rpb25zTGlzdC5pbnNlcnRCZWZvcmUoYWN0aW9uVmlld0l0ZW1FbGVtZW50LCB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuW2luZGV4XSk7XG5cdFx0XHRcdHRoaXMuX3ZpZXdJdGVtcy5zcGxpY2UoaW5kZXgsIDAsIGl0ZW0pO1xuXHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gV2UgbmVlZCB0byBhbGxvdyBmb3IgdGhlIGZpcnN0IGVuYWJsZWQgaXRlbSB0byBiZSBmb2N1c2VkIG9uIHVzaW5nIHRhYiBuYXZpZ2F0aW9uICMxMDY0NDFcblx0XHRpZiAodGhpcy5mb2N1c2FibGUpIHtcblx0XHRcdGxldCBkaWRGb2N1cyA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMudmlld0l0ZW1zKSB7XG5cdFx0XHRcdGlmICghKGl0ZW0gaW5zdGFuY2VvZiBCYXNlQWN0aW9uVmlld0l0ZW0pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgZm9jdXM6IGJvb2xlYW47XG5cdFx0XHRcdGlmIChkaWRGb2N1cykge1xuXHRcdFx0XHRcdGZvY3VzID0gZmFsc2U7IC8vIGFscmVhZHkgZm9jdXNlZCBhbiBpdGVtXG5cdFx0XHRcdH0gZWxzZSBpZiAoaXRlbS5hY3Rpb24uaWQgPT09IFNlcGFyYXRvci5JRCkge1xuXHRcdFx0XHRcdGZvY3VzID0gZmFsc2U7IC8vIG5ldmVyIGZvY3VzIGEgc2VwYXJhdG9yXG5cdFx0XHRcdH0gZWxzZSBpZiAoIWl0ZW0uaXNFbmFibGVkKCkgJiYgdGhpcy5vcHRpb25zLmZvY3VzT25seUVuYWJsZWRJdGVtcykge1xuXHRcdFx0XHRcdGZvY3VzID0gZmFsc2U7IC8vIG5ldmVyIGZvY3VzIGEgZGlzYWJsZWQgaXRlbVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGZvY3VzID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdGl0ZW0uc2V0Rm9jdXNhYmxlKHRydWUpO1xuXHRcdFx0XHRcdGRpZEZvY3VzID0gdHJ1ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpdGVtLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuZm9jdXNlZEl0ZW0gPT09ICdudW1iZXInKSB7XG5cdFx0XHQvLyBBZnRlciBhIGNsZWFyIGFjdGlvbnMgbWlnaHQgYmUgcmUtYWRkZWQgdG8gc2ltcGx5IHRvZ2dsZSBzb21lIGFjdGlvbnMuIFdlIHNob3VsZCBwcmVzZXJ2ZSBmb2N1cyAjOTcxMjhcblx0XHRcdHRoaXMuZm9jdXModGhpcy5mb2N1c2VkSXRlbSk7XG5cdFx0fVxuXHRcdHRoaXMucmVmcmVzaFJvbGUoKTtcblx0fVxuXG5cdGdldFdpZHRoKGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuLml0ZW0oaW5kZXgpPy5jbGllbnRXaWR0aCA/PyAwO1xuXHR9XG5cblx0Z2V0SGVpZ2h0KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuLml0ZW0oaW5kZXgpPy5jbGllbnRIZWlnaHQgPz8gMDtcblx0fVxuXG5cdHB1bGwoaW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmFjdGlvbnNMaXN0LmNoaWxkTm9kZXNbaW5kZXhdLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy52aWV3SXRlbURpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UodGhpcy52aWV3SXRlbXNbaW5kZXhdKTtcblx0XHRcdGRpc3Bvc2UodGhpcy5fdmlld0l0ZW1zLnNwbGljZShpbmRleCwgMSkpO1xuXHRcdFx0dGhpcy5yZWZyZXNoUm9sZSgpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3ZpZXdJdGVtcyA9IGRpc3Bvc2UodGhpcy5fdmlld0l0ZW1zKTtcblx0XHR0aGlzLnZpZXdJdGVtRGlzcG9zYWJsZXMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmFjdGlvbnNMaXN0KTtcblx0XHR0aGlzLnJlZnJlc2hSb2xlKCk7XG5cdH1cblxuXHRsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3SXRlbXMubGVuZ3RoO1xuXHR9XG5cblx0aXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3SXRlbXMubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0aXNGb2N1c2VkKGluZGV4PzogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGluZGV4ID09PSB1bmRlZmluZWRcblx0XHRcdD8gRE9NLmlzQW5jZXN0b3IoRE9NLmdldEFjdGl2ZUVsZW1lbnQoKSwgdGhpcy5kb21Ob2RlKVxuXHRcdFx0OiBET00uaXNBbmNlc3RvcihET00uZ2V0QWN0aXZlRWxlbWVudCgpLCB0aGlzLmFjdGlvbnNMaXN0LmNoaWxkcmVuW2luZGV4XSk7XG5cdH1cblxuXHRmb2N1cyhpbmRleD86IG51bWJlcik6IHZvaWQ7XG5cdGZvY3VzKHNlbGVjdEZpcnN0PzogYm9vbGVhbik6IHZvaWQ7XG5cdGZvY3VzKGFyZz86IG51bWJlciB8IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRsZXQgc2VsZWN0Rmlyc3Q6IGJvb2xlYW4gPSBmYWxzZTtcblx0XHRsZXQgaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoYXJnID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHNlbGVjdEZpcnN0ID0gdHJ1ZTtcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBhcmcgPT09ICdudW1iZXInKSB7XG5cdFx0XHRpbmRleCA9IGFyZztcblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBhcmcgPT09ICdib29sZWFuJykge1xuXHRcdFx0c2VsZWN0Rmlyc3QgPSBhcmc7XG5cdFx0fVxuXG5cdFx0aWYgKHNlbGVjdEZpcnN0ICYmIHR5cGVvZiB0aGlzLmZvY3VzZWRJdGVtID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3QgZmlyc3RFbmFibGVkID0gdGhpcy52aWV3SXRlbXMuZmluZEluZGV4KGl0ZW0gPT4gaXRlbS5pc0VuYWJsZWQoKSk7XG5cdFx0XHQvLyBGb2N1cyB0aGUgZmlyc3QgZW5hYmxlZCBpdGVtXG5cdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gZmlyc3RFbmFibGVkID09PSAtMSA/IHVuZGVmaW5lZCA6IGZpcnN0RW5hYmxlZDtcblx0XHRcdHRoaXMudXBkYXRlRm9jdXModW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaW5kZXggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gaW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlRm9jdXModW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZm9jdXNGaXJzdCgpOiBib29sZWFuIHtcblx0XHR0aGlzLmZvY3VzZWRJdGVtID0gdGhpcy5sZW5ndGgoKSAtIDE7XG5cdFx0cmV0dXJuIHRoaXMuZm9jdXNOZXh0KHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0xhc3QoKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5mb2N1c2VkSXRlbSA9IDA7XG5cdFx0cmV0dXJuIHRoaXMuZm9jdXNQcmV2aW91cyh0cnVlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBmb2N1c05leHQoZm9yY2VMb29wPzogYm9vbGVhbiwgZm9yY2VGb2N1cz86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuZm9jdXNlZEl0ZW0gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gdGhpcy52aWV3SXRlbXMubGVuZ3RoIC0gMTtcblx0XHR9IGVsc2UgaWYgKHRoaXMudmlld0l0ZW1zLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRJbmRleCA9IHRoaXMuZm9jdXNlZEl0ZW07XG5cdFx0bGV0IGl0ZW06IElBY3Rpb25WaWV3SXRlbTtcblx0XHRkbyB7XG5cblx0XHRcdGlmICghZm9yY2VMb29wICYmIHRoaXMub3B0aW9ucy5wcmV2ZW50TG9vcE5hdmlnYXRpb24gJiYgdGhpcy5mb2N1c2VkSXRlbSArIDEgPj0gdGhpcy52aWV3SXRlbXMubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSBzdGFydEluZGV4O1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSAodGhpcy5mb2N1c2VkSXRlbSArIDEpICUgdGhpcy52aWV3SXRlbXMubGVuZ3RoO1xuXHRcdFx0aXRlbSA9IHRoaXMudmlld0l0ZW1zW3RoaXMuZm9jdXNlZEl0ZW1dO1xuXHRcdH0gd2hpbGUgKHRoaXMuZm9jdXNlZEl0ZW0gIT09IHN0YXJ0SW5kZXggJiYgKCh0aGlzLm9wdGlvbnMuZm9jdXNPbmx5RW5hYmxlZEl0ZW1zICYmICFpdGVtLmlzRW5hYmxlZCgpKSB8fCBpdGVtLmFjdGlvbi5pZCA9PT0gU2VwYXJhdG9yLklEKSk7XG5cblx0XHR0aGlzLnVwZGF0ZUZvY3VzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmb3JjZUZvY3VzKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBmb2N1c1ByZXZpb3VzKGZvcmNlTG9vcD86IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuZm9jdXNlZEl0ZW0gPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmZvY3VzZWRJdGVtID0gMDtcblx0XHR9IGVsc2UgaWYgKHRoaXMudmlld0l0ZW1zLmxlbmd0aCA8PSAxKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRJbmRleCA9IHRoaXMuZm9jdXNlZEl0ZW07XG5cdFx0bGV0IGl0ZW06IElBY3Rpb25WaWV3SXRlbTtcblxuXHRcdGRvIHtcblx0XHRcdHRoaXMuZm9jdXNlZEl0ZW0gPSB0aGlzLmZvY3VzZWRJdGVtIC0gMTtcblx0XHRcdGlmICh0aGlzLmZvY3VzZWRJdGVtIDwgMCkge1xuXHRcdFx0XHRpZiAoIWZvcmNlTG9vcCAmJiB0aGlzLm9wdGlvbnMucHJldmVudExvb3BOYXZpZ2F0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9IHN0YXJ0SW5kZXg7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5mb2N1c2VkSXRlbSA9IHRoaXMudmlld0l0ZW1zLmxlbmd0aCAtIDE7XG5cdFx0XHR9XG5cdFx0XHRpdGVtID0gdGhpcy52aWV3SXRlbXNbdGhpcy5mb2N1c2VkSXRlbV07XG5cdFx0fSB3aGlsZSAodGhpcy5mb2N1c2VkSXRlbSAhPT0gc3RhcnRJbmRleCAmJiAoKHRoaXMub3B0aW9ucy5mb2N1c09ubHlFbmFibGVkSXRlbXMgJiYgIWl0ZW0uaXNFbmFibGVkKCkpIHx8IGl0ZW0uYWN0aW9uLmlkID09PSBTZXBhcmF0b3IuSUQpKTtcblxuXG5cdFx0dGhpcy51cGRhdGVGb2N1cyh0cnVlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVGb2N1cyhmcm9tUmlnaHQ/OiBib29sZWFuLCBwcmV2ZW50U2Nyb2xsPzogYm9vbGVhbiwgZm9yY2VGb2N1czogYm9vbGVhbiA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKHR5cGVvZiB0aGlzLmZvY3VzZWRJdGVtID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5hY3Rpb25zTGlzdC5mb2N1cyh7IHByZXZlbnRTY3JvbGwgfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJldmlvdXNseUZvY3VzZWRJdGVtICE9PSB1bmRlZmluZWQgJiYgdGhpcy5wcmV2aW91c2x5Rm9jdXNlZEl0ZW0gIT09IHRoaXMuZm9jdXNlZEl0ZW0pIHtcblx0XHRcdHRoaXMudmlld0l0ZW1zW3RoaXMucHJldmlvdXNseUZvY3VzZWRJdGVtXT8uYmx1cigpO1xuXHRcdH1cblx0XHRjb25zdCBhY3Rpb25WaWV3SXRlbSA9IHRoaXMuZm9jdXNlZEl0ZW0gIT09IHVuZGVmaW5lZCA/IHRoaXMudmlld0l0ZW1zW3RoaXMuZm9jdXNlZEl0ZW1dIDogdW5kZWZpbmVkO1xuXHRcdGlmIChhY3Rpb25WaWV3SXRlbSkge1xuXHRcdFx0bGV0IGZvY3VzSXRlbSA9IHRydWU7XG5cblx0XHRcdGlmICghdHlwZXMuaXNGdW5jdGlvbihhY3Rpb25WaWV3SXRlbS5mb2N1cykpIHtcblx0XHRcdFx0Zm9jdXNJdGVtID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuZm9jdXNPbmx5RW5hYmxlZEl0ZW1zICYmIHR5cGVzLmlzRnVuY3Rpb24oYWN0aW9uVmlld0l0ZW0uaXNFbmFibGVkKSAmJiAhYWN0aW9uVmlld0l0ZW0uaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0Zm9jdXNJdGVtID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhY3Rpb25WaWV3SXRlbS5hY3Rpb24uaWQgPT09IFNlcGFyYXRvci5JRCkge1xuXHRcdFx0XHRmb2N1c0l0ZW0gPSBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGlmICghZm9jdXNJdGVtKSB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uc0xpc3QuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsIH0pO1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzbHlGb2N1c2VkSXRlbSA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSBpZiAoZm9yY2VGb2N1cyB8fCB0aGlzLnByZXZpb3VzbHlGb2N1c2VkSXRlbSAhPT0gdGhpcy5mb2N1c2VkSXRlbSkge1xuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbS5mb2N1cyhmcm9tUmlnaHQpO1xuXHRcdFx0XHR0aGlzLnByZXZpb3VzbHlGb2N1c2VkSXRlbSA9IHRoaXMuZm9jdXNlZEl0ZW07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZm9jdXNJdGVtKSB7XG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtLnNob3dIb3Zlcj8uKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1RyaWdnZXIoZXZlbnQ6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5mb2N1c2VkSXRlbSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybjsgLy9ub3RoaW5nIHRvIGZvY3VzXG5cdFx0fVxuXG5cdFx0Ly8gdHJpZ2dlciBhY3Rpb25cblx0XHRjb25zdCBhY3Rpb25WaWV3SXRlbSA9IHRoaXMudmlld0l0ZW1zW3RoaXMuZm9jdXNlZEl0ZW1dO1xuXHRcdGlmIChhY3Rpb25WaWV3SXRlbSBpbnN0YW5jZW9mIEJhc2VBY3Rpb25WaWV3SXRlbSkge1xuXHRcdFx0Y29uc3QgY29udGV4dCA9IChhY3Rpb25WaWV3SXRlbS5fY29udGV4dCA9PT0gbnVsbCB8fCBhY3Rpb25WaWV3SXRlbS5fY29udGV4dCA9PT0gdW5kZWZpbmVkKSA/IGV2ZW50IDogYWN0aW9uVmlld0l0ZW0uX2NvbnRleHQ7XG5cdFx0XHR0aGlzLnJ1bihhY3Rpb25WaWV3SXRlbS5fYWN0aW9uLCBjb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBydW4oYWN0aW9uOiBJQWN0aW9uLCBjb250ZXh0PzogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2FjdGlvblJ1bm5lci5ydW4oYWN0aW9uLCBjb250ZXh0KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl92aWV3SXRlbXMgPSBkaXNwb3NlKHRoaXMuX3ZpZXdJdGVtcyk7XG5cdFx0dGhpcy5nZXRDb250YWluZXIoKS5yZW1vdmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByZXBhcmVBY3Rpb25zKGFjdGlvbnM6IElBY3Rpb25bXSk6IElBY3Rpb25bXSB7XG5cdGlmICghYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gYWN0aW9ucztcblx0fVxuXG5cdC8vIENsZWFuIHVwIGxlYWRpbmcgc2VwYXJhdG9yc1xuXHRsZXQgZmlyc3RJbmRleE9mQWN0aW9uID0gLTE7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYWN0aW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdGlmIChhY3Rpb25zW2ldLmlkID09PSBTZXBhcmF0b3IuSUQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGZpcnN0SW5kZXhPZkFjdGlvbiA9IGk7XG5cdFx0YnJlYWs7XG5cdH1cblxuXHRpZiAoZmlyc3RJbmRleE9mQWN0aW9uID09PSAtMSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFjdGlvbnMgPSBhY3Rpb25zLnNsaWNlKGZpcnN0SW5kZXhPZkFjdGlvbik7XG5cblx0Ly8gQ2xlYW4gdXAgdHJhaWxpbmcgc2VwYXJhdG9yc1xuXHRmb3IgKGxldCBoID0gYWN0aW9ucy5sZW5ndGggLSAxOyBoID49IDA7IGgtLSkge1xuXHRcdGNvbnN0IGlzU2VwYXJhdG9yID0gYWN0aW9uc1toXS5pZCA9PT0gU2VwYXJhdG9yLklEO1xuXHRcdGlmIChpc1NlcGFyYXRvcikge1xuXHRcdFx0YWN0aW9ucy5zcGxpY2UoaCwgMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8vIENsZWFuIHVwIHNlcGFyYXRvciBkdXBsaWNhdGVzXG5cdGxldCBmb3VuZEFjdGlvbiA9IGZhbHNlO1xuXHRmb3IgKGxldCBrID0gYWN0aW9ucy5sZW5ndGggLSAxOyBrID49IDA7IGstLSkge1xuXHRcdGNvbnN0IGlzU2VwYXJhdG9yID0gYWN0aW9uc1trXS5pZCA9PT0gU2VwYXJhdG9yLklEO1xuXHRcdGlmIChpc1NlcGFyYXRvciAmJiAhZm91bmRBY3Rpb24pIHtcblx0XHRcdGFjdGlvbnMuc3BsaWNlKGssIDEpO1xuXHRcdH0gZWxzZSBpZiAoIWlzU2VwYXJhdG9yKSB7XG5cdFx0XHRmb3VuZEFjdGlvbiA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChpc1NlcGFyYXRvcikge1xuXHRcdFx0Zm91bmRBY3Rpb24gPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gYWN0aW9ucztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdCQUFnQiwwQkFBa0Q7QUFDM0UsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyxjQUFpRCxpQkFBaUI7QUFDM0UsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixlQUE0QjtBQUNqRixZQUFZLFdBQVc7QUFDdkIsT0FBTztBQWlCQSxJQUFXLHFCQUFYLGtCQUFXQSx3QkFBWDtBQUNOLEVBQUFBLHdDQUFBO0FBQ0EsRUFBQUEsd0NBQUE7QUFGaUIsU0FBQUE7QUFBQSxHQUFBO0FBa0NYLE1BQU0sa0JBQWtCLFdBQW9DO0FBQUEsRUE2Q2xFLFlBQVksV0FBd0IsVUFBNkIsQ0FBQyxHQUFHO0FBQ3BFLFVBQU07QUF4Q1AsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBWWhGLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxjQUErQixDQUFDO0FBTTFGO0FBQUEsU0FBUSxpQkFBMEI7QUFFbEMsU0FBUSxZQUFxQjtBQU03QixTQUFpQixhQUFhLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUdoRSxTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLFFBQWMsRUFBRSx3QkFBd0Is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QUFVLE9BQW9DO0FBQ3JELFFBQUksT0FBTyxLQUFLLGdCQUFnQixhQUFhO0FBQzVDO0FBQUEsSUFDRDtBQUdBLFVBQU0saUJBQWlCLEtBQUssVUFBVSxLQUFLLFdBQVc7QUFDdEQsUUFBSSwwQkFBMEIsb0JBQW9CO0FBQ2pELFlBQU0sVUFBVyxlQUFlLGFBQWEsUUFBUSxlQUFlLGFBQWEsU0FBYSxRQUFRLGVBQWU7QUFDckgsV0FBSyxJQUFJLGVBQWUsU0FBUyxPQUFPO0FBQUEsSUFDekM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLElBQUksUUFBaUIsU0FBa0M7QUFDNUQsVUFBTSxLQUFLLGNBQWMsSUFBSSxRQUFRLE9BQU87QUFBQSxFQUM3QztBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsU0FBSyxXQUFXO0FBQ2hCLFNBQUssYUFBYSxRQUFRLEtBQUssVUFBVTtBQUN6QyxTQUFLLGFBQWEsRUFBRSxPQUFPO0FBQzNCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQUVPLFNBQVMsZUFBZSxTQUErQjtBQUM3RCxNQUFJLENBQUMsUUFBUSxRQUFRO0FBQ3BCLFdBQU87QUFBQSxFQUNSO0FBR0EsTUFBSSxxQkFBcUI7QUFDekIsV0FBUyxJQUFJLEdBQUcsSUFBSSxRQUFRLFFBQVEsS0FBSztBQUN4QyxRQUFJLFFBQVEsQ0FBQyxFQUFFLE9BQU8sVUFBVSxJQUFJO0FBQ25DO0FBQUEsSUFDRDtBQUVBLHlCQUFxQjtBQUNyQjtBQUFBLEVBQ0Q7QUFFQSxNQUFJLHVCQUF1QixJQUFJO0FBQzlCLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFFQSxZQUFVLFFBQVEsTUFBTSxrQkFBa0I7QUFHMUMsV0FBUyxJQUFJLFFBQVEsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQzdDLFVBQU0sY0FBYyxRQUFRLENBQUMsRUFBRSxPQUFPLFVBQVU7QUFDaEQsUUFBSSxhQUFhO0FBQ2hCLGNBQVEsT0FBTyxHQUFHLENBQUM7QUFBQSxJQUNwQixPQUFPO0FBQ047QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUdBLE1BQUksY0FBYztBQUNsQixXQUFTLElBQUksUUFBUSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDN0MsVUFBTSxjQUFjLFFBQVEsQ0FBQyxFQUFFLE9BQU8sVUFBVTtBQUNoRCxRQUFJLGVBQWUsQ0FBQyxhQUFhO0FBQ2hDLGNBQVEsT0FBTyxHQUFHLENBQUM7QUFBQSxJQUNwQixXQUFXLENBQUMsYUFBYTtBQUN4QixvQkFBYztBQUFBLElBQ2YsV0FBVyxhQUFhO0FBQ3ZCLG9CQUFjO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFFQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIkFjdGlvbnNPcmllbnRhdGlvbiJdCn0K
