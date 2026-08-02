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
import { onDidChangeFullscreen } from "../../../../base/browser/browser.js";
import { $, getActiveWindow, hide, show } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore, markAsSingleton, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isNative } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { hasCustomTitlebar } from "../../../../platform/window/common/window.js";
import { EditorPart } from "./editorPart.js";
import { WindowTitle } from "../titlebar/windowTitle.js";
import { IAuxiliaryWindowService } from "../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js";
import { GroupDirection, GroupsOrder, GroupActivationReason } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts, shouldShowCustomTitleBar } from "../../../services/layout/browser/layoutService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { ITitleService } from "../../../services/title/browser/titleService.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IsAuxiliaryWindowContext, IsAuxiliaryWindowFocusedContext, IsCompactTitleBarContext } from "../../../common/contextkeys.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
const compactWindowEmitter = markAsSingleton(new Emitter());
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.toggleCompactAuxiliaryWindow",
      title: localize2("toggleCompactAuxiliaryWindow", "Toggle Window Compact Mode"),
      category: Categories.View,
      f1: true,
      precondition: IsAuxiliaryWindowFocusedContext
    });
  }
  async run() {
    compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: "toggle" });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.enableCompactAuxiliaryWindow",
      title: localize("enableCompactAuxiliaryWindow", "Turn On Compact Mode"),
      icon: Codicon.screenFull,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsCompactTitleBarContext.toNegated(), IsAuxiliaryWindowContext),
        order: 0,
        group: "navigation"
      }
    });
  }
  async run() {
    compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: true });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.disableCompactAuxiliaryWindow",
      title: localize("disableCompactAuxiliaryWindow", "Turn Off Compact Mode"),
      icon: Codicon.screenNormal,
      menu: {
        id: MenuId.LayoutControlMenu,
        when: ContextKeyExpr.and(IsCompactTitleBarContext, IsAuxiliaryWindowContext),
        order: 0,
        group: "navigation"
      }
    });
  }
  async run() {
    compactWindowEmitter.fire({ windowId: getActiveWindow().vscodeWindowId, compact: false });
  }
});
let AuxiliaryEditorPart = class {
  constructor(editorPartsView, instantiationService, auxiliaryWindowService, lifecycleService, configurationService, statusbarService, titleService, editorService, layoutService) {
    this.editorPartsView = editorPartsView;
    this.instantiationService = instantiationService;
    this.auxiliaryWindowService = auxiliaryWindowService;
    this.lifecycleService = lifecycleService;
    this.configurationService = configurationService;
    this.statusbarService = statusbarService;
    this.titleService = titleService;
    this.editorService = editorService;
    this.layoutService = layoutService;
  }
  async create(label, options) {
    const that = this;
    const disposables = new DisposableStore();
    let compact = Boolean(options?.compact);
    function computeEditorPartHeightOffset() {
      let editorPartHeightOffset = 0;
      if (statusbarVisible) {
        editorPartHeightOffset += statusbarPart.height;
      }
      if (titlebarPart && titlebarVisible) {
        editorPartHeightOffset += titlebarPart.height;
      }
      return editorPartHeightOffset;
    }
    function updateStatusbarVisibility(fromEvent) {
      if (statusbarVisible) {
        show(statusbarPart.container);
      } else {
        hide(statusbarPart.container);
      }
      if (fromEvent) {
        auxiliaryWindow.layout();
      }
    }
    function updateTitlebarVisibility(fromEvent) {
      if (!titlebarPart) {
        return;
      }
      if (titlebarVisible) {
        show(titlebarPart.container);
      } else {
        hide(titlebarPart.container);
      }
      if (fromEvent) {
        auxiliaryWindow.layout();
      }
    }
    function updateCompact(newCompact) {
      if (newCompact === compact) {
        return;
      }
      compact = newCompact;
      auxiliaryWindow.updateOptions({ compact });
      titlebarPart?.updateOptions({ compact });
      editorPart.updateOptions({ compact });
      const oldStatusbarVisible = statusbarVisible;
      statusbarVisible = !compact && that.configurationService.getValue(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
      if (oldStatusbarVisible !== statusbarVisible) {
        updateStatusbarVisibility(true);
      }
    }
    const auxiliaryWindow = disposables.add(await this.auxiliaryWindowService.open(options));
    const editorPartContainer = $(".part.editor", { role: "main" });
    editorPartContainer.style.position = "relative";
    auxiliaryWindow.container.appendChild(editorPartContainer);
    const editorPart = disposables.add(this.instantiationService.createInstance(AuxiliaryEditorPartImpl, auxiliaryWindow.window.vscodeWindowId, this.editorPartsView, options?.state, label));
    editorPart.updateOptions({ compact });
    disposables.add(this.editorPartsView.registerPart(editorPart));
    editorPart.create(editorPartContainer);
    const scopedEditorPartInstantiationService = disposables.add(editorPart.scopedInstantiationService.createChild(new ServiceCollection(
      [IEditorService, this.editorService.createScoped(editorPart, disposables)]
    )));
    let titlebarPart = void 0;
    let titlebarVisible = false;
    const useCustomTitle = isNative && hasCustomTitlebar(this.configurationService);
    if (useCustomTitle) {
      titlebarPart = disposables.add(this.titleService.createAuxiliaryTitlebarPart(auxiliaryWindow.container, editorPart, scopedEditorPartInstantiationService));
      titlebarPart.updateOptions({ compact });
      titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, void 0);
      const handleTitleBarVisibilityEvent = () => {
        const oldTitlebarPartVisible = titlebarVisible;
        titlebarVisible = shouldShowCustomTitleBar(this.configurationService, auxiliaryWindow.window, void 0);
        if (oldTitlebarPartVisible !== titlebarVisible) {
          updateTitlebarVisibility(true);
        }
      };
      disposables.add(titlebarPart.onDidChange(() => auxiliaryWindow.layout()));
      disposables.add(this.layoutService.onDidChangePartVisibility(() => handleTitleBarVisibilityEvent()));
      disposables.add(onDidChangeFullscreen((windowId) => {
        if (windowId !== auxiliaryWindow.window.vscodeWindowId) {
          return;
        }
        handleTitleBarVisibilityEvent();
      }));
      updateTitlebarVisibility(false);
    } else {
      disposables.add(scopedEditorPartInstantiationService.createInstance(WindowTitle, auxiliaryWindow.window));
    }
    const statusbarPart = disposables.add(this.statusbarService.createAuxiliaryStatusbarPart(auxiliaryWindow.container, scopedEditorPartInstantiationService));
    let statusbarVisible = !compact && this.configurationService.getValue(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
    disposables.add(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY)) {
        statusbarVisible = !compact && this.configurationService.getValue(AuxiliaryEditorPart.STATUS_BAR_VISIBILITY) !== false;
        updateStatusbarVisibility(true);
      }
    }));
    updateStatusbarVisibility(false);
    const editorCloseListener = disposables.add(Event.once(editorPart.onWillClose)(() => auxiliaryWindow.window.close()));
    disposables.add(Event.once(auxiliaryWindow.onUnload)(() => {
      if (disposables.isDisposed) {
        return;
      }
      editorCloseListener.dispose();
      editorPart.close();
      disposables.dispose();
    }));
    disposables.add(Event.once(this.lifecycleService.onDidShutdown)(() => disposables.dispose()));
    disposables.add(auxiliaryWindow.onBeforeUnload((event) => {
      for (const group of editorPart.groups) {
        for (const editor of group.editors) {
          const canMoveVeto = editor.canMove(group.id, this.editorPartsView.mainPart.activeGroup.id);
          if (typeof canMoveVeto === "string") {
            group.openEditor(editor);
            event.veto(canMoveVeto);
            return;
          }
        }
      }
    }));
    disposables.add(auxiliaryWindow.onWillLayout((dimension) => {
      const titlebarPartHeight = titlebarPart?.height ?? 0;
      titlebarPart?.layout(dimension.width, titlebarPartHeight, 0, 0);
      const editorPartHeight = dimension.height - computeEditorPartHeightOffset();
      editorPart.layout(dimension.width, editorPartHeight, titlebarPartHeight, 0);
      statusbarPart.layout(dimension.width, statusbarPart.height, dimension.height - statusbarPart.height, 0);
    }));
    auxiliaryWindow.layout();
    disposables.add(compactWindowEmitter.event((e) => {
      if (e.windowId === auxiliaryWindow.window.vscodeWindowId) {
        let newCompact;
        if (typeof e.compact === "boolean") {
          newCompact = e.compact;
        } else {
          newCompact = !compact;
        }
        updateCompact(newCompact);
      }
    }));
    disposables.add(editorPart.onDidAddGroup((group) => {
      updateCompact(false);
      disposables.add(group.onDidActiveEditorChange(() => {
        if (group.count > 1) {
          updateCompact(false);
        }
      }));
    }));
    disposables.add(editorPart.activeGroup.onDidActiveEditorChange(() => {
      if (editorPart.activeGroup.count > 1) {
        updateCompact(false);
      }
    }));
    const scopedInstantiationService = disposables.add(scopedEditorPartInstantiationService.createChild(new ServiceCollection(
      [IStatusbarService, this.statusbarService.createScoped(statusbarPart, disposables)]
    )));
    return {
      part: editorPart,
      instantiationService: scopedInstantiationService,
      disposables
    };
  }
};
AuxiliaryEditorPart.STATUS_BAR_VISIBILITY = "workbench.statusBar.visible";
AuxiliaryEditorPart = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IAuxiliaryWindowService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, ITitleService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IWorkbenchLayoutService)
], AuxiliaryEditorPart);
let AuxiliaryEditorPartImpl = class extends EditorPart {
  constructor(windowId, editorPartsView, state, groupsLabel, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService) {
    const id = AuxiliaryEditorPartImpl.COUNTER++;
    super(editorPartsView, `workbench.parts.auxiliaryEditor.${id}`, groupsLabel, windowId, instantiationService, themeService, configurationService, storageService, layoutService, hostService, contextKeyService);
    this.state = state;
    this._onWillClose = this._register(new Emitter());
    this.onWillClose = this._onWillClose.event;
    this.optionsDisposable = this._register(new MutableDisposable());
    this.isCompact = false;
  }
  handleContextKeys() {
    const isAuxiliaryWindowContext = IsAuxiliaryWindowContext.bindTo(this.scopedContextKeyService);
    isAuxiliaryWindowContext.set(true);
    super.handleContextKeys();
  }
  updateOptions(options) {
    this.isCompact = options.compact;
    if (options.compact) {
      if (!this.optionsDisposable.value) {
        this.optionsDisposable.value = this.enforcePartOptions({
          showTabs: "none",
          closeEmptyGroups: true
        });
      }
    } else {
      this.optionsDisposable.clear();
    }
  }
  addGroup(location, direction, groupToCopy) {
    if (this.isCompact) {
      location = this.editorPartsView.mainPart.activeGroup;
    }
    return super.addGroup(location, direction, groupToCopy);
  }
  removeGroup(group, preserveFocus) {
    const groupView = this.assertGroupView(group);
    if (this.count === 1 && this.activeGroup === groupView) {
      this.doRemoveLastGroup(preserveFocus);
    } else {
      super.removeGroup(group, preserveFocus);
    }
  }
  doRemoveLastGroup(preserveFocus) {
    const restoreFocus = !preserveFocus && this.shouldRestoreFocus(this.container);
    const mostRecentlyActiveGroups = this.editorPartsView.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE);
    const nextActiveGroup = mostRecentlyActiveGroups[1];
    if (nextActiveGroup) {
      nextActiveGroup.groupsView.activateGroup(nextActiveGroup, void 0, GroupActivationReason.PART_CLOSE);
    }
    if (nextActiveGroup && restoreFocus) {
      const nextGroupInHiddenMainPart = nextActiveGroup.groupsView === this.editorPartsView.mainPart && !this.layoutService.isVisible(Parts.EDITOR_PART, mainWindow);
      if (!nextGroupInHiddenMainPart) {
        nextActiveGroup.focus();
      }
    }
    this.doClose(
      false
      /* do not merge any confirming editors to main part */
    );
  }
  loadState() {
    return this.state;
  }
  saveState() {
    return;
  }
  close() {
    return this.doClose(
      true
      /* merge all confirming editors to main part */
    );
  }
  doClose(mergeConfirmingEditorsToMainPart) {
    let result = true;
    if (mergeConfirmingEditorsToMainPart) {
      for (const group of this.groups) {
        group.closeAllEditors({ excludeConfirming: true });
      }
      result = this.mergeGroupsToMainPart();
      if (!result) {
        return false;
      }
    }
    this._onWillClose.fire();
    return result;
  }
  mergeGroupsToMainPart() {
    if (!this.groups.some((group) => group.count > 0)) {
      return true;
    }
    let targetGroup = void 0;
    for (const group of this.editorPartsView.mainPart.getGroups(GroupsOrder.MOST_RECENTLY_ACTIVE)) {
      if (!group.isLocked) {
        targetGroup = group;
        break;
      }
    }
    if (!targetGroup) {
      targetGroup = this.editorPartsView.mainPart.addGroup(this.editorPartsView.mainPart.activeGroup, this.partOptions.openSideBySideDirection === "right" ? GroupDirection.RIGHT : GroupDirection.DOWN);
    }
    const result = this.mergeAllGroups(targetGroup, {
      // Try to reduce the impact of closing the auxiliary window
      // as much as possible by not changing existing editors
      // in the main window.
      preserveExistingIndex: true
    });
    targetGroup.focus();
    return result;
  }
};
AuxiliaryEditorPartImpl.COUNTER = 1;
AuxiliaryEditorPartImpl = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IWorkbenchLayoutService),
  __decorateParam(9, IHostService),
  __decorateParam(10, IContextKeyService)
], AuxiliaryEditorPartImpl);
export {
  AuxiliaryEditorPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9hdXhpbGlhcnlFZGl0b3JQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb25EaWRDaGFuZ2VGdWxsc2NyZWVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgJCwgZ2V0QWN0aXZlV2luZG93LCBoaWRlLCBzaG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgbWFya0FzU2luZ2xldG9uLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc05hdGl2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzQ3VzdG9tVGl0bGViYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBWaWV3LCBJRWRpdG9yUGFydHNWaWV3IH0gZnJvbSAnLi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFydCwgSUVkaXRvclBhcnRVSVN0YXRlIH0gZnJvbSAnLi9lZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IElBdXhpbGlhcnlUaXRsZWJhclBhcnQgfSBmcm9tICcuLi90aXRsZWJhci90aXRsZWJhclBhcnQuanMnO1xuaW1wb3J0IHsgV2luZG93VGl0bGUgfSBmcm9tICcuLi90aXRsZWJhci93aW5kb3dUaXRsZS5qcyc7XG5pbXBvcnQgeyBJQXV4aWxpYXJ5V2luZG93T3Blbk9wdGlvbnMsIElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV4aWxpYXJ5V2luZG93L2Jyb3dzZXIvYXV4aWxpYXJ5V2luZG93U2VydmljZS5qcyc7XG5pbXBvcnQgeyBHcm91cERpcmVjdGlvbiwgR3JvdXBzT3JkZXIsIElBdXhpbGlhcnlFZGl0b3JQYXJ0LCBHcm91cEFjdGl2YXRpb25SZWFzb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzLCBzaG91bGRTaG93Q3VzdG9tVGl0bGVCYXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgSVRpdGxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RpdGxlL2Jyb3dzZXIvdGl0bGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQsIElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHQsIElzQ29tcGFjdFRpdGxlQmFyQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IEdyb3VwSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBdXhpbGlhcnlFZGl0b3JQYXJ0T3Blbk9wdGlvbnMgZXh0ZW5kcyBJQXV4aWxpYXJ5V2luZG93T3Blbk9wdGlvbnMge1xuXHRyZWFkb25seSBzdGF0ZT86IElFZGl0b3JQYXJ0VUlTdGF0ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ3JlYXRlQXV4aWxpYXJ5RWRpdG9yUGFydFJlc3VsdCB7XG5cdHJlYWRvbmx5IHBhcnQ6IEF1eGlsaWFyeUVkaXRvclBhcnRJbXBsO1xuXHRyZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jb25zdCBjb21wYWN0V2luZG93RW1pdHRlciA9IG1hcmtBc1NpbmdsZXRvbihuZXcgRW1pdHRlcjx7IHdpbmRvd0lkOiBudW1iZXI7IGNvbXBhY3Q6IGJvb2xlYW4gfCAndG9nZ2xlJyB9PigpKTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUNvbXBhY3RBdXhpbGlhcnlXaW5kb3cnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndG9nZ2xlQ29tcGFjdEF1eGlsaWFyeVdpbmRvdycsIFwiVG9nZ2xlIFdpbmRvdyBDb21wYWN0IE1vZGVcIiksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5WaWV3LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzQXV4aWxpYXJ5V2luZG93Rm9jdXNlZENvbnRleHRcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb21wYWN0V2luZG93RW1pdHRlci5maXJlKHsgd2luZG93SWQ6IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkLCBjb21wYWN0OiAndG9nZ2xlJyB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5lbmFibGVDb21wYWN0QXV4aWxpYXJ5V2luZG93Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZW5hYmxlQ29tcGFjdEF1eGlsaWFyeVdpbmRvdycsIFwiVHVybiBPbiBDb21wYWN0IE1vZGVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNjcmVlbkZ1bGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTGF5b3V0Q29udHJvbE1lbnUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc0NvbXBhY3RUaXRsZUJhckNvbnRleHQudG9OZWdhdGVkKCksIElzQXV4aWxpYXJ5V2luZG93Q29udGV4dCksXG5cdFx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29tcGFjdFdpbmRvd0VtaXR0ZXIuZmlyZSh7IHdpbmRvd0lkOiBnZXRBY3RpdmVXaW5kb3coKS52c2NvZGVXaW5kb3dJZCwgY29tcGFjdDogdHJ1ZSB9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5kaXNhYmxlQ29tcGFjdEF1eGlsaWFyeVdpbmRvdycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Rpc2FibGVDb21wYWN0QXV4aWxpYXJ5V2luZG93JywgXCJUdXJuIE9mZiBDb21wYWN0IE1vZGVcIiksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNjcmVlbk5vcm1hbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5MYXlvdXRDb250cm9sTWVudSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzQ29tcGFjdFRpdGxlQmFyQ29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0KSxcblx0XHRcdFx0b3JkZXI6IDAsXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbidcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb21wYWN0V2luZG93RW1pdHRlci5maXJlKHsgd2luZG93SWQ6IGdldEFjdGl2ZVdpbmRvdygpLnZzY29kZVdpbmRvd0lkLCBjb21wYWN0OiBmYWxzZSB9KTtcblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBBdXhpbGlhcnlFZGl0b3JQYXJ0IHtcblxuXHRwcml2YXRlIHN0YXRpYyBTVEFUVVNfQkFSX1ZJU0lCSUxJVFkgPSAnd29ya2JlbmNoLnN0YXR1c0Jhci52aXNpYmxlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhdXhpbGlhcnlXaW5kb3dTZXJ2aWNlOiBJQXV4aWxpYXJ5V2luZG93U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASVRpdGxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRpdGxlU2VydmljZTogSVRpdGxlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZVxuXHQpIHtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZShsYWJlbDogc3RyaW5nLCBvcHRpb25zPzogSUF1eGlsaWFyeUVkaXRvclBhcnRPcGVuT3B0aW9ucyk6IFByb21pc2U8SUNyZWF0ZUF1eGlsaWFyeUVkaXRvclBhcnRSZXN1bHQ+IHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGxldCBjb21wYWN0ID0gQm9vbGVhbihvcHRpb25zPy5jb21wYWN0KTtcblxuXHRcdGZ1bmN0aW9uIGNvbXB1dGVFZGl0b3JQYXJ0SGVpZ2h0T2Zmc2V0KCk6IG51bWJlciB7XG5cdFx0XHRsZXQgZWRpdG9yUGFydEhlaWdodE9mZnNldCA9IDA7XG5cblx0XHRcdGlmIChzdGF0dXNiYXJWaXNpYmxlKSB7XG5cdFx0XHRcdGVkaXRvclBhcnRIZWlnaHRPZmZzZXQgKz0gc3RhdHVzYmFyUGFydC5oZWlnaHQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aXRsZWJhclBhcnQgJiYgdGl0bGViYXJWaXNpYmxlKSB7XG5cdFx0XHRcdGVkaXRvclBhcnRIZWlnaHRPZmZzZXQgKz0gdGl0bGViYXJQYXJ0LmhlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGVkaXRvclBhcnRIZWlnaHRPZmZzZXQ7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdXBkYXRlU3RhdHVzYmFyVmlzaWJpbGl0eShmcm9tRXZlbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdGlmIChzdGF0dXNiYXJWaXNpYmxlKSB7XG5cdFx0XHRcdHNob3coc3RhdHVzYmFyUGFydC5jb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGlkZShzdGF0dXNiYXJQYXJ0LmNvbnRhaW5lcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdFx0YXV4aWxpYXJ5V2luZG93LmxheW91dCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHVwZGF0ZVRpdGxlYmFyVmlzaWJpbGl0eShmcm9tRXZlbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRcdGlmICghdGl0bGViYXJQYXJ0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRpdGxlYmFyVmlzaWJsZSkge1xuXHRcdFx0XHRzaG93KHRpdGxlYmFyUGFydC5jb250YWluZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGlkZSh0aXRsZWJhclBhcnQuY29udGFpbmVyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGZyb21FdmVudCkge1xuXHRcdFx0XHRhdXhpbGlhcnlXaW5kb3cubGF5b3V0KCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdXBkYXRlQ29tcGFjdChuZXdDb21wYWN0OiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRpZiAobmV3Q29tcGFjdCA9PT0gY29tcGFjdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbXBhY3QgPSBuZXdDb21wYWN0O1xuXHRcdFx0YXV4aWxpYXJ5V2luZG93LnVwZGF0ZU9wdGlvbnMoeyBjb21wYWN0IH0pO1xuXHRcdFx0dGl0bGViYXJQYXJ0Py51cGRhdGVPcHRpb25zKHsgY29tcGFjdCB9KTtcblx0XHRcdGVkaXRvclBhcnQudXBkYXRlT3B0aW9ucyh7IGNvbXBhY3QgfSk7XG5cblx0XHRcdGNvbnN0IG9sZFN0YXR1c2JhclZpc2libGUgPSBzdGF0dXNiYXJWaXNpYmxlO1xuXHRcdFx0c3RhdHVzYmFyVmlzaWJsZSA9ICFjb21wYWN0ICYmIHRoYXQuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQXV4aWxpYXJ5RWRpdG9yUGFydC5TVEFUVVNfQkFSX1ZJU0lCSUxJVFkpICE9PSBmYWxzZTtcblx0XHRcdGlmIChvbGRTdGF0dXNiYXJWaXNpYmxlICE9PSBzdGF0dXNiYXJWaXNpYmxlKSB7XG5cdFx0XHRcdHVwZGF0ZVN0YXR1c2JhclZpc2liaWxpdHkodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXV4aWxpYXJ5IFdpbmRvd1xuXHRcdGNvbnN0IGF1eGlsaWFyeVdpbmRvdyA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCB0aGlzLmF1eGlsaWFyeVdpbmRvd1NlcnZpY2Uub3BlbihvcHRpb25zKSk7XG5cblx0XHQvLyBFZGl0b3IgUGFydFxuXHRcdGNvbnN0IGVkaXRvclBhcnRDb250YWluZXIgPSAkKCcucGFydC5lZGl0b3InLCB7IHJvbGU6ICdtYWluJyB9KTtcblx0XHRlZGl0b3JQYXJ0Q29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ3JlbGF0aXZlJztcblx0XHRhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLmFwcGVuZENoaWxkKGVkaXRvclBhcnRDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgZWRpdG9yUGFydCA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1eGlsaWFyeUVkaXRvclBhcnRJbXBsLCBhdXhpbGlhcnlXaW5kb3cud2luZG93LnZzY29kZVdpbmRvd0lkLCB0aGlzLmVkaXRvclBhcnRzVmlldywgb3B0aW9ucz8uc3RhdGUsIGxhYmVsKSk7XG5cdFx0ZWRpdG9yUGFydC51cGRhdGVPcHRpb25zKHsgY29tcGFjdCB9KTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5lZGl0b3JQYXJ0c1ZpZXcucmVnaXN0ZXJQYXJ0KGVkaXRvclBhcnQpKTtcblx0XHRlZGl0b3JQYXJ0LmNyZWF0ZShlZGl0b3JQYXJ0Q29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHNjb3BlZEVkaXRvclBhcnRJbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYXJ0LnNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJRWRpdG9yU2VydmljZSwgdGhpcy5lZGl0b3JTZXJ2aWNlLmNyZWF0ZVNjb3BlZChlZGl0b3JQYXJ0LCBkaXNwb3NhYmxlcyldXG5cdFx0KSkpO1xuXG5cdFx0Ly8gVGl0bGViYXJcblx0XHRsZXQgdGl0bGViYXJQYXJ0OiBJQXV4aWxpYXJ5VGl0bGViYXJQYXJ0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCB0aXRsZWJhclZpc2libGUgPSBmYWxzZTtcblx0XHRjb25zdCB1c2VDdXN0b21UaXRsZSA9IGlzTmF0aXZlICYmIGhhc0N1c3RvbVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpOyAvLyBjdXN0b20gdGl0bGUgaW4gYXV4IHdpbmRvd3Mgb25seSBlbmFibGVkIGluIG5hdGl2ZVxuXHRcdGlmICh1c2VDdXN0b21UaXRsZSkge1xuXHRcdFx0dGl0bGViYXJQYXJ0ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMudGl0bGVTZXJ2aWNlLmNyZWF0ZUF1eGlsaWFyeVRpdGxlYmFyUGFydChhdXhpbGlhcnlXaW5kb3cuY29udGFpbmVyLCBlZGl0b3JQYXJ0LCBzY29wZWRFZGl0b3JQYXJ0SW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0XHRcdHRpdGxlYmFyUGFydC51cGRhdGVPcHRpb25zKHsgY29tcGFjdCB9KTtcblx0XHRcdHRpdGxlYmFyVmlzaWJsZSA9IHNob3VsZFNob3dDdXN0b21UaXRsZUJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBhdXhpbGlhcnlXaW5kb3cud2luZG93LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBoYW5kbGVUaXRsZUJhclZpc2liaWxpdHlFdmVudCA9ICgpID0+IHtcblx0XHRcdFx0Y29uc3Qgb2xkVGl0bGViYXJQYXJ0VmlzaWJsZSA9IHRpdGxlYmFyVmlzaWJsZTtcblx0XHRcdFx0dGl0bGViYXJWaXNpYmxlID0gc2hvdWxkU2hvd0N1c3RvbVRpdGxlQmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIGF1eGlsaWFyeVdpbmRvdy53aW5kb3csIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmIChvbGRUaXRsZWJhclBhcnRWaXNpYmxlICE9PSB0aXRsZWJhclZpc2libGUpIHtcblx0XHRcdFx0XHR1cGRhdGVUaXRsZWJhclZpc2liaWxpdHkodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aXRsZWJhclBhcnQub25EaWRDaGFuZ2UoKCkgPT4gYXV4aWxpYXJ5V2luZG93LmxheW91dCgpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoKCkgPT4gaGFuZGxlVGl0bGVCYXJWaXNpYmlsaXR5RXZlbnQoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG9uRGlkQ2hhbmdlRnVsbHNjcmVlbih3aW5kb3dJZCA9PiB7XG5cdFx0XHRcdGlmICh3aW5kb3dJZCAhPT0gYXV4aWxpYXJ5V2luZG93LndpbmRvdy52c2NvZGVXaW5kb3dJZCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gaWdub3JlIGFsbCBidXQgb3VyIHdpbmRvd1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aGFuZGxlVGl0bGVCYXJWaXNpYmlsaXR5RXZlbnQoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dXBkYXRlVGl0bGViYXJWaXNpYmlsaXR5KGZhbHNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEVkaXRvclBhcnRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXaW5kb3dUaXRsZSwgYXV4aWxpYXJ5V2luZG93LndpbmRvdykpO1xuXHRcdH1cblxuXHRcdC8vIFN0YXR1c2JhclxuXHRcdGNvbnN0IHN0YXR1c2JhclBhcnQgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmNyZWF0ZUF1eGlsaWFyeVN0YXR1c2JhclBhcnQoYXV4aWxpYXJ5V2luZG93LmNvbnRhaW5lciwgc2NvcGVkRWRpdG9yUGFydEluc3RhbnRpYXRpb25TZXJ2aWNlKSk7XG5cdFx0bGV0IHN0YXR1c2JhclZpc2libGUgPSAhY29tcGFjdCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEF1eGlsaWFyeUVkaXRvclBhcnQuU1RBVFVTX0JBUl9WSVNJQklMSVRZKSAhPT0gZmFsc2U7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQXV4aWxpYXJ5RWRpdG9yUGFydC5TVEFUVVNfQkFSX1ZJU0lCSUxJVFkpKSB7XG5cdFx0XHRcdHN0YXR1c2JhclZpc2libGUgPSAhY29tcGFjdCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEF1eGlsaWFyeUVkaXRvclBhcnQuU1RBVFVTX0JBUl9WSVNJQklMSVRZKSAhPT0gZmFsc2U7XG5cblx0XHRcdFx0dXBkYXRlU3RhdHVzYmFyVmlzaWJpbGl0eSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR1cGRhdGVTdGF0dXNiYXJWaXNpYmlsaXR5KGZhbHNlKTtcblxuXHRcdC8vIExpZmVjeWNsZVxuXHRcdGNvbnN0IGVkaXRvckNsb3NlTGlzdGVuZXIgPSBkaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZShlZGl0b3JQYXJ0Lm9uV2lsbENsb3NlKSgoKSA9PiBhdXhpbGlhcnlXaW5kb3cud2luZG93LmNsb3NlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoRXZlbnQub25jZShhdXhpbGlhcnlXaW5kb3cub25VbmxvYWQpKCgpID0+IHtcblx0XHRcdGlmIChkaXNwb3NhYmxlcy5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gdGhlIGNsb3NlIGhhcHBlbmVkIGFzIHBhcnQgb2YgYW4gZWFybGllciBkaXNwb3NlIGNhbGxcblx0XHRcdH1cblxuXHRcdFx0ZWRpdG9yQ2xvc2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRlZGl0b3JQYXJ0LmNsb3NlKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbkRpZFNodXRkb3duKSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV4aWxpYXJ5V2luZG93Lm9uQmVmb3JlVW5sb2FkKGV2ZW50ID0+IHtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZWRpdG9yUGFydC5ncm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgZ3JvdXAuZWRpdG9ycykge1xuXHRcdFx0XHRcdC8vIENsb3NpbmcgYW4gYXV4aWxpYXJ5IHdpbmRvdyB3aXRoIG9wZW5lZCBlZGl0b3JzXG5cdFx0XHRcdFx0Ly8gd2lsbCBtb3ZlIHRoZSBlZGl0b3JzIHRvIHRoZSBtYWluIHdpbmRvdy4gQXMgc3VjaCxcblx0XHRcdFx0XHQvLyB3ZSBuZWVkIHRvIHZhbGlkYXRlIHRoYXQgd2UgY2FuIG1vdmUgYW5kIG90aGVyd2lzZVxuXHRcdFx0XHRcdC8vIHByZXZlbnQgdGhlIHdpbmRvdyBmcm9tIGNsb3NpbmcuXG5cdFx0XHRcdFx0Y29uc3QgY2FuTW92ZVZldG8gPSBlZGl0b3IuY2FuTW92ZShncm91cC5pZCwgdGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgY2FuTW92ZVZldG8gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRncm91cC5vcGVuRWRpdG9yKGVkaXRvcik7XG5cdFx0XHRcdFx0XHRldmVudC52ZXRvKGNhbk1vdmVWZXRvKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBMYXlvdXQ6IHNwZWNpZmljYWxseSBgb25XaWxsTGF5b3V0YCB0byBoYXZlIGEgY2hhbmNlXG5cdFx0Ly8gdG8gYnVpbGQgdGhlIGF1eCBlZGl0b3IgcGFydCBiZWZvcmUgb3RoZXIgY29tcG9uZW50c1xuXHRcdC8vIGhhdmUgYSBjaGFuY2UgdG8gcmVhY3QuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1eGlsaWFyeVdpbmRvdy5vbldpbGxMYXlvdXQoZGltZW5zaW9uID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlYmFyUGFydEhlaWdodCA9IHRpdGxlYmFyUGFydD8uaGVpZ2h0ID8/IDA7XG5cdFx0XHR0aXRsZWJhclBhcnQ/LmxheW91dChkaW1lbnNpb24ud2lkdGgsIHRpdGxlYmFyUGFydEhlaWdodCwgMCwgMCk7XG5cblx0XHRcdGNvbnN0IGVkaXRvclBhcnRIZWlnaHQgPSBkaW1lbnNpb24uaGVpZ2h0IC0gY29tcHV0ZUVkaXRvclBhcnRIZWlnaHRPZmZzZXQoKTtcblx0XHRcdGVkaXRvclBhcnQubGF5b3V0KGRpbWVuc2lvbi53aWR0aCwgZWRpdG9yUGFydEhlaWdodCwgdGl0bGViYXJQYXJ0SGVpZ2h0LCAwKTtcblxuXHRcdFx0c3RhdHVzYmFyUGFydC5sYXlvdXQoZGltZW5zaW9uLndpZHRoLCBzdGF0dXNiYXJQYXJ0LmhlaWdodCwgZGltZW5zaW9uLmhlaWdodCAtIHN0YXR1c2JhclBhcnQuaGVpZ2h0LCAwKTtcblx0XHR9KSk7XG5cdFx0YXV4aWxpYXJ5V2luZG93LmxheW91dCgpO1xuXG5cdFx0Ly8gQ29tcGFjdCBtb2RlXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGNvbXBhY3RXaW5kb3dFbWl0dGVyLmV2ZW50KGUgPT4ge1xuXHRcdFx0aWYgKGUud2luZG93SWQgPT09IGF1eGlsaWFyeVdpbmRvdy53aW5kb3cudnNjb2RlV2luZG93SWQpIHtcblx0XHRcdFx0bGV0IG5ld0NvbXBhY3Q6IGJvb2xlYW47XG5cdFx0XHRcdGlmICh0eXBlb2YgZS5jb21wYWN0ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0XHRuZXdDb21wYWN0ID0gZS5jb21wYWN0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG5ld0NvbXBhY3QgPSAhY29tcGFjdDtcblx0XHRcdFx0fVxuXHRcdFx0XHR1cGRhdGVDb21wYWN0KG5ld0NvbXBhY3QpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JQYXJ0Lm9uRGlkQWRkR3JvdXAoZ3JvdXAgPT4ge1xuXHRcdFx0dXBkYXRlQ29tcGFjdChmYWxzZSk7IC8vIGxlYXZlIGNvbXBhY3QgbW9kZSB3aGVuIGEgZ3JvdXAgaXMgYWRkZWRcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGdyb3VwLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0aWYgKGdyb3VwLmNvdW50ID4gMSkge1xuXHRcdFx0XHRcdHVwZGF0ZUNvbXBhY3QoZmFsc2UpOyAvLyBsZWF2ZSBjb21wYWN0IG1vZGUgd2hlbiBtb3JlIHRoYW4gMSBlZGl0b3IgaXMgYWN0aXZlXG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yUGFydC5hY3RpdmVHcm91cC5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAoZWRpdG9yUGFydC5hY3RpdmVHcm91cC5jb3VudCA+IDEpIHtcblx0XHRcdFx0dXBkYXRlQ29tcGFjdChmYWxzZSk7IC8vIGxlYXZlIGNvbXBhY3QgbW9kZSB3aGVuIG1vcmUgdGhhbiAxIGVkaXRvciBpcyBhY3RpdmVcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBIYXZlIGEgc2NvcGVkIGluc3RhbnRpYXRpb24gc2VydmljZSB0aGF0IGlzIHNjb3BlZCB0byB0aGUgYXV4aWxpYXJ5IHdpbmRvd1xuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKHNjb3BlZEVkaXRvclBhcnRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSVN0YXR1c2JhclNlcnZpY2UsIHRoaXMuc3RhdHVzYmFyU2VydmljZS5jcmVhdGVTY29wZWQoc3RhdHVzYmFyUGFydCwgZGlzcG9zYWJsZXMpXVxuXHRcdCkpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwYXJ0OiBlZGl0b3JQYXJ0LFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0ZGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIEF1eGlsaWFyeUVkaXRvclBhcnRJbXBsIGV4dGVuZHMgRWRpdG9yUGFydCBpbXBsZW1lbnRzIElBdXhpbGlhcnlFZGl0b3JQYXJ0IHtcblxuXHRwcml2YXRlIHN0YXRpYyBDT1VOVEVSID0gMTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbldpbGxDbG9zZSA9IHRoaXMuX29uV2lsbENsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgb3B0aW9uc0Rpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBpc0NvbXBhY3QgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR3aW5kb3dJZDogbnVtYmVyLFxuXHRcdGVkaXRvclBhcnRzVmlldzogSUVkaXRvclBhcnRzVmlldyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHN0YXRlOiBJRWRpdG9yUGFydFVJU3RhdGUgfCB1bmRlZmluZWQsXG5cdFx0Z3JvdXBzTGFiZWw6IHN0cmluZyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgaWQgPSBBdXhpbGlhcnlFZGl0b3JQYXJ0SW1wbC5DT1VOVEVSKys7XG5cdFx0c3VwZXIoZWRpdG9yUGFydHNWaWV3LCBgd29ya2JlbmNoLnBhcnRzLmF1eGlsaWFyeUVkaXRvci4ke2lkfWAsIGdyb3Vwc0xhYmVsLCB3aW5kb3dJZCwgaW5zdGFudGlhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBsYXlvdXRTZXJ2aWNlLCBob3N0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGhhbmRsZUNvbnRleHRLZXlzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGlzQXV4aWxpYXJ5V2luZG93Q29udGV4dCA9IElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC5iaW5kVG8odGhpcy5zY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnNldCh0cnVlKTtcblxuXHRcdHN1cGVyLmhhbmRsZUNvbnRleHRLZXlzKCk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnM6IHsgY29tcGFjdDogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0dGhpcy5pc0NvbXBhY3QgPSBvcHRpb25zLmNvbXBhY3Q7XG5cblx0XHRpZiAob3B0aW9ucy5jb21wYWN0KSB7XG5cdFx0XHRpZiAoIXRoaXMub3B0aW9uc0Rpc3Bvc2FibGUudmFsdWUpIHtcblx0XHRcdFx0dGhpcy5vcHRpb25zRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuZW5mb3JjZVBhcnRPcHRpb25zKHtcblx0XHRcdFx0XHRzaG93VGFiczogJ25vbmUnLFxuXHRcdFx0XHRcdGNsb3NlRW1wdHlHcm91cHM6IHRydWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub3B0aW9uc0Rpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhZGRHcm91cChsb2NhdGlvbjogSUVkaXRvckdyb3VwVmlldyB8IEdyb3VwSWRlbnRpZmllciwgZGlyZWN0aW9uOiBHcm91cERpcmVjdGlvbiwgZ3JvdXBUb0NvcHk/OiBJRWRpdG9yR3JvdXBWaWV3KTogSUVkaXRvckdyb3VwVmlldyB7XG5cdFx0aWYgKHRoaXMuaXNDb21wYWN0KSB7XG5cdFx0XHQvLyBXaGVuIGluIGNvbXBhY3QgbW9kZSwgd2UgcHJlZmVyIHRvIG9wZW4gZ3JvdXBzIGluIHRoZSBtYWluIHBhcnRcblx0XHRcdC8vIGFzIGNvbXBhY3QgbW9kZSBpcyB0eXBpY2FsbHkgbWVhbnQgZm9yIHNob3dpbmcganVzdCAxIGVkaXRvci5cblx0XHRcdGxvY2F0aW9uID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWN0aXZlR3JvdXA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1cGVyLmFkZEdyb3VwKGxvY2F0aW9uLCBkaXJlY3Rpb24sIGdyb3VwVG9Db3B5KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbW92ZUdyb3VwKGdyb3VwOiBudW1iZXIgfCBJRWRpdG9yR3JvdXBWaWV3LCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXG5cdFx0Ly8gQ2xvc2UgYXV4IHdpbmRvdyB3aGVuIGxhc3QgZ3JvdXAgcmVtb3ZlZFxuXHRcdGNvbnN0IGdyb3VwVmlldyA9IHRoaXMuYXNzZXJ0R3JvdXBWaWV3KGdyb3VwKTtcblx0XHRpZiAodGhpcy5jb3VudCA9PT0gMSAmJiB0aGlzLmFjdGl2ZUdyb3VwID09PSBncm91cFZpZXcpIHtcblx0XHRcdHRoaXMuZG9SZW1vdmVMYXN0R3JvdXAocHJlc2VydmVGb2N1cyk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIGRlbGVnYXRlIHRvIHBhcmVudCBpbXBsZW1lbnRhdGlvblxuXHRcdGVsc2Uge1xuXHRcdFx0c3VwZXIucmVtb3ZlR3JvdXAoZ3JvdXAsIHByZXNlcnZlRm9jdXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9SZW1vdmVMYXN0R3JvdXAocHJlc2VydmVGb2N1cz86IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCByZXN0b3JlRm9jdXMgPSAhcHJlc2VydmVGb2N1cyAmJiB0aGlzLnNob3VsZFJlc3RvcmVGb2N1cyh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHQvLyBBY3RpdmF0ZSBuZXh0IGdyb3VwIHdoZW4gY2xvc2luZ1xuXHRcdGNvbnN0IG1vc3RSZWNlbnRseUFjdGl2ZUdyb3VwcyA9IHRoaXMuZWRpdG9yUGFydHNWaWV3LmdldEdyb3VwcyhHcm91cHNPcmRlci5NT1NUX1JFQ0VOVExZX0FDVElWRSk7XG5cdFx0Y29uc3QgbmV4dEFjdGl2ZUdyb3VwID0gbW9zdFJlY2VudGx5QWN0aXZlR3JvdXBzWzFdOyAvLyBbMF0gd2lsbCBiZSB0aGUgY3VycmVudCBncm91cCB3ZSBhcmUgYWJvdXQgdG8gZGlzcG9zZVxuXHRcdGlmIChuZXh0QWN0aXZlR3JvdXApIHtcblx0XHRcdG5leHRBY3RpdmVHcm91cC5ncm91cHNWaWV3LmFjdGl2YXRlR3JvdXAobmV4dEFjdGl2ZUdyb3VwLCB1bmRlZmluZWQsIEdyb3VwQWN0aXZhdGlvblJlYXNvbi5QQVJUX0NMT1NFKTtcblx0XHR9XG5cblx0XHQvLyBEZWFsIHdpdGggZm9jdXM6IGZvY3VzIHRoZSBuZXh0IHJlY2VudGx5IHVzZWQgZ3JvdXAgYnV0IHNraXBcblx0XHQvLyB0aGlzIGlmIHRoZSBuZXh0IGdyb3VwIGlzIGluIHRoZSBtYWluIHBhcnQgYW5kIHRoZSBtYWluIHBhcnRcblx0XHQvLyBpcyBjdXJyZW50bHkgaGlkZGVuLCBhcyB0aGF0IHdvdWxkIG1ha2UgaXQgdmlzaWJsZS5cblx0XHRpZiAobmV4dEFjdGl2ZUdyb3VwICYmIHJlc3RvcmVGb2N1cykge1xuXHRcdFx0Y29uc3QgbmV4dEdyb3VwSW5IaWRkZW5NYWluUGFydCA9IG5leHRBY3RpdmVHcm91cC5ncm91cHNWaWV3ID09PSB0aGlzLmVkaXRvclBhcnRzVmlldy5tYWluUGFydCAmJiAhdGhpcy5sYXlvdXRTZXJ2aWNlLmlzVmlzaWJsZShQYXJ0cy5FRElUT1JfUEFSVCwgbWFpbldpbmRvdyk7XG5cdFx0XHRpZiAoIW5leHRHcm91cEluSGlkZGVuTWFpblBhcnQpIHtcblx0XHRcdFx0bmV4dEFjdGl2ZUdyb3VwLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5kb0Nsb3NlKGZhbHNlIC8qIGRvIG5vdCBtZXJnZSBhbnkgY29uZmlybWluZyBlZGl0b3JzIHRvIG1haW4gcGFydCAqLyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbG9hZFN0YXRlKCk6IElFZGl0b3JQYXJ0VUlTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2F2ZVN0YXRlKCk6IHZvaWQge1xuXHRcdHJldHVybjsgLy8gZGlzYWJsZWQsIGF1eGlsaWFyeSBlZGl0b3IgcGFydCBzdGF0ZSBpcyB0cmFja2VkIG91dHNpZGVcblx0fVxuXG5cdGNsb3NlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvQ2xvc2UodHJ1ZSAvKiBtZXJnZSBhbGwgY29uZmlybWluZyBlZGl0b3JzIHRvIG1haW4gcGFydCAqLyk7XG5cdH1cblxuXHRwcml2YXRlIGRvQ2xvc2UobWVyZ2VDb25maXJtaW5nRWRpdG9yc1RvTWFpblBhcnQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRsZXQgcmVzdWx0ID0gdHJ1ZTtcblx0XHRpZiAobWVyZ2VDb25maXJtaW5nRWRpdG9yc1RvTWFpblBhcnQpIHtcblxuXHRcdFx0Ly8gRmlyc3QgY2xvc2UgYWxsIGVkaXRvcnMgdGhhdCBhcmUgbm9uLWNvbmZpcm1pbmdcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5ncm91cHMpIHtcblx0XHRcdFx0Z3JvdXAuY2xvc2VBbGxFZGl0b3JzKHsgZXhjbHVkZUNvbmZpcm1pbmc6IHRydWUgfSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoZW4gbWVyZ2UgcmVtYWluaW5nIHRvIG1haW4gcGFydFxuXHRcdFx0cmVzdWx0ID0gdGhpcy5tZXJnZUdyb3Vwc1RvTWFpblBhcnQoKTtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gRG8gbm90IGNsb3NlIHdoZW4gZWRpdG9ycyBjb3VsZCBub3QgYmUgbWVyZ2VkIGJhY2tcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vbldpbGxDbG9zZS5maXJlKCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBtZXJnZUdyb3Vwc1RvTWFpblBhcnQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmdyb3Vwcy5zb21lKGdyb3VwID0+IGdyb3VwLmNvdW50ID4gMCkpIHtcblx0XHRcdHJldHVybiB0cnVlOyAvLyBza2lwIGlmIHdlIGhhdmUgbm8gZWRpdG9ycyBvcGVuZWRcblx0XHR9XG5cblx0XHQvLyBGaW5kIHRoZSBtb3N0IHJlY2VudCBncm91cCB0aGF0IGlzIG5vdCBsb2NrZWRcblx0XHRsZXQgdGFyZ2V0R3JvdXA6IElFZGl0b3JHcm91cFZpZXcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLmVkaXRvclBhcnRzVmlldy5tYWluUGFydC5nZXRHcm91cHMoR3JvdXBzT3JkZXIuTU9TVF9SRUNFTlRMWV9BQ1RJVkUpKSB7XG5cdFx0XHRpZiAoIWdyb3VwLmlzTG9ja2VkKSB7XG5cdFx0XHRcdHRhcmdldEdyb3VwID0gZ3JvdXA7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGFyZ2V0R3JvdXApIHtcblx0XHRcdHRhcmdldEdyb3VwID0gdGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWRkR3JvdXAodGhpcy5lZGl0b3JQYXJ0c1ZpZXcubWFpblBhcnQuYWN0aXZlR3JvdXAsIHRoaXMucGFydE9wdGlvbnMub3BlblNpZGVCeVNpZGVEaXJlY3Rpb24gPT09ICdyaWdodCcgPyBHcm91cERpcmVjdGlvbi5SSUdIVCA6IEdyb3VwRGlyZWN0aW9uLkRPV04pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubWVyZ2VBbGxHcm91cHModGFyZ2V0R3JvdXAsIHtcblx0XHRcdC8vIFRyeSB0byByZWR1Y2UgdGhlIGltcGFjdCBvZiBjbG9zaW5nIHRoZSBhdXhpbGlhcnkgd2luZG93XG5cdFx0XHQvLyBhcyBtdWNoIGFzIHBvc3NpYmxlIGJ5IG5vdCBjaGFuZ2luZyBleGlzdGluZyBlZGl0b3JzXG5cdFx0XHQvLyBpbiB0aGUgbWFpbiB3aW5kb3cuXG5cdFx0XHRwcmVzZXJ2ZUV4aXN0aW5nSW5kZXg6IHRydWVcblx0XHR9KTtcblx0XHR0YXJnZXRHcm91cC5mb2N1cygpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLEdBQUcsaUJBQWlCLE1BQU0sWUFBWTtBQUMvQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGlCQUFpQixpQkFBaUIseUJBQXlCO0FBQ3BFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNB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
