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
import { localize } from "../../../nls.js";
import { ActionsOrientation } from "../../../base/browser/ui/actionbar/actionbar.js";
import { IActivityService } from "../../services/activity/common/activity.js";
import { IWorkbenchLayoutService, Parts } from "../../services/layout/browser/layoutService.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { DisposableStore, Disposable, DisposableMap, combinedDisposable } from "../../../base/common/lifecycle.js";
import { CompositeBar, CompositeDragAndDrop } from "./compositeBar.js";
import { Dimension, isMouseEvent } from "../../../base/browser/dom.js";
import { createCSSRule } from "../../../base/browser/domStylesheets.js";
import { asCSSUrl } from "../../../base/browser/cssValue.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { URI } from "../../../base/common/uri.js";
import { ToggleCompositePinnedAction, ToggleCompositeBadgeAction, CompositeBarAction } from "./compositeBarActions.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../common/views.js";
import { IContextKeyService, ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { isString } from "../../../base/common/types.js";
import { IWorkbenchEnvironmentService } from "../../services/environment/common/environmentService.js";
import { isNative } from "../../../base/common/platform.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { Separator, SubmenuAction, toAction } from "../../../base/common/actions.js";
import { StringSHA1 } from "../../../base/common/hash.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { IViewsService } from "../../services/views/common/viewsService.js";
let PaneCompositeBar = class extends Disposable {
  constructor(location, options, part, paneCompositePart, instantiationService, storageService, extensionService, viewDescriptorService, viewService, contextKeyService, environmentService, layoutService) {
    super();
    this.location = location;
    this.options = options;
    this.part = part;
    this.paneCompositePart = paneCompositePart;
    this.instantiationService = instantiationService;
    this.storageService = storageService;
    this.extensionService = extensionService;
    this.viewDescriptorService = viewDescriptorService;
    this.viewService = viewService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.layoutService = layoutService;
    this.viewContainerDisposables = this._register(new DisposableMap());
    this.compositeActions = this._register(new DisposableMap());
    this.hasExtensionsRegistered = false;
    this._cachedViewContainers = void 0;
    this.dndHandler = new CompositeDragAndDrop(
      this.viewDescriptorService,
      this.location,
      this.options.orientation,
      async (id, focus) => {
        return await this.paneCompositePart.openPaneComposite(id, focus) ?? null;
      },
      (from, to, before) => this.compositeBar.move(from, to, this.options.orientation === ActionsOrientation.VERTICAL ? before?.verticallyBefore : before?.horizontallyBefore),
      () => this.compositeBar.getCompositeBarItems()
    );
    const cachedItems = this.cachedViewContainers.map((container) => ({
      id: container.id,
      name: container.name,
      visible: !this.shouldBeHidden(container.id, container),
      order: container.order,
      pinned: container.pinned
    }));
    this.compositeBar = this.createCompositeBar(cachedItems);
    this.onDidRegisterViewContainers(this.getViewContainers());
    this.registerListeners();
  }
  createCompositeBar(cachedItems) {
    return this._register(this.instantiationService.createInstance(CompositeBar, cachedItems, {
      icon: this.options.icon,
      compact: this.options.compact,
      orientation: this.options.orientation,
      activityHoverOptions: this.options.activityHoverOptions,
      preventLoopNavigation: this.options.preventLoopNavigation,
      openComposite: async (compositeId, preserveFocus) => {
        return await this.paneCompositePart.openPaneComposite(compositeId, !preserveFocus) ?? null;
      },
      getActivityAction: (compositeId) => this.getCompositeActions(compositeId).activityAction,
      getCompositePinnedAction: (compositeId) => this.getCompositeActions(compositeId).pinnedAction,
      getCompositeBadgeAction: (compositeId) => this.getCompositeActions(compositeId).badgeAction,
      getOnCompositeClickAction: (compositeId) => this.getCompositeActions(compositeId).activityAction,
      fillExtraContextMenuActions: (actions, e) => this.options.fillExtraContextMenuActions(actions, e),
      getContextMenuActionsForComposite: (compositeId) => this.getContextMenuActionsForComposite(compositeId),
      getDefaultCompositeId: () => this.viewDescriptorService.getDefaultViewContainer(this.location)?.id,
      dndHandler: this.dndHandler,
      compositeSize: this.options.compositeSize,
      overflowActionSize: this.options.overflowActionSize,
      colors: (theme) => this.options.colors(theme)
    }));
  }
  getContextMenuActionsForComposite(compositeId) {
    const actions = [new Separator()];
    const viewContainer = this.viewDescriptorService.getViewContainerById(compositeId);
    const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer);
    const currentLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    const moveActions = [];
    for (const location of [ViewContainerLocation.Sidebar, ViewContainerLocation.AuxiliaryBar, ViewContainerLocation.Panel]) {
      if (currentLocation !== location) {
        moveActions.push(this.createMoveAction(viewContainer, location, defaultLocation));
      }
    }
    actions.push(new SubmenuAction("moveToMenu", localize("moveToMenu", "Move To"), moveActions));
    if (defaultLocation !== currentLocation) {
      actions.push(toAction({
        id: "resetLocationAction",
        label: localize("resetLocation", "Reset Location"),
        run: () => {
          this.viewDescriptorService.moveViewContainerToLocation(viewContainer, defaultLocation, void 0, "resetLocationAction");
          this.viewService.openViewContainer(viewContainer.id, true);
        }
      }));
    } else {
      const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
      if (viewContainerModel.allViewDescriptors.length === 1) {
        const viewToReset = viewContainerModel.allViewDescriptors[0];
        const defaultContainer = this.viewDescriptorService.getDefaultContainerById(viewToReset.id);
        if (defaultContainer !== viewContainer) {
          actions.push(toAction({
            id: "resetLocationAction",
            label: localize("resetLocation", "Reset Location"),
            run: () => {
              this.viewDescriptorService.moveViewsToContainer([viewToReset], defaultContainer, void 0, "resetLocationAction");
              this.viewService.openViewContainer(viewContainer.id, true);
            }
          }));
        }
      }
    }
    return actions;
  }
  createMoveAction(viewContainer, newLocation, defaultLocation) {
    return toAction({
      id: `moveViewContainerTo${newLocation}`,
      label: newLocation === ViewContainerLocation.Panel ? localize("panel", "Panel") : newLocation === ViewContainerLocation.Sidebar ? localize("sidebar", "Primary Side Bar") : localize("auxiliarybar", "Secondary Side Bar"),
      run: () => {
        let index;
        if (newLocation !== defaultLocation) {
          index = this.viewDescriptorService.getViewContainersByLocation(newLocation).length;
        } else {
          index = void 0;
        }
        this.viewDescriptorService.moveViewContainerToLocation(viewContainer, newLocation, index);
        this.viewService.openViewContainer(viewContainer.id, true);
      }
    });
  }
  registerListeners() {
    this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeViewContainers(added, removed)));
    this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeViewContainerLocation(viewContainer, from, to)));
    this._register(this.paneCompositePart.onDidPaneCompositeOpen((e) => this.onDidChangeViewContainerVisibility(e.getId(), true)));
    this._register(this.paneCompositePart.onDidPaneCompositeClose((e) => this.onDidChangeViewContainerVisibility(e.getId(), false)));
    this.extensionService.whenInstalledExtensionsRegistered().then(() => {
      if (this._store.isDisposed) {
        return;
      }
      this.onDidRegisterExtensions();
      this._register(this.compositeBar.onDidChange(() => {
        this.updateCompositeBarItemsFromStorage(true);
        this.saveCachedViewContainers();
      }));
      this._register(this.storageService.onDidChangeValue(StorageScope.PROFILE, this.options.pinnedViewContainersKey, this._store)(() => this.updateCompositeBarItemsFromStorage(false)));
    });
  }
  onDidChangeViewContainers(added, removed) {
    removed.filter(({ location }) => location === this.location).forEach(({ container }) => this.onDidDeregisterViewContainer(container));
    this.onDidRegisterViewContainers(added.filter(({ location }) => location === this.location).map(({ container }) => container));
  }
  onDidChangeViewContainerLocation(container, from, to) {
    if (from === this.location) {
      this.onDidDeregisterViewContainer(container);
    }
    if (to === this.location) {
      this.onDidRegisterViewContainers([container]);
    }
  }
  onDidChangeViewContainerVisibility(id, visible) {
    if (visible) {
      this.onDidViewContainerVisible(id);
    } else {
      this.compositeBar.deactivateComposite(id);
    }
  }
  onDidRegisterExtensions() {
    this.hasExtensionsRegistered = true;
    for (const { id } of this.cachedViewContainers) {
      const viewContainer = this.getViewContainer(id);
      if (viewContainer) {
        this.showOrHideViewContainer(viewContainer);
      } else {
        if (this.viewDescriptorService.isViewContainerRemovedPermanently(id)) {
          this.removeComposite(id);
        } else {
          this.hideComposite(id);
        }
      }
    }
    this.saveCachedViewContainers();
  }
  onDidViewContainerVisible(id) {
    const viewContainer = this.getViewContainer(id);
    if (viewContainer) {
      this.addComposite(viewContainer);
      this.compositeBar.activateComposite(viewContainer.id);
      if (this.shouldBeHidden(viewContainer)) {
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        if (viewContainerModel.activeViewDescriptors.length === 0) {
          this.hideComposite(viewContainer.id);
        }
      }
    }
  }
  create(parent) {
    return this.compositeBar.create(parent);
  }
  getCompositeActions(compositeId) {
    let compositeActions = this.compositeActions.get(compositeId);
    if (!compositeActions) {
      const viewContainer = this.getViewContainer(compositeId);
      let activityAction;
      let pinnedAction;
      let badgeAction;
      if (viewContainer) {
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        const actionItem = this.toCompositeBarActionItemFrom(viewContainerModel);
        activityAction = this.instantiationService.createInstance(ViewContainerActivityAction, actionItem, this.part, this.paneCompositePart);
        pinnedAction = new ToggleCompositePinnedAction(actionItem, this.compositeBar);
        badgeAction = new ToggleCompositeBadgeAction(actionItem, this.compositeBar);
      } else {
        const cachedComposite = this.cachedViewContainers.filter((c) => c.id === compositeId)[0];
        const actionItem = this.toCompositeBarActionItem(compositeId, cachedComposite?.name ?? compositeId, cachedComposite?.icon, void 0);
        activityAction = this.instantiationService.createInstance(PlaceHolderViewContainerActivityAction, actionItem, this.part, this.paneCompositePart);
        pinnedAction = new PlaceHolderToggleCompositePinnedAction(compositeId, this.compositeBar);
        badgeAction = new PlaceHolderToggleCompositeBadgeAction(compositeId, this.compositeBar);
      }
      const disposable = combinedDisposable(activityAction, pinnedAction, badgeAction);
      compositeActions = { activityAction, pinnedAction, badgeAction, dispose: () => disposable.dispose() };
      this.compositeActions.set(compositeId, compositeActions);
    }
    return compositeActions;
  }
  onDidRegisterViewContainers(viewContainers) {
    for (const viewContainer of viewContainers) {
      this.addComposite(viewContainer);
      const cachedViewContainer = this.cachedViewContainers.filter(({ id }) => id === viewContainer.id)[0];
      if (!cachedViewContainer) {
        this.compositeBar.pin(viewContainer.id);
      }
      const visibleViewContainer = this.paneCompositePart.getActivePaneComposite();
      if (visibleViewContainer?.getId() === viewContainer.id) {
        this.compositeBar.activateComposite(viewContainer.id);
      }
      const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
      this.updateCompositeBarActionItem(viewContainer, viewContainerModel);
      this.showOrHideViewContainer(viewContainer);
      const disposables = new DisposableStore();
      disposables.add(viewContainerModel.onDidChangeContainerInfo(() => this.updateCompositeBarActionItem(viewContainer, viewContainerModel)));
      disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.showOrHideViewContainer(viewContainer)));
      this.viewContainerDisposables.set(viewContainer.id, disposables);
    }
  }
  onDidDeregisterViewContainer(viewContainer) {
    this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
    this.removeComposite(viewContainer.id);
  }
  updateCompositeBarActionItem(viewContainer, viewContainerModel) {
    const compositeBarActionItem = this.toCompositeBarActionItemFrom(viewContainerModel);
    const { activityAction, pinnedAction } = this.getCompositeActions(viewContainer.id);
    activityAction.updateCompositeBarActionItem(compositeBarActionItem);
    if (pinnedAction instanceof PlaceHolderToggleCompositePinnedAction) {
      pinnedAction.setActivity(compositeBarActionItem);
    }
    if (this.options.recomputeSizes) {
      this.compositeBar.recomputeSizes();
    }
    this.saveCachedViewContainers();
  }
  toCompositeBarActionItemFrom(viewContainerModel) {
    return this.toCompositeBarActionItem(viewContainerModel.viewContainer.id, viewContainerModel.title, viewContainerModel.icon, viewContainerModel.keybindingId);
  }
  toCompositeBarActionItem(id, name, icon, keybindingId) {
    let classNames = void 0;
    let iconUrl = void 0;
    if (this.options.icon) {
      if (URI.isUri(icon)) {
        iconUrl = icon;
        const cssUrl = asCSSUrl(icon);
        const hash = new StringSHA1();
        hash.update(cssUrl);
        const iconId = `activity-${id.replace(/\./g, "-")}-${hash.digest()}`;
        const iconClass = `.monaco-workbench .${this.options.partContainerClass} .monaco-action-bar .action-label.${iconId}`;
        classNames = [iconId, "uri-icon"];
        createCSSRule(iconClass, `
				mask: ${cssUrl} no-repeat 50% 50%;
				mask-size: var(--activity-bar-icon-size, ${this.options.iconSize}px);
				-webkit-mask: ${cssUrl} no-repeat 50% 50%;
				-webkit-mask-size: var(--activity-bar-icon-size, ${this.options.iconSize}px);
				mask-origin: padding;
				-webkit-mask-origin: padding;
			`);
      } else if (ThemeIcon.isThemeIcon(icon)) {
        classNames = ThemeIcon.asClassNameArray(icon);
      }
    }
    return { id, name, classNames, iconUrl, keybindingId };
  }
  showOrHideViewContainer(viewContainer) {
    if (this.shouldBeHidden(viewContainer)) {
      this.hideComposite(viewContainer.id);
    } else {
      this.addComposite(viewContainer);
      const activePaneComposite = this.paneCompositePart.getActivePaneComposite();
      if (activePaneComposite?.getId() === viewContainer.id) {
        this.compositeBar.activateComposite(viewContainer.id);
      }
    }
  }
  shouldBeHidden(viewContainerOrId, cachedViewContainer) {
    const viewContainer = isString(viewContainerOrId) ? this.getViewContainer(viewContainerOrId) : viewContainerOrId;
    const viewContainerId = isString(viewContainerOrId) ? viewContainerOrId : viewContainerOrId.id;
    if (viewContainer) {
      if (viewContainer.hideIfEmpty) {
        if (this.viewService.isViewContainerActive(viewContainerId)) {
          return false;
        }
      } else {
        return false;
      }
    }
    if (!this.hasExtensionsRegistered && !(this.part === Parts.SIDEBAR_PART && this.environmentService.remoteAuthority && isNative)) {
      cachedViewContainer = cachedViewContainer || this.cachedViewContainers.find(({ id }) => id === viewContainerId);
      if (!viewContainer && cachedViewContainer?.isBuiltin && cachedViewContainer?.visible) {
        return false;
      }
      if (cachedViewContainer?.views?.length) {
        return cachedViewContainer.views.every(({ when }) => !!when && !this.contextKeyService.contextMatchesRules(ContextKeyExpr.deserialize(when)));
      }
    }
    return true;
  }
  addComposite(viewContainer) {
    this.compositeBar.addComposite({ id: viewContainer.id, name: typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value, order: viewContainer.order, requestedIndex: viewContainer.requestedIndex });
  }
  hideComposite(compositeId) {
    this.compositeBar.hideComposite(compositeId);
    const compositeActions = this.compositeActions.get(compositeId);
    if (compositeActions) {
      this.compositeActions.deleteAndDispose(compositeId);
    }
  }
  removeComposite(compositeId) {
    this.compositeBar.removeComposite(compositeId);
    const compositeActions = this.compositeActions.get(compositeId);
    if (compositeActions) {
      this.compositeActions.deleteAndDispose(compositeId);
    }
  }
  getPinnedPaneCompositeIds() {
    const pinnedCompositeIds = this.compositeBar.getPinnedComposites().map((v) => v.id);
    return this.getViewContainers().filter((v) => this.compositeBar.isPinned(v.id)).sort((v1, v2) => pinnedCompositeIds.indexOf(v1.id) - pinnedCompositeIds.indexOf(v2.id)).map((v) => v.id);
  }
  getVisiblePaneCompositeIds() {
    return this.compositeBar.getVisibleComposites().filter((v) => this.paneCompositePart.getActivePaneComposite()?.getId() === v.id || this.compositeBar.isPinned(v.id)).map((v) => v.id);
  }
  getPaneCompositeIds() {
    return this.compositeBar.getVisibleComposites().map((v) => v.id);
  }
  getContextMenuActions() {
    return this.compositeBar.getContextMenuActions();
  }
  focus(index) {
    this.compositeBar.focus(index);
  }
  layout(width, height) {
    this.compositeBar.layout(new Dimension(width, height));
  }
  getViewContainer(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    return viewContainer && this.viewDescriptorService.getViewContainerLocation(viewContainer) === this.location ? viewContainer : void 0;
  }
  getViewContainers() {
    return this.viewDescriptorService.getViewContainersByLocation(this.location);
  }
  updateCompositeBarItemsFromStorage(retainExisting) {
    if (this.pinnedViewContainersValue === this.getStoredPinnedViewContainersValue()) {
      return;
    }
    this._placeholderViewContainersValue = void 0;
    this._pinnedViewContainersValue = void 0;
    this._cachedViewContainers = void 0;
    const newCompositeItems = [];
    const compositeItems = this.compositeBar.getCompositeBarItems();
    for (const cachedViewContainer of this.cachedViewContainers) {
      newCompositeItems.push({
        id: cachedViewContainer.id,
        name: cachedViewContainer.name,
        order: cachedViewContainer.order,
        pinned: cachedViewContainer.pinned,
        visible: cachedViewContainer.visible && !!this.getViewContainer(cachedViewContainer.id)
      });
    }
    for (const viewContainer of this.getViewContainers()) {
      if (!newCompositeItems.some(({ id }) => id === viewContainer.id)) {
        const index = compositeItems.findIndex(({ id }) => id === viewContainer.id);
        if (index !== -1) {
          const compositeItem = compositeItems[index];
          newCompositeItems.splice(index, 0, {
            id: viewContainer.id,
            name: typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value,
            order: compositeItem.order,
            pinned: compositeItem.pinned,
            visible: compositeItem.visible
          });
        } else {
          newCompositeItems.push({
            id: viewContainer.id,
            name: typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value,
            order: viewContainer.order,
            pinned: true,
            visible: !this.shouldBeHidden(viewContainer)
          });
        }
      }
    }
    if (retainExisting) {
      for (const compositeItem of compositeItems) {
        const newCompositeItem = newCompositeItems.find(({ id }) => id === compositeItem.id);
        if (!newCompositeItem) {
          newCompositeItems.push(compositeItem);
        }
      }
    }
    this.compositeBar.setCompositeBarItems(newCompositeItems);
  }
  saveCachedViewContainers() {
    const state = [];
    const compositeItems = this.compositeBar.getCompositeBarItems();
    for (const compositeItem of compositeItems) {
      const viewContainer = this.getViewContainer(compositeItem.id);
      if (viewContainer) {
        const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
        const views = [];
        for (const { when } of viewContainerModel.allViewDescriptors) {
          views.push({ when: when ? when.serialize() : void 0 });
        }
        state.push({
          id: compositeItem.id,
          name: viewContainerModel.title,
          icon: URI.isUri(viewContainerModel.icon) && this.environmentService.remoteAuthority ? void 0 : viewContainerModel.icon,
          // Do not cache uri icons with remote connection
          views,
          pinned: compositeItem.pinned,
          order: compositeItem.order,
          visible: compositeItem.visible,
          isBuiltin: !viewContainer.extensionId
        });
      } else {
        state.push({ id: compositeItem.id, name: compositeItem.name, pinned: compositeItem.pinned, order: compositeItem.order, visible: false, isBuiltin: false });
      }
    }
    this.storeCachedViewContainersState(state);
  }
  get cachedViewContainers() {
    if (this._cachedViewContainers === void 0) {
      this._cachedViewContainers = this.getPinnedViewContainers();
      for (const placeholderViewContainer of this.getPlaceholderViewContainers()) {
        const cachedViewContainer = this._cachedViewContainers.find((cached) => cached.id === placeholderViewContainer.id);
        if (cachedViewContainer) {
          cachedViewContainer.visible = placeholderViewContainer.visible ?? cachedViewContainer.visible;
          cachedViewContainer.name = placeholderViewContainer.name;
          cachedViewContainer.icon = placeholderViewContainer.themeIcon ? placeholderViewContainer.themeIcon : placeholderViewContainer.iconUrl ? URI.revive(placeholderViewContainer.iconUrl) : void 0;
          if (URI.isUri(cachedViewContainer.icon) && this.environmentService.remoteAuthority) {
            cachedViewContainer.icon = void 0;
          }
          cachedViewContainer.views = placeholderViewContainer.views;
          cachedViewContainer.isBuiltin = placeholderViewContainer.isBuiltin;
        }
      }
      for (const viewContainerWorkspaceState of this.getViewContainersWorkspaceState()) {
        const cachedViewContainer = this._cachedViewContainers.find((cached) => cached.id === viewContainerWorkspaceState.id);
        if (cachedViewContainer) {
          cachedViewContainer.visible = viewContainerWorkspaceState.visible ?? cachedViewContainer.visible;
        }
      }
    }
    return this._cachedViewContainers;
  }
  storeCachedViewContainersState(cachedViewContainers) {
    const pinnedViewContainers = this.getPinnedViewContainers();
    this.setPinnedViewContainers(cachedViewContainers.map(({ id, pinned, order }) => ({
      id,
      pinned,
      visible: Boolean(pinnedViewContainers.find(({ id: pinnedId }) => pinnedId === id)?.visible),
      order
    })));
    this.setPlaceholderViewContainers(cachedViewContainers.map(({ id, icon, name, views, isBuiltin }) => ({
      id,
      iconUrl: URI.isUri(icon) ? icon : void 0,
      themeIcon: ThemeIcon.isThemeIcon(icon) ? icon : void 0,
      name,
      isBuiltin,
      views
    })));
    this.setViewContainersWorkspaceState(cachedViewContainers.map(({ id, visible }) => ({
      id,
      visible
    })));
  }
  getPinnedViewContainers() {
    return JSON.parse(this.pinnedViewContainersValue);
  }
  setPinnedViewContainers(pinnedViewContainers) {
    this.pinnedViewContainersValue = JSON.stringify(pinnedViewContainers);
  }
  get pinnedViewContainersValue() {
    if (!this._pinnedViewContainersValue) {
      this._pinnedViewContainersValue = this.getStoredPinnedViewContainersValue();
    }
    return this._pinnedViewContainersValue;
  }
  set pinnedViewContainersValue(pinnedViewContainersValue) {
    if (this.pinnedViewContainersValue !== pinnedViewContainersValue) {
      this._pinnedViewContainersValue = pinnedViewContainersValue;
      this.setStoredPinnedViewContainersValue(pinnedViewContainersValue);
    }
  }
  getStoredPinnedViewContainersValue() {
    return this.storageService.get(this.options.pinnedViewContainersKey, StorageScope.PROFILE, "[]");
  }
  setStoredPinnedViewContainersValue(value) {
    this.storageService.store(this.options.pinnedViewContainersKey, value, StorageScope.PROFILE, StorageTarget.USER);
  }
  getPlaceholderViewContainers() {
    return JSON.parse(this.placeholderViewContainersValue);
  }
  setPlaceholderViewContainers(placeholderViewContainers) {
    this.placeholderViewContainersValue = JSON.stringify(placeholderViewContainers);
  }
  get placeholderViewContainersValue() {
    if (!this._placeholderViewContainersValue) {
      this._placeholderViewContainersValue = this.getStoredPlaceholderViewContainersValue();
    }
    return this._placeholderViewContainersValue;
  }
  set placeholderViewContainersValue(placeholderViewContainesValue) {
    if (this.placeholderViewContainersValue !== placeholderViewContainesValue) {
      this._placeholderViewContainersValue = placeholderViewContainesValue;
      this.setStoredPlaceholderViewContainersValue(placeholderViewContainesValue);
    }
  }
  getStoredPlaceholderViewContainersValue() {
    return this.storageService.get(this.options.placeholderViewContainersKey, StorageScope.PROFILE, "[]");
  }
  setStoredPlaceholderViewContainersValue(value) {
    this.storageService.store(this.options.placeholderViewContainersKey, value, StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  getViewContainersWorkspaceState() {
    return JSON.parse(this.viewContainersWorkspaceStateValue);
  }
  setViewContainersWorkspaceState(viewContainersWorkspaceState) {
    this.viewContainersWorkspaceStateValue = JSON.stringify(viewContainersWorkspaceState);
  }
  get viewContainersWorkspaceStateValue() {
    if (!this._viewContainersWorkspaceStateValue) {
      this._viewContainersWorkspaceStateValue = this.getStoredViewContainersWorkspaceStateValue();
    }
    return this._viewContainersWorkspaceStateValue;
  }
  set viewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue) {
    if (this.viewContainersWorkspaceStateValue !== viewContainersWorkspaceStateValue) {
      this._viewContainersWorkspaceStateValue = viewContainersWorkspaceStateValue;
      this.setStoredViewContainersWorkspaceStateValue(viewContainersWorkspaceStateValue);
    }
  }
  getStoredViewContainersWorkspaceStateValue() {
    return this.storageService.get(this.options.viewContainersWorkspaceStateKey, StorageScope.WORKSPACE, "[]");
  }
  setStoredViewContainersWorkspaceStateValue(value) {
    this.storageService.store(this.options.viewContainersWorkspaceStateKey, value, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
};
PaneCompositeBar = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IViewDescriptorService),
  __decorateParam(8, IViewsService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IWorkbenchEnvironmentService),
  __decorateParam(11, IWorkbenchLayoutService)
], PaneCompositeBar);
let ViewContainerActivityAction = class extends CompositeBarAction {
  constructor(compositeBarActionItem, part, paneCompositePart, layoutService, configurationService, activityService) {
    super(compositeBarActionItem);
    this.part = part;
    this.paneCompositePart = paneCompositePart;
    this.layoutService = layoutService;
    this.configurationService = configurationService;
    this.activityService = activityService;
    this.lastRun = 0;
    this.updateActivity();
    this._register(this.activityService.onDidChangeActivity((viewContainerOrAction) => {
      if (!isString(viewContainerOrAction) && viewContainerOrAction.id === this.compositeBarActionItem.id) {
        this.updateActivity();
      }
    }));
  }
  updateCompositeBarActionItem(compositeBarActionItem) {
    this.compositeBarActionItem = compositeBarActionItem;
  }
  updateActivity() {
    this.activities = this.activityService.getViewContainerActivities(this.compositeBarActionItem.id);
  }
  async run(event) {
    if (isMouseEvent(event) && event.button === 2) {
      return;
    }
    const now = Date.now();
    if (now > this.lastRun && now - this.lastRun < ViewContainerActivityAction.preventDoubleClickDelay) {
      return;
    }
    this.lastRun = now;
    const focus = event && "preserveFocus" in event ? !event.preserveFocus : true;
    if (this.part === Parts.ACTIVITYBAR_PART) {
      const sideBarVisible = this.layoutService.isVisible(Parts.SIDEBAR_PART);
      const activeViewlet = this.paneCompositePart.getActivePaneComposite();
      const focusBehavior = this.configurationService.getValue("workbench.activityBar.iconClickBehavior");
      if (sideBarVisible && activeViewlet?.getId() === this.compositeBarActionItem.id) {
        switch (focusBehavior) {
          case "focus":
            this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
            break;
          case "toggle":
          default:
            this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
            break;
        }
        return;
      }
    }
    await this.paneCompositePart.openPaneComposite(this.compositeBarActionItem.id, focus);
    return this.activate();
  }
};
ViewContainerActivityAction.preventDoubleClickDelay = 300;
ViewContainerActivityAction = __decorateClass([
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IActivityService)
], ViewContainerActivityAction);
class PlaceHolderViewContainerActivityAction extends ViewContainerActivityAction {
}
class PlaceHolderToggleCompositePinnedAction extends ToggleCompositePinnedAction {
  constructor(id, compositeBar) {
    super({ id, name: id, classNames: void 0 }, compositeBar);
  }
  setActivity(activity) {
    this.label = activity.name;
  }
}
class PlaceHolderToggleCompositeBadgeAction extends ToggleCompositeBadgeAction {
  constructor(id, compositeBar) {
    super({ id, name: id, classNames: void 0 }, compositeBar);
  }
  setCompositeBarActionItem(actionItem) {
    this.label = actionItem.name;
  }
}
export {
  PaneCompositeBar
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3BhbmVDb21wb3NpdGVCYXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBQYXJ0cyB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBjb21iaW5lZERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbG9yVGhlbWUgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbXBvc2l0ZUJhciwgSUNvbXBvc2l0ZUJhckl0ZW0sIENvbXBvc2l0ZURyYWdBbmREcm9wIH0gZnJvbSAnLi9jb21wb3NpdGVCYXIuanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uLCBpc01vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNTU1J1bGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgYXNDU1NVcmwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uLCBJQ29tcG9zaXRlQmFyQ29sb3JzLCBJQWN0aXZpdHlIb3Zlck9wdGlvbnMsIFRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uLCBDb21wb3NpdGVCYXJBY3Rpb24sIElDb21wb3NpdGVCYXIsIElDb21wb3NpdGVCYXJBY3Rpb25JdGVtIH0gZnJvbSAnLi9jb21wb3NpdGVCYXJBY3Rpb25zLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXIsIElWaWV3Q29udGFpbmVyTW9kZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzTmF0aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQmVmb3JlMkQsIElDb21wb3NpdGVEcmFnQW5kRHJvcCB9IGZyb20gJy4uL2RuZC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgU3RyaW5nU0hBMSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgR2VzdHVyZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydCB9IGZyb20gJy4vcGFuZUNvbXBvc2l0ZVBhcnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5cbmludGVyZmFjZSBJUGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgaWNvblVybD86IFVyaUNvbXBvbmVudHM7XG5cdHJlYWRvbmx5IHRoZW1lSWNvbj86IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgaXNCdWlsdGluPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdmlld3M/OiB7IHdoZW4/OiBzdHJpbmcgfVtdO1xuXHQvLyBUT0RPIEBzYW5keTA4MTogUmVtb3ZlIHRoaXMgYWZ0ZXIgYSB3aGlsZS4gTWlncmF0ZWQgdG8gdmlzaWJsZSBpbiBJVmlld0NvbnRhaW5lcldvcmtzcGFjZVN0YXRlXG5cdHJlYWRvbmx5IHZpc2libGU/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVBpbm5lZFZpZXdDb250YWluZXIge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBwaW5uZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9yZGVyPzogbnVtYmVyO1xuXHQvLyBUT0RPIEBzYW5keTA4MTogUmVtb3ZlIHRoaXMgYWZ0ZXIgYSB3aGlsZS4gTWlncmF0ZWQgdG8gdmlzaWJsZSBpbiBJVmlld0NvbnRhaW5lcldvcmtzcGFjZVN0YXRlXG5cdHJlYWRvbmx5IHZpc2libGU6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJVmlld0NvbnRhaW5lcldvcmtzcGFjZVN0YXRlIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdmlzaWJsZTogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElDYWNoZWRWaWV3Q29udGFpbmVyIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0bmFtZT86IHN0cmluZztcblx0aWNvbj86IFVSSSB8IFRoZW1lSWNvbjtcblx0cmVhZG9ubHkgcGlubmVkOiBib29sZWFuO1xuXHRyZWFkb25seSBvcmRlcj86IG51bWJlcjtcblx0dmlzaWJsZTogYm9vbGVhbjtcblx0aXNCdWlsdGluPzogYm9vbGVhbjtcblx0dmlld3M/OiB7IHdoZW4/OiBzdHJpbmcgfVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElQYW5lQ29tcG9zaXRlQmFyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHBhcnRDb250YWluZXJDbGFzczogc3RyaW5nO1xuXHRyZWFkb25seSBwaW5uZWRWaWV3Q29udGFpbmVyc0tleTogc3RyaW5nO1xuXHRyZWFkb25seSBwbGFjZWhvbGRlclZpZXdDb250YWluZXJzS2V5OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVLZXk6IHN0cmluZztcblx0cmVhZG9ubHkgaWNvbjogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29tcGFjdD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGljb25TaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlY29tcHV0ZVNpemVzOiBib29sZWFuO1xuXHRyZWFkb25seSBvcmllbnRhdGlvbjogQWN0aW9uc09yaWVudGF0aW9uO1xuXHRyZWFkb25seSBjb21wb3NpdGVTaXplOiBudW1iZXI7XG5cdHJlYWRvbmx5IG92ZXJmbG93QWN0aW9uU2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSBwcmV2ZW50TG9vcE5hdmlnYXRpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBhY3Rpdml0eUhvdmVyT3B0aW9uczogSUFjdGl2aXR5SG92ZXJPcHRpb25zO1xuXHRyZWFkb25seSBmaWxsRXh0cmFDb250ZXh0TWVudUFjdGlvbnM6IChhY3Rpb25zOiBJQWN0aW9uW10sIGU/OiBNb3VzZUV2ZW50IHwgR2VzdHVyZUV2ZW50KSA9PiB2b2lkO1xuXHRyZWFkb25seSBjb2xvcnM6ICh0aGVtZTogSUNvbG9yVGhlbWUpID0+IElDb21wb3NpdGVCYXJDb2xvcnM7XG59XG5cbmV4cG9ydCBjbGFzcyBQYW5lQ29tcG9zaXRlQmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3Q29udGFpbmVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNvbXBvc2l0ZUJhcjogQ29tcG9zaXRlQmFyO1xuXHRyZWFkb25seSBkbmRIYW5kbGVyOiBJQ29tcG9zaXRlRHJhZ0FuZERyb3A7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29tcG9zaXRlQWN0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgeyBhY3Rpdml0eUFjdGlvbjogVmlld0NvbnRhaW5lckFjdGl2aXR5QWN0aW9uOyBwaW5uZWRBY3Rpb246IFRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbjsgYmFkZ2VBY3Rpb246IFRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uOyBkaXNwb3NlOiAoKSA9PiB2b2lkIH0+KCkpO1xuXG5cdHByaXZhdGUgaGFzRXh0ZW5zaW9uc1JlZ2lzdGVyZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IG9wdGlvbnM6IElQYW5lQ29tcG9zaXRlQmFyT3B0aW9ucyxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgcGFydDogUGFydHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBwYW5lQ29tcG9zaXRlUGFydDogSVBhbmVDb21wb3NpdGVQYXJ0LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3U2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRuZEhhbmRsZXIgPSBuZXcgQ29tcG9zaXRlRHJhZ0FuZERyb3AodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UsIHRoaXMubG9jYXRpb24sIHRoaXMub3B0aW9ucy5vcmllbnRhdGlvbixcblx0XHRcdGFzeW5jIChpZDogc3RyaW5nLCBmb2N1cz86IGJvb2xlYW4pID0+IHsgcmV0dXJuIGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQub3BlblBhbmVDb21wb3NpdGUoaWQsIGZvY3VzKSA/PyBudWxsOyB9LFxuXHRcdFx0KGZyb206IHN0cmluZywgdG86IHN0cmluZywgYmVmb3JlPzogQmVmb3JlMkQpID0+IHRoaXMuY29tcG9zaXRlQmFyLm1vdmUoZnJvbSwgdG8sIHRoaXMub3B0aW9ucy5vcmllbnRhdGlvbiA9PT0gQWN0aW9uc09yaWVudGF0aW9uLlZFUlRJQ0FMID8gYmVmb3JlPy52ZXJ0aWNhbGx5QmVmb3JlIDogYmVmb3JlPy5ob3Jpem9udGFsbHlCZWZvcmUpLFxuXHRcdFx0KCkgPT4gdGhpcy5jb21wb3NpdGVCYXIuZ2V0Q29tcG9zaXRlQmFySXRlbXMoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY2FjaGVkSXRlbXMgPSB0aGlzLmNhY2hlZFZpZXdDb250YWluZXJzXG5cdFx0XHQubWFwKGNvbnRhaW5lciA9PiAoe1xuXHRcdFx0XHRpZDogY29udGFpbmVyLmlkLFxuXHRcdFx0XHRuYW1lOiBjb250YWluZXIubmFtZSxcblx0XHRcdFx0dmlzaWJsZTogIXRoaXMuc2hvdWxkQmVIaWRkZW4oY29udGFpbmVyLmlkLCBjb250YWluZXIpLFxuXHRcdFx0XHRvcmRlcjogY29udGFpbmVyLm9yZGVyLFxuXHRcdFx0XHRwaW5uZWQ6IGNvbnRhaW5lci5waW5uZWQsXG5cdFx0XHR9KSk7XG5cdFx0dGhpcy5jb21wb3NpdGVCYXIgPSB0aGlzLmNyZWF0ZUNvbXBvc2l0ZUJhcihjYWNoZWRJdGVtcyk7XG5cdFx0dGhpcy5vbkRpZFJlZ2lzdGVyVmlld0NvbnRhaW5lcnModGhpcy5nZXRWaWV3Q29udGFpbmVycygpKTtcblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvbXBvc2l0ZUJhcihjYWNoZWRJdGVtczogSUNvbXBvc2l0ZUJhckl0ZW1bXSkge1xuXHRcdHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbXBvc2l0ZUJhciwgY2FjaGVkSXRlbXMsIHtcblx0XHRcdGljb246IHRoaXMub3B0aW9ucy5pY29uLFxuXHRcdFx0Y29tcGFjdDogdGhpcy5vcHRpb25zLmNvbXBhY3QsXG5cdFx0XHRvcmllbnRhdGlvbjogdGhpcy5vcHRpb25zLm9yaWVudGF0aW9uLFxuXHRcdFx0YWN0aXZpdHlIb3Zlck9wdGlvbnM6IHRoaXMub3B0aW9ucy5hY3Rpdml0eUhvdmVyT3B0aW9ucyxcblx0XHRcdHByZXZlbnRMb29wTmF2aWdhdGlvbjogdGhpcy5vcHRpb25zLnByZXZlbnRMb29wTmF2aWdhdGlvbixcblx0XHRcdG9wZW5Db21wb3NpdGU6IGFzeW5jIChjb21wb3NpdGVJZCwgcHJlc2VydmVGb2N1cykgPT4ge1xuXHRcdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQub3BlblBhbmVDb21wb3NpdGUoY29tcG9zaXRlSWQsICFwcmVzZXJ2ZUZvY3VzKSkgPz8gbnVsbDtcblx0XHRcdH0sXG5cdFx0XHRnZXRBY3Rpdml0eUFjdGlvbjogY29tcG9zaXRlSWQgPT4gdGhpcy5nZXRDb21wb3NpdGVBY3Rpb25zKGNvbXBvc2l0ZUlkKS5hY3Rpdml0eUFjdGlvbixcblx0XHRcdGdldENvbXBvc2l0ZVBpbm5lZEFjdGlvbjogY29tcG9zaXRlSWQgPT4gdGhpcy5nZXRDb21wb3NpdGVBY3Rpb25zKGNvbXBvc2l0ZUlkKS5waW5uZWRBY3Rpb24sXG5cdFx0XHRnZXRDb21wb3NpdGVCYWRnZUFjdGlvbjogY29tcG9zaXRlSWQgPT4gdGhpcy5nZXRDb21wb3NpdGVBY3Rpb25zKGNvbXBvc2l0ZUlkKS5iYWRnZUFjdGlvbixcblx0XHRcdGdldE9uQ29tcG9zaXRlQ2xpY2tBY3Rpb246IGNvbXBvc2l0ZUlkID0+IHRoaXMuZ2V0Q29tcG9zaXRlQWN0aW9ucyhjb21wb3NpdGVJZCkuYWN0aXZpdHlBY3Rpb24sXG5cdFx0XHRmaWxsRXh0cmFDb250ZXh0TWVudUFjdGlvbnM6IChhY3Rpb25zLCBlKSA9PiB0aGlzLm9wdGlvbnMuZmlsbEV4dHJhQ29udGV4dE1lbnVBY3Rpb25zKGFjdGlvbnMsIGUpLFxuXHRcdFx0Z2V0Q29udGV4dE1lbnVBY3Rpb25zRm9yQ29tcG9zaXRlOiBjb21wb3NpdGVJZCA9PiB0aGlzLmdldENvbnRleHRNZW51QWN0aW9uc0ZvckNvbXBvc2l0ZShjb21wb3NpdGVJZCksXG5cdFx0XHRnZXREZWZhdWx0Q29tcG9zaXRlSWQ6ICgpID0+IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyKHRoaXMubG9jYXRpb24pPy5pZCxcblx0XHRcdGRuZEhhbmRsZXI6IHRoaXMuZG5kSGFuZGxlcixcblx0XHRcdGNvbXBvc2l0ZVNpemU6IHRoaXMub3B0aW9ucy5jb21wb3NpdGVTaXplLFxuXHRcdFx0b3ZlcmZsb3dBY3Rpb25TaXplOiB0aGlzLm9wdGlvbnMub3ZlcmZsb3dBY3Rpb25TaXplLFxuXHRcdFx0Y29sb3JzOiB0aGVtZSA9PiB0aGlzLm9wdGlvbnMuY29sb3JzKHRoZW1lKSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRleHRNZW51QWN0aW9uc0ZvckNvbXBvc2l0ZShjb21wb3NpdGVJZDogc3RyaW5nKTogSUFjdGlvbltdIHtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbbmV3IFNlcGFyYXRvcigpXTtcblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlJZChjb21wb3NpdGVJZCkhO1xuXHRcdGNvbnN0IGRlZmF1bHRMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcikhO1xuXHRcdGNvbnN0IGN1cnJlbnRMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblxuXHRcdC8vIE1vdmUgVmlldyBDb250YWluZXJcblx0XHRjb25zdCBtb3ZlQWN0aW9ucyA9IFtdO1xuXHRcdGZvciAoY29uc3QgbG9jYXRpb24gb2YgW1ZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWxdKSB7XG5cdFx0XHRpZiAoY3VycmVudExvY2F0aW9uICE9PSBsb2NhdGlvbikge1xuXHRcdFx0XHRtb3ZlQWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlTW92ZUFjdGlvbih2aWV3Q29udGFpbmVyLCBsb2NhdGlvbiwgZGVmYXVsdExvY2F0aW9uKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YWN0aW9ucy5wdXNoKG5ldyBTdWJtZW51QWN0aW9uKCdtb3ZlVG9NZW51JywgbG9jYWxpemUoJ21vdmVUb01lbnUnLCBcIk1vdmUgVG9cIiksIG1vdmVBY3Rpb25zKSk7XG5cblx0XHQvLyBSZXNldCBMb2NhdGlvblxuXHRcdGlmIChkZWZhdWx0TG9jYXRpb24gIT09IGN1cnJlbnRMb2NhdGlvbikge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0aWQ6ICdyZXNldExvY2F0aW9uQWN0aW9uJywgbGFiZWw6IGxvY2FsaXplKCdyZXNldExvY2F0aW9uJywgXCJSZXNldCBMb2NhdGlvblwiKSwgcnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdDb250YWluZXJUb0xvY2F0aW9uKHZpZXdDb250YWluZXIsIGRlZmF1bHRMb2NhdGlvbiwgdW5kZWZpbmVkLCAncmVzZXRMb2NhdGlvbkFjdGlvbicpO1xuXHRcdFx0XHRcdHRoaXMudmlld1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIodmlld0NvbnRhaW5lci5pZCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpO1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXJNb2RlbC5hbGxWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdUb1Jlc2V0ID0gdmlld0NvbnRhaW5lck1vZGVsLmFsbFZpZXdEZXNjcmlwdG9yc1swXTtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdENvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRDb250YWluZXJCeUlkKHZpZXdUb1Jlc2V0LmlkKSE7XG5cdFx0XHRcdGlmIChkZWZhdWx0Q29udGFpbmVyICE9PSB2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0YWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdGlkOiAncmVzZXRMb2NhdGlvbkFjdGlvbicsIGxhYmVsOiBsb2NhbGl6ZSgncmVzZXRMb2NhdGlvbicsIFwiUmVzZXQgTG9jYXRpb25cIiksIHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld1RvUmVzZXRdLCBkZWZhdWx0Q29udGFpbmVyLCB1bmRlZmluZWQsICdyZXNldExvY2F0aW9uQWN0aW9uJyk7XG5cdFx0XHRcdFx0XHRcdHRoaXMudmlld1NlcnZpY2Uub3BlblZpZXdDb250YWluZXIodmlld0NvbnRhaW5lci5pZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU1vdmVBY3Rpb24odmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgbmV3TG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiwgZGVmYXVsdExvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gdG9BY3Rpb24oe1xuXHRcdFx0aWQ6IGBtb3ZlVmlld0NvbnRhaW5lclRvJHtuZXdMb2NhdGlvbn1gLFxuXHRcdFx0bGFiZWw6IG5ld0xvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwgPyBsb2NhbGl6ZSgncGFuZWwnLCBcIlBhbmVsXCIpIDogbmV3TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyID8gbG9jYWxpemUoJ3NpZGViYXInLCBcIlByaW1hcnkgU2lkZSBCYXJcIikgOiBsb2NhbGl6ZSgnYXV4aWxpYXJ5YmFyJywgXCJTZWNvbmRhcnkgU2lkZSBCYXJcIiksXG5cdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0bGV0IGluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChuZXdMb2NhdGlvbiAhPT0gZGVmYXVsdExvY2F0aW9uKSB7XG5cdFx0XHRcdFx0aW5kZXggPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24obmV3TG9jYXRpb24pLmxlbmd0aDsgLy8gbW92ZSB0byB0aGUgZW5kIG9mIHRoZSBsb2NhdGlvblxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGluZGV4ID0gdW5kZWZpbmVkOyAvLyByZXN0b3JlIGRlZmF1bHQgbG9jYXRpb25cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5tb3ZlVmlld0NvbnRhaW5lclRvTG9jYXRpb24odmlld0NvbnRhaW5lciwgbmV3TG9jYXRpb24sIGluZGV4KTtcblx0XHRcdFx0dGhpcy52aWV3U2VydmljZS5vcGVuVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyLmlkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBWaWV3IENvbnRhaW5lciBDaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VWaWV3Q29udGFpbmVycygoeyBhZGRlZCwgcmVtb3ZlZCB9KSA9PiB0aGlzLm9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lcnMoYWRkZWQsIHJlbW92ZWQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2Uub25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbigoeyB2aWV3Q29udGFpbmVyLCBmcm9tLCB0byB9KSA9PiB0aGlzLm9uRGlkQ2hhbmdlVmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIsIGZyb20sIHRvKSkpO1xuXG5cdFx0Ly8gVmlldyBDb250YWluZXIgVmlzaWJpbGl0eSBDaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5wYW5lQ29tcG9zaXRlUGFydC5vbkRpZFBhbmVDb21wb3NpdGVPcGVuKGUgPT4gdGhpcy5vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5KGUuZ2V0SWQoKSwgdHJ1ZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBhbmVDb21wb3NpdGVQYXJ0Lm9uRGlkUGFuZUNvbXBvc2l0ZUNsb3NlKGUgPT4gdGhpcy5vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5KGUuZ2V0SWQoKSwgZmFsc2UpKSk7XG5cblx0XHQvLyBFeHRlbnNpb24gcmVnaXN0cmF0aW9uXG5cdFx0dGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5vbkRpZFJlZ2lzdGVyRXh0ZW5zaW9ucygpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb21wb3NpdGVCYXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZUJhckl0ZW1zRnJvbVN0b3JhZ2UodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2F2ZUNhY2hlZFZpZXdDb250YWluZXJzKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHRoaXMub3B0aW9ucy5waW5uZWRWaWV3Q29udGFpbmVyc0tleSwgdGhpcy5fc3RvcmUpKCgpID0+IHRoaXMudXBkYXRlQ29tcG9zaXRlQmFySXRlbXNGcm9tU3RvcmFnZShmYWxzZSkpKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVycyhhZGRlZDogcmVhZG9ubHkgeyBjb250YWluZXI6IFZpZXdDb250YWluZXI7IGxvY2F0aW9uOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfVtdLCByZW1vdmVkOiByZWFkb25seSB7IGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcjsgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiB9W10pIHtcblx0XHRyZW1vdmVkLmZpbHRlcigoeyBsb2NhdGlvbiB9KSA9PiBsb2NhdGlvbiA9PT0gdGhpcy5sb2NhdGlvbikuZm9yRWFjaCgoeyBjb250YWluZXIgfSkgPT4gdGhpcy5vbkRpZERlcmVnaXN0ZXJWaWV3Q29udGFpbmVyKGNvbnRhaW5lcikpO1xuXHRcdHRoaXMub25EaWRSZWdpc3RlclZpZXdDb250YWluZXJzKGFkZGVkLmZpbHRlcigoeyBsb2NhdGlvbiB9KSA9PiBsb2NhdGlvbiA9PT0gdGhpcy5sb2NhdGlvbikubWFwKCh7IGNvbnRhaW5lciB9KSA9PiBjb250YWluZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyTG9jYXRpb24oY29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCBmcm9tOiBWaWV3Q29udGFpbmVyTG9jYXRpb24sIHRvOiBWaWV3Q29udGFpbmVyTG9jYXRpb24pIHtcblx0XHRpZiAoZnJvbSA9PT0gdGhpcy5sb2NhdGlvbikge1xuXHRcdFx0dGhpcy5vbkRpZERlcmVnaXN0ZXJWaWV3Q29udGFpbmVyKGNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0aWYgKHRvID09PSB0aGlzLmxvY2F0aW9uKSB7XG5cdFx0XHR0aGlzLm9uRGlkUmVnaXN0ZXJWaWV3Q29udGFpbmVycyhbY29udGFpbmVyXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5KGlkOiBzdHJpbmcsIHZpc2libGU6IGJvb2xlYW4pIHtcblx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0Ly8gQWN0aXZhdGUgdmlldyBjb250YWluZXIgYWN0aW9uIG9uIG9wZW5pbmcgb2YgYSB2aWV3IGNvbnRhaW5lclxuXHRcdFx0dGhpcy5vbkRpZFZpZXdDb250YWluZXJWaXNpYmxlKGlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRGVhY3RpdmF0ZSB2aWV3IGNvbnRhaW5lciBhY3Rpb24gb24gY2xvc2Vcblx0XHRcdHRoaXMuY29tcG9zaXRlQmFyLmRlYWN0aXZhdGVDb21wb3NpdGUoaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRSZWdpc3RlckV4dGVuc2lvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5oYXNFeHRlbnNpb25zUmVnaXN0ZXJlZCA9IHRydWU7XG5cblx0XHQvLyBzaG93L2hpZGUvcmVtb3ZlIGNvbXBvc2l0ZXNcblx0XHRmb3IgKGNvbnN0IHsgaWQgfSBvZiB0aGlzLmNhY2hlZFZpZXdDb250YWluZXJzKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyKGlkKTtcblx0XHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuc2hvd09ySGlkZVZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuaXNWaWV3Q29udGFpbmVyUmVtb3ZlZFBlcm1hbmVudGx5KGlkKSkge1xuXHRcdFx0XHRcdHRoaXMucmVtb3ZlQ29tcG9zaXRlKGlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmhpZGVDb21wb3NpdGUoaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zYXZlQ2FjaGVkVmlld0NvbnRhaW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRWaWV3Q29udGFpbmVyVmlzaWJsZShpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMuZ2V0Vmlld0NvbnRhaW5lcihpZCk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblxuXHRcdFx0Ly8gVXBkYXRlIHRoZSBjb21wb3NpdGUgYmFyIGJ5IGFkZGluZ1xuXHRcdFx0dGhpcy5hZGRDb21wb3NpdGUodmlld0NvbnRhaW5lcik7XG5cdFx0XHR0aGlzLmNvbXBvc2l0ZUJhci5hY3RpdmF0ZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblxuXHRcdFx0aWYgKHRoaXMuc2hvdWxkQmVIaWRkZW4odmlld0NvbnRhaW5lcikpIHtcblx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpO1xuXHRcdFx0XHRpZiAodmlld0NvbnRhaW5lck1vZGVsLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHQvLyBVcGRhdGUgdGhlIGNvbXBvc2l0ZSBiYXIgYnkgaGlkaW5nXG5cdFx0XHRcdFx0dGhpcy5oaWRlQ29tcG9zaXRlKHZpZXdDb250YWluZXIuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLmNyZWF0ZShwYXJlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21wb3NpdGVBY3Rpb25zKGNvbXBvc2l0ZUlkOiBzdHJpbmcpOiB7IGFjdGl2aXR5QWN0aW9uOiBWaWV3Q29udGFpbmVyQWN0aXZpdHlBY3Rpb247IHBpbm5lZEFjdGlvbjogVG9nZ2xlQ29tcG9zaXRlUGlubmVkQWN0aW9uOyBiYWRnZUFjdGlvbjogVG9nZ2xlQ29tcG9zaXRlQmFkZ2VBY3Rpb24gfSB7XG5cdFx0bGV0IGNvbXBvc2l0ZUFjdGlvbnMgPSB0aGlzLmNvbXBvc2l0ZUFjdGlvbnMuZ2V0KGNvbXBvc2l0ZUlkKTtcblx0XHRpZiAoIWNvbXBvc2l0ZUFjdGlvbnMpIHtcblx0XHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLmdldFZpZXdDb250YWluZXIoY29tcG9zaXRlSWQpO1xuXHRcdFx0bGV0IGFjdGl2aXR5QWN0aW9uOiBWaWV3Q29udGFpbmVyQWN0aXZpdHlBY3Rpb247XG5cdFx0XHRsZXQgcGlubmVkQWN0aW9uOiBUb2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb247XG5cdFx0XHRsZXQgYmFkZ2VBY3Rpb246IFRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uO1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpO1xuXHRcdFx0XHRjb25zdCBhY3Rpb25JdGVtID0gdGhpcy50b0NvbXBvc2l0ZUJhckFjdGlvbkl0ZW1Gcm9tKHZpZXdDb250YWluZXJNb2RlbCk7XG5cdFx0XHRcdGFjdGl2aXR5QWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3Q29udGFpbmVyQWN0aXZpdHlBY3Rpb24sIGFjdGlvbkl0ZW0sIHRoaXMucGFydCwgdGhpcy5wYW5lQ29tcG9zaXRlUGFydCk7XG5cdFx0XHRcdHBpbm5lZEFjdGlvbiA9IG5ldyBUb2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24oYWN0aW9uSXRlbSwgdGhpcy5jb21wb3NpdGVCYXIpO1xuXHRcdFx0XHRiYWRnZUFjdGlvbiA9IG5ldyBUb2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbihhY3Rpb25JdGVtLCB0aGlzLmNvbXBvc2l0ZUJhcik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjYWNoZWRDb21wb3NpdGUgPSB0aGlzLmNhY2hlZFZpZXdDb250YWluZXJzLmZpbHRlcihjID0+IGMuaWQgPT09IGNvbXBvc2l0ZUlkKVswXTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uSXRlbSA9IHRoaXMudG9Db21wb3NpdGVCYXJBY3Rpb25JdGVtKGNvbXBvc2l0ZUlkLCBjYWNoZWRDb21wb3NpdGU/Lm5hbWUgPz8gY29tcG9zaXRlSWQsIGNhY2hlZENvbXBvc2l0ZT8uaWNvbiwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YWN0aXZpdHlBY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsYWNlSG9sZGVyVmlld0NvbnRhaW5lckFjdGl2aXR5QWN0aW9uLCBhY3Rpb25JdGVtLCB0aGlzLnBhcnQsIHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQpO1xuXHRcdFx0XHRwaW5uZWRBY3Rpb24gPSBuZXcgUGxhY2VIb2xkZXJUb2dnbGVDb21wb3NpdGVQaW5uZWRBY3Rpb24oY29tcG9zaXRlSWQsIHRoaXMuY29tcG9zaXRlQmFyKTtcblx0XHRcdFx0YmFkZ2VBY3Rpb24gPSBuZXcgUGxhY2VIb2xkZXJUb2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbihjb21wb3NpdGVJZCwgdGhpcy5jb21wb3NpdGVCYXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gY29tYmluZWREaXNwb3NhYmxlKGFjdGl2aXR5QWN0aW9uLCBwaW5uZWRBY3Rpb24sIGJhZGdlQWN0aW9uKTtcblx0XHRcdGNvbXBvc2l0ZUFjdGlvbnMgPSB7IGFjdGl2aXR5QWN0aW9uLCBwaW5uZWRBY3Rpb24sIGJhZGdlQWN0aW9uLCBkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSB9O1xuXHRcdFx0dGhpcy5jb21wb3NpdGVBY3Rpb25zLnNldChjb21wb3NpdGVJZCwgY29tcG9zaXRlQWN0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXBvc2l0ZUFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkUmVnaXN0ZXJWaWV3Q29udGFpbmVycyh2aWV3Q29udGFpbmVyczogcmVhZG9ubHkgVmlld0NvbnRhaW5lcltdKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB2aWV3Q29udGFpbmVyIG9mIHZpZXdDb250YWluZXJzKSB7XG5cdFx0XHR0aGlzLmFkZENvbXBvc2l0ZSh2aWV3Q29udGFpbmVyKTtcblxuXHRcdFx0Ly8gUGluIGl0IGJ5IGRlZmF1bHQgaWYgaXQgaXMgbmV3XG5cdFx0XHRjb25zdCBjYWNoZWRWaWV3Q29udGFpbmVyID0gdGhpcy5jYWNoZWRWaWV3Q29udGFpbmVycy5maWx0ZXIoKHsgaWQgfSkgPT4gaWQgPT09IHZpZXdDb250YWluZXIuaWQpWzBdO1xuXHRcdFx0aWYgKCFjYWNoZWRWaWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdHRoaXMuY29tcG9zaXRlQmFyLnBpbih2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQWN0aXZlXG5cdFx0XHRjb25zdCB2aXNpYmxlVmlld0NvbnRhaW5lciA9IHRoaXMucGFuZUNvbXBvc2l0ZVBhcnQuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSgpO1xuXHRcdFx0aWYgKHZpc2libGVWaWV3Q29udGFpbmVyPy5nZXRJZCgpID09PSB2aWV3Q29udGFpbmVyLmlkKSB7XG5cdFx0XHRcdHRoaXMuY29tcG9zaXRlQmFyLmFjdGl2YXRlQ29tcG9zaXRlKHZpZXdDb250YWluZXIuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cdFx0XHR0aGlzLnVwZGF0ZUNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0odmlld0NvbnRhaW5lciwgdmlld0NvbnRhaW5lck1vZGVsKTtcblx0XHRcdHRoaXMuc2hvd09ySGlkZVZpZXdDb250YWluZXIodmlld0NvbnRhaW5lcik7XG5cblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdDb250YWluZXJNb2RlbC5vbkRpZENoYW5nZUNvbnRhaW5lckluZm8oKCkgPT4gdGhpcy51cGRhdGVDb21wb3NpdGVCYXJBY3Rpb25JdGVtKHZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJNb2RlbCkpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3Q29udGFpbmVyTW9kZWwub25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnMoKCkgPT4gdGhpcy5zaG93T3JIaWRlVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyKSkpO1xuXG5cdFx0XHR0aGlzLnZpZXdDb250YWluZXJEaXNwb3NhYmxlcy5zZXQodmlld0NvbnRhaW5lci5pZCwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWREZXJlZ2lzdGVyVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3Q29udGFpbmVyRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0XHR0aGlzLnJlbW92ZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSh2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCB2aWV3Q29udGFpbmVyTW9kZWw6IElWaWV3Q29udGFpbmVyTW9kZWwpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wb3NpdGVCYXJBY3Rpb25JdGVtID0gdGhpcy50b0NvbXBvc2l0ZUJhckFjdGlvbkl0ZW1Gcm9tKHZpZXdDb250YWluZXJNb2RlbCk7XG5cdFx0Y29uc3QgeyBhY3Rpdml0eUFjdGlvbiwgcGlubmVkQWN0aW9uIH0gPSB0aGlzLmdldENvbXBvc2l0ZUFjdGlvbnModmlld0NvbnRhaW5lci5pZCk7XG5cdFx0YWN0aXZpdHlBY3Rpb24udXBkYXRlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbShjb21wb3NpdGVCYXJBY3Rpb25JdGVtKTtcblxuXHRcdGlmIChwaW5uZWRBY3Rpb24gaW5zdGFuY2VvZiBQbGFjZUhvbGRlclRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbikge1xuXHRcdFx0cGlubmVkQWN0aW9uLnNldEFjdGl2aXR5KGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0pO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9wdGlvbnMucmVjb21wdXRlU2l6ZXMpIHtcblx0XHRcdHRoaXMuY29tcG9zaXRlQmFyLnJlY29tcHV0ZVNpemVzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zYXZlQ2FjaGVkVmlld0NvbnRhaW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgdG9Db21wb3NpdGVCYXJBY3Rpb25JdGVtRnJvbSh2aWV3Q29udGFpbmVyTW9kZWw6IElWaWV3Q29udGFpbmVyTW9kZWwpOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSB7XG5cdFx0cmV0dXJuIHRoaXMudG9Db21wb3NpdGVCYXJBY3Rpb25JdGVtKHZpZXdDb250YWluZXJNb2RlbC52aWV3Q29udGFpbmVyLmlkLCB2aWV3Q29udGFpbmVyTW9kZWwudGl0bGUsIHZpZXdDb250YWluZXJNb2RlbC5pY29uLCB2aWV3Q29udGFpbmVyTW9kZWwua2V5YmluZGluZ0lkKTtcblx0fVxuXG5cdHByaXZhdGUgdG9Db21wb3NpdGVCYXJBY3Rpb25JdGVtKGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgaWNvbjogVVJJIHwgVGhlbWVJY29uIHwgdW5kZWZpbmVkLCBrZXliaW5kaW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElDb21wb3NpdGVCYXJBY3Rpb25JdGVtIHtcblx0XHRsZXQgY2xhc3NOYW1lczogc3RyaW5nW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGljb25Vcmw6IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5vcHRpb25zLmljb24pIHtcblx0XHRcdGlmIChVUkkuaXNVcmkoaWNvbikpIHtcblx0XHRcdFx0aWNvblVybCA9IGljb247XG5cdFx0XHRcdGNvbnN0IGNzc1VybCA9IGFzQ1NTVXJsKGljb24pO1xuXHRcdFx0XHRjb25zdCBoYXNoID0gbmV3IFN0cmluZ1NIQTEoKTtcblx0XHRcdFx0aGFzaC51cGRhdGUoY3NzVXJsKTtcblx0XHRcdFx0Y29uc3QgaWNvbklkID0gYGFjdGl2aXR5LSR7aWQucmVwbGFjZSgvXFwuL2csICctJyl9LSR7aGFzaC5kaWdlc3QoKX1gO1xuXHRcdFx0XHRjb25zdCBpY29uQ2xhc3MgPSBgLm1vbmFjby13b3JrYmVuY2ggLiR7dGhpcy5vcHRpb25zLnBhcnRDb250YWluZXJDbGFzc30gLm1vbmFjby1hY3Rpb24tYmFyIC5hY3Rpb24tbGFiZWwuJHtpY29uSWR9YDtcblx0XHRcdFx0Y2xhc3NOYW1lcyA9IFtpY29uSWQsICd1cmktaWNvbiddO1xuXHRcdFx0XHRjcmVhdGVDU1NSdWxlKGljb25DbGFzcywgYFxuXHRcdFx0XHRtYXNrOiAke2Nzc1VybH0gbm8tcmVwZWF0IDUwJSA1MCU7XG5cdFx0XHRcdG1hc2stc2l6ZTogdmFyKC0tYWN0aXZpdHktYmFyLWljb24tc2l6ZSwgJHt0aGlzLm9wdGlvbnMuaWNvblNpemV9cHgpO1xuXHRcdFx0XHQtd2Via2l0LW1hc2s6ICR7Y3NzVXJsfSBuby1yZXBlYXQgNTAlIDUwJTtcblx0XHRcdFx0LXdlYmtpdC1tYXNrLXNpemU6IHZhcigtLWFjdGl2aXR5LWJhci1pY29uLXNpemUsICR7dGhpcy5vcHRpb25zLmljb25TaXplfXB4KTtcblx0XHRcdFx0bWFzay1vcmlnaW46IHBhZGRpbmc7XG5cdFx0XHRcdC13ZWJraXQtbWFzay1vcmlnaW46IHBhZGRpbmc7XG5cdFx0XHRgKTtcblx0XHRcdH0gZWxzZSBpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHRcdGNsYXNzTmFtZXMgPSBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShpY29uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBpZCwgbmFtZSwgY2xhc3NOYW1lcywgaWNvblVybCwga2V5YmluZGluZ0lkIH07XG5cdH1cblxuXHRwcml2YXRlIHNob3dPckhpZGVWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zaG91bGRCZUhpZGRlbih2aWV3Q29udGFpbmVyKSkge1xuXHRcdFx0dGhpcy5oaWRlQ29tcG9zaXRlKHZpZXdDb250YWluZXIuaWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmFkZENvbXBvc2l0ZSh2aWV3Q29udGFpbmVyKTtcblxuXHRcdFx0Ly8gQWN0aXZhdGUgaWYgdGhpcyBpcyB0aGUgYWN0aXZlIHBhbmUgY29tcG9zaXRlXG5cdFx0XHRjb25zdCBhY3RpdmVQYW5lQ29tcG9zaXRlID0gdGhpcy5wYW5lQ29tcG9zaXRlUGFydC5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKCk7XG5cdFx0XHRpZiAoYWN0aXZlUGFuZUNvbXBvc2l0ZT8uZ2V0SWQoKSA9PT0gdmlld0NvbnRhaW5lci5pZCkge1xuXHRcdFx0XHR0aGlzLmNvbXBvc2l0ZUJhci5hY3RpdmF0ZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLmlkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3VsZEJlSGlkZGVuKHZpZXdDb250YWluZXJPcklkOiBzdHJpbmcgfCBWaWV3Q29udGFpbmVyLCBjYWNoZWRWaWV3Q29udGFpbmVyPzogSUNhY2hlZFZpZXdDb250YWluZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gaXNTdHJpbmcodmlld0NvbnRhaW5lck9ySWQpID8gdGhpcy5nZXRWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXJPcklkKSA6IHZpZXdDb250YWluZXJPcklkO1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXJJZCA9IGlzU3RyaW5nKHZpZXdDb250YWluZXJPcklkKSA/IHZpZXdDb250YWluZXJPcklkIDogdmlld0NvbnRhaW5lck9ySWQuaWQ7XG5cblx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIuaGlkZUlmRW1wdHkpIHtcblx0XHRcdFx0aWYgKHRoaXMudmlld1NlcnZpY2UuaXNWaWV3Q29udGFpbmVyQWN0aXZlKHZpZXdDb250YWluZXJJZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayBjYWNoZSBvbmx5IGlmIGV4dGVuc2lvbnMgYXJlIG5vdCB5ZXQgcmVnaXN0ZXJlZCBhbmQgY3VycmVudCB3aW5kb3cgaXMgbm90IG5hdGl2ZSAoZGVza3RvcCkgcmVtb3RlIGNvbm5lY3Rpb24gd2luZG93XG5cdFx0aWYgKCF0aGlzLmhhc0V4dGVuc2lvbnNSZWdpc3RlcmVkICYmICEodGhpcy5wYXJ0ID09PSBQYXJ0cy5TSURFQkFSX1BBUlQgJiYgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5ICYmIGlzTmF0aXZlKSkge1xuXHRcdFx0Y2FjaGVkVmlld0NvbnRhaW5lciA9IGNhY2hlZFZpZXdDb250YWluZXIgfHwgdGhpcy5jYWNoZWRWaWV3Q29udGFpbmVycy5maW5kKCh7IGlkIH0pID0+IGlkID09PSB2aWV3Q29udGFpbmVySWQpO1xuXG5cdFx0XHQvLyBTaG93IGJ1aWx0aW4gVmlld0NvbnRhaW5lciBpZiBub3QgcmVnaXN0ZXJlZCB5ZXRcblx0XHRcdGlmICghdmlld0NvbnRhaW5lciAmJiBjYWNoZWRWaWV3Q29udGFpbmVyPy5pc0J1aWx0aW4gJiYgY2FjaGVkVmlld0NvbnRhaW5lcj8udmlzaWJsZSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjYWNoZWRWaWV3Q29udGFpbmVyPy52aWV3cz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiBjYWNoZWRWaWV3Q29udGFpbmVyLnZpZXdzLmV2ZXJ5KCh7IHdoZW4gfSkgPT4gISF3aGVuICYmICF0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQ29udGV4dEtleUV4cHIuZGVzZXJpYWxpemUod2hlbikpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYWRkQ29tcG9zaXRlKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBvc2l0ZUJhci5hZGRDb21wb3NpdGUoeyBpZDogdmlld0NvbnRhaW5lci5pZCwgbmFtZTogdHlwZW9mIHZpZXdDb250YWluZXIudGl0bGUgPT09ICdzdHJpbmcnID8gdmlld0NvbnRhaW5lci50aXRsZSA6IHZpZXdDb250YWluZXIudGl0bGUudmFsdWUsIG9yZGVyOiB2aWV3Q29udGFpbmVyLm9yZGVyLCByZXF1ZXN0ZWRJbmRleDogdmlld0NvbnRhaW5lci5yZXF1ZXN0ZWRJbmRleCB9KTtcblx0fVxuXG5cdHByaXZhdGUgaGlkZUNvbXBvc2l0ZShjb21wb3NpdGVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wb3NpdGVCYXIuaGlkZUNvbXBvc2l0ZShjb21wb3NpdGVJZCk7XG5cblx0XHRjb25zdCBjb21wb3NpdGVBY3Rpb25zID0gdGhpcy5jb21wb3NpdGVBY3Rpb25zLmdldChjb21wb3NpdGVJZCk7XG5cdFx0aWYgKGNvbXBvc2l0ZUFjdGlvbnMpIHtcblx0XHRcdHRoaXMuY29tcG9zaXRlQWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKGNvbXBvc2l0ZUlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUNvbXBvc2l0ZShjb21wb3NpdGVJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5jb21wb3NpdGVCYXIucmVtb3ZlQ29tcG9zaXRlKGNvbXBvc2l0ZUlkKTtcblxuXHRcdGNvbnN0IGNvbXBvc2l0ZUFjdGlvbnMgPSB0aGlzLmNvbXBvc2l0ZUFjdGlvbnMuZ2V0KGNvbXBvc2l0ZUlkKTtcblx0XHRpZiAoY29tcG9zaXRlQWN0aW9ucykge1xuXHRcdFx0dGhpcy5jb21wb3NpdGVBY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UoY29tcG9zaXRlSWQpO1xuXHRcdH1cblx0fVxuXG5cdGdldFBpbm5lZFBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHBpbm5lZENvbXBvc2l0ZUlkcyA9IHRoaXMuY29tcG9zaXRlQmFyLmdldFBpbm5lZENvbXBvc2l0ZXMoKS5tYXAodiA9PiB2LmlkKTtcblx0XHRyZXR1cm4gdGhpcy5nZXRWaWV3Q29udGFpbmVycygpXG5cdFx0XHQuZmlsdGVyKHYgPT4gdGhpcy5jb21wb3NpdGVCYXIuaXNQaW5uZWQodi5pZCkpXG5cdFx0XHQuc29ydCgodjEsIHYyKSA9PiBwaW5uZWRDb21wb3NpdGVJZHMuaW5kZXhPZih2MS5pZCkgLSBwaW5uZWRDb21wb3NpdGVJZHMuaW5kZXhPZih2Mi5pZCkpXG5cdFx0XHQubWFwKHYgPT4gdi5pZCk7XG5cdH1cblxuXHRnZXRWaXNpYmxlUGFuZUNvbXBvc2l0ZUlkcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuY29tcG9zaXRlQmFyLmdldFZpc2libGVDb21wb3NpdGVzKClcblx0XHRcdC5maWx0ZXIodiA9PiB0aGlzLnBhbmVDb21wb3NpdGVQYXJ0LmdldEFjdGl2ZVBhbmVDb21wb3NpdGUoKT8uZ2V0SWQoKSA9PT0gdi5pZCB8fCB0aGlzLmNvbXBvc2l0ZUJhci5pc1Bpbm5lZCh2LmlkKSlcblx0XHRcdC5tYXAodiA9PiB2LmlkKTtcblx0fVxuXG5cdGdldFBhbmVDb21wb3NpdGVJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiB0aGlzLmNvbXBvc2l0ZUJhci5nZXRWaXNpYmxlQ29tcG9zaXRlcygpXG5cdFx0XHQubWFwKHYgPT4gdi5pZCk7XG5cdH1cblxuXHRnZXRDb250ZXh0TWVudUFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5jb21wb3NpdGVCYXIuZ2V0Q29udGV4dE1lbnVBY3Rpb25zKCk7XG5cdH1cblxuXHRmb2N1cyhpbmRleD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyLmZvY3VzKGluZGV4KTtcblx0fVxuXG5cdGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyLmxheW91dChuZXcgRGltZW5zaW9uKHdpZHRoLCBoZWlnaHQpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Vmlld0NvbnRhaW5lcihpZDogc3RyaW5nKTogVmlld0NvbnRhaW5lciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGlkKTtcblx0XHRyZXR1cm4gdmlld0NvbnRhaW5lciAmJiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcikgPT09IHRoaXMubG9jYXRpb24gPyB2aWV3Q29udGFpbmVyIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRWaWV3Q29udGFpbmVycygpOiByZWFkb25seSBWaWV3Q29udGFpbmVyW10ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24odGhpcy5sb2NhdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbXBvc2l0ZUJhckl0ZW1zRnJvbVN0b3JhZ2UocmV0YWluRXhpc3Rpbmc6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5waW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlID09PSB0aGlzLmdldFN0b3JlZFBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3BsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9waW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NhY2hlZFZpZXdDb250YWluZXJzID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbmV3Q29tcG9zaXRlSXRlbXM6IElDb21wb3NpdGVCYXJJdGVtW10gPSBbXTtcblx0XHRjb25zdCBjb21wb3NpdGVJdGVtcyA9IHRoaXMuY29tcG9zaXRlQmFyLmdldENvbXBvc2l0ZUJhckl0ZW1zKCk7XG5cblx0XHRmb3IgKGNvbnN0IGNhY2hlZFZpZXdDb250YWluZXIgb2YgdGhpcy5jYWNoZWRWaWV3Q29udGFpbmVycykge1xuXHRcdFx0bmV3Q29tcG9zaXRlSXRlbXMucHVzaCh7XG5cdFx0XHRcdGlkOiBjYWNoZWRWaWV3Q29udGFpbmVyLmlkLFxuXHRcdFx0XHRuYW1lOiBjYWNoZWRWaWV3Q29udGFpbmVyLm5hbWUsXG5cdFx0XHRcdG9yZGVyOiBjYWNoZWRWaWV3Q29udGFpbmVyLm9yZGVyLFxuXHRcdFx0XHRwaW5uZWQ6IGNhY2hlZFZpZXdDb250YWluZXIucGlubmVkLFxuXHRcdFx0XHR2aXNpYmxlOiBjYWNoZWRWaWV3Q29udGFpbmVyLnZpc2libGUgJiYgISF0aGlzLmdldFZpZXdDb250YWluZXIoY2FjaGVkVmlld0NvbnRhaW5lci5pZCksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHZpZXdDb250YWluZXIgb2YgdGhpcy5nZXRWaWV3Q29udGFpbmVycygpKSB7XG5cdFx0XHQvLyBBZGQgbWlzc2luZyB2aWV3IGNvbnRhaW5lcnNcblx0XHRcdGlmICghbmV3Q29tcG9zaXRlSXRlbXMuc29tZSgoeyBpZCB9KSA9PiBpZCA9PT0gdmlld0NvbnRhaW5lci5pZCkpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBjb21wb3NpdGVJdGVtcy5maW5kSW5kZXgoKHsgaWQgfSkgPT4gaWQgPT09IHZpZXdDb250YWluZXIuaWQpO1xuXHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29tcG9zaXRlSXRlbSA9IGNvbXBvc2l0ZUl0ZW1zW2luZGV4XTtcblx0XHRcdFx0XHRuZXdDb21wb3NpdGVJdGVtcy5zcGxpY2UoaW5kZXgsIDAsIHtcblx0XHRcdFx0XHRcdGlkOiB2aWV3Q29udGFpbmVyLmlkLFxuXHRcdFx0XHRcdFx0bmFtZTogdHlwZW9mIHZpZXdDb250YWluZXIudGl0bGUgPT09ICdzdHJpbmcnID8gdmlld0NvbnRhaW5lci50aXRsZSA6IHZpZXdDb250YWluZXIudGl0bGUudmFsdWUsXG5cdFx0XHRcdFx0XHRvcmRlcjogY29tcG9zaXRlSXRlbS5vcmRlcixcblx0XHRcdFx0XHRcdHBpbm5lZDogY29tcG9zaXRlSXRlbS5waW5uZWQsXG5cdFx0XHRcdFx0XHR2aXNpYmxlOiBjb21wb3NpdGVJdGVtLnZpc2libGUsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bmV3Q29tcG9zaXRlSXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRpZDogdmlld0NvbnRhaW5lci5pZCxcblx0XHRcdFx0XHRcdG5hbWU6IHR5cGVvZiB2aWV3Q29udGFpbmVyLnRpdGxlID09PSAnc3RyaW5nJyA/IHZpZXdDb250YWluZXIudGl0bGUgOiB2aWV3Q29udGFpbmVyLnRpdGxlLnZhbHVlLFxuXHRcdFx0XHRcdFx0b3JkZXI6IHZpZXdDb250YWluZXIub3JkZXIsXG5cdFx0XHRcdFx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHR2aXNpYmxlOiAhdGhpcy5zaG91bGRCZUhpZGRlbih2aWV3Q29udGFpbmVyKSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChyZXRhaW5FeGlzdGluZykge1xuXHRcdFx0Zm9yIChjb25zdCBjb21wb3NpdGVJdGVtIG9mIGNvbXBvc2l0ZUl0ZW1zKSB7XG5cdFx0XHRcdGNvbnN0IG5ld0NvbXBvc2l0ZUl0ZW0gPSBuZXdDb21wb3NpdGVJdGVtcy5maW5kKCh7IGlkIH0pID0+IGlkID09PSBjb21wb3NpdGVJdGVtLmlkKTtcblx0XHRcdFx0aWYgKCFuZXdDb21wb3NpdGVJdGVtKSB7XG5cdFx0XHRcdFx0bmV3Q29tcG9zaXRlSXRlbXMucHVzaChjb21wb3NpdGVJdGVtKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuY29tcG9zaXRlQmFyLnNldENvbXBvc2l0ZUJhckl0ZW1zKG5ld0NvbXBvc2l0ZUl0ZW1zKTtcblx0fVxuXG5cdHByaXZhdGUgc2F2ZUNhY2hlZFZpZXdDb250YWluZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlOiBJQ2FjaGVkVmlld0NvbnRhaW5lcltdID0gW107XG5cblx0XHRjb25zdCBjb21wb3NpdGVJdGVtcyA9IHRoaXMuY29tcG9zaXRlQmFyLmdldENvbXBvc2l0ZUJhckl0ZW1zKCk7XG5cdFx0Zm9yIChjb25zdCBjb21wb3NpdGVJdGVtIG9mIGNvbXBvc2l0ZUl0ZW1zKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy5nZXRWaWV3Q29udGFpbmVyKGNvbXBvc2l0ZUl0ZW0uaWQpO1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lck1vZGVsID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIpO1xuXHRcdFx0XHRjb25zdCB2aWV3czogeyB3aGVuOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgeyB3aGVuIH0gb2Ygdmlld0NvbnRhaW5lck1vZGVsLmFsbFZpZXdEZXNjcmlwdG9ycykge1xuXHRcdFx0XHRcdHZpZXdzLnB1c2goeyB3aGVuOiB3aGVuID8gd2hlbi5zZXJpYWxpemUoKSA6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0ZS5wdXNoKHtcblx0XHRcdFx0XHRpZDogY29tcG9zaXRlSXRlbS5pZCxcblx0XHRcdFx0XHRuYW1lOiB2aWV3Q29udGFpbmVyTW9kZWwudGl0bGUsXG5cdFx0XHRcdFx0aWNvbjogVVJJLmlzVXJpKHZpZXdDb250YWluZXJNb2RlbC5pY29uKSAmJiB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgPyB1bmRlZmluZWQgOiB2aWV3Q29udGFpbmVyTW9kZWwuaWNvbiwgLy8gRG8gbm90IGNhY2hlIHVyaSBpY29ucyB3aXRoIHJlbW90ZSBjb25uZWN0aW9uXG5cdFx0XHRcdFx0dmlld3MsXG5cdFx0XHRcdFx0cGlubmVkOiBjb21wb3NpdGVJdGVtLnBpbm5lZCxcblx0XHRcdFx0XHRvcmRlcjogY29tcG9zaXRlSXRlbS5vcmRlcixcblx0XHRcdFx0XHR2aXNpYmxlOiBjb21wb3NpdGVJdGVtLnZpc2libGUsXG5cdFx0XHRcdFx0aXNCdWlsdGluOiAhdmlld0NvbnRhaW5lci5leHRlbnNpb25JZFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHN0YXRlLnB1c2goeyBpZDogY29tcG9zaXRlSXRlbS5pZCwgbmFtZTogY29tcG9zaXRlSXRlbS5uYW1lLCBwaW5uZWQ6IGNvbXBvc2l0ZUl0ZW0ucGlubmVkLCBvcmRlcjogY29tcG9zaXRlSXRlbS5vcmRlciwgdmlzaWJsZTogZmFsc2UsIGlzQnVpbHRpbjogZmFsc2UgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9yZUNhY2hlZFZpZXdDb250YWluZXJzU3RhdGUoc3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FjaGVkVmlld0NvbnRhaW5lcnM6IElDYWNoZWRWaWV3Q29udGFpbmVyW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IGNhY2hlZFZpZXdDb250YWluZXJzKCk6IElDYWNoZWRWaWV3Q29udGFpbmVyW10ge1xuXHRcdGlmICh0aGlzLl9jYWNoZWRWaWV3Q29udGFpbmVycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9jYWNoZWRWaWV3Q29udGFpbmVycyA9IHRoaXMuZ2V0UGlubmVkVmlld0NvbnRhaW5lcnMoKTtcblx0XHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyIG9mIHRoaXMuZ2V0UGxhY2Vob2xkZXJWaWV3Q29udGFpbmVycygpKSB7XG5cdFx0XHRcdGNvbnN0IGNhY2hlZFZpZXdDb250YWluZXIgPSB0aGlzLl9jYWNoZWRWaWV3Q29udGFpbmVycy5maW5kKGNhY2hlZCA9PiBjYWNoZWQuaWQgPT09IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lci5pZCk7XG5cdFx0XHRcdGlmIChjYWNoZWRWaWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0Y2FjaGVkVmlld0NvbnRhaW5lci52aXNpYmxlID0gcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyLnZpc2libGUgPz8gY2FjaGVkVmlld0NvbnRhaW5lci52aXNpYmxlO1xuXHRcdFx0XHRcdGNhY2hlZFZpZXdDb250YWluZXIubmFtZSA9IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lci5uYW1lO1xuXHRcdFx0XHRcdGNhY2hlZFZpZXdDb250YWluZXIuaWNvbiA9IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lci50aGVtZUljb24gPyBwbGFjZWhvbGRlclZpZXdDb250YWluZXIudGhlbWVJY29uIDpcblx0XHRcdFx0XHRcdHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lci5pY29uVXJsID8gVVJJLnJldml2ZShwbGFjZWhvbGRlclZpZXdDb250YWluZXIuaWNvblVybCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKFVSSS5pc1VyaShjYWNoZWRWaWV3Q29udGFpbmVyLmljb24pICYmIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0XHRcdFx0Y2FjaGVkVmlld0NvbnRhaW5lci5pY29uID0gdW5kZWZpbmVkOyAvLyBEbyBub3QgY2FjaGUgdXJpIGljb25zIHdpdGggcmVtb3RlIGNvbm5lY3Rpb25cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FjaGVkVmlld0NvbnRhaW5lci52aWV3cyA9IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lci52aWV3cztcblx0XHRcdFx0XHRjYWNoZWRWaWV3Q29udGFpbmVyLmlzQnVpbHRpbiA9IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lci5pc0J1aWx0aW47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3Qgdmlld0NvbnRhaW5lcldvcmtzcGFjZVN0YXRlIG9mIHRoaXMuZ2V0Vmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZSgpKSB7XG5cdFx0XHRcdGNvbnN0IGNhY2hlZFZpZXdDb250YWluZXIgPSB0aGlzLl9jYWNoZWRWaWV3Q29udGFpbmVycy5maW5kKGNhY2hlZCA9PiBjYWNoZWQuaWQgPT09IHZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZS5pZCk7XG5cdFx0XHRcdGlmIChjYWNoZWRWaWV3Q29udGFpbmVyKSB7XG5cdFx0XHRcdFx0Y2FjaGVkVmlld0NvbnRhaW5lci52aXNpYmxlID0gdmlld0NvbnRhaW5lcldvcmtzcGFjZVN0YXRlLnZpc2libGUgPz8gY2FjaGVkVmlld0NvbnRhaW5lci52aXNpYmxlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFZpZXdDb250YWluZXJzO1xuXHR9XG5cblx0cHJpdmF0ZSBzdG9yZUNhY2hlZFZpZXdDb250YWluZXJzU3RhdGUoY2FjaGVkVmlld0NvbnRhaW5lcnM6IElDYWNoZWRWaWV3Q29udGFpbmVyW10pOiB2b2lkIHtcblx0XHRjb25zdCBwaW5uZWRWaWV3Q29udGFpbmVycyA9IHRoaXMuZ2V0UGlubmVkVmlld0NvbnRhaW5lcnMoKTtcblx0XHR0aGlzLnNldFBpbm5lZFZpZXdDb250YWluZXJzKGNhY2hlZFZpZXdDb250YWluZXJzLm1hcCgoeyBpZCwgcGlubmVkLCBvcmRlciB9KSA9PiAoe1xuXHRcdFx0aWQsXG5cdFx0XHRwaW5uZWQsXG5cdFx0XHR2aXNpYmxlOiBCb29sZWFuKHBpbm5lZFZpZXdDb250YWluZXJzLmZpbmQoKHsgaWQ6IHBpbm5lZElkIH0pID0+IHBpbm5lZElkID09PSBpZCk/LnZpc2libGUpLFxuXHRcdFx0b3JkZXJcblx0XHR9IHNhdGlzZmllcyBJUGlubmVkVmlld0NvbnRhaW5lcikpKTtcblxuXHRcdHRoaXMuc2V0UGxhY2Vob2xkZXJWaWV3Q29udGFpbmVycyhjYWNoZWRWaWV3Q29udGFpbmVycy5tYXAoKHsgaWQsIGljb24sIG5hbWUsIHZpZXdzLCBpc0J1aWx0aW4gfSkgPT4gKHtcblx0XHRcdGlkLFxuXHRcdFx0aWNvblVybDogVVJJLmlzVXJpKGljb24pID8gaWNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHRoZW1lSWNvbjogVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pID8gaWNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdG5hbWUsXG5cdFx0XHRpc0J1aWx0aW4sXG5cdFx0XHR2aWV3c1xuXHRcdH0gc2F0aXNmaWVzIElQbGFjZWhvbGRlclZpZXdDb250YWluZXIpKSk7XG5cblx0XHR0aGlzLnNldFZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGUoY2FjaGVkVmlld0NvbnRhaW5lcnMubWFwKCh7IGlkLCB2aXNpYmxlIH0pID0+ICh7XG5cdFx0XHRpZCxcblx0XHRcdHZpc2libGUsXG5cdFx0fSBzYXRpc2ZpZXMgSVZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGlubmVkVmlld0NvbnRhaW5lcnMoKTogSVBpbm5lZFZpZXdDb250YWluZXJbXSB7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UodGhpcy5waW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0UGlubmVkVmlld0NvbnRhaW5lcnMocGlubmVkVmlld0NvbnRhaW5lcnM6IElQaW5uZWRWaWV3Q29udGFpbmVyW10pOiB2b2lkIHtcblx0XHR0aGlzLnBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUgPSBKU09OLnN0cmluZ2lmeShwaW5uZWRWaWV3Q29udGFpbmVycyk7XG5cdH1cblxuXHRwcml2YXRlIF9waW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IHBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX3Bpbm5lZFZpZXdDb250YWluZXJzVmFsdWUpIHtcblx0XHRcdHRoaXMuX3Bpbm5lZFZpZXdDb250YWluZXJzVmFsdWUgPSB0aGlzLmdldFN0b3JlZFBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IHBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUocGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMucGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSAhPT0gcGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fcGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSA9IHBpbm5lZFZpZXdDb250YWluZXJzVmFsdWU7XG5cdFx0XHR0aGlzLnNldFN0b3JlZFBpbm5lZFZpZXdDb250YWluZXJzVmFsdWUocGlubmVkVmlld0NvbnRhaW5lcnNWYWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRQaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMub3B0aW9ucy5waW5uZWRWaWV3Q29udGFpbmVyc0tleSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICdbXScpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdG9yZWRQaW5uZWRWaWV3Q29udGFpbmVyc1ZhbHVlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMub3B0aW9ucy5waW5uZWRWaWV3Q29udGFpbmVyc0tleSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQbGFjZWhvbGRlclZpZXdDb250YWluZXJzKCk6IElQbGFjZWhvbGRlclZpZXdDb250YWluZXJbXSB7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UodGhpcy5wbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRQbGFjZWhvbGRlclZpZXdDb250YWluZXJzKHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnM6IElQbGFjZWhvbGRlclZpZXdDb250YWluZXJbXSk6IHZvaWQge1xuXHRcdHRoaXMucGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlID0gSlNPTi5zdHJpbmdpZnkocGxhY2Vob2xkZXJWaWV3Q29udGFpbmVycyk7XG5cdH1cblxuXHRwcml2YXRlIF9wbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBnZXQgcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlKCk6IHN0cmluZyB7XG5cdFx0aWYgKCF0aGlzLl9wbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWUpIHtcblx0XHRcdHRoaXMuX3BsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZSA9IHRoaXMuZ2V0U3RvcmVkUGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3BsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IHBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZShwbGFjZWhvbGRlclZpZXdDb250YWluZXNWYWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMucGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlICE9PSBwbGFjZWhvbGRlclZpZXdDb250YWluZXNWYWx1ZSkge1xuXHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlID0gcGxhY2Vob2xkZXJWaWV3Q29udGFpbmVzVmFsdWU7XG5cdFx0XHR0aGlzLnNldFN0b3JlZFBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNWYWx1ZShwbGFjZWhvbGRlclZpZXdDb250YWluZXNWYWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRQbGFjZWhvbGRlclZpZXdDb250YWluZXJzVmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQodGhpcy5vcHRpb25zLnBsYWNlaG9sZGVyVmlld0NvbnRhaW5lcnNLZXksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0U3RvcmVkUGxhY2Vob2xkZXJWaWV3Q29udGFpbmVyc1ZhbHVlKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMub3B0aW9ucy5wbGFjZWhvbGRlclZpZXdDb250YWluZXJzS2V5LCB2YWx1ZSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGUoKTogSVZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZVtdIHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZSh0aGlzLnZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGUodmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZTogSVZpZXdDb250YWluZXJXb3Jrc3BhY2VTdGF0ZVtdKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX3ZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGdldCB2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUoKTogc3RyaW5nIHtcblx0XHRpZiAoIXRoaXMuX3ZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSkge1xuXHRcdFx0dGhpcy5fdmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlID0gdGhpcy5nZXRTdG9yZWRWaWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fdmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgdmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlKHZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHRoaXMudmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlICE9PSB2aWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUpIHtcblx0XHRcdHRoaXMuX3ZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSA9IHZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZTtcblx0XHRcdHRoaXMuc2V0U3RvcmVkVmlld0NvbnRhaW5lcnNXb3Jrc3BhY2VTdGF0ZVZhbHVlKHZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVWYWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdG9yZWRWaWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQodGhpcy5vcHRpb25zLnZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICdbXScpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdG9yZWRWaWV3Q29udGFpbmVyc1dvcmtzcGFjZVN0YXRlVmFsdWUodmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5vcHRpb25zLnZpZXdDb250YWluZXJzV29ya3NwYWNlU3RhdGVLZXksIHZhbHVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG59XG5cbmNsYXNzIFZpZXdDb250YWluZXJBY3Rpdml0eUFjdGlvbiBleHRlbmRzIENvbXBvc2l0ZUJhckFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgcHJldmVudERvdWJsZUNsaWNrRGVsYXkgPSAzMDA7XG5cblx0cHJpdmF0ZSBsYXN0UnVuID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb21wb3NpdGVCYXJBY3Rpb25JdGVtOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhcnQ6IFBhcnRzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcGFuZUNvbXBvc2l0ZVBhcnQ6IElQYW5lQ29tcG9zaXRlUGFydCxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29tcG9zaXRlQmFyQWN0aW9uSXRlbSk7XG5cdFx0dGhpcy51cGRhdGVBY3Rpdml0eSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuYWN0aXZpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZpdHkodmlld0NvbnRhaW5lck9yQWN0aW9uID0+IHtcblx0XHRcdGlmICghaXNTdHJpbmcodmlld0NvbnRhaW5lck9yQWN0aW9uKSAmJiB2aWV3Q29udGFpbmVyT3JBY3Rpb24uaWQgPT09IHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFjdGl2aXR5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0dXBkYXRlQ29tcG9zaXRlQmFyQWN0aW9uSXRlbShjb21wb3NpdGVCYXJBY3Rpb25JdGVtOiBJQ29tcG9zaXRlQmFyQWN0aW9uSXRlbSk6IHZvaWQge1xuXHRcdHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbSA9IGNvbXBvc2l0ZUJhckFjdGlvbkl0ZW07XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUFjdGl2aXR5KCk6IHZvaWQge1xuXHRcdHRoaXMuYWN0aXZpdGllcyA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLmdldFZpZXdDb250YWluZXJBY3Rpdml0aWVzKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oZXZlbnQ6IHsgcHJlc2VydmVGb2N1czogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGlzTW91c2VFdmVudChldmVudCkgJiYgZXZlbnQuYnV0dG9uID09PSAyKSB7XG5cdFx0XHRyZXR1cm47IC8vIGRvIG5vdCBydW4gb24gcmlnaHQgY2xpY2tcblx0XHR9XG5cblx0XHQvLyBwcmV2ZW50IGFjY2lkZW50IHRyaWdnZXIgb24gYSBkb3VibGVjbGljayAodG8gaGVscCBuZXJ2b3VzIHBlb3BsZSlcblx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdGlmIChub3cgPiB0aGlzLmxhc3RSdW4gLyogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI1ODMwICovICYmIG5vdyAtIHRoaXMubGFzdFJ1biA8IFZpZXdDb250YWluZXJBY3Rpdml0eUFjdGlvbi5wcmV2ZW50RG91YmxlQ2xpY2tEZWxheSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmxhc3RSdW4gPSBub3c7XG5cblx0XHRjb25zdCBmb2N1cyA9IChldmVudCAmJiAncHJlc2VydmVGb2N1cycgaW4gZXZlbnQpID8gIWV2ZW50LnByZXNlcnZlRm9jdXMgOiB0cnVlO1xuXG5cdFx0aWYgKHRoaXMucGFydCA9PT0gUGFydHMuQUNUSVZJVFlCQVJfUEFSVCkge1xuXHRcdFx0Y29uc3Qgc2lkZUJhclZpc2libGUgPSB0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKFBhcnRzLlNJREVCQVJfUEFSVCk7XG5cdFx0XHRjb25zdCBhY3RpdmVWaWV3bGV0ID0gdGhpcy5wYW5lQ29tcG9zaXRlUGFydC5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKCk7XG5cdFx0XHRjb25zdCBmb2N1c0JlaGF2aW9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCd3b3JrYmVuY2guYWN0aXZpdHlCYXIuaWNvbkNsaWNrQmVoYXZpb3InKTtcblxuXHRcdFx0aWYgKHNpZGVCYXJWaXNpYmxlICYmIGFjdGl2ZVZpZXdsZXQ/LmdldElkKCkgPT09IHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCkge1xuXHRcdFx0XHRzd2l0Y2ggKGZvY3VzQmVoYXZpb3IpIHtcblx0XHRcdFx0XHRjYXNlICdmb2N1cyc6XG5cdFx0XHRcdFx0XHR0aGlzLnBhbmVDb21wb3NpdGVQYXJ0Lm9wZW5QYW5lQ29tcG9zaXRlKHRoaXMuY29tcG9zaXRlQmFyQWN0aW9uSXRlbS5pZCwgZm9jdXMpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAndG9nZ2xlJzpcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0Ly8gSGlkZSBzaWRlYmFyIGlmIHNlbGVjdGVkIHZpZXdsZXQgYWxyZWFkeSB2aXNpYmxlXG5cdFx0XHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5wYW5lQ29tcG9zaXRlUGFydC5vcGVuUGFuZUNvbXBvc2l0ZSh0aGlzLmNvbXBvc2l0ZUJhckFjdGlvbkl0ZW0uaWQsIGZvY3VzKTtcblx0XHRyZXR1cm4gdGhpcy5hY3RpdmF0ZSgpO1xuXHR9XG59XG5cbmNsYXNzIFBsYWNlSG9sZGVyVmlld0NvbnRhaW5lckFjdGl2aXR5QWN0aW9uIGV4dGVuZHMgVmlld0NvbnRhaW5lckFjdGl2aXR5QWN0aW9uIHsgfVxuXG5jbGFzcyBQbGFjZUhvbGRlclRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbiBleHRlbmRzIFRvZ2dsZUNvbXBvc2l0ZVBpbm5lZEFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgY29tcG9zaXRlQmFyOiBJQ29tcG9zaXRlQmFyKSB7XG5cdFx0c3VwZXIoeyBpZCwgbmFtZTogaWQsIGNsYXNzTmFtZXM6IHVuZGVmaW5lZCB9LCBjb21wb3NpdGVCYXIpO1xuXHR9XG5cblx0c2V0QWN0aXZpdHkoYWN0aXZpdHk6IElDb21wb3NpdGVCYXJBY3Rpb25JdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5sYWJlbCA9IGFjdGl2aXR5Lm5hbWU7XG5cdH1cbn1cblxuY2xhc3MgUGxhY2VIb2xkZXJUb2dnbGVDb21wb3NpdGVCYWRnZUFjdGlvbiBleHRlbmRzIFRvZ2dsZUNvbXBvc2l0ZUJhZGdlQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBjb21wb3NpdGVCYXI6IElDb21wb3NpdGVCYXIpIHtcblx0XHRzdXBlcih7IGlkLCBuYW1lOiBpZCwgY2xhc3NOYW1lczogdW5kZWZpbmVkIH0sIGNvbXBvc2l0ZUJhcik7XG5cdH1cblxuXHRzZXRDb21wb3NpdGVCYXJBY3Rpb25JdGVtKGFjdGlvbkl0ZW06IElDb21wb3NpdGVCYXJBY3Rpb25JdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5sYWJlbCA9IGFjdGlvbkl0ZW0ubmFtZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QixhQUFhO0FBQy9DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLGlCQUFpQixZQUFZLGVBQWUsMEJBQTBCO0FBRTVGLFNBQVMsY0FBaUMsNEJBQTRCO0FBQ3RFLFNBQVMsV0FB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
