import "./media/compositepart.css";
import { localize } from "../../../nls.js";
import { defaultGenerator } from "../../../base/common/idGenerator.js";
import { dispose, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { Emitter } from "../../../base/common/event.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { ActionsOrientation, prepareActions } from "../../../base/browser/ui/actionbar/actionbar.js";
import { ProgressBar } from "../../../base/browser/ui/progressbar/progressbar.js";
import { Part } from "../part.js";
import { StorageScope, StorageTarget } from "../../../platform/storage/common/storage.js";
import { ServiceCollection } from "../../../platform/instantiation/common/serviceCollection.js";
import { IEditorProgressService } from "../../../platform/progress/common/progress.js";
import { Dimension, append, $, hide, show } from "../../../base/browser/dom.js";
import { AnchorAlignment } from "../../../base/browser/ui/contextview/contextview.js";
import { assertReturnsDefined } from "../../../base/common/types.js";
import { createActionViewItem } from "../../../platform/actions/browser/menuEntryActionViewItem.js";
import { AbstractProgressScope, ScopedProgressIndicator } from "../../services/progress/browser/progressIndicator.js";
import { WorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { defaultProgressBarStyles } from "../../../platform/theme/browser/defaultStyles.js";
import { createInstantHoverDelegate, getDefaultHoverDelegate } from "../../../base/browser/ui/hover/hoverDelegateFactory.js";
class CompositePart extends Part {
  constructor(notificationService, storageService, contextMenuService, layoutService, keybindingService, hoverService, instantiationService, themeService, registry, activeCompositeSettingsKey, defaultCompositeId, nameForTelemetry, compositeCSSClass, titleForegroundColor, titleBorderColor, id, options) {
    super(id, options, themeService, storageService, layoutService);
    this.notificationService = notificationService;
    this.storageService = storageService;
    this.contextMenuService = contextMenuService;
    this.keybindingService = keybindingService;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.registry = registry;
    this.activeCompositeSettingsKey = activeCompositeSettingsKey;
    this.defaultCompositeId = defaultCompositeId;
    this.nameForTelemetry = nameForTelemetry;
    this.compositeCSSClass = compositeCSSClass;
    this.titleForegroundColor = titleForegroundColor;
    this.titleBorderColor = titleBorderColor;
    this.onDidCompositeOpen = this._register(new Emitter());
    this.onDidCompositeClose = this._register(new Emitter());
    this.mapCompositeToCompositeContainer = /* @__PURE__ */ new Map();
    this.mapActionsBindingToComposite = /* @__PURE__ */ new Map();
    this.instantiatedCompositeItems = /* @__PURE__ */ new Map();
    this.actionsListener = this._register(new MutableDisposable());
    this.lastActiveCompositeId = storageService.get(activeCompositeSettingsKey, StorageScope.WORKSPACE, this.defaultCompositeId);
    this.toolbarHoverDelegate = this._register(createInstantHoverDelegate());
    this.trailingSeparator = options.trailingSeparator ?? false;
  }
  openComposite(id, focus) {
    if (this.activeComposite?.getId() === id) {
      if (focus) {
        this.activeComposite.focus();
      }
      return this.activeComposite;
    }
    if (!this.element) {
      return;
    }
    return this.doOpenComposite(id, focus);
  }
  doOpenComposite(id, focus = false) {
    const currentCompositeOpenToken = defaultGenerator.nextId();
    this.currentCompositeOpenToken = currentCompositeOpenToken;
    if (this.activeComposite) {
      this.hideActiveComposite();
    }
    this.updateTitle(id);
    const composite = this.createComposite(id, true);
    if (this.currentCompositeOpenToken !== currentCompositeOpenToken || this.activeComposite && this.activeComposite.getId() !== composite.getId()) {
      return void 0;
    }
    if (this.activeComposite?.getId() === composite.getId()) {
      if (focus) {
        composite.focus();
      }
      this.onDidCompositeOpen.fire({ composite, focus });
      return composite;
    }
    this.showComposite(composite);
    if (focus) {
      composite.focus();
    }
    if (composite) {
      this.onDidCompositeOpen.fire({ composite, focus });
    }
    return composite;
  }
  createComposite(id, isActive) {
    const compositeItem = this.instantiatedCompositeItems.get(id);
    if (compositeItem) {
      return compositeItem.composite;
    }
    const compositeDescriptor = this.registry.getComposite(id);
    if (compositeDescriptor) {
      const that = this;
      const compositeProgressIndicator = new ScopedProgressIndicator(assertReturnsDefined(this.progressBar), this._register(new class extends AbstractProgressScope {
        constructor() {
          super(compositeDescriptor.id, !!isActive);
          this._register(that.onDidCompositeOpen.event((e) => this.onScopeOpened(e.composite.getId())));
          this._register(that.onDidCompositeClose.event((e) => this.onScopeClosed(e.getId())));
        }
      }()));
      const compositeInstantiationService = this._register(this.instantiationService.createChild(new ServiceCollection(
        [IEditorProgressService, compositeProgressIndicator]
        // provide the editor progress service for any editors instantiated within the composite
      )));
      const composite = compositeDescriptor.instantiate(compositeInstantiationService);
      const disposable = new DisposableStore();
      this.instantiatedCompositeItems.set(id, { composite, disposable, progress: compositeProgressIndicator });
      disposable.add(composite.onTitleAreaUpdate(() => this.onTitleAreaUpdate(composite.getId()), this));
      disposable.add(compositeInstantiationService);
      return composite;
    }
    throw new Error(`Unable to find composite with id ${id}`);
  }
  showComposite(composite) {
    this.activeComposite = composite;
    const id = this.activeComposite.getId();
    if (id !== this.defaultCompositeId) {
      this.storageService.store(this.activeCompositeSettingsKey, id, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(this.activeCompositeSettingsKey, StorageScope.WORKSPACE);
    }
    this.lastActiveCompositeId = this.activeComposite.getId();
    let compositeContainer = this.mapCompositeToCompositeContainer.get(composite.getId());
    if (!compositeContainer) {
      compositeContainer = $(".composite");
      compositeContainer.classList.add(...this.compositeCSSClass.split(" "));
      compositeContainer.id = composite.getId();
      composite.create(compositeContainer);
      composite.updateStyles();
      this.mapCompositeToCompositeContainer.set(composite.getId(), compositeContainer);
    }
    if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
      return void 0;
    }
    this.contentArea?.appendChild(compositeContainer);
    show(compositeContainer);
    if (this.toolBar) {
      this.toolBar.actionRunner = composite.getActionRunner();
    }
    const descriptor = this.registry.getComposite(composite.getId());
    if (descriptor && descriptor.name !== composite.getTitle()) {
      this.updateTitle(composite.getId(), composite.getTitle());
    }
    let actionsBinding = this.mapActionsBindingToComposite.get(composite.getId());
    if (!actionsBinding) {
      actionsBinding = this.collectCompositeActions(composite);
      this.mapActionsBindingToComposite.set(composite.getId(), actionsBinding);
    }
    actionsBinding();
    if (this.toolBar) {
      this.actionsListener.value = this.toolBar.actionRunner.onDidRun((e) => {
        if (e.error && !isCancellationError(e.error)) {
          this.notificationService.error(e.error);
        }
      });
    }
    composite.setVisible(true);
    if (!this.activeComposite || composite.getId() !== this.activeComposite.getId()) {
      return;
    }
    if (this.contentAreaSize) {
      composite.layout(this.contentAreaSize);
    }
    if (this.boundarySashes) {
      composite.setBoundarySashes(this.boundarySashes);
    }
  }
  onTitleAreaUpdate(compositeId) {
    const composite = this.instantiatedCompositeItems.get(compositeId);
    if (composite) {
      this.updateTitle(compositeId, composite.composite.getTitle());
    }
    if (this.activeComposite?.getId() === compositeId) {
      const actionsBinding = this.collectCompositeActions(this.activeComposite);
      this.mapActionsBindingToComposite.set(this.activeComposite.getId(), actionsBinding);
      actionsBinding();
    } else {
      this.mapActionsBindingToComposite.delete(compositeId);
    }
  }
  updateTitle(compositeId, compositeTitle) {
    const compositeDescriptor = this.registry.getComposite(compositeId);
    if (!compositeDescriptor || !this.titleLabel) {
      return;
    }
    if (!compositeTitle) {
      compositeTitle = compositeDescriptor.name;
    }
    const keybinding = this.keybindingService.lookupKeybinding(compositeId);
    this.titleLabel.updateTitle(compositeId, compositeTitle, keybinding?.getLabel() ?? void 0);
    this.toolBar?.setAriaLabel(localize("ariaCompositeToolbarLabel", "{0} actions", compositeTitle));
  }
  collectCompositeActions(composite) {
    const menuIds = composite?.getMenuIds();
    const primaryActions = composite?.getActions().slice(0) || [];
    const secondaryActions = composite?.getSecondaryActions().slice(0) || [];
    if (this.toolBar) {
      this.toolBar.context = this.actionsContextProvider();
    }
    return () => {
      this.toolBar?.setActions(prepareActions(primaryActions), prepareActions(secondaryActions), menuIds);
      this.titleArea?.classList.toggle("has-actions", primaryActions.length > 0 || secondaryActions.length > 0);
    };
  }
  getActiveComposite() {
    return this.activeComposite;
  }
  getLastActiveCompositeId() {
    return this.lastActiveCompositeId;
  }
  hideActiveComposite() {
    if (!this.activeComposite) {
      return void 0;
    }
    const composite = this.activeComposite;
    this.activeComposite = void 0;
    const compositeContainer = this.mapCompositeToCompositeContainer.get(composite.getId());
    composite.setVisible(false);
    if (compositeContainer) {
      compositeContainer.remove();
      hide(compositeContainer);
    }
    this.progressBar?.stop().hide();
    if (this.toolBar) {
      this.collectCompositeActions()();
    }
    this.onDidCompositeClose.fire(composite);
    return composite;
  }
  createTitleArea(parent) {
    if (!this.options.hasTitle) {
      return void 0;
    }
    const titleArea = append(parent, $(".composite"));
    titleArea.classList.add("title");
    this.titleLabel = this.createTitleLabel(titleArea);
    const titleActionsContainer = append(titleArea, $(".title-actions"));
    this.toolBar = this._register(this.instantiationService.createInstance(WorkbenchToolBar, titleActionsContainer, {
      actionViewItemProvider: (action, options) => this.actionViewItemProvider(action, options),
      orientation: ActionsOrientation.HORIZONTAL,
      getKeyBinding: (action) => this.keybindingService.lookupKeybinding(action.id),
      anchorAlignmentProvider: () => this.getTitleAreaDropDownAnchorAlignment(),
      toggleMenuTitle: localize("viewsAndMoreActions", "Views and More Actions..."),
      telemetrySource: this.nameForTelemetry,
      hoverDelegate: this.toolbarHoverDelegate,
      trailingSeparator: this.trailingSeparator
    }));
    this.collectCompositeActions()();
    return titleArea;
  }
  createTitleLabel(parent) {
    const titleContainer = append(parent, $(".title-label"));
    const titleLabel = append(titleContainer, $("h2"));
    this.titleLabelElement = titleLabel;
    const hover = this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), titleLabel, ""));
    const $this = this;
    return {
      updateTitle: (id, title, keybinding) => {
        if (!this.activeComposite || this.activeComposite.getId() === id) {
          titleLabel.textContent = title;
          hover.update(keybinding ? localize("titleTooltip", "{0} ({1})", title, keybinding) : title);
        }
      },
      updateStyles: () => {
        titleLabel.style.color = $this.titleForegroundColor ? $this.getColor($this.titleForegroundColor) || "" : "";
        const borderColor = $this.titleBorderColor ? $this.getColor($this.titleBorderColor) : void 0;
        parent.style.borderBottom = borderColor ? `1px solid ${borderColor}` : "";
      }
    };
  }
  createHeaderArea() {
    return $(".composite");
  }
  createFooterArea() {
    return $(".composite");
  }
  updateStyles() {
    super.updateStyles();
    this.titleLabel?.updateStyles();
  }
  actionViewItemProvider(action, options) {
    if (this.activeComposite) {
      return this.activeComposite.getActionViewItem(action, options);
    }
    return createActionViewItem(this.instantiationService, action, options);
  }
  actionsContextProvider() {
    if (this.activeComposite) {
      return this.activeComposite.getActionsContext();
    }
    return null;
  }
  createContentArea(parent) {
    const contentContainer = append(parent, $(".content"));
    this.progressBar = this._register(new ProgressBar(contentContainer, defaultProgressBarStyles));
    this.progressBar.hide();
    return contentContainer;
  }
  getProgressIndicator(id) {
    const compositeItem = this.instantiatedCompositeItems.get(id);
    return compositeItem ? compositeItem.progress : void 0;
  }
  getTitleAreaDropDownAnchorAlignment() {
    return AnchorAlignment.RIGHT;
  }
  layout(width, height, top, left) {
    super.layout(width, height, top, left);
    this.contentAreaSize = Dimension.lift(super.layoutContents(width, height).contentSize);
    this.activeComposite?.layout(this.contentAreaSize);
  }
  setBoundarySashes(sashes) {
    this.boundarySashes = sashes;
    this.activeComposite?.setBoundarySashes(sashes);
  }
  removeComposite(compositeId) {
    if (this.activeComposite?.getId() === compositeId) {
      return false;
    }
    this.mapCompositeToCompositeContainer.delete(compositeId);
    this.mapActionsBindingToComposite.delete(compositeId);
    const compositeItem = this.instantiatedCompositeItems.get(compositeId);
    if (compositeItem) {
      compositeItem.composite.dispose();
      dispose(compositeItem.disposable);
      this.instantiatedCompositeItems.delete(compositeId);
    }
    return true;
  }
  dispose() {
    this.mapCompositeToCompositeContainer.clear();
    this.mapActionsBindingToComposite.clear();
    this.instantiatedCompositeItems.forEach((compositeItem) => {
      compositeItem.composite.dispose();
      dispose(compositeItem.disposable);
    });
    this.instantiatedCompositeItems.clear();
    super.dispose();
  }
}
export {
  CompositePart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2NvbXBvc2l0ZVBhcnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY29tcG9zaXRlcGFydC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEdlbmVyYXRvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2lkR2VuZXJhdG9yLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBkaXNwb3NlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25zT3JpZW50YXRpb24sIElBY3Rpb25WaWV3SXRlbSwgcHJlcGFyZUFjdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBQcm9ncmVzc0JhciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9wcm9ncmVzc2Jhci9wcm9ncmVzc2Jhci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQYXJ0LCBJUGFydE9wdGlvbnMgfSBmcm9tICcuLi9wYXJ0LmpzJztcbmltcG9ydCB7IENvbXBvc2l0ZSwgQ29tcG9zaXRlUmVnaXN0cnkgfSBmcm9tICcuLi9jb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSUNvbXBvc2l0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzSW5kaWNhdG9yLCBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaW1lbnNpb24sIGFwcGVuZCwgJCwgaGlkZSwgc2hvdyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RQcm9ncmVzc1Njb3BlLCBTY29wZWRQcm9ncmVzc0luZGljYXRvciB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL3Byb2dyZXNzL2Jyb3dzZXIvcHJvZ3Jlc3NJbmRpY2F0b3IuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IGRlZmF1bHRQcm9ncmVzc0JhclN0eWxlcyB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSwgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHR5cGUgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbXBvc2l0ZVRpdGxlTGFiZWwge1xuXG5cdC8qKlxuXHQgKiBBc2tzIHRvIHVwZGF0ZSB0aGUgdGl0bGUgZm9yIHRoZSBjb21wb3NpdGUgd2l0aCB0aGUgZ2l2ZW4gSUQuXG5cdCAqL1xuXHR1cGRhdGVUaXRsZShpZDogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCBrZXliaW5kaW5nPzogc3RyaW5nKTogdm9pZDtcblxuXHQvKipcblx0ICogQ2FsbGVkIHdoZW4gdGhlbWluZyBpbmZvcm1hdGlvbiBjaGFuZ2VzLlxuXHQgKi9cblx0dXBkYXRlU3R5bGVzKCk6IHZvaWQ7XG59XG5cbmludGVyZmFjZSBDb21wb3NpdGVJdGVtIHtcblx0cmVhZG9ubHkgY29tcG9zaXRlOiBDb21wb3NpdGU7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXHRyZWFkb25seSBwcm9ncmVzczogSVByb2dyZXNzSW5kaWNhdG9yO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wb3NpdGVQYXJ0T3B0aW9ucyBleHRlbmRzIElQYXJ0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHRyYWlsaW5nU2VwYXJhdG9yPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIENvbXBvc2l0ZVBhcnQ8VCBleHRlbmRzIENvbXBvc2l0ZSwgTWVtZW50b1R5cGUgZXh0ZW5kcyBvYmplY3QgPSBvYmplY3Q+IGV4dGVuZHMgUGFydDxNZW1lbnRvVHlwZT4ge1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBvbkRpZENvbXBvc2l0ZU9wZW4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGNvbXBvc2l0ZTogSUNvbXBvc2l0ZTsgZm9jdXM6IGJvb2xlYW4gfT4oKSk7XG5cdHByb3RlY3RlZCByZWFkb25seSBvbkRpZENvbXBvc2l0ZUNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNvbXBvc2l0ZT4oKSk7XG5cblx0cHJvdGVjdGVkIHRvb2xCYXI6IFdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCB0aXRsZUxhYmVsRWxlbWVudDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByb3RlY3RlZCByZWFkb25seSB0b29sYmFySG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBtYXBDb21wb3NpdGVUb0NvbXBvc2l0ZUNvbnRhaW5lciA9IG5ldyBNYXA8c3RyaW5nLCBIVE1MRWxlbWVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBtYXBBY3Rpb25zQmluZGluZ1RvQ29tcG9zaXRlID0gbmV3IE1hcDxzdHJpbmcsICgpID0+IHZvaWQ+KCk7XG5cdHByaXZhdGUgYWN0aXZlQ29tcG9zaXRlOiBDb21wb3NpdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbGFzdEFjdGl2ZUNvbXBvc2l0ZUlkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGVkQ29tcG9zaXRlSXRlbXMgPSBuZXcgTWFwPHN0cmluZywgQ29tcG9zaXRlSXRlbT4oKTtcblx0cHJvdGVjdGVkIHRpdGxlTGFiZWw6IElDb21wb3NpdGVUaXRsZUxhYmVsIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByb2dyZXNzQmFyOiBQcm9ncmVzc0JhciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjb250ZW50QXJlYVNpemU6IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBhY3Rpb25zTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdHByaXZhdGUgY3VycmVudENvbXBvc2l0ZU9wZW5Ub2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGJvdW5kYXJ5U2FzaGVzOiBJQm91bmRhcnlTYXNoZXMgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJhaWxpbmdTZXBhcmF0b3I6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRwcm90ZWN0ZWQgcmVhZG9ubHkgcmVnaXN0cnk6IENvbXBvc2l0ZVJlZ2lzdHJ5PFQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWN0aXZlQ29tcG9zaXRlU2V0dGluZ3NLZXk6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRlZmF1bHRDb21wb3NpdGVJZDogc3RyaW5nLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBuYW1lRm9yVGVsZW1ldHJ5OiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb21wb3NpdGVDU1NDbGFzczogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGl0bGVGb3JlZ3JvdW5kQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlQm9yZGVyQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRpZDogc3RyaW5nLFxuXHRcdG9wdGlvbnM6IElDb21wb3NpdGVQYXJ0T3B0aW9uc1xuXHQpIHtcblx0XHRzdXBlcihpZCwgb3B0aW9ucywgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cblx0XHR0aGlzLmxhc3RBY3RpdmVDb21wb3NpdGVJZCA9IHN0b3JhZ2VTZXJ2aWNlLmdldChhY3RpdmVDb21wb3NpdGVTZXR0aW5nc0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgdGhpcy5kZWZhdWx0Q29tcG9zaXRlSWQpO1xuXHRcdHRoaXMudG9vbGJhckhvdmVyRGVsZWdhdGUgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHR0aGlzLnRyYWlsaW5nU2VwYXJhdG9yID0gb3B0aW9ucy50cmFpbGluZ1NlcGFyYXRvciA/PyBmYWxzZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvcGVuQ29tcG9zaXRlKGlkOiBzdHJpbmcsIGZvY3VzPzogYm9vbGVhbik6IENvbXBvc2l0ZSB8IHVuZGVmaW5lZCB7XG5cblx0XHQvLyBDaGVjayBpZiBjb21wb3NpdGUgYWxyZWFkeSB2aXNpYmxlIGFuZCBqdXN0IGZvY3VzIGluIHRoYXQgY2FzZVxuXHRcdGlmICh0aGlzLmFjdGl2ZUNvbXBvc2l0ZT8uZ2V0SWQoKSA9PT0gaWQpIHtcblx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5mb2N1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBGdWxsZmlsbCBwcm9taXNlIHdpdGggY29tcG9zaXRlIHRoYXQgaXMgYmVpbmcgb3BlbmVkXG5cdFx0XHRyZXR1cm4gdGhpcy5hY3RpdmVDb21wb3NpdGU7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgY2Fubm90IG9wZW4gdGhlIGNvbXBvc2l0ZSBpZiB3ZSBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgeWV0XG5cdFx0aWYgKCF0aGlzLmVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBPcGVuXG5cdFx0cmV0dXJuIHRoaXMuZG9PcGVuQ29tcG9zaXRlKGlkLCBmb2N1cyk7XG5cdH1cblxuXHRwcml2YXRlIGRvT3BlbkNvbXBvc2l0ZShpZDogc3RyaW5nLCBmb2N1czogYm9vbGVhbiA9IGZhbHNlKTogQ29tcG9zaXRlIHwgdW5kZWZpbmVkIHtcblxuXHRcdC8vIFVzZSBhIGdlbmVyYXRlZCB0b2tlbiB0byBhdm9pZCByYWNlIGNvbmRpdGlvbnMgZnJvbSBsb25nIHJ1bm5pbmcgcHJvbWlzZXNcblx0XHRjb25zdCBjdXJyZW50Q29tcG9zaXRlT3BlblRva2VuID0gZGVmYXVsdEdlbmVyYXRvci5uZXh0SWQoKTtcblx0XHR0aGlzLmN1cnJlbnRDb21wb3NpdGVPcGVuVG9rZW4gPSBjdXJyZW50Q29tcG9zaXRlT3BlblRva2VuO1xuXG5cdFx0Ly8gSGlkZSBjdXJyZW50XG5cdFx0aWYgKHRoaXMuYWN0aXZlQ29tcG9zaXRlKSB7XG5cdFx0XHR0aGlzLmhpZGVBY3RpdmVDb21wb3NpdGUoKTtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgVGl0bGVcblx0XHR0aGlzLnVwZGF0ZVRpdGxlKGlkKTtcblxuXHRcdC8vIENyZWF0ZSBjb21wb3NpdGVcblx0XHRjb25zdCBjb21wb3NpdGUgPSB0aGlzLmNyZWF0ZUNvbXBvc2l0ZShpZCwgdHJ1ZSk7XG5cblx0XHQvLyBDaGVjayBpZiBhbm90aGVyIGNvbXBvc2l0ZSBvcGVuZWQgbWVhbndoaWxlIGFuZCByZXR1cm4gaW4gdGhhdCBjYXNlXG5cdFx0aWYgKCh0aGlzLmN1cnJlbnRDb21wb3NpdGVPcGVuVG9rZW4gIT09IGN1cnJlbnRDb21wb3NpdGVPcGVuVG9rZW4pIHx8ICh0aGlzLmFjdGl2ZUNvbXBvc2l0ZSAmJiB0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5nZXRJZCgpICE9PSBjb21wb3NpdGUuZ2V0SWQoKSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgY29tcG9zaXRlIGFscmVhZHkgdmlzaWJsZSBhbmQganVzdCBmb2N1cyBpbiB0aGF0IGNhc2Vcblx0XHRpZiAodGhpcy5hY3RpdmVDb21wb3NpdGU/LmdldElkKCkgPT09IGNvbXBvc2l0ZS5nZXRJZCgpKSB7XG5cdFx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdFx0Y29tcG9zaXRlLmZvY3VzKCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub25EaWRDb21wb3NpdGVPcGVuLmZpcmUoeyBjb21wb3NpdGUsIGZvY3VzIH0pO1xuXHRcdFx0cmV0dXJuIGNvbXBvc2l0ZTtcblx0XHR9XG5cblx0XHQvLyBTaG93IENvbXBvc2l0ZSBhbmQgRm9jdXNcblx0XHR0aGlzLnNob3dDb21wb3NpdGUoY29tcG9zaXRlKTtcblx0XHRpZiAoZm9jdXMpIHtcblx0XHRcdGNvbXBvc2l0ZS5mb2N1cygpO1xuXHRcdH1cblxuXHRcdC8vIFJldHVybiB3aXRoIHRoZSBjb21wb3NpdGUgdGhhdCBpcyBiZWluZyBvcGVuZWRcblx0XHRpZiAoY29tcG9zaXRlKSB7XG5cdFx0XHR0aGlzLm9uRGlkQ29tcG9zaXRlT3Blbi5maXJlKHsgY29tcG9zaXRlLCBmb2N1cyB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcG9zaXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUNvbXBvc2l0ZShpZDogc3RyaW5nLCBpc0FjdGl2ZT86IGJvb2xlYW4pOiBDb21wb3NpdGUge1xuXG5cdFx0Ly8gQ2hlY2sgaWYgY29tcG9zaXRlIGlzIGFscmVhZHkgY3JlYXRlZFxuXHRcdGNvbnN0IGNvbXBvc2l0ZUl0ZW0gPSB0aGlzLmluc3RhbnRpYXRlZENvbXBvc2l0ZUl0ZW1zLmdldChpZCk7XG5cdFx0aWYgKGNvbXBvc2l0ZUl0ZW0pIHtcblx0XHRcdHJldHVybiBjb21wb3NpdGVJdGVtLmNvbXBvc2l0ZTtcblx0XHR9XG5cblx0XHQvLyBJbnN0YW50aWF0ZSBjb21wb3NpdGUgZnJvbSByZWdpc3RyeSBvdGhlcndpc2Vcblx0XHRjb25zdCBjb21wb3NpdGVEZXNjcmlwdG9yID0gdGhpcy5yZWdpc3RyeS5nZXRDb21wb3NpdGUoaWQpO1xuXHRcdGlmIChjb21wb3NpdGVEZXNjcmlwdG9yKSB7XG5cdFx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRcdGNvbnN0IGNvbXBvc2l0ZVByb2dyZXNzSW5kaWNhdG9yID0gbmV3IFNjb3BlZFByb2dyZXNzSW5kaWNhdG9yKGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucHJvZ3Jlc3NCYXIpLCB0aGlzLl9yZWdpc3RlcihuZXcgY2xhc3MgZXh0ZW5kcyBBYnN0cmFjdFByb2dyZXNzU2NvcGUge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcihjb21wb3NpdGVEZXNjcmlwdG9yIS5pZCwgISFpc0FjdGl2ZSk7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhhdC5vbkRpZENvbXBvc2l0ZU9wZW4uZXZlbnQoZSA9PiB0aGlzLm9uU2NvcGVPcGVuZWQoZS5jb21wb3NpdGUuZ2V0SWQoKSkpKTtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGF0Lm9uRGlkQ29tcG9zaXRlQ2xvc2UuZXZlbnQoZSA9PiB0aGlzLm9uU2NvcGVDbG9zZWQoZS5nZXRJZCgpKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpKTtcblx0XHRcdGNvbnN0IGNvbXBvc2l0ZUluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRcdFtJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLCBjb21wb3NpdGVQcm9ncmVzc0luZGljYXRvcl0gLy8gcHJvdmlkZSB0aGUgZWRpdG9yIHByb2dyZXNzIHNlcnZpY2UgZm9yIGFueSBlZGl0b3JzIGluc3RhbnRpYXRlZCB3aXRoaW4gdGhlIGNvbXBvc2l0ZVxuXHRcdFx0KSkpO1xuXG5cdFx0XHRjb25zdCBjb21wb3NpdGUgPSBjb21wb3NpdGVEZXNjcmlwdG9yLmluc3RhbnRpYXRlKGNvbXBvc2l0ZUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdC8vIFJlbWVtYmVyIGFzIEluc3RhbnRpYXRlZFxuXHRcdFx0dGhpcy5pbnN0YW50aWF0ZWRDb21wb3NpdGVJdGVtcy5zZXQoaWQsIHsgY29tcG9zaXRlLCBkaXNwb3NhYmxlLCBwcm9ncmVzczogY29tcG9zaXRlUHJvZ3Jlc3NJbmRpY2F0b3IgfSk7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIHRvIHRpdGxlIGFyZWEgdXBkYXRlIGV2ZW50cyBmcm9tIHRoZSBjb21wb3NpdGVcblx0XHRcdGRpc3Bvc2FibGUuYWRkKGNvbXBvc2l0ZS5vblRpdGxlQXJlYVVwZGF0ZSgoKSA9PiB0aGlzLm9uVGl0bGVBcmVhVXBkYXRlKGNvbXBvc2l0ZS5nZXRJZCgpKSwgdGhpcykpO1xuXHRcdFx0ZGlzcG9zYWJsZS5hZGQoY29tcG9zaXRlSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0XHRyZXR1cm4gY29tcG9zaXRlO1xuXHRcdH1cblxuXHRcdHRocm93IG5ldyBFcnJvcihgVW5hYmxlIHRvIGZpbmQgY29tcG9zaXRlIHdpdGggaWQgJHtpZH1gKTtcblx0fVxuXG5cdHByb3RlY3RlZCBzaG93Q29tcG9zaXRlKGNvbXBvc2l0ZTogQ29tcG9zaXRlKTogdm9pZCB7XG5cblx0XHQvLyBSZW1lbWJlciBDb21wb3NpdGVcblx0XHR0aGlzLmFjdGl2ZUNvbXBvc2l0ZSA9IGNvbXBvc2l0ZTtcblxuXHRcdC8vIFN0b3JlIGluIHByZWZlcmVuY2VzXG5cdFx0Y29uc3QgaWQgPSB0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5nZXRJZCgpO1xuXHRcdGlmIChpZCAhPT0gdGhpcy5kZWZhdWx0Q29tcG9zaXRlSWQpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUodGhpcy5hY3RpdmVDb21wb3NpdGVTZXR0aW5nc0tleSwgaWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKHRoaXMuYWN0aXZlQ29tcG9zaXRlU2V0dGluZ3NLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdH1cblxuXHRcdC8vIFJlbWVtYmVyXG5cdFx0dGhpcy5sYXN0QWN0aXZlQ29tcG9zaXRlSWQgPSB0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5nZXRJZCgpO1xuXG5cdFx0Ly8gQ29tcG9zaXRlcyBjcmVhdGVkIGZvciB0aGUgZmlyc3QgdGltZVxuXHRcdGxldCBjb21wb3NpdGVDb250YWluZXIgPSB0aGlzLm1hcENvbXBvc2l0ZVRvQ29tcG9zaXRlQ29udGFpbmVyLmdldChjb21wb3NpdGUuZ2V0SWQoKSk7XG5cdFx0aWYgKCFjb21wb3NpdGVDb250YWluZXIpIHtcblxuXHRcdFx0Ly8gQnVpbGQgQ29udGFpbmVyIG9mZi1ET01cblx0XHRcdGNvbXBvc2l0ZUNvbnRhaW5lciA9ICQoJy5jb21wb3NpdGUnKTtcblx0XHRcdGNvbXBvc2l0ZUNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKC4uLnRoaXMuY29tcG9zaXRlQ1NTQ2xhc3Muc3BsaXQoJyAnKSk7XG5cdFx0XHRjb21wb3NpdGVDb250YWluZXIuaWQgPSBjb21wb3NpdGUuZ2V0SWQoKTtcblxuXHRcdFx0Y29tcG9zaXRlLmNyZWF0ZShjb21wb3NpdGVDb250YWluZXIpO1xuXHRcdFx0Y29tcG9zaXRlLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0XHQvLyBSZW1lbWJlciBjb21wb3NpdGUgY29udGFpbmVyXG5cdFx0XHR0aGlzLm1hcENvbXBvc2l0ZVRvQ29tcG9zaXRlQ29udGFpbmVyLnNldChjb21wb3NpdGUuZ2V0SWQoKSwgY29tcG9zaXRlQ29udGFpbmVyKTtcblx0XHR9XG5cblx0XHQvLyBGaWxsIENvbnRlbnQgYW5kIEFjdGlvbnNcblx0XHQvLyBNYWtlIHN1cmUgdGhhdCB0aGUgdXNlciBtZWFud2hpbGUgZGlkIG5vdCBvcGVuIGFub3RoZXIgY29tcG9zaXRlIG9yIGNsb3NlZCB0aGUgcGFydCBjb250YWluaW5nIHRoZSBjb21wb3NpdGVcblx0XHRpZiAoIXRoaXMuYWN0aXZlQ29tcG9zaXRlIHx8IGNvbXBvc2l0ZS5nZXRJZCgpICE9PSB0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5nZXRJZCgpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFRha2UgQ29tcG9zaXRlIG9uLURPTSBhbmQgc2hvd1xuXHRcdHRoaXMuY29udGVudEFyZWE/LmFwcGVuZENoaWxkKGNvbXBvc2l0ZUNvbnRhaW5lcik7XG5cdFx0c2hvdyhjb21wb3NpdGVDb250YWluZXIpO1xuXG5cdFx0Ly8gU2V0dXAgYWN0aW9uIHJ1bm5lclxuXHRcdGlmICh0aGlzLnRvb2xCYXIpIHtcblx0XHRcdHRoaXMudG9vbEJhci5hY3Rpb25SdW5uZXIgPSBjb21wb3NpdGUuZ2V0QWN0aW9uUnVubmVyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRpdGxlIHdpdGggY29tcG9zaXRlIHRpdGxlIGlmIGl0IGRpZmZlcnMgZnJvbSBkZXNjcmlwdG9yXG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHRoaXMucmVnaXN0cnkuZ2V0Q29tcG9zaXRlKGNvbXBvc2l0ZS5nZXRJZCgpKTtcblx0XHRpZiAoZGVzY3JpcHRvciAmJiBkZXNjcmlwdG9yLm5hbWUgIT09IGNvbXBvc2l0ZS5nZXRUaXRsZSgpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlKGNvbXBvc2l0ZS5nZXRJZCgpLCBjb21wb3NpdGUuZ2V0VGl0bGUoKSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIENvbXBvc2l0ZSBBY3Rpb25zXG5cdFx0bGV0IGFjdGlvbnNCaW5kaW5nID0gdGhpcy5tYXBBY3Rpb25zQmluZGluZ1RvQ29tcG9zaXRlLmdldChjb21wb3NpdGUuZ2V0SWQoKSk7XG5cdFx0aWYgKCFhY3Rpb25zQmluZGluZykge1xuXHRcdFx0YWN0aW9uc0JpbmRpbmcgPSB0aGlzLmNvbGxlY3RDb21wb3NpdGVBY3Rpb25zKGNvbXBvc2l0ZSk7XG5cdFx0XHR0aGlzLm1hcEFjdGlvbnNCaW5kaW5nVG9Db21wb3NpdGUuc2V0KGNvbXBvc2l0ZS5nZXRJZCgpLCBhY3Rpb25zQmluZGluZyk7XG5cdFx0fVxuXHRcdGFjdGlvbnNCaW5kaW5nKCk7XG5cblx0XHQvLyBBY3Rpb24gUnVuIEhhbmRsaW5nXG5cdFx0aWYgKHRoaXMudG9vbEJhcikge1xuXHRcdFx0dGhpcy5hY3Rpb25zTGlzdGVuZXIudmFsdWUgPSB0aGlzLnRvb2xCYXIuYWN0aW9uUnVubmVyLm9uRGlkUnVuKGUgPT4ge1xuXG5cdFx0XHRcdC8vIENoZWNrIGZvciBFcnJvclxuXHRcdFx0XHRpZiAoZS5lcnJvciAmJiAhaXNDYW5jZWxsYXRpb25FcnJvcihlLmVycm9yKSkge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlLmVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gSW5kaWNhdGUgdG8gY29tcG9zaXRlIHRoYXQgaXQgaXMgbm93IHZpc2libGVcblx0XHRjb21wb3NpdGUuc2V0VmlzaWJsZSh0cnVlKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSB0aGF0IHRoZSB1c2VyIG1lYW53aGlsZSBkaWQgbm90IG9wZW4gYW5vdGhlciBjb21wb3NpdGUgb3IgY2xvc2VkIHRoZSBwYXJ0IGNvbnRhaW5pbmcgdGhlIGNvbXBvc2l0ZVxuXHRcdGlmICghdGhpcy5hY3RpdmVDb21wb3NpdGUgfHwgY29tcG9zaXRlLmdldElkKCkgIT09IHRoaXMuYWN0aXZlQ29tcG9zaXRlLmdldElkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBNYWtlIHN1cmUgdGhlIGNvbXBvc2l0ZSBpcyBsYXllZCBvdXRcblx0XHRpZiAodGhpcy5jb250ZW50QXJlYVNpemUpIHtcblx0XHRcdGNvbXBvc2l0ZS5sYXlvdXQodGhpcy5jb250ZW50QXJlYVNpemUpO1xuXHRcdH1cblxuXHRcdC8vIE1ha2Ugc3VyZSBib3VuZGFyeSBzYXNoZXMgYXJlIHByb3BhZ2F0ZWRcblx0XHRpZiAodGhpcy5ib3VuZGFyeVNhc2hlcykge1xuXHRcdFx0Y29tcG9zaXRlLnNldEJvdW5kYXJ5U2FzaGVzKHRoaXMuYm91bmRhcnlTYXNoZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvblRpdGxlQXJlYVVwZGF0ZShjb21wb3NpdGVJZDogc3RyaW5nKTogdm9pZCB7XG5cblx0XHQvLyBUaXRsZVxuXHRcdGNvbnN0IGNvbXBvc2l0ZSA9IHRoaXMuaW5zdGFudGlhdGVkQ29tcG9zaXRlSXRlbXMuZ2V0KGNvbXBvc2l0ZUlkKTtcblx0XHRpZiAoY29tcG9zaXRlKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVRpdGxlKGNvbXBvc2l0ZUlkLCBjb21wb3NpdGUuY29tcG9zaXRlLmdldFRpdGxlKCkpO1xuXHRcdH1cblxuXHRcdC8vIEFjdGl2ZSBDb21wb3NpdGVcblx0XHRpZiAodGhpcy5hY3RpdmVDb21wb3NpdGU/LmdldElkKCkgPT09IGNvbXBvc2l0ZUlkKSB7XG5cdFx0XHQvLyBBY3Rpb25zXG5cdFx0XHRjb25zdCBhY3Rpb25zQmluZGluZyA9IHRoaXMuY29sbGVjdENvbXBvc2l0ZUFjdGlvbnModGhpcy5hY3RpdmVDb21wb3NpdGUpO1xuXHRcdFx0dGhpcy5tYXBBY3Rpb25zQmluZGluZ1RvQ29tcG9zaXRlLnNldCh0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5nZXRJZCgpLCBhY3Rpb25zQmluZGluZyk7XG5cdFx0XHRhY3Rpb25zQmluZGluZygpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSBpbnZhbGlkYXRlIGFjdGlvbnMgYmluZGluZyBmb3IgbmV4dCB0aW1lIHdoZW4gdGhlIGNvbXBvc2l0ZSBiZWNvbWVzIHZpc2libGVcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMubWFwQWN0aW9uc0JpbmRpbmdUb0NvbXBvc2l0ZS5kZWxldGUoY29tcG9zaXRlSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGl0bGUoY29tcG9zaXRlSWQ6IHN0cmluZywgY29tcG9zaXRlVGl0bGU/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wb3NpdGVEZXNjcmlwdG9yID0gdGhpcy5yZWdpc3RyeS5nZXRDb21wb3NpdGUoY29tcG9zaXRlSWQpO1xuXHRcdGlmICghY29tcG9zaXRlRGVzY3JpcHRvciB8fCAhdGhpcy50aXRsZUxhYmVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFjb21wb3NpdGVUaXRsZSkge1xuXHRcdFx0Y29tcG9zaXRlVGl0bGUgPSBjb21wb3NpdGVEZXNjcmlwdG9yLm5hbWU7XG5cdFx0fVxuXG5cdFx0Y29uc3Qga2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhjb21wb3NpdGVJZCk7XG5cblx0XHR0aGlzLnRpdGxlTGFiZWwudXBkYXRlVGl0bGUoY29tcG9zaXRlSWQsIGNvbXBvc2l0ZVRpdGxlLCBrZXliaW5kaW5nPy5nZXRMYWJlbCgpID8/IHVuZGVmaW5lZCk7XG5cblx0XHR0aGlzLnRvb2xCYXI/LnNldEFyaWFMYWJlbChsb2NhbGl6ZSgnYXJpYUNvbXBvc2l0ZVRvb2xiYXJMYWJlbCcsIFwiezB9IGFjdGlvbnNcIiwgY29tcG9zaXRlVGl0bGUpKTtcblx0fVxuXG5cdHByaXZhdGUgY29sbGVjdENvbXBvc2l0ZUFjdGlvbnMoY29tcG9zaXRlPzogQ29tcG9zaXRlKTogKCkgPT4gdm9pZCB7XG5cblx0XHQvLyBGcm9tIENvbXBvc2l0ZVxuXHRcdGNvbnN0IG1lbnVJZHMgPSBjb21wb3NpdGU/LmdldE1lbnVJZHMoKTtcblx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdID0gY29tcG9zaXRlPy5nZXRBY3Rpb25zKCkuc2xpY2UoMCkgfHwgW107XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdID0gY29tcG9zaXRlPy5nZXRTZWNvbmRhcnlBY3Rpb25zKCkuc2xpY2UoMCkgfHwgW107XG5cblx0XHQvLyBVcGRhdGUgY29udGV4dFxuXHRcdGlmICh0aGlzLnRvb2xCYXIpIHtcblx0XHRcdHRoaXMudG9vbEJhci5jb250ZXh0ID0gdGhpcy5hY3Rpb25zQ29udGV4dFByb3ZpZGVyKCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGZuIHRvIHNldCBpbnRvIHRvb2xiYXJcblx0XHRyZXR1cm4gKCkgPT4ge1xuXHRcdFx0dGhpcy50b29sQmFyPy5zZXRBY3Rpb25zKHByZXBhcmVBY3Rpb25zKHByaW1hcnlBY3Rpb25zKSwgcHJlcGFyZUFjdGlvbnMoc2Vjb25kYXJ5QWN0aW9ucyksIG1lbnVJZHMpO1xuXHRcdFx0dGhpcy50aXRsZUFyZWE/LmNsYXNzTGlzdC50b2dnbGUoJ2hhcy1hY3Rpb25zJywgcHJpbWFyeUFjdGlvbnMubGVuZ3RoID4gMCB8fCBzZWNvbmRhcnlBY3Rpb25zLmxlbmd0aCA+IDApO1xuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0QWN0aXZlQ29tcG9zaXRlKCk6IElDb21wb3NpdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFjdGl2ZUNvbXBvc2l0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRMYXN0QWN0aXZlQ29tcG9zaXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5sYXN0QWN0aXZlQ29tcG9zaXRlSWQ7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaGlkZUFjdGl2ZUNvbXBvc2l0ZSgpOiBDb21wb3NpdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5hY3RpdmVDb21wb3NpdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIE5vdGhpbmcgdG8gZG9cblx0XHR9XG5cblx0XHRjb25zdCBjb21wb3NpdGUgPSB0aGlzLmFjdGl2ZUNvbXBvc2l0ZTtcblx0XHR0aGlzLmFjdGl2ZUNvbXBvc2l0ZSA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGNvbXBvc2l0ZUNvbnRhaW5lciA9IHRoaXMubWFwQ29tcG9zaXRlVG9Db21wb3NpdGVDb250YWluZXIuZ2V0KGNvbXBvc2l0ZS5nZXRJZCgpKTtcblxuXHRcdC8vIEluZGljYXRlIHRvIENvbXBvc2l0ZVxuXHRcdGNvbXBvc2l0ZS5zZXRWaXNpYmxlKGZhbHNlKTtcblxuXHRcdC8vIFRha2UgQ29udGFpbmVyIE9mZi1ET00gYW5kIGhpZGVcblx0XHRpZiAoY29tcG9zaXRlQ29udGFpbmVyKSB7XG5cdFx0XHRjb21wb3NpdGVDb250YWluZXIucmVtb3ZlKCk7XG5cdFx0XHRoaWRlKGNvbXBvc2l0ZUNvbnRhaW5lcik7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgYW55IHJ1bm5pbmcgUHJvZ3Jlc3Ncblx0XHR0aGlzLnByb2dyZXNzQmFyPy5zdG9wKCkuaGlkZSgpO1xuXG5cdFx0Ly8gRW1wdHkgQWN0aW9uc1xuXHRcdGlmICh0aGlzLnRvb2xCYXIpIHtcblx0XHRcdHRoaXMuY29sbGVjdENvbXBvc2l0ZUFjdGlvbnMoKSgpO1xuXHRcdH1cblx0XHR0aGlzLm9uRGlkQ29tcG9zaXRlQ2xvc2UuZmlyZShjb21wb3NpdGUpO1xuXG5cdFx0cmV0dXJuIGNvbXBvc2l0ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVUaXRsZUFyZWEocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5oYXNUaXRsZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBUaXRsZSBBcmVhIENvbnRhaW5lclxuXHRcdGNvbnN0IHRpdGxlQXJlYSA9IGFwcGVuZChwYXJlbnQsICQoJy5jb21wb3NpdGUnKSk7XG5cdFx0dGl0bGVBcmVhLmNsYXNzTGlzdC5hZGQoJ3RpdGxlJyk7XG5cblx0XHQvLyBMZWZ0IFRpdGxlIExhYmVsXG5cdFx0dGhpcy50aXRsZUxhYmVsID0gdGhpcy5jcmVhdGVUaXRsZUxhYmVsKHRpdGxlQXJlYSk7XG5cblx0XHQvLyBSaWdodCBBY3Rpb25zIENvbnRhaW5lclxuXHRcdGNvbnN0IHRpdGxlQWN0aW9uc0NvbnRhaW5lciA9IGFwcGVuZCh0aXRsZUFyZWEsICQoJy50aXRsZS1hY3Rpb25zJykpO1xuXG5cdFx0Ly8gVG9vbGJhclxuXHRcdHRoaXMudG9vbEJhciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoVG9vbEJhciwgdGl0bGVBY3Rpb25zQ29udGFpbmVyLCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB0aGlzLmFjdGlvblZpZXdJdGVtUHJvdmlkZXIoYWN0aW9uLCBvcHRpb25zKSxcblx0XHRcdG9yaWVudGF0aW9uOiBBY3Rpb25zT3JpZW50YXRpb24uSE9SSVpPTlRBTCxcblx0XHRcdGdldEtleUJpbmRpbmc6IGFjdGlvbiA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKSxcblx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiB0aGlzLmdldFRpdGxlQXJlYURyb3BEb3duQW5jaG9yQWxpZ25tZW50KCksXG5cdFx0XHR0b2dnbGVNZW51VGl0bGU6IGxvY2FsaXplKCd2aWV3c0FuZE1vcmVBY3Rpb25zJywgXCJWaWV3cyBhbmQgTW9yZSBBY3Rpb25zLi4uXCIpLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiB0aGlzLm5hbWVGb3JUZWxlbWV0cnksXG5cdFx0XHRob3ZlckRlbGVnYXRlOiB0aGlzLnRvb2xiYXJIb3ZlckRlbGVnYXRlLFxuXHRcdFx0dHJhaWxpbmdTZXBhcmF0b3I6IHRoaXMudHJhaWxpbmdTZXBhcmF0b3IsXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5jb2xsZWN0Q29tcG9zaXRlQWN0aW9ucygpKCk7XG5cblx0XHRyZXR1cm4gdGl0bGVBcmVhO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZVRpdGxlTGFiZWwocGFyZW50OiBIVE1MRWxlbWVudCk6IElDb21wb3NpdGVUaXRsZUxhYmVsIHtcblx0XHRjb25zdCB0aXRsZUNvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy50aXRsZS1sYWJlbCcpKTtcblx0XHRjb25zdCB0aXRsZUxhYmVsID0gYXBwZW5kKHRpdGxlQ29udGFpbmVyLCAkKCdoMicpKTtcblx0XHR0aGlzLnRpdGxlTGFiZWxFbGVtZW50ID0gdGl0bGVMYWJlbDtcblx0XHRjb25zdCBob3ZlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aXRsZUxhYmVsLCAnJykpO1xuXG5cdFx0Y29uc3QgJHRoaXMgPSB0aGlzO1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cGRhdGVUaXRsZTogKGlkLCB0aXRsZSwga2V5YmluZGluZykgPT4ge1xuXHRcdFx0XHQvLyBUaGUgdGl0bGUgbGFiZWwgaXMgc2hhcmVkIGZvciBhbGwgY29tcG9zaXRlcyBpbiB0aGUgYmFzZSBDb21wb3NpdGVQYXJ0XG5cdFx0XHRcdGlmICghdGhpcy5hY3RpdmVDb21wb3NpdGUgfHwgdGhpcy5hY3RpdmVDb21wb3NpdGUuZ2V0SWQoKSA9PT0gaWQpIHtcblx0XHRcdFx0XHR0aXRsZUxhYmVsLnRleHRDb250ZW50ID0gdGl0bGU7XG5cdFx0XHRcdFx0aG92ZXIudXBkYXRlKGtleWJpbmRpbmcgPyBsb2NhbGl6ZSgndGl0bGVUb29sdGlwJywgXCJ7MH0gKHsxfSlcIiwgdGl0bGUsIGtleWJpbmRpbmcpIDogdGl0bGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHR1cGRhdGVTdHlsZXM6ICgpID0+IHtcblx0XHRcdFx0dGl0bGVMYWJlbC5zdHlsZS5jb2xvciA9ICR0aGlzLnRpdGxlRm9yZWdyb3VuZENvbG9yID8gJHRoaXMuZ2V0Q29sb3IoJHRoaXMudGl0bGVGb3JlZ3JvdW5kQ29sb3IpIHx8ICcnIDogJyc7XG5cdFx0XHRcdGNvbnN0IGJvcmRlckNvbG9yID0gJHRoaXMudGl0bGVCb3JkZXJDb2xvciA/ICR0aGlzLmdldENvbG9yKCR0aGlzLnRpdGxlQm9yZGVyQ29sb3IpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRwYXJlbnQuc3R5bGUuYm9yZGVyQm90dG9tID0gYm9yZGVyQ29sb3IgPyBgMXB4IHNvbGlkICR7Ym9yZGVyQ29sb3J9YCA6ICcnO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlSGVhZGVyQXJlYSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuICQoJy5jb21wb3NpdGUnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVGb290ZXJBcmVhKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gJCgnLmNvbXBvc2l0ZScpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlU3R5bGVzKCk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZVN0eWxlcygpO1xuXG5cdFx0Ly8gRm9yd2FyZCB0byB0aXRsZSBsYWJlbCBpZiBwcmVzZW50XG5cdFx0dGhpcy50aXRsZUxhYmVsPy51cGRhdGVTdHlsZXMoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhY3Rpb25WaWV3SXRlbVByb3ZpZGVyKGFjdGlvbjogSUFjdGlvbiwgb3B0aW9uczogSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMpOiBJQWN0aW9uVmlld0l0ZW0gfCB1bmRlZmluZWQge1xuXG5cdFx0Ly8gQ2hlY2sgQWN0aXZlIENvbXBvc2l0ZVxuXHRcdGlmICh0aGlzLmFjdGl2ZUNvbXBvc2l0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWN0aXZlQ29tcG9zaXRlLmdldEFjdGlvblZpZXdJdGVtKGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNyZWF0ZUFjdGlvblZpZXdJdGVtKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWN0aW9uc0NvbnRleHRQcm92aWRlcigpOiB1bmtub3duIHtcblxuXHRcdC8vIENoZWNrIEFjdGl2ZSBDb21wb3NpdGVcblx0XHRpZiAodGhpcy5hY3RpdmVDb21wb3NpdGUpIHtcblx0XHRcdHJldHVybiB0aGlzLmFjdGl2ZUNvbXBvc2l0ZS5nZXRBY3Rpb25zQ29udGV4dCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGNyZWF0ZUNvbnRlbnRBcmVhKHBhcmVudDogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3QgY29udGVudENvbnRhaW5lciA9IGFwcGVuZChwYXJlbnQsICQoJy5jb250ZW50JykpO1xuXG5cdFx0dGhpcy5wcm9ncmVzc0JhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBQcm9ncmVzc0Jhcihjb250ZW50Q29udGFpbmVyLCBkZWZhdWx0UHJvZ3Jlc3NCYXJTdHlsZXMpKTtcblx0XHR0aGlzLnByb2dyZXNzQmFyLmhpZGUoKTtcblxuXHRcdHJldHVybiBjb250ZW50Q29udGFpbmVyO1xuXHR9XG5cblx0Z2V0UHJvZ3Jlc3NJbmRpY2F0b3IoaWQ6IHN0cmluZyk6IElQcm9ncmVzc0luZGljYXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29tcG9zaXRlSXRlbSA9IHRoaXMuaW5zdGFudGlhdGVkQ29tcG9zaXRlSXRlbXMuZ2V0KGlkKTtcblxuXHRcdHJldHVybiBjb21wb3NpdGVJdGVtID8gY29tcG9zaXRlSXRlbS5wcm9ncmVzcyA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRUaXRsZUFyZWFEcm9wRG93bkFuY2hvckFsaWdubWVudCgpOiBBbmNob3JBbGlnbm1lbnQge1xuXHRcdHJldHVybiBBbmNob3JBbGlnbm1lbnQuUklHSFQ7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIsIHRvcDogbnVtYmVyLCBsZWZ0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5sYXlvdXQod2lkdGgsIGhlaWdodCwgdG9wLCBsZWZ0KTtcblxuXHRcdC8vIExheW91dCBjb250ZW50c1xuXHRcdHRoaXMuY29udGVudEFyZWFTaXplID0gRGltZW5zaW9uLmxpZnQoc3VwZXIubGF5b3V0Q29udGVudHMod2lkdGgsIGhlaWdodCkuY29udGVudFNpemUpO1xuXG5cdFx0Ly8gTGF5b3V0IGNvbXBvc2l0ZVxuXHRcdHRoaXMuYWN0aXZlQ29tcG9zaXRlPy5sYXlvdXQodGhpcy5jb250ZW50QXJlYVNpemUpO1xuXHR9XG5cblx0c2V0Qm91bmRhcnlTYXNoZXM/KHNhc2hlczogSUJvdW5kYXJ5U2FzaGVzKTogdm9pZCB7XG5cdFx0dGhpcy5ib3VuZGFyeVNhc2hlcyA9IHNhc2hlcztcblx0XHR0aGlzLmFjdGl2ZUNvbXBvc2l0ZT8uc2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzKTtcblx0fVxuXG5cdHByb3RlY3RlZCByZW1vdmVDb21wb3NpdGUoY29tcG9zaXRlSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmFjdGl2ZUNvbXBvc2l0ZT8uZ2V0SWQoKSA9PT0gY29tcG9zaXRlSWQpIHtcblx0XHRcdHJldHVybiBmYWxzZTsgLy8gZG8gbm90IHJlbW92ZSBhY3RpdmUgY29tcG9zaXRlXG5cdFx0fVxuXG5cdFx0dGhpcy5tYXBDb21wb3NpdGVUb0NvbXBvc2l0ZUNvbnRhaW5lci5kZWxldGUoY29tcG9zaXRlSWQpO1xuXHRcdHRoaXMubWFwQWN0aW9uc0JpbmRpbmdUb0NvbXBvc2l0ZS5kZWxldGUoY29tcG9zaXRlSWQpO1xuXHRcdGNvbnN0IGNvbXBvc2l0ZUl0ZW0gPSB0aGlzLmluc3RhbnRpYXRlZENvbXBvc2l0ZUl0ZW1zLmdldChjb21wb3NpdGVJZCk7XG5cdFx0aWYgKGNvbXBvc2l0ZUl0ZW0pIHtcblx0XHRcdGNvbXBvc2l0ZUl0ZW0uY29tcG9zaXRlLmRpc3Bvc2UoKTtcblx0XHRcdGRpc3Bvc2UoY29tcG9zaXRlSXRlbS5kaXNwb3NhYmxlKTtcblx0XHRcdHRoaXMuaW5zdGFudGlhdGVkQ29tcG9zaXRlSXRlbXMuZGVsZXRlKGNvbXBvc2l0ZUlkKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5tYXBDb21wb3NpdGVUb0NvbXBvc2l0ZUNvbnRhaW5lci5jbGVhcigpO1xuXHRcdHRoaXMubWFwQWN0aW9uc0JpbmRpbmdUb0NvbXBvc2l0ZS5jbGVhcigpO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0ZWRDb21wb3NpdGVJdGVtcy5mb3JFYWNoKGNvbXBvc2l0ZUl0ZW0gPT4ge1xuXHRcdFx0Y29tcG9zaXRlSXRlbS5jb21wb3NpdGUuZGlzcG9zZSgpO1xuXHRcdFx0ZGlzcG9zZShjb21wb3NpdGVJdGVtLmRpc3Bvc2FibGUpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5pbnN0YW50aWF0ZWRDb21wb3NpdGVJdGVtcy5jbGVhcigpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx3QkFBd0I7QUFDakMsU0FBc0IsU0FBUyxpQkFBaUIseUJBQTBCO0FBQzFFLFNBQVMsZUFBZTtBQUN4QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFxQyxzQkFBc0I7QUFDcEUsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxZQUEwQjtBQUluQyxTQUEwQixjQUFjLHFCQUFxQjtBQUc3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUE2Qiw4QkFBOEI7QUFJM0QsU0FBUyxXQUFXLFFBQVEsR0FBRyxNQUFNLFlBQVk7QUFDakQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUIsK0JBQStCO0FBQy9ELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0NBQWdDO0FBSXpDLFNBQVMsNEJBQTRCLCtCQUErQjtBQTBCN0QsTUFBZSxzQkFBZ0YsS0FBa0I7QUFBQSxFQXNCdkgsWUFDa0IscUJBQ0UsZ0JBQ0Esb0JBQ25CLGVBQ21CLG1CQUNGLGNBQ0Usc0JBQ25CLGNBQ21CLFVBQ0YsNEJBQ0Esb0JBQ0Usa0JBQ0YsbUJBQ0Esc0JBQ0Esa0JBQ2pCLElBQ0EsU0FDQztBQUNELFVBQU0sSUFBSSxTQUFTLGNBQWMsZ0JBQWdCLGFBQWE7QUFsQjdDO0FBQ0U7QUFDQTtBQUVBO0FBQ0Y7QUFDRTtBQUVBO0FBQ0Y7QUFDQTtBQUNFO0FBQ0Y7QUFDQTtBQUNBO0FBbkNsQixTQUFtQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBbUQsQ0FBQztB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
