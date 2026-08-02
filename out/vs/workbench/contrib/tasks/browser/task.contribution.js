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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { MenuRegistry, MenuId, registerAction2, Action2 } from "../../../../platform/actions/common/actions.js";
import { ProblemMatcherRegistry } from "../common/problemMatcher.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import * as jsonContributionRegistry from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { StatusbarAlignment, IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { Extensions as OutputExt } from "../../../services/output/common/output.js";
import { TaskGroup, TaskSettingId, TASKS_CATEGORY, TASK_RUNNING_STATE, TASK_TERMINAL_ACTIVE, TaskEventKind, rerunTaskIcon, RerunForActiveTerminalCommandId, RerunAllRunningTasksCommandId } from "../common/tasks.js";
import { ITaskService, TaskCommandsRegistered, TaskExecutionSupportedContext } from "../common/taskService.js";
import { Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { RunAutomaticTasks, ManageAutomaticTaskRunning } from "./runAutomaticTasks.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import schemaVersion1 from "../common/jsonSchema_v1.js";
import schemaVersion2, { updateProblemMatchers, updateTaskDefinitions } from "../common/jsonSchema_v2.js";
import { AbstractTaskService, ConfigureTaskAction } from "./abstractTaskService.js";
import { tasksSchemaId } from "../../../services/configuration/common/configuration.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { WorkbenchStateContext } from "../../../common/contextkeys.js";
import { Extensions as QuickAccessExtensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { TasksQuickAccessProvider } from "./tasksQuickAccess.js";
import { ContextKeyExpr } from "../../../../platform/contextkey/common/contextkey.js";
import { TaskDefinitionRegistry } from "../common/taskDefinitionRegistry.js";
import { TerminalMenuBarGroup } from "../../terminal/browser/terminalMenus.js";
import { isString } from "../../../../base/common/types.js";
import { promiseWithResolvers } from "../../../../base/common/async.js";
import { TerminalContextKeys } from "../../terminal/common/terminalContextKey.js";
import { ITerminalService } from "../../terminal/browser/terminal.js";
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(RunAutomaticTasks, LifecyclePhase.Eventually);
registerAction2(ManageAutomaticTaskRunning);
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ManageAutomaticTaskRunning.ID,
    title: ManageAutomaticTaskRunning.LABEL,
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
let TaskStatusBarContributions = class extends Disposable {
  constructor(_taskService, _statusbarService, _progressService) {
    super();
    this._taskService = _taskService;
    this._statusbarService = _statusbarService;
    this._progressService = _progressService;
    this._activeTasksCount = 0;
    this._registerListeners();
  }
  _registerListeners() {
    let promise = void 0;
    let resolve;
    this._register(this._taskService.onDidStateChange((event) => {
      if (event.kind === TaskEventKind.Changed) {
        this._updateRunningTasksStatus();
      }
      if (!this._ignoreEventForUpdateRunningTasksCount(event)) {
        switch (event.kind) {
          case TaskEventKind.Active:
            this._activeTasksCount++;
            if (this._activeTasksCount === 1) {
              if (!promise) {
                ({ promise, resolve } = promiseWithResolvers());
              }
            }
            break;
          case TaskEventKind.Inactive:
            if (this._activeTasksCount > 0) {
              this._activeTasksCount--;
              if (this._activeTasksCount === 0) {
                if (promise && resolve) {
                  resolve();
                }
              }
            }
            break;
          case TaskEventKind.Terminated:
            if (this._activeTasksCount !== 0) {
              this._activeTasksCount = 0;
              if (promise && resolve) {
                resolve();
              }
            }
            break;
        }
      }
      if (promise && event.kind === TaskEventKind.Active && this._activeTasksCount === 1) {
        this._progressService.withProgress({ location: ProgressLocation.Window, command: "workbench.action.tasks.showTasks" }, (progress) => {
          progress.report({ message: nls.localize("building", "Building...") });
          return promise;
        }).then(() => {
          promise = void 0;
        });
      }
    }));
  }
  async _updateRunningTasksStatus() {
    const tasks = await this._taskService.getActiveTasks();
    if (tasks.length === 0) {
      if (this._runningTasksStatusItem) {
        this._runningTasksStatusItem.dispose();
        this._runningTasksStatusItem = void 0;
      }
    } else {
      const itemProps = {
        name: nls.localize("status.runningTasks", "Running Tasks"),
        text: `$(tools) ${tasks.length}`,
        ariaLabel: nls.localize("numberOfRunningTasks", "{0} running tasks", tasks.length),
        tooltip: nls.localize("runningTasks", "Show Running Tasks"),
        command: "workbench.action.tasks.showTasks"
      };
      if (!this._runningTasksStatusItem) {
        this._runningTasksStatusItem = this._statusbarService.addEntry(itemProps, "status.runningTasks", StatusbarAlignment.LEFT, { location: { id: "status.problems", priority: 50 }, alignment: StatusbarAlignment.RIGHT });
      } else {
        this._runningTasksStatusItem.update(itemProps);
      }
    }
  }
  _ignoreEventForUpdateRunningTasksCount(event) {
    if (!this._taskService.inTerminal() || event.kind === TaskEventKind.Changed) {
      return false;
    }
    if ((isString(event.group) ? event.group : event.group?._id) !== TaskGroup.Build._id) {
      return true;
    }
    return event.__task.configurationProperties.problemMatchers === void 0 || event.__task.configurationProperties.problemMatchers.length === 0;
  }
};
TaskStatusBarContributions = __decorateClass([
  __decorateParam(0, ITaskService),
  __decorateParam(1, IStatusbarService),
  __decorateParam(2, IProgressService)
], TaskStatusBarContributions);
workbenchRegistry.registerWorkbenchContribution(TaskStatusBarContributions, LifecyclePhase.Restored);
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Run,
  command: {
    id: "workbench.action.tasks.runTask",
    title: nls.localize({ key: "miRunTask", comment: ["&& denotes a mnemonic"] }, "&&Run Task...")
  },
  order: 1,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Run,
  command: {
    id: "workbench.action.tasks.build",
    title: nls.localize({ key: "miBuildTask", comment: ["&& denotes a mnemonic"] }, "Run &&Build Task...")
  },
  order: 2,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.showTasks",
    title: nls.localize({ key: "miRunningTask", comment: ["&& denotes a mnemonic"] }, "Show Runnin&&g Tasks...")
  },
  order: 1,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.restartTask",
    title: nls.localize({ key: "miRestartTask", comment: ["&& denotes a mnemonic"] }, "R&&estart Running Task...")
  },
  order: 2,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Manage,
  command: {
    precondition: TASK_RUNNING_STATE,
    id: "workbench.action.tasks.terminate",
    title: nls.localize({ key: "miTerminateTask", comment: ["&& denotes a mnemonic"] }, "&&Terminate Task...")
  },
  order: 3,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Configure,
  command: {
    id: "workbench.action.tasks.configureTaskRunner",
    title: nls.localize({ key: "miConfigureTask", comment: ["&& denotes a mnemonic"] }, "&&Configure Tasks...")
  },
  order: 1,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.MenubarTerminalMenu, {
  group: TerminalMenuBarGroup.Configure,
  command: {
    id: "workbench.action.tasks.configureDefaultBuildTask",
    title: nls.localize({ key: "miConfigureBuildTask", comment: ["&& denotes a mnemonic"] }, "Configure De&&fault Build Task...")
  },
  order: 2,
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.openWorkspaceFileTasks",
    title: nls.localize2("workbench.action.tasks.openWorkspaceFileTasks", "Open Workspace Tasks"),
    category: TASKS_CATEGORY
  },
  when: ContextKeyExpr.and(WorkbenchStateContext.isEqualTo("workspace"), TaskExecutionSupportedContext)
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: ConfigureTaskAction.ID,
    title: ConfigureTaskAction.TEXT,
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.showLog",
    title: nls.localize2("ShowLogAction.label", "Show Task Log"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.runTask",
    title: nls.localize2("RunTaskAction.label", "Run Task"),
    category: TASKS_CATEGORY
  }
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.reRunTask",
    title: nls.localize2("ReRunTaskAction.label", "Rerun Last Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.restartTask",
    title: nls.localize2("RestartTaskAction.label", "Restart Running Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: RerunAllRunningTasksCommandId,
    title: nls.localize2("RerunAllRunningTasksAction.label", "Rerun All Running Tasks"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.showTasks",
    title: nls.localize2("ShowTasksAction.label", "Show Running Tasks"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.terminate",
    title: nls.localize2("TerminateAction.label", "Terminate Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.build",
    title: nls.localize2("BuildAction.label", "Run Build Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.test",
    title: nls.localize2("TestAction.label", "Run Test Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.configureDefaultBuildTask",
    title: nls.localize2("ConfigureDefaultBuildTask.label", "Configure Default Build Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.configureDefaultTestTask",
    title: nls.localize2("ConfigureDefaultTestTask.label", "Configure Default Test Task"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
  command: {
    id: "workbench.action.tasks.openUserTasks",
    title: nls.localize2("workbench.action.tasks.openUserTasks", "Open User Tasks"),
    category: TASKS_CATEGORY
  },
  when: TaskExecutionSupportedContext
});
class UserTasksGlobalActionContribution extends Disposable {
  constructor() {
    super();
    this.registerActions();
  }
  registerActions() {
    const id = "workbench.action.tasks.openUserTasks";
    const title = nls.localize("tasks", "Tasks");
    this._register(MenuRegistry.appendMenuItem(MenuId.GlobalActivity, {
      command: {
        id,
        title
      },
      when: TaskExecutionSupportedContext,
      group: "2_configuration",
      order: 6
    }));
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarPreferencesMenu, {
      command: {
        id,
        title
      },
      when: TaskExecutionSupportedContext,
      group: "2_configuration",
      order: 6
    }));
  }
}
workbenchRegistry.registerWorkbenchContribution(UserTasksGlobalActionContribution, LifecyclePhase.Restored);
KeybindingsRegistry.registerKeybindingRule({
  id: "workbench.action.tasks.build",
  weight: KeybindingWeight.WorkbenchContrib,
  when: TaskCommandsRegistered,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyB
});
const outputChannelRegistry = Registry.as(OutputExt.OutputChannels);
outputChannelRegistry.registerChannel({ id: AbstractTaskService.OutputChannelId, label: AbstractTaskService.OutputChannelLabel, log: false });
const quickAccessRegistry = Registry.as(QuickAccessExtensions.Quickaccess);
const tasksPickerContextKey = "inTasksPicker";
quickAccessRegistry.registerQuickAccessProvider({
  ctor: TasksQuickAccessProvider,
  prefix: TasksQuickAccessProvider.PREFIX,
  contextKey: tasksPickerContextKey,
  placeholder: nls.localize("tasksQuickAccessPlaceholder", "Type the name of a task to run."),
  helpEntries: [{ description: nls.localize("tasksQuickAccessHelp", "Run Task"), commandCenterOrder: 60 }]
});
const schema = {
  id: tasksSchemaId,
  description: "Task definition file",
  type: "object",
  allowTrailingCommas: true,
  allowComments: true,
  default: {
    version: "2.0.0",
    tasks: [
      {
        label: "My Task",
        command: "echo hello",
        type: "shell",
        args: [],
        problemMatcher: ["$tsc"],
        presentation: {
          reveal: "always"
        },
        group: "build"
      }
    ]
  }
};
schema.definitions = {
  ...schemaVersion1.definitions,
  ...schemaVersion2.definitions
};
schema.oneOf = [...schemaVersion2.oneOf || [], ...schemaVersion1.oneOf || []];
const jsonRegistry = Registry.as(jsonContributionRegistry.Extensions.JSONContribution);
jsonRegistry.registerSchema(tasksSchemaId, schema);
class TaskRegistryContribution extends Disposable {
  constructor() {
    super();
    this._register(ProblemMatcherRegistry.onMatcherChanged(() => {
      updateProblemMatchers();
      jsonRegistry.notifySchemaChanged(tasksSchemaId);
    }));
    this._register(TaskDefinitionRegistry.onDefinitionsChanged(() => {
      updateTaskDefinitions();
      jsonRegistry.notifySchemaChanged(tasksSchemaId);
    }));
  }
}
TaskRegistryContribution.ID = "taskRegistryContribution";
registerWorkbenchContribution2(TaskRegistryContribution.ID, TaskRegistryContribution, WorkbenchPhase.AfterRestored);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "task",
  order: 100,
  title: nls.localize("tasksConfigurationTitle", "Tasks"),
  type: "object",
  properties: {
    [TaskSettingId.ProblemMatchersNeverPrompt]: {
      markdownDescription: nls.localize("task.problemMatchers.neverPrompt", "Configures whether to show the problem matcher prompt when running a task. Set to `true` to never prompt, or use a dictionary of task types to turn off prompting only for specific task types."),
      "oneOf": [
        {
          type: "boolean",
          markdownDescription: nls.localize("task.problemMatchers.neverPrompt.boolean", "Sets problem matcher prompting behavior for all tasks.")
        },
        {
          type: "object",
          patternProperties: {
            ".*": {
              type: "boolean"
            }
          },
          markdownDescription: nls.localize("task.problemMatchers.neverPrompt.array", "An object containing task type-boolean pairs to never prompt for problem matchers on."),
          default: {
            "shell": true
          }
        }
      ],
      default: false
    },
    [TaskSettingId.AutoDetect]: {
      markdownDescription: nls.localize("task.autoDetect", "Controls enablement of `provideTasks` for all task provider extension. If the Tasks: Run Task command is slow, disabling auto detect for task providers may help. Individual extensions may also provide settings that disable auto detection."),
      type: "string",
      enum: ["on", "off"],
      default: "on"
    },
    [TaskSettingId.SlowProviderWarning]: {
      markdownDescription: nls.localize("task.slowProviderWarning", "Configures whether a warning is shown when a provider is slow"),
      "oneOf": [
        {
          type: "boolean",
          markdownDescription: nls.localize("task.slowProviderWarning.boolean", "Sets the slow provider warning for all tasks.")
        },
        {
          type: "array",
          items: {
            type: "string",
            markdownDescription: nls.localize("task.slowProviderWarning.array", "An array of task types to never show the slow provider warning.")
          }
        }
      ],
      default: true
    },
    [TaskSettingId.QuickOpenHistory]: {
      markdownDescription: nls.localize("task.quickOpen.history", "Controls the number of recent items tracked in task quick open dialog."),
      type: "number",
      default: 30,
      minimum: 0,
      maximum: 30
    },
    [TaskSettingId.QuickOpenDetail]: {
      markdownDescription: nls.localize("task.quickOpen.detail", "Controls whether to show the task detail for tasks that have a detail in task quick picks, such as Run Task."),
      type: "boolean",
      default: true
    },
    [TaskSettingId.QuickOpenSkip]: {
      type: "boolean",
      description: nls.localize("task.quickOpen.skip", "Controls whether the task quick pick is skipped when there is only one task to pick from."),
      default: false
    },
    [TaskSettingId.QuickOpenShowAll]: {
      type: "boolean",
      description: nls.localize("task.quickOpen.showAll", 'Causes the Tasks: Run Task command to use the slower "show all" behavior instead of the faster two level picker where tasks are grouped by provider.'),
      default: false
    },
    [TaskSettingId.AllowAutomaticTasks]: {
      type: "string",
      enum: ["on", "off"],
      enumDescriptions: [
        nls.localize("task.allowAutomaticTasks.on", "Always"),
        nls.localize("task.allowAutomaticTasks.off", "Never")
      ],
      description: nls.localize("task.allowAutomaticTasks", "Enable automatic tasks - note that tasks won't run in an untrusted workspace."),
      default: "off",
      scope: ConfigurationScope.APPLICATION,
      restricted: true
    },
    [TaskSettingId.Reconnection]: {
      type: "boolean",
      description: nls.localize("task.reconnection", "On window reload, reconnect to tasks that have problem matchers."),
      default: true
    },
    [TaskSettingId.SaveBeforeRun]: {
      markdownDescription: nls.localize(
        "task.saveBeforeRun",
        "Save all dirty editors before running a task."
      ),
      type: "string",
      enum: ["always", "never", "prompt"],
      enumDescriptions: [
        nls.localize("task.saveBeforeRun.always", "Always saves all editors before running."),
        nls.localize("task.saveBeforeRun.never", "Never saves editors before running."),
        nls.localize("task.SaveBeforeRun.prompt", "Prompts whether to save editors before running.")
      ],
      default: "always"
    },
    [TaskSettingId.NotifyWindowOnTaskCompletion]: {
      type: "integer",
      markdownDescription: nls.localize("task.NotifyWindowOnTaskCompletion", "Controls the minimum task runtime in milliseconds before showing an OS notification when the task finishes while the window is not in focus. Set to -1 to disable notifications. Set to 0 to always show notifications. This includes a window badge as well as notification toast."),
      default: 6e4,
      minimum: -1,
      agentsWindow: { default: -1 }
    },
    [TaskSettingId.VerboseLogging]: {
      type: "boolean",
      description: nls.localize("task.verboseLogging", "Enable verbose logging for tasks."),
      default: false
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: RerunForActiveTerminalCommandId,
      icon: rerunTaskIcon,
      title: nls.localize2("workbench.action.tasks.rerunForActiveTerminal", "Rerun Task"),
      precondition: TASK_TERMINAL_ACTIVE,
      menu: [{ id: MenuId.TerminalInstanceContext, when: TASK_TERMINAL_ACTIVE }],
      keybinding: {
        when: TerminalContextKeys.focus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
        mac: {
          primary: KeyMod.WinCtrl | KeyMod.Shift | KeyCode.KeyR
        },
        weight: KeybindingWeight.WorkbenchContrib
      }
    });
  }
  async run(accessor, args) {
    const terminalService = accessor.get(ITerminalService);
    const taskSystem = accessor.get(ITaskService);
    const instance = args ?? terminalService.activeInstance;
    if (instance) {
      await taskSystem.rerun(instance.instanceId);
    }
  }
});
export {
  TaskRegistryContribution,
  TaskStatusBarContributions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2Jyb3dzZXIvdGFzay5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcblxuaW1wb3J0IHsgUHJvYmxlbU1hdGNoZXJSZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcblxuaW1wb3J0ICogYXMganNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcblxuaW1wb3J0IHsgU3RhdHVzYmFyQWxpZ25tZW50LCBJU3RhdHVzYmFyU2VydmljZSwgSVN0YXR1c2JhckVudHJ5QWNjZXNzb3IsIElTdGF0dXNiYXJFbnRyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5cbmltcG9ydCB7IElPdXRwdXRDaGFubmVsUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgT3V0cHV0RXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuXG5pbXBvcnQgeyBJVGFza0V2ZW50LCBUYXNrR3JvdXAsIFRhc2tTZXR0aW5nSWQsIFRBU0tTX0NBVEVHT1JZLCBUQVNLX1JVTk5JTkdfU1RBVEUsIFRBU0tfVEVSTUlOQUxfQUNUSVZFLCBUYXNrRXZlbnRLaW5kLCByZXJ1blRhc2tJY29uLCBSZXJ1bkZvckFjdGl2ZVRlcm1pbmFsQ29tbWFuZElkLCBSZXJ1bkFsbFJ1bm5pbmdUYXNrc0NvbW1hbmRJZCB9IGZyb20gJy4uL2NvbW1vbi90YXNrcy5qcyc7XG5pbXBvcnQgeyBJVGFza1NlcnZpY2UsIFRhc2tDb21tYW5kc1JlZ2lzdGVyZWQsIFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcblxuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgUnVuQXV0b21hdGljVGFza3MsIE1hbmFnZUF1dG9tYXRpY1Rhc2tSdW5uaW5nIH0gZnJvbSAnLi9ydW5BdXRvbWF0aWNUYXNrcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc1JlZ2lzdHJ5LCBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBLZXlNb2QsIEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgc2NoZW1hVmVyc2lvbjEgZnJvbSAnLi4vY29tbW9uL2pzb25TY2hlbWFfdjEuanMnO1xuaW1wb3J0IHNjaGVtYVZlcnNpb24yLCB7IHVwZGF0ZVByb2JsZW1NYXRjaGVycywgdXBkYXRlVGFza0RlZmluaXRpb25zIH0gZnJvbSAnLi4vY29tbW9uL2pzb25TY2hlbWFfdjIuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RUYXNrU2VydmljZSwgQ29uZmlndXJlVGFza0FjdGlvbiB9IGZyb20gJy4vYWJzdHJhY3RUYXNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0YXNrc1NjaGVtYUlkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoU3RhdGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElRdWlja0FjY2Vzc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFF1aWNrQWNjZXNzRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IFRhc2tzUXVpY2tBY2Nlc3NQcm92aWRlciB9IGZyb20gJy4vdGFza3NRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVGFza0RlZmluaXRpb25SZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi90YXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsTWVudUJhckdyb3VwIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbE1lbnVzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgcHJvbWlzZVdpdGhSZXNvbHZlcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5cbmltcG9ydCB7IFRlcm1pbmFsQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWxDb250ZXh0S2V5LmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5cbmNvbnN0IHdvcmtiZW5jaFJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oUnVuQXV0b21hdGljVGFza3MsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuXG5yZWdpc3RlckFjdGlvbjIoTWFuYWdlQXV0b21hdGljVGFza1J1bm5pbmcpO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IE1hbmFnZUF1dG9tYXRpY1Rhc2tSdW5uaW5nLklELFxuXHRcdHRpdGxlOiBNYW5hZ2VBdXRvbWF0aWNUYXNrUnVubmluZy5MQUJFTCxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuXG5leHBvcnQgY2xhc3MgVGFza1N0YXR1c0JhckNvbnRyaWJ1dGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgX3J1bm5pbmdUYXNrc1N0YXR1c0l0ZW06IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hY3RpdmVUYXNrc0NvdW50OiBudW1iZXIgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVGFza1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGFza1NlcnZpY2U6IElUYXNrU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdGxldCBwcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCByZXNvbHZlOiAodmFsdWU/OiB2b2lkIHwgVGhlbmFibGU8dm9pZD4pID0+IHZvaWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFza1NlcnZpY2Uub25EaWRTdGF0ZUNoYW5nZShldmVudCA9PiB7XG5cdFx0XHRpZiAoZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5DaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZVJ1bm5pbmdUYXNrc1N0YXR1cygpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXRoaXMuX2lnbm9yZUV2ZW50Rm9yVXBkYXRlUnVubmluZ1Rhc2tzQ291bnQoZXZlbnQpKSB7XG5cdFx0XHRcdHN3aXRjaCAoZXZlbnQua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgVGFza0V2ZW50S2luZC5BY3RpdmU6XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3RpdmVUYXNrc0NvdW50Kys7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlVGFza3NDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXByb21pc2UpIHtcblx0XHRcdFx0XHRcdFx0XHQoeyBwcm9taXNlLCByZXNvbHZlIH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczx2b2lkPigpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBUYXNrRXZlbnRLaW5kLkluYWN0aXZlOlxuXHRcdFx0XHRcdFx0Ly8gU2luY2UgdGhlIGV4aXRpbmcgb2YgdGhlIHN1YiBwcm9jZXNzIGlzIGNvbW11bmljYXRlZCBhc3luYyB3ZSBjYW4ndCBvcmRlciBpbmFjdGl2ZSBhbmQgdGVybWluYXRlIGV2ZW50cy5cblx0XHRcdFx0XHRcdC8vIFNvIHRyeSB0byB0cmVhdCB0aGVtIGFjY29yZGluZ2x5LlxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVRhc2tzQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVRhc2tzQ291bnQtLTtcblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVRhc2tzQ291bnQgPT09IDApIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAocHJvbWlzZSAmJiByZXNvbHZlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlISgpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBUYXNrRXZlbnRLaW5kLlRlcm1pbmF0ZWQ6XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fYWN0aXZlVGFza3NDb3VudCAhPT0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9hY3RpdmVUYXNrc0NvdW50ID0gMDtcblx0XHRcdFx0XHRcdFx0aWYgKHByb21pc2UgJiYgcmVzb2x2ZSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmUhKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwcm9taXNlICYmIChldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLkFjdGl2ZSkgJiYgKHRoaXMuX2FjdGl2ZVRhc2tzQ291bnQgPT09IDEpKSB7XG5cdFx0XHRcdHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoeyBsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csIGNvbW1hbmQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dUYXNrcycgfSwgcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHRcdHByb2dyZXNzLnJlcG9ydCh7IG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnYnVpbGRpbmcnLCAnQnVpbGRpbmcuLi4nKSB9KTtcblx0XHRcdFx0XHRyZXR1cm4gcHJvbWlzZSE7XG5cdFx0XHRcdH0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVJ1bm5pbmdUYXNrc1N0YXR1cygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMuX3Rhc2tTZXJ2aWNlLmdldEFjdGl2ZVRhc2tzKCk7XG5cdFx0aWYgKHRhc2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aWYgKHRoaXMuX3J1bm5pbmdUYXNrc1N0YXR1c0l0ZW0pIHtcblx0XHRcdFx0dGhpcy5fcnVubmluZ1Rhc2tzU3RhdHVzSXRlbS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3J1bm5pbmdUYXNrc1N0YXR1c0l0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGl0ZW1Qcm9wczogSVN0YXR1c2JhckVudHJ5ID0ge1xuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUoJ3N0YXR1cy5ydW5uaW5nVGFza3MnLCBcIlJ1bm5pbmcgVGFza3NcIiksXG5cdFx0XHRcdHRleHQ6IGAkKHRvb2xzKSAke3Rhc2tzLmxlbmd0aH1gLFxuXHRcdFx0XHRhcmlhTGFiZWw6IG5scy5sb2NhbGl6ZSgnbnVtYmVyT2ZSdW5uaW5nVGFza3MnLCBcInswfSBydW5uaW5nIHRhc2tzXCIsIHRhc2tzLmxlbmd0aCksXG5cdFx0XHRcdHRvb2x0aXA6IG5scy5sb2NhbGl6ZSgncnVubmluZ1Rhc2tzJywgXCJTaG93IFJ1bm5pbmcgVGFza3NcIiksXG5cdFx0XHRcdGNvbW1hbmQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dUYXNrcycsXG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAoIXRoaXMuX3J1bm5pbmdUYXNrc1N0YXR1c0l0ZW0pIHtcblx0XHRcdFx0dGhpcy5fcnVubmluZ1Rhc2tzU3RhdHVzSXRlbSA9IHRoaXMuX3N0YXR1c2JhclNlcnZpY2UuYWRkRW50cnkoaXRlbVByb3BzLCAnc3RhdHVzLnJ1bm5pbmdUYXNrcycsIFN0YXR1c2JhckFsaWdubWVudC5MRUZULCB7IGxvY2F0aW9uOiB7IGlkOiAnc3RhdHVzLnByb2JsZW1zJywgcHJpb3JpdHk6IDUwIH0sIGFsaWdubWVudDogU3RhdHVzYmFyQWxpZ25tZW50LlJJR0hUIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fcnVubmluZ1Rhc2tzU3RhdHVzSXRlbS51cGRhdGUoaXRlbVByb3BzKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pZ25vcmVFdmVudEZvclVwZGF0ZVJ1bm5pbmdUYXNrc0NvdW50KGV2ZW50OiBJVGFza0V2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl90YXNrU2VydmljZS5pblRlcm1pbmFsKCkgfHwgZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5DaGFuZ2VkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKChpc1N0cmluZyhldmVudC5ncm91cCkgPyBldmVudC5ncm91cCA6IGV2ZW50Lmdyb3VwPy5faWQpICE9PSBUYXNrR3JvdXAuQnVpbGQuX2lkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZXZlbnQuX190YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyA9PT0gdW5kZWZpbmVkIHx8IGV2ZW50Ll9fdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMubGVuZ3RoID09PSAwO1xuXHR9XG59XG5cbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFRhc2tTdGF0dXNCYXJDb250cmlidXRpb25zLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSwge1xuXHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuUnVuLFxuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJ1blRhc2snLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVJ1blRhc2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSdW4gVGFzay4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsIHtcblx0Z3JvdXA6IFRlcm1pbmFsTWVudUJhckdyb3VwLlJ1bixcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5idWlsZCcsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pQnVpbGRUYXNrJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlJ1biAmJkJ1aWxkIFRhc2suLi5cIilcblx0fSxcblx0b3JkZXI6IDIsXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcblxuLy8gTWFuYWdlIFRhc2tzXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsIHtcblx0Z3JvdXA6IFRlcm1pbmFsTWVudUJhckdyb3VwLk1hbmFnZSxcblx0Y29tbWFuZDoge1xuXHRcdHByZWNvbmRpdGlvbjogVEFTS19SVU5OSU5HX1NUQVRFLFxuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5zaG93VGFza3MnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUoeyBrZXk6ICdtaVJ1bm5pbmdUYXNrJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIlNob3cgUnVubmluJiZnIFRhc2tzLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAxLFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSwge1xuXHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuTWFuYWdlLFxuXHRjb21tYW5kOiB7XG5cdFx0cHJlY29uZGl0aW9uOiBUQVNLX1JVTk5JTkdfU1RBVEUsXG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJlc3RhcnRUYXNrJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlSZXN0YXJ0VGFzaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJSJiZlc3RhcnQgUnVubmluZyBUYXNrLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAyLFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhclRlcm1pbmFsTWVudSwge1xuXHRncm91cDogVGVybWluYWxNZW51QmFyR3JvdXAuTWFuYWdlLFxuXHRjb21tYW5kOiB7XG5cdFx0cHJlY29uZGl0aW9uOiBUQVNLX1JVTk5JTkdfU1RBVEUsXG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnRlcm1pbmF0ZScsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pVGVybWluYXRlVGFzaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRlcm1pbmF0ZSBUYXNrLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAzLFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5cbi8vIENvbmZpZ3VyZSBUYXNrc1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyVGVybWluYWxNZW51LCB7XG5cdGdyb3VwOiBUZXJtaW5hbE1lbnVCYXJHcm91cC5Db25maWd1cmUsXG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MuY29uZmlndXJlVGFza1J1bm5lcicsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZSh7IGtleTogJ21pQ29uZmlndXJlVGFzaycsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJkNvbmZpZ3VyZSBUYXNrcy4uLlwiKVxuXHR9LFxuXHRvcmRlcjogMSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk1lbnViYXJUZXJtaW5hbE1lbnUsIHtcblx0Z3JvdXA6IFRlcm1pbmFsTWVudUJhckdyb3VwLkNvbmZpZ3VyZSxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVEZWZhdWx0QnVpbGRUYXNrJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlDb25maWd1cmVCdWlsZFRhc2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiQ29uZmlndXJlIERlJiZmYXVsdCBCdWlsZCBUYXNrLi4uXCIpXG5cdH0sXG5cdG9yZGVyOiAyLFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5cblxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm9wZW5Xb3Jrc3BhY2VGaWxlVGFza3MnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm9wZW5Xb3Jrc3BhY2VGaWxlVGFza3MnLCBcIk9wZW4gV29ya3NwYWNlIFRhc2tzXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoV29ya2JlbmNoU3RhdGVDb250ZXh0LmlzRXF1YWxUbygnd29ya3NwYWNlJyksIFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0KVxufSk7XG5cbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiBDb25maWd1cmVUYXNrQWN0aW9uLklELFxuXHRcdHRpdGxlOiBDb25maWd1cmVUYXNrQWN0aW9uLlRFWFQsXG5cdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5zaG93TG9nJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignU2hvd0xvZ0FjdGlvbi5sYWJlbCcsIFwiU2hvdyBUYXNrIExvZ1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJ1blRhc2snLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdSdW5UYXNrQWN0aW9uLmxhYmVsJywgXCJSdW4gVGFza1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fVxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVSdW5UYXNrJyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplMignUmVSdW5UYXNrQWN0aW9uLmxhYmVsJywgXCJSZXJ1biBMYXN0IFRhc2tcIiksXG5cdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZXN0YXJ0VGFzaycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1Jlc3RhcnRUYXNrQWN0aW9uLmxhYmVsJywgXCJSZXN0YXJ0IFJ1bm5pbmcgVGFza1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6IFJlcnVuQWxsUnVubmluZ1Rhc2tzQ29tbWFuZElkLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdSZXJ1bkFsbFJ1bm5pbmdUYXNrc0FjdGlvbi5sYWJlbCcsIFwiUmVydW4gQWxsIFJ1bm5pbmcgVGFza3NcIiksXG5cdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5zaG93VGFza3MnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdTaG93VGFza3NBY3Rpb24ubGFiZWwnLCBcIlNob3cgUnVubmluZyBUYXNrc1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnRlcm1pbmF0ZScsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ1Rlcm1pbmF0ZUFjdGlvbi5sYWJlbCcsIFwiVGVybWluYXRlIFRhc2tcIiksXG5cdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5idWlsZCcsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0J1aWxkQWN0aW9uLmxhYmVsJywgXCJSdW4gQnVpbGQgVGFza1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnRlc3QnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdUZXN0QWN0aW9uLmxhYmVsJywgXCJSdW4gVGVzdCBUYXNrXCIpLFxuXHRcdGNhdGVnb3J5OiBUQVNLU19DQVRFR09SWVxuXHR9LFxuXHR3aGVuOiBUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dFxufSk7XG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7XG5cdGNvbW1hbmQ6IHtcblx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MuY29uZmlndXJlRGVmYXVsdEJ1aWxkVGFzaycsXG5cdFx0dGl0bGU6IG5scy5sb2NhbGl6ZTIoJ0NvbmZpZ3VyZURlZmF1bHRCdWlsZFRhc2subGFiZWwnLCBcIkNvbmZpZ3VyZSBEZWZhdWx0IEJ1aWxkIFRhc2tcIiksXG5cdFx0Y2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcbk1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHtcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jb25maWd1cmVEZWZhdWx0VGVzdFRhc2snLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCdDb25maWd1cmVEZWZhdWx0VGVzdFRhc2subGFiZWwnLCBcIkNvbmZpZ3VyZSBEZWZhdWx0IFRlc3QgVGFza1wiKSxcblx0XHRjYXRlZ29yeTogVEFTS1NfQ0FURUdPUllcblx0fSxcblx0d2hlbjogVGFza0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHRcbn0pO1xuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSwge1xuXHRjb21tYW5kOiB7XG5cdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm9wZW5Vc2VyVGFza3MnLFxuXHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm9wZW5Vc2VyVGFza3MnLCBcIk9wZW4gVXNlciBUYXNrc1wiKSwgY2F0ZWdvcnk6IFRBU0tTX0NBVEVHT1JZXG5cdH0sXG5cdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0XG59KTtcblxuY2xhc3MgVXNlclRhc2tzR2xvYmFsQWN0aW9uQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5yZWdpc3RlckFjdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCkge1xuXHRcdGNvbnN0IGlkID0gJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Mub3BlblVzZXJUYXNrcyc7XG5cdFx0Y29uc3QgdGl0bGUgPSBubHMubG9jYWxpemUoJ3Rhc2tzJywgXCJUYXNrc1wiKTtcblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkdsb2JhbEFjdGl2aXR5LCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR0aXRsZVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LFxuXHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0b3JkZXI6IDZcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyUHJlZmVyZW5jZXNNZW51LCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHR0aXRsZVxuXHRcdFx0fSxcblx0XHRcdHdoZW46IFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LFxuXHRcdFx0Z3JvdXA6ICcyX2NvbmZpZ3VyYXRpb24nLFxuXHRcdFx0b3JkZXI6IDZcblx0XHR9KSk7XG5cdH1cbn1cbndvcmtiZW5jaFJlZ2lzdHJ5LnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFVzZXJUYXNrc0dsb2JhbEFjdGlvbkNvbnRyaWJ1dGlvbiwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXG4vLyBNZW51UmVnaXN0cnkuYWRkQ29tbWFuZCggeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVidWlsZCcsIHRpdGxlOiBubHMubG9jYWxpemUoJ1JlYnVpbGRBY3Rpb24ubGFiZWwnLCAnUnVuIFJlYnVpbGQgVGFzaycpLCBjYXRlZ29yeTogdGFza3NDYXRlZ29yeSB9KTtcbi8vIE1lbnVSZWdpc3RyeS5hZGRDb21tYW5kKCB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5jbGVhbicsIHRpdGxlOiBubHMubG9jYWxpemUoJ0NsZWFuQWN0aW9uLmxhYmVsJywgJ1J1biBDbGVhbiBUYXNrJyksIGNhdGVnb3J5OiB0YXNrc0NhdGVnb3J5IH0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MuYnVpbGQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogVGFza0NvbW1hbmRzUmVnaXN0ZXJlZCxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleUJcbn0pO1xuXG4vLyBUYXNrcyBPdXRwdXQgY2hhbm5lbC4gUmVnaXN0ZXIgaXQgYmVmb3JlIHVzaW5nIGl0IGluIFRhc2sgU2VydmljZS5cbmNvbnN0IG91dHB1dENoYW5uZWxSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElPdXRwdXRDaGFubmVsUmVnaXN0cnk+KE91dHB1dEV4dC5PdXRwdXRDaGFubmVscyk7XG5vdXRwdXRDaGFubmVsUmVnaXN0cnkucmVnaXN0ZXJDaGFubmVsKHsgaWQ6IEFic3RyYWN0VGFza1NlcnZpY2UuT3V0cHV0Q2hhbm5lbElkLCBsYWJlbDogQWJzdHJhY3RUYXNrU2VydmljZS5PdXRwdXRDaGFubmVsTGFiZWwsIGxvZzogZmFsc2UgfSk7XG5cblxuLy8gUmVnaXN0ZXIgUXVpY2sgQWNjZXNzXG5jb25zdCBxdWlja0FjY2Vzc1JlZ2lzdHJ5ID0gKFJlZ2lzdHJ5LmFzPElRdWlja0FjY2Vzc1JlZ2lzdHJ5PihRdWlja0FjY2Vzc0V4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcbmNvbnN0IHRhc2tzUGlja2VyQ29udGV4dEtleSA9ICdpblRhc2tzUGlja2VyJztcblxucXVpY2tBY2Nlc3NSZWdpc3RyeS5yZWdpc3RlclF1aWNrQWNjZXNzUHJvdmlkZXIoe1xuXHRjdG9yOiBUYXNrc1F1aWNrQWNjZXNzUHJvdmlkZXIsXG5cdHByZWZpeDogVGFza3NRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCxcblx0Y29udGV4dEtleTogdGFza3NQaWNrZXJDb250ZXh0S2V5LFxuXHRwbGFjZWhvbGRlcjogbmxzLmxvY2FsaXplKCd0YXNrc1F1aWNrQWNjZXNzUGxhY2Vob2xkZXInLCBcIlR5cGUgdGhlIG5hbWUgb2YgYSB0YXNrIHRvIHJ1bi5cIiksXG5cdGhlbHBFbnRyaWVzOiBbeyBkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrc1F1aWNrQWNjZXNzSGVscCcsIFwiUnVuIFRhc2tcIiksIGNvbW1hbmRDZW50ZXJPcmRlcjogNjAgfV1cbn0pO1xuXG4vLyB0YXNrcy5qc29uIHZhbGlkYXRpb25cbmNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdGlkOiB0YXNrc1NjaGVtYUlkLFxuXHRkZXNjcmlwdGlvbjogJ1Rhc2sgZGVmaW5pdGlvbiBmaWxlJyxcblx0dHlwZTogJ29iamVjdCcsXG5cdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdGFsbG93Q29tbWVudHM6IHRydWUsXG5cdGRlZmF1bHQ6IHtcblx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdHRhc2tzOiBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnTXkgVGFzaycsXG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0dHlwZTogJ3NoZWxsJyxcblx0XHRcdFx0YXJnczogW10sXG5cdFx0XHRcdHByb2JsZW1NYXRjaGVyOiBbJyR0c2MnXSxcblx0XHRcdFx0cHJlc2VudGF0aW9uOiB7XG5cdFx0XHRcdFx0cmV2ZWFsOiAnYWx3YXlzJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRncm91cDogJ2J1aWxkJ1xuXHRcdFx0fVxuXHRcdF1cblx0fVxufTtcblxuc2NoZW1hLmRlZmluaXRpb25zID0ge1xuXHQuLi5zY2hlbWFWZXJzaW9uMS5kZWZpbml0aW9ucyxcblx0Li4uc2NoZW1hVmVyc2lvbjIuZGVmaW5pdGlvbnMsXG59O1xuc2NoZW1hLm9uZU9mID0gWy4uLihzY2hlbWFWZXJzaW9uMi5vbmVPZiB8fCBbXSksIC4uLihzY2hlbWFWZXJzaW9uMS5vbmVPZiB8fCBbXSldO1xuXG5jb25zdCBqc29uUmVnaXN0cnkgPSA8anNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LklKU09OQ29udHJpYnV0aW9uUmVnaXN0cnk+UmVnaXN0cnkuYXMoanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5qc29uUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEodGFza3NTY2hlbWFJZCwgc2NoZW1hKTtcblxuZXhwb3J0IGNsYXNzIFRhc2tSZWdpc3RyeUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIElEID0gJ3Rhc2tSZWdpc3RyeUNvbnRyaWJ1dGlvbic7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5Lm9uTWF0Y2hlckNoYW5nZWQoKCkgPT4ge1xuXHRcdFx0dXBkYXRlUHJvYmxlbU1hdGNoZXJzKCk7XG5cdFx0XHRqc29uUmVnaXN0cnkubm90aWZ5U2NoZW1hQ2hhbmdlZCh0YXNrc1NjaGVtYUlkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5Lm9uRGVmaW5pdGlvbnNDaGFuZ2VkKCgpID0+IHtcblx0XHRcdHVwZGF0ZVRhc2tEZWZpbml0aW9ucygpO1xuXHRcdFx0anNvblJlZ2lzdHJ5Lm5vdGlmeVNjaGVtYUNoYW5nZWQodGFza3NTY2hlbWFJZCk7XG5cdFx0fSkpO1xuXHR9XG59XG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoVGFza1JlZ2lzdHJ5Q29udHJpYnV0aW9uLklELCBUYXNrUmVnaXN0cnlDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkFmdGVyUmVzdG9yZWQpO1xuXG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAndGFzaycsXG5cdG9yZGVyOiAxMDAsXG5cdHRpdGxlOiBubHMubG9jYWxpemUoJ3Rhc2tzQ29uZmlndXJhdGlvblRpdGxlJywgXCJUYXNrc1wiKSxcblx0dHlwZTogJ29iamVjdCcsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbVGFza1NldHRpbmdJZC5Qcm9ibGVtTWF0Y2hlcnNOZXZlclByb21wdF06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5wcm9ibGVtTWF0Y2hlcnMubmV2ZXJQcm9tcHQnLCBcIkNvbmZpZ3VyZXMgd2hldGhlciB0byBzaG93IHRoZSBwcm9ibGVtIG1hdGNoZXIgcHJvbXB0IHdoZW4gcnVubmluZyBhIHRhc2suIFNldCB0byBgdHJ1ZWAgdG8gbmV2ZXIgcHJvbXB0LCBvciB1c2UgYSBkaWN0aW9uYXJ5IG9mIHRhc2sgdHlwZXMgdG8gdHVybiBvZmYgcHJvbXB0aW5nIG9ubHkgZm9yIHNwZWNpZmljIHRhc2sgdHlwZXMuXCIpLFxuXHRcdFx0J29uZU9mJzogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5wcm9ibGVtTWF0Y2hlcnMubmV2ZXJQcm9tcHQuYm9vbGVhbicsICdTZXRzIHByb2JsZW0gbWF0Y2hlciBwcm9tcHRpbmcgYmVoYXZpb3IgZm9yIGFsbCB0YXNrcy4nKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cGF0dGVyblByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdCcuKic6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2sucHJvYmxlbU1hdGNoZXJzLm5ldmVyUHJvbXB0LmFycmF5JywgJ0FuIG9iamVjdCBjb250YWluaW5nIHRhc2sgdHlwZS1ib29sZWFuIHBhaXJzIHRvIG5ldmVyIHByb21wdCBmb3IgcHJvYmxlbSBtYXRjaGVycyBvbi4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0XHQnc2hlbGwnOiB0cnVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLkF1dG9EZXRlY3RdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2suYXV0b0RldGVjdCcsIFwiQ29udHJvbHMgZW5hYmxlbWVudCBvZiBgcHJvdmlkZVRhc2tzYCBmb3IgYWxsIHRhc2sgcHJvdmlkZXIgZXh0ZW5zaW9uLiBJZiB0aGUgVGFza3M6IFJ1biBUYXNrIGNvbW1hbmQgaXMgc2xvdywgZGlzYWJsaW5nIGF1dG8gZGV0ZWN0IGZvciB0YXNrIHByb3ZpZGVycyBtYXkgaGVscC4gSW5kaXZpZHVhbCBleHRlbnNpb25zIG1heSBhbHNvIHByb3ZpZGUgc2V0dGluZ3MgdGhhdCBkaXNhYmxlIGF1dG8gZGV0ZWN0aW9uLlwiKSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydvbicsICdvZmYnXSxcblx0XHRcdGRlZmF1bHQ6ICdvbidcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLlNsb3dQcm92aWRlcldhcm5pbmddOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2suc2xvd1Byb3ZpZGVyV2FybmluZycsIFwiQ29uZmlndXJlcyB3aGV0aGVyIGEgd2FybmluZyBpcyBzaG93biB3aGVuIGEgcHJvdmlkZXIgaXMgc2xvd1wiKSxcblx0XHRcdCdvbmVPZic6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2suc2xvd1Byb3ZpZGVyV2FybmluZy5ib29sZWFuJywgJ1NldHMgdGhlIHNsb3cgcHJvdmlkZXIgd2FybmluZyBmb3IgYWxsIHRhc2tzLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5zbG93UHJvdmlkZXJXYXJuaW5nLmFycmF5JywgJ0FuIGFycmF5IG9mIHRhc2sgdHlwZXMgdG8gbmV2ZXIgc2hvdyB0aGUgc2xvdyBwcm92aWRlciB3YXJuaW5nLicpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuUXVpY2tPcGVuSGlzdG9yeV06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5xdWlja09wZW4uaGlzdG9yeScsIFwiQ29udHJvbHMgdGhlIG51bWJlciBvZiByZWNlbnQgaXRlbXMgdHJhY2tlZCBpbiB0YXNrIHF1aWNrIG9wZW4gZGlhbG9nLlwiKSxcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMzAsIG1pbmltdW06IDAsIG1heGltdW06IDMwXG5cdFx0fSxcblx0XHRbVGFza1NldHRpbmdJZC5RdWlja09wZW5EZXRhaWxdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2sucXVpY2tPcGVuLmRldGFpbCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IHRoZSB0YXNrIGRldGFpbCBmb3IgdGFza3MgdGhhdCBoYXZlIGEgZGV0YWlsIGluIHRhc2sgcXVpY2sgcGlja3MsIHN1Y2ggYXMgUnVuIFRhc2suXCIpLFxuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuUXVpY2tPcGVuU2tpcF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2sucXVpY2tPcGVuLnNraXAnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHRhc2sgcXVpY2sgcGljayBpcyBza2lwcGVkIHdoZW4gdGhlcmUgaXMgb25seSBvbmUgdGFzayB0byBwaWNrIGZyb20uXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLlF1aWNrT3BlblNob3dBbGxdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLnF1aWNrT3Blbi5zaG93QWxsJywgXCJDYXVzZXMgdGhlIFRhc2tzOiBSdW4gVGFzayBjb21tYW5kIHRvIHVzZSB0aGUgc2xvd2VyIFxcXCJzaG93IGFsbFxcXCIgYmVoYXZpb3IgaW5zdGVhZCBvZiB0aGUgZmFzdGVyIHR3byBsZXZlbCBwaWNrZXIgd2hlcmUgdGFza3MgYXJlIGdyb3VwZWQgYnkgcHJvdmlkZXIuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLkFsbG93QXV0b21hdGljVGFza3NdOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnb24nLCAnb2ZmJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndGFzay5hbGxvd0F1dG9tYXRpY1Rhc2tzLm9uJywgXCJBbHdheXNcIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndGFzay5hbGxvd0F1dG9tYXRpY1Rhc2tzLm9mZicsIFwiTmV2ZXJcIiksXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay5hbGxvd0F1dG9tYXRpY1Rhc2tzJywgXCJFbmFibGUgYXV0b21hdGljIHRhc2tzIC0gbm90ZSB0aGF0IHRhc2tzIHdvbid0IHJ1biBpbiBhbiB1bnRydXN0ZWQgd29ya3NwYWNlLlwiKSxcblx0XHRcdGRlZmF1bHQ6ICdvZmYnLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHJlc3RyaWN0ZWQ6IHRydWVcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLlJlY29ubmVjdGlvbl06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3Rhc2sucmVjb25uZWN0aW9uJywgXCJPbiB3aW5kb3cgcmVsb2FkLCByZWNvbm5lY3QgdG8gdGFza3MgdGhhdCBoYXZlIHByb2JsZW0gbWF0Y2hlcnMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0W1Rhc2tTZXR0aW5nSWQuU2F2ZUJlZm9yZVJ1bl06IHtcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0J3Rhc2suc2F2ZUJlZm9yZVJ1bicsXG5cdFx0XHRcdCdTYXZlIGFsbCBkaXJ0eSBlZGl0b3JzIGJlZm9yZSBydW5uaW5nIGEgdGFzay4nXG5cdFx0XHQpLFxuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2Fsd2F5cycsICduZXZlcicsICdwcm9tcHQnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YXNrLnNhdmVCZWZvcmVSdW4uYWx3YXlzJywgJ0Fsd2F5cyBzYXZlcyBhbGwgZWRpdG9ycyBiZWZvcmUgcnVubmluZy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YXNrLnNhdmVCZWZvcmVSdW4ubmV2ZXInLCAnTmV2ZXIgc2F2ZXMgZWRpdG9ycyBiZWZvcmUgcnVubmluZy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YXNrLlNhdmVCZWZvcmVSdW4ucHJvbXB0JywgJ1Byb21wdHMgd2hldGhlciB0byBzYXZlIGVkaXRvcnMgYmVmb3JlIHJ1bm5pbmcuJyksXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2Fsd2F5cycsXG5cdFx0fSxcblx0XHRbVGFza1NldHRpbmdJZC5Ob3RpZnlXaW5kb3dPblRhc2tDb21wbGV0aW9uXToge1xuXHRcdFx0dHlwZTogJ2ludGVnZXInLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd0YXNrLk5vdGlmeVdpbmRvd09uVGFza0NvbXBsZXRpb24nLCAnQ29udHJvbHMgdGhlIG1pbmltdW0gdGFzayBydW50aW1lIGluIG1pbGxpc2Vjb25kcyBiZWZvcmUgc2hvd2luZyBhbiBPUyBub3RpZmljYXRpb24gd2hlbiB0aGUgdGFzayBmaW5pc2hlcyB3aGlsZSB0aGUgd2luZG93IGlzIG5vdCBpbiBmb2N1cy4gU2V0IHRvIC0xIHRvIGRpc2FibGUgbm90aWZpY2F0aW9ucy4gU2V0IHRvIDAgdG8gYWx3YXlzIHNob3cgbm90aWZpY2F0aW9ucy4gVGhpcyBpbmNsdWRlcyBhIHdpbmRvdyBiYWRnZSBhcyB3ZWxsIGFzIG5vdGlmaWNhdGlvbiB0b2FzdC4nKSxcblx0XHRcdGRlZmF1bHQ6IDYwMDAwLFxuXHRcdFx0bWluaW11bTogLTEsXG5cdFx0XHRhZ2VudHNXaW5kb3c6IHsgZGVmYXVsdDogLTEgfSxcblx0XHR9LFxuXHRcdFtUYXNrU2V0dGluZ0lkLlZlcmJvc2VMb2dnaW5nXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndGFzay52ZXJib3NlTG9nZ2luZycsIFwiRW5hYmxlIHZlcmJvc2UgbG9nZ2luZyBmb3IgdGFza3MuXCIpLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHR9LFxuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBSZXJ1bkZvckFjdGl2ZVRlcm1pbmFsQ29tbWFuZElkLFxuXHRcdFx0aWNvbjogcmVydW5UYXNrSWNvbixcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUyKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJlcnVuRm9yQWN0aXZlVGVybWluYWwnLCAnUmVydW4gVGFzaycpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBUQVNLX1RFUk1JTkFMX0FDVElWRSxcblx0XHRcdG1lbnU6IFt7IGlkOiBNZW51SWQuVGVybWluYWxJbnN0YW5jZUNvbnRleHQsIHdoZW46IFRBU0tfVEVSTUlOQUxfQUNUSVZFIH1dLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBUZXJtaW5hbENvbnRleHRLZXlzLmZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5Uixcblx0XHRcdFx0bWFjOiB7XG5cdFx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLldpbkN0cmwgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVJcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWJcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlcm1pbmFsU2VydmljZSk7XG5cdFx0Y29uc3QgdGFza1N5c3RlbSA9IGFjY2Vzc29yLmdldChJVGFza1NlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbmNlID0gYXJncyBhcyBJVGVybWluYWxJbnN0YW5jZSA/PyB0ZXJtaW5hbFNlcnZpY2UuYWN0aXZlSW5zdGFuY2U7XG5cdFx0aWYgKGluc3RhbmNlKSB7XG5cdFx0XHRhd2FpdCB0YXNrU3lzdGVtLnJlcnVuKGluc3RhbmNlLmluc3RhbmNlSWQpO1xuXHRcdH1cblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUVyQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdC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
