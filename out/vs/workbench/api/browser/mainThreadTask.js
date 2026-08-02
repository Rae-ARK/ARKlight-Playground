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
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as Types from "../../../base/common/types.js";
import * as Platform from "../../../base/common/platform.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { IWorkspaceContextService } from "../../../platform/workspace/common/workspace.js";
import {
  ContributedTask,
  ConfiguringTask,
  CommandOptions,
  RuntimeType,
  CustomTask,
  TaskScope,
  TaskSourceKind,
  TaskDefinition,
  PresentationOptions,
  RunOptions
} from "../../contrib/tasks/common/tasks.js";
import { ITaskService } from "../../contrib/tasks/common/taskService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import {
  TaskEventKind
} from "../common/shared/tasks.js";
import { IConfigurationResolverService } from "../../services/configurationResolver/common/configurationResolver.js";
import { ErrorNoTelemetry } from "../../../base/common/errors.js";
import { ConfigurationResolverExpression } from "../../services/configurationResolver/common/configurationResolverExpression.js";
var TaskExecutionDTO;
((TaskExecutionDTO2) => {
  function from(value) {
    return {
      id: value.id,
      task: TaskDTO.from(value.task)
    };
  }
  TaskExecutionDTO2.from = from;
})(TaskExecutionDTO || (TaskExecutionDTO = {}));
var TaskProblemMatcherStartedDto;
((TaskProblemMatcherStartedDto2) => {
  function from(value) {
    return {
      execution: {
        id: value.execution.id,
        task: TaskDTO.from(value.execution.task)
      }
    };
  }
  TaskProblemMatcherStartedDto2.from = from;
})(TaskProblemMatcherStartedDto || (TaskProblemMatcherStartedDto = {}));
var TaskProblemMatcherEndedDto;
((TaskProblemMatcherEndedDto2) => {
  function from(value) {
    return {
      execution: {
        id: value.execution.id,
        task: TaskDTO.from(value.execution.task)
      },
      hasErrors: value.hasErrors
    };
  }
  TaskProblemMatcherEndedDto2.from = from;
})(TaskProblemMatcherEndedDto || (TaskProblemMatcherEndedDto = {}));
var TaskProcessStartedDTO;
((TaskProcessStartedDTO2) => {
  function from(value, processId) {
    return {
      id: value.id,
      processId
    };
  }
  TaskProcessStartedDTO2.from = from;
})(TaskProcessStartedDTO || (TaskProcessStartedDTO = {}));
var TaskProcessEndedDTO;
((TaskProcessEndedDTO2) => {
  function from(value, exitCode) {
    return {
      id: value.id,
      exitCode
    };
  }
  TaskProcessEndedDTO2.from = from;
})(TaskProcessEndedDTO || (TaskProcessEndedDTO = {}));
var TaskDefinitionDTO;
((TaskDefinitionDTO2) => {
  function from(value) {
    const result = Object.assign(/* @__PURE__ */ Object.create(null), value);
    delete result._key;
    return result;
  }
  TaskDefinitionDTO2.from = from;
  function to(value, executeOnly) {
    let result = TaskDefinition.createTaskIdentifier(value, console);
    if (result === void 0 && executeOnly) {
      result = {
        _key: generateUuid(),
        type: "$executeOnly"
      };
    }
    return result;
  }
  TaskDefinitionDTO2.to = to;
})(TaskDefinitionDTO || (TaskDefinitionDTO = {}));
var TaskPresentationOptionsDTO;
((TaskPresentationOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), value);
  }
  TaskPresentationOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return PresentationOptions.defaults;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), PresentationOptions.defaults, value);
  }
  TaskPresentationOptionsDTO2.to = to;
})(TaskPresentationOptionsDTO || (TaskPresentationOptionsDTO = {}));
var RunOptionsDTO;
((RunOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), value);
  }
  RunOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return RunOptions.defaults;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), RunOptions.defaults, value);
  }
  RunOptionsDTO2.to = to;
})(RunOptionsDTO || (RunOptionsDTO = {}));
var ProcessExecutionOptionsDTO;
((ProcessExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return {
      cwd: value.cwd,
      env: value.env
    };
  }
  ProcessExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return CommandOptions.defaults;
    }
    return {
      cwd: value.cwd || CommandOptions.defaults.cwd,
      env: value.env
    };
  }
  ProcessExecutionOptionsDTO2.to = to;
})(ProcessExecutionOptionsDTO || (ProcessExecutionOptionsDTO = {}));
var ProcessExecutionDTO;
((ProcessExecutionDTO2) => {
  function is(value) {
    const candidate = value;
    return candidate && !!candidate.process;
  }
  ProcessExecutionDTO2.is = is;
  function from(value) {
    const process = Types.isString(value.name) ? value.name : value.name.value;
    const args = value.args ? value.args.map((value2) => Types.isString(value2) ? value2 : value2.value) : [];
    const result = {
      process,
      args
    };
    if (value.options) {
      result.options = ProcessExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ProcessExecutionDTO2.from = from;
  function to(value) {
    const result = {
      runtime: RuntimeType.Process,
      name: value.process,
      args: value.args,
      presentation: void 0
    };
    result.options = ProcessExecutionOptionsDTO.to(value.options);
    return result;
  }
  ProcessExecutionDTO2.to = to;
})(ProcessExecutionDTO || (ProcessExecutionDTO = {}));
var ShellExecutionOptionsDTO;
((ShellExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {
      cwd: value.cwd || CommandOptions.defaults.cwd,
      env: value.env
    };
    if (value.shell) {
      result.executable = value.shell.executable;
      result.shellArgs = value.shell.args;
      result.shellQuoting = value.shell.quoting;
    }
    return result;
  }
  ShellExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {
      cwd: value.cwd,
      env: value.env
    };
    if (value.executable) {
      result.shell = {
        executable: value.executable
      };
      if (value.shellArgs) {
        result.shell.args = value.shellArgs;
      }
      if (value.shellQuoting) {
        result.shell.quoting = value.shellQuoting;
      }
    }
    return result;
  }
  ShellExecutionOptionsDTO2.to = to;
})(ShellExecutionOptionsDTO || (ShellExecutionOptionsDTO = {}));
var ShellExecutionDTO;
((ShellExecutionDTO2) => {
  function is(value) {
    const candidate = value;
    return candidate && (!!candidate.commandLine || !!candidate.command);
  }
  ShellExecutionDTO2.is = is;
  function from(value) {
    const result = {};
    if (value.name && Types.isString(value.name) && (value.args === void 0 || value.args === null || value.args.length === 0)) {
      result.commandLine = value.name;
    } else {
      result.command = value.name;
      result.args = value.args;
    }
    if (value.options) {
      result.options = ShellExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ShellExecutionDTO2.from = from;
  function to(value) {
    const result = {
      runtime: RuntimeType.Shell,
      name: value.commandLine ? value.commandLine : value.command,
      args: value.args,
      presentation: void 0
    };
    if (value.options) {
      result.options = ShellExecutionOptionsDTO.to(value.options);
    }
    return result;
  }
  ShellExecutionDTO2.to = to;
})(ShellExecutionDTO || (ShellExecutionDTO = {}));
var CustomExecutionDTO;
((CustomExecutionDTO2) => {
  function is(value) {
    const candidate = value;
    return candidate && candidate.customExecution === "customExecution";
  }
  CustomExecutionDTO2.is = is;
  function from(value) {
    return {
      customExecution: "customExecution"
    };
  }
  CustomExecutionDTO2.from = from;
  function to(value) {
    return {
      runtime: RuntimeType.CustomExecution,
      presentation: void 0
    };
  }
  CustomExecutionDTO2.to = to;
})(CustomExecutionDTO || (CustomExecutionDTO = {}));
var TaskSourceDTO;
((TaskSourceDTO2) => {
  function from(value) {
    const result = {
      label: value.label
    };
    if (value.kind === TaskSourceKind.Extension) {
      result.extensionId = value.extension;
      if (value.workspaceFolder) {
        result.scope = value.workspaceFolder.uri;
      } else {
        result.scope = value.scope;
      }
    } else if (value.kind === TaskSourceKind.Workspace) {
      result.extensionId = "$core";
      result.scope = value.config.workspaceFolder ? value.config.workspaceFolder.uri : TaskScope.Global;
    }
    return result;
  }
  TaskSourceDTO2.from = from;
  function to(value, workspace) {
    let scope;
    let workspaceFolder;
    if (value.scope === void 0 || typeof value.scope === "number" && value.scope !== TaskScope.Global) {
      if (workspace.getWorkspace().folders.length === 0) {
        scope = TaskScope.Global;
        workspaceFolder = void 0;
      } else {
        scope = TaskScope.Folder;
        workspaceFolder = workspace.getWorkspace().folders[0];
      }
    } else if (typeof value.scope === "number") {
      scope = value.scope;
    } else {
      scope = TaskScope.Folder;
      workspaceFolder = workspace.getWorkspaceFolder(URI.revive(value.scope)) ?? void 0;
    }
    const result = {
      kind: TaskSourceKind.Extension,
      label: value.label,
      extension: value.extensionId,
      scope,
      workspaceFolder
    };
    return result;
  }
  TaskSourceDTO2.to = to;
})(TaskSourceDTO || (TaskSourceDTO = {}));
var TaskHandleDTO;
((TaskHandleDTO2) => {
  function is(value) {
    const candidate = value;
    return !!candidate && Types.isString(candidate.id) && !!candidate.workspaceFolder;
  }
  TaskHandleDTO2.is = is;
})(TaskHandleDTO || (TaskHandleDTO = {}));
var TaskDTO;
((TaskDTO2) => {
  function from(task) {
    if (task === void 0 || task === null || !CustomTask.is(task) && !ContributedTask.is(task) && !ConfiguringTask.is(task)) {
      return void 0;
    }
    const result = {
      _id: task._id,
      name: task.configurationProperties.name,
      definition: TaskDefinitionDTO.from(task.getDefinition(true)),
      source: TaskSourceDTO.from(task._source),
      execution: void 0,
      presentationOptions: !ConfiguringTask.is(task) && task.command ? TaskPresentationOptionsDTO.from(task.command.presentation) : void 0,
      isBackground: task.configurationProperties.isBackground,
      problemMatchers: [],
      hasDefinedMatchers: ContributedTask.is(task) ? task.hasDefinedMatchers : false,
      runOptions: RunOptionsDTO.from(task.runOptions)
    };
    result.group = TaskGroupDTO.from(task.configurationProperties.group);
    if (task.configurationProperties.detail) {
      result.detail = task.configurationProperties.detail;
    }
    if (!ConfiguringTask.is(task) && task.command) {
      switch (task.command.runtime) {
        case RuntimeType.Process:
          result.execution = ProcessExecutionDTO.from(task.command);
          break;
        case RuntimeType.Shell:
          result.execution = ShellExecutionDTO.from(task.command);
          break;
        case RuntimeType.CustomExecution:
          result.execution = CustomExecutionDTO.from(task.command);
          break;
      }
    }
    if (task.configurationProperties.problemMatchers) {
      for (const matcher of task.configurationProperties.problemMatchers) {
        if (Types.isString(matcher)) {
          result.problemMatchers.push(matcher);
        }
      }
    }
    return result;
  }
  TaskDTO2.from = from;
  function to(task, workspace, executeOnly, icon, hide) {
    if (!task || typeof task.name !== "string") {
      return void 0;
    }
    let command;
    if (task.execution) {
      if (ShellExecutionDTO.is(task.execution)) {
        command = ShellExecutionDTO.to(task.execution);
      } else if (ProcessExecutionDTO.is(task.execution)) {
        command = ProcessExecutionDTO.to(task.execution);
      } else if (CustomExecutionDTO.is(task.execution)) {
        command = CustomExecutionDTO.to(task.execution);
      }
    }
    if (!command) {
      return void 0;
    }
    command.presentation = TaskPresentationOptionsDTO.to(task.presentationOptions);
    const source = TaskSourceDTO.to(task.source, workspace);
    const label = nls.localize("task.label", "{0}: {1}", source.label, task.name);
    const definition = TaskDefinitionDTO.to(task.definition, executeOnly);
    const id = CustomExecutionDTO.is(task.execution) && task._id ? task._id : `${task.source.extensionId}.${definition._key}`;
    const result = new ContributedTask(
      id,
      // uuidMap.getUUID(identifier)
      source,
      label,
      definition.type,
      definition,
      command,
      task.hasDefinedMatchers,
      RunOptionsDTO.to(task.runOptions),
      {
        name: task.name,
        identifier: label,
        group: task.group,
        isBackground: !!task.isBackground,
        problemMatchers: task.problemMatchers.slice(),
        detail: task.detail,
        icon,
        hide
      }
    );
    return result;
  }
  TaskDTO2.to = to;
})(TaskDTO || (TaskDTO = {}));
var TaskGroupDTO;
((TaskGroupDTO2) => {
  function from(value) {
    if (value === void 0) {
      return void 0;
    }
    return {
      _id: typeof value === "string" ? value : value._id,
      isDefault: typeof value === "string" ? false : typeof value.isDefault === "string" ? false : value.isDefault
    };
  }
  TaskGroupDTO2.from = from;
})(TaskGroupDTO || (TaskGroupDTO = {}));
var TaskFilterDTO;
((TaskFilterDTO2) => {
  function from(value) {
    return value;
  }
  TaskFilterDTO2.from = from;
  function to(value) {
    return value;
  }
  TaskFilterDTO2.to = to;
})(TaskFilterDTO || (TaskFilterDTO = {}));
let MainThreadTask = class extends Disposable {
  constructor(extHostContext, _taskService, _workspaceContextServer, _configurationResolverService) {
    super();
    this._taskService = _taskService;
    this._workspaceContextServer = _workspaceContextServer;
    this._configurationResolverService = _configurationResolverService;
    this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTask);
    this._providers = /* @__PURE__ */ new Map();
    this._register(this._taskService.onDidStateChange(async (event) => {
      if (event.kind === TaskEventKind.Changed) {
        return;
      }
      const task = event.__task;
      if (event.kind === TaskEventKind.Start) {
        const execution = TaskExecutionDTO.from(task.getTaskExecution());
        let resolvedDefinition = execution.task.definition;
        if (execution.task?.execution && CustomExecutionDTO.is(execution.task.execution) && event.resolvedVariables) {
          const expr = ConfigurationResolverExpression.parse(execution.task.definition);
          for (const replacement of expr.unresolved()) {
            const value = event.resolvedVariables.get(replacement.inner);
            if (value !== void 0) {
              expr.resolve(replacement, value);
            }
          }
          resolvedDefinition = await this._configurationResolverService.resolveAsync(task.getWorkspaceFolder(), expr);
        }
        this._proxy.$onDidStartTask(execution, event.terminalId, resolvedDefinition);
      } else if (event.kind === TaskEventKind.ProcessStarted) {
        this._proxy.$onDidStartTaskProcess(TaskProcessStartedDTO.from(task.getTaskExecution(), event.processId));
      } else if (event.kind === TaskEventKind.ProcessEnded) {
        this._proxy.$onDidEndTaskProcess(TaskProcessEndedDTO.from(task.getTaskExecution(), event.exitCode));
      } else if (event.kind === TaskEventKind.End) {
        this._proxy.$OnDidEndTask(TaskExecutionDTO.from(task.getTaskExecution()));
      } else if (event.kind === TaskEventKind.ProblemMatcherStarted) {
        this._proxy.$onDidStartTaskProblemMatchers(TaskProblemMatcherStartedDto.from({ execution: task.getTaskExecution() }));
      } else if (event.kind === TaskEventKind.ProblemMatcherEnded) {
        this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: false }));
      } else if (event.kind === TaskEventKind.ProblemMatcherFoundErrors) {
        this._proxy.$onDidEndTaskProblemMatchers(TaskProblemMatcherEndedDto.from({ execution: task.getTaskExecution(), hasErrors: true }));
      }
    }));
  }
  dispose() {
    for (const value of this._providers.values()) {
      value.disposable.dispose();
    }
    this._providers.clear();
    super.dispose();
  }
  $createTaskId(taskDTO) {
    return new Promise((resolve, reject) => {
      const task = TaskDTO.to(taskDTO, this._workspaceContextServer, true);
      if (task) {
        resolve(task._id);
      } else {
        reject(new Error("Task could not be created from DTO"));
      }
    });
  }
  $registerTaskProvider(handle, type) {
    const provider = {
      provideTasks: (validTypes) => {
        return Promise.resolve(this._proxy.$provideTasks(handle, validTypes)).then((value) => {
          const tasks = [];
          for (const dto of value.tasks) {
            const task = TaskDTO.to(dto, this._workspaceContextServer, true);
            if (task) {
              tasks.push(task);
            } else {
              console.error(`Task System: can not convert task: ${JSON.stringify(dto.definition, void 0, 0)}. Task will be dropped`);
            }
          }
          const processedExtension = {
            ...value.extension,
            extensionLocation: URI.revive(value.extension.extensionLocation)
          };
          return {
            tasks,
            extension: processedExtension
          };
        });
      },
      resolveTask: (task) => {
        const dto = TaskDTO.from(task);
        if (dto) {
          dto.name = dto.name === void 0 ? "" : dto.name;
          return Promise.resolve(this._proxy.$resolveTask(handle, dto)).then((resolvedTask) => {
            if (resolvedTask) {
              return TaskDTO.to(resolvedTask, this._workspaceContextServer, true, task.configurationProperties.icon, task.configurationProperties.hide);
            }
            return void 0;
          });
        }
        return Promise.resolve(void 0);
      }
    };
    const disposable = this._taskService.registerTaskProvider(provider, type);
    this._providers.set(handle, { disposable, provider });
    return Promise.resolve(void 0);
  }
  $unregisterTaskProvider(handle) {
    const provider = this._providers.get(handle);
    if (provider) {
      provider.disposable.dispose();
      this._providers.delete(handle);
    }
    return Promise.resolve(void 0);
  }
  $fetchTasks(filter) {
    return this._taskService.tasks(TaskFilterDTO.to(filter)).then((tasks) => {
      const result = [];
      for (const task of tasks) {
        const item = TaskDTO.from(task);
        if (item) {
          result.push(item);
        }
      }
      return result;
    });
  }
  getWorkspace(value) {
    let workspace;
    if (typeof value === "string") {
      workspace = value;
    } else {
      const workspaceObject = this._workspaceContextServer.getWorkspace();
      const uri = URI.revive(value);
      if (workspaceObject.configuration?.toString() === uri.toString()) {
        workspace = workspaceObject;
      } else {
        workspace = this._workspaceContextServer.getWorkspaceFolder(uri);
      }
    }
    return workspace;
  }
  async $getTaskExecution(value) {
    if (TaskHandleDTO.is(value)) {
      const workspace = this.getWorkspace(value.workspaceFolder);
      if (workspace) {
        const task = await this._taskService.getTask(workspace, value.id, true);
        if (task) {
          return {
            id: task._id,
            task: TaskDTO.from(task)
          };
        }
        throw new Error("Task not found");
      } else {
        throw new Error("No workspace folder");
      }
    } else {
      const task = TaskDTO.to(value, this._workspaceContextServer, true);
      return {
        id: task._id,
        task: TaskDTO.from(task)
      };
    }
  }
  // Passing in a TaskHandleDTO will cause the task to get re-resolved, which is important for tasks are coming from the core,
  // such as those gotten from a fetchTasks, since they can have missing configuration properties.
  $executeTask(value) {
    return new Promise((resolve, reject) => {
      if (TaskHandleDTO.is(value)) {
        const workspace = this.getWorkspace(value.workspaceFolder);
        if (workspace) {
          this._taskService.getTask(workspace, value.id, true).then((task) => {
            if (!task) {
              reject(new Error("Task not found"));
            } else {
              const result = {
                id: value.id,
                task: TaskDTO.from(task)
              };
              this._taskService.run(task).then((summary) => {
                if (summary?.exitCode === void 0 || summary.exitCode !== 0) {
                  this._proxy.$OnDidEndTask(result);
                }
              }, (reason) => {
              });
              resolve(result);
            }
          }, (_error) => {
            reject(new Error("Task not found"));
          });
        } else {
          reject(new Error("No workspace folder"));
        }
      } else {
        const task = TaskDTO.to(value, this._workspaceContextServer, true);
        this._taskService.run(task).then(void 0, (reason) => {
        });
        const result = {
          id: task._id,
          task: TaskDTO.from(task)
        };
        resolve(result);
      }
    });
  }
  $customExecutionComplete(id, result) {
    return new Promise((resolve, reject) => {
      this._taskService.getActiveTasks().then((tasks) => {
        for (const task of tasks) {
          if (id === task._id) {
            this._taskService.extensionCallbackTaskComplete(task, result).then((value) => {
              resolve(void 0);
            }, (error) => {
              reject(error);
            });
            return;
          }
        }
        reject(new Error("Task to mark as complete not found"));
      });
    });
  }
  $terminateTask(id) {
    return new Promise((resolve, reject) => {
      this._taskService.getActiveTasks().then((tasks) => {
        for (const task of tasks) {
          if (id === task._id) {
            this._taskService.terminate(task).then((value) => {
              resolve(void 0);
            }, (error) => {
              reject(void 0);
            });
            return;
          }
        }
        reject(new ErrorNoTelemetry("Task to terminate not found"));
      });
    });
  }
  $registerTaskSystem(key, info) {
    let platform;
    switch (info.platform) {
      case "Web":
        platform = Platform.Platform.Web;
        break;
      case "win32":
        platform = Platform.Platform.Windows;
        break;
      case "darwin":
        platform = Platform.Platform.Mac;
        break;
      case "linux":
        platform = Platform.Platform.Linux;
        break;
      default:
        platform = Platform.platform;
    }
    this._taskService.registerTaskSystem(key, {
      platform,
      uriProvider: (path) => {
        return URI.from({ scheme: info.scheme, authority: info.authority, path });
      },
      context: this._extHostContext,
      resolveVariables: (workspaceFolder, toResolve, target) => {
        const vars = [];
        toResolve.variables.forEach((item) => vars.push(item));
        return Promise.resolve(this._proxy.$resolveVariables(workspaceFolder.uri, { process: toResolve.process, variables: vars })).then((values) => {
          const partiallyResolvedVars = Array.from(Object.values(values.variables));
          return new Promise((resolve, reject) => {
            this._configurationResolverService.resolveWithInteraction(workspaceFolder, partiallyResolvedVars, "tasks", void 0, target).then((resolvedVars) => {
              if (!resolvedVars) {
                resolve(void 0);
              }
              const result = {
                process: void 0,
                variables: /* @__PURE__ */ new Map()
              };
              for (let i = 0; i < partiallyResolvedVars.length; i++) {
                const variableName = vars[i].substring(2, vars[i].length - 1);
                if (resolvedVars && values.variables[vars[i]] === vars[i]) {
                  const resolved = resolvedVars.get(variableName);
                  if (typeof resolved === "string") {
                    result.variables.set(variableName, resolved);
                  }
                } else {
                  result.variables.set(variableName, partiallyResolvedVars[i]);
                }
              }
              if (Types.isString(values.process)) {
                result.process = values.process;
              }
              resolve(result);
            }, (reason) => {
              reject(reason);
            });
          });
        });
      },
      findExecutable: (command, cwd, paths) => {
        return this._proxy.$findExecutable(command, cwd, paths);
      }
    });
  }
  async $registerSupportedExecutions(custom, shell, process) {
    return this._taskService.registerSupportedExecutions(custom, shell, process);
  }
};
MainThreadTask = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadTask),
  __decorateParam(1, ITaskService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IConfigurationResolverService)
], MainThreadTask);
export {
  MainThreadTask,
  TaskProblemMatcherEndedDto,
  TaskProblemMatcherStartedDto
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkVGFzay50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuXG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBQbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG5pbXBvcnQge1xuXHRDb250cmlidXRlZFRhc2ssIENvbmZpZ3VyaW5nVGFzaywgS2V5ZWRUYXNrSWRlbnRpZmllciwgSVRhc2tFeGVjdXRpb24sIFRhc2ssIElUYXNrRXZlbnQsXG5cdElQcmVzZW50YXRpb25PcHRpb25zLCBDb21tYW5kT3B0aW9ucywgSUNvbW1hbmRDb25maWd1cmF0aW9uLCBSdW50aW1lVHlwZSwgQ3VzdG9tVGFzaywgVGFza1Njb3BlLCBUYXNrU291cmNlLFxuXHRUYXNrU291cmNlS2luZCwgSUV4dGVuc2lvblRhc2tTb3VyY2UsIElSdW5PcHRpb25zLCBJVGFza1NldCwgVGFza0dyb3VwLCBUYXNrRGVmaW5pdGlvbiwgUHJlc2VudGF0aW9uT3B0aW9ucywgUnVuT3B0aW9uc1xufSBmcm9tICcuLi8uLi9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrcy5qcyc7XG5cblxuaW1wb3J0IHsgSVJlc29sdmVTZXQsIElSZXNvbHZlZFZhcmlhYmxlcyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGFza3MvY29tbW9uL3Rhc2tTeXN0ZW0uanMnO1xuaW1wb3J0IHsgSVRhc2tTZXJ2aWNlLCBJVGFza0ZpbHRlciwgSVRhc2tQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvbnRyaWIvdGFza3MvY29tbW9uL3Rhc2tTZXJ2aWNlLmpzJztcblxuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIE1haW5UaHJlYWRUYXNrU2hhcGUsIEV4dEhvc3RUYXNrU2hhcGUsIE1haW5Db250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHtcblx0SVRhc2tEZWZpbml0aW9uRFRPLCBJVGFza0V4ZWN1dGlvbkRUTywgSVByb2Nlc3NFeGVjdXRpb25PcHRpb25zRFRPLCBJVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8sXG5cdElQcm9jZXNzRXhlY3V0aW9uRFRPLCBJU2hlbGxFeGVjdXRpb25EVE8sIElTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8sIElDdXN0b21FeGVjdXRpb25EVE8sIElUYXNrRFRPLCBJVGFza1NvdXJjZURUTywgSVRhc2tIYW5kbGVEVE8sIElUYXNrRmlsdGVyRFRPLCBJVGFza1Byb2Nlc3NTdGFydGVkRFRPLCBJVGFza1Byb2Nlc3NFbmRlZERUTywgSVRhc2tTeXN0ZW1JbmZvRFRPLFxuXHRJUnVuT3B0aW9uc0RUTywgSVRhc2tHcm91cERUTyxcblx0SVRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWQsXG5cdElUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZCxcblx0VGFza0V2ZW50S2luZFxufSBmcm9tICcuLi9jb21tb24vc2hhcmVkL3Rhc2tzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuXG5uYW1lc3BhY2UgVGFza0V4ZWN1dGlvbkRUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJVGFza0V4ZWN1dGlvbik6IElUYXNrRXhlY3V0aW9uRFRPIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHZhbHVlLmlkLFxuXHRcdFx0dGFzazogVGFza0RUTy5mcm9tKHZhbHVlLnRhc2spXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkRHRvIHtcblx0ZXhlY3V0aW9uOiBJVGFza0V4ZWN1dGlvbkRUTztcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkRHRvIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElUYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkKTogSVRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWREdG8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRleGVjdXRpb246IHtcblx0XHRcdFx0aWQ6IHZhbHVlLmV4ZWN1dGlvbi5pZCxcblx0XHRcdFx0dGFzazogVGFza0RUTy5mcm9tKHZhbHVlLmV4ZWN1dGlvbi50YXNrKVxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRHRvIHtcblx0ZXhlY3V0aW9uOiBJVGFza0V4ZWN1dGlvbkRUTztcblx0aGFzRXJyb3JzOiBib29sZWFuO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRHRvIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZCk6IElUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZER0byB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGV4ZWN1dGlvbjoge1xuXHRcdFx0XHRpZDogdmFsdWUuZXhlY3V0aW9uLmlkLFxuXHRcdFx0XHR0YXNrOiBUYXNrRFRPLmZyb20odmFsdWUuZXhlY3V0aW9uLnRhc2spXG5cdFx0XHR9LFxuXHRcdFx0aGFzRXJyb3JzOiB2YWx1ZS5oYXNFcnJvcnNcblx0XHR9O1xuXHR9XG59XG5cblxuXG5uYW1lc3BhY2UgVGFza1Byb2Nlc3NTdGFydGVkRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElUYXNrRXhlY3V0aW9uLCBwcm9jZXNzSWQ6IG51bWJlcik6IElUYXNrUHJvY2Vzc1N0YXJ0ZWREVE8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdmFsdWUuaWQsXG5cdFx0XHRwcm9jZXNzSWRcblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBUYXNrUHJvY2Vzc0VuZGVkRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IElUYXNrRXhlY3V0aW9uLCBleGl0Q29kZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogSVRhc2tQcm9jZXNzRW5kZWREVE8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogdmFsdWUuaWQsXG5cdFx0XHRleGl0Q29kZVxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tEZWZpbml0aW9uRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IEtleWVkVGFza0lkZW50aWZpZXIpOiBJVGFza0RlZmluaXRpb25EVE8ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwgdmFsdWUpO1xuXHRcdGRlbGV0ZSByZXN1bHQuX2tleTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogSVRhc2tEZWZpbml0aW9uRFRPLCBleGVjdXRlT25seTogYm9vbGVhbik6IEtleWVkVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQgPSBUYXNrRGVmaW5pdGlvbi5jcmVhdGVUYXNrSWRlbnRpZmllcih2YWx1ZSwgY29uc29sZSk7XG5cdFx0aWYgKHJlc3VsdCA9PT0gdW5kZWZpbmVkICYmIGV4ZWN1dGVPbmx5KSB7XG5cdFx0XHRyZXN1bHQgPSB7XG5cdFx0XHRcdF9rZXk6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHR0eXBlOiAnJGV4ZWN1dGVPbmx5J1xuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5uYW1lc3BhY2UgVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSVByZXNlbnRhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQpOiBJVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCB2YWx1ZSk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8gfCB1bmRlZmluZWQpOiBJUHJlc2VudGF0aW9uT3B0aW9ucyB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBQcmVzZW50YXRpb25PcHRpb25zLmRlZmF1bHRzO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCBQcmVzZW50YXRpb25PcHRpb25zLmRlZmF1bHRzLCB2YWx1ZSk7XG5cdH1cbn1cblxubmFtZXNwYWNlIFJ1bk9wdGlvbnNEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSVJ1bk9wdGlvbnMpOiBJUnVuT3B0aW9uc0RUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBPYmplY3QuYXNzaWduKE9iamVjdC5jcmVhdGUobnVsbCksIHZhbHVlKTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IElSdW5PcHRpb25zRFRPIHwgdW5kZWZpbmVkKTogSVJ1bk9wdGlvbnMge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gUnVuT3B0aW9ucy5kZWZhdWx0cztcblx0XHR9XG5cdFx0cmV0dXJuIE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwgUnVuT3B0aW9ucy5kZWZhdWx0cywgdmFsdWUpO1xuXHR9XG59XG5cbm5hbWVzcGFjZSBQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBDb21tYW5kT3B0aW9ucyk6IElQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRjd2Q6IHZhbHVlLmN3ZCxcblx0XHRcdGVudjogdmFsdWUuZW52XG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IElQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyB8IHVuZGVmaW5lZCk6IENvbW1hbmRPcHRpb25zIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIENvbW1hbmRPcHRpb25zLmRlZmF1bHRzO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3dkOiB2YWx1ZS5jd2QgfHwgQ29tbWFuZE9wdGlvbnMuZGVmYXVsdHMuY3dkLFxuXHRcdFx0ZW52OiB2YWx1ZS5lbnZcblx0XHR9O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBQcm9jZXNzRXhlY3V0aW9uRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiBJU2hlbGxFeGVjdXRpb25EVE8gfCBJUHJvY2Vzc0V4ZWN1dGlvbkRUTyB8IElDdXN0b21FeGVjdXRpb25EVE8pOiB2YWx1ZSBpcyBJUHJvY2Vzc0V4ZWN1dGlvbkRUTyB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWUgYXMgSVByb2Nlc3NFeGVjdXRpb25EVE87XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiAhIWNhbmRpZGF0ZS5wcm9jZXNzO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24pOiBJUHJvY2Vzc0V4ZWN1dGlvbkRUTyB7XG5cdFx0Y29uc3QgcHJvY2Vzczogc3RyaW5nID0gVHlwZXMuaXNTdHJpbmcodmFsdWUubmFtZSkgPyB2YWx1ZS5uYW1lIDogdmFsdWUubmFtZSEudmFsdWU7XG5cdFx0Y29uc3QgYXJnczogc3RyaW5nW10gPSB2YWx1ZS5hcmdzID8gdmFsdWUuYXJncy5tYXAodmFsdWUgPT4gVHlwZXMuaXNTdHJpbmcodmFsdWUpID8gdmFsdWUgOiB2YWx1ZS52YWx1ZSkgOiBbXTtcblx0XHRjb25zdCByZXN1bHQ6IElQcm9jZXNzRXhlY3V0aW9uRFRPID0ge1xuXHRcdFx0cHJvY2VzczogcHJvY2Vzcyxcblx0XHRcdGFyZ3M6IGFyZ3Ncblx0XHR9O1xuXHRcdGlmICh2YWx1ZS5vcHRpb25zKSB7XG5cdFx0XHRyZXN1bHQub3B0aW9ucyA9IFByb2Nlc3NFeGVjdXRpb25PcHRpb25zRFRPLmZyb20odmFsdWUub3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJUHJvY2Vzc0V4ZWN1dGlvbkRUTyk6IElDb21tYW5kQ29uZmlndXJhdGlvbiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQ29tbWFuZENvbmZpZ3VyYXRpb24gPSB7XG5cdFx0XHRydW50aW1lOiBSdW50aW1lVHlwZS5Qcm9jZXNzLFxuXHRcdFx0bmFtZTogdmFsdWUucHJvY2Vzcyxcblx0XHRcdGFyZ3M6IHZhbHVlLmFyZ3MsXG5cdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0cmVzdWx0Lm9wdGlvbnMgPSBQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTy50byh2YWx1ZS5vcHRpb25zKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogQ29tbWFuZE9wdGlvbnMpOiBJU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBJU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPID0ge1xuXHRcdFx0Y3dkOiB2YWx1ZS5jd2QgfHwgQ29tbWFuZE9wdGlvbnMuZGVmYXVsdHMuY3dkLFxuXHRcdFx0ZW52OiB2YWx1ZS5lbnZcblx0XHR9O1xuXHRcdGlmICh2YWx1ZS5zaGVsbCkge1xuXHRcdFx0cmVzdWx0LmV4ZWN1dGFibGUgPSB2YWx1ZS5zaGVsbC5leGVjdXRhYmxlO1xuXHRcdFx0cmVzdWx0LnNoZWxsQXJncyA9IHZhbHVlLnNoZWxsLmFyZ3M7XG5cdFx0XHRyZXN1bHQuc2hlbGxRdW90aW5nID0gdmFsdWUuc2hlbGwucXVvdGluZztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IElTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8pOiBDb21tYW5kT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogQ29tbWFuZE9wdGlvbnMgPSB7XG5cdFx0XHRjd2Q6IHZhbHVlLmN3ZCxcblx0XHRcdGVudjogdmFsdWUuZW52XG5cdFx0fTtcblx0XHRpZiAodmFsdWUuZXhlY3V0YWJsZSkge1xuXHRcdFx0cmVzdWx0LnNoZWxsID0ge1xuXHRcdFx0XHRleGVjdXRhYmxlOiB2YWx1ZS5leGVjdXRhYmxlXG5cdFx0XHR9O1xuXHRcdFx0aWYgKHZhbHVlLnNoZWxsQXJncykge1xuXHRcdFx0XHRyZXN1bHQuc2hlbGwuYXJncyA9IHZhbHVlLnNoZWxsQXJncztcblx0XHRcdH1cblx0XHRcdGlmICh2YWx1ZS5zaGVsbFF1b3RpbmcpIHtcblx0XHRcdFx0cmVzdWx0LnNoZWxsLnF1b3RpbmcgPSB2YWx1ZS5zaGVsbFF1b3Rpbmc7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxubmFtZXNwYWNlIFNoZWxsRXhlY3V0aW9uRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiBJU2hlbGxFeGVjdXRpb25EVE8gfCBJUHJvY2Vzc0V4ZWN1dGlvbkRUTyB8IElDdXN0b21FeGVjdXRpb25EVE8pOiB2YWx1ZSBpcyBJU2hlbGxFeGVjdXRpb25EVE8ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIElTaGVsbEV4ZWN1dGlvbkRUTztcblx0XHRyZXR1cm4gY2FuZGlkYXRlICYmICghIWNhbmRpZGF0ZS5jb21tYW5kTGluZSB8fCAhIWNhbmRpZGF0ZS5jb21tYW5kKTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSUNvbW1hbmRDb25maWd1cmF0aW9uKTogSVNoZWxsRXhlY3V0aW9uRFRPIHtcblx0XHRjb25zdCByZXN1bHQ6IElTaGVsbEV4ZWN1dGlvbkRUTyA9IHt9O1xuXHRcdGlmICh2YWx1ZS5uYW1lICYmIFR5cGVzLmlzU3RyaW5nKHZhbHVlLm5hbWUpICYmICh2YWx1ZS5hcmdzID09PSB1bmRlZmluZWQgfHwgdmFsdWUuYXJncyA9PT0gbnVsbCB8fCB2YWx1ZS5hcmdzLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdHJlc3VsdC5jb21tYW5kTGluZSA9IHZhbHVlLm5hbWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlc3VsdC5jb21tYW5kID0gdmFsdWUubmFtZTtcblx0XHRcdHJlc3VsdC5hcmdzID0gdmFsdWUuYXJncztcblx0XHR9XG5cdFx0aWYgKHZhbHVlLm9wdGlvbnMpIHtcblx0XHRcdHJlc3VsdC5vcHRpb25zID0gU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPLmZyb20odmFsdWUub3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJU2hlbGxFeGVjdXRpb25EVE8pOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24ge1xuXHRcdGNvbnN0IHJlc3VsdDogSUNvbW1hbmRDb25maWd1cmF0aW9uID0ge1xuXHRcdFx0cnVudGltZTogUnVudGltZVR5cGUuU2hlbGwsXG5cdFx0XHRuYW1lOiB2YWx1ZS5jb21tYW5kTGluZSA/IHZhbHVlLmNvbW1hbmRMaW5lIDogdmFsdWUuY29tbWFuZCxcblx0XHRcdGFyZ3M6IHZhbHVlLmFyZ3MsXG5cdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZFxuXHRcdH07XG5cdFx0aWYgKHZhbHVlLm9wdGlvbnMpIHtcblx0XHRcdHJlc3VsdC5vcHRpb25zID0gU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPLnRvKHZhbHVlLm9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBDdXN0b21FeGVjdXRpb25EVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gaXModmFsdWU6IElTaGVsbEV4ZWN1dGlvbkRUTyB8IElQcm9jZXNzRXhlY3V0aW9uRFRPIHwgSUN1c3RvbUV4ZWN1dGlvbkRUTyk6IHZhbHVlIGlzIElDdXN0b21FeGVjdXRpb25EVE8ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIElDdXN0b21FeGVjdXRpb25EVE87XG5cdFx0cmV0dXJuIGNhbmRpZGF0ZSAmJiBjYW5kaWRhdGUuY3VzdG9tRXhlY3V0aW9uID09PSAnY3VzdG9tRXhlY3V0aW9uJztcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24pOiBJQ3VzdG9tRXhlY3V0aW9uRFRPIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VzdG9tRXhlY3V0aW9uOiAnY3VzdG9tRXhlY3V0aW9uJ1xuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IElDdXN0b21FeGVjdXRpb25EVE8pOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRydW50aW1lOiBSdW50aW1lVHlwZS5DdXN0b21FeGVjdXRpb24sXG5cdFx0XHRwcmVzZW50YXRpb246IHVuZGVmaW5lZFxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tTb3VyY2VEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogVGFza1NvdXJjZSk6IElUYXNrU291cmNlRFRPIHtcblx0XHRjb25zdCByZXN1bHQ6IElUYXNrU291cmNlRFRPID0ge1xuXHRcdFx0bGFiZWw6IHZhbHVlLmxhYmVsXG5cdFx0fTtcblx0XHRpZiAodmFsdWUua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuRXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXN1bHQuZXh0ZW5zaW9uSWQgPSB2YWx1ZS5leHRlbnNpb247XG5cdFx0XHRpZiAodmFsdWUud29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdHJlc3VsdC5zY29wZSA9IHZhbHVlLndvcmtzcGFjZUZvbGRlci51cmk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQuc2NvcGUgPSB2YWx1ZS5zY29wZTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHZhbHVlLmtpbmQgPT09IFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZSkge1xuXHRcdFx0cmVzdWx0LmV4dGVuc2lvbklkID0gJyRjb3JlJztcblx0XHRcdHJlc3VsdC5zY29wZSA9IHZhbHVlLmNvbmZpZy53b3Jrc3BhY2VGb2xkZXIgPyB2YWx1ZS5jb25maWcud29ya3NwYWNlRm9sZGVyLnVyaSA6IFRhc2tTY29wZS5HbG9iYWw7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiBJVGFza1NvdXJjZURUTywgd29ya3NwYWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpOiBJRXh0ZW5zaW9uVGFza1NvdXJjZSB7XG5cdFx0bGV0IHNjb3BlOiBUYXNrU2NvcGU7XG5cdFx0bGV0IHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAoKHZhbHVlLnNjb3BlID09PSB1bmRlZmluZWQpIHx8ICgodHlwZW9mIHZhbHVlLnNjb3BlID09PSAnbnVtYmVyJykgJiYgKHZhbHVlLnNjb3BlICE9PSBUYXNrU2NvcGUuR2xvYmFsKSkpIHtcblx0XHRcdGlmICh3b3Jrc3BhY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0c2NvcGUgPSBUYXNrU2NvcGUuR2xvYmFsO1xuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzY29wZSA9IFRhc2tTY29wZS5Gb2xkZXI7XG5cdFx0XHRcdHdvcmtzcGFjZUZvbGRlciA9IHdvcmtzcGFjZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlLnNjb3BlID09PSAnbnVtYmVyJykge1xuXHRcdFx0c2NvcGUgPSB2YWx1ZS5zY29wZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c2NvcGUgPSBUYXNrU2NvcGUuRm9sZGVyO1xuXHRcdFx0d29ya3NwYWNlRm9sZGVyID0gd29ya3NwYWNlLmdldFdvcmtzcGFjZUZvbGRlcihVUkkucmV2aXZlKHZhbHVlLnNjb3BlKSkgPz8gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElFeHRlbnNpb25UYXNrU291cmNlID0ge1xuXHRcdFx0a2luZDogVGFza1NvdXJjZUtpbmQuRXh0ZW5zaW9uLFxuXHRcdFx0bGFiZWw6IHZhbHVlLmxhYmVsLFxuXHRcdFx0ZXh0ZW5zaW9uOiB2YWx1ZS5leHRlbnNpb25JZCxcblx0XHRcdHNjb3BlLFxuXHRcdFx0d29ya3NwYWNlRm9sZGVyXG5cdFx0fTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbm5hbWVzcGFjZSBUYXNrSGFuZGxlRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSVRhc2tIYW5kbGVEVE8ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIElUYXNrSGFuZGxlRFRPIHwgdW5kZWZpbmVkO1xuXHRcdHJldHVybiAhIWNhbmRpZGF0ZSAmJiBUeXBlcy5pc1N0cmluZyhjYW5kaWRhdGUuaWQpICYmICEhY2FuZGlkYXRlLndvcmtzcGFjZUZvbGRlcjtcblx0fVxufVxuXG5uYW1lc3BhY2UgVGFza0RUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHRhc2s6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2spOiBJVGFza0RUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRhc2sgPT09IHVuZGVmaW5lZCB8fCB0YXNrID09PSBudWxsIHx8ICghQ3VzdG9tVGFzay5pcyh0YXNrKSAmJiAhQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spICYmICFDb25maWd1cmluZ1Rhc2suaXModGFzaykpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElUYXNrRFRPID0ge1xuXHRcdFx0X2lkOiB0YXNrLl9pZCxcblx0XHRcdG5hbWU6IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSxcblx0XHRcdGRlZmluaXRpb246IFRhc2tEZWZpbml0aW9uRFRPLmZyb20odGFzay5nZXREZWZpbml0aW9uKHRydWUpKSxcblx0XHRcdHNvdXJjZTogVGFza1NvdXJjZURUTy5mcm9tKHRhc2suX3NvdXJjZSksXG5cdFx0XHRleGVjdXRpb246IHVuZGVmaW5lZCxcblx0XHRcdHByZXNlbnRhdGlvbk9wdGlvbnM6ICFDb25maWd1cmluZ1Rhc2suaXModGFzaykgJiYgdGFzay5jb21tYW5kID8gVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8uZnJvbSh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uKSA6IHVuZGVmaW5lZCxcblx0XHRcdGlzQmFja2dyb3VuZDogdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQsXG5cdFx0XHRwcm9ibGVtTWF0Y2hlcnM6IFtdLFxuXHRcdFx0aGFzRGVmaW5lZE1hdGNoZXJzOiBDb250cmlidXRlZFRhc2suaXModGFzaykgPyB0YXNrLmhhc0RlZmluZWRNYXRjaGVycyA6IGZhbHNlLFxuXHRcdFx0cnVuT3B0aW9uczogUnVuT3B0aW9uc0RUTy5mcm9tKHRhc2sucnVuT3B0aW9ucyksXG5cdFx0fTtcblx0XHRyZXN1bHQuZ3JvdXAgPSBUYXNrR3JvdXBEVE8uZnJvbSh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKTtcblxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRldGFpbCkge1xuXHRcdFx0cmVzdWx0LmRldGFpbCA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGV0YWlsO1xuXHRcdH1cblx0XHRpZiAoIUNvbmZpZ3VyaW5nVGFzay5pcyh0YXNrKSAmJiB0YXNrLmNvbW1hbmQpIHtcblx0XHRcdHN3aXRjaCAodGFzay5jb21tYW5kLnJ1bnRpbWUpIHtcblx0XHRcdFx0Y2FzZSBSdW50aW1lVHlwZS5Qcm9jZXNzOiByZXN1bHQuZXhlY3V0aW9uID0gUHJvY2Vzc0V4ZWN1dGlvbkRUTy5mcm9tKHRhc2suY29tbWFuZCk7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIFJ1bnRpbWVUeXBlLlNoZWxsOiByZXN1bHQuZXhlY3V0aW9uID0gU2hlbGxFeGVjdXRpb25EVE8uZnJvbSh0YXNrLmNvbW1hbmQpOyBicmVhaztcblx0XHRcdFx0Y2FzZSBSdW50aW1lVHlwZS5DdXN0b21FeGVjdXRpb246IHJlc3VsdC5leGVjdXRpb24gPSBDdXN0b21FeGVjdXRpb25EVE8uZnJvbSh0YXNrLmNvbW1hbmQpOyBicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1hdGNoZXIgb2YgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMpIHtcblx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKG1hdGNoZXIpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnByb2JsZW1NYXRjaGVycy5wdXNoKG1hdGNoZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdG8odGFzazogSVRhc2tEVE8gfCB1bmRlZmluZWQsIHdvcmtzcGFjZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBleGVjdXRlT25seTogYm9vbGVhbiwgaWNvbj86IHsgaWQ/OiBzdHJpbmc7IGNvbG9yPzogc3RyaW5nIH0sIGhpZGU/OiBib29sZWFuKTogQ29udHJpYnV0ZWRUYXNrIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRhc2sgfHwgKHR5cGVvZiB0YXNrLm5hbWUgIT09ICdzdHJpbmcnKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgY29tbWFuZDogSUNvbW1hbmRDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0YXNrLmV4ZWN1dGlvbikge1xuXHRcdFx0aWYgKFNoZWxsRXhlY3V0aW9uRFRPLmlzKHRhc2suZXhlY3V0aW9uKSkge1xuXHRcdFx0XHRjb21tYW5kID0gU2hlbGxFeGVjdXRpb25EVE8udG8odGFzay5leGVjdXRpb24pO1xuXHRcdFx0fSBlbHNlIGlmIChQcm9jZXNzRXhlY3V0aW9uRFRPLmlzKHRhc2suZXhlY3V0aW9uKSkge1xuXHRcdFx0XHRjb21tYW5kID0gUHJvY2Vzc0V4ZWN1dGlvbkRUTy50byh0YXNrLmV4ZWN1dGlvbik7XG5cdFx0XHR9IGVsc2UgaWYgKEN1c3RvbUV4ZWN1dGlvbkRUTy5pcyh0YXNrLmV4ZWN1dGlvbikpIHtcblx0XHRcdFx0Y29tbWFuZCA9IEN1c3RvbUV4ZWN1dGlvbkRUTy50byh0YXNrLmV4ZWN1dGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb21tYW5kLnByZXNlbnRhdGlvbiA9IFRhc2tQcmVzZW50YXRpb25PcHRpb25zRFRPLnRvKHRhc2sucHJlc2VudGF0aW9uT3B0aW9ucyk7XG5cdFx0Y29uc3Qgc291cmNlID0gVGFza1NvdXJjZURUTy50byh0YXNrLnNvdXJjZSwgd29ya3NwYWNlKTtcblxuXHRcdGNvbnN0IGxhYmVsID0gbmxzLmxvY2FsaXplKCd0YXNrLmxhYmVsJywgJ3swfTogezF9Jywgc291cmNlLmxhYmVsLCB0YXNrLm5hbWUpO1xuXHRcdGNvbnN0IGRlZmluaXRpb24gPSBUYXNrRGVmaW5pdGlvbkRUTy50byh0YXNrLmRlZmluaXRpb24sIGV4ZWN1dGVPbmx5KSE7XG5cdFx0Y29uc3QgaWQgPSAoQ3VzdG9tRXhlY3V0aW9uRFRPLmlzKHRhc2suZXhlY3V0aW9uISkgJiYgdGFzay5faWQpID8gdGFzay5faWQgOiBgJHt0YXNrLnNvdXJjZS5leHRlbnNpb25JZH0uJHtkZWZpbml0aW9uLl9rZXl9YDtcblx0XHRjb25zdCByZXN1bHQ6IENvbnRyaWJ1dGVkVGFzayA9IG5ldyBDb250cmlidXRlZFRhc2soXG5cdFx0XHRpZCwgLy8gdXVpZE1hcC5nZXRVVUlEKGlkZW50aWZpZXIpXG5cdFx0XHRzb3VyY2UsXG5cdFx0XHRsYWJlbCxcblx0XHRcdGRlZmluaXRpb24udHlwZSxcblx0XHRcdGRlZmluaXRpb24sXG5cdFx0XHRjb21tYW5kLFxuXHRcdFx0dGFzay5oYXNEZWZpbmVkTWF0Y2hlcnMsXG5cdFx0XHRSdW5PcHRpb25zRFRPLnRvKHRhc2sucnVuT3B0aW9ucyksXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6IHRhc2submFtZSxcblx0XHRcdFx0aWRlbnRpZmllcjogbGFiZWwsXG5cdFx0XHRcdGdyb3VwOiB0YXNrLmdyb3VwLFxuXHRcdFx0XHRpc0JhY2tncm91bmQ6ICEhdGFzay5pc0JhY2tncm91bmQsXG5cdFx0XHRcdHByb2JsZW1NYXRjaGVyczogdGFzay5wcm9ibGVtTWF0Y2hlcnMuc2xpY2UoKSxcblx0XHRcdFx0ZGV0YWlsOiB0YXNrLmRldGFpbCxcblx0XHRcdFx0aWNvbixcblx0XHRcdFx0aGlkZVxuXHRcdFx0fVxuXHRcdCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5uYW1lc3BhY2UgVGFza0dyb3VwRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHN0cmluZyB8IFRhc2tHcm91cCB8IHVuZGVmaW5lZCk6IElUYXNrR3JvdXBEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0X2lkOiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykgPyB2YWx1ZSA6IHZhbHVlLl9pZCxcblx0XHRcdGlzRGVmYXVsdDogKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpID8gZmFsc2UgOiAoKHR5cGVvZiB2YWx1ZS5pc0RlZmF1bHQgPT09ICdzdHJpbmcnKSA/IGZhbHNlIDogdmFsdWUuaXNEZWZhdWx0KVxuXHRcdH07XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tGaWx0ZXJEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogSVRhc2tGaWx0ZXIpOiBJVGFza0ZpbHRlckRUTyB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogSVRhc2tGaWx0ZXJEVE8gfCB1bmRlZmluZWQpOiBJVGFza0ZpbHRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkVGFzaylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkVGFzayBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkVGFza1NoYXBlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9leHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogRXh0SG9zdFRhc2tTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzOiBNYXA8bnVtYmVyLCB7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlOyBwcm92aWRlcjogSVRhc2tQcm92aWRlciB9PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJVGFza1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGFza1NlcnZpY2U6IElUYXNrU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2ZXI6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RDb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RUYXNrKTtcblx0XHR0aGlzLl9wcm92aWRlcnMgPSBuZXcgTWFwKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFza1NlcnZpY2Uub25EaWRTdGF0ZUNoYW5nZShhc3luYyAoZXZlbnQ6IElUYXNrRXZlbnQpID0+IHtcblx0XHRcdGlmIChldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLkNoYW5nZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0YXNrID0gZXZlbnQuX190YXNrO1xuXHRcdFx0aWYgKGV2ZW50LmtpbmQgPT09IFRhc2tFdmVudEtpbmQuU3RhcnQpIHtcblx0XHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gVGFza0V4ZWN1dGlvbkRUTy5mcm9tKHRhc2suZ2V0VGFza0V4ZWN1dGlvbigpKTtcblx0XHRcdFx0bGV0IHJlc29sdmVkRGVmaW5pdGlvbjogSVRhc2tEZWZpbml0aW9uRFRPID0gZXhlY3V0aW9uLnRhc2shLmRlZmluaXRpb247XG5cdFx0XHRcdGlmIChleGVjdXRpb24udGFzaz8uZXhlY3V0aW9uICYmIEN1c3RvbUV4ZWN1dGlvbkRUTy5pcyhleGVjdXRpb24udGFzay5leGVjdXRpb24pICYmIGV2ZW50LnJlc29sdmVkVmFyaWFibGVzKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UoZXhlY3V0aW9uLnRhc2suZGVmaW5pdGlvbik7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCByZXBsYWNlbWVudCBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmFsdWUgPSBldmVudC5yZXNvbHZlZFZhcmlhYmxlcy5nZXQocmVwbGFjZW1lbnQuaW5uZXIpO1xuXHRcdFx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0ZXhwci5yZXNvbHZlKHJlcGxhY2VtZW50LCB2YWx1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmVzb2x2ZWREZWZpbml0aW9uID0gYXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZlQXN5bmModGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKSwgZXhwcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkU3RhcnRUYXNrKGV4ZWN1dGlvbiwgZXZlbnQudGVybWluYWxJZCwgcmVzb2x2ZWREZWZpbml0aW9uKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5Qcm9jZXNzU3RhcnRlZCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRTdGFydFRhc2tQcm9jZXNzKFRhc2tQcm9jZXNzU3RhcnRlZERUTy5mcm9tKHRhc2suZ2V0VGFza0V4ZWN1dGlvbigpLCBldmVudC5wcm9jZXNzSWQpKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5Qcm9jZXNzRW5kZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJveHkuJG9uRGlkRW5kVGFza1Byb2Nlc3MoVGFza1Byb2Nlc3NFbmRlZERUTy5mcm9tKHRhc2suZ2V0VGFza0V4ZWN1dGlvbigpLCBldmVudC5leGl0Q29kZSkpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLkVuZCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kT25EaWRFbmRUYXNrKFRhc2tFeGVjdXRpb25EVE8uZnJvbSh0YXNrLmdldFRhc2tFeGVjdXRpb24oKSkpO1xuXHRcdFx0fSBlbHNlIGlmIChldmVudC5raW5kID09PSBUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyU3RhcnRlZCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRTdGFydFRhc2tQcm9ibGVtTWF0Y2hlcnMoVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZER0by5mcm9tKHsgZXhlY3V0aW9uOiB0YXNrLmdldFRhc2tFeGVjdXRpb24oKSB9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2ZW50LmtpbmQgPT09IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJFbmRlZCkge1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kb25EaWRFbmRUYXNrUHJvYmxlbU1hdGNoZXJzKFRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRHRvLmZyb20oeyBleGVjdXRpb246IHRhc2suZ2V0VGFza0V4ZWN1dGlvbigpLCBoYXNFcnJvcnM6IGZhbHNlIH0pKTtcblx0XHRcdH0gZWxzZSBpZiAoZXZlbnQua2luZCA9PT0gVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlckZvdW5kRXJyb3JzKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRvbkRpZEVuZFRhc2tQcm9ibGVtTWF0Y2hlcnMoVGFza1Byb2JsZW1NYXRjaGVyRW5kZWREdG8uZnJvbSh7IGV4ZWN1dGlvbjogdGFzay5nZXRUYXNrRXhlY3V0aW9uKCksIGhhc0Vycm9yczogdHJ1ZSB9KSk7XG5cdFx0XHR9XG5cblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHRoaXMuX3Byb3ZpZGVycy52YWx1ZXMoKSkge1xuXHRcdFx0dmFsdWUuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Byb3ZpZGVycy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdCRjcmVhdGVUYXNrSWQodGFza0RUTzogSVRhc2tEVE8pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCB0YXNrID0gVGFza0RUTy50byh0YXNrRFRPLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmVyLCB0cnVlKTtcblx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdHJlc29sdmUodGFzay5faWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignVGFzayBjb3VsZCBub3QgYmUgY3JlYXRlZCBmcm9tIERUTycpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyAkcmVnaXN0ZXJUYXNrUHJvdmlkZXIoaGFuZGxlOiBudW1iZXIsIHR5cGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyOiBJVGFza1Byb3ZpZGVyID0ge1xuXHRcdFx0cHJvdmlkZVRhc2tzOiAodmFsaWRUeXBlczogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj4pID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl9wcm94eS4kcHJvdmlkZVRhc2tzKGhhbmRsZSwgdmFsaWRUeXBlcykpLnRoZW4oKHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGFza3M6IFRhc2tbXSA9IFtdO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgZHRvIG9mIHZhbHVlLnRhc2tzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0YXNrID0gVGFza0RUTy50byhkdG8sIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2ZXIsIHRydWUpO1xuXHRcdFx0XHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0XHRcdFx0dGFza3MucHVzaCh0YXNrKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnNvbGUuZXJyb3IoYFRhc2sgU3lzdGVtOiBjYW4gbm90IGNvbnZlcnQgdGFzazogJHtKU09OLnN0cmluZ2lmeShkdG8uZGVmaW5pdGlvbiwgdW5kZWZpbmVkLCAwKX0uIFRhc2sgd2lsbCBiZSBkcm9wcGVkYCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHByb2Nlc3NlZEV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uID0ge1xuXHRcdFx0XHRcdFx0Li4udmFsdWUuZXh0ZW5zaW9uLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uTG9jYXRpb246IFVSSS5yZXZpdmUodmFsdWUuZXh0ZW5zaW9uLmV4dGVuc2lvbkxvY2F0aW9uKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHRhc2tzLFxuXHRcdFx0XHRcdFx0ZXh0ZW5zaW9uOiBwcm9jZXNzZWRFeHRlbnNpb25cblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJVGFza1NldDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZVRhc2s6ICh0YXNrOiBDb25maWd1cmluZ1Rhc2spID0+IHtcblx0XHRcdFx0Y29uc3QgZHRvID0gVGFza0RUTy5mcm9tKHRhc2spO1xuXG5cdFx0XHRcdGlmIChkdG8pIHtcblx0XHRcdFx0XHRkdG8ubmFtZSA9ICgoZHRvLm5hbWUgPT09IHVuZGVmaW5lZCkgPyAnJyA6IGR0by5uYW1lKTsgLy8gVXNpbmcgYW4gZW1wdHkgbmFtZSBjYXVzZXMgdGhlIG5hbWUgdG8gZGVmYXVsdCB0byB0aGUgb25lIGdpdmVuIGJ5IHRoZSBwcm92aWRlci5cblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX3Byb3h5LiRyZXNvbHZlVGFzayhoYW5kbGUsIGR0bykpLnRoZW4ocmVzb2x2ZWRUYXNrID0+IHtcblx0XHRcdFx0XHRcdGlmIChyZXNvbHZlZFRhc2spIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFRhc2tEVE8udG8ocmVzb2x2ZWRUYXNrLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmVyLCB0cnVlLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24sIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaGlkZSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZTxDb250cmlidXRlZFRhc2sgfCB1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5fdGFza1NlcnZpY2UucmVnaXN0ZXJUYXNrUHJvdmlkZXIocHJvdmlkZXIsIHR5cGUpO1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQoaGFuZGxlLCB7IGRpc3Bvc2FibGUsIHByb3ZpZGVyIH0pO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyAkdW5yZWdpc3RlclRhc2tQcm92aWRlcihoYW5kbGU6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0cHJvdmlkZXIuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9wcm92aWRlcnMuZGVsZXRlKGhhbmRsZSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHB1YmxpYyAkZmV0Y2hUYXNrcyhmaWx0ZXI/OiBJVGFza0ZpbHRlckRUTyk6IFByb21pc2U8SVRhc2tEVE9bXT4ge1xuXHRcdHJldHVybiB0aGlzLl90YXNrU2VydmljZS50YXNrcyhUYXNrRmlsdGVyRFRPLnRvKGZpbHRlcikpLnRoZW4oKHRhc2tzKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IElUYXNrRFRPW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gVGFza0RUTy5mcm9tKHRhc2spO1xuXHRcdFx0XHRpZiAoaXRlbSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2UodmFsdWU6IFVyaUNvbXBvbmVudHMgfCBzdHJpbmcpOiBzdHJpbmcgfCBJV29ya3NwYWNlIHwgSVdvcmtzcGFjZUZvbGRlciB8IG51bGwge1xuXHRcdGxldCB3b3Jrc3BhY2U7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHdvcmtzcGFjZSA9IHZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VPYmplY3QgPSB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmVyLmdldFdvcmtzcGFjZSgpO1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnJldml2ZSh2YWx1ZSk7XG5cdFx0XHRpZiAod29ya3NwYWNlT2JqZWN0LmNvbmZpZ3VyYXRpb24/LnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHdvcmtzcGFjZSA9IHdvcmtzcGFjZU9iamVjdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdvcmtzcGFjZSA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2ZXIuZ2V0V29ya3NwYWNlRm9sZGVyKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB3b3Jrc3BhY2U7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJGdldFRhc2tFeGVjdXRpb24odmFsdWU6IElUYXNrSGFuZGxlRFRPIHwgSVRhc2tEVE8pOiBQcm9taXNlPElUYXNrRXhlY3V0aW9uRFRPPiB7XG5cdFx0aWYgKFRhc2tIYW5kbGVEVE8uaXModmFsdWUpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmdldFdvcmtzcGFjZSh2YWx1ZS53b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRjb25zdCB0YXNrID0gYXdhaXQgdGhpcy5fdGFza1NlcnZpY2UuZ2V0VGFzayh3b3Jrc3BhY2UsIHZhbHVlLmlkLCB0cnVlKTtcblx0XHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0aWQ6IHRhc2suX2lkLFxuXHRcdFx0XHRcdFx0dGFzazogVGFza0RUTy5mcm9tKHRhc2spXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Rhc2sgbm90IGZvdW5kJyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIHdvcmtzcGFjZSBmb2xkZXInKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdGFzayA9IFRhc2tEVE8udG8odmFsdWUsIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2ZXIsIHRydWUpITtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiB0YXNrLl9pZCxcblx0XHRcdFx0dGFzazogVGFza0RUTy5mcm9tKHRhc2spXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdC8vIFBhc3NpbmcgaW4gYSBUYXNrSGFuZGxlRFRPIHdpbGwgY2F1c2UgdGhlIHRhc2sgdG8gZ2V0IHJlLXJlc29sdmVkLCB3aGljaCBpcyBpbXBvcnRhbnQgZm9yIHRhc2tzIGFyZSBjb21pbmcgZnJvbSB0aGUgY29yZSxcblx0Ly8gc3VjaCBhcyB0aG9zZSBnb3R0ZW4gZnJvbSBhIGZldGNoVGFza3MsIHNpbmNlIHRoZXkgY2FuIGhhdmUgbWlzc2luZyBjb25maWd1cmF0aW9uIHByb3BlcnRpZXMuXG5cdHB1YmxpYyAkZXhlY3V0ZVRhc2sodmFsdWU6IElUYXNrSGFuZGxlRFRPIHwgSVRhc2tEVE8pOiBQcm9taXNlPElUYXNrRXhlY3V0aW9uRFRPPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElUYXNrRXhlY3V0aW9uRFRPPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRpZiAoVGFza0hhbmRsZURUTy5pcyh2YWx1ZSkpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5nZXRXb3Jrc3BhY2UodmFsdWUud29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLmdldFRhc2sod29ya3NwYWNlLCB2YWx1ZS5pZCwgdHJ1ZSkudGhlbigodGFzazogVGFzayB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCF0YXNrKSB7XG5cdFx0XHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ1Rhc2sgbm90IGZvdW5kJykpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0OiBJVGFza0V4ZWN1dGlvbkRUTyA9IHtcblx0XHRcdFx0XHRcdFx0XHRpZDogdmFsdWUuaWQsXG5cdFx0XHRcdFx0XHRcdFx0dGFzazogVGFza0RUTy5mcm9tKHRhc2spXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLnJ1bih0YXNrKS50aGVuKHN1bW1hcnkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdC8vIEVuc3VyZSB0aGF0IHRoZSB0YXNrIGV4ZWN1dGlvbiBnZXRzIGNsZWFuZWQgdXAgaWYgdGhlIGV4aXQgY29kZSBpcyB1bmRlZmluZWRcblx0XHRcdFx0XHRcdFx0XHQvLyBUaGlzIGNhbiBoYXBwZW4gd2hlbiB0aGUgdGFzayBoYXMgZGVwZW5kZW50IHRhc2tzIGFuZCBvbmUgb2YgdGhlbSBmYWlsZWRcblx0XHRcdFx0XHRcdFx0XHRpZiAoKHN1bW1hcnk/LmV4aXRDb2RlID09PSB1bmRlZmluZWQpIHx8IChzdW1tYXJ5LmV4aXRDb2RlICE9PSAwKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fcHJveHkuJE9uRGlkRW5kVGFzayhyZXN1bHQpO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSwgcmVhc29uID0+IHtcblx0XHRcdFx0XHRcdFx0XHQvLyBlYXQgdGhlIGVycm9yLCBpdCBoYXMgYWxyZWFkeSBiZWVuIHN1cmZhY2VkIHRvIHRoZSB1c2VyIGFuZCB3ZSBkb24ndCBjYXJlIGFib3V0IGl0IGhlcmVcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCAoX2Vycm9yKSA9PiB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCdUYXNrIG5vdCBmb3VuZCcpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCdObyB3b3Jrc3BhY2UgZm9sZGVyJykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0YXNrID0gVGFza0RUTy50byh2YWx1ZSwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZlciwgdHJ1ZSkhO1xuXHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS5ydW4odGFzaykudGhlbih1bmRlZmluZWQsIHJlYXNvbiA9PiB7XG5cdFx0XHRcdFx0Ly8gZWF0IHRoZSBlcnJvciwgaXQgaGFzIGFscmVhZHkgYmVlbiBzdXJmYWNlZCB0byB0aGUgdXNlciBhbmQgd2UgZG9uJ3QgY2FyZSBhYm91dCBpdCBoZXJlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IElUYXNrRXhlY3V0aW9uRFRPID0ge1xuXHRcdFx0XHRcdGlkOiB0YXNrLl9pZCxcblx0XHRcdFx0XHR0YXNrOiBUYXNrRFRPLmZyb20odGFzaylcblx0XHRcdFx0fTtcblx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblxuXHRwdWJsaWMgJGN1c3RvbUV4ZWN1dGlvbkNvbXBsZXRlKGlkOiBzdHJpbmcsIHJlc3VsdD86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLl90YXNrU2VydmljZS5nZXRBY3RpdmVUYXNrcygpLnRoZW4oKHRhc2tzKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdGlmIChpZCA9PT0gdGFzay5faWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tTZXJ2aWNlLmV4dGVuc2lvbkNhbGxiYWNrVGFza0NvbXBsZXRlKHRhc2ssIHJlc3VsdCkudGhlbigodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fSwgKGVycm9yKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcignVGFzayB0byBtYXJrIGFzIGNvbXBsZXRlIG5vdCBmb3VuZCcpKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljICR0ZXJtaW5hdGVUYXNrKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5fdGFza1NlcnZpY2UuZ2V0QWN0aXZlVGFza3MoKS50aGVuKCh0YXNrcykgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0XHRpZiAoaWQgPT09IHRhc2suX2lkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrU2VydmljZS50ZXJtaW5hdGUodGFzaykudGhlbigodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fSwgKGVycm9yKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlamVjdCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3JOb1RlbGVtZXRyeSgnVGFzayB0byB0ZXJtaW5hdGUgbm90IGZvdW5kJykpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgJHJlZ2lzdGVyVGFza1N5c3RlbShrZXk6IHN0cmluZywgaW5mbzogSVRhc2tTeXN0ZW1JbmZvRFRPKTogdm9pZCB7XG5cdFx0bGV0IHBsYXRmb3JtOiBQbGF0Zm9ybS5QbGF0Zm9ybTtcblx0XHRzd2l0Y2ggKGluZm8ucGxhdGZvcm0pIHtcblx0XHRcdGNhc2UgJ1dlYic6XG5cdFx0XHRcdHBsYXRmb3JtID0gUGxhdGZvcm0uUGxhdGZvcm0uV2ViO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3dpbjMyJzpcblx0XHRcdFx0cGxhdGZvcm0gPSBQbGF0Zm9ybS5QbGF0Zm9ybS5XaW5kb3dzO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2Rhcndpbic6XG5cdFx0XHRcdHBsYXRmb3JtID0gUGxhdGZvcm0uUGxhdGZvcm0uTWFjO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2xpbnV4Jzpcblx0XHRcdFx0cGxhdGZvcm0gPSBQbGF0Zm9ybS5QbGF0Zm9ybS5MaW51eDtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRwbGF0Zm9ybSA9IFBsYXRmb3JtLnBsYXRmb3JtO1xuXHRcdH1cblx0XHR0aGlzLl90YXNrU2VydmljZS5yZWdpc3RlclRhc2tTeXN0ZW0oa2V5LCB7XG5cdFx0XHRwbGF0Zm9ybTogcGxhdGZvcm0sXG5cdFx0XHR1cmlQcm92aWRlcjogKHBhdGg6IHN0cmluZyk6IFVSSSA9PiB7XG5cdFx0XHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogaW5mby5zY2hlbWUsIGF1dGhvcml0eTogaW5mby5hdXRob3JpdHksIHBhdGggfSk7XG5cdFx0XHR9LFxuXHRcdFx0Y29udGV4dDogdGhpcy5fZXh0SG9zdENvbnRleHQsXG5cdFx0XHRyZXNvbHZlVmFyaWFibGVzOiAod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCB0b1Jlc29sdmU6IElSZXNvbHZlU2V0LCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBQcm9taXNlPElSZXNvbHZlZFZhcmlhYmxlcyB8IHVuZGVmaW5lZD4gPT4ge1xuXHRcdFx0XHRjb25zdCB2YXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0XHR0b1Jlc29sdmUudmFyaWFibGVzLmZvckVhY2goaXRlbSA9PiB2YXJzLnB1c2goaXRlbSkpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX3Byb3h5LiRyZXNvbHZlVmFyaWFibGVzKHdvcmtzcGFjZUZvbGRlci51cmksIHsgcHJvY2VzczogdG9SZXNvbHZlLnByb2Nlc3MsIHZhcmlhYmxlczogdmFycyB9KSkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnRpYWxseVJlc29sdmVkVmFycyA9IEFycmF5LmZyb20oT2JqZWN0LnZhbHVlcyh2YWx1ZXMudmFyaWFibGVzKSk7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPElSZXNvbHZlZFZhcmlhYmxlcyB8IHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZlV2l0aEludGVyYWN0aW9uKHdvcmtzcGFjZUZvbGRlciwgcGFydGlhbGx5UmVzb2x2ZWRWYXJzLCAndGFza3MnLCB1bmRlZmluZWQsIHRhcmdldCkudGhlbihyZXNvbHZlZFZhcnMgPT4ge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXJlc29sdmVkVmFycykge1xuXHRcdFx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdDogSVJlc29sdmVkVmFyaWFibGVzID0ge1xuXHRcdFx0XHRcdFx0XHRcdHByb2Nlc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHR2YXJpYWJsZXM6IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KClcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYXJ0aWFsbHlSZXNvbHZlZFZhcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCB2YXJpYWJsZU5hbWUgPSB2YXJzW2ldLnN1YnN0cmluZygyLCB2YXJzW2ldLmxlbmd0aCAtIDEpO1xuXHRcdFx0XHRcdFx0XHRcdGlmIChyZXNvbHZlZFZhcnMgJiYgdmFsdWVzLnZhcmlhYmxlc1t2YXJzW2ldXSA9PT0gdmFyc1tpXSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSByZXNvbHZlZFZhcnMuZ2V0KHZhcmlhYmxlTmFtZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIHJlc29sdmVkID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXN1bHQudmFyaWFibGVzLnNldCh2YXJpYWJsZU5hbWUsIHJlc29sdmVkKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnZhcmlhYmxlcy5zZXQodmFyaWFibGVOYW1lLCBwYXJ0aWFsbHlSZXNvbHZlZFZhcnNbaV0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWVzLnByb2Nlc3MpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnByb2Nlc3MgPSB2YWx1ZXMucHJvY2Vzcztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHRcdFx0XHR9LCByZWFzb24gPT4ge1xuXHRcdFx0XHRcdFx0XHRyZWplY3QocmVhc29uKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRmaW5kRXhlY3V0YWJsZTogKGNvbW1hbmQ6IHN0cmluZywgY3dkPzogc3RyaW5nLCBwYXRocz86IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiRmaW5kRXhlY3V0YWJsZShjb21tYW5kLCBjd2QsIHBhdGhzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlclN1cHBvcnRlZEV4ZWN1dGlvbnMoY3VzdG9tPzogYm9vbGVhbiwgc2hlbGw/OiBib29sZWFuLCBwcm9jZXNzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl90YXNrU2VydmljZS5yZWdpc3RlclN1cHBvcnRlZEV4ZWN1dGlvbnMoY3VzdG9tLCBzaGVsbCwgcHJvY2Vzcyk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLG9CQUFvQjtBQUM3QixZQUFZLFdBQVc7QUFDdkIsWUFBWSxjQUFjO0FBRTFCLFNBQVMsa0JBQStCO0FBRXhDLFNBQXFCLGdDQUFrRDtBQUV2RTtBQUFBLEVBQ0M7QUFBQSxFQUFpQjtBQUFBLEVBQ0s7QUFBQSxFQUF1QztBQUFBLEVBQWE7QUFBQSxFQUFZO0FBQUEsRUFDdEY7QUFBQSxFQUF3RTtBQUFBLEVBQWdCO0FBQUEsRUFBcUI7QUFBQSxPQUN2RztBQUlQLFNBQVMsb0JBQWdEO0FBRXpELFNBQVMsNEJBQTZDO0FBQ3RELFNBQVMsZ0JBQXVELG1CQUFtQjtBQUNuRjtBQUFBLEVBTUM7QUFBQSxPQUNNO0FBQ1AsU0FBUyxxQ0FBcUM7QUFFOUMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyx1Q0FBdUM7QUFFaEQsSUFBVTtBQUFBLENBQVYsQ0FBVUEsc0JBQVY7QUFDUSxXQUFTLEtBQUssT0FBMEM7QUFDOUQsV0FBTztBQUFBLE1BQ04sSUFBSSxNQUFNO0FBQUEsTUFDVixNQUFNLFFBQVEsS0FBSyxNQUFNLElBQUk7QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSxrQkFBUztBQUFBLEdBRFA7QUFhSCxJQUFVO0FBQUEsQ0FBVixDQUFVQyxrQ0FBVjtBQUNDLFdBQVMsS0FBSyxPQUFrRTtBQUN0RixXQUFPO0FBQUEsTUFDTixXQUFXO0FBQUEsUUFDVixJQUFJLE1BQU0sVUFBVTtBQUFBLFFBQ3BCLE1BQU0sUUFBUSxLQUFLLE1BQU0sVUFBVSxJQUFJO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQVBPLEVBQUFBLDhCQUFTO0FBQUEsR0FEQTtBQWdCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxnQ0FBVjtBQUNDLFdBQVMsS0FBSyxPQUE4RDtBQUNsRixXQUFPO0FBQUEsTUFDTixXQUFXO0FBQUEsUUFDVixJQUFJLE1BQU0sVUFBVTtBQUFBLFFBQ3BCLE1BQU0sUUFBUSxLQUFLLE1BQU0sVUFBVSxJQUFJO0FBQUEsTUFDeEM7QUFBQSxNQUNBLFdBQVcsTUFBTTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQVJPLEVBQUFBLDRCQUFTO0FBQUEsR0FEQTtBQWNqQixJQUFVO0FBQUEsQ0FBVixDQUFVQywyQkFBVjtBQUNRLFdBQVMsS0FBSyxPQUF1QixXQUEyQztBQUN0RixXQUFPO0FBQUEsTUFDTixJQUFJLE1BQU07QUFBQSxNQUNWO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSx1QkFBUztBQUFBLEdBRFA7QUFTVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx5QkFBVjtBQUNRLFdBQVMsS0FBSyxPQUF1QixVQUFvRDtBQUMvRixXQUFPO0FBQUEsTUFDTixJQUFJLE1BQU07QUFBQSxNQUNWO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSxxQkFBUztBQUFBLEdBRFA7QUFTVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx1QkFBVjtBQUNRLFdBQVMsS0FBSyxPQUFnRDtBQUNwRSxVQUFNLFNBQVMsT0FBTyxPQUFPLHVCQUFPLE9BQU8sSUFBSSxHQUFHLEtBQUs7QUFDdkQsV0FBTyxPQUFPO0FBQ2QsV0FBTztBQUFBLEVBQ1I7QUFKTyxFQUFBQSxtQkFBUztBQUtULFdBQVMsR0FBRyxPQUEyQixhQUF1RDtBQUNwRyxRQUFJLFNBQVMsZUFBZSxxQkFBcUIsT0FBTyxPQUFPO0FBQy9ELFFBQUksV0FBVyxVQUFhLGFBQWE7QUFDeEMsZUFBUztBQUFBLFFBQ1IsTUFBTSxhQUFhO0FBQUEsUUFDbkIsTUFBTTtBQUFBLE1BQ1A7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFUTyxFQUFBQSxtQkFBUztBQUFBLEdBTlA7QUFrQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsZ0NBQVY7QUFDUSxXQUFTLEtBQUssT0FBa0Y7QUFDdEcsUUFBSSxVQUFVLFVBQWEsVUFBVSxNQUFNO0FBQzFDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxPQUFPLE9BQU8sdUJBQU8sT0FBTyxJQUFJLEdBQUcsS0FBSztBQUFBLEVBQ2hEO0FBTE8sRUFBQUEsNEJBQVM7QUFNVCxXQUFTLEdBQUcsT0FBc0U7QUFDeEYsUUFBSSxVQUFVLFVBQWEsVUFBVSxNQUFNO0FBQzFDLGFBQU8sb0JBQW9CO0FBQUEsSUFDNUI7QUFDQSxXQUFPLE9BQU8sT0FBTyx1QkFBTyxPQUFPLElBQUksR0FBRyxvQkFBb0IsVUFBVSxLQUFLO0FBQUEsRUFDOUU7QUFMTyxFQUFBQSw0QkFBUztBQUFBLEdBUFA7QUFlVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxtQkFBVjtBQUNRLFdBQVMsS0FBSyxPQUFnRDtBQUNwRSxRQUFJLFVBQVUsVUFBYSxVQUFVLE1BQU07QUFDMUMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLE9BQU8sT0FBTyx1QkFBTyxPQUFPLElBQUksR0FBRyxLQUFLO0FBQUEsRUFDaEQ7QUFMTyxFQUFBQSxlQUFTO0FBTVQsV0FBUyxHQUFHLE9BQWdEO0FBQ2xFLFFBQUksVUFBVSxVQUFhLFVBQVUsTUFBTTtBQUMxQyxhQUFPLFdBQVc7QUFBQSxJQUNuQjtBQUNBLFdBQU8sT0FBTyxPQUFPLHVCQUFPLE9BQU8sSUFBSSxHQUFHLFdBQVcsVUFBVSxLQUFLO0FBQUEsRUFDckU7QUFMTyxFQUFBQSxlQUFTO0FBQUEsR0FQUDtBQWVWLElBQVU7QUFBQSxDQUFWLENBQVVDLGdDQUFWO0FBQ1EsV0FBUyxLQUFLLE9BQWdFO0FBQ3BGLFFBQUksVUFBVSxVQUFhLFVBQVUsTUFBTTtBQUMxQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxNQUNOLEtBQUssTUFBTTtBQUFBLE1BQ1gsS0FBSyxNQUFNO0FBQUEsSUFDWjtBQUFBLEVBQ0Q7QUFSTyxFQUFBQSw0QkFBUztBQVNULFdBQVMsR0FBRyxPQUFnRTtBQUNsRixRQUFJLFVBQVUsVUFBYSxVQUFVLE1BQU07QUFDMUMsYUFBTyxlQUFlO0FBQUEsSUFDdkI7QUFDQSxXQUFPO0FBQUEsTUFDTixLQUFLLE1BQU0sT0FBTyxlQUFlLFNBQVM7QUFBQSxNQUMxQyxLQUFLLE1BQU07QUFBQSxJQUNaO0FBQUEsRUFDRDtBQVJPLEVBQUFBLDRCQUFTO0FBQUEsR0FWUDtBQXFCVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx5QkFBVjtBQUNRLFdBQVMsR0FBRyxPQUF1RztBQUN6SCxVQUFNLFlBQVk7QUFDbEIsV0FBTyxhQUFhLENBQUMsQ0FBQyxVQUFVO0FBQUEsRUFDakM7QUFITyxFQUFBQSxxQkFBUztBQUlULFdBQVMsS0FBSyxPQUFvRDtBQUN4RSxVQUFNLFVBQWtCLE1BQU0sU0FBUyxNQUFNLElBQUksSUFBSSxNQUFNLE9BQU8sTUFBTSxLQUFNO0FBQzlFLFVBQU0sT0FBaUIsTUFBTSxPQUFPLE1BQU0sS0FBSyxJQUFJLENBQUFDLFdBQVMsTUFBTSxTQUFTQSxNQUFLLElBQUlBLFNBQVFBLE9BQU0sS0FBSyxJQUFJLENBQUM7QUFDNUcsVUFBTSxTQUErQjtBQUFBLE1BQ3BDO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxRQUFJLE1BQU0sU0FBUztBQUNsQixhQUFPLFVBQVUsMkJBQTJCLEtBQUssTUFBTSxPQUFPO0FBQUEsSUFDL0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQVhPLEVBQUFELHFCQUFTO0FBWVQsV0FBUyxHQUFHLE9BQW9EO0FBQ3RFLFVBQU0sU0FBZ0M7QUFBQSxNQUNyQyxTQUFTLFlBQVk7QUFBQSxNQUNyQixNQUFNLE1BQU07QUFBQSxNQUNaLE1BQU0sTUFBTTtBQUFBLE1BQ1osY0FBYztBQUFBLElBQ2Y7QUFDQSxXQUFPLFVBQVUsMkJBQTJCLEdBQUcsTUFBTSxPQUFPO0FBQzVELFdBQU87QUFBQSxFQUNSO0FBVE8sRUFBQUEscUJBQVM7QUFBQSxHQWpCUDtBQTZCVixJQUFVO0FBQUEsQ0FBVixDQUFVRSw4QkFBVjtBQUNRLFdBQVMsS0FBSyxPQUE4RDtBQUNsRixRQUFJLFVBQVUsVUFBYSxVQUFVLE1BQU07QUFDMUMsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFNBQW9DO0FBQUEsTUFDekMsS0FBSyxNQUFNLE9BQU8sZUFBZSxTQUFTO0FBQUEsTUFDMUMsS0FBSyxNQUFNO0FBQUEsSUFDWjtBQUNBLFFBQUksTUFBTSxPQUFPO0FBQ2hCLGFBQU8sYUFBYSxNQUFNLE1BQU07QUFDaEMsYUFBTyxZQUFZLE1BQU0sTUFBTTtBQUMvQixhQUFPLGVBQWUsTUFBTSxNQUFNO0FBQUEsSUFDbkM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQWRPLEVBQUFBLDBCQUFTO0FBZVQsV0FBUyxHQUFHLE9BQThEO0FBQ2hGLFFBQUksVUFBVSxVQUFhLFVBQVUsTUFBTTtBQUMxQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sU0FBeUI7QUFBQSxNQUM5QixLQUFLLE1BQU07QUFBQSxNQUNYLEtBQUssTUFBTTtBQUFBLElBQ1o7QUFDQSxRQUFJLE1BQU0sWUFBWTtBQUNyQixhQUFPLFFBQVE7QUFBQSxRQUNkLFlBQVksTUFBTTtBQUFBLE1BQ25CO0FBQ0EsVUFBSSxNQUFNLFdBQVc7QUFDcEIsZUFBTyxNQUFNLE9BQU8sTUFBTTtBQUFBLE1BQzNCO0FBQ0EsVUFBSSxNQUFNLGNBQWM7QUFDdkIsZUFBTyxNQUFNLFVBQVUsTUFBTTtBQUFBLE1BQzlCO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBcEJPLEVBQUFBLDBCQUFTO0FBQUEsR0FoQlA7QUF1Q1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsdUJBQVY7QUFDUSxXQUFTLEdBQUcsT0FBcUc7QUFDdkgsVUFBTSxZQUFZO0FBQ2xCLFdBQU8sY0FBYyxDQUFDLENBQUMsVUFBVSxlQUFlLENBQUMsQ0FBQyxVQUFVO0FBQUEsRUFDN0Q7QUFITyxFQUFBQSxtQkFBUztBQUlULFdBQVMsS0FBSyxPQUFrRDtBQUN0RSxVQUFNLFNBQTZCLENBQUM7QUFDcEMsUUFBSSxNQUFNLFFBQVEsTUFBTSxTQUFTLE1BQU0sSUFBSSxNQUFNLE1BQU0sU0FBUyxVQUFhLE1BQU0sU0FBUyxRQUFRLE1BQU0sS0FBSyxXQUFXLElBQUk7QUFDN0gsYUFBTyxjQUFjLE1BQU07QUFBQSxJQUM1QixPQUFPO0FBQ04sYUFBTyxVQUFVLE1BQU07QUFDdkIsYUFBTyxPQUFPLE1BQU07QUFBQSxJQUNyQjtBQUNBLFFBQUksTUFBTSxTQUFTO0FBQ2xCLGFBQU8sVUFBVSx5QkFBeUIsS0FBSyxNQUFNLE9BQU87QUFBQSxJQUM3RDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBWk8sRUFBQUEsbUJBQVM7QUFhVCxXQUFTLEdBQUcsT0FBa0Q7QUFDcEUsVUFBTSxTQUFnQztBQUFBLE1BQ3JDLFNBQVMsWUFBWTtBQUFBLE1BQ3JCLE1BQU0sTUFBTSxjQUFjLE1BQU0sY0FBYyxNQUFNO0FBQUEsTUFDcEQsTUFBTSxNQUFNO0FBQUEsTUFDWixjQUFjO0FBQUEsSUFDZjtBQUNBLFFBQUksTUFBTSxTQUFTO0FBQ2xCLGFBQU8sVUFBVSx5QkFBeUIsR0FBRyxNQUFNLE9BQU87QUFBQSxJQUMzRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBWE8sRUFBQUEsbUJBQVM7QUFBQSxHQWxCUDtBQWdDVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx3QkFBVjtBQUNRLFdBQVMsR0FBRyxPQUFzRztBQUN4SCxVQUFNLFlBQVk7QUFDbEIsV0FBTyxhQUFhLFVBQVUsb0JBQW9CO0FBQUEsRUFDbkQ7QUFITyxFQUFBQSxvQkFBUztBQUtULFdBQVMsS0FBSyxPQUFtRDtBQUN2RSxXQUFPO0FBQUEsTUFDTixpQkFBaUI7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFKTyxFQUFBQSxvQkFBUztBQU1ULFdBQVMsR0FBRyxPQUFtRDtBQUNyRSxXQUFPO0FBQUEsTUFDTixTQUFTLFlBQVk7QUFBQSxNQUNyQixjQUFjO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFMTyxFQUFBQSxvQkFBUztBQUFBLEdBWlA7QUFvQlYsSUFBVTtBQUFBLENBQVYsQ0FBVUMsbUJBQVY7QUFDUSxXQUFTLEtBQUssT0FBbUM7QUFDdkQsVUFBTSxTQUF5QjtBQUFBLE1BQzlCLE9BQU8sTUFBTTtBQUFBLElBQ2Q7QUFDQSxRQUFJLE1BQU0sU0FBUyxlQUFlLFdBQVc7QUFDNUMsYUFBTyxjQUFjLE1BQU07QUFDM0IsVUFBSSxNQUFNLGlCQUFpQjtBQUMxQixlQUFPLFFBQVEsTUFBTSxnQkFBZ0I7QUFBQSxNQUN0QyxPQUFPO0FBQ04sZUFBTyxRQUFRLE1BQU07QUFBQSxNQUN0QjtBQUFBLElBQ0QsV0FBVyxNQUFNLFNBQVMsZUFBZSxXQUFXO0FBQ25ELGFBQU8sY0FBYztBQUNyQixhQUFPLFFBQVEsTUFBTSxPQUFPLGtCQUFrQixNQUFNLE9BQU8sZ0JBQWdCLE1BQU0sVUFBVTtBQUFBLElBQzVGO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFoQk8sRUFBQUEsZUFBUztBQWlCVCxXQUFTLEdBQUcsT0FBdUIsV0FBMkQ7QUFDcEcsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFLLE1BQU0sVUFBVSxVQUFnQixPQUFPLE1BQU0sVUFBVSxZQUFjLE1BQU0sVUFBVSxVQUFVLFFBQVU7QUFDN0csVUFBSSxVQUFVLGFBQWEsRUFBRSxRQUFRLFdBQVcsR0FBRztBQUNsRCxnQkFBUSxVQUFVO0FBQ2xCLDBCQUFrQjtBQUFBLE1BQ25CLE9BQU87QUFDTixnQkFBUSxVQUFVO0FBQ2xCLDBCQUFrQixVQUFVLGFBQWEsRUFBRSxRQUFRLENBQUM7QUFBQSxNQUNyRDtBQUFBLElBQ0QsV0FBVyxPQUFPLE1BQU0sVUFBVSxVQUFVO0FBQzNDLGNBQVEsTUFBTTtBQUFBLElBQ2YsT0FBTztBQUNOLGNBQVEsVUFBVTtBQUNsQix3QkFBa0IsVUFBVSxtQkFBbUIsSUFBSSxPQUFPLE1BQU0sS0FBSyxDQUFDLEtBQUs7QUFBQSxJQUM1RTtBQUNBLFVBQU0sU0FBK0I7QUFBQSxNQUNwQyxNQUFNLGVBQWU7QUFBQSxNQUNyQixPQUFPLE1BQU07QUFBQSxNQUNiLFdBQVcsTUFBTTtBQUFBLE1BQ2pCO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQXpCTyxFQUFBQSxlQUFTO0FBQUEsR0FsQlA7QUE4Q1YsSUFBVTtBQUFBLENBQVYsQ0FBVUMsbUJBQVY7QUFDUSxXQUFTLEdBQUcsT0FBeUM7QUFDM0QsVUFBTSxZQUFZO0FBQ2xCLFdBQU8sQ0FBQyxDQUFDLGFBQWEsTUFBTSxTQUFTLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQyxVQUFVO0FBQUEsRUFDbkU7QUFITyxFQUFBQSxlQUFTO0FBQUEsR0FEUDtBQU9WLElBQVU7QUFBQSxDQUFWLENBQVVDLGFBQVY7QUFDUSxXQUFTLEtBQUssTUFBb0Q7QUFDeEUsUUFBSSxTQUFTLFVBQWEsU0FBUyxRQUFTLENBQUMsV0FBVyxHQUFHLElBQUksS0FBSyxDQUFDLGdCQUFnQixHQUFHLElBQUksS0FBSyxDQUFDLGdCQUFnQixHQUFHLElBQUksR0FBSTtBQUM1SCxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sU0FBbUI7QUFBQSxNQUN4QixLQUFLLEtBQUs7QUFBQSxNQUNWLE1BQU0sS0FBSyx3QkFBd0I7QUFBQSxNQUNuQyxZQUFZLGtCQUFrQixLQUFLLEtBQUssY0FBYyxJQUFJLENBQUM7QUFBQSxNQUMzRCxRQUFRLGNBQWMsS0FBSyxLQUFLLE9BQU87QUFBQSxNQUN2QyxXQUFXO0FBQUEsTUFDWCxxQkFBcUIsQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLEtBQUssS0FBSyxVQUFVLDJCQUEyQixLQUFLLEtBQUssUUFBUSxZQUFZLElBQUk7QUFBQSxNQUM5SCxjQUFjLEtBQUssd0JBQXdCO0FBQUEsTUFDM0MsaUJBQWlCLENBQUM7QUFBQSxNQUNsQixvQkFBb0IsZ0JBQWdCLEdBQUcsSUFBSSxJQUFJLEtBQUsscUJBQXFCO0FBQUEsTUFDekUsWUFBWSxjQUFjLEtBQUssS0FBSyxVQUFVO0FBQUEsSUFDL0M7QUFDQSxXQUFPLFFBQVEsYUFBYSxLQUFLLEtBQUssd0JBQXdCLEtBQUs7QUFFbkUsUUFBSSxLQUFLLHdCQUF3QixRQUFRO0FBQ3hDLGFBQU8sU0FBUyxLQUFLLHdCQUF3QjtBQUFBLElBQzlDO0FBQ0EsUUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksS0FBSyxLQUFLLFNBQVM7QUFDOUMsY0FBUSxLQUFLLFFBQVEsU0FBUztBQUFBLFFBQzdCLEtBQUssWUFBWTtBQUFTLGlCQUFPLFlBQVksb0JBQW9CLEtBQUssS0FBSyxPQUFPO0FBQUc7QUFBQSxRQUNyRixLQUFLLFlBQVk7QUFBTyxpQkFBTyxZQUFZLGtCQUFrQixLQUFLLEtBQUssT0FBTztBQUFHO0FBQUEsUUFDakYsS0FBSyxZQUFZO0FBQWlCLGlCQUFPLFlBQVksbUJBQW1CLEtBQUssS0FBSyxPQUFPO0FBQUc7QUFBQSxNQUM3RjtBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssd0JBQXdCLGlCQUFpQjtBQUNqRCxpQkFBVyxXQUFXLEtBQUssd0JBQXdCLGlCQUFpQjtBQUNuRSxZQUFJLE1BQU0sU0FBUyxPQUFPLEdBQUc7QUFDNUIsaUJBQU8sZ0JBQWdCLEtBQUssT0FBTztBQUFBLFFBQ3BDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQXBDTyxFQUFBQSxTQUFTO0FBc0NULFdBQVMsR0FBRyxNQUE0QixXQUFxQyxhQUFzQixNQUF3QyxNQUE2QztBQUM5TCxRQUFJLENBQUMsUUFBUyxPQUFPLEtBQUssU0FBUyxVQUFXO0FBQzdDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSTtBQUNKLFFBQUksS0FBSyxXQUFXO0FBQ25CLFVBQUksa0JBQWtCLEdBQUcsS0FBSyxTQUFTLEdBQUc7QUFDekMsa0JBQVUsa0JBQWtCLEdBQUcsS0FBSyxTQUFTO0FBQUEsTUFDOUMsV0FBVyxvQkFBb0IsR0FBRyxLQUFLLFNBQVMsR0FBRztBQUNsRCxrQkFBVSxvQkFBb0IsR0FBRyxLQUFLLFNBQVM7QUFBQSxNQUNoRCxXQUFXLG1CQUFtQixHQUFHLEtBQUssU0FBUyxHQUFHO0FBQ2pELGtCQUFVLG1CQUFtQixHQUFHLEtBQUssU0FBUztBQUFBLE1BQy9DO0FBQUEsSUFDRDtBQUVBLFFBQUksQ0FBQyxTQUFTO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFDQSxZQUFRLGVBQWUsMkJBQTJCLEdBQUcsS0FBSyxtQkFBbUI7QUFDN0UsVUFBTSxTQUFTLGNBQWMsR0FBRyxLQUFLLFFBQVEsU0FBUztBQUV0RCxVQUFNLFFBQVEsSUFBSSxTQUFTLGNBQWMsWUFBWSxPQUFPLE9BQU8sS0FBSyxJQUFJO0FBQzVFLFVBQU0sYUFBYSxrQkFBa0IsR0FBRyxLQUFLLFlBQVksV0FBVztBQUNwRSxVQUFNLEtBQU0sbUJBQW1CLEdBQUcsS0FBSyxTQUFVLEtBQUssS0FBSyxNQUFPLEtBQUssTUFBTSxHQUFHLEtBQUssT0FBTyxXQUFXLElBQUksV0FBVyxJQUFJO0FBQzFILFVBQU0sU0FBMEIsSUFBSTtBQUFBLE1BQ25DO0FBQUE7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0EsV0FBVztBQUFBLE1BQ1g7QUFBQSxNQUNBO0FBQUEsTUFDQSxLQUFLO0FBQUEsTUFDTCxjQUFjLEdBQUcsS0FBSyxVQUFVO0FBQUEsTUFDaEM7QUFBQSxRQUNDLE1BQU0sS0FBSztBQUFBLFFBQ1gsWUFBWTtBQUFBLFFBQ1osT0FBTyxLQUFLO0FBQUEsUUFDWixjQUFjLENBQUMsQ0FBQyxLQUFLO0FBQUEsUUFDckIsaUJBQWlCLEtBQUssZ0JBQWdCLE1BQU07QUFBQSxRQUM1QyxRQUFRLEtBQUs7QUFBQSxRQUNiO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUE5Q08sRUFBQUEsU0FBUztBQUFBLEdBdkNQO0FBd0ZWLElBQVU7QUFBQSxDQUFWLENBQVVDLGtCQUFWO0FBQ1EsV0FBUyxLQUFLLE9BQWtFO0FBQ3RGLFFBQUksVUFBVSxRQUFXO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLE1BQ04sS0FBTSxPQUFPLFVBQVUsV0FBWSxRQUFRLE1BQU07QUFBQSxNQUNqRCxXQUFZLE9BQU8sVUFBVSxXQUFZLFFBQVUsT0FBTyxNQUFNLGNBQWMsV0FBWSxRQUFRLE1BQU07QUFBQSxJQUN6RztBQUFBLEVBQ0Q7QUFSTyxFQUFBQSxjQUFTO0FBQUEsR0FEUDtBQVlWLElBQVU7QUFBQSxDQUFWLENBQVVDLG1CQUFWO0FBQ1EsV0FBUyxLQUFLLE9BQW9DO0FBQ3hELFdBQU87QUFBQSxFQUNSO0FBRk8sRUFBQUEsZUFBUztBQUdULFdBQVMsR0FBRyxPQUE0RDtBQUM5RSxXQUFPO0FBQUEsRUFDUjtBQUZPLEVBQUFBLGVBQVM7QUFBQSxHQUpQO0FBVUgsSUFBTSxpQkFBTixjQUE2QixXQUEwQztBQUFBLEVBTTdFLFlBQ0MsZ0JBQytCLGNBQ1kseUJBQ0ssK0JBQy9DO0FBQ0QsVUFBTTtBQUp5QjtBQUNZO0FBQ0s7QUFHaEQsU0FBSyxTQUFTLGVBQWUsU0FBUyxlQUFlLFdBQVc7QUFDaEUsU0FBSyxhQUFhLG9CQUFJLElBQUk7QUFDMUIsU0FBSyxVQUFVLEtBQUssYUFBYSxpQkFBaUIsT0FBTyxVQUFzQjtBQUM5RSxVQUFJLE1BQU0sU0FBUyxjQUFjLFNBQVM7QUFDekM7QUFBQSxNQUNEO0FBRUEsWUFBTSxPQUFPLE1BQU07QUFDbkIsVUFBSSxNQUFNLFNBQVMsY0FBYyxPQUFPO0FBQ3ZDLGNBQU0sWUFBWSxpQkFBaUIsS0FBSyxLQUFLLGlCQUFpQixDQUFDO0FBQy9ELFlBQUkscUJBQXlDLFVBQVUsS0FBTTtBQUM3RCxZQUFJLFVBQVUsTUFBTSxhQUFhLG1CQUFtQixHQUFHLFVBQVUsS0FBSyxTQUFTLEtBQUssTUFBTSxtQkFBbUI7QUFDNUcsZ0JBQU0sT0FBTyxnQ0FBZ0MsTUFBTSxVQUFVLEtBQUssVUFBVTtBQUM1RSxxQkFBVyxlQUFlLEtBQUssV0FBVyxHQUFHO0FBQzVDLGtCQUFNLFFBQVEsTUFBTSxrQkFBa0IsSUFBSSxZQUFZLEtBQUs7QUFDM0QsZ0JBQUksVUFBVSxRQUFXO0FBQ3hCLG1CQUFLLFFBQVEsYUFBYSxLQUFLO0FBQUEsWUFDaEM7QUFBQSxVQUNEO0FBRUEsK0JBQXFCLE1BQU0sS0FBSyw4QkFBOEIsYUFBYSxLQUFLLG1CQUFtQixHQUFHLElBQUk7QUFBQSxRQUMzRztBQUNBLGFBQUssT0FBTyxnQkFBZ0IsV0FBVyxNQUFNLFlBQVksa0JBQWtCO0FBQUEsTUFDNUUsV0FBVyxNQUFNLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkQsYUFBSyxPQUFPLHVCQUF1QixzQkFBc0IsS0FBSyxLQUFLLGlCQUFpQixHQUFHLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDeEcsV0FBVyxNQUFNLFNBQVMsY0FBYyxjQUFjO0FBQ3JELGFBQUssT0FBTyxxQkFBcUIsb0JBQW9CLEtBQUssS0FBSyxpQkFBaUIsR0FBRyxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQ25HLFdBQVcsTUFBTSxTQUFTLGNBQWMsS0FBSztBQUM1QyxhQUFLLE9BQU8sY0FBYyxpQkFBaUIsS0FBSyxLQUFLLGlCQUFpQixDQUFDLENBQUM7QUFBQSxNQUN6RSxXQUFXLE1BQU0sU0FBUyxjQUFjLHVCQUF1QjtBQUM5RCxhQUFLLE9BQU8sK0JBQStCLDZCQUE2QixLQUFLLEVBQUUsV0FBVyxLQUFLLGlCQUFpQixFQUFFLENBQUMsQ0FBQztBQUFBLE1BQ3JILFdBQVcsTUFBTSxTQUFTLGNBQWMscUJBQXFCO0FBQzVELGFBQUssT0FBTyw2QkFBNkIsMkJBQTJCLEtBQUssRUFBRSxXQUFXLEtBQUssaUJBQWlCLEdBQUcsV0FBVyxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQ25JLFdBQVcsTUFBTSxTQUFTLGNBQWMsMkJBQTJCO0FBQ2xFLGFBQUssT0FBTyw2QkFBNkIsMkJBQTJCLEtBQUssRUFBRSxXQUFXLEtBQUssaUJBQWlCLEdBQUcsV0FBVyxLQUFLLENBQUMsQ0FBQztBQUFBLE1BQ2xJO0FBQUEsSUFFRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFZ0IsVUFBZ0I7QUFDL0IsZUFBVyxTQUFTLEtBQUssV0FBVyxPQUFPLEdBQUc7QUFDN0MsWUFBTSxXQUFXLFFBQVE7QUFBQSxJQUMxQjtBQUNBLFNBQUssV0FBVyxNQUFNO0FBQ3RCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFBQSxFQUVBLGNBQWMsU0FBb0M7QUFDakQsV0FBTyxJQUFJLFFBQVEsQ0FBQyxTQUFTLFdBQVc7QUFDdkMsWUFBTSxPQUFPLFFBQVEsR0FBRyxTQUFTLEtBQUsseUJBQXlCLElBQUk7QUFDbkUsVUFBSSxNQUFNO0FBQ1QsZ0JBQVEsS0FBSyxHQUFHO0FBQUEsTUFDakIsT0FBTztBQUNOLGVBQU8sSUFBSSxNQUFNLG9DQUFvQyxDQUFDO0FBQUEsTUFDdkQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxzQkFBc0IsUUFBZ0IsTUFBNkI7QUFDekUsVUFBTSxXQUEwQjtBQUFBLE1BQy9CLGNBQWMsQ0FBQyxlQUEyQztBQUN6RCxlQUFPLFFBQVEsUUFBUSxLQUFLLE9BQU8sY0FBYyxRQUFRLFVBQVUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxVQUFVO0FBQ3JGLGdCQUFNLFFBQWdCLENBQUM7QUFDdkIscUJBQVcsT0FBTyxNQUFNLE9BQU87QUFDOUIsa0JBQU0sT0FBTyxRQUFRLEdBQUcsS0FBSyxLQUFLLHlCQUF5QixJQUFJO0FBQy9ELGdCQUFJLE1BQU07QUFDVCxvQkFBTSxLQUFLLElBQUk7QUFBQSxZQUNoQixPQUFPO0FBQ04sc0JBQVEsTUFBTSxzQ0FBc0MsS0FBSyxVQUFVLElBQUksWUFBWSxRQUFXLENBQUMsQ0FBQyx3QkFBd0I7QUFBQSxZQUN6SDtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxxQkFBNEM7QUFBQSxZQUNqRCxHQUFHLE1BQU07QUFBQSxZQUNULG1CQUFtQixJQUFJLE9BQU8sTUFBTSxVQUFVLGlCQUFpQjtBQUFBLFVBQ2hFO0FBQ0EsaUJBQU87QUFBQSxZQUNOO0FBQUEsWUFDQSxXQUFXO0FBQUEsVUFDWjtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLGFBQWEsQ0FBQyxTQUEwQjtBQUN2QyxjQUFNLE1BQU0sUUFBUSxLQUFLLElBQUk7QUFFN0IsWUFBSSxLQUFLO0FBQ1IsY0FBSSxPQUFTLElBQUksU0FBUyxTQUFhLEtBQUssSUFBSTtBQUNoRCxpQkFBTyxRQUFRLFFBQVEsS0FBSyxPQUFPLGFBQWEsUUFBUSxHQUFHLENBQUMsRUFBRSxLQUFLLGtCQUFnQjtBQUNsRixnQkFBSSxjQUFjO0FBQ2pCLHFCQUFPLFFBQVEsR0FBRyxjQUFjLEtBQUsseUJBQXlCLE1BQU0sS0FBSyx3QkFBd0IsTUFBTSxLQUFLLHdCQUF3QixJQUFJO0FBQUEsWUFDekk7QUFFQSxtQkFBTztBQUFBLFVBQ1IsQ0FBQztBQUFBLFFBQ0Y7QUFDQSxlQUFPLFFBQVEsUUFBcUMsTUFBUztBQUFBLE1BQzlEO0FBQUEsSUFDRDtBQUNBLFVBQU0sYUFBYSxLQUFLLGFBQWEscUJBQXFCLFVBQVUsSUFBSTtBQUN4RSxTQUFLLFdBQVcsSUFBSSxRQUFRLEVBQUUsWUFBWSxTQUFTLENBQUM7QUFDcEQsV0FBTyxRQUFRLFFBQVEsTUFBUztBQUFBLEVBQ2pDO0FBQUEsRUFFTyx3QkFBd0IsUUFBK0I7QUFDN0QsVUFBTSxXQUFXLEtBQUssV0FBVyxJQUFJLE1BQU07QUFDM0MsUUFBSSxVQUFVO0FBQ2IsZUFBUyxXQUFXLFFBQVE7QUFDNUIsV0FBSyxXQUFXLE9BQU8sTUFBTTtBQUFBLElBQzlCO0FBQ0EsV0FBTyxRQUFRLFFBQVEsTUFBUztBQUFBLEVBQ2pDO0FBQUEsRUFFTyxZQUFZLFFBQThDO0FBQ2hFLFdBQU8sS0FBSyxhQUFhLE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQyxVQUFVO0FBQ3hFLFlBQU0sU0FBcUIsQ0FBQztBQUM1QixpQkFBVyxRQUFRLE9BQU87QUFDekIsY0FBTSxPQUFPLFFBQVEsS0FBSyxJQUFJO0FBQzlCLFlBQUksTUFBTTtBQUNULGlCQUFPLEtBQUssSUFBSTtBQUFBLFFBQ2pCO0FBQUEsTUFDRDtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxhQUFhLE9BQThFO0FBQ2xHLFFBQUk7QUFDSixRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGtCQUFZO0FBQUEsSUFDYixPQUFPO0FBQ04sWUFBTSxrQkFBa0IsS0FBSyx3QkFBd0IsYUFBYTtBQUNsRSxZQUFNLE1BQU0sSUFBSSxPQUFPLEtBQUs7QUFDNUIsVUFBSSxnQkFBZ0IsZUFBZSxTQUFTLE1BQU0sSUFBSSxTQUFTLEdBQUc7QUFDakUsb0JBQVk7QUFBQSxNQUNiLE9BQU87QUFDTixvQkFBWSxLQUFLLHdCQUF3QixtQkFBbUIsR0FBRztBQUFBLE1BQ2hFO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFhLGtCQUFrQixPQUE4RDtBQUM1RixRQUFJLGNBQWMsR0FBRyxLQUFLLEdBQUc7QUFDNUIsWUFBTSxZQUFZLEtBQUssYUFBYSxNQUFNLGVBQWU7QUFDekQsVUFBSSxXQUFXO0FBQ2QsY0FBTSxPQUFPLE1BQU0sS0FBSyxhQUFhLFFBQVEsV0FBVyxNQUFNLElBQUksSUFBSTtBQUN0RSxZQUFJLE1BQU07QUFDVCxpQkFBTztBQUFBLFlBQ04sSUFBSSxLQUFLO0FBQUEsWUFDVCxNQUFNLFFBQVEsS0FBSyxJQUFJO0FBQUEsVUFDeEI7QUFBQSxRQUNEO0FBQ0EsY0FBTSxJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsTUFDakMsT0FBTztBQUNOLGNBQU0sSUFBSSxNQUFNLHFCQUFxQjtBQUFBLE1BQ3RDO0FBQUEsSUFDRCxPQUFPO0FBQ04sWUFBTSxPQUFPLFFBQVEsR0FBRyxPQUFPLEtBQUsseUJBQXlCLElBQUk7QUFDakUsYUFBTztBQUFBLFFBQ04sSUFBSSxLQUFLO0FBQUEsUUFDVCxNQUFNLFFBQVEsS0FBSyxJQUFJO0FBQUEsTUFDeEI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQSxFQUlPLGFBQWEsT0FBOEQ7QUFDakYsV0FBTyxJQUFJLFFBQTJCLENBQUMsU0FBUyxXQUFXO0FBQzFELFVBQUksY0FBYyxHQUFHLEtBQUssR0FBRztBQUM1QixjQUFNLFlBQVksS0FBSyxhQUFhLE1BQU0sZUFBZTtBQUN6RCxZQUFJLFdBQVc7QUFDZCxlQUFLLGFBQWEsUUFBUSxXQUFXLE1BQU0sSUFBSSxJQUFJLEVBQUUsS0FBSyxDQUFDLFNBQTJCO0FBQ3JGLGdCQUFJLENBQUMsTUFBTTtBQUNWLHFCQUFPLElBQUksTUFBTSxnQkFBZ0IsQ0FBQztBQUFBLFlBQ25DLE9BQU87QUFDTixvQkFBTSxTQUE0QjtBQUFBLGdCQUNqQyxJQUFJLE1BQU07QUFBQSxnQkFDVixNQUFNLFFBQVEsS0FBSyxJQUFJO0FBQUEsY0FDeEI7QUFDQSxtQkFBSyxhQUFhLElBQUksSUFBSSxFQUFFLEtBQUssYUFBVztBQUczQyxvQkFBSyxTQUFTLGFBQWEsVUFBZSxRQUFRLGFBQWEsR0FBSTtBQUNsRSx1QkFBSyxPQUFPLGNBQWMsTUFBTTtBQUFBLGdCQUNqQztBQUFBLGNBQ0QsR0FBRyxZQUFVO0FBQUEsY0FFYixDQUFDO0FBQ0Qsc0JBQVEsTUFBTTtBQUFBLFlBQ2Y7QUFBQSxVQUNELEdBQUcsQ0FBQyxXQUFXO0FBQ2QsbUJBQU8sSUFBSSxNQUFNLGdCQUFnQixDQUFDO0FBQUEsVUFDbkMsQ0FBQztBQUFBLFFBQ0YsT0FBTztBQUNOLGlCQUFPLElBQUksTUFBTSxxQkFBcUIsQ0FBQztBQUFBLFFBQ3hDO0FBQUEsTUFDRCxPQUFPO0FBQ04sY0FBTSxPQUFPLFFBQVEsR0FBRyxPQUFPLEtBQUsseUJBQXlCLElBQUk7QUFDakUsYUFBSyxhQUFhLElBQUksSUFBSSxFQUFFLEtBQUssUUFBVyxZQUFVO0FBQUEsUUFFdEQsQ0FBQztBQUNELGNBQU0sU0FBNEI7QUFBQSxVQUNqQyxJQUFJLEtBQUs7QUFBQSxVQUNULE1BQU0sUUFBUSxLQUFLLElBQUk7QUFBQSxRQUN4QjtBQUNBLGdCQUFRLE1BQU07QUFBQSxNQUNmO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBR08seUJBQXlCLElBQVksUUFBZ0M7QUFDM0UsV0FBTyxJQUFJLFFBQWMsQ0FBQyxTQUFTLFdBQVc7QUFDN0MsV0FBSyxhQUFhLGVBQWUsRUFBRSxLQUFLLENBQUMsVUFBVTtBQUNsRCxtQkFBVyxRQUFRLE9BQU87QUFDekIsY0FBSSxPQUFPLEtBQUssS0FBSztBQUNwQixpQkFBSyxhQUFhLDhCQUE4QixNQUFNLE1BQU0sRUFBRSxLQUFLLENBQUMsVUFBVTtBQUM3RSxzQkFBUSxNQUFTO0FBQUEsWUFDbEIsR0FBRyxDQUFDLFVBQVU7QUFDYixxQkFBTyxLQUFLO0FBQUEsWUFDYixDQUFDO0FBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLGVBQU8sSUFBSSxNQUFNLG9DQUFvQyxDQUFDO0FBQUEsTUFDdkQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLGVBQWUsSUFBMkI7QUFDaEQsV0FBTyxJQUFJLFFBQWMsQ0FBQyxTQUFTLFdBQVc7QUFDN0MsV0FBSyxhQUFhLGVBQWUsRUFBRSxLQUFLLENBQUMsVUFBVTtBQUNsRCxtQkFBVyxRQUFRLE9BQU87QUFDekIsY0FBSSxPQUFPLEtBQUssS0FBSztBQUNwQixpQkFBSyxhQUFhLFVBQVUsSUFBSSxFQUFFLEtBQUssQ0FBQyxVQUFVO0FBQ2pELHNCQUFRLE1BQVM7QUFBQSxZQUNsQixHQUFHLENBQUMsVUFBVTtBQUNiLHFCQUFPLE1BQVM7QUFBQSxZQUNqQixDQUFDO0FBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLGVBQU8sSUFBSSxpQkFBaUIsNkJBQTZCLENBQUM7QUFBQSxNQUMzRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRU8sb0JBQW9CLEtBQWEsTUFBZ0M7QUFDdkUsUUFBSTtBQUNKLFlBQVEsS0FBSyxVQUFVO0FBQUEsTUFDdEIsS0FBSztBQUNKLG1CQUFXLFNBQVMsU0FBUztBQUM3QjtBQUFBLE1BQ0QsS0FBSztBQUNKLG1CQUFXLFNBQVMsU0FBUztBQUM3QjtBQUFBLE1BQ0QsS0FBSztBQUNKLG1CQUFXLFNBQVMsU0FBUztBQUM3QjtBQUFBLE1BQ0QsS0FBSztBQUNKLG1CQUFXLFNBQVMsU0FBUztBQUM3QjtBQUFBLE1BQ0Q7QUFDQyxtQkFBVyxTQUFTO0FBQUEsSUFDdEI7QUFDQSxTQUFLLGFBQWEsbUJBQW1CLEtBQUs7QUFBQSxNQUN6QztBQUFBLE1BQ0EsYUFBYSxDQUFDLFNBQXNCO0FBQ25DLGVBQU8sSUFBSSxLQUFLLEVBQUUsUUFBUSxLQUFLLFFBQVEsV0FBVyxLQUFLLFdBQVcsS0FBSyxDQUFDO0FBQUEsTUFDekU7QUFBQSxNQUNBLFNBQVMsS0FBSztBQUFBLE1BQ2Qsa0JBQWtCLENBQUMsaUJBQW1DLFdBQXdCLFdBQXlFO0FBQ3RKLGNBQU0sT0FBaUIsQ0FBQztBQUN4QixrQkFBVSxVQUFVLFFBQVEsVUFBUSxLQUFLLEtBQUssSUFBSSxDQUFDO0FBQ25ELGVBQU8sUUFBUSxRQUFRLEtBQUssT0FBTyxrQkFBa0IsZ0JBQWdCLEtBQUssRUFBRSxTQUFTLFVBQVUsU0FBUyxXQUFXLEtBQUssQ0FBQyxDQUFDLEVBQUUsS0FBSyxZQUFVO0FBQzFJLGdCQUFNLHdCQUF3QixNQUFNLEtBQUssT0FBTyxPQUFPLE9BQU8sU0FBUyxDQUFDO0FBQ3hFLGlCQUFPLElBQUksUUFBd0MsQ0FBQyxTQUFTLFdBQVc7QUFDdkUsaUJBQUssOEJBQThCLHVCQUF1QixpQkFBaUIsdUJBQXVCLFNBQVMsUUFBVyxNQUFNLEVBQUUsS0FBSyxrQkFBZ0I7QUFDbEosa0JBQUksQ0FBQyxjQUFjO0FBQ2xCLHdCQUFRLE1BQVM7QUFBQSxjQUNsQjtBQUVBLG9CQUFNLFNBQTZCO0FBQUEsZ0JBQ2xDLFNBQVM7QUFBQSxnQkFDVCxXQUFXLG9CQUFJLElBQW9CO0FBQUEsY0FDcEM7QUFDQSx1QkFBUyxJQUFJLEdBQUcsSUFBSSxzQkFBc0IsUUFBUSxLQUFLO0FBQ3RELHNCQUFNLGVBQWUsS0FBSyxDQUFDLEVBQUUsVUFBVSxHQUFHLEtBQUssQ0FBQyxFQUFFLFNBQVMsQ0FBQztBQUM1RCxvQkFBSSxnQkFBZ0IsT0FBTyxVQUFVLEtBQUssQ0FBQyxDQUFDLE1BQU0sS0FBSyxDQUFDLEdBQUc7QUFDMUQsd0JBQU0sV0FBVyxhQUFhLElBQUksWUFBWTtBQUM5QyxzQkFBSSxPQUFPLGFBQWEsVUFBVTtBQUNqQywyQkFBTyxVQUFVLElBQUksY0FBYyxRQUFRO0FBQUEsa0JBQzVDO0FBQUEsZ0JBQ0QsT0FBTztBQUNOLHlCQUFPLFVBQVUsSUFBSSxjQUFjLHNCQUFzQixDQUFDLENBQUM7QUFBQSxnQkFDNUQ7QUFBQSxjQUNEO0FBQ0Esa0JBQUksTUFBTSxTQUFTLE9BQU8sT0FBTyxHQUFHO0FBQ25DLHVCQUFPLFVBQVUsT0FBTztBQUFBLGNBQ3pCO0FBQ0Esc0JBQVEsTUFBTTtBQUFBLFlBQ2YsR0FBRyxZQUFVO0FBQ1oscUJBQU8sTUFBTTtBQUFBLFlBQ2QsQ0FBQztBQUFBLFVBQ0YsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLGdCQUFnQixDQUFDLFNBQWlCLEtBQWMsVUFBa0Q7QUFDakcsZUFBTyxLQUFLLE9BQU8sZ0JBQWdCLFNBQVMsS0FBSyxLQUFLO0FBQUEsTUFDdkQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLDZCQUE2QixRQUFrQixPQUFpQixTQUFrQztBQUN2RyxXQUFPLEtBQUssYUFBYSw0QkFBNEIsUUFBUSxPQUFPLE9BQU87QUFBQSxFQUM1RTtBQUVEO0FBM1VhLGlCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxjQUFjO0FBQUEsRUFTN0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVlU7IiwKICAibmFtZXMiOiBbIlRhc2tFeGVjdXRpb25EVE8iLCAiVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZER0byIsICJUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZER0byIsICJUYXNrUHJvY2Vzc1N0YXJ0ZWREVE8iLCAiVGFza1Byb2Nlc3NFbmRlZERUTyIsICJUYXNrRGVmaW5pdGlvbkRUTyIsICJUYXNrUHJlc2VudGF0aW9uT3B0aW9uc0RUTyIsICJSdW5PcHRpb25zRFRPIiwgIlByb2Nlc3NFeGVjdXRpb25PcHRpb25zRFRPIiwgIlByb2Nlc3NFeGVjdXRpb25EVE8iLCAidmFsdWUiLCAiU2hlbGxFeGVjdXRpb25PcHRpb25zRFRPIiwgIlNoZWxsRXhlY3V0aW9uRFRPIiwgIkN1c3RvbUV4ZWN1dGlvbkRUTyIsICJUYXNrU291cmNlRFRPIiwgIlRhc2tIYW5kbGVEVE8iLCAiVGFza0RUTyIsICJUYXNrR3JvdXBEVE8iLCAiVGFza0ZpbHRlckRUTyJdCn0K
