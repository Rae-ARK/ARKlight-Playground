import { isFirefox } from "../../browser.js";
import { DataTransfers } from "../../dnd.js";
import { addDisposableListener, EventHelper, EventType } from "../../dom.js";
import { EventType as TouchEventType, Gesture } from "../../touch.js";
import { getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { SelectBox } from "../selectBox/selectBox.js";
import { Action, ActionRunner, Separator } from "../../../common/actions.js";
import { Disposable } from "../../../common/lifecycle.js";
import * as platform from "../../../common/platform.js";
import * as types from "../../../common/types.js";
import "./actionbar.css";
import * as nls from "../../../../nls.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
class BaseActionViewItem extends Disposable {
  constructor(context, action, options = {}) {
    super();
    this.options = options;
    this._context = context || this;
    this._action = action;
    if (action instanceof Action) {
      this._register(action.onDidChange((event) => {
        if (!this.element) {
          return;
        }
        this.handleActionChangeEvent(event);
      }));
    }
  }
  get action() {
    return this._action;
  }
  handleActionChangeEvent(event) {
    if (event.enabled !== void 0) {
      this.updateEnabled();
    }
    if (event.checked !== void 0) {
      this.updateChecked();
    }
    if (event.class !== void 0) {
      this.updateClass();
    }
    if (event.label !== void 0) {
      this.updateLabel();
      this.updateTooltip();
    }
    if (event.tooltip !== void 0) {
      this.updateTooltip();
    }
  }
  get actionRunner() {
    if (!this._actionRunner) {
      this._actionRunner = this._register(new ActionRunner());
    }
    return this._actionRunner;
  }
  set actionRunner(actionRunner) {
    this._actionRunner = actionRunner;
  }
  isEnabled() {
    return this._action.enabled;
  }
  setActionContext(newContext) {
    this._context = newContext;
  }
  render(container) {
    const element = this.element = container;
    this._register(Gesture.addTarget(container));
    const enableDragging = this.options && this.options.draggable;
    if (enableDragging) {
      container.draggable = true;
      if (isFirefox) {
        this._register(addDisposableListener(container, EventType.DRAG_START, (e) => e.dataTransfer?.setData(DataTransfers.TEXT, this._action.label)));
      }
    }
    this._register(addDisposableListener(element, TouchEventType.Tap, (e) => this.onClick(e, true)));
    this._register(addDisposableListener(element, EventType.MOUSE_DOWN, (e) => {
      if (!enableDragging) {
        EventHelper.stop(e, true);
      }
      if (this._action.enabled && e.button === 0) {
        element.classList.add("active");
      }
    }));
    if (platform.isMacintosh) {
      this._register(addDisposableListener(element, EventType.CONTEXT_MENU, (e) => {
        if (e.button === 0 && e.ctrlKey === true) {
          this.onClick(e);
        }
      }));
    }
    this._register(addDisposableListener(element, EventType.CLICK, (e) => {
      EventHelper.stop(e, true);
      if (!(this.options && this.options.isMenu)) {
        this.onClick(e);
      }
    }));
    this._register(addDisposableListener(element, EventType.DBLCLICK, (e) => {
      EventHelper.stop(e, true);
    }));
    [EventType.MOUSE_UP, EventType.MOUSE_OUT].forEach((event) => {
      this._register(addDisposableListener(element, event, (e) => {
        EventHelper.stop(e);
        element.classList.remove("active");
      }));
    });
  }
  onClick(event, preserveFocus = false) {
    EventHelper.stop(event, true);
    const context = types.isUndefinedOrNull(this._context) ? this.options?.useEventAsContext ? event : { preserveFocus } : this._context;
    this.actionRunner.run(this._action, context);
  }
  // Only set the tabIndex on the element once it is about to get focused
  // That way this element wont be a tab stop when it is not needed #106441
  focus() {
    if (this.element) {
      this.element.tabIndex = 0;
      this.element.focus();
      this.element.classList.add("focused");
    }
  }
  isFocused() {
    return !!this.element?.classList.contains("focused");
  }
  blur() {
    if (this.element) {
      this.element.blur();
      this.element.tabIndex = -1;
      this.element.classList.remove("focused");
    }
  }
  setFocusable(focusable) {
    if (this.element) {
      this.element.tabIndex = focusable ? 0 : -1;
    }
  }
  get trapsArrowNavigation() {
    return false;
  }
  updateEnabled() {
  }
  updateLabel() {
  }
  getClass() {
    return this.action.class;
  }
  getTooltip() {
    return this.action.tooltip;
  }
  getHoverContents() {
    return this.getTooltip();
  }
  updateTooltip() {
    if (!this.element) {
      return;
    }
    const title = this.getHoverContents() ?? "";
    this.updateAriaLabel();
    if (!this.customHover && title !== "") {
      const hoverDelegate = this.options.hoverDelegate ?? getDefaultHoverDelegate("element");
      this.customHover = this._store.add(getBaseLayerHoverDelegate().setupManagedHover(hoverDelegate, this.element, title));
    } else if (this.customHover) {
      this.customHover.update(title);
    }
  }
  updateAriaLabel() {
    if (this.element) {
      const title = this.getTooltip() ?? "";
      this.element.setAttribute("aria-label", title);
    }
  }
  updateClass() {
  }
  updateChecked() {
  }
  dispose() {
    if (this.element) {
      this.element.remove();
      this.element = void 0;
    }
    this._context = void 0;
    super.dispose();
  }
}
class ActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    options = {
      ...options,
      icon: options.icon !== void 0 ? options.icon : false,
      label: options.label !== void 0 ? options.label : true
    };
    super(context, action, options);
    this.options = options;
    this.cssClass = "";
  }
  render(container) {
    super.render(container);
    types.assertType(this.element);
    const label = document.createElement("a");
    label.classList.add("action-label");
    label.setAttribute("role", this.getDefaultAriaRole());
    this.label = label;
    this.element.appendChild(label);
    if (this.options.label && this.options.keybinding && !this.options.keybindingNotRenderedWithLabel) {
      const kbLabel = document.createElement("span");
      kbLabel.classList.add("keybinding");
      kbLabel.textContent = this.options.keybinding;
      this.element.appendChild(kbLabel);
    }
    this.updateClass();
    this.updateLabel();
    this.updateTooltip();
    this.updateEnabled();
    this.updateChecked();
  }
  getDefaultAriaRole() {
    if (this._action.id === Separator.ID) {
      return "presentation";
    } else {
      if (this.options.isMenu) {
        return "menuitem";
      } else if (this.options.isTabList) {
        return "tab";
      } else {
        return "button";
      }
    }
  }
  // Only set the tabIndex on the element once it is about to get focused
  // That way this element wont be a tab stop when it is not needed #106441
  focus() {
    if (this.label) {
      this.label.tabIndex = 0;
      this.label.focus();
    }
  }
  isFocused() {
    return !!this.label && this.label?.tabIndex === 0;
  }
  blur() {
    if (this.label) {
      this.label.tabIndex = -1;
    }
  }
  setFocusable(focusable) {
    if (this.label) {
      this.label.tabIndex = focusable ? 0 : -1;
    }
  }
  updateLabel() {
    if (this.options.label && this.label) {
      this.label.textContent = this.action.label;
    }
  }
  getTooltip() {
    let title = null;
    if (this.action.tooltip) {
      title = this.action.tooltip;
    } else if (this.action.label) {
      title = this.action.label;
      if (this.options.keybinding) {
        title = nls.localize({ key: "titleLabel", comment: ["action title", "action keybinding"] }, "{0} ({1})", title, this.options.keybinding);
      }
    }
    return title ?? void 0;
  }
  updateClass() {
    if (this.cssClass && this.label) {
      this.label.classList.remove(...this.cssClass.split(" "));
    }
    if (this.action.id === Separator.ID && this.action.class) {
      this.label?.classList.add(this.action.class);
    } else if (this.options.icon) {
      this.cssClass = this.getClass();
      if (this.label) {
        this.label.classList.add("codicon");
        if (this.cssClass) {
          this.label.classList.add(...this.cssClass.split(" "));
        }
      }
      this.updateEnabled();
    } else {
      this.label?.classList.remove("codicon");
    }
  }
  updateEnabled() {
    if (this.action.enabled) {
      if (this.label) {
        this.label.removeAttribute("aria-disabled");
        this.label.classList.remove("disabled");
      }
      this.element?.classList.remove("disabled");
    } else {
      if (this.label) {
        this.label.setAttribute("aria-disabled", "true");
        this.label.classList.add("disabled");
      }
      this.element?.classList.add("disabled");
    }
  }
  updateAriaLabel() {
    if (this.label) {
      const title = this.getTooltip() ?? "";
      this.label.setAttribute("aria-label", title);
    }
  }
  updateChecked() {
    if (this.label) {
      if (this.action.checked !== void 0) {
        this.label.classList.toggle("checked", this.action.checked);
        if (this.options.isTabList) {
          this.label.setAttribute("aria-selected", this.action.checked ? "true" : "false");
        } else {
          this.label.setAttribute("aria-pressed", this.action.checked ? "true" : "false");
          this.label.setAttribute("role", "button");
        }
      } else {
        this.label.classList.remove("checked");
        this.label.removeAttribute(this.options.isTabList ? "aria-selected" : "aria-pressed");
        this.label.setAttribute("role", this.getDefaultAriaRole());
      }
    }
  }
}
class SelectActionViewItem extends BaseActionViewItem {
  constructor(ctx, action, options, selected, contextViewProvider, styles, selectBoxOptions) {
    super(ctx, action);
    this.selectBox = new SelectBox(options, selected, contextViewProvider, styles, selectBoxOptions);
    this.selectBox.setFocusable(false);
    this._register(this.selectBox);
    this.registerListeners();
  }
  setOptions(options, selected) {
    this.selectBox.setOptions(options, selected);
  }
  select(index) {
    this.selectBox.select(index);
  }
  registerListeners() {
    this._register(this.selectBox.onDidSelect((e) => this.runAction(e.selected, e.index)));
  }
  runAction(option, index) {
    this.actionRunner.run(this._action, this.getActionContext(option, index));
  }
  getActionContext(option, index) {
    return option;
  }
  setFocusable(focusable) {
    this.selectBox.setFocusable(focusable);
  }
  focus() {
    this.selectBox?.focus();
  }
  blur() {
    this.selectBox?.blur();
  }
  render(container) {
    this.selectBox.render(container);
  }
}
export {
  ActionViewItem,
  BaseActionViewItem,
  SelectActionViewItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNGaXJlZm94IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBEYXRhVHJhbnNmZXJzIH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgRXZlbnRIZWxwZXIsIEV2ZW50TGlrZSwgRXZlbnRUeXBlIH0gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCB7IEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSwgR2VzdHVyZSB9IGZyb20gJy4uLy4uL3RvdWNoLmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1Byb3ZpZGVyIH0gZnJvbSAnLi4vY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlRmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSVNlbGVjdEJveE9wdGlvbnMsIElTZWxlY3RCb3hTdHlsZXMsIElTZWxlY3RPcHRpb25JdGVtLCBTZWxlY3RCb3ggfSBmcm9tICcuLi9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IElUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbiwgQWN0aW9uUnVubmVyLCBJQWN0aW9uLCBJQWN0aW9uQ2hhbmdlRXZlbnQsIElBY3Rpb25SdW5uZXIsIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuLi8uLi8uLi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICcuL2FjdGlvbmJhci5jc3MnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIsIElNYW5hZ2VkSG92ZXJDb250ZW50IH0gZnJvbSAnLi4vaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGRyYWdnYWJsZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzTWVudT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzVGFiTGlzdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVzZUV2ZW50QXNDb250ZXh0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZT86IElIb3ZlckRlbGVnYXRlO1xufVxuXG5leHBvcnQgY2xhc3MgQmFzZUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBY3Rpb25WaWV3SXRlbSB7XG5cblx0ZWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0X2NvbnRleHQ6IHVua25vd247XG5cdHJlYWRvbmx5IF9hY3Rpb246IElBY3Rpb247XG5cblx0cHJpdmF0ZSBjdXN0b21Ib3Zlcj86IElNYW5hZ2VkSG92ZXI7XG5cblx0Z2V0IGFjdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aW9uUnVubmVyOiBJQWN0aW9uUnVubmVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IHVua25vd24sXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyA9IHt9XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9jb250ZXh0ID0gY29udGV4dCB8fCB0aGlzO1xuXHRcdHRoaXMuX2FjdGlvbiA9IGFjdGlvbjtcblxuXHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFjdGlvbi5vbkRpZENoYW5nZShldmVudCA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0Ly8gd2UgaGF2ZSBub3QgYmVlbiByZW5kZXJlZCB5ZXQsIHNvIHRoZXJlXG5cdFx0XHRcdFx0Ly8gaXMgbm8gcG9pbnQgaW4gdXBkYXRpbmcgdGhlIFVJXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5oYW5kbGVBY3Rpb25DaGFuZ2VFdmVudChldmVudCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVBY3Rpb25DaGFuZ2VFdmVudChldmVudDogSUFjdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGV2ZW50LmVuYWJsZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LmNoZWNrZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVDaGVja2VkKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LmNsYXNzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlQ2xhc3MoKTtcblx0XHR9XG5cblx0XHRpZiAoZXZlbnQubGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50LnRvb2x0aXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGFjdGlvblJ1bm5lcigpOiBJQWN0aW9uUnVubmVyIHtcblx0XHRpZiAoIXRoaXMuX2FjdGlvblJ1bm5lcikge1xuXHRcdFx0dGhpcy5fYWN0aW9uUnVubmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvblJ1bm5lcigpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uUnVubmVyO1xuXHR9XG5cblx0c2V0IGFjdGlvblJ1bm5lcihhY3Rpb25SdW5uZXI6IElBY3Rpb25SdW5uZXIpIHtcblx0XHR0aGlzLl9hY3Rpb25SdW5uZXIgPSBhY3Rpb25SdW5uZXI7XG5cdH1cblxuXHRpc0VuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvbi5lbmFibGVkO1xuXHR9XG5cblx0c2V0QWN0aW9uQ29udGV4dChuZXdDb250ZXh0OiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGV4dCA9IG5ld0NvbnRleHQ7XG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmVsZW1lbnQgPSBjb250YWluZXI7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoR2VzdHVyZS5hZGRUYXJnZXQoY29udGFpbmVyKSk7XG5cblx0XHRjb25zdCBlbmFibGVEcmFnZ2luZyA9IHRoaXMub3B0aW9ucyAmJiB0aGlzLm9wdGlvbnMuZHJhZ2dhYmxlO1xuXHRcdGlmIChlbmFibGVEcmFnZ2luZykge1xuXHRcdFx0Y29udGFpbmVyLmRyYWdnYWJsZSA9IHRydWU7XG5cblx0XHRcdGlmIChpc0ZpcmVmb3gpIHtcblx0XHRcdFx0Ly8gRmlyZWZveDogcmVxdWlyZXMgdG8gc2V0IGEgdGV4dCBkYXRhIHRyYW5zZmVyIHRvIGdldCBnb2luZ1xuXHRcdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoY29udGFpbmVyLCBFdmVudFR5cGUuRFJBR19TVEFSVCwgZSA9PiBlLmRhdGFUcmFuc2Zlcj8uc2V0RGF0YShEYXRhVHJhbnNmZXJzLlRFWFQsIHRoaXMuX2FjdGlvbi5sYWJlbCkpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgVG91Y2hFdmVudFR5cGUuVGFwLCBlID0+IHRoaXMub25DbGljayhlLCB0cnVlKSkpOyAvLyBQcmVzZXJ2ZSBmb2N1cyBvbiB0YXAgIzEyNTQ3MFxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHtcblx0XHRcdGlmICghZW5hYmxlRHJhZ2dpbmcpIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTsgLy8gZG8gbm90IHJ1biB3aGVuIGRyYWdnaW5nIGlzIG9uIGJlY2F1c2UgdGhhdCB3b3VsZCBkaXNhYmxlIGl0XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9hY3Rpb24uZW5hYmxlZCAmJiBlLmJ1dHRvbiA9PT0gMCkge1xuXHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGlmIChwbGF0Zm9ybS5pc01hY2ludG9zaCkge1xuXHRcdFx0Ly8gbWFjT1M6IGFsbG93IHRvIHRyaWdnZXIgdGhlIGJ1dHRvbiB3aGVuIGhvbGRpbmcgQ3RybCtrZXkgYW5kIHByZXNzaW5nIHRoZVxuXHRcdFx0Ly8gbWFpbiBtb3VzZSBidXR0b24uIFRoaXMgaXMgZm9yIHNjZW5hcmlvcyB3aGVyZSBlLmcuIHNvbWUgaW50ZXJhY3Rpb24gZm9yY2VzXG5cdFx0XHQvLyB0aGUgQ3RybCtrZXkgdG8gYmUgcHJlc3NlZCBhbmQgaG9sZCBidXQgdGhlIHVzZXIgc3RpbGwgd2FudHMgdG8gaW50ZXJhY3Rcblx0XHRcdC8vIHdpdGggdGhlIGFjdGlvbnMgKGZvciBleGFtcGxlIHF1aWNrIGFjY2VzcyBpbiBxdWljayBuYXZpZ2F0aW9uIG1vZGUpLlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5idXR0b24gPT09IDAgJiYgZS5jdHJsS2V5ID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5vbkNsaWNrKGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHQvLyBtZW51cyBkbyBub3QgdXNlIHRoZSBjbGljayBldmVudFxuXHRcdFx0aWYgKCEodGhpcy5vcHRpb25zICYmIHRoaXMub3B0aW9ucy5pc01lbnUpKSB7XG5cdFx0XHRcdHRoaXMub25DbGljayhlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgRXZlbnRUeXBlLkRCTENMSUNLLCBlID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0W0V2ZW50VHlwZS5NT1VTRV9VUCwgRXZlbnRUeXBlLk1PVVNFX09VVF0uZm9yRWFjaChldmVudCA9PiB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZXZlbnQsIGUgPT4ge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHRlbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2FjdGl2ZScpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHR9XG5cblx0b25DbGljayhldmVudDogRXZlbnRMaWtlLCBwcmVzZXJ2ZUZvY3VzID0gZmFsc2UpOiB2b2lkIHtcblx0XHRFdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcblxuXHRcdGNvbnN0IGNvbnRleHQgPSB0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbCh0aGlzLl9jb250ZXh0KSA/IHRoaXMub3B0aW9ucz8udXNlRXZlbnRBc0NvbnRleHQgPyBldmVudCA6IHsgcHJlc2VydmVGb2N1cyB9IDogdGhpcy5fY29udGV4dDtcblx0XHR0aGlzLmFjdGlvblJ1bm5lci5ydW4odGhpcy5fYWN0aW9uLCBjb250ZXh0KTtcblx0fVxuXG5cdC8vIE9ubHkgc2V0IHRoZSB0YWJJbmRleCBvbiB0aGUgZWxlbWVudCBvbmNlIGl0IGlzIGFib3V0IHRvIGdldCBmb2N1c2VkXG5cdC8vIFRoYXQgd2F5IHRoaXMgZWxlbWVudCB3b250IGJlIGEgdGFiIHN0b3Agd2hlbiBpdCBpcyBub3QgbmVlZGVkICMxMDY0NDFcblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRcdHRoaXMuZWxlbWVudC5mb2N1cygpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2ZvY3VzZWQnKTtcblx0XHR9XG5cdH1cblxuXHRpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5lbGVtZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ2ZvY3VzZWQnKTtcblx0fVxuXG5cdGJsdXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmJsdXIoKTtcblx0XHRcdHRoaXMuZWxlbWVudC50YWJJbmRleCA9IC0xO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2ZvY3VzZWQnKTtcblx0XHR9XG5cdH1cblxuXHRzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gZm9jdXNhYmxlID8gMCA6IC0xO1xuXHRcdH1cblx0fVxuXG5cdGdldCB0cmFwc0Fycm93TmF2aWdhdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHQvLyBpbXBsZW1lbnQgaW4gc3ViY2xhc3Ncblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHQvLyBpbXBsZW1lbnQgaW4gc3ViY2xhc3Ncblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDbGFzcygpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFjdGlvbi5jbGFzcztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUb29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uLnRvb2x0aXA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0SG92ZXJDb250ZW50cygpOiBJTWFuYWdlZEhvdmVyQ29udGVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VG9vbHRpcCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVRvb2x0aXAoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmdldEhvdmVyQ29udGVudHMoKSA/PyAnJztcblx0XHR0aGlzLnVwZGF0ZUFyaWFMYWJlbCgpO1xuXG5cdFx0aWYgKCF0aGlzLmN1c3RvbUhvdmVyICYmIHRpdGxlICE9PSAnJykge1xuXHRcdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHRoaXMub3B0aW9ucy5ob3ZlckRlbGVnYXRlID8/IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50Jyk7XG5cdFx0XHR0aGlzLmN1c3RvbUhvdmVyID0gdGhpcy5fc3RvcmUuYWRkKGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoKS5zZXR1cE1hbmFnZWRIb3Zlcihob3ZlckRlbGVnYXRlLCB0aGlzLmVsZW1lbnQsIHRpdGxlKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmN1c3RvbUhvdmVyKSB7XG5cdFx0XHR0aGlzLmN1c3RvbUhvdmVyLnVwZGF0ZSh0aXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZUFyaWFMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRoaXMuZ2V0VG9vbHRpcCgpID8/ICcnO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlQ2xhc3MoKTogdm9pZCB7XG5cdFx0Ly8gaW1wbGVtZW50IGluIHN1YmNsYXNzXG5cdH1cblxuXHRwcm90ZWN0ZWQgdXBkYXRlQ2hlY2tlZCgpOiB2b2lkIHtcblx0XHQvLyBpbXBsZW1lbnQgaW4gc3ViY2xhc3Ncblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5lbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgZXh0ZW5kcyBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdGljb24/OiBib29sZWFuO1xuXHRsYWJlbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGtleWJpbmRpbmc/OiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkb25seSBrZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWw/OiBib29sZWFuO1xuXHRyZWFkb25seSB0b2dnbGVTdHlsZXM/OiBJVG9nZ2xlU3R5bGVzO1xufVxuXG5leHBvcnQgY2xhc3MgQWN0aW9uVmlld0l0ZW0gZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdHByb3RlY3RlZCBsYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBvdmVycmlkZSByZWFkb25seSBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zO1xuXG5cdHByaXZhdGUgY3NzQ2xhc3M/OiBzdHJpbmc7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogdW5rbm93biwgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRpY29uOiBvcHRpb25zLmljb24gIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMuaWNvbiA6IGZhbHNlLFxuXHRcdFx0bGFiZWw6IG9wdGlvbnMubGFiZWwgIT09IHVuZGVmaW5lZCA/IG9wdGlvbnMubGFiZWwgOiB0cnVlLFxuXHRcdH07XG5cdFx0c3VwZXIoY29udGV4dCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0dGhpcy5jc3NDbGFzcyA9ICcnO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHR0eXBlcy5hc3NlcnRUeXBlKHRoaXMuZWxlbWVudCk7XG5cblx0XHRjb25zdCBsYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHRsYWJlbC5jbGFzc0xpc3QuYWRkKCdhY3Rpb24tbGFiZWwnKTtcblx0XHRsYWJlbC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCB0aGlzLmdldERlZmF1bHRBcmlhUm9sZSgpKTtcblxuXHRcdHRoaXMubGFiZWwgPSBsYWJlbDtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQobGFiZWwpO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5sYWJlbCAmJiB0aGlzLm9wdGlvbnMua2V5YmluZGluZyAmJiAhdGhpcy5vcHRpb25zLmtleWJpbmRpbmdOb3RSZW5kZXJlZFdpdGhMYWJlbCkge1xuXHRcdFx0Y29uc3Qga2JMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdGtiTGFiZWwuY2xhc3NMaXN0LmFkZCgna2V5YmluZGluZycpO1xuXHRcdFx0a2JMYWJlbC50ZXh0Q29udGVudCA9IHRoaXMub3B0aW9ucy5rZXliaW5kaW5nO1xuXHRcdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKGtiTGFiZWwpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlQ2xhc3MoKTtcblx0XHR0aGlzLnVwZGF0ZUxhYmVsKCk7XG5cdFx0dGhpcy51cGRhdGVUb29sdGlwKCk7XG5cdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdFx0dGhpcy51cGRhdGVDaGVja2VkKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlZmF1bHRBcmlhUm9sZSgpOiAncHJlc2VudGF0aW9uJyB8ICdtZW51aXRlbScgfCAndGFiJyB8ICdidXR0b24nIHtcblx0XHRpZiAodGhpcy5fYWN0aW9uLmlkID09PSBTZXBhcmF0b3IuSUQpIHtcblx0XHRcdHJldHVybiAncHJlc2VudGF0aW9uJzsgLy8gQSBzZXBhcmF0b3IgaXMgYSBwcmVzZW50YXRpb24gaXRlbVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmlzTWVudSkge1xuXHRcdFx0XHRyZXR1cm4gJ21lbnVpdGVtJztcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5vcHRpb25zLmlzVGFiTGlzdCkge1xuXHRcdFx0XHRyZXR1cm4gJ3RhYic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gJ2J1dHRvbic7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Ly8gT25seSBzZXQgdGhlIHRhYkluZGV4IG9uIHRoZSBlbGVtZW50IG9uY2UgaXQgaXMgYWJvdXQgdG8gZ2V0IGZvY3VzZWRcblx0Ly8gVGhhdCB3YXkgdGhpcyBlbGVtZW50IHdvbnQgYmUgYSB0YWIgc3RvcCB3aGVuIGl0IGlzIG5vdCBuZWVkZWQgIzEwNjQ0MVxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0dGhpcy5sYWJlbC50YWJJbmRleCA9IDA7XG5cdFx0XHR0aGlzLmxhYmVsLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgaXNGb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMubGFiZWwgJiYgdGhpcy5sYWJlbD8udGFiSW5kZXggPT09IDA7XG5cdH1cblxuXHRvdmVycmlkZSBibHVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHR0aGlzLmxhYmVsLnRhYkluZGV4ID0gLTE7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXNhYmxlKGZvY3VzYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHR0aGlzLmxhYmVsLnRhYkluZGV4ID0gZm9jdXNhYmxlID8gMCA6IC0xO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmxhYmVsICYmIHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmFjdGlvbi5sYWJlbDtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0VG9vbHRpcCgpIHtcblx0XHRsZXQgdGl0bGU6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0aWYgKHRoaXMuYWN0aW9uLnRvb2x0aXApIHtcblx0XHRcdHRpdGxlID0gdGhpcy5hY3Rpb24udG9vbHRpcDtcblxuXHRcdH0gZWxzZSBpZiAodGhpcy5hY3Rpb24ubGFiZWwpIHtcblx0XHRcdHRpdGxlID0gdGhpcy5hY3Rpb24ubGFiZWw7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmtleWJpbmRpbmcpIHtcblx0XHRcdFx0dGl0bGUgPSBubHMubG9jYWxpemUoeyBrZXk6ICd0aXRsZUxhYmVsJywgY29tbWVudDogWydhY3Rpb24gdGl0bGUnLCAnYWN0aW9uIGtleWJpbmRpbmcnXSB9LCBcInswfSAoezF9KVwiLCB0aXRsZSwgdGhpcy5vcHRpb25zLmtleWJpbmRpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGl0bGUgPz8gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNsYXNzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNzc0NsYXNzICYmIHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwuY2xhc3NMaXN0LnJlbW92ZSguLi50aGlzLmNzc0NsYXNzLnNwbGl0KCcgJykpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5hY3Rpb24uaWQgPT09IFNlcGFyYXRvci5JRCAmJiB0aGlzLmFjdGlvbi5jbGFzcykge1xuXHRcdFx0dGhpcy5sYWJlbD8uY2xhc3NMaXN0LmFkZCh0aGlzLmFjdGlvbi5jbGFzcyk7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMub3B0aW9ucy5pY29uKSB7XG5cdFx0XHR0aGlzLmNzc0NsYXNzID0gdGhpcy5nZXRDbGFzcygpO1xuXG5cdFx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5hZGQoJ2NvZGljb24nKTtcblx0XHRcdFx0aWYgKHRoaXMuY3NzQ2xhc3MpIHtcblx0XHRcdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5hZGQoLi4udGhpcy5jc3NDbGFzcy5zcGxpdCgnICcpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYWJlbD8uY2xhc3NMaXN0LnJlbW92ZSgnY29kaWNvbicpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFjdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRpZiAodGhpcy5sYWJlbCkge1xuXHRcdFx0XHR0aGlzLmxhYmVsLnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpO1xuXHRcdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5yZW1vdmUoJ2Rpc2FibGVkJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZSgnZGlzYWJsZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdFx0dGhpcy5sYWJlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCAndHJ1ZScpO1xuXHRcdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LmFkZCgnZGlzYWJsZWQnKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQXJpYUxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxhYmVsKSB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRoaXMuZ2V0VG9vbHRpcCgpID8/ICcnO1xuXHRcdFx0dGhpcy5sYWJlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aXRsZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNoZWNrZWQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdGlmICh0aGlzLmFjdGlvbi5jaGVja2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QudG9nZ2xlKCdjaGVja2VkJywgdGhpcy5hY3Rpb24uY2hlY2tlZCk7XG5cdFx0XHRcdGlmICh0aGlzLm9wdGlvbnMuaXNUYWJMaXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5sYWJlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCB0aGlzLmFjdGlvbi5jaGVja2VkID8gJ3RydWUnIDogJ2ZhbHNlJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5sYWJlbC5zZXRBdHRyaWJ1dGUoJ2FyaWEtcHJlc3NlZCcsIHRoaXMuYWN0aW9uLmNoZWNrZWQgPyAndHJ1ZScgOiAnZmFsc2UnKTtcblx0XHRcdFx0XHR0aGlzLmxhYmVsLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5sYWJlbC5jbGFzc0xpc3QucmVtb3ZlKCdjaGVja2VkJyk7XG5cdFx0XHRcdHRoaXMubGFiZWwucmVtb3ZlQXR0cmlidXRlKHRoaXMub3B0aW9ucy5pc1RhYkxpc3QgPyAnYXJpYS1zZWxlY3RlZCcgOiAnYXJpYS1wcmVzc2VkJyk7XG5cdFx0XHRcdHRoaXMubGFiZWwuc2V0QXR0cmlidXRlKCdyb2xlJywgdGhpcy5nZXREZWZhdWx0QXJpYVJvbGUoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZWxlY3RBY3Rpb25WaWV3SXRlbTxUID0gc3RyaW5nPiBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cdHByb3RlY3RlZCBzZWxlY3RCb3g6IFNlbGVjdEJveDtcblxuXHRjb25zdHJ1Y3RvcihjdHg6IHVua25vd24sIGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSwgc2VsZWN0ZWQ6IG51bWJlciwgY29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIsIHN0eWxlczogSVNlbGVjdEJveFN0eWxlcywgc2VsZWN0Qm94T3B0aW9ucz86IElTZWxlY3RCb3hPcHRpb25zKSB7XG5cdFx0c3VwZXIoY3R4LCBhY3Rpb24pO1xuXG5cdFx0dGhpcy5zZWxlY3RCb3ggPSBuZXcgU2VsZWN0Qm94KG9wdGlvbnMsIHNlbGVjdGVkLCBjb250ZXh0Vmlld1Byb3ZpZGVyLCBzdHlsZXMsIHNlbGVjdEJveE9wdGlvbnMpO1xuXHRcdHRoaXMuc2VsZWN0Qm94LnNldEZvY3VzYWJsZShmYWxzZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlbGVjdEJveCk7XG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0c2V0T3B0aW9ucyhvcHRpb25zOiBJU2VsZWN0T3B0aW9uSXRlbVtdLCBzZWxlY3RlZD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuc2VsZWN0Qm94LnNldE9wdGlvbnMob3B0aW9ucywgc2VsZWN0ZWQpO1xuXHR9XG5cblx0c2VsZWN0KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdEJveC5zZWxlY3QoaW5kZXgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlbGVjdEJveC5vbkRpZFNlbGVjdChlID0+IHRoaXMucnVuQWN0aW9uKGUuc2VsZWN0ZWQsIGUuaW5kZXgpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcnVuQWN0aW9uKG9wdGlvbjogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5hY3Rpb25SdW5uZXIucnVuKHRoaXMuX2FjdGlvbiwgdGhpcy5nZXRBY3Rpb25Db250ZXh0KG9wdGlvbiwgaW5kZXgpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRBY3Rpb25Db250ZXh0KG9wdGlvbjogc3RyaW5nLCBpbmRleDogbnVtYmVyKTogVCB8IHN0cmluZyB7XG5cdFx0cmV0dXJuIG9wdGlvbjtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdEJveC5zZXRGb2N1c2FibGUoZm9jdXNhYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VsZWN0Qm94Py5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdEJveD8uYmx1cigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdEJveC5yZW5kZXIoY29udGFpbmVyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdz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
