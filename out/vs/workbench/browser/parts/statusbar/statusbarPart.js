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
import "./media/statusbarpart.css";
import { localize } from "../../../../nls.js";
import { Disposable, DisposableStore, disposeIfDisposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { MultiWindowParts, Part } from "../../part.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { StatusbarAlignment, IStatusbarService, isStatusbarEntryLocation, isStatusbarEntryPriority } from "../../../services/statusbar/browser/statusbar.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { Separator, toAction } from "../../../../base/common/actions.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { STATUS_BAR_BACKGROUND, STATUS_BAR_FOREGROUND, STATUS_BAR_NO_FOLDER_BACKGROUND, STATUS_BAR_ITEM_HOVER_BACKGROUND, STATUS_BAR_BORDER, STATUS_BAR_NO_FOLDER_FOREGROUND, STATUS_BAR_NO_FOLDER_BORDER, STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND, STATUS_BAR_ITEM_FOCUS_BORDER, STATUS_BAR_FOCUS_BORDER } from "../../../common/theme.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { contrastBorder, activeContrastBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { EventHelper, addDisposableListener, EventType, clearNode, getWindow, isHTMLElement, $ } from "../../../../base/browser/dom.js";
import { createStyleSheet } from "../../../../base/browser/domStylesheets.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { Parts, IWorkbenchLayoutService, LayoutSettings } from "../../../services/layout/browser/layoutService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { equals } from "../../../../base/common/arrays.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { ToggleStatusbarVisibilityAction } from "../../actions/layoutActions.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { hash } from "../../../../base/common/hash.js";
import { WorkbenchHoverDelegate } from "../../../../platform/hover/browser/hover.js";
import { HideStatusbarEntryAction, ManageExtensionAction, ToggleStatusbarEntryVisibilityAction } from "./statusbarActions.js";
import { StatusbarViewModel } from "./statusbarModel.js";
import { StatusbarEntryItem } from "./statusbarItem.js";
import { StatusBarFocused } from "../../../common/contextkeys.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { isManagedHoverTooltipHTMLElement, isManagedHoverTooltipMarkdownString } from "../../../../base/browser/ui/hover/hover.js";
let StatusbarPart = class extends Part {
  constructor(id, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.instantiationService = instantiationService;
    this.contextService = contextService;
    this.contextMenuService = contextMenuService;
    this.contextKeyService = contextKeyService;
    this.configurationService = configurationService;
    this.minimumWidth = 0;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    this.pendingEntries = [];
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.onDidOverrideEntry = this._register(new Emitter());
    this.entryOverrides = /* @__PURE__ */ new Map();
    this.compactEntriesDisposable = this._register(new MutableDisposable());
    this.styleOverrides = /* @__PURE__ */ new Set();
    this.viewModel = this._register(new StatusbarViewModel(storageService));
    this.onDidChangeEntryVisibility = this.viewModel.onDidChangeEntryVisibility;
    this.hoverDelegate = this._register(this.instantiationService.createInstance(WorkbenchHoverDelegate, "element", {
      instantHover: true,
      dynamicDelay(content) {
        if (typeof content === "function" || isHTMLElement(content) || isManagedHoverTooltipMarkdownString(content) && typeof content.markdown === "function" || isManagedHoverTooltipHTMLElement(content)) {
          return 500;
        }
        return void 0;
      }
    }, (_, focus) => ({
      persistence: {
        hideOnKeyDown: true,
        sticky: focus
      },
      appearance: {
        maxHeightRatio: 0.9
      }
    })));
    this.registerListeners();
  }
  //#region IView
  get floatingBottomPadding() {
    return this.getId() === Parts.STATUSBAR_PART && this.layoutService.isFloatingPanelsEnabled() ? StatusbarPart.FLOATING_BOTTOM_PADDING : 0;
  }
  get minimumHeight() {
    return StatusbarPart.HEIGHT + this.floatingBottomPadding;
  }
  get maximumHeight() {
    return StatusbarPart.HEIGHT + this.floatingBottomPadding;
  }
  registerListeners() {
    this._register(this.onDidChangeEntryVisibility(() => this.updateCompactEntries()));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.updateStyles()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (this.getId() === Parts.STATUSBAR_PART && e.affectsConfiguration(LayoutSettings.MODERN_UI)) {
        this._onDidChange.fire(void 0);
      }
    }));
  }
  overrideEntry(id, override) {
    this.entryOverrides.set(id, override);
    this.onDidOverrideEntry.fire(id);
    return toDisposable(() => {
      const currentOverride = this.entryOverrides.get(id);
      if (currentOverride === override) {
        this.entryOverrides.delete(id);
        this.onDidOverrideEntry.fire(id);
      }
    });
  }
  withEntryOverride(entry, id) {
    const override = this.entryOverrides.get(id);
    if (override) {
      entry = { ...entry, ...override };
    }
    return entry;
  }
  addEntry(entry, id, alignment, priorityOrLocation = 0) {
    let priority;
    if (isStatusbarEntryPriority(priorityOrLocation)) {
      priority = priorityOrLocation;
    } else {
      priority = {
        primary: priorityOrLocation,
        secondary: hash(id)
        // derive from identifier to accomplish uniqueness
      };
    }
    if (!this.element) {
      return this.doAddPendingEntry(entry, id, alignment, priority);
    }
    return this.doAddEntry(entry, id, alignment, priority);
  }
  doAddPendingEntry(entry, id, alignment, priority) {
    const pendingEntry = { entry, id, alignment, priority };
    this.pendingEntries.push(pendingEntry);
    const accessor = {
      update: (entry2) => {
        if (pendingEntry.accessor) {
          pendingEntry.accessor.update(entry2);
        } else {
          pendingEntry.entry = entry2;
        }
      },
      dispose: () => {
        if (pendingEntry.accessor) {
          pendingEntry.accessor.dispose();
        } else {
          this.pendingEntries = this.pendingEntries.filter((entry2) => entry2 !== pendingEntry);
        }
      }
    };
    return accessor;
  }
  doAddEntry(entry, id, alignment, priority) {
    const disposables = new DisposableStore();
    const itemContainer = this.doCreateStatusItem(id, alignment);
    const item = disposables.add(this.instantiationService.createInstance(StatusbarEntryItem, itemContainer, this.withEntryOverride(entry, id), this.hoverDelegate));
    const viewModelEntry = new class {
      constructor() {
        this.id = id;
        this.extensionId = entry.extensionId;
        this.alignment = alignment;
        this.priority = priority;
        this.container = itemContainer;
        this.labelContainer = item.labelContainer;
      }
      get name() {
        return item.name;
      }
      get hasCommand() {
        return item.hasCommand;
      }
    }();
    const { needsFullRefresh } = this.doAddOrRemoveModelEntry(viewModelEntry, true);
    if (needsFullRefresh) {
      this.appendStatusbarEntries();
    } else {
      this.appendStatusbarEntry(viewModelEntry);
    }
    let lastEntry = entry;
    const accessor = {
      update: (entry2) => {
        lastEntry = entry2;
        item.update(this.withEntryOverride(entry2, id));
      },
      dispose: () => {
        const { needsFullRefresh: needsFullRefresh2 } = this.doAddOrRemoveModelEntry(viewModelEntry, false);
        if (needsFullRefresh2) {
          this.appendStatusbarEntries();
        } else {
          itemContainer.remove();
          this.updateCompactEntries();
        }
        disposables.dispose();
      }
    };
    disposables.add(this.onDidOverrideEntry.event((overrideEntryId) => {
      if (overrideEntryId === id) {
        accessor.update(lastEntry);
      }
    }));
    return accessor;
  }
  doCreateStatusItem(id, alignment, ...extraClasses) {
    const itemContainer = $(".statusbar-item", { id });
    if (extraClasses) {
      itemContainer.classList.add(...extraClasses);
    }
    if (alignment === StatusbarAlignment.RIGHT) {
      itemContainer.classList.add("right");
    } else {
      itemContainer.classList.add("left");
    }
    return itemContainer;
  }
  doAddOrRemoveModelEntry(entry, add) {
    const entriesBefore = this.viewModel.entries;
    if (add) {
      this.viewModel.add(entry);
    } else {
      this.viewModel.remove(entry);
    }
    const entriesAfter = this.viewModel.entries;
    if (add) {
      entriesBefore.splice(entriesAfter.indexOf(entry), 0, entry);
    } else {
      entriesBefore.splice(entriesBefore.indexOf(entry), 1);
    }
    const needsFullRefresh = !equals(entriesBefore, entriesAfter);
    return { needsFullRefresh };
  }
  isEntryVisible(id) {
    return !this.viewModel.isHidden(id);
  }
  updateEntryVisibility(id, visible) {
    if (visible) {
      this.viewModel.show(id);
    } else {
      this.viewModel.hide(id);
    }
  }
  focusNextEntry() {
    this.viewModel.focusNextEntry();
  }
  focusPreviousEntry() {
    this.viewModel.focusPreviousEntry();
  }
  isEntryFocused() {
    return this.viewModel.isEntryFocused();
  }
  focus(preserveEntryFocus = true) {
    this.getContainer()?.focus();
    const lastFocusedEntry = this.viewModel.lastFocusedEntry;
    if (preserveEntryFocus && lastFocusedEntry) {
      setTimeout(() => lastFocusedEntry.labelContainer.focus(), 0);
    }
  }
  createContentArea(parent) {
    this.element = parent;
    const scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.element));
    StatusBarFocused.bindTo(scopedContextKeyService).set(true);
    this.leftItemsContainer = $(".left-items.items-container");
    this.element.appendChild(this.leftItemsContainer);
    this.element.tabIndex = 0;
    this.rightItemsContainer = $(".right-items.items-container");
    this.element.appendChild(this.rightItemsContainer);
    this._register(addDisposableListener(parent, EventType.CONTEXT_MENU, (e) => this.showContextMenu(e)));
    this._register(Gesture.addTarget(parent));
    this._register(addDisposableListener(parent, TouchEventType.Contextmenu, (e) => this.showContextMenu(e)));
    this.createInitialStatusbarEntries();
    return this.element;
  }
  createInitialStatusbarEntries() {
    this.appendStatusbarEntries();
    while (this.pendingEntries.length) {
      const pending = this.pendingEntries.shift();
      if (pending) {
        pending.accessor = this.addEntry(pending.entry, pending.id, pending.alignment, pending.priority.primary);
      }
    }
  }
  appendStatusbarEntries() {
    const leftItemsContainer = assertReturnsDefined(this.leftItemsContainer);
    const rightItemsContainer = assertReturnsDefined(this.rightItemsContainer);
    clearNode(leftItemsContainer);
    clearNode(rightItemsContainer);
    for (const entry of [
      ...this.viewModel.getEntries(StatusbarAlignment.LEFT),
      ...this.viewModel.getEntries(StatusbarAlignment.RIGHT).reverse()
      // reversing due to flex: row-reverse
    ]) {
      const target = entry.alignment === StatusbarAlignment.LEFT ? leftItemsContainer : rightItemsContainer;
      target.appendChild(entry.container);
    }
    this.updateCompactEntries();
  }
  appendStatusbarEntry(entry) {
    const entries = this.viewModel.getEntries(entry.alignment);
    if (entry.alignment === StatusbarAlignment.RIGHT) {
      entries.reverse();
    }
    const target = assertReturnsDefined(entry.alignment === StatusbarAlignment.LEFT ? this.leftItemsContainer : this.rightItemsContainer);
    const index = entries.indexOf(entry);
    if (index + 1 === entries.length) {
      target.appendChild(entry.container);
    } else {
      target.insertBefore(entry.container, entries[index + 1].container);
    }
    this.updateCompactEntries();
  }
  updateCompactEntries() {
    const entries = this.viewModel.entries;
    const mapIdToVisibleEntry = /* @__PURE__ */ new Map();
    for (const entry of entries) {
      if (!this.viewModel.isHidden(entry.id)) {
        mapIdToVisibleEntry.set(entry.id, entry);
      }
      entry.container.classList.remove("compact-left", "compact-right");
    }
    const compactEntryGroups = /* @__PURE__ */ new Map();
    for (const entry of mapIdToVisibleEntry.values()) {
      if (isStatusbarEntryLocation(entry.priority.primary) && // entry references another entry as location
      entry.priority.primary.compact) {
        const locationId = entry.priority.primary.location.id;
        const location = mapIdToVisibleEntry.get(locationId);
        if (!location) {
          continue;
        }
        let compactEntryGroup = compactEntryGroups.get(locationId);
        if (!compactEntryGroup) {
          for (const group of compactEntryGroups.values()) {
            if (group.has(locationId)) {
              compactEntryGroup = group;
              break;
            }
          }
          if (!compactEntryGroup) {
            compactEntryGroup = /* @__PURE__ */ new Map();
            compactEntryGroups.set(locationId, compactEntryGroup);
          }
        }
        compactEntryGroup.set(entry.id, entry);
        compactEntryGroup.set(location.id, location);
        if (entry.priority.primary.alignment === StatusbarAlignment.LEFT) {
          location.container.classList.add("compact-left");
          entry.container.classList.add("compact-right");
        } else {
          location.container.classList.add("compact-right");
          entry.container.classList.add("compact-left");
        }
      }
    }
    const statusBarItemHoverBackground = this.getColor(STATUS_BAR_ITEM_HOVER_BACKGROUND);
    const statusBarItemCompactHoverBackground = this.getColor(STATUS_BAR_ITEM_COMPACT_HOVER_BACKGROUND);
    this.compactEntriesDisposable.value = new DisposableStore();
    if (statusBarItemHoverBackground && statusBarItemCompactHoverBackground && !isHighContrast(this.theme.type)) {
      for (const [, compactEntryGroup] of compactEntryGroups) {
        for (const compactEntry of compactEntryGroup.values()) {
          if (!compactEntry.hasCommand) {
            continue;
          }
          this.compactEntriesDisposable.value.add(addDisposableListener(compactEntry.labelContainer, EventType.MOUSE_OVER, () => {
            compactEntryGroup.forEach((compactEntry2) => compactEntry2.labelContainer.style.backgroundColor = statusBarItemHoverBackground);
            compactEntry.labelContainer.style.backgroundColor = statusBarItemCompactHoverBackground;
          }));
          this.compactEntriesDisposable.value.add(addDisposableListener(compactEntry.labelContainer, EventType.MOUSE_OUT, () => {
            compactEntryGroup.forEach((compactEntry2) => compactEntry2.labelContainer.style.backgroundColor = "");
          }));
        }
      }
    }
  }
  showContextMenu(e) {
    EventHelper.stop(e, true);
    const event = new StandardMouseEvent(getWindow(this.element), e);
    let actions = void 0;
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => {
        actions = this.getContextMenuActions(event);
        return actions;
      },
      onHide: () => {
        if (actions) {
          disposeIfDisposable(actions);
        }
      }
    });
  }
  getContextMenuActions(event) {
    const actions = [];
    actions.push(toAction({ id: ToggleStatusbarVisibilityAction.ID, label: localize("hideStatusBar", "Hide Status Bar"), run: () => this.instantiationService.invokeFunction((accessor) => new ToggleStatusbarVisibilityAction().run(accessor)) }));
    actions.push(new Separator());
    const handledEntries = /* @__PURE__ */ new Set();
    for (const entry of this.viewModel.entries) {
      if (!handledEntries.has(entry.id)) {
        actions.push(new ToggleStatusbarEntryVisibilityAction(entry.id, entry.name, this.viewModel));
        handledEntries.add(entry.id);
      }
    }
    let statusEntryUnderMouse = void 0;
    for (let element = event.target; element; element = element.parentElement) {
      const entry = this.viewModel.findEntry(element);
      if (entry) {
        statusEntryUnderMouse = entry;
        break;
      }
    }
    if (statusEntryUnderMouse) {
      actions.push(new Separator());
      if (statusEntryUnderMouse.extensionId) {
        actions.push(this.instantiationService.createInstance(ManageExtensionAction, statusEntryUnderMouse.extensionId));
      }
      actions.push(new HideStatusbarEntryAction(statusEntryUnderMouse.id, statusEntryUnderMouse.name, this.viewModel));
    }
    return actions;
  }
  updateStyles() {
    super.updateStyles();
    const container = assertReturnsDefined(this.getContainer());
    const styleOverride = [...this.styleOverrides].sort((a, b) => a.priority - b.priority)[0];
    const backgroundColor = this.getColor(styleOverride?.background ?? (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_BACKGROUND : STATUS_BAR_NO_FOLDER_BACKGROUND)) || "";
    container.style.backgroundColor = backgroundColor;
    const foregroundColor = this.getColor(styleOverride?.foreground ?? (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_FOREGROUND : STATUS_BAR_NO_FOLDER_FOREGROUND)) || "";
    container.style.color = foregroundColor;
    const itemBorderColor = this.getColor(STATUS_BAR_ITEM_FOCUS_BORDER);
    this.updateCompactEntries();
    container.classList.toggle("has-style-override", !!styleOverride?.background);
    const borderColor = this.getColor(styleOverride?.border ?? (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? STATUS_BAR_BORDER : STATUS_BAR_NO_FOLDER_BORDER)) || this.getColor(contrastBorder);
    if (borderColor) {
      container.classList.add("status-border-top");
      container.style.setProperty("--status-border-top-color", borderColor);
    } else {
      container.classList.remove("status-border-top");
      container.style.removeProperty("--status-border-top-color");
    }
    const statusBarFocusColor = this.getColor(STATUS_BAR_FOCUS_BORDER);
    if (!this.styleElement) {
      this.styleElement = createStyleSheet(container, void 0, this._store);
    }
    this.styleElement.textContent = `

				/* Status bar focus outline */
				.monaco-workbench .part.statusbar:focus {
					outline-color: ${statusBarFocusColor};
				}

				/* Status bar item focus outline */
				.monaco-workbench .part.statusbar > .items-container > .statusbar-item a:focus-visible {
					outline: 1px solid ${this.getColor(activeContrastBorder) ?? itemBorderColor};
					outline-offset: ${borderColor ? "-2px" : "-1px"};
				}

				/* Notification Beak */
				.monaco-workbench .part.statusbar > .items-container > .statusbar-item.has-beak > .status-bar-item-beak-container:before {
					border-bottom-color: ${borderColor ?? backgroundColor};
				}
			`;
  }
  layout(width, height, top, left) {
    super.layout(width, height, top, left);
    super.layoutContents(width, height);
  }
  overrideStyle(style) {
    this.styleOverrides.add(style);
    this.updateStyles();
    return toDisposable(() => {
      this.styleOverrides.delete(style);
      this.updateStyles();
    });
  }
  toJSON() {
    return {
      type: Parts.STATUSBAR_PART
    };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
};
StatusbarPart.HEIGHT = 22;
/**
 * Vertical padding reserved around the main status bar under the floating panels
 * experiment so its items remain centered. The part grows by this amount and
 * the matching padding is applied in `floatingPanels.css`.
 */
StatusbarPart.FLOATING_BOTTOM_PADDING = 10;
StatusbarPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IConfigurationService)
], StatusbarPart);
let MainStatusbarPart = class extends StatusbarPart {
  constructor(instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService) {
    super(Parts.STATUSBAR_PART, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService);
  }
};
MainStatusbarPart = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IThemeService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IWorkbenchLayoutService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IConfigurationService)
], MainStatusbarPart);
let AuxiliaryStatusbarPart = class extends StatusbarPart {
  constructor(container, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService) {
    const id = AuxiliaryStatusbarPart.COUNTER++;
    super(`workbench.parts.auxiliaryStatus.${id}`, instantiationService, themeService, contextService, storageService, layoutService, contextMenuService, contextKeyService, configurationService);
    this.container = container;
    this.height = StatusbarPart.HEIGHT;
  }
};
AuxiliaryStatusbarPart.COUNTER = 1;
AuxiliaryStatusbarPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IConfigurationService)
], AuxiliaryStatusbarPart);
let StatusbarService = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService) {
    super("workbench.statusBarService", themeService, storageService);
    this.instantiationService = instantiationService;
    this._onDidCreateAuxiliaryStatusbarPart = this._register(new Emitter());
    this.onDidCreateAuxiliaryStatusbarPart = this._onDidCreateAuxiliaryStatusbarPart.event;
    this.mainPart = this._register(this.instantiationService.createInstance(MainStatusbarPart));
    this._register(this.registerPart(this.mainPart));
    this.onDidChangeEntryVisibility = this.mainPart.onDidChangeEntryVisibility;
  }
  //#region Auxiliary Statusbar Parts
  createAuxiliaryStatusbarPart(container, instantiationService) {
    const statusbarPartContainer = $("footer.part.statusbar", {
      "role": "status",
      "aria-live": "off",
      "tabIndex": "0"
    });
    statusbarPartContainer.style.position = "relative";
    container.appendChild(statusbarPartContainer);
    const statusbarPart = instantiationService.createInstance(AuxiliaryStatusbarPart, statusbarPartContainer);
    const disposable = this.registerPart(statusbarPart);
    statusbarPart.create(statusbarPartContainer);
    Event.once(statusbarPart.onWillDispose)(() => disposable.dispose());
    this._onDidCreateAuxiliaryStatusbarPart.fire(statusbarPart);
    return statusbarPart;
  }
  createScoped(statusbarEntryContainer, disposables) {
    return disposables.add(this.instantiationService.createInstance(ScopedStatusbarService, statusbarEntryContainer));
  }
  addEntry(entry, id, alignment, priorityOrLocation = 0) {
    if (entry.showInAllWindows) {
      return this.doAddEntryToAllWindows(entry, id, alignment, priorityOrLocation);
    }
    return this.mainPart.addEntry(entry, id, alignment, priorityOrLocation);
  }
  doAddEntryToAllWindows(originalEntry, id, alignment, priorityOrLocation = 0) {
    const entryDisposables = new DisposableStore();
    const accessors = /* @__PURE__ */ new Set();
    let entry = originalEntry;
    function addEntry(part) {
      const partDisposables = new DisposableStore();
      partDisposables.add(part.onWillDispose(() => partDisposables.dispose()));
      const accessor = partDisposables.add(part.addEntry(entry, id, alignment, priorityOrLocation));
      accessors.add(accessor);
      partDisposables.add(toDisposable(() => accessors.delete(accessor)));
      entryDisposables.add(partDisposables);
      partDisposables.add(toDisposable(() => entryDisposables.delete(partDisposables)));
    }
    for (const part of this.parts) {
      addEntry(part);
    }
    entryDisposables.add(this.onDidCreateAuxiliaryStatusbarPart((part) => addEntry(part)));
    return {
      update: (updatedEntry) => {
        entry = updatedEntry;
        for (const update of accessors) {
          update.update(updatedEntry);
        }
      },
      dispose: () => entryDisposables.dispose()
    };
  }
  isEntryVisible(id) {
    return this.mainPart.isEntryVisible(id);
  }
  updateEntryVisibility(id, visible) {
    for (const part of this.parts) {
      part.updateEntryVisibility(id, visible);
    }
  }
  overrideEntry(id, override) {
    const disposables = new DisposableStore();
    for (const part of this.parts) {
      disposables.add(part.overrideEntry(id, override));
    }
    return disposables;
  }
  focus(preserveEntryFocus) {
    this.activePart.focus(preserveEntryFocus);
  }
  focusNextEntry() {
    this.activePart.focusNextEntry();
  }
  focusPreviousEntry() {
    this.activePart.focusPreviousEntry();
  }
  isEntryFocused() {
    return this.activePart.isEntryFocused();
  }
  overrideStyle(style) {
    const disposables = new DisposableStore();
    for (const part of this.parts) {
      disposables.add(part.overrideStyle(style));
    }
    return disposables;
  }
  //#endregion
};
StatusbarService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService)
], StatusbarService);
let ScopedStatusbarService = class extends Disposable {
  constructor(statusbarEntryContainer, statusbarService) {
    super();
    this.statusbarEntryContainer = statusbarEntryContainer;
    this.statusbarService = statusbarService;
    this.onDidChangeEntryVisibility = this.statusbarEntryContainer.onDidChangeEntryVisibility;
  }
  createAuxiliaryStatusbarPart(container, instantiationService) {
    return this.statusbarService.createAuxiliaryStatusbarPart(container, instantiationService);
  }
  createScoped(statusbarEntryContainer, disposables) {
    return this.statusbarService.createScoped(statusbarEntryContainer, disposables);
  }
  getPart() {
    return this.statusbarEntryContainer;
  }
  addEntry(entry, id, alignment, priorityOrLocation = 0) {
    return this.statusbarEntryContainer.addEntry(entry, id, alignment, priorityOrLocation);
  }
  isEntryVisible(id) {
    return this.statusbarEntryContainer.isEntryVisible(id);
  }
  updateEntryVisibility(id, visible) {
    this.statusbarEntryContainer.updateEntryVisibility(id, visible);
  }
  overrideEntry(id, override) {
    return this.statusbarEntryContainer.overrideEntry(id, override);
  }
  focus(preserveEntryFocus) {
    this.statusbarEntryContainer.focus(preserveEntryFocus);
  }
  focusNextEntry() {
    this.statusbarEntryContainer.focusNextEntry();
  }
  focusPreviousEntry() {
    this.statusbarEntryContainer.focusPreviousEntry();
  }
  isEntryFocused() {
    return this.statusbarEntryContainer.isEntryFocused();
  }
  overrideStyle(style) {
    return this.statusbarEntryContainer.overrideStyle(style);
  }
};
ScopedStatusbarService = __decorateClass([
  __decorateParam(1, IStatusbarService)
], ScopedStatusbarService);
registerSingleton(IStatusbarService, StatusbarService, InstantiationType.Eager);
export {
  AuxiliaryStatusbarPart,
  MainStatusbarPart,
  ScopedStatusbarService,
  StatusbarService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3N0YXR1c2Jhci9zdGF0dXNiYXJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3N0YXR1c2JhcnBhcnQuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZUlmRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTXVsdGlXaW5kb3dQYXJ0cywgUGFydCB9IGZyb20gJy4uLy4uL3BhcnQuanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlIGFzIFRvdWNoRXZlbnRUeXBlLCBHZXN0dXJlLCBHZXN0dXJlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdG91Y2guanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTdGF0dXNiYXJBbGlnbm1lbnQsIElTdGF0dXNiYXJTZXJ2aWNlLCBJU3RhdHVzYmFyRW50cnksIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yLCBJU3RhdHVzYmFyU3R5bGVPdmVycmlkZSwgaXNTdGF0dXNiYXJFbnRyeUxvY2F0aW9uLCBJU3RhdHVzYmFyRW50cnlMb2NhdGlvbiwgaXNTdGF0dXNiYXJFbnRyeVByaW9yaXR5LCBJU3RhdHVzYmFyRW50cnlQcmlvcml0eSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBTZXBhcmF0b3IsIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTVEFUVVNfQkFSX0JBQ0tHUk9VTkQsIFNUQVRVU19CQVJfRk9SRUdST1VORCwgU1RBVFVTX0JBUl9OT19GT0xERVJfQkFDS0dST1VORCwgU1RBVFVTX0JBUl9JVEVNX0hPVkVSX0JBQ0tHUk9VTkQsIFNUQVRVU19CQVJfQk9SREVSLCBTVEFUVVNfQkFSX05PX0ZPTERFUl9GT1JFR1JPVU5ELCBTVEFUVVNfQkFSX05PX0ZPTERFUl9CT1JERVIsIFNUQVRVU19CQVJfSVRFTV9DT01QQUNUX0hPVkVSX0JBQ0tHUk9VTkQsIFNUQVRVU19CQVJfSVRFTV9GT0NVU19CT1JERVIsIFNUQVRVU19CQVJfRk9DVVNfQk9SREVSIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBjb250cmFzdEJvcmRlciwgYWN0aXZlQ29udHJhc3RCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBFdmVudEhlbHBlciwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGNsZWFyTm9kZSwgZ2V0V2luZG93LCBpc0hUTUxFbGVtZW50LCAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgUGFydHMsIElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBMYXlvdXRTZXR0aW5ncyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9sYXlvdXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBoYXNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaGFzaC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIaWRlU3RhdHVzYmFyRW50cnlBY3Rpb24sIE1hbmFnZUV4dGVuc2lvbkFjdGlvbiwgVG9nZ2xlU3RhdHVzYmFyRW50cnlWaXNpYmlsaXR5QWN0aW9uIH0gZnJvbSAnLi9zdGF0dXNiYXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IElTdGF0dXNiYXJWaWV3TW9kZWxFbnRyeSwgU3RhdHVzYmFyVmlld01vZGVsIH0gZnJvbSAnLi9zdGF0dXNiYXJNb2RlbC5qcyc7XG5pbXBvcnQgeyBTdGF0dXNiYXJFbnRyeUl0ZW0gfSBmcm9tICcuL3N0YXR1c2Jhckl0ZW0uanMnO1xuaW1wb3J0IHsgU3RhdHVzQmFyRm9jdXNlZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBpc01hbmFnZWRIb3ZlclRvb2x0aXBIVE1MRWxlbWVudCwgaXNNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElTdGF0dXNiYXJFbnRyeUNvbnRhaW5lciBleHRlbmRzIElEaXNwb3NhYmxlIHtcblxuXHQvKipcblx0ICogQW4gZXZlbnQgdGhhdCBpcyB0cmlnZ2VyZWQgd2hlbiBhbiBlbnRyeSdzIHZpc2liaWxpdHkgaXMgY2hhbmdlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5OiBFdmVudDx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW4gfT47XG5cblx0LyoqXG5cdCAqIEFkZHMgYW4gZW50cnkgdG8gdGhlIHN0YXR1c2JhciB3aXRoIHRoZSBnaXZlbiBhbGlnbm1lbnQgYW5kIHByaW9yaXR5LiBVc2UgdGhlIHJldHVybmVkIGFjY2Vzc29yXG5cdCAqIHRvIHVwZGF0ZSBvciByZW1vdmUgdGhlIHN0YXR1c2JhciBlbnRyeS5cblx0ICpcblx0ICogQHBhcmFtIGlkIGlkZW50aWZpZXIgb2YgdGhlIGVudHJ5IGlzIG5lZWRlZCB0byBhbGxvdyB1c2VycyB0byBoaWRlIGVudHJpZXMgdmlhIHNldHRpbmdzXG5cdCAqIEBwYXJhbSBhbGlnbm1lbnQgZWl0aGVyIExFRlQgb3IgUklHSFQgc2lkZSBpbiB0aGUgc3RhdHVzIGJhclxuXHQgKiBAcGFyYW0gcHJpb3JpdHkgaXRlbXMgZ2V0IGFycmFuZ2VkIGZyb20gaGlnaGVzdCBwcmlvcml0eSB0byBsb3dlc3QgcHJpb3JpdHkgZnJvbSBsZWZ0IHRvIHJpZ2h0XG5cdCAqIGluIHRoZWlyIHJlc3BlY3RpdmUgYWxpZ25tZW50IHNsb3Rcblx0ICovXG5cdGFkZEVudHJ5KGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eT86IG51bWJlciB8IElTdGF0dXNiYXJFbnRyeVByaW9yaXR5KTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3I7XG5cdGFkZEVudHJ5KGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eT86IG51bWJlciB8IElTdGF0dXNiYXJFbnRyeVByaW9yaXR5IHwgSVN0YXR1c2JhckVudHJ5TG9jYXRpb24pOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvcjtcblxuXHQvKipcblx0ICogQWRkcyBhbiBlbnRyeSB0byB0aGUgc3RhdHVzYmFyIHdpdGggdGhlIGdpdmVuIGFsaWdubWVudCByZWxhdGl2ZSB0byBhbm90aGVyIGVudHJ5LiBVc2UgdGhlIHJldHVybmVkXG5cdCAqIGFjY2Vzc29yIHRvIHVwZGF0ZSBvciByZW1vdmUgdGhlIHN0YXR1c2JhciBlbnRyeS5cblx0ICpcblx0ICogQHBhcmFtIGlkIGlkZW50aWZpZXIgb2YgdGhlIGVudHJ5IGlzIG5lZWRlZCB0byBhbGxvdyB1c2VycyB0byBoaWRlIGVudHJpZXMgdmlhIHNldHRpbmdzXG5cdCAqIEBwYXJhbSBhbGlnbm1lbnQgZWl0aGVyIExFRlQgb3IgUklHSFQgc2lkZSBpbiB0aGUgc3RhdHVzIGJhclxuXHQgKiBAcGFyYW0gbG9jYXRpb24gYSByZWZlcmVuY2UgdG8gYW5vdGhlciBlbnRyeSB0byBwb3NpdGlvbiByZWxhdGl2ZSB0b1xuXHQgKi9cblx0YWRkRW50cnkoZW50cnk6IElTdGF0dXNiYXJFbnRyeSwgaWQ6IHN0cmluZywgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQsIGxvY2F0aW9uPzogSVN0YXR1c2JhckVudHJ5TG9jYXRpb24pOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvcjtcblxuXHQvKipcblx0ICogUmV0dXJuIGlmIGFuIGVudHJ5IGlzIHZpc2libGUgb3Igbm90LlxuXHQgKi9cblx0aXNFbnRyeVZpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEFsbG93cyB0byB1cGRhdGUgYW4gZW50cnkncyB2aXNpYmlsaXR5IHdpdGggdGhlIHByb3ZpZGVkIElELlxuXHQgKi9cblx0dXBkYXRlRW50cnlWaXNpYmlsaXR5KGlkOiBzdHJpbmcsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBBbGxvd3MgdG8gb3ZlcnJpZGUgdGhlIGFwcGVhcmFuY2Ugb2YgYW4gZW50cnkgd2l0aCB0aGUgcHJvdmlkZWQgSUQuXG5cdCAqL1xuXHRvdmVycmlkZUVudHJ5KGlkOiBzdHJpbmcsIG92ZXJyaWRlOiBQYXJ0aWFsPElTdGF0dXNiYXJFbnRyeT4pOiBJRGlzcG9zYWJsZTtcblxuXHQvKipcblx0ICogRm9jdXNlZCB0aGUgc3RhdHVzIGJhci4gSWYgb25lIG9mIHRoZSBzdGF0dXMgYmFyIGVudHJpZXMgd2FzIGZvY3VzZWQsIGZvY3VzZXMgaXQgZGlyZWN0bHkuXG5cdCAqL1xuXHRmb2N1cyhwcmVzZXJ2ZUVudHJ5Rm9jdXM/OiBib29sZWFuKTogdm9pZDtcblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgbmV4dCBzdGF0dXMgYmFyIGVudHJ5LiBJZiBub25lIGZvY3VzZWQsIGZvY3VzZXMgdGhlIGZpcnN0LlxuXHQgKi9cblx0Zm9jdXNOZXh0RW50cnkoKTogdm9pZDtcblxuXHQvKipcblx0ICogRm9jdXNlcyB0aGUgcHJldmlvdXMgc3RhdHVzIGJhciBlbnRyeS4gSWYgbm9uZSBmb2N1c2VkLCBmb2N1c2VzIHRoZSBsYXN0LlxuXHQgKi9cblx0Zm9jdXNQcmV2aW91c0VudHJ5KCk6IHZvaWQ7XG5cblx0LyoqXG5cdCAqXHRSZXR1cm5zIHRydWUgaWYgYSBzdGF0dXMgYmFyIGVudHJ5IGlzIGZvY3VzZWQuXG5cdCAqL1xuXHRpc0VudHJ5Rm9jdXNlZCgpOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUZW1wb3JhcmlseSBvdmVycmlkZSBzdGF0dXNiYXIgc3R5bGUuXG5cdCAqL1xuXHRvdmVycmlkZVN0eWxlKHN0eWxlOiBJU3RhdHVzYmFyU3R5bGVPdmVycmlkZSk6IElEaXNwb3NhYmxlO1xufVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdTdGF0dXNiYXJFbnRyeSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50O1xuXHRyZWFkb25seSBwcmlvcml0eTogSVN0YXR1c2JhckVudHJ5UHJpb3JpdHk7XG5cblx0ZW50cnk6IElTdGF0dXNiYXJFbnRyeTtcblx0YWNjZXNzb3I/OiBJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcjtcbn1cblxuY2xhc3MgU3RhdHVzYmFyUGFydCBleHRlbmRzIFBhcnQgaW1wbGVtZW50cyBJU3RhdHVzYmFyRW50cnlDb250YWluZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBIRUlHSFQgPSAyMjtcblxuXHQvKipcblx0ICogVmVydGljYWwgcGFkZGluZyByZXNlcnZlZCBhcm91bmQgdGhlIG1haW4gc3RhdHVzIGJhciB1bmRlciB0aGUgZmxvYXRpbmcgcGFuZWxzXG5cdCAqIGV4cGVyaW1lbnQgc28gaXRzIGl0ZW1zIHJlbWFpbiBjZW50ZXJlZC4gVGhlIHBhcnQgZ3Jvd3MgYnkgdGhpcyBhbW91bnQgYW5kXG5cdCAqIHRoZSBtYXRjaGluZyBwYWRkaW5nIGlzIGFwcGxpZWQgaW4gYGZsb2F0aW5nUGFuZWxzLmNzc2AuXG5cdCAqL1xuXHRzdGF0aWMgcmVhZG9ubHkgRkxPQVRJTkdfQk9UVE9NX1BBRERJTkcgPSAxMDtcblxuXHQvLyNyZWdpb24gSVZpZXdcblxuXHRwcml2YXRlIGdldCBmbG9hdGluZ0JvdHRvbVBhZGRpbmcoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRJZCgpID09PSBQYXJ0cy5TVEFUVVNCQVJfUEFSVCAmJiB0aGlzLmxheW91dFNlcnZpY2UuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSA/IFN0YXR1c2JhclBhcnQuRkxPQVRJTkdfQk9UVE9NX1BBRERJTkcgOiAwO1xuXHR9XG5cblx0cmVhZG9ubHkgbWluaW11bVdpZHRoOiBudW1iZXIgPSAwO1xuXHRyZWFkb25seSBtYXhpbXVtV2lkdGg6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0Z2V0IG1pbmltdW1IZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIFN0YXR1c2JhclBhcnQuSEVJR0hUICsgdGhpcy5mbG9hdGluZ0JvdHRvbVBhZGRpbmc7IH1cblx0Z2V0IG1heGltdW1IZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIFN0YXR1c2JhclBhcnQuSEVJR0hUICsgdGhpcy5mbG9hdGluZ0JvdHRvbVBhZGRpbmc7IH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIHN0eWxlRWxlbWVudDogSFRNTFN0eWxlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHBlbmRpbmdFbnRyaWVzOiBJUGVuZGluZ1N0YXR1c2JhckVudHJ5W10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHZpZXdNb2RlbDogU3RhdHVzYmFyVmlld01vZGVsO1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5OiBFdmVudDx7IGlkOiBzdHJpbmc7IHZpc2libGU6IGJvb2xlYW4gfT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsRGlzcG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxEaXNwb3NlID0gdGhpcy5fb25XaWxsRGlzcG9zZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkT3ZlcnJpZGVFbnRyeSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW50cnlPdmVycmlkZXMgPSBuZXcgTWFwPHN0cmluZywgUGFydGlhbDxJU3RhdHVzYmFyRW50cnk+PigpO1xuXG5cdHByaXZhdGUgbGVmdEl0ZW1zQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByaWdodEl0ZW1zQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU6IFdvcmtiZW5jaEhvdmVyRGVsZWdhdGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb21wYWN0RW50cmllc0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8RGlzcG9zYWJsZVN0b3JlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBzdHlsZU92ZXJyaWRlcyA9IG5ldyBTZXQ8SVN0YXR1c2JhclN0eWxlT3ZlcnJpZGU+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaWQsIHsgaGFzVGl0bGU6IGZhbHNlIH0sIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy52aWV3TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3RhdHVzYmFyVmlld01vZGVsKHN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZUVudHJ5VmlzaWJpbGl0eSA9IHRoaXMudmlld01vZGVsLm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5O1xuXG5cdFx0dGhpcy5ob3ZlckRlbGVnYXRlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrYmVuY2hIb3ZlckRlbGVnYXRlLCAnZWxlbWVudCcsIHtcblx0XHRcdGluc3RhbnRIb3ZlcjogdHJ1ZSxcblx0XHRcdGR5bmFtaWNEZWxheShjb250ZW50KSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0eXBlb2YgY29udGVudCA9PT0gJ2Z1bmN0aW9uJyB8fFxuXHRcdFx0XHRcdGlzSFRNTEVsZW1lbnQoY29udGVudCkgfHxcblx0XHRcdFx0XHQoaXNNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcoY29udGVudCkgJiYgdHlwZW9mIGNvbnRlbnQubWFya2Rvd24gPT09ICdmdW5jdGlvbicpIHx8XG5cdFx0XHRcdFx0aXNNYW5hZ2VkSG92ZXJUb29sdGlwSFRNTEVsZW1lbnQoY29udGVudClcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Ly8gb3ZlcnJpZGUgdGhlIGRlbGF5IGZvciBjb250ZW50IHRoYXQgaXMgcmljaCAoZS5nLiBodG1sIG9yIGxvbmcgcnVubmluZylcblx0XHRcdFx0XHQvLyBzbyB0aGF0IGl0IGFwcGVhcnMgbW9yZSBpbnN0YW50bHkuIHRoZXNlIGhvdmVycyBjYXJyeSBtb3JlIGltcG9ydGFudFxuXHRcdFx0XHRcdC8vIGluZm9ybWF0aW9uIGFuZCBzaG91bGQgbm90IGJlIGRlbGF5ZWQgYnkgcHJlZmVyZW5jZS5cblx0XHRcdFx0XHRyZXR1cm4gNTAwO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LCAoXywgZm9jdXM/OiBib29sZWFuKSA9PiAoXG5cdFx0XHR7XG5cdFx0XHRcdHBlcnNpc3RlbmNlOiB7XG5cdFx0XHRcdFx0aGlkZU9uS2V5RG93bjogdHJ1ZSxcblx0XHRcdFx0XHRzdGlja3k6IGZvY3VzXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFwcGVhcmFuY2U6IHtcblx0XHRcdFx0XHRtYXhIZWlnaHRSYXRpbzogMC45XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpKSk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Ly8gRW50cnkgdmlzaWJpbGl0eSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUVudHJ5VmlzaWJpbGl0eSgoKSA9PiB0aGlzLnVwZGF0ZUNvbXBhY3RFbnRyaWVzKCkpKTtcblxuXHRcdC8vIFdvcmtiZW5jaCBzdGF0ZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMudXBkYXRlU3R5bGVzKCkpKTtcblxuXHRcdC8vIEZsb2F0aW5nIHBhbmVscyBjaGFuZ2VzIHRoZSByZXNlcnZlZCBib3R0b20gcGFkZGluZyAoYW5kIHRoZXJlZm9yZSB0aGVcblx0XHQvLyBwYXJ0IGhlaWdodCkgZm9yIHRoZSBtYWluIHN0YXR1cyBiYXIgb25seTogc2lnbmFsIHRoZSBncmlkIHRoYXQgdGhlIHNpemVcblx0XHQvLyBjb25zdHJhaW50IGNoYW5nZWQuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAodGhpcy5nZXRJZCgpID09PSBQYXJ0cy5TVEFUVVNCQVJfUEFSVCAmJiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLk1PREVSTl9VSSkpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlRW50cnkoaWQ6IHN0cmluZywgb3ZlcnJpZGU6IFBhcnRpYWw8SVN0YXR1c2JhckVudHJ5Pik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLmVudHJ5T3ZlcnJpZGVzLnNldChpZCwgb3ZlcnJpZGUpO1xuXHRcdHRoaXMub25EaWRPdmVycmlkZUVudHJ5LmZpcmUoaWQpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50T3ZlcnJpZGUgPSB0aGlzLmVudHJ5T3ZlcnJpZGVzLmdldChpZCk7XG5cdFx0XHRpZiAoY3VycmVudE92ZXJyaWRlID09PSBvdmVycmlkZSkge1xuXHRcdFx0XHR0aGlzLmVudHJ5T3ZlcnJpZGVzLmRlbGV0ZShpZCk7XG5cdFx0XHRcdHRoaXMub25EaWRPdmVycmlkZUVudHJ5LmZpcmUoaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoRW50cnlPdmVycmlkZShlbnRyeTogSVN0YXR1c2JhckVudHJ5LCBpZDogc3RyaW5nKTogSVN0YXR1c2JhckVudHJ5IHtcblx0XHRjb25zdCBvdmVycmlkZSA9IHRoaXMuZW50cnlPdmVycmlkZXMuZ2V0KGlkKTtcblx0XHRpZiAob3ZlcnJpZGUpIHtcblx0XHRcdGVudHJ5ID0geyAuLi5lbnRyeSwgLi4ub3ZlcnJpZGUgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRhZGRFbnRyeShlbnRyeTogSVN0YXR1c2JhckVudHJ5LCBpZDogc3RyaW5nLCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudCwgcHJpb3JpdHlPckxvY2F0aW9uOiBudW1iZXIgfCBJU3RhdHVzYmFyRW50cnlMb2NhdGlvbiB8IElTdGF0dXNiYXJFbnRyeVByaW9yaXR5ID0gMCk6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHtcblx0XHRsZXQgcHJpb3JpdHk6IElTdGF0dXNiYXJFbnRyeVByaW9yaXR5O1xuXHRcdGlmIChpc1N0YXR1c2JhckVudHJ5UHJpb3JpdHkocHJpb3JpdHlPckxvY2F0aW9uKSkge1xuXHRcdFx0cHJpb3JpdHkgPSBwcmlvcml0eU9yTG9jYXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByaW9yaXR5ID0ge1xuXHRcdFx0XHRwcmltYXJ5OiBwcmlvcml0eU9yTG9jYXRpb24sXG5cdFx0XHRcdHNlY29uZGFyeTogaGFzaChpZCkgLy8gZGVyaXZlIGZyb20gaWRlbnRpZmllciB0byBhY2NvbXBsaXNoIHVuaXF1ZW5lc3Ncblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQXMgbG9uZyBhcyB3ZSBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgaW50byBhIGNvbnRhaW5lciB5ZXQsIHJlY29yZCBhbGwgZW50cmllc1xuXHRcdC8vIHRoYXQgYXJlIHBlbmRpbmcgc28gdGhhdCB0aGV5IGNhbiBnZXQgY3JlYXRlZCBhdCBhIGxhdGVyIHBvaW50XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvQWRkUGVuZGluZ0VudHJ5KGVudHJ5LCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eSk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGFkZCB0byB2aWV3XG5cdFx0cmV0dXJuIHRoaXMuZG9BZGRFbnRyeShlbnRyeSwgaWQsIGFsaWdubWVudCwgcHJpb3JpdHkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FkZFBlbmRpbmdFbnRyeShlbnRyeTogSVN0YXR1c2JhckVudHJ5LCBpZDogc3RyaW5nLCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudCwgcHJpb3JpdHk6IElTdGF0dXNiYXJFbnRyeVByaW9yaXR5KTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3Ige1xuXHRcdGNvbnN0IHBlbmRpbmdFbnRyeTogSVBlbmRpbmdTdGF0dXNiYXJFbnRyeSA9IHsgZW50cnksIGlkLCBhbGlnbm1lbnQsIHByaW9yaXR5IH07XG5cdFx0dGhpcy5wZW5kaW5nRW50cmllcy5wdXNoKHBlbmRpbmdFbnRyeSk7XG5cblx0XHRjb25zdCBhY2Nlc3NvcjogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IgPSB7XG5cdFx0XHR1cGRhdGU6IChlbnRyeTogSVN0YXR1c2JhckVudHJ5KSA9PiB7XG5cdFx0XHRcdGlmIChwZW5kaW5nRW50cnkuYWNjZXNzb3IpIHtcblx0XHRcdFx0XHRwZW5kaW5nRW50cnkuYWNjZXNzb3IudXBkYXRlKGVudHJ5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRwZW5kaW5nRW50cnkuZW50cnkgPSBlbnRyeTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAocGVuZGluZ0VudHJ5LmFjY2Vzc29yKSB7XG5cdFx0XHRcdFx0cGVuZGluZ0VudHJ5LmFjY2Vzc29yLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnBlbmRpbmdFbnRyaWVzID0gdGhpcy5wZW5kaW5nRW50cmllcy5maWx0ZXIoZW50cnkgPT4gZW50cnkgIT09IHBlbmRpbmdFbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmV0dXJuIGFjY2Vzc29yO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FkZEVudHJ5KGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eTogSVN0YXR1c2JhckVudHJ5UHJpb3JpdHkpOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBWaWV3IG1vZGVsIGl0ZW1cblx0XHRjb25zdCBpdGVtQ29udGFpbmVyID0gdGhpcy5kb0NyZWF0ZVN0YXR1c0l0ZW0oaWQsIGFsaWdubWVudCk7XG5cdFx0Y29uc3QgaXRlbSA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0YXR1c2JhckVudHJ5SXRlbSwgaXRlbUNvbnRhaW5lciwgdGhpcy53aXRoRW50cnlPdmVycmlkZShlbnRyeSwgaWQpLCB0aGlzLmhvdmVyRGVsZWdhdGUpKTtcblxuXHRcdC8vIFZpZXcgbW9kZWwgZW50cnlcblx0XHRjb25zdCB2aWV3TW9kZWxFbnRyeTogSVN0YXR1c2JhclZpZXdNb2RlbEVudHJ5ID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVN0YXR1c2JhclZpZXdNb2RlbEVudHJ5IHtcblx0XHRcdHJlYWRvbmx5IGlkID0gaWQ7XG5cdFx0XHRyZWFkb25seSBleHRlbnNpb25JZCA9IGVudHJ5LmV4dGVuc2lvbklkO1xuXHRcdFx0cmVhZG9ubHkgYWxpZ25tZW50ID0gYWxpZ25tZW50O1xuXHRcdFx0cmVhZG9ubHkgcHJpb3JpdHkgPSBwcmlvcml0eTtcblx0XHRcdHJlYWRvbmx5IGNvbnRhaW5lciA9IGl0ZW1Db250YWluZXI7XG5cdFx0XHRyZWFkb25seSBsYWJlbENvbnRhaW5lciA9IGl0ZW0ubGFiZWxDb250YWluZXI7XG5cblx0XHRcdGdldCBuYW1lKCkgeyByZXR1cm4gaXRlbS5uYW1lOyB9XG5cdFx0XHRnZXQgaGFzQ29tbWFuZCgpIHsgcmV0dXJuIGl0ZW0uaGFzQ29tbWFuZDsgfVxuXHRcdH07XG5cblx0XHQvLyBBZGQgdG8gdmlldyBtb2RlbFxuXHRcdGNvbnN0IHsgbmVlZHNGdWxsUmVmcmVzaCB9ID0gdGhpcy5kb0FkZE9yUmVtb3ZlTW9kZWxFbnRyeSh2aWV3TW9kZWxFbnRyeSwgdHJ1ZSk7XG5cdFx0aWYgKG5lZWRzRnVsbFJlZnJlc2gpIHtcblx0XHRcdHRoaXMuYXBwZW5kU3RhdHVzYmFyRW50cmllcygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFwcGVuZFN0YXR1c2JhckVudHJ5KHZpZXdNb2RlbEVudHJ5KTtcblx0XHR9XG5cblx0XHRsZXQgbGFzdEVudHJ5ID0gZW50cnk7XG5cdFx0Y29uc3QgYWNjZXNzb3I6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yID0ge1xuXHRcdFx0dXBkYXRlOiBlbnRyeSA9PiB7XG5cdFx0XHRcdGxhc3RFbnRyeSA9IGVudHJ5O1xuXHRcdFx0XHRpdGVtLnVwZGF0ZSh0aGlzLndpdGhFbnRyeU92ZXJyaWRlKGVudHJ5LCBpZCkpO1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgeyBuZWVkc0Z1bGxSZWZyZXNoIH0gPSB0aGlzLmRvQWRkT3JSZW1vdmVNb2RlbEVudHJ5KHZpZXdNb2RlbEVudHJ5LCBmYWxzZSk7XG5cdFx0XHRcdGlmIChuZWVkc0Z1bGxSZWZyZXNoKSB7XG5cdFx0XHRcdFx0dGhpcy5hcHBlbmRTdGF0dXNiYXJFbnRyaWVzKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aXRlbUNvbnRhaW5lci5yZW1vdmUoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbXBhY3RFbnRyaWVzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBSZWFjdCB0byBvdmVycmlkZXNcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZE92ZXJyaWRlRW50cnkuZXZlbnQob3ZlcnJpZGVFbnRyeUlkID0+IHtcblx0XHRcdGlmIChvdmVycmlkZUVudHJ5SWQgPT09IGlkKSB7XG5cdFx0XHRcdGFjY2Vzc29yLnVwZGF0ZShsYXN0RW50cnkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBhY2Nlc3Nvcjtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVTdGF0dXNJdGVtKGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCAuLi5leHRyYUNsYXNzZXM6IHN0cmluZ1tdKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IGl0ZW1Db250YWluZXIgPSAkKCcuc3RhdHVzYmFyLWl0ZW0nLCB7IGlkIH0pO1xuXG5cdFx0aWYgKGV4dHJhQ2xhc3Nlcykge1xuXHRcdFx0aXRlbUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKC4uLmV4dHJhQ2xhc3Nlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKGFsaWdubWVudCA9PT0gU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUKSB7XG5cdFx0XHRpdGVtQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3JpZ2h0Jyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGl0ZW1Db250YWluZXIuY2xhc3NMaXN0LmFkZCgnbGVmdCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtQ29udGFpbmVyO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FkZE9yUmVtb3ZlTW9kZWxFbnRyeShlbnRyeTogSVN0YXR1c2JhclZpZXdNb2RlbEVudHJ5LCBhZGQ6IGJvb2xlYW4pIHtcblxuXHRcdC8vIFVwZGF0ZSBtb2RlbCBidXQgcmVtZW1iZXIgcHJldmlvdXMgZW50cmllc1xuXHRcdGNvbnN0IGVudHJpZXNCZWZvcmUgPSB0aGlzLnZpZXdNb2RlbC5lbnRyaWVzO1xuXHRcdGlmIChhZGQpIHtcblx0XHRcdHRoaXMudmlld01vZGVsLmFkZChlbnRyeSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlld01vZGVsLnJlbW92ZShlbnRyeSk7XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJpZXNBZnRlciA9IHRoaXMudmlld01vZGVsLmVudHJpZXM7XG5cblx0XHQvLyBBcHBseSBvcGVyYXRpb24gb250byB0aGUgZW50cmllcyBmcm9tIGJlZm9yZVxuXHRcdGlmIChhZGQpIHtcblx0XHRcdGVudHJpZXNCZWZvcmUuc3BsaWNlKGVudHJpZXNBZnRlci5pbmRleE9mKGVudHJ5KSwgMCwgZW50cnkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbnRyaWVzQmVmb3JlLnNwbGljZShlbnRyaWVzQmVmb3JlLmluZGV4T2YoZW50cnkpLCAxKTtcblx0XHR9XG5cblx0XHQvLyBGaWd1cmUgb3V0IGlmIGEgZnVsbCByZWZyZXNoIGlzIG5lZWRlZCBieSBjb21wYXJpbmcgYXJyYXlzXG5cdFx0Y29uc3QgbmVlZHNGdWxsUmVmcmVzaCA9ICFlcXVhbHMoZW50cmllc0JlZm9yZSwgZW50cmllc0FmdGVyKTtcblxuXHRcdHJldHVybiB7IG5lZWRzRnVsbFJlZnJlc2ggfTtcblx0fVxuXG5cdGlzRW50cnlWaXNpYmxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMudmlld01vZGVsLmlzSGlkZGVuKGlkKTtcblx0fVxuXG5cdHVwZGF0ZUVudHJ5VmlzaWJpbGl0eShpZDogc3RyaW5nLCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHZpc2libGUpIHtcblx0XHRcdHRoaXMudmlld01vZGVsLnNob3coaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5oaWRlKGlkKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c05leHRFbnRyeSgpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlbC5mb2N1c05leHRFbnRyeSgpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91c0VudHJ5KCk6IHZvaWQge1xuXHRcdHRoaXMudmlld01vZGVsLmZvY3VzUHJldmlvdXNFbnRyeSgpO1xuXHR9XG5cblx0aXNFbnRyeUZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMudmlld01vZGVsLmlzRW50cnlGb2N1c2VkKCk7XG5cdH1cblxuXHRmb2N1cyhwcmVzZXJ2ZUVudHJ5Rm9jdXMgPSB0cnVlKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRDb250YWluZXIoKT8uZm9jdXMoKTtcblx0XHRjb25zdCBsYXN0Rm9jdXNlZEVudHJ5ID0gdGhpcy52aWV3TW9kZWwubGFzdEZvY3VzZWRFbnRyeTtcblx0XHRpZiAocHJlc2VydmVFbnRyeUZvY3VzICYmIGxhc3RGb2N1c2VkRW50cnkpIHtcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4gbGFzdEZvY3VzZWRFbnRyeS5sYWJlbENvbnRhaW5lci5mb2N1cygpLCAwKTsgLy8gTmVlZCBhIHRpbWVvdXQsIGZvciBzb21lIHJlYXNvbiB3aXRob3V0IGl0IHRoZSBpbm5lciBsYWJlbCBjb250YWluZXIgd2lsbCBub3QgZ2V0IGZvY3VzZWRcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlQ29udGVudEFyZWEocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLmVsZW1lbnQgPSBwYXJlbnQ7XG5cblx0XHQvLyBUcmFjayBmb2N1cyB3aXRoaW4gY29udGFpbmVyXG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmVsZW1lbnQpKTtcblx0XHRTdGF0dXNCYXJGb2N1c2VkLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KHRydWUpO1xuXG5cdFx0Ly8gTGVmdCBpdGVtcyBjb250YWluZXJcblx0XHR0aGlzLmxlZnRJdGVtc0NvbnRhaW5lciA9ICQoJy5sZWZ0LWl0ZW1zLml0ZW1zLWNvbnRhaW5lcicpO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLmxlZnRJdGVtc0NvbnRhaW5lcik7XG5cdFx0dGhpcy5lbGVtZW50LnRhYkluZGV4ID0gMDtcblxuXHRcdC8vIFJpZ2h0IGl0ZW1zIGNvbnRhaW5lclxuXHRcdHRoaXMucmlnaHRJdGVtc0NvbnRhaW5lciA9ICQoJy5yaWdodC1pdGVtcy5pdGVtcy1jb250YWluZXInKTtcblx0XHR0aGlzLmVsZW1lbnQuYXBwZW5kQ2hpbGQodGhpcy5yaWdodEl0ZW1zQ29udGFpbmVyKTtcblxuXHRcdC8vIENvbnRleHQgbWVudSBzdXBwb3J0XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHBhcmVudCwgRXZlbnRUeXBlLkNPTlRFWFRfTUVOVSwgZSA9PiB0aGlzLnNob3dDb250ZXh0TWVudShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEdlc3R1cmUuYWRkVGFyZ2V0KHBhcmVudCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwYXJlbnQsIFRvdWNoRXZlbnRUeXBlLkNvbnRleHRtZW51LCBlID0+IHRoaXMuc2hvd0NvbnRleHRNZW51KGUpKSk7XG5cblx0XHQvLyBJbml0aWFsIHN0YXR1cyBiYXIgZW50cmllc1xuXHRcdHRoaXMuY3JlYXRlSW5pdGlhbFN0YXR1c2JhckVudHJpZXMoKTtcblxuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUluaXRpYWxTdGF0dXNiYXJFbnRyaWVzKCk6IHZvaWQge1xuXG5cdFx0Ly8gQWRkIGl0ZW1zIGluIG9yZGVyIGFjY29yZGluZyB0byBhbGlnbm1lbnRcblx0XHR0aGlzLmFwcGVuZFN0YXR1c2JhckVudHJpZXMoKTtcblxuXHRcdC8vIEZpbGwgaW4gcGVuZGluZyBlbnRyaWVzIGlmIGFueVxuXHRcdHdoaWxlICh0aGlzLnBlbmRpbmdFbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMucGVuZGluZ0VudHJpZXMuc2hpZnQoKTtcblx0XHRcdGlmIChwZW5kaW5nKSB7XG5cdFx0XHRcdHBlbmRpbmcuYWNjZXNzb3IgPSB0aGlzLmFkZEVudHJ5KHBlbmRpbmcuZW50cnksIHBlbmRpbmcuaWQsIHBlbmRpbmcuYWxpZ25tZW50LCBwZW5kaW5nLnByaW9yaXR5LnByaW1hcnkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kU3RhdHVzYmFyRW50cmllcygpOiB2b2lkIHtcblx0XHRjb25zdCBsZWZ0SXRlbXNDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmxlZnRJdGVtc0NvbnRhaW5lcik7XG5cdFx0Y29uc3QgcmlnaHRJdGVtc0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucmlnaHRJdGVtc0NvbnRhaW5lcik7XG5cblx0XHQvLyBDbGVhciBjb250YWluZXJzXG5cdFx0Y2xlYXJOb2RlKGxlZnRJdGVtc0NvbnRhaW5lcik7XG5cdFx0Y2xlYXJOb2RlKHJpZ2h0SXRlbXNDb250YWluZXIpO1xuXG5cdFx0Ly8gQXBwZW5kIGFsbFxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgW1xuXHRcdFx0Li4udGhpcy52aWV3TW9kZWwuZ2V0RW50cmllcyhTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCksXG5cdFx0XHQuLi50aGlzLnZpZXdNb2RlbC5nZXRFbnRyaWVzKFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCkucmV2ZXJzZSgpIC8vIHJldmVyc2luZyBkdWUgdG8gZmxleDogcm93LXJldmVyc2Vcblx0XHRdKSB7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBlbnRyeS5hbGlnbm1lbnQgPT09IFN0YXR1c2JhckFsaWdubWVudC5MRUZUID8gbGVmdEl0ZW1zQ29udGFpbmVyIDogcmlnaHRJdGVtc0NvbnRhaW5lcjtcblxuXHRcdFx0dGFyZ2V0LmFwcGVuZENoaWxkKGVudHJ5LmNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGNvbXBhY3QgZW50cmllc1xuXHRcdHRoaXMudXBkYXRlQ29tcGFjdEVudHJpZXMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kU3RhdHVzYmFyRW50cnkoZW50cnk6IElTdGF0dXNiYXJWaWV3TW9kZWxFbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLnZpZXdNb2RlbC5nZXRFbnRyaWVzKGVudHJ5LmFsaWdubWVudCk7XG5cblx0XHRpZiAoZW50cnkuYWxpZ25tZW50ID09PSBTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQpIHtcblx0XHRcdGVudHJpZXMucmV2ZXJzZSgpOyAvLyByZXZlcnNpbmcgZHVlIHRvIGZsZXg6IHJvdy1yZXZlcnNlXG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQoZW50cnkuYWxpZ25tZW50ID09PSBTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCA/IHRoaXMubGVmdEl0ZW1zQ29udGFpbmVyIDogdGhpcy5yaWdodEl0ZW1zQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGluZGV4ID0gZW50cmllcy5pbmRleE9mKGVudHJ5KTtcblx0XHRpZiAoaW5kZXggKyAxID09PSBlbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0dGFyZ2V0LmFwcGVuZENoaWxkKGVudHJ5LmNvbnRhaW5lcik7IC8vIGFwcGVuZCBhdCB0aGUgZW5kIGlmIGxhc3Rcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFyZ2V0Lmluc2VydEJlZm9yZShlbnRyeS5jb250YWluZXIsIGVudHJpZXNbaW5kZXggKyAxXS5jb250YWluZXIpOyAvLyBpbnNlcnQgYmVmb3JlIG5leHQgZWxlbWVudCBvdGhlcndpc2Vcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29tcGFjdCBlbnRyaWVzXG5cdFx0dGhpcy51cGRhdGVDb21wYWN0RW50cmllcygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21wYWN0RW50cmllcygpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyaWVzID0gdGhpcy52aWV3TW9kZWwuZW50cmllcztcblxuXHRcdC8vIEZpbmQgdmlzaWJsZSBlbnRyaWVzIGFuZCBjbGVhciBjb21wYWN0IHJlbGF0ZWQgQ1NTIGNsYXNzZXMgaWYgYW55XG5cdFx0Y29uc3QgbWFwSWRUb1Zpc2libGVFbnRyeSA9IG5ldyBNYXA8c3RyaW5nLCBJU3RhdHVzYmFyVmlld01vZGVsRW50cnk+KCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRpZiAoIXRoaXMudmlld01vZGVsLmlzSGlkZGVuKGVudHJ5LmlkKSkge1xuXHRcdFx0XHRtYXBJZFRvVmlzaWJsZUVudHJ5LnNldChlbnRyeS5pZCwgZW50cnkpO1xuXHRcdFx0fVxuXG5cdFx0XHRlbnRyeS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY29tcGFjdC1sZWZ0JywgJ2NvbXBhY3QtcmlnaHQnKTtcblx0XHR9XG5cblx0XHQvLyBGaWd1cmUgb3V0IGdyb3VwcyBvZiBlbnRyaWVzIHdpdGggYGNvbXBhY3RgIGFsaWdubWVudFxuXHRcdGNvbnN0IGNvbXBhY3RFbnRyeUdyb3VwcyA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBJU3RhdHVzYmFyVmlld01vZGVsRW50cnk+PigpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgbWFwSWRUb1Zpc2libGVFbnRyeS52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRpc1N0YXR1c2JhckVudHJ5TG9jYXRpb24oZW50cnkucHJpb3JpdHkucHJpbWFyeSkgJiYgLy8gZW50cnkgcmVmZXJlbmNlcyBhbm90aGVyIGVudHJ5IGFzIGxvY2F0aW9uXG5cdFx0XHRcdGVudHJ5LnByaW9yaXR5LnByaW1hcnkuY29tcGFjdFx0XHRcdFx0XHRcdC8vIGVudHJ5IHdhbnRzIHRvIGJlIGNvbXBhY3Rcblx0XHRcdCkge1xuXHRcdFx0XHRjb25zdCBsb2NhdGlvbklkID0gZW50cnkucHJpb3JpdHkucHJpbWFyeS5sb2NhdGlvbi5pZDtcblx0XHRcdFx0Y29uc3QgbG9jYXRpb24gPSBtYXBJZFRvVmlzaWJsZUVudHJ5LmdldChsb2NhdGlvbklkKTtcblx0XHRcdFx0aWYgKCFsb2NhdGlvbikge1xuXHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBza2lwIGlmIGxvY2F0aW9uIGRvZXMgbm90IGV4aXN0XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBCdWlsZCBhIG1hcCBvZiBlbnRyaWVzIHRoYXQgYXJlIGNvbXBhY3QgYW1vbmcgZWFjaCBvdGhlclxuXHRcdFx0XHRsZXQgY29tcGFjdEVudHJ5R3JvdXAgPSBjb21wYWN0RW50cnlHcm91cHMuZ2V0KGxvY2F0aW9uSWQpO1xuXHRcdFx0XHRpZiAoIWNvbXBhY3RFbnRyeUdyb3VwKSB7XG5cblx0XHRcdFx0XHQvLyBJdCBpcyBwb3NzaWJsZSB0aGF0IHRoaXMgZW50cnkgcmVmZXJlbmNlcyBhbm90aGVyIGVudHJ5XG5cdFx0XHRcdFx0Ly8gdGhhdCBpdHNlbGYgcmVmZXJlbmNlcyBhbiBlbnRyeS4gSW4gdGhhdCBjYXNlLCB3ZSB3YW50XG5cdFx0XHRcdFx0Ly8gdG8gYWRkIGl0IHRvIHRoZSBlbnRyaWVzIG9mIHRoZSByZWZlcmVuY2VkIGVudHJ5LlxuXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBjb21wYWN0RW50cnlHcm91cHMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRcdGlmIChncm91cC5oYXMobG9jYXRpb25JZCkpIHtcblx0XHRcdFx0XHRcdFx0Y29tcGFjdEVudHJ5R3JvdXAgPSBncm91cDtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKCFjb21wYWN0RW50cnlHcm91cCkge1xuXHRcdFx0XHRcdFx0Y29tcGFjdEVudHJ5R3JvdXAgPSBuZXcgTWFwPHN0cmluZywgSVN0YXR1c2JhclZpZXdNb2RlbEVudHJ5PigpO1xuXHRcdFx0XHRcdFx0Y29tcGFjdEVudHJ5R3JvdXBzLnNldChsb2NhdGlvbklkLCBjb21wYWN0RW50cnlHcm91cCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbXBhY3RFbnRyeUdyb3VwLnNldChlbnRyeS5pZCwgZW50cnkpO1xuXHRcdFx0XHRjb21wYWN0RW50cnlHcm91cC5zZXQobG9jYXRpb24uaWQsIGxvY2F0aW9uKTtcblxuXHRcdFx0XHQvLyBBZGp1c3QgQ1NTIGNsYXNzZXMgdG8gbW92ZSBjb21wYWN0IGl0ZW1zIGNsb3NlciB0b2dldGhlclxuXHRcdFx0XHRpZiAoZW50cnkucHJpb3JpdHkucHJpbWFyeS5hbGlnbm1lbnQgPT09IFN0YXR1c2JhckFsaWdubWVudC5MRUZUKSB7XG5cdFx0XHRcdFx0bG9jYXRpb24uY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbXBhY3QtbGVmdCcpO1xuXHRcdFx0XHRcdGVudHJ5LmNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjb21wYWN0LXJpZ2h0Jyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bG9jYXRpb24uY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2NvbXBhY3QtcmlnaHQnKTtcblx0XHRcdFx0XHRlbnRyeS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnY29tcGFjdC1sZWZ0Jyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJbnN0YWxsIG1vdXNlIGxpc3RlbmVycyB0byB1cGRhdGUgaG92ZXIgZmVlZGJhY2sgZm9yXG5cdFx0Ly8gYWxsIGNvbXBhY3QgZW50cmllcyB0aGF0IGJlbG9uZyB0byBlYWNoIG90aGVyXG5cdFx0Y29uc3Qgc3RhdHVzQmFySXRlbUhvdmVyQmFja2dyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoU1RBVFVTX0JBUl9JVEVNX0hPVkVSX0JBQ0tHUk9VTkQpO1xuXHRcdGNvbnN0IHN0YXR1c0Jhckl0ZW1Db21wYWN0SG92ZXJCYWNrZ3JvdW5kID0gdGhpcy5nZXRDb2xvcihTVEFUVVNfQkFSX0lURU1fQ09NUEFDVF9IT1ZFUl9CQUNLR1JPVU5EKTtcblx0XHR0aGlzLmNvbXBhY3RFbnRyaWVzRGlzcG9zYWJsZS52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpZiAoc3RhdHVzQmFySXRlbUhvdmVyQmFja2dyb3VuZCAmJiBzdGF0dXNCYXJJdGVtQ29tcGFjdEhvdmVyQmFja2dyb3VuZCAmJiAhaXNIaWdoQ29udHJhc3QodGhpcy50aGVtZS50eXBlKSkge1xuXHRcdFx0Zm9yIChjb25zdCBbLCBjb21wYWN0RW50cnlHcm91cF0gb2YgY29tcGFjdEVudHJ5R3JvdXBzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY29tcGFjdEVudHJ5IG9mIGNvbXBhY3RFbnRyeUdyb3VwLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0aWYgKCFjb21wYWN0RW50cnkuaGFzQ29tbWFuZCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7IC8vIG9ubHkgc2hvdyBob3ZlciBmZWVkYmFjayB3aGVuIHdlIGhhdmUgYSBjb21tYW5kXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dGhpcy5jb21wYWN0RW50cmllc0Rpc3Bvc2FibGUudmFsdWUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb21wYWN0RW50cnkubGFiZWxDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9PVkVSLCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb21wYWN0RW50cnlHcm91cC5mb3JFYWNoKGNvbXBhY3RFbnRyeSA9PiBjb21wYWN0RW50cnkubGFiZWxDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gc3RhdHVzQmFySXRlbUhvdmVyQmFja2dyb3VuZCk7XG5cdFx0XHRcdFx0XHRjb21wYWN0RW50cnkubGFiZWxDb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gc3RhdHVzQmFySXRlbUNvbXBhY3RIb3ZlckJhY2tncm91bmQ7XG5cdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0dGhpcy5jb21wYWN0RW50cmllc0Rpc3Bvc2FibGUudmFsdWUuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb21wYWN0RW50cnkubGFiZWxDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9PVVQsICgpID0+IHtcblx0XHRcdFx0XHRcdGNvbXBhY3RFbnRyeUdyb3VwLmZvckVhY2goY29tcGFjdEVudHJ5ID0+IGNvbXBhY3RFbnRyeS5sYWJlbENvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAnJyk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93Q29udGV4dE1lbnUoZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCk6IHZvaWQge1xuXHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQoZ2V0V2luZG93KHRoaXMuZWxlbWVudCksIGUpO1xuXG5cdFx0bGV0IGFjdGlvbnM6IElBY3Rpb25bXSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0YWN0aW9ucyA9IHRoaXMuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKGV2ZW50KTtcblxuXHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6ICgpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbnMpIHtcblx0XHRcdFx0XHRkaXNwb3NlSWZEaXNwb3NhYmxlKGFjdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRleHRNZW51QWN0aW9ucyhldmVudDogU3RhbmRhcmRNb3VzZUV2ZW50KTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdC8vIFByb3ZpZGUgYW4gYWN0aW9uIHRvIGhpZGUgdGhlIHN0YXR1cyBiYXIgYXQgbGFzdFxuXHRcdGFjdGlvbnMucHVzaCh0b0FjdGlvbih7IGlkOiBUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uLklELCBsYWJlbDogbG9jYWxpemUoJ2hpZGVTdGF0dXNCYXInLCBcIkhpZGUgU3RhdHVzIEJhclwiKSwgcnVuOiAoKSA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IG5ldyBUb2dnbGVTdGF0dXNiYXJWaXNpYmlsaXR5QWN0aW9uKCkucnVuKGFjY2Vzc29yKSkgfSkpO1xuXHRcdGFjdGlvbnMucHVzaChuZXcgU2VwYXJhdG9yKCkpO1xuXG5cdFx0Ly8gU2hvdyBhbiBlbnRyeSBwZXIga25vd24gc3RhdHVzIGVudHJ5XG5cdFx0Ly8gTm90ZTogZXZlbiB0aG91Z2ggZW50cmllcyBoYXZlIGFuIGlkZW50aWZpZXIsIHRoZXJlIGNhbiBiZSBtdWx0aXBsZSBlbnRyaWVzXG5cdFx0Ly8gaGF2aW5nIHRoZSBzYW1lIGlkZW50aWZpZXIgKGUuZy4gZnJvbSBleHRlbnNpb25zKS4gU28gd2UgbWFrZSBzdXJlIHRvIG9ubHlcblx0XHQvLyBzaG93IGEgc2luZ2xlIGVudHJ5IHBlciBpZGVudGlmaWVyIHdlIGhhbmRsZWQuXG5cdFx0Y29uc3QgaGFuZGxlZEVudHJpZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMudmlld01vZGVsLmVudHJpZXMpIHtcblx0XHRcdGlmICghaGFuZGxlZEVudHJpZXMuaGFzKGVudHJ5LmlkKSkge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2gobmV3IFRvZ2dsZVN0YXR1c2JhckVudHJ5VmlzaWJpbGl0eUFjdGlvbihlbnRyeS5pZCwgZW50cnkubmFtZSwgdGhpcy52aWV3TW9kZWwpKTtcblx0XHRcdFx0aGFuZGxlZEVudHJpZXMuYWRkKGVudHJ5LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaWd1cmUgb3V0IGlmIG1vdXNlIGlzIG92ZXIgYW4gZW50cnlcblx0XHRsZXQgc3RhdHVzRW50cnlVbmRlck1vdXNlOiBJU3RhdHVzYmFyVmlld01vZGVsRW50cnkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChsZXQgZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gZXZlbnQudGFyZ2V0OyBlbGVtZW50OyBlbGVtZW50ID0gZWxlbWVudC5wYXJlbnRFbGVtZW50KSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMudmlld01vZGVsLmZpbmRFbnRyeShlbGVtZW50KTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRzdGF0dXNFbnRyeVVuZGVyTW91c2UgPSBlbnRyeTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXR1c0VudHJ5VW5kZXJNb3VzZSkge1xuXHRcdFx0YWN0aW9ucy5wdXNoKG5ldyBTZXBhcmF0b3IoKSk7XG5cdFx0XHRpZiAoc3RhdHVzRW50cnlVbmRlck1vdXNlLmV4dGVuc2lvbklkKSB7XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hbmFnZUV4dGVuc2lvbkFjdGlvbiwgc3RhdHVzRW50cnlVbmRlck1vdXNlLmV4dGVuc2lvbklkKSk7XG5cdFx0XHR9XG5cdFx0XHRhY3Rpb25zLnB1c2gobmV3IEhpZGVTdGF0dXNiYXJFbnRyeUFjdGlvbihzdGF0dXNFbnRyeVVuZGVyTW91c2UuaWQsIHN0YXR1c0VudHJ5VW5kZXJNb3VzZS5uYW1lLCB0aGlzLnZpZXdNb2RlbCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhY3Rpb25zO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5nZXRDb250YWluZXIoKSk7XG5cdFx0Y29uc3Qgc3R5bGVPdmVycmlkZTogSVN0YXR1c2JhclN0eWxlT3ZlcnJpZGUgfCB1bmRlZmluZWQgPSBbLi4udGhpcy5zdHlsZU92ZXJyaWRlc10uc29ydCgoYSwgYikgPT4gYS5wcmlvcml0eSAtIGIucHJpb3JpdHkpWzBdO1xuXG5cdFx0Ly8gQmFja2dyb3VuZCAvIGZvcmVncm91bmQgY29sb3JzXG5cdFx0Y29uc3QgYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihzdHlsZU92ZXJyaWRlPy5iYWNrZ3JvdW5kID8/ICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gU1RBVFVTX0JBUl9CQUNLR1JPVU5EIDogU1RBVFVTX0JBUl9OT19GT0xERVJfQkFDS0dST1VORCkpIHx8ICcnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBiYWNrZ3JvdW5kQ29sb3I7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihzdHlsZU92ZXJyaWRlPy5mb3JlZ3JvdW5kID8/ICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gU1RBVFVTX0JBUl9GT1JFR1JPVU5EIDogU1RBVFVTX0JBUl9OT19GT0xERVJfRk9SRUdST1VORCkpIHx8ICcnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5jb2xvciA9IGZvcmVncm91bmRDb2xvcjtcblx0XHRjb25zdCBpdGVtQm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKFNUQVRVU19CQVJfSVRFTV9GT0NVU19CT1JERVIpO1xuXG5cdFx0Ly8gVXBkYXRlIGNvbXBhY3QgZW50cmllcyB0byByZWZyZXNoIGhvdmVyIGNvbG9ycyBiYXNlZCBvbiBjdXJyZW50IHRoZW1lXG5cdFx0dGhpcy51cGRhdGVDb21wYWN0RW50cmllcygpO1xuXG5cdFx0Ly8gTWFyayB0aGUgYmFyIHdoZW4gYSBzdHlsZSBvdmVycmlkZSBpcyBhY3RpdmUgKGN1cnJlbnRseSBvbmx5IHRoZSBkZWJ1Z2dpbmdcblx0XHQvLyBjb2xvcikgc28gTW9kZXJuIFVJIGNhbiByZXN0b3JlIHRoZSByZWNvbG9yLCB3aGljaCBmbG9hdGluZyBtb2RlIG90aGVyd2lzZVxuXHRcdC8vIHBhaW50cyB0cmFuc3BhcmVudC5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLXN0eWxlLW92ZXJyaWRlJywgISFzdHlsZU92ZXJyaWRlPy5iYWNrZ3JvdW5kKTtcblxuXHRcdC8vIEJvcmRlciBjb2xvclxuXHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihzdHlsZU92ZXJyaWRlPy5ib3JkZXIgPz8gKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgPyBTVEFUVVNfQkFSX0JPUkRFUiA6IFNUQVRVU19CQVJfTk9fRk9MREVSX0JPUkRFUikpIHx8IHRoaXMuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpO1xuXHRcdGlmIChib3JkZXJDb2xvcikge1xuXHRcdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3N0YXR1cy1ib3JkZXItdG9wJyk7XG5cdFx0XHRjb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tc3RhdHVzLWJvcmRlci10b3AtY29sb3InLCBib3JkZXJDb2xvcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzdGF0dXMtYm9yZGVyLXRvcCcpO1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCctLXN0YXR1cy1ib3JkZXItdG9wLWNvbG9yJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29sb3JzIGFuZCBmb2N1cyBvdXRsaW5lcyB2aWEgZHluYW1pYyBzdHlsZXNoZWV0XG5cblx0XHRjb25zdCBzdGF0dXNCYXJGb2N1c0NvbG9yID0gdGhpcy5nZXRDb2xvcihTVEFUVVNfQkFSX0ZPQ1VTX0JPUkRFUik7XG5cblx0XHRpZiAoIXRoaXMuc3R5bGVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLnN0eWxlRWxlbWVudCA9IGNyZWF0ZVN0eWxlU2hlZXQoY29udGFpbmVyLCB1bmRlZmluZWQsIHRoaXMuX3N0b3JlKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGBcblxuXHRcdFx0XHQvKiBTdGF0dXMgYmFyIGZvY3VzIG91dGxpbmUgKi9cblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuc3RhdHVzYmFyOmZvY3VzIHtcblx0XHRcdFx0XHRvdXRsaW5lLWNvbG9yOiAke3N0YXR1c0JhckZvY3VzQ29sb3J9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0LyogU3RhdHVzIGJhciBpdGVtIGZvY3VzIG91dGxpbmUgKi9cblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuc3RhdHVzYmFyID4gLml0ZW1zLWNvbnRhaW5lciA+IC5zdGF0dXNiYXItaXRlbSBhOmZvY3VzLXZpc2libGUge1xuXHRcdFx0XHRcdG91dGxpbmU6IDFweCBzb2xpZCAke3RoaXMuZ2V0Q29sb3IoYWN0aXZlQ29udHJhc3RCb3JkZXIpID8/IGl0ZW1Cb3JkZXJDb2xvcn07XG5cdFx0XHRcdFx0b3V0bGluZS1vZmZzZXQ6ICR7Ym9yZGVyQ29sb3IgPyAnLTJweCcgOiAnLTFweCd9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0LyogTm90aWZpY2F0aW9uIEJlYWsgKi9cblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuc3RhdHVzYmFyID4gLml0ZW1zLWNvbnRhaW5lciA+IC5zdGF0dXNiYXItaXRlbS5oYXMtYmVhayA+IC5zdGF0dXMtYmFyLWl0ZW0tYmVhay1jb250YWluZXI6YmVmb3JlIHtcblx0XHRcdFx0XHRib3JkZXItYm90dG9tLWNvbG9yOiAke2JvcmRlckNvbG9yID8/IGJhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdH1cblx0XHRcdGA7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXQod2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0KTtcblx0XHRzdXBlci5sYXlvdXRDb250ZW50cyh3aWR0aCwgaGVpZ2h0KTtcblx0fVxuXG5cdG92ZXJyaWRlU3R5bGUoc3R5bGU6IElTdGF0dXNiYXJTdHlsZU92ZXJyaWRlKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuc3R5bGVPdmVycmlkZXMuYWRkKHN0eWxlKTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnN0eWxlT3ZlcnJpZGVzLmRlbGV0ZShzdHlsZSk7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHRcdH0pO1xuXHR9XG5cblx0dG9KU09OKCk6IG9iamVjdCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IFBhcnRzLlNUQVRVU0JBUl9QQVJUXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZS5maXJlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE1haW5TdGF0dXNiYXJQYXJ0IGV4dGVuZHMgU3RhdHVzYmFyUGFydCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoUGFydHMuU1RBVFVTQkFSX1BBUlQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGNvbnRleHRTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1eGlsaWFyeVN0YXR1c2JhclBhcnQgZXh0ZW5kcyBJU3RhdHVzYmFyRW50cnlDb250YWluZXIsIElWaWV3IHtcblx0cmVhZG9ubHkgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaGVpZ2h0OiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0IGV4dGVuZHMgU3RhdHVzYmFyUGFydCBpbXBsZW1lbnRzIElBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0IHtcblxuXHRwcml2YXRlIHN0YXRpYyBDT1VOVEVSID0gMTtcblxuXHRyZWFkb25seSBoZWlnaHQgPSBTdGF0dXNiYXJQYXJ0LkhFSUdIVDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGlkID0gQXV4aWxpYXJ5U3RhdHVzYmFyUGFydC5DT1VOVEVSKys7XG5cdFx0c3VwZXIoYHdvcmtiZW5jaC5wYXJ0cy5hdXhpbGlhcnlTdGF0dXMuJHtpZH1gLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBjb250ZXh0U2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU3RhdHVzYmFyU2VydmljZSBleHRlbmRzIE11bHRpV2luZG93UGFydHM8U3RhdHVzYmFyUGFydD4gaW1wbGVtZW50cyBJU3RhdHVzYmFyU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWFpblBhcnQ6IE1haW5TdGF0dXNiYXJQYXJ0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEF1eGlsaWFyeVN0YXR1c2JhclBhcnQ+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydCA9IHRoaXMuX29uRGlkQ3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guc3RhdHVzQmFyU2VydmljZScsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5tYWluUGFydCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFpblN0YXR1c2JhclBhcnQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyUGFydCh0aGlzLm1haW5QYXJ0KSk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5ID0gdGhpcy5tYWluUGFydC5vbkRpZENoYW5nZUVudHJ5VmlzaWJpbGl0eTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBBdXhpbGlhcnkgU3RhdHVzYmFyIFBhcnRzXG5cblx0Y3JlYXRlQXV4aWxpYXJ5U3RhdHVzYmFyUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogSUF1eGlsaWFyeVN0YXR1c2JhclBhcnQge1xuXG5cdFx0Ly8gQ29udGFpbmVyXG5cdFx0Y29uc3Qgc3RhdHVzYmFyUGFydENvbnRhaW5lciA9ICQoJ2Zvb3Rlci5wYXJ0LnN0YXR1c2JhcicsIHtcblx0XHRcdCdyb2xlJzogJ3N0YXR1cycsXG5cdFx0XHQnYXJpYS1saXZlJzogJ29mZicsXG5cdFx0XHQndGFiSW5kZXgnOiAnMCdcblx0XHR9KTtcblx0XHRzdGF0dXNiYXJQYXJ0Q29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoc3RhdHVzYmFyUGFydENvbnRhaW5lcik7XG5cblx0XHQvLyBTdGF0dXNiYXIgUGFydFxuXHRcdGNvbnN0IHN0YXR1c2JhclBhcnQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0LCBzdGF0dXNiYXJQYXJ0Q29udGFpbmVyKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5yZWdpc3RlclBhcnQoc3RhdHVzYmFyUGFydCk7XG5cblx0XHRzdGF0dXNiYXJQYXJ0LmNyZWF0ZShzdGF0dXNiYXJQYXJ0Q29udGFpbmVyKTtcblxuXHRcdEV2ZW50Lm9uY2Uoc3RhdHVzYmFyUGFydC5vbldpbGxEaXNwb3NlKSgoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSk7XG5cblx0XHQvLyBFbWl0IGludGVybmFsIGV2ZW50XG5cdFx0dGhpcy5fb25EaWRDcmVhdGVBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0LmZpcmUoc3RhdHVzYmFyUGFydCk7XG5cblx0XHRyZXR1cm4gc3RhdHVzYmFyUGFydDtcblx0fVxuXG5cdGNyZWF0ZVNjb3BlZChzdGF0dXNiYXJFbnRyeUNvbnRhaW5lcjogSVN0YXR1c2JhckVudHJ5Q29udGFpbmVyLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSVN0YXR1c2JhclNlcnZpY2Uge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTY29wZWRTdGF0dXNiYXJTZXJ2aWNlLCBzdGF0dXNiYXJFbnRyeUNvbnRhaW5lcikpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIFNlcnZpY2UgSW1wbGVtZW50YXRpb25cblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUVudHJ5VmlzaWJpbGl0eTogRXZlbnQ8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH0+O1xuXG5cdGFkZEVudHJ5KGVudHJ5OiBJU3RhdHVzYmFyRW50cnksIGlkOiBzdHJpbmcsIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LCBwcmlvcml0eU9yTG9jYXRpb246IG51bWJlciB8IElTdGF0dXNiYXJFbnRyeUxvY2F0aW9uIHwgSVN0YXR1c2JhckVudHJ5UHJpb3JpdHkgPSAwKTogSVN0YXR1c2JhckVudHJ5QWNjZXNzb3Ige1xuXHRcdGlmIChlbnRyeS5zaG93SW5BbGxXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kb0FkZEVudHJ5VG9BbGxXaW5kb3dzKGVudHJ5LCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eU9yTG9jYXRpb24pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm1haW5QYXJ0LmFkZEVudHJ5KGVudHJ5LCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eU9yTG9jYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0FkZEVudHJ5VG9BbGxXaW5kb3dzKG9yaWdpbmFsRW50cnk6IElTdGF0dXNiYXJFbnRyeSwgaWQ6IHN0cmluZywgYWxpZ25tZW50OiBTdGF0dXNiYXJBbGlnbm1lbnQsIHByaW9yaXR5T3JMb2NhdGlvbjogbnVtYmVyIHwgSVN0YXR1c2JhckVudHJ5TG9jYXRpb24gfCBJU3RhdHVzYmFyRW50cnlQcmlvcml0eSA9IDApOiBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciB7XG5cdFx0Y29uc3QgZW50cnlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IGFjY2Vzc29ycyA9IG5ldyBTZXQ8SVN0YXR1c2JhckVudHJ5QWNjZXNzb3I+KCk7XG5cblx0XHRsZXQgZW50cnkgPSBvcmlnaW5hbEVudHJ5O1xuXHRcdGZ1bmN0aW9uIGFkZEVudHJ5KHBhcnQ6IFN0YXR1c2JhclBhcnQgfCBBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0KTogdm9pZCB7XG5cdFx0XHRjb25zdCBwYXJ0RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRwYXJ0RGlzcG9zYWJsZXMuYWRkKHBhcnQub25XaWxsRGlzcG9zZSgoKSA9PiBwYXJ0RGlzcG9zYWJsZXMuZGlzcG9zZSgpKSk7XG5cblx0XHRcdGNvbnN0IGFjY2Vzc29yID0gcGFydERpc3Bvc2FibGVzLmFkZChwYXJ0LmFkZEVudHJ5KGVudHJ5LCBpZCwgYWxpZ25tZW50LCBwcmlvcml0eU9yTG9jYXRpb24pKTtcblx0XHRcdGFjY2Vzc29ycy5hZGQoYWNjZXNzb3IpO1xuXHRcdFx0cGFydERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gYWNjZXNzb3JzLmRlbGV0ZShhY2Nlc3NvcikpKTtcblxuXHRcdFx0ZW50cnlEaXNwb3NhYmxlcy5hZGQocGFydERpc3Bvc2FibGVzKTtcblx0XHRcdHBhcnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGVudHJ5RGlzcG9zYWJsZXMuZGVsZXRlKHBhcnREaXNwb3NhYmxlcykpKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0YWRkRW50cnkocGFydCk7XG5cdFx0fVxuXG5cdFx0ZW50cnlEaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZENyZWF0ZUF1eGlsaWFyeVN0YXR1c2JhclBhcnQocGFydCA9PiBhZGRFbnRyeShwYXJ0KSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHVwZGF0ZTogKHVwZGF0ZWRFbnRyeTogSVN0YXR1c2JhckVudHJ5KSA9PiB7XG5cdFx0XHRcdGVudHJ5ID0gdXBkYXRlZEVudHJ5O1xuXG5cdFx0XHRcdGZvciAoY29uc3QgdXBkYXRlIG9mIGFjY2Vzc29ycykge1xuXHRcdFx0XHRcdHVwZGF0ZS51cGRhdGUodXBkYXRlZEVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGVudHJ5RGlzcG9zYWJsZXMuZGlzcG9zZSgpXG5cdFx0fTtcblx0fVxuXG5cdGlzRW50cnlWaXNpYmxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tYWluUGFydC5pc0VudHJ5VmlzaWJsZShpZCk7XG5cdH1cblxuXHR1cGRhdGVFbnRyeVZpc2liaWxpdHkoaWQ6IHN0cmluZywgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcGFydCBvZiB0aGlzLnBhcnRzKSB7XG5cdFx0XHRwYXJ0LnVwZGF0ZUVudHJ5VmlzaWJpbGl0eShpZCwgdmlzaWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGVFbnRyeShpZDogc3RyaW5nLCBvdmVycmlkZTogUGFydGlhbDxJU3RhdHVzYmFyRW50cnk+KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMucGFydHMpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwYXJ0Lm92ZXJyaWRlRW50cnkoaWQsIG92ZXJyaWRlKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0Zm9jdXMocHJlc2VydmVFbnRyeUZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZlUGFydC5mb2N1cyhwcmVzZXJ2ZUVudHJ5Rm9jdXMpO1xuXHR9XG5cblx0Zm9jdXNOZXh0RW50cnkoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVQYXJ0LmZvY3VzTmV4dEVudHJ5KCk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzRW50cnkoKTogdm9pZCB7XG5cdFx0dGhpcy5hY3RpdmVQYXJ0LmZvY3VzUHJldmlvdXNFbnRyeSgpO1xuXHR9XG5cblx0aXNFbnRyeUZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aXZlUGFydC5pc0VudHJ5Rm9jdXNlZCgpO1xuXHR9XG5cblx0b3ZlcnJpZGVTdHlsZShzdHlsZTogSVN0YXR1c2JhclN0eWxlT3ZlcnJpZGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHBhcnQub3ZlcnJpZGVTdHlsZShzdHlsZSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5leHBvcnQgY2xhc3MgU2NvcGVkU3RhdHVzYmFyU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU3RhdHVzYmFyU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJFbnRyeUNvbnRhaW5lcjogSVN0YXR1c2JhckVudHJ5Q29udGFpbmVyLFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlRW50cnlWaXNpYmlsaXR5ID0gdGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5vbkRpZENoYW5nZUVudHJ5VmlzaWJpbGl0eTtcblx0fVxuXG5cdGNyZWF0ZUF1eGlsaWFyeVN0YXR1c2JhclBhcnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IElBdXhpbGlhcnlTdGF0dXNiYXJQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmNyZWF0ZUF1eGlsaWFyeVN0YXR1c2JhclBhcnQoY29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdH1cblxuXHRjcmVhdGVTY29wZWQoc3RhdHVzYmFyRW50cnlDb250YWluZXI6IElTdGF0dXNiYXJFbnRyeUNvbnRhaW5lciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IElTdGF0dXNiYXJTZXJ2aWNlIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmNyZWF0ZVNjb3BlZChzdGF0dXNiYXJFbnRyeUNvbnRhaW5lciwgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0Z2V0UGFydCgpOiBJU3RhdHVzYmFyRW50cnlDb250YWluZXIge1xuXHRcdHJldHVybiB0aGlzLnN0YXR1c2JhckVudHJ5Q29udGFpbmVyO1xuXHR9XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFbnRyeVZpc2liaWxpdHk6IEV2ZW50PHsgaWQ6IHN0cmluZzsgdmlzaWJsZTogYm9vbGVhbiB9PjtcblxuXHRhZGRFbnRyeShlbnRyeTogSVN0YXR1c2JhckVudHJ5LCBpZDogc3RyaW5nLCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudCwgcHJpb3JpdHlPckxvY2F0aW9uOiBudW1iZXIgfCBJU3RhdHVzYmFyRW50cnlMb2NhdGlvbiB8IElTdGF0dXNiYXJFbnRyeVByaW9yaXR5ID0gMCk6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5hZGRFbnRyeShlbnRyeSwgaWQsIGFsaWdubWVudCwgcHJpb3JpdHlPckxvY2F0aW9uKTtcblx0fVxuXG5cdGlzRW50cnlWaXNpYmxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5pc0VudHJ5VmlzaWJsZShpZCk7XG5cdH1cblxuXHR1cGRhdGVFbnRyeVZpc2liaWxpdHkoaWQ6IHN0cmluZywgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuc3RhdHVzYmFyRW50cnlDb250YWluZXIudXBkYXRlRW50cnlWaXNpYmlsaXR5KGlkLCB2aXNpYmxlKTtcblx0fVxuXG5cdG92ZXJyaWRlRW50cnkoaWQ6IHN0cmluZywgb3ZlcnJpZGU6IFBhcnRpYWw8SVN0YXR1c2JhckVudHJ5Pik6IElEaXNwb3NhYmxlIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5vdmVycmlkZUVudHJ5KGlkLCBvdmVycmlkZSk7XG5cdH1cblxuXHRmb2N1cyhwcmVzZXJ2ZUVudHJ5Rm9jdXM/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5mb2N1cyhwcmVzZXJ2ZUVudHJ5Rm9jdXMpO1xuXHR9XG5cblx0Zm9jdXNOZXh0RW50cnkoKTogdm9pZCB7XG5cdFx0dGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5mb2N1c05leHRFbnRyeSgpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91c0VudHJ5KCk6IHZvaWQge1xuXHRcdHRoaXMuc3RhdHVzYmFyRW50cnlDb250YWluZXIuZm9jdXNQcmV2aW91c0VudHJ5KCk7XG5cdH1cblxuXHRpc0VudHJ5Rm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5zdGF0dXNiYXJFbnRyeUNvbnRhaW5lci5pc0VudHJ5Rm9jdXNlZCgpO1xuXHR9XG5cblx0b3ZlcnJpZGVTdHlsZShzdHlsZTogSVN0YXR1c2JhclN0eWxlT3ZlcnJpZGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdHVzYmFyRW50cnlDb250YWluZXIub3ZlcnJpZGVTdHlsZShzdHlsZSk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhclNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsWUFBWSxpQkFBaUIscUJBQWtDLG1CQUFtQixvQkFBb0I7QUFDL0csU0FBUyxrQkFBa0IsWUFBWTtBQUN2QyxTQUFTLGFBQWEsZ0JBQWdCLGVBQTZCO0FBQ25FLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CLG1CQUFzRiwwQkFBbUQsZ0NBQXlEO0FBQy9OLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQWtCLFdBQVcsZ0JBQWdCO0FBQzdDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCLHVCQUF1QixpQ0FBaUMsa0NBQWtDLG1CQUFtQixpQ0FBaUMsNkJBQTZCLDBDQUEwQyw4QkFBOEIsK0JBQStCO0FBQ2xULFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLGdCQUFnQiw0QkFBNEI7QUFDckQsU0FBUyxhQUFhLHVCQUF1QixXQUFXLFdBQVcsV0FBVyxlQUFlLFNBQVM7QUFDdEcsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxPQUFPLHlCQUF5QixzQkFBc0I7QUFDL0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsY0FBYztBQUN2QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVDQUF1QztBQUNoRCxT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
