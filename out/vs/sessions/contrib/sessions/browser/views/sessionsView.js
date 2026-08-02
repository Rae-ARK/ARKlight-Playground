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
import "../media/sessionsViewPane.css";
import * as DOM from "../../../../../base/browser/dom.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { autorun } from "../../../../../base/common/observable.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { Orientation } from "../../../../../base/browser/ui/sash/sash.js";
import { Sizing, SplitView } from "../../../../../base/browser/ui/splitview/splitview.js";
import { Color } from "../../../../../base/common/color.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from "../../../../../workbench/common/contextkeys.js";
import { IContextMenuService } from "../../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ViewPane } from "../../../../../workbench/browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../../../workbench/common/views.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { localize } from "../../../../../nls.js";
import { SessionsList, SessionsGrouping, SessionsSorting } from "./sessionsList.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { AICustomizationShortcutsWidget } from "../aiCustomizationShortcutsWidget.js";
import { AgentHostShortcutsWidget } from "../agentHostShortcutsWidget.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { agentsBackground } from "../../../../common/theme.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IHostService } from "../../../../../workbench/services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { PANEL_SECTION_BORDER } from "../../../../../workbench/common/theme.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { Menus } from "../../../../browser/menus.js";
import { MobileSessionFilterChips } from "../../../../browser/parts/mobile/mobileSessionFilterChips.js";
import { showMobileSortGroupSheet } from "../../../../browser/parts/mobile/mobileSortGroupSheet.js";
import { isPhoneLayout } from "../../../../browser/parts/mobile/mobileLayout.js";
import { IsPhoneLayoutContext } from "../../../../common/contextkeys.js";
const $ = DOM.$;
const SessionsViewId = "sessions.workbench.view.sessionsView";
const GROUPING_STORAGE_KEY = "sessionsViewPane.grouping";
const SORTING_STORAGE_KEY = "sessionsViewPane.sorting";
const CUSTOMIZATIONS_MIN_HEIGHT = 129;
const SESSIONS_SECTION_MIN_HEIGHT = 120;
async function openSessionToTheSide(sessionsService, session, options) {
  const visible = sessionsService.visibleSessions.get();
  const lastVisible = visible[visible.length - 1];
  if (lastVisible && lastVisible.sessionId !== session.sessionId) {
    sessionsService.insertAt(session, lastVisible.sessionId, "right");
  }
  await sessionsService.openSession(session.resource, options);
}
const SessionsViewFilterSubMenu = new MenuId("SessionsViewPaneFilterSubMenu");
const SessionsViewFilterOptionsSubMenu = new MenuId("SessionsViewPaneFilterOptionsSubMenu");
const SessionsViewGroupingContext = new RawContextKey("sessionsViewPane.grouping", SessionsGrouping.Workspace);
const SessionsViewSortingContext = new RawContextKey("sessionsViewPane.sorting", SessionsSorting.Created);
const IsWorkspaceGroupCappedContext = new RawContextKey("sessionsViewPane.workspaceGroupCapped", true);
let SessionsView = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, sessionsManagementService, sessionsService, hostService, layoutService, storageService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.sessionsManagementService = sessionsManagementService;
    this.sessionsService = sessionsService;
    this.hostService = hostService;
    this.layoutService = layoutService;
    this.storageService = storageService;
    this.isFindWidgetOpen = false;
    this.currentGrouping = SessionsGrouping.Workspace;
    this.currentSorting = SessionsSorting.Created;
    this.filterContextKeys = /* @__PURE__ */ new Map();
    this.currentBodyHeight = 0;
    this.currentBodyWidth = 0;
    this.didInitializePaneSizes = false;
    this.registeredFilterTypeIds = /* @__PURE__ */ new Set();
    const storedGrouping = this.storageService.get(GROUPING_STORAGE_KEY, StorageScope.PROFILE);
    if (storedGrouping && Object.values(SessionsGrouping).includes(storedGrouping)) {
      this.currentGrouping = storedGrouping;
    }
    const storedSorting = this.storageService.get(SORTING_STORAGE_KEY, StorageScope.PROFILE);
    if (storedSorting && Object.values(SessionsSorting).includes(storedSorting)) {
      this.currentSorting = storedSorting;
    }
    this.groupingContextKey = SessionsViewGroupingContext.bindTo(contextKeyService);
    this.groupingContextKey.set(this.currentGrouping);
    this.sortingContextKey = SessionsViewSortingContext.bindTo(contextKeyService);
    this.sortingContextKey.set(this.currentSorting);
    this.workspaceGroupCappedContextKey = IsWorkspaceGroupCappedContext.bindTo(contextKeyService);
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.viewPaneContainer = parent;
    this.viewPaneContainer.classList.add("agent-sessions-viewpane");
    this.createControls(parent);
  }
  getLocationBasedColors() {
    const colors = super.getLocationBasedColors();
    return {
      ...colors,
      background: void 0,
      listOverrideStyles: {
        ...colors.listOverrideStyles,
        listBackground: void 0,
        treeStickyScrollBackground: agentsBackground
      }
    };
  }
  createControls(parent) {
    const sessionsContainer = DOM.append(parent, $(".agent-sessions-container"));
    this.sidebarSplitViewContainer = DOM.append(sessionsContainer, $(".agent-sessions-sidebar-splitview-container"));
    const sessionsSection = DOM.append(this.sidebarSplitViewContainer, $(".agent-sessions-section"));
    const sessionsContent = DOM.append(sessionsSection, $(".agent-sessions-content"));
    const headerRow = this.headerRow = DOM.append(sessionsContent, $(".agent-sessions-header-row"));
    const headerLabel = this.headerLabel = DOM.append(headerRow, $(".agent-sessions-header-label"));
    const headerActions = this.headerActions = DOM.append(headerRow, $(".agent-sessions-header-actions"));
    const phoneLayout = isPhoneLayout(this.layoutService);
    if (!phoneLayout) {
      headerLabel.textContent = localize("sessionsHeader", "Sessions");
      const scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, this.scopedContextKeyService])));
      this._register(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, headerActions, Menus.SidebarSessionsHeader, {
        hiddenItemStrategy: HiddenItemStrategy.NoHide,
        telemetrySource: "sessionsView.header",
        toolbarOptions: { primaryGroup: () => true }
      }));
    } else {
      headerRow.classList.add("phone-layout-empty");
    }
    const findWidgetContainer = this.findWidgetContainer = DOM.append(headerRow, $(".agent-sessions-find-widget-container"));
    findWidgetContainer.style.display = "none";
    const filterChipsContainer = isPhoneLayout(this.layoutService) ? DOM.append(sessionsContent, $(".mobile-session-filter-chips-slot")) : void 0;
    this.sessionsControlContainer = DOM.append(sessionsContent, $(".agent-sessions-control-container"));
    const sessionsControl = this.sessionsControl = this._register(this.instantiationService.createInstance(SessionsList, this.sessionsControlContainer, {
      overrideStyles: this.getLocationBasedColors().listOverrideStyles,
      grouping: () => this.currentGrouping,
      sorting: () => this.currentSorting,
      findWidgetContainer,
      onSessionOpen: (resource, preserveFocus, sideBySide) => {
        const onOpened = () => {
          if (isWeb && isPhoneLayout(this.layoutService)) {
            this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
          }
        };
        if (sideBySide) {
          const session = this.sessionsManagementService.getSession(resource);
          if (session) {
            openSessionToTheSide(this.sessionsService, session, { preserveFocus }).then(onOpened).catch(onUnexpectedError);
            return;
          }
        }
        this.sessionsService.openSession(resource, { preserveFocus }).then(onOpened).catch(onUnexpectedError);
      }
    }));
    this._register(this.onDidChangeBodyVisibility((visible) => sessionsControl.setVisible(visible)));
    this._register(sessionsControl.onDidChangeFindOpenState((open) => {
      this.isFindWidgetOpen = open;
      findWidgetContainer.style.display = open ? "" : "none";
      this.updateHeaderLayout();
    }));
    this._register(DOM.addDisposableListener(findWidgetContainer, "keydown", (e) => {
      if (e.key === "Escape") {
        sessionsControl.closeFind();
        e.stopPropagation();
      }
    }));
    this.workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
    this.registerSessionTypeFilters(sessionsControl);
    this._register(this.sessionsManagementService.onDidChangeSessionTypes(() => {
      this.registerSessionTypeFilters(sessionsControl);
    }));
    this.registerStatusFilters(sessionsControl);
    this._register(this.hostService.onDidChangeFocus((hasFocus) => {
      if (hasFocus) {
        sessionsControl.refresh();
      }
    }));
    this._register(sessionsControl.onDidUpdate(() => {
      if (!sessionsControl.hasFocusOrSelection()) {
        this.restoreLastSelectedSession();
      }
    }));
    if (filterChipsContainer) {
      const chips = this._register(new MobileSessionFilterChips(filterChipsContainer, sessionsControl));
      this._register(chips.onDidRequestSortGroup(() => {
        this.openSortGroupSheet();
      }));
      this._register(chips.onDidRequestFind(() => {
        this.openFind();
      }));
    }
    this._register(autorun((reader) => {
      const activeSession = this.sessionsService.activeSession.read(reader);
      if (activeSession) {
        if (!sessionsControl.reveal(activeSession.resource)) {
          sessionsControl.clearFocus();
        }
      } else {
        sessionsControl.clearFocus();
      }
    }));
    const customizationsSection = DOM.append(this.sidebarSplitViewContainer, $(".agent-sessions-customizations-section"));
    const customizationsSizeChange = this._register(new Emitter());
    const customizationsWidget = this._customizationsWidget = this._register(this.instantiationService.createInstance(AICustomizationShortcutsWidget, customizationsSection, {
      onDidChangeLayout: () => {
        customizationsSizeChange.fire();
        this.layoutSidebarSplitView();
      }
    }));
    this.sidebarSplitView = this._register(new SplitView(this.sidebarSplitViewContainer, {
      orientation: Orientation.VERTICAL,
      proportionalLayout: false
    }));
    const sessionsPane = {
      element: sessionsSection,
      minimumSize: SESSIONS_SECTION_MIN_HEIGHT,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: Event.None,
      layout: (height) => {
        sessionsSection.style.height = `${height}px`;
        this.sessionsControl?.layout(this.sessionsControlContainer?.offsetHeight ?? 0, this.currentBodyWidth);
      }
    };
    const customizationsPane = {
      element: customizationsSection,
      get minimumSize() {
        return customizationsWidget.collapsed ? customizationsWidget.collapsedHeight : CUSTOMIZATIONS_MIN_HEIGHT;
      },
      get maximumSize() {
        return customizationsWidget.collapsed ? customizationsWidget.collapsedHeight : Math.max(CUSTOMIZATIONS_MIN_HEIGHT, customizationsWidget.desiredHeight);
      },
      onDidChange: Event.map(Event.any(customizationsWidget.onDidChangeHeight, customizationsSizeChange.event), () => this.getCustomizationsPaneHeight()),
      layout: (height) => {
        customizationsSection.style.height = `${height}px`;
        this._customizationsWidget?.layout(height, this.currentBodyWidth);
      }
    };
    this.sidebarSplitView.addView(sessionsPane, Sizing.Distribute, 0, true);
    this.sidebarSplitView.addView(customizationsPane, this.getCustomizationsPaneHeight(), 1, true);
    let savedCustomizationsPaneHeight = this.getCustomizationsPaneHeight();
    this._register(customizationsWidget.onDidToggleCollapsed((collapsed) => {
      if (!this.sidebarSplitView) {
        return;
      }
      if (collapsed) {
        const currentSize = this.sidebarSplitView.getViewSize(1);
        if (currentSize > customizationsWidget.collapsedHeight) {
          savedCustomizationsPaneHeight = currentSize;
        }
        this.sidebarSplitView.resizeView(1, customizationsWidget.collapsedHeight);
      } else {
        this.sidebarSplitView.resizeView(1, savedCustomizationsPaneHeight);
      }
      this.layoutSidebarSplitView();
    }));
    const updateSplitViewStyles = () => {
      const borderColor = this.themeService.getColorTheme().getColor(PANEL_SECTION_BORDER);
      this.sidebarSplitView?.style({ separatorBorder: borderColor ?? Color.transparent });
    };
    updateSplitViewStyles();
    this._register(this.themeService.onDidColorThemeChange(updateSplitViewStyles));
    if (isWeb && this.scopedContextKeyService.contextMatchesRules(ContextKeyExpr.and(
      IsSessionsWindowContext,
      IsAuxiliaryWindowContext.toNegated(),
      IsPhoneLayoutContext.negate()
    ))) {
      this._register(this.instantiationService.createInstance(AgentHostShortcutsWidget, sessionsContainer, {
        onDidChangeLayout: () => {
          this.layoutSidebarSplitView();
        }
      }));
    }
    this._register(DOM.scheduleAtNextAnimationFrame(DOM.getWindow(parent), () => this.layoutSidebarSplitView()));
  }
  focusCustomizations() {
    this._customizationsWidget?.focus();
  }
  restoreLastSelectedSession() {
    const activeSession = this.sessionsService.activeSession.get();
    if (activeSession && this.sessionsControl) {
      this.sessionsControl.reveal(activeSession.resource);
    }
  }
  registerSessionTypeFilters(sessionsControl) {
    const sessionTypes = this.sessionsManagementService.getAllSessionTypes();
    for (let i = 0; i < sessionTypes.length; i++) {
      const type = sessionTypes[i];
      if (this.registeredFilterTypeIds.has(type.id)) {
        continue;
      }
      this.registeredFilterTypeIds.add(type.id);
      const contextKey = new RawContextKey(`sessionsViewPane.filterType.${type.id}`, !sessionsControl.isSessionTypeExcluded(type.id));
      const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
      this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, getDefault: () => true });
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `sessionsViewPane.filterType.${type.id}`,
            title: type.label,
            toggled: ContextKeyExpr.equals(contextKey.key, true),
            menu: [{
              id: SessionsViewFilterOptionsSubMenu,
              group: "1_types",
              order: i
            }]
          });
        }
        run() {
          const isExcluded = sessionsControl.isSessionTypeExcluded(type.id);
          sessionsControl.setSessionTypeExcluded(type.id, !isExcluded);
          contextKeyInstance.set(isExcluded);
        }
      }));
    }
  }
  registerStatusFilters(sessionsControl) {
    const statusFilters = [
      { status: SessionStatus.Completed, label: localize("statusCompleted", "Completed") },
      { status: SessionStatus.InProgress, label: localize("statusInProgress", "In Progress") },
      { status: SessionStatus.NeedsInput, label: localize("statusNeedsInput", "Input Needed") },
      { status: SessionStatus.Error, label: localize("statusFailed", "Failed") }
    ];
    for (let i = 0; i < statusFilters.length; i++) {
      const { status, label } = statusFilters[i];
      const contextKey = new RawContextKey(`sessionsViewPane.filterStatus.${status}`, !sessionsControl.isStatusExcluded(status));
      const contextKeyInstance = contextKey.bindTo(this.scopedContextKeyService);
      this.filterContextKeys.set(contextKey.key, { key: contextKeyInstance, getDefault: () => true });
      this._register(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: `sessionsViewPane.filterStatus.${status}`,
            title: label,
            toggled: ContextKeyExpr.equals(contextKey.key, true),
            menu: [{
              id: SessionsViewFilterOptionsSubMenu,
              group: "2_status",
              order: i
            }]
          });
        }
        run() {
          const isExcluded = sessionsControl.isStatusExcluded(status);
          sessionsControl.setStatusExcluded(status, !isExcluded);
          contextKeyInstance.set(isExcluded);
        }
      }));
    }
    const archivedContextKey = new RawContextKey("sessionsViewPane.filter.showArchived", !sessionsControl.isExcludeArchived());
    const archivedContextKeyInstance = archivedContextKey.bindTo(this.scopedContextKeyService);
    this.filterContextKeys.set(archivedContextKey.key, { key: archivedContextKeyInstance, getDefault: () => false });
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "sessionsViewPane.filterArchived",
          title: localize("filterArchived", "Done"),
          toggled: ContextKeyExpr.equals(archivedContextKey.key, true),
          menu: [{
            id: SessionsViewFilterOptionsSubMenu,
            group: "3_props",
            order: 0
          }]
        });
      }
      run() {
        const excluding = sessionsControl.isExcludeArchived();
        sessionsControl.setExcludeArchived(!excluding);
        archivedContextKeyInstance.set(excluding);
      }
    }));
    const readContextKey = new RawContextKey("sessionsViewPane.filter.showRead", !sessionsControl.isExcludeRead());
    const readContextKeyInstance = readContextKey.bindTo(this.scopedContextKeyService);
    this.filterContextKeys.set(readContextKey.key, { key: readContextKeyInstance, getDefault: () => true });
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "sessionsViewPane.filterRead",
          title: localize("filterRead", "Read"),
          toggled: ContextKeyExpr.equals(readContextKey.key, true),
          menu: [{
            id: SessionsViewFilterOptionsSubMenu,
            group: "3_props",
            order: 1
          }]
        });
      }
      run() {
        const excluding = sessionsControl.isExcludeRead();
        sessionsControl.setExcludeRead(!excluding);
        readContextKeyInstance.set(excluding);
      }
    }));
    const filterContextKeys = this.filterContextKeys;
    const workspaceGroupCappedContextKey = this.workspaceGroupCappedContextKey;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "sessionsViewPane.resetFilters",
          title: localize("resetFilters", "Reset"),
          menu: [{
            id: SessionsViewFilterOptionsSubMenu,
            group: "4_reset",
            order: 0
          }]
        });
      }
      run() {
        sessionsControl.resetFilters();
        for (const { key, getDefault } of filterContextKeys.values()) {
          key.set(getDefault());
        }
        workspaceGroupCappedContextKey?.set(sessionsControl.isWorkspaceGroupCapped());
      }
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.currentBodyHeight = height;
    this.currentBodyWidth = width;
    this.updateHeaderLayout();
    this.layoutSidebarSplitView();
    if (this.sidebarSplitView || !this.sessionsControl || !this.sessionsControlContainer) {
      return;
    }
    this.sessionsControl.layout(this.sessionsControlContainer.offsetHeight, width);
  }
  layoutSidebarSplitView() {
    if (!this.sidebarSplitView || !this.sidebarSplitViewContainer) {
      return;
    }
    const height = this.sidebarSplitViewContainer.offsetHeight || this.currentBodyHeight || this.viewPaneContainer?.offsetHeight || 0;
    if (height <= 0) {
      return;
    }
    if (this.sidebarSplitViewContainer.offsetHeight === 0) {
      this.sidebarSplitViewContainer.style.height = `${height}px`;
    }
    this.sidebarSplitView.layout(height);
    if (!this.didInitializePaneSizes) {
      this.didInitializePaneSizes = true;
      this.sidebarSplitView.resizeView(1, this.getCustomizationsPaneHeight());
    }
  }
  getCustomizationsPaneHeight() {
    if (this._customizationsWidget?.collapsed) {
      return this._customizationsWidget.collapsedHeight;
    }
    const desiredHeight = this._customizationsWidget?.desiredHeight ?? 0;
    return Math.max(CUSTOMIZATIONS_MIN_HEIGHT, Number.isFinite(desiredHeight) ? desiredHeight : 0);
  }
  focus() {
    super.focus();
    this.sessionsControl?.focus();
  }
  refresh() {
    this.sessionsControl?.refresh();
  }
  openFind() {
    this.isFindWidgetOpen = true;
    if (this.findWidgetContainer) {
      this.findWidgetContainer.style.display = "";
    }
    this.updateHeaderLayout();
    this.sessionsControl?.openFind();
  }
  updateHeaderLayout() {
    if (!this.headerRow || !this.headerLabel || !this.headerActions) {
      return;
    }
    if (isPhoneLayout(this.layoutService)) {
      this.headerRow.classList.toggle("phone-layout-empty", !this.isFindWidgetOpen);
      return;
    }
    if (this.isFindWidgetOpen) {
      this.headerLabel.style.display = "none";
      this.headerActions.style.display = "none";
      return;
    }
    this.headerLabel.style.display = "";
    this.headerActions.style.display = "";
  }
  /**
   * Phone-only: present a bottom sheet with the four sort/group toggles.
   * Filtering on phone is performed via the status filter chips, so the
   * sheet intentionally omits "Filter", "Show Recent/All Sessions", and
   * "Collapse All Groups" actions found in the desktop submenu.
   */
  openSortGroupSheet() {
    const sortTitle = localize("sortGroupSheet.sort", "Sort");
    const groupTitle = localize("sortGroupSheet.group", "Group");
    const items = [
      {
        id: SessionsSorting.Created,
        label: localize("sortByCreated", "Sort by Created"),
        checked: this.currentSorting === SessionsSorting.Created,
        group: "sort",
        groupTitle: sortTitle
      },
      {
        id: SessionsSorting.Updated,
        label: localize("sortByUpdated", "Sort by Updated"),
        checked: this.currentSorting === SessionsSorting.Updated,
        group: "sort"
      },
      {
        id: SessionsGrouping.Workspace,
        label: localize("groupByWorkspace", "Group by Workspace"),
        checked: this.currentGrouping === SessionsGrouping.Workspace,
        group: "group",
        groupTitle
      },
      {
        id: SessionsGrouping.Date,
        label: localize("groupByTime", "Group by Time"),
        checked: this.currentGrouping === SessionsGrouping.Date,
        group: "group"
      }
    ];
    showMobileSortGroupSheet(this.layoutService.mainContainer, localize("sortGroupSheet.title", "Sort"), items).then((selectedId) => {
      if (!selectedId) {
        return;
      }
      if (selectedId === SessionsSorting.Created || selectedId === SessionsSorting.Updated) {
        this.setSorting(selectedId);
      } else if (selectedId === SessionsGrouping.Workspace || selectedId === SessionsGrouping.Date) {
        this.setGrouping(selectedId);
      }
    });
  }
  setGrouping(grouping) {
    if (this.currentGrouping === grouping) {
      return;
    }
    this.currentGrouping = grouping;
    this.storageService.store(GROUPING_STORAGE_KEY, this.currentGrouping, StorageScope.PROFILE, StorageTarget.USER);
    this.groupingContextKey?.set(this.currentGrouping);
    this.sessionsControl?.resetSectionCollapseState();
    this.sessionsControl?.update(true);
  }
  setSorting(sorting) {
    if (this.currentSorting === sorting) {
      return;
    }
    this.currentSorting = sorting;
    this.storageService.store(SORTING_STORAGE_KEY, this.currentSorting, StorageScope.PROFILE, StorageTarget.USER);
    this.sortingContextKey?.set(this.currentSorting);
    this.sessionsControl?.update();
  }
};
SessionsView = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ISessionsManagementService),
  __decorateParam(11, ISessionsService),
  __decorateParam(12, IHostService),
  __decorateParam(13, IWorkbenchLayoutService),
  __decorateParam(14, IStorageService)
], SessionsView);
export {
  IsWorkspaceGroupCappedContext,
  SessionsView,
  SessionsViewFilterOptionsSubMenu,
  SessionsViewFilterSubMenu,
  SessionsViewGroupingContext,
  SessionsViewId,
  SessionsViewSortingContext,
  openSessionToTheSide
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvc2Vzc2lvbnMvYnJvd3Nlci92aWV3cy9zZXNzaW9uc1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4uL21lZGlhL3Nlc3Npb25zVmlld1BhbmUuY3NzJztcbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSVZpZXcsIFNpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld1BhbmVPcHRpb25zLCBJVmlld1BhbmVMb2NhdGlvbkNvbG9ycywgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFNlc3Npb25zTGlzdCwgU2Vzc2lvbnNHcm91cGluZywgU2Vzc2lvbnNTb3J0aW5nIH0gZnJvbSAnLi9zZXNzaW9uc0xpc3QuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25TaG9ydGN1dHNXaWRnZXQgfSBmcm9tICcuLi9haUN1c3RvbWl6YXRpb25TaG9ydGN1dHNXaWRnZXQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2hvcnRjdXRzV2lkZ2V0IH0gZnJvbSAnLi4vYWdlbnRIb3N0U2hvcnRjdXRzV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhZ2VudHNCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUEFORUxfU0VDVElPTl9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5pbXBvcnQgeyBNb2JpbGVTZXNzaW9uRmlsdGVyQ2hpcHMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL21vYmlsZS9tb2JpbGVTZXNzaW9uRmlsdGVyQ2hpcHMuanMnO1xuaW1wb3J0IHsgSU1vYmlsZVNvcnRHcm91cFNoZWV0SXRlbSwgc2hvd01vYmlsZVNvcnRHcm91cFNoZWV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9tb2JpbGUvbW9iaWxlU29ydEdyb3VwU2hlZXQuanMnO1xuaW1wb3J0IHsgaXNQaG9uZUxheW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvbW9iaWxlL21vYmlsZUxheW91dC5qcyc7XG5pbXBvcnQgeyBJc1Bob25lTGF5b3V0Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0ICQgPSBET00uJDtcbmV4cG9ydCBjb25zdCBTZXNzaW9uc1ZpZXdJZCA9ICdzZXNzaW9ucy53b3JrYmVuY2gudmlldy5zZXNzaW9uc1ZpZXcnO1xuY29uc3QgR1JPVVBJTkdfU1RPUkFHRV9LRVkgPSAnc2Vzc2lvbnNWaWV3UGFuZS5ncm91cGluZyc7XG5jb25zdCBTT1JUSU5HX1NUT1JBR0VfS0VZID0gJ3Nlc3Npb25zVmlld1BhbmUuc29ydGluZyc7XG5jb25zdCBDVVNUT01JWkFUSU9OU19NSU5fSEVJR0hUID0gMTI5O1xuY29uc3QgU0VTU0lPTlNfU0VDVElPTl9NSU5fSEVJR0hUID0gMTIwO1xuXG4vKipcbiAqIFBsYWNlIHRoZSBnaXZlbiBzZXNzaW9uIGluIHRoZSBzZXNzaW9ucyBncmlkIHRvIHRoZSByaWdodCBvZiB0aGUgbGFzdFxuICogY3VycmVudGx5LXZpc2libGUgc2Vzc2lvbiAoYXMgYSBub24tc3RpY2t5IGVudHJ5KSBhbmQgbWFrZSBpdCBhY3RpdmUuIElmXG4gKiB0aGUgc2Vzc2lvbiBpcyBhbHJlYWR5IHRoZSBsYXN0IHZpc2libGUgb25lLCB0aGlzIGlzIGEgbm8tb3AgYXNpZGUgZnJvbVxuICogYWN0aXZhdGlvbi5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG9wZW5TZXNzaW9uVG9UaGVTaWRlKHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZSwgc2Vzc2lvbjogSVNlc3Npb24sIG9wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgdmlzaWJsZSA9IHNlc3Npb25zU2VydmljZS52aXNpYmxlU2Vzc2lvbnMuZ2V0KCk7XG5cdGNvbnN0IGxhc3RWaXNpYmxlID0gdmlzaWJsZVt2aXNpYmxlLmxlbmd0aCAtIDFdO1xuXHRpZiAobGFzdFZpc2libGUgJiYgbGFzdFZpc2libGUuc2Vzc2lvbklkICE9PSBzZXNzaW9uLnNlc3Npb25JZCkge1xuXHRcdHNlc3Npb25zU2VydmljZS5pbnNlcnRBdChzZXNzaW9uLCBsYXN0VmlzaWJsZS5zZXNzaW9uSWQsICdyaWdodCcpO1xuXHR9XG5cdGF3YWl0IHNlc3Npb25zU2VydmljZS5vcGVuU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlLCBvcHRpb25zKTtcbn1cblxuZXhwb3J0IGNvbnN0IFNlc3Npb25zVmlld0ZpbHRlclN1Yk1lbnUgPSBuZXcgTWVudUlkKCdTZXNzaW9uc1ZpZXdQYW5lRmlsdGVyU3ViTWVudScpO1xuZXhwb3J0IGNvbnN0IFNlc3Npb25zVmlld0ZpbHRlck9wdGlvbnNTdWJNZW51ID0gbmV3IE1lbnVJZCgnU2Vzc2lvbnNWaWV3UGFuZUZpbHRlck9wdGlvbnNTdWJNZW51Jyk7XG5leHBvcnQgY29uc3QgU2Vzc2lvbnNWaWV3R3JvdXBpbmdDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignc2Vzc2lvbnNWaWV3UGFuZS5ncm91cGluZycsIFNlc3Npb25zR3JvdXBpbmcuV29ya3NwYWNlKTtcbmV4cG9ydCBjb25zdCBTZXNzaW9uc1ZpZXdTb3J0aW5nQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PHN0cmluZz4oJ3Nlc3Npb25zVmlld1BhbmUuc29ydGluZycsIFNlc3Npb25zU29ydGluZy5DcmVhdGVkKTtcbmV4cG9ydCBjb25zdCBJc1dvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uc1ZpZXdQYW5lLndvcmtzcGFjZUdyb3VwQ2FwcGVkJywgdHJ1ZSk7XG5cbmV4cG9ydCBjbGFzcyBTZXNzaW9uc1ZpZXcgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cblx0cHJpdmF0ZSB2aWV3UGFuZUNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2lkZWJhclNwbGl0VmlldzogU3BsaXRWaWV3IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zQ29udHJvbENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZmluZFdpZGdldENvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVhZGVyUm93OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBoZWFkZXJMYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaGVhZGVyQWN0aW9uczogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgaXNGaW5kV2lkZ2V0T3BlbiA9IGZhbHNlO1xuXHRzZXNzaW9uc0NvbnRyb2w6IFNlc3Npb25zTGlzdCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VzdG9taXphdGlvbnNXaWRnZXQ6IEFJQ3VzdG9taXphdGlvblNob3J0Y3V0c1dpZGdldCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50R3JvdXBpbmc6IFNlc3Npb25zR3JvdXBpbmcgPSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZTtcblx0cHJpdmF0ZSBjdXJyZW50U29ydGluZzogU2Vzc2lvbnNTb3J0aW5nID0gU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQ7XG5cdHByaXZhdGUgZ3JvdXBpbmdDb250ZXh0S2V5OiBJQ29udGV4dEtleSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBzb3J0aW5nQ29udGV4dEtleTogSUNvbnRleHRLZXkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgd29ya3NwYWNlR3JvdXBDYXBwZWRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJDb250ZXh0S2V5cyA9IG5ldyBNYXA8c3RyaW5nLCB7IGtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47IGdldERlZmF1bHQ6ICgpID0+IGJvb2xlYW4gfT4oKTtcblx0cHJpdmF0ZSBjdXJyZW50Qm9keUhlaWdodCA9IDA7XG5cdHByaXZhdGUgY3VycmVudEJvZHlXaWR0aCA9IDA7XG5cdHByaXZhdGUgZGlkSW5pdGlhbGl6ZVBhbmVTaXplcyA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVzdG9yZSBwZXJzaXN0ZWQgZ3JvdXBpbmdcblx0XHRjb25zdCBzdG9yZWRHcm91cGluZyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEdST1VQSU5HX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKHN0b3JlZEdyb3VwaW5nICYmIE9iamVjdC52YWx1ZXMoU2Vzc2lvbnNHcm91cGluZykuaW5jbHVkZXMoc3RvcmVkR3JvdXBpbmcgYXMgU2Vzc2lvbnNHcm91cGluZykpIHtcblx0XHRcdHRoaXMuY3VycmVudEdyb3VwaW5nID0gc3RvcmVkR3JvdXBpbmcgYXMgU2Vzc2lvbnNHcm91cGluZztcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIHBlcnNpc3RlZCBzb3J0aW5nXG5cdFx0Y29uc3Qgc3RvcmVkU29ydGluZyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFNPUlRJTkdfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoc3RvcmVkU29ydGluZyAmJiBPYmplY3QudmFsdWVzKFNlc3Npb25zU29ydGluZykuaW5jbHVkZXMoc3RvcmVkU29ydGluZyBhcyBTZXNzaW9uc1NvcnRpbmcpKSB7XG5cdFx0XHR0aGlzLmN1cnJlbnRTb3J0aW5nID0gc3RvcmVkU29ydGluZyBhcyBTZXNzaW9uc1NvcnRpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gRW5zdXJlIGNvbnRleHQga2V5cyByZWZsZWN0IHJlc3RvcmVkIHN0YXRlIGltbWVkaWF0ZWx5XG5cdFx0dGhpcy5ncm91cGluZ0NvbnRleHRLZXkgPSBTZXNzaW9uc1ZpZXdHcm91cGluZ0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmdyb3VwaW5nQ29udGV4dEtleS5zZXQodGhpcy5jdXJyZW50R3JvdXBpbmcpO1xuXHRcdHRoaXMuc29ydGluZ0NvbnRleHRLZXkgPSBTZXNzaW9uc1ZpZXdTb3J0aW5nQ29udGV4dC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc29ydGluZ0NvbnRleHRLZXkuc2V0KHRoaXMuY3VycmVudFNvcnRpbmcpO1xuXG5cdFx0Ly8gQmluZCB3b3Jrc3BhY2UgZ3JvdXAgY2FwcGVkIGNvbnRleHQga2V5ICh3aWxsIGJlIHN5bmNlZCB3aXRoIHBlcnNpc3RlZCBzdGF0ZSBpbiByZW5kZXJCb2R5KVxuXHRcdHRoaXMud29ya3NwYWNlR3JvdXBDYXBwZWRDb250ZXh0S2V5ID0gSXNXb3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KHBhcmVudCk7XG5cblx0XHR0aGlzLnZpZXdQYW5lQ29udGFpbmVyID0gcGFyZW50O1xuXHRcdHRoaXMudmlld1BhbmVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYWdlbnQtc2Vzc2lvbnMtdmlld3BhbmUnKTtcblxuXHRcdHRoaXMuY3JlYXRlQ29udHJvbHMocGFyZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCk6IElWaWV3UGFuZUxvY2F0aW9uQ29sb3JzIHtcblx0XHRjb25zdCBjb2xvcnMgPSBzdXBlci5nZXRMb2NhdGlvbkJhc2VkQ29sb3JzKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbG9ycyxcblx0XHRcdGJhY2tncm91bmQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRsaXN0T3ZlcnJpZGVTdHlsZXM6IHtcblx0XHRcdFx0Li4uY29sb3JzLmxpc3RPdmVycmlkZVN0eWxlcyxcblx0XHRcdFx0bGlzdEJhY2tncm91bmQ6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHRyZWVTdGlja3lTY3JvbGxCYWNrZ3JvdW5kOiBhZ2VudHNCYWNrZ3JvdW5kLFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbnRyb2xzKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuYWdlbnQtc2Vzc2lvbnMtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lciA9IERPTS5hcHBlbmQoc2Vzc2lvbnNDb250YWluZXIsICQoJy5hZ2VudC1zZXNzaW9ucy1zaWRlYmFyLXNwbGl0dmlldy1jb250YWluZXInKSk7XG5cblx0XHQvLyBTZXNzaW9ucyBzZWN0aW9uICh0b3AsIGZpbGxzIGF2YWlsYWJsZSBzcGFjZSlcblx0XHRjb25zdCBzZXNzaW9uc1NlY3Rpb24gPSBET00uYXBwZW5kKHRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lciwgJCgnLmFnZW50LXNlc3Npb25zLXNlY3Rpb24nKSk7XG5cblx0XHQvLyBTZXNzaW9ucyBjb250ZW50IGNvbnRhaW5lclxuXHRcdGNvbnN0IHNlc3Npb25zQ29udGVudCA9IERPTS5hcHBlbmQoc2Vzc2lvbnNTZWN0aW9uLCAkKCcuYWdlbnQtc2Vzc2lvbnMtY29udGVudCcpKTtcblxuXHRcdC8vIEhlYWRlciByb3c6IFwiU2Vzc2lvbnNcIiBsYWJlbCAobGVmdCkgKyBjb21wYWN0IFwiTmV3XCIgYnV0dG9uIChyaWdodClcblx0XHRjb25zdCBoZWFkZXJSb3cgPSB0aGlzLmhlYWRlclJvdyA9IERPTS5hcHBlbmQoc2Vzc2lvbnNDb250ZW50LCAkKCcuYWdlbnQtc2Vzc2lvbnMtaGVhZGVyLXJvdycpKTtcblx0XHRjb25zdCBoZWFkZXJMYWJlbCA9IHRoaXMuaGVhZGVyTGFiZWwgPSBET00uYXBwZW5kKGhlYWRlclJvdywgJCgnLmFnZW50LXNlc3Npb25zLWhlYWRlci1sYWJlbCcpKTtcblxuXHRcdGNvbnN0IGhlYWRlckFjdGlvbnMgPSB0aGlzLmhlYWRlckFjdGlvbnMgPSBET00uYXBwZW5kKGhlYWRlclJvdywgJCgnLmFnZW50LXNlc3Npb25zLWhlYWRlci1hY3Rpb25zJykpO1xuXG5cdFx0Ly8gT24gcGhvbmUsIHRoZSBkZXNrdG9wIGhlYWRlciBjb250ZW50IChsYWJlbCArIG5ldyBidXR0b24gKyBmaWx0ZXIvZmluZCB0b29sYmFyKVxuXHRcdC8vIGlzIGhpZGRlbiBpbiBmYXZvciBvZiB0aGUgbW9iaWxlIGZpbHRlciBjaGlwIHJvdyArIHRoZSAoKykgYnV0dG9uIGluIHRoZVxuXHRcdC8vIE1vYmlsZVRpdGxlYmFyUGFydC4gV2Ugc3RpbGwgY3JlYXRlIHRoZSByb3cgY29udGFpbmVyIGJlY2F1c2UgdGhlIGZpbmRcblx0XHQvLyB3aWRnZXQgbW91bnRzIGluc2lkZSBpdC5cblx0XHRjb25zdCBwaG9uZUxheW91dCA9IGlzUGhvbmVMYXlvdXQodGhpcy5sYXlvdXRTZXJ2aWNlKTtcblx0XHRpZiAoIXBob25lTGF5b3V0KSB7XG5cdFx0XHRoZWFkZXJMYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzZXNzaW9uc0hlYWRlcicsIFwiU2Vzc2lvbnNcIik7XG5cblx0XHRcdC8vIEhlYWRlciBhY3Rpb25zICh2aXN1YWwgb3JkZXI6IE5ldywgRmlsdGVyLCBTZWFyY2gpLiBUaGUgXCJOZXdcIiBidXR0b24gaXNcblx0XHRcdC8vIGNvbnRyaWJ1dGVkIHRvIE1lbnVzLlNpZGViYXJTZXNzaW9uc0hlYWRlciBhbmQgcmVuZGVyZWQgYXMgYSBjb21wYWN0IHBpbGxcblx0XHRcdC8vIGJ5IE5ld1Nlc3Npb25BY3Rpb25WaWV3SXRlbS5cblx0XHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgaGVhZGVyQWN0aW9ucywgTWVudXMuU2lkZWJhclNlc3Npb25zSGVhZGVyLCB7XG5cdFx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdFx0dGVsZW1ldHJ5U291cmNlOiAnc2Vzc2lvbnNWaWV3LmhlYWRlcicsXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRoZWFkZXJSb3cuY2xhc3NMaXN0LmFkZCgncGhvbmUtbGF5b3V0LWVtcHR5Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gQ29udGFpbmVyIGZvciB0aGUgdHJlZSdzIGZpbmQgd2lkZ2V0ICh0b2dnbGVkIGJ5IHRoZSB0b29sYmFyJ3MgRmluZCBhY3Rpb24pXG5cdFx0Y29uc3QgZmluZFdpZGdldENvbnRhaW5lciA9IHRoaXMuZmluZFdpZGdldENvbnRhaW5lciA9IERPTS5hcHBlbmQoaGVhZGVyUm93LCAkKCcuYWdlbnQtc2Vzc2lvbnMtZmluZC13aWRnZXQtY29udGFpbmVyJykpO1xuXHRcdGZpbmRXaWRnZXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblxuXHRcdC8vIFJlc2VydmUgRE9NIHNsb3QgZm9yIG1vYmlsZSBmaWx0ZXIgY2hpcHMgKHBob25lIGxheW91dCBvbmx5KS5cblx0XHQvLyBUaGUgYWN0dWFsIHdpZGdldCBpcyBjcmVhdGVkIGFmdGVyIHNlc3Npb25zQ29udHJvbCBpcyBhdmFpbGFibGUuXG5cdFx0Y29uc3QgZmlsdGVyQ2hpcHNDb250YWluZXIgPSBpc1Bob25lTGF5b3V0KHRoaXMubGF5b3V0U2VydmljZSlcblx0XHRcdD8gRE9NLmFwcGVuZChzZXNzaW9uc0NvbnRlbnQsICQoJy5tb2JpbGUtc2Vzc2lvbi1maWx0ZXItY2hpcHMtc2xvdCcpKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHQvLyBTZXNzaW9ucyBMaXN0IENvbnRyb2xcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lciA9IERPTS5hcHBlbmQoc2Vzc2lvbnNDb250ZW50LCAkKCcuYWdlbnQtc2Vzc2lvbnMtY29udHJvbC1jb250YWluZXInKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNDb250cm9sID0gdGhpcy5zZXNzaW9uc0NvbnRyb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTGlzdCwgdGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIsIHtcblx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRncm91cGluZzogKCkgPT4gdGhpcy5jdXJyZW50R3JvdXBpbmcsXG5cdFx0XHRzb3J0aW5nOiAoKSA9PiB0aGlzLmN1cnJlbnRTb3J0aW5nLFxuXHRcdFx0ZmluZFdpZGdldENvbnRhaW5lcixcblx0XHRcdG9uU2Vzc2lvbk9wZW46IChyZXNvdXJjZSwgcHJlc2VydmVGb2N1cywgc2lkZUJ5U2lkZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBvbk9wZW5lZCA9ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoaXNXZWIgJiYgaXNQaG9uZUxheW91dCh0aGlzLmxheW91dFNlcnZpY2UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKHNpZGVCeVNpZGUpIHtcblx0XHRcdFx0XHQvLyBBbHQtY2xpY2s6IG9wZW4gdGhlIHNlc3Npb24gdG8gdGhlIHJpZ2h0IG9mIHRoZSBsYXN0IHZpc2libGUgc2Vzc2lvbiBpbiB0aGUgZ3JpZC5cblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldFNlc3Npb24ocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uKSB7XG5cdFx0XHRcdFx0XHRvcGVuU2Vzc2lvblRvVGhlU2lkZSh0aGlzLnNlc3Npb25zU2VydmljZSwgc2Vzc2lvbiwgeyBwcmVzZXJ2ZUZvY3VzIH0pLnRoZW4ob25PcGVuZWQpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zZXNzaW9uc1NlcnZpY2Uub3BlblNlc3Npb24ocmVzb3VyY2UsIHsgcHJlc2VydmVGb2N1cyB9KS50aGVuKG9uT3BlbmVkKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkodmlzaWJsZSA9PiBzZXNzaW9uc0NvbnRyb2wuc2V0VmlzaWJsZSh2aXNpYmxlKSkpO1xuXG5cdFx0Ly8gVG9nZ2xlIGhlYWRlciBsYWJlbC9hY3Rpb25zIHZpc2liaWxpdHkgd2hlbiBmaW5kIHdpZGdldCBvcGVucy9jbG9zZXNcblx0XHR0aGlzLl9yZWdpc3RlcihzZXNzaW9uc0NvbnRyb2wub25EaWRDaGFuZ2VGaW5kT3BlblN0YXRlKG9wZW4gPT4ge1xuXHRcdFx0dGhpcy5pc0ZpbmRXaWRnZXRPcGVuID0gb3Blbjtcblx0XHRcdGZpbmRXaWRnZXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9IG9wZW4gPyAnJyA6ICdub25lJztcblx0XHRcdHRoaXMudXBkYXRlSGVhZGVyTGF5b3V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2xvc2UgZmluZCB3aWRnZXQgb24gRXNjYXBlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihmaW5kV2lkZ2V0Q29udGFpbmVyLCAna2V5ZG93bicsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbG9zZUZpbmQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBTeW5jIHdvcmtzcGFjZSBncm91cCBjYXBwZWQgY29udGV4dCBrZXkgd2l0aCBwZXJzaXN0ZWQgc3RhdGVcblx0XHR0aGlzLndvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dEtleT8uc2V0KHNlc3Npb25zQ29udHJvbC5pc1dvcmtzcGFjZUdyb3VwQ2FwcGVkKCkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgc2Vzc2lvbiB0eXBlIGZpbHRlciBhY3Rpb25zIChyZS1yZWdpc3RlciB3aGVuIHNlc3Npb24gdHlwZXMgY2hhbmdlKVxuXHRcdHRoaXMucmVnaXN0ZXJTZXNzaW9uVHlwZUZpbHRlcnMoc2Vzc2lvbnNDb250cm9sKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5yZWdpc3RlclNlc3Npb25UeXBlRmlsdGVycyhzZXNzaW9uc0NvbnRyb2wpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIHN0YXR1cyBmaWx0ZXIgYWN0aW9ucyAoc3RhdGljIHNldCwgcmVnaXN0ZXJlZCBvbmNlKVxuXHRcdHRoaXMucmVnaXN0ZXJTdGF0dXNGaWx0ZXJzKHNlc3Npb25zQ29udHJvbCk7XG5cblx0XHQvLyBSZWZyZXNoIHNlc3Npb25zIHdoZW4gd2luZG93IGdldHMgZm9jdXMgdG8gY29tcGVuc2F0ZSBmb3IgbWlzc2luZyBldmVudHNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXMoaGFzRm9jdXMgPT4ge1xuXHRcdFx0aWYgKGhhc0ZvY3VzKSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5yZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIGxpc3QgdXBkYXRlcyBhbmQgcmVzdG9yZSBzZWxlY3Rpb24gaWYgbm90aGluZyBpcyBzZWxlY3RlZFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHNlc3Npb25zQ29udHJvbC5vbkRpZFVwZGF0ZSgoKSA9PiB7XG5cdFx0XHRpZiAoIXNlc3Npb25zQ29udHJvbC5oYXNGb2N1c09yU2VsZWN0aW9uKCkpIHtcblx0XHRcdFx0dGhpcy5yZXN0b3JlTGFzdFNlbGVjdGVkU2Vzc2lvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIE1vYmlsZSBmaWx0ZXIgY2hpcHMgKHBob25lIGxheW91dCBvbmx5KSBcdTIwMTQgY3JlYXRlZCBhZnRlciBzZXNzaW9uc0NvbnRyb2xcblx0XHQvLyBzbyB3ZSBjYW4gd2lyZSBpdCBhcyB0aGUgZmlsdGVyIGhvc3QuXG5cdFx0aWYgKGZpbHRlckNoaXBzQ29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBjaGlwcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNb2JpbGVTZXNzaW9uRmlsdGVyQ2hpcHMoZmlsdGVyQ2hpcHNDb250YWluZXIsIHNlc3Npb25zQ29udHJvbCkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY2hpcHMub25EaWRSZXF1ZXN0U29ydEdyb3VwKCgpID0+IHtcblx0XHRcdFx0dGhpcy5vcGVuU29ydEdyb3VwU2hlZXQoKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGNoaXBzLm9uRGlkUmVxdWVzdEZpbmQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9wZW5GaW5kKCk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiB0aGUgYWN0aXZlIHNlc3Npb24gY2hhbmdlcywgcmV2ZWFsIGl0IGluIHRoZSBzZXNzaW9ucyBsaXN0LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSB0aGlzLnNlc3Npb25zU2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdGlmICghc2Vzc2lvbnNDb250cm9sLnJldmVhbChhY3RpdmVTZXNzaW9uLnJlc291cmNlKSkge1xuXHRcdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbGVhckZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5jbGVhckZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnNTZWN0aW9uID0gRE9NLmFwcGVuZCh0aGlzLnNpZGViYXJTcGxpdFZpZXdDb250YWluZXIsICQoJy5hZ2VudC1zZXNzaW9ucy1jdXN0b21pemF0aW9ucy1zZWN0aW9uJykpO1xuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zU2l6ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnNXaWRnZXQgPSB0aGlzLl9jdXN0b21pemF0aW9uc1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uU2hvcnRjdXRzV2lkZ2V0LCBjdXN0b21pemF0aW9uc1NlY3Rpb24sIHtcblx0XHRcdG9uRGlkQ2hhbmdlTGF5b3V0OiAoKSA9PiB7XG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zU2l6ZUNoYW5nZS5maXJlKCk7XG5cdFx0XHRcdHRoaXMubGF5b3V0U2lkZWJhclNwbGl0VmlldygpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLnNpZGViYXJTcGxpdFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3BsaXRWaWV3KHRoaXMuc2lkZWJhclNwbGl0Vmlld0NvbnRhaW5lciwge1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0cHJvcG9ydGlvbmFsTGF5b3V0OiBmYWxzZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXNzaW9uc1BhbmU6IElWaWV3ID0ge1xuXHRcdFx0ZWxlbWVudDogc2Vzc2lvbnNTZWN0aW9uLFxuXHRcdFx0bWluaW11bVNpemU6IFNFU1NJT05TX1NFQ1RJT05fTUlOX0hFSUdIVCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGxheW91dDogaGVpZ2h0ID0+IHtcblx0XHRcdFx0c2Vzc2lvbnNTZWN0aW9uLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5sYXlvdXQodGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXI/Lm9mZnNldEhlaWdodCA/PyAwLCB0aGlzLmN1cnJlbnRCb2R5V2lkdGgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnNQYW5lOiBJVmlldyA9IHtcblx0XHRcdGVsZW1lbnQ6IGN1c3RvbWl6YXRpb25zU2VjdGlvbixcblx0XHRcdGdldCBtaW5pbXVtU2l6ZSgpIHsgcmV0dXJuIGN1c3RvbWl6YXRpb25zV2lkZ2V0LmNvbGxhcHNlZCA/IGN1c3RvbWl6YXRpb25zV2lkZ2V0LmNvbGxhcHNlZEhlaWdodCA6IENVU1RPTUlaQVRJT05TX01JTl9IRUlHSFQ7IH0sXG5cdFx0XHRnZXQgbWF4aW11bVNpemUoKSB7IHJldHVybiBjdXN0b21pemF0aW9uc1dpZGdldC5jb2xsYXBzZWQgPyBjdXN0b21pemF0aW9uc1dpZGdldC5jb2xsYXBzZWRIZWlnaHQgOiBNYXRoLm1heChDVVNUT01JWkFUSU9OU19NSU5fSEVJR0hULCBjdXN0b21pemF0aW9uc1dpZGdldC5kZXNpcmVkSGVpZ2h0KTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5tYXAoRXZlbnQuYW55KGN1c3RvbWl6YXRpb25zV2lkZ2V0Lm9uRGlkQ2hhbmdlSGVpZ2h0LCBjdXN0b21pemF0aW9uc1NpemVDaGFuZ2UuZXZlbnQpLCAoKSA9PiB0aGlzLmdldEN1c3RvbWl6YXRpb25zUGFuZUhlaWdodCgpKSxcblx0XHRcdGxheW91dDogaGVpZ2h0ID0+IHtcblx0XHRcdFx0Y3VzdG9taXphdGlvbnNTZWN0aW9uLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdFx0XHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zV2lkZ2V0Py5sYXlvdXQoaGVpZ2h0LCB0aGlzLmN1cnJlbnRCb2R5V2lkdGgpO1xuXHRcdFx0fSxcblx0XHR9O1xuXG5cdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LmFkZFZpZXcoc2Vzc2lvbnNQYW5lLCBTaXppbmcuRGlzdHJpYnV0ZSwgMCwgdHJ1ZSk7XG5cdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LmFkZFZpZXcoY3VzdG9taXphdGlvbnNQYW5lLCB0aGlzLmdldEN1c3RvbWl6YXRpb25zUGFuZUhlaWdodCgpLCAxLCB0cnVlKTtcblxuXHRcdGxldCBzYXZlZEN1c3RvbWl6YXRpb25zUGFuZUhlaWdodCA9IHRoaXMuZ2V0Q3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY3VzdG9taXphdGlvbnNXaWRnZXQub25EaWRUb2dnbGVDb2xsYXBzZWQoY29sbGFwc2VkID0+IHtcblx0XHRcdGlmICghdGhpcy5zaWRlYmFyU3BsaXRWaWV3KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChjb2xsYXBzZWQpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFNpemUgPSB0aGlzLnNpZGViYXJTcGxpdFZpZXcuZ2V0Vmlld1NpemUoMSk7XG5cdFx0XHRcdGlmIChjdXJyZW50U2l6ZSA+IGN1c3RvbWl6YXRpb25zV2lkZ2V0LmNvbGxhcHNlZEhlaWdodCkge1xuXHRcdFx0XHRcdHNhdmVkQ3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0ID0gY3VycmVudFNpemU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LnJlc2l6ZVZpZXcoMSwgY3VzdG9taXphdGlvbnNXaWRnZXQuY29sbGFwc2VkSGVpZ2h0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlldy5yZXNpemVWaWV3KDEsIHNhdmVkQ3VzdG9taXphdGlvbnNQYW5lSGVpZ2h0KTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGF5b3V0U2lkZWJhclNwbGl0VmlldygpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVNwbGl0Vmlld1N0eWxlcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLmdldENvbG9yKFBBTkVMX1NFQ1RJT05fQk9SREVSKTtcblx0XHRcdHRoaXMuc2lkZWJhclNwbGl0Vmlldz8uc3R5bGUoeyBzZXBhcmF0b3JCb3JkZXI6IGJvcmRlckNvbG9yID8/IENvbG9yLnRyYW5zcGFyZW50IH0pO1xuXHRcdH07XG5cdFx0dXBkYXRlU3BsaXRWaWV3U3R5bGVzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKHVwZGF0ZVNwbGl0Vmlld1N0eWxlcykpO1xuXG5cdFx0Ly8gQWdlbnQgSG9zdCB0b29sYmFyIChib3R0b20sIGJlbG93IGN1c3RvbWl6YXRpb25zKS4gT25seSByZW5kZXJlZFxuXHRcdC8vIGluIHRoZSBzZXNzaW9ucyB3aW5kb3cgb24gd2ViIGRlc2t0b3AgbGF5b3V0czogZWxlY3Ryb24gaGFzIG5vXG5cdFx0Ly8gaG9zdCBwaWNrZXIgdG9kYXkgKGdhdGVkIG91dCBhdCB0aGUgbWVudSBsZXZlbCksIHBob25lIGxheW91dFxuXHRcdC8vIHVzZXMgdGhlIG1vYmlsZSB0aXRsZWJhciBwaWxsIGluc3RlYWQsIGFuZCBhdXhpbGlhcnkgd2luZG93cyBkb1xuXHRcdC8vIG5vdCBjb250cmlidXRlIGFueSBob3N0IGFjdGlvbnMgXHUyMDE0IHdpdGhvdXQgdGhpcyBnYXRlIHRoZXkgd291bGRcblx0XHQvLyBzaG93IGFuIGVtcHR5IHRvb2xiYXIgc2hlbGwuXG5cdFx0aWYgKGlzV2ViICYmIHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dCxcblx0XHRcdElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdElzUGhvbmVMYXlvdXRDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdCkpKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNob3J0Y3V0c1dpZGdldCwgc2Vzc2lvbnNDb250YWluZXIsIHtcblx0XHRcdFx0b25EaWRDaGFuZ2VMYXlvdXQ6ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmxheW91dFNpZGViYXJTcGxpdFZpZXcoKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihET00uc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShET00uZ2V0V2luZG93KHBhcmVudCksICgpID0+IHRoaXMubGF5b3V0U2lkZWJhclNwbGl0VmlldygpKSk7XG5cdH1cblxuXHRmb2N1c0N1c3RvbWl6YXRpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25zV2lkZ2V0Py5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlTGFzdFNlbGVjdGVkU2Vzc2lvbigpOiB2b2lkIHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5zZXNzaW9uc1NlcnZpY2UuYWN0aXZlU2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoYWN0aXZlU2Vzc2lvbiAmJiB0aGlzLnNlc3Npb25zQ29udHJvbCkge1xuXHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wucmV2ZWFsKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgcmVnaXN0ZXJlZEZpbHRlclR5cGVJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlZ2lzdGVyU2Vzc2lvblR5cGVGaWx0ZXJzKHNlc3Npb25zQ29udHJvbDogU2Vzc2lvbnNMaXN0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVzID0gdGhpcy5zZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmdldEFsbFNlc3Npb25UeXBlcygpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2Vzc2lvblR5cGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB0eXBlID0gc2Vzc2lvblR5cGVzW2ldO1xuXG5cdFx0XHQvLyBTa2lwIGlmIGFscmVhZHkgcmVnaXN0ZXJlZCAoYWN0aW9uIElEcyBhcmUgZ2xvYmFsIGFuZCBjYW4ndCBiZSByZS1yZWdpc3RlcmVkKVxuXHRcdFx0aWYgKHRoaXMucmVnaXN0ZXJlZEZpbHRlclR5cGVJZHMuaGFzKHR5cGUuaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5yZWdpc3RlcmVkRmlsdGVyVHlwZUlkcy5hZGQodHlwZS5pZCk7XG5cblx0XHRcdGNvbnN0IGNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihgc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXJUeXBlLiR7dHlwZS5pZH1gLCAhc2Vzc2lvbnNDb250cm9sLmlzU2Vzc2lvblR5cGVFeGNsdWRlZCh0eXBlLmlkKSk7XG5cdFx0XHRjb25zdCBjb250ZXh0S2V5SW5zdGFuY2UgPSBjb250ZXh0S2V5LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdHRoaXMuZmlsdGVyQ29udGV4dEtleXMuc2V0KGNvbnRleHRLZXkua2V5LCB7IGtleTogY29udGV4dEtleUluc3RhbmNlLCBnZXREZWZhdWx0OiAoKSA9PiB0cnVlIH0pO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGBzZXNzaW9uc1ZpZXdQYW5lLmZpbHRlclR5cGUuJHt0eXBlLmlkfWAsXG5cdFx0XHRcdFx0XHR0aXRsZTogdHlwZS5sYWJlbCxcblx0XHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhjb250ZXh0S2V5LmtleSwgdHJ1ZSksXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogU2Vzc2lvbnNWaWV3RmlsdGVyT3B0aW9uc1N1Yk1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMV90eXBlcycsXG5cdFx0XHRcdFx0XHRcdG9yZGVyOiBpLFxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBydW4oKSB7XG5cdFx0XHRcdFx0Y29uc3QgaXNFeGNsdWRlZCA9IHNlc3Npb25zQ29udHJvbC5pc1Nlc3Npb25UeXBlRXhjbHVkZWQodHlwZS5pZCk7XG5cdFx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnNldFNlc3Npb25UeXBlRXhjbHVkZWQodHlwZS5pZCwgIWlzRXhjbHVkZWQpO1xuXHRcdFx0XHRcdGNvbnRleHRLZXlJbnN0YW5jZS5zZXQoaXNFeGNsdWRlZCk7IC8vIHdhcyBleGNsdWRlZCwgbm93IGluY2x1ZGVkICh0b2dnbGUpXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU3RhdHVzRmlsdGVycyhzZXNzaW9uc0NvbnRyb2w6IFNlc3Npb25zTGlzdCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXR1c0ZpbHRlcnM6IHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzOyBsYWJlbDogc3RyaW5nIH1bXSA9IFtcblx0XHRcdHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgbGFiZWw6IGxvY2FsaXplKCdzdGF0dXNDb21wbGV0ZWQnLCBcIkNvbXBsZXRlZFwiKSB9LFxuXHRcdFx0eyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgbGFiZWw6IGxvY2FsaXplKCdzdGF0dXNJblByb2dyZXNzJywgXCJJbiBQcm9ncmVzc1wiKSB9LFxuXHRcdFx0eyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuTmVlZHNJbnB1dCwgbGFiZWw6IGxvY2FsaXplKCdzdGF0dXNOZWVkc0lucHV0JywgXCJJbnB1dCBOZWVkZWRcIikgfSxcblx0XHRcdHsgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkVycm9yLCBsYWJlbDogbG9jYWxpemUoJ3N0YXR1c0ZhaWxlZCcsIFwiRmFpbGVkXCIpIH0sXG5cdFx0XTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0YXR1c0ZpbHRlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHsgc3RhdHVzLCBsYWJlbCB9ID0gc3RhdHVzRmlsdGVyc1tpXTtcblx0XHRcdGNvbnN0IGNvbnRleHRLZXkgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPihgc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXJTdGF0dXMuJHtzdGF0dXN9YCwgIXNlc3Npb25zQ29udHJvbC5pc1N0YXR1c0V4Y2x1ZGVkKHN0YXR1cykpO1xuXHRcdFx0Y29uc3QgY29udGV4dEtleUluc3RhbmNlID0gY29udGV4dEtleS5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLmZpbHRlckNvbnRleHRLZXlzLnNldChjb250ZXh0S2V5LmtleSwgeyBrZXk6IGNvbnRleHRLZXlJbnN0YW5jZSwgZ2V0RGVmYXVsdDogKCkgPT4gdHJ1ZSB9KTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRcdGlkOiBgc2Vzc2lvbnNWaWV3UGFuZS5maWx0ZXJTdGF0dXMuJHtzdGF0dXN9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsYWJlbCxcblx0XHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhjb250ZXh0S2V5LmtleSwgdHJ1ZSksXG5cdFx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0XHRpZDogU2Vzc2lvbnNWaWV3RmlsdGVyT3B0aW9uc1N1Yk1lbnUsXG5cdFx0XHRcdFx0XHRcdGdyb3VwOiAnMl9zdGF0dXMnLFxuXHRcdFx0XHRcdFx0XHRvcmRlcjogaSxcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgcnVuKCkge1xuXHRcdFx0XHRcdGNvbnN0IGlzRXhjbHVkZWQgPSBzZXNzaW9uc0NvbnRyb2wuaXNTdGF0dXNFeGNsdWRlZChzdGF0dXMpO1xuXHRcdFx0XHRcdHNlc3Npb25zQ29udHJvbC5zZXRTdGF0dXNFeGNsdWRlZChzdGF0dXMsICFpc0V4Y2x1ZGVkKTtcblx0XHRcdFx0XHRjb250ZXh0S2V5SW5zdGFuY2Uuc2V0KGlzRXhjbHVkZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXJjaGl2ZWQgdG9nZ2xlXG5cdFx0Y29uc3QgYXJjaGl2ZWRDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Nlc3Npb25zVmlld1BhbmUuZmlsdGVyLnNob3dBcmNoaXZlZCcsICFzZXNzaW9uc0NvbnRyb2wuaXNFeGNsdWRlQXJjaGl2ZWQoKSk7XG5cdFx0Y29uc3QgYXJjaGl2ZWRDb250ZXh0S2V5SW5zdGFuY2UgPSBhcmNoaXZlZENvbnRleHRLZXkuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZmlsdGVyQ29udGV4dEtleXMuc2V0KGFyY2hpdmVkQ29udGV4dEtleS5rZXksIHsga2V5OiBhcmNoaXZlZENvbnRleHRLZXlJbnN0YW5jZSwgZ2V0RGVmYXVsdDogKCkgPT4gZmFsc2UgfSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLmZpbHRlckFyY2hpdmVkJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbHRlckFyY2hpdmVkJywgXCJEb25lXCIpLFxuXHRcdFx0XHRcdHRvZ2dsZWQ6IENvbnRleHRLZXlFeHByLmVxdWFscyhhcmNoaXZlZENvbnRleHRLZXkua2V5LCB0cnVlKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IFNlc3Npb25zVmlld0ZpbHRlck9wdGlvbnNTdWJNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX3Byb3BzJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgcnVuKCkge1xuXHRcdFx0XHRjb25zdCBleGNsdWRpbmcgPSBzZXNzaW9uc0NvbnRyb2wuaXNFeGNsdWRlQXJjaGl2ZWQoKTtcblx0XHRcdFx0c2Vzc2lvbnNDb250cm9sLnNldEV4Y2x1ZGVBcmNoaXZlZCghZXhjbHVkaW5nKTtcblx0XHRcdFx0YXJjaGl2ZWRDb250ZXh0S2V5SW5zdGFuY2Uuc2V0KGV4Y2x1ZGluZyk7IC8vIHdhcyBleGNsdWRpbmcgXHUyMTkyIG5vdyBzaG93aW5nXG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhZCB0b2dnbGVcblx0XHRjb25zdCByZWFkQ29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdzZXNzaW9uc1ZpZXdQYW5lLmZpbHRlci5zaG93UmVhZCcsICFzZXNzaW9uc0NvbnRyb2wuaXNFeGNsdWRlUmVhZCgpKTtcblx0XHRjb25zdCByZWFkQ29udGV4dEtleUluc3RhbmNlID0gcmVhZENvbnRleHRLZXkuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZmlsdGVyQ29udGV4dEtleXMuc2V0KHJlYWRDb250ZXh0S2V5LmtleSwgeyBrZXk6IHJlYWRDb250ZXh0S2V5SW5zdGFuY2UsIGdldERlZmF1bHQ6ICgpID0+IHRydWUgfSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLmZpbHRlclJlYWQnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZmlsdGVyUmVhZCcsIFwiUmVhZFwiKSxcblx0XHRcdFx0XHR0b2dnbGVkOiBDb250ZXh0S2V5RXhwci5lcXVhbHMocmVhZENvbnRleHRLZXkua2V5LCB0cnVlKSxcblx0XHRcdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRcdFx0aWQ6IFNlc3Npb25zVmlld0ZpbHRlck9wdGlvbnNTdWJNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICczX3Byb3BzJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgcnVuKCkge1xuXHRcdFx0XHRjb25zdCBleGNsdWRpbmcgPSBzZXNzaW9uc0NvbnRyb2wuaXNFeGNsdWRlUmVhZCgpO1xuXHRcdFx0XHRzZXNzaW9uc0NvbnRyb2wuc2V0RXhjbHVkZVJlYWQoIWV4Y2x1ZGluZyk7XG5cdFx0XHRcdHJlYWRDb250ZXh0S2V5SW5zdGFuY2Uuc2V0KGV4Y2x1ZGluZyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVzZXQgZmlsdGVyIGFjdGlvblxuXHRcdGNvbnN0IGZpbHRlckNvbnRleHRLZXlzID0gdGhpcy5maWx0ZXJDb250ZXh0S2V5cztcblx0XHRjb25zdCB3b3Jrc3BhY2VHcm91cENhcHBlZENvbnRleHRLZXkgPSB0aGlzLndvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dEtleTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICdzZXNzaW9uc1ZpZXdQYW5lLnJlc2V0RmlsdGVycycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdyZXNldEZpbHRlcnMnLCBcIlJlc2V0XCIpLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogU2Vzc2lvbnNWaWV3RmlsdGVyT3B0aW9uc1N1Yk1lbnUsXG5cdFx0XHRcdFx0XHRncm91cDogJzRfcmVzZXQnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBydW4oKSB7XG5cdFx0XHRcdHNlc3Npb25zQ29udHJvbC5yZXNldEZpbHRlcnMoKTtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGtleSwgZ2V0RGVmYXVsdCB9IG9mIGZpbHRlckNvbnRleHRLZXlzLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0a2V5LnNldChnZXREZWZhdWx0KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdvcmtzcGFjZUdyb3VwQ2FwcGVkQ29udGV4dEtleT8uc2V0KHNlc3Npb25zQ29udHJvbC5pc1dvcmtzcGFjZUdyb3VwQ2FwcGVkKCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblxuXHRcdHRoaXMuY3VycmVudEJvZHlIZWlnaHQgPSBoZWlnaHQ7XG5cdFx0dGhpcy5jdXJyZW50Qm9keVdpZHRoID0gd2lkdGg7XG5cdFx0dGhpcy51cGRhdGVIZWFkZXJMYXlvdXQoKTtcblx0XHR0aGlzLmxheW91dFNpZGViYXJTcGxpdFZpZXcoKTtcblxuXHRcdGlmICh0aGlzLnNpZGViYXJTcGxpdFZpZXcgfHwgIXRoaXMuc2Vzc2lvbnNDb250cm9sIHx8ICF0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sLmxheW91dCh0aGlzLnNlc3Npb25zQ29udHJvbENvbnRhaW5lci5vZmZzZXRIZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0U2lkZWJhclNwbGl0VmlldygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2lkZWJhclNwbGl0VmlldyB8fCAhdGhpcy5zaWRlYmFyU3BsaXRWaWV3Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVpZ2h0ID0gdGhpcy5zaWRlYmFyU3BsaXRWaWV3Q29udGFpbmVyLm9mZnNldEhlaWdodCB8fCB0aGlzLmN1cnJlbnRCb2R5SGVpZ2h0IHx8IHRoaXMudmlld1BhbmVDb250YWluZXI/Lm9mZnNldEhlaWdodCB8fCAwO1xuXHRcdGlmIChoZWlnaHQgPD0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNpZGViYXJTcGxpdFZpZXdDb250YWluZXIub2Zmc2V0SGVpZ2h0ID09PSAwKSB7XG5cdFx0XHR0aGlzLnNpZGViYXJTcGxpdFZpZXdDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblx0XHR9XG5cdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LmxheW91dChoZWlnaHQpO1xuXHRcdGlmICghdGhpcy5kaWRJbml0aWFsaXplUGFuZVNpemVzKSB7XG5cdFx0XHR0aGlzLmRpZEluaXRpYWxpemVQYW5lU2l6ZXMgPSB0cnVlO1xuXHRcdFx0dGhpcy5zaWRlYmFyU3BsaXRWaWV3LnJlc2l6ZVZpZXcoMSwgdGhpcy5nZXRDdXN0b21pemF0aW9uc1BhbmVIZWlnaHQoKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXN0b21pemF0aW9uc1BhbmVIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRpZiAodGhpcy5fY3VzdG9taXphdGlvbnNXaWRnZXQ/LmNvbGxhcHNlZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2N1c3RvbWl6YXRpb25zV2lkZ2V0LmNvbGxhcHNlZEhlaWdodDtcblx0XHR9XG5cdFx0Y29uc3QgZGVzaXJlZEhlaWdodCA9IHRoaXMuX2N1c3RvbWl6YXRpb25zV2lkZ2V0Py5kZXNpcmVkSGVpZ2h0ID8/IDA7XG5cdFx0cmV0dXJuIE1hdGgubWF4KENVU1RPTUlaQVRJT05TX01JTl9IRUlHSFQsIE51bWJlci5pc0Zpbml0ZShkZXNpcmVkSGVpZ2h0KSA/IGRlc2lyZWRIZWlnaHQgOiAwKTtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCk6IHZvaWQge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbD8uZm9jdXMoKTtcblx0fVxuXG5cdHJlZnJlc2goKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2w/LnJlZnJlc2goKTtcblx0fVxuXG5cdG9wZW5GaW5kKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNGaW5kV2lkZ2V0T3BlbiA9IHRydWU7XG5cdFx0aWYgKHRoaXMuZmluZFdpZGdldENvbnRhaW5lcikge1xuXHRcdFx0Ly8gU2hvdyBjb250YWluZXIgYmVmb3JlIG9wZW5pbmcgZmluZCBzbyB0aGUgd2lkZ2V0IGNhbiBiZSBmb2N1c2VkXG5cdFx0XHR0aGlzLmZpbmRXaWRnZXRDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH1cblx0XHR0aGlzLnVwZGF0ZUhlYWRlckxheW91dCgpO1xuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5vcGVuRmluZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVIZWFkZXJMYXlvdXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmhlYWRlclJvdyB8fCAhdGhpcy5oZWFkZXJMYWJlbCB8fCAhdGhpcy5oZWFkZXJBY3Rpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT24gcGhvbmUgdGhlIGRlc2t0b3AgaGVhZGVyIGNvbnRlbnQgaXMgaGlkZGVuOyB0aGUgcm93IGlzIG9ubHlcblx0XHQvLyB2aXNpYmxlIHdoZW4gdGhlIGZpbmQgd2lkZ2V0IGlzIG9wZW4gKHNvIHRoZSB1c2VyIGNhbiBzZWFyY2gpLlxuXHRcdGlmIChpc1Bob25lTGF5b3V0KHRoaXMubGF5b3V0U2VydmljZSkpIHtcblx0XHRcdHRoaXMuaGVhZGVyUm93LmNsYXNzTGlzdC50b2dnbGUoJ3Bob25lLWxheW91dC1lbXB0eScsICF0aGlzLmlzRmluZFdpZGdldE9wZW4pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzRmluZFdpZGdldE9wZW4pIHtcblx0XHRcdHRoaXMuaGVhZGVyTGFiZWwuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdHRoaXMuaGVhZGVyQWN0aW9ucy5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuaGVhZGVyTGFiZWwuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdHRoaXMuaGVhZGVyQWN0aW9ucy5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdH1cblxuXHQvKipcblx0ICogUGhvbmUtb25seTogcHJlc2VudCBhIGJvdHRvbSBzaGVldCB3aXRoIHRoZSBmb3VyIHNvcnQvZ3JvdXAgdG9nZ2xlcy5cblx0ICogRmlsdGVyaW5nIG9uIHBob25lIGlzIHBlcmZvcm1lZCB2aWEgdGhlIHN0YXR1cyBmaWx0ZXIgY2hpcHMsIHNvIHRoZVxuXHQgKiBzaGVldCBpbnRlbnRpb25hbGx5IG9taXRzIFwiRmlsdGVyXCIsIFwiU2hvdyBSZWNlbnQvQWxsIFNlc3Npb25zXCIsIGFuZFxuXHQgKiBcIkNvbGxhcHNlIEFsbCBHcm91cHNcIiBhY3Rpb25zIGZvdW5kIGluIHRoZSBkZXNrdG9wIHN1Ym1lbnUuXG5cdCAqL1xuXHRwcml2YXRlIG9wZW5Tb3J0R3JvdXBTaGVldCgpOiB2b2lkIHtcblx0XHRjb25zdCBzb3J0VGl0bGUgPSBsb2NhbGl6ZSgnc29ydEdyb3VwU2hlZXQuc29ydCcsIFwiU29ydFwiKTtcblx0XHRjb25zdCBncm91cFRpdGxlID0gbG9jYWxpemUoJ3NvcnRHcm91cFNoZWV0Lmdyb3VwJywgXCJHcm91cFwiKTtcblxuXHRcdGNvbnN0IGl0ZW1zOiBJTW9iaWxlU29ydEdyb3VwU2hlZXRJdGVtW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBTZXNzaW9uc1NvcnRpbmcuQ3JlYXRlZCxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzb3J0QnlDcmVhdGVkJywgXCJTb3J0IGJ5IENyZWF0ZWRcIiksXG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMuY3VycmVudFNvcnRpbmcgPT09IFNlc3Npb25zU29ydGluZy5DcmVhdGVkLFxuXHRcdFx0XHRncm91cDogJ3NvcnQnLFxuXHRcdFx0XHRncm91cFRpdGxlOiBzb3J0VGl0bGUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogU2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc29ydEJ5VXBkYXRlZCcsIFwiU29ydCBieSBVcGRhdGVkXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmN1cnJlbnRTb3J0aW5nID09PSBTZXNzaW9uc1NvcnRpbmcuVXBkYXRlZCxcblx0XHRcdFx0Z3JvdXA6ICdzb3J0Jyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSxcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdncm91cEJ5V29ya3NwYWNlJywgXCJHcm91cCBieSBXb3Jrc3BhY2VcIiksXG5cdFx0XHRcdGNoZWNrZWQ6IHRoaXMuY3VycmVudEdyb3VwaW5nID09PSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSxcblx0XHRcdFx0Z3JvdXA6ICdncm91cCcsXG5cdFx0XHRcdGdyb3VwVGl0bGU6IGdyb3VwVGl0bGUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogU2Vzc2lvbnNHcm91cGluZy5EYXRlLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2dyb3VwQnlUaW1lJywgXCJHcm91cCBieSBUaW1lXCIpLFxuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmN1cnJlbnRHcm91cGluZyA9PT0gU2Vzc2lvbnNHcm91cGluZy5EYXRlLFxuXHRcdFx0XHRncm91cDogJ2dyb3VwJyxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdHNob3dNb2JpbGVTb3J0R3JvdXBTaGVldCh0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lciwgbG9jYWxpemUoJ3NvcnRHcm91cFNoZWV0LnRpdGxlJywgXCJTb3J0XCIpLCBpdGVtcykudGhlbihzZWxlY3RlZElkID0+IHtcblx0XHRcdGlmICghc2VsZWN0ZWRJZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoc2VsZWN0ZWRJZCA9PT0gU2Vzc2lvbnNTb3J0aW5nLkNyZWF0ZWQgfHwgc2VsZWN0ZWRJZCA9PT0gU2Vzc2lvbnNTb3J0aW5nLlVwZGF0ZWQpIHtcblx0XHRcdFx0dGhpcy5zZXRTb3J0aW5nKHNlbGVjdGVkSWQpO1xuXHRcdFx0fSBlbHNlIGlmIChzZWxlY3RlZElkID09PSBTZXNzaW9uc0dyb3VwaW5nLldvcmtzcGFjZSB8fCBzZWxlY3RlZElkID09PSBTZXNzaW9uc0dyb3VwaW5nLkRhdGUpIHtcblx0XHRcdFx0dGhpcy5zZXRHcm91cGluZyhzZWxlY3RlZElkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHNldEdyb3VwaW5nKGdyb3VwaW5nOiBTZXNzaW9uc0dyb3VwaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudEdyb3VwaW5nID09PSBncm91cGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudEdyb3VwaW5nID0gZ3JvdXBpbmc7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShHUk9VUElOR19TVE9SQUdFX0tFWSwgdGhpcy5jdXJyZW50R3JvdXBpbmcsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdHRoaXMuZ3JvdXBpbmdDb250ZXh0S2V5Py5zZXQodGhpcy5jdXJyZW50R3JvdXBpbmcpO1xuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sPy5yZXNldFNlY3Rpb25Db2xsYXBzZVN0YXRlKCk7XG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2w/LnVwZGF0ZSh0cnVlKTtcblx0fVxuXG5cdHNldFNvcnRpbmcoc29ydGluZzogU2Vzc2lvbnNTb3J0aW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY3VycmVudFNvcnRpbmcgPT09IHNvcnRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmN1cnJlbnRTb3J0aW5nID0gc29ydGluZztcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNPUlRJTkdfU1RPUkFHRV9LRVksIHRoaXMuY3VycmVudFNvcnRpbmcsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRcdHRoaXMuc29ydGluZ0NvbnRleHRLZXk/LnNldCh0aGlzLmN1cnJlbnRTb3J0aW5nKTtcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbD8udXBkYXRlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7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
