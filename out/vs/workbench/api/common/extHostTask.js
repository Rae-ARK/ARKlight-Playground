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
import { URI } from "../../../base/common/uri.js";
import { asPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { MainContext } from "./extHost.protocol.js";
import * as types from "./extHostTypes.js";
import { IExtHostWorkspace } from "./extHostWorkspace.js";
import { IExtHostDocumentsAndEditors } from "./extHostDocumentsAndEditors.js";
import { IExtHostConfiguration } from "./extHostConfiguration.js";
import { CancellationToken } from "../../../base/common/cancellation.js";
import { IExtHostTerminalService } from "./extHostTerminalService.js";
import { IExtHostRpcService } from "./extHostRpcService.js";
import { IExtHostInitDataService } from "./extHostInitDataService.js";
import { createDecorator } from "../../../platform/instantiation/common/instantiation.js";
import { Schemas } from "../../../base/common/network.js";
import * as Platform from "../../../base/common/platform.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { IExtHostApiDeprecationService } from "./extHostApiDeprecationService.js";
import { USER_TASKS_GROUP_KEY } from "../../contrib/tasks/common/tasks.js";
import { ErrorNoTelemetry, NotSupportedError } from "../../../base/common/errors.js";
import { asArray } from "../../../base/common/arrays.js";
var TaskDefinitionDTO;
((TaskDefinitionDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskDefinitionDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskDefinitionDTO2.to = to;
})(TaskDefinitionDTO || (TaskDefinitionDTO = {}));
var TaskPresentationOptionsDTO;
((TaskPresentationOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskPresentationOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  TaskPresentationOptionsDTO2.to = to;
})(TaskPresentationOptionsDTO || (TaskPresentationOptionsDTO = {}));
var ProcessExecutionOptionsDTO;
((ProcessExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ProcessExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ProcessExecutionOptionsDTO2.to = to;
})(ProcessExecutionOptionsDTO || (ProcessExecutionOptionsDTO = {}));
var ProcessExecutionDTO;
((ProcessExecutionDTO2) => {
  function is(value) {
    if (value) {
      const candidate = value;
      return candidate && !!candidate.process;
    } else {
      return false;
    }
  }
  ProcessExecutionDTO2.is = is;
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {
      process: value.process,
      args: value.args
    };
    if (value.options) {
      result.options = ProcessExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ProcessExecutionDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return new types.ProcessExecution(value.process, value.args, value.options);
  }
  ProcessExecutionDTO2.to = to;
})(ProcessExecutionDTO || (ProcessExecutionDTO = {}));
var ShellExecutionOptionsDTO;
((ShellExecutionOptionsDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ShellExecutionOptionsDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return value;
  }
  ShellExecutionOptionsDTO2.to = to;
})(ShellExecutionOptionsDTO || (ShellExecutionOptionsDTO = {}));
var ShellExecutionDTO;
((ShellExecutionDTO2) => {
  function is(value) {
    if (value) {
      const candidate = value;
      return candidate && (!!candidate.commandLine || !!candidate.command);
    } else {
      return false;
    }
  }
  ShellExecutionDTO2.is = is;
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    const result = {};
    if (value.commandLine !== void 0) {
      result.commandLine = value.commandLine;
    } else {
      result.command = value.command;
      result.args = value.args;
    }
    if (value.options) {
      result.options = ShellExecutionOptionsDTO.from(value.options);
    }
    return result;
  }
  ShellExecutionDTO2.from = from;
  function to(value) {
    if (value === void 0 || value === null || value.command === void 0 && value.commandLine === void 0) {
      return void 0;
    }
    if (value.commandLine) {
      return new types.ShellExecution(value.commandLine, value.options);
    } else {
      return new types.ShellExecution(value.command, value.args ? value.args : [], value.options);
    }
  }
  ShellExecutionDTO2.to = to;
})(ShellExecutionDTO || (ShellExecutionDTO = {}));
var CustomExecutionDTO;
((CustomExecutionDTO2) => {
  function is(value) {
    if (value) {
      const candidate = value;
      return candidate && candidate.customExecution === "customExecution";
    } else {
      return false;
    }
  }
  CustomExecutionDTO2.is = is;
  function from(value) {
    return {
      customExecution: "customExecution"
    };
  }
  CustomExecutionDTO2.from = from;
  function to(taskId, providedCustomExeutions) {
    return providedCustomExeutions.get(taskId);
  }
  CustomExecutionDTO2.to = to;
})(CustomExecutionDTO || (CustomExecutionDTO = {}));
var TaskHandleDTO;
((TaskHandleDTO2) => {
  function from(value, workspaceService) {
    let folder;
    if (value.scope !== void 0 && typeof value.scope !== "number") {
      folder = value.scope.uri;
    } else if (value.scope !== void 0 && typeof value.scope === "number") {
      if (value.scope === types.TaskScope.Workspace && workspaceService && workspaceService.workspaceFile) {
        folder = workspaceService.workspaceFile;
      } else {
        folder = USER_TASKS_GROUP_KEY;
      }
    }
    return {
      id: value._id,
      workspaceFolder: folder
    };
  }
  TaskHandleDTO2.from = from;
})(TaskHandleDTO || (TaskHandleDTO = {}));
var TaskGroupDTO;
((TaskGroupDTO2) => {
  function from(value) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    return { _id: value.id, isDefault: value.isDefault };
  }
  TaskGroupDTO2.from = from;
})(TaskGroupDTO || (TaskGroupDTO = {}));
var TaskDTO;
((TaskDTO2) => {
  function fromMany(tasks2, extension) {
    if (tasks2 === void 0 || tasks2 === null) {
      return [];
    }
    const result = [];
    for (const task of tasks2) {
      const converted = from(task, extension);
      if (converted) {
        result.push(converted);
      }
    }
    return result;
  }
  TaskDTO2.fromMany = fromMany;
  function from(value, extension) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    let execution;
    if (value.execution instanceof types.ProcessExecution) {
      execution = ProcessExecutionDTO.from(value.execution);
    } else if (value.execution instanceof types.ShellExecution) {
      execution = ShellExecutionDTO.from(value.execution);
    } else if (value.execution && value.execution instanceof types.CustomExecution) {
      execution = CustomExecutionDTO.from(value.execution);
    }
    const definition = TaskDefinitionDTO.from(value.definition);
    let scope;
    if (value.scope) {
      if (typeof value.scope === "number") {
        scope = value.scope;
      } else {
        scope = value.scope.uri;
      }
    } else {
      scope = types.TaskScope.Workspace;
    }
    if (!definition || !scope) {
      return void 0;
    }
    const result = {
      _id: value._id,
      definition,
      name: value.name,
      source: {
        extensionId: extension.identifier.value,
        label: value.source,
        scope
      },
      execution,
      isBackground: value.isBackground,
      group: TaskGroupDTO.from(value.group),
      presentationOptions: TaskPresentationOptionsDTO.from(value.presentationOptions),
      problemMatchers: asArray(value.problemMatchers),
      hasDefinedMatchers: value.hasDefinedMatchers,
      runOptions: value.runOptions ? value.runOptions : { reevaluateOnRerun: true },
      detail: value.detail
    };
    return result;
  }
  TaskDTO2.from = from;
  async function to(value, workspace, providedCustomExeutions) {
    if (value === void 0 || value === null) {
      return void 0;
    }
    let execution;
    if (ProcessExecutionDTO.is(value.execution)) {
      execution = ProcessExecutionDTO.to(value.execution);
    } else if (ShellExecutionDTO.is(value.execution)) {
      execution = ShellExecutionDTO.to(value.execution);
    } else if (CustomExecutionDTO.is(value.execution)) {
      execution = CustomExecutionDTO.to(value._id, providedCustomExeutions);
    }
    const definition = TaskDefinitionDTO.to(value.definition);
    let scope;
    if (value.source) {
      if (value.source.scope !== void 0) {
        if (typeof value.source.scope === "number") {
          scope = value.source.scope;
        } else {
          scope = await workspace.resolveWorkspaceFolder(URI.revive(value.source.scope));
        }
      } else {
        scope = types.TaskScope.Workspace;
      }
    }
    if (!definition || !scope) {
      return void 0;
    }
    const result = new types.Task(definition, scope, value.name, value.source.label, execution, value.problemMatchers);
    if (value.isBackground !== void 0) {
      result.isBackground = value.isBackground;
    }
    if (value.group !== void 0) {
      result.group = types.TaskGroup.from(value.group._id);
      if (result.group && value.group.isDefault) {
        result.group = new types.TaskGroup(result.group.id, result.group.label);
        if (value.group.isDefault === true) {
          result.group.isDefault = value.group.isDefault;
        }
      }
    }
    if (value.presentationOptions) {
      result.presentationOptions = TaskPresentationOptionsDTO.to(value.presentationOptions);
    }
    if (value.runOptions) {
      result.runOptions = value.runOptions;
    }
    if (value._id) {
      result._id = value._id;
    }
    if (value.detail) {
      result.detail = value.detail;
    }
    return result;
  }
  TaskDTO2.to = to;
})(TaskDTO || (TaskDTO = {}));
var TaskFilterDTO;
((TaskFilterDTO2) => {
  function from(value) {
    return value;
  }
  TaskFilterDTO2.from = from;
  function to(value) {
    if (!value) {
      return void 0;
    }
    return Object.assign(/* @__PURE__ */ Object.create(null), value);
  }
  TaskFilterDTO2.to = to;
})(TaskFilterDTO || (TaskFilterDTO = {}));
class TaskExecutionImpl {
  constructor(tasks2, _id, _task) {
    this._id = _id;
    this._task = _task;
    this.#tasks = tasks2;
  }
  #tasks;
  get task() {
    return this._task;
  }
  terminate() {
    this.#tasks.terminateTask(this);
  }
  fireDidStartProcess(value) {
  }
  fireDidEndProcess(value) {
  }
  get terminal() {
    return this._terminal;
  }
  set terminal(term) {
    this._terminal = term;
  }
}
let ExtHostTaskBase = class {
  constructor(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService) {
    this._onDidExecuteTask = new Emitter();
    this._onDidTerminateTask = new Emitter();
    this._onDidTaskProcessStarted = new Emitter();
    this._onDidTaskProcessEnded = new Emitter();
    this._onDidStartTaskProblemMatchers = new Emitter();
    this._onDidEndTaskProblemMatchers = new Emitter();
    this._proxy = extHostRpc.getProxy(MainContext.MainThreadTask);
    this._workspaceProvider = workspaceService;
    this._editorService = editorService;
    this._configurationService = configurationService;
    this._terminalService = extHostTerminalService;
    this._handleCounter = 0;
    this._handlers = /* @__PURE__ */ new Map();
    this._taskExecutions = /* @__PURE__ */ new Map();
    this._taskExecutionPromises = /* @__PURE__ */ new Map();
    this._providedCustomExecutions2 = /* @__PURE__ */ new Map();
    this._notProvidedCustomExecutions = /* @__PURE__ */ new Set();
    this._activeCustomExecutions2 = /* @__PURE__ */ new Map();
    this._logService = logService;
    this._deprecationService = deprecationService;
    this._proxy.$registerSupportedExecutions(true);
  }
  registerTaskProvider(extension, type, provider) {
    if (!provider) {
      return new types.Disposable(() => {
      });
    }
    const handle = this.nextHandle();
    this._handlers.set(handle, { type, provider, extension });
    this._proxy.$registerTaskProvider(handle, type);
    return new types.Disposable(() => {
      this._handlers.delete(handle);
      this._proxy.$unregisterTaskProvider(handle);
    });
  }
  registerTaskSystem(scheme, info) {
    this._proxy.$registerTaskSystem(scheme, info);
  }
  fetchTasks(filter) {
    return this._proxy.$fetchTasks(TaskFilterDTO.from(filter)).then(async (values) => {
      const result = [];
      for (const value of values) {
        const task = await TaskDTO.to(value, this._workspaceProvider, this._providedCustomExecutions2);
        if (task) {
          result.push(task);
        }
      }
      return result;
    });
  }
  get taskExecutions() {
    const result = [];
    this._taskExecutions.forEach((value) => result.push(value));
    return result;
  }
  terminateTask(execution) {
    if (!(execution instanceof TaskExecutionImpl)) {
      throw new Error("No valid task execution provided");
    }
    return this._proxy.$terminateTask(execution._id);
  }
  get onDidStartTask() {
    return this._onDidExecuteTask.event;
  }
  async $onDidStartTask(execution, terminalId, resolvedDefinition) {
    const customExecution = this._providedCustomExecutions2.get(execution.id);
    if (customExecution) {
      this._activeCustomExecutions2.set(execution.id, customExecution);
      this._terminalService.attachPtyToTerminal(terminalId, await customExecution.callback(resolvedDefinition));
    }
    this._lastStartedTask = execution.id;
    const taskExecution = await this.getTaskExecution(execution);
    const terminal = this._terminalService.getTerminalById(terminalId)?.value;
    if (taskExecution) {
      taskExecution.terminal = terminal;
    }
    this._onDidExecuteTask.fire({
      execution: taskExecution
    });
  }
  get onDidEndTask() {
    return this._onDidTerminateTask.event;
  }
  async $OnDidEndTask(execution) {
    if (!this._taskExecutionPromises.has(execution.id)) {
      return;
    }
    const _execution = await this.getTaskExecution(execution);
    this._taskExecutionPromises.delete(execution.id);
    this._taskExecutions.delete(execution.id);
    this.customExecutionComplete(execution);
    this._onDidTerminateTask.fire({
      execution: _execution
    });
  }
  get onDidStartTaskProcess() {
    return this._onDidTaskProcessStarted.event;
  }
  async $onDidStartTaskProcess(value) {
    const execution = await this.getTaskExecution(value.id);
    this._onDidTaskProcessStarted.fire({
      execution,
      processId: value.processId
    });
  }
  get onDidEndTaskProcess() {
    return this._onDidTaskProcessEnded.event;
  }
  async $onDidEndTaskProcess(value) {
    const execution = await this.getTaskExecution(value.id);
    this._onDidTaskProcessEnded.fire({
      execution,
      exitCode: value.exitCode
    });
  }
  get onDidStartTaskProblemMatchers() {
    return this._onDidStartTaskProblemMatchers.event;
  }
  async $onDidStartTaskProblemMatchers(value) {
    let execution;
    try {
      execution = await this.getTaskExecution(value.execution.id);
    } catch (error) {
      return;
    }
    this._onDidStartTaskProblemMatchers.fire({ execution });
  }
  get onDidEndTaskProblemMatchers() {
    return this._onDidEndTaskProblemMatchers.event;
  }
  async $onDidEndTaskProblemMatchers(value) {
    let execution;
    try {
      execution = await this.getTaskExecution(value.execution.id);
    } catch (error) {
      return;
    }
    this._onDidEndTaskProblemMatchers.fire({ execution, hasErrors: value.hasErrors });
  }
  $provideTasks(handle, validTypes) {
    const handler = this._handlers.get(handle);
    if (!handler) {
      return Promise.reject(new Error("no handler found"));
    }
    const taskIdPromises = [];
    const fetchPromise = asPromise(() => handler.provider.provideTasks(CancellationToken.None)).then((value) => {
      return this.provideTasksInternal(validTypes, taskIdPromises, handler, value);
    });
    return new Promise((resolve) => {
      fetchPromise.then((result) => {
        Promise.all(taskIdPromises).then(() => {
          resolve(result);
        });
      });
    });
  }
  async $resolveTask(handle, taskDTO) {
    const handler = this._handlers.get(handle);
    if (!handler) {
      return Promise.reject(new Error("no handler found"));
    }
    if (taskDTO.definition.type !== handler.type) {
      throw new Error(`Unexpected: Task of type [${taskDTO.definition.type}] cannot be resolved by provider of type [${handler.type}].`);
    }
    const task = await TaskDTO.to(taskDTO, this._workspaceProvider, this._providedCustomExecutions2);
    if (!task) {
      throw new Error("Unexpected: Task cannot be resolved.");
    }
    const resolvedTask = await handler.provider.resolveTask(task, CancellationToken.None);
    if (!resolvedTask) {
      return;
    }
    this.checkDeprecation(resolvedTask, handler);
    const resolvedTaskDTO = TaskDTO.from(resolvedTask, handler.extension);
    if (!resolvedTaskDTO) {
      throw new Error("Unexpected: Task cannot be resolved.");
    }
    if (resolvedTask.definition !== task.definition) {
      throw new Error("Unexpected: The resolved task definition must be the same object as the original task definition. The task definition cannot be changed.");
    }
    if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
      await this.addCustomExecution(resolvedTaskDTO, resolvedTask, true);
    }
    return await this.resolveTaskInternal(resolvedTaskDTO);
  }
  nextHandle() {
    return this._handleCounter++;
  }
  async addCustomExecution(taskDTO, task, isProvided) {
    const taskId = await this._proxy.$createTaskId(taskDTO);
    if (!isProvided && !this._providedCustomExecutions2.has(taskId)) {
      this._notProvidedCustomExecutions.add(taskId);
      this._activeCustomExecutions2.set(taskId, task.execution);
    }
    this._providedCustomExecutions2.set(taskId, task.execution);
  }
  async getTaskExecution(execution, task) {
    if (typeof execution === "string") {
      const taskExecution = this._taskExecutionPromises.get(execution);
      if (!taskExecution) {
        throw new ErrorNoTelemetry("Unexpected: The specified task is missing an execution");
      }
      return taskExecution;
    }
    const result = this._taskExecutionPromises.get(execution.id);
    if (result) {
      return result;
    }
    let executionPromise;
    if (!task) {
      executionPromise = TaskDTO.to(execution.task, this._workspaceProvider, this._providedCustomExecutions2).then((t) => {
        if (!t) {
          throw new ErrorNoTelemetry("Unexpected: Task does not exist.");
        }
        return new TaskExecutionImpl(this, execution.id, t);
      });
    } else {
      executionPromise = Promise.resolve(new TaskExecutionImpl(this, execution.id, task));
    }
    this._taskExecutionPromises.set(execution.id, executionPromise);
    return executionPromise.then((taskExecution) => {
      this._taskExecutions.set(execution.id, taskExecution);
      return taskExecution;
    });
  }
  checkDeprecation(task, handler) {
    const tTask = task;
    if (tTask._deprecated) {
      this._deprecationService.report("Task.constructor", handler.extension, "Use the Task constructor that takes a `scope` instead.");
    }
  }
  customExecutionComplete(execution) {
    const extensionCallback2 = this._activeCustomExecutions2.get(execution.id);
    if (extensionCallback2) {
      this._activeCustomExecutions2.delete(execution.id);
    }
    if (this._notProvidedCustomExecutions.has(execution.id) && this._lastStartedTask !== execution.id) {
      this._providedCustomExecutions2.delete(execution.id);
      this._notProvidedCustomExecutions.delete(execution.id);
    }
    const iterator = this._notProvidedCustomExecutions.values();
    let iteratorResult = iterator.next();
    while (!iteratorResult.done) {
      if (!this._activeCustomExecutions2.has(iteratorResult.value) && this._lastStartedTask !== iteratorResult.value) {
        this._providedCustomExecutions2.delete(iteratorResult.value);
        this._notProvidedCustomExecutions.delete(iteratorResult.value);
      }
      iteratorResult = iterator.next();
    }
  }
};
ExtHostTaskBase = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, IExtHostWorkspace),
  __decorateParam(3, IExtHostDocumentsAndEditors),
  __decorateParam(4, IExtHostConfiguration),
  __decorateParam(5, IExtHostTerminalService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IExtHostApiDeprecationService)
], ExtHostTaskBase);
let WorkerExtHostTask = class extends ExtHostTaskBase {
  constructor(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService) {
    super(extHostRpc, initData, workspaceService, editorService, configurationService, extHostTerminalService, logService, deprecationService);
    this.registerTaskSystem(Schemas.vscodeRemote, {
      scheme: Schemas.vscodeRemote,
      authority: "",
      platform: Platform.PlatformToString(Platform.Platform.Web)
    });
  }
  async executeTask(extension, task) {
    if (!task.execution) {
      throw new Error("Tasks to execute must include an execution");
    }
    const dto = TaskDTO.from(task, extension);
    if (dto === void 0) {
      throw new Error("Task is not valid");
    }
    if (CustomExecutionDTO.is(dto.execution)) {
      await this.addCustomExecution(dto, task, false);
    } else {
      throw new NotSupportedError();
    }
    const execution = await this.getTaskExecution(await this._proxy.$getTaskExecution(dto), task);
    this._proxy.$executeTask(dto).catch((error) => {
      throw new Error(error);
    });
    return execution;
  }
  provideTasksInternal(validTypes, taskIdPromises, handler, value) {
    const taskDTOs = [];
    if (value) {
      for (const task of value) {
        this.checkDeprecation(task, handler);
        if (!task.definition || !validTypes[task.definition.type]) {
          const source = task.source ? task.source : "No task source";
          this._logService.warn(`The task [${source}, ${task.name}] uses an undefined task type. The task will be ignored in the future.`);
        }
        const taskDTO = TaskDTO.from(task, handler.extension);
        if (taskDTO && CustomExecutionDTO.is(taskDTO.execution)) {
          taskDTOs.push(taskDTO);
          taskIdPromises.push(this.addCustomExecution(taskDTO, task, true));
        } else {
          this._logService.warn("Only custom execution tasks supported.");
        }
      }
    }
    return {
      tasks: taskDTOs,
      extension: handler.extension
    };
  }
  async resolveTaskInternal(resolvedTaskDTO) {
    if (CustomExecutionDTO.is(resolvedTaskDTO.execution)) {
      return resolvedTaskDTO;
    } else {
      this._logService.warn("Only custom execution tasks supported.");
    }
    return void 0;
  }
  async $resolveVariables(uriComponents, toResolve) {
    const result = {
      process: void 0,
      variables: /* @__PURE__ */ Object.create(null)
    };
    return result;
  }
  async $jsonTasksSupported() {
    return false;
  }
  async $findExecutable(command, cwd, paths) {
    return void 0;
  }
};
WorkerExtHostTask = __decorateClass([
  __decorateParam(0, IExtHostRpcService),
  __decorateParam(1, IExtHostInitDataService),
  __decorateParam(2, IExtHostWorkspace),
  __decorateParam(3, IExtHostDocumentsAndEditors),
  __decorateParam(4, IExtHostConfiguration),
  __decorateParam(5, IExtHostTerminalService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IExtHostApiDeprecationService)
], WorkerExtHostTask);
const IExtHostTask = createDecorator("IExtHostTask");
export {
  CustomExecutionDTO,
  ExtHostTaskBase,
  IExtHostTask,
  TaskDTO,
  TaskHandleDTO,
  WorkerExtHostTask
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RUYXNrLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGFzUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuXG5pbXBvcnQgeyBNYWluQ29udGV4dCwgTWFpblRocmVhZFRhc2tTaGFwZSwgRXh0SG9zdFRhc2tTaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlcyBmcm9tICcuL2V4dEhvc3RUeXBlcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdFdvcmtzcGFjZVByb3ZpZGVyLCBJRXh0SG9zdFdvcmtzcGFjZSB9IGZyb20gJy4vZXh0SG9zdFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0ICogYXMgdGFza3MgZnJvbSAnLi9zaGFyZWQvdGFza3MuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi9leHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuL2V4dEhvc3RDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RScGNTZXJ2aWNlIH0gZnJvbSAnLi9leHRIb3N0UnBjU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdEluaXREYXRhU2VydmljZSB9IGZyb20gJy4vZXh0SG9zdEluaXREYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCAqIGFzIFBsYXRmb3JtIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UgfSBmcm9tICcuL2V4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVNFUl9UQVNLU19HUk9VUF9LRVkgfSBmcm9tICcuLi8uLi9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrcy5qcyc7XG5pbXBvcnQgeyBFcnJvck5vVGVsZW1ldHJ5LCBOb3RTdXBwb3J0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBhc0FycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IElUYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkRHRvLCBJVGFza1Byb2JsZW1NYXRjaGVyRW5kZWREdG8gfSBmcm9tICcuL3NoYXJlZC90YXNrcy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dEhvc3RUYXNrIGV4dGVuZHMgRXh0SG9zdFRhc2tTaGFwZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHRhc2tFeGVjdXRpb25zOiB2c2NvZGUuVGFza0V4ZWN1dGlvbltdO1xuXHRyZWFkb25seSBvbkRpZFN0YXJ0VGFzazogRXZlbnQ8dnNjb2RlLlRhc2tTdGFydEV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRFbmRUYXNrOiBFdmVudDx2c2NvZGUuVGFza0VuZEV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRTdGFydFRhc2tQcm9jZXNzOiBFdmVudDx2c2NvZGUuVGFza1Byb2Nlc3NTdGFydEV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRFbmRUYXNrUHJvY2VzczogRXZlbnQ8dnNjb2RlLlRhc2tQcm9jZXNzRW5kRXZlbnQ+O1xuXHRyZWFkb25seSBvbkRpZFN0YXJ0VGFza1Byb2JsZW1NYXRjaGVyczogRXZlbnQ8dnNjb2RlLlRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWRFdmVudD47XG5cdHJlYWRvbmx5IG9uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVyczogRXZlbnQ8dnNjb2RlLlRhc2tQcm9ibGVtTWF0Y2hlckVuZGVkRXZlbnQ+O1xuXG5cdHJlZ2lzdGVyVGFza1Byb3ZpZGVyKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0eXBlOiBzdHJpbmcsIHByb3ZpZGVyOiB2c2NvZGUuVGFza1Byb3ZpZGVyKTogdnNjb2RlLkRpc3Bvc2FibGU7XG5cdHJlZ2lzdGVyVGFza1N5c3RlbShzY2hlbWU6IHN0cmluZywgaW5mbzogdGFza3MuSVRhc2tTeXN0ZW1JbmZvRFRPKTogdm9pZDtcblx0ZmV0Y2hUYXNrcyhmaWx0ZXI/OiB2c2NvZGUuVGFza0ZpbHRlcik6IFByb21pc2U8dnNjb2RlLlRhc2tbXT47XG5cdGV4ZWN1dGVUYXNrKGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCB0YXNrOiB2c2NvZGUuVGFzayk6IFByb21pc2U8dnNjb2RlLlRhc2tFeGVjdXRpb24+O1xuXHR0ZXJtaW5hdGVUYXNrKGV4ZWN1dGlvbjogdnNjb2RlLlRhc2tFeGVjdXRpb24pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5uYW1lc3BhY2UgVGFza0RlZmluaXRpb25EVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLlRhc2tEZWZpbml0aW9uKTogdGFza3MuSVRhc2tEZWZpbml0aW9uRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0byh2YWx1ZTogdGFza3MuSVRhc2tEZWZpbml0aW9uRFRPKTogdnNjb2RlLlRhc2tEZWZpbml0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbm5hbWVzcGFjZSBUYXNrUHJlc2VudGF0aW9uT3B0aW9uc0RUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuVGFza1ByZXNlbnRhdGlvbk9wdGlvbnMpOiB0YXNrcy5JVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiB0YXNrcy5JVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8pOiB2c2NvZGUuVGFza1ByZXNlbnRhdGlvbk9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cbn1cblxubmFtZXNwYWNlIFByb2Nlc3NFeGVjdXRpb25PcHRpb25zRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uT3B0aW9ucyk6IHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyk6IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxufVxuXG5uYW1lc3BhY2UgUHJvY2Vzc0V4ZWN1dGlvbkRUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdGFza3MuSVNoZWxsRXhlY3V0aW9uRFRPIHwgdGFza3MuSVByb2Nlc3NFeGVjdXRpb25EVE8gfCB0YXNrcy5JQ3VzdG9tRXhlY3V0aW9uRFRPIHwgdW5kZWZpbmVkKTogdmFsdWUgaXMgdGFza3MuSVByb2Nlc3NFeGVjdXRpb25EVE8ge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWUgYXMgdGFza3MuSVByb2Nlc3NFeGVjdXRpb25EVE87XG5cdFx0XHRyZXR1cm4gY2FuZGlkYXRlICYmICEhY2FuZGlkYXRlLnByb2Nlc3M7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5Qcm9jZXNzRXhlY3V0aW9uKTogdGFza3MuSVByb2Nlc3NFeGVjdXRpb25EVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uRFRPID0ge1xuXHRcdFx0cHJvY2VzczogdmFsdWUucHJvY2Vzcyxcblx0XHRcdGFyZ3M6IHZhbHVlLmFyZ3Ncblx0XHR9O1xuXHRcdGlmICh2YWx1ZS5vcHRpb25zKSB7XG5cdFx0XHRyZXN1bHQub3B0aW9ucyA9IFByb2Nlc3NFeGVjdXRpb25PcHRpb25zRFRPLmZyb20odmFsdWUub3B0aW9ucyk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiB0YXNrcy5JUHJvY2Vzc0V4ZWN1dGlvbkRUTyk6IHR5cGVzLlByb2Nlc3NFeGVjdXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IHR5cGVzLlByb2Nlc3NFeGVjdXRpb24odmFsdWUucHJvY2VzcywgdmFsdWUuYXJncywgdmFsdWUub3B0aW9ucyk7XG5cdH1cbn1cblxubmFtZXNwYWNlIFNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuU2hlbGxFeGVjdXRpb25PcHRpb25zKTogdGFza3MuSVNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IHRhc2tzLklTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8pOiB2c2NvZGUuU2hlbGxFeGVjdXRpb25PcHRpb25zIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG59XG5cbm5hbWVzcGFjZSBTaGVsbEV4ZWN1dGlvbkRUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBpcyh2YWx1ZTogdGFza3MuSVNoZWxsRXhlY3V0aW9uRFRPIHwgdGFza3MuSVByb2Nlc3NFeGVjdXRpb25EVE8gfCB0YXNrcy5JQ3VzdG9tRXhlY3V0aW9uRFRPIHwgdW5kZWZpbmVkKTogdmFsdWUgaXMgdGFza3MuSVNoZWxsRXhlY3V0aW9uRFRPIHtcblx0XHRpZiAodmFsdWUpIHtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IHZhbHVlIGFzIHRhc2tzLklTaGVsbEV4ZWN1dGlvbkRUTztcblx0XHRcdHJldHVybiBjYW5kaWRhdGUgJiYgKCEhY2FuZGlkYXRlLmNvbW1hbmRMaW5lIHx8ICEhY2FuZGlkYXRlLmNvbW1hbmQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB2c2NvZGUuU2hlbGxFeGVjdXRpb24pOiB0YXNrcy5JU2hlbGxFeGVjdXRpb25EVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IHRhc2tzLklTaGVsbEV4ZWN1dGlvbkRUTyA9IHtcblx0XHR9O1xuXHRcdGlmICh2YWx1ZS5jb21tYW5kTGluZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQuY29tbWFuZExpbmUgPSB2YWx1ZS5jb21tYW5kTGluZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LmNvbW1hbmQgPSB2YWx1ZS5jb21tYW5kO1xuXHRcdFx0cmVzdWx0LmFyZ3MgPSB2YWx1ZS5hcmdzO1xuXHRcdH1cblx0XHRpZiAodmFsdWUub3B0aW9ucykge1xuXHRcdFx0cmVzdWx0Lm9wdGlvbnMgPSBTaGVsbEV4ZWN1dGlvbk9wdGlvbnNEVE8uZnJvbSh2YWx1ZS5vcHRpb25zKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gdG8odmFsdWU6IHRhc2tzLklTaGVsbEV4ZWN1dGlvbkRUTyk6IHR5cGVzLlNoZWxsRXhlY3V0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCB8fCAodmFsdWUuY29tbWFuZCA9PT0gdW5kZWZpbmVkICYmIHZhbHVlLmNvbW1hbmRMaW5lID09PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodmFsdWUuY29tbWFuZExpbmUpIHtcblx0XHRcdHJldHVybiBuZXcgdHlwZXMuU2hlbGxFeGVjdXRpb24odmFsdWUuY29tbWFuZExpbmUsIHZhbHVlLm9wdGlvbnMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLlNoZWxsRXhlY3V0aW9uKHZhbHVlLmNvbW1hbmQhLCB2YWx1ZS5hcmdzID8gdmFsdWUuYXJncyA6IFtdLCB2YWx1ZS5vcHRpb25zKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBDdXN0b21FeGVjdXRpb25EVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gaXModmFsdWU6IHRhc2tzLklTaGVsbEV4ZWN1dGlvbkRUTyB8IHRhc2tzLklQcm9jZXNzRXhlY3V0aW9uRFRPIHwgdGFza3MuSUN1c3RvbUV4ZWN1dGlvbkRUTyB8IHVuZGVmaW5lZCk6IHZhbHVlIGlzIHRhc2tzLklDdXN0b21FeGVjdXRpb25EVE8ge1xuXHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0Y29uc3QgY2FuZGlkYXRlID0gdmFsdWUgYXMgdGFza3MuSUN1c3RvbUV4ZWN1dGlvbkRUTztcblx0XHRcdHJldHVybiBjYW5kaWRhdGUgJiYgY2FuZGlkYXRlLmN1c3RvbUV4ZWN1dGlvbiA9PT0gJ2N1c3RvbUV4ZWN1dGlvbic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLkN1c3RvbUV4ZWN1dGlvbik6IHRhc2tzLklDdXN0b21FeGVjdXRpb25EVE8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRjdXN0b21FeGVjdXRpb246ICdjdXN0b21FeGVjdXRpb24nXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiB0byh0YXNrSWQ6IHN0cmluZywgcHJvdmlkZWRDdXN0b21FeGV1dGlvbnM6IE1hcDxzdHJpbmcsIHR5cGVzLkN1c3RvbUV4ZWN1dGlvbj4pOiB0eXBlcy5DdXN0b21FeGVjdXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwcm92aWRlZEN1c3RvbUV4ZXV0aW9ucy5nZXQodGFza0lkKTtcblx0fVxufVxuXG5cbmV4cG9ydCBuYW1lc3BhY2UgVGFza0hhbmRsZURUTyB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tKHZhbHVlOiB0eXBlcy5UYXNrLCB3b3Jrc3BhY2VTZXJ2aWNlPzogSUV4dEhvc3RXb3Jrc3BhY2UpOiB0YXNrcy5JVGFza0hhbmRsZURUTyB7XG5cdFx0bGV0IGZvbGRlcjogVXJpQ29tcG9uZW50cyB8IHN0cmluZztcblx0XHRpZiAodmFsdWUuc2NvcGUgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgdmFsdWUuc2NvcGUgIT09ICdudW1iZXInKSB7XG5cdFx0XHRmb2xkZXIgPSB2YWx1ZS5zY29wZS51cmk7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZS5zY29wZSAhPT0gdW5kZWZpbmVkICYmIHR5cGVvZiB2YWx1ZS5zY29wZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdGlmICgodmFsdWUuc2NvcGUgPT09IHR5cGVzLlRhc2tTY29wZS5Xb3Jrc3BhY2UpICYmIHdvcmtzcGFjZVNlcnZpY2UgJiYgd29ya3NwYWNlU2VydmljZS53b3Jrc3BhY2VGaWxlKSB7XG5cdFx0XHRcdGZvbGRlciA9IHdvcmtzcGFjZVNlcnZpY2Uud29ya3NwYWNlRmlsZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvbGRlciA9IFVTRVJfVEFTS1NfR1JPVVBfS0VZO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHZhbHVlLl9pZCEsXG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IGZvbGRlciFcblx0XHR9O1xuXHR9XG59XG5uYW1lc3BhY2UgVGFza0dyb3VwRFRPIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odmFsdWU6IHZzY29kZS5UYXNrR3JvdXApOiB0YXNrcy5JVGFza0dyb3VwRFRPIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgX2lkOiB2YWx1ZS5pZCwgaXNEZWZhdWx0OiB2YWx1ZS5pc0RlZmF1bHQgfTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRhc2tEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbU1hbnkodGFza3M6IHZzY29kZS5UYXNrW10sIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdGFza3MuSVRhc2tEVE9bXSB7XG5cdFx0aWYgKHRhc2tzID09PSB1bmRlZmluZWQgfHwgdGFza3MgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiB0YXNrcy5JVGFza0RUT1tdID0gW107XG5cdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRjb25zdCBjb252ZXJ0ZWQgPSBmcm9tKHRhc2ssIGV4dGVuc2lvbik7XG5cdFx0XHRpZiAoY29udmVydGVkKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGNvbnZlcnRlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLlRhc2ssIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uKTogdGFza3MuSVRhc2tEVE8gfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgZXhlY3V0aW9uOiB0YXNrcy5JU2hlbGxFeGVjdXRpb25EVE8gfCB0YXNrcy5JUHJvY2Vzc0V4ZWN1dGlvbkRUTyB8IHRhc2tzLklDdXN0b21FeGVjdXRpb25EVE8gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHZhbHVlLmV4ZWN1dGlvbiBpbnN0YW5jZW9mIHR5cGVzLlByb2Nlc3NFeGVjdXRpb24pIHtcblx0XHRcdGV4ZWN1dGlvbiA9IFByb2Nlc3NFeGVjdXRpb25EVE8uZnJvbSh2YWx1ZS5leGVjdXRpb24pO1xuXHRcdH0gZWxzZSBpZiAodmFsdWUuZXhlY3V0aW9uIGluc3RhbmNlb2YgdHlwZXMuU2hlbGxFeGVjdXRpb24pIHtcblx0XHRcdGV4ZWN1dGlvbiA9IFNoZWxsRXhlY3V0aW9uRFRPLmZyb20odmFsdWUuZXhlY3V0aW9uKTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlLmV4ZWN1dGlvbiAmJiB2YWx1ZS5leGVjdXRpb24gaW5zdGFuY2VvZiB0eXBlcy5DdXN0b21FeGVjdXRpb24pIHtcblx0XHRcdGV4ZWN1dGlvbiA9IEN1c3RvbUV4ZWN1dGlvbkRUTy5mcm9tKDx0eXBlcy5DdXN0b21FeGVjdXRpb24+dmFsdWUuZXhlY3V0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCBkZWZpbml0aW9uOiB0YXNrcy5JVGFza0RlZmluaXRpb25EVE8gfCB1bmRlZmluZWQgPSBUYXNrRGVmaW5pdGlvbkRUTy5mcm9tKHZhbHVlLmRlZmluaXRpb24pO1xuXHRcdGxldCBzY29wZTogbnVtYmVyIHwgVXJpQ29tcG9uZW50cztcblx0XHRpZiAodmFsdWUuc2NvcGUpIHtcblx0XHRcdGlmICh0eXBlb2YgdmFsdWUuc2NvcGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHNjb3BlID0gdmFsdWUuc2NvcGU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzY29wZSA9IHZhbHVlLnNjb3BlLnVyaTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gVG8gY29udGludWUgdG8gc3VwcG9ydCB0aGUgZGVwcmVjYXRlZCB0YXNrIGNvbnN0cnVjdG9yIHRoYXQgZG9lc24ndCB0YWtlIGEgc2NvcGUsIHdlIG11c3QgYWRkIGEgc2NvcGUgaGVyZTpcblx0XHRcdHNjb3BlID0gdHlwZXMuVGFza1Njb3BlLldvcmtzcGFjZTtcblx0XHR9XG5cdFx0aWYgKCFkZWZpbml0aW9uIHx8ICFzY29wZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiB0YXNrcy5JVGFza0RUTyA9IHtcblx0XHRcdF9pZDogKHZhbHVlIGFzIHR5cGVzLlRhc2spLl9pZCEsXG5cdFx0XHRkZWZpbml0aW9uLFxuXHRcdFx0bmFtZTogdmFsdWUubmFtZSxcblx0XHRcdHNvdXJjZToge1xuXHRcdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0XHRcdGxhYmVsOiB2YWx1ZS5zb3VyY2UsXG5cdFx0XHRcdHNjb3BlOiBzY29wZVxuXHRcdFx0fSxcblx0XHRcdGV4ZWN1dGlvbjogZXhlY3V0aW9uISxcblx0XHRcdGlzQmFja2dyb3VuZDogdmFsdWUuaXNCYWNrZ3JvdW5kLFxuXHRcdFx0Z3JvdXA6IFRhc2tHcm91cERUTy5mcm9tKHZhbHVlLmdyb3VwIGFzIHZzY29kZS5UYXNrR3JvdXApLFxuXHRcdFx0cHJlc2VudGF0aW9uT3B0aW9uczogVGFza1ByZXNlbnRhdGlvbk9wdGlvbnNEVE8uZnJvbSh2YWx1ZS5wcmVzZW50YXRpb25PcHRpb25zKSxcblx0XHRcdHByb2JsZW1NYXRjaGVyczogYXNBcnJheSh2YWx1ZS5wcm9ibGVtTWF0Y2hlcnMpLFxuXHRcdFx0aGFzRGVmaW5lZE1hdGNoZXJzOiAodmFsdWUgYXMgdHlwZXMuVGFzaykuaGFzRGVmaW5lZE1hdGNoZXJzLFxuXHRcdFx0cnVuT3B0aW9uczogdmFsdWUucnVuT3B0aW9ucyA/IHZhbHVlLnJ1bk9wdGlvbnMgOiB7IHJlZXZhbHVhdGVPblJlcnVuOiB0cnVlIH0sXG5cdFx0XHRkZXRhaWw6IHZhbHVlLmRldGFpbFxuXHRcdH07XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXHRleHBvcnQgYXN5bmMgZnVuY3Rpb24gdG8odmFsdWU6IHRhc2tzLklUYXNrRFRPIHwgdW5kZWZpbmVkLCB3b3Jrc3BhY2U6IElFeHRIb3N0V29ya3NwYWNlUHJvdmlkZXIsIHByb3ZpZGVkQ3VzdG9tRXhldXRpb25zOiBNYXA8c3RyaW5nLCB0eXBlcy5DdXN0b21FeGVjdXRpb24+KTogUHJvbWlzZTx0eXBlcy5UYXNrIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKHZhbHVlID09PSB1bmRlZmluZWQgfHwgdmFsdWUgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCBleGVjdXRpb246IHR5cGVzLlNoZWxsRXhlY3V0aW9uIHwgdHlwZXMuUHJvY2Vzc0V4ZWN1dGlvbiB8IHR5cGVzLkN1c3RvbUV4ZWN1dGlvbiB8IHVuZGVmaW5lZDtcblx0XHRpZiAoUHJvY2Vzc0V4ZWN1dGlvbkRUTy5pcyh2YWx1ZS5leGVjdXRpb24pKSB7XG5cdFx0XHRleGVjdXRpb24gPSBQcm9jZXNzRXhlY3V0aW9uRFRPLnRvKHZhbHVlLmV4ZWN1dGlvbik7XG5cdFx0fSBlbHNlIGlmIChTaGVsbEV4ZWN1dGlvbkRUTy5pcyh2YWx1ZS5leGVjdXRpb24pKSB7XG5cdFx0XHRleGVjdXRpb24gPSBTaGVsbEV4ZWN1dGlvbkRUTy50byh2YWx1ZS5leGVjdXRpb24pO1xuXHRcdH0gZWxzZSBpZiAoQ3VzdG9tRXhlY3V0aW9uRFRPLmlzKHZhbHVlLmV4ZWN1dGlvbikpIHtcblx0XHRcdGV4ZWN1dGlvbiA9IEN1c3RvbUV4ZWN1dGlvbkRUTy50byh2YWx1ZS5faWQsIHByb3ZpZGVkQ3VzdG9tRXhldXRpb25zKTtcblx0XHR9XG5cdFx0Y29uc3QgZGVmaW5pdGlvbjogdnNjb2RlLlRhc2tEZWZpbml0aW9uIHwgdW5kZWZpbmVkID0gVGFza0RlZmluaXRpb25EVE8udG8odmFsdWUuZGVmaW5pdGlvbik7XG5cdFx0bGV0IHNjb3BlOiB2c2NvZGUuVGFza1Njb3BlLkdsb2JhbCB8IHZzY29kZS5UYXNrU2NvcGUuV29ya3NwYWNlIHwgdnNjb2RlLldvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAodmFsdWUuc291cmNlKSB7XG5cdFx0XHRpZiAodmFsdWUuc291cmNlLnNjb3BlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZS5zb3VyY2Uuc2NvcGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0c2NvcGUgPSB2YWx1ZS5zb3VyY2Uuc2NvcGU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2NvcGUgPSBhd2FpdCB3b3Jrc3BhY2UucmVzb2x2ZVdvcmtzcGFjZUZvbGRlcihVUkkucmV2aXZlKHZhbHVlLnNvdXJjZS5zY29wZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzY29wZSA9IHR5cGVzLlRhc2tTY29wZS5Xb3Jrc3BhY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghZGVmaW5pdGlvbiB8fCAhc2NvcGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyB0eXBlcy5UYXNrKGRlZmluaXRpb24sIHNjb3BlLCB2YWx1ZS5uYW1lISwgdmFsdWUuc291cmNlLmxhYmVsLCBleGVjdXRpb24sIHZhbHVlLnByb2JsZW1NYXRjaGVycyk7XG5cdFx0aWYgKHZhbHVlLmlzQmFja2dyb3VuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXN1bHQuaXNCYWNrZ3JvdW5kID0gdmFsdWUuaXNCYWNrZ3JvdW5kO1xuXHRcdH1cblx0XHRpZiAodmFsdWUuZ3JvdXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVzdWx0Lmdyb3VwID0gdHlwZXMuVGFza0dyb3VwLmZyb20odmFsdWUuZ3JvdXAuX2lkKTtcblx0XHRcdGlmIChyZXN1bHQuZ3JvdXAgJiYgdmFsdWUuZ3JvdXAuaXNEZWZhdWx0KSB7XG5cdFx0XHRcdHJlc3VsdC5ncm91cCA9IG5ldyB0eXBlcy5UYXNrR3JvdXAocmVzdWx0Lmdyb3VwLmlkLCByZXN1bHQuZ3JvdXAubGFiZWwpO1xuXHRcdFx0XHRpZiAodmFsdWUuZ3JvdXAuaXNEZWZhdWx0ID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0cmVzdWx0Lmdyb3VwLmlzRGVmYXVsdCA9IHZhbHVlLmdyb3VwLmlzRGVmYXVsdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodmFsdWUucHJlc2VudGF0aW9uT3B0aW9ucykge1xuXHRcdFx0cmVzdWx0LnByZXNlbnRhdGlvbk9wdGlvbnMgPSBUYXNrUHJlc2VudGF0aW9uT3B0aW9uc0RUTy50byh2YWx1ZS5wcmVzZW50YXRpb25PcHRpb25zKSE7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS5ydW5PcHRpb25zKSB7XG5cdFx0XHRyZXN1bHQucnVuT3B0aW9ucyA9IHZhbHVlLnJ1bk9wdGlvbnM7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS5faWQpIHtcblx0XHRcdHJlc3VsdC5faWQgPSB2YWx1ZS5faWQ7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS5kZXRhaWwpIHtcblx0XHRcdHJlc3VsdC5kZXRhaWwgPSB2YWx1ZS5kZXRhaWw7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxubmFtZXNwYWNlIFRhc2tGaWx0ZXJEVE8ge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogdnNjb2RlLlRhc2tGaWx0ZXIgfCB1bmRlZmluZWQpOiB0YXNrcy5JVGFza0ZpbHRlckRUTyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvKHZhbHVlOiB0YXNrcy5JVGFza0ZpbHRlckRUTyk6IHZzY29kZS5UYXNrRmlsdGVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCB2YWx1ZSk7XG5cdH1cbn1cblxuY2xhc3MgVGFza0V4ZWN1dGlvbkltcGwgaW1wbGVtZW50cyB2c2NvZGUuVGFza0V4ZWN1dGlvbiB7XG5cblx0cmVhZG9ubHkgI3Rhc2tzOiBFeHRIb3N0VGFza0Jhc2U7XG5cdHByaXZhdGUgX3Rlcm1pbmFsOiB2c2NvZGUuVGVybWluYWwgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IodGFza3M6IEV4dEhvc3RUYXNrQmFzZSwgcmVhZG9ubHkgX2lkOiBzdHJpbmcsIHByaXZhdGUgcmVhZG9ubHkgX3Rhc2s6IHZzY29kZS5UYXNrKSB7XG5cdFx0dGhpcy4jdGFza3MgPSB0YXNrcztcblx0fVxuXG5cdHB1YmxpYyBnZXQgdGFzaygpOiB2c2NvZGUuVGFzayB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2s7XG5cdH1cblxuXHRwdWJsaWMgdGVybWluYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuI3Rhc2tzLnRlcm1pbmF0ZVRhc2sodGhpcyk7XG5cdH1cblxuXHRwdWJsaWMgZmlyZURpZFN0YXJ0UHJvY2Vzcyh2YWx1ZTogdGFza3MuSVRhc2tQcm9jZXNzU3RhcnRlZERUTyk6IHZvaWQge1xuXHR9XG5cblx0cHVibGljIGZpcmVEaWRFbmRQcm9jZXNzKHZhbHVlOiB0YXNrcy5JVGFza1Byb2Nlc3NFbmRlZERUTyk6IHZvaWQge1xuXHR9XG5cblx0cHVibGljIGdldCB0ZXJtaW5hbCgpOiB2c2NvZGUuVGVybWluYWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbDtcblx0fVxuXG5cdHB1YmxpYyBzZXQgdGVybWluYWwodGVybTogdnNjb2RlLlRlcm1pbmFsIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fdGVybWluYWwgPSB0ZXJtO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSGFuZGxlckRhdGEge1xuXHR0eXBlOiBzdHJpbmc7XG5cdHByb3ZpZGVyOiB2c2NvZGUuVGFza1Byb3ZpZGVyO1xuXHRleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEV4dEhvc3RUYXNrQmFzZSBpbXBsZW1lbnRzIEV4dEhvc3RUYXNrU2hhcGUsIElFeHRIb3N0VGFzayB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3Byb3h5OiBNYWluVGhyZWFkVGFza1NoYXBlO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3dvcmtzcGFjZVByb3ZpZGVyOiBJRXh0SG9zdFdvcmtzcGFjZVByb3ZpZGVyO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycztcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUV4dEhvc3RDb25maWd1cmF0aW9uO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3Rlcm1pbmFsU2VydmljZTogSUV4dEhvc3RUZXJtaW5hbFNlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2U7XG5cdHByb3RlY3RlZCByZWFkb25seSBfZGVwcmVjYXRpb25TZXJ2aWNlOiBJRXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZTtcblx0cHJvdGVjdGVkIF9oYW5kbGVDb3VudGVyOiBudW1iZXI7XG5cdHByb3RlY3RlZCBfaGFuZGxlcnM6IE1hcDxudW1iZXIsIEhhbmRsZXJEYXRhPjtcblx0cHJvdGVjdGVkIF90YXNrRXhlY3V0aW9uczogTWFwPHN0cmluZywgVGFza0V4ZWN1dGlvbkltcGw+O1xuXHRwcm90ZWN0ZWQgX3Rhc2tFeGVjdXRpb25Qcm9taXNlczogTWFwPHN0cmluZywgUHJvbWlzZTxUYXNrRXhlY3V0aW9uSW1wbD4+O1xuXHRwcm90ZWN0ZWQgX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczI6IE1hcDxzdHJpbmcsIHR5cGVzLkN1c3RvbUV4ZWN1dGlvbj47XG5cdHByaXZhdGUgX25vdFByb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczogU2V0PHN0cmluZz47IC8vIFVzZWQgZm9yIGN1c3RvbSBleGVjdXRpb25zIHRhc2tzIHRoYXQgYXJlIGNyZWF0ZWQgYW5kIHJ1biB0aHJvdWdoIGV4ZWN1dGVUYXNrLlxuXHRwcm90ZWN0ZWQgX2FjdGl2ZUN1c3RvbUV4ZWN1dGlvbnMyOiBNYXA8c3RyaW5nLCB0eXBlcy5DdXN0b21FeGVjdXRpb24+O1xuXHRwcml2YXRlIF9sYXN0U3RhcnRlZFRhc2s6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZEV4ZWN1dGVUYXNrOiBFbWl0dGVyPHZzY29kZS5UYXNrU3RhcnRFdmVudD4gPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGFza1N0YXJ0RXZlbnQ+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRUZXJtaW5hdGVUYXNrOiBFbWl0dGVyPHZzY29kZS5UYXNrRW5kRXZlbnQ+ID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhc2tFbmRFdmVudD4oKTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkVGFza1Byb2Nlc3NTdGFydGVkOiBFbWl0dGVyPHZzY29kZS5UYXNrUHJvY2Vzc1N0YXJ0RXZlbnQ+ID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhc2tQcm9jZXNzU3RhcnRFdmVudD4oKTtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFRhc2tQcm9jZXNzRW5kZWQ6IEVtaXR0ZXI8dnNjb2RlLlRhc2tQcm9jZXNzRW5kRXZlbnQ+ID0gbmV3IEVtaXR0ZXI8dnNjb2RlLlRhc2tQcm9jZXNzRW5kRXZlbnQ+KCk7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRTdGFydFRhc2tQcm9ibGVtTWF0Y2hlcnM6IEVtaXR0ZXI8dnNjb2RlLlRhc2tQcm9ibGVtTWF0Y2hlclN0YXJ0ZWRFdmVudD4gPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZEV2ZW50PigpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVyczogRW1pdHRlcjx2c2NvZGUuVGFza1Byb2JsZW1NYXRjaGVyRW5kZWRFdmVudD4gPSBuZXcgRW1pdHRlcjx2c2NvZGUuVGFza1Byb2JsZW1NYXRjaGVyRW5kZWRFdmVudD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dEhvc3RScGNTZXJ2aWNlIGV4dEhvc3RScGM6IElFeHRIb3N0UnBjU2VydmljZSxcblx0XHRASUV4dEhvc3RJbml0RGF0YVNlcnZpY2UgaW5pdERhdGE6IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlLFxuXHRcdEBJRXh0SG9zdFdvcmtzcGFjZSB3b3Jrc3BhY2VTZXJ2aWNlOiBJRXh0SG9zdFdvcmtzcGFjZSxcblx0XHRASUV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIGVkaXRvclNlcnZpY2U6IElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyxcblx0XHRASUV4dEhvc3RDb25maWd1cmF0aW9uIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJRXh0SG9zdENvbmZpZ3VyYXRpb24sXG5cdFx0QElFeHRIb3N0VGVybWluYWxTZXJ2aWNlIGV4dEhvc3RUZXJtaW5hbFNlcnZpY2U6IElFeHRIb3N0VGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2UgZGVwcmVjYXRpb25TZXJ2aWNlOiBJRXh0SG9zdEFwaURlcHJlY2F0aW9uU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IGV4dEhvc3RScGMuZ2V0UHJveHkoTWFpbkNvbnRleHQuTWFpblRocmVhZFRhc2spO1xuXHRcdHRoaXMuX3dvcmtzcGFjZVByb3ZpZGVyID0gd29ya3NwYWNlU2VydmljZTtcblx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlID0gZWRpdG9yU2VydmljZTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2VydmljZSA9IGV4dEhvc3RUZXJtaW5hbFNlcnZpY2U7XG5cdFx0dGhpcy5faGFuZGxlQ291bnRlciA9IDA7XG5cdFx0dGhpcy5faGFuZGxlcnMgPSBuZXcgTWFwPG51bWJlciwgSGFuZGxlckRhdGE+KCk7XG5cdFx0dGhpcy5fdGFza0V4ZWN1dGlvbnMgPSBuZXcgTWFwPHN0cmluZywgVGFza0V4ZWN1dGlvbkltcGw+KCk7XG5cdFx0dGhpcy5fdGFza0V4ZWN1dGlvblByb21pc2VzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8VGFza0V4ZWN1dGlvbkltcGw+PigpO1xuXHRcdHRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIgPSBuZXcgTWFwPHN0cmluZywgdHlwZXMuQ3VzdG9tRXhlY3V0aW9uPigpO1xuXHRcdHRoaXMuX25vdFByb3ZpZGVkQ3VzdG9tRXhlY3V0aW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX2FjdGl2ZUN1c3RvbUV4ZWN1dGlvbnMyID0gbmV3IE1hcDxzdHJpbmcsIHR5cGVzLkN1c3RvbUV4ZWN1dGlvbj4oKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlID0gbG9nU2VydmljZTtcblx0XHR0aGlzLl9kZXByZWNhdGlvblNlcnZpY2UgPSBkZXByZWNhdGlvblNlcnZpY2U7XG5cdFx0dGhpcy5fcHJveHkuJHJlZ2lzdGVyU3VwcG9ydGVkRXhlY3V0aW9ucyh0cnVlKTtcblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclRhc2tQcm92aWRlcihleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdHlwZTogc3RyaW5nLCBwcm92aWRlcjogdnNjb2RlLlRhc2tQcm92aWRlcik6IHZzY29kZS5EaXNwb3NhYmxlIHtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gbmV3IHR5cGVzLkRpc3Bvc2FibGUoKCkgPT4geyB9KTtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlID0gdGhpcy5uZXh0SGFuZGxlKCk7XG5cdFx0dGhpcy5faGFuZGxlcnMuc2V0KGhhbmRsZSwgeyB0eXBlLCBwcm92aWRlciwgZXh0ZW5zaW9uIH0pO1xuXHRcdHRoaXMuX3Byb3h5LiRyZWdpc3RlclRhc2tQcm92aWRlcihoYW5kbGUsIHR5cGUpO1xuXHRcdHJldHVybiBuZXcgdHlwZXMuRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9oYW5kbGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdHRoaXMuX3Byb3h5LiR1bnJlZ2lzdGVyVGFza1Byb3ZpZGVyKGhhbmRsZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUYXNrU3lzdGVtKHNjaGVtZTogc3RyaW5nLCBpbmZvOiB0YXNrcy5JVGFza1N5c3RlbUluZm9EVE8pOiB2b2lkIHtcblx0XHR0aGlzLl9wcm94eS4kcmVnaXN0ZXJUYXNrU3lzdGVtKHNjaGVtZSwgaW5mbyk7XG5cdH1cblxuXHRwdWJsaWMgZmV0Y2hUYXNrcyhmaWx0ZXI/OiB2c2NvZGUuVGFza0ZpbHRlcik6IFByb21pc2U8dnNjb2RlLlRhc2tbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS4kZmV0Y2hUYXNrcyhUYXNrRmlsdGVyRFRPLmZyb20oZmlsdGVyKSkudGhlbihhc3luYyAodmFsdWVzKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IHZzY29kZS5UYXNrW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdGNvbnN0IHRhc2sgPSBhd2FpdCBUYXNrRFRPLnRvKHZhbHVlLCB0aGlzLl93b3Jrc3BhY2VQcm92aWRlciwgdGhpcy5fcHJvdmlkZWRDdXN0b21FeGVjdXRpb25zMik7XG5cdFx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgZXhlY3V0ZVRhc2soZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uRGVzY3JpcHRpb24sIHRhc2s6IHZzY29kZS5UYXNrKTogUHJvbWlzZTx2c2NvZGUuVGFza0V4ZWN1dGlvbj47XG5cblx0cHVibGljIGdldCB0YXNrRXhlY3V0aW9ucygpOiB2c2NvZGUuVGFza0V4ZWN1dGlvbltdIHtcblx0XHRjb25zdCByZXN1bHQ6IHZzY29kZS5UYXNrRXhlY3V0aW9uW10gPSBbXTtcblx0XHR0aGlzLl90YXNrRXhlY3V0aW9ucy5mb3JFYWNoKHZhbHVlID0+IHJlc3VsdC5wdXNoKHZhbHVlKSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyB0ZXJtaW5hdGVUYXNrKGV4ZWN1dGlvbjogdnNjb2RlLlRhc2tFeGVjdXRpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShleGVjdXRpb24gaW5zdGFuY2VvZiBUYXNrRXhlY3V0aW9uSW1wbCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gdmFsaWQgdGFzayBleGVjdXRpb24gcHJvdmlkZWQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LiR0ZXJtaW5hdGVUYXNrKChleGVjdXRpb24gYXMgVGFza0V4ZWN1dGlvbkltcGwpLl9pZCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkU3RhcnRUYXNrKCk6IEV2ZW50PHZzY29kZS5UYXNrU3RhcnRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEV4ZWN1dGVUYXNrLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRvbkRpZFN0YXJ0VGFzayhleGVjdXRpb246IHRhc2tzLklUYXNrRXhlY3V0aW9uRFRPLCB0ZXJtaW5hbElkOiBudW1iZXIsIHJlc29sdmVkRGVmaW5pdGlvbjogdGFza3MuSVRhc2tEZWZpbml0aW9uRFRPKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VzdG9tRXhlY3V0aW9uOiB0eXBlcy5DdXN0b21FeGVjdXRpb24gfCB1bmRlZmluZWQgPSB0aGlzLl9wcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMyLmdldChleGVjdXRpb24uaWQpO1xuXHRcdGlmIChjdXN0b21FeGVjdXRpb24pIHtcblx0XHRcdC8vIENsb25lIHRoZSBjdXN0b20gZXhlY3V0aW9uIHRvIGtlZXAgdGhlIG9yaWdpbmFsIHVudG91Y2hlZC4gVGhpcyBpcyBpbXBvcnRhbnQgZm9yIG11bHRpcGxlIHJ1bnMgb2YgdGhlIHNhbWUgdGFzay5cblx0XHRcdHRoaXMuX2FjdGl2ZUN1c3RvbUV4ZWN1dGlvbnMyLnNldChleGVjdXRpb24uaWQsIGN1c3RvbUV4ZWN1dGlvbik7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UuYXR0YWNoUHR5VG9UZXJtaW5hbCh0ZXJtaW5hbElkLCBhd2FpdCBjdXN0b21FeGVjdXRpb24uY2FsbGJhY2socmVzb2x2ZWREZWZpbml0aW9uKSk7XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RTdGFydGVkVGFzayA9IGV4ZWN1dGlvbi5pZDtcblxuXHRcdGNvbnN0IHRhc2tFeGVjdXRpb24gPSBhd2FpdCB0aGlzLmdldFRhc2tFeGVjdXRpb24oZXhlY3V0aW9uKTtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5nZXRUZXJtaW5hbEJ5SWQodGVybWluYWxJZCk/LnZhbHVlO1xuXHRcdGlmICh0YXNrRXhlY3V0aW9uKSB7XG5cdFx0XHR0YXNrRXhlY3V0aW9uLnRlcm1pbmFsID0gdGVybWluYWw7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRFeGVjdXRlVGFzay5maXJlKHtcblx0XHRcdGV4ZWN1dGlvbjogdGFza0V4ZWN1dGlvblxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZEVuZFRhc2soKTogRXZlbnQ8dnNjb2RlLlRhc2tFbmRFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFRlcm1pbmF0ZVRhc2suZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJE9uRGlkRW5kVGFzayhleGVjdXRpb246IHRhc2tzLklUYXNrRXhlY3V0aW9uRFRPKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl90YXNrRXhlY3V0aW9uUHJvbWlzZXMuaGFzKGV4ZWN1dGlvbi5pZCkpIHtcblx0XHRcdC8vIEV2ZW50IGFscmVhZHkgZmlyZWQgYnkgdGhlIG1haW4gdGhyZWFkXG5cdFx0XHQvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvY29tbWl0L2FhZjczOTIwYWVhZTE3MTA5NmQyMDVlZmIyYzU4ODA0YTMyYjY4NDZcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgX2V4ZWN1dGlvbiA9IGF3YWl0IHRoaXMuZ2V0VGFza0V4ZWN1dGlvbihleGVjdXRpb24pO1xuXHRcdHRoaXMuX3Rhc2tFeGVjdXRpb25Qcm9taXNlcy5kZWxldGUoZXhlY3V0aW9uLmlkKTtcblx0XHR0aGlzLl90YXNrRXhlY3V0aW9ucy5kZWxldGUoZXhlY3V0aW9uLmlkKTtcblx0XHR0aGlzLmN1c3RvbUV4ZWN1dGlvbkNvbXBsZXRlKGV4ZWN1dGlvbik7XG5cdFx0dGhpcy5fb25EaWRUZXJtaW5hdGVUYXNrLmZpcmUoe1xuXHRcdFx0ZXhlY3V0aW9uOiBfZXhlY3V0aW9uXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkU3RhcnRUYXNrUHJvY2VzcygpOiBFdmVudDx2c2NvZGUuVGFza1Byb2Nlc3NTdGFydEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkVGFza1Byb2Nlc3NTdGFydGVkLmV2ZW50O1xuXHR9XG5cblx0cHVibGljIGFzeW5jICRvbkRpZFN0YXJ0VGFza1Byb2Nlc3ModmFsdWU6IHRhc2tzLklUYXNrUHJvY2Vzc1N0YXJ0ZWREVE8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGVjdXRpb24gPSBhd2FpdCB0aGlzLmdldFRhc2tFeGVjdXRpb24odmFsdWUuaWQpO1xuXHRcdHRoaXMuX29uRGlkVGFza1Byb2Nlc3NTdGFydGVkLmZpcmUoe1xuXHRcdFx0ZXhlY3V0aW9uOiBleGVjdXRpb24sXG5cdFx0XHRwcm9jZXNzSWQ6IHZhbHVlLnByb2Nlc3NJZFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZEVuZFRhc2tQcm9jZXNzKCk6IEV2ZW50PHZzY29kZS5UYXNrUHJvY2Vzc0VuZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkVGFza1Byb2Nlc3NFbmRlZC5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkb25EaWRFbmRUYXNrUHJvY2Vzcyh2YWx1ZTogdGFza3MuSVRhc2tQcm9jZXNzRW5kZWREVE8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGVjdXRpb24gPSBhd2FpdCB0aGlzLmdldFRhc2tFeGVjdXRpb24odmFsdWUuaWQpO1xuXHRcdHRoaXMuX29uRGlkVGFza1Byb2Nlc3NFbmRlZC5maXJlKHtcblx0XHRcdGV4ZWN1dGlvbjogZXhlY3V0aW9uLFxuXHRcdFx0ZXhpdENvZGU6IHZhbHVlLmV4aXRDb2RlXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkU3RhcnRUYXNrUHJvYmxlbU1hdGNoZXJzKCk6IEV2ZW50PHZzY29kZS5UYXNrUHJvYmxlbU1hdGNoZXJTdGFydGVkRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRTdGFydFRhc2tQcm9ibGVtTWF0Y2hlcnMuZXZlbnQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgJG9uRGlkU3RhcnRUYXNrUHJvYmxlbU1hdGNoZXJzKHZhbHVlOiBJVGFza1Byb2JsZW1NYXRjaGVyU3RhcnRlZER0byk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBleGVjdXRpb247XG5cdFx0dHJ5IHtcblx0XHRcdGV4ZWN1dGlvbiA9IGF3YWl0IHRoaXMuZ2V0VGFza0V4ZWN1dGlvbih2YWx1ZS5leGVjdXRpb24uaWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBUaGUgdGFzayBleGVjdXRpb24gaXMgbm90IGF2YWlsYWJsZSBhbnltb3JlXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRTdGFydFRhc2tQcm9ibGVtTWF0Y2hlcnMuZmlyZSh7IGV4ZWN1dGlvbiB9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25EaWRFbmRUYXNrUHJvYmxlbU1hdGNoZXJzKCk6IEV2ZW50PHZzY29kZS5UYXNrUHJvYmxlbU1hdGNoZXJFbmRlZEV2ZW50PiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVycy5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkb25EaWRFbmRUYXNrUHJvYmxlbU1hdGNoZXJzKHZhbHVlOiBJVGFza1Byb2JsZW1NYXRjaGVyRW5kZWREdG8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZXhlY3V0aW9uO1xuXHRcdHRyeSB7XG5cdFx0XHRleGVjdXRpb24gPSBhd2FpdCB0aGlzLmdldFRhc2tFeGVjdXRpb24odmFsdWUuZXhlY3V0aW9uLmlkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Ly8gVGhlIHRhc2sgZXhlY3V0aW9uIGlzIG5vdCBhdmFpbGFibGUgYW55bW9yZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkRW5kVGFza1Byb2JsZW1NYXRjaGVycy5maXJlKHsgZXhlY3V0aW9uLCBoYXNFcnJvcnM6IHZhbHVlLmhhc0Vycm9ycyB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBwcm92aWRlVGFza3NJbnRlcm5hbCh2YWxpZFR5cGVzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSwgdGFza0lkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSwgaGFuZGxlcjogSGFuZGxlckRhdGEsIHZhbHVlOiB2c2NvZGUuVGFza1tdIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHsgdGFza3M6IHRhc2tzLklUYXNrRFRPW107IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH07XG5cblx0cHVibGljICRwcm92aWRlVGFza3MoaGFuZGxlOiBudW1iZXIsIHZhbGlkVHlwZXM6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9KTogUHJvbWlzZTx0YXNrcy5JVGFza1NldERUTz4ge1xuXHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLl9oYW5kbGVycy5nZXQoaGFuZGxlKTtcblx0XHRpZiAoIWhhbmRsZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vIGhhbmRsZXIgZm91bmQnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IHVwIGEgbGlzdCBvZiB0YXNrIElEIHByb21pc2VzIHRoYXQgd2UgY2FuIHdhaXQgb25cblx0XHQvLyBiZWZvcmUgcmV0dXJuaW5nIHRoZSBwcm92aWRlZCB0YXNrcy4gVGhlIGVuc3VyZXMgdGhhdFxuXHRcdC8vIG91ciB0YXNrIElEcyBhcmUgY2FsY3VsYXRlZCBmb3IgYW55IGN1c3RvbSBleGVjdXRpb24gdGFza3MuXG5cdFx0Ly8gS25vd2luZyB0aGlzIElEIGFoZWFkIG9mIHRpbWUgaXMgbmVlZGVkIGJlY2F1c2Ugd2hlbiBhIHRhc2tcblx0XHQvLyBzdGFydCBldmVudCBpcyBmaXJlZCB0aGlzIGlzIHdoZW4gdGhlIGN1c3RvbSBleGVjdXRpb24gaXMgY2FsbGVkLlxuXHRcdC8vIFRoZSB0YXNrIHN0YXJ0IGV2ZW50IGlzIGFsc28gdGhlIGZpcnN0IHRpbWUgd2Ugc2VlIHRoZSBJRCBmcm9tIHRoZSBtYWluXG5cdFx0Ly8gdGhyZWFkLCB3aGljaCBpcyB0b28gbGF0ZSBmb3IgdXMgYmVjYXVzZSB3ZSBuZWVkIHRvIHNhdmUgYW4gbWFwXG5cdFx0Ly8gZnJvbSBhbiBJRCB0byB0aGUgY3VzdG9tIGV4ZWN1dGlvbiBmdW5jdGlvbi4gKEtpbmQgb2YgYSBjYXJ0IGJlZm9yZSB0aGUgaG9yc2UgcHJvYmxlbSkuXG5cdFx0Y29uc3QgdGFza0lkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGNvbnN0IGZldGNoUHJvbWlzZSA9IGFzUHJvbWlzZSgoKSA9PiBoYW5kbGVyLnByb3ZpZGVyLnByb3ZpZGVUYXNrcyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkudGhlbih2YWx1ZSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlVGFza3NJbnRlcm5hbCh2YWxpZFR5cGVzLCB0YXNrSWRQcm9taXNlcywgaGFuZGxlciwgdmFsdWUpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRmZXRjaFByb21pc2UudGhlbigocmVzdWx0KSA9PiB7XG5cdFx0XHRcdFByb21pc2UuYWxsKHRhc2tJZFByb21pc2VzKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgcmVzb2x2ZVRhc2tJbnRlcm5hbChyZXNvbHZlZFRhc2tEVE86IHRhc2tzLklUYXNrRFRPKTogUHJvbWlzZTx0YXNrcy5JVGFza0RUTyB8IHVuZGVmaW5lZD47XG5cblx0cHVibGljIGFzeW5jICRyZXNvbHZlVGFzayhoYW5kbGU6IG51bWJlciwgdGFza0RUTzogdGFza3MuSVRhc2tEVE8pOiBQcm9taXNlPHRhc2tzLklUYXNrRFRPIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IHRoaXMuX2hhbmRsZXJzLmdldChoYW5kbGUpO1xuXHRcdGlmICghaGFuZGxlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbm8gaGFuZGxlciBmb3VuZCcpKTtcblx0XHR9XG5cblx0XHRpZiAodGFza0RUTy5kZWZpbml0aW9uLnR5cGUgIT09IGhhbmRsZXIudHlwZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkOiBUYXNrIG9mIHR5cGUgWyR7dGFza0RUTy5kZWZpbml0aW9uLnR5cGV9XSBjYW5ub3QgYmUgcmVzb2x2ZWQgYnkgcHJvdmlkZXIgb2YgdHlwZSBbJHtoYW5kbGVyLnR5cGV9XS5gKTtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrID0gYXdhaXQgVGFza0RUTy50byh0YXNrRFRPLCB0aGlzLl93b3Jrc3BhY2VQcm92aWRlciwgdGhpcy5fcHJvdmlkZWRDdXN0b21FeGVjdXRpb25zMik7XG5cdFx0aWYgKCF0YXNrKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQ6IFRhc2sgY2Fubm90IGJlIHJlc29sdmVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc29sdmVkVGFzayA9IGF3YWl0IGhhbmRsZXIucHJvdmlkZXIucmVzb2x2ZVRhc2sodGFzaywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFyZXNvbHZlZFRhc2spIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNoZWNrRGVwcmVjYXRpb24ocmVzb2x2ZWRUYXNrLCBoYW5kbGVyKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkVGFza0RUTzogdGFza3MuSVRhc2tEVE8gfCB1bmRlZmluZWQgPSBUYXNrRFRPLmZyb20ocmVzb2x2ZWRUYXNrLCBoYW5kbGVyLmV4dGVuc2lvbik7XG5cdFx0aWYgKCFyZXNvbHZlZFRhc2tEVE8pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZDogVGFzayBjYW5ub3QgYmUgcmVzb2x2ZWQuJyk7XG5cdFx0fVxuXG5cdFx0aWYgKHJlc29sdmVkVGFzay5kZWZpbml0aW9uICE9PSB0YXNrLmRlZmluaXRpb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZDogVGhlIHJlc29sdmVkIHRhc2sgZGVmaW5pdGlvbiBtdXN0IGJlIHRoZSBzYW1lIG9iamVjdCBhcyB0aGUgb3JpZ2luYWwgdGFzayBkZWZpbml0aW9uLiBUaGUgdGFzayBkZWZpbml0aW9uIGNhbm5vdCBiZSBjaGFuZ2VkLicpO1xuXHRcdH1cblxuXHRcdGlmIChDdXN0b21FeGVjdXRpb25EVE8uaXMocmVzb2x2ZWRUYXNrRFRPLmV4ZWN1dGlvbikpIHtcblx0XHRcdGF3YWl0IHRoaXMuYWRkQ3VzdG9tRXhlY3V0aW9uKHJlc29sdmVkVGFza0RUTywgcmVzb2x2ZWRUYXNrLCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5yZXNvbHZlVGFza0ludGVybmFsKHJlc29sdmVkVGFza0RUTyk7XG5cdH1cblxuXHRwdWJsaWMgYWJzdHJhY3QgJHJlc29sdmVWYXJpYWJsZXModXJpQ29tcG9uZW50czogVXJpQ29tcG9uZW50cywgdG9SZXNvbHZlOiB7IHByb2Nlc3M/OiB7IG5hbWU6IHN0cmluZzsgY3dkPzogc3RyaW5nOyBwYXRoPzogc3RyaW5nIH07IHZhcmlhYmxlczogc3RyaW5nW10gfSk6IFByb21pc2U8eyBwcm9jZXNzPzogc3RyaW5nOyB2YXJpYWJsZXM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gfT47XG5cblx0cHJpdmF0ZSBuZXh0SGFuZGxlKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2hhbmRsZUNvdW50ZXIrKztcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBhZGRDdXN0b21FeGVjdXRpb24odGFza0RUTzogdGFza3MuSVRhc2tEVE8sIHRhc2s6IHZzY29kZS5UYXNrLCBpc1Byb3ZpZGVkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdGFza0lkID0gYXdhaXQgdGhpcy5fcHJveHkuJGNyZWF0ZVRhc2tJZCh0YXNrRFRPKTtcblx0XHRpZiAoIWlzUHJvdmlkZWQgJiYgIXRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIuaGFzKHRhc2tJZCkpIHtcblx0XHRcdHRoaXMuX25vdFByb3ZpZGVkQ3VzdG9tRXhlY3V0aW9ucy5hZGQodGFza0lkKTtcblx0XHRcdC8vIEFsc28gYWRkIHRvIGFjdGl2ZSBleGVjdXRpb25zIHdoZW4gbm90IGNvbWluZyBmcm9tIGEgcHJvdmlkZXIgdG8gcHJldmVudCB0aW1pbmcgaXNzdWUuXG5cdFx0XHR0aGlzLl9hY3RpdmVDdXN0b21FeGVjdXRpb25zMi5zZXQodGFza0lkLCA8dHlwZXMuQ3VzdG9tRXhlY3V0aW9uPnRhc2suZXhlY3V0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlkZWRDdXN0b21FeGVjdXRpb25zMi5zZXQodGFza0lkLCA8dHlwZXMuQ3VzdG9tRXhlY3V0aW9uPnRhc2suZXhlY3V0aW9uKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBnZXRUYXNrRXhlY3V0aW9uKGV4ZWN1dGlvbjogdGFza3MuSVRhc2tFeGVjdXRpb25EVE8gfCBzdHJpbmcsIHRhc2s/OiB2c2NvZGUuVGFzayk6IFByb21pc2U8VGFza0V4ZWN1dGlvbkltcGw+IHtcblx0XHRpZiAodHlwZW9mIGV4ZWN1dGlvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IHRhc2tFeGVjdXRpb24gPSB0aGlzLl90YXNrRXhlY3V0aW9uUHJvbWlzZXMuZ2V0KGV4ZWN1dGlvbik7XG5cdFx0XHRpZiAoIXRhc2tFeGVjdXRpb24pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoJ1VuZXhwZWN0ZWQ6IFRoZSBzcGVjaWZpZWQgdGFzayBpcyBtaXNzaW5nIGFuIGV4ZWN1dGlvbicpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRhc2tFeGVjdXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBQcm9taXNlPFRhc2tFeGVjdXRpb25JbXBsPiB8IHVuZGVmaW5lZCA9IHRoaXMuX3Rhc2tFeGVjdXRpb25Qcm9taXNlcy5nZXQoZXhlY3V0aW9uLmlkKTtcblx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdGxldCBleGVjdXRpb25Qcm9taXNlOiBQcm9taXNlPFRhc2tFeGVjdXRpb25JbXBsPjtcblx0XHRpZiAoIXRhc2spIHtcblx0XHRcdGV4ZWN1dGlvblByb21pc2UgPSBUYXNrRFRPLnRvKGV4ZWN1dGlvbi50YXNrLCB0aGlzLl93b3Jrc3BhY2VQcm92aWRlciwgdGhpcy5fcHJvdmlkZWRDdXN0b21FeGVjdXRpb25zMikudGhlbih0ID0+IHtcblx0XHRcdFx0aWYgKCF0KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoJ1VuZXhwZWN0ZWQ6IFRhc2sgZG9lcyBub3QgZXhpc3QuJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBUYXNrRXhlY3V0aW9uSW1wbCh0aGlzLCBleGVjdXRpb24uaWQsIHQpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGV4ZWN1dGlvblByb21pc2UgPSBQcm9taXNlLnJlc29sdmUobmV3IFRhc2tFeGVjdXRpb25JbXBsKHRoaXMsIGV4ZWN1dGlvbi5pZCwgdGFzaykpO1xuXHRcdH1cblx0XHR0aGlzLl90YXNrRXhlY3V0aW9uUHJvbWlzZXMuc2V0KGV4ZWN1dGlvbi5pZCwgZXhlY3V0aW9uUHJvbWlzZSk7XG5cdFx0cmV0dXJuIGV4ZWN1dGlvblByb21pc2UudGhlbih0YXNrRXhlY3V0aW9uID0+IHtcblx0XHRcdHRoaXMuX3Rhc2tFeGVjdXRpb25zLnNldChleGVjdXRpb24uaWQsIHRhc2tFeGVjdXRpb24pO1xuXHRcdFx0cmV0dXJuIHRhc2tFeGVjdXRpb247XG5cdFx0fSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY2hlY2tEZXByZWNhdGlvbih0YXNrOiB2c2NvZGUuVGFzaywgaGFuZGxlcjogSGFuZGxlckRhdGEpIHtcblx0XHRjb25zdCB0VGFzayA9ICh0YXNrIGFzIHR5cGVzLlRhc2spO1xuXHRcdGlmICh0VGFzay5fZGVwcmVjYXRlZCkge1xuXHRcdFx0dGhpcy5fZGVwcmVjYXRpb25TZXJ2aWNlLnJlcG9ydCgnVGFzay5jb25zdHJ1Y3RvcicsIGhhbmRsZXIuZXh0ZW5zaW9uLCAnVXNlIHRoZSBUYXNrIGNvbnN0cnVjdG9yIHRoYXQgdGFrZXMgYSBgc2NvcGVgIGluc3RlYWQuJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjdXN0b21FeGVjdXRpb25Db21wbGV0ZShleGVjdXRpb246IHRhc2tzLklUYXNrRXhlY3V0aW9uRFRPKTogdm9pZCB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uQ2FsbGJhY2syOiB2c2NvZGUuQ3VzdG9tRXhlY3V0aW9uIHwgdW5kZWZpbmVkID0gdGhpcy5fYWN0aXZlQ3VzdG9tRXhlY3V0aW9uczIuZ2V0KGV4ZWN1dGlvbi5pZCk7XG5cdFx0aWYgKGV4dGVuc2lvbkNhbGxiYWNrMikge1xuXHRcdFx0dGhpcy5fYWN0aXZlQ3VzdG9tRXhlY3V0aW9uczIuZGVsZXRlKGV4ZWN1dGlvbi5pZCk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVjaG5pY2FsbHkgd2UgZG9uJ3QgcmVhbGx5IG5lZWQgdG8gZG8gdGhpcywgaG93ZXZlciwgaWYgYW4gZXh0ZW5zaW9uXG5cdFx0Ly8gaXMgZXhlY3V0aW5nIGEgdGFzayB0aHJvdWdoIFwiZXhlY3V0ZVRhc2tcIiBvdmVyIGFuZCBvdmVyIGFnYWluXG5cdFx0Ly8gd2l0aCBkaWZmZXJlbnQgcHJvcGVydGllcyBpbiB0aGUgdGFzayBkZWZpbml0aW9uLCB0aGVuIHRoZSBtYXAgb2YgZXhlY3V0aW9uc1xuXHRcdC8vIGNvdWxkIGdyb3cgaW5kZWZpbml0ZWx5LCBzb21ldGhpbmcgd2UgZG9uJ3Qgd2FudC5cblx0XHRpZiAodGhpcy5fbm90UHJvdmlkZWRDdXN0b21FeGVjdXRpb25zLmhhcyhleGVjdXRpb24uaWQpICYmICh0aGlzLl9sYXN0U3RhcnRlZFRhc2sgIT09IGV4ZWN1dGlvbi5pZCkpIHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVkQ3VzdG9tRXhlY3V0aW9uczIuZGVsZXRlKGV4ZWN1dGlvbi5pZCk7XG5cdFx0XHR0aGlzLl9ub3RQcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMuZGVsZXRlKGV4ZWN1dGlvbi5pZCk7XG5cdFx0fVxuXHRcdGNvbnN0IGl0ZXJhdG9yID0gdGhpcy5fbm90UHJvdmlkZWRDdXN0b21FeGVjdXRpb25zLnZhbHVlcygpO1xuXHRcdGxldCBpdGVyYXRvclJlc3VsdCA9IGl0ZXJhdG9yLm5leHQoKTtcblx0XHR3aGlsZSAoIWl0ZXJhdG9yUmVzdWx0LmRvbmUpIHtcblx0XHRcdGlmICghdGhpcy5fYWN0aXZlQ3VzdG9tRXhlY3V0aW9uczIuaGFzKGl0ZXJhdG9yUmVzdWx0LnZhbHVlKSAmJiAodGhpcy5fbGFzdFN0YXJ0ZWRUYXNrICE9PSBpdGVyYXRvclJlc3VsdC52YWx1ZSkpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZWRDdXN0b21FeGVjdXRpb25zMi5kZWxldGUoaXRlcmF0b3JSZXN1bHQudmFsdWUpO1xuXHRcdFx0XHR0aGlzLl9ub3RQcm92aWRlZEN1c3RvbUV4ZWN1dGlvbnMuZGVsZXRlKGl0ZXJhdG9yUmVzdWx0LnZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGl0ZXJhdG9yUmVzdWx0ID0gaXRlcmF0b3IubmV4dCgpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhYnN0cmFjdCAkanNvblRhc2tzU3VwcG9ydGVkKCk6IFByb21pc2U8Ym9vbGVhbj47XG5cblx0cHVibGljIGFic3RyYWN0ICRmaW5kRXhlY3V0YWJsZShjb21tYW5kOiBzdHJpbmcsIGN3ZD86IHN0cmluZyB8IHVuZGVmaW5lZCwgcGF0aHM/OiBzdHJpbmdbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtlckV4dEhvc3RUYXNrIGV4dGVuZHMgRXh0SG9zdFRhc2tCYXNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRIb3N0UnBjU2VydmljZSBleHRIb3N0UnBjOiBJRXh0SG9zdFJwY1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIGluaXREYXRhOiBJRXh0SG9zdEluaXREYXRhU2VydmljZSxcblx0XHRASUV4dEhvc3RXb3Jrc3BhY2Ugd29ya3NwYWNlU2VydmljZTogSUV4dEhvc3RXb3Jrc3BhY2UsXG5cdFx0QElFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyBlZGl0b3JTZXJ2aWNlOiBJRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsXG5cdFx0QElFeHRIb3N0Q29uZmlndXJhdGlvbiBjb25maWd1cmF0aW9uU2VydmljZTogSUV4dEhvc3RDb25maWd1cmF0aW9uLFxuXHRcdEBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSBleHRIb3N0VGVybWluYWxTZXJ2aWNlOiBJRXh0SG9zdFRlcm1pbmFsU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRIb3N0QXBpRGVwcmVjYXRpb25TZXJ2aWNlIGRlcHJlY2F0aW9uU2VydmljZTogSUV4dEhvc3RBcGlEZXByZWNhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZXh0SG9zdFJwYywgaW5pdERhdGEsIHdvcmtzcGFjZVNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBleHRIb3N0VGVybWluYWxTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBkZXByZWNhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMucmVnaXN0ZXJUYXNrU3lzdGVtKFNjaGVtYXMudnNjb2RlUmVtb3RlLCB7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlUmVtb3RlLFxuXHRcdFx0YXV0aG9yaXR5OiAnJyxcblx0XHRcdHBsYXRmb3JtOiBQbGF0Zm9ybS5QbGF0Zm9ybVRvU3RyaW5nKFBsYXRmb3JtLlBsYXRmb3JtLldlYilcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBleGVjdXRlVGFzayhleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgdGFzazogdnNjb2RlLlRhc2spOiBQcm9taXNlPHZzY29kZS5UYXNrRXhlY3V0aW9uPiB7XG5cdFx0aWYgKCF0YXNrLmV4ZWN1dGlvbikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdUYXNrcyB0byBleGVjdXRlIG11c3QgaW5jbHVkZSBhbiBleGVjdXRpb24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBkdG8gPSBUYXNrRFRPLmZyb20odGFzaywgZXh0ZW5zaW9uKTtcblx0XHRpZiAoZHRvID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGFzayBpcyBub3QgdmFsaWQnKTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGlzIHRhc2sgaXMgYSBjdXN0b20gZXhlY3V0aW9uLCB0aGVuIHdlIG5lZWQgdG8gc2F2ZSBpdCBhd2F5XG5cdFx0Ly8gaW4gdGhlIHByb3ZpZGVkIGN1c3RvbSBleGVjdXRpb24gbWFwIHRoYXQgaXMgY2xlYW5lZCB1cCBhZnRlciB0aGVcblx0XHQvLyB0YXNrIGlzIGV4ZWN1dGVkLlxuXHRcdGlmIChDdXN0b21FeGVjdXRpb25EVE8uaXMoZHRvLmV4ZWN1dGlvbikpIHtcblx0XHRcdGF3YWl0IHRoaXMuYWRkQ3VzdG9tRXhlY3V0aW9uKGR0bywgdGFzaywgZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgTm90U3VwcG9ydGVkRXJyb3IoKTtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgZ2V0IHRoZSB0YXNrIGV4ZWN1dGlvbiBmaXJzdCB0byBwcmV2ZW50IHRpbWluZyBpc3N1ZXMgd2hlbiByZXRyaWV2aW5nIGl0IGxhdGVyXG5cdFx0Y29uc3QgZXhlY3V0aW9uID0gYXdhaXQgdGhpcy5nZXRUYXNrRXhlY3V0aW9uKGF3YWl0IHRoaXMuX3Byb3h5LiRnZXRUYXNrRXhlY3V0aW9uKGR0byksIHRhc2spO1xuXHRcdHRoaXMuX3Byb3h5LiRleGVjdXRlVGFzayhkdG8pLmNhdGNoKGVycm9yID0+IHsgdGhyb3cgbmV3IEVycm9yKGVycm9yKTsgfSk7XG5cdFx0cmV0dXJuIGV4ZWN1dGlvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBwcm92aWRlVGFza3NJbnRlcm5hbCh2YWxpZFR5cGVzOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSwgdGFza0lkUHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSwgaGFuZGxlcjogSGFuZGxlckRhdGEsIHZhbHVlOiB2c2NvZGUuVGFza1tdIHwgbnVsbCB8IHVuZGVmaW5lZCk6IHsgdGFza3M6IHRhc2tzLklUYXNrRFRPW107IGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0ge1xuXHRcdGNvbnN0IHRhc2tEVE9zOiB0YXNrcy5JVGFza0RUT1tdID0gW107XG5cdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdmFsdWUpIHtcblx0XHRcdFx0dGhpcy5jaGVja0RlcHJlY2F0aW9uKHRhc2ssIGhhbmRsZXIpO1xuXHRcdFx0XHRpZiAoIXRhc2suZGVmaW5pdGlvbiB8fCAhdmFsaWRUeXBlc1t0YXNrLmRlZmluaXRpb24udHlwZV0pIHtcblx0XHRcdFx0XHRjb25zdCBzb3VyY2UgPSB0YXNrLnNvdXJjZSA/IHRhc2suc291cmNlIDogJ05vIHRhc2sgc291cmNlJztcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFRoZSB0YXNrIFske3NvdXJjZX0sICR7dGFzay5uYW1lfV0gdXNlcyBhbiB1bmRlZmluZWQgdGFzayB0eXBlLiBUaGUgdGFzayB3aWxsIGJlIGlnbm9yZWQgaW4gdGhlIGZ1dHVyZS5gKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHRhc2tEVE86IHRhc2tzLklUYXNrRFRPIHwgdW5kZWZpbmVkID0gVGFza0RUTy5mcm9tKHRhc2ssIGhhbmRsZXIuZXh0ZW5zaW9uKTtcblx0XHRcdFx0aWYgKHRhc2tEVE8gJiYgQ3VzdG9tRXhlY3V0aW9uRFRPLmlzKHRhc2tEVE8uZXhlY3V0aW9uKSkge1xuXHRcdFx0XHRcdHRhc2tEVE9zLnB1c2godGFza0RUTyk7XG5cdFx0XHRcdFx0Ly8gVGhlIElEIGlzIGNhbGN1bGF0ZWQgb24gdGhlIG1haW4gdGhyZWFkIHRhc2sgc2lkZSwgc28sIGxldCdzIGNhbGwgaW50byBpdCBoZXJlLlxuXHRcdFx0XHRcdC8vIFdlIG5lZWQgdGhlIHRhc2sgaWQncyBwcmUtY29tcHV0ZWQgZm9yIGN1c3RvbSB0YXNrIGV4ZWN1dGlvbnMgYmVjYXVzZSB3aGVuIE9uRGlkU3RhcnRUYXNrXG5cdFx0XHRcdFx0Ly8gaXMgaW52b2tlZCwgd2UgaGF2ZSB0byBiZSBhYmxlIHRvIG1hcCBpdCBiYWNrIHRvIG91ciBkYXRhLlxuXHRcdFx0XHRcdHRhc2tJZFByb21pc2VzLnB1c2godGhpcy5hZGRDdXN0b21FeGVjdXRpb24odGFza0RUTywgdGFzaywgdHJ1ZSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignT25seSBjdXN0b20gZXhlY3V0aW9uIHRhc2tzIHN1cHBvcnRlZC4nKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dGFza3M6IHRhc2tEVE9zLFxuXHRcdFx0ZXh0ZW5zaW9uOiBoYW5kbGVyLmV4dGVuc2lvblxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgcmVzb2x2ZVRhc2tJbnRlcm5hbChyZXNvbHZlZFRhc2tEVE86IHRhc2tzLklUYXNrRFRPKTogUHJvbWlzZTx0YXNrcy5JVGFza0RUTyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChDdXN0b21FeGVjdXRpb25EVE8uaXMocmVzb2x2ZWRUYXNrRFRPLmV4ZWN1dGlvbikpIHtcblx0XHRcdHJldHVybiByZXNvbHZlZFRhc2tEVE87XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignT25seSBjdXN0b20gZXhlY3V0aW9uIHRhc2tzIHN1cHBvcnRlZC4nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkcmVzb2x2ZVZhcmlhYmxlcyh1cmlDb21wb25lbnRzOiBVcmlDb21wb25lbnRzLCB0b1Jlc29sdmU6IHsgcHJvY2Vzcz86IHsgbmFtZTogc3RyaW5nOyBjd2Q/OiBzdHJpbmc7IHBhdGg/OiBzdHJpbmcgfTsgdmFyaWFibGVzOiBzdHJpbmdbXSB9KTogUHJvbWlzZTx7IHByb2Nlc3M/OiBzdHJpbmc7IHZhcmlhYmxlczogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfSB9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0cHJvY2VzczogPHVua25vd24+dW5kZWZpbmVkIGFzIHN0cmluZyxcblx0XHRcdHZhcmlhYmxlczogT2JqZWN0LmNyZWF0ZShudWxsKVxuXHRcdH07XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkanNvblRhc2tzU3VwcG9ydGVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyAkZmluZEV4ZWN1dGFibGUoY29tbWFuZDogc3RyaW5nLCBjd2Q/OiBzdHJpbmcgfCB1bmRlZmluZWQsIHBhdGhzPzogc3RyaW5nW10gfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IElFeHRIb3N0VGFzayA9IGNyZWF0ZURlY29yYXRvcjxJRXh0SG9zdFRhc2s+KCdJRXh0SG9zdFRhc2snKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFnQixlQUFlO0FBRS9CLFNBQVMsbUJBQTBEO0FBQ25FLFlBQVksV0FBVztBQUN2QixTQUFvQyx5QkFBeUI7QUFHN0QsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFlBQVksY0FBYztBQUMxQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDRCQUE0QjtBQUNyQyxT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QUFBLE1BQ04sT0FBTztBQUFBLE1BQ1AsV0FBVyxRQUFRO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFnQixvQkFBb0IsaUJBQXNFO0FBQ3pHLFFBQUksbUJBQW1CLEdBQUcsZ0JBQWdCLFNBQVMsR0FBRztBQUNyRCxhQUFPO0FBQUEsSUFDUixPQUFPO0FBQ04sV0FBSyxZQUFZLEtBQUssd0NBQXdDO0FBQUEsSUFDL0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYSxrQkFBa0IsZUFBOEIsV0FBa0s7QUFDOU4sVUFBTSxTQUFTO0FBQUEsTUFDZCxTQUFrQjtBQUFBLE1BQ2xCLFdBQVcsdUJBQU8sT0FBTyxJQUFJO0FBQUEsSUFDOUI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYSxzQkFBd0M7QUFDcEQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWEsZ0JBQWdCLFNBQWlCLEtBQTBCLE9BQTJEO0FBQ2xJLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFoR2Esb0JBQU47QUFBQSxFQUVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVFU7QUFrR04sTUFBTSxlQUFlLGdCQUE4QixjQUFjOyIsCiAgIm5hbWVzIjogWyJUYXNrRGVmaW5pdGlvbkRUTyIsICJUYXNrUHJlc2VudGF0aW9uT3B0aW9uc0RUTyIsICJQcm9jZXNzRXhlY3V0aW9uT3B0aW9uc0RUTyIsICJQcm9jZXNzRXhlY3V0aW9uRFRPIiwgIlNoZWxsRXhlY3V0aW9uT3B0aW9uc0RUTyIsICJTaGVsbEV4ZWN1dGlvbkRUTyIsICJDdXN0b21FeGVjdXRpb25EVE8iLCAiVGFza0hhbmRsZURUTyIsICJUYXNrR3JvdXBEVE8iLCAiVGFza0RUTyIsICJ0YXNrcyIsICJUYXNrRmlsdGVyRFRPIl0KfQo=
