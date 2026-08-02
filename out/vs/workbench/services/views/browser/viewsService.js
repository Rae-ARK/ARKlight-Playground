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
import { Disposable, toDisposable, DisposableStore, DisposableMap } from "../../../../base/common/lifecycle.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { FocusedViewContext, getVisbileViewContextKey } from "../../../common/contextkeys.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Event, Emitter } from "../../../../base/common/event.js";
import { isString } from "../../../../base/common/types.js";
import { MenuId, registerAction2, Action2, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { PaneCompositeDescriptor, PaneComposite } from "../../../browser/panecomposite.js";
import { IWorkbenchLayoutService, Parts } from "../../layout/browser/layoutService.js";
import { URI } from "../../../../base/common/uri.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { FilterViewPaneContainer } from "../../../browser/parts/views/viewsViewlet.js";
import { IPaneCompositePartService } from "../../panecomposite/browser/panecomposite.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IViewsService } from "../common/viewsService.js";
let ViewsService = class extends Disposable {
  constructor(viewDescriptorService, paneCompositeService, contextKeyService, layoutService, editorService) {
    super();
    this.viewDescriptorService = viewDescriptorService;
    this.paneCompositeService = paneCompositeService;
    this.contextKeyService = contextKeyService;
    this.layoutService = layoutService;
    this.editorService = editorService;
    this._onDidChangeViewVisibility = this._register(new Emitter());
    this.onDidChangeViewVisibility = this._onDidChangeViewVisibility.event;
    this._onDidChangeViewContainerVisibility = this._register(new Emitter());
    this.onDidChangeViewContainerVisibility = this._onDidChangeViewContainerVisibility.event;
    this._onDidChangeFocusedView = this._register(new Emitter());
    this.onDidChangeFocusedView = this._onDidChangeFocusedView.event;
    this.viewContainerDisposables = this._register(new DisposableMap());
    this.viewDisposable = /* @__PURE__ */ new Map();
    this.enabledViewContainersContextKeys = /* @__PURE__ */ new Map();
    this.visibleViewContextKeys = /* @__PURE__ */ new Map();
    this.viewPaneContainers = /* @__PURE__ */ new Map();
    this._register(toDisposable(() => {
      this.viewDisposable.forEach((disposable) => disposable.dispose());
      this.viewDisposable.clear();
    }));
    this.viewDescriptorService.viewContainers.forEach((viewContainer) => this.onDidRegisterViewContainer(viewContainer, this.viewDescriptorService.getViewContainerLocation(viewContainer)));
    this._register(this.viewDescriptorService.onDidChangeViewContainers(({ added, removed }) => this.onDidChangeContainers(added, removed)));
    this._register(this.viewDescriptorService.onDidChangeContainerLocation(({ viewContainer, from, to }) => this.onDidChangeContainerLocation(viewContainer, from, to)));
    this._register(this.paneCompositeService.onDidPaneCompositeOpen((e) => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: true, location: e.viewContainerLocation })));
    this._register(this.paneCompositeService.onDidPaneCompositeClose((e) => this._onDidChangeViewContainerVisibility.fire({ id: e.composite.getId(), visible: false, location: e.viewContainerLocation })));
    this.focusedViewContextKey = FocusedViewContext.bindTo(contextKeyService);
  }
  onViewsAdded(added) {
    for (const view of added) {
      this.onViewsVisibilityChanged(view, view.isBodyVisible());
    }
  }
  onViewsVisibilityChanged(view, visible) {
    this.getOrCreateActiveViewContextKey(view).set(visible);
    this._onDidChangeViewVisibility.fire({ id: view.id, visible });
  }
  onViewsRemoved(removed) {
    for (const view of removed) {
      this.onViewsVisibilityChanged(view, false);
    }
  }
  getOrCreateActiveViewContextKey(view) {
    const visibleContextKeyId = getVisbileViewContextKey(view.id);
    let contextKey = this.visibleViewContextKeys.get(visibleContextKeyId);
    if (!contextKey) {
      contextKey = new RawContextKey(visibleContextKeyId, false).bindTo(this.contextKeyService);
      this.visibleViewContextKeys.set(visibleContextKeyId, contextKey);
    }
    return contextKey;
  }
  onDidChangeContainers(added, removed) {
    for (const { container, location } of removed) {
      this.onDidDeregisterViewContainer(container, location);
    }
    for (const { container, location } of added) {
      this.onDidRegisterViewContainer(container, location);
    }
  }
  onDidRegisterViewContainer(viewContainer, viewContainerLocation) {
    this.registerPaneComposite(viewContainer, viewContainerLocation);
    const disposables = new DisposableStore();
    const viewContainerModel = this.viewDescriptorService.getViewContainerModel(viewContainer);
    this.onViewDescriptorsAdded(viewContainerModel.allViewDescriptors, viewContainer);
    disposables.add(viewContainerModel.onDidChangeAllViewDescriptors(({ added, removed }) => {
      this.onViewDescriptorsAdded(added, viewContainer);
      this.onViewDescriptorsRemoved(removed);
    }));
    this.updateViewContainerEnablementContextKey(viewContainer);
    disposables.add(viewContainerModel.onDidChangeActiveViewDescriptors(() => this.updateViewContainerEnablementContextKey(viewContainer)));
    disposables.add(this.registerOpenViewContainerAction(viewContainer));
    this.viewContainerDisposables.set(viewContainer.id, disposables);
  }
  onDidDeregisterViewContainer(viewContainer, viewContainerLocation) {
    this.deregisterPaneComposite(viewContainer, viewContainerLocation);
    this.viewContainerDisposables.deleteAndDispose(viewContainer.id);
  }
  onDidChangeContainerLocation(viewContainer, from, to) {
    this.deregisterPaneComposite(viewContainer, from);
    this.registerPaneComposite(viewContainer, to);
    if (this.layoutService.isVisible(this.paneCompositeService.getPartId(to)) && this.viewDescriptorService.getViewContainersByLocation(to).filter((vc) => this.isViewContainerActive(vc.id)).length === 1) {
      this.openViewContainer(viewContainer.id);
    }
  }
  onViewDescriptorsAdded(views, container) {
    const location = this.viewDescriptorService.getViewContainerLocation(container);
    if (location === null) {
      return;
    }
    for (const viewDescriptor of views) {
      const disposables = new DisposableStore();
      disposables.add(this.registerOpenViewAction(viewDescriptor));
      disposables.add(this.registerFocusViewAction(viewDescriptor, container.title));
      disposables.add(this.registerResetViewLocationAction(viewDescriptor));
      this.viewDisposable.set(viewDescriptor, disposables);
    }
  }
  onViewDescriptorsRemoved(views) {
    for (const view of views) {
      const disposable = this.viewDisposable.get(view);
      if (disposable) {
        disposable.dispose();
        this.viewDisposable.delete(view);
      }
    }
  }
  updateViewContainerEnablementContextKey(viewContainer) {
    let contextKey = this.enabledViewContainersContextKeys.get(viewContainer.id);
    if (!contextKey) {
      contextKey = this.contextKeyService.createKey(getEnabledViewContainerContextKey(viewContainer.id), false);
      this.enabledViewContainersContextKeys.set(viewContainer.id, contextKey);
    }
    contextKey.set(!(viewContainer.hideIfEmpty && this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length === 0));
  }
  async openComposite(compositeId, location, focus) {
    return this.paneCompositeService.openPaneComposite(compositeId, location, focus);
  }
  getComposite(compositeId, location) {
    return this.paneCompositeService.getPaneComposite(compositeId, location);
  }
  // One view container can be visible at a time in a location
  isViewContainerVisible(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (!viewContainer) {
      return false;
    }
    const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    if (viewContainerLocation === null) {
      return false;
    }
    return this.paneCompositeService.getActivePaneComposite(viewContainerLocation)?.getId() === id;
  }
  // Multiple view containers can be active/inactive at a time in a location
  isViewContainerActive(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (!viewContainer) {
      return false;
    }
    if (!viewContainer.hideIfEmpty) {
      return true;
    }
    return this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.length > 0;
  }
  getVisibleViewContainer(location) {
    const viewContainerId = this.paneCompositeService.getActivePaneComposite(location)?.getId();
    return viewContainerId ? this.viewDescriptorService.getViewContainerById(viewContainerId) : null;
  }
  getActiveViewPaneContainerWithId(viewContainerId) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(viewContainerId);
    return viewContainer ? this.getActiveViewPaneContainer(viewContainer) : null;
  }
  async openViewContainer(id, focus) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (viewContainer) {
      const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
      if (viewContainerLocation !== null) {
        const paneComposite = await this.paneCompositeService.openPaneComposite(id, viewContainerLocation, focus);
        return paneComposite || null;
      }
    }
    return null;
  }
  async closeViewContainer(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerById(id);
    if (viewContainer) {
      const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
      const isActive = viewContainerLocation !== null && this.paneCompositeService.getActivePaneComposite(viewContainerLocation);
      if (viewContainerLocation !== null) {
        return isActive ? this.layoutService.setPartHidden(true, this.paneCompositeService.getPartId(viewContainerLocation)) : void 0;
      }
    }
  }
  isViewVisible(id) {
    const activeView = this.getActiveViewWithId(id);
    return activeView?.isBodyVisible() || false;
  }
  getActiveViewWithId(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (viewContainer) {
      const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
      if (activeViewPaneContainer) {
        return activeViewPaneContainer.getView(id);
      }
    }
    return null;
  }
  getViewWithId(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (viewContainer) {
      const viewPaneContainer = this.viewPaneContainers.get(viewContainer.id);
      if (viewPaneContainer) {
        return viewPaneContainer.getView(id);
      }
    }
    return null;
  }
  getFocusedView() {
    const viewId = this.contextKeyService.getContextKeyValue(FocusedViewContext.key) ?? "";
    return this.viewDescriptorService.getViewDescriptorById(viewId.toString());
  }
  getFocusedViewName() {
    const textEditorFocused = this.editorService.activeTextEditorControl?.hasTextFocus() ? localize("editor", "Text Editor") : void 0;
    return this.getFocusedView()?.name?.value ?? textEditorFocused ?? "";
  }
  async openView(id, focus) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (!viewContainer) {
      return null;
    }
    if (!this.viewDescriptorService.getViewContainerModel(viewContainer).activeViewDescriptors.some((viewDescriptor) => viewDescriptor.id === id)) {
      return null;
    }
    const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    const compositeDescriptor = this.getComposite(viewContainer.id, location);
    if (compositeDescriptor) {
      const paneComposite = await this.openComposite(compositeDescriptor.id, location);
      if (paneComposite?.openView) {
        return paneComposite.openView(id, focus) || null;
      } else if (focus) {
        paneComposite?.focus();
      }
    }
    return null;
  }
  closeView(id) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(id);
    if (viewContainer) {
      const activeViewPaneContainer = this.getActiveViewPaneContainer(viewContainer);
      if (activeViewPaneContainer) {
        const view = activeViewPaneContainer.getView(id);
        if (view) {
          if (activeViewPaneContainer.views.length === 1) {
            const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
            if (location === ViewContainerLocation.Sidebar) {
              this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
            } else if (location === ViewContainerLocation.Panel || location === ViewContainerLocation.AuxiliaryBar) {
              this.paneCompositeService.hideActivePaneComposite(location);
            }
            if (this.focusedViewContextKey.get() === id) {
              this.focusedViewContextKey.reset();
            }
          } else {
            view.setExpanded(false);
          }
        }
      }
    }
  }
  getActiveViewPaneContainer(viewContainer) {
    const location = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    if (location === null) {
      return null;
    }
    const activePaneComposite = this.paneCompositeService.getActivePaneComposite(location);
    if (activePaneComposite?.getId() === viewContainer.id) {
      return activePaneComposite.getViewPaneContainer() || null;
    }
    return null;
  }
  getViewProgressIndicator(viewId) {
    const viewContainer = this.viewDescriptorService.getViewContainerByViewId(viewId);
    if (!viewContainer) {
      return void 0;
    }
    const viewPaneContainer = this.viewPaneContainers.get(viewContainer.id);
    if (!viewPaneContainer) {
      return void 0;
    }
    const view = viewPaneContainer.getView(viewId);
    if (!view) {
      return void 0;
    }
    if (viewPaneContainer.isViewMergedWithContainer()) {
      return this.getViewContainerProgressIndicator(viewContainer);
    }
    return view.getProgressIndicator();
  }
  getViewContainerProgressIndicator(viewContainer) {
    const viewContainerLocation = this.viewDescriptorService.getViewContainerLocation(viewContainer);
    if (viewContainerLocation === null) {
      return void 0;
    }
    return this.paneCompositeService.getProgressIndicator(viewContainer.id, viewContainerLocation);
  }
  registerOpenViewContainerAction(viewContainer) {
    const disposables = new DisposableStore();
    if (viewContainer.openCommandActionDescriptor) {
      const { id, mnemonicTitle, keybindings, order } = viewContainer.openCommandActionDescriptor ?? { id: viewContainer.id };
      const title = viewContainer.openCommandActionDescriptor.title ?? viewContainer.title;
      const that = this;
      disposables.add(registerAction2(class OpenViewContainerAction extends Action2 {
        constructor() {
          super({
            id,
            get title() {
              const viewContainerLocation = that.viewDescriptorService.getViewContainerLocation(viewContainer);
              const localizedTitle = typeof title === "string" ? title : title.value;
              const originalTitle = typeof title === "string" ? title : title.original;
              if (viewContainerLocation === ViewContainerLocation.Sidebar) {
                return { value: localize("show view", "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
              } else {
                return { value: localize("toggle view", "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
              }
            },
            category: Categories.View,
            precondition: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
            keybinding: keybindings ? { ...keybindings, weight: KeybindingWeight.WorkbenchContrib } : void 0,
            f1: true
          });
        }
        async run(serviceAccessor) {
          const editorGroupService = serviceAccessor.get(IEditorGroupsService);
          const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
          const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
          const viewsService = serviceAccessor.get(IViewsService);
          const viewContainerLocation = viewDescriptorService.getViewContainerLocation(viewContainer);
          switch (viewContainerLocation) {
            case ViewContainerLocation.AuxiliaryBar:
            case ViewContainerLocation.Sidebar: {
              const part = viewContainerLocation === ViewContainerLocation.Sidebar ? Parts.SIDEBAR_PART : Parts.AUXILIARYBAR_PART;
              if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus(part)) {
                await viewsService.openViewContainer(viewContainer.id, true);
              } else {
                editorGroupService.activeGroup.focus();
              }
              break;
            }
            case ViewContainerLocation.Panel:
              if (!viewsService.isViewContainerVisible(viewContainer.id) || !layoutService.hasFocus(Parts.PANEL_PART)) {
                await viewsService.openViewContainer(viewContainer.id, true);
              } else {
                viewsService.closeViewContainer(viewContainer.id);
              }
              break;
          }
        }
      }));
      if (mnemonicTitle) {
        const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(viewContainer);
        disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
          command: {
            id,
            title: mnemonicTitle
          },
          group: defaultLocation === ViewContainerLocation.Sidebar ? "3_sidebar" : defaultLocation === ViewContainerLocation.AuxiliaryBar ? "4_auxbar" : "5_panel",
          when: ContextKeyExpr.has(getEnabledViewContainerContextKey(viewContainer.id)),
          order: order ?? Number.MAX_VALUE
        }));
      }
    }
    return disposables;
  }
  registerOpenViewAction(viewDescriptor) {
    const disposables = new DisposableStore();
    const title = viewDescriptor.openCommandActionDescriptor?.title ?? viewDescriptor.name;
    const commandId = viewDescriptor.openCommandActionDescriptor?.id ?? `${viewDescriptor.id}.open`;
    const that = this;
    disposables.add(registerAction2(class OpenViewAction extends Action2 {
      constructor() {
        super({
          id: commandId,
          get title() {
            const viewContainerLocation = that.viewDescriptorService.getViewLocationById(viewDescriptor.id);
            const localizedTitle = typeof title === "string" ? title : title.value;
            const originalTitle = typeof title === "string" ? title : title.original;
            if (viewContainerLocation === ViewContainerLocation.Sidebar) {
              return { value: localize("show view", "Show {0}", localizedTitle), original: `Show ${originalTitle}` };
            } else {
              return { value: localize("toggle view", "Toggle {0}", localizedTitle), original: `Toggle ${originalTitle}` };
            }
          },
          category: Categories.View,
          precondition: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
          keybinding: viewDescriptor.openCommandActionDescriptor?.keybindings ? { ...viewDescriptor.openCommandActionDescriptor.keybindings, weight: KeybindingWeight.WorkbenchContrib } : void 0,
          f1: viewDescriptor.openCommandActionDescriptor ? true : void 0,
          metadata: {
            description: localize("open view", "Opens view {0}", viewDescriptor.name.value),
            args: [
              {
                name: "options",
                schema: {
                  type: "object",
                  properties: {
                    "preserveFocus": {
                      type: "boolean",
                      default: false,
                      description: localize("preserveFocus", "Whether to preserve the existing focus when opening the view.")
                    }
                  }
                }
              }
            ]
          }
        });
      }
      async run(serviceAccessor, options) {
        const editorGroupService = serviceAccessor.get(IEditorGroupsService);
        const viewDescriptorService = serviceAccessor.get(IViewDescriptorService);
        const layoutService = serviceAccessor.get(IWorkbenchLayoutService);
        const viewsService = serviceAccessor.get(IViewsService);
        const contextKeyService = serviceAccessor.get(IContextKeyService);
        const focusedViewId = FocusedViewContext.getValue(contextKeyService);
        if (focusedViewId === viewDescriptor.id && !options?.preserveFocus) {
          const viewLocation = viewDescriptorService.getViewLocationById(viewDescriptor.id);
          if (viewDescriptorService.getViewLocationById(viewDescriptor.id) === ViewContainerLocation.Sidebar) {
            editorGroupService.activeGroup.focus();
          } else if (viewLocation !== null) {
            layoutService.setPartHidden(true, that.paneCompositeService.getPartId(viewLocation));
          }
        } else {
          await viewsService.openView(viewDescriptor.id, !options?.preserveFocus);
        }
      }
    }));
    if (viewDescriptor.openCommandActionDescriptor?.mnemonicTitle) {
      const defaultViewContainer = this.viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
      if (defaultViewContainer) {
        const defaultLocation = this.viewDescriptorService.getDefaultViewContainerLocation(defaultViewContainer);
        disposables.add(MenuRegistry.appendMenuItem(MenuId.MenubarViewMenu, {
          command: {
            id: commandId,
            title: viewDescriptor.openCommandActionDescriptor.mnemonicTitle
          },
          group: defaultLocation === ViewContainerLocation.Sidebar ? "3_sidebar" : defaultLocation === ViewContainerLocation.AuxiliaryBar ? "4_auxbar" : "5_panel",
          when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
          order: viewDescriptor.openCommandActionDescriptor.order ?? Number.MAX_VALUE
        }));
      }
    }
    return disposables;
  }
  registerFocusViewAction(viewDescriptor, category) {
    return registerAction2(class FocusViewAction extends Action2 {
      constructor() {
        const title = localize2({ key: "focus view", comment: ["{0} indicates the name of the view to be focused."] }, "Focus on {0} View", viewDescriptor.name.value);
        super({
          id: viewDescriptor.focusCommand ? viewDescriptor.focusCommand.id : `${viewDescriptor.id}.focus`,
          title,
          category,
          menu: [{
            id: MenuId.CommandPalette,
            when: viewDescriptor.when
          }],
          keybinding: {
            when: ContextKeyExpr.has(`${viewDescriptor.id}.active`),
            weight: KeybindingWeight.WorkbenchContrib,
            primary: viewDescriptor.focusCommand?.keybindings?.primary,
            secondary: viewDescriptor.focusCommand?.keybindings?.secondary,
            linux: viewDescriptor.focusCommand?.keybindings?.linux,
            mac: viewDescriptor.focusCommand?.keybindings?.mac,
            win: viewDescriptor.focusCommand?.keybindings?.win
          },
          metadata: {
            description: title.value,
            args: [
              {
                name: "focusOptions",
                description: "Focus Options",
                schema: {
                  type: "object",
                  properties: {
                    "preserveFocus": {
                      type: "boolean",
                      default: false
                    }
                  }
                }
              }
            ]
          }
        });
      }
      run(accessor, options) {
        accessor.get(IViewsService).openView(viewDescriptor.id, !options?.preserveFocus);
      }
    });
  }
  registerResetViewLocationAction(viewDescriptor) {
    return registerAction2(class ResetViewLocationAction extends Action2 {
      constructor() {
        super({
          id: `${viewDescriptor.id}.resetViewLocation`,
          title: localize2("resetViewLocation", "Reset Location"),
          menu: [{
            id: MenuId.ViewTitleContext,
            when: ContextKeyExpr.or(
              ContextKeyExpr.and(
                ContextKeyExpr.equals("view", viewDescriptor.id),
                ContextKeyExpr.equals(`${viewDescriptor.id}.defaultViewLocation`, false)
              )
            ),
            group: "1_hide",
            order: 2
          }]
        });
      }
      run(accessor) {
        const viewDescriptorService = accessor.get(IViewDescriptorService);
        const defaultContainer = viewDescriptorService.getDefaultContainerById(viewDescriptor.id);
        const containerModel = viewDescriptorService.getViewContainerModel(defaultContainer);
        if (defaultContainer.hideIfEmpty && containerModel.visibleViewDescriptors.length === 0) {
          const defaultLocation = viewDescriptorService.getDefaultViewContainerLocation(defaultContainer);
          viewDescriptorService.moveViewContainerToLocation(defaultContainer, defaultLocation, void 0, this.desc.id);
        }
        viewDescriptorService.moveViewsToContainer([viewDescriptor], defaultContainer, void 0, this.desc.id);
        accessor.get(IViewsService).openView(viewDescriptor.id, true);
      }
    });
  }
  registerPaneComposite(viewContainer, viewContainerLocation) {
    const that = this;
    let PaneContainer = class extends PaneComposite {
      constructor(telemetryService, contextService, storageService, instantiationService, themeService, contextMenuService, extensionService) {
        super(viewContainer.id, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);
      }
      createViewPaneContainer(element) {
        const viewPaneContainerDisposables = this._register(new DisposableStore());
        const viewPaneContainer = that.createViewPaneContainer(element, viewContainer, viewContainerLocation, viewPaneContainerDisposables, this.instantiationService);
        if (!(viewPaneContainer instanceof FilterViewPaneContainer)) {
          viewPaneContainerDisposables.add(Event.any(viewPaneContainer.onDidAddViews, viewPaneContainer.onDidRemoveViews, viewPaneContainer.onTitleAreaUpdate)(() => {
            this.updateTitleArea();
          }));
        }
        return viewPaneContainer;
      }
    };
    PaneContainer = __decorateClass([
      __decorateParam(0, ITelemetryService),
      __decorateParam(1, IWorkspaceContextService),
      __decorateParam(2, IStorageService),
      __decorateParam(3, IInstantiationService),
      __decorateParam(4, IThemeService),
      __decorateParam(5, IContextMenuService),
      __decorateParam(6, IExtensionService)
    ], PaneContainer);
    Registry.as(this.paneCompositeService.getRegistryId(viewContainerLocation)).registerPaneComposite(PaneCompositeDescriptor.create(
      PaneContainer,
      viewContainer.id,
      typeof viewContainer.title === "string" ? viewContainer.title : viewContainer.title.value,
      isString(viewContainer.icon) ? viewContainer.icon : void 0,
      viewContainer.order,
      viewContainer.requestedIndex,
      viewContainer.icon instanceof URI ? viewContainer.icon : void 0
    ));
  }
  deregisterPaneComposite(viewContainer, viewContainerLocation) {
    Registry.as(this.paneCompositeService.getRegistryId(viewContainerLocation)).deregisterPaneComposite(viewContainer.id);
  }
  createViewPaneContainer(element, viewContainer, viewContainerLocation, disposables, instantiationService) {
    const viewPaneContainer = instantiationService.createInstance(viewContainer.ctorDescriptor.ctor, ...viewContainer.ctorDescriptor.staticArguments || []);
    this.viewPaneContainers.set(viewPaneContainer.getId(), viewPaneContainer);
    disposables.add(toDisposable(() => this.viewPaneContainers.delete(viewPaneContainer.getId())));
    disposables.add(viewPaneContainer.onDidAddViews((views) => this.onViewsAdded(views)));
    disposables.add(viewPaneContainer.onDidChangeViewVisibility((view) => this.onViewsVisibilityChanged(view, view.isBodyVisible())));
    disposables.add(viewPaneContainer.onDidRemoveViews((views) => this.onViewsRemoved(views)));
    disposables.add(viewPaneContainer.onDidFocusView((view) => {
      if (this.focusedViewContextKey.get() !== view.id) {
        this.focusedViewContextKey.set(view.id);
        this._onDidChangeFocusedView.fire();
      }
    }));
    disposables.add(viewPaneContainer.onDidBlurView((view) => {
      if (this.focusedViewContextKey.get() === view.id) {
        this.focusedViewContextKey.reset();
        this._onDidChangeFocusedView.fire();
      }
    }));
    return viewPaneContainer;
  }
};
ViewsService = __decorateClass([
  __decorateParam(0, IViewDescriptorService),
  __decorateParam(1, IPaneCompositePartService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IWorkbenchLayoutService),
  __decorateParam(4, IEditorService)
], ViewsService);
function getEnabledViewContainerContextKey(viewContainerId) {
  return `viewContainer.${viewContainerId}.enabled`;
}
registerSingleton(
  IViewsService,
  ViewsService,
  InstantiationType.Eager
  /* Eager because it registers viewlets and panels in the constructor which are required during workbench layout */
);
export {
  ViewsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy92aWV3cy9icm93c2VyL3ZpZXdzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgRGlzcG9zYWJsZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyLCBJVmlld0Rlc2NyaXB0b3IsIElWaWV3LCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBGb2N1c2VkVmlld0NvbnRleHQsIGdldFZpc2JpbGVWaWV3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFdmVudCwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciwgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmVDb250YWluZXIuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUGFuZUNvbXBvc2l0ZURlc2NyaXB0b3IsIFBhbmVDb21wb3NpdGVSZWdpc3RyeSwgUGFuZUNvbXBvc2l0ZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NJbmRpY2F0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWx0ZXJWaWV3UGFuZUNvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZEFjdGlvblRpdGxlLCBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgVmlld3NTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElWaWV3c1NlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld0Rpc3Bvc2FibGU6IE1hcDxJVmlld0Rlc2NyaXB0b3IsIElEaXNwb3NhYmxlPjtcblx0cHJpdmF0ZSByZWFkb25seSB2aWV3UGFuZUNvbnRhaW5lcnM6IE1hcDxzdHJpbmcsIFZpZXdQYW5lQ29udGFpbmVyPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5OiBFbWl0dGVyPHsgaWQ6IHN0cmluZzsgdmlzaWJsZTogYm9vbGVhbiB9PiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IHN0cmluZzsgdmlzaWJsZTogYm9vbGVhbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eTogRXZlbnQ8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3VmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogc3RyaW5nOyB2aXNpYmxlOiBib29sZWFuOyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZpZXdDb250YWluZXJWaXNpYmlsaXR5ID0gdGhpcy5fb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZvY3VzZWRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRm9jdXNlZFZpZXcgPSB0aGlzLl9vbkRpZENoYW5nZUZvY3VzZWRWaWV3LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmlld0NvbnRhaW5lckRpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXAoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZW5hYmxlZFZpZXdDb250YWluZXJzQ29udGV4dEtleXM6IE1hcDxzdHJpbmcsIElDb250ZXh0S2V5PGJvb2xlYW4+Pjtcblx0cHJpdmF0ZSByZWFkb25seSB2aXNpYmxlVmlld0NvbnRleHRLZXlzOiBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj47XG5cdHByaXZhdGUgcmVhZG9ubHkgZm9jdXNlZFZpZXdDb250ZXh0S2V5OiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudmlld0Rpc3Bvc2FibGUgPSBuZXcgTWFwPElWaWV3RGVzY3JpcHRvciwgSURpc3Bvc2FibGU+KCk7XG5cdFx0dGhpcy5lbmFibGVkVmlld0NvbnRhaW5lcnNDb250ZXh0S2V5cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ29udGV4dEtleTxib29sZWFuPj4oKTtcblx0XHR0aGlzLnZpc2libGVWaWV3Q29udGV4dEtleXMgPSBuZXcgTWFwPHN0cmluZywgSUNvbnRleHRLZXk8Ym9vbGVhbj4+KCk7XG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lcnMgPSBuZXcgTWFwPHN0cmluZywgVmlld1BhbmVDb250YWluZXI+KCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy52aWV3RGlzcG9zYWJsZS5mb3JFYWNoKGRpc3Bvc2FibGUgPT4gZGlzcG9zYWJsZS5kaXNwb3NlKCkpO1xuXHRcdFx0dGhpcy52aWV3RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLnZpZXdDb250YWluZXJzLmZvckVhY2godmlld0NvbnRhaW5lciA9PiB0aGlzLm9uRGlkUmVnaXN0ZXJWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIsIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKSEpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5vbkRpZENoYW5nZVZpZXdDb250YWluZXJzKCh7IGFkZGVkLCByZW1vdmVkIH0pID0+IHRoaXMub25EaWRDaGFuZ2VDb250YWluZXJzKGFkZGVkLCByZW1vdmVkKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb24oKHsgdmlld0NvbnRhaW5lciwgZnJvbSwgdG8gfSkgPT4gdGhpcy5vbkRpZENoYW5nZUNvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIsIGZyb20sIHRvKSkpO1xuXG5cdFx0Ly8gVmlldyBDb250YWluZXIgVmlzaWJpbGl0eVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub25EaWRQYW5lQ29tcG9zaXRlT3BlbihlID0+IHRoaXMuX29uRGlkQ2hhbmdlVmlld0NvbnRhaW5lclZpc2liaWxpdHkuZmlyZSh7IGlkOiBlLmNvbXBvc2l0ZS5nZXRJZCgpLCB2aXNpYmxlOiB0cnVlLCBsb2NhdGlvbjogZS52aWV3Q29udGFpbmVyTG9jYXRpb24gfSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9uRGlkUGFuZUNvbXBvc2l0ZUNsb3NlKGUgPT4gdGhpcy5fb25EaWRDaGFuZ2VWaWV3Q29udGFpbmVyVmlzaWJpbGl0eS5maXJlKHsgaWQ6IGUuY29tcG9zaXRlLmdldElkKCksIHZpc2libGU6IGZhbHNlLCBsb2NhdGlvbjogZS52aWV3Q29udGFpbmVyTG9jYXRpb24gfSkpKTtcblxuXHRcdHRoaXMuZm9jdXNlZFZpZXdDb250ZXh0S2V5ID0gRm9jdXNlZFZpZXdDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uVmlld3NBZGRlZChhZGRlZDogSVZpZXdbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdmlldyBvZiBhZGRlZCkge1xuXHRcdFx0dGhpcy5vblZpZXdzVmlzaWJpbGl0eUNoYW5nZWQodmlldywgdmlldy5pc0JvZHlWaXNpYmxlKCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25WaWV3c1Zpc2liaWxpdHlDaGFuZ2VkKHZpZXc6IElWaWV3LCB2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5nZXRPckNyZWF0ZUFjdGl2ZVZpZXdDb250ZXh0S2V5KHZpZXcpLnNldCh2aXNpYmxlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5LmZpcmUoeyBpZDogdmlldy5pZCwgdmlzaWJsZTogdmlzaWJsZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgb25WaWV3c1JlbW92ZWQocmVtb3ZlZDogSVZpZXdbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgdmlldyBvZiByZW1vdmVkKSB7XG5cdFx0XHR0aGlzLm9uVmlld3NWaXNpYmlsaXR5Q2hhbmdlZCh2aWV3LCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRPckNyZWF0ZUFjdGl2ZVZpZXdDb250ZXh0S2V5KHZpZXc6IElWaWV3KTogSUNvbnRleHRLZXk8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHZpc2libGVDb250ZXh0S2V5SWQgPSBnZXRWaXNiaWxlVmlld0NvbnRleHRLZXkodmlldy5pZCk7XG5cdFx0bGV0IGNvbnRleHRLZXkgPSB0aGlzLnZpc2libGVWaWV3Q29udGV4dEtleXMuZ2V0KHZpc2libGVDb250ZXh0S2V5SWQpO1xuXHRcdGlmICghY29udGV4dEtleSkge1xuXHRcdFx0Y29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5KHZpc2libGVDb250ZXh0S2V5SWQsIGZhbHNlKS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR0aGlzLnZpc2libGVWaWV3Q29udGV4dEtleXMuc2V0KHZpc2libGVDb250ZXh0S2V5SWQsIGNvbnRleHRLZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGV4dEtleTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRDaGFuZ2VDb250YWluZXJzKGFkZGVkOiBSZWFkb25seUFycmF5PHsgY29udGFpbmVyOiBWaWV3Q29udGFpbmVyOyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0+LCByZW1vdmVkOiBSZWFkb25seUFycmF5PHsgY29udGFpbmVyOiBWaWV3Q29udGFpbmVyOyBsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uIH0+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB7IGNvbnRhaW5lciwgbG9jYXRpb24gfSBvZiByZW1vdmVkKSB7XG5cdFx0XHR0aGlzLm9uRGlkRGVyZWdpc3RlclZpZXdDb250YWluZXIoY29udGFpbmVyLCBsb2NhdGlvbik7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgeyBjb250YWluZXIsIGxvY2F0aW9uIH0gb2YgYWRkZWQpIHtcblx0XHRcdHRoaXMub25EaWRSZWdpc3RlclZpZXdDb250YWluZXIoY29udGFpbmVyLCBsb2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFJlZ2lzdGVyVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMucmVnaXN0ZXJQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbik7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCB2aWV3Q29udGFpbmVyTW9kZWwgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcik7XG5cdFx0dGhpcy5vblZpZXdEZXNjcmlwdG9yc0FkZGVkKHZpZXdDb250YWluZXJNb2RlbC5hbGxWaWV3RGVzY3JpcHRvcnMsIHZpZXdDb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3Q29udGFpbmVyTW9kZWwub25EaWRDaGFuZ2VBbGxWaWV3RGVzY3JpcHRvcnMoKHsgYWRkZWQsIHJlbW92ZWQgfSkgPT4ge1xuXHRcdFx0dGhpcy5vblZpZXdEZXNjcmlwdG9yc0FkZGVkKGFkZGVkLCB2aWV3Q29udGFpbmVyKTtcblx0XHRcdHRoaXMub25WaWV3RGVzY3JpcHRvcnNSZW1vdmVkKHJlbW92ZWQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZVZpZXdDb250YWluZXJFbmFibGVtZW50Q29udGV4dEtleSh2aWV3Q29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodmlld0NvbnRhaW5lck1vZGVsLm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzKCgpID0+IHRoaXMudXBkYXRlVmlld0NvbnRhaW5lckVuYWJsZW1lbnRDb250ZXh0S2V5KHZpZXdDb250YWluZXIpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVnaXN0ZXJPcGVuVmlld0NvbnRhaW5lckFjdGlvbih2aWV3Q29udGFpbmVyKSk7XG5cblx0XHR0aGlzLnZpZXdDb250YWluZXJEaXNwb3NhYmxlcy5zZXQodmlld0NvbnRhaW5lci5pZCwgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZERlcmVnaXN0ZXJWaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kZXJlZ2lzdGVyUGFuZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLCB2aWV3Q29udGFpbmVyTG9jYXRpb24pO1xuXHRcdHRoaXMudmlld0NvbnRhaW5lckRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2Uodmlld0NvbnRhaW5lci5pZCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQ29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lciwgZnJvbTogVmlld0NvbnRhaW5lckxvY2F0aW9uLCB0bzogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kZXJlZ2lzdGVyUGFuZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLCBmcm9tKTtcblx0XHR0aGlzLnJlZ2lzdGVyUGFuZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyLCB0byk7XG5cblx0XHQvLyBPcGVuIHZpZXcgY29udGFpbmVyIGlmIHBhcnQgaXMgdmlzaWJsZSBhbmQgdGhlcmUgaXMgb25seSBvbmUgdmlldyBjb250YWluZXIgaW4gbG9jYXRpb25cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2UuaXNWaXNpYmxlKHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0UGFydElkKHRvKSkgJiZcblx0XHRcdHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJzQnlMb2NhdGlvbih0bykuZmlsdGVyKHZjID0+IHRoaXMuaXNWaWV3Q29udGFpbmVyQWN0aXZlKHZjLmlkKSkubGVuZ3RoID09PSAxXG5cdFx0KSB7XG5cdFx0XHR0aGlzLm9wZW5WaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIuaWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25WaWV3RGVzY3JpcHRvcnNBZGRlZCh2aWV3czogUmVhZG9ubHlBcnJheTxJVmlld0Rlc2NyaXB0b3I+LCBjb250YWluZXI6IFZpZXdDb250YWluZXIpOiB2b2lkIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbihjb250YWluZXIpO1xuXHRcdGlmIChsb2NhdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgdmlld0Rlc2NyaXB0b3Igb2Ygdmlld3MpIHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVnaXN0ZXJPcGVuVmlld0FjdGlvbih2aWV3RGVzY3JpcHRvcikpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVnaXN0ZXJGb2N1c1ZpZXdBY3Rpb24odmlld0Rlc2NyaXB0b3IsIGNvbnRhaW5lci50aXRsZSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMucmVnaXN0ZXJSZXNldFZpZXdMb2NhdGlvbkFjdGlvbih2aWV3RGVzY3JpcHRvcikpO1xuXHRcdFx0dGhpcy52aWV3RGlzcG9zYWJsZS5zZXQodmlld0Rlc2NyaXB0b3IsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uVmlld0Rlc2NyaXB0b3JzUmVtb3ZlZCh2aWV3czogUmVhZG9ubHlBcnJheTxJVmlld0Rlc2NyaXB0b3I+KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB2aWV3IG9mIHZpZXdzKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy52aWV3RGlzcG9zYWJsZS5nZXQodmlldyk7XG5cdFx0XHRpZiAoZGlzcG9zYWJsZSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy52aWV3RGlzcG9zYWJsZS5kZWxldGUodmlldyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVWaWV3Q29udGFpbmVyRW5hYmxlbWVudENvbnRleHRLZXkodmlld0NvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdGxldCBjb250ZXh0S2V5ID0gdGhpcy5lbmFibGVkVmlld0NvbnRhaW5lcnNDb250ZXh0S2V5cy5nZXQodmlld0NvbnRhaW5lci5pZCk7XG5cdFx0aWYgKCFjb250ZXh0S2V5KSB7XG5cdFx0XHRjb250ZXh0S2V5ID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXkoZ2V0RW5hYmxlZFZpZXdDb250YWluZXJDb250ZXh0S2V5KHZpZXdDb250YWluZXIuaWQpLCBmYWxzZSk7XG5cdFx0XHR0aGlzLmVuYWJsZWRWaWV3Q29udGFpbmVyc0NvbnRleHRLZXlzLnNldCh2aWV3Q29udGFpbmVyLmlkLCBjb250ZXh0S2V5KTtcblx0XHR9XG5cdFx0Y29udGV4dEtleS5zZXQoISh2aWV3Q29udGFpbmVyLmhpZGVJZkVtcHR5ICYmIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKS5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoID09PSAwKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5Db21wb3NpdGUoY29tcG9zaXRlSWQ6IHN0cmluZywgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiwgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlKGNvbXBvc2l0ZUlkLCBsb2NhdGlvbiwgZm9jdXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb21wb3NpdGUoY29tcG9zaXRlSWQ6IHN0cmluZywgbG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbik6IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldFBhbmVDb21wb3NpdGUoY29tcG9zaXRlSWQsIGxvY2F0aW9uKTtcblx0fVxuXG5cdC8vIE9uZSB2aWV3IGNvbnRhaW5lciBjYW4gYmUgdmlzaWJsZSBhdCBhIHRpbWUgaW4gYSBsb2NhdGlvblxuXHRpc1ZpZXdDb250YWluZXJWaXNpYmxlKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoaWQpO1xuXHRcdGlmICghdmlld0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXJMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyKTtcblx0XHRpZiAodmlld0NvbnRhaW5lckxvY2F0aW9uID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZSh2aWV3Q29udGFpbmVyTG9jYXRpb24pPy5nZXRJZCgpID09PSBpZDtcblx0fVxuXG5cdC8vIE11bHRpcGxlIHZpZXcgY29udGFpbmVycyBjYW4gYmUgYWN0aXZlL2luYWN0aXZlIGF0IGEgdGltZSBpbiBhIGxvY2F0aW9uXG5cdGlzVmlld0NvbnRhaW5lckFjdGl2ZShpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGlkKTtcblx0XHRpZiAoIXZpZXdDb250YWluZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoIXZpZXdDb250YWluZXIuaGlkZUlmRW1wdHkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcikuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRnZXRWaXNpYmxlVmlld0NvbnRhaW5lcihsb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogVmlld0NvbnRhaW5lciB8IG51bGwge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXJJZCA9IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShsb2NhdGlvbik/LmdldElkKCk7XG5cdFx0cmV0dXJuIHZpZXdDb250YWluZXJJZCA/IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKHZpZXdDb250YWluZXJJZCkgOiBudWxsO1xuXHR9XG5cblx0Z2V0QWN0aXZlVmlld1BhbmVDb250YWluZXJXaXRoSWQodmlld0NvbnRhaW5lcklkOiBzdHJpbmcpOiBJVmlld1BhbmVDb250YWluZXIgfCBudWxsIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQodmlld0NvbnRhaW5lcklkKTtcblx0XHRyZXR1cm4gdmlld0NvbnRhaW5lciA/IHRoaXMuZ2V0QWN0aXZlVmlld1BhbmVDb250YWluZXIodmlld0NvbnRhaW5lcikgOiBudWxsO1xuXHR9XG5cblx0YXN5bmMgb3BlblZpZXdDb250YWluZXIoaWQ6IHN0cmluZywgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxJUGFuZUNvbXBvc2l0ZSB8IG51bGw+IHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoaWQpO1xuXHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCB2aWV3Q29udGFpbmVyTG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRpZiAodmlld0NvbnRhaW5lckxvY2F0aW9uICE9PSBudWxsKSB7XG5cdFx0XHRcdGNvbnN0IHBhbmVDb21wb3NpdGUgPSBhd2FpdCB0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlKGlkLCB2aWV3Q29udGFpbmVyTG9jYXRpb24sIGZvY3VzKTtcblx0XHRcdFx0cmV0dXJuIHBhbmVDb21wb3NpdGUgfHwgbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGNsb3NlVmlld0NvbnRhaW5lcihpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lciA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJCeUlkKGlkKTtcblx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSB2aWV3Q29udGFpbmVyTG9jYXRpb24gIT09IG51bGwgJiYgdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXJMb2NhdGlvbik7XG5cdFx0XHRpZiAodmlld0NvbnRhaW5lckxvY2F0aW9uICE9PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiBpc0FjdGl2ZSA/IHRoaXMubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0UGFydElkKHZpZXdDb250YWluZXJMb2NhdGlvbikpIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGlzVmlld1Zpc2libGUoaWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGFjdGl2ZVZpZXcgPSB0aGlzLmdldEFjdGl2ZVZpZXdXaXRoSWQoaWQpO1xuXHRcdHJldHVybiBhY3RpdmVWaWV3Py5pc0JvZHlWaXNpYmxlKCkgfHwgZmFsc2U7XG5cdH1cblxuXHRnZXRBY3RpdmVWaWV3V2l0aElkPFQgZXh0ZW5kcyBJVmlldz4oaWQ6IHN0cmluZyk6IFQgfCBudWxsIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKGlkKTtcblx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0Y29uc3QgYWN0aXZlVmlld1BhbmVDb250YWluZXIgPSB0aGlzLmdldEFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyKHZpZXdDb250YWluZXIpO1xuXHRcdFx0aWYgKGFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVWaWV3UGFuZUNvbnRhaW5lci5nZXRWaWV3KGlkKSBhcyBUO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGdldFZpZXdXaXRoSWQ8VCBleHRlbmRzIElWaWV3PihpZDogc3RyaW5nKTogVCB8IG51bGwge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoaWQpO1xuXHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lcjogSVZpZXdQYW5lQ29udGFpbmVyIHwgdW5kZWZpbmVkID0gdGhpcy52aWV3UGFuZUNvbnRhaW5lcnMuZ2V0KHZpZXdDb250YWluZXIuaWQpO1xuXHRcdFx0aWYgKHZpZXdQYW5lQ29udGFpbmVyKSB7XG5cdFx0XHRcdHJldHVybiB2aWV3UGFuZUNvbnRhaW5lci5nZXRWaWV3KGlkKSBhcyBUO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGdldEZvY3VzZWRWaWV3KCk6IElWaWV3RGVzY3JpcHRvciB8IG51bGwge1xuXHRcdGNvbnN0IHZpZXdJZDogc3RyaW5nID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoRm9jdXNlZFZpZXdDb250ZXh0LmtleSkgPz8gJyc7XG5cdFx0cmV0dXJuIHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdEZXNjcmlwdG9yQnlJZCh2aWV3SWQudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRnZXRGb2N1c2VkVmlld05hbWUoKTogc3RyaW5nIHtcblx0XHRjb25zdCB0ZXh0RWRpdG9yRm9jdXNlZCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbD8uaGFzVGV4dEZvY3VzKCkgPyBsb2NhbGl6ZSgnZWRpdG9yJywgXCJUZXh0IEVkaXRvclwiKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdGhpcy5nZXRGb2N1c2VkVmlldygpPy5uYW1lPy52YWx1ZSA/PyB0ZXh0RWRpdG9yRm9jdXNlZCA/PyAnJztcblx0fVxuXG5cdGFzeW5jIG9wZW5WaWV3PFQgZXh0ZW5kcyBJVmlldz4oaWQ6IHN0cmluZywgZm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTxUIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoaWQpO1xuXHRcdGlmICghdmlld0NvbnRhaW5lcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwodmlld0NvbnRhaW5lcikuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLnNvbWUodmlld0Rlc2NyaXB0b3IgPT4gdmlld0Rlc2NyaXB0b3IuaWQgPT09IGlkKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0Y29uc3QgY29tcG9zaXRlRGVzY3JpcHRvciA9IHRoaXMuZ2V0Q29tcG9zaXRlKHZpZXdDb250YWluZXIuaWQsIGxvY2F0aW9uISk7XG5cdFx0aWYgKGNvbXBvc2l0ZURlc2NyaXB0b3IpIHtcblx0XHRcdGNvbnN0IHBhbmVDb21wb3NpdGUgPSBhd2FpdCB0aGlzLm9wZW5Db21wb3NpdGUoY29tcG9zaXRlRGVzY3JpcHRvci5pZCwgbG9jYXRpb24hKSBhcyBJUGFuZUNvbXBvc2l0ZSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChwYW5lQ29tcG9zaXRlPy5vcGVuVmlldykge1xuXHRcdFx0XHRyZXR1cm4gcGFuZUNvbXBvc2l0ZS5vcGVuVmlldzxUPihpZCwgZm9jdXMpIHx8IG51bGw7XG5cdFx0XHR9IGVsc2UgaWYgKGZvY3VzKSB7XG5cdFx0XHRcdHBhbmVDb21wb3NpdGU/LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRjbG9zZVZpZXcoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoaWQpO1xuXHRcdGlmICh2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVWaWV3UGFuZUNvbnRhaW5lciA9IHRoaXMuZ2V0QWN0aXZlVmlld1BhbmVDb250YWluZXIodmlld0NvbnRhaW5lcik7XG5cdFx0XHRpZiAoYWN0aXZlVmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3QgdmlldyA9IGFjdGl2ZVZpZXdQYW5lQ29udGFpbmVyLmdldFZpZXcoaWQpO1xuXHRcdFx0XHRpZiAodmlldykge1xuXHRcdFx0XHRcdGlmIChhY3RpdmVWaWV3UGFuZUNvbnRhaW5lci52aWV3cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHRcdFx0XHRcdFx0aWYgKGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxheW91dFNlcnZpY2Uuc2V0UGFydEhpZGRlbih0cnVlLCBQYXJ0cy5TSURFQkFSX1BBUlQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChsb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsIHx8IGxvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2UuaGlkZUFjdGl2ZVBhbmVDb21wb3NpdGUobG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBUaGUgYmx1ciBldmVudCBkb2Vzbid0IGZpcmUgb24gV2ViS2l0IHdoZW4gdGhlIGZvY3VzZWQgZWxlbWVudCBpcyBoaWRkZW4sXG5cdFx0XHRcdFx0XHQvLyBzbyB0aGUgY29udGV4dCBrZXkgbmVlZHMgdG8gYmUgZm9yY2VkIGhlcmUgdG9vIG90aGVyd2lzZSBhIHZpZXcgbWF5IHN0aWxsXG5cdFx0XHRcdFx0XHQvLyB0aGluayBpdCdzIHNob3dpbmcsIGJyZWFraW5nIHRvZ2dsZSBjb21tYW5kcy5cblx0XHRcdFx0XHRcdGlmICh0aGlzLmZvY3VzZWRWaWV3Q29udGV4dEtleS5nZXQoKSA9PT0gaWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5mb2N1c2VkVmlld0NvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dmlldy5zZXRFeHBhbmRlZChmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3RpdmVWaWV3UGFuZUNvbnRhaW5lcih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogSVZpZXdQYW5lQ29udGFpbmVyIHwgbnVsbCB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0aWYgKGxvY2F0aW9uID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVQYW5lQ29tcG9zaXRlID0gdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRBY3RpdmVQYW5lQ29tcG9zaXRlKGxvY2F0aW9uKTtcblx0XHRpZiAoYWN0aXZlUGFuZUNvbXBvc2l0ZT8uZ2V0SWQoKSA9PT0gdmlld0NvbnRhaW5lci5pZCkge1xuXHRcdFx0cmV0dXJuIGFjdGl2ZVBhbmVDb21wb3NpdGUuZ2V0Vmlld1BhbmVDb250YWluZXIoKSB8fCBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Z2V0Vmlld1Byb2dyZXNzSW5kaWNhdG9yKHZpZXdJZDogc3RyaW5nKTogSVByb2dyZXNzSW5kaWNhdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdJZCk7XG5cdFx0aWYgKCF2aWV3Q29udGFpbmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdQYW5lQ29udGFpbmVyID0gdGhpcy52aWV3UGFuZUNvbnRhaW5lcnMuZ2V0KHZpZXdDb250YWluZXIuaWQpO1xuXHRcdGlmICghdmlld1BhbmVDb250YWluZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdmlldyA9IHZpZXdQYW5lQ29udGFpbmVyLmdldFZpZXcodmlld0lkKTtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHZpZXdQYW5lQ29udGFpbmVyLmlzVmlld01lcmdlZFdpdGhDb250YWluZXIoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0Vmlld0NvbnRhaW5lclByb2dyZXNzSW5kaWNhdG9yKHZpZXdDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiB2aWV3LmdldFByb2dyZXNzSW5kaWNhdG9yKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFZpZXdDb250YWluZXJQcm9ncmVzc0luZGljYXRvcih2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyKTogSVByb2dyZXNzSW5kaWNhdG9yIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2aWV3Q29udGFpbmVyTG9jYXRpb24gPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0aWYgKHZpZXdDb250YWluZXJMb2NhdGlvbiA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQcm9ncmVzc0luZGljYXRvcih2aWV3Q29udGFpbmVyLmlkLCB2aWV3Q29udGFpbmVyTG9jYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck9wZW5WaWV3Q29udGFpbmVyQWN0aW9uKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aWYgKHZpZXdDb250YWluZXIub3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yKSB7XG5cdFx0XHRjb25zdCB7IGlkLCBtbmVtb25pY1RpdGxlLCBrZXliaW5kaW5ncywgb3JkZXIgfSA9IHZpZXdDb250YWluZXIub3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yID8/IHsgaWQ6IHZpZXdDb250YWluZXIuaWQgfTtcblx0XHRcdGNvbnN0IHRpdGxlID0gdmlld0NvbnRhaW5lci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3IudGl0bGUgPz8gdmlld0NvbnRhaW5lci50aXRsZTtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuVmlld0NvbnRhaW5lckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZCxcblx0XHRcdFx0XHRcdGdldCB0aXRsZSgpOiBJQ29tbWFuZEFjdGlvblRpdGxlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgdmlld0NvbnRhaW5lckxvY2F0aW9uID0gdGhhdC52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsb2NhbGl6ZWRUaXRsZSA9IHR5cGVvZiB0aXRsZSA9PT0gJ3N0cmluZycgPyB0aXRsZSA6IHRpdGxlLnZhbHVlO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbFRpdGxlID0gdHlwZW9mIHRpdGxlID09PSAnc3RyaW5nJyA/IHRpdGxlIDogdGl0bGUub3JpZ2luYWw7XG5cdFx0XHRcdFx0XHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IGxvY2FsaXplKCdzaG93IHZpZXcnLCBcIlNob3cgezB9XCIsIGxvY2FsaXplZFRpdGxlKSwgb3JpZ2luYWw6IGBTaG93ICR7b3JpZ2luYWxUaXRsZX1gIH07XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IGxvY2FsaXplKCd0b2dnbGUgdmlldycsIFwiVG9nZ2xlIHswfVwiLCBsb2NhbGl6ZWRUaXRsZSksIG9yaWdpbmFsOiBgVG9nZ2xlICR7b3JpZ2luYWxUaXRsZX1gIH07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5oYXMoZ2V0RW5hYmxlZFZpZXdDb250YWluZXJDb250ZXh0S2V5KHZpZXdDb250YWluZXIuaWQpKSxcblx0XHRcdFx0XHRcdGtleWJpbmRpbmc6IGtleWJpbmRpbmdzID8geyAuLi5rZXliaW5kaW5ncywgd2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGYxOiB0cnVlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cHVibGljIGFzeW5jIHJ1bihzZXJ2aWNlQWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElWaWV3RGVzY3JpcHRvclNlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IGxheW91dFNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlKTtcblx0XHRcdFx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJMb2NhdGlvbiA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdFx0c3dpdGNoICh2aWV3Q29udGFpbmVyTG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcjpcblx0XHRcdFx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXI6IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcGFydCA9IHZpZXdDb250YWluZXJMb2NhdGlvbiA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIgPyBQYXJ0cy5TSURFQkFSX1BBUlQgOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVDtcblx0XHRcdFx0XHRcdFx0aWYgKCF2aWV3c1NlcnZpY2UuaXNWaWV3Q29udGFpbmVyVmlzaWJsZSh2aWV3Q29udGFpbmVyLmlkKSB8fCAhbGF5b3V0U2VydmljZS5oYXNGb2N1cyhwYXJ0KSkge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcih2aWV3Q29udGFpbmVyLmlkLCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRlZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuZm9jdXMoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhc2UgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsOlxuXHRcdFx0XHRcdFx0XHRpZiAoIXZpZXdzU2VydmljZS5pc1ZpZXdDb250YWluZXJWaXNpYmxlKHZpZXdDb250YWluZXIuaWQpIHx8ICFsYXlvdXRTZXJ2aWNlLmhhc0ZvY3VzKFBhcnRzLlBBTkVMX1BBUlQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgdmlld3NTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKHZpZXdDb250YWluZXIuaWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHZpZXdzU2VydmljZS5jbG9zZVZpZXdDb250YWluZXIodmlld0NvbnRhaW5lci5pZCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGlmIChtbmVtb25pY1RpdGxlKSB7XG5cdFx0XHRcdGNvbnN0IGRlZmF1bHRMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRWaWV3Q29udGFpbmVyTG9jYXRpb24odmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJWaWV3TWVudSwge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0dGl0bGU6IG1uZW1vbmljVGl0bGUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogZGVmYXVsdExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciA/ICczX3NpZGViYXInIDogZGVmYXVsdExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyID8gJzRfYXV4YmFyJyA6ICc1X3BhbmVsJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoZ2V0RW5hYmxlZFZpZXdDb250YWluZXJDb250ZXh0S2V5KHZpZXdDb250YWluZXIuaWQpKSxcblx0XHRcdFx0XHRvcmRlcjogb3JkZXIgPz8gTnVtYmVyLk1BWF9WQUxVRVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlck9wZW5WaWV3QWN0aW9uKHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdGl0bGUgPSB2aWV3RGVzY3JpcHRvci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I/LnRpdGxlID8/IHZpZXdEZXNjcmlwdG9yLm5hbWU7XG5cdFx0Y29uc3QgY29tbWFuZElkID0gdmlld0Rlc2NyaXB0b3Iub3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yPy5pZCA/PyBgJHt2aWV3RGVzY3JpcHRvci5pZH0ub3BlbmA7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuVmlld0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHRcdGdldCB0aXRsZSgpOiBJQ29tbWFuZEFjdGlvblRpdGxlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZpZXdDb250YWluZXJMb2NhdGlvbiA9IHRoYXQudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbG9jYWxpemVkVGl0bGUgPSB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS52YWx1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsVGl0bGUgPSB0eXBlb2YgdGl0bGUgPT09ICdzdHJpbmcnID8gdGl0bGUgOiB0aXRsZS5vcmlnaW5hbDtcblx0XHRcdFx0XHRcdGlmICh2aWV3Q29udGFpbmVyTG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiBsb2NhbGl6ZSgnc2hvdyB2aWV3JywgXCJTaG93IHswfVwiLCBsb2NhbGl6ZWRUaXRsZSksIG9yaWdpbmFsOiBgU2hvdyAke29yaWdpbmFsVGl0bGV9YCB9O1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHsgdmFsdWU6IGxvY2FsaXplKCd0b2dnbGUgdmlldycsIFwiVG9nZ2xlIHswfVwiLCBsb2NhbGl6ZWRUaXRsZSksIG9yaWdpbmFsOiBgVG9nZ2xlICR7b3JpZ2luYWxUaXRsZX1gIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuaGFzKGAke3ZpZXdEZXNjcmlwdG9yLmlkfS5hY3RpdmVgKSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB2aWV3RGVzY3JpcHRvci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I/LmtleWJpbmRpbmdzID8geyAuLi52aWV3RGVzY3JpcHRvci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3Iua2V5YmluZGluZ3MsIHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZjE6IHZpZXdEZXNjcmlwdG9yLm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvciA/IHRydWUgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnb3BlbiB2aWV3JywgXCJPcGVucyB2aWV3IHswfVwiLCB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlKSxcblx0XHRcdFx0XHRcdGFyZ3M6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG5hbWU6ICdvcHRpb25zJyxcblx0XHRcdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQncHJlc2VydmVGb2N1cyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcmVzZXJ2ZUZvY3VzJywgXCJXaGV0aGVyIHRvIHByZXNlcnZlIHRoZSBleGlzdGluZyBmb2N1cyB3aGVuIG9wZW5pbmcgdGhlIHZpZXcuXCIpXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHB1YmxpYyBhc3luYyBydW4oc2VydmljZUFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zPzogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRvckdyb3VwU2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCB2aWV3RGVzY3JpcHRvclNlcnZpY2UgPSBzZXJ2aWNlQWNjZXNzb3IuZ2V0KElWaWV3RGVzY3JpcHRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBsYXlvdXRTZXJ2aWNlID0gc2VydmljZUFjY2Vzc29yLmdldChJV29ya2JlbmNoTGF5b3V0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHZpZXdzU2VydmljZSA9IHNlcnZpY2VBY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gc2VydmljZUFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRWaWV3SWQgPSBGb2N1c2VkVmlld0NvbnRleHQuZ2V0VmFsdWUoY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZFZpZXdJZCA9PT0gdmlld0Rlc2NyaXB0b3IuaWQgJiYgIW9wdGlvbnM/LnByZXNlcnZlRm9jdXMpIHtcblxuXHRcdFx0XHRcdGNvbnN0IHZpZXdMb2NhdGlvbiA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3TG9jYXRpb25CeUlkKHZpZXdEZXNjcmlwdG9yLmlkKTtcblx0XHRcdFx0XHRpZiAodmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQodmlld0Rlc2NyaXB0b3IuaWQpID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcikge1xuXHRcdFx0XHRcdFx0Ly8gZm9jdXMgdGhlIGVkaXRvciBpZiB0aGUgdmlldyBpcyBmb2N1c2VkIGFuZCBpbiB0aGUgc2lkZSBiYXJcblx0XHRcdFx0XHRcdGVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVHcm91cC5mb2N1cygpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodmlld0xvY2F0aW9uICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHQvLyBvdGhlcndpc2UgaGlkZSB0aGUgcGFydCB3aGVyZSB0aGUgdmlldyBsaXZlcyBpZiBmb2N1c2VkXG5cdFx0XHRcdFx0XHRsYXlvdXRTZXJ2aWNlLnNldFBhcnRIaWRkZW4odHJ1ZSwgdGhhdC5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRQYXJ0SWQodmlld0xvY2F0aW9uKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyh2aWV3RGVzY3JpcHRvci5pZCwgIW9wdGlvbnM/LnByZXNlcnZlRm9jdXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHZpZXdEZXNjcmlwdG9yLm9wZW5Db21tYW5kQWN0aW9uRGVzY3JpcHRvcj8ubW5lbW9uaWNUaXRsZSkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Q29udGFpbmVyQnlJZCh2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0XHRpZiAoZGVmYXVsdFZpZXdDb250YWluZXIpIHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdExvY2F0aW9uID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbihkZWZhdWx0Vmlld0NvbnRhaW5lcik7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJWaWV3TWVudSwge1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRcdGlkOiBjb21tYW5kSWQsXG5cdFx0XHRcdFx0XHR0aXRsZTogdmlld0Rlc2NyaXB0b3Iub3BlbkNvbW1hbmRBY3Rpb25EZXNjcmlwdG9yLm1uZW1vbmljVGl0bGUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRncm91cDogZGVmYXVsdExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciA/ICczX3NpZGViYXInIDogZGVmYXVsdExvY2F0aW9uID09PSBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyID8gJzRfYXV4YmFyJyA6ICc1X3BhbmVsJyxcblx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoYCR7dmlld0Rlc2NyaXB0b3IuaWR9LmFjdGl2ZWApLFxuXHRcdFx0XHRcdG9yZGVyOiB2aWV3RGVzY3JpcHRvci5vcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3Iub3JkZXIgPz8gTnVtYmVyLk1BWF9WQUxVRVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBkaXNwb3NhYmxlcztcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJGb2N1c1ZpZXdBY3Rpb24odmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvciwgY2F0ZWdvcnk/OiBzdHJpbmcgfCBJTG9jYWxpemVkU3RyaW5nKTogSURpc3Bvc2FibGUge1xuXHRcdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNWaWV3QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZTIoeyBrZXk6ICdmb2N1cyB2aWV3JywgY29tbWVudDogWyd7MH0gaW5kaWNhdGVzIHRoZSBuYW1lIG9mIHRoZSB2aWV3IHRvIGJlIGZvY3VzZWQuJ10gfSwgXCJGb2N1cyBvbiB7MH0gVmlld1wiLCB2aWV3RGVzY3JpcHRvci5uYW1lLnZhbHVlKTtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvci5mb2N1c0NvbW1hbmQgPyB2aWV3RGVzY3JpcHRvci5mb2N1c0NvbW1hbmQuaWQgOiBgJHt2aWV3RGVzY3JpcHRvci5pZH0uZm9jdXNgLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGNhdGVnb3J5LFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHRcdFx0d2hlbjogdmlld0Rlc2NyaXB0b3Iud2hlbixcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5oYXMoYCR7dmlld0Rlc2NyaXB0b3IuaWR9LmFjdGl2ZWApLFxuXHRcdFx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdFx0XHRwcmltYXJ5OiB2aWV3RGVzY3JpcHRvci5mb2N1c0NvbW1hbmQ/LmtleWJpbmRpbmdzPy5wcmltYXJ5LFxuXHRcdFx0XHRcdFx0c2Vjb25kYXJ5OiB2aWV3RGVzY3JpcHRvci5mb2N1c0NvbW1hbmQ/LmtleWJpbmRpbmdzPy5zZWNvbmRhcnksXG5cdFx0XHRcdFx0XHRsaW51eDogdmlld0Rlc2NyaXB0b3IuZm9jdXNDb21tYW5kPy5rZXliaW5kaW5ncz8ubGludXgsXG5cdFx0XHRcdFx0XHRtYWM6IHZpZXdEZXNjcmlwdG9yLmZvY3VzQ29tbWFuZD8ua2V5YmluZGluZ3M/Lm1hYyxcblx0XHRcdFx0XHRcdHdpbjogdmlld0Rlc2NyaXB0b3IuZm9jdXNDb21tYW5kPy5rZXliaW5kaW5ncz8ud2luXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHRpdGxlLnZhbHVlLFxuXHRcdFx0XHRcdFx0YXJnczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bmFtZTogJ2ZvY3VzT3B0aW9ucycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdGb2N1cyBPcHRpb25zJyxcblx0XHRcdFx0XHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQncHJlc2VydmVGb2N1cyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zPzogeyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0XHRcdGFjY2Vzc29yLmdldChJVmlld3NTZXJ2aWNlKS5vcGVuVmlldyh2aWV3RGVzY3JpcHRvci5pZCwgIW9wdGlvbnM/LnByZXNlcnZlRm9jdXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclJlc2V0Vmlld0xvY2F0aW9uQWN0aW9uKHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZXNldFZpZXdMb2NhdGlvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogYCR7dmlld0Rlc2NyaXB0b3IuaWR9LnJlc2V0Vmlld0xvY2F0aW9uYCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdyZXNldFZpZXdMb2NhdGlvbicsIFwiUmVzZXQgTG9jYXRpb25cIiksXG5cdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlQ29udGV4dCxcblx0XHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Jywgdmlld0Rlc2NyaXB0b3IuaWQpLFxuXHRcdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmVxdWFscyhgJHt2aWV3RGVzY3JpcHRvci5pZH0uZGVmYXVsdFZpZXdMb2NhdGlvbmAsIGZhbHNlKVxuXHRcdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICcxX2hpZGUnLFxuXHRcdFx0XHRcdFx0b3JkZXI6IDJcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElWaWV3RGVzY3JpcHRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0Q29udGFpbmVyID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldERlZmF1bHRDb250YWluZXJCeUlkKHZpZXdEZXNjcmlwdG9yLmlkKSE7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5lck1vZGVsID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChkZWZhdWx0Q29udGFpbmVyKSE7XG5cblx0XHRcdFx0Ly8gVGhlIGRlZmF1bHQgY29udGFpbmVyIGlzIGhpZGRlbiBzbyB3ZSBzaG91bGQgdHJ5IHRvIHJlc2V0IGl0cyBsb2NhdGlvbiBmaXJzdFxuXHRcdFx0XHRpZiAoZGVmYXVsdENvbnRhaW5lci5oaWRlSWZFbXB0eSAmJiBjb250YWluZXJNb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGRlZmF1bHRMb2NhdGlvbiA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXREZWZhdWx0Vmlld0NvbnRhaW5lckxvY2F0aW9uKGRlZmF1bHRDb250YWluZXIpITtcblx0XHRcdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2UubW92ZVZpZXdDb250YWluZXJUb0xvY2F0aW9uKGRlZmF1bHRDb250YWluZXIsIGRlZmF1bHRMb2NhdGlvbiwgdW5kZWZpbmVkLCB0aGlzLmRlc2MuaWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmlld0Rlc2NyaXB0b3JTZXJ2aWNlLm1vdmVWaWV3c1RvQ29udGFpbmVyKFt2aWV3RGVzY3JpcHRvcl0sIGRlZmF1bHRDb250YWluZXIsIHVuZGVmaW5lZCwgdGhpcy5kZXNjLmlkKTtcblx0XHRcdFx0YWNjZXNzb3IuZ2V0KElWaWV3c1NlcnZpY2UpLm9wZW5WaWV3KHZpZXdEZXNjcmlwdG9yLmlkLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0Y2xhc3MgUGFuZUNvbnRhaW5lciBleHRlbmRzIFBhbmVDb21wb3NpdGUge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdFx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0XHRcdEBJRXh0ZW5zaW9uU2VydmljZSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRcdCkge1xuXHRcdFx0XHRzdXBlcih2aWV3Q29udGFpbmVyLmlkLCB0ZWxlbWV0cnlTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBjb250ZXh0U2VydmljZSk7XG5cdFx0XHR9XG5cblx0XHRcdHByb3RlY3RlZCBjcmVhdGVWaWV3UGFuZUNvbnRhaW5lcihlbGVtZW50OiBIVE1MRWxlbWVudCk6IFZpZXdQYW5lQ29udGFpbmVyIHtcblx0XHRcdFx0Y29uc3Qgdmlld1BhbmVDb250YWluZXJEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRcdFx0Ly8gVXNlIGNvbXBvc2l0ZSdzIGluc3RhbnRpYXRpb24gc2VydmljZSB0byBnZXQgdGhlIGVkaXRvciBwcm9ncmVzcyBzZXJ2aWNlIGZvciBhbnkgZWRpdG9ycyBpbnN0YW50aWF0ZWQgd2l0aGluIHRoZSBjb21wb3NpdGVcblx0XHRcdFx0Y29uc3Qgdmlld1BhbmVDb250YWluZXIgPSB0aGF0LmNyZWF0ZVZpZXdQYW5lQ29udGFpbmVyKGVsZW1lbnQsIHZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbiwgdmlld1BhbmVDb250YWluZXJEaXNwb3NhYmxlcywgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0Ly8gT25seSB1cGRhdGVUaXRsZUFyZWEgZm9yIG5vbi1maWx0ZXIgdmlld3M6IG1pY3Jvc29mdC92c2NvZGUtcmVtb3RlLXJlbGVhc2UjMzY3NlxuXHRcdFx0XHRpZiAoISh2aWV3UGFuZUNvbnRhaW5lciBpbnN0YW5jZW9mIEZpbHRlclZpZXdQYW5lQ29udGFpbmVyKSkge1xuXHRcdFx0XHRcdHZpZXdQYW5lQ29udGFpbmVyRGlzcG9zYWJsZXMuYWRkKEV2ZW50LmFueSh2aWV3UGFuZUNvbnRhaW5lci5vbkRpZEFkZFZpZXdzLCB2aWV3UGFuZUNvbnRhaW5lci5vbkRpZFJlbW92ZVZpZXdzLCB2aWV3UGFuZUNvbnRhaW5lci5vblRpdGxlQXJlYVVwZGF0ZSkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gVXBkYXRlIHRpdGxlIGFyZWEgc2luY2UgdGhlcmUgaXMgbm8gYmV0dGVyIHdheSB0byB1cGRhdGUgc2Vjb25kYXJ5IGFjdGlvbnNcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlVGl0bGVBcmVhKCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHZpZXdQYW5lQ29udGFpbmVyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdFJlZ2lzdHJ5LmFzPFBhbmVDb21wb3NpdGVSZWdpc3RyeT4odGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5nZXRSZWdpc3RyeUlkKHZpZXdDb250YWluZXJMb2NhdGlvbikpLnJlZ2lzdGVyUGFuZUNvbXBvc2l0ZShQYW5lQ29tcG9zaXRlRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0XHRQYW5lQ29udGFpbmVyLFxuXHRcdFx0dmlld0NvbnRhaW5lci5pZCxcblx0XHRcdHR5cGVvZiB2aWV3Q29udGFpbmVyLnRpdGxlID09PSAnc3RyaW5nJyA/IHZpZXdDb250YWluZXIudGl0bGUgOiB2aWV3Q29udGFpbmVyLnRpdGxlLnZhbHVlLFxuXHRcdFx0aXNTdHJpbmcodmlld0NvbnRhaW5lci5pY29uKSA/IHZpZXdDb250YWluZXIuaWNvbiA6IHVuZGVmaW5lZCxcblx0XHRcdHZpZXdDb250YWluZXIub3JkZXIsXG5cdFx0XHR2aWV3Q29udGFpbmVyLnJlcXVlc3RlZEluZGV4LFxuXHRcdFx0dmlld0NvbnRhaW5lci5pY29uIGluc3RhbmNlb2YgVVJJID8gdmlld0NvbnRhaW5lci5pY29uIDogdW5kZWZpbmVkXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIGRlcmVnaXN0ZXJQYW5lQ29tcG9zaXRlKHZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIsIHZpZXdDb250YWluZXJMb2NhdGlvbjogVmlld0NvbnRhaW5lckxvY2F0aW9uKTogdm9pZCB7XG5cdFx0UmVnaXN0cnkuYXM8UGFuZUNvbXBvc2l0ZVJlZ2lzdHJ5Pih0aGlzLnBhbmVDb21wb3NpdGVTZXJ2aWNlLmdldFJlZ2lzdHJ5SWQodmlld0NvbnRhaW5lckxvY2F0aW9uKSkuZGVyZWdpc3RlclBhbmVDb21wb3NpdGUodmlld0NvbnRhaW5lci5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVZpZXdQYW5lQ29udGFpbmVyKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCB2aWV3Q29udGFpbmVyOiBWaWV3Q29udGFpbmVyLCB2aWV3Q29udGFpbmVyTG9jYXRpb246IFZpZXdDb250YWluZXJMb2NhdGlvbiwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSk6IFZpZXdQYW5lQ29udGFpbmVyIHtcblx0XHRjb25zdCB2aWV3UGFuZUNvbnRhaW5lcjogVmlld1BhbmVDb250YWluZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZSh2aWV3Q29udGFpbmVyLmN0b3JEZXNjcmlwdG9yLmN0b3IsIC4uLih2aWV3Q29udGFpbmVyLmN0b3JEZXNjcmlwdG9yLnN0YXRpY0FyZ3VtZW50cyB8fCBbXSkpO1xuXG5cdFx0dGhpcy52aWV3UGFuZUNvbnRhaW5lcnMuc2V0KHZpZXdQYW5lQ29udGFpbmVyLmdldElkKCksIHZpZXdQYW5lQ29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMudmlld1BhbmVDb250YWluZXJzLmRlbGV0ZSh2aWV3UGFuZUNvbnRhaW5lci5nZXRJZCgpKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3UGFuZUNvbnRhaW5lci5vbkRpZEFkZFZpZXdzKHZpZXdzID0+IHRoaXMub25WaWV3c0FkZGVkKHZpZXdzKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh2aWV3UGFuZUNvbnRhaW5lci5vbkRpZENoYW5nZVZpZXdWaXNpYmlsaXR5KHZpZXcgPT4gdGhpcy5vblZpZXdzVmlzaWJpbGl0eUNoYW5nZWQodmlldywgdmlldy5pc0JvZHlWaXNpYmxlKCkpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdQYW5lQ29udGFpbmVyLm9uRGlkUmVtb3ZlVmlld3Modmlld3MgPT4gdGhpcy5vblZpZXdzUmVtb3ZlZCh2aWV3cykpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodmlld1BhbmVDb250YWluZXIub25EaWRGb2N1c1ZpZXcodmlldyA9PiB7XG5cdFx0XHRpZiAodGhpcy5mb2N1c2VkVmlld0NvbnRleHRLZXkuZ2V0KCkgIT09IHZpZXcuaWQpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkVmlld0NvbnRleHRLZXkuc2V0KHZpZXcuaWQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUZvY3VzZWRWaWV3LmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHZpZXdQYW5lQ29udGFpbmVyLm9uRGlkQmx1clZpZXcodmlldyA9PiB7XG5cdFx0XHRpZiAodGhpcy5mb2N1c2VkVmlld0NvbnRleHRLZXkuZ2V0KCkgPT09IHZpZXcuaWQpIHtcblx0XHRcdFx0dGhpcy5mb2N1c2VkVmlld0NvbnRleHRLZXkucmVzZXQoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGb2N1c2VkVmlldy5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHZpZXdQYW5lQ29udGFpbmVyO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEVuYWJsZWRWaWV3Q29udGFpbmVyQ29udGV4dEtleSh2aWV3Q29udGFpbmVySWQ6IHN0cmluZyk6IHN0cmluZyB7IHJldHVybiBgdmlld0NvbnRhaW5lci4ke3ZpZXdDb250YWluZXJJZH0uZW5hYmxlZGA7IH1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVZpZXdzU2VydmljZSwgVmlld3NTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlciAvKiBFYWdlciBiZWNhdXNlIGl0IHJlZ2lzdGVycyB2aWV3bGV0cyBhbmQgcGFuZWxzIGluIHRoZSBjb25zdHJ1Y3RvciB3aGljaCBhcmUgcmVxdWlyZWQgZHVyaW5nIHdvcmtiZW5jaCBsYXlvdXQgKi8pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQXlCLGNBQWMsaUJBQWlCLHFCQUFxQjtBQUN0RixTQUFTLHdCQUErRCw2QkFBaUQ7QUFDekgsU0FBUyxvQkFBb0IsZ0NBQWdDO0FBQzdELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQTZCLG9CQUFvQixxQkFBcUI7QUFDL0UsU0FBUyxPQUFPLGVBQWU7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxRQUFRLGlCQUFpQixTQUFTLG9CQUFvQjtBQUMvRCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUEyQiw2QkFBNkI7QUFFeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx5QkFBZ0QscUJBQXFCO0FBQzlFLFNBQVMseUJBQXlCLGFBQWE7QUFDL0MsU0FBUyxXQUFXO0FBRXBCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBRXZCLElBQU0sZUFB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
