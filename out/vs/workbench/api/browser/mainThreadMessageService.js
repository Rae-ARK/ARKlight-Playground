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
import * as nls from "../../../nls.js";
import { toAction } from "../../../base/common/actions.js";
import { MainContext } from "../common/extHost.protocol.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { IDialogService } from "../../../platform/dialogs/common/dialogs.js";
import { INotificationService, NotificationPriority } from "../../../platform/notification/common/notification.js";
import { Event } from "../../../base/common/event.js";
import { ICommandService } from "../../../platform/commands/common/commands.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
let MainThreadMessageService = class {
  constructor(extHostContext, _notificationService, _commandService, _dialogService, extensionService) {
    this._notificationService = _notificationService;
    this._commandService = _commandService;
    this._dialogService = _dialogService;
    this.extensionsListener = extensionService.onDidChangeExtensions((e) => {
      for (const extension of e.removed) {
        this._notificationService.removeFilter(extension.identifier.value);
      }
    });
  }
  dispose() {
    this.extensionsListener.dispose();
  }
  $showMessage(severity, message, options, commands) {
    if (options.modal) {
      return this._showModalMessage(severity, message, options.detail, commands, options.useCustom);
    } else {
      return this._showMessage(severity, message, commands, options);
    }
  }
  _showMessage(severity, message, commands, options) {
    return new Promise((resolve) => {
      const primaryActions = commands.map((command) => toAction({
        id: `_extension_message_handle_${command.handle}`,
        label: command.title,
        enabled: true,
        run: () => {
          resolve(command.handle);
          return Promise.resolve();
        }
      }));
      let source;
      let sourceIsUrgent = false;
      if (options.source) {
        source = {
          label: options.source.label,
          id: options.source.identifier.value
        };
        sourceIsUrgent = MainThreadMessageService.URGENT_NOTIFICATION_SOURCES.includes(source.id);
      }
      if (!source) {
        source = nls.localize("defaultSource", "Extension");
      }
      const secondaryActions = [];
      if (options.source) {
        secondaryActions.push(toAction({
          id: options.source.identifier.value,
          label: nls.localize("manageExtension", "Manage Extension"),
          run: () => {
            return this._commandService.executeCommand("_extensions.manage", options.source.identifier.value);
          }
        }));
      }
      const messageHandle = this._notificationService.notify({
        severity,
        message,
        actions: { primary: primaryActions, secondary: secondaryActions },
        source,
        priority: sourceIsUrgent ? NotificationPriority.URGENT : NotificationPriority.DEFAULT,
        sticky: sourceIsUrgent
      });
      Event.once(messageHandle.onDidClose)(() => {
        resolve(void 0);
      });
    });
  }
  async _showModalMessage(severity, message, detail, commands, useCustom) {
    const buttons = [];
    let cancelButton = void 0;
    for (const command of commands) {
      const button = {
        label: command.title,
        run: () => command.handle
      };
      if (command.isCloseAffordance) {
        cancelButton = button;
      } else {
        buttons.push(button);
      }
    }
    if (!cancelButton) {
      if (buttons.length > 0) {
        cancelButton = {
          label: nls.localize("cancel", "Cancel"),
          run: () => void 0
        };
      } else {
        cancelButton = {
          label: nls.localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
          run: () => void 0
        };
      }
    }
    const { result } = await this._dialogService.prompt({
      type: severity,
      message,
      detail,
      buttons,
      cancelButton,
      custom: useCustom
    });
    return result;
  }
};
MainThreadMessageService.URGENT_NOTIFICATION_SOURCES = [
  "vscode.github-authentication",
  "vscode.microsoft-authentication"
];
MainThreadMessageService = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadMessageService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IExtensionService)
], MainThreadMessageService);
export {
  MainThreadMessageService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkTWVzc2FnZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlU2hhcGUsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkTWVzc2FnZU9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBleHRIb3N0TmFtZWRDdXN0b21lciwgSUV4dEhvc3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0SG9zdEN1c3RvbWVycy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElOb3RpZmljYXRpb25Tb3VyY2UsIE5vdGlmaWNhdGlvblByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRNZXNzYWdlU2VydmljZSlcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkTWVzc2FnZVNlcnZpY2UgaW1wbGVtZW50cyBNYWluVGhyZWFkTWVzc2FnZVNlcnZpY2VTaGFwZSB7XG5cblx0cHJpdmF0ZSBleHRlbnNpb25zTGlzdGVuZXI6IElEaXNwb3NhYmxlO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVSR0VOVF9OT1RJRklDQVRJT05fU09VUkNFUyA9IFtcblx0XHQndnNjb2RlLmdpdGh1Yi1hdXRoZW50aWNhdGlvbicsXG5cdFx0J3ZzY29kZS5taWNyb3NvZnQtYXV0aGVudGljYXRpb24nXG5cdF07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5leHRlbnNpb25zTGlzdGVuZXIgPSBleHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucyhlID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnJlbW92ZUZpbHRlcihleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZXh0ZW5zaW9uc0xpc3RlbmVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdCRzaG93TWVzc2FnZShzZXZlcml0eTogU2V2ZXJpdHksIG1lc3NhZ2U6IHN0cmluZywgb3B0aW9uczogTWFpblRocmVhZE1lc3NhZ2VPcHRpb25zLCBjb21tYW5kczogeyB0aXRsZTogc3RyaW5nOyBpc0Nsb3NlQWZmb3JkYW5jZTogYm9vbGVhbjsgaGFuZGxlOiBudW1iZXIgfVtdKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAob3B0aW9ucy5tb2RhbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3dNb2RhbE1lc3NhZ2Uoc2V2ZXJpdHksIG1lc3NhZ2UsIG9wdGlvbnMuZGV0YWlsLCBjb21tYW5kcywgb3B0aW9ucy51c2VDdXN0b20pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd01lc3NhZ2Uoc2V2ZXJpdHksIG1lc3NhZ2UsIGNvbW1hbmRzLCBvcHRpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93TWVzc2FnZShzZXZlcml0eTogU2V2ZXJpdHksIG1lc3NhZ2U6IHN0cmluZywgY29tbWFuZHM6IHsgdGl0bGU6IHN0cmluZzsgaXNDbG9zZUFmZm9yZGFuY2U6IGJvb2xlYW47IGhhbmRsZTogbnVtYmVyIH1bXSwgb3B0aW9uczogTWFpblRocmVhZE1lc3NhZ2VPcHRpb25zKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXG5cdFx0XHRjb25zdCBwcmltYXJ5QWN0aW9uczogSUFjdGlvbltdID0gY29tbWFuZHMubWFwKGNvbW1hbmQgPT4gdG9BY3Rpb24oe1xuXHRcdFx0XHRpZDogYF9leHRlbnNpb25fbWVzc2FnZV9oYW5kbGVfJHtjb21tYW5kLmhhbmRsZX1gLFxuXHRcdFx0XHRsYWJlbDogY29tbWFuZC50aXRsZSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZShjb21tYW5kLmhhbmRsZSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGxldCBzb3VyY2U6IHN0cmluZyB8IElOb3RpZmljYXRpb25Tb3VyY2UgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgc291cmNlSXNVcmdlbnQgPSBmYWxzZTtcblx0XHRcdGlmIChvcHRpb25zLnNvdXJjZSkge1xuXHRcdFx0XHRzb3VyY2UgPSB7XG5cdFx0XHRcdFx0bGFiZWw6IG9wdGlvbnMuc291cmNlLmxhYmVsLFxuXHRcdFx0XHRcdGlkOiBvcHRpb25zLnNvdXJjZS5pZGVudGlmaWVyLnZhbHVlXG5cdFx0XHRcdH07XG5cdFx0XHRcdHNvdXJjZUlzVXJnZW50ID0gTWFpblRocmVhZE1lc3NhZ2VTZXJ2aWNlLlVSR0VOVF9OT1RJRklDQVRJT05fU09VUkNFUy5pbmNsdWRlcyhzb3VyY2UuaWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0XHRzb3VyY2UgPSBubHMubG9jYWxpemUoJ2RlZmF1bHRTb3VyY2UnLCBcIkV4dGVuc2lvblwiKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0XHRpZiAob3B0aW9ucy5zb3VyY2UpIHtcblx0XHRcdFx0c2Vjb25kYXJ5QWN0aW9ucy5wdXNoKHRvQWN0aW9uKHtcblx0XHRcdFx0XHRpZDogb3B0aW9ucy5zb3VyY2UuaWRlbnRpZmllci52YWx1ZSxcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdtYW5hZ2VFeHRlbnNpb24nLCBcIk1hbmFnZSBFeHRlbnNpb25cIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ19leHRlbnNpb25zLm1hbmFnZScsIG9wdGlvbnMuc291cmNlIS5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWVzc2FnZUhhbmRsZSA9IHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHksXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGFjdGlvbnM6IHsgcHJpbWFyeTogcHJpbWFyeUFjdGlvbnMsIHNlY29uZGFyeTogc2Vjb25kYXJ5QWN0aW9ucyB9LFxuXHRcdFx0XHRzb3VyY2UsXG5cdFx0XHRcdHByaW9yaXR5OiBzb3VyY2VJc1VyZ2VudCA/IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCA6IE5vdGlmaWNhdGlvblByaW9yaXR5LkRFRkFVTFQsXG5cdFx0XHRcdHN0aWNreTogc291cmNlSXNVcmdlbnRcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBpZiBwcm9taXNlIGhhcyBub3QgYmVlbiByZXNvbHZlZCB5ZXQsIG5vdyBpcyB0aGUgdGltZSB0byBlbnN1cmUgYSByZXR1cm4gdmFsdWVcblx0XHRcdC8vIG90aGVyd2lzZSBpZiBhbHJlYWR5IHJlc29sdmVkIGl0IG1lYW5zIHRoZSB1c2VyIGNsaWNrZWQgb25lIG9mIHRoZSBidXR0b25zXG5cdFx0XHRFdmVudC5vbmNlKG1lc3NhZ2VIYW5kbGUub25EaWRDbG9zZSkoKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Nob3dNb2RhbE1lc3NhZ2Uoc2V2ZXJpdHk6IFNldmVyaXR5LCBtZXNzYWdlOiBzdHJpbmcsIGRldGFpbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBjb21tYW5kczogeyB0aXRsZTogc3RyaW5nOyBpc0Nsb3NlQWZmb3JkYW5jZTogYm9vbGVhbjsgaGFuZGxlOiBudW1iZXIgfVtdLCB1c2VDdXN0b20/OiBib29sZWFuKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0QnV0dG9uPG51bWJlcj5bXSA9IFtdO1xuXHRcdGxldCBjYW5jZWxCdXR0b246IElQcm9tcHRCdXR0b248bnVtYmVyIHwgdW5kZWZpbmVkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGZvciAoY29uc3QgY29tbWFuZCBvZiBjb21tYW5kcykge1xuXHRcdFx0Y29uc3QgYnV0dG9uOiBJUHJvbXB0QnV0dG9uPG51bWJlcj4gPSB7XG5cdFx0XHRcdGxhYmVsOiBjb21tYW5kLnRpdGxlLFxuXHRcdFx0XHRydW46ICgpID0+IGNvbW1hbmQuaGFuZGxlXG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoY29tbWFuZC5pc0Nsb3NlQWZmb3JkYW5jZSkge1xuXHRcdFx0XHRjYW5jZWxCdXR0b24gPSBidXR0b247XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRidXR0b25zLnB1c2goYnV0dG9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWNhbmNlbEJ1dHRvbikge1xuXHRcdFx0aWYgKGJ1dHRvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjYW5jZWxCdXR0b24gPSB7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB1bmRlZmluZWRcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNhbmNlbEJ1dHRvbiA9IHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKHsga2V5OiAnb2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPS1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHVuZGVmaW5lZFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHR0eXBlOiBzZXZlcml0eSxcblx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRkZXRhaWwsXG5cdFx0XHRidXR0b25zLFxuXHRcdFx0Y2FuY2VsQnV0dG9uLFxuXHRcdFx0Y3VzdG9tOiB1c2VDdXN0b21cblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQWtCLGdCQUFnQjtBQUNsQyxTQUF3QyxtQkFBNkM7QUFDckYsU0FBUyw0QkFBNkM7QUFDdEQsU0FB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
