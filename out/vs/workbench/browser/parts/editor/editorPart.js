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
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { Part } from "../../part.js";
import { Dimension, $, EventHelper, addDisposableGenericMouseDownListener, getWindow, isAncestorOfActiveElement, getActiveElement, isHTMLElement } from "../../../../base/browser/dom.js";
import { Event, Emitter, Relay, PauseableEmitter } from "../../../../base/common/event.js";
import { contrastBorder, editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { GroupDirection, GroupsArrangement, GroupOrientation, MergeGroupMode, GroupsOrder, GroupLocation, GroupActivationReason } from "../../../services/editor/common/editorGroupsService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { orthogonal, LayoutPriority, Direction, SerializableGrid, Sizing, Orientation, isGridBranchNode, createSerializedGrid } from "../../../../base/browser/ui/grid/grid.js";
import { GroupModelChangeKind } from "../../../common/editor.js";
import { EDITOR_GROUP_BORDER, EDITOR_PANE_BACKGROUND } from "../../../common/theme.js";
import { distinct, coalesce } from "../../../../base/common/arrays.js";
import { getEditorPartOptions, impactsEditorPartOptions } from "./editor.js";
import { EditorGroupView } from "./editorGroupView.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { dispose, toDisposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { isSerializedEditorGroupModel } from "../../../common/editor/editorGroupModel.js";
import { EditorDropTarget } from "./editorDropTarget.js";
import { Color } from "../../../../base/common/color.js";
import { CenteredViewLayout } from "../../../../base/browser/ui/centered/centeredViewLayout.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Parts, IWorkbenchLayoutService, Position, FLOATING_PANEL_INNER_MARGIN, FLOATING_PANEL_MARGIN, getFloatingOuterEdgeOwners } from "../../../services/layout/browser/layoutService.js";
import { assertType } from "../../../../base/common/types.js";
import { CompositeDragAndDropObserver } from "../../dnd.js";
import { DeferredPromise, Promises } from "../../../../base/common/async.js";
import { findGroup } from "../../../services/editor/common/editorGroupFinder.js";
import { SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { EditorAreaFocusContext, EditorPartMaximizedEditorGroupContext, EditorPartMultipleEditorGroupsContext, EditorTabsVisibleContext, IsTopRightEditorGroupContext } from "../../../common/contextkeys.js";
import { mainWindow } from "../../../../base/browser/window.js";
const EDITOR_FRAME_BORDER_WIDTH = 1;
class GridWidgetView {
  constructor() {
    this.element = $(".grid-view-container");
    this._onDidChange = new Relay();
    this.onDidChange = this._onDidChange.event;
  }
  get minimumWidth() {
    return this.gridWidget ? this.gridWidget.minimumWidth : 0;
  }
  get maximumWidth() {
    return this.gridWidget ? this.gridWidget.maximumWidth : Number.POSITIVE_INFINITY;
  }
  get minimumHeight() {
    return this.gridWidget ? this.gridWidget.minimumHeight : 0;
  }
  get maximumHeight() {
    return this.gridWidget ? this.gridWidget.maximumHeight : Number.POSITIVE_INFINITY;
  }
  get gridWidget() {
    return this._gridWidget;
  }
  set gridWidget(grid) {
    this.element.textContent = "";
    if (grid) {
      this.element.appendChild(grid.element);
      this._onDidChange.input = grid.onDidChange;
    } else {
      this._onDidChange.input = Event.None;
    }
    this._gridWidget = grid;
  }
  layout(width, height, top, left) {
    this.gridWidget?.layout(width, height, top, left);
  }
  dispose() {
    this._onDidChange.dispose();
  }
}
let EditorPart = class extends Part {
  constructor(editorPartsView, id, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.editorPartsView = editorPartsView;
    this.groupsLabel = groupsLabel;
    this.windowId = windowId;
    this.instantiationService = instantiationService;
    this.configurationService = configurationService;
    this.hostService = hostService;
    this.contextKeyService = contextKeyService;
    //#region Events
    this._onDidFocus = this._register(new Emitter());
    this.onDidFocus = this._onDidFocus.event;
    this._onDidLayout = this._register(new Emitter());
    this.onDidLayout = this._onDidLayout.event;
    this._onDidChangeActiveGroup = this._register(new Emitter());
    this.onDidChangeActiveGroup = this._onDidChangeActiveGroup.event;
    this._onDidChangeGroupIndex = this._register(new Emitter());
    this.onDidChangeGroupIndex = this._onDidChangeGroupIndex.event;
    this._onDidChangeGroupLabel = this._register(new Emitter());
    this.onDidChangeGroupLabel = this._onDidChangeGroupLabel.event;
    this._onDidChangeGroupLocked = this._register(new Emitter());
    this.onDidChangeGroupLocked = this._onDidChangeGroupLocked.event;
    this._onDidChangeGroupMaximized = this._register(new Emitter());
    this.onDidChangeGroupMaximized = this._onDidChangeGroupMaximized.event;
    this._onDidActivateGroup = this._register(new Emitter());
    this.onDidActivateGroup = this._onDidActivateGroup.event;
    this._onDidAddGroup = this._register(new PauseableEmitter());
    this.onDidAddGroup = this._onDidAddGroup.event;
    this._onDidRemoveGroup = this._register(new PauseableEmitter());
    this.onDidRemoveGroup = this._onDidRemoveGroup.event;
    this._onDidMoveGroup = this._register(new Emitter());
    this.onDidMoveGroup = this._onDidMoveGroup.event;
    this.onDidSetGridWidget = this._register(new Emitter());
    this._onDidChangeSizeConstraints = this._register(new Relay());
    this.onDidChangeSizeConstraints = Event.any(this.onDidSetGridWidget.event, this._onDidChangeSizeConstraints.event);
    this._onDidScroll = this._register(new Relay());
    this.onDidScroll = Event.any(this.onDidSetGridWidget.event, this._onDidScroll.event);
    this._onDidChangeEditorPartOptions = this._register(new Emitter());
    this.onDidChangeEditorPartOptions = this._onDidChangeEditorPartOptions.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    //#endregion
    this.workspaceMemento = this.getMemento(StorageScope.WORKSPACE, StorageTarget.USER);
    this.profileMemento = this.getMemento(StorageScope.PROFILE, StorageTarget.MACHINE);
    this.groupViews = /* @__PURE__ */ new Map();
    this.mostRecentActiveGroups = [];
    this.container = $(".content");
    this.gridWidgetDisposables = this._register(new DisposableStore());
    this.gridWidgetView = this._register(new GridWidgetView());
    this.enforcedPartOptions = [];
    this.top = 0;
    this.left = 0;
    this._contentRightInset = 0;
    this.sideGroup = {
      openEditor: async (editor, options) => {
        const findGroupResult = this.scopedInstantiationService.invokeFunction((accessor) => findGroup(accessor, { editor, options }, SIDE_GROUP));
        let group;
        if (findGroupResult instanceof Promise) {
          [group] = await findGroupResult;
        } else {
          [group] = findGroupResult;
        }
        return group.openEditor(editor, options);
      }
    };
    this._isReady = false;
    this.whenReadyPromise = new DeferredPromise();
    this.whenReady = this.whenReadyPromise.p;
    this.whenRestoredPromise = new DeferredPromise();
    this.whenRestored = this.whenRestoredPromise.p;
    this._willRestoreState = false;
    this.priority = LayoutPriority.High;
    this.scopedContextKeyService = this._register(this.contextKeyService.createScoped(this.container));
    this.scopedInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, this.scopedContextKeyService]
    )));
    this._partOptions = getEditorPartOptions(this.configurationService, this.themeService);
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    this._register(this.themeService.onDidFileIconThemeChange(() => this.handleChangedPartOptions()));
    this._register(this.onDidChangeMementoValue(StorageScope.WORKSPACE, this._store)((e) => this.onDidChangeMementoState(e)));
  }
  onConfigurationUpdated(event) {
    if (impactsEditorPartOptions(event)) {
      this.handleChangedPartOptions();
    }
  }
  handleChangedPartOptions() {
    const oldPartOptions = this._partOptions;
    const newPartOptions = getEditorPartOptions(this.configurationService, this.themeService);
    for (const enforcedPartOptions of this.enforcedPartOptions) {
      Object.assign(newPartOptions, enforcedPartOptions);
    }
    this._partOptions = newPartOptions;
    this._onDidChangeEditorPartOptions.fire({ oldPartOptions, newPartOptions });
  }
  get partOptions() {
    return this._partOptions;
  }
  enforcePartOptions(options) {
    this.enforcedPartOptions.push(options);
    this.handleChangedPartOptions();
    return toDisposable(() => {
      this.enforcedPartOptions.splice(this.enforcedPartOptions.indexOf(options), 1);
      this.handleChangedPartOptions();
    });
  }
  get contentDimension() {
    return this._contentDimension;
  }
  /**
   * Reserves an inset (px) on the right of the editor content of the group(s) at the
   * right edge of the editor part, while the title stays full width, so a docked panel
   * can sit beside the editor content under one full-width tab bar. Only the right-edge
   * groups (no neighbor to the right) are inset; interior groups in a split layout keep
   * full-width content. Recomputed when the group topology changes. `0` (default)
   * restores full-width content for all groups.
   */
  setContentRightInset(inset) {
    this._contentRightInset = Math.max(0, Math.round(inset));
    this.applyContentRightInset();
  }
  applyContentRightInset() {
    if (!this.gridWidget) {
      return;
    }
    for (const group of this.groupViews.values()) {
      if (!(group instanceof EditorGroupView)) {
        continue;
      }
      const atRightEdge = this._contentRightInset > 0 && this.gridWidget.getNeighborViews(group, Direction.Right).length === 0;
      group.setContentRightInset(atRightEdge ? this._contentRightInset : 0);
    }
  }
  get activeGroup() {
    return this._activeGroup;
  }
  get groups() {
    return Array.from(this.groupViews.values());
  }
  get count() {
    return this.groupViews.size;
  }
  get orientation() {
    return this.gridWidget && this.gridWidget.orientation === Orientation.VERTICAL ? GroupOrientation.VERTICAL : GroupOrientation.HORIZONTAL;
  }
  get isReady() {
    return this._isReady;
  }
  get hasRestorableState() {
    return !!this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
  }
  get willRestoreState() {
    return this._willRestoreState;
  }
  getGroups(order = GroupsOrder.CREATION_TIME) {
    switch (order) {
      case GroupsOrder.CREATION_TIME:
        return this.groups;
      case GroupsOrder.MOST_RECENTLY_ACTIVE: {
        const mostRecentActive = coalesce(this.mostRecentActiveGroups.map((groupId) => this.getGroup(groupId)));
        return distinct([...mostRecentActive, ...this.groups]);
      }
      case GroupsOrder.GRID_APPEARANCE: {
        const views = [];
        if (this.gridWidget) {
          this.fillGridNodes(views, this.gridWidget.getViews());
        }
        return views;
      }
    }
  }
  fillGridNodes(target, node) {
    if (isGridBranchNode(node)) {
      node.children.forEach((child) => this.fillGridNodes(target, child));
    } else {
      target.push(node.view);
    }
  }
  hasGroup(identifier) {
    return this.groupViews.has(identifier);
  }
  getGroup(identifier) {
    return this.groupViews.get(identifier);
  }
  findGroup(scope, source = this.activeGroup, wrap) {
    if (typeof scope.direction === "number") {
      return this.doFindGroupByDirection(scope.direction, source, wrap);
    }
    if (typeof scope.location === "number") {
      return this.doFindGroupByLocation(scope.location, source, wrap);
    }
    throw new Error("invalid arguments");
  }
  doFindGroupByDirection(direction, source, wrap) {
    const sourceGroupView = this.assertGroupView(source);
    const neighbours = this.gridWidget.getNeighborViews(sourceGroupView, this.toGridViewDirection(direction), wrap);
    neighbours.sort(((n1, n2) => this.mostRecentActiveGroups.indexOf(n1.id) - this.mostRecentActiveGroups.indexOf(n2.id)));
    return neighbours[0];
  }
  doFindGroupByLocation(location, source, wrap) {
    const sourceGroupView = this.assertGroupView(source);
    const groups = this.getGroups(GroupsOrder.GRID_APPEARANCE);
    const index = groups.indexOf(sourceGroupView);
    switch (location) {
      case GroupLocation.FIRST:
        return groups[0];
      case GroupLocation.LAST:
        return groups[groups.length - 1];
      case GroupLocation.NEXT: {
        let nextGroup = groups[index + 1];
        if (!nextGroup && wrap) {
          nextGroup = this.doFindGroupByLocation(GroupLocation.FIRST, source);
        }
        return nextGroup;
      }
      case GroupLocation.PREVIOUS: {
        let previousGroup = groups[index - 1];
        if (!previousGroup && wrap) {
          previousGroup = this.doFindGroupByLocation(GroupLocation.LAST, source);
        }
        return previousGroup;
      }
    }
  }
  activateGroup(group, preserveWindowOrder, reason) {
    const groupView = this.assertGroupView(group);
    this.doSetGroupActive(groupView, reason);
    if (!preserveWindowOrder) {
      this.hostService.moveTop(getWindow(this.element));
    }
    return groupView;
  }
  restoreGroup(group) {
    const groupView = this.assertGroupView(group);
    this.doRestoreGroup(groupView);
    return groupView;
  }
  getSize(group) {
    const groupView = this.assertGroupView(group);
    return this.gridWidget.getViewSize(groupView);
  }
  setSize(group, size) {
    const groupView = this.assertGroupView(group);
    this.gridWidget.resizeView(groupView, size);
  }
  arrangeGroups(arrangement, target = this.activeGroup) {
    if (this.count < 2) {
      return;
    }
    if (!this.gridWidget) {
      return;
    }
    const groupView = this.assertGroupView(target);
    switch (arrangement) {
      case GroupsArrangement.EVEN:
        this.gridWidget.distributeViewSizes();
        break;
      case GroupsArrangement.MAXIMIZE:
        if (this.groups.length < 2) {
          return;
        }
        this.gridWidget.maximizeView(groupView);
        groupView.focus();
        break;
      case GroupsArrangement.EXPAND:
        this.gridWidget.expandView(groupView);
        break;
    }
  }
  toggleMaximizeGroup(target = this.activeGroup) {
    if (this.hasMaximizedGroup()) {
      this.unmaximizeGroup();
    } else {
      this.arrangeGroups(GroupsArrangement.MAXIMIZE, target);
    }
  }
  toggleExpandGroup(target = this.activeGroup) {
    if (this.isGroupExpanded(this.activeGroup)) {
      this.arrangeGroups(GroupsArrangement.EVEN);
    } else {
      this.arrangeGroups(GroupsArrangement.EXPAND, target);
    }
  }
  unmaximizeGroup() {
    this.gridWidget.exitMaximizedView();
    this._activeGroup.focus();
  }
  hasMaximizedGroup() {
    return this.gridWidget.hasMaximizedView();
  }
  isGroupMaximized(targetGroup) {
    return this.gridWidget.isViewMaximized(targetGroup);
  }
  isGroupExpanded(targetGroup) {
    return this.gridWidget.isViewExpanded(targetGroup);
  }
  setGroupOrientation(orientation) {
    if (!this.gridWidget) {
      return;
    }
    const newOrientation = orientation === GroupOrientation.HORIZONTAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
    if (this.gridWidget.orientation !== newOrientation) {
      this.gridWidget.orientation = newOrientation;
    }
  }
  applyLayout(layout) {
    const restoreFocus = this.shouldRestoreFocus(this.container);
    let layoutGroupsCount = 0;
    function countGroups(groups) {
      for (const group of groups) {
        if (Array.isArray(group.groups)) {
          countGroups(group.groups);
        } else {
          layoutGroupsCount++;
        }
      }
    }
    countGroups(layout.groups);
    let currentGroupViews = this.getGroups(GroupsOrder.GRID_APPEARANCE);
    if (layoutGroupsCount < currentGroupViews.length) {
      const lastGroupInLayout = currentGroupViews[layoutGroupsCount - 1];
      currentGroupViews.forEach((group, index) => {
        if (index >= layoutGroupsCount) {
          this.mergeGroup(group, lastGroupInLayout);
        }
      });
      currentGroupViews = this.getGroups(GroupsOrder.GRID_APPEARANCE);
    }
    const activeGroup = this.activeGroup;
    const gridDescriptor = createSerializedGrid({
      orientation: this.toGridViewOrientation(
        layout.orientation,
        this.isTwoDimensionalGrid() ? this.gridWidget.orientation : (
          // preserve original orientation for 2-dimensional grids
          orthogonal(this.gridWidget.orientation)
        )
        // otherwise flip (fix https://github.com/microsoft/vscode/issues/52975)
      ),
      groups: layout.groups
    });
    this.doApplyGridState(gridDescriptor, activeGroup.id, currentGroupViews);
    if (restoreFocus) {
      this._activeGroup.focus();
    }
  }
  getLayout() {
    const serializedGrid = this.gridWidget.serialize();
    const orientation = serializedGrid.orientation === Orientation.HORIZONTAL ? GroupOrientation.HORIZONTAL : GroupOrientation.VERTICAL;
    const root = this.serializedNodeToGroupLayoutArgument(serializedGrid.root);
    return {
      orientation,
      groups: root.groups
    };
  }
  serializedNodeToGroupLayoutArgument(serializedNode) {
    if (serializedNode.type === "branch") {
      return {
        size: serializedNode.size,
        groups: serializedNode.data.map((node) => this.serializedNodeToGroupLayoutArgument(node))
      };
    }
    return { size: serializedNode.size };
  }
  shouldRestoreFocus(target) {
    if (!target) {
      return false;
    }
    const activeElement = getActiveElement();
    if (activeElement === target.ownerDocument.body) {
      return true;
    }
    return isAncestorOfActiveElement(target);
  }
  isTwoDimensionalGrid() {
    const views = this.gridWidget.getViews();
    if (isGridBranchNode(views)) {
      return views.children.some((child) => isGridBranchNode(child));
    }
    return false;
  }
  addGroup(location, direction, groupToCopy) {
    const locationView = this.assertGroupView(location);
    let newGroupView;
    if (locationView.groupsView === this) {
      const restoreFocus = this.shouldRestoreFocus(locationView.element);
      const shouldExpand = this.groupViews.size > 1 && this.isGroupExpanded(locationView);
      newGroupView = this.doCreateGroupView(groupToCopy);
      this.gridWidget.addView(
        newGroupView,
        this.getSplitSizingStyle(),
        locationView,
        this.toGridViewDirection(direction)
      );
      this.updateContainer();
      this._onDidAddGroup.fire(newGroupView);
      this.notifyGroupIndexChange();
      if (shouldExpand) {
        this.arrangeGroups(GroupsArrangement.EXPAND, newGroupView);
      }
      if (restoreFocus) {
        locationView.focus();
      }
    } else {
      newGroupView = locationView.groupsView.addGroup(locationView, direction, groupToCopy);
    }
    return newGroupView;
  }
  getSplitSizingStyle() {
    switch (this._partOptions.splitSizing) {
      case "distribute":
        return Sizing.Distribute;
      case "split":
        return Sizing.Split;
      default:
        return Sizing.Auto;
    }
  }
  /**
   * Base {@link IEditorGroupViewOptions} applied to every group this part creates.
   * Subclasses override to configure part-wide group behavior (e.g. header menus).
   */
  getGroupViewOptions() {
    return void 0;
  }
  doCreateGroupView(from, options) {
    const resolvedOptions = { ...this.getGroupViewOptions(), ...options };
    let groupView;
    if (from instanceof EditorGroupView) {
      groupView = EditorGroupView.createCopy(from, this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, resolvedOptions);
    } else if (isSerializedEditorGroupModel(from)) {
      groupView = EditorGroupView.createFromSerialized(from, this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, resolvedOptions);
    } else {
      groupView = EditorGroupView.createNew(this.editorPartsView, this, this.groupsLabel, this.count, this.scopedInstantiationService, resolvedOptions);
    }
    this.groupViews.set(groupView.id, groupView);
    const groupDisposables = new DisposableStore();
    groupDisposables.add(groupView.onDidFocus(() => {
      this.doSetGroupActive(groupView);
      this._onDidFocus.fire();
    }));
    groupDisposables.add(groupView.onDidModelChange((e) => {
      switch (e.kind) {
        case GroupModelChangeKind.GROUP_LOCKED:
          this._onDidChangeGroupLocked.fire(groupView);
          break;
        case GroupModelChangeKind.GROUP_INDEX:
          this._onDidChangeGroupIndex.fire(groupView);
          break;
        case GroupModelChangeKind.GROUP_LABEL:
          this._onDidChangeGroupLabel.fire(groupView);
          break;
      }
    }));
    groupDisposables.add(groupView.onDidActiveEditorChange(() => {
      this.updateContainer();
    }));
    Event.once(groupView.onWillDispose)(() => {
      dispose(groupDisposables);
      this.groupViews.delete(groupView.id);
      this.doUpdateMostRecentActive(groupView);
    });
    return groupView;
  }
  doSetGroupActive(group, reason = GroupActivationReason.DEFAULT) {
    if (this._activeGroup !== group) {
      const previousActiveGroup = this._activeGroup;
      this._activeGroup = group;
      this.doUpdateMostRecentActive(group, true);
      if (previousActiveGroup && !previousActiveGroup.disposed) {
        previousActiveGroup.setActive(false);
      }
      group.setActive(true);
      this.doRestoreGroup(group);
      this._onDidChangeActiveGroup.fire(group);
    }
    this._onDidActivateGroup.fire({ group, reason });
  }
  doRestoreGroup(group) {
    if (!this.gridWidget) {
      return;
    }
    try {
      if (this.hasMaximizedGroup() && !this.isGroupMaximized(group)) {
        this.unmaximizeGroup();
      }
      const viewSize = this.gridWidget.getViewSize(group);
      if (viewSize.width === group.minimumWidth || viewSize.height === group.minimumHeight) {
        this.arrangeGroups(GroupsArrangement.EXPAND, group);
      }
    } catch (error) {
    }
  }
  doUpdateMostRecentActive(group, makeMostRecentlyActive) {
    const index = this.mostRecentActiveGroups.indexOf(group.id);
    if (index !== -1) {
      this.mostRecentActiveGroups.splice(index, 1);
    }
    if (makeMostRecentlyActive) {
      this.mostRecentActiveGroups.unshift(group.id);
    }
  }
  toGridViewDirection(direction) {
    switch (direction) {
      case GroupDirection.UP:
        return Direction.Up;
      case GroupDirection.DOWN:
        return Direction.Down;
      case GroupDirection.LEFT:
        return Direction.Left;
      case GroupDirection.RIGHT:
        return Direction.Right;
    }
  }
  toGridViewOrientation(orientation, fallback) {
    if (typeof orientation === "number") {
      return orientation === GroupOrientation.HORIZONTAL ? Orientation.HORIZONTAL : Orientation.VERTICAL;
    }
    return fallback;
  }
  removeGroup(group, preserveFocus) {
    const groupView = this.assertGroupView(group);
    if (this.count === 1) {
      return;
    }
    if (groupView.isEmpty) {
      this.doRemoveEmptyGroup(groupView, preserveFocus);
    } else {
      this.doRemoveGroupWithEditors(groupView);
    }
  }
  doRemoveGroupWithEditors(groupView) {
    const mostRecentlyActiveGroups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    let lastActiveGroup;
    if (this._activeGroup === groupView) {
      lastActiveGroup = mostRecentlyActiveGroups[1];
    } else {
      lastActiveGroup = mostRecentlyActiveGroups[0];
    }
    this.mergeGroup(groupView, lastActiveGroup);
  }
  doRemoveEmptyGroup(groupView, preserveFocus) {
    const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);
    if (this._activeGroup === groupView) {
      const mostRecentlyActiveGroups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
      const nextActiveGroup = mostRecentlyActiveGroups[1];
      this.doSetGroupActive(nextActiveGroup);
    }
    this.gridWidget.removeView(groupView, this.getSplitSizingStyle());
    groupView.dispose();
    if (restoreFocus) {
      this._activeGroup.focus();
    }
    this.notifyGroupIndexChange();
    this.updateContainer();
    this._onDidRemoveGroup.fire(groupView);
  }
  moveGroup(group, location, direction) {
    const sourceView = this.assertGroupView(group);
    const targetView = this.assertGroupView(location);
    if (sourceView.id === targetView.id) {
      throw new Error("Cannot move group into its own");
    }
    const restoreFocus = this.shouldRestoreFocus(sourceView.element);
    let movedView;
    if (sourceView.groupsView === targetView.groupsView) {
      this.gridWidget.moveView(sourceView, this.getSplitSizingStyle(), targetView, this.toGridViewDirection(direction));
      movedView = sourceView;
    } else {
      movedView = targetView.groupsView.addGroup(targetView, direction, sourceView);
      sourceView.closeAllEditors();
      this.removeGroup(sourceView, restoreFocus);
    }
    if (restoreFocus) {
      movedView.focus();
    }
    this._onDidMoveGroup.fire(movedView);
    this.notifyGroupIndexChange();
    return movedView;
  }
  copyGroup(group, location, direction) {
    const groupView = this.assertGroupView(group);
    const locationView = this.assertGroupView(location);
    const restoreFocus = this.shouldRestoreFocus(groupView.element);
    const copiedGroupView = this.addGroup(locationView, direction, groupView);
    if (restoreFocus) {
      copiedGroupView.focus();
    }
    return copiedGroupView;
  }
  mergeGroup(group, target, options) {
    const sourceView = this.assertGroupView(group);
    const targetView = this.assertGroupView(target);
    const editors = [];
    let index = options && typeof options.index === "number" ? options.index : targetView.count;
    for (const editor of sourceView.editors) {
      const inactive = !sourceView.isActive(editor) || this._activeGroup !== sourceView;
      let actualIndex;
      if (targetView.contains(editor) && // Do not configure an `index` for editors that are sticky in
      // the target, otherwise there is a chance of losing that state
      // when the editor is moved.
      // See https://github.com/microsoft/vscode/issues/239549
      (targetView.isSticky(editor) || // Do not configure an `index` when we are explicitly instructed
      options?.preserveExistingIndex)) {
      } else {
        actualIndex = index;
        index++;
      }
      editors.push({
        editor,
        options: {
          index: actualIndex,
          inactive,
          preserveFocus: inactive
        }
      });
    }
    let result = true;
    if (options?.mode === MergeGroupMode.COPY_EDITORS) {
      sourceView.copyEditors(editors, targetView);
    } else {
      result = sourceView.moveEditors(editors, targetView);
    }
    if (sourceView.isEmpty && !sourceView.disposed) {
      this.removeGroup(sourceView, true);
    }
    return result;
  }
  mergeAllGroups(target, options) {
    const targetView = this.assertGroupView(target);
    let result = true;
    for (const group of this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (group === targetView) {
        continue;
      }
      const merged = this.mergeGroup(group, targetView, options);
      if (!merged) {
        result = false;
      }
    }
    return result;
  }
  assertGroupView(group) {
    let groupView;
    if (typeof group === "number") {
      groupView = this.editorPartsView.getGroup(group);
    } else {
      groupView = group;
    }
    if (!groupView) {
      throw new Error("Invalid editor group provided!");
    }
    return groupView;
  }
  createEditorDropTarget(container, delegate) {
    assertType(isHTMLElement(container));
    return this.scopedInstantiationService.createInstance(EditorDropTarget, this, container, delegate);
  }
  //#region Part
  // TODO @sbatten @joao find something better to prevent editor taking over #79897
  get minimumWidth() {
    return Math.min(this.centeredLayoutWidget.minimumWidth, this.layoutService.getMaximumEditorDimensions(this.layoutService.getContainer(getWindow(this.container))).width);
  }
  get maximumWidth() {
    return this.centeredLayoutWidget.maximumWidth;
  }
  get minimumHeight() {
    return Math.min(this.centeredLayoutWidget.minimumHeight, this.layoutService.getMaximumEditorDimensions(this.layoutService.getContainer(getWindow(this.container))).height);
  }
  get maximumHeight() {
    return this.centeredLayoutWidget.maximumHeight;
  }
  get snap() {
    return this.layoutService.getPanelAlignment() === "center";
  }
  get onDidChange() {
    return Event.any(this.centeredLayoutWidget.onDidChange, this.onDidSetGridWidget.event);
  }
  get gridSeparatorBorder() {
    return this.theme.getColor(EDITOR_GROUP_BORDER) || this.theme.getColor(contrastBorder) || Color.transparent;
  }
  updateStyles() {
    this.container.style.backgroundColor = this.getColor(editorBackground) || "";
    const separatorBorderStyle = { separatorBorder: this.gridSeparatorBorder, background: this.theme.getColor(EDITOR_PANE_BACKGROUND) || Color.transparent };
    this.gridWidget.style(separatorBorderStyle);
    this.centeredLayoutWidget.styles(separatorBorderStyle);
  }
  createContentArea(parent, options) {
    this.element = parent;
    if (this.windowId !== mainWindow.vscodeWindowId) {
      this.container.classList.add("auxiliary");
    }
    parent.appendChild(this.container);
    this._willRestoreState = !options || options.restorePreviousState;
    this.doCreateGridControl();
    this.centeredLayoutWidget = this._register(new CenteredViewLayout(this.container, this.gridWidgetView, this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY], this._partOptions.centeredLayoutFixedWidth));
    this._register(this.onDidChangeEditorPartOptions((e) => this.centeredLayoutWidget.setFixedWidth(e.newPartOptions.centeredLayoutFixedWidth ?? false)));
    this.setupDragAndDropSupport(parent, this.container);
    this.handleContextKeys();
    this.whenReadyPromise.complete();
    this._isReady = true;
    Promises.settled(this.groups.map((group) => group.whenRestored)).finally(() => {
      this.whenRestoredPromise.complete();
    });
    return this.container;
  }
  handleContextKeys() {
    EditorAreaFocusContext.bindTo(this.scopedContextKeyService).set(true);
    const multipleEditorGroupsContext = EditorPartMultipleEditorGroupsContext.bindTo(this.scopedContextKeyService);
    const maximizedEditorGroupContext = EditorPartMaximizedEditorGroupContext.bindTo(this.scopedContextKeyService);
    const editorTabsVisibleContext = EditorTabsVisibleContext.bindTo(this.scopedContextKeyService);
    const updateContextKeys = () => {
      const groupCount = this.count;
      if (groupCount > 1) {
        multipleEditorGroupsContext.set(true);
      } else {
        multipleEditorGroupsContext.reset();
      }
      if (this.hasMaximizedGroup()) {
        maximizedEditorGroupContext.set(true);
      } else {
        maximizedEditorGroupContext.reset();
      }
    };
    const updateEditorTabsVisibleContext = () => {
      editorTabsVisibleContext.set(this.partOptions.showTabs === "multiple");
    };
    const updateTopRightGroupContextKey = () => {
      if (!this.gridWidget || !this._contentDimension) {
        return;
      }
      let topRightGroup;
      for (const group of this.groups) {
        if (this.gridWidget.getNeighborViews(group, Direction.Up).length === 0 && this.gridWidget.getNeighborViews(group, Direction.Right).length === 0) {
          topRightGroup = group;
          break;
        }
      }
      for (const group of this.groups) {
        const contextKey = this.editorPartsView.bind(IsTopRightEditorGroupContext, group);
        contextKey.set(group === topRightGroup);
      }
    };
    updateContextKeys();
    updateEditorTabsVisibleContext();
    updateTopRightGroupContextKey();
    this._register(this.onDidAddGroup(() => {
      updateContextKeys();
      updateTopRightGroupContextKey();
      this.applyContentRightInset();
    }));
    this._register(this.onDidRemoveGroup(() => {
      updateContextKeys();
      updateTopRightGroupContextKey();
      this.applyContentRightInset();
    }));
    this._register(this.onDidChangeGroupMaximized(() => {
      updateContextKeys();
      this.applyContentRightInset();
    }));
    this._register(this.onDidChangeEditorPartOptions(() => updateEditorTabsVisibleContext()));
    this._register(this.onDidMoveGroup(() => {
      updateTopRightGroupContextKey();
      this.applyContentRightInset();
    }));
    this._register(this.onDidLayout(() => updateTopRightGroupContextKey()));
  }
  setupDragAndDropSupport(parent, container) {
    this._register(this.createEditorDropTarget(container, /* @__PURE__ */ Object.create(null)));
    const overlay = $(".drop-block-overlay");
    parent.appendChild(overlay);
    this._register(addDisposableGenericMouseDownListener(overlay, () => overlay.classList.remove("visible")));
    this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(this.element, {
      onDragStart: (e) => overlay.classList.add("visible"),
      onDragEnd: (e) => overlay.classList.remove("visible")
    }));
    let horizontalOpenerTimeout;
    let verticalOpenerTimeout;
    let lastOpenHorizontalPosition;
    let lastOpenVerticalPosition;
    const openPartAtPosition = (position) => {
      if (!this.layoutService.isVisible(Parts.PANEL_PART) && position === this.layoutService.getPanelPosition()) {
        this.layoutService.setPartHidden(false, Parts.PANEL_PART);
      } else if (!this.layoutService.isVisible(Parts.AUXILIARYBAR_PART) && position === (this.layoutService.getSideBarPosition() === Position.RIGHT ? Position.LEFT : Position.RIGHT)) {
        this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
      }
    };
    const clearAllTimeouts = () => {
      if (horizontalOpenerTimeout) {
        clearTimeout(horizontalOpenerTimeout);
        horizontalOpenerTimeout = void 0;
      }
      if (verticalOpenerTimeout) {
        clearTimeout(verticalOpenerTimeout);
        verticalOpenerTimeout = void 0;
      }
    };
    this._register(CompositeDragAndDropObserver.INSTANCE.registerTarget(overlay, {
      onDragOver: (e) => {
        EventHelper.stop(e.eventData, true);
        if (e.eventData.dataTransfer) {
          e.eventData.dataTransfer.dropEffect = "none";
        }
        const boundingRect = overlay.getBoundingClientRect();
        let openHorizontalPosition = void 0;
        let openVerticalPosition = void 0;
        const proximity = 100;
        if (e.eventData.clientX < boundingRect.left + proximity) {
          openHorizontalPosition = Position.LEFT;
        }
        if (e.eventData.clientX > boundingRect.right - proximity) {
          openHorizontalPosition = Position.RIGHT;
        }
        if (e.eventData.clientY > boundingRect.bottom - proximity) {
          openVerticalPosition = Position.BOTTOM;
        }
        if (e.eventData.clientY < boundingRect.top + proximity) {
          openVerticalPosition = Position.TOP;
        }
        if (horizontalOpenerTimeout && openHorizontalPosition !== lastOpenHorizontalPosition) {
          clearTimeout(horizontalOpenerTimeout);
          horizontalOpenerTimeout = void 0;
        }
        if (verticalOpenerTimeout && openVerticalPosition !== lastOpenVerticalPosition) {
          clearTimeout(verticalOpenerTimeout);
          verticalOpenerTimeout = void 0;
        }
        if (!horizontalOpenerTimeout && openHorizontalPosition !== void 0) {
          lastOpenHorizontalPosition = openHorizontalPosition;
          horizontalOpenerTimeout = setTimeout(() => openPartAtPosition(openHorizontalPosition), 200);
        }
        if (!verticalOpenerTimeout && openVerticalPosition !== void 0) {
          lastOpenVerticalPosition = openVerticalPosition;
          verticalOpenerTimeout = setTimeout(() => openPartAtPosition(openVerticalPosition), 200);
        }
      },
      onDragLeave: () => clearAllTimeouts(),
      onDragEnd: () => clearAllTimeouts(),
      onDrop: () => clearAllTimeouts()
    }));
    this._register(toDisposable(() => clearAllTimeouts()));
  }
  centerLayout(active) {
    this.centeredLayoutWidget.activate(active);
  }
  isLayoutCentered() {
    if (this.centeredLayoutWidget) {
      return this.centeredLayoutWidget.isActive();
    }
    return false;
  }
  doCreateGridControl() {
    let restoreError = false;
    if (this._willRestoreState) {
      restoreError = !this.doCreateGridControlWithPreviousState();
    }
    if (!this.gridWidget || restoreError) {
      const initialGroup = this.doCreateGroupView();
      this.doSetGridWidget(new SerializableGrid(initialGroup));
      this.doSetGroupActive(initialGroup);
    }
    this.updateContainer();
    this.notifyGroupIndexChange();
  }
  doCreateGridControlWithPreviousState() {
    const state = this.loadState();
    if (state?.serializedGrid) {
      try {
        this.mostRecentActiveGroups = state.mostRecentActiveGroups;
        this.doCreateGridControlWithState(state.serializedGrid, state.activeGroup);
      } catch (error) {
        onUnexpectedError(new Error(`Error restoring editor grid widget: ${error} (with state: ${JSON.stringify(state)})`));
        this.disposeGroups();
        return false;
      }
    }
    return true;
  }
  doCreateGridControlWithState(serializedGrid, activeGroupId, editorGroupViewsToReuse, options) {
    let reuseGroupViews;
    if (editorGroupViewsToReuse) {
      reuseGroupViews = editorGroupViewsToReuse.slice(0);
    } else {
      reuseGroupViews = [];
    }
    const groupViews = [];
    const gridWidget = SerializableGrid.deserialize(serializedGrid, {
      fromJSON: (serializedEditorGroup) => {
        let groupView;
        if (reuseGroupViews.length > 0) {
          groupView = reuseGroupViews.shift();
        } else {
          groupView = this.doCreateGroupView(serializedEditorGroup, options);
        }
        groupViews.push(groupView);
        if (groupView.id === activeGroupId) {
          this.doSetGroupActive(groupView);
        }
        return groupView;
      }
    }, { styles: { separatorBorder: this.gridSeparatorBorder } });
    if (!this._activeGroup) {
      this.doSetGroupActive(groupViews[0]);
    }
    if (this.mostRecentActiveGroups.some((groupId) => !this.getGroup(groupId))) {
      this.mostRecentActiveGroups = groupViews.map((group) => group.id);
    }
    this.doSetGridWidget(gridWidget);
  }
  doSetGridWidget(gridWidget) {
    let boundarySashes = {};
    if (this.gridWidget) {
      boundarySashes = this.gridWidget.boundarySashes;
      this.gridWidget.dispose();
    }
    this.gridWidget = gridWidget;
    this.gridWidget.boundarySashes = boundarySashes;
    this.gridWidgetView.gridWidget = gridWidget;
    this._onDidChangeSizeConstraints.input = gridWidget.onDidChange;
    this._onDidScroll.input = gridWidget.onDidScroll;
    this.gridWidgetDisposables.clear();
    this.gridWidgetDisposables.add(gridWidget.onDidChangeViewMaximized((maximized) => this._onDidChangeGroupMaximized.fire(maximized)));
    this.onDidSetGridWidget.fire(void 0);
  }
  updateContainer() {
    this.container.classList.toggle("empty", this.isEmpty);
  }
  notifyGroupIndexChange() {
    this.getGroups(GroupsOrder.GRID_APPEARANCE).forEach((group, index) => group.notifyIndexChanged(index));
  }
  notifyGroupsLabelChange(newLabel) {
    for (const group of this.groups) {
      group.notifyLabelChanged(newLabel);
    }
  }
  get isEmpty() {
    return this.count === 1 && this._activeGroup.isEmpty;
  }
  setBoundarySashes(sashes) {
    this.gridWidget.boundarySashes = sashes;
    this.centeredLayoutWidget.boundarySashes = sashes;
  }
  layout(width, height, top, left) {
    this.top = top;
    this.left = left;
    if (this.windowId === mainWindow.vscodeWindowId && this.layoutService.isFloatingPanelsEnabled()) {
      const owners = getFloatingOuterEdgeOwners(this.layoutService);
      const outerLeft = owners.left === Parts.EDITOR_PART;
      const outerRight = owners.right === Parts.EDITOR_PART;
      const leftMargin = outerLeft ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_MARGIN;
      const rightMargin = outerRight ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN;
      width = Math.max(0, width - leftMargin - rightMargin);
      const { topMargin, bottomMargin } = this.getFloatingPanelHeightInsets();
      height = Math.max(0, height - topMargin - bottomMargin);
      if (!this.element.classList.contains("modal-editor-part")) {
        width = Math.max(0, width - EDITOR_FRAME_BORDER_WIDTH * 2);
        height = Math.max(0, height - EDITOR_FRAME_BORDER_WIDTH * 2);
      }
      this.element.classList.toggle("floating-editor-outer-left", outerLeft);
      this.element.classList.toggle("floating-editor-outer-right", outerRight);
    } else {
      this.element.classList.remove("floating-editor-outer-left", "floating-editor-outer-right");
    }
    const contentAreaSize = super.layoutContents(width, height).contentSize;
    this.doLayout(Dimension.lift(contentAreaSize), top, left);
  }
  /**
   * Returns the top and bottom margins (in pixels) to subtract from the editor height
   * when the floating panels experiment is active. Accounts for panel position (a top
   * panel pushes the editor down) and status bar visibility (hidden status bar means
   * the editor is at the window bottom edge and gets a doubled bottom margin).
   */
  getFloatingPanelHeightInsets() {
    const panelVisible = this.layoutService.isVisible(Parts.PANEL_PART);
    const panelAtTop = panelVisible && this.layoutService.getPanelPosition() === Position.TOP;
    const panelAtBottom = panelVisible && this.layoutService.getPanelPosition() === Position.BOTTOM;
    const bottomMargin = !this.layoutService.isVisible(Parts.STATUSBAR_PART, mainWindow) && !panelAtBottom ? FLOATING_PANEL_MARGIN * 2 : FLOATING_PANEL_INNER_MARGIN;
    return { topMargin: panelAtTop ? FLOATING_PANEL_MARGIN : 0, bottomMargin };
  }
  doLayout(dimension, top = this.top, left = this.left) {
    this._contentDimension = dimension;
    this.centeredLayoutWidget.layout(this._contentDimension.width, this._contentDimension.height, top, left);
    this._onDidLayout.fire(dimension);
  }
  saveState() {
    if (this.gridWidget) {
      if (this.isEmpty) {
        delete this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
      } else {
        this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY] = this.createState();
      }
    }
    if (this.centeredLayoutWidget) {
      const centeredLayoutState = this.centeredLayoutWidget.state;
      if (this.centeredLayoutWidget.isDefault(centeredLayoutState)) {
        delete this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY];
      } else {
        this.profileMemento[EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY] = centeredLayoutState;
      }
    }
    super.saveState();
  }
  loadState() {
    return this.workspaceMemento[EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY];
  }
  createState() {
    return {
      serializedGrid: this.gridWidget.serialize(),
      activeGroup: this._activeGroup.id,
      mostRecentActiveGroups: this.mostRecentActiveGroups
    };
  }
  applyState(state, options) {
    if (state === "empty") {
      return this.doApplyEmptyState();
    } else {
      return this.doApplyState(state, options);
    }
  }
  async doApplyState(state, options) {
    const groups = await this.doPrepareApplyState();
    this._onDidAddGroup.pause();
    this._onDidRemoveGroup.pause();
    this.disposeGroups();
    this.mostRecentActiveGroups = state.mostRecentActiveGroups;
    try {
      this.doApplyGridState(state.serializedGrid, state.activeGroup, void 0, options);
    } finally {
      this._onDidRemoveGroup.resume();
      this._onDidAddGroup.resume();
    }
    await this.activeGroup.openEditors(
      groups.flatMap((group) => group.editors).filter((editor) => this.editorPartsView.groups.every((groupView) => !groupView.contains(editor))).map((editor) => ({
        editor,
        options: { pinned: true, preserveFocus: true, inactive: true }
      }))
    );
  }
  async doApplyEmptyState() {
    await this.doPrepareApplyState();
    this.mergeAllGroups(this.activeGroup);
  }
  async doPrepareApplyState() {
    const groups = this.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    for (const group of groups) {
      await group.closeAllEditors({ excludeConfirming: true });
    }
    return groups;
  }
  doApplyGridState(gridState, activeGroupId, editorGroupViewsToReuse, options) {
    this.doCreateGridControlWithState(gridState, activeGroupId, editorGroupViewsToReuse, options);
    if (this._contentDimension) {
      this.doLayout(this._contentDimension);
    }
    this.updateContainer();
    for (const groupView of this.getGroups(GroupsOrder.GRID_APPEARANCE)) {
      if (!editorGroupViewsToReuse?.includes(groupView)) {
        this._onDidAddGroup.fire(groupView);
      }
    }
    this.notifyGroupIndexChange();
  }
  onDidChangeMementoState(e) {
    if (e.external && e.scope === StorageScope.WORKSPACE) {
      this.reloadMemento(e.scope);
      const state = this.loadState();
      if (state) {
        this.applyState(state);
      }
    }
  }
  toJSON() {
    return {
      type: Parts.EDITOR_PART
    };
  }
  disposeGroups() {
    for (const group of this.groups) {
      group.dispose();
      this._onDidRemoveGroup.fire(group);
    }
    this.groupViews.clear();
    this.mostRecentActiveGroups = [];
  }
  dispose() {
    this._onWillDispose.fire();
    this.disposeGroups();
    this.gridWidget?.dispose();
    super.dispose();
  }
  //#endregion
};
EditorPart.EDITOR_PART_UI_STATE_STORAGE_KEY = "editorpart.state";
EditorPart.EDITOR_PART_CENTERED_VIEW_STORAGE_KEY = "editorpart.centeredview";
EditorPart = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IContextKeyService)
], EditorPart);
let MainEditorPart = class extends EditorPart {
  constructor(editorPartsView, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
    super(editorPartsView, Parts.EDITOR_PART, "", mainWindow.vscodeWindowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
  }
};
MainEditorPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IHostService),
  __decorateParam(7, IContextKeyService)
], MainEditorPart);
export {
  EditorPart,
  MainEditorPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUGFydCB9IGZyb20gJy4uLy4uL3BhcnQuanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uLCAkLCBFdmVudEhlbHBlciwgYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lciwgZ2V0V2luZG93LCBpc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50LCBnZXRBY3RpdmVFbGVtZW50LCBpc0hUTUxFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciwgUmVsYXksIFBhdXNlYWJsZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb250cmFzdEJvcmRlciwgZWRpdG9yQmFja2dyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEdyb3VwRGlyZWN0aW9uLCBHcm91cHNBcnJhbmdlbWVudCwgR3JvdXBPcmllbnRhdGlvbiwgSU1lcmdlR3JvdXBPcHRpb25zLCBNZXJnZUdyb3VwTW9kZSwgR3JvdXBzT3JkZXIsIEdyb3VwTG9jYXRpb24sIElGaW5kR3JvdXBTY29wZSwgRWRpdG9yR3JvdXBMYXlvdXQsIEdyb3VwTGF5b3V0QXJndW1lbnQsIElFZGl0b3JTaWRlR3JvdXAsIElFZGl0b3JEcm9wVGFyZ2V0RGVsZWdhdGUsIElFZGl0b3JQYXJ0LCBHcm91cEFjdGl2YXRpb25SZWFzb24sIElFZGl0b3JHcm91cEFjdGl2YXRpb25FdmVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElWaWV3LCBvcnRob2dvbmFsLCBMYXlvdXRQcmlvcml0eSwgSVZpZXdTaXplLCBEaXJlY3Rpb24sIFNlcmlhbGl6YWJsZUdyaWQsIFNpemluZywgSVNlcmlhbGl6ZWRHcmlkLCBJU2VyaWFsaXplZE5vZGUsIE9yaWVudGF0aW9uLCBHcmlkQnJhbmNoTm9kZSwgaXNHcmlkQnJhbmNoTm9kZSwgR3JpZE5vZGUsIGNyZWF0ZVNlcmlhbGl6ZWRHcmlkLCBHcmlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2dyaWQvZ3JpZC5qcyc7XG5pbXBvcnQgeyBHcm91cElkZW50aWZpZXIsIEVkaXRvcklucHV0V2l0aE9wdGlvbnMsIElFZGl0b3JQYXJ0T3B0aW9ucywgSUVkaXRvclBhcnRPcHRpb25zQ2hhbmdlRXZlbnQsIEdyb3VwTW9kZWxDaGFuZ2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFRElUT1JfR1JPVVBfQk9SREVSLCBFRElUT1JfUEFORV9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGRpc3RpbmN0LCBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBWaWV3LCBnZXRFZGl0b3JQYXJ0T3B0aW9ucywgaW1wYWN0c0VkaXRvclBhcnRPcHRpb25zLCBJRWRpdG9yUGFydENyZWF0aW9uT3B0aW9ucywgSUVkaXRvclBhcnRzVmlldywgSUVkaXRvckdyb3Vwc1ZpZXcsIElFZGl0b3JHcm91cFZpZXdPcHRpb25zIH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBWaWV3IH0gZnJvbSAnLi9lZGl0b3JHcm91cFZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSwgdG9EaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBJU3RvcmFnZVZhbHVlQ2hhbmdlRXZlbnQsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVNlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsLCBpc1NlcmlhbGl6ZWRFZGl0b3JHcm91cE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IEVkaXRvckRyb3BUYXJnZXQgfSBmcm9tICcuL2VkaXRvckRyb3BUYXJnZXQuanMnO1xuaW1wb3J0IHsgQ29sb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBDZW50ZXJlZFZpZXdMYXlvdXQsIENlbnRlcmVkVmlld1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NlbnRlcmVkL2NlbnRlcmVkVmlld0xheW91dC5qcyc7XG5pbXBvcnQgeyBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBQYXJ0cywgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBvc2l0aW9uLCBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU4sIEZMT0FUSU5HX1BBTkVMX01BUkdJTiwgZ2V0RmxvYXRpbmdPdXRlckVkZ2VPd25lcnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IERlZXBQYXJ0aWFsLCBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlciB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZmluZEdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cEZpbmRlci5qcyc7XG5pbXBvcnQgeyBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCb3VuZGFyeVNhc2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zYXNoL3Nhc2guanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckFyZWFGb2N1c0NvbnRleHQsIEVkaXRvclBhcnRNYXhpbWl6ZWRFZGl0b3JHcm91cENvbnRleHQsIEVkaXRvclBhcnRNdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQsIEVkaXRvclRhYnNWaXNpYmxlQ29udGV4dCwgSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5cbi8qKlxuICogVGhlIHdpZHRoIChpbiBwaXhlbHMpIG9mIHRoZSBlZGl0b3IgY2FyZCBib3JkZXIgZHJhd24gb24gZXZlcnkgc2lkZSB3aGVuIHRoZVxuICogTW9kZXJuIFVJIFVwZGF0ZSBleHBlcmltZW50IGlzIGVuYWJsZWQgKGBzdHlsZU92ZXJyaWRlcy9tZWRpYS9lZGl0b3JCb3JkZXIuY3NzYCkuXG4gKiBUaGUgZWRpdG9yIHJlc2VydmVzIHRoaXMgdGhpY2tuZXNzIHdoZW4gbGF5aW5nIG91dCBpdHMgY29udGVudHMgc28gdGhleSBzaXRcbiAqIGluc2lkZSB0aGUgZnJhbWUgaW5zdGVhZCBvZiBvdmVyZmxvd2luZyAoYW5kIGJlaW5nIGNsaXBwZWQgYnkpIHRoZSBib3JkZXIuXG4gKiBLZWVwIGluIHN5bmMgd2l0aCB0aGUgYC0tdnNjb2RlLXN0cm9rZVRoaWNrbmVzc2AgKDFweCkgdG9rZW4gdXNlZCB0aGVyZS5cbiAqL1xuY29uc3QgRURJVE9SX0ZSQU1FX0JPUkRFUl9XSURUSCA9IDE7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvclBhcnRVSVN0YXRlIHtcblx0cmVhZG9ubHkgc2VyaWFsaXplZEdyaWQ6IElTZXJpYWxpemVkR3JpZDtcblx0cmVhZG9ubHkgYWN0aXZlR3JvdXA6IEdyb3VwSWRlbnRpZmllcjtcblx0cmVhZG9ubHkgbW9zdFJlY2VudEFjdGl2ZUdyb3VwczogR3JvdXBJZGVudGlmaWVyW107XG59XG5cbmludGVyZmFjZSBJRWRpdG9yUGFydE1lbWVudG8ge1xuXHQnZWRpdG9ycGFydC5zdGF0ZSc/OiBJRWRpdG9yUGFydFVJU3RhdGU7XG5cdCdlZGl0b3JwYXJ0LmNlbnRlcmVkdmlldyc/OiBDZW50ZXJlZFZpZXdTdGF0ZTtcbn1cblxuY2xhc3MgR3JpZFdpZGdldFZpZXc8VCBleHRlbmRzIElWaWV3PiBpbXBsZW1lbnRzIElWaWV3IHtcblxuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudCA9ICQoJy5ncmlkLXZpZXctY29udGFpbmVyJyk7XG5cblx0Z2V0IG1pbmltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkV2lkZ2V0ID8gdGhpcy5ncmlkV2lkZ2V0Lm1pbmltdW1XaWR0aCA6IDA7IH1cblx0Z2V0IG1heGltdW1XaWR0aCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkV2lkZ2V0ID8gdGhpcy5ncmlkV2lkZ2V0Lm1heGltdW1XaWR0aCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5ncmlkV2lkZ2V0ID8gdGhpcy5ncmlkV2lkZ2V0Lm1pbmltdW1IZWlnaHQgOiAwOyB9XG5cdGdldCBtYXhpbXVtSGVpZ2h0KCk6IG51bWJlciB7IHJldHVybiB0aGlzLmdyaWRXaWRnZXQgPyB0aGlzLmdyaWRXaWRnZXQubWF4aW11bUhlaWdodCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlID0gbmV3IFJlbGF5PHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIF9ncmlkV2lkZ2V0OiBHcmlkPFQ+IHwgdW5kZWZpbmVkO1xuXG5cdGdldCBncmlkV2lkZ2V0KCk6IEdyaWQ8VD4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ncmlkV2lkZ2V0O1xuXHR9XG5cblx0c2V0IGdyaWRXaWRnZXQoZ3JpZDogR3JpZDxUPiB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuZWxlbWVudC50ZXh0Q29udGVudCA9ICcnO1xuXG5cdFx0aWYgKGdyaWQpIHtcblx0XHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuaW5wdXQgPSBncmlkLm9uRGlkQ2hhbmdlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5pbnB1dCA9IEV2ZW50Lk5vbmU7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZ3JpZFdpZGdldCA9IGdyaWQ7XG5cdH1cblxuXHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmdyaWRXaWRnZXQ/LmxheW91dCh3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEVkaXRvclBhcnQgZXh0ZW5kcyBQYXJ0PElFZGl0b3JQYXJ0TWVtZW50bz4gaW1wbGVtZW50cyBJRWRpdG9yUGFydCwgSUVkaXRvckdyb3Vwc1ZpZXcge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVESVRPUl9QQVJUX1VJX1NUQVRFX1NUT1JBR0VfS0VZID0gJ2VkaXRvcnBhcnQuc3RhdGUnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFRElUT1JfUEFSVF9DRU5URVJFRF9WSUVXX1NUT1JBR0VfS0VZID0gJ2VkaXRvcnBhcnQuY2VudGVyZWR2aWV3JztcblxuXHQvLyNyZWdpb24gRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRGb2N1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZEZvY3VzID0gdGhpcy5fb25EaWRGb2N1cy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpbWVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0ID0gdGhpcy5fb25EaWRMYXlvdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VBY3RpdmVHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUFjdGl2ZUdyb3VwID0gdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwSW5kZXggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VHcm91cEluZGV4ID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cEluZGV4LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlR3JvdXBMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwTGFiZWwgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwTGFiZWwuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VHcm91cExvY2tlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cFZpZXc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUdyb3VwTG9ja2VkID0gdGhpcy5fb25EaWRDaGFuZ2VHcm91cExvY2tlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlR3JvdXBNYXhpbWl6ZWQgPSB0aGlzLl9vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWN0aXZhdGVHcm91cCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JHcm91cEFjdGl2YXRpb25FdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aXZhdGVHcm91cCA9IHRoaXMuX29uRGlkQWN0aXZhdGVHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEFkZEdyb3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IFBhdXNlYWJsZUVtaXR0ZXI8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWRkR3JvdXAgPSB0aGlzLl9vbkRpZEFkZEdyb3VwLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVtb3ZlR3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGF1c2VhYmxlRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZW1vdmVHcm91cCA9IHRoaXMuX29uRGlkUmVtb3ZlR3JvdXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRNb3ZlR3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRWRpdG9yR3JvdXBWaWV3PigpKTtcblx0cmVhZG9ubHkgb25EaWRNb3ZlR3JvdXAgPSB0aGlzLl9vbkRpZE1vdmVHcm91cC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkU2V0R3JpZFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVsYXk8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSBFdmVudC5hbnkodGhpcy5vbkRpZFNldEdyaWRXaWRnZXQuZXZlbnQsIHRoaXMuX29uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzLmV2ZW50KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNjcm9sbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZWxheTx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTY3JvbGwgPSBFdmVudC5hbnkodGhpcy5vbkRpZFNldEdyaWRXaWRnZXQuZXZlbnQsIHRoaXMuX29uRGlkU2Nyb2xsLmV2ZW50KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUVkaXRvclBhcnRPcHRpb25zQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zID0gdGhpcy5fb25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlTWVtZW50byA9IHRoaXMuZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb2ZpbGVNZW1lbnRvID0gdGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBWaWV3cyA9IG5ldyBNYXA8R3JvdXBJZGVudGlmaWVyLCBJRWRpdG9yR3JvdXBWaWV3PigpO1xuXHRwcml2YXRlIG1vc3RSZWNlbnRBY3RpdmVHcm91cHM6IEdyb3VwSWRlbnRpZmllcltdID0gW107XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRhaW5lciA9ICQoJy5jb250ZW50Jyk7XG5cblx0cmVhZG9ubHkgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2U7XG5cblx0cHJpdmF0ZSBjZW50ZXJlZExheW91dFdpZGdldCE6IENlbnRlcmVkVmlld0xheW91dDtcblxuXHRwcml2YXRlIGdyaWRXaWRnZXQhOiBTZXJpYWxpemFibGVHcmlkPElFZGl0b3JHcm91cFZpZXc+O1xuXHRwcml2YXRlIHJlYWRvbmx5IGdyaWRXaWRnZXREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZ3JpZFdpZGdldFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgR3JpZFdpZGdldFZpZXc8SUVkaXRvckdyb3VwVmlldz4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ3JvdXBzTGFiZWw6IHN0cmluZyxcblx0XHRyZWFkb25seSB3aW5kb3dJZDogbnVtYmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWQsIHsgaGFzVGl0bGU6IGZhbHNlIH0sIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2UuY3JlYXRlU2NvcGVkKHRoaXMuY29udGFpbmVyKSk7XG5cdFx0dGhpcy5zY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZV1cblx0XHQpKSk7XG5cblx0XHR0aGlzLl9wYXJ0T3B0aW9ucyA9IGdldEVkaXRvclBhcnRPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGhlbWVTZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRoZW1lU2VydmljZS5vbkRpZEZpbGVJY29uVGhlbWVDaGFuZ2UoKCkgPT4gdGhpcy5oYW5kbGVDaGFuZ2VkUGFydE9wdGlvbnMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRDaGFuZ2VNZW1lbnRvVmFsdWUoU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy5fc3RvcmUpKGUgPT4gdGhpcy5vbkRpZENoYW5nZU1lbWVudG9TdGF0ZShlKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGV2ZW50OiBJQ29uZmlndXJhdGlvbkNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGltcGFjdHNFZGl0b3JQYXJ0T3B0aW9ucyhldmVudCkpIHtcblx0XHRcdHRoaXMuaGFuZGxlQ2hhbmdlZFBhcnRPcHRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVDaGFuZ2VkUGFydE9wdGlvbnMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgb2xkUGFydE9wdGlvbnMgPSB0aGlzLl9wYXJ0T3B0aW9ucztcblx0XHRjb25zdCBuZXdQYXJ0T3B0aW9ucyA9IGdldEVkaXRvclBhcnRPcHRpb25zKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGhlbWVTZXJ2aWNlKTtcblxuXHRcdGZvciAoY29uc3QgZW5mb3JjZWRQYXJ0T3B0aW9ucyBvZiB0aGlzLmVuZm9yY2VkUGFydE9wdGlvbnMpIHtcblx0XHRcdE9iamVjdC5hc3NpZ24obmV3UGFydE9wdGlvbnMsIGVuZm9yY2VkUGFydE9wdGlvbnMpOyAvLyBjaGVjayBmb3Igb3ZlcnJpZGVzXG5cdFx0fVxuXG5cdFx0dGhpcy5fcGFydE9wdGlvbnMgPSBuZXdQYXJ0T3B0aW9ucztcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMuZmlyZSh7IG9sZFBhcnRPcHRpb25zLCBuZXdQYXJ0T3B0aW9ucyB9KTtcblx0fVxuXG5cdHByaXZhdGUgZW5mb3JjZWRQYXJ0T3B0aW9uczogRGVlcFBhcnRpYWw8SUVkaXRvclBhcnRPcHRpb25zPltdID0gW107XG5cblx0cHJpdmF0ZSBfcGFydE9wdGlvbnM6IElFZGl0b3JQYXJ0T3B0aW9ucztcblx0Z2V0IHBhcnRPcHRpb25zKCk6IElFZGl0b3JQYXJ0T3B0aW9ucyB7IHJldHVybiB0aGlzLl9wYXJ0T3B0aW9uczsgfVxuXG5cdGVuZm9yY2VQYXJ0T3B0aW9ucyhvcHRpb25zOiBEZWVwUGFydGlhbDxJRWRpdG9yUGFydE9wdGlvbnM+KTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuZW5mb3JjZWRQYXJ0T3B0aW9ucy5wdXNoKG9wdGlvbnMpO1xuXHRcdHRoaXMuaGFuZGxlQ2hhbmdlZFBhcnRPcHRpb25zKCk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuZW5mb3JjZWRQYXJ0T3B0aW9ucy5zcGxpY2UodGhpcy5lbmZvcmNlZFBhcnRPcHRpb25zLmluZGV4T2Yob3B0aW9ucyksIDEpO1xuXHRcdFx0dGhpcy5oYW5kbGVDaGFuZ2VkUGFydE9wdGlvbnMoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9wID0gMDtcblx0cHJpdmF0ZSBsZWZ0ID0gMDtcblx0cHJpdmF0ZSBfY29udGVudERpbWVuc2lvbiE6IERpbWVuc2lvbjtcblx0Z2V0IGNvbnRlbnREaW1lbnNpb24oKTogRGltZW5zaW9uIHsgcmV0dXJuIHRoaXMuX2NvbnRlbnREaW1lbnNpb247IH1cblxuXHRwcml2YXRlIF9jb250ZW50UmlnaHRJbnNldCA9IDA7XG5cblx0LyoqXG5cdCAqIFJlc2VydmVzIGFuIGluc2V0IChweCkgb24gdGhlIHJpZ2h0IG9mIHRoZSBlZGl0b3IgY29udGVudCBvZiB0aGUgZ3JvdXAocykgYXQgdGhlXG5cdCAqIHJpZ2h0IGVkZ2Ugb2YgdGhlIGVkaXRvciBwYXJ0LCB3aGlsZSB0aGUgdGl0bGUgc3RheXMgZnVsbCB3aWR0aCwgc28gYSBkb2NrZWQgcGFuZWxcblx0ICogY2FuIHNpdCBiZXNpZGUgdGhlIGVkaXRvciBjb250ZW50IHVuZGVyIG9uZSBmdWxsLXdpZHRoIHRhYiBiYXIuIE9ubHkgdGhlIHJpZ2h0LWVkZ2Vcblx0ICogZ3JvdXBzIChubyBuZWlnaGJvciB0byB0aGUgcmlnaHQpIGFyZSBpbnNldDsgaW50ZXJpb3IgZ3JvdXBzIGluIGEgc3BsaXQgbGF5b3V0IGtlZXBcblx0ICogZnVsbC13aWR0aCBjb250ZW50LiBSZWNvbXB1dGVkIHdoZW4gdGhlIGdyb3VwIHRvcG9sb2d5IGNoYW5nZXMuIGAwYCAoZGVmYXVsdClcblx0ICogcmVzdG9yZXMgZnVsbC13aWR0aCBjb250ZW50IGZvciBhbGwgZ3JvdXBzLlxuXHQgKi9cblx0c2V0Q29udGVudFJpZ2h0SW5zZXQoaW5zZXQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRSaWdodEluc2V0ID0gTWF0aC5tYXgoMCwgTWF0aC5yb3VuZChpbnNldCkpO1xuXHRcdHRoaXMuYXBwbHlDb250ZW50UmlnaHRJbnNldCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUNvbnRlbnRSaWdodEluc2V0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5ncmlkV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3VwVmlld3MudmFsdWVzKCkpIHtcblx0XHRcdGlmICghKGdyb3VwIGluc3RhbmNlb2YgRWRpdG9yR3JvdXBWaWV3KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSBncm91cHMgYXQgdGhlIHJpZ2h0IGVkZ2Ugb2YgdGhlIGVkaXRvciBwYXJ0IChubyBuZWlnaGJvciB0byB0aGUgcmlnaHQpXG5cdFx0XHQvLyBzaXQgdW5kZXIgdGhlIGRvY2tlZCBwYW5lbCBvdmVybGF5OyBpbnRlcmlvciBncm91cHMga2VlcCBmdWxsLXdpZHRoIGNvbnRlbnQuXG5cdFx0XHRjb25zdCBhdFJpZ2h0RWRnZSA9IHRoaXMuX2NvbnRlbnRSaWdodEluc2V0ID4gMCAmJiB0aGlzLmdyaWRXaWRnZXQuZ2V0TmVpZ2hib3JWaWV3cyhncm91cCwgRGlyZWN0aW9uLlJpZ2h0KS5sZW5ndGggPT09IDA7XG5cdFx0XHRncm91cC5zZXRDb250ZW50UmlnaHRJbnNldChhdFJpZ2h0RWRnZSA/IHRoaXMuX2NvbnRlbnRSaWdodEluc2V0IDogMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZlR3JvdXAhOiBJRWRpdG9yR3JvdXBWaWV3O1xuXHRnZXQgYWN0aXZlR3JvdXAoKTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUdyb3VwO1xuXHR9XG5cblx0cmVhZG9ubHkgc2lkZUdyb3VwOiBJRWRpdG9yU2lkZUdyb3VwID0ge1xuXHRcdG9wZW5FZGl0b3I6IGFzeW5jIChlZGl0b3IsIG9wdGlvbnMpID0+IHtcblx0XHRcdGNvbnN0IGZpbmRHcm91cFJlc3VsdCA9IHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4gZmluZEdyb3VwKGFjY2Vzc29yLCB7IGVkaXRvciwgb3B0aW9ucyB9LCBTSURFX0dST1VQKSk7XG5cdFx0XHRsZXQgZ3JvdXA7XG5cdFx0XHRpZiAoZmluZEdyb3VwUmVzdWx0IGluc3RhbmNlb2YgUHJvbWlzZSkge1xuXHRcdFx0XHQoW2dyb3VwXSA9IGF3YWl0IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQoW2dyb3VwXSA9IGZpbmRHcm91cFJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZ3JvdXAub3BlbkVkaXRvcihlZGl0b3IsIG9wdGlvbnMpO1xuXHRcdH1cblx0fTtcblxuXHRnZXQgZ3JvdXBzKCk6IElFZGl0b3JHcm91cFZpZXdbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5ncm91cFZpZXdzLnZhbHVlcygpKTtcblx0fVxuXG5cdGdldCBjb3VudCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdyb3VwVmlld3Muc2l6ZTtcblx0fVxuXG5cdGdldCBvcmllbnRhdGlvbigpOiBHcm91cE9yaWVudGF0aW9uIHtcblx0XHRyZXR1cm4gKHRoaXMuZ3JpZFdpZGdldCAmJiB0aGlzLmdyaWRXaWRnZXQub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLlZFUlRJQ0FMKSA/IEdyb3VwT3JpZW50YXRpb24uVkVSVElDQUwgOiBHcm91cE9yaWVudGF0aW9uLkhPUklaT05UQUw7XG5cdH1cblxuXHRwcml2YXRlIF9pc1JlYWR5ID0gZmFsc2U7XG5cdGdldCBpc1JlYWR5KCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5faXNSZWFkeTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2hlblJlYWR5UHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0cmVhZG9ubHkgd2hlblJlYWR5ID0gdGhpcy53aGVuUmVhZHlQcm9taXNlLnA7XG5cblx0cHJpdmF0ZSByZWFkb25seSB3aGVuUmVzdG9yZWRQcm9taXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRyZWFkb25seSB3aGVuUmVzdG9yZWQgPSB0aGlzLndoZW5SZXN0b3JlZFByb21pc2UucDtcblxuXHRnZXQgaGFzUmVzdG9yYWJsZVN0YXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMud29ya3NwYWNlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX1VJX1NUQVRFX1NUT1JBR0VfS0VZXTtcblx0fVxuXG5cdHByaXZhdGUgX3dpbGxSZXN0b3JlU3RhdGUgPSBmYWxzZTtcblx0Z2V0IHdpbGxSZXN0b3JlU3RhdGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl93aWxsUmVzdG9yZVN0YXRlOyB9XG5cblx0Z2V0R3JvdXBzKG9yZGVyID0gR3JvdXBzT3JkZXIuQ1JFQVRJT05fVElNRSk6IElFZGl0b3JHcm91cFZpZXdbXSB7XG5cdFx0c3dpdGNoIChvcmRlcikge1xuXHRcdFx0Y2FzZSBHcm91cHNPcmRlci5DUkVBVElPTl9USU1FOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5ncm91cHM7XG5cblx0XHRcdGNhc2UgR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkU6IHtcblx0XHRcdFx0Y29uc3QgbW9zdFJlY2VudEFjdGl2ZSA9IGNvYWxlc2NlKHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3Vwcy5tYXAoZ3JvdXBJZCA9PiB0aGlzLmdldEdyb3VwKGdyb3VwSWQpKSk7XG5cblx0XHRcdFx0Ly8gdGhlcmUgY2FuIGJlIGdyb3VwcyB0aGF0IGdvdCBuZXZlciBhY3RpdmUsIGV2ZW4gdGhvdWdoIHRoZXkgZXhpc3QuIGluIHRoaXMgY2FzZVxuXHRcdFx0XHQvLyBtYWtlIHN1cmUgdG8ganVzdCBhcHBlbmQgdGhlbSBhdCB0aGUgZW5kIHNvIHRoYXQgYWxsIGdyb3VwcyBhcmUgcmV0dXJuZWQgcHJvcGVybHlcblx0XHRcdFx0cmV0dXJuIGRpc3RpbmN0KFsuLi5tb3N0UmVjZW50QWN0aXZlLCAuLi50aGlzLmdyb3Vwc10pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0U6IHtcblx0XHRcdFx0Y29uc3Qgdmlld3M6IElFZGl0b3JHcm91cFZpZXdbXSA9IFtdO1xuXHRcdFx0XHRpZiAodGhpcy5ncmlkV2lkZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5maWxsR3JpZE5vZGVzKHZpZXdzLCB0aGlzLmdyaWRXaWRnZXQuZ2V0Vmlld3MoKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdmlld3M7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaWxsR3JpZE5vZGVzKHRhcmdldDogSUVkaXRvckdyb3VwVmlld1tdLCBub2RlOiBHcmlkQnJhbmNoTm9kZTxJRWRpdG9yR3JvdXBWaWV3PiB8IEdyaWROb2RlPElFZGl0b3JHcm91cFZpZXc+KTogdm9pZCB7XG5cdFx0aWYgKGlzR3JpZEJyYW5jaE5vZGUobm9kZSkpIHtcblx0XHRcdG5vZGUuY2hpbGRyZW4uZm9yRWFjaChjaGlsZCA9PiB0aGlzLmZpbGxHcmlkTm9kZXModGFyZ2V0LCBjaGlsZCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXJnZXQucHVzaChub2RlLnZpZXcpO1xuXHRcdH1cblx0fVxuXG5cdGhhc0dyb3VwKGlkZW50aWZpZXI6IEdyb3VwSWRlbnRpZmllcik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmdyb3VwVmlld3MuaGFzKGlkZW50aWZpZXIpO1xuXHR9XG5cblx0Z2V0R3JvdXAoaWRlbnRpZmllcjogR3JvdXBJZGVudGlmaWVyKTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBWaWV3cy5nZXQoaWRlbnRpZmllcik7XG5cdH1cblxuXHRmaW5kR3JvdXAoc2NvcGU6IElGaW5kR3JvdXBTY29wZSwgc291cmNlOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVHcm91cCwgd3JhcD86IGJvb2xlYW4pOiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIGJ5IGRpcmVjdGlvblxuXHRcdGlmICh0eXBlb2Ygc2NvcGUuZGlyZWN0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9GaW5kR3JvdXBCeURpcmVjdGlvbihzY29wZS5kaXJlY3Rpb24sIHNvdXJjZSwgd3JhcCk7XG5cdFx0fVxuXG5cdFx0Ly8gYnkgbG9jYXRpb25cblx0XHRpZiAodHlwZW9mIHNjb3BlLmxvY2F0aW9uID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuZG9GaW5kR3JvdXBCeUxvY2F0aW9uKHNjb3BlLmxvY2F0aW9uLCBzb3VyY2UsIHdyYXApO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBhcmd1bWVudHMnKTtcblx0fVxuXG5cdHByaXZhdGUgZG9GaW5kR3JvdXBCeURpcmVjdGlvbihkaXJlY3Rpb246IEdyb3VwRGlyZWN0aW9uLCBzb3VyY2U6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIHdyYXA/OiBib29sZWFuKTogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc291cmNlR3JvdXBWaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcoc291cmNlKTtcblxuXHRcdC8vIEZpbmQgbmVpZ2hib3VycyBhbmQgc29ydCBieSBvdXIgTVJVIGxpc3Rcblx0XHRjb25zdCBuZWlnaGJvdXJzID0gdGhpcy5ncmlkV2lkZ2V0LmdldE5laWdoYm9yVmlld3Moc291cmNlR3JvdXBWaWV3LCB0aGlzLnRvR3JpZFZpZXdEaXJlY3Rpb24oZGlyZWN0aW9uKSwgd3JhcCk7XG5cdFx0bmVpZ2hib3Vycy5zb3J0KCgobjEsIG4yKSA9PiB0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuaW5kZXhPZihuMS5pZCkgLSB0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuaW5kZXhPZihuMi5pZCkpKTtcblxuXHRcdHJldHVybiBuZWlnaGJvdXJzWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0ZpbmRHcm91cEJ5TG9jYXRpb24obG9jYXRpb246IEdyb3VwTG9jYXRpb24sIHNvdXJjZTogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgd3JhcD86IGJvb2xlYW4pOiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzb3VyY2VHcm91cFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhzb3VyY2UpO1xuXHRcdGNvbnN0IGdyb3VwcyA9IHRoaXMuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSk7XG5cdFx0Y29uc3QgaW5kZXggPSBncm91cHMuaW5kZXhPZihzb3VyY2VHcm91cFZpZXcpO1xuXG5cdFx0c3dpdGNoIChsb2NhdGlvbikge1xuXHRcdFx0Y2FzZSBHcm91cExvY2F0aW9uLkZJUlNUOlxuXHRcdFx0XHRyZXR1cm4gZ3JvdXBzWzBdO1xuXHRcdFx0Y2FzZSBHcm91cExvY2F0aW9uLkxBU1Q6XG5cdFx0XHRcdHJldHVybiBncm91cHNbZ3JvdXBzLmxlbmd0aCAtIDFdO1xuXHRcdFx0Y2FzZSBHcm91cExvY2F0aW9uLk5FWFQ6IHtcblx0XHRcdFx0bGV0IG5leHRHcm91cDogSUVkaXRvckdyb3VwVmlldyB8IHVuZGVmaW5lZCA9IGdyb3Vwc1tpbmRleCArIDFdO1xuXHRcdFx0XHRpZiAoIW5leHRHcm91cCAmJiB3cmFwKSB7XG5cdFx0XHRcdFx0bmV4dEdyb3VwID0gdGhpcy5kb0ZpbmRHcm91cEJ5TG9jYXRpb24oR3JvdXBMb2NhdGlvbi5GSVJTVCwgc291cmNlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBuZXh0R3JvdXA7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEdyb3VwTG9jYXRpb24uUFJFVklPVVM6IHtcblx0XHRcdFx0bGV0IHByZXZpb3VzR3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQgPSBncm91cHNbaW5kZXggLSAxXTtcblx0XHRcdFx0aWYgKCFwcmV2aW91c0dyb3VwICYmIHdyYXApIHtcblx0XHRcdFx0XHRwcmV2aW91c0dyb3VwID0gdGhpcy5kb0ZpbmRHcm91cEJ5TG9jYXRpb24oR3JvdXBMb2NhdGlvbi5MQVNULCBzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHByZXZpb3VzR3JvdXA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YWN0aXZhdGVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgcHJlc2VydmVXaW5kb3dPcmRlcj86IGJvb2xlYW4sIHJlYXNvbj86IEdyb3VwQWN0aXZhdGlvblJlYXNvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblx0XHR0aGlzLmRvU2V0R3JvdXBBY3RpdmUoZ3JvdXBWaWV3LCByZWFzb24pO1xuXG5cdFx0Ly8gRW5zdXJlIHdpbmRvdyBvbiB0b3AgdW5sZXNzIGRpc2FibGVkXG5cdFx0aWYgKCFwcmVzZXJ2ZVdpbmRvd09yZGVyKSB7XG5cdFx0XHR0aGlzLmhvc3RTZXJ2aWNlLm1vdmVUb3AoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cFZpZXc7XG5cdH1cblxuXHRyZXN0b3JlR3JvdXAoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRjb25zdCBncm91cFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhncm91cCk7XG5cdFx0dGhpcy5kb1Jlc3RvcmVHcm91cChncm91cFZpZXcpO1xuXG5cdFx0cmV0dXJuIGdyb3VwVmlldztcblx0fVxuXG5cdGdldFNpemUoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblxuXHRcdHJldHVybiB0aGlzLmdyaWRXaWRnZXQuZ2V0Vmlld1NpemUoZ3JvdXBWaWV3KTtcblx0fVxuXG5cdHNldFNpemUoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIHNpemU6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblxuXHRcdHRoaXMuZ3JpZFdpZGdldC5yZXNpemVWaWV3KGdyb3VwVmlldywgc2l6ZSk7XG5cdH1cblxuXHRhcnJhbmdlR3JvdXBzKGFycmFuZ2VtZW50OiBHcm91cHNBcnJhbmdlbWVudCwgdGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVHcm91cCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmNvdW50IDwgMikge1xuXHRcdFx0cmV0dXJuOyAvLyByZXF1aXJlIGF0IGxlYXN0IDIgZ3JvdXBzIHRvIHNob3dcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgeWV0XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JvdXBWaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcodGFyZ2V0KTtcblxuXHRcdHN3aXRjaCAoYXJyYW5nZW1lbnQpIHtcblx0XHRcdGNhc2UgR3JvdXBzQXJyYW5nZW1lbnQuRVZFTjpcblx0XHRcdFx0dGhpcy5ncmlkV2lkZ2V0LmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEdyb3Vwc0FycmFuZ2VtZW50Lk1BWElNSVpFOlxuXHRcdFx0XHRpZiAodGhpcy5ncm91cHMubGVuZ3RoIDwgMikge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gbmVlZCBhdCBsZWFzdCAyIGdyb3VwcyB0byBiZSBtYXhpbWl6ZWRcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQubWF4aW1pemVWaWV3KGdyb3VwVmlldyk7XG5cdFx0XHRcdGdyb3VwVmlldy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5EOlxuXHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQuZXhwYW5kVmlldyhncm91cFZpZXcpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHR0b2dnbGVNYXhpbWl6ZUdyb3VwKHRhcmdldDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciA9IHRoaXMuYWN0aXZlR3JvdXApOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRHcm91cCgpKSB7XG5cdFx0XHR0aGlzLnVubWF4aW1pemVHcm91cCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuTUFYSU1JWkUsIHRhcmdldCk7XG5cdFx0fVxuXHR9XG5cblx0dG9nZ2xlRXhwYW5kR3JvdXAodGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyID0gdGhpcy5hY3RpdmVHcm91cCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzR3JvdXBFeHBhbmRlZCh0aGlzLmFjdGl2ZUdyb3VwKSkge1xuXHRcdFx0dGhpcy5hcnJhbmdlR3JvdXBzKEdyb3Vwc0FycmFuZ2VtZW50LkVWRU4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5ELCB0YXJnZXQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdW5tYXhpbWl6ZUdyb3VwKCk6IHZvaWQge1xuXHRcdHRoaXMuZ3JpZFdpZGdldC5leGl0TWF4aW1pemVkVmlldygpO1xuXHRcdHRoaXMuX2FjdGl2ZUdyb3VwLmZvY3VzKCk7IC8vIFdoZW4gbWFraW5nIHZpZXdzIHZpc2libGUgdGhlIGZvY3VzIGNhbiBiZSBhZmZlY3RlZCwgc28gcmVzdG9yZSBpdFxuXHR9XG5cblx0aGFzTWF4aW1pemVkR3JvdXAoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZ3JpZFdpZGdldC5oYXNNYXhpbWl6ZWRWaWV3KCk7XG5cdH1cblxuXHRwcml2YXRlIGlzR3JvdXBNYXhpbWl6ZWQodGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ncmlkV2lkZ2V0LmlzVmlld01heGltaXplZCh0YXJnZXRHcm91cCk7XG5cdH1cblxuXHRpc0dyb3VwRXhwYW5kZWQodGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ncmlkV2lkZ2V0LmlzVmlld0V4cGFuZGVkKHRhcmdldEdyb3VwKTtcblx0fVxuXG5cdHNldEdyb3VwT3JpZW50YXRpb24ob3JpZW50YXRpb246IEdyb3VwT3JpZW50YXRpb24pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuZ3JpZFdpZGdldCkge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgeWV0XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3T3JpZW50YXRpb24gPSAob3JpZW50YXRpb24gPT09IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCkgPyBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogT3JpZW50YXRpb24uVkVSVElDQUw7XG5cdFx0aWYgKHRoaXMuZ3JpZFdpZGdldC5vcmllbnRhdGlvbiAhPT0gbmV3T3JpZW50YXRpb24pIHtcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5vcmllbnRhdGlvbiA9IG5ld09yaWVudGF0aW9uO1xuXHRcdH1cblx0fVxuXG5cdGFwcGx5TGF5b3V0KGxheW91dDogRWRpdG9yR3JvdXBMYXlvdXQpOiB2b2lkIHtcblx0XHRjb25zdCByZXN0b3JlRm9jdXMgPSB0aGlzLnNob3VsZFJlc3RvcmVGb2N1cyh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHQvLyBEZXRlcm1pbmUgaG93IG1hbnkgZ3JvdXBzIHdlIG5lZWQgb3ZlcmFsbFxuXHRcdGxldCBsYXlvdXRHcm91cHNDb3VudCA9IDA7XG5cdFx0ZnVuY3Rpb24gY291bnRHcm91cHMoZ3JvdXBzOiBHcm91cExheW91dEFyZ3VtZW50W10pOiB2b2lkIHtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGdyb3VwLmdyb3VwcykpIHtcblx0XHRcdFx0XHRjb3VudEdyb3Vwcyhncm91cC5ncm91cHMpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxheW91dEdyb3Vwc0NvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y291bnRHcm91cHMobGF5b3V0Lmdyb3Vwcyk7XG5cblx0XHQvLyBJZiB3ZSBjdXJyZW50bHkgaGF2ZSB0b28gbWFueSBncm91cHMsIG1lcmdlIHRoZW0gaW50byB0aGUgbGFzdCBvbmVcblx0XHRsZXQgY3VycmVudEdyb3VwVmlld3MgPSB0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpO1xuXHRcdGlmIChsYXlvdXRHcm91cHNDb3VudCA8IGN1cnJlbnRHcm91cFZpZXdzLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbGFzdEdyb3VwSW5MYXlvdXQgPSBjdXJyZW50R3JvdXBWaWV3c1tsYXlvdXRHcm91cHNDb3VudCAtIDFdO1xuXHRcdFx0Y3VycmVudEdyb3VwVmlld3MuZm9yRWFjaCgoZ3JvdXAsIGluZGV4KSA9PiB7XG5cdFx0XHRcdGlmIChpbmRleCA+PSBsYXlvdXRHcm91cHNDb3VudCkge1xuXHRcdFx0XHRcdHRoaXMubWVyZ2VHcm91cChncm91cCwgbGFzdEdyb3VwSW5MYXlvdXQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y3VycmVudEdyb3VwVmlld3MgPSB0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUdyb3VwID0gdGhpcy5hY3RpdmVHcm91cDtcblxuXHRcdC8vIFByZXBhcmUgZ3JpZCBkZXNjcmlwdG9yIHRvIGNyZWF0ZSBuZXcgZ3JpZCBmcm9tXG5cdFx0Y29uc3QgZ3JpZERlc2NyaXB0b3IgPSBjcmVhdGVTZXJpYWxpemVkR3JpZCh7XG5cdFx0XHRvcmllbnRhdGlvbjogdGhpcy50b0dyaWRWaWV3T3JpZW50YXRpb24oXG5cdFx0XHRcdGxheW91dC5vcmllbnRhdGlvbixcblx0XHRcdFx0dGhpcy5pc1R3b0RpbWVuc2lvbmFsR3JpZCgpID9cblx0XHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQub3JpZW50YXRpb24gOlx0XHRcdC8vIHByZXNlcnZlIG9yaWdpbmFsIG9yaWVudGF0aW9uIGZvciAyLWRpbWVuc2lvbmFsIGdyaWRzXG5cdFx0XHRcdFx0b3J0aG9nb25hbCh0aGlzLmdyaWRXaWRnZXQub3JpZW50YXRpb24pIC8vIG90aGVyd2lzZSBmbGlwIChmaXggaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzUyOTc1KVxuXHRcdFx0KSxcblx0XHRcdGdyb3VwczogbGF5b3V0Lmdyb3Vwc1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmVjcmVhdGUgZ3JpZHdpZGdldCB3aXRoIGRlc2NyaXB0b3Jcblx0XHR0aGlzLmRvQXBwbHlHcmlkU3RhdGUoZ3JpZERlc2NyaXB0b3IsIGFjdGl2ZUdyb3VwLmlkLCBjdXJyZW50R3JvdXBWaWV3cyk7XG5cblx0XHQvLyBSZXN0b3JlIGZvY3VzIGFzIG5lZWRlZFxuXHRcdGlmIChyZXN0b3JlRm9jdXMpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0TGF5b3V0KCk6IEVkaXRvckdyb3VwTGF5b3V0IHtcblxuXHRcdC8vIEV4YW1wbGUgcmV0dXJuIHZhbHVlOlxuXHRcdC8vIHsgb3JpZW50YXRpb246IDAsIGdyb3VwczogWyB7IGdyb3VwczogWyB7IHNpemU6IDAuNCB9LCB7IHNpemU6IDAuNiB9IF0sIHNpemU6IDAuNSB9LCB7IGdyb3VwczogWyB7fSwge30gXSwgc2l6ZTogMC41IH0gXSB9XG5cblx0XHRjb25zdCBzZXJpYWxpemVkR3JpZCA9IHRoaXMuZ3JpZFdpZGdldC5zZXJpYWxpemUoKTtcblx0XHRjb25zdCBvcmllbnRhdGlvbiA9IHNlcmlhbGl6ZWRHcmlkLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gR3JvdXBPcmllbnRhdGlvbi5IT1JJWk9OVEFMIDogR3JvdXBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHRjb25zdCByb290ID0gdGhpcy5zZXJpYWxpemVkTm9kZVRvR3JvdXBMYXlvdXRBcmd1bWVudChzZXJpYWxpemVkR3JpZC5yb290KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRvcmllbnRhdGlvbixcblx0XHRcdGdyb3Vwczogcm9vdC5ncm91cHMgYXMgR3JvdXBMYXlvdXRBcmd1bWVudFtdXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc2VyaWFsaXplZE5vZGVUb0dyb3VwTGF5b3V0QXJndW1lbnQoc2VyaWFsaXplZE5vZGU6IElTZXJpYWxpemVkTm9kZSk6IEdyb3VwTGF5b3V0QXJndW1lbnQge1xuXHRcdGlmIChzZXJpYWxpemVkTm9kZS50eXBlID09PSAnYnJhbmNoJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c2l6ZTogc2VyaWFsaXplZE5vZGUuc2l6ZSxcblx0XHRcdFx0Z3JvdXBzOiBzZXJpYWxpemVkTm9kZS5kYXRhLm1hcChub2RlID0+IHRoaXMuc2VyaWFsaXplZE5vZGVUb0dyb3VwTGF5b3V0QXJndW1lbnQobm9kZSkpXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHNpemU6IHNlcmlhbGl6ZWROb2RlLnNpemUgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBzaG91bGRSZXN0b3JlRm9jdXModGFyZ2V0OiBFbGVtZW50IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGlmIChhY3RpdmVFbGVtZW50ID09PSB0YXJnZXQub3duZXJEb2N1bWVudC5ib2R5KSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYWx3YXlzIHJlc3RvcmUgZm9jdXMgaWYgbm90aGluZyBpcyBmb2N1c2VkIGN1cnJlbnRseVxuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBjaGVjayBmb3IgdGhlIGFjdGl2ZSBlbGVtZW50IGJlaW5nIGFuIGFuY2VzdG9yIG9mIHRoZSB0YXJnZXRcblx0XHRyZXR1cm4gaXNBbmNlc3Rvck9mQWN0aXZlRWxlbWVudCh0YXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1R3b0RpbWVuc2lvbmFsR3JpZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aWV3cyA9IHRoaXMuZ3JpZFdpZGdldC5nZXRWaWV3cygpO1xuXHRcdGlmIChpc0dyaWRCcmFuY2hOb2RlKHZpZXdzKSkge1xuXHRcdFx0Ly8gdGhlIGdyaWQgaXMgMi1kaW1lbnNpb25hbCBpZiBhbnkgY2hpbGRyZW5cblx0XHRcdC8vIG9mIHRoZSBncmlkIGlzIGEgYnJhbmNoIG5vZGVcblx0XHRcdHJldHVybiB2aWV3cy5jaGlsZHJlbi5zb21lKGNoaWxkID0+IGlzR3JpZEJyYW5jaE5vZGUoY2hpbGQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRhZGRHcm91cChsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbiwgZ3JvdXBUb0NvcHk/OiBJRWRpdG9yR3JvdXBWaWV3KTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0Y29uc3QgbG9jYXRpb25WaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcobG9jYXRpb24pO1xuXG5cdFx0bGV0IG5ld0dyb3VwVmlldzogSUVkaXRvckdyb3VwVmlldztcblxuXHRcdC8vIFNhbWUgZ3JvdXBzIHZpZXc6IGFkZCB0byBncmlkIHdpZGdldCBkaXJlY3RseVxuXHRcdGlmIChsb2NhdGlvblZpZXcuZ3JvdXBzVmlldyA9PT0gdGhpcykge1xuXHRcdFx0Y29uc3QgcmVzdG9yZUZvY3VzID0gdGhpcy5zaG91bGRSZXN0b3JlRm9jdXMobG9jYXRpb25WaWV3LmVsZW1lbnQpO1xuXG5cdFx0XHRjb25zdCBzaG91bGRFeHBhbmQgPSB0aGlzLmdyb3VwVmlld3Muc2l6ZSA+IDEgJiYgdGhpcy5pc0dyb3VwRXhwYW5kZWQobG9jYXRpb25WaWV3KTtcblx0XHRcdG5ld0dyb3VwVmlldyA9IHRoaXMuZG9DcmVhdGVHcm91cFZpZXcoZ3JvdXBUb0NvcHkpO1xuXG5cdFx0XHQvLyBBZGQgdG8gZ3JpZCB3aWRnZXRcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5hZGRWaWV3KFxuXHRcdFx0XHRuZXdHcm91cFZpZXcsXG5cdFx0XHRcdHRoaXMuZ2V0U3BsaXRTaXppbmdTdHlsZSgpLFxuXHRcdFx0XHRsb2NhdGlvblZpZXcsXG5cdFx0XHRcdHRoaXMudG9HcmlkVmlld0RpcmVjdGlvbihkaXJlY3Rpb24pLFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVXBkYXRlIGNvbnRhaW5lclxuXHRcdFx0dGhpcy51cGRhdGVDb250YWluZXIoKTtcblxuXHRcdFx0Ly8gRXZlbnRcblx0XHRcdHRoaXMuX29uRGlkQWRkR3JvdXAuZmlyZShuZXdHcm91cFZpZXcpO1xuXG5cdFx0XHQvLyBOb3RpZnkgZ3JvdXAgaW5kZXggY2hhbmdlIGdpdmVuIGEgbmV3IGdyb3VwIHdhcyBhZGRlZFxuXHRcdFx0dGhpcy5ub3RpZnlHcm91cEluZGV4Q2hhbmdlKCk7XG5cblx0XHRcdC8vIEV4cGFuZCBuZXcgZ3JvdXAsIGlmIHRoZSByZWZlcmVuY2UgdmlldyB3YXMgcHJldmlvdXNseSBleHBhbmRlZFxuXHRcdFx0aWYgKHNob3VsZEV4cGFuZCkge1xuXHRcdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5ELCBuZXdHcm91cFZpZXcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXN0b3JlIGZvY3VzIGlmIHdlIGhhZCBpdCBwcmV2aW91c2x5IGFmdGVyIGNvbXBsZXRpbmcgdGhlIGdyaWRcblx0XHRcdC8vIG9wZXJhdGlvbi4gVGhhdCBvcGVyYXRpb24gbWlnaHQgY2F1c2UgcmVwYXJlbnRpbmcgb2YgZ3JpZCB2aWV3c1xuXHRcdFx0Ly8gd2hpY2ggbW92ZXMgZm9jdXMgdG8gdGhlIDxib2R5PiBlbGVtZW50IG90aGVyd2lzZS5cblx0XHRcdGlmIChyZXN0b3JlRm9jdXMpIHtcblx0XHRcdFx0bG9jYXRpb25WaWV3LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRGlmZmVyZW50IGdyb3VwIHZpZXc6IGFkZCB0byBncmlkIHdpZGdldCBvZiB0aGF0IGdyb3VwXG5cdFx0ZWxzZSB7XG5cdFx0XHRuZXdHcm91cFZpZXcgPSBsb2NhdGlvblZpZXcuZ3JvdXBzVmlldy5hZGRHcm91cChsb2NhdGlvblZpZXcsIGRpcmVjdGlvbiwgZ3JvdXBUb0NvcHkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXdHcm91cFZpZXc7XG5cdH1cblxuXHRwcml2YXRlIGdldFNwbGl0U2l6aW5nU3R5bGUoKTogU2l6aW5nIHtcblx0XHRzd2l0Y2ggKHRoaXMuX3BhcnRPcHRpb25zLnNwbGl0U2l6aW5nKSB7XG5cdFx0XHRjYXNlICdkaXN0cmlidXRlJzpcblx0XHRcdFx0cmV0dXJuIFNpemluZy5EaXN0cmlidXRlO1xuXHRcdFx0Y2FzZSAnc3BsaXQnOlxuXHRcdFx0XHRyZXR1cm4gU2l6aW5nLlNwbGl0O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFNpemluZy5BdXRvO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCYXNlIHtAbGluayBJRWRpdG9yR3JvdXBWaWV3T3B0aW9uc30gYXBwbGllZCB0byBldmVyeSBncm91cCB0aGlzIHBhcnQgY3JlYXRlcy5cblx0ICogU3ViY2xhc3NlcyBvdmVycmlkZSB0byBjb25maWd1cmUgcGFydC13aWRlIGdyb3VwIGJlaGF2aW9yIChlLmcuIGhlYWRlciBtZW51cykuXG5cdCAqL1xuXHRwcm90ZWN0ZWQgZ2V0R3JvdXBWaWV3T3B0aW9ucygpOiBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVHcm91cFZpZXcoZnJvbT86IElFZGl0b3JHcm91cFZpZXcgfCBJU2VyaWFsaXplZEVkaXRvckdyb3VwTW9kZWwgfCBudWxsLCBvcHRpb25zPzogSUVkaXRvckdyb3VwVmlld09wdGlvbnMpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblxuXHRcdGNvbnN0IHJlc29sdmVkT3B0aW9uczogSUVkaXRvckdyb3VwVmlld09wdGlvbnMgfCB1bmRlZmluZWQgPSB7IC4uLnRoaXMuZ2V0R3JvdXBWaWV3T3B0aW9ucygpLCAuLi5vcHRpb25zIH07XG5cblx0XHQvLyBDcmVhdGUgZ3JvdXAgdmlld1xuXHRcdGxldCBncm91cFZpZXc6IElFZGl0b3JHcm91cFZpZXc7XG5cdFx0aWYgKGZyb20gaW5zdGFuY2VvZiBFZGl0b3JHcm91cFZpZXcpIHtcblx0XHRcdGdyb3VwVmlldyA9IEVkaXRvckdyb3VwVmlldy5jcmVhdGVDb3B5KGZyb20sIHRoaXMuZWRpdG9yUGFydHNWaWV3LCB0aGlzLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLmNvdW50LCB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvbHZlZE9wdGlvbnMpO1xuXHRcdH0gZWxzZSBpZiAoaXNTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbChmcm9tKSkge1xuXHRcdFx0Z3JvdXBWaWV3ID0gRWRpdG9yR3JvdXBWaWV3LmNyZWF0ZUZyb21TZXJpYWxpemVkKGZyb20sIHRoaXMuZWRpdG9yUGFydHNWaWV3LCB0aGlzLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLmNvdW50LCB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvbHZlZE9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRncm91cFZpZXcgPSBFZGl0b3JHcm91cFZpZXcuY3JlYXRlTmV3KHRoaXMuZWRpdG9yUGFydHNWaWV3LCB0aGlzLCB0aGlzLmdyb3Vwc0xhYmVsLCB0aGlzLmNvdW50LCB0aGlzLnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLCByZXNvbHZlZE9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgaW4gbWFwXG5cdFx0dGhpcy5ncm91cFZpZXdzLnNldChncm91cFZpZXcuaWQsIGdyb3VwVmlldyk7XG5cblx0XHQvLyBUcmFjayBmb2N1c1xuXHRcdGNvbnN0IGdyb3VwRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Z3JvdXBEaXNwb3NhYmxlcy5hZGQoZ3JvdXBWaWV3Lm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5kb1NldEdyb3VwQWN0aXZlKGdyb3VwVmlldyk7XG5cblx0XHRcdHRoaXMuX29uRGlkRm9jdXMuZmlyZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGdyb3VwIGNoYW5nZXNcblx0XHRncm91cERpc3Bvc2FibGVzLmFkZChncm91cFZpZXcub25EaWRNb2RlbENoYW5nZShlID0+IHtcblx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTE9DS0VEOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBMb2NrZWQuZmlyZShncm91cFZpZXcpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEdyb3VwTW9kZWxDaGFuZ2VLaW5kLkdST1VQX0lOREVYOlxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlR3JvdXBJbmRleC5maXJlKGdyb3VwVmlldyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgR3JvdXBNb2RlbENoYW5nZUtpbmQuR1JPVVBfTEFCRUw6XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VHcm91cExhYmVsLmZpcmUoZ3JvdXBWaWV3KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUcmFjayBhY3RpdmUgZWRpdG9yIGNoYW5nZSBhZnRlciBpdCBvY2N1cnJlZFxuXHRcdGdyb3VwRGlzcG9zYWJsZXMuYWRkKGdyb3VwVmlldy5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFRyYWNrIGRpc3Bvc2Vcblx0XHRFdmVudC5vbmNlKGdyb3VwVmlldy5vbldpbGxEaXNwb3NlKSgoKSA9PiB7XG5cdFx0XHRkaXNwb3NlKGdyb3VwRGlzcG9zYWJsZXMpO1xuXHRcdFx0dGhpcy5ncm91cFZpZXdzLmRlbGV0ZShncm91cFZpZXcuaWQpO1xuXHRcdFx0dGhpcy5kb1VwZGF0ZU1vc3RSZWNlbnRBY3RpdmUoZ3JvdXBWaWV3KTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBncm91cFZpZXc7XG5cdH1cblxuXHRwcml2YXRlIGRvU2V0R3JvdXBBY3RpdmUoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcsIHJlYXNvbiA9IEdyb3VwQWN0aXZhdGlvblJlYXNvbi5ERUZBVUxUKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZUdyb3VwICE9PSBncm91cCkge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNBY3RpdmVHcm91cCA9IHRoaXMuX2FjdGl2ZUdyb3VwO1xuXHRcdFx0dGhpcy5fYWN0aXZlR3JvdXAgPSBncm91cDtcblxuXHRcdFx0Ly8gVXBkYXRlIGxpc3Qgb2YgbW9zdCByZWNlbnRseSBhY3RpdmUgZ3JvdXBzXG5cdFx0XHR0aGlzLmRvVXBkYXRlTW9zdFJlY2VudEFjdGl2ZShncm91cCwgdHJ1ZSk7XG5cblx0XHRcdC8vIE1hcmsgcHJldmlvdXMgb25lIGFzIGluYWN0aXZlXG5cdFx0XHRpZiAocHJldmlvdXNBY3RpdmVHcm91cCAmJiAhcHJldmlvdXNBY3RpdmVHcm91cC5kaXNwb3NlZCkge1xuXHRcdFx0XHRwcmV2aW91c0FjdGl2ZUdyb3VwLnNldEFjdGl2ZShmYWxzZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1hcmsgZ3JvdXAgYXMgbmV3IGFjdGl2ZVxuXHRcdFx0Z3JvdXAuc2V0QWN0aXZlKHRydWUpO1xuXG5cdFx0XHQvLyBFeHBhbmQgdGhlIGdyb3VwIGlmIGl0IGlzIGN1cnJlbnRseSBtaW5pbWl6ZWRcblx0XHRcdHRoaXMuZG9SZXN0b3JlR3JvdXAoZ3JvdXApO1xuXG5cdFx0XHQvLyBFdmVudFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cC5maXJlKGdyb3VwKTtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgZmlyZSB0aGUgZXZlbnQgdGhhdCBhIGdyb3VwIGhhcyBiZWVuIGFjdGl2YXRlZFxuXHRcdC8vIGV2ZW4gaWYgaXRzIHRoZSBzYW1lIGdyb3VwIHRoYXQgaXMgYWxyZWFkeSBhY3RpdmUgdG9cblx0XHQvLyBzaWduYWwgdGhlIGludGVudCBldmVuIHdoZW4gbm90aGluZyBoYXMgY2hhbmdlZC5cblx0XHR0aGlzLl9vbkRpZEFjdGl2YXRlR3JvdXAuZmlyZSh7IGdyb3VwLCByZWFzb24gfSk7XG5cdH1cblxuXHRwcml2YXRlIGRvUmVzdG9yZUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmdyaWRXaWRnZXQpIHtcblx0XHRcdHJldHVybjsgLy8gbWV0aG9kIGlzIGNhbGxlZCBhcyBwYXJ0IG9mIHN0YXRlIHJlc3RvcmUgdmVyeSBlYXJseVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5oYXNNYXhpbWl6ZWRHcm91cCgpICYmICF0aGlzLmlzR3JvdXBNYXhpbWl6ZWQoZ3JvdXApKSB7XG5cdFx0XHRcdHRoaXMudW5tYXhpbWl6ZUdyb3VwKCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHZpZXdTaXplID0gdGhpcy5ncmlkV2lkZ2V0LmdldFZpZXdTaXplKGdyb3VwKTtcblx0XHRcdGlmICh2aWV3U2l6ZS53aWR0aCA9PT0gZ3JvdXAubWluaW11bVdpZHRoIHx8IHZpZXdTaXplLmhlaWdodCA9PT0gZ3JvdXAubWluaW11bUhlaWdodCkge1xuXHRcdFx0XHR0aGlzLmFycmFuZ2VHcm91cHMoR3JvdXBzQXJyYW5nZW1lbnQuRVhQQU5ELCBncm91cCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIGlnbm9yZTogbWV0aG9kIG1pZ2h0IGJlIGNhbGxlZCB0b28gZWFybHkgYmVmb3JlIHZpZXcgaXMga25vd24gdG8gZ3JpZFxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVNb3N0UmVjZW50QWN0aXZlKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3LCBtYWtlTW9zdFJlY2VudGx5QWN0aXZlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5tb3N0UmVjZW50QWN0aXZlR3JvdXBzLmluZGV4T2YoZ3JvdXAuaWQpO1xuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gTVJVIGxpc3Rcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cblx0XHQvLyBBZGQgdG8gZnJvbnQgYXMgbmVlZGVkXG5cdFx0aWYgKG1ha2VNb3N0UmVjZW50bHlBY3RpdmUpIHtcblx0XHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3Vwcy51bnNoaWZ0KGdyb3VwLmlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvR3JpZFZpZXdEaXJlY3Rpb24oZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IERpcmVjdGlvbiB7XG5cdFx0c3dpdGNoIChkaXJlY3Rpb24pIHtcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uVVA6IHJldHVybiBEaXJlY3Rpb24uVXA7XG5cdFx0XHRjYXNlIEdyb3VwRGlyZWN0aW9uLkRPV046IHJldHVybiBEaXJlY3Rpb24uRG93bjtcblx0XHRcdGNhc2UgR3JvdXBEaXJlY3Rpb24uTEVGVDogcmV0dXJuIERpcmVjdGlvbi5MZWZ0O1xuXHRcdFx0Y2FzZSBHcm91cERpcmVjdGlvbi5SSUdIVDogcmV0dXJuIERpcmVjdGlvbi5SaWdodDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvR3JpZFZpZXdPcmllbnRhdGlvbihvcmllbnRhdGlvbjogR3JvdXBPcmllbnRhdGlvbiwgZmFsbGJhY2s6IE9yaWVudGF0aW9uKTogT3JpZW50YXRpb24ge1xuXHRcdGlmICh0eXBlb2Ygb3JpZW50YXRpb24gPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gb3JpZW50YXRpb24gPT09IEdyb3VwT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IE9yaWVudGF0aW9uLkhPUklaT05UQUwgOiBPcmllbnRhdGlvbi5WRVJUSUNBTDtcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsbGJhY2s7XG5cdH1cblxuXHRyZW1vdmVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBncm91cFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhncm91cCk7XG5cdFx0aWYgKHRoaXMuY291bnQgPT09IDEpIHtcblx0XHRcdHJldHVybjsgLy8gQ2Fubm90IHJlbW92ZSB0aGUgbGFzdCByb290IGdyb3VwXG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGVtcHR5IGdyb3VwXG5cdFx0aWYgKGdyb3VwVmlldy5pc0VtcHR5KSB7XG5cdFx0XHR0aGlzLmRvUmVtb3ZlRW1wdHlHcm91cChncm91cFZpZXcsIHByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBncm91cCB3aXRoIGVkaXRvcnNcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMuZG9SZW1vdmVHcm91cFdpdGhFZGl0b3JzKGdyb3VwVmlldyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBkb1JlbW92ZUdyb3VwV2l0aEVkaXRvcnMoZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3KTogdm9pZCB7XG5cdFx0Y29uc3QgbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzID0gdGhpcy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXG5cdFx0bGV0IGxhc3RBY3RpdmVHcm91cDogSUVkaXRvckdyb3VwVmlldztcblx0XHRpZiAodGhpcy5fYWN0aXZlR3JvdXAgPT09IGdyb3VwVmlldykge1xuXHRcdFx0bGFzdEFjdGl2ZUdyb3VwID0gbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzWzFdO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYXN0QWN0aXZlR3JvdXAgPSBtb3N0UmVjZW50bHlBY3RpdmVHcm91cHNbMF07XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZpbmcgYSBncm91cCB3aXRoIGVkaXRvcnMgc2hvdWxkIG1lcmdlIHRoZXNlIGVkaXRvcnMgaW50byB0aGVcblx0XHQvLyBsYXN0IGFjdGl2ZSBncm91cCBhbmQgdGhlbiByZW1vdmUgdGhpcyBncm91cC5cblx0XHR0aGlzLm1lcmdlR3JvdXAoZ3JvdXBWaWV3LCBsYXN0QWN0aXZlR3JvdXApO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1JlbW92ZUVtcHR5R3JvdXAoZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3LCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlc3RvcmVGb2N1cyA9ICFwcmVzZXJ2ZUZvY3VzICYmIHRoaXMuc2hvdWxkUmVzdG9yZUZvY3VzKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIEFjdGl2YXRlIG5leHQgZ3JvdXAgaWYgdGhlIHJlbW92ZWQgb25lIHdhcyBhY3RpdmVcblx0XHRpZiAodGhpcy5fYWN0aXZlR3JvdXAgPT09IGdyb3VwVmlldykge1xuXHRcdFx0Y29uc3QgbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzID0gdGhpcy5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpO1xuXHRcdFx0Y29uc3QgbmV4dEFjdGl2ZUdyb3VwID0gbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzWzFdOyAvLyBbMF0gd2lsbCBiZSB0aGUgY3VycmVudCBncm91cCB3ZSBhcmUgYWJvdXQgdG8gZGlzcG9zZVxuXHRcdFx0dGhpcy5kb1NldEdyb3VwQWN0aXZlKG5leHRBY3RpdmVHcm91cCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIGZyb20gZ3JpZCB3aWRnZXQgJiBkaXNwb3NlXG5cdFx0dGhpcy5ncmlkV2lkZ2V0LnJlbW92ZVZpZXcoZ3JvdXBWaWV3LCB0aGlzLmdldFNwbGl0U2l6aW5nU3R5bGUoKSk7XG5cdFx0Z3JvdXBWaWV3LmRpc3Bvc2UoKTtcblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgaWYgd2UgaGFkIGl0IHByZXZpb3VzbHkgYWZ0ZXIgY29tcGxldGluZyB0aGUgZ3JpZFxuXHRcdC8vIG9wZXJhdGlvbi4gVGhhdCBvcGVyYXRpb24gbWlnaHQgY2F1c2UgcmVwYXJlbnRpbmcgb2YgZ3JpZCB2aWV3c1xuXHRcdC8vIHdoaWNoIG1vdmVzIGZvY3VzIHRvIHRoZSA8Ym9keT4gZWxlbWVudCBvdGhlcndpc2UuXG5cdFx0aWYgKHJlc3RvcmVGb2N1cykge1xuXHRcdFx0dGhpcy5fYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHR9XG5cblx0XHQvLyBOb3RpZnkgZ3JvdXAgaW5kZXggY2hhbmdlIGdpdmVuIGEgZ3JvdXAgd2FzIHJlbW92ZWRcblx0XHR0aGlzLm5vdGlmeUdyb3VwSW5kZXhDaGFuZ2UoKTtcblxuXHRcdC8vIFVwZGF0ZSBjb250YWluZXJcblx0XHR0aGlzLnVwZGF0ZUNvbnRhaW5lcigpO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZFJlbW92ZUdyb3VwLmZpcmUoZ3JvdXBWaWV3KTtcblx0fVxuXG5cdG1vdmVHcm91cChncm91cDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgbG9jYXRpb246IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIGRpcmVjdGlvbjogR3JvdXBEaXJlY3Rpb24pOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRjb25zdCBzb3VyY2VWaWV3ID0gdGhpcy5hc3NlcnRHcm91cFZpZXcoZ3JvdXApO1xuXHRcdGNvbnN0IHRhcmdldFZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhsb2NhdGlvbik7XG5cblx0XHRpZiAoc291cmNlVmlldy5pZCA9PT0gdGFyZ2V0Vmlldy5pZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgbW92ZSBncm91cCBpbnRvIGl0cyBvd24nKTtcblx0XHR9XG5cblx0XHRjb25zdCByZXN0b3JlRm9jdXMgPSB0aGlzLnNob3VsZFJlc3RvcmVGb2N1cyhzb3VyY2VWaWV3LmVsZW1lbnQpO1xuXHRcdGxldCBtb3ZlZFZpZXc6IElFZGl0b3JHcm91cFZpZXc7XG5cblx0XHQvLyBTYW1lIGdyb3VwcyB2aWV3OiBtb3ZlIHZpYSBncmlkIHdpZGdldCBBUElcblx0XHRpZiAoc291cmNlVmlldy5ncm91cHNWaWV3ID09PSB0YXJnZXRWaWV3Lmdyb3Vwc1ZpZXcpIHtcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5tb3ZlVmlldyhzb3VyY2VWaWV3LCB0aGlzLmdldFNwbGl0U2l6aW5nU3R5bGUoKSwgdGFyZ2V0VmlldywgdGhpcy50b0dyaWRWaWV3RGlyZWN0aW9uKGRpcmVjdGlvbikpO1xuXHRcdFx0bW92ZWRWaWV3ID0gc291cmNlVmlldztcblx0XHR9XG5cblx0XHQvLyBEaWZmZXJlbnQgZ3JvdXBzIHZpZXc6IG1vdmUgdmlhIGdyb3VwcyB2aWV3IEFQSVxuXHRcdGVsc2Uge1xuXHRcdFx0bW92ZWRWaWV3ID0gdGFyZ2V0Vmlldy5ncm91cHNWaWV3LmFkZEdyb3VwKHRhcmdldFZpZXcsIGRpcmVjdGlvbiwgc291cmNlVmlldyk7XG5cdFx0XHRzb3VyY2VWaWV3LmNsb3NlQWxsRWRpdG9ycygpO1xuXHRcdFx0dGhpcy5yZW1vdmVHcm91cChzb3VyY2VWaWV3LCByZXN0b3JlRm9jdXMpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgaWYgd2UgaGFkIGl0IHByZXZpb3VzbHkgYWZ0ZXIgY29tcGxldGluZyB0aGUgZ3JpZFxuXHRcdC8vIG9wZXJhdGlvbi4gVGhhdCBvcGVyYXRpb24gbWlnaHQgY2F1c2UgcmVwYXJlbnRpbmcgb2YgZ3JpZCB2aWV3c1xuXHRcdC8vIHdoaWNoIG1vdmVzIGZvY3VzIHRvIHRoZSA8Ym9keT4gZWxlbWVudCBvdGhlcndpc2UuXG5cdFx0aWYgKHJlc3RvcmVGb2N1cykge1xuXHRcdFx0bW92ZWRWaWV3LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZE1vdmVHcm91cC5maXJlKG1vdmVkVmlldyk7XG5cblx0XHQvLyBOb3RpZnkgZ3JvdXAgaW5kZXggY2hhbmdlIGdpdmVuIGEgZ3JvdXAgd2FzIG1vdmVkXG5cdFx0dGhpcy5ub3RpZnlHcm91cEluZGV4Q2hhbmdlKCk7XG5cblx0XHRyZXR1cm4gbW92ZWRWaWV3O1xuXHR9XG5cblx0Y29weUdyb3VwKGdyb3VwOiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbik6IElFZGl0b3JHcm91cFZpZXcge1xuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblx0XHRjb25zdCBsb2NhdGlvblZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhsb2NhdGlvbik7XG5cblx0XHRjb25zdCByZXN0b3JlRm9jdXMgPSB0aGlzLnNob3VsZFJlc3RvcmVGb2N1cyhncm91cFZpZXcuZWxlbWVudCk7XG5cblx0XHQvLyBDb3B5IHRoZSBncm91cCB2aWV3XG5cdFx0Y29uc3QgY29waWVkR3JvdXBWaWV3ID0gdGhpcy5hZGRHcm91cChsb2NhdGlvblZpZXcsIGRpcmVjdGlvbiwgZ3JvdXBWaWV3KTtcblxuXHRcdC8vIFJlc3RvcmUgZm9jdXMgaWYgd2UgaGFkIGl0XG5cdFx0aWYgKHJlc3RvcmVGb2N1cykge1xuXHRcdFx0Y29waWVkR3JvdXBWaWV3LmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvcGllZEdyb3VwVmlldztcblx0fVxuXG5cdG1lcmdlR3JvdXAoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIsIHRhcmdldDogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgb3B0aW9ucz86IElNZXJnZUdyb3VwT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNvdXJjZVZpZXcgPSB0aGlzLmFzc2VydEdyb3VwVmlldyhncm91cCk7XG5cdFx0Y29uc3QgdGFyZ2V0VmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KHRhcmdldCk7XG5cblx0XHQvLyBDb2xsZWN0IGVkaXRvcnMgdG8gbW92ZS9jb3B5XG5cdFx0Y29uc3QgZWRpdG9yczogRWRpdG9ySW5wdXRXaXRoT3B0aW9uc1tdID0gW107XG5cdFx0bGV0IGluZGV4ID0gKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMuaW5kZXggPT09ICdudW1iZXInKSA/IG9wdGlvbnMuaW5kZXggOiB0YXJnZXRWaWV3LmNvdW50O1xuXHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIHNvdXJjZVZpZXcuZWRpdG9ycykge1xuXHRcdFx0Y29uc3QgaW5hY3RpdmUgPSAhc291cmNlVmlldy5pc0FjdGl2ZShlZGl0b3IpIHx8IHRoaXMuX2FjdGl2ZUdyb3VwICE9PSBzb3VyY2VWaWV3O1xuXG5cdFx0XHRsZXQgYWN0dWFsSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXJnZXRWaWV3LmNvbnRhaW5zKGVkaXRvcikgJiZcblx0XHRcdFx0KFxuXHRcdFx0XHRcdC8vIERvIG5vdCBjb25maWd1cmUgYW4gYGluZGV4YCBmb3IgZWRpdG9ycyB0aGF0IGFyZSBzdGlja3kgaW5cblx0XHRcdFx0XHQvLyB0aGUgdGFyZ2V0LCBvdGhlcndpc2UgdGhlcmUgaXMgYSBjaGFuY2Ugb2YgbG9zaW5nIHRoYXQgc3RhdGVcblx0XHRcdFx0XHQvLyB3aGVuIHRoZSBlZGl0b3IgaXMgbW92ZWQuXG5cdFx0XHRcdFx0Ly8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8yMzk1NDlcblx0XHRcdFx0XHR0YXJnZXRWaWV3LmlzU3RpY2t5KGVkaXRvcikgfHxcblx0XHRcdFx0XHQvLyBEbyBub3QgY29uZmlndXJlIGFuIGBpbmRleGAgd2hlbiB3ZSBhcmUgZXhwbGljaXRseSBpbnN0cnVjdGVkXG5cdFx0XHRcdFx0b3B0aW9ucz8ucHJlc2VydmVFeGlzdGluZ0luZGV4XG5cdFx0XHRcdClcblx0XHRcdCkge1xuXHRcdFx0XHQvLyBsZWF2ZSBgaW5kZXhgIGFzIGB1bmRlZmluZWRgXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhY3R1YWxJbmRleCA9IGluZGV4O1xuXHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0fVxuXG5cdFx0XHRlZGl0b3JzLnB1c2goe1xuXHRcdFx0XHRlZGl0b3IsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRpbmRleDogYWN0dWFsSW5kZXgsXG5cdFx0XHRcdFx0aW5hY3RpdmUsXG5cdFx0XHRcdFx0cHJlc2VydmVGb2N1czogaW5hY3RpdmVcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gTW92ZS9Db3B5IGVkaXRvcnMgb3ZlciBpbnRvIHRhcmdldFxuXHRcdGxldCByZXN1bHQgPSB0cnVlO1xuXHRcdGlmIChvcHRpb25zPy5tb2RlID09PSBNZXJnZUdyb3VwTW9kZS5DT1BZX0VESVRPUlMpIHtcblx0XHRcdHNvdXJjZVZpZXcuY29weUVkaXRvcnMoZWRpdG9ycywgdGFyZ2V0Vmlldyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdCA9IHNvdXJjZVZpZXcubW92ZUVkaXRvcnMoZWRpdG9ycywgdGFyZ2V0Vmlldyk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtb3ZlIHNvdXJjZSBpZiB0aGUgdmlldyBpcyBub3cgZW1wdHkgYW5kIG5vdCBhbHJlYWR5IHJlbW92ZWRcblx0XHRpZiAoc291cmNlVmlldy5pc0VtcHR5ICYmICFzb3VyY2VWaWV3LmRpc3Bvc2VkIC8qIGNvdWxkIGhhdmUgYmVlbiBkaXNwb3NlZCBhbHJlYWR5IHZpYSB3b3JrYmVuY2guZWRpdG9yLmNsb3NlRW1wdHlHcm91cHMgc2V0dGluZyAqLykge1xuXHRcdFx0dGhpcy5yZW1vdmVHcm91cChzb3VyY2VWaWV3LCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0bWVyZ2VBbGxHcm91cHModGFyZ2V0OiBJRWRpdG9yR3JvdXBWaWV3IHwgR3JvdXBJZGVudGlmaWVyLCBvcHRpb25zPzogSU1lcmdlR3JvdXBPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGFyZ2V0VmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KHRhcmdldCk7XG5cblx0XHRsZXQgcmVzdWx0ID0gdHJ1ZTtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0aWYgKGdyb3VwID09PSB0YXJnZXRWaWV3KSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBrZWVwIHRhcmdldFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXJnZWQgPSB0aGlzLm1lcmdlR3JvdXAoZ3JvdXAsIHRhcmdldFZpZXcsIG9wdGlvbnMpO1xuXHRcdFx0aWYgKCFtZXJnZWQpIHtcblx0XHRcdFx0cmVzdWx0ID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3NlcnRHcm91cFZpZXcoZ3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCBHcm91cElkZW50aWZpZXIpOiBJRWRpdG9yR3JvdXBWaWV3IHtcblx0XHRsZXQgZ3JvdXBWaWV3OiBJRWRpdG9yR3JvdXBWaWV3IHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0eXBlb2YgZ3JvdXAgPT09ICdudW1iZXInKSB7XG5cdFx0XHRncm91cFZpZXcgPSB0aGlzLmVkaXRvclBhcnRzVmlldy5nZXRHcm91cChncm91cCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGdyb3VwVmlldyA9IGdyb3VwO1xuXHRcdH1cblxuXHRcdGlmICghZ3JvdXBWaWV3KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgZWRpdG9yIGdyb3VwIHByb3ZpZGVkIScpO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cFZpZXc7XG5cdH1cblxuXHRjcmVhdGVFZGl0b3JEcm9wVGFyZ2V0KGNvbnRhaW5lcjogdW5rbm93biwgZGVsZWdhdGU6IElFZGl0b3JEcm9wVGFyZ2V0RGVsZWdhdGUpOiBJRGlzcG9zYWJsZSB7XG5cdFx0YXNzZXJ0VHlwZShpc0hUTUxFbGVtZW50KGNvbnRhaW5lcikpO1xuXG5cdFx0cmV0dXJuIHRoaXMuc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yRHJvcFRhcmdldCwgdGhpcywgY29udGFpbmVyLCBkZWxlZ2F0ZSk7XG5cdH1cblxuXHQvLyNyZWdpb24gUGFydFxuXG5cdC8vIFRPRE8gQHNiYXR0ZW4gQGpvYW8gZmluZCBzb21ldGhpbmcgYmV0dGVyIHRvIHByZXZlbnQgZWRpdG9yIHRha2luZyBvdmVyICM3OTg5N1xuXHRnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiBNYXRoLm1pbih0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0Lm1pbmltdW1XaWR0aCwgdGhpcy5sYXlvdXRTZXJ2aWNlLmdldE1heGltdW1FZGl0b3JEaW1lbnNpb25zKHRoaXMubGF5b3V0U2VydmljZS5nZXRDb250YWluZXIoZ2V0V2luZG93KHRoaXMuY29udGFpbmVyKSkpLndpZHRoKTsgfVxuXHRnZXQgbWF4aW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0Lm1heGltdW1XaWR0aDsgfVxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gTWF0aC5taW4odGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5taW5pbXVtSGVpZ2h0LCB0aGlzLmxheW91dFNlcnZpY2UuZ2V0TWF4aW11bUVkaXRvckRpbWVuc2lvbnModGhpcy5sYXlvdXRTZXJ2aWNlLmdldENvbnRhaW5lcihnZXRXaW5kb3codGhpcy5jb250YWluZXIpKSkuaGVpZ2h0KTsgfVxuXHRnZXQgbWF4aW11bUhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5tYXhpbXVtSGVpZ2h0OyB9XG5cblx0Z2V0IHNuYXAoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmxheW91dFNlcnZpY2UuZ2V0UGFuZWxBbGlnbm1lbnQoKSA9PT0gJ2NlbnRlcic7IH1cblxuXHRvdmVycmlkZSBnZXQgb25EaWRDaGFuZ2UoKTogRXZlbnQ8SVZpZXdTaXplIHwgdW5kZWZpbmVkPiB7IHJldHVybiBFdmVudC5hbnkodGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5vbkRpZENoYW5nZSwgdGhpcy5vbkRpZFNldEdyaWRXaWRnZXQuZXZlbnQpOyB9XG5cdHJlYWRvbmx5IHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eSA9IExheW91dFByaW9yaXR5LkhpZ2g7XG5cblx0cHJpdmF0ZSBnZXQgZ3JpZFNlcGFyYXRvckJvcmRlcigpOiBDb2xvciB7XG5cdFx0cmV0dXJuIHRoaXMudGhlbWUuZ2V0Q29sb3IoRURJVE9SX0dST1VQX0JPUkRFUikgfHwgdGhpcy50aGVtZS5nZXRDb2xvcihjb250cmFzdEJvcmRlcikgfHwgQ29sb3IudHJhbnNwYXJlbnQ7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gdGhpcy5nZXRDb2xvcihlZGl0b3JCYWNrZ3JvdW5kKSB8fCAnJztcblxuXHRcdGNvbnN0IHNlcGFyYXRvckJvcmRlclN0eWxlID0geyBzZXBhcmF0b3JCb3JkZXI6IHRoaXMuZ3JpZFNlcGFyYXRvckJvcmRlciwgYmFja2dyb3VuZDogdGhpcy50aGVtZS5nZXRDb2xvcihFRElUT1JfUEFORV9CQUNLR1JPVU5EKSB8fCBDb2xvci50cmFuc3BhcmVudCB9O1xuXHRcdHRoaXMuZ3JpZFdpZGdldC5zdHlsZShzZXBhcmF0b3JCb3JkZXJTdHlsZSk7XG5cdFx0dGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5zdHlsZXMoc2VwYXJhdG9yQm9yZGVyU3R5bGUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQsIG9wdGlvbnM/OiBJRWRpdG9yUGFydENyZWF0aW9uT3B0aW9ucyk6IEhUTUxFbGVtZW50IHtcblxuXHRcdC8vIENvbnRhaW5lclxuXHRcdHRoaXMuZWxlbWVudCA9IHBhcmVudDtcblx0XHRpZiAodGhpcy53aW5kb3dJZCAhPT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0dGhpcy5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnYXV4aWxpYXJ5Jyk7XG5cdFx0fVxuXHRcdHBhcmVudC5hcHBlbmRDaGlsZCh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHQvLyBHcmlkIGNvbnRyb2xcblx0XHR0aGlzLl93aWxsUmVzdG9yZVN0YXRlID0gIW9wdGlvbnMgfHwgb3B0aW9ucy5yZXN0b3JlUHJldmlvdXNTdGF0ZTtcblx0XHR0aGlzLmRvQ3JlYXRlR3JpZENvbnRyb2woKTtcblxuXHRcdC8vIENlbnRlcmVkIGxheW91dCB3aWRnZXRcblx0XHR0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IENlbnRlcmVkVmlld0xheW91dCh0aGlzLmNvbnRhaW5lciwgdGhpcy5ncmlkV2lkZ2V0VmlldywgdGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX0NFTlRFUkVEX1ZJRVdfU1RPUkFHRV9LRVldLCB0aGlzLl9wYXJ0T3B0aW9ucy5jZW50ZXJlZExheW91dEZpeGVkV2lkdGgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMoZSA9PiB0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LnNldEZpeGVkV2lkdGgoZS5uZXdQYXJ0T3B0aW9ucy5jZW50ZXJlZExheW91dEZpeGVkV2lkdGggPz8gZmFsc2UpKSk7XG5cblx0XHQvLyBEcmFnICYgRHJvcCBzdXBwb3J0XG5cdFx0dGhpcy5zZXR1cERyYWdBbmREcm9wU3VwcG9ydChwYXJlbnQsIHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIENvbnRleHQga2V5c1xuXHRcdHRoaXMuaGFuZGxlQ29udGV4dEtleXMoKTtcblxuXHRcdC8vIFNpZ25hbCByZWFkeVxuXHRcdHRoaXMud2hlblJlYWR5UHJvbWlzZS5jb21wbGV0ZSgpO1xuXHRcdHRoaXMuX2lzUmVhZHkgPSB0cnVlO1xuXG5cdFx0Ly8gU2lnbmFsIHJlc3RvcmVkXG5cdFx0UHJvbWlzZXMuc2V0dGxlZCh0aGlzLmdyb3Vwcy5tYXAoZ3JvdXAgPT4gZ3JvdXAud2hlblJlc3RvcmVkKSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLndoZW5SZXN0b3JlZFByb21pc2UuY29tcGxldGUoKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiB0aGlzLmNvbnRhaW5lcjtcblx0fVxuXG5cdHByb3RlY3RlZCBoYW5kbGVDb250ZXh0S2V5cygpOiB2b2lkIHtcblx0XHQvLyBCaW5kIGBlZGl0b3JBcmVhRm9jdXNgIHRvIHRoZSBlZGl0b3IgcGFydCdzIHNjb3BlZCBjb250ZXh0IGtleSBzZXJ2aWNlIHNvXG5cdFx0Ly8gaXQgZXZhbHVhdGVzIHRvIGB0cnVlYCBvbmx5IHdoZW4ga2V5Ym9hcmQgZm9jdXMgaXMgd2l0aGluIHRoZSBlZGl0b3IgYXJlYS5cblx0XHQvLyBBcHBsaWVzIHRvIGFsbCBlZGl0b3IgcGFydHMgKG1haW4sIG1vZGFsLCBhdXhpbGlhcnkpIHNvIGNhbGxlcnMgY2FuIGdhdGVcblx0XHQvLyBzaG9ydGN1dHMgb24gZm9jdXMgYmVpbmcgaW4gYW55IGVkaXRvciBhcmVhIHJlZ2FyZGxlc3Mgb2Ygd2hpY2ggcGFydC5cblx0XHRFZGl0b3JBcmVhRm9jdXNDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cblx0XHRjb25zdCBtdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQgPSBFZGl0b3JQYXJ0TXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBtYXhpbWl6ZWRFZGl0b3JHcm91cENvbnRleHQgPSBFZGl0b3JQYXJ0TWF4aW1pemVkRWRpdG9yR3JvdXBDb250ZXh0LmJpbmRUbyh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQgPSBFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQuYmluZFRvKHRoaXMuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQ29udGV4dEtleXMgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cENvdW50ID0gdGhpcy5jb3VudDtcblx0XHRcdGlmIChncm91cENvdW50ID4gMSkge1xuXHRcdFx0XHRtdWx0aXBsZUVkaXRvckdyb3Vwc0NvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0bXVsdGlwbGVFZGl0b3JHcm91cHNDb250ZXh0LnJlc2V0KCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmhhc01heGltaXplZEdyb3VwKCkpIHtcblx0XHRcdFx0bWF4aW1pemVkRWRpdG9yR3JvdXBDb250ZXh0LnNldCh0cnVlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1heGltaXplZEVkaXRvckdyb3VwQ29udGV4dC5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVFZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQgPSAoKSA9PiB7XG5cdFx0XHRlZGl0b3JUYWJzVmlzaWJsZUNvbnRleHQuc2V0KHRoaXMucGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScpO1xuXHRcdH07XG5cblx0XHRjb25zdCB1cGRhdGVUb3BSaWdodEdyb3VwQ29udGV4dEtleSA9ICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5ncmlkV2lkZ2V0IHx8ICF0aGlzLl9jb250ZW50RGltZW5zaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHRvcFJpZ2h0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ3JvdXBzKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQuZ2V0TmVpZ2hib3JWaWV3cyhncm91cCwgRGlyZWN0aW9uLlVwKS5sZW5ndGggPT09IDAgJiZcblx0XHRcdFx0XHR0aGlzLmdyaWRXaWRnZXQuZ2V0TmVpZ2hib3JWaWV3cyhncm91cCwgRGlyZWN0aW9uLlJpZ2h0KS5sZW5ndGggPT09IDBcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0dG9wUmlnaHRHcm91cCA9IGdyb3VwO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5ncm91cHMpIHtcblx0XHRcdFx0Y29uc3QgY29udGV4dEtleSA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmJpbmQoSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCwgZ3JvdXApO1xuXHRcdFx0XHRjb250ZXh0S2V5LnNldChncm91cCA9PT0gdG9wUmlnaHRHcm91cCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHVwZGF0ZUNvbnRleHRLZXlzKCk7XG5cdFx0dXBkYXRlRWRpdG9yVGFic1Zpc2libGVDb250ZXh0KCk7XG5cdFx0dXBkYXRlVG9wUmlnaHRHcm91cENvbnRleHRLZXkoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRBZGRHcm91cCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVDb250ZXh0S2V5cygpO1xuXHRcdFx0dXBkYXRlVG9wUmlnaHRHcm91cENvbnRleHRLZXkoKTtcblx0XHRcdHRoaXMuYXBwbHlDb250ZW50UmlnaHRJbnNldCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkUmVtb3ZlR3JvdXAoKCkgPT4ge1xuXHRcdFx0dXBkYXRlQ29udGV4dEtleXMoKTtcblx0XHRcdHVwZGF0ZVRvcFJpZ2h0R3JvdXBDb250ZXh0S2V5KCk7XG5cdFx0XHR0aGlzLmFwcGx5Q29udGVudFJpZ2h0SW5zZXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUdyb3VwTWF4aW1pemVkKCgpID0+IHtcblx0XHRcdHVwZGF0ZUNvbnRleHRLZXlzKCk7XG5cdFx0XHR0aGlzLmFwcGx5Q29udGVudFJpZ2h0SW5zZXQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUVkaXRvclBhcnRPcHRpb25zKCgpID0+IHVwZGF0ZUVkaXRvclRhYnNWaXNpYmxlQ29udGV4dCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZE1vdmVHcm91cCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVUb3BSaWdodEdyb3VwQ29udGV4dEtleSgpO1xuXHRcdFx0dGhpcy5hcHBseUNvbnRlbnRSaWdodEluc2V0KCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRMYXlvdXQoKCkgPT4gdXBkYXRlVG9wUmlnaHRHcm91cENvbnRleHRLZXkoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cERyYWdBbmREcm9wU3VwcG9ydChwYXJlbnQ6IEhUTUxFbGVtZW50LCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cblx0XHQvLyBFZGl0b3IgZHJvcCB0YXJnZXRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZUVkaXRvckRyb3BUYXJnZXQoY29udGFpbmVyLCBPYmplY3QuY3JlYXRlKG51bGwpKSk7XG5cblx0XHQvLyBObyBkcm9wIGluIHRoZSBlZGl0b3Jcblx0XHRjb25zdCBvdmVybGF5ID0gJCgnLmRyb3AtYmxvY2stb3ZlcmxheScpO1xuXHRcdHBhcmVudC5hcHBlbmRDaGlsZChvdmVybGF5KTtcblxuXHRcdC8vIEhpZGUgdGhlIGJsb2NrIGlmIGEgbW91c2UgZG93biBldmVudCBvY2N1cnMgIzk5MDY1XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihvdmVybGF5LCAoKSA9PiBvdmVybGF5LmNsYXNzTGlzdC5yZW1vdmUoJ3Zpc2libGUnKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tcG9zaXRlRHJhZ0FuZERyb3BPYnNlcnZlci5JTlNUQU5DRS5yZWdpc3RlclRhcmdldCh0aGlzLmVsZW1lbnQsIHtcblx0XHRcdG9uRHJhZ1N0YXJ0OiBlID0+IG92ZXJsYXkuY2xhc3NMaXN0LmFkZCgndmlzaWJsZScpLFxuXHRcdFx0b25EcmFnRW5kOiBlID0+IG92ZXJsYXkuY2xhc3NMaXN0LnJlbW92ZSgndmlzaWJsZScpXG5cdFx0fSkpO1xuXG5cdFx0bGV0IGhvcml6b250YWxPcGVuZXJUaW1lb3V0OiBUaW1lb3V0IHwgdW5kZWZpbmVkO1xuXHRcdGxldCB2ZXJ0aWNhbE9wZW5lclRpbWVvdXQ6IFRpbWVvdXQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhc3RPcGVuSG9yaXpvbnRhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFzdE9wZW5WZXJ0aWNhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvcGVuUGFydEF0UG9zaXRpb24gPSAocG9zaXRpb246IFBvc2l0aW9uKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuUEFORUxfUEFSVCkgJiYgcG9zaXRpb24gPT09IHRoaXMubGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkpIHtcblx0XHRcdFx0dGhpcy5sYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4oZmFsc2UsIFBhcnRzLlBBTkVMX1BBUlQpO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCkgJiYgcG9zaXRpb24gPT09ICh0aGlzLmxheW91dFNlcnZpY2UuZ2V0U2lkZUJhclBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLlJJR0hUID8gUG9zaXRpb24uTEVGVCA6IFBvc2l0aW9uLlJJR0hUKSkge1xuXHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbihmYWxzZSwgUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjbGVhckFsbFRpbWVvdXRzID0gKCkgPT4ge1xuXHRcdFx0aWYgKGhvcml6b250YWxPcGVuZXJUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dChob3Jpem9udGFsT3BlbmVyVGltZW91dCk7XG5cdFx0XHRcdGhvcml6b250YWxPcGVuZXJUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmVydGljYWxPcGVuZXJUaW1lb3V0KSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh2ZXJ0aWNhbE9wZW5lclRpbWVvdXQpO1xuXHRcdFx0XHR2ZXJ0aWNhbE9wZW5lclRpbWVvdXQgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbXBvc2l0ZURyYWdBbmREcm9wT2JzZXJ2ZXIuSU5TVEFOQ0UucmVnaXN0ZXJUYXJnZXQob3ZlcmxheSwge1xuXHRcdFx0b25EcmFnT3ZlcjogZSA9PiB7XG5cdFx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZS5ldmVudERhdGEsIHRydWUpO1xuXHRcdFx0XHRpZiAoZS5ldmVudERhdGEuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdFx0ZS5ldmVudERhdGEuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbm9uZSc7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBib3VuZGluZ1JlY3QgPSBvdmVybGF5LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXG5cdFx0XHRcdGxldCBvcGVuSG9yaXpvbnRhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IG9wZW5WZXJ0aWNhbFBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcHJveGltaXR5ID0gMTAwO1xuXHRcdFx0XHRpZiAoZS5ldmVudERhdGEuY2xpZW50WCA8IGJvdW5kaW5nUmVjdC5sZWZ0ICsgcHJveGltaXR5KSB7XG5cdFx0XHRcdFx0b3Blbkhvcml6b250YWxQb3NpdGlvbiA9IFBvc2l0aW9uLkxFRlQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZS5ldmVudERhdGEuY2xpZW50WCA+IGJvdW5kaW5nUmVjdC5yaWdodCAtIHByb3hpbWl0eSkge1xuXHRcdFx0XHRcdG9wZW5Ib3Jpem9udGFsUG9zaXRpb24gPSBQb3NpdGlvbi5SSUdIVDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChlLmV2ZW50RGF0YS5jbGllbnRZID4gYm91bmRpbmdSZWN0LmJvdHRvbSAtIHByb3hpbWl0eSkge1xuXHRcdFx0XHRcdG9wZW5WZXJ0aWNhbFBvc2l0aW9uID0gUG9zaXRpb24uQk9UVE9NO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGUuZXZlbnREYXRhLmNsaWVudFkgPCBib3VuZGluZ1JlY3QudG9wICsgcHJveGltaXR5KSB7XG5cdFx0XHRcdFx0b3BlblZlcnRpY2FsUG9zaXRpb24gPSBQb3NpdGlvbi5UT1A7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaG9yaXpvbnRhbE9wZW5lclRpbWVvdXQgJiYgb3Blbkhvcml6b250YWxQb3NpdGlvbiAhPT0gbGFzdE9wZW5Ib3Jpem9udGFsUG9zaXRpb24pIHtcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQoaG9yaXpvbnRhbE9wZW5lclRpbWVvdXQpO1xuXHRcdFx0XHRcdGhvcml6b250YWxPcGVuZXJUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHZlcnRpY2FsT3BlbmVyVGltZW91dCAmJiBvcGVuVmVydGljYWxQb3NpdGlvbiAhPT0gbGFzdE9wZW5WZXJ0aWNhbFBvc2l0aW9uKSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHZlcnRpY2FsT3BlbmVyVGltZW91dCk7XG5cdFx0XHRcdFx0dmVydGljYWxPcGVuZXJUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFob3Jpem9udGFsT3BlbmVyVGltZW91dCAmJiBvcGVuSG9yaXpvbnRhbFBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRsYXN0T3Blbkhvcml6b250YWxQb3NpdGlvbiA9IG9wZW5Ib3Jpem9udGFsUG9zaXRpb247XG5cdFx0XHRcdFx0aG9yaXpvbnRhbE9wZW5lclRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IG9wZW5QYXJ0QXRQb3NpdGlvbihvcGVuSG9yaXpvbnRhbFBvc2l0aW9uKSwgMjAwKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdmVydGljYWxPcGVuZXJUaW1lb3V0ICYmIG9wZW5WZXJ0aWNhbFBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRsYXN0T3BlblZlcnRpY2FsUG9zaXRpb24gPSBvcGVuVmVydGljYWxQb3NpdGlvbjtcblx0XHRcdFx0XHR2ZXJ0aWNhbE9wZW5lclRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IG9wZW5QYXJ0QXRQb3NpdGlvbihvcGVuVmVydGljYWxQb3NpdGlvbiksIDIwMCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvbkRyYWdMZWF2ZTogKCkgPT4gY2xlYXJBbGxUaW1lb3V0cygpLFxuXHRcdFx0b25EcmFnRW5kOiAoKSA9PiBjbGVhckFsbFRpbWVvdXRzKCksXG5cdFx0XHRvbkRyb3A6ICgpID0+IGNsZWFyQWxsVGltZW91dHMoKVxuXHRcdH0pKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSBwZW5kaW5nIG9wZW5lciB0aW1lb3V0cyBhcmUgY2xlYXJlZCB3aGVuIHRoZSBwYXJ0IGlzIGRpc3Bvc2VkXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGNsZWFyQWxsVGltZW91dHMoKSkpO1xuXHR9XG5cblx0Y2VudGVyTGF5b3V0KGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuY2VudGVyZWRMYXlvdXRXaWRnZXQuYWN0aXZhdGUoYWN0aXZlKTtcblx0fVxuXG5cdGlzTGF5b3V0Q2VudGVyZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY2VudGVyZWRMYXlvdXRXaWRnZXQpIHtcblx0XHRcdHJldHVybiB0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LmlzQWN0aXZlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NyZWF0ZUdyaWRDb250cm9sKCk6IHZvaWQge1xuXG5cdFx0Ly8gR3JpZCBXaWRnZXQgKHdpdGggcHJldmlvdXMgVUkgc3RhdGUpXG5cdFx0bGV0IHJlc3RvcmVFcnJvciA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLl93aWxsUmVzdG9yZVN0YXRlKSB7XG5cdFx0XHRyZXN0b3JlRXJyb3IgPSAhdGhpcy5kb0NyZWF0ZUdyaWRDb250cm9sV2l0aFByZXZpb3VzU3RhdGUoKTtcblx0XHR9XG5cblx0XHQvLyBHcmlkIFdpZGdldCAobm8gcHJldmlvdXMgVUkgc3RhdGUgb3IgZmFpbGVkIHRvIHJlc3RvcmUpXG5cdFx0aWYgKCF0aGlzLmdyaWRXaWRnZXQgfHwgcmVzdG9yZUVycm9yKSB7XG5cdFx0XHRjb25zdCBpbml0aWFsR3JvdXAgPSB0aGlzLmRvQ3JlYXRlR3JvdXBWaWV3KCk7XG5cdFx0XHR0aGlzLmRvU2V0R3JpZFdpZGdldChuZXcgU2VyaWFsaXphYmxlR3JpZChpbml0aWFsR3JvdXApKTtcblxuXHRcdFx0Ly8gRW5zdXJlIGEgZ3JvdXAgaXMgYWN0aXZlXG5cdFx0XHR0aGlzLmRvU2V0R3JvdXBBY3RpdmUoaW5pdGlhbEdyb3VwKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29udGFpbmVyXG5cdFx0dGhpcy51cGRhdGVDb250YWluZXIoKTtcblxuXHRcdC8vIE5vdGlmeSBncm91cCBpbmRleCBjaGFuZ2Ugd2UgY3JlYXRlZCB0aGUgZW50aXJlIGdyaWRcblx0XHR0aGlzLm5vdGlmeUdyb3VwSW5kZXhDaGFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgZG9DcmVhdGVHcmlkQ29udHJvbFdpdGhQcmV2aW91c1N0YXRlKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXRlOiBJRWRpdG9yUGFydFVJU3RhdGUgfCB1bmRlZmluZWQgPSB0aGlzLmxvYWRTdGF0ZSgpO1xuXHRcdGlmIChzdGF0ZT8uc2VyaWFsaXplZEdyaWQpIHtcblx0XHRcdHRyeSB7XG5cblx0XHRcdFx0Ly8gTVJVXG5cdFx0XHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3VwcyA9IHN0YXRlLm1vc3RSZWNlbnRBY3RpdmVHcm91cHM7XG5cblx0XHRcdFx0Ly8gR3JpZCBXaWRnZXRcblx0XHRcdFx0dGhpcy5kb0NyZWF0ZUdyaWRDb250cm9sV2l0aFN0YXRlKHN0YXRlLnNlcmlhbGl6ZWRHcmlkLCBzdGF0ZS5hY3RpdmVHcm91cCk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXG5cdFx0XHRcdC8vIExvZyBlcnJvclxuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihuZXcgRXJyb3IoYEVycm9yIHJlc3RvcmluZyBlZGl0b3IgZ3JpZCB3aWRnZXQ6ICR7ZXJyb3J9ICh3aXRoIHN0YXRlOiAke0pTT04uc3RyaW5naWZ5KHN0YXRlKX0pYCkpO1xuXG5cdFx0XHRcdC8vIENsZWFyIGFueSBzdGF0ZSB3ZSBoYXZlIGZyb20gdGhlIGZhaWxpbmcgcmVzdG9yZVxuXHRcdFx0XHR0aGlzLmRpc3Bvc2VHcm91cHMoKTtcblxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGZhaWx1cmVcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTsgLy8gc3VjY2Vzc1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NyZWF0ZUdyaWRDb250cm9sV2l0aFN0YXRlKHNlcmlhbGl6ZWRHcmlkOiBJU2VyaWFsaXplZEdyaWQsIGFjdGl2ZUdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgZWRpdG9yR3JvdXBWaWV3c1RvUmV1c2U/OiBJRWRpdG9yR3JvdXBWaWV3W10sIG9wdGlvbnM/OiBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gRGV0ZXJtaW5lIGdyb3VwIHZpZXdzIHRvIHJldXNlIGlmIGFueVxuXHRcdGxldCByZXVzZUdyb3VwVmlld3M6IElFZGl0b3JHcm91cFZpZXdbXTtcblx0XHRpZiAoZWRpdG9yR3JvdXBWaWV3c1RvUmV1c2UpIHtcblx0XHRcdHJldXNlR3JvdXBWaWV3cyA9IGVkaXRvckdyb3VwVmlld3NUb1JldXNlLnNsaWNlKDApOyAvLyBkbyBub3QgbW9kaWZ5IG9yaWdpbmFsIGFycmF5XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldXNlR3JvdXBWaWV3cyA9IFtdO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBuZXdcblx0XHRjb25zdCBncm91cFZpZXdzOiBJRWRpdG9yR3JvdXBWaWV3W10gPSBbXTtcblx0XHRjb25zdCBncmlkV2lkZ2V0ID0gU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShzZXJpYWxpemVkR3JpZCwge1xuXHRcdFx0ZnJvbUpTT046IChzZXJpYWxpemVkRWRpdG9yR3JvdXA6IElTZXJpYWxpemVkRWRpdG9yR3JvdXBNb2RlbCB8IG51bGwpID0+IHtcblx0XHRcdFx0bGV0IGdyb3VwVmlldzogSUVkaXRvckdyb3VwVmlldztcblx0XHRcdFx0aWYgKHJldXNlR3JvdXBWaWV3cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Z3JvdXBWaWV3ID0gcmV1c2VHcm91cFZpZXdzLnNoaWZ0KCkhO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGdyb3VwVmlldyA9IHRoaXMuZG9DcmVhdGVHcm91cFZpZXcoc2VyaWFsaXplZEVkaXRvckdyb3VwLCBvcHRpb25zKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGdyb3VwVmlld3MucHVzaChncm91cFZpZXcpO1xuXG5cdFx0XHRcdGlmIChncm91cFZpZXcuaWQgPT09IGFjdGl2ZUdyb3VwSWQpIHtcblx0XHRcdFx0XHR0aGlzLmRvU2V0R3JvdXBBY3RpdmUoZ3JvdXBWaWV3KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBncm91cFZpZXc7XG5cdFx0XHR9XG5cdFx0fSwgeyBzdHlsZXM6IHsgc2VwYXJhdG9yQm9yZGVyOiB0aGlzLmdyaWRTZXBhcmF0b3JCb3JkZXIgfSB9KTtcblxuXHRcdC8vIElmIHRoZSBhY3RpdmUgZ3JvdXAgd2FzIG5vdCBmb3VuZCB3aGVuIHJlc3RvcmluZyB0aGUgZ3JpZFxuXHRcdC8vIG1ha2Ugc3VyZSB0byBtYWtlIGF0IGxlYXN0IG9uZSBncm91cCBhY3RpdmUuIFdlIGFsd2F5cyBuZWVkXG5cdFx0Ly8gYW4gYWN0aXZlIGdyb3VwLlxuXHRcdGlmICghdGhpcy5fYWN0aXZlR3JvdXApIHtcblx0XHRcdHRoaXMuZG9TZXRHcm91cEFjdGl2ZShncm91cFZpZXdzWzBdKTtcblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBNUlUgZ3JvdXAgdmlld3MgbWF0Y2hlcyBncmlkIHdpZGdldCBzdGF0ZVxuXHRcdGlmICh0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMuc29tZShncm91cElkID0+ICF0aGlzLmdldEdyb3VwKGdyb3VwSWQpKSkge1xuXHRcdFx0dGhpcy5tb3N0UmVjZW50QWN0aXZlR3JvdXBzID0gZ3JvdXBWaWV3cy5tYXAoZ3JvdXAgPT4gZ3JvdXAuaWQpO1xuXHRcdH1cblxuXHRcdC8vIFNldCBpdFxuXHRcdHRoaXMuZG9TZXRHcmlkV2lkZ2V0KGdyaWRXaWRnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NldEdyaWRXaWRnZXQoZ3JpZFdpZGdldDogU2VyaWFsaXphYmxlR3JpZDxJRWRpdG9yR3JvdXBWaWV3Pik6IHZvaWQge1xuXHRcdGxldCBib3VuZGFyeVNhc2hlczogSUJvdW5kYXJ5U2FzaGVzID0ge307XG5cblx0XHRpZiAodGhpcy5ncmlkV2lkZ2V0KSB7XG5cdFx0XHRib3VuZGFyeVNhc2hlcyA9IHRoaXMuZ3JpZFdpZGdldC5ib3VuZGFyeVNhc2hlcztcblx0XHRcdHRoaXMuZ3JpZFdpZGdldC5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ncmlkV2lkZ2V0ID0gZ3JpZFdpZGdldDtcblx0XHR0aGlzLmdyaWRXaWRnZXQuYm91bmRhcnlTYXNoZXMgPSBib3VuZGFyeVNhc2hlcztcblx0XHR0aGlzLmdyaWRXaWRnZXRWaWV3LmdyaWRXaWRnZXQgPSBncmlkV2lkZ2V0O1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMuaW5wdXQgPSBncmlkV2lkZ2V0Lm9uRGlkQ2hhbmdlO1xuXHRcdHRoaXMuX29uRGlkU2Nyb2xsLmlucHV0ID0gZ3JpZFdpZGdldC5vbkRpZFNjcm9sbDtcblx0XHR0aGlzLmdyaWRXaWRnZXREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZ3JpZFdpZGdldERpc3Bvc2FibGVzLmFkZChncmlkV2lkZ2V0Lm9uRGlkQ2hhbmdlVmlld01heGltaXplZChtYXhpbWl6ZWQgPT4gdGhpcy5fb25EaWRDaGFuZ2VHcm91cE1heGltaXplZC5maXJlKG1heGltaXplZCkpKTtcblxuXHRcdHRoaXMub25EaWRTZXRHcmlkV2lkZ2V0LmZpcmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29udGFpbmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgdGhpcy5pc0VtcHR5KTtcblx0fVxuXG5cdHByaXZhdGUgbm90aWZ5R3JvdXBJbmRleENoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5HUklEX0FQUEVBUkFOQ0UpLmZvckVhY2goKGdyb3VwLCBpbmRleCkgPT4gZ3JvdXAubm90aWZ5SW5kZXhDaGFuZ2VkKGluZGV4KSk7XG5cdH1cblxuXHRub3RpZnlHcm91cHNMYWJlbENoYW5nZShuZXdMYWJlbDogc3RyaW5nKSB7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmdyb3Vwcykge1xuXHRcdFx0Z3JvdXAubm90aWZ5TGFiZWxDaGFuZ2VkKG5ld0xhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvdW50ID09PSAxICYmIHRoaXMuX2FjdGl2ZUdyb3VwLmlzRW1wdHk7XG5cdH1cblxuXHRzZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcyk6IHZvaWQge1xuXHRcdHRoaXMuZ3JpZFdpZGdldC5ib3VuZGFyeVNhc2hlcyA9IHNhc2hlcztcblx0XHR0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LmJvdW5kYXJ5U2FzaGVzID0gc2FzaGVzO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy50b3AgPSB0b3A7XG5cdFx0dGhpcy5sZWZ0ID0gbGVmdDtcblxuXHRcdC8vIFdoZW4gdGhlIGZsb2F0aW5nIHBhbmVscyBleHBlcmltZW50IGlzIGVuYWJsZWQsIHJlc2VydmUgYSBtYXJnaW4gYXJvdW5kIHRoZVxuXHRcdC8vIG1haW4gZWRpdG9yIHNvIGl0IGZsb2F0cyBsaWtlIHRoZSBzaWRlIGJhciBhbmQgcGFuZWwgY2FyZHMuIFRoZSBlZGl0b3IgaGFzXG5cdFx0Ly8gbm8gdG9wIG1hcmdpbiAoaXQgc3RheXMgZmx1c2ggd2l0aCB0aGUgdGl0bGUgYmFyKS4gU2NvcGUgdG8gdGhlIG1haW4gd2luZG93XG5cdFx0Ly8gKGF1eGlsaWFyeSBlZGl0b3Igd2luZG93cyBkbyBub3QgYXBwbHkgdGhlIG1hdGNoaW5nIENTUykuIFRoZSBtYXRjaGluZ1xuXHRcdC8vIGBtYXJnaW5gIGlzIGFwcGxpZWQgaW4gQ1NTIChgLmZsb2F0aW5nLXBhbmVscyAucGFydC5lZGl0b3JgKS5cblx0XHRpZiAodGhpcy53aW5kb3dJZCA9PT0gbWFpbldpbmRvdy52c2NvZGVXaW5kb3dJZCAmJiB0aGlzLmxheW91dFNlcnZpY2UuaXNGbG9hdGluZ1BhbmVsc0VuYWJsZWQoKSkge1xuXG5cdFx0XHQvLyBXaGVuIHRoZSBlZGl0b3IgYmVjb21lcyB0aGUgb3V0ZXJtb3N0IGNhcmQgb24gYSBzaWRlIChubyBmbG9hdGluZyBwYXJ0XG5cdFx0XHQvLyBzaXRzIGJldHdlZW4gaXQgYW5kIHRoZSB3aW5kb3cgZWRnZSkgaXQgYWRvcHRzIHRoZSBzYW1lIGRvdWJsZWQgZ3V0dGVyIHRoZVxuXHRcdFx0Ly8gc2lkZS9hdXggYmFycyB1c2UsIHNvIGl0cyBjb250ZW50cyBkbyBub3QgaHVnIHRoZSB3aW5kb3cgZWRnZS4gVGhlIG1hdGNoaW5nXG5cdFx0XHQvLyBtYXJnaW5zIGFyZSBhcHBsaWVkIGluIENTUyB2aWEgdGhlIHRvZ2dsZWQgY2xhc3NlcyBiZWxvdy5cblx0XHRcdGNvbnN0IG93bmVycyA9IGdldEZsb2F0aW5nT3V0ZXJFZGdlT3duZXJzKHRoaXMubGF5b3V0U2VydmljZSk7XG5cdFx0XHRjb25zdCBvdXRlckxlZnQgPSBvd25lcnMubGVmdCA9PT0gUGFydHMuRURJVE9SX1BBUlQ7XG5cdFx0XHRjb25zdCBvdXRlclJpZ2h0ID0gb3duZXJzLnJpZ2h0ID09PSBQYXJ0cy5FRElUT1JfUEFSVDtcblxuXHRcdFx0Y29uc3QgbGVmdE1hcmdpbiA9IG91dGVyTGVmdCA/IEZMT0FUSU5HX1BBTkVMX01BUkdJTiAqIDIgOiBGTE9BVElOR19QQU5FTF9NQVJHSU47XG5cdFx0XHRjb25zdCByaWdodE1hcmdpbiA9IG91dGVyUmlnaHQgPyBGTE9BVElOR19QQU5FTF9NQVJHSU4gKiAyIDogRkxPQVRJTkdfUEFORUxfSU5ORVJfTUFSR0lOO1xuXG5cdFx0XHR3aWR0aCA9IE1hdGgubWF4KDAsIHdpZHRoIC0gbGVmdE1hcmdpbiAtIHJpZ2h0TWFyZ2luKTtcblx0XHRcdGNvbnN0IHsgdG9wTWFyZ2luLCBib3R0b21NYXJnaW4gfSA9IHRoaXMuZ2V0RmxvYXRpbmdQYW5lbEhlaWdodEluc2V0cygpO1xuXHRcdFx0aGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gdG9wTWFyZ2luIC0gYm90dG9tTWFyZ2luKTtcblxuXHRcdFx0Ly8gUmVzZXJ2ZSBzcGFjZSBmb3IgdGhlIE1vZGVybiBVSSBlZGl0b3IgYm9yZGVyIChzdHlsZU92ZXJyaWRlcy9tZWRpYS9lZGl0b3JCb3JkZXIuY3NzKSBzbyBjb250ZW50IGRvZXNuJ3QgZ2V0IGNsaXBwZWQuXG5cdFx0XHRpZiAoIXRoaXMuZWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ21vZGFsLWVkaXRvci1wYXJ0JykpIHtcblx0XHRcdFx0d2lkdGggPSBNYXRoLm1heCgwLCB3aWR0aCAtIEVESVRPUl9GUkFNRV9CT1JERVJfV0lEVEggKiAyKTtcblx0XHRcdFx0aGVpZ2h0ID0gTWF0aC5tYXgoMCwgaGVpZ2h0IC0gRURJVE9SX0ZSQU1FX0JPUkRFUl9XSURUSCAqIDIpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZmxvYXRpbmctZWRpdG9yLW91dGVyLWxlZnQnLCBvdXRlckxlZnQpO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2Zsb2F0aW5nLWVkaXRvci1vdXRlci1yaWdodCcsIG91dGVyUmlnaHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnZmxvYXRpbmctZWRpdG9yLW91dGVyLWxlZnQnLCAnZmxvYXRpbmctZWRpdG9yLW91dGVyLXJpZ2h0Jyk7XG5cdFx0fVxuXG5cdFx0Ly8gTGF5b3V0IGNvbnRlbnRzXG5cdFx0Y29uc3QgY29udGVudEFyZWFTaXplID0gc3VwZXIubGF5b3V0Q29udGVudHMod2lkdGgsIGhlaWdodCkuY29udGVudFNpemU7XG5cblx0XHQvLyBMYXlvdXQgZWRpdG9yIGNvbnRhaW5lclxuXHRcdHRoaXMuZG9MYXlvdXQoRGltZW5zaW9uLmxpZnQoY29udGVudEFyZWFTaXplKSwgdG9wLCBsZWZ0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSB0b3AgYW5kIGJvdHRvbSBtYXJnaW5zIChpbiBwaXhlbHMpIHRvIHN1YnRyYWN0IGZyb20gdGhlIGVkaXRvciBoZWlnaHRcblx0ICogd2hlbiB0aGUgZmxvYXRpbmcgcGFuZWxzIGV4cGVyaW1lbnQgaXMgYWN0aXZlLiBBY2NvdW50cyBmb3IgcGFuZWwgcG9zaXRpb24gKGEgdG9wXG5cdCAqIHBhbmVsIHB1c2hlcyB0aGUgZWRpdG9yIGRvd24pIGFuZCBzdGF0dXMgYmFyIHZpc2liaWxpdHkgKGhpZGRlbiBzdGF0dXMgYmFyIG1lYW5zXG5cdCAqIHRoZSBlZGl0b3IgaXMgYXQgdGhlIHdpbmRvdyBib3R0b20gZWRnZSBhbmQgZ2V0cyBhIGRvdWJsZWQgYm90dG9tIG1hcmdpbikuXG5cdCAqL1xuXHRwcml2YXRlIGdldEZsb2F0aW5nUGFuZWxIZWlnaHRJbnNldHMoKTogeyB0b3BNYXJnaW46IG51bWJlcjsgYm90dG9tTWFyZ2luOiBudW1iZXIgfSB7XG5cdFx0Y29uc3QgcGFuZWxWaXNpYmxlID0gdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5QQU5FTF9QQVJUKTtcblx0XHQvLyBXaGVuIHRoZSBwYW5lbCBpcyBwb3NpdGlvbmVkIGFib3ZlIHRoZSBlZGl0b3IgYW5kIHZpc2libGUsIHRoZSBlZGl0b3IgaXMgbm8gbG9uZ2VyXG5cdFx0Ly8gYWRqYWNlbnQgdG8gdGhlIHRpdGxlIGJhciBcdTIwMTQgcmVzZXJ2ZSBhIHRvcCBtYXJnaW4gdG8gbWF0Y2ggdGhlIGludGVyLWNhcmQgZ2Fwcy5cblx0XHRjb25zdCBwYW5lbEF0VG9wID0gcGFuZWxWaXNpYmxlICYmIHRoaXMubGF5b3V0U2VydmljZS5nZXRQYW5lbFBvc2l0aW9uKCkgPT09IFBvc2l0aW9uLlRPUDtcblx0XHQvLyBXaGVuIHRoZSBzdGF0dXMgYmFyIGlzIGhpZGRlbiwgdGhlIGVkaXRvciBpcyBhdCB0aGUgd2luZG93IGJvdHRvbSBlZGdlIFx1MjAxNCBkb3VibGUgdGhlXG5cdFx0Ly8gbWFyZ2luLiBFeGNlcHRpb246IHdoZW4gYSBib3R0b20gcGFuZWwgaXMgdmlzaWJsZSB0aGUgZWRpdG9yJ3MgYm90dG9tIGZhY2VzIHRoZSBwYW5lbFxuXHRcdC8vIGNhcmQgKG5vdCB0aGUgd2luZG93IGVkZ2UpLCBzbyBrZWVwIHRoZSBub3JtYWwgaW50ZXItY2FyZCBnYXAuXG5cdFx0Y29uc3QgcGFuZWxBdEJvdHRvbSA9IHBhbmVsVmlzaWJsZSAmJiB0aGlzLmxheW91dFNlcnZpY2UuZ2V0UGFuZWxQb3NpdGlvbigpID09PSBQb3NpdGlvbi5CT1RUT007XG5cdFx0Y29uc3QgYm90dG9tTWFyZ2luID0gIXRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU1RBVFVTQkFSX1BBUlQsIG1haW5XaW5kb3cpICYmICFwYW5lbEF0Qm90dG9tXG5cdFx0XHQ/IEZMT0FUSU5HX1BBTkVMX01BUkdJTiAqIDIgOiBGTE9BVElOR19QQU5FTF9JTk5FUl9NQVJHSU47XG5cdFx0cmV0dXJuIHsgdG9wTWFyZ2luOiBwYW5lbEF0VG9wID8gRkxPQVRJTkdfUEFORUxfTUFSR0lOIDogMCwgYm90dG9tTWFyZ2luIH07XG5cdH1cblxuXHRwcml2YXRlIGRvTGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uLCB0b3AgPSB0aGlzLnRvcCwgbGVmdCA9IHRoaXMubGVmdCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnREaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHQvLyBMYXlvdXQgR3JpZFxuXHRcdHRoaXMuY2VudGVyZWRMYXlvdXRXaWRnZXQubGF5b3V0KHRoaXMuX2NvbnRlbnREaW1lbnNpb24ud2lkdGgsIHRoaXMuX2NvbnRlbnREaW1lbnNpb24uaGVpZ2h0LCB0b3AsIGxlZnQpO1xuXG5cdFx0Ly8gRXZlbnRcblx0XHR0aGlzLl9vbkRpZExheW91dC5maXJlKGRpbWVuc2lvbik7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXG5cdFx0Ly8gUGVyc2lzdCBncmlkIFVJIHN0YXRlXG5cdFx0aWYgKHRoaXMuZ3JpZFdpZGdldCkge1xuXHRcdFx0aWYgKHRoaXMuaXNFbXB0eSkge1xuXHRcdFx0XHRkZWxldGUgdGhpcy53b3Jrc3BhY2VNZW1lbnRvW0VkaXRvclBhcnQuRURJVE9SX1BBUlRfVUlfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy53b3Jrc3BhY2VNZW1lbnRvW0VkaXRvclBhcnQuRURJVE9SX1BBUlRfVUlfU1RBVEVfU1RPUkFHRV9LRVldID0gdGhpcy5jcmVhdGVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFBlcnNpc3QgY2VudGVyZWQgdmlldyBzdGF0ZVxuXHRcdGlmICh0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0KSB7XG5cdFx0XHRjb25zdCBjZW50ZXJlZExheW91dFN0YXRlID0gdGhpcy5jZW50ZXJlZExheW91dFdpZGdldC5zdGF0ZTtcblx0XHRcdGlmICh0aGlzLmNlbnRlcmVkTGF5b3V0V2lkZ2V0LmlzRGVmYXVsdChjZW50ZXJlZExheW91dFN0YXRlKSkge1xuXHRcdFx0XHRkZWxldGUgdGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX0NFTlRFUkVEX1ZJRVdfU1RPUkFHRV9LRVldO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5wcm9maWxlTWVtZW50b1tFZGl0b3JQYXJ0LkVESVRPUl9QQVJUX0NFTlRFUkVEX1ZJRVdfU1RPUkFHRV9LRVldID0gY2VudGVyZWRMYXlvdXRTdGF0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBsb2FkU3RhdGUoKTogSUVkaXRvclBhcnRVSVN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VNZW1lbnRvW0VkaXRvclBhcnQuRURJVE9SX1BBUlRfVUlfU1RBVEVfU1RPUkFHRV9LRVldO1xuXHR9XG5cblx0Y3JlYXRlU3RhdGUoKTogSUVkaXRvclBhcnRVSVN0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c2VyaWFsaXplZEdyaWQ6IHRoaXMuZ3JpZFdpZGdldC5zZXJpYWxpemUoKSxcblx0XHRcdGFjdGl2ZUdyb3VwOiB0aGlzLl9hY3RpdmVHcm91cC5pZCxcblx0XHRcdG1vc3RSZWNlbnRBY3RpdmVHcm91cHM6IHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3Vwc1xuXHRcdH07XG5cdH1cblxuXHRhcHBseVN0YXRlKHN0YXRlOiBJRWRpdG9yUGFydFVJU3RhdGUgfCAnZW1wdHknLCBvcHRpb25zPzogSUVkaXRvckdyb3VwVmlld09wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc3RhdGUgPT09ICdlbXB0eScpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvQXBwbHlFbXB0eVN0YXRlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB0aGlzLmRvQXBwbHlTdGF0ZShzdGF0ZSwgb3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb0FwcGx5U3RhdGUoc3RhdGU6IElFZGl0b3JQYXJ0VUlTdGF0ZSwgb3B0aW9ucz86IElFZGl0b3JHcm91cFZpZXdPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYXdhaXQgdGhpcy5kb1ByZXBhcmVBcHBseVN0YXRlKCk7XG5cblx0XHQvLyBQYXVzZSBhZGQvcmVtb3ZlIGV2ZW50cyBmb3IgZ3JvdXBzIGR1cmluZyB0aGUgZHVyYXRpb24gb2YgYXBwbHlpbmcgdGhlIHN0YXRlXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIHRoYXQgd2UgY2FuIGRvIHRoaXMgdHJhbnNpdGlvbiBhdG9taWNhbGx5IHdpdGggdGhlIG5ldyBzdGF0ZVxuXHRcdC8vIGJlaW5nIHJlYWR5IHdoZW4gdGhlIGV2ZW50cyBhcmUgZmlyZWQuIFRoaXMgaXMgaW1wb3J0YW50IGJlY2F1c2UgdXN1YWxseSB0aGVyZVxuXHRcdC8vIGlzIG5ldmVyIHRoZSBzdGF0ZSB3aGVyZSBubyBncm91cHMgYXJlIHByZXNlbnQsIGJ1dCBmb3IgdGhpcyB0cmFuc2l0aW9uIHdlXG5cdFx0Ly8gbmVlZCB0byB0ZW1wb3JhcmlseSBkaXNwb3NlIGFsbCBncm91cHMgdG8gcmVzdG9yZSB0aGUgbmV3IHNldC5cblxuXHRcdHRoaXMuX29uRGlkQWRkR3JvdXAucGF1c2UoKTtcblx0XHR0aGlzLl9vbkRpZFJlbW92ZUdyb3VwLnBhdXNlKCk7XG5cblx0XHR0aGlzLmRpc3Bvc2VHcm91cHMoKTtcblxuXHRcdC8vIE1SVVxuXHRcdHRoaXMubW9zdFJlY2VudEFjdGl2ZUdyb3VwcyA9IHN0YXRlLm1vc3RSZWNlbnRBY3RpdmVHcm91cHM7XG5cblx0XHQvLyBHcmlkIFdpZGdldFxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmRvQXBwbHlHcmlkU3RhdGUoc3RhdGUuc2VyaWFsaXplZEdyaWQsIHN0YXRlLmFjdGl2ZUdyb3VwLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBJdCBpcyB2ZXJ5IGltcG9ydGFudCB0byBrZWVwIHRoaXMgb3JkZXI6IGZpcnN0IHJlc3VtZSB0aGUgZXZlbnRzIGZvclxuXHRcdFx0Ly8gcmVtb3ZlZCBncm91cHMgYW5kIHRoZW4gZm9yIGFkZGVkIGdyb3Vwcy4gTWFueSBsaXN0ZW5lcnMgbWF5IHN0b3JlXG5cdFx0XHQvLyBncm91cHMgaW4gc2V0cyBieSB0aGVpciBpZGVudGlmaWVyIGFuZCBncm91cHMgY2FuIGhhdmUgdGhlIHNhbWVcblx0XHRcdC8vIGlkZW50aWZpZXIgYmVmb3JlIGFuZCBhZnRlci5cblx0XHRcdHRoaXMuX29uRGlkUmVtb3ZlR3JvdXAucmVzdW1lKCk7XG5cdFx0XHR0aGlzLl9vbkRpZEFkZEdyb3VwLnJlc3VtZSgpO1xuXHRcdH1cblxuXHRcdC8vIFJlc3RvcmUgZWRpdG9ycyB0aGF0IHdlcmUgbm90IGNsb3NlZCBiZWZvcmUgYW5kIGFyZSBub3cgb3BlbmVkIG5vd1xuXHRcdGF3YWl0IHRoaXMuYWN0aXZlR3JvdXAub3BlbkVkaXRvcnMoXG5cdFx0XHRncm91cHNcblx0XHRcdFx0LmZsYXRNYXAoZ3JvdXAgPT4gZ3JvdXAuZWRpdG9ycylcblx0XHRcdFx0LmZpbHRlcihlZGl0b3IgPT4gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcuZ3JvdXBzLmV2ZXJ5KGdyb3VwVmlldyA9PiAhZ3JvdXBWaWV3LmNvbnRhaW5zKGVkaXRvcikpKVxuXHRcdFx0XHQubWFwKGVkaXRvciA9PiAoe1xuXHRcdFx0XHRcdGVkaXRvciwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUsIHByZXNlcnZlRm9jdXM6IHRydWUsIGluYWN0aXZlOiB0cnVlIH1cblx0XHRcdFx0fSkpXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9BcHBseUVtcHR5U3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5kb1ByZXBhcmVBcHBseVN0YXRlKCk7XG5cblx0XHR0aGlzLm1lcmdlQWxsR3JvdXBzKHRoaXMuYWN0aXZlR3JvdXApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1ByZXBhcmVBcHBseVN0YXRlKCk6IFByb21pc2U8SUVkaXRvckdyb3VwVmlld1tdPiB7XG5cblx0XHQvLyBCZWZvcmUgZGlzcG9zaW5nIGdyb3VwcywgdHJ5IHRvIGNsb3NlIGFzIG1hbnkgZWRpdG9ycyBhc1xuXHRcdC8vIHBvc3NpYmxlLCBidXQgc2tpcCBvdmVyIHRob3NlIHRoYXQgd291bGQgdHJpZ2dlciBhIGRpYWxvZ1xuXHRcdC8vIChmb3IgZXhhbXBsZSB3aGVuIGJlaW5nIGRpcnR5KS4gVGhpcyBpcyB0byBiZSBhYmxlIHRvIGxhdGVyXG5cdFx0Ly8gcmVzdG9yZSB0aGVzZSBlZGl0b3JzIGFmdGVyIHN0YXRlIGhhcyBiZWVuIGFwcGxpZWQuXG5cblx0XHRjb25zdCBncm91cHMgPSB0aGlzLmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcblx0XHRcdGF3YWl0IGdyb3VwLmNsb3NlQWxsRWRpdG9ycyh7IGV4Y2x1ZGVDb25maXJtaW5nOiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBncm91cHM7XG5cdH1cblxuXHRwcml2YXRlIGRvQXBwbHlHcmlkU3RhdGUoZ3JpZFN0YXRlOiBJU2VyaWFsaXplZEdyaWQsIGFjdGl2ZUdyb3VwSWQ6IEdyb3VwSWRlbnRpZmllciwgZWRpdG9yR3JvdXBWaWV3c1RvUmV1c2U/OiBJRWRpdG9yR3JvdXBWaWV3W10sIG9wdGlvbnM/OiBJRWRpdG9yR3JvdXBWaWV3T3B0aW9ucyk6IHZvaWQge1xuXG5cdFx0Ly8gUmVjcmVhdGUgZ3JpZCB3aWRnZXQgZnJvbSBzdGF0ZVxuXHRcdHRoaXMuZG9DcmVhdGVHcmlkQ29udHJvbFdpdGhTdGF0ZShncmlkU3RhdGUsIGFjdGl2ZUdyb3VwSWQsIGVkaXRvckdyb3VwVmlld3NUb1JldXNlLCBvcHRpb25zKTtcblxuXHRcdC8vIExheW91dCwgYnV0IG9ubHkgaWYgdGhlIHBhcnQgaGFzIGFscmVhZHkgYmVlbiBsYWlkIG91dCBhdCBsZWFzdCBvbmNlLlxuXHRcdC8vIFdoZW4gcmVzdG9yaW5nIGEgd29ya2luZyBzZXQgaW50byBhbiBlZGl0b3IgcGFydCB0aGF0IGhhcyBuZXZlciBiZWVuXG5cdFx0Ly8gc2hvd24gKGUuZy4gb24gcmVsb2FkIHdpdGggdGhlIGVkaXRvciBhcmVhIGhpZGRlbiksIGBfY29udGVudERpbWVuc2lvbmBcblx0XHQvLyBpcyBzdGlsbCB1bmRlZmluZWQ7IGxheWluZyBvdXQgaGVyZSB3b3VsZCB0aHJvdyBhbmQgYWJvcnQgYmVmb3JlIHRoZVxuXHRcdC8vIGBvbkRpZEFkZEdyb3VwYCBldmVudHMgYmVsb3cgYXJlIGZpcmVkIChsZWF2aW5nIHRoZSByZXN0b3JlZCBncm91cHNcblx0XHQvLyB1bnJlZ2lzdGVyZWQgd2l0aCB0aGUgZWRpdG9yIHNlcnZpY2UpLiBUaGUgZ3JpZCBpcyBsYWlkIG91dCBsYXRlciB3aGVuXG5cdFx0Ly8gdGhlIHBhcnQgaXMgZmlyc3Qgc2hvd24uXG5cdFx0aWYgKHRoaXMuX2NvbnRlbnREaW1lbnNpb24pIHtcblx0XHRcdHRoaXMuZG9MYXlvdXQodGhpcy5fY29udGVudERpbWVuc2lvbik7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIGNvbnRhaW5lclxuXHRcdHRoaXMudXBkYXRlQ29udGFpbmVyKCk7XG5cblx0XHQvLyBFdmVudHMgZm9yIGdyb3VwcyB0aGF0IGdvdCBhZGRlZFxuXHRcdGZvciAoY29uc3QgZ3JvdXBWaWV3IG9mIHRoaXMuZ2V0R3JvdXBzKEdyb3Vwc09yZGVyLkdSSURfQVBQRUFSQU5DRSkpIHtcblx0XHRcdGlmICghZWRpdG9yR3JvdXBWaWV3c1RvUmV1c2U/LmluY2x1ZGVzKGdyb3VwVmlldykpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRBZGRHcm91cC5maXJlKGdyb3VwVmlldyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTm90aWZ5IGdyb3VwIGluZGV4IGNoYW5nZSBnaXZlbiBsYXlvdXQgaGFzIGNoYW5nZWRcblx0XHR0aGlzLm5vdGlmeUdyb3VwSW5kZXhDaGFuZ2UoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VNZW1lbnRvU3RhdGUoZTogSVN0b3JhZ2VWYWx1ZUNoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuZXh0ZXJuYWwgJiYgZS5zY29wZSA9PT0gU3RvcmFnZVNjb3BlLldPUktTUEFDRSkge1xuXHRcdFx0dGhpcy5yZWxvYWRNZW1lbnRvKGUuc2NvcGUpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMubG9hZFN0YXRlKCk7XG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0dGhpcy5hcHBseVN0YXRlKHN0YXRlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogUGFydHMuRURJVE9SX1BBUlRcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwb3NlR3JvdXBzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5ncm91cHMpIHtcblx0XHRcdGdyb3VwLmRpc3Bvc2UoKTtcblxuXHRcdFx0dGhpcy5fb25EaWRSZW1vdmVHcm91cC5maXJlKGdyb3VwKTtcblx0XHR9XG5cblx0XHR0aGlzLmdyb3VwVmlld3MuY2xlYXIoKTtcblx0XHR0aGlzLm1vc3RSZWNlbnRBY3RpdmVHcm91cHMgPSBbXTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cblx0XHQvLyBFdmVudFxuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXG5cdFx0Ly8gRm9yd2FyZCB0byBhbGwgZ3JvdXBzXG5cdFx0dGhpcy5kaXNwb3NlR3JvdXBzKCk7XG5cblx0XHQvLyBHcmlkIHdpZGdldFxuXHRcdHRoaXMuZ3JpZFdpZGdldD8uZGlzcG9zZSgpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG5cbmV4cG9ydCBjbGFzcyBNYWluRWRpdG9yUGFydCBleHRlbmRzIEVkaXRvclBhcnQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yUGFydHNWaWV3LCBQYXJ0cy5FRElUT1JfUEFSVCwgJycsIG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgaG9zdFNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXLEdBQUcsYUFBYSx1Q0FBdUMsV0FBVywyQkFBMkIsa0JBQWtCLHFCQUFxQjtBQUN4SixTQUFTLE9BQU8sU0FBUyxPQUFPLHdCQUF3QjtBQUN4RCxTQUFTLGdCQUFnQix3QkFBd0I7QUFDakQsU0FBUyxnQkFBZ0IsbUJBQW1CLGtCQUFzQyxnQkFBZ0IsYUFBYSxlQUFrSSw2QkFBMEQ7QUFDM1MsU0FBUyw2QkFBNkI7QUFDdEMsU0FBZ0IsWUFBWSxnQkFBMkIsV0FBVyxrQkFBa0IsUUFBMEMsYUFBNkIsa0JBQTRCLDRCQUFrQztBQUN6TixTQUFxRyw0QkFBNEI7QUFDakksU0FBUyxxQkFBcUIsOEJBQThCO0FBQzVELFNBQVMsVUFBVSxnQkFBZ0I7QUFDbkMsU0FBMkIsc0JBQXNCLGdDQUEwSDtBQUMzSyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUF3RDtBQUNqRSxTQUFzQixTQUFTLGNBQWMsdUJBQXVCO0FBQ3BFLFNBQVMsaUJBQTJDLGNBQWMscUJBQXFCO0FBQ3ZGLFNBQXNDLG9DQUFvQztBQUMxRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBNkM7QUFDdEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxPQUFPLHlCQUF5QixVQUFVLDZCQUE2Qix1QkFBdUIsa0NBQWtDO0FBQ3pJLFNBQXNCLGtCQUFrQjtBQUN4QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLGlCQUFpQixnQkFBZ0I7QUFDMUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0IsdUNBQXVDLHVDQUF1QywwQkFBMEIsb0NBQW9DO0FBQzdLLFNBQVMsa0JBQWtCO0FBUzNCLE1BQU0sNEJBQTRCO0FBYWxDLE1BQU0sZUFBaUQ7QUFBQSxFQUF2RDtBQUVDLFNBQVMsVUFBdUIsRUFBRSxzQkFBc0I7QUFPeEQsU0FBUSxlQUFlLElBQUksTUFBcUQ7QUFDaEYsU0FBUyxjQUFjLEtBQUssYUFBYTtBQUFBO0FBQUEsRUFOekMsSUFBSSxlQUF1QjtBQUFFLFdBQU8sS0FBSyxhQUFhLEtBQUssV0FBVyxlQUFlO0FBQUEsRUFBRztBQUFBLEVBQ3hGLElBQUksZUFBdUI7QUFBRSxXQUFPLEtBQUssYUFBYSxLQUFLLFdBQVcsZUFBZSxPQUFPO0FBQUEsRUFBbUI7QUFBQSxFQUMvRyxJQUFJLGdCQUF3QjtBQUFFLFdBQU8sS0FBSyxhQUFhLEtBQUssV0FBVyxnQkFBZ0I7QUFBQSxFQUFHO0FBQUEsRUFDMUYsSUFBSSxnQkFBd0I7QUFBRSxXQUFPLEtBQUssYUFBYSxLQUFLLFdBQVcsZ0JBQWdCLE9BQU87QUFBQSxFQUFtQjtBQUFBLEVBT2pILElBQUksYUFBa0M7QUFDckMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxXQUFXLE1BQTJCO0FBQ3pDLFNBQUssUUFBUSxjQUFjO0FBRTNCLFFBQUksTUFBTTtBQUNULFdBQUssUUFBUSxZQUFZLEtBQUssT0FBTztBQUNyQyxXQUFLLGFBQWEsUUFBUSxLQUFLO0FBQUEsSUFDaEMsT0FBTztBQUNOLFdBQUssYUFBYSxRQUFRLE1BQU07QUFBQSxJQUNqQztBQUVBLFNBQUssY0FBYztBQUFBLEVBQ3BCO0FBQUEsRUFFQSxPQUFPLE9BQWUsUUFBZ0IsS0FBYSxNQUFvQjtBQUN0RSxTQUFLLFlBQVksT0FBTyxPQUFPLFFBQVEsS0FBSyxJQUFJO0FBQUEsRUFDakQ7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsU0FBSyxhQUFhLFFBQVE7QUFBQSxFQUMzQjtBQUNEO0FBRU8sSUFBTSxhQUFOLGNBQXlCLEtBQW1FO0FBQUEsRUF5RWxHLFlBQ29CLGlCQUNuQixJQUNpQixhQUNSLFVBQytCLHNCQUN6QixjQUMyQixzQkFDekIsZ0JBQ1EsZUFDTSxhQUNNLG1CQUNwQztBQUNELFVBQU0sSUFBSSxFQUFFLFVBQVUsTUFBTSxHQUFHLGNBQWMsZ0JBQWdCLGFBQWE7QUFadkQ7QUFFRjtBQUNSO0FBQytCO0FBRUU7QUFHWDtBQUNNO0FBN0V0QztBQUFBLFNBQWlCLGNBQWMsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2pFLFNBQVMsYUFBYSxLQUFLLFlBQVk7QUFFdkMsU0FBaUIsZUFBZSxLQUFLLFVBQVUsSUFBSSxRQUFtQixDQUFDO0FBQ3ZFLFNBQVMsY0FBYyxLQUFLLGFBQWE7QUFFekMsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDekYsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFFL0QsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDeEYsU0FBUyx3QkFBd0IsS0FBSyx1QkFBdUI7QUFFN0QsU0FBaUIseUJBQXlCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDeEYsU0FBUyx3QkFBd0IsS0FBSyx1QkFBdUI7QUFFN0QsU0FBaUIsMEJBQTBCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDekYsU0FBUyx5QkFBeUIsS0FBSyx3QkFBd0I7QUFFL0QsU0FBaUIsNkJBQTZCLEtBQUssVUFBVSxJQUFJLFFBQWlCLENBQUM7QUFDbkYsU0FBUyw0QkFBNEIsS0FBSywyQkFBMkI7QUFFckUsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXFDLENBQUM7QUFDaEcsU0FBUyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFFdkQsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLGlCQUFtQyxDQUFDO0FBQ3pGLFNBQVMsZ0JBQWdCLEtBQUssZUFBZTtBQUU3QyxTQUFpQixvQkFBb0IsS0FBSyxVQUFVLElBQUksaUJBQW1DLENBQUM7QUFDNUYsU0FBUyxtQkFBbUIsS0FBSyxrQkFBa0I7QUFFbkQsU0FBaUIsa0JBQWtCLEtBQUssVUFBVSxJQUFJLFFBQTBCLENBQUM7QUFDakYsU0FBUyxpQkFBaUIsS0FBSyxnQkFBZ0I7QUFFL0MsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQXVELENBQUM7QUFFakgsU0FBaUIsOEJBQThCLEtBQUssVUFBVSxJQUFJLE1BQXFELENBQUM7QUFDeEgsU0FBUyw2QkFBNkIsTUFBTSxJQUFJLEtBQUssbUJBQW1CLE9BQU8sS0FBSyw0QkFBNEIsS0FBSztBQUVySCxTQUFpQixlQUFlLEtBQUssVUFBVSxJQUFJLE1BQVksQ0FBQztBQUNoRSxTQUFTLGNBQWMsTUFBTSxJQUFJLEtBQUssbUJBQW1CLE9BQU8sS0FBSyxhQUFhLEtBQUs7QUFFdkYsU0FBaUIsZ0NBQWdDLEtBQUssVUFBVSxJQUFJLFFBQXVDLENBQUM7QUFDNUcsU0FBUywrQkFBK0IsS0FBSyw4QkFBOEI7QUFFM0UsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNwRSxTQUFTLGdCQUFnQixLQUFLLGVBQWU7QUFJN0M7QUFBQSxTQUFpQixtQkFBbUIsS0FBSyxXQUFXLGFBQWEsV0FBVyxjQUFjLElBQUk7QUFDOUYsU0FBaUIsaUJBQWlCLEtBQUssV0FBVyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBRTdGLFNBQWlCLGFBQWEsb0JBQUksSUFBdUM7QUFDekUsU0FBUSx5QkFBNEMsQ0FBQztBQUVyRCxTQUFtQixZQUFZLEVBQUUsVUFBVTtBQVEzQyxTQUFpQix3QkFBd0IsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDN0UsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLGVBQWlDLENBQUM7QUFvRHZGLFNBQVEsc0JBQXlELENBQUM7QUFlbEUsU0FBUSxNQUFNO0FBQ2QsU0FBUSxPQUFPO0FBSWYsU0FBUSxxQkFBcUI7QUFxQzdCLFNBQVMsWUFBOEI7QUFBQSxNQUN0QyxZQUFZLE9BQU8sUUFBUSxZQUFZO0FBQ3RDLGNBQU0sa0JBQWtCLEtBQUssMkJBQTJCLGVBQWUsY0FBWSxVQUFVLFVBQVUsRUFBRSxRQUFRLFFBQVEsR0FBRyxVQUFVLENBQUM7QUFDdkksWUFBSTtBQUNKLFlBQUksMkJBQTJCLFNBQVM7QUFDdkMsVUFBQyxDQUFDLEtBQUssSUFBSSxNQUFNO0FBQUEsUUFDbEIsT0FBTztBQUNOLFVBQUMsQ0FBQyxLQUFLLElBQUk7QUFBQSxRQUNaO0FBQ0EsZUFBTyxNQUFNLFdBQVcsUUFBUSxPQUFPO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBY0EsU0FBUSxXQUFXO0FBR25CLFNBQWlCLG1CQUFtQixJQUFJLGdCQUFzQjtBQUM5RCxTQUFTLFlBQVksS0FBSyxpQkFBaUI7QUFFM0MsU0FBaUIsc0JBQXNCLElBQUksZ0JBQXNCO0FBQ2pFLFNBQVMsZUFBZSxLQUFLLG9CQUFvQjtBQU1qRCxTQUFRLG9CQUFvQjtBQXd0QjVCLFNBQVMsV0FBMkIsZUFBZTtBQTExQmxELFNBQUssMEJBQTBCLEtBQUssVUFBVSxLQUFLLGtCQUFrQixhQUFhLEtBQUssU0FBUyxDQUFDO0FBQ2pHLFNBQUssNkJBQTZCLEtBQUssVUFBVSxLQUFLLHFCQUFxQixZQUFZLElBQUk7QUFBQSxNQUMxRixDQUFDLG9CQUFvQixLQUFLLHVCQUF1QjtBQUFBLElBQ2xELENBQUMsQ0FBQztBQUVGLFNBQUssZUFBZSxxQkFBcUIsS0FBSyxzQkFBc0IsS0FBSyxZQUFZO0FBRXJGLFNBQUssa0JBQWtCO0FBQUEsRUFDeEI7QUFBQSxFQUVRLG9CQUEwQjtBQUNqQyxTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE9BQUssS0FBSyx1QkFBdUIsQ0FBQyxDQUFDLENBQUM7QUFDdEcsU0FBSyxVQUFVLEtBQUssYUFBYSx5QkFBeUIsTUFBTSxLQUFLLHlCQUF5QixDQUFDLENBQUM7QUFDaEcsU0FBSyxVQUFVLEtBQUssd0JBQXdCLGFBQWEsV0FBVyxLQUFLLE1BQU0sRUFBRSxPQUFLLEtBQUssd0JBQXdCLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDdkg7QUFBQSxFQUVRLHVCQUF1QixPQUF3QztBQUN0RSxRQUFJLHlCQUF5QixLQUFLLEdBQUc7QUFDcEMsV0FBSyx5QkFBeUI7QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUFpQztBQUN4QyxVQUFNLGlCQUFpQixLQUFLO0FBQzVCLFVBQU0saUJBQWlCLHFCQUFxQixLQUFLLHNCQUFzQixLQUFLLFlBQVk7QUFFeEYsZUFBVyx1QkFBdUIsS0FBSyxxQkFBcUI7QUFDM0QsYUFBTyxPQUFPLGdCQUFnQixtQkFBbUI7QUFBQSxJQUNsRDtBQUVBLFNBQUssZUFBZTtBQUVwQixTQUFLLDhCQUE4QixLQUFLLEVBQUUsZ0JBQWdCLGVBQWUsQ0FBQztBQUFBLEVBQzNFO0FBQUEsRUFLQSxJQUFJLGNBQWtDO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBYztBQUFBLEVBRWxFLG1CQUFtQixTQUF1RDtBQUN6RSxTQUFLLG9CQUFvQixLQUFLLE9BQU87QUFDckMsU0FBSyx5QkFBeUI7QUFFOUIsV0FBTyxhQUFhLE1BQU07QUFDekIsV0FBSyxvQkFBb0IsT0FBTyxLQUFLLG9CQUFvQixRQUFRLE9BQU8sR0FBRyxDQUFDO0FBQzVFLFdBQUsseUJBQXlCO0FBQUEsSUFDL0IsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUtBLElBQUksbUJBQThCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBbUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFZbkUscUJBQXFCLE9BQXFCO0FBQ3pDLFNBQUsscUJBQXFCLEtBQUssSUFBSSxHQUFHLEtBQUssTUFBTSxLQUFLLENBQUM7QUFDdkQsU0FBSyx1QkFBdUI7QUFBQSxFQUM3QjtBQUFBLEVBRVEseUJBQStCO0FBQ3RDLFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckI7QUFBQSxJQUNEO0FBRUEsZUFBVyxTQUFTLEtBQUssV0FBVyxPQUFPLEdBQUc7QUFDN0MsVUFBSSxFQUFFLGlCQUFpQixrQkFBa0I7QUFDeEM7QUFBQSxNQUNEO0FBSUEsWUFBTSxjQUFjLEtBQUsscUJBQXFCLEtBQUssS0FBSyxXQUFXLGlCQUFpQixPQUFPLFVBQVUsS0FBSyxFQUFFLFdBQVc7QUFDdkgsWUFBTSxxQkFBcUIsY0FBYyxLQUFLLHFCQUFxQixDQUFDO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQUEsRUFHQSxJQUFJLGNBQWdDO0FBQ25DLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQWVBLElBQUksU0FBNkI7QUFDaEMsV0FBTyxNQUFNLEtBQUssS0FBSyxXQUFXLE9BQU8sQ0FBQztBQUFBLEVBQzNDO0FBQUEsRUFFQSxJQUFJLFFBQWdCO0FBQ25CLFdBQU8sS0FBSyxXQUFXO0FBQUEsRUFDeEI7QUFBQSxFQUVBLElBQUksY0FBZ0M7QUFDbkMsV0FBUSxLQUFLLGNBQWMsS0FBSyxXQUFXLGdCQUFnQixZQUFZLFdBQVksaUJBQWlCLFdBQVcsaUJBQWlCO0FBQUEsRUFDakk7QUFBQSxFQUdBLElBQUksVUFBbUI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFVO0FBQUEsRUFRL0MsSUFBSSxxQkFBOEI7QUFDakMsV0FBTyxDQUFDLENBQUMsS0FBSyxpQkFBaUIsV0FBVyxnQ0FBZ0M7QUFBQSxFQUMzRTtBQUFBLEVBR0EsSUFBSSxtQkFBNEI7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFtQjtBQUFBLEVBRWpFLFVBQVUsUUFBUSxZQUFZLGVBQW1DO0FBQ2hFLFlBQVEsT0FBTztBQUFBLE1BQ2QsS0FBSyxZQUFZO0FBQ2hCLGVBQU8sS0FBSztBQUFBLE1BRWIsS0FBSyxZQUFZLHNCQUFzQjtBQUN0QyxjQUFNLG1CQUFtQixTQUFTLEtBQUssdUJBQXVCLElBQUksYUFBVyxLQUFLLFNBQVMsT0FBTyxDQUFDLENBQUM7QUFJcEcsZUFBTyxTQUFTLENBQUMsR0FBRyxrQkFBa0IsR0FBRyxLQUFLLE1BQU0sQ0FBQztBQUFBLE1BQ3REO0FBQUEsTUFDQSxLQUFLLFlBQVksaUJBQWlCO0FBQ2pDLGNBQU0sUUFBNEIsQ0FBQztBQUNuQyxZQUFJLEtBQUssWUFBWTtBQUNwQixlQUFLLGNBQWMsT0FBTyxLQUFLLFdBQVcsU0FBUyxDQUFDO0FBQUEsUUFDckQ7QUFFQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFFBQTRCLE1BQTJFO0FBQzVILFFBQUksaUJBQWlCLElBQUksR0FBRztBQUMzQixXQUFLLFNBQVMsUUFBUSxXQUFTLEtBQUssY0FBYyxRQUFRLEtBQUssQ0FBQztBQUFBLElBQ2pFLE9BQU87QUFDTixhQUFPLEtBQUssS0FBSyxJQUFJO0FBQUEsSUFDdEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxTQUFTLFlBQXNDO0FBQzlDLFdBQU8sS0FBSyxXQUFXLElBQUksVUFBVTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxTQUFTLFlBQTJEO0FBQ25FLFdBQU8sS0FBSyxXQUFXLElBQUksVUFBVTtBQUFBLEVBQ3RDO0FBQUEsRUFFQSxVQUFVLE9BQXdCLFNBQTZDLEtBQUssYUFBYSxNQUE4QztBQUc5SSxRQUFJLE9BQU8sTUFBTSxjQUFjLFVBQVU7QUFDeEMsYUFBTyxLQUFLLHVCQUF1QixNQUFNLFdBQVcsUUFBUSxJQUFJO0FBQUEsSUFDakU7QUFHQSxRQUFJLE9BQU8sTUFBTSxhQUFhLFVBQVU7QUFDdkMsYUFBTyxLQUFLLHNCQUFzQixNQUFNLFVBQVUsUUFBUSxJQUFJO0FBQUEsSUFDL0Q7QUFFQSxVQUFNLElBQUksTUFBTSxtQkFBbUI7QUFBQSxFQUNwQztBQUFBLEVBRVEsdUJBQXVCLFdBQTJCLFFBQTRDLE1BQThDO0FBQ25KLFVBQU0sa0JBQWtCLEtBQUssZ0JBQWdCLE1BQU07QUFHbkQsVUFBTSxhQUFhLEtBQUssV0FBVyxpQkFBaUIsaUJBQWlCLEtBQUssb0JBQW9CLFNBQVMsR0FBRyxJQUFJO0FBQzlHLGVBQVcsTUFBTSxDQUFDLElBQUksT0FBTyxLQUFLLHVCQUF1QixRQUFRLEdBQUcsRUFBRSxJQUFJLEtBQUssdUJBQXVCLFFBQVEsR0FBRyxFQUFFLEVBQUU7QUFFckgsV0FBTyxXQUFXLENBQUM7QUFBQSxFQUNwQjtBQUFBLEVBRVEsc0JBQXNCLFVBQXlCLFFBQTRDLE1BQThDO0FBQ2hKLFVBQU0sa0JBQWtCLEtBQUssZ0JBQWdCLE1BQU07QUFDbkQsVUFBTSxTQUFTLEtBQUssVUFBVSxZQUFZLGVBQWU7QUFDekQsVUFBTSxRQUFRLE9BQU8sUUFBUSxlQUFlO0FBRTVDLFlBQVEsVUFBVTtBQUFBLE1BQ2pCLEtBQUssY0FBYztBQUNsQixlQUFPLE9BQU8sQ0FBQztBQUFBLE1BQ2hCLEtBQUssY0FBYztBQUNsQixlQUFPLE9BQU8sT0FBTyxTQUFTLENBQUM7QUFBQSxNQUNoQyxLQUFLLGNBQWMsTUFBTTtBQUN4QixZQUFJLFlBQTBDLE9BQU8sUUFBUSxDQUFDO0FBQzlELFlBQUksQ0FBQyxhQUFhLE1BQU07QUFDdkIsc0JBQVksS0FBSyxzQkFBc0IsY0FBYyxPQUFPLE1BQU07QUFBQSxRQUNuRTtBQUVBLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDQSxLQUFLLGNBQWMsVUFBVTtBQUM1QixZQUFJLGdCQUE4QyxPQUFPLFFBQVEsQ0FBQztBQUNsRSxZQUFJLENBQUMsaUJBQWlCLE1BQU07QUFDM0IsMEJBQWdCLEtBQUssc0JBQXNCLGNBQWMsTUFBTSxNQUFNO0FBQUEsUUFDdEU7QUFFQSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUFjLE9BQTJDLHFCQUErQixRQUFrRDtBQUN6SSxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUM1QyxTQUFLLGlCQUFpQixXQUFXLE1BQU07QUFHdkMsUUFBSSxDQUFDLHFCQUFxQjtBQUN6QixXQUFLLFlBQVksUUFBUSxVQUFVLEtBQUssT0FBTyxDQUFDO0FBQUEsSUFDakQ7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsYUFBYSxPQUE2RDtBQUN6RSxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUM1QyxTQUFLLGVBQWUsU0FBUztBQUU3QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsUUFBUSxPQUE4RTtBQUNyRixVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUU1QyxXQUFPLEtBQUssV0FBVyxZQUFZLFNBQVM7QUFBQSxFQUM3QztBQUFBLEVBRUEsUUFBUSxPQUEyQyxNQUErQztBQUNqRyxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUU1QyxTQUFLLFdBQVcsV0FBVyxXQUFXLElBQUk7QUFBQSxFQUMzQztBQUFBLEVBRUEsY0FBYyxhQUFnQyxTQUE2QyxLQUFLLGFBQW1CO0FBQ2xILFFBQUksS0FBSyxRQUFRLEdBQUc7QUFDbkI7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsTUFBTTtBQUU3QyxZQUFRLGFBQWE7QUFBQSxNQUNwQixLQUFLLGtCQUFrQjtBQUN0QixhQUFLLFdBQVcsb0JBQW9CO0FBQ3BDO0FBQUEsTUFDRCxLQUFLLGtCQUFrQjtBQUN0QixZQUFJLEtBQUssT0FBTyxTQUFTLEdBQUc7QUFDM0I7QUFBQSxRQUNEO0FBQ0EsYUFBSyxXQUFXLGFBQWEsU0FBUztBQUN0QyxrQkFBVSxNQUFNO0FBQ2hCO0FBQUEsTUFDRCxLQUFLLGtCQUFrQjtBQUN0QixhQUFLLFdBQVcsV0FBVyxTQUFTO0FBQ3BDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLG9CQUFvQixTQUE2QyxLQUFLLGFBQW1CO0FBQ3hGLFFBQUksS0FBSyxrQkFBa0IsR0FBRztBQUM3QixXQUFLLGdCQUFnQjtBQUFBLElBQ3RCLE9BQU87QUFDTixXQUFLLGNBQWMsa0JBQWtCLFVBQVUsTUFBTTtBQUFBLElBQ3REO0FBQUEsRUFDRDtBQUFBLEVBRUEsa0JBQWtCLFNBQTZDLEtBQUssYUFBbUI7QUFDdEYsUUFBSSxLQUFLLGdCQUFnQixLQUFLLFdBQVcsR0FBRztBQUMzQyxXQUFLLGNBQWMsa0JBQWtCLElBQUk7QUFBQSxJQUMxQyxPQUFPO0FBQ04sV0FBSyxjQUFjLGtCQUFrQixRQUFRLE1BQU07QUFBQSxJQUNwRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUF3QjtBQUMvQixTQUFLLFdBQVcsa0JBQWtCO0FBQ2xDLFNBQUssYUFBYSxNQUFNO0FBQUEsRUFDekI7QUFBQSxFQUVBLG9CQUE2QjtBQUM1QixXQUFPLEtBQUssV0FBVyxpQkFBaUI7QUFBQSxFQUN6QztBQUFBLEVBRVEsaUJBQWlCLGFBQXdDO0FBQ2hFLFdBQU8sS0FBSyxXQUFXLGdCQUFnQixXQUFXO0FBQUEsRUFDbkQ7QUFBQSxFQUVBLGdCQUFnQixhQUF3QztBQUN2RCxXQUFPLEtBQUssV0FBVyxlQUFlLFdBQVc7QUFBQSxFQUNsRDtBQUFBLEVBRUEsb0JBQW9CLGFBQXFDO0FBQ3hELFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckI7QUFBQSxJQUNEO0FBRUEsVUFBTSxpQkFBa0IsZ0JBQWdCLGlCQUFpQixhQUFjLFlBQVksYUFBYSxZQUFZO0FBQzVHLFFBQUksS0FBSyxXQUFXLGdCQUFnQixnQkFBZ0I7QUFDbkQsV0FBSyxXQUFXLGNBQWM7QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFlBQVksUUFBaUM7QUFDNUMsVUFBTSxlQUFlLEtBQUssbUJBQW1CLEtBQUssU0FBUztBQUczRCxRQUFJLG9CQUFvQjtBQUN4QixhQUFTLFlBQVksUUFBcUM7QUFDekQsaUJBQVcsU0FBUyxRQUFRO0FBQzNCLFlBQUksTUFBTSxRQUFRLE1BQU0sTUFBTSxHQUFHO0FBQ2hDLHNCQUFZLE1BQU0sTUFBTTtBQUFBLFFBQ3pCLE9BQU87QUFDTjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLGdCQUFZLE9BQU8sTUFBTTtBQUd6QixRQUFJLG9CQUFvQixLQUFLLFVBQVUsWUFBWSxlQUFlO0FBQ2xFLFFBQUksb0JBQW9CLGtCQUFrQixRQUFRO0FBQ2pELFlBQU0sb0JBQW9CLGtCQUFrQixvQkFBb0IsQ0FBQztBQUNqRSx3QkFBa0IsUUFBUSxDQUFDLE9BQU8sVUFBVTtBQUMzQyxZQUFJLFNBQVMsbUJBQW1CO0FBQy9CLGVBQUssV0FBVyxPQUFPLGlCQUFpQjtBQUFBLFFBQ3pDO0FBQUEsTUFDRCxDQUFDO0FBRUQsMEJBQW9CLEtBQUssVUFBVSxZQUFZLGVBQWU7QUFBQSxJQUMvRDtBQUVBLFVBQU0sY0FBYyxLQUFLO0FBR3pCLFVBQU0saUJBQWlCLHFCQUFxQjtBQUFBLE1BQzNDLGFBQWEsS0FBSztBQUFBLFFBQ2pCLE9BQU87QUFBQSxRQUNQLEtBQUsscUJBQXFCLElBQ3pCLEtBQUssV0FBVztBQUFBO0FBQUEsVUFDaEIsV0FBVyxLQUFLLFdBQVcsV0FBVztBQUFBO0FBQUE7QUFBQSxNQUN4QztBQUFBLE1BQ0EsUUFBUSxPQUFPO0FBQUEsSUFDaEIsQ0FBQztBQUdELFNBQUssaUJBQWlCLGdCQUFnQixZQUFZLElBQUksaUJBQWlCO0FBR3ZFLFFBQUksY0FBYztBQUNqQixXQUFLLGFBQWEsTUFBTTtBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsWUFBK0I7QUFLOUIsVUFBTSxpQkFBaUIsS0FBSyxXQUFXLFVBQVU7QUFDakQsVUFBTSxjQUFjLGVBQWUsZ0JBQWdCLFlBQVksYUFBYSxpQkFBaUIsYUFBYSxpQkFBaUI7QUFDM0gsVUFBTSxPQUFPLEtBQUssb0NBQW9DLGVBQWUsSUFBSTtBQUV6RSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsUUFBUSxLQUFLO0FBQUEsSUFDZDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9DQUFvQyxnQkFBc0Q7QUFDakcsUUFBSSxlQUFlLFNBQVMsVUFBVTtBQUNyQyxhQUFPO0FBQUEsUUFDTixNQUFNLGVBQWU7QUFBQSxRQUNyQixRQUFRLGVBQWUsS0FBSyxJQUFJLFVBQVEsS0FBSyxvQ0FBb0MsSUFBSSxDQUFDO0FBQUEsTUFDdkY7QUFBQSxJQUNEO0FBRUEsV0FBTyxFQUFFLE1BQU0sZUFBZSxLQUFLO0FBQUEsRUFDcEM7QUFBQSxFQUVVLG1CQUFtQixRQUFzQztBQUNsRSxRQUFJLENBQUMsUUFBUTtBQUNaLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxnQkFBZ0IsaUJBQWlCO0FBQ3ZDLFFBQUksa0JBQWtCLE9BQU8sY0FBYyxNQUFNO0FBQ2hELGFBQU87QUFBQSxJQUNSO0FBR0EsV0FBTywwQkFBMEIsTUFBTTtBQUFBLEVBQ3hDO0FBQUEsRUFFUSx1QkFBZ0M7QUFDdkMsVUFBTSxRQUFRLEtBQUssV0FBVyxTQUFTO0FBQ3ZDLFFBQUksaUJBQWlCLEtBQUssR0FBRztBQUc1QixhQUFPLE1BQU0sU0FBUyxLQUFLLFdBQVMsaUJBQWlCLEtBQUssQ0FBQztBQUFBLElBQzVEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFNBQVMsVUFBOEMsV0FBMkIsYUFBa0Q7QUFDbkksVUFBTSxlQUFlLEtBQUssZ0JBQWdCLFFBQVE7QUFFbEQsUUFBSTtBQUdKLFFBQUksYUFBYSxlQUFlLE1BQU07QUFDckMsWUFBTSxlQUFlLEtBQUssbUJBQW1CLGFBQWEsT0FBTztBQUVqRSxZQUFNLGVBQWUsS0FBSyxXQUFXLE9BQU8sS0FBSyxLQUFLLGdCQUFnQixZQUFZO0FBQ2xGLHFCQUFlLEtBQUssa0JBQWtCLFdBQVc7QUFHakQsV0FBSyxXQUFXO0FBQUEsUUFDZjtBQUFBLFFBQ0EsS0FBSyxvQkFBb0I7QUFBQSxRQUN6QjtBQUFBLFFBQ0EsS0FBSyxvQkFBb0IsU0FBUztBQUFBLE1BQ25DO0FBR0EsV0FBSyxnQkFBZ0I7QUFHckIsV0FBSyxlQUFlLEtBQUssWUFBWTtBQUdyQyxXQUFLLHVCQUF1QjtBQUc1QixVQUFJLGNBQWM7QUFDakIsYUFBSyxjQUFjLGtCQUFrQixRQUFRLFlBQVk7QUFBQSxNQUMxRDtBQUtBLFVBQUksY0FBYztBQUNqQixxQkFBYSxNQUFNO0FBQUEsTUFDcEI7QUFBQSxJQUNELE9BR0s7QUFDSixxQkFBZSxhQUFhLFdBQVcsU0FBUyxjQUFjLFdBQVcsV0FBVztBQUFBLElBQ3JGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHNCQUE4QjtBQUNyQyxZQUFRLEtBQUssYUFBYSxhQUFhO0FBQUEsTUFDdEMsS0FBSztBQUNKLGVBQU8sT0FBTztBQUFBLE1BQ2YsS0FBSztBQUNKLGVBQU8sT0FBTztBQUFBLE1BQ2Y7QUFDQyxlQUFPLE9BQU87QUFBQSxJQUNoQjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVUsc0JBQTJEO0FBQ3BFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxrQkFBa0IsTUFBOEQsU0FBcUQ7QUFFNUksVUFBTSxrQkFBdUQsRUFBRSxHQUFHLEtBQUssb0JBQW9CLEdBQUcsR0FBRyxRQUFRO0FBR3pHLFFBQUk7QUFDSixRQUFJLGdCQUFnQixpQkFBaUI7QUFDcEMsa0JBQVksZ0JBQWdCLFdBQVcsTUFBTSxLQUFLLGlCQUFpQixNQUFNLEtBQUssYUFBYSxLQUFLLE9BQU8sS0FBSyw0QkFBNEIsZUFBZTtBQUFBLElBQ3hKLFdBQVcsNkJBQTZCLElBQUksR0FBRztBQUM5QyxrQkFBWSxnQkFBZ0IscUJBQXFCLE1BQU0sS0FBSyxpQkFBaUIsTUFBTSxLQUFLLGFBQWEsS0FBSyxPQUFPLEtBQUssNEJBQTRCLGVBQWU7QUFBQSxJQUNsSyxPQUFPO0FBQ04sa0JBQVksZ0JBQWdCLFVBQVUsS0FBSyxpQkFBaUIsTUFBTSxLQUFLLGFBQWEsS0FBSyxPQUFPLEtBQUssNEJBQTRCLGVBQWU7QUFBQSxJQUNqSjtBQUdBLFNBQUssV0FBVyxJQUFJLFVBQVUsSUFBSSxTQUFTO0FBRzNDLFVBQU0sbUJBQW1CLElBQUksZ0JBQWdCO0FBQzdDLHFCQUFpQixJQUFJLFVBQVUsV0FBVyxNQUFNO0FBQy9DLFdBQUssaUJBQWlCLFNBQVM7QUFFL0IsV0FBSyxZQUFZLEtBQUs7QUFBQSxJQUN2QixDQUFDLENBQUM7QUFHRixxQkFBaUIsSUFBSSxVQUFVLGlCQUFpQixPQUFLO0FBQ3BELGNBQVEsRUFBRSxNQUFNO0FBQUEsUUFDZixLQUFLLHFCQUFxQjtBQUN6QixlQUFLLHdCQUF3QixLQUFLLFNBQVM7QUFDM0M7QUFBQSxRQUNELEtBQUsscUJBQXFCO0FBQ3pCLGVBQUssdUJBQXVCLEtBQUssU0FBUztBQUMxQztBQUFBLFFBQ0QsS0FBSyxxQkFBcUI7QUFDekIsZUFBSyx1QkFBdUIsS0FBSyxTQUFTO0FBQzFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBR0YscUJBQWlCLElBQUksVUFBVSx3QkFBd0IsTUFBTTtBQUM1RCxXQUFLLGdCQUFnQjtBQUFBLElBQ3RCLENBQUMsQ0FBQztBQUdGLFVBQU0sS0FBSyxVQUFVLGFBQWEsRUFBRSxNQUFNO0FBQ3pDLGNBQVEsZ0JBQWdCO0FBQ3hCLFdBQUssV0FBVyxPQUFPLFVBQVUsRUFBRTtBQUNuQyxXQUFLLHlCQUF5QixTQUFTO0FBQUEsSUFDeEMsQ0FBQztBQUVELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxpQkFBaUIsT0FBeUIsU0FBUyxzQkFBc0IsU0FBZTtBQUMvRixRQUFJLEtBQUssaUJBQWlCLE9BQU87QUFDaEMsWUFBTSxzQkFBc0IsS0FBSztBQUNqQyxXQUFLLGVBQWU7QUFHcEIsV0FBSyx5QkFBeUIsT0FBTyxJQUFJO0FBR3pDLFVBQUksdUJBQXVCLENBQUMsb0JBQW9CLFVBQVU7QUFDekQsNEJBQW9CLFVBQVUsS0FBSztBQUFBLE1BQ3BDO0FBR0EsWUFBTSxVQUFVLElBQUk7QUFHcEIsV0FBSyxlQUFlLEtBQUs7QUFHekIsV0FBSyx3QkFBd0IsS0FBSyxLQUFLO0FBQUEsSUFDeEM7QUFLQSxTQUFLLG9CQUFvQixLQUFLLEVBQUUsT0FBTyxPQUFPLENBQUM7QUFBQSxFQUNoRDtBQUFBLEVBRVEsZUFBZSxPQUErQjtBQUNyRCxRQUFJLENBQUMsS0FBSyxZQUFZO0FBQ3JCO0FBQUEsSUFDRDtBQUVBLFFBQUk7QUFDSCxVQUFJLEtBQUssa0JBQWtCLEtBQUssQ0FBQyxLQUFLLGlCQUFpQixLQUFLLEdBQUc7QUFDOUQsYUFBSyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUVBLFlBQU0sV0FBVyxLQUFLLFdBQVcsWUFBWSxLQUFLO0FBQ2xELFVBQUksU0FBUyxVQUFVLE1BQU0sZ0JBQWdCLFNBQVMsV0FBVyxNQUFNLGVBQWU7QUFDckYsYUFBSyxjQUFjLGtCQUFrQixRQUFRLEtBQUs7QUFBQSxNQUNuRDtBQUFBLElBQ0QsU0FBUyxPQUFPO0FBQUEsSUFFaEI7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBeUIsT0FBeUIsd0JBQXdDO0FBQ2pHLFVBQU0sUUFBUSxLQUFLLHVCQUF1QixRQUFRLE1BQU0sRUFBRTtBQUcxRCxRQUFJLFVBQVUsSUFBSTtBQUNqQixXQUFLLHVCQUF1QixPQUFPLE9BQU8sQ0FBQztBQUFBLElBQzVDO0FBR0EsUUFBSSx3QkFBd0I7QUFDM0IsV0FBSyx1QkFBdUIsUUFBUSxNQUFNLEVBQUU7QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUFvQixXQUFzQztBQUNqRSxZQUFRLFdBQVc7QUFBQSxNQUNsQixLQUFLLGVBQWU7QUFBSSxlQUFPLFVBQVU7QUFBQSxNQUN6QyxLQUFLLGVBQWU7QUFBTSxlQUFPLFVBQVU7QUFBQSxNQUMzQyxLQUFLLGVBQWU7QUFBTSxlQUFPLFVBQVU7QUFBQSxNQUMzQyxLQUFLLGVBQWU7QUFBTyxlQUFPLFVBQVU7QUFBQSxJQUM3QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixhQUErQixVQUFvQztBQUNoRyxRQUFJLE9BQU8sZ0JBQWdCLFVBQVU7QUFDcEMsYUFBTyxnQkFBZ0IsaUJBQWlCLGFBQWEsWUFBWSxhQUFhLFlBQVk7QUFBQSxJQUMzRjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxZQUFZLE9BQTJDLGVBQStCO0FBQ3JGLFVBQU0sWUFBWSxLQUFLLGdCQUFnQixLQUFLO0FBQzVDLFFBQUksS0FBSyxVQUFVLEdBQUc7QUFDckI7QUFBQSxJQUNEO0FBR0EsUUFBSSxVQUFVLFNBQVM7QUFDdEIsV0FBSyxtQkFBbUIsV0FBVyxhQUFhO0FBQUEsSUFDakQsT0FHSztBQUNKLFdBQUsseUJBQXlCLFNBQVM7QUFBQSxJQUN4QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixXQUFtQztBQUNuRSxVQUFNLDJCQUEyQixLQUFLLFVBQVUsWUFBWSxvQkFBb0I7QUFFaEYsUUFBSTtBQUNKLFFBQUksS0FBSyxpQkFBaUIsV0FBVztBQUNwQyx3QkFBa0IseUJBQXlCLENBQUM7QUFBQSxJQUM3QyxPQUFPO0FBQ04sd0JBQWtCLHlCQUF5QixDQUFDO0FBQUEsSUFDN0M7QUFJQSxTQUFLLFdBQVcsV0FBVyxlQUFlO0FBQUEsRUFDM0M7QUFBQSxFQUVRLG1CQUFtQixXQUE2QixlQUErQjtBQUN0RixVQUFNLGVBQWUsQ0FBQyxpQkFBaUIsS0FBSyxtQkFBbUIsS0FBSyxTQUFTO0FBRzdFLFFBQUksS0FBSyxpQkFBaUIsV0FBVztBQUNwQyxZQUFNLDJCQUEyQixLQUFLLFVBQVUsWUFBWSxvQkFBb0I7QUFDaEYsWUFBTSxrQkFBa0IseUJBQXlCLENBQUM7QUFDbEQsV0FBSyxpQkFBaUIsZUFBZTtBQUFBLElBQ3RDO0FBR0EsU0FBSyxXQUFXLFdBQVcsV0FBVyxLQUFLLG9CQUFvQixDQUFDO0FBQ2hFLGNBQVUsUUFBUTtBQUtsQixRQUFJLGNBQWM7QUFDakIsV0FBSyxhQUFhLE1BQU07QUFBQSxJQUN6QjtBQUdBLFNBQUssdUJBQXVCO0FBRzVCLFNBQUssZ0JBQWdCO0FBR3JCLFNBQUssa0JBQWtCLEtBQUssU0FBUztBQUFBLEVBQ3RDO0FBQUEsRUFFQSxVQUFVLE9BQTJDLFVBQThDLFdBQTZDO0FBQy9JLFVBQU0sYUFBYSxLQUFLLGdCQUFnQixLQUFLO0FBQzdDLFVBQU0sYUFBYSxLQUFLLGdCQUFnQixRQUFRO0FBRWhELFFBQUksV0FBVyxPQUFPLFdBQVcsSUFBSTtBQUNwQyxZQUFNLElBQUksTUFBTSxnQ0FBZ0M7QUFBQSxJQUNqRDtBQUVBLFVBQU0sZUFBZSxLQUFLLG1CQUFtQixXQUFXLE9BQU87QUFDL0QsUUFBSTtBQUdKLFFBQUksV0FBVyxlQUFlLFdBQVcsWUFBWTtBQUNwRCxXQUFLLFdBQVcsU0FBUyxZQUFZLEtBQUssb0JBQW9CLEdBQUcsWUFBWSxLQUFLLG9CQUFvQixTQUFTLENBQUM7QUFDaEgsa0JBQVk7QUFBQSxJQUNiLE9BR0s7QUFDSixrQkFBWSxXQUFXLFdBQVcsU0FBUyxZQUFZLFdBQVcsVUFBVTtBQUM1RSxpQkFBVyxnQkFBZ0I7QUFDM0IsV0FBSyxZQUFZLFlBQVksWUFBWTtBQUFBLElBQzFDO0FBS0EsUUFBSSxjQUFjO0FBQ2pCLGdCQUFVLE1BQU07QUFBQSxJQUNqQjtBQUdBLFNBQUssZ0JBQWdCLEtBQUssU0FBUztBQUduQyxTQUFLLHVCQUF1QjtBQUU1QixXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsVUFBVSxPQUEyQyxVQUE4QyxXQUE2QztBQUMvSSxVQUFNLFlBQVksS0FBSyxnQkFBZ0IsS0FBSztBQUM1QyxVQUFNLGVBQWUsS0FBSyxnQkFBZ0IsUUFBUTtBQUVsRCxVQUFNLGVBQWUsS0FBSyxtQkFBbUIsVUFBVSxPQUFPO0FBRzlELFVBQU0sa0JBQWtCLEtBQUssU0FBUyxjQUFjLFdBQVcsU0FBUztBQUd4RSxRQUFJLGNBQWM7QUFDakIsc0JBQWdCLE1BQU07QUFBQSxJQUN2QjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxXQUFXLE9BQTJDLFFBQTRDLFNBQXVDO0FBQ3hJLFVBQU0sYUFBYSxLQUFLLGdCQUFnQixLQUFLO0FBQzdDLFVBQU0sYUFBYSxLQUFLLGdCQUFnQixNQUFNO0FBRzlDLFVBQU0sVUFBb0MsQ0FBQztBQUMzQyxRQUFJLFFBQVMsV0FBVyxPQUFPLFFBQVEsVUFBVSxXQUFZLFFBQVEsUUFBUSxXQUFXO0FBQ3hGLGVBQVcsVUFBVSxXQUFXLFNBQVM7QUFDeEMsWUFBTSxXQUFXLENBQUMsV0FBVyxTQUFTLE1BQU0sS0FBSyxLQUFLLGlCQUFpQjtBQUV2RSxVQUFJO0FBQ0osVUFBSSxXQUFXLFNBQVMsTUFBTTtBQUFBO0FBQUE7QUFBQTtBQUFBLE9BTTVCLFdBQVcsU0FBUyxNQUFNO0FBQUEsTUFFMUIsU0FBUyx3QkFFVDtBQUFBLE1BRUYsT0FBTztBQUNOLHNCQUFjO0FBQ2Q7QUFBQSxNQUNEO0FBRUEsY0FBUSxLQUFLO0FBQUEsUUFDWjtBQUFBLFFBQ0EsU0FBUztBQUFBLFVBQ1IsT0FBTztBQUFBLFVBQ1A7QUFBQSxVQUNBLGVBQWU7QUFBQSxRQUNoQjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFHQSxRQUFJLFNBQVM7QUFDYixRQUFJLFNBQVMsU0FBUyxlQUFlLGNBQWM7QUFDbEQsaUJBQVcsWUFBWSxTQUFTLFVBQVU7QUFBQSxJQUMzQyxPQUFPO0FBQ04sZUFBUyxXQUFXLFlBQVksU0FBUyxVQUFVO0FBQUEsSUFDcEQ7QUFHQSxRQUFJLFdBQVcsV0FBVyxDQUFDLFdBQVcsVUFBK0Y7QUFDcEksV0FBSyxZQUFZLFlBQVksSUFBSTtBQUFBLElBQ2xDO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLGVBQWUsUUFBNEMsU0FBdUM7QUFDakcsVUFBTSxhQUFhLEtBQUssZ0JBQWdCLE1BQU07QUFFOUMsUUFBSSxTQUFTO0FBQ2IsZUFBVyxTQUFTLEtBQUssVUFBVSxZQUFZLG9CQUFvQixHQUFHO0FBQ3JFLFVBQUksVUFBVSxZQUFZO0FBQ3pCO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxLQUFLLFdBQVcsT0FBTyxZQUFZLE9BQU87QUFDekQsVUFBSSxDQUFDLFFBQVE7QUFDWixpQkFBUztBQUFBLE1BQ1Y7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVVLGdCQUFnQixPQUE2RDtBQUN0RixRQUFJO0FBQ0osUUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixrQkFBWSxLQUFLLGdCQUFnQixTQUFTLEtBQUs7QUFBQSxJQUNoRCxPQUFPO0FBQ04sa0JBQVk7QUFBQSxJQUNiO0FBRUEsUUFBSSxDQUFDLFdBQVc7QUFDZixZQUFNLElBQUksTUFBTSxnQ0FBZ0M7QUFBQSxJQUNqRDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSx1QkFBdUIsV0FBb0IsVUFBa0Q7QUFDNUYsZUFBVyxjQUFjLFNBQVMsQ0FBQztBQUVuQyxXQUFPLEtBQUssMkJBQTJCLGVBQWUsa0JBQWtCLE1BQU0sV0FBVyxRQUFRO0FBQUEsRUFDbEc7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFJLGVBQXVCO0FBQUUsV0FBTyxLQUFLLElBQUksS0FBSyxxQkFBcUIsY0FBYyxLQUFLLGNBQWMsMkJBQTJCLEtBQUssY0FBYyxhQUFhLFVBQVUsS0FBSyxTQUFTLENBQUMsQ0FBQyxFQUFFLEtBQUs7QUFBQSxFQUFHO0FBQUEsRUFDdk0sSUFBSSxlQUF1QjtBQUFFLFdBQU8sS0FBSyxxQkFBcUI7QUFBQSxFQUFjO0FBQUEsRUFDNUUsSUFBSSxnQkFBd0I7QUFBRSxXQUFPLEtBQUssSUFBSSxLQUFLLHFCQUFxQixlQUFlLEtBQUssY0FBYywyQkFBMkIsS0FBSyxjQUFjLGFBQWEsVUFBVSxLQUFLLFNBQVMsQ0FBQyxDQUFDLEVBQUUsTUFBTTtBQUFBLEVBQUc7QUFBQSxFQUMxTSxJQUFJLGdCQUF3QjtBQUFFLFdBQU8sS0FBSyxxQkFBcUI7QUFBQSxFQUFlO0FBQUEsRUFFOUUsSUFBSSxPQUFnQjtBQUFFLFdBQU8sS0FBSyxjQUFjLGtCQUFrQixNQUFNO0FBQUEsRUFBVTtBQUFBLEVBRWxGLElBQWEsY0FBNEM7QUFBRSxXQUFPLE1BQU0sSUFBSSxLQUFLLHFCQUFxQixhQUFhLEtBQUssbUJBQW1CLEtBQUs7QUFBQSxFQUFHO0FBQUEsRUFHbkosSUFBWSxzQkFBNkI7QUFDeEMsV0FBTyxLQUFLLE1BQU0sU0FBUyxtQkFBbUIsS0FBSyxLQUFLLE1BQU0sU0FBUyxjQUFjLEtBQUssTUFBTTtBQUFBLEVBQ2pHO0FBQUEsRUFFUyxlQUFxQjtBQUM3QixTQUFLLFVBQVUsTUFBTSxrQkFBa0IsS0FBSyxTQUFTLGdCQUFnQixLQUFLO0FBRTFFLFVBQU0sdUJBQXVCLEVBQUUsaUJBQWlCLEtBQUsscUJBQXFCLFlBQVksS0FBSyxNQUFNLFNBQVMsc0JBQXNCLEtBQUssTUFBTSxZQUFZO0FBQ3ZKLFNBQUssV0FBVyxNQUFNLG9CQUFvQjtBQUMxQyxTQUFLLHFCQUFxQixPQUFPLG9CQUFvQjtBQUFBLEVBQ3REO0FBQUEsRUFFbUIsa0JBQWtCLFFBQXFCLFNBQW1EO0FBRzVHLFNBQUssVUFBVTtBQUNmLFFBQUksS0FBSyxhQUFhLFdBQVcsZ0JBQWdCO0FBQ2hELFdBQUssVUFBVSxVQUFVLElBQUksV0FBVztBQUFBLElBQ3pDO0FBQ0EsV0FBTyxZQUFZLEtBQUssU0FBUztBQUdqQyxTQUFLLG9CQUFvQixDQUFDLFdBQVcsUUFBUTtBQUM3QyxTQUFLLG9CQUFvQjtBQUd6QixTQUFLLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxtQkFBbUIsS0FBSyxXQUFXLEtBQUssZ0JBQWdCLEtBQUssZUFBZSxXQUFXLHFDQUFxQyxHQUFHLEtBQUssYUFBYSx3QkFBd0IsQ0FBQztBQUN6TixTQUFLLFVBQVUsS0FBSyw2QkFBNkIsT0FBSyxLQUFLLHFCQUFxQixjQUFjLEVBQUUsZUFBZSw0QkFBNEIsS0FBSyxDQUFDLENBQUM7QUFHbEosU0FBSyx3QkFBd0IsUUFBUSxLQUFLLFNBQVM7QUFHbkQsU0FBSyxrQkFBa0I7QUFHdkIsU0FBSyxpQkFBaUIsU0FBUztBQUMvQixTQUFLLFdBQVc7QUFHaEIsYUFBUyxRQUFRLEtBQUssT0FBTyxJQUFJLFdBQVMsTUFBTSxZQUFZLENBQUMsRUFBRSxRQUFRLE1BQU07QUFDNUUsV0FBSyxvQkFBb0IsU0FBUztBQUFBLElBQ25DLENBQUM7QUFFRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFVSxvQkFBMEI7QUFLbkMsMkJBQXVCLE9BQU8sS0FBSyx1QkFBdUIsRUFBRSxJQUFJLElBQUk7QUFFcEUsVUFBTSw4QkFBOEIsc0NBQXNDLE9BQU8sS0FBSyx1QkFBdUI7QUFDN0csVUFBTSw4QkFBOEIsc0NBQXNDLE9BQU8sS0FBSyx1QkFBdUI7QUFDN0csVUFBTSwyQkFBMkIseUJBQXlCLE9BQU8sS0FBSyx1QkFBdUI7QUFFN0YsVUFBTSxvQkFBb0IsTUFBTTtBQUMvQixZQUFNLGFBQWEsS0FBSztBQUN4QixVQUFJLGFBQWEsR0FBRztBQUNuQixvQ0FBNEIsSUFBSSxJQUFJO0FBQUEsTUFDckMsT0FBTztBQUNOLG9DQUE0QixNQUFNO0FBQUEsTUFDbkM7QUFFQSxVQUFJLEtBQUssa0JBQWtCLEdBQUc7QUFDN0Isb0NBQTRCLElBQUksSUFBSTtBQUFBLE1BQ3JDLE9BQU87QUFDTixvQ0FBNEIsTUFBTTtBQUFBLE1BQ25DO0FBQUEsSUFDRDtBQUVBLFVBQU0saUNBQWlDLE1BQU07QUFDNUMsK0JBQXlCLElBQUksS0FBSyxZQUFZLGFBQWEsVUFBVTtBQUFBLElBQ3RFO0FBRUEsVUFBTSxnQ0FBZ0MsTUFBTTtBQUMzQyxVQUFJLENBQUMsS0FBSyxjQUFjLENBQUMsS0FBSyxtQkFBbUI7QUFDaEQ7QUFBQSxNQUNEO0FBRUEsVUFBSTtBQUNKLGlCQUFXLFNBQVMsS0FBSyxRQUFRO0FBQ2hDLFlBQ0MsS0FBSyxXQUFXLGlCQUFpQixPQUFPLFVBQVUsRUFBRSxFQUFFLFdBQVcsS0FDakUsS0FBSyxXQUFXLGlCQUFpQixPQUFPLFVBQVUsS0FBSyxFQUFFLFdBQVcsR0FDbkU7QUFDRCwwQkFBZ0I7QUFDaEI7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFNBQVMsS0FBSyxRQUFRO0FBQ2hDLGNBQU0sYUFBYSxLQUFLLGdCQUFnQixLQUFLLDhCQUE4QixLQUFLO0FBQ2hGLG1CQUFXLElBQUksVUFBVSxhQUFhO0FBQUEsTUFDdkM7QUFBQSxJQUNEO0FBRUEsc0JBQWtCO0FBQ2xCLG1DQUErQjtBQUMvQixrQ0FBOEI7QUFFOUIsU0FBSyxVQUFVLEtBQUssY0FBYyxNQUFNO0FBQ3ZDLHdCQUFrQjtBQUNsQixvQ0FBOEI7QUFDOUIsV0FBSyx1QkFBdUI7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxpQkFBaUIsTUFBTTtBQUMxQyx3QkFBa0I7QUFDbEIsb0NBQThCO0FBQzlCLFdBQUssdUJBQXVCO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssMEJBQTBCLE1BQU07QUFDbkQsd0JBQWtCO0FBQ2xCLFdBQUssdUJBQXVCO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssNkJBQTZCLE1BQU0sK0JBQStCLENBQUMsQ0FBQztBQUN4RixTQUFLLFVBQVUsS0FBSyxlQUFlLE1BQU07QUFDeEMsb0NBQThCO0FBQzlCLFdBQUssdUJBQXVCO0FBQUEsSUFDN0IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLEtBQUssWUFBWSxNQUFNLDhCQUE4QixDQUFDLENBQUM7QUFBQSxFQUN2RTtBQUFBLEVBRVEsd0JBQXdCLFFBQXFCLFdBQThCO0FBR2xGLFNBQUssVUFBVSxLQUFLLHVCQUF1QixXQUFXLHVCQUFPLE9BQU8sSUFBSSxDQUFDLENBQUM7QUFHMUUsVUFBTSxVQUFVLEVBQUUscUJBQXFCO0FBQ3ZDLFdBQU8sWUFBWSxPQUFPO0FBRzFCLFNBQUssVUFBVSxzQ0FBc0MsU0FBUyxNQUFNLFFBQVEsVUFBVSxPQUFPLFNBQVMsQ0FBQyxDQUFDO0FBRXhHLFNBQUssVUFBVSw2QkFBNkIsU0FBUyxlQUFlLEtBQUssU0FBUztBQUFBLE1BQ2pGLGFBQWEsT0FBSyxRQUFRLFVBQVUsSUFBSSxTQUFTO0FBQUEsTUFDakQsV0FBVyxPQUFLLFFBQVEsVUFBVSxPQUFPLFNBQVM7QUFBQSxJQUNuRCxDQUFDLENBQUM7QUFFRixRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBQ0osVUFBTSxxQkFBcUIsQ0FBQyxhQUF1QjtBQUNsRCxVQUFJLENBQUMsS0FBSyxjQUFjLFVBQVUsTUFBTSxVQUFVLEtBQUssYUFBYSxLQUFLLGNBQWMsaUJBQWlCLEdBQUc7QUFDMUcsYUFBSyxjQUFjLGNBQWMsT0FBTyxNQUFNLFVBQVU7QUFBQSxNQUN6RCxXQUFXLENBQUMsS0FBSyxjQUFjLFVBQVUsTUFBTSxpQkFBaUIsS0FBSyxjQUFjLEtBQUssY0FBYyxtQkFBbUIsTUFBTSxTQUFTLFFBQVEsU0FBUyxPQUFPLFNBQVMsUUFBUTtBQUNoTCxhQUFLLGNBQWMsY0FBYyxPQUFPLE1BQU0saUJBQWlCO0FBQUEsTUFDaEU7QUFBQSxJQUNEO0FBRUEsVUFBTSxtQkFBbUIsTUFBTTtBQUM5QixVQUFJLHlCQUF5QjtBQUM1QixxQkFBYSx1QkFBdUI7QUFDcEMsa0NBQTBCO0FBQUEsTUFDM0I7QUFFQSxVQUFJLHVCQUF1QjtBQUMxQixxQkFBYSxxQkFBcUI7QUFDbEMsZ0NBQXdCO0FBQUEsTUFDekI7QUFBQSxJQUNEO0FBRUEsU0FBSyxVQUFVLDZCQUE2QixTQUFTLGVBQWUsU0FBUztBQUFBLE1BQzVFLFlBQVksT0FBSztBQUNoQixvQkFBWSxLQUFLLEVBQUUsV0FBVyxJQUFJO0FBQ2xDLFlBQUksRUFBRSxVQUFVLGNBQWM7QUFDN0IsWUFBRSxVQUFVLGFBQWEsYUFBYTtBQUFBLFFBQ3ZDO0FBRUEsY0FBTSxlQUFlLFFBQVEsc0JBQXNCO0FBRW5ELFlBQUkseUJBQStDO0FBQ25ELFlBQUksdUJBQTZDO0FBQ2pELGNBQU0sWUFBWTtBQUNsQixZQUFJLEVBQUUsVUFBVSxVQUFVLGFBQWEsT0FBTyxXQUFXO0FBQ3hELG1DQUF5QixTQUFTO0FBQUEsUUFDbkM7QUFFQSxZQUFJLEVBQUUsVUFBVSxVQUFVLGFBQWEsUUFBUSxXQUFXO0FBQ3pELG1DQUF5QixTQUFTO0FBQUEsUUFDbkM7QUFFQSxZQUFJLEVBQUUsVUFBVSxVQUFVLGFBQWEsU0FBUyxXQUFXO0FBQzFELGlDQUF1QixTQUFTO0FBQUEsUUFDakM7QUFFQSxZQUFJLEVBQUUsVUFBVSxVQUFVLGFBQWEsTUFBTSxXQUFXO0FBQ3ZELGlDQUF1QixTQUFTO0FBQUEsUUFDakM7QUFFQSxZQUFJLDJCQUEyQiwyQkFBMkIsNEJBQTRCO0FBQ3JGLHVCQUFhLHVCQUF1QjtBQUNwQyxvQ0FBMEI7QUFBQSxRQUMzQjtBQUVBLFlBQUkseUJBQXlCLHlCQUF5QiwwQkFBMEI7QUFDL0UsdUJBQWEscUJBQXFCO0FBQ2xDLGtDQUF3QjtBQUFBLFFBQ3pCO0FBRUEsWUFBSSxDQUFDLDJCQUEyQiwyQkFBMkIsUUFBVztBQUNyRSx1Q0FBNkI7QUFDN0Isb0NBQTBCLFdBQVcsTUFBTSxtQkFBbUIsc0JBQXNCLEdBQUcsR0FBRztBQUFBLFFBQzNGO0FBRUEsWUFBSSxDQUFDLHlCQUF5Qix5QkFBeUIsUUFBVztBQUNqRSxxQ0FBMkI7QUFDM0Isa0NBQXdCLFdBQVcsTUFBTSxtQkFBbUIsb0JBQW9CLEdBQUcsR0FBRztBQUFBLFFBQ3ZGO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYSxNQUFNLGlCQUFpQjtBQUFBLE1BQ3BDLFdBQVcsTUFBTSxpQkFBaUI7QUFBQSxNQUNsQyxRQUFRLE1BQU0saUJBQWlCO0FBQUEsSUFDaEMsQ0FBQyxDQUFDO0FBR0YsU0FBSyxVQUFVLGFBQWEsTUFBTSxpQkFBaUIsQ0FBQyxDQUFDO0FBQUEsRUFDdEQ7QUFBQSxFQUVBLGFBQWEsUUFBdUI7QUFDbkMsU0FBSyxxQkFBcUIsU0FBUyxNQUFNO0FBQUEsRUFDMUM7QUFBQSxFQUVBLG1CQUE0QjtBQUMzQixRQUFJLEtBQUssc0JBQXNCO0FBQzlCLGFBQU8sS0FBSyxxQkFBcUIsU0FBUztBQUFBLElBQzNDO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLHNCQUE0QjtBQUduQyxRQUFJLGVBQWU7QUFDbkIsUUFBSSxLQUFLLG1CQUFtQjtBQUMzQixxQkFBZSxDQUFDLEtBQUsscUNBQXFDO0FBQUEsSUFDM0Q7QUFHQSxRQUFJLENBQUMsS0FBSyxjQUFjLGNBQWM7QUFDckMsWUFBTSxlQUFlLEtBQUssa0JBQWtCO0FBQzVDLFdBQUssZ0JBQWdCLElBQUksaUJBQWlCLFlBQVksQ0FBQztBQUd2RCxXQUFLLGlCQUFpQixZQUFZO0FBQUEsSUFDbkM7QUFHQSxTQUFLLGdCQUFnQjtBQUdyQixTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFFUSx1Q0FBZ0Q7QUFDdkQsVUFBTSxRQUF3QyxLQUFLLFVBQVU7QUFDN0QsUUFBSSxPQUFPLGdCQUFnQjtBQUMxQixVQUFJO0FBR0gsYUFBSyx5QkFBeUIsTUFBTTtBQUdwQyxhQUFLLDZCQUE2QixNQUFNLGdCQUFnQixNQUFNLFdBQVc7QUFBQSxNQUMxRSxTQUFTLE9BQU87QUFHZiwwQkFBa0IsSUFBSSxNQUFNLHVDQUF1QyxLQUFLLGlCQUFpQixLQUFLLFVBQVUsS0FBSyxDQUFDLEdBQUcsQ0FBQztBQUdsSCxhQUFLLGNBQWM7QUFFbkIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDZCQUE2QixnQkFBaUMsZUFBZ0MseUJBQThDLFNBQXlDO0FBRzVMLFFBQUk7QUFDSixRQUFJLHlCQUF5QjtBQUM1Qix3QkFBa0Isd0JBQXdCLE1BQU0sQ0FBQztBQUFBLElBQ2xELE9BQU87QUFDTix3QkFBa0IsQ0FBQztBQUFBLElBQ3BCO0FBR0EsVUFBTSxhQUFpQyxDQUFDO0FBQ3hDLFVBQU0sYUFBYSxpQkFBaUIsWUFBWSxnQkFBZ0I7QUFBQSxNQUMvRCxVQUFVLENBQUMsMEJBQThEO0FBQ3hFLFlBQUk7QUFDSixZQUFJLGdCQUFnQixTQUFTLEdBQUc7QUFDL0Isc0JBQVksZ0JBQWdCLE1BQU07QUFBQSxRQUNuQyxPQUFPO0FBQ04sc0JBQVksS0FBSyxrQkFBa0IsdUJBQXVCLE9BQU87QUFBQSxRQUNsRTtBQUVBLG1CQUFXLEtBQUssU0FBUztBQUV6QixZQUFJLFVBQVUsT0FBTyxlQUFlO0FBQ25DLGVBQUssaUJBQWlCLFNBQVM7QUFBQSxRQUNoQztBQUVBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxHQUFHLEVBQUUsUUFBUSxFQUFFLGlCQUFpQixLQUFLLG9CQUFvQixFQUFFLENBQUM7QUFLNUQsUUFBSSxDQUFDLEtBQUssY0FBYztBQUN2QixXQUFLLGlCQUFpQixXQUFXLENBQUMsQ0FBQztBQUFBLElBQ3BDO0FBR0EsUUFBSSxLQUFLLHVCQUF1QixLQUFLLGFBQVcsQ0FBQyxLQUFLLFNBQVMsT0FBTyxDQUFDLEdBQUc7QUFDekUsV0FBSyx5QkFBeUIsV0FBVyxJQUFJLFdBQVMsTUFBTSxFQUFFO0FBQUEsSUFDL0Q7QUFHQSxTQUFLLGdCQUFnQixVQUFVO0FBQUEsRUFDaEM7QUFBQSxFQUVRLGdCQUFnQixZQUFzRDtBQUM3RSxRQUFJLGlCQUFrQyxDQUFDO0FBRXZDLFFBQUksS0FBSyxZQUFZO0FBQ3BCLHVCQUFpQixLQUFLLFdBQVc7QUFDakMsV0FBSyxXQUFXLFFBQVE7QUFBQSxJQUN6QjtBQUVBLFNBQUssYUFBYTtBQUNsQixTQUFLLFdBQVcsaUJBQWlCO0FBQ2pDLFNBQUssZUFBZSxhQUFhO0FBRWpDLFNBQUssNEJBQTRCLFFBQVEsV0FBVztBQUNwRCxTQUFLLGFBQWEsUUFBUSxXQUFXO0FBQ3JDLFNBQUssc0JBQXNCLE1BQU07QUFDakMsU0FBSyxzQkFBc0IsSUFBSSxXQUFXLHlCQUF5QixlQUFhLEtBQUssMkJBQTJCLEtBQUssU0FBUyxDQUFDLENBQUM7QUFFaEksU0FBSyxtQkFBbUIsS0FBSyxNQUFTO0FBQUEsRUFDdkM7QUFBQSxFQUVRLGtCQUF3QjtBQUMvQixTQUFLLFVBQVUsVUFBVSxPQUFPLFNBQVMsS0FBSyxPQUFPO0FBQUEsRUFDdEQ7QUFBQSxFQUVRLHlCQUErQjtBQUN0QyxTQUFLLFVBQVUsWUFBWSxlQUFlLEVBQUUsUUFBUSxDQUFDLE9BQU8sVUFBVSxNQUFNLG1CQUFtQixLQUFLLENBQUM7QUFBQSxFQUN0RztBQUFBLEVBRUEsd0JBQXdCLFVBQWtCO0FBQ3pDLGVBQVcsU0FBUyxLQUFLLFFBQVE7QUFDaEMsWUFBTSxtQkFBbUIsUUFBUTtBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBWSxVQUFtQjtBQUM5QixXQUFPLEtBQUssVUFBVSxLQUFLLEtBQUssYUFBYTtBQUFBLEVBQzlDO0FBQUEsRUFFQSxrQkFBa0IsUUFBK0I7QUFDaEQsU0FBSyxXQUFXLGlCQUFpQjtBQUNqQyxTQUFLLHFCQUFxQixpQkFBaUI7QUFBQSxFQUM1QztBQUFBLEVBRVMsT0FBTyxPQUFlLFFBQWdCLEtBQWEsTUFBb0I7QUFDL0UsU0FBSyxNQUFNO0FBQ1gsU0FBSyxPQUFPO0FBT1osUUFBSSxLQUFLLGFBQWEsV0FBVyxrQkFBa0IsS0FBSyxjQUFjLHdCQUF3QixHQUFHO0FBTWhHLFlBQU0sU0FBUywyQkFBMkIsS0FBSyxhQUFhO0FBQzVELFlBQU0sWUFBWSxPQUFPLFNBQVMsTUFBTTtBQUN4QyxZQUFNLGFBQWEsT0FBTyxVQUFVLE1BQU07QUFFMUMsWUFBTSxhQUFhLFlBQVksd0JBQXdCLElBQUk7QUFDM0QsWUFBTSxjQUFjLGFBQWEsd0JBQXdCLElBQUk7QUFFN0QsY0FBUSxLQUFLLElBQUksR0FBRyxRQUFRLGFBQWEsV0FBVztBQUNwRCxZQUFNLEVBQUUsV0FBVyxhQUFhLElBQUksS0FBSyw2QkFBNkI7QUFDdEUsZUFBUyxLQUFLLElBQUksR0FBRyxTQUFTLFlBQVksWUFBWTtBQUd0RCxVQUFJLENBQUMsS0FBSyxRQUFRLFVBQVUsU0FBUyxtQkFBbUIsR0FBRztBQUMxRCxnQkFBUSxLQUFLLElBQUksR0FBRyxRQUFRLDRCQUE0QixDQUFDO0FBQ3pELGlCQUFTLEtBQUssSUFBSSxHQUFHLFNBQVMsNEJBQTRCLENBQUM7QUFBQSxNQUM1RDtBQUVBLFdBQUssUUFBUSxVQUFVLE9BQU8sOEJBQThCLFNBQVM7QUFDckUsV0FBSyxRQUFRLFVBQVUsT0FBTywrQkFBK0IsVUFBVTtBQUFBLElBQ3hFLE9BQU87QUFDTixXQUFLLFFBQVEsVUFBVSxPQUFPLDhCQUE4Qiw2QkFBNkI7QUFBQSxJQUMxRjtBQUdBLFVBQU0sa0JBQWtCLE1BQU0sZUFBZSxPQUFPLE1BQU0sRUFBRTtBQUc1RCxTQUFLLFNBQVMsVUFBVSxLQUFLLGVBQWUsR0FBRyxLQUFLLElBQUk7QUFBQSxFQUN6RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEsK0JBQTRFO0FBQ25GLFVBQU0sZUFBZSxLQUFLLGNBQWMsVUFBVSxNQUFNLFVBQVU7QUFHbEUsVUFBTSxhQUFhLGdCQUFnQixLQUFLLGNBQWMsaUJBQWlCLE1BQU0sU0FBUztBQUl0RixVQUFNLGdCQUFnQixnQkFBZ0IsS0FBSyxjQUFjLGlCQUFpQixNQUFNLFNBQVM7QUFDekYsVUFBTSxlQUFlLENBQUMsS0FBSyxjQUFjLFVBQVUsTUFBTSxnQkFBZ0IsVUFBVSxLQUFLLENBQUMsZ0JBQ3RGLHdCQUF3QixJQUFJO0FBQy9CLFdBQU8sRUFBRSxXQUFXLGFBQWEsd0JBQXdCLEdBQUcsYUFBYTtBQUFBLEVBQzFFO0FBQUEsRUFFUSxTQUFTLFdBQXNCLE1BQU0sS0FBSyxLQUFLLE9BQU8sS0FBSyxNQUFZO0FBQzlFLFNBQUssb0JBQW9CO0FBR3pCLFNBQUsscUJBQXFCLE9BQU8sS0FBSyxrQkFBa0IsT0FBTyxLQUFLLGtCQUFrQixRQUFRLEtBQUssSUFBSTtBQUd2RyxTQUFLLGFBQWEsS0FBSyxTQUFTO0FBQUEsRUFDakM7QUFBQSxFQUVtQixZQUFrQjtBQUdwQyxRQUFJLEtBQUssWUFBWTtBQUNwQixVQUFJLEtBQUssU0FBUztBQUNqQixlQUFPLEtBQUssaUJBQWlCLFdBQVcsZ0NBQWdDO0FBQUEsTUFDekUsT0FBTztBQUNOLGFBQUssaUJBQWlCLFdBQVcsZ0NBQWdDLElBQUksS0FBSyxZQUFZO0FBQUEsTUFDdkY7QUFBQSxJQUNEO0FBR0EsUUFBSSxLQUFLLHNCQUFzQjtBQUM5QixZQUFNLHNCQUFzQixLQUFLLHFCQUFxQjtBQUN0RCxVQUFJLEtBQUsscUJBQXFCLFVBQVUsbUJBQW1CLEdBQUc7QUFDN0QsZUFBTyxLQUFLLGVBQWUsV0FBVyxxQ0FBcUM7QUFBQSxNQUM1RSxPQUFPO0FBQ04sYUFBSyxlQUFlLFdBQVcscUNBQXFDLElBQUk7QUFBQSxNQUN6RTtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQVU7QUFBQSxFQUNqQjtBQUFBLEVBRVUsWUFBNEM7QUFDckQsV0FBTyxLQUFLLGlCQUFpQixXQUFXLGdDQUFnQztBQUFBLEVBQ3pFO0FBQUEsRUFFQSxjQUFrQztBQUNqQyxXQUFPO0FBQUEsTUFDTixnQkFBZ0IsS0FBSyxXQUFXLFVBQVU7QUFBQSxNQUMxQyxhQUFhLEtBQUssYUFBYTtBQUFBLE1BQy9CLHdCQUF3QixLQUFLO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUEsRUFFQSxXQUFXLE9BQXFDLFNBQWtEO0FBQ2pHLFFBQUksVUFBVSxTQUFTO0FBQ3RCLGFBQU8sS0FBSyxrQkFBa0I7QUFBQSxJQUMvQixPQUFPO0FBQ04sYUFBTyxLQUFLLGFBQWEsT0FBTyxPQUFPO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGFBQWEsT0FBMkIsU0FBa0Q7QUFDdkcsVUFBTSxTQUFTLE1BQU0sS0FBSyxvQkFBb0I7QUFROUMsU0FBSyxlQUFlLE1BQU07QUFDMUIsU0FBSyxrQkFBa0IsTUFBTTtBQUU3QixTQUFLLGNBQWM7QUFHbkIsU0FBSyx5QkFBeUIsTUFBTTtBQUdwQyxRQUFJO0FBQ0gsV0FBSyxpQkFBaUIsTUFBTSxnQkFBZ0IsTUFBTSxhQUFhLFFBQVcsT0FBTztBQUFBLElBQ2xGLFVBQUU7QUFLRCxXQUFLLGtCQUFrQixPQUFPO0FBQzlCLFdBQUssZUFBZSxPQUFPO0FBQUEsSUFDNUI7QUFHQSxVQUFNLEtBQUssWUFBWTtBQUFBLE1BQ3RCLE9BQ0UsUUFBUSxXQUFTLE1BQU0sT0FBTyxFQUM5QixPQUFPLFlBQVUsS0FBSyxnQkFBZ0IsT0FBTyxNQUFNLGVBQWEsQ0FBQyxVQUFVLFNBQVMsTUFBTSxDQUFDLENBQUMsRUFDNUYsSUFBSSxhQUFXO0FBQUEsUUFDZjtBQUFBLFFBQVEsU0FBUyxFQUFFLFFBQVEsTUFBTSxlQUFlLE1BQU0sVUFBVSxLQUFLO0FBQUEsTUFDdEUsRUFBRTtBQUFBLElBQ0o7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLG9CQUFtQztBQUNoRCxVQUFNLEtBQUssb0JBQW9CO0FBRS9CLFNBQUssZUFBZSxLQUFLLFdBQVc7QUFBQSxFQUNyQztBQUFBLEVBRUEsTUFBYyxzQkFBbUQ7QUFPaEUsVUFBTSxTQUFTLEtBQUssVUFBVSxZQUFZLG9CQUFvQjtBQUM5RCxlQUFXLFNBQVMsUUFBUTtBQUMzQixZQUFNLE1BQU0sZ0JBQWdCLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUFBLElBQ3hEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLGlCQUFpQixXQUE0QixlQUFnQyx5QkFBOEMsU0FBeUM7QUFHM0ssU0FBSyw2QkFBNkIsV0FBVyxlQUFlLHlCQUF5QixPQUFPO0FBUzVGLFFBQUksS0FBSyxtQkFBbUI7QUFDM0IsV0FBSyxTQUFTLEtBQUssaUJBQWlCO0FBQUEsSUFDckM7QUFHQSxTQUFLLGdCQUFnQjtBQUdyQixlQUFXLGFBQWEsS0FBSyxVQUFVLFlBQVksZUFBZSxHQUFHO0FBQ3BFLFVBQUksQ0FBQyx5QkFBeUIsU0FBUyxTQUFTLEdBQUc7QUFDbEQsYUFBSyxlQUFlLEtBQUssU0FBUztBQUFBLE1BQ25DO0FBQUEsSUFDRDtBQUdBLFNBQUssdUJBQXVCO0FBQUEsRUFDN0I7QUFBQSxFQUVRLHdCQUF3QixHQUFtQztBQUNsRSxRQUFJLEVBQUUsWUFBWSxFQUFFLFVBQVUsYUFBYSxXQUFXO0FBQ3JELFdBQUssY0FBYyxFQUFFLEtBQUs7QUFFMUIsWUFBTSxRQUFRLEtBQUssVUFBVTtBQUM3QixVQUFJLE9BQU87QUFDVixhQUFLLFdBQVcsS0FBSztBQUFBLE1BQ3RCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFNBQWlCO0FBQ2hCLFdBQU87QUFBQSxNQUNOLE1BQU0sTUFBTTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBc0I7QUFDN0IsZUFBVyxTQUFTLEtBQUssUUFBUTtBQUNoQyxZQUFNLFFBQVE7QUFFZCxXQUFLLGtCQUFrQixLQUFLLEtBQUs7QUFBQSxJQUNsQztBQUVBLFNBQUssV0FBVyxNQUFNO0FBQ3RCLFNBQUsseUJBQXlCLENBQUM7QUFBQSxFQUNoQztBQUFBLEVBRVMsVUFBZ0I7QUFHeEIsU0FBSyxlQUFlLEtBQUs7QUFHekIsU0FBSyxjQUFjO0FBR25CLFNBQUssWUFBWSxRQUFRO0FBRXpCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQTtBQUdEO0FBdmlEYSxXQUVZLG1DQUFtQztBQUYvQyxXQUdZLHdDQUF3QztBQUhwRCxhQUFOO0FBQUEsRUE4RUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXBGVTtBQXlpRE4sSUFBTSxpQkFBTixjQUE2QixXQUFXO0FBQUEsRUFFOUMsWUFDQyxpQkFDdUIsc0JBQ1IsY0FDUSxzQkFDTixnQkFDUSxlQUNYLGFBQ00sbUJBQ25CO0FBQ0QsVUFBTSxpQkFBaUIsTUFBTSxhQUFhLElBQUksV0FBVyxnQkFBZ0Isc0JBQXNCLGNBQWMsc0JBQXNCLGdCQUFnQixlQUFlLGFBQWEsaUJBQWlCO0FBQUEsRUFDak07QUFDRDtBQWRhLGlCQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
