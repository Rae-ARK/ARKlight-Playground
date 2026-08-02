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
import * as nls from "../../../../nls.js";
import * as resources from "../../../../base/common/resources.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ITaskService } from "../common/taskService.js";
import { RunOnOptions, TaskRunSource, TaskSourceKind, TASKS_CATEGORY } from "../common/tasks.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Action2 } from "../../../../platform/actions/common/actions.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { Event } from "../../../../base/common/event.js";
import { ILogService } from "../../../../platform/log/common/log.js";
const HAS_PROMPTED_FOR_AUTOMATIC_TASKS = "task.hasPromptedForAutomaticTasks.v2";
const ALLOW_AUTOMATIC_TASKS = "task.allowAutomaticTasks";
let RunAutomaticTasks = class extends Disposable {
  constructor(_taskService, _configurationService, _workspaceTrustManagementService, _logService, _storageService, _notificationService, _openerService) {
    super();
    this._taskService = _taskService;
    this._configurationService = _configurationService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._logService = _logService;
    this._storageService = _storageService;
    this._notificationService = _notificationService;
    this._openerService = _openerService;
    this._hasRunTasks = false;
    if (this._taskService.isReconnected) {
      this._tryRunTasks();
    } else {
      this._register(Event.once(this._taskService.onDidReconnectToTasks)(async () => await this._tryRunTasks()));
    }
    this._register(this._workspaceTrustManagementService.onDidChangeTrust(async () => await this._tryRunTasks()));
  }
  async _tryRunTasks() {
    if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      return;
    }
    const { value, userValue } = this._configurationService.inspect(ALLOW_AUTOMATIC_TASKS);
    if (this._hasRunTasks || value === "off" && userValue !== void 0) {
      return;
    }
    this._hasRunTasks = true;
    this._logService.trace("RunAutomaticTasks: Trying to run tasks.");
    if (!this._taskService.hasTaskSystemInfo) {
      this._logService.trace("RunAutomaticTasks: Awaiting task system info.");
      await Event.toPromise(Event.once(this._taskService.onDidChangeTaskSystemInfo));
    }
    let workspaceTasks = await this._taskService.getWorkspaceTasks(TaskRunSource.FolderOpen);
    this._logService.trace(`RunAutomaticTasks: Found ${workspaceTasks.size} automatic tasks`);
    let autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
    this._logService.trace(`RunAutomaticTasks: taskNames=${JSON.stringify(autoTasks.taskNames)}`);
    if (autoTasks.taskNames.length === 0) {
      const updatedWithinTimeout = await Promise.race([
        new Promise((resolve) => {
          Event.toPromise(Event.once(this._taskService.onDidChangeTaskConfig)).then(() => resolve(true));
        }),
        new Promise((resolve) => {
          const timer = setTimeout(() => {
            clearTimeout(timer);
            resolve(false);
          }, 1e4);
        })
      ]);
      if (!updatedWithinTimeout) {
        this._logService.trace(`RunAutomaticTasks: waited some extra time, but no update of tasks configuration`);
        return;
      }
      workspaceTasks = await this._taskService.getWorkspaceTasks(TaskRunSource.FolderOpen);
      autoTasks = this._findAutoTasks(this._taskService, workspaceTasks);
      this._logService.trace(`RunAutomaticTasks: updated taskNames=${JSON.stringify(autoTasks.taskNames)}`);
    }
    this._runWithPermission(this._taskService, this._configurationService, this._storageService, this._notificationService, this._openerService, autoTasks.tasks, autoTasks.taskNames, autoTasks.locations);
  }
  _runTasks(taskService, tasks) {
    tasks.forEach((task) => {
      if (task instanceof Promise) {
        task.then((promiseResult) => {
          if (promiseResult) {
            taskService.run(promiseResult);
          }
        });
      } else {
        taskService.run(task);
      }
    });
  }
  _getTaskSource(source) {
    const taskKind = TaskSourceKind.toConfigurationTarget(source.kind);
    switch (taskKind) {
      case ConfigurationTarget.WORKSPACE_FOLDER: {
        return resources.joinPath(source.config.workspaceFolder.uri, source.config.file);
      }
      case ConfigurationTarget.WORKSPACE: {
        return source.config.workspace?.configuration ?? void 0;
      }
    }
    return void 0;
  }
  _findAutoTasks(taskService, workspaceTaskResult) {
    const tasks = new Array();
    const taskNames = new Array();
    const locations = /* @__PURE__ */ new Map();
    if (workspaceTaskResult) {
      workspaceTaskResult.forEach((resultElement) => {
        if (resultElement.set) {
          resultElement.set.tasks.forEach((task) => {
            if (task.runOptions.runOn === RunOnOptions.folderOpen) {
              tasks.push(task);
              taskNames.push(task._label);
              const location = this._getTaskSource(task._source);
              if (location) {
                locations.set(location.fsPath, location);
              }
            }
          });
        }
        if (resultElement.configurations) {
          for (const configuredTask of Object.values(resultElement.configurations.byIdentifier)) {
            if (configuredTask.runOptions.runOn === RunOnOptions.folderOpen) {
              tasks.push(new Promise((resolve) => {
                taskService.getTask(resultElement.workspaceFolder, configuredTask._id, true).then((task) => resolve(task));
              }));
              if (configuredTask._label) {
                taskNames.push(configuredTask._label);
              } else {
                taskNames.push(configuredTask.configures.task);
              }
              const location = this._getTaskSource(configuredTask._source);
              if (location) {
                locations.set(location.fsPath, location);
              }
            }
          }
        }
      });
    }
    return { tasks, taskNames, locations };
  }
  async _runWithPermission(taskService, configurationService, storageService, notificationService, openerService, tasks, taskNames, locations) {
    if (taskNames.length === 0) {
      return;
    }
    if (configurationService.getValue(ALLOW_AUTOMATIC_TASKS) === "on") {
      this._runTasks(taskService, tasks);
      return;
    }
    const hasShownPromptForAutomaticTasks = storageService.getBoolean(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, StorageScope.WORKSPACE, false);
    if (hasShownPromptForAutomaticTasks) {
      return;
    }
    const allow = await this._showPrompt(notificationService, storageService, openerService, configurationService, taskNames, locations);
    if (allow) {
      this._runTasks(taskService, tasks);
    }
  }
  _showPrompt(notificationService, storageService, openerService, configurationService, taskNames, locations) {
    return new Promise((resolve) => {
      notificationService.prompt(
        Severity.Info,
        nls.localize(
          "tasks.run.allowAutomatic",
          "This workspace has tasks ({0}) defined ({1}) that can launch processes automatically when you open this workspace. Do you want to allow automatic tasks to run in all trusted workspaces?",
          taskNames.join(", "),
          Array.from(locations.keys()).join(", ")
        ),
        [
          {
            label: nls.localize("allow", "Allow"),
            run: () => {
              resolve(true);
              configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, "on", ConfigurationTarget.USER);
            }
          },
          {
            label: nls.localize("disallow", "Disallow"),
            run: () => {
              resolve(false);
              configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, "off", ConfigurationTarget.USER);
            }
          },
          {
            label: locations.size === 1 ? nls.localize("openTask", "Open File") : nls.localize("openTasks", "Open Files"),
            run: async () => {
              for (const location of locations) {
                await openerService.open(location[1]);
              }
              resolve(false);
            }
          }
        ],
        { onCancel: () => resolve(false) }
      );
      storageService.store(HAS_PROMPTED_FOR_AUTOMATIC_TASKS, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    });
  }
};
RunAutomaticTasks = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceTrustManagementService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IOpenerService)
], RunAutomaticTasks);
const _ManageAutomaticTaskRunning = class _ManageAutomaticTaskRunning extends Action2 {
  constructor() {
    super({
      id: _ManageAutomaticTaskRunning.ID,
      title: _ManageAutomaticTaskRunning.LABEL,
      category: TASKS_CATEGORY
    });
  }
  async run(accessor) {
    const quickInputService = accessor.get(IQuickInputService);
    const configurationService = accessor.get(IConfigurationService);
    const allowItem = { label: nls.localize("workbench.action.tasks.allowAutomaticTasks", "Allow Automatic Tasks") };
    const disallowItem = { label: nls.localize("workbench.action.tasks.disallowAutomaticTasks", "Disallow Automatic Tasks") };
    const value = await quickInputService.pick([allowItem, disallowItem], { canPickMany: false });
    if (!value) {
      return;
    }
    configurationService.updateValue(ALLOW_AUTOMATIC_TASKS, value === allowItem ? "on" : "off", ConfigurationTarget.USER);
  }
};
_ManageAutomaticTaskRunning.ID = "workbench.action.tasks.manageAutomaticRunning";
_ManageAutomaticTaskRunning.LABEL = nls.localize("workbench.action.tasks.manageAutomaticRunning", "Manage Automatic Tasks");
let ManageAutomaticTaskRunning = _ManageAutomaticTaskRunning;
export {
  ManageAutomaticTaskRunning,
  RunAutomaticTasks
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2Jyb3dzZXIvcnVuQXV0b21hdGljVGFza3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVRhc2tTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdCB9IGZyb20gJy4uL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSdW5Pbk9wdGlvbnMsIFRhc2ssIFRhc2tSdW5Tb3VyY2UsIFRhc2tTb3VyY2UsIFRhc2tTb3VyY2VLaW5kLCBUQVNLU19DQVRFR09SWSwgV29ya3NwYWNlRmlsZVRhc2tTb3VyY2UsIElXb3Jrc3BhY2VUYXNrU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5jb25zdCBIQVNfUFJPTVBURURfRk9SX0FVVE9NQVRJQ19UQVNLUyA9ICd0YXNrLmhhc1Byb21wdGVkRm9yQXV0b21hdGljVGFza3MudjInO1xuY29uc3QgQUxMT1dfQVVUT01BVElDX1RBU0tTID0gJ3Rhc2suYWxsb3dBdXRvbWF0aWNUYXNrcyc7XG5cbmV4cG9ydCBjbGFzcyBSdW5BdXRvbWF0aWNUYXNrcyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSBfaGFzUnVuVGFza3M6IGJvb2xlYW4gPSBmYWxzZTtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElUYXNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHRpZiAodGhpcy5fdGFza1NlcnZpY2UuaXNSZWNvbm5lY3RlZCkge1xuXHRcdFx0dGhpcy5fdHJ5UnVuVGFza3MoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZSh0aGlzLl90YXNrU2VydmljZS5vbkRpZFJlY29ubmVjdFRvVGFza3MpKGFzeW5jICgpID0+IGF3YWl0IHRoaXMuX3RyeVJ1blRhc2tzKCkpKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KGFzeW5jICgpID0+IGF3YWl0IHRoaXMuX3RyeVJ1blRhc2tzKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3RyeVJ1blRhc2tzKCkge1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB7IHZhbHVlLCB1c2VyVmFsdWUgfSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPihBTExPV19BVVRPTUFUSUNfVEFTS1MpO1xuXHRcdC8vIElmIHVzZXIgZXhwbGljaXRseSBzZXQgaXQgdG8gJ29mZicsIGRvbid0IHJ1biBvciBwcm9tcHRcblx0XHRpZiAodGhpcy5faGFzUnVuVGFza3MgfHwgKHZhbHVlID09PSAnb2ZmJyAmJiB1c2VyVmFsdWUgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGFzUnVuVGFza3MgPSB0cnVlO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1J1bkF1dG9tYXRpY1Rhc2tzOiBUcnlpbmcgdG8gcnVuIHRhc2tzLicpO1xuXHRcdC8vIFdhaXQgdW50aWwgd2UgaGF2ZSB0YXNrIHN5c3RlbSBpbmZvICh0aGUgZXh0ZW5zaW9uIGhvc3QgYW5kIHdvcmtzcGFjZSBmb2xkZXJzIGFyZSBhdmFpbGFibGUpLlxuXHRcdGlmICghdGhpcy5fdGFza1NlcnZpY2UuaGFzVGFza1N5c3RlbUluZm8pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1J1bkF1dG9tYXRpY1Rhc2tzOiBBd2FpdGluZyB0YXNrIHN5c3RlbSBpbmZvLicpO1xuXHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKEV2ZW50Lm9uY2UodGhpcy5fdGFza1NlcnZpY2Uub25EaWRDaGFuZ2VUYXNrU3lzdGVtSW5mbykpO1xuXHRcdH1cblx0XHRsZXQgd29ya3NwYWNlVGFza3MgPSBhd2FpdCB0aGlzLl90YXNrU2VydmljZS5nZXRXb3Jrc3BhY2VUYXNrcyhUYXNrUnVuU291cmNlLkZvbGRlck9wZW4pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFJ1bkF1dG9tYXRpY1Rhc2tzOiBGb3VuZCAke3dvcmtzcGFjZVRhc2tzLnNpemV9IGF1dG9tYXRpYyB0YXNrc2ApO1xuXG5cdFx0bGV0IGF1dG9UYXNrcyA9IHRoaXMuX2ZpbmRBdXRvVGFza3ModGhpcy5fdGFza1NlcnZpY2UsIHdvcmtzcGFjZVRhc2tzKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBSdW5BdXRvbWF0aWNUYXNrczogdGFza05hbWVzPSR7SlNPTi5zdHJpbmdpZnkoYXV0b1Rhc2tzLnRhc2tOYW1lcyl9YCk7XG5cblx0XHQvLyBBcyBzZWVuIGluIHNvbWUgY2FzZXMgd2l0aCB0aGUgUmVtb3RlIFNTSCBleHRlbnNpb24sIHRoZSB0YXNrcyBjb25maWd1cmF0aW9uIGlzIGxvYWRlZCBhZnRlciB3ZSBoYXZlIGNvbWVcblx0XHQvLyB0byB0aGlzIHBvaW50LiBMZXQncyBnaXZlIGl0IHNvbWUgZXh0cmEgdGltZS5cblx0XHRpZiAoYXV0b1Rhc2tzLnRhc2tOYW1lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdGNvbnN0IHVwZGF0ZWRXaXRoaW5UaW1lb3V0ID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0bmV3IFByb21pc2U8Ym9vbGVhbj4oKHJlc29sdmUpID0+IHtcblx0XHRcdFx0XHRFdmVudC50b1Byb21pc2UoRXZlbnQub25jZSh0aGlzLl90YXNrU2VydmljZS5vbkRpZENoYW5nZVRhc2tDb25maWcpKS50aGVuKCgpID0+IHJlc29sdmUodHJ1ZSkpO1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0bmV3IFByb21pc2U8Ym9vbGVhbj4oKHJlc29sdmUpID0+IHtcblx0XHRcdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4geyBjbGVhclRpbWVvdXQodGltZXIpOyByZXNvbHZlKGZhbHNlKTsgfSwgMTAwMDApO1xuXHRcdFx0XHR9KV0pO1xuXG5cdFx0XHRpZiAoIXVwZGF0ZWRXaXRoaW5UaW1lb3V0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFJ1bkF1dG9tYXRpY1Rhc2tzOiB3YWl0ZWQgc29tZSBleHRyYSB0aW1lLCBidXQgbm8gdXBkYXRlIG9mIHRhc2tzIGNvbmZpZ3VyYXRpb25gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR3b3Jrc3BhY2VUYXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLmdldFdvcmtzcGFjZVRhc2tzKFRhc2tSdW5Tb3VyY2UuRm9sZGVyT3Blbik7XG5cdFx0XHRhdXRvVGFza3MgPSB0aGlzLl9maW5kQXV0b1Rhc2tzKHRoaXMuX3Rhc2tTZXJ2aWNlLCB3b3Jrc3BhY2VUYXNrcyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBSdW5BdXRvbWF0aWNUYXNrczogdXBkYXRlZCB0YXNrTmFtZXM9JHtKU09OLnN0cmluZ2lmeShhdXRvVGFza3MudGFza05hbWVzKX1gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ydW5XaXRoUGVybWlzc2lvbih0aGlzLl90YXNrU2VydmljZSwgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLCB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLl9vcGVuZXJTZXJ2aWNlLCBhdXRvVGFza3MudGFza3MsIGF1dG9UYXNrcy50YXNrTmFtZXMsIGF1dG9UYXNrcy5sb2NhdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcnVuVGFza3ModGFza1NlcnZpY2U6IElUYXNrU2VydmljZSwgdGFza3M6IEFycmF5PFRhc2sgfCBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+Pikge1xuXHRcdHRhc2tzLmZvckVhY2godGFzayA9PiB7XG5cdFx0XHRpZiAodGFzayBpbnN0YW5jZW9mIFByb21pc2UpIHtcblx0XHRcdFx0dGFzay50aGVuKHByb21pc2VSZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGlmIChwcm9taXNlUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0YXNrU2VydmljZS5ydW4ocHJvbWlzZVJlc3VsdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRhc2tTZXJ2aWNlLnJ1bih0YXNrKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRhc2tTb3VyY2Uoc291cmNlOiBUYXNrU291cmNlKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YXNrS2luZCA9IFRhc2tTb3VyY2VLaW5kLnRvQ29uZmlndXJhdGlvblRhcmdldChzb3VyY2Uua2luZCk7XG5cdFx0c3dpdGNoICh0YXNrS2luZCkge1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6IHtcblx0XHRcdFx0cmV0dXJuIHJlc291cmNlcy5qb2luUGF0aCgoPElXb3Jrc3BhY2VUYXNrU291cmNlPnNvdXJjZSkuY29uZmlnLndvcmtzcGFjZUZvbGRlciEudXJpLCAoPElXb3Jrc3BhY2VUYXNrU291cmNlPnNvdXJjZSkuY29uZmlnLmZpbGUpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRToge1xuXHRcdFx0XHRyZXR1cm4gKDxXb3Jrc3BhY2VGaWxlVGFza1NvdXJjZT5zb3VyY2UpLmNvbmZpZy53b3Jrc3BhY2U/LmNvbmZpZ3VyYXRpb24gPz8gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEF1dG9UYXNrcyh0YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlLCB3b3Jrc3BhY2VUYXNrUmVzdWx0OiBNYXA8c3RyaW5nLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdD4pOiB7IHRhc2tzOiBBcnJheTxUYXNrIHwgUHJvbWlzZTxUYXNrIHwgdW5kZWZpbmVkPj47IHRhc2tOYW1lczogQXJyYXk8c3RyaW5nPjsgbG9jYXRpb25zOiBNYXA8c3RyaW5nLCBVUkk+IH0ge1xuXHRcdGNvbnN0IHRhc2tzID0gbmV3IEFycmF5PFRhc2sgfCBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+PigpO1xuXHRcdGNvbnN0IHRhc2tOYW1lcyA9IG5ldyBBcnJheTxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgbG9jYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIFVSST4oKTtcblxuXHRcdGlmICh3b3Jrc3BhY2VUYXNrUmVzdWx0KSB7XG5cdFx0XHR3b3Jrc3BhY2VUYXNrUmVzdWx0LmZvckVhY2gocmVzdWx0RWxlbWVudCA9PiB7XG5cdFx0XHRcdGlmIChyZXN1bHRFbGVtZW50LnNldCkge1xuXHRcdFx0XHRcdHJlc3VsdEVsZW1lbnQuc2V0LnRhc2tzLmZvckVhY2godGFzayA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGFzay5ydW5PcHRpb25zLnJ1bk9uID09PSBSdW5Pbk9wdGlvbnMuZm9sZGVyT3Blbikge1xuXHRcdFx0XHRcdFx0XHR0YXNrcy5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdFx0XHR0YXNrTmFtZXMucHVzaCh0YXNrLl9sYWJlbCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5fZ2V0VGFza1NvdXJjZSh0YXNrLl9zb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAobG9jYXRpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRsb2NhdGlvbnMuc2V0KGxvY2F0aW9uLmZzUGF0aCwgbG9jYXRpb24pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlc3VsdEVsZW1lbnQuY29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNvbmZpZ3VyZWRUYXNrIG9mIE9iamVjdC52YWx1ZXMocmVzdWx0RWxlbWVudC5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0XHRpZiAoY29uZmlndXJlZFRhc2sucnVuT3B0aW9ucy5ydW5PbiA9PT0gUnVuT25PcHRpb25zLmZvbGRlck9wZW4pIHtcblx0XHRcdFx0XHRcdFx0dGFza3MucHVzaChuZXcgUHJvbWlzZTxUYXNrIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0YXNrU2VydmljZS5nZXRUYXNrKHJlc3VsdEVsZW1lbnQud29ya3NwYWNlRm9sZGVyLCBjb25maWd1cmVkVGFzay5faWQsIHRydWUpLnRoZW4odGFzayA9PiByZXNvbHZlKHRhc2spKTtcblx0XHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY29uZmlndXJlZFRhc2suX2xhYmVsKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGFza05hbWVzLnB1c2goY29uZmlndXJlZFRhc2suX2xhYmVsKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHR0YXNrTmFtZXMucHVzaChjb25maWd1cmVkVGFzay5jb25maWd1cmVzLnRhc2sgYXMgc3RyaW5nKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuX2dldFRhc2tTb3VyY2UoY29uZmlndXJlZFRhc2suX3NvdXJjZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChsb2NhdGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdGxvY2F0aW9ucy5zZXQobG9jYXRpb24uZnNQYXRoLCBsb2NhdGlvbik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4geyB0YXNrcywgdGFza05hbWVzLCBsb2NhdGlvbnMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1bldpdGhQZXJtaXNzaW9uKHRhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSwgdGFza3M6IChUYXNrIHwgUHJvbWlzZTxUYXNrIHwgdW5kZWZpbmVkPilbXSwgdGFza05hbWVzOiBzdHJpbmdbXSwgbG9jYXRpb25zOiBNYXA8c3RyaW5nLCBVUkk+KSB7XG5cdFx0aWYgKHRhc2tOYW1lcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFMTE9XX0FVVE9NQVRJQ19UQVNLUykgPT09ICdvbicpIHtcblx0XHRcdHRoaXMuX3J1blRhc2tzKHRhc2tTZXJ2aWNlLCB0YXNrcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhhc1Nob3duUHJvbXB0Rm9yQXV0b21hdGljVGFza3MgPSBzdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEhBU19QUk9NUFRFRF9GT1JfQVVUT01BVElDX1RBU0tTLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBmYWxzZSk7XG5cdFx0aWYgKGhhc1Nob3duUHJvbXB0Rm9yQXV0b21hdGljVGFza3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gV2UgaGF2ZSBhdXRvbWF0aWMgdGFza3MgLSBwcm9tcHQgdG8gYWxsb3cuXG5cdFx0Y29uc3QgYWxsb3cgPSBhd2FpdCB0aGlzLl9zaG93UHJvbXB0KG5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgdGFza05hbWVzLCBsb2NhdGlvbnMpO1xuXHRcdGlmIChhbGxvdykge1xuXHRcdFx0dGhpcy5fcnVuVGFza3ModGFza1NlcnZpY2UsIHRhc2tzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG93UHJvbXB0KG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgdGFza05hbWVzOiBzdHJpbmdbXSwgbG9jYXRpb25zOiBNYXA8c3RyaW5nLCBVUkk+KTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuSW5mbywgbmxzLmxvY2FsaXplKCd0YXNrcy5ydW4uYWxsb3dBdXRvbWF0aWMnLFxuXHRcdFx0XHRcIlRoaXMgd29ya3NwYWNlIGhhcyB0YXNrcyAoezB9KSBkZWZpbmVkICh7MX0pIHRoYXQgY2FuIGxhdW5jaCBwcm9jZXNzZXMgYXV0b21hdGljYWxseSB3aGVuIHlvdSBvcGVuIHRoaXMgd29ya3NwYWNlLiBEbyB5b3Ugd2FudCB0byBhbGxvdyBhdXRvbWF0aWMgdGFza3MgdG8gcnVuIGluIGFsbCB0cnVzdGVkIHdvcmtzcGFjZXM/XCIsXG5cdFx0XHRcdHRhc2tOYW1lcy5qb2luKCcsICcpLFxuXHRcdFx0XHRBcnJheS5mcm9tKGxvY2F0aW9ucy5rZXlzKCkpLmpvaW4oJywgJylcblx0XHRcdCksXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnYWxsb3cnLCBcIkFsbG93XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKEFMTE9XX0FVVE9NQVRJQ19UQVNLUywgJ29uJywgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdkaXNhbGxvdycsIFwiRGlzYWxsb3dcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKEFMTE9XX0FVVE9NQVRJQ19UQVNLUywgJ29mZicsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2F0aW9ucy5zaXplID09PSAxID8gbmxzLmxvY2FsaXplKCdvcGVuVGFzaycsIFwiT3BlbiBGaWxlXCIpIDogbmxzLmxvY2FsaXplKCdvcGVuVGFza3MnLCBcIk9wZW4gRmlsZXNcIiksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGxvY2F0aW9uIG9mIGxvY2F0aW9ucykge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBvcGVuZXJTZXJ2aWNlLm9wZW4obG9jYXRpb25bMV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmVzb2x2ZShmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0eyBvbkNhbmNlbDogKCkgPT4gcmVzb2x2ZShmYWxzZSkgfVxuXHRcdFx0KTtcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEhBU19QUk9NUFRFRF9GT1JfQVVUT01BVElDX1RBU0tTLCB0cnVlLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH0pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VBdXRvbWF0aWNUYXNrUnVubmluZyBleHRlbmRzIEFjdGlvbjIge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5tYW5hZ2VBdXRvbWF0aWNSdW5uaW5nJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBMQUJFTCA9IG5scy5sb2NhbGl6ZSgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5tYW5hZ2VBdXRvbWF0aWNSdW5uaW5nJywgXCJNYW5hZ2UgQXV0b21hdGljIFRhc2tzXCIpO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBNYW5hZ2VBdXRvbWF0aWNUYXNrUnVubmluZy5JRCxcblx0XHRcdHRpdGxlOiBNYW5hZ2VBdXRvbWF0aWNUYXNrUnVubmluZy5MQUJFTCxcblx0XHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHF1aWNrSW5wdXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBhbGxvd0l0ZW06IElRdWlja1BpY2tJdGVtID0geyBsYWJlbDogbmxzLmxvY2FsaXplKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmFsbG93QXV0b21hdGljVGFza3MnLCBcIkFsbG93IEF1dG9tYXRpYyBUYXNrc1wiKSB9O1xuXHRcdGNvbnN0IGRpc2FsbG93SXRlbTogSVF1aWNrUGlja0l0ZW0gPSB7IGxhYmVsOiBubHMubG9jYWxpemUoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MuZGlzYWxsb3dBdXRvbWF0aWNUYXNrcycsIFwiRGlzYWxsb3cgQXV0b21hdGljIFRhc2tzXCIpIH07XG5cdFx0Y29uc3QgdmFsdWUgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFthbGxvd0l0ZW0sIGRpc2FsbG93SXRlbV0sIHsgY2FuUGlja01hbnk6IGZhbHNlIH0pO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQUxMT1dfQVVUT01BVElDX1RBU0tTLCB2YWx1ZSA9PT0gYWxsb3dJdGVtID8gJ29uJyA6ICdvZmYnLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixZQUFZLGVBQWU7QUFDM0IsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxvQkFBZ0Q7QUFDekQsU0FBUyxjQUFvQixlQUEyQixnQkFBZ0Isc0JBQXFFO0FBQzdJLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUF5QiwwQkFBMEI7QUFD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
