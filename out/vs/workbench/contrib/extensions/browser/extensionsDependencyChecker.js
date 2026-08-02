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
import { IExtensionsWorkbenchService } from "../common/extensions.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { MenuRegistry, MenuId } from "../../../../platform/actions/common/actions.js";
import { localize } from "../../../../nls.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Action } from "../../../../base/common/actions.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Promises } from "../../../../base/common/async.js";
let ExtensionDependencyChecker = class extends Disposable {
  constructor(extensionService, extensionsWorkbenchService, notificationService, hostService) {
    super();
    this.extensionService = extensionService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.notificationService = notificationService;
    this.hostService = hostService;
    CommandsRegistry.registerCommand("workbench.extensions.installMissingDependencies", () => this.installMissingDependencies());
    MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
      command: {
        id: "workbench.extensions.installMissingDependencies",
        category: localize("extensions", "Extensions"),
        title: localize("auto install missing deps", "Install Missing Dependencies")
      }
    });
  }
  async getUninstalledMissingDependencies() {
    const allMissingDependencies = await this.getAllMissingDependencies();
    const localExtensions = await this.extensionsWorkbenchService.queryLocal();
    return allMissingDependencies.filter((id) => localExtensions.every((l) => !areSameExtensions(l.identifier, { id })));
  }
  async getAllMissingDependencies() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const runningExtensionsIds = this.extensionService.extensions.reduce((result, r) => {
      result.add(r.identifier.value.toLowerCase());
      return result;
    }, /* @__PURE__ */ new Set());
    const missingDependencies = /* @__PURE__ */ new Set();
    for (const extension of this.extensionService.extensions) {
      if (extension.extensionDependencies) {
        extension.extensionDependencies.forEach((dep) => {
          if (!runningExtensionsIds.has(dep.toLowerCase())) {
            missingDependencies.add(dep);
          }
        });
      }
    }
    return [...missingDependencies.values()];
  }
  async installMissingDependencies() {
    const missingDependencies = await this.getUninstalledMissingDependencies();
    if (missingDependencies.length) {
      const extensions = await this.extensionsWorkbenchService.getExtensions(missingDependencies.map((id) => ({ id })), CancellationToken.None);
      if (extensions.length) {
        await Promises.settled(extensions.map((extension) => this.extensionsWorkbenchService.install(extension)));
        this.notificationService.notify({
          severity: Severity.Info,
          message: localize("finished installing missing deps", "Finished installing missing dependencies. Please reload the window now."),
          actions: {
            primary: [new Action(
              "realod",
              localize("reload", "Reload Window"),
              "",
              true,
              () => this.hostService.reload()
            )]
          }
        });
      }
    } else {
      this.notificationService.info(localize("no missing deps", "There are no missing dependencies to install."));
    }
  }
};
ExtensionDependencyChecker = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IHostService)
], ExtensionDependencyChecker);
export {
  ExtensionDependencyChecker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zRGVwZW5kZW5jeUNoZWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgTWVudVJlZ2lzdHJ5LCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IFByb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uRGVwZW5kZW5jeUNoZWNrZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbE1pc3NpbmdEZXBlbmRlbmNpZXMnLCAoKSA9PiB0aGlzLmluc3RhbGxNaXNzaW5nRGVwZW5kZW5jaWVzKCkpO1xuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5pbnN0YWxsTWlzc2luZ0RlcGVuZGVuY2llcycsXG5cdFx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZSgnZXh0ZW5zaW9ucycsIFwiRXh0ZW5zaW9uc1wiKSxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhdXRvIGluc3RhbGwgbWlzc2luZyBkZXBzJywgXCJJbnN0YWxsIE1pc3NpbmcgRGVwZW5kZW5jaWVzXCIpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFVuaW5zdGFsbGVkTWlzc2luZ0RlcGVuZGVuY2llcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgYWxsTWlzc2luZ0RlcGVuZGVuY2llcyA9IGF3YWl0IHRoaXMuZ2V0QWxsTWlzc2luZ0RlcGVuZGVuY2llcygpO1xuXHRcdGNvbnN0IGxvY2FsRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCgpO1xuXHRcdHJldHVybiBhbGxNaXNzaW5nRGVwZW5kZW5jaWVzLmZpbHRlcihpZCA9PiBsb2NhbEV4dGVuc2lvbnMuZXZlcnkobCA9PiAhYXJlU2FtZUV4dGVuc2lvbnMobC5pZGVudGlmaWVyLCB7IGlkIH0pKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEFsbE1pc3NpbmdEZXBlbmRlbmNpZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uc0lkczogU2V0PHN0cmluZz4gPSB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5yZWR1Y2UoKHJlc3VsdCwgcikgPT4geyByZXN1bHQuYWRkKHIuaWRlbnRpZmllci52YWx1ZS50b0xvd2VyQ2FzZSgpKTsgcmV0dXJuIHJlc3VsdDsgfSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IG1pc3NpbmdEZXBlbmRlbmNpZXM6IFNldDxzdHJpbmc+ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMpIHtcblx0XHRcdGlmIChleHRlbnNpb24uZXh0ZW5zaW9uRGVwZW5kZW5jaWVzKSB7XG5cdFx0XHRcdGV4dGVuc2lvbi5leHRlbnNpb25EZXBlbmRlbmNpZXMuZm9yRWFjaChkZXAgPT4ge1xuXHRcdFx0XHRcdGlmICghcnVubmluZ0V4dGVuc2lvbnNJZHMuaGFzKGRlcC50b0xvd2VyQ2FzZSgpKSkge1xuXHRcdFx0XHRcdFx0bWlzc2luZ0RlcGVuZGVuY2llcy5hZGQoZGVwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gWy4uLm1pc3NpbmdEZXBlbmRlbmNpZXMudmFsdWVzKCldO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsTWlzc2luZ0RlcGVuZGVuY2llcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtaXNzaW5nRGVwZW5kZW5jaWVzID0gYXdhaXQgdGhpcy5nZXRVbmluc3RhbGxlZE1pc3NpbmdEZXBlbmRlbmNpZXMoKTtcblx0XHRpZiAobWlzc2luZ0RlcGVuZGVuY2llcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmdldEV4dGVuc2lvbnMobWlzc2luZ0RlcGVuZGVuY2llcy5tYXAoaWQgPT4gKHsgaWQgfSkpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChleHRlbnNpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKGV4dGVuc2lvbnMubWFwKGV4dGVuc2lvbiA9PiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGwoZXh0ZW5zaW9uKSkpO1xuXHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnZmluaXNoZWQgaW5zdGFsbGluZyBtaXNzaW5nIGRlcHMnLCBcIkZpbmlzaGVkIGluc3RhbGxpbmcgbWlzc2luZyBkZXBlbmRlbmNpZXMuIFBsZWFzZSByZWxvYWQgdGhlIHdpbmRvdyBub3cuXCIpLFxuXHRcdFx0XHRcdGFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdHByaW1hcnk6IFtuZXcgQWN0aW9uKCdyZWFsb2QnLCBsb2NhbGl6ZSgncmVsb2FkJywgXCJSZWxvYWQgV2luZG93XCIpLCAnJywgdHJ1ZSxcblx0XHRcdFx0XHRcdFx0KCkgPT4gdGhpcy5ob3N0U2VydmljZS5yZWxvYWQoKSldXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ25vIG1pc3NpbmcgZGVwcycsIFwiVGhlcmUgYXJlIG5vIG1pc3NpbmcgZGVwZW5kZW5jaWVzIHRvIGluc3RhbGwuXCIpKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQ0FBbUM7QUFFNUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxjQUFjLGNBQWM7QUFDckMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsY0FBYztBQUN2QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUFnQjtBQUVsQixJQUFNLDZCQUFOLGNBQXlDLFdBQTZDO0FBQUEsRUFFNUYsWUFDcUMsa0JBQ1UsNEJBQ1AscUJBQ1IsYUFDOUI7QUFDRCxVQUFNO0FBTDhCO0FBQ1U7QUFDUDtBQUNSO0FBRy9CLHFCQUFpQixnQkFBZ0IsbURBQW1ELE1BQU0sS0FBSywyQkFBMkIsQ0FBQztBQUMzSCxpQkFBYSxlQUFlLE9BQU8sZ0JBQWdCO0FBQUEsTUFDbEQsU0FBUztBQUFBLFFBQ1IsSUFBSTtBQUFBLFFBQ0osVUFBVSxTQUFTLGNBQWMsWUFBWTtBQUFBLFFBQzdDLE9BQU8sU0FBUyw2QkFBNkIsOEJBQThCO0FBQUEsTUFDNUU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLG9DQUF1RDtBQUNwRSxVQUFNLHlCQUF5QixNQUFNLEtBQUssMEJBQTBCO0FBQ3BFLFVBQU0sa0JBQWtCLE1BQU0sS0FBSywyQkFBMkIsV0FBVztBQUN6RSxXQUFPLHVCQUF1QixPQUFPLFFBQU0sZ0JBQWdCLE1BQU0sT0FBSyxDQUFDLGtCQUFrQixFQUFFLFlBQVksRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDaEg7QUFBQSxFQUVBLE1BQWMsNEJBQStDO0FBQzVELFVBQU0sS0FBSyxpQkFBaUIsa0NBQWtDO0FBQzlELFVBQU0sdUJBQW9DLEtBQUssaUJBQWlCLFdBQVcsT0FBTyxDQUFDLFFBQVEsTUFBTTtBQUFFLGFBQU8sSUFBSSxFQUFFLFdBQVcsTUFBTSxZQUFZLENBQUM7QUFBRyxhQUFPO0FBQUEsSUFBUSxHQUFHLG9CQUFJLElBQVksQ0FBQztBQUNwTCxVQUFNLHNCQUFtQyxvQkFBSSxJQUFZO0FBQ3pELGVBQVcsYUFBYSxLQUFLLGlCQUFpQixZQUFZO0FBQ3pELFVBQUksVUFBVSx1QkFBdUI7QUFDcEMsa0JBQVUsc0JBQXNCLFFBQVEsU0FBTztBQUM5QyxjQUFJLENBQUMscUJBQXFCLElBQUksSUFBSSxZQUFZLENBQUMsR0FBRztBQUNqRCxnQ0FBb0IsSUFBSSxHQUFHO0FBQUEsVUFDNUI7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRDtBQUNBLFdBQU8sQ0FBQyxHQUFHLG9CQUFvQixPQUFPLENBQUM7QUFBQSxFQUN4QztBQUFBLEVBRUEsTUFBYyw2QkFBNEM7QUFDekQsVUFBTSxzQkFBc0IsTUFBTSxLQUFLLGtDQUFrQztBQUN6RSxRQUFJLG9CQUFvQixRQUFRO0FBQy9CLFlBQU0sYUFBYSxNQUFNLEtBQUssMkJBQTJCLGNBQWMsb0JBQW9CLElBQUksU0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLGtCQUFrQixJQUFJO0FBQ3RJLFVBQUksV0FBVyxRQUFRO0FBQ3RCLGNBQU0sU0FBUyxRQUFRLFdBQVcsSUFBSSxlQUFhLEtBQUssMkJBQTJCLFFBQVEsU0FBUyxDQUFDLENBQUM7QUFDdEcsYUFBSyxvQkFBb0IsT0FBTztBQUFBLFVBQy9CLFVBQVUsU0FBUztBQUFBLFVBQ25CLFNBQVMsU0FBUyxvQ0FBb0MseUVBQXlFO0FBQUEsVUFDL0gsU0FBUztBQUFBLFlBQ1IsU0FBUyxDQUFDLElBQUk7QUFBQSxjQUFPO0FBQUEsY0FBVSxTQUFTLFVBQVUsZUFBZTtBQUFBLGNBQUc7QUFBQSxjQUFJO0FBQUEsY0FDdkUsTUFBTSxLQUFLLFlBQVksT0FBTztBQUFBLFlBQUMsQ0FBQztBQUFBLFVBQ2xDO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssb0JBQW9CLEtBQUssU0FBUyxtQkFBbUIsK0NBQStDLENBQUM7QUFBQSxJQUMzRztBQUFBLEVBQ0Q7QUFDRDtBQTVEYSw2QkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
