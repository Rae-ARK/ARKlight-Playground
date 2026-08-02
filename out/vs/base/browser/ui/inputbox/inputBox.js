import * as dom from "../../dom.js";
import * as cssJs from "../../cssValue.js";
import { DomEmitter } from "../../event.js";
import { renderFormattedText, renderText } from "../../formattedTextRenderer.js";
import { ActionBar } from "../actionbar/actionbar.js";
import * as aria from "../aria/aria.js";
import { AnchorAlignment } from "../contextview/contextview.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { ScrollableElement } from "../scrollbar/scrollableElement.js";
import { Widget } from "../widget.js";
import { Emitter, Event } from "../../../common/event.js";
import { HistoryNavigator } from "../../../common/history.js";
import { equals } from "../../../common/objects.js";
import { ScrollbarVisibility } from "../../../common/scrollable.js";
import "./inputBox.css";
import * as nls from "../../../../nls.js";
import { MutableDisposable } from "../../../common/lifecycle.js";
const $ = dom.$;
var MessageType = /* @__PURE__ */ ((MessageType2) => {
  MessageType2[MessageType2["INFO"] = 1] = "INFO";
  MessageType2[MessageType2["WARNING"] = 2] = "WARNING";
  MessageType2[MessageType2["ERROR"] = 3] = "ERROR";
  return MessageType2;
})(MessageType || {});
const unthemedInboxStyles = {
  inputBackground: "#3C3C3C",
  inputForeground: "#CCCCCC",
  inputValidationInfoBorder: "#55AAFF",
  inputValidationInfoBackground: "#063B49",
  inputValidationWarningBorder: "#B89500",
  inputValidationWarningBackground: "#352A05",
  inputValidationErrorBorder: "#BE1100",
  inputValidationErrorBackground: "#5A1D1D",
  inputBorder: void 0,
  inputValidationErrorForeground: void 0,
  inputValidationInfoForeground: void 0,
  inputValidationWarningForeground: void 0
};
class InputBox extends Widget {
  constructor(container, contextViewProvider, options) {
    super();
    this.state = "idle";
    this.maxHeight = Number.POSITIVE_INFINITY;
    this.hover = this._register(new MutableDisposable());
    this.messageResizeObserver = this._register(new MutableDisposable());
    this._onDidChange = this._register(new Emitter());
    this._onDidHeightChange = this._register(new Emitter());
    this.contextViewProvider = contextViewProvider;
    this.options = options;
    this.message = null;
    this.placeholder = this.options.placeholder || "";
    this.tooltip = this.options.tooltip ?? (this.placeholder || "");
    this.ariaLabel = this.options.ariaLabel || "";
    if (this.options.validationOptions) {
      this.validation = this.options.validationOptions.validation;
    }
    this.element = dom.append(container, $(".monaco-inputbox.idle"));
    const tagName = this.options.flexibleHeight ? "textarea" : "input";
    const wrapper = dom.append(this.element, $(".ibwrapper"));
    this.input = dom.append(wrapper, $(tagName + ".input.empty"));
    this.input.setAttribute("autocorrect", "off");
    this.input.setAttribute("autocapitalize", "off");
    this.input.setAttribute("spellcheck", "false");
    this.onfocus(this.input, () => this.element.classList.add("synthetic-focus"));
    this.onblur(this.input, () => this.element.classList.remove("synthetic-focus"));
    if (this.options.flexibleHeight) {
      this.maxHeight = typeof this.options.flexibleMaxHeight === "number" ? this.options.flexibleMaxHeight : Number.POSITIVE_INFINITY;
      this.mirror = dom.append(wrapper, $("div.mirror"));
      this.mirror.innerText = "\xA0";
      this.scrollableElement = new ScrollableElement(this.element, { vertical: ScrollbarVisibility.Auto });
      if (this.options.flexibleWidth) {
        this.input.setAttribute("wrap", "off");
        this.mirror.style.whiteSpace = "pre";
        this.mirror.style.wordWrap = "initial";
      }
      dom.append(container, this.scrollableElement.getDomNode());
      this._register(this.scrollableElement);
      this._register(this.scrollableElement.onScroll((e) => this.input.scrollTop = e.scrollTop));
      const onSelectionChange = this._register(new DomEmitter(container.ownerDocument, "selectionchange"));
      const onAnchoredSelectionChange = Event.filter(onSelectionChange.event, () => {
        const selection = container.ownerDocument.getSelection();
        return selection?.anchorNode === wrapper;
      });
      this._register(onAnchoredSelectionChange(this.updateScrollDimensions, this));
      this._register(this.onDidHeightChange(this.updateScrollDimensions, this));
    } else {
      this.input.type = this.options.type || "text";
      this.input.setAttribute("wrap", "off");
    }
    if (this.ariaLabel) {
      this.input.setAttribute("aria-label", this.ariaLabel);
    }
    if (this.placeholder && !this.options.showPlaceholderOnFocus) {
      this.setPlaceHolder(this.placeholder);
    }
    if (this.tooltip) {
      this.setTooltip(this.tooltip);
    }
    this.oninput(this.input, () => this.onValueChange());
    this.onblur(this.input, () => this.onBlur());
    this.onfocus(this.input, () => this.onFocus());
    this._register(this.ignoreGesture(this.input));
    setTimeout(() => this.updateMirror(), 0);
    if (this.options.actions) {
      this.actionbar = this._register(new ActionBar(this.element, {
        actionViewItemProvider: this.options.actionViewItemProvider
      }));
      this.actionbar.push(this.options.actions, { icon: true, label: false });
    }
    this.applyStyles();
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get onDidHeightChange() {
    return this._onDidHeightChange.event;
  }
  setActions(actions, actionViewItemProvider) {
    if (this.actionbar) {
      this.actionbar.clear();
      if (actions) {
        this.actionbar.push(actions, { icon: true, label: false });
      }
    } else if (actions) {
      this.actionbar = this._register(new ActionBar(this.element, {
        actionViewItemProvider: actionViewItemProvider ?? this.options.actionViewItemProvider
      }));
      this.actionbar.push(actions, { icon: true, label: false });
    }
  }
  get actionsWidth() {
    return this.actionbar?.getContainer().offsetWidth ?? 0;
  }
  onBlur() {
    this._hideMessage();
    if (this.options.showPlaceholderOnFocus) {
      this.input.setAttribute("placeholder", "");
    }
  }
  onFocus() {
    this._showMessage();
    if (this.options.showPlaceholderOnFocus) {
      this.input.setAttribute("placeholder", this.placeholder || "");
    }
  }
  setPlaceHolder(placeHolder) {
    this.placeholder = placeHolder;
    this.input.setAttribute("placeholder", placeHolder);
  }
  setTooltip(tooltip) {
    this.tooltip = tooltip;
    if (!this.hover.value) {
      this.hover.value = this._register(getBaseLayerHoverDelegate().setupDelayedHoverAtMouse(this.input, () => ({
        content: this.tooltip,
        appearance: {
          compact: true
        }
      })));
    }
  }
  setAriaLabel(label) {
    this.ariaLabel = label;
    if (label) {
      this.input.setAttribute("aria-label", this.ariaLabel);
    } else {
      this.input.removeAttribute("aria-label");
    }
  }
  getAriaLabel() {
    return this.ariaLabel;
  }
  get mirrorElement() {
    return this.mirror;
  }
  get inputElement() {
    return this.input;
  }
  get value() {
    return this.input.value;
  }
  set value(newValue) {
    if (this.input.value !== newValue) {
      this.input.value = newValue;
      this.onValueChange();
    }
  }
  get step() {
    return this.input.step;
  }
  set step(newValue) {
    this.input.step = newValue;
  }
  get height() {
    return typeof this.cachedHeight === "number" ? this.cachedHeight : dom.getTotalHeight(this.element);
  }
  focus() {
    this.input.focus();
  }
  blur() {
    this.input.blur();
  }
  hasFocus() {
    return dom.isActiveElement(this.input);
  }
  select(range = null) {
    this.input.select();
    if (range) {
      this.input.setSelectionRange(range.start, range.end);
      if (range.end === this.input.value.length) {
        this.input.scrollLeft = this.input.scrollWidth;
      }
    }
  }
  isSelectionAtEnd() {
    return this.input.selectionEnd === this.input.value.length && this.input.selectionStart === this.input.selectionEnd;
  }
  getSelection() {
    const selectionStart = this.input.selectionStart;
    if (selectionStart === null) {
      return null;
    }
    const selectionEnd = this.input.selectionEnd ?? selectionStart;
    return {
      start: selectionStart,
      end: selectionEnd
    };
  }
  enable() {
    this.input.removeAttribute("disabled");
  }
  disable() {
    this.blur();
    this.input.disabled = true;
    this._hideMessage();
  }
  setEnabled(enabled) {
    if (enabled) {
      this.enable();
    } else {
      this.disable();
    }
  }
  get width() {
    return dom.getTotalWidth(this.input);
  }
  set width(width) {
    if (this.options.flexibleHeight && this.options.flexibleWidth) {
      let horizontalPadding = 0;
      if (this.mirror) {
        const paddingLeft = parseFloat(this.mirror.style.paddingLeft || "") || 0;
        const paddingRight = parseFloat(this.mirror.style.paddingRight || "") || 0;
        horizontalPadding = paddingLeft + paddingRight;
      }
      this.input.style.width = width - horizontalPadding + "px";
    } else {
      this.input.style.width = width + "px";
    }
    if (this.mirror) {
      this.mirror.style.width = width + "px";
    }
  }
  set paddingRight(paddingRight) {
    this.input.style.width = `calc(100% - ${paddingRight}px)`;
    if (this.mirror) {
      this.mirror.style.paddingRight = paddingRight + "px";
    }
  }
  updateScrollDimensions() {
    if (typeof this.cachedContentHeight !== "number" || typeof this.cachedHeight !== "number" || !this.scrollableElement) {
      return;
    }
    const scrollHeight = this.cachedContentHeight;
    const height = this.cachedHeight;
    const scrollTop = this.input.scrollTop;
    this.scrollableElement.setScrollDimensions({ scrollHeight, height });
    this.scrollableElement.setScrollPosition({ scrollTop });
  }
  showMessage(message, force) {
    if (this.state === "open" && equals(this.message, message)) {
      return;
    }
    this.message = message;
    this.element.classList.remove("idle");
    this.element.classList.remove("info");
    this.element.classList.remove("warning");
    this.element.classList.remove("error");
    this.element.classList.add(this.classForType(message.type));
    const styles = this.stylesForType(this.message.type);
    this.element.style.border = `1px solid ${cssJs.asCssValueWithDefault(styles.border, "transparent")}`;
    if (this.message.content && (this.hasFocus() || force)) {
      this._showMessage();
    }
  }
  hideMessage() {
    this.message = null;
    this.element.classList.remove("info");
    this.element.classList.remove("warning");
    this.element.classList.remove("error");
    this.element.classList.add("idle");
    this._hideMessage();
    this.applyStyles();
  }
  isInputValid() {
    return !!this.validation && !this.validation(this.value);
  }
  validate() {
    let errorMsg = null;
    if (this.validation) {
      errorMsg = this.validation(this.value);
      if (errorMsg) {
        this.inputElement.setAttribute("aria-invalid", "true");
        this.showMessage(errorMsg);
      } else if (this.inputElement.hasAttribute("aria-invalid")) {
        this.inputElement.removeAttribute("aria-invalid");
        this.hideMessage();
      }
    }
    return errorMsg?.type;
  }
  stylesForType(type) {
    const styles = this.options.inputBoxStyles;
    switch (type) {
      case 1 /* INFO */:
        return { border: styles.inputValidationInfoBorder, background: styles.inputValidationInfoBackground, foreground: styles.inputValidationInfoForeground };
      case 2 /* WARNING */:
        return { border: styles.inputValidationWarningBorder, background: styles.inputValidationWarningBackground, foreground: styles.inputValidationWarningForeground };
      default:
        return { border: styles.inputValidationErrorBorder, background: styles.inputValidationErrorBackground, foreground: styles.inputValidationErrorForeground };
    }
  }
  classForType(type) {
    switch (type) {
      case 1 /* INFO */:
        return "info";
      case 2 /* WARNING */:
        return "warning";
      default:
        return "error";
    }
  }
  _showMessage() {
    if (!this.contextViewProvider || !this.message) {
      return;
    }
    let div;
    const layout = () => div.style.width = dom.getTotalWidth(this.element) + "px";
    this.contextViewProvider.showContextView({
      getAnchor: () => this.element,
      anchorAlignment: AnchorAlignment.RIGHT,
      render: (container) => {
        if (!this.message) {
          return null;
        }
        div = dom.append(container, $(".monaco-inputbox-container"));
        layout();
        const spanElement = $("span.monaco-inputbox-message");
        if (this.message.formatContent) {
          renderFormattedText(this.message.content, void 0, spanElement);
        } else {
          renderText(this.message.content, void 0, spanElement);
        }
        spanElement.classList.add(this.classForType(this.message.type));
        const styles = this.stylesForType(this.message.type);
        spanElement.style.backgroundColor = styles.background ?? "";
        spanElement.style.color = styles.foreground ?? "";
        spanElement.style.border = styles.border ? `1px solid ${styles.border}` : "";
        dom.append(div, spanElement);
        return null;
      },
      onHide: () => {
        this.state = "closed";
        this.messageResizeObserver.clear();
      },
      layout
    });
    this.observeElementResize();
    let alertText;
    if (this.message.type === 3 /* ERROR */) {
      alertText = nls.localize("alertErrorMessage", "Error: {0}", this.message.content);
    } else if (this.message.type === 2 /* WARNING */) {
      alertText = nls.localize("alertWarningMessage", "Warning: {0}", this.message.content);
    } else {
      alertText = nls.localize("alertInfoMessage", "Info: {0}", this.message.content);
    }
    aria.alert(alertText);
    this.state = "open";
  }
  _hideMessage() {
    if (!this.contextViewProvider) {
      return;
    }
    if (this.state === "open") {
      this.contextViewProvider.hideContextView();
    }
    this.messageResizeObserver.clear();
    this.state = "idle";
  }
  /**
   * Keeps the validation message sized and anchored to the input while the
   * message is showing and the input itself is resized, e.g. because the
   * containing view was resized.
   */
  observeElementResize() {
    const observer = new dom.DisposableResizeObserver("InputBox.validationMessage", () => {
      if (this.element.isConnected && dom.getTotalWidth(this.element) > 0) {
        this.layoutMessage();
      }
    }, dom.getWindow(this.element));
    observer.observe(this.element);
    this.messageResizeObserver.value = observer;
  }
  layoutMessage() {
    if (this.state === "open" && this.contextViewProvider) {
      this.contextViewProvider.layout();
    }
  }
  onValueChange() {
    this._onDidChange.fire(this.value);
    this.validate();
    this.updateMirror();
    this.input.classList.toggle("empty", !this.value);
    if (this.state === "open" && this.contextViewProvider) {
      this.contextViewProvider.layout();
    }
    if (this.options.hideHoverOnValueChange) {
      getBaseLayerHoverDelegate().hideHover();
    }
  }
  updateMirror() {
    if (!this.mirror) {
      return;
    }
    const value = this.value;
    const lastCharCode = value.charCodeAt(value.length - 1);
    const suffix = lastCharCode === 10 ? " " : "";
    const mirrorTextContent = (value + suffix).replace(/\u000c/g, "");
    if (mirrorTextContent) {
      this.mirror.textContent = value + suffix;
    } else {
      this.mirror.innerText = "\xA0";
    }
    this.layout();
  }
  applyStyles() {
    const styles = this.options.inputBoxStyles;
    const background = styles.inputBackground ?? "";
    const foreground = styles.inputForeground ?? "";
    const border = styles.inputBorder ?? "";
    this.element.style.backgroundColor = background;
    this.element.style.color = foreground;
    this.input.style.backgroundColor = "inherit";
    this.input.style.color = foreground;
    this.element.style.border = `1px solid ${cssJs.asCssValueWithDefault(border, "transparent")}`;
  }
  layout() {
    if (!this.mirror) {
      this.layoutMessage();
      return;
    }
    const previousHeight = this.cachedContentHeight;
    this.cachedContentHeight = dom.getTotalHeight(this.mirror);
    if (previousHeight !== this.cachedContentHeight) {
      this.cachedHeight = Math.min(this.cachedContentHeight, this.maxHeight);
      this.input.style.height = this.cachedHeight + "px";
      this._onDidHeightChange.fire(this.cachedContentHeight);
    }
    this.layoutMessage();
  }
  insertAtCursor(text) {
    const inputElement = this.inputElement;
    const start = inputElement.selectionStart;
    const end = inputElement.selectionEnd;
    const content = inputElement.value;
    if (start !== null && end !== null) {
      this.value = content.substr(0, start) + text + content.substr(end);
      inputElement.setSelectionRange(start + 1, start + 1);
      this.layout();
    }
  }
  dispose() {
    this._hideMessage();
    this.message = null;
    this.actionbar?.dispose();
    super.dispose();
  }
}
class HistoryInputBox extends InputBox {
  constructor(container, contextViewProvider, options) {
    const NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS = nls.localize({
      key: "history.inputbox.hint.suffix.noparens",
      comment: ['Text is the suffix of an input field placeholder coming after the action the input field performs, this will be used when the input field ends in a closing parenthesis ")", for example "Filter (e.g. text, !exclude)". The character inserted into the final string is \u21C5 to represent the up and down arrow keys.']
    }, " or {0} for history", `\u21C5`);
    const NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS = nls.localize({
      key: "history.inputbox.hint.suffix.inparens",
      comment: ['Text is the suffix of an input field placeholder coming after the action the input field performs, this will be used when the input field does NOT end in a closing parenthesis (eg. "Find"). The character inserted into the final string is \u21C5 to represent the up and down arrow keys.']
    }, " ({0} for history)", `\u21C5`);
    super(container, contextViewProvider, options);
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidBlur = this._register(new Emitter());
    this.onDidBlur = this._onDidBlur.event;
    this.history = this._register(new HistoryNavigator(options.history, 100));
    const addSuffix = () => {
      if (options.showHistoryHint && options.showHistoryHint() && !this.placeholder.endsWith(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS) && !this.placeholder.endsWith(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS) && this.history.getHistory().length) {
        const suffix = this.placeholder.endsWith(")") ? NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS : NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS;
        const suffixedPlaceholder = this.placeholder + suffix;
        if (options.showPlaceholderOnFocus && !dom.isActiveElement(this.input)) {
          this.placeholder = suffixedPlaceholder;
        } else {
          this.setPlaceHolder(suffixedPlaceholder);
        }
      }
    };
    this.observer = new MutationObserver((mutationList, observer) => {
      mutationList.forEach((mutation) => {
        if (!mutation.target.textContent) {
          addSuffix();
        }
      });
    });
    this.observer.observe(this.input, { attributeFilter: ["class"] });
    this.onfocus(this.input, () => addSuffix());
    this.onblur(this.input, () => {
      const resetPlaceholder = (historyHint) => {
        if (!this.placeholder.endsWith(historyHint)) {
          return false;
        } else {
          const revertedPlaceholder = this.placeholder.slice(0, this.placeholder.length - historyHint.length);
          if (options.showPlaceholderOnFocus) {
            this.placeholder = revertedPlaceholder;
          } else {
            this.setPlaceHolder(revertedPlaceholder);
          }
          return true;
        }
      };
      if (!resetPlaceholder(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_IN_PARENS)) {
        resetPlaceholder(NLS_PLACEHOLDER_HISTORY_HINT_SUFFIX_NO_PARENS);
      }
    });
  }
  dispose() {
    super.dispose();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = void 0;
    }
  }
  addToHistory(always) {
    if (this.value && (always || this.value !== this.getCurrentValue())) {
      this.history.add(this.value);
    }
  }
  prependHistory(restoredHistory) {
    const newHistory = this.getHistory();
    this.clearHistory();
    restoredHistory.forEach((item) => {
      this.history.add(item);
    });
    newHistory.forEach((item) => {
      this.history.add(item);
    });
  }
  getHistory() {
    return this.history.getHistory();
  }
  isAtFirstInHistory() {
    return this.history.isFirst();
  }
  isAtLastInHistory() {
    return this.history.isLast();
  }
  isNowhereInHistory() {
    return this.history.isNowhere();
  }
  showNextValue() {
    if (!this.history.has(this.value)) {
      this.addToHistory();
    }
    let next = this.getNextValue();
    if (next) {
      next = next === this.value ? this.getNextValue() : next;
    }
    this.value = next ?? "";
    aria.status(this.value ? this.value : nls.localize("clearedInput", "Cleared Input"));
  }
  showPreviousValue() {
    if (!this.history.has(this.value)) {
      this.addToHistory();
    }
    let previous = this.getPreviousValue();
    if (previous) {
      previous = previous === this.value ? this.getPreviousValue() : previous;
    }
    if (previous) {
      this.value = previous;
      aria.status(this.value);
    }
  }
  clearHistory() {
    this.history.clear();
  }
  setPlaceHolder(placeHolder) {
    super.setPlaceHolder(placeHolder);
    this.setTooltip(placeHolder);
  }
  onBlur() {
    super.onBlur();
    this._onDidBlur.fire();
  }
  onFocus() {
    super.onFocus();
    this._onDidFocus.fire();
  }
  getCurrentValue() {
    let currentValue = this.history.current();
    if (!currentValue) {
      currentValue = this.history.last();
      this.history.next();
    }
    return currentValue;
  }
  getPreviousValue() {
    return this.history.previous() || this.history.first();
  }
  getNextValue() {
    return this.history.next();
  }
}
export {
  HistoryInputBox,
  InputBox,
  MessageType,
  unthemedInboxStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0ICogYXMgY3NzSnMgZnJvbSAnLi4vLi4vY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQsIHJlbmRlclRleHQgfSBmcm9tICcuLi8uLi9mb3JtYXR0ZWRUZXh0UmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0IH0gZnJvbSAnLi4vLi4vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIsIElBY3Rpb25WaWV3SXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBBbmNob3JBbGlnbm1lbnQsIElDb250ZXh0Vmlld1Byb3ZpZGVyIH0gZnJvbSAnLi4vY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgZ2V0QmFzZUxheWVySG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGUyLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vc2Nyb2xsYmFyL3Njcm9sbGFibGVFbGVtZW50LmpzJztcbmltcG9ydCB7IFdpZGdldCB9IGZyb20gJy4uL3dpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSGlzdG9yeU5hdmlnYXRvciwgSUhpc3RvcnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0ICcuL2lucHV0Qm94LmNzcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE11dGFibGVEaXNwb3NhYmxlLCB0eXBlIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cblxuY29uc3QgJCA9IGRvbS4kO1xuXG5leHBvcnQgaW50ZXJmYWNlIElJbnB1dE9wdGlvbnMge1xuXHRyZWFkb25seSBwbGFjZWhvbGRlcj86IHN0cmluZztcblx0cmVhZG9ubHkgc2hvd1BsYWNlaG9sZGVyT25Gb2N1cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRvb2x0aXA/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFyaWFMYWJlbD86IHN0cmluZztcblx0cmVhZG9ubHkgdHlwZT86IHN0cmluZztcblx0cmVhZG9ubHkgdmFsaWRhdGlvbk9wdGlvbnM/OiBJSW5wdXRWYWxpZGF0aW9uT3B0aW9ucztcblx0cmVhZG9ubHkgZmxleGlibGVIZWlnaHQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBmbGV4aWJsZVdpZHRoPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZmxleGlibGVNYXhIZWlnaHQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFjdGlvbnM/OiBSZWFkb25seUFycmF5PElBY3Rpb24+O1xuXHRyZWFkb25seSBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyPzogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXI7XG5cdHJlYWRvbmx5IGlucHV0Qm94U3R5bGVzOiBJSW5wdXRCb3hTdHlsZXM7XG5cdHJlYWRvbmx5IGhpc3Rvcnk/OiBJSGlzdG9yeTxzdHJpbmc+O1xuXHRyZWFkb25seSBoaWRlSG92ZXJPblZhbHVlQ2hhbmdlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5wdXRCb3hTdHlsZXMge1xuXHRyZWFkb25seSBpbnB1dEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0Qm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGlucHV0VmFsaWRhdGlvbkluZm9Cb3JkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRWYWxpZGF0aW9uSW5mb0JhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRWYWxpZGF0aW9uSW5mb0ZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRWYWxpZGF0aW9uV2FybmluZ0JvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25XYXJuaW5nQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25XYXJuaW5nRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25FcnJvckJvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbnB1dFZhbGlkYXRpb25FcnJvckJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaW5wdXRWYWxpZGF0aW9uRXJyb3JGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUlucHV0VmFsaWRhdG9yIHtcblx0KHZhbHVlOiBzdHJpbmcpOiBJTWVzc2FnZSB8IG51bGw7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU1lc3NhZ2Uge1xuXHRyZWFkb25seSBjb250ZW50Pzogc3RyaW5nO1xuXHRyZWFkb25seSBmb3JtYXRDb250ZW50PzogYm9vbGVhbjsgLy8gZGVmYXVsdHMgdG8gZmFsc2Vcblx0cmVhZG9ubHkgdHlwZT86IE1lc3NhZ2VUeXBlO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElJbnB1dFZhbGlkYXRpb25PcHRpb25zIHtcblx0dmFsaWRhdGlvbj86IElJbnB1dFZhbGlkYXRvcjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gTWVzc2FnZVR5cGUge1xuXHRJTkZPID0gMSxcblx0V0FSTklORyA9IDIsXG5cdEVSUk9SID0gM1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSYW5nZSB7XG5cdHN0YXJ0OiBudW1iZXI7XG5cdGVuZDogbnVtYmVyO1xufVxuXG5leHBvcnQgY29uc3QgdW50aGVtZWRJbmJveFN0eWxlczogSUlucHV0Qm94U3R5bGVzID0ge1xuXHRpbnB1dEJhY2tncm91bmQ6ICcjM0MzQzNDJyxcblx0aW5wdXRGb3JlZ3JvdW5kOiAnI0NDQ0NDQycsXG5cdGlucHV0VmFsaWRhdGlvbkluZm9Cb3JkZXI6ICcjNTVBQUZGJyxcblx0aW5wdXRWYWxpZGF0aW9uSW5mb0JhY2tncm91bmQ6ICcjMDYzQjQ5Jyxcblx0aW5wdXRWYWxpZGF0aW9uV2FybmluZ0JvcmRlcjogJyNCODk1MDAnLFxuXHRpbnB1dFZhbGlkYXRpb25XYXJuaW5nQmFja2dyb3VuZDogJyMzNTJBMDUnLFxuXHRpbnB1dFZhbGlkYXRpb25FcnJvckJvcmRlcjogJyNCRTExMDAnLFxuXHRpbnB1dFZhbGlkYXRpb25FcnJvckJhY2tncm91bmQ6ICcjNUExRDFEJyxcblx0aW5wdXRCb3JkZXI6IHVuZGVmaW5lZCxcblx0aW5wdXRWYWxpZGF0aW9uRXJyb3JGb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGlucHV0VmFsaWRhdGlvbkluZm9Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGlucHV0VmFsaWRhdGlvbldhcm5pbmdGb3JlZ3JvdW5kOiB1bmRlZmluZWRcbn07XG5cbmV4cG9ydCBjbGFzcyBJbnB1dEJveCBleHRlbmRzIFdpZGdldCB7XG5cdHByaXZhdGUgY29udGV4dFZpZXdQcm92aWRlcj86IElDb250ZXh0Vmlld1Byb3ZpZGVyO1xuXHRlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cHJvdGVjdGVkIGlucHV0OiBIVE1MSW5wdXRFbGVtZW50O1xuXHRwcml2YXRlIGFjdGlvbmJhcj86IEFjdGlvbkJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBvcHRpb25zOiBJSW5wdXRPcHRpb25zO1xuXHRwcml2YXRlIG1lc3NhZ2U6IElNZXNzYWdlIHwgbnVsbDtcblx0cHJvdGVjdGVkIHBsYWNlaG9sZGVyOiBzdHJpbmc7XG5cdHByaXZhdGUgdG9vbHRpcDogc3RyaW5nO1xuXHRwcml2YXRlIGFyaWFMYWJlbDogc3RyaW5nO1xuXHRwcml2YXRlIHZhbGlkYXRpb24/OiBJSW5wdXRWYWxpZGF0b3I7XG5cdHByaXZhdGUgc3RhdGU6ICdpZGxlJyB8ICdvcGVuJyB8ICdjbG9zZWQnID0gJ2lkbGUnO1xuXG5cdHByaXZhdGUgbWlycm9yOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYWNoZWRIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjYWNoZWRDb250ZW50SGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWF4SGVpZ2h0OiBudW1iZXIgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdHByaXZhdGUgc2Nyb2xsYWJsZUVsZW1lbnQ6IFNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZVJlc2l6ZU9ic2VydmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlKCk6IEV2ZW50PHN0cmluZz4geyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7IH1cblxuXHRwcml2YXRlIF9vbkRpZEhlaWdodENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPG51bWJlcj4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRIZWlnaHRDaGFuZ2UoKTogRXZlbnQ8bnVtYmVyPiB7IHJldHVybiB0aGlzLl9vbkRpZEhlaWdodENoYW5nZS5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyIHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJSW5wdXRPcHRpb25zKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlciA9IGNvbnRleHRWaWV3UHJvdmlkZXI7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblxuXHRcdHRoaXMubWVzc2FnZSA9IG51bGw7XG5cdFx0dGhpcy5wbGFjZWhvbGRlciA9IHRoaXMub3B0aW9ucy5wbGFjZWhvbGRlciB8fCAnJztcblx0XHR0aGlzLnRvb2x0aXAgPSB0aGlzLm9wdGlvbnMudG9vbHRpcCA/PyAodGhpcy5wbGFjZWhvbGRlciB8fCAnJyk7XG5cdFx0dGhpcy5hcmlhTGFiZWwgPSB0aGlzLm9wdGlvbnMuYXJpYUxhYmVsIHx8ICcnO1xuXG5cdFx0aWYgKHRoaXMub3B0aW9ucy52YWxpZGF0aW9uT3B0aW9ucykge1xuXHRcdFx0dGhpcy52YWxpZGF0aW9uID0gdGhpcy5vcHRpb25zLnZhbGlkYXRpb25PcHRpb25zLnZhbGlkYXRpb247XG5cdFx0fVxuXG5cdFx0dGhpcy5lbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5tb25hY28taW5wdXRib3guaWRsZScpKTtcblxuXHRcdGNvbnN0IHRhZ05hbWUgPSB0aGlzLm9wdGlvbnMuZmxleGlibGVIZWlnaHQgPyAndGV4dGFyZWEnIDogJ2lucHV0JztcblxuXHRcdGNvbnN0IHdyYXBwZXIgPSBkb20uYXBwZW5kKHRoaXMuZWxlbWVudCwgJCgnLmlid3JhcHBlcicpKTtcblx0XHR0aGlzLmlucHV0ID0gZG9tLmFwcGVuZCh3cmFwcGVyLCAkKHRhZ05hbWUgKyAnLmlucHV0LmVtcHR5JykpO1xuXHRcdHRoaXMuaW5wdXQuc2V0QXR0cmlidXRlKCdhdXRvY29ycmVjdCcsICdvZmYnKTtcblx0XHR0aGlzLmlucHV0LnNldEF0dHJpYnV0ZSgnYXV0b2NhcGl0YWxpemUnLCAnb2ZmJyk7XG5cdFx0dGhpcy5pbnB1dC5zZXRBdHRyaWJ1dGUoJ3NwZWxsY2hlY2snLCAnZmFsc2UnKTtcblxuXHRcdHRoaXMub25mb2N1cyh0aGlzLmlucHV0LCAoKSA9PiB0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc3ludGhldGljLWZvY3VzJykpO1xuXHRcdHRoaXMub25ibHVyKHRoaXMuaW5wdXQsICgpID0+IHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdzeW50aGV0aWMtZm9jdXMnKSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmZsZXhpYmxlSGVpZ2h0KSB7XG5cdFx0XHR0aGlzLm1heEhlaWdodCA9IHR5cGVvZiB0aGlzLm9wdGlvbnMuZmxleGlibGVNYXhIZWlnaHQgPT09ICdudW1iZXInID8gdGhpcy5vcHRpb25zLmZsZXhpYmxlTWF4SGVpZ2h0IDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG5cdFx0XHR0aGlzLm1pcnJvciA9IGRvbS5hcHBlbmQod3JhcHBlciwgJCgnZGl2Lm1pcnJvcicpKTtcblx0XHRcdHRoaXMubWlycm9yLmlubmVyVGV4dCA9ICdcXHUwMGEwJztcblxuXHRcdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudCA9IG5ldyBTY3JvbGxhYmxlRWxlbWVudCh0aGlzLmVsZW1lbnQsIHsgdmVydGljYWw6IFNjcm9sbGJhclZpc2liaWxpdHkuQXV0byB9KTtcblxuXHRcdFx0aWYgKHRoaXMub3B0aW9ucy5mbGV4aWJsZVdpZHRoKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXQuc2V0QXR0cmlidXRlKCd3cmFwJywgJ29mZicpO1xuXHRcdFx0XHR0aGlzLm1pcnJvci5zdHlsZS53aGl0ZVNwYWNlID0gJ3ByZSc7XG5cdFx0XHRcdHRoaXMubWlycm9yLnN0eWxlLndvcmRXcmFwID0gJ2luaXRpYWwnO1xuXHRcdFx0fVxuXG5cdFx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgdGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zY3JvbGxhYmxlRWxlbWVudCk7XG5cblx0XHRcdC8vIGZyb20gU2Nyb2xsYWJsZUVsZW1lbnQgdG8gRE9NXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNjcm9sbGFibGVFbGVtZW50Lm9uU2Nyb2xsKGUgPT4gdGhpcy5pbnB1dC5zY3JvbGxUb3AgPSBlLnNjcm9sbFRvcCkpO1xuXG5cdFx0XHRjb25zdCBvblNlbGVjdGlvbkNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEb21FbWl0dGVyKGNvbnRhaW5lci5vd25lckRvY3VtZW50LCAnc2VsZWN0aW9uY2hhbmdlJykpO1xuXHRcdFx0Y29uc3Qgb25BbmNob3JlZFNlbGVjdGlvbkNoYW5nZSA9IEV2ZW50LmZpbHRlcihvblNlbGVjdGlvbkNoYW5nZS5ldmVudCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBjb250YWluZXIub3duZXJEb2N1bWVudC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0cmV0dXJuIHNlbGVjdGlvbj8uYW5jaG9yTm9kZSA9PT0gd3JhcHBlcjtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBmcm9tIERPTSB0byBTY3JvbGxhYmxlRWxlbWVudFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob25BbmNob3JlZFNlbGVjdGlvbkNoYW5nZSh0aGlzLnVwZGF0ZVNjcm9sbERpbWVuc2lvbnMsIHRoaXMpKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRIZWlnaHRDaGFuZ2UodGhpcy51cGRhdGVTY3JvbGxEaW1lbnNpb25zLCB0aGlzKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuaW5wdXQudHlwZSA9IHRoaXMub3B0aW9ucy50eXBlIHx8ICd0ZXh0Jztcblx0XHRcdHRoaXMuaW5wdXQuc2V0QXR0cmlidXRlKCd3cmFwJywgJ29mZicpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy5pbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLmFyaWFMYWJlbCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucGxhY2Vob2xkZXIgJiYgIXRoaXMub3B0aW9ucy5zaG93UGxhY2Vob2xkZXJPbkZvY3VzKSB7XG5cdFx0XHR0aGlzLnNldFBsYWNlSG9sZGVyKHRoaXMucGxhY2Vob2xkZXIpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRvb2x0aXApIHtcblx0XHRcdHRoaXMuc2V0VG9vbHRpcCh0aGlzLnRvb2x0aXApO1xuXHRcdH1cblxuXHRcdHRoaXMub25pbnB1dCh0aGlzLmlucHV0LCAoKSA9PiB0aGlzLm9uVmFsdWVDaGFuZ2UoKSk7XG5cdFx0dGhpcy5vbmJsdXIodGhpcy5pbnB1dCwgKCkgPT4gdGhpcy5vbkJsdXIoKSk7XG5cdFx0dGhpcy5vbmZvY3VzKHRoaXMuaW5wdXQsICgpID0+IHRoaXMub25Gb2N1cygpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaWdub3JlR2VzdHVyZSh0aGlzLmlucHV0KSk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHRoaXMudXBkYXRlTWlycm9yKCksIDApO1xuXG5cdFx0Ly8gU3VwcG9ydCBhY3Rpb25zXG5cdFx0aWYgKHRoaXMub3B0aW9ucy5hY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmFjdGlvbmJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodGhpcy5lbGVtZW50LCB7XG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IHRoaXMub3B0aW9ucy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmFjdGlvbmJhci5wdXNoKHRoaXMub3B0aW9ucy5hY3Rpb25zLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblx0XHR9XG5cblx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0QWN0aW9ucyhhY3Rpb25zOiBSZWFkb25seUFycmF5PElBY3Rpb24+IHwgdW5kZWZpbmVkLCBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyPzogSUFjdGlvblZpZXdJdGVtUHJvdmlkZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5hY3Rpb25iYXIpIHtcblx0XHRcdHRoaXMuYWN0aW9uYmFyLmNsZWFyKCk7XG5cdFx0XHRpZiAoYWN0aW9ucykge1xuXHRcdFx0XHR0aGlzLmFjdGlvbmJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYWN0aW9ucykge1xuXHRcdFx0dGhpcy5hY3Rpb25iYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuZWxlbWVudCwge1xuXHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyID8/IHRoaXMub3B0aW9ucy5hY3Rpb25WaWV3SXRlbVByb3ZpZGVyXG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLmFjdGlvbmJhci5wdXNoKGFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgYWN0aW9uc1dpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uYmFyPy5nZXRDb250YWluZXIoKS5vZmZzZXRXaWR0aCA/PyAwO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uQmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLl9oaWRlTWVzc2FnZSgpO1xuXHRcdGlmICh0aGlzLm9wdGlvbnMuc2hvd1BsYWNlaG9sZGVyT25Gb2N1cykge1xuXHRcdFx0dGhpcy5pbnB1dC5zZXRBdHRyaWJ1dGUoJ3BsYWNlaG9sZGVyJywgJycpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvbkZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Nob3dNZXNzYWdlKCk7XG5cdFx0aWYgKHRoaXMub3B0aW9ucy5zaG93UGxhY2Vob2xkZXJPbkZvY3VzKSB7XG5cdFx0XHR0aGlzLmlucHV0LnNldEF0dHJpYnV0ZSgncGxhY2Vob2xkZXInLCB0aGlzLnBsYWNlaG9sZGVyIHx8ICcnKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0UGxhY2VIb2xkZXIocGxhY2VIb2xkZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucGxhY2Vob2xkZXIgPSBwbGFjZUhvbGRlcjtcblx0XHR0aGlzLmlucHV0LnNldEF0dHJpYnV0ZSgncGxhY2Vob2xkZXInLCBwbGFjZUhvbGRlcik7XG5cdH1cblxuXHRwdWJsaWMgc2V0VG9vbHRpcCh0b29sdGlwOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnRvb2x0aXAgPSB0b29sdGlwO1xuXHRcdGlmICghdGhpcy5ob3Zlci52YWx1ZSkge1xuXHRcdFx0dGhpcy5ob3Zlci52YWx1ZSA9IHRoaXMuX3JlZ2lzdGVyKGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoKS5zZXR1cERlbGF5ZWRIb3ZlckF0TW91c2UodGhpcy5pbnB1dCwgKCkgPT4gKHtcblx0XHRcdFx0Y29udGVudDogdGhpcy50b29sdGlwLFxuXHRcdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdFx0Y29tcGFjdDogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0fSkpKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc2V0QXJpYUxhYmVsKGxhYmVsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmFyaWFMYWJlbCA9IGxhYmVsO1xuXG5cdFx0aWYgKGxhYmVsKSB7XG5cdFx0XHR0aGlzLmlucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYXJpYUxhYmVsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dC5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuYXJpYUxhYmVsO1xuXHR9XG5cblx0cHVibGljIGdldCBtaXJyb3JFbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5taXJyb3I7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlucHV0RWxlbWVudCgpOiBIVE1MSW5wdXRFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgdmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dC52YWx1ZTtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdmFsdWUobmV3VmFsdWU6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLmlucHV0LnZhbHVlICE9PSBuZXdWYWx1ZSkge1xuXHRcdFx0dGhpcy5pbnB1dC52YWx1ZSA9IG5ld1ZhbHVlO1xuXHRcdFx0dGhpcy5vblZhbHVlQ2hhbmdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldCBzdGVwKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuc3RlcDtcblx0fVxuXG5cdHB1YmxpYyBzZXQgc3RlcChuZXdWYWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5pbnB1dC5zdGVwID0gbmV3VmFsdWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0eXBlb2YgdGhpcy5jYWNoZWRIZWlnaHQgPT09ICdudW1iZXInID8gdGhpcy5jYWNoZWRIZWlnaHQgOiBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5lbGVtZW50KTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRwdWJsaWMgYmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0LmJsdXIoKTtcblx0fVxuXG5cdHB1YmxpYyBoYXNGb2N1cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZG9tLmlzQWN0aXZlRWxlbWVudCh0aGlzLmlucHV0KTtcblx0fVxuXG5cdHB1YmxpYyBzZWxlY3QocmFuZ2U6IElSYW5nZSB8IG51bGwgPSBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dC5zZWxlY3QoKTtcblxuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0dGhpcy5pbnB1dC5zZXRTZWxlY3Rpb25SYW5nZShyYW5nZS5zdGFydCwgcmFuZ2UuZW5kKTtcblx0XHRcdGlmIChyYW5nZS5lbmQgPT09IHRoaXMuaW5wdXQudmFsdWUubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXQuc2Nyb2xsTGVmdCA9IHRoaXMuaW5wdXQuc2Nyb2xsV2lkdGg7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGlzU2VsZWN0aW9uQXRFbmQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXQuc2VsZWN0aW9uRW5kID09PSB0aGlzLmlucHV0LnZhbHVlLmxlbmd0aCAmJiB0aGlzLmlucHV0LnNlbGVjdGlvblN0YXJ0ID09PSB0aGlzLmlucHV0LnNlbGVjdGlvbkVuZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRTZWxlY3Rpb24oKTogSVJhbmdlIHwgbnVsbCB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uU3RhcnQgPSB0aGlzLmlucHV0LnNlbGVjdGlvblN0YXJ0O1xuXHRcdGlmIChzZWxlY3Rpb25TdGFydCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHNlbGVjdGlvbkVuZCA9IHRoaXMuaW5wdXQuc2VsZWN0aW9uRW5kID8/IHNlbGVjdGlvblN0YXJ0O1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydDogc2VsZWN0aW9uU3RhcnQsXG5cdFx0XHRlbmQ6IHNlbGVjdGlvbkVuZCxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIGVuYWJsZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0LnJlbW92ZUF0dHJpYnV0ZSgnZGlzYWJsZWQnKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNhYmxlKCk6IHZvaWQge1xuXHRcdHRoaXMuYmx1cigpO1xuXHRcdHRoaXMuaW5wdXQuZGlzYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMuX2hpZGVNZXNzYWdlKCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0RW5hYmxlZChlbmFibGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdHRoaXMuZW5hYmxlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZGlzYWJsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXQgd2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gZG9tLmdldFRvdGFsV2lkdGgodGhpcy5pbnB1dCk7XG5cdH1cblxuXHRwdWJsaWMgc2V0IHdpZHRoKHdpZHRoOiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5vcHRpb25zLmZsZXhpYmxlSGVpZ2h0ICYmIHRoaXMub3B0aW9ucy5mbGV4aWJsZVdpZHRoKSB7XG5cdFx0XHQvLyB0ZXh0YXJlYSB3aXRoIGhvcml6b250YWwgc2Nyb2xsaW5nXG5cdFx0XHRsZXQgaG9yaXpvbnRhbFBhZGRpbmcgPSAwO1xuXHRcdFx0aWYgKHRoaXMubWlycm9yKSB7XG5cdFx0XHRcdGNvbnN0IHBhZGRpbmdMZWZ0ID0gcGFyc2VGbG9hdCh0aGlzLm1pcnJvci5zdHlsZS5wYWRkaW5nTGVmdCB8fCAnJykgfHwgMDtcblx0XHRcdFx0Y29uc3QgcGFkZGluZ1JpZ2h0ID0gcGFyc2VGbG9hdCh0aGlzLm1pcnJvci5zdHlsZS5wYWRkaW5nUmlnaHQgfHwgJycpIHx8IDA7XG5cdFx0XHRcdGhvcml6b250YWxQYWRkaW5nID0gcGFkZGluZ0xlZnQgKyBwYWRkaW5nUmlnaHQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmlucHV0LnN0eWxlLndpZHRoID0gKHdpZHRoIC0gaG9yaXpvbnRhbFBhZGRpbmcpICsgJ3B4Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbnB1dC5zdHlsZS53aWR0aCA9IHdpZHRoICsgJ3B4Jztcblx0XHR9XG5cblx0XHRpZiAodGhpcy5taXJyb3IpIHtcblx0XHRcdHRoaXMubWlycm9yLnN0eWxlLndpZHRoID0gd2lkdGggKyAncHgnO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXQgcGFkZGluZ1JpZ2h0KHBhZGRpbmdSaWdodDogbnVtYmVyKSB7XG5cdFx0Ly8gU2V0IHdpZHRoIHRvIGF2b2lkIGhpbnQgdGV4dCBvdmVybGFwcGluZyBidXR0b25zXG5cdFx0dGhpcy5pbnB1dC5zdHlsZS53aWR0aCA9IGBjYWxjKDEwMCUgLSAke3BhZGRpbmdSaWdodH1weClgO1xuXG5cdFx0aWYgKHRoaXMubWlycm9yKSB7XG5cdFx0XHR0aGlzLm1pcnJvci5zdHlsZS5wYWRkaW5nUmlnaHQgPSBwYWRkaW5nUmlnaHQgKyAncHgnO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU2Nyb2xsRGltZW5zaW9ucygpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuY2FjaGVkQ29udGVudEhlaWdodCAhPT0gJ251bWJlcicgfHwgdHlwZW9mIHRoaXMuY2FjaGVkSGVpZ2h0ICE9PSAnbnVtYmVyJyB8fCAhdGhpcy5zY3JvbGxhYmxlRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IHRoaXMuY2FjaGVkQ29udGVudEhlaWdodDtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLmNhY2hlZEhlaWdodDtcblx0XHRjb25zdCBzY3JvbGxUb3AgPSB0aGlzLmlucHV0LnNjcm9sbFRvcDtcblxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsRGltZW5zaW9ucyh7IHNjcm9sbEhlaWdodCwgaGVpZ2h0IH0pO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQuc2V0U2Nyb2xsUG9zaXRpb24oeyBzY3JvbGxUb3AgfSk7XG5cdH1cblxuXHRwdWJsaWMgc2hvd01lc3NhZ2UobWVzc2FnZTogSU1lc3NhZ2UsIGZvcmNlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlID09PSAnb3BlbicgJiYgZXF1YWxzKHRoaXMubWVzc2FnZSwgbWVzc2FnZSkpIHtcblx0XHRcdC8vIEFscmVhZHkgc2hvd2luZ1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMubWVzc2FnZSA9IG1lc3NhZ2U7XG5cblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaWRsZScpO1xuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbmZvJyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3dhcm5pbmcnKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZXJyb3InKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCh0aGlzLmNsYXNzRm9yVHlwZShtZXNzYWdlLnR5cGUpKTtcblxuXHRcdGNvbnN0IHN0eWxlcyA9IHRoaXMuc3R5bGVzRm9yVHlwZSh0aGlzLm1lc3NhZ2UudHlwZSk7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHtjc3NKcy5hc0Nzc1ZhbHVlV2l0aERlZmF1bHQoc3R5bGVzLmJvcmRlciwgJ3RyYW5zcGFyZW50Jyl9YDtcblxuXHRcdGlmICh0aGlzLm1lc3NhZ2UuY29udGVudCAmJiAodGhpcy5oYXNGb2N1cygpIHx8IGZvcmNlKSkge1xuXHRcdFx0dGhpcy5fc2hvd01lc3NhZ2UoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGlkZU1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlID0gbnVsbDtcblxuXHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdpbmZvJyk7XG5cdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ3dhcm5pbmcnKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZXJyb3InKTtcblx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaWRsZScpO1xuXG5cdFx0dGhpcy5faGlkZU1lc3NhZ2UoKTtcblx0XHR0aGlzLmFwcGx5U3R5bGVzKCk7XG5cdH1cblxuXHRwdWJsaWMgaXNJbnB1dFZhbGlkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMudmFsaWRhdGlvbiAmJiAhdGhpcy52YWxpZGF0aW9uKHRoaXMudmFsdWUpO1xuXHR9XG5cblx0cHVibGljIHZhbGlkYXRlKCk6IE1lc3NhZ2VUeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgZXJyb3JNc2c6IElNZXNzYWdlIHwgbnVsbCA9IG51bGw7XG5cblx0XHRpZiAodGhpcy52YWxpZGF0aW9uKSB7XG5cdFx0XHRlcnJvck1zZyA9IHRoaXMudmFsaWRhdGlvbih0aGlzLnZhbHVlKTtcblxuXHRcdFx0aWYgKGVycm9yTXNnKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1pbnZhbGlkJywgJ3RydWUnKTtcblx0XHRcdFx0dGhpcy5zaG93TWVzc2FnZShlcnJvck1zZyk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmICh0aGlzLmlucHV0RWxlbWVudC5oYXNBdHRyaWJ1dGUoJ2FyaWEtaW52YWxpZCcpKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRFbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1pbnZhbGlkJyk7XG5cdFx0XHRcdHRoaXMuaGlkZU1lc3NhZ2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZXJyb3JNc2c/LnR5cGU7XG5cdH1cblxuXHRwdWJsaWMgc3R5bGVzRm9yVHlwZSh0eXBlOiBNZXNzYWdlVHlwZSB8IHVuZGVmaW5lZCk6IHsgYm9yZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgZm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IHN0eWxlcyA9IHRoaXMub3B0aW9ucy5pbnB1dEJveFN0eWxlcztcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuSU5GTzogcmV0dXJuIHsgYm9yZGVyOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uSW5mb0JvcmRlciwgYmFja2dyb3VuZDogc3R5bGVzLmlucHV0VmFsaWRhdGlvbkluZm9CYWNrZ3JvdW5kLCBmb3JlZ3JvdW5kOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uSW5mb0ZvcmVncm91bmQgfTtcblx0XHRcdGNhc2UgTWVzc2FnZVR5cGUuV0FSTklORzogcmV0dXJuIHsgYm9yZGVyOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uV2FybmluZ0JvcmRlciwgYmFja2dyb3VuZDogc3R5bGVzLmlucHV0VmFsaWRhdGlvbldhcm5pbmdCYWNrZ3JvdW5kLCBmb3JlZ3JvdW5kOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uV2FybmluZ0ZvcmVncm91bmQgfTtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiB7IGJvcmRlcjogc3R5bGVzLmlucHV0VmFsaWRhdGlvbkVycm9yQm9yZGVyLCBiYWNrZ3JvdW5kOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uRXJyb3JCYWNrZ3JvdW5kLCBmb3JlZ3JvdW5kOiBzdHlsZXMuaW5wdXRWYWxpZGF0aW9uRXJyb3JGb3JlZ3JvdW5kIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGFzc0ZvclR5cGUodHlwZTogTWVzc2FnZVR5cGUgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5JTkZPOiByZXR1cm4gJ2luZm8nO1xuXHRcdFx0Y2FzZSBNZXNzYWdlVHlwZS5XQVJOSU5HOiByZXR1cm4gJ3dhcm5pbmcnO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuICdlcnJvcic7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd01lc3NhZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIgfHwgIXRoaXMubWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkaXY6IEhUTUxFbGVtZW50O1xuXHRcdGNvbnN0IGxheW91dCA9ICgpID0+IGRpdi5zdHlsZS53aWR0aCA9IGRvbS5nZXRUb3RhbFdpZHRoKHRoaXMuZWxlbWVudCkgKyAncHgnO1xuXG5cdFx0dGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyLnNob3dDb250ZXh0Vmlldyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuZWxlbWVudCxcblx0XHRcdGFuY2hvckFsaWdubWVudDogQW5jaG9yQWxpZ25tZW50LlJJR0hULFxuXHRcdFx0cmVuZGVyOiAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMubWVzc2FnZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZGl2ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5tb25hY28taW5wdXRib3gtY29udGFpbmVyJykpO1xuXHRcdFx0XHRsYXlvdXQoKTtcblxuXG5cdFx0XHRcdGNvbnN0IHNwYW5FbGVtZW50ID0gJCgnc3Bhbi5tb25hY28taW5wdXRib3gtbWVzc2FnZScpO1xuXHRcdFx0XHRpZiAodGhpcy5tZXNzYWdlLmZvcm1hdENvbnRlbnQpIHtcblx0XHRcdFx0XHRyZW5kZXJGb3JtYXR0ZWRUZXh0KHRoaXMubWVzc2FnZS5jb250ZW50ISwgdW5kZWZpbmVkLCBzcGFuRWxlbWVudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVuZGVyVGV4dCh0aGlzLm1lc3NhZ2UuY29udGVudCEsIHVuZGVmaW5lZCwgc3BhbkVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3BhbkVsZW1lbnQuY2xhc3NMaXN0LmFkZCh0aGlzLmNsYXNzRm9yVHlwZSh0aGlzLm1lc3NhZ2UudHlwZSkpO1xuXG5cdFx0XHRcdGNvbnN0IHN0eWxlcyA9IHRoaXMuc3R5bGVzRm9yVHlwZSh0aGlzLm1lc3NhZ2UudHlwZSk7XG5cdFx0XHRcdHNwYW5FbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHN0eWxlcy5iYWNrZ3JvdW5kID8/ICcnO1xuXHRcdFx0XHRzcGFuRWxlbWVudC5zdHlsZS5jb2xvciA9IHN0eWxlcy5mb3JlZ3JvdW5kID8/ICcnO1xuXHRcdFx0XHRzcGFuRWxlbWVudC5zdHlsZS5ib3JkZXIgPSBzdHlsZXMuYm9yZGVyID8gYDFweCBzb2xpZCAke3N0eWxlcy5ib3JkZXJ9YCA6ICcnO1xuXG5cdFx0XHRcdGRvbS5hcHBlbmQoZGl2LCBzcGFuRWxlbWVudCk7XG5cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc3RhdGUgPSAnY2xvc2VkJztcblx0XHRcdFx0dGhpcy5tZXNzYWdlUmVzaXplT2JzZXJ2ZXIuY2xlYXIoKTtcblx0XHRcdH0sXG5cdFx0XHRsYXlvdXQ6IGxheW91dFxuXHRcdH0pO1xuXG5cdFx0dGhpcy5vYnNlcnZlRWxlbWVudFJlc2l6ZSgpO1xuXG5cdFx0Ly8gQVJJQSBTdXBwb3J0XG5cdFx0bGV0IGFsZXJ0VGV4dDogc3RyaW5nO1xuXHRcdGlmICh0aGlzLm1lc3NhZ2UudHlwZSA9PT0gTWVzc2FnZVR5cGUuRVJST1IpIHtcblx0XHRcdGFsZXJ0VGV4dCA9IG5scy5sb2NhbGl6ZSgnYWxlcnRFcnJvck1lc3NhZ2UnLCBcIkVycm9yOiB7MH1cIiwgdGhpcy5tZXNzYWdlLmNvbnRlbnQpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5tZXNzYWdlLnR5cGUgPT09IE1lc3NhZ2VUeXBlLldBUk5JTkcpIHtcblx0XHRcdGFsZXJ0VGV4dCA9IG5scy5sb2NhbGl6ZSgnYWxlcnRXYXJuaW5nTWVzc2FnZScsIFwiV2FybmluZzogezB9XCIsIHRoaXMubWVzc2FnZS5jb250ZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YWxlcnRUZXh0ID0gbmxzLmxvY2FsaXplKCdhbGVydEluZm9NZXNzYWdlJywgXCJJbmZvOiB7MH1cIiwgdGhpcy5tZXNzYWdlLmNvbnRlbnQpO1xuXHRcdH1cblxuXHRcdGFyaWEuYWxlcnQoYWxlcnRUZXh0KTtcblxuXHRcdHRoaXMuc3RhdGUgPSAnb3Blbic7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlTWVzc2FnZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dFZpZXdQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0YXRlID09PSAnb3BlbicpIHtcblx0XHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlci5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHR9XG5cblx0XHR0aGlzLm1lc3NhZ2VSZXNpemVPYnNlcnZlci5jbGVhcigpO1xuXHRcdHRoaXMuc3RhdGUgPSAnaWRsZSc7XG5cdH1cblxuXHQvKipcblx0ICogS2VlcHMgdGhlIHZhbGlkYXRpb24gbWVzc2FnZSBzaXplZCBhbmQgYW5jaG9yZWQgdG8gdGhlIGlucHV0IHdoaWxlIHRoZVxuXHQgKiBtZXNzYWdlIGlzIHNob3dpbmcgYW5kIHRoZSBpbnB1dCBpdHNlbGYgaXMgcmVzaXplZCwgZS5nLiBiZWNhdXNlIHRoZVxuXHQgKiBjb250YWluaW5nIHZpZXcgd2FzIHJlc2l6ZWQuXG5cdCAqL1xuXHRwcml2YXRlIG9ic2VydmVFbGVtZW50UmVzaXplKCk6IHZvaWQge1xuXHRcdGNvbnN0IG9ic2VydmVyID0gbmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0lucHV0Qm94LnZhbGlkYXRpb25NZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Ly8gSWdub3JlIG5vdGlmaWNhdGlvbnMgZm9yIGEgaGlkZGVuIG9yIGRldGFjaGVkIGlucHV0LCBsYXlpbmcgb3V0XG5cdFx0XHQvLyBhZ2FpbnN0IGEgZGVnZW5lcmF0ZSBhbmNob3Igd291bGQgbW92ZSB0aGUgbWVzc2FnZSB0byB0aGUgY29ybmVyLlxuXHRcdFx0aWYgKHRoaXMuZWxlbWVudC5pc0Nvbm5lY3RlZCAmJiBkb20uZ2V0VG90YWxXaWR0aCh0aGlzLmVsZW1lbnQpID4gMCkge1xuXHRcdFx0XHR0aGlzLmxheW91dE1lc3NhZ2UoKTtcblx0XHRcdH1cblx0XHR9LCBkb20uZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpO1xuXHRcdG9ic2VydmVyLm9ic2VydmUodGhpcy5lbGVtZW50KTtcblx0XHR0aGlzLm1lc3NhZ2VSZXNpemVPYnNlcnZlci52YWx1ZSA9IG9ic2VydmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRNZXNzYWdlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnN0YXRlID09PSAnb3BlbicgJiYgdGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblZhbHVlQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy52YWx1ZSk7XG5cblx0XHR0aGlzLnZhbGlkYXRlKCk7XG5cdFx0dGhpcy51cGRhdGVNaXJyb3IoKTtcblx0XHR0aGlzLmlucHV0LmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgIXRoaXMudmFsdWUpO1xuXG5cdFx0aWYgKHRoaXMuc3RhdGUgPT09ICdvcGVuJyAmJiB0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlci5sYXlvdXQoKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmhpZGVIb3Zlck9uVmFsdWVDaGFuZ2UpIHtcblx0XHRcdGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUoKS5oaWRlSG92ZXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZU1pcnJvcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMubWlycm9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLnZhbHVlO1xuXHRcdGNvbnN0IGxhc3RDaGFyQ29kZSA9IHZhbHVlLmNoYXJDb2RlQXQodmFsdWUubGVuZ3RoIC0gMSk7XG5cdFx0Y29uc3Qgc3VmZml4ID0gbGFzdENoYXJDb2RlID09PSAxMCA/ICcgJyA6ICcnO1xuXHRcdGNvbnN0IG1pcnJvclRleHRDb250ZW50ID0gKHZhbHVlICsgc3VmZml4KVxuXHRcdFx0LnJlcGxhY2UoL1xcdTAwMGMvZywgJycpOyAvLyBEb24ndCBtZWFzdXJlIHdpdGggdGhlIGZvcm0gZmVlZCBjaGFyYWN0ZXIsIHdoaWNoIG1lc3NlcyB1cCBzaXppbmdcblxuXHRcdGlmIChtaXJyb3JUZXh0Q29udGVudCkge1xuXHRcdFx0dGhpcy5taXJyb3IudGV4dENvbnRlbnQgPSB2YWx1ZSArIHN1ZmZpeDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5taXJyb3IuaW5uZXJUZXh0ID0gJ1xcdTAwYTAnO1xuXHRcdH1cblxuXHRcdHRoaXMubGF5b3V0KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXBwbHlTdHlsZXMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3R5bGVzID0gdGhpcy5vcHRpb25zLmlucHV0Qm94U3R5bGVzO1xuXG5cdFx0Y29uc3QgYmFja2dyb3VuZCA9IHN0eWxlcy5pbnB1dEJhY2tncm91bmQgPz8gJyc7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZCA9IHN0eWxlcy5pbnB1dEZvcmVncm91bmQgPz8gJyc7XG5cdFx0Y29uc3QgYm9yZGVyID0gc3R5bGVzLmlucHV0Qm9yZGVyID8/ICcnO1xuXG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGJhY2tncm91bmQ7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLmNvbG9yID0gZm9yZWdyb3VuZDtcblx0XHR0aGlzLmlucHV0LnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICdpbmhlcml0Jztcblx0XHR0aGlzLmlucHV0LnN0eWxlLmNvbG9yID0gZm9yZWdyb3VuZDtcblxuXHRcdC8vIHRoZXJlJ3MgYWx3YXlzIGEgYm9yZGVyLCBldmVuIGlmIHRoZSBjb2xvciBpcyBub3Qgc2V0LlxuXHRcdHRoaXMuZWxlbWVudC5zdHlsZS5ib3JkZXIgPSBgMXB4IHNvbGlkICR7Y3NzSnMuYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KGJvcmRlciwgJ3RyYW5zcGFyZW50Jyl9YDtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm1pcnJvcikge1xuXHRcdFx0dGhpcy5sYXlvdXRNZXNzYWdlKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNIZWlnaHQgPSB0aGlzLmNhY2hlZENvbnRlbnRIZWlnaHQ7XG5cdFx0dGhpcy5jYWNoZWRDb250ZW50SGVpZ2h0ID0gZG9tLmdldFRvdGFsSGVpZ2h0KHRoaXMubWlycm9yKTtcblxuXHRcdGlmIChwcmV2aW91c0hlaWdodCAhPT0gdGhpcy5jYWNoZWRDb250ZW50SGVpZ2h0KSB7XG5cdFx0XHR0aGlzLmNhY2hlZEhlaWdodCA9IE1hdGgubWluKHRoaXMuY2FjaGVkQ29udGVudEhlaWdodCwgdGhpcy5tYXhIZWlnaHQpO1xuXHRcdFx0dGhpcy5pbnB1dC5zdHlsZS5oZWlnaHQgPSB0aGlzLmNhY2hlZEhlaWdodCArICdweCc7XG5cdFx0XHR0aGlzLl9vbkRpZEhlaWdodENoYW5nZS5maXJlKHRoaXMuY2FjaGVkQ29udGVudEhlaWdodCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXlvdXRNZXNzYWdlKCk7XG5cdH1cblxuXHRwdWJsaWMgaW5zZXJ0QXRDdXJzb3IodGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXRFbGVtZW50ID0gdGhpcy5pbnB1dEVsZW1lbnQ7XG5cdFx0Y29uc3Qgc3RhcnQgPSBpbnB1dEVsZW1lbnQuc2VsZWN0aW9uU3RhcnQ7XG5cdFx0Y29uc3QgZW5kID0gaW5wdXRFbGVtZW50LnNlbGVjdGlvbkVuZDtcblx0XHRjb25zdCBjb250ZW50ID0gaW5wdXRFbGVtZW50LnZhbHVlO1xuXG5cdFx0aWYgKHN0YXJ0ICE9PSBudWxsICYmIGVuZCAhPT0gbnVsbCkge1xuXHRcdFx0dGhpcy52YWx1ZSA9IGNvbnRlbnQuc3Vic3RyKDAsIHN0YXJ0KSArIHRleHQgKyBjb250ZW50LnN1YnN0cihlbmQpO1xuXHRcdFx0aW5wdXRFbGVtZW50LnNldFNlbGVjdGlvblJhbmdlKHN0YXJ0ICsgMSwgc3RhcnQgKyAxKTtcblx0XHRcdHRoaXMubGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5faGlkZU1lc3NhZ2UoKTtcblxuXHRcdHRoaXMubWVzc2FnZSA9IG51bGw7XG5cblx0XHR0aGlzLmFjdGlvbmJhcj8uZGlzcG9zZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhpc3RvcnlJbnB1dE9wdGlvbnMgZXh0ZW5kcyBJSW5wdXRPcHRpb25zIHtcblx0cmVhZG9ubHkgc2hvd0hpc3RvcnlIaW50PzogKCkgPT4gYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEhpc3RvcnlJbnB1dEJveCBleHRlbmRzIElucHV0Qm94IGltcGxlbWVudHMgSUhpc3RvcnlOYXZpZ2F0aW9uV2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhpc3Rvcnk6IEhpc3RvcnlOYXZpZ2F0b3I8c3RyaW5nPjtcblx0cHJpdmF0ZSBvYnNlcnZlcjogTXV0YXRpb25PYnNlcnZlciB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLl9vbkRpZEZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQmx1ciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEJsdXIgPSB0aGlzLl9vbkRpZEJsdXIuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgY29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIgfCB1bmRlZmluZWQsIG9wdGlvbnM6IElIaXN0b3J5SW5wdXRPcHRpb25zKSB7XG5cdFx0Y29uc3QgTkxTX1BMQUNFSE9MREVSX0hJU1RPUllfSElOVF9TVUZGSVhfTk9fUEFSRU5TID0gbmxzLmxvY2FsaXplKHtcblx0XHRcdGtleTogJ2hpc3RvcnkuaW5wdXRib3guaGludC5zdWZmaXgubm9wYXJlbnMnLFxuXHRcdFx0Y29tbWVudDogWydUZXh0IGlzIHRoZSBzdWZmaXggb2YgYW4gaW5wdXQgZmllbGQgcGxhY2Vob2xkZXIgY29taW5nIGFmdGVyIHRoZSBhY3Rpb24gdGhlIGlucHV0IGZpZWxkIHBlcmZvcm1zLCB0aGlzIHdpbGwgYmUgdXNlZCB3aGVuIHRoZSBpbnB1dCBmaWVsZCBlbmRzIGluIGEgY2xvc2luZyBwYXJlbnRoZXNpcyBcIilcIiwgZm9yIGV4YW1wbGUgXCJGaWx0ZXIgKGUuZy4gdGV4dCwgIWV4Y2x1ZGUpXCIuIFRoZSBjaGFyYWN0ZXIgaW5zZXJ0ZWQgaW50byB0aGUgZmluYWwgc3RyaW5nIGlzIFxcdTIxQzUgdG8gcmVwcmVzZW50IHRoZSB1cCBhbmQgZG93biBhcnJvdyBrZXlzLiddXG5cdFx0fSwgJyBvciB7MH0gZm9yIGhpc3RvcnknLCBgXFx1MjFDNWApO1xuXHRcdGNvbnN0IE5MU19QTEFDRUhPTERFUl9ISVNUT1JZX0hJTlRfU1VGRklYX0lOX1BBUkVOUyA9IG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRrZXk6ICdoaXN0b3J5LmlucHV0Ym94LmhpbnQuc3VmZml4LmlucGFyZW5zJyxcblx0XHRcdGNvbW1lbnQ6IFsnVGV4dCBpcyB0aGUgc3VmZml4IG9mIGFuIGlucHV0IGZpZWxkIHBsYWNlaG9sZGVyIGNvbWluZyBhZnRlciB0aGUgYWN0aW9uIHRoZSBpbnB1dCBmaWVsZCBwZXJmb3JtcywgdGhpcyB3aWxsIGJlIHVzZWQgd2hlbiB0aGUgaW5wdXQgZmllbGQgZG9lcyBOT1QgZW5kIGluIGEgY2xvc2luZyBwYXJlbnRoZXNpcyAoZWcuIFwiRmluZFwiKS4gVGhlIGNoYXJhY3RlciBpbnNlcnRlZCBpbnRvIHRoZSBmaW5hbCBzdHJpbmcgaXMgXFx1MjFDNSB0byByZXByZXNlbnQgdGhlIHVwIGFuZCBkb3duIGFycm93IGtleXMuJ11cblx0XHR9LCAnICh7MH0gZm9yIGhpc3RvcnkpJywgYFxcdTIxQzVgKTtcblxuXHRcdHN1cGVyKGNvbnRhaW5lciwgY29udGV4dFZpZXdQcm92aWRlciwgb3B0aW9ucyk7XG5cdFx0dGhpcy5oaXN0b3J5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEhpc3RvcnlOYXZpZ2F0b3I8c3RyaW5nPihvcHRpb25zLmhpc3RvcnksIDEwMCkpO1xuXG5cdFx0Ly8gRnVuY3Rpb24gdG8gYXBwZW5kIHRoZSBoaXN0b3J5IHN1ZmZpeCB0byB0aGUgcGxhY2Vob2xkZXIgaWYgbmVjZXNzYXJ5XG5cdFx0Y29uc3QgYWRkU3VmZml4ID0gKCkgPT4ge1xuXHRcdFx0aWYgKG9wdGlvbnMuc2hvd0hpc3RvcnlIaW50ICYmIG9wdGlvbnMuc2hvd0hpc3RvcnlIaW50KCkgJiYgIXRoaXMucGxhY2Vob2xkZXIuZW5kc1dpdGgoTkxTX1BMQUNFSE9MREVSX0hJU1RPUllfSElOVF9TVUZGSVhfTk9fUEFSRU5TKSAmJiAhdGhpcy5wbGFjZWhvbGRlci5lbmRzV2l0aChOTFNfUExBQ0VIT0xERVJfSElTVE9SWV9ISU5UX1NVRkZJWF9JTl9QQVJFTlMpICYmIHRoaXMuaGlzdG9yeS5nZXRIaXN0b3J5KCkubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IHN1ZmZpeCA9IHRoaXMucGxhY2Vob2xkZXIuZW5kc1dpdGgoJyknKSA/IE5MU19QTEFDRUhPTERFUl9ISVNUT1JZX0hJTlRfU1VGRklYX05PX1BBUkVOUyA6IE5MU19QTEFDRUhPTERFUl9ISVNUT1JZX0hJTlRfU1VGRklYX0lOX1BBUkVOUztcblx0XHRcdFx0Y29uc3Qgc3VmZml4ZWRQbGFjZWhvbGRlciA9IHRoaXMucGxhY2Vob2xkZXIgKyBzdWZmaXg7XG5cdFx0XHRcdGlmIChvcHRpb25zLnNob3dQbGFjZWhvbGRlck9uRm9jdXMgJiYgIWRvbS5pc0FjdGl2ZUVsZW1lbnQodGhpcy5pbnB1dCkpIHtcblx0XHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gc3VmZml4ZWRQbGFjZWhvbGRlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNldFBsYWNlSG9sZGVyKHN1ZmZpeGVkUGxhY2Vob2xkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIFNwb3QgdGhlIGNoYW5nZSB0byB0aGUgdGV4dGFyZWEgY2xhc3MgYXR0cmlidXRlIHdoaWNoIG9jY3VycyB3aGVuIGl0IGNoYW5nZXMgYmV0d2VlbiBub24tZW1wdHkgYW5kIGVtcHR5LFxuXHRcdC8vIGFuZCBhZGQgdGhlIGhpc3Rvcnkgc3VmZml4IHRvIHRoZSBwbGFjZWhvbGRlciBpZiBub3QgeWV0IHByZXNlbnRcblx0XHR0aGlzLm9ic2VydmVyID0gbmV3IE11dGF0aW9uT2JzZXJ2ZXIoKG11dGF0aW9uTGlzdDogTXV0YXRpb25SZWNvcmRbXSwgb2JzZXJ2ZXI6IE11dGF0aW9uT2JzZXJ2ZXIpID0+IHtcblx0XHRcdG11dGF0aW9uTGlzdC5mb3JFYWNoKChtdXRhdGlvbjogTXV0YXRpb25SZWNvcmQpID0+IHtcblx0XHRcdFx0aWYgKCFtdXRhdGlvbi50YXJnZXQudGV4dENvbnRlbnQpIHtcblx0XHRcdFx0XHRhZGRTdWZmaXgoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdFx0dGhpcy5vYnNlcnZlci5vYnNlcnZlKHRoaXMuaW5wdXQsIHsgYXR0cmlidXRlRmlsdGVyOiBbJ2NsYXNzJ10gfSk7XG5cblx0XHR0aGlzLm9uZm9jdXModGhpcy5pbnB1dCwgKCkgPT4gYWRkU3VmZml4KCkpO1xuXHRcdHRoaXMub25ibHVyKHRoaXMuaW5wdXQsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc2V0UGxhY2Vob2xkZXIgPSAoaGlzdG9yeUhpbnQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMucGxhY2Vob2xkZXIuZW5kc1dpdGgoaGlzdG9yeUhpbnQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHJldmVydGVkUGxhY2Vob2xkZXIgPSB0aGlzLnBsYWNlaG9sZGVyLnNsaWNlKDAsIHRoaXMucGxhY2Vob2xkZXIubGVuZ3RoIC0gaGlzdG9yeUhpbnQubGVuZ3RoKTtcblx0XHRcdFx0XHRpZiAob3B0aW9ucy5zaG93UGxhY2Vob2xkZXJPbkZvY3VzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gcmV2ZXJ0ZWRQbGFjZWhvbGRlcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldFBsYWNlSG9sZGVyKHJldmVydGVkUGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGlmICghcmVzZXRQbGFjZWhvbGRlcihOTFNfUExBQ0VIT0xERVJfSElTVE9SWV9ISU5UX1NVRkZJWF9JTl9QQVJFTlMpKSB7XG5cdFx0XHRcdHJlc2V0UGxhY2Vob2xkZXIoTkxTX1BMQUNFSE9MREVSX0hJU1RPUllfSElOVF9TVUZGSVhfTk9fUEFSRU5TKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKSB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdGlmICh0aGlzLm9ic2VydmVyKSB7XG5cdFx0XHR0aGlzLm9ic2VydmVyLmRpc2Nvbm5lY3QoKTtcblx0XHRcdHRoaXMub2JzZXJ2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFkZFRvSGlzdG9yeShhbHdheXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMudmFsdWUgJiYgKGFsd2F5cyB8fCB0aGlzLnZhbHVlICE9PSB0aGlzLmdldEN1cnJlbnRWYWx1ZSgpKSkge1xuXHRcdFx0dGhpcy5oaXN0b3J5LmFkZCh0aGlzLnZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgcHJlcGVuZEhpc3RvcnkocmVzdG9yZWRIaXN0b3J5OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0hpc3RvcnkgPSB0aGlzLmdldEhpc3RvcnkoKTtcblx0XHR0aGlzLmNsZWFySGlzdG9yeSgpO1xuXG5cdFx0cmVzdG9yZWRIaXN0b3J5LmZvckVhY2goKGl0ZW0pID0+IHtcblx0XHRcdHRoaXMuaGlzdG9yeS5hZGQoaXRlbSk7XG5cdFx0fSk7XG5cblx0XHRuZXdIaXN0b3J5LmZvckVhY2goaXRlbSA9PiB7XG5cdFx0XHR0aGlzLmhpc3RvcnkuYWRkKGl0ZW0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldEhpc3RvcnkoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmhpc3RvcnkuZ2V0SGlzdG9yeSgpO1xuXHR9XG5cblx0cHVibGljIGlzQXRGaXJzdEluSGlzdG9yeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5oaXN0b3J5LmlzRmlyc3QoKTtcblx0fVxuXG5cdHB1YmxpYyBpc0F0TGFzdEluSGlzdG9yeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5oaXN0b3J5LmlzTGFzdCgpO1xuXHR9XG5cblx0cHVibGljIGlzTm93aGVyZUluSGlzdG9yeSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5oaXN0b3J5LmlzTm93aGVyZSgpO1xuXHR9XG5cblx0cHVibGljIHNob3dOZXh0VmFsdWUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhpc3RvcnkuaGFzKHRoaXMudmFsdWUpKSB7XG5cdFx0XHR0aGlzLmFkZFRvSGlzdG9yeSgpO1xuXHRcdH1cblxuXHRcdGxldCBuZXh0ID0gdGhpcy5nZXROZXh0VmFsdWUoKTtcblx0XHRpZiAobmV4dCkge1xuXHRcdFx0bmV4dCA9IG5leHQgPT09IHRoaXMudmFsdWUgPyB0aGlzLmdldE5leHRWYWx1ZSgpIDogbmV4dDtcblx0XHR9XG5cblx0XHR0aGlzLnZhbHVlID0gbmV4dCA/PyAnJztcblx0XHRhcmlhLnN0YXR1cyh0aGlzLnZhbHVlID8gdGhpcy52YWx1ZSA6IG5scy5sb2NhbGl6ZSgnY2xlYXJlZElucHV0JywgXCJDbGVhcmVkIElucHV0XCIpKTtcblx0fVxuXG5cdHB1YmxpYyBzaG93UHJldmlvdXNWYWx1ZSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaGlzdG9yeS5oYXModGhpcy52YWx1ZSkpIHtcblx0XHRcdHRoaXMuYWRkVG9IaXN0b3J5KCk7XG5cdFx0fVxuXG5cdFx0bGV0IHByZXZpb3VzID0gdGhpcy5nZXRQcmV2aW91c1ZhbHVlKCk7XG5cdFx0aWYgKHByZXZpb3VzKSB7XG5cdFx0XHRwcmV2aW91cyA9IHByZXZpb3VzID09PSB0aGlzLnZhbHVlID8gdGhpcy5nZXRQcmV2aW91c1ZhbHVlKCkgOiBwcmV2aW91cztcblx0XHR9XG5cblx0XHRpZiAocHJldmlvdXMpIHtcblx0XHRcdHRoaXMudmFsdWUgPSBwcmV2aW91cztcblx0XHRcdGFyaWEuc3RhdHVzKHRoaXMudmFsdWUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjbGVhckhpc3RvcnkoKTogdm9pZCB7XG5cdFx0dGhpcy5oaXN0b3J5LmNsZWFyKCk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgc2V0UGxhY2VIb2xkZXIocGxhY2VIb2xkZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHN1cGVyLnNldFBsYWNlSG9sZGVyKHBsYWNlSG9sZGVyKTtcblx0XHR0aGlzLnNldFRvb2x0aXAocGxhY2VIb2xkZXIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uQmx1cigpOiB2b2lkIHtcblx0XHRzdXBlci5vbkJsdXIoKTtcblx0XHR0aGlzLl9vbkRpZEJsdXIuZmlyZSgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uRm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIub25Gb2N1cygpO1xuXHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXJyZW50VmFsdWUoKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0bGV0IGN1cnJlbnRWYWx1ZSA9IHRoaXMuaGlzdG9yeS5jdXJyZW50KCk7XG5cdFx0aWYgKCFjdXJyZW50VmFsdWUpIHtcblx0XHRcdGN1cnJlbnRWYWx1ZSA9IHRoaXMuaGlzdG9yeS5sYXN0KCk7XG5cdFx0XHR0aGlzLmhpc3RvcnkubmV4dCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gY3VycmVudFZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcmV2aW91c1ZhbHVlKCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmhpc3RvcnkucHJldmlvdXMoKSB8fCB0aGlzLmhpc3RvcnkuZmlyc3QoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TmV4dFZhbHVlKCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLmhpc3RvcnkubmV4dCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCLGtCQUFrQjtBQUVoRCxTQUFTLGlCQUEwQztBQUNuRCxZQUFZLFVBQVU7QUFDdEIsU0FBUyx1QkFBNkM7QUFDdEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxjQUFjO0FBRXZCLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsd0JBQWtDO0FBQzNDLFNBQVMsY0FBYztBQUN2QixTQUFTLDJCQUEyQjtBQUNwQyxPQUFPO0FBQ1AsWUFBWSxTQUFTO0FBQ3JCLFNBQVMseUJBQTJDO0FBR3BELE1BQU0sSUFBSSxJQUFJO0FBZ0RQLElBQVcsY0FBWCxrQkFBV0EsaUJBQVg7QUFDTixFQUFBQSwwQkFBQSxVQUFPLEtBQVA7QUFDQSxFQUFBQSwwQkFBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSwwQkFBQSxXQUFRLEtBQVI7QUFIaUIsU0FBQUE7QUFBQSxHQUFBO0FBV1gsTUFBTSxzQkFBdUM7QUFBQSxFQUNu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
