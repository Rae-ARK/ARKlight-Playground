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
import * as cssJs from "../../../base/browser/cssValue.js";
import * as dom from "../../../base/browser/dom.js";
import { ToolBar } from "../../../base/browser/ui/toolbar/toolbar.js";
import { HoverPosition } from "../../../base/browser/ui/hover/hoverWidget.js";
import { IconLabel } from "../../../base/browser/ui/iconLabel/iconLabel.js";
import { KeybindingLabel } from "../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Checkbox, createToggleActionViewItemProvider } from "../../../base/browser/ui/toggle/toggle.js";
import { RenderIndentGuides } from "../../../base/browser/ui/tree/abstractTree.js";
import { TreeVisibility } from "../../../base/browser/ui/tree/tree.js";
import { equals } from "../../../base/common/arrays.js";
import { disposableTimeout, ThrottledDelayer } from "../../../base/common/async.js";
import { compareAnything } from "../../../base/common/comparers.js";
import { memoize } from "../../../base/common/decorators.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event, EventBufferer } from "../../../base/common/event.js";
import { getCodiconAriaLabel, matchesFuzzyIconAware, parseLabelWithIcons } from "../../../base/common/iconLabels.js";
import { Lazy } from "../../../base/common/lazy.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { observableValue, observableValueOpts, transaction } from "../../../base/common/observable.js";
import { OS } from "../../../base/common/platform.js";
import { escape, ltrim } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../list/browser/listService.js";
import { defaultCheckboxStyles } from "../../theme/browser/defaultStyles.js";
import { isDark } from "../../theme/common/theme.js";
import { IThemeService } from "../../theme/common/themeService.js";
import { QuickPickFocus } from "../common/quickInput.js";
import { quickInputButtonsToActionArrays } from "./quickInputUtils.js";
const $ = dom.$;
class BaseQuickPickItemElement {
  constructor(index, hasCheckbox, mainItem) {
    this.index = index;
    this.hasCheckbox = hasCheckbox;
    this._hidden = false;
    this._init = new Lazy(() => {
      const saneLabel = mainItem.label ?? "";
      const saneSortLabel = parseLabelWithIcons(saneLabel).text.trim();
      const saneAriaLabel = mainItem.ariaLabel || [saneLabel, this.saneDescription, this.saneDetail].map((s) => getCodiconAriaLabel(s)).filter((s) => !!s).join(", ");
      return {
        saneLabel,
        saneSortLabel,
        saneAriaLabel
      };
    });
    this._saneDescription = mainItem.description;
    this._saneTooltip = mainItem.tooltip;
  }
  // #region Lazy Getters
  get saneLabel() {
    return this._init.value.saneLabel;
  }
  get saneSortLabel() {
    return this._init.value.saneSortLabel;
  }
  get saneAriaLabel() {
    return this._init.value.saneAriaLabel;
  }
  get element() {
    return this._element;
  }
  set element(value) {
    this._element = value;
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(value) {
    this._hidden = value;
  }
  get saneDescription() {
    return this._saneDescription;
  }
  set saneDescription(value) {
    this._saneDescription = value;
  }
  get saneDetail() {
    return this._saneDetail;
  }
  set saneDetail(value) {
    this._saneDetail = value;
  }
  get saneTooltip() {
    return this._saneTooltip;
  }
  set saneTooltip(value) {
    this._saneTooltip = value;
  }
  get labelHighlights() {
    return this._labelHighlights;
  }
  set labelHighlights(value) {
    this._labelHighlights = value;
  }
  get descriptionHighlights() {
    return this._descriptionHighlights;
  }
  set descriptionHighlights(value) {
    this._descriptionHighlights = value;
  }
  get detailHighlights() {
    return this._detailHighlights;
  }
  set detailHighlights(value) {
    this._detailHighlights = value;
  }
}
class QuickPickItemElement extends BaseQuickPickItemElement {
  constructor(index, childIndex, hasCheckbox, fireButtonTriggered, _onChecked, item, _separator) {
    super(index, hasCheckbox, item);
    this.childIndex = childIndex;
    this.fireButtonTriggered = fireButtonTriggered;
    this._onChecked = _onChecked;
    this.item = item;
    this._separator = _separator;
    this._checked = false;
    this.onChecked = hasCheckbox ? Event.map(Event.filter(this._onChecked.event, (e) => e.element === this), (e) => e.checked) : Event.None;
    this._saneDetail = item.detail;
    this._labelHighlights = item.highlights?.label;
    this._descriptionHighlights = item.highlights?.description;
    this._detailHighlights = item.highlights?.detail;
  }
  get separator() {
    return this._separator;
  }
  set separator(value) {
    this._separator = value;
  }
  get checked() {
    return this._checked;
  }
  set checked(value) {
    if (value !== this._checked) {
      this._checked = value;
      this._onChecked.fire({ element: this, checked: value });
    }
  }
  get checkboxDisabled() {
    return !!this.item.disabled;
  }
}
var QuickPickSeparatorFocusReason = /* @__PURE__ */ ((QuickPickSeparatorFocusReason2) => {
  QuickPickSeparatorFocusReason2[QuickPickSeparatorFocusReason2["NONE"] = 0] = "NONE";
  QuickPickSeparatorFocusReason2[QuickPickSeparatorFocusReason2["MOUSE_HOVER"] = 1] = "MOUSE_HOVER";
  QuickPickSeparatorFocusReason2[QuickPickSeparatorFocusReason2["ACTIVE_ITEM"] = 2] = "ACTIVE_ITEM";
  return QuickPickSeparatorFocusReason2;
})(QuickPickSeparatorFocusReason || {});
class QuickPickSeparatorElement extends BaseQuickPickItemElement {
  constructor(index, fireSeparatorButtonTriggered, separator) {
    super(index, false, separator);
    this.fireSeparatorButtonTriggered = fireSeparatorButtonTriggered;
    this.separator = separator;
    this.children = new Array();
    /**
     * If this item is >0, it means that there is some item in the list that is either:
     * * hovered over
     * * active
     */
    this.focusInsideSeparator = 0 /* NONE */;
  }
}
class QuickInputItemDelegate {
  getHeight(element) {
    if (element instanceof QuickPickSeparatorElement) {
      return 30;
    }
    return element.saneDetail ? 44 : 22;
  }
  getTemplateId(element) {
    if (element instanceof QuickPickItemElement) {
      return QuickPickItemElementRenderer.ID;
    } else {
      return QuickPickSeparatorElementRenderer.ID;
    }
  }
}
class QuickInputAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("quickInput", "Quick Input");
  }
  getAriaLabel(element) {
    return element.separator?.label ? `${element.saneAriaLabel}, ${element.separator.label}` : element.saneAriaLabel;
  }
  getWidgetRole() {
    return "listbox";
  }
  getRole(element) {
    return element.hasCheckbox ? "checkbox" : "option";
  }
  isChecked(element) {
    if (!element.hasCheckbox || !(element instanceof QuickPickItemElement)) {
      return void 0;
    }
    return {
      get value() {
        return element.checked;
      },
      onDidChange: (e) => element.onChecked(() => e())
    };
  }
}
class BaseQuickInputListRenderer extends Disposable {
  constructor(hoverDelegate, toggleStyles, contextMenuService) {
    super();
    this.hoverDelegate = hoverDelegate;
    this.toggleStyles = toggleStyles;
    this.contextMenuService = contextMenuService;
    this._onDidDisposeFocusedElement = this._register(new Emitter());
    /**
     * This event is emitted when the renderer disposes an element that has focus.
     * This allows the list to re-focus itself and prevent focus from being lost
     * (potentially causing quickinput to dismiss itself) when an element is
     * removed while focused.
     */
    this.onDidDisposeFocusedElement = this._onDidDisposeFocusedElement.event;
  }
  // TODO: only do the common stuff here and have a subclass handle their specific stuff
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.toDisposeElement = new DisposableStore();
    data.toDisposeTemplate = new DisposableStore();
    data.entry = dom.append(container, $(".quick-input-list-entry"));
    const label = dom.append(data.entry, $("label.quick-input-list-label"));
    data.outerLabel = label;
    data.checkbox = data.toDisposeTemplate.add(new MutableDisposable());
    data.toDisposeTemplate.add(dom.addStandardDisposableListener(label, dom.EventType.CLICK, (e) => {
      if (data.checkbox.value && !e.defaultPrevented && data.checkbox.value.enabled) {
        const checked = !data.checkbox.value.checked;
        data.checkbox.value.checked = checked;
        data.element.checked = checked;
      }
    }));
    const rows = dom.append(label, $(".quick-input-list-rows"));
    const row1 = dom.append(rows, $(".quick-input-list-row"));
    const row2 = dom.append(rows, $(".quick-input-list-row"));
    data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
    data.toDisposeTemplate.add(data.label);
    data.icon = dom.prepend(data.label.element, $(".quick-input-list-icon"));
    const keybindingContainer = dom.append(row1, $(".quick-input-list-entry-keybinding"));
    data.keybinding = new KeybindingLabel(keybindingContainer, OS);
    data.toDisposeTemplate.add(data.keybinding);
    const detailContainer = dom.append(row2, $(".quick-input-list-label-meta"));
    data.detail = new IconLabel(detailContainer, { supportHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
    data.toDisposeTemplate.add(data.detail);
    data.separator = dom.append(data.entry, $(".quick-input-list-separator"));
    data.toolBar = new ToolBar(data.entry, this.contextMenuService, {
      ...this.hoverDelegate ? { hoverDelegate: this.hoverDelegate } : void 0,
      actionViewItemProvider: createToggleActionViewItemProvider(this.toggleStyles),
      icon: true,
      label: false
    });
    data.toolBar.getElement().classList.add("quick-input-list-entry-action-bar");
    data.toDisposeTemplate.add(data.toolBar);
    return data;
  }
  disposeTemplate(data) {
    data.toDisposeElement.dispose();
    data.toDisposeTemplate.dispose();
  }
  disposeElement(_element, _index, data) {
    if (dom.isAncestorOfActiveElement(data.entry)) {
      this._onDidDisposeFocusedElement.fire();
    }
    data.toDisposeElement.clear();
    data.toolBar.setActions([]);
  }
}
let QuickPickItemElementRenderer = class extends BaseQuickInputListRenderer {
  constructor(hoverDelegate, toggleStyles, contextMenuService, themeService) {
    super(hoverDelegate, toggleStyles, contextMenuService);
    this.themeService = themeService;
    // Follow what we do in the separator renderer
    this._itemsWithSeparatorsFrequency = /* @__PURE__ */ new Map();
  }
  get templateId() {
    return QuickPickItemElementRenderer.ID;
  }
  ensureCheckbox(element, data) {
    if (!element.hasCheckbox) {
      data.checkbox.value?.domNode.remove();
      data.checkbox.clear();
      return;
    }
    let checkbox = data.checkbox.value;
    if (!checkbox) {
      checkbox = new Checkbox(element.saneLabel, element.checked, { ...defaultCheckboxStyles, size: 15 });
      data.checkbox.value = checkbox;
      data.outerLabel.prepend(checkbox.domNode);
      checkbox.domNode.tabIndex = -1;
    } else {
      checkbox.setTitle(element.saneLabel);
    }
    if (element.checkboxDisabled) {
      checkbox.disable();
    } else {
      checkbox.enable();
    }
    checkbox.checked = element.checked;
    data.toDisposeElement.add(element.onChecked((checked) => checkbox.checked = checked));
    data.toDisposeElement.add(checkbox.onChange(() => element.checked = checkbox.checked));
  }
  renderElement(node, index, data) {
    const element = node.element;
    data.element = element;
    element.element = data.entry ?? void 0;
    const mainItem = element.item;
    element.element.classList.toggle("not-pickable", element.item.pickable === false);
    this.ensureCheckbox(element, data);
    const { labelHighlights, descriptionHighlights, detailHighlights } = element;
    if (mainItem.iconPath) {
      const icon = isDark(this.themeService.getColorTheme().type) ? mainItem.iconPath.dark : mainItem.iconPath.light ?? mainItem.iconPath.dark;
      const iconUrl = URI.revive(icon);
      data.icon.className = "quick-input-list-icon";
      data.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
    } else {
      data.icon.style.backgroundImage = "";
      data.icon.className = mainItem.iconClass ? `quick-input-list-icon ${mainItem.iconClass}` : "";
    }
    let descriptionTitle;
    if (!element.saneTooltip && element.saneDescription) {
      descriptionTitle = {
        markdown: {
          value: escape(element.saneDescription),
          supportThemeIcons: true
        },
        markdownNotSupportedFallback: element.saneDescription
      };
    }
    const options = {
      matches: labelHighlights || [],
      // If we have a tooltip, we want that to be shown and not any other hover
      descriptionTitle,
      descriptionMatches: descriptionHighlights || [],
      labelEscapeNewLines: true
    };
    options.extraClasses = mainItem.iconClasses;
    options.italic = mainItem.italic;
    options.strikethrough = mainItem.strikethrough;
    data.entry.classList.remove("quick-input-list-separator-as-item");
    data.label.setLabel(element.saneLabel, element.saneDescription, options);
    data.keybinding.set(mainItem.keybinding);
    if (element.saneDetail) {
      let title;
      if (!element.saneTooltip) {
        title = {
          markdown: {
            value: escape(element.saneDetail),
            supportThemeIcons: true
          },
          markdownNotSupportedFallback: element.saneDetail
        };
      }
      data.detail.element.style.display = "";
      data.detail.setLabel(element.saneDetail, void 0, {
        matches: detailHighlights,
        title,
        labelEscapeNewLines: true
      });
    } else {
      data.detail.element.style.display = "none";
    }
    if (element.separator?.label) {
      data.separator.textContent = element.separator.label;
      data.separator.style.display = "";
      this.addItemWithSeparator(element);
    } else {
      data.separator.style.display = "none";
    }
    data.entry.classList.toggle("quick-input-list-separator-border", !!element.separator && element.childIndex !== 0);
    const buttons = mainItem.buttons;
    if (buttons && buttons.length) {
      const { primary, secondary } = quickInputButtonsToActionArrays(
        buttons,
        "quick-input-item",
        (button) => element.fireButtonTriggered({ button, item: element.item })
      );
      data.toolBar.setActions(primary, secondary);
      data.entry.classList.add("has-actions");
    } else {
      data.toolBar.setActions([]);
      data.entry.classList.remove("has-actions");
    }
  }
  disposeElement(element, _index, data) {
    this.removeItemWithSeparator(element.element);
    super.disposeElement(element, _index, data);
  }
  isItemWithSeparatorVisible(item) {
    return this._itemsWithSeparatorsFrequency.has(item);
  }
  addItemWithSeparator(item) {
    this._itemsWithSeparatorsFrequency.set(item, (this._itemsWithSeparatorsFrequency.get(item) || 0) + 1);
  }
  removeItemWithSeparator(item) {
    const frequency = this._itemsWithSeparatorsFrequency.get(item) || 0;
    if (frequency > 1) {
      this._itemsWithSeparatorsFrequency.set(item, frequency - 1);
    } else {
      this._itemsWithSeparatorsFrequency.delete(item);
    }
  }
};
QuickPickItemElementRenderer.ID = "quickpickitem";
QuickPickItemElementRenderer = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IThemeService)
], QuickPickItemElementRenderer);
let QuickPickSeparatorElementRenderer = class extends BaseQuickInputListRenderer {
  constructor(hoverDelegate, toggleStyles, contextMenuService) {
    super(hoverDelegate, toggleStyles, contextMenuService);
    // This is a frequency map because sticky scroll re-uses the same renderer to render a second
    // instance of the same separator.
    this._visibleSeparatorsFrequency = /* @__PURE__ */ new Map();
  }
  get templateId() {
    return QuickPickSeparatorElementRenderer.ID;
  }
  get visibleSeparators() {
    return [...this._visibleSeparatorsFrequency.keys()];
  }
  isSeparatorVisible(separator) {
    return this._visibleSeparatorsFrequency.has(separator);
  }
  renderElement(node, index, data) {
    const element = node.element;
    data.element = element;
    element.element = data.entry ?? void 0;
    element.element.classList.toggle("focus-inside", !!element.focusInsideSeparator);
    const mainItem = element.separator;
    const { labelHighlights, descriptionHighlights } = element;
    data.icon.style.backgroundImage = "";
    data.icon.className = "";
    let descriptionTitle;
    if (!element.saneTooltip && element.saneDescription) {
      descriptionTitle = {
        markdown: {
          value: escape(element.saneDescription),
          supportThemeIcons: true
        },
        markdownNotSupportedFallback: element.saneDescription
      };
    }
    const options = {
      matches: labelHighlights || [],
      // If we have a tooltip, we want that to be shown and not any other hover
      descriptionTitle,
      descriptionMatches: descriptionHighlights || [],
      labelEscapeNewLines: true
    };
    data.entry.classList.add("quick-input-list-separator-as-item");
    data.label.setLabel(element.saneLabel, element.saneDescription, options);
    data.separator.style.display = "none";
    data.entry.classList.add("quick-input-list-separator-border");
    const buttons = mainItem.buttons;
    if (buttons && buttons.length) {
      const { primary, secondary } = quickInputButtonsToActionArrays(
        buttons,
        "quick-input-separator",
        (button) => element.fireSeparatorButtonTriggered({ button, separator: element.separator })
      );
      data.toolBar.setActions(primary, secondary);
      data.entry.classList.add("has-actions");
    } else {
      data.toolBar.setActions([]);
      data.entry.classList.remove("has-actions");
    }
    this.addSeparator(element);
  }
  disposeElement(element, _index, data) {
    this.removeSeparator(element.element);
    if (!this.isSeparatorVisible(element.element)) {
      element.element.element?.classList.remove("focus-inside");
    }
    super.disposeElement(element, _index, data);
  }
  addSeparator(separator) {
    this._visibleSeparatorsFrequency.set(separator, (this._visibleSeparatorsFrequency.get(separator) || 0) + 1);
  }
  removeSeparator(separator) {
    const frequency = this._visibleSeparatorsFrequency.get(separator) || 0;
    if (frequency > 1) {
      this._visibleSeparatorsFrequency.set(separator, frequency - 1);
    } else {
      this._visibleSeparatorsFrequency.delete(separator);
    }
  }
};
QuickPickSeparatorElementRenderer.ID = "quickpickseparator";
QuickPickSeparatorElementRenderer = __decorateClass([
  __decorateParam(2, IContextMenuService)
], QuickPickSeparatorElementRenderer);
let QuickInputList = class extends Disposable {
  constructor(parent, hoverDelegate, linkOpenerDelegate, id, styles, instantiationService, accessibilityService) {
    super();
    this.parent = parent;
    this.hoverDelegate = hoverDelegate;
    this.linkOpenerDelegate = linkOpenerDelegate;
    this.styles = styles;
    this.accessibilityService = accessibilityService;
    //#region QuickInputList Events
    this._onKeyDown = this._register(new Emitter());
    /**
     * Event that is fired when the tree receives a keydown.
    */
    this.onKeyDown = this._onKeyDown.event;
    this._onLeave = this._register(new Emitter());
    /**
     * Event that is fired when the tree would no longer have focus.
    */
    this.onLeave = this._onLeave.event;
    this._visibleCountObservable = observableValue("VisibleCount", 0);
    this.onChangedVisibleCount = Event.fromObservable(this._visibleCountObservable, this._store);
    this._allVisibleCheckedObservable = observableValue("AllVisibleChecked", false);
    this.onChangedAllVisibleChecked = Event.fromObservable(this._allVisibleCheckedObservable, this._store);
    this._checkedCountObservable = observableValue("CheckedCount", 0);
    this.onChangedCheckedCount = Event.fromObservable(this._checkedCountObservable, this._store);
    this._checkedElementsObservable = observableValueOpts({ equalsFn: equals }, new Array());
    this.onChangedCheckedElements = Event.fromObservable(this._checkedElementsObservable, this._store);
    this._onButtonTriggered = this._register(new Emitter());
    this.onButtonTriggered = this._onButtonTriggered.event;
    this._onSeparatorButtonTriggered = this._register(new Emitter());
    this.onSeparatorButtonTriggered = this._onSeparatorButtonTriggered.event;
    this._elementChecked = this._register(new Emitter());
    this._elementCheckedEventBufferer = new EventBufferer();
    //#endregion
    this._hasCheckboxes = false;
    this._inputElements = new Array();
    this._elementTree = new Array();
    this._itemElements = new Array();
    // Elements that apply to the current set of elements
    this._elementDisposable = this._register(new DisposableStore());
    this._matchOnDescription = false;
    this._matchOnDetail = false;
    this._matchOnLabel = true;
    this._matchOnLabelMode = "fuzzy";
    this._matchOnMeta = true;
    this._sortByLabel = true;
    this._shouldLoop = true;
    this._container = dom.append(this.parent, $(".quick-input-list"));
    this._separatorRenderer = this._register(instantiationService.createInstance(QuickPickSeparatorElementRenderer, hoverDelegate, this.styles.toggle));
    this._itemRenderer = this._register(instantiationService.createInstance(QuickPickItemElementRenderer, hoverDelegate, this.styles.toggle));
    this._tree = this._register(instantiationService.createInstance(
      WorkbenchObjectTree,
      "QuickInput",
      this._container,
      new QuickInputItemDelegate(),
      [this._itemRenderer, this._separatorRenderer],
      {
        filter: {
          filter(element) {
            return element.hidden ? TreeVisibility.Hidden : element instanceof QuickPickSeparatorElement ? TreeVisibility.Recurse : TreeVisibility.Visible;
          }
        },
        sorter: {
          compare: (element, otherElement) => {
            if (!this.sortByLabel || !this._lastQueryString) {
              return 0;
            }
            const normalizedSearchValue = this._lastQueryString.toLowerCase();
            return compareEntries(element, otherElement, normalizedSearchValue);
          }
        },
        accessibilityProvider: new QuickInputAccessibilityProvider(),
        setRowLineHeight: false,
        multipleSelectionSupport: false,
        hideTwistiesOfChildlessElements: true,
        renderIndentGuides: RenderIndentGuides.None,
        findWidgetEnabled: false,
        indent: 0,
        horizontalScrolling: false,
        allowNonCollapsibleParents: true,
        alwaysConsumeMouseWheel: true
      }
    ));
    this._tree.getHTMLElement().id = id;
    this._register(this._itemRenderer.onDidDisposeFocusedElement(() => this._tree.domFocus()));
    this._register(this._separatorRenderer.onDidDisposeFocusedElement(() => this._tree.domFocus()));
    this._registerListeners();
  }
  get onDidChangeFocus() {
    return Event.map(
      this._tree.onDidChangeFocus,
      (e) => e.elements.filter((e2) => e2 instanceof QuickPickItemElement).map((e2) => e2.item),
      this._store
    );
  }
  get onDidChangeSelection() {
    return Event.map(
      this._tree.onDidChangeSelection,
      (e) => ({
        items: e.elements.filter((e2) => e2 instanceof QuickPickItemElement).map((e2) => e2.item),
        event: e.browserEvent
      }),
      this._store
    );
  }
  get displayed() {
    return this._container.style.display !== "none";
  }
  set displayed(value) {
    this._container.style.display = value ? "" : "none";
  }
  get scrollTop() {
    return this._tree.scrollTop;
  }
  set scrollTop(scrollTop) {
    this._tree.scrollTop = scrollTop;
  }
  get ariaLabel() {
    return this._tree.ariaLabel;
  }
  set ariaLabel(label) {
    this._tree.ariaLabel = label ?? "";
  }
  set enabled(value) {
    this._tree.getHTMLElement().style.pointerEvents = value ? "" : "none";
  }
  get matchOnDescription() {
    return this._matchOnDescription;
  }
  set matchOnDescription(value) {
    this._matchOnDescription = value;
  }
  get matchOnDetail() {
    return this._matchOnDetail;
  }
  set matchOnDetail(value) {
    this._matchOnDetail = value;
  }
  get matchOnLabel() {
    return this._matchOnLabel;
  }
  set matchOnLabel(value) {
    this._matchOnLabel = value;
  }
  get matchOnLabelMode() {
    return this._matchOnLabelMode;
  }
  set matchOnLabelMode(value) {
    this._matchOnLabelMode = value;
  }
  get matchOnMeta() {
    return this._matchOnMeta;
  }
  set matchOnMeta(value) {
    this._matchOnMeta = value;
  }
  get sortByLabel() {
    return this._sortByLabel;
  }
  set sortByLabel(value) {
    this._sortByLabel = value;
  }
  get shouldLoop() {
    return this._shouldLoop;
  }
  set shouldLoop(value) {
    this._shouldLoop = value;
  }
  //#endregion
  //#region register listeners
  _registerListeners() {
    this._registerOnContainerClick();
    this._registerOnMouseMiddleClick();
    this._registerOnTreeModelChanged();
    this._registerOnElementChecked();
    this._registerOnContextMenu();
    this._registerHoverListeners();
    this._registerSelectionChangeListener();
    this._registerSeparatorActionShowingListeners();
  }
  _registerOnContainerClick() {
    this._register(dom.addDisposableListener(this._container, dom.EventType.CLICK, (e) => {
      if (e.x || e.y) {
        this._onLeave.fire();
      }
    }));
  }
  _registerOnMouseMiddleClick() {
    this._register(dom.addDisposableListener(this._container, dom.EventType.AUXCLICK, (e) => {
      if (e.button === 1) {
        this._onLeave.fire();
      }
    }));
  }
  _registerOnTreeModelChanged() {
    this._register(this._tree.onDidChangeModel(() => {
      const visibleCount = this._itemElements.filter((e) => !e.hidden).length;
      this._visibleCountObservable.set(visibleCount, void 0);
      if (this._hasCheckboxes) {
        this._updateCheckedObservables();
      }
    }));
  }
  _registerOnElementChecked() {
    this._register(this._elementCheckedEventBufferer.wrapEvent(this._elementChecked.event, (_, e) => e)((_) => this._updateCheckedObservables()));
  }
  _registerOnContextMenu() {
    this._register(this._tree.onContextMenu((e) => {
      if (e.element) {
        e.browserEvent.preventDefault();
        this._tree.setSelection([e.element]);
      }
    }));
  }
  _registerHoverListeners() {
    const delayer = this._register(new ThrottledDelayer(typeof this.hoverDelegate.delay === "function" ? this.hoverDelegate.delay() : this.hoverDelegate.delay));
    this._register(this._tree.onMouseOver(async (e) => {
      if (dom.isHTMLAnchorElement(e.browserEvent.target)) {
        delayer.cancel();
        return;
      }
      if (
        // anchors are an exception as called out above so we skip them here
        !dom.isHTMLAnchorElement(e.browserEvent.relatedTarget) && // check if the mouse is still over the same element
        dom.isAncestor(e.browserEvent.relatedTarget, e.element?.element)
      ) {
        return;
      }
      try {
        await delayer.trigger(async () => {
          if (e.element instanceof QuickPickItemElement) {
            this.showHover(e.element);
          }
        });
      } catch (e2) {
        if (!isCancellationError(e2)) {
          throw e2;
        }
      }
    }));
    this._register(this._tree.onMouseOut((e) => {
      if (dom.isAncestor(e.browserEvent.relatedTarget, e.element?.element)) {
        return;
      }
      delayer.cancel();
    }));
  }
  /**
   * Register's focus change and mouse events so that we can track when items inside of a
   * separator's section are focused or hovered so that we can display the separator's actions
   */
  _registerSeparatorActionShowingListeners() {
    this._register(this._tree.onDidChangeFocus((e) => {
      const parent = e.elements[0] ? this._tree.getParentElement(e.elements[0]) : null;
      for (const separator of this._separatorRenderer.visibleSeparators) {
        const value = separator === parent;
        const currentActive = !!(separator.focusInsideSeparator & 2 /* ACTIVE_ITEM */);
        if (currentActive !== value) {
          if (value) {
            separator.focusInsideSeparator |= 2 /* ACTIVE_ITEM */;
          } else {
            separator.focusInsideSeparator &= ~2 /* ACTIVE_ITEM */;
          }
          this._tree.rerender(separator);
        }
      }
    }));
    this._register(this._tree.onMouseOver((e) => {
      const parent = e.element ? this._tree.getParentElement(e.element) : null;
      for (const separator of this._separatorRenderer.visibleSeparators) {
        if (separator !== parent) {
          continue;
        }
        const currentMouse = !!(separator.focusInsideSeparator & 1 /* MOUSE_HOVER */);
        if (!currentMouse) {
          separator.focusInsideSeparator |= 1 /* MOUSE_HOVER */;
          this._tree.rerender(separator);
        }
      }
    }));
    this._register(this._tree.onMouseOut((e) => {
      const parent = e.element ? this._tree.getParentElement(e.element) : null;
      for (const separator of this._separatorRenderer.visibleSeparators) {
        if (separator !== parent) {
          continue;
        }
        const currentMouse = !!(separator.focusInsideSeparator & 1 /* MOUSE_HOVER */);
        if (currentMouse) {
          separator.focusInsideSeparator &= ~1 /* MOUSE_HOVER */;
          this._tree.rerender(separator);
        }
      }
    }));
  }
  _registerSelectionChangeListener() {
    this._register(this._tree.onDidChangeSelection((e) => {
      const elementsWithoutSeparators = e.elements.filter((e2) => e2 instanceof QuickPickItemElement);
      if (elementsWithoutSeparators.length !== e.elements.length) {
        if (e.elements.length === 1 && e.elements[0] instanceof QuickPickSeparatorElement) {
          this._tree.setFocus([e.elements[0].children[0]]);
          this._tree.reveal(e.elements[0], 0);
        }
        this._tree.setSelection(elementsWithoutSeparators);
      }
    }));
  }
  //#endregion
  //#region public methods
  setAllVisibleChecked(checked) {
    this._elementCheckedEventBufferer.bufferEvents(() => {
      this._itemElements.forEach((element) => {
        if (!element.hidden && !element.checkboxDisabled && element.item.pickable !== false) {
          element.checked = checked;
        }
      });
    });
  }
  setElements(inputElements) {
    this._elementDisposable.clear();
    this._lastQueryString = void 0;
    this._inputElements = inputElements;
    this._hasCheckboxes = this.parent.classList.contains("show-checkboxes");
    let currentSeparatorElement;
    this._itemElements = new Array();
    this._elementTree = inputElements.reduce((result, item, index) => {
      let element;
      if (item.type === "separator") {
        if (!item.buttons) {
          return result;
        }
        currentSeparatorElement = new QuickPickSeparatorElement(
          index,
          (e) => this._onSeparatorButtonTriggered.fire(e),
          item
        );
        element = currentSeparatorElement;
      } else {
        const previous = index > 0 ? inputElements[index - 1] : void 0;
        let separator;
        if (previous && previous.type === "separator" && !previous.buttons) {
          separator = previous;
        }
        const qpi = new QuickPickItemElement(
          index,
          currentSeparatorElement?.children ? currentSeparatorElement.children.length : index,
          this._hasCheckboxes && item.pickable !== false,
          (e) => this._onButtonTriggered.fire(e),
          this._elementChecked,
          item,
          separator
        );
        this._itemElements.push(qpi);
        if (currentSeparatorElement) {
          currentSeparatorElement.children.push(qpi);
          return result;
        }
        element = qpi;
      }
      result.push(element);
      return result;
    }, new Array());
    this._setElementsToTree(this._elementTree);
    if (this.accessibilityService.isScreenReaderOptimized()) {
      disposableTimeout(() => {
        const focusedElement = this._tree.getHTMLElement().querySelector(`.monaco-list-row.focused`);
        const parent = focusedElement?.parentNode;
        if (focusedElement && parent) {
          const nextSibling = focusedElement.nextSibling;
          focusedElement.remove();
          parent.insertBefore(focusedElement, nextSibling);
        }
      }, 0, this._elementDisposable);
    }
  }
  setFocusedElements(items) {
    const elements = items.map((item) => this._itemElements.find((e) => e.item === item)).filter((e) => !!e).filter((e) => !e.hidden);
    this._tree.setFocus(elements);
    if (items.length > 0) {
      const focused = this._tree.getFocus()[0];
      if (focused) {
        this._tree.reveal(focused);
      }
    }
  }
  getActiveDescendant() {
    return this._tree.getHTMLElement().getAttribute("aria-activedescendant");
  }
  setSelectedElements(items) {
    const elements = items.map((item) => this._itemElements.find((e) => e.item === item)).filter((e) => !!e);
    this._tree.setSelection(elements);
  }
  getCheckedElements() {
    return this._itemElements.filter((e) => e.checked).map((e) => e.item);
  }
  setCheckedElements(items) {
    this._elementCheckedEventBufferer.bufferEvents(() => {
      const checked = /* @__PURE__ */ new Set();
      for (const item of items) {
        checked.add(item);
      }
      for (const element of this._itemElements) {
        element.checked = checked.has(element.item);
      }
    });
  }
  focus(what) {
    if (!this._itemElements.length) {
      return;
    }
    if (what === QuickPickFocus.Second && this._itemElements.length < 2) {
      what = QuickPickFocus.First;
    }
    switch (what) {
      case QuickPickFocus.First:
        this._tree.scrollTop = 0;
        this._tree.focusFirst(void 0, (e) => e.element instanceof QuickPickItemElement);
        break;
      case QuickPickFocus.Second: {
        this._tree.scrollTop = 0;
        let isSecondItem = false;
        this._tree.focusFirst(void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          if (isSecondItem) {
            return true;
          }
          isSecondItem = !isSecondItem;
          return false;
        });
        break;
      }
      case QuickPickFocus.Last:
        this._tree.scrollTop = this._tree.scrollHeight;
        this._tree.focusLast(void 0, (e) => e.element instanceof QuickPickItemElement);
        break;
      case QuickPickFocus.Next: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusNext(void 0, this._shouldLoop, void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          this._tree.reveal(e.element);
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.Previous: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusPrevious(void 0, this._shouldLoop, void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          const parent = this._tree.getParentElement(e.element);
          if (parent === null || parent.children[0] !== e.element) {
            this._tree.reveal(e.element);
          } else {
            this._tree.reveal(parent);
          }
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.NextPage:
        this._tree.focusNextPage(void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          this._tree.reveal(e.element);
          return true;
        });
        break;
      case QuickPickFocus.PreviousPage:
        this._tree.focusPreviousPage(void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          const parent = this._tree.getParentElement(e.element);
          if (parent === null || parent.children[0] !== e.element) {
            this._tree.reveal(e.element);
          } else {
            this._tree.reveal(parent);
          }
          return true;
        });
        break;
      case QuickPickFocus.NextSeparator: {
        let foundSeparatorAsItem = false;
        const before = this._tree.getFocus()[0];
        this._tree.focusNext(void 0, true, void 0, (e) => {
          if (foundSeparatorAsItem) {
            return true;
          }
          if (e.element instanceof QuickPickSeparatorElement) {
            foundSeparatorAsItem = true;
            if (this._separatorRenderer.isSeparatorVisible(e.element)) {
              this._tree.reveal(e.element.children[0]);
            } else {
              this._tree.reveal(e.element, 0);
            }
          } else if (e.element instanceof QuickPickItemElement) {
            if (e.element.separator) {
              if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
                this._tree.reveal(e.element);
              } else {
                this._tree.reveal(e.element, 0);
              }
              return true;
            } else if (e.element === this._elementTree[0]) {
              this._tree.reveal(e.element, 0);
              return true;
            }
          }
          return false;
        });
        const after = this._tree.getFocus()[0];
        if (before === after) {
          this._tree.scrollTop = this._tree.scrollHeight;
          this._tree.focusLast(void 0, (e) => e.element instanceof QuickPickItemElement);
        }
        break;
      }
      case QuickPickFocus.PreviousSeparator: {
        let focusElement;
        let foundSeparator = !!this._tree.getFocus()[0]?.separator;
        this._tree.focusPrevious(void 0, true, void 0, (e) => {
          if (e.element instanceof QuickPickSeparatorElement) {
            if (foundSeparator) {
              if (!focusElement) {
                if (this._separatorRenderer.isSeparatorVisible(e.element)) {
                  this._tree.reveal(e.element);
                } else {
                  this._tree.reveal(e.element, 0);
                }
                focusElement = e.element.children[0];
              }
            } else {
              foundSeparator = true;
            }
          } else if (e.element instanceof QuickPickItemElement) {
            if (!focusElement) {
              if (e.element.separator) {
                if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
                  this._tree.reveal(e.element);
                } else {
                  this._tree.reveal(e.element, 0);
                }
                focusElement = e.element;
              } else if (e.element === this._elementTree[0]) {
                this._tree.reveal(e.element, 0);
                return true;
              }
            }
          }
          return false;
        });
        if (focusElement) {
          this._tree.setFocus([focusElement]);
        }
        break;
      }
    }
  }
  clearFocus() {
    this._tree.setFocus([]);
  }
  domFocus() {
    this._tree.domFocus();
  }
  layout(maxHeight) {
    this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${// Make sure height aligns with list item heights
    Math.floor(maxHeight / 44) * 44 + 6}px` : "";
    this._tree.layout();
  }
  filter(query) {
    this._lastQueryString = query;
    if (!(this._sortByLabel || this._matchOnLabel || this._matchOnDescription || this._matchOnDetail)) {
      this._tree.layout();
      return false;
    }
    const queryWithWhitespace = query;
    query = query.trim();
    if (!query || !(this.matchOnLabel || this.matchOnDescription || this.matchOnDetail)) {
      this._itemElements.forEach((element) => {
        element.labelHighlights = void 0;
        element.descriptionHighlights = void 0;
        element.detailHighlights = void 0;
        element.hidden = false;
        const previous = element.index && this._inputElements[element.index - 1];
        if (element.item) {
          element.separator = previous && previous.type === "separator" && !previous.buttons ? previous : void 0;
        }
      });
    } else {
      let currentSeparator;
      this._itemElements.forEach((element) => {
        let labelHighlights;
        if (this.matchOnLabelMode === "fuzzy") {
          labelHighlights = this.matchOnLabel ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneLabel)) ?? void 0 : void 0;
        } else {
          labelHighlights = this.matchOnLabel ? matchesContiguousIconAware(queryWithWhitespace, parseLabelWithIcons(element.saneLabel)) ?? void 0 : void 0;
        }
        const descriptionHighlights = this.matchOnDescription ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDescription || "")) ?? void 0 : void 0;
        const detailHighlights = this.matchOnDetail ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDetail || "")) ?? void 0 : void 0;
        if (labelHighlights || descriptionHighlights || detailHighlights) {
          element.labelHighlights = labelHighlights;
          element.descriptionHighlights = descriptionHighlights;
          element.detailHighlights = detailHighlights;
          element.hidden = false;
        } else {
          element.labelHighlights = void 0;
          element.descriptionHighlights = void 0;
          element.detailHighlights = void 0;
          element.hidden = element.item ? !element.item.alwaysShow : true;
        }
        if (element.item) {
          element.separator = void 0;
        } else if (element.separator) {
          element.hidden = true;
        }
        if (!this.sortByLabel) {
          const previous = element.index && this._inputElements[element.index - 1] || void 0;
          if (previous?.type === "separator" && !previous.buttons) {
            currentSeparator = previous;
          }
          if (currentSeparator && !element.hidden) {
            element.separator = currentSeparator;
            currentSeparator = void 0;
          }
        }
      });
    }
    this._setElementsToTree(
      this._sortByLabel && query ? this._itemElements : this._elementTree
    );
    this._tree.layout();
    return true;
  }
  toggleCheckbox() {
    this._elementCheckedEventBufferer.bufferEvents(() => {
      const elements = this._tree.getFocus().filter((e) => e instanceof QuickPickItemElement);
      const allChecked = this._allVisibleChecked(elements);
      for (const element of elements) {
        if (!element.checkboxDisabled) {
          element.checked = !allChecked;
        }
      }
    });
  }
  style(styles) {
    this._tree.style(styles);
  }
  toggleHover() {
    const focused = this._tree.getFocus()[0];
    if (!focused?.saneTooltip || !(focused instanceof QuickPickItemElement)) {
      return;
    }
    if (this._lastHover && !this._lastHover.isDisposed) {
      this._lastHover.dispose();
      return;
    }
    this.showHover(focused);
    const store = new DisposableStore();
    store.add(this._tree.onDidChangeFocus((e) => {
      if (e.elements[0] instanceof QuickPickItemElement) {
        this.showHover(e.elements[0]);
      }
    }));
    if (this._lastHover) {
      store.add(this._lastHover);
    }
    this._elementDisposable.add(store);
  }
  //#endregion
  //#region private methods
  _setElementsToTree(elements) {
    const treeElements = new Array();
    for (const element of elements) {
      if (element instanceof QuickPickSeparatorElement) {
        treeElements.push({
          element,
          collapsible: false,
          collapsed: false,
          children: element.children.map((e) => ({
            element: e,
            collapsible: false,
            collapsed: false
          }))
        });
      } else {
        treeElements.push({
          element,
          collapsible: false,
          collapsed: false
        });
      }
    }
    this._tree.setChildren(null, treeElements);
  }
  _allVisibleChecked(elements, whenNoneVisible = true) {
    for (let i = 0, n = elements.length; i < n; i++) {
      const element = elements[i];
      if (!element.hidden && element.item.pickable !== false) {
        if (!element.checked) {
          return false;
        } else {
          whenNoneVisible = true;
        }
      }
    }
    return whenNoneVisible;
  }
  _updateCheckedObservables() {
    transaction((tx) => {
      this._allVisibleCheckedObservable.set(this._allVisibleChecked(this._itemElements, false), tx);
      const checkedCount = this._itemElements.filter((element) => element.checked).length;
      this._checkedCountObservable.set(checkedCount, tx);
      this._checkedElementsObservable.set(this.getCheckedElements(), tx);
    });
  }
  /**
   * Disposes of the hover and shows a new one for the given index if it has a tooltip.
   * @param element The element to show the hover for
   */
  showHover(element) {
    if (this._lastHover && !this._lastHover.isDisposed) {
      this.hoverDelegate.onDidHideHover?.();
      this._lastHover?.dispose();
    }
    if (!element.element || !element.saneTooltip) {
      return;
    }
    this._lastHover = this.hoverDelegate.showHover({
      content: element.saneTooltip,
      target: element.element,
      linkHandler: (url) => {
        this.linkOpenerDelegate(url);
      },
      appearance: {
        showPointer: true
      },
      container: this._container,
      position: {
        hoverPosition: HoverPosition.RIGHT
      }
    }, false);
  }
};
__decorateClass([
  memoize
], QuickInputList.prototype, "onDidChangeFocus", 1);
__decorateClass([
  memoize
], QuickInputList.prototype, "onDidChangeSelection", 1);
QuickInputList = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IAccessibilityService)
], QuickInputList);
function matchesContiguousIconAware(query, target) {
  const { text, iconOffsets } = target;
  if (!iconOffsets || iconOffsets.length === 0) {
    return matchesContiguous(query, text);
  }
  const wordToMatchAgainstWithoutIconsTrimmed = ltrim(text, " ");
  const leadingWhitespaceOffset = text.length - wordToMatchAgainstWithoutIconsTrimmed.length;
  const matches = matchesContiguous(query, wordToMatchAgainstWithoutIconsTrimmed);
  if (matches) {
    for (const match of matches) {
      const iconOffset = iconOffsets[match.start + leadingWhitespaceOffset] + leadingWhitespaceOffset;
      match.start += iconOffset;
      match.end += iconOffset;
    }
  }
  return matches;
}
function matchesContiguous(word, wordToMatchAgainst) {
  const matchIndex = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
  if (matchIndex !== -1) {
    return [{ start: matchIndex, end: matchIndex + word.length }];
  }
  return null;
}
function compareEntries(elementA, elementB, lookFor) {
  const labelHighlightsA = elementA.labelHighlights || [];
  const labelHighlightsB = elementB.labelHighlights || [];
  if (labelHighlightsA.length && !labelHighlightsB.length) {
    return -1;
  }
  if (!labelHighlightsA.length && labelHighlightsB.length) {
    return 1;
  }
  if (labelHighlightsA.length === 0 && labelHighlightsB.length === 0) {
    return 0;
  }
  return compareAnything(elementA.saneSortLabel, elementB.saneSortLabel, lookFor);
}
export {
  QuickInputList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9xdWlja0lucHV0TGlzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGNzc0pzIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBBcmlhUm9sZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHR5cGUgeyBJSG92ZXJXaWRnZXQsIElNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IElJY29uTGFiZWxWYWx1ZU9wdGlvbnMsIEljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciwgSUxpc3RTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IENoZWNrYm94LCBjcmVhdGVUb2dnbGVBY3Rpb25WaWV3SXRlbVByb3ZpZGVyLCBJVG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgUmVuZGVySW5kZW50R3VpZGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvYWJzdHJhY3RUcmVlLmpzJztcbmltcG9ydCB7IElPYmplY3RUcmVlRWxlbWVudCwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyLCBUcmVlVmlzaWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0LCBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgY29tcGFyZUFueXRoaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29tcGFyZXJzLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIEV2ZW50QnVmZmVyZXIsIElWYWx1ZVdpdGhDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXRjaCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSVBhcnNlZExhYmVsV2l0aEljb25zLCBnZXRDb2RpY29uQXJpYUxhYmVsLCBtYXRjaGVzRnV6enlJY29uQXdhcmUsIHBhcnNlTGFiZWxXaXRoSWNvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlLCBvYnNlcnZhYmxlVmFsdWVPcHRzLCB0cmFuc2FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlc2NhcGUsIGx0cmltIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGVmYXVsdENoZWNrYm94U3R5bGVzIH0gZnJvbSAnLi4vLi4vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja0l0ZW1CdXR0b25FdmVudCwgSVF1aWNrUGlja1NlcGFyYXRvciwgSVF1aWNrUGlja1NlcGFyYXRvckJ1dHRvbkV2ZW50LCBRdWlja1BpY2tGb2N1cywgUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uL2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U3R5bGVzIH0gZnJvbSAnLi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IHF1aWNrSW5wdXRCdXR0b25zVG9BY3Rpb25BcnJheXMgfSBmcm9tICcuL3F1aWNrSW5wdXRVdGlscy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuaW50ZXJmYWNlIElRdWlja0lucHV0SXRlbUxhenlQYXJ0cyB7XG5cdHJlYWRvbmx5IHNhbmVMYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSBzYW5lU29ydExhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNhbmVBcmlhTGFiZWw6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElRdWlja1BpY2tFbGVtZW50IGV4dGVuZHMgSVF1aWNrSW5wdXRJdGVtTGF6eVBhcnRzIHtcblx0cmVhZG9ubHkgaGFzQ2hlY2tib3g6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGl0ZW0/OiBJUXVpY2tQaWNrSXRlbTtcblx0cmVhZG9ubHkgc2FuZURlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBzYW5lRGV0YWlsPzogc3RyaW5nO1xuXHRyZWFkb25seSBzYW5lVG9vbHRpcD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IEhUTUxFbGVtZW50O1xuXHRoaWRkZW46IGJvb2xlYW47XG5cdGVsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0bGFiZWxIaWdobGlnaHRzPzogSU1hdGNoW107XG5cdGRlc2NyaXB0aW9uSGlnaGxpZ2h0cz86IElNYXRjaFtdO1xuXHRkZXRhaWxIaWdobGlnaHRzPzogSU1hdGNoW107XG5cdHNlcGFyYXRvcj86IElRdWlja1BpY2tTZXBhcmF0b3I7XG59XG5cbmludGVyZmFjZSBJUXVpY2tJbnB1dEl0ZW1UZW1wbGF0ZURhdGEge1xuXHRlbnRyeTogSFRNTERpdkVsZW1lbnQ7XG5cdGNoZWNrYm94OiBNdXRhYmxlRGlzcG9zYWJsZTxDaGVja2JveD47XG5cdGljb246IEhUTUxEaXZFbGVtZW50O1xuXHRvdXRlckxhYmVsOiBIVE1MRWxlbWVudDtcblx0bGFiZWw6IEljb25MYWJlbDtcblx0a2V5YmluZGluZzogS2V5YmluZGluZ0xhYmVsO1xuXHRkZXRhaWw6IEljb25MYWJlbDtcblx0c2VwYXJhdG9yOiBIVE1MRGl2RWxlbWVudDtcblx0dG9vbEJhcjogVG9vbEJhcjtcblx0ZWxlbWVudDogSVF1aWNrUGlja0VsZW1lbnQ7XG5cdHRvRGlzcG9zZUVsZW1lbnQ6IERpc3Bvc2FibGVTdG9yZTtcblx0dG9EaXNwb3NlVGVtcGxhdGU6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuY2xhc3MgQmFzZVF1aWNrUGlja0l0ZW1FbGVtZW50IGltcGxlbWVudHMgSVF1aWNrUGlja0VsZW1lbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbml0OiBMYXp5PElRdWlja0lucHV0SXRlbUxhenlQYXJ0cz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcixcblx0XHRyZWFkb25seSBoYXNDaGVja2JveDogYm9vbGVhbixcblx0XHRtYWluSXRlbTogUXVpY2tQaWNrSXRlbVxuXHQpIHtcblx0XHR0aGlzLl9pbml0ID0gbmV3IExhenkoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2FuZUxhYmVsID0gbWFpbkl0ZW0ubGFiZWwgPz8gJyc7XG5cdFx0XHRjb25zdCBzYW5lU29ydExhYmVsID0gcGFyc2VMYWJlbFdpdGhJY29ucyhzYW5lTGFiZWwpLnRleHQudHJpbSgpO1xuXG5cdFx0XHRjb25zdCBzYW5lQXJpYUxhYmVsID0gbWFpbkl0ZW0uYXJpYUxhYmVsIHx8IFtzYW5lTGFiZWwsIHRoaXMuc2FuZURlc2NyaXB0aW9uLCB0aGlzLnNhbmVEZXRhaWxdXG5cdFx0XHRcdC5tYXAocyA9PiBnZXRDb2RpY29uQXJpYUxhYmVsKHMpKVxuXHRcdFx0XHQuZmlsdGVyKHMgPT4gISFzKVxuXHRcdFx0XHQuam9pbignLCAnKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c2FuZUxhYmVsLFxuXHRcdFx0XHRzYW5lU29ydExhYmVsLFxuXHRcdFx0XHRzYW5lQXJpYUxhYmVsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX3NhbmVEZXNjcmlwdGlvbiA9IG1haW5JdGVtLmRlc2NyaXB0aW9uO1xuXHRcdHRoaXMuX3NhbmVUb29sdGlwID0gbWFpbkl0ZW0udG9vbHRpcDtcblx0fVxuXG5cdC8vICNyZWdpb24gTGF6eSBHZXR0ZXJzXG5cblx0Z2V0IHNhbmVMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faW5pdC52YWx1ZS5zYW5lTGFiZWw7XG5cdH1cblx0Z2V0IHNhbmVTb3J0TGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2luaXQudmFsdWUuc2FuZVNvcnRMYWJlbDtcblx0fVxuXHRnZXQgc2FuZUFyaWFMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faW5pdC52YWx1ZS5zYW5lQXJpYUxhYmVsO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gR2V0dGVycyBhbmQgU2V0dGVyc1xuXG5cdHByaXZhdGUgX2VsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0Z2V0IGVsZW1lbnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnQ7XG5cdH1cblx0c2V0IGVsZW1lbnQodmFsdWU6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZWxlbWVudCA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZGVuID0gZmFsc2U7XG5cdGdldCBoaWRkZW4oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2hpZGRlbjtcblx0fVxuXHRzZXQgaGlkZGVuKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5faGlkZGVuID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9zYW5lRGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdGdldCBzYW5lRGVzY3JpcHRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmVEZXNjcmlwdGlvbjtcblx0fVxuXHRzZXQgc2FuZURlc2NyaXB0aW9uKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9zYW5lRGVzY3JpcHRpb24gPSB2YWx1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfc2FuZURldGFpbD86IHN0cmluZztcblx0Z2V0IHNhbmVEZXRhaWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NhbmVEZXRhaWw7XG5cdH1cblx0c2V0IHNhbmVEZXRhaWwodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3NhbmVEZXRhaWwgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3NhbmVUb29sdGlwPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQ7XG5cdGdldCBzYW5lVG9vbHRpcCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2FuZVRvb2x0aXA7XG5cdH1cblx0c2V0IHNhbmVUb29sdGlwKHZhbHVlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3NhbmVUb29sdGlwID0gdmFsdWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2xhYmVsSGlnaGxpZ2h0cz86IElNYXRjaFtdO1xuXHRnZXQgbGFiZWxIaWdobGlnaHRzKCkge1xuXHRcdHJldHVybiB0aGlzLl9sYWJlbEhpZ2hsaWdodHM7XG5cdH1cblx0c2V0IGxhYmVsSGlnaGxpZ2h0cyh2YWx1ZTogSU1hdGNoW10gfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9sYWJlbEhpZ2hsaWdodHMgPSB2YWx1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZGVzY3JpcHRpb25IaWdobGlnaHRzPzogSU1hdGNoW107XG5cdGdldCBkZXNjcmlwdGlvbkhpZ2hsaWdodHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2Rlc2NyaXB0aW9uSGlnaGxpZ2h0cztcblx0fVxuXHRzZXQgZGVzY3JpcHRpb25IaWdobGlnaHRzKHZhbHVlOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uSGlnaGxpZ2h0cyA9IHZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9kZXRhaWxIaWdobGlnaHRzPzogSU1hdGNoW107XG5cdGdldCBkZXRhaWxIaWdobGlnaHRzKCkge1xuXHRcdHJldHVybiB0aGlzLl9kZXRhaWxIaWdobGlnaHRzO1xuXHR9XG5cdHNldCBkZXRhaWxIaWdobGlnaHRzKHZhbHVlOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2RldGFpbEhpZ2hsaWdodHMgPSB2YWx1ZTtcblx0fVxufVxuXG5jbGFzcyBRdWlja1BpY2tJdGVtRWxlbWVudCBleHRlbmRzIEJhc2VRdWlja1BpY2tJdGVtRWxlbWVudCB7XG5cdHJlYWRvbmx5IG9uQ2hlY2tlZDogRXZlbnQ8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aW5kZXg6IG51bWJlcixcblx0XHRyZWFkb25seSBjaGlsZEluZGV4OiBudW1iZXIsXG5cdFx0aGFzQ2hlY2tib3g6IGJvb2xlYW4sXG5cdFx0cmVhZG9ubHkgZmlyZUJ1dHRvblRyaWdnZXJlZDogKGV2ZW50OiBJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50PElRdWlja1BpY2tJdGVtPikgPT4gdm9pZCxcblx0XHRwcml2YXRlIF9vbkNoZWNrZWQ6IEVtaXR0ZXI8eyBlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudDsgY2hlY2tlZDogYm9vbGVhbiB9Pixcblx0XHRyZWFkb25seSBpdGVtOiBJUXVpY2tQaWNrSXRlbSxcblx0XHRwcml2YXRlIF9zZXBhcmF0b3I6IElRdWlja1BpY2tTZXBhcmF0b3IgfCB1bmRlZmluZWQsXG5cdCkge1xuXHRcdHN1cGVyKGluZGV4LCBoYXNDaGVja2JveCwgaXRlbSk7XG5cblx0XHR0aGlzLm9uQ2hlY2tlZCA9IGhhc0NoZWNrYm94XG5cdFx0XHQ/IEV2ZW50Lm1hcChFdmVudC5maWx0ZXI8eyBlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudDsgY2hlY2tlZDogYm9vbGVhbiB9Pih0aGlzLl9vbkNoZWNrZWQuZXZlbnQsIGUgPT4gZS5lbGVtZW50ID09PSB0aGlzKSwgZSA9PiBlLmNoZWNrZWQpXG5cdFx0XHQ6IEV2ZW50Lk5vbmU7XG5cblx0XHR0aGlzLl9zYW5lRGV0YWlsID0gaXRlbS5kZXRhaWw7XG5cdFx0dGhpcy5fbGFiZWxIaWdobGlnaHRzID0gaXRlbS5oaWdobGlnaHRzPy5sYWJlbDtcblx0XHR0aGlzLl9kZXNjcmlwdGlvbkhpZ2hsaWdodHMgPSBpdGVtLmhpZ2hsaWdodHM/LmRlc2NyaXB0aW9uO1xuXHRcdHRoaXMuX2RldGFpbEhpZ2hsaWdodHMgPSBpdGVtLmhpZ2hsaWdodHM/LmRldGFpbDtcblx0fVxuXG5cdGdldCBzZXBhcmF0b3IoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcGFyYXRvcjtcblx0fVxuXHRzZXQgc2VwYXJhdG9yKHZhbHVlOiBJUXVpY2tQaWNrU2VwYXJhdG9yIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fc2VwYXJhdG9yID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9jaGVja2VkID0gZmFsc2U7XG5cdGdldCBjaGVja2VkKCkge1xuXHRcdHJldHVybiB0aGlzLl9jaGVja2VkO1xuXHR9XG5cdHNldCBjaGVja2VkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0aWYgKHZhbHVlICE9PSB0aGlzLl9jaGVja2VkKSB7XG5cdFx0XHR0aGlzLl9jaGVja2VkID0gdmFsdWU7XG5cdFx0XHR0aGlzLl9vbkNoZWNrZWQuZmlyZSh7IGVsZW1lbnQ6IHRoaXMsIGNoZWNrZWQ6IHZhbHVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdGdldCBjaGVja2JveERpc2FibGVkKCkge1xuXHRcdHJldHVybiAhIXRoaXMuaXRlbS5kaXNhYmxlZDtcblx0fVxufVxuXG5lbnVtIFF1aWNrUGlja1NlcGFyYXRvckZvY3VzUmVhc29uIHtcblx0LyoqXG5cdCAqIE5vIGl0ZW0gaXMgaG92ZXJlZCBvciBhY3RpdmVcblx0ICovXG5cdE5PTkUgPSAwLFxuXHQvKipcblx0ICogU29tZSBpdGVtIHdpdGhpbiB0aGlzIHNlY3Rpb24gaXMgaG92ZXJlZFxuXHQgKi9cblx0TU9VU0VfSE9WRVIgPSAxLFxuXHQvKipcblx0ICogU29tZSBpdGVtIHdpdGhpbiB0aGlzIHNlY3Rpb24gaXMgYWN0aXZlXG5cdCAqL1xuXHRBQ1RJVkVfSVRFTSA9IDJcbn1cblxuY2xhc3MgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCBleHRlbmRzIEJhc2VRdWlja1BpY2tJdGVtRWxlbWVudCB7XG5cdGNoaWxkcmVuID0gbmV3IEFycmF5PFF1aWNrUGlja0l0ZW1FbGVtZW50PigpO1xuXHQvKipcblx0ICogSWYgdGhpcyBpdGVtIGlzID4wLCBpdCBtZWFucyB0aGF0IHRoZXJlIGlzIHNvbWUgaXRlbSBpbiB0aGUgbGlzdCB0aGF0IGlzIGVpdGhlcjpcblx0ICogKiBob3ZlcmVkIG92ZXJcblx0ICogKiBhY3RpdmVcblx0ICovXG5cdGZvY3VzSW5zaWRlU2VwYXJhdG9yID0gUXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24uTk9ORTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpbmRleDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGZpcmVTZXBhcmF0b3JCdXR0b25UcmlnZ2VyZWQ6IChldmVudDogSVF1aWNrUGlja1NlcGFyYXRvckJ1dHRvbkV2ZW50KSA9PiB2b2lkLFxuXHRcdHJlYWRvbmx5IHNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvcixcblx0KSB7XG5cdFx0c3VwZXIoaW5kZXgsIGZhbHNlLCBzZXBhcmF0b3IpO1xuXHR9XG59XG5cbmNsYXNzIFF1aWNrSW5wdXRJdGVtRGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJUXVpY2tQaWNrRWxlbWVudD4ge1xuXHRnZXRIZWlnaHQoZWxlbWVudDogSVF1aWNrUGlja0VsZW1lbnQpOiBudW1iZXIge1xuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gMzA7XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50LnNhbmVEZXRhaWwgPyA0NCA6IDIyO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIFF1aWNrUGlja0l0ZW1FbGVtZW50UmVuZGVyZXIuSUQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50UmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFF1aWNrSW5wdXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJUXVpY2tQaWNrRWxlbWVudD4ge1xuXG5cdGdldFdpZGdldEFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgncXVpY2tJbnB1dCcsIFwiUXVpY2sgSW5wdXRcIik7XG5cdH1cblxuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogSVF1aWNrUGlja0VsZW1lbnQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gZWxlbWVudC5zZXBhcmF0b3I/LmxhYmVsXG5cdFx0XHQ/IGAke2VsZW1lbnQuc2FuZUFyaWFMYWJlbH0sICR7ZWxlbWVudC5zZXBhcmF0b3IubGFiZWx9YFxuXHRcdFx0OiBlbGVtZW50LnNhbmVBcmlhTGFiZWw7XG5cdH1cblxuXHRnZXRXaWRnZXRSb2xlKCk6IEFyaWFSb2xlIHtcblx0XHRyZXR1cm4gJ2xpc3Rib3gnO1xuXHR9XG5cblx0Z2V0Um9sZShlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudCkge1xuXHRcdHJldHVybiBlbGVtZW50Lmhhc0NoZWNrYm94ID8gJ2NoZWNrYm94JyA6ICdvcHRpb24nO1xuXHR9XG5cblx0aXNDaGVja2VkKGVsZW1lbnQ6IElRdWlja1BpY2tFbGVtZW50KTogSVZhbHVlV2l0aENoYW5nZUV2ZW50PGJvb2xlYW4+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWVsZW1lbnQuaGFzQ2hlY2tib3ggfHwgIShlbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBlbGVtZW50LmNoZWNrZWQ7IH0sXG5cdFx0XHRvbkRpZENoYW5nZTogZSA9PiBlbGVtZW50Lm9uQ2hlY2tlZCgoKSA9PiBlKCkpLFxuXHRcdH07XG5cdH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQmFzZVF1aWNrSW5wdXRMaXN0UmVuZGVyZXI8VCBleHRlbmRzIElRdWlja1BpY2tFbGVtZW50PiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPFQsIHZvaWQsIElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YT4ge1xuXHRhYnN0cmFjdCB0ZW1wbGF0ZUlkOiBzdHJpbmc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlRm9jdXNlZEVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHQvKipcblx0ICogVGhpcyBldmVudCBpcyBlbWl0dGVkIHdoZW4gdGhlIHJlbmRlcmVyIGRpc3Bvc2VzIGFuIGVsZW1lbnQgdGhhdCBoYXMgZm9jdXMuXG5cdCAqIFRoaXMgYWxsb3dzIHRoZSBsaXN0IHRvIHJlLWZvY3VzIGl0c2VsZiBhbmQgcHJldmVudCBmb2N1cyBmcm9tIGJlaW5nIGxvc3Rcblx0ICogKHBvdGVudGlhbGx5IGNhdXNpbmcgcXVpY2tpbnB1dCB0byBkaXNtaXNzIGl0c2VsZikgd2hlbiBhbiBlbGVtZW50IGlzXG5cdCAqIHJlbW92ZWQgd2hpbGUgZm9jdXNlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkRGlzcG9zZUZvY3VzZWRFbGVtZW50ID0gdGhpcy5fb25EaWREaXNwb3NlRm9jdXNlZEVsZW1lbnQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRvZ2dsZVN0eWxlczogSVRvZ2dsZVN0eWxlcyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0Ly8gVE9ETzogb25seSBkbyB0aGUgY29tbW9uIHN0dWZmIGhlcmUgYW5kIGhhdmUgYSBzdWJjbGFzcyBoYW5kbGUgdGhlaXIgc3BlY2lmaWMgc3R1ZmZcblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRkYXRhLnRvRGlzcG9zZUVsZW1lbnQgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGF0YS50b0Rpc3Bvc2VUZW1wbGF0ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLmVudHJ5ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5xdWljay1pbnB1dC1saXN0LWVudHJ5JykpO1xuXG5cdFx0Ly8gQ2hlY2tib3hcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoZGF0YS5lbnRyeSwgJCgnbGFiZWwucXVpY2staW5wdXQtbGlzdC1sYWJlbCcpKTtcblx0XHRkYXRhLm91dGVyTGFiZWwgPSBsYWJlbDtcblx0XHRkYXRhLmNoZWNrYm94ID0gZGF0YS50b0Rpc3Bvc2VUZW1wbGF0ZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGRhdGEudG9EaXNwb3NlVGVtcGxhdGUuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihsYWJlbCwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHQvLyBgbGFiZWxgIGVsZW1lbnRzIHdpdGggcm9sZT1jaGVja2JveGVzIGRvbid0IGF1dG9tYXRpY2FsbHkgdG9nZ2xlIHRoZW0gbGlrZSBub3JtYWwgPGNoZWNrYm94PiBlbGVtZW50c1xuXHRcdFx0aWYgKGRhdGEuY2hlY2tib3gudmFsdWUgJiYgIWUuZGVmYXVsdFByZXZlbnRlZCAmJiBkYXRhLmNoZWNrYm94LnZhbHVlLmVuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3QgY2hlY2tlZCA9ICFkYXRhLmNoZWNrYm94LnZhbHVlLmNoZWNrZWQ7XG5cdFx0XHRcdGRhdGEuY2hlY2tib3gudmFsdWUuY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0XHRcdChkYXRhLmVsZW1lbnQgYXMgUXVpY2tQaWNrSXRlbUVsZW1lbnQpLmNoZWNrZWQgPSBjaGVja2VkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJvd3Ncblx0XHRjb25zdCByb3dzID0gZG9tLmFwcGVuZChsYWJlbCwgJCgnLnF1aWNrLWlucHV0LWxpc3Qtcm93cycpKTtcblx0XHRjb25zdCByb3cxID0gZG9tLmFwcGVuZChyb3dzLCAkKCcucXVpY2staW5wdXQtbGlzdC1yb3cnKSk7XG5cdFx0Y29uc3Qgcm93MiA9IGRvbS5hcHBlbmQocm93cywgJCgnLnF1aWNrLWlucHV0LWxpc3Qtcm93JykpO1xuXG5cdFx0Ly8gTGFiZWxcblx0XHRkYXRhLmxhYmVsID0gbmV3IEljb25MYWJlbChyb3cxLCB7IHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlLCBzdXBwb3J0RGVzY3JpcHRpb25IaWdobGlnaHRzOiB0cnVlLCBzdXBwb3J0SWNvbnM6IHRydWUsIGhvdmVyRGVsZWdhdGU6IHRoaXMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRkYXRhLnRvRGlzcG9zZVRlbXBsYXRlLmFkZChkYXRhLmxhYmVsKTtcblx0XHRkYXRhLmljb24gPSBkb20ucHJlcGVuZChkYXRhLmxhYmVsLmVsZW1lbnQsICQoJy5xdWljay1pbnB1dC1saXN0LWljb24nKSk7XG5cblx0XHQvLyBLZXliaW5kaW5nXG5cdFx0Y29uc3Qga2V5YmluZGluZ0NvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93MSwgJCgnLnF1aWNrLWlucHV0LWxpc3QtZW50cnkta2V5YmluZGluZycpKTtcblx0XHRkYXRhLmtleWJpbmRpbmcgPSBuZXcgS2V5YmluZGluZ0xhYmVsKGtleWJpbmRpbmdDb250YWluZXIsIE9TKTtcblx0XHRkYXRhLnRvRGlzcG9zZVRlbXBsYXRlLmFkZChkYXRhLmtleWJpbmRpbmcpO1xuXG5cdFx0Ly8gRGV0YWlsXG5cdFx0Y29uc3QgZGV0YWlsQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3cyLCAkKCcucXVpY2staW5wdXQtbGlzdC1sYWJlbC1tZXRhJykpO1xuXHRcdGRhdGEuZGV0YWlsID0gbmV3IEljb25MYWJlbChkZXRhaWxDb250YWluZXIsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSwgaG92ZXJEZWxlZ2F0ZTogdGhpcy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdGRhdGEudG9EaXNwb3NlVGVtcGxhdGUuYWRkKGRhdGEuZGV0YWlsKTtcblxuXHRcdC8vIFNlcGFyYXRvclxuXHRcdGRhdGEuc2VwYXJhdG9yID0gZG9tLmFwcGVuZChkYXRhLmVudHJ5LCAkKCcucXVpY2staW5wdXQtbGlzdC1zZXBhcmF0b3InKSk7XG5cblx0XHQvLyBBY3Rpb25zXG5cdFx0ZGF0YS50b29sQmFyID0gbmV3IFRvb2xCYXIoZGF0YS5lbnRyeSwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdC4uLih0aGlzLmhvdmVyRGVsZWdhdGUgPyB7IGhvdmVyRGVsZWdhdGU6IHRoaXMuaG92ZXJEZWxlZ2F0ZSB9IDogdW5kZWZpbmVkKSxcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IGNyZWF0ZVRvZ2dsZUFjdGlvblZpZXdJdGVtUHJvdmlkZXIodGhpcy50b2dnbGVTdHlsZXMpLFxuXHRcdFx0aWNvbjogdHJ1ZSxcblx0XHRcdGxhYmVsOiBmYWxzZVxuXHRcdH0pO1xuXHRcdGRhdGEudG9vbEJhci5nZXRFbGVtZW50KCkuY2xhc3NMaXN0LmFkZCgncXVpY2staW5wdXQtbGlzdC1lbnRyeS1hY3Rpb24tYmFyJyk7XG5cdFx0ZGF0YS50b0Rpc3Bvc2VUZW1wbGF0ZS5hZGQoZGF0YS50b29sQmFyKTtcblxuXHRcdHJldHVybiBkYXRhO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKGRhdGE6IElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGRhdGEudG9EaXNwb3NlRWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0ZGF0YS50b0Rpc3Bvc2VUZW1wbGF0ZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRkaXNwb3NlRWxlbWVudChfZWxlbWVudDogSVRyZWVOb2RlPElRdWlja1BpY2tFbGVtZW50LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGlmIChkb20uaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudChkYXRhLmVudHJ5KSkge1xuXHRcdFx0dGhpcy5fb25EaWREaXNwb3NlRm9jdXNlZEVsZW1lbnQuZmlyZSgpO1xuXHRcdH1cblx0XHRkYXRhLnRvRGlzcG9zZUVsZW1lbnQuY2xlYXIoKTtcblx0XHRkYXRhLnRvb2xCYXIuc2V0QWN0aW9ucyhbXSk7XG5cdH1cblxuXHQvLyBUT0RPOiBvbmx5IGRvIHRoZSBjb21tb24gc3R1ZmYgaGVyZSBhbmQgaGF2ZSBhIHN1YmNsYXNzIGhhbmRsZSB0aGVpciBzcGVjaWZpYyBzdHVmZlxuXHRhYnN0cmFjdCByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxJUXVpY2tQaWNrRWxlbWVudCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQ7XG59XG5cbmNsYXNzIFF1aWNrUGlja0l0ZW1FbGVtZW50UmVuZGVyZXIgZXh0ZW5kcyBCYXNlUXVpY2tJbnB1dExpc3RSZW5kZXJlcjxRdWlja1BpY2tJdGVtRWxlbWVudD4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncXVpY2twaWNraXRlbSc7XG5cblx0Ly8gRm9sbG93IHdoYXQgd2UgZG8gaW4gdGhlIHNlcGFyYXRvciByZW5kZXJlclxuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtc1dpdGhTZXBhcmF0b3JzRnJlcXVlbmN5ID0gbmV3IE1hcDxRdWlja1BpY2tJdGVtRWxlbWVudCwgbnVtYmVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlIHwgdW5kZWZpbmVkLFxuXHRcdHRvZ2dsZVN0eWxlczogSVRvZ2dsZVN0eWxlcyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGhvdmVyRGVsZWdhdGUsIHRvZ2dsZVN0eWxlcywgY29udGV4dE1lbnVTZXJ2aWNlKTtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBRdWlja1BpY2tJdGVtRWxlbWVudFJlbmRlcmVyLklEO1xuXHR9XG5cblx0cHJpdmF0ZSBlbnN1cmVDaGVja2JveChlbGVtZW50OiBRdWlja1BpY2tJdGVtRWxlbWVudCwgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKSB7XG5cdFx0aWYgKCFlbGVtZW50Lmhhc0NoZWNrYm94KSB7XG5cdFx0XHRkYXRhLmNoZWNrYm94LnZhbHVlPy5kb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0ZGF0YS5jaGVja2JveC5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBjaGVja2JveCA9IGRhdGEuY2hlY2tib3gudmFsdWU7XG5cdFx0aWYgKCFjaGVja2JveCkge1xuXHRcdFx0Y2hlY2tib3ggPSBuZXcgQ2hlY2tib3goZWxlbWVudC5zYW5lTGFiZWwsIGVsZW1lbnQuY2hlY2tlZCwgeyAuLi5kZWZhdWx0Q2hlY2tib3hTdHlsZXMsIHNpemU6IDE1IH0pO1xuXHRcdFx0ZGF0YS5jaGVja2JveC52YWx1ZSA9IGNoZWNrYm94O1xuXHRcdFx0ZGF0YS5vdXRlckxhYmVsLnByZXBlbmQoY2hlY2tib3guZG9tTm9kZSk7XG5cdFx0XHQvLyBSZW1vdmUgY2hlY2tib3ggZnJvbSB0YWIgb3JkZXIgc2luY2UgdHJlZSBpdGVtcyBhcmUgbmF2aWdhYmxlIHdpdGggYXJyb3cga2V5c1xuXHRcdFx0Ly8gVGhpcyBwcmV2ZW50cyB0aGUgaXNzdWUgd2hlcmUgcHJlc3NpbmcgU3BhY2UgdG9nZ2xlcyBib3RoIHRoZSB0YWJiZWQgY2hlY2tib3ggYW5kIHRoZSBmb2N1c2VkIGl0ZW1cblx0XHRcdGNoZWNrYm94LmRvbU5vZGUudGFiSW5kZXggPSAtMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hlY2tib3guc2V0VGl0bGUoZWxlbWVudC5zYW5lTGFiZWwpO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50LmNoZWNrYm94RGlzYWJsZWQpIHtcblx0XHRcdGNoZWNrYm94LmRpc2FibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y2hlY2tib3guZW5hYmxlKCk7XG5cdFx0fVxuXG5cdFx0Y2hlY2tib3guY2hlY2tlZCA9IGVsZW1lbnQuY2hlY2tlZDtcblx0XHRkYXRhLnRvRGlzcG9zZUVsZW1lbnQuYWRkKGVsZW1lbnQub25DaGVja2VkKGNoZWNrZWQgPT4gY2hlY2tib3guY2hlY2tlZCA9IGNoZWNrZWQpKTtcblx0XHRkYXRhLnRvRGlzcG9zZUVsZW1lbnQuYWRkKGNoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IGVsZW1lbnQuY2hlY2tlZCA9IGNoZWNrYm94LmNoZWNrZWQpKTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFF1aWNrUGlja0l0ZW1FbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblx0XHRkYXRhLmVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdGVsZW1lbnQuZWxlbWVudCA9IGRhdGEuZW50cnkgPz8gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG1haW5JdGVtOiBJUXVpY2tQaWNrSXRlbSA9IGVsZW1lbnQuaXRlbTtcblxuXHRcdGVsZW1lbnQuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdub3QtcGlja2FibGUnLCBlbGVtZW50Lml0ZW0ucGlja2FibGUgPT09IGZhbHNlKTtcblxuXHRcdHRoaXMuZW5zdXJlQ2hlY2tib3goZWxlbWVudCwgZGF0YSk7XG5cblx0XHRjb25zdCB7IGxhYmVsSGlnaGxpZ2h0cywgZGVzY3JpcHRpb25IaWdobGlnaHRzLCBkZXRhaWxIaWdobGlnaHRzIH0gPSBlbGVtZW50O1xuXG5cdFx0Ly8gSWNvblxuXHRcdGlmIChtYWluSXRlbS5pY29uUGF0aCkge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGlzRGFyayh0aGlzLnRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkgPyBtYWluSXRlbS5pY29uUGF0aC5kYXJrIDogKG1haW5JdGVtLmljb25QYXRoLmxpZ2h0ID8/IG1haW5JdGVtLmljb25QYXRoLmRhcmspO1xuXHRcdFx0Y29uc3QgaWNvblVybCA9IFVSSS5yZXZpdmUoaWNvbik7XG5cdFx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gJ3F1aWNrLWlucHV0LWxpc3QtaWNvbic7XG5cdFx0XHRkYXRhLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gY3NzSnMuYXNDU1NVcmwoaWNvblVybCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuaWNvbi5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSAnJztcblx0XHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBtYWluSXRlbS5pY29uQ2xhc3MgPyBgcXVpY2staW5wdXQtbGlzdC1pY29uICR7bWFpbkl0ZW0uaWNvbkNsYXNzfWAgOiAnJztcblx0XHR9XG5cblx0XHQvLyBMYWJlbFxuXHRcdGxldCBkZXNjcmlwdGlvblRpdGxlOiBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdC8vIGlmIHdlIGhhdmUgYSB0b29sdGlwLCB0aGF0IHdpbGwgYmUgdGhlIGhvdmVyLFxuXHRcdC8vIHdpdGggdGhlIHNhbmVEZXNjcmlwdGlvbiBhcyBmYWxsYmFjayBpZiBpdFxuXHRcdC8vIGlzIGRlZmluZWRcblx0XHRpZiAoIWVsZW1lbnQuc2FuZVRvb2x0aXAgJiYgZWxlbWVudC5zYW5lRGVzY3JpcHRpb24pIHtcblx0XHRcdGRlc2NyaXB0aW9uVGl0bGUgPSB7XG5cdFx0XHRcdG1hcmtkb3duOiB7XG5cdFx0XHRcdFx0dmFsdWU6IGVzY2FwZShlbGVtZW50LnNhbmVEZXNjcmlwdGlvbiksXG5cdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogZWxlbWVudC5zYW5lRGVzY3JpcHRpb25cblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnM6IElJY29uTGFiZWxWYWx1ZU9wdGlvbnMgPSB7XG5cdFx0XHRtYXRjaGVzOiBsYWJlbEhpZ2hsaWdodHMgfHwgW10sXG5cdFx0XHQvLyBJZiB3ZSBoYXZlIGEgdG9vbHRpcCwgd2Ugd2FudCB0aGF0IHRvIGJlIHNob3duIGFuZCBub3QgYW55IG90aGVyIGhvdmVyXG5cdFx0XHRkZXNjcmlwdGlvblRpdGxlLFxuXHRcdFx0ZGVzY3JpcHRpb25NYXRjaGVzOiBkZXNjcmlwdGlvbkhpZ2hsaWdodHMgfHwgW10sXG5cdFx0XHRsYWJlbEVzY2FwZU5ld0xpbmVzOiB0cnVlXG5cdFx0fTtcblx0XHRvcHRpb25zLmV4dHJhQ2xhc3NlcyA9IG1haW5JdGVtLmljb25DbGFzc2VzO1xuXHRcdG9wdGlvbnMuaXRhbGljID0gbWFpbkl0ZW0uaXRhbGljO1xuXHRcdG9wdGlvbnMuc3RyaWtldGhyb3VnaCA9IG1haW5JdGVtLnN0cmlrZXRocm91Z2g7XG5cdFx0ZGF0YS5lbnRyeS5jbGFzc0xpc3QucmVtb3ZlKCdxdWljay1pbnB1dC1saXN0LXNlcGFyYXRvci1hcy1pdGVtJyk7XG5cdFx0ZGF0YS5sYWJlbC5zZXRMYWJlbChlbGVtZW50LnNhbmVMYWJlbCwgZWxlbWVudC5zYW5lRGVzY3JpcHRpb24sIG9wdGlvbnMpO1xuXG5cdFx0Ly8gS2V5YmluZGluZ1xuXHRcdGRhdGEua2V5YmluZGluZy5zZXQobWFpbkl0ZW0ua2V5YmluZGluZyk7XG5cblx0XHQvLyBEZXRhaWxcblx0XHRpZiAoZWxlbWVudC5zYW5lRGV0YWlsKSB7XG5cdFx0XHRsZXQgdGl0bGU6IElNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHQvLyBJZiB3ZSBoYXZlIGEgdG9vbHRpcCwgd2Ugd2FudCB0aGF0IHRvIGJlIHNob3duIGFuZCBub3QgYW55IG90aGVyIGhvdmVyXG5cdFx0XHRpZiAoIWVsZW1lbnQuc2FuZVRvb2x0aXApIHtcblx0XHRcdFx0dGl0bGUgPSB7XG5cdFx0XHRcdFx0bWFya2Rvd246IHtcblx0XHRcdFx0XHRcdHZhbHVlOiBlc2NhcGUoZWxlbWVudC5zYW5lRGV0YWlsKSxcblx0XHRcdFx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBlbGVtZW50LnNhbmVEZXRhaWxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGRhdGEuZGV0YWlsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0ZGF0YS5kZXRhaWwuc2V0TGFiZWwoZWxlbWVudC5zYW5lRGV0YWlsLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0bWF0Y2hlczogZGV0YWlsSGlnaGxpZ2h0cyxcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdGxhYmVsRXNjYXBlTmV3TGluZXM6IHRydWVcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmRldGFpbC5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gU2VwYXJhdG9yXG5cdFx0aWYgKGVsZW1lbnQuc2VwYXJhdG9yPy5sYWJlbCkge1xuXHRcdFx0ZGF0YS5zZXBhcmF0b3IudGV4dENvbnRlbnQgPSBlbGVtZW50LnNlcGFyYXRvci5sYWJlbDtcblx0XHRcdGRhdGEuc2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdHRoaXMuYWRkSXRlbVdpdGhTZXBhcmF0b3IoZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuc2VwYXJhdG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHRcdGRhdGEuZW50cnkuY2xhc3NMaXN0LnRvZ2dsZSgncXVpY2staW5wdXQtbGlzdC1zZXBhcmF0b3ItYm9yZGVyJywgISFlbGVtZW50LnNlcGFyYXRvciAmJiBlbGVtZW50LmNoaWxkSW5kZXggIT09IDApO1xuXG5cdFx0Ly8gQWN0aW9uc1xuXHRcdGNvbnN0IGJ1dHRvbnMgPSBtYWluSXRlbS5idXR0b25zO1xuXHRcdGlmIChidXR0b25zICYmIGJ1dHRvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSB9ID0gcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyhcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0J3F1aWNrLWlucHV0LWl0ZW0nLFxuXHRcdFx0XHQoYnV0dG9uKSA9PiBlbGVtZW50LmZpcmVCdXR0b25UcmlnZ2VyZWQoeyBidXR0b24sIGl0ZW06IGVsZW1lbnQuaXRlbSB9KVxuXHRcdFx0KTtcblx0XHRcdGRhdGEudG9vbEJhci5zZXRBY3Rpb25zKHByaW1hcnksIHNlY29uZGFyeSk7XG5cdFx0XHRkYXRhLmVudHJ5LmNsYXNzTGlzdC5hZGQoJ2hhcy1hY3Rpb25zJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEudG9vbEJhci5zZXRBY3Rpb25zKFtdKTtcblx0XHRcdGRhdGEuZW50cnkuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLWFjdGlvbnMnKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlRWxlbWVudChlbGVtZW50OiBJVHJlZU5vZGU8UXVpY2tQaWNrSXRlbUVsZW1lbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdmVJdGVtV2l0aFNlcGFyYXRvcihlbGVtZW50LmVsZW1lbnQpO1xuXHRcdHN1cGVyLmRpc3Bvc2VFbGVtZW50KGVsZW1lbnQsIF9pbmRleCwgZGF0YSk7XG5cdH1cblxuXHRpc0l0ZW1XaXRoU2VwYXJhdG9yVmlzaWJsZShpdGVtOiBRdWlja1BpY2tJdGVtRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtc1dpdGhTZXBhcmF0b3JzRnJlcXVlbmN5LmhhcyhpdGVtKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkSXRlbVdpdGhTZXBhcmF0b3IoaXRlbTogUXVpY2tQaWNrSXRlbUVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9pdGVtc1dpdGhTZXBhcmF0b3JzRnJlcXVlbmN5LnNldChpdGVtLCAodGhpcy5faXRlbXNXaXRoU2VwYXJhdG9yc0ZyZXF1ZW5jeS5nZXQoaXRlbSkgfHwgMCkgKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlSXRlbVdpdGhTZXBhcmF0b3IoaXRlbTogUXVpY2tQaWNrSXRlbUVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBmcmVxdWVuY3kgPSB0aGlzLl9pdGVtc1dpdGhTZXBhcmF0b3JzRnJlcXVlbmN5LmdldChpdGVtKSB8fCAwO1xuXHRcdGlmIChmcmVxdWVuY3kgPiAxKSB7XG5cdFx0XHR0aGlzLl9pdGVtc1dpdGhTZXBhcmF0b3JzRnJlcXVlbmN5LnNldChpdGVtLCBmcmVxdWVuY3kgLSAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faXRlbXNXaXRoU2VwYXJhdG9yc0ZyZXF1ZW5jeS5kZWxldGUoaXRlbSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRSZW5kZXJlciBleHRlbmRzIEJhc2VRdWlja0lucHV0TGlzdFJlbmRlcmVyPFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQ+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3F1aWNrcGlja3NlcGFyYXRvcic7XG5cblx0Ly8gVGhpcyBpcyBhIGZyZXF1ZW5jeSBtYXAgYmVjYXVzZSBzdGlja3kgc2Nyb2xsIHJlLXVzZXMgdGhlIHNhbWUgcmVuZGVyZXIgdG8gcmVuZGVyIGEgc2Vjb25kXG5cdC8vIGluc3RhbmNlIG9mIHRoZSBzYW1lIHNlcGFyYXRvci5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZVNlcGFyYXRvcnNGcmVxdWVuY3kgPSBuZXcgTWFwPFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQsIG51bWJlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZSB8IHVuZGVmaW5lZCxcblx0XHR0b2dnbGVTdHlsZXM6IElUb2dnbGVTdHlsZXMsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKGhvdmVyRGVsZWdhdGUsIHRvZ2dsZVN0eWxlcywgY29udGV4dE1lbnVTZXJ2aWNlKTtcblx0fVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCkge1xuXHRcdHJldHVybiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50UmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRnZXQgdmlzaWJsZVNlcGFyYXRvcnMoKTogUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudFtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3Zpc2libGVTZXBhcmF0b3JzRnJlcXVlbmN5LmtleXMoKV07XG5cdH1cblxuXHRpc1NlcGFyYXRvclZpc2libGUoc2VwYXJhdG9yOiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Zpc2libGVTZXBhcmF0b3JzRnJlcXVlbmN5LmhhcyhzZXBhcmF0b3IpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8UXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCwgdm9pZD4sIGluZGV4OiBudW1iZXIsIGRhdGE6IElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBub2RlLmVsZW1lbnQ7XG5cdFx0ZGF0YS5lbGVtZW50ID0gZWxlbWVudDtcblx0XHRlbGVtZW50LmVsZW1lbnQgPSBkYXRhLmVudHJ5ID8/IHVuZGVmaW5lZDtcblx0XHRlbGVtZW50LmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZm9jdXMtaW5zaWRlJywgISFlbGVtZW50LmZvY3VzSW5zaWRlU2VwYXJhdG9yKTtcblx0XHRjb25zdCBtYWluSXRlbTogSVF1aWNrUGlja1NlcGFyYXRvciA9IGVsZW1lbnQuc2VwYXJhdG9yO1xuXG5cdFx0Y29uc3QgeyBsYWJlbEhpZ2hsaWdodHMsIGRlc2NyaXB0aW9uSGlnaGxpZ2h0cyB9ID0gZWxlbWVudDtcblxuXHRcdC8vIEljb25cblx0XHRkYXRhLmljb24uc3R5bGUuYmFja2dyb3VuZEltYWdlID0gJyc7XG5cdFx0ZGF0YS5pY29uLmNsYXNzTmFtZSA9ICcnO1xuXG5cdFx0Ly8gTGFiZWxcblx0XHRsZXQgZGVzY3JpcHRpb25UaXRsZTogSU1hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHQvLyBpZiB3ZSBoYXZlIGEgdG9vbHRpcCwgdGhhdCB3aWxsIGJlIHRoZSBob3Zlcixcblx0XHQvLyB3aXRoIHRoZSBzYW5lRGVzY3JpcHRpb24gYXMgZmFsbGJhY2sgaWYgaXRcblx0XHQvLyBpcyBkZWZpbmVkXG5cdFx0aWYgKCFlbGVtZW50LnNhbmVUb29sdGlwICYmIGVsZW1lbnQuc2FuZURlc2NyaXB0aW9uKSB7XG5cdFx0XHRkZXNjcmlwdGlvblRpdGxlID0ge1xuXHRcdFx0XHRtYXJrZG93bjoge1xuXHRcdFx0XHRcdHZhbHVlOiBlc2NhcGUoZWxlbWVudC5zYW5lRGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IGVsZW1lbnQuc2FuZURlc2NyaXB0aW9uXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjb25zdCBvcHRpb25zOiBJSWNvbkxhYmVsVmFsdWVPcHRpb25zID0ge1xuXHRcdFx0bWF0Y2hlczogbGFiZWxIaWdobGlnaHRzIHx8IFtdLFxuXHRcdFx0Ly8gSWYgd2UgaGF2ZSBhIHRvb2x0aXAsIHdlIHdhbnQgdGhhdCB0byBiZSBzaG93biBhbmQgbm90IGFueSBvdGhlciBob3ZlclxuXHRcdFx0ZGVzY3JpcHRpb25UaXRsZSxcblx0XHRcdGRlc2NyaXB0aW9uTWF0Y2hlczogZGVzY3JpcHRpb25IaWdobGlnaHRzIHx8IFtdLFxuXHRcdFx0bGFiZWxFc2NhcGVOZXdMaW5lczogdHJ1ZVxuXHRcdH07XG5cdFx0ZGF0YS5lbnRyeS5jbGFzc0xpc3QuYWRkKCdxdWljay1pbnB1dC1saXN0LXNlcGFyYXRvci1hcy1pdGVtJyk7XG5cdFx0ZGF0YS5sYWJlbC5zZXRMYWJlbChlbGVtZW50LnNhbmVMYWJlbCwgZWxlbWVudC5zYW5lRGVzY3JpcHRpb24sIG9wdGlvbnMpO1xuXG5cdFx0Ly8gU2VwYXJhdG9yXG5cdFx0ZGF0YS5zZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRkYXRhLmVudHJ5LmNsYXNzTGlzdC5hZGQoJ3F1aWNrLWlucHV0LWxpc3Qtc2VwYXJhdG9yLWJvcmRlcicpO1xuXG5cdFx0Ly8gQWN0aW9uc1xuXHRcdGNvbnN0IGJ1dHRvbnMgPSBtYWluSXRlbS5idXR0b25zO1xuXHRcdGlmIChidXR0b25zICYmIGJ1dHRvbnMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB7IHByaW1hcnksIHNlY29uZGFyeSB9ID0gcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyhcblx0XHRcdFx0YnV0dG9ucyxcblx0XHRcdFx0J3F1aWNrLWlucHV0LXNlcGFyYXRvcicsXG5cdFx0XHRcdChidXR0b24pID0+IGVsZW1lbnQuZmlyZVNlcGFyYXRvckJ1dHRvblRyaWdnZXJlZCh7IGJ1dHRvbiwgc2VwYXJhdG9yOiBlbGVtZW50LnNlcGFyYXRvciB9KVxuXHRcdFx0KTtcblx0XHRcdGRhdGEudG9vbEJhci5zZXRBY3Rpb25zKHByaW1hcnksIHNlY29uZGFyeSk7XG5cdFx0XHRkYXRhLmVudHJ5LmNsYXNzTGlzdC5hZGQoJ2hhcy1hY3Rpb25zJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEudG9vbEJhci5zZXRBY3Rpb25zKFtdKTtcblx0XHRcdGRhdGEuZW50cnkuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLWFjdGlvbnMnKTtcblx0XHR9XG5cblx0XHR0aGlzLmFkZFNlcGFyYXRvcihlbGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50LCB2b2lkPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMucmVtb3ZlU2VwYXJhdG9yKGVsZW1lbnQuZWxlbWVudCk7XG5cdFx0aWYgKCF0aGlzLmlzU2VwYXJhdG9yVmlzaWJsZShlbGVtZW50LmVsZW1lbnQpKSB7XG5cdFx0XHRlbGVtZW50LmVsZW1lbnQuZWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZSgnZm9jdXMtaW5zaWRlJyk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2VFbGVtZW50KGVsZW1lbnQsIF9pbmRleCwgZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIGFkZFNlcGFyYXRvcihzZXBhcmF0b3I6IFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlU2VwYXJhdG9yc0ZyZXF1ZW5jeS5zZXQoc2VwYXJhdG9yLCAodGhpcy5fdmlzaWJsZVNlcGFyYXRvcnNGcmVxdWVuY3kuZ2V0KHNlcGFyYXRvcikgfHwgMCkgKyAxKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlU2VwYXJhdG9yKHNlcGFyYXRvcjogUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGZyZXF1ZW5jeSA9IHRoaXMuX3Zpc2libGVTZXBhcmF0b3JzRnJlcXVlbmN5LmdldChzZXBhcmF0b3IpIHx8IDA7XG5cdFx0aWYgKGZyZXF1ZW5jeSA+IDEpIHtcblx0XHRcdHRoaXMuX3Zpc2libGVTZXBhcmF0b3JzRnJlcXVlbmN5LnNldChzZXBhcmF0b3IsIGZyZXF1ZW5jeSAtIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl92aXNpYmxlU2VwYXJhdG9yc0ZyZXF1ZW5jeS5kZWxldGUoc2VwYXJhdG9yKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrSW5wdXRMaXN0IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0Ly8jcmVnaW9uIFF1aWNrSW5wdXRMaXN0IEV2ZW50c1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uS2V5RG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFN0YW5kYXJkS2V5Ym9hcmRFdmVudD4oKSk7XG5cdC8qKlxuXHQgKiBFdmVudCB0aGF0IGlzIGZpcmVkIHdoZW4gdGhlIHRyZWUgcmVjZWl2ZXMgYSBrZXlkb3duLlxuXHQqL1xuXHRyZWFkb25seSBvbktleURvd246IEV2ZW50PFN0YW5kYXJkS2V5Ym9hcmRFdmVudD4gPSB0aGlzLl9vbktleURvd24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25MZWF2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHQvKipcblx0ICogRXZlbnQgdGhhdCBpcyBmaXJlZCB3aGVuIHRoZSB0cmVlIHdvdWxkIG5vIGxvbmdlciBoYXZlIGZvY3VzLlxuXHQqL1xuXHRyZWFkb25seSBvbkxlYXZlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uTGVhdmUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZUNvdW50T2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnVmlzaWJsZUNvdW50JywgMCk7XG5cdHJlYWRvbmx5IG9uQ2hhbmdlZFZpc2libGVDb3VudDogRXZlbnQ8bnVtYmVyPiA9IEV2ZW50LmZyb21PYnNlcnZhYmxlKHRoaXMuX3Zpc2libGVDb3VudE9ic2VydmFibGUsIHRoaXMuX3N0b3JlKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hbGxWaXNpYmxlQ2hlY2tlZE9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ0FsbFZpc2libGVDaGVja2VkJywgZmFsc2UpO1xuXHRyZWFkb25seSBvbkNoYW5nZWRBbGxWaXNpYmxlQ2hlY2tlZDogRXZlbnQ8Ym9vbGVhbj4gPSBFdmVudC5mcm9tT2JzZXJ2YWJsZSh0aGlzLl9hbGxWaXNpYmxlQ2hlY2tlZE9ic2VydmFibGUsIHRoaXMuX3N0b3JlKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGVja2VkQ291bnRPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdDaGVja2VkQ291bnQnLCAwKTtcblx0cmVhZG9ubHkgb25DaGFuZ2VkQ2hlY2tlZENvdW50OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuZnJvbU9ic2VydmFibGUodGhpcy5fY2hlY2tlZENvdW50T2JzZXJ2YWJsZSwgdGhpcy5fc3RvcmUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrZWRFbGVtZW50c09ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWVPcHRzKHsgZXF1YWxzRm46IGVxdWFscyB9LCBuZXcgQXJyYXk8SVF1aWNrUGlja0l0ZW0+KCkpO1xuXHRyZWFkb25seSBvbkNoYW5nZWRDaGVja2VkRWxlbWVudHM6IEV2ZW50PElRdWlja1BpY2tJdGVtW10+ID0gRXZlbnQuZnJvbU9ic2VydmFibGUodGhpcy5fY2hlY2tlZEVsZW1lbnRzT2JzZXJ2YWJsZSwgdGhpcy5fc3RvcmUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQnV0dG9uVHJpZ2dlcmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrUGlja0l0ZW1CdXR0b25FdmVudDxJUXVpY2tQaWNrSXRlbT4+KCkpO1xuXHRvbkJ1dHRvblRyaWdnZXJlZCA9IHRoaXMuX29uQnV0dG9uVHJpZ2dlcmVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uU2VwYXJhdG9yQnV0dG9uVHJpZ2dlcmVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrUGlja1NlcGFyYXRvckJ1dHRvbkV2ZW50PigpKTtcblx0b25TZXBhcmF0b3JCdXR0b25UcmlnZ2VyZWQgPSB0aGlzLl9vblNlcGFyYXRvckJ1dHRvblRyaWdnZXJlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50Q2hlY2tlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgZWxlbWVudDogSVF1aWNrUGlja0VsZW1lbnQ7IGNoZWNrZWQ6IGJvb2xlYW4gfT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnRDaGVja2VkRXZlbnRCdWZmZXJlciA9IG5ldyBFdmVudEJ1ZmZlcmVyKCk7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJpdmF0ZSBfaGFzQ2hlY2tib3hlcyA9IGZhbHNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWU6IFdvcmtiZW5jaE9iamVjdFRyZWU8SVF1aWNrUGlja0VsZW1lbnQsIHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXBhcmF0b3JSZW5kZXJlcjogUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudFJlbmRlcmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pdGVtUmVuZGVyZXI6IFF1aWNrUGlja0l0ZW1FbGVtZW50UmVuZGVyZXI7XG5cdHByaXZhdGUgX2lucHV0RWxlbWVudHMgPSBuZXcgQXJyYXk8UXVpY2tQaWNrSXRlbT4oKTtcblx0cHJpdmF0ZSBfZWxlbWVudFRyZWUgPSBuZXcgQXJyYXk8SVF1aWNrUGlja0VsZW1lbnQ+KCk7XG5cdHByaXZhdGUgX2l0ZW1FbGVtZW50cyA9IG5ldyBBcnJheTxRdWlja1BpY2tJdGVtRWxlbWVudD4oKTtcblx0Ly8gRWxlbWVudHMgdGhhdCBhcHBseSB0byB0aGUgY3VycmVudCBzZXQgb2YgZWxlbWVudHNcblx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIF9sYXN0SG92ZXI6IElIb3ZlcldpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbGFzdFF1ZXJ5U3RyaW5nOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBwYXJlbnQ6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgaG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUsXG5cdFx0cHJpdmF0ZSBsaW5rT3BlbmVyRGVsZWdhdGU6IChjb250ZW50OiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIHN0eWxlczogSVF1aWNrSW5wdXRTdHlsZXMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29udGFpbmVyID0gZG9tLmFwcGVuZCh0aGlzLnBhcmVudCwgJCgnLnF1aWNrLWlucHV0LWxpc3QnKSk7XG5cdFx0dGhpcy5fc2VwYXJhdG9yUmVuZGVyZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50UmVuZGVyZXIsIGhvdmVyRGVsZWdhdGUsIHRoaXMuc3R5bGVzLnRvZ2dsZSkpO1xuXHRcdHRoaXMuX2l0ZW1SZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrUGlja0l0ZW1FbGVtZW50UmVuZGVyZXIsIGhvdmVyRGVsZWdhdGUsIHRoaXMuc3R5bGVzLnRvZ2dsZSkpO1xuXHRcdHRoaXMuX3RyZWUgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaE9iamVjdFRyZWU8SVF1aWNrUGlja0VsZW1lbnQsIHZvaWQ+LFxuXHRcdFx0J1F1aWNrSW5wdXQnLFxuXHRcdFx0dGhpcy5fY29udGFpbmVyLFxuXHRcdFx0bmV3IFF1aWNrSW5wdXRJdGVtRGVsZWdhdGUoKSxcblx0XHRcdFt0aGlzLl9pdGVtUmVuZGVyZXIsIHRoaXMuX3NlcGFyYXRvclJlbmRlcmVyXSxcblx0XHRcdHtcblx0XHRcdFx0ZmlsdGVyOiB7XG5cdFx0XHRcdFx0ZmlsdGVyKGVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBlbGVtZW50LmhpZGRlblxuXHRcdFx0XHRcdFx0XHQ/IFRyZWVWaXNpYmlsaXR5LkhpZGRlblxuXHRcdFx0XHRcdFx0XHQ6IGVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50XG5cdFx0XHRcdFx0XHRcdFx0PyBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlXG5cdFx0XHRcdFx0XHRcdFx0OiBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNvcnRlcjoge1xuXHRcdFx0XHRcdGNvbXBhcmU6IChlbGVtZW50LCBvdGhlckVsZW1lbnQpID0+IHtcblx0XHRcdFx0XHRcdGlmICghdGhpcy5zb3J0QnlMYWJlbCB8fCAhdGhpcy5fbGFzdFF1ZXJ5U3RyaW5nKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZFNlYXJjaFZhbHVlID0gdGhpcy5fbGFzdFF1ZXJ5U3RyaW5nLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gY29tcGFyZUVudHJpZXMoZWxlbWVudCwgb3RoZXJFbGVtZW50LCBub3JtYWxpemVkU2VhcmNoVmFsdWUpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IFF1aWNrSW5wdXRBY2Nlc3NpYmlsaXR5UHJvdmlkZXIoKSxcblx0XHRcdFx0c2V0Um93TGluZUhlaWdodDogZmFsc2UsXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM6IHRydWUsXG5cdFx0XHRcdHJlbmRlckluZGVudEd1aWRlczogUmVuZGVySW5kZW50R3VpZGVzLk5vbmUsXG5cdFx0XHRcdGZpbmRXaWRnZXRFbmFibGVkOiBmYWxzZSxcblx0XHRcdFx0aW5kZW50OiAwLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWxsb3dOb25Db2xsYXBzaWJsZVBhcmVudHM6IHRydWUsXG5cdFx0XHRcdGFsd2F5c0NvbnN1bWVNb3VzZVdoZWVsOiB0cnVlXG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0dGhpcy5fdHJlZS5nZXRIVE1MRWxlbWVudCgpLmlkID0gaWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faXRlbVJlbmRlcmVyLm9uRGlkRGlzcG9zZUZvY3VzZWRFbGVtZW50KCgpID0+IHRoaXMuX3RyZWUuZG9tRm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NlcGFyYXRvclJlbmRlcmVyLm9uRGlkRGlzcG9zZUZvY3VzZWRFbGVtZW50KCgpID0+IHRoaXMuX3RyZWUuZG9tRm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHQvLyNyZWdpb24gcHVibGljIGdldHRlcnMvc2V0dGVyc1xuXG5cdEBtZW1vaXplXG5cdGdldCBvbkRpZENoYW5nZUZvY3VzKCkge1xuXHRcdHJldHVybiBFdmVudC5tYXAoXG5cdFx0XHR0aGlzLl90cmVlLm9uRGlkQ2hhbmdlRm9jdXMsXG5cdFx0XHRlID0+IGUuZWxlbWVudHMuZmlsdGVyKChlKTogZSBpcyBRdWlja1BpY2tJdGVtRWxlbWVudCA9PiBlIGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpLm1hcChlID0+IGUuaXRlbSksXG5cdFx0XHR0aGlzLl9zdG9yZVxuXHRcdCk7XG5cdH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgb25EaWRDaGFuZ2VTZWxlY3Rpb24oKSB7XG5cdFx0cmV0dXJuIEV2ZW50Lm1hcChcblx0XHRcdHRoaXMuX3RyZWUub25EaWRDaGFuZ2VTZWxlY3Rpb24sXG5cdFx0XHRlID0+ICh7XG5cdFx0XHRcdGl0ZW1zOiBlLmVsZW1lbnRzLmZpbHRlcigoZSk6IGUgaXMgUXVpY2tQaWNrSXRlbUVsZW1lbnQgPT4gZSBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KS5tYXAoZSA9PiBlLml0ZW0pLFxuXHRcdFx0XHRldmVudDogZS5icm93c2VyRXZlbnRcblx0XHRcdH0pLFxuXHRcdFx0dGhpcy5fc3RvcmVcblx0XHQpO1xuXHR9XG5cblx0Z2V0IGRpc3BsYXllZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJztcblx0fVxuXG5cdHNldCBkaXNwbGF5ZWQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSA9IHZhbHVlID8gJycgOiAnbm9uZSc7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCkge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLnNjcm9sbFRvcDtcblx0fVxuXG5cdHNldCBzY3JvbGxUb3Aoc2Nyb2xsVG9wOiBudW1iZXIpIHtcblx0XHR0aGlzLl90cmVlLnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuYXJpYUxhYmVsO1xuXHR9XG5cblx0c2V0IGFyaWFMYWJlbChsYWJlbDogc3RyaW5nIHwgbnVsbCkge1xuXHRcdHRoaXMuX3RyZWUuYXJpYUxhYmVsID0gbGFiZWwgPz8gJyc7XG5cdH1cblxuXHRzZXQgZW5hYmxlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3RyZWUuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5wb2ludGVyRXZlbnRzID0gdmFsdWUgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoT25EZXNjcmlwdGlvbiA9IGZhbHNlO1xuXHRnZXQgbWF0Y2hPbkRlc2NyaXB0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9tYXRjaE9uRGVzY3JpcHRpb247XG5cdH1cblx0c2V0IG1hdGNoT25EZXNjcmlwdGlvbih2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX21hdGNoT25EZXNjcmlwdGlvbiA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hPbkRldGFpbCA9IGZhbHNlO1xuXHRnZXQgbWF0Y2hPbkRldGFpbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbkRldGFpbDtcblx0fVxuXHRzZXQgbWF0Y2hPbkRldGFpbCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX21hdGNoT25EZXRhaWwgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoT25MYWJlbCA9IHRydWU7XG5cdGdldCBtYXRjaE9uTGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hdGNoT25MYWJlbDtcblx0fVxuXHRzZXQgbWF0Y2hPbkxhYmVsKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWF0Y2hPbkxhYmVsID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaE9uTGFiZWxNb2RlOiAnZnV6enknIHwgJ2NvbnRpZ3VvdXMnID0gJ2Z1enp5Jztcblx0Z2V0IG1hdGNoT25MYWJlbE1vZGUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hdGNoT25MYWJlbE1vZGU7XG5cdH1cblx0c2V0IG1hdGNoT25MYWJlbE1vZGUodmFsdWU6ICdmdXp6eScgfCAnY29udGlndW91cycpIHtcblx0XHR0aGlzLl9tYXRjaE9uTGFiZWxNb2RlID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaE9uTWV0YSA9IHRydWU7XG5cdGdldCBtYXRjaE9uTWV0YSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbk1ldGE7XG5cdH1cblx0c2V0IG1hdGNoT25NZXRhKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWF0Y2hPbk1ldGEgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3NvcnRCeUxhYmVsID0gdHJ1ZTtcblx0Z2V0IHNvcnRCeUxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9zb3J0QnlMYWJlbDtcblx0fVxuXHRzZXQgc29ydEJ5TGFiZWwodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zb3J0QnlMYWJlbCA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkTG9vcCA9IHRydWU7XG5cdGdldCBzaG91bGRMb29wKCkge1xuXHRcdHJldHVybiB0aGlzLl9zaG91bGRMb29wO1xuXHR9XG5cdHNldCBzaG91bGRMb29wKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fc2hvdWxkTG9vcCA9IHZhbHVlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHJlZ2lzdGVyIGxpc3RlbmVyc1xuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyT25Db250YWluZXJDbGljaygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyT25Nb3VzZU1pZGRsZUNsaWNrKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJPblRyZWVNb2RlbENoYW5nZWQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlck9uRWxlbWVudENoZWNrZWQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlck9uQ29udGV4dE1lbnUoKTtcblx0XHR0aGlzLl9yZWdpc3RlckhvdmVyTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJTZWxlY3Rpb25DaGFuZ2VMaXN0ZW5lcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyU2VwYXJhdG9yQWN0aW9uU2hvd2luZ0xpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJPbkNvbnRhaW5lckNsaWNrKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGlmIChlLnggfHwgZS55KSB7IC8vIEF2b2lkICdjbGljaycgdHJpZ2dlcmVkIGJ5ICdzcGFjZScgb24gY2hlY2tib3guXG5cdFx0XHRcdHRoaXMuX29uTGVhdmUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyT25Nb3VzZU1pZGRsZUNsaWNrKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fY29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkFVWENMSUNLLCBlID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHR0aGlzLl9vbkxlYXZlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck9uVHJlZU1vZGVsQ2hhbmdlZCgpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmlzaWJsZUNvdW50ID0gdGhpcy5faXRlbUVsZW1lbnRzLmZpbHRlcihlID0+ICFlLmhpZGRlbikubGVuZ3RoO1xuXHRcdFx0dGhpcy5fdmlzaWJsZUNvdW50T2JzZXJ2YWJsZS5zZXQodmlzaWJsZUNvdW50LCB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHRoaXMuX2hhc0NoZWNrYm94ZXMpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQ2hlY2tlZE9ic2VydmFibGVzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJPbkVsZW1lbnRDaGVja2VkKCkge1xuXHRcdC8vIE9ubHkgZmlyZSB0aGUgbGFzdCBldmVudCB3aGVuIGJ1ZmZlcmVkXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWxlbWVudENoZWNrZWRFdmVudEJ1ZmZlcmVyLndyYXBFdmVudCh0aGlzLl9lbGVtZW50Q2hlY2tlZC5ldmVudCwgKF8sIGUpID0+IGUpKF8gPT4gdGhpcy5fdXBkYXRlQ2hlY2tlZE9ic2VydmFibGVzKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyT25Db250ZXh0TWVudSgpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uQ29udGV4dE1lbnUoZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdGUuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdFx0Ly8gd2Ugd2FudCB0byB0cmVhdCBhIGNvbnRleHQgbWVudSBldmVudCBhc1xuXHRcdFx0XHQvLyBhIGdlc3R1cmUgdG8gb3BlbiB0aGUgaXRlbSBhdCB0aGUgaW5kZXhcblx0XHRcdFx0Ly8gc2luY2Ugd2UgZG8gbm90IGhhdmUgYW55IGNvbnRleHQgbWVudVxuXHRcdFx0XHQvLyB0aGlzIGVuYWJsZXMgZm9yIGV4YW1wbGUgbWFjT1MgdG8gQ3RybC1cblx0XHRcdFx0Ly8gY2xpY2sgb24gYW4gaXRlbSB0byBvcGVuIGl0LlxuXHRcdFx0XHR0aGlzLl90cmVlLnNldFNlbGVjdGlvbihbZS5lbGVtZW50XSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJIb3Zlckxpc3RlbmVycygpIHtcblx0XHRjb25zdCBkZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXIodHlwZW9mIHRoaXMuaG92ZXJEZWxlZ2F0ZS5kZWxheSA9PT0gJ2Z1bmN0aW9uJyA/IHRoaXMuaG92ZXJEZWxlZ2F0ZS5kZWxheSgpIDogdGhpcy5ob3ZlckRlbGVnYXRlLmRlbGF5KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbk1vdXNlT3Zlcihhc3luYyBlID0+IHtcblx0XHRcdC8vIElmIHdlIGhvdmVyIG92ZXIgYW4gYW5jaG9yIGVsZW1lbnQsIHdlIGRvbid0IHdhbnQgdG8gc2hvdyB0aGUgaG92ZXIgYmVjYXVzZVxuXHRcdFx0Ly8gdGhlIGFuY2hvciBtYXkgaGF2ZSBhIHRvb2x0aXAgdGhhdCB3ZSB3YW50IHRvIHNob3cgaW5zdGVhZC5cblx0XHRcdGlmIChkb20uaXNIVE1MQW5jaG9yRWxlbWVudChlLmJyb3dzZXJFdmVudC50YXJnZXQpKSB7XG5cdFx0XHRcdGRlbGF5ZXIuY2FuY2VsKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChcblx0XHRcdFx0Ly8gYW5jaG9ycyBhcmUgYW4gZXhjZXB0aW9uIGFzIGNhbGxlZCBvdXQgYWJvdmUgc28gd2Ugc2tpcCB0aGVtIGhlcmVcblx0XHRcdFx0IShkb20uaXNIVE1MQW5jaG9yRWxlbWVudChlLmJyb3dzZXJFdmVudC5yZWxhdGVkVGFyZ2V0KSkgJiZcblx0XHRcdFx0Ly8gY2hlY2sgaWYgdGhlIG1vdXNlIGlzIHN0aWxsIG92ZXIgdGhlIHNhbWUgZWxlbWVudFxuXHRcdFx0XHRkb20uaXNBbmNlc3RvcihlLmJyb3dzZXJFdmVudC5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUsIGUuZWxlbWVudD8uZWxlbWVudCBhcyBOb2RlKVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGRlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnNob3dIb3ZlcihlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIElnbm9yZSBjYW5jZWxsYXRpb24gZXJyb3JzIGR1ZSB0byBtb3VzZSBvdXRcblx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uTW91c2VPdXQoZSA9PiB7XG5cdFx0XHQvLyBvbk1vdXNlT3V0IHRyaWdnZXJzIGV2ZXJ5IHRpbWUgYSBuZXcgZWxlbWVudCBoYXMgYmVlbiBtb3VzZWQgb3ZlclxuXHRcdFx0Ly8gZXZlbiBpZiBpdCdzIG9uIHRoZSBzYW1lIGxpc3QgaXRlbS4gV2Ugb25seSB3YW50IG9uZSBldmVudCwgc28gd2Vcblx0XHRcdC8vIGNoZWNrIGlmIHRoZSBtb3VzZSBpcyBzdGlsbCBvdmVyIHRoZSBzYW1lIGVsZW1lbnQuXG5cdFx0XHRpZiAoZG9tLmlzQW5jZXN0b3IoZS5icm93c2VyRXZlbnQucmVsYXRlZFRhcmdldCBhcyBOb2RlLCBlLmVsZW1lbnQ/LmVsZW1lbnQgYXMgTm9kZSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0ZGVsYXllci5jYW5jZWwoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXIncyBmb2N1cyBjaGFuZ2UgYW5kIG1vdXNlIGV2ZW50cyBzbyB0aGF0IHdlIGNhbiB0cmFjayB3aGVuIGl0ZW1zIGluc2lkZSBvZiBhXG5cdCAqIHNlcGFyYXRvcidzIHNlY3Rpb24gYXJlIGZvY3VzZWQgb3IgaG92ZXJlZCBzbyB0aGF0IHdlIGNhbiBkaXNwbGF5IHRoZSBzZXBhcmF0b3IncyBhY3Rpb25zXG5cdCAqL1xuXHRwcml2YXRlIF9yZWdpc3RlclNlcGFyYXRvckFjdGlvblNob3dpbmdMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gZS5lbGVtZW50c1swXVxuXHRcdFx0XHQ/IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudChlLmVsZW1lbnRzWzBdKSBhcyBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50XG5cdFx0XHRcdC8vIHRyZWF0IG51bGwgYXMgZm9jdXMgbG9zdCBhbmQgd2hlbiB3ZSBoYXZlIG5vIHNlcGFyYXRvcnNcblx0XHRcdFx0OiBudWxsO1xuXHRcdFx0Zm9yIChjb25zdCBzZXBhcmF0b3Igb2YgdGhpcy5fc2VwYXJhdG9yUmVuZGVyZXIudmlzaWJsZVNlcGFyYXRvcnMpIHtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBzZXBhcmF0b3IgPT09IHBhcmVudDtcblx0XHRcdFx0Ly8gZ2V0IGJpdG5lc3Mgb2YgQUNUSVZFX0lURU0gYW5kIGNoZWNrIGlmIGl0IGNoYW5nZWRcblx0XHRcdFx0Y29uc3QgY3VycmVudEFjdGl2ZSA9ICEhKHNlcGFyYXRvci5mb2N1c0luc2lkZVNlcGFyYXRvciAmIFF1aWNrUGlja1NlcGFyYXRvckZvY3VzUmVhc29uLkFDVElWRV9JVEVNKTtcblx0XHRcdFx0aWYgKGN1cnJlbnRBY3RpdmUgIT09IHZhbHVlKSB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdFx0XHRzZXBhcmF0b3IuZm9jdXNJbnNpZGVTZXBhcmF0b3IgfD0gUXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24uQUNUSVZFX0lURU07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNlcGFyYXRvci5mb2N1c0luc2lkZVNlcGFyYXRvciAmPSB+UXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24uQUNUSVZFX0lURU07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXJlbmRlcihzZXBhcmF0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25Nb3VzZU92ZXIoZSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBlLmVsZW1lbnRcblx0XHRcdFx0PyB0aGlzLl90cmVlLmdldFBhcmVudEVsZW1lbnQoZS5lbGVtZW50KSBhcyBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50XG5cdFx0XHRcdDogbnVsbDtcblx0XHRcdGZvciAoY29uc3Qgc2VwYXJhdG9yIG9mIHRoaXMuX3NlcGFyYXRvclJlbmRlcmVyLnZpc2libGVTZXBhcmF0b3JzKSB7XG5cdFx0XHRcdGlmIChzZXBhcmF0b3IgIT09IHBhcmVudCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRNb3VzZSA9ICEhKHNlcGFyYXRvci5mb2N1c0luc2lkZVNlcGFyYXRvciAmIFF1aWNrUGlja1NlcGFyYXRvckZvY3VzUmVhc29uLk1PVVNFX0hPVkVSKTtcblx0XHRcdFx0aWYgKCFjdXJyZW50TW91c2UpIHtcblx0XHRcdFx0XHRzZXBhcmF0b3IuZm9jdXNJbnNpZGVTZXBhcmF0b3IgfD0gUXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24uTU9VU0VfSE9WRVI7XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXJlbmRlcihzZXBhcmF0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25Nb3VzZU91dChlID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IGUuZWxlbWVudFxuXHRcdFx0XHQ/IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudChlLmVsZW1lbnQpIGFzIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRcblx0XHRcdFx0OiBudWxsO1xuXHRcdFx0Zm9yIChjb25zdCBzZXBhcmF0b3Igb2YgdGhpcy5fc2VwYXJhdG9yUmVuZGVyZXIudmlzaWJsZVNlcGFyYXRvcnMpIHtcblx0XHRcdFx0aWYgKHNlcGFyYXRvciAhPT0gcGFyZW50KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3VycmVudE1vdXNlID0gISEoc2VwYXJhdG9yLmZvY3VzSW5zaWRlU2VwYXJhdG9yICYgUXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24uTU9VU0VfSE9WRVIpO1xuXHRcdFx0XHRpZiAoY3VycmVudE1vdXNlKSB7XG5cdFx0XHRcdFx0c2VwYXJhdG9yLmZvY3VzSW5zaWRlU2VwYXJhdG9yICY9IH5RdWlja1BpY2tTZXBhcmF0b3JGb2N1c1JlYXNvbi5NT1VTRV9IT1ZFUjtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnJlcmVuZGVyKHNlcGFyYXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlclNlbGVjdGlvbkNoYW5nZUxpc3RlbmVyKCkge1xuXHRcdC8vIFdoZW4gdGhlIHVzZXIgc2VsZWN0cyBhIHNlcGFyYXRvciwgdGhlIHNlcGFyYXRvciB3aWxsIG1vdmUgdG8gdGhlIHRvcCBhbmQgZm9jdXMgd2lsbCBiZVxuXHRcdC8vIHNldCB0byB0aGUgZmlyc3QgZWxlbWVudCBhZnRlciB0aGUgc2VwYXJhdG9yLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50c1dpdGhvdXRTZXBhcmF0b3JzID0gZS5lbGVtZW50cy5maWx0ZXIoKGUpOiBlIGlzIFF1aWNrUGlja0l0ZW1FbGVtZW50ID0+IGUgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCk7XG5cdFx0XHRpZiAoZWxlbWVudHNXaXRob3V0U2VwYXJhdG9ycy5sZW5ndGggIT09IGUuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRcdGlmIChlLmVsZW1lbnRzLmxlbmd0aCA9PT0gMSAmJiBlLmVsZW1lbnRzWzBdIGluc3RhbmNlb2YgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW2UuZWxlbWVudHNbMF0uY2hpbGRyZW5bMF1dKTtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnRzWzBdLCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90cmVlLnNldFNlbGVjdGlvbihlbGVtZW50c1dpdGhvdXRTZXBhcmF0b3JzKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gcHVibGljIG1ldGhvZHNcblxuXHRzZXRBbGxWaXNpYmxlQ2hlY2tlZChjaGVja2VkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fZWxlbWVudENoZWNrZWRFdmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9pdGVtRWxlbWVudHMuZm9yRWFjaChlbGVtZW50ID0+IHtcblx0XHRcdFx0aWYgKCFlbGVtZW50LmhpZGRlbiAmJiAhZWxlbWVudC5jaGVja2JveERpc2FibGVkICYmIGVsZW1lbnQuaXRlbS5waWNrYWJsZSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHQvLyBXb3VsZCBmaXJlIGFuIGV2ZW50IGlmIHdlIGRpZG4ndCBiZWZmZXIgdGhlIGV2ZW50c1xuXHRcdFx0XHRcdGVsZW1lbnQuY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0c2V0RWxlbWVudHMoaW5wdXRFbGVtZW50czogUXVpY2tQaWNrSXRlbVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fZWxlbWVudERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR0aGlzLl9sYXN0UXVlcnlTdHJpbmcgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faW5wdXRFbGVtZW50cyA9IGlucHV0RWxlbWVudHM7XG5cdFx0dGhpcy5faGFzQ2hlY2tib3hlcyA9IHRoaXMucGFyZW50LmNsYXNzTGlzdC5jb250YWlucygnc2hvdy1jaGVja2JveGVzJyk7XG5cdFx0bGV0IGN1cnJlbnRTZXBhcmF0b3JFbGVtZW50OiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2l0ZW1FbGVtZW50cyA9IG5ldyBBcnJheTxRdWlja1BpY2tJdGVtRWxlbWVudD4oKTtcblx0XHR0aGlzLl9lbGVtZW50VHJlZSA9IGlucHV0RWxlbWVudHMucmVkdWNlKChyZXN1bHQsIGl0ZW0sIGluZGV4KSA9PiB7XG5cdFx0XHRsZXQgZWxlbWVudDogSVF1aWNrUGlja0VsZW1lbnQ7XG5cdFx0XHRpZiAoaXRlbS50eXBlID09PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0XHRpZiAoIWl0ZW0uYnV0dG9ucykge1xuXHRcdFx0XHRcdC8vIFRoaXMgc2VwYXJhdG9yIHdpbGwgYmUgcmVuZGVyZWQgYXMgYSBwYXJ0IG9mIHRoZSBsaXN0IGl0ZW1cblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGN1cnJlbnRTZXBhcmF0b3JFbGVtZW50ID0gbmV3IFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQoXG5cdFx0XHRcdFx0aW5kZXgsXG5cdFx0XHRcdFx0ZSA9PiB0aGlzLl9vblNlcGFyYXRvckJ1dHRvblRyaWdnZXJlZC5maXJlKGUpLFxuXHRcdFx0XHRcdGl0ZW1cblx0XHRcdFx0KTtcblx0XHRcdFx0ZWxlbWVudCA9IGN1cnJlbnRTZXBhcmF0b3JFbGVtZW50O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXMgPSBpbmRleCA+IDAgPyBpbnB1dEVsZW1lbnRzW2luZGV4IC0gMV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBzZXBhcmF0b3I6IElRdWlja1BpY2tTZXBhcmF0b3IgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChwcmV2aW91cyAmJiBwcmV2aW91cy50eXBlID09PSAnc2VwYXJhdG9yJyAmJiAhcHJldmlvdXMuYnV0dG9ucykge1xuXHRcdFx0XHRcdHNlcGFyYXRvciA9IHByZXZpb3VzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHFwaSA9IG5ldyBRdWlja1BpY2tJdGVtRWxlbWVudChcblx0XHRcdFx0XHRpbmRleCxcblx0XHRcdFx0XHRjdXJyZW50U2VwYXJhdG9yRWxlbWVudD8uY2hpbGRyZW5cblx0XHRcdFx0XHRcdD8gY3VycmVudFNlcGFyYXRvckVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoXG5cdFx0XHRcdFx0XHQ6IGluZGV4LFxuXHRcdFx0XHRcdHRoaXMuX2hhc0NoZWNrYm94ZXMgJiYgaXRlbS5waWNrYWJsZSAhPT0gZmFsc2UsXG5cdFx0XHRcdFx0ZSA9PiB0aGlzLl9vbkJ1dHRvblRyaWdnZXJlZC5maXJlKGUpLFxuXHRcdFx0XHRcdHRoaXMuX2VsZW1lbnRDaGVja2VkLFxuXHRcdFx0XHRcdGl0ZW0sXG5cdFx0XHRcdFx0c2VwYXJhdG9yLFxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLl9pdGVtRWxlbWVudHMucHVzaChxcGkpO1xuXG5cdFx0XHRcdGlmIChjdXJyZW50U2VwYXJhdG9yRWxlbWVudCkge1xuXHRcdFx0XHRcdGN1cnJlbnRTZXBhcmF0b3JFbGVtZW50LmNoaWxkcmVuLnB1c2gocXBpKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGVsZW1lbnQgPSBxcGk7XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBuZXcgQXJyYXk8SVF1aWNrUGlja0VsZW1lbnQ+KCkpO1xuXG5cdFx0dGhpcy5fc2V0RWxlbWVudHNUb1RyZWUodGhpcy5fZWxlbWVudFRyZWUpO1xuXG5cdFx0Ly8gQWNjZXNzaWJpbGl0eSBoYWNrLCB1bmZvcnR1bmF0ZWx5IG9uIG5leHQgdGlja1xuXHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMTE5NzZcblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpKSB7XG5cdFx0XHRkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IHRoaXMuX3RyZWUuZ2V0SFRNTEVsZW1lbnQoKS5xdWVyeVNlbGVjdG9yKGAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWRgKTtcblx0XHRcdFx0Y29uc3QgcGFyZW50ID0gZm9jdXNlZEVsZW1lbnQ/LnBhcmVudE5vZGU7XG5cdFx0XHRcdGlmIChmb2N1c2VkRWxlbWVudCAmJiBwYXJlbnQpIHtcblx0XHRcdFx0XHRjb25zdCBuZXh0U2libGluZyA9IGZvY3VzZWRFbGVtZW50Lm5leHRTaWJsaW5nO1xuXHRcdFx0XHRcdGZvY3VzZWRFbGVtZW50LnJlbW92ZSgpO1xuXHRcdFx0XHRcdHBhcmVudC5pbnNlcnRCZWZvcmUoZm9jdXNlZEVsZW1lbnQsIG5leHRTaWJsaW5nKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMCwgdGhpcy5fZWxlbWVudERpc3Bvc2FibGUpO1xuXHRcdH1cblx0fVxuXG5cdHNldEZvY3VzZWRFbGVtZW50cyhpdGVtczogSVF1aWNrUGlja0l0ZW1bXSkge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gaXRlbXMubWFwKGl0ZW0gPT4gdGhpcy5faXRlbUVsZW1lbnRzLmZpbmQoZSA9PiBlLml0ZW0gPT09IGl0ZW0pKVxuXHRcdFx0LmZpbHRlcigoZSk6IGUgaXMgUXVpY2tQaWNrSXRlbUVsZW1lbnQgPT4gISFlKVxuXHRcdFx0LmZpbHRlcihlID0+ICFlLmhpZGRlbik7XG5cdFx0dGhpcy5fdHJlZS5zZXRGb2N1cyhlbGVtZW50cyk7XG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl90cmVlLmdldEZvY3VzKClbMF07XG5cdFx0XHRpZiAoZm9jdXNlZCkge1xuXHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChmb2N1c2VkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRnZXRBY3RpdmVEZXNjZW5kYW50KCkge1xuXHRcdHJldHVybiB0aGlzLl90cmVlLmdldEhUTUxFbGVtZW50KCkuZ2V0QXR0cmlidXRlKCdhcmlhLWFjdGl2ZWRlc2NlbmRhbnQnKTtcblx0fVxuXG5cdHNldFNlbGVjdGVkRWxlbWVudHMoaXRlbXM6IElRdWlja1BpY2tJdGVtW10pIHtcblx0XHRjb25zdCBlbGVtZW50cyA9IGl0ZW1zLm1hcChpdGVtID0+IHRoaXMuX2l0ZW1FbGVtZW50cy5maW5kKGUgPT4gZS5pdGVtID09PSBpdGVtKSlcblx0XHRcdC5maWx0ZXIoKGUpOiBlIGlzIFF1aWNrUGlja0l0ZW1FbGVtZW50ID0+ICEhZSk7XG5cdFx0dGhpcy5fdHJlZS5zZXRTZWxlY3Rpb24oZWxlbWVudHMpO1xuXHR9XG5cblx0Z2V0Q2hlY2tlZEVsZW1lbnRzKCkge1xuXHRcdHJldHVybiB0aGlzLl9pdGVtRWxlbWVudHMuZmlsdGVyKGUgPT4gZS5jaGVja2VkKVxuXHRcdFx0Lm1hcChlID0+IGUuaXRlbSk7XG5cdH1cblxuXHRzZXRDaGVja2VkRWxlbWVudHMoaXRlbXM6IElRdWlja1BpY2tJdGVtW10pIHtcblx0XHR0aGlzLl9lbGVtZW50Q2hlY2tlZEV2ZW50QnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHtcblx0XHRcdGNvbnN0IGNoZWNrZWQgPSBuZXcgU2V0KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaXRlbXMpIHtcblx0XHRcdFx0Y2hlY2tlZC5hZGQoaXRlbSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGVsZW1lbnQgb2YgdGhpcy5faXRlbUVsZW1lbnRzKSB7XG5cdFx0XHRcdC8vIFdvdWxkIGZpcmUgYW4gZXZlbnQgaWYgd2UgZGlkbid0IGJlZmZlciB0aGUgZXZlbnRzXG5cdFx0XHRcdGVsZW1lbnQuY2hlY2tlZCA9IGNoZWNrZWQuaGFzKGVsZW1lbnQuaXRlbSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRmb2N1cyh3aGF0OiBRdWlja1BpY2tGb2N1cyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXRlbUVsZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh3aGF0ID09PSBRdWlja1BpY2tGb2N1cy5TZWNvbmQgJiYgdGhpcy5faXRlbUVsZW1lbnRzLmxlbmd0aCA8IDIpIHtcblx0XHRcdHdoYXQgPSBRdWlja1BpY2tGb2N1cy5GaXJzdDtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHdoYXQpIHtcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuRmlyc3Q6XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c0ZpcnN0KHVuZGVmaW5lZCwgKGUpID0+IGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLlNlY29uZDoge1xuXHRcdFx0XHR0aGlzLl90cmVlLnNjcm9sbFRvcCA9IDA7XG5cdFx0XHRcdGxldCBpc1NlY29uZEl0ZW0gPSBmYWxzZTtcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c0ZpcnN0KHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoIShlLmVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGlzU2Vjb25kSXRlbSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlzU2Vjb25kSXRlbSA9ICFpc1NlY29uZEl0ZW07XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLkxhc3Q6XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gdGhpcy5fdHJlZS5zY3JvbGxIZWlnaHQ7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNMYXN0KHVuZGVmaW5lZCwgKGUpID0+IGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLk5leHQ6IHtcblx0XHRcdFx0Y29uc3QgcHJldkZvY3VzID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzTmV4dCh1bmRlZmluZWQsIHRoaXMuX3Nob3VsZExvb3AsIHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoIShlLmVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50KTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRGb2N1cyA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0aWYgKHByZXZGb2N1cy5sZW5ndGggJiYgcHJldkZvY3VzWzBdID09PSBjdXJyZW50Rm9jdXNbMF0pIHtcblx0XHRcdFx0XHR0aGlzLl9vbkxlYXZlLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuUHJldmlvdXM6IHtcblx0XHRcdFx0Y29uc3QgcHJldkZvY3VzID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzUHJldmlvdXModW5kZWZpbmVkLCB0aGlzLl9zaG91bGRMb29wLCB1bmRlZmluZWQsIChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCEoZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBhcmVudCA9IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdGlmIChwYXJlbnQgPT09IG51bGwgfHwgKHBhcmVudCBhcyBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KS5jaGlsZHJlblswXSAhPT0gZS5lbGVtZW50KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBPbmx5IGlmIHdlIGFyZSB0aGUgZmlyc3QgY2hpbGQgb2YgYSBzZXBhcmF0b3IgZG8gd2UgcmV2ZWFsIHRoZSBzZXBhcmF0b3Jcblx0XHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKHBhcmVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZvY3VzID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAocHJldkZvY3VzLmxlbmd0aCAmJiBwcmV2Rm9jdXNbMF0gPT09IGN1cnJlbnRGb2N1c1swXSkge1xuXHRcdFx0XHRcdHRoaXMuX29uTGVhdmUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5OZXh0UGFnZTpcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c05leHRQYWdlKHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoIShlLmVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50KTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5QcmV2aW91c1BhZ2U6XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNQcmV2aW91c1BhZ2UodW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmICghKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwYXJlbnQgPSB0aGlzLl90cmVlLmdldFBhcmVudEVsZW1lbnQoZS5lbGVtZW50KTtcblx0XHRcdFx0XHRpZiAocGFyZW50ID09PSBudWxsIHx8IChwYXJlbnQgYXMgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCkuY2hpbGRyZW5bMF0gIT09IGUuZWxlbWVudCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwocGFyZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuTmV4dFNlcGFyYXRvcjoge1xuXHRcdFx0XHRsZXQgZm91bmRTZXBhcmF0b3JBc0l0ZW0gPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgYmVmb3JlID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpWzBdO1xuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzTmV4dCh1bmRlZmluZWQsIHRydWUsIHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoZm91bmRTZXBhcmF0b3JBc0l0ZW0pIHtcblx0XHRcdFx0XHRcdC8vIFRoaXMgc2hvdWxkIGJlIHRoZSBpbmRleCByaWdodCBhZnRlciB0aGUgc2VwYXJhdG9yIHNvIGl0XG5cdFx0XHRcdFx0XHQvLyBpcyB0aGUgaXRlbSB3ZSB3YW50IHRvIGZvY3VzLlxuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdGZvdW5kU2VwYXJhdG9yQXNJdGVtID0gdHJ1ZTtcblx0XHRcdFx0XHRcdC8vIElmIHRoZSBzZXBhcmF0b3IgaXMgdmlzaWJsZSwgdGhlbiB3ZSBzaG91bGQganVzdCByZXZlYWwgaXRzIGZpcnN0IGNoaWxkIHNvIGl0J3Mgbm90IGFzIGphcnJpbmcuXG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fc2VwYXJhdG9yUmVuZGVyZXIuaXNTZXBhcmF0b3JWaXNpYmxlKGUuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50LmNoaWxkcmVuWzBdKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdC8vIElmIHRoZSBzZXBhcmF0b3IgaXMgbm90IHZpc2libGUsIHRoZW4gd2Ugc2hvdWxkXG5cdFx0XHRcdFx0XHRcdC8vIHB1c2ggaXQgdXAgdG8gdGhlIHRvcCBvZiB0aGUgbGlzdC5cblx0XHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50LCAwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoZS5lbGVtZW50LnNlcGFyYXRvcikge1xuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy5faXRlbVJlbmRlcmVyLmlzSXRlbVdpdGhTZXBhcmF0b3JWaXNpYmxlKGUuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCwgMCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGUuZWxlbWVudCA9PT0gdGhpcy5fZWxlbWVudFRyZWVbMF0pIHtcblx0XHRcdFx0XHRcdFx0Ly8gV2Ugc2hvdWxkIHN0b3AgYXQgdGhlIGZpcnN0IGl0ZW0gaW4gdGhlIGxpc3QgaWYgaXQncyBhIHJlZ3VsYXIgaXRlbS5cblx0XHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50LCAwKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGFmdGVyID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpWzBdO1xuXHRcdFx0XHRpZiAoYmVmb3JlID09PSBhZnRlcikge1xuXHRcdFx0XHRcdC8vIElmIHdlIGRpZG4ndCBtb3ZlLCB0aGVuIHdlIHNob3VsZCBqdXN0IG1vdmUgdG8gdGhlIGVuZFxuXHRcdFx0XHRcdC8vIG9mIHRoZSBsaXN0LlxuXHRcdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gdGhpcy5fdHJlZS5zY3JvbGxIZWlnaHQ7XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c0xhc3QodW5kZWZpbmVkLCAoZSkgPT4gZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5QcmV2aW91c1NlcGFyYXRvcjoge1xuXHRcdFx0XHRsZXQgZm9jdXNFbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0Ly8gSWYgd2UgYXJlIGFscmVhZHkgc2l0dGluZyBvbiBhbiBpbmxpbmUgc2VwYXJhdG9yLCB0aGVuIHdlXG5cdFx0XHRcdC8vIGhhdmUgYWxyZWFkeSBmb3VuZCB0aGUgX2N1cnJlbnRfIHNlcGFyYXRvciBhbmQgbmVlZCB0b1xuXHRcdFx0XHQvLyBtb3ZlIHRvIHRoZSBwcmV2aW91cyBvbmUuXG5cdFx0XHRcdGxldCBmb3VuZFNlcGFyYXRvciA9ICEhdGhpcy5fdHJlZS5nZXRGb2N1cygpWzBdPy5zZXBhcmF0b3I7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNQcmV2aW91cyh1bmRlZmluZWQsIHRydWUsIHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0aWYgKGZvdW5kU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmICghZm9jdXNFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuX3NlcGFyYXRvclJlbmRlcmVyLmlzU2VwYXJhdG9yVmlzaWJsZShlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQsIDApO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRmb2N1c0VsZW1lbnQgPSBlLmVsZW1lbnQuY2hpbGRyZW5bMF07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGZvdW5kU2VwYXJhdG9yID0gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoIWZvY3VzRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHRpZiAoZS5lbGVtZW50LnNlcGFyYXRvcikge1xuXHRcdFx0XHRcdFx0XHRcdGlmICh0aGlzLl9pdGVtUmVuZGVyZXIuaXNJdGVtV2l0aFNlcGFyYXRvclZpc2libGUoZS5lbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50LCAwKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdFx0XHRmb2N1c0VsZW1lbnQgPSBlLmVsZW1lbnQ7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50ID09PSB0aGlzLl9lbGVtZW50VHJlZVswXSkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIFdlIHNob3VsZCBzdG9wIGF0IHRoZSBmaXJzdCBpdGVtIGluIHRoZSBsaXN0IGlmIGl0J3MgYSByZWd1bGFyIGl0ZW0uXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50LCAwKTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoZm9jdXNFbGVtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5zZXRGb2N1cyhbZm9jdXNFbGVtZW50XSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXJGb2N1cygpIHtcblx0XHR0aGlzLl90cmVlLnNldEZvY3VzKFtdKTtcblx0fVxuXG5cdGRvbUZvY3VzKCkge1xuXHRcdHRoaXMuX3RyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdGxheW91dChtYXhIZWlnaHQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl90cmVlLmdldEhUTUxFbGVtZW50KCkuc3R5bGUubWF4SGVpZ2h0ID0gbWF4SGVpZ2h0ID8gYCR7XG5cdFx0XHQvLyBNYWtlIHN1cmUgaGVpZ2h0IGFsaWducyB3aXRoIGxpc3QgaXRlbSBoZWlnaHRzXG5cdFx0XHRNYXRoLmZsb29yKG1heEhlaWdodCAvIDQ0KSAqIDQ0XG5cdFx0XHQvLyBBZGQgc29tZSBleHRyYSBoZWlnaHQgc28gdGhhdCBpdCdzIGNsZWFyIHRoZXJlJ3MgbW9yZSB0byBzY3JvbGxcblx0XHRcdCsgNlxuXHRcdFx0fXB4YCA6ICcnO1xuXHRcdHRoaXMuX3RyZWUubGF5b3V0KCk7XG5cdH1cblxuXHRmaWx0ZXIocXVlcnk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHRoaXMuX2xhc3RRdWVyeVN0cmluZyA9IHF1ZXJ5O1xuXHRcdGlmICghKHRoaXMuX3NvcnRCeUxhYmVsIHx8IHRoaXMuX21hdGNoT25MYWJlbCB8fCB0aGlzLl9tYXRjaE9uRGVzY3JpcHRpb24gfHwgdGhpcy5fbWF0Y2hPbkRldGFpbCkpIHtcblx0XHRcdHRoaXMuX3RyZWUubGF5b3V0KCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcXVlcnlXaXRoV2hpdGVzcGFjZSA9IHF1ZXJ5O1xuXHRcdHF1ZXJ5ID0gcXVlcnkudHJpbSgpO1xuXG5cdFx0Ly8gUmVzZXQgZmlsdGVyaW5nXG5cdFx0aWYgKCFxdWVyeSB8fCAhKHRoaXMubWF0Y2hPbkxhYmVsIHx8IHRoaXMubWF0Y2hPbkRlc2NyaXB0aW9uIHx8IHRoaXMubWF0Y2hPbkRldGFpbCkpIHtcblx0XHRcdHRoaXMuX2l0ZW1FbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRlbGVtZW50LmxhYmVsSGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0ZWxlbWVudC5kZXNjcmlwdGlvbkhpZ2hsaWdodHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGVsZW1lbnQuZGV0YWlsSGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0ZWxlbWVudC5oaWRkZW4gPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXMgPSBlbGVtZW50LmluZGV4ICYmIHRoaXMuX2lucHV0RWxlbWVudHNbZWxlbWVudC5pbmRleCAtIDFdO1xuXHRcdFx0XHRpZiAoZWxlbWVudC5pdGVtKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zZXBhcmF0b3IgPSBwcmV2aW91cyAmJiBwcmV2aW91cy50eXBlID09PSAnc2VwYXJhdG9yJyAmJiAhcHJldmlvdXMuYnV0dG9ucyA/IHByZXZpb3VzIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBGaWx0ZXIgYnkgdmFsdWUgKHNpbmNlIHdlIHN1cHBvcnQgaWNvbnMgaW4gbGFiZWxzLCB1c2UgJCguLikgYXdhcmUgZnV6enkgbWF0Y2hpbmcpXG5cdFx0ZWxzZSB7XG5cdFx0XHRsZXQgY3VycmVudFNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciB8IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2l0ZW1FbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRsZXQgbGFiZWxIaWdobGlnaHRzOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHRoaXMubWF0Y2hPbkxhYmVsTW9kZSA9PT0gJ2Z1enp5Jykge1xuXHRcdFx0XHRcdGxhYmVsSGlnaGxpZ2h0cyA9IHRoaXMubWF0Y2hPbkxhYmVsID8gbWF0Y2hlc0Z1enp5SWNvbkF3YXJlKHF1ZXJ5LCBwYXJzZUxhYmVsV2l0aEljb25zKGVsZW1lbnQuc2FuZUxhYmVsKSkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxhYmVsSGlnaGxpZ2h0cyA9IHRoaXMubWF0Y2hPbkxhYmVsID8gbWF0Y2hlc0NvbnRpZ3VvdXNJY29uQXdhcmUocXVlcnlXaXRoV2hpdGVzcGFjZSwgcGFyc2VMYWJlbFdpdGhJY29ucyhlbGVtZW50LnNhbmVMYWJlbCkpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbkhpZ2hsaWdodHMgPSB0aGlzLm1hdGNoT25EZXNjcmlwdGlvbiA/IG1hdGNoZXNGdXp6eUljb25Bd2FyZShxdWVyeSwgcGFyc2VMYWJlbFdpdGhJY29ucyhlbGVtZW50LnNhbmVEZXNjcmlwdGlvbiB8fCAnJykpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZGV0YWlsSGlnaGxpZ2h0cyA9IHRoaXMubWF0Y2hPbkRldGFpbCA/IG1hdGNoZXNGdXp6eUljb25Bd2FyZShxdWVyeSwgcGFyc2VMYWJlbFdpdGhJY29ucyhlbGVtZW50LnNhbmVEZXRhaWwgfHwgJycpKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0aWYgKGxhYmVsSGlnaGxpZ2h0cyB8fCBkZXNjcmlwdGlvbkhpZ2hsaWdodHMgfHwgZGV0YWlsSGlnaGxpZ2h0cykge1xuXHRcdFx0XHRcdGVsZW1lbnQubGFiZWxIaWdobGlnaHRzID0gbGFiZWxIaWdobGlnaHRzO1xuXHRcdFx0XHRcdGVsZW1lbnQuZGVzY3JpcHRpb25IaWdobGlnaHRzID0gZGVzY3JpcHRpb25IaWdobGlnaHRzO1xuXHRcdFx0XHRcdGVsZW1lbnQuZGV0YWlsSGlnaGxpZ2h0cyA9IGRldGFpbEhpZ2hsaWdodHM7XG5cdFx0XHRcdFx0ZWxlbWVudC5oaWRkZW4gPSBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlbGVtZW50LmxhYmVsSGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRlbGVtZW50LmRlc2NyaXB0aW9uSGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRlbGVtZW50LmRldGFpbEhpZ2hsaWdodHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0ZWxlbWVudC5oaWRkZW4gPSBlbGVtZW50Lml0ZW0gPyAhZWxlbWVudC5pdGVtLmFsd2F5c1Nob3cgOiB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRW5zdXJlIHNlcGFyYXRvcnMgYXJlIGZpbHRlcmVkIG91dCBmaXJzdCBiZWZvcmUgZGVjaWRpbmcgaWYgd2UgbmVlZCB0byBicmluZyB0aGVtIGJhY2tcblx0XHRcdFx0aWYgKGVsZW1lbnQuaXRlbSkge1xuXHRcdFx0XHRcdGVsZW1lbnQuc2VwYXJhdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuc2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5oaWRkZW4gPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gd2UgY2FuIHNob3cgdGhlIHNlcGFyYXRvciB1bmxlc3MgdGhlIGxpc3QgZ2V0cyBzb3J0ZWQgYnkgbWF0Y2hcblx0XHRcdFx0aWYgKCF0aGlzLnNvcnRCeUxhYmVsKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJldmlvdXMgPSBlbGVtZW50LmluZGV4ICYmIHRoaXMuX2lucHV0RWxlbWVudHNbZWxlbWVudC5pbmRleCAtIDFdIHx8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAocHJldmlvdXM/LnR5cGUgPT09ICdzZXBhcmF0b3InICYmICFwcmV2aW91cy5idXR0b25zKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50U2VwYXJhdG9yID0gcHJldmlvdXM7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjdXJyZW50U2VwYXJhdG9yICYmICFlbGVtZW50LmhpZGRlbikge1xuXHRcdFx0XHRcdFx0ZWxlbWVudC5zZXBhcmF0b3IgPSBjdXJyZW50U2VwYXJhdG9yO1xuXHRcdFx0XHRcdFx0Y3VycmVudFNlcGFyYXRvciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NldEVsZW1lbnRzVG9UcmVlKHRoaXMuX3NvcnRCeUxhYmVsICYmIHF1ZXJ5XG5cdFx0XHQvLyBXZSBkb24ndCByZW5kZXIgYW55IHNlcGFyYXRvcnMgaWYgd2UncmUgc29ydGluZyBzbyBqdXN0IHJlbmRlciB0aGUgZWxlbWVudHNcblx0XHRcdD8gdGhpcy5faXRlbUVsZW1lbnRzXG5cdFx0XHQvLyBSZW5kZXIgdGhlIGZ1bGwgdHJlZVxuXHRcdFx0OiB0aGlzLl9lbGVtZW50VHJlZVxuXHRcdCk7XG5cdFx0dGhpcy5fdHJlZS5sYXlvdXQoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHRvZ2dsZUNoZWNrYm94KCkge1xuXHRcdHRoaXMuX2VsZW1lbnRDaGVja2VkRXZlbnRCdWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCkuZmlsdGVyKChlKTogZSBpcyBRdWlja1BpY2tJdGVtRWxlbWVudCA9PiBlIGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpO1xuXHRcdFx0Y29uc3QgYWxsQ2hlY2tlZCA9IHRoaXMuX2FsbFZpc2libGVDaGVja2VkKGVsZW1lbnRzKTtcblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuXHRcdFx0XHRpZiAoIWVsZW1lbnQuY2hlY2tib3hEaXNhYmxlZCkge1xuXHRcdFx0XHRcdC8vIFdvdWxkIGZpcmUgYW4gZXZlbnQgaWYgd2UgZGlkbid0IGhhdmUgdGhlIGZsYWcgc2V0XG5cdFx0XHRcdFx0ZWxlbWVudC5jaGVja2VkID0gIWFsbENoZWNrZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHN0eWxlKHN0eWxlczogSUxpc3RTdHlsZXMpIHtcblx0XHR0aGlzLl90cmVlLnN0eWxlKHN0eWxlcyk7XG5cdH1cblxuXHR0b2dnbGVIb3ZlcigpIHtcblx0XHRjb25zdCBmb2N1c2VkOiBJUXVpY2tQaWNrRWxlbWVudCB8IG51bGwgPSB0aGlzLl90cmVlLmdldEZvY3VzKClbMF07XG5cdFx0aWYgKCFmb2N1c2VkPy5zYW5lVG9vbHRpcCB8fCAhKGZvY3VzZWQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBpZiB0aGVyZSdzIGEgaG92ZXIgYWxyZWFkeSwgaGlkZSBpdCAodG9nZ2xlIG9mZilcblx0XHRpZiAodGhpcy5fbGFzdEhvdmVyICYmICF0aGlzLl9sYXN0SG92ZXIuaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fbGFzdEhvdmVyLmRpc3Bvc2UoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGVyZSBpcyBubyBob3Zlciwgc2hvdyBpdCAodG9nZ2xlIG9uKVxuXHRcdHRoaXMuc2hvd0hvdmVyKGZvY3VzZWQpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl90cmVlLm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB7XG5cdFx0XHRpZiAoZS5lbGVtZW50c1swXSBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuc2hvd0hvdmVyKGUuZWxlbWVudHNbMF0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRpZiAodGhpcy5fbGFzdEhvdmVyKSB7XG5cdFx0XHRzdG9yZS5hZGQodGhpcy5fbGFzdEhvdmVyKTtcblx0XHR9XG5cdFx0dGhpcy5fZWxlbWVudERpc3Bvc2FibGUuYWRkKHN0b3JlKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBwcml2YXRlIG1ldGhvZHNcblxuXHRwcml2YXRlIF9zZXRFbGVtZW50c1RvVHJlZShlbGVtZW50czogSVF1aWNrUGlja0VsZW1lbnRbXSkge1xuXHRcdGNvbnN0IHRyZWVFbGVtZW50cyA9IG5ldyBBcnJheTxJT2JqZWN0VHJlZUVsZW1lbnQ8SVF1aWNrUGlja0VsZW1lbnQ+PigpO1xuXHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiBlbGVtZW50cykge1xuXHRcdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KSB7XG5cdFx0XHRcdHRyZWVFbGVtZW50cy5wdXNoKHtcblx0XHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlOiBmYWxzZSxcblx0XHRcdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGNoaWxkcmVuOiBlbGVtZW50LmNoaWxkcmVuLm1hcChlID0+ICh7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiBlLFxuXHRcdFx0XHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dHJlZUVsZW1lbnRzLnB1c2goe1xuXHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl90cmVlLnNldENoaWxkcmVuKG51bGwsIHRyZWVFbGVtZW50cyk7XG5cdH1cblxuXHRwcml2YXRlIF9hbGxWaXNpYmxlQ2hlY2tlZChlbGVtZW50czogUXVpY2tQaWNrSXRlbUVsZW1lbnRbXSwgd2hlbk5vbmVWaXNpYmxlID0gdHJ1ZSkge1xuXHRcdGZvciAobGV0IGkgPSAwLCBuID0gZWxlbWVudHMubGVuZ3RoOyBpIDwgbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZWxlbWVudHNbaV07XG5cdFx0XHRpZiAoIWVsZW1lbnQuaGlkZGVuICYmIGVsZW1lbnQuaXRlbS5waWNrYWJsZSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0aWYgKCFlbGVtZW50LmNoZWNrZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0d2hlbk5vbmVWaXNpYmxlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gd2hlbk5vbmVWaXNpYmxlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ2hlY2tlZE9ic2VydmFibGVzKCkge1xuXHRcdHRyYW5zYWN0aW9uKCh0eCkgPT4ge1xuXHRcdFx0dGhpcy5fYWxsVmlzaWJsZUNoZWNrZWRPYnNlcnZhYmxlLnNldCh0aGlzLl9hbGxWaXNpYmxlQ2hlY2tlZCh0aGlzLl9pdGVtRWxlbWVudHMsIGZhbHNlKSwgdHgpO1xuXHRcdFx0Y29uc3QgY2hlY2tlZENvdW50ID0gdGhpcy5faXRlbUVsZW1lbnRzLmZpbHRlcihlbGVtZW50ID0+IGVsZW1lbnQuY2hlY2tlZCkubGVuZ3RoO1xuXHRcdFx0dGhpcy5fY2hlY2tlZENvdW50T2JzZXJ2YWJsZS5zZXQoY2hlY2tlZENvdW50LCB0eCk7XG5cdFx0XHR0aGlzLl9jaGVja2VkRWxlbWVudHNPYnNlcnZhYmxlLnNldCh0aGlzLmdldENoZWNrZWRFbGVtZW50cygpLCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZXMgb2YgdGhlIGhvdmVyIGFuZCBzaG93cyBhIG5ldyBvbmUgZm9yIHRoZSBnaXZlbiBpbmRleCBpZiBpdCBoYXMgYSB0b29sdGlwLlxuXHQgKiBAcGFyYW0gZWxlbWVudCBUaGUgZWxlbWVudCB0byBzaG93IHRoZSBob3ZlciBmb3Jcblx0ICovXG5cdHByaXZhdGUgc2hvd0hvdmVyKGVsZW1lbnQ6IFF1aWNrUGlja0l0ZW1FbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2xhc3RIb3ZlciAmJiAhdGhpcy5fbGFzdEhvdmVyLmlzRGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuaG92ZXJEZWxlZ2F0ZS5vbkRpZEhpZGVIb3Zlcj8uKCk7XG5cdFx0XHR0aGlzLl9sYXN0SG92ZXI/LmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRpZiAoIWVsZW1lbnQuZWxlbWVudCB8fCAhZWxlbWVudC5zYW5lVG9vbHRpcCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0SG92ZXIgPSB0aGlzLmhvdmVyRGVsZWdhdGUuc2hvd0hvdmVyKHtcblx0XHRcdGNvbnRlbnQ6IGVsZW1lbnQuc2FuZVRvb2x0aXAsXG5cdFx0XHR0YXJnZXQ6IGVsZW1lbnQuZWxlbWVudCxcblx0XHRcdGxpbmtIYW5kbGVyOiAodXJsKSA9PiB7XG5cdFx0XHRcdHRoaXMubGlua09wZW5lckRlbGVnYXRlKHVybCk7XG5cdFx0XHR9LFxuXHRcdFx0YXBwZWFyYW5jZToge1xuXHRcdFx0XHRzaG93UG9pbnRlcjogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRjb250YWluZXI6IHRoaXMuX2NvbnRhaW5lcixcblx0XHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRcdGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uUklHSFRcblx0XHRcdH1cblx0XHR9LCBmYWxzZSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbWF0Y2hlc0NvbnRpZ3VvdXNJY29uQXdhcmUocXVlcnk6IHN0cmluZywgdGFyZ2V0OiBJUGFyc2VkTGFiZWxXaXRoSWNvbnMpOiBJTWF0Y2hbXSB8IG51bGwge1xuXG5cdGNvbnN0IHsgdGV4dCwgaWNvbk9mZnNldHMgfSA9IHRhcmdldDtcblxuXHQvLyBSZXR1cm4gZWFybHkgaWYgdGhlcmUgYXJlIG5vIGljb24gbWFya2VycyBpbiB0aGUgd29yZCB0byBtYXRjaCBhZ2FpbnN0XG5cdGlmICghaWNvbk9mZnNldHMgfHwgaWNvbk9mZnNldHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIG1hdGNoZXNDb250aWd1b3VzKHF1ZXJ5LCB0ZXh0KTtcblx0fVxuXG5cdC8vIFRyaW0gdGhlIHdvcmQgdG8gbWF0Y2ggYWdhaW5zdCBiZWNhdXNlIGl0IGNvdWxkIGhhdmUgbGVhZGluZ1xuXHQvLyB3aGl0ZXNwYWNlIG5vdyBpZiB0aGUgd29yZCBzdGFydGVkIHdpdGggYW4gaWNvblxuXHRjb25zdCB3b3JkVG9NYXRjaEFnYWluc3RXaXRob3V0SWNvbnNUcmltbWVkID0gbHRyaW0odGV4dCwgJyAnKTtcblx0Y29uc3QgbGVhZGluZ1doaXRlc3BhY2VPZmZzZXQgPSB0ZXh0Lmxlbmd0aCAtIHdvcmRUb01hdGNoQWdhaW5zdFdpdGhvdXRJY29uc1RyaW1tZWQubGVuZ3RoO1xuXG5cdC8vIG1hdGNoIG9uIHZhbHVlIHdpdGhvdXQgaWNvblxuXHRjb25zdCBtYXRjaGVzID0gbWF0Y2hlc0NvbnRpZ3VvdXMocXVlcnksIHdvcmRUb01hdGNoQWdhaW5zdFdpdGhvdXRJY29uc1RyaW1tZWQpO1xuXG5cdC8vIE1hcCBtYXRjaGVzIGJhY2sgdG8gb2Zmc2V0cyB3aXRoIGljb24gYW5kIHRyaW1taW5nXG5cdGlmIChtYXRjaGVzKSB7XG5cdFx0Zm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG5cdFx0XHRjb25zdCBpY29uT2Zmc2V0ID0gaWNvbk9mZnNldHNbbWF0Y2guc3RhcnQgKyBsZWFkaW5nV2hpdGVzcGFjZU9mZnNldF0gLyogaWNvbiBvZmZzZXRzIGF0IGluZGV4ICovICsgbGVhZGluZ1doaXRlc3BhY2VPZmZzZXQgLyogb3ZlcmFsbCBsZWFkaW5nIHdoaXRlc3BhY2Ugb2Zmc2V0ICovO1xuXHRcdFx0bWF0Y2guc3RhcnQgKz0gaWNvbk9mZnNldDtcblx0XHRcdG1hdGNoLmVuZCArPSBpY29uT2Zmc2V0O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBtYXRjaGVzO1xufVxuXG5mdW5jdGlvbiBtYXRjaGVzQ29udGlndW91cyh3b3JkOiBzdHJpbmcsIHdvcmRUb01hdGNoQWdhaW5zdDogc3RyaW5nKTogSU1hdGNoW10gfCBudWxsIHtcblx0Y29uc3QgbWF0Y2hJbmRleCA9IHdvcmRUb01hdGNoQWdhaW5zdC50b0xvd2VyQ2FzZSgpLmluZGV4T2Yod29yZC50b0xvd2VyQ2FzZSgpKTtcblx0aWYgKG1hdGNoSW5kZXggIT09IC0xKSB7XG5cdFx0cmV0dXJuIFt7IHN0YXJ0OiBtYXRjaEluZGV4LCBlbmQ6IG1hdGNoSW5kZXggKyB3b3JkLmxlbmd0aCB9XTtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cblxuZnVuY3Rpb24gY29tcGFyZUVudHJpZXMoZWxlbWVudEE6IElRdWlja1BpY2tFbGVtZW50LCBlbGVtZW50QjogSVF1aWNrUGlja0VsZW1lbnQsIGxvb2tGb3I6IHN0cmluZyk6IG51bWJlciB7XG5cblx0Y29uc3QgbGFiZWxIaWdobGlnaHRzQSA9IGVsZW1lbnRBLmxhYmVsSGlnaGxpZ2h0cyB8fCBbXTtcblx0Y29uc3QgbGFiZWxIaWdobGlnaHRzQiA9IGVsZW1lbnRCLmxhYmVsSGlnaGxpZ2h0cyB8fCBbXTtcblx0aWYgKGxhYmVsSGlnaGxpZ2h0c0EubGVuZ3RoICYmICFsYWJlbEhpZ2hsaWdodHNCLmxlbmd0aCkge1xuXHRcdHJldHVybiAtMTtcblx0fVxuXG5cdGlmICghbGFiZWxIaWdobGlnaHRzQS5sZW5ndGggJiYgbGFiZWxIaWdobGlnaHRzQi5sZW5ndGgpIHtcblx0XHRyZXR1cm4gMTtcblx0fVxuXG5cdGlmIChsYWJlbEhpZ2hsaWdodHNBLmxlbmd0aCA9PT0gMCAmJiBsYWJlbEhpZ2hsaWdodHNCLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiAwO1xuXHR9XG5cblx0cmV0dXJuIGNvbXBhcmVBbnl0aGluZyhlbGVtZW50QS5zYW5lU29ydExhYmVsLCBlbGVtZW50Qi5zYW5lU29ydExhYmVsLCBsb29rRm9yKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksU0FBUztBQUVyQixTQUFTLGVBQWU7QUFJeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBaUMsaUJBQWlCO0FBQ2xELFNBQVMsdUJBQXVCO0FBR2hDLFNBQVMsVUFBVSwwQ0FBeUQ7QUFDNUUsU0FBUywwQkFBMEI7QUFDbkMsU0FBdUQsc0JBQXNCO0FBQzdFLFNBQVMsY0FBYztBQUN2QixTQUFTLG1CQUFtQix3QkFBd0I7QUFDcEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsU0FBUyxPQUFPLHFCQUE0QztBQUdyRSxTQUFnQyxxQkFBcUIsdUJBQXVCLDJCQUEyQjtBQUN2RyxTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBUyxpQkFBaUIscUJBQXFCLG1CQUFtQjtBQUNsRSxTQUFTLFVBQVU7QUFDbkIsU0FBUyxRQUFRLGFBQWE7QUFDOUIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNB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
