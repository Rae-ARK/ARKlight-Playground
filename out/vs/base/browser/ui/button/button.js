import { addDisposableListener, EventHelper, EventType, isActiveElement, reset, trackFocus, $ } from "../../dom.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { renderMarkdown, renderAsPlaintext } from "../../markdownRenderer.js";
import { Gesture, EventType as TouchEventType } from "../../touch.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { renderLabelWithIcons } from "../iconLabel/iconLabels.js";
import { toAction } from "../../../common/actions.js";
import { Codicon } from "../../../common/codicons.js";
import { Color } from "../../../common/color.js";
import { Emitter } from "../../../common/event.js";
import { isMarkdownString, markdownStringEqual } from "../../../common/htmlContent.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../common/lifecycle.js";
import { ThemeIcon } from "../../../common/themables.js";
import "./button.css";
import { localize } from "../../../../nls.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { safeSetInnerHtml } from "../../domSanitize.js";
const unthemedButtonStyles = {
  buttonBackground: "#0E639C",
  buttonHoverBackground: "#006BB3",
  buttonSeparator: Color.white.toString(),
  buttonForeground: Color.white.toString(),
  buttonBorder: void 0,
  buttonSecondaryBackground: void 0,
  buttonSecondaryForeground: void 0,
  buttonSecondaryHoverBackground: void 0,
  buttonSecondaryBorder: void 0
};
const buttonSanitizerConfig = Object.freeze({
  allowedTags: {
    override: ["b", "i", "u", "code", "span"]
  },
  allowedAttributes: {
    override: ["class"]
  }
});
const buttonMarkdownRenderOptions = Object.freeze({
  sanitizerConfig: {
    allowedAttributes: {
      override: ["class"]
    }
  }
});
class Button extends Disposable {
  constructor(container, options) {
    super();
    this._label = "";
    this._onDidClick = this._register(new Emitter());
    this._onDidEscape = this._register(new Emitter());
    this.options = options;
    this._element = document.createElement("a");
    this._element.classList.add("monaco-button");
    this._element.tabIndex = 0;
    this._element.setAttribute("role", "button");
    this._element.classList.toggle("secondary", !!options.secondary);
    this._element.classList.toggle("small", !!options.small);
    const background = options.secondary ? options.buttonSecondaryBackground : options.buttonBackground;
    const foreground = options.secondary ? options.buttonSecondaryForeground : options.buttonForeground;
    const border = options.secondary ? options.buttonSecondaryBorder : options.buttonBorder;
    this._element.style.color = foreground || "";
    this._element.style.backgroundColor = background || "";
    if (border) {
      this._element.style.border = `1px solid ${border}`;
    }
    if (options.supportShortLabel) {
      this._labelShortElement = document.createElement("div");
      this._labelShortElement.classList.add("monaco-button-label-short");
      this._element.appendChild(this._labelShortElement);
      this._labelElement = document.createElement("div");
      this._labelElement.classList.add("monaco-button-label");
      this._element.appendChild(this._labelElement);
      this._element.classList.add("monaco-text-button-with-short-label");
    }
    if (typeof options.title === "string") {
      this.setTitle(options.title);
    }
    if (typeof options.ariaLabel === "string") {
      this._element.setAttribute("aria-label", options.ariaLabel);
    }
    container.appendChild(this._element);
    this.enabled = !options.disabled;
    this._register(Gesture.addTarget(this._element));
    [EventType.CLICK, TouchEventType.Tap].forEach((eventType) => {
      this._register(addDisposableListener(this._element, eventType, (e) => {
        if (!this.enabled) {
          EventHelper.stop(e);
          return;
        }
        this._onDidClick.fire(e);
      }));
    });
    this._register(addDisposableListener(this._element, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = false;
      if (this.enabled && (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space))) {
        this._onDidClick.fire(e);
        eventHandled = true;
      } else if (event.equals(KeyCode.Escape)) {
        this._onDidEscape.fire(e);
        this._element.blur();
        eventHandled = true;
      }
      if (eventHandled) {
        EventHelper.stop(event, true);
      }
    }));
    this._register(addDisposableListener(this._element, EventType.MOUSE_OVER, (e) => {
      if (!this._element.classList.contains("disabled")) {
        this.updateStyles(true);
      }
    }));
    this._register(addDisposableListener(this._element, EventType.MOUSE_OUT, (e) => {
      this.updateStyles(false);
    }));
    this.focusTracker = this._register(trackFocus(this._element));
    this._register(this.focusTracker.onDidFocus(() => {
      if (this.enabled) {
        this.updateStyles(true);
      }
    }));
    this._register(this.focusTracker.onDidBlur(() => {
      if (this.enabled) {
        this.updateStyles(false);
      }
    }));
  }
  get onDidClick() {
    return this._onDidClick.event;
  }
  get onDidEscape() {
    return this._onDidEscape.event;
  }
  dispose() {
    super.dispose();
    this._element.remove();
  }
  getContentElements(content) {
    const elements = [];
    for (let segment of renderLabelWithIcons(content)) {
      if (typeof segment === "string") {
        segment = segment.trim();
        if (segment === "") {
          continue;
        }
        const node = document.createElement("span");
        node.textContent = segment;
        elements.push(node);
      } else {
        elements.push(segment);
      }
    }
    return elements;
  }
  updateStyles(hover) {
    let background;
    let foreground;
    let border;
    if (this.options.secondary) {
      background = hover ? this.options.buttonSecondaryHoverBackground : this.options.buttonSecondaryBackground;
      foreground = this.options.buttonSecondaryForeground;
      border = this.options.buttonSecondaryBorder;
    } else {
      background = hover ? this.options.buttonHoverBackground : this.options.buttonBackground;
      foreground = this.options.buttonForeground;
      border = this.options.buttonBorder;
    }
    this._element.style.backgroundColor = background || "";
    this._element.style.color = foreground || "";
    this._element.style.border = border ? `1px solid ${border}` : "";
  }
  get element() {
    return this._element;
  }
  set label(value) {
    if (this._label === value) {
      return;
    }
    if (isMarkdownString(this._label) && isMarkdownString(value) && markdownStringEqual(this._label, value)) {
      return;
    }
    this._element.classList.add("monaco-text-button");
    const labelElement = this.options.supportShortLabel ? this._labelElement : this._element;
    if (isMarkdownString(value)) {
      const rendered = renderMarkdown(value, buttonMarkdownRenderOptions, document.createElement("span"));
      rendered.dispose();
      const root = rendered.element.querySelector("p")?.innerHTML;
      if (root) {
        safeSetInnerHtml(labelElement, root, buttonSanitizerConfig);
      } else {
        reset(labelElement);
      }
    } else {
      if (this.options.supportIcons) {
        reset(labelElement, ...this.getContentElements(value));
      } else {
        labelElement.textContent = value;
      }
    }
    let title = "";
    if (typeof this.options.title === "string") {
      title = this.options.title;
    } else if (this.options.title) {
      title = renderAsPlaintext(value);
    }
    this.setTitle(title);
    this._setAriaLabel();
    this._label = value;
  }
  get label() {
    return this._label;
  }
  set labelShort(value) {
    if (!this.options.supportShortLabel || !this._labelShortElement) {
      return;
    }
    if (this.options.supportIcons) {
      reset(this._labelShortElement, ...this.getContentElements(value));
    } else {
      this._labelShortElement.textContent = value;
    }
  }
  _setAriaLabel() {
    if (typeof this.options.ariaLabel === "string") {
      this._element.setAttribute("aria-label", this.options.ariaLabel);
    } else if (typeof this.options.title === "string") {
      this._element.setAttribute("aria-label", this.options.title);
    }
  }
  set icon(icon) {
    this._setAriaLabel();
    const oldIcons = Array.from(this._element.classList).filter((item) => item.startsWith("codicon-"));
    this._element.classList.remove(...oldIcons);
    this._element.classList.add(...ThemeIcon.asClassNameArray(icon));
  }
  set enabled(value) {
    if (value) {
      this._element.classList.remove("disabled");
      this._element.setAttribute("aria-disabled", String(false));
      this._element.tabIndex = 0;
    } else {
      this._element.classList.add("disabled");
      this._element.setAttribute("aria-disabled", String(true));
    }
  }
  get enabled() {
    return !this._element.classList.contains("disabled");
  }
  set secondary(value) {
    this._element.classList.toggle("secondary", value);
    this.options.secondary = value;
    this.updateStyles(false);
  }
  set checked(value) {
    if (value) {
      this._element.classList.add("checked");
      this._element.setAttribute("aria-pressed", "true");
    } else {
      this._element.classList.remove("checked");
      this._element.setAttribute("aria-pressed", "false");
    }
  }
  get checked() {
    return this._element.classList.contains("checked");
  }
  setTitle(title) {
    if (!this._hover && title !== "") {
      this._hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(this.options.hoverDelegate ?? getDefaultHoverDelegate("element"), this._element, title));
    } else if (this._hover) {
      this._hover.update(title);
    }
  }
  setAriaLabel(ariaLabel) {
    this._element.setAttribute("aria-label", ariaLabel);
  }
  focus() {
    this._element.focus();
  }
  hasFocus() {
    return isActiveElement(this._element);
  }
}
class ButtonWithDropdown extends Disposable {
  constructor(container, options) {
    super();
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this.element = document.createElement("div");
    this.element.classList.add("monaco-button-dropdown");
    container.appendChild(this.element);
    if (!options.hoverDelegate) {
      options = { ...options, hoverDelegate: this._register(createInstantHoverDelegate()) };
    }
    this.primaryButton = this._register(new Button(this.element, options));
    this._register(this.primaryButton.onDidClick((e) => this._onDidClick.fire(e)));
    this.action = toAction({ id: "primaryAction", label: renderAsPlaintext(this.primaryButton.label), run: async () => this._onDidClick.fire(void 0) });
    this.separatorContainer = document.createElement("div");
    this.separatorContainer.classList.add("monaco-button-dropdown-separator");
    this.separator = document.createElement("div");
    this.separatorContainer.appendChild(this.separator);
    this.element.appendChild(this.separatorContainer);
    const border = options.buttonBorder;
    if (border) {
      this.separatorContainer.style.borderTop = "1px solid " + border;
      this.separatorContainer.style.borderBottom = "1px solid " + border;
    }
    const buttonBackground = options.secondary ? options.buttonSecondaryBackground : options.buttonBackground;
    this.separatorContainer.style.backgroundColor = buttonBackground ?? "";
    this.separator.style.backgroundColor = options.buttonSeparator ?? "";
    this.dropdownButton = this._register(new Button(this.element, { ...options, title: localize("button dropdown more actions", "More Actions..."), supportIcons: true }));
    this.dropdownButton.element.setAttribute("aria-haspopup", "true");
    this.dropdownButton.element.setAttribute("aria-expanded", "false");
    this.dropdownButton.element.classList.add("monaco-dropdown-button");
    this.dropdownButton.icon = Codicon.dropDownButton;
    this._register(this.dropdownButton.onDidClick((e) => {
      const actions = Array.isArray(options.actions) ? options.actions : options.actions.getActions();
      options.contextMenuProvider.showContextMenu({
        getAnchor: () => this.dropdownButton.element,
        getActions: () => options.addPrimaryActionToDropdown === false ? [...actions] : [this.action, ...actions],
        actionRunner: options.actionRunner,
        onHide: () => this.dropdownButton.element.setAttribute("aria-expanded", "false"),
        layer: options.dropdownLayer
      });
      this.dropdownButton.element.setAttribute("aria-expanded", "true");
    }));
  }
  dispose() {
    super.dispose();
    this.element.remove();
  }
  set label(value) {
    this.primaryButton.label = value;
    this.action.label = value;
  }
  set icon(icon) {
    this.primaryButton.icon = icon;
  }
  set enabled(enabled) {
    this.primaryButton.enabled = enabled;
    this.dropdownButton.enabled = enabled;
    this.element.classList.toggle("disabled", !enabled);
  }
  get enabled() {
    return this.primaryButton.enabled;
  }
  set checked(value) {
    this.primaryButton.checked = value;
  }
  get checked() {
    return this.primaryButton.checked;
  }
  setTitle(title) {
    this.primaryButton.setTitle(title);
  }
  setAriaLabel(ariaLabel) {
    this.primaryButton.setAriaLabel(ariaLabel);
  }
  focus() {
    this.primaryButton.focus();
  }
  hasFocus() {
    return this.primaryButton.hasFocus() || this.dropdownButton.hasFocus();
  }
}
class ButtonWithDescription {
  constructor(container, options) {
    this.options = options;
    this._element = document.createElement("div");
    this._element.classList.add("monaco-description-button");
    this._button = new Button(this._element, options);
    this._descriptionElement = document.createElement("div");
    this._descriptionElement.classList.add("monaco-button-description");
    this._element.appendChild(this._descriptionElement);
    container.appendChild(this._element);
  }
  get onDidClick() {
    return this._button.onDidClick;
  }
  get element() {
    return this._element;
  }
  set label(value) {
    this._button.label = value;
  }
  set icon(icon) {
    this._button.icon = icon;
  }
  get enabled() {
    return this._button.enabled;
  }
  set enabled(enabled) {
    this._button.enabled = enabled;
  }
  set checked(value) {
    this._button.checked = value;
  }
  get checked() {
    return this._button.checked;
  }
  setTitle(title) {
    this._button.setTitle(title);
  }
  setAriaLabel(ariaLabel) {
    this._button.setAriaLabel(ariaLabel);
  }
  focus() {
    this._button.focus();
  }
  hasFocus() {
    return this._button.hasFocus();
  }
  dispose() {
    this._button.dispose();
  }
  set description(value) {
    if (this.options.supportIcons) {
      reset(this._descriptionElement, ...renderLabelWithIcons(value));
    } else {
      this._descriptionElement.textContent = value;
    }
  }
}
var ButtonBarAlignment = /* @__PURE__ */ ((ButtonBarAlignment2) => {
  ButtonBarAlignment2[ButtonBarAlignment2["Horizontal"] = 0] = "Horizontal";
  ButtonBarAlignment2[ButtonBarAlignment2["Vertical"] = 1] = "Vertical";
  return ButtonBarAlignment2;
})(ButtonBarAlignment || {});
class ButtonBar {
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this._buttons = [];
    this._buttonStore = new DisposableStore();
  }
  dispose() {
    this._buttonStore.dispose();
  }
  get buttons() {
    return this._buttons;
  }
  clear() {
    this._buttonStore.clear();
    this._buttons.length = 0;
  }
  addButton(options) {
    const button = this._buttonStore.add(new Button(this.container, options));
    this.pushButton(button);
    return button;
  }
  addButtonWithDescription(options) {
    const button = this._buttonStore.add(new ButtonWithDescription(this.container, options));
    this.pushButton(button);
    return button;
  }
  addButtonWithDropdown(options) {
    const button = this._buttonStore.add(new ButtonWithDropdown(this.container, options));
    this.pushButton(button);
    return button;
  }
  pushButton(button) {
    this._buttons.push(button);
    const index = this._buttons.length - 1;
    this._buttonStore.add(addDisposableListener(button.element, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let eventHandled = true;
      let buttonIndexToFocus;
      if (event.equals(this.options?.alignment === 1 /* Vertical */ ? KeyCode.UpArrow : KeyCode.LeftArrow)) {
        buttonIndexToFocus = index > 0 ? index - 1 : this._buttons.length - 1;
      } else if (event.equals(this.options?.alignment === 1 /* Vertical */ ? KeyCode.DownArrow : KeyCode.RightArrow)) {
        buttonIndexToFocus = index === this._buttons.length - 1 ? 0 : index + 1;
      } else {
        eventHandled = false;
      }
      if (eventHandled && typeof buttonIndexToFocus === "number") {
        this._buttons[buttonIndexToFocus].focus();
        EventHelper.stop(e, true);
      }
    }));
  }
}
class ButtonWithIcon extends Button {
  get labelElement() {
    return this._mdlabelElement;
  }
  get iconElement() {
    return this._iconElement;
  }
  constructor(container, options) {
    super(container, options);
    if (options.supportShortLabel) {
      throw new Error("ButtonWithIcon does not support short labels");
    }
    this._element.classList.add("monaco-icon-button");
    this._iconElement = $("");
    this._mdlabelElement = $(".monaco-button-mdlabel");
    this._element.append(this._iconElement, this._mdlabelElement);
  }
  get label() {
    return super.label;
  }
  set label(value) {
    if (this._label === value) {
      return;
    }
    if (isMarkdownString(this._label) && isMarkdownString(value) && markdownStringEqual(this._label, value)) {
      return;
    }
    this._element.classList.add("monaco-text-button");
    if (isMarkdownString(value)) {
      const rendered = renderMarkdown(value, buttonMarkdownRenderOptions, document.createElement("span"));
      rendered.dispose();
      const root = rendered.element.querySelector("p")?.innerHTML;
      if (root) {
        safeSetInnerHtml(this._mdlabelElement, root, buttonSanitizerConfig);
      } else {
        reset(this._mdlabelElement);
      }
    } else {
      if (this.options.supportIcons) {
        reset(this._mdlabelElement, ...this.getContentElements(value));
      } else {
        this._mdlabelElement.textContent = value;
      }
    }
    let title = "";
    if (typeof this.options.title === "string") {
      title = this.options.title;
    } else if (this.options.title) {
      title = renderAsPlaintext(value);
    }
    this.setTitle(title);
    this._setAriaLabel();
    this._label = value;
  }
  get icon() {
    return super.icon;
  }
  set icon(icon) {
    this._iconElement.classList.value = "";
    this._iconElement.classList.add(...ThemeIcon.asClassNameArray(icon));
    this._setAriaLabel();
  }
}
export {
  Button,
  ButtonBar,
  ButtonBarAlignment,
  ButtonWithDescription,
  ButtonWithDropdown,
  ButtonWithIcon,
  unthemedButtonStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUNvbnRleHRNZW51UHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb250ZXh0bWVudS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50SGVscGVyLCBFdmVudFR5cGUsIElGb2N1c1RyYWNrZXIsIGlzQWN0aXZlRWxlbWVudCwgcmVzZXQsIHRyYWNrRm9jdXMsICQgfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4va2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyByZW5kZXJNYXJrZG93biwgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEdlc3R1cmUsIEV2ZW50VHlwZSBhcyBUb3VjaEV2ZW50VHlwZSB9IGZyb20gJy4uLy4uL3RvdWNoLmpzJztcbmltcG9ydCB7IGNyZWF0ZUluc3RhbnRIb3ZlckRlbGVnYXRlLCBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIElBY3Rpb25SdW5uZXIsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBFdmVudCBhcyBCYXNlRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nLCBtYXJrZG93blN0cmluZ0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgJy4vYnV0dG9uLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgdHlwZSB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vaG92ZXIvaG92ZXJEZWxlZ2F0ZTIuanMnO1xuaW1wb3J0IHsgSUFjdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vZHJvcGRvd24vZHJvcGRvd24uanMnO1xuaW1wb3J0IHsgc2FmZVNldElubmVySHRtbCwgRG9tU2FuaXRpemVyQ29uZmlnIH0gZnJvbSAnLi4vLi4vZG9tU2FuaXRpemUuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElCdXR0b25PcHRpb25zIGV4dGVuZHMgUGFydGlhbDxJQnV0dG9uU3R5bGVzPiB7XG5cdHJlYWRvbmx5IHRpdGxlPzogYm9vbGVhbiB8IHN0cmluZztcblx0LyoqXG5cdCAqIFdpbGwgZmFsbGJhY2sgdG8gYHRpdGxlYCBpZiBub3Qgc2V0LlxuXHQgKi9cblx0cmVhZG9ubHkgYXJpYUxhYmVsPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdXBwb3J0SWNvbnM/OiBib29sZWFuO1xuXHRyZWFkb25seSBzdXBwb3J0U2hvcnRMYWJlbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNlY29uZGFyeT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNtYWxsPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG92ZXJEZWxlZ2F0ZT86IElIb3ZlckRlbGVnYXRlO1xuXHRyZWFkb25seSBkaXNhYmxlZD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJ1dHRvblN0eWxlcyB7XG5cdHJlYWRvbmx5IGJ1dHRvbkJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGJ1dHRvbkZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uU2VwYXJhdG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGJ1dHRvblNlY29uZGFyeUZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYnV0dG9uU2Vjb25kYXJ5Qm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGJ1dHRvbkJvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY29uc3QgdW50aGVtZWRCdXR0b25TdHlsZXM6IElCdXR0b25TdHlsZXMgPSB7XG5cdGJ1dHRvbkJhY2tncm91bmQ6ICcjMEU2MzlDJyxcblx0YnV0dG9uSG92ZXJCYWNrZ3JvdW5kOiAnIzAwNkJCMycsXG5cdGJ1dHRvblNlcGFyYXRvcjogQ29sb3Iud2hpdGUudG9TdHJpbmcoKSxcblx0YnV0dG9uRm9yZWdyb3VuZDogQ29sb3Iud2hpdGUudG9TdHJpbmcoKSxcblx0YnV0dG9uQm9yZGVyOiB1bmRlZmluZWQsXG5cdGJ1dHRvblNlY29uZGFyeUJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0YnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRidXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0YnV0dG9uU2Vjb25kYXJ5Qm9yZGVyOiB1bmRlZmluZWRcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJ1dHRvbiBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2s6IEJhc2VFdmVudDxFdmVudCB8IHVuZGVmaW5lZD47XG5cblx0c2V0IGxhYmVsKHZhbHVlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcpO1xuXHRzZXQgaWNvbih2YWx1ZTogVGhlbWVJY29uKTtcblx0c2V0IGVuYWJsZWQodmFsdWU6IGJvb2xlYW4pO1xuXHRzZXQgY2hlY2tlZCh2YWx1ZTogYm9vbGVhbik7XG5cblx0c2V0VGl0bGUodGl0bGU6IHN0cmluZyk6IHZvaWQ7XG5cdHNldEFyaWFMYWJlbChhcmlhTGFiZWw6IHN0cmluZyk6IHZvaWQ7XG5cblx0Zm9jdXMoKTogdm9pZDtcblx0aGFzRm9jdXMoKTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnV0dG9uV2l0aERlc2NyaXB0aW9uIGV4dGVuZHMgSUJ1dHRvbiB7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG59XG5cbi8vIE9ubHkgYWxsb3cgYSB2ZXJ5IGxpbWl0ZWQgc2V0IG9mIGlubGluZSBodG1sIHRhZ3NcbmNvbnN0IGJ1dHRvblNhbml0aXplckNvbmZpZyA9IE9iamVjdC5mcmVlemU8RG9tU2FuaXRpemVyQ29uZmlnPih7XG5cdGFsbG93ZWRUYWdzOiB7XG5cdFx0b3ZlcnJpZGU6IFsnYicsICdpJywgJ3UnLCAnY29kZScsICdzcGFuJ10sXG5cdH0sXG5cdGFsbG93ZWRBdHRyaWJ1dGVzOiB7XG5cdFx0b3ZlcnJpZGU6IFsnY2xhc3MnXSxcblx0fSxcbn0pO1xuXG4vLyBNYXJrZG93biByZW5kZXIgb3B0aW9ucyB0aGF0IGFsbG93IGNsYXNzIGF0dHJpYnV0ZXMgdG8gcGFzcyB0aHJvdWdoXG5jb25zdCBidXR0b25NYXJrZG93blJlbmRlck9wdGlvbnMgPSBPYmplY3QuZnJlZXplKHtcblx0c2FuaXRpemVyQ29uZmlnOiB7XG5cdFx0YWxsb3dlZEF0dHJpYnV0ZXM6IHtcblx0XHRcdG92ZXJyaWRlOiBbJ2NsYXNzJ10sXG5cdFx0fVxuXHR9XG59KTtcblxuZXhwb3J0IGNsYXNzIEJ1dHRvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQnV0dG9uIHtcblxuXHRwcm90ZWN0ZWQgb3B0aW9uczogSUJ1dHRvbk9wdGlvbnM7XG5cdHByb3RlY3RlZCBfZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByb3RlY3RlZCBfbGFiZWw6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyA9ICcnO1xuXHRwcm90ZWN0ZWQgX2xhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCBfbGFiZWxTaG9ydEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9ob3ZlcjogSU1hbmFnZWRIb3ZlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZENsaWNrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RXZlbnQ+KCkpO1xuXHRnZXQgb25EaWRDbGljaygpOiBCYXNlRXZlbnQ8RXZlbnQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7IH1cblxuXHRwcml2YXRlIF9vbkRpZEVzY2FwZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEV2ZW50PigpKTtcblx0Z2V0IG9uRGlkRXNjYXBlKCk6IEJhc2VFdmVudDxFdmVudD4geyByZXR1cm4gdGhpcy5fb25EaWRFc2NhcGUuZXZlbnQ7IH1cblxuXHRwcml2YXRlIGZvY3VzVHJhY2tlcjogSUZvY3VzVHJhY2tlcjtcblxuXHRjb25zdHJ1Y3Rvcihjb250YWluZXI6IEhUTUxFbGVtZW50LCBvcHRpb25zOiBJQnV0dG9uT3B0aW9ucykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm9wdGlvbnMgPSBvcHRpb25zO1xuXG5cdFx0dGhpcy5fZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2EnKTtcblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby1idXR0b24nKTtcblx0XHR0aGlzLl9lbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblxuXHRcdHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2Vjb25kYXJ5JywgISFvcHRpb25zLnNlY29uZGFyeSk7XG5cdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzbWFsbCcsICEhb3B0aW9ucy5zbWFsbCk7XG5cdFx0Y29uc3QgYmFja2dyb3VuZCA9IG9wdGlvbnMuc2Vjb25kYXJ5ID8gb3B0aW9ucy5idXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kIDogb3B0aW9ucy5idXR0b25CYWNrZ3JvdW5kO1xuXHRcdGNvbnN0IGZvcmVncm91bmQgPSBvcHRpb25zLnNlY29uZGFyeSA/IG9wdGlvbnMuYnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZCA6IG9wdGlvbnMuYnV0dG9uRm9yZWdyb3VuZDtcblx0XHRjb25zdCBib3JkZXIgPSBvcHRpb25zLnNlY29uZGFyeSA/IG9wdGlvbnMuYnV0dG9uU2Vjb25kYXJ5Qm9yZGVyIDogb3B0aW9ucy5idXR0b25Cb3JkZXI7XG5cblx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLmNvbG9yID0gZm9yZWdyb3VuZCB8fCAnJztcblx0XHR0aGlzLl9lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhY2tncm91bmQgfHwgJyc7XG5cdFx0aWYgKGJvcmRlcikge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7Ym9yZGVyfWA7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuc3VwcG9ydFNob3J0TGFiZWwpIHtcblx0XHRcdHRoaXMuX2xhYmVsU2hvcnRFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9sYWJlbFNob3J0RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tYnV0dG9uLWxhYmVsLXNob3J0Jyk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuX2xhYmVsU2hvcnRFbGVtZW50KTtcblxuXHRcdFx0dGhpcy5fbGFiZWxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9sYWJlbEVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLWJ1dHRvbi1sYWJlbCcpO1xuXHRcdFx0dGhpcy5fZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9sYWJlbEVsZW1lbnQpO1xuXG5cdFx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ21vbmFjby10ZXh0LWJ1dHRvbi13aXRoLXNob3J0LWxhYmVsJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLnRpdGxlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zZXRUaXRsZShvcHRpb25zLnRpdGxlKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMuYXJpYUxhYmVsID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBvcHRpb25zLmFyaWFMYWJlbCk7XG5cdFx0fVxuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLl9lbGVtZW50KTtcblx0XHR0aGlzLmVuYWJsZWQgPSAhb3B0aW9ucy5kaXNhYmxlZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHRoaXMuX2VsZW1lbnQpKTtcblxuXHRcdFtFdmVudFR5cGUuQ0xJQ0ssIFRvdWNoRXZlbnRUeXBlLlRhcF0uZm9yRWFjaChldmVudFR5cGUgPT4ge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VsZW1lbnQsIGV2ZW50VHlwZSwgZSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5lbmFibGVkKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrLmZpcmUoZSk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudCwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGxldCBldmVudEhhbmRsZWQgPSBmYWxzZTtcblx0XHRcdGlmICh0aGlzLmVuYWJsZWQgJiYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5TcGFjZSkpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2suZmlyZShlKTtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEVzY2FwZS5maXJlKGUpO1xuXHRcdFx0XHR0aGlzLl9lbGVtZW50LmJsdXIoKTtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGV2ZW50SGFuZGxlZCkge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGV2ZW50LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX09WRVIsIGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcyh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudCwgRXZlbnRUeXBlLk1PVVNFX09VVCwgZSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcyhmYWxzZSk7IC8vIHJlc3RvcmUgc3RhbmRhcmQgc3R5bGVzXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQWxzbyBzZXQgaG92ZXIgYmFja2dyb3VuZCB3aGVuIGJ1dHRvbiBpcyBmb2N1c2VkIGZvciBmZWVkYmFja1xuXHRcdHRoaXMuZm9jdXNUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIodHJhY2tGb2N1cyh0aGlzLl9lbGVtZW50KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5mb2N1c1RyYWNrZXIub25EaWRGb2N1cygoKSA9PiB7IGlmICh0aGlzLmVuYWJsZWQpIHsgdGhpcy51cGRhdGVTdHlsZXModHJ1ZSk7IH0gfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7IGlmICh0aGlzLmVuYWJsZWQpIHsgdGhpcy51cGRhdGVTdHlsZXMoZmFsc2UpOyB9IH0pKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lbGVtZW50LnJlbW92ZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldENvbnRlbnRFbGVtZW50cyhjb250ZW50OiBzdHJpbmcpOiBIVE1MRWxlbWVudFtdIHtcblx0XHRjb25zdCBlbGVtZW50czogSFRNTFNwYW5FbGVtZW50W10gPSBbXTtcblx0XHRmb3IgKGxldCBzZWdtZW50IG9mIHJlbmRlckxhYmVsV2l0aEljb25zKGNvbnRlbnQpKSB7XG5cdFx0XHRpZiAodHlwZW9mIChzZWdtZW50KSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0c2VnbWVudCA9IHNlZ21lbnQudHJpbSgpO1xuXG5cdFx0XHRcdC8vIElnbm9yZSBlbXB0eSBzZWdtZW50XG5cdFx0XHRcdGlmIChzZWdtZW50ID09PSAnJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ29udmVydCBzdHJpbmcgc2VnbWVudHMgdG8gPHNwYW4+IG5vZGVzXG5cdFx0XHRcdGNvbnN0IG5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0XHRcdG5vZGUudGV4dENvbnRlbnQgPSBzZWdtZW50O1xuXHRcdFx0XHRlbGVtZW50cy5wdXNoKG5vZGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZWxlbWVudHMucHVzaChzZWdtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudHM7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0eWxlcyhob3ZlcjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCBiYWNrZ3JvdW5kO1xuXHRcdGxldCBmb3JlZ3JvdW5kO1xuXHRcdGxldCBib3JkZXI7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zZWNvbmRhcnkpIHtcblx0XHRcdGJhY2tncm91bmQgPSBob3ZlciA/IHRoaXMub3B0aW9ucy5idXR0b25TZWNvbmRhcnlIb3ZlckJhY2tncm91bmQgOiB0aGlzLm9wdGlvbnMuYnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZDtcblx0XHRcdGZvcmVncm91bmQgPSB0aGlzLm9wdGlvbnMuYnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZDtcblx0XHRcdGJvcmRlciA9IHRoaXMub3B0aW9ucy5idXR0b25TZWNvbmRhcnlCb3JkZXI7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGJhY2tncm91bmQgPSBob3ZlciA/IHRoaXMub3B0aW9ucy5idXR0b25Ib3ZlckJhY2tncm91bmQgOiB0aGlzLm9wdGlvbnMuYnV0dG9uQmFja2dyb3VuZDtcblx0XHRcdGZvcmVncm91bmQgPSB0aGlzLm9wdGlvbnMuYnV0dG9uRm9yZWdyb3VuZDtcblx0XHRcdGJvcmRlciA9IHRoaXMub3B0aW9ucy5idXR0b25Cb3JkZXI7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiYWNrZ3JvdW5kIHx8ICcnO1xuXHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuY29sb3IgPSBmb3JlZ3JvdW5kIHx8ICcnO1xuXHRcdHRoaXMuX2VsZW1lbnQuc3R5bGUuYm9yZGVyID0gYm9yZGVyID8gYDFweCBzb2xpZCAke2JvcmRlcn1gIDogJyc7XG5cdH1cblxuXHRnZXQgZWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnQ7XG5cdH1cblxuXHRzZXQgbGFiZWwodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZykge1xuXHRcdGlmICh0aGlzLl9sYWJlbCA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNNYXJrZG93blN0cmluZyh0aGlzLl9sYWJlbCkgJiYgaXNNYXJrZG93blN0cmluZyh2YWx1ZSkgJiYgbWFya2Rvd25TdHJpbmdFcXVhbCh0aGlzLl9sYWJlbCwgdmFsdWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tdGV4dC1idXR0b24nKTtcblx0XHRjb25zdCBsYWJlbEVsZW1lbnQgPSB0aGlzLm9wdGlvbnMuc3VwcG9ydFNob3J0TGFiZWwgPyB0aGlzLl9sYWJlbEVsZW1lbnQhIDogdGhpcy5fZWxlbWVudDtcblxuXHRcdGlmIChpc01hcmtkb3duU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSByZW5kZXJNYXJrZG93bih2YWx1ZSwgYnV0dG9uTWFya2Rvd25SZW5kZXJPcHRpb25zLCBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJykpO1xuXHRcdFx0cmVuZGVyZWQuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBEb24ndCBpbmNsdWRlIG91dGVyIGA8cD5gXG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IHJvb3QgPSByZW5kZXJlZC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ3AnKT8uaW5uZXJIVE1MO1xuXHRcdFx0aWYgKHJvb3QpIHtcblx0XHRcdFx0c2FmZVNldElubmVySHRtbChsYWJlbEVsZW1lbnQsIHJvb3QsIGJ1dHRvblNhbml0aXplckNvbmZpZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNldChsYWJlbEVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLnN1cHBvcnRJY29ucykge1xuXHRcdFx0XHRyZXNldChsYWJlbEVsZW1lbnQsIC4uLnRoaXMuZ2V0Q29udGVudEVsZW1lbnRzKHZhbHVlKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgdGl0bGU6IHN0cmluZyA9ICcnO1xuXHRcdGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLnRpdGxlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGl0bGUgPSB0aGlzLm9wdGlvbnMudGl0bGU7XG5cdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMudGl0bGUpIHtcblx0XHRcdHRpdGxlID0gcmVuZGVyQXNQbGFpbnRleHQodmFsdWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0VGl0bGUodGl0bGUpO1xuXG5cdFx0dGhpcy5fc2V0QXJpYUxhYmVsKCk7XG5cblx0XHR0aGlzLl9sYWJlbCA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IGxhYmVsKCk6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHR9XG5cblx0c2V0IGxhYmVsU2hvcnQodmFsdWU6IHN0cmluZykge1xuXHRcdGlmICghdGhpcy5vcHRpb25zLnN1cHBvcnRTaG9ydExhYmVsIHx8ICF0aGlzLl9sYWJlbFNob3J0RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMuc3VwcG9ydEljb25zKSB7XG5cdFx0XHRyZXNldCh0aGlzLl9sYWJlbFNob3J0RWxlbWVudCwgLi4udGhpcy5nZXRDb250ZW50RWxlbWVudHModmFsdWUpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGFiZWxTaG9ydEVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3NldEFyaWFMYWJlbCgpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMub3B0aW9ucy5hcmlhTGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMub3B0aW9ucy5hcmlhTGFiZWwpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHRoaXMub3B0aW9ucy50aXRsZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuX2VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5vcHRpb25zLnRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRzZXQgaWNvbihpY29uOiBUaGVtZUljb24pIHtcblx0XHR0aGlzLl9zZXRBcmlhTGFiZWwoKTtcblxuXHRcdGNvbnN0IG9sZEljb25zID0gQXJyYXkuZnJvbSh0aGlzLl9lbGVtZW50LmNsYXNzTGlzdCkuZmlsdGVyKGl0ZW0gPT4gaXRlbS5zdGFydHNXaXRoKCdjb2RpY29uLScpKTtcblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoLi4ub2xkSWNvbnMpO1xuXHRcdHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdH1cblxuXHRzZXQgZW5hYmxlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkaXNhYmxlZCcpO1xuXHRcdFx0dGhpcy5fZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGlzYWJsZWQnLCBTdHJpbmcoZmFsc2UpKTtcblx0XHRcdHRoaXMuX2VsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kaXNhYmxlZCcsIFN0cmluZyh0cnVlKSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGVuYWJsZWQoKSB7XG5cdFx0cmV0dXJuICF0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC5jb250YWlucygnZGlzYWJsZWQnKTtcblx0fVxuXG5cdHNldCBzZWNvbmRhcnkodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3NlY29uZGFyeScsIHZhbHVlKTtcblx0XHQodGhpcy5vcHRpb25zIGFzIHsgc2Vjb25kYXJ5PzogYm9vbGVhbiB9KS5zZWNvbmRhcnkgPSB2YWx1ZTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcyhmYWxzZSk7XG5cdH1cblxuXHRzZXQgY2hlY2tlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjaGVja2VkJyk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgJ3RydWUnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjaGVja2VkJyk7XG5cdFx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1wcmVzc2VkJywgJ2ZhbHNlJyk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNoZWNrZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGVja2VkJyk7XG5cdH1cblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKSB7XG5cdFx0aWYgKCF0aGlzLl9ob3ZlciAmJiB0aXRsZSAhPT0gJycpIHtcblx0XHRcdHRoaXMuX2hvdmVyID0gdGhpcy5fcmVnaXN0ZXIoZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSgpLnNldHVwTWFuYWdlZEhvdmVyKHRoaXMub3B0aW9ucy5ob3ZlckRlbGVnYXRlID8/IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRoaXMuX2VsZW1lbnQsIHRpdGxlKSk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9ob3Zlcikge1xuXHRcdFx0dGhpcy5faG92ZXIudXBkYXRlKHRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHRzZXRBcmlhTGFiZWwoYXJpYUxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbCk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9lbGVtZW50LmZvY3VzKCk7XG5cdH1cblxuXHRoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNBY3RpdmVFbGVtZW50KHRoaXMuX2VsZW1lbnQpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUJ1dHRvbldpdGhEcm9wZG93bk9wdGlvbnMgZXh0ZW5kcyBJQnV0dG9uT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGNvbnRleHRNZW51UHJvdmlkZXI6IElDb250ZXh0TWVudVByb3ZpZGVyO1xuXHRyZWFkb25seSBhY3Rpb25zOiByZWFkb25seSBJQWN0aW9uW10gfCBJQWN0aW9uUHJvdmlkZXI7XG5cdHJlYWRvbmx5IGFjdGlvblJ1bm5lcj86IElBY3Rpb25SdW5uZXI7XG5cdHJlYWRvbmx5IGFkZFByaW1hcnlBY3Rpb25Ub0Ryb3Bkb3duPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIGRyb3Bkb3duIG1lbnVzIHdpdGggaGlnaGVyIGxheWVycyBhcmUgcmVuZGVyZWQgaGlnaGVyIGluIHotaW5kZXggb3JkZXJcblx0ICovXG5cdHJlYWRvbmx5IGRyb3Bkb3duTGF5ZXI/OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBCdXR0b25XaXRoRHJvcGRvd24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUJ1dHRvbiB7XG5cblx0cmVhZG9ubHkgcHJpbWFyeUJ1dHRvbjogQnV0dG9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbjogSUFjdGlvbjtcblx0cmVhZG9ubHkgZHJvcGRvd25CdXR0b246IEJ1dHRvbjtcblx0cHJpdmF0ZSByZWFkb25seSBzZXBhcmF0b3JDb250YWluZXI6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IHNlcGFyYXRvcjogSFRNTERpdkVsZW1lbnQ7XG5cblx0cmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2sgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFdmVudCB8IHVuZGVmaW5lZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2sgPSB0aGlzLl9vbkRpZENsaWNrLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IElCdXR0b25XaXRoRHJvcGRvd25PcHRpb25zKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tYnV0dG9uLWRyb3Bkb3duJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuZWxlbWVudCk7XG5cblx0XHRpZiAoIW9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSkge1xuXHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgaG92ZXJEZWxlZ2F0ZTogdGhpcy5fcmVnaXN0ZXIoY3JlYXRlSW5zdGFudEhvdmVyRGVsZWdhdGUoKSkgfTtcblx0XHR9XG5cblx0XHR0aGlzLnByaW1hcnlCdXR0b24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uKHRoaXMuZWxlbWVudCwgb3B0aW9ucykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucHJpbWFyeUJ1dHRvbi5vbkRpZENsaWNrKGUgPT4gdGhpcy5fb25EaWRDbGljay5maXJlKGUpKSk7XG5cdFx0dGhpcy5hY3Rpb24gPSB0b0FjdGlvbih7IGlkOiAncHJpbWFyeUFjdGlvbicsIGxhYmVsOiByZW5kZXJBc1BsYWludGV4dCh0aGlzLnByaW1hcnlCdXR0b24ubGFiZWwpLCBydW46IGFzeW5jICgpID0+IHRoaXMuX29uRGlkQ2xpY2suZmlyZSh1bmRlZmluZWQpIH0pO1xuXG5cdFx0dGhpcy5zZXBhcmF0b3JDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLnNlcGFyYXRvckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtb25hY28tYnV0dG9uLWRyb3Bkb3duLXNlcGFyYXRvcicpO1xuXG5cdFx0dGhpcy5zZXBhcmF0b3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLnNlcGFyYXRvckNvbnRhaW5lci5hcHBlbmRDaGlsZCh0aGlzLnNlcGFyYXRvcik7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKHRoaXMuc2VwYXJhdG9yQ29udGFpbmVyKTtcblxuXHRcdC8vIFNlcGFyYXRvciBzdHlsZXNcblx0XHRjb25zdCBib3JkZXIgPSBvcHRpb25zLmJ1dHRvbkJvcmRlcjtcblx0XHRpZiAoYm9yZGVyKSB7XG5cdFx0XHR0aGlzLnNlcGFyYXRvckNvbnRhaW5lci5zdHlsZS5ib3JkZXJUb3AgPSAnMXB4IHNvbGlkICcgKyBib3JkZXI7XG5cdFx0XHR0aGlzLnNlcGFyYXRvckNvbnRhaW5lci5zdHlsZS5ib3JkZXJCb3R0b20gPSAnMXB4IHNvbGlkICcgKyBib3JkZXI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnV0dG9uQmFja2dyb3VuZCA9IG9wdGlvbnMuc2Vjb25kYXJ5ID8gb3B0aW9ucy5idXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kIDogb3B0aW9ucy5idXR0b25CYWNrZ3JvdW5kO1xuXHRcdHRoaXMuc2VwYXJhdG9yQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJ1dHRvbkJhY2tncm91bmQgPz8gJyc7XG5cdFx0dGhpcy5zZXBhcmF0b3Iuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gb3B0aW9ucy5idXR0b25TZXBhcmF0b3IgPz8gJyc7XG5cblx0XHR0aGlzLmRyb3Bkb3duQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0aGlzLmVsZW1lbnQsIHsgLi4ub3B0aW9ucywgdGl0bGU6IGxvY2FsaXplKFwiYnV0dG9uIGRyb3Bkb3duIG1vcmUgYWN0aW9uc1wiLCAnTW9yZSBBY3Rpb25zLi4uJyksIHN1cHBvcnRJY29uczogdHJ1ZSB9KSk7XG5cdFx0dGhpcy5kcm9wZG93bkJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1oYXNwb3B1cCcsICd0cnVlJyk7XG5cdFx0dGhpcy5kcm9wZG93bkJ1dHRvbi5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdHRoaXMuZHJvcGRvd25CdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tZHJvcGRvd24tYnV0dG9uJyk7XG5cdFx0dGhpcy5kcm9wZG93bkJ1dHRvbi5pY29uID0gQ29kaWNvbi5kcm9wRG93bkJ1dHRvbjtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRyb3Bkb3duQnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gQXJyYXkuaXNBcnJheShvcHRpb25zLmFjdGlvbnMpID8gb3B0aW9ucy5hY3Rpb25zIDogKG9wdGlvbnMuYWN0aW9ucyBhcyBJQWN0aW9uUHJvdmlkZXIpLmdldEFjdGlvbnMoKTtcblx0XHRcdG9wdGlvbnMuY29udGV4dE1lbnVQcm92aWRlci5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuZHJvcGRvd25CdXR0b24uZWxlbWVudCxcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gb3B0aW9ucy5hZGRQcmltYXJ5QWN0aW9uVG9Ecm9wZG93biA9PT0gZmFsc2UgPyBbLi4uYWN0aW9uc10gOiBbdGhpcy5hY3Rpb24sIC4uLmFjdGlvbnNdLFxuXHRcdFx0XHRhY3Rpb25SdW5uZXI6IG9wdGlvbnMuYWN0aW9uUnVubmVyLFxuXHRcdFx0XHRvbkhpZGU6ICgpID0+IHRoaXMuZHJvcGRvd25CdXR0b24uZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKSxcblx0XHRcdFx0bGF5ZXI6IG9wdGlvbnMuZHJvcGRvd25MYXllclxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLmRyb3Bkb3duQnV0dG9uLmVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCkge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVsZW1lbnQucmVtb3ZlKCk7XG5cdH1cblxuXHRzZXQgbGFiZWwodmFsdWU6IHN0cmluZykge1xuXHRcdHRoaXMucHJpbWFyeUJ1dHRvbi5sYWJlbCA9IHZhbHVlO1xuXHRcdHRoaXMuYWN0aW9uLmxhYmVsID0gdmFsdWU7XG5cdH1cblxuXHRzZXQgaWNvbihpY29uOiBUaGVtZUljb24pIHtcblx0XHR0aGlzLnByaW1hcnlCdXR0b24uaWNvbiA9IGljb247XG5cdH1cblxuXHRzZXQgZW5hYmxlZChlbmFibGVkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5wcmltYXJ5QnV0dG9uLmVuYWJsZWQgPSBlbmFibGVkO1xuXHRcdHRoaXMuZHJvcGRvd25CdXR0b24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhZW5hYmxlZCk7XG5cdH1cblxuXHRnZXQgZW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5wcmltYXJ5QnV0dG9uLmVuYWJsZWQ7XG5cdH1cblxuXHRzZXQgY2hlY2tlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMucHJpbWFyeUJ1dHRvbi5jaGVja2VkID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgY2hlY2tlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5wcmltYXJ5QnV0dG9uLmNoZWNrZWQ7XG5cdH1cblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5wcmltYXJ5QnV0dG9uLnNldFRpdGxlKHRpdGxlKTtcblx0fVxuXG5cdHNldEFyaWFMYWJlbChhcmlhTGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucHJpbWFyeUJ1dHRvbi5zZXRBcmlhTGFiZWwoYXJpYUxhYmVsKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMucHJpbWFyeUJ1dHRvbi5mb2N1cygpO1xuXHR9XG5cblx0aGFzRm9jdXMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucHJpbWFyeUJ1dHRvbi5oYXNGb2N1cygpIHx8IHRoaXMuZHJvcGRvd25CdXR0b24uaGFzRm9jdXMoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnV0dG9uV2l0aERlc2NyaXB0aW9uIGltcGxlbWVudHMgSUJ1dHRvbldpdGhEZXNjcmlwdGlvbiB7XG5cblx0cHJpdmF0ZSBfYnV0dG9uOiBCdXR0b247XG5cdHByaXZhdGUgX2VsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9kZXNjcmlwdGlvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSUJ1dHRvbk9wdGlvbnMpIHtcblx0XHR0aGlzLl9lbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tZGVzY3JpcHRpb24tYnV0dG9uJyk7XG5cdFx0dGhpcy5fYnV0dG9uID0gbmV3IEJ1dHRvbih0aGlzLl9lbGVtZW50LCBvcHRpb25zKTtcblxuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tYnV0dG9uLWRlc2NyaXB0aW9uJyk7XG5cdFx0dGhpcy5fZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl9kZXNjcmlwdGlvbkVsZW1lbnQpO1xuXG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX2VsZW1lbnQpO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2xpY2soKTogQmFzZUV2ZW50PEV2ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2J1dHRvbi5vbkRpZENsaWNrO1xuXHR9XG5cblx0Z2V0IGVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9lbGVtZW50O1xuXHR9XG5cblx0c2V0IGxhYmVsKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9idXR0b24ubGFiZWwgPSB2YWx1ZTtcblx0fVxuXG5cdHNldCBpY29uKGljb246IFRoZW1lSWNvbikge1xuXHRcdHRoaXMuX2J1dHRvbi5pY29uID0gaWNvbjtcblx0fVxuXG5cdGdldCBlbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9idXR0b24uZW5hYmxlZDtcblx0fVxuXG5cdHNldCBlbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9idXR0b24uZW5hYmxlZCA9IGVuYWJsZWQ7XG5cdH1cblxuXHRzZXQgY2hlY2tlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2J1dHRvbi5jaGVja2VkID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgY2hlY2tlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fYnV0dG9uLmNoZWNrZWQ7XG5cdH1cblxuXHRzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYnV0dG9uLnNldFRpdGxlKHRpdGxlKTtcblx0fVxuXG5cdHNldEFyaWFMYWJlbChhcmlhTGFiZWw6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5zZXRBcmlhTGFiZWwoYXJpYUxhYmVsKTtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5mb2N1cygpO1xuXHR9XG5cdGhhc0ZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9idXR0b24uaGFzRm9jdXMoKTtcblx0fVxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2J1dHRvbi5kaXNwb3NlKCk7XG5cdH1cblxuXHRzZXQgZGVzY3JpcHRpb24odmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuc3VwcG9ydEljb25zKSB7XG5cdFx0XHRyZXNldCh0aGlzLl9kZXNjcmlwdGlvbkVsZW1lbnQsIC4uLnJlbmRlckxhYmVsV2l0aEljb25zKHZhbHVlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2Rlc2NyaXB0aW9uRWxlbWVudC50ZXh0Q29udGVudCA9IHZhbHVlO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZW51bSBCdXR0b25CYXJBbGlnbm1lbnQge1xuXHRIb3Jpem9udGFsID0gMCxcblx0VmVydGljYWxcbn1cblxuZXhwb3J0IGNsYXNzIEJ1dHRvbkJhciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnV0dG9uczogSUJ1dHRvbltdID0gW107XG5cdHByaXZhdGUgcmVhZG9ubHkgX2J1dHRvblN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgcHJpdmF0ZSByZWFkb25seSBvcHRpb25zPzogeyBhbGlnbm1lbnQ/OiBCdXR0b25CYXJBbGlnbm1lbnQgfSkgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9idXR0b25TdG9yZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRnZXQgYnV0dG9ucygpOiBJQnV0dG9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9idXR0b25zO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fYnV0dG9uU3RvcmUuY2xlYXIoKTtcblx0XHR0aGlzLl9idXR0b25zLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRhZGRCdXR0b24ob3B0aW9uczogSUJ1dHRvbk9wdGlvbnMpOiBJQnV0dG9uIHtcblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9idXR0b25TdG9yZS5hZGQobmV3IEJ1dHRvbih0aGlzLmNvbnRhaW5lciwgb3B0aW9ucykpO1xuXHRcdHRoaXMucHVzaEJ1dHRvbihidXR0b24pO1xuXHRcdHJldHVybiBidXR0b247XG5cdH1cblxuXHRhZGRCdXR0b25XaXRoRGVzY3JpcHRpb24ob3B0aW9uczogSUJ1dHRvbk9wdGlvbnMpOiBJQnV0dG9uV2l0aERlc2NyaXB0aW9uIHtcblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9idXR0b25TdG9yZS5hZGQobmV3IEJ1dHRvbldpdGhEZXNjcmlwdGlvbih0aGlzLmNvbnRhaW5lciwgb3B0aW9ucykpO1xuXHRcdHRoaXMucHVzaEJ1dHRvbihidXR0b24pO1xuXHRcdHJldHVybiBidXR0b247XG5cdH1cblxuXHRhZGRCdXR0b25XaXRoRHJvcGRvd24ob3B0aW9uczogSUJ1dHRvbldpdGhEcm9wZG93bk9wdGlvbnMpOiBJQnV0dG9uIHtcblx0XHRjb25zdCBidXR0b24gPSB0aGlzLl9idXR0b25TdG9yZS5hZGQobmV3IEJ1dHRvbldpdGhEcm9wZG93bih0aGlzLmNvbnRhaW5lciwgb3B0aW9ucykpO1xuXHRcdHRoaXMucHVzaEJ1dHRvbihidXR0b24pO1xuXHRcdHJldHVybiBidXR0b247XG5cdH1cblxuXHRwcml2YXRlIHB1c2hCdXR0b24oYnV0dG9uOiBJQnV0dG9uKTogdm9pZCB7XG5cdFx0dGhpcy5fYnV0dG9ucy5wdXNoKGJ1dHRvbik7XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2J1dHRvbnMubGVuZ3RoIC0gMTtcblx0XHR0aGlzLl9idXR0b25TdG9yZS5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGJ1dHRvbi5lbGVtZW50LCBFdmVudFR5cGUuS0VZX0RPV04sIGUgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0bGV0IGV2ZW50SGFuZGxlZCA9IHRydWU7XG5cblx0XHRcdC8vIE5leHQgLyBQcmV2aW91cyBCdXR0b25cblx0XHRcdGxldCBidXR0b25JbmRleFRvRm9jdXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChldmVudC5lcXVhbHModGhpcy5vcHRpb25zPy5hbGlnbm1lbnQgPT09IEJ1dHRvbkJhckFsaWdubWVudC5WZXJ0aWNhbCA/IEtleUNvZGUuVXBBcnJvdyA6IEtleUNvZGUuTGVmdEFycm93KSkge1xuXHRcdFx0XHRidXR0b25JbmRleFRvRm9jdXMgPSBpbmRleCA+IDAgPyBpbmRleCAtIDEgOiB0aGlzLl9idXR0b25zLmxlbmd0aCAtIDE7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyh0aGlzLm9wdGlvbnM/LmFsaWdubWVudCA9PT0gQnV0dG9uQmFyQWxpZ25tZW50LlZlcnRpY2FsID8gS2V5Q29kZS5Eb3duQXJyb3cgOiBLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdGJ1dHRvbkluZGV4VG9Gb2N1cyA9IGluZGV4ID09PSB0aGlzLl9idXR0b25zLmxlbmd0aCAtIDEgPyAwIDogaW5kZXggKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXZlbnRIYW5kbGVkID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChldmVudEhhbmRsZWQgJiYgdHlwZW9mIGJ1dHRvbkluZGV4VG9Gb2N1cyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0dGhpcy5fYnV0dG9uc1tidXR0b25JbmRleFRvRm9jdXNdLmZvY3VzKCk7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cdH1cbn1cblxuLyoqXG4gKiBUaGlzIGlzIGEgQnV0dG9uIHRoYXQgc3VwcG9ydHMgYW4gaWNvbiB0byB0aGUgbGVmdCwgYW5kIG1hcmtkb3duIHRvIHRoZSByaWdodCwgd2l0aCBwcm9wZXIgc2VwYXJhdGlvbiBhbmQgd3JhcHBpbmcgdGhlIG1hcmtkb3duIGxhYmVsLCB3aGljaCBCdXR0b24gZG9lc24ndCBkby5cbiAqL1xuZXhwb3J0IGNsYXNzIEJ1dHRvbldpdGhJY29uIGV4dGVuZHMgQnV0dG9uIHtcblx0cHJpdmF0ZSByZWFkb25seSBfaWNvbkVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tZGxhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0cHVibGljIGdldCBsYWJlbEVsZW1lbnQoKSB7IHJldHVybiB0aGlzLl9tZGxhYmVsRWxlbWVudDsgfVxuXG5cdHB1YmxpYyBnZXQgaWNvbkVsZW1lbnQoKSB7IHJldHVybiB0aGlzLl9pY29uRWxlbWVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIG9wdGlvbnM6IElCdXR0b25PcHRpb25zKSB7XG5cdFx0c3VwZXIoY29udGFpbmVyLCBvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zLnN1cHBvcnRTaG9ydExhYmVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0J1dHRvbldpdGhJY29uIGRvZXMgbm90IHN1cHBvcnQgc2hvcnQgbGFiZWxzJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28taWNvbi1idXR0b24nKTtcblx0XHR0aGlzLl9pY29uRWxlbWVudCA9ICQoJycpO1xuXHRcdHRoaXMuX21kbGFiZWxFbGVtZW50ID0gJCgnLm1vbmFjby1idXR0b24tbWRsYWJlbCcpO1xuXHRcdHRoaXMuX2VsZW1lbnQuYXBwZW5kKHRoaXMuX2ljb25FbGVtZW50LCB0aGlzLl9tZGxhYmVsRWxlbWVudCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgbGFiZWwoKTogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nIHtcblx0XHRyZXR1cm4gc3VwZXIubGFiZWw7XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgbGFiZWwodmFsdWU6IElNYXJrZG93blN0cmluZyB8IHN0cmluZykge1xuXHRcdGlmICh0aGlzLl9sYWJlbCA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNNYXJrZG93blN0cmluZyh0aGlzLl9sYWJlbCkgJiYgaXNNYXJrZG93blN0cmluZyh2YWx1ZSkgJiYgbWFya2Rvd25TdHJpbmdFcXVhbCh0aGlzLl9sYWJlbCwgdmFsdWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tdGV4dC1idXR0b24nKTtcblx0XHRpZiAoaXNNYXJrZG93blN0cmluZyh2YWx1ZSkpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gcmVuZGVyTWFya2Rvd24odmFsdWUsIGJ1dHRvbk1hcmtkb3duUmVuZGVyT3B0aW9ucywgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpKTtcblx0XHRcdHJlbmRlcmVkLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRjb25zdCByb290ID0gcmVuZGVyZWQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdwJyk/LmlubmVySFRNTDtcblx0XHRcdGlmIChyb290KSB7XG5cdFx0XHRcdHNhZmVTZXRJbm5lckh0bWwodGhpcy5fbWRsYWJlbEVsZW1lbnQsIHJvb3QsIGJ1dHRvblNhbml0aXplckNvbmZpZyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNldCh0aGlzLl9tZGxhYmVsRWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLm9wdGlvbnMuc3VwcG9ydEljb25zKSB7XG5cdFx0XHRcdHJlc2V0KHRoaXMuX21kbGFiZWxFbGVtZW50LCAuLi50aGlzLmdldENvbnRlbnRFbGVtZW50cyh2YWx1ZSkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbWRsYWJlbEVsZW1lbnQudGV4dENvbnRlbnQgPSB2YWx1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgdGl0bGU6IHN0cmluZyA9ICcnO1xuXHRcdGlmICh0eXBlb2YgdGhpcy5vcHRpb25zLnRpdGxlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGl0bGUgPSB0aGlzLm9wdGlvbnMudGl0bGU7XG5cdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMudGl0bGUpIHtcblx0XHRcdHRpdGxlID0gcmVuZGVyQXNQbGFpbnRleHQodmFsdWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuc2V0VGl0bGUodGl0bGUpO1xuXHRcdHRoaXMuX3NldEFyaWFMYWJlbCgpO1xuXHRcdHRoaXMuX2xhYmVsID0gdmFsdWU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgaWNvbigpOiBUaGVtZUljb24ge1xuXHRcdHJldHVybiBzdXBlci5pY29uO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0IGljb24oaWNvbjogVGhlbWVJY29uKSB7XG5cdFx0dGhpcy5faWNvbkVsZW1lbnQuY2xhc3NMaXN0LnZhbHVlID0gJyc7XG5cdFx0dGhpcy5faWNvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKSk7XG5cdFx0dGhpcy5fc2V0QXJpYUxhYmVsKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsdUJBQXVCLGFBQWEsV0FBMEIsaUJBQWlCLE9BQU8sWUFBWSxTQUFTO0FBQ3BILFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxT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a0IsRUFBRSx3QkFBd0I7QUFDakQsU0FBSyxTQUFTLE9BQU8sS0FBSyxjQUFjLEtBQUssZUFBZTtBQUFBLEVBQzdEO0FBQUEsRUFFQSxJQUFhLFFBQWtDO0FBQzlDLFdBQU8sTUFBTTtBQUFBLEVBQ2Q7QUFBQSxFQUVBLElBQWEsTUFBTSxPQUFpQztBQUNuRCxRQUFJLEtBQUssV0FBVyxPQUFPO0FBQzFCO0FBQUEsSUFDRDtBQUVBLFFBQUksaUJBQWlCLEtBQUssTUFBTSxLQUFLLGlCQUFpQixLQUFLLEtBQUssb0JBQW9CLEtBQUssUUFBUSxLQUFLLEdBQUc7QUFDeEc7QUFBQSxJQUNEO0FBRUEsU0FBSyxTQUFTLFVBQVUsSUFBSSxvQkFBb0I7QUFDaEQsUUFBSSxpQkFBaUIsS0FBSyxHQUFHO0FBQzVCLFlBQU0sV0FBVyxlQUFlLE9BQU8sNkJBQTZCLFNBQVMsY0FBYyxNQUFNLENBQUM7QUFDbEcsZUFBUyxRQUFRO0FBR2pCLFlBQU0sT0FBTyxTQUFTLFFBQVEsY0FBYyxHQUFHLEdBQUc7QUFDbEQsVUFBSSxNQUFNO0FBQ1QseUJBQWlCLEtBQUssaUJBQWlCLE1BQU0scUJBQXFCO0FBQUEsTUFDbkUsT0FBTztBQUNOLGNBQU0sS0FBSyxlQUFlO0FBQUEsTUFDM0I7QUFBQSxJQUNELE9BQU87QUFDTixVQUFJLEtBQUssUUFBUSxjQUFjO0FBQzlCLGNBQU0sS0FBSyxpQkFBaUIsR0FBRyxLQUFLLG1CQUFtQixLQUFLLENBQUM7QUFBQSxNQUM5RCxPQUFPO0FBQ04sYUFBSyxnQkFBZ0IsY0FBYztBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUVBLFFBQUksUUFBZ0I7QUFDcEIsUUFBSSxPQUFPLEtBQUssUUFBUSxVQUFVLFVBQVU7QUFDM0MsY0FBUSxLQUFLLFFBQVE7QUFBQSxJQUN0QixXQUFXLEtBQUssUUFBUSxPQUFPO0FBQzlCLGNBQVEsa0JBQWtCLEtBQUs7QUFBQSxJQUNoQztBQUVBLFNBQUssU0FBUyxLQUFLO0FBQ25CLFNBQUssY0FBYztBQUNuQixTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUEsRUFFQSxJQUFhLE9BQWtCO0FBQzlCLFdBQU8sTUFBTTtBQUFBLEVBQ2Q7QUFBQSxFQUVBLElBQWEsS0FBSyxNQUFpQjtBQUNsQyxTQUFLLGFBQWEsVUFBVSxRQUFRO0FBQ3BDLFNBQUssYUFBYSxVQUFVLElBQUksR0FBRyxVQUFVLGlCQUFpQixJQUFJLENBQUM7QUFDbkUsU0FBSyxjQUFjO0FBQUEsRUFDcEI7QUFDRDsiLAogICJuYW1lcyI6IFsiQnV0dG9uQmFyQWxpZ25tZW50Il0KfQo=
