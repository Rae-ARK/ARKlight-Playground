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
import { toAction } from "../../../../base/common/actions.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { createErrorWithActions } from "../../../../base/common/errorMessage.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import severity from "../../../../base/common/severity.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from "./debugCommands.js";
import { Markers } from "../../markers/common/markers.js";
import { ConfiguringTask, CustomTask, TaskEventKind } from "../../tasks/common/tasks.js";
import { ITaskService } from "../../tasks/common/taskService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
const onceFilter = (event, filter) => Event.once(Event.filter(event, filter));
var TaskRunResult = /* @__PURE__ */ ((TaskRunResult2) => {
  TaskRunResult2[TaskRunResult2["Failure"] = 0] = "Failure";
  TaskRunResult2[TaskRunResult2["Success"] = 1] = "Success";
  return TaskRunResult2;
})(TaskRunResult || {});
const DEBUG_TASK_ERROR_CHOICE_KEY = "debug.taskerrorchoice";
const ABORT_LABEL = nls.localize("abort", "Abort");
const DEBUG_ANYWAY_LABEL = nls.localize({ key: "debugAnyway", comment: ["&& denotes a mnemonic"] }, "&&Debug Anyway");
const DEBUG_ANYWAY_LABEL_NO_MEMO = nls.localize("debugAnywayNoMemo", "Debug Anyway");
let DebugTaskRunner = class {
  constructor(taskService, markerService, configurationService, viewsService, dialogService, storageService, commandService, progressService) {
    this.taskService = taskService;
    this.markerService = markerService;
    this.configurationService = configurationService;
    this.viewsService = viewsService;
    this.dialogService = dialogService;
    this.storageService = storageService;
    this.commandService = commandService;
    this.progressService = progressService;
    this.globalCancellation = new CancellationTokenSource();
  }
  cancel() {
    this.globalCancellation.dispose(true);
    this.globalCancellation = new CancellationTokenSource();
  }
  dispose() {
    this.globalCancellation.dispose(true);
  }
  async runTaskAndCheckErrors(root, taskId) {
    try {
      const taskSummary = await this.runTask(root, taskId, this.globalCancellation.token);
      if (taskSummary && (taskSummary.exitCode === void 0 || taskSummary.cancelled)) {
        return 0 /* Failure */;
      }
      const errorCount = taskId ? this.markerService.read({ severities: MarkerSeverity.Error, take: 2 }).length : 0;
      const successExitCode = taskSummary && taskSummary.exitCode === 0;
      const failureExitCode = taskSummary && taskSummary.exitCode !== 0;
      const onTaskErrors = this.configurationService.getValue("debug").onTaskErrors;
      if (successExitCode || onTaskErrors === "debugAnyway" || errorCount === 0 && !failureExitCode) {
        return 1 /* Success */;
      }
      if (onTaskErrors === "showErrors") {
        await this.viewsService.openView(Markers.MARKERS_VIEW_ID, true);
        return Promise.resolve(0 /* Failure */);
      }
      if (onTaskErrors === "abort") {
        return Promise.resolve(0 /* Failure */);
      }
      const taskLabel = typeof taskId === "string" ? taskId : taskId ? taskId.name : "";
      const message = errorCount > 1 ? nls.localize("preLaunchTaskErrors", "Errors exist after running preLaunchTask '{0}'.", taskLabel) : errorCount === 1 ? nls.localize("preLaunchTaskError", "Error exists after running preLaunchTask '{0}'.", taskLabel) : taskSummary && typeof taskSummary.exitCode === "number" ? nls.localize("preLaunchTaskExitCode", "The preLaunchTask '{0}' terminated with exit code {1}.", taskLabel, taskSummary.exitCode) : nls.localize("preLaunchTaskTerminated", "The preLaunchTask '{0}' terminated.", taskLabel);
      let DebugChoice;
      ((DebugChoice2) => {
        DebugChoice2[DebugChoice2["DebugAnyway"] = 1] = "DebugAnyway";
        DebugChoice2[DebugChoice2["ShowErrors"] = 2] = "ShowErrors";
        DebugChoice2[DebugChoice2["Cancel"] = 0] = "Cancel";
      })(DebugChoice || (DebugChoice = {}));
      const { result, checkboxChecked } = await this.dialogService.prompt({
        type: severity.Warning,
        message,
        buttons: [
          {
            label: DEBUG_ANYWAY_LABEL,
            run: () => 1 /* DebugAnyway */
          },
          {
            label: nls.localize({ key: "showErrors", comment: ["&& denotes a mnemonic"] }, "&&Show Errors"),
            run: () => 2 /* ShowErrors */
          }
        ],
        cancelButton: {
          label: ABORT_LABEL,
          run: () => 0 /* Cancel */
        },
        checkbox: {
          label: nls.localize("remember", "Remember my choice in user settings")
        }
      });
      const debugAnyway = result === 1 /* DebugAnyway */;
      const abort = result === 0 /* Cancel */;
      if (checkboxChecked) {
        this.configurationService.updateValue("debug.onTaskErrors", result === 1 /* DebugAnyway */ ? "debugAnyway" : abort ? "abort" : "showErrors");
      }
      if (abort) {
        return Promise.resolve(0 /* Failure */);
      }
      if (debugAnyway) {
        return 1 /* Success */;
      }
      await this.viewsService.openView(Markers.MARKERS_VIEW_ID, true);
      return Promise.resolve(0 /* Failure */);
    } catch (err) {
      const taskConfigureAction = this.taskService.configureAction();
      const choiceMap = JSON.parse(this.storageService.get(DEBUG_TASK_ERROR_CHOICE_KEY, StorageScope.WORKSPACE, "{}"));
      let choice = -1;
      let DebugChoice;
      ((DebugChoice2) => {
        DebugChoice2[DebugChoice2["DebugAnyway"] = 0] = "DebugAnyway";
        DebugChoice2[DebugChoice2["ConfigureTask"] = 1] = "ConfigureTask";
        DebugChoice2[DebugChoice2["Cancel"] = 2] = "Cancel";
      })(DebugChoice || (DebugChoice = {}));
      if (choiceMap[err.message] !== void 0) {
        choice = choiceMap[err.message];
      } else {
        const { result, checkboxChecked } = await this.dialogService.prompt({
          type: severity.Error,
          message: err.message,
          buttons: [
            {
              label: nls.localize({ key: "debugAnyway", comment: ["&& denotes a mnemonic"] }, "&&Debug Anyway"),
              run: () => 0 /* DebugAnyway */
            },
            {
              label: taskConfigureAction.label,
              run: () => 1 /* ConfigureTask */
            }
          ],
          cancelButton: {
            run: () => 2 /* Cancel */
          },
          checkbox: {
            label: nls.localize("rememberTask", "Remember my choice for this task")
          }
        });
        choice = result;
        if (checkboxChecked) {
          choiceMap[err.message] = choice;
          this.storageService.store(DEBUG_TASK_ERROR_CHOICE_KEY, JSON.stringify(choiceMap), StorageScope.WORKSPACE, StorageTarget.MACHINE);
        }
      }
      if (choice === 1 /* ConfigureTask */) {
        await taskConfigureAction.run();
      }
      return choice === 0 /* DebugAnyway */ ? 1 /* Success */ : 0 /* Failure */;
    }
  }
  async runTask(root, taskId, token = this.globalCancellation.token) {
    if (!taskId) {
      return Promise.resolve(null);
    }
    if (!root) {
      return Promise.reject(new Error(nls.localize("invalidTaskReference", "Task '{0}' can not be referenced from a launch configuration that is in a different workspace folder.", typeof taskId === "string" ? taskId : taskId.type)));
    }
    const task = await this.taskService.getTask(root, taskId);
    if (!task) {
      const errorMessage = typeof taskId === "string" ? nls.localize("DebugTaskNotFoundWithTaskId", "Could not find the task '{0}'.", taskId) : nls.localize("DebugTaskNotFound", "Could not find the specified task.");
      return Promise.reject(createErrorWithActions(errorMessage, [toAction({ id: DEBUG_CONFIGURE_COMMAND_ID, label: DEBUG_CONFIGURE_LABEL, enabled: true, run: () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID) })]));
    }
    let taskStarted = false;
    const store = new DisposableStore();
    const getTaskKey = (t) => t.getKey() ?? t.getMapKey();
    const taskKey = getTaskKey(task);
    const inactivePromise = new Promise((resolve) => store.add(
      onceFilter(this.taskService.onDidStateChange, (e) => {
        return (e.kind === TaskEventKind.Inactive || e.kind === TaskEventKind.ProcessEnded && e.exitCode === void 0) && getTaskKey(e.__task) === taskKey;
      })((e) => {
        taskStarted = true;
        resolve(e.kind === TaskEventKind.ProcessEnded ? { exitCode: e.exitCode } : null);
      })
    ));
    store.add(
      onceFilter(
        this.taskService.onDidStateChange,
        (e) => (e.kind === TaskEventKind.Active || e.kind === TaskEventKind.DependsOnStarted) && getTaskKey(e.__task) === taskKey
      )(() => {
        taskStarted = true;
      })
    );
    const didAcquireInput = store.add(new Emitter());
    store.add(onceFilter(
      this.taskService.onDidStateChange,
      (e) => e.kind === TaskEventKind.AcquiredInput && getTaskKey(e.__task) === taskKey
    )(() => didAcquireInput.fire()));
    const taskDonePromise = this.taskService.getActiveTasks().then(async (tasks) => {
      if (tasks.find((t) => getTaskKey(t) === taskKey)) {
        didAcquireInput.fire();
        const busyTasks = await this.taskService.getBusyTasks();
        if (busyTasks.find((t) => getTaskKey(t) === taskKey)) {
          taskStarted = true;
          return inactivePromise;
        }
        return Promise.resolve(null);
      }
      const taskPromise = this.taskService.run(task);
      if (task.configurationProperties.isBackground) {
        return inactivePromise;
      }
      return taskPromise.then((x) => x ?? null);
    });
    const result = new Promise((resolve, reject) => {
      taskDonePromise.then((result2) => {
        taskStarted = true;
        resolve(result2);
      }, (error) => reject(error));
      store.add(token.onCancellationRequested(() => {
        resolve({ exitCode: void 0, cancelled: true });
        this.taskService.terminate(task).catch(() => {
        });
      }));
      store.add(didAcquireInput.event(() => {
        const waitTime = task.configurationProperties.isBackground ? 5e3 : 1e4;
        store.add(disposableTimeout(() => {
          if (!taskStarted) {
            const errorMessage = nls.localize("taskNotTracked", "The task '{0}' has not exited and doesn't have a 'problemMatcher' defined. Make sure to define a problem matcher for watch tasks.", typeof taskId === "string" ? taskId : JSON.stringify(taskId));
            reject({ severity: severity.Error, message: errorMessage });
          }
        }, waitTime));
        const hideSlowPreLaunchWarning = this.configurationService.getValue("debug").hideSlowPreLaunchWarning;
        if (!hideSlowPreLaunchWarning) {
          store.add(disposableTimeout(() => {
            const message = nls.localize("runningTask", "Waiting for preLaunchTask '{0}'...", task.configurationProperties.name);
            const buttons = [DEBUG_ANYWAY_LABEL_NO_MEMO, ABORT_LABEL];
            const canConfigure = task instanceof CustomTask || task instanceof ConfiguringTask;
            if (canConfigure) {
              buttons.splice(1, 0, nls.localize("configureTask", "Configure Task"));
            }
            this.progressService.withProgress(
              { location: ProgressLocation.Notification, title: message, buttons },
              () => result.catch(() => {
              }),
              (choice) => {
                if (choice === void 0) {
                } else if (choice === 0) {
                  resolve({ exitCode: 0 });
                } else {
                  resolve({ exitCode: void 0, cancelled: true });
                  this.taskService.terminate(task).catch(() => {
                  });
                  if (canConfigure && choice === 1) {
                    this.taskService.openConfig(task);
                  }
                }
              }
            );
          }, 1e4));
        }
      }));
    });
    return result.finally(() => store.dispose());
  }
};
DebugTaskRunner = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IViewsService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, IProgressService)
], DebugTaskRunner);
export {
  DebugTaskRunner,
  TaskRunResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdUYXNrUnVubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlRXJyb3JXaXRoQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IERFQlVHX0NPTkZJR1VSRV9DT01NQU5EX0lELCBERUJVR19DT05GSUdVUkVfTEFCRUwgfSBmcm9tICcuL2RlYnVnQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSURlYnVnQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5pbXBvcnQgeyBNYXJrZXJzIH0gZnJvbSAnLi4vLi4vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmluZ1Rhc2ssIEN1c3RvbVRhc2ssIElUYXNrRXZlbnQsIElUYXNrSWRlbnRpZmllciwgVGFzaywgVGFza0V2ZW50S2luZCB9IGZyb20gJy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrcy5qcyc7XG5pbXBvcnQgeyBJVGFza1NlcnZpY2UsIElUYXNrU3VtbWFyeSB9IGZyb20gJy4uLy4uL3Rhc2tzL2NvbW1vbi90YXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5cbmNvbnN0IG9uY2VGaWx0ZXIgPSAoZXZlbnQ6IEV2ZW50PElUYXNrRXZlbnQ+LCBmaWx0ZXI6IChlOiBJVGFza0V2ZW50KSA9PiBib29sZWFuKSA9PiBFdmVudC5vbmNlKEV2ZW50LmZpbHRlcihldmVudCwgZmlsdGVyKSk7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRhc2tSdW5SZXN1bHQge1xuXHRGYWlsdXJlLFxuXHRTdWNjZXNzXG59XG5cbmNvbnN0IERFQlVHX1RBU0tfRVJST1JfQ0hPSUNFX0tFWSA9ICdkZWJ1Zy50YXNrZXJyb3JjaG9pY2UnO1xuY29uc3QgQUJPUlRfTEFCRUwgPSBubHMubG9jYWxpemUoJ2Fib3J0JywgXCJBYm9ydFwiKTtcbmNvbnN0IERFQlVHX0FOWVdBWV9MQUJFTCA9IG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlYnVnQW55d2F5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmRGVidWcgQW55d2F5XCIpO1xuY29uc3QgREVCVUdfQU5ZV0FZX0xBQkVMX05PX01FTU8gPSBubHMubG9jYWxpemUoJ2RlYnVnQW55d2F5Tm9NZW1vJywgXCJEZWJ1ZyBBbnl3YXlcIik7XG5cbmludGVyZmFjZSBJUnVubmVyVGFza1N1bW1hcnkgZXh0ZW5kcyBJVGFza1N1bW1hcnkge1xuXHRjYW5jZWxsZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgRGVidWdUYXNrUnVubmVyIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgZ2xvYmFsQ2FuY2VsbGF0aW9uID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUYXNrU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRhc2tTZXJ2aWNlOiBJVGFza1NlcnZpY2UsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0Y2FuY2VsKCk6IHZvaWQge1xuXHRcdHRoaXMuZ2xvYmFsQ2FuY2VsbGF0aW9uLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0dGhpcy5nbG9iYWxDYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZ2xvYmFsQ2FuY2VsbGF0aW9uLmRpc3Bvc2UodHJ1ZSk7XG5cdH1cblxuXHRhc3luYyBydW5UYXNrQW5kQ2hlY2tFcnJvcnMoXG5cdFx0cm9vdDogSVdvcmtzcGFjZUZvbGRlciB8IElXb3Jrc3BhY2UgfCB1bmRlZmluZWQsXG5cdFx0dGFza0lkOiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQsXG5cdCk6IFByb21pc2U8VGFza1J1blJlc3VsdD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0YXNrU3VtbWFyeSA9IGF3YWl0IHRoaXMucnVuVGFzayhyb290LCB0YXNrSWQsIHRoaXMuZ2xvYmFsQ2FuY2VsbGF0aW9uLnRva2VuKTtcblx0XHRcdGlmICh0YXNrU3VtbWFyeSAmJiAodGFza1N1bW1hcnkuZXhpdENvZGUgPT09IHVuZGVmaW5lZCB8fCB0YXNrU3VtbWFyeS5jYW5jZWxsZWQpKSB7XG5cdFx0XHRcdC8vIFVzZXIgY2FuY2VsZWQsIGVpdGhlciBkZWJ1Z2dpbmcsIG9yIHRoZSBwcmVsYXVuY2ggdGFza1xuXHRcdFx0XHRyZXR1cm4gVGFza1J1blJlc3VsdC5GYWlsdXJlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlcnJvckNvdW50ID0gdGFza0lkID8gdGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoeyBzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5FcnJvciwgdGFrZTogMiB9KS5sZW5ndGggOiAwO1xuXHRcdFx0Y29uc3Qgc3VjY2Vzc0V4aXRDb2RlID0gdGFza1N1bW1hcnkgJiYgdGFza1N1bW1hcnkuZXhpdENvZGUgPT09IDA7XG5cdFx0XHRjb25zdCBmYWlsdXJlRXhpdENvZGUgPSB0YXNrU3VtbWFyeSAmJiB0YXNrU3VtbWFyeS5leGl0Q29kZSAhPT0gMDtcblx0XHRcdGNvbnN0IG9uVGFza0Vycm9ycyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykub25UYXNrRXJyb3JzO1xuXHRcdFx0aWYgKHN1Y2Nlc3NFeGl0Q29kZSB8fCBvblRhc2tFcnJvcnMgPT09ICdkZWJ1Z0FueXdheScgfHwgKGVycm9yQ291bnQgPT09IDAgJiYgIWZhaWx1cmVFeGl0Q29kZSkpIHtcblx0XHRcdFx0cmV0dXJuIFRhc2tSdW5SZXN1bHQuU3VjY2Vzcztcblx0XHRcdH1cblx0XHRcdGlmIChvblRhc2tFcnJvcnMgPT09ICdzaG93RXJyb3JzJykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyhNYXJrZXJzLk1BUktFUlNfVklFV19JRCwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoVGFza1J1blJlc3VsdC5GYWlsdXJlKTtcblx0XHRcdH1cblx0XHRcdGlmIChvblRhc2tFcnJvcnMgPT09ICdhYm9ydCcpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShUYXNrUnVuUmVzdWx0LkZhaWx1cmUpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXNrTGFiZWwgPSB0eXBlb2YgdGFza0lkID09PSAnc3RyaW5nJyA/IHRhc2tJZCA6IHRhc2tJZCA/IHRhc2tJZC5uYW1lIGFzIHN0cmluZyA6ICcnO1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVycm9yQ291bnQgPiAxXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdwcmVMYXVuY2hUYXNrRXJyb3JzJywgXCJFcnJvcnMgZXhpc3QgYWZ0ZXIgcnVubmluZyBwcmVMYXVuY2hUYXNrICd7MH0nLlwiLCB0YXNrTGFiZWwpXG5cdFx0XHRcdDogZXJyb3JDb3VudCA9PT0gMVxuXHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdwcmVMYXVuY2hUYXNrRXJyb3InLCBcIkVycm9yIGV4aXN0cyBhZnRlciBydW5uaW5nIHByZUxhdW5jaFRhc2sgJ3swfScuXCIsIHRhc2tMYWJlbClcblx0XHRcdFx0XHQ6IHRhc2tTdW1tYXJ5ICYmIHR5cGVvZiB0YXNrU3VtbWFyeS5leGl0Q29kZSA9PT0gJ251bWJlcidcblx0XHRcdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdwcmVMYXVuY2hUYXNrRXhpdENvZGUnLCBcIlRoZSBwcmVMYXVuY2hUYXNrICd7MH0nIHRlcm1pbmF0ZWQgd2l0aCBleGl0IGNvZGUgezF9LlwiLCB0YXNrTGFiZWwsIHRhc2tTdW1tYXJ5LmV4aXRDb2RlKVxuXHRcdFx0XHRcdFx0OiBubHMubG9jYWxpemUoJ3ByZUxhdW5jaFRhc2tUZXJtaW5hdGVkJywgXCJUaGUgcHJlTGF1bmNoVGFzayAnezB9JyB0ZXJtaW5hdGVkLlwiLCB0YXNrTGFiZWwpO1xuXG5cdFx0XHRlbnVtIERlYnVnQ2hvaWNlIHtcblx0XHRcdFx0RGVidWdBbnl3YXkgPSAxLFxuXHRcdFx0XHRTaG93RXJyb3JzID0gMixcblx0XHRcdFx0Q2FuY2VsID0gMFxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyByZXN1bHQsIGNoZWNrYm94Q2hlY2tlZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDxEZWJ1Z0Nob2ljZT4oe1xuXHRcdFx0XHR0eXBlOiBzZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IERFQlVHX0FOWVdBWV9MQUJFTCxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gRGVidWdDaG9pY2UuRGVidWdBbnl3YXlcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdzaG93RXJyb3JzJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU2hvdyBFcnJvcnNcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IERlYnVnQ2hvaWNlLlNob3dFcnJvcnNcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdGxhYmVsOiBBQk9SVF9MQUJFTCxcblx0XHRcdFx0XHRydW46ICgpID0+IERlYnVnQ2hvaWNlLkNhbmNlbFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbWVtYmVyJywgXCJSZW1lbWJlciBteSBjaG9pY2UgaW4gdXNlciBzZXR0aW5nc1wiKSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblxuXHRcdFx0Y29uc3QgZGVidWdBbnl3YXkgPSByZXN1bHQgPT09IERlYnVnQ2hvaWNlLkRlYnVnQW55d2F5O1xuXHRcdFx0Y29uc3QgYWJvcnQgPSByZXN1bHQgPT09IERlYnVnQ2hvaWNlLkNhbmNlbDtcblx0XHRcdGlmIChjaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSgnZGVidWcub25UYXNrRXJyb3JzJywgcmVzdWx0ID09PSBEZWJ1Z0Nob2ljZS5EZWJ1Z0FueXdheSA/ICdkZWJ1Z0FueXdheScgOiBhYm9ydCA/ICdhYm9ydCcgOiAnc2hvd0Vycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWJvcnQpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShUYXNrUnVuUmVzdWx0LkZhaWx1cmUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGRlYnVnQW55d2F5KSB7XG5cdFx0XHRcdHJldHVybiBUYXNrUnVuUmVzdWx0LlN1Y2Nlc3M7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lELCB0cnVlKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoVGFza1J1blJlc3VsdC5GYWlsdXJlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IHRhc2tDb25maWd1cmVBY3Rpb24gPSB0aGlzLnRhc2tTZXJ2aWNlLmNvbmZpZ3VyZUFjdGlvbigpO1xuXHRcdFx0Y29uc3QgY2hvaWNlTWFwOiB7IFtrZXk6IHN0cmluZ106IG51bWJlciB9ID0gSlNPTi5wYXJzZSh0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChERUJVR19UQVNLX0VSUk9SX0NIT0lDRV9LRVksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsICd7fScpKTtcblxuXHRcdFx0bGV0IGNob2ljZSA9IC0xO1xuXHRcdFx0ZW51bSBEZWJ1Z0Nob2ljZSB7XG5cdFx0XHRcdERlYnVnQW55d2F5ID0gMCxcblx0XHRcdFx0Q29uZmlndXJlVGFzayA9IDEsXG5cdFx0XHRcdENhbmNlbCA9IDJcblx0XHRcdH1cblx0XHRcdGlmIChjaG9pY2VNYXBbZXJyLm1lc3NhZ2VdICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y2hvaWNlID0gY2hvaWNlTWFwW2Vyci5tZXNzYWdlXTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHsgcmVzdWx0LCBjaGVja2JveENoZWNrZWQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8RGVidWdDaG9pY2U+KHtcblx0XHRcdFx0XHR0eXBlOiBzZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRtZXNzYWdlOiBlcnIubWVzc2FnZSxcblx0XHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdkZWJ1Z0FueXdheScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkRlYnVnIEFueXdheVwiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBEZWJ1Z0Nob2ljZS5EZWJ1Z0FueXdheVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHRhc2tDb25maWd1cmVBY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gRGVidWdDaG9pY2UuQ29uZmlndXJlVGFza1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0XHRydW46ICgpID0+IERlYnVnQ2hvaWNlLkNhbmNlbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y2hlY2tib3g6IHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbWVtYmVyVGFzaycsIFwiUmVtZW1iZXIgbXkgY2hvaWNlIGZvciB0aGlzIHRhc2tcIilcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjaG9pY2UgPSByZXN1bHQ7XG5cdFx0XHRcdGlmIChjaGVja2JveENoZWNrZWQpIHtcblx0XHRcdFx0XHRjaG9pY2VNYXBbZXJyLm1lc3NhZ2VdID0gY2hvaWNlO1xuXHRcdFx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoREVCVUdfVEFTS19FUlJPUl9DSE9JQ0VfS0VZLCBKU09OLnN0cmluZ2lmeShjaG9pY2VNYXApLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjaG9pY2UgPT09IERlYnVnQ2hvaWNlLkNvbmZpZ3VyZVRhc2spIHtcblx0XHRcdFx0YXdhaXQgdGFza0NvbmZpZ3VyZUFjdGlvbi5ydW4oKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGNob2ljZSA9PT0gRGVidWdDaG9pY2UuRGVidWdBbnl3YXkgPyBUYXNrUnVuUmVzdWx0LlN1Y2Nlc3MgOiBUYXNrUnVuUmVzdWx0LkZhaWx1cmU7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcnVuVGFzayhyb290OiBJV29ya3NwYWNlIHwgSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgdGFza0lkOiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQsIHRva2VuID0gdGhpcy5nbG9iYWxDYW5jZWxsYXRpb24udG9rZW4pOiBQcm9taXNlPElSdW5uZXJUYXNrU3VtbWFyeSB8IG51bGw+IHtcblx0XHRpZiAoIXRhc2tJZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHR9XG5cdFx0aWYgKCFyb290KSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZFRhc2tSZWZlcmVuY2UnLCBcIlRhc2sgJ3swfScgY2FuIG5vdCBiZSByZWZlcmVuY2VkIGZyb20gYSBsYXVuY2ggY29uZmlndXJhdGlvbiB0aGF0IGlzIGluIGEgZGlmZmVyZW50IHdvcmtzcGFjZSBmb2xkZXIuXCIsIHR5cGVvZiB0YXNrSWQgPT09ICdzdHJpbmcnID8gdGFza0lkIDogdGFza0lkLnR5cGUpKSk7XG5cdFx0fVxuXHRcdC8vIHJ1biBhIHRhc2sgYmVmb3JlIHN0YXJ0aW5nIGEgZGVidWcgc2Vzc2lvblxuXHRcdGNvbnN0IHRhc2sgPSBhd2FpdCB0aGlzLnRhc2tTZXJ2aWNlLmdldFRhc2socm9vdCwgdGFza0lkKTtcblx0XHRpZiAoIXRhc2spIHtcblx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IHR5cGVvZiB0YXNrSWQgPT09ICdzdHJpbmcnXG5cdFx0XHRcdD8gbmxzLmxvY2FsaXplKCdEZWJ1Z1Rhc2tOb3RGb3VuZFdpdGhUYXNrSWQnLCBcIkNvdWxkIG5vdCBmaW5kIHRoZSB0YXNrICd7MH0nLlwiLCB0YXNrSWQpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCdEZWJ1Z1Rhc2tOb3RGb3VuZCcsIFwiQ291bGQgbm90IGZpbmQgdGhlIHNwZWNpZmllZCB0YXNrLlwiKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChjcmVhdGVFcnJvcldpdGhBY3Rpb25zKGVycm9yTWVzc2FnZSwgW3RvQWN0aW9uKHsgaWQ6IERFQlVHX0NPTkZJR1VSRV9DT01NQU5EX0lELCBsYWJlbDogREVCVUdfQ09ORklHVVJFX0xBQkVMLCBlbmFibGVkOiB0cnVlLCBydW46ICgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoREVCVUdfQ09ORklHVVJFX0NPTU1BTkRfSUQpIH0pXSkpO1xuXHRcdH1cblxuXHRcdC8vIElmIGEgdGFzayBpcyBtaXNzaW5nIHRoZSBwcm9ibGVtIG1hdGNoZXIgdGhlIHByb21pc2Ugd2lsbCBuZXZlciBjb21wbGV0ZSwgc28gd2UgbmVlZCB0byBoYXZlIGEgd29ya2Fyb3VuZCAjMzUzNDBcblx0XHRsZXQgdGFza1N0YXJ0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBnZXRUYXNrS2V5ID0gKHQ6IFRhc2spID0+IHQuZ2V0S2V5KCkgPz8gdC5nZXRNYXBLZXkoKTtcblx0XHRjb25zdCB0YXNrS2V5ID0gZ2V0VGFza0tleSh0YXNrKTtcblx0XHRjb25zdCBpbmFjdGl2ZVByb21pc2U6IFByb21pc2U8SVRhc2tTdW1tYXJ5IHwgbnVsbD4gPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc3RvcmUuYWRkKFxuXHRcdFx0b25jZUZpbHRlcih0aGlzLnRhc2tTZXJ2aWNlLm9uRGlkU3RhdGVDaGFuZ2UsIGUgPT4ge1xuXHRcdFx0XHQvLyBXaGVuIGEgdGFzayBpc0JhY2tncm91bmQgaXQgd2lsbCBnbyBpbmFjdGl2ZSB3aGVuIGl0IGlzIHNhZmUgdG8gbGF1bmNoLlxuXHRcdFx0XHQvLyBCdXQgd2hlbiBhIGJhY2tncm91bmQgdGFzayBpcyB0ZXJtaW5hdGVkIGJ5IHRoZSB1c2VyLCBpdCB3aWxsIGFsc28gZmlyZSBhbiBpbmFjdGl2ZSBldmVudC5cblx0XHRcdFx0Ly8gVGhpcyBtZWFucyB0aGF0IHdlIHdpbGwgbm90IGdldCB0byBzZWUgdGhlIHJlYWwgZXhpdCBjb2RlIGZyb20gcnVubmluZyB0aGUgdGFzayAodW5kZWZpbmVkIHdoZW4gdGVybWluYXRlZCBieSB0aGUgdXNlcikuXG5cdFx0XHRcdC8vIENhdGNoIHRoZSBQcm9jZXNzRW5kZWQgZXZlbnQgaGVyZSwgd2hpY2ggb2NjdXJzIGJlZm9yZSBpbmFjdGl2ZSwgYW5kIGNhcHR1cmUgdGhlIGV4aXQgY29kZSB0byBwcmV2ZW50IHRoaXMuXG5cdFx0XHRcdHJldHVybiAoZS5raW5kID09PSBUYXNrRXZlbnRLaW5kLkluYWN0aXZlXG5cdFx0XHRcdFx0fHwgKGUua2luZCA9PT0gVGFza0V2ZW50S2luZC5Qcm9jZXNzRW5kZWQgJiYgZS5leGl0Q29kZSA9PT0gdW5kZWZpbmVkKSlcblx0XHRcdFx0XHQmJiBnZXRUYXNrS2V5KGUuX190YXNrKSA9PT0gdGFza0tleTtcblx0XHRcdH0pKGUgPT4ge1xuXHRcdFx0XHR0YXNrU3RhcnRlZCA9IHRydWU7XG5cdFx0XHRcdHJlc29sdmUoZS5raW5kID09PSBUYXNrRXZlbnRLaW5kLlByb2Nlc3NFbmRlZCA/IHsgZXhpdENvZGU6IGUuZXhpdENvZGUgfSA6IG51bGwpO1xuXHRcdFx0fSksXG5cdFx0KSk7XG5cblx0XHRzdG9yZS5hZGQoXG5cdFx0XHRvbmNlRmlsdGVyKHRoaXMudGFza1NlcnZpY2Uub25EaWRTdGF0ZUNoYW5nZSwgZSA9PiAoKGUua2luZCA9PT0gVGFza0V2ZW50S2luZC5BY3RpdmUpIHx8IChlLmtpbmQgPT09IFRhc2tFdmVudEtpbmQuRGVwZW5kc09uU3RhcnRlZCkpICYmIGdldFRhc2tLZXkoZS5fX3Rhc2spID09PSB0YXNrS2V5XG5cdFx0XHQpKCgpID0+IHtcblx0XHRcdFx0Ly8gVGFzayBpcyBhY3RpdmUsIHNvIGV2ZXJ5dGhpbmcgc2VlbXMgdG8gYmUgZmluZSwgbm8gbmVlZCB0byBwcm9tcHQgYWZ0ZXIgMTAgc2Vjb25kc1xuXHRcdFx0XHQvLyBVc2UgY2FzZSBiZWluZyBhIHNsb3cgcnVubmluZyB0YXNrIHNob3VsZCBub3QgYmUgcHJvbXB0ZWQgZXZlbiB0aG91Z2ggaXQgdGFrZXMgbW9yZSB0aGFuIDEwIHNlY29uZHNcblx0XHRcdFx0dGFza1N0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3QgZGlkQWNxdWlyZUlucHV0ID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdHN0b3JlLmFkZChvbmNlRmlsdGVyKFxuXHRcdFx0dGhpcy50YXNrU2VydmljZS5vbkRpZFN0YXRlQ2hhbmdlLFxuXHRcdFx0ZSA9PiAoZS5raW5kID09PSBUYXNrRXZlbnRLaW5kLkFjcXVpcmVkSW5wdXQpICYmIGdldFRhc2tLZXkoZS5fX3Rhc2spID09PSB0YXNrS2V5XG5cdFx0KSgoKSA9PiBkaWRBY3F1aXJlSW5wdXQuZmlyZSgpKSk7XG5cblx0XHRjb25zdCB0YXNrRG9uZVByb21pc2U6IFByb21pc2U8SVRhc2tTdW1tYXJ5IHwgbnVsbD4gPSB0aGlzLnRhc2tTZXJ2aWNlLmdldEFjdGl2ZVRhc2tzKCkudGhlbihhc3luYyAodGFza3MpOiBQcm9taXNlPElUYXNrU3VtbWFyeSB8IG51bGw+ID0+IHtcblx0XHRcdGlmICh0YXNrcy5maW5kKHQgPT4gZ2V0VGFza0tleSh0KSA9PT0gdGFza0tleSkpIHtcblx0XHRcdFx0ZGlkQWNxdWlyZUlucHV0LmZpcmUoKTtcblx0XHRcdFx0Ly8gQ2hlY2sgdGhhdCB0aGUgdGFzayBpc24ndCBidXN5IGFuZCBpZiBpdCBpcywgd2FpdCBmb3IgaXRcblx0XHRcdFx0Y29uc3QgYnVzeVRhc2tzID0gYXdhaXQgdGhpcy50YXNrU2VydmljZS5nZXRCdXN5VGFza3MoKTtcblx0XHRcdFx0aWYgKGJ1c3lUYXNrcy5maW5kKHQgPT4gZ2V0VGFza0tleSh0KSA9PT0gdGFza0tleSkpIHtcblx0XHRcdFx0XHR0YXNrU3RhcnRlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIGluYWN0aXZlUHJvbWlzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyB0YXNrIGlzIGFscmVhZHkgcnVubmluZyBhbmQgaXNuJ3QgYnVzeSAtIG5vdGhpbmcgdG8gZG8uXG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhc2tQcm9taXNlID0gdGhpcy50YXNrU2VydmljZS5ydW4odGFzayk7XG5cdFx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpIHtcblx0XHRcdFx0cmV0dXJuIGluYWN0aXZlUHJvbWlzZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRhc2tQcm9taXNlLnRoZW4oeCA9PiB4ID8/IG51bGwpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFByb21pc2U8SVJ1bm5lclRhc2tTdW1tYXJ5IHwgbnVsbD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGFza0RvbmVQcm9taXNlLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0dGFza1N0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9LCBlcnJvciA9PiByZWplY3QoZXJyb3IpKTtcblxuXHRcdFx0c3RvcmUuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0cmVzb2x2ZSh7IGV4aXRDb2RlOiB1bmRlZmluZWQsIGNhbmNlbGxlZDogdHJ1ZSB9KTtcblx0XHRcdFx0dGhpcy50YXNrU2VydmljZS50ZXJtaW5hdGUodGFzaykuY2F0Y2goKCkgPT4geyB9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gU3RhcnQgdGhlIHRpbWVvdXRzIG9uY2UgYSB0ZXJtaW5hbCBoYXMgYmVlbiBhY3F1aXJlZFxuXHRcdFx0c3RvcmUuYWRkKGRpZEFjcXVpcmVJbnB1dC5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdhaXRUaW1lID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQgPyA1MDAwIDogMTAwMDA7XG5cblx0XHRcdFx0Ly8gRXJyb3Igc2hvd24gaWYgdGhlcmUncyBhIGJhY2tncm91bmQgdGFzayB3aXRoIG5vIHByb2JsZW0gbWF0Y2hlciB0aGF0IGRvZXNuJ3QgZXhpdCBxdWlja2x5XG5cdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCF0YXNrU3RhcnRlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXJyb3JNZXNzYWdlID0gbmxzLmxvY2FsaXplKCd0YXNrTm90VHJhY2tlZCcsIFwiVGhlIHRhc2sgJ3swfScgaGFzIG5vdCBleGl0ZWQgYW5kIGRvZXNuJ3QgaGF2ZSBhICdwcm9ibGVtTWF0Y2hlcicgZGVmaW5lZC4gTWFrZSBzdXJlIHRvIGRlZmluZSBhIHByb2JsZW0gbWF0Y2hlciBmb3Igd2F0Y2ggdGFza3MuXCIsIHR5cGVvZiB0YXNrSWQgPT09ICdzdHJpbmcnID8gdGFza0lkIDogSlNPTi5zdHJpbmdpZnkodGFza0lkKSk7XG5cdFx0XHRcdFx0XHRyZWplY3QoeyBzZXZlcml0eTogc2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGVycm9yTWVzc2FnZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHdhaXRUaW1lKSk7XG5cblx0XHRcdFx0Y29uc3QgaGlkZVNsb3dQcmVMYXVuY2hXYXJuaW5nID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5oaWRlU2xvd1ByZUxhdW5jaFdhcm5pbmc7XG5cdFx0XHRcdGlmICghaGlkZVNsb3dQcmVMYXVuY2hXYXJuaW5nKSB7XG5cdFx0XHRcdFx0Ly8gTm90aWZpY2F0aW9uIHNob3duIG9uIGFueSB0YXNrIHRha2luZyBhIHdoaWxlIHRvIHJlc29sdmVcblx0XHRcdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgncnVubmluZ1Rhc2snLCBcIldhaXRpbmcgZm9yIHByZUxhdW5jaFRhc2sgJ3swfScuLi5cIiwgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lKTtcblx0XHRcdFx0XHRcdGNvbnN0IGJ1dHRvbnMgPSBbREVCVUdfQU5ZV0FZX0xBQkVMX05PX01FTU8sIEFCT1JUX0xBQkVMXTtcblx0XHRcdFx0XHRcdGNvbnN0IGNhbkNvbmZpZ3VyZSA9IHRhc2sgaW5zdGFuY2VvZiBDdXN0b21UYXNrIHx8IHRhc2sgaW5zdGFuY2VvZiBDb25maWd1cmluZ1Rhc2s7XG5cdFx0XHRcdFx0XHRpZiAoY2FuQ29uZmlndXJlKSB7XG5cdFx0XHRcdFx0XHRcdGJ1dHRvbnMuc3BsaWNlKDEsIDAsIG5scy5sb2NhbGl6ZSgnY29uZmlndXJlVGFzaycsIFwiQ29uZmlndXJlIFRhc2tcIikpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdFx0XHRcdHsgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLCB0aXRsZTogbWVzc2FnZSwgYnV0dG9ucyB9LFxuXHRcdFx0XHRcdFx0XHQoKSA9PiByZXN1bHQuY2F0Y2goKCkgPT4geyB9KSxcblx0XHRcdFx0XHRcdFx0KGNob2ljZSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChjaG9pY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gbm8tb3AsIGtlZXAgd2FpdGluZ1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoY2hvaWNlID09PSAwKSB7IC8vIGRlYnVnIGFueXdheVxuXHRcdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZSh7IGV4aXRDb2RlOiAwIH0pO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7IC8vIGFib3J0IG9yIGNvbmZpZ3VyZVxuXHRcdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZSh7IGV4aXRDb2RlOiB1bmRlZmluZWQsIGNhbmNlbGxlZDogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMudGFza1NlcnZpY2UudGVybWluYXRlKHRhc2spLmNhdGNoKCgpID0+IHsgfSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY2FuQ29uZmlndXJlICYmIGNob2ljZSA9PT0gMSkgeyAvLyBjb25maWd1cmVcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy50YXNrU2VydmljZS5vcGVuQ29uZmlnKHRhc2sgYXMgQ3VzdG9tVGFzayk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdH0sIDEwXzAwMCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzdWx0LmZpbmFsbHkoKCkgPT4gc3RvcmUuZGlzcG9zZSgpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUFvQztBQUM3QyxPQUFPLGNBQWM7QUFDckIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCLHNCQUFzQjtBQUMvQyxTQUFTLGtCQUFrQix3QkFBd0I7QUFDbkQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFFN0QsU0FBUyw0QkFBNEIsNkJBQTZCO0FBRWxFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixZQUErQyxxQkFBcUI7QUFDOUYsU0FBUyxvQkFBa0M7QUFDM0MsU0FBUyxxQkFBcUI7QUFFOUIsTUFBTSxhQUFhLENBQUMsT0FBMEIsV0FBdUMsTUFBTSxLQUFLLE1BQU0sT0FBTyxPQUFPLE1BQU0sQ0FBQztBQUVw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LElBQUksU0FBUyxrQkFBa0IscUlBQXFJLE9BQU8sV0FBVyxXQUFXLFNBQVMsS0FBSyxVQUFVLE1BQU0sQ0FBQztBQUNyUCxtQkFBTyxFQUFFLFVBQVUsU0FBUyxPQUFPLFNBQVMsYUFBYSxDQUFDO0FBQUEsVUFDM0Q7QUFBQSxRQUNELEdBQUcsUUFBUSxDQUFDO0FBRVosY0FBTSwyQkFBMkIsS0FBSyxxQkFBcUIsU0FBOEIsT0FBTyxFQUFFO0FBQ2xHLFlBQUksQ0FBQywwQkFBMEI7QUFFOUIsZ0JBQU0sSUFBSSxrQkFBa0IsTUFBTTtBQUNqQyxrQkFBTSxVQUFVLElBQUksU0FBUyxlQUFlLHNDQUFzQyxLQUFLLHdCQUF3QixJQUFJO0FBQ25ILGtCQUFNLFVBQVUsQ0FBQyw0QkFBNEIsV0FBVztBQUN4RCxrQkFBTSxlQUFlLGdCQUFnQixjQUFjLGdCQUFnQjtBQUNuRSxnQkFBSSxjQUFjO0FBQ2pCLHNCQUFRLE9BQU8sR0FBRyxHQUFHLElBQUksU0FBUyxpQkFBaUIsZ0JBQWdCLENBQUM7QUFBQSxZQUNyRTtBQUVBLGlCQUFLLGdCQUFnQjtBQUFBLGNBQ3BCLEVBQUUsVUFBVSxpQkFBaUIsY0FBYyxPQUFPLFNBQVMsUUFBUTtBQUFBLGNBQ25FLE1BQU0sT0FBTyxNQUFNLE1BQU07QUFBQSxjQUFFLENBQUM7QUFBQSxjQUM1QixDQUFDLFdBQVc7QUFDWCxvQkFBSSxXQUFXLFFBQVc7QUFBQSxnQkFFMUIsV0FBVyxXQUFXLEdBQUc7QUFDeEIsMEJBQVEsRUFBRSxVQUFVLEVBQUUsQ0FBQztBQUFBLGdCQUN4QixPQUFPO0FBQ04sMEJBQVEsRUFBRSxVQUFVLFFBQVcsV0FBVyxLQUFLLENBQUM7QUFDaEQsdUJBQUssWUFBWSxVQUFVLElBQUksRUFBRSxNQUFNLE1BQU07QUFBQSxrQkFBRSxDQUFDO0FBQ2hELHNCQUFJLGdCQUFnQixXQUFXLEdBQUc7QUFDakMseUJBQUssWUFBWSxXQUFXLElBQWtCO0FBQUEsa0JBQy9DO0FBQUEsZ0JBQ0Q7QUFBQSxjQUNEO0FBQUEsWUFDRDtBQUFBLFVBQ0QsR0FBRyxHQUFNLENBQUM7QUFBQSxRQUNYO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNILENBQUM7QUFFRCxXQUFPLE9BQU8sUUFBUSxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDNUM7QUFDRDtBQXhSYSxrQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFsiVGFza1J1blJlc3VsdCIsICJEZWJ1Z0Nob2ljZSIsICJyZXN1bHQiXQp9Cg==
