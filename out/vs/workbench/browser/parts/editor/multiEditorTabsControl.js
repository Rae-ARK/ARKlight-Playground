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
import "./media/multieditortabscontrol.css";
import { isLinux, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { shorten } from "../../../../base/common/labels.js";
import { EditorResourceAccessor, Verbosity, SideBySideEditor, DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities, preventEditorClose, EditorCloseMethod, EditorsOrder } from "../../../common/editor.js";
import { computeEditorAriaLabel } from "../../editor.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { EventType as TouchEventType, Gesture } from "../../../../base/browser/touch.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { toAction } from "../../../../base/common/actions.js";
import { ResourceLabels, DEFAULT_LABELS_CONTAINER } from "../../labels.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IMenuService, MenuId } from "../../../../platform/actions/common/actions.js";
import { getFlatActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { EditorCommandsContextActionRunner, EditorTabsControl } from "./editorTabsControl.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { dispose, DisposableStore, combinedDisposable, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { getOrSet } from "../../../../base/common/map.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { TAB_INACTIVE_BACKGROUND, TAB_ACTIVE_BACKGROUND, TAB_BORDER, EDITOR_DRAG_AND_DROP_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BACKGROUND, TAB_UNFOCUSED_ACTIVE_BORDER, TAB_ACTIVE_BORDER, TAB_HOVER_BACKGROUND, TAB_HOVER_BORDER, TAB_UNFOCUSED_HOVER_BACKGROUND, TAB_UNFOCUSED_HOVER_BORDER, EDITOR_GROUP_HEADER_TABS_BACKGROUND, WORKBENCH_BACKGROUND, TAB_ACTIVE_BORDER_TOP, TAB_UNFOCUSED_ACTIVE_BORDER_TOP, TAB_ACTIVE_MODIFIED_BORDER, TAB_INACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER, TAB_UNFOCUSED_INACTIVE_BACKGROUND, TAB_HOVER_FOREGROUND, TAB_UNFOCUSED_HOVER_FOREGROUND, EDITOR_GROUP_HEADER_TABS_BORDER, TAB_LAST_PINNED_BORDER, TAB_SELECTED_BORDER_TOP } from "../../../common/theme.js";
import { activeContrastBorder, contrastBorder, editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { ResourcesDropHandler, DraggedEditorIdentifier, DraggedEditorGroupIdentifier, extractTreeDropData, isWindowDraggedOver } from "../../dnd.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { MergeGroupMode } from "../../../services/editor/common/editorGroupsService.js";
import { addDisposableListener, EventType, EventHelper, Dimension, scheduleAtNextAnimationFrame, findParentWithClass, clearNode, DragAndDropObserver, isMouseEvent, getWindow, $ } from "../../../../base/browser/dom.js";
import { localize } from "../../../../nls.js";
import { prepareMoveCopyEditors } from "./editor.js";
import { CloseEditorTabAction, UnpinEditorAction } from "./editorActions.js";
import { assertReturnsAllDefined, assertReturnsDefined } from "../../../../base/common/types.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { basenameOrAuthority } from "../../../../base/common/resources.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { win32, posix } from "../../../../base/common/path.js";
import { coalesce, insert } from "../../../../base/common/arrays.js";
import { isHighContrast } from "../../../../platform/theme/common/theme.js";
import { isSafari } from "../../../../base/browser/browser.js";
import { equals } from "../../../../base/common/objects.js";
import { EditorActivation } from "../../../../platform/editor/common/editor.js";
import { UNLOCK_GROUP_COMMAND_ID } from "./editorCommands.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { ITreeViewsDnDService } from "../../../../editor/common/services/treeViewsDndService.js";
import { DraggedTreeItemsIdentifier } from "../../../../editor/common/services/treeViewsDnd.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { StickyEditorGroupModel, UnstickyEditorGroupModel } from "../../../common/editor/filteredEditorGroupModel.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { applyDragImage } from "../../../../base/browser/ui/dnd/dnd.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
let MultiEditorTabsControl = class extends EditorTabsControl {
  constructor(parent, editorPartsView, groupsView, groupView, tabsModel, menuIds, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorService, pathService, treeViewsDragAndDropService, editorResolverService, hostService, menuService) {
    super(parent, editorPartsView, groupsView, groupView, tabsModel, menuIds, contextMenuService, instantiationService, contextKeyService, keybindingService, notificationService, quickInputService, themeService, editorResolverService, hostService, menuService);
    this.editorService = editorService;
    this.pathService = pathService;
    this.treeViewsDragAndDropService = treeViewsDragAndDropService;
    this.closeEditorAction = this._register(this.instantiationService.createInstance(CloseEditorTabAction, CloseEditorTabAction.ID, CloseEditorTabAction.LABEL));
    this.unpinEditorAction = this._register(this.instantiationService.createInstance(UnpinEditorAction, UnpinEditorAction.ID, UnpinEditorAction.LABEL));
    this.tabResourceLabels = this._register(this.instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
    this.tabLabels = [];
    this.tabActionBars = [];
    this.tabDisposables = [];
    this.dimensions = {
      container: Dimension.None,
      available: Dimension.None
    };
    this.layoutScheduler = this._register(new MutableDisposable());
    this.path = isWindows ? win32 : posix;
    this.lastMouseWheelEventTime = 0;
    this.isMouseOverTabs = false;
    this.updateEditorLabelScheduler = this._register(new RunOnceScheduler(() => this.doUpdateEditorLabels(), 0));
    (async () => this.path = await this.pathService.path)();
    this._register(this.tabResourceLabels.onDidChangeDecorations(() => this.doHandleDecorationsChange()));
  }
  create(parent) {
    super.create(parent);
    this.titleContainer = parent;
    this.tabsAndActionsContainer = $(".tabs-and-actions-container");
    this.titleContainer.appendChild(this.tabsAndActionsContainer);
    this.stickyTabsBackground = $(".sticky-tabs-background", { "aria-hidden": true });
    this.tabsContainer = $(".tabs-container", {
      role: "tablist",
      "aria-multiselectable": "true",
      draggable: true
    });
    this._register(Gesture.addTarget(this.tabsContainer));
    this.tabSizingFixedDisposables = this._register(new DisposableStore());
    this.updateTabSizing(false);
    this.tabsScrollbar = this.createTabsScrollbar(this.tabsContainer);
    this.tabsAndActionsContainer.appendChild(this.tabsScrollbar.getDomNode());
    this.tabsScrollbar.getDomNode().appendChild(this.stickyTabsBackground);
    this.registerTabsContainerListeners(this.tabsContainer, this.tabsScrollbar);
    if (this.menuIds?.tabsBarAddTab) {
      this.createAddTabControl(this.menuIds.tabsBarAddTab);
    }
    this.createEditorActionsToolBar(this.tabsAndActionsContainer, ["editor-actions"]);
    this.updateTabsControlVisibility();
    return this.tabsAndActionsContainer;
  }
  createAddTabControl(menuId) {
    const tabsContainer = assertReturnsDefined(this.tabsContainer);
    const container = $(".tabs-bar-add-tab");
    tabsContainer.appendChild(container);
    this.addTabContainer = container;
    const menu = this._register(this.menuService.createMenu(menuId, this.contextKeyService));
    const getActions = () => getFlatActionBarActions(menu.getActions({ shouldForwardArgs: true }));
    const addTabAction = toAction({
      id: "editor.tabs.addTab",
      label: localize("addTab", "Add Tab"),
      class: ThemeIcon.asClassName(Codicon.add),
      run: () => {
      }
    });
    const dropdown = this._register(new DropdownMenuActionViewItem(addTabAction, { getActions }, this.contextMenuService, {
      classNames: ThemeIcon.asClassNameArray(Codicon.add),
      keybindingProvider: (action) => this.getKeybinding(action)
    }));
    dropdown.render(container);
    const updateVisibility = () => this.addTabContainer?.classList.toggle("hidden", getActions().length === 0);
    updateVisibility();
    this._register(menu.onDidChange(() => updateVisibility()));
  }
  get tabCount() {
    const tabsContainer = assertReturnsDefined(this.tabsContainer);
    return this.addTabContainer ? tabsContainer.children.length - 1 : tabsContainer.children.length;
  }
  appendTab(tab, tabsContainer) {
    if (this.addTabContainer) {
      tabsContainer.insertBefore(tab, this.addTabContainer);
    } else {
      tabsContainer.appendChild(tab);
    }
  }
  removeLastTab(tabsContainer) {
    if (this.addTabContainer) {
      this.addTabContainer.previousElementSibling?.remove();
    } else {
      tabsContainer.lastChild?.remove();
    }
  }
  createTabsScrollbar(scrollable) {
    const tabsScrollbar = this._register(new ScrollableElement(scrollable, {
      horizontal: this.getTabsScrollbarVisibility(),
      horizontalScrollbarSize: this.getTabsScrollbarSizing(),
      vertical: ScrollbarVisibility.Hidden,
      scrollYToX: true,
      useShadows: false
    }));
    this._register(tabsScrollbar.onScroll((e) => {
      if (e.scrollLeftChanged) {
        scrollable.scrollLeft = e.scrollLeft;
      }
    }));
    return tabsScrollbar;
  }
  updateTabsScrollbarSizing() {
    this.tabsScrollbar?.updateOptions({
      horizontalScrollbarSize: this.getTabsScrollbarSizing()
    });
  }
  updateTabsScrollbarVisibility() {
    this.tabsScrollbar?.updateOptions({
      horizontal: this.getTabsScrollbarVisibility()
    });
  }
  updateTabSizing(fromEvent) {
    const [tabsContainer, tabSizingFixedDisposables] = assertReturnsAllDefined(this.tabsContainer, this.tabSizingFixedDisposables);
    tabSizingFixedDisposables.clear();
    const options = this.groupsView.partOptions;
    if (options.tabSizing === "fixed") {
      tabsContainer.style.setProperty("--tab-sizing-fixed-min-width", `${options.tabSizingFixedMinWidth}px`);
      tabsContainer.style.setProperty("--tab-sizing-fixed-max-width", `${options.tabSizingFixedMaxWidth}px`);
      tabSizingFixedDisposables.add(addDisposableListener(tabsContainer, EventType.MOUSE_ENTER, () => {
        this.isMouseOverTabs = true;
      }));
      tabSizingFixedDisposables.add(addDisposableListener(tabsContainer, EventType.MOUSE_LEAVE, () => {
        this.isMouseOverTabs = false;
        this.updateTabsFixedWidth(false);
      }));
    } else if (fromEvent) {
      tabsContainer.style.removeProperty("--tab-sizing-fixed-min-width");
      tabsContainer.style.removeProperty("--tab-sizing-fixed-max-width");
      this.updateTabsFixedWidth(false);
    }
  }
  updateTabsFixedWidth(fixed) {
    this.forEachTab((editor, tabIndex, tabContainer) => {
      if (fixed) {
        const { width } = tabContainer.getBoundingClientRect();
        tabContainer.style.setProperty("--tab-sizing-current-width", `${width}px`);
      } else {
        tabContainer.style.removeProperty("--tab-sizing-current-width");
      }
    });
  }
  getTabsScrollbarSizing() {
    if (this.groupsView.partOptions.titleScrollbarSizing !== "large") {
      return MultiEditorTabsControl.SCROLLBAR_SIZES.default;
    }
    return MultiEditorTabsControl.SCROLLBAR_SIZES.large;
  }
  getTabsScrollbarVisibility() {
    switch (this.groupsView.partOptions.titleScrollbarVisibility) {
      case "visible":
        return ScrollbarVisibility.Visible;
      case "hidden":
        return ScrollbarVisibility.Hidden;
      default:
        return ScrollbarVisibility.Auto;
    }
  }
  registerTabsContainerListeners(tabsContainer, tabsScrollbar) {
    this._register(addDisposableListener(tabsContainer, EventType.SCROLL, () => {
      if (tabsContainer.classList.contains("scroll")) {
        tabsScrollbar.setScrollPosition({
          scrollLeft: tabsContainer.scrollLeft
          // during DND the container gets scrolled so we need to update the custom scrollbar
        });
      }
    }));
    for (const eventType of [TouchEventType.Tap, EventType.DBLCLICK]) {
      this._register(addDisposableListener(tabsContainer, eventType, (e) => {
        if (eventType === EventType.DBLCLICK) {
          if (e.target !== tabsContainer) {
            return;
          }
        } else {
          if (e.tapCount !== 2) {
            return;
          }
          if (e.initialTarget !== tabsContainer) {
            return;
          }
        }
        EventHelper.stop(e);
        this.editorService.openEditor({
          resource: void 0,
          options: {
            pinned: true,
            index: this.groupView.count,
            // always at the end
            override: DEFAULT_EDITOR_ASSOCIATION.id
          }
        }, this.groupView.id);
      }));
    }
    this._register(addDisposableListener(tabsContainer, EventType.MOUSE_DOWN, (e) => {
      if (e.button === 1) {
        e.preventDefault();
      }
    }));
    if (isLinux) {
      this._register(addDisposableListener(tabsContainer, EventType.MOUSE_UP, (e) => {
        if (e.button === 1) {
          e.preventDefault();
        }
      }));
    }
    let lastDragEvent = void 0;
    let isNewWindowOperation = false;
    this._register(new DragAndDropObserver(tabsContainer, {
      onDragStart: (e) => {
        isNewWindowOperation = this.onGroupDragStart(e, tabsContainer);
      },
      onDrag: (e) => {
        lastDragEvent = e;
      },
      onDragEnter: (e) => {
        tabsContainer.classList.add("scroll");
        if (e.target !== tabsContainer) {
          return;
        }
        if (!this.isSupportedDropTransfer(e)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "none";
          }
          return;
        }
        if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
          }
        }
        this.updateDropFeedback(tabsContainer, true, e);
      },
      onDragLeave: (e) => {
        this.updateDropFeedback(tabsContainer, false, e);
        tabsContainer.classList.remove("scroll");
      },
      onDragEnd: (e) => {
        this.updateDropFeedback(tabsContainer, false, e);
        tabsContainer.classList.remove("scroll");
        this.onGroupDragEnd(e, lastDragEvent, tabsContainer, isNewWindowOperation);
      },
      onDrop: (e) => {
        this.updateDropFeedback(tabsContainer, false, e);
        tabsContainer.classList.remove("scroll");
        if (e.target === tabsContainer) {
          const isGroupTransfer = this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype);
          this.onDrop(e, isGroupTransfer ? this.groupView.count : this.tabsModel.count, tabsContainer);
        }
      }
    }));
    this._register(addDisposableListener(tabsContainer, EventType.MOUSE_WHEEL, (e) => {
      const activeEditor = this.groupView.activeEditor;
      if (!activeEditor || this.groupView.count < 2) {
        return;
      }
      if (this.groupsView.partOptions.scrollToSwitchTabs === true) {
        if (e.shiftKey) {
          return;
        }
      } else {
        if (!e.shiftKey) {
          return;
        }
      }
      const now = Date.now();
      if (now - this.lastMouseWheelEventTime < MultiEditorTabsControl.MOUSE_WHEEL_EVENT_THRESHOLD - 2 * (Math.abs(e.deltaX) + Math.abs(e.deltaY))) {
        return;
      }
      this.lastMouseWheelEventTime = now;
      let tabSwitchDirection;
      if (e.deltaX + e.deltaY < -MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD) {
        tabSwitchDirection = -1;
      } else if (e.deltaX + e.deltaY > MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD) {
        tabSwitchDirection = 1;
      } else {
        return;
      }
      const nextEditor = this.groupView.getEditorByIndex(this.groupView.getIndexOfEditor(activeEditor) + tabSwitchDirection);
      if (!nextEditor) {
        return;
      }
      this.groupView.openEditor(nextEditor);
      EventHelper.stop(e, true);
    }));
    const showContextMenu = (e) => {
      EventHelper.stop(e);
      let anchor = tabsContainer;
      if (isMouseEvent(e)) {
        anchor = new StandardMouseEvent(getWindow(this.parent), e);
      }
      this.contextMenuService.showContextMenu({
        getAnchor: () => anchor,
        menuId: this.menuIds?.tabsBarContext ?? MenuId.EditorTabsBarContext,
        contextKeyService: this.contextKeyService,
        menuActionOptions: { shouldForwardArgs: true },
        getActionsContext: () => ({ groupId: this.groupView.id }),
        getKeyBinding: (action) => this.getKeybinding(action),
        onHide: () => this.groupView.focus()
      });
    };
    this._register(addDisposableListener(tabsContainer, TouchEventType.Contextmenu, (e) => showContextMenu(e)));
    this._register(addDisposableListener(tabsContainer, EventType.CONTEXT_MENU, (e) => showContextMenu(e)));
  }
  doHandleDecorationsChange() {
    this.layout(this.dimensions);
  }
  updateEditorActionsToolbar() {
    super.updateEditorActionsToolbar();
    this.layout(this.dimensions);
  }
  openEditor(editor, options) {
    const changed = this.handleOpenedEditors();
    if (options?.focusTabControl) {
      this.withTab(editor, (editor2, tabIndex, tabContainer) => tabContainer.focus());
    }
    return changed;
  }
  openEditors(editors) {
    return this.handleOpenedEditors();
  }
  handleOpenedEditors() {
    this.updateTabsControlVisibility();
    const [tabsContainer, tabsScrollbar] = assertReturnsAllDefined(this.tabsContainer, this.tabsScrollbar);
    for (let i = this.tabCount; i < this.tabsModel.count; i++) {
      this.appendTab(this.createTab(i, tabsContainer, tabsScrollbar), tabsContainer);
    }
    const activeEditorChanged = this.didActiveEditorChange();
    const oldTabLabels = this.tabLabels;
    this.computeTabLabels();
    let didChange = false;
    if (activeEditorChanged || // active editor changed
    oldTabLabels.length !== this.tabLabels.length || // number of tabs changed
    oldTabLabels.some((label, index) => !this.equalsEditorInputLabel(label, this.tabLabels.at(index)))) {
      this.redraw({ forceRevealActiveTab: true });
      didChange = true;
    } else {
      this.layout(this.dimensions, { forceRevealActiveTab: true });
    }
    return didChange;
  }
  didActiveEditorChange() {
    if (!this.activeTabLabel?.editor && this.tabsModel.activeEditor || // active editor changed from null => editor
    this.activeTabLabel?.editor && !this.tabsModel.activeEditor || // active editor changed from editor => null
    (!this.activeTabLabel?.editor || !this.tabsModel.isActive(this.activeTabLabel.editor))) {
      return true;
    }
    return false;
  }
  equalsEditorInputLabel(labelA, labelB) {
    if (labelA === labelB) {
      return true;
    }
    if (!labelA || !labelB) {
      return false;
    }
    return labelA.name === labelB.name && labelA.description === labelB.description && labelA.forceDescription === labelB.forceDescription && labelA.title === labelB.title && labelA.ariaLabel === labelB.ariaLabel;
  }
  beforeCloseEditor(editor) {
    if (this.isMouseOverTabs && this.groupsView.partOptions.tabSizing === "fixed") {
      const closingLastTab = this.tabsModel.isLast(editor);
      this.updateTabsFixedWidth(!closingLastTab);
    }
  }
  closeEditor(editor) {
    this.handleClosedEditors();
  }
  closeEditors(editors) {
    this.handleClosedEditors();
  }
  handleClosedEditors() {
    if (this.tabsModel.count) {
      const tabsContainer = assertReturnsDefined(this.tabsContainer);
      while (this.tabCount > this.tabsModel.count) {
        this.removeLastTab(tabsContainer);
        dispose(this.tabDisposables.pop());
      }
      this.computeTabLabels();
      this.redraw({ forceRevealActiveTab: true });
    } else {
      if (this.tabsContainer) {
        clearNode(this.tabsContainer);
        if (this.addTabContainer) {
          this.tabsContainer.appendChild(this.addTabContainer);
        }
      }
      this.tabDisposables = dispose(this.tabDisposables);
      this.tabResourceLabels.clear();
      this.tabLabels = [];
      this.activeTabLabel = void 0;
      this.tabActionBars = [];
      this.clearEditorActionsToolbar();
      this.updateTabsControlVisibility();
    }
  }
  moveEditor(editor, fromTabIndex, targetTabIndex) {
    const editorLabel = this.tabLabels[fromTabIndex];
    this.tabLabels.splice(fromTabIndex, 1);
    this.tabLabels.splice(targetTabIndex, 0, editorLabel);
    this.forEachTab(
      (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
        this.redrawTab(editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar);
      },
      Math.min(fromTabIndex, targetTabIndex),
      // from: smallest of fromTabIndex/targetTabIndex
      Math.max(fromTabIndex, targetTabIndex)
      //   to: largest of fromTabIndex/targetTabIndex
    );
    this.layout(this.dimensions, { forceRevealActiveTab: true });
  }
  pinEditor(editor) {
    this.withTab(editor, (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel) => this.redrawTabLabel(editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel));
  }
  stickEditor(editor) {
    this.doHandleStickyEditorChange(editor);
  }
  unstickEditor(editor) {
    this.doHandleStickyEditorChange(editor);
  }
  doHandleStickyEditorChange(editor) {
    this.withTab(editor, (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => this.redrawTab(editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar));
    this.forEachTab((editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel) => {
      this.redrawTabBorders(tabIndex, tabContainer);
    });
    this.layout(this.dimensions, { forceRevealActiveTab: true });
  }
  setActive(isGroupActive) {
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
      this.redrawTabSelectedActiveAndDirty(isGroupActive, editor, tabContainer, tabActionBar);
    });
    this.updateEditorActionsToolbar();
    this.layout(this.dimensions, { forceRevealActiveTab: true });
  }
  updateEditorSelections() {
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
      this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor, tabContainer, tabActionBar);
    });
  }
  updateEditorLabel(editor) {
    this.updateEditorLabelScheduler.schedule();
  }
  doUpdateEditorLabels() {
    this.computeTabLabels();
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel) => {
      this.redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel);
    });
    this.layout(this.dimensions);
  }
  updateEditorDirty(editor) {
    this.withTab(editor, (editor2, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor2, tabContainer, tabActionBar));
  }
  updateOptions(oldOptions, newOptions) {
    super.updateOptions(oldOptions, newOptions);
    if (oldOptions.labelFormat !== newOptions.labelFormat) {
      this.computeTabLabels();
    }
    if (oldOptions.titleScrollbarSizing !== newOptions.titleScrollbarSizing) {
      this.updateTabsScrollbarSizing();
    }
    if (oldOptions.titleScrollbarVisibility !== newOptions.titleScrollbarVisibility) {
      this.updateTabsScrollbarVisibility();
    }
    if (oldOptions.alwaysShowEditorActions !== newOptions.alwaysShowEditorActions) {
      this.updateEditorActionsToolbar();
    }
    if (oldOptions.tabSizingFixedMinWidth !== newOptions.tabSizingFixedMinWidth || oldOptions.tabSizingFixedMaxWidth !== newOptions.tabSizingFixedMaxWidth || oldOptions.tabSizing !== newOptions.tabSizing) {
      this.updateTabSizing(true);
    }
    if (oldOptions.labelFormat !== newOptions.labelFormat || oldOptions.tabActionLocation !== newOptions.tabActionLocation || oldOptions.tabActionCloseVisibility !== newOptions.tabActionCloseVisibility || oldOptions.tabActionUnpinVisibility !== newOptions.tabActionUnpinVisibility || oldOptions.tabSizing !== newOptions.tabSizing || oldOptions.pinnedTabSizing !== newOptions.pinnedTabSizing || oldOptions.showIcons !== newOptions.showIcons || oldOptions.hasIcons !== newOptions.hasIcons || oldOptions.highlightModifiedTabs !== newOptions.highlightModifiedTabs || oldOptions.wrapTabs !== newOptions.wrapTabs || oldOptions.showTabIndex !== newOptions.showTabIndex || !equals(oldOptions.decorations, newOptions.decorations)) {
      this.redraw();
    }
  }
  updateStyles() {
    this.redraw();
  }
  forEachTab(fn, fromTabIndex, toTabIndex) {
    this.tabsModel.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor, tabIndex) => {
      if (typeof fromTabIndex === "number" && fromTabIndex > tabIndex) {
        return;
      }
      if (typeof toTabIndex === "number" && toTabIndex < tabIndex) {
        return;
      }
      this.doWithTab(tabIndex, editor, fn);
    });
  }
  withTab(editor, fn) {
    this.doWithTab(this.tabsModel.indexOf(editor), editor, fn);
  }
  doWithTab(tabIndex, editor, fn) {
    const tabsContainer = assertReturnsDefined(this.tabsContainer);
    const tabContainer = tabsContainer.children[tabIndex];
    const tabResourceLabel = this.tabResourceLabels.get(tabIndex);
    const tabLabel = this.tabLabels[tabIndex];
    const tabActionBar = this.tabActionBars[tabIndex];
    if (tabContainer && tabResourceLabel && tabLabel) {
      fn(editor, tabIndex, tabContainer, tabResourceLabel, tabLabel, tabActionBar);
    }
  }
  createTab(tabIndex, tabsContainer, tabsScrollbar) {
    const tabContainer = $(".tab", {
      draggable: true,
      role: "tab"
    });
    const gestureDisposable = Gesture.addTarget(tabContainer);
    const tabBorderTopContainer = $(".tab-border-top-container");
    tabContainer.appendChild(tabBorderTopContainer);
    const editorLabel = this.tabResourceLabels.create(tabContainer, { hoverTargetOverride: tabContainer });
    const tabActionsContainer = $(".tab-actions");
    tabContainer.appendChild(tabActionsContainer);
    const that = this;
    const tabActionRunner = new EditorCommandsContextActionRunner({
      groupId: this.groupView.id,
      get editorIndex() {
        return that.toEditorIndex(tabIndex);
      }
    });
    const tabActionBar = new ActionBar(tabActionsContainer, { ariaLabel: localize("ariaLabelTabActions", "Tab actions"), actionRunner: tabActionRunner });
    const tabActionListener = tabActionBar.onWillRun((e) => {
      if (e.action.id === this.closeEditorAction.id) {
        this.blockRevealActiveTabOnce();
      }
    });
    const tabActionBarDisposable = combinedDisposable(tabActionRunner, tabActionBar, tabActionListener, toDisposable(insert(this.tabActionBars, tabActionBar)));
    const tabShadowHider = $(".tab-fade-hider");
    tabContainer.appendChild(tabShadowHider);
    const tabBorderBottomContainer = $(".tab-border-bottom-container");
    tabContainer.appendChild(tabBorderBottomContainer);
    const eventsDisposable = this.registerTabListeners(tabContainer, tabIndex, tabsContainer, tabsScrollbar);
    this.tabDisposables.push(combinedDisposable(gestureDisposable, eventsDisposable, tabActionBarDisposable, editorLabel));
    return tabContainer;
  }
  toEditorIndex(tabIndex) {
    const editor = assertReturnsDefined(this.tabsModel.getEditorByIndex(tabIndex));
    return this.groupView.getIndexOfEditor(editor);
  }
  registerTabListeners(tab, tabIndex, tabsContainer, tabsScrollbar) {
    const disposables = new DisposableStore();
    const handleClickOrTouch = async (e, preserveFocus) => {
      tab.blur();
      if (isMouseEvent(e) && (e.button !== 0 || isMacintosh && e.ctrlKey)) {
        if (e.button === 1) {
          e.preventDefault();
        }
        return;
      }
      if (this.originatesFromTabActionBar(e)) {
        return;
      }
      const editor = this.tabsModel.getEditorByIndex(tabIndex);
      if (editor) {
        if (e.shiftKey) {
          let anchor;
          if (this.lastSingleSelectSelectedEditor && this.tabsModel.isSelected(this.lastSingleSelectSelectedEditor)) {
            anchor = this.lastSingleSelectSelectedEditor;
          } else {
            const activeEditor = assertReturnsDefined(this.groupView.activeEditor);
            this.lastSingleSelectSelectedEditor = activeEditor;
            anchor = activeEditor;
          }
          await this.selectEditorsBetween(editor, anchor);
        } else if (e.ctrlKey && !isMacintosh || e.metaKey && isMacintosh) {
          if (this.tabsModel.isSelected(editor)) {
            await this.unselectEditor(editor);
          } else {
            await this.selectEditor(editor);
            this.lastSingleSelectSelectedEditor = editor;
          }
        } else {
          const inactiveSelection = this.tabsModel.isSelected(editor) ? this.groupView.selectedEditors.filter((e2) => !e2.matches(editor)) : [];
          await this.groupView.openEditor(editor, { preserveFocus, activation: EditorActivation.ACTIVATE }, { inactiveSelection, focusTabControl: true });
        }
      }
    };
    const showContextMenu = (e) => {
      EventHelper.stop(e);
      const editor = this.tabsModel.getEditorByIndex(tabIndex);
      if (editor) {
        this.onTabContextMenu(editor, e, tab);
      }
    };
    disposables.add(addDisposableListener(tab, EventType.MOUSE_DOWN, (e) => handleClickOrTouch(e, false)));
    disposables.add(addDisposableListener(tab, TouchEventType.Tap, (e) => handleClickOrTouch(e, true)));
    disposables.add(addDisposableListener(tab, TouchEventType.Change, (e) => {
      tabsScrollbar.setScrollPosition({ scrollLeft: tabsScrollbar.getScrollPosition().scrollLeft - e.translationX });
    }));
    disposables.add(addDisposableListener(tab, EventType.MOUSE_UP, async (e) => {
      EventHelper.stop(e);
      tab.blur();
      if (isMouseEvent(e) && (e.button !== 0 || isMacintosh && e.ctrlKey)) {
        return;
      }
      if (this.originatesFromTabActionBar(e)) {
        return;
      }
      const isCtrlCmd = e.ctrlKey && !isMacintosh || e.metaKey && isMacintosh;
      if (!isCtrlCmd && !e.shiftKey && this.groupView.selectedEditors.length > 1) {
        await this.unselectAllEditors();
      }
    }));
    disposables.add(addDisposableListener(tab, EventType.AUXCLICK, (e) => {
      if (e.button === 1) {
        EventHelper.stop(
          e,
          true
          /* for https://github.com/microsoft/vscode/issues/56715 */
        );
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor) {
          if (preventEditorClose(this.tabsModel, editor, EditorCloseMethod.MOUSE, this.groupsView.partOptions)) {
            return;
          }
          this.blockRevealActiveTabOnce();
          this.closeEditorAction.run({ groupId: this.groupView.id, editorIndex: this.groupView.getIndexOfEditor(editor) });
        }
      }
    }));
    disposables.add(addDisposableListener(tab, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.shiftKey && event.keyCode === KeyCode.F10) {
        showContextMenu(e);
      }
    }));
    disposables.add(addDisposableListener(tab, TouchEventType.Contextmenu, (e) => {
      showContextMenu(e);
    }));
    disposables.add(addDisposableListener(tab, EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      let handled = false;
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        handled = true;
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor) {
          this.groupView.openEditor(editor);
        }
      } else if ([KeyCode.LeftArrow, KeyCode.RightArrow, KeyCode.UpArrow, KeyCode.DownArrow, KeyCode.Home, KeyCode.End].some((kb) => event.equals(kb))) {
        let editorIndex = this.toEditorIndex(tabIndex);
        if (event.equals(KeyCode.LeftArrow) || event.equals(KeyCode.UpArrow)) {
          editorIndex = editorIndex - 1;
        } else if (event.equals(KeyCode.RightArrow) || event.equals(KeyCode.DownArrow)) {
          editorIndex = editorIndex + 1;
        } else if (event.equals(KeyCode.Home)) {
          editorIndex = 0;
        } else {
          editorIndex = this.groupView.count - 1;
        }
        const target = this.groupView.getEditorByIndex(editorIndex);
        if (target) {
          handled = true;
          this.groupView.openEditor(target, { preserveFocus: true }, { focusTabControl: true });
        }
      }
      if (handled) {
        EventHelper.stop(e, true);
      }
      tabsScrollbar.setScrollPosition({
        scrollLeft: tabsContainer.scrollLeft
      });
    }));
    for (const eventType of [TouchEventType.Tap, EventType.DBLCLICK]) {
      disposables.add(addDisposableListener(tab, eventType, (e) => {
        if (eventType === EventType.DBLCLICK) {
          EventHelper.stop(e);
        } else if (e.tapCount !== 2) {
          return;
        }
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor && this.tabsModel.isPinned(editor)) {
          switch (this.groupsView.partOptions.doubleClickTabToToggleEditorGroupSizes) {
            case "maximize":
              this.groupsView.toggleMaximizeGroup(this.groupView);
              break;
            case "expand":
              this.groupsView.toggleExpandGroup(this.groupView);
              break;
            case "off":
              break;
          }
        } else {
          this.groupView.pinEditor(editor);
        }
      }));
    }
    disposables.add(addDisposableListener(
      tab,
      EventType.CONTEXT_MENU,
      (e) => {
        EventHelper.stop(e, true);
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (editor) {
          this.onTabContextMenu(editor, e, tab);
        }
      },
      true
      /* use capture to fix https://github.com/microsoft/vscode/issues/19145 */
    ));
    let lastDragEvent = void 0;
    let isNewWindowOperation = false;
    disposables.add(new DragAndDropObserver(tab, {
      onDragStart: (e) => {
        const editor = this.tabsModel.getEditorByIndex(tabIndex);
        if (!editor) {
          return;
        }
        isNewWindowOperation = this.isNewWindowOperation(e);
        const selectedEditors = this.groupView.selectedEditors;
        this.editorTransfer.setData(selectedEditors.map((e2) => new DraggedEditorIdentifier({ editor: e2, groupId: this.groupView.id })), DraggedEditorIdentifier.prototype);
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "copyMove";
          if (selectedEditors.length > 1) {
            const label = `${editor.getName()} + ${selectedEditors.length - 1}`;
            applyDragImage(e, tab, label);
          } else {
            const options = this.groupsView.partOptions;
            const isTabSticky = this.tabsModel.isSticky(tabIndex);
            const isShrinkSizing = options.tabSizing === "shrink" || isTabSticky && options.pinnedTabSizing === "shrink";
            if (isShrinkSizing) {
              applyDragImage(e, tab, editor.getName());
            } else {
              e.dataTransfer.setDragImage(tab, 0, 0);
            }
          }
        }
        this.doFillResourceDataTransfers(selectedEditors, e, isNewWindowOperation);
        scheduleAtNextAnimationFrame(getWindow(this.parent), () => this.updateDropFeedback(tab, false, e, tabIndex));
      },
      onDrag: (e) => {
        lastDragEvent = e;
      },
      onDragEnter: (e) => {
        if (!this.isSupportedDropTransfer(e)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "none";
          }
          return;
        }
        if (!this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
          if (e.dataTransfer) {
            e.dataTransfer.dropEffect = "copy";
          }
        }
        this.updateDropFeedback(tab, true, e, tabIndex);
      },
      onDragOver: (e, dragDuration) => {
        if (dragDuration >= MultiEditorTabsControl.DRAG_OVER_OPEN_TAB_THRESHOLD) {
          const draggedOverTab = this.tabsModel.getEditorByIndex(tabIndex);
          if (draggedOverTab && this.tabsModel.activeEditor !== draggedOverTab) {
            this.groupView.openEditor(draggedOverTab, { preserveFocus: true });
          }
        }
        this.updateDropFeedback(tab, true, e, tabIndex);
      },
      onDragEnd: async (e) => {
        this.updateDropFeedback(tab, false, e, tabIndex);
        const draggedEditors = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
        this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
        if (!isNewWindowOperation || isWindowDraggedOver() || !draggedEditors || draggedEditors.length === 0) {
          return;
        }
        const auxiliaryEditorPart = await this.maybeCreateAuxiliaryEditorPartAt(e, tab);
        if (!auxiliaryEditorPart) {
          return;
        }
        const targetGroup = auxiliaryEditorPart.activeGroup;
        const editorsWithOptions = prepareMoveCopyEditors(this.groupView, draggedEditors.map((editor) => editor.identifier.editor));
        if (this.isMoveOperation(lastDragEvent ?? e, targetGroup.id, draggedEditors[0].identifier.editor)) {
          this.groupView.moveEditors(editorsWithOptions, targetGroup);
        } else {
          this.groupView.copyEditors(editorsWithOptions, targetGroup);
        }
        targetGroup.focus();
      },
      onDrop: (e) => {
        this.updateDropFeedback(tab, false, e, tabIndex);
        let targetIndex = tabIndex;
        if (this.getTabDragOverLocation(e, tab) === "right") {
          targetIndex++;
        }
        this.onDrop(e, targetIndex, tabsContainer);
      }
    }));
    return disposables;
  }
  isSupportedDropTransfer(e) {
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const group = data[0];
        if (group.identifier === this.groupView.id) {
          return false;
        }
      }
      return true;
    }
    if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      return true;
    }
    if (e.dataTransfer && e.dataTransfer.types.length > 0) {
      return true;
    }
    return false;
  }
  updateDropFeedback(element, isDND, e, tabIndex) {
    const isTab = typeof tabIndex === "number";
    let dropTarget;
    if (isDND) {
      if (isTab) {
        dropTarget = this.computeDropTarget(e, tabIndex, element);
      } else {
        dropTarget = { leftElement: element.lastElementChild, rightElement: void 0 };
      }
    } else {
      dropTarget = void 0;
    }
    this.updateDropTarget(dropTarget);
  }
  updateDropTarget(newTarget) {
    const oldTargets = this.dropTarget;
    if (oldTargets === newTarget || oldTargets && newTarget && oldTargets.leftElement === newTarget.leftElement && oldTargets.rightElement === newTarget.rightElement) {
      return;
    }
    const dropClassLeft = "drop-target-left";
    const dropClassRight = "drop-target-right";
    if (oldTargets) {
      oldTargets.leftElement?.classList.remove(dropClassLeft);
      oldTargets.rightElement?.classList.remove(dropClassRight);
    }
    if (newTarget) {
      newTarget.leftElement?.classList.add(dropClassLeft);
      newTarget.rightElement?.classList.add(dropClassRight);
    }
    this.dropTarget = newTarget;
  }
  getTabDragOverLocation(e, tab) {
    const rect = tab.getBoundingClientRect();
    const offsetXRelativeToParent = e.clientX - rect.left;
    return offsetXRelativeToParent <= rect.width / 2 ? "left" : "right";
  }
  computeDropTarget(e, tabIndex, targetTab) {
    const isLeftSideOfTab = this.getTabDragOverLocation(e, targetTab) === "left";
    const isLastTab = tabIndex === this.tabsModel.count - 1;
    const isFirstTab = tabIndex === 0;
    if (isLeftSideOfTab && isFirstTab) {
      return { leftElement: void 0, rightElement: targetTab };
    }
    if (!isLeftSideOfTab && isLastTab) {
      return { leftElement: targetTab, rightElement: void 0 };
    }
    const tabBefore = isLeftSideOfTab ? targetTab.previousElementSibling : targetTab;
    const tabAfter = isLeftSideOfTab ? targetTab : targetTab.nextElementSibling;
    return { leftElement: tabBefore, rightElement: tabAfter };
  }
  async selectEditor(editor) {
    if (this.groupView.isActive(editor)) {
      return;
    }
    await this.groupView.setSelection(editor, this.groupView.selectedEditors);
  }
  async selectEditorsBetween(target, anchor) {
    const editorIndex = this.groupView.getIndexOfEditor(target);
    if (editorIndex === -1) {
      throw new BugIndicatingError();
    }
    const anchorEditorIndex = this.groupView.getIndexOfEditor(anchor);
    if (anchorEditorIndex === -1) {
      throw new BugIndicatingError();
    }
    let selection = this.groupView.selectedEditors;
    let currentEditorIndex = anchorEditorIndex;
    while (currentEditorIndex >= 0 && currentEditorIndex <= this.groupView.count - 1) {
      currentEditorIndex = anchorEditorIndex < editorIndex ? currentEditorIndex - 1 : currentEditorIndex + 1;
      const currentEditor = this.groupView.getEditorByIndex(currentEditorIndex);
      if (!currentEditor) {
        break;
      }
      if (!this.groupView.isSelected(currentEditor)) {
        break;
      }
      selection = selection.filter((editor) => !editor.matches(currentEditor));
    }
    const fromEditorIndex = anchorEditorIndex < editorIndex ? anchorEditorIndex : editorIndex;
    const toEditorIndex = anchorEditorIndex < editorIndex ? editorIndex : anchorEditorIndex;
    const editorsToSelect = this.groupView.getEditors(EditorsOrder.SEQUENTIAL).slice(fromEditorIndex, toEditorIndex + 1);
    for (const editor of editorsToSelect) {
      if (!this.groupView.isSelected(editor)) {
        selection.push(editor);
      }
    }
    const inactiveSelectedEditors = selection.filter((editor) => !editor.matches(target));
    await this.groupView.setSelection(target, inactiveSelectedEditors);
  }
  async unselectEditor(editor) {
    const isUnselectingActiveEditor = this.groupView.isActive(editor);
    if (isUnselectingActiveEditor && this.groupView.selectedEditors.length === 1) {
      return;
    }
    let newActiveEditor = assertReturnsDefined(this.groupView.activeEditor);
    if (isUnselectingActiveEditor) {
      const recentEditors = this.groupView.getEditors(EditorsOrder.MOST_RECENTLY_ACTIVE);
      for (let i = 1; i < recentEditors.length; i++) {
        const recentEditor = recentEditors[i];
        if (this.groupView.isSelected(recentEditor)) {
          newActiveEditor = recentEditor;
          break;
        }
      }
    }
    const inactiveSelectedEditors = this.groupView.selectedEditors.filter((e) => !e.matches(editor) && !e.matches(newActiveEditor));
    await this.groupView.setSelection(newActiveEditor, inactiveSelectedEditors);
  }
  async unselectAllEditors() {
    if (this.groupView.selectedEditors.length > 1) {
      const activeEditor = assertReturnsDefined(this.groupView.activeEditor);
      await this.groupView.setSelection(activeEditor, []);
    }
  }
  computeTabLabels() {
    const { labelFormat } = this.groupsView.partOptions;
    const { verbosity, shortenDuplicates } = this.getLabelConfigFlags(labelFormat);
    const labels = [];
    let activeEditorTabIndex = -1;
    this.tabsModel.getEditors(EditorsOrder.SEQUENTIAL).forEach((editor, tabIndex) => {
      labels.push({
        editor,
        name: editor.getName(),
        description: editor.getDescription(verbosity),
        forceDescription: editor.hasCapability(EditorInputCapabilities.ForceDescription),
        title: editor.getTitle(Verbosity.LONG),
        ariaLabel: computeEditorAriaLabel(editor, tabIndex, this.groupView, this.editorPartsView.count)
      });
      if (editor === this.tabsModel.activeEditor) {
        activeEditorTabIndex = tabIndex;
      }
    });
    if (shortenDuplicates) {
      this.shortenTabLabels(labels);
    }
    this.tabLabels = labels;
    this.activeTabLabel = labels[activeEditorTabIndex];
  }
  shortenTabLabels(labels) {
    const mapNameToDuplicates = /* @__PURE__ */ new Map();
    for (const label of labels) {
      if (typeof label.description === "string") {
        getOrSet(mapNameToDuplicates, label.name, []).push(label);
      } else {
        label.description = "";
      }
    }
    for (const [, duplicateLabels] of mapNameToDuplicates) {
      if (duplicateLabels.length === 1 && !duplicateLabels[0].forceDescription) {
        duplicateLabels[0].description = "";
        continue;
      }
      const mapDescriptionToDuplicates = /* @__PURE__ */ new Map();
      for (const duplicateLabel of duplicateLabels) {
        getOrSet(mapDescriptionToDuplicates, duplicateLabel.description, []).push(duplicateLabel);
      }
      let useLongDescriptions = false;
      for (const [, duplicateLabels2] of mapDescriptionToDuplicates) {
        if (!useLongDescriptions && duplicateLabels2.length > 1) {
          const [first, ...rest] = duplicateLabels2.map(({ editor }) => editor.getDescription(Verbosity.LONG));
          useLongDescriptions = rest.some((description) => description !== first);
        }
      }
      if (useLongDescriptions) {
        mapDescriptionToDuplicates.clear();
        for (const duplicateLabel of duplicateLabels) {
          duplicateLabel.description = duplicateLabel.editor.getDescription(Verbosity.LONG);
          getOrSet(mapDescriptionToDuplicates, duplicateLabel.description, []).push(duplicateLabel);
        }
      }
      const descriptions = [];
      for (const [description] of mapDescriptionToDuplicates) {
        descriptions.push(description);
      }
      if (descriptions.length === 1) {
        for (const label of mapDescriptionToDuplicates.get(descriptions[0]) || []) {
          if (!label.forceDescription) {
            label.description = "";
          }
        }
        continue;
      }
      const shortenedDescriptions = shorten(descriptions, this.path.sep);
      descriptions.forEach((description, tabIndex) => {
        for (const label of mapDescriptionToDuplicates.get(description) || []) {
          label.description = shortenedDescriptions[tabIndex];
        }
      });
    }
  }
  getLabelConfigFlags(value) {
    switch (value) {
      case "short":
        return { verbosity: Verbosity.SHORT, shortenDuplicates: false };
      case "medium":
        return { verbosity: Verbosity.MEDIUM, shortenDuplicates: false };
      case "long":
        return { verbosity: Verbosity.LONG, shortenDuplicates: false };
      default:
        return { verbosity: Verbosity.MEDIUM, shortenDuplicates: true };
    }
  }
  redraw(options) {
    if (this.tabsAndActionsContainer) {
      let tabsContainerBorderColor = this.getColor(EDITOR_GROUP_HEADER_TABS_BORDER);
      if (!tabsContainerBorderColor && isHighContrast(this.theme.type)) {
        tabsContainerBorderColor = this.getColor(TAB_BORDER) || this.getColor(contrastBorder);
      }
      if (tabsContainerBorderColor) {
        this.tabsAndActionsContainer.classList.add("tabs-border-bottom");
        this.tabsAndActionsContainer.style.setProperty("--tabs-border-bottom-color", tabsContainerBorderColor.toString());
      } else {
        this.tabsAndActionsContainer.classList.remove("tabs-border-bottom");
        this.tabsAndActionsContainer.style.removeProperty("--tabs-border-bottom-color");
      }
    }
    this.forEachTab((editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) => {
      this.redrawTab(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar);
    });
    this.updateEditorActionsToolbar();
    this.layout(this.dimensions, options);
  }
  redrawTab(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel, tabActionBar) {
    const isTabSticky = this.tabsModel.isSticky(tabIndex);
    const options = this.groupsView.partOptions;
    this.redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel);
    const hasUnpinAction = isTabSticky && options.tabActionUnpinVisibility;
    const hasCloseAction = !hasUnpinAction && options.tabActionCloseVisibility;
    const hasAction = hasUnpinAction || hasCloseAction;
    let tabAction;
    if (hasAction) {
      tabAction = hasUnpinAction ? this.unpinEditorAction : this.closeEditorAction;
    } else {
      tabAction = isTabSticky ? this.unpinEditorAction : this.closeEditorAction;
    }
    if (!tabActionBar.hasAction(tabAction)) {
      if (!tabActionBar.isEmpty()) {
        tabActionBar.clear();
      }
      tabActionBar.push(tabAction, { icon: true, label: false, keybinding: this.getKeybindingLabel(tabAction) });
    }
    tabContainer.classList.toggle(`pinned-action-off`, isTabSticky && !hasUnpinAction);
    tabContainer.classList.toggle(`close-action-off`, !hasUnpinAction && !hasCloseAction);
    for (const option of ["left", "right"]) {
      tabContainer.classList.toggle(`tab-actions-${option}`, hasAction && options.tabActionLocation === option);
    }
    const tabSizing = isTabSticky && options.pinnedTabSizing === "shrink" ? "shrink" : options.tabSizing;
    for (const option of ["fit", "shrink", "fixed"]) {
      tabContainer.classList.toggle(`sizing-${option}`, tabSizing === option);
    }
    tabContainer.classList.toggle("has-icon", options.showIcons && options.hasIcons);
    tabContainer.classList.toggle("sticky", isTabSticky);
    for (const option of ["normal", "compact", "shrink"]) {
      tabContainer.classList.toggle(`sticky-${option}`, isTabSticky && options.pinnedTabSizing === option);
    }
    if (!options.wrapTabs && isTabSticky && options.pinnedTabSizing !== "normal") {
      tabContainer.style.left = `${tabIndex * this.getStickyTabWidth(options.pinnedTabSizing)}px`;
    } else {
      tabContainer.style.left = "auto";
    }
    this.redrawTabBorders(tabIndex, tabContainer);
    this.redrawTabSelectedActiveAndDirty(this.groupsView.activeGroup === this.groupView, editor, tabContainer, tabActionBar);
  }
  redrawTabLabel(editor, tabIndex, tabContainer, tabLabelWidget, tabLabel) {
    const options = this.groupsView.partOptions;
    let name;
    let namePrefix;
    let forceLabel = false;
    let fileDecorationBadges = Boolean(options.decorations?.badges);
    const fileDecorationColors = Boolean(options.decorations?.colors);
    let description;
    if (options.pinnedTabSizing === "compact" && this.tabsModel.isSticky(tabIndex)) {
      const isShowingIcons = options.showIcons && options.hasIcons;
      name = isShowingIcons ? "" : tabLabel.name?.charAt(0).toUpperCase();
      description = "";
      forceLabel = true;
      fileDecorationBadges = false;
    } else {
      name = tabLabel.name;
      namePrefix = options.showTabIndex ? `${this.toEditorIndex(tabIndex) + 1}: ` : void 0;
      description = tabLabel.description || "";
    }
    if (tabLabel.ariaLabel) {
      tabContainer.setAttribute("aria-label", tabLabel.ariaLabel);
      tabContainer.setAttribute("aria-description", "");
    }
    tabLabelWidget.setResource(
      { name, description, resource: EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.BOTH }) },
      {
        title: this.getHoverTitle(editor),
        extraClasses: coalesce(["tab-label", fileDecorationBadges ? "tab-label-has-badge" : void 0].concat(editor.getLabelExtraClasses())),
        italic: !this.tabsModel.isPinned(editor),
        forceLabel,
        fileDecorations: {
          colors: fileDecorationColors,
          badges: fileDecorationBadges
        },
        icon: editor.getIcon(),
        hideIcon: options.showIcons === false,
        namePrefix
      }
    );
    const resource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    if (resource) {
      tabContainer.setAttribute("data-resource-name", basenameOrAuthority(resource));
    } else {
      tabContainer.removeAttribute("data-resource-name");
    }
  }
  redrawTabSelectedActiveAndDirty(isGroupActive, editor, tabContainer, tabActionBar) {
    const isTabActive = this.tabsModel.isActive(editor);
    const hasModifiedBorderTop = this.doRedrawTabDirty(isGroupActive, isTabActive, editor, tabContainer);
    this.doRedrawTabActive(isGroupActive, !hasModifiedBorderTop, editor, tabContainer, tabActionBar);
  }
  doRedrawTabActive(isGroupActive, allowBorderTop, editor, tabContainer, tabActionBar) {
    const isActive = this.tabsModel.isActive(editor);
    const isSelected = this.tabsModel.isSelected(editor);
    tabContainer.classList.toggle("active", isActive);
    tabContainer.classList.toggle("selected", isSelected);
    tabContainer.classList.toggle("multi-selected", isSelected && this.groupView.selectedEditors.length > 1);
    tabContainer.setAttribute("aria-selected", isSelected ? "true" : "false");
    tabContainer.tabIndex = isActive ? 0 : -1;
    tabActionBar.setFocusable(isActive);
    if (isActive) {
      const activeTabBorderColorBottom = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER : TAB_UNFOCUSED_ACTIVE_BORDER);
      tabContainer.classList.toggle("tab-border-bottom", !!activeTabBorderColorBottom);
      tabContainer.style.setProperty("--tab-border-bottom-color", activeTabBorderColorBottom ?? "");
    }
    let tabBorderColorTop = null;
    if (allowBorderTop) {
      if (isActive) {
        tabBorderColorTop = this.getColor(isGroupActive ? TAB_ACTIVE_BORDER_TOP : TAB_UNFOCUSED_ACTIVE_BORDER_TOP);
      }
      if (tabBorderColorTop === null && isSelected) {
        tabBorderColorTop = this.getColor(TAB_SELECTED_BORDER_TOP);
      }
    }
    tabContainer.classList.toggle("tab-border-top", !!tabBorderColorTop);
    tabContainer.style.setProperty("--tab-border-top-color", tabBorderColorTop ?? "");
  }
  doRedrawTabDirty(isGroupActive, isTabActive, editor, tabContainer) {
    let hasModifiedBorderColor = false;
    if (editor.isDirty() && !editor.isSaving()) {
      tabContainer.classList.add("dirty");
      if (this.groupsView.partOptions.highlightModifiedTabs) {
        let modifiedBorderColor;
        if (isGroupActive && isTabActive) {
          modifiedBorderColor = this.getColor(TAB_ACTIVE_MODIFIED_BORDER);
        } else if (isGroupActive && !isTabActive) {
          modifiedBorderColor = this.getColor(TAB_INACTIVE_MODIFIED_BORDER);
        } else if (!isGroupActive && isTabActive) {
          modifiedBorderColor = this.getColor(TAB_UNFOCUSED_ACTIVE_MODIFIED_BORDER);
        } else {
          modifiedBorderColor = this.getColor(TAB_UNFOCUSED_INACTIVE_MODIFIED_BORDER);
        }
        if (modifiedBorderColor) {
          hasModifiedBorderColor = true;
          tabContainer.classList.add("dirty-border-top");
          tabContainer.style.setProperty("--tab-dirty-border-top-color", modifiedBorderColor);
        }
      } else {
        tabContainer.classList.remove("dirty-border-top");
        tabContainer.style.removeProperty("--tab-dirty-border-top-color");
      }
    } else {
      tabContainer.classList.remove("dirty", "dirty-border-top");
      tabContainer.style.removeProperty("--tab-dirty-border-top-color");
    }
    return hasModifiedBorderColor;
  }
  redrawTabBorders(tabIndex, tabContainer) {
    const isTabSticky = this.tabsModel.isSticky(tabIndex);
    const isTabLastSticky = isTabSticky && this.tabsModel.stickyCount === tabIndex + 1;
    const showLastStickyTabBorderColor = this.tabsModel.stickyCount !== this.tabsModel.count;
    const borderRightColor = (isTabLastSticky && showLastStickyTabBorderColor ? this.getColor(TAB_LAST_PINNED_BORDER) : void 0) || this.getColor(TAB_BORDER) || this.getColor(contrastBorder);
    tabContainer.style.borderRight = borderRightColor ? `1px solid ${borderRightColor}` : "";
    tabContainer.style.outlineColor = this.getColor(activeContrastBorder) || "";
  }
  prepareEditorActions(editorActions) {
    const isGroupActive = this.groupsView.activeGroup === this.groupView;
    if (isGroupActive) {
      return editorActions;
    } else {
      return {
        primary: this.groupsView.partOptions.alwaysShowEditorActions ? editorActions.primary : editorActions.primary.filter((action) => action.id === UNLOCK_GROUP_COMMAND_ID),
        secondary: editorActions.secondary
      };
    }
  }
  prepareEditorLayoutActions(editorActions) {
    return editorActions;
  }
  getHeight() {
    if (this.dimensions.used) {
      return this.dimensions.used.height;
    } else {
      return this.computeHeight();
    }
  }
  computeHeight() {
    let height;
    if (!this.visible) {
      height = 0;
    } else if (this.groupsView.partOptions.wrapTabs && this.tabsAndActionsContainer?.classList.contains("wrapping")) {
      height = this.tabsAndActionsContainer.offsetHeight;
    } else {
      height = this.tabHeight;
    }
    return height;
  }
  layout(dimensions, options) {
    Object.assign(this.dimensions, dimensions);
    if (this.visible) {
      if (!this.layoutScheduler.value) {
        const disposable = scheduleAtNextAnimationFrame(getWindow(this.parent), () => {
          this.doLayout(
            this.dimensions,
            this.layoutScheduler.value?.options
            /* ensure to pick up latest options */
          );
          this.layoutScheduler.clear();
        });
        this.layoutScheduler.value = { options, dispose: () => disposable.dispose() };
      }
      if (options?.forceRevealActiveTab) {
        this.layoutScheduler.value.options = {
          ...this.layoutScheduler.value.options,
          forceRevealActiveTab: true
        };
      }
    }
    if (!this.dimensions.used) {
      this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight());
    }
    return this.dimensions.used;
  }
  doLayout(dimensions, options) {
    if (dimensions.container !== Dimension.None && dimensions.available !== Dimension.None) {
      this.doLayoutTabs(dimensions, options);
    }
    const oldDimension = this.dimensions.used;
    const newDimension = this.dimensions.used = new Dimension(dimensions.container.width, this.computeHeight());
    if (oldDimension && oldDimension.height !== newDimension.height) {
      this.groupView.relayout();
    }
  }
  doLayoutTabs(dimensions, options) {
    const tabsWrapMultiLine = this.doLayoutTabsWrapping(dimensions);
    if (!tabsWrapMultiLine) {
      this.doLayoutTabsNonWrapping(options);
    } else {
      assertReturnsDefined(this.stickyTabsBackground).style.width = "0px";
    }
  }
  doLayoutTabsWrapping(dimensions) {
    const [tabsAndActionsContainer, tabsContainer, editorToolbarContainer, tabsScrollbar] = assertReturnsAllDefined(this.tabsAndActionsContainer, this.tabsContainer, this.editorActionsToolbarContainer, this.tabsScrollbar);
    const layoutActionsContainer = this.editorLayoutActionsToolbarContainer;
    const editorToolbarWidth = () => editorToolbarContainer.offsetWidth + (layoutActionsContainer?.offsetWidth ?? 0);
    const didTabsWrapMultiLine = tabsAndActionsContainer.classList.contains("wrapping");
    let tabsWrapMultiLine = didTabsWrapMultiLine;
    function updateTabsWrapping(enabled) {
      tabsWrapMultiLine = enabled;
      tabsAndActionsContainer.classList.toggle("wrapping", tabsWrapMultiLine);
      tabsContainer.style.setProperty("--last-tab-margin-right", tabsWrapMultiLine ? `${editorToolbarWidth()}px` : "0");
      tabsAndActionsContainer.style.setProperty("--last-tab-layout-actions-width", `${layoutActionsContainer?.offsetWidth ?? 0}px`);
      for (const tab of tabsContainer.children) {
        tab.classList.remove("last-in-row");
      }
    }
    if (this.groupsView.partOptions.wrapTabs) {
      const visibleTabsWidth = tabsContainer.offsetWidth;
      const allTabsWidth = tabsContainer.scrollWidth;
      const lastTabFitsWrapped = () => {
        const lastTab = this.getLastTab();
        if (!lastTab) {
          return true;
        }
        const lastTabOverlapWithToolbarWidth = lastTab.offsetWidth + editorToolbarWidth() - dimensions.available.width;
        if (lastTabOverlapWithToolbarWidth > 1) {
          return false;
        }
        return true;
      };
      if (tabsWrapMultiLine || allTabsWidth > visibleTabsWidth && lastTabFitsWrapped()) {
        updateTabsWrapping(true);
      }
      if (tabsWrapMultiLine) {
        if (tabsContainer.offsetHeight > dimensions.available.height || // if height exceeds available height
        allTabsWidth === visibleTabsWidth && tabsContainer.offsetHeight === this.tabHeight || // if wrapping is not needed anymore
        !lastTabFitsWrapped()) {
          updateTabsWrapping(false);
        }
      }
    } else if (didTabsWrapMultiLine) {
      updateTabsWrapping(false);
    }
    if (tabsWrapMultiLine && !didTabsWrapMultiLine) {
      const visibleTabsWidth = tabsContainer.offsetWidth;
      tabsScrollbar.setScrollDimensions({
        width: visibleTabsWidth,
        scrollWidth: visibleTabsWidth
      });
    }
    if (tabsWrapMultiLine) {
      const tabs = /* @__PURE__ */ new Map();
      let currentTabsPosY = void 0;
      let lastTab = void 0;
      for (const child of tabsContainer.children) {
        if (child === this.addTabContainer) {
          continue;
        }
        const tab = child;
        const tabPosY = tab.offsetTop;
        if (tabPosY !== currentTabsPosY) {
          currentTabsPosY = tabPosY;
          if (lastTab) {
            tabs.set(lastTab, true);
          }
        }
        lastTab = tab;
        tabs.set(tab, false);
      }
      if (lastTab) {
        tabs.set(lastTab, true);
      }
      for (const [tab, lastInRow] of tabs) {
        tab.classList.toggle("last-in-row", lastInRow);
      }
    }
    return tabsWrapMultiLine;
  }
  doLayoutTabsNonWrapping(options) {
    const [tabsContainer, tabsScrollbar] = assertReturnsAllDefined(this.tabsContainer, this.tabsScrollbar);
    const visibleTabsWidth = tabsContainer.offsetWidth;
    const allTabsWidth = tabsContainer.scrollWidth;
    let stickyTabsWidth = 0;
    if (this.tabsModel.stickyCount > 0) {
      const stickyTabWidth = this.getStickyTabWidth(this.groupsView.partOptions.pinnedTabSizing);
      stickyTabsWidth = this.tabsModel.stickyCount * stickyTabWidth;
      for (let tabIndex = 0; tabIndex < this.tabsModel.stickyCount; tabIndex++) {
        const tab = this.getTabAtIndex(tabIndex);
        if (tab) {
          tab.style.left = `${tabIndex * stickyTabWidth}px`;
        }
      }
    }
    const activeTabAndIndex = this.tabsModel.activeEditor ? this.getTabAndIndex(this.tabsModel.activeEditor) : void 0;
    const [activeTab, activeTabIndex] = activeTabAndIndex ?? [void 0, void 0];
    let activeTabPositionStatic = this.groupsView.partOptions.pinnedTabSizing !== "normal" && typeof activeTabIndex === "number" && this.tabsModel.isSticky(activeTabIndex);
    let availableTabsContainerWidth = visibleTabsWidth - stickyTabsWidth;
    if (this.tabsModel.stickyCount > 0 && availableTabsContainerWidth < MultiEditorTabsControl.TAB_WIDTH.fit) {
      tabsContainer.classList.add("disable-sticky-tabs");
      availableTabsContainerWidth = visibleTabsWidth;
      stickyTabsWidth = 0;
      activeTabPositionStatic = false;
    } else {
      tabsContainer.classList.remove("disable-sticky-tabs");
    }
    assertReturnsDefined(this.stickyTabsBackground).style.width = `${stickyTabsWidth}px`;
    let activeTabPosX;
    let activeTabWidth;
    if (!this.blockRevealActiveTab && activeTab) {
      activeTabPosX = activeTab.offsetLeft;
      activeTabWidth = activeTab.offsetWidth;
    }
    const { width: oldVisibleTabsWidth, scrollWidth: oldAllTabsWidth } = tabsScrollbar.getScrollDimensions();
    tabsScrollbar.setScrollDimensions({
      width: visibleTabsWidth,
      scrollWidth: allTabsWidth
    });
    const dimensionsChanged = oldVisibleTabsWidth !== visibleTabsWidth || oldAllTabsWidth !== allTabsWidth;
    if (this.blockRevealActiveTab || // explicitly disabled
    typeof activeTabPosX !== "number" || // invalid dimension
    typeof activeTabWidth !== "number" || // invalid dimension
    activeTabPositionStatic || // static tab (sticky)
    !dimensionsChanged && !options?.forceRevealActiveTab) {
      this.blockRevealActiveTab = false;
      return;
    }
    const tabsContainerScrollPosX = tabsScrollbar.getScrollPosition().scrollLeft;
    const activeTabFits = activeTabWidth <= availableTabsContainerWidth;
    const adjustedActiveTabPosX = activeTabPosX - stickyTabsWidth;
    if (activeTabFits && tabsContainerScrollPosX + availableTabsContainerWidth < adjustedActiveTabPosX + activeTabWidth) {
      tabsScrollbar.setScrollPosition({
        scrollLeft: tabsContainerScrollPosX + (adjustedActiveTabPosX + activeTabWidth - (tabsContainerScrollPosX + availableTabsContainerWidth))
      });
    } else if (tabsContainerScrollPosX > adjustedActiveTabPosX || !activeTabFits) {
      tabsScrollbar.setScrollPosition({
        scrollLeft: adjustedActiveTabPosX
      });
    }
  }
  getStickyTabWidth(pinnedTabSizing) {
    const hasStyleOverride = Boolean(this.parent.closest(".style-override"));
    const styleOverrideSpacing = hasStyleOverride ? MultiEditorTabsControl.STYLE_OVERRIDE_PINNED_TAB_SPACING : 0;
    switch (pinnedTabSizing) {
      case "compact":
        return (hasStyleOverride ? MultiEditorTabsControl.STYLE_OVERRIDE_COMPACT_PINNED_TAB_WIDTH : MultiEditorTabsControl.TAB_WIDTH.compact) + styleOverrideSpacing;
      case "shrink":
        return MultiEditorTabsControl.TAB_WIDTH.shrink + styleOverrideSpacing;
      default:
        return 0;
    }
  }
  updateTabsControlVisibility() {
    const tabsAndActionsContainer = assertReturnsDefined(this.tabsAndActionsContainer);
    tabsAndActionsContainer.classList.toggle("empty", !this.visible);
    if (!this.visible && this.dimensions) {
      this.dimensions.used = void 0;
    }
  }
  get visible() {
    return this.tabsModel.count > 0;
  }
  getTabAndIndex(editor) {
    const tabIndex = this.tabsModel.indexOf(editor);
    const tab = this.getTabAtIndex(tabIndex);
    if (tab) {
      return [tab, tabIndex];
    }
    return void 0;
  }
  getTabAtIndex(tabIndex) {
    if (tabIndex >= 0) {
      const tabsContainer = assertReturnsDefined(this.tabsContainer);
      return tabsContainer.children[tabIndex];
    }
    return void 0;
  }
  getLastTab() {
    return this.getTabAtIndex(this.tabsModel.count - 1);
  }
  blockRevealActiveTabOnce() {
    this.blockRevealActiveTab = true;
  }
  originatesFromTabActionBar(e) {
    let element;
    if (isMouseEvent(e)) {
      element = e.target || e.srcElement;
    } else {
      element = e.initialTarget;
    }
    return !!findParentWithClass(element, "action-item", "tab");
  }
  async onDrop(e, targetTabIndex, tabsContainer) {
    EventHelper.stop(e, true);
    this.updateDropFeedback(tabsContainer, false, e, targetTabIndex);
    tabsContainer.classList.remove("scroll");
    let targetEditorIndex = this.tabsModel instanceof UnstickyEditorGroupModel ? targetTabIndex + this.groupView.stickyCount : targetTabIndex;
    const options = {
      sticky: this.tabsModel instanceof StickyEditorGroupModel && this.tabsModel.stickyCount === targetEditorIndex,
      index: targetEditorIndex
    };
    if (this.groupTransfer.hasData(DraggedEditorGroupIdentifier.prototype)) {
      const data = this.groupTransfer.getData(DraggedEditorGroupIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const sourceGroup = this.editorPartsView.getGroup(data[0].identifier);
        if (sourceGroup) {
          const mergeGroupOptions = { index: targetEditorIndex };
          if (!this.isMoveOperation(e, sourceGroup.id)) {
            mergeGroupOptions.mode = MergeGroupMode.COPY_EDITORS;
          }
          this.groupsView.mergeGroup(sourceGroup, this.groupView, mergeGroupOptions);
        }
        this.groupView.focus();
        this.groupTransfer.clearData(DraggedEditorGroupIdentifier.prototype);
      }
    } else if (this.editorTransfer.hasData(DraggedEditorIdentifier.prototype)) {
      const data = this.editorTransfer.getData(DraggedEditorIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const sourceGroup = this.editorPartsView.getGroup(data[0].identifier.groupId);
        if (sourceGroup) {
          for (const de of data) {
            const editor = de.identifier.editor;
            if (sourceGroup.id !== de.identifier.groupId) {
              continue;
            }
            const sourceEditorIndex = sourceGroup.getIndexOfEditor(editor);
            if (sourceGroup === this.groupView && sourceEditorIndex < targetEditorIndex) {
              targetEditorIndex--;
            }
            if (this.isMoveOperation(e, de.identifier.groupId, editor)) {
              sourceGroup.moveEditor(editor, this.groupView, { ...options, index: targetEditorIndex });
              if (this.tabsModel instanceof UnstickyEditorGroupModel && this.groupView.isSticky(editor)) {
                this.groupView.unstickEditor(editor);
              }
            } else {
              sourceGroup.copyEditor(editor, this.groupView, { ...options, index: targetEditorIndex });
            }
            targetEditorIndex++;
          }
        }
      }
      this.groupView.focus();
      this.editorTransfer.clearData(DraggedEditorIdentifier.prototype);
    } else if (this.treeItemsTransfer.hasData(DraggedTreeItemsIdentifier.prototype)) {
      const data = this.treeItemsTransfer.getData(DraggedTreeItemsIdentifier.prototype);
      if (Array.isArray(data) && data.length > 0) {
        const editors = [];
        for (const id of data) {
          const dataTransferItem = await this.treeViewsDragAndDropService.removeDragOperationTransfer(id.identifier);
          if (dataTransferItem) {
            const treeDropData = await extractTreeDropData(dataTransferItem);
            editors.push(...treeDropData.map((editor) => ({ ...editor, options: { ...editor.options, pinned: true, index: targetEditorIndex } })));
          }
        }
        this.editorService.openEditors(editors, this.groupView, { validateTrust: true });
      }
      this.treeItemsTransfer.clearData(DraggedTreeItemsIdentifier.prototype);
    } else {
      const dropHandler = this.instantiationService.createInstance(ResourcesDropHandler, { allowWorkspaceOpen: false });
      dropHandler.handleDrop(e, getWindow(this.parent), () => this.groupView, () => this.groupView.focus(), options);
    }
  }
  dispose() {
    super.dispose();
    this.tabDisposables = dispose(this.tabDisposables);
  }
};
MultiEditorTabsControl.SCROLLBAR_SIZES = {
  default: 3,
  large: 10
};
MultiEditorTabsControl.TAB_WIDTH = {
  compact: 38,
  shrink: 80,
  fit: 120
};
MultiEditorTabsControl.STYLE_OVERRIDE_COMPACT_PINNED_TAB_WIDTH = 28;
MultiEditorTabsControl.STYLE_OVERRIDE_PINNED_TAB_SPACING = 4;
MultiEditorTabsControl.DRAG_OVER_OPEN_TAB_THRESHOLD = 1500;
MultiEditorTabsControl.MOUSE_WHEEL_EVENT_THRESHOLD = 150;
MultiEditorTabsControl.MOUSE_WHEEL_DISTANCE_THRESHOLD = 1.5;
MultiEditorTabsControl = __decorateClass([
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, INotificationService),
  __decorateParam(11, IQuickInputService),
  __decorateParam(12, IThemeService),
  __decorateParam(13, IEditorService),
  __decorateParam(14, IPathService),
  __decorateParam(15, ITreeViewsDnDService),
  __decorateParam(16, IEditorResolverService),
  __decorateParam(17, IHostService),
  __decorateParam(18, IMenuService)
], MultiEditorTabsControl);
registerThemingParticipant((theme, collector) => {
  const borderColor = theme.getColor(TAB_BORDER);
  if (borderColor) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title > .tabs-and-actions-container.wrapping .tabs-container > .tab {
				border-bottom: 1px solid ${borderColor};
			}
		`);
  }
  const activeContrastBorderColor = theme.getColor(activeContrastBorder);
  if (activeContrastBorderColor) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active,
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active:hover  {
				outline: 1px solid;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.selected:not(.active):not(:hover)  {
				outline: 1px dotted;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab.active:focus {
				outline-style: dashed;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active {
				outline: 1px dashed;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover  {
				outline: 1px dashed;
				outline-offset: -5px;
			}

			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.active:hover > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.dirty > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab.sticky > .tab-actions .action-label,
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover > .tab-actions .action-label {
				opacity: 1 !important;
			}
		`);
  }
  const contrastBorderColor = theme.getColor(contrastBorder);
  if (contrastBorderColor) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .editor-actions {
				outline: 1px solid ${contrastBorderColor}
			}
		`);
  }
  const tabHoverBackground = theme.getColor(TAB_HOVER_BACKGROUND);
  if (tabHoverBackground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:not(.selected):hover {
				background-color: ${tabHoverBackground} !important;
			}
		`);
  }
  const tabUnfocusedHoverBackground = theme.getColor(TAB_UNFOCUSED_HOVER_BACKGROUND);
  if (tabUnfocusedHoverBackground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:not(.selected):hover  {
				background-color: ${tabUnfocusedHoverBackground} !important;
			}
		`);
  }
  const tabHoverForeground = theme.getColor(TAB_HOVER_FOREGROUND);
  if (tabHoverForeground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:not(.selected):hover  {
				color: ${tabHoverForeground} !important;
			}
		`);
  }
  const tabUnfocusedHoverForeground = theme.getColor(TAB_UNFOCUSED_HOVER_FOREGROUND);
  if (tabUnfocusedHoverForeground) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:not(.selected):hover  {
				color: ${tabUnfocusedHoverForeground} !important;
			}
		`);
  }
  const tabHoverBorder = theme.getColor(TAB_HOVER_BORDER);
  if (tabHoverBorder) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container.active > .title .tabs-container > .tab:hover > .tab-border-bottom-container {
				display: block;
				position: absolute;
				left: 0;
				pointer-events: none;
				width: 100%;
				z-index: 10;
				bottom: 0;
				height: 1px;
				background-color: ${tabHoverBorder};
			}
		`);
  }
  const tabUnfocusedHoverBorder = theme.getColor(TAB_UNFOCUSED_HOVER_BORDER);
  if (tabUnfocusedHoverBorder) {
    collector.addRule(`
			.monaco-workbench .part.editor > .content .editor-group-container > .title .tabs-container > .tab:hover > .tab-border-bottom-container  {
				display: block;
				position: absolute;
				left: 0;
				pointer-events: none;
				width: 100%;
				z-index: 10;
				bottom: 0;
				height: 1px;
				background-color: ${tabUnfocusedHoverBorder};
			}
		`);
  }
  if (!isHighContrast(theme.type) && !isSafari && !activeContrastBorderColor) {
    const workbenchBackground = WORKBENCH_BACKGROUND(theme);
    const editorBackgroundColor = theme.getColor(editorBackground);
    const editorGroupHeaderTabsBackground = theme.getColor(EDITOR_GROUP_HEADER_TABS_BACKGROUND);
    const editorDragAndDropBackground = theme.getColor(EDITOR_DRAG_AND_DROP_BACKGROUND);
    let adjustedTabBackground;
    if (editorGroupHeaderTabsBackground && editorBackgroundColor) {
      adjustedTabBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorBackgroundColor, workbenchBackground);
    }
    let adjustedTabDragBackground;
    if (editorGroupHeaderTabsBackground && editorBackgroundColor && editorDragAndDropBackground && editorBackgroundColor) {
      adjustedTabDragBackground = editorGroupHeaderTabsBackground.flatten(editorBackgroundColor, editorDragAndDropBackground, editorBackgroundColor, workbenchBackground);
    }
    const makeTabHoverBackgroundRule = (color, colorDrag, hasFocus = false) => `
			.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-shrink:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after,
			.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-fixed:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after {
				background: linear-gradient(to left, ${color}, transparent) !important;
			}

			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-shrink:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after,
			.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${hasFocus ? ".active" : ""} > .title .tabs-container > .tab.sizing-fixed:not(.dragged):not(.sticky-compact):hover > .tab-label > .monaco-icon-label-container::after {
				background: linear-gradient(to left, ${colorDrag}, transparent) !important;
			}
		`;
    if (tabHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabHoverBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabHoverBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag, true));
    }
    if (tabUnfocusedHoverBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabUnfocusedHoverBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabUnfocusedHoverBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabHoverBackgroundRule(adjustedColor, adjustedColorDrag));
    }
    if (editorDragAndDropBackground && adjustedTabDragBackground) {
      const adjustedColorDrag = editorDragAndDropBackground.flatten(adjustedTabDragBackground);
      collector.addRule(`
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container.active > .title .tabs-container > .tab.sizing-shrink.dragged-over:not(.active):not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container:not(.active) > .title .tabs-container > .tab.sizing-shrink.dragged-over:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container.active > .title .tabs-container > .tab.sizing-fixed.dragged-over:not(.active):not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container:not(.active) > .title .tabs-container > .tab.sizing-fixed.dragged-over:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${adjustedColorDrag}, transparent) !important;
				}
		`);
    }
    const makeTabBackgroundRule = (color, colorDrag, focused, active) => `
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-shrink${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content:not(.dragged-over) .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-fixed${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${color}, transparent);
				}

				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-shrink${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after,
				.monaco-workbench .part.editor > .content.dragged-over .editor-group-container${focused ? ".active" : ":not(.active)"} > .title .tabs-container > .tab.sizing-fixed${active ? ".active" : ""}:not(.dragged):not(.sticky-compact) > .tab-label > .monaco-icon-label-container::after {
					background: linear-gradient(to left, ${colorDrag}, transparent);
				}
		`;
    const tabActiveBackground = theme.getColor(TAB_ACTIVE_BACKGROUND);
    if (tabActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabActiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabActiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, true, true));
    }
    const tabUnfocusedActiveBackground = theme.getColor(TAB_UNFOCUSED_ACTIVE_BACKGROUND);
    if (tabUnfocusedActiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabUnfocusedActiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabUnfocusedActiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, false, true));
    }
    const tabInactiveBackground = theme.getColor(TAB_INACTIVE_BACKGROUND);
    if (tabInactiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabInactiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabInactiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, true, false));
    }
    const tabUnfocusedInactiveBackground = theme.getColor(TAB_UNFOCUSED_INACTIVE_BACKGROUND);
    if (tabUnfocusedInactiveBackground && adjustedTabBackground && adjustedTabDragBackground) {
      const adjustedColor = tabUnfocusedInactiveBackground.flatten(adjustedTabBackground);
      const adjustedColorDrag = tabUnfocusedInactiveBackground.flatten(adjustedTabDragBackground);
      collector.addRule(makeTabBackgroundRule(adjustedColor, adjustedColorDrag, false, false));
    }
  }
});
export {
  MultiEditorTabsControl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9tdWx0aUVkaXRvclRhYnNDb250cm9sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL211bHRpZWRpdG9ydGFic2NvbnRyb2wuY3NzJztcbmltcG9ydCB7IGlzTGludXgsIGlzTWFjaW50b3NoLCBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBzaG9ydGVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFZlcmJvc2l0eSwgSUVkaXRvclBhcnRPcHRpb25zLCBTaWRlQnlTaWRlRWRpdG9yLCBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIElVbnR5cGVkRWRpdG9ySW5wdXQsIHByZXZlbnRFZGl0b3JDbG9zZSwgRWRpdG9yQ2xvc2VNZXRob2QsIEVkaXRvcnNPcmRlciwgSVRvb2xiYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgY29tcHV0ZUVkaXRvckFyaWFMYWJlbCB9IGZyb20gJy4uLy4uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBFdmVudFR5cGUgYXMgVG91Y2hFdmVudFR5cGUsIEdlc3R1cmVFdmVudCwgR2VzdHVyZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90b3VjaC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGFiZWxzLCBJUmVzb3VyY2VMYWJlbCwgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSIH0gZnJvbSAnLi4vLi4vbGFiZWxzLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldEZsYXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbW1hbmRzQ29udGV4dEFjdGlvblJ1bm5lciwgRWRpdG9yVGFic0NvbnRyb2wgfSBmcm9tICcuL2VkaXRvclRhYnNDb250cm9sLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UsIERpc3Bvc2FibGVTdG9yZSwgY29tYmluZWREaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBnZXRPclNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVEFCX0lOQUNUSVZFX0JBQ0tHUk9VTkQsIFRBQl9BQ1RJVkVfQkFDS0dST1VORCwgVEFCX0JPUkRFUiwgRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCwgVEFCX1VORk9DVVNFRF9BQ1RJVkVfQkFDS0dST1VORCwgVEFCX1VORk9DVVNFRF9BQ1RJVkVfQk9SREVSLCBUQUJfQUNUSVZFX0JPUkRFUiwgVEFCX0hPVkVSX0JBQ0tHUk9VTkQsIFRBQl9IT1ZFUl9CT1JERVIsIFRBQl9VTkZPQ1VTRURfSE9WRVJfQkFDS0dST1VORCwgVEFCX1VORk9DVVNFRF9IT1ZFUl9CT1JERVIsIEVESVRPUl9HUk9VUF9IRUFERVJfVEFCU19CQUNLR1JPVU5ELCBXT1JLQkVOQ0hfQkFDS0dST1VORCwgVEFCX0FDVElWRV9CT1JERVJfVE9QLCBUQUJfVU5GT0NVU0VEX0FDVElWRV9CT1JERVJfVE9QLCBUQUJfQUNUSVZFX01PRElGSUVEX0JPUkRFUiwgVEFCX0lOQUNUSVZFX01PRElGSUVEX0JPUkRFUiwgVEFCX1VORk9DVVNFRF9BQ1RJVkVfTU9ESUZJRURfQk9SREVSLCBUQUJfVU5GT0NVU0VEX0lOQUNUSVZFX01PRElGSUVEX0JPUkRFUiwgVEFCX1VORk9DVVNFRF9JTkFDVElWRV9CQUNLR1JPVU5ELCBUQUJfSE9WRVJfRk9SRUdST1VORCwgVEFCX1VORk9DVVNFRF9IT1ZFUl9GT1JFR1JPVU5ELCBFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQk9SREVSLCBUQUJfTEFTVF9QSU5ORURfQk9SREVSLCBUQUJfU0VMRUNURURfQk9SREVSX1RPUCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBhY3RpdmVDb250cmFzdEJvcmRlciwgY29udHJhc3RCb3JkZXIsIGVkaXRvckJhY2tncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZXNEcm9wSGFuZGxlciwgRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIsIERyYWdnZWRFZGl0b3JHcm91cElkZW50aWZpZXIsIGV4dHJhY3RUcmVlRHJvcERhdGEsIGlzV2luZG93RHJhZ2dlZE92ZXIgfSBmcm9tICcuLi8uLi9kbmQuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IE1lcmdlR3JvdXBNb2RlLCBJTWVyZ2VHcm91cE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIEV2ZW50SGVscGVyLCBEaW1lbnNpb24sIHNjaGVkdWxlQXROZXh0QW5pbWF0aW9uRnJhbWUsIGZpbmRQYXJlbnRXaXRoQ2xhc3MsIGNsZWFyTm9kZSwgRHJhZ0FuZERyb3BPYnNlcnZlciwgaXNNb3VzZUV2ZW50LCBnZXRXaW5kb3csICQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cE1lbnVJZHMsIElFZGl0b3JHcm91cHNWaWV3LCBFZGl0b3JTZXJ2aWNlSW1wbCwgSUVkaXRvckdyb3VwVmlldywgSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMsIElFZGl0b3JQYXJ0c1ZpZXcsIHByZXBhcmVNb3ZlQ29weUVkaXRvcnMgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDbG9zZUVkaXRvclRhYkFjdGlvbiwgVW5waW5FZGl0b3JBY3Rpb24gfSBmcm9tICcuL2VkaXRvckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQsIGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWVPckF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdGgsIHdpbjMyLCBwb3NpeCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgY29hbGVzY2UsIGluc2VydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBpc0hpZ2hDb250cmFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBpc1NhZmFyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aXZhdGlvbiwgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBVTkxPQ0tfR1JPVVBfQ09NTUFORF9JRCB9IGZyb20gJy4vZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSVRyZWVWaWV3c0RuRFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclRpdGxlQ29udHJvbERpbWVuc2lvbnMgfSBmcm9tICcuL2VkaXRvclRpdGxlQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBTdGlja3lFZGl0b3JHcm91cE1vZGVsLCBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2ZpbHRlcmVkRWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQgeyBJUmVhZG9ubHlFZGl0b3JHcm91cE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBhcHBseURyYWdJbWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kbmQvZG5kLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5pbnRlcmZhY2UgSUVkaXRvcklucHV0TGFiZWwge1xuXHRyZWFkb25seSBlZGl0b3I6IEVkaXRvcklucHV0O1xuXG5cdHJlYWRvbmx5IG5hbWU/OiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBmb3JjZURlc2NyaXB0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFyaWFMYWJlbD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElNdWx0aUVkaXRvclRhYnNDb250cm9sTGF5b3V0T3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdG8gZm9yY2UgcmV2ZWFsaW5nIHRoZSBhY3RpdmUgdGFiLCBldmVuIHdoZW5cblx0ICogdGhlIGRpbWVuc2lvbnMgaGF2ZSBub3QgY2hhbmdlZC4gVGhpcyBjYW4gYmUgdGhlIGNhc2Vcblx0ICogd2hlbiBhIHRhYiB3YXMgbWFkZSBhY3RpdmUgYW5kIG5lZWRzIHRvIGJlIHJldmVhbGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgZm9yY2VSZXZlYWxBY3RpdmVUYWI/OiB0cnVlO1xufVxuXG5pbnRlcmZhY2UgSVNjaGVkdWxlZE11bHRpRWRpdG9yVGFic0NvbnRyb2xMYXlvdXQgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cblx0LyoqXG5cdCAqIEFzc29jaWF0ZWQgb3B0aW9ucyB3aXRoIHRoZSBsYXlvdXQgY2FsbC5cblx0ICovXG5cdG9wdGlvbnM/OiBJTXVsdGlFZGl0b3JUYWJzQ29udHJvbExheW91dE9wdGlvbnM7XG59XG5cbmV4cG9ydCBjbGFzcyBNdWx0aUVkaXRvclRhYnNDb250cm9sIGV4dGVuZHMgRWRpdG9yVGFic0NvbnRyb2wge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNDUk9MTEJBUl9TSVpFUyA9IHtcblx0XHRkZWZhdWx0OiAzIGFzIGNvbnN0LFxuXHRcdGxhcmdlOiAxMCBhcyBjb25zdFxuXHR9O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRBQl9XSURUSCA9IHtcblx0XHRjb21wYWN0OiAzOCBhcyBjb25zdCxcblx0XHRzaHJpbms6IDgwIGFzIGNvbnN0LFxuXHRcdGZpdDogMTIwIGFzIGNvbnN0XG5cdH07XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNUWUxFX09WRVJSSURFX0NPTVBBQ1RfUElOTkVEX1RBQl9XSURUSCA9IDI4IGFzIGNvbnN0O1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTVFlMRV9PVkVSUklERV9QSU5ORURfVEFCX1NQQUNJTkcgPSA0IGFzIGNvbnN0O1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERSQUdfT1ZFUl9PUEVOX1RBQl9USFJFU0hPTEQgPSAxNTAwO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1PVVNFX1dIRUVMX0VWRU5UX1RIUkVTSE9MRCA9IDE1MDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTU9VU0VfV0hFRUxfRElTVEFOQ0VfVEhSRVNIT0xEID0gMS41O1xuXG5cdHByaXZhdGUgdGl0bGVDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHRhYnNBbmRBY3Rpb25zQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzdGlja3lUYWJzQmFja2dyb3VuZDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGFic0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdGFic1Njcm9sbGJhcjogU2Nyb2xsYWJsZUVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYWRkVGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSB0YWJTaXppbmdGaXhlZERpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjbG9zZUVkaXRvckFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xvc2VFZGl0b3JUYWJBY3Rpb24sIENsb3NlRWRpdG9yVGFiQWN0aW9uLklELCBDbG9zZUVkaXRvclRhYkFjdGlvbi5MQUJFTCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHVucGluRWRpdG9yQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShVbnBpbkVkaXRvckFjdGlvbiwgVW5waW5FZGl0b3JBY3Rpb24uSUQsIFVucGluRWRpdG9yQWN0aW9uLkxBQkVMKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0YWJSZXNvdXJjZUxhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUikpO1xuXHRwcml2YXRlIHRhYkxhYmVsczogSUVkaXRvcklucHV0TGFiZWxbXSA9IFtdO1xuXHRwcml2YXRlIGFjdGl2ZVRhYkxhYmVsOiBJRWRpdG9ySW5wdXRMYWJlbCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHRhYkFjdGlvbkJhcnM6IEFjdGlvbkJhcltdID0gW107XG5cdHByaXZhdGUgdGFiRGlzcG9zYWJsZXM6IElEaXNwb3NhYmxlW10gPSBbXTtcblxuXHRwcml2YXRlIGRpbWVuc2lvbnM6IElFZGl0b3JUaXRsZUNvbnRyb2xEaW1lbnNpb25zICYgeyB1c2VkPzogRGltZW5zaW9uIH0gPSB7XG5cdFx0Y29udGFpbmVyOiBEaW1lbnNpb24uTm9uZSxcblx0XHRhdmFpbGFibGU6IERpbWVuc2lvbi5Ob25lXG5cdH07XG5cblx0cHJpdmF0ZSByZWFkb25seSBsYXlvdXRTY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SVNjaGVkdWxlZE11bHRpRWRpdG9yVGFic0NvbnRyb2xMYXlvdXQ+KCkpO1xuXHRwcml2YXRlIGJsb2NrUmV2ZWFsQWN0aXZlVGFiOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcGF0aDogSVBhdGggPSBpc1dpbmRvd3MgPyB3aW4zMiA6IHBvc2l4O1xuXG5cdHByaXZhdGUgbGFzdE1vdXNlV2hlZWxFdmVudFRpbWUgPSAwO1xuXHRwcml2YXRlIGlzTW91c2VPdmVyVGFicyA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0ZWRpdG9yUGFydHNWaWV3OiBJRWRpdG9yUGFydHNWaWV3LFxuXHRcdGdyb3Vwc1ZpZXc6IElFZGl0b3JHcm91cHNWaWV3LFxuXHRcdGdyb3VwVmlldzogSUVkaXRvckdyb3VwVmlldyxcblx0XHR0YWJzTW9kZWw6IElSZWFkb25seUVkaXRvckdyb3VwTW9kZWwsXG5cdFx0bWVudUlkczogSUVkaXRvckdyb3VwTWVudUlkcyB8IHVuZGVmaW5lZCxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogRWRpdG9yU2VydmljZUltcGwsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElUcmVlVmlld3NEbkRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdHJlZVZpZXdzRHJhZ0FuZERyb3BTZXJ2aWNlOiBJVHJlZVZpZXdzRG5EU2VydmljZSxcblx0XHRASUVkaXRvclJlc29sdmVyU2VydmljZSBlZGl0b3JSZXNvbHZlclNlcnZpY2U6IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocGFyZW50LCBlZGl0b3JQYXJ0c1ZpZXcsIGdyb3Vwc1ZpZXcsIGdyb3VwVmlldywgdGFic01vZGVsLCBtZW51SWRzLCBjb250ZXh0TWVudVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHF1aWNrSW5wdXRTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGVkaXRvclJlc29sdmVyU2VydmljZSwgaG9zdFNlcnZpY2UsIG1lbnVTZXJ2aWNlKTtcblxuXHRcdC8vIFJlc29sdmUgdGhlIGNvcnJlY3QgcGF0aCBsaWJyYXJ5IGZvciB0aGUgT1Mgd2UgYXJlIG9uXG5cdFx0Ly8gSWYgd2UgYXJlIGNvbm5lY3RlZCB0byByZW1vdGUsIHRoaXMgYWNjb3VudHMgZm9yIHRoZVxuXHRcdC8vIHJlbW90ZSBPUy5cblx0XHQoYXN5bmMgKCkgPT4gdGhpcy5wYXRoID0gYXdhaXQgdGhpcy5wYXRoU2VydmljZS5wYXRoKSgpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gZGVjb3JhdGlvbnMgY2hhbmdpbmcgZm9yIG91ciByZXNvdXJjZSBsYWJlbHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRhYlJlc291cmNlTGFiZWxzLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKCkgPT4gdGhpcy5kb0hhbmRsZURlY29yYXRpb25zQ2hhbmdlKCkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRzdXBlci5jcmVhdGUocGFyZW50KTtcblxuXHRcdHRoaXMudGl0bGVDb250YWluZXIgPSBwYXJlbnQ7XG5cblx0XHQvLyBUYWJzIGFuZCBBY3Rpb25zIENvbnRhaW5lciAoYXJlIG9uIGEgc2luZ2xlIHJvdyB3aXRoIGZsZXggc2lkZS1ieS1zaWRlKVxuXHRcdHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIgPSAkKCcudGFicy1hbmQtYWN0aW9ucy1jb250YWluZXInKTtcblx0XHR0aGlzLnRpdGxlQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIpO1xuXG5cdFx0dGhpcy5zdGlja3lUYWJzQmFja2dyb3VuZCA9ICQoJy5zdGlja3ktdGFicy1iYWNrZ3JvdW5kJywgeyAnYXJpYS1oaWRkZW4nOiB0cnVlIH0pO1xuXG5cdFx0Ly8gVGFicyBDb250YWluZXJcblx0XHR0aGlzLnRhYnNDb250YWluZXIgPSAkKCcudGFicy1jb250YWluZXInLCB7XG5cdFx0XHRyb2xlOiAndGFibGlzdCcsXG5cdFx0XHQnYXJpYS1tdWx0aXNlbGVjdGFibGUnOiAndHJ1ZScsXG5cdFx0XHRkcmFnZ2FibGU6IHRydWVcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmFkZFRhcmdldCh0aGlzLnRhYnNDb250YWluZXIpKTtcblxuXHRcdHRoaXMudGFiU2l6aW5nRml4ZWREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGhpcy51cGRhdGVUYWJTaXppbmcoZmFsc2UpO1xuXG5cdFx0Ly8gVGFicyBTY3JvbGxiYXJcblx0XHR0aGlzLnRhYnNTY3JvbGxiYXIgPSB0aGlzLmNyZWF0ZVRhYnNTY3JvbGxiYXIodGhpcy50YWJzQ29udGFpbmVyKTtcblx0XHR0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMudGFic1Njcm9sbGJhci5nZXREb21Ob2RlKCkpO1xuXHRcdHRoaXMudGFic1Njcm9sbGJhci5nZXREb21Ob2RlKCkuYXBwZW5kQ2hpbGQodGhpcy5zdGlja3lUYWJzQmFja2dyb3VuZCk7XG5cblx0XHQvLyBUYWJzIENvbnRhaW5lciBsaXN0ZW5lcnNcblx0XHR0aGlzLnJlZ2lzdGVyVGFic0NvbnRhaW5lckxpc3RlbmVycyh0aGlzLnRhYnNDb250YWluZXIsIHRoaXMudGFic1Njcm9sbGJhcik7XG5cblx0XHQvLyBDcmVhdGUgYWRkIHRhYiBjb250cm9sIChvbmx5IHdoZW4gYSBtZW51IGlkIGlzIGNvbmZpZ3VyZWQsIGUuZy4gaW5cblx0XHQvLyB0aGUgc2luZ2xlLXBhbmUgQWdlbnRzIHdpbmRvdyBsYXlvdXQpLiBXaGVuIHVuc2V0LCBubyBhZGQtdGFiIGNvbnRyb2xcblx0XHQvLyBpcyBjcmVhdGVkIGFuZCB0aGUgbGFzdCB0YWIgcmVtYWlucyB0aGUgbGFzdCBjaGlsZCBvZiB0aGUgdGFic1xuXHRcdC8vIGNvbnRhaW5lciwgd2hpY2ggdGFiIGxheW91dCBsb2dpYyByZWxpZXMgb24gKHNlZSAjMzI0OTAyKS5cblx0XHRpZiAodGhpcy5tZW51SWRzPy50YWJzQmFyQWRkVGFiKSB7XG5cdFx0XHR0aGlzLmNyZWF0ZUFkZFRhYkNvbnRyb2wodGhpcy5tZW51SWRzLnRhYnNCYXJBZGRUYWIpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBFZGl0b3IgVG9vbGJhclxuXHRcdHRoaXMuY3JlYXRlRWRpdG9yQWN0aW9uc1Rvb2xCYXIodGhpcy50YWJzQW5kQWN0aW9uc0NvbnRhaW5lciwgWydlZGl0b3ItYWN0aW9ucyddKTtcblxuXHRcdC8vIFNldCB0YWJzIGNvbnRyb2wgdmlzaWJpbGl0eVxuXHRcdHRoaXMudXBkYXRlVGFic0NvbnRyb2xWaXNpYmlsaXR5KCk7XG5cblx0XHRyZXR1cm4gdGhpcy50YWJzQW5kQWN0aW9uc0NvbnRhaW5lcjtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQWRkVGFiQ29udHJvbChtZW51SWQ6IE1lbnVJZCk6IHZvaWQge1xuXHRcdGNvbnN0IHRhYnNDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnRhYnNDb250YWluZXIpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9ICQoJy50YWJzLWJhci1hZGQtdGFiJyk7XG5cdFx0dGFic0NvbnRhaW5lci5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXHRcdHRoaXMuYWRkVGFiQ29udGFpbmVyID0gY29udGFpbmVyO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVudVNlcnZpY2UuY3JlYXRlTWVudShtZW51SWQsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRjb25zdCBnZXRBY3Rpb25zID0gKCkgPT4gZ2V0RmxhdEFjdGlvbkJhckFjdGlvbnMobWVudS5nZXRBY3Rpb25zKHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgYWRkVGFiQWN0aW9uID0gdG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdlZGl0b3IudGFicy5hZGRUYWInLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZGRUYWInLCBcIkFkZCBUYWJcIiksXG5cdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uYWRkKSxcblx0XHRcdHJ1bjogKCkgPT4geyB9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBkcm9wZG93biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbShhZGRUYWJBY3Rpb24sIHsgZ2V0QWN0aW9ucyB9LCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0Y2xhc3NOYW1lczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5hZGQpLFxuXHRcdFx0a2V5YmluZGluZ1Byb3ZpZGVyOiBhY3Rpb24gPT4gdGhpcy5nZXRLZXliaW5kaW5nKGFjdGlvbilcblx0XHR9KSk7XG5cdFx0ZHJvcGRvd24ucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB1cGRhdGVWaXNpYmlsaXR5ID0gKCkgPT4gdGhpcy5hZGRUYWJDb250YWluZXI/LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsIGdldEFjdGlvbnMoKS5sZW5ndGggPT09IDApO1xuXHRcdHVwZGF0ZVZpc2liaWxpdHkoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihtZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZVZpc2liaWxpdHkoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgdGFiQ291bnQoKTogbnVtYmVyIHtcblx0XHRjb25zdCB0YWJzQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy50YWJzQ29udGFpbmVyKTtcblx0XHRyZXR1cm4gdGhpcy5hZGRUYWJDb250YWluZXIgPyB0YWJzQ29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aCAtIDEgOiB0YWJzQ29udGFpbmVyLmNoaWxkcmVuLmxlbmd0aDtcblx0fVxuXG5cdHByaXZhdGUgYXBwZW5kVGFiKHRhYjogSFRNTEVsZW1lbnQsIHRhYnNDb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuYWRkVGFiQ29udGFpbmVyKSB7XG5cdFx0XHR0YWJzQ29udGFpbmVyLmluc2VydEJlZm9yZSh0YWIsIHRoaXMuYWRkVGFiQ29udGFpbmVyKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFic0NvbnRhaW5lci5hcHBlbmRDaGlsZCh0YWIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlTGFzdFRhYih0YWJzQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmFkZFRhYkNvbnRhaW5lcikge1xuXHRcdFx0dGhpcy5hZGRUYWJDb250YWluZXIucHJldmlvdXNFbGVtZW50U2libGluZz8ucmVtb3ZlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhYnNDb250YWluZXIubGFzdENoaWxkPy5yZW1vdmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhYnNTY3JvbGxiYXIoc2Nyb2xsYWJsZTogSFRNTEVsZW1lbnQpOiBTY3JvbGxhYmxlRWxlbWVudCB7XG5cdFx0Y29uc3QgdGFic1Njcm9sbGJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBTY3JvbGxhYmxlRWxlbWVudChzY3JvbGxhYmxlLCB7XG5cdFx0XHRob3Jpem9udGFsOiB0aGlzLmdldFRhYnNTY3JvbGxiYXJWaXNpYmlsaXR5KCksXG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTogdGhpcy5nZXRUYWJzU2Nyb2xsYmFyU2l6aW5nKCksXG5cdFx0XHR2ZXJ0aWNhbDogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW4sXG5cdFx0XHRzY3JvbGxZVG9YOiB0cnVlLFxuXHRcdFx0dXNlU2hhZG93czogZmFsc2Vcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0YWJzU2Nyb2xsYmFyLm9uU2Nyb2xsKGUgPT4ge1xuXHRcdFx0aWYgKGUuc2Nyb2xsTGVmdENoYW5nZWQpIHtcblx0XHRcdFx0c2Nyb2xsYWJsZS5zY3JvbGxMZWZ0ID0gZS5zY3JvbGxMZWZ0O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiB0YWJzU2Nyb2xsYmFyO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUYWJzU2Nyb2xsYmFyU2l6aW5nKCk6IHZvaWQge1xuXHRcdHRoaXMudGFic1Njcm9sbGJhcj8udXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRob3Jpem9udGFsU2Nyb2xsYmFyU2l6ZTogdGhpcy5nZXRUYWJzU2Nyb2xsYmFyU2l6aW5nKClcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGFic1Njcm9sbGJhclZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0dGhpcy50YWJzU2Nyb2xsYmFyPy51cGRhdGVPcHRpb25zKHtcblx0XHRcdGhvcml6b250YWw6IHRoaXMuZ2V0VGFic1Njcm9sbGJhclZpc2liaWxpdHkoKVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUYWJTaXppbmcoZnJvbUV2ZW50OiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgW3RhYnNDb250YWluZXIsIHRhYlNpemluZ0ZpeGVkRGlzcG9zYWJsZXNdID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy50YWJzQ29udGFpbmVyLCB0aGlzLnRhYlNpemluZ0ZpeGVkRGlzcG9zYWJsZXMpO1xuXG5cdFx0dGFiU2l6aW5nRml4ZWREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucztcblx0XHRpZiAob3B0aW9ucy50YWJTaXppbmcgPT09ICdmaXhlZCcpIHtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1taW4td2lkdGgnLCBgJHtvcHRpb25zLnRhYlNpemluZ0ZpeGVkTWluV2lkdGh9cHhgKTtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1tYXgtd2lkdGgnLCBgJHtvcHRpb25zLnRhYlNpemluZ0ZpeGVkTWF4V2lkdGh9cHhgKTtcblxuXHRcdFx0Ly8gRm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MDI5MCB3ZSB3YW50IHRvXG5cdFx0XHQvLyBwcmVzZXJ2ZSB0aGUgY3VycmVudCB0YWIgd2lkdGhzIGFzIGxvbmcgYXMgdGhlIG1vdXNlIGlzIG92ZXIgdGhlXG5cdFx0XHQvLyB0YWJzIHNvIHRoYXQgeW91IGNhbiBxdWlja2x5IGNsb3NlIHRoZW0gdmlhIG1vdXNlIGNsaWNrLiBGb3IgdGhhdFxuXHRcdFx0Ly8gd2UgdHJhY2sgbW91c2UgbW92ZW1lbnRzIG92ZXIgdGhlIHRhYnMgY29udGFpbmVyLlxuXG5cdFx0XHR0YWJTaXppbmdGaXhlZERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX0VOVEVSLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuaXNNb3VzZU92ZXJUYWJzID0gdHJ1ZTtcblx0XHRcdH0pKTtcblx0XHRcdHRhYlNpemluZ0ZpeGVkRGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWJzQ29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdFx0dGhpcy5pc01vdXNlT3ZlclRhYnMgPSBmYWxzZTtcblx0XHRcdFx0dGhpcy51cGRhdGVUYWJzRml4ZWRXaWR0aChmYWxzZSk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1taW4td2lkdGgnKTtcblx0XHRcdHRhYnNDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFiLXNpemluZy1maXhlZC1tYXgtd2lkdGgnKTtcblx0XHRcdHRoaXMudXBkYXRlVGFic0ZpeGVkV2lkdGgoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGFic0ZpeGVkV2lkdGgoZml4ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmZvckVhY2hUYWIoKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lcikgPT4ge1xuXHRcdFx0aWYgKGZpeGVkKSB7XG5cdFx0XHRcdGNvbnN0IHsgd2lkdGggfSA9IHRhYkNvbnRhaW5lci5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0dGFiQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXRhYi1zaXppbmctY3VycmVudC13aWR0aCcsIGAke3dpZHRofXB4YCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0YWJDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFiLXNpemluZy1jdXJyZW50LXdpZHRoJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhYnNTY3JvbGxiYXJTaXppbmcoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnRpdGxlU2Nyb2xsYmFyU2l6aW5nICE9PSAnbGFyZ2UnKSB7XG5cdFx0XHRyZXR1cm4gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5TQ1JPTExCQVJfU0laRVMuZGVmYXVsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5TQ1JPTExCQVJfU0laRVMubGFyZ2U7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhYnNTY3JvbGxiYXJWaXNpYmlsaXR5KCk6IFNjcm9sbGJhclZpc2liaWxpdHkge1xuXHRcdHN3aXRjaCAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eSkge1xuXHRcdFx0Y2FzZSAndmlzaWJsZSc6IHJldHVybiBTY3JvbGxiYXJWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0XHRjYXNlICdoaWRkZW4nOiByZXR1cm4gU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0XHRkZWZhdWx0OiByZXR1cm4gU2Nyb2xsYmFyVmlzaWJpbGl0eS5BdXRvO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJUYWJzQ29udGFpbmVyTGlzdGVuZXJzKHRhYnNDb250YWluZXI6IEhUTUxFbGVtZW50LCB0YWJzU2Nyb2xsYmFyOiBTY3JvbGxhYmxlRWxlbWVudCk6IHZvaWQge1xuXG5cdFx0Ly8gRm9yd2FyZCBzY3JvbGxpbmcgaW5zaWRlIHRoZSBjb250YWluZXIgdG8gb3VyIGN1c3RvbSBzY3JvbGxiYXJcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgRXZlbnRUeXBlLlNDUk9MTCwgKCkgPT4ge1xuXHRcdFx0aWYgKHRhYnNDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCdzY3JvbGwnKSkge1xuXHRcdFx0XHR0YWJzU2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHtcblx0XHRcdFx0XHRzY3JvbGxMZWZ0OiB0YWJzQ29udGFpbmVyLnNjcm9sbExlZnQgLy8gZHVyaW5nIERORCB0aGUgY29udGFpbmVyIGdldHMgc2Nyb2xsZWQgc28gd2UgbmVlZCB0byB1cGRhdGUgdGhlIGN1c3RvbSBzY3JvbGxiYXJcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTmV3IGZpbGUgd2hlbiBkb3VibGUtY2xpY2tpbmcgb24gdGFicyBjb250YWluZXIgKGJ1dCBub3QgdGFicylcblx0XHRmb3IgKGNvbnN0IGV2ZW50VHlwZSBvZiBbVG91Y2hFdmVudFR5cGUuVGFwLCBFdmVudFR5cGUuREJMQ0xJQ0tdKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgZXZlbnRUeXBlLCAoZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnRUeXBlID09PSBFdmVudFR5cGUuREJMQ0xJQ0spIHtcblx0XHRcdFx0XHRpZiAoZS50YXJnZXQgIT09IHRhYnNDb250YWluZXIpIHtcblx0XHRcdFx0XHRcdHJldHVybjsgLy8gaWdub3JlIGlmIHRhcmdldCBpcyBub3QgdGFicyBjb250YWluZXJcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCg8R2VzdHVyZUV2ZW50PmUpLnRhcENvdW50ICE9PSAyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBzaW5nbGUgdGFwc1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmICgoPEdlc3R1cmVFdmVudD5lKS5pbml0aWFsVGFyZ2V0ICE9PSB0YWJzQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBpZiB0YXJnZXQgaXMgbm90IHRhYnMgY29udGFpbmVyXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0XHR0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRpbmRleDogdGhpcy5ncm91cFZpZXcuY291bnQsIC8vIGFsd2F5cyBhdCB0aGUgZW5kXG5cdFx0XHRcdFx0XHRvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHRoaXMuZ3JvdXBWaWV3LmlkKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBQcmV2ZW50IGF1dG8tc2Nyb2xsaW5nIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTY2OTApXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYnNDb250YWluZXIsIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCBlID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUHJldmVudCBhdXRvLXBhc3RpbmcgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMDE2OTYpXG5cdFx0aWYgKGlzTGludXgpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWJzQ29udGFpbmVyLCBFdmVudFR5cGUuTU9VU0VfVVAsIGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5idXR0b24gPT09IDEpIHtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBEcmFnICYgRHJvcCBzdXBwb3J0XG5cdFx0bGV0IGxhc3REcmFnRXZlbnQ6IERyYWdFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaXNOZXdXaW5kb3dPcGVyYXRpb24gPSBmYWxzZTtcblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgRHJhZ0FuZERyb3BPYnNlcnZlcih0YWJzQ29udGFpbmVyLCB7XG5cdFx0XHRvbkRyYWdTdGFydDogZSA9PiB7XG5cdFx0XHRcdGlzTmV3V2luZG93T3BlcmF0aW9uID0gdGhpcy5vbkdyb3VwRHJhZ1N0YXJ0KGUsIHRhYnNDb250YWluZXIpO1xuXHRcdFx0fSxcblxuXHRcdFx0b25EcmFnOiBlID0+IHtcblx0XHRcdFx0bGFzdERyYWdFdmVudCA9IGU7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdFbnRlcjogZSA9PiB7XG5cblx0XHRcdFx0Ly8gQWx3YXlzIGVuYWJsZSBzdXBwb3J0IHRvIHNjcm9sbCB3aGlsZSBkcmFnZ2luZ1xuXHRcdFx0XHR0YWJzQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Njcm9sbCcpO1xuXG5cdFx0XHRcdC8vIFJldHVybiBpZiB0aGUgdGFyZ2V0IGlzIG5vdCBvbiB0aGUgdGFicyBjb250YWluZXJcblx0XHRcdFx0aWYgKGUudGFyZ2V0ICE9PSB0YWJzQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmV0dXJuIGlmIHRyYW5zZmVyIGlzIHVuc3VwcG9ydGVkXG5cdFx0XHRcdGlmICghdGhpcy5pc1N1cHBvcnRlZERyb3BUcmFuc2ZlcihlKSkge1xuXHRcdFx0XHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdub25lJztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGRhdGUgdGhlIGRyb3BFZmZlY3QgdG8gXCJjb3B5XCIgaWYgdGhlcmUgaXMgbm8gbG9jYWwgZGF0YSB0byBiZSBkcmFnZ2VkIGJlY2F1c2Vcblx0XHRcdFx0Ly8gaW4gdGhhdCBjYXNlIHdlIGNhbiBvbmx5IGNvcHkgdGhlIGRhdGEgaW50byBhbmQgbm90IG1vdmUgaXQgZnJvbSBpdHMgc291cmNlXG5cdFx0XHRcdGlmICghdGhpcy5lZGl0b3JUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdFx0XHRpZiAoZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRcdGUuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnY29weSc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2sodGFic0NvbnRhaW5lciwgdHJ1ZSwgZSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdMZWF2ZTogZSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlKTtcblx0XHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblx0XHRcdH0sXG5cblx0XHRcdG9uRHJhZ0VuZDogZSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlKTtcblx0XHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblxuXHRcdFx0XHR0aGlzLm9uR3JvdXBEcmFnRW5kKGUsIGxhc3REcmFnRXZlbnQsIHRhYnNDb250YWluZXIsIGlzTmV3V2luZG93T3BlcmF0aW9uKTtcblx0XHRcdH0sXG5cblx0XHRcdG9uRHJvcDogZSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlKTtcblx0XHRcdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblxuXHRcdFx0XHRpZiAoZS50YXJnZXQgPT09IHRhYnNDb250YWluZXIpIHtcblx0XHRcdFx0XHRjb25zdCBpc0dyb3VwVHJhbnNmZXIgPSB0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRcdFx0dGhpcy5vbkRyb3AoZSwgaXNHcm91cFRyYW5zZmVyID8gdGhpcy5ncm91cFZpZXcuY291bnQgOiB0aGlzLnRhYnNNb2RlbC5jb3VudCwgdGFic0NvbnRhaW5lcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBNb3VzZS13aGVlbCBzdXBwb3J0IHRvIHN3aXRjaCB0byB0YWJzIG9wdGlvbmFsbHlcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFic0NvbnRhaW5lciwgRXZlbnRUeXBlLk1PVVNFX1dIRUVMLCAoZTogV2hlZWxFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5ncm91cFZpZXcuYWN0aXZlRWRpdG9yO1xuXHRcdFx0aWYgKCFhY3RpdmVFZGl0b3IgfHwgdGhpcy5ncm91cFZpZXcuY291bnQgPCAyKSB7XG5cdFx0XHRcdHJldHVybjsgIC8vIG5lZWQgYXQgbGVhc3QgMiBvcGVuIGVkaXRvcnNcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hpZnQta2V5IGVuYWJsZXMgb3IgZGlzYWJsZXMgdGhpcyBiZWhhdmlvdXIgZGVwZW5kaW5nIG9uIHRoZSBzZXR0aW5nXG5cdFx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnNjcm9sbFRvU3dpdGNoVGFicyA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRpZiAoZS5zaGlmdEtleSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gJ29uJzogb25seSBlbmFibGUgdGhpcyB3aGVuIFNoaWZ0LWtleSBpcyBub3QgcHJlc3NlZFxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAoIWUuc2hpZnRLZXkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vICdvZmYnOiBvbmx5IGVuYWJsZSB0aGlzIHdoZW4gU2hpZnQta2V5IGlzIHByZXNzZWRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZ25vcmUgZXZlbnQgaWYgdGhlIGxhc3Qgb25lIGhhcHBlbmVkIHRvbyByZWNlbnRseSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzk2NDA5KVxuXHRcdFx0Ly8gVGhlIHJlc3RyaWN0aW9uIGlzIHJlbGF4ZWQgYWNjb3JkaW5nIHRvIHRoZSBhYnNvbHV0ZSB2YWx1ZSBvZiBgZGVsdGFYYCBhbmQgYGRlbHRhWWBcblx0XHRcdC8vIHRvIHN1cHBvcnQgZGlzY3JldGUgKG1vdXNlIHdoZWVsKSBhbmQgY29udGlndW91cyBzY3JvbGxpbmcgKHRvdWNocGFkKSBlcXVhbGx5IHdlbGxcblx0XHRcdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdFx0XHRpZiAobm93IC0gdGhpcy5sYXN0TW91c2VXaGVlbEV2ZW50VGltZSA8IE11bHRpRWRpdG9yVGFic0NvbnRyb2wuTU9VU0VfV0hFRUxfRVZFTlRfVEhSRVNIT0xEIC0gMiAqIChNYXRoLmFicyhlLmRlbHRhWCkgKyBNYXRoLmFicyhlLmRlbHRhWSkpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5sYXN0TW91c2VXaGVlbEV2ZW50VGltZSA9IG5vdztcblxuXHRcdFx0Ly8gRmlndXJlIG91dCBzY3JvbGxpbmcgZGlyZWN0aW9uIGJ1dCBpZ25vcmUgaXQgaWYgdG9vIHN1YnRsZVxuXHRcdFx0bGV0IHRhYlN3aXRjaERpcmVjdGlvbjogbnVtYmVyO1xuXHRcdFx0aWYgKGUuZGVsdGFYICsgZS5kZWx0YVkgPCAtIE11bHRpRWRpdG9yVGFic0NvbnRyb2wuTU9VU0VfV0hFRUxfRElTVEFOQ0VfVEhSRVNIT0xEKSB7XG5cdFx0XHRcdHRhYlN3aXRjaERpcmVjdGlvbiA9IC0xO1xuXHRcdFx0fSBlbHNlIGlmIChlLmRlbHRhWCArIGUuZGVsdGFZID4gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5NT1VTRV9XSEVFTF9ESVNUQU5DRV9USFJFU0hPTEQpIHtcblx0XHRcdFx0dGFiU3dpdGNoRGlyZWN0aW9uID0gMTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV4dEVkaXRvciA9IHRoaXMuZ3JvdXBWaWV3LmdldEVkaXRvckJ5SW5kZXgodGhpcy5ncm91cFZpZXcuZ2V0SW5kZXhPZkVkaXRvcihhY3RpdmVFZGl0b3IpICsgdGFiU3dpdGNoRGlyZWN0aW9uKTtcblx0XHRcdGlmICghbmV4dEVkaXRvcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZW4gaXRcblx0XHRcdHRoaXMuZ3JvdXBWaWV3Lm9wZW5FZGl0b3IobmV4dEVkaXRvcik7XG5cblx0XHRcdC8vIERpc2FibGUgbm9ybWFsIHNjcm9sbGluZywgb3BlbmluZyB0aGUgZWRpdG9yIHdpbGwgYWxyZWFkeSByZXZlYWwgaXQgcHJvcGVybHlcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51XG5cdFx0Y29uc3Qgc2hvd0NvbnRleHRNZW51ID0gKGU6IEV2ZW50KSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHQvLyBGaW5kIHRhcmdldCBhbmNob3Jcblx0XHRcdGxldCBhbmNob3I6IEhUTUxFbGVtZW50IHwgU3RhbmRhcmRNb3VzZUV2ZW50ID0gdGFic0NvbnRhaW5lcjtcblx0XHRcdGlmIChpc01vdXNlRXZlbnQoZSkpIHtcblx0XHRcdFx0YW5jaG9yID0gbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGhpcy5wYXJlbnQpLCBlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2hvdyBpdFxuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBhbmNob3IsXG5cdFx0XHRcdG1lbnVJZDogdGhpcy5tZW51SWRzPy50YWJzQmFyQ29udGV4dCA/PyBNZW51SWQuRWRpdG9yVGFic0JhckNvbnRleHQsXG5cdFx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSB9LFxuXHRcdFx0XHRnZXRBY3Rpb25zQ29udGV4dDogKCkgPT4gKHsgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQgfSksXG5cdFx0XHRcdGdldEtleUJpbmRpbmc6IGFjdGlvbiA9PiB0aGlzLmdldEtleWJpbmRpbmcoYWN0aW9uKSxcblx0XHRcdFx0b25IaWRlOiAoKSA9PiB0aGlzLmdyb3VwVmlldy5mb2N1cygpXG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYnNDb250YWluZXIsIFRvdWNoRXZlbnRUeXBlLkNvbnRleHRtZW51LCBlID0+IHNob3dDb250ZXh0TWVudShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWJzQ29udGFpbmVyLCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHNob3dDb250ZXh0TWVudShlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0hhbmRsZURlY29yYXRpb25zQ2hhbmdlKCk6IHZvaWQge1xuXG5cdFx0Ly8gQSBjaGFuZ2UgdG8gZGVjb3JhdGlvbnMgcG90ZW50aWFsbHkgaGFzIGFuIGltcGFjdCBvbiB0aGUgc2l6ZSBvZiB0YWJzXG5cdFx0Ly8gc28gd2UgbmVlZCB0byB0cmlnZ2VyIGEgbGF5b3V0IGluIHRoYXQgY2FzZSB0byBhZGp1c3QgdGhpbmdzXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb25zKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVFZGl0b3JBY3Rpb25zVG9vbGJhcigpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVFZGl0b3JBY3Rpb25zVG9vbGJhcigpO1xuXG5cdFx0Ly8gQ2hhbmdpbmcgdGhlIGFjdGlvbnMgaW4gdGhlIHRvb2xiYXIgY2FuIGhhdmUgYW4gaW1wYWN0IG9uIHRoZSBzaXplIG9mIHRoZVxuXHRcdC8vIHRhYiBjb250YWluZXIsIHNvIHdlIG5lZWQgdG8gbGF5b3V0IHRoZSB0YWJzIHRvIG1ha2Ugc3VyZSB0aGUgYWN0aXZlIGlzIHZpc2libGVcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMpO1xuXHR9XG5cblx0b3BlbkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0LCBvcHRpb25zPzogSUludGVybmFsRWRpdG9yT3Blbk9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VkID0gdGhpcy5oYW5kbGVPcGVuZWRFZGl0b3JzKCk7XG5cblx0XHQvLyBSZXNwZWN0IG9wdGlvbiB0byBmb2N1cyB0YWIgY29udHJvbCBpZiBwcm92aWRlZFxuXHRcdGlmIChvcHRpb25zPy5mb2N1c1RhYkNvbnRyb2wpIHtcblx0XHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIpID0+IHRhYkNvbnRhaW5lci5mb2N1cygpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hhbmdlZDtcblx0fVxuXG5cdG9wZW5FZGl0b3JzKGVkaXRvcnM6IEVkaXRvcklucHV0W10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5oYW5kbGVPcGVuZWRFZGl0b3JzKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZU9wZW5lZEVkaXRvcnMoKTogYm9vbGVhbiB7XG5cblx0XHQvLyBTZXQgdGFicyBjb250cm9sIHZpc2liaWxpdHlcblx0XHR0aGlzLnVwZGF0ZVRhYnNDb250cm9sVmlzaWJpbGl0eSgpO1xuXG5cdFx0Ly8gQ3JlYXRlIHRhYnMgYXMgbmVlZGVkXG5cdFx0Y29uc3QgW3RhYnNDb250YWluZXIsIHRhYnNTY3JvbGxiYXJdID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy50YWJzQ29udGFpbmVyLCB0aGlzLnRhYnNTY3JvbGxiYXIpO1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLnRhYkNvdW50OyBpIDwgdGhpcy50YWJzTW9kZWwuY291bnQ7IGkrKykge1xuXHRcdFx0dGhpcy5hcHBlbmRUYWIodGhpcy5jcmVhdGVUYWIoaSwgdGFic0NvbnRhaW5lciwgdGFic1Njcm9sbGJhciksIHRhYnNDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSB0byByZWNvbXB1dGUgdGFiIGxhYmVscyBhbmQgZGV0ZWN0XG5cdFx0Ly8gaWYgYSBsYWJlbCBjaGFuZ2Ugb2NjdXJyZWQgdGhhdCByZXF1aXJlcyBhXG5cdFx0Ly8gcmVkcmF3IG9mIHRhYnMuXG5cblx0XHRjb25zdCBhY3RpdmVFZGl0b3JDaGFuZ2VkID0gdGhpcy5kaWRBY3RpdmVFZGl0b3JDaGFuZ2UoKTtcblx0XHRjb25zdCBvbGRUYWJMYWJlbHMgPSB0aGlzLnRhYkxhYmVscztcblx0XHR0aGlzLmNvbXB1dGVUYWJMYWJlbHMoKTtcblxuXHRcdC8vIFJlZHJhdyBhbmQgdXBkYXRlIGluIHRoZXNlIGNhc2VzXG5cdFx0bGV0IGRpZENoYW5nZSA9IGZhbHNlO1xuXHRcdGlmIChcblx0XHRcdGFjdGl2ZUVkaXRvckNoYW5nZWQgfHxcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gYWN0aXZlIGVkaXRvciBjaGFuZ2VkXG5cdFx0XHRvbGRUYWJMYWJlbHMubGVuZ3RoICE9PSB0aGlzLnRhYkxhYmVscy5sZW5ndGggfHxcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIG51bWJlciBvZiB0YWJzIGNoYW5nZWRcblx0XHRcdG9sZFRhYkxhYmVscy5zb21lKChsYWJlbCwgaW5kZXgpID0+ICF0aGlzLmVxdWFsc0VkaXRvcklucHV0TGFiZWwobGFiZWwsIHRoaXMudGFiTGFiZWxzLmF0KGluZGV4KSkpIFx0Ly8gZWRpdG9yIGxhYmVscyBjaGFuZ2VkXG5cdFx0KSB7XG5cdFx0XHR0aGlzLnJlZHJhdyh7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2Ugb25seSBsYXlvdXQgZm9yIHJldmVhbGluZ1xuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb25zLCB7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBkaWRDaGFuZ2U7XG5cdH1cblxuXHRwcml2YXRlIGRpZEFjdGl2ZUVkaXRvckNoYW5nZSgpOiBib29sZWFuIHtcblx0XHRpZiAoXG5cdFx0XHQhdGhpcy5hY3RpdmVUYWJMYWJlbD8uZWRpdG9yICYmIHRoaXMudGFic01vZGVsLmFjdGl2ZUVkaXRvciB8fCBcdFx0XHRcdFx0XHRcdC8vIGFjdGl2ZSBlZGl0b3IgY2hhbmdlZCBmcm9tIG51bGwgPT4gZWRpdG9yXG5cdFx0XHR0aGlzLmFjdGl2ZVRhYkxhYmVsPy5lZGl0b3IgJiYgIXRoaXMudGFic01vZGVsLmFjdGl2ZUVkaXRvciB8fCBcdFx0XHRcdFx0XHRcdC8vIGFjdGl2ZSBlZGl0b3IgY2hhbmdlZCBmcm9tIGVkaXRvciA9PiBudWxsXG5cdFx0XHQoIXRoaXMuYWN0aXZlVGFiTGFiZWw/LmVkaXRvciB8fCAhdGhpcy50YWJzTW9kZWwuaXNBY3RpdmUodGhpcy5hY3RpdmVUYWJMYWJlbC5lZGl0b3IpKVx0Ly8gYWN0aXZlIGVkaXRvciBjaGFuZ2VkIGZyb20gZWRpdG9yQSA9PiBlZGl0b3JCXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGVxdWFsc0VkaXRvcklucHV0TGFiZWwobGFiZWxBOiBJRWRpdG9ySW5wdXRMYWJlbCB8IHVuZGVmaW5lZCwgbGFiZWxCOiBJRWRpdG9ySW5wdXRMYWJlbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChsYWJlbEEgPT09IGxhYmVsQikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCFsYWJlbEEgfHwgIWxhYmVsQikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiBsYWJlbEEubmFtZSA9PT0gbGFiZWxCLm5hbWUgJiZcblx0XHRcdGxhYmVsQS5kZXNjcmlwdGlvbiA9PT0gbGFiZWxCLmRlc2NyaXB0aW9uICYmXG5cdFx0XHRsYWJlbEEuZm9yY2VEZXNjcmlwdGlvbiA9PT0gbGFiZWxCLmZvcmNlRGVzY3JpcHRpb24gJiZcblx0XHRcdGxhYmVsQS50aXRsZSA9PT0gbGFiZWxCLnRpdGxlICYmXG5cdFx0XHRsYWJlbEEuYXJpYUxhYmVsID09PSBsYWJlbEIuYXJpYUxhYmVsO1xuXHR9XG5cblx0YmVmb3JlQ2xvc2VFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXG5cdFx0Ly8gRml4IHRhYnMgd2lkdGggaWYgdGhlIG1vdXNlIGlzIG92ZXIgdGFicyBhbmQgYmVmb3JlIGNsb3Npbmdcblx0XHQvLyBhIHRhYiAoZXhjZXB0IHRoZSBsYXN0IHRhYikgd2hlbiB0YWIgc2l6aW5nIGlzICdmaXhlZCcuXG5cdFx0Ly8gVGhpcyBoZWxwcyBrZWVwaW5nIHRoZSBjbG9zZSBidXR0b24gc3RhYmxlIHVuZGVyXG5cdFx0Ly8gdGhlIG1vdXNlIGFuZCBhbGxvd3MgZm9yIHJhcGlkIGNsb3Npbmcgb2YgdGFicy5cblxuXHRcdGlmICh0aGlzLmlzTW91c2VPdmVyVGFicyAmJiB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMudGFiU2l6aW5nID09PSAnZml4ZWQnKSB7XG5cdFx0XHRjb25zdCBjbG9zaW5nTGFzdFRhYiA9IHRoaXMudGFic01vZGVsLmlzTGFzdChlZGl0b3IpO1xuXHRcdFx0dGhpcy51cGRhdGVUYWJzRml4ZWRXaWR0aCghY2xvc2luZ0xhc3RUYWIpO1xuXHRcdH1cblx0fVxuXG5cdGNsb3NlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblx0XHR0aGlzLmhhbmRsZUNsb3NlZEVkaXRvcnMoKTtcblx0fVxuXG5cdGNsb3NlRWRpdG9ycyhlZGl0b3JzOiBFZGl0b3JJbnB1dFtdKTogdm9pZCB7XG5cdFx0dGhpcy5oYW5kbGVDbG9zZWRFZGl0b3JzKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNsb3NlZEVkaXRvcnMoKTogdm9pZCB7XG5cblx0XHQvLyBUaGVyZSBhcmUgdGFicyB0byBzaG93XG5cdFx0aWYgKHRoaXMudGFic01vZGVsLmNvdW50KSB7XG5cblx0XHRcdC8vIFJlbW92ZSB0YWJzIHRoYXQgZ290IGNsb3NlZFxuXHRcdFx0Y29uc3QgdGFic0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMudGFic0NvbnRhaW5lcik7XG5cdFx0XHR3aGlsZSAodGhpcy50YWJDb3VudCA+IHRoaXMudGFic01vZGVsLmNvdW50KSB7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIG9uZSB0YWIgZnJvbSBjb250YWluZXIgKG11c3QgYmUgdGhlIGxhc3QgdG8ga2VlcCBpbmRleGVzIGluIG9yZGVyISlcblx0XHRcdFx0dGhpcy5yZW1vdmVMYXN0VGFiKHRhYnNDb250YWluZXIpO1xuXG5cdFx0XHRcdC8vIFJlbW92ZSBhc3NvY2lhdGVkIHRhYiBsYWJlbCBhbmQgd2lkZ2V0XG5cdFx0XHRcdGRpc3Bvc2UodGhpcy50YWJEaXNwb3NhYmxlcy5wb3AoKSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEEgcmVtb3ZhbCBvZiBhIGxhYmVsIHJlcXVpcmVzIHRvIHJlY29tcHV0ZSBhbGwgbGFiZWxzXG5cdFx0XHR0aGlzLmNvbXB1dGVUYWJMYWJlbHMoKTtcblxuXHRcdFx0Ly8gUmVkcmF3IGFsbCB0YWJzXG5cdFx0XHR0aGlzLnJlZHJhdyh7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdC8vIE5vIHRhYnMgdG8gc2hvd1xuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMudGFic0NvbnRhaW5lcikge1xuXHRcdFx0XHRjbGVhck5vZGUodGhpcy50YWJzQ29udGFpbmVyKTtcblx0XHRcdFx0aWYgKHRoaXMuYWRkVGFiQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0dGhpcy50YWJzQ29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuYWRkVGFiQ29udGFpbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRhYkRpc3Bvc2FibGVzID0gZGlzcG9zZSh0aGlzLnRhYkRpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMudGFiUmVzb3VyY2VMYWJlbHMuY2xlYXIoKTtcblx0XHRcdHRoaXMudGFiTGFiZWxzID0gW107XG5cdFx0XHR0aGlzLmFjdGl2ZVRhYkxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50YWJBY3Rpb25CYXJzID0gW107XG5cblx0XHRcdHRoaXMuY2xlYXJFZGl0b3JBY3Rpb25zVG9vbGJhcigpO1xuXHRcdFx0dGhpcy51cGRhdGVUYWJzQ29udHJvbFZpc2liaWxpdHkoKTtcblx0XHR9XG5cdH1cblxuXHRtb3ZlRWRpdG9yKGVkaXRvcjogRWRpdG9ySW5wdXQsIGZyb21UYWJJbmRleDogbnVtYmVyLCB0YXJnZXRUYWJJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cblx0XHQvLyBNb3ZlIHRoZSBlZGl0b3IgbGFiZWxcblx0XHRjb25zdCBlZGl0b3JMYWJlbCA9IHRoaXMudGFiTGFiZWxzW2Zyb21UYWJJbmRleF07XG5cdFx0dGhpcy50YWJMYWJlbHMuc3BsaWNlKGZyb21UYWJJbmRleCwgMSk7XG5cdFx0dGhpcy50YWJMYWJlbHMuc3BsaWNlKHRhcmdldFRhYkluZGV4LCAwLCBlZGl0b3JMYWJlbCk7XG5cblx0XHQvLyBSZWRyYXcgdGFicyBpbiB0aGUgcmFuZ2Ugb2YgdGhlIG1vdmVcblx0XHR0aGlzLmZvckVhY2hUYWIoKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsLCB0YWJBY3Rpb25CYXIpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsLCB0YWJBY3Rpb25CYXIpO1xuXHRcdH0sXG5cdFx0XHRNYXRoLm1pbihmcm9tVGFiSW5kZXgsIHRhcmdldFRhYkluZGV4KSwgLy8gZnJvbTogc21hbGxlc3Qgb2YgZnJvbVRhYkluZGV4L3RhcmdldFRhYkluZGV4XG5cdFx0XHRNYXRoLm1heChmcm9tVGFiSW5kZXgsIHRhcmdldFRhYkluZGV4KVx0Ly8gICB0bzogbGFyZ2VzdCBvZiBmcm9tVGFiSW5kZXgvdGFyZ2V0VGFiSW5kZXhcblx0XHQpO1xuXG5cdFx0Ly8gTW92aW5nIGFuIGVkaXRvciByZXF1aXJlcyBhIGxheW91dCB0byBrZWVwIHRoZSBhY3RpdmUgZWRpdG9yIHZpc2libGVcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMsIHsgZm9yY2VSZXZlYWxBY3RpdmVUYWI6IHRydWUgfSk7XG5cdH1cblxuXHRwaW5FZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCkgPT4gdGhpcy5yZWRyYXdUYWJMYWJlbChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCkpO1xuXHR9XG5cblx0c3RpY2tFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMuZG9IYW5kbGVTdGlja3lFZGl0b3JDaGFuZ2UoZWRpdG9yKTtcblx0fVxuXG5cdHVuc3RpY2tFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMuZG9IYW5kbGVTdGlja3lFZGl0b3JDaGFuZ2UoZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgZG9IYW5kbGVTdGlja3lFZGl0b3JDaGFuZ2UoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXG5cdFx0Ly8gVXBkYXRlIHRhYlxuXHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKSA9PiB0aGlzLnJlZHJhd1RhYihlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKSk7XG5cblx0XHQvLyBTdGlja3kgY2hhbmdlIGhhcyBhbiBpbXBhY3Qgb24gZWFjaCB0YWIncyBib3JkZXIgYmVjYXVzZVxuXHRcdC8vIGl0IHBvdGVudGlhbGx5IG1vdmVzIHRoZSBib3JkZXIgdG8gdGhlIGxhc3QgcGlubmVkIHRhYlxuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiQm9yZGVycyh0YWJJbmRleCwgdGFiQ29udGFpbmVyKTtcblx0XHR9KTtcblxuXHRcdC8vIEEgY2hhbmdlIHRvIHRoZSBzdGlja3kgc3RhdGUgcmVxdWlyZXMgYSBsYXlvdXQgdG8ga2VlcCB0aGUgYWN0aXZlIGVkaXRvciB2aXNpYmxlXG5cdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb25zLCB7IGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlIH0pO1xuXHR9XG5cblx0c2V0QWN0aXZlKGlzR3JvdXBBY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdC8vIEFjdGl2aXR5IGhhcyBhbiBpbXBhY3Qgb24gZWFjaCB0YWIncyBhY3RpdmUgaW5kaWNhdGlvblxuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwsIHRhYkFjdGlvbkJhcikgPT4ge1xuXHRcdFx0dGhpcy5yZWRyYXdUYWJTZWxlY3RlZEFjdGl2ZUFuZERpcnR5KGlzR3JvdXBBY3RpdmUsIGVkaXRvciwgdGFiQ29udGFpbmVyLCB0YWJBY3Rpb25CYXIpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQWN0aXZpdHkgaGFzIGFuIGltcGFjdCBvbiB0aGUgdG9vbGJhciwgc28gd2UgbmVlZCB0byB1cGRhdGUgYW5kIGxheW91dFxuXHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uc1Rvb2xiYXIoKTtcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMsIHsgZm9yY2VSZXZlYWxBY3RpdmVUYWI6IHRydWUgfSk7XG5cdH1cblxuXHR1cGRhdGVFZGl0b3JTZWxlY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwsIHRhYkFjdGlvbkJhcikgPT4ge1xuXHRcdFx0dGhpcy5yZWRyYXdUYWJTZWxlY3RlZEFjdGl2ZUFuZERpcnR5KHRoaXMuZ3JvdXBzVmlldy5hY3RpdmVHcm91cCA9PT0gdGhpcy5ncm91cFZpZXcsIGVkaXRvciwgdGFiQ29udGFpbmVyLCB0YWJBY3Rpb25CYXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFZGl0b3JMYWJlbFNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZG9VcGRhdGVFZGl0b3JMYWJlbHMoKSwgMCkpO1xuXG5cdHVwZGF0ZUVkaXRvckxhYmVsKGVkaXRvcjogRWRpdG9ySW5wdXQpOiB2b2lkIHtcblxuXHRcdC8vIFVwZGF0ZSBhbGwgbGFiZWxzIHRvIGFjY291bnQgZm9yIGNoYW5nZXMgdG8gdGFiIGxhYmVsc1xuXHRcdC8vIFNpbmNlIHRoaXMgbWV0aG9kIG1heSBiZSBjYWxsZWQgYSBsb3Qgb2YgdGltZXMgZnJvbVxuXHRcdC8vIGluZGl2aWR1YWwgZWRpdG9ycywgd2UgY29sbGVjdCBhbGwgdGhvc2UgcmVxdWVzdHMgYW5kXG5cdFx0Ly8gdGhlbiBydW4gdGhlIHVwZGF0ZSBvbmNlIGJlY2F1c2Ugd2UgaGF2ZSB0byB1cGRhdGVcblx0XHQvLyBhbGwgb3BlbmVkIHRhYnMgaW4gdGhlIGdyb3VwIGF0IG9uY2UuXG5cdFx0dGhpcy51cGRhdGVFZGl0b3JMYWJlbFNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZUVkaXRvckxhYmVscygpOiB2b2lkIHtcblxuXHRcdC8vIEEgY2hhbmdlIHRvIGEgbGFiZWwgcmVxdWlyZXMgdG8gcmVjb21wdXRlIGFsbCBsYWJlbHNcblx0XHR0aGlzLmNvbXB1dGVUYWJMYWJlbHMoKTtcblxuXHRcdC8vIEFzIHN1Y2ggd2UgbmVlZCB0byByZWRyYXcgZWFjaCBsYWJlbFxuXHRcdHRoaXMuZm9yRWFjaFRhYigoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwpID0+IHtcblx0XHRcdHRoaXMucmVkcmF3VGFiTGFiZWwoZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJMYWJlbFdpZGdldCwgdGFiTGFiZWwpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQSBjaGFuZ2UgdG8gYSBsYWJlbCByZXF1aXJlcyBhIGxheW91dCB0byBrZWVwIHRoZSBhY3RpdmUgZWRpdG9yIHZpc2libGVcblx0XHR0aGlzLmxheW91dCh0aGlzLmRpbWVuc2lvbnMpO1xuXHR9XG5cblx0dXBkYXRlRWRpdG9yRGlydHkoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IHZvaWQge1xuXHRcdHRoaXMud2l0aFRhYihlZGl0b3IsIChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKSA9PiB0aGlzLnJlZHJhd1RhYlNlbGVjdGVkQWN0aXZlQW5kRGlydHkodGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldywgZWRpdG9yLCB0YWJDb250YWluZXIsIHRhYkFjdGlvbkJhcikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvbGRPcHRpb25zOiBJRWRpdG9yUGFydE9wdGlvbnMsIG5ld09wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucyk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZU9wdGlvbnMob2xkT3B0aW9ucywgbmV3T3B0aW9ucyk7XG5cblx0XHQvLyBBIGNoYW5nZSB0byBhIGxhYmVsIGZvcm1hdCBvcHRpb25zIHJlcXVpcmVzIHRvIHJlY29tcHV0ZSBhbGwgbGFiZWxzXG5cdFx0aWYgKG9sZE9wdGlvbnMubGFiZWxGb3JtYXQgIT09IG5ld09wdGlvbnMubGFiZWxGb3JtYXQpIHtcblx0XHRcdHRoaXMuY29tcHV0ZVRhYkxhYmVscygpO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSB0YWJzIHNjcm9sbGJhciBzaXppbmdcblx0XHRpZiAob2xkT3B0aW9ucy50aXRsZVNjcm9sbGJhclNpemluZyAhPT0gbmV3T3B0aW9ucy50aXRsZVNjcm9sbGJhclNpemluZykge1xuXHRcdFx0dGhpcy51cGRhdGVUYWJzU2Nyb2xsYmFyU2l6aW5nKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRhYnMgc2Nyb2xsYmFyIHZpc2liaWxpdHlcblx0XHRpZiAob2xkT3B0aW9ucy50aXRsZVNjcm9sbGJhclZpc2liaWxpdHkgIT09IG5ld09wdGlvbnMudGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRhYnNTY3JvbGxiYXJWaXNpYmlsaXR5KCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGVkaXRvciBhY3Rpb25zXG5cdFx0aWYgKG9sZE9wdGlvbnMuYWx3YXlzU2hvd0VkaXRvckFjdGlvbnMgIT09IG5ld09wdGlvbnMuYWx3YXlzU2hvd0VkaXRvckFjdGlvbnMpIHtcblx0XHRcdHRoaXMudXBkYXRlRWRpdG9yQWN0aW9uc1Rvb2xiYXIoKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGFicyBzaXppbmdcblx0XHRpZiAoXG5cdFx0XHRvbGRPcHRpb25zLnRhYlNpemluZ0ZpeGVkTWluV2lkdGggIT09IG5ld09wdGlvbnMudGFiU2l6aW5nRml4ZWRNaW5XaWR0aCB8fFxuXHRcdFx0b2xkT3B0aW9ucy50YWJTaXppbmdGaXhlZE1heFdpZHRoICE9PSBuZXdPcHRpb25zLnRhYlNpemluZ0ZpeGVkTWF4V2lkdGggfHxcblx0XHRcdG9sZE9wdGlvbnMudGFiU2l6aW5nICE9PSBuZXdPcHRpb25zLnRhYlNpemluZ1xuXHRcdCkge1xuXHRcdFx0dGhpcy51cGRhdGVUYWJTaXppbmcodHJ1ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVkcmF3IHRhYnMgd2hlbiBvdGhlciBvcHRpb25zIGNoYW5nZVxuXHRcdGlmIChcblx0XHRcdG9sZE9wdGlvbnMubGFiZWxGb3JtYXQgIT09IG5ld09wdGlvbnMubGFiZWxGb3JtYXQgfHxcblx0XHRcdG9sZE9wdGlvbnMudGFiQWN0aW9uTG9jYXRpb24gIT09IG5ld09wdGlvbnMudGFiQWN0aW9uTG9jYXRpb24gfHxcblx0XHRcdG9sZE9wdGlvbnMudGFiQWN0aW9uQ2xvc2VWaXNpYmlsaXR5ICE9PSBuZXdPcHRpb25zLnRhYkFjdGlvbkNsb3NlVmlzaWJpbGl0eSB8fFxuXHRcdFx0b2xkT3B0aW9ucy50YWJBY3Rpb25VbnBpblZpc2liaWxpdHkgIT09IG5ld09wdGlvbnMudGFiQWN0aW9uVW5waW5WaXNpYmlsaXR5IHx8XG5cdFx0XHRvbGRPcHRpb25zLnRhYlNpemluZyAhPT0gbmV3T3B0aW9ucy50YWJTaXppbmcgfHxcblx0XHRcdG9sZE9wdGlvbnMucGlubmVkVGFiU2l6aW5nICE9PSBuZXdPcHRpb25zLnBpbm5lZFRhYlNpemluZyB8fFxuXHRcdFx0b2xkT3B0aW9ucy5zaG93SWNvbnMgIT09IG5ld09wdGlvbnMuc2hvd0ljb25zIHx8XG5cdFx0XHRvbGRPcHRpb25zLmhhc0ljb25zICE9PSBuZXdPcHRpb25zLmhhc0ljb25zIHx8XG5cdFx0XHRvbGRPcHRpb25zLmhpZ2hsaWdodE1vZGlmaWVkVGFicyAhPT0gbmV3T3B0aW9ucy5oaWdobGlnaHRNb2RpZmllZFRhYnMgfHxcblx0XHRcdG9sZE9wdGlvbnMud3JhcFRhYnMgIT09IG5ld09wdGlvbnMud3JhcFRhYnMgfHxcblx0XHRcdG9sZE9wdGlvbnMuc2hvd1RhYkluZGV4ICE9PSBuZXdPcHRpb25zLnNob3dUYWJJbmRleCB8fFxuXHRcdFx0IWVxdWFscyhvbGRPcHRpb25zLmRlY29yYXRpb25zLCBuZXdPcHRpb25zLmRlY29yYXRpb25zKVxuXHRcdCkge1xuXHRcdFx0dGhpcy5yZWRyYXcoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWRyYXcoKTtcblx0fVxuXG5cdHByaXZhdGUgZm9yRWFjaFRhYihmbjogKGVkaXRvcjogRWRpdG9ySW5wdXQsIHRhYkluZGV4OiBudW1iZXIsIHRhYkNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRhYkxhYmVsV2lkZ2V0OiBJUmVzb3VyY2VMYWJlbCwgdGFiTGFiZWw6IElFZGl0b3JJbnB1dExhYmVsLCB0YWJBY3Rpb25CYXI6IEFjdGlvbkJhcikgPT4gdm9pZCwgZnJvbVRhYkluZGV4PzogbnVtYmVyLCB0b1RhYkluZGV4PzogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZm9yRWFjaCgoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0aWYgKHR5cGVvZiBmcm9tVGFiSW5kZXggPT09ICdudW1iZXInICYmIGZyb21UYWJJbmRleCA+IHRhYkluZGV4KSB7XG5cdFx0XHRcdHJldHVybjsgLy8gZG8gbm90aGluZyBpZiB3ZSBhcmUgbm90IHlldCBhdCBgZnJvbUluZGV4YFxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodHlwZW9mIHRvVGFiSW5kZXggPT09ICdudW1iZXInICYmIHRvVGFiSW5kZXggPCB0YWJJbmRleCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIGRvIG5vdGhpbmcgaWYgd2UgYXJlIGJleW9uZCBgdG9JbmRleGBcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5kb1dpdGhUYWIodGFiSW5kZXgsIGVkaXRvciwgZm4pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB3aXRoVGFiKGVkaXRvcjogRWRpdG9ySW5wdXQsIGZuOiAoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlciwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFiTGFiZWxXaWRnZXQ6IElSZXNvdXJjZUxhYmVsLCB0YWJMYWJlbDogSUVkaXRvcklucHV0TGFiZWwsIHRhYkFjdGlvbkJhcjogQWN0aW9uQmFyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5kb1dpdGhUYWIodGhpcy50YWJzTW9kZWwuaW5kZXhPZihlZGl0b3IpLCBlZGl0b3IsIGZuKTtcblx0fVxuXG5cdHByaXZhdGUgZG9XaXRoVGFiKHRhYkluZGV4OiBudW1iZXIsIGVkaXRvcjogRWRpdG9ySW5wdXQsIGZuOiAoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlciwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFiTGFiZWxXaWRnZXQ6IElSZXNvdXJjZUxhYmVsLCB0YWJMYWJlbDogSUVkaXRvcklucHV0TGFiZWwsIHRhYkFjdGlvbkJhcjogQWN0aW9uQmFyKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFic0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMudGFic0NvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFiQ29udGFpbmVyID0gdGFic0NvbnRhaW5lci5jaGlsZHJlblt0YWJJbmRleF0gYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29uc3QgdGFiUmVzb3VyY2VMYWJlbCA9IHRoaXMudGFiUmVzb3VyY2VMYWJlbHMuZ2V0KHRhYkluZGV4KTtcblx0XHRjb25zdCB0YWJMYWJlbCA9IHRoaXMudGFiTGFiZWxzW3RhYkluZGV4XTtcblx0XHRjb25zdCB0YWJBY3Rpb25CYXIgPSB0aGlzLnRhYkFjdGlvbkJhcnNbdGFiSW5kZXhdO1xuXHRcdGlmICh0YWJDb250YWluZXIgJiYgdGFiUmVzb3VyY2VMYWJlbCAmJiB0YWJMYWJlbCkge1xuXHRcdFx0Zm4oZWRpdG9yLCB0YWJJbmRleCwgdGFiQ29udGFpbmVyLCB0YWJSZXNvdXJjZUxhYmVsLCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhYih0YWJJbmRleDogbnVtYmVyLCB0YWJzQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFic1Njcm9sbGJhcjogU2Nyb2xsYWJsZUVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cblx0XHQvLyBUYWIgQ29udGFpbmVyXG5cdFx0Y29uc3QgdGFiQ29udGFpbmVyID0gJCgnLnRhYicsIHtcblx0XHRcdGRyYWdnYWJsZTogdHJ1ZSxcblx0XHRcdHJvbGU6ICd0YWInXG5cdFx0fSk7XG5cblx0XHQvLyBHZXN0dXJlIFN1cHBvcnRcblx0XHRjb25zdCBnZXN0dXJlRGlzcG9zYWJsZSA9IEdlc3R1cmUuYWRkVGFyZ2V0KHRhYkNvbnRhaW5lcik7XG5cblx0XHQvLyBUYWIgQm9yZGVyIFRvcFxuXHRcdGNvbnN0IHRhYkJvcmRlclRvcENvbnRhaW5lciA9ICQoJy50YWItYm9yZGVyLXRvcC1jb250YWluZXInKTtcblx0XHR0YWJDb250YWluZXIuYXBwZW5kQ2hpbGQodGFiQm9yZGVyVG9wQ29udGFpbmVyKTtcblxuXHRcdC8vIFRhYiBFZGl0b3IgTGFiZWxcblx0XHRjb25zdCBlZGl0b3JMYWJlbCA9IHRoaXMudGFiUmVzb3VyY2VMYWJlbHMuY3JlYXRlKHRhYkNvbnRhaW5lciwgeyBob3ZlclRhcmdldE92ZXJyaWRlOiB0YWJDb250YWluZXIgfSk7XG5cblx0XHQvLyBUYWIgQWN0aW9uc1xuXHRcdGNvbnN0IHRhYkFjdGlvbnNDb250YWluZXIgPSAkKCcudGFiLWFjdGlvbnMnKTtcblx0XHR0YWJDb250YWluZXIuYXBwZW5kQ2hpbGQodGFiQWN0aW9uc0NvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCB0YWJBY3Rpb25SdW5uZXIgPSBuZXcgRWRpdG9yQ29tbWFuZHNDb250ZXh0QWN0aW9uUnVubmVyKHtcblx0XHRcdGdyb3VwSWQ6IHRoaXMuZ3JvdXBWaWV3LmlkLFxuXHRcdFx0Z2V0IGVkaXRvckluZGV4KCkgeyByZXR1cm4gdGhhdC50b0VkaXRvckluZGV4KHRhYkluZGV4KTsgfVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdGFiQWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcih0YWJBY3Rpb25zQ29udGFpbmVyLCB7IGFyaWFMYWJlbDogbG9jYWxpemUoJ2FyaWFMYWJlbFRhYkFjdGlvbnMnLCBcIlRhYiBhY3Rpb25zXCIpLCBhY3Rpb25SdW5uZXI6IHRhYkFjdGlvblJ1bm5lciB9KTtcblx0XHRjb25zdCB0YWJBY3Rpb25MaXN0ZW5lciA9IHRhYkFjdGlvbkJhci5vbldpbGxSdW4oZSA9PiB7XG5cdFx0XHRpZiAoZS5hY3Rpb24uaWQgPT09IHRoaXMuY2xvc2VFZGl0b3JBY3Rpb24uaWQpIHtcblx0XHRcdFx0dGhpcy5ibG9ja1JldmVhbEFjdGl2ZVRhYk9uY2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhYkFjdGlvbkJhckRpc3Bvc2FibGUgPSBjb21iaW5lZERpc3Bvc2FibGUodGFiQWN0aW9uUnVubmVyLCB0YWJBY3Rpb25CYXIsIHRhYkFjdGlvbkxpc3RlbmVyLCB0b0Rpc3Bvc2FibGUoaW5zZXJ0KHRoaXMudGFiQWN0aW9uQmFycywgdGFiQWN0aW9uQmFyKSkpO1xuXG5cdFx0Ly8gVGFiIEZhZGUgSGlkZXJcblx0XHQvLyBIaWRlcyB0aGUgdGFiIGZhZGUgdG8gdGhlIHJpZ2h0IHdoZW4gdGFiIGFjdGlvbiBsZWZ0IGFuZCBzaXppbmcgc2hyaW5rL2ZpeGVkLCA6OmFmdGVyLCA6OmJlZm9yZSBhcmUgYWxyZWFkeSB1c2VkXG5cdFx0Y29uc3QgdGFiU2hhZG93SGlkZXIgPSAkKCcudGFiLWZhZGUtaGlkZXInKTtcblx0XHR0YWJDb250YWluZXIuYXBwZW5kQ2hpbGQodGFiU2hhZG93SGlkZXIpO1xuXG5cdFx0Ly8gVGFiIEJvcmRlciBCb3R0b21cblx0XHRjb25zdCB0YWJCb3JkZXJCb3R0b21Db250YWluZXIgPSAkKCcudGFiLWJvcmRlci1ib3R0b20tY29udGFpbmVyJyk7XG5cdFx0dGFiQ29udGFpbmVyLmFwcGVuZENoaWxkKHRhYkJvcmRlckJvdHRvbUNvbnRhaW5lcik7XG5cblx0XHQvLyBFdmVudGluZ1xuXHRcdGNvbnN0IGV2ZW50c0Rpc3Bvc2FibGUgPSB0aGlzLnJlZ2lzdGVyVGFiTGlzdGVuZXJzKHRhYkNvbnRhaW5lciwgdGFiSW5kZXgsIHRhYnNDb250YWluZXIsIHRhYnNTY3JvbGxiYXIpO1xuXG5cdFx0dGhpcy50YWJEaXNwb3NhYmxlcy5wdXNoKGNvbWJpbmVkRGlzcG9zYWJsZShnZXN0dXJlRGlzcG9zYWJsZSwgZXZlbnRzRGlzcG9zYWJsZSwgdGFiQWN0aW9uQmFyRGlzcG9zYWJsZSwgZWRpdG9yTGFiZWwpKTtcblxuXHRcdHJldHVybiB0YWJDb250YWluZXI7XG5cdH1cblxuXHRwcml2YXRlIHRvRWRpdG9ySW5kZXgodGFiSW5kZXg6IG51bWJlcik6IG51bWJlciB7XG5cblx0XHQvLyBHaXZlbiBhIGB0YWJJbmRleGAgdGhhdCBpcyByZWxhdGl2ZSB0byB0aGUgdGFicyBtb2RlbFxuXHRcdC8vIHJldHVybnMgdGhlIGBlZGl0b3JJbmRleGAgcmVsYXRpdmUgdG8gdGhlIGVudGlyZSBncm91cFxuXG5cdFx0Y29uc3QgZWRpdG9yID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9yQnlJbmRleCh0YWJJbmRleCkpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBWaWV3LmdldEluZGV4T2ZFZGl0b3IoZWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgbGFzdFNpbmdsZVNlbGVjdFNlbGVjdGVkRWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWdpc3RlclRhYkxpc3RlbmVycyh0YWI6IEhUTUxFbGVtZW50LCB0YWJJbmRleDogbnVtYmVyLCB0YWJzQ29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGFic1Njcm9sbGJhcjogU2Nyb2xsYWJsZUVsZW1lbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBoYW5kbGVDbGlja09yVG91Y2ggPSBhc3luYyAoZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCwgcHJlc2VydmVGb2N1czogYm9vbGVhbik6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0dGFiLmJsdXIoKTsgLy8gcHJldmVudCBmbGlja2VyIG9mIGZvY3VzIG91dGxpbmUgb24gdGFiIHVudGlsIGVkaXRvciBnb3QgZm9jdXNcblxuXHRcdFx0aWYgKGlzTW91c2VFdmVudChlKSAmJiAoZS5idXR0b24gIT09IDAgLyogbWlkZGxlL3JpZ2h0IG1vdXNlIGJ1dHRvbiAqLyB8fCAoaXNNYWNpbnRvc2ggJiYgZS5jdHJsS2V5IC8qIG1hY09TIGNvbnRleHQgbWVudSAqLykpKSB7XG5cdFx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTsgLy8gcmVxdWlyZWQgdG8gcHJldmVudCBhdXRvLXNjcm9sbGluZyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE2NjkwKVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5vcmlnaW5hdGVzRnJvbVRhYkFjdGlvbkJhcihlKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vdCB3aGVuIGNsaWNraW5nIG9uIGFjdGlvbnNcblx0XHRcdH1cblxuXHRcdFx0Ly8gT3BlbiB0YWJzIGVkaXRvclxuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9yQnlJbmRleCh0YWJJbmRleCk7XG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdGlmIChlLnNoaWZ0S2V5KSB7XG5cdFx0XHRcdFx0bGV0IGFuY2hvcjogRWRpdG9ySW5wdXQ7XG5cdFx0XHRcdFx0aWYgKHRoaXMubGFzdFNpbmdsZVNlbGVjdFNlbGVjdGVkRWRpdG9yICYmIHRoaXMudGFic01vZGVsLmlzU2VsZWN0ZWQodGhpcy5sYXN0U2luZ2xlU2VsZWN0U2VsZWN0ZWRFZGl0b3IpKSB7XG5cdFx0XHRcdFx0XHQvLyBUaGUgbGFzdCBzZWxlY3RlZCBlZGl0b3IgaXMgdGhlIGFuY2hvclxuXHRcdFx0XHRcdFx0YW5jaG9yID0gdGhpcy5sYXN0U2luZ2xlU2VsZWN0U2VsZWN0ZWRFZGl0b3I7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIFRoZSBhY3RpdmUgZWRpdG9yIGlzIHRoZSBhbmNob3Jcblx0XHRcdFx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvcik7XG5cdFx0XHRcdFx0XHR0aGlzLmxhc3RTaW5nbGVTZWxlY3RTZWxlY3RlZEVkaXRvciA9IGFjdGl2ZUVkaXRvcjtcblx0XHRcdFx0XHRcdGFuY2hvciA9IGFjdGl2ZUVkaXRvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zZWxlY3RFZGl0b3JzQmV0d2VlbihlZGl0b3IsIGFuY2hvcik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoKGUuY3RybEtleSAmJiAhaXNNYWNpbnRvc2gpIHx8IChlLm1ldGFLZXkgJiYgaXNNYWNpbnRvc2gpKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMudGFic01vZGVsLmlzU2VsZWN0ZWQoZWRpdG9yKSkge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy51bnNlbGVjdEVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnNlbGVjdEVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHRcdFx0dGhpcy5sYXN0U2luZ2xlU2VsZWN0U2VsZWN0ZWRFZGl0b3IgPSBlZGl0b3I7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEV2ZW4gaWYgZm9jdXMgaXMgcHJlc2VydmVkIG1ha2Ugc3VyZSB0byBhY3RpdmF0ZSB0aGUgZ3JvdXAuXG5cdFx0XHRcdFx0Ly8gSWYgYSBuZXcgYWN0aXZlIGVkaXRvciBpcyBzZWxlY3RlZCwga2VlcCB0aGUgY3VycmVudCBzZWxlY3Rpb24gb24ga2V5XG5cdFx0XHRcdFx0Ly8gZG93biBzdWNoIHRoYXQgZHJhZyBhbmQgZHJvcCBjYW4gb3BlcmF0ZSBvdmVyIHRoZSBzZWxlY3Rpb24uIFRoZSBzZWxlY3Rpb25cblx0XHRcdFx0XHQvLyBpcyByZW1vdmVkIG9uIGtleSB1cCBpbiB0aGlzIGNhc2UuXG5cdFx0XHRcdFx0Y29uc3QgaW5hY3RpdmVTZWxlY3Rpb24gPSB0aGlzLnRhYnNNb2RlbC5pc1NlbGVjdGVkKGVkaXRvcikgPyB0aGlzLmdyb3VwVmlldy5zZWxlY3RlZEVkaXRvcnMuZmlsdGVyKGUgPT4gIWUubWF0Y2hlcyhlZGl0b3IpKSA6IFtdO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZ3JvdXBWaWV3Lm9wZW5FZGl0b3IoZWRpdG9yLCB7IHByZXNlcnZlRm9jdXMsIGFjdGl2YXRpb246IEVkaXRvckFjdGl2YXRpb24uQUNUSVZBVEUgfSwgeyBpbmFjdGl2ZVNlbGVjdGlvbiwgZm9jdXNUYWJDb250cm9sOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNob3dDb250ZXh0TWVudSA9IChlOiBFdmVudCkgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9yQnlJbmRleCh0YWJJbmRleCk7XG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMub25UYWJDb250ZXh0TWVudShlZGl0b3IsIGUsIHRhYik7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIE9wZW4gb24gQ2xpY2sgLyBUb3VjaFxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBFdmVudFR5cGUuTU9VU0VfRE9XTiwgZSA9PiBoYW5kbGVDbGlja09yVG91Y2goZSwgZmFsc2UpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIFRvdWNoRXZlbnRUeXBlLlRhcCwgKGU6IEdlc3R1cmVFdmVudCkgPT4gaGFuZGxlQ2xpY2tPclRvdWNoKGUsIHRydWUpKSk7IC8vIFByZXNlcnZlIGZvY3VzIG9uIHRvdWNoICMxMjU0NzBcblxuXHRcdC8vIFRvdWNoIFNjcm9sbCBTdXBwb3J0XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIFRvdWNoRXZlbnRUeXBlLkNoYW5nZSwgKGU6IEdlc3R1cmVFdmVudCkgPT4ge1xuXHRcdFx0dGFic1Njcm9sbGJhci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbExlZnQ6IHRhYnNTY3JvbGxiYXIuZ2V0U2Nyb2xsUG9zaXRpb24oKS5zY3JvbGxMZWZ0IC0gZS50cmFuc2xhdGlvblggfSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVXBkYXRlIHNlbGVjdGlvbiAmIHByZXZlbnQgZmxpY2tlciBvZiBmb2N1cyBvdXRsaW5lIG9uIHRhYiB1bnRpbCBlZGl0b3IgZ290IGZvY3VzXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5NT1VTRV9VUCwgYXN5bmMgZSA9PiB7XG5cdFx0XHRFdmVudEhlbHBlci5zdG9wKGUpO1xuXG5cdFx0XHR0YWIuYmx1cigpO1xuXG5cdFx0XHRpZiAoaXNNb3VzZUV2ZW50KGUpICYmIChlLmJ1dHRvbiAhPT0gMCAvKiBtaWRkbGUvcmlnaHQgbW91c2UgYnV0dG9uICovIHx8IChpc01hY2ludG9zaCAmJiBlLmN0cmxLZXkgLyogbWFjT1MgY29udGV4dCBtZW51ICovKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5vcmlnaW5hdGVzRnJvbVRhYkFjdGlvbkJhcihlKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIG5vdCB3aGVuIGNsaWNraW5nIG9uIGFjdGlvbnNcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNDdHJsQ21kID0gKGUuY3RybEtleSAmJiAhaXNNYWNpbnRvc2gpIHx8IChlLm1ldGFLZXkgJiYgaXNNYWNpbnRvc2gpO1xuXHRcdFx0aWYgKCFpc0N0cmxDbWQgJiYgIWUuc2hpZnRLZXkgJiYgdGhpcy5ncm91cFZpZXcuc2VsZWN0ZWRFZGl0b3JzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51bnNlbGVjdEFsbEVkaXRvcnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBDbG9zZSBvbiBtb3VzZSBtaWRkbGUgY2xpY2tcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLkFVWENMSUNLLCBlID0+IHtcblx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSAvKiBNaWRkbGUgQnV0dG9uKi8pIHtcblx0XHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlIC8qIGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvNTY3MTUgKi8pO1xuXG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMudGFic01vZGVsLmdldEVkaXRvckJ5SW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0aWYgKHByZXZlbnRFZGl0b3JDbG9zZSh0aGlzLnRhYnNNb2RlbCwgZWRpdG9yLCBFZGl0b3JDbG9zZU1ldGhvZC5NT1VTRSwgdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHRoaXMuYmxvY2tSZXZlYWxBY3RpdmVUYWJPbmNlKCk7XG5cdFx0XHRcdFx0dGhpcy5jbG9zZUVkaXRvckFjdGlvbi5ydW4oeyBncm91cElkOiB0aGlzLmdyb3VwVmlldy5pZCwgZWRpdG9ySW5kZXg6IHRoaXMuZ3JvdXBWaWV3LmdldEluZGV4T2ZFZGl0b3IoZWRpdG9yKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENvbnRleHQgbWVudSBvbiBTaGlmdCtGMTBcblx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhYiwgRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5zaGlmdEtleSAmJiBldmVudC5rZXlDb2RlID09PSBLZXlDb2RlLkYxMCkge1xuXHRcdFx0XHRzaG93Q29udGV4dE1lbnUoZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29udGV4dCBtZW51IG9uIHRvdWNoIGNvbnRleHQgbWVudSBnZXN0dXJlXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIFRvdWNoRXZlbnRUeXBlLkNvbnRleHRtZW51LCAoZTogR2VzdHVyZUV2ZW50KSA9PiB7XG5cdFx0XHRzaG93Q29udGV4dE1lbnUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gS2V5Ym9hcmQgYWNjZXNzaWJpbGl0eVxuXHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBFdmVudFR5cGUuS0VZX1VQLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGxldCBoYW5kbGVkID0gZmFsc2U7XG5cblx0XHRcdC8vIFJ1biBhY3Rpb24gb24gRW50ZXIvU3BhY2Vcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdGhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLnRhYnNNb2RlbC5nZXRFZGl0b3JCeUluZGV4KHRhYkluZGV4KTtcblx0XHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMuZ3JvdXBWaWV3Lm9wZW5FZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBOYXZpZ2F0ZSBpbiBlZGl0b3JzXG5cdFx0XHRlbHNlIGlmIChbS2V5Q29kZS5MZWZ0QXJyb3csIEtleUNvZGUuUmlnaHRBcnJvdywgS2V5Q29kZS5VcEFycm93LCBLZXlDb2RlLkRvd25BcnJvdywgS2V5Q29kZS5Ib21lLCBLZXlDb2RlLkVuZF0uc29tZShrYiA9PiBldmVudC5lcXVhbHMoa2IpKSkge1xuXHRcdFx0XHRsZXQgZWRpdG9ySW5kZXggPSB0aGlzLnRvRWRpdG9ySW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuTGVmdEFycm93KSB8fCBldmVudC5lcXVhbHMoS2V5Q29kZS5VcEFycm93KSkge1xuXHRcdFx0XHRcdGVkaXRvckluZGV4ID0gZWRpdG9ySW5kZXggLSAxO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmVxdWFscyhLZXlDb2RlLlJpZ2h0QXJyb3cpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLkRvd25BcnJvdykpIHtcblx0XHRcdFx0XHRlZGl0b3JJbmRleCA9IGVkaXRvckluZGV4ICsgMTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5Ib21lKSkge1xuXHRcdFx0XHRcdGVkaXRvckluZGV4ID0gMDtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRlZGl0b3JJbmRleCA9IHRoaXMuZ3JvdXBWaWV3LmNvdW50IC0gMTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuZ3JvdXBWaWV3LmdldEVkaXRvckJ5SW5kZXgoZWRpdG9ySW5kZXgpO1xuXHRcdFx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRcdFx0aGFuZGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0dGhpcy5ncm91cFZpZXcub3BlbkVkaXRvcih0YXJnZXQsIHsgcHJlc2VydmVGb2N1czogdHJ1ZSB9LCB7IGZvY3VzVGFiQ29udHJvbDogdHJ1ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0XHRFdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBtb3ZpbmcgaW4gdGhlIHRhYnMgY29udGFpbmVyIGNhbiBoYXZlIGFuIGltcGFjdCBvbiBzY3JvbGxpbmcgcG9zaXRpb24sIHNvIHdlIG5lZWQgdG8gdXBkYXRlIHRoZSBjdXN0b20gc2Nyb2xsYmFyXG5cdFx0XHR0YWJzU2Nyb2xsYmFyLnNldFNjcm9sbFBvc2l0aW9uKHtcblx0XHRcdFx0c2Nyb2xsTGVmdDogdGFic0NvbnRhaW5lci5zY3JvbGxMZWZ0XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBEb3VibGUgY2xpY2s6IGVpdGhlciBwaW4gb3IgdG9nZ2xlIG1heGltaXplZFxuXHRcdGZvciAoY29uc3QgZXZlbnRUeXBlIG9mIFtUb3VjaEV2ZW50VHlwZS5UYXAsIEV2ZW50VHlwZS5EQkxDTElDS10pIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIodGFiLCBldmVudFR5cGUsIChlOiBNb3VzZUV2ZW50IHwgR2VzdHVyZUV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChldmVudFR5cGUgPT09IEV2ZW50VHlwZS5EQkxDTElDSykge1xuXHRcdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoKDxHZXN0dXJlRXZlbnQ+ZSkudGFwQ291bnQgIT09IDIpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIGlnbm9yZSBzaW5nbGUgdGFwc1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9yQnlJbmRleCh0YWJJbmRleCk7XG5cdFx0XHRcdGlmIChlZGl0b3IgJiYgdGhpcy50YWJzTW9kZWwuaXNQaW5uZWQoZWRpdG9yKSkge1xuXHRcdFx0XHRcdHN3aXRjaCAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmRvdWJsZUNsaWNrVGFiVG9Ub2dnbGVFZGl0b3JHcm91cFNpemVzKSB7XG5cdFx0XHRcdFx0XHRjYXNlICdtYXhpbWl6ZSc6XG5cdFx0XHRcdFx0XHRcdHRoaXMuZ3JvdXBzVmlldy50b2dnbGVNYXhpbWl6ZUdyb3VwKHRoaXMuZ3JvdXBWaWV3KTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlICdleHBhbmQnOlxuXHRcdFx0XHRcdFx0XHR0aGlzLmdyb3Vwc1ZpZXcudG9nZ2xlRXhwYW5kR3JvdXAodGhpcy5ncm91cFZpZXcpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgJ29mZic6XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuZ3JvdXBWaWV3LnBpbkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGV4dCBtZW51XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YWIsIEV2ZW50VHlwZS5DT05URVhUX01FTlUsIGUgPT4ge1xuXHRcdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yID0gdGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9yQnlJbmRleCh0YWJJbmRleCk7XG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdHRoaXMub25UYWJDb250ZXh0TWVudShlZGl0b3IsIGUsIHRhYik7XG5cdFx0XHR9XG5cdFx0fSwgdHJ1ZSAvKiB1c2UgY2FwdHVyZSB0byBmaXggaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5MTQ1ICovKSk7XG5cblx0XHQvLyBEcmFnICYgRHJvcCBzdXBwb3J0XG5cdFx0bGV0IGxhc3REcmFnRXZlbnQ6IERyYWdFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgaXNOZXdXaW5kb3dPcGVyYXRpb24gPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IERyYWdBbmREcm9wT2JzZXJ2ZXIodGFiLCB7XG5cdFx0XHRvbkRyYWdTdGFydDogZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvciA9IHRoaXMudGFic01vZGVsLmdldEVkaXRvckJ5SW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0XHRpZiAoIWVkaXRvcikge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlzTmV3V2luZG93T3BlcmF0aW9uID0gdGhpcy5pc05ld1dpbmRvd09wZXJhdGlvbihlKTtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRFZGl0b3JzID0gdGhpcy5ncm91cFZpZXcuc2VsZWN0ZWRFZGl0b3JzO1xuXHRcdFx0XHR0aGlzLmVkaXRvclRyYW5zZmVyLnNldERhdGEoc2VsZWN0ZWRFZGl0b3JzLm1hcChlID0+IG5ldyBEcmFnZ2VkRWRpdG9ySWRlbnRpZmllcih7IGVkaXRvcjogZSwgZ3JvdXBJZDogdGhpcy5ncm91cFZpZXcuaWQgfSkpLCBEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXG5cdFx0XHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdGUuZGF0YVRyYW5zZmVyLmVmZmVjdEFsbG93ZWQgPSAnY29weU1vdmUnO1xuXHRcdFx0XHRcdGlmIChzZWxlY3RlZEVkaXRvcnMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBgJHtlZGl0b3IuZ2V0TmFtZSgpfSArICR7c2VsZWN0ZWRFZGl0b3JzLmxlbmd0aCAtIDF9YDtcblx0XHRcdFx0XHRcdGFwcGx5RHJhZ0ltYWdlKGUsIHRhYiwgbGFiZWwpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zO1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNUYWJTdGlja3kgPSB0aGlzLnRhYnNNb2RlbC5pc1N0aWNreSh0YWJJbmRleCk7XG5cdFx0XHRcdFx0XHRjb25zdCBpc1Nocmlua1NpemluZyA9IG9wdGlvbnMudGFiU2l6aW5nID09PSAnc2hyaW5rJyB8fCAoaXNUYWJTdGlja3kgJiYgb3B0aW9ucy5waW5uZWRUYWJTaXppbmcgPT09ICdzaHJpbmsnKTtcblx0XHRcdFx0XHRcdGlmIChpc1Nocmlua1NpemluZykge1xuXHRcdFx0XHRcdFx0XHQvLyBXaGVuIHRhYiBzaXppbmcgaXMgJ3NocmluaycsIHRoZSB0YWIgbGFiZWwgbWF5IGJlIHRydW5jYXRlZC4gVXNpbmcgdGhlIHRhYiBET00gZWxlbWVudFxuXHRcdFx0XHRcdFx0XHQvLyBhcyBhIGRyYWcgaW1hZ2UgY2FuIGNhdXNlIHBhcnRzIG9mIHRoZSB0YWIgaGVhZGVyIFVJIHRvIHZpc3VhbGx5IGRyYWcgYWxvbmcuXG5cdFx0XHRcdFx0XHRcdC8vIEluc3RlYWQsIHVzZSBhIGNsZWFuIHRleHQtb25seSBkcmFnIGltYWdlIHdpdGggdGhlIGVkaXRvciBuYW1lLlxuXHRcdFx0XHRcdFx0XHRhcHBseURyYWdJbWFnZShlLCB0YWIsIGVkaXRvci5nZXROYW1lKCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuc2V0RHJhZ0ltYWdlKHRhYiwgMCwgMCk7IC8vIHRvcCBsZWZ0IGNvcm5lciBvZiBkcmFnZ2VkIHRhYiBzZXQgdG8gY3Vyc29yIHBvc2l0aW9uIHRvIG1ha2Ugcm9vbSBmb3IgZHJvcC1ib3JkZXIgZmVlZGJhY2tcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBcHBseSBzb21lIGRhdGF0cmFuc2ZlciB0eXBlcyB0byBhbGxvdyBmb3IgZHJhZ2dpbmcgdGhlIGVsZW1lbnQgb3V0c2lkZSBvZiB0aGUgYXBwbGljYXRpb25cblx0XHRcdFx0dGhpcy5kb0ZpbGxSZXNvdXJjZURhdGFUcmFuc2ZlcnMoc2VsZWN0ZWRFZGl0b3JzLCBlLCBpc05ld1dpbmRvd09wZXJhdGlvbik7XG5cblx0XHRcdFx0c2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5wYXJlbnQpLCAoKSA9PiB0aGlzLnVwZGF0ZURyb3BGZWVkYmFjayh0YWIsIGZhbHNlLCBlLCB0YWJJbmRleCkpO1xuXHRcdFx0fSxcblxuXHRcdFx0b25EcmFnOiBlID0+IHtcblx0XHRcdFx0bGFzdERyYWdFdmVudCA9IGU7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdFbnRlcjogZSA9PiB7XG5cblx0XHRcdFx0Ly8gUmV0dXJuIGlmIHRyYW5zZmVyIGlzIHVuc3VwcG9ydGVkXG5cdFx0XHRcdGlmICghdGhpcy5pc1N1cHBvcnRlZERyb3BUcmFuc2ZlcihlKSkge1xuXHRcdFx0XHRcdGlmIChlLmRhdGFUcmFuc2Zlcikge1xuXHRcdFx0XHRcdFx0ZS5kYXRhVHJhbnNmZXIuZHJvcEVmZmVjdCA9ICdub25lJztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBVcGRhdGUgdGhlIGRyb3BFZmZlY3QgdG8gXCJjb3B5XCIgaWYgdGhlcmUgaXMgbm8gbG9jYWwgZGF0YSB0byBiZSBkcmFnZ2VkIGJlY2F1c2Vcblx0XHRcdFx0Ly8gaW4gdGhhdCBjYXNlIHdlIGNhbiBvbmx5IGNvcHkgdGhlIGRhdGEgaW50byBhbmQgbm90IG1vdmUgaXQgZnJvbSBpdHMgc291cmNlXG5cdFx0XHRcdGlmICghdGhpcy5lZGl0b3JUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdFx0XHRpZiAoZS5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0XHRcdGUuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnY29weSc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2sodGFiLCB0cnVlLCBlLCB0YWJJbmRleCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRvbkRyYWdPdmVyOiAoZSwgZHJhZ0R1cmF0aW9uKSA9PiB7XG5cdFx0XHRcdGlmIChkcmFnRHVyYXRpb24gPj0gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5EUkFHX09WRVJfT1BFTl9UQUJfVEhSRVNIT0xEKSB7XG5cdFx0XHRcdFx0Y29uc3QgZHJhZ2dlZE92ZXJUYWIgPSB0aGlzLnRhYnNNb2RlbC5nZXRFZGl0b3JCeUluZGV4KHRhYkluZGV4KTtcblx0XHRcdFx0XHRpZiAoZHJhZ2dlZE92ZXJUYWIgJiYgdGhpcy50YWJzTW9kZWwuYWN0aXZlRWRpdG9yICE9PSBkcmFnZ2VkT3ZlclRhYikge1xuXHRcdFx0XHRcdFx0dGhpcy5ncm91cFZpZXcub3BlbkVkaXRvcihkcmFnZ2VkT3ZlclRhYiwgeyBwcmVzZXJ2ZUZvY3VzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYiwgdHJ1ZSwgZSwgdGFiSW5kZXgpO1xuXHRcdFx0fSxcblxuXHRcdFx0b25EcmFnRW5kOiBhc3luYyBlID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2sodGFiLCBmYWxzZSwgZSwgdGFiSW5kZXgpO1xuXHRcdFx0XHRjb25zdCBkcmFnZ2VkRWRpdG9ycyA9IHRoaXMuZWRpdG9yVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0XHR0aGlzLmVkaXRvclRyYW5zZmVyLmNsZWFyRGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHQhaXNOZXdXaW5kb3dPcGVyYXRpb24gfHxcblx0XHRcdFx0XHRpc1dpbmRvd0RyYWdnZWRPdmVyKCkgfHxcblx0XHRcdFx0XHQhZHJhZ2dlZEVkaXRvcnMgfHxcblx0XHRcdFx0XHRkcmFnZ2VkRWRpdG9ycy5sZW5ndGggPT09IDBcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBkcmFnIHRvIG9wZW4gaW4gbmV3IHdpbmRvdyBpcyBkaXNhYmxlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYXV4aWxpYXJ5RWRpdG9yUGFydCA9IGF3YWl0IHRoaXMubWF5YmVDcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0QXQoZSwgdGFiKTtcblx0XHRcdFx0aWYgKCFhdXhpbGlhcnlFZGl0b3JQYXJ0KSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdGFyZ2V0R3JvdXAgPSBhdXhpbGlhcnlFZGl0b3JQYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdFx0XHRjb25zdCBlZGl0b3JzV2l0aE9wdGlvbnMgPSBwcmVwYXJlTW92ZUNvcHlFZGl0b3JzKHRoaXMuZ3JvdXBWaWV3LCBkcmFnZ2VkRWRpdG9ycy5tYXAoZWRpdG9yID0+IGVkaXRvci5pZGVudGlmaWVyLmVkaXRvcikpO1xuXHRcdFx0XHRpZiAodGhpcy5pc01vdmVPcGVyYXRpb24obGFzdERyYWdFdmVudCA/PyBlLCB0YXJnZXRHcm91cC5pZCwgZHJhZ2dlZEVkaXRvcnNbMF0uaWRlbnRpZmllci5lZGl0b3IpKSB7XG5cdFx0XHRcdFx0dGhpcy5ncm91cFZpZXcubW92ZUVkaXRvcnMoZWRpdG9yc1dpdGhPcHRpb25zLCB0YXJnZXRHcm91cCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5ncm91cFZpZXcuY29weUVkaXRvcnMoZWRpdG9yc1dpdGhPcHRpb25zLCB0YXJnZXRHcm91cCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0YXJnZXRHcm91cC5mb2N1cygpO1xuXHRcdFx0fSxcblxuXHRcdFx0b25Ecm9wOiBlID0+IHtcblx0XHRcdFx0dGhpcy51cGRhdGVEcm9wRmVlZGJhY2sodGFiLCBmYWxzZSwgZSwgdGFiSW5kZXgpO1xuXG5cdFx0XHRcdC8vIGNvbXB1dGUgdGhlIHRhcmdldCBpbmRleFxuXHRcdFx0XHRsZXQgdGFyZ2V0SW5kZXggPSB0YWJJbmRleDtcblx0XHRcdFx0aWYgKHRoaXMuZ2V0VGFiRHJhZ092ZXJMb2NhdGlvbihlLCB0YWIpID09PSAncmlnaHQnKSB7XG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXgrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMub25Ecm9wKGUsIHRhcmdldEluZGV4LCB0YWJzQ29udGFpbmVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZGlzcG9zYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGlzU3VwcG9ydGVkRHJvcFRyYW5zZmVyKGU6IERyYWdFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdyb3VwVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSAmJiBkYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBkYXRhWzBdO1xuXHRcdFx0XHRpZiAoZ3JvdXAuaWRlbnRpZmllciA9PT0gdGhpcy5ncm91cFZpZXcuaWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGdyb3VwcyBjYW5ub3QgYmUgZHJvcHBlZCBvbiBncm91cCBpdCBvcmlnaW5hdGVzIGZyb21cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5lZGl0b3JUcmFuc2Zlci5oYXNEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyAobG9jYWwpIGVkaXRvcnMgY2FuIGFsd2F5cyBiZSBkcm9wcGVkXG5cdFx0fVxuXG5cdFx0aWYgKGUuZGF0YVRyYW5zZmVyICYmIGUuZGF0YVRyYW5zZmVyLnR5cGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBvcHRpbWlzdGljYWxseSBhbGxvdyBleHRlcm5hbCBkYXRhICgvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1Nzg5KVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlRHJvcEZlZWRiYWNrKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpc0RORDogYm9vbGVhbiwgZTogRHJhZ0V2ZW50LCB0YWJJbmRleD86IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGlzVGFiID0gKHR5cGVvZiB0YWJJbmRleCA9PT0gJ251bWJlcicpO1xuXG5cdFx0bGV0IGRyb3BUYXJnZXQ7XG5cdFx0aWYgKGlzRE5EKSB7XG5cdFx0XHRpZiAoaXNUYWIpIHtcblx0XHRcdFx0ZHJvcFRhcmdldCA9IHRoaXMuY29tcHV0ZURyb3BUYXJnZXQoZSwgdGFiSW5kZXgsIGVsZW1lbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZHJvcFRhcmdldCA9IHsgbGVmdEVsZW1lbnQ6IGVsZW1lbnQubGFzdEVsZW1lbnRDaGlsZCBhcyBIVE1MRWxlbWVudCwgcmlnaHRFbGVtZW50OiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0ZHJvcFRhcmdldCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZURyb3BUYXJnZXQoZHJvcFRhcmdldCk7XG5cdH1cblxuXHRwcml2YXRlIGRyb3BUYXJnZXQ6IHsgbGVmdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkOyByaWdodEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgdXBkYXRlRHJvcFRhcmdldChuZXdUYXJnZXQ6IHsgbGVmdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkOyByaWdodEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBvbGRUYXJnZXRzID0gdGhpcy5kcm9wVGFyZ2V0O1xuXHRcdGlmIChvbGRUYXJnZXRzID09PSBuZXdUYXJnZXQgfHwgb2xkVGFyZ2V0cyAmJiBuZXdUYXJnZXQgJiYgb2xkVGFyZ2V0cy5sZWZ0RWxlbWVudCA9PT0gbmV3VGFyZ2V0LmxlZnRFbGVtZW50ICYmIG9sZFRhcmdldHMucmlnaHRFbGVtZW50ID09PSBuZXdUYXJnZXQucmlnaHRFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHJvcENsYXNzTGVmdCA9ICdkcm9wLXRhcmdldC1sZWZ0Jztcblx0XHRjb25zdCBkcm9wQ2xhc3NSaWdodCA9ICdkcm9wLXRhcmdldC1yaWdodCc7XG5cblx0XHRpZiAob2xkVGFyZ2V0cykge1xuXHRcdFx0b2xkVGFyZ2V0cy5sZWZ0RWxlbWVudD8uY2xhc3NMaXN0LnJlbW92ZShkcm9wQ2xhc3NMZWZ0KTtcblx0XHRcdG9sZFRhcmdldHMucmlnaHRFbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKGRyb3BDbGFzc1JpZ2h0KTtcblx0XHR9XG5cblx0XHRpZiAobmV3VGFyZ2V0KSB7XG5cdFx0XHRuZXdUYXJnZXQubGVmdEVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoZHJvcENsYXNzTGVmdCk7XG5cdFx0XHRuZXdUYXJnZXQucmlnaHRFbGVtZW50Py5jbGFzc0xpc3QuYWRkKGRyb3BDbGFzc1JpZ2h0KTtcblx0XHR9XG5cblx0XHR0aGlzLmRyb3BUYXJnZXQgPSBuZXdUYXJnZXQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFRhYkRyYWdPdmVyTG9jYXRpb24oZTogRHJhZ0V2ZW50LCB0YWI6IEhUTUxFbGVtZW50KTogJ2xlZnQnIHwgJ3JpZ2h0JyB7XG5cdFx0Y29uc3QgcmVjdCA9IHRhYi5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCBvZmZzZXRYUmVsYXRpdmVUb1BhcmVudCA9IGUuY2xpZW50WCAtIHJlY3QubGVmdDtcblxuXHRcdHJldHVybiBvZmZzZXRYUmVsYXRpdmVUb1BhcmVudCA8PSByZWN0LndpZHRoIC8gMiA/ICdsZWZ0JyA6ICdyaWdodCc7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVEcm9wVGFyZ2V0KGU6IERyYWdFdmVudCwgdGFiSW5kZXg6IG51bWJlciwgdGFyZ2V0VGFiOiBIVE1MRWxlbWVudCk6IHsgbGVmdEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkOyByaWdodEVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGlzTGVmdFNpZGVPZlRhYiA9IHRoaXMuZ2V0VGFiRHJhZ092ZXJMb2NhdGlvbihlLCB0YXJnZXRUYWIpID09PSAnbGVmdCc7XG5cdFx0Y29uc3QgaXNMYXN0VGFiID0gdGFiSW5kZXggPT09IHRoaXMudGFic01vZGVsLmNvdW50IC0gMTtcblx0XHRjb25zdCBpc0ZpcnN0VGFiID0gdGFiSW5kZXggPT09IDA7XG5cblx0XHQvLyBCZWZvcmUgZmlyc3QgdGFiXG5cdFx0aWYgKGlzTGVmdFNpZGVPZlRhYiAmJiBpc0ZpcnN0VGFiKSB7XG5cdFx0XHRyZXR1cm4geyBsZWZ0RWxlbWVudDogdW5kZWZpbmVkLCByaWdodEVsZW1lbnQ6IHRhcmdldFRhYiB9O1xuXHRcdH1cblxuXHRcdC8vIEFmdGVyIGxhc3QgdGFiXG5cdFx0aWYgKCFpc0xlZnRTaWRlT2ZUYWIgJiYgaXNMYXN0VGFiKSB7XG5cdFx0XHRyZXR1cm4geyBsZWZ0RWxlbWVudDogdGFyZ2V0VGFiLCByaWdodEVsZW1lbnQ6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdC8vIEJldHdlZW4gdHdvIHRhYnNcblx0XHRjb25zdCB0YWJCZWZvcmUgPSBpc0xlZnRTaWRlT2ZUYWIgPyB0YXJnZXRUYWIucHJldmlvdXNFbGVtZW50U2libGluZyA6IHRhcmdldFRhYjtcblx0XHRjb25zdCB0YWJBZnRlciA9IGlzTGVmdFNpZGVPZlRhYiA/IHRhcmdldFRhYiA6IHRhcmdldFRhYi5uZXh0RWxlbWVudFNpYmxpbmc7XG5cblx0XHRyZXR1cm4geyBsZWZ0RWxlbWVudDogdGFiQmVmb3JlIGFzIEhUTUxFbGVtZW50LCByaWdodEVsZW1lbnQ6IHRhYkFmdGVyIGFzIEhUTUxFbGVtZW50IH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbGVjdEVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBWaWV3LmlzQWN0aXZlKGVkaXRvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmdyb3VwVmlldy5zZXRTZWxlY3Rpb24oZWRpdG9yLCB0aGlzLmdyb3VwVmlldy5zZWxlY3RlZEVkaXRvcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWxlY3RFZGl0b3JzQmV0d2Vlbih0YXJnZXQ6IEVkaXRvcklucHV0LCBhbmNob3I6IEVkaXRvcklucHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZWRpdG9ySW5kZXggPSB0aGlzLmdyb3VwVmlldy5nZXRJbmRleE9mRWRpdG9yKHRhcmdldCk7XG5cdFx0aWYgKGVkaXRvckluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFuY2hvckVkaXRvckluZGV4ID0gdGhpcy5ncm91cFZpZXcuZ2V0SW5kZXhPZkVkaXRvcihhbmNob3IpO1xuXHRcdGlmIChhbmNob3JFZGl0b3JJbmRleCA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0XHR9XG5cblx0XHRsZXQgc2VsZWN0aW9uID0gdGhpcy5ncm91cFZpZXcuc2VsZWN0ZWRFZGl0b3JzO1xuXG5cdFx0Ly8gVW5zZWxlY3QgZWRpdG9ycyBvbiBvdGhlciBzaWRlIG9mIGFuY2hvciBpbiByZWxhdGlvbiB0byB0aGUgdGFyZ2V0XG5cdFx0bGV0IGN1cnJlbnRFZGl0b3JJbmRleCA9IGFuY2hvckVkaXRvckluZGV4O1xuXHRcdHdoaWxlIChjdXJyZW50RWRpdG9ySW5kZXggPj0gMCAmJiBjdXJyZW50RWRpdG9ySW5kZXggPD0gdGhpcy5ncm91cFZpZXcuY291bnQgLSAxKSB7XG5cdFx0XHRjdXJyZW50RWRpdG9ySW5kZXggPSBhbmNob3JFZGl0b3JJbmRleCA8IGVkaXRvckluZGV4ID8gY3VycmVudEVkaXRvckluZGV4IC0gMSA6IGN1cnJlbnRFZGl0b3JJbmRleCArIDE7XG5cblx0XHRcdGNvbnN0IGN1cnJlbnRFZGl0b3IgPSB0aGlzLmdyb3VwVmlldy5nZXRFZGl0b3JCeUluZGV4KGN1cnJlbnRFZGl0b3JJbmRleCk7XG5cdFx0XHRpZiAoIWN1cnJlbnRFZGl0b3IpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5ncm91cFZpZXcuaXNTZWxlY3RlZChjdXJyZW50RWRpdG9yKSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblxuXHRcdFx0c2VsZWN0aW9uID0gc2VsZWN0aW9uLmZpbHRlcihlZGl0b3IgPT4gIWVkaXRvci5tYXRjaGVzKGN1cnJlbnRFZGl0b3IpKTtcblx0XHR9XG5cblx0XHQvLyBTZWxlY3QgZWRpdG9ycyBiZXR3ZWVuIGFuY2hvciBhbmQgdGFyZ2V0XG5cdFx0Y29uc3QgZnJvbUVkaXRvckluZGV4ID0gYW5jaG9yRWRpdG9ySW5kZXggPCBlZGl0b3JJbmRleCA/IGFuY2hvckVkaXRvckluZGV4IDogZWRpdG9ySW5kZXg7XG5cdFx0Y29uc3QgdG9FZGl0b3JJbmRleCA9IGFuY2hvckVkaXRvckluZGV4IDwgZWRpdG9ySW5kZXggPyBlZGl0b3JJbmRleCA6IGFuY2hvckVkaXRvckluZGV4O1xuXG5cdFx0Y29uc3QgZWRpdG9yc1RvU2VsZWN0ID0gdGhpcy5ncm91cFZpZXcuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuc2xpY2UoZnJvbUVkaXRvckluZGV4LCB0b0VkaXRvckluZGV4ICsgMSk7XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZWRpdG9yc1RvU2VsZWN0KSB7XG5cdFx0XHRpZiAoIXRoaXMuZ3JvdXBWaWV3LmlzU2VsZWN0ZWQoZWRpdG9yKSkge1xuXHRcdFx0XHRzZWxlY3Rpb24ucHVzaChlZGl0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzID0gc2VsZWN0aW9uLmZpbHRlcihlZGl0b3IgPT4gIWVkaXRvci5tYXRjaGVzKHRhcmdldCkpO1xuXHRcdGF3YWl0IHRoaXMuZ3JvdXBWaWV3LnNldFNlbGVjdGlvbih0YXJnZXQsIGluYWN0aXZlU2VsZWN0ZWRFZGl0b3JzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdW5zZWxlY3RFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGlzVW5zZWxlY3RpbmdBY3RpdmVFZGl0b3IgPSB0aGlzLmdyb3VwVmlldy5pc0FjdGl2ZShlZGl0b3IpO1xuXG5cdFx0Ly8gSWYgdGhlcmUgaXMgb25seSBvbmUgZWRpdG9yIHNlbGVjdGVkLCBkbyBub3QgdW5zZWxlY3QgaXRcblx0XHRpZiAoaXNVbnNlbGVjdGluZ0FjdGl2ZUVkaXRvciAmJiB0aGlzLmdyb3VwVmlldy5zZWxlY3RlZEVkaXRvcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IG5ld0FjdGl2ZUVkaXRvciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuZ3JvdXBWaWV3LmFjdGl2ZUVkaXRvcik7XG5cblx0XHQvLyBJZiBhY3RpdmUgZWRpdG9yIGlzIGJpbmcgdW5zZWxlY3RlZCB0aGVuIGZpbmQgdGhlIG1vc3QgcmVjZW50bHkgb3BlbmVkIHNlbGVjdGVkIGVkaXRvclxuXHRcdC8vIHRoYXQgaXMgbm90IHRoZSBlZGl0b3IgYmVpbmcgdW5zZWxlY3RlZFxuXHRcdGlmIChpc1Vuc2VsZWN0aW5nQWN0aXZlRWRpdG9yKSB7XG5cdFx0XHRjb25zdCByZWNlbnRFZGl0b3JzID0gdGhpcy5ncm91cFZpZXcuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCByZWNlbnRFZGl0b3JzLmxlbmd0aDsgaSsrKSB7IC8vIEZpcnN0IG9uZSBpcyB0aGUgYWN0aXZlIGVkaXRvclxuXHRcdFx0XHRjb25zdCByZWNlbnRFZGl0b3IgPSByZWNlbnRFZGl0b3JzW2ldO1xuXHRcdFx0XHRpZiAodGhpcy5ncm91cFZpZXcuaXNTZWxlY3RlZChyZWNlbnRFZGl0b3IpKSB7XG5cdFx0XHRcdFx0bmV3QWN0aXZlRWRpdG9yID0gcmVjZW50RWRpdG9yO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMgPSB0aGlzLmdyb3VwVmlldy5zZWxlY3RlZEVkaXRvcnMuZmlsdGVyKGUgPT4gIWUubWF0Y2hlcyhlZGl0b3IpICYmICFlLm1hdGNoZXMobmV3QWN0aXZlRWRpdG9yKSk7XG5cdFx0YXdhaXQgdGhpcy5ncm91cFZpZXcuc2V0U2VsZWN0aW9uKG5ld0FjdGl2ZUVkaXRvciwgaW5hY3RpdmVTZWxlY3RlZEVkaXRvcnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1bnNlbGVjdEFsbEVkaXRvcnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZ3JvdXBWaWV3LnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAxKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVFZGl0b3IgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmdyb3VwVmlldy5hY3RpdmVFZGl0b3IpO1xuXHRcdFx0YXdhaXQgdGhpcy5ncm91cFZpZXcuc2V0U2VsZWN0aW9uKGFjdGl2ZUVkaXRvciwgW10pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZVRhYkxhYmVscygpOiB2b2lkIHtcblx0XHRjb25zdCB7IGxhYmVsRm9ybWF0IH0gPSB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnM7XG5cdFx0Y29uc3QgeyB2ZXJib3NpdHksIHNob3J0ZW5EdXBsaWNhdGVzIH0gPSB0aGlzLmdldExhYmVsQ29uZmlnRmxhZ3MobGFiZWxGb3JtYXQpO1xuXG5cdFx0Ly8gQnVpbGQgbGFiZWxzIGFuZCBkZXNjcmlwdGlvbnMgZm9yIGVhY2ggZWRpdG9yXG5cdFx0Y29uc3QgbGFiZWxzOiBJRWRpdG9ySW5wdXRMYWJlbFtdID0gW107XG5cdFx0bGV0IGFjdGl2ZUVkaXRvclRhYkluZGV4ID0gLTE7XG5cdFx0dGhpcy50YWJzTW9kZWwuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZm9yRWFjaCgoZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiSW5kZXg6IG51bWJlcikgPT4ge1xuXHRcdFx0bGFiZWxzLnB1c2goe1xuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdG5hbWU6IGVkaXRvci5nZXROYW1lKCksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBlZGl0b3IuZ2V0RGVzY3JpcHRpb24odmVyYm9zaXR5KSxcblx0XHRcdFx0Zm9yY2VEZXNjcmlwdGlvbjogZWRpdG9yLmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuRm9yY2VEZXNjcmlwdGlvbiksXG5cdFx0XHRcdHRpdGxlOiBlZGl0b3IuZ2V0VGl0bGUoVmVyYm9zaXR5LkxPTkcpLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGNvbXB1dGVFZGl0b3JBcmlhTGFiZWwoZWRpdG9yLCB0YWJJbmRleCwgdGhpcy5ncm91cFZpZXcsIHRoaXMuZWRpdG9yUGFydHNWaWV3LmNvdW50KVxuXHRcdFx0fSk7XG5cblx0XHRcdGlmIChlZGl0b3IgPT09IHRoaXMudGFic01vZGVsLmFjdGl2ZUVkaXRvcikge1xuXHRcdFx0XHRhY3RpdmVFZGl0b3JUYWJJbmRleCA9IHRhYkluZGV4O1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gU2hvcnRlbiBsYWJlbHMgYXMgbmVlZGVkXG5cdFx0aWYgKHNob3J0ZW5EdXBsaWNhdGVzKSB7XG5cdFx0XHR0aGlzLnNob3J0ZW5UYWJMYWJlbHMobGFiZWxzKTtcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciBmb3IgZmFzdCBsb29rdXBcblx0XHR0aGlzLnRhYkxhYmVscyA9IGxhYmVscztcblx0XHR0aGlzLmFjdGl2ZVRhYkxhYmVsID0gbGFiZWxzW2FjdGl2ZUVkaXRvclRhYkluZGV4XTtcblx0fVxuXG5cdHByaXZhdGUgc2hvcnRlblRhYkxhYmVscyhsYWJlbHM6IElFZGl0b3JJbnB1dExhYmVsW10pOiB2b2lkIHtcblxuXHRcdC8vIEdhdGhlciBkdXBsaWNhdGUgdGl0bGVzLCB3aGlsZSBmaWx0ZXJpbmcgb3V0IGludmFsaWQgZGVzY3JpcHRpb25zXG5cdFx0Y29uc3QgbWFwTmFtZVRvRHVwbGljYXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRWRpdG9ySW5wdXRMYWJlbFtdPigpO1xuXHRcdGZvciAoY29uc3QgbGFiZWwgb2YgbGFiZWxzKSB7XG5cdFx0XHRpZiAodHlwZW9mIGxhYmVsLmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRnZXRPclNldChtYXBOYW1lVG9EdXBsaWNhdGVzLCBsYWJlbC5uYW1lLCBbXSkucHVzaChsYWJlbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbC5kZXNjcmlwdGlvbiA9ICcnO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElkZW50aWZ5IGR1cGxpY2F0ZSBuYW1lcyBhbmQgc2hvcnRlbiBkZXNjcmlwdGlvbnNcblx0XHRmb3IgKGNvbnN0IFssIGR1cGxpY2F0ZUxhYmVsc10gb2YgbWFwTmFtZVRvRHVwbGljYXRlcykge1xuXG5cdFx0XHQvLyBSZW1vdmUgZGVzY3JpcHRpb24gaWYgdGhlIHRpdGxlIGlzbid0IGR1cGxpY2F0ZWRcblx0XHRcdC8vIGFuZCB3ZSBoYXZlIG5vIGluZGljYXRpb24gdG8gZW5mb3JjZSBkZXNjcmlwdGlvblxuXHRcdFx0aWYgKGR1cGxpY2F0ZUxhYmVscy5sZW5ndGggPT09IDEgJiYgIWR1cGxpY2F0ZUxhYmVsc1swXS5mb3JjZURlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdGR1cGxpY2F0ZUxhYmVsc1swXS5kZXNjcmlwdGlvbiA9ICcnO1xuXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZGVudGlmeSBkdXBsaWNhdGUgZGVzY3JpcHRpb25zXG5cdFx0XHRjb25zdCBtYXBEZXNjcmlwdGlvblRvRHVwbGljYXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBJRWRpdG9ySW5wdXRMYWJlbFtdPigpO1xuXHRcdFx0Zm9yIChjb25zdCBkdXBsaWNhdGVMYWJlbCBvZiBkdXBsaWNhdGVMYWJlbHMpIHtcblx0XHRcdFx0Z2V0T3JTZXQobWFwRGVzY3JpcHRpb25Ub0R1cGxpY2F0ZXMsIGR1cGxpY2F0ZUxhYmVsLmRlc2NyaXB0aW9uLCBbXSkucHVzaChkdXBsaWNhdGVMYWJlbCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciBlZGl0b3JzIHdpdGggZHVwbGljYXRlIGRlc2NyaXB0aW9ucywgY2hlY2sgd2hldGhlciBhbnkgbG9uZyBkZXNjcmlwdGlvbnMgZGlmZmVyXG5cdFx0XHRsZXQgdXNlTG9uZ0Rlc2NyaXB0aW9ucyA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBbLCBkdXBsaWNhdGVMYWJlbHNdIG9mIG1hcERlc2NyaXB0aW9uVG9EdXBsaWNhdGVzKSB7XG5cdFx0XHRcdGlmICghdXNlTG9uZ0Rlc2NyaXB0aW9ucyAmJiBkdXBsaWNhdGVMYWJlbHMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRcdGNvbnN0IFtmaXJzdCwgLi4ucmVzdF0gPSBkdXBsaWNhdGVMYWJlbHMubWFwKCh7IGVkaXRvciB9KSA9PiBlZGl0b3IuZ2V0RGVzY3JpcHRpb24oVmVyYm9zaXR5LkxPTkcpKTtcblx0XHRcdFx0XHR1c2VMb25nRGVzY3JpcHRpb25zID0gcmVzdC5zb21lKGRlc2NyaXB0aW9uID0+IGRlc2NyaXB0aW9uICE9PSBmaXJzdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgc28sIHJlcGxhY2UgYWxsIGRlc2NyaXB0aW9ucyB3aXRoIGxvbmcgZGVzY3JpcHRpb25zXG5cdFx0XHRpZiAodXNlTG9uZ0Rlc2NyaXB0aW9ucykge1xuXHRcdFx0XHRtYXBEZXNjcmlwdGlvblRvRHVwbGljYXRlcy5jbGVhcigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGR1cGxpY2F0ZUxhYmVsIG9mIGR1cGxpY2F0ZUxhYmVscykge1xuXHRcdFx0XHRcdGR1cGxpY2F0ZUxhYmVsLmRlc2NyaXB0aW9uID0gZHVwbGljYXRlTGFiZWwuZWRpdG9yLmdldERlc2NyaXB0aW9uKFZlcmJvc2l0eS5MT05HKTtcblx0XHRcdFx0XHRnZXRPclNldChtYXBEZXNjcmlwdGlvblRvRHVwbGljYXRlcywgZHVwbGljYXRlTGFiZWwuZGVzY3JpcHRpb24sIFtdKS5wdXNoKGR1cGxpY2F0ZUxhYmVsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBPYnRhaW4gZmluYWwgc2V0IG9mIGRlc2NyaXB0aW9uc1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRpb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBbZGVzY3JpcHRpb25dIG9mIG1hcERlc2NyaXB0aW9uVG9EdXBsaWNhdGVzKSB7XG5cdFx0XHRcdGRlc2NyaXB0aW9ucy5wdXNoKGRlc2NyaXB0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVtb3ZlIGRlc2NyaXB0aW9uIGlmIGFsbCBkZXNjcmlwdGlvbnMgYXJlIGlkZW50aWNhbCB1bmxlc3MgZm9yY2VkXG5cdFx0XHRpZiAoZGVzY3JpcHRpb25zLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxhYmVsIG9mIG1hcERlc2NyaXB0aW9uVG9EdXBsaWNhdGVzLmdldChkZXNjcmlwdGlvbnNbMF0pIHx8IFtdKSB7XG5cdFx0XHRcdFx0aWYgKCFsYWJlbC5mb3JjZURlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRsYWJlbC5kZXNjcmlwdGlvbiA9ICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG9ydGVuIGRlc2NyaXB0aW9uc1xuXHRcdFx0Y29uc3Qgc2hvcnRlbmVkRGVzY3JpcHRpb25zID0gc2hvcnRlbihkZXNjcmlwdGlvbnMsIHRoaXMucGF0aC5zZXApO1xuXHRcdFx0ZGVzY3JpcHRpb25zLmZvckVhY2goKGRlc2NyaXB0aW9uLCB0YWJJbmRleCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGxhYmVsIG9mIG1hcERlc2NyaXB0aW9uVG9EdXBsaWNhdGVzLmdldChkZXNjcmlwdGlvbikgfHwgW10pIHtcblx0XHRcdFx0XHRsYWJlbC5kZXNjcmlwdGlvbiA9IHNob3J0ZW5lZERlc2NyaXB0aW9uc1t0YWJJbmRleF07XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TGFiZWxDb25maWdGbGFncyh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSAnc2hvcnQnOlxuXHRcdFx0XHRyZXR1cm4geyB2ZXJib3NpdHk6IFZlcmJvc2l0eS5TSE9SVCwgc2hvcnRlbkR1cGxpY2F0ZXM6IGZhbHNlIH07XG5cdFx0XHRjYXNlICdtZWRpdW0nOlxuXHRcdFx0XHRyZXR1cm4geyB2ZXJib3NpdHk6IFZlcmJvc2l0eS5NRURJVU0sIHNob3J0ZW5EdXBsaWNhdGVzOiBmYWxzZSB9O1xuXHRcdFx0Y2FzZSAnbG9uZyc6XG5cdFx0XHRcdHJldHVybiB7IHZlcmJvc2l0eTogVmVyYm9zaXR5LkxPTkcsIHNob3J0ZW5EdXBsaWNhdGVzOiBmYWxzZSB9O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHsgdmVyYm9zaXR5OiBWZXJib3NpdHkuTUVESVVNLCBzaG9ydGVuRHVwbGljYXRlczogdHJ1ZSB9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVkcmF3KG9wdGlvbnM/OiBJTXVsdGlFZGl0b3JUYWJzQ29udHJvbExheW91dE9wdGlvbnMpOiB2b2lkIHtcblxuXHRcdC8vIEJvcmRlciBiZWxvdyB0YWJzIGlmIGFueSB3aXRoIGV4cGxpY2l0IGhpZ2ggY29udHJhc3Qgc3VwcG9ydFxuXHRcdGlmICh0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyKSB7XG5cdFx0XHRsZXQgdGFic0NvbnRhaW5lckJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQk9SREVSKTtcblx0XHRcdGlmICghdGFic0NvbnRhaW5lckJvcmRlckNvbG9yICYmIGlzSGlnaENvbnRyYXN0KHRoaXMudGhlbWUudHlwZSkpIHtcblx0XHRcdFx0dGFic0NvbnRhaW5lckJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihUQUJfQk9SREVSKSB8fCB0aGlzLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRhYnNDb250YWluZXJCb3JkZXJDb2xvcikge1xuXHRcdFx0XHR0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3RhYnMtYm9yZGVyLWJvdHRvbScpO1xuXHRcdFx0XHR0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLXRhYnMtYm9yZGVyLWJvdHRvbS1jb2xvcicsIHRhYnNDb250YWluZXJCb3JkZXJDb2xvci50b1N0cmluZygpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgndGFicy1ib3JkZXItYm90dG9tJyk7XG5cdFx0XHRcdHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFicy1ib3JkZXItYm90dG9tLWNvbG9yJyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGVhY2ggdGFiXG5cdFx0dGhpcy5mb3JFYWNoVGFiKChlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKSA9PiB7XG5cdFx0XHR0aGlzLnJlZHJhd1RhYihlZGl0b3IsIHRhYkluZGV4LCB0YWJDb250YWluZXIsIHRhYkxhYmVsV2lkZ2V0LCB0YWJMYWJlbCwgdGFiQWN0aW9uQmFyKTtcblx0XHR9KTtcblxuXHRcdC8vIFVwZGF0ZSBFZGl0b3IgQWN0aW9ucyBUb29sYmFyXG5cdFx0dGhpcy51cGRhdGVFZGl0b3JBY3Rpb25zVG9vbGJhcigpO1xuXG5cdFx0Ly8gRW5zdXJlIHRoZSBhY3RpdmUgdGFiIGlzIGFsd2F5cyByZXZlYWxlZFxuXHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9ucywgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIHJlZHJhd1RhYihlZGl0b3I6IEVkaXRvcklucHV0LCB0YWJJbmRleDogbnVtYmVyLCB0YWJDb250YWluZXI6IEhUTUxFbGVtZW50LCB0YWJMYWJlbFdpZGdldDogSVJlc291cmNlTGFiZWwsIHRhYkxhYmVsOiBJRWRpdG9ySW5wdXRMYWJlbCwgdGFiQWN0aW9uQmFyOiBBY3Rpb25CYXIpOiB2b2lkIHtcblx0XHRjb25zdCBpc1RhYlN0aWNreSA9IHRoaXMudGFic01vZGVsLmlzU3RpY2t5KHRhYkluZGV4KTtcblx0XHRjb25zdCBvcHRpb25zID0gdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zO1xuXG5cdFx0Ly8gTGFiZWxcblx0XHR0aGlzLnJlZHJhd1RhYkxhYmVsKGVkaXRvciwgdGFiSW5kZXgsIHRhYkNvbnRhaW5lciwgdGFiTGFiZWxXaWRnZXQsIHRhYkxhYmVsKTtcblxuXHRcdC8vIEFjdGlvblxuXHRcdGNvbnN0IGhhc1VucGluQWN0aW9uID0gaXNUYWJTdGlja3kgJiYgb3B0aW9ucy50YWJBY3Rpb25VbnBpblZpc2liaWxpdHk7XG5cdFx0Y29uc3QgaGFzQ2xvc2VBY3Rpb24gPSAhaGFzVW5waW5BY3Rpb24gJiYgb3B0aW9ucy50YWJBY3Rpb25DbG9zZVZpc2liaWxpdHk7XG5cdFx0Y29uc3QgaGFzQWN0aW9uID0gaGFzVW5waW5BY3Rpb24gfHwgaGFzQ2xvc2VBY3Rpb247XG5cblx0XHRsZXQgdGFiQWN0aW9uO1xuXHRcdGlmIChoYXNBY3Rpb24pIHtcblx0XHRcdHRhYkFjdGlvbiA9IGhhc1VucGluQWN0aW9uID8gdGhpcy51bnBpbkVkaXRvckFjdGlvbiA6IHRoaXMuY2xvc2VFZGl0b3JBY3Rpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEV2ZW4gaWYgdGhlIGFjdGlvbiBpcyBub3QgdmlzaWJsZSwgYWRkIGl0IGFzIGl0IGNvbnRhaW5zIHRoZSBkaXJ0eSBpbmRpY2F0b3Jcblx0XHRcdHRhYkFjdGlvbiA9IGlzVGFiU3RpY2t5ID8gdGhpcy51bnBpbkVkaXRvckFjdGlvbiA6IHRoaXMuY2xvc2VFZGl0b3JBY3Rpb247XG5cdFx0fVxuXG5cdFx0aWYgKCF0YWJBY3Rpb25CYXIuaGFzQWN0aW9uKHRhYkFjdGlvbikpIHtcblx0XHRcdGlmICghdGFiQWN0aW9uQmFyLmlzRW1wdHkoKSkge1xuXHRcdFx0XHR0YWJBY3Rpb25CYXIuY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0dGFiQWN0aW9uQmFyLnB1c2godGFiQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSwga2V5YmluZGluZzogdGhpcy5nZXRLZXliaW5kaW5nTGFiZWwodGFiQWN0aW9uKSB9KTtcblx0XHR9XG5cblx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShgcGlubmVkLWFjdGlvbi1vZmZgLCBpc1RhYlN0aWNreSAmJiAhaGFzVW5waW5BY3Rpb24pO1xuXHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKGBjbG9zZS1hY3Rpb24tb2ZmYCwgIWhhc1VucGluQWN0aW9uICYmICFoYXNDbG9zZUFjdGlvbik7XG5cblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBbJ2xlZnQnLCAncmlnaHQnXSkge1xuXHRcdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoYHRhYi1hY3Rpb25zLSR7b3B0aW9ufWAsIGhhc0FjdGlvbiAmJiBvcHRpb25zLnRhYkFjdGlvbkxvY2F0aW9uID09PSBvcHRpb24pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhYlNpemluZyA9IGlzVGFiU3RpY2t5ICYmIG9wdGlvbnMucGlubmVkVGFiU2l6aW5nID09PSAnc2hyaW5rJyA/ICdzaHJpbmsnIC8qIHRyZWF0IHN0aWNreSBzaHJpbmsgdGFicyBhcyB0YWJTaXppbmc6ICdzaHJpbmsnICovIDogb3B0aW9ucy50YWJTaXppbmc7XG5cdFx0Zm9yIChjb25zdCBvcHRpb24gb2YgWydmaXQnLCAnc2hyaW5rJywgJ2ZpeGVkJ10pIHtcblx0XHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKGBzaXppbmctJHtvcHRpb259YCwgdGFiU2l6aW5nID09PSBvcHRpb24pO1xuXHRcdH1cblxuXHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoYXMtaWNvbicsIG9wdGlvbnMuc2hvd0ljb25zICYmIG9wdGlvbnMuaGFzSWNvbnMpO1xuXG5cdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3N0aWNreScsIGlzVGFiU3RpY2t5KTtcblx0XHRmb3IgKGNvbnN0IG9wdGlvbiBvZiBbJ25vcm1hbCcsICdjb21wYWN0JywgJ3NocmluayddKSB7XG5cdFx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZShgc3RpY2t5LSR7b3B0aW9ufWAsIGlzVGFiU3RpY2t5ICYmIG9wdGlvbnMucGlubmVkVGFiU2l6aW5nID09PSBvcHRpb24pO1xuXHRcdH1cblxuXHRcdC8vIElmIG5vdCB3cmFwcGluZyB0YWJzLCBzdGlja3kgY29tcGFjdC9zaHJpbmsgdGFicyBuZWVkIGEgcG9zaXRpb24gdG8gcmVtYWluIGF0IHRoZWlyIGxvY2F0aW9uXG5cdFx0Ly8gd2hlbiBzY3JvbGxpbmcgdG8gc3RheSBpbiB2aWV3IChyZXF1aXJlbWVudCBmb3IgcG9zaXRpb246IHN0aWNreSlcblx0XHRpZiAoIW9wdGlvbnMud3JhcFRhYnMgJiYgaXNUYWJTdGlja3kgJiYgb3B0aW9ucy5waW5uZWRUYWJTaXppbmcgIT09ICdub3JtYWwnKSB7XG5cdFx0XHR0YWJDb250YWluZXIuc3R5bGUubGVmdCA9IGAke3RhYkluZGV4ICogdGhpcy5nZXRTdGlja3lUYWJXaWR0aChvcHRpb25zLnBpbm5lZFRhYlNpemluZyl9cHhgO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YWJDb250YWluZXIuc3R5bGUubGVmdCA9ICdhdXRvJztcblx0XHR9XG5cblx0XHQvLyBCb3JkZXJzIC8gb3V0bGluZVxuXHRcdHRoaXMucmVkcmF3VGFiQm9yZGVycyh0YWJJbmRleCwgdGFiQ29udGFpbmVyKTtcblxuXHRcdC8vIFNlbGVjdGlvbiAvIGFjdGl2ZSAvIGRpcnR5IHN0YXRlXG5cdFx0dGhpcy5yZWRyYXdUYWJTZWxlY3RlZEFjdGl2ZUFuZERpcnR5KHRoaXMuZ3JvdXBzVmlldy5hY3RpdmVHcm91cCA9PT0gdGhpcy5ncm91cFZpZXcsIGVkaXRvciwgdGFiQ29udGFpbmVyLCB0YWJBY3Rpb25CYXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWRyYXdUYWJMYWJlbChlZGl0b3I6IEVkaXRvcklucHV0LCB0YWJJbmRleDogbnVtYmVyLCB0YWJDb250YWluZXI6IEhUTUxFbGVtZW50LCB0YWJMYWJlbFdpZGdldDogSVJlc291cmNlTGFiZWwsIHRhYkxhYmVsOiBJRWRpdG9ySW5wdXRMYWJlbCk6IHZvaWQge1xuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnM7XG5cblx0XHQvLyBVbmxlc3MgdGFicyBhcmUgc3RpY2t5IGNvbXBhY3QsIHNob3cgdGhlIGZ1bGwgbGFiZWwgYW5kIGRlc2NyaXB0aW9uXG5cdFx0Ly8gU3RpY2t5IGNvbXBhY3QgdGFicyB3aWxsIG9ubHkgc2hvdyBhbiBpY29uIGlmIGljb25zIGFyZSBlbmFibGVkXG5cdFx0Ly8gb3IgdGhlaXIgZmlyc3QgY2hhcmFjdGVyIG9mIHRoZSBuYW1lIG90aGVyd2lzZVxuXHRcdGxldCBuYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG5hbWVQcmVmaXg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZm9yY2VMYWJlbCA9IGZhbHNlO1xuXHRcdGxldCBmaWxlRGVjb3JhdGlvbkJhZGdlcyA9IEJvb2xlYW4ob3B0aW9ucy5kZWNvcmF0aW9ucz8uYmFkZ2VzKTtcblx0XHRjb25zdCBmaWxlRGVjb3JhdGlvbkNvbG9ycyA9IEJvb2xlYW4ob3B0aW9ucy5kZWNvcmF0aW9ucz8uY29sb3JzKTtcblx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZztcblx0XHRpZiAob3B0aW9ucy5waW5uZWRUYWJTaXppbmcgPT09ICdjb21wYWN0JyAmJiB0aGlzLnRhYnNNb2RlbC5pc1N0aWNreSh0YWJJbmRleCkpIHtcblx0XHRcdGNvbnN0IGlzU2hvd2luZ0ljb25zID0gb3B0aW9ucy5zaG93SWNvbnMgJiYgb3B0aW9ucy5oYXNJY29ucztcblx0XHRcdG5hbWUgPSBpc1Nob3dpbmdJY29ucyA/ICcnIDogdGFiTGFiZWwubmFtZT8uY2hhckF0KDApLnRvVXBwZXJDYXNlKCk7XG5cdFx0XHRkZXNjcmlwdGlvbiA9ICcnO1xuXHRcdFx0Zm9yY2VMYWJlbCA9IHRydWU7XG5cdFx0XHRmaWxlRGVjb3JhdGlvbkJhZGdlcyA9IGZhbHNlOyAvLyBub3QgZW5vdWdoIHNwYWNlIHdoZW4gc3RpY2t5IHRhYnMgYXJlIGNvbXBhY3Rcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmFtZSA9IHRhYkxhYmVsLm5hbWU7XG5cdFx0XHRuYW1lUHJlZml4ID0gb3B0aW9ucy5zaG93VGFiSW5kZXggPyBgJHt0aGlzLnRvRWRpdG9ySW5kZXgodGFiSW5kZXgpICsgMX06IGAgOiB1bmRlZmluZWQ7XG5cdFx0XHRkZXNjcmlwdGlvbiA9IHRhYkxhYmVsLmRlc2NyaXB0aW9uIHx8ICcnO1xuXHRcdH1cblxuXHRcdGlmICh0YWJMYWJlbC5hcmlhTGFiZWwpIHtcblx0XHRcdHRhYkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0YWJMYWJlbC5hcmlhTGFiZWwpO1xuXHRcdFx0Ly8gU2V0IGFyaWEtZGVzY3JpcHRpb24gdG8gZW1wdHkgc3RyaW5nIHNvIHRoYXQgc2NyZWVuIHJlYWRlcnMgd291bGQgbm90IHJlYWQgdGhlIHRpdGxlIGFzIHdlbGxcblx0XHRcdC8vIE1vcmUgZGV0YWlscyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTUzNzhcblx0XHRcdHRhYkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZGVzY3JpcHRpb24nLCAnJyk7XG5cdFx0fVxuXG5cdFx0Ly8gTGFiZWxcblx0XHR0YWJMYWJlbFdpZGdldC5zZXRSZXNvdXJjZShcblx0XHRcdHsgbmFtZSwgZGVzY3JpcHRpb24sIHJlc291cmNlOiBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldE9yaWdpbmFsVXJpKGVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5CT1RIIH0pIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHRpdGxlOiB0aGlzLmdldEhvdmVyVGl0bGUoZWRpdG9yKSxcblx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBjb2FsZXNjZShbJ3RhYi1sYWJlbCcsIGZpbGVEZWNvcmF0aW9uQmFkZ2VzID8gJ3RhYi1sYWJlbC1oYXMtYmFkZ2UnIDogdW5kZWZpbmVkXS5jb25jYXQoZWRpdG9yLmdldExhYmVsRXh0cmFDbGFzc2VzKCkpKSxcblx0XHRcdFx0aXRhbGljOiAhdGhpcy50YWJzTW9kZWwuaXNQaW5uZWQoZWRpdG9yKSxcblx0XHRcdFx0Zm9yY2VMYWJlbCxcblx0XHRcdFx0ZmlsZURlY29yYXRpb25zOiB7XG5cdFx0XHRcdFx0Y29sb3JzOiBmaWxlRGVjb3JhdGlvbkNvbG9ycyxcblx0XHRcdFx0XHRiYWRnZXM6IGZpbGVEZWNvcmF0aW9uQmFkZ2VzXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGljb246IGVkaXRvci5nZXRJY29uKCksXG5cdFx0XHRcdGhpZGVJY29uOiBvcHRpb25zLnNob3dJY29ucyA9PT0gZmFsc2UsXG5cdFx0XHRcdG5hbWVQcmVmaXgsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIFRlc3RzIGhlbHBlclxuXHRcdGNvbnN0IHJlc291cmNlID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdHRhYkNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2RhdGEtcmVzb3VyY2UtbmFtZScsIGJhc2VuYW1lT3JBdXRob3JpdHkocmVzb3VyY2UpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGFiQ29udGFpbmVyLnJlbW92ZUF0dHJpYnV0ZSgnZGF0YS1yZXNvdXJjZS1uYW1lJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWRyYXdUYWJTZWxlY3RlZEFjdGl2ZUFuZERpcnR5KGlzR3JvdXBBY3RpdmU6IGJvb2xlYW4sIGVkaXRvcjogRWRpdG9ySW5wdXQsIHRhYkNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRhYkFjdGlvbkJhcjogQWN0aW9uQmFyKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNUYWJBY3RpdmUgPSB0aGlzLnRhYnNNb2RlbC5pc0FjdGl2ZShlZGl0b3IpO1xuXHRcdGNvbnN0IGhhc01vZGlmaWVkQm9yZGVyVG9wID0gdGhpcy5kb1JlZHJhd1RhYkRpcnR5KGlzR3JvdXBBY3RpdmUsIGlzVGFiQWN0aXZlLCBlZGl0b3IsIHRhYkNvbnRhaW5lcik7XG5cblx0XHR0aGlzLmRvUmVkcmF3VGFiQWN0aXZlKGlzR3JvdXBBY3RpdmUsICFoYXNNb2RpZmllZEJvcmRlclRvcCwgZWRpdG9yLCB0YWJDb250YWluZXIsIHRhYkFjdGlvbkJhcik7XG5cdH1cblxuXHRwcml2YXRlIGRvUmVkcmF3VGFiQWN0aXZlKGlzR3JvdXBBY3RpdmU6IGJvb2xlYW4sIGFsbG93Qm9yZGVyVG9wOiBib29sZWFuLCBlZGl0b3I6IEVkaXRvcklucHV0LCB0YWJDb250YWluZXI6IEhUTUxFbGVtZW50LCB0YWJBY3Rpb25CYXI6IEFjdGlvbkJhcik6IHZvaWQge1xuXHRcdGNvbnN0IGlzQWN0aXZlID0gdGhpcy50YWJzTW9kZWwuaXNBY3RpdmUoZWRpdG9yKTtcblx0XHRjb25zdCBpc1NlbGVjdGVkID0gdGhpcy50YWJzTW9kZWwuaXNTZWxlY3RlZChlZGl0b3IpO1xuXG5cdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzQWN0aXZlKTtcblx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBpc1NlbGVjdGVkKTtcblx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbXVsdGktc2VsZWN0ZWQnLCBpc1NlbGVjdGVkICYmIHRoaXMuZ3JvdXBWaWV3LnNlbGVjdGVkRWRpdG9ycy5sZW5ndGggPiAxKTtcblx0XHR0YWJDb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLXNlbGVjdGVkJywgaXNTZWxlY3RlZCA/ICd0cnVlJyA6ICdmYWxzZScpO1xuXHRcdHRhYkNvbnRhaW5lci50YWJJbmRleCA9IGlzQWN0aXZlID8gMCA6IC0xOyAvLyBPbmx5IGFjdGl2ZSB0YWIgY2FuIGJlIGZvY3VzZWQgaW50b1xuXHRcdHRhYkFjdGlvbkJhci5zZXRGb2N1c2FibGUoaXNBY3RpdmUpO1xuXG5cdFx0Ly8gU2V0IGJvcmRlciBCT1RUT00gaWYgdGhlbWUgZGVmaW5lZCBjb2xvclxuXHRcdGlmIChpc0FjdGl2ZSkge1xuXHRcdFx0Y29uc3QgYWN0aXZlVGFiQm9yZGVyQ29sb3JCb3R0b20gPSB0aGlzLmdldENvbG9yKGlzR3JvdXBBY3RpdmUgPyBUQUJfQUNUSVZFX0JPUkRFUiA6IFRBQl9VTkZPQ1VTRURfQUNUSVZFX0JPUkRFUik7XG5cdFx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndGFiLWJvcmRlci1ib3R0b20nLCAhIWFjdGl2ZVRhYkJvcmRlckNvbG9yQm90dG9tKTtcblx0XHRcdHRhYkNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS10YWItYm9yZGVyLWJvdHRvbS1jb2xvcicsIGFjdGl2ZVRhYkJvcmRlckNvbG9yQm90dG9tID8/ICcnKTtcblx0XHR9XG5cblx0XHQvLyBTZXQgYm9yZGVyIFRPUCBpZiB0aGVtZSBkZWZpbmVkIGNvbG9yXG5cdFx0bGV0IHRhYkJvcmRlckNvbG9yVG9wOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRpZiAoYWxsb3dCb3JkZXJUb3ApIHtcblx0XHRcdGlmIChpc0FjdGl2ZSkge1xuXHRcdFx0XHR0YWJCb3JkZXJDb2xvclRvcCA9IHRoaXMuZ2V0Q29sb3IoaXNHcm91cEFjdGl2ZSA/IFRBQl9BQ1RJVkVfQk9SREVSX1RPUCA6IFRBQl9VTkZPQ1VTRURfQUNUSVZFX0JPUkRFUl9UT1ApO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGFiQm9yZGVyQ29sb3JUb3AgPT09IG51bGwgJiYgaXNTZWxlY3RlZCkge1xuXHRcdFx0XHR0YWJCb3JkZXJDb2xvclRvcCA9IHRoaXMuZ2V0Q29sb3IoVEFCX1NFTEVDVEVEX0JPUkRFUl9UT1ApO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRhYkNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd0YWItYm9yZGVyLXRvcCcsICEhdGFiQm9yZGVyQ29sb3JUb3ApO1xuXHRcdHRhYkNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS10YWItYm9yZGVyLXRvcC1jb2xvcicsIHRhYkJvcmRlckNvbG9yVG9wID8/ICcnKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZWRyYXdUYWJEaXJ0eShpc0dyb3VwQWN0aXZlOiBib29sZWFuLCBpc1RhYkFjdGl2ZTogYm9vbGVhbiwgZWRpdG9yOiBFZGl0b3JJbnB1dCwgdGFiQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdGxldCBoYXNNb2RpZmllZEJvcmRlckNvbG9yID0gZmFsc2U7XG5cblx0XHQvLyBUYWI6IGRpcnR5ICh1bmxlc3Mgc2F2aW5nKVxuXHRcdGlmIChlZGl0b3IuaXNEaXJ0eSgpICYmICFlZGl0b3IuaXNTYXZpbmcoKSkge1xuXHRcdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2RpcnR5Jyk7XG5cblx0XHRcdC8vIEhpZ2hsaWdodCBtb2RpZmllZCB0YWJzIHdpdGggYSBib3JkZXIgaWYgY29uZmlndXJlZFxuXHRcdFx0aWYgKHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy5oaWdobGlnaHRNb2RpZmllZFRhYnMpIHtcblx0XHRcdFx0bGV0IG1vZGlmaWVkQm9yZGVyQ29sb3I6IHN0cmluZyB8IG51bGw7XG5cdFx0XHRcdGlmIChpc0dyb3VwQWN0aXZlICYmIGlzVGFiQWN0aXZlKSB7XG5cdFx0XHRcdFx0bW9kaWZpZWRCb3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoVEFCX0FDVElWRV9NT0RJRklFRF9CT1JERVIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzR3JvdXBBY3RpdmUgJiYgIWlzVGFiQWN0aXZlKSB7XG5cdFx0XHRcdFx0bW9kaWZpZWRCb3JkZXJDb2xvciA9IHRoaXMuZ2V0Q29sb3IoVEFCX0lOQUNUSVZFX01PRElGSUVEX0JPUkRFUik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWlzR3JvdXBBY3RpdmUgJiYgaXNUYWJBY3RpdmUpIHtcblx0XHRcdFx0XHRtb2RpZmllZEJvcmRlckNvbG9yID0gdGhpcy5nZXRDb2xvcihUQUJfVU5GT0NVU0VEX0FDVElWRV9NT0RJRklFRF9CT1JERVIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1vZGlmaWVkQm9yZGVyQ29sb3IgPSB0aGlzLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfSU5BQ1RJVkVfTU9ESUZJRURfQk9SREVSKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtb2RpZmllZEJvcmRlckNvbG9yKSB7XG5cdFx0XHRcdFx0aGFzTW9kaWZpZWRCb3JkZXJDb2xvciA9IHRydWU7XG5cblx0XHRcdFx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlydHktYm9yZGVyLXRvcCcpO1xuXHRcdFx0XHRcdHRhYkNvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS10YWItZGlydHktYm9yZGVyLXRvcC1jb2xvcicsIG1vZGlmaWVkQm9yZGVyQ29sb3IpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0YWJDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZGlydHktYm9yZGVyLXRvcCcpO1xuXHRcdFx0XHR0YWJDb250YWluZXIuc3R5bGUucmVtb3ZlUHJvcGVydHkoJy0tdGFiLWRpcnR5LWJvcmRlci10b3AtY29sb3InKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUYWI6IG5vdCBkaXJ0eVxuXHRcdGVsc2Uge1xuXHRcdFx0dGFiQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2RpcnR5JywgJ2RpcnR5LWJvcmRlci10b3AnKTtcblx0XHRcdHRhYkNvbnRhaW5lci5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS10YWItZGlydHktYm9yZGVyLXRvcC1jb2xvcicpO1xuXHRcdH1cblxuXHRcdHJldHVybiBoYXNNb2RpZmllZEJvcmRlckNvbG9yO1xuXHR9XG5cblx0cHJpdmF0ZSByZWRyYXdUYWJCb3JkZXJzKHRhYkluZGV4OiBudW1iZXIsIHRhYkNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBpc1RhYlN0aWNreSA9IHRoaXMudGFic01vZGVsLmlzU3RpY2t5KHRhYkluZGV4KTtcblx0XHRjb25zdCBpc1RhYkxhc3RTdGlja3kgPSBpc1RhYlN0aWNreSAmJiB0aGlzLnRhYnNNb2RlbC5zdGlja3lDb3VudCA9PT0gdGFiSW5kZXggKyAxO1xuXHRcdGNvbnN0IHNob3dMYXN0U3RpY2t5VGFiQm9yZGVyQ29sb3IgPSB0aGlzLnRhYnNNb2RlbC5zdGlja3lDb3VudCAhPT0gdGhpcy50YWJzTW9kZWwuY291bnQ7XG5cblx0XHQvLyBCb3JkZXJzIC8gT3V0bGluZVxuXHRcdGNvbnN0IGJvcmRlclJpZ2h0Q29sb3IgPSAoKGlzVGFiTGFzdFN0aWNreSAmJiBzaG93TGFzdFN0aWNreVRhYkJvcmRlckNvbG9yID8gdGhpcy5nZXRDb2xvcihUQUJfTEFTVF9QSU5ORURfQk9SREVSKSA6IHVuZGVmaW5lZCkgfHwgdGhpcy5nZXRDb2xvcihUQUJfQk9SREVSKSB8fCB0aGlzLmdldENvbG9yKGNvbnRyYXN0Qm9yZGVyKSk7XG5cdFx0dGFiQ29udGFpbmVyLnN0eWxlLmJvcmRlclJpZ2h0ID0gYm9yZGVyUmlnaHRDb2xvciA/IGAxcHggc29saWQgJHtib3JkZXJSaWdodENvbG9yfWAgOiAnJztcblx0XHR0YWJDb250YWluZXIuc3R5bGUub3V0bGluZUNvbG9yID0gdGhpcy5nZXRDb2xvcihhY3RpdmVDb250cmFzdEJvcmRlcikgfHwgJyc7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcHJlcGFyZUVkaXRvckFjdGlvbnMoZWRpdG9yQWN0aW9uczogSVRvb2xiYXJBY3Rpb25zKTogSVRvb2xiYXJBY3Rpb25zIHtcblx0XHRjb25zdCBpc0dyb3VwQWN0aXZlID0gdGhpcy5ncm91cHNWaWV3LmFjdGl2ZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldztcblxuXHRcdC8vIEFjdGl2ZTogYWxsb3cgYWxsIGFjdGlvbnNcblx0XHRpZiAoaXNHcm91cEFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIGVkaXRvckFjdGlvbnM7XG5cdFx0fVxuXG5cdFx0Ly8gSW5hY3RpdmU6IG9ubHkgc2hvdyBcIlVubG9ja1wiIGFuZCBzZWNvbmRhcnkgYWN0aW9uc1xuXHRcdGVsc2Uge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJpbWFyeTogdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLmFsd2F5c1Nob3dFZGl0b3JBY3Rpb25zID8gZWRpdG9yQWN0aW9ucy5wcmltYXJ5IDogZWRpdG9yQWN0aW9ucy5wcmltYXJ5LmZpbHRlcihhY3Rpb24gPT4gYWN0aW9uLmlkID09PSBVTkxPQ0tfR1JPVVBfQ09NTUFORF9JRCksXG5cdFx0XHRcdHNlY29uZGFyeTogZWRpdG9yQWN0aW9ucy5zZWNvbmRhcnlcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHByZXBhcmVFZGl0b3JMYXlvdXRBY3Rpb25zKGVkaXRvckFjdGlvbnM6IElUb29sYmFyQWN0aW9ucyk6IElUb29sYmFyQWN0aW9ucyB7XG5cdFx0cmV0dXJuIGVkaXRvckFjdGlvbnM7XG5cdH1cblxuXHRnZXRIZWlnaHQoKTogbnVtYmVyIHtcblxuXHRcdC8vIFJldHVybiBxdWlja2x5IGlmIG91ciB1c2VkIGRpbWVuc2lvbnMgYXJlIGtub3duXG5cdFx0aWYgKHRoaXMuZGltZW5zaW9ucy51c2VkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kaW1lbnNpb25zLnVzZWQuaGVpZ2h0O1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBjb21wdXRlIHZpYSBicm93c2VyIEFQSXNcblx0XHRlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmNvbXB1dGVIZWlnaHQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRsZXQgaGVpZ2h0OiBudW1iZXI7XG5cblx0XHRpZiAoIXRoaXMudmlzaWJsZSkge1xuXHRcdFx0aGVpZ2h0ID0gMDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuZ3JvdXBzVmlldy5wYXJ0T3B0aW9ucy53cmFwVGFicyAmJiB0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyPy5jbGFzc0xpc3QuY29udGFpbnMoJ3dyYXBwaW5nJykpIHtcblx0XHRcdC8vIFdyYXA6IHdlIG5lZWQgdG8gYXNrIGBvZmZzZXRIZWlnaHRgIHRvIGdldFxuXHRcdFx0Ly8gdGhlIHJlYWwgaGVpZ2h0IG9mIHRoZSB0aXRsZSBhcmVhIHdpdGggd3JhcHBpbmcuXG5cdFx0XHRoZWlnaHQgPSB0aGlzLnRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLm9mZnNldEhlaWdodDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aGVpZ2h0ID0gdGhpcy50YWJIZWlnaHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGhlaWdodDtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb25zOiBJRWRpdG9yVGl0bGVDb250cm9sRGltZW5zaW9ucywgb3B0aW9ucz86IElNdWx0aUVkaXRvclRhYnNDb250cm9sTGF5b3V0T3B0aW9ucyk6IERpbWVuc2lvbiB7XG5cblx0XHQvLyBSZW1lbWJlciBkaW1lbnNpb25zIHRoYXQgd2UgZ2V0XG5cdFx0T2JqZWN0LmFzc2lnbih0aGlzLmRpbWVuc2lvbnMsIGRpbWVuc2lvbnMpO1xuXG5cdFx0aWYgKHRoaXMudmlzaWJsZSkge1xuXHRcdFx0aWYgKCF0aGlzLmxheW91dFNjaGVkdWxlci52YWx1ZSkge1xuXG5cdFx0XHRcdC8vIFRoZSBsYXlvdXQgb2YgdGFicyBjYW4gYmUgYW4gZXhwZW5zaXZlIG9wZXJhdGlvbiBiZWNhdXNlIHdlIGFjY2VzcyBET00gcHJvcGVydGllc1xuXHRcdFx0XHQvLyB0aGF0IGNhbiByZXN1bHQgaW4gdGhlIGJyb3dzZXIgZG9pbmcgYSBmdWxsIHBhZ2UgbGF5b3V0IHRvIHZhbGlkYXRlIHRoZW0uIFRvIGJ1ZmZlclxuXHRcdFx0XHQvLyB0aGlzIGEgbGl0dGxlIGJpdCB3ZSB0cnkgYXQgbGVhc3QgdG8gc2NoZWR1bGUgdGhpcyB3b3JrIG9uIHRoZSBuZXh0IGFuaW1hdGlvbiBmcmFtZVxuXHRcdFx0XHQvLyB3aGVuIHdlIGhhdmUgcmVzdG9yZWQgb3Igd2hlbiBpZGxlIG90aGVyd2lzZS5cblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5wYXJlbnQpLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5kb0xheW91dCh0aGlzLmRpbWVuc2lvbnMsIHRoaXMubGF5b3V0U2NoZWR1bGVyLnZhbHVlPy5vcHRpb25zIC8qIGVuc3VyZSB0byBwaWNrIHVwIGxhdGVzdCBvcHRpb25zICovKTtcblxuXHRcdFx0XHRcdHRoaXMubGF5b3V0U2NoZWR1bGVyLmNsZWFyKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmxheW91dFNjaGVkdWxlci52YWx1ZSA9IHsgb3B0aW9ucywgZGlzcG9zZTogKCkgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRvIGtlZXAgb3B0aW9ucyB1cGRhdGVkXG5cdFx0XHRpZiAob3B0aW9ucz8uZm9yY2VSZXZlYWxBY3RpdmVUYWIpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTY2hlZHVsZXIudmFsdWUub3B0aW9ucyA9IHtcblx0XHRcdFx0XHQuLi50aGlzLmxheW91dFNjaGVkdWxlci52YWx1ZS5vcHRpb25zLFxuXHRcdFx0XHRcdGZvcmNlUmV2ZWFsQWN0aXZlVGFiOiB0cnVlXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRmlyc3QgdGltZSBsYXlvdXQ6IGNvbXB1dGUgdGhlIGRpbWVuc2lvbnMgYW5kIHN0b3JlIGl0XG5cdFx0aWYgKCF0aGlzLmRpbWVuc2lvbnMudXNlZCkge1xuXHRcdFx0dGhpcy5kaW1lbnNpb25zLnVzZWQgPSBuZXcgRGltZW5zaW9uKGRpbWVuc2lvbnMuY29udGFpbmVyLndpZHRoLCB0aGlzLmNvbXB1dGVIZWlnaHQoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZGltZW5zaW9ucy51c2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0xheW91dChkaW1lbnNpb25zOiBJRWRpdG9yVGl0bGVDb250cm9sRGltZW5zaW9ucywgb3B0aW9ucz86IElNdWx0aUVkaXRvclRhYnNDb250cm9sTGF5b3V0T3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gTGF5b3V0IHRhYnNcblx0XHRpZiAoZGltZW5zaW9ucy5jb250YWluZXIgIT09IERpbWVuc2lvbi5Ob25lICYmIGRpbWVuc2lvbnMuYXZhaWxhYmxlICE9PSBEaW1lbnNpb24uTm9uZSkge1xuXHRcdFx0dGhpcy5kb0xheW91dFRhYnMoZGltZW5zaW9ucywgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgdGhlIGRpbWVuc2lvbnMgdXNlZCBpbiB0aGUgY29udHJvbCBzbyB0aGF0IHdlIGNhblxuXHRcdC8vIHJldHVybiBpdCBmYXN0IGZyb20gdGhlIGBsYXlvdXRgIGNhbGwgd2l0aG91dCBoYXZpbmcgdG9cblx0XHQvLyBjb21wdXRlIGl0IG92ZXIgYW5kIG92ZXIgYWdhaW5cblx0XHRjb25zdCBvbGREaW1lbnNpb24gPSB0aGlzLmRpbWVuc2lvbnMudXNlZDtcblx0XHRjb25zdCBuZXdEaW1lbnNpb24gPSB0aGlzLmRpbWVuc2lvbnMudXNlZCA9IG5ldyBEaW1lbnNpb24oZGltZW5zaW9ucy5jb250YWluZXIud2lkdGgsIHRoaXMuY29tcHV0ZUhlaWdodCgpKTtcblxuXHRcdC8vIEluIGNhc2UgdGhlIGhlaWdodCBvZiB0aGUgdGl0bGUgY29udHJvbCBjaGFuZ2VkIGZyb20gYmVmb3JlXG5cdFx0Ly8gKGUuZy4gd2hlbiB3cmFwcGluZyB0b2dnbGVzIG9uL29mZiBvciB0aGUgdGFiIGhlaWdodCBzZXR0aW5nIGNoYW5nZXMpLFxuXHRcdC8vIHdlIG5lZWQgdG8gc2lnbmFsIHRoaXMgdG8gdGhlIG91dHNpZGUgdmlhIGEgYHJlbGF5b3V0YCBjYWxsIHNvIHRoYXRcblx0XHQvLyBlLmcuIHRoZSBlZGl0b3IgY29udHJvbCBjYW4gYmUgYWRqdXN0ZWQgYWNjb3JkaW5nbHkuXG5cdFx0aWYgKG9sZERpbWVuc2lvbiAmJiBvbGREaW1lbnNpb24uaGVpZ2h0ICE9PSBuZXdEaW1lbnNpb24uaGVpZ2h0KSB7XG5cdFx0XHR0aGlzLmdyb3VwVmlldy5yZWxheW91dCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9MYXlvdXRUYWJzKGRpbWVuc2lvbnM6IElFZGl0b3JUaXRsZUNvbnRyb2xEaW1lbnNpb25zLCBvcHRpb25zPzogSU11bHRpRWRpdG9yVGFic0NvbnRyb2xMYXlvdXRPcHRpb25zKTogdm9pZCB7XG5cblx0XHQvLyBBbHdheXMgZmlyc3QgbGF5b3V0IHRhYnMgd2l0aCB3cmFwcGluZyBzdXBwb3J0IGV2ZW4gaWYgd3JhcHBpbmdcblx0XHQvLyBpcyBkaXNhYmxlZC4gVGhlIHJlc3VsdCBpbmRpY2F0ZXMgaWYgdGFicyB3cmFwIGFuZCBpZiBub3QsIHdlXG5cdFx0Ly8gbmVlZCB0byBwcm9jZWVkIHdpdGggdGhlIGxheW91dCB3aXRob3V0IHdyYXBwaW5nIGJlY2F1c2UgZXZlblxuXHRcdC8vIGlmIHdyYXBwaW5nIGlzIGVuYWJsZWQgaW4gc2V0dGluZ3MsIHRoZXJlIGFyZSBjYXNlcyB3aGVyZVxuXHRcdC8vIHdyYXBwaW5nIGlzIGRpc2FibGVkIChlLmcuIGR1ZSB0byBzcGFjZSBjb25zdHJhaW50cylcblx0XHRjb25zdCB0YWJzV3JhcE11bHRpTGluZSA9IHRoaXMuZG9MYXlvdXRUYWJzV3JhcHBpbmcoZGltZW5zaW9ucyk7XG5cdFx0aWYgKCF0YWJzV3JhcE11bHRpTGluZSkge1xuXHRcdFx0dGhpcy5kb0xheW91dFRhYnNOb25XcmFwcGluZyhvcHRpb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5zdGlja3lUYWJzQmFja2dyb3VuZCkuc3R5bGUud2lkdGggPSAnMHB4Jztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRvTGF5b3V0VGFic1dyYXBwaW5nKGRpbWVuc2lvbnM6IElFZGl0b3JUaXRsZUNvbnRyb2xEaW1lbnNpb25zKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgW3RhYnNBbmRBY3Rpb25zQ29udGFpbmVyLCB0YWJzQ29udGFpbmVyLCBlZGl0b3JUb29sYmFyQ29udGFpbmVyLCB0YWJzU2Nyb2xsYmFyXSA9IGFzc2VydFJldHVybnNBbGxEZWZpbmVkKHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIsIHRoaXMudGFic0NvbnRhaW5lciwgdGhpcy5lZGl0b3JBY3Rpb25zVG9vbGJhckNvbnRhaW5lciwgdGhpcy50YWJzU2Nyb2xsYmFyKTtcblxuXHRcdGNvbnN0IGxheW91dEFjdGlvbnNDb250YWluZXIgPSB0aGlzLmVkaXRvckxheW91dEFjdGlvbnNUb29sYmFyQ29udGFpbmVyO1xuXHRcdGNvbnN0IGVkaXRvclRvb2xiYXJXaWR0aCA9ICgpID0+IGVkaXRvclRvb2xiYXJDb250YWluZXIub2Zmc2V0V2lkdGggKyAobGF5b3V0QWN0aW9uc0NvbnRhaW5lcj8ub2Zmc2V0V2lkdGggPz8gMCk7XG5cblx0XHQvLyBIYW5kbGUgd3JhcHBpbmcgdGFicyBhY2NvcmRpbmcgdG8gc2V0dGluZzpcblx0XHQvLyAtIGVuYWJsZWQ6IG9ubHkgYWRkIGNsYXNzIGlmIHRhYnMgd3JhcCBhbmQgZG9uJ3QgZXhjZWVkIGF2YWlsYWJsZSBkaW1lbnNpb25zXG5cdFx0Ly8gLSBkaXNhYmxlZDogcmVtb3ZlIGNsYXNzIGFuZCBtYXJnaW4tcmlnaHQgdmFyaWFibGVcblxuXHRcdGNvbnN0IGRpZFRhYnNXcmFwTXVsdGlMaW5lID0gdGFic0FuZEFjdGlvbnNDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKCd3cmFwcGluZycpO1xuXHRcdGxldCB0YWJzV3JhcE11bHRpTGluZSA9IGRpZFRhYnNXcmFwTXVsdGlMaW5lO1xuXG5cdFx0ZnVuY3Rpb24gdXBkYXRlVGFic1dyYXBwaW5nKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdHRhYnNXcmFwTXVsdGlMaW5lID0gZW5hYmxlZDtcblxuXHRcdFx0Ly8gVG9nZ2xlIHRoZSBgd3JhcHBlZGAgY2xhc3MgdG8gZW5hYmxlIHdyYXBwaW5nXG5cdFx0XHR0YWJzQW5kQWN0aW9uc0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd3cmFwcGluZycsIHRhYnNXcmFwTXVsdGlMaW5lKTtcblxuXHRcdFx0Ly8gVXBkYXRlIGBsYXN0LXRhYi1tYXJnaW4tcmlnaHRgIENTUyB2YXJpYWJsZSB0byBhY2NvdW50IGZvciB0aGUgYWJzb2x1dGVcblx0XHRcdC8vIHBvc2l0aW9uZWQgZWRpdG9yIGFjdGlvbnMgY29udGFpbmVyIHdoZW4gdGFicyB3cmFwLiBUaGUgbWFyZ2luIG5lZWRzIHRvXG5cdFx0XHQvLyBiZSB0aGUgd2lkdGggb2YgdGhlIGVkaXRvciBhY3Rpb25zIGNvbnRhaW5lciB0byBhdm9pZCBzY3JlZW4gY2hlZXNlLlxuXHRcdFx0dGFic0NvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1sYXN0LXRhYi1tYXJnaW4tcmlnaHQnLCB0YWJzV3JhcE11bHRpTGluZSA/IGAke2VkaXRvclRvb2xiYXJXaWR0aCgpfXB4YCA6ICcwJyk7XG5cdFx0XHR0YWJzQW5kQWN0aW9uc0NvbnRhaW5lci5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1sYXN0LXRhYi1sYXlvdXQtYWN0aW9ucy13aWR0aCcsIGAke2xheW91dEFjdGlvbnNDb250YWluZXI/Lm9mZnNldFdpZHRoID8/IDB9cHhgKTtcblxuXHRcdFx0Ly8gUmVtb3ZlIG9sZCBjc3MgY2xhc3NlcyB0aGF0IGFyZSBub3QgbmVlZGVkIGFueW1vcmVcblx0XHRcdGZvciAoY29uc3QgdGFiIG9mIHRhYnNDb250YWluZXIuY2hpbGRyZW4pIHtcblx0XHRcdFx0dGFiLmNsYXNzTGlzdC5yZW1vdmUoJ2xhc3QtaW4tcm93Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gU2V0dGluZyBlbmFibGVkOiBzZWxlY3RpdmVseSBlbmFibGUgd3JhcHBpbmcgaWYgcG9zc2libGVcblx0XHRpZiAodGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLndyYXBUYWJzKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlVGFic1dpZHRoID0gdGFic0NvbnRhaW5lci5vZmZzZXRXaWR0aDtcblx0XHRcdGNvbnN0IGFsbFRhYnNXaWR0aCA9IHRhYnNDb250YWluZXIuc2Nyb2xsV2lkdGg7XG5cdFx0XHRjb25zdCBsYXN0VGFiRml0c1dyYXBwZWQgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxhc3RUYWIgPSB0aGlzLmdldExhc3RUYWIoKTtcblx0XHRcdFx0aWYgKCFsYXN0VGFiKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIG5vIHRhYiBhbHdheXMgZml0c1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbGFzdFRhYk92ZXJsYXBXaXRoVG9vbGJhcldpZHRoID0gbGFzdFRhYi5vZmZzZXRXaWR0aCArIGVkaXRvclRvb2xiYXJXaWR0aCgpIC0gZGltZW5zaW9ucy5hdmFpbGFibGUud2lkdGg7XG5cdFx0XHRcdGlmIChsYXN0VGFiT3ZlcmxhcFdpdGhUb29sYmFyV2lkdGggPiAxKSB7XG5cdFx0XHRcdFx0Ly8gQWxsb3cgZm9yIHNsaWdodCByb3VuZGluZyBlcnJvcnMgcmVsYXRlZCB0byB6b29taW5nIGhlcmVcblx0XHRcdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTE2Mzg1XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBJZiB0YWJzIHdyYXAgb3Igc2hvdWxkIHN0YXJ0IHRvIHdyYXAgKHdoZW4gd2lkdGggZXhjZWVkcyB2aXNpYmxlIHdpZHRoKVxuXHRcdFx0Ly8gd2UgbXVzdCB0cmlnZ2VyIGB1cGRhdGVXcmFwcGluZ2AgdG8gc2V0IHRoZSBgbGFzdC10YWItbWFyZ2luLXJpZ2h0YFxuXHRcdFx0Ly8gYWNjb3JkaW5nbHkgYmFzZWQgb24gdGhlIG51bWJlciBvZiBhY3Rpb25zLiBUaGUgbWFyZ2luIGlzIGltcG9ydGFudCB0b1xuXHRcdFx0Ly8gcHJvcGVybHkgcG9zaXRpb24gdGhlIGxhc3QgdGFiIGFwYXJ0IGZyb20gdGhlIGFjdGlvbnNcblx0XHRcdC8vXG5cdFx0XHQvLyBXZSBhbHJlYWR5IGNoZWNrIGhlcmUgaWYgdGhlIGxhc3QgdGFiIHdvdWxkIGZpdCB3aGVuIHdyYXBwZWQgZ2l2ZW4gdGhlXG5cdFx0XHQvLyBlZGl0b3IgdG9vbGJhciB3aWxsIGFsc28gc2hvdyByaWdodCBuZXh0IHRvIGl0LiBUaGlzIGVuc3VyZXMgd2UgYXJlIG5vdFxuXHRcdFx0Ly8gZW5hYmxpbmcgd3JhcHBpbmcgb25seSB0byBkaXNhYmxlIGl0IGFnYWluIGluIHRoZSBjb2RlIGJlbG93ICh0aGlzIGZpeGVzXG5cdFx0XHQvLyBmbGlja2VyaW5nIGlzc3VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTUwNTApXG5cdFx0XHRpZiAodGFic1dyYXBNdWx0aUxpbmUgfHwgKGFsbFRhYnNXaWR0aCA+IHZpc2libGVUYWJzV2lkdGggJiYgbGFzdFRhYkZpdHNXcmFwcGVkKCkpKSB7XG5cdFx0XHRcdHVwZGF0ZVRhYnNXcmFwcGluZyh0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGFicyB3cmFwIG11bHRpbGluZTogcmVtb3ZlIHdyYXBwaW5nIHVuZGVyIGNlcnRhaW4gc2l6ZSBjb25zdHJhaW50IGNvbmRpdGlvbnNcblx0XHRcdGlmICh0YWJzV3JhcE11bHRpTGluZSkge1xuXHRcdFx0XHRpZiAoXG5cdFx0XHRcdFx0KHRhYnNDb250YWluZXIub2Zmc2V0SGVpZ2h0ID4gZGltZW5zaW9ucy5hdmFpbGFibGUuaGVpZ2h0KSB8fFx0XHRcdFx0XHRcdFx0Ly8gaWYgaGVpZ2h0IGV4Y2VlZHMgYXZhaWxhYmxlIGhlaWdodFxuXHRcdFx0XHRcdChhbGxUYWJzV2lkdGggPT09IHZpc2libGVUYWJzV2lkdGggJiYgdGFic0NvbnRhaW5lci5vZmZzZXRIZWlnaHQgPT09IHRoaXMudGFiSGVpZ2h0KSB8fFx0Ly8gaWYgd3JhcHBpbmcgaXMgbm90IG5lZWRlZCBhbnltb3JlXG5cdFx0XHRcdFx0KCFsYXN0VGFiRml0c1dyYXBwZWQoKSlcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0Ly8gaWYgbGFzdCB0YWIgZG9lcyBub3QgZml0IGFueW1vcmVcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0dXBkYXRlVGFic1dyYXBwaW5nKGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNldHRpbmcgZGlzYWJsZWQ6IHJlbW92ZSBDU1MgdHJhY2VzIG9ubHkgaWYgdGFicyBkaWQgd3JhcFxuXHRcdGVsc2UgaWYgKGRpZFRhYnNXcmFwTXVsdGlMaW5lKSB7XG5cdFx0XHR1cGRhdGVUYWJzV3JhcHBpbmcoZmFsc2UpO1xuXHRcdH1cblxuXHRcdC8vIElmIHdlIHRyYW5zaXRpb25lZCBmcm9tIG5vbi13cmFwcGluZyB0byB3cmFwcGluZywgd2UgbmVlZFxuXHRcdC8vIHRvIHVwZGF0ZSB0aGUgc2Nyb2xsYmFyIHRvIGhhdmUgYW4gZXF1YWwgYHdpZHRoYCBhbmRcblx0XHQvLyBgc2Nyb2xsV2lkdGhgLiBPdGhlcndpc2UgYSBzY3JvbGxiYXIgd291bGQgYXBwZWFyIHdoaWNoIGlzXG5cdFx0Ly8gbmV2ZXIgZGVzaXJlZCB3aGVuIHdyYXBwaW5nLlxuXHRcdGlmICh0YWJzV3JhcE11bHRpTGluZSAmJiAhZGlkVGFic1dyYXBNdWx0aUxpbmUpIHtcblx0XHRcdGNvbnN0IHZpc2libGVUYWJzV2lkdGggPSB0YWJzQ29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdFx0dGFic1Njcm9sbGJhci5zZXRTY3JvbGxEaW1lbnNpb25zKHtcblx0XHRcdFx0d2lkdGg6IHZpc2libGVUYWJzV2lkdGgsXG5cdFx0XHRcdHNjcm9sbFdpZHRoOiB2aXNpYmxlVGFic1dpZHRoXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdGhlIGBsYXN0LWluLXJvd2AgY2xhc3Mgb24gdGFicyB3aGVuIHdyYXBwaW5nXG5cdFx0Ly8gaXMgZW5hYmxlZCAoaXQgZG9lc24ndCBkbyBhbnkgaGFybSBvdGhlcndpc2UpLiBUaGlzXG5cdFx0Ly8gY2xhc3MgY29udHJvbHMgYWRkaXRpb25hbCBwcm9wZXJ0aWVzIG9mIHRhYiB3aGVuIGl0IGlzXG5cdFx0Ly8gdGhlIGxhc3QgdGFiIGluIGEgcm93XG5cdFx0aWYgKHRhYnNXcmFwTXVsdGlMaW5lKSB7XG5cblx0XHRcdC8vIFVzaW5nIGEgbWFwIGhlcmUgdG8gY2hhbmdlIGNsYXNzZXMgYWZ0ZXIgdGhlIGZvciBsb29wIGlzXG5cdFx0XHQvLyBjcnVjaWFsIGZvciBwZXJmb3JtYW5jZSBiZWNhdXNlIGNoYW5naW5nIHRoZSBjbGFzcyBvbiBhXG5cdFx0XHQvLyB0YWIgY2FuIHJlc3VsdCBpbiBsYXlvdXRzIG9mIHRoZSByZW5kZXJpbmcgZW5naW5lLlxuXHRcdFx0Y29uc3QgdGFicyA9IG5ldyBNYXA8SFRNTEVsZW1lbnQsIGJvb2xlYW4gLyogbGFzdCBpbiByb3cgKi8+KCk7XG5cblx0XHRcdGxldCBjdXJyZW50VGFic1Bvc1k6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGxldCBsYXN0VGFiOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgdGFic0NvbnRhaW5lci5jaGlsZHJlbikge1xuXHRcdFx0XHRpZiAoY2hpbGQgPT09IHRoaXMuYWRkVGFiQ29udGFpbmVyKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdGFiID0gY2hpbGQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0XHRcdGNvbnN0IHRhYlBvc1kgPSB0YWIub2Zmc2V0VG9wO1xuXG5cdFx0XHRcdC8vIE1hcmtzIGEgbmV3IG9yIHRoZSBmaXJzdCByb3cgb2YgdGFic1xuXHRcdFx0XHRpZiAodGFiUG9zWSAhPT0gY3VycmVudFRhYnNQb3NZKSB7XG5cdFx0XHRcdFx0Y3VycmVudFRhYnNQb3NZID0gdGFiUG9zWTtcblx0XHRcdFx0XHRpZiAobGFzdFRhYikge1xuXHRcdFx0XHRcdFx0dGFicy5zZXQobGFzdFRhYiwgdHJ1ZSk7IC8vIHByZXZpb3VzIHRhYiBtdXN0IGJlIGxhc3QgaW4gcm93IHRoZW5cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBBbHdheXMgcmVtZW1iZXIgbGFzdCB0YWIgYW5kIGVuc3VyZSB0aGVcblx0XHRcdFx0Ly8gbGFzdC1pbi1yb3cgY2xhc3MgaXMgbm90IHByZXNlbnQgdW50aWxcblx0XHRcdFx0Ly8gd2Uga25vdyB0aGUgdGFiIGlzIGxhc3Rcblx0XHRcdFx0bGFzdFRhYiA9IHRhYjtcblx0XHRcdFx0dGFicy5zZXQodGFiLCBmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIExhc3QgdGFiIG92ZXJhbGx5IGlzIGFsd2F5cyBsYXN0LWluLXJvd1xuXHRcdFx0aWYgKGxhc3RUYWIpIHtcblx0XHRcdFx0dGFicy5zZXQobGFzdFRhYiwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgW3RhYiwgbGFzdEluUm93XSBvZiB0YWJzKSB7XG5cdFx0XHRcdHRhYi5jbGFzc0xpc3QudG9nZ2xlKCdsYXN0LWluLXJvdycsIGxhc3RJblJvdyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRhYnNXcmFwTXVsdGlMaW5lO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0xheW91dFRhYnNOb25XcmFwcGluZyhvcHRpb25zPzogSU11bHRpRWRpdG9yVGFic0NvbnRyb2xMYXlvdXRPcHRpb25zKTogdm9pZCB7XG5cdFx0Y29uc3QgW3RhYnNDb250YWluZXIsIHRhYnNTY3JvbGxiYXJdID0gYXNzZXJ0UmV0dXJuc0FsbERlZmluZWQodGhpcy50YWJzQ29udGFpbmVyLCB0aGlzLnRhYnNTY3JvbGxiYXIpO1xuXG5cdFx0Ly9cblx0XHQvLyBTeW5vcHNpc1xuXHRcdC8vIC0gYWxsVGFic1dpZHRoOiAgIFx0XHRcdHN1bSBvZiBhbGwgdGFiIHdpZHRoc1xuXHRcdC8vIC0gc3RpY2t5VGFic1dpZHRoOlx0XHRcdHN1bSBvZiBhbGwgc3RpY2t5IHRhYiBzbG90IHdpZHRocyAodW5sZXNzIGBwaW5uZWRUYWJTaXppbmc6IG5vcm1hbGApXG5cdFx0Ly8gLSB2aXNpYmxlQ29udGFpbmVyV2lkdGg6IFx0c2l6ZSBvZiB0YWIgY29udGFpbmVyXG5cdFx0Ly8gLSBhdmFpbGFibGVDb250YWluZXJXaWR0aDogXHRzaXplIG9mIHRhYiBjb250YWluZXIgbWludXMgc2l6ZSBvZiBzdGlja3kgdGFic1xuXHRcdC8vXG5cdFx0Ly8gWy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBBbGwgdGFicyB3aWR0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1dXG5cdFx0Ly8gWy0tLS0tLS0tLS0tLS0tLS0tLS0gVmlzaWJsZSBjb250YWluZXIgd2lkdGggLS0tLS0tLS0tLS0tLS0tLS0tLV1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICBbLS0tLS0tIEF2YWlsYWJsZSBjb250YWluZXIgd2lkdGggLS0tLS0tXVxuXHRcdC8vIFsgU3RpY2t5IEEgXVsgU3RpY2t5IEIgXVsgVGFiIEMgXVsgVGFiIEQgXVsgVGFiIEUgXVsgVGFiIEYgXVsgVGFiIEcgXVsgVGFiIEggXVsgVGFiIEkgXVxuXHRcdC8vICAgICAgICAgICAgICAgICBBY3RpdmUgVGFiIFdpZHRoIFstLS0tLS0tXVxuXHRcdC8vIFstLS0tLS0tIEFjdGl2ZSBUYWIgUG9zIFggLS0tLS0tLV1cblx0XHQvLyBbLS0gU3RpY2t5IFRhYnMgV2lkdGggLS1dXG5cdFx0Ly9cblxuXHRcdGNvbnN0IHZpc2libGVUYWJzV2lkdGggPSB0YWJzQ29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdGNvbnN0IGFsbFRhYnNXaWR0aCA9IHRhYnNDb250YWluZXIuc2Nyb2xsV2lkdGg7XG5cblx0XHQvLyBDb21wdXRlIHNsb3Qgd2lkdGggb2Ygc3RpY2t5IHRhYnMgZGVwZW5kaW5nIG9uIHBpbm5lZCB0YWIgc2l6aW5nXG5cdFx0Ly8gLSBjb21wYWN0OiBzdGlja3ktdGFicyAqIGNvbXBhY3Qgc2xvdCB3aWR0aFxuXHRcdC8vIC0gIHNocmluazogc3RpY2t5LXRhYnMgKiBzaHJpbmsgc2xvdCB3aWR0aFxuXHRcdC8vIC0gIG5vcm1hbDogMCAoc3RpY2t5IHRhYnMgaW5oZXJpdCBsb29rIGFuZCBmZWVsIGZyb20gbm9uLXN0aWNreSB0YWJzKVxuXHRcdGxldCBzdGlja3lUYWJzV2lkdGggPSAwO1xuXHRcdGlmICh0aGlzLnRhYnNNb2RlbC5zdGlja3lDb3VudCA+IDApIHtcblx0XHRcdGNvbnN0IHN0aWNreVRhYldpZHRoID0gdGhpcy5nZXRTdGlja3lUYWJXaWR0aCh0aGlzLmdyb3Vwc1ZpZXcucGFydE9wdGlvbnMucGlubmVkVGFiU2l6aW5nKTtcblx0XHRcdHN0aWNreVRhYnNXaWR0aCA9IHRoaXMudGFic01vZGVsLnN0aWNreUNvdW50ICogc3RpY2t5VGFiV2lkdGg7XG5cblx0XHRcdGZvciAobGV0IHRhYkluZGV4ID0gMDsgdGFiSW5kZXggPCB0aGlzLnRhYnNNb2RlbC5zdGlja3lDb3VudDsgdGFiSW5kZXgrKykge1xuXHRcdFx0XHRjb25zdCB0YWIgPSB0aGlzLmdldFRhYkF0SW5kZXgodGFiSW5kZXgpO1xuXHRcdFx0XHRpZiAodGFiKSB7XG5cdFx0XHRcdFx0dGFiLnN0eWxlLmxlZnQgPSBgJHt0YWJJbmRleCAqIHN0aWNreVRhYldpZHRofXB4YDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZVRhYkFuZEluZGV4ID0gdGhpcy50YWJzTW9kZWwuYWN0aXZlRWRpdG9yID8gdGhpcy5nZXRUYWJBbmRJbmRleCh0aGlzLnRhYnNNb2RlbC5hY3RpdmVFZGl0b3IpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IFthY3RpdmVUYWIsIGFjdGl2ZVRhYkluZGV4XSA9IGFjdGl2ZVRhYkFuZEluZGV4ID8/IFt1bmRlZmluZWQsIHVuZGVmaW5lZF07XG5cblx0XHQvLyBGaWd1cmUgb3V0IGlmIGFjdGl2ZSB0YWIgaXMgcG9zaXRpb25lZCBzdGF0aWMgd2hpY2ggaGFzIGFuXG5cdFx0Ly8gaW1wYWN0IG9uIHdoZXRoZXIgdG8gcmV2ZWFsIHRoZSB0YWIgb3Igbm90IGxhdGVyXG5cdFx0bGV0IGFjdGl2ZVRhYlBvc2l0aW9uU3RhdGljID0gdGhpcy5ncm91cHNWaWV3LnBhcnRPcHRpb25zLnBpbm5lZFRhYlNpemluZyAhPT0gJ25vcm1hbCcgJiYgdHlwZW9mIGFjdGl2ZVRhYkluZGV4ID09PSAnbnVtYmVyJyAmJiB0aGlzLnRhYnNNb2RlbC5pc1N0aWNreShhY3RpdmVUYWJJbmRleCk7XG5cblx0XHQvLyBTcGVjaWFsIGNhc2U6IHdlIGhhdmUgc3RpY2t5IHRhYnMgYnV0IHRoZSBhdmFpbGFibGUgc3BhY2UgZm9yIHNob3dpbmcgdGFic1xuXHRcdC8vIGlzIGxpdHRsZSBlbm91Z2ggdGhhdCB3ZSBuZWVkIHRvIGRpc2FibGUgc3RpY2t5IHRhYnMgc3RpY2t5IHBvc2l0aW9uaW5nXG5cdFx0Ly8gc28gdGhhdCB0YWJzIGNhbiBiZSBzY3JvbGxlZCBhdCBuYXR1cmFsbHkuXG5cdFx0bGV0IGF2YWlsYWJsZVRhYnNDb250YWluZXJXaWR0aCA9IHZpc2libGVUYWJzV2lkdGggLSBzdGlja3lUYWJzV2lkdGg7XG5cdFx0aWYgKHRoaXMudGFic01vZGVsLnN0aWNreUNvdW50ID4gMCAmJiBhdmFpbGFibGVUYWJzQ29udGFpbmVyV2lkdGggPCBNdWx0aUVkaXRvclRhYnNDb250cm9sLlRBQl9XSURUSC5maXQpIHtcblx0XHRcdHRhYnNDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnZGlzYWJsZS1zdGlja3ktdGFicycpO1xuXG5cdFx0XHRhdmFpbGFibGVUYWJzQ29udGFpbmVyV2lkdGggPSB2aXNpYmxlVGFic1dpZHRoO1xuXHRcdFx0c3RpY2t5VGFic1dpZHRoID0gMDtcblx0XHRcdGFjdGl2ZVRhYlBvc2l0aW9uU3RhdGljID0gZmFsc2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhYnNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnZGlzYWJsZS1zdGlja3ktdGFicycpO1xuXHRcdH1cblx0XHRhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnN0aWNreVRhYnNCYWNrZ3JvdW5kKS5zdHlsZS53aWR0aCA9IGAke3N0aWNreVRhYnNXaWR0aH1weGA7XG5cblx0XHRsZXQgYWN0aXZlVGFiUG9zWDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhY3RpdmVUYWJXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCF0aGlzLmJsb2NrUmV2ZWFsQWN0aXZlVGFiICYmIGFjdGl2ZVRhYikge1xuXHRcdFx0YWN0aXZlVGFiUG9zWCA9IGFjdGl2ZVRhYi5vZmZzZXRMZWZ0O1xuXHRcdFx0YWN0aXZlVGFiV2lkdGggPSBhY3RpdmVUYWIub2Zmc2V0V2lkdGg7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHNjcm9sbGJhclxuXHRcdGNvbnN0IHsgd2lkdGg6IG9sZFZpc2libGVUYWJzV2lkdGgsIHNjcm9sbFdpZHRoOiBvbGRBbGxUYWJzV2lkdGggfSA9IHRhYnNTY3JvbGxiYXIuZ2V0U2Nyb2xsRGltZW5zaW9ucygpO1xuXHRcdHRhYnNTY3JvbGxiYXIuc2V0U2Nyb2xsRGltZW5zaW9ucyh7XG5cdFx0XHR3aWR0aDogdmlzaWJsZVRhYnNXaWR0aCxcblx0XHRcdHNjcm9sbFdpZHRoOiBhbGxUYWJzV2lkdGhcblx0XHR9KTtcblx0XHRjb25zdCBkaW1lbnNpb25zQ2hhbmdlZCA9IG9sZFZpc2libGVUYWJzV2lkdGggIT09IHZpc2libGVUYWJzV2lkdGggfHwgb2xkQWxsVGFic1dpZHRoICE9PSBhbGxUYWJzV2lkdGg7XG5cblx0XHQvLyBSZXZlYWxpbmcgdGhlIGFjdGl2ZSB0YWIgaXMgc2tpcHBlZCB1bmRlciBzb21lIGNvbmRpdGlvbnM6XG5cdFx0aWYgKFxuXHRcdFx0dGhpcy5ibG9ja1JldmVhbEFjdGl2ZVRhYiB8fFx0XHRcdFx0XHRcdFx0Ly8gZXhwbGljaXRseSBkaXNhYmxlZFxuXHRcdFx0dHlwZW9mIGFjdGl2ZVRhYlBvc1ggIT09ICdudW1iZXInIHx8XHRcdFx0XHRcdC8vIGludmFsaWQgZGltZW5zaW9uXG5cdFx0XHR0eXBlb2YgYWN0aXZlVGFiV2lkdGggIT09ICdudW1iZXInIHx8XHRcdFx0XHRcdC8vIGludmFsaWQgZGltZW5zaW9uXG5cdFx0XHRhY3RpdmVUYWJQb3NpdGlvblN0YXRpYyB8fFx0XHRcdFx0XHRcdFx0XHQvLyBzdGF0aWMgdGFiIChzdGlja3kpXG5cdFx0XHQoIWRpbWVuc2lvbnNDaGFuZ2VkICYmICFvcHRpb25zPy5mb3JjZVJldmVhbEFjdGl2ZVRhYikgXHQvLyBkaW1lbnNpb25zIGRpZCBub3QgY2hhbmdlIGFuZCB3ZSBoYXZlIGxvdyBsYXlvdXQgcHJpb3JpdHkgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMzM2MzEpXG5cdFx0KSB7XG5cdFx0XHR0aGlzLmJsb2NrUmV2ZWFsQWN0aXZlVGFiID0gZmFsc2U7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmV2ZWFsIHRoZSBhY3RpdmUgb25lXG5cdFx0Y29uc3QgdGFic0NvbnRhaW5lclNjcm9sbFBvc1ggPSB0YWJzU2Nyb2xsYmFyLmdldFNjcm9sbFBvc2l0aW9uKCkuc2Nyb2xsTGVmdDtcblx0XHRjb25zdCBhY3RpdmVUYWJGaXRzID0gYWN0aXZlVGFiV2lkdGggPD0gYXZhaWxhYmxlVGFic0NvbnRhaW5lcldpZHRoO1xuXHRcdGNvbnN0IGFkanVzdGVkQWN0aXZlVGFiUG9zWCA9IGFjdGl2ZVRhYlBvc1ggLSBzdGlja3lUYWJzV2lkdGg7XG5cblx0XHQvL1xuXHRcdC8vIFN5bm9wc2lzXG5cdFx0Ly8gLSBhZGp1c3RlZEFjdGl2ZVRhYlBvc1g6IHRoZSBhZGp1c3RlZCB0YWJQb3NYIHRha2VzIHRoZSB3aWR0aCBvZiBzdGlja3kgdGFicyBpbnRvIGFjY291bnRcblx0XHQvLyAgIGNvbmNlcHR1YWxseSB0aGUgc2Nyb2xsaW5nIG9ubHkgYmVnaW5zIGFmdGVyIHN0aWNreSB0YWJzIHNvIGluIG9yZGVyIHRvIHJldmVhbCBhIHRhYiBmdWxseVxuXHRcdC8vICAgdGhlIGFjdHVhbCBwb3NpdGlvbiBuZWVkcyB0byBiZSBhZGp1c3RlZCBmb3Igc3RpY2t5IHRhYnMuXG5cdFx0Ly9cblx0XHQvLyBUYWIgaXMgb3ZlcmZsb3dpbmcgdG8gdGhlIHJpZ2h0OiBTY3JvbGwgbWluaW1hbGx5IHVudGlsIHRoZSBlbGVtZW50IGlzIGZ1bGx5IHZpc2libGUgdG8gdGhlIHJpZ2h0XG5cdFx0Ly8gTm90ZTogb25seSB0cnkgdG8gZG8gdGhpcyBpZiB3ZSBhY3R1YWxseSBoYXZlIGVub3VnaCB3aWR0aCB0byBnaXZlIHRvIHNob3cgdGhlIHRhYiBmdWxseSFcblx0XHQvL1xuXHRcdC8vIEV4YW1wbGU6IFRhYiBHIHNob3VsZCBiZSBtYWRlIGFjdGl2ZSBhbmQgbmVlZHMgdG8gYmUgZnVsbHkgcmV2ZWFsZWQgYXMgc3VjaC5cblx0XHQvL1xuXHRcdC8vIFstLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBBbGwgdGFicyB3aWR0aCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLV1cblx0XHQvLyBbLS0tLS0tLS0tLS0tLS0tLS0tLS0gVmlzaWJsZSBjb250YWluZXIgd2lkdGggLS0tLS0tLS0tLS0tLS0tLS0tLS1dXG5cdFx0Ly8gICAgICAgICAgICAgICAgICAgICAgICAgICBbLS0tLS0gQXZhaWxhYmxlIGNvbnRhaW5lciB3aWR0aCAtLS0tLS0tXVxuXHRcdC8vICAgICBbIFN0aWNreSBBIF1bIFN0aWNreSBCIF1bIFRhYiBDIF1bIFRhYiBEIF1bIFRhYiBFIF1bIFRhYiBGIF1bIFRhYiBHIF1bIFRhYiBIIF1bIFRhYiBJIF1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgIEFjdGl2ZSBUYWIgV2lkdGggWy0tLS0tLS1dXG5cdFx0Ly8gICAgIFstLS0tLS0tIEFjdGl2ZSBUYWIgUG9zIFggLS0tLS0tLV1cblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgWy0tLS0tLS0tIEFkanVzdGVkIFRhYiBQb3MgWCAtLS0tLS0tXVxuXHRcdC8vICAgICBbLS0gU3RpY2t5IFRhYnMgV2lkdGggLS1dXG5cdFx0Ly9cblx0XHQvL1xuXHRcdGlmIChhY3RpdmVUYWJGaXRzICYmIHRhYnNDb250YWluZXJTY3JvbGxQb3NYICsgYXZhaWxhYmxlVGFic0NvbnRhaW5lcldpZHRoIDwgYWRqdXN0ZWRBY3RpdmVUYWJQb3NYICsgYWN0aXZlVGFiV2lkdGgpIHtcblx0XHRcdHRhYnNTY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0XHRzY3JvbGxMZWZ0OiB0YWJzQ29udGFpbmVyU2Nyb2xsUG9zWCArICgoYWRqdXN0ZWRBY3RpdmVUYWJQb3NYICsgYWN0aXZlVGFiV2lkdGgpIC8qIHJpZ2h0IGNvcm5lciBvZiB0YWIgKi8gLSAodGFic0NvbnRhaW5lclNjcm9sbFBvc1ggKyBhdmFpbGFibGVUYWJzQ29udGFpbmVyV2lkdGgpIC8qIHJpZ2h0IGNvcm5lciBvZiB2aWV3IHBvcnQgKi8pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvL1xuXHRcdC8vIFRhYiBpcyBvdmVybGZsb3dpbmcgdG8gdGhlIGxlZnQgb3IgZG9lcyBub3QgZml0OiBTY3JvbGwgaXQgaW50byB2aWV3IHRvIHRoZSBsZWZ0XG5cdFx0Ly9cblx0XHQvLyBFeGFtcGxlOiBUYWIgQyBzaG91bGQgYmUgbWFkZSBhY3RpdmUgYW5kIG5lZWRzIHRvIGJlIGZ1bGx5IHJldmVhbGVkIGFzIHN1Y2guXG5cdFx0Ly9cblx0XHQvLyBbLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gQWxsIHRhYnMgd2lkdGggLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLV1cblx0XHQvLyAgICAgWy0tLS0tLS0tLS0tLS0tLS0tLSBWaXNpYmxlIGNvbnRhaW5lciB3aWR0aCAtLS0tLS0tLS0tLS0tLS0tLS1dXG5cdFx0Ly8gICAgICAgICAgICAgICAgICAgICAgICAgICBbLS0tLS0gQXZhaWxhYmxlIGNvbnRhaW5lciB3aWR0aCAtLS0tLS0tXVxuXHRcdC8vIFsgU3RpY2t5IEEgXVsgU3RpY2t5IEIgXVsgVGFiIEMgXVsgVGFiIEQgXVsgVGFiIEUgXVsgVGFiIEYgXVsgVGFiIEcgXVsgVGFiIEggXVsgVGFiIEkgXVxuXHRcdC8vICAgICAgICAgICAgICAgICBBY3RpdmUgVGFiIFdpZHRoIFstLS0tLS0tXVxuXHRcdC8vIFstLS0tLS0tIEFjdGl2ZSBUYWIgUG9zIFggLS0tLS0tLV1cblx0XHQvLyAgICAgIEFkanVzdGVkIFRhYiBQb3MgWCBbXVxuXHRcdC8vIFstLSBTdGlja3kgVGFicyBXaWR0aCAtLV1cblx0XHQvL1xuXHRcdC8vXG5cdFx0ZWxzZSBpZiAodGFic0NvbnRhaW5lclNjcm9sbFBvc1ggPiBhZGp1c3RlZEFjdGl2ZVRhYlBvc1ggfHwgIWFjdGl2ZVRhYkZpdHMpIHtcblx0XHRcdHRhYnNTY3JvbGxiYXIuc2V0U2Nyb2xsUG9zaXRpb24oe1xuXHRcdFx0XHRzY3JvbGxMZWZ0OiBhZGp1c3RlZEFjdGl2ZVRhYlBvc1hcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U3RpY2t5VGFiV2lkdGgocGlubmVkVGFiU2l6aW5nOiBJRWRpdG9yUGFydE9wdGlvbnNbJ3Bpbm5lZFRhYlNpemluZyddKTogbnVtYmVyIHtcblx0XHRjb25zdCBoYXNTdHlsZU92ZXJyaWRlID0gQm9vbGVhbih0aGlzLnBhcmVudC5jbG9zZXN0KCcuc3R5bGUtb3ZlcnJpZGUnKSk7XG5cdFx0Y29uc3Qgc3R5bGVPdmVycmlkZVNwYWNpbmcgPSBoYXNTdHlsZU92ZXJyaWRlID8gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5TVFlMRV9PVkVSUklERV9QSU5ORURfVEFCX1NQQUNJTkcgOiAwO1xuXG5cdFx0c3dpdGNoIChwaW5uZWRUYWJTaXppbmcpIHtcblx0XHRcdGNhc2UgJ2NvbXBhY3QnOlxuXHRcdFx0XHRyZXR1cm4gKGhhc1N0eWxlT3ZlcnJpZGUgPyBNdWx0aUVkaXRvclRhYnNDb250cm9sLlNUWUxFX09WRVJSSURFX0NPTVBBQ1RfUElOTkVEX1RBQl9XSURUSCA6IE11bHRpRWRpdG9yVGFic0NvbnRyb2wuVEFCX1dJRFRILmNvbXBhY3QpICsgc3R5bGVPdmVycmlkZVNwYWNpbmc7XG5cdFx0XHRjYXNlICdzaHJpbmsnOlxuXHRcdFx0XHRyZXR1cm4gTXVsdGlFZGl0b3JUYWJzQ29udHJvbC5UQUJfV0lEVEguc2hyaW5rICsgc3R5bGVPdmVycmlkZVNwYWNpbmc7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVRhYnNDb250cm9sVmlzaWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCB0YWJzQW5kQWN0aW9uc0NvbnRhaW5lciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMudGFic0FuZEFjdGlvbnNDb250YWluZXIpO1xuXHRcdHRhYnNBbmRBY3Rpb25zQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgIXRoaXMudmlzaWJsZSk7XG5cblx0XHQvLyBSZXNldCBkaW1lbnNpb25zIGlmIGhpZGRlblxuXHRcdGlmICghdGhpcy52aXNpYmxlICYmIHRoaXMuZGltZW5zaW9ucykge1xuXHRcdFx0dGhpcy5kaW1lbnNpb25zLnVzZWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgdmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy50YWJzTW9kZWwuY291bnQgPiAwO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUYWJBbmRJbmRleChlZGl0b3I6IEVkaXRvcklucHV0KTogW0hUTUxFbGVtZW50LCBudW1iZXIgLyogaW5kZXggKi9dIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YWJJbmRleCA9IHRoaXMudGFic01vZGVsLmluZGV4T2YoZWRpdG9yKTtcblx0XHRjb25zdCB0YWIgPSB0aGlzLmdldFRhYkF0SW5kZXgodGFiSW5kZXgpO1xuXHRcdGlmICh0YWIpIHtcblx0XHRcdHJldHVybiBbdGFiLCB0YWJJbmRleF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VGFiQXRJbmRleCh0YWJJbmRleDogbnVtYmVyKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0YWJJbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCB0YWJzQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy50YWJzQ29udGFpbmVyKTtcblxuXHRcdFx0cmV0dXJuIHRhYnNDb250YWluZXIuY2hpbGRyZW5bdGFiSW5kZXhdIGFzIEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldExhc3RUYWIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmdldFRhYkF0SW5kZXgodGhpcy50YWJzTW9kZWwuY291bnQgLSAxKTtcblx0fVxuXG5cdHByaXZhdGUgYmxvY2tSZXZlYWxBY3RpdmVUYWJPbmNlKCk6IHZvaWQge1xuXG5cdFx0Ly8gV2hlbiBjbG9zaW5nIHRhYnMgdGhyb3VnaCB0aGUgdGFiIGNsb3NlIGJ1dHRvbiBvciBnZXN0dXJlLCB0aGUgdXNlclxuXHRcdC8vIG1pZ2h0IHdhbnQgdG8gcmFwaWRseSBjbG9zZSB0YWJzIGluIHNlcXVlbmNlIGFuZCBhcyBzdWNoIHJldmVhbGluZ1xuXHRcdC8vIHRoZSBhY3RpdmUgdGFiIGFmdGVyIGVhY2ggY2xvc2Ugd291bGQgYmUgYW5ub3lpbmcuIEFzIHN1Y2ggd2UgYmxvY2tcblx0XHQvLyB0aGUgYXV0b21hdGVkIHJldmVhbGluZyBvZiB0aGUgYWN0aXZlIHRhYiBvbmNlIGFmdGVyIHRoZSBjbG9zZSBpc1xuXHRcdC8vIHRyaWdnZXJlZC5cblx0XHR0aGlzLmJsb2NrUmV2ZWFsQWN0aXZlVGFiID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgb3JpZ2luYXRlc0Zyb21UYWJBY3Rpb25CYXIoZTogTW91c2VFdmVudCB8IEdlc3R1cmVFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGxldCBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0XHRpZiAoaXNNb3VzZUV2ZW50KGUpKSB7XG5cdFx0XHRlbGVtZW50ID0gKGUudGFyZ2V0IHx8IGUuc3JjRWxlbWVudCkgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGVsZW1lbnQgPSAoZSBhcyBHZXN0dXJlRXZlbnQpLmluaXRpYWxUYXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhZmluZFBhcmVudFdpdGhDbGFzcyhlbGVtZW50LCAnYWN0aW9uLWl0ZW0nLCAndGFiJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRHJvcChlOiBEcmFnRXZlbnQsIHRhcmdldFRhYkluZGV4OiBudW1iZXIsIHRhYnNDb250YWluZXI6IEhUTUxFbGVtZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0RXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblxuXHRcdHRoaXMudXBkYXRlRHJvcEZlZWRiYWNrKHRhYnNDb250YWluZXIsIGZhbHNlLCBlLCB0YXJnZXRUYWJJbmRleCk7XG5cdFx0dGFic0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdzY3JvbGwnKTtcblxuXHRcdGxldCB0YXJnZXRFZGl0b3JJbmRleCA9IHRoaXMudGFic01vZGVsIGluc3RhbmNlb2YgVW5zdGlja3lFZGl0b3JHcm91cE1vZGVsID8gdGFyZ2V0VGFiSW5kZXggKyB0aGlzLmdyb3VwVmlldy5zdGlja3lDb3VudCA6IHRhcmdldFRhYkluZGV4O1xuXHRcdGNvbnN0IG9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0c3RpY2t5OiB0aGlzLnRhYnNNb2RlbCBpbnN0YW5jZW9mIFN0aWNreUVkaXRvckdyb3VwTW9kZWwgJiYgdGhpcy50YWJzTW9kZWwuc3RpY2t5Q291bnQgPT09IHRhcmdldEVkaXRvckluZGV4LFxuXHRcdFx0aW5kZXg6IHRhcmdldEVkaXRvckluZGV4XG5cdFx0fTtcblxuXHRcdC8vIENoZWNrIGZvciBncm91cCB0cmFuc2ZlclxuXHRcdGlmICh0aGlzLmdyb3VwVHJhbnNmZXIuaGFzRGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSkpIHtcblx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdyb3VwVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9yR3JvdXBJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShkYXRhKSAmJiBkYXRhLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5nZXRHcm91cChkYXRhWzBdLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRpZiAoc291cmNlR3JvdXApIHtcblx0XHRcdFx0XHRjb25zdCBtZXJnZUdyb3VwT3B0aW9uczogSU1lcmdlR3JvdXBPcHRpb25zID0geyBpbmRleDogdGFyZ2V0RWRpdG9ySW5kZXggfTtcblx0XHRcdFx0XHRpZiAoIXRoaXMuaXNNb3ZlT3BlcmF0aW9uKGUsIHNvdXJjZUdyb3VwLmlkKSkge1xuXHRcdFx0XHRcdFx0bWVyZ2VHcm91cE9wdGlvbnMubW9kZSA9IE1lcmdlR3JvdXBNb2RlLkNPUFlfRURJVE9SUztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmdyb3Vwc1ZpZXcubWVyZ2VHcm91cChzb3VyY2VHcm91cCwgdGhpcy5ncm91cFZpZXcsIG1lcmdlR3JvdXBPcHRpb25zKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZ3JvdXBWaWV3LmZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuZ3JvdXBUcmFuc2Zlci5jbGVhckRhdGEoRHJhZ2dlZEVkaXRvckdyb3VwSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBlZGl0b3IgdHJhbnNmZXJcblx0XHRlbHNlIGlmICh0aGlzLmVkaXRvclRyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZEVkaXRvcklkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMuZWRpdG9yVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkRWRpdG9ySWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUdyb3VwID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ2V0R3JvdXAoZGF0YVswXS5pZGVudGlmaWVyLmdyb3VwSWQpO1xuXHRcdFx0XHRpZiAoc291cmNlR3JvdXApIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGRlIG9mIGRhdGEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGRlLmlkZW50aWZpZXIuZWRpdG9yO1xuXG5cdFx0XHRcdFx0XHQvLyBPbmx5IGFsbG93IG1vdmluZy9jb3B5aW5nIGZyb20gYSBzaW5nbGUgZ3JvdXAgc291cmNlXG5cdFx0XHRcdFx0XHRpZiAoc291cmNlR3JvdXAuaWQgIT09IGRlLmlkZW50aWZpZXIuZ3JvdXBJZCkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gS2VlcCB0aGUgc2FtZSBvcmRlciB3aGVuIG1vdmluZyAvIGNvcHlpbmcgZWRpdG9ycyB3aXRoaW4gdGhlIHNhbWUgZ3JvdXBcblx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZUVkaXRvckluZGV4ID0gc291cmNlR3JvdXAuZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3IpO1xuXHRcdFx0XHRcdFx0aWYgKHNvdXJjZUdyb3VwID09PSB0aGlzLmdyb3VwVmlldyAmJiBzb3VyY2VFZGl0b3JJbmRleCA8IHRhcmdldEVkaXRvckluZGV4KSB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldEVkaXRvckluZGV4LS07XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmICh0aGlzLmlzTW92ZU9wZXJhdGlvbihlLCBkZS5pZGVudGlmaWVyLmdyb3VwSWQsIGVkaXRvcikpIHtcblx0XHRcdFx0XHRcdFx0c291cmNlR3JvdXAubW92ZUVkaXRvcihlZGl0b3IsIHRoaXMuZ3JvdXBWaWV3LCB7IC4uLm9wdGlvbnMsIGluZGV4OiB0YXJnZXRFZGl0b3JJbmRleCB9KTtcblxuXHRcdFx0XHRcdFx0XHRpZiAodGhpcy50YWJzTW9kZWwgaW5zdGFuY2VvZiBVbnN0aWNreUVkaXRvckdyb3VwTW9kZWwgJiYgdGhpcy5ncm91cFZpZXcuaXNTdGlja3koZWRpdG9yKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuZ3JvdXBWaWV3LnVuc3RpY2tFZGl0b3IoZWRpdG9yKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0c291cmNlR3JvdXAuY29weUVkaXRvcihlZGl0b3IsIHRoaXMuZ3JvdXBWaWV3LCB7IC4uLm9wdGlvbnMsIGluZGV4OiB0YXJnZXRFZGl0b3JJbmRleCB9KTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGFyZ2V0RWRpdG9ySW5kZXgrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5ncm91cFZpZXcuZm9jdXMoKTtcblx0XHRcdHRoaXMuZWRpdG9yVHJhbnNmZXIuY2xlYXJEYXRhKERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIHRyZWUgaXRlbXNcblx0XHRlbHNlIGlmICh0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmhhc0RhdGEoRHJhZ2dlZFRyZWVJdGVtc0lkZW50aWZpZXIucHJvdG90eXBlKSkge1xuXHRcdFx0Y29uc3QgZGF0YSA9IHRoaXMudHJlZUl0ZW1zVHJhbnNmZXIuZ2V0RGF0YShEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkgJiYgZGF0YS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvcnM6IElVbnR5cGVkRWRpdG9ySW5wdXRbXSA9IFtdO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIGRhdGEpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhVHJhbnNmZXJJdGVtID0gYXdhaXQgdGhpcy50cmVlVmlld3NEcmFnQW5kRHJvcFNlcnZpY2UucmVtb3ZlRHJhZ09wZXJhdGlvblRyYW5zZmVyKGlkLmlkZW50aWZpZXIpO1xuXHRcdFx0XHRcdGlmIChkYXRhVHJhbnNmZXJJdGVtKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0cmVlRHJvcERhdGEgPSBhd2FpdCBleHRyYWN0VHJlZURyb3BEYXRhKGRhdGFUcmFuc2Zlckl0ZW0pO1xuXHRcdFx0XHRcdFx0ZWRpdG9ycy5wdXNoKC4uLnRyZWVEcm9wRGF0YS5tYXAoZWRpdG9yID0+ICh7IC4uLmVkaXRvciwgb3B0aW9uczogeyAuLi5lZGl0b3Iub3B0aW9ucywgcGlubmVkOiB0cnVlLCBpbmRleDogdGFyZ2V0RWRpdG9ySW5kZXggfSB9KSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9ycyhlZGl0b3JzLCB0aGlzLmdyb3VwVmlldywgeyB2YWxpZGF0ZVRydXN0OiB0cnVlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRyZWVJdGVtc1RyYW5zZmVyLmNsZWFyRGF0YShEcmFnZ2VkVHJlZUl0ZW1zSWRlbnRpZmllci5wcm90b3R5cGUpO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBVUkkgdHJhbnNmZXJcblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IGRyb3BIYW5kbGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZXNEcm9wSGFuZGxlciwgeyBhbGxvd1dvcmtzcGFjZU9wZW46IGZhbHNlIH0pO1xuXHRcdFx0ZHJvcEhhbmRsZXIuaGFuZGxlRHJvcChlLCBnZXRXaW5kb3codGhpcy5wYXJlbnQpLCAoKSA9PiB0aGlzLmdyb3VwVmlldywgKCkgPT4gdGhpcy5ncm91cFZpZXcuZm9jdXMoKSwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cblx0XHR0aGlzLnRhYkRpc3Bvc2FibGVzID0gZGlzcG9zZSh0aGlzLnRhYkRpc3Bvc2FibGVzKTtcblx0fVxufVxuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXG5cdC8vIEFkZCBib3R0b20gYm9yZGVyIHRvIHRhYnMgd2hlbiB3cmFwcGluZ1xuXHRjb25zdCBib3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKFRBQl9CT1JERVIpO1xuXHRpZiAoYm9yZGVyQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSA+IC50YWJzLWFuZC1hY3Rpb25zLWNvbnRhaW5lci53cmFwcGluZyAudGFicy1jb250YWluZXIgPiAudGFiIHtcblx0XHRcdFx0Ym9yZGVyLWJvdHRvbTogMXB4IHNvbGlkICR7Ym9yZGVyQ29sb3J9O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gU3R5bGluZyB3aXRoIE91dGxpbmUgY29sb3IgKGUuZy4gaGlnaCBjb250cmFzdCB0aGVtZSlcblx0Y29uc3QgYWN0aXZlQ29udHJhc3RCb3JkZXJDb2xvciA9IHRoZW1lLmdldENvbG9yKGFjdGl2ZUNvbnRyYXN0Qm9yZGVyKTtcblx0aWYgKGFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lci5hY3RpdmUgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmUsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lci5hY3RpdmUgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmU6aG92ZXIgIHtcblx0XHRcdFx0b3V0bGluZTogMXB4IHNvbGlkO1xuXHRcdFx0XHRvdXRsaW5lLW9mZnNldDogLTVweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zZWxlY3RlZDpub3QoLmFjdGl2ZSk6bm90KDpob3ZlcikgIHtcblx0XHRcdFx0b3V0bGluZTogMXB4IGRvdHRlZDtcblx0XHRcdFx0b3V0bGluZS1vZmZzZXQ6IC01cHg7XG5cdFx0XHR9XG5cblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50IC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyLmFjdGl2ZSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLmFjdGl2ZTpmb2N1cyB7XG5cdFx0XHRcdG91dGxpbmUtc3R5bGU6IGRhc2hlZDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmUge1xuXHRcdFx0XHRvdXRsaW5lOiAxcHggZGFzaGVkO1xuXHRcdFx0XHRvdXRsaW5lLW9mZnNldDogLTVweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpob3ZlciAge1xuXHRcdFx0XHRvdXRsaW5lOiAxcHggZGFzaGVkO1xuXHRcdFx0XHRvdXRsaW5lLW9mZnNldDogLTVweDtcblx0XHRcdH1cblxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5hY3RpdmUgPiAudGFiLWFjdGlvbnMgLmFjdGlvbi1sYWJlbCxcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50IC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuYWN0aXZlOmhvdmVyID4gLnRhYi1hY3Rpb25zIC5hY3Rpb24tbGFiZWwsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLmRpcnR5ID4gLnRhYi1hY3Rpb25zIC5hY3Rpb24tbGFiZWwsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnN0aWNreSA+IC50YWItYWN0aW9ucyAuYWN0aW9uLWxhYmVsLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpob3ZlciA+IC50YWItYWN0aW9ucyAuYWN0aW9uLWxhYmVsIHtcblx0XHRcdFx0b3BhY2l0eTogMSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gSGlnaCBDb250cmFzdCBCb3JkZXIgQ29sb3IgZm9yIEVkaXRvciBBY3Rpb25zXG5cdGNvbnN0IGNvbnRyYXN0Qm9yZGVyQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihjb250cmFzdEJvcmRlcik7XG5cdGlmIChjb250cmFzdEJvcmRlckNvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLmVkaXRvci1hY3Rpb25zIHtcblx0XHRcdFx0b3V0bGluZTogMXB4IHNvbGlkICR7Y29udHJhc3RCb3JkZXJDb2xvcn1cblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdC8vIEhvdmVyIEJhY2tncm91bmRcblx0Y29uc3QgdGFiSG92ZXJCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoVEFCX0hPVkVSX0JBQ0tHUk9VTkQpO1xuXHRpZiAodGFiSG92ZXJCYWNrZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWI6bm90KC5zZWxlY3RlZCk6aG92ZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kLWNvbG9yOiAke3RhYkhvdmVyQmFja2dyb3VuZH0gIWltcG9ydGFudDtcblx0XHRcdH1cblx0XHRgKTtcblx0fVxuXG5cdGNvbnN0IHRhYlVuZm9jdXNlZEhvdmVyQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfSE9WRVJfQkFDS0dST1VORCk7XG5cdGlmICh0YWJVbmZvY3VzZWRIb3ZlckJhY2tncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiOm5vdCguc2VsZWN0ZWQpOmhvdmVyICB7XG5cdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7dGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kfSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXHRcdGApO1xuXHR9XG5cblx0Ly8gSG92ZXIgRm9yZWdyb3VuZFxuXHRjb25zdCB0YWJIb3ZlckZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihUQUJfSE9WRVJfRk9SRUdST1VORCk7XG5cdGlmICh0YWJIb3ZlckZvcmVncm91bmQpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudCAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lci5hY3RpdmUgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpub3QoLnNlbGVjdGVkKTpob3ZlciAge1xuXHRcdFx0XHRjb2xvcjogJHt0YWJIb3ZlckZvcmVncm91bmR9ICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHRjb25zdCB0YWJVbmZvY3VzZWRIb3ZlckZvcmVncm91bmQgPSB0aGVtZS5nZXRDb2xvcihUQUJfVU5GT0NVU0VEX0hPVkVSX0ZPUkVHUk9VTkQpO1xuXHRpZiAodGFiVW5mb2N1c2VkSG92ZXJGb3JlZ3JvdW5kKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpub3QoLnNlbGVjdGVkKTpob3ZlciAge1xuXHRcdFx0XHRjb2xvcjogJHt0YWJVbmZvY3VzZWRIb3ZlckZvcmVncm91bmR9ICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHQvLyBIb3ZlciBCb3JkZXJcblx0Ly9cblx0Ly8gVW5mb3J0dW5hdGVseSB3ZSBuZWVkIHRvIGNvcHkgYSBsb3Qgb2YgQ1NTIG92ZXIgZnJvbSB0aGVcblx0Ly8gbXVsdGlFZGl0b3JUYWJzQ29udHJvbC5jc3MgYmVjYXVzZSB3ZSB3YW50IHRvIHJldXNlIHRoZSBzYW1lXG5cdC8vIHN0eWxlcyB3ZSBhbHJlYWR5IGhhdmUgZm9yIHRoZSBub3JtYWwgYm90dG9tLWJvcmRlci5cblx0Y29uc3QgdGFiSG92ZXJCb3JkZXIgPSB0aGVtZS5nZXRDb2xvcihUQUJfSE9WRVJfQk9SREVSKTtcblx0aWYgKHRhYkhvdmVyQm9yZGVyKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWI6aG92ZXIgPiAudGFiLWJvcmRlci1ib3R0b20tY29udGFpbmVyIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0XHRcdFx0bGVmdDogMDtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IG5vbmU7XG5cdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHR6LWluZGV4OiAxMDtcblx0XHRcdFx0Ym90dG9tOiAwO1xuXHRcdFx0XHRoZWlnaHQ6IDFweDtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHt0YWJIb3ZlckJvcmRlcn07XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHRjb25zdCB0YWJVbmZvY3VzZWRIb3ZlckJvcmRlciA9IHRoZW1lLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfSE9WRVJfQk9SREVSKTtcblx0aWYgKHRhYlVuZm9jdXNlZEhvdmVyQm9yZGVyKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQgLmVkaXRvci1ncm91cC1jb250YWluZXIgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYjpob3ZlciA+IC50YWItYm9yZGVyLWJvdHRvbS1jb250YWluZXIgIHtcblx0XHRcdFx0ZGlzcGxheTogYmxvY2s7XG5cdFx0XHRcdHBvc2l0aW9uOiBhYnNvbHV0ZTtcblx0XHRcdFx0bGVmdDogMDtcblx0XHRcdFx0cG9pbnRlci1ldmVudHM6IG5vbmU7XG5cdFx0XHRcdHdpZHRoOiAxMDAlO1xuXHRcdFx0XHR6LWluZGV4OiAxMDtcblx0XHRcdFx0Ym90dG9tOiAwO1xuXHRcdFx0XHRoZWlnaHQ6IDFweDtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHt0YWJVbmZvY3VzZWRIb3ZlckJvcmRlcn07XG5cdFx0XHR9XG5cdFx0YCk7XG5cdH1cblxuXHQvLyBGYWRlIG91dCBzdHlsZXMgdmlhIGxpbmVhciBncmFkaWVudCAod2hlbiB0YWJzIGFyZSBzZXQgdG8gc2hyaW5rIG9yIGZpeGVkKVxuXHQvLyBCdXQgbm90IHdoZW46XG5cdC8vIC0gaW4gaGlnaCBjb250cmFzdCB0aGVtZVxuXHQvLyAtIGlmIHdlIGhhdmUgYSBjb250cmFzdCBib3JkZXIgKHdoaWNoIGRyYXdzIGFuIG91dGxpbmUgLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTA5MTE3KVxuXHQvLyAtIG9uIFNhZmFyaSAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEwODk5Nilcblx0aWYgKCFpc0hpZ2hDb250cmFzdCh0aGVtZS50eXBlKSAmJiAhaXNTYWZhcmkgJiYgIWFjdGl2ZUNvbnRyYXN0Qm9yZGVyQ29sb3IpIHtcblx0XHRjb25zdCB3b3JrYmVuY2hCYWNrZ3JvdW5kID0gV09SS0JFTkNIX0JBQ0tHUk9VTkQodGhlbWUpO1xuXHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGVkaXRvckJhY2tncm91bmQpO1xuXHRcdGNvbnN0IGVkaXRvckdyb3VwSGVhZGVyVGFic0JhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQkFDS0dST1VORCk7XG5cdFx0Y29uc3QgZWRpdG9yRHJhZ0FuZERyb3BCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoRURJVE9SX0RSQUdfQU5EX0RST1BfQkFDS0dST1VORCk7XG5cblx0XHRsZXQgYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kOiBDb2xvciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoZWRpdG9yR3JvdXBIZWFkZXJUYWJzQmFja2dyb3VuZCAmJiBlZGl0b3JCYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRcdGFkanVzdGVkVGFiQmFja2dyb3VuZCA9IGVkaXRvckdyb3VwSGVhZGVyVGFic0JhY2tncm91bmQuZmxhdHRlbihlZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIGVkaXRvckJhY2tncm91bmRDb2xvciwgd29ya2JlbmNoQmFja2dyb3VuZCk7XG5cdFx0fVxuXG5cdFx0bGV0IGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQ6IENvbG9yIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChlZGl0b3JHcm91cEhlYWRlclRhYnNCYWNrZ3JvdW5kICYmIGVkaXRvckJhY2tncm91bmRDb2xvciAmJiBlZGl0b3JEcmFnQW5kRHJvcEJhY2tncm91bmQgJiYgZWRpdG9yQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0XHRhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kID0gZWRpdG9yR3JvdXBIZWFkZXJUYWJzQmFja2dyb3VuZC5mbGF0dGVuKGVkaXRvckJhY2tncm91bmRDb2xvciwgZWRpdG9yRHJhZ0FuZERyb3BCYWNrZ3JvdW5kLCBlZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIHdvcmtiZW5jaEJhY2tncm91bmQpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgZm9jdXNlZCBhbmQgdW5mb2N1c2VkIGhvdmVyIGJhY2tncm91bmRcblx0XHRjb25zdCBtYWtlVGFiSG92ZXJCYWNrZ3JvdW5kUnVsZSA9IChjb2xvcjogQ29sb3IsIGNvbG9yRHJhZzogQ29sb3IsIGhhc0ZvY3VzID0gZmFsc2UpID0+IGBcblx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50Om5vdCguZHJhZ2dlZC1vdmVyKSAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciR7aGFzRm9jdXMgPyAnLmFjdGl2ZScgOiAnJ30gPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctc2hyaW5rOm5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCk6aG92ZXIgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIsXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudDpub3QoLmRyYWdnZWQtb3ZlcikgLmVkaXRvci1ncm91cC1jb250YWluZXIke2hhc0ZvY3VzID8gJy5hY3RpdmUnIDogJyd9ID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLWZpeGVkOm5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCk6aG92ZXIgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIge1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQodG8gbGVmdCwgJHtjb2xvcn0sIHRyYW5zcGFyZW50KSAhaW1wb3J0YW50O1xuXHRcdFx0fVxuXG5cdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudC5kcmFnZ2VkLW92ZXIgLmVkaXRvci1ncm91cC1jb250YWluZXIke2hhc0ZvY3VzID8gJy5hY3RpdmUnIDogJyd9ID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLXNocmluazpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpOmhvdmVyID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyLFxuXHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQuZHJhZ2dlZC1vdmVyIC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyJHtoYXNGb2N1cyA/ICcuYWN0aXZlJyA6ICcnfSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnNpemluZy1maXhlZDpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpOmhvdmVyID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyIHtcblx0XHRcdFx0YmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KHRvIGxlZnQsICR7Y29sb3JEcmFnfSwgdHJhbnNwYXJlbnQpICFpbXBvcnRhbnQ7XG5cdFx0XHR9XG5cdFx0YDtcblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgKGZvY3VzZWQpIGhvdmVyIGJhY2tncm91bmRcblx0XHRpZiAodGFiSG92ZXJCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShtYWtlVGFiSG92ZXJCYWNrZ3JvdW5kUnVsZShhZGp1c3RlZENvbG9yLCBhZGp1c3RlZENvbG9yRHJhZywgdHJ1ZSkpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgdW5mb2N1c2VkIGhvdmVyIGJhY2tncm91bmRcblx0XHRpZiAodGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiVW5mb2N1c2VkSG92ZXJCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShtYWtlVGFiSG92ZXJCYWNrZ3JvdW5kUnVsZShhZGp1c3RlZENvbG9yLCBhZGp1c3RlZENvbG9yRHJhZykpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgZHJhZyBhbmQgZHJvcCBiYWNrZ3JvdW5kXG5cdFx0aWYgKGVkaXRvckRyYWdBbmREcm9wQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yRHJhZyA9IGVkaXRvckRyYWdBbmREcm9wQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpO1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYFxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudC5kcmFnZ2VkLW92ZXIgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLXNocmluay5kcmFnZ2VkLW92ZXI6bm90KC5hY3RpdmUpOm5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCkgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIsXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50LmRyYWdnZWQtb3ZlciAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lcjpub3QoLmFjdGl2ZSkgPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctc2hyaW5rLmRyYWdnZWQtb3Zlcjpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyLFxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudC5kcmFnZ2VkLW92ZXIgLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLWZpeGVkLmRyYWdnZWQtb3Zlcjpub3QoLmFjdGl2ZSk6bm90KC5kcmFnZ2VkKTpub3QoLnN0aWNreS1jb21wYWN0KSA+IC50YWItbGFiZWwgPiAubW9uYWNvLWljb24tbGFiZWwtY29udGFpbmVyOjphZnRlcixcblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQuZHJhZ2dlZC1vdmVyIC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyOm5vdCguYWN0aXZlKSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnNpemluZy1maXhlZC5kcmFnZ2VkLW92ZXI6bm90KC5kcmFnZ2VkKTpub3QoLnN0aWNreS1jb21wYWN0KSA+IC50YWItbGFiZWwgPiAubW9uYWNvLWljb24tbGFiZWwtY29udGFpbmVyOjphZnRlciB7XG5cdFx0XHRcdFx0YmFja2dyb3VuZDogbGluZWFyLWdyYWRpZW50KHRvIGxlZnQsICR7YWRqdXN0ZWRDb2xvckRyYWd9LCB0cmFuc3BhcmVudCkgIWltcG9ydGFudDtcblx0XHRcdFx0fVxuXHRcdGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1ha2VUYWJCYWNrZ3JvdW5kUnVsZSA9IChjb2xvcjogQ29sb3IsIGNvbG9yRHJhZzogQ29sb3IsIGZvY3VzZWQ6IGJvb2xlYW4sIGFjdGl2ZTogYm9vbGVhbikgPT4gYFxuXHRcdFx0XHQubW9uYWNvLXdvcmtiZW5jaCAucGFydC5lZGl0b3IgPiAuY29udGVudDpub3QoLmRyYWdnZWQtb3ZlcikgLmVkaXRvci1ncm91cC1jb250YWluZXIke2ZvY3VzZWQgPyAnLmFjdGl2ZScgOiAnOm5vdCguYWN0aXZlKSd9ID4gLnRpdGxlIC50YWJzLWNvbnRhaW5lciA+IC50YWIuc2l6aW5nLXNocmluayR7YWN0aXZlID8gJy5hY3RpdmUnIDogJyd9Om5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCkgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIsXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50Om5vdCguZHJhZ2dlZC1vdmVyKSAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciR7Zm9jdXNlZCA/ICcuYWN0aXZlJyA6ICc6bm90KC5hY3RpdmUpJ30gPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctZml4ZWQke2FjdGl2ZSA/ICcuYWN0aXZlJyA6ICcnfTpub3QoLmRyYWdnZWQpOm5vdCguc3RpY2t5LWNvbXBhY3QpID4gLnRhYi1sYWJlbCA+IC5tb25hY28taWNvbi1sYWJlbC1jb250YWluZXI6OmFmdGVyIHtcblx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBsaW5lYXItZ3JhZGllbnQodG8gbGVmdCwgJHtjb2xvcn0sIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC5tb25hY28td29ya2JlbmNoIC5wYXJ0LmVkaXRvciA+IC5jb250ZW50LmRyYWdnZWQtb3ZlciAuZWRpdG9yLWdyb3VwLWNvbnRhaW5lciR7Zm9jdXNlZCA/ICcuYWN0aXZlJyA6ICc6bm90KC5hY3RpdmUpJ30gPiAudGl0bGUgLnRhYnMtY29udGFpbmVyID4gLnRhYi5zaXppbmctc2hyaW5rJHthY3RpdmUgPyAnLmFjdGl2ZScgOiAnJ306bm90KC5kcmFnZ2VkKTpub3QoLnN0aWNreS1jb21wYWN0KSA+IC50YWItbGFiZWwgPiAubW9uYWNvLWljb24tbGFiZWwtY29udGFpbmVyOjphZnRlcixcblx0XHRcdFx0Lm1vbmFjby13b3JrYmVuY2ggLnBhcnQuZWRpdG9yID4gLmNvbnRlbnQuZHJhZ2dlZC1vdmVyIC5lZGl0b3ItZ3JvdXAtY29udGFpbmVyJHtmb2N1c2VkID8gJy5hY3RpdmUnIDogJzpub3QoLmFjdGl2ZSknfSA+IC50aXRsZSAudGFicy1jb250YWluZXIgPiAudGFiLnNpemluZy1maXhlZCR7YWN0aXZlID8gJy5hY3RpdmUnIDogJyd9Om5vdCguZHJhZ2dlZCk6bm90KC5zdGlja3ktY29tcGFjdCkgPiAudGFiLWxhYmVsID4gLm1vbmFjby1pY29uLWxhYmVsLWNvbnRhaW5lcjo6YWZ0ZXIge1xuXHRcdFx0XHRcdGJhY2tncm91bmQ6IGxpbmVhci1ncmFkaWVudCh0byBsZWZ0LCAke2NvbG9yRHJhZ30sIHRyYW5zcGFyZW50KTtcblx0XHRcdFx0fVxuXHRcdGA7XG5cblx0XHQvLyBBZGp1c3QgZ3JhZGllbnQgZm9yIGZvY3VzZWQgYWN0aXZlIHRhYiBiYWNrZ3JvdW5kXG5cdFx0Y29uc3QgdGFiQWN0aXZlQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRBQl9BQ1RJVkVfQkFDS0dST1VORCk7XG5cdFx0aWYgKHRhYkFjdGl2ZUJhY2tncm91bmQgJiYgYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpIHtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3IgPSB0YWJBY3RpdmVCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiQWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpO1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUobWFrZVRhYkJhY2tncm91bmRSdWxlKGFkanVzdGVkQ29sb3IsIGFkanVzdGVkQ29sb3JEcmFnLCB0cnVlLCB0cnVlKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRqdXN0IGdyYWRpZW50IGZvciB1bmZvY3VzZWQgYWN0aXZlIHRhYiBiYWNrZ3JvdW5kXG5cdFx0Y29uc3QgdGFiVW5mb2N1c2VkQWN0aXZlQmFja2dyb3VuZCA9IHRoZW1lLmdldENvbG9yKFRBQl9VTkZPQ1VTRURfQUNUSVZFX0JBQ0tHUk9VTkQpO1xuXHRcdGlmICh0YWJVbmZvY3VzZWRBY3RpdmVCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiVW5mb2N1c2VkQWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiQmFja2dyb3VuZCk7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yRHJhZyA9IHRhYlVuZm9jdXNlZEFjdGl2ZUJhY2tncm91bmQuZmxhdHRlbihhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbGxlY3Rvci5hZGRSdWxlKG1ha2VUYWJCYWNrZ3JvdW5kUnVsZShhZGp1c3RlZENvbG9yLCBhZGp1c3RlZENvbG9yRHJhZywgZmFsc2UsIHRydWUpKTtcblx0XHR9XG5cblx0XHQvLyBBZGp1c3QgZ3JhZGllbnQgZm9yIGZvY3VzZWQgaW5hY3RpdmUgdGFiIGJhY2tncm91bmRcblx0XHRjb25zdCB0YWJJbmFjdGl2ZUJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihUQUJfSU5BQ1RJVkVfQkFDS0dST1VORCk7XG5cdFx0aWYgKHRhYkluYWN0aXZlQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkJhY2tncm91bmQgJiYgYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCkge1xuXHRcdFx0Y29uc3QgYWRqdXN0ZWRDb2xvciA9IHRhYkluYWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiQmFja2dyb3VuZCk7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yRHJhZyA9IHRhYkluYWN0aXZlQmFja2dyb3VuZC5mbGF0dGVuKGFkanVzdGVkVGFiRHJhZ0JhY2tncm91bmQpO1xuXHRcdFx0Y29sbGVjdG9yLmFkZFJ1bGUobWFrZVRhYkJhY2tncm91bmRSdWxlKGFkanVzdGVkQ29sb3IsIGFkanVzdGVkQ29sb3JEcmFnLCB0cnVlLCBmYWxzZSkpO1xuXHRcdH1cblxuXHRcdC8vIEFkanVzdCBncmFkaWVudCBmb3IgdW5mb2N1c2VkIGluYWN0aXZlIHRhYiBiYWNrZ3JvdW5kXG5cdFx0Y29uc3QgdGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoVEFCX1VORk9DVVNFRF9JTkFDVElWRV9CQUNLR1JPVU5EKTtcblx0XHRpZiAodGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kICYmIGFkanVzdGVkVGFiQmFja2dyb3VuZCAmJiBhZGp1c3RlZFRhYkRyYWdCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBhZGp1c3RlZENvbG9yID0gdGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJCYWNrZ3JvdW5kKTtcblx0XHRcdGNvbnN0IGFkanVzdGVkQ29sb3JEcmFnID0gdGFiVW5mb2N1c2VkSW5hY3RpdmVCYWNrZ3JvdW5kLmZsYXR0ZW4oYWRqdXN0ZWRUYWJEcmFnQmFja2dyb3VuZCk7XG5cdFx0XHRjb2xsZWN0b3IuYWRkUnVsZShtYWtlVGFiQmFja2dyb3VuZFJ1bGUoYWRqdXN0ZWRDb2xvciwgYWRqdXN0ZWRDb2xvckRy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
