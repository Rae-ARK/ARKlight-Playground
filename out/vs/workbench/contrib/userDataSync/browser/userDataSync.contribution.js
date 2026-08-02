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
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { UserDataSyncWorkbenchContribution } from "./userDataSync.js";
import { IUserDataAutoSyncService, UserDataSyncErrorCode } from "../../../../platform/userDataSync/common/userDataSync.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { isWeb } from "../../../../base/common/platform.js";
import { UserDataSyncTrigger } from "./userDataSyncTrigger.js";
import { toAction } from "../../../../base/common/actions.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { SHOW_SYNC_LOG_COMMAND_ID } from "../../../services/userDataSync/common/userDataSync.js";
let UserDataSyncReportIssueContribution = class extends Disposable {
  constructor(userDataAutoSyncService, notificationService, productService, commandService, hostService) {
    super();
    this.notificationService = notificationService;
    this.productService = productService;
    this.commandService = commandService;
    this.hostService = hostService;
    this._register(userDataAutoSyncService.onError((error) => this.onAutoSyncError(error)));
  }
  onAutoSyncError(error) {
    switch (error.code) {
      case UserDataSyncErrorCode.LocalTooManyRequests: {
        const message = isWeb ? localize({ key: "local too many requests - reload", comment: ["Settings Sync is the name of the feature"] }, "Settings sync is suspended temporarily because the current device is making too many requests. Please reload {0} to resume.", this.productService.nameLong) : localize({ key: "local too many requests - restart", comment: ["Settings Sync is the name of the feature"] }, "Settings sync is suspended temporarily because the current device is making too many requests. Please restart {0} to resume.", this.productService.nameLong);
        this.notificationService.notify({
          severity: Severity.Error,
          message,
          actions: {
            primary: [
              toAction({
                id: "Show Sync Logs",
                label: localize("show sync logs", "Show Log"),
                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
              }),
              toAction({
                id: "Restart",
                label: isWeb ? localize("reload", "Reload") : localize("restart", "Restart"),
                run: () => this.hostService.restart()
              })
            ]
          }
        });
        return;
      }
      case UserDataSyncErrorCode.TooManyRequests: {
        const operationId = error.operationId ? localize("operationId", "Operation Id: {0}", error.operationId) : void 0;
        const message = localize({ key: "server too many requests", comment: ["Settings Sync is the name of the feature"] }, "Settings sync is disabled because the current device is making too many requests. Please wait for 10 minutes and turn on sync.");
        this.notificationService.notify({
          severity: Severity.Error,
          message: operationId ? `${message} ${operationId}` : message,
          source: error.operationId ? localize("settings sync", "Settings Sync. Operation Id: {0}", error.operationId) : void 0,
          actions: {
            primary: [
              toAction({
                id: "Show Sync Logs",
                label: localize("show sync logs", "Show Log"),
                run: () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)
              })
            ]
          }
        });
        return;
      }
    }
  }
};
UserDataSyncReportIssueContribution = __decorateClass([
  __decorateParam(0, IUserDataAutoSyncService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, IProductService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IHostService)
], UserDataSyncReportIssueContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncWorkbenchContribution, LifecyclePhase.Restored);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncTrigger, LifecyclePhase.Eventually);
workbenchRegistry.registerWorkbenchContribution(UserDataSyncReportIssueContribution, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VzZXJEYXRhU3luYy9icm93c2VyL3VzZXJEYXRhU3luYy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY1dvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YUF1dG9TeW5jU2VydmljZSwgVXNlckRhdGFTeW5jRXJyb3IsIFVzZXJEYXRhU3luY0Vycm9yQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVc2VyRGF0YVN5bmNUcmlnZ2VyIH0gZnJvbSAnLi91c2VyRGF0YVN5bmNUcmlnZ2VyLmpzJztcbmltcG9ydCB7IHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgU0hPV19TWU5DX0xPR19DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuXG5jbGFzcyBVc2VyRGF0YVN5bmNSZXBvcnRJc3N1ZUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlIHVzZXJEYXRhQXV0b1N5bmNTZXJ2aWNlOiBJVXNlckRhdGFBdXRvU3luY1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFBdXRvU3luY1NlcnZpY2Uub25FcnJvcihlcnJvciA9PiB0aGlzLm9uQXV0b1N5bmNFcnJvcihlcnJvcikpKTtcblx0fVxuXG5cdHByaXZhdGUgb25BdXRvU3luY0Vycm9yKGVycm9yOiBVc2VyRGF0YVN5bmNFcnJvcik6IHZvaWQge1xuXHRcdHN3aXRjaCAoZXJyb3IuY29kZSkge1xuXHRcdFx0Y2FzZSBVc2VyRGF0YVN5bmNFcnJvckNvZGUuTG9jYWxUb29NYW55UmVxdWVzdHM6IHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGlzV2ViID8gbG9jYWxpemUoeyBrZXk6ICdsb2NhbCB0b28gbWFueSByZXF1ZXN0cyAtIHJlbG9hZCcsIGNvbW1lbnQ6IFsnU2V0dGluZ3MgU3luYyBpcyB0aGUgbmFtZSBvZiB0aGUgZmVhdHVyZSddIH0sIFwiU2V0dGluZ3Mgc3luYyBpcyBzdXNwZW5kZWQgdGVtcG9yYXJpbHkgYmVjYXVzZSB0aGUgY3VycmVudCBkZXZpY2UgaXMgbWFraW5nIHRvbyBtYW55IHJlcXVlc3RzLiBQbGVhc2UgcmVsb2FkIHswfSB0byByZXN1bWUuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSh7IGtleTogJ2xvY2FsIHRvbyBtYW55IHJlcXVlc3RzIC0gcmVzdGFydCcsIGNvbW1lbnQ6IFsnU2V0dGluZ3MgU3luYyBpcyB0aGUgbmFtZSBvZiB0aGUgZmVhdHVyZSddIH0sIFwiU2V0dGluZ3Mgc3luYyBpcyBzdXNwZW5kZWQgdGVtcG9yYXJpbHkgYmVjYXVzZSB0aGUgY3VycmVudCBkZXZpY2UgaXMgbWFraW5nIHRvbyBtYW55IHJlcXVlc3RzLiBQbGVhc2UgcmVzdGFydCB7MH0gdG8gcmVzdW1lLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdFx0YWN0aW9uczoge1xuXHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHR0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6ICdTaG93IFN5bmMgTG9ncycsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93IHN5bmMgbG9ncycsIFwiU2hvdyBMb2dcIiksXG5cdFx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNIT1dfU1lOQ19MT0dfQ09NTUFORF9JRClcblx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogJ1Jlc3RhcnQnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBpc1dlYiA/IGxvY2FsaXplKCdyZWxvYWQnLCBcIlJlbG9hZFwiKSA6IGxvY2FsaXplKCdyZXN0YXJ0JywgXCJSZXN0YXJ0XCIpLFxuXHRcdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5ob3N0U2VydmljZS5yZXN0YXJ0KClcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29NYW55UmVxdWVzdHM6IHtcblx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uSWQgPSBlcnJvci5vcGVyYXRpb25JZCA/IGxvY2FsaXplKCdvcGVyYXRpb25JZCcsIFwiT3BlcmF0aW9uIElkOiB7MH1cIiwgZXJyb3Iub3BlcmF0aW9uSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoeyBrZXk6ICdzZXJ2ZXIgdG9vIG1hbnkgcmVxdWVzdHMnLCBjb21tZW50OiBbJ1NldHRpbmdzIFN5bmMgaXMgdGhlIG5hbWUgb2YgdGhlIGZlYXR1cmUnXSB9LCBcIlNldHRpbmdzIHN5bmMgaXMgZGlzYWJsZWQgYmVjYXVzZSB0aGUgY3VycmVudCBkZXZpY2UgaXMgbWFraW5nIHRvbyBtYW55IHJlcXVlc3RzLiBQbGVhc2Ugd2FpdCBmb3IgMTAgbWludXRlcyBhbmQgdHVybiBvbiBzeW5jLlwiKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IG9wZXJhdGlvbklkID8gYCR7bWVzc2FnZX0gJHtvcGVyYXRpb25JZH1gIDogbWVzc2FnZSxcblx0XHRcdFx0XHRzb3VyY2U6IGVycm9yLm9wZXJhdGlvbklkID8gbG9jYWxpemUoJ3NldHRpbmdzIHN5bmMnLCBcIlNldHRpbmdzIFN5bmMuIE9wZXJhdGlvbiBJZDogezB9XCIsIGVycm9yLm9wZXJhdGlvbklkKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRwcmltYXJ5OiBbXG5cdFx0XHRcdFx0XHRcdHRvQWN0aW9uKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogJ1Nob3cgU3luYyBMb2dzJyxcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nob3cgc3luYyBsb2dzJywgXCJTaG93IExvZ1wiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoU0hPV19TWU5DX0xPR19DT01NQU5EX0lEKVxuXHRcdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihVc2VyRGF0YVN5bmNXb3JrYmVuY2hDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFVzZXJEYXRhU3luY1RyaWdnZXIsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oVXNlckRhdGFTeW5jUmVwb3J0SXNzdWVDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFs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
