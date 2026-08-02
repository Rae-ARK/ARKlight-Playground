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
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ITaskService } from "../common/taskService.js";
import { CustomTask, ContributedTask, ConfiguringTask } from "../common/tasks.js";
import { TaskQuickPick } from "./taskQuickPick.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { isString } from "../../../../base/common/types.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
let TasksQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(extensionService, _taskService, _configurationService, _quickInputService, _notificationService, _dialogService, _themeService, _storageService) {
    super(TasksQuickAccessProvider.PREFIX, {
      noResultsPick: {
        label: localize("noTaskResults", "No matching tasks")
      }
    });
    this._taskService = _taskService;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._themeService = _themeService;
    this._storageService = _storageService;
  }
  async _getPicks(filter, disposables, token) {
    if (token.isCancellationRequested) {
      return [];
    }
    const taskQuickPick = new TaskQuickPick(this._taskService, this._configurationService, this._quickInputService, this._notificationService, this._themeService, this._dialogService, this._storageService);
    const topLevelPicks = await taskQuickPick.getTopLevelEntries();
    const taskPicks = [];
    for (const entry of topLevelPicks.entries) {
      const highlights = matchesFuzzy(filter, entry.label);
      if (!highlights) {
        continue;
      }
      if (entry.type === "separator") {
        taskPicks.push(entry);
      }
      const task = entry.task;
      const quickAccessEntry = entry;
      quickAccessEntry.highlights = { label: highlights };
      quickAccessEntry.trigger = (index) => {
        if (index === 1 && quickAccessEntry.buttons?.length === 2) {
          const key = task && !isString(task) ? task.getKey() : void 0;
          if (key) {
            this._taskService.removeRecentlyUsedTask(key);
          }
          return TriggerAction.REFRESH_PICKER;
        } else {
          if (ContributedTask.is(task)) {
            this._taskService.customize(task, void 0, true);
          } else if (CustomTask.is(task)) {
            this._taskService.openConfig(task);
          }
          return TriggerAction.CLOSE_PICKER;
        }
      };
      quickAccessEntry.accept = async () => {
        if (isString(task)) {
          const showResult = await taskQuickPick.show(localize("TaskService.pickRunTask", "Select the task to run"), void 0, task);
          if (showResult) {
            this._taskService.run(showResult, { attachProblemMatcher: true });
          }
        } else {
          this._taskService.run(await this._toTask(task), { attachProblemMatcher: true });
        }
      };
      taskPicks.push(quickAccessEntry);
    }
    return taskPicks;
  }
  async _toTask(task) {
    if (!ConfiguringTask.is(task)) {
      return task;
    }
    return this._taskService.tryResolveTask(task);
  }
};
TasksQuickAccessProvider.PREFIX = "task ";
TasksQuickAccessProvider = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, ITaskService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IStorageService)
], TasksQuickAccessProvider);
export {
  TasksQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2Jyb3dzZXIvdGFza3NRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tTZXBhcmF0b3IsIElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSwgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgVHJpZ2dlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9waWNrZXJRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzRnV6enkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJVGFza1NlcnZpY2UsIFRhc2sgfSBmcm9tICcuLi9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ3VzdG9tVGFzaywgQ29udHJpYnV0ZWRUYXNrLCBDb25maWd1cmluZ1Rhc2sgfSBmcm9tICcuLi9jb21tb24vdGFza3MuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRhc2tRdWlja1BpY2ssIElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSB9IGZyb20gJy4vdGFza1F1aWNrUGljay5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBUYXNrc1F1aWNrQWNjZXNzUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+IHtcblxuXHRzdGF0aWMgUFJFRklYID0gJ3Rhc2sgJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElUYXNrU2VydmljZSBwcml2YXRlIF90YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIF9kaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFRhc2tzUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVgsIHtcblx0XHRcdG5vUmVzdWx0c1BpY2s6IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdub1Rhc2tSZXN1bHRzJywgXCJObyBtYXRjaGluZyB0YXNrc1wiKVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBcnJheTxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4+IHtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrUXVpY2tQaWNrID0gbmV3IFRhc2tRdWlja1BpY2sodGhpcy5fdGFza1NlcnZpY2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9xdWlja0lucHV0U2VydmljZSwgdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSwgdGhpcy5fdGhlbWVTZXJ2aWNlLCB0aGlzLl9kaWFsb2dTZXJ2aWNlLCB0aGlzLl9zdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgdG9wTGV2ZWxQaWNrcyA9IGF3YWl0IHRhc2tRdWlja1BpY2suZ2V0VG9wTGV2ZWxFbnRyaWVzKCk7XG5cdFx0Y29uc3QgdGFza1BpY2tzOiBBcnJheTxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdG9wTGV2ZWxQaWNrcy5lbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBoaWdobGlnaHRzID0gbWF0Y2hlc0Z1enp5KGZpbHRlciwgZW50cnkubGFiZWwhKTtcblx0XHRcdGlmICghaGlnaGxpZ2h0cykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVudHJ5LnR5cGUgPT09ICdzZXBhcmF0b3InKSB7XG5cdFx0XHRcdHRhc2tQaWNrcy5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayB8IHN0cmluZyA9ICg8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PmVudHJ5KS50YXNrITtcblx0XHRcdGNvbnN0IHF1aWNrQWNjZXNzRW50cnk6IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gPSA8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PmVudHJ5O1xuXHRcdFx0cXVpY2tBY2Nlc3NFbnRyeS5oaWdobGlnaHRzID0geyBsYWJlbDogaGlnaGxpZ2h0cyB9O1xuXHRcdFx0cXVpY2tBY2Nlc3NFbnRyeS50cmlnZ2VyID0gKGluZGV4KSA9PiB7XG5cdFx0XHRcdGlmICgoaW5kZXggPT09IDEpICYmIChxdWlja0FjY2Vzc0VudHJ5LmJ1dHRvbnM/Lmxlbmd0aCA9PT0gMikpIHtcblx0XHRcdFx0XHRjb25zdCBrZXkgPSAodGFzayAmJiAhaXNTdHJpbmcodGFzaykpID8gdGFzay5nZXRLZXkoKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5yZW1vdmVSZWNlbnRseVVzZWRUYXNrKGtleSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLlJFRlJFU0hfUElDS0VSO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmIChDb250cmlidXRlZFRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLmN1c3RvbWl6ZSh0YXNrLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGFza1NlcnZpY2Uub3BlbkNvbmZpZyh0YXNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uQ0xPU0VfUElDS0VSO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0cXVpY2tBY2Nlc3NFbnRyeS5hY2NlcHQgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGlmIChpc1N0cmluZyh0YXNrKSkge1xuXHRcdFx0XHRcdC8vIHN3aXRjaCB0byBxdWljayBwaWNrIGFuZCBzaG93IHNlY29uZCBsZXZlbFxuXHRcdFx0XHRcdGNvbnN0IHNob3dSZXN1bHQgPSBhd2FpdCB0YXNrUXVpY2tQaWNrLnNob3cobG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnBpY2tSdW5UYXNrJywgJ1NlbGVjdCB0aGUgdGFzayB0byBydW4nKSwgdW5kZWZpbmVkLCB0YXNrKTtcblx0XHRcdFx0XHRpZiAoc2hvd1Jlc3VsdCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGFza1NlcnZpY2UucnVuKHNob3dSZXN1bHQsIHsgYXR0YWNoUHJvYmxlbU1hdGNoZXI6IHRydWUgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLnJ1bihhd2FpdCB0aGlzLl90b1Rhc2sodGFzayksIHsgYXR0YWNoUHJvYmxlbU1hdGNoZXI6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHRhc2tQaWNrcy5wdXNoKHF1aWNrQWNjZXNzRW50cnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFza1BpY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdG9UYXNrKHRhc2s6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2spOiBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIUNvbmZpZ3VyaW5nVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0cmV0dXJuIHRhc2s7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2tTZXJ2aWNlLnRyeVJlc29sdmVUYXNrKHRhc2spO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQThCLDBCQUEwQjtBQUN4RCxTQUFpQywyQkFBMkIscUJBQXFCO0FBQ2pGLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQTBCO0FBQ25DLFNBQVMsWUFBWSxpQkFBaUIsdUJBQXVCO0FBRzdELFNBQVMscUJBQWtEO0FBQzNELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBRXpCLElBQU0sMkJBQU4sY0FBdUMsMEJBQWtEO0FBQUEsRUFJL0YsWUFDb0Isa0JBQ0csY0FDUyx1QkFDSCxvQkFDRSxzQkFDTixnQkFDRCxlQUNFLGlCQUN4QjtBQUNELFVBQU0seUJBQXlCLFFBQVE7QUFBQSxNQUN0QyxlQUFlO0FBQUEsUUFDZCxPQUFPLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUFBLE1BQ3JEO0FBQUEsSUFDRCxDQUFDO0FBWnFCO0FBQ1M7QUFDSDtBQUNFO0FBQ047QUFDRDtBQUNFO0FBQUEsRUFPMUI7QUFBQSxFQUVBLE1BQWdCLFVBQVUsUUFBZ0IsYUFBOEIsT0FBd0Y7QUFDL0osUUFBSSxNQUFNLHlCQUF5QjtBQUNsQyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsVUFBTSxnQkFBZ0IsSUFBSSxjQUFjLEtBQUssY0FBYyxLQUFLLHVCQUF1QixLQUFLLG9CQUFvQixLQUFLLHNCQUFzQixLQUFLLGVBQWUsS0FBSyxnQkFBZ0IsS0FBSyxlQUFlO0FBQ3hNLFVBQU0sZ0JBQWdCLE1BQU0sY0FBYyxtQkFBbUI7QUFDN0QsVUFBTSxZQUFpRSxDQUFDO0FBRXhFLGVBQVcsU0FBUyxjQUFjLFNBQVM7QUFDMUMsWUFBTSxhQUFhLGFBQWEsUUFBUSxNQUFNLEtBQU07QUFDcEQsVUFBSSxDQUFDLFlBQVk7QUFDaEI7QUFBQSxNQUNEO0FBRUEsVUFBSSxNQUFNLFNBQVMsYUFBYTtBQUMvQixrQkFBVSxLQUFLLEtBQUs7QUFBQSxNQUNyQjtBQUVBLFlBQU0sT0FBc0UsTUFBTztBQUNuRixZQUFNLG1CQUF3RTtBQUM5RSx1QkFBaUIsYUFBYSxFQUFFLE9BQU8sV0FBVztBQUNsRCx1QkFBaUIsVUFBVSxDQUFDLFVBQVU7QUFDckMsWUFBSyxVQUFVLEtBQU8saUJBQWlCLFNBQVMsV0FBVyxHQUFJO0FBQzlELGdCQUFNLE1BQU8sUUFBUSxDQUFDLFNBQVMsSUFBSSxJQUFLLEtBQUssT0FBTyxJQUFJO0FBQ3hELGNBQUksS0FBSztBQUNSLGlCQUFLLGFBQWEsdUJBQXVCLEdBQUc7QUFBQSxVQUM3QztBQUNBLGlCQUFPLGNBQWM7QUFBQSxRQUN0QixPQUFPO0FBQ04sY0FBSSxnQkFBZ0IsR0FBRyxJQUFJLEdBQUc7QUFDN0IsaUJBQUssYUFBYSxVQUFVLE1BQU0sUUFBVyxJQUFJO0FBQUEsVUFDbEQsV0FBVyxXQUFXLEdBQUcsSUFBSSxHQUFHO0FBQy9CLGlCQUFLLGFBQWEsV0FBVyxJQUFJO0FBQUEsVUFDbEM7QUFDQSxpQkFBTyxjQUFjO0FBQUEsUUFDdEI7QUFBQSxNQUNEO0FBQ0EsdUJBQWlCLFNBQVMsWUFBWTtBQUNyQyxZQUFJLFNBQVMsSUFBSSxHQUFHO0FBRW5CLGdCQUFNLGFBQWEsTUFBTSxjQUFjLEtBQUssU0FBUywyQkFBMkIsd0JBQXdCLEdBQUcsUUFBVyxJQUFJO0FBQzFILGNBQUksWUFBWTtBQUNmLGlCQUFLLGFBQWEsSUFBSSxZQUFZLEVBQUUsc0JBQXNCLEtBQUssQ0FBQztBQUFBLFVBQ2pFO0FBQUEsUUFDRCxPQUFPO0FBQ04sZUFBSyxhQUFhLElBQUksTUFBTSxLQUFLLFFBQVEsSUFBSSxHQUFHLEVBQUUsc0JBQXNCLEtBQUssQ0FBQztBQUFBLFFBQy9FO0FBQUEsTUFDRDtBQUVBLGdCQUFVLEtBQUssZ0JBQWdCO0FBQUEsSUFDaEM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxRQUFRLE1BQXlEO0FBQzlFLFFBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLEdBQUc7QUFDOUIsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPLEtBQUssYUFBYSxlQUFlLElBQUk7QUFBQSxFQUM3QztBQUNEO0FBbkZhLHlCQUVMLFNBQVM7QUFGSiwyQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FaVTsiLAogICJuYW1lcyI6IFtdCn0K
