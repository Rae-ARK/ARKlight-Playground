import { Codicon } from "../../../common/codicons.js";
import { Emitter } from "../../../common/event.js";
import { isMarkdownString } from "../../../common/htmlContent.js";
import { getCodiconAriaLabel, stripIcons } from "../../../common/iconLabels.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { ThemeIcon } from "../../../common/themables.js";
import { $, addDisposableGenericMouseDownListener, addDisposableListener, EventType, isActiveElement, isHTMLElement } from "../../dom.js";
import { BaseActionViewItem } from "../actionbar/actionViewItems.js";
import { HoverStyle } from "../hover/hover.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { Widget } from "../widget.js";
import "./toggle.css";
const unthemedToggleStyles = {
  inputActiveOptionBorder: "#007ACC00",
  inputActiveOptionForeground: "#FFFFFF",
  inputActiveOptionBackground: "#0E639C50"
};
class ToggleActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    super(context, action, options);
    const title = this.options.keybinding ? `${this._action.label} (${this.options.keybinding})` : this._action.label;
    this.toggle = this._register(new Toggle({
      actionClassName: this._action.class,
      isChecked: !!this._action.checked,
      title,
      notFocusable: true,
      inputActiveOptionBackground: options.toggleStyles?.inputActiveOptionBackground,
      inputActiveOptionBorder: options.toggleStyles?.inputActiveOptionBorder,
      inputActiveOptionForeground: options.toggleStyles?.inputActiveOptionForeground
    }));
    this._register(this.toggle.onChange(() => {
      this._action.checked = !!this.toggle && this.toggle.checked;
    }));
  }
  render(container) {
    this.element = container;
    this.element.appendChild(this.toggle.domNode);
    this.updateChecked();
    this.updateEnabled();
  }
  updateEnabled() {
    if (this.toggle) {
      if (this.isEnabled()) {
        this.toggle.enable();
        this.element?.classList.remove("disabled");
      } else {
        this.toggle.disable();
        this.element?.classList.add("disabled");
      }
    }
  }
  updateChecked() {
    this.toggle.checked = !!this._action.checked;
  }
  updateLabel() {
    const title = this.options.keybinding ? `${this._action.label} (${this.options.keybinding})` : this._action.label;
    this.toggle.setTitle(title);
  }
  focus() {
    this.toggle.domNode.tabIndex = 0;
    this.toggle.focus();
  }
  blur() {
    this.toggle.domNode.tabIndex = -1;
    this.toggle.domNode.blur();
  }
  setFocusable(focusable) {
    this.toggle.domNode.tabIndex = focusable ? 0 : -1;
  }
}
class Toggle extends Widget {
  constructor(opts) {
    super();
    this._onChange = this._register(new Emitter());
    this._onKeyDown = this._register(new Emitter());
    this._opts = opts;
    this._title = this._opts.title;
    this._checked = this._opts.isChecked;
    const classes = ["monaco-custom-toggle"];
    if (this._opts.icon) {
      this._icon = this._opts.icon;
      classes.push(...ThemeIcon.asClassNameArray(this._icon));
    }
    if (this._opts.actionClassName) {
      classes.push(...this._opts.actionClassName.split(" "));
    }
    if (this._checked) {
      classes.push("checked");
    }
    this.domNode = document.createElement("div");
    this._register(getBaseLayerHoverDelegate().setupDelayedHover(this.domNode, () => ({
      content: !isMarkdownString(this._title) && !isHTMLElement(this._title) ? stripIcons(this._title) : this._title,
      style: HoverStyle.Pointer
    }), this._opts.hoverLifecycleOptions));
    this.domNode.classList.add(...classes);
    if (!this._opts.notFocusable) {
      this.domNode.tabIndex = 0;
    }
    this.domNode.setAttribute("role", "checkbox");
    this.domNode.setAttribute("aria-checked", String(this._checked));
    this.setTitle(this._opts.title);
    this.applyStyles();
    this.onclick(this.domNode, (ev) => {
      if (this.enabled) {
        this.checked = !this._checked;
        this._onChange.fire(false);
        ev.preventDefault();
        ev.stopPropagation();
      }
    });
    this._register(this.ignoreGesture(this.domNode));
    this.onkeydown(this.domNode, (keyboardEvent) => {
      if (!this.enabled) {
        return;
      }
      if (keyboardEvent.keyCode === KeyCode.Space || keyboardEvent.keyCode === KeyCode.Enter) {
        this.checked = !this._checked;
        this._onChange.fire(true);
        keyboardEvent.preventDefault();
        keyboardEvent.stopPropagation();
        return;
      }
      this._onKeyDown.fire(keyboardEvent);
    });
  }
  get onChange() {
    return this._onChange.event;
  }
  get onKeyDown() {
    return this._onKeyDown.event;
  }
  get enabled() {
    return this.domNode.getAttribute("aria-disabled") !== "true";
  }
  focus() {
    this.domNode.focus();
  }
  get checked() {
    return this._checked;
  }
  set checked(newIsChecked) {
    this._checked = newIsChecked;
    this.domNode.setAttribute("aria-checked", String(this._checked));
    this.domNode.classList.toggle("checked", this._checked);
    this.applyStyles();
  }
  setIcon(icon) {
    if (this._icon) {
      this.domNode.classList.remove(...ThemeIcon.asClassNameArray(this._icon));
    }
    this._icon = icon;
    if (this._icon) {
      this.domNode.classList.add(...ThemeIcon.asClassNameArray(this._icon));
    }
  }
  width() {
    return 2 + 2 + 2 + 16;
  }
  applyStyles() {
    if (this.domNode) {
      this.domNode.style.borderColor = this._checked && this._opts.inputActiveOptionBorder || "";
      this.domNode.style.color = this._checked && this._opts.inputActiveOptionForeground || "inherit";
      this.domNode.style.backgroundColor = this._checked && this._opts.inputActiveOptionBackground || "";
    }
  }
  enable() {
    this.domNode.setAttribute("aria-disabled", String(false));
    this.domNode.classList.remove("disabled");
    if (!this._opts.notFocusable) {
      this.domNode.tabIndex = 0;
    }
  }
  disable() {
    this.domNode.setAttribute("aria-disabled", String(true));
    this.domNode.classList.add("disabled");
    if (!this._opts.notFocusable) {
      this.domNode.tabIndex = -1;
    }
  }
  setTitle(newTitle) {
    this._title = newTitle;
    const ariaLabel = typeof newTitle === "string" ? newTitle : isMarkdownString(newTitle) ? newTitle.value : newTitle.textContent;
    this.domNode.setAttribute("aria-label", getCodiconAriaLabel(ariaLabel));
  }
  set visible(visible) {
    this.domNode.style.display = visible ? "" : "none";
  }
  get visible() {
    return this.domNode.style.display !== "none";
  }
}
class BaseCheckbox extends Widget {
  constructor(checkbox, domNode, styles) {
    super();
    this.checkbox = checkbox;
    this.domNode = domNode;
    this.styles = styles;
    this._onChange = this._register(new Emitter());
    this.onChange = this._onChange.event;
    this.applyStyles();
  }
  get enabled() {
    return this.checkbox.enabled;
  }
  focus() {
    this.domNode.focus();
  }
  hasFocus() {
    return isActiveElement(this.domNode);
  }
  enable() {
    this.checkbox.enable();
    this.applyStyles(true);
  }
  disable() {
    this.checkbox.disable();
    this.applyStyles(false);
  }
  setTitle(newTitle) {
    this.checkbox.setTitle(newTitle);
  }
  applyStyles(enabled = this.enabled) {
    this.domNode.style.color = (enabled ? this.styles.checkboxForeground : this.styles.checkboxDisabledForeground) || "";
    this.domNode.style.backgroundColor = (enabled ? this.styles.checkboxBackground : this.styles.checkboxDisabledBackground) || "";
    this.domNode.style.borderColor = (enabled ? this.styles.checkboxBorder : this.styles.checkboxDisabledBackground) || "";
    const size = this.styles.size || 18;
    this.domNode.style.width = this.domNode.style.height = this.domNode.style.fontSize = `${size}px`;
    this.domNode.style.fontSize = `${size - 2}px`;
  }
}
BaseCheckbox.CLASS_NAME = "monaco-checkbox";
class Checkbox extends BaseCheckbox {
  constructor(title, isChecked, styles) {
    const toggle = new Toggle({ title, isChecked, icon: Codicon.check, actionClassName: BaseCheckbox.CLASS_NAME, hoverLifecycleOptions: styles.hoverLifecycleOptions, ...unthemedToggleStyles });
    super(toggle, toggle.domNode, styles);
    this._register(toggle);
    this._register(this.checkbox.onChange((keyboard) => {
      this.applyStyles();
      this._onChange.fire(keyboard);
    }));
  }
  get checked() {
    return this.checkbox.checked;
  }
  set checked(newIsChecked) {
    this.checkbox.checked = newIsChecked;
    this.applyStyles();
  }
  applyStyles(enabled) {
    if (this.checkbox.checked) {
      this.checkbox.setIcon(Codicon.check);
    } else {
      this.checkbox.setIcon(void 0);
    }
    super.applyStyles(enabled);
  }
}
class TriStateCheckbox extends BaseCheckbox {
  constructor(title, _state, styles) {
    let icon;
    switch (_state) {
      case true:
        icon = Codicon.check;
        break;
      case "mixed":
        icon = Codicon.dash;
        break;
      case false:
        icon = void 0;
        break;
    }
    const checkbox = new Toggle({
      title,
      isChecked: _state === true,
      icon,
      actionClassName: Checkbox.CLASS_NAME,
      hoverLifecycleOptions: styles.hoverLifecycleOptions,
      ...unthemedToggleStyles
    });
    super(
      checkbox,
      checkbox.domNode,
      styles
    );
    this._state = _state;
    this._register(checkbox);
    this._register(this.checkbox.onChange((keyboard) => {
      this._state = this.checkbox.checked;
      this.applyStyles();
      this._onChange.fire(keyboard);
    }));
  }
  get checked() {
    return this._state;
  }
  set checked(newState) {
    if (this._state !== newState) {
      this._state = newState;
      this.checkbox.checked = newState === true;
      this.applyStyles();
    }
  }
  applyStyles(enabled) {
    switch (this._state) {
      case true:
        this.checkbox.setIcon(Codicon.check);
        break;
      case "mixed":
        this.checkbox.setIcon(Codicon.dash);
        break;
      case false:
        this.checkbox.setIcon(void 0);
        break;
    }
    super.applyStyles(enabled);
  }
}
class CheckboxActionViewItem extends BaseActionViewItem {
  constructor(context, action, options) {
    super(context, action, options);
    this.toggle = this._register(new Checkbox(this._action.label, !!this._action.checked, options.checkboxStyles));
    this._register(this.toggle.onChange(() => this.onChange()));
  }
  render(container) {
    this.element = container;
    this.element.classList.add("checkbox-action-item");
    this.element.appendChild(this.toggle.domNode);
    if (this.options.label && this._action.label) {
      const label = this.element.appendChild($("span.checkbox-label", void 0, this._action.label));
      this._register(addDisposableGenericMouseDownListener(label, (e) => {
        e.preventDefault();
        if (this.isEnabled()) {
          this.focus();
        }
      }));
      this._register(addDisposableListener(label, EventType.CLICK, (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (this.isEnabled()) {
          this.toggle.checked = !this.toggle.checked;
          this.onChange();
        }
      }));
    }
    this.updateEnabled();
    this.updateClass();
    this.updateChecked();
    this.updateTooltip();
  }
  onChange() {
    this._action.checked = !!this.toggle && this.toggle.checked;
    this.actionRunner.run(this._action, this._context);
  }
  updateEnabled() {
    if (this.isEnabled()) {
      this.toggle.enable();
    } else {
      this.toggle.disable();
    }
    if (this.action.enabled) {
      this.element?.classList.remove("disabled");
    } else {
      this.element?.classList.add("disabled");
    }
  }
  updateChecked() {
    this.toggle.checked = !!this._action.checked;
  }
  updateClass() {
    if (this.cssClass) {
      this.toggle.domNode.classList.remove(...this.cssClass.split(" "));
    }
    this.cssClass = this.getClass();
    if (this.cssClass) {
      this.toggle.domNode.classList.add(...this.cssClass.split(" "));
    }
  }
  focus() {
    this.toggle.domNode.tabIndex = 0;
    this.toggle.focus();
  }
  blur() {
    this.toggle.domNode.tabIndex = -1;
    this.toggle.domNode.blur();
  }
  setFocusable(focusable) {
    this.toggle.domNode.tabIndex = focusable ? 0 : -1;
  }
}
function createToggleActionViewItemProvider(toggleStyles) {
  return (action, options) => {
    if (action.checked !== void 0) {
      return new ToggleActionViewItem(null, action, { ...options, toggleStyles });
    }
    return void 0;
  };
}
export {
  Checkbox,
  CheckboxActionViewItem,
  Toggle,
  ToggleActionViewItem,
  TriStateCheckbox,
  createToggleActionViewItemProvider,
  unthemedToggleStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGdldENvZGljb25BcmlhTGFiZWwsIHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGlzQWN0aXZlRWxlbWVudCwgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1Qcm92aWRlciB9IGZyb20gJy4uL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSG92ZXJTdHlsZSwgSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucyB9IGZyb20gJy4uL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlMi5qcyc7XG5pbXBvcnQgeyBXaWRnZXQgfSBmcm9tICcuLi93aWRnZXQuanMnO1xuaW1wb3J0ICcuL3RvZ2dsZS5jc3MnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUb2dnbGVPcHRzIGV4dGVuZHMgSVRvZ2dsZVN0eWxlcyB7XG5cdHJlYWRvbmx5IGFjdGlvbkNsYXNzTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpc0NoZWNrZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG5vdEZvY3VzYWJsZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhvdmVyTGlmZWN5Y2xlT3B0aW9ucz86IElIb3ZlckxpZmVjeWNsZU9wdGlvbnM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRvZ2dsZVN0eWxlcyB7XG5cdHJlYWRvbmx5IGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2hlY2tib3hTdHlsZXMge1xuXHRyZWFkb25seSBjaGVja2JveEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hlY2tib3hCb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY2hlY2tib3hGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNoZWNrYm94RGlzYWJsZWRCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNoZWNrYm94RGlzYWJsZWRGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNpemU/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGhvdmVyTGlmZWN5Y2xlT3B0aW9ucz86IElIb3ZlckxpZmVjeWNsZU9wdGlvbnM7XG59XG5cbmV4cG9ydCBjb25zdCB1bnRoZW1lZFRvZ2dsZVN0eWxlcyA9IHtcblx0aW5wdXRBY3RpdmVPcHRpb25Cb3JkZXI6ICcjMDA3QUNDMDAnLFxuXHRpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQ6ICcjRkZGRkZGJyxcblx0aW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kOiAnIzBFNjM5QzUwJ1xufTtcblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdG9nZ2xlOiBUb2dnbGU7XG5cblx0Y29uc3RydWN0b3IoY29udGV4dDogdW5rbm93biwgYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSB7XG5cdFx0c3VwZXIoY29udGV4dCwgYWN0aW9uLCBvcHRpb25zKTtcblxuXHRcdGNvbnN0IHRpdGxlID0gKDxJQWN0aW9uVmlld0l0ZW1PcHRpb25zPnRoaXMub3B0aW9ucykua2V5YmluZGluZyA/XG5cdFx0XHRgJHt0aGlzLl9hY3Rpb24ubGFiZWx9ICgkeyg8SUFjdGlvblZpZXdJdGVtT3B0aW9ucz50aGlzLm9wdGlvbnMpLmtleWJpbmRpbmd9KWAgOiB0aGlzLl9hY3Rpb24ubGFiZWw7XG5cdFx0dGhpcy50b2dnbGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgVG9nZ2xlKHtcblx0XHRcdGFjdGlvbkNsYXNzTmFtZTogdGhpcy5fYWN0aW9uLmNsYXNzLFxuXHRcdFx0aXNDaGVja2VkOiAhIXRoaXMuX2FjdGlvbi5jaGVja2VkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRub3RGb2N1c2FibGU6IHRydWUsXG5cdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQ6IG9wdGlvbnMudG9nZ2xlU3R5bGVzPy5pbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQsXG5cdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcjogb3B0aW9ucy50b2dnbGVTdHlsZXM/LmlucHV0QWN0aXZlT3B0aW9uQm9yZGVyLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kOiBvcHRpb25zLnRvZ2dsZVN0eWxlcz8uaW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kLFxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRvZ2dsZS5vbkNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9hY3Rpb24uY2hlY2tlZCA9ICEhdGhpcy50b2dnbGUgJiYgdGhpcy50b2dnbGUuY2hlY2tlZDtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuZWxlbWVudCA9IGNvbnRhaW5lcjtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy50b2dnbGUuZG9tTm9kZSk7XG5cblx0XHR0aGlzLnVwZGF0ZUNoZWNrZWQoKTtcblx0XHR0aGlzLnVwZGF0ZUVuYWJsZWQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnRvZ2dsZSkge1xuXHRcdFx0aWYgKHRoaXMuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0dGhpcy50b2dnbGUuZW5hYmxlKCk7XG5cdFx0XHRcdHRoaXMuZWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZSgnZGlzYWJsZWQnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudG9nZ2xlLmRpc2FibGUoKTtcblx0XHRcdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QuYWRkKCdkaXNhYmxlZCcpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDaGVja2VkKCk6IHZvaWQge1xuXHRcdHRoaXMudG9nZ2xlLmNoZWNrZWQgPSAhIXRoaXMuX2FjdGlvbi5jaGVja2VkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUxhYmVsKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRpdGxlID0gKDxJQWN0aW9uVmlld0l0ZW1PcHRpb25zPnRoaXMub3B0aW9ucykua2V5YmluZGluZyA/XG5cdFx0XHRgJHt0aGlzLl9hY3Rpb24ubGFiZWx9ICgkeyg8SUFjdGlvblZpZXdJdGVtT3B0aW9ucz50aGlzLm9wdGlvbnMpLmtleWJpbmRpbmd9KWAgOiB0aGlzLl9hY3Rpb24ubGFiZWw7XG5cdFx0dGhpcy50b2dnbGUuc2V0VGl0bGUodGl0bGUpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGUuZG9tTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy50b2dnbGUuZm9jdXMoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGUuZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdHRoaXMudG9nZ2xlLmRvbU5vZGUuYmx1cigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXNhYmxlKGZvY3VzYWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMudG9nZ2xlLmRvbU5vZGUudGFiSW5kZXggPSBmb2N1c2FibGUgPyAwIDogLTE7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlIGV4dGVuZHMgV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXHRnZXQgb25DaGFuZ2UoKTogRXZlbnQ8Ym9vbGVhbiAvKiB2aWEga2V5Ym9hcmQgKi8+IHsgcmV0dXJuIHRoaXMuX29uQ2hhbmdlLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25LZXlEb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUtleWJvYXJkRXZlbnQ+KCkpO1xuXHRnZXQgb25LZXlEb3duKCk6IEV2ZW50PElLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLl9vbktleURvd24uZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcHRzOiBJVG9nZ2xlT3B0cztcblx0cHJpdmF0ZSBfdGl0bGU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9pY29uOiBUaGVtZUljb24gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgX2NoZWNrZWQ6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3Iob3B0czogSVRvZ2dsZU9wdHMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fb3B0cyA9IG9wdHM7XG5cdFx0dGhpcy5fdGl0bGUgPSB0aGlzLl9vcHRzLnRpdGxlO1xuXHRcdHRoaXMuX2NoZWNrZWQgPSB0aGlzLl9vcHRzLmlzQ2hlY2tlZDtcblxuXHRcdGNvbnN0IGNsYXNzZXMgPSBbJ21vbmFjby1jdXN0b20tdG9nZ2xlJ107XG5cdFx0aWYgKHRoaXMuX29wdHMuaWNvbikge1xuXHRcdFx0dGhpcy5faWNvbiA9IHRoaXMuX29wdHMuaWNvbjtcblx0XHRcdGNsYXNzZXMucHVzaCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheSh0aGlzLl9pY29uKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9vcHRzLmFjdGlvbkNsYXNzTmFtZSkge1xuXHRcdFx0Y2xhc3Nlcy5wdXNoKC4uLnRoaXMuX29wdHMuYWN0aW9uQ2xhc3NOYW1lLnNwbGl0KCcgJykpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2hlY2tlZCkge1xuXHRcdFx0Y2xhc3Nlcy5wdXNoKCdjaGVja2VkJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSgpLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuZG9tTm9kZSwgKCkgPT4gKHtcblx0XHRcdGNvbnRlbnQ6ICFpc01hcmtkb3duU3RyaW5nKHRoaXMuX3RpdGxlKSAmJiAhaXNIVE1MRWxlbWVudCh0aGlzLl90aXRsZSkgPyBzdHJpcEljb25zKHRoaXMuX3RpdGxlKSA6IHRoaXMuX3RpdGxlLFxuXHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHR9KSwgdGhpcy5fb3B0cy5ob3ZlckxpZmVjeWNsZU9wdGlvbnMpKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCguLi5jbGFzc2VzKTtcblx0XHRpZiAoIXRoaXMuX29wdHMubm90Rm9jdXNhYmxlKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdH1cblx0XHR0aGlzLmRvbU5vZGUuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2NoZWNrYm94Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1jaGVja2VkJywgU3RyaW5nKHRoaXMuX2NoZWNrZWQpKTtcblxuXHRcdHRoaXMuc2V0VGl0bGUodGhpcy5fb3B0cy50aXRsZSk7XG5cdFx0dGhpcy5hcHBseVN0eWxlcygpO1xuXG5cdFx0dGhpcy5vbmNsaWNrKHRoaXMuZG9tTm9kZSwgKGV2KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5lbmFibGVkKSB7XG5cdFx0XHRcdHRoaXMuY2hlY2tlZCA9ICF0aGlzLl9jaGVja2VkO1xuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKGZhbHNlKTtcblx0XHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXYuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmlnbm9yZUdlc3R1cmUodGhpcy5kb21Ob2RlKSk7XG5cblx0XHR0aGlzLm9ua2V5ZG93bih0aGlzLmRvbU5vZGUsIChrZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZW5hYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChrZXlib2FyZEV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UgfHwga2V5Ym9hcmRFdmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkVudGVyKSB7XG5cdFx0XHRcdHRoaXMuY2hlY2tlZCA9ICF0aGlzLl9jaGVja2VkO1xuXHRcdFx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHRydWUpO1xuXHRcdFx0XHRrZXlib2FyZEV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGtleWJvYXJkRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25LZXlEb3duLmZpcmUoa2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlLmdldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcpICE9PSAndHJ1ZSc7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmRvbU5vZGUuZm9jdXMoKTtcblx0fVxuXG5cdGdldCBjaGVja2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGVja2VkO1xuXHR9XG5cblx0c2V0IGNoZWNrZWQobmV3SXNDaGVja2VkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY2hlY2tlZCA9IG5ld0lzQ2hlY2tlZDtcblxuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtY2hlY2tlZCcsIFN0cmluZyh0aGlzLl9jaGVja2VkKSk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2NoZWNrZWQnLCB0aGlzLl9jaGVja2VkKTtcblxuXHRcdHRoaXMuYXBwbHlTdHlsZXMoKTtcblx0fVxuXG5cdHNldEljb24oaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2ljb24pIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMuX2ljb24pKTtcblx0XHR9XG5cdFx0dGhpcy5faWNvbiA9IGljb247XG5cdFx0aWYgKHRoaXMuX2ljb24pIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMuX2ljb24pKTtcblx0XHR9XG5cdH1cblxuXHR3aWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiAyIC8qbWFyZ2luIGxlZnQqLyArIDIgLypib3JkZXIqLyArIDIgLypwYWRkaW5nKi8gKyAxNiAvKiBpY29uIHdpZHRoICovO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFwcGx5U3R5bGVzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmRvbU5vZGUpIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5ib3JkZXJDb2xvciA9ICh0aGlzLl9jaGVja2VkICYmIHRoaXMuX29wdHMuaW5wdXRBY3RpdmVPcHRpb25Cb3JkZXIpIHx8ICcnO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmNvbG9yID0gKHRoaXMuX2NoZWNrZWQgJiYgdGhpcy5fb3B0cy5pbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQpIHx8ICdpbmhlcml0Jztcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAodGhpcy5fY2hlY2tlZCAmJiB0aGlzLl9vcHRzLmlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZCkgfHwgJyc7XG5cdFx0fVxuXHR9XG5cblx0ZW5hYmxlKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcoZmFsc2UpKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSgnZGlzYWJsZWQnKTtcblx0XHRpZiAoIXRoaXMuX29wdHMubm90Rm9jdXNhYmxlKSB7XG5cdFx0XHR0aGlzLmRvbU5vZGUudGFiSW5kZXggPSAwO1xuXHRcdH1cblx0fVxuXG5cdGRpc2FibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyh0cnVlKSk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0aWYgKCF0aGlzLl9vcHRzLm5vdEZvY3VzYWJsZSkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdFx0fVxuXHR9XG5cblx0c2V0VGl0bGUobmV3VGl0bGU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGUgPSBuZXdUaXRsZTtcblxuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IHR5cGVvZiBuZXdUaXRsZSA9PT0gJ3N0cmluZycgPyBuZXdUaXRsZSA6IGlzTWFya2Rvd25TdHJpbmcobmV3VGl0bGUpID8gbmV3VGl0bGUudmFsdWUgOiBuZXdUaXRsZS50ZXh0Q29udGVudDtcblxuXHRcdHRoaXMuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBnZXRDb2RpY29uQXJpYUxhYmVsKGFyaWFMYWJlbCkpO1xuXHR9XG5cblx0c2V0IHZpc2libGUodmlzaWJsZTogYm9vbGVhbikge1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gdmlzaWJsZSA/ICcnIDogJ25vbmUnO1xuXHR9XG5cblx0Z2V0IHZpc2libGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XG5cdH1cbn1cblxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlQ2hlY2tib3ggZXh0ZW5kcyBXaWRnZXQge1xuXHRzdGF0aWMgcmVhZG9ubHkgQ0xBU1NfTkFNRSA9ICdtb25hY28tY2hlY2tib3gnO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25DaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxib29sZWFuPigpKTtcblx0cmVhZG9ubHkgb25DaGFuZ2U6IEV2ZW50PGJvb2xlYW4gLyogdmlhIGtleWJvYXJkICovPiA9IHRoaXMuX29uQ2hhbmdlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBjaGVja2JveDogVG9nZ2xlLFxuXHRcdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBzdHlsZXM6IElDaGVja2JveFN0eWxlc1xuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5hcHBseVN0eWxlcygpO1xuXHR9XG5cblx0Z2V0IGVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hlY2tib3guZW5hYmxlZDtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0aGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzQWN0aXZlRWxlbWVudCh0aGlzLmRvbU5vZGUpO1xuXHR9XG5cblx0ZW5hYmxlKCk6IHZvaWQge1xuXHRcdHRoaXMuY2hlY2tib3guZW5hYmxlKCk7XG5cdFx0dGhpcy5hcHBseVN0eWxlcyh0cnVlKTtcblx0fVxuXG5cdGRpc2FibGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja2JveC5kaXNhYmxlKCk7XG5cdFx0dGhpcy5hcHBseVN0eWxlcyhmYWxzZSk7XG5cdH1cblxuXHRzZXRUaXRsZShuZXdUaXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5jaGVja2JveC5zZXRUaXRsZShuZXdUaXRsZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXBwbHlTdHlsZXMoZW5hYmxlZCA9IHRoaXMuZW5hYmxlZCk6IHZvaWQge1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5jb2xvciA9IChlbmFibGVkID8gdGhpcy5zdHlsZXMuY2hlY2tib3hGb3JlZ3JvdW5kIDogdGhpcy5zdHlsZXMuY2hlY2tib3hEaXNhYmxlZEZvcmVncm91bmQpIHx8ICcnO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAoZW5hYmxlZCA/IHRoaXMuc3R5bGVzLmNoZWNrYm94QmFja2dyb3VuZCA6IHRoaXMuc3R5bGVzLmNoZWNrYm94RGlzYWJsZWRCYWNrZ3JvdW5kKSB8fCAnJztcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuYm9yZGVyQ29sb3IgPSAoZW5hYmxlZCA/IHRoaXMuc3R5bGVzLmNoZWNrYm94Qm9yZGVyIDogdGhpcy5zdHlsZXMuY2hlY2tib3hEaXNhYmxlZEJhY2tncm91bmQpIHx8ICcnO1xuXG5cdFx0Y29uc3Qgc2l6ZSA9IHRoaXMuc3R5bGVzLnNpemUgfHwgMTg7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLndpZHRoID1cblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPVxuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmZvbnRTaXplID0gYCR7c2l6ZX1weGA7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmZvbnRTaXplID0gYCR7c2l6ZSAtIDJ9cHhgO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBDaGVja2JveCBleHRlbmRzIEJhc2VDaGVja2JveCB7XG5cdGNvbnN0cnVjdG9yKHRpdGxlOiBzdHJpbmcsIGlzQ2hlY2tlZDogYm9vbGVhbiwgc3R5bGVzOiBJQ2hlY2tib3hTdHlsZXMpIHtcblx0XHRjb25zdCB0b2dnbGUgPSBuZXcgVG9nZ2xlKHsgdGl0bGUsIGlzQ2hlY2tlZCwgaWNvbjogQ29kaWNvbi5jaGVjaywgYWN0aW9uQ2xhc3NOYW1lOiBCYXNlQ2hlY2tib3guQ0xBU1NfTkFNRSwgaG92ZXJMaWZlY3ljbGVPcHRpb25zOiBzdHlsZXMuaG92ZXJMaWZlY3ljbGVPcHRpb25zLCAuLi51bnRoZW1lZFRvZ2dsZVN0eWxlcyB9KTtcblx0XHRzdXBlcih0b2dnbGUsIHRvZ2dsZS5kb21Ob2RlLCBzdHlsZXMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9nZ2xlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoZWNrYm94Lm9uQ2hhbmdlKGtleWJvYXJkID0+IHtcblx0XHRcdHRoaXMuYXBwbHlTdHlsZXMoKTtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoa2V5Ym9hcmQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBjaGVja2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNoZWNrYm94LmNoZWNrZWQ7XG5cdH1cblxuXHRzZXQgY2hlY2tlZChuZXdJc0NoZWNrZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmNoZWNrYm94LmNoZWNrZWQgPSBuZXdJc0NoZWNrZWQ7XG5cdFx0dGhpcy5hcHBseVN0eWxlcygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFwcGx5U3R5bGVzKGVuYWJsZWQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY2hlY2tib3guY2hlY2tlZCkge1xuXHRcdFx0dGhpcy5jaGVja2JveC5zZXRJY29uKENvZGljb24uY2hlY2spO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNoZWNrYm94LnNldEljb24odW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0c3VwZXIuYXBwbHlTdHlsZXMoZW5hYmxlZCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRyaVN0YXRlQ2hlY2tib3ggZXh0ZW5kcyBCYXNlQ2hlY2tib3gge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHR0aXRsZTogc3RyaW5nLFxuXHRcdHByaXZhdGUgX3N0YXRlOiBib29sZWFuIHwgJ21peGVkJyxcblx0XHRzdHlsZXM6IElDaGVja2JveFN0eWxlc1xuXHQpIHtcblx0XHRsZXQgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAoX3N0YXRlKSB7XG5cdFx0XHRjYXNlIHRydWU6XG5cdFx0XHRcdGljb24gPSBDb2RpY29uLmNoZWNrO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ21peGVkJzpcblx0XHRcdFx0aWNvbiA9IENvZGljb24uZGFzaDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIGZhbHNlOlxuXHRcdFx0XHRpY29uID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0Y29uc3QgY2hlY2tib3ggPSBuZXcgVG9nZ2xlKHtcblx0XHRcdHRpdGxlLFxuXHRcdFx0aXNDaGVja2VkOiBfc3RhdGUgPT09IHRydWUsXG5cdFx0XHRpY29uLFxuXHRcdFx0YWN0aW9uQ2xhc3NOYW1lOiBDaGVja2JveC5DTEFTU19OQU1FLFxuXHRcdFx0aG92ZXJMaWZlY3ljbGVPcHRpb25zOiBzdHlsZXMuaG92ZXJMaWZlY3ljbGVPcHRpb25zLFxuXHRcdFx0Li4udW50aGVtZWRUb2dnbGVTdHlsZXNcblx0XHR9KTtcblx0XHRzdXBlcihcblx0XHRcdGNoZWNrYm94LFxuXHRcdFx0Y2hlY2tib3guZG9tTm9kZSxcblx0XHRcdHN0eWxlc1xuXHRcdCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihjaGVja2JveCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGVja2JveC5vbkNoYW5nZShrZXlib2FyZCA9PiB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IHRoaXMuY2hlY2tib3guY2hlY2tlZDtcblx0XHRcdHRoaXMuYXBwbHlTdHlsZXMoKTtcblx0XHRcdHRoaXMuX29uQ2hhbmdlLmZpcmUoa2V5Ym9hcmQpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldCBjaGVja2VkKCk6IGJvb2xlYW4gfCAnbWl4ZWQnIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGU7XG5cdH1cblxuXHRzZXQgY2hlY2tlZChuZXdTdGF0ZTogYm9vbGVhbiB8ICdtaXhlZCcpIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IG5ld1N0YXRlKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdFx0dGhpcy5jaGVja2JveC5jaGVja2VkID0gbmV3U3RhdGUgPT09IHRydWU7XG5cdFx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFwcGx5U3R5bGVzKGVuYWJsZWQ/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0c3dpdGNoICh0aGlzLl9zdGF0ZSkge1xuXHRcdFx0Y2FzZSB0cnVlOlxuXHRcdFx0XHR0aGlzLmNoZWNrYm94LnNldEljb24oQ29kaWNvbi5jaGVjayk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnbWl4ZWQnOlxuXHRcdFx0XHR0aGlzLmNoZWNrYm94LnNldEljb24oQ29kaWNvbi5kYXNoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIGZhbHNlOlxuXHRcdFx0XHR0aGlzLmNoZWNrYm94LnNldEljb24odW5kZWZpbmVkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHN1cGVyLmFwcGx5U3R5bGVzKGVuYWJsZWQpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoZWNrYm94QWN0aW9uVmlld0l0ZW1PcHRpb25zIGV4dGVuZHMgSUFjdGlvblZpZXdJdGVtT3B0aW9ucyB7XG5cdGNoZWNrYm94U3R5bGVzOiBJQ2hlY2tib3hTdHlsZXM7XG59XG5cbmV4cG9ydCBjbGFzcyBDaGVja2JveEFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQmFzZUFjdGlvblZpZXdJdGVtIHtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgdG9nZ2xlOiBDaGVja2JveDtcblx0cHJpdmF0ZSBjc3NDbGFzcz86IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihjb250ZXh0OiB1bmtub3duLCBhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElDaGVja2JveEFjdGlvblZpZXdJdGVtT3B0aW9ucykge1xuXHRcdHN1cGVyKGNvbnRleHQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cblx0XHR0aGlzLnRvZ2dsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDaGVja2JveCh0aGlzLl9hY3Rpb24ubGFiZWwsICEhdGhpcy5fYWN0aW9uLmNoZWNrZWQsIG9wdGlvbnMuY2hlY2tib3hTdHlsZXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRvZ2dsZS5vbkNoYW5nZSgoKSA9PiB0aGlzLm9uQ2hhbmdlKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50ID0gY29udGFpbmVyO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGVja2JveC1hY3Rpb24taXRlbScpO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLnRvZ2dsZS5kb21Ob2RlKTtcblx0XHRpZiAoKDxJQWN0aW9uVmlld0l0ZW1PcHRpb25zPnRoaXMub3B0aW9ucykubGFiZWwgJiYgdGhpcy5fYWN0aW9uLmxhYmVsKSB7XG5cdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdzcGFuLmNoZWNrYm94LWxhYmVsJywgdW5kZWZpbmVkLCB0aGlzLl9hY3Rpb24ubGFiZWwpKTtcblx0XHRcdC8vIEZvY3VzIHRoZSBjaGVja2JveCB3aGVuIHRoZSAobm9uLWZvY3VzYWJsZSkgbGFiZWwgaXMgY2xpY2tlZCwgbWlycm9yaW5nXG5cdFx0XHQvLyBuYXRpdmUgYDxsYWJlbD5gIGJlaGF2aW9yLiBUaGlzIGlzIGRvbmUgb24gbW91c2Vkb3duLCB3aXRoIHRoZSBkZWZhdWx0XG5cdFx0XHQvLyBwcmV2ZW50ZWQsIHNvIGZvY3VzIGRvZXMgbm90IGZpcnN0IGxhbmQgb24gYSBmb2N1c2FibGUgYW5jZXN0b3IuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKGxhYmVsLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihsYWJlbCwgRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLnRvZ2dsZS5jaGVja2VkID0gIXRoaXMudG9nZ2xlLmNoZWNrZWQ7XG5cdFx0XHRcdFx0dGhpcy5vbkNoYW5nZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVFbmFibGVkKCk7XG5cdFx0dGhpcy51cGRhdGVDbGFzcygpO1xuXHRcdHRoaXMudXBkYXRlQ2hlY2tlZCgpO1xuXHRcdHRoaXMudXBkYXRlVG9vbHRpcCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3Rpb24uY2hlY2tlZCA9ICEhdGhpcy50b2dnbGUgJiYgdGhpcy50b2dnbGUuY2hlY2tlZDtcblx0XHR0aGlzLmFjdGlvblJ1bm5lci5ydW4odGhpcy5fYWN0aW9uLCB0aGlzLl9jb250ZXh0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFbmFibGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZS5lbmFibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50b2dnbGUuZGlzYWJsZSgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5hY3Rpb24uZW5hYmxlZCkge1xuXHRcdFx0dGhpcy5lbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNoZWNrZWQoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGUuY2hlY2tlZCA9ICEhdGhpcy5fYWN0aW9uLmNoZWNrZWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlQ2xhc3MoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3NzQ2xhc3MpIHtcblx0XHRcdHRoaXMudG9nZ2xlLmRvbU5vZGUuY2xhc3NMaXN0LnJlbW92ZSguLi50aGlzLmNzc0NsYXNzLnNwbGl0KCcgJykpO1xuXHRcdH1cblx0XHR0aGlzLmNzc0NsYXNzID0gdGhpcy5nZXRDbGFzcygpO1xuXHRcdGlmICh0aGlzLmNzc0NsYXNzKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZS5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoLi4udGhpcy5jc3NDbGFzcy5zcGxpdCgnICcpKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZS5kb21Ob2RlLnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLnRvZ2dsZS5mb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZS5kb21Ob2RlLnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy50b2dnbGUuZG9tTm9kZS5ibHVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGUuZG9tTm9kZS50YWJJbmRleCA9IGZvY3VzYWJsZSA/IDAgOiAtMTtcblx0fVxuXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBhY3Rpb24gdmlldyBpdGVtIHByb3ZpZGVyIHRoYXQgcmVuZGVycyB0b2dnbGVzIGZvciBhY3Rpb25zIHdpdGggYSBjaGVja2VkIHN0YXRlXG4gKiBhbmQgZmFsbHMgYmFjayB0byBkZWZhdWx0IGJ1dHRvbiByZW5kZXJpbmcgZm9yIHJlZ3VsYXIgYWN0aW9ucy5cbiAqXG4gKiBAcGFyYW0gdG9nZ2xlU3R5bGVzIC0gT3B0aW9uYWwgc3R5bGVzIHRvIGFwcGx5IHRvIHRvZ2dsZSBpdGVtc1xuICogQHJldHVybnMgQW4gSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIgdGhhdCBjYW4gYmUgdXNlZCB3aXRoIEFjdGlvbkJhclxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVG9nZ2xlQWN0aW9uVmlld0l0ZW1Qcm92aWRlcih0b2dnbGVTdHlsZXM/OiBJVG9nZ2xlU3R5bGVzKTogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIge1xuXHRyZXR1cm4gKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUFjdGlvblZpZXdJdGVtT3B0aW9ucykgPT4ge1xuXHRcdC8vIE9ubHkgcmVuZGVyIGFzIGEgdG9nZ2xlIGlmIHRoZSBhY3Rpb24gaGFzIGEgY2hlY2tlZCBwcm9wZXJ0eVxuXHRcdGlmIChhY3Rpb24uY2hlY2tlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFRvZ2dsZUFjdGlvblZpZXdJdGVtKG51bGwsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCB0b2dnbGVTdHlsZXMgfSk7XG5cdFx0fVxuXHRcdC8vIFJldHVybiB1bmRlZmluZWQgdG8gZmFsbCBiYWNrIHRvIGRlZmF1bHQgYnV0dG9uIHJlbmRlcmluZ1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUEwQix3QkFBd0I7QUFDbEQsU0FBUyxxQkFBcUIsa0JBQWtCO0FBQ2hELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLEdBQUcsdUNBQXVDLHVCQUF1QixXQUFXLGlCQUFpQixxQkFBcUI7QUFFM0gsU0FBUywwQkFBa0Q7QUFFM0QsU0FBUyxrQkFBMEM7QUFDbkQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxjQUFjO0FBQ3ZCLE9BQU87QUEyQkEsTUFBTSx1QkFBdUI7QUFBQSxFQUNuQyx5QkFBeUI7QUFBQSxFQUN6Qiw2QkFBNkI7QUFBQSxFQUM3Qiw2QkFBNkI7QUFDOUI7QUFFTyxNQUFNLDZCQUE2QixtQkFBbUI7QUFBQSxFQUk1RCxZQUFZLFNBQWtCLFFBQWlCLFNBQWlDO0FBQy9FLFVBQU0sU0FBUyxRQUFRLE9BQU87QUFFOUIsVUFBTSxRQUFpQyxLQUFLLFFBQVMsYUFDcEQsR0FBRyxLQUFLLFFBQVEsS0FBSyxLQUE4QixLQUFLLFFBQVMsVUFBVSxNQUFNLEtBQUssUUFBUTtBQUMvRixTQUFLLFNBQVMsS0FBSyxVQUFVLElBQUksT0FBTztBQUFBLE1BQ3ZDLGlCQUFpQixLQUFLLFFBQVE7QUFBQSxNQUM5QixXQUFXLENBQUMsQ0FBQyxLQUFLLFFBQVE7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsY0FBYztBQUFBLE1BQ2QsNkJBQTZCLFFBQVEsY0FBYztBQUFBLE1BQ25ELHlCQUF5QixRQUFRLGNBQWM7QUFBQSxNQUMvQyw2QkFBNkIsUUFBUSxjQUFjO0FBQUEsSUFDcEQsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssT0FBTyxTQUFTLE1BQU07QUFDekMsV0FBSyxRQUFRLFVBQVUsQ0FBQyxDQUFDLEtBQUssVUFBVSxLQUFLLE9BQU87QUFBQSxJQUNyRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUyxPQUFPLFdBQThCO0FBQzdDLFNBQUssVUFBVTtBQUNmLFNBQUssUUFBUSxZQUFZLEtBQUssT0FBTyxPQUFPO0FBRTVDLFNBQUssY0FBYztBQUNuQixTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUFBLEVBRW1CLGdCQUFzQjtBQUN4QyxRQUFJLEtBQUssUUFBUTtBQUNoQixVQUFJLEtBQUssVUFBVSxHQUFHO0FBQ3JCLGFBQUssT0FBTyxPQUFPO0FBQ25CLGFBQUssU0FBUyxVQUFVLE9BQU8sVUFBVTtBQUFBLE1BQzFDLE9BQU87QUFDTixhQUFLLE9BQU8sUUFBUTtBQUNwQixhQUFLLFNBQVMsVUFBVSxJQUFJLFVBQVU7QUFBQSxNQUN2QztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFbUIsZ0JBQXNCO0FBQ3hDLFNBQUssT0FBTyxVQUFVLENBQUMsQ0FBQyxLQUFLLFFBQVE7QUFBQSxFQUN0QztBQUFBLEVBRW1CLGNBQW9CO0FBQ3RDLFVBQU0sUUFBaUMsS0FBSyxRQUFTLGFBQ3BELEdBQUcsS0FBSyxRQUFRLEtBQUssS0FBOEIsS0FBSyxRQUFTLFVBQVUsTUFBTSxLQUFLLFFBQVE7QUFDL0YsU0FBSyxPQUFPLFNBQVMsS0FBSztBQUFBLEVBQzNCO0FBQUEsRUFFUyxRQUFjO0FBQ3RCLFNBQUssT0FBTyxRQUFRLFdBQVc7QUFDL0IsU0FBSyxPQUFPLE1BQU07QUFBQSxFQUNuQjtBQUFBLEVBRVMsT0FBYTtBQUNyQixTQUFLLE9BQU8sUUFBUSxXQUFXO0FBQy9CLFNBQUssT0FBTyxRQUFRLEtBQUs7QUFBQSxFQUMxQjtBQUFBLEVBRVMsYUFBYSxXQUEwQjtBQUMvQyxTQUFLLE9BQU8sUUFBUSxXQUFXLFlBQVksSUFBSTtBQUFBLEVBQ2hEO0FBRUQ7QUFFTyxNQUFNLGVBQWUsT0FBTztBQUFBLEVBZWxDLFlBQVksTUFBbUI7QUFDOUIsVUFBTTtBQWRQLFNBQWlCLFlBQVksS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUdsRSxTQUFpQixhQUFhLEtBQUssVUFBVSxJQUFJLFFBQXdCLENBQUM7QUFhekUsU0FBSyxRQUFRO0FBQ2IsU0FBSyxTQUFTLEtBQUssTUFBTTtBQUN6QixTQUFLLFdBQVcsS0FBSyxNQUFNO0FBRTNCLFVBQU0sVUFBVSxDQUFDLHNCQUFzQjtBQUN2QyxRQUFJLEtBQUssTUFBTSxNQUFNO0FBQ3BCLFdBQUssUUFBUSxLQUFLLE1BQU07QUFDeEIsY0FBUSxLQUFLLEdBQUcsVUFBVSxpQkFBaUIsS0FBSyxLQUFLLENBQUM7QUFBQSxJQUN2RDtBQUNBLFFBQUksS0FBSyxNQUFNLGlCQUFpQjtBQUMvQixjQUFRLEtBQUssR0FBRyxLQUFLLE1BQU0sZ0JBQWdCLE1BQU0sR0FBRyxDQUFDO0FBQUEsSUFDdEQ7QUFDQSxRQUFJLEtBQUssVUFBVTtBQUNsQixjQUFRLEtBQUssU0FBUztBQUFBLElBQ3ZCO0FBRUEsU0FBSyxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzNDLFNBQUssVUFBVSwwQkFBMEIsRUFBRSxrQkFBa0IsS0FBSyxTQUFTLE9BQU87QUFBQSxNQUNqRixTQUFTLENBQUMsaUJBQWlCLEtBQUssTUFBTSxLQUFLLENBQUMsY0FBYyxLQUFLLE1BQU0sSUFBSSxXQUFXLEtBQUssTUFBTSxJQUFJLEtBQUs7QUFBQSxNQUN4RyxPQUFPLFdBQVc7QUFBQSxJQUNuQixJQUFJLEtBQUssTUFBTSxxQkFBcUIsQ0FBQztBQUNyQyxTQUFLLFFBQVEsVUFBVSxJQUFJLEdBQUcsT0FBTztBQUNyQyxRQUFJLENBQUMsS0FBSyxNQUFNLGNBQWM7QUFDN0IsV0FBSyxRQUFRLFdBQVc7QUFBQSxJQUN6QjtBQUNBLFNBQUssUUFBUSxhQUFhLFFBQVEsVUFBVTtBQUM1QyxTQUFLLFFBQVEsYUFBYSxnQkFBZ0IsT0FBTyxLQUFLLFFBQVEsQ0FBQztBQUUvRCxTQUFLLFNBQVMsS0FBSyxNQUFNLEtBQUs7QUFDOUIsU0FBSyxZQUFZO0FBRWpCLFNBQUssUUFBUSxLQUFLLFNBQVMsQ0FBQyxPQUFPO0FBQ2xDLFVBQUksS0FBSyxTQUFTO0FBQ2pCLGFBQUssVUFBVSxDQUFDLEtBQUs7QUFDckIsYUFBSyxVQUFVLEtBQUssS0FBSztBQUN6QixXQUFHLGVBQWU7QUFDbEIsV0FBRyxnQkFBZ0I7QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssVUFBVSxLQUFLLGNBQWMsS0FBSyxPQUFPLENBQUM7QUFFL0MsU0FBSyxVQUFVLEtBQUssU0FBUyxDQUFDLGtCQUFrQjtBQUMvQyxVQUFJLENBQUMsS0FBSyxTQUFTO0FBQ2xCO0FBQUEsTUFDRDtBQUVBLFVBQUksY0FBYyxZQUFZLFFBQVEsU0FBUyxjQUFjLFlBQVksUUFBUSxPQUFPO0FBQ3ZGLGFBQUssVUFBVSxDQUFDLEtBQUs7QUFDckIsYUFBSyxVQUFVLEtBQUssSUFBSTtBQUN4QixzQkFBYyxlQUFlO0FBQzdCLHNCQUFjLGdCQUFnQjtBQUM5QjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFdBQVcsS0FBSyxhQUFhO0FBQUEsSUFDbkMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQXhFQSxJQUFJLFdBQThDO0FBQUUsV0FBTyxLQUFLLFVBQVU7QUFBQSxFQUFPO0FBQUEsRUFHakYsSUFBSSxZQUFtQztBQUFFLFdBQU8sS0FBSyxXQUFXO0FBQUEsRUFBTztBQUFBLEVBdUV2RSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sS0FBSyxRQUFRLGFBQWEsZUFBZSxNQUFNO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLFFBQWM7QUFDYixTQUFLLFFBQVEsTUFBTTtBQUFBLEVBQ3BCO0FBQUEsRUFFQSxJQUFJLFVBQW1CO0FBQ3RCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksUUFBUSxjQUF1QjtBQUNsQyxTQUFLLFdBQVc7QUFFaEIsU0FBSyxRQUFRLGFBQWEsZ0JBQWdCLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFDL0QsU0FBSyxRQUFRLFVBQVUsT0FBTyxXQUFXLEtBQUssUUFBUTtBQUV0RCxTQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUFBLEVBRUEsUUFBUSxNQUFtQztBQUMxQyxRQUFJLEtBQUssT0FBTztBQUNmLFdBQUssUUFBUSxVQUFVLE9BQU8sR0FBRyxVQUFVLGlCQUFpQixLQUFLLEtBQUssQ0FBQztBQUFBLElBQ3hFO0FBQ0EsU0FBSyxRQUFRO0FBQ2IsUUFBSSxLQUFLLE9BQU87QUFDZixXQUFLLFFBQVEsVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsS0FBSyxLQUFLLENBQUM7QUFBQSxJQUNyRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFFBQWdCO0FBQ2YsV0FBTyxJQUFvQixJQUFlLElBQWdCO0FBQUEsRUFDM0Q7QUFBQSxFQUVVLGNBQW9CO0FBQzdCLFFBQUksS0FBSyxTQUFTO0FBQ2pCLFdBQUssUUFBUSxNQUFNLGNBQWUsS0FBSyxZQUFZLEtBQUssTUFBTSwyQkFBNEI7QUFDMUYsV0FBSyxRQUFRLE1BQU0sUUFBUyxLQUFLLFlBQVksS0FBSyxNQUFNLCtCQUFnQztBQUN4RixXQUFLLFFBQVEsTUFBTSxrQkFBbUIsS0FBSyxZQUFZLEtBQUssTUFBTSwrQkFBZ0M7QUFBQSxJQUNuRztBQUFBLEVBQ0Q7QUFBQSxFQUVBLFNBQWU7QUFDZCxTQUFLLFFBQVEsYUFBYSxpQkFBaUIsT0FBTyxLQUFLLENBQUM7QUFDeEQsU0FBSyxRQUFRLFVBQVUsT0FBTyxVQUFVO0FBQ3hDLFFBQUksQ0FBQyxLQUFLLE1BQU0sY0FBYztBQUM3QixXQUFLLFFBQVEsV0FBVztBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLFFBQVEsYUFBYSxpQkFBaUIsT0FBTyxJQUFJLENBQUM7QUFDdkQsU0FBSyxRQUFRLFVBQVUsSUFBSSxVQUFVO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLE1BQU0sY0FBYztBQUM3QixXQUFLLFFBQVEsV0FBVztBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsU0FBUyxVQUF3RDtBQUNoRSxTQUFLLFNBQVM7QUFFZCxVQUFNLFlBQVksT0FBTyxhQUFhLFdBQVcsV0FBVyxpQkFBaUIsUUFBUSxJQUFJLFNBQVMsUUFBUSxTQUFTO0FBRW5ILFNBQUssUUFBUSxhQUFhLGNBQWMsb0JBQW9CLFNBQVMsQ0FBQztBQUFBLEVBQ3ZFO0FBQUEsRUFFQSxJQUFJLFFBQVEsU0FBa0I7QUFDN0IsU0FBSyxRQUFRLE1BQU0sVUFBVSxVQUFVLEtBQUs7QUFBQSxFQUM3QztBQUFBLEVBRUEsSUFBSSxVQUFVO0FBQ2IsV0FBTyxLQUFLLFFBQVEsTUFBTSxZQUFZO0FBQUEsRUFDdkM7QUFDRDtBQUdBLE1BQWUscUJBQXFCLE9BQU87QUFBQSxFQU0xQyxZQUNvQixVQUNWLFNBQ1UsUUFDbEI7QUFDRCxVQUFNO0FBSmE7QUFDVjtBQUNVO0FBTnBCLFNBQW1CLFlBQVksS0FBSyxVQUFVLElBQUksUUFBaUIsQ0FBQztBQUNwRSxTQUFTLFdBQThDLEtBQUssVUFBVTtBQVNyRSxTQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUFBLEVBRUEsSUFBSSxVQUFtQjtBQUN0QixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxRQUFjO0FBQ2IsU0FBSyxRQUFRLE1BQU07QUFBQSxFQUNwQjtBQUFBLEVBRUEsV0FBb0I7QUFDbkIsV0FBTyxnQkFBZ0IsS0FBSyxPQUFPO0FBQUEsRUFDcEM7QUFBQSxFQUVBLFNBQWU7QUFDZCxTQUFLLFNBQVMsT0FBTztBQUNyQixTQUFLLFlBQVksSUFBSTtBQUFBLEVBQ3RCO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssU0FBUyxRQUFRO0FBQ3RCLFNBQUssWUFBWSxLQUFLO0FBQUEsRUFDdkI7QUFBQSxFQUVBLFNBQVMsVUFBd0I7QUFDaEMsU0FBSyxTQUFTLFNBQVMsUUFBUTtBQUFBLEVBQ2hDO0FBQUEsRUFFVSxZQUFZLFVBQVUsS0FBSyxTQUFlO0FBQ25ELFNBQUssUUFBUSxNQUFNLFNBQVMsVUFBVSxLQUFLLE9BQU8scUJBQXFCLEtBQUssT0FBTywrQkFBK0I7QUFDbEgsU0FBSyxRQUFRLE1BQU0sbUJBQW1CLFVBQVUsS0FBSyxPQUFPLHFCQUFxQixLQUFLLE9BQU8sK0JBQStCO0FBQzVILFNBQUssUUFBUSxNQUFNLGVBQWUsVUFBVSxLQUFLLE9BQU8saUJBQWlCLEtBQUssT0FBTywrQkFBK0I7QUFFcEgsVUFBTSxPQUFPLEtBQUssT0FBTyxRQUFRO0FBQ2pDLFNBQUssUUFBUSxNQUFNLFFBQ2xCLEtBQUssUUFBUSxNQUFNLFNBQ25CLEtBQUssUUFBUSxNQUFNLFdBQVcsR0FBRyxJQUFJO0FBQ3RDLFNBQUssUUFBUSxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUM7QUFBQSxFQUMxQztBQUNEO0FBckRlLGFBQ0UsYUFBYTtBQXNEdkIsTUFBTSxpQkFBaUIsYUFBYTtBQUFBLEVBQzFDLFlBQVksT0FBZSxXQUFvQixRQUF5QjtBQUN2RSxVQUFNLFNBQVMsSUFBSSxPQUFPLEVBQUUsT0FBTyxXQUFXLE1BQU0sUUFBUSxPQUFPLGlCQUFpQixhQUFhLFlBQVksdUJBQXVCLE9BQU8sdUJBQXVCLEdBQUcscUJBQXFCLENBQUM7QUFDM0wsVUFBTSxRQUFRLE9BQU8sU0FBUyxNQUFNO0FBRXBDLFNBQUssVUFBVSxNQUFNO0FBQ3JCLFNBQUssVUFBVSxLQUFLLFNBQVMsU0FBUyxjQUFZO0FBQ2pELFdBQUssWUFBWTtBQUNqQixXQUFLLFVBQVUsS0FBSyxRQUFRO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsSUFBSSxVQUFtQjtBQUN0QixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUFFQSxJQUFJLFFBQVEsY0FBdUI7QUFDbEMsU0FBSyxTQUFTLFVBQVU7QUFDeEIsU0FBSyxZQUFZO0FBQUEsRUFDbEI7QUFBQSxFQUVtQixZQUFZLFNBQXlCO0FBQ3ZELFFBQUksS0FBSyxTQUFTLFNBQVM7QUFDMUIsV0FBSyxTQUFTLFFBQVEsUUFBUSxLQUFLO0FBQUEsSUFDcEMsT0FBTztBQUNOLFdBQUssU0FBUyxRQUFRLE1BQVM7QUFBQSxJQUNoQztBQUNBLFVBQU0sWUFBWSxPQUFPO0FBQUEsRUFDMUI7QUFDRDtBQUVPLE1BQU0seUJBQXlCLGFBQWE7QUFBQSxFQUNsRCxZQUNDLE9BQ1EsUUFDUixRQUNDO0FBQ0QsUUFBSTtBQUNKLFlBQVEsUUFBUTtBQUFBLE1BQ2YsS0FBSztBQUNKLGVBQU8sUUFBUTtBQUNmO0FBQUEsTUFDRCxLQUFLO0FBQ0osZUFBTyxRQUFRO0FBQ2Y7QUFBQSxNQUNELEtBQUs7QUFDSixlQUFPO0FBQ1A7QUFBQSxJQUNGO0FBQ0EsVUFBTSxXQUFXLElBQUksT0FBTztBQUFBLE1BQzNCO0FBQUEsTUFDQSxXQUFXLFdBQVc7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsaUJBQWlCLFNBQVM7QUFBQSxNQUMxQix1QkFBdUIsT0FBTztBQUFBLE1BQzlCLEdBQUc7QUFBQSxJQUNKLENBQUM7QUFDRDtBQUFBLE1BQ0M7QUFBQSxNQUNBLFNBQVM7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQTNCUTtBQTZCUixTQUFLLFVBQVUsUUFBUTtBQUN2QixTQUFLLFVBQVUsS0FBSyxTQUFTLFNBQVMsY0FBWTtBQUNqRCxXQUFLLFNBQVMsS0FBSyxTQUFTO0FBQzVCLFdBQUssWUFBWTtBQUNqQixXQUFLLFVBQVUsS0FBSyxRQUFRO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsSUFBSSxVQUE2QjtBQUNoQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxJQUFJLFFBQVEsVUFBNkI7QUFDeEMsUUFBSSxLQUFLLFdBQVcsVUFBVTtBQUM3QixXQUFLLFNBQVM7QUFDZCxXQUFLLFNBQVMsVUFBVSxhQUFhO0FBQ3JDLFdBQUssWUFBWTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBLEVBRW1CLFlBQVksU0FBeUI7QUFDdkQsWUFBUSxLQUFLLFFBQVE7QUFBQSxNQUNwQixLQUFLO0FBQ0osYUFBSyxTQUFTLFFBQVEsUUFBUSxLQUFLO0FBQ25DO0FBQUEsTUFDRCxLQUFLO0FBQ0osYUFBSyxTQUFTLFFBQVEsUUFBUSxJQUFJO0FBQ2xDO0FBQUEsTUFDRCxLQUFLO0FBQ0osYUFBSyxTQUFTLFFBQVEsTUFBUztBQUMvQjtBQUFBLElBQ0Y7QUFDQSxVQUFNLFlBQVksT0FBTztBQUFBLEVBQzFCO0FBQ0Q7QUFNTyxNQUFNLCtCQUErQixtQkFBbUI7QUFBQSxFQUs5RCxZQUFZLFNBQWtCLFFBQWlCLFNBQXlDO0FBQ3ZGLFVBQU0sU0FBUyxRQUFRLE9BQU87QUFFOUIsU0FBSyxTQUFTLEtBQUssVUFBVSxJQUFJLFNBQVMsS0FBSyxRQUFRLE9BQU8sQ0FBQyxDQUFDLEtBQUssUUFBUSxTQUFTLFFBQVEsY0FBYyxDQUFDO0FBQzdHLFNBQUssVUFBVSxLQUFLLE9BQU8sU0FBUyxNQUFNLEtBQUssU0FBUyxDQUFDLENBQUM7QUFBQSxFQUMzRDtBQUFBLEVBRVMsT0FBTyxXQUE4QjtBQUM3QyxTQUFLLFVBQVU7QUFDZixTQUFLLFFBQVEsVUFBVSxJQUFJLHNCQUFzQjtBQUNqRCxTQUFLLFFBQVEsWUFBWSxLQUFLLE9BQU8sT0FBTztBQUM1QyxRQUE2QixLQUFLLFFBQVMsU0FBUyxLQUFLLFFBQVEsT0FBTztBQUN2RSxZQUFNLFFBQVEsS0FBSyxRQUFRLFlBQVksRUFBRSx1QkFBdUIsUUFBVyxLQUFLLFFBQVEsS0FBSyxDQUFDO0FBSTlGLFdBQUssVUFBVSxzQ0FBc0MsT0FBTyxDQUFDLE1BQWtCO0FBQzlFLFVBQUUsZUFBZTtBQUVqQixZQUFJLEtBQUssVUFBVSxHQUFHO0FBQ3JCLGVBQUssTUFBTTtBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUMsQ0FBQztBQUNGLFdBQUssVUFBVSxzQkFBc0IsT0FBTyxVQUFVLE9BQU8sQ0FBQyxNQUFrQjtBQUMvRSxVQUFFLGdCQUFnQjtBQUNsQixVQUFFLGVBQWU7QUFFakIsWUFBSSxLQUFLLFVBQVUsR0FBRztBQUNyQixlQUFLLE9BQU8sVUFBVSxDQUFDLEtBQUssT0FBTztBQUNuQyxlQUFLLFNBQVM7QUFBQSxRQUNmO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBRUEsU0FBSyxjQUFjO0FBQ25CLFNBQUssWUFBWTtBQUNqQixTQUFLLGNBQWM7QUFDbkIsU0FBSyxjQUFjO0FBQUEsRUFDcEI7QUFBQSxFQUVRLFdBQWlCO0FBQ3hCLFNBQUssUUFBUSxVQUFVLENBQUMsQ0FBQyxLQUFLLFVBQVUsS0FBSyxPQUFPO0FBQ3BELFNBQUssYUFBYSxJQUFJLEtBQUssU0FBUyxLQUFLLFFBQVE7QUFBQSxFQUNsRDtBQUFBLEVBRW1CLGdCQUFzQjtBQUN4QyxRQUFJLEtBQUssVUFBVSxHQUFHO0FBQ3JCLFdBQUssT0FBTyxPQUFPO0FBQUEsSUFDcEIsT0FBTztBQUNOLFdBQUssT0FBTyxRQUFRO0FBQUEsSUFDckI7QUFDQSxRQUFJLEtBQUssT0FBTyxTQUFTO0FBQ3hCLFdBQUssU0FBUyxVQUFVLE9BQU8sVUFBVTtBQUFBLElBQzFDLE9BQU87QUFDTixXQUFLLFNBQVMsVUFBVSxJQUFJLFVBQVU7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQSxFQUVtQixnQkFBc0I7QUFDeEMsU0FBSyxPQUFPLFVBQVUsQ0FBQyxDQUFDLEtBQUssUUFBUTtBQUFBLEVBQ3RDO0FBQUEsRUFFbUIsY0FBb0I7QUFDdEMsUUFBSSxLQUFLLFVBQVU7QUFDbEIsV0FBSyxPQUFPLFFBQVEsVUFBVSxPQUFPLEdBQUcsS0FBSyxTQUFTLE1BQU0sR0FBRyxDQUFDO0FBQUEsSUFDakU7QUFDQSxTQUFLLFdBQVcsS0FBSyxTQUFTO0FBQzlCLFFBQUksS0FBSyxVQUFVO0FBQ2xCLFdBQUssT0FBTyxRQUFRLFVBQVUsSUFBSSxHQUFHLEtBQUssU0FBUyxNQUFNLEdBQUcsQ0FBQztBQUFBLElBQzlEO0FBQUEsRUFDRDtBQUFBLEVBRVMsUUFBYztBQUN0QixTQUFLLE9BQU8sUUFBUSxXQUFXO0FBQy9CLFNBQUssT0FBTyxNQUFNO0FBQUEsRUFDbkI7QUFBQSxFQUVTLE9BQWE7QUFDckIsU0FBSyxPQUFPLFFBQVEsV0FBVztBQUMvQixTQUFLLE9BQU8sUUFBUSxLQUFLO0FBQUEsRUFDMUI7QUFBQSxFQUVTLGFBQWEsV0FBMEI7QUFDL0MsU0FBSyxPQUFPLFFBQVEsV0FBVyxZQUFZLElBQUk7QUFBQSxFQUNoRDtBQUVEO0FBU08sU0FBUyxtQ0FBbUMsY0FBdUQ7QUFDekcsU0FBTyxDQUFDLFFBQWlCLFlBQW9DO0FBRTVELFFBQUksT0FBTyxZQUFZLFFBQVc7QUFDakMsYUFBTyxJQUFJLHFCQUFxQixNQUFNLFFBQVEsRUFBRSxHQUFHLFNBQVMsYUFBYSxDQUFDO0FBQUEsSUFDM0U7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
