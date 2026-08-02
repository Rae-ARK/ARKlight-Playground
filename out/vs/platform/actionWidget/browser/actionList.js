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
import * as dom from "../../../base/browser/dom.js";
import { renderMarkdown } from "../../../base/browser/markdownRenderer.js";
import { ActionBar } from "../../../base/browser/ui/actionbar/actionbar.js";
import { getAnchorRect } from "../../../base/browser/ui/contextview/contextview.js";
import { KeybindingLabel } from "../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Toggle } from "../../../base/browser/ui/toggle/toggle.js";
import { List } from "../../../base/browser/ui/list/listWidget.js";
import { SubmenuAction, toAction } from "../../../base/common/actions.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter } from "../../../base/common/event.js";
import { isMarkdownString, MarkdownString } from "../../../base/common/htmlContent.js";
import { AnchorPosition } from "../../../base/common/layout.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { OS } from "../../../base/common/platform.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { URI } from "../../../base/common/uri.js";
import "./actionWidget.css";
import { localize } from "../../../nls.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { IOpenerService } from "../../opener/common/opener.js";
import { Link } from "../../opener/browser/link.js";
import { defaultListStyles } from "../../theme/browser/defaultStyles.js";
import { asCssVariable } from "../../theme/common/colorRegistry.js";
import { ILayoutService } from "../../layout/browser/layoutService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
const acceptSelectedActionCommand = "acceptSelectedCodeAction";
const previewSelectedActionCommand = "previewSelectedCodeAction";
var ActionListItemKind = /* @__PURE__ */ ((ActionListItemKind2) => {
  ActionListItemKind2["Action"] = "action";
  ActionListItemKind2["Header"] = "header";
  ActionListItemKind2["Separator"] = "separator";
  return ActionListItemKind2;
})(ActionListItemKind || {});
class HeaderRenderer {
  get templateId() {
    return "header" /* Header */;
  }
  renderTemplate(container) {
    container.classList.add("group-header");
    const text = document.createElement("span");
    container.append(text);
    return { container, text };
  }
  renderElement(element, _index, templateData) {
    templateData.text.textContent = element.group?.title ?? element.label ?? "";
  }
  disposeTemplate(_templateData) {
  }
}
class SeparatorRenderer {
  get templateId() {
    return "separator" /* Separator */;
  }
  renderTemplate(container) {
    container.classList.add("separator");
    const text = document.createElement("span");
    container.append(text);
    return { container, text };
  }
  renderElement(element, _index, templateData) {
    templateData.text.textContent = element.label ?? "";
  }
  disposeTemplate(_templateData) {
  }
}
let ActionItemRenderer = class {
  constructor(_supportsPreview, _onRemoveItem, _onShowSubmenu, _hasAnySubmenuActions, _groupTitleByIndex, _linkHandler, _hideDefaultKeybindingTooltip, _keybindingService, _openerService) {
    this._supportsPreview = _supportsPreview;
    this._onRemoveItem = _onRemoveItem;
    this._onShowSubmenu = _onShowSubmenu;
    this._hasAnySubmenuActions = _hasAnySubmenuActions;
    this._groupTitleByIndex = _groupTitleByIndex;
    this._linkHandler = _linkHandler;
    this._hideDefaultKeybindingTooltip = _hideDefaultKeybindingTooltip;
    this._keybindingService = _keybindingService;
    this._openerService = _openerService;
  }
  get templateId() {
    return "action" /* Action */;
  }
  renderTemplate(container) {
    container.classList.add(this.templateId);
    const icon = document.createElement("div");
    icon.className = "icon";
    container.append(icon);
    const text = document.createElement("span");
    text.className = "title";
    container.append(text);
    const badge = document.createElement("span");
    badge.className = "action-item-badge";
    container.append(badge);
    const description = document.createElement("span");
    description.className = "description";
    container.append(description);
    const groupTitle = document.createElement("span");
    groupTitle.className = "group-title";
    container.append(groupTitle);
    const detail = document.createElement("span");
    detail.className = "detail";
    container.append(detail);
    const keybinding = new KeybindingLabel(container, OS);
    const toolbar = document.createElement("div");
    toolbar.className = "action-list-item-toolbar";
    container.append(toolbar);
    const submenuIndicator = document.createElement("div");
    submenuIndicator.className = "action-list-submenu-indicator";
    container.append(submenuIndicator);
    const inlineToggleContainer = document.createElement("div");
    inlineToggleContainer.className = "action-list-item-inline-toggle";
    container.append(inlineToggleContainer);
    const elementDisposables = new DisposableStore();
    return { container, icon, text, detail, badge, description, groupTitle, keybinding, toolbar, submenuIndicator, inlineToggleContainer, elementDisposables };
  }
  renderElement(element, _index, data) {
    data.elementDisposables.clear();
    if (element.group?.icon) {
      data.icon.className = ThemeIcon.asClassName(element.group.icon);
      if (element.group.icon.color) {
        data.icon.style.color = asCssVariable(element.group.icon.color.id);
      }
    } else {
      data.icon.className = ThemeIcon.asClassName(Codicon.lightBulb);
      data.icon.style.color = "var(--vscode-editorLightBulb-foreground)";
    }
    if (!element.item || !element.label) {
      return;
    }
    dom.setVisibility(!element.hideIcon, data.icon);
    if (element.isSectionToggle) {
      const expanded = element.group?.icon === Codicon.chevronDown;
      data.container.setAttribute("aria-expanded", String(expanded));
    } else {
      data.container.removeAttribute("aria-expanded");
    }
    if (data.previousClassName) {
      data.container.classList.remove(data.previousClassName);
    }
    data.container.classList.toggle("action-list-custom", !!element.className);
    if (element.className) {
      data.container.classList.add(element.className);
    }
    data.previousClassName = element.className;
    data.text.textContent = stripNewlines(element.label);
    if (element.badge) {
      data.badge.textContent = element.badge;
      data.badge.style.display = "";
    } else {
      data.badge.textContent = "";
      data.badge.style.display = "none";
    }
    if (element.keybinding) {
      data.description.textContent = element.keybinding.getLabel();
      data.description.style.display = "inline";
      data.description.style.letterSpacing = "0.5px";
    } else if (element.description) {
      dom.clearNode(data.description);
      if (typeof element.description === "string") {
        data.description.textContent = stripNewlines(element.description);
      } else {
        const rendered = renderMarkdown(element.description, {
          actionHandler: (content) => {
            const uri = URI.parse(content);
            if (this._linkHandler) {
              this._linkHandler(uri, element);
            } else {
              void this._openerService.open(uri, { allowCommands: true });
            }
          }
        });
        data.elementDisposables.add(rendered);
        data.description.appendChild(rendered.element);
      }
      data.description.style.display = "inline";
    } else {
      data.description.textContent = "";
      data.description.style.display = "none";
    }
    const groupTitleText = this._groupTitleByIndex.get(_index);
    if (groupTitleText) {
      data.groupTitle.textContent = groupTitleText;
      data.groupTitle.style.display = "";
    } else {
      data.groupTitle.textContent = "";
      data.groupTitle.style.display = "none";
    }
    if (element.detail) {
      data.detail.textContent = stripNewlines(element.detail);
      data.detail.style.display = "";
    } else {
      data.detail.textContent = "";
      data.detail.style.display = "none";
    }
    dom.clearNode(data.inlineToggleContainer);
    if (element.inlineToggle) {
      const inlineToggle = element.inlineToggle;
      const toggleLabel = document.createElement("span");
      toggleLabel.className = "action-list-item-inline-toggle-label";
      toggleLabel.textContent = stripNewlines(inlineToggle.label);
      data.inlineToggleContainer.append(toggleLabel);
      data.inlineToggleContainer.style.display = "";
      data.container.classList.add("has-inline-toggle");
      const toggle = data.elementDisposables.add(new Toggle({
        title: inlineToggle.title ?? inlineToggle.label,
        isChecked: inlineToggle.checked,
        actionClassName: "action-list-inline-switch",
        notFocusable: false,
        inputActiveOptionBorder: void 0,
        inputActiveOptionForeground: void 0,
        inputActiveOptionBackground: void 0
      }));
      data.inlineToggleContainer.append(toggle.domNode);
      data.elementDisposables.add(toggle.onChange(() => inlineToggle.onChange(toggle.checked)));
      data.elementDisposables.add(dom.addDisposableListener(data.inlineToggleContainer, dom.EventType.CLICK, (e) => e.stopPropagation()));
    } else {
      data.inlineToggleContainer.style.display = "none";
      data.container.classList.remove("has-inline-toggle");
    }
    const actionTitle = this._keybindingService.lookupKeybinding(acceptSelectedActionCommand)?.getLabel();
    const previewTitle = this._keybindingService.lookupKeybinding(previewSelectedActionCommand)?.getLabel();
    data.container.classList.toggle("option-disabled", !!element.disabled);
    if (element.hover !== void 0) {
      data.container.title = "";
    } else if (element.tooltip) {
      data.container.title = element.tooltip;
    } else if (element.disabled) {
      data.container.title = element.label;
    } else if (this._hideDefaultKeybindingTooltip) {
      data.container.title = "";
    } else if (actionTitle && previewTitle) {
      if (this._supportsPreview && element.canPreview) {
        data.container.title = localize({ key: "label-preview", comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", actionTitle, previewTitle);
      } else {
        data.container.title = localize({ key: "label", comment: ['placeholder is a keybinding, e.g "F2 to Apply"'] }, "{0} to Apply", actionTitle);
      }
    } else {
      data.container.title = "";
    }
    dom.clearNode(data.toolbar);
    const toolbarActions = [...element.toolbarActions ?? []];
    if (element.onRemove) {
      toolbarActions.push(toAction({
        id: "actionList.remove",
        label: localize("actionList.remove", "Remove"),
        class: ThemeIcon.asClassName(Codicon.close),
        run: async () => {
          await element.onRemove();
          this._onRemoveItem?.(element);
        }
      }));
    }
    data.container.classList.toggle("has-toolbar", toolbarActions.length > 0);
    if (toolbarActions.length > 0) {
      const actionBar = new ActionBar(data.toolbar);
      data.elementDisposables.add(actionBar);
      actionBar.push(toolbarActions, { icon: true, label: false });
    }
    if (element.submenuActions?.length && !element.hover?.content) {
      data.submenuIndicator.className = "action-list-submenu-indicator has-submenu " + ThemeIcon.asClassName(Codicon.chevronRight);
      data.submenuIndicator.style.display = "";
      data.submenuIndicator.style.visibility = "";
      data.elementDisposables.add(dom.addDisposableListener(data.submenuIndicator, dom.EventType.CLICK, (e) => {
        e.stopPropagation();
        this._onShowSubmenu?.(element);
      }));
    } else if (this._hasAnySubmenuActions) {
      data.submenuIndicator.className = "action-list-submenu-indicator";
      data.submenuIndicator.style.display = "";
      data.submenuIndicator.style.visibility = "hidden";
    } else {
      data.submenuIndicator.className = "action-list-submenu-indicator";
      data.submenuIndicator.style.display = "none";
    }
  }
  disposeTemplate(templateData) {
    templateData.keybinding.dispose();
    templateData.elementDisposables.dispose();
  }
};
ActionItemRenderer = __decorateClass([
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IOpenerService)
], ActionItemRenderer);
class AcceptSelectedEvent extends UIEvent {
  constructor() {
    super("acceptSelectedAction");
  }
}
class PreviewSelectedEvent extends UIEvent {
  constructor() {
    super("previewSelectedAction");
  }
}
function getKeyboardNavigationLabel(item) {
  if (item.kind === "action") {
    return item.label;
  }
  return void 0;
}
let ActionListWidget = class extends Disposable {
  constructor(user, _supportsPreview, items, _delegate, accessibilityProvider, _options, _keybindingService, _openerService, _instantiationService) {
    super();
    this._supportsPreview = _supportsPreview;
    this._delegate = _delegate;
    this._options = _options;
    this._keybindingService = _keybindingService;
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._headerLineHeight = 24;
    this._separatorLineHeight = 8;
    this.cts = this._register(new CancellationTokenSource());
    this._submenuDisposables = this._register(new DisposableStore());
    this._collapsedSections = /* @__PURE__ */ new Set();
    this._filterText = "";
    this._imeSessionInProgress = false;
    this._suppressHover = false;
    this._hasLaidOut = false;
    this._filterCts = this._register(new MutableDisposable());
    this._groupTitleByIndex = /* @__PURE__ */ new Map();
    this._onDidRequestLayout = this._register(new Emitter());
    /**
     * Fired when the widget's visible item set changes and the parent should
     * re-layout (e.g. after filtering or collapsing a section).
     */
    this.onDidRequestLayout = this._onDidRequestLayout.event;
    this.domNode = document.createElement("div");
    this.domNode.classList.add("actionList");
    if (this._options?.inlineDescription) {
      this.domNode.classList.add("inline-description");
    }
    if (this._options?.className) {
      const classNames = this._options.className.split(/\s+/).filter((className) => className.length > 0);
      if (classNames.length > 0) {
        this.domNode.classList.add(...classNames);
      }
    }
    this._actionLineHeight = 24;
    this._submenuContainer = document.createElement("div");
    this._submenuContainer.className = "action-list-submenu-panel action-widget";
    this._submenuContainer.style.display = "none";
    this._submenuContainer.tabIndex = -1;
    this.domNode.append(this._submenuContainer);
    this._register(dom.addDisposableListener(this._submenuContainer, "mouseenter", () => {
      this._cancelSubmenuHide();
    }));
    this._register(dom.addDisposableListener(this._submenuContainer, "mouseleave", () => {
      this._scheduleSubmenuHide();
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_LEAVE, () => {
      this._cancelSubmenuShow();
    }));
    this._register(toDisposable(() => {
      this._cancelSubmenuHide();
      this._cancelSubmenuShow();
    }));
    if (this._options?.collapsedByDefault) {
      for (const section of this._options.collapsedByDefault) {
        this._collapsedSections.add(section);
      }
    }
    const virtualDelegate = {
      getHeight: (element) => {
        return this._getItemHeight(element);
      },
      getTemplateId: (element) => element.kind
    };
    const reserveSubmenuSpace = this._options?.reserveSubmenuSpace ?? true;
    const hasAnySubmenuActions = reserveSubmenuSpace && items.some((item) => !!item.submenuActions?.length && !item.hover?.content);
    this._list = this._register(new List(user, this.domNode, virtualDelegate, [
      new ActionItemRenderer(this._supportsPreview, (item) => this._removeItem(item), (item) => this._showSubmenuForItem(item), hasAnySubmenuActions, this._groupTitleByIndex, this._options?.linkHandler, this._options?.hideDefaultKeybindingTooltip ?? false, this._keybindingService, this._openerService),
      new HeaderRenderer(),
      new SeparatorRenderer()
    ], {
      keyboardSupport: false,
      typeNavigationEnabled: !this._options?.showFilter,
      keyboardNavigationLabelProvider: { getKeyboardNavigationLabel },
      accessibilityProvider: {
        getAriaLabel: (element) => {
          if (element.kind === "action" /* Action */) {
            let label = element.label ? stripNewlines(element?.label) : "";
            if (element.detail) {
              label = label + ", " + stripNewlines(element.detail);
            }
            if (element.ariaDescription) {
              label = label + ", " + stripNewlines(element.ariaDescription);
            } else if (element.description) {
              const descText = typeof element.description === "string" ? element.description : element.description.value;
              label = label + ", " + stripNewlines(descText);
            }
            if (element.hover?.content && !element.ariaDescription && !element.description) {
              const hoverContent = element.hover.content;
              const hoverText = typeof hoverContent === "string" ? hoverContent : isMarkdownString(hoverContent) ? hoverContent.value : dom.isHTMLElement(hoverContent) ? hoverContent.textContent ?? void 0 : void 0;
              if (hoverText && (!element.detail || stripNewlines(element.detail) !== stripNewlines(hoverText))) {
                label = label + ", " + stripNewlines(hoverText);
              }
            }
            if (element.group?.title) {
              label = label + ", " + element.group.title;
            }
            if (element.inlineToggle) {
              label = label + ", " + (element.inlineToggle.checked ? localize("actionList.inlineToggle.on", "{0}, on", element.inlineToggle.label) : localize("actionList.inlineToggle.off", "{0}, off", element.inlineToggle.label));
            }
            if (element.disabled) {
              label = localize({ key: "customQuickFixWidget.labels", comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
            }
            if (element.submenuActions?.length) {
              label = localize("actionList.submenuHint", "{0}, use right arrow to access options", label);
            }
            return label;
          }
          return null;
        },
        getWidgetAriaLabel: () => localize({ key: "customQuickFixWidget", comment: [`An action widget option`] }, "Action Widget"),
        getRole: (e) => {
          switch (e.kind) {
            case "action" /* Action */:
              return "option";
            case "separator" /* Separator */:
              return "separator";
            default:
              return "separator";
          }
        },
        getWidgetRole: () => "listbox",
        ...accessibilityProvider
      }
    }));
    this._list.style(defaultListStyles);
    this._register(this._list.onMouseClick((e) => this.onListClick(e)));
    this._register(this._list.onMouseOver((e) => this.onListHover(e)));
    this._register(this._list.onDidChangeFocus(() => this.onFocus()));
    this._register(this._list.onDidChangeSelection((e) => this.onListSelection(e)));
    this._allMenuItems = [...items];
    if (this._options?.showFilter || this._options?.secondaryHeading) {
      this._filterContainer = document.createElement("div");
      this._filterContainer.className = "action-list-filter";
      const filterRow = dom.append(this._filterContainer, dom.$(".action-list-filter-row"));
      if (this._options?.showFilter) {
        this._filterInput = document.createElement("input");
        this._filterInput.type = "text";
        this._filterInput.className = "action-list-filter-input";
        this._filterInput.placeholder = this._options?.filterPlaceholder ?? localize("actionList.filter.placeholder", "Search...");
        this._filterInput.setAttribute("aria-label", localize("actionList.filter.ariaLabel", "Filter items"));
        filterRow.appendChild(this._filterInput);
        const filterActions = this._options?.filterActions ?? [];
        if (filterActions.length > 0) {
          const filterActionsContainer = dom.append(filterRow, dom.$(".action-list-filter-actions"));
          const filterActionBar = this._register(new ActionBar(filterActionsContainer));
          filterActionBar.push(filterActions, { icon: true, label: false });
        }
        const onFilterValueChanged = () => {
          const value = this._filterInput.value;
          if (this._imeSessionInProgress || value === this._filterText) {
            return;
          }
          this._filterText = value;
          this._applyOrUpdateFilter();
        };
        this._register(dom.addDisposableListener(this._filterInput, "compositionstart", () => {
          this._imeSessionInProgress = true;
          this._filterCts.value?.cancel();
        }));
        this._register(dom.addDisposableListener(this._filterInput, "compositionend", () => {
          this._imeSessionInProgress = false;
          onFilterValueChanged();
        }));
        this._register(dom.addDisposableListener(this._filterInput, "input", onFilterValueChanged));
      }
      if (this._options?.secondaryHeading) {
        const filterLabelEl = dom.append(filterRow, dom.$(".action-list-filter-label"));
        filterLabelEl.textContent = this._options.secondaryHeading;
      }
    }
    if (this._options?.footerText) {
      this._footerContainer = document.createElement("div");
      this._footerContainer.className = "action-list-footer";
      this._footerContainer.textContent = this._options.footerText;
    }
    if (this._options?.headerText) {
      this._headerContainer = document.createElement("div");
      this._headerContainer.className = "action-list-header";
      if (this._options.headerIcon) {
        const icon = dom.append(this._headerContainer, dom.$("span.action-list-header-icon"));
        icon.classList.add(...ThemeIcon.asClassNameArray(this._options.headerIcon));
        icon.setAttribute("aria-hidden", "true");
      }
      const text = dom.append(this._headerContainer, dom.$("span.action-list-header-text"));
      text.textContent = this._options.headerText;
      this._register(dom.addDisposableListener(this._headerContainer, dom.EventType.MOUSE_ENTER, () => this._hideSubmenu()));
      if (this._options.headerLink) {
        const { label, uri } = this._options.headerLink;
        text.textContent += " ";
        this._register(this._instantiationService.createInstance(Link, text, { label, href: uri.toString(true) }, {}));
      }
      if (this._options.headerDismiss) {
        const onDismiss = this._options.headerDismiss;
        const dismissButton = dom.append(this._headerContainer, dom.$("span.action-list-header-dismiss"));
        dismissButton.appendChild(dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
        dismissButton.tabIndex = 0;
        dismissButton.setAttribute("role", "button");
        dismissButton.setAttribute("aria-label", localize("actionList.header.dismiss", "Dismiss"));
        const dismiss = () => {
          onDismiss();
          this.focus();
          this._headerContainer?.remove();
          this._headerContainer = void 0;
          this._onDidRequestLayout.fire();
        };
        this._register(dom.addDisposableGenericMouseUpListener(dismissButton, () => dismiss()));
        this._register(dom.addDisposableListener(dismissButton, dom.EventType.KEY_DOWN, (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            dismiss();
          }
        }));
      }
    }
    this._applyFilter();
    if (this._list.length) {
      this._focusCheckedOrFirst();
    }
    this._register(dom.addDisposableListener(this.domNode, "keydown", (e) => {
      if (e.key === "ArrowRight" && !e.isComposing) {
        const focused = this._list.getFocus();
        if (focused.length > 0) {
          const element = this._list.element(focused[0]);
          if (element?.submenuActions?.length) {
            dom.EventHelper.stop(e, true);
            const rowElement = this._getRowElement(focused[0]);
            if (rowElement) {
              this._showSubmenuForElement(element, rowElement);
              this._currentSubmenuWidget?.focus();
            }
          }
        }
      }
    }));
    if (this._filterInput) {
      this._register(dom.addDisposableListener(this.domNode, "keydown", (e) => {
        if (this._filterInput && !dom.isActiveElement(this._filterInput) && !e.isComposing && e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this._filterInput.focus();
          this._filterInput.value = e.key;
          this._filterText = e.key;
          this._applyOrUpdateFilter();
          e.preventDefault();
          e.stopPropagation();
        }
      }));
    }
  }
  _toggleSection(section) {
    if (this._collapsedSections.has(section)) {
      this._collapsedSections.delete(section);
    } else {
      this._collapsedSections.add(section);
    }
    this._options?.onDidToggleSection?.(section, this._collapsedSections.has(section));
    this._applyFilter();
  }
  _applyOrUpdateFilter() {
    if (!this._delegate.onFilter) {
      this._applyFilter();
      return;
    }
    const filterText = this._filterText;
    this._filterCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this._filterCts.value = cts;
    this._delegate.onFilter(filterText, cts.token).then((items) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      this._allMenuItems = [...items];
      this._applyFilter(true);
    }).catch(() => {
    });
  }
  _applyFilter(skipTextFilter = false, fireLayout = true) {
    const filterLower = skipTextFilter ? "" : this._filterText.toLowerCase();
    const isFiltering = !skipTextFilter && filterLower.length > 0;
    const visible = [];
    const focusedIndexes = this._list.getFocus();
    let focusedItem;
    if (focusedIndexes.length > 0) {
      focusedItem = this._list.element(focusedIndexes[0]);
    }
    if (isFiltering) {
      let pendingSeparator;
      let filteredSectionItems = [];
      let hasMatchingActionInSection = false;
      const flushFilteredSection = () => {
        if (pendingSeparator && hasMatchingActionInSection) {
          visible.push(pendingSeparator);
        }
        visible.push(...filteredSectionItems);
        pendingSeparator = void 0;
        filteredSectionItems = [];
        hasMatchingActionInSection = false;
      };
      const matchesFilter = (item) => {
        const label = (item.label ?? "").toLowerCase();
        const descValue = typeof item.description === "string" ? item.description : item.description?.value ?? "";
        return label.includes(filterLower) || descValue.toLowerCase().includes(filterLower);
      };
      for (const item of this._allMenuItems) {
        if (item.kind === "header" /* Header */) {
          continue;
        }
        if (item.kind === "separator" /* Separator */) {
          flushFilteredSection();
          pendingSeparator = item.label ? item : void 0;
          continue;
        }
        if (item.showAlways) {
          filteredSectionItems.push(item);
          continue;
        }
        if (item.isSectionToggle) {
          continue;
        }
        if (matchesFilter(item)) {
          hasMatchingActionInSection = true;
          filteredSectionItems.push(item);
        }
      }
      flushFilteredSection();
    } else {
      for (const item of this._allMenuItems) {
        if (item.kind === "header" /* Header */) {
          visible.push(item);
          continue;
        }
        if (item.kind === "separator" /* Separator */) {
          if (item.section && this._collapsedSections.has(item.section)) {
            continue;
          }
          visible.push(item);
          continue;
        }
        if (item.isSectionToggle && item.section) {
          const collapsed = this._collapsedSections.has(item.section);
          visible.push({
            ...item,
            group: { ...item.group, icon: collapsed ? Codicon.chevronRight : Codicon.chevronDown }
          });
          continue;
        }
        if (item.section && this._collapsedSections.has(item.section)) {
          continue;
        }
        visible.push(item);
      }
    }
    const hasActionBefore = [];
    let seenAction = false;
    for (let i = 0; i < visible.length; i++) {
      hasActionBefore[i] = seenAction;
      if (visible[i].kind === "action" /* Action */) {
        seenAction = true;
      }
    }
    const hasActionBeforeNextSeparator = [];
    let seenActionInSection = false;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].kind === "action" /* Action */) {
        seenActionInSection = true;
        continue;
      }
      if (visible[i].kind !== "separator" /* Separator */) {
        continue;
      }
      hasActionBeforeNextSeparator[i] = seenActionInSection;
      seenActionInSection = false;
    }
    for (let i = visible.length - 1; i >= 0; i--) {
      const item = visible[i];
      if (item.kind !== "separator" /* Separator */) {
        continue;
      }
      const hasFollowingActionInSection = hasActionBeforeNextSeparator[i];
      const isLeadingUnlabeledDivider = !item.label && !hasActionBefore[i];
      if (!hasFollowingActionInSection || isLeadingUnlabeledDivider) {
        visible.splice(i, 1);
      }
    }
    if (this._options?.showGroupTitleOnFirstItem) {
      this._recomputeGroupTitles(visible);
    }
    const filterInputHasFocus = this._filterInput && dom.isActiveElement(this._filterInput);
    this._list.splice(0, this._list.length, visible);
    if (fireLayout) {
      this._onDidRequestLayout.fire();
    }
    if (filterInputHasFocus) {
      this._filterInput?.focus();
      this._focusCheckedOrFirst();
    } else if (this._hasLaidOut) {
      if (focusedItem) {
        const focusedItemId = focusedItem.item?.id;
        if (focusedItemId) {
          for (let i = 0; i < this._list.length; i++) {
            const el = this._list.element(i);
            if (el.item?.id === focusedItemId) {
              this._list.setFocus([i]);
              this._list.reveal(i);
              this._list.domFocus();
              break;
            }
          }
        }
      }
    }
  }
  /**
   * Returns the filter container element, if filter is enabled.
   * The caller is responsible for appending it to the widget DOM.
   */
  get filterContainer() {
    return this._filterContainer;
  }
  get footerContainer() {
    return this._footerContainer;
  }
  get headerContainer() {
    return this._headerContainer;
  }
  get filterInput() {
    return this._filterInput;
  }
  get closeAnimation() {
    return this._options?.closeAnimation;
  }
  focusCondition(element) {
    return !element.disabled && element.kind === "action" /* Action */;
  }
  focus() {
    if (this._filterInput && this._options?.focusFilterOnOpen) {
      this._filterInput.focus();
      this._focusCheckedOrFirst();
      return;
    }
    this._list.domFocus();
    this._focusCheckedOrFirst();
  }
  clearFocus() {
    this._list.setFocus([]);
  }
  getFocusedElement() {
    const focused = this._list.getFocus();
    if (focused.length > 0) {
      return this._list.element(focused[0]);
    }
    return void 0;
  }
  /**
   * Replaces the items in the list in place, preserving the current filter,
   * without closing or repositioning the widget. When {@link focusItemId} is
   * provided, that item ({@link IActionListItem.item}'s `id`) is focused;
   * otherwise the previously focused item is preserved (matched by id).
   */
  updateItems(items, focusItemId) {
    this._allMenuItems = [...items];
    this._applyFilter(false, false);
    if (focusItemId !== void 0) {
      this.focusItemById(focusItemId);
    }
  }
  /**
   * Focuses the item whose {@link IActionListItem.item}'s `id` matches
   * {@link itemId}, without rebuilding the list. Re-applies the focus after the
   * current event so a mouse click's own pointer handling cannot reset it.
   */
  focusItemById(itemId) {
    const focusItem = () => {
      for (let i = 0; i < this._list.length; i++) {
        const el = this._list.element(i);
        if (el.item?.id === itemId) {
          this._list.setFocus([i]);
          this._list.reveal(i);
          this._list.domFocus();
          break;
        }
      }
    };
    focusItem();
    queueMicrotask(() => {
      if (this.domNode.isConnected) {
        focusItem();
      }
    });
  }
  _focusCheckedOrFirst() {
    this._suppressHover = true;
    try {
      for (let i = 0; i < this._list.length; i++) {
        const element = this._list.element(i);
        if (element.kind === "action" /* Action */ && element.item?.checked) {
          this._list.setFocus([i]);
          this._list.reveal(i);
          return;
        }
      }
      this._list.focusFirst(void 0, this.focusCondition);
      const focused = this._list.getFocus();
      if (focused.length > 0) {
        this._list.reveal(focused[0]);
      }
    } finally {
      this._suppressHover = false;
    }
  }
  hide(didCancel) {
    this._delegate.onHide(didCancel);
    this.cts.cancel();
    this._filterCts.value?.cancel();
    this._filterCts.clear();
    this._hideSubmenu();
  }
  clearFilter() {
    if (this._filterInput && this._filterText) {
      this._filterInput.value = "";
      this._filterText = "";
      this._applyOrUpdateFilter();
      return true;
    }
    return false;
  }
  /**
   * Whether this widget uses dynamic height (has filter or collapsible sections).
   */
  get hasDynamicHeight() {
    if (this._options?.showFilter) {
      return true;
    }
    return this._allMenuItems.some((item) => item.isSectionToggle);
  }
  /**
   * The height of a single action row in pixels.
   */
  get lineHeight() {
    return this._actionLineHeight;
  }
  /**
   * Returns the height for an action item, using a taller line height
   * for items with a detail (second line).
   */
  _getItemHeight(item) {
    switch (item.kind) {
      case "header" /* Header */:
        return this._headerLineHeight;
      case "separator" /* Separator */:
        return item.label ? this._actionLineHeight : this._separatorLineHeight;
      default:
        if (item.inlineToggle) {
          return this._options?.inlineToggleItemHeight ?? 70;
        }
        return item.detail ? this._options?.detailItemHeight ?? 48 : this._actionLineHeight;
    }
  }
  /**
   * Computes the total height of all items (including collapsed/filtered items).
   */
  computeFullHeight() {
    let fullHeight = 0;
    for (const item of this._allMenuItems) {
      fullHeight += this._getItemHeight(item);
    }
    return fullHeight;
  }
  /**
   * Computes the total height of visible items in the list.
   */
  computeListHeight() {
    const visibleCount = this._list.length;
    let listHeight = 0;
    for (let i = 0; i < visibleCount; i++) {
      const element = this._list.element(i);
      listHeight += this._getItemHeight(element);
    }
    return listHeight;
  }
  /**
   * Lays out the list widget with the given explicit dimensions.
   */
  layout(height, width) {
    this._hasLaidOut = true;
    this._list.layout(height, width);
    this.domNode.style.height = `${height}px`;
    if (this._filterContainer && this._filterContainer.parentElement) {
      this._filterContainer.parentElement.insertBefore(this._filterContainer, this.domNode);
    }
  }
  computeMaxWidth(minWidth) {
    const visibleCount = this._list.length;
    const effectiveMinWidth = Math.max(minWidth, this._options?.minWidth ?? 0);
    const rawMaxWidthCap = this._options?.maxWidth ?? Number.POSITIVE_INFINITY;
    const maxWidthCap = Math.max(rawMaxWidthCap, effectiveMinWidth);
    const clamp = (w) => Math.min(Math.max(w, effectiveMinWidth), maxWidthCap);
    let maxWidth = effectiveMinWidth;
    const totalItemCount = this._allMenuItems.length;
    if (totalItemCount >= 50) {
      return clamp(380);
    }
    if (totalItemCount > visibleCount) {
      const visibleItems2 = [];
      for (let i = 0; i < visibleCount; i++) {
        visibleItems2.push(this._list.element(i));
      }
      const allItems = [...this._allMenuItems];
      this._list.splice(0, visibleCount, allItems);
      let allItemsHeight = 0;
      for (const item of allItems) {
        allItemsHeight += this._getItemHeight(item);
      }
      this._list.layout(allItemsHeight);
      const itemWidths2 = this._measureItemWidths(allItems);
      maxWidth = clamp(Math.max(...itemWidths2));
      this._list.splice(0, allItems.length, visibleItems2);
      return maxWidth;
    }
    const visibleItems = [];
    for (let i = 0; i < visibleCount; i++) {
      visibleItems.push(this._list.element(i));
    }
    const itemWidths = this._measureItemWidths(visibleItems);
    return clamp(Math.max(...itemWidths));
  }
  focusPrevious() {
    if (this._filterInput && dom.isActiveElement(this._filterInput)) {
      this._list.domFocus();
      const current = this._list.getFocus();
      if (current.length > 0) {
        this._list.focusPrevious(1, false, void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0 && focused2[0] >= current[0]) {
          this._filterInput.focus();
        } else if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      } else {
        this._list.focusLast(void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      }
      return;
    }
    const previousFocus = this._list.getFocus();
    this._list.focusPrevious(1, true, void 0, this.focusCondition);
    const focused = this._list.getFocus();
    if (focused.length > 0) {
      if (this._filterInput && previousFocus.length > 0 && focused[0] > previousFocus[0]) {
        this._list.setFocus([]);
        this._filterInput.focus();
        return;
      }
      this._list.reveal(focused[0]);
    }
  }
  focusNext() {
    if (this._filterInput && dom.isActiveElement(this._filterInput)) {
      this._list.domFocus();
      const current = this._list.getFocus();
      if (current.length > 0) {
        this._list.focusNext(1, false, void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      } else {
        this._list.focusFirst(void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      }
      return;
    }
    const previousFocus = this._list.getFocus();
    this._list.focusNext(1, true, void 0, this.focusCondition);
    const focused = this._list.getFocus();
    if (focused.length > 0) {
      if (this._filterInput && previousFocus.length > 0 && focused[0] < previousFocus[0]) {
        this._list.setFocus([]);
        this._filterInput.focus();
        return;
      }
      this._list.reveal(focused[0]);
    }
  }
  collapseFocusedSection() {
    const section = this._getFocusedSection();
    if (section && !this._collapsedSections.has(section)) {
      this._toggleSection(section);
    }
  }
  expandFocusedSection() {
    const section = this._getFocusedSection();
    if (section && this._collapsedSections.has(section)) {
      this._toggleSection(section);
    }
  }
  toggleFocusedSection() {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return false;
    }
    const element = this._list.element(focused[0]);
    if (element.isSectionToggle && element.section) {
      this._toggleSection(element.section);
      return true;
    }
    return false;
  }
  _getFocusedSection() {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return void 0;
    }
    const element = this._list.element(focused[0]);
    if (element.isSectionToggle && element.section) {
      return element.section;
    }
    return element.section;
  }
  acceptSelected(preview) {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return;
    }
    const focusIndex = focused[0];
    const element = this._list.element(focusIndex);
    if (!this.focusCondition(element)) {
      return;
    }
    const event = preview ? new PreviewSelectedEvent() : new AcceptSelectedEvent();
    this._list.setSelection([focusIndex], event);
  }
  onListSelection(e) {
    if (!e.elements.length) {
      return;
    }
    const element = e.elements[0];
    if (element.isSectionToggle && element.section) {
      this._list.setSelection([]);
      const section = element.section;
      queueMicrotask(() => {
        this._toggleSection(section);
      });
      return;
    }
    if (dom.isMouseEvent(e.browserEvent)) {
      const target = e.browserEvent.target;
      if (dom.isHTMLElement(target) && (target.closest(".action-list-item-toolbar") || target.closest(".action-list-submenu-indicator") || target.closest(".action-list-item-inline-toggle"))) {
        this._list.setSelection([]);
        return;
      }
    }
    if (element.item && this.focusCondition(element)) {
      const isPreviewEvent = e.browserEvent instanceof PreviewSelectedEvent;
      this._delegate.onSelect(element.item, isPreviewEvent && this._supportsPreview);
    } else {
      this._list.setSelection([]);
    }
  }
  onFocus() {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return;
    }
    const focusIndex = focused[0];
    const element = this._list.element(focusIndex);
    this._delegate.onFocus?.(element.item);
    if (!this._suppressHover) {
      this._showHoverForElement(element, focusIndex);
    }
  }
  _removeItem(item) {
    const index = this._allMenuItems.indexOf(item);
    if (index >= 0) {
      this._allMenuItems.splice(index, 1);
      this._applyFilter();
    }
  }
  _recomputeGroupTitles(items) {
    this._groupTitleByIndex.clear();
    const seenTitles = /* @__PURE__ */ new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "action" /* Action */ && item.group?.title && !seenTitles.has(item.group.title)) {
        seenTitles.add(item.group.title);
        this._groupTitleByIndex.set(i, item.group.title);
      }
    }
  }
  _measureItemWidths(items) {
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      const element = this._getRowElement(i);
      if (element) {
        element.style.width = "auto";
        rows.push({ element, item: items[i] });
      }
    }
    try {
      return rows.map(({ element, item }) => element.getBoundingClientRect().width + this._computeToolbarWidth(item));
    } finally {
      for (const { element } of rows) {
        element.style.width = "";
      }
    }
  }
  _computeToolbarWidth(item) {
    let actionCount = item.toolbarActions?.length ?? 0;
    if (item.onRemove) {
      actionCount++;
    }
    if (actionCount === 0) {
      return 0;
    }
    const actionButtonWidth = 22;
    return actionCount * actionButtonWidth + 6;
  }
  _getRowElement(index) {
    return this.domNode.ownerDocument.getElementById(this._list.getElementID(index));
  }
  _showHoverForElement(element, index) {
    if (this._currentSubmenuElement === element) {
      return;
    }
    const hasHoverContent = !!element.hover?.content;
    const hasSubmenuActions = !!element.submenuActions?.length;
    if (hasHoverContent || hasSubmenuActions) {
      const rowElement = this._getRowElement(index);
      if (rowElement) {
        this._showSubmenuForElement(element, rowElement);
      }
      return;
    }
    this._hideSubmenu();
  }
  _showSubmenuForItem(item) {
    const index = this._list.indexOf(item);
    if (index >= 0) {
      const rowElement = this._getRowElement(index);
      if (rowElement) {
        this._showSubmenuForElement(item, rowElement);
      }
    }
  }
  _showSubmenuForElement(element, anchor) {
    if (this._currentSubmenuElement === element) {
      return;
    }
    this._submenuDisposables.clear();
    this._currentSubmenuElement = element;
    this._clearSubmenuContainer();
    let hoverHeader;
    const hoverContent = element.hover?.content;
    if (hoverContent) {
      if (dom.isHTMLElement(hoverContent)) {
        hoverHeader = hoverContent;
        if (element.hover?.disposable) {
          this._register(element.hover.disposable);
        }
      } else {
        const markdown = typeof hoverContent === "string" ? new MarkdownString(hoverContent) : hoverContent;
        const linkHandler = this._options?.linkHandler;
        const rendered = renderMarkdown(markdown, {
          actionHandler: (url) => {
            const uri = URI.parse(url);
            if (linkHandler) {
              linkHandler(uri, element);
            } else {
              this._openerService.open(uri, { allowCommands: true });
            }
          }
        });
        this._submenuDisposables.add(rendered);
        hoverHeader = rendered.element;
      }
      hoverHeader.classList.add("action-list-submenu-hover-header");
      if (element.submenuActions?.length) {
        hoverHeader.classList.add("has-submenu");
      }
      this._submenuContainer.appendChild(hoverHeader);
    }
    const hasSubmenuActions = !!element.submenuActions?.length;
    this._submenuContainer.style.display = "";
    this._submenuContainer.style.position = "absolute";
    this._submenuContainer.removeAttribute("role");
    const anchorRect = anchor.getBoundingClientRect();
    const parentRect = this.domNode.getBoundingClientRect();
    const targetWindow = dom.getWindow(this.domNode);
    let totalHeight = 0;
    let maxWidth = hoverHeader ? hoverHeader.offsetWidth : 0;
    if (hasSubmenuActions) {
      const submenuItems = [];
      const submenuGroups = element.submenuActions.filter((a) => a instanceof SubmenuAction);
      const groupsWithActions = submenuGroups.filter((g) => g.actions.length > 0);
      for (let gi = 0; gi < groupsWithActions.length; gi++) {
        const group = groupsWithActions[gi];
        if (group.label) {
          submenuItems.push({
            kind: "header" /* Header */,
            group: { title: group.label },
            label: group.label
          });
        }
        for (let ci = 0; ci < group.actions.length; ci++) {
          const child = group.actions[ci];
          const extendedChild = child;
          const icon = extendedChild.icon ?? ThemeIcon.fromId(child.checked ? Codicon.check.id : Codicon.blank.id);
          const hoverContent2 = extendedChild.hoverContent;
          submenuItems.push({
            item: child,
            kind: "action" /* Action */,
            label: child.label,
            description: child.tooltip || void 0,
            group: { title: "", icon },
            hideIcon: false,
            hover: hoverContent2 ? { content: hoverContent2 } : {},
            onRemove: extendedChild.onRemove
          });
        }
        if (gi < groupsWithActions.length - 1) {
          submenuItems.push({ kind: "separator" /* Separator */, label: "" });
        }
      }
      for (const action of element.submenuActions) {
        if (!(action instanceof SubmenuAction)) {
          const extendedAction = action;
          submenuItems.push({
            item: action,
            kind: "action" /* Action */,
            label: action.label,
            description: action.tooltip || void 0,
            group: { title: "" },
            hideIcon: false,
            hover: {},
            onRemove: extendedAction.onRemove
          });
        }
      }
      const submenuDelegate = {
        onHide: () => {
        },
        onSelect: (action) => {
          action.run();
          const parentItem = this._currentSubmenuElement?.item;
          this._hideSubmenu();
          if (parentItem) {
            this._delegate.onSelect(parentItem);
          }
          this.hide();
        }
      };
      const submenuWidget = this._submenuDisposables.add(this._instantiationService.createInstance(
        ActionListWidget,
        "submenu",
        false,
        submenuItems,
        submenuDelegate,
        void 0,
        void 0
      ));
      this._submenuContainer.appendChild(submenuWidget.domNode);
      this._currentSubmenuWidget = submenuWidget;
      submenuWidget.clearFocus();
      totalHeight = submenuWidget.computeListHeight();
      submenuWidget.layout(totalHeight);
      const submenuMaxWidth = submenuWidget.computeMaxWidth(0);
      maxWidth = Math.max(maxWidth, submenuMaxWidth);
      submenuWidget.layout(totalHeight, maxWidth);
      submenuWidget.domNode.style.width = `${maxWidth}px`;
      this._submenuDisposables.add(dom.addDisposableListener(submenuWidget.domNode, "keydown", (e) => {
        if (e.key === "ArrowLeft" || e.key === "Escape") {
          dom.EventHelper.stop(e, true);
          this._hideSubmenu();
          this._list.domFocus();
        } else if (e.key === "Enter") {
          dom.EventHelper.stop(e, true);
          const focused = submenuWidget.getFocusedElement();
          if (focused?.item) {
            focused.item.run();
            const parentItem = this._currentSubmenuElement?.item;
            this._hideSubmenu();
            if (parentItem) {
              this._delegate.onSelect(parentItem);
            }
            this.hide();
          }
        } else if (e.key === "ArrowDown") {
          dom.EventHelper.stop(e, true);
          submenuWidget.focusNext();
        } else if (e.key === "ArrowUp") {
          dom.EventHelper.stop(e, true);
          submenuWidget.focusPrevious();
        }
      }));
    }
    const viewportWidth = targetWindow.innerWidth;
    const spaceRight = viewportWidth - anchorRect.right;
    const spaceLeft = parentRect.left;
    const panelWidth = maxWidth + 10;
    const gap = 4;
    if (spaceRight >= panelWidth || spaceRight >= spaceLeft) {
      this._submenuContainer.style.left = `${parentRect.right - parentRect.left + gap}px`;
    } else {
      this._submenuContainer.style.left = `${-panelWidth - gap}px`;
    }
    const hoverHeaderHeight = hoverHeader ? hoverHeader.offsetHeight : 0;
    const totalPanelHeight = totalHeight + hoverHeaderHeight;
    const viewportHeight = targetWindow.innerHeight;
    const anchorHeight = anchorRect.height;
    let top = anchorRect.top - parentRect.top + (anchorHeight - totalPanelHeight) / 2;
    const panelBottom = parentRect.top + top + totalPanelHeight;
    if (panelBottom > viewportHeight) {
      top -= panelBottom - viewportHeight + 8;
    }
    if (parentRect.top + top < 0) {
      top = -parentRect.top;
    }
    this._submenuContainer.style.top = `${top}px`;
  }
  _hideSubmenu() {
    this._cancelSubmenuHide();
    this._cancelSubmenuShow();
    this._submenuDisposables.clear();
    this._currentSubmenuWidget = void 0;
    this._currentSubmenuElement = void 0;
    this._clearSubmenuContainer();
    this._submenuContainer.style.display = "none";
  }
  /**
   * Clears the submenu/hover panel. If focus currently lives inside the panel
   * (e.g. the user clicked a button in the hover content), focus is first moved
   * back to the list. Otherwise clearing the panel would drop focus to <body>,
   * which blurs the action widget and dismisses it.
   */
  _clearSubmenuContainer() {
    if (this._submenuContainer.contains(dom.getActiveElement())) {
      this._list.domFocus();
    }
    dom.clearNode(this._submenuContainer);
  }
  _scheduleSubmenuHide() {
    this._cancelSubmenuHide();
    this._submenuHideTimeout = setTimeout(() => {
      this._hideSubmenu();
    }, 300);
  }
  _cancelSubmenuHide() {
    if (this._submenuHideTimeout !== void 0) {
      clearTimeout(this._submenuHideTimeout);
      this._submenuHideTimeout = void 0;
    }
  }
  _scheduleSubmenuShow(element, index) {
    this._cancelSubmenuShow();
    this._submenuShowTimeout = setTimeout(() => {
      this._submenuShowTimeout = void 0;
      const rowElement = typeof index === "number" ? this._getRowElement(index) : null;
      if (rowElement) {
        this._showSubmenuForElement(element, rowElement);
      }
    }, 500);
  }
  _cancelSubmenuShow() {
    if (this._submenuShowTimeout !== void 0) {
      clearTimeout(this._submenuShowTimeout);
      this._submenuShowTimeout = void 0;
    }
  }
  async onListHover(e) {
    const element = e.element;
    if (element && element.item && this.focusCondition(element)) {
      const isHoveringToolbar = dom.isHTMLElement(e.browserEvent.target) && e.browserEvent.target.closest(".action-list-item-toolbar") !== null;
      if (isHoveringToolbar) {
        if (!element.submenuActions?.length) {
          this._cancelSubmenuShow();
        }
        this._list.setFocus([]);
        return;
      }
      const hasPanel = !!(element.submenuActions?.length || element.hover?.content);
      if (hasPanel) {
        this._suppressHover = true;
      }
      this._list.setFocus(typeof e.index === "number" ? [e.index] : []);
      if (hasPanel) {
        this._suppressHover = false;
      }
      if (hasPanel) {
        if (this._currentSubmenuElement === element) {
          this._cancelSubmenuHide();
          this._cancelSubmenuShow();
        } else {
          this._hideSubmenu();
          this._scheduleSubmenuShow(element, e.index);
        }
        return;
      }
      if (this._currentSubmenuElement === element) {
        this._cancelSubmenuHide();
      } else {
        this._cancelSubmenuShow();
        this._hideSubmenu();
      }
      if (this._delegate.onHover && !element.disabled && element.kind === "action" /* Action */ && this._currentSubmenuElement !== element) {
        const result = await this._delegate.onHover(element.item, this.cts.token);
        const canPreview = result ? result.canPreview : void 0;
        if (canPreview !== element.canPreview) {
          element.canPreview = canPreview;
          if (typeof e.index === "number") {
            this._list.splice(e.index, 1, [element]);
            this._list.setFocus([e.index]);
          }
        }
      }
    } else if (element && element.hover?.content && typeof e.index === "number") {
      if (this._currentSubmenuElement === element) {
        this._cancelSubmenuHide();
        this._cancelSubmenuShow();
      } else {
        this._hideSubmenu();
        this._scheduleSubmenuShow(element, e.index);
      }
    }
  }
  onListClick(e) {
    if (e.element && this.focusCondition(e.element)) {
      this._list.setFocus([]);
    }
  }
};
ActionListWidget = __decorateClass([
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IInstantiationService)
], ActionListWidget);
let ActionList = class extends Disposable {
  constructor(user, preview, items, _delegate, accessibilityProvider, options, anchor, _contextViewService, _layoutService, instantiationService) {
    super();
    this._contextViewService = _contextViewService;
    this._layoutService = _layoutService;
    this._lastMinWidth = 0;
    this._hasLaidOut = false;
    this._anchor = anchor;
    this._preferredAnchorPosition = options?.anchorPosition;
    this._widget = this._register(instantiationService.createInstance(
      ActionListWidget,
      user,
      preview,
      items,
      _delegate,
      accessibilityProvider,
      options
    ));
    this._register(this._widget.onDidRequestLayout(() => {
      if (this._hasLaidOut) {
        this.layout(this._lastMinWidth);
        this._contextViewService.layout();
      }
    }));
  }
  get domNode() {
    return this._widget.domNode;
  }
  get filterContainer() {
    return this._widget.filterContainer;
  }
  get footerContainer() {
    return this._widget.footerContainer;
  }
  get headerContainer() {
    return this._widget.headerContainer;
  }
  get filterInput() {
    return this._widget.filterInput;
  }
  get closeAnimation() {
    return this._widget.closeAnimation;
  }
  /**
   * Returns the resolved anchor position after the first layout.
   * Used by the context view delegate to lock the dropdown direction.
   */
  get anchorPosition() {
    if (this._preferredAnchorPosition !== void 0) {
      return this._preferredAnchorPosition;
    }
    if (this._showAbove === void 0) {
      return void 0;
    }
    return this._showAbove ? AnchorPosition.ABOVE : AnchorPosition.BELOW;
  }
  focus() {
    this._widget.focus();
  }
  hide(didCancel, hideContextView = true) {
    this._widget.hide(didCancel);
    if (hideContextView) {
      this._contextViewService.hideContextView();
    }
  }
  clearFilter() {
    return this._widget.clearFilter();
  }
  focusPrevious() {
    this._widget.focusPrevious();
  }
  focusNext() {
    this._widget.focusNext();
  }
  collapseFocusedSection() {
    this._widget.collapseFocusedSection();
  }
  expandFocusedSection() {
    this._widget.expandFocusedSection();
  }
  toggleFocusedSection() {
    return this._widget.toggleFocusedSection();
  }
  acceptSelected(preview) {
    this._widget.acceptSelected(preview);
  }
  updateItems(items, focusItemId) {
    this._widget.updateItems(items, focusItemId);
  }
  focusItemById(itemId) {
    this._widget.focusItemById(itemId);
  }
  hasDynamicHeight() {
    return this._widget.hasDynamicHeight;
  }
  computeActionWidgetVerticalChromeHeight() {
    const widgetContainer = this.domNode.parentElement?.closest(".action-widget");
    if (!widgetContainer) {
      return 0;
    }
    const style = dom.getWindow(widgetContainer).getComputedStyle(widgetContainer);
    const toPixels = (value) => Number.parseFloat(value) || 0;
    return toPixels(style.paddingTop) + toPixels(style.paddingBottom) + toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
  }
  computeHeight() {
    const listHeight = this._widget.computeListHeight();
    const filterHeight = this._widget.filterContainer ? 36 : 0;
    const footerHeight = this._widget.footerContainer ? 32 : 0;
    const headerHeight = this._widget.headerContainer ? this._widget.headerContainer.offsetHeight || 36 : 0;
    const chromeHeight = filterHeight + footerHeight + headerHeight;
    const targetWindow = dom.getWindow(this.domNode);
    let availableHeight;
    if (this.hasDynamicHeight() || this._preferredAnchorPosition !== void 0) {
      const viewportHeight = targetWindow.innerHeight;
      const anchorRect = getAnchorRect(this._anchor);
      const anchorTopInViewport = anchorRect.top - targetWindow.pageYOffset;
      const bottomGap = 30;
      const spaceBelow = viewportHeight - anchorTopInViewport - anchorRect.height - bottomGap;
      const spaceAbove = anchorTopInViewport;
      if (this._showAbove === void 0) {
        this._showAbove = this._preferredAnchorPosition !== void 0 ? this._preferredAnchorPosition === AnchorPosition.ABOVE : chromeHeight + this._widget.computeFullHeight() > spaceBelow && spaceAbove > spaceBelow;
      }
      availableHeight = Math.max(0, (this._showAbove ? spaceAbove : spaceBelow) - this.computeActionWidgetVerticalChromeHeight());
    } else {
      const padding = 10;
      const windowHeight = this._layoutService.getContainer(targetWindow).clientHeight;
      const widgetTop = this.domNode.getBoundingClientRect().top;
      availableHeight = widgetTop > 0 ? windowHeight - widgetTop - padding : windowHeight * 0.7;
    }
    const viewportMaxHeight = Math.floor(targetWindow.innerHeight * 0.6);
    const actionLineHeight = this._widget.lineHeight;
    if (this._preferredAnchorPosition !== void 0) {
      const maxHeight2 = Math.min(availableHeight, viewportMaxHeight);
      const height2 = Math.min(listHeight + chromeHeight, Math.max(0, maxHeight2));
      return Math.max(0, height2 - chromeHeight);
    }
    const maxHeight = Math.min(Math.max(availableHeight, actionLineHeight * 3 + chromeHeight), viewportMaxHeight);
    const height = Math.min(listHeight + chromeHeight, maxHeight);
    return height - chromeHeight;
  }
  layout(minWidth) {
    this._hasLaidOut = true;
    this._lastMinWidth = minWidth;
    const listHeight = this.computeHeight();
    this._widget.layout(listHeight);
    const computedWidth = this._widget.computeMaxWidth(minWidth);
    this._cachedMaxWidth = computedWidth;
    this._widget.layout(listHeight, this._cachedMaxWidth);
    return this._cachedMaxWidth;
  }
};
ActionList = __decorateClass([
  __decorateParam(7, IContextViewService),
  __decorateParam(8, ILayoutService),
  __decorateParam(9, IInstantiationService)
], ActionList);
function stripNewlines(str) {
  return str.replace(/\r\n|\r|\n/g, " ");
}
export {
  ActionList,
  ActionListItemKind,
  ActionListWidget,
  acceptSelectedActionCommand,
  previewSelectedActionCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbkxpc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgcmVuZGVyTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBnZXRBbmNob3JSZWN0LCBJQW5jaG9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IFRvZ2dsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IElMaXN0RXZlbnQsIElMaXN0TW91c2VFdmVudCwgSUxpc3RSZW5kZXJlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBMaXN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBpc01hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleWJpbmRpbmdzLmpzJztcbmltcG9ydCB7IEFuY2hvclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF5b3V0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAnLi9hY3Rpb25XaWRnZXQuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBMaW5rIH0gZnJvbSAnLi4vLi4vb3BlbmVyL2Jyb3dzZXIvbGluay5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0TGlzdFN0eWxlcyB9IGZyb20gJy4uLy4uL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgYWNjZXB0U2VsZWN0ZWRBY3Rpb25Db21tYW5kID0gJ2FjY2VwdFNlbGVjdGVkQ29kZUFjdGlvbic7XG5leHBvcnQgY29uc3QgcHJldmlld1NlbGVjdGVkQWN0aW9uQ29tbWFuZCA9ICdwcmV2aWV3U2VsZWN0ZWRDb2RlQWN0aW9uJztcblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uTGlzdERlbGVnYXRlPFQ+IHtcblx0b25IaWRlKGRpZENhbmNlbD86IGJvb2xlYW4pOiB2b2lkO1xuXHRvblNlbGVjdChhY3Rpb246IFQsIHByZXZpZXc/OiBib29sZWFuKTogdm9pZDtcblx0b25GaWx0ZXI/KGZpbHRlcjogc3RyaW5nLCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdPjtcblx0b25Ib3Zlcj8oYWN0aW9uOiBULCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHsgY2FuUHJldmlldzogYm9vbGVhbiB9IHwgdm9pZD47XG5cdG9uRm9jdXM/KGFjdGlvbjogVCB8IHVuZGVmaW5lZCk6IHZvaWQ7XG59XG5cbi8qKlxuICogT3B0aW9uYWwgaG92ZXIgY29uZmlndXJhdGlvbiBzaG93biB3aGVuIGZvY3VzaW5nL2hvdmVyaW5nIG92ZXIgYW4gYWN0aW9uIGxpc3QgaXRlbS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uTGlzdEl0ZW1Ib3ZlciB7XG5cdC8qKlxuXHQgKiBDb250ZW50IHRvIGRpc3BsYXkgaW4gdGhlIGhvdmVyLiBDYW4gYmUgYSBtYXJrZG93biBzdHJpbmcgb3IgYW4gSFRNTEVsZW1lbnQgZm9yIGZ1bGwgRE9NIGNvbnRyb2wuXG5cdCAqL1xuXHRyZWFkb25seSBjb250ZW50Pzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQ7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBkaXNwb3NhYmxlIGFzc29jaWF0ZWQgd2l0aCB0aGUgaG92ZXIgY29udGVudCAoZS5nLiBmcm9tIHJlbmRlcmVkIG1hcmtkb3duKS5cblx0ICovXG5cdHJlYWRvbmx5IGRpc3Bvc2FibGU/OiBJRGlzcG9zYWJsZTtcbn1cblxuLyoqXG4gKiBPcHRpb25hbCBpbmxpbmUgdG9nZ2xlIHN3aXRjaCByZW5kZXJlZCBpbnNpZGUgYW4gYWN0aW9uIGxpc3QgaXRlbSwgc2hvd24gb24gaXRzXG4gKiBvd24gcm93IGJlbG93IHRoZSBsYWJlbC9kZXRhaWwuIFVzZWZ1bCBmb3IgYW4gYWx3YXlzLXZpc2libGUgYm9vbGVhbiBzdWItY29udHJvbFxuICogKGUuZy4gYSBzYW5kYm94IHRvZ2dsZSkgdGhhdCBpcyBpbmRlcGVuZGVudCBmcm9tIHNlbGVjdGluZyB0aGUgaXRlbSBpdHNlbGYuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkxpc3RJdGVtSW5saW5lVG9nZ2xlIHtcblx0LyoqIExhYmVsIHNob3duIHRvIHRoZSBsZWZ0IG9mIHRoZSBzd2l0Y2guICovXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdC8qKiBDdXJyZW50IGNoZWNrZWQgc3RhdGUgb2YgdGhlIHN3aXRjaC4gKi9cblx0cmVhZG9ubHkgY2hlY2tlZDogYm9vbGVhbjtcblx0LyoqIEludm9rZWQgd2hlbiB0aGUgdXNlciBmbGlwcyB0aGUgc3dpdGNoLiAqL1xuXHRyZWFkb25seSBvbkNoYW5nZTogKGNoZWNrZWQ6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdC8qKiBPcHRpb25hbCBhY2Nlc3NpYmxlL2hvdmVyIHRpdGxlIGZvciB0aGUgc3dpdGNoLiBEZWZhdWx0cyB0byB7QGxpbmsgbGFiZWx9LiAqL1xuXHRyZWFkb25seSB0aXRsZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uTGlzdEl0ZW08VD4ge1xuXHRyZWFkb25seSBpdGVtPzogVDtcblx0cmVhZG9ubHkga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kO1xuXHRyZWFkb25seSBncm91cD86IHsga2luZD86IHVua25vd247IGljb24/OiBUaGVtZUljb247IHRpdGxlOiBzdHJpbmcgfTtcblx0cmVhZG9ubHkgZGlzYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBsYWJlbD86IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGRldGFpbCB0ZXh0IGRpc3BsYXllZCBhcyBhIHNlY29uZCBsaW5lIGJlbG93IHRoZSBsYWJlbC5cblx0ICovXG5cdHJlYWRvbmx5IGRldGFpbD86IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGlubGluZSB0b2dnbGUgc3dpdGNoIHJlbmRlcmVkIG9uIGl0cyBvd24gcm93IGluc2lkZSB0aGUgaXRlbS5cblx0ICovXG5cdHJlYWRvbmx5IGlubGluZVRvZ2dsZT86IElBY3Rpb25MaXN0SXRlbUlubGluZVRvZ2dsZTtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBhY2Nlc3NpYmxlIGRlc2NyaXB0aW9uIHVzZWQgaW4gcGxhY2Ugb2Yge0BsaW5rIGRlc2NyaXB0aW9ufSBmb3Jcblx0ICogc2NyZWVuIHJlYWRlciBsYWJlbHMuIFVzZWZ1bCB3aGVuIHRoZSB2aXN1YWwgZGVzY3JpcHRpb24gY29udGFpbnMgaWNvbnNcblx0ICogb3Igb3RoZXIgbm9uLXRleHR1YWwgY29udGVudC5cblx0ICovXG5cdHJlYWRvbmx5IGFyaWFEZXNjcmlwdGlvbj86IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGhvdmVyIGNvbmZpZ3VyYXRpb24gc2hvd24gd2hlbiBmb2N1c2luZy9ob3ZlcmluZyBvdmVyIHRoZSBpdGVtLlxuXHQgKi9cblx0cmVhZG9ubHkgaG92ZXI/OiBJQWN0aW9uTGlzdEl0ZW1Ib3Zlcjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGFjdGlvbnMgc2hvd24gaW4gYSBuZXN0ZWQgc3VibWVudSBwYW5lbCwgdHJpZ2dlcmVkIGJ5IGEgY2hldnJvblxuXHQgKiBpbmRpY2F0b3Igb24gdGhlIHJpZ2h0IHNpZGUgb2YgdGhlIGl0ZW0uIFdoZW4gc2V0LCBob3ZlcmluZyBvciBjbGlja2luZ1xuXHQgKiB0aGUgY2hldnJvbiBvcGVucyBhbiBpbmxpbmUgc3VibWVudSB3aXRoIHRoZXNlIGFjdGlvbnMuXG5cdCAqL1xuXHRyZWFkb25seSBzdWJtZW51QWN0aW9ucz86IElBY3Rpb25bXTtcblx0cmVhZG9ubHkga2V5YmluZGluZz86IFJlc29sdmVkS2V5YmluZGluZztcblx0Y2FuUHJldmlldz86IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGhpZGVJY29uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIHRvb2xiYXIgYWN0aW9ucyBzaG93biB3aGVuIHRoZSBpdGVtIGlzIGZvY3VzZWQgb3IgaG92ZXJlZC5cblx0ICovXG5cdHJlYWRvbmx5IHRvb2xiYXJBY3Rpb25zPzogSUFjdGlvbltdO1xuXHQvKipcblx0ICogT3B0aW9uYWwgc2VjdGlvbiBpZGVudGlmaWVyLiBJdGVtcyB3aXRoIHRoZSBzYW1lIHNlY3Rpb24gYmVsb25nIHRvIHRoZSBzYW1lXG5cdCAqIGNvbGxhcHNpYmxlIGdyb3VwLiBPbmx5IG1lYW5pbmdmdWwgd2hlbiB0aGUgQWN0aW9uTGlzdCBpcyBjcmVhdGVkIHdpdGhcblx0ICogY29sbGFwc2libGUgc2VjdGlvbnMuXG5cdCAqL1xuXHRyZWFkb25seSBzZWN0aW9uPzogc3RyaW5nO1xuXHQvKipcblx0ICogV2hlbiB0cnVlLCBjbGlja2luZyB0aGlzIGl0ZW0gdG9nZ2xlcyB0aGUgc2VjdGlvbidzIGNvbGxhcHNlZCBzdGF0ZVxuXHQgKiBpbnN0ZWFkIG9mIHNlbGVjdGluZyBpdC5cblx0ICovXG5cdHJlYWRvbmx5IGlzU2VjdGlvblRvZ2dsZT86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBDU1MgY2xhc3MgbmFtZSB0byBhZGQgdG8gdGhlIHJvdyBjb250YWluZXIuXG5cdCAqL1xuXHRyZWFkb25seSBjbGFzc05hbWU/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBiYWRnZSB0ZXh0IHRvIGRpc3BsYXkgYWZ0ZXIgdGhlIGxhYmVsIChlLmcuLCBcIk5ld1wiKS5cblx0ICovXG5cdHJlYWRvbmx5IGJhZGdlPzogc3RyaW5nO1xuXHQvKipcblx0ICogV2hlbiB0cnVlLCB0aGlzIGl0ZW0gaXMgYWx3YXlzIHNob3duIHdoZW4gZmlsdGVyaW5nIHByb2R1Y2VzIG5vIG90aGVyIHJlc3VsdHMuXG5cdCAqL1xuXHRyZWFkb25seSBzaG93QWx3YXlzPzogYm9vbGVhbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIGludm9rZWQgd2hlbiB0aGUgaXRlbSBpcyByZW1vdmVkIHZpYSB0aGUgYnVpbHQtaW4gcmVtb3ZlIGJ1dHRvbi5cblx0ICogV2hlbiBzZXQsIGEgY2xvc2UgYnV0dG9uIGlzIGF1dG9tYXRpY2FsbHkgYWRkZWQgdG8gdGhlIGl0ZW0gdG9vbGJhci5cblx0ICovXG5cdHJlYWRvbmx5IG9uUmVtb3ZlPzogKCkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD47XG59XG5cbmludGVyZmFjZSBJQWN0aW9uTWVudVRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGljb246IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0ZXh0OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGV0YWlsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgYmFkZ2U6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBncm91cFRpdGxlOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkga2V5YmluZGluZzogS2V5YmluZGluZ0xhYmVsO1xuXHRyZWFkb25seSB0b29sYmFyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgc3VibWVudUluZGljYXRvcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGlubGluZVRvZ2dsZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRwcmV2aW91c0NsYXNzTmFtZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWN0aW9uTGlzdEl0ZW1LaW5kIHtcblx0QWN0aW9uID0gJ2FjdGlvbicsXG5cdEhlYWRlciA9ICdoZWFkZXInLFxuXHRTZXBhcmF0b3IgPSAnc2VwYXJhdG9yJ1xufVxuXG5pbnRlcmZhY2UgSUhlYWRlclRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHRleHQ6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBIZWFkZXJSZW5kZXJlcjxUPiBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUFjdGlvbkxpc3RJdGVtPFQ+LCBJSGVhZGVyVGVtcGxhdGVEYXRhPiB7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXI7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUhlYWRlclRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2dyb3VwLWhlYWRlcicpO1xuXG5cdFx0Y29uc3QgdGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRjb250YWluZXIuYXBwZW5kKHRleHQpO1xuXG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCB0ZXh0IH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElBY3Rpb25MaXN0SXRlbTxUPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUhlYWRlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZXh0LnRleHRDb250ZW50ID0gZWxlbWVudC5ncm91cD8udGl0bGUgPz8gZWxlbWVudC5sYWJlbCA/PyAnJztcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShfdGVtcGxhdGVEYXRhOiBJSGVhZGVyVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmludGVyZmFjZSBJU2VwYXJhdG9yVGVtcGxhdGVEYXRhIHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGV4dDogSFRNTEVsZW1lbnQ7XG59XG5cbmNsYXNzIFNlcGFyYXRvclJlbmRlcmVyPFQ+IGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJQWN0aW9uTGlzdEl0ZW08VD4sIElTZXBhcmF0b3JUZW1wbGF0ZURhdGE+IHtcblxuXHRnZXQgdGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvcjsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU2VwYXJhdG9yVGVtcGxhdGVEYXRhIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnc2VwYXJhdG9yJyk7XG5cblx0XHRjb25zdCB0ZXh0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQodGV4dCk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIHRleHQgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSUFjdGlvbkxpc3RJdGVtPFQ+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJU2VwYXJhdG9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLnRleHQudGV4dENvbnRlbnQgPSBlbGVtZW50LmxhYmVsID8/ICcnO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKF90ZW1wbGF0ZURhdGE6IElTZXBhcmF0b3JUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHQvLyBub29wXG5cdH1cbn1cblxuY2xhc3MgQWN0aW9uSXRlbVJlbmRlcmVyPFQ+IGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxJQWN0aW9uTGlzdEl0ZW08VD4sIElBY3Rpb25NZW51VGVtcGxhdGVEYXRhPiB7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb247IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdXBwb3J0c1ByZXZpZXc6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25SZW1vdmVJdGVtOiAoKGl0ZW06IElBY3Rpb25MaXN0SXRlbTxUPikgPT4gdm9pZCkgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25TaG93U3VibWVudTogKChpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pID0+IHZvaWQpIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hhc0FueVN1Ym1lbnVBY3Rpb25zOiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dyb3VwVGl0bGVCeUluZGV4OiBSZWFkb25seU1hcDxudW1iZXIsIHN0cmluZz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGlua0hhbmRsZXI6ICgodXJpOiBVUkksIGl0ZW06IElBY3Rpb25MaXN0SXRlbTxUPikgPT4gdm9pZCkgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfaGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcDogYm9vbGVhbixcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQWN0aW9uTWVudVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQodGhpcy50ZW1wbGF0ZUlkKTtcblxuXHRcdGNvbnN0IGljb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRpY29uLmNsYXNzTmFtZSA9ICdpY29uJztcblx0XHRjb250YWluZXIuYXBwZW5kKGljb24pO1xuXG5cdFx0Y29uc3QgdGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHR0ZXh0LmNsYXNzTmFtZSA9ICd0aXRsZSc7XG5cdFx0Y29udGFpbmVyLmFwcGVuZCh0ZXh0KTtcblxuXHRcdGNvbnN0IGJhZGdlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGJhZGdlLmNsYXNzTmFtZSA9ICdhY3Rpb24taXRlbS1iYWRnZSc7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChiYWRnZSk7XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRkZXNjcmlwdGlvbi5jbGFzc05hbWUgPSAnZGVzY3JpcHRpb24nO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoZGVzY3JpcHRpb24pO1xuXG5cdFx0Y29uc3QgZ3JvdXBUaXRsZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRncm91cFRpdGxlLmNsYXNzTmFtZSA9ICdncm91cC10aXRsZSc7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChncm91cFRpdGxlKTtcblxuXHRcdGNvbnN0IGRldGFpbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRkZXRhaWwuY2xhc3NOYW1lID0gJ2RldGFpbCc7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChkZXRhaWwpO1xuXG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IG5ldyBLZXliaW5kaW5nTGFiZWwoY29udGFpbmVyLCBPUyk7XG5cblx0XHRjb25zdCB0b29sYmFyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dG9vbGJhci5jbGFzc05hbWUgPSAnYWN0aW9uLWxpc3QtaXRlbS10b29sYmFyJztcblx0XHRjb250YWluZXIuYXBwZW5kKHRvb2xiYXIpO1xuXG5cdFx0Y29uc3Qgc3VibWVudUluZGljYXRvciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHN1Ym1lbnVJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LXN1Ym1lbnUtaW5kaWNhdG9yJztcblx0XHRjb250YWluZXIuYXBwZW5kKHN1Ym1lbnVJbmRpY2F0b3IpO1xuXG5cdFx0Y29uc3QgaW5saW5lVG9nZ2xlQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0aW5saW5lVG9nZ2xlQ29udGFpbmVyLmNsYXNzTmFtZSA9ICdhY3Rpb24tbGlzdC1pdGVtLWlubGluZS10b2dnbGUnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoaW5saW5lVG9nZ2xlQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgaWNvbiwgdGV4dCwgZGV0YWlsLCBiYWRnZSwgZGVzY3JpcHRpb24sIGdyb3VwVGl0bGUsIGtleWJpbmRpbmcsIHRvb2xiYXIsIHN1Ym1lbnVJbmRpY2F0b3IsIGlubGluZVRvZ2dsZUNvbnRhaW5lciwgZWxlbWVudERpc3Bvc2FibGVzIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElBY3Rpb25MaXN0SXRlbTxUPiwgX2luZGV4OiBudW1iZXIsIGRhdGE6IElBY3Rpb25NZW51VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gQ2xlYXIgcHJldmlvdXMgZWxlbWVudCBkaXNwb3NhYmxlc1xuXHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRpZiAoZWxlbWVudC5ncm91cD8uaWNvbikge1xuXHRcdFx0ZGF0YS5pY29uLmNsYXNzTmFtZSA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShlbGVtZW50Lmdyb3VwLmljb24pO1xuXHRcdFx0aWYgKGVsZW1lbnQuZ3JvdXAuaWNvbi5jb2xvcikge1xuXHRcdFx0XHRkYXRhLmljb24uc3R5bGUuY29sb3IgPSBhc0Nzc1ZhcmlhYmxlKGVsZW1lbnQuZ3JvdXAuaWNvbi5jb2xvci5pZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5saWdodEJ1bGIpO1xuXHRcdFx0ZGF0YS5pY29uLnN0eWxlLmNvbG9yID0gJ3ZhcigtLXZzY29kZS1lZGl0b3JMaWdodEJ1bGItZm9yZWdyb3VuZCknO1xuXHRcdH1cblxuXHRcdGlmICghZWxlbWVudC5pdGVtIHx8ICFlbGVtZW50LmxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZG9tLnNldFZpc2liaWxpdHkoIWVsZW1lbnQuaGlkZUljb24sIGRhdGEuaWNvbik7XG5cblx0XHQvLyBTZXQgYXJpYS1leHBhbmRlZCBmb3Igc2VjdGlvbiB0b2dnbGUgaXRlbXNcblx0XHRpZiAoZWxlbWVudC5pc1NlY3Rpb25Ub2dnbGUpIHtcblx0XHRcdGNvbnN0IGV4cGFuZGVkID0gZWxlbWVudC5ncm91cD8uaWNvbiA9PT0gQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHRcdGRhdGEuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyhleHBhbmRlZCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmNvbnRhaW5lci5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKTtcblx0XHR9XG5cblx0XHQvLyBBcHBseSBvcHRpb25hbCBjbGFzc05hbWUgLSBjbGVhbiB1cCBwcmV2aW91cyB0byBhdm9pZCBzdGFsZSBjbGFzc2VzXG5cdFx0Ly8gZnJvbSB2aXJ0dWFsaXplZCByb3cgcmV1c2Vcblx0XHRpZiAoZGF0YS5wcmV2aW91c0NsYXNzTmFtZSkge1xuXHRcdFx0ZGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZShkYXRhLnByZXZpb3VzQ2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0ZGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnYWN0aW9uLWxpc3QtY3VzdG9tJywgISFlbGVtZW50LmNsYXNzTmFtZSk7XG5cdFx0aWYgKGVsZW1lbnQuY2xhc3NOYW1lKSB7XG5cdFx0XHRkYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGVsZW1lbnQuY2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0ZGF0YS5wcmV2aW91c0NsYXNzTmFtZSA9IGVsZW1lbnQuY2xhc3NOYW1lO1xuXG5cdFx0ZGF0YS50ZXh0LnRleHRDb250ZW50ID0gc3RyaXBOZXdsaW5lcyhlbGVtZW50LmxhYmVsKTtcblxuXHRcdC8vIFJlbmRlciBvcHRpb25hbCBiYWRnZVxuXHRcdGlmIChlbGVtZW50LmJhZGdlKSB7XG5cdFx0XHRkYXRhLmJhZGdlLnRleHRDb250ZW50ID0gZWxlbWVudC5iYWRnZTtcblx0XHRcdGRhdGEuYmFkZ2Uuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmJhZGdlLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQua2V5YmluZGluZykge1xuXHRcdFx0ZGF0YS5kZXNjcmlwdGlvbiEudGV4dENvbnRlbnQgPSBlbGVtZW50LmtleWJpbmRpbmcuZ2V0TGFiZWwoKTtcblx0XHRcdGRhdGEuZGVzY3JpcHRpb24hLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdGRhdGEuZGVzY3JpcHRpb24hLnN0eWxlLmxldHRlclNwYWNpbmcgPSAnMC41cHgnO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0ZG9tLmNsZWFyTm9kZShkYXRhLmRlc2NyaXB0aW9uISk7XG5cdFx0XHRpZiAodHlwZW9mIGVsZW1lbnQuZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGRhdGEuZGVzY3JpcHRpb24hLnRleHRDb250ZW50ID0gc3RyaXBOZXdsaW5lcyhlbGVtZW50LmRlc2NyaXB0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkID0gcmVuZGVyTWFya2Rvd24oZWxlbWVudC5kZXNjcmlwdGlvbiwge1xuXHRcdFx0XHRcdGFjdGlvbkhhbmRsZXI6IChjb250ZW50OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShjb250ZW50KTtcblx0XHRcdFx0XHRcdGlmICh0aGlzLl9saW5rSGFuZGxlcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9saW5rSGFuZGxlcih1cmksIGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dm9pZCB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHJlbmRlcmVkKTtcblx0XHRcdFx0ZGF0YS5kZXNjcmlwdGlvbiEuYXBwZW5kQ2hpbGQocmVuZGVyZWQuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRkYXRhLmRlc2NyaXB0aW9uIS5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuZGVzY3JpcHRpb24hLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRkYXRhLmRlc2NyaXB0aW9uIS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBncm91cCB0aXRsZSAoc2hvd24gdG8gdGhlIHJpZ2h0LCBzZXBhcmF0ZSBmcm9tIGRlc2NyaXB0aW9uKVxuXHRcdGNvbnN0IGdyb3VwVGl0bGVUZXh0ID0gdGhpcy5fZ3JvdXBUaXRsZUJ5SW5kZXguZ2V0KF9pbmRleCk7XG5cdFx0aWYgKGdyb3VwVGl0bGVUZXh0KSB7XG5cdFx0XHRkYXRhLmdyb3VwVGl0bGUudGV4dENvbnRlbnQgPSBncm91cFRpdGxlVGV4dDtcblx0XHRcdGRhdGEuZ3JvdXBUaXRsZS5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuZ3JvdXBUaXRsZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0ZGF0YS5ncm91cFRpdGxlLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIG9wdGlvbmFsIGRldGFpbCAoc2hvd24gYXMgc2Vjb25kIGxpbmUgYmVsb3cgdGhlIGxhYmVsKVxuXHRcdGlmIChlbGVtZW50LmRldGFpbCkge1xuXHRcdFx0ZGF0YS5kZXRhaWwudGV4dENvbnRlbnQgPSBzdHJpcE5ld2xpbmVzKGVsZW1lbnQuZGV0YWlsKTtcblx0XHRcdGRhdGEuZGV0YWlsLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5kZXRhaWwudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdGRhdGEuZGV0YWlsLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXG5cdFx0Ly8gUmVuZGVyIG9wdGlvbmFsIGlubGluZSB0b2dnbGUgKHNob3duIGFzIGl0cyBvd24gcm93IGJlbG93IHRoZSBkZXRhaWwpXG5cdFx0ZG9tLmNsZWFyTm9kZShkYXRhLmlubGluZVRvZ2dsZUNvbnRhaW5lcik7XG5cdFx0aWYgKGVsZW1lbnQuaW5saW5lVG9nZ2xlKSB7XG5cdFx0XHRjb25zdCBpbmxpbmVUb2dnbGUgPSBlbGVtZW50LmlubGluZVRvZ2dsZTtcblx0XHRcdGNvbnN0IHRvZ2dsZUxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdFx0dG9nZ2xlTGFiZWwuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LWl0ZW0taW5saW5lLXRvZ2dsZS1sYWJlbCc7XG5cdFx0XHR0b2dnbGVMYWJlbC50ZXh0Q29udGVudCA9IHN0cmlwTmV3bGluZXMoaW5saW5lVG9nZ2xlLmxhYmVsKTtcblx0XHRcdGRhdGEuaW5saW5lVG9nZ2xlQ29udGFpbmVyLmFwcGVuZCh0b2dnbGVMYWJlbCk7XG5cdFx0XHRkYXRhLmlubGluZVRvZ2dsZUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRkYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoYXMtaW5saW5lLXRvZ2dsZScpO1xuXHRcdFx0Y29uc3QgdG9nZ2xlID0gZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBUb2dnbGUoe1xuXHRcdFx0XHR0aXRsZTogaW5saW5lVG9nZ2xlLnRpdGxlID8/IGlubGluZVRvZ2dsZS5sYWJlbCxcblx0XHRcdFx0aXNDaGVja2VkOiBpbmxpbmVUb2dnbGUuY2hlY2tlZCxcblx0XHRcdFx0YWN0aW9uQ2xhc3NOYW1lOiAnYWN0aW9uLWxpc3QtaW5saW5lLXN3aXRjaCcsXG5cdFx0XHRcdG5vdEZvY3VzYWJsZTogZmFsc2UsXG5cdFx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pKTtcblx0XHRcdGRhdGEuaW5saW5lVG9nZ2xlQ29udGFpbmVyLmFwcGVuZCh0b2dnbGUuZG9tTm9kZSk7XG5cdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodG9nZ2xlLm9uQ2hhbmdlKCgpID0+IGlubGluZVRvZ2dsZS5vbkNoYW5nZSh0b2dnbGUuY2hlY2tlZCkpKTtcblx0XHRcdC8vIEtlZXAgY2xpY2tzIG9uIHRoZSB0b2dnbGUgcm93IGZyb20gc2VsZWN0aW5nIHRoZSBpdGVtLlxuXHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZGF0YS5pbmxpbmVUb2dnbGVDb250YWluZXIsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmlubGluZVRvZ2dsZUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0ZGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGFzLWlubGluZS10b2dnbGUnKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25UaXRsZSA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWNjZXB0U2VsZWN0ZWRBY3Rpb25Db21tYW5kKT8uZ2V0TGFiZWwoKTtcblx0XHRjb25zdCBwcmV2aWV3VGl0bGUgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKHByZXZpZXdTZWxlY3RlZEFjdGlvbkNvbW1hbmQpPy5nZXRMYWJlbCgpO1xuXHRcdGRhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ29wdGlvbi1kaXNhYmxlZCcsICEhZWxlbWVudC5kaXNhYmxlZCk7XG5cdFx0aWYgKGVsZW1lbnQuaG92ZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gRG9uJ3Qgc2hvdyB0b29sdGlwIHdoZW4gaG92ZXIgY29udGVudCBpcyBjb25maWd1cmVkIC0gdGhlIHJpY2ggaG92ZXIgd2lsbCBzaG93IGluc3RlYWRcblx0XHRcdGRhdGEuY29udGFpbmVyLnRpdGxlID0gJyc7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50LnRvb2x0aXApIHtcblx0XHRcdGRhdGEuY29udGFpbmVyLnRpdGxlID0gZWxlbWVudC50b29sdGlwO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudC5kaXNhYmxlZCkge1xuXHRcdFx0ZGF0YS5jb250YWluZXIudGl0bGUgPSBlbGVtZW50LmxhYmVsO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcCkge1xuXHRcdFx0ZGF0YS5jb250YWluZXIudGl0bGUgPSAnJztcblx0XHR9IGVsc2UgaWYgKGFjdGlvblRpdGxlICYmIHByZXZpZXdUaXRsZSkge1xuXHRcdFx0aWYgKHRoaXMuX3N1cHBvcnRzUHJldmlldyAmJiBlbGVtZW50LmNhblByZXZpZXcpIHtcblx0XHRcdFx0ZGF0YS5jb250YWluZXIudGl0bGUgPSBsb2NhbGl6ZSh7IGtleTogJ2xhYmVsLXByZXZpZXcnLCBjb21tZW50OiBbJ3BsYWNlaG9sZGVycyBhcmUga2V5YmluZGluZ3MsIGUuZyBcIkYyIHRvIEFwcGx5LCBTaGlmdCtGMiB0byBQcmV2aWV3XCInXSB9LCBcInswfSB0byBBcHBseSwgezF9IHRvIFByZXZpZXdcIiwgYWN0aW9uVGl0bGUsIHByZXZpZXdUaXRsZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkYXRhLmNvbnRhaW5lci50aXRsZSA9IGxvY2FsaXplKHsga2V5OiAnbGFiZWwnLCBjb21tZW50OiBbJ3BsYWNlaG9sZGVyIGlzIGEga2V5YmluZGluZywgZS5nIFwiRjIgdG8gQXBwbHlcIiddIH0sIFwiezB9IHRvIEFwcGx5XCIsIGFjdGlvblRpdGxlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5jb250YWluZXIudGl0bGUgPSAnJztcblx0XHR9XG5cblx0XHQvLyBDbGVhciBhbmQgcmVuZGVyIHRvb2xiYXIgYWN0aW9uc1xuXHRcdGRvbS5jbGVhck5vZGUoZGF0YS50b29sYmFyKTtcblx0XHRjb25zdCB0b29sYmFyQWN0aW9ucyA9IFsuLi4oZWxlbWVudC50b29sYmFyQWN0aW9ucyA/PyBbXSldO1xuXHRcdGlmIChlbGVtZW50Lm9uUmVtb3ZlKSB7XG5cdFx0XHR0b29sYmFyQWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdhY3Rpb25MaXN0LnJlbW92ZScsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYWN0aW9uTGlzdC5yZW1vdmUnLCBcIlJlbW92ZVwiKSxcblx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNsb3NlKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgZWxlbWVudC5vblJlbW92ZSEoKTtcblx0XHRcdFx0XHR0aGlzLl9vblJlbW92ZUl0ZW0/LihlbGVtZW50KTtcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0ZGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLXRvb2xiYXInLCB0b29sYmFyQWN0aW9ucy5sZW5ndGggPiAwKTtcblx0XHRpZiAodG9vbGJhckFjdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihkYXRhLnRvb2xiYXIpO1xuXHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGFjdGlvbkJhcik7XG5cdFx0XHRhY3Rpb25CYXIucHVzaCh0b29sYmFyQWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2hvdyBzdWJtZW51IGluZGljYXRvciBvbmx5IGZvciBpdGVtcyB3aXRoIHN1Ym1lbnUgYWN0aW9uc1xuXHRcdC8vIGJ1dCBub3Qgd2hlbiB0aGUgaXRlbSBhbHNvIGhhcyBob3ZlciBjb250ZW50IChwYW5lbCBhdXRvLXNob3dzIG9uIGhvdmVyKVxuXHRcdGlmIChlbGVtZW50LnN1Ym1lbnVBY3Rpb25zPy5sZW5ndGggJiYgIWVsZW1lbnQuaG92ZXI/LmNvbnRlbnQpIHtcblx0XHRcdGRhdGEuc3VibWVudUluZGljYXRvci5jbGFzc05hbWUgPSAnYWN0aW9uLWxpc3Qtc3VibWVudS1pbmRpY2F0b3IgaGFzLXN1Ym1lbnUgJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmNoZXZyb25SaWdodCk7XG5cdFx0XHRkYXRhLnN1Ym1lbnVJbmRpY2F0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0ZGF0YS5zdWJtZW51SW5kaWNhdG9yLnN0eWxlLnZpc2liaWxpdHkgPSAnJztcblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRhdGEuc3VibWVudUluZGljYXRvciwgZG9tLkV2ZW50VHlwZS5DTElDSywgKGUpID0+IHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fb25TaG93U3VibWVudT8uKGVsZW1lbnQpO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5faGFzQW55U3VibWVudUFjdGlvbnMpIHtcblx0XHRcdC8vIFJlc2VydmUgc3BhY2UgZm9yIGFsaWdubWVudCB3aGVuIG90aGVyIGl0ZW1zIGhhdmUgc3VibWVudXNcblx0XHRcdGRhdGEuc3VibWVudUluZGljYXRvci5jbGFzc05hbWUgPSAnYWN0aW9uLWxpc3Qtc3VibWVudS1pbmRpY2F0b3InO1xuXHRcdFx0ZGF0YS5zdWJtZW51SW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdGRhdGEuc3VibWVudUluZGljYXRvci5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuc3VibWVudUluZGljYXRvci5jbGFzc05hbWUgPSAnYWN0aW9uLWxpc3Qtc3VibWVudS1pbmRpY2F0b3InO1xuXHRcdFx0ZGF0YS5zdWJtZW51SW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUFjdGlvbk1lbnVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEua2V5YmluZGluZy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgQWNjZXB0U2VsZWN0ZWRFdmVudCBleHRlbmRzIFVJRXZlbnQge1xuXHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoJ2FjY2VwdFNlbGVjdGVkQWN0aW9uJyk7IH1cbn1cblxuY2xhc3MgUHJldmlld1NlbGVjdGVkRXZlbnQgZXh0ZW5kcyBVSUV2ZW50IHtcblx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKCdwcmV2aWV3U2VsZWN0ZWRBY3Rpb24nKTsgfVxufVxuXG5mdW5jdGlvbiBnZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbDxUPihpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHQvLyBGaWx0ZXIgb3V0IGhlYWRlciB2cy4gYWN0aW9uIHZzLiBzZXBhcmF0b3Jcblx0aWYgKGl0ZW0ua2luZCA9PT0gJ2FjdGlvbicpIHtcblx0XHRyZXR1cm4gaXRlbS5sYWJlbDtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEEgXCJMZWFybiBtb3JlXCIgc3R5bGUgbGluayByZW5kZXJlZCBpbmxpbmUgaW4gdGhlIGFjdGlvbiBsaXN0IGhlYWRlciBiYW5uZXIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkxpc3RIZWFkZXJMaW5rIHtcblx0LyoqIFZpc2libGUgbGluayB0ZXh0IChlLmcuIFwiTGVhcm4gbW9yZVwiKS4gU2hvdWxkIGJlIGxvY2FsaXplZC4gKi9cblx0cmVhZG9ubHkgbGFiZWw6IHN0cmluZztcblx0LyoqIFRhcmdldCBvcGVuZWQgdmlhIHRoZSBvcGVuZXIgc2VydmljZSB3aGVuIHRoZSBsaW5rIGlzIGFjdGl2YXRlZC4gKi9cblx0cmVhZG9ubHkgdXJpOiBVUkk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkxpc3RDbG9zZUFuaW1hdGlvbiB7XG5cdHJlYWRvbmx5IGNsYXNzTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkdXJhdGlvbjogbnVtYmVyO1xuXHRyZWFkb25seSByZXF1aXJlZEFuY2VzdG9yQ2xhc3Nlcz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIE9wdGlvbnMgZm9yIGNvbmZpZ3VyaW5nIHRoZSBhY3Rpb24gbGlzdC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWN0aW9uTGlzdE9wdGlvbnMge1xuXHQvKipcblx0ICogV2hlbiB0cnVlLCBzaG93cyBhIGZpbHRlciBpbnB1dC5cblx0ICovXG5cdHJlYWRvbmx5IHNob3dGaWx0ZXI/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBQbGFjZWhvbGRlciB0ZXh0IGZvciB0aGUgZmlsdGVyIGlucHV0LlxuXHQgKi9cblx0cmVhZG9ubHkgZmlsdGVyUGxhY2Vob2xkZXI/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGFjdGlvbnMgc2hvd24gaW4gdGhlIGZpbHRlciByb3csIHRvIHRoZSByaWdodCBvZiB0aGUgaW5wdXQuXG5cdCAqL1xuXHRyZWFkb25seSBmaWx0ZXJBY3Rpb25zPzogcmVhZG9ubHkgSUFjdGlvbltdO1xuXG5cdC8qKlxuXHQgKiBTZWN0aW9uIElEcyB0aGF0IHNob3VsZCBiZSBjb2xsYXBzZWQgYnkgZGVmYXVsdC5cblx0ICovXG5cdHJlYWRvbmx5IGNvbGxhcHNlZEJ5RGVmYXVsdD86IFJlYWRvbmx5U2V0PHN0cmluZz47XG5cblx0LyoqXG5cdCAqIE1pbmltdW0gd2lkdGggZm9yIHRoZSBhY3Rpb24gbGlzdC5cblx0ICovXG5cdHJlYWRvbmx5IG1pbldpZHRoPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBNYXhpbXVtIHdpZHRoIGZvciB0aGUgYWN0aW9uIGxpc3QuIFdoZW4gc2V0LCBpdGVtcyB3aWRlciB0aGFuIHRoaXMgYXJlXG5cdCAqIHRydW5jYXRlZCByYXRoZXIgdGhhbiBleHBhbmRpbmcgdGhlIHBvcHVwLlxuXHQgKi9cblx0cmVhZG9ubHkgbWF4V2lkdGg/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGhhbmRsZXIgZm9yIG1hcmtkb3duIGxpbmtzIGFjdGl2YXRlZCBpbiBpdGVtIGRlc2NyaXB0aW9ucyBvciBob3ZlcnMuXG5cdCAqIFdoZW4gdW5zZXQsIGxpbmtzIG9wZW4gdmlhIHRoZSBvcGVuZXIgc2VydmljZSB3aXRoIGNvbW1hbmQgbGlua3MgYWxsb3dlZC5cblx0ICovXG5cdHJlYWRvbmx5IGxpbmtIYW5kbGVyPzogKHVyaTogVVJJLCBpdGVtOiBJQWN0aW9uTGlzdEl0ZW08dW5rbm93bj4pID0+IHZvaWQ7XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIGZpcmVkIHdoZW4gYSBzZWN0aW9uJ3MgY29sbGFwc2VkIHN0YXRlIGNoYW5nZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZVNlY3Rpb24/OiAoc2VjdGlvbjogc3RyaW5nLCBjb2xsYXBzZWQ6IGJvb2xlYW4pID0+IHZvaWQ7XG5cblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgZGVzY3JpcHRpb25zIGFyZSByZW5kZXJlZCBpbmxpbmUgcmlnaHQgYWZ0ZXIgdGhlIGxhYmVsXG5cdCAqIGluc3RlYWQgb2YgYWxpZ25lZCB0byB0aGUgcmlnaHQuXG5cdCAqL1xuXHRyZWFkb25seSBpbmxpbmVEZXNjcmlwdGlvbj86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEhlaWdodCAoaW4gcHgpIHVzZWQgZm9yIGFjdGlvbiBpdGVtcyB0aGF0IGhhdmUgYSBgZGV0YWlsYCBsaW5lLlxuXHQgKiBEZWZhdWx0cyB0byA0OC5cblx0ICovXG5cdHJlYWRvbmx5IGRldGFpbEl0ZW1IZWlnaHQ/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIEhlaWdodCAoaW4gcHgpIHVzZWQgZm9yIGFjdGlvbiBpdGVtcyB0aGF0IGhhdmUgYW4gYGlubGluZVRvZ2dsZWAuXG5cdCAqIERlZmF1bHRzIHRvIDcwLlxuXHQgKi9cblx0cmVhZG9ubHkgaW5saW5lVG9nZ2xlSXRlbUhlaWdodD86IG51bWJlcjtcblxuXHQvKipcblx0ICogV2hlbiB0cnVlLCB0aGUgZ3JvdXAgdGl0bGUgaXMgc2hvd24gb24gdGhlIGZpcnN0IGl0ZW0gb2YgZWFjaCBncm91cFxuXHQgKiBpbiB0aGUgZGVzY3JpcHRpb24gYXJlYSAoYWxpZ25lZCB0byB0aGUgcmlnaHQpLlxuXHQgKi9cblx0cmVhZG9ubHkgc2hvd0dyb3VwVGl0bGVPbkZpcnN0SXRlbT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSBhbmQgZmlsdGVyaW5nIGlzIGVuYWJsZWQsIGZvY3VzZXMgdGhlIGZpbHRlciBpbnB1dCB3aGVuIHRoZSBsaXN0IG9wZW5zLlxuXHQgKi9cblx0cmVhZG9ubHkgZm9jdXNGaWx0ZXJPbk9wZW4/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGVuIGZhbHNlLCBub24tc3VibWVudSBpdGVtcyBkbyBub3QgcmVzZXJ2ZSBzcGFjZSBmb3IgdGhlIHN1Ym1lbnUgY2hldnJvbi5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZSBmb3IgYWxpZ25tZW50IGNvbnNpc3RlbmN5LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzZXJ2ZVN1Ym1lbnVTcGFjZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgaXRlbXMgd2l0aG91dCBhbiBleHBsaWNpdCBgdG9vbHRpcGAgb3IgYGhvdmVyYCBkbyBub3QgZ2V0IGFcblx0ICogZGVmYXVsdCBcIntrZXliaW5kaW5nfSB0byBBcHBseVwiIHRvb2x0aXAuIFVzZWZ1bCBmb3Igbm9uLWNvZGUtYWN0aW9uIGxpc3RzXG5cdCAqIHdoZXJlIHRoaXMgaGludCBpcyBtaXNsZWFkaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgaGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGxhYmVsIHNob3duIG9uIHRoZSByaWdodCBzaWRlIG9mIHRoZSBmaWx0ZXIgcm93LlxuXHQgKi9cblx0cmVhZG9ubHkgc2Vjb25kYXJ5SGVhZGluZz86IHN0cmluZztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgdGV4dCBzaG93biBiZWxvdyB0aGUgYWN0aW9uIGxpc3QgYXMgYSBmb290ZXIuXG5cdCAqL1xuXHRyZWFkb25seSBmb290ZXJUZXh0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCB0ZXh0IHNob3duIGFib3ZlIHRoZSBhY3Rpb24gbGlzdCBhcyBhIGhlYWRlciBiYW5uZXIuIFdoZW4gc2V0LCBpdCBpc1xuXHQgKiByZW5kZXJlZCBhdCB0aGUgdG9wIG9mIHRoZSB3aWRnZXQsIG9wdGlvbmFsbHkgcHJlZml4ZWQgYnkge0BsaW5rIGhlYWRlckljb259LlxuXHQgKi9cblx0cmVhZG9ubHkgaGVhZGVyVGV4dD86IHN0cmluZztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgaWNvbiBzaG93biB0byB0aGUgbGVmdCBvZiB7QGxpbmsgaGVhZGVyVGV4dH0gaW4gdGhlIGhlYWRlciBiYW5uZXIuXG5cdCAqL1xuXHRyZWFkb25seSBoZWFkZXJJY29uPzogVGhlbWVJY29uO1xuXG5cdC8qKiBPcHRpb25hbCBcIkxlYXJuIG1vcmVcIiBsaW5rIHJlbmRlcmVkIGlubGluZSBhZnRlciB7QGxpbmsgaGVhZGVyVGV4dH0sIG9wZW5lZCB2aWEgdGhlIG9wZW5lciBzZXJ2aWNlLiAqL1xuXHRyZWFkb25seSBoZWFkZXJMaW5rPzogSUFjdGlvbkxpc3RIZWFkZXJMaW5rO1xuXG5cdC8qKiBPcHRpb25hbCBkaXNtaXNzIChcInhcIikgYnV0dG9uIG9uIHRoZSBoZWFkZXIgYmFubmVyOyBpbnZva2VkIG9uIGNsaWNrLCBhbmQgdGhlIGJhbm5lciBpcyByZW1vdmVkLiAqL1xuXHRyZWFkb25seSBoZWFkZXJEaXNtaXNzPzogKCkgPT4gdm9pZDtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgQ1NTIGNsYXNzIG5hbWUgYWRkZWQgdG8gdGhlIGFjdGlvbiBsaXN0IGNvbnRhaW5lciwgZm9yIHNjb3BlZCBzdHlsaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgY2xhc3NOYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBDU1MgY2xhc3MgYW5kIGR1cmF0aW9uIHVzZWQgdG8gYW5pbWF0ZSB0aGUgY29udGFpbmluZyBhY3Rpb24gd2lkZ2V0XG5cdCAqIGJlZm9yZSB0aGUgY29udGV4dCB2aWV3IGlzIGhpZGRlbi5cblx0ICovXG5cdHJlYWRvbmx5IGNsb3NlQW5pbWF0aW9uPzogSUFjdGlvbkxpc3RDbG9zZUFuaW1hdGlvbjtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgZml4ZWQgc2lkZSBvZiB0aGUgYW5jaG9yIHdoZXJlIHRoZSBhY3Rpb24gbGlzdCBzaG91bGQgcmVuZGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgYW5jaG9yUG9zaXRpb24/OiBBbmNob3JQb3NpdGlvbjtcbn1cblxuLyoqXG4gKiBBIHN0YW5kYWxvbmUgYWN0aW9uIGxpc3Qgd2lkZ2V0IHRoYXQgaGFuZGxlcyBjb3JlIGxpc3QgcmVuZGVyaW5nLCBmaWx0ZXJpbmcsXG4gKiBob3Zlciwgc3VibWVudSwgYW5kIHNlY3Rpb24gbWFuYWdlbWVudCB3aXRob3V0IGRlcGVuZGluZyBvbiBJQ29udGV4dFZpZXdTZXJ2aWNlXG4gKiBvciBhbmNob3ItYmFzZWQgcG9zaXRpb25pbmcuIFN1aXRhYmxlIGZvciBlbWJlZGRpbmcgZGlyZWN0bHkgaW4gYW55IGNvbnRhaW5lci5cbiAqL1xuZXhwb3J0IGNsYXNzIEFjdGlvbkxpc3RXaWRnZXQ8VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdDogTGlzdDxJQWN0aW9uTGlzdEl0ZW08VD4+O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfYWN0aW9uTGluZUhlaWdodDogbnVtYmVyO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2hlYWRlckxpbmVIZWlnaHQgPSAyNDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zZXBhcmF0b3JMaW5lSGVpZ2h0ID0gODtcblxuXHRwcm90ZWN0ZWQgX2FsbE1lbnVJdGVtczogSUFjdGlvbkxpc3RJdGVtPFQ+W107XG5cblx0cHJpdmF0ZSByZWFkb25seSBjdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3VibWVudURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3VibWVudUNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3N1Ym1lbnVIaWRlVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3N1Ym1lbnVTaG93VGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2N1cnJlbnRTdWJtZW51V2lkZ2V0OiBBY3Rpb25MaXN0V2lkZ2V0PElBY3Rpb24+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50U3VibWVudUVsZW1lbnQ6IElBY3Rpb25MaXN0SXRlbTxUPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb2xsYXBzZWRTZWN0aW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIF9maWx0ZXJUZXh0ID0gJyc7XG5cdHByaXZhdGUgX2ltZVNlc3Npb25JblByb2dyZXNzID0gZmFsc2U7XG5cdHByaXZhdGUgX3N1cHByZXNzSG92ZXIgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGFzTGFpZE91dCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWx0ZXJJbnB1dDogSFRNTElucHV0RWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsdGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZm9vdGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGVhZGVyQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsdGVyQ3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPENhbmNlbGxhdGlvblRva2VuU291cmNlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3JvdXBUaXRsZUJ5SW5kZXggPSBuZXcgTWFwPG51bWJlciwgc3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdC8qKlxuXHQgKiBGaXJlZCB3aGVuIHRoZSB3aWRnZXQncyB2aXNpYmxlIGl0ZW0gc2V0IGNoYW5nZXMgYW5kIHRoZSBwYXJlbnQgc2hvdWxkXG5cdCAqIHJlLWxheW91dCAoZS5nLiBhZnRlciBmaWx0ZXJpbmcgb3IgY29sbGFwc2luZyBhIHNlY3Rpb24pLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0TGF5b3V0ID0gdGhpcy5fb25EaWRSZXF1ZXN0TGF5b3V0LmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3N1cHBvcnRzUHJldmlldzogYm9vbGVhbixcblx0XHRpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9kZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPixcblx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IFBhcnRpYWw8SUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SUFjdGlvbkxpc3RJdGVtPFQ+Pj4gfCB1bmRlZmluZWQsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vcHRpb25zOiBJQWN0aW9uTGlzdE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2FjdGlvbkxpc3QnKTtcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8uaW5saW5lRGVzY3JpcHRpb24pIHtcblx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdpbmxpbmUtZGVzY3JpcHRpb24nKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LmNsYXNzTmFtZSkge1xuXHRcdFx0Y29uc3QgY2xhc3NOYW1lcyA9IHRoaXMuX29wdGlvbnMuY2xhc3NOYW1lLnNwbGl0KC9cXHMrLykuZmlsdGVyKGNsYXNzTmFtZSA9PiBjbGFzc05hbWUubGVuZ3RoID4gMCk7XG5cdFx0XHRpZiAoY2xhc3NOYW1lcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKC4uLmNsYXNzTmFtZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9hY3Rpb25MaW5lSGVpZ2h0ID0gMjQ7XG5cblx0XHQvLyBDcmVhdGUgc3VibWVudSBjb250YWluZXIgYXBwZW5kZWQgdG8gZG9tTm9kZVxuXHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLmNsYXNzTmFtZSA9ICdhY3Rpb24tbGlzdC1zdWJtZW51LXBhbmVsIGFjdGlvbi13aWRnZXQnO1xuXHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHQvLyBNYWtlIGZvY3VzYWJsZSBzbyBjbGlja2luZyB0aGUgaG92ZXIgcGFuZWwga2VlcHMgZm9jdXMgaW5zaWRlIHRoZVxuXHRcdC8vIHRyYWNrZWQgZWxlbWVudCBpbnN0ZWFkIG9mIG1vdmluZyBpdCB0byBkb2N1bWVudC5ib2R5ICh3aGljaCB3b3VsZFxuXHRcdC8vIHRyaWdnZXIgdGhlIGJsdXIgaGFuZGxlciBhbmQgZGlzbWlzcyB0aGUgd2lkZ2V0KS5cblx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLnRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy5kb21Ob2RlLmFwcGVuZCh0aGlzLl9zdWJtZW51Q29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fc3VibWVudUNvbnRhaW5lciwgJ21vdXNlZW50ZXInLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9jYW5jZWxTdWJtZW51SGlkZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX3N1Ym1lbnVDb250YWluZXIsICdtb3VzZWxlYXZlJywgKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVTdWJtZW51SGlkZSgpO1xuXHRcdH0pKTtcblx0XHQvLyBBIHBhbmVsIHNjaGVkdWxlZCB3aGlsZSBjcm9zc2luZyBhIHJvdyBtdXN0IG5vdCBwb3AgdXAgYWZ0ZXIgdGhlIHBvaW50ZXIgaGFzIGxlZnQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVTaG93KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jYW5jZWxTdWJtZW51SGlkZSgpO1xuXHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudVNob3coKTtcblx0XHR9KSk7XG5cblx0XHQvLyBJbml0aWFsaXplIGNvbGxhcHNlZCBzZWN0aW9uc1xuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5jb2xsYXBzZWRCeURlZmF1bHQpIHtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiB0aGlzLl9vcHRpb25zLmNvbGxhcHNlZEJ5RGVmYXVsdCkge1xuXHRcdFx0XHR0aGlzLl9jb2xsYXBzZWRTZWN0aW9ucy5hZGQoc2VjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlydHVhbERlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxJQWN0aW9uTGlzdEl0ZW08VD4+ID0ge1xuXHRcdFx0Z2V0SGVpZ2h0OiBlbGVtZW50ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2dldEl0ZW1IZWlnaHQoZWxlbWVudCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0VGVtcGxhdGVJZDogZWxlbWVudCA9PiBlbGVtZW50LmtpbmRcblx0XHR9O1xuXG5cblx0XHRjb25zdCByZXNlcnZlU3VibWVudVNwYWNlID0gdGhpcy5fb3B0aW9ucz8ucmVzZXJ2ZVN1Ym1lbnVTcGFjZSA/PyB0cnVlO1xuXHRcdGNvbnN0IGhhc0FueVN1Ym1lbnVBY3Rpb25zID0gcmVzZXJ2ZVN1Ym1lbnVTcGFjZSAmJiBpdGVtcy5zb21lKGl0ZW0gPT4gISFpdGVtLnN1Ym1lbnVBY3Rpb25zPy5sZW5ndGggJiYgIWl0ZW0uaG92ZXI/LmNvbnRlbnQpO1xuXG5cdFx0dGhpcy5fbGlzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMaXN0KHVzZXIsIHRoaXMuZG9tTm9kZSwgdmlydHVhbERlbGVnYXRlLCBbXG5cdFx0XHRuZXcgQWN0aW9uSXRlbVJlbmRlcmVyPFQ+KHRoaXMuX3N1cHBvcnRzUHJldmlldywgKGl0ZW0pID0+IHRoaXMuX3JlbW92ZUl0ZW0oaXRlbSksIChpdGVtKSA9PiB0aGlzLl9zaG93U3VibWVudUZvckl0ZW0oaXRlbSksIGhhc0FueVN1Ym1lbnVBY3Rpb25zLCB0aGlzLl9ncm91cFRpdGxlQnlJbmRleCwgdGhpcy5fb3B0aW9ucz8ubGlua0hhbmRsZXIsIHRoaXMuX29wdGlvbnM/LmhpZGVEZWZhdWx0S2V5YmluZGluZ1Rvb2x0aXAgPz8gZmFsc2UsIHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLCB0aGlzLl9vcGVuZXJTZXJ2aWNlKSxcblx0XHRcdG5ldyBIZWFkZXJSZW5kZXJlcigpLFxuXHRcdFx0bmV3IFNlcGFyYXRvclJlbmRlcmVyKCksXG5cdFx0XSwge1xuXHRcdFx0a2V5Ym9hcmRTdXBwb3J0OiBmYWxzZSxcblx0XHRcdHR5cGVOYXZpZ2F0aW9uRW5hYmxlZDogIXRoaXMuX29wdGlvbnM/LnNob3dGaWx0ZXIsXG5cdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7IGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsIH0sXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0QXJpYUxhYmVsOiBlbGVtZW50ID0+IHtcblx0XHRcdFx0XHRpZiAoZWxlbWVudC5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRsZXQgbGFiZWwgPSBlbGVtZW50LmxhYmVsID8gc3RyaXBOZXdsaW5lcyhlbGVtZW50Py5sYWJlbCkgOiAnJztcblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LmRldGFpbCkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxhYmVsICsgJywgJyArIHN0cmlwTmV3bGluZXMoZWxlbWVudC5kZXRhaWwpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQuYXJpYURlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbGFiZWwgKyAnLCAnICsgc3RyaXBOZXdsaW5lcyhlbGVtZW50LmFyaWFEZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuZGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZGVzY1RleHQgPSB0eXBlb2YgZWxlbWVudC5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycgPyBlbGVtZW50LmRlc2NyaXB0aW9uIDogZWxlbWVudC5kZXNjcmlwdGlvbi52YWx1ZTtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsYWJlbCArICcsICcgKyBzdHJpcE5ld2xpbmVzKGRlc2NUZXh0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LmhvdmVyPy5jb250ZW50ICYmICFlbGVtZW50LmFyaWFEZXNjcmlwdGlvbiAmJiAhZWxlbWVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBob3ZlckNvbnRlbnQgPSBlbGVtZW50LmhvdmVyLmNvbnRlbnQ7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGhvdmVyVGV4dCA9IHR5cGVvZiBob3ZlckNvbnRlbnQgPT09ICdzdHJpbmcnID8gaG92ZXJDb250ZW50IDogaXNNYXJrZG93blN0cmluZyhob3ZlckNvbnRlbnQpID8gaG92ZXJDb250ZW50LnZhbHVlIDogZG9tLmlzSFRNTEVsZW1lbnQoaG92ZXJDb250ZW50KSA/IGhvdmVyQ29udGVudC50ZXh0Q29udGVudCA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdGlmIChob3ZlclRleHQgJiYgKCFlbGVtZW50LmRldGFpbCB8fCBzdHJpcE5ld2xpbmVzKGVsZW1lbnQuZGV0YWlsKSAhPT0gc3RyaXBOZXdsaW5lcyhob3ZlclRleHQpKSkge1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsID0gbGFiZWwgKyAnLCAnICsgc3RyaXBOZXdsaW5lcyhob3ZlclRleHQpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5ncm91cD8udGl0bGUpIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsYWJlbCArICcsICcgKyBlbGVtZW50Lmdyb3VwLnRpdGxlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQuaW5saW5lVG9nZ2xlKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbGFiZWwgKyAnLCAnICsgKGVsZW1lbnQuaW5saW5lVG9nZ2xlLmNoZWNrZWRcblx0XHRcdFx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhY3Rpb25MaXN0LmlubGluZVRvZ2dsZS5vbicsIFwiezB9LCBvblwiLCBlbGVtZW50LmlubGluZVRvZ2dsZS5sYWJlbClcblx0XHRcdFx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhY3Rpb25MaXN0LmlubGluZVRvZ2dsZS5vZmYnLCBcInswfSwgb2ZmXCIsIGVsZW1lbnQuaW5saW5lVG9nZ2xlLmxhYmVsKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5kaXNhYmxlZCkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKHsga2V5OiAnY3VzdG9tUXVpY2tGaXhXaWRnZXQubGFiZWxzJywgY29tbWVudDogW2BBY3Rpb24gd2lkZ2V0IGxhYmVscyBmb3IgYWNjZXNzaWJpbGl0eS5gXSB9LCBcInswfSwgRGlzYWJsZWQgUmVhc29uOiB7MX1cIiwgbGFiZWwsIGVsZW1lbnQuZGlzYWJsZWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQuc3VibWVudUFjdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdhY3Rpb25MaXN0LnN1Ym1lbnVIaW50JywgXCJ7MH0sIHVzZSByaWdodCBhcnJvdyB0byBhY2Nlc3Mgb3B0aW9uc1wiLCBsYWJlbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gbGFiZWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKHsga2V5OiAnY3VzdG9tUXVpY2tGaXhXaWRnZXQnLCBjb21tZW50OiBbYEFuIGFjdGlvbiB3aWRnZXQgb3B0aW9uYF0gfSwgXCJBY3Rpb24gV2lkZ2V0XCIpLFxuXHRcdFx0XHRnZXRSb2xlOiAoZSkgPT4ge1xuXHRcdFx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlIEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb246XG5cdFx0XHRcdFx0XHRcdHJldHVybiAnb3B0aW9uJztcblx0XHRcdFx0XHRcdGNhc2UgQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvcjpcblx0XHRcdFx0XHRcdFx0cmV0dXJuICdzZXBhcmF0b3InO1xuXHRcdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdFx0cmV0dXJuICdzZXBhcmF0b3InO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0V2lkZ2V0Um9sZTogKCkgPT4gJ2xpc3Rib3gnLFxuXHRcdFx0XHQuLi5hY2Nlc3NpYmlsaXR5UHJvdmlkZXJcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fbGlzdC5zdHlsZShkZWZhdWx0TGlzdFN0eWxlcyk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uTW91c2VDbGljayhlID0+IHRoaXMub25MaXN0Q2xpY2soZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saXN0Lm9uTW91c2VPdmVyKGUgPT4gdGhpcy5vbkxpc3RIb3ZlcihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VGb2N1cygoKSA9PiB0aGlzLm9uRm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB0aGlzLm9uTGlzdFNlbGVjdGlvbihlKSkpO1xuXG5cdFx0dGhpcy5fYWxsTWVudUl0ZW1zID0gWy4uLml0ZW1zXTtcblxuXHRcdC8vIENyZWF0ZSBmaWx0ZXIgaW5wdXQgYW5kL29yIHNlY29uZGFyeSBoZWFkaW5nXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnNob3dGaWx0ZXIgfHwgdGhpcy5fb3B0aW9ucz8uc2Vjb25kYXJ5SGVhZGluZykge1xuXHRcdFx0dGhpcy5fZmlsdGVyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9maWx0ZXJDb250YWluZXIuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LWZpbHRlcic7XG5cdFx0XHRjb25zdCBmaWx0ZXJSb3cgPSBkb20uYXBwZW5kKHRoaXMuX2ZpbHRlckNvbnRhaW5lciwgZG9tLiQoJy5hY3Rpb24tbGlzdC1maWx0ZXItcm93JykpO1xuXG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucz8uc2hvd0ZpbHRlcikge1xuXHRcdFx0XHR0aGlzLl9maWx0ZXJJbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lucHV0Jyk7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LnR5cGUgPSAndGV4dCc7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LmNsYXNzTmFtZSA9ICdhY3Rpb24tbGlzdC1maWx0ZXItaW5wdXQnO1xuXHRcdFx0XHR0aGlzLl9maWx0ZXJJbnB1dC5wbGFjZWhvbGRlciA9IHRoaXMuX29wdGlvbnM/LmZpbHRlclBsYWNlaG9sZGVyID8/IGxvY2FsaXplKCdhY3Rpb25MaXN0LmZpbHRlci5wbGFjZWhvbGRlcicsIFwiU2VhcmNoLi4uXCIpO1xuXHRcdFx0XHR0aGlzLl9maWx0ZXJJbnB1dC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYWN0aW9uTGlzdC5maWx0ZXIuYXJpYUxhYmVsJywgXCJGaWx0ZXIgaXRlbXNcIikpO1xuXHRcdFx0XHRmaWx0ZXJSb3cuYXBwZW5kQ2hpbGQodGhpcy5fZmlsdGVySW5wdXQpO1xuXG5cdFx0XHRcdGNvbnN0IGZpbHRlckFjdGlvbnMgPSB0aGlzLl9vcHRpb25zPy5maWx0ZXJBY3Rpb25zID8/IFtdO1xuXHRcdFx0XHRpZiAoZmlsdGVyQWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyQWN0aW9uc0NvbnRhaW5lciA9IGRvbS5hcHBlbmQoZmlsdGVyUm93LCBkb20uJCgnLmFjdGlvbi1saXN0LWZpbHRlci1hY3Rpb25zJykpO1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlckFjdGlvbkJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIoZmlsdGVyQWN0aW9uc0NvbnRhaW5lcikpO1xuXHRcdFx0XHRcdGZpbHRlckFjdGlvbkJhci5wdXNoKGZpbHRlckFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2hpbGUgYW4gSU1FIGNvbXBvc2l0aW9uIGlzIHJ1bm5pbmcgdGhlIGlucHV0IGhvbGRzIGludGVybWVkaWF0ZSB0ZXh0IChlLmcuIHBpbnlpbilcblx0XHRcdFx0Ly8gd2hpY2ggbXVzdCBub3QgZHJpdmUgdGhlIGZpbHRlcjogcmUtZmlsdGVyaW5nIHNwbGljZXMgdGhlIGxpc3QsIHJlLWhpZ2hsaWdodHMgYSByb3cgYW5kXG5cdFx0XHRcdC8vIHJlLWxheW91dHMgdGhlIHBvcHVwLCBhbGwgb2Ygd2hpY2ggZGlzcnVwdCB0aGUgY29tcG9zaXRpb24gYW5kIHRoZSBJTUUgY2FuZGlkYXRlIHdpbmRvdy5cblx0XHRcdFx0Ly8gRmlsdGVyIG9uY2UgdGhlIGNvbXBvc2l0aW9uIGNvbW1pdHMgaW5zdGVhZC5cblx0XHRcdFx0Y29uc3Qgb25GaWx0ZXJWYWx1ZUNoYW5nZWQgPSAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9maWx0ZXJJbnB1dCEudmFsdWU7XG5cdFx0XHRcdFx0Ly8gYGNvbXBvc2l0aW9uZW5kYCBhbmQgdGhlIGBpbnB1dGAgZXZlbnQgdGhhdCBmb2xsb3dzIGl0IGJvdGggbGFuZCBoZXJlIChhbmQgYnJvd3NlcnNcblx0XHRcdFx0XHQvLyBkaXNhZ3JlZSBvbiB0aGVpciBvcmRlciksIHNvIG9ubHkgZmlsdGVyIHdoZW4gdGhlIHRleHQgYWN0dWFsbHkgY2hhbmdlZC5cblx0XHRcdFx0XHRpZiAodGhpcy5faW1lU2Vzc2lvbkluUHJvZ3Jlc3MgfHwgdmFsdWUgPT09IHRoaXMuX2ZpbHRlclRleHQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVyVGV4dCA9IHZhbHVlO1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5T3JVcGRhdGVGaWx0ZXIoKTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2ZpbHRlcklucHV0LCAnY29tcG9zaXRpb25zdGFydCcsICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9pbWVTZXNzaW9uSW5Qcm9ncmVzcyA9IHRydWU7XG5cdFx0XHRcdFx0Ly8gQSBkeW5hbWljIGZpbHRlciByZXF1ZXN0IGlzc3VlZCBmb3IgdGhlIHByZXZpb3VzIHZhbHVlIGNhbiBzdGlsbCBiZSBpbiBmbGlnaHQuXG5cdFx0XHRcdFx0Ly8gTGV0dGluZyBpdCByZXNvbHZlIG5vdyB3b3VsZCBzcGxpY2UgYW5kIHJlLWxheW91dCB0aGUgbGlzdCB1bmRlcm5lYXRoIHRoZSBJTUVcblx0XHRcdFx0XHQvLyBjYW5kaWRhdGUgd2luZG93IC0gdGhlIHZlcnkgZGlzcnVwdGlvbiB0aGlzIGd1YXJkIGV4aXN0cyB0byBwcmV2ZW50LiBUaGVcblx0XHRcdFx0XHQvLyBjb21taXR0ZWQgdmFsdWUgc3RhcnRzIGEgZnJlc2ggcmVxdWVzdCBmcm9tIGBjb21wb3NpdGlvbmVuZGAuXG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVyQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2ZpbHRlcklucHV0LCAnY29tcG9zaXRpb25lbmQnLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5faW1lU2Vzc2lvbkluUHJvZ3Jlc3MgPSBmYWxzZTtcblx0XHRcdFx0XHRvbkZpbHRlclZhbHVlQ2hhbmdlZCgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZmlsdGVySW5wdXQsICdpbnB1dCcsIG9uRmlsdGVyVmFsdWVDaGFuZ2VkKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9vcHRpb25zPy5zZWNvbmRhcnlIZWFkaW5nKSB7XG5cdFx0XHRcdGNvbnN0IGZpbHRlckxhYmVsRWwgPSBkb20uYXBwZW5kKGZpbHRlclJvdywgZG9tLiQoJy5hY3Rpb24tbGlzdC1maWx0ZXItbGFiZWwnKSk7XG5cdFx0XHRcdGZpbHRlckxhYmVsRWwudGV4dENvbnRlbnQgPSB0aGlzLl9vcHRpb25zLnNlY29uZGFyeUhlYWRpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGZvb3RlciB0ZXh0XG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LmZvb3RlclRleHQpIHtcblx0XHRcdHRoaXMuX2Zvb3RlckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5fZm9vdGVyQ29udGFpbmVyLmNsYXNzTmFtZSA9ICdhY3Rpb24tbGlzdC1mb290ZXInO1xuXHRcdFx0dGhpcy5fZm9vdGVyQ29udGFpbmVyLnRleHRDb250ZW50ID0gdGhpcy5fb3B0aW9ucy5mb290ZXJUZXh0O1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBoZWFkZXIgYmFubmVyXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LmhlYWRlclRleHQpIHtcblx0XHRcdHRoaXMuX2hlYWRlckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0dGhpcy5faGVhZGVyQ29udGFpbmVyLmNsYXNzTmFtZSA9ICdhY3Rpb24tbGlzdC1oZWFkZXInO1xuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMuaGVhZGVySWNvbikge1xuXHRcdFx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXJDb250YWluZXIsIGRvbS4kKCdzcGFuLmFjdGlvbi1saXN0LWhlYWRlci1pY29uJykpO1xuXHRcdFx0XHRpY29uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkodGhpcy5fb3B0aW9ucy5oZWFkZXJJY29uKSk7XG5cdFx0XHRcdC8vIERlY29yYXRpdmU6IHRoZSBoZWFkZXIgdGV4dCBhbHJlYWR5IGNvbnZleXMgdGhlIG1lYW5pbmcuXG5cdFx0XHRcdGljb24uc2V0QXR0cmlidXRlKCdhcmlhLWhpZGRlbicsICd0cnVlJyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0ZXh0ID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXJDb250YWluZXIsIGRvbS4kKCdzcGFuLmFjdGlvbi1saXN0LWhlYWRlci10ZXh0JykpO1xuXHRcdFx0dGV4dC50ZXh0Q29udGVudCA9IHRoaXMuX29wdGlvbnMuaGVhZGVyVGV4dDtcblxuXHRcdFx0Ly8gVGhlIGJhbm5lciBpcyBjaHJvbWUsIG5vdCBhbiBpdGVtOiBwb2ludGluZyBhdCBpdCBkaXNtaXNzZXMgYSByb3cncyBob3ZlciBwYW5lbC5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5faGVhZGVyQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB0aGlzLl9oaWRlU3VibWVudSgpKSk7XG5cblx0XHRcdGlmICh0aGlzLl9vcHRpb25zLmhlYWRlckxpbmspIHtcblx0XHRcdFx0Y29uc3QgeyBsYWJlbCwgdXJpIH0gPSB0aGlzLl9vcHRpb25zLmhlYWRlckxpbms7XG5cdFx0XHRcdC8vIFRyYWlsaW5nIHNwYWNlIHNvIHRoZSBsaW5rIHJlYWRzIGFzIGEgY29udGludWF0aW9uIG9mIHRoZSBiYW5uZXIgdGV4dC5cblx0XHRcdFx0dGV4dC50ZXh0Q29udGVudCArPSAnICc7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExpbmssIHRleHQsIHsgbGFiZWwsIGhyZWY6IHVyaS50b1N0cmluZyh0cnVlKSB9LCB7fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5oZWFkZXJEaXNtaXNzKSB7XG5cdFx0XHRcdGNvbnN0IG9uRGlzbWlzcyA9IHRoaXMuX29wdGlvbnMuaGVhZGVyRGlzbWlzcztcblx0XHRcdFx0Y29uc3QgZGlzbWlzc0J1dHRvbiA9IGRvbS5hcHBlbmQodGhpcy5faGVhZGVyQ29udGFpbmVyLCBkb20uJCgnc3Bhbi5hY3Rpb24tbGlzdC1oZWFkZXItZGlzbWlzcycpKTtcblx0XHRcdFx0ZGlzbWlzc0J1dHRvbi5hcHBlbmRDaGlsZChkb20uJChUaGVtZUljb24uYXNDU1NTZWxlY3RvcihDb2RpY29uLmNsb3NlKSkpO1xuXHRcdFx0XHRkaXNtaXNzQnV0dG9uLnRhYkluZGV4ID0gMDtcblx0XHRcdFx0ZGlzbWlzc0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0XHRcdGRpc21pc3NCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgbG9jYWxpemUoJ2FjdGlvbkxpc3QuaGVhZGVyLmRpc21pc3MnLCBcIkRpc21pc3NcIikpO1xuXHRcdFx0XHRjb25zdCBkaXNtaXNzID0gKCkgPT4ge1xuXHRcdFx0XHRcdG9uRGlzbWlzcygpO1xuXHRcdFx0XHRcdC8vIFJlZm9jdXMgdGhlIHdpZGdldCBmaXJzdCBzbyByZW1vdmluZyB0aGUgZm9jdXNlZCBidXR0b24gZG9lc24ndCB0cmlwIGNsb3NlLW9uLWJsdXIuXG5cdFx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0XHRcdHRoaXMuX2hlYWRlckNvbnRhaW5lcj8ucmVtb3ZlKCk7XG5cdFx0XHRcdFx0Ly8gRHJvcCB0aGUgcmVmZXJlbmNlIHNvIHRoZSBiYW5uZXIgbm8gbG9uZ2VyIHJlc2VydmVzIGhlYWRlciBoZWlnaHQsIHRoZW5cblx0XHRcdFx0XHQvLyByZXF1ZXN0IGEgcmUtbGF5b3V0IHNvIHRoZSBwb3B1cCBzaHJpbmtzIHRvIGZpdCB0aGUgcmVtYWluaW5nIGNvbnRlbnQuXG5cdFx0XHRcdFx0dGhpcy5faGVhZGVyQ29udGFpbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdExheW91dC5maXJlKCk7XG5cdFx0XHRcdH07XG5cdFx0XHRcdC8vIEdlbmVyaWMgbW91c2UtdXAgbWFwcyB0byBwb2ludGVyIGV2ZW50cyBvbiBpT1MsIHNvIHRhcC9wZW4gYWN0aXZhdGlvblxuXHRcdFx0XHQvLyB3b3JrcyB3aXRob3V0IGV4dHJhIGdlc3R1cmUgcGx1bWJpbmcgKHJhdyAnY2xpY2snIGlzIHVucmVsaWFibGUgdGhlcmUpLlxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZVVwTGlzdGVuZXIoZGlzbWlzc0J1dHRvbiwgKCkgPT4gZGlzbWlzcygpKSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZGlzbWlzc0J1dHRvbiwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRcdFx0ZGlzbWlzcygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2FwcGx5RmlsdGVyKCk7XG5cblx0XHRpZiAodGhpcy5fbGlzdC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX2ZvY3VzQ2hlY2tlZE9yRmlyc3QoKTtcblx0XHR9XG5cblx0XHQvLyBBcnJvd1JpZ2h0IG9wZW5zIHN1Ym1lbnUgZm9yIHRoZSBmb2N1c2VkIGl0ZW0gYW5kIG1vdmVzIGZvY3VzIGludG8gaXRcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnQXJyb3dSaWdodCcgJiYgIWUuaXNDb21wb3NpbmcpIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9saXN0LmVsZW1lbnQoZm9jdXNlZFswXSk7XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQ/LnN1Ym1lbnVBY3Rpb25zPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgcm93RWxlbWVudCA9IHRoaXMuX2dldFJvd0VsZW1lbnQoZm9jdXNlZFswXSk7XG5cdFx0XHRcdFx0XHRpZiAocm93RWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zaG93U3VibWVudUZvckVsZW1lbnQoZWxlbWVudCwgcm93RWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2N1cnJlbnRTdWJtZW51V2lkZ2V0Py5mb2N1cygpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFdoZW4gdGhlIGxpc3QgaGFzIGZvY3VzIGFuZCB1c2VyIHR5cGVzIGEgcHJpbnRhYmxlIGNoYXJhY3Rlcixcblx0XHQvLyBmb3J3YXJkIGl0IHRvIHRoZSBmaWx0ZXIgaW5wdXQgc28gc2VhcmNoIGJlZ2lucyBhdXRvbWF0aWNhbGx5LlxuXHRcdGlmICh0aGlzLl9maWx0ZXJJbnB1dCkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdrZXlkb3duJywgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX2ZpbHRlcklucHV0ICYmICFkb20uaXNBY3RpdmVFbGVtZW50KHRoaXMuX2ZpbHRlcklucHV0KVxuXHRcdFx0XHRcdCYmICFlLmlzQ29tcG9zaW5nICYmIGUua2V5Lmxlbmd0aCA9PT0gMSAmJiBlLmtleSAhPT0gJyAnICYmICFlLmN0cmxLZXkgJiYgIWUubWV0YUtleSAmJiAhZS5hbHRLZXkpIHtcblx0XHRcdFx0XHR0aGlzLl9maWx0ZXJJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LnZhbHVlID0gZS5rZXk7XG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVyVGV4dCA9IGUua2V5O1xuXHRcdFx0XHRcdHRoaXMuX2FwcGx5T3JVcGRhdGVGaWx0ZXIoKTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3RvZ2dsZVNlY3Rpb24oc2VjdGlvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmhhcyhzZWN0aW9uKSkge1xuXHRcdFx0dGhpcy5fY29sbGFwc2VkU2VjdGlvbnMuZGVsZXRlKHNlY3Rpb24pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZWRTZWN0aW9ucy5hZGQoc2VjdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX29wdGlvbnM/Lm9uRGlkVG9nZ2xlU2VjdGlvbj8uKHNlY3Rpb24sIHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmhhcyhzZWN0aW9uKSk7XG5cdFx0dGhpcy5fYXBwbHlGaWx0ZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5T3JVcGRhdGVGaWx0ZXIoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kZWxlZ2F0ZS5vbkZpbHRlcikge1xuXHRcdFx0dGhpcy5fYXBwbHlGaWx0ZXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaWx0ZXJUZXh0ID0gdGhpcy5fZmlsdGVyVGV4dDtcblx0XHR0aGlzLl9maWx0ZXJDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX2ZpbHRlckN0cy52YWx1ZSA9IGN0cztcblx0XHR0aGlzLl9kZWxlZ2F0ZS5vbkZpbHRlcihmaWx0ZXJUZXh0LCBjdHMudG9rZW4pLnRoZW4oaXRlbXMgPT4ge1xuXHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hbGxNZW51SXRlbXMgPSBbLi4uaXRlbXNdO1xuXHRcdFx0dGhpcy5fYXBwbHlGaWx0ZXIodHJ1ZSk7XG5cdFx0fSkuY2F0Y2goKCkgPT4geyAvKiBiZXN0LWVmZm9ydCAqLyB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5RmlsdGVyKHNraXBUZXh0RmlsdGVyID0gZmFsc2UsIGZpcmVMYXlvdXQgPSB0cnVlKTogdm9pZCB7XG5cdFx0Y29uc3QgZmlsdGVyTG93ZXIgPSBza2lwVGV4dEZpbHRlciA/ICcnIDogdGhpcy5fZmlsdGVyVGV4dC50b0xvd2VyQ2FzZSgpO1xuXHRcdGNvbnN0IGlzRmlsdGVyaW5nID0gIXNraXBUZXh0RmlsdGVyICYmIGZpbHRlckxvd2VyLmxlbmd0aCA+IDA7XG5cdFx0Y29uc3QgdmlzaWJsZTogSUFjdGlvbkxpc3RJdGVtPFQ+W10gPSBbXTtcblxuXHRcdC8vIFJlbWVtYmVyIHRoZSBmb2N1c2VkIGl0ZW0gYmVmb3JlIHNwbGljZVxuXHRcdGNvbnN0IGZvY3VzZWRJbmRleGVzID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGxldCBmb2N1c2VkSXRlbTogSUFjdGlvbkxpc3RJdGVtPFQ+IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChmb2N1c2VkSW5kZXhlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRmb2N1c2VkSXRlbSA9IHRoaXMuX2xpc3QuZWxlbWVudChmb2N1c2VkSW5kZXhlc1swXSk7XG5cdFx0fVxuXG5cdFx0aWYgKGlzRmlsdGVyaW5nKSB7XG5cdFx0XHRsZXQgcGVuZGluZ1NlcGFyYXRvcjogSUFjdGlvbkxpc3RJdGVtPFQ+IHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGZpbHRlcmVkU2VjdGlvbkl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08VD5bXSA9IFtdO1xuXHRcdFx0bGV0IGhhc01hdGNoaW5nQWN0aW9uSW5TZWN0aW9uID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IGZsdXNoRmlsdGVyZWRTZWN0aW9uID0gKCkgPT4ge1xuXHRcdFx0XHRpZiAocGVuZGluZ1NlcGFyYXRvciAmJiBoYXNNYXRjaGluZ0FjdGlvbkluU2VjdGlvbikge1xuXHRcdFx0XHRcdHZpc2libGUucHVzaChwZW5kaW5nU2VwYXJhdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR2aXNpYmxlLnB1c2goLi4uZmlsdGVyZWRTZWN0aW9uSXRlbXMpO1xuXHRcdFx0XHRwZW5kaW5nU2VwYXJhdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRmaWx0ZXJlZFNlY3Rpb25JdGVtcyA9IFtdO1xuXHRcdFx0XHRoYXNNYXRjaGluZ0FjdGlvbkluU2VjdGlvbiA9IGZhbHNlO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgbWF0Y2hlc0ZpbHRlciA9IChpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pID0+IHtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSAoaXRlbS5sYWJlbCA/PyAnJykudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgZGVzY1ZhbHVlID0gdHlwZW9mIGl0ZW0uZGVzY3JpcHRpb24gPT09ICdzdHJpbmcnID8gaXRlbS5kZXNjcmlwdGlvbiA6IChpdGVtLmRlc2NyaXB0aW9uPy52YWx1ZSA/PyAnJyk7XG5cdFx0XHRcdHJldHVybiBsYWJlbC5pbmNsdWRlcyhmaWx0ZXJMb3dlcikgfHwgZGVzY1ZhbHVlLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoZmlsdGVyTG93ZXIpO1xuXHRcdFx0fTtcblxuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuX2FsbE1lbnVJdGVtcykge1xuXHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0Zmx1c2hGaWx0ZXJlZFNlY3Rpb24oKTtcblx0XHRcdFx0XHRwZW5kaW5nU2VwYXJhdG9yID0gaXRlbS5sYWJlbCA/IGl0ZW0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXRlbS5zaG93QWx3YXlzKSB7XG5cdFx0XHRcdFx0ZmlsdGVyZWRTZWN0aW9uSXRlbXMucHVzaChpdGVtKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpdGVtLmlzU2VjdGlvblRvZ2dsZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG1hdGNoZXNGaWx0ZXIoaXRlbSkpIHtcblx0XHRcdFx0XHRoYXNNYXRjaGluZ0FjdGlvbkluU2VjdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0ZmlsdGVyZWRTZWN0aW9uSXRlbXMucHVzaChpdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmbHVzaEZpbHRlcmVkU2VjdGlvbigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5fYWxsTWVudUl0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIpIHtcblx0XHRcdFx0XHR2aXNpYmxlLnB1c2goaXRlbSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXRlbS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0aWYgKGl0ZW0uc2VjdGlvbiAmJiB0aGlzLl9jb2xsYXBzZWRTZWN0aW9ucy5oYXMoaXRlbS5zZWN0aW9uKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHZpc2libGUucHVzaChpdGVtKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVwZGF0ZSBpY29uIGZvciBzZWN0aW9uIHRvZ2dsZSBpdGVtcyBiYXNlZCBvbiBjb2xsYXBzZWQgc3RhdGVcblx0XHRcdFx0aWYgKGl0ZW0uaXNTZWN0aW9uVG9nZ2xlICYmIGl0ZW0uc2VjdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGNvbGxhcHNlZCA9IHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmhhcyhpdGVtLnNlY3Rpb24pO1xuXHRcdFx0XHRcdHZpc2libGUucHVzaCh7XG5cdFx0XHRcdFx0XHQuLi5pdGVtLFxuXHRcdFx0XHRcdFx0Z3JvdXA6IHsgLi4uaXRlbS5ncm91cCEsIGljb246IGNvbGxhcHNlZCA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93biB9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIE5vdCBmaWx0ZXJpbmcgLSBjaGVjayBjb2xsYXBzZWQgc2VjdGlvbnNcblx0XHRcdFx0aWYgKGl0ZW0uc2VjdGlvbiAmJiB0aGlzLl9jb2xsYXBzZWRTZWN0aW9ucy5oYXMoaXRlbS5zZWN0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZpc2libGUucHVzaChpdGVtKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgb3JwaGFuZWQgc2VwYXJhdG9ycyB3aGlsZSBrZWVwaW5nIGxhYmVsZWQgc2VwYXJhdG9ycyB0aGF0IGFjdCBhc1xuXHRcdC8vIHNlY3Rpb24gaGVhZGVycyBhYm92ZSB0aGVpciBmb2xsb3dpbmcgYWN0aW9uIGl0ZW1zLlxuXHRcdGNvbnN0IGhhc0FjdGlvbkJlZm9yZTogYm9vbGVhbltdID0gW107XG5cdFx0bGV0IHNlZW5BY3Rpb24gPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpc2libGUubGVuZ3RoOyBpKyspIHtcblx0XHRcdGhhc0FjdGlvbkJlZm9yZVtpXSA9IHNlZW5BY3Rpb247XG5cdFx0XHRpZiAodmlzaWJsZVtpXS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uKSB7XG5cdFx0XHRcdHNlZW5BY3Rpb24gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0FjdGlvbkJlZm9yZU5leHRTZXBhcmF0b3I6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGxldCBzZWVuQWN0aW9uSW5TZWN0aW9uID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IHZpc2libGUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICh2aXNpYmxlW2ldLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24pIHtcblx0XHRcdFx0c2VlbkFjdGlvbkluU2VjdGlvbiA9IHRydWU7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZpc2libGVbaV0ua2luZCAhPT0gQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGhhc0FjdGlvbkJlZm9yZU5leHRTZXBhcmF0b3JbaV0gPSBzZWVuQWN0aW9uSW5TZWN0aW9uO1xuXHRcdFx0c2VlbkFjdGlvbkluU2VjdGlvbiA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSB2aXNpYmxlLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBpdGVtID0gdmlzaWJsZVtpXTtcblx0XHRcdGlmIChpdGVtLmtpbmQgIT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBoYXNGb2xsb3dpbmdBY3Rpb25JblNlY3Rpb24gPSBoYXNBY3Rpb25CZWZvcmVOZXh0U2VwYXJhdG9yW2ldO1xuXHRcdFx0Y29uc3QgaXNMZWFkaW5nVW5sYWJlbGVkRGl2aWRlciA9ICFpdGVtLmxhYmVsICYmICFoYXNBY3Rpb25CZWZvcmVbaV07XG5cdFx0XHRpZiAoIWhhc0ZvbGxvd2luZ0FjdGlvbkluU2VjdGlvbiB8fCBpc0xlYWRpbmdVbmxhYmVsZWREaXZpZGVyKSB7XG5cdFx0XHRcdHZpc2libGUuc3BsaWNlKGksIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlY29tcHV0ZSBncm91cCB0aXRsZSBwb3NpdGlvbnMgYmFzZWQgb24gdmlzaWJsZSBpdGVtc1xuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5zaG93R3JvdXBUaXRsZU9uRmlyc3RJdGVtKSB7XG5cdFx0XHR0aGlzLl9yZWNvbXB1dGVHcm91cFRpdGxlcyh2aXNpYmxlKTtcblx0XHR9XG5cblx0XHQvLyBDYXB0dXJlIHdoZXRoZXIgdGhlIGZpbHRlciBpbnB1dCBjdXJyZW50bHkgaGFzIGZvY3VzIGJlZm9yZSBzcGxpY2Vcblx0XHQvLyB3aGljaCBtYXkgY2F1c2UgRE9NIGNoYW5nZXMgdGhhdCBzaGlmdCBmb2N1cy5cblx0XHRjb25zdCBmaWx0ZXJJbnB1dEhhc0ZvY3VzID0gdGhpcy5fZmlsdGVySW5wdXQgJiYgZG9tLmlzQWN0aXZlRWxlbWVudCh0aGlzLl9maWx0ZXJJbnB1dCk7XG5cblx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB0aGlzLl9saXN0Lmxlbmd0aCwgdmlzaWJsZSk7XG5cblx0XHQvLyBOb3RpZnkgdGhlIHBhcmVudCB0aGF0IGEgcmUtbGF5b3V0IGlzIG5lZWRlZFxuXHRcdGlmIChmaXJlTGF5b3V0KSB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcXVlc3RMYXlvdXQuZmlyZSgpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgYWZ0ZXIgc3BsaWNlIGRlc3Ryb3llZCBET00gZWxlbWVudHMsXG5cdFx0Ly8gb3RoZXJ3aXNlIHRoZSBibHVyIGhhbmRsZXIgaW4gQWN0aW9uV2lkZ2V0U2VydmljZSBjbG9zZXMgdGhlIHdpZGdldC5cblx0XHQvLyBLZWVwIGZvY3VzIG9uIHRoZSBmaWx0ZXIgaW5wdXQgaWYgdGhlIHVzZXIgaXMgdHlwaW5nIGEgZmlsdGVyLlxuXHRcdGlmIChmaWx0ZXJJbnB1dEhhc0ZvY3VzKSB7XG5cdFx0XHR0aGlzLl9maWx0ZXJJbnB1dD8uZm9jdXMoKTtcblx0XHRcdC8vIEtlZXAgYSBoaWdobGlnaHRlZCBpdGVtIGluIHRoZSBsaXN0IHNvIEVudGVyIHdvcmtzIHdpdGhvdXQgcHJlc3NpbmcgRG93bkFycm93IGZpcnN0XG5cdFx0XHR0aGlzLl9mb2N1c0NoZWNrZWRPckZpcnN0KCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9oYXNMYWlkT3V0KSB7XG5cdFx0XHQvLyBSZXN0b3JlIGZvY3VzIHRvIHRoZSBwcmV2aW91c2x5IGZvY3VzZWQgaXRlbVxuXHRcdFx0aWYgKGZvY3VzZWRJdGVtKSB7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRJdGVtSWQgPSAoZm9jdXNlZEl0ZW0uaXRlbSBhcyB7IGlkPzogc3RyaW5nIH0pPy5pZDtcblx0XHRcdFx0aWYgKGZvY3VzZWRJdGVtSWQpIHtcblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2xpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVsID0gdGhpcy5fbGlzdC5lbGVtZW50KGkpO1xuXHRcdFx0XHRcdFx0aWYgKChlbC5pdGVtIGFzIHsgaWQ/OiBzdHJpbmcgfSk/LmlkID09PSBmb2N1c2VkSXRlbUlkKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2ldKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaSk7XG5cdFx0XHRcdFx0XHRcdC8vIE1vdmUgRE9NIGZvY3VzIGJhY2sgdG8gdGhlIGxpc3Q6IHRoZSBzcGxpY2UgYWJvdmUgZGVzdHJveWVkXG5cdFx0XHRcdFx0XHRcdC8vIHRoZSBwcmV2aW91c2x5IGZvY3VzZWQgcm93LCBsZWF2aW5nIERPTSBmb2N1cyBvbiB0aGUgYm9keS5cblx0XHRcdFx0XHRcdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgZmlsdGVyIGNvbnRhaW5lciBlbGVtZW50LCBpZiBmaWx0ZXIgaXMgZW5hYmxlZC5cblx0ICogVGhlIGNhbGxlciBpcyByZXNwb25zaWJsZSBmb3IgYXBwZW5kaW5nIGl0IHRvIHRoZSB3aWRnZXQgRE9NLlxuXHQgKi9cblx0Z2V0IGZpbHRlckNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbHRlckNvbnRhaW5lcjtcblx0fVxuXG5cdGdldCBmb290ZXJDb250YWluZXIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9mb290ZXJDb250YWluZXI7XG5cdH1cblxuXHRnZXQgaGVhZGVyQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5faGVhZGVyQ29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IGZpbHRlcklucHV0KCk6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9maWx0ZXJJbnB1dDtcblx0fVxuXG5cdGdldCBjbG9zZUFuaW1hdGlvbigpOiBJQWN0aW9uTGlzdENsb3NlQW5pbWF0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucz8uY2xvc2VBbmltYXRpb247XG5cdH1cblxuXHRwcml2YXRlIGZvY3VzQ29uZGl0aW9uKGVsZW1lbnQ6IElBY3Rpb25MaXN0SXRlbTx1bmtub3duPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhZWxlbWVudC5kaXNhYmxlZCAmJiBlbGVtZW50LmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb247XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZmlsdGVySW5wdXQgJiYgdGhpcy5fb3B0aW9ucz8uZm9jdXNGaWx0ZXJPbk9wZW4pIHtcblx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LmZvY3VzKCk7XG5cdFx0XHQvLyBIaWdobGlnaHQgdGhlIGZpcnN0IGl0ZW0gc28gRW50ZXIgd29ya3MgaW1tZWRpYXRlbHlcblx0XHRcdHRoaXMuX2ZvY3VzQ2hlY2tlZE9yRmlyc3QoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdHRoaXMuX2ZvY3VzQ2hlY2tlZE9yRmlyc3QoKTtcblx0fVxuXG5cdGNsZWFyRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbXSk7XG5cdH1cblxuXHRnZXRGb2N1c2VkRWxlbWVudCgpOiBJQWN0aW9uTGlzdEl0ZW08VD4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xpc3QuZWxlbWVudChmb2N1c2VkWzBdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXBsYWNlcyB0aGUgaXRlbXMgaW4gdGhlIGxpc3QgaW4gcGxhY2UsIHByZXNlcnZpbmcgdGhlIGN1cnJlbnQgZmlsdGVyLFxuXHQgKiB3aXRob3V0IGNsb3Npbmcgb3IgcmVwb3NpdGlvbmluZyB0aGUgd2lkZ2V0LiBXaGVuIHtAbGluayBmb2N1c0l0ZW1JZH0gaXNcblx0ICogcHJvdmlkZWQsIHRoYXQgaXRlbSAoe0BsaW5rIElBY3Rpb25MaXN0SXRlbS5pdGVtfSdzIGBpZGApIGlzIGZvY3VzZWQ7XG5cdCAqIG90aGVyd2lzZSB0aGUgcHJldmlvdXNseSBmb2N1c2VkIGl0ZW0gaXMgcHJlc2VydmVkIChtYXRjaGVkIGJ5IGlkKS5cblx0ICovXG5cdHVwZGF0ZUl0ZW1zKGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSwgZm9jdXNJdGVtSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9hbGxNZW51SXRlbXMgPSBbLi4uaXRlbXNdO1xuXHRcdC8vIERvbid0IGZpcmUgYSBsYXlvdXQgcmVxdWVzdDogdGhlIGl0ZW0gc2V0IGtlZXBzIHRoZSBzYW1lIHNoYXBlLCBzbyB0aGVcblx0XHQvLyB3aWRnZXQgc2l6ZSBpcyB1bmNoYW5nZWQgYW5kIHJlcG9zaXRpb25pbmcgY291bGQgbWlzLWFuY2hvciBpZiB0aGVcblx0XHQvLyBhbmNob3IgZWxlbWVudCB3YXMgcmUtcmVuZGVyZWQgYnkgdGhlIGFjdGlvbiB0aGF0IHRyaWdnZXJlZCB0aGlzIHVwZGF0ZS5cblx0XHR0aGlzLl9hcHBseUZpbHRlcihmYWxzZSwgZmFsc2UpO1xuXHRcdGlmIChmb2N1c0l0ZW1JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmZvY3VzSXRlbUJ5SWQoZm9jdXNJdGVtSWQpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGb2N1c2VzIHRoZSBpdGVtIHdob3NlIHtAbGluayBJQWN0aW9uTGlzdEl0ZW0uaXRlbX0ncyBgaWRgIG1hdGNoZXNcblx0ICoge0BsaW5rIGl0ZW1JZH0sIHdpdGhvdXQgcmVidWlsZGluZyB0aGUgbGlzdC4gUmUtYXBwbGllcyB0aGUgZm9jdXMgYWZ0ZXIgdGhlXG5cdCAqIGN1cnJlbnQgZXZlbnQgc28gYSBtb3VzZSBjbGljaydzIG93biBwb2ludGVyIGhhbmRsaW5nIGNhbm5vdCByZXNldCBpdC5cblx0ICovXG5cdGZvY3VzSXRlbUJ5SWQoaXRlbUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c0l0ZW0gPSAoKSA9PiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2xpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZWwgPSB0aGlzLl9saXN0LmVsZW1lbnQoaSk7XG5cdFx0XHRcdGlmICgoZWwuaXRlbSBhcyB7IGlkPzogc3RyaW5nIH0pPy5pZCA9PT0gaXRlbUlkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbaV0pO1xuXHRcdFx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGkpO1xuXHRcdFx0XHRcdHRoaXMuX2xpc3QuZG9tRm9jdXMoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0Zm9jdXNJdGVtKCk7XG5cdFx0Ly8gUmUtYXBwbHkgYWZ0ZXIgdGhlIGN1cnJlbnQgZXZlbnQgZmluaXNoZXM6IHdoZW4gdHJpZ2dlcmVkIGJ5IGEgbW91c2Vcblx0XHQvLyBjbGljaywgdGhlIGxpc3QncyBvd24gcG9pbnRlciBoYW5kbGluZyBjYW4gcmVzZXQgZm9jdXMgYWZ0ZXIgb3VyXG5cdFx0Ly8gY2FsbGJhY2sgcmV0dXJucywgd2hpY2ggd291bGQgb3RoZXJ3aXNlIGRyb3AgdGhlIGZvY3VzIGhpZ2hsaWdodC5cblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5kb21Ob2RlLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRcdGZvY3VzSXRlbSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZm9jdXNDaGVja2VkT3JGaXJzdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdXBwcmVzc0hvdmVyID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gVHJ5IHRvIGZvY3VzIHRoZSBjaGVja2VkIGl0ZW0gZmlyc3Rcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fbGlzdC5lbGVtZW50KGkpO1xuXHRcdFx0XHRpZiAoZWxlbWVudC5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uICYmIChlbGVtZW50Lml0ZW0gYXMgeyBjaGVja2VkPzogYm9vbGVhbiB9KT8uY2hlY2tlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2ldKTtcblx0XHRcdFx0XHR0aGlzLl9saXN0LnJldmVhbChpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFNldCBmb2N1cyBvbiB0aGUgZmlyc3QgZm9jdXNhYmxlIGl0ZW0gd2l0aG91dCBtb3ZpbmcgRE9NIGZvY3VzXG5cdFx0XHR0aGlzLl9saXN0LmZvY3VzRmlyc3QodW5kZWZpbmVkLCB0aGlzLmZvY3VzQ29uZGl0aW9uKTtcblx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGZvY3VzZWRbMF0pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9zdXBwcmVzc0hvdmVyID0gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0aGlkZShkaWRDYW5jZWw/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVsZWdhdGUub25IaWRlKGRpZENhbmNlbCk7XG5cdFx0dGhpcy5jdHMuY2FuY2VsKCk7XG5cdFx0dGhpcy5fZmlsdGVyQ3RzLnZhbHVlPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9maWx0ZXJDdHMuY2xlYXIoKTtcblx0XHR0aGlzLl9oaWRlU3VibWVudSgpO1xuXHR9XG5cblx0Y2xlYXJGaWx0ZXIoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2ZpbHRlcklucHV0ICYmIHRoaXMuX2ZpbHRlclRleHQpIHtcblx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LnZhbHVlID0gJyc7XG5cdFx0XHR0aGlzLl9maWx0ZXJUZXh0ID0gJyc7XG5cdFx0XHR0aGlzLl9hcHBseU9yVXBkYXRlRmlsdGVyKCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhpcyB3aWRnZXQgdXNlcyBkeW5hbWljIGhlaWdodCAoaGFzIGZpbHRlciBvciBjb2xsYXBzaWJsZSBzZWN0aW9ucykuXG5cdCAqL1xuXHRnZXQgaGFzRHluYW1pY0hlaWdodCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8uc2hvd0ZpbHRlcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9hbGxNZW51SXRlbXMuc29tZShpdGVtID0+IGl0ZW0uaXNTZWN0aW9uVG9nZ2xlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgaGVpZ2h0IG9mIGEgc2luZ2xlIGFjdGlvbiByb3cgaW4gcGl4ZWxzLlxuXHQgKi9cblx0Z2V0IGxpbmVIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aW9uTGluZUhlaWdodDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBoZWlnaHQgZm9yIGFuIGFjdGlvbiBpdGVtLCB1c2luZyBhIHRhbGxlciBsaW5lIGhlaWdodFxuXHQgKiBmb3IgaXRlbXMgd2l0aCBhIGRldGFpbCAoc2Vjb25kIGxpbmUpLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9nZXRJdGVtSGVpZ2h0KGl0ZW06IElBY3Rpb25MaXN0SXRlbTxUPik6IG51bWJlciB7XG5cdFx0c3dpdGNoIChpdGVtLmtpbmQpIHtcblx0XHRcdGNhc2UgQWN0aW9uTGlzdEl0ZW1LaW5kLkhlYWRlcjpcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2hlYWRlckxpbmVIZWlnaHQ7XG5cdFx0XHRjYXNlIEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3I6XG5cdFx0XHRcdHJldHVybiBpdGVtLmxhYmVsID8gdGhpcy5fYWN0aW9uTGluZUhlaWdodCA6IHRoaXMuX3NlcGFyYXRvckxpbmVIZWlnaHQ7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRpZiAoaXRlbS5pbmxpbmVUb2dnbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucz8uaW5saW5lVG9nZ2xlSXRlbUhlaWdodCA/PyA3MDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gaXRlbS5kZXRhaWwgPyAodGhpcy5fb3B0aW9ucz8uZGV0YWlsSXRlbUhlaWdodCA/PyA0OCkgOiB0aGlzLl9hY3Rpb25MaW5lSGVpZ2h0O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgdG90YWwgaGVpZ2h0IG9mIGFsbCBpdGVtcyAoaW5jbHVkaW5nIGNvbGxhcHNlZC9maWx0ZXJlZCBpdGVtcykuXG5cdCAqL1xuXHRjb21wdXRlRnVsbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGxldCBmdWxsSGVpZ2h0ID0gMDtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5fYWxsTWVudUl0ZW1zKSB7XG5cdFx0XHRmdWxsSGVpZ2h0ICs9IHRoaXMuX2dldEl0ZW1IZWlnaHQoaXRlbSk7XG5cdFx0fVxuXHRcdHJldHVybiBmdWxsSGVpZ2h0O1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGVzIHRoZSB0b3RhbCBoZWlnaHQgb2YgdmlzaWJsZSBpdGVtcyBpbiB0aGUgbGlzdC5cblx0ICovXG5cdGNvbXB1dGVMaXN0SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgdmlzaWJsZUNvdW50ID0gdGhpcy5fbGlzdC5sZW5ndGg7XG5cdFx0bGV0IGxpc3RIZWlnaHQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmlzaWJsZUNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9saXN0LmVsZW1lbnQoaSk7XG5cdFx0XHRsaXN0SGVpZ2h0ICs9IHRoaXMuX2dldEl0ZW1IZWlnaHQoZWxlbWVudCk7XG5cdFx0fVxuXHRcdHJldHVybiBsaXN0SGVpZ2h0O1xuXHR9XG5cblx0LyoqXG5cdCAqIExheXMgb3V0IHRoZSBsaXN0IHdpZGdldCB3aXRoIHRoZSBnaXZlbiBleHBsaWNpdCBkaW1lbnNpb25zLlxuXHQgKi9cblx0bGF5b3V0KGhlaWdodDogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2hhc0xhaWRPdXQgPSB0cnVlO1xuXHRcdHRoaXMuX2xpc3QubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXG5cdFx0Ly8gUGxhY2UgZmlsdGVyIGNvbnRhaW5lciBvbiB0aGUgcHJlZmVycmVkIHNpZGUuXG5cdFx0aWYgKHRoaXMuX2ZpbHRlckNvbnRhaW5lciAmJiB0aGlzLl9maWx0ZXJDb250YWluZXIucGFyZW50RWxlbWVudCkge1xuXHRcdFx0dGhpcy5fZmlsdGVyQ29udGFpbmVyLnBhcmVudEVsZW1lbnQuaW5zZXJ0QmVmb3JlKHRoaXMuX2ZpbHRlckNvbnRhaW5lciwgdGhpcy5kb21Ob2RlKTtcblx0XHR9XG5cdH1cblxuXHRjb21wdXRlTWF4V2lkdGgobWluV2lkdGg6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgdmlzaWJsZUNvdW50ID0gdGhpcy5fbGlzdC5sZW5ndGg7XG5cdFx0Y29uc3QgZWZmZWN0aXZlTWluV2lkdGggPSBNYXRoLm1heChtaW5XaWR0aCwgdGhpcy5fb3B0aW9ucz8ubWluV2lkdGggPz8gMCk7XG5cdFx0Y29uc3QgcmF3TWF4V2lkdGhDYXAgPSB0aGlzLl9vcHRpb25zPy5tYXhXaWR0aCA/PyBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdFx0Y29uc3QgbWF4V2lkdGhDYXAgPSBNYXRoLm1heChyYXdNYXhXaWR0aENhcCwgZWZmZWN0aXZlTWluV2lkdGgpO1xuXHRcdGNvbnN0IGNsYW1wID0gKHc6IG51bWJlcikgPT4gTWF0aC5taW4oTWF0aC5tYXgodywgZWZmZWN0aXZlTWluV2lkdGgpLCBtYXhXaWR0aENhcCk7XG5cdFx0bGV0IG1heFdpZHRoID0gZWZmZWN0aXZlTWluV2lkdGg7XG5cblx0XHRjb25zdCB0b3RhbEl0ZW1Db3VudCA9IHRoaXMuX2FsbE1lbnVJdGVtcy5sZW5ndGg7XG5cdFx0aWYgKHRvdGFsSXRlbUNvdW50ID49IDUwKSB7XG5cdFx0XHRyZXR1cm4gY2xhbXAoMzgwKTtcblx0XHR9XG5cblx0XHRpZiAodG90YWxJdGVtQ291bnQgPiB2aXNpYmxlQ291bnQpIHtcblx0XHRcdC8vIFRlbXBvcmFyaWx5IHNwbGljZSBpbiBhbGwgaXRlbXMgdG8gbWVhc3VyZSB3aWR0aHMsXG5cdFx0XHQvLyBwcmV2ZW50aW5nIHdpZHRoIGp1bXBzIHdoZW4gZXhwYW5kaW5nL2NvbGxhcHNpbmcgc2VjdGlvbnMuXG5cdFx0XHRjb25zdCB2aXNpYmxlSXRlbXM6IElBY3Rpb25MaXN0SXRlbTxUPltdID0gW107XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpc2libGVDb3VudDsgaSsrKSB7XG5cdFx0XHRcdHZpc2libGVJdGVtcy5wdXNoKHRoaXMuX2xpc3QuZWxlbWVudChpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFsbEl0ZW1zID0gWy4uLnRoaXMuX2FsbE1lbnVJdGVtc107XG5cdFx0XHR0aGlzLl9saXN0LnNwbGljZSgwLCB2aXNpYmxlQ291bnQsIGFsbEl0ZW1zKTtcblx0XHRcdGxldCBhbGxJdGVtc0hlaWdodCA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYWxsSXRlbXMpIHtcblx0XHRcdFx0YWxsSXRlbXNIZWlnaHQgKz0gdGhpcy5fZ2V0SXRlbUhlaWdodChpdGVtKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xpc3QubGF5b3V0KGFsbEl0ZW1zSGVpZ2h0KTtcblxuXHRcdFx0Y29uc3QgaXRlbVdpZHRocyA9IHRoaXMuX21lYXN1cmVJdGVtV2lkdGhzKGFsbEl0ZW1zKTtcblxuXHRcdFx0bWF4V2lkdGggPSBjbGFtcChNYXRoLm1heCguLi5pdGVtV2lkdGhzKSk7XG5cblx0XHRcdC8vIFJlc3RvcmUgdmlzaWJsZSBpdGVtc1xuXHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgYWxsSXRlbXMubGVuZ3RoLCB2aXNpYmxlSXRlbXMpO1xuXHRcdFx0cmV0dXJuIG1heFdpZHRoO1xuXHRcdH1cblxuXHRcdC8vIEFsbCBpdGVtcyBhcmUgdmlzaWJsZSwgbWVhc3VyZSB0aGVtIGRpcmVjdGx5XG5cdFx0Y29uc3QgdmlzaWJsZUl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08VD5bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmlzaWJsZUNvdW50OyBpKyspIHtcblx0XHRcdHZpc2libGVJdGVtcy5wdXNoKHRoaXMuX2xpc3QuZWxlbWVudChpKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZW1XaWR0aHMgPSB0aGlzLl9tZWFzdXJlSXRlbVdpZHRocyh2aXNpYmxlSXRlbXMpO1xuXHRcdHJldHVybiBjbGFtcChNYXRoLm1heCguLi5pdGVtV2lkdGhzKSk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzKCkge1xuXHRcdGlmICh0aGlzLl9maWx0ZXJJbnB1dCAmJiBkb20uaXNBY3RpdmVFbGVtZW50KHRoaXMuX2ZpbHRlcklucHV0KSkge1xuXHRcdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdFx0Ly8gQW4gaXRlbSBpcyBhbHJlYWR5IGhpZ2hsaWdodGVkOyBhZHZhbmNlIGZyb20gaXQgaW5zdGVhZCBvZiBqdW1waW5nIHRvIGxhc3Rcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoY3VycmVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNQcmV2aW91cygxLCBmYWxzZSwgdW5kZWZpbmVkLCB0aGlzLmZvY3VzQ29uZGl0aW9uKTtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0Ly8gSWYgd2UgY291bGRuJ3QgbW92ZSAoYWxyZWFkeSBhdCBmaXJzdCksIGdvIHRvIGZpbHRlclxuXHRcdFx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwICYmIGZvY3VzZWRbMF0gPj0gY3VycmVudFswXSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LmZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNlZFswXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNMYXN0KHVuZGVmaW5lZCwgdGhpcy5mb2N1c0NvbmRpdGlvbik7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0XHRcdGlmIChmb2N1c2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c2VkWzBdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwcmV2aW91c0ZvY3VzID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdHRoaXMuX2xpc3QuZm9jdXNQcmV2aW91cygxLCB0cnVlLCB1bmRlZmluZWQsIHRoaXMuZm9jdXNDb25kaXRpb24pO1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gSWYgZm9jdXMgd3JhcHBlZCAod2FzIGF0IGZpcnN0IGZvY3VzYWJsZSwgbm93IGF0IGxhc3QpLCBtb3ZlIHRvIGZpbHRlciBpbnN0ZWFkXG5cdFx0XHRpZiAodGhpcy5fZmlsdGVySW5wdXQgJiYgcHJldmlvdXNGb2N1cy5sZW5ndGggPiAwICYmIGZvY3VzZWRbMF0gPiBwcmV2aW91c0ZvY3VzWzBdKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW10pO1xuXHRcdFx0XHR0aGlzLl9maWx0ZXJJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c2VkWzBdKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c05leHQoKSB7XG5cdFx0aWYgKHRoaXMuX2ZpbHRlcklucHV0ICYmIGRvbS5pc0FjdGl2ZUVsZW1lbnQodGhpcy5fZmlsdGVySW5wdXQpKSB7XG5cdFx0XHR0aGlzLl9saXN0LmRvbUZvY3VzKCk7XG5cdFx0XHQvLyBBbiBpdGVtIGlzIGFscmVhZHkgaGlnaGxpZ2h0ZWQ7IGFkdmFuY2UgZnJvbSBpdCBpbnN0ZWFkIG9mIGp1bXBpbmcgdG8gZmlyc3Rcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoY3VycmVudC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNOZXh0KDEsIGZhbHNlLCB1bmRlZmluZWQsIHRoaXMuZm9jdXNDb25kaXRpb24pO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNlZFswXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xpc3QuZm9jdXNGaXJzdCh1bmRlZmluZWQsIHRoaXMuZm9jdXNDb25kaXRpb24pO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNlZFswXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJldmlvdXNGb2N1cyA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHR0aGlzLl9saXN0LmZvY3VzTmV4dCgxLCB0cnVlLCB1bmRlZmluZWQsIHRoaXMuZm9jdXNDb25kaXRpb24pO1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0Ly8gSWYgZm9jdXMgd3JhcHBlZCAod2FzIGF0IGxhc3QgZm9jdXNhYmxlLCBub3cgYXQgZmlyc3QpLCBtb3ZlIHRvIGZpbHRlciBpbnN0ZWFkXG5cdFx0XHRpZiAodGhpcy5fZmlsdGVySW5wdXQgJiYgcHJldmlvdXNGb2N1cy5sZW5ndGggPiAwICYmIGZvY3VzZWRbMF0gPCBwcmV2aW91c0ZvY3VzWzBdKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW10pO1xuXHRcdFx0XHR0aGlzLl9maWx0ZXJJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c2VkWzBdKTtcblx0XHR9XG5cdH1cblxuXHRjb2xsYXBzZUZvY3VzZWRTZWN0aW9uKCkge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSB0aGlzLl9nZXRGb2N1c2VkU2VjdGlvbigpO1xuXHRcdGlmIChzZWN0aW9uICYmICF0aGlzLl9jb2xsYXBzZWRTZWN0aW9ucy5oYXMoc2VjdGlvbikpIHtcblx0XHRcdHRoaXMuX3RvZ2dsZVNlY3Rpb24oc2VjdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0ZXhwYW5kRm9jdXNlZFNlY3Rpb24oKSB7XG5cdFx0Y29uc3Qgc2VjdGlvbiA9IHRoaXMuX2dldEZvY3VzZWRTZWN0aW9uKCk7XG5cdFx0aWYgKHNlY3Rpb24gJiYgdGhpcy5fY29sbGFwc2VkU2VjdGlvbnMuaGFzKHNlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLl90b2dnbGVTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHRvZ2dsZUZvY3VzZWRTZWN0aW9uKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9saXN0LmVsZW1lbnQoZm9jdXNlZFswXSk7XG5cdFx0aWYgKGVsZW1lbnQuaXNTZWN0aW9uVG9nZ2xlICYmIGVsZW1lbnQuc2VjdGlvbikge1xuXHRcdFx0dGhpcy5fdG9nZ2xlU2VjdGlvbihlbGVtZW50LnNlY3Rpb24pO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEZvY3VzZWRTZWN0aW9uKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9saXN0LmVsZW1lbnQoZm9jdXNlZFswXSk7XG5cdFx0aWYgKGVsZW1lbnQuaXNTZWN0aW9uVG9nZ2xlICYmIGVsZW1lbnQuc2VjdGlvbikge1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQuc2VjdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnQuc2VjdGlvbjtcblx0fVxuXG5cdGFjY2VwdFNlbGVjdGVkKHByZXZpZXc/OiBib29sZWFuKSB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1c0luZGV4ID0gZm9jdXNlZFswXTtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fbGlzdC5lbGVtZW50KGZvY3VzSW5kZXgpO1xuXHRcdGlmICghdGhpcy5mb2N1c0NvbmRpdGlvbihlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV2ZW50ID0gcHJldmlldyA/IG5ldyBQcmV2aWV3U2VsZWN0ZWRFdmVudCgpIDogbmV3IEFjY2VwdFNlbGVjdGVkRXZlbnQoKTtcblx0XHR0aGlzLl9saXN0LnNldFNlbGVjdGlvbihbZm9jdXNJbmRleF0sIGV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgb25MaXN0U2VsZWN0aW9uKGU6IElMaXN0RXZlbnQ8SUFjdGlvbkxpc3RJdGVtPFQ+Pik6IHZvaWQge1xuXHRcdGlmICghZS5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50c1swXTtcblx0XHRpZiAoZWxlbWVudC5pc1NlY3Rpb25Ub2dnbGUgJiYgZWxlbWVudC5zZWN0aW9uKSB7XG5cdFx0XHR0aGlzLl9saXN0LnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHRjb25zdCBzZWN0aW9uID0gZWxlbWVudC5zZWN0aW9uO1xuXHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl90b2dnbGVTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIERvbid0IHNlbGVjdCB3aGVuIGNsaWNraW5nIHRoZSB0b29sYmFyLCBzdWJtZW51IGluZGljYXRvciwgb3IgaW5saW5lIHRvZ2dsZVxuXHRcdGlmIChkb20uaXNNb3VzZUV2ZW50KGUuYnJvd3NlckV2ZW50KSkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0O1xuXHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KHRhcmdldCkgJiYgKHRhcmdldC5jbG9zZXN0KCcuYWN0aW9uLWxpc3QtaXRlbS10b29sYmFyJykgfHwgdGFyZ2V0LmNsb3Nlc3QoJy5hY3Rpb24tbGlzdC1zdWJtZW51LWluZGljYXRvcicpIHx8IHRhcmdldC5jbG9zZXN0KCcuYWN0aW9uLWxpc3QtaXRlbS1pbmxpbmUtdG9nZ2xlJykpKSB7XG5cdFx0XHRcdHRoaXMuX2xpc3Quc2V0U2VsZWN0aW9uKFtdKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZWxlbWVudC5pdGVtICYmIHRoaXMuZm9jdXNDb25kaXRpb24oZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGlzUHJldmlld0V2ZW50ID0gZS5icm93c2VyRXZlbnQgaW5zdGFuY2VvZiBQcmV2aWV3U2VsZWN0ZWRFdmVudDtcblx0XHRcdHRoaXMuX2RlbGVnYXRlLm9uU2VsZWN0KGVsZW1lbnQuaXRlbSwgaXNQcmV2aWV3RXZlbnQgJiYgdGhpcy5fc3VwcG9ydHNQcmV2aWV3KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Gb2N1cygpIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1c2VkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1c0luZGV4ID0gZm9jdXNlZFswXTtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fbGlzdC5lbGVtZW50KGZvY3VzSW5kZXgpO1xuXHRcdHRoaXMuX2RlbGVnYXRlLm9uRm9jdXM/LihlbGVtZW50Lml0ZW0pO1xuXG5cdFx0Ly8gU2hvdyBob3ZlciBvbiBmb2N1cyBjaGFuZ2UgKHN1cHByZXNzIGR1cmluZyBwcm9ncmFtbWF0aWMgaW5pdGlhbCBmb2N1cylcblx0XHRpZiAoIXRoaXMuX3N1cHByZXNzSG92ZXIpIHtcblx0XHRcdHRoaXMuX3Nob3dIb3ZlckZvckVsZW1lbnQoZWxlbWVudCwgZm9jdXNJbmRleCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlSXRlbShpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2FsbE1lbnVJdGVtcy5pbmRleE9mKGl0ZW0pO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLl9hbGxNZW51SXRlbXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdHRoaXMuX2FwcGx5RmlsdGVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb21wdXRlR3JvdXBUaXRsZXMoaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdKTogdm9pZCB7XG5cdFx0dGhpcy5fZ3JvdXBUaXRsZUJ5SW5kZXguY2xlYXIoKTtcblx0XHRjb25zdCBzZWVuVGl0bGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpdGVtcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGl0ZW1zW2ldO1xuXHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiAmJiBpdGVtLmdyb3VwPy50aXRsZSAmJiAhc2VlblRpdGxlcy5oYXMoaXRlbS5ncm91cC50aXRsZSkpIHtcblx0XHRcdFx0c2VlblRpdGxlcy5hZGQoaXRlbS5ncm91cC50aXRsZSk7XG5cdFx0XHRcdHRoaXMuX2dyb3VwVGl0bGVCeUluZGV4LnNldChpLCBpdGVtLmdyb3VwLnRpdGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tZWFzdXJlSXRlbVdpZHRocyhpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPFQ+W10pOiBudW1iZXJbXSB7XG5cdFx0Y29uc3Qgcm93czogeyBlbGVtZW50OiBIVE1MRWxlbWVudDsgaXRlbTogSUFjdGlvbkxpc3RJdGVtPFQ+IH1bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9nZXRSb3dFbGVtZW50KGkpO1xuXHRcdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS53aWR0aCA9ICdhdXRvJztcblx0XHRcdFx0cm93cy5wdXNoKHsgZWxlbWVudCwgaXRlbTogaXRlbXNbaV0gfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiByb3dzLm1hcCgoeyBlbGVtZW50LCBpdGVtIH0pID0+IGVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkud2lkdGggKyB0aGlzLl9jb21wdXRlVG9vbGJhcldpZHRoKGl0ZW0pKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Zm9yIChjb25zdCB7IGVsZW1lbnQgfSBvZiByb3dzKSB7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUud2lkdGggPSAnJztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlVG9vbGJhcldpZHRoKGl0ZW06IElBY3Rpb25MaXN0SXRlbTxUPik6IG51bWJlciB7XG5cdFx0bGV0IGFjdGlvbkNvdW50ID0gaXRlbS50b29sYmFyQWN0aW9ucz8ubGVuZ3RoID8/IDA7XG5cdFx0aWYgKGl0ZW0ub25SZW1vdmUpIHtcblx0XHRcdGFjdGlvbkNvdW50Kys7XG5cdFx0fVxuXHRcdGlmIChhY3Rpb25Db3VudCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdC8vIEVhY2ggdG9vbGJhciBhY3Rpb24gYnV0dG9uIGlzIH4yMnB4ICgxNnB4IGljb24gKyBwYWRkaW5nKSBwbHVzIDZweCByb3cgZ2FwXG5cdFx0Y29uc3QgYWN0aW9uQnV0dG9uV2lkdGggPSAyMjtcblx0XHRyZXR1cm4gYWN0aW9uQ291bnQgKiBhY3Rpb25CdXR0b25XaWR0aCArIDY7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSb3dFbGVtZW50KGluZGV4OiBudW1iZXIpOiBIVE1MRWxlbWVudCB8IG51bGwge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUub3duZXJEb2N1bWVudC5nZXRFbGVtZW50QnlJZCh0aGlzLl9saXN0LmdldEVsZW1lbnRJRChpbmRleCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0hvdmVyRm9yRWxlbWVudChlbGVtZW50OiBJQWN0aW9uTGlzdEl0ZW08VD4sIGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFN1Ym1lbnVFbGVtZW50ID09PSBlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzSG92ZXJDb250ZW50ID0gISFlbGVtZW50LmhvdmVyPy5jb250ZW50O1xuXHRcdGNvbnN0IGhhc1N1Ym1lbnVBY3Rpb25zID0gISFlbGVtZW50LnN1Ym1lbnVBY3Rpb25zPy5sZW5ndGg7XG5cblx0XHRpZiAoaGFzSG92ZXJDb250ZW50IHx8IGhhc1N1Ym1lbnVBY3Rpb25zKSB7XG5cdFx0XHRjb25zdCByb3dFbGVtZW50ID0gdGhpcy5fZ2V0Um93RWxlbWVudChpbmRleCk7XG5cdFx0XHRpZiAocm93RWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9zaG93U3VibWVudUZvckVsZW1lbnQoZWxlbWVudCwgcm93RWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTmF2aWdhdGVkIHRvIGFuIGl0ZW0gd2l0aCBubyBob3Zlci9zdWJtZW51IFx1MjAxNCBmdWxseSB0ZWFyIGRvd24gYW55XG5cdFx0Ly8gcHJldmlvdXMgc3VibWVudSBzbyBhIGJsYW5rIHBhbmVsIGRvZXNuJ3QgbGluZ2VyLlxuXHRcdHRoaXMuX2hpZGVTdWJtZW51KCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93U3VibWVudUZvckl0ZW0oaXRlbTogSUFjdGlvbkxpc3RJdGVtPFQ+KTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9saXN0LmluZGV4T2YoaXRlbSk7XG5cdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdGNvbnN0IHJvd0VsZW1lbnQgPSB0aGlzLl9nZXRSb3dFbGVtZW50KGluZGV4KTtcblx0XHRcdGlmIChyb3dFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dTdWJtZW51Rm9yRWxlbWVudChpdGVtLCByb3dFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93U3VibWVudUZvckVsZW1lbnQoZWxlbWVudDogSUFjdGlvbkxpc3RJdGVtPFQ+LCBhbmNob3I6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRTdWJtZW51RWxlbWVudCA9PT0gZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N1Ym1lbnVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRTdWJtZW51RWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0dGhpcy5fY2xlYXJTdWJtZW51Q29udGFpbmVyKCk7XG5cblx0XHQvLyBXaGVuIHRoZSBpdGVtIGhhcyBob3ZlciBjb250ZW50LCByZW5kZXIgaXQgYXMgYSBoZWFkZXJcblx0XHRsZXQgaG92ZXJIZWFkZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhvdmVyQ29udGVudCA9IGVsZW1lbnQuaG92ZXI/LmNvbnRlbnQ7XG5cdFx0aWYgKGhvdmVyQ29udGVudCkge1xuXHRcdFx0aWYgKGRvbS5pc0hUTUxFbGVtZW50KGhvdmVyQ29udGVudCkpIHtcblx0XHRcdFx0aG92ZXJIZWFkZXIgPSBob3ZlckNvbnRlbnQ7XG5cdFx0XHRcdC8vIFRoZSBob3ZlciBlbGVtZW50IGlzIG93bmVkIGJ5IHRoZSBjYWxsZXIgYW5kIHJldXNlZCBhY3Jvc3Mgc2hvd3MsXG5cdFx0XHRcdC8vIHNvIGl0cyBkaXNwb3NhYmxlIG11c3QgTk9UIGJlIHRpZWQgdG8gdGhlIHBlci1uYXZpZ2F0aW9uIHN1Ym1lbnVcblx0XHRcdFx0Ly8gc3RvcmUgKHdoaWNoIGlzIGNsZWFyZWQgZXZlcnkgdGltZSB0aGUgc3VibWVudSBzd2l0Y2hlcykuIFRlYXJpbmdcblx0XHRcdFx0Ly8gaXQgZG93biB0aGVyZSB3b3VsZCBkZXN0cm95IHJldXNlZCBjb250ZW50IFx1MjAxNCBlLmcuIEJ1dHRvbiB3aWRnZXRzXG5cdFx0XHRcdC8vIHJlbW92ZSB0aGVpciBET00gb24gZGlzcG9zZSwgbGVhdmluZyBhbiBlbXB0eSBob3Zlci4gVHJhY2sgaXQgZm9yXG5cdFx0XHRcdC8vIHRoZSB3aWRnZXQncyBsaWZldGltZSBpbnN0ZWFkLlxuXHRcdFx0XHRpZiAoZWxlbWVudC5ob3Zlcj8uZGlzcG9zYWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGVsZW1lbnQuaG92ZXIuZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1hcmtkb3duID0gdHlwZW9mIGhvdmVyQ29udGVudCA9PT0gJ3N0cmluZycgPyBuZXcgTWFya2Rvd25TdHJpbmcoaG92ZXJDb250ZW50KSA6IGhvdmVyQ29udGVudDtcblx0XHRcdFx0Y29uc3QgbGlua0hhbmRsZXIgPSB0aGlzLl9vcHRpb25zPy5saW5rSGFuZGxlcjtcblx0XHRcdFx0Y29uc3QgcmVuZGVyZWQgPSByZW5kZXJNYXJrZG93bihtYXJrZG93biwge1xuXHRcdFx0XHRcdGFjdGlvbkhhbmRsZXI6ICh1cmw6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHVybCk7XG5cdFx0XHRcdFx0XHRpZiAobGlua0hhbmRsZXIpIHtcblx0XHRcdFx0XHRcdFx0bGlua0hhbmRsZXIodXJpLCBlbGVtZW50KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgYWxsb3dDb21tYW5kczogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fc3VibWVudURpc3Bvc2FibGVzLmFkZChyZW5kZXJlZCk7XG5cdFx0XHRcdGhvdmVySGVhZGVyID0gcmVuZGVyZWQuZWxlbWVudDtcblx0XHRcdH1cblx0XHRcdGhvdmVySGVhZGVyLmNsYXNzTGlzdC5hZGQoJ2FjdGlvbi1saXN0LXN1Ym1lbnUtaG92ZXItaGVhZGVyJyk7XG5cdFx0XHRpZiAoZWxlbWVudC5zdWJtZW51QWN0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGhvdmVySGVhZGVyLmNsYXNzTGlzdC5hZGQoJ2hhcy1zdWJtZW51Jyk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLmFwcGVuZENoaWxkKGhvdmVySGVhZGVyKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNTdWJtZW51QWN0aW9ucyA9ICEhZWxlbWVudC5zdWJtZW51QWN0aW9ucz8ubGVuZ3RoO1xuXG5cdFx0Ly8gU2hvdyBjb250YWluZXIgYmVmb3JlIGNyZWF0aW5nIHdpZGdldCBzbyBMaXN0IGNhbiBtZWFzdXJlIGR1cmluZyBjb25zdHJ1Y3Rpb25cblx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLnJlbW92ZUF0dHJpYnV0ZSgncm9sZScpO1xuXG5cdFx0Y29uc3QgYW5jaG9yUmVjdCA9IGFuY2hvci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBwYXJlbnRSZWN0ID0gdGhpcy5kb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKTtcblxuXHRcdGxldCB0b3RhbEhlaWdodCA9IDA7XG5cdFx0bGV0IG1heFdpZHRoID0gaG92ZXJIZWFkZXIgPyBob3ZlckhlYWRlci5vZmZzZXRXaWR0aCA6IDA7XG5cblx0XHRpZiAoaGFzU3VibWVudUFjdGlvbnMpIHtcblx0XHRcdC8vIENvbnZlcnQgc3VibWVudSBhY3Rpb25zIGludG8gQWN0aW9uTGlzdFdpZGdldCBpdGVtc1xuXHRcdFx0Y29uc3Qgc3VibWVudUl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08SUFjdGlvbj5bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3VibWVudUdyb3VwcyA9IGVsZW1lbnQuc3VibWVudUFjdGlvbnMhLmZpbHRlcigoYSk6IGEgaXMgU3VibWVudUFjdGlvbiA9PiBhIGluc3RhbmNlb2YgU3VibWVudUFjdGlvbik7XG5cdFx0XHRjb25zdCBncm91cHNXaXRoQWN0aW9ucyA9IHN1Ym1lbnVHcm91cHMuZmlsdGVyKGcgPT4gZy5hY3Rpb25zLmxlbmd0aCA+IDApO1xuXHRcdFx0Zm9yIChsZXQgZ2kgPSAwOyBnaSA8IGdyb3Vwc1dpdGhBY3Rpb25zLmxlbmd0aDsgZ2krKykge1xuXHRcdFx0XHRjb25zdCBncm91cCA9IGdyb3Vwc1dpdGhBY3Rpb25zW2dpXTtcblx0XHRcdFx0aWYgKGdyb3VwLmxhYmVsKSB7XG5cdFx0XHRcdFx0c3VibWVudUl0ZW1zLnB1c2goe1xuXHRcdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkhlYWRlcixcblx0XHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiBncm91cC5sYWJlbCB9LFxuXHRcdFx0XHRcdFx0bGFiZWw6IGdyb3VwLmxhYmVsLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAobGV0IGNpID0gMDsgY2kgPCBncm91cC5hY3Rpb25zLmxlbmd0aDsgY2krKykge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkID0gZ3JvdXAuYWN0aW9uc1tjaV07XG5cdFx0XHRcdFx0Y29uc3QgZXh0ZW5kZWRDaGlsZCA9IGNoaWxkIGFzIElBY3Rpb24gJiB7IGljb24/OiBUaGVtZUljb247IGhvdmVyQ29udGVudD86IHN0cmluZzsgb25SZW1vdmU/OiAoKSA9PiB2b2lkIH07XG5cdFx0XHRcdFx0Y29uc3QgaWNvbiA9IGV4dGVuZGVkQ2hpbGQuaWNvblxuXHRcdFx0XHRcdFx0Pz8gVGhlbWVJY29uLmZyb21JZChjaGlsZC5jaGVja2VkID8gQ29kaWNvbi5jaGVjay5pZCA6IENvZGljb24uYmxhbmsuaWQpO1xuXHRcdFx0XHRcdGNvbnN0IGhvdmVyQ29udGVudCA9IGV4dGVuZGVkQ2hpbGQuaG92ZXJDb250ZW50O1xuXHRcdFx0XHRcdHN1Ym1lbnVJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGl0ZW06IGNoaWxkLFxuXHRcdFx0XHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdFx0XHRcdGxhYmVsOiBjaGlsZC5sYWJlbCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBjaGlsZC50b29sdGlwIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbiB9LFxuXHRcdFx0XHRcdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdFx0XHRcdFx0aG92ZXI6IGhvdmVyQ29udGVudCA/IHsgY29udGVudDogaG92ZXJDb250ZW50IH0gOiB7fSxcblx0XHRcdFx0XHRcdG9uUmVtb3ZlOiBleHRlbmRlZENoaWxkLm9uUmVtb3ZlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChnaSA8IGdyb3Vwc1dpdGhBY3Rpb25zLmxlbmd0aCAtIDEpIHtcblx0XHRcdFx0XHRzdWJtZW51SXRlbXMucHVzaCh7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IsIGxhYmVsOiAnJyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gQWxzbyBpbmNsdWRlIG5vbi1TdWJtZW51QWN0aW9uIGl0ZW1zIGRpcmVjdGx5XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBlbGVtZW50LnN1Ym1lbnVBY3Rpb25zISkge1xuXHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51QWN0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuZGVkQWN0aW9uID0gYWN0aW9uIGFzIElBY3Rpb24gJiB7IG9uUmVtb3ZlPzogKCkgPT4gdm9pZCB9O1xuXHRcdFx0XHRcdHN1Ym1lbnVJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGl0ZW06IGFjdGlvbixcblx0XHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFjdGlvbi50b29sdGlwIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJyB9LFxuXHRcdFx0XHRcdFx0aGlkZUljb246IGZhbHNlLFxuXHRcdFx0XHRcdFx0aG92ZXI6IHt9LFxuXHRcdFx0XHRcdFx0b25SZW1vdmU6IGV4dGVuZGVkQWN0aW9uLm9uUmVtb3ZlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHN1Ym1lbnVEZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJQWN0aW9uPiA9IHtcblx0XHRcdFx0b25IaWRlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdG9uU2VsZWN0OiAoYWN0aW9uKSA9PiB7XG5cdFx0XHRcdFx0YWN0aW9uLnJ1bigpO1xuXHRcdFx0XHRcdGNvbnN0IHBhcmVudEl0ZW0gPSB0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQ/Lml0ZW07XG5cdFx0XHRcdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0XHRcdFx0XHRpZiAocGFyZW50SXRlbSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVsZWdhdGUub25TZWxlY3QocGFyZW50SXRlbSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuaGlkZSgpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc3VibWVudVdpZGdldCA9IHRoaXMuX3N1Ym1lbnVEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFjdGlvbkxpc3RXaWRnZXQ8SUFjdGlvbj4sXG5cdFx0XHRcdCdzdWJtZW51Jyxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHN1Ym1lbnVJdGVtcyxcblx0XHRcdFx0c3VibWVudURlbGVnYXRlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCkpO1xuXHRcdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5hcHBlbmRDaGlsZChzdWJtZW51V2lkZ2V0LmRvbU5vZGUpO1xuXHRcdFx0dGhpcy5fY3VycmVudFN1Ym1lbnVXaWRnZXQgPSBzdWJtZW51V2lkZ2V0O1xuXG5cdFx0XHQvLyBUaGUgc3VibWVudSB3aWRnZXQncyBjb25zdHJ1Y3RvciBmb2N1c2VzIGl0cyBmaXJzdCBpdGVtIGJ5XG5cdFx0XHQvLyBkZWZhdWx0OyBjbGVhciB0aGF0IHVudGlsIHRoZSB1c2VyIGFjdHVhbGx5IG5hdmlnYXRlcyBpbnRvXG5cdFx0XHQvLyB0aGUgc3VibWVudSAodmlhIEFycm93UmlnaHQpIHNvIGl0IGRvZXNuJ3QgcmVuZGVyIGFzIGlmXG5cdFx0XHQvLyBzZWxlY3RlZCB3aGlsZSB0aGUgcGFyZW50IGxpc3Qgc3RpbGwgaGFzIGZvY3VzLlxuXHRcdFx0c3VibWVudVdpZGdldC5jbGVhckZvY3VzKCk7XG5cblx0XHRcdHRvdGFsSGVpZ2h0ID0gc3VibWVudVdpZGdldC5jb21wdXRlTGlzdEhlaWdodCgpO1xuXHRcdFx0c3VibWVudVdpZGdldC5sYXlvdXQodG90YWxIZWlnaHQpO1xuXHRcdFx0Y29uc3Qgc3VibWVudU1heFdpZHRoID0gc3VibWVudVdpZGdldC5jb21wdXRlTWF4V2lkdGgoMCk7XG5cdFx0XHRtYXhXaWR0aCA9IE1hdGgubWF4KG1heFdpZHRoLCBzdWJtZW51TWF4V2lkdGgpO1xuXHRcdFx0c3VibWVudVdpZGdldC5sYXlvdXQodG90YWxIZWlnaHQsIG1heFdpZHRoKTtcblx0XHRcdHN1Ym1lbnVXaWRnZXQuZG9tTm9kZS5zdHlsZS53aWR0aCA9IGAke21heFdpZHRofXB4YDtcblxuXHRcdFx0Ly8gS2V5Ym9hcmQgbmF2aWdhdGlvbiBpbiBzdWJtZW51XG5cdFx0XHR0aGlzLl9zdWJtZW51RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc3VibWVudVdpZGdldC5kb21Ob2RlLCAna2V5ZG93bicsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChlLmtleSA9PT0gJ0Fycm93TGVmdCcgfHwgZS5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0XHRcdFx0XHR0aGlzLl9saXN0LmRvbUZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5rZXkgPT09ICdFbnRlcicpIHtcblx0XHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0XHRjb25zdCBmb2N1c2VkID0gc3VibWVudVdpZGdldC5nZXRGb2N1c2VkRWxlbWVudCgpO1xuXHRcdFx0XHRcdGlmIChmb2N1c2VkPy5pdGVtKSB7XG5cdFx0XHRcdFx0XHRmb2N1c2VkLml0ZW0ucnVuKCk7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJlbnRJdGVtID0gdGhpcy5fY3VycmVudFN1Ym1lbnVFbGVtZW50Py5pdGVtO1xuXHRcdFx0XHRcdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0XHRcdFx0XHRcdGlmIChwYXJlbnRJdGVtKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2RlbGVnYXRlLm9uU2VsZWN0KHBhcmVudEl0ZW0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dEb3duJykge1xuXHRcdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdHN1Ym1lbnVXaWRnZXQuZm9jdXNOZXh0KCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd1VwJykge1xuXHRcdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdHN1Ym1lbnVXaWRnZXQuZm9jdXNQcmV2aW91cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gUG9zaXRpb246IHByZWZlciByaWdodCBzaWRlLCBmYWxsIGJhY2sgdG8gbGVmdCBpZiBub3QgZW5vdWdoIHNwYWNlXG5cdFx0Y29uc3Qgdmlld3BvcnRXaWR0aCA9IHRhcmdldFdpbmRvdy5pbm5lcldpZHRoO1xuXHRcdGNvbnN0IHNwYWNlUmlnaHQgPSB2aWV3cG9ydFdpZHRoIC0gYW5jaG9yUmVjdC5yaWdodDtcblx0XHRjb25zdCBzcGFjZUxlZnQgPSBwYXJlbnRSZWN0LmxlZnQ7XG5cdFx0Y29uc3QgcGFuZWxXaWR0aCA9IG1heFdpZHRoICsgMTA7IC8vIGFjY291bnQgZm9yIGJvcmRlci9wYWRkaW5nXG5cblx0XHRjb25zdCBnYXAgPSA0O1xuXHRcdGlmIChzcGFjZVJpZ2h0ID49IHBhbmVsV2lkdGggfHwgc3BhY2VSaWdodCA+PSBzcGFjZUxlZnQpIHtcblx0XHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIuc3R5bGUubGVmdCA9IGAke3BhcmVudFJlY3QucmlnaHQgLSBwYXJlbnRSZWN0LmxlZnQgKyBnYXB9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLnN0eWxlLmxlZnQgPSBgJHstcGFuZWxXaWR0aCAtIGdhcH1weGA7XG5cdFx0fVxuXHRcdGNvbnN0IGhvdmVySGVhZGVySGVpZ2h0ID0gaG92ZXJIZWFkZXIgPyBob3ZlckhlYWRlci5vZmZzZXRIZWlnaHQgOiAwO1xuXHRcdGNvbnN0IHRvdGFsUGFuZWxIZWlnaHQgPSB0b3RhbEhlaWdodCArIGhvdmVySGVhZGVySGVpZ2h0O1xuXHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gdGFyZ2V0V2luZG93LmlubmVySGVpZ2h0O1xuXHRcdGNvbnN0IGFuY2hvckhlaWdodCA9IGFuY2hvclJlY3QuaGVpZ2h0O1xuXHRcdGxldCB0b3AgPSBhbmNob3JSZWN0LnRvcCAtIHBhcmVudFJlY3QudG9wICsgKGFuY2hvckhlaWdodCAtIHRvdGFsUGFuZWxIZWlnaHQpIC8gMjtcblx0XHRjb25zdCBwYW5lbEJvdHRvbSA9IHBhcmVudFJlY3QudG9wICsgdG9wICsgdG90YWxQYW5lbEhlaWdodDtcblx0XHRpZiAocGFuZWxCb3R0b20gPiB2aWV3cG9ydEhlaWdodCkge1xuXHRcdFx0dG9wIC09IChwYW5lbEJvdHRvbSAtIHZpZXdwb3J0SGVpZ2h0ICsgOCk7XG5cdFx0fVxuXHRcdGlmIChwYXJlbnRSZWN0LnRvcCArIHRvcCA8IDApIHtcblx0XHRcdHRvcCA9IC1wYXJlbnRSZWN0LnRvcDtcblx0XHR9XG5cdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5zdHlsZS50b3AgPSBgJHt0b3B9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZVN1Ym1lbnUoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsU3VibWVudUhpZGUoKTtcblx0XHR0aGlzLl9jYW5jZWxTdWJtZW51U2hvdygpO1xuXHRcdHRoaXMuX3N1Ym1lbnVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2N1cnJlbnRTdWJtZW51V2lkZ2V0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2N1cnJlbnRTdWJtZW51RWxlbWVudCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jbGVhclN1Ym1lbnVDb250YWluZXIoKTtcblx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXJzIHRoZSBzdWJtZW51L2hvdmVyIHBhbmVsLiBJZiBmb2N1cyBjdXJyZW50bHkgbGl2ZXMgaW5zaWRlIHRoZSBwYW5lbFxuXHQgKiAoZS5nLiB0aGUgdXNlciBjbGlja2VkIGEgYnV0dG9uIGluIHRoZSBob3ZlciBjb250ZW50KSwgZm9jdXMgaXMgZmlyc3QgbW92ZWRcblx0ICogYmFjayB0byB0aGUgbGlzdC4gT3RoZXJ3aXNlIGNsZWFyaW5nIHRoZSBwYW5lbCB3b3VsZCBkcm9wIGZvY3VzIHRvIDxib2R5Pixcblx0ICogd2hpY2ggYmx1cnMgdGhlIGFjdGlvbiB3aWRnZXQgYW5kIGRpc21pc3NlcyBpdC5cblx0ICovXG5cdHByaXZhdGUgX2NsZWFyU3VibWVudUNvbnRhaW5lcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3VibWVudUNvbnRhaW5lci5jb250YWlucyhkb20uZ2V0QWN0aXZlRWxlbWVudCgpKSkge1xuXHRcdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdH1cblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX3N1Ym1lbnVDb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVTdWJtZW51SGlkZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxTdWJtZW51SGlkZSgpO1xuXHRcdHRoaXMuX3N1Ym1lbnVIaWRlVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0XHR9LCAzMDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsU3VibWVudUhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N1Ym1lbnVIaWRlVGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fc3VibWVudUhpZGVUaW1lb3V0KTtcblx0XHRcdHRoaXMuX3N1Ym1lbnVIaWRlVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVN1Ym1lbnVTaG93KGVsZW1lbnQ6IElBY3Rpb25MaXN0SXRlbTxUPiwgaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVTaG93KCk7XG5cdFx0dGhpcy5fc3VibWVudVNob3dUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9zdWJtZW51U2hvd1RpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByb3dFbGVtZW50ID0gdHlwZW9mIGluZGV4ID09PSAnbnVtYmVyJyA/IHRoaXMuX2dldFJvd0VsZW1lbnQoaW5kZXgpIDogbnVsbDtcblx0XHRcdGlmIChyb3dFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dTdWJtZW51Rm9yRWxlbWVudChlbGVtZW50LCByb3dFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9LCA1MDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsU3VibWVudVNob3coKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N1Ym1lbnVTaG93VGltZW91dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fc3VibWVudVNob3dUaW1lb3V0KTtcblx0XHRcdHRoaXMuX3N1Ym1lbnVTaG93VGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uTGlzdEhvdmVyKGU6IElMaXN0TW91c2VFdmVudDxJQWN0aW9uTGlzdEl0ZW08VD4+KSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudDtcblxuXHRcdGlmIChlbGVtZW50ICYmIGVsZW1lbnQuaXRlbSAmJiB0aGlzLmZvY3VzQ29uZGl0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgaG92ZXIgdGFyZ2V0IGlzIGluc2lkZSBhIHRvb2xiYXIgLSBpZiBzbywgc2tpcCB0aGUgc3BsaWNlXG5cdFx0XHQvLyB0byBhdm9pZCByZS1yZW5kZXJpbmcgd2hpY2ggd291bGQgZGVzdHJveSB0aGUgZWxlbWVudCBtaWQtaG92ZXIuXG5cdFx0XHQvLyBCdXQgc3RpbGwgbWFpbnRhaW4gc3VibWVudSBzdGF0ZSBmb3IgaXRlbXMgd2l0aCBzdWJtZW51IGFjdGlvbnMuXG5cdFx0XHRjb25zdCBpc0hvdmVyaW5nVG9vbGJhciA9IGRvbS5pc0hUTUxFbGVtZW50KGUuYnJvd3NlckV2ZW50LnRhcmdldCkgJiYgZS5icm93c2VyRXZlbnQudGFyZ2V0LmNsb3Nlc3QoJy5hY3Rpb24tbGlzdC1pdGVtLXRvb2xiYXInKSAhPT0gbnVsbDtcblx0XHRcdGlmIChpc0hvdmVyaW5nVG9vbGJhcikge1xuXHRcdFx0XHRpZiAoIWVsZW1lbnQuc3VibWVudUFjdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVTaG93KCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IGZvY3VzIGltbWVkaWF0ZWx5IGZvciByZXNwb25zaXZlIGhvdmVyIGZlZWRiYWNrXG5cdFx0XHRjb25zdCBoYXNQYW5lbCA9ICEhKGVsZW1lbnQuc3VibWVudUFjdGlvbnM/Lmxlbmd0aCB8fCBlbGVtZW50LmhvdmVyPy5jb250ZW50KTtcblx0XHRcdGlmIChoYXNQYW5lbCkge1xuXHRcdFx0XHR0aGlzLl9zdXBwcmVzc0hvdmVyID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXModHlwZW9mIGUuaW5kZXggPT09ICdudW1iZXInID8gW2UuaW5kZXhdIDogW10pO1xuXHRcdFx0aWYgKGhhc1BhbmVsKSB7XG5cdFx0XHRcdHRoaXMuX3N1cHByZXNzSG92ZXIgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvdyBob3Zlci9zdWJtZW51IHBhbmVsIG9uIHJvdyBob3ZlciB3aXRoIGEgZGVsYXlcblx0XHRcdGlmIChoYXNQYW5lbCkge1xuXHRcdFx0XHRpZiAodGhpcy5fY3VycmVudFN1Ym1lbnVFbGVtZW50ID09PSBlbGVtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudUhpZGUoKTtcblx0XHRcdFx0XHR0aGlzLl9jYW5jZWxTdWJtZW51U2hvdygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2hpZGVTdWJtZW51KCk7XG5cdFx0XHRcdFx0dGhpcy5fc2NoZWR1bGVTdWJtZW51U2hvdyhlbGVtZW50LCBlLmluZGV4KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudUhpZGUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVTaG93KCk7XG5cdFx0XHRcdHRoaXMuX2hpZGVTdWJtZW51KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9kZWxlZ2F0ZS5vbkhvdmVyICYmICFlbGVtZW50LmRpc2FibGVkICYmIGVsZW1lbnQua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiAmJiB0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQgIT09IGVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZGVsZWdhdGUub25Ib3ZlcihlbGVtZW50Lml0ZW0sIHRoaXMuY3RzLnRva2VuKTtcblx0XHRcdFx0Y29uc3QgY2FuUHJldmlldyA9IHJlc3VsdCA/IHJlc3VsdC5jYW5QcmV2aWV3IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoY2FuUHJldmlldyAhPT0gZWxlbWVudC5jYW5QcmV2aWV3KSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5jYW5QcmV2aWV3ID0gY2FuUHJldmlldztcblx0XHRcdFx0XHRpZiAodHlwZW9mIGUuaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9saXN0LnNwbGljZShlLmluZGV4LCAxLCBbZWxlbWVudF0pO1xuXHRcdFx0XHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbZS5pbmRleF0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZWxlbWVudCAmJiBlbGVtZW50LmhvdmVyPy5jb250ZW50ICYmIHR5cGVvZiBlLmluZGV4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0Ly8gU2hvdyBob3ZlciBmb3IgZGlzYWJsZWQgaXRlbXMgdGhhdCBoYXZlIGhvdmVyIGNvbnRlbnQgKHdpdGggZGVsYXkpXG5cdFx0XHRpZiAodGhpcy5fY3VycmVudFN1Ym1lbnVFbGVtZW50ID09PSBlbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVIaWRlKCk7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVTaG93KCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9oaWRlU3VibWVudSgpO1xuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZVN1Ym1lbnVTaG93KGVsZW1lbnQsIGUuaW5kZXgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25MaXN0Q2xpY2soZTogSUxpc3RNb3VzZUV2ZW50PElBY3Rpb25MaXN0SXRlbTxUPj4pOiB2b2lkIHtcblx0XHRpZiAoZS5lbGVtZW50ICYmIHRoaXMuZm9jdXNDb25kaXRpb24oZS5lbGVtZW50KSkge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbXSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQW4gYWN0aW9uIGxpc3QgdGhhdCB3cmFwcyB7QGxpbmsgQWN0aW9uTGlzdFdpZGdldH0gd2l0aCBjb250ZXh0LXZpZXcgcG9zaXRpb25pbmdcbiAqIGFuZCBhbmNob3ItYmFzZWQgaGVpZ2h0IGNvbXB1dGF0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgQWN0aW9uTGlzdDxUPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpZGdldDogQWN0aW9uTGlzdFdpZGdldDxUPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50IHwgSUFuY2hvcjtcblx0cHJpdmF0ZSBfbGFzdE1pbldpZHRoID0gMDtcblx0cHJpdmF0ZSBfY2FjaGVkTWF4V2lkdGg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaGFzTGFpZE91dCA9IGZhbHNlO1xuXHRwcml2YXRlIF9zaG93QWJvdmU6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uOiBBbmNob3JQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5kb21Ob2RlO1xuXHR9XG5cblx0Z2V0IGZpbHRlckNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5maWx0ZXJDb250YWluZXI7XG5cdH1cblxuXHRnZXQgZm9vdGVyQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LmZvb3RlckNvbnRhaW5lcjtcblx0fVxuXG5cdGdldCBoZWFkZXJDb250YWluZXIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuaGVhZGVyQ29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IGZpbHRlcklucHV0KCk6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuZmlsdGVySW5wdXQ7XG5cdH1cblxuXHRnZXQgY2xvc2VBbmltYXRpb24oKTogSUFjdGlvbkxpc3RDbG9zZUFuaW1hdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5jbG9zZUFuaW1hdGlvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSByZXNvbHZlZCBhbmNob3IgcG9zaXRpb24gYWZ0ZXIgdGhlIGZpcnN0IGxheW91dC5cblx0ICogVXNlZCBieSB0aGUgY29udGV4dCB2aWV3IGRlbGVnYXRlIHRvIGxvY2sgdGhlIGRyb3Bkb3duIGRpcmVjdGlvbi5cblx0ICovXG5cdGdldCBhbmNob3JQb3NpdGlvbigpOiBBbmNob3JQb3NpdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wcmVmZXJyZWRBbmNob3JQb3NpdGlvbjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3Nob3dBYm92ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2hvd0Fib3ZlID8gQW5jaG9yUG9zaXRpb24uQUJPVkUgOiBBbmNob3JQb3NpdGlvbi5CRUxPVztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRwcmV2aWV3OiBib29sZWFuLFxuXHRcdGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSxcblx0XHRfZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8VD4sXG5cdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBQYXJ0aWFsPElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElBY3Rpb25MaXN0SXRlbTxUPj4+IHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25MaXN0T3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRhbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50IHwgSUFuY2hvcixcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9hbmNob3IgPSBhbmNob3I7XG5cdFx0dGhpcy5fcHJlZmVycmVkQW5jaG9yUG9zaXRpb24gPSBvcHRpb25zPy5hbmNob3JQb3NpdGlvbjtcblxuXHRcdHRoaXMuX3dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWN0aW9uTGlzdFdpZGdldDxUPixcblx0XHRcdHVzZXIsXG5cdFx0XHRwcmV2aWV3LFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRfZGVsZWdhdGUsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRvcHRpb25zLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd2lkZ2V0Lm9uRGlkUmVxdWVzdExheW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faGFzTGFpZE91dCkge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9sYXN0TWluV2lkdGgpO1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UubGF5b3V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRoaWRlKGRpZENhbmNlbD86IGJvb2xlYW4sIGhpZGVDb250ZXh0VmlldyA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuaGlkZShkaWRDYW5jZWwpO1xuXHRcdGlmIChoaWRlQ29udGV4dFZpZXcpIHtcblx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhckZpbHRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LmNsZWFyRmlsdGVyKCk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5mb2N1c1ByZXZpb3VzKCk7XG5cdH1cblxuXHRmb2N1c05leHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmZvY3VzTmV4dCgpO1xuXHR9XG5cblx0Y29sbGFwc2VGb2N1c2VkU2VjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuY29sbGFwc2VGb2N1c2VkU2VjdGlvbigpO1xuXHR9XG5cblx0ZXhwYW5kRm9jdXNlZFNlY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmV4cGFuZEZvY3VzZWRTZWN0aW9uKCk7XG5cdH1cblxuXHR0b2dnbGVGb2N1c2VkU2VjdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LnRvZ2dsZUZvY3VzZWRTZWN0aW9uKCk7XG5cdH1cblxuXHRhY2NlcHRTZWxlY3RlZChwcmV2aWV3PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5hY2NlcHRTZWxlY3RlZChwcmV2aWV3KTtcblx0fVxuXG5cdHVwZGF0ZUl0ZW1zKGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSwgZm9jdXNJdGVtSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQudXBkYXRlSXRlbXMoaXRlbXMsIGZvY3VzSXRlbUlkKTtcblx0fVxuXG5cdGZvY3VzSXRlbUJ5SWQoaXRlbUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuZm9jdXNJdGVtQnlJZChpdGVtSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNEeW5hbWljSGVpZ2h0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuaGFzRHluYW1pY0hlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUFjdGlvbldpZGdldFZlcnRpY2FsQ2hyb21lSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgd2lkZ2V0Q29udGFpbmVyID0gdGhpcy5kb21Ob2RlLnBhcmVudEVsZW1lbnQ/LmNsb3Nlc3QoJy5hY3Rpb24td2lkZ2V0Jyk7XG5cdFx0aWYgKCF3aWRnZXRDb250YWluZXIpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0eWxlID0gZG9tLmdldFdpbmRvdyh3aWRnZXRDb250YWluZXIpLmdldENvbXB1dGVkU3R5bGUod2lkZ2V0Q29udGFpbmVyKTtcblx0XHRjb25zdCB0b1BpeGVscyA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IE51bWJlci5wYXJzZUZsb2F0KHZhbHVlKSB8fCAwO1xuXHRcdHJldHVybiB0b1BpeGVscyhzdHlsZS5wYWRkaW5nVG9wKSArIHRvUGl4ZWxzKHN0eWxlLnBhZGRpbmdCb3R0b20pICsgdG9QaXhlbHMoc3R5bGUuYm9yZGVyVG9wV2lkdGgpICsgdG9QaXhlbHMoc3R5bGUuYm9yZGVyQm90dG9tV2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgbGlzdEhlaWdodCA9IHRoaXMuX3dpZGdldC5jb21wdXRlTGlzdEhlaWdodCgpO1xuXG5cdFx0Y29uc3QgZmlsdGVySGVpZ2h0ID0gdGhpcy5fd2lkZ2V0LmZpbHRlckNvbnRhaW5lciA/IDM2IDogMDtcblx0XHRjb25zdCBmb290ZXJIZWlnaHQgPSB0aGlzLl93aWRnZXQuZm9vdGVyQ29udGFpbmVyID8gMzIgOiAwO1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMuX3dpZGdldC5oZWFkZXJDb250YWluZXIgPyB0aGlzLl93aWRnZXQuaGVhZGVyQ29udGFpbmVyLm9mZnNldEhlaWdodCB8fCAzNiA6IDA7XG5cdFx0Y29uc3QgY2hyb21lSGVpZ2h0ID0gZmlsdGVySGVpZ2h0ICsgZm9vdGVySGVpZ2h0ICsgaGVhZGVySGVpZ2h0O1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKTtcblx0XHRsZXQgYXZhaWxhYmxlSGVpZ2h0O1xuXG5cdFx0aWYgKHRoaXMuaGFzRHluYW1pY0hlaWdodCgpIHx8IHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gdGFyZ2V0V2luZG93LmlubmVySGVpZ2h0O1xuXHRcdFx0Y29uc3QgYW5jaG9yUmVjdCA9IGdldEFuY2hvclJlY3QodGhpcy5fYW5jaG9yKTtcblx0XHRcdGNvbnN0IGFuY2hvclRvcEluVmlld3BvcnQgPSBhbmNob3JSZWN0LnRvcCAtIHRhcmdldFdpbmRvdy5wYWdlWU9mZnNldDtcblx0XHRcdGNvbnN0IGJvdHRvbUdhcCA9IDMwO1xuXHRcdFx0Y29uc3Qgc3BhY2VCZWxvdyA9IHZpZXdwb3J0SGVpZ2h0IC0gYW5jaG9yVG9wSW5WaWV3cG9ydCAtIGFuY2hvclJlY3QuaGVpZ2h0IC0gYm90dG9tR2FwO1xuXHRcdFx0Y29uc3Qgc3BhY2VBYm92ZSA9IGFuY2hvclRvcEluVmlld3BvcnQ7XG5cblx0XHRcdC8vIExvY2sgdGhlIGRpcmVjdGlvbiBvbiBmaXJzdCBsYXlvdXQgYmFzZWQgb24gd2hldGhlciB0aGUgZnVsbFxuXHRcdFx0Ly8gdW5jb25zdHJhaW5lZCBsaXN0IGZpdHMgYmVsb3cuIE9uY2UgZGVjaWRlZCwgdGhlIGRyb3Bkb3duIHN0YXlzXG5cdFx0XHQvLyBpbiB0aGUgc2FtZSBwb3NpdGlvbiBldmVuIHdoZW4gdGhlIHZpc2libGUgaXRlbSBjb3VudCBjaGFuZ2VzLlxuXHRcdFx0aWYgKHRoaXMuX3Nob3dBYm92ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dBYm92ZSA9IHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uID09PSBBbmNob3JQb3NpdGlvbi5BQk9WRVxuXHRcdFx0XHRcdDogKGNocm9tZUhlaWdodCArIHRoaXMuX3dpZGdldC5jb21wdXRlRnVsbEhlaWdodCgpID4gc3BhY2VCZWxvdyAmJiBzcGFjZUFib3ZlID4gc3BhY2VCZWxvdyk7XG5cdFx0XHR9XG5cdFx0XHRhdmFpbGFibGVIZWlnaHQgPSBNYXRoLm1heCgwLCAodGhpcy5fc2hvd0Fib3ZlID8gc3BhY2VBYm92ZSA6IHNwYWNlQmVsb3cpIC0gdGhpcy5jb21wdXRlQWN0aW9uV2lkZ2V0VmVydGljYWxDaHJvbWVIZWlnaHQoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHBhZGRpbmcgPSAxMDtcblx0XHRcdGNvbnN0IHdpbmRvd0hlaWdodCA9IHRoaXMuX2xheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdykuY2xpZW50SGVpZ2h0O1xuXHRcdFx0Y29uc3Qgd2lkZ2V0VG9wID0gdGhpcy5kb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRcdGF2YWlsYWJsZUhlaWdodCA9IHdpZGdldFRvcCA+IDAgPyB3aW5kb3dIZWlnaHQgLSB3aWRnZXRUb3AgLSBwYWRkaW5nIDogd2luZG93SGVpZ2h0ICogMC43O1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdwb3J0TWF4SGVpZ2h0ID0gTWF0aC5mbG9vcih0YXJnZXRXaW5kb3cuaW5uZXJIZWlnaHQgKiAwLjYpO1xuXHRcdGNvbnN0IGFjdGlvbkxpbmVIZWlnaHQgPSB0aGlzLl93aWRnZXQubGluZUhlaWdodDtcblx0XHRpZiAodGhpcy5fcHJlZmVycmVkQW5jaG9yUG9zaXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5taW4oYXZhaWxhYmxlSGVpZ2h0LCB2aWV3cG9ydE1heEhlaWdodCk7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbihsaXN0SGVpZ2h0ICsgY2hyb21lSGVpZ2h0LCBNYXRoLm1heCgwLCBtYXhIZWlnaHQpKTtcblx0XHRcdHJldHVybiBNYXRoLm1heCgwLCBoZWlnaHQgLSBjaHJvbWVIZWlnaHQpO1xuXHRcdH1cblx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1pbihNYXRoLm1heChhdmFpbGFibGVIZWlnaHQsIGFjdGlvbkxpbmVIZWlnaHQgKiAzICsgY2hyb21lSGVpZ2h0KSwgdmlld3BvcnRNYXhIZWlnaHQpO1xuXHRcdGNvbnN0IGhlaWdodCA9IE1hdGgubWluKGxpc3RIZWlnaHQgKyBjaHJvbWVIZWlnaHQsIG1heEhlaWdodCk7XG5cdFx0cmV0dXJuIGhlaWdodCAtIGNocm9tZUhlaWdodDtcblx0fVxuXG5cdGxheW91dChtaW5XaWR0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR0aGlzLl9oYXNMYWlkT3V0ID0gdHJ1ZTtcblx0XHR0aGlzLl9sYXN0TWluV2lkdGggPSBtaW5XaWR0aDtcblxuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSB0aGlzLmNvbXB1dGVIZWlnaHQoKTtcblx0XHR0aGlzLl93aWRnZXQubGF5b3V0KGxpc3RIZWlnaHQpO1xuXG5cdFx0Y29uc3QgY29tcHV0ZWRXaWR0aCA9IHRoaXMuX3dpZGdldC5jb21wdXRlTWF4V2lkdGgobWluV2lkdGgpO1xuXHRcdHRoaXMuX2NhY2hlZE1heFdpZHRoID0gY29tcHV0ZWRXaWR0aDtcblx0XHR0aGlzLl93aWRnZXQubGF5b3V0KGxpc3RIZWlnaHQsIHRoaXMuX2NhY2hlZE1heFdpZHRoKTtcblxuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRNYXhXaWR0aDtcblx0fVxufVxuXG5mdW5jdGlvbiBzdHJpcE5ld2xpbmVzKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHN0ci5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbi9nLCAnICcpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjO0FBRXZCLFNBQXFDLFlBQVk7QUFDakQsU0FBa0IsZUFBZSxnQkFBZ0I7QUFDakQsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBMEIsa0JBQWtCLHNCQUFzQjtBQUVsRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBUyxVQUFVO0FBQ25CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBRS9CLE1BQU0sOEJBQThCO0FBQ3BDLE1BQU0sK0JBQStCO0FBNkhyQyxJQUFXLHFCQUFYLGtCQUFXQSx3QkFBWDtBQUNOLEVBQUFBLG9CQUFBLFlBQVM7QUFDVCxFQUFBQSxvQkFBQSxZQUFTO0FBQ1QsRUFBQUEsb0JBQUEsZUFB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LElBQUksR0FBR0MsVUFBUyxZQUFZO0FBQUEsSUFDekM7QUFDQSxVQUFNLFlBQVksS0FBSyxJQUFJLEtBQUssSUFBSSxpQkFBaUIsbUJBQW1CLElBQUksWUFBWSxHQUFHLGlCQUFpQjtBQUM1RyxVQUFNLFNBQVMsS0FBSyxJQUFJLGFBQWEsY0FBYyxTQUFTO0FBQzVELFdBQU8sU0FBUztBQUFBLEVBQ2pCO0FBQUEsRUFFQSxPQUFPLFVBQTBCO0FBQ2hDLFNBQUssY0FBYztBQUNuQixTQUFLLGdCQUFnQjtBQUVyQixVQUFNLGFBQWEsS0FBSyxjQUFjO0FBQ3RDLFNBQUssUUFBUSxPQUFPLFVBQVU7QUFFOUIsVUFBTSxnQkFBZ0IsS0FBSyxRQUFRLGdCQUFnQixRQUFRO0FBQzNELFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssUUFBUSxPQUFPLFlBQVksS0FBSyxlQUFlO0FBRXBELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDtBQTVNYSxhQUFOO0FBQUEsRUF5REo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBM0RVO0FBOE1iLFNBQVMsY0FBYyxLQUFxQjtBQUMzQyxTQUFPLElBQUksUUFBUSxlQUFlLEdBQUc7QUFDdEM7IiwKICAibmFtZXMiOiBbIkFjdGlvbkxpc3RJdGVtS2luZCIsICJ2aXNpYmxlSXRlbXMiLCAiaXRlbVdpZHRocyIsICJmb2N1c2VkIiwgImhvdmVyQ29udGVudCIsICJtYXhIZWlnaHQiLCAiaGVpZ2h0Il0KfQo=
