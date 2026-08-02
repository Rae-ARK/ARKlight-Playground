import "./dialog.css";
import { localize } from "../../../../nls.js";
import { $, addDisposableListener, addStandardDisposableListener, clearNode, EventHelper, EventType, getWindow, hide, isActiveElement, isAncestor, show } from "../../dom.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { ActionBar } from "../actionbar/actionbar.js";
import { ButtonBar, ButtonBarAlignment, ButtonWithDescription, ButtonWithDropdown } from "../button/button.js";
import { Checkbox } from "../toggle/toggle.js";
import { InputBox } from "../inputbox/inputBox.js";
import { Action, toAction } from "../../../common/actions.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { KeyCode, KeyMod } from "../../../common/keyCodes.js";
import { mnemonicButtonLabel } from "../../../common/labels.js";
import { Disposable, toDisposable } from "../../../common/lifecycle.js";
import { isLinux, isMacintosh, isWindows } from "../../../common/platform.js";
import { isActionProvider } from "../dropdown/dropdown.js";
var DialogContentsAlignment = /* @__PURE__ */ ((DialogContentsAlignment2) => {
  DialogContentsAlignment2[DialogContentsAlignment2["Horizontal"] = 0] = "Horizontal";
  DialogContentsAlignment2[DialogContentsAlignment2["Vertical"] = 1] = "Vertical";
  return DialogContentsAlignment2;
})(DialogContentsAlignment || {});
class Dialog extends Disposable {
  constructor(container, message, buttons, options) {
    super();
    this.container = container;
    this.message = message;
    this.options = options;
    this.modalElement = this.container.appendChild($(`.monaco-dialog-modal-block.dimmed`));
    this._register(addStandardDisposableListener(this.modalElement, EventType.CLICK, (e) => {
      if (e.target === this.modalElement) {
        this.element.focus();
      }
    }));
    this.shadowElement = this.modalElement.appendChild($(".dialog-shadow"));
    this.element = this.shadowElement.appendChild($(".monaco-dialog-box"));
    if (options.alignment === 1 /* Vertical */) {
      this.element.classList.add("align-vertical");
    }
    if (options.extraClasses) {
      this.element.classList.add(...options.extraClasses);
    }
    this.element.setAttribute("role", "dialog");
    this.element.tabIndex = -1;
    hide(this.element);
    if (this.options.renderFooter) {
      this.footerContainer = this.element.appendChild($(".dialog-footer-row"));
      const customFooter = this.footerContainer.appendChild($("#monaco-dialog-footer.dialog-footer"));
      this.options.renderFooter(customFooter);
      for (const el of this.footerContainer.querySelectorAll("a")) {
        el.tabIndex = 0;
      }
    }
    this.buttonStyles = options.buttonStyles;
    if (Array.isArray(buttons) && buttons.length > 0) {
      this.buttons = buttons;
    } else if (!this.options.disableDefaultAction) {
      this.buttons = [localize("ok", "OK")];
    } else {
      this.buttons = [];
    }
    const buttonsRowElement = this.element.appendChild($(".dialog-buttons-row"));
    this.buttonsContainer = buttonsRowElement.appendChild($(".dialog-buttons"));
    const messageRowElement = this.element.appendChild($(".dialog-message-row"));
    this.iconElement = messageRowElement.appendChild($("#monaco-dialog-icon.dialog-icon"));
    this.iconElement.setAttribute("aria-label", this.getIconAriaLabel());
    this.messageContainer = messageRowElement.appendChild($(".dialog-message-container"));
    if (this.options.detail || this.options.renderBody) {
      const messageElement = this.messageContainer.appendChild($(".dialog-message"));
      const messageTextElement = messageElement.appendChild($("#monaco-dialog-message-text.dialog-message-text"));
      messageTextElement.innerText = this.message;
    }
    this.messageDetailElement = this.messageContainer.appendChild($("#monaco-dialog-message-detail.dialog-message-detail"));
    if (this.options.detail || !this.options.renderBody) {
      this.messageDetailElement.innerText = this.options.detail ? this.options.detail : message;
    } else {
      this.messageDetailElement.style.display = "none";
    }
    if (this.options.renderBody) {
      const customBody = this.messageContainer.appendChild($("#monaco-dialog-message-body.dialog-message-body"));
      this.options.renderBody(customBody);
      for (const el of this.messageContainer.querySelectorAll("a")) {
        el.tabIndex = 0;
      }
    }
    if (this.options.inputs) {
      this.inputs = this.options.inputs.map((input) => {
        const inputRowElement = this.messageContainer.appendChild($(".dialog-message-input"));
        const inputBox = this._register(new InputBox(inputRowElement, void 0, {
          placeholder: input.placeholder,
          type: input.type ?? "text",
          inputBoxStyles: options.inputBoxStyles
        }));
        if (input.value) {
          inputBox.value = input.value;
        }
        return inputBox;
      });
    } else {
      this.inputs = [];
    }
    if (this.options.checkboxLabel) {
      const checkboxRowElement = this.messageContainer.appendChild($(".dialog-checkbox-row"));
      const checkbox = this.checkbox = this._register(
        new Checkbox(this.options.checkboxLabel, !!this.options.checkboxChecked, options.checkboxStyles)
      );
      checkboxRowElement.appendChild(checkbox.domNode);
      const checkboxMessageElement = checkboxRowElement.appendChild($(".dialog-checkbox-message"));
      checkboxMessageElement.innerText = this.options.checkboxLabel;
      this._register(addDisposableListener(checkboxMessageElement, EventType.CLICK, () => checkbox.checked = !checkbox.checked));
    }
    const toolbarRowElement = this.element.appendChild($(".dialog-toolbar-row"));
    this.toolbarContainer = toolbarRowElement.appendChild($(".dialog-toolbar"));
    this.applyStyles();
  }
  getIconAriaLabel() {
    let typeLabel = localize("dialogInfoMessage", "Info");
    switch (this.options.type) {
      case "error":
        typeLabel = localize("dialogErrorMessage", "Error");
        break;
      case "warning":
        typeLabel = localize("dialogWarningMessage", "Warning");
        break;
      case "pending":
        typeLabel = localize("dialogPendingMessage", "In Progress");
        break;
      case "none":
      case "info":
      case "question":
      default:
        break;
    }
    return typeLabel;
  }
  updateMessage(message) {
    this.messageDetailElement.innerText = message;
  }
  async show() {
    this.focusToReturn = this.container.ownerDocument.activeElement;
    return new Promise((resolve) => {
      clearNode(this.buttonsContainer);
      const close = () => {
        resolve({
          button: this.options.cancelId || 0,
          checkboxChecked: this.checkbox ? this.checkbox.checked : void 0
        });
        return;
      };
      this._register(toDisposable(close));
      const buttonBar = this.buttonBar = this._register(new ButtonBar(this.buttonsContainer, { alignment: this.options?.alignment === 1 /* Vertical */ ? ButtonBarAlignment.Vertical : ButtonBarAlignment.Horizontal }));
      const buttonMap = this.rearrangeButtons(this.buttons, this.options.cancelId);
      const onButtonClick = (index) => {
        resolve({
          button: buttonMap[index].index,
          checkboxChecked: this.checkbox ? this.checkbox.checked : void 0,
          values: this.inputs.length > 0 ? this.inputs.map((input) => input.value) : void 0
        });
      };
      buttonMap.forEach((_, index) => {
        const primary = buttonMap[index].index === 0;
        let button;
        const buttonOptions = this.options.buttonOptions?.[buttonMap[index]?.index];
        if (primary && this.options?.primaryButtonDropdown) {
          const actions = isActionProvider(this.options.primaryButtonDropdown.actions) ? this.options.primaryButtonDropdown.actions.getActions() : this.options.primaryButtonDropdown.actions;
          button = this._register(buttonBar.addButtonWithDropdown({
            ...this.options.primaryButtonDropdown,
            ...this.buttonStyles,
            dropdownLayer: 2600,
            // ensure the dropdown is above the dialog
            actions: actions.map((action) => toAction({
              ...action,
              run: async () => {
                await action.run();
                onButtonClick(index);
              }
            }))
          }));
        } else if (buttonOptions?.sublabel) {
          button = this._register(buttonBar.addButtonWithDescription({ secondary: !primary, ...this.buttonStyles }));
        } else {
          button = this._register(buttonBar.addButton({ secondary: !primary, ...this.buttonStyles }));
        }
        if (buttonOptions?.styleButton) {
          buttonOptions.styleButton(button);
        }
        button.label = mnemonicButtonLabel(buttonMap[index].label, true);
        if (button instanceof ButtonWithDescription) {
          if (buttonOptions?.sublabel) {
            button.description = buttonOptions?.sublabel;
          }
        }
        this._register(button.onDidClick((e) => {
          if (e) {
            EventHelper.stop(e);
          }
          onButtonClick(index);
        }));
      });
      const window = getWindow(this.container);
      let sawEscapeKeyDown = false;
      this._register(addDisposableListener(window, "keydown", (e) => {
        const evt = new StandardKeyboardEvent(e);
        if (evt.equals(KeyCode.Escape)) {
          sawEscapeKeyDown = true;
        }
        if (evt.equals(KeyMod.Alt)) {
          evt.preventDefault();
        }
        if (evt.equals(KeyCode.Enter)) {
          if (this.inputs.some((input) => input.hasFocus())) {
            EventHelper.stop(e);
            resolve({
              button: buttonMap.find((button) => button.index !== this.options.cancelId)?.index ?? 0,
              checkboxChecked: this.checkbox ? this.checkbox.checked : void 0,
              values: this.inputs.length > 0 ? this.inputs.map((input) => input.value) : void 0
            });
          }
          return;
        }
        if (isMacintosh && evt.equals(KeyMod.CtrlCmd | KeyCode.KeyD)) {
          EventHelper.stop(e);
          const noButton = buttonMap.find((button) => button.index === 1 && button.index !== this.options.cancelId);
          if (noButton) {
            resolve({
              button: noButton.index,
              checkboxChecked: this.checkbox ? this.checkbox.checked : void 0,
              values: this.inputs.length > 0 ? this.inputs.map((input) => input.value) : void 0
            });
          }
          return;
        }
        if (evt.equals(KeyCode.Space)) {
          return;
        }
        let eventHandled = false;
        if (evt.equals(KeyCode.Tab) || evt.equals(KeyCode.RightArrow) || evt.equals(KeyMod.Shift | KeyCode.Tab) || evt.equals(KeyCode.LeftArrow)) {
          const focusableElements = [];
          let focusedIndex = -1;
          if (this.messageContainer) {
            const links = this.messageContainer.querySelectorAll("a");
            for (const link of links) {
              focusableElements.push(link);
              if (isActiveElement(link)) {
                focusedIndex = focusableElements.length - 1;
              }
            }
          }
          for (const input of this.inputs) {
            focusableElements.push(input);
            if (input.hasFocus()) {
              focusedIndex = focusableElements.length - 1;
            }
          }
          if (this.checkbox) {
            focusableElements.push(this.checkbox);
            if (this.checkbox.hasFocus()) {
              focusedIndex = focusableElements.length - 1;
            }
          }
          if (this.buttonBar) {
            for (const button of this.buttonBar.buttons) {
              if (button instanceof ButtonWithDropdown) {
                focusableElements.push(button.primaryButton);
                if (button.primaryButton.hasFocus()) {
                  focusedIndex = focusableElements.length - 1;
                }
                focusableElements.push(button.dropdownButton);
                if (button.dropdownButton.hasFocus()) {
                  focusedIndex = focusableElements.length - 1;
                }
              } else {
                focusableElements.push(button);
                if (button.hasFocus()) {
                  focusedIndex = focusableElements.length - 1;
                }
              }
            }
          }
          if (this.footerContainer) {
            const links = this.footerContainer.querySelectorAll("a");
            for (const link of links) {
              focusableElements.push(link);
              if (isActiveElement(link)) {
                focusedIndex = focusableElements.length - 1;
              }
            }
          }
          if (evt.equals(KeyCode.Tab) || evt.equals(KeyCode.RightArrow)) {
            const newFocusedIndex = (focusedIndex + 1) % focusableElements.length;
            focusableElements[newFocusedIndex].focus();
          } else {
            if (focusedIndex === -1) {
              focusedIndex = focusableElements.length;
            }
            let newFocusedIndex = focusedIndex - 1;
            if (newFocusedIndex === -1) {
              newFocusedIndex = focusableElements.length - 1;
            }
            focusableElements[newFocusedIndex].focus();
          }
          eventHandled = true;
        }
        if (eventHandled) {
          EventHelper.stop(e, true);
        } else if (this.options.keyEventProcessor) {
          this.options.keyEventProcessor(evt);
        }
      }, true));
      this._register(addDisposableListener(window, "keyup", (e) => {
        EventHelper.stop(e, true);
        const evt = new StandardKeyboardEvent(e);
        if (!this.options.disableCloseAction && evt.equals(KeyCode.Escape) && sawEscapeKeyDown) {
          close();
        }
      }, true));
      this._register(addDisposableListener(this.element, "focusout", (e) => {
        if (!!e.relatedTarget && !!this.element) {
          if (!isAncestor(e.relatedTarget, this.element)) {
            if (this.options.isExternalFocusAllowed?.(e.relatedTarget)) {
              return;
            }
            this.focusToReturn = e.relatedTarget;
            if (e.target) {
              e.target.focus();
              EventHelper.stop(e, true);
            }
          }
        }
      }, false));
      const spinModifierClassName = "codicon-modifier-spin";
      this.iconElement.classList.remove(...ThemeIcon.asClassNameArray(Codicon.dialogError), ...ThemeIcon.asClassNameArray(Codicon.dialogWarning), ...ThemeIcon.asClassNameArray(Codicon.dialogInfo), ...ThemeIcon.asClassNameArray(Codicon.loading), spinModifierClassName);
      if (this.options.icon) {
        this.iconElement.classList.add(...ThemeIcon.asClassNameArray(this.options.icon));
      } else {
        switch (this.options.type) {
          case "error":
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogError));
            break;
          case "warning":
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogWarning));
            break;
          case "pending":
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.loading), spinModifierClassName);
            break;
          case "none":
            this.iconElement.classList.add("no-codicon");
            break;
          case "info":
          case "question":
          default:
            this.iconElement.classList.add(...ThemeIcon.asClassNameArray(Codicon.dialogInfo));
            break;
        }
      }
      if (!this.options.disableCloseAction && !this.options.disableCloseButton) {
        const actionBar = this._register(new ActionBar(this.toolbarContainer, {}));
        const action = this._register(new Action("dialog.close", localize("dialogClose", "Close Dialog"), ThemeIcon.asClassName(Codicon.dialogClose), true, async () => {
          resolve({
            button: this.options.cancelId || 0,
            checkboxChecked: this.checkbox ? this.checkbox.checked : void 0
          });
        }));
        actionBar.push(action, { icon: true, label: false });
      }
      this.applyStyles();
      this.element.setAttribute("aria-modal", "true");
      this.element.setAttribute("aria-labelledby", "monaco-dialog-icon monaco-dialog-message-text");
      this.element.setAttribute("aria-describedby", "monaco-dialog-icon monaco-dialog-message-text monaco-dialog-message-detail monaco-dialog-message-body monaco-dialog-footer");
      show(this.element);
      this.options.onVisibilityChange?.(window, true);
      this._register(toDisposable(() => this.options.onVisibilityChange?.(window, false)));
      if (this.inputs.length > 0) {
        this.inputs[0].focus();
        this.inputs[0].select();
      } else {
        buttonMap.forEach((value, index) => {
          if (value.index === 0) {
            buttonBar.buttons[index].focus();
          }
        });
      }
    });
  }
  applyStyles() {
    const style = this.options.dialogStyles;
    const fgColor = style.dialogForeground;
    const bgColor = style.dialogBackground;
    const shadowColor = style.dialogShadow ? `0 0px 8px ${style.dialogShadow}` : "";
    const border = style.dialogBorder ? `1px solid ${style.dialogBorder}` : "";
    const linkFgColor = style.textLinkForeground;
    this.shadowElement.style.boxShadow = shadowColor;
    this.element.style.color = fgColor ?? "";
    this.element.style.backgroundColor = bgColor ?? "";
    this.element.style.border = border;
    if (linkFgColor) {
      for (const el of [...this.messageContainer.getElementsByTagName("a"), ...this.footerContainer?.getElementsByTagName("a") ?? []]) {
        el.style.color = linkFgColor;
        el.style.textDecoration = "underline";
      }
    }
    let color;
    switch (this.options.type) {
      case "none":
        break;
      case "error":
        color = style.errorIconForeground;
        break;
      case "warning":
        color = style.warningIconForeground;
        break;
      default:
        color = style.infoIconForeground;
        break;
    }
    if (color) {
      this.iconElement.style.color = color;
    }
  }
  dispose() {
    super.dispose();
    if (this.modalElement) {
      this.modalElement.remove();
      this.modalElement = void 0;
    }
    if (this.focusToReturn && isAncestor(this.focusToReturn, this.container.ownerDocument.body)) {
      this.focusToReturn.focus();
      this.focusToReturn = void 0;
    }
  }
  rearrangeButtons(buttons, cancelId) {
    const buttonMap = buttons.map((label, index) => ({ label, index }));
    if (buttons.length < 2 || this.options.alignment === 1 /* Vertical */) {
      return buttonMap;
    }
    if (isMacintosh || isLinux) {
      if (typeof cancelId === "number" && buttonMap[cancelId]) {
        const cancelButton = buttonMap.splice(cancelId, 1)[0];
        buttonMap.splice(1, 0, cancelButton);
      }
      buttonMap.reverse();
    } else if (isWindows) {
      if (typeof cancelId === "number" && buttonMap[cancelId]) {
        const cancelButton = buttonMap.splice(cancelId, 1)[0];
        buttonMap.push(cancelButton);
      }
    }
    return buttonMap;
  }
}
export {
  Dialog,
  DialogContentsAlignment
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9kaWFsb2cvZGlhbG9nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL2RpYWxvZy5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBhZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lciwgY2xlYXJOb2RlLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBnZXRXaW5kb3csIGhpZGUsIGlzQWN0aXZlRWxlbWVudCwgaXNBbmNlc3Rvciwgc2hvdyB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgQnV0dG9uQmFyLCBCdXR0b25CYXJBbGlnbm1lbnQsIEJ1dHRvbldpdGhEZXNjcmlwdGlvbiwgQnV0dG9uV2l0aERyb3Bkb3duLCBJQnV0dG9uLCBJQnV0dG9uU3R5bGVzLCBJQnV0dG9uV2l0aERyb3Bkb3duT3B0aW9ucyB9IGZyb20gJy4uL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgSUNoZWNrYm94U3R5bGVzLCBDaGVja2JveCB9IGZyb20gJy4uL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSUlucHV0Qm94U3R5bGVzLCBJbnB1dEJveCB9IGZyb20gJy4uL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IEFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5TW9kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IG1uZW1vbmljQnV0dG9uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0FjdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vZHJvcGRvd24vZHJvcGRvd24uanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElEaWFsb2dJbnB1dE9wdGlvbnMge1xuXHRyZWFkb25seSBwbGFjZWhvbGRlcj86IHN0cmluZztcblx0cmVhZG9ubHkgdHlwZT86ICd0ZXh0JyB8ICdwYXNzd29yZCc7XG5cdHJlYWRvbmx5IHZhbHVlPzogc3RyaW5nO1xufVxuXG5leHBvcnQgZW51bSBEaWFsb2dDb250ZW50c0FsaWdubWVudCB7XG5cdC8qKlxuXHQgKiBEaWFsb2cgY29udGVudHMgYWxpZ24gZnJvbSBsZWZ0IHRvIHJpZ2h0IChpY29uLCBtZXNzYWdlLCBidXR0b25zIG9uIGEgc2VwYXJhdGUgcm93KS5cblx0ICpcblx0ICogTm90ZTogdGhpcyBpcyB0aGUgZGVmYXVsdCBhbGlnbm1lbnQgZm9yIGRpYWxvZ3MuXG5cdCAqL1xuXHRIb3Jpem9udGFsID0gMCxcblxuXHQvKipcblx0ICogRGlhbG9nIGNvbnRlbnRzIGFsaWduIGZyb20gdG9wIHRvIGJvdHRvbSAoaWNvbiwgbWVzc2FnZSwgYnV0dG9ucyBzdGFjayBvbiB0b3Agb2YgZWFjaCBvdGhlcilcblx0ICovXG5cdFZlcnRpY2FsXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpYWxvZ09wdGlvbnMge1xuXHRyZWFkb25seSBjYW5jZWxJZD86IG51bWJlcjtcblx0cmVhZG9ubHkgZGV0YWlsPzogc3RyaW5nO1xuXHRyZWFkb25seSBhbGlnbm1lbnQ/OiBEaWFsb2dDb250ZW50c0FsaWdubWVudDtcblx0cmVhZG9ubHkgY2hlY2tib3hMYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgY2hlY2tib3hDaGVja2VkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdHlwZT86ICdub25lJyB8ICdpbmZvJyB8ICdlcnJvcicgfCAncXVlc3Rpb24nIHwgJ3dhcm5pbmcnIHwgJ3BlbmRpbmcnO1xuXHRyZWFkb25seSBleHRyYUNsYXNzZXM/OiBzdHJpbmdbXTtcblx0cmVhZG9ubHkgaW5wdXRzPzogSURpYWxvZ0lucHV0T3B0aW9uc1tdO1xuXHRyZWFkb25seSBrZXlFdmVudFByb2Nlc3Nvcj86IChldmVudDogU3RhbmRhcmRLZXlib2FyZEV2ZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSByZW5kZXJCb2R5PzogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IHJlbmRlckZvb3Rlcj86IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xuXHRyZWFkb25seSBidXR0b25PcHRpb25zPzogQXJyYXk8dW5kZWZpbmVkIHwgeyBzdWJsYWJlbD86IHN0cmluZzsgc3R5bGVCdXR0b24/OiAoYnV0dG9uOiBJQnV0dG9uKSA9PiB2b2lkIH0+O1xuXHRyZWFkb25seSBwcmltYXJ5QnV0dG9uRHJvcGRvd24/OiBJQnV0dG9uV2l0aERyb3Bkb3duT3B0aW9ucztcblx0cmVhZG9ubHkgZGlzYWJsZUNsb3NlQWN0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlzYWJsZUNsb3NlQnV0dG9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZGlzYWJsZURlZmF1bHRBY3Rpb24/OiBib29sZWFuO1xuXHQvKipcblx0ICogVGVtcG9yYXJ5IGVzY2FwZSBoYXRjaCBmb3IgZGlhbG9ncyB0aGF0IGVtYmVkIHdpZGdldHMgd2hvc2UgcG9wdXBzIG1vdW50XG5cdCAqIGF0IHdpbmRvdyByb290IChvdXRzaWRlIHRoZSBkaWFsb2cgRE9NKS4gTmVlZGVkIGJlY2F1c2UgdGhlIGZvY3VzIHRyYXBcblx0ICogd291bGQgb3RoZXJ3aXNlIGltbWVkaWF0ZWx5IHJlY2xhaW0gZm9jdXMgZnJvbSBjb250ZXh0IHZpZXdzIGFuZCBwaWNrZXJzLlxuXHQgKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyMzkyMCBmb3IgcmVtb3ZhbCBwbGFuLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNFeHRlcm5hbEZvY3VzQWxsb3dlZD86IChyZWxhdGVkVGFyZ2V0OiBIVE1MRWxlbWVudCkgPT4gYm9vbGVhbjtcblx0cmVhZG9ubHkgb25WaXNpYmlsaXR5Q2hhbmdlPzogKHdpbmRvdzogV2luZG93LCB2aXNpYmxlOiBib29sZWFuKSA9PiB2b2lkO1xuXHRyZWFkb25seSBidXR0b25TdHlsZXM6IElCdXR0b25TdHlsZXM7XG5cdHJlYWRvbmx5IGNoZWNrYm94U3R5bGVzOiBJQ2hlY2tib3hTdHlsZXM7XG5cdHJlYWRvbmx5IGlucHV0Qm94U3R5bGVzOiBJSW5wdXRCb3hTdHlsZXM7XG5cdHJlYWRvbmx5IGRpYWxvZ1N0eWxlczogSURpYWxvZ1N0eWxlcztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRGlhbG9nUmVzdWx0IHtcblx0cmVhZG9ubHkgYnV0dG9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IGNoZWNrYm94Q2hlY2tlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHZhbHVlcz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElEaWFsb2dTdHlsZXMge1xuXHRyZWFkb25seSBkaWFsb2dGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRpYWxvZ0JhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZGlhbG9nU2hhZG93OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGRpYWxvZ0JvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBlcnJvckljb25Gb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHdhcm5pbmdJY29uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbmZvSWNvbkZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgdGV4dExpbmtGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBCdXR0b25NYXBFbnRyeSB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBEaWFsb2cgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc2hhZG93RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbW9kYWxFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBidXR0b25zQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBtZXNzYWdlRGV0YWlsRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgZm9vdGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBpY29uRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2hlY2tib3g6IENoZWNrYm94IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRvb2xiYXJDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGJ1dHRvbkJhcjogQnV0dG9uQmFyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGZvY3VzVG9SZXR1cm46IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlucHV0czogSW5wdXRCb3hbXTtcblx0cHJpdmF0ZSByZWFkb25seSBidXR0b25zOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBidXR0b25TdHlsZXM6IElCdXR0b25TdHlsZXM7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBjb250YWluZXI6IEhUTUxFbGVtZW50LCBwcml2YXRlIG1lc3NhZ2U6IHN0cmluZywgYnV0dG9uczogc3RyaW5nW10gfCB1bmRlZmluZWQsIHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uczogSURpYWxvZ09wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gTW9kYWwgYmFja2dyb3VuZCBibG9ja2VyXG5cdFx0dGhpcy5tb2RhbEVsZW1lbnQgPSB0aGlzLmNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKGAubW9uYWNvLWRpYWxvZy1tb2RhbC1ibG9jay5kaW1tZWRgKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkU3RhbmRhcmREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5tb2RhbEVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRpZiAoZS50YXJnZXQgPT09IHRoaXMubW9kYWxFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudC5mb2N1cygpOyAvLyBndWlkZSB1c2VycyBiYWNrIGludG8gdGhlIGRpYWxvZyBpZiBjbGlja2VkIGVsc2V3aGVyZVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIERpYWxvZyBCb3hcblx0XHR0aGlzLnNoYWRvd0VsZW1lbnQgPSB0aGlzLm1vZGFsRWxlbWVudC5hcHBlbmRDaGlsZCgkKCcuZGlhbG9nLXNoYWRvdycpKTtcblx0XHR0aGlzLmVsZW1lbnQgPSB0aGlzLnNoYWRvd0VsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnLm1vbmFjby1kaWFsb2ctYm94JykpO1xuXHRcdGlmIChvcHRpb25zLmFsaWdubWVudCA9PT0gRGlhbG9nQ29udGVudHNBbGlnbm1lbnQuVmVydGljYWwpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdhbGlnbi12ZXJ0aWNhbCcpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5leHRyYUNsYXNzZXMpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLm9wdGlvbnMuZXh0cmFDbGFzc2VzKTtcblx0XHR9XG5cdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdkaWFsb2cnKTtcblx0XHR0aGlzLmVsZW1lbnQudGFiSW5kZXggPSAtMTtcblx0XHRoaWRlKHRoaXMuZWxlbWVudCk7XG5cblx0XHQvLyBGb290ZXJcblx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlckZvb3Rlcikge1xuXHRcdFx0dGhpcy5mb290ZXJDb250YWluZXIgPSB0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnLmRpYWxvZy1mb290ZXItcm93JykpO1xuXG5cdFx0XHRjb25zdCBjdXN0b21Gb290ZXIgPSB0aGlzLmZvb3RlckNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcjbW9uYWNvLWRpYWxvZy1mb290ZXIuZGlhbG9nLWZvb3RlcicpKTtcblx0XHRcdHRoaXMub3B0aW9ucy5yZW5kZXJGb290ZXIoY3VzdG9tRm9vdGVyKTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRmb3IgKGNvbnN0IGVsIG9mIHRoaXMuZm9vdGVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKSkge1xuXHRcdFx0XHRlbC50YWJJbmRleCA9IDA7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQnV0dG9uc1xuXHRcdHRoaXMuYnV0dG9uU3R5bGVzID0gb3B0aW9ucy5idXR0b25TdHlsZXM7XG5cblx0XHRpZiAoQXJyYXkuaXNBcnJheShidXR0b25zKSAmJiBidXR0b25zLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuYnV0dG9ucyA9IGJ1dHRvbnM7XG5cdFx0fSBlbHNlIGlmICghdGhpcy5vcHRpb25zLmRpc2FibGVEZWZhdWx0QWN0aW9uKSB7XG5cdFx0XHR0aGlzLmJ1dHRvbnMgPSBbbG9jYWxpemUoJ29rJywgXCJPS1wiKV07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuYnV0dG9ucyA9IFtdO1xuXHRcdH1cblx0XHRjb25zdCBidXR0b25zUm93RWxlbWVudCA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCcuZGlhbG9nLWJ1dHRvbnMtcm93JykpO1xuXHRcdHRoaXMuYnV0dG9uc0NvbnRhaW5lciA9IGJ1dHRvbnNSb3dFbGVtZW50LmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctYnV0dG9ucycpKTtcblxuXHRcdC8vIE1lc3NhZ2Vcblx0XHRjb25zdCBtZXNzYWdlUm93RWxlbWVudCA9IHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCgkKCcuZGlhbG9nLW1lc3NhZ2Utcm93JykpO1xuXHRcdHRoaXMuaWNvbkVsZW1lbnQgPSBtZXNzYWdlUm93RWxlbWVudC5hcHBlbmRDaGlsZCgkKCcjbW9uYWNvLWRpYWxvZy1pY29uLmRpYWxvZy1pY29uJykpO1xuXHRcdHRoaXMuaWNvbkVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5nZXRJY29uQXJpYUxhYmVsKCkpO1xuXHRcdHRoaXMubWVzc2FnZUNvbnRhaW5lciA9IG1lc3NhZ2VSb3dFbGVtZW50LmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctbWVzc2FnZS1jb250YWluZXInKSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmRldGFpbCB8fCB0aGlzLm9wdGlvbnMucmVuZGVyQm9keSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZUVsZW1lbnQgPSB0aGlzLm1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLmRpYWxvZy1tZXNzYWdlJykpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZVRleHRFbGVtZW50ID0gbWVzc2FnZUVsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnI21vbmFjby1kaWFsb2ctbWVzc2FnZS10ZXh0LmRpYWxvZy1tZXNzYWdlLXRleHQnKSk7XG5cdFx0XHRtZXNzYWdlVGV4dEVsZW1lbnQuaW5uZXJUZXh0ID0gdGhpcy5tZXNzYWdlO1xuXHRcdH1cblxuXHRcdHRoaXMubWVzc2FnZURldGFpbEVsZW1lbnQgPSB0aGlzLm1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnI21vbmFjby1kaWFsb2ctbWVzc2FnZS1kZXRhaWwuZGlhbG9nLW1lc3NhZ2UtZGV0YWlsJykpO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuZGV0YWlsIHx8ICF0aGlzLm9wdGlvbnMucmVuZGVyQm9keSkge1xuXHRcdFx0dGhpcy5tZXNzYWdlRGV0YWlsRWxlbWVudC5pbm5lclRleHQgPSB0aGlzLm9wdGlvbnMuZGV0YWlsID8gdGhpcy5vcHRpb25zLmRldGFpbCA6IG1lc3NhZ2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWVzc2FnZURldGFpbEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLnJlbmRlckJvZHkpIHtcblx0XHRcdGNvbnN0IGN1c3RvbUJvZHkgPSB0aGlzLm1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnI21vbmFjby1kaWFsb2ctbWVzc2FnZS1ib2R5LmRpYWxvZy1tZXNzYWdlLWJvZHknKSk7XG5cdFx0XHR0aGlzLm9wdGlvbnMucmVuZGVyQm9keShjdXN0b21Cb2R5KTtcblxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRmb3IgKGNvbnN0IGVsIG9mIHRoaXMubWVzc2FnZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCdhJykpIHtcblx0XHRcdFx0ZWwudGFiSW5kZXggPSAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElucHV0c1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuaW5wdXRzKSB7XG5cdFx0XHR0aGlzLmlucHV0cyA9IHRoaXMub3B0aW9ucy5pbnB1dHMubWFwKGlucHV0ID0+IHtcblx0XHRcdFx0Y29uc3QgaW5wdXRSb3dFbGVtZW50ID0gdGhpcy5tZXNzYWdlQ29udGFpbmVyLmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctbWVzc2FnZS1pbnB1dCcpKTtcblxuXHRcdFx0XHRjb25zdCBpbnB1dEJveCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnB1dEJveChpbnB1dFJvd0VsZW1lbnQsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdHBsYWNlaG9sZGVyOiBpbnB1dC5wbGFjZWhvbGRlcixcblx0XHRcdFx0XHR0eXBlOiBpbnB1dC50eXBlID8/ICd0ZXh0Jyxcblx0XHRcdFx0XHRpbnB1dEJveFN0eWxlczogb3B0aW9ucy5pbnB1dEJveFN0eWxlc1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0aWYgKGlucHV0LnZhbHVlKSB7XG5cdFx0XHRcdFx0aW5wdXRCb3gudmFsdWUgPSBpbnB1dC52YWx1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBpbnB1dEJveDtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmlucHV0cyA9IFtdO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrYm94XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5jaGVja2JveExhYmVsKSB7XG5cdFx0XHRjb25zdCBjaGVja2JveFJvd0VsZW1lbnQgPSB0aGlzLm1lc3NhZ2VDb250YWluZXIuYXBwZW5kQ2hpbGQoJCgnLmRpYWxvZy1jaGVja2JveC1yb3cnKSk7XG5cblx0XHRcdGNvbnN0IGNoZWNrYm94ID0gdGhpcy5jaGVja2JveCA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0XHRuZXcgQ2hlY2tib3godGhpcy5vcHRpb25zLmNoZWNrYm94TGFiZWwsICEhdGhpcy5vcHRpb25zLmNoZWNrYm94Q2hlY2tlZCwgb3B0aW9ucy5jaGVja2JveFN0eWxlcylcblx0XHRcdCk7XG5cblx0XHRcdGNoZWNrYm94Um93RWxlbWVudC5hcHBlbmRDaGlsZChjaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdFx0Y29uc3QgY2hlY2tib3hNZXNzYWdlRWxlbWVudCA9IGNoZWNrYm94Um93RWxlbWVudC5hcHBlbmRDaGlsZCgkKCcuZGlhbG9nLWNoZWNrYm94LW1lc3NhZ2UnKSk7XG5cdFx0XHRjaGVja2JveE1lc3NhZ2VFbGVtZW50LmlubmVyVGV4dCA9IHRoaXMub3B0aW9ucy5jaGVja2JveExhYmVsO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNoZWNrYm94TWVzc2FnZUVsZW1lbnQsIEV2ZW50VHlwZS5DTElDSywgKCkgPT4gY2hlY2tib3guY2hlY2tlZCA9ICFjaGVja2JveC5jaGVja2VkKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVG9vbGJhclxuXHRcdGNvbnN0IHRvb2xiYXJSb3dFbGVtZW50ID0gdGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKCQoJy5kaWFsb2ctdG9vbGJhci1yb3cnKSk7XG5cdFx0dGhpcy50b29sYmFyQ29udGFpbmVyID0gdG9vbGJhclJvd0VsZW1lbnQuYXBwZW5kQ2hpbGQoJCgnLmRpYWxvZy10b29sYmFyJykpO1xuXG5cdFx0dGhpcy5hcHBseVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRJY29uQXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0bGV0IHR5cGVMYWJlbCA9IGxvY2FsaXplKCdkaWFsb2dJbmZvTWVzc2FnZScsICdJbmZvJyk7XG5cdFx0c3dpdGNoICh0aGlzLm9wdGlvbnMudHlwZSkge1xuXHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHR0eXBlTGFiZWwgPSBsb2NhbGl6ZSgnZGlhbG9nRXJyb3JNZXNzYWdlJywgJ0Vycm9yJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnd2FybmluZyc6XG5cdFx0XHRcdHR5cGVMYWJlbCA9IGxvY2FsaXplKCdkaWFsb2dXYXJuaW5nTWVzc2FnZScsICdXYXJuaW5nJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAncGVuZGluZyc6XG5cdFx0XHRcdHR5cGVMYWJlbCA9IGxvY2FsaXplKCdkaWFsb2dQZW5kaW5nTWVzc2FnZScsICdJbiBQcm9ncmVzcycpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ25vbmUnOlxuXHRcdFx0Y2FzZSAnaW5mbyc6XG5cdFx0XHRjYXNlICdxdWVzdGlvbic6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRyZXR1cm4gdHlwZUxhYmVsO1xuXHR9XG5cblx0dXBkYXRlTWVzc2FnZShtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VEZXRhaWxFbGVtZW50LmlubmVyVGV4dCA9IG1lc3NhZ2U7XG5cdH1cblxuXHRhc3luYyBzaG93KCk6IFByb21pc2U8SURpYWxvZ1Jlc3VsdD4ge1xuXHRcdHRoaXMuZm9jdXNUb1JldHVybiA9IHRoaXMuY29udGFpbmVyLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudCBhcyBIVE1MRWxlbWVudDtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJRGlhbG9nUmVzdWx0PihyZXNvbHZlID0+IHtcblx0XHRcdGNsZWFyTm9kZSh0aGlzLmJ1dHRvbnNDb250YWluZXIpO1xuXG5cdFx0XHRjb25zdCBjbG9zZSA9ICgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0YnV0dG9uOiB0aGlzLm9wdGlvbnMuY2FuY2VsSWQgfHwgMCxcblx0XHRcdFx0XHRjaGVja2JveENoZWNrZWQ6IHRoaXMuY2hlY2tib3ggPyB0aGlzLmNoZWNrYm94LmNoZWNrZWQgOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH07XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoY2xvc2UpKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uQmFyID0gdGhpcy5idXR0b25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnV0dG9uQmFyKHRoaXMuYnV0dG9uc0NvbnRhaW5lciwgeyBhbGlnbm1lbnQ6IHRoaXMub3B0aW9ucz8uYWxpZ25tZW50ID09PSBEaWFsb2dDb250ZW50c0FsaWdubWVudC5WZXJ0aWNhbCA/IEJ1dHRvbkJhckFsaWdubWVudC5WZXJ0aWNhbCA6IEJ1dHRvbkJhckFsaWdubWVudC5Ib3Jpem9udGFsIH0pKTtcblx0XHRcdGNvbnN0IGJ1dHRvbk1hcCA9IHRoaXMucmVhcnJhbmdlQnV0dG9ucyh0aGlzLmJ1dHRvbnMsIHRoaXMub3B0aW9ucy5jYW5jZWxJZCk7XG5cblx0XHRcdGNvbnN0IG9uQnV0dG9uQ2xpY2sgPSAoaW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0XHRidXR0b246IGJ1dHRvbk1hcFtpbmRleF0uaW5kZXgsXG5cdFx0XHRcdFx0Y2hlY2tib3hDaGVja2VkOiB0aGlzLmNoZWNrYm94ID8gdGhpcy5jaGVja2JveC5jaGVja2VkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHZhbHVlczogdGhpcy5pbnB1dHMubGVuZ3RoID4gMCA/IHRoaXMuaW5wdXRzLm1hcChpbnB1dCA9PiBpbnB1dC52YWx1ZSkgOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBCdXR0b25zXG5cdFx0XHRidXR0b25NYXAuZm9yRWFjaCgoXywgaW5kZXgpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeSA9IGJ1dHRvbk1hcFtpbmRleF0uaW5kZXggPT09IDA7XG5cblx0XHRcdFx0bGV0IGJ1dHRvbjogSUJ1dHRvbjtcblx0XHRcdFx0Y29uc3QgYnV0dG9uT3B0aW9ucyA9IHRoaXMub3B0aW9ucy5idXR0b25PcHRpb25zPy5bYnV0dG9uTWFwW2luZGV4XT8uaW5kZXhdO1xuXHRcdFx0XHRpZiAocHJpbWFyeSAmJiB0aGlzLm9wdGlvbnM/LnByaW1hcnlCdXR0b25Ecm9wZG93bikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBpc0FjdGlvblByb3ZpZGVyKHRoaXMub3B0aW9ucy5wcmltYXJ5QnV0dG9uRHJvcGRvd24uYWN0aW9ucykgPyB0aGlzLm9wdGlvbnMucHJpbWFyeUJ1dHRvbkRyb3Bkb3duLmFjdGlvbnMuZ2V0QWN0aW9ucygpIDogdGhpcy5vcHRpb25zLnByaW1hcnlCdXR0b25Ecm9wZG93bi5hY3Rpb25zO1xuXHRcdFx0XHRcdGJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbkJhci5hZGRCdXR0b25XaXRoRHJvcGRvd24oe1xuXHRcdFx0XHRcdFx0Li4udGhpcy5vcHRpb25zLnByaW1hcnlCdXR0b25Ecm9wZG93bixcblx0XHRcdFx0XHRcdC4uLnRoaXMuYnV0dG9uU3R5bGVzLFxuXHRcdFx0XHRcdFx0ZHJvcGRvd25MYXllcjogMjYwMCwgLy8gZW5zdXJlIHRoZSBkcm9wZG93biBpcyBhYm92ZSB0aGUgZGlhbG9nXG5cdFx0XHRcdFx0XHRhY3Rpb25zOiBhY3Rpb25zLm1hcChhY3Rpb24gPT4gdG9BY3Rpb24oe1xuXHRcdFx0XHRcdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IGFjdGlvbi5ydW4oKTtcblxuXHRcdFx0XHRcdFx0XHRcdG9uQnV0dG9uQ2xpY2soaW5kZXgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KSlcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoYnV0dG9uT3B0aW9ucz8uc3VibGFiZWwpIHtcblx0XHRcdFx0XHRidXR0b24gPSB0aGlzLl9yZWdpc3RlcihidXR0b25CYXIuYWRkQnV0dG9uV2l0aERlc2NyaXB0aW9uKHsgc2Vjb25kYXJ5OiAhcHJpbWFyeSwgLi4udGhpcy5idXR0b25TdHlsZXMgfSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJ1dHRvbiA9IHRoaXMuX3JlZ2lzdGVyKGJ1dHRvbkJhci5hZGRCdXR0b24oeyBzZWNvbmRhcnk6ICFwcmltYXJ5LCAuLi50aGlzLmJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoYnV0dG9uT3B0aW9ucz8uc3R5bGVCdXR0b24pIHtcblx0XHRcdFx0XHRidXR0b25PcHRpb25zLnN0eWxlQnV0dG9uKGJ1dHRvbik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRidXR0b24ubGFiZWwgPSBtbmVtb25pY0J1dHRvbkxhYmVsKGJ1dHRvbk1hcFtpbmRleF0ubGFiZWwsIHRydWUpO1xuXHRcdFx0XHRpZiAoYnV0dG9uIGluc3RhbmNlb2YgQnV0dG9uV2l0aERlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKGJ1dHRvbk9wdGlvbnM/LnN1YmxhYmVsKSB7XG5cdFx0XHRcdFx0XHRidXR0b24uZGVzY3JpcHRpb24gPSBidXR0b25PcHRpb25zPy5zdWJsYWJlbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoYnV0dG9uLm9uRGlkQ2xpY2soZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUpIHtcblx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0b25CdXR0b25DbGljayhpbmRleCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBIYW5kbGUga2V5Ym9hcmQgZXZlbnRzIGdsb2JhbGx5OiBUYWIsIEFycm93LUxlZnQvUmlnaHRcblx0XHRcdGNvbnN0IHdpbmRvdyA9IGdldFdpbmRvdyh0aGlzLmNvbnRhaW5lcik7XG5cdFx0XHRsZXQgc2F3RXNjYXBlS2V5RG93biA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdpbmRvdywgJ2tleWRvd24nLCBlID0+IHtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0XHRpZiAoZXZ0LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0XHRzYXdFc2NhcGVLZXlEb3duID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChldnQuZXF1YWxzKEtleU1vZC5BbHQpKSB7XG5cdFx0XHRcdFx0ZXZ0LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXZ0LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXG5cdFx0XHRcdFx0Ly8gRW50ZXIgaW4gaW5wdXQgZmllbGQgc2hvdWxkIE9LIHRoZSBkaWFsb2dcblx0XHRcdFx0XHRpZiAodGhpcy5pbnB1dHMuc29tZShpbnB1dCA9PiBpbnB1dC5oYXNGb2N1cygpKSkge1xuXHRcdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbjogYnV0dG9uTWFwLmZpbmQoYnV0dG9uID0+IGJ1dHRvbi5pbmRleCAhPT0gdGhpcy5vcHRpb25zLmNhbmNlbElkKT8uaW5kZXggPz8gMCxcblx0XHRcdFx0XHRcdFx0Y2hlY2tib3hDaGVja2VkOiB0aGlzLmNoZWNrYm94ID8gdGhpcy5jaGVja2JveC5jaGVja2VkIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZXM6IHRoaXMuaW5wdXRzLmxlbmd0aCA+IDAgPyB0aGlzLmlucHV0cy5tYXAoaW5wdXQgPT4gaW5wdXQudmFsdWUpIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm47IC8vIGxlYXZlIGRlZmF1bHQgaGFuZGxpbmdcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENtZCtEICh0cmlnZ2VyIHRoZSBcIm5vXCIvXCJkbyBub3Qgc2F2ZVwiLWJ1dHRvbikgKG1hY09TIG9ubHkpXG5cdFx0XHRcdGlmIChpc01hY2ludG9zaCAmJiBldnQuZXF1YWxzKEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlEKSkge1xuXHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdFx0XHRjb25zdCBub0J1dHRvbiA9IGJ1dHRvbk1hcC5maW5kKGJ1dHRvbiA9PiBidXR0b24uaW5kZXggPT09IDEgJiYgYnV0dG9uLmluZGV4ICE9PSB0aGlzLm9wdGlvbnMuY2FuY2VsSWQpO1xuXHRcdFx0XHRcdGlmIChub0J1dHRvbikge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbjogbm9CdXR0b24uaW5kZXgsXG5cdFx0XHRcdFx0XHRcdGNoZWNrYm94Q2hlY2tlZDogdGhpcy5jaGVja2JveCA/IHRoaXMuY2hlY2tib3guY2hlY2tlZCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0dmFsdWVzOiB0aGlzLmlucHV0cy5sZW5ndGggPiAwID8gdGhpcy5pbnB1dHMubWFwKGlucHV0ID0+IGlucHV0LnZhbHVlKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBsZWF2ZSBkZWZhdWx0IGhhbmRsaW5nXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXZ0LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gbGVhdmUgZGVmYXVsdCBoYW5kbGluZ1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bGV0IGV2ZW50SGFuZGxlZCA9IGZhbHNlO1xuXG5cdFx0XHRcdC8vIEZvY3VzOiBOZXh0IC8gUHJldmlvdXNcblx0XHRcdFx0aWYgKGV2dC5lcXVhbHMoS2V5Q29kZS5UYWIpIHx8IGV2dC5lcXVhbHMoS2V5Q29kZS5SaWdodEFycm93KSB8fCBldnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSB8fCBldnQuZXF1YWxzKEtleUNvZGUuTGVmdEFycm93KSkge1xuXG5cdFx0XHRcdFx0Ly8gQnVpbGQgYSBsaXN0IG9mIGZvY3VzYWJsZSBlbGVtZW50cyBpbiB0aGVpciB2aXN1YWwgb3JkZXJcblx0XHRcdFx0XHRjb25zdCBmb2N1c2FibGVFbGVtZW50czogeyBmb2N1czogKCkgPT4gdm9pZCB9W10gPSBbXTtcblx0XHRcdFx0XHRsZXQgZm9jdXNlZEluZGV4ID0gLTE7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5tZXNzYWdlQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRcdGNvbnN0IGxpbmtzID0gdGhpcy5tZXNzYWdlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGxpbmspO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNBY3RpdmVFbGVtZW50KGxpbmspKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGZvciAoY29uc3QgaW5wdXQgb2YgdGhpcy5pbnB1dHMpIHtcblx0XHRcdFx0XHRcdGZvY3VzYWJsZUVsZW1lbnRzLnB1c2goaW5wdXQpO1xuXHRcdFx0XHRcdFx0aWYgKGlucHV0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodGhpcy5jaGVja2JveCkge1xuXHRcdFx0XHRcdFx0Zm9jdXNhYmxlRWxlbWVudHMucHVzaCh0aGlzLmNoZWNrYm94KTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmNoZWNrYm94Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAodGhpcy5idXR0b25CYXIpIHtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgYnV0dG9uIG9mIHRoaXMuYnV0dG9uQmFyLmJ1dHRvbnMpIHtcblx0XHRcdFx0XHRcdFx0aWYgKGJ1dHRvbiBpbnN0YW5jZW9mIEJ1dHRvbldpdGhEcm9wZG93bikge1xuXHRcdFx0XHRcdFx0XHRcdGZvY3VzYWJsZUVsZW1lbnRzLnB1c2goYnV0dG9uLnByaW1hcnlCdXR0b24pO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChidXR0b24ucHJpbWFyeUJ1dHRvbi5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb2N1c2VkSW5kZXggPSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGJ1dHRvbi5kcm9wZG93bkJ1dHRvbik7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGJ1dHRvbi5kcm9wZG93bkJ1dHRvbi5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb2N1c2VkSW5kZXggPSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGJ1dHRvbik7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKGJ1dHRvbi5oYXNGb2N1cygpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb2N1c2VkSW5kZXggPSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICh0aGlzLmZvb3RlckNvbnRhaW5lcikge1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdFx0XHRjb25zdCBsaW5rcyA9IHRoaXMuZm9vdGVyQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKTtcblx0XHRcdFx0XHRcdGZvciAoY29uc3QgbGluayBvZiBsaW5rcykge1xuXHRcdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50cy5wdXNoKGxpbmspO1xuXHRcdFx0XHRcdFx0XHRpZiAoaXNBY3RpdmVFbGVtZW50KGxpbmspKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEZvY3VzIG5leHQgZWxlbWVudCAod2l0aCB3cmFwcGluZylcblx0XHRcdFx0XHRpZiAoZXZ0LmVxdWFscyhLZXlDb2RlLlRhYikgfHwgZXZ0LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBuZXdGb2N1c2VkSW5kZXggPSAoZm9jdXNlZEluZGV4ICsgMSkgJSBmb2N1c2FibGVFbGVtZW50cy5sZW5ndGg7XG5cdFx0XHRcdFx0XHRmb2N1c2FibGVFbGVtZW50c1tuZXdGb2N1c2VkSW5kZXhdLmZvY3VzKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRm9jdXMgcHJldmlvdXMgZWxlbWVudCAod2l0aCB3cmFwcGluZylcblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdGlmIChmb2N1c2VkSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRcdGZvY3VzZWRJbmRleCA9IGZvY3VzYWJsZUVsZW1lbnRzLmxlbmd0aDsgLy8gZGVmYXVsdCB0byBmb2N1cyBsYXN0IGVsZW1lbnQgaWYgbm9uZSBoYXZlIGZvY3VzXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGxldCBuZXdGb2N1c2VkSW5kZXggPSBmb2N1c2VkSW5kZXggLSAxO1xuXHRcdFx0XHRcdFx0aWYgKG5ld0ZvY3VzZWRJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0bmV3Rm9jdXNlZEluZGV4ID0gZm9jdXNhYmxlRWxlbWVudHMubGVuZ3RoIC0gMTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Zm9jdXNhYmxlRWxlbWVudHNbbmV3Rm9jdXNlZEluZGV4XS5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGV2ZW50SGFuZGxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXZlbnRIYW5kbGVkKSB7XG5cdFx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLm9wdGlvbnMua2V5RXZlbnRQcm9jZXNzb3IpIHtcblx0XHRcdFx0XHR0aGlzLm9wdGlvbnMua2V5RXZlbnRQcm9jZXNzb3IoZXZ0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgdHJ1ZSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIod2luZG93LCAna2V5dXAnLCBlID0+IHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0Y29uc3QgZXZ0ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblxuXHRcdFx0XHRpZiAoIXRoaXMub3B0aW9ucy5kaXNhYmxlQ2xvc2VBY3Rpb24gJiYgZXZ0LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkgJiYgc2F3RXNjYXBlS2V5RG93bikge1xuXHRcdFx0XHRcdGNsb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRydWUpKTtcblxuXHRcdFx0Ly8gRGV0ZWN0IGZvY3VzIG91dFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgJ2ZvY3Vzb3V0JywgZSA9PiB7XG5cdFx0XHRcdGlmICghIWUucmVsYXRlZFRhcmdldCAmJiAhIXRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRcdGlmICghaXNBbmNlc3RvcihlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQsIHRoaXMuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdC8vIFRlbXBvcmFyeTogbGV0IGZvY3VzIGVzY2FwZSBmb3IgYm9keS1sZXZlbCBwb3B1cHMuXG5cdFx0XHRcdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyMzkyMFxuXHRcdFx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5pc0V4dGVybmFsRm9jdXNBbGxvd2VkPy4oZS5yZWxhdGVkVGFyZ2V0IGFzIEhUTUxFbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLmZvY3VzVG9SZXR1cm4gPSBlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cblx0XHRcdFx0XHRcdGlmIChlLnRhcmdldCkge1xuXHRcdFx0XHRcdFx0XHQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmZvY3VzKCk7XG5cdFx0XHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LCBmYWxzZSkpO1xuXG5cdFx0XHRjb25zdCBzcGluTW9kaWZpZXJDbGFzc05hbWUgPSAnY29kaWNvbi1tb2RpZmllci1zcGluJztcblxuXHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlhbG9nRXJyb3IpLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmRpYWxvZ1dhcm5pbmcpLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmRpYWxvZ0luZm8pLCAuLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmxvYWRpbmcpLCBzcGluTW9kaWZpZXJDbGFzc05hbWUpO1xuXG5cdFx0XHRpZiAodGhpcy5vcHRpb25zLmljb24pIHtcblx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KHRoaXMub3B0aW9ucy5pY29uKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzd2l0Y2ggKHRoaXMub3B0aW9ucy50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlhbG9nRXJyb3IpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3dhcm5pbmcnOlxuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24uZGlhbG9nV2FybmluZykpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncGVuZGluZyc6XG5cdFx0XHRcdFx0XHR0aGlzLmljb25FbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5sb2FkaW5nKSwgc3Bpbk1vZGlmaWVyQ2xhc3NOYW1lKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ25vbmUnOlxuXHRcdFx0XHRcdFx0dGhpcy5pY29uRWxlbWVudC5jbGFzc0xpc3QuYWRkKCduby1jb2RpY29uJyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdpbmZvJzpcblx0XHRcdFx0XHRjYXNlICdxdWVzdGlvbic6XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHRoaXMuaWNvbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmRpYWxvZ0luZm8pKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5vcHRpb25zLmRpc2FibGVDbG9zZUFjdGlvbiAmJiAhdGhpcy5vcHRpb25zLmRpc2FibGVDbG9zZUJ1dHRvbikge1xuXHRcdFx0XHRjb25zdCBhY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMudG9vbGJhckNvbnRhaW5lciwge30pKTtcblxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdkaWFsb2cuY2xvc2UnLCBsb2NhbGl6ZSgnZGlhbG9nQ2xvc2UnLCBcIkNsb3NlIERpYWxvZ1wiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZGlhbG9nQ2xvc2UpLCB0cnVlLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0XHRidXR0b246IHRoaXMub3B0aW9ucy5jYW5jZWxJZCB8fCAwLFxuXHRcdFx0XHRcdFx0Y2hlY2tib3hDaGVja2VkOiB0aGlzLmNoZWNrYm94ID8gdGhpcy5jaGVja2JveC5jaGVja2VkIDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRhY3Rpb25CYXIucHVzaChhY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cblx0XHRcdHRoaXMuZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbW9kYWwnLCAndHJ1ZScpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbGxlZGJ5JywgJ21vbmFjby1kaWFsb2ctaWNvbiBtb25hY28tZGlhbG9nLW1lc3NhZ2UtdGV4dCcpO1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmliZWRieScsICdtb25hY28tZGlhbG9nLWljb24gbW9uYWNvLWRpYWxvZy1tZXNzYWdlLXRleHQgbW9uYWNvLWRpYWxvZy1tZXNzYWdlLWRldGFpbCBtb25hY28tZGlhbG9nLW1lc3NhZ2UtYm9keSBtb25hY28tZGlhbG9nLWZvb3RlcicpO1xuXHRcdFx0c2hvdyh0aGlzLmVsZW1lbnQpO1xuXG5cdFx0XHQvLyBOb3RpZnkgdmlzaWJpbGl0eSBjaGFuZ2Vcblx0XHRcdHRoaXMub3B0aW9ucy5vblZpc2liaWxpdHlDaGFuZ2U/Lih3aW5kb3csIHRydWUpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMub3B0aW9ucy5vblZpc2liaWxpdHlDaGFuZ2U/Lih3aW5kb3csIGZhbHNlKSkpO1xuXG5cdFx0XHQvLyBGb2N1cyBmaXJzdCBlbGVtZW50IChpbnB1dCBvciBidXR0b24pXG5cdFx0XHRpZiAodGhpcy5pbnB1dHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmlucHV0c1swXS5mb2N1cygpO1xuXHRcdFx0XHR0aGlzLmlucHV0c1swXS5zZWxlY3QoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ1dHRvbk1hcC5mb3JFYWNoKCh2YWx1ZSwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRpZiAodmFsdWUuaW5kZXggPT09IDApIHtcblx0XHRcdFx0XHRcdGJ1dHRvbkJhci5idXR0b25zW2luZGV4XS5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5U3R5bGVzKCkge1xuXHRcdGNvbnN0IHN0eWxlID0gdGhpcy5vcHRpb25zLmRpYWxvZ1N0eWxlcztcblxuXHRcdGNvbnN0IGZnQ29sb3IgPSBzdHlsZS5kaWFsb2dGb3JlZ3JvdW5kO1xuXHRcdGNvbnN0IGJnQ29sb3IgPSBzdHlsZS5kaWFsb2dCYWNrZ3JvdW5kO1xuXHRcdGNvbnN0IHNoYWRvd0NvbG9yID0gc3R5bGUuZGlhbG9nU2hhZG93ID8gYDAgMHB4IDhweCAke3N0eWxlLmRpYWxvZ1NoYWRvd31gIDogJyc7XG5cdFx0Y29uc3QgYm9yZGVyID0gc3R5bGUuZGlhbG9nQm9yZGVyID8gYDFweCBzb2xpZCAke3N0eWxlLmRpYWxvZ0JvcmRlcn1gIDogJyc7XG5cdFx0Y29uc3QgbGlua0ZnQ29sb3IgPSBzdHlsZS50ZXh0TGlua0ZvcmVncm91bmQ7XG5cblx0XHR0aGlzLnNoYWRvd0VsZW1lbnQuc3R5bGUuYm94U2hhZG93ID0gc2hhZG93Q29sb3I7XG5cblx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuY29sb3IgPSBmZ0NvbG9yID8/ICcnO1xuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiZ0NvbG9yID8/ICcnO1xuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXIgPSBib3JkZXI7XG5cblx0XHRpZiAobGlua0ZnQ29sb3IpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Zm9yIChjb25zdCBlbCBvZiBbLi4udGhpcy5tZXNzYWdlQ29udGFpbmVyLmdldEVsZW1lbnRzQnlUYWdOYW1lKCdhJyksIC4uLnRoaXMuZm9vdGVyQ29udGFpbmVyPy5nZXRFbGVtZW50c0J5VGFnTmFtZSgnYScpID8/IFtdXSkge1xuXHRcdFx0XHRlbC5zdHlsZS5jb2xvciA9IGxpbmtGZ0NvbG9yO1xuXHRcdFx0XHQvLyBFbnN1cmUgbGlua3MgYXJlIGRpc3Rpbmd1aXNoYWJsZSBieSBtb3JlIHRoYW4ganVzdCBjb2xvciAoV0NBRyAxLjQuMSlcblx0XHRcdFx0ZWwuc3R5bGUudGV4dERlY29yYXRpb24gPSAndW5kZXJsaW5lJztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgY29sb3I7XG5cdFx0c3dpdGNoICh0aGlzLm9wdGlvbnMudHlwZSkge1xuXHRcdFx0Y2FzZSAnbm9uZSc6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnZXJyb3InOlxuXHRcdFx0XHRjb2xvciA9IHN0eWxlLmVycm9ySWNvbkZvcmVncm91bmQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnd2FybmluZyc6XG5cdFx0XHRcdGNvbG9yID0gc3R5bGUud2FybmluZ0ljb25Gb3JlZ3JvdW5kO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGNvbG9yID0gc3R5bGUuaW5mb0ljb25Gb3JlZ3JvdW5kO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdFx0aWYgKGNvbG9yKSB7XG5cdFx0XHR0aGlzLmljb25FbGVtZW50LnN0eWxlLmNvbG9yID0gY29sb3I7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHRpZiAodGhpcy5tb2RhbEVsZW1lbnQpIHtcblx0XHRcdHRoaXMubW9kYWxFbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5tb2RhbEVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZm9jdXNUb1JldHVybiAmJiBpc0FuY2VzdG9yKHRoaXMuZm9jdXNUb1JldHVybiwgdGhpcy5jb250YWluZXIub3duZXJEb2N1bWVudC5ib2R5KSkge1xuXHRcdFx0dGhpcy5mb2N1c1RvUmV0dXJuLmZvY3VzKCk7XG5cdFx0XHR0aGlzLmZvY3VzVG9SZXR1cm4gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFycmFuZ2VCdXR0b25zKGJ1dHRvbnM6IEFycmF5PHN0cmluZz4sIGNhbmNlbElkOiBudW1iZXIgfCB1bmRlZmluZWQpOiBCdXR0b25NYXBFbnRyeVtdIHtcblxuXHRcdC8vIE1hcHMgZWFjaCBidXR0b24gdG8gaXRzIGN1cnJlbnQgbGFiZWwgYW5kIG9sZCBpbmRleFxuXHRcdC8vIHNvIHRoYXQgd2hlbiB3ZSBtb3ZlIHRoZW0gYXJvdW5kIGl0J3Mgbm90IGEgcHJvYmxlbVxuXHRcdGNvbnN0IGJ1dHRvbk1hcDogQnV0dG9uTWFwRW50cnlbXSA9IGJ1dHRvbnMubWFwKChsYWJlbCwgaW5kZXgpID0+ICh7IGxhYmVsLCBpbmRleCB9KSk7XG5cblx0XHRpZiAoYnV0dG9ucy5sZW5ndGggPCAyIHx8IHRoaXMub3B0aW9ucy5hbGlnbm1lbnQgPT09IERpYWxvZ0NvbnRlbnRzQWxpZ25tZW50LlZlcnRpY2FsKSB7XG5cdFx0XHRyZXR1cm4gYnV0dG9uTWFwOyAvLyBvbmx5IG5lZWQgdG8gcmVhcnJhbmdlIGlmIHRoZXJlIGFyZSAyKyBidXR0b25zIGFuZCB0aGUgYWxpZ25tZW50IGlzIGxlZnQtdG8tcmlnaHRcblx0XHR9XG5cblx0XHRpZiAoaXNNYWNpbnRvc2ggfHwgaXNMaW51eCkge1xuXG5cdFx0XHQvLyBMaW51eDogdGhlIEdOT01FIEhJRyAoaHR0cHM6Ly9kZXZlbG9wZXIuZ25vbWUub3JnL2hpZy9wYXR0ZXJucy9mZWVkYmFjay9kaWFsb2dzLmh0bWw/aGlnaGxpZ2h0PWRpYWxvZylcblx0XHRcdC8vIHJlY29tbWVuZCB0aGUgZm9sbG93aW5nOlxuXHRcdFx0Ly8gXCJBbHdheXMgZW5zdXJlIHRoYXQgdGhlIGNhbmNlbCBidXR0b24gYXBwZWFycyBmaXJzdCwgYmVmb3JlIHRoZSBhZmZpcm1hdGl2ZSBidXR0b24uIEluIGxlZnQtdG8tcmlnaHRcblx0XHRcdC8vICBsb2NhbGVzLCB0aGlzIGlzIG9uIHRoZSBsZWZ0LiBUaGlzIGJ1dHRvbiBvcmRlciBlbnN1cmVzIHRoYXQgdXNlcnMgYmVjb21lIGF3YXJlIG9mLCBhbmQgYXJlIHJlbWluZGVkXG5cdFx0XHQvLyAgb2YsIHRoZSBhYmlsaXR5IHRvIGNhbmNlbCBwcmlvciB0byBlbmNvdW50ZXJpbmcgdGhlIGFmZmlybWF0aXZlIGJ1dHRvbi5cIlxuXG5cdFx0XHQvLyBtYWNPUzogdGhlIEhJRyAoaHR0cHM6Ly9kZXZlbG9wZXIuYXBwbGUuY29tL2Rlc2lnbi9odW1hbi1pbnRlcmZhY2UtZ3VpZGVsaW5lcy9jb21wb25lbnRzL3ByZXNlbnRhdGlvbi9hbGVydHMpXG5cdFx0XHQvLyByZWNvbW1lbmQgdGhlIGZvbGxvd2luZzpcblx0XHRcdC8vIFwiUGxhY2UgYnV0dG9ucyB3aGVyZSBwZW9wbGUgZXhwZWN0LiBJbiBnZW5lcmFsLCBwbGFjZSB0aGUgYnV0dG9uIHBlb3BsZSBhcmUgbW9zdCBsaWtlbHkgdG8gY2hvb3NlIG9uIHRoZSB0cmFpbGluZyBzaWRlIGluIGFcblx0XHRcdC8vICByb3cgb2YgYnV0dG9ucyBvciBhdCB0aGUgdG9wIGluIGEgc3RhY2sgb2YgYnV0dG9ucy4gQWx3YXlzIHBsYWNlIHRoZSBkZWZhdWx0IGJ1dHRvbiBvbiB0aGUgdHJhaWxpbmcgc2lkZSBvZiBhIHJvdyBvciBhdCB0aGVcblx0XHRcdC8vICB0b3Agb2YgYSBzdGFjay4gQ2FuY2VsIGJ1dHRvbnMgYXJlIHR5cGljYWxseSBvbiB0aGUgbGVhZGluZyBzaWRlIG9mIGEgcm93IG9yIGF0IHRoZSBib3R0b20gb2YgYSBzdGFjay5cIlxuXG5cdFx0XHRpZiAodHlwZW9mIGNhbmNlbElkID09PSAnbnVtYmVyJyAmJiBidXR0b25NYXBbY2FuY2VsSWRdKSB7XG5cdFx0XHRcdGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbk1hcC5zcGxpY2UoY2FuY2VsSWQsIDEpWzBdO1xuXHRcdFx0XHRidXR0b25NYXAuc3BsaWNlKDEsIDAsIGNhbmNlbEJ1dHRvbik7XG5cdFx0XHR9XG5cblx0XHRcdGJ1dHRvbk1hcC5yZXZlcnNlKCk7XG5cdFx0fSBlbHNlIGlmIChpc1dpbmRvd3MpIHtcblxuXHRcdFx0Ly8gV2luZG93czogdGhlIEhJRyAoaHR0cHM6Ly9sZWFybi5taWNyb3NvZnQuY29tL2VuLXVzL3dpbmRvd3Mvd2luMzIvdXhndWlkZS93aW4tZGlhbG9nLWJveClcblx0XHRcdC8vIHJlY29tbWVuZCB0aGUgZm9sbG93aW5nOlxuXHRcdFx0Ly8gXCJPbmUgb2YgdGhlIGZvbGxvd2luZyBzZXRzIG9mIGNvbmNpc2UgY29tbWFuZHM6IFllcy9ObywgWWVzL05vL0NhbmNlbCwgW0RvIGl0XS9DYW5jZWwsXG5cdFx0XHQvLyAgW0RvIGl0XS9bRG9uJ3QgZG8gaXRdLCBbRG8gaXRdL1tEb24ndCBkbyBpdF0vQ2FuY2VsLlwiXG5cblx0XHRcdGlmICh0eXBlb2YgY2FuY2VsSWQgPT09ICdudW1iZXInICYmIGJ1dHRvbk1hcFtjYW5jZWxJZF0pIHtcblx0XHRcdFx0Y29uc3QgY2FuY2VsQnV0dG9uID0gYnV0dG9uTWFwLnNwbGljZShjYW5jZWxJZCwgMSlbMF07XG5cdFx0XHRcdGJ1dHRvbk1hcC5wdXNoKGNhbmNlbEJ1dHRvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGJ1dHRvbk1hcDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjog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
