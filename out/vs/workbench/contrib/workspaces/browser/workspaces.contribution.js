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
import { localize, localize2 } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { hasWorkspaceFileExtension, IWorkspaceContextService, WorkbenchState, WORKSPACE_SUFFIX } from "../../../../platform/workspace/common/workspace.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { INotificationService, NeverShowAgainScope, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { isEqual, joinPath } from "../../../../base/common/resources.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope } from "../../../../platform/storage/common/storage.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ActiveEditorContext, IsSessionsWindowContext, ResourceContextKey, TemporaryWorkspaceContext } from "../../../common/contextkeys.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TEXT_FILE_EDITOR_ID } from "../../files/common/files.js";
import "./recentRemoteFolderPruner.js";
let WorkspacesFinderContribution = class extends Disposable {
  constructor(contextService, notificationService, fileService, quickInputService, hostService, storageService) {
    super();
    this.contextService = contextService;
    this.notificationService = notificationService;
    this.fileService = fileService;
    this.quickInputService = quickInputService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.findWorkspaces();
  }
  async findWorkspaces() {
    const folder = this.contextService.getWorkspace().folders[0];
    if (!folder || this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER || isVirtualWorkspace(this.contextService.getWorkspace())) {
      return;
    }
    const rootFileNames = (await this.fileService.resolve(folder.uri)).children?.map((child) => child.name);
    if (Array.isArray(rootFileNames)) {
      const workspaceFiles = rootFileNames.filter(hasWorkspaceFileExtension);
      if (workspaceFiles.length > 0) {
        this.doHandleWorkspaceFiles(folder.uri, workspaceFiles);
      }
    }
  }
  doHandleWorkspaceFiles(folder, workspaces) {
    const neverShowAgain = { id: "workspaces.dontPromptToOpen", scope: NeverShowAgainScope.WORKSPACE, isSecondary: true };
    if (workspaces.length === 1) {
      const workspaceFile = workspaces[0];
      this.notificationService.prompt(Severity.Info, localize(
        {
          key: "foundWorkspace",
          comment: ['{Locked="]({1})"}']
        },
        "This folder contains a workspace file '{0}'. Do you want to open it? [Learn more]({1}) about workspace files.",
        workspaceFile,
        "https://go.microsoft.com/fwlink/?linkid=2025315"
      ), [{
        label: localize("openWorkspace", "Open Workspace"),
        run: () => this.hostService.openWindow([{ workspaceUri: joinPath(folder, workspaceFile) }])
      }], {
        neverShowAgain,
        priority: !this.storageService.isNew(StorageScope.WORKSPACE) ? NotificationPriority.SILENT : NotificationPriority.OPTIONAL
        // https://github.com/microsoft/vscode/issues/125315
      });
    } else if (workspaces.length > 1) {
      this.notificationService.prompt(Severity.Info, localize({
        key: "foundWorkspaces",
        comment: ['{Locked="]({0})"}']
      }, "This folder contains multiple workspace files. Do you want to open one? [Learn more]({0}) about workspace files.", "https://go.microsoft.com/fwlink/?linkid=2025315"), [{
        label: localize("selectWorkspace", "Select Workspace"),
        run: () => {
          this.quickInputService.pick(
            workspaces.map((workspace) => ({ label: workspace })),
            { placeHolder: localize("selectToOpen", "Select a workspace to open") }
          ).then((pick) => {
            if (pick) {
              this.hostService.openWindow([{ workspaceUri: joinPath(folder, pick.label) }]);
            }
          });
        }
      }], {
        neverShowAgain,
        priority: !this.storageService.isNew(StorageScope.WORKSPACE) ? NotificationPriority.SILENT : NotificationPriority.OPTIONAL
        // https://github.com/microsoft/vscode/issues/125315
      });
    }
  }
};
WorkspacesFinderContribution = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IStorageService)
], WorkspacesFinderContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspacesFinderContribution, LifecyclePhase.Eventually);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.openWorkspaceFromEditor",
      title: localize2("openWorkspace", "Open Workspace"),
      f1: false,
      menu: {
        id: MenuId.EditorContent,
        when: ContextKeyExpr.and(
          ResourceContextKey.Extension.isEqualTo(WORKSPACE_SUFFIX),
          ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
          TemporaryWorkspaceContext.toNegated(),
          IsSessionsWindowContext.toNegated()
        )
      }
    });
  }
  async run(accessor, uri) {
    const hostService = accessor.get(IHostService);
    const contextService = accessor.get(IWorkspaceContextService);
    const notificationService = accessor.get(INotificationService);
    if (contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      const workspaceConfiguration = contextService.getWorkspace().configuration;
      if (workspaceConfiguration && isEqual(workspaceConfiguration, uri)) {
        notificationService.info(localize("alreadyOpen", "This workspace is already open."));
        return;
      }
    }
    return hostService.openWindow([{ workspaceUri: uri }]);
  }
});
export {
  WorkspacesFinderContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dvcmtzcGFjZXMvYnJvd3Nlci93b3Jrc3BhY2VzLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBoYXNXb3Jrc3BhY2VGaWxlRXh0ZW5zaW9uLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlLCBXT1JLU1BBQ0VfU1VGRklYIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU5ldmVyU2hvd0FnYWluT3B0aW9ucywgSU5vdGlmaWNhdGlvblNlcnZpY2UsIE5ldmVyU2hvd0FnYWluU2NvcGUsIE5vdGlmaWNhdGlvblByaW9yaXR5LCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsLCBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgaXNWaXJ0dWFsV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi92aXJ0dWFsV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBY3RpdmVFZGl0b3JDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgUmVzb3VyY2VDb250ZXh0S2V5LCBUZW1wb3JhcnlXb3Jrc3BhY2VDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBURVhUX0ZJTEVfRURJVE9SX0lEIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCAnLi9yZWNlbnRSZW1vdGVGb2xkZXJQcnVuZXIuanMnO1xuXG4vKipcbiAqIEEgd29ya2JlbmNoIGNvbnRyaWJ1dGlvbiB0aGF0IHdpbGwgbG9vayBmb3IgYC5jb2RlLXdvcmtzcGFjZWAgZmlsZXMgaW4gdGhlIHJvb3Qgb2YgdGhlXG4gKiB3b3Jrc3BhY2UgZm9sZGVyIGFuZCBvcGVuIGEgbm90aWZpY2F0aW9uIHRvIHN1Z2dlc3QgdG8gb3BlbiBvbmUgb2YgdGhlIHdvcmtzcGFjZXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VzRmluZGVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmZpbmRXb3Jrc3BhY2VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGZpbmRXb3Jrc3BhY2VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXTtcblx0XHRpZiAoIWZvbGRlciB8fCB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUiB8fCBpc1ZpcnR1YWxXb3Jrc3BhY2UodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkpIHtcblx0XHRcdHJldHVybjsgLy8gcmVxdWlyZSBhIHNpbmdsZSAobm9uIHZpcnR1YWwpIHJvb3QgZm9sZGVyXG5cdFx0fVxuXG5cdFx0Y29uc3Qgcm9vdEZpbGVOYW1lcyA9IChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUoZm9sZGVyLnVyaSkpLmNoaWxkcmVuPy5tYXAoY2hpbGQgPT4gY2hpbGQubmFtZSk7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkocm9vdEZpbGVOYW1lcykpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZpbGVzID0gcm9vdEZpbGVOYW1lcy5maWx0ZXIoaGFzV29ya3NwYWNlRmlsZUV4dGVuc2lvbik7XG5cdFx0XHRpZiAod29ya3NwYWNlRmlsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLmRvSGFuZGxlV29ya3NwYWNlRmlsZXMoZm9sZGVyLnVyaSwgd29ya3NwYWNlRmlsZXMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9IYW5kbGVXb3Jrc3BhY2VGaWxlcyhmb2xkZXI6IFVSSSwgd29ya3NwYWNlczogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBuZXZlclNob3dBZ2FpbjogSU5ldmVyU2hvd0FnYWluT3B0aW9ucyA9IHsgaWQ6ICd3b3Jrc3BhY2VzLmRvbnRQcm9tcHRUb09wZW4nLCBzY29wZTogTmV2ZXJTaG93QWdhaW5TY29wZS5XT1JLU1BBQ0UsIGlzU2Vjb25kYXJ5OiB0cnVlIH07XG5cblx0XHQvLyBQcm9tcHQgdG8gb3BlbiBvbmUgd29ya3NwYWNlXG5cdFx0aWYgKHdvcmtzcGFjZXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGaWxlID0gd29ya3NwYWNlc1swXTtcblxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLCBsb2NhbGl6ZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtleTogJ2ZvdW5kV29ya3NwYWNlJyxcblx0XHRcdFx0XHRjb21tZW50OiBbJ3tMb2NrZWQ9XCJdKHsxfSlcIn0nXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRcIlRoaXMgZm9sZGVyIGNvbnRhaW5zIGEgd29ya3NwYWNlIGZpbGUgJ3swfScuIERvIHlvdSB3YW50IHRvIG9wZW4gaXQ/IFtMZWFybiBtb3JlXSh7MX0pIGFib3V0IHdvcmtzcGFjZSBmaWxlcy5cIixcblx0XHRcdFx0d29ya3NwYWNlRmlsZSxcblx0XHRcdFx0J2h0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP2xpbmtpZD0yMDI1MzE1J1xuXHRcdFx0KSwgW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuV29ya3NwYWNlJywgXCJPcGVuIFdvcmtzcGFjZVwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmhvc3RTZXJ2aWNlLm9wZW5XaW5kb3coW3sgd29ya3NwYWNlVXJpOiBqb2luUGF0aChmb2xkZXIsIHdvcmtzcGFjZUZpbGUpIH1dKVxuXHRcdFx0fV0sIHtcblx0XHRcdFx0bmV2ZXJTaG93QWdhaW4sXG5cdFx0XHRcdHByaW9yaXR5OiAhdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVCA6IE5vdGlmaWNhdGlvblByaW9yaXR5Lk9QVElPTkFMIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjUzMTVcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFByb21wdCB0byBzZWxlY3QgYSB3b3Jrc3BhY2UgZnJvbSBtYW55XG5cdFx0ZWxzZSBpZiAod29ya3NwYWNlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkluZm8sIGxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnZm91bmRXb3Jrc3BhY2VzJyxcblx0XHRcdFx0Y29tbWVudDogWyd7TG9ja2VkPVwiXSh7MH0pXCJ9J11cblx0XHRcdH0sIFwiVGhpcyBmb2xkZXIgY29udGFpbnMgbXVsdGlwbGUgd29ya3NwYWNlIGZpbGVzLiBEbyB5b3Ugd2FudCB0byBvcGVuIG9uZT8gW0xlYXJuIG1vcmVdKHswfSkgYWJvdXQgd29ya3NwYWNlIGZpbGVzLlwiLCAnaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/bGlua2lkPTIwMjUzMTUnKSwgW3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzZWxlY3RXb3Jrc3BhY2UnLCBcIlNlbGVjdCBXb3Jrc3BhY2VcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhcblx0XHRcdFx0XHRcdHdvcmtzcGFjZXMubWFwKHdvcmtzcGFjZSA9PiAoeyBsYWJlbDogd29ya3NwYWNlIH0gc2F0aXNmaWVzIElRdWlja1BpY2tJdGVtKSksXG5cdFx0XHRcdFx0XHR7IHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0VG9PcGVuJywgXCJTZWxlY3QgYSB3b3Jrc3BhY2UgdG8gb3BlblwiKSB9KS50aGVuKHBpY2sgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyB3b3Jrc3BhY2VVcmk6IGpvaW5QYXRoKGZvbGRlciwgcGljay5sYWJlbCkgfV0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fV0sIHtcblx0XHRcdFx0bmV2ZXJTaG93QWdhaW4sXG5cdFx0XHRcdHByaW9yaXR5OiAhdGhpcy5zdG9yYWdlU2VydmljZS5pc05ldyhTdG9yYWdlU2NvcGUuV09SS1NQQUNFKSA/IE5vdGlmaWNhdGlvblByaW9yaXR5LlNJTEVOVCA6IE5vdGlmaWNhdGlvblByaW9yaXR5Lk9QVElPTkFMIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjUzMTVcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oV29ya3NwYWNlc0ZpbmRlckNvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuRXZlbnR1YWxseSk7XG5cbi8vIFJlbmRlciBcIk9wZW4gV29ya3NwYWNlXCIgYnV0dG9uIGluICouY29kZS13b3Jrc3BhY2UgZmlsZXNcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5vcGVuV29ya3NwYWNlRnJvbUVkaXRvcicsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdvcGVuV29ya3NwYWNlJywgXCJPcGVuIFdvcmtzcGFjZVwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5FZGl0b3JDb250ZW50LFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0UmVzb3VyY2VDb250ZXh0S2V5LkV4dGVuc2lvbi5pc0VxdWFsVG8oV09SS1NQQUNFX1NVRkZJWCksXG5cdFx0XHRcdFx0QWN0aXZlRWRpdG9yQ29udGV4dC5pc0VxdWFsVG8oVEVYVF9GSUxFX0VESVRPUl9JRCksXG5cdFx0XHRcdFx0VGVtcG9yYXJ5V29ya3NwYWNlQ29udGV4dC50b05lZ2F0ZWQoKSxcblx0XHRcdFx0XHRJc1Nlc3Npb25zV2luZG93Q29udGV4dC50b05lZ2F0ZWQoKVxuXHRcdFx0XHQpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHVyaTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBjb250ZXh0U2VydmljZSA9IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0aWYgKGNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlndXJhdGlvbiA9IGNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmNvbmZpZ3VyYXRpb247XG5cdFx0XHRpZiAod29ya3NwYWNlQ29uZmlndXJhdGlvbiAmJiBpc0VxdWFsKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb24sIHVyaSkpIHtcblx0XHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdhbHJlYWR5T3BlbicsIFwiVGhpcyB3b3Jrc3BhY2UgaXMgYWxyZWFkeSBvcGVuLlwiKSk7XG5cblx0XHRcdFx0cmV0dXJuOyAvLyB3b3Jrc3BhY2UgYWxyZWFkeSBvcGVuZWRcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyB3b3Jrc3BhY2VVcmk6IHVyaSB9XSk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYywyQkFBb0Y7QUFDM0csU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkIsMEJBQTBCLGdCQUFnQix3QkFBd0I7QUFDdEcsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBaUMsc0JBQXNCLHFCQUFxQixzQkFBc0IsZ0JBQWdCO0FBRWxILFNBQVMsU0FBUyxnQkFBZ0I7QUFDbEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyxpQkFBaUIsb0JBQW9CO0FBQzlDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsU0FB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
