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
import { localize } from "../../../../nls.js";
import { Disposable, dispose, DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { INotificationService, Severity, NeverShowAgainScope, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { isAbsolute } from "../../../../base/common/path.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
let WorkspaceWatcher = class extends Disposable {
  constructor(fileService, configurationService, contextService, notificationService, openerService, uriIdentityService, hostService, telemetryService) {
    super();
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.notificationService = notificationService;
    this.openerService = openerService;
    this.uriIdentityService = uriIdentityService;
    this.hostService = hostService;
    this.telemetryService = telemetryService;
    this.watchedWorkspaces = new ResourceMap((resource) => this.uriIdentityService.extUri.getComparisonKey(resource));
    this.registerListeners();
    this.refresh();
  }
  registerListeners() {
    this._register(this.contextService.onDidChangeWorkspaceFolders((e) => this.onDidChangeWorkspaceFolders(e)));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onDidChangeConfiguration(e)));
    this._register(this.fileService.onDidWatchError((error) => this.onDidWatchError(error)));
  }
  onDidChangeWorkspaceFolders(e) {
    for (const removed of e.removed) {
      this.unwatchWorkspace(removed);
    }
    for (const added of e.added) {
      this.watchWorkspace(added);
    }
  }
  onDidChangeWorkbenchState() {
    this.refresh();
  }
  onDidChangeConfiguration(e) {
    if (e.affectsConfiguration("files.watcherExclude") || e.affectsConfiguration("files.watcherInclude")) {
      this.refresh();
    }
  }
  onDidWatchError(error) {
    const msg = error.toString();
    let reason = void 0;
    if (msg.indexOf("ENOSPC") >= 0) {
      reason = "ENOSPC";
      this.notificationService.prompt(
        Severity.Warning,
        localize("enospcError", "Unable to watch for file changes. Please follow the instructions link to resolve this issue."),
        [{
          label: localize("learnMore", "Instructions"),
          run: () => this.openerService.open(URI.parse("https://go.microsoft.com/fwlink/?linkid=867693"))
        }],
        {
          sticky: true,
          neverShowAgain: { id: "ignoreEnospcError", isSecondary: true, scope: NeverShowAgainScope.WORKSPACE }
        }
      );
    } else if (msg.indexOf("EUNKNOWN") >= 0) {
      reason = "EUNKNOWN";
      this.notificationService.prompt(
        Severity.Warning,
        localize("eshutdownError", "File changes watcher stopped unexpectedly. A reload of the window may enable the watcher again unless the workspace cannot be watched for file changes."),
        [{
          label: localize("reload", "Reload"),
          run: () => this.hostService.reload()
        }],
        {
          sticky: true,
          priority: NotificationPriority.SILENT
          // reduce potential spam since we don't really know how often this fires
        }
      );
    } else if (msg.indexOf("ETERM") >= 0) {
      reason = "ETERM";
    }
    if (reason) {
      this.telemetryService.publicLog2("fileWatcherError", { reason });
    }
  }
  watchWorkspace(workspace) {
    const excludes = [];
    const config = this.configurationService.getValue({ resource: workspace.uri });
    if (config.files?.watcherExclude) {
      for (const key in config.files.watcherExclude) {
        if (key && config.files.watcherExclude[key] === true) {
          excludes.push(key);
        }
      }
    }
    const pathsToWatch = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    pathsToWatch.set(workspace.uri, workspace.uri);
    if (config.files?.watcherInclude) {
      for (const includePath of config.files.watcherInclude) {
        if (!includePath) {
          continue;
        }
        if (isAbsolute(includePath)) {
          const candidate = URI.file(includePath).with({ scheme: workspace.uri.scheme });
          if (this.uriIdentityService.extUri.isEqualOrParent(candidate, workspace.uri)) {
            pathsToWatch.set(candidate, candidate);
          }
        } else {
          const candidate = workspace.toResource(includePath);
          pathsToWatch.set(candidate, candidate);
        }
      }
    }
    const disposables = new DisposableStore();
    for (const [, pathToWatch] of pathsToWatch) {
      disposables.add(this.fileService.watch(pathToWatch, { recursive: true, excludes }));
    }
    this.watchedWorkspaces.set(workspace.uri, disposables);
  }
  unwatchWorkspace(workspace) {
    if (this.watchedWorkspaces.has(workspace.uri)) {
      dispose(this.watchedWorkspaces.get(workspace.uri));
      this.watchedWorkspaces.delete(workspace.uri);
    }
  }
  refresh() {
    this.unwatchWorkspaces();
    for (const folder of this.contextService.getWorkspace().folders) {
      this.watchWorkspace(folder);
    }
  }
  unwatchWorkspaces() {
    for (const [, disposable] of this.watchedWorkspaces) {
      disposable.dispose();
    }
    this.watchedWorkspaces.clear();
  }
  dispose() {
    super.dispose();
    this.unwatchWorkspaces();
  }
};
WorkspaceWatcher.ID = "workbench.contrib.workspaceWatcher";
WorkspaceWatcher = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, IHostService),
  __decorateParam(7, ITelemetryService)
], WorkspaceWatcher);
export {
  WorkspaceWatcher
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvd29ya3NwYWNlV2F0Y2hlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlLCBEaXNwb3NhYmxlLCBkaXNwb3NlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSwgSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZXNDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSwgTmV2ZXJTaG93QWdhaW5TY29wZSwgTm90aWZpY2F0aW9uUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VXYXRjaGVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLndvcmtzcGFjZVdhdGNoZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2F0Y2hlZFdvcmtzcGFjZXMgPSBuZXcgUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KHJlc291cmNlID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHJlc291cmNlKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblxuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhlID0+IHRoaXMub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb250ZXh0U2VydmljZS5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCgpID0+IHRoaXMub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB0aGlzLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRXYXRjaEVycm9yKGVycm9yID0+IHRoaXMub25EaWRXYXRjaEVycm9yKGVycm9yKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZTogSVdvcmtzcGFjZUZvbGRlcnNDaGFuZ2VFdmVudCk6IHZvaWQge1xuXG5cdFx0Ly8gUmVtb3ZlZCB3b3Jrc3BhY2U6IFVud2F0Y2hcblx0XHRmb3IgKGNvbnN0IHJlbW92ZWQgb2YgZS5yZW1vdmVkKSB7XG5cdFx0XHR0aGlzLnVud2F0Y2hXb3Jrc3BhY2UocmVtb3ZlZCk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkZWQgd29ya3NwYWNlOiBXYXRjaFxuXHRcdGZvciAoY29uc3QgYWRkZWQgb2YgZS5hZGRlZCkge1xuXHRcdFx0dGhpcy53YXRjaFdvcmtzcGFjZShhZGRlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZTogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmaWxlcy53YXRjaGVyRXhjbHVkZScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2ZpbGVzLndhdGNoZXJJbmNsdWRlJykpIHtcblx0XHRcdHRoaXMucmVmcmVzaCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRXYXRjaEVycm9yKGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdGNvbnN0IG1zZyA9IGVycm9yLnRvU3RyaW5nKCk7XG5cdFx0bGV0IHJlYXNvbjogJ0VOT1NQQycgfCAnRVVOS05PV04nIHwgJ0VURVJNJyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIERldGVjdCBpZiB3ZSBydW4gaW50byBFTk9TUEMgaXNzdWVzXG5cdFx0aWYgKG1zZy5pbmRleE9mKCdFTk9TUEMnKSA+PSAwKSB7XG5cdFx0XHRyZWFzb24gPSAnRU5PU1BDJztcblxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bG9jYWxpemUoJ2Vub3NwY0Vycm9yJywgXCJVbmFibGUgdG8gd2F0Y2ggZm9yIGZpbGUgY2hhbmdlcy4gUGxlYXNlIGZvbGxvdyB0aGUgaW5zdHJ1Y3Rpb25zIGxpbmsgdG8gcmVzb2x2ZSB0aGlzIGlzc3VlLlwiKSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xlYXJuTW9yZScsIFwiSW5zdHJ1Y3Rpb25zXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oVVJJLnBhcnNlKCdodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9saW5raWQ9ODY3NjkzJykpXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRcdG5ldmVyU2hvd0FnYWluOiB7IGlkOiAnaWdub3JlRW5vc3BjRXJyb3InLCBpc1NlY29uZGFyeTogdHJ1ZSwgc2NvcGU6IE5ldmVyU2hvd0FnYWluU2NvcGUuV09SS1NQQUNFIH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBEZXRlY3Qgd2hlbiB0aGUgd2F0Y2hlciB0aHJvd3MgYW4gZXJyb3IgdW5leHBlY3RlZGx5XG5cdFx0ZWxzZSBpZiAobXNnLmluZGV4T2YoJ0VVTktOT1dOJykgPj0gMCkge1xuXHRcdFx0cmVhc29uID0gJ0VVTktOT1dOJztcblxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bG9jYWxpemUoJ2VzaHV0ZG93bkVycm9yJywgXCJGaWxlIGNoYW5nZXMgd2F0Y2hlciBzdG9wcGVkIHVuZXhwZWN0ZWRseS4gQSByZWxvYWQgb2YgdGhlIHdpbmRvdyBtYXkgZW5hYmxlIHRoZSB3YXRjaGVyIGFnYWluIHVubGVzcyB0aGUgd29ya3NwYWNlIGNhbm5vdCBiZSB3YXRjaGVkIGZvciBmaWxlIGNoYW5nZXMuXCIpLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVsb2FkJywgXCJSZWxvYWRcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmhvc3RTZXJ2aWNlLnJlbG9hZCgpXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3RpY2t5OiB0cnVlLFxuXHRcdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5TSUxFTlQgLy8gcmVkdWNlIHBvdGVudGlhbCBzcGFtIHNpbmNlIHdlIGRvbid0IHJlYWxseSBrbm93IGhvdyBvZnRlbiB0aGlzIGZpcmVzXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZWN0IHVuZXhwZWN0ZWQgdGVybWluYXRpb25cblx0XHRlbHNlIGlmIChtc2cuaW5kZXhPZignRVRFUk0nKSA+PSAwKSB7XG5cdFx0XHRyZWFzb24gPSAnRVRFUk0nO1xuXHRcdH1cblxuXHRcdC8vIExvZyB0ZWxlbWV0cnkgaWYgd2UgZ2F0aGVyZWQgYSByZWFzb24gKGxvZ2dpbmcgaXQgZnJvbSB0aGUgcmVuZGVyZXJcblx0XHQvLyBhbGxvd3MgdXMgdG8gaW52ZXN0aWdhdGUgdGhpcyBzaXR1YXRpb24gaW4gY29udGV4dCBvZiBleHBlcmltZW50cylcblx0XHRpZiAocmVhc29uKSB7XG5cdFx0XHR0eXBlIFdhdGNoRXJyb3JDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdicGFzZXJvJztcblx0XHRcdFx0Y29tbWVudDogJ0FuIGV2ZW50IHRoYXQgZmlyZXMgd2hlbiBhIHdhdGNoZXIgZXJyb3JzJztcblx0XHRcdFx0cmVhc29uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHdhdGNoZXIgZXJyb3IgcmVhc29uLicgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIFdhdGNoRXJyb3JFdmVudCA9IHtcblx0XHRcdFx0cmVhc29uOiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V2F0Y2hFcnJvckV2ZW50LCBXYXRjaEVycm9yQ2xhc3NpZmljYXRpb24+KCdmaWxlV2F0Y2hlckVycm9yJywgeyByZWFzb24gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB3YXRjaFdvcmtzcGFjZSh3b3Jrc3BhY2U6IElXb3Jrc3BhY2VGb2xkZXIpOiB2b2lkIHtcblxuXHRcdC8vIENvbXB1dGUgdGhlIHdhdGNoZXIgZXhjbHVkZSBydWxlcyBmcm9tIGNvbmZpZ3VyYXRpb25cblx0XHRjb25zdCBleGNsdWRlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KHsgcmVzb3VyY2U6IHdvcmtzcGFjZS51cmkgfSk7XG5cdFx0aWYgKGNvbmZpZy5maWxlcz8ud2F0Y2hlckV4Y2x1ZGUpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIGNvbmZpZy5maWxlcy53YXRjaGVyRXhjbHVkZSkge1xuXHRcdFx0XHRpZiAoa2V5ICYmIGNvbmZpZy5maWxlcy53YXRjaGVyRXhjbHVkZVtrZXldID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0ZXhjbHVkZXMucHVzaChrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0aHNUb1dhdGNoID0gbmV3IFJlc291cmNlTWFwPFVSST4odXJpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXG5cdFx0Ly8gQWRkIHRoZSB3b3Jrc3BhY2UgYXMgcGF0aCB0byB3YXRjaFxuXHRcdHBhdGhzVG9XYXRjaC5zZXQod29ya3NwYWNlLnVyaSwgd29ya3NwYWNlLnVyaSk7XG5cblx0XHQvLyBDb21wdXRlIGFkZGl0aW9uYWwgaW5jbHVkZXMgZnJvbSBjb25maWd1cmF0aW9uXG5cdFx0aWYgKGNvbmZpZy5maWxlcz8ud2F0Y2hlckluY2x1ZGUpIHtcblx0XHRcdGZvciAoY29uc3QgaW5jbHVkZVBhdGggb2YgY29uZmlnLmZpbGVzLndhdGNoZXJJbmNsdWRlKSB7XG5cdFx0XHRcdGlmICghaW5jbHVkZVBhdGgpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEFic29sdXRlOiB2ZXJpZnkgYSBjaGlsZCBvZiB0aGUgd29ya3NwYWNlXG5cdFx0XHRcdGlmIChpc0Fic29sdXRlKGluY2x1ZGVQYXRoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IFVSSS5maWxlKGluY2x1ZGVQYXRoKS53aXRoKHsgc2NoZW1lOiB3b3Jrc3BhY2UudXJpLnNjaGVtZSB9KTtcblx0XHRcdFx0XHRpZiAodGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudChjYW5kaWRhdGUsIHdvcmtzcGFjZS51cmkpKSB7XG5cdFx0XHRcdFx0XHRwYXRoc1RvV2F0Y2guc2V0KGNhbmRpZGF0ZSwgY2FuZGlkYXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZWxhdGl2ZTogam9pbiBhZ2FpbnN0IHdvcmtzcGFjZSBmb2xkZXJcblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gd29ya3NwYWNlLnRvUmVzb3VyY2UoaW5jbHVkZVBhdGgpO1xuXHRcdFx0XHRcdHBhdGhzVG9XYXRjaC5zZXQoY2FuZGlkYXRlLCBjYW5kaWRhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2F0Y2ggYWxsIHBhdGhzIGFzIGluc3RydWN0ZWRcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRmb3IgKGNvbnN0IFssIHBhdGhUb1dhdGNoXSBvZiBwYXRoc1RvV2F0Y2gpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLndhdGNoKHBhdGhUb1dhdGNoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZXhjbHVkZXMgfSkpO1xuXHRcdH1cblx0XHR0aGlzLndhdGNoZWRXb3Jrc3BhY2VzLnNldCh3b3Jrc3BhY2UudXJpLCBkaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRwcml2YXRlIHVud2F0Y2hXb3Jrc3BhY2Uod29ya3NwYWNlOiBJV29ya3NwYWNlRm9sZGVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMud2F0Y2hlZFdvcmtzcGFjZXMuaGFzKHdvcmtzcGFjZS51cmkpKSB7XG5cdFx0XHRkaXNwb3NlKHRoaXMud2F0Y2hlZFdvcmtzcGFjZXMuZ2V0KHdvcmtzcGFjZS51cmkpKTtcblx0XHRcdHRoaXMud2F0Y2hlZFdvcmtzcGFjZXMuZGVsZXRlKHdvcmtzcGFjZS51cmkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaCgpOiB2b2lkIHtcblxuXHRcdC8vIFVud2F0Y2ggYWxsIGZpcnN0XG5cdFx0dGhpcy51bndhdGNoV29ya3NwYWNlcygpO1xuXG5cdFx0Ly8gV2F0Y2ggZWFjaCB3b3Jrc3BhY2UgZm9sZGVyXG5cdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHR0aGlzLndhdGNoV29ya3NwYWNlKGZvbGRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1bndhdGNoV29ya3NwYWNlcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFssIGRpc3Bvc2FibGVdIG9mIHRoaXMud2F0Y2hlZFdvcmtzcGFjZXMpIHtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLndhdGNoZWRXb3Jrc3BhY2VzLmNsZWFyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblxuXHRcdHRoaXMudW53YXRjaFdvcmtzcGFjZXMoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFzQixZQUFZLFNBQVMsdUJBQXVCO0FBQ2xFLFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUF3RDtBQUNqRSxTQUFTLG9CQUF5QztBQUNsRCxTQUFTLGdDQUFnRjtBQUN6RixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHNCQUFzQixVQUFVLHFCQUFxQiw0QkFBNEI7QUFDMUYsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFFM0IsSUFBTSxtQkFBTixjQUErQixXQUFXO0FBQUEsRUFNaEQsWUFDZ0MsYUFDUyxzQkFDRyxnQkFDSixxQkFDTixlQUNLLG9CQUNQLGFBQ0ssa0JBQ25DO0FBQ0QsVUFBTTtBQVR5QjtBQUNTO0FBQ0c7QUFDSjtBQUNOO0FBQ0s7QUFDUDtBQUNLO0FBVnJDLFNBQWlCLG9CQUFvQixJQUFJLFlBQXlCLGNBQVksS0FBSyxtQkFBbUIsT0FBTyxpQkFBaUIsUUFBUSxDQUFDO0FBY3RJLFNBQUssa0JBQWtCO0FBRXZCLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVRLG9CQUEwQjtBQUNqQyxTQUFLLFVBQVUsS0FBSyxlQUFlLDRCQUE0QixPQUFLLEtBQUssNEJBQTRCLENBQUMsQ0FBQyxDQUFDO0FBQ3hHLFNBQUssVUFBVSxLQUFLLGVBQWUsMEJBQTBCLE1BQU0sS0FBSywwQkFBMEIsQ0FBQyxDQUFDO0FBQ3BHLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsT0FBSyxLQUFLLHlCQUF5QixDQUFDLENBQUMsQ0FBQztBQUN4RyxTQUFLLFVBQVUsS0FBSyxZQUFZLGdCQUFnQixXQUFTLEtBQUssZ0JBQWdCLEtBQUssQ0FBQyxDQUFDO0FBQUEsRUFDdEY7QUFBQSxFQUVRLDRCQUE0QixHQUF1QztBQUcxRSxlQUFXLFdBQVcsRUFBRSxTQUFTO0FBQ2hDLFdBQUssaUJBQWlCLE9BQU87QUFBQSxJQUM5QjtBQUdBLGVBQVcsU0FBUyxFQUFFLE9BQU87QUFDNUIsV0FBSyxlQUFlLEtBQUs7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDRCQUFrQztBQUN6QyxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFUSx5QkFBeUIsR0FBb0M7QUFDcEUsUUFBSSxFQUFFLHFCQUFxQixzQkFBc0IsS0FBSyxFQUFFLHFCQUFxQixzQkFBc0IsR0FBRztBQUNyRyxXQUFLLFFBQVE7QUFBQSxJQUNkO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLE9BQW9CO0FBQzNDLFVBQU0sTUFBTSxNQUFNLFNBQVM7QUFDM0IsUUFBSSxTQUFzRDtBQUcxRCxRQUFJLElBQUksUUFBUSxRQUFRLEtBQUssR0FBRztBQUMvQixlQUFTO0FBRVQsV0FBSyxvQkFBb0I7QUFBQSxRQUN4QixTQUFTO0FBQUEsUUFDVCxTQUFTLGVBQWUsOEZBQThGO0FBQUEsUUFDdEgsQ0FBQztBQUFBLFVBQ0EsT0FBTyxTQUFTLGFBQWEsY0FBYztBQUFBLFVBQzNDLEtBQUssTUFBTSxLQUFLLGNBQWMsS0FBSyxJQUFJLE1BQU0sZ0RBQWdELENBQUM7QUFBQSxRQUMvRixDQUFDO0FBQUEsUUFDRDtBQUFBLFVBQ0MsUUFBUTtBQUFBLFVBQ1IsZ0JBQWdCLEVBQUUsSUFBSSxxQkFBcUIsYUFBYSxNQUFNLE9BQU8sb0JBQW9CLFVBQVU7QUFBQSxRQUNwRztBQUFBLE1BQ0Q7QUFBQSxJQUNELFdBR1MsSUFBSSxRQUFRLFVBQVUsS0FBSyxHQUFHO0FBQ3RDLGVBQVM7QUFFVCxXQUFLLG9CQUFvQjtBQUFBLFFBQ3hCLFNBQVM7QUFBQSxRQUNULFNBQVMsa0JBQWtCLHlKQUF5SjtBQUFBLFFBQ3BMLENBQUM7QUFBQSxVQUNBLE9BQU8sU0FBUyxVQUFVLFFBQVE7QUFBQSxVQUNsQyxLQUFLLE1BQU0sS0FBSyxZQUFZLE9BQU87QUFBQSxRQUNwQyxDQUFDO0FBQUEsUUFDRDtBQUFBLFVBQ0MsUUFBUTtBQUFBLFVBQ1IsVUFBVSxxQkFBcUI7QUFBQTtBQUFBLFFBQ2hDO0FBQUEsTUFDRDtBQUFBLElBQ0QsV0FHUyxJQUFJLFFBQVEsT0FBTyxLQUFLLEdBQUc7QUFDbkMsZUFBUztBQUFBLElBQ1Y7QUFJQSxRQUFJLFFBQVE7QUFTWCxXQUFLLGlCQUFpQixXQUFzRCxvQkFBb0IsRUFBRSxPQUFPLENBQUM7QUFBQSxJQUMzRztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsV0FBbUM7QUFHekQsVUFBTSxXQUFxQixDQUFDO0FBQzVCLFVBQU0sU0FBUyxLQUFLLHFCQUFxQixTQUE4QixFQUFFLFVBQVUsVUFBVSxJQUFJLENBQUM7QUFDbEcsUUFBSSxPQUFPLE9BQU8sZ0JBQWdCO0FBQ2pDLGlCQUFXLE9BQU8sT0FBTyxNQUFNLGdCQUFnQjtBQUM5QyxZQUFJLE9BQU8sT0FBTyxNQUFNLGVBQWUsR0FBRyxNQUFNLE1BQU07QUFDckQsbUJBQVMsS0FBSyxHQUFHO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxJQUFJLFlBQWlCLFNBQU8sS0FBSyxtQkFBbUIsT0FBTyxpQkFBaUIsR0FBRyxDQUFDO0FBR3JHLGlCQUFhLElBQUksVUFBVSxLQUFLLFVBQVUsR0FBRztBQUc3QyxRQUFJLE9BQU8sT0FBTyxnQkFBZ0I7QUFDakMsaUJBQVcsZUFBZSxPQUFPLE1BQU0sZ0JBQWdCO0FBQ3RELFlBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsUUFDRDtBQUdBLFlBQUksV0FBVyxXQUFXLEdBQUc7QUFDNUIsZ0JBQU0sWUFBWSxJQUFJLEtBQUssV0FBVyxFQUFFLEtBQUssRUFBRSxRQUFRLFVBQVUsSUFBSSxPQUFPLENBQUM7QUFDN0UsY0FBSSxLQUFLLG1CQUFtQixPQUFPLGdCQUFnQixXQUFXLFVBQVUsR0FBRyxHQUFHO0FBQzdFLHlCQUFhLElBQUksV0FBVyxTQUFTO0FBQUEsVUFDdEM7QUFBQSxRQUNELE9BR0s7QUFDSixnQkFBTSxZQUFZLFVBQVUsV0FBVyxXQUFXO0FBQ2xELHVCQUFhLElBQUksV0FBVyxTQUFTO0FBQUEsUUFDdEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxlQUFXLENBQUMsRUFBRSxXQUFXLEtBQUssY0FBYztBQUMzQyxrQkFBWSxJQUFJLEtBQUssWUFBWSxNQUFNLGFBQWEsRUFBRSxXQUFXLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxJQUNuRjtBQUNBLFNBQUssa0JBQWtCLElBQUksVUFBVSxLQUFLLFdBQVc7QUFBQSxFQUN0RDtBQUFBLEVBRVEsaUJBQWlCLFdBQW1DO0FBQzNELFFBQUksS0FBSyxrQkFBa0IsSUFBSSxVQUFVLEdBQUcsR0FBRztBQUM5QyxjQUFRLEtBQUssa0JBQWtCLElBQUksVUFBVSxHQUFHLENBQUM7QUFDakQsV0FBSyxrQkFBa0IsT0FBTyxVQUFVLEdBQUc7QUFBQSxJQUM1QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLFVBQWdCO0FBR3ZCLFNBQUssa0JBQWtCO0FBR3ZCLGVBQVcsVUFBVSxLQUFLLGVBQWUsYUFBYSxFQUFFLFNBQVM7QUFDaEUsV0FBSyxlQUFlLE1BQU07QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG9CQUEwQjtBQUNqQyxlQUFXLENBQUMsRUFBRSxVQUFVLEtBQUssS0FBSyxtQkFBbUI7QUFDcEQsaUJBQVcsUUFBUTtBQUFBLElBQ3BCO0FBQ0EsU0FBSyxrQkFBa0IsTUFBTTtBQUFBLEVBQzlCO0FBQUEsRUFFUyxVQUFnQjtBQUN4QixVQUFNLFFBQVE7QUFFZCxTQUFLLGtCQUFrQjtBQUFBLEVBQ3hCO0FBQ0Q7QUFoTWEsaUJBRUksS0FBSztBQUZULG1CQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWRVOyIsCiAgIm5hbWVzIjogW10KfQo=
