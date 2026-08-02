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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { TreeView, TreeViewPane } from "../../../browser/parts/views/treeView.js";
import { Extensions, TreeItemCollapsibleState } from "../../../common/views.js";
import { ChangeType, EDIT_SESSIONS_DATA_VIEW_ID, EDIT_SESSIONS_SCHEME, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_TITLE, IEditSessionsStorageService } from "../common/editSessions.js";
import { URI } from "../../../../base/common/uri.js";
import { fromNow } from "../../../../base/common/date.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { API_OPEN_EDITOR_COMMAND_ID } from "../../../browser/parts/editor/editorCommands.js";
import { registerAction2, Action2, MenuId } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { joinPath } from "../../../../base/common/resources.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { basename } from "../../../../base/common/path.js";
import { createCommandUri } from "../../../../base/common/htmlContent.js";
const EDIT_SESSIONS_COUNT_KEY = "editSessionsCount";
const EDIT_SESSIONS_COUNT_CONTEXT_KEY = new RawContextKey(EDIT_SESSIONS_COUNT_KEY, 0);
let EditSessionsDataViews = class extends Disposable {
  constructor(container, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this.registerViews(container);
  }
  registerViews(container) {
    const viewId = EDIT_SESSIONS_DATA_VIEW_ID;
    const treeView = this.instantiationService.createInstance(TreeView, viewId, EDIT_SESSIONS_TITLE.value);
    treeView.showCollapseAllAction = true;
    treeView.showRefreshAction = true;
    treeView.dataProvider = this.instantiationService.createInstance(EditSessionDataViewDataProvider);
    const viewsRegistry = Registry.as(Extensions.ViewsRegistry);
    viewsRegistry.registerViews([{
      id: viewId,
      name: EDIT_SESSIONS_TITLE,
      ctorDescriptor: new SyncDescriptor(TreeViewPane),
      canToggleVisibility: true,
      canMoveView: false,
      treeView,
      collapsed: false,
      when: ContextKeyExpr.and(EDIT_SESSIONS_SHOW_VIEW),
      order: 100,
      hideByDefault: true
    }], container);
    viewsRegistry.registerViewWelcomeContent(viewId, {
      content: localize(
        "noStoredChanges",
        "You have no stored changes in the cloud to display.\n{0}",
        `[${localize("storeWorkingChangesTitle", "Store Working Changes")}](${createCommandUri("workbench.editSessions.actions.store")})`
      ),
      when: ContextKeyExpr.equals(EDIT_SESSIONS_COUNT_KEY, 0),
      order: 1
    });
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resume",
          title: localize("workbench.editSessions.actions.resume.v2", "Resume Working Changes"),
          icon: Codicon.desktopDownload,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /edit-session/i)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const editSessionId = URI.parse(handle.$treeItemHandle).path.substring(1);
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand("workbench.editSessions.actions.resumeLatest", editSessionId, true);
        await treeView.refresh();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.store",
          title: localize("workbench.editSessions.actions.store.v2", "Store Working Changes"),
          icon: Codicon.cloudUpload
        });
      }
      async run(accessor, handle) {
        const commandService = accessor.get(ICommandService);
        await commandService.executeCommand("workbench.editSessions.actions.storeCurrent");
        await treeView.refresh();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.delete",
          title: localize("workbench.editSessions.actions.delete.v2", "Delete Working Changes"),
          icon: Codicon.trash,
          menu: {
            id: MenuId.ViewItemContext,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.regex("viewItem", /edit-session/i)),
            group: "inline"
          }
        });
      }
      async run(accessor, handle) {
        const editSessionId = URI.parse(handle.$treeItemHandle).path.substring(1);
        const dialogService = accessor.get(IDialogService);
        const editSessionStorageService = accessor.get(IEditSessionsStorageService);
        const result = await dialogService.confirm({
          message: localize("confirm delete.v2", "Are you sure you want to permanently delete your working changes with ref {0}?", editSessionId),
          detail: localize("confirm delete detail.v2", " You cannot undo this action."),
          type: "warning",
          title: EDIT_SESSIONS_TITLE.value
        });
        if (result.confirmed) {
          await editSessionStorageService.delete("editSessions", editSessionId);
          await treeView.refresh();
        }
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.deleteAll",
          title: localize("workbench.editSessions.actions.deleteAll", "Delete All Working Changes from Cloud"),
          icon: Codicon.trash,
          menu: {
            id: MenuId.ViewTitle,
            when: ContextKeyExpr.and(ContextKeyExpr.equals("view", viewId), ContextKeyExpr.greater(EDIT_SESSIONS_COUNT_KEY, 0))
          }
        });
      }
      async run(accessor) {
        const dialogService = accessor.get(IDialogService);
        const editSessionStorageService = accessor.get(IEditSessionsStorageService);
        const result = await dialogService.confirm({
          message: localize("confirm delete all", "Are you sure you want to permanently delete all stored changes from the cloud?"),
          detail: localize("confirm delete all detail", " You cannot undo this action."),
          type: "warning",
          title: EDIT_SESSIONS_TITLE.value
        });
        if (result.confirmed) {
          await editSessionStorageService.delete("editSessions", null);
          await treeView.refresh();
        }
      }
    }));
  }
};
EditSessionsDataViews = __decorateClass([
  __decorateParam(1, IInstantiationService)
], EditSessionsDataViews);
let EditSessionDataViewDataProvider = class {
  constructor(editSessionsStorageService, contextKeyService, workspaceContextService, fileService) {
    this.editSessionsStorageService = editSessionsStorageService;
    this.contextKeyService = contextKeyService;
    this.workspaceContextService = workspaceContextService;
    this.fileService = fileService;
    this.editSessionsCount = EDIT_SESSIONS_COUNT_CONTEXT_KEY.bindTo(this.contextKeyService);
  }
  async getChildren(element) {
    if (!element) {
      return this.getAllEditSessions();
    }
    const [ref, folderName, filePath] = URI.parse(element.handle).path.substring(1).split("/");
    if (ref && !folderName) {
      return this.getEditSession(ref);
    } else if (ref && folderName && !filePath) {
      return this.getEditSessionFolderContents(ref, folderName);
    }
    return [];
  }
  async getAllEditSessions() {
    const allEditSessions = await this.editSessionsStorageService.list("editSessions");
    this.editSessionsCount.set(allEditSessions.length);
    const editSessions = [];
    for (const session of allEditSessions) {
      const resource = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: "remote-session-content", path: `/${session.ref}` });
      const sessionData = await this.editSessionsStorageService.read("editSessions", session.ref);
      if (!sessionData) {
        continue;
      }
      const content = JSON.parse(sessionData.content);
      const label = content.folders.map((folder) => folder.name).join(", ") ?? session.ref;
      const machineId = content.machine;
      const machineName = machineId ? await this.editSessionsStorageService.getMachineById(machineId) : void 0;
      const description = machineName === void 0 ? fromNow(session.created, true) : `${fromNow(session.created, true)}\xA0\xA0\u2022\xA0\xA0${machineName}`;
      editSessions.push({
        handle: resource.toString(),
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label },
        description,
        themeIcon: Codicon.repo,
        contextValue: `edit-session`
      });
    }
    return editSessions;
  }
  async getEditSession(ref) {
    const data = await this.editSessionsStorageService.read("editSessions", ref);
    if (!data) {
      return [];
    }
    const content = JSON.parse(data.content);
    if (content.folders.length === 1) {
      const folder = content.folders[0];
      return this.getEditSessionFolderContents(ref, folder.name);
    }
    return content.folders.map((folder) => {
      const resource = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: "remote-session-content", path: `/${data.ref}/${folder.name}` });
      return {
        handle: resource.toString(),
        collapsibleState: TreeItemCollapsibleState.Collapsed,
        label: { label: folder.name },
        themeIcon: Codicon.folder
      };
    });
  }
  async getEditSessionFolderContents(ref, folderName) {
    const data = await this.editSessionsStorageService.read("editSessions", ref);
    if (!data) {
      return [];
    }
    const content = JSON.parse(data.content);
    const currentWorkspaceFolder = this.workspaceContextService.getWorkspace().folders.find((folder) => folder.name === folderName);
    const editSessionFolder = content.folders.find((folder) => folder.name === folderName);
    if (!editSessionFolder) {
      return [];
    }
    return Promise.all(editSessionFolder.workingChanges.map(async (change) => {
      const cloudChangeUri = URI.from({ scheme: EDIT_SESSIONS_SCHEME, authority: "remote-session-content", path: `/${data.ref}/${folderName}/${change.relativeFilePath}` });
      if (currentWorkspaceFolder?.uri) {
        const localCopy = joinPath(currentWorkspaceFolder.uri, change.relativeFilePath);
        if (change.type === ChangeType.Addition && await this.fileService.exists(localCopy)) {
          return {
            handle: cloudChangeUri.toString(),
            resourceUri: cloudChangeUri,
            collapsibleState: TreeItemCollapsibleState.None,
            label: { label: change.relativeFilePath },
            themeIcon: Codicon.file,
            command: {
              id: "vscode.diff",
              title: localize("compare changes", "Compare Changes"),
              arguments: [
                localCopy,
                cloudChangeUri,
                `${basename(change.relativeFilePath)} (${localize("local copy", "Local Copy")} \u2194 ${localize("cloud changes", "Cloud Changes")})`,
                void 0
              ]
            }
          };
        }
      }
      return {
        handle: cloudChangeUri.toString(),
        resourceUri: cloudChangeUri,
        collapsibleState: TreeItemCollapsibleState.None,
        label: { label: change.relativeFilePath },
        themeIcon: Codicon.file,
        command: {
          id: API_OPEN_EDITOR_COMMAND_ID,
          title: localize("open file", "Open File"),
          arguments: [cloudChangeUri, void 0, void 0]
        }
      };
    }));
  }
};
EditSessionDataViewDataProvider = __decorateClass([
  __decorateParam(0, IEditSessionsStorageService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IFileService)
], EditSessionDataViewDataProvider);
export {
  EditSessionsDataViews
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRTZXNzaW9ucy9icm93c2VyL2VkaXRTZXNzaW9uc1ZpZXdzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVHJlZVZpZXcsIFRyZWVWaWV3UGFuZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvdmlld3MvdHJlZVZpZXcuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSVRyZWVJdGVtLCBJVHJlZVZpZXdEYXRhUHJvdmlkZXIsIElUcmVlVmlld0Rlc2NyaXB0b3IsIElWaWV3c1JlZ2lzdHJ5LCBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUsIFRyZWVWaWV3SXRlbUhhbmRsZUFyZywgVmlld0NvbnRhaW5lciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VUeXBlLCBFRElUX1NFU1NJT05TX0RBVEFfVklFV19JRCwgRURJVF9TRVNTSU9OU19TQ0hFTUUsIEVESVRfU0VTU0lPTlNfU0hPV19WSUVXLCBFRElUX1NFU1NJT05TX1RJVExFLCBFZGl0U2Vzc2lvbiwgSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEFQSV9PUEVOX0VESVRPUl9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yLCBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb21tYW5kVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuXG5jb25zdCBFRElUX1NFU1NJT05TX0NPVU5UX0tFWSA9ICdlZGl0U2Vzc2lvbnNDb3VudCc7XG5jb25zdCBFRElUX1NFU1NJT05TX0NPVU5UX0NPTlRFWFRfS0VZID0gbmV3IFJhd0NvbnRleHRLZXk8bnVtYmVyPihFRElUX1NFU1NJT05TX0NPVU5UX0tFWSwgMCk7XG5cbmV4cG9ydCBjbGFzcyBFZGl0U2Vzc2lvbnNEYXRhVmlld3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBWaWV3Q29udGFpbmVyLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucmVnaXN0ZXJWaWV3cyhjb250YWluZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZpZXdzKGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcik6IHZvaWQge1xuXHRcdGNvbnN0IHZpZXdJZCA9IEVESVRfU0VTU0lPTlNfREFUQV9WSUVXX0lEO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUcmVlVmlldywgdmlld0lkLCBFRElUX1NFU1NJT05TX1RJVExFLnZhbHVlKTtcblx0XHR0cmVlVmlldy5zaG93Q29sbGFwc2VBbGxBY3Rpb24gPSB0cnVlO1xuXHRcdHRyZWVWaWV3LnNob3dSZWZyZXNoQWN0aW9uID0gdHJ1ZTtcblx0XHR0cmVlVmlldy5kYXRhUHJvdmlkZXIgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRTZXNzaW9uRGF0YVZpZXdEYXRhUHJvdmlkZXIpO1xuXG5cdFx0Y29uc3Qgdmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihFeHRlbnNpb25zLlZpZXdzUmVnaXN0cnkpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnNcblx0XHR2aWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoWzxJVHJlZVZpZXdEZXNjcmlwdG9yPntcblx0XHRcdGlkOiB2aWV3SWQsXG5cdFx0XHRuYW1lOiBFRElUX1NFU1NJT05TX1RJVExFLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihUcmVlVmlld1BhbmUpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSxcblx0XHRcdGNhbk1vdmVWaWV3OiBmYWxzZSxcblx0XHRcdHRyZWVWaWV3LFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChFRElUX1NFU1NJT05TX1NIT1dfVklFVyksXG5cdFx0XHRvcmRlcjogMTAwLFxuXHRcdFx0aGlkZUJ5RGVmYXVsdDogdHJ1ZSxcblx0XHR9XSwgY29udGFpbmVyKTtcblxuXHRcdHZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3V2VsY29tZUNvbnRlbnQodmlld0lkLCB7XG5cdFx0XHRjb250ZW50OiBsb2NhbGl6ZShcblx0XHRcdFx0J25vU3RvcmVkQ2hhbmdlcycsXG5cdFx0XHRcdCdZb3UgaGF2ZSBubyBzdG9yZWQgY2hhbmdlcyBpbiB0aGUgY2xvdWQgdG8gZGlzcGxheS5cXG57MH0nLFxuXHRcdFx0XHRgWyR7bG9jYWxpemUoJ3N0b3JlV29ya2luZ0NoYW5nZXNUaXRsZScsICdTdG9yZSBXb3JraW5nIENoYW5nZXMnKX1dKCR7Y3JlYXRlQ29tbWFuZFVyaSgnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnN0b3JlJyl9KWAsXG5cdFx0XHQpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKEVESVRfU0VTU0lPTlNfQ09VTlRfS0VZLCAwKSxcblx0XHRcdG9yZGVyOiAxXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMucmVzdW1lJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5yZXN1bWUudjInLCBcIlJlc3VtZSBXb3JraW5nIENoYW5nZXNcIiksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5kZXNrdG9wRG93bmxvYWQsXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3SXRlbUNvbnRleHQsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3Jywgdmlld0lkKSwgQ29udGV4dEtleUV4cHIucmVnZXgoJ3ZpZXdJdGVtJywgL2VkaXQtc2Vzc2lvbi9pKSksXG5cdFx0XHRcdFx0XHRncm91cDogJ2lubGluZSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGhhbmRsZTogVHJlZVZpZXdJdGVtSGFuZGxlQXJnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGVkaXRTZXNzaW9uSWQgPSBVUkkucGFyc2UoaGFuZGxlLiR0cmVlSXRlbUhhbmRsZSkucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMucmVzdW1lTGF0ZXN0JywgZWRpdFNlc3Npb25JZCwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IHRyZWVWaWV3LnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuc3RvcmUnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnN0b3JlLnYyJywgXCJTdG9yZSBXb3JraW5nIENoYW5nZXNcIiksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5jbG91ZFVwbG9hZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgaGFuZGxlOiBUcmVlVmlld0l0ZW1IYW5kbGVBcmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5zdG9yZUN1cnJlbnQnKTtcblx0XHRcdFx0YXdhaXQgdHJlZVZpZXcucmVmcmVzaCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5kZWxldGUnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLmRlbGV0ZS52MicsIFwiRGVsZXRlIFdvcmtpbmcgQ2hhbmdlc1wiKSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRyYXNoLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld0l0ZW1Db250ZXh0LFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIHZpZXdJZCksIENvbnRleHRLZXlFeHByLnJlZ2V4KCd2aWV3SXRlbScsIC9lZGl0LXNlc3Npb24vaSkpLFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdpbmxpbmUnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBoYW5kbGU6IFRyZWVWaWV3SXRlbUhhbmRsZUFyZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBlZGl0U2Vzc2lvbklkID0gVVJJLnBhcnNlKGhhbmRsZS4kdHJlZUl0ZW1IYW5kbGUpLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgZWRpdFNlc3Npb25TdG9yYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtIGRlbGV0ZS52MicsICdBcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gcGVybWFuZW50bHkgZGVsZXRlIHlvdXIgd29ya2luZyBjaGFuZ2VzIHdpdGggcmVmIHswfT8nLCBlZGl0U2Vzc2lvbklkKSxcblx0XHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdjb25maXJtIGRlbGV0ZSBkZXRhaWwudjInLCAnIFlvdSBjYW5ub3QgdW5kbyB0aGlzIGFjdGlvbi4nKSxcblx0XHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdFx0dGl0bGU6IEVESVRfU0VTU0lPTlNfVElUTEUudmFsdWVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgZWRpdFNlc3Npb25TdG9yYWdlU2VydmljZS5kZWxldGUoJ2VkaXRTZXNzaW9ucycsIGVkaXRTZXNzaW9uSWQpO1xuXHRcdFx0XHRcdGF3YWl0IHRyZWVWaWV3LnJlZnJlc2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5kZWxldGVBbGwnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLmRlbGV0ZUFsbCcsIFwiRGVsZXRlIEFsbCBXb3JraW5nIENoYW5nZXMgZnJvbSBDbG91ZFwiKSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRyYXNoLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIHZpZXdJZCksIENvbnRleHRLZXlFeHByLmdyZWF0ZXIoRURJVF9TRVNTSU9OU19DT1VOVF9LRVksIDApKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgZGlhbG9nU2VydmljZSA9IGFjY2Vzc29yLmdldChJRGlhbG9nU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGVkaXRTZXNzaW9uU3RvcmFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnY29uZmlybSBkZWxldGUgYWxsJywgJ0FyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBwZXJtYW5lbnRseSBkZWxldGUgYWxsIHN0b3JlZCBjaGFuZ2VzIGZyb20gdGhlIGNsb3VkPycpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2NvbmZpcm0gZGVsZXRlIGFsbCBkZXRhaWwnLCAnIFlvdSBjYW5ub3QgdW5kbyB0aGlzIGFjdGlvbi4nKSxcblx0XHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdFx0dGl0bGU6IEVESVRfU0VTU0lPTlNfVElUTEUudmFsdWVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChyZXN1bHQuY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgZWRpdFNlc3Npb25TdG9yYWdlU2VydmljZS5kZWxldGUoJ2VkaXRTZXNzaW9ucycsIG51bGwpO1xuXHRcdFx0XHRcdGF3YWl0IHRyZWVWaWV3LnJlZnJlc2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5jbGFzcyBFZGl0U2Vzc2lvbkRhdGFWaWV3RGF0YVByb3ZpZGVyIGltcGxlbWVudHMgSVRyZWVWaWV3RGF0YVByb3ZpZGVyIHtcblxuXHRwcml2YXRlIGVkaXRTZXNzaW9uc0NvdW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZTogSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmVkaXRTZXNzaW9uc0NvdW50ID0gRURJVF9TRVNTSU9OU19DT1VOVF9DT05URVhUX0tFWS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdH1cblxuXHRhc3luYyBnZXRDaGlsZHJlbihlbGVtZW50PzogSVRyZWVJdGVtKTogUHJvbWlzZTxJVHJlZUl0ZW1bXT4ge1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0QWxsRWRpdFNlc3Npb25zKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3JlZiwgZm9sZGVyTmFtZSwgZmlsZVBhdGhdID0gVVJJLnBhcnNlKGVsZW1lbnQuaGFuZGxlKS5wYXRoLnN1YnN0cmluZygxKS5zcGxpdCgnLycpO1xuXG5cdFx0aWYgKHJlZiAmJiAhZm9sZGVyTmFtZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdFNlc3Npb24ocmVmKTtcblx0XHR9IGVsc2UgaWYgKHJlZiAmJiBmb2xkZXJOYW1lICYmICFmaWxlUGF0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuZ2V0RWRpdFNlc3Npb25Gb2xkZXJDb250ZW50cyhyZWYsIGZvbGRlck5hbWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0QWxsRWRpdFNlc3Npb25zKCk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCBhbGxFZGl0U2Vzc2lvbnMgPSBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmxpc3QoJ2VkaXRTZXNzaW9ucycpO1xuXHRcdHRoaXMuZWRpdFNlc3Npb25zQ291bnQuc2V0KGFsbEVkaXRTZXNzaW9ucy5sZW5ndGgpO1xuXHRcdGNvbnN0IGVkaXRTZXNzaW9ucyA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGFsbEVkaXRTZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogRURJVF9TRVNTSU9OU19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZS1zZXNzaW9uLWNvbnRlbnQnLCBwYXRoOiBgLyR7c2Vzc2lvbi5yZWZ9YCB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5yZWFkKCdlZGl0U2Vzc2lvbnMnLCBzZXNzaW9uLnJlZik7XG5cdFx0XHRpZiAoIXNlc3Npb25EYXRhKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29udGVudDogRWRpdFNlc3Npb24gPSBKU09OLnBhcnNlKHNlc3Npb25EYXRhLmNvbnRlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBjb250ZW50LmZvbGRlcnMubWFwKChmb2xkZXIpID0+IGZvbGRlci5uYW1lKS5qb2luKCcsICcpID8/IHNlc3Npb24ucmVmO1xuXHRcdFx0Y29uc3QgbWFjaGluZUlkID0gY29udGVudC5tYWNoaW5lO1xuXHRcdFx0Y29uc3QgbWFjaGluZU5hbWUgPSBtYWNoaW5lSWQgPyBhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmdldE1hY2hpbmVCeUlkKG1hY2hpbmVJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IG1hY2hpbmVOYW1lID09PSB1bmRlZmluZWQgPyBmcm9tTm93KHNlc3Npb24uY3JlYXRlZCwgdHJ1ZSkgOiBgJHtmcm9tTm93KHNlc3Npb24uY3JlYXRlZCwgdHJ1ZSl9XFx1MDBhMFxcdTAwYTBcXHUyMDIyXFx1MDBhMFxcdTAwYTAke21hY2hpbmVOYW1lfWA7XG5cblx0XHRcdGVkaXRTZXNzaW9ucy5wdXNoKHtcblx0XHRcdFx0aGFuZGxlOiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbCB9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24sXG5cdFx0XHRcdHRoZW1lSWNvbjogQ29kaWNvbi5yZXBvLFxuXHRcdFx0XHRjb250ZXh0VmFsdWU6IGBlZGl0LXNlc3Npb25gXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdFNlc3Npb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRFZGl0U2Vzc2lvbihyZWY6IHN0cmluZyk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5yZWFkKCdlZGl0U2Vzc2lvbnMnLCByZWYpO1xuXG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnQ6IEVkaXRTZXNzaW9uID0gSlNPTi5wYXJzZShkYXRhLmNvbnRlbnQpO1xuXG5cdFx0aWYgKGNvbnRlbnQuZm9sZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdGNvbnN0IGZvbGRlciA9IGNvbnRlbnQuZm9sZGVyc1swXTtcblx0XHRcdHJldHVybiB0aGlzLmdldEVkaXRTZXNzaW9uRm9sZGVyQ29udGVudHMocmVmLCBmb2xkZXIubmFtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnRlbnQuZm9sZGVycy5tYXAoKGZvbGRlcikgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogRURJVF9TRVNTSU9OU19TQ0hFTUUsIGF1dGhvcml0eTogJ3JlbW90ZS1zZXNzaW9uLWNvbnRlbnQnLCBwYXRoOiBgLyR7ZGF0YS5yZWZ9LyR7Zm9sZGVyLm5hbWV9YCB9KTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGhhbmRsZTogcmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCxcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGZvbGRlci5uYW1lIH0sXG5cdFx0XHRcdHRoZW1lSWNvbjogQ29kaWNvbi5mb2xkZXJcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEVkaXRTZXNzaW9uRm9sZGVyQ29udGVudHMocmVmOiBzdHJpbmcsIGZvbGRlck5hbWU6IHN0cmluZyk6IFByb21pc2U8SVRyZWVJdGVtW10+IHtcblx0XHRjb25zdCBkYXRhID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5yZWFkKCdlZGl0U2Vzc2lvbnMnLCByZWYpO1xuXG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnQ6IEVkaXRTZXNzaW9uID0gSlNPTi5wYXJzZShkYXRhLmNvbnRlbnQpO1xuXG5cdFx0Y29uc3QgY3VycmVudFdvcmtzcGFjZUZvbGRlciA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5maW5kKChmb2xkZXIpID0+IGZvbGRlci5uYW1lID09PSBmb2xkZXJOYW1lKTtcblx0XHRjb25zdCBlZGl0U2Vzc2lvbkZvbGRlciA9IGNvbnRlbnQuZm9sZGVycy5maW5kKChmb2xkZXIpID0+IGZvbGRlci5uYW1lID09PSBmb2xkZXJOYW1lKTtcblxuXHRcdGlmICghZWRpdFNlc3Npb25Gb2xkZXIpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoZWRpdFNlc3Npb25Gb2xkZXIud29ya2luZ0NoYW5nZXMubWFwKGFzeW5jIChjaGFuZ2UpID0+IHtcblx0XHRcdGNvbnN0IGNsb3VkQ2hhbmdlVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IEVESVRfU0VTU0lPTlNfU0NIRU1FLCBhdXRob3JpdHk6ICdyZW1vdGUtc2Vzc2lvbi1jb250ZW50JywgcGF0aDogYC8ke2RhdGEucmVmfS8ke2ZvbGRlck5hbWV9LyR7Y2hhbmdlLnJlbGF0aXZlRmlsZVBhdGh9YCB9KTtcblxuXHRcdFx0aWYgKGN1cnJlbnRXb3Jrc3BhY2VGb2xkZXI/LnVyaSkge1xuXHRcdFx0XHQvLyBmaW5kIHRoZSBjb3JyZXNwb25kaW5nIGZpbGUgaW4gdGhlIHdvcmtzcGFjZVxuXHRcdFx0XHRjb25zdCBsb2NhbENvcHkgPSBqb2luUGF0aChjdXJyZW50V29ya3NwYWNlRm9sZGVyLnVyaSwgY2hhbmdlLnJlbGF0aXZlRmlsZVBhdGgpO1xuXHRcdFx0XHRpZiAoY2hhbmdlLnR5cGUgPT09IENoYW5nZVR5cGUuQWRkaXRpb24gJiYgYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMobG9jYWxDb3B5KSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRoYW5kbGU6IGNsb3VkQ2hhbmdlVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRyZXNvdXJjZVVyaTogY2xvdWRDaGFuZ2VVcmksXG5cdFx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSxcblx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBjaGFuZ2UucmVsYXRpdmVGaWxlUGF0aCB9LFxuXHRcdFx0XHRcdFx0dGhlbWVJY29uOiBDb2RpY29uLmZpbGUsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdGlkOiAndnNjb2RlLmRpZmYnLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2NvbXBhcmUgY2hhbmdlcycsICdDb21wYXJlIENoYW5nZXMnKSxcblx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0bG9jYWxDb3B5LFxuXHRcdFx0XHRcdFx0XHRcdGNsb3VkQ2hhbmdlVXJpLFxuXHRcdFx0XHRcdFx0XHRcdGAke2Jhc2VuYW1lKGNoYW5nZS5yZWxhdGl2ZUZpbGVQYXRoKX0gKCR7bG9jYWxpemUoJ2xvY2FsIGNvcHknLCAnTG9jYWwgQ29weScpfSBcXHUyMTk0ICR7bG9jYWxpemUoJ2Nsb3VkIGNoYW5nZXMnLCAnQ2xvdWQgQ2hhbmdlcycpfSlgLFxuXHRcdFx0XHRcdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRoYW5kbGU6IGNsb3VkQ2hhbmdlVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHJlc291cmNlVXJpOiBjbG91ZENoYW5nZVVyaSxcblx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmUsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiBjaGFuZ2UucmVsYXRpdmVGaWxlUGF0aCB9LFxuXHRcdFx0XHR0aGVtZUljb246IENvZGljb24uZmlsZSxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBBUElfT1BFTl9FRElUT1JfQ09NTUFORF9JRCxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ29wZW4gZmlsZScsICdPcGVuIEZpbGUnKSxcblx0XHRcdFx0XHRhcmd1bWVudHM6IFtjbG91ZENoYW5nZVVyaSwgdW5kZWZpbmVkLCB1bmRlZmluZWRdXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxZQUFtRixnQ0FBc0U7QUFDbEssU0FBUyxZQUFZLDRCQUE0QixzQkFBc0IseUJBQXlCLHFCQUFrQyxtQ0FBbUM7QUFDckssU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxr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
