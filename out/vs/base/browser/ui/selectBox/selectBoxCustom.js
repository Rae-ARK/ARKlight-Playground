import { localize } from "../../../../nls.js";
import * as arrays from "../../../common/arrays.js";
import { Emitter, Event } from "../../../common/event.js";
import { KeyCode, KeyCodeUtils } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import { ScrollbarVisibility } from "../../../common/scrollable.js";
import * as cssJs from "../../cssValue.js";
import * as dom from "../../dom.js";
import * as domStylesheetsJs from "../../domStylesheets.js";
import { DomEmitter } from "../../event.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { renderMarkdown } from "../../markdownRenderer.js";
import { AnchorPosition } from "../contextview/contextview.js";
import { getBaseLayerHoverDelegate } from "../hover/hoverDelegate2.js";
import { getDefaultHoverDelegate } from "../hover/hoverDelegateFactory.js";
import { List } from "../list/listWidget.js";
import "./selectBoxCustom.css";
const $ = dom.$;
const SELECT_OPTION_ENTRY_TEMPLATE_ID = "selectOption.entry.template";
class SelectListRenderer {
  get templateId() {
    return SELECT_OPTION_ENTRY_TEMPLATE_ID;
  }
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.root = container;
    data.text = dom.append(container, $(".option-text"));
    data.detail = dom.append(container, $(".option-detail"));
    data.decoratorRight = dom.append(container, $(".option-decorator-right"));
    return data;
  }
  renderElement(element, index, templateData) {
    const data = templateData;
    const text = element.text;
    const detail = element.detail;
    const decoratorRight = element.decoratorRight;
    const isDisabled = element.isDisabled;
    data.text.textContent = text;
    data.detail.textContent = !!detail ? detail : "";
    data.decoratorRight.textContent = !!decoratorRight ? decoratorRight : "";
    if (isDisabled) {
      data.root.classList.add("option-disabled");
    } else {
      data.root.classList.remove("option-disabled");
    }
    if (element.isSeparator) {
      data.root.classList.add("option-separator");
      data.root.classList.add("option-disabled");
    } else {
      data.root.classList.remove("option-separator");
    }
  }
  disposeTemplate(_templateData) {
  }
}
const _SelectBoxList = class _SelectBoxList extends Disposable {
  // for dev purposes only
  constructor(options, selected, contextViewProvider, styles, selectBoxOptions) {
    super();
    this.options = [];
    this._currentSelection = 0;
    this._hasDetails = false;
    this._selectionDetailsDisposables = this._register(new DisposableStore());
    this._skipLayout = false;
    this._sticky = false;
    this._isVisible = false;
    this.styles = styles;
    this.selectBoxOptions = selectBoxOptions || /* @__PURE__ */ Object.create(null);
    if (typeof this.selectBoxOptions.minBottomMargin !== "number") {
      this.selectBoxOptions.minBottomMargin = _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_BOTTOM_MARGIN;
    } else if (this.selectBoxOptions.minBottomMargin < 0) {
      this.selectBoxOptions.minBottomMargin = 0;
    }
    this.selectElement = document.createElement("select");
    this.selectElement.className = "monaco-select-box";
    if (typeof this.selectBoxOptions.ariaLabel === "string") {
      this.selectElement.setAttribute("aria-label", this.selectBoxOptions.ariaLabel);
    }
    if (typeof this.selectBoxOptions.ariaDescription === "string") {
      this.selectElement.setAttribute("aria-description", this.selectBoxOptions.ariaDescription);
    }
    this._onDidSelect = new Emitter();
    this._register(this._onDidSelect);
    this.registerListeners();
    this.constructSelectDropDown(contextViewProvider);
    this.selected = selected || 0;
    if (options) {
      this.setOptions(options, selected);
    }
    this.initStyleSheet();
  }
  setTitle(title) {
    if (!this._hover && title) {
      this._hover = this._register(getBaseLayerHoverDelegate().setupManagedHover(getDefaultHoverDelegate("mouse"), this.selectElement, title));
    } else if (this._hover) {
      this._hover.update(title);
    }
  }
  // IDelegate - List renderer
  getHeight() {
    return 22;
  }
  getTemplateId() {
    return SELECT_OPTION_ENTRY_TEMPLATE_ID;
  }
  constructSelectDropDown(contextViewProvider) {
    this.contextViewProvider = contextViewProvider;
    this.selectDropDownContainer = dom.$(".monaco-select-box-dropdown-container");
    this.selectionDetailsPane = dom.append(this.selectDropDownContainer, $(".select-box-details-pane"));
    const widthControlOuterDiv = dom.append(this.selectDropDownContainer, $(".select-box-dropdown-container-width-control"));
    const widthControlInnerDiv = dom.append(widthControlOuterDiv, $(".width-control-div"));
    this.widthControlElement = document.createElement("span");
    this.widthControlElement.className = "option-text-width-control";
    dom.append(widthControlInnerDiv, this.widthControlElement);
    this._dropDownPosition = AnchorPosition.BELOW;
    this.styleElement = domStylesheetsJs.createStyleSheet(this.selectDropDownContainer);
    this.selectDropDownContainer.setAttribute("draggable", "true");
    this._register(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.DRAG_START, (e) => {
      dom.EventHelper.stop(e, true);
    }));
  }
  registerListeners() {
    this._register(dom.addStandardDisposableListener(this.selectElement, "change", (e) => {
      this.selected = e.target.selectedIndex;
      this._onDidSelect.fire({
        index: e.target.selectedIndex,
        selected: e.target.value
      });
      if (!!this.options[this.selected] && !!this.options[this.selected].text) {
        this.setTitle(this.options[this.selected].text);
      }
    }));
    this._register(dom.addDisposableListener(this.selectElement, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e);
      if (this._isVisible) {
        this.hideSelectDropDown(true);
      } else {
        this.showSelectDropDown();
      }
    }));
    this._register(dom.addDisposableListener(this.selectElement, dom.EventType.MOUSE_DOWN, (e) => {
      dom.EventHelper.stop(e);
    }));
    let listIsVisibleOnTouchStart;
    this._register(dom.addDisposableListener(this.selectElement, "touchstart", (e) => {
      listIsVisibleOnTouchStart = this._isVisible;
    }));
    this._register(dom.addDisposableListener(this.selectElement, "touchend", (e) => {
      dom.EventHelper.stop(e);
      if (listIsVisibleOnTouchStart) {
        this.hideSelectDropDown(true);
      } else {
        this.showSelectDropDown();
      }
    }));
    this._register(dom.addDisposableListener(this.selectElement, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      let showDropDown = false;
      if (isMacintosh) {
        if (event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
          showDropDown = true;
        }
      } else {
        if (event.keyCode === KeyCode.DownArrow && event.altKey || event.keyCode === KeyCode.UpArrow && event.altKey || event.keyCode === KeyCode.Space || event.keyCode === KeyCode.Enter) {
          showDropDown = true;
        }
      }
      if (showDropDown) {
        this.showSelectDropDown();
        dom.EventHelper.stop(e, true);
      }
    }));
  }
  get onDidSelect() {
    return this._onDidSelect.event;
  }
  setOptions(options, selected) {
    if (!arrays.equals(this.options, options)) {
      this.options = options;
      this.selectElement.options.length = 0;
      this._hasDetails = false;
      this._cachedMaxDetailsHeight = void 0;
      this.options.forEach((option, index) => {
        this.selectElement.add(this.createOption(option.text, index, option.isDisabled));
        if (typeof option.description === "string") {
          this._hasDetails = true;
        }
      });
    }
    if (selected !== void 0) {
      this.select(selected);
      this._currentSelection = this.selected;
    }
  }
  setEnabled(enable) {
    this.selectElement.disabled = !enable;
  }
  setOptionsList() {
    this.selectList?.splice(0, this.selectList.length, this.options);
  }
  select(index) {
    if (index >= 0 && index < this.options.length) {
      this.selected = index;
    } else if (index > this.options.length - 1) {
      this.select(this.options.length - 1);
    } else if (this.selected < 0) {
      this.selected = 0;
    }
    this.selectElement.selectedIndex = this.selected;
    if (!!this.options[this.selected] && !!this.options[this.selected].text) {
      this.setTitle(this.options[this.selected].text);
    }
  }
  setAriaLabel(label) {
    this.selectBoxOptions.ariaLabel = label;
    this.selectElement.setAttribute("aria-label", this.selectBoxOptions.ariaLabel);
  }
  focus() {
    if (this.selectElement) {
      this.selectElement.tabIndex = 0;
      this.selectElement.focus();
    }
  }
  blur() {
    if (this.selectElement) {
      this.selectElement.tabIndex = -1;
      this.selectElement.blur();
    }
  }
  setFocusable(focusable) {
    this.selectElement.tabIndex = focusable ? 0 : -1;
  }
  render(container) {
    this.container = container;
    container.classList.add("select-container");
    container.appendChild(this.selectElement);
    this.styleSelectElement();
  }
  initStyleSheet() {
    const content = [];
    if (this.styles.listFocusBackground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { background-color: ${this.styles.listFocusBackground} !important; }`);
    }
    if (this.styles.listFocusForeground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { color: ${this.styles.listFocusForeground} !important; }`);
    }
    if (this.styles.decoratorRightForeground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.focused) .option-decorator-right { color: ${this.styles.decoratorRightForeground}; }`);
    }
    if (this.styles.selectBackground && this.styles.selectBorder && this.styles.selectBorder !== this.styles.selectBackground) {
      content.push(`.monaco-select-box-dropdown-container { border: 1px solid ${this.styles.selectBorder} } `);
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-top { border-top: 1px solid ${this.styles.selectBorder} } `);
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-bottom { border-bottom: 1px solid ${this.styles.selectBorder} } `);
    } else if (this.styles.selectListBorder) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-top { border-top: 1px solid ${this.styles.selectListBorder} } `);
      content.push(`.monaco-select-box-dropdown-container > .select-box-details-pane.border-bottom { border-bottom: 1px solid ${this.styles.selectListBorder} } `);
    }
    if (this.styles.listHoverForeground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { color: ${this.styles.listHoverForeground} !important; }`);
    }
    if (this.styles.listHoverBackground) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { background-color: ${this.styles.listHoverBackground} !important; }`);
    }
    if (this.styles.listFocusOutline) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.focused { outline: 1px solid ${this.styles.listFocusOutline} !important; outline-offset: -1px !important; }`);
    }
    if (this.styles.listHoverOutline) {
      content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row:not(.option-disabled):not(.focused):hover { outline: 1px solid ${this.styles.listHoverOutline} !important; outline-offset: -1px !important; }`);
    }
    content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled.focused { background-color: transparent !important; color: inherit !important; outline: none !important; }`);
    content.push(`.monaco-select-box-dropdown-container > .select-box-dropdown-list-container .monaco-list .monaco-list-row.option-disabled:hover { background-color: transparent !important; color: inherit !important; outline: none !important; }`);
    this.styleElement.textContent = content.join("\n");
  }
  styleSelectElement() {
    const background = this.styles.selectBackground ?? "";
    const foreground = this.styles.selectForeground ?? "";
    const border = this.styles.selectBorder ?? "";
    this.selectElement.style.backgroundColor = background;
    this.selectElement.style.color = foreground;
    this.selectElement.style.borderColor = border;
  }
  styleList() {
    const background = this.styles.selectBackground ?? "";
    const listBackground = cssJs.asCssValueWithDefault(this.styles.selectListBackground, background);
    this.selectDropDownContainer.style.backgroundColor = listBackground;
    this.selectDropDownListContainer.style.backgroundColor = listBackground;
    this.selectionDetailsPane.style.backgroundColor = listBackground;
    this.selectList.style(this.styles);
  }
  createOption(value, index, disabled) {
    const option = document.createElement("option");
    option.value = value;
    option.text = value;
    option.disabled = !!disabled;
    return option;
  }
  // ContextView dropdown methods
  showSelectDropDown() {
    this.selectionDetailsPane.textContent = "";
    if (!this.contextViewProvider || this._isVisible) {
      return;
    }
    this.createSelectList(this.selectDropDownContainer);
    this.setOptionsList();
    this.contextViewProvider.showContextView({
      getAnchor: () => this.selectElement,
      render: (container) => this.renderSelectDropDown(container, true),
      layout: () => {
        this.layoutSelectDropDown();
      },
      onHide: () => {
        this.selectDropDownContainer.classList.remove("visible");
      },
      anchorPosition: this._dropDownPosition
    }, this.selectBoxOptions.optionsAsChildren ? this.container : void 0);
    this._isVisible = true;
    this.hideSelectDropDown(false);
    this.contextViewProvider.showContextView({
      getAnchor: () => this.selectElement,
      render: (container) => this.renderSelectDropDown(container),
      layout: () => this.layoutSelectDropDown(),
      onHide: () => {
        this.selectDropDownContainer.classList.remove("visible");
      },
      anchorPosition: this._dropDownPosition
    }, this.selectBoxOptions.optionsAsChildren ? this.container : void 0);
    this._currentSelection = this.selected;
    this._isVisible = true;
    this.selectElement.setAttribute("aria-expanded", "true");
  }
  hideSelectDropDown(focusSelect) {
    if (!this.contextViewProvider || !this._isVisible) {
      return;
    }
    this._isVisible = false;
    this.selectElement.setAttribute("aria-expanded", "false");
    if (focusSelect) {
      this.selectElement.focus();
    }
    this.contextViewProvider.hideContextView();
  }
  renderSelectDropDown(container, preLayoutPosition) {
    container.appendChild(this.selectDropDownContainer);
    const computedFontSize = dom.getWindow(this.selectElement).getComputedStyle(this.selectElement).fontSize;
    if (computedFontSize) {
      this.selectDropDownContainer.style.fontSize = computedFontSize;
    }
    this.layoutSelectDropDown(preLayoutPosition);
    return {
      dispose: () => {
        this.selectDropDownContainer.remove();
      }
    };
  }
  // Iterate over detailed descriptions, find max height
  measureMaxDetailsHeight() {
    let maxDetailsPaneHeight = 0;
    this.options.forEach((_option, index) => {
      this.updateDetail(index);
      if (this.selectionDetailsPane.offsetHeight > maxDetailsPaneHeight) {
        maxDetailsPaneHeight = this.selectionDetailsPane.offsetHeight;
      }
    });
    return maxDetailsPaneHeight;
  }
  layoutSelectDropDown(preLayoutPosition) {
    if (this._skipLayout) {
      return false;
    }
    if (this.selectList) {
      this.selectDropDownContainer.classList.add("visible");
      const window = dom.getWindow(this.selectElement);
      const selectPosition = dom.getDomNodePagePosition(this.selectElement);
      const maxSelectDropDownHeightBelow = window.innerHeight - selectPosition.top - selectPosition.height - (this.selectBoxOptions.minBottomMargin || 0);
      const maxSelectDropDownHeightAbove = selectPosition.top - _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN;
      const selectWidth = this.selectElement.offsetWidth;
      const selectMinWidth = this.setWidthControlElement(this.widthControlElement);
      const selectOptimalWidth = `${Math.max(selectMinWidth, Math.round(selectWidth))}px`;
      this.selectDropDownContainer.style.width = selectOptimalWidth;
      this.selectList.getHTMLElement().style.height = "";
      this.selectList.layout();
      let listHeight = this.selectList.contentHeight;
      if (this._hasDetails && this._cachedMaxDetailsHeight === void 0) {
        this._cachedMaxDetailsHeight = this.measureMaxDetailsHeight();
      }
      const maxDetailsPaneHeight = this._hasDetails ? this._cachedMaxDetailsHeight : 0;
      const minRequiredDropDownHeight = listHeight + maxDetailsPaneHeight;
      const maxVisibleOptionsBelow = Math.floor((maxSelectDropDownHeightBelow - maxDetailsPaneHeight) / this.getHeight());
      const maxVisibleOptionsAbove = Math.floor((maxSelectDropDownHeightAbove - maxDetailsPaneHeight) / this.getHeight());
      if (preLayoutPosition) {
        if (selectPosition.top + selectPosition.height > window.innerHeight - 22 || selectPosition.top < _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN || maxVisibleOptionsBelow < 1 && maxVisibleOptionsAbove < 1) {
          return false;
        }
        if (maxVisibleOptionsBelow < _SelectBoxList.DEFAULT_MINIMUM_VISIBLE_OPTIONS && maxVisibleOptionsAbove > maxVisibleOptionsBelow && this.options.length > maxVisibleOptionsBelow) {
          this._dropDownPosition = AnchorPosition.ABOVE;
          this.selectDropDownListContainer.remove();
          this.selectionDetailsPane.remove();
          this.selectDropDownContainer.appendChild(this.selectionDetailsPane);
          this.selectDropDownContainer.appendChild(this.selectDropDownListContainer);
          this.selectionDetailsPane.classList.remove("border-top");
          this.selectionDetailsPane.classList.add("border-bottom");
        } else {
          this._dropDownPosition = AnchorPosition.BELOW;
          this.selectDropDownListContainer.remove();
          this.selectionDetailsPane.remove();
          this.selectDropDownContainer.appendChild(this.selectDropDownListContainer);
          this.selectDropDownContainer.appendChild(this.selectionDetailsPane);
          this.selectionDetailsPane.classList.remove("border-bottom");
          this.selectionDetailsPane.classList.add("border-top");
        }
        return true;
      }
      if (selectPosition.top + selectPosition.height > window.innerHeight - 22 || selectPosition.top < _SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN || this._dropDownPosition === AnchorPosition.BELOW && maxVisibleOptionsBelow < 1 || this._dropDownPosition === AnchorPosition.ABOVE && maxVisibleOptionsAbove < 1) {
        this.hideSelectDropDown(true);
        return false;
      }
      if (this._dropDownPosition === AnchorPosition.BELOW) {
        if (this._isVisible && maxVisibleOptionsBelow + maxVisibleOptionsAbove < 1) {
          this.hideSelectDropDown(true);
          return false;
        }
        if (minRequiredDropDownHeight > maxSelectDropDownHeightBelow) {
          listHeight = maxVisibleOptionsBelow * this.getHeight();
        }
      } else {
        if (minRequiredDropDownHeight > maxSelectDropDownHeightAbove) {
          listHeight = maxVisibleOptionsAbove * this.getHeight();
        }
      }
      this.selectList.layout(listHeight);
      this.selectList.domFocus();
      if (this.selectList.length > 0) {
        this.selectList.setFocus([this.selected || 0]);
        this.selectList.reveal(this.selectList.getFocus()[0] || 0);
      }
      if (this._hasDetails) {
        this.selectList.getHTMLElement().style.height = `${listHeight}px`;
        this.selectDropDownContainer.style.height = "";
      } else {
        this.selectDropDownContainer.style.height = `${listHeight}px`;
      }
      this.updateDetail(this.selected);
      this.selectDropDownContainer.style.width = selectOptimalWidth;
      this.selectDropDownListContainer.setAttribute("tabindex", "0");
      return true;
    } else {
      return false;
    }
  }
  setWidthControlElement(container) {
    let elementWidth = 0;
    if (container) {
      let longest = 0;
      let longestLength = 0;
      this.options.forEach((option, index) => {
        const detailLength = !!option.detail ? option.detail.length : 0;
        const rightDecoratorLength = !!option.decoratorRight ? option.decoratorRight.length : 0;
        const len = option.text.length + detailLength + rightDecoratorLength;
        if (len > longestLength) {
          longest = index;
          longestLength = len;
        }
      });
      container.textContent = this.options[longest].text + (!!this.options[longest].decoratorRight ? `${this.options[longest].decoratorRight} ` : "");
      elementWidth = dom.getTotalWidth(container);
    }
    return elementWidth;
  }
  createSelectList(parent) {
    if (this.selectList) {
      return;
    }
    this.selectDropDownListContainer = dom.append(parent, $(".select-box-dropdown-list-container"));
    this.listRenderer = new SelectListRenderer();
    this.selectList = this._register(new List("SelectBoxCustom", this.selectDropDownListContainer, this, [this.listRenderer], {
      useShadows: false,
      verticalScrollMode: ScrollbarVisibility.Visible,
      keyboardSupport: false,
      mouseSupport: false,
      accessibilityProvider: {
        getAriaLabel: (element) => {
          if (element.isSeparator) {
            return localize("selectBoxSeparator", "separator");
          }
          let label = element.text;
          if (element.detail) {
            label += `. ${element.detail}`;
          }
          if (element.decoratorRight) {
            label += `. ${element.decoratorRight}`;
          }
          if (element.description) {
            label += `. ${element.description}`;
          }
          return label;
        },
        getWidgetAriaLabel: () => localize({ key: "selectBox", comment: ["Behave like native select dropdown element."] }, "Select Box"),
        getRole: () => isMacintosh ? "" : "option",
        getWidgetRole: () => "listbox"
      }
    }));
    if (this.selectBoxOptions.ariaLabel) {
      this.selectList.ariaLabel = this.selectBoxOptions.ariaLabel;
    }
    const onKeyDown = this._register(new DomEmitter(this.selectDropDownListContainer, "keydown"));
    const onSelectDropDownKeyDown = Event.chain(
      onKeyDown.event,
      ($2) => $2.filter(() => this.selectList.length > 0).map((e) => new StandardKeyboardEvent(e))
    );
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Enter))(this.onEnter, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Tab))(this.onEnter, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Escape))(this.onEscape, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.UpArrow))(this.onUpArrow, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.DownArrow))(this.onDownArrow, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.PageDown))(this.onPageDown, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.PageUp))(this.onPageUp, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Home))(this.onHome, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.End))(this.onEnd, this));
    this._register(Event.chain(onSelectDropDownKeyDown, ($2) => $2.filter((e) => e.keyCode >= KeyCode.Digit0 && e.keyCode <= KeyCode.KeyZ || e.keyCode >= KeyCode.Semicolon && e.keyCode <= KeyCode.NumpadDivide))(this.onCharacter, this));
    this._register(dom.addDisposableListener(this.selectList.getHTMLElement(), dom.EventType.POINTER_UP, (e) => this.onPointerUp(e)));
    this._register(this.selectList.onMouseOver((e) => typeof e.index !== "undefined" && !this.options[e.index]?.isDisabled && this.selectList.setFocus([e.index])));
    this._register(this.selectList.onDidChangeFocus((e) => this.onListFocus(e)));
    this._register(dom.addDisposableListener(this.selectDropDownContainer, dom.EventType.FOCUS_OUT, (e) => {
      if (!this._isVisible || dom.isAncestor(e.relatedTarget, this.selectDropDownContainer)) {
        return;
      }
      this.onListBlur();
    }));
    this.selectList.getHTMLElement().setAttribute("aria-label", this.selectBoxOptions.ariaLabel || "");
    this.selectList.getHTMLElement().setAttribute("aria-expanded", "true");
    this.styleList();
  }
  // List methods
  // List mouse controller - active exit, select option, fire onDidSelect if change, return focus to parent select
  // Also takes in touchend events
  onPointerUp(e) {
    if (!this.selectList.length) {
      return;
    }
    dom.EventHelper.stop(e);
    const target = e.target;
    if (!target) {
      return;
    }
    if (target.classList.contains("slider")) {
      return;
    }
    const listRowElement = target.closest(".monaco-list-row");
    if (!listRowElement) {
      return;
    }
    const index = Number(listRowElement.getAttribute("data-index"));
    const disabled = listRowElement.classList.contains("option-disabled");
    if (index >= 0 && index < this.options.length && !disabled) {
      this.selected = index;
      this.select(this.selected);
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selectList.getFocus()[0]);
      if (this.selected !== this._currentSelection) {
        this._currentSelection = this.selected;
        this._onDidSelect.fire({
          index: this.selectElement.selectedIndex,
          selected: this.options[this.selected].text
        });
        if (!!this.options[this.selected] && !!this.options[this.selected].text) {
          this.setTitle(this.options[this.selected].text);
        }
      }
      this.hideSelectDropDown(true);
    }
  }
  // List Exit - passive - implicit no selection change, hide drop-down
  onListBlur() {
    if (this._sticky) {
      return;
    }
    if (this.selected !== this._currentSelection) {
      this.select(this._currentSelection);
    }
    this.hideSelectDropDown(false);
  }
  renderDescriptionMarkdown(text, actionHandler) {
    const cleanRenderedMarkdown = (element) => {
      for (let i = 0; i < element.childNodes.length; i++) {
        const child = element.childNodes.item(i);
        const tagName = child.tagName && child.tagName.toLowerCase();
        if (tagName === "img") {
          child.remove();
        } else {
          cleanRenderedMarkdown(child);
        }
      }
    };
    const rendered = renderMarkdown({ value: text, supportThemeIcons: true }, { actionHandler });
    rendered.element.classList.add("select-box-description-markdown");
    cleanRenderedMarkdown(rendered.element);
    return rendered;
  }
  // List Focus Change - passive - update details pane with newly focused element's data
  onListFocus(e) {
    if (!this._isVisible || !this._hasDetails) {
      return;
    }
    this.updateDetail(e.indexes[0]);
  }
  updateDetail(selectedIndex) {
    this._selectionDetailsDisposables.clear();
    this.selectionDetailsPane.textContent = "";
    const option = this.options[selectedIndex];
    const description = option?.description ?? "";
    const descriptionIsMarkdown = option?.descriptionIsMarkdown ?? false;
    if (description) {
      if (descriptionIsMarkdown) {
        const actionHandler = option.descriptionMarkdownActionHandler;
        const result = this._selectionDetailsDisposables.add(this.renderDescriptionMarkdown(description, actionHandler));
        this.selectionDetailsPane.appendChild(result.element);
      } else {
        this.selectionDetailsPane.textContent = description;
      }
      this.selectionDetailsPane.style.display = "block";
    } else {
      this.selectionDetailsPane.style.display = "none";
    }
    this._skipLayout = true;
    this.contextViewProvider.layout();
    this._skipLayout = false;
  }
  // List keyboard controller
  // List exit - active - hide ContextView dropdown, reset selection, return focus to parent select
  onEscape(e) {
    dom.EventHelper.stop(e);
    this.select(this._currentSelection);
    this.hideSelectDropDown(true);
  }
  // List exit - active - hide ContextView dropdown, return focus to parent select, fire onDidSelect if change
  onEnter(e) {
    dom.EventHelper.stop(e);
    if (this.options[this.selected]?.isDisabled) {
      this.hideSelectDropDown(true);
      return;
    }
    if (this.selected !== this._currentSelection) {
      this._currentSelection = this.selected;
      this._onDidSelect.fire({
        index: this.selectElement.selectedIndex,
        selected: this.options[this.selected].text
      });
      if (!!this.options[this.selected] && !!this.options[this.selected].text) {
        this.setTitle(this.options[this.selected].text);
      }
    }
    this.hideSelectDropDown(true);
  }
  // List navigation - have to handle disabled options (jump over)
  onDownArrow(e) {
    if (this.selected < this.options.length - 1) {
      dom.EventHelper.stop(e, true);
      let next = this.selected + 1;
      while (next < this.options.length && this.options[next].isDisabled) {
        next++;
      }
      if (next >= this.options.length) {
        return;
      }
      this.selected = next;
      this.select(this.selected);
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selectList.getFocus()[0]);
    }
  }
  onUpArrow(e) {
    if (this.selected > 0) {
      dom.EventHelper.stop(e, true);
      let prev = this.selected - 1;
      while (prev >= 0 && this.options[prev].isDisabled) {
        prev--;
      }
      if (prev < 0) {
        return;
      }
      this.selected = prev;
      this.select(this.selected);
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selectList.getFocus()[0]);
    }
  }
  onPageUp(e) {
    dom.EventHelper.stop(e);
    this.selectList.focusPreviousPage();
    setTimeout(() => {
      let candidate = this.selectList.getFocus()[0];
      while (candidate > 0 && this.options[candidate].isDisabled) {
        candidate--;
      }
      if (this.options[candidate].isDisabled) {
        return;
      }
      this.selected = candidate;
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selected);
      this.select(this.selected);
    }, 1);
  }
  onPageDown(e) {
    dom.EventHelper.stop(e);
    this.selectList.focusNextPage();
    setTimeout(() => {
      let candidate = this.selectList.getFocus()[0];
      while (candidate < this.options.length - 1 && this.options[candidate].isDisabled) {
        candidate++;
      }
      if (this.options[candidate].isDisabled) {
        return;
      }
      this.selected = candidate;
      this.selectList.setFocus([this.selected]);
      this.selectList.reveal(this.selected);
      this.select(this.selected);
    }, 1);
  }
  onHome(e) {
    dom.EventHelper.stop(e);
    if (this.options.length < 2) {
      return;
    }
    let candidate = 0;
    while (candidate < this.options.length - 1 && this.options[candidate].isDisabled) {
      candidate++;
    }
    if (this.options[candidate].isDisabled) {
      return;
    }
    this.selected = candidate;
    this.selectList.setFocus([this.selected]);
    this.selectList.reveal(this.selected);
    this.select(this.selected);
  }
  onEnd(e) {
    dom.EventHelper.stop(e);
    if (this.options.length < 2) {
      return;
    }
    let candidate = this.options.length - 1;
    while (candidate > 0 && this.options[candidate].isDisabled) {
      candidate--;
    }
    if (this.options[candidate].isDisabled) {
      return;
    }
    this.selected = candidate;
    this.selectList.setFocus([this.selected]);
    this.selectList.reveal(this.selected);
    this.select(this.selected);
  }
  // Mimic option first character navigation of native select
  onCharacter(e) {
    const ch = KeyCodeUtils.toString(e.keyCode);
    let optionIndex = -1;
    for (let i = 0; i < this.options.length - 1; i++) {
      optionIndex = (i + this.selected + 1) % this.options.length;
      if (this.options[optionIndex].text.charAt(0).toUpperCase() === ch && !this.options[optionIndex].isDisabled) {
        this.select(optionIndex);
        this.selectList.setFocus([optionIndex]);
        this.selectList.reveal(this.selectList.getFocus()[0]);
        dom.EventHelper.stop(e);
        break;
      }
    }
  }
  dispose() {
    this.hideSelectDropDown(false);
    super.dispose();
  }
};
_SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_BOTTOM_MARGIN = 32;
_SelectBoxList.DEFAULT_DROPDOWN_MINIMUM_TOP_MARGIN = 2;
_SelectBoxList.DEFAULT_MINIMUM_VISIBLE_OPTIONS = 3;
let SelectBoxList = _SelectBoxList;
export {
  SelectBoxList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94Q3VzdG9tLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgYXJyYXlzIGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSwgS2V5Q29kZVV0aWxzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgKiBhcyBjc3NKcyBmcm9tICcuLi8uLi9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vZG9tLmpzJztcbmltcG9ydCAqIGFzIGRvbVN0eWxlc2hlZXRzSnMgZnJvbSAnLi4vLi4vZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uL2V2ZW50LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgSVJlbmRlcmVkTWFya2Rvd24sIE1hcmtkb3duQWN0aW9uSGFuZGxlciwgcmVuZGVyTWFya2Rvd24gfSBmcm9tICcuLi8uLi9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IEFuY2hvclBvc2l0aW9uLCBJQ29udGV4dFZpZXdQcm92aWRlciB9IGZyb20gJy4uL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IGdldEJhc2VMYXllckhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi9ob3Zlci9ob3ZlckRlbGVnYXRlMi5qcyc7XG5pbXBvcnQgeyBnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElMaXN0RXZlbnQsIElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IExpc3QgfSBmcm9tICcuLi9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVNlbGVjdEJveERlbGVnYXRlLCBJU2VsZWN0Qm94T3B0aW9ucywgSVNlbGVjdEJveFN0eWxlcywgSVNlbGVjdERhdGEsIElTZWxlY3RPcHRpb25JdGVtIH0gZnJvbSAnLi9zZWxlY3RCb3guanMnO1xuaW1wb3J0ICcuL3NlbGVjdEJveEN1c3RvbS5jc3MnO1xuXG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgU0VMRUNUX09QVElPTl9FTlRSWV9URU1QTEFURV9JRCA9ICdzZWxlY3RPcHRpb24uZW50cnkudGVtcGxhdGUnO1xuXG5pbnRlcmZhY2UgSVNlbGVjdExpc3RUZW1wbGF0ZURhdGEge1xuXHRyb290OiBIVE1MRWxlbWVudDtcblx0dGV4dDogSFRNTEVsZW1lbnQ7XG5cdGRldGFpbDogSFRNTEVsZW1lbnQ7XG5cdGRlY29yYXRvclJpZ2h0OiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgU2VsZWN0TGlzdFJlbmRlcmVyIGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJU2VsZWN0T3B0aW9uSXRlbSwgSVNlbGVjdExpc3RUZW1wbGF0ZURhdGE+IHtcblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gU0VMRUNUX09QVElPTl9FTlRSWV9URU1QTEFURV9JRDsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2VsZWN0TGlzdFRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSVNlbGVjdExpc3RUZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGRhdGEucm9vdCA9IGNvbnRhaW5lcjtcblx0XHRkYXRhLnRleHQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9wdGlvbi10ZXh0JykpO1xuXHRcdGRhdGEuZGV0YWlsID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5vcHRpb24tZGV0YWlsJykpO1xuXHRcdGRhdGEuZGVjb3JhdG9yUmlnaHQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLm9wdGlvbi1kZWNvcmF0b3ItcmlnaHQnKSk7XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVNlbGVjdE9wdGlvbkl0ZW0sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNlbGVjdExpc3RUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhOiBJU2VsZWN0TGlzdFRlbXBsYXRlRGF0YSA9IHRlbXBsYXRlRGF0YTtcblxuXHRcdGNvbnN0IHRleHQgPSBlbGVtZW50LnRleHQ7XG5cdFx0Y29uc3QgZGV0YWlsID0gZWxlbWVudC5kZXRhaWw7XG5cdFx0Y29uc3QgZGVjb3JhdG9yUmlnaHQgPSBlbGVtZW50LmRlY29yYXRvclJpZ2h0O1xuXG5cdFx0Y29uc3QgaXNEaXNhYmxlZCA9IGVsZW1lbnQuaXNEaXNhYmxlZDtcblxuXHRcdGRhdGEudGV4dC50ZXh0Q29udGVudCA9IHRleHQ7XG5cdFx0ZGF0YS5kZXRhaWwudGV4dENvbnRlbnQgPSAhIWRldGFpbCA/IGRldGFpbCA6ICcnO1xuXHRcdGRhdGEuZGVjb3JhdG9yUmlnaHQudGV4dENvbnRlbnQgPSAhIWRlY29yYXRvclJpZ2h0ID8gZGVjb3JhdG9yUmlnaHQgOiAnJztcblxuXHRcdC8vIHBzZXVkby1zZWxlY3QgZGlzYWJsZWQgb3B0aW9uXG5cdFx0aWYgKGlzRGlzYWJsZWQpIHtcblx0XHRcdGRhdGEucm9vdC5jbGFzc0xpc3QuYWRkKCdvcHRpb24tZGlzYWJsZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHdlIGRvIGNsYXNzIHJlbW92YWwgZnJvbSBwcmlvciB0ZW1wbGF0ZSByZW5kZXJpbmdcblx0XHRcdGRhdGEucm9vdC5jbGFzc0xpc3QucmVtb3ZlKCdvcHRpb24tZGlzYWJsZWQnKTtcblx0XHR9XG5cblx0XHQvLyBTZXBhcmF0b3Igb3B0aW9uIC0gc2hvdyBhIENTUyBib3JkZXIgaW5zdGVhZCBvZiB0ZXh0IGNoYXJhY3RlcnNcblx0XHRpZiAoZWxlbWVudC5pc1NlcGFyYXRvcikge1xuXHRcdFx0ZGF0YS5yb290LmNsYXNzTGlzdC5hZGQoJ29wdGlvbi1zZXBhcmF0b3InKTtcblx0XHRcdGRhdGEucm9vdC5jbGFzc0xpc3QuYWRkKCdvcHRpb24tZGlzYWJsZWQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5yb290LmNsYXNzTGlzdC5yZW1vdmUoJ29wdGlvbi1zZXBhcmF0b3InKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUoX3RlbXBsYXRlRGF0YTogSVNlbGVjdExpc3RUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbGVjdEJveExpc3QgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNlbGVjdEJveERlbGVnYXRlLCBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJU2VsZWN0T3B0aW9uSXRlbT4ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfRFJPUERPV05fTUlOSU1VTV9CT1RUT01fTUFSR0lOID0gMzI7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERFRkFVTFRfRFJPUERPV05fTUlOSU1VTV9UT1BfTUFSR0lOID0gMjtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgREVGQVVMVF9NSU5JTVVNX1ZJU0lCTEVfT1BUSU9OUyA9IDM7XG5cblx0cHJpdmF0ZSBfaXNWaXNpYmxlOiBib29sZWFuO1xuXHRwcml2YXRlIHNlbGVjdEJveE9wdGlvbnM6IElTZWxlY3RCb3hPcHRpb25zO1xuXHRwcml2YXRlIHNlbGVjdEVsZW1lbnQ6IEhUTUxTZWxlY3RFbGVtZW50O1xuXHRwcml2YXRlIGNvbnRhaW5lcj86IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIG9wdGlvbnM6IElTZWxlY3RPcHRpb25JdGVtW10gPSBbXTtcblx0cHJpdmF0ZSBzZWxlY3RlZDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbGVjdDogRW1pdHRlcjxJU2VsZWN0RGF0YT47XG5cdHByaXZhdGUgcmVhZG9ubHkgc3R5bGVzOiBJU2VsZWN0Qm94U3R5bGVzO1xuXHRwcml2YXRlIGxpc3RSZW5kZXJlciE6IFNlbGVjdExpc3RSZW5kZXJlcjtcblx0cHJpdmF0ZSBjb250ZXh0Vmlld1Byb3ZpZGVyITogSUNvbnRleHRWaWV3UHJvdmlkZXI7XG5cdHByaXZhdGUgc2VsZWN0RHJvcERvd25Db250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzdHlsZUVsZW1lbnQhOiBIVE1MU3R5bGVFbGVtZW50O1xuXHRwcml2YXRlIHNlbGVjdExpc3QhOiBMaXN0PElTZWxlY3RPcHRpb25JdGVtPjtcblx0cHJpdmF0ZSBzZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB3aWR0aENvbnRyb2xFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX2N1cnJlbnRTZWxlY3Rpb24gPSAwO1xuXHRwcml2YXRlIF9kcm9wRG93blBvc2l0aW9uITogQW5jaG9yUG9zaXRpb247XG5cdHByaXZhdGUgX2hhc0RldGFpbHM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzZWxlY3Rpb25EZXRhaWxzUGFuZSE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb25EZXRhaWxzRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9za2lwTGF5b3V0OiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX2NhY2hlZE1heERldGFpbHNIZWlnaHQ/OiBudW1iZXI7XG5cdHByaXZhdGUgX2hvdmVyPzogSU1hbmFnZWRIb3ZlcjtcblxuXHRwcml2YXRlIF9zdGlja3k6IGJvb2xlYW4gPSBmYWxzZTsgLy8gZm9yIGRldiBwdXJwb3NlcyBvbmx5XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogSVNlbGVjdE9wdGlvbkl0ZW1bXSwgc2VsZWN0ZWQ6IG51bWJlciwgY29udGV4dFZpZXdQcm92aWRlcjogSUNvbnRleHRWaWV3UHJvdmlkZXIsIHN0eWxlczogSVNlbGVjdEJveFN0eWxlcywgc2VsZWN0Qm94T3B0aW9ucz86IElTZWxlY3RCb3hPcHRpb25zKSB7XG5cblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IGZhbHNlO1xuXHRcdHRoaXMuc3R5bGVzID0gc3R5bGVzO1xuXG5cdFx0dGhpcy5zZWxlY3RCb3hPcHRpb25zID0gc2VsZWN0Qm94T3B0aW9ucyB8fCBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLnNlbGVjdEJveE9wdGlvbnMubWluQm90dG9tTWFyZ2luICE9PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5zZWxlY3RCb3hPcHRpb25zLm1pbkJvdHRvbU1hcmdpbiA9IFNlbGVjdEJveExpc3QuREVGQVVMVF9EUk9QRE9XTl9NSU5JTVVNX0JPVFRPTV9NQVJHSU47XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNlbGVjdEJveE9wdGlvbnMubWluQm90dG9tTWFyZ2luIDwgMCkge1xuXHRcdFx0dGhpcy5zZWxlY3RCb3hPcHRpb25zLm1pbkJvdHRvbU1hcmdpbiA9IDA7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc2VsZWN0Jyk7XG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50LmNsYXNzTmFtZSA9ICdtb25hY28tc2VsZWN0LWJveCc7XG5cblx0XHRpZiAodHlwZW9mIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5hcmlhTGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGhpcy5zZWxlY3RCb3hPcHRpb25zLmFyaWFMYWJlbCk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0aGlzLnNlbGVjdEJveE9wdGlvbnMuYXJpYURlc2NyaXB0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zZWxlY3RFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1kZXNjcmlwdGlvbicsIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5hcmlhRGVzY3JpcHRpb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkU2VsZWN0ID0gbmV3IEVtaXR0ZXI8SVNlbGVjdERhdGE+KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fb25EaWRTZWxlY3QpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMuY29uc3RydWN0U2VsZWN0RHJvcERvd24oY29udGV4dFZpZXdQcm92aWRlcik7XG5cblx0XHR0aGlzLnNlbGVjdGVkID0gc2VsZWN0ZWQgfHwgMDtcblxuXHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHR0aGlzLnNldE9wdGlvbnMob3B0aW9ucywgc2VsZWN0ZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5pdFN0eWxlU2hlZXQoKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBzZXRUaXRsZSh0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9ob3ZlciAmJiB0aXRsZSkge1xuXHRcdFx0dGhpcy5faG92ZXIgPSB0aGlzLl9yZWdpc3RlcihnZXRCYXNlTGF5ZXJIb3ZlckRlbGVnYXRlKCkuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuc2VsZWN0RWxlbWVudCwgdGl0bGUpKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2hvdmVyKSB7XG5cdFx0XHR0aGlzLl9ob3Zlci51cGRhdGUodGl0bGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIElEZWxlZ2F0ZSAtIExpc3QgcmVuZGVyZXJcblxuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFNFTEVDVF9PUFRJT05fRU5UUllfVEVNUExBVEVfSUQ7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cnVjdFNlbGVjdERyb3BEb3duKGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyKSB7XG5cblx0XHQvLyBTZXRVcCBDb250ZXh0VmlldyBjb250YWluZXIgdG8gaG9sZCBzZWxlY3QgRHJvcGRvd25cblx0XHR0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIgPSBjb250ZXh0Vmlld1Byb3ZpZGVyO1xuXHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIgPSBkb20uJCgnLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lcicpO1xuXG5cdFx0Ly8gU2V0dXAgY29udGFpbmVyIGZvciBzZWxlY3Qgb3B0aW9uIGRldGFpbHNcblx0XHR0aGlzLnNlbGVjdGlvbkRldGFpbHNQYW5lID0gZG9tLmFwcGVuZCh0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLCAkKCcuc2VsZWN0LWJveC1kZXRhaWxzLXBhbmUnKSk7XG5cblx0XHQvLyBDcmVhdGUgc3BhbiBmbGV4IGJveCBpdGVtL2RpdiB3ZSBjYW4gbWVhc3VyZSBhbmQgY29udHJvbFxuXHRcdGNvbnN0IHdpZHRoQ29udHJvbE91dGVyRGl2ID0gZG9tLmFwcGVuZCh0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLCAkKCcuc2VsZWN0LWJveC1kcm9wZG93bi1jb250YWluZXItd2lkdGgtY29udHJvbCcpKTtcblx0XHRjb25zdCB3aWR0aENvbnRyb2xJbm5lckRpdiA9IGRvbS5hcHBlbmQod2lkdGhDb250cm9sT3V0ZXJEaXYsICQoJy53aWR0aC1jb250cm9sLWRpdicpKTtcblx0XHR0aGlzLndpZHRoQ29udHJvbEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0dGhpcy53aWR0aENvbnRyb2xFbGVtZW50LmNsYXNzTmFtZSA9ICdvcHRpb24tdGV4dC13aWR0aC1jb250cm9sJztcblx0XHRkb20uYXBwZW5kKHdpZHRoQ29udHJvbElubmVyRGl2LCB0aGlzLndpZHRoQ29udHJvbEVsZW1lbnQpO1xuXG5cdFx0Ly8gQWx3YXlzIGRlZmF1bHQgdG8gYmVsb3cgcG9zaXRpb25cblx0XHR0aGlzLl9kcm9wRG93blBvc2l0aW9uID0gQW5jaG9yUG9zaXRpb24uQkVMT1c7XG5cblx0XHQvLyBJbmxpbmUgc3R5bGVzaGVldCBmb3IgdGhlbWVzXG5cdFx0dGhpcy5zdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0c0pzLmNyZWF0ZVN0eWxlU2hlZXQodGhpcy5zZWxlY3REcm9wRG93bkNvbnRhaW5lcik7XG5cblx0XHQvLyBQcmV2ZW50IGRyYWdnaW5nIG9mIGRyb3Bkb3duICMxMTQzMjlcblx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLnNldEF0dHJpYnV0ZSgnZHJhZ2dhYmxlJywgJ3RydWUnKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIsIGRvbS5FdmVudFR5cGUuRFJBR19TVEFSVCwgKGUpID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKSB7XG5cblx0XHQvLyBQYXJlbnQgbmF0aXZlIHNlbGVjdCBrZXlib2FyZCBsaXN0ZW5lcnNcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdEVsZW1lbnQsICdjaGFuZ2UnLCAoZSkgPT4ge1xuXHRcdFx0dGhpcy5zZWxlY3RlZCA9IGUudGFyZ2V0LnNlbGVjdGVkSW5kZXg7XG5cdFx0XHR0aGlzLl9vbkRpZFNlbGVjdC5maXJlKHtcblx0XHRcdFx0aW5kZXg6IGUudGFyZ2V0LnNlbGVjdGVkSW5kZXgsXG5cdFx0XHRcdHNlbGVjdGVkOiBlLnRhcmdldC52YWx1ZVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoISF0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0gJiYgISF0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0udGV4dCkge1xuXHRcdFx0XHR0aGlzLnNldFRpdGxlKHRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIYXZlIHRvIGltcGxlbWVudCBib3RoIGtleWJvYXJkIGFuZCBtb3VzZSBjb250cm9sbGVycyB0byBoYW5kbGUgZGlzYWJsZWQgb3B0aW9uc1xuXHRcdC8vIEludGVyY2VwdCBtb3VzZSBldmVudHMgdG8gb3ZlcnJpZGUgbm9ybWFsIHNlbGVjdCBhY3Rpb25zIG9uIHBhcmVudHNcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3RFbGVtZW50LCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdGlmICh0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24odHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNob3dTZWxlY3REcm9wRG93bigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3RFbGVtZW50LCBkb20uRXZlbnRUeXBlLk1PVVNFX0RPV04sIChlKSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBJbnRlcmNlcHQgdG91Y2ggZXZlbnRzXG5cdFx0Ly8gVGhlIGZvbGxvd2luZyBpbXBsZW1lbnRhdGlvbiBpcyBzbGlnaHRseSBkaWZmZXJlbnQgZnJvbSB0aGUgbW91c2UgZXZlbnQgaGFuZGxlcnMgYWJvdmUuXG5cdFx0Ly8gVXNlIHRoZSBmb2xsb3dpbmcgaGVscGVyIHZhcmlhYmxlLCBvdGhlcndpc2UgdGhlIGxpc3QgZmxpY2tlcnMuXG5cdFx0bGV0IGxpc3RJc1Zpc2libGVPblRvdWNoU3RhcnQ6IGJvb2xlYW47XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdEVsZW1lbnQsICd0b3VjaHN0YXJ0JywgKGUpID0+IHtcblx0XHRcdGxpc3RJc1Zpc2libGVPblRvdWNoU3RhcnQgPSB0aGlzLl9pc1Zpc2libGU7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3RFbGVtZW50LCAndG91Y2hlbmQnLCAoZSkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRcdGlmIChsaXN0SXNWaXNpYmxlT25Ub3VjaFN0YXJ0KSB7XG5cdFx0XHRcdHRoaXMuaGlkZVNlbGVjdERyb3BEb3duKHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zaG93U2VsZWN0RHJvcERvd24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbnRlcmNlcHQga2V5Ym9hcmQgaGFuZGxpbmdcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3RFbGVtZW50LCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0bGV0IHNob3dEcm9wRG93biA9IGZhbHNlO1xuXG5cdFx0XHQvLyBDcmVhdGUgYW5kIGRyb3AgZG93biBzZWxlY3QgbGlzdCBvbiBrZXlib2FyZCBzZWxlY3Rcblx0XHRcdGlmIChpc01hY2ludG9zaCkge1xuXHRcdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cgfHwgZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93IHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuU3BhY2UgfHwgZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5FbnRlcikge1xuXHRcdFx0XHRcdHNob3dEcm9wRG93biA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkRvd25BcnJvdyAmJiBldmVudC5hbHRLZXkgfHwgZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93ICYmIGV2ZW50LmFsdEtleSB8fCBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLlNwYWNlIHx8IGV2ZW50LmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpIHtcblx0XHRcdFx0XHRzaG93RHJvcERvd24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChzaG93RHJvcERvd24pIHtcblx0XHRcdFx0dGhpcy5zaG93U2VsZWN0RHJvcERvd24oKTtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZFNlbGVjdCgpOiBFdmVudDxJU2VsZWN0RGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFNlbGVjdC5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBzZXRPcHRpb25zKG9wdGlvbnM6IElTZWxlY3RPcHRpb25JdGVtW10sIHNlbGVjdGVkPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKCFhcnJheXMuZXF1YWxzKHRoaXMub3B0aW9ucywgb3B0aW9ucykpIHtcblx0XHRcdHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQub3B0aW9ucy5sZW5ndGggPSAwO1xuXHRcdFx0dGhpcy5faGFzRGV0YWlscyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fY2FjaGVkTWF4RGV0YWlsc0hlaWdodCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0dGhpcy5vcHRpb25zLmZvckVhY2goKG9wdGlvbiwgaW5kZXgpID0+IHtcblx0XHRcdFx0dGhpcy5zZWxlY3RFbGVtZW50LmFkZCh0aGlzLmNyZWF0ZU9wdGlvbihvcHRpb24udGV4dCwgaW5kZXgsIG9wdGlvbi5pc0Rpc2FibGVkKSk7XG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9uLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRoaXMuX2hhc0RldGFpbHMgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoc2VsZWN0ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5zZWxlY3Qoc2VsZWN0ZWQpO1xuXHRcdFx0Ly8gU2V0IGN1cnJlbnQgPSBzZWxlY3RlZCBzaW5jZSB0aGlzIGlzIG5vdCBuZWNlc3NhcmlseSBhIHVzZXIgZXhpdFxuXHRcdFx0dGhpcy5fY3VycmVudFNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0ZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEVuYWJsZWQoZW5hYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50LmRpc2FibGVkID0gIWVuYWJsZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0T3B0aW9uc0xpc3QoKSB7XG5cblx0XHQvLyBNaXJyb3Igb3B0aW9ucyBpbiBkcm9wLWRvd25cblx0XHQvLyBQb3B1bGF0ZSBzZWxlY3QgbGlzdCBmb3Igbm9uLW5hdGl2ZSBzZWxlY3QgbW9kZVxuXHRcdHRoaXMuc2VsZWN0TGlzdD8uc3BsaWNlKDAsIHRoaXMuc2VsZWN0TGlzdC5sZW5ndGgsIHRoaXMub3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgc2VsZWN0KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblxuXHRcdGlmIChpbmRleCA+PSAwICYmIGluZGV4IDwgdGhpcy5vcHRpb25zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZCA9IGluZGV4O1xuXHRcdH0gZWxzZSBpZiAoaW5kZXggPiB0aGlzLm9wdGlvbnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0Ly8gQWRqdXN0IGluZGV4IHRvIGVuZCBvZiBsaXN0XG5cdFx0XHQvLyBUaGlzIGNvdWxkIG1ha2UgY2xpZW50IG91dCBvZiBzeW5jIHdpdGggdGhlIHNlbGVjdFxuXHRcdFx0dGhpcy5zZWxlY3QodGhpcy5vcHRpb25zLmxlbmd0aCAtIDEpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5zZWxlY3RlZCA8IDApIHtcblx0XHRcdHRoaXMuc2VsZWN0ZWQgPSAwO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zZWxlY3RlZEluZGV4ID0gdGhpcy5zZWxlY3RlZDtcblx0XHRpZiAoISF0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0gJiYgISF0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0udGV4dCkge1xuXHRcdFx0dGhpcy5zZXRUaXRsZSh0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0udGV4dCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHNldEFyaWFMYWJlbChsYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RCb3hPcHRpb25zLmFyaWFMYWJlbCA9IGxhYmVsO1xuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aGlzLnNlbGVjdEJveE9wdGlvbnMuYXJpYUxhYmVsKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZWxlY3RFbGVtZW50KSB7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQudGFiSW5kZXggPSAwO1xuXHRcdFx0dGhpcy5zZWxlY3RFbGVtZW50LmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGJsdXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc2VsZWN0RWxlbWVudCkge1xuXHRcdFx0dGhpcy5zZWxlY3RFbGVtZW50LnRhYkluZGV4ID0gLTE7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuYmx1cigpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXRGb2N1c2FibGUoZm9jdXNhYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50LnRhYkluZGV4ID0gZm9jdXNhYmxlID8gMCA6IC0xO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NlbGVjdC1jb250YWluZXInKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zZWxlY3RFbGVtZW50KTtcblx0XHR0aGlzLnN0eWxlU2VsZWN0RWxlbWVudCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0U3R5bGVTaGVldCgpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cblx0XHQvLyBTdHlsZSBub24tbmF0aXZlIHNlbGVjdCBtb2RlXG5cblx0XHRpZiAodGhpcy5zdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyID4gLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXIgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IGJhY2tncm91bmQtY29sb3I6ICR7dGhpcy5zdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZH0gIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0eWxlcy5saXN0Rm9jdXNGb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tc2VsZWN0LWJveC1kcm9wZG93bi1jb250YWluZXIgPiAuc2VsZWN0LWJveC1kcm9wZG93bi1saXN0LWNvbnRhaW5lciAubW9uYWNvLWxpc3QgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6ICR7dGhpcy5zdHlsZXMubGlzdEZvY3VzRm9yZWdyb3VuZH0gIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0eWxlcy5kZWNvcmF0b3JSaWdodEZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Om5vdCguZm9jdXNlZCkgLm9wdGlvbi1kZWNvcmF0b3ItcmlnaHQgeyBjb2xvcjogJHt0aGlzLnN0eWxlcy5kZWNvcmF0b3JSaWdodEZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3R5bGVzLnNlbGVjdEJhY2tncm91bmQgJiYgdGhpcy5zdHlsZXMuc2VsZWN0Qm9yZGVyICYmIHRoaXMuc3R5bGVzLnNlbGVjdEJvcmRlciAhPT0gdGhpcy5zdHlsZXMuc2VsZWN0QmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyIHsgYm9yZGVyOiAxcHggc29saWQgJHt0aGlzLnN0eWxlcy5zZWxlY3RCb3JkZXJ9IH0gYCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tc2VsZWN0LWJveC1kcm9wZG93bi1jb250YWluZXIgPiAuc2VsZWN0LWJveC1kZXRhaWxzLXBhbmUuYm9yZGVyLXRvcCB7IGJvcmRlci10b3A6IDFweCBzb2xpZCAke3RoaXMuc3R5bGVzLnNlbGVjdEJvcmRlcn0gfSBgKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRldGFpbHMtcGFuZS5ib3JkZXItYm90dG9tIHsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMuc2VsZWN0Qm9yZGVyfSB9IGApO1xuXG5cdFx0fVxuXHRcdGVsc2UgaWYgKHRoaXMuc3R5bGVzLnNlbGVjdExpc3RCb3JkZXIpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRldGFpbHMtcGFuZS5ib3JkZXItdG9wIHsgYm9yZGVyLXRvcDogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMuc2VsZWN0TGlzdEJvcmRlcn0gfSBgKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRldGFpbHMtcGFuZS5ib3JkZXItYm90dG9tIHsgYm9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMuc2VsZWN0TGlzdEJvcmRlcn0gfSBgKTtcblx0XHR9XG5cblx0XHQvLyBIb3ZlciBmb3JlZ3JvdW5kIC0gaWdub3JlIGZvciBkaXNhYmxlZCBvcHRpb25zXG5cdFx0aWYgKHRoaXMuc3R5bGVzLmxpc3RIb3ZlckZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Om5vdCgub3B0aW9uLWRpc2FibGVkKTpub3QoLmZvY3VzZWQpOmhvdmVyIHsgY29sb3I6ICR7dGhpcy5zdHlsZXMubGlzdEhvdmVyRm9yZWdyb3VuZH0gIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdC8vIEhvdmVyIGJhY2tncm91bmQgLSBpZ25vcmUgZm9yIGRpc2FibGVkIG9wdGlvbnNcblx0XHRpZiAodGhpcy5zdHlsZXMubGlzdEhvdmVyQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyID4gLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXIgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3c6bm90KC5vcHRpb24tZGlzYWJsZWQpOm5vdCguZm9jdXNlZCk6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3RoaXMuc3R5bGVzLmxpc3RIb3ZlckJhY2tncm91bmR9ICFpbXBvcnRhbnQ7IH1gKTtcblx0XHR9XG5cblx0XHQvLyBNYXRjaCBhY3Rpb24gd2lkZ2V0IG91dGxpbmUgc3R5bGVzIC0gaWdub3JlIGZvciBkaXNhYmxlZCBvcHRpb25zXG5cdFx0aWYgKHRoaXMuc3R5bGVzLmxpc3RGb2N1c091dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgeyBvdXRsaW5lOiAxcHggc29saWQgJHt0aGlzLnN0eWxlcy5saXN0Rm9jdXNPdXRsaW5lfSAhaW1wb3J0YW50OyBvdXRsaW5lLW9mZnNldDogLTFweCAhaW1wb3J0YW50OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3R5bGVzLmxpc3RIb3Zlck91dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Om5vdCgub3B0aW9uLWRpc2FibGVkKTpub3QoLmZvY3VzZWQpOmhvdmVyIHsgb3V0bGluZTogMXB4IHNvbGlkICR7dGhpcy5zdHlsZXMubGlzdEhvdmVyT3V0bGluZX0gIWltcG9ydGFudDsgb3V0bGluZS1vZmZzZXQ6IC0xcHggIWltcG9ydGFudDsgfWApO1xuXHRcdH1cblxuXHRcdC8vIENsZWFyIGxpc3Qgc3R5bGVzIG9uIGZvY3VzIGFuZCBvbiBob3ZlciBmb3IgZGlzYWJsZWQgb3B0aW9uc1xuXHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1zZWxlY3QtYm94LWRyb3Bkb3duLWNvbnRhaW5lciA+IC5zZWxlY3QtYm94LWRyb3Bkb3duLWxpc3QtY29udGFpbmVyIC5tb25hY28tbGlzdCAubW9uYWNvLWxpc3Qtcm93Lm9wdGlvbi1kaXNhYmxlZC5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQgIWltcG9ydGFudDsgY29sb3I6IGluaGVyaXQgIWltcG9ydGFudDsgb3V0bGluZTogbm9uZSAhaW1wb3J0YW50OyB9YCk7XG5cdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLXNlbGVjdC1ib3gtZHJvcGRvd24tY29udGFpbmVyID4gLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXIgLm1vbmFjby1saXN0IC5tb25hY28tbGlzdC1yb3cub3B0aW9uLWRpc2FibGVkOmhvdmVyIHsgYmFja2dyb3VuZC1jb2xvcjogdHJhbnNwYXJlbnQgIWltcG9ydGFudDsgY29sb3I6IGluaGVyaXQgIWltcG9ydGFudDsgb3V0bGluZTogbm9uZSAhaW1wb3J0YW50OyB9YCk7XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGNvbnRlbnQuam9pbignXFxuJyk7XG5cdH1cblxuXHRwcml2YXRlIHN0eWxlU2VsZWN0RWxlbWVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZ3JvdW5kID0gdGhpcy5zdHlsZXMuc2VsZWN0QmFja2dyb3VuZCA/PyAnJztcblx0XHRjb25zdCBmb3JlZ3JvdW5kID0gdGhpcy5zdHlsZXMuc2VsZWN0Rm9yZWdyb3VuZCA/PyAnJztcblx0XHRjb25zdCBib3JkZXIgPSB0aGlzLnN0eWxlcy5zZWxlY3RCb3JkZXIgPz8gJyc7XG5cblx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZDtcblx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuc3R5bGUuY29sb3IgPSBmb3JlZ3JvdW5kO1xuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zdHlsZS5ib3JkZXJDb2xvciA9IGJvcmRlcjtcblx0fVxuXG5cdHByaXZhdGUgc3R5bGVMaXN0KCkge1xuXHRcdGNvbnN0IGJhY2tncm91bmQgPSB0aGlzLnN0eWxlcy5zZWxlY3RCYWNrZ3JvdW5kID8/ICcnO1xuXG5cdFx0Y29uc3QgbGlzdEJhY2tncm91bmQgPSBjc3NKcy5hc0Nzc1ZhbHVlV2l0aERlZmF1bHQodGhpcy5zdHlsZXMuc2VsZWN0TGlzdEJhY2tncm91bmQsIGJhY2tncm91bmQpO1xuXHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gbGlzdEJhY2tncm91bmQ7XG5cdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gbGlzdEJhY2tncm91bmQ7XG5cdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBsaXN0QmFja2dyb3VuZDtcblxuXHRcdHRoaXMuc2VsZWN0TGlzdC5zdHlsZSh0aGlzLnN0eWxlcyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9wdGlvbih2YWx1ZTogc3RyaW5nLCBpbmRleDogbnVtYmVyLCBkaXNhYmxlZD86IGJvb2xlYW4pOiBIVE1MT3B0aW9uRWxlbWVudCB7XG5cdFx0Y29uc3Qgb3B0aW9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnb3B0aW9uJyk7XG5cdFx0b3B0aW9uLnZhbHVlID0gdmFsdWU7XG5cdFx0b3B0aW9uLnRleHQgPSB2YWx1ZTtcblx0XHRvcHRpb24uZGlzYWJsZWQgPSAhIWRpc2FibGVkO1xuXG5cdFx0cmV0dXJuIG9wdGlvbjtcblx0fVxuXG5cdC8vIENvbnRleHRWaWV3IGRyb3Bkb3duIG1ldGhvZHNcblxuXHRwcml2YXRlIHNob3dTZWxlY3REcm9wRG93bigpIHtcblx0XHR0aGlzLnNlbGVjdGlvbkRldGFpbHNQYW5lLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRpZiAoIXRoaXMuY29udGV4dFZpZXdQcm92aWRlciB8fCB0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBMYXppbHkgY3JlYXRlIGFuZCBwb3B1bGF0ZSBsaXN0IG9ubHkgYXQgb3BlbiwgbW92ZWQgZnJvbSBjb25zdHJ1Y3RvclxuXHRcdHRoaXMuY3JlYXRlU2VsZWN0TGlzdCh0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyKTtcblx0XHR0aGlzLnNldE9wdGlvbnNMaXN0KCk7XG5cblx0XHQvLyBUaGlzIGFsbG93cyB1cyB0byBmbGlwIHRoZSBwb3NpdGlvbiBiYXNlZCBvbiBtZWFzdXJlbWVudFxuXHRcdC8vIFNldCBkcm9wLWRvd24gcG9zaXRpb24gYWJvdmUvYmVsb3cgZnJvbSByZXF1aXJlZCBoZWlnaHQgYW5kIG1hcmdpbnNcblx0XHQvLyBJZiBwcmUtbGF5b3V0IGNhbm5vdCBmaXQgYXQgbGVhc3Qgb25lIG9wdGlvbiBkbyBub3Qgc2hvdyBkcm9wLWRvd25cblxuXHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlci5zaG93Q29udGV4dFZpZXcoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLnNlbGVjdEVsZW1lbnQsXG5cdFx0XHRyZW5kZXI6IChjb250YWluZXI6IEhUTUxFbGVtZW50KSA9PiB0aGlzLnJlbmRlclNlbGVjdERyb3BEb3duKGNvbnRhaW5lciwgdHJ1ZSksXG5cdFx0XHRsYXlvdXQ6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZWxlY3REcm9wRG93bigpO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKTtcblx0XHRcdH0sXG5cdFx0XHRhbmNob3JQb3NpdGlvbjogdGhpcy5fZHJvcERvd25Qb3NpdGlvblxuXHRcdH0sIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5vcHRpb25zQXNDaGlsZHJlbiA/IHRoaXMuY29udGFpbmVyIDogdW5kZWZpbmVkKTtcblxuXHRcdC8vIEhpZGUgc28gd2UgY2FuIHJlbGF5IG91dFxuXHRcdHRoaXMuX2lzVmlzaWJsZSA9IHRydWU7XG5cdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24oZmFsc2UpO1xuXG5cdFx0dGhpcy5jb250ZXh0Vmlld1Byb3ZpZGVyLnNob3dDb250ZXh0Vmlldyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IHRoaXMuc2VsZWN0RWxlbWVudCxcblx0XHRcdHJlbmRlcjogKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpID0+IHRoaXMucmVuZGVyU2VsZWN0RHJvcERvd24oY29udGFpbmVyKSxcblx0XHRcdGxheW91dDogKCkgPT4gdGhpcy5sYXlvdXRTZWxlY3REcm9wRG93bigpLFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpO1xuXHRcdFx0fSxcblx0XHRcdGFuY2hvclBvc2l0aW9uOiB0aGlzLl9kcm9wRG93blBvc2l0aW9uXG5cdFx0fSwgdGhpcy5zZWxlY3RCb3hPcHRpb25zLm9wdGlvbnNBc0NoaWxkcmVuID8gdGhpcy5jb250YWluZXIgOiB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVHJhY2sgaW5pdGlhbCBzZWxlY3Rpb24gdGhlIGNhc2UgdXNlciBlc2NhcGUsIGJsdXJcblx0XHR0aGlzLl9jdXJyZW50U2VsZWN0aW9uID0gdGhpcy5zZWxlY3RlZDtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB0cnVlO1xuXHRcdHRoaXMuc2VsZWN0RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAndHJ1ZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBoaWRlU2VsZWN0RHJvcERvd24oZm9jdXNTZWxlY3Q6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuY29udGV4dFZpZXdQcm92aWRlciB8fCAhdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5faXNWaXNpYmxlID0gZmFsc2U7XG5cdFx0dGhpcy5zZWxlY3RFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXG5cdFx0aWYgKGZvY3VzU2VsZWN0KSB7XG5cdFx0XHR0aGlzLnNlbGVjdEVsZW1lbnQuZm9jdXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHRWaWV3UHJvdmlkZXIuaGlkZUNvbnRleHRWaWV3KCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclNlbGVjdERyb3BEb3duKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHByZUxheW91dFBvc2l0aW9uPzogYm9vbGVhbik6IElEaXNwb3NhYmxlIHtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zZWxlY3REcm9wRG93bkNvbnRhaW5lcik7XG5cblx0XHQvLyBJbmhlcml0IGZvbnQtc2l6ZSBmcm9tIHRoZSBzZWxlY3QgYnV0dG9uIHNvIHRoZSBkcm9wZG93biBtYXRjaGVzXG5cdFx0Y29uc3QgY29tcHV0ZWRGb250U2l6ZSA9IGRvbS5nZXRXaW5kb3codGhpcy5zZWxlY3RFbGVtZW50KS5nZXRDb21wdXRlZFN0eWxlKHRoaXMuc2VsZWN0RWxlbWVudCkuZm9udFNpemU7XG5cdFx0aWYgKGNvbXB1dGVkRm9udFNpemUpIHtcblx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUuZm9udFNpemUgPSBjb21wdXRlZEZvbnRTaXplO1xuXHRcdH1cblxuXHRcdC8vIFByZS1MYXlvdXQgYWxsb3dzIHVzIHRvIGNoYW5nZSBwb3NpdGlvblxuXHRcdHRoaXMubGF5b3V0U2VsZWN0RHJvcERvd24ocHJlTGF5b3V0UG9zaXRpb24pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Ly8gY29udGV4dFZpZXcgd2lsbCBkaXNwb3NlIGl0c2VsZiBpZiBtb3ZpbmcgZnJvbSBvbmUgVmlldyB0byBhbm90aGVyXG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIucmVtb3ZlKCk7IC8vIHJlbW92ZSB0byB0YWtlIG91dCB0aGUgQ1NTIHJ1bGVzIHdlIGFkZFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHQvLyBJdGVyYXRlIG92ZXIgZGV0YWlsZWQgZGVzY3JpcHRpb25zLCBmaW5kIG1heCBoZWlnaHRcblx0cHJpdmF0ZSBtZWFzdXJlTWF4RGV0YWlsc0hlaWdodCgpOiBudW1iZXIge1xuXHRcdGxldCBtYXhEZXRhaWxzUGFuZUhlaWdodCA9IDA7XG5cdFx0dGhpcy5vcHRpb25zLmZvckVhY2goKF9vcHRpb24sIGluZGV4KSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZURldGFpbChpbmRleCk7XG5cblx0XHRcdGlmICh0aGlzLnNlbGVjdGlvbkRldGFpbHNQYW5lLm9mZnNldEhlaWdodCA+IG1heERldGFpbHNQYW5lSGVpZ2h0KSB7XG5cdFx0XHRcdG1heERldGFpbHNQYW5lSGVpZ2h0ID0gdGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5vZmZzZXRIZWlnaHQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbWF4RGV0YWlsc1BhbmVIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dFNlbGVjdERyb3BEb3duKHByZUxheW91dFBvc2l0aW9uPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXG5cdFx0Ly8gQXZvaWQgcmVjdXJzaW9uIGZyb20gbGF5b3V0IGNhbGxlZCBpbiBvbkxpc3RGb2N1c1xuXHRcdGlmICh0aGlzLl9za2lwTGF5b3V0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gTGF5b3V0IENvbnRleHRWaWV3IGRyb3AgZG93biBzZWxlY3QgbGlzdCBhbmQgY29udGFpbmVyXG5cdFx0Ly8gSGF2ZSB0byBtYW5hZ2Ugb3VyIHZlcnRpY2FsIG92ZXJmbG93LCBzaXppbmcsIHBvc2l0aW9uIGJlbG93IG9yIGFib3ZlXG5cdFx0Ly8gUG9zaXRpb24gaGFzIHRvIGJlIGRldGVybWluZWQgYW5kIHNldCBwcmlvciB0byBjb250ZXh0VmlldyBpbnN0YW50aWF0aW9uXG5cblx0XHRpZiAodGhpcy5zZWxlY3RMaXN0KSB7XG5cblx0XHRcdC8vIE1ha2UgdmlzaWJsZSB0byBlbmFibGUgbWVhc3VyZW1lbnRzXG5cdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Zpc2libGUnKTtcblxuXHRcdFx0Y29uc3Qgd2luZG93ID0gZG9tLmdldFdpbmRvdyh0aGlzLnNlbGVjdEVsZW1lbnQpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0UG9zaXRpb24gPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbih0aGlzLnNlbGVjdEVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgbWF4U2VsZWN0RHJvcERvd25IZWlnaHRCZWxvdyA9ICh3aW5kb3cuaW5uZXJIZWlnaHQgLSBzZWxlY3RQb3NpdGlvbi50b3AgLSBzZWxlY3RQb3NpdGlvbi5oZWlnaHQgLSAodGhpcy5zZWxlY3RCb3hPcHRpb25zLm1pbkJvdHRvbU1hcmdpbiB8fCAwKSk7XG5cdFx0XHRjb25zdCBtYXhTZWxlY3REcm9wRG93bkhlaWdodEFib3ZlID0gKHNlbGVjdFBvc2l0aW9uLnRvcCAtIFNlbGVjdEJveExpc3QuREVGQVVMVF9EUk9QRE9XTl9NSU5JTVVNX1RPUF9NQVJHSU4pO1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgb3B0aW1hbCB3aWR0aCAtIG1pbihsb25nZXN0IG9wdGlvbiksIG9wdChwYXJlbnQgc2VsZWN0LCBleGNsdWRpbmcgbWFyZ2lucyksIG1heChDb250ZXh0VmlldyBjb250cm9sbGVkKVxuXHRcdFx0Y29uc3Qgc2VsZWN0V2lkdGggPSB0aGlzLnNlbGVjdEVsZW1lbnQub2Zmc2V0V2lkdGg7XG5cdFx0XHRjb25zdCBzZWxlY3RNaW5XaWR0aCA9IHRoaXMuc2V0V2lkdGhDb250cm9sRWxlbWVudCh0aGlzLndpZHRoQ29udHJvbEVsZW1lbnQpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0T3B0aW1hbFdpZHRoID0gYCR7TWF0aC5tYXgoc2VsZWN0TWluV2lkdGgsIE1hdGgucm91bmQoc2VsZWN0V2lkdGgpKX1weGA7XG5cblx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUud2lkdGggPSBzZWxlY3RPcHRpbWFsV2lkdGg7XG5cblx0XHRcdC8vIEdldCBpbml0aWFsIGxpc3QgaGVpZ2h0IGFuZCBkZXRlcm1pbmUgc3BhY2UgYWJvdmUgYW5kIGJlbG93XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5sYXlvdXQoKTtcblx0XHRcdGxldCBsaXN0SGVpZ2h0ID0gdGhpcy5zZWxlY3RMaXN0LmNvbnRlbnRIZWlnaHQ7XG5cblx0XHRcdGlmICh0aGlzLl9oYXNEZXRhaWxzICYmIHRoaXMuX2NhY2hlZE1heERldGFpbHNIZWlnaHQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9jYWNoZWRNYXhEZXRhaWxzSGVpZ2h0ID0gdGhpcy5tZWFzdXJlTWF4RGV0YWlsc0hlaWdodCgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWF4RGV0YWlsc1BhbmVIZWlnaHQgPSB0aGlzLl9oYXNEZXRhaWxzID8gdGhpcy5fY2FjaGVkTWF4RGV0YWlsc0hlaWdodCEgOiAwO1xuXG5cdFx0XHRjb25zdCBtaW5SZXF1aXJlZERyb3BEb3duSGVpZ2h0ID0gbGlzdEhlaWdodCArIG1heERldGFpbHNQYW5lSGVpZ2h0O1xuXHRcdFx0Y29uc3QgbWF4VmlzaWJsZU9wdGlvbnNCZWxvdyA9ICgoTWF0aC5mbG9vcigobWF4U2VsZWN0RHJvcERvd25IZWlnaHRCZWxvdyAtIG1heERldGFpbHNQYW5lSGVpZ2h0KSAvIHRoaXMuZ2V0SGVpZ2h0KCkpKSk7XG5cdFx0XHRjb25zdCBtYXhWaXNpYmxlT3B0aW9uc0Fib3ZlID0gKChNYXRoLmZsb29yKChtYXhTZWxlY3REcm9wRG93bkhlaWdodEFib3ZlIC0gbWF4RGV0YWlsc1BhbmVIZWlnaHQpIC8gdGhpcy5nZXRIZWlnaHQoKSkpKTtcblxuXHRcdFx0Ly8gSWYgd2UgYXJlIG9ubHkgZG9pbmcgcHJlLWxheW91dCBjaGVjay9hZGp1c3QgcG9zaXRpb24gb25seVxuXHRcdFx0Ly8gQ2FsY3VsYXRlIHZlcnRpY2FsIHNwYWNlIGF2YWlsYWJsZSwgZmxpcCB1cCBpZiBpbnN1ZmZpY2llbnRcblx0XHRcdC8vIFVzZSByZWZsZWN0ZWQgcGFkZGluZyBvbiBwYXJlbnQgc2VsZWN0LCBDb250ZXh0VmlldyBzdHlsZVxuXHRcdFx0Ly8gcHJvcGVydGllcyBub3QgYXZhaWxhYmxlIGJlZm9yZSBET00gYXR0YWNobWVudFxuXG5cdFx0XHRpZiAocHJlTGF5b3V0UG9zaXRpb24pIHtcblxuXHRcdFx0XHQvLyBDaGVjayBpZiBzZWxlY3QgbW92ZWQgb3V0IG9mIHZpZXdwb3J0ICwgZG8gbm90IG9wZW5cblx0XHRcdFx0Ly8gSWYgYXQgbGVhc3Qgb25lIG9wdGlvbiBjYW5ub3QgYmUgc2hvd24sIGRvbid0IG9wZW4gdGhlIGRyb3AtZG93biBvciBoaWRlL3JlbW92ZSBpZiBvcGVuXG5cblx0XHRcdFx0aWYgKChzZWxlY3RQb3NpdGlvbi50b3AgKyBzZWxlY3RQb3NpdGlvbi5oZWlnaHQpID4gKHdpbmRvdy5pbm5lckhlaWdodCAtIDIyKVxuXHRcdFx0XHRcdHx8IHNlbGVjdFBvc2l0aW9uLnRvcCA8IFNlbGVjdEJveExpc3QuREVGQVVMVF9EUk9QRE9XTl9NSU5JTVVNX1RPUF9NQVJHSU5cblx0XHRcdFx0XHR8fCAoKG1heFZpc2libGVPcHRpb25zQmVsb3cgPCAxKSAmJiAobWF4VmlzaWJsZU9wdGlvbnNBYm92ZSA8IDEpKSkge1xuXHRcdFx0XHRcdC8vIEluZGljYXRlIHdlIGNhbm5vdCBvcGVuXG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGV0ZXJtaW5lIGlmIHdlIGhhdmUgdG8gZmxpcCB1cFxuXHRcdFx0XHQvLyBBbHdheXMgc2hvdyBjb21wbGV0ZSBsaXN0IGl0ZW1zIC0gbmV2ZXIgbW9yZSB0aGFuIE1heCBhdmFpbGFibGUgdmVydGljYWwgaGVpZ2h0XG5cdFx0XHRcdGlmIChtYXhWaXNpYmxlT3B0aW9uc0JlbG93IDwgU2VsZWN0Qm94TGlzdC5ERUZBVUxUX01JTklNVU1fVklTSUJMRV9PUFRJT05TXG5cdFx0XHRcdFx0JiYgbWF4VmlzaWJsZU9wdGlvbnNBYm92ZSA+IG1heFZpc2libGVPcHRpb25zQmVsb3dcblx0XHRcdFx0XHQmJiB0aGlzLm9wdGlvbnMubGVuZ3RoID4gbWF4VmlzaWJsZU9wdGlvbnNCZWxvd1xuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHR0aGlzLl9kcm9wRG93blBvc2l0aW9uID0gQW5jaG9yUG9zaXRpb24uQUJPVkU7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VsZWN0aW9uRGV0YWlsc1BhbmUpO1xuXHRcdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIpO1xuXG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QucmVtb3ZlKCdib3JkZXItdG9wJyk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QuYWRkKCdib3JkZXItYm90dG9tJyk7XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9kcm9wRG93blBvc2l0aW9uID0gQW5jaG9yUG9zaXRpb24uQkVMT1c7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VsZWN0RHJvcERvd25MaXN0Q29udGFpbmVyKTtcblx0XHRcdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuc2VsZWN0aW9uRGV0YWlsc1BhbmUpO1xuXG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QucmVtb3ZlKCdib3JkZXItYm90dG9tJyk7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5jbGFzc0xpc3QuYWRkKCdib3JkZXItdG9wJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRG8gZnVsbCBsYXlvdXQgb24gc2hvd1NlbGVjdERyb3BEb3duIG9ubHlcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHNlbGVjdCBvdXQgb2Ygdmlld3BvcnQgb3IgY3V0dGluZyBpbnRvIHN0YXR1cyBiYXJcblx0XHRcdGlmICgoc2VsZWN0UG9zaXRpb24udG9wICsgc2VsZWN0UG9zaXRpb24uaGVpZ2h0KSA+ICh3aW5kb3cuaW5uZXJIZWlnaHQgLSAyMilcblx0XHRcdFx0fHwgc2VsZWN0UG9zaXRpb24udG9wIDwgU2VsZWN0Qm94TGlzdC5ERUZBVUxUX0RST1BET1dOX01JTklNVU1fVE9QX01BUkdJTlxuXHRcdFx0XHR8fCAodGhpcy5fZHJvcERvd25Qb3NpdGlvbiA9PT0gQW5jaG9yUG9zaXRpb24uQkVMT1cgJiYgbWF4VmlzaWJsZU9wdGlvbnNCZWxvdyA8IDEpXG5cdFx0XHRcdHx8ICh0aGlzLl9kcm9wRG93blBvc2l0aW9uID09PSBBbmNob3JQb3NpdGlvbi5BQk9WRSAmJiBtYXhWaXNpYmxlT3B0aW9uc0Fib3ZlIDwgMSkpIHtcblx0XHRcdFx0Ly8gQ2Fubm90IHByb3Blcmx5IGxheW91dCwgY2xvc2UgYW5kIGhpZGVcblx0XHRcdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24odHJ1ZSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0VXAgbGlzdCBkaW1lbnNpb25zIGFuZCBsYXlvdXQgLSBhY2NvdW50IGZvciBjb250YWluZXIgcGFkZGluZ1xuXHRcdFx0Ly8gVXNlIHBvc2l0aW9uIHRvIGNoZWNrIGFib3ZlIG9yIGJlbG93IGF2YWlsYWJsZSBzcGFjZVxuXHRcdFx0aWYgKHRoaXMuX2Ryb3BEb3duUG9zaXRpb24gPT09IEFuY2hvclBvc2l0aW9uLkJFTE9XKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1Zpc2libGUgJiYgbWF4VmlzaWJsZU9wdGlvbnNCZWxvdyArIG1heFZpc2libGVPcHRpb25zQWJvdmUgPCAxKSB7XG5cdFx0XHRcdFx0Ly8gSWYgZHJvcC1kb3duIGlzIHZpc2libGUsIG11c3QgYmUgZG9pbmcgYSBET00gcmUtbGF5b3V0LCBoaWRlIHNpbmNlIHdlIGRvbid0IGZpdFxuXHRcdFx0XHRcdC8vIEhpZGUgZHJvcC1kb3duLCBoaWRlIGNvbnRleHR2aWV3LCBmb2N1cyBvbiBwYXJlbnQgc2VsZWN0XG5cdFx0XHRcdFx0dGhpcy5oaWRlU2VsZWN0RHJvcERvd24odHJ1ZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQWRqdXN0IGxpc3QgaGVpZ2h0IHRvIG1heCBmcm9tIHNlbGVjdCBib3R0b20gdG8gbWFyZ2luIChkZWZhdWx0L21pbkJvdHRvbU1hcmdpbilcblx0XHRcdFx0aWYgKG1pblJlcXVpcmVkRHJvcERvd25IZWlnaHQgPiBtYXhTZWxlY3REcm9wRG93bkhlaWdodEJlbG93KSB7XG5cdFx0XHRcdFx0bGlzdEhlaWdodCA9IChtYXhWaXNpYmxlT3B0aW9uc0JlbG93ICogdGhpcy5nZXRIZWlnaHQoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChtaW5SZXF1aXJlZERyb3BEb3duSGVpZ2h0ID4gbWF4U2VsZWN0RHJvcERvd25IZWlnaHRBYm92ZSkge1xuXHRcdFx0XHRcdGxpc3RIZWlnaHQgPSAobWF4VmlzaWJsZU9wdGlvbnNBYm92ZSAqIHRoaXMuZ2V0SGVpZ2h0KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNldCBhZGp1c3RlZCBsaXN0IGhlaWdodCBhbmQgcmVsYXlvdXRcblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5sYXlvdXQobGlzdEhlaWdodCk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QuZG9tRm9jdXMoKTtcblxuXHRcdFx0Ly8gRmluYWxseSBzZXQgZm9jdXMgb24gc2VsZWN0ZWQgaXRlbVxuXHRcdFx0aWYgKHRoaXMuc2VsZWN0TGlzdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZCB8fCAwXSk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0TGlzdC5yZXZlYWwodGhpcy5zZWxlY3RMaXN0LmdldEZvY3VzKClbMF0gfHwgMCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9oYXNEZXRhaWxzKSB7XG5cdFx0XHRcdC8vIExlYXZlIHRoZSBzZWxlY3REcm9wRG93bkNvbnRhaW5lciB0byBzaXplIGl0c2VsZiBhY2NvcmRpbmcgdG8gY2hpbGRyZW4gKGxpc3QgKyBkZXRhaWxzKSAtICM1NzQ0N1xuXHRcdFx0XHR0aGlzLnNlbGVjdExpc3QuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5oZWlnaHQgPSBgJHtsaXN0SGVpZ2h0fXB4YDtcblx0XHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7bGlzdEhlaWdodH1weGA7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlRGV0YWlsKHRoaXMuc2VsZWN0ZWQpO1xuXG5cdFx0XHR0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLnN0eWxlLndpZHRoID0gc2VsZWN0T3B0aW1hbFdpZHRoO1xuXHRcdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIuc2V0QXR0cmlidXRlKCd0YWJpbmRleCcsICcwJyk7XG5cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzZXRXaWR0aENvbnRyb2xFbGVtZW50KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGxldCBlbGVtZW50V2lkdGggPSAwO1xuXG5cdFx0aWYgKGNvbnRhaW5lcikge1xuXHRcdFx0bGV0IGxvbmdlc3QgPSAwO1xuXHRcdFx0bGV0IGxvbmdlc3RMZW5ndGggPSAwO1xuXG5cdFx0XHR0aGlzLm9wdGlvbnMuZm9yRWFjaCgob3B0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkZXRhaWxMZW5ndGggPSAhIW9wdGlvbi5kZXRhaWwgPyBvcHRpb24uZGV0YWlsLmxlbmd0aCA6IDA7XG5cdFx0XHRcdGNvbnN0IHJpZ2h0RGVjb3JhdG9yTGVuZ3RoID0gISFvcHRpb24uZGVjb3JhdG9yUmlnaHQgPyBvcHRpb24uZGVjb3JhdG9yUmlnaHQubGVuZ3RoIDogMDtcblxuXHRcdFx0XHRjb25zdCBsZW4gPSBvcHRpb24udGV4dC5sZW5ndGggKyBkZXRhaWxMZW5ndGggKyByaWdodERlY29yYXRvckxlbmd0aDtcblx0XHRcdFx0aWYgKGxlbiA+IGxvbmdlc3RMZW5ndGgpIHtcblx0XHRcdFx0XHRsb25nZXN0ID0gaW5kZXg7XG5cdFx0XHRcdFx0bG9uZ2VzdExlbmd0aCA9IGxlbjtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblxuXHRcdFx0Y29udGFpbmVyLnRleHRDb250ZW50ID0gdGhpcy5vcHRpb25zW2xvbmdlc3RdLnRleHQgKyAoISF0aGlzLm9wdGlvbnNbbG9uZ2VzdF0uZGVjb3JhdG9yUmlnaHQgPyBgJHt0aGlzLm9wdGlvbnNbbG9uZ2VzdF0uZGVjb3JhdG9yUmlnaHR9IGAgOiAnJyk7XG5cdFx0XHRlbGVtZW50V2lkdGggPSBkb20uZ2V0VG90YWxXaWR0aChjb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbGVtZW50V2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNlbGVjdExpc3QocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBhbHJlYWR5IGNvbnN0cnVjdGl2ZSBsaXN0IG9uIG9wZW4sIHNraXBcblx0XHRpZiAodGhpcy5zZWxlY3RMaXN0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2V0VXAgY29udGFpbmVyIGZvciBsaXN0XG5cdFx0dGhpcy5zZWxlY3REcm9wRG93bkxpc3RDb250YWluZXIgPSBkb20uYXBwZW5kKHBhcmVudCwgJCgnLnNlbGVjdC1ib3gtZHJvcGRvd24tbGlzdC1jb250YWluZXInKSk7XG5cblx0XHR0aGlzLmxpc3RSZW5kZXJlciA9IG5ldyBTZWxlY3RMaXN0UmVuZGVyZXIoKTtcblxuXHRcdHRoaXMuc2VsZWN0TGlzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMaXN0KCdTZWxlY3RCb3hDdXN0b20nLCB0aGlzLnNlbGVjdERyb3BEb3duTGlzdENvbnRhaW5lciwgdGhpcywgW3RoaXMubGlzdFJlbmRlcmVyXSwge1xuXHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0XHR2ZXJ0aWNhbFNjcm9sbE1vZGU6IFNjcm9sbGJhclZpc2liaWxpdHkuVmlzaWJsZSxcblx0XHRcdGtleWJvYXJkU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRtb3VzZVN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEFyaWFMYWJlbDogZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQuaXNTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2VsZWN0Qm94U2VwYXJhdG9yJywgXCJzZXBhcmF0b3JcIik7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bGV0IGxhYmVsID0gZWxlbWVudC50ZXh0O1xuXHRcdFx0XHRcdGlmIChlbGVtZW50LmRldGFpbCkge1xuXHRcdFx0XHRcdFx0bGFiZWwgKz0gYC4gJHtlbGVtZW50LmRldGFpbH1gO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChlbGVtZW50LmRlY29yYXRvclJpZ2h0KSB7XG5cdFx0XHRcdFx0XHRsYWJlbCArPSBgLiAke2VsZW1lbnQuZGVjb3JhdG9yUmlnaHR9YDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZWxlbWVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0bGFiZWwgKz0gYC4gJHtlbGVtZW50LmRlc2NyaXB0aW9ufWA7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGxhYmVsO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKHsga2V5OiAnc2VsZWN0Qm94JywgY29tbWVudDogWydCZWhhdmUgbGlrZSBuYXRpdmUgc2VsZWN0IGRyb3Bkb3duIGVsZW1lbnQuJ10gfSwgXCJTZWxlY3QgQm94XCIpLFxuXHRcdFx0XHRnZXRSb2xlOiAoKSA9PiBpc01hY2ludG9zaCA/ICcnIDogJ29wdGlvbicsXG5cdFx0XHRcdGdldFdpZGdldFJvbGU6ICgpID0+ICdsaXN0Ym94J1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAodGhpcy5zZWxlY3RCb3hPcHRpb25zLmFyaWFMYWJlbCkge1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LmFyaWFMYWJlbCA9IHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5hcmlhTGFiZWw7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0VXAgbGlzdCBrZXlib2FyZCBjb250cm9sbGVyIC0gY29udHJvbCBuYXZpZ2F0aW9uLCBkaXNhYmxlZCBpdGVtcywgZm9jdXNcblx0XHRjb25zdCBvbktleURvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLnNlbGVjdERyb3BEb3duTGlzdENvbnRhaW5lciwgJ2tleWRvd24nKSk7XG5cdFx0Y29uc3Qgb25TZWxlY3REcm9wRG93bktleURvd24gPSBFdmVudC5jaGFpbihvbktleURvd24uZXZlbnQsICQgPT5cblx0XHRcdCQuZmlsdGVyKCgpID0+IHRoaXMuc2VsZWN0TGlzdC5sZW5ndGggPiAwKVxuXHRcdFx0XHQubWFwKGUgPT4gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKSlcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIpKSh0aGlzLm9uRW50ZXIsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5UYWIpKSh0aGlzLm9uRW50ZXIsIHRoaXMpKTsgLy8gVGFiIHNob3VsZCBiZWhhdmUgdGhlIHNhbWUgYXMgZW50ZXIsICM3OTMzOVxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmNoYWluKG9uU2VsZWN0RHJvcERvd25LZXlEb3duLCAkID0+ICQuZmlsdGVyKGUgPT4gZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkpKHRoaXMub25Fc2NhcGUsIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93KSkodGhpcy5vblVwQXJyb3csIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cpKSh0aGlzLm9uRG93bkFycm93LCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuUGFnZURvd24pKSh0aGlzLm9uUGFnZURvd24sIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5jaGFpbihvblNlbGVjdERyb3BEb3duS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5QYWdlVXApKSh0aGlzLm9uUGFnZVVwLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuSG9tZSkpKHRoaXMub25Ib21lLCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuY2hhaW4ob25TZWxlY3REcm9wRG93bktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuRW5kKSkodGhpcy5vbkVuZCwgdGhpcykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmNoYWluKG9uU2VsZWN0RHJvcERvd25LZXlEb3duLCAkID0+ICQuZmlsdGVyKGUgPT4gKGUua2V5Q29kZSA+PSBLZXlDb2RlLkRpZ2l0MCAmJiBlLmtleUNvZGUgPD0gS2V5Q29kZS5LZXlaKSB8fCAoZS5rZXlDb2RlID49IEtleUNvZGUuU2VtaWNvbG9uICYmIGUua2V5Q29kZSA8PSBLZXlDb2RlLk51bXBhZERpdmlkZSkpKSh0aGlzLm9uQ2hhcmFjdGVyLCB0aGlzKSk7XG5cblx0XHQvLyBTZXRVcCBsaXN0IG1vdXNlIGNvbnRyb2xsZXIgLSBjb250cm9sIG5hdmlnYXRpb24sIGRpc2FibGVkIGl0ZW1zLCBmb2N1c1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5zZWxlY3RMaXN0LmdldEhUTUxFbGVtZW50KCksIGRvbS5FdmVudFR5cGUuUE9JTlRFUl9VUCwgZSA9PiB0aGlzLm9uUG9pbnRlclVwKGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlbGVjdExpc3Qub25Nb3VzZU92ZXIoZSA9PiB0eXBlb2YgZS5pbmRleCAhPT0gJ3VuZGVmaW5lZCcgJiYgIXRoaXMub3B0aW9uc1tlLmluZGV4XT8uaXNEaXNhYmxlZCAmJiB0aGlzLnNlbGVjdExpc3Quc2V0Rm9jdXMoW2UuaW5kZXhdKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VsZWN0TGlzdC5vbkRpZENoYW5nZUZvY3VzKGUgPT4gdGhpcy5vbkxpc3RGb2N1cyhlKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnNlbGVjdERyb3BEb3duQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkZPQ1VTX09VVCwgZSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2lzVmlzaWJsZSB8fCBkb20uaXNBbmNlc3RvcihlLnJlbGF0ZWRUYXJnZXQgYXMgSFRNTEVsZW1lbnQsIHRoaXMuc2VsZWN0RHJvcERvd25Db250YWluZXIpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMub25MaXN0Qmx1cigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuc2VsZWN0TGlzdC5nZXRIVE1MRWxlbWVudCgpLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuc2VsZWN0Qm94T3B0aW9ucy5hcmlhTGFiZWwgfHwgJycpO1xuXHRcdHRoaXMuc2VsZWN0TGlzdC5nZXRIVE1MRWxlbWVudCgpLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICd0cnVlJyk7XG5cblx0XHR0aGlzLnN0eWxlTGlzdCgpO1xuXHR9XG5cblx0Ly8gTGlzdCBtZXRob2RzXG5cblx0Ly8gTGlzdCBtb3VzZSBjb250cm9sbGVyIC0gYWN0aXZlIGV4aXQsIHNlbGVjdCBvcHRpb24sIGZpcmUgb25EaWRTZWxlY3QgaWYgY2hhbmdlLCByZXR1cm4gZm9jdXMgdG8gcGFyZW50IHNlbGVjdFxuXHQvLyBBbHNvIHRha2VzIGluIHRvdWNoZW5kIGV2ZW50c1xuXHRwcml2YXRlIG9uUG9pbnRlclVwKGU6IFBvaW50ZXJFdmVudCk6IHZvaWQge1xuXG5cdFx0aWYgKCF0aGlzLnNlbGVjdExpc3QubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRjb25zdCB0YXJnZXQgPSA8RWxlbWVudD5lLnRhcmdldDtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIG91ciBtb3VzZSBldmVudCBpcyBvbiBhbiBvcHRpb24gKG5vdCBzY3JvbGxiYXIpXG5cdFx0aWYgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ3NsaWRlcicpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdFJvd0VsZW1lbnQgPSB0YXJnZXQuY2xvc2VzdCgnLm1vbmFjby1saXN0LXJvdycpO1xuXG5cdFx0aWYgKCFsaXN0Um93RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IE51bWJlcihsaXN0Um93RWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5kZXgnKSk7XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSBsaXN0Um93RWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ29wdGlvbi1kaXNhYmxlZCcpO1xuXG5cdFx0Ly8gSWdub3JlIG1vdXNlIHNlbGVjdGlvbiBvZiBkaXNhYmxlZCBvcHRpb25zXG5cdFx0aWYgKGluZGV4ID49IDAgJiYgaW5kZXggPCB0aGlzLm9wdGlvbnMubGVuZ3RoICYmICFkaXNhYmxlZCkge1xuXHRcdFx0dGhpcy5zZWxlY3RlZCA9IGluZGV4O1xuXHRcdFx0dGhpcy5zZWxlY3QodGhpcy5zZWxlY3RlZCk7XG5cblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZF0pO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdExpc3QuZ2V0Rm9jdXMoKVswXSk7XG5cblx0XHRcdC8vIE9ubHkgZmlyZSBpZiBzZWxlY3Rpb24gY2hhbmdlXG5cdFx0XHRpZiAodGhpcy5zZWxlY3RlZCAhPT0gdGhpcy5fY3VycmVudFNlbGVjdGlvbikge1xuXHRcdFx0XHQvLyBTZXQgY3VycmVudCA9IHNlbGVjdGVkXG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGVkO1xuXG5cdFx0XHRcdHRoaXMuX29uRGlkU2VsZWN0LmZpcmUoe1xuXHRcdFx0XHRcdGluZGV4OiB0aGlzLnNlbGVjdEVsZW1lbnQuc2VsZWN0ZWRJbmRleCxcblx0XHRcdFx0XHRzZWxlY3RlZDogdGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdLnRleHRcblxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCEhdGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdICYmICEhdGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdLnRleHQpIHtcblx0XHRcdFx0XHR0aGlzLnNldFRpdGxlKHRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bih0cnVlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBMaXN0IEV4aXQgLSBwYXNzaXZlIC0gaW1wbGljaXQgbm8gc2VsZWN0aW9uIGNoYW5nZSwgaGlkZSBkcm9wLWRvd25cblx0cHJpdmF0ZSBvbkxpc3RCbHVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGlja3kpIHsgcmV0dXJuOyB9XG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWQgIT09IHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24pIHtcblx0XHRcdC8vIFJlc2V0IHNlbGVjdGVkIHRvIGN1cnJlbnQgaWYgbm8gY2hhbmdlXG5cdFx0XHR0aGlzLnNlbGVjdCh0aGlzLl9jdXJyZW50U2VsZWN0aW9uKTtcblx0XHR9XG5cblx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bihmYWxzZSk7XG5cdH1cblxuXG5cdHByaXZhdGUgcmVuZGVyRGVzY3JpcHRpb25NYXJrZG93bih0ZXh0OiBzdHJpbmcsIGFjdGlvbkhhbmRsZXI/OiBNYXJrZG93bkFjdGlvbkhhbmRsZXIpOiBJUmVuZGVyZWRNYXJrZG93biB7XG5cdFx0Y29uc3QgY2xlYW5SZW5kZXJlZE1hcmtkb3duID0gKGVsZW1lbnQ6IE5vZGUpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgZWxlbWVudC5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoaWxkID0gPEVsZW1lbnQ+ZWxlbWVudC5jaGlsZE5vZGVzLml0ZW0oaSk7XG5cblx0XHRcdFx0Y29uc3QgdGFnTmFtZSA9IGNoaWxkLnRhZ05hbWUgJiYgY2hpbGQudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRpZiAodGFnTmFtZSA9PT0gJ2ltZycpIHtcblx0XHRcdFx0XHRjaGlsZC5yZW1vdmUoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjbGVhblJlbmRlcmVkTWFya2Rvd24oY2hpbGQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlbmRlcmVkID0gcmVuZGVyTWFya2Rvd24oeyB2YWx1ZTogdGV4dCwgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSwgeyBhY3Rpb25IYW5kbGVyIH0pO1xuXG5cdFx0cmVuZGVyZWQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZWxlY3QtYm94LWRlc2NyaXB0aW9uLW1hcmtkb3duJyk7XG5cdFx0Y2xlYW5SZW5kZXJlZE1hcmtkb3duKHJlbmRlcmVkLmVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHJlbmRlcmVkO1xuXHR9XG5cblx0Ly8gTGlzdCBGb2N1cyBDaGFuZ2UgLSBwYXNzaXZlIC0gdXBkYXRlIGRldGFpbHMgcGFuZSB3aXRoIG5ld2x5IGZvY3VzZWQgZWxlbWVudCdzIGRhdGFcblx0cHJpdmF0ZSBvbkxpc3RGb2N1cyhlOiBJTGlzdEV2ZW50PElTZWxlY3RPcHRpb25JdGVtPikge1xuXHRcdC8vIFNraXAgZHVyaW5nIGluaXRpYWwgbGF5b3V0XG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUgfHwgIXRoaXMuX2hhc0RldGFpbHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZURldGFpbChlLmluZGV4ZXNbMF0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVEZXRhaWwoc2VsZWN0ZWRJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gUmVzZXRcblx0XHR0aGlzLl9zZWxlY3Rpb25EZXRhaWxzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNlbGVjdGlvbkRldGFpbHNQYW5lLnRleHRDb250ZW50ID0gJyc7XG5cblx0XHRjb25zdCBvcHRpb24gPSB0aGlzLm9wdGlvbnNbc2VsZWN0ZWRJbmRleF07XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBvcHRpb24/LmRlc2NyaXB0aW9uID8/ICcnO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uSXNNYXJrZG93biA9IG9wdGlvbj8uZGVzY3JpcHRpb25Jc01hcmtkb3duID8/IGZhbHNlO1xuXG5cdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRpZiAoZGVzY3JpcHRpb25Jc01hcmtkb3duKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbkhhbmRsZXIgPSBvcHRpb24uZGVzY3JpcHRpb25NYXJrZG93bkFjdGlvbkhhbmRsZXI7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX3NlbGVjdGlvbkRldGFpbHNEaXNwb3NhYmxlcy5hZGQodGhpcy5yZW5kZXJEZXNjcmlwdGlvbk1hcmtkb3duKGRlc2NyaXB0aW9uLCBhY3Rpb25IYW5kbGVyKSk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0aW9uRGV0YWlsc1BhbmUuYXBwZW5kQ2hpbGQocmVzdWx0LmVsZW1lbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS50ZXh0Q29udGVudCA9IGRlc2NyaXB0aW9uO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWxlY3Rpb25EZXRhaWxzUGFuZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIEF2b2lkIHJlY3Vyc2lvblxuXHRcdHRoaXMuX3NraXBMYXlvdXQgPSB0cnVlO1xuXHRcdHRoaXMuY29udGV4dFZpZXdQcm92aWRlci5sYXlvdXQoKTtcblx0XHR0aGlzLl9za2lwTGF5b3V0ID0gZmFsc2U7XG5cdH1cblxuXHQvLyBMaXN0IGtleWJvYXJkIGNvbnRyb2xsZXJcblxuXHQvLyBMaXN0IGV4aXQgLSBhY3RpdmUgLSBoaWRlIENvbnRleHRWaWV3IGRyb3Bkb3duLCByZXNldCBzZWxlY3Rpb24sIHJldHVybiBmb2N1cyB0byBwYXJlbnQgc2VsZWN0XG5cdHByaXZhdGUgb25Fc2NhcGUoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHQvLyBSZXNldCBzZWxlY3Rpb24gdG8gdmFsdWUgd2hlbiBvcGVuZWRcblx0XHR0aGlzLnNlbGVjdCh0aGlzLl9jdXJyZW50U2VsZWN0aW9uKTtcblx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bih0cnVlKTtcblx0fVxuXG5cdC8vIExpc3QgZXhpdCAtIGFjdGl2ZSAtIGhpZGUgQ29udGV4dFZpZXcgZHJvcGRvd24sIHJldHVybiBmb2N1cyB0byBwYXJlbnQgc2VsZWN0LCBmaXJlIG9uRGlkU2VsZWN0IGlmIGNoYW5nZVxuXHRwcml2YXRlIG9uRW50ZXIoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHQvLyBJZ25vcmUgaWYgY3VycmVudCBzZWxlY3Rpb24gaXMgZGlzYWJsZWQgKGUuZy4gc2VwYXJhdG9yKVxuXHRcdGlmICh0aGlzLm9wdGlvbnNbdGhpcy5zZWxlY3RlZF0/LmlzRGlzYWJsZWQpIHtcblx0XHRcdHRoaXMuaGlkZVNlbGVjdERyb3BEb3duKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgZmlyZSBpZiBzZWxlY3Rpb24gY2hhbmdlXG5cdFx0aWYgKHRoaXMuc2VsZWN0ZWQgIT09IHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24pIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRTZWxlY3Rpb24gPSB0aGlzLnNlbGVjdGVkO1xuXHRcdFx0dGhpcy5fb25EaWRTZWxlY3QuZmlyZSh7XG5cdFx0XHRcdGluZGV4OiB0aGlzLnNlbGVjdEVsZW1lbnQuc2VsZWN0ZWRJbmRleCxcblx0XHRcdFx0c2VsZWN0ZWQ6IHRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0XG5cdFx0XHR9KTtcblx0XHRcdGlmICghIXRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXSAmJiAhIXRoaXMub3B0aW9uc1t0aGlzLnNlbGVjdGVkXS50ZXh0KSB7XG5cdFx0XHRcdHRoaXMuc2V0VGl0bGUodGhpcy5vcHRpb25zW3RoaXMuc2VsZWN0ZWRdLnRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuaGlkZVNlbGVjdERyb3BEb3duKHRydWUpO1xuXHR9XG5cblx0Ly8gTGlzdCBuYXZpZ2F0aW9uIC0gaGF2ZSB0byBoYW5kbGUgZGlzYWJsZWQgb3B0aW9ucyAoanVtcCBvdmVyKVxuXHRwcml2YXRlIG9uRG93bkFycm93KGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlbGVjdGVkIDwgdGhpcy5vcHRpb25zLmxlbmd0aCAtIDEpIHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHQvLyBTa2lwIG92ZXIgYWxsIGNvbnRpZ3VvdXMgZGlzYWJsZWQgb3B0aW9uc1xuXHRcdFx0bGV0IG5leHQgPSB0aGlzLnNlbGVjdGVkICsgMTtcblx0XHRcdHdoaWxlIChuZXh0IDwgdGhpcy5vcHRpb25zLmxlbmd0aCAmJiB0aGlzLm9wdGlvbnNbbmV4dF0uaXNEaXNhYmxlZCkge1xuXHRcdFx0XHRuZXh0Kys7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChuZXh0ID49IHRoaXMub3B0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNlbGVjdGVkID0gbmV4dDtcblxuXHRcdFx0Ly8gU2V0IGZvY3VzL3NlbGVjdGlvbiAtIG9ubHkgZmlyZSBldmVudCB3aGVuIGNsb3NpbmcgZHJvcC1kb3duIG9yIG9uIGJsdXJcblx0XHRcdHRoaXMuc2VsZWN0KHRoaXMuc2VsZWN0ZWQpO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QucmV2ZWFsKHRoaXMuc2VsZWN0TGlzdC5nZXRGb2N1cygpWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVXBBcnJvdyhlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZWxlY3RlZCA+IDApIHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXG5cdFx0XHQvLyBTa2lwIG92ZXIgYWxsIGNvbnRpZ3VvdXMgZGlzYWJsZWQgb3B0aW9uc1xuXHRcdFx0bGV0IHByZXYgPSB0aGlzLnNlbGVjdGVkIC0gMTtcblx0XHRcdHdoaWxlIChwcmV2ID49IDAgJiYgdGhpcy5vcHRpb25zW3ByZXZdLmlzRGlzYWJsZWQpIHtcblx0XHRcdFx0cHJldi0tO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldiA8IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNlbGVjdGVkID0gcHJldjtcblxuXHRcdFx0Ly8gU2V0IGZvY3VzL3NlbGVjdGlvbiAtIG9ubHkgZmlyZSBldmVudCB3aGVuIGNsb3NpbmcgZHJvcC1kb3duIG9yIG9uIGJsdXJcblx0XHRcdHRoaXMuc2VsZWN0KHRoaXMuc2VsZWN0ZWQpO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QucmV2ZWFsKHRoaXMuc2VsZWN0TGlzdC5nZXRGb2N1cygpWzBdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uUGFnZVVwKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0dGhpcy5zZWxlY3RMaXN0LmZvY3VzUHJldmlvdXNQYWdlKCk7XG5cblx0XHQvLyBBbGxvdyBzY3JvbGxpbmcgdG8gc2V0dGxlXG5cdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRsZXQgY2FuZGlkYXRlID0gdGhpcy5zZWxlY3RMaXN0LmdldEZvY3VzKClbMF07XG5cblx0XHRcdC8vIFNoaWZ0IHNlbGVjdGlvbiB1cCBpZiB3ZSBsYW5kIG9uIGEgZGlzYWJsZWQgb3B0aW9uXG5cdFx0XHR3aGlsZSAoY2FuZGlkYXRlID4gMCAmJiB0aGlzLm9wdGlvbnNbY2FuZGlkYXRlXS5pc0Rpc2FibGVkKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZS0tO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMub3B0aW9uc1tjYW5kaWRhdGVdLmlzRGlzYWJsZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5zZWxlY3RlZCA9IGNhbmRpZGF0ZTtcblx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZF0pO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdGVkKTtcblx0XHRcdHRoaXMuc2VsZWN0KHRoaXMuc2VsZWN0ZWQpO1xuXHRcdH0sIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblBhZ2VEb3duKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0dGhpcy5zZWxlY3RMaXN0LmZvY3VzTmV4dFBhZ2UoKTtcblxuXHRcdC8vIEFsbG93IHNjcm9sbGluZyB0byBzZXR0bGVcblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGxldCBjYW5kaWRhdGUgPSB0aGlzLnNlbGVjdExpc3QuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdFx0Ly8gU2hpZnQgc2VsZWN0aW9uIGRvd24gaWYgd2UgbGFuZCBvbiBhIGRpc2FibGVkIG9wdGlvblxuXHRcdFx0d2hpbGUgKGNhbmRpZGF0ZSA8IHRoaXMub3B0aW9ucy5sZW5ndGggLSAxICYmIHRoaXMub3B0aW9uc1tjYW5kaWRhdGVdLmlzRGlzYWJsZWQpIHtcblx0XHRcdFx0Y2FuZGlkYXRlKys7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5vcHRpb25zW2NhbmRpZGF0ZV0uaXNEaXNhYmxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNlbGVjdGVkID0gY2FuZGlkYXRlO1xuXHRcdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0XHR0aGlzLnNlbGVjdExpc3QucmV2ZWFsKHRoaXMuc2VsZWN0ZWQpO1xuXHRcdFx0dGhpcy5zZWxlY3QodGhpcy5zZWxlY3RlZCk7XG5cdFx0fSwgMSk7XG5cdH1cblxuXHRwcml2YXRlIG9uSG9tZShlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdGlmICh0aGlzLm9wdGlvbnMubGVuZ3RoIDwgMikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgY2FuZGlkYXRlID0gMDtcblx0XHR3aGlsZSAoY2FuZGlkYXRlIDwgdGhpcy5vcHRpb25zLmxlbmd0aCAtIDEgJiYgdGhpcy5vcHRpb25zW2NhbmRpZGF0ZV0uaXNEaXNhYmxlZCkge1xuXHRcdFx0Y2FuZGlkYXRlKys7XG5cdFx0fVxuXHRcdGlmICh0aGlzLm9wdGlvbnNbY2FuZGlkYXRlXS5pc0Rpc2FibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc2VsZWN0ZWQgPSBjYW5kaWRhdGU7XG5cdFx0dGhpcy5zZWxlY3RMaXN0LnNldEZvY3VzKFt0aGlzLnNlbGVjdGVkXSk7XG5cdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdGVkKTtcblx0XHR0aGlzLnNlbGVjdCh0aGlzLnNlbGVjdGVkKTtcblx0fVxuXG5cdHByaXZhdGUgb25FbmQoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cblx0XHRpZiAodGhpcy5vcHRpb25zLmxlbmd0aCA8IDIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGNhbmRpZGF0ZSA9IHRoaXMub3B0aW9ucy5sZW5ndGggLSAxO1xuXHRcdHdoaWxlIChjYW5kaWRhdGUgPiAwICYmIHRoaXMub3B0aW9uc1tjYW5kaWRhdGVdLmlzRGlzYWJsZWQpIHtcblx0XHRcdGNhbmRpZGF0ZS0tO1xuXHRcdH1cblx0XHRpZiAodGhpcy5vcHRpb25zW2NhbmRpZGF0ZV0uaXNEaXNhYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnNlbGVjdGVkID0gY2FuZGlkYXRlO1xuXHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbdGhpcy5zZWxlY3RlZF0pO1xuXHRcdHRoaXMuc2VsZWN0TGlzdC5yZXZlYWwodGhpcy5zZWxlY3RlZCk7XG5cdFx0dGhpcy5zZWxlY3QodGhpcy5zZWxlY3RlZCk7XG5cdH1cblxuXHQvLyBNaW1pYyBvcHRpb24gZmlyc3QgY2hhcmFjdGVyIG5hdmlnYXRpb24gb2YgbmF0aXZlIHNlbGVjdFxuXHRwcml2YXRlIG9uQ2hhcmFjdGVyKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGNoID0gS2V5Q29kZVV0aWxzLnRvU3RyaW5nKGUua2V5Q29kZSk7XG5cdFx0bGV0IG9wdGlvbkluZGV4ID0gLTE7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMub3B0aW9ucy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdG9wdGlvbkluZGV4ID0gKGkgKyB0aGlzLnNlbGVjdGVkICsgMSkgJSB0aGlzLm9wdGlvbnMubGVuZ3RoO1xuXHRcdFx0aWYgKHRoaXMub3B0aW9uc1tvcHRpb25JbmRleF0udGV4dC5jaGFyQXQoMCkudG9VcHBlckNhc2UoKSA9PT0gY2ggJiYgIXRoaXMub3B0aW9uc1tvcHRpb25JbmRleF0uaXNEaXNhYmxlZCkge1xuXHRcdFx0XHR0aGlzLnNlbGVjdChvcHRpb25JbmRleCk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0TGlzdC5zZXRGb2N1cyhbb3B0aW9uSW5kZXhdKTtcblx0XHRcdFx0dGhpcy5zZWxlY3RMaXN0LnJldmVhbCh0aGlzLnNlbGVjdExpc3QuZ2V0Rm9jdXMoKVswXSk7XG5cdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmhpZGVTZWxlY3REcm9wRG93bihmYWxzZSk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGdCQUFnQjtBQUN6QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxTQUFTLG9CQUFvQjtBQUN0QyxTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMkJBQTJCO0FBQ3BDLFlBQVksV0FBVztBQUN2QixZQUFZLFNBQVM7QUFDckIsWUFBWSxzQkFBc0I7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBbUQsc0JBQXNCO0FBQ3pFLFNBQVMsc0JBQTRDO0FBRXJELFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsK0JBQStCO0FBRXhDLFNBQVMsWUFBWTtBQUVyQixPQUFPO0FBR1AsTUFBTSxJQUFJLElBQUk7QUFFZCxNQUFNLGtDQUFrQztBQVN4QyxNQUFNLG1CQUF3RjtBQUFBLEVBRTdGLElBQUksYUFBcUI7QUFBRSxXQUFPO0FBQUEsRUFBaUM7QUFBQSxFQUVuRSxlQUFlLFdBQWlEO0FBQy9ELFVBQU0sT0FBZ0MsdUJBQU8sT0FBTyxJQUFJO0FBQ3hELFNBQUssT0FBTztBQUNaLFNBQUssT0FBTyxJQUFJLE9BQU8sV0FBVyxFQUFFLGNBQWMsQ0FBQztBQUNuRCxTQUFLLFNBQVMsSUFBSSxPQUFPLFdBQVcsRUFBRSxnQkFBZ0IsQ0FBQztBQUN2RCxTQUFLLGlCQUFpQixJQUFJLE9BQU8sV0FBVyxFQUFFLHlCQUF5QixDQUFDO0FBRXhFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxjQUFjLFNBQTRCLE9BQWUsY0FBNkM7QUFDckcsVUFBTSxPQUFnQztBQUV0QyxVQUFNLE9BQU8sUUFBUTtBQUNyQixVQUFNLFNBQVMsUUFBUTtBQUN2QixVQUFNLGlCQUFpQixRQUFRO0FBRS9CLFVBQU0sYUFBYSxRQUFRO0FBRTNCLFNBQUssS0FBSyxjQUFjO0FBQ3hCLFNBQUssT0FBTyxjQUFjLENBQUMsQ0FBQyxTQUFTLFNBQVM7QUFDOUMsU0FBSyxlQUFlLGNBQWMsQ0FBQyxDQUFDLGlCQUFpQixpQkFBaUI7QUFHdEUsUUFBSSxZQUFZO0FBQ2YsV0FBSyxLQUFLLFVBQVUsSUFBSSxpQkFBaUI7QUFBQSxJQUMxQyxPQUFPO0FBRU4sV0FBSyxLQUFLLFVBQVUsT0FBTyxpQkFBaUI7QUFBQSxJQUM3QztBQUdBLFFBQUksUUFBUSxhQUFhO0FBQ3hCLFdBQUssS0FBSyxVQUFVLElBQUksa0JBQWtCO0FBQzFDLFdBQUssS0FBSyxVQUFVLElBQUksaUJBQWlCO0FBQUEsSUFDMUMsT0FBTztBQUNOLFdBQUssS0FBSyxVQUFVLE9BQU8sa0JBQWtCO0FBQUEsSUFDOUM7QUFBQSxFQUNEO0FBQUEsRUFFQSxnQkFBZ0IsZUFBOEM7QUFBQSxFQUU5RDtBQUNEO0FBRU8sTUFBTSxpQkFBTixNQUFNLHVCQUFzQixXQUFrRjtBQUFBO0FBQUEsRUFnQ3BILFlBQVksU0FBOEIsVUFBa0IscUJBQTJDLFFBQTBCLGtCQUFzQztBQUV0SyxVQUFNO0FBeEJQLFNBQVEsVUFBK0IsQ0FBQztBQVd4QyxTQUFRLG9CQUFvQjtBQUU1QixTQUFRLGNBQXVCO0FBRS9CLFNBQWlCLCtCQUErQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUNwRixTQUFRLGNBQXVCO0FBSS9CLFNBQVEsVUFBbUI7QUFLMUIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssU0FBUztBQUVkLFNBQUssbUJBQW1CLG9CQUFvQix1QkFBTyxPQUFPLElBQUk7QUFFOUQsUUFBSSxPQUFPLEtBQUssaUJBQWlCLG9CQUFvQixVQUFVO0FBQzlELFdBQUssaUJBQWlCLGtCQUFrQixlQUFjO0FBQUEsSUFDdkQsV0FBVyxLQUFLLGlCQUFpQixrQkFBa0IsR0FBRztBQUNyRCxXQUFLLGlCQUFpQixrQkFBa0I7QUFBQSxJQUN6QztBQUVBLFNBQUssZ0JBQWdCLFNBQVMsY0FBYyxRQUFRO0FBQ3BELFNBQUssY0FBYyxZQUFZO0FBRS9CLFFBQUksT0FBTyxLQUFLLGlCQUFpQixjQUFjLFVBQVU7QUFDeEQsV0FBSyxjQUFjLGFBQWEsY0FBYyxLQUFLLGlCQUFpQixTQUFTO0FBQUEsSUFDOUU7QUFFQSxRQUFJLE9BQU8sS0FBSyxpQkFBaUIsb0JBQW9CLFVBQVU7QUFDOUQsV0FBSyxjQUFjLGFBQWEsb0JBQW9CLEtBQUssaUJBQWlCLGVBQWU7QUFBQSxJQUMxRjtBQUVBLFNBQUssZUFBZSxJQUFJLFFBQXFCO0FBQzdDLFNBQUssVUFBVSxLQUFLLFlBQVk7QUFFaEMsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyx3QkFBd0IsbUJBQW1CO0FBRWhELFNBQUssV0FBVyxZQUFZO0FBRTVCLFFBQUksU0FBUztBQUNaLFdBQUssV0FBVyxTQUFTLFFBQVE7QUFBQSxJQUNsQztBQUVBLFNBQUssZUFBZTtBQUFBLEVBRXJCO0FBQUEsRUFFUSxTQUFTLE9BQXFCO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLFVBQVUsT0FBTztBQUMxQixXQUFLLFNBQVMsS0FBSyxVQUFVLDBCQUEwQixFQUFFLGtCQUFrQix3QkFBd0IsT0FBTyxHQUFHLEtBQUssZUFBZSxLQUFLLENBQUM7QUFBQSxJQUN4SSxXQUFXLEtBQUssUUFBUTtBQUN2QixXQUFLLE9BQU8sT0FBTyxLQUFLO0FBQUEsSUFDekI7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUlBLFlBQW9CO0FBQ25CLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxnQkFBd0I7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHdCQUF3QixxQkFBMkM7QUFHMUUsU0FBSyxzQkFBc0I7QUFDM0IsU0FBSywwQkFBMEIsSUFBSSxFQUFFLHVDQUF1QztBQUc1RSxTQUFLLHVCQUF1QixJQUFJLE9BQU8sS0FBSyx5QkFBeUIsRUFBRSwwQkFBMEIsQ0FBQztBQUdsRyxVQUFNLHVCQUF1QixJQUFJLE9BQU8sS0FBSyx5QkFBeUIsRUFBRSw4Q0FBOEMsQ0FBQztBQUN2SCxVQUFNLHVCQUF1QixJQUFJLE9BQU8sc0JBQXNCLEVBQUUsb0JBQW9CLENBQUM7QUFDckYsU0FBSyxzQkFBc0IsU0FBUyxjQUFjLE1BQU07QUFDeEQsU0FBSyxvQkFBb0IsWUFBWTtBQUNyQyxRQUFJLE9BQU8sc0JBQXNCLEtBQUssbUJBQW1CO0FBR3pELFNBQUssb0JBQW9CLGVBQWU7QUFHeEMsU0FBSyxlQUFlLGlCQUFpQixpQkFBaUIsS0FBSyx1QkFBdUI7QUFHbEYsU0FBSyx3QkFBd0IsYUFBYSxhQUFhLE1BQU07QUFDN0QsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUsseUJBQXlCLElBQUksVUFBVSxZQUFZLENBQUMsTUFBTTtBQUN2RyxVQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxvQkFBb0I7QUFJM0IsU0FBSyxVQUFVLElBQUksOEJBQThCLEtBQUssZUFBZSxVQUFVLENBQUMsTUFBTTtBQUNyRixXQUFLLFdBQVcsRUFBRSxPQUFPO0FBQ3pCLFdBQUssYUFBYSxLQUFLO0FBQUEsUUFDdEIsT0FBTyxFQUFFLE9BQU87QUFBQSxRQUNoQixVQUFVLEVBQUUsT0FBTztBQUFBLE1BQ3BCLENBQUM7QUFDRCxVQUFJLENBQUMsQ0FBQyxLQUFLLFFBQVEsS0FBSyxRQUFRLEtBQUssQ0FBQyxDQUFDLEtBQUssUUFBUSxLQUFLLFFBQVEsRUFBRSxNQUFNO0FBQ3hFLGFBQUssU0FBUyxLQUFLLFFBQVEsS0FBSyxRQUFRLEVBQUUsSUFBSTtBQUFBLE1BQy9DO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFLRixTQUFLLFVBQVUsSUFBSSxzQkFBc0IsS0FBSyxlQUFlLElBQUksVUFBVSxPQUFPLENBQUMsTUFBTTtBQUN4RixVQUFJLFlBQVksS0FBSyxDQUFDO0FBRXRCLFVBQUksS0FBSyxZQUFZO0FBQ3BCLGFBQUssbUJBQW1CLElBQUk7QUFBQSxNQUM3QixPQUFPO0FBQ04sYUFBSyxtQkFBbUI7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssZUFBZSxJQUFJLFVBQVUsWUFBWSxDQUFDLE1BQU07QUFDN0YsVUFBSSxZQUFZLEtBQUssQ0FBQztBQUFBLElBQ3ZCLENBQUMsQ0FBQztBQUtGLFFBQUk7QUFDSixTQUFLLFVBQVUsSUFBSSxzQkFBc0IsS0FBSyxlQUFlLGNBQWMsQ0FBQyxNQUFNO0FBQ2pGLGtDQUE0QixLQUFLO0FBQUEsSUFDbEMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssZUFBZSxZQUFZLENBQUMsTUFBTTtBQUMvRSxVQUFJLFlBQVksS0FBSyxDQUFDO0FBRXRCLFVBQUksMkJBQTJCO0FBQzlCLGFBQUssbUJBQW1CLElBQUk7QUFBQSxNQUM3QixPQUFPO0FBQ04sYUFBSyxtQkFBbUI7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBSUYsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssZUFBZSxJQUFJLFVBQVUsVUFBVSxDQUFDLE1BQXFCO0FBQzFHLFlBQU0sUUFBUSxJQUFJLHNCQUFzQixDQUFDO0FBQ3pDLFVBQUksZUFBZTtBQUduQixVQUFJLGFBQWE7QUFDaEIsWUFBSSxNQUFNLFlBQVksUUFBUSxhQUFhLE1BQU0sWUFBWSxRQUFRLFdBQVcsTUFBTSxZQUFZLFFBQVEsU0FBUyxNQUFNLFlBQVksUUFBUSxPQUFPO0FBQ25KLHlCQUFlO0FBQUEsUUFDaEI7QUFBQSxNQUNELE9BQU87QUFDTixZQUFJLE1BQU0sWUFBWSxRQUFRLGFBQWEsTUFBTSxVQUFVLE1BQU0sWUFBWSxRQUFRLFdBQVcsTUFBTSxVQUFVLE1BQU0sWUFBWSxRQUFRLFNBQVMsTUFBTSxZQUFZLFFBQVEsT0FBTztBQUNuTCx5QkFBZTtBQUFBLFFBQ2hCO0FBQUEsTUFDRDtBQUVBLFVBQUksY0FBYztBQUNqQixhQUFLLG1CQUFtQjtBQUN4QixZQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFBQSxNQUM3QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRUEsSUFBVyxjQUFrQztBQUM1QyxXQUFPLEtBQUssYUFBYTtBQUFBLEVBQzFCO0FBQUEsRUFFTyxXQUFXLFNBQThCLFVBQXlCO0FBQ3hFLFFBQUksQ0FBQyxPQUFPLE9BQU8sS0FBSyxTQUFTLE9BQU8sR0FBRztBQUMxQyxXQUFLLFVBQVU7QUFDZixXQUFLLGNBQWMsUUFBUSxTQUFTO0FBQ3BDLFdBQUssY0FBYztBQUNuQixXQUFLLDBCQUEwQjtBQUUvQixXQUFLLFFBQVEsUUFBUSxDQUFDLFFBQVEsVUFBVTtBQUN2QyxhQUFLLGNBQWMsSUFBSSxLQUFLLGFBQWEsT0FBTyxNQUFNLE9BQU8sT0FBTyxVQUFVLENBQUM7QUFDL0UsWUFBSSxPQUFPLE9BQU8sZ0JBQWdCLFVBQVU7QUFDM0MsZUFBSyxjQUFjO0FBQUEsUUFDcEI7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBRUEsUUFBSSxhQUFhLFFBQVc7QUFDM0IsV0FBSyxPQUFPLFFBQVE7QUFFcEIsV0FBSyxvQkFBb0IsS0FBSztBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUFBLEVBRU8sV0FBVyxRQUF1QjtBQUN4QyxTQUFLLGNBQWMsV0FBVyxDQUFDO0FBQUEsRUFDaEM7QUFBQSxFQUVRLGlCQUFpQjtBQUl4QixTQUFLLFlBQVksT0FBTyxHQUFHLEtBQUssV0FBVyxRQUFRLEtBQUssT0FBTztBQUFBLEVBQ2hFO0FBQUEsRUFFTyxPQUFPLE9BQXFCO0FBRWxDLFFBQUksU0FBUyxLQUFLLFFBQVEsS0FBSyxRQUFRLFFBQVE7QUFDOUMsV0FBSyxXQUFXO0FBQUEsSUFDakIsV0FBVyxRQUFRLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFHM0MsV0FBSyxPQUFPLEtBQUssUUFBUSxTQUFTLENBQUM7QUFBQSxJQUNwQyxXQUFXLEtBQUssV0FBVyxHQUFHO0FBQzdCLFdBQUssV0FBVztBQUFBLElBQ2pCO0FBRUEsU0FBSyxjQUFjLGdCQUFnQixLQUFLO0FBQ3hDLFFBQUksQ0FBQyxDQUFDLEtBQUssUUFBUSxLQUFLLFFBQVEsS0FBSyxDQUFDLENBQUMsS0FBSyxRQUFRLEtBQUssUUFBUSxFQUFFLE1BQU07QUFDeEUsV0FBSyxTQUFTLEtBQUssUUFBUSxLQUFLLFFBQVEsRUFBRSxJQUFJO0FBQUEsSUFDL0M7QUFBQSxFQUNEO0FBQUEsRUFFTyxhQUFhLE9BQXFCO0FBQ3hDLFNBQUssaUJBQWlCLFlBQVk7QUFDbEMsU0FBSyxjQUFjLGFBQWEsY0FBYyxLQUFLLGlCQUFpQixTQUFTO0FBQUEsRUFDOUU7QUFBQSxFQUVPLFFBQWM7QUFDcEIsUUFBSSxLQUFLLGVBQWU7QUFDdkIsV0FBSyxjQUFjLFdBQVc7QUFDOUIsV0FBSyxjQUFjLE1BQU07QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLE9BQWE7QUFDbkIsUUFBSSxLQUFLLGVBQWU7QUFDdkIsV0FBSyxjQUFjLFdBQVc7QUFDOUIsV0FBSyxjQUFjLEtBQUs7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLGFBQWEsV0FBMEI7QUFDN0MsU0FBSyxjQUFjLFdBQVcsWUFBWSxJQUFJO0FBQUEsRUFDL0M7QUFBQSxFQUVPLE9BQU8sV0FBOEI7QUFDM0MsU0FBSyxZQUFZO0FBQ2pCLGNBQVUsVUFBVSxJQUFJLGtCQUFrQjtBQUMxQyxjQUFVLFlBQVksS0FBSyxhQUFhO0FBQ3hDLFNBQUssbUJBQW1CO0FBQUEsRUFDekI7QUFBQSxFQUVRLGlCQUF1QjtBQUU5QixVQUFNLFVBQW9CLENBQUM7QUFJM0IsUUFBSSxLQUFLLE9BQU8scUJBQXFCO0FBQ3BDLGNBQVEsS0FBSyx5SUFBeUksS0FBSyxPQUFPLG1CQUFtQixnQkFBZ0I7QUFBQSxJQUN0TTtBQUVBLFFBQUksS0FBSyxPQUFPLHFCQUFxQjtBQUNwQyxjQUFRLEtBQUssOEhBQThILEtBQUssT0FBTyxtQkFBbUIsZ0JBQWdCO0FBQUEsSUFDM0w7QUFFQSxRQUFJLEtBQUssT0FBTywwQkFBMEI7QUFDekMsY0FBUSxLQUFLLDRKQUE0SixLQUFLLE9BQU8sd0JBQXdCLEtBQUs7QUFBQSxJQUNuTjtBQUVBLFFBQUksS0FBSyxPQUFPLG9CQUFvQixLQUFLLE9BQU8sZ0JBQWdCLEtBQUssT0FBTyxpQkFBaUIsS0FBSyxPQUFPLGtCQUFrQjtBQUMxSCxjQUFRLEtBQUssNkRBQTZELEtBQUssT0FBTyxZQUFZLEtBQUs7QUFDdkcsY0FBUSxLQUFLLHVHQUF1RyxLQUFLLE9BQU8sWUFBWSxLQUFLO0FBQ2pKLGNBQVEsS0FBSyw2R0FBNkcsS0FBSyxPQUFPLFlBQVksS0FBSztBQUFBLElBRXhKLFdBQ1MsS0FBSyxPQUFPLGtCQUFrQjtBQUN0QyxjQUFRLEtBQUssdUdBQXVHLEtBQUssT0FBTyxnQkFBZ0IsS0FBSztBQUNySixjQUFRLEtBQUssNkdBQTZHLEtBQUssT0FBTyxnQkFBZ0IsS0FBSztBQUFBLElBQzVKO0FBR0EsUUFBSSxLQUFLLE9BQU8scUJBQXFCO0FBQ3BDLGNBQVEsS0FBSyxnS0FBZ0ssS0FBSyxPQUFPLG1CQUFtQixnQkFBZ0I7QUFBQSxJQUM3TjtBQUdBLFFBQUksS0FBSyxPQUFPLHFCQUFxQjtBQUNwQyxjQUFRLEtBQUssMktBQTJLLEtBQUssT0FBTyxtQkFBbUIsZ0JBQWdCO0FBQUEsSUFDeE87QUFHQSxRQUFJLEtBQUssT0FBTyxrQkFBa0I7QUFDakMsY0FBUSxLQUFLLDBJQUEwSSxLQUFLLE9BQU8sZ0JBQWdCLGlEQUFpRDtBQUFBLElBQ3JPO0FBRUEsUUFBSSxLQUFLLE9BQU8sa0JBQWtCO0FBQ2pDLGNBQVEsS0FBSyw0S0FBNEssS0FBSyxPQUFPLGdCQUFnQixpREFBaUQ7QUFBQSxJQUN2UTtBQUdBLFlBQVEsS0FBSyxzT0FBc087QUFDblAsWUFBUSxLQUFLLG9PQUFvTztBQUVqUCxTQUFLLGFBQWEsY0FBYyxRQUFRLEtBQUssSUFBSTtBQUFBLEVBQ2xEO0FBQUEsRUFFUSxxQkFBMkI7QUFDbEMsVUFBTSxhQUFhLEtBQUssT0FBTyxvQkFBb0I7QUFDbkQsVUFBTSxhQUFhLEtBQUssT0FBTyxvQkFBb0I7QUFDbkQsVUFBTSxTQUFTLEtBQUssT0FBTyxnQkFBZ0I7QUFFM0MsU0FBSyxjQUFjLE1BQU0sa0JBQWtCO0FBQzNDLFNBQUssY0FBYyxNQUFNLFFBQVE7QUFDakMsU0FBSyxjQUFjLE1BQU0sY0FBYztBQUFBLEVBQ3hDO0FBQUEsRUFFUSxZQUFZO0FBQ25CLFVBQU0sYUFBYSxLQUFLLE9BQU8sb0JBQW9CO0FBRW5ELFVBQU0saUJBQWlCLE1BQU0sc0JBQXNCLEtBQUssT0FBTyxzQkFBc0IsVUFBVTtBQUMvRixTQUFLLHdCQUF3QixNQUFNLGtCQUFrQjtBQUNyRCxTQUFLLDRCQUE0QixNQUFNLGtCQUFrQjtBQUN6RCxTQUFLLHFCQUFxQixNQUFNLGtCQUFrQjtBQUVsRCxTQUFLLFdBQVcsTUFBTSxLQUFLLE1BQU07QUFBQSxFQUNsQztBQUFBLEVBRVEsYUFBYSxPQUFlLE9BQWUsVUFBdUM7QUFDekYsVUFBTSxTQUFTLFNBQVMsY0FBYyxRQUFRO0FBQzlDLFdBQU8sUUFBUTtBQUNmLFdBQU8sT0FBTztBQUNkLFdBQU8sV0FBVyxDQUFDLENBQUM7QUFFcEIsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBSVEscUJBQXFCO0FBQzVCLFNBQUsscUJBQXFCLGNBQWM7QUFFeEMsUUFBSSxDQUFDLEtBQUssdUJBQXVCLEtBQUssWUFBWTtBQUNqRDtBQUFBLElBQ0Q7QUFHQSxTQUFLLGlCQUFpQixLQUFLLHVCQUF1QjtBQUNsRCxTQUFLLGVBQWU7QUFNcEIsU0FBSyxvQkFBb0IsZ0JBQWdCO0FBQUEsTUFDeEMsV0FBVyxNQUFNLEtBQUs7QUFBQSxNQUN0QixRQUFRLENBQUMsY0FBMkIsS0FBSyxxQkFBcUIsV0FBVyxJQUFJO0FBQUEsTUFDN0UsUUFBUSxNQUFNO0FBQ2IsYUFBSyxxQkFBcUI7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsUUFBUSxNQUFNO0FBQ2IsYUFBSyx3QkFBd0IsVUFBVSxPQUFPLFNBQVM7QUFBQSxNQUN4RDtBQUFBLE1BQ0EsZ0JBQWdCLEtBQUs7QUFBQSxJQUN0QixHQUFHLEtBQUssaUJBQWlCLG9CQUFvQixLQUFLLFlBQVksTUFBUztBQUd2RSxTQUFLLGFBQWE7QUFDbEIsU0FBSyxtQkFBbUIsS0FBSztBQUU3QixTQUFLLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUN4QyxXQUFXLE1BQU0sS0FBSztBQUFBLE1BQ3RCLFFBQVEsQ0FBQyxjQUEyQixLQUFLLHFCQUFxQixTQUFTO0FBQUEsTUFDdkUsUUFBUSxNQUFNLEtBQUsscUJBQXFCO0FBQUEsTUFDeEMsUUFBUSxNQUFNO0FBQ2IsYUFBSyx3QkFBd0IsVUFBVSxPQUFPLFNBQVM7QUFBQSxNQUN4RDtBQUFBLE1BQ0EsZ0JBQWdCLEtBQUs7QUFBQSxJQUN0QixHQUFHLEtBQUssaUJBQWlCLG9CQUFvQixLQUFLLFlBQVksTUFBUztBQUd2RSxTQUFLLG9CQUFvQixLQUFLO0FBQzlCLFNBQUssYUFBYTtBQUNsQixTQUFLLGNBQWMsYUFBYSxpQkFBaUIsTUFBTTtBQUFBLEVBQ3hEO0FBQUEsRUFFUSxtQkFBbUIsYUFBc0I7QUFDaEQsUUFBSSxDQUFDLEtBQUssdUJBQXVCLENBQUMsS0FBSyxZQUFZO0FBQ2xEO0FBQUEsSUFDRDtBQUVBLFNBQUssYUFBYTtBQUNsQixTQUFLLGNBQWMsYUFBYSxpQkFBaUIsT0FBTztBQUV4RCxRQUFJLGFBQWE7QUFDaEIsV0FBSyxjQUFjLE1BQU07QUFBQSxJQUMxQjtBQUVBLFNBQUssb0JBQW9CLGdCQUFnQjtBQUFBLEVBQzFDO0FBQUEsRUFFUSxxQkFBcUIsV0FBd0IsbUJBQTBDO0FBQzlGLGNBQVUsWUFBWSxLQUFLLHVCQUF1QjtBQUdsRCxVQUFNLG1CQUFtQixJQUFJLFVBQVUsS0FBSyxhQUFhLEVBQUUsaUJBQWlCLEtBQUssYUFBYSxFQUFFO0FBQ2hHLFFBQUksa0JBQWtCO0FBQ3JCLFdBQUssd0JBQXdCLE1BQU0sV0FBVztBQUFBLElBQy9DO0FBR0EsU0FBSyxxQkFBcUIsaUJBQWlCO0FBRTNDLFdBQU87QUFBQSxNQUNOLFNBQVMsTUFBTTtBQUVkLGFBQUssd0JBQXdCLE9BQU87QUFBQSxNQUNyQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdRLDBCQUFrQztBQUN6QyxRQUFJLHVCQUF1QjtBQUMzQixTQUFLLFFBQVEsUUFBUSxDQUFDLFNBQVMsVUFBVTtBQUN4QyxXQUFLLGFBQWEsS0FBSztBQUV2QixVQUFJLEtBQUsscUJBQXFCLGVBQWUsc0JBQXNCO0FBQ2xFLCtCQUF1QixLQUFLLHFCQUFxQjtBQUFBLE1BQ2xEO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHFCQUFxQixtQkFBc0M7QUFHbEUsUUFBSSxLQUFLLGFBQWE7QUFDckIsYUFBTztBQUFBLElBQ1I7QUFNQSxRQUFJLEtBQUssWUFBWTtBQUdwQixXQUFLLHdCQUF3QixVQUFVLElBQUksU0FBUztBQUVwRCxZQUFNLFNBQVMsSUFBSSxVQUFVLEtBQUssYUFBYTtBQUMvQyxZQUFNLGlCQUFpQixJQUFJLHVCQUF1QixLQUFLLGFBQWE7QUFDcEUsWUFBTSwrQkFBZ0MsT0FBTyxjQUFjLGVBQWUsTUFBTSxlQUFlLFVBQVUsS0FBSyxpQkFBaUIsbUJBQW1CO0FBQ2xKLFlBQU0sK0JBQWdDLGVBQWUsTUFBTSxlQUFjO0FBR3pFLFlBQU0sY0FBYyxLQUFLLGNBQWM7QUFDdkMsWUFBTSxpQkFBaUIsS0FBSyx1QkFBdUIsS0FBSyxtQkFBbUI7QUFDM0UsWUFBTSxxQkFBcUIsR0FBRyxLQUFLLElBQUksZ0JBQWdCLEtBQUssTUFBTSxXQUFXLENBQUMsQ0FBQztBQUUvRSxXQUFLLHdCQUF3QixNQUFNLFFBQVE7QUFHM0MsV0FBSyxXQUFXLGVBQWUsRUFBRSxNQUFNLFNBQVM7QUFDaEQsV0FBSyxXQUFXLE9BQU87QUFDdkIsVUFBSSxhQUFhLEtBQUssV0FBVztBQUVqQyxVQUFJLEtBQUssZUFBZSxLQUFLLDRCQUE0QixRQUFXO0FBQ25FLGFBQUssMEJBQTBCLEtBQUssd0JBQXdCO0FBQUEsTUFDN0Q7QUFDQSxZQUFNLHVCQUF1QixLQUFLLGNBQWMsS0FBSywwQkFBMkI7QUFFaEYsWUFBTSw0QkFBNEIsYUFBYTtBQUMvQyxZQUFNLHlCQUEyQixLQUFLLE9BQU8sK0JBQStCLHdCQUF3QixLQUFLLFVBQVUsQ0FBQztBQUNwSCxZQUFNLHlCQUEyQixLQUFLLE9BQU8sK0JBQStCLHdCQUF3QixLQUFLLFVBQVUsQ0FBQztBQU9wSCxVQUFJLG1CQUFtQjtBQUt0QixZQUFLLGVBQWUsTUFBTSxlQUFlLFNBQVcsT0FBTyxjQUFjLE1BQ3JFLGVBQWUsTUFBTSxlQUFjLHVDQUNqQyx5QkFBeUIsS0FBTyx5QkFBeUIsR0FBSztBQUVuRSxpQkFBTztBQUFBLFFBQ1I7QUFJQSxZQUFJLHlCQUF5QixlQUFjLG1DQUN2Qyx5QkFBeUIsMEJBQ3pCLEtBQUssUUFBUSxTQUFTLHdCQUN4QjtBQUNELGVBQUssb0JBQW9CLGVBQWU7QUFDeEMsZUFBSyw0QkFBNEIsT0FBTztBQUN4QyxlQUFLLHFCQUFxQixPQUFPO0FBQ2pDLGVBQUssd0JBQXdCLFlBQVksS0FBSyxvQkFBb0I7QUFDbEUsZUFBSyx3QkFBd0IsWUFBWSxLQUFLLDJCQUEyQjtBQUV6RSxlQUFLLHFCQUFxQixVQUFVLE9BQU8sWUFBWTtBQUN2RCxlQUFLLHFCQUFxQixVQUFVLElBQUksZUFBZTtBQUFBLFFBRXhELE9BQU87QUFDTixlQUFLLG9CQUFvQixlQUFlO0FBQ3hDLGVBQUssNEJBQTRCLE9BQU87QUFDeEMsZUFBSyxxQkFBcUIsT0FBTztBQUNqQyxlQUFLLHdCQUF3QixZQUFZLEtBQUssMkJBQTJCO0FBQ3pFLGVBQUssd0JBQXdCLFlBQVksS0FBSyxvQkFBb0I7QUFFbEUsZUFBSyxxQkFBcUIsVUFBVSxPQUFPLGVBQWU7QUFDMUQsZUFBSyxxQkFBcUIsVUFBVSxJQUFJLFlBQVk7QUFBQSxRQUNyRDtBQUVBLGVBQU87QUFBQSxNQUNSO0FBR0EsVUFBSyxlQUFlLE1BQU0sZUFBZSxTQUFXLE9BQU8sY0FBYyxNQUNyRSxlQUFlLE1BQU0sZUFBYyx1Q0FDbEMsS0FBSyxzQkFBc0IsZUFBZSxTQUFTLHlCQUF5QixLQUM1RSxLQUFLLHNCQUFzQixlQUFlLFNBQVMseUJBQXlCLEdBQUk7QUFFcEYsYUFBSyxtQkFBbUIsSUFBSTtBQUM1QixlQUFPO0FBQUEsTUFDUjtBQUlBLFVBQUksS0FBSyxzQkFBc0IsZUFBZSxPQUFPO0FBQ3BELFlBQUksS0FBSyxjQUFjLHlCQUF5Qix5QkFBeUIsR0FBRztBQUczRSxlQUFLLG1CQUFtQixJQUFJO0FBQzVCLGlCQUFPO0FBQUEsUUFDUjtBQUdBLFlBQUksNEJBQTRCLDhCQUE4QjtBQUM3RCx1QkFBYyx5QkFBeUIsS0FBSyxVQUFVO0FBQUEsUUFDdkQ7QUFBQSxNQUNELE9BQU87QUFDTixZQUFJLDRCQUE0Qiw4QkFBOEI7QUFDN0QsdUJBQWMseUJBQXlCLEtBQUssVUFBVTtBQUFBLFFBQ3ZEO0FBQUEsTUFDRDtBQUdBLFdBQUssV0FBVyxPQUFPLFVBQVU7QUFDakMsV0FBSyxXQUFXLFNBQVM7QUFHekIsVUFBSSxLQUFLLFdBQVcsU0FBUyxHQUFHO0FBQy9CLGFBQUssV0FBVyxTQUFTLENBQUMsS0FBSyxZQUFZLENBQUMsQ0FBQztBQUM3QyxhQUFLLFdBQVcsT0FBTyxLQUFLLFdBQVcsU0FBUyxFQUFFLENBQUMsS0FBSyxDQUFDO0FBQUEsTUFDMUQ7QUFFQSxVQUFJLEtBQUssYUFBYTtBQUVyQixhQUFLLFdBQVcsZUFBZSxFQUFFLE1BQU0sU0FBUyxHQUFHLFVBQVU7QUFDN0QsYUFBSyx3QkFBd0IsTUFBTSxTQUFTO0FBQUEsTUFDN0MsT0FBTztBQUNOLGFBQUssd0JBQXdCLE1BQU0sU0FBUyxHQUFHLFVBQVU7QUFBQSxNQUMxRDtBQUVBLFdBQUssYUFBYSxLQUFLLFFBQVE7QUFFL0IsV0FBSyx3QkFBd0IsTUFBTSxRQUFRO0FBQzNDLFdBQUssNEJBQTRCLGFBQWEsWUFBWSxHQUFHO0FBRTdELGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUF1QixXQUFnQztBQUM5RCxRQUFJLGVBQWU7QUFFbkIsUUFBSSxXQUFXO0FBQ2QsVUFBSSxVQUFVO0FBQ2QsVUFBSSxnQkFBZ0I7QUFFcEIsV0FBSyxRQUFRLFFBQVEsQ0FBQyxRQUFRLFVBQVU7QUFDdkMsY0FBTSxlQUFlLENBQUMsQ0FBQyxPQUFPLFNBQVMsT0FBTyxPQUFPLFNBQVM7QUFDOUQsY0FBTSx1QkFBdUIsQ0FBQyxDQUFDLE9BQU8saUJBQWlCLE9BQU8sZUFBZSxTQUFTO0FBRXRGLGNBQU0sTUFBTSxPQUFPLEtBQUssU0FBUyxlQUFlO0FBQ2hELFlBQUksTUFBTSxlQUFlO0FBQ3hCLG9CQUFVO0FBQ1YsMEJBQWdCO0FBQUEsUUFDakI7QUFBQSxNQUNELENBQUM7QUFHRCxnQkFBVSxjQUFjLEtBQUssUUFBUSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUMsS0FBSyxRQUFRLE9BQU8sRUFBRSxpQkFBaUIsR0FBRyxLQUFLLFFBQVEsT0FBTyxFQUFFLGNBQWMsTUFBTTtBQUM1SSxxQkFBZSxJQUFJLGNBQWMsU0FBUztBQUFBLElBQzNDO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlCQUFpQixRQUEyQjtBQUduRCxRQUFJLEtBQUssWUFBWTtBQUNwQjtBQUFBLElBQ0Q7QUFHQSxTQUFLLDhCQUE4QixJQUFJLE9BQU8sUUFBUSxFQUFFLHFDQUFxQyxDQUFDO0FBRTlGLFNBQUssZUFBZSxJQUFJLG1CQUFtQjtBQUUzQyxTQUFLLGFBQWEsS0FBSyxVQUFVLElBQUksS0FBSyxtQkFBbUIsS0FBSyw2QkFBNkIsTUFBTSxDQUFDLEtBQUssWUFBWSxHQUFHO0FBQUEsTUFDekgsWUFBWTtBQUFBLE1BQ1osb0JBQW9CLG9CQUFvQjtBQUFBLE1BQ3hDLGlCQUFpQjtBQUFBLE1BQ2pCLGNBQWM7QUFBQSxNQUNkLHVCQUF1QjtBQUFBLFFBQ3RCLGNBQWMsYUFBVztBQUN4QixjQUFJLFFBQVEsYUFBYTtBQUN4QixtQkFBTyxTQUFTLHNCQUFzQixXQUFXO0FBQUEsVUFDbEQ7QUFFQSxjQUFJLFFBQVEsUUFBUTtBQUNwQixjQUFJLFFBQVEsUUFBUTtBQUNuQixxQkFBUyxLQUFLLFFBQVEsTUFBTTtBQUFBLFVBQzdCO0FBRUEsY0FBSSxRQUFRLGdCQUFnQjtBQUMzQixxQkFBUyxLQUFLLFFBQVEsY0FBYztBQUFBLFVBQ3JDO0FBRUEsY0FBSSxRQUFRLGFBQWE7QUFDeEIscUJBQVMsS0FBSyxRQUFRLFdBQVc7QUFBQSxVQUNsQztBQUVBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLFFBQ0Esb0JBQW9CLE1BQU0sU0FBUyxFQUFFLEtBQUssYUFBYSxTQUFTLENBQUMsNkNBQTZDLEVBQUUsR0FBRyxZQUFZO0FBQUEsUUFDL0gsU0FBUyxNQUFNLGNBQWMsS0FBSztBQUFBLFFBQ2xDLGVBQWUsTUFBTTtBQUFBLE1BQ3RCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixRQUFJLEtBQUssaUJBQWlCLFdBQVc7QUFDcEMsV0FBSyxXQUFXLFlBQVksS0FBSyxpQkFBaUI7QUFBQSxJQUNuRDtBQUdBLFVBQU0sWUFBWSxLQUFLLFVBQVUsSUFBSSxXQUFXLEtBQUssNkJBQTZCLFNBQVMsQ0FBQztBQUM1RixVQUFNLDBCQUEwQixNQUFNO0FBQUEsTUFBTSxVQUFVO0FBQUEsTUFBTyxDQUFBQSxPQUM1REEsR0FBRSxPQUFPLE1BQU0sS0FBSyxXQUFXLFNBQVMsQ0FBQyxFQUN2QyxJQUFJLE9BQUssSUFBSSxzQkFBc0IsQ0FBQyxDQUFDO0FBQUEsSUFDeEM7QUFFQSxTQUFLLFVBQVUsTUFBTSxNQUFNLHlCQUF5QixDQUFBQSxPQUFLQSxHQUFFLE9BQU8sT0FBSyxFQUFFLFlBQVksUUFBUSxLQUFLLENBQUMsRUFBRSxLQUFLLFNBQVMsSUFBSSxDQUFDO0FBQ3hILFNBQUssVUFBVSxNQUFNLE1BQU0seUJBQXlCLENBQUFBLE9BQUtBLEdBQUUsT0FBTyxPQUFLLEVBQUUsWUFBWSxRQUFRLEdBQUcsQ0FBQyxFQUFFLEtBQUssU0FBUyxJQUFJLENBQUM7QUFDdEgsU0FBSyxVQUFVLE1BQU0sTUFBTSx5QkFBeUIsQ0FBQUEsT0FBS0EsR0FBRSxPQUFPLE9BQUssRUFBRSxZQUFZLFFBQVEsTUFBTSxDQUFDLEVBQUUsS0FBSyxVQUFVLElBQUksQ0FBQztBQUMxSCxTQUFLLFVBQVUsTUFBTSxNQUFNLHlCQUF5QixDQUFBQSxPQUFLQSxHQUFFLE9BQU8sT0FBSyxFQUFFLFlBQVksUUFBUSxPQUFPLENBQUMsRUFBRSxLQUFLLFdBQVcsSUFBSSxDQUFDO0FBQzVILFNBQUssVUFBVSxNQUFNLE1BQU0seUJBQXlCLENBQUFBLE9BQUtBLEdBQUUsT0FBTyxPQUFLLEVBQUUsWUFBWSxRQUFRLFNBQVMsQ0FBQyxFQUFFLEtBQUssYUFBYSxJQUFJLENBQUM7QUFDaEksU0FBSyxVQUFVLE1BQU0sTUFBTSx5QkFBeUIsQ0FBQUEsT0FBS0EsR0FBRSxPQUFPLE9BQUssRUFBRSxZQUFZLFFBQVEsUUFBUSxDQUFDLEVBQUUsS0FBSyxZQUFZLElBQUksQ0FBQztBQUM5SCxTQUFLLFVBQVUsTUFBTSxNQUFNLHlCQUF5QixDQUFBQSxPQUFLQSxHQUFFLE9BQU8sT0FBSyxFQUFFLFlBQVksUUFBUSxNQUFNLENBQUMsRUFBRSxLQUFLLFVBQVUsSUFBSSxDQUFDO0FBQzFILFNBQUssVUFBVSxNQUFNLE1BQU0seUJBQXlCLENBQUFBLE9BQUtBLEdBQUUsT0FBTyxPQUFLLEVBQUUsWUFBWSxRQUFRLElBQUksQ0FBQyxFQUFFLEtBQUssUUFBUSxJQUFJLENBQUM7QUFDdEgsU0FBSyxVQUFVLE1BQU0sTUFBTSx5QkFBeUIsQ0FBQUEsT0FBS0EsR0FBRSxPQUFPLE9BQUssRUFBRSxZQUFZLFFBQVEsR0FBRyxDQUFDLEVBQUUsS0FBSyxPQUFPLElBQUksQ0FBQztBQUNwSCxTQUFLLFVBQVUsTUFBTSxNQUFNLHlCQUF5QixDQUFBQSxPQUFLQSxHQUFFLE9BQU8sT0FBTSxFQUFFLFdBQVcsUUFBUSxVQUFVLEVBQUUsV0FBVyxRQUFRLFFBQVUsRUFBRSxXQUFXLFFBQVEsYUFBYSxFQUFFLFdBQVcsUUFBUSxZQUFhLENBQUMsRUFBRSxLQUFLLGFBQWEsSUFBSSxDQUFDO0FBR3BPLFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLFdBQVcsZUFBZSxHQUFHLElBQUksVUFBVSxZQUFZLE9BQUssS0FBSyxZQUFZLENBQUMsQ0FBQyxDQUFDO0FBRTlILFNBQUssVUFBVSxLQUFLLFdBQVcsWUFBWSxPQUFLLE9BQU8sRUFBRSxVQUFVLGVBQWUsQ0FBQyxLQUFLLFFBQVEsRUFBRSxLQUFLLEdBQUcsY0FBYyxLQUFLLFdBQVcsU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUM1SixTQUFLLFVBQVUsS0FBSyxXQUFXLGlCQUFpQixPQUFLLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQztBQUV6RSxTQUFLLFVBQVUsSUFBSSxzQkFBc0IsS0FBSyx5QkFBeUIsSUFBSSxVQUFVLFdBQVcsT0FBSztBQUNwRyxVQUFJLENBQUMsS0FBSyxjQUFjLElBQUksV0FBVyxFQUFFLGVBQThCLEtBQUssdUJBQXVCLEdBQUc7QUFDckc7QUFBQSxNQUNEO0FBQ0EsV0FBSyxXQUFXO0FBQUEsSUFDakIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxXQUFXLGVBQWUsRUFBRSxhQUFhLGNBQWMsS0FBSyxpQkFBaUIsYUFBYSxFQUFFO0FBQ2pHLFNBQUssV0FBVyxlQUFlLEVBQUUsYUFBYSxpQkFBaUIsTUFBTTtBQUVyRSxTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsWUFBWSxHQUF1QjtBQUUxQyxRQUFJLENBQUMsS0FBSyxXQUFXLFFBQVE7QUFDNUI7QUFBQSxJQUNEO0FBRUEsUUFBSSxZQUFZLEtBQUssQ0FBQztBQUV0QixVQUFNLFNBQWtCLEVBQUU7QUFDMUIsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFHQSxRQUFJLE9BQU8sVUFBVSxTQUFTLFFBQVEsR0FBRztBQUN4QztBQUFBLElBQ0Q7QUFFQSxVQUFNLGlCQUFpQixPQUFPLFFBQVEsa0JBQWtCO0FBRXhELFFBQUksQ0FBQyxnQkFBZ0I7QUFDcEI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLE9BQU8sZUFBZSxhQUFhLFlBQVksQ0FBQztBQUM5RCxVQUFNLFdBQVcsZUFBZSxVQUFVLFNBQVMsaUJBQWlCO0FBR3BFLFFBQUksU0FBUyxLQUFLLFFBQVEsS0FBSyxRQUFRLFVBQVUsQ0FBQyxVQUFVO0FBQzNELFdBQUssV0FBVztBQUNoQixXQUFLLE9BQU8sS0FBSyxRQUFRO0FBRXpCLFdBQUssV0FBVyxTQUFTLENBQUMsS0FBSyxRQUFRLENBQUM7QUFDeEMsV0FBSyxXQUFXLE9BQU8sS0FBSyxXQUFXLFNBQVMsRUFBRSxDQUFDLENBQUM7QUFHcEQsVUFBSSxLQUFLLGFBQWEsS0FBSyxtQkFBbUI7QUFFN0MsYUFBSyxvQkFBb0IsS0FBSztBQUU5QixhQUFLLGFBQWEsS0FBSztBQUFBLFVBQ3RCLE9BQU8sS0FBSyxjQUFjO0FBQUEsVUFDMUIsVUFBVSxLQUFLLFFBQVEsS0FBSyxRQUFRLEVBQUU7QUFBQSxRQUV2QyxDQUFDO0FBQ0QsWUFBSSxDQUFDLENBQUMsS0FBSyxRQUFRLEtBQUssUUFBUSxLQUFLLENBQUMsQ0FBQyxLQUFLLFFBQVEsS0FBSyxRQUFRLEVBQUUsTUFBTTtBQUN4RSxlQUFLLFNBQVMsS0FBSyxRQUFRLEtBQUssUUFBUSxFQUFFLElBQUk7QUFBQSxRQUMvQztBQUFBLE1BQ0Q7QUFFQSxXQUFLLG1CQUFtQixJQUFJO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdRLGFBQW1CO0FBQzFCLFFBQUksS0FBSyxTQUFTO0FBQUU7QUFBQSxJQUFRO0FBQzVCLFFBQUksS0FBSyxhQUFhLEtBQUssbUJBQW1CO0FBRTdDLFdBQUssT0FBTyxLQUFLLGlCQUFpQjtBQUFBLElBQ25DO0FBRUEsU0FBSyxtQkFBbUIsS0FBSztBQUFBLEVBQzlCO0FBQUEsRUFHUSwwQkFBMEIsTUFBYyxlQUEwRDtBQUN6RyxVQUFNLHdCQUF3QixDQUFDLFlBQWtCO0FBQ2hELGVBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxXQUFXLFFBQVEsS0FBSztBQUNuRCxjQUFNLFFBQWlCLFFBQVEsV0FBVyxLQUFLLENBQUM7QUFFaEQsY0FBTSxVQUFVLE1BQU0sV0FBVyxNQUFNLFFBQVEsWUFBWTtBQUMzRCxZQUFJLFlBQVksT0FBTztBQUN0QixnQkFBTSxPQUFPO0FBQUEsUUFDZCxPQUFPO0FBQ04sZ0NBQXNCLEtBQUs7QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLGVBQWUsRUFBRSxPQUFPLE1BQU0sbUJBQW1CLEtBQUssR0FBRyxFQUFFLGNBQWMsQ0FBQztBQUUzRixhQUFTLFFBQVEsVUFBVSxJQUFJLGlDQUFpQztBQUNoRSwwQkFBc0IsU0FBUyxPQUFPO0FBRXRDLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdRLFlBQVksR0FBa0M7QUFFckQsUUFBSSxDQUFDLEtBQUssY0FBYyxDQUFDLEtBQUssYUFBYTtBQUMxQztBQUFBLElBQ0Q7QUFFQSxTQUFLLGFBQWEsRUFBRSxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQy9CO0FBQUEsRUFFUSxhQUFhLGVBQTZCO0FBRWpELFNBQUssNkJBQTZCLE1BQU07QUFDeEMsU0FBSyxxQkFBcUIsY0FBYztBQUV4QyxVQUFNLFNBQVMsS0FBSyxRQUFRLGFBQWE7QUFDekMsVUFBTSxjQUFjLFFBQVEsZUFBZTtBQUMzQyxVQUFNLHdCQUF3QixRQUFRLHlCQUF5QjtBQUUvRCxRQUFJLGFBQWE7QUFDaEIsVUFBSSx1QkFBdUI7QUFDMUIsY0FBTSxnQkFBZ0IsT0FBTztBQUM3QixjQUFNLFNBQVMsS0FBSyw2QkFBNkIsSUFBSSxLQUFLLDBCQUEwQixhQUFhLGFBQWEsQ0FBQztBQUMvRyxhQUFLLHFCQUFxQixZQUFZLE9BQU8sT0FBTztBQUFBLE1BQ3JELE9BQU87QUFDTixhQUFLLHFCQUFxQixjQUFjO0FBQUEsTUFDekM7QUFDQSxXQUFLLHFCQUFxQixNQUFNLFVBQVU7QUFBQSxJQUMzQyxPQUFPO0FBQ04sV0FBSyxxQkFBcUIsTUFBTSxVQUFVO0FBQUEsSUFDM0M7QUFHQSxTQUFLLGNBQWM7QUFDbkIsU0FBSyxvQkFBb0IsT0FBTztBQUNoQyxTQUFLLGNBQWM7QUFBQSxFQUNwQjtBQUFBO0FBQUE7QUFBQSxFQUtRLFNBQVMsR0FBZ0M7QUFDaEQsUUFBSSxZQUFZLEtBQUssQ0FBQztBQUd0QixTQUFLLE9BQU8sS0FBSyxpQkFBaUI7QUFDbEMsU0FBSyxtQkFBbUIsSUFBSTtBQUFBLEVBQzdCO0FBQUE7QUFBQSxFQUdRLFFBQVEsR0FBZ0M7QUFDL0MsUUFBSSxZQUFZLEtBQUssQ0FBQztBQUd0QixRQUFJLEtBQUssUUFBUSxLQUFLLFFBQVEsR0FBRyxZQUFZO0FBQzVDLFdBQUssbUJBQW1CLElBQUk7QUFDNUI7QUFBQSxJQUNEO0FBR0EsUUFBSSxLQUFLLGFBQWEsS0FBSyxtQkFBbUI7QUFDN0MsV0FBSyxvQkFBb0IsS0FBSztBQUM5QixXQUFLLGFBQWEsS0FBSztBQUFBLFFBQ3RCLE9BQU8sS0FBSyxjQUFjO0FBQUEsUUFDMUIsVUFBVSxLQUFLLFFBQVEsS0FBSyxRQUFRLEVBQUU7QUFBQSxNQUN2QyxDQUFDO0FBQ0QsVUFBSSxDQUFDLENBQUMsS0FBSyxRQUFRLEtBQUssUUFBUSxLQUFLLENBQUMsQ0FBQyxLQUFLLFFBQVEsS0FBSyxRQUFRLEVBQUUsTUFBTTtBQUN4RSxhQUFLLFNBQVMsS0FBSyxRQUFRLEtBQUssUUFBUSxFQUFFLElBQUk7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFFQSxTQUFLLG1CQUFtQixJQUFJO0FBQUEsRUFDN0I7QUFBQTtBQUFBLEVBR1EsWUFBWSxHQUFnQztBQUNuRCxRQUFJLEtBQUssV0FBVyxLQUFLLFFBQVEsU0FBUyxHQUFHO0FBQzVDLFVBQUksWUFBWSxLQUFLLEdBQUcsSUFBSTtBQUc1QixVQUFJLE9BQU8sS0FBSyxXQUFXO0FBQzNCLGFBQU8sT0FBTyxLQUFLLFFBQVEsVUFBVSxLQUFLLFFBQVEsSUFBSSxFQUFFLFlBQVk7QUFDbkU7QUFBQSxNQUNEO0FBRUEsVUFBSSxRQUFRLEtBQUssUUFBUSxRQUFRO0FBQ2hDO0FBQUEsTUFDRDtBQUVBLFdBQUssV0FBVztBQUdoQixXQUFLLE9BQU8sS0FBSyxRQUFRO0FBQ3pCLFdBQUssV0FBVyxTQUFTLENBQUMsS0FBSyxRQUFRLENBQUM7QUFDeEMsV0FBSyxXQUFXLE9BQU8sS0FBSyxXQUFXLFNBQVMsRUFBRSxDQUFDLENBQUM7QUFBQSxJQUNyRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFVBQVUsR0FBZ0M7QUFDakQsUUFBSSxLQUFLLFdBQVcsR0FBRztBQUN0QixVQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFHNUIsVUFBSSxPQUFPLEtBQUssV0FBVztBQUMzQixhQUFPLFFBQVEsS0FBSyxLQUFLLFFBQVEsSUFBSSxFQUFFLFlBQVk7QUFDbEQ7QUFBQSxNQUNEO0FBRUEsVUFBSSxPQUFPLEdBQUc7QUFDYjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLFdBQVc7QUFHaEIsV0FBSyxPQUFPLEtBQUssUUFBUTtBQUN6QixXQUFLLFdBQVcsU0FBUyxDQUFDLEtBQUssUUFBUSxDQUFDO0FBQ3hDLFdBQUssV0FBVyxPQUFPLEtBQUssV0FBVyxTQUFTLEVBQUUsQ0FBQyxDQUFDO0FBQUEsSUFDckQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxTQUFTLEdBQWdDO0FBQ2hELFFBQUksWUFBWSxLQUFLLENBQUM7QUFFdEIsU0FBSyxXQUFXLGtCQUFrQjtBQUdsQyxlQUFXLE1BQU07QUFDaEIsVUFBSSxZQUFZLEtBQUssV0FBVyxTQUFTLEVBQUUsQ0FBQztBQUc1QyxhQUFPLFlBQVksS0FBSyxLQUFLLFFBQVEsU0FBUyxFQUFFLFlBQVk7QUFDM0Q7QUFBQSxNQUNEO0FBQ0EsVUFBSSxLQUFLLFFBQVEsU0FBUyxFQUFFLFlBQVk7QUFDdkM7QUFBQSxNQUNEO0FBQ0EsV0FBSyxXQUFXO0FBQ2hCLFdBQUssV0FBVyxTQUFTLENBQUMsS0FBSyxRQUFRLENBQUM7QUFDeEMsV0FBSyxXQUFXLE9BQU8sS0FBSyxRQUFRO0FBQ3BDLFdBQUssT0FBTyxLQUFLLFFBQVE7QUFBQSxJQUMxQixHQUFHLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFFUSxXQUFXLEdBQWdDO0FBQ2xELFFBQUksWUFBWSxLQUFLLENBQUM7QUFFdEIsU0FBSyxXQUFXLGNBQWM7QUFHOUIsZUFBVyxNQUFNO0FBQ2hCLFVBQUksWUFBWSxLQUFLLFdBQVcsU0FBUyxFQUFFLENBQUM7QUFHNUMsYUFBTyxZQUFZLEtBQUssUUFBUSxTQUFTLEtBQUssS0FBSyxRQUFRLFNBQVMsRUFBRSxZQUFZO0FBQ2pGO0FBQUEsTUFDRDtBQUNBLFVBQUksS0FBSyxRQUFRLFNBQVMsRUFBRSxZQUFZO0FBQ3ZDO0FBQUEsTUFDRDtBQUNBLFdBQUssV0FBVztBQUNoQixXQUFLLFdBQVcsU0FBUyxDQUFDLEtBQUssUUFBUSxDQUFDO0FBQ3hDLFdBQUssV0FBVyxPQUFPLEtBQUssUUFBUTtBQUNwQyxXQUFLLE9BQU8sS0FBSyxRQUFRO0FBQUEsSUFDMUIsR0FBRyxDQUFDO0FBQUEsRUFDTDtBQUFBLEVBRVEsT0FBTyxHQUFnQztBQUM5QyxRQUFJLFlBQVksS0FBSyxDQUFDO0FBRXRCLFFBQUksS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM1QjtBQUFBLElBQ0Q7QUFDQSxRQUFJLFlBQVk7QUFDaEIsV0FBTyxZQUFZLEtBQUssUUFBUSxTQUFTLEtBQUssS0FBSyxRQUFRLFNBQVMsRUFBRSxZQUFZO0FBQ2pGO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxRQUFRLFNBQVMsRUFBRSxZQUFZO0FBQ3ZDO0FBQUEsSUFDRDtBQUNBLFNBQUssV0FBVztBQUNoQixTQUFLLFdBQVcsU0FBUyxDQUFDLEtBQUssUUFBUSxDQUFDO0FBQ3hDLFNBQUssV0FBVyxPQUFPLEtBQUssUUFBUTtBQUNwQyxTQUFLLE9BQU8sS0FBSyxRQUFRO0FBQUEsRUFDMUI7QUFBQSxFQUVRLE1BQU0sR0FBZ0M7QUFDN0MsUUFBSSxZQUFZLEtBQUssQ0FBQztBQUV0QixRQUFJLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDNUI7QUFBQSxJQUNEO0FBQ0EsUUFBSSxZQUFZLEtBQUssUUFBUSxTQUFTO0FBQ3RDLFdBQU8sWUFBWSxLQUFLLEtBQUssUUFBUSxTQUFTLEVBQUUsWUFBWTtBQUMzRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssUUFBUSxTQUFTLEVBQUUsWUFBWTtBQUN2QztBQUFBLElBQ0Q7QUFDQSxTQUFLLFdBQVc7QUFDaEIsU0FBSyxXQUFXLFNBQVMsQ0FBQyxLQUFLLFFBQVEsQ0FBQztBQUN4QyxTQUFLLFdBQVcsT0FBTyxLQUFLLFFBQVE7QUFDcEMsU0FBSyxPQUFPLEtBQUssUUFBUTtBQUFBLEVBQzFCO0FBQUE7QUFBQSxFQUdRLFlBQVksR0FBZ0M7QUFDbkQsVUFBTSxLQUFLLGFBQWEsU0FBUyxFQUFFLE9BQU87QUFDMUMsUUFBSSxjQUFjO0FBRWxCLGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxRQUFRLFNBQVMsR0FBRyxLQUFLO0FBQ2pELHFCQUFlLElBQUksS0FBSyxXQUFXLEtBQUssS0FBSyxRQUFRO0FBQ3JELFVBQUksS0FBSyxRQUFRLFdBQVcsRUFBRSxLQUFLLE9BQU8sQ0FBQyxFQUFFLFlBQVksTUFBTSxNQUFNLENBQUMsS0FBSyxRQUFRLFdBQVcsRUFBRSxZQUFZO0FBQzNHLGFBQUssT0FBTyxXQUFXO0FBQ3ZCLGFBQUssV0FBVyxTQUFTLENBQUMsV0FBVyxDQUFDO0FBQ3RDLGFBQUssV0FBVyxPQUFPLEtBQUssV0FBVyxTQUFTLEVBQUUsQ0FBQyxDQUFDO0FBQ3BELFlBQUksWUFBWSxLQUFLLENBQUM7QUFDdEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVnQixVQUFnQjtBQUMvQixTQUFLLG1CQUFtQixLQUFLO0FBQzdCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQTNnQ2EsZUFFWSx5Q0FBeUM7QUFGckQsZUFHWSxzQ0FBc0M7QUFIbEQsZUFJWSxrQ0FBa0M7QUFKcEQsSUFBTSxnQkFBTjsiLAogICJuYW1lcyI6IFsiJCJdCn0K
