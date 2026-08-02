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
import * as Objects from "../../../../base/common/objects.js";
import { ContributedTask, CustomTask, ConfiguringTask } from "../common/tasks.js";
import * as Types from "../../../../base/common/types.js";
import { ITaskService } from "../common/taskService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { getColorClass, createColorStyleElement } from "../../terminal/browser/terminalIcon.js";
import { showWithPinnedItems } from "../../../../platform/quickinput/browser/quickPickPin.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
const QUICKOPEN_DETAIL_CONFIG = "task.quickOpen.detail";
const QUICKOPEN_SKIP_CONFIG = "task.quickOpen.skip";
function isWorkspaceFolder(folder) {
  return "uri" in folder;
}
const SHOW_ALL = nls.localize("taskQuickPick.showAll", "Show All Tasks...");
const configureTaskIcon = registerIcon("tasks-list-configure", Codicon.gear, nls.localize("configureTaskIcon", "Configuration icon in the tasks selection list."));
const removeTaskIcon = registerIcon("tasks-remove", Codicon.close, nls.localize("removeTaskIcon", "Icon for remove in the tasks selection list."));
const runTaskStorageKey = "runTaskStorageKey";
let TaskQuickPick = class extends Disposable {
  constructor(_taskService, _configurationService, _quickInputService, _notificationService, _themeService, _dialogService, _storageService) {
    super();
    this._taskService = _taskService;
    this._configurationService = _configurationService;
    this._quickInputService = _quickInputService;
    this._notificationService = _notificationService;
    this._themeService = _themeService;
    this._dialogService = _dialogService;
    this._storageService = _storageService;
    this._sorter = this._taskService.createSorter();
  }
  _showDetail() {
    return !!this._configurationService.getValue(QUICKOPEN_DETAIL_CONFIG);
  }
  _guessTaskLabel(task) {
    if (task._label) {
      return task._label;
    }
    if (ConfiguringTask.is(task)) {
      let label = task.configures.type;
      const configures = Objects.deepClone(task.configures);
      delete configures["_key"];
      delete configures["type"];
      Object.keys(configures).forEach((key) => label += `: ${configures[key]}`);
      return label;
    }
    return "";
  }
  static getTaskLabelWithIcon(task, labelGuess) {
    const label = labelGuess || task._label;
    const icon = task.configurationProperties.icon;
    if (!icon) {
      return `${label}`;
    }
    return icon.id ? `$(${icon.id}) ${label}` : `$(${Codicon.tools.id}) ${label}`;
  }
  static applyColorStyles(task, entry, themeService) {
    if (task.configurationProperties.icon?.color) {
      const colorTheme = themeService.getColorTheme();
      const disposable = createColorStyleElement(colorTheme);
      entry.iconClasses = [getColorClass(task.configurationProperties.icon.color)];
      return disposable;
    }
    return;
  }
  _createTaskEntry(task, extraButtons = []) {
    const buttons = [
      { iconClass: ThemeIcon.asClassName(configureTaskIcon), tooltip: nls.localize("configureTask", "Configure Task") },
      ...extraButtons
    ];
    const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task, this._guessTaskLabel(task)), description: this._taskService.getTaskDescription(task), task, detail: this._showDetail() ? task.configurationProperties.detail : void 0, buttons };
    const disposable = TaskQuickPick.applyColorStyles(task, entry, this._themeService);
    if (disposable) {
      this._register(disposable);
    }
    return entry;
  }
  _createEntriesForGroup(entries, tasks, groupLabel, extraButtons = []) {
    entries.push({ type: "separator", label: groupLabel });
    tasks.forEach((task) => {
      if (!task.configurationProperties.hide) {
        entries.push(this._createTaskEntry(task, extraButtons));
      }
    });
  }
  _createTypeEntries(entries, types) {
    entries.push({ type: "separator", label: nls.localize("contributedTasks", "contributed") });
    types.forEach((type) => {
      entries.push({ label: `$(folder) ${type}`, task: type, ariaLabel: nls.localize("taskType", "All {0} tasks", type) });
    });
    entries.push({ label: SHOW_ALL, task: SHOW_ALL, alwaysShow: true });
  }
  _handleFolderTaskResult(result) {
    const tasks = [];
    Array.from(result).forEach(([key, folderTasks]) => {
      if (folderTasks.set) {
        tasks.push(...folderTasks.set.tasks);
      }
      if (folderTasks.configurations) {
        for (const configuration in folderTasks.configurations.byIdentifier) {
          tasks.push(folderTasks.configurations.byIdentifier[configuration]);
        }
      }
    });
    return tasks;
  }
  _dedupeConfiguredAndRecent(recentTasks, configuredTasks) {
    let dedupedConfiguredTasks = [];
    const foundRecentTasks = Array(recentTasks.length).fill(false);
    for (let j = 0; j < configuredTasks.length; j++) {
      const workspaceFolder = configuredTasks[j].getWorkspaceFolder()?.uri.toString();
      const definition = configuredTasks[j].getDefinition()?._key;
      const type = configuredTasks[j].type;
      const label = configuredTasks[j]._label;
      const recentKey = configuredTasks[j].getKey();
      const findIndex = recentTasks.findIndex((value) => {
        return workspaceFolder && definition && value.getWorkspaceFolder()?.uri.toString() === workspaceFolder && (value.getDefinition()?._key === definition || value.type === type && value._label === label) || recentKey && value.getKey() === recentKey;
      });
      if (findIndex === -1) {
        dedupedConfiguredTasks.push(configuredTasks[j]);
      } else {
        recentTasks[findIndex] = configuredTasks[j];
        foundRecentTasks[findIndex] = true;
      }
    }
    dedupedConfiguredTasks = dedupedConfiguredTasks.sort((a, b) => this._sorter.compare(a, b));
    const prunedRecentTasks = [];
    for (let i = 0; i < recentTasks.length; i++) {
      if (foundRecentTasks[i] || ConfiguringTask.is(recentTasks[i])) {
        prunedRecentTasks.push(recentTasks[i]);
      }
    }
    return { configuredTasks: dedupedConfiguredTasks, recentTasks: prunedRecentTasks };
  }
  async getTopLevelEntries(defaultEntry) {
    if (this._topLevelEntries !== void 0) {
      return { entries: this._topLevelEntries };
    }
    let recentTasks = (await this._taskService.getSavedTasks("historical")).reverse();
    const configuredTasks = this._handleFolderTaskResult(await this._taskService.getWorkspaceTasks());
    const extensionTaskTypes = this._taskService.taskTypes();
    this._topLevelEntries = [];
    const dedupeAndPrune = this._dedupeConfiguredAndRecent(recentTasks, configuredTasks);
    const dedupedConfiguredTasks = dedupeAndPrune.configuredTasks;
    recentTasks = dedupeAndPrune.recentTasks;
    if (recentTasks.length > 0) {
      const removeRecentButton = {
        iconClass: ThemeIcon.asClassName(removeTaskIcon),
        tooltip: nls.localize("removeRecent", "Remove Recently Used Task")
      };
      this._createEntriesForGroup(this._topLevelEntries, recentTasks, nls.localize("recentlyUsed", "recently used"), [removeRecentButton]);
    }
    if (configuredTasks.length > 0) {
      if (dedupedConfiguredTasks.length > 0) {
        this._createEntriesForGroup(this._topLevelEntries, dedupedConfiguredTasks, nls.localize("configured", "configured"));
      }
    }
    if (defaultEntry && configuredTasks.length === 0) {
      this._topLevelEntries.push({ type: "separator", label: nls.localize("configured", "configured") });
      this._topLevelEntries.push(defaultEntry);
    }
    if (extensionTaskTypes.length > 0) {
      this._createTypeEntries(this._topLevelEntries, extensionTaskTypes);
    }
    return { entries: this._topLevelEntries, isSingleConfigured: configuredTasks.length === 1 ? configuredTasks[0] : void 0 };
  }
  async handleSettingOption(selectedType) {
    const { confirmed } = await this._dialogService.confirm({
      type: Severity.Warning,
      message: nls.localize(
        "TaskQuickPick.changeSettingDetails",
        "Task detection for {0} tasks causes files in any workspace you open to be run as code. Enabling {0} task detection is a user setting and will apply to any workspace you open. \n\n Do you want to enable {0} task detection for all workspaces?",
        selectedType
      ),
      cancelButton: nls.localize("TaskQuickPick.changeSettingNo", "No")
    });
    if (confirmed) {
      await this._configurationService.updateValue(`${selectedType}.autoDetect`, "on");
      await new Promise((resolve) => setTimeout(() => resolve(), 100));
      return this.show(nls.localize("TaskService.pickRunTask", "Select the task to run"), void 0, selectedType);
    }
    return void 0;
  }
  async show(placeHolder, defaultEntry, startAtType, name) {
    const disposables = new DisposableStore();
    const picker = disposables.add(this._quickInputService.createQuickPick({ useSeparators: true }));
    picker.placeholder = placeHolder;
    picker.matchOnDescription = true;
    picker.ignoreFocusOut = false;
    disposables.add(picker.onDidTriggerItemButton(async (context) => {
      const task = context.item.task;
      if (context.button.iconClass === ThemeIcon.asClassName(removeTaskIcon)) {
        const key = task && !Types.isString(task) ? task.getKey() : void 0;
        if (key) {
          this._taskService.removeRecentlyUsedTask(key);
        }
        const indexToRemove = picker.items.indexOf(context.item);
        if (indexToRemove >= 0) {
          picker.items = [...picker.items.slice(0, indexToRemove), ...picker.items.slice(indexToRemove + 1)];
        }
      } else if (context.button.iconClass === ThemeIcon.asClassName(configureTaskIcon)) {
        this._quickInputService.cancel();
        if (ContributedTask.is(task)) {
          this._taskService.customize(task, void 0, true);
        } else if (CustomTask.is(task) || ConfiguringTask.is(task)) {
          let canOpenConfig = false;
          try {
            canOpenConfig = await this._taskService.openConfig(task);
          } catch (e) {
          }
          if (!canOpenConfig) {
            this._taskService.customize(task, void 0, true);
          }
        }
      }
    }));
    if (name) {
      picker.value = name;
    }
    let firstLevelTask = startAtType;
    if (!firstLevelTask) {
      const topLevelEntriesResult = await this.getTopLevelEntries(defaultEntry);
      if (topLevelEntriesResult.isSingleConfigured && this._configurationService.getValue(QUICKOPEN_SKIP_CONFIG)) {
        disposables.dispose();
        return this._toTask(topLevelEntriesResult.isSingleConfigured);
      }
      const taskQuickPickEntries = topLevelEntriesResult.entries;
      firstLevelTask = await this._doPickerFirstLevel(picker, taskQuickPickEntries, disposables);
    }
    do {
      if (Types.isString(firstLevelTask)) {
        if (name) {
          await this._doPickerFirstLevel(picker, (await this.getTopLevelEntries(defaultEntry)).entries, disposables);
          disposables.dispose();
          return void 0;
        }
        const selectedEntry = await this.doPickerSecondLevel(picker, disposables, firstLevelTask);
        if (selectedEntry && !selectedEntry.settingType && selectedEntry.task === null) {
          picker.value = "";
          firstLevelTask = await this._doPickerFirstLevel(picker, (await this.getTopLevelEntries(defaultEntry)).entries, disposables);
        } else if (selectedEntry && Types.isString(selectedEntry.settingType)) {
          disposables.dispose();
          return this.handleSettingOption(selectedEntry.settingType);
        } else {
          disposables.dispose();
          return selectedEntry?.task && !Types.isString(selectedEntry?.task) ? this._toTask(selectedEntry?.task) : void 0;
        }
      } else if (firstLevelTask) {
        disposables.dispose();
        return this._toTask(firstLevelTask);
      } else {
        disposables.dispose();
        return firstLevelTask;
      }
    } while (1);
    return;
  }
  async _doPickerFirstLevel(picker, taskQuickPickEntries, disposables) {
    picker.items = taskQuickPickEntries;
    disposables.add(showWithPinnedItems(this._storageService, runTaskStorageKey, picker, true));
    const firstLevelPickerResult = await new Promise((resolve) => {
      disposables.add(Event.once(picker.onDidAccept)(async () => {
        resolve(picker.selectedItems ? picker.selectedItems[0] : void 0);
      }));
    });
    return firstLevelPickerResult?.task;
  }
  async doPickerSecondLevel(picker, disposables, type, name) {
    picker.busy = true;
    if (type === SHOW_ALL) {
      const items = (await this._taskService.tasks()).filter((t) => !t.configurationProperties.hide).sort((a, b) => this._sorter.compare(a, b)).map((task) => this._createTaskEntry(task));
      items.push(...TaskQuickPick.allSettingEntries(this._configurationService));
      picker.items = items;
    } else {
      picker.value = name || "";
      picker.items = await this._getEntriesForProvider(type);
    }
    await picker.show();
    picker.busy = false;
    const secondLevelPickerResult = await new Promise((resolve) => {
      disposables.add(Event.once(picker.onDidAccept)(async () => {
        resolve(picker.selectedItems ? picker.selectedItems[0] : void 0);
      }));
    });
    return secondLevelPickerResult;
  }
  static allSettingEntries(configurationService) {
    const entries = [];
    const gruntEntry = TaskQuickPick.getSettingEntry(configurationService, "grunt");
    if (gruntEntry) {
      entries.push(gruntEntry);
    }
    const gulpEntry = TaskQuickPick.getSettingEntry(configurationService, "gulp");
    if (gulpEntry) {
      entries.push(gulpEntry);
    }
    const jakeEntry = TaskQuickPick.getSettingEntry(configurationService, "jake");
    if (jakeEntry) {
      entries.push(jakeEntry);
    }
    return entries;
  }
  static getSettingEntry(configurationService, type) {
    if (configurationService.getValue(`${type}.autoDetect`) === "off") {
      return {
        label: "$(gear) " + nls.localize(
          "TaskQuickPick.changeSettingsOptions",
          "{0} task detection is turned off. Enable {1} task detection...",
          type[0].toUpperCase() + type.slice(1),
          type
        ),
        task: null,
        settingType: type,
        alwaysShow: true
      };
    }
    return void 0;
  }
  async _getEntriesForProvider(type) {
    const tasks = (await this._taskService.tasks({ type })).sort((a, b) => this._sorter.compare(a, b));
    let taskQuickPickEntries = [];
    if (tasks.length > 0) {
      for (const task of tasks) {
        if (!task.configurationProperties.hide) {
          taskQuickPickEntries.push(this._createTaskEntry(task));
        }
      }
      taskQuickPickEntries.push({
        type: "separator"
      }, {
        label: nls.localize("TaskQuickPick.goBack", "Go back \u21A9"),
        task: null,
        alwaysShow: true
      });
    } else {
      taskQuickPickEntries = [{
        label: nls.localize("TaskQuickPick.noTasksForType", "No {0} tasks found. Go back \u21A9", type),
        task: null,
        alwaysShow: true
      }];
    }
    const settingEntry = TaskQuickPick.getSettingEntry(this._configurationService, type);
    if (settingEntry) {
      taskQuickPickEntries.push(settingEntry);
    }
    return taskQuickPickEntries;
  }
  async _toTask(task) {
    if (!ConfiguringTask.is(task)) {
      return task;
    }
    const resolvedTask = await this._taskService.tryResolveTask(task);
    if (!resolvedTask) {
      this._notificationService.error(nls.localize("noProviderForTask", 'There is no task provider registered for tasks of type "{0}".', task.type));
    }
    return resolvedTask;
  }
};
TaskQuickPick = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IStorageService)
], TaskQuickPick);
export {
  QUICKOPEN_DETAIL_CONFIG,
  QUICKOPEN_SKIP_CONFIG,
  TaskQuickPick,
  configureTaskIcon,
  isWorkspaceFolder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2Jyb3dzZXIvdGFza1F1aWNrUGljay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgT2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFRhc2ssIENvbnRyaWJ1dGVkVGFzaywgQ3VzdG9tVGFzaywgQ29uZmlndXJpbmdUYXNrLCBUYXNrU29ydGVyLCBLZXllZFRhc2tJZGVudGlmaWVyIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJVGFza1NlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCwgSVF1aWNrUGljaywgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBnZXRDb2xvckNsYXNzLCBjcmVhdGVDb2xvclN0eWxlRWxlbWVudCB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxJY29uLmpzJztcbmltcG9ydCB7IFRhc2tRdWlja1BpY2tFbnRyeVR5cGUgfSBmcm9tICcuL2Fic3RyYWN0VGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2hvd1dpdGhQaW5uZWRJdGVtcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9xdWlja1BpY2tQaW4uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBRVUlDS09QRU5fREVUQUlMX0NPTkZJRyA9ICd0YXNrLnF1aWNrT3Blbi5kZXRhaWwnO1xuZXhwb3J0IGNvbnN0IFFVSUNLT1BFTl9TS0lQX0NPTkZJRyA9ICd0YXNrLnF1aWNrT3Blbi5za2lwJztcbmV4cG9ydCBmdW5jdGlvbiBpc1dvcmtzcGFjZUZvbGRlcihmb2xkZXI6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyKTogZm9sZGVyIGlzIElXb3Jrc3BhY2VGb2xkZXIge1xuXHRyZXR1cm4gJ3VyaScgaW4gZm9sZGVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUXVpY2tQaWNrRW50cnkgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0dGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayB8IHN0cmluZyB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdHNldHRpbmdUeXBlPzogc3RyaW5nO1xufVxuXG5jb25zdCBTSE9XX0FMTDogc3RyaW5nID0gbmxzLmxvY2FsaXplKCd0YXNrUXVpY2tQaWNrLnNob3dBbGwnLCBcIlNob3cgQWxsIFRhc2tzLi4uXCIpO1xuXG5leHBvcnQgY29uc3QgY29uZmlndXJlVGFza0ljb24gPSByZWdpc3Rlckljb24oJ3Rhc2tzLWxpc3QtY29uZmlndXJlJywgQ29kaWNvbi5nZWFyLCBubHMubG9jYWxpemUoJ2NvbmZpZ3VyZVRhc2tJY29uJywgJ0NvbmZpZ3VyYXRpb24gaWNvbiBpbiB0aGUgdGFza3Mgc2VsZWN0aW9uIGxpc3QuJykpO1xuY29uc3QgcmVtb3ZlVGFza0ljb24gPSByZWdpc3Rlckljb24oJ3Rhc2tzLXJlbW92ZScsIENvZGljb24uY2xvc2UsIG5scy5sb2NhbGl6ZSgncmVtb3ZlVGFza0ljb24nLCAnSWNvbiBmb3IgcmVtb3ZlIGluIHRoZSB0YXNrcyBzZWxlY3Rpb24gbGlzdC4nKSk7XG5cbmNvbnN0IHJ1blRhc2tTdG9yYWdlS2V5ID0gJ3J1blRhc2tTdG9yYWdlS2V5JztcblxuZXhwb3J0IGNsYXNzIFRhc2tRdWlja1BpY2sgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfc29ydGVyOiBUYXNrU29ydGVyO1xuXHRwcml2YXRlIF90b3BMZXZlbEVudHJpZXM6IFF1aWNrUGlja0lucHV0PElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeT5bXSB8IHVuZGVmaW5lZDtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElUYXNrU2VydmljZSBwcml2YXRlIF90YXNrU2VydmljZTogSVRhc2tTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zb3J0ZXIgPSB0aGlzLl90YXNrU2VydmljZS5jcmVhdGVTb3J0ZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dEZXRhaWwoKTogYm9vbGVhbiB7XG5cdFx0Ly8gRW5zdXJlIGludmFsaWQgdmFsdWVzIGdldCBjb252ZXJ0ZWQgaW50byBib29sZWFuIHZhbHVlc1xuXHRcdHJldHVybiAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFFVSUNLT1BFTl9ERVRBSUxfQ09ORklHKTtcblx0fVxuXG5cdHByaXZhdGUgX2d1ZXNzVGFza0xhYmVsKHRhc2s6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2spOiBzdHJpbmcge1xuXHRcdGlmICh0YXNrLl9sYWJlbCkge1xuXHRcdFx0cmV0dXJuIHRhc2suX2xhYmVsO1xuXHRcdH1cblx0XHRpZiAoQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRsZXQgbGFiZWw6IHN0cmluZyA9IHRhc2suY29uZmlndXJlcy50eXBlO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlczogUGFydGlhbDxLZXllZFRhc2tJZGVudGlmaWVyPiA9IE9iamVjdHMuZGVlcENsb25lKHRhc2suY29uZmlndXJlcyk7XG5cdFx0XHRkZWxldGUgY29uZmlndXJlc1snX2tleSddO1xuXHRcdFx0ZGVsZXRlIGNvbmZpZ3VyZXNbJ3R5cGUnXTtcblx0XHRcdE9iamVjdC5rZXlzKGNvbmZpZ3VyZXMpLmZvckVhY2goa2V5ID0+IGxhYmVsICs9IGA6ICR7Y29uZmlndXJlc1trZXldfWApO1xuXHRcdFx0cmV0dXJuIGxhYmVsO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldFRhc2tMYWJlbFdpdGhJY29uKHRhc2s6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2ssIGxhYmVsR3Vlc3M/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGxhYmVsID0gbGFiZWxHdWVzcyB8fCB0YXNrLl9sYWJlbDtcblx0XHRjb25zdCBpY29uID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uO1xuXHRcdGlmICghaWNvbikge1xuXHRcdFx0cmV0dXJuIGAke2xhYmVsfWA7XG5cdFx0fVxuXHRcdHJldHVybiBpY29uLmlkID8gYCQoJHtpY29uLmlkfSkgJHtsYWJlbH1gIDogYCQoJHtDb2RpY29uLnRvb2xzLmlkfSkgJHtsYWJlbH1gO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBhcHBseUNvbG9yU3R5bGVzKHRhc2s6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2ssIGVudHJ5OiBUYXNrUXVpY2tQaWNrRW50cnlUeXBlIHwgSVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5LCB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UpOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbj8uY29sb3IpIHtcblx0XHRcdGNvbnN0IGNvbG9yVGhlbWUgPSB0aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGNyZWF0ZUNvbG9yU3R5bGVFbGVtZW50KGNvbG9yVGhlbWUpO1xuXHRcdFx0ZW50cnkuaWNvbkNsYXNzZXMgPSBbZ2V0Q29sb3JDbGFzcyh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24uY29sb3IpXTtcblx0XHRcdHJldHVybiBkaXNwb3NhYmxlO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUYXNrRW50cnkodGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzaywgZXh0cmFCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW10pOiBJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnkge1xuXHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXG5cdFx0XHR7IGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGNvbmZpZ3VyZVRhc2tJY29uKSwgdG9vbHRpcDogbmxzLmxvY2FsaXplKCdjb25maWd1cmVUYXNrJywgXCJDb25maWd1cmUgVGFza1wiKSB9LFxuXHRcdFx0Li4uZXh0cmFCdXR0b25zXG5cdFx0XTtcblx0XHRjb25zdCBlbnRyeTogSVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5ID0geyBsYWJlbDogVGFza1F1aWNrUGljay5nZXRUYXNrTGFiZWxXaXRoSWNvbih0YXNrLCB0aGlzLl9ndWVzc1Rhc2tMYWJlbCh0YXNrKSksIGRlc2NyaXB0aW9uOiB0aGlzLl90YXNrU2VydmljZS5nZXRUYXNrRGVzY3JpcHRpb24odGFzayksIHRhc2ssIGRldGFpbDogdGhpcy5fc2hvd0RldGFpbCgpID8gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXRhaWwgOiB1bmRlZmluZWQsIGJ1dHRvbnMgfTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gVGFza1F1aWNrUGljay5hcHBseUNvbG9yU3R5bGVzKHRhc2ssIGVudHJ5LCB0aGlzLl90aGVtZVNlcnZpY2UpO1xuXHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRW50cmllc0Zvckdyb3VwKGVudHJpZXM6IFF1aWNrUGlja0lucHV0PElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeT5bXSwgdGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdLFxuXHRcdGdyb3VwTGFiZWw6IHN0cmluZywgZXh0cmFCdXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW10pIHtcblx0XHRlbnRyaWVzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGdyb3VwTGFiZWwgfSk7XG5cdFx0dGFza3MuZm9yRWFjaCh0YXNrID0+IHtcblx0XHRcdGlmICghdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5oaWRlKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh0aGlzLl9jcmVhdGVUYXNrRW50cnkodGFzaywgZXh0cmFCdXR0b25zKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVUeXBlRW50cmllcyhlbnRyaWVzOiBRdWlja1BpY2tJbnB1dDxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnk+W10sIHR5cGVzOiBzdHJpbmdbXSkge1xuXHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCdjb250cmlidXRlZFRhc2tzJywgXCJjb250cmlidXRlZFwiKSB9KTtcblx0XHR0eXBlcy5mb3JFYWNoKHR5cGUgPT4ge1xuXHRcdFx0ZW50cmllcy5wdXNoKHsgbGFiZWw6IGAkKGZvbGRlcikgJHt0eXBlfWAsIHRhc2s6IHR5cGUsIGFyaWFMYWJlbDogbmxzLmxvY2FsaXplKCd0YXNrVHlwZScsIFwiQWxsIHswfSB0YXNrc1wiLCB0eXBlKSB9KTtcblx0XHR9KTtcblx0XHRlbnRyaWVzLnB1c2goeyBsYWJlbDogU0hPV19BTEwsIHRhc2s6IFNIT1dfQUxMLCBhbHdheXNTaG93OiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlRm9sZGVyVGFza1Jlc3VsdChyZXN1bHQ6IE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0Pik6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdIHtcblx0XHRjb25zdCB0YXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10gPSBbXTtcblx0XHRBcnJheS5mcm9tKHJlc3VsdCkuZm9yRWFjaCgoW2tleSwgZm9sZGVyVGFza3NdKSA9PiB7XG5cdFx0XHRpZiAoZm9sZGVyVGFza3Muc2V0KSB7XG5cdFx0XHRcdHRhc2tzLnB1c2goLi4uZm9sZGVyVGFza3Muc2V0LnRhc2tzKTtcblx0XHRcdH1cblx0XHRcdGlmIChmb2xkZXJUYXNrcy5jb25maWd1cmF0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbmZpZ3VyYXRpb24gaW4gZm9sZGVyVGFza3MuY29uZmlndXJhdGlvbnMuYnlJZGVudGlmaWVyKSB7XG5cdFx0XHRcdFx0dGFza3MucHVzaChmb2xkZXJUYXNrcy5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXJbY29uZmlndXJhdGlvbl0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRhc2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGVkdXBlQ29uZmlndXJlZEFuZFJlY2VudChyZWNlbnRUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10sIGNvbmZpZ3VyZWRUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10pOiB7IGNvbmZpZ3VyZWRUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW107IHJlY2VudFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSB9IHtcblx0XHRsZXQgZGVkdXBlZENvbmZpZ3VyZWRUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10gPSBbXTtcblx0XHRjb25zdCBmb3VuZFJlY2VudFRhc2tzOiBib29sZWFuW10gPSBBcnJheShyZWNlbnRUYXNrcy5sZW5ndGgpLmZpbGwoZmFsc2UpO1xuXHRcdGZvciAobGV0IGogPSAwOyBqIDwgY29uZmlndXJlZFRhc2tzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSBjb25maWd1cmVkVGFza3Nbal0uZ2V0V29ya3NwYWNlRm9sZGVyKCk/LnVyaS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmaW5pdGlvbiA9IGNvbmZpZ3VyZWRUYXNrc1tqXS5nZXREZWZpbml0aW9uKCk/Ll9rZXk7XG5cdFx0XHRjb25zdCB0eXBlID0gY29uZmlndXJlZFRhc2tzW2pdLnR5cGU7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGNvbmZpZ3VyZWRUYXNrc1tqXS5fbGFiZWw7XG5cdFx0XHRjb25zdCByZWNlbnRLZXkgPSBjb25maWd1cmVkVGFza3Nbal0uZ2V0S2V5KCk7XG5cdFx0XHRjb25zdCBmaW5kSW5kZXggPSByZWNlbnRUYXNrcy5maW5kSW5kZXgoKHZhbHVlKSA9PiB7XG5cdFx0XHRcdHJldHVybiAod29ya3NwYWNlRm9sZGVyICYmIGRlZmluaXRpb24gJiYgdmFsdWUuZ2V0V29ya3NwYWNlRm9sZGVyKCk/LnVyaS50b1N0cmluZygpID09PSB3b3Jrc3BhY2VGb2xkZXJcblx0XHRcdFx0XHQmJiAoKHZhbHVlLmdldERlZmluaXRpb24oKT8uX2tleSA9PT0gZGVmaW5pdGlvbikgfHwgKHZhbHVlLnR5cGUgPT09IHR5cGUgJiYgdmFsdWUuX2xhYmVsID09PSBsYWJlbCkpKVxuXHRcdFx0XHRcdHx8IChyZWNlbnRLZXkgJiYgdmFsdWUuZ2V0S2V5KCkgPT09IHJlY2VudEtleSk7XG5cdFx0XHR9KTtcblx0XHRcdGlmIChmaW5kSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdGRlZHVwZWRDb25maWd1cmVkVGFza3MucHVzaChjb25maWd1cmVkVGFza3Nbal0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVjZW50VGFza3NbZmluZEluZGV4XSA9IGNvbmZpZ3VyZWRUYXNrc1tqXTtcblx0XHRcdFx0Zm91bmRSZWNlbnRUYXNrc1tmaW5kSW5kZXhdID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0ZGVkdXBlZENvbmZpZ3VyZWRUYXNrcyA9IGRlZHVwZWRDb25maWd1cmVkVGFza3Muc29ydCgoYSwgYikgPT4gdGhpcy5fc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGNvbnN0IHBydW5lZFJlY2VudFRhc2tzOiAoVGFzayB8IENvbmZpZ3VyaW5nVGFzaylbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVjZW50VGFza3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChmb3VuZFJlY2VudFRhc2tzW2ldIHx8IENvbmZpZ3VyaW5nVGFzay5pcyhyZWNlbnRUYXNrc1tpXSkpIHtcblx0XHRcdFx0cHJ1bmVkUmVjZW50VGFza3MucHVzaChyZWNlbnRUYXNrc1tpXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGNvbmZpZ3VyZWRUYXNrczogZGVkdXBlZENvbmZpZ3VyZWRUYXNrcywgcmVjZW50VGFza3M6IHBydW5lZFJlY2VudFRhc2tzIH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0VG9wTGV2ZWxFbnRyaWVzKGRlZmF1bHRFbnRyeT86IElUYXNrUXVpY2tQaWNrRW50cnkpOiBQcm9taXNlPHsgZW50cmllczogUXVpY2tQaWNrSW5wdXQ8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PltdOyBpc1NpbmdsZUNvbmZpZ3VyZWQ/OiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrIH0+IHtcblx0XHRpZiAodGhpcy5fdG9wTGV2ZWxFbnRyaWVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7IGVudHJpZXM6IHRoaXMuX3RvcExldmVsRW50cmllcyB9O1xuXHRcdH1cblx0XHRsZXQgcmVjZW50VGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdID0gKGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLmdldFNhdmVkVGFza3MoJ2hpc3RvcmljYWwnKSkucmV2ZXJzZSgpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyZWRUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10gPSB0aGlzLl9oYW5kbGVGb2xkZXJUYXNrUmVzdWx0KGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLmdldFdvcmtzcGFjZVRhc2tzKCkpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblRhc2tUeXBlcyA9IHRoaXMuX3Rhc2tTZXJ2aWNlLnRhc2tUeXBlcygpO1xuXHRcdHRoaXMuX3RvcExldmVsRW50cmllcyA9IFtdO1xuXHRcdC8vIERlZHVwZSB3aWxsIHVwZGF0ZSByZWNlbnQgdGFza3MgaWYgdGhleSd2ZSBjaGFuZ2VkIGluIHRhc2tzLmpzb24uXG5cdFx0Y29uc3QgZGVkdXBlQW5kUHJ1bmUgPSB0aGlzLl9kZWR1cGVDb25maWd1cmVkQW5kUmVjZW50KHJlY2VudFRhc2tzLCBjb25maWd1cmVkVGFza3MpO1xuXHRcdGNvbnN0IGRlZHVwZWRDb25maWd1cmVkVGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdID0gZGVkdXBlQW5kUHJ1bmUuY29uZmlndXJlZFRhc2tzO1xuXHRcdHJlY2VudFRhc2tzID0gZGVkdXBlQW5kUHJ1bmUucmVjZW50VGFza3M7XG5cdFx0aWYgKHJlY2VudFRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHJlbW92ZVJlY2VudEJ1dHRvbjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdFx0XHRcdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHJlbW92ZVRhc2tJY29uKSxcblx0XHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdyZW1vdmVSZWNlbnQnLCAnUmVtb3ZlIFJlY2VudGx5IFVzZWQgVGFzaycpXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fY3JlYXRlRW50cmllc0Zvckdyb3VwKHRoaXMuX3RvcExldmVsRW50cmllcywgcmVjZW50VGFza3MsIG5scy5sb2NhbGl6ZSgncmVjZW50bHlVc2VkJywgJ3JlY2VudGx5IHVzZWQnKSwgW3JlbW92ZVJlY2VudEJ1dHRvbl0pO1xuXHRcdH1cblx0XHRpZiAoY29uZmlndXJlZFRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdGlmIChkZWR1cGVkQ29uZmlndXJlZFRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fY3JlYXRlRW50cmllc0Zvckdyb3VwKHRoaXMuX3RvcExldmVsRW50cmllcywgZGVkdXBlZENvbmZpZ3VyZWRUYXNrcywgbmxzLmxvY2FsaXplKCdjb25maWd1cmVkJywgJ2NvbmZpZ3VyZWQnKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGRlZmF1bHRFbnRyeSAmJiAoY29uZmlndXJlZFRhc2tzLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdHRoaXMuX3RvcExldmVsRW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBubHMubG9jYWxpemUoJ2NvbmZpZ3VyZWQnLCAnY29uZmlndXJlZCcpIH0pO1xuXHRcdFx0dGhpcy5fdG9wTGV2ZWxFbnRyaWVzLnB1c2goZGVmYXVsdEVudHJ5KTtcblx0XHR9XG5cblx0XHRpZiAoZXh0ZW5zaW9uVGFza1R5cGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX2NyZWF0ZVR5cGVFbnRyaWVzKHRoaXMuX3RvcExldmVsRW50cmllcywgZXh0ZW5zaW9uVGFza1R5cGVzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZW50cmllczogdGhpcy5fdG9wTGV2ZWxFbnRyaWVzLCBpc1NpbmdsZUNvbmZpZ3VyZWQ6IGNvbmZpZ3VyZWRUYXNrcy5sZW5ndGggPT09IDEgPyBjb25maWd1cmVkVGFza3NbMF0gOiB1bmRlZmluZWQgfTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBoYW5kbGVTZXR0aW5nT3B0aW9uKHNlbGVjdGVkVHlwZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdUYXNrUXVpY2tQaWNrLmNoYW5nZVNldHRpbmdEZXRhaWxzJyxcblx0XHRcdFx0XCJUYXNrIGRldGVjdGlvbiBmb3IgezB9IHRhc2tzIGNhdXNlcyBmaWxlcyBpbiBhbnkgd29ya3NwYWNlIHlvdSBvcGVuIHRvIGJlIHJ1biBhcyBjb2RlLiBFbmFibGluZyB7MH0gdGFzayBkZXRlY3Rpb24gaXMgYSB1c2VyIHNldHRpbmcgYW5kIHdpbGwgYXBwbHkgdG8gYW55IHdvcmtzcGFjZSB5b3Ugb3Blbi4gXFxuXFxuIERvIHlvdSB3YW50IHRvIGVuYWJsZSB7MH0gdGFzayBkZXRlY3Rpb24gZm9yIGFsbCB3b3Jrc3BhY2VzP1wiLCBzZWxlY3RlZFR5cGUpLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiBubHMubG9jYWxpemUoJ1Rhc2tRdWlja1BpY2suY2hhbmdlU2V0dGluZ05vJywgXCJOb1wiKVxuXHRcdH0pO1xuXHRcdGlmIChjb25maXJtZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGAke3NlbGVjdGVkVHlwZX0uYXV0b0RldGVjdGAsICdvbicpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KCgpID0+IHJlc29sdmUoKSwgMTAwKSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5zaG93KG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja1J1blRhc2snLCAnU2VsZWN0IHRoZSB0YXNrIHRvIHJ1bicpLCB1bmRlZmluZWQsIHNlbGVjdGVkVHlwZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2hvdyhwbGFjZUhvbGRlcjogc3RyaW5nLCBkZWZhdWx0RW50cnk/OiBJVGFza1F1aWNrUGlja0VudHJ5LCBzdGFydEF0VHlwZT86IHN0cmluZywgbmFtZT86IHN0cmluZyk6IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZCB8IG51bGw+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBwaWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQodGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY3JlYXRlUXVpY2tQaWNrPElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblx0XHRwaWNrZXIucGxhY2Vob2xkZXIgPSBwbGFjZUhvbGRlcjtcblx0XHRwaWNrZXIubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblx0XHRwaWNrZXIuaWdub3JlRm9jdXNPdXQgPSBmYWxzZTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oYXN5bmMgKGNvbnRleHQpID0+IHtcblx0XHRcdGNvbnN0IHRhc2sgPSBjb250ZXh0Lml0ZW0udGFzaztcblx0XHRcdGlmIChjb250ZXh0LmJ1dHRvbi5pY29uQ2xhc3MgPT09IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShyZW1vdmVUYXNrSWNvbikpIHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gKHRhc2sgJiYgIVR5cGVzLmlzU3RyaW5nKHRhc2spKSA/IHRhc2suZ2V0S2V5KCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5yZW1vdmVSZWNlbnRseVVzZWRUYXNrKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgaW5kZXhUb1JlbW92ZSA9IHBpY2tlci5pdGVtcy5pbmRleE9mKGNvbnRleHQuaXRlbSk7XG5cdFx0XHRcdGlmIChpbmRleFRvUmVtb3ZlID49IDApIHtcblx0XHRcdFx0XHRwaWNrZXIuaXRlbXMgPSBbLi4ucGlja2VyLml0ZW1zLnNsaWNlKDAsIGluZGV4VG9SZW1vdmUpLCAuLi5waWNrZXIuaXRlbXMuc2xpY2UoaW5kZXhUb1JlbW92ZSArIDEpXTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChjb250ZXh0LmJ1dHRvbi5pY29uQ2xhc3MgPT09IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShjb25maWd1cmVUYXNrSWNvbikpIHtcblx0XHRcdFx0dGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuY2FuY2VsKCk7XG5cdFx0XHRcdGlmIChDb250cmlidXRlZFRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5jdXN0b21pemUodGFzaywgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChDdXN0b21UYXNrLmlzKHRhc2spIHx8IENvbmZpZ3VyaW5nVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdGxldCBjYW5PcGVuQ29uZmlnOiBib29sZWFuID0gZmFsc2U7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNhbk9wZW5Db25maWcgPSBhd2FpdCB0aGlzLl90YXNrU2VydmljZS5vcGVuQ29uZmlnKHRhc2spO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdC8vIGRvIG5vdGhpbmcuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghY2FuT3BlbkNvbmZpZykge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGFza1NlcnZpY2UuY3VzdG9taXplKHRhc2ssIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmIChuYW1lKSB7XG5cdFx0XHRwaWNrZXIudmFsdWUgPSBuYW1lO1xuXHRcdH1cblx0XHRsZXQgZmlyc3RMZXZlbFRhc2s6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2sgfCBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsID0gc3RhcnRBdFR5cGU7XG5cdFx0aWYgKCFmaXJzdExldmVsVGFzaykge1xuXHRcdFx0Ly8gRmlyc3Qgc2hvdyByZWNlbnQgdGFza3MgY29uZmlndXJlZCB0YXNrcy4gT3RoZXIgdGFza3Mgd2lsbCBiZSBhdmFpbGFibGUgYXQgYSBzZWNvbmQgbGV2ZWxcblx0XHRcdGNvbnN0IHRvcExldmVsRW50cmllc1Jlc3VsdCA9IGF3YWl0IHRoaXMuZ2V0VG9wTGV2ZWxFbnRyaWVzKGRlZmF1bHRFbnRyeSk7XG5cdFx0XHRpZiAodG9wTGV2ZWxFbnRyaWVzUmVzdWx0LmlzU2luZ2xlQ29uZmlndXJlZCAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihRVUlDS09QRU5fU0tJUF9DT05GSUcpKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvVGFzayh0b3BMZXZlbEVudHJpZXNSZXN1bHQuaXNTaW5nbGVDb25maWd1cmVkKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRhc2tRdWlja1BpY2tFbnRyaWVzOiBRdWlja1BpY2tJbnB1dDxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnk+W10gPSB0b3BMZXZlbEVudHJpZXNSZXN1bHQuZW50cmllcztcblx0XHRcdGZpcnN0TGV2ZWxUYXNrID0gYXdhaXQgdGhpcy5fZG9QaWNrZXJGaXJzdExldmVsKHBpY2tlciwgdGFza1F1aWNrUGlja0VudHJpZXMsIGRpc3Bvc2FibGVzKTtcblx0XHR9XG5cdFx0ZG8ge1xuXHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGZpcnN0TGV2ZWxUYXNrKSkge1xuXHRcdFx0XHRpZiAobmFtZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2RvUGlja2VyRmlyc3RMZXZlbChwaWNrZXIsIChhd2FpdCB0aGlzLmdldFRvcExldmVsRW50cmllcyhkZWZhdWx0RW50cnkpKS5lbnRyaWVzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRFbnRyeSA9IGF3YWl0IHRoaXMuZG9QaWNrZXJTZWNvbmRMZXZlbChwaWNrZXIsIGRpc3Bvc2FibGVzLCBmaXJzdExldmVsVGFzayk7XG5cdFx0XHRcdC8vIFByb2NlZWQgdG8gc2Vjb25kIGxldmVsIG9mIHF1aWNrIHBpY2tcblx0XHRcdFx0aWYgKHNlbGVjdGVkRW50cnkgJiYgIXNlbGVjdGVkRW50cnkuc2V0dGluZ1R5cGUgJiYgc2VsZWN0ZWRFbnRyeS50YXNrID09PSBudWxsKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIHVzZXIgaGFzIGNob3NlbiB0byBnbyBiYWNrIHRvIHRoZSBmaXJzdCBsZXZlbFxuXHRcdFx0XHRcdHBpY2tlci52YWx1ZSA9ICcnO1xuXHRcdFx0XHRcdGZpcnN0TGV2ZWxUYXNrID0gYXdhaXQgdGhpcy5fZG9QaWNrZXJGaXJzdExldmVsKHBpY2tlciwgKGF3YWl0IHRoaXMuZ2V0VG9wTGV2ZWxFbnRyaWVzKGRlZmF1bHRFbnRyeSkpLmVudHJpZXMsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0fSBlbHNlIGlmIChzZWxlY3RlZEVudHJ5ICYmIFR5cGVzLmlzU3RyaW5nKHNlbGVjdGVkRW50cnkuc2V0dGluZ1R5cGUpKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmhhbmRsZVNldHRpbmdPcHRpb24oc2VsZWN0ZWRFbnRyeS5zZXR0aW5nVHlwZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJldHVybiAoc2VsZWN0ZWRFbnRyeT8udGFzayAmJiAhVHlwZXMuaXNTdHJpbmcoc2VsZWN0ZWRFbnRyeT8udGFzaykpID8gdGhpcy5fdG9UYXNrKHNlbGVjdGVkRW50cnk/LnRhc2spIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGZpcnN0TGV2ZWxUYXNrKSB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RvVGFzayhmaXJzdExldmVsVGFzayk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybiBmaXJzdExldmVsVGFzaztcblx0XHRcdH1cblx0XHR9IHdoaWxlICgxKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXG5cblx0cHJpdmF0ZSBhc3luYyBfZG9QaWNrZXJGaXJzdExldmVsKHBpY2tlcjogSVF1aWNrUGljazxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnksIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiwgdGFza1F1aWNrUGlja0VudHJpZXM6IFF1aWNrUGlja0lucHV0PElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeT5bXSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSk6IFByb21pc2U8VGFzayB8IENvbmZpZ3VyaW5nVGFzayB8IHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblx0XHRwaWNrZXIuaXRlbXMgPSB0YXNrUXVpY2tQaWNrRW50cmllcztcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2hvd1dpdGhQaW5uZWRJdGVtcyh0aGlzLl9zdG9yYWdlU2VydmljZSwgcnVuVGFza1N0b3JhZ2VLZXksIHBpY2tlciwgdHJ1ZSkpO1xuXHRcdGNvbnN0IGZpcnN0TGV2ZWxQaWNrZXJSZXN1bHQgPSBhd2FpdCBuZXcgUHJvbWlzZTxJVGFza1R3b0xldmVsUXVpY2tQaWNrRW50cnkgfCB1bmRlZmluZWQgfCBudWxsPihyZXNvbHZlID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHBpY2tlci5vbkRpZEFjY2VwdCkoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRyZXNvbHZlKHBpY2tlci5zZWxlY3RlZEl0ZW1zID8gcGlja2VyLnNlbGVjdGVkSXRlbXNbMF0gOiB1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXHRcdHJldHVybiBmaXJzdExldmVsUGlja2VyUmVzdWx0Py50YXNrO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGRvUGlja2VyU2Vjb25kTGV2ZWwocGlja2VyOiBJUXVpY2tQaWNrPElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCB0eXBlOiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcpIHtcblx0XHRwaWNrZXIuYnVzeSA9IHRydWU7XG5cdFx0aWYgKHR5cGUgPT09IFNIT1dfQUxMKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IChhd2FpdCB0aGlzLl90YXNrU2VydmljZS50YXNrcygpKS5maWx0ZXIodCA9PiAhdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5oaWRlKS5zb3J0KChhLCBiKSA9PiB0aGlzLl9zb3J0ZXIuY29tcGFyZShhLCBiKSkubWFwKHRhc2sgPT4gdGhpcy5fY3JlYXRlVGFza0VudHJ5KHRhc2spKTtcblx0XHRcdGl0ZW1zLnB1c2goLi4uVGFza1F1aWNrUGljay5hbGxTZXR0aW5nRW50cmllcyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdFx0cGlja2VyLml0ZW1zID0gaXRlbXM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHBpY2tlci52YWx1ZSA9IG5hbWUgfHwgJyc7XG5cdFx0XHRwaWNrZXIuaXRlbXMgPSBhd2FpdCB0aGlzLl9nZXRFbnRyaWVzRm9yUHJvdmlkZXIodHlwZSk7XG5cdFx0fVxuXHRcdGF3YWl0IHBpY2tlci5zaG93KCk7XG5cdFx0cGlja2VyLmJ1c3kgPSBmYWxzZTtcblx0XHRjb25zdCBzZWNvbmRMZXZlbFBpY2tlclJlc3VsdCA9IGF3YWl0IG5ldyBQcm9taXNlPElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSB8IHVuZGVmaW5lZCB8IG51bGw+KHJlc29sdmUgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKEV2ZW50Lm9uY2UocGlja2VyLm9uRGlkQWNjZXB0KShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHJlc29sdmUocGlja2VyLnNlbGVjdGVkSXRlbXMgPyBwaWNrZXIuc2VsZWN0ZWRJdGVtc1swXSA6IHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHNlY29uZExldmVsUGlja2VyUmVzdWx0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBhbGxTZXR0aW5nRW50cmllcyhjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTogKElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeSAmIHsgc2V0dGluZ1R5cGU6IHN0cmluZyB9KVtdIHtcblx0XHRjb25zdCBlbnRyaWVzOiAoSVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5ICYgeyBzZXR0aW5nVHlwZTogc3RyaW5nIH0pW10gPSBbXTtcblx0XHRjb25zdCBncnVudEVudHJ5ID0gVGFza1F1aWNrUGljay5nZXRTZXR0aW5nRW50cnkoY29uZmlndXJhdGlvblNlcnZpY2UsICdncnVudCcpO1xuXHRcdGlmIChncnVudEVudHJ5KSB7XG5cdFx0XHRlbnRyaWVzLnB1c2goZ3J1bnRFbnRyeSk7XG5cdFx0fVxuXHRcdGNvbnN0IGd1bHBFbnRyeSA9IFRhc2tRdWlja1BpY2suZ2V0U2V0dGluZ0VudHJ5KGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAnZ3VscCcpO1xuXHRcdGlmIChndWxwRW50cnkpIHtcblx0XHRcdGVudHJpZXMucHVzaChndWxwRW50cnkpO1xuXHRcdH1cblx0XHRjb25zdCBqYWtlRW50cnkgPSBUYXNrUXVpY2tQaWNrLmdldFNldHRpbmdFbnRyeShjb25maWd1cmF0aW9uU2VydmljZSwgJ2pha2UnKTtcblx0XHRpZiAoamFrZUVudHJ5KSB7XG5cdFx0XHRlbnRyaWVzLnB1c2goamFrZUVudHJ5KTtcblx0XHR9XG5cdFx0cmV0dXJuIGVudHJpZXM7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldFNldHRpbmdFbnRyeShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0eXBlOiBzdHJpbmcpOiAoSVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5ICYgeyBzZXR0aW5nVHlwZTogc3RyaW5nIH0pIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoYCR7dHlwZX0uYXV0b0RldGVjdGApID09PSAnb2ZmJykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6ICckKGdlYXIpICcgKyBubHMubG9jYWxpemUoJ1Rhc2tRdWlja1BpY2suY2hhbmdlU2V0dGluZ3NPcHRpb25zJywgXCJ7MH0gdGFzayBkZXRlY3Rpb24gaXMgdHVybmVkIG9mZi4gRW5hYmxlIHsxfSB0YXNrIGRldGVjdGlvbi4uLlwiLFxuXHRcdFx0XHRcdHR5cGVbMF0udG9VcHBlckNhc2UoKSArIHR5cGUuc2xpY2UoMSksIHR5cGUpLFxuXHRcdFx0XHR0YXNrOiBudWxsLFxuXHRcdFx0XHRzZXR0aW5nVHlwZTogdHlwZSxcblx0XHRcdFx0YWx3YXlzU2hvdzogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEVudHJpZXNGb3JQcm92aWRlcih0eXBlOiBzdHJpbmcpOiBQcm9taXNlPFF1aWNrUGlja0lucHV0PElUYXNrVHdvTGV2ZWxRdWlja1BpY2tFbnRyeT5bXT4ge1xuXHRcdGNvbnN0IHRhc2tzID0gKGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLnRhc2tzKHsgdHlwZSB9KSkuc29ydCgoYSwgYikgPT4gdGhpcy5fc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdGxldCB0YXNrUXVpY2tQaWNrRW50cmllczogUXVpY2tQaWNrSW5wdXQ8SVRhc2tUd29MZXZlbFF1aWNrUGlja0VudHJ5PltdID0gW107XG5cdFx0aWYgKHRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRpZiAoIXRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaGlkZSkge1xuXHRcdFx0XHRcdHRhc2tRdWlja1BpY2tFbnRyaWVzLnB1c2godGhpcy5fY3JlYXRlVGFza0VudHJ5KHRhc2spKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGFza1F1aWNrUGlja0VudHJpZXMucHVzaCh7XG5cdFx0XHRcdHR5cGU6ICdzZXBhcmF0b3InXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tRdWlja1BpY2suZ29CYWNrJywgJ0dvIGJhY2sgXHUyMUE5JyksXG5cdFx0XHRcdHRhc2s6IG51bGwsXG5cdFx0XHRcdGFsd2F5c1Nob3c6IHRydWVcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXNrUXVpY2tQaWNrRW50cmllcyA9IFt7XG5cdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tRdWlja1BpY2subm9UYXNrc0ZvclR5cGUnLCAnTm8gezB9IHRhc2tzIGZvdW5kLiBHbyBiYWNrIFx1MjFBOScsIHR5cGUpLFxuXHRcdFx0XHR0YXNrOiBudWxsLFxuXHRcdFx0XHRhbHdheXNTaG93OiB0cnVlXG5cdFx0XHR9XTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXR0aW5nRW50cnkgPSBUYXNrUXVpY2tQaWNrLmdldFNldHRpbmdFbnRyeSh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgdHlwZSk7XG5cdFx0aWYgKHNldHRpbmdFbnRyeSkge1xuXHRcdFx0dGFza1F1aWNrUGlja0VudHJpZXMucHVzaChzZXR0aW5nRW50cnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFza1F1aWNrUGlja0VudHJpZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF90b1Rhc2sodGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayk6IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4gdGFzaztcblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZFRhc2sgPSBhd2FpdCB0aGlzLl90YXNrU2VydmljZS50cnlSZXNvbHZlVGFzayh0YXNrKTtcblxuXHRcdGlmICghcmVzb2x2ZWRUYXNrKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnbm9Qcm92aWRlckZvclRhc2snLCBcIlRoZXJlIGlzIG5vIHRhc2sgcHJvdmlkZXIgcmVnaXN0ZXJlZCBmb3IgdGFza3Mgb2YgdHlwZSBcXFwiezB9XFxcIi5cIiwgdGFzay50eXBlKSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNvbHZlZFRhc2s7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksYUFBYTtBQUN6QixTQUFlLGlCQUFpQixZQUFZLHVCQUF3RDtBQUVwRyxZQUFZLFdBQVc7QUFDdkIsU0FBUyxvQkFBZ0Q7QUFDekQsU0FBd0UsMEJBQTBCO0FBQ2xHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsWUFBWSx1QkFBb0M7QUFDekQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxlQUFlLCtCQUErQjtBQUV2RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUV6QixNQUFNLDBCQUEwQjtBQUNoQyxNQUFNLHdCQUF3QjtBQUM5QixTQUFTLGtCQUFrQixRQUFtRTtBQUNwRyxTQUFPLFNBQVM7QUFDakI7QUFXQSxNQUFNLFdBQW1CLElBQUksU0FBUyx5QkFBeUIsbUJBQW1CO0FBRTNFLE1BQU0sb0JBQW9CLGFBQWEsd0JBQXdCLFFBQVEsTUFBTSxJQUFJLFNBQVMscUJBQXFCLGlEQUFpRCxDQUFDO0FBQ3hLLE1BQU0saUJBQWlCLGFBQWEsZ0JBQWdCLFFBQVEsT0FBTyxJQUFJLFNBQVMsa0JBQWtCLDhDQUE4QyxDQUFDO0FBRWpKLE1BQU0sb0JBQW9CO0FBRW5CLElBQU0sZ0JB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
