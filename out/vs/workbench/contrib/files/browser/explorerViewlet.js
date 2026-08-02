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
import "./media/explorerviewlet.css";
import { localize, localize2 } from "../../../../nls.js";
import { mark } from "../../../../base/common/performance.js";
import { VIEWLET_ID, VIEW_ID, ExplorerViewletVisibleContext } from "../common/files.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ExplorerView } from "./views/explorerView.js";
import { EmptyView } from "./views/emptyView.js";
import { OpenEditorsView } from "./views/openEditorsView.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IContextKeyService, ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { Extensions, ViewContainerLocation, IViewDescriptorService, ViewContentGroups } from "../../../common/views.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { KeyChord, KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { WorkbenchStateContext, RemoteNameContext, OpenFolderWorkspaceSupportContext } from "../../../common/contextkeys.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { AddRootFolderAction, OpenFolderAction, OpenFolderViaWorkspaceAction } from "../../../browser/actions/workspaceActions.js";
import { OpenRecentAction } from "../../../browser/actions/windowActions.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { isMouseEvent } from "../../../../base/browser/dom.js";
import { ILogService } from "../../../../platform/log/common/log.js";
const explorerViewIcon = registerIcon("explorer-view-icon", Codicon.files, localize("explorerViewIcon", "View icon of the explorer view."));
const openEditorsViewIcon = registerIcon("open-editors-view-icon", Codicon.book, localize("openEditorsIcon", "View icon of the open editors view."));
let ExplorerViewletViewsContribution = class extends Disposable {
  constructor(workspaceContextService, progressService) {
    super();
    this.workspaceContextService = workspaceContextService;
    progressService.withProgress({ location: ProgressLocation.Explorer }, () => workspaceContextService.getCompleteWorkspace()).finally(() => {
      this.registerViews();
      this._register(workspaceContextService.onDidChangeWorkbenchState(() => this.registerViews()));
      this._register(workspaceContextService.onDidChangeWorkspaceFolders(() => this.registerViews()));
    });
  }
  registerViews() {
    mark("code/willRegisterExplorerViews");
    const viewDescriptors = viewsRegistry.getViews(VIEW_CONTAINER);
    const viewDescriptorsToRegister = [];
    const viewDescriptorsToDeregister = [];
    const openEditorsViewDescriptor = this.createOpenEditorsViewDescriptor();
    if (!viewDescriptors.some((v) => v.id === openEditorsViewDescriptor.id)) {
      viewDescriptorsToRegister.push(openEditorsViewDescriptor);
    }
    const explorerViewDescriptor = this.createExplorerViewDescriptor();
    const registeredExplorerViewDescriptor = viewDescriptors.find((v) => v.id === explorerViewDescriptor.id);
    const emptyViewDescriptor = this.createEmptyViewDescriptor();
    const registeredEmptyViewDescriptor = viewDescriptors.find((v) => v.id === emptyViewDescriptor.id);
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY || this.workspaceContextService.getWorkspace().folders.length === 0) {
      if (registeredExplorerViewDescriptor) {
        viewDescriptorsToDeregister.push(registeredExplorerViewDescriptor);
      }
      if (!registeredEmptyViewDescriptor) {
        viewDescriptorsToRegister.push(emptyViewDescriptor);
      }
    } else {
      if (registeredEmptyViewDescriptor) {
        viewDescriptorsToDeregister.push(registeredEmptyViewDescriptor);
      }
      if (!registeredExplorerViewDescriptor) {
        viewDescriptorsToRegister.push(explorerViewDescriptor);
      }
    }
    if (viewDescriptorsToDeregister.length) {
      viewsRegistry.deregisterViews(viewDescriptorsToDeregister, VIEW_CONTAINER);
    }
    if (viewDescriptorsToRegister.length) {
      viewsRegistry.registerViews(viewDescriptorsToRegister, VIEW_CONTAINER);
    }
    mark("code/didRegisterExplorerViews");
  }
  createOpenEditorsViewDescriptor() {
    return {
      id: OpenEditorsView.ID,
      name: OpenEditorsView.NAME,
      ctorDescriptor: new SyncDescriptor(OpenEditorsView),
      containerIcon: openEditorsViewIcon,
      order: 0,
      canToggleVisibility: true,
      canMoveView: true,
      collapsed: false,
      hideByDefault: true,
      focusCommand: {
        id: "workbench.files.action.focusOpenEditorsView",
        keybindings: { primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyE) }
      }
    };
  }
  createEmptyViewDescriptor() {
    return {
      id: EmptyView.ID,
      name: EmptyView.NAME,
      containerIcon: explorerViewIcon,
      ctorDescriptor: new SyncDescriptor(EmptyView),
      order: 1,
      canToggleVisibility: true,
      focusCommand: {
        id: "workbench.explorer.fileView.focus"
      }
    };
  }
  createExplorerViewDescriptor() {
    return {
      id: VIEW_ID,
      name: localize2("folders", "Folders"),
      containerIcon: explorerViewIcon,
      ctorDescriptor: new SyncDescriptor(ExplorerView),
      order: 1,
      canMoveView: true,
      canToggleVisibility: false,
      focusCommand: {
        id: "workbench.explorer.fileView.focus"
      }
    };
  }
};
ExplorerViewletViewsContribution.ID = "workbench.contrib.explorerViewletViews";
ExplorerViewletViewsContribution = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IProgressService)
], ExplorerViewletViewsContribution);
let ExplorerViewPaneContainer = class extends ViewPaneContainer {
  constructor(layoutService, telemetryService, contextService, storageService, configurationService, instantiationService, contextKeyService, themeService, contextMenuService, extensionService, viewDescriptorService, logService) {
    super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);
    this.viewletVisibleContextKey = ExplorerViewletVisibleContext.bindTo(contextKeyService);
    this._register(this.contextService.onDidChangeWorkspaceName((e) => this.updateTitleArea()));
  }
  create(parent) {
    super.create(parent);
    parent.classList.add("explorer-viewlet");
  }
  createView(viewDescriptor, options) {
    if (viewDescriptor.id === VIEW_ID) {
      return this.instantiationService.createInstance(ExplorerView, {
        ...options,
        delegate: {
          willOpenElement: (e) => {
            if (!isMouseEvent(e)) {
              return;
            }
            const openEditorsView = this.getOpenEditorsView();
            if (openEditorsView) {
              let delay = 0;
              const config = this.configurationService.getValue();
              if (config.workbench?.editor?.enablePreview) {
                delay = 250;
              }
              openEditorsView.setStructuralRefreshDelay(delay);
            }
          },
          didOpenElement: (e) => {
            if (!isMouseEvent(e)) {
              return;
            }
            const openEditorsView = this.getOpenEditorsView();
            openEditorsView?.setStructuralRefreshDelay(0);
          }
        }
      });
    }
    return super.createView(viewDescriptor, options);
  }
  getExplorerView() {
    return this.getView(VIEW_ID);
  }
  getOpenEditorsView() {
    return this.getView(OpenEditorsView.ID);
  }
  setVisible(visible) {
    this.viewletVisibleContextKey.set(visible);
    super.setVisible(visible);
  }
  focus() {
    const explorerView = this.getView(VIEW_ID);
    if (explorerView && this.panes.every((p) => !p.isExpanded())) {
      explorerView.setExpanded(true);
    }
    if (explorerView?.isExpanded()) {
      explorerView.focus();
    } else {
      super.focus();
    }
  }
};
ExplorerViewPaneContainer = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IThemeService),
  __decorateParam(8, IContextMenuService),
  __decorateParam(9, IExtensionService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, ILogService)
], ExplorerViewPaneContainer);
const viewContainerRegistry = Registry.as(Extensions.ViewContainersRegistry);
const VIEW_CONTAINER = viewContainerRegistry.registerViewContainer({
  id: VIEWLET_ID,
  title: localize2("explore", "Explorer"),
  ctorDescriptor: new SyncDescriptor(ExplorerViewPaneContainer),
  storageId: "workbench.explorer.views.state",
  icon: explorerViewIcon,
  alwaysUseContainerInfo: true,
  hideIfEmpty: true,
  order: 0,
  openCommandActionDescriptor: {
    id: VIEWLET_ID,
    title: localize2("explore", "Explorer"),
    mnemonicTitle: localize({ key: "miViewExplorer", comment: ["&& denotes a mnemonic"] }, "&&Explorer"),
    keybindings: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE },
    order: 0
  }
}, ViewContainerLocation.Sidebar, { isDefault: true });
const openFolder = localize("openFolder", "Open Folder");
const addAFolder = localize("addAFolder", "add a folder");
const openRecent = localize("openRecent", "Open Recent");
const addRootFolderButton = `[${openFolder}](command:${AddRootFolderAction.ID})`;
const addAFolderButton = `[${addAFolder}](command:${AddRootFolderAction.ID})`;
const openFolderButton = `[${openFolder}](command:${OpenFolderAction.ID})`;
const openFolderViaWorkspaceButton = `[${openFolder}](command:${OpenFolderViaWorkspaceAction.ID})`;
const openRecentButton = `[${openRecent}](command:${OpenRecentAction.ID})`;
const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noWorkspaceHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet added a folder to the workspace.\n{0}",
    addRootFolderButton
  ),
  when: ContextKeyExpr.and(
    // inside a .code-workspace
    WorkbenchStateContext.isEqualTo("workspace"),
    // unless we cannot enter or open workspaces (e.g. web serverless)
    OpenFolderWorkspaceSupportContext
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noFolderHelpWeb", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet opened a folder.\n{0}\n{1}",
    openFolderViaWorkspaceButton,
    openRecentButton
  ),
  when: ContextKeyExpr.and(
    // inside a .code-workspace
    WorkbenchStateContext.isEqualTo("workspace"),
    // we cannot enter workspaces (e.g. web serverless)
    OpenFolderWorkspaceSupportContext.toNegated()
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "remoteNoFolderHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "Connected to remote.\n{0}",
    openFolderButton
  ),
  when: ContextKeyExpr.and(
    // not inside a .code-workspace
    WorkbenchStateContext.notEqualsTo("workspace"),
    // connected to a remote
    RemoteNameContext.notEqualsTo(""),
    // but not in web
    IsWebContext.toNegated()
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noFolderButEditorsHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet opened a folder.\n{0}\nOpening a folder will close all currently open editors. To keep them open, {1} instead.",
    openFolderButton,
    addAFolderButton
  ),
  when: ContextKeyExpr.and(
    // editors are opened
    ContextKeyExpr.has("editorIsOpen"),
    ContextKeyExpr.or(
      // not inside a .code-workspace and local
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), RemoteNameContext.isEqualTo("")),
      // not inside a .code-workspace and web
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), IsWebContext)
    )
  ),
  group: ViewContentGroups.Open,
  order: 1
});
viewsRegistry.registerViewWelcomeContent(EmptyView.ID, {
  content: localize(
    { key: "noFolderHelp", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change'] },
    "You have not yet opened a folder.\n{0}",
    openFolderButton
  ),
  when: ContextKeyExpr.and(
    // no editor is open
    ContextKeyExpr.has("editorIsOpen")?.negate(),
    ContextKeyExpr.or(
      // not inside a .code-workspace and local
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), RemoteNameContext.isEqualTo("")),
      // not inside a .code-workspace and web
      ContextKeyExpr.and(WorkbenchStateContext.notEqualsTo("workspace"), IsWebContext)
    )
  ),
  group: ViewContentGroups.Open,
  order: 1
});
export {
  ExplorerViewPaneContainer,
  ExplorerViewletViewsContribution,
  VIEW_CONTAINER
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZXhwbG9yZXJWaWV3bGV0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2V4cGxvcmVydmlld2xldC5jc3MnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgVklFV0xFVF9JRCwgVklFV19JRCwgSUZpbGVzQ29uZmlndXJhdGlvbiwgRXhwbG9yZXJWaWV3bGV0VmlzaWJsZUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdsZXRWaWV3T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld3NWaWV3bGV0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJWaWV3IH0gZnJvbSAnLi92aWV3cy9leHBsb3JlclZpZXcuanMnO1xuaW1wb3J0IHsgRW1wdHlWaWV3IH0gZnJvbSAnLi92aWV3cy9lbXB0eVZpZXcuanMnO1xuaW1wb3J0IHsgT3BlbkVkaXRvcnNWaWV3IH0gZnJvbSAnLi92aWV3cy9vcGVuRWRpdG9yc1ZpZXcuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UsIElDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzUmVnaXN0cnksIElWaWV3RGVzY3JpcHRvciwgRXh0ZW5zaW9ucywgVmlld0NvbnRhaW5lciwgSVZpZXdDb250YWluZXJzUmVnaXN0cnksIFZpZXdDb250YWluZXJMb2NhdGlvbiwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRlbnRHcm91cHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3Mvdmlld1BhbmUuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hTdGF0ZUNvbnRleHQsIFJlbW90ZU5hbWVDb250ZXh0LCBPcGVuRm9sZGVyV29ya3NwYWNlU3VwcG9ydENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSXNXZWJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQWRkUm9vdEZvbGRlckFjdGlvbiwgT3BlbkZvbGRlckFjdGlvbiwgT3BlbkZvbGRlclZpYVdvcmtzcGFjZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93b3Jrc3BhY2VBY3Rpb25zLmpzJztcbmltcG9ydCB7IE9wZW5SZWNlbnRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd2luZG93QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBpc01vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5jb25zdCBleHBsb3JlclZpZXdJY29uID0gcmVnaXN0ZXJJY29uKCdleHBsb3Jlci12aWV3LWljb24nLCBDb2RpY29uLmZpbGVzLCBsb2NhbGl6ZSgnZXhwbG9yZXJWaWV3SWNvbicsICdWaWV3IGljb24gb2YgdGhlIGV4cGxvcmVyIHZpZXcuJykpO1xuY29uc3Qgb3BlbkVkaXRvcnNWaWV3SWNvbiA9IHJlZ2lzdGVySWNvbignb3Blbi1lZGl0b3JzLXZpZXctaWNvbicsIENvZGljb24uYm9vaywgbG9jYWxpemUoJ29wZW5FZGl0b3JzSWNvbicsICdWaWV3IGljb24gb2YgdGhlIG9wZW4gZWRpdG9ycyB2aWV3LicpKTtcblxuZXhwb3J0IGNsYXNzIEV4cGxvcmVyVmlld2xldFZpZXdzQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5leHBsb3JlclZpZXdsZXRWaWV3cyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRwcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uRXhwbG9yZXIgfSwgKCkgPT4gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0Q29tcGxldGVXb3Jrc3BhY2UoKSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZ2lzdGVyVmlld3MoKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIod29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgoKSA9PiB0aGlzLnJlZ2lzdGVyVmlld3MoKSkpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIod29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMucmVnaXN0ZXJWaWV3cygpKSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld3MoKTogdm9pZCB7XG5cdFx0bWFyaygnY29kZS93aWxsUmVnaXN0ZXJFeHBsb3JlclZpZXdzJyk7XG5cblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnMgPSB2aWV3c1JlZ2lzdHJ5LmdldFZpZXdzKFZJRVdfQ09OVEFJTkVSKTtcblxuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yc1RvUmVnaXN0ZXI6IElWaWV3RGVzY3JpcHRvcltdID0gW107XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzVG9EZXJlZ2lzdGVyOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtdO1xuXG5cdFx0Y29uc3Qgb3BlbkVkaXRvcnNWaWV3RGVzY3JpcHRvciA9IHRoaXMuY3JlYXRlT3BlbkVkaXRvcnNWaWV3RGVzY3JpcHRvcigpO1xuXHRcdGlmICghdmlld0Rlc2NyaXB0b3JzLnNvbWUodiA9PiB2LmlkID09PSBvcGVuRWRpdG9yc1ZpZXdEZXNjcmlwdG9yLmlkKSkge1xuXHRcdFx0dmlld0Rlc2NyaXB0b3JzVG9SZWdpc3Rlci5wdXNoKG9wZW5FZGl0b3JzVmlld0Rlc2NyaXB0b3IpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGxvcmVyVmlld0Rlc2NyaXB0b3IgPSB0aGlzLmNyZWF0ZUV4cGxvcmVyVmlld0Rlc2NyaXB0b3IoKTtcblx0XHRjb25zdCByZWdpc3RlcmVkRXhwbG9yZXJWaWV3RGVzY3JpcHRvciA9IHZpZXdEZXNjcmlwdG9ycy5maW5kKHYgPT4gdi5pZCA9PT0gZXhwbG9yZXJWaWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0Y29uc3QgZW1wdHlWaWV3RGVzY3JpcHRvciA9IHRoaXMuY3JlYXRlRW1wdHlWaWV3RGVzY3JpcHRvcigpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFbXB0eVZpZXdEZXNjcmlwdG9yID0gdmlld0Rlc2NyaXB0b3JzLmZpbmQodiA9PiB2LmlkID09PSBlbXB0eVZpZXdEZXNjcmlwdG9yLmlkKTtcblxuXHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZIHx8IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdGlmIChyZWdpc3RlcmVkRXhwbG9yZXJWaWV3RGVzY3JpcHRvcikge1xuXHRcdFx0XHR2aWV3RGVzY3JpcHRvcnNUb0RlcmVnaXN0ZXIucHVzaChyZWdpc3RlcmVkRXhwbG9yZXJWaWV3RGVzY3JpcHRvcik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlZ2lzdGVyZWRFbXB0eVZpZXdEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yc1RvUmVnaXN0ZXIucHVzaChlbXB0eVZpZXdEZXNjcmlwdG9yKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHJlZ2lzdGVyZWRFbXB0eVZpZXdEZXNjcmlwdG9yKSB7XG5cdFx0XHRcdHZpZXdEZXNjcmlwdG9yc1RvRGVyZWdpc3Rlci5wdXNoKHJlZ2lzdGVyZWRFbXB0eVZpZXdEZXNjcmlwdG9yKTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVnaXN0ZXJlZEV4cGxvcmVyVmlld0Rlc2NyaXB0b3IpIHtcblx0XHRcdFx0dmlld0Rlc2NyaXB0b3JzVG9SZWdpc3Rlci5wdXNoKGV4cGxvcmVyVmlld0Rlc2NyaXB0b3IpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh2aWV3RGVzY3JpcHRvcnNUb0RlcmVnaXN0ZXIubGVuZ3RoKSB7XG5cdFx0XHR2aWV3c1JlZ2lzdHJ5LmRlcmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnNUb0RlcmVnaXN0ZXIsIFZJRVdfQ09OVEFJTkVSKTtcblx0XHR9XG5cdFx0aWYgKHZpZXdEZXNjcmlwdG9yc1RvUmVnaXN0ZXIubGVuZ3RoKSB7XG5cdFx0XHR2aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3Modmlld0Rlc2NyaXB0b3JzVG9SZWdpc3RlciwgVklFV19DT05UQUlORVIpO1xuXHRcdH1cblxuXHRcdG1hcmsoJ2NvZGUvZGlkUmVnaXN0ZXJFeHBsb3JlclZpZXdzJyk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9wZW5FZGl0b3JzVmlld0Rlc2NyaXB0b3IoKTogSVZpZXdEZXNjcmlwdG9yIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IE9wZW5FZGl0b3JzVmlldy5JRCxcblx0XHRcdG5hbWU6IE9wZW5FZGl0b3JzVmlldy5OQU1FLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihPcGVuRWRpdG9yc1ZpZXcpLFxuXHRcdFx0Y29udGFpbmVySWNvbjogb3BlbkVkaXRvcnNWaWV3SWNvbixcblx0XHRcdG9yZGVyOiAwLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdGhpZGVCeURlZmF1bHQ6IHRydWUsXG5cdFx0XHRmb2N1c0NvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZmlsZXMuYWN0aW9uLmZvY3VzT3BlbkVkaXRvcnNWaWV3Jyxcblx0XHRcdFx0a2V5YmluZGluZ3M6IHsgcHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleUNvZGUuS2V5RSkgfVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVtcHR5Vmlld0Rlc2NyaXB0b3IoKTogSVZpZXdEZXNjcmlwdG9yIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IEVtcHR5Vmlldy5JRCxcblx0XHRcdG5hbWU6IEVtcHR5Vmlldy5OQU1FLFxuXHRcdFx0Y29udGFpbmVySWNvbjogZXhwbG9yZXJWaWV3SWNvbixcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRW1wdHlWaWV3KSxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdGZvY3VzQ29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5leHBsb3Jlci5maWxlVmlldy5mb2N1cydcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVFeHBsb3JlclZpZXdEZXNjcmlwdG9yKCk6IElWaWV3RGVzY3JpcHRvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlkOiBWSUVXX0lELFxuXHRcdFx0bmFtZTogbG9jYWxpemUyKCdmb2xkZXJzJywgXCJGb2xkZXJzXCIpLFxuXHRcdFx0Y29udGFpbmVySWNvbjogZXhwbG9yZXJWaWV3SWNvbixcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRXhwbG9yZXJWaWV3KSxcblx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiBmYWxzZSxcblx0XHRcdGZvY3VzQ29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5leHBsb3Jlci5maWxlVmlldy5mb2N1cydcblx0XHRcdH1cblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHBsb3JlclZpZXdQYW5lQ29udGFpbmVyIGV4dGVuZHMgVmlld1BhbmVDb250YWluZXIge1xuXG5cdHByaXZhdGUgdmlld2xldFZpc2libGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cblx0XHRzdXBlcihWSUVXTEVUX0lELCB7IG1lcmdlVmlld1dpdGhDb250YWluZXJXaGVuU2luZ2xlVmlldzogdHJ1ZSB9LCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGxheW91dFNlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSwgZXh0ZW5zaW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgY29udGV4dFNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgbG9nU2VydmljZSk7XG5cblx0XHR0aGlzLnZpZXdsZXRWaXNpYmxlQ29udGV4dEtleSA9IEV4cGxvcmVyVmlld2xldFZpc2libGVDb250ZXh0LmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUoZSA9PiB0aGlzLnVwZGF0ZVRpdGxlQXJlYSgpKSk7XG5cdH1cblxuXHRvdmVycmlkZSBjcmVhdGUocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLmNyZWF0ZShwYXJlbnQpO1xuXHRcdHBhcmVudC5jbGFzc0xpc3QuYWRkKCdleHBsb3Jlci12aWV3bGV0Jyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlVmlldyh2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yLCBvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zKTogVmlld1BhbmUge1xuXHRcdGlmICh2aWV3RGVzY3JpcHRvci5pZCA9PT0gVklFV19JRCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhwbG9yZXJWaWV3LCB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsIGRlbGVnYXRlOiB7XG5cdFx0XHRcdFx0d2lsbE9wZW5FbGVtZW50OiBlID0+IHtcblx0XHRcdFx0XHRcdGlmICghaXNNb3VzZUV2ZW50KGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjsgLy8gb25seSBkZWxheSB3aGVuIHVzZXIgY2xpY2tzXG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IG9wZW5FZGl0b3JzVmlldyA9IHRoaXMuZ2V0T3BlbkVkaXRvcnNWaWV3KCk7XG5cdFx0XHRcdFx0XHRpZiAob3BlbkVkaXRvcnNWaWV3KSB7XG5cdFx0XHRcdFx0XHRcdGxldCBkZWxheSA9IDA7XG5cblx0XHRcdFx0XHRcdFx0Y29uc3QgY29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY29uZmlnLndvcmtiZW5jaD8uZWRpdG9yPy5lbmFibGVQcmV2aWV3KSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gZGVsYXkgb3BlbiBlZGl0b3JzIHZpZXcgd2hlbiBwcmV2aWV3IGlzIGVuYWJsZWRcblx0XHRcdFx0XHRcdFx0XHQvLyB0byBhY2NvbW9kYXRlIGZvciB0aGUgdXNlciBkb2luZyBhIGRvdWJsZSBjbGlja1xuXHRcdFx0XHRcdFx0XHRcdC8vIHRvIHBpbiB0aGUgZWRpdG9yLlxuXHRcdFx0XHRcdFx0XHRcdC8vIHdpdGhvdXQgdGhpcyBkZWxheSBhIGRvdWJsZSBjbGljayB3b3VsZCBiZSBub3Rcblx0XHRcdFx0XHRcdFx0XHQvLyBwb3NzaWJsZSBiZWNhdXNlIHRoZSBuZXh0IGVsZW1lbnQgd291bGQgbW92ZVxuXHRcdFx0XHRcdFx0XHRcdC8vIHVuZGVyIHRoZSBtb3VzZSBhZnRlciB0aGUgZmlyc3QgY2xpY2suXG5cdFx0XHRcdFx0XHRcdFx0ZGVsYXkgPSAyNTA7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRvcGVuRWRpdG9yc1ZpZXcuc2V0U3RydWN0dXJhbFJlZnJlc2hEZWxheShkZWxheSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkaWRPcGVuRWxlbWVudDogZSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoIWlzTW91c2VFdmVudChlKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47IC8vIG9ubHkgZGVsYXkgd2hlbiB1c2VyIGNsaWNrc1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjb25zdCBvcGVuRWRpdG9yc1ZpZXcgPSB0aGlzLmdldE9wZW5FZGl0b3JzVmlldygpO1xuXHRcdFx0XHRcdFx0b3BlbkVkaXRvcnNWaWV3Py5zZXRTdHJ1Y3R1cmFsUmVmcmVzaERlbGF5KDApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdXBlci5jcmVhdGVWaWV3KHZpZXdEZXNjcmlwdG9yLCBvcHRpb25zKTtcblx0fVxuXG5cdGdldEV4cGxvcmVyVmlldygpOiBFeHBsb3JlclZpZXcge1xuXHRcdHJldHVybiA8RXhwbG9yZXJWaWV3PnRoaXMuZ2V0VmlldyhWSUVXX0lEKTtcblx0fVxuXG5cdGdldE9wZW5FZGl0b3JzVmlldygpOiBPcGVuRWRpdG9yc1ZpZXcge1xuXHRcdHJldHVybiA8T3BlbkVkaXRvcnNWaWV3PnRoaXMuZ2V0VmlldyhPcGVuRWRpdG9yc1ZpZXcuSUQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3bGV0VmlzaWJsZUNvbnRleHRLZXkuc2V0KHZpc2libGUpO1xuXHRcdHN1cGVyLnNldFZpc2libGUodmlzaWJsZSk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRjb25zdCBleHBsb3JlclZpZXcgPSB0aGlzLmdldFZpZXcoVklFV19JRCk7XG5cdFx0aWYgKGV4cGxvcmVyVmlldyAmJiB0aGlzLnBhbmVzLmV2ZXJ5KHAgPT4gIXAuaXNFeHBhbmRlZCgpKSkge1xuXHRcdFx0ZXhwbG9yZXJWaWV3LnNldEV4cGFuZGVkKHRydWUpO1xuXHRcdH1cblx0XHRpZiAoZXhwbG9yZXJWaWV3Py5pc0V4cGFuZGVkKCkpIHtcblx0XHRcdGV4cGxvcmVyVmlldy5mb2N1cygpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzdXBlci5mb2N1cygpO1xuXHRcdH1cblx0fVxufVxuXG5jb25zdCB2aWV3Q29udGFpbmVyUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KTtcblxuLyoqXG4gKiBFeHBsb3JlciB2aWV3bGV0IGNvbnRhaW5lci5cbiAqL1xuZXhwb3J0IGNvbnN0IFZJRVdfQ09OVEFJTkVSOiBWaWV3Q29udGFpbmVyID0gdmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7XG5cdGlkOiBWSUVXTEVUX0lELFxuXHR0aXRsZTogbG9jYWxpemUyKCdleHBsb3JlJywgXCJFeHBsb3JlclwiKSxcblx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihFeHBsb3JlclZpZXdQYW5lQ29udGFpbmVyKSxcblx0c3RvcmFnZUlkOiAnd29ya2JlbmNoLmV4cGxvcmVyLnZpZXdzLnN0YXRlJyxcblx0aWNvbjogZXhwbG9yZXJWaWV3SWNvbixcblx0YWx3YXlzVXNlQ29udGFpbmVySW5mbzogdHJ1ZSxcblx0aGlkZUlmRW1wdHk6IHRydWUsXG5cdG9yZGVyOiAwLFxuXHRvcGVuQ29tbWFuZEFjdGlvbkRlc2NyaXB0b3I6IHtcblx0XHRpZDogVklFV0xFVF9JRCxcblx0XHR0aXRsZTogbG9jYWxpemUyKCdleHBsb3JlJywgXCJFeHBsb3JlclwiKSxcblx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pVmlld0V4cGxvcmVyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRXhwbG9yZXJcIiksXG5cdFx0a2V5YmluZGluZ3M6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUUgfSxcblx0XHRvcmRlcjogMFxuXHR9LFxufSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIHsgaXNEZWZhdWx0OiB0cnVlIH0pO1xuXG5jb25zdCBvcGVuRm9sZGVyID0gbG9jYWxpemUoJ29wZW5Gb2xkZXInLCBcIk9wZW4gRm9sZGVyXCIpO1xuY29uc3QgYWRkQUZvbGRlciA9IGxvY2FsaXplKCdhZGRBRm9sZGVyJywgXCJhZGQgYSBmb2xkZXJcIik7XG5jb25zdCBvcGVuUmVjZW50ID0gbG9jYWxpemUoJ29wZW5SZWNlbnQnLCBcIk9wZW4gUmVjZW50XCIpO1xuXG5jb25zdCBhZGRSb290Rm9sZGVyQnV0dG9uID0gYFske29wZW5Gb2xkZXJ9XShjb21tYW5kOiR7QWRkUm9vdEZvbGRlckFjdGlvbi5JRH0pYDtcbmNvbnN0IGFkZEFGb2xkZXJCdXR0b24gPSBgWyR7YWRkQUZvbGRlcn1dKGNvbW1hbmQ6JHtBZGRSb290Rm9sZGVyQWN0aW9uLklEfSlgO1xuY29uc3Qgb3BlbkZvbGRlckJ1dHRvbiA9IGBbJHtvcGVuRm9sZGVyfV0oY29tbWFuZDoke09wZW5Gb2xkZXJBY3Rpb24uSUR9KWA7XG5jb25zdCBvcGVuRm9sZGVyVmlhV29ya3NwYWNlQnV0dG9uID0gYFske29wZW5Gb2xkZXJ9XShjb21tYW5kOiR7T3BlbkZvbGRlclZpYVdvcmtzcGFjZUFjdGlvbi5JRH0pYDtcbmNvbnN0IG9wZW5SZWNlbnRCdXR0b24gPSBgWyR7b3BlblJlY2VudH1dKGNvbW1hbmQ6JHtPcGVuUmVjZW50QWN0aW9uLklEfSlgO1xuXG5jb25zdCB2aWV3c1JlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVZpZXdzUmVnaXN0cnk+KEV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KEVtcHR5Vmlldy5JRCwge1xuXHRjb250ZW50OiBsb2NhbGl6ZSh7IGtleTogJ25vV29ya3NwYWNlSGVscCcsIGNvbW1lbnQ6IFsnUGxlYXNlIGRvIG5vdCB0cmFuc2xhdGUgdGhlIHdvcmQgXCJjb21tYW5kXCIsIGl0IGlzIHBhcnQgb2Ygb3VyIGludGVybmFsIHN5bnRheCB3aGljaCBtdXN0IG5vdCBjaGFuZ2UnXSB9LFxuXHRcdFwiWW91IGhhdmUgbm90IHlldCBhZGRlZCBhIGZvbGRlciB0byB0aGUgd29ya3NwYWNlLlxcbnswfVwiLCBhZGRSb290Rm9sZGVyQnV0dG9uKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdC8vIGluc2lkZSBhIC5jb2RlLXdvcmtzcGFjZVxuXHRcdFdvcmtiZW5jaFN0YXRlQ29udGV4dC5pc0VxdWFsVG8oJ3dvcmtzcGFjZScpLFxuXHRcdC8vIHVubGVzcyB3ZSBjYW5ub3QgZW50ZXIgb3Igb3BlbiB3b3Jrc3BhY2VzIChlLmcuIHdlYiBzZXJ2ZXJsZXNzKVxuXHRcdE9wZW5Gb2xkZXJXb3Jrc3BhY2VTdXBwb3J0Q29udGV4dFxuXHQpLFxuXHRncm91cDogVmlld0NvbnRlbnRHcm91cHMuT3Blbixcblx0b3JkZXI6IDFcbn0pO1xuXG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KEVtcHR5Vmlldy5JRCwge1xuXHRjb250ZW50OiBsb2NhbGl6ZSh7IGtleTogJ25vRm9sZGVySGVscFdlYicsIGNvbW1lbnQ6IFsnUGxlYXNlIGRvIG5vdCB0cmFuc2xhdGUgdGhlIHdvcmQgXCJjb21tYW5kXCIsIGl0IGlzIHBhcnQgb2Ygb3VyIGludGVybmFsIHN5bnRheCB3aGljaCBtdXN0IG5vdCBjaGFuZ2UnXSB9LFxuXHRcdFwiWW91IGhhdmUgbm90IHlldCBvcGVuZWQgYSBmb2xkZXIuXFxuezB9XFxuezF9XCIsIG9wZW5Gb2xkZXJWaWFXb3Jrc3BhY2VCdXR0b24sIG9wZW5SZWNlbnRCdXR0b24pLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Ly8gaW5zaWRlIGEgLmNvZGUtd29ya3NwYWNlXG5cdFx0V29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJyksXG5cdFx0Ly8gd2UgY2Fubm90IGVudGVyIHdvcmtzcGFjZXMgKGUuZy4gd2ViIHNlcnZlcmxlc3MpXG5cdFx0T3BlbkZvbGRlcldvcmtzcGFjZVN1cHBvcnRDb250ZXh0LnRvTmVnYXRlZCgpXG5cdCksXG5cdGdyb3VwOiBWaWV3Q29udGVudEdyb3Vwcy5PcGVuLFxuXHRvcmRlcjogMVxufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoRW1wdHlWaWV3LklELCB7XG5cdGNvbnRlbnQ6IGxvY2FsaXplKHsga2V5OiAncmVtb3RlTm9Gb2xkZXJIZWxwJywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZSddIH0sXG5cdFx0XCJDb25uZWN0ZWQgdG8gcmVtb3RlLlxcbnswfVwiLCBvcGVuRm9sZGVyQnV0dG9uKSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdC8vIG5vdCBpbnNpZGUgYSAuY29kZS13b3Jrc3BhY2Vcblx0XHRXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ3dvcmtzcGFjZScpLFxuXHRcdC8vIGNvbm5lY3RlZCB0byBhIHJlbW90ZVxuXHRcdFJlbW90ZU5hbWVDb250ZXh0Lm5vdEVxdWFsc1RvKCcnKSxcblx0XHQvLyBidXQgbm90IGluIHdlYlxuXHRcdElzV2ViQ29udGV4dC50b05lZ2F0ZWQoKSksXG5cdGdyb3VwOiBWaWV3Q29udGVudEdyb3Vwcy5PcGVuLFxuXHRvcmRlcjogMVxufSk7XG5cbnZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQoRW1wdHlWaWV3LklELCB7XG5cdGNvbnRlbnQ6IGxvY2FsaXplKHsga2V5OiAnbm9Gb2xkZXJCdXRFZGl0b3JzSGVscCcsIGNvbW1lbnQ6IFsnUGxlYXNlIGRvIG5vdCB0cmFuc2xhdGUgdGhlIHdvcmQgXCJjb21tYW5kXCIsIGl0IGlzIHBhcnQgb2Ygb3VyIGludGVybmFsIHN5bnRheCB3aGljaCBtdXN0IG5vdCBjaGFuZ2UnXSB9LFxuXHRcdFwiWW91IGhhdmUgbm90IHlldCBvcGVuZWQgYSBmb2xkZXIuXFxuezB9XFxuT3BlbmluZyBhIGZvbGRlciB3aWxsIGNsb3NlIGFsbCBjdXJyZW50bHkgb3BlbiBlZGl0b3JzLiBUbyBrZWVwIHRoZW0gb3BlbiwgezF9IGluc3RlYWQuXCIsIG9wZW5Gb2xkZXJCdXR0b24sIGFkZEFGb2xkZXJCdXR0b24pLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Ly8gZWRpdG9ycyBhcmUgb3BlbmVkXG5cdFx0Q29udGV4dEtleUV4cHIuaGFzKCdlZGl0b3JJc09wZW4nKSxcblx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdC8vIG5vdCBpbnNpZGUgYSAuY29kZS13b3Jrc3BhY2UgYW5kIGxvY2FsXG5cdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0Lm5vdEVxdWFsc1RvKCd3b3Jrc3BhY2UnKSwgUmVtb3RlTmFtZUNvbnRleHQuaXNFcXVhbFRvKCcnKSksXG5cdFx0XHQvLyBub3QgaW5zaWRlIGEgLmNvZGUtd29ya3NwYWNlIGFuZCB3ZWJcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ3dvcmtzcGFjZScpLCBJc1dlYkNvbnRleHQpXG5cdFx0KVxuXHQpLFxuXHRncm91cDogVmlld0NvbnRlbnRHcm91cHMuT3Blbixcblx0b3JkZXI6IDFcbn0pO1xuXG52aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld1dlbGNvbWVDb250ZW50KEVtcHR5Vmlldy5JRCwge1xuXHRjb250ZW50OiBsb2NhbGl6ZSh7IGtleTogJ25vRm9sZGVySGVscCcsIGNvbW1lbnQ6IFsnUGxlYXNlIGRvIG5vdCB0cmFuc2xhdGUgdGhlIHdvcmQgXCJjb21tYW5kXCIsIGl0IGlzIHBhcnQgb2Ygb3VyIGludGVybmFsIHN5bnRheCB3aGljaCBtdXN0IG5vdCBjaGFuZ2UnXSB9LFxuXHRcdFwiWW91IGhhdmUgbm90IHlldCBvcGVuZWQgYSBmb2xkZXIuXFxuezB9XCIsIG9wZW5Gb2xkZXJCdXR0b24pLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Ly8gbm8gZWRpdG9yIGlzIG9wZW5cblx0XHRDb250ZXh0S2V5RXhwci5oYXMoJ2VkaXRvcklzT3BlbicpPy5uZWdhdGUoKSxcblx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdC8vIG5vdCBpbnNpZGUgYSAuY29kZS13b3Jrc3BhY2UgYW5kIGxvY2FsXG5cdFx0XHRDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0Lm5vdEVxdWFsc1RvKCd3b3Jrc3BhY2UnKSwgUmVtb3RlTmFtZUNvbnRleHQuaXNFcXVhbFRvKCcnKSksXG5cdFx0XHQvLyBub3QgaW5zaWRlIGEgLmNvZGUtd29ya3NwYWNlIGFuZCB3ZWJcblx0XHRcdENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hTdGF0ZUNvbnRleHQubm90RXF1YWxzVG8oJ3dvcmtzcGFjZScpLCBJc1dlYkNvbnRleHQpXG5cdFx0KVxuXHQpLFxuXHRncm91cDogVmlld0NvbnRlbnRHcm91cHMuT3Blbixcblx0b3JkZXI6IDFcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxZQUFZLFNBQThCLHFDQUFxQztBQUV4RixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQixzQkFBc0I7QUFDekQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBaUMsc0JBQXNCO0FBQ2hFLFNBQVMscUJBQXFCO0FBQzlCLFNBQTBDLFlBQW9ELHVCQUF1Qix3QkFBd0IseUJBQXlCO0FBQ3RLLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsVUFBVSxRQUFRLGVBQWU7QUFDMUMs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Q3RELFNBQVM7QUFBQSxJQUFTLEVBQUUsS0FBSyxzQkFBc0IsU0FBUyxDQUFDLHFHQUFxRyxFQUFFO0FBQUEsSUFDL0o7QUFBQSxJQUE2QjtBQUFBLEVBQWdCO0FBQUEsRUFDOUMsTUFBTSxlQUFlO0FBQUE7QUFBQSxJQUVwQixzQkFBc0IsWUFBWSxXQUFXO0FBQUE7QUFBQSxJQUU3QyxrQkFBa0IsWUFBWSxFQUFFO0FBQUE7QUFBQSxJQUVoQyxhQUFhLFVBQVU7QUFBQSxFQUFDO0FBQUEsRUFDekIsT0FBTyxrQkFBa0I7QUFBQSxFQUN6QixPQUFPO0FBQ1IsQ0FBQztBQUVELGNBQWMsMkJBQTJCLFVBQVUsSUFBSTtBQUFBLEVBQ3RELFNBQVM7QUFBQSxJQUFTLEVBQUUsS0FBSywwQkFBMEIsU0FBUyxDQUFDLHFHQUFxRyxFQUFFO0FBQUEsSUFDbks7QUFBQSxJQUFtSTtBQUFBLElBQWtCO0FBQUEsRUFBZ0I7QUFBQSxFQUN0SyxNQUFNLGVBQWU7QUFBQTtBQUFBLElBRXBCLGVBQWUsSUFBSSxjQUFjO0FBQUEsSUFDakMsZUFBZTtBQUFBO0FBQUEsTUFFZCxlQUFlLElBQUksc0JBQXNCLFlBQVksV0FBVyxHQUFHLGtCQUFrQixVQUFVLEVBQUUsQ0FBQztBQUFBO0FBQUEsTUFFbEcsZUFBZSxJQUFJLHNCQUFzQixZQUFZLFdBQVcsR0FBRyxZQUFZO0FBQUEsSUFDaEY7QUFBQSxFQUNEO0FBQUEsRUFDQSxPQUFPLGtCQUFrQjtBQUFBLEVBQ3pCLE9BQU87QUFDUixDQUFDO0FBRUQsY0FBYywyQkFBMkIsVUFBVSxJQUFJO0FBQUEsRUFDdEQsU0FBUztBQUFBLElBQVMsRUFBRSxLQUFLLGdCQUFnQixTQUFTLENBQUMscUdBQXFHLEVBQUU7QUFBQSxJQUN6SjtBQUFBLElBQTBDO0FBQUEsRUFBZ0I7QUFBQSxFQUMzRCxNQUFNLGVBQWU7QUFBQTtBQUFBLElBRXBCLGVBQWUsSUFBSSxjQUFjLEdBQUcsT0FBTztBQUFBLElBQzNDLGVBQWU7QUFBQTtBQUFBLE1BRWQsZUFBZSxJQUFJLHNCQUFzQixZQUFZLFdBQVcsR0FBRyxrQkFBa0IsVUFBVSxFQUFFLENBQUM7QUFBQTtBQUFBLE1BRWxHLGVBQWUsSUFBSSxzQkFBc0IsWUFBWSxXQUFXLEdBQUcsWUFBWTtBQUFBLElBQ2hGO0FBQUEsRUFDRDtBQUFBLEVBQ0EsT0FBTyxrQkFBa0I7QUFBQSxFQUN6QixPQUFPO0FBQ1IsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
