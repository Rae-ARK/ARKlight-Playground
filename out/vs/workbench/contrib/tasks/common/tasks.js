import * as nls from "../../../../nls.js";
import * as Types from "../../../../base/common/types.js";
import * as resources from "../../../../base/common/resources.js";
import * as Objects from "../../../../base/common/objects.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { TaskDefinitionRegistry } from "./taskDefinitionRegistry.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
const USER_TASKS_GROUP_KEY = "settings";
const TASK_RUNNING_STATE = new RawContextKey("taskRunning", false, nls.localize("tasks.taskRunningContext", "Whether a task is currently running."));
const TASK_TERMINAL_ACTIVE = new RawContextKey("taskTerminalActive", false, nls.localize("taskTerminalActive", "Whether the active terminal is a task terminal."));
const TASKS_CATEGORY = nls.localize2("tasksCategory", "Tasks");
var ShellQuoting = /* @__PURE__ */ ((ShellQuoting2) => {
  ShellQuoting2[ShellQuoting2["Escape"] = 1] = "Escape";
  ShellQuoting2[ShellQuoting2["Strong"] = 2] = "Strong";
  ShellQuoting2[ShellQuoting2["Weak"] = 3] = "Weak";
  return ShellQuoting2;
})(ShellQuoting || {});
const CUSTOMIZED_TASK_TYPE = "$customized";
((ShellQuoting2) => {
  function from(value) {
    if (!value) {
      return 2 /* Strong */;
    }
    switch (value.toLowerCase()) {
      case "escape":
        return 1 /* Escape */;
      case "strong":
        return 2 /* Strong */;
      case "weak":
        return 3 /* Weak */;
      default:
        return 2 /* Strong */;
    }
  }
  ShellQuoting2.from = from;
})(ShellQuoting || (ShellQuoting = {}));
var CommandOptions;
((CommandOptions2) => {
  CommandOptions2.defaults = { cwd: "${workspaceFolder}" };
})(CommandOptions || (CommandOptions = {}));
var RevealKind = /* @__PURE__ */ ((RevealKind2) => {
  RevealKind2[RevealKind2["Always"] = 1] = "Always";
  RevealKind2[RevealKind2["Silent"] = 2] = "Silent";
  RevealKind2[RevealKind2["Never"] = 3] = "Never";
  return RevealKind2;
})(RevealKind || {});
((RevealKind2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "always":
        return 1 /* Always */;
      case "silent":
        return 2 /* Silent */;
      case "never":
        return 3 /* Never */;
      default:
        return 1 /* Always */;
    }
  }
  RevealKind2.fromString = fromString;
})(RevealKind || (RevealKind = {}));
var RevealProblemKind = /* @__PURE__ */ ((RevealProblemKind2) => {
  RevealProblemKind2[RevealProblemKind2["Never"] = 1] = "Never";
  RevealProblemKind2[RevealProblemKind2["OnProblem"] = 2] = "OnProblem";
  RevealProblemKind2[RevealProblemKind2["Always"] = 3] = "Always";
  return RevealProblemKind2;
})(RevealProblemKind || {});
((RevealProblemKind2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "always":
        return 3 /* Always */;
      case "never":
        return 1 /* Never */;
      case "onproblem":
        return 2 /* OnProblem */;
      default:
        return 2 /* OnProblem */;
    }
  }
  RevealProblemKind2.fromString = fromString;
})(RevealProblemKind || (RevealProblemKind = {}));
var PanelKind = /* @__PURE__ */ ((PanelKind2) => {
  PanelKind2[PanelKind2["Shared"] = 1] = "Shared";
  PanelKind2[PanelKind2["Dedicated"] = 2] = "Dedicated";
  PanelKind2[PanelKind2["New"] = 3] = "New";
  return PanelKind2;
})(PanelKind || {});
((PanelKind2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "shared":
        return 1 /* Shared */;
      case "dedicated":
        return 2 /* Dedicated */;
      case "new":
        return 3 /* New */;
      default:
        return 1 /* Shared */;
    }
  }
  PanelKind2.fromString = fromString;
})(PanelKind || (PanelKind = {}));
var PresentationOptions;
((PresentationOptions2) => {
  PresentationOptions2.defaults = {
    echo: true,
    reveal: 1 /* Always */,
    revealProblems: 1 /* Never */,
    focus: false,
    panel: 1 /* Shared */,
    showReuseMessage: true,
    clear: false,
    preserveTerminalName: false
  };
})(PresentationOptions || (PresentationOptions = {}));
var RuntimeType = /* @__PURE__ */ ((RuntimeType2) => {
  RuntimeType2[RuntimeType2["Shell"] = 1] = "Shell";
  RuntimeType2[RuntimeType2["Process"] = 2] = "Process";
  RuntimeType2[RuntimeType2["CustomExecution"] = 3] = "CustomExecution";
  return RuntimeType2;
})(RuntimeType || {});
((RuntimeType2) => {
  function fromString(value) {
    switch (value.toLowerCase()) {
      case "shell":
        return 1 /* Shell */;
      case "process":
        return 2 /* Process */;
      case "customExecution":
        return 3 /* CustomExecution */;
      default:
        return 2 /* Process */;
    }
  }
  RuntimeType2.fromString = fromString;
  function toString(value) {
    switch (value) {
      case 1 /* Shell */:
        return "shell";
      case 2 /* Process */:
        return "process";
      case 3 /* CustomExecution */:
        return "customExecution";
      default:
        return "process";
    }
  }
  RuntimeType2.toString = toString;
})(RuntimeType || (RuntimeType = {}));
var CommandString;
((CommandString2) => {
  function value(value2) {
    if (Types.isString(value2)) {
      return value2;
    } else {
      return value2.value;
    }
  }
  CommandString2.value = value;
})(CommandString || (CommandString = {}));
var TaskGroup;
((TaskGroup2) => {
  TaskGroup2.Clean = { _id: "clean", isDefault: false };
  TaskGroup2.Build = { _id: "build", isDefault: false };
  TaskGroup2.Rebuild = { _id: "rebuild", isDefault: false };
  TaskGroup2.Test = { _id: "test", isDefault: false };
  function is(value) {
    return value === TaskGroup2.Clean._id || value === TaskGroup2.Build._id || value === TaskGroup2.Rebuild._id || value === TaskGroup2.Test._id;
  }
  TaskGroup2.is = is;
  function from(value) {
    if (value === void 0) {
      return void 0;
    } else if (Types.isString(value)) {
      if (is(value)) {
        return { _id: value, isDefault: false };
      }
      return void 0;
    } else {
      return value;
    }
  }
  TaskGroup2.from = from;
})(TaskGroup || (TaskGroup = {}));
var TaskScope = /* @__PURE__ */ ((TaskScope2) => {
  TaskScope2[TaskScope2["Global"] = 1] = "Global";
  TaskScope2[TaskScope2["Workspace"] = 2] = "Workspace";
  TaskScope2[TaskScope2["Folder"] = 3] = "Folder";
  return TaskScope2;
})(TaskScope || {});
var TaskSourceKind;
((TaskSourceKind2) => {
  TaskSourceKind2.Workspace = "workspace";
  TaskSourceKind2.Extension = "extension";
  TaskSourceKind2.InMemory = "inMemory";
  TaskSourceKind2.WorkspaceFile = "workspaceFile";
  TaskSourceKind2.User = "user";
  function toConfigurationTarget(kind) {
    switch (kind) {
      case TaskSourceKind2.User:
        return ConfigurationTarget.USER;
      case TaskSourceKind2.WorkspaceFile:
        return ConfigurationTarget.WORKSPACE;
      default:
        return ConfigurationTarget.WORKSPACE_FOLDER;
    }
  }
  TaskSourceKind2.toConfigurationTarget = toConfigurationTarget;
})(TaskSourceKind || (TaskSourceKind = {}));
var DependsOrder = /* @__PURE__ */ ((DependsOrder2) => {
  DependsOrder2["parallel"] = "parallel";
  DependsOrder2["sequence"] = "sequence";
  return DependsOrder2;
})(DependsOrder || {});
var RunOnOptions = /* @__PURE__ */ ((RunOnOptions2) => {
  RunOnOptions2[RunOnOptions2["default"] = 1] = "default";
  RunOnOptions2[RunOnOptions2["folderOpen"] = 2] = "folderOpen";
  RunOnOptions2[RunOnOptions2["worktreeCreated"] = 3] = "worktreeCreated";
  return RunOnOptions2;
})(RunOnOptions || {});
var InstancePolicy = /* @__PURE__ */ ((InstancePolicy2) => {
  InstancePolicy2["terminateNewest"] = "terminateNewest";
  InstancePolicy2["terminateOldest"] = "terminateOldest";
  InstancePolicy2["prompt"] = "prompt";
  InstancePolicy2["warn"] = "warn";
  InstancePolicy2["silent"] = "silent";
  return InstancePolicy2;
})(InstancePolicy || {});
var RunOptions;
((RunOptions2) => {
  RunOptions2.defaults = { reevaluateOnRerun: true, runOn: 1 /* default */, instanceLimit: 1, instancePolicy: "prompt" /* prompt */ };
})(RunOptions || (RunOptions = {}));
class CommonTask {
  constructor(id, label, type, runOptions, configurationProperties, source) {
    /**
     * The cached label.
     */
    this._label = "";
    this._id = id;
    if (label) {
      this._label = label;
    }
    if (type) {
      this.type = type;
    }
    this.runOptions = runOptions;
    this.configurationProperties = configurationProperties;
    this._source = source;
  }
  getDefinition(useSource) {
    return void 0;
  }
  getMapKey() {
    return this._id;
  }
  getKey() {
    return void 0;
  }
  getCommonTaskId() {
    const key = { folder: this.getFolderId(), id: this._id };
    return JSON.stringify(key);
  }
  clone() {
    return this.fromObject(Object.assign({}, this));
  }
  getWorkspaceFolder() {
    return void 0;
  }
  getWorkspaceFileName() {
    return void 0;
  }
  getTelemetryKind() {
    return "unknown";
  }
  matches(key, compareId = false) {
    if (key === void 0) {
      return false;
    }
    if (Types.isString(key)) {
      return key === this._label || key === this.configurationProperties.identifier || compareId && key === this._id;
    }
    const identifier = this.getDefinition(true);
    return identifier !== void 0 && identifier._key === key._key;
  }
  getQualifiedLabel() {
    const workspaceFolder = this.getWorkspaceFolder();
    if (workspaceFolder) {
      return `${this._label} (${workspaceFolder.name})`;
    } else {
      return this._label;
    }
  }
  getTaskExecution() {
    const result = {
      id: this._id,
      task: this
    };
    return result;
  }
  addTaskLoadMessages(messages) {
    if (this._taskLoadMessages === void 0) {
      this._taskLoadMessages = [];
    }
    if (messages) {
      this._taskLoadMessages = this._taskLoadMessages.concat(messages);
    }
  }
  get taskLoadMessages() {
    return this._taskLoadMessages;
  }
}
class CustomTask extends CommonTask {
  constructor(id, source, label, type, command, hasDefinedMatchers, runOptions, configurationProperties) {
    super(id, label, void 0, runOptions, configurationProperties, source);
    /**
     * The command configuration
     */
    this.command = {};
    this._source = source;
    this.hasDefinedMatchers = hasDefinedMatchers;
    if (command) {
      this.command = command;
    }
  }
  clone() {
    return new CustomTask(this._id, this._source, this._label, this.type, this.command, this.hasDefinedMatchers, this.runOptions, this.configurationProperties);
  }
  customizes() {
    if (this._source && this._source.customizes) {
      return this._source.customizes;
    }
    return void 0;
  }
  getDefinition(useSource = false) {
    if (useSource && this._source.customizes !== void 0) {
      return this._source.customizes;
    } else {
      let type;
      const commandRuntime = this.command ? this.command.runtime : void 0;
      switch (commandRuntime) {
        case 1 /* Shell */:
          type = "shell";
          break;
        case 2 /* Process */:
          type = "process";
          break;
        case 3 /* CustomExecution */:
          type = "customExecution";
          break;
        case void 0:
          type = "$composite";
          break;
        default:
          throw new Error("Unexpected task runtime");
      }
      const result = {
        type,
        _key: this._id,
        id: this._id
      };
      return result;
    }
  }
  static is(value) {
    return value instanceof CustomTask;
  }
  getMapKey() {
    const workspaceFolder = this._source.config.workspaceFolder;
    return workspaceFolder ? `${workspaceFolder.uri.toString()}|${this._id}|${this.instance}` : `${this._id}|${this.instance}`;
  }
  getFolderId() {
    return this._source.kind === TaskSourceKind.User ? USER_TASKS_GROUP_KEY : this._source.config.workspaceFolder?.uri.toString();
  }
  getCommonTaskId() {
    return this._source.customizes ? super.getCommonTaskId() : this.getKey() ?? super.getCommonTaskId();
  }
  /**
   * @returns A key representing the task
   */
  getKey() {
    const workspaceFolder = this.getFolderId();
    if (!workspaceFolder) {
      return void 0;
    }
    let id = this.configurationProperties.identifier;
    if (this._source.kind !== TaskSourceKind.Workspace) {
      id += this._source.kind;
    }
    const key = { type: CUSTOMIZED_TASK_TYPE, folder: workspaceFolder, id };
    return JSON.stringify(key);
  }
  getWorkspaceFolder() {
    return this._source.config.workspaceFolder;
  }
  getWorkspaceFileName() {
    return this._source.config.workspace && this._source.config.workspace.configuration ? resources.basename(this._source.config.workspace.configuration) : void 0;
  }
  getTelemetryKind() {
    if (this._source.customizes) {
      return "workspace>extension";
    } else {
      return "workspace";
    }
  }
  fromObject(object) {
    const obj = object;
    return new CustomTask(obj._id, obj._source, obj._label, obj.type, obj.command, obj.hasDefinedMatchers, obj.runOptions, obj.configurationProperties);
  }
}
class ConfiguringTask extends CommonTask {
  constructor(id, source, label, type, configures, runOptions, configurationProperties) {
    super(id, label, type, runOptions, configurationProperties, source);
    this._source = source;
    this.configures = configures;
  }
  static is(value) {
    return value instanceof ConfiguringTask;
  }
  fromObject(object) {
    return object;
  }
  getDefinition() {
    return this.configures;
  }
  getWorkspaceFileName() {
    return this._source.config.workspace && this._source.config.workspace.configuration ? resources.basename(this._source.config.workspace.configuration) : void 0;
  }
  getWorkspaceFolder() {
    return this._source.config.workspaceFolder;
  }
  getFolderId() {
    return this._source.kind === TaskSourceKind.User ? USER_TASKS_GROUP_KEY : this._source.config.workspaceFolder?.uri.toString();
  }
  getKey() {
    const workspaceFolder = this.getFolderId();
    if (!workspaceFolder) {
      return void 0;
    }
    let id = this.configurationProperties.identifier;
    if (this._source.kind !== TaskSourceKind.Workspace) {
      id += this._source.kind;
    }
    const key = { type: CUSTOMIZED_TASK_TYPE, folder: workspaceFolder, id };
    return JSON.stringify(key);
  }
}
class ContributedTask extends CommonTask {
  constructor(id, source, label, type, defines, command, hasDefinedMatchers, runOptions, configurationProperties) {
    super(id, label, type, runOptions, configurationProperties, source);
    this.defines = defines;
    this.hasDefinedMatchers = hasDefinedMatchers;
    this.command = command;
    this.icon = configurationProperties.icon;
    this.hide = configurationProperties.hide;
  }
  clone() {
    return new ContributedTask(this._id, this._source, this._label, this.type, this.defines, this.command, this.hasDefinedMatchers, this.runOptions, this.configurationProperties);
  }
  getDefinition() {
    return this.defines;
  }
  static is(value) {
    return value instanceof ContributedTask;
  }
  getMapKey() {
    const workspaceFolder = this._source.workspaceFolder;
    return workspaceFolder ? `${this._source.scope.toString()}|${workspaceFolder.uri.toString()}|${this._id}|${this.instance}` : `${this._source.scope.toString()}|${this._id}|${this.instance}`;
  }
  getFolderId() {
    if (this._source.scope === 3 /* Folder */ && this._source.workspaceFolder) {
      return this._source.workspaceFolder.uri.toString();
    }
    return void 0;
  }
  getKey() {
    const key = { type: "contributed", scope: this._source.scope, id: this._id };
    key.folder = this.getFolderId();
    return JSON.stringify(key);
  }
  getWorkspaceFolder() {
    return this._source.workspaceFolder;
  }
  getTelemetryKind() {
    return "extension";
  }
  fromObject(object) {
    const obj = object;
    return new ContributedTask(obj._id, obj._source, obj._label, obj.type, obj.defines, obj.command, obj.hasDefinedMatchers, obj.runOptions, obj.configurationProperties);
  }
}
class InMemoryTask extends CommonTask {
  constructor(id, source, label, type, runOptions, configurationProperties) {
    super(id, label, type, runOptions, configurationProperties, source);
    this._source = source;
  }
  clone() {
    return new InMemoryTask(this._id, this._source, this._label, this.type, this.runOptions, this.configurationProperties);
  }
  static is(value) {
    return value instanceof InMemoryTask;
  }
  getTelemetryKind() {
    return "composite";
  }
  getMapKey() {
    return `${this._id}|${this.instance}`;
  }
  getFolderId() {
    return void 0;
  }
  fromObject(object) {
    const obj = object;
    return new InMemoryTask(obj._id, obj._source, obj._label, obj.type, obj.runOptions, obj.configurationProperties);
  }
}
var ExecutionEngine = /* @__PURE__ */ ((ExecutionEngine2) => {
  ExecutionEngine2[ExecutionEngine2["Process"] = 1] = "Process";
  ExecutionEngine2[ExecutionEngine2["Terminal"] = 2] = "Terminal";
  return ExecutionEngine2;
})(ExecutionEngine || {});
((ExecutionEngine2) => {
  ExecutionEngine2._default = 2 /* Terminal */;
})(ExecutionEngine || (ExecutionEngine = {}));
var JsonSchemaVersion = /* @__PURE__ */ ((JsonSchemaVersion2) => {
  JsonSchemaVersion2[JsonSchemaVersion2["V0_1_0"] = 1] = "V0_1_0";
  JsonSchemaVersion2[JsonSchemaVersion2["V2_0_0"] = 2] = "V2_0_0";
  return JsonSchemaVersion2;
})(JsonSchemaVersion || {});
class TaskSorter {
  constructor(workspaceFolders) {
    this._order = /* @__PURE__ */ new Map();
    for (let i = 0; i < workspaceFolders.length; i++) {
      this._order.set(workspaceFolders[i].uri.toString(), i);
    }
  }
  compare(a, b) {
    const aw = a.getWorkspaceFolder();
    const bw = b.getWorkspaceFolder();
    if (aw && bw) {
      let ai = this._order.get(aw.uri.toString());
      ai = ai === void 0 ? 0 : ai + 1;
      let bi = this._order.get(bw.uri.toString());
      bi = bi === void 0 ? 0 : bi + 1;
      if (ai === bi) {
        return a._label.localeCompare(b._label);
      } else {
        return ai - bi;
      }
    } else if (!aw && bw) {
      return -1;
    } else if (aw && !bw) {
      return 1;
    } else {
      return 0;
    }
  }
}
var TaskRunType = /* @__PURE__ */ ((TaskRunType2) => {
  TaskRunType2["SingleRun"] = "singleRun";
  TaskRunType2["Background"] = "background";
  return TaskRunType2;
})(TaskRunType || {});
var TaskEventKind = /* @__PURE__ */ ((TaskEventKind2) => {
  TaskEventKind2["Changed"] = "changed";
  TaskEventKind2["ProcessStarted"] = "processStarted";
  TaskEventKind2["ProcessEnded"] = "processEnded";
  TaskEventKind2["Terminated"] = "terminated";
  TaskEventKind2["Start"] = "start";
  TaskEventKind2["AcquiredInput"] = "acquiredInput";
  TaskEventKind2["DependsOnStarted"] = "dependsOnStarted";
  TaskEventKind2["Active"] = "active";
  TaskEventKind2["Inactive"] = "inactive";
  TaskEventKind2["End"] = "end";
  TaskEventKind2["ProblemMatcherStarted"] = "problemMatcherStarted";
  TaskEventKind2["ProblemMatcherEnded"] = "problemMatcherEnded";
  TaskEventKind2["ProblemMatcherFoundErrors"] = "problemMatcherFoundErrors";
  return TaskEventKind2;
})(TaskEventKind || {});
var TaskRunSource = /* @__PURE__ */ ((TaskRunSource2) => {
  TaskRunSource2[TaskRunSource2["System"] = 0] = "System";
  TaskRunSource2[TaskRunSource2["User"] = 1] = "User";
  TaskRunSource2[TaskRunSource2["FolderOpen"] = 2] = "FolderOpen";
  TaskRunSource2[TaskRunSource2["ConfigurationChange"] = 3] = "ConfigurationChange";
  TaskRunSource2[TaskRunSource2["Reconnect"] = 4] = "Reconnect";
  TaskRunSource2[TaskRunSource2["ChatAgent"] = 5] = "ChatAgent";
  return TaskRunSource2;
})(TaskRunSource || {});
var TaskEvent;
((TaskEvent2) => {
  function common(task) {
    return {
      taskId: task._id,
      taskName: task.configurationProperties.name,
      runType: task.configurationProperties.isBackground ? "background" /* Background */ : "singleRun" /* SingleRun */,
      group: task.configurationProperties.group,
      __task: task
    };
  }
  function start(task, terminalId, resolvedVariables) {
    return {
      ...common(task),
      kind: "start" /* Start */,
      terminalId,
      resolvedVariables
    };
  }
  TaskEvent2.start = start;
  function processStarted(task, terminalId, processId) {
    return {
      ...common(task),
      kind: "processStarted" /* ProcessStarted */,
      terminalId,
      processId
    };
  }
  TaskEvent2.processStarted = processStarted;
  function processEnded(task, terminalId, exitCode, durationMs) {
    return {
      ...common(task),
      kind: "processEnded" /* ProcessEnded */,
      terminalId,
      exitCode,
      durationMs
    };
  }
  TaskEvent2.processEnded = processEnded;
  function inactive(task, terminalId, durationMs) {
    return {
      ...common(task),
      kind: "inactive" /* Inactive */,
      terminalId,
      durationMs
    };
  }
  TaskEvent2.inactive = inactive;
  function terminated(task, terminalId, exitReason) {
    return {
      ...common(task),
      kind: "terminated" /* Terminated */,
      exitReason,
      terminalId
    };
  }
  TaskEvent2.terminated = terminated;
  function general(kind, task, terminalId) {
    return {
      ...common(task),
      kind,
      terminalId
    };
  }
  TaskEvent2.general = general;
  function problemMatcherEnded(task, hasErrors, terminalId) {
    return {
      ...common(task),
      kind: "problemMatcherEnded" /* ProblemMatcherEnded */,
      hasErrors
    };
  }
  TaskEvent2.problemMatcherEnded = problemMatcherEnded;
  function changed() {
    return { kind: "changed" /* Changed */ };
  }
  TaskEvent2.changed = changed;
})(TaskEvent || (TaskEvent = {}));
var KeyedTaskIdentifier;
((KeyedTaskIdentifier2) => {
  function sortedStringify(literal) {
    const keys = Object.keys(literal).sort();
    let result = "";
    for (const key of keys) {
      let stringified = literal[key];
      if (stringified instanceof Object) {
        stringified = sortedStringify(stringified);
      } else if (typeof stringified === "string") {
        stringified = stringified.replace(/,/g, ",,");
      }
      result += key + "," + stringified + ",";
    }
    return result;
  }
  function create(value) {
    const resultKey = sortedStringify(value);
    const result = { _key: resultKey, type: value.taskType };
    Object.assign(result, value);
    return result;
  }
  KeyedTaskIdentifier2.create = create;
})(KeyedTaskIdentifier || (KeyedTaskIdentifier = {}));
var TaskSettingId = /* @__PURE__ */ ((TaskSettingId2) => {
  TaskSettingId2["AutoDetect"] = "task.autoDetect";
  TaskSettingId2["SaveBeforeRun"] = "task.saveBeforeRun";
  TaskSettingId2["ShowDecorations"] = "task.showDecorations";
  TaskSettingId2["ProblemMatchersNeverPrompt"] = "task.problemMatchers.neverPrompt";
  TaskSettingId2["SlowProviderWarning"] = "task.slowProviderWarning";
  TaskSettingId2["QuickOpenHistory"] = "task.quickOpen.history";
  TaskSettingId2["QuickOpenDetail"] = "task.quickOpen.detail";
  TaskSettingId2["QuickOpenSkip"] = "task.quickOpen.skip";
  TaskSettingId2["QuickOpenShowAll"] = "task.quickOpen.showAll";
  TaskSettingId2["AllowAutomaticTasks"] = "task.allowAutomaticTasks";
  TaskSettingId2["Reconnection"] = "task.reconnection";
  TaskSettingId2["VerboseLogging"] = "task.verboseLogging";
  TaskSettingId2["NotifyWindowOnTaskCompletion"] = "task.notifyWindowOnTaskCompletion";
  return TaskSettingId2;
})(TaskSettingId || {});
var TasksSchemaProperties = /* @__PURE__ */ ((TasksSchemaProperties2) => {
  TasksSchemaProperties2["Tasks"] = "tasks";
  TasksSchemaProperties2["SuppressTaskName"] = "tasks.suppressTaskName";
  TasksSchemaProperties2["Windows"] = "tasks.windows";
  TasksSchemaProperties2["Osx"] = "tasks.osx";
  TasksSchemaProperties2["Linux"] = "tasks.linux";
  TasksSchemaProperties2["ShowOutput"] = "tasks.showOutput";
  TasksSchemaProperties2["IsShellCommand"] = "tasks.isShellCommand";
  TasksSchemaProperties2["ServiceTestSetting"] = "tasks.service.testSetting";
  return TasksSchemaProperties2;
})(TasksSchemaProperties || {});
var TaskDefinition;
((TaskDefinition2) => {
  function createTaskIdentifier(external, reporter) {
    const definition = TaskDefinitionRegistry.get(external.type);
    if (definition === void 0) {
      const copy = Objects.deepClone(external);
      delete copy._key;
      return KeyedTaskIdentifier.create(copy);
    }
    const literal = /* @__PURE__ */ Object.create(null);
    literal.type = definition.taskType;
    const required = /* @__PURE__ */ new Set();
    definition.required.forEach((element) => required.add(element));
    const properties = definition.properties;
    for (const property of Object.keys(properties)) {
      const value = external[property];
      if (value !== void 0 && value !== null) {
        literal[property] = value;
      } else if (required.has(property)) {
        const schema = properties[property];
        if (schema.default !== void 0) {
          literal[property] = Objects.deepClone(schema.default);
        } else {
          switch (schema.type) {
            case "boolean":
              literal[property] = false;
              break;
            case "number":
            case "integer":
              literal[property] = 0;
              break;
            case "string":
              literal[property] = "";
              break;
            default:
              reporter.error(nls.localize(
                "TaskDefinition.missingRequiredProperty",
                "Error: the task identifier '{0}' is missing the required property '{1}'. The task identifier will be ignored.",
                JSON.stringify(external, void 0, 0),
                property
              ));
              return void 0;
          }
        }
      }
    }
    return KeyedTaskIdentifier.create(literal);
  }
  TaskDefinition2.createTaskIdentifier = createTaskIdentifier;
})(TaskDefinition || (TaskDefinition = {}));
const rerunTaskIcon = registerIcon("rerun-task", Codicon.refresh, nls.localize("rerunTaskIcon", "View icon of the rerun task."));
const RerunForActiveTerminalCommandId = "workbench.action.tasks.rerunForActiveTerminal";
const RerunAllRunningTasksCommandId = "workbench.action.tasks.rerunAllRunningTasks";
export {
  CUSTOMIZED_TASK_TYPE,
  CommandOptions,
  CommandString,
  CommonTask,
  ConfiguringTask,
  ContributedTask,
  CustomTask,
  DependsOrder,
  ExecutionEngine,
  InMemoryTask,
  InstancePolicy,
  JsonSchemaVersion,
  KeyedTaskIdentifier,
  PanelKind,
  PresentationOptions,
  RerunAllRunningTasksCommandId,
  RerunForActiveTerminalCommandId,
  RevealKind,
  RevealProblemKind,
  RunOnOptions,
  RunOptions,
  RuntimeType,
  ShellQuoting,
  TASKS_CATEGORY,
  TASK_RUNNING_STATE,
  TASK_TERMINAL_ACTIVE,
  TaskDefinition,
  TaskEvent,
  TaskEventKind,
  TaskGroup,
  TaskRunSource,
  TaskRunType,
  TaskScope,
  TaskSettingId,
  TaskSorter,
  TaskSourceKind,
  TasksSchemaProperties,
  USER_TASKS_GROUP_KEY,
  rerunTaskIcon
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2NvbW1vbi90YXNrcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0ICogYXMgT2JqZWN0cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFVyaUNvbXBvbmVudHMsIFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbmltcG9ydCB7IFByb2JsZW1NYXRjaGVyIH0gZnJvbSAnLi9wcm9ibGVtTWF0Y2hlci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyLCBJV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgUmF3Q29udGV4dEtleSwgQ29udGV4dEtleUV4cHJlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFRhc2tEZWZpbml0aW9uUmVnaXN0cnkgfSBmcm9tICcuL3Rhc2tEZWZpbml0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEV4aXRSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVySWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuXG5cblxuZXhwb3J0IGNvbnN0IFVTRVJfVEFTS1NfR1JPVVBfS0VZID0gJ3NldHRpbmdzJztcblxuZXhwb3J0IGNvbnN0IFRBU0tfUlVOTklOR19TVEFURSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0YXNrUnVubmluZycsIGZhbHNlLCBubHMubG9jYWxpemUoJ3Rhc2tzLnRhc2tSdW5uaW5nQ29udGV4dCcsIFwiV2hldGhlciBhIHRhc2sgaXMgY3VycmVudGx5IHJ1bm5pbmcuXCIpKTtcbi8qKiBXaGV0aGVyIHRoZSBhY3RpdmUgdGVybWluYWwgaXMgYSB0YXNrIHRlcm1pbmFsLiAqL1xuZXhwb3J0IGNvbnN0IFRBU0tfVEVSTUlOQUxfQUNUSVZFID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3Rhc2tUZXJtaW5hbEFjdGl2ZScsIGZhbHNlLCBubHMubG9jYWxpemUoJ3Rhc2tUZXJtaW5hbEFjdGl2ZScsIFwiV2hldGhlciB0aGUgYWN0aXZlIHRlcm1pbmFsIGlzIGEgdGFzayB0ZXJtaW5hbC5cIikpO1xuZXhwb3J0IGNvbnN0IFRBU0tTX0NBVEVHT1JZID0gbmxzLmxvY2FsaXplMigndGFza3NDYXRlZ29yeScsIFwiVGFza3NcIik7XG5cbmV4cG9ydCBlbnVtIFNoZWxsUXVvdGluZyB7XG5cdC8qKlxuXHQgKiBVc2UgY2hhcmFjdGVyIGVzY2FwaW5nLlxuXHQgKi9cblx0RXNjYXBlID0gMSxcblxuXHQvKipcblx0ICogVXNlIHN0cm9uZyBxdW90aW5nXG5cdCAqL1xuXHRTdHJvbmcgPSAyLFxuXG5cdC8qKlxuXHQgKiBVc2Ugd2VhayBxdW90aW5nLlxuXHQgKi9cblx0V2VhayA9IDMsXG59XG5cbmV4cG9ydCBjb25zdCBDVVNUT01JWkVEX1RBU0tfVFlQRSA9ICckY3VzdG9taXplZCc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgU2hlbGxRdW90aW5nIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb20odGhpczogdm9pZCwgdmFsdWU6IHN0cmluZyk6IFNoZWxsUXVvdGluZyB7XG5cdFx0aWYgKCF2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIFNoZWxsUXVvdGluZy5TdHJvbmc7XG5cdFx0fVxuXHRcdHN3aXRjaCAodmFsdWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAnZXNjYXBlJzpcblx0XHRcdFx0cmV0dXJuIFNoZWxsUXVvdGluZy5Fc2NhcGU7XG5cdFx0XHRjYXNlICdzdHJvbmcnOlxuXHRcdFx0XHRyZXR1cm4gU2hlbGxRdW90aW5nLlN0cm9uZztcblx0XHRcdGNhc2UgJ3dlYWsnOlxuXHRcdFx0XHRyZXR1cm4gU2hlbGxRdW90aW5nLldlYWs7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gU2hlbGxRdW90aW5nLlN0cm9uZztcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2hlbGxRdW90aW5nT3B0aW9ucyB7XG5cdC8qKlxuXHQgKiBUaGUgY2hhcmFjdGVyIHVzZWQgdG8gZG8gY2hhcmFjdGVyIGVzY2FwaW5nLlxuXHQgKi9cblx0ZXNjYXBlPzogc3RyaW5nIHwge1xuXHRcdGVzY2FwZUNoYXI6IHN0cmluZztcblx0XHRjaGFyc1RvRXNjYXBlOiBzdHJpbmc7XG5cdH07XG5cblx0LyoqXG5cdCAqIFRoZSBjaGFyYWN0ZXIgdXNlZCBmb3Igc3RyaW5nIHF1b3RpbmcuXG5cdCAqL1xuXHRzdHJvbmc/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBjaGFyYWN0ZXIgdXNlZCBmb3Igd2VhayBxdW90aW5nLlxuXHQgKi9cblx0d2Vhaz86IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2hlbGxDb25maWd1cmF0aW9uIHtcblx0LyoqXG5cdCAqIFRoZSBzaGVsbCBleGVjdXRhYmxlLlxuXHQgKi9cblx0ZXhlY3V0YWJsZT86IHN0cmluZztcblxuXHQvKipcblx0ICogVGhlIGFyZ3VtZW50cyB0byBiZSBwYXNzZWQgdG8gdGhlIHNoZWxsIGV4ZWN1dGFibGUuXG5cdCAqL1xuXHRhcmdzPzogc3RyaW5nW107XG5cblx0LyoqXG5cdCAqIFdoaWNoIGtpbmQgb2YgcXVvdGVzIHRoZSBzaGVsbCBzdXBwb3J0cy5cblx0ICovXG5cdHF1b3Rpbmc/OiBJU2hlbGxRdW90aW5nT3B0aW9ucztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBDb21tYW5kT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFRoZSBzaGVsbCB0byB1c2UgaWYgdGhlIHRhc2sgaXMgYSBzaGVsbCBjb21tYW5kLlxuXHQgKi9cblx0c2hlbGw/OiBJU2hlbGxDb25maWd1cmF0aW9uO1xuXG5cdC8qKlxuXHQgKiBUaGUgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSBvZiB0aGUgZXhlY3V0ZWQgcHJvZ3JhbSBvciBzaGVsbC5cblx0ICogSWYgb21pdHRlZCBWU0NvZGUncyBjdXJyZW50IHdvcmtzcGFjZSByb290IGlzIHVzZWQuXG5cdCAqL1xuXHRjd2Q/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBlbnZpcm9ubWVudCBvZiB0aGUgZXhlY3V0ZWQgcHJvZ3JhbSBvciBzaGVsbC4gSWYgb21pdHRlZFxuXHQgKiB0aGUgcGFyZW50IHByb2Nlc3MnIGVudmlyb25tZW50IGlzIHVzZWQuXG5cdCAqL1xuXHRlbnY/OiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9O1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIENvbW1hbmRPcHRpb25zIHtcblx0ZXhwb3J0IGNvbnN0IGRlZmF1bHRzOiBDb21tYW5kT3B0aW9ucyA9IHsgY3dkOiAnJHt3b3Jrc3BhY2VGb2xkZXJ9JyB9O1xufVxuXG5leHBvcnQgZW51bSBSZXZlYWxLaW5kIHtcblx0LyoqXG5cdCAqIEFsd2F5cyBicmluZ3MgdGhlIHRlcm1pbmFsIHRvIGZyb250IGlmIHRoZSB0YXNrIGlzIGV4ZWN1dGVkLlxuXHQgKi9cblx0QWx3YXlzID0gMSxcblxuXHQvKipcblx0ICogT25seSBicmluZ3MgdGhlIHRlcm1pbmFsIHRvIGZyb250IGlmIGEgcHJvYmxlbSBpcyBkZXRlY3RlZCBleGVjdXRpbmcgdGhlIHRhc2tcblx0ICogZS5nLiB0aGUgdGFzayBjb3VsZG4ndCBiZSBzdGFydGVkLFxuXHQgKiB0aGUgdGFzayBlbmRlZCB3aXRoIGFuIGV4aXQgY29kZSBvdGhlciB0aGFuIHplcm8sXG5cdCAqIG9yIHRoZSBwcm9ibGVtIG1hdGNoZXIgZm91bmQgYW4gZXJyb3IuXG5cdCAqL1xuXHRTaWxlbnQgPSAyLFxuXG5cdC8qKlxuXHQgKiBUaGUgdGVybWluYWwgbmV2ZXIgY29tZXMgdG8gZnJvbnQgd2hlbiB0aGUgdGFzayBpcyBleGVjdXRlZC5cblx0ICovXG5cdE5ldmVyID0gM1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFJldmVhbEtpbmQge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmluZyh0aGlzOiB2b2lkLCB2YWx1ZTogc3RyaW5nKTogUmV2ZWFsS2luZCB7XG5cdFx0c3dpdGNoICh2YWx1ZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0XHRjYXNlICdhbHdheXMnOlxuXHRcdFx0XHRyZXR1cm4gUmV2ZWFsS2luZC5BbHdheXM7XG5cdFx0XHRjYXNlICdzaWxlbnQnOlxuXHRcdFx0XHRyZXR1cm4gUmV2ZWFsS2luZC5TaWxlbnQ7XG5cdFx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRcdHJldHVybiBSZXZlYWxLaW5kLk5ldmVyO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFJldmVhbEtpbmQuQWx3YXlzO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZW51bSBSZXZlYWxQcm9ibGVtS2luZCB7XG5cdC8qKlxuXHQgKiBOZXZlciByZXZlYWxzIHRoZSBwcm9ibGVtcyBwYW5lbCB3aGVuIHRoaXMgdGFzayBpcyBleGVjdXRlZC5cblx0ICovXG5cdE5ldmVyID0gMSxcblxuXG5cdC8qKlxuXHQgKiBPbmx5IHJldmVhbHMgdGhlIHByb2JsZW1zIHBhbmVsIGlmIGEgcHJvYmxlbSBpcyBmb3VuZC5cblx0ICovXG5cdE9uUHJvYmxlbSA9IDIsXG5cblx0LyoqXG5cdCAqIE5ldmVyIHJldmVhbHMgdGhlIHByb2JsZW1zIHBhbmVsIHdoZW4gdGhpcyB0YXNrIGlzIGV4ZWN1dGVkLlxuXHQgKi9cblx0QWx3YXlzID0gM1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFJldmVhbFByb2JsZW1LaW5kIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGZyb21TdHJpbmcodGhpczogdm9pZCwgdmFsdWU6IHN0cmluZyk6IFJldmVhbFByb2JsZW1LaW5kIHtcblx0XHRzd2l0Y2ggKHZhbHVlLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdGNhc2UgJ2Fsd2F5cyc6XG5cdFx0XHRcdHJldHVybiBSZXZlYWxQcm9ibGVtS2luZC5BbHdheXM7XG5cdFx0XHRjYXNlICduZXZlcic6XG5cdFx0XHRcdHJldHVybiBSZXZlYWxQcm9ibGVtS2luZC5OZXZlcjtcblx0XHRcdGNhc2UgJ29ucHJvYmxlbSc6XG5cdFx0XHRcdHJldHVybiBSZXZlYWxQcm9ibGVtS2luZC5PblByb2JsZW07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gUmV2ZWFsUHJvYmxlbUtpbmQuT25Qcm9ibGVtO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgZW51bSBQYW5lbEtpbmQge1xuXG5cdC8qKlxuXHQgKiBTaGFyZXMgYSBwYW5lbCB3aXRoIG90aGVyIHRhc2tzLiBUaGlzIGlzIHRoZSBkZWZhdWx0LlxuXHQgKi9cblx0U2hhcmVkID0gMSxcblxuXHQvKipcblx0ICogVXNlcyBhIGRlZGljYXRlZCBwYW5lbCBmb3IgdGhpcyB0YXNrcy4gVGhlIHBhbmVsIGlzIG5vdFxuXHQgKiBzaGFyZWQgd2l0aCBvdGhlciB0YXNrcy5cblx0ICovXG5cdERlZGljYXRlZCA9IDIsXG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSBuZXcgcGFuZWwgd2hlbmV2ZXIgdGhpcyB0YXNrIGlzIGV4ZWN1dGVkLlxuXHQgKi9cblx0TmV3ID0gM1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFBhbmVsS2luZCB7XG5cdGV4cG9ydCBmdW5jdGlvbiBmcm9tU3RyaW5nKHZhbHVlOiBzdHJpbmcpOiBQYW5lbEtpbmQge1xuXHRcdHN3aXRjaCAodmFsdWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAnc2hhcmVkJzpcblx0XHRcdFx0cmV0dXJuIFBhbmVsS2luZC5TaGFyZWQ7XG5cdFx0XHRjYXNlICdkZWRpY2F0ZWQnOlxuXHRcdFx0XHRyZXR1cm4gUGFuZWxLaW5kLkRlZGljYXRlZDtcblx0XHRcdGNhc2UgJ25ldyc6XG5cdFx0XHRcdHJldHVybiBQYW5lbEtpbmQuTmV3O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFBhbmVsS2luZC5TaGFyZWQ7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVByZXNlbnRhdGlvbk9wdGlvbnMge1xuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGFzayBvdXRwdXQgaXMgcmV2ZWFsIGluIHRoZSB1c2VyIGludGVyZmFjZS5cblx0ICogRGVmYXVsdHMgdG8gYFJldmVhbEtpbmQuQWx3YXlzYC5cblx0ICovXG5cdHJldmVhbDogUmV2ZWFsS2luZDtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgcHJvYmxlbXMgcGFuZSBpcyByZXZlYWxlZCB3aGVuIHJ1bm5pbmcgdGhpcyB0YXNrIG9yIG5vdC5cblx0ICogRGVmYXVsdHMgdG8gYFJldmVhbFByb2JsZW1LaW5kLk5ldmVyYC5cblx0ICovXG5cdHJldmVhbFByb2JsZW1zOiBSZXZlYWxQcm9ibGVtS2luZDtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgY29tbWFuZCBhc3NvY2lhdGVkIHdpdGggdGhlIHRhc2sgaXMgZWNob2VkXG5cdCAqIGluIHRoZSB1c2VyIGludGVyZmFjZS5cblx0ICovXG5cdGVjaG86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHBhbmVsIHNob3dpbmcgdGhlIHRhc2sgb3V0cHV0IGlzIHRha2luZyBmb2N1cy5cblx0ICovXG5cdGZvY3VzOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBDb250cm9scyBpZiB0aGUgdGFzayBwYW5lbCBpcyB1c2VkIGZvciB0aGlzIHRhc2sgb25seSAoZGVkaWNhdGVkKSxcblx0ICogc2hhcmVkIGJldHdlZW4gdGFza3MgKHNoYXJlZCkgb3IgaWYgYSBuZXcgcGFuZWwgaXMgY3JlYXRlZCBvblxuXHQgKiBldmVyeSB0YXNrIGV4ZWN1dGlvbiAobmV3KS4gRGVmYXVsdHMgdG8gYFRhc2tJbnN0YW5jZUtpbmQuU2hhcmVkYFxuXHQgKi9cblx0cGFuZWw6IFBhbmVsS2luZDtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0byBzaG93IHRoZSBcIlRlcm1pbmFsIHdpbGwgYmUgcmV1c2VkIGJ5IHRhc2tzLCBwcmVzcyBhbnkga2V5IHRvIGNsb3NlIGl0XCIgbWVzc2FnZS5cblx0ICovXG5cdHNob3dSZXVzZU1lc3NhZ2U6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdG8gY2xlYXIgdGhlIHRlcm1pbmFsIGJlZm9yZSBleGVjdXRpbmcgdGhlIHRhc2suXG5cdCAqL1xuXHRjbGVhcjogYm9vbGVhbjtcblxuXHQvKipcblx0ICogQ29udHJvbHMgd2hldGhlciB0aGUgdGFzayBpcyBleGVjdXRlZCBpbiBhIHNwZWNpZmljIHRlcm1pbmFsIGdyb3VwIHVzaW5nIHNwbGl0IHBhbmVzLlxuXHQgKi9cblx0Z3JvdXA/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHRoYXQgdGhlIHRhc2sgcnVucyBpbiBpcyBjbG9zZWQgd2hlbiB0aGUgdGFzayBjb21wbGV0ZXMuXG5cdCAqL1xuXHRjbG9zZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIENvbnRyb2xzIHdoZXRoZXIgdG8gcHJlc2VydmUgdGhlIHRhc2sgbmFtZSBpbiB0aGUgdGVybWluYWwgYWZ0ZXIgdGFzayBjb21wbGV0aW9uLlxuXHQgKi9cblx0cHJlc2VydmVUZXJtaW5hbE5hbWU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFByZXNlbnRhdGlvbk9wdGlvbnMge1xuXHRleHBvcnQgY29uc3QgZGVmYXVsdHM6IElQcmVzZW50YXRpb25PcHRpb25zID0ge1xuXHRcdGVjaG86IHRydWUsIHJldmVhbDogUmV2ZWFsS2luZC5BbHdheXMsIHJldmVhbFByb2JsZW1zOiBSZXZlYWxQcm9ibGVtS2luZC5OZXZlciwgZm9jdXM6IGZhbHNlLCBwYW5lbDogUGFuZWxLaW5kLlNoYXJlZCwgc2hvd1JldXNlTWVzc2FnZTogdHJ1ZSwgY2xlYXI6IGZhbHNlLCBwcmVzZXJ2ZVRlcm1pbmFsTmFtZTogZmFsc2Vcblx0fTtcbn1cblxuZXhwb3J0IGVudW0gUnVudGltZVR5cGUge1xuXHRTaGVsbCA9IDEsXG5cdFByb2Nlc3MgPSAyLFxuXHRDdXN0b21FeGVjdXRpb24gPSAzXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgUnVudGltZVR5cGUge1xuXHRleHBvcnQgZnVuY3Rpb24gZnJvbVN0cmluZyh2YWx1ZTogc3RyaW5nKTogUnVudGltZVR5cGUge1xuXHRcdHN3aXRjaCAodmFsdWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0Y2FzZSAnc2hlbGwnOlxuXHRcdFx0XHRyZXR1cm4gUnVudGltZVR5cGUuU2hlbGw7XG5cdFx0XHRjYXNlICdwcm9jZXNzJzpcblx0XHRcdFx0cmV0dXJuIFJ1bnRpbWVUeXBlLlByb2Nlc3M7XG5cdFx0XHRjYXNlICdjdXN0b21FeGVjdXRpb24nOlxuXHRcdFx0XHRyZXR1cm4gUnVudGltZVR5cGUuQ3VzdG9tRXhlY3V0aW9uO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIFJ1bnRpbWVUeXBlLlByb2Nlc3M7XG5cdFx0fVxuXHR9XG5cdGV4cG9ydCBmdW5jdGlvbiB0b1N0cmluZyh2YWx1ZTogUnVudGltZVR5cGUpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodmFsdWUpIHtcblx0XHRcdGNhc2UgUnVudGltZVR5cGUuU2hlbGw6IHJldHVybiAnc2hlbGwnO1xuXHRcdFx0Y2FzZSBSdW50aW1lVHlwZS5Qcm9jZXNzOiByZXR1cm4gJ3Byb2Nlc3MnO1xuXHRcdFx0Y2FzZSBSdW50aW1lVHlwZS5DdXN0b21FeGVjdXRpb246IHJldHVybiAnY3VzdG9tRXhlY3V0aW9uJztcblx0XHRcdGRlZmF1bHQ6IHJldHVybiAncHJvY2Vzcyc7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVF1b3RlZFN0cmluZyB7XG5cdHZhbHVlOiBzdHJpbmc7XG5cdHF1b3Rpbmc6IFNoZWxsUXVvdGluZztcbn1cblxuZXhwb3J0IHR5cGUgQ29tbWFuZFN0cmluZyA9IHN0cmluZyB8IElRdW90ZWRTdHJpbmc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29tbWFuZFN0cmluZyB7XG5cdGV4cG9ydCBmdW5jdGlvbiB2YWx1ZSh2YWx1ZTogQ29tbWFuZFN0cmluZyk6IHN0cmluZyB7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUudmFsdWU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbW1hbmRDb25maWd1cmF0aW9uIHtcblxuXHQvKipcblx0ICogVGhlIHRhc2sgdHlwZVxuXHQgKi9cblx0cnVudGltZT86IFJ1bnRpbWVUeXBlO1xuXG5cdC8qKlxuXHQgKiBUaGUgY29tbWFuZCB0byBleGVjdXRlXG5cdCAqL1xuXHRuYW1lPzogQ29tbWFuZFN0cmluZztcblxuXHQvKipcblx0ICogQWRkaXRpb25hbCBjb21tYW5kIG9wdGlvbnMuXG5cdCAqL1xuXHRvcHRpb25zPzogQ29tbWFuZE9wdGlvbnM7XG5cblx0LyoqXG5cdCAqIENvbW1hbmQgYXJndW1lbnRzLlxuXHQgKi9cblx0YXJncz86IENvbW1hbmRTdHJpbmdbXTtcblxuXHQvKipcblx0ICogVGhlIHRhc2sgc2VsZWN0b3IgaWYgbmVlZGVkLlxuXHQgKi9cblx0dGFza1NlbGVjdG9yPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRvIHN1cHByZXNzIHRoZSB0YXNrIG5hbWUgd2hlbiBtZXJnaW5nIGdsb2JhbCBhcmdzXG5cdCAqXG5cdCAqL1xuXHRzdXBwcmVzc1Rhc2tOYW1lPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogRGVzY3JpYmVzIGhvdyB0aGUgdGFzayBpcyBwcmVzZW50ZWQgaW4gdGhlIFVJLlxuXHQgKi9cblx0cHJlc2VudGF0aW9uPzogSVByZXNlbnRhdGlvbk9wdGlvbnM7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgVGFza0dyb3VwIHtcblx0ZXhwb3J0IGNvbnN0IENsZWFuOiBUYXNrR3JvdXAgPSB7IF9pZDogJ2NsZWFuJywgaXNEZWZhdWx0OiBmYWxzZSB9O1xuXG5cdGV4cG9ydCBjb25zdCBCdWlsZDogVGFza0dyb3VwID0geyBfaWQ6ICdidWlsZCcsIGlzRGVmYXVsdDogZmFsc2UgfTtcblxuXHRleHBvcnQgY29uc3QgUmVidWlsZDogVGFza0dyb3VwID0geyBfaWQ6ICdyZWJ1aWxkJywgaXNEZWZhdWx0OiBmYWxzZSB9O1xuXG5cdGV4cG9ydCBjb25zdCBUZXN0OiBUYXNrR3JvdXAgPSB7IF9pZDogJ3Rlc3QnLCBpc0RlZmF1bHQ6IGZhbHNlIH07XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgc3RyaW5nIHtcblx0XHRyZXR1cm4gdmFsdWUgPT09IENsZWFuLl9pZCB8fCB2YWx1ZSA9PT0gQnVpbGQuX2lkIHx8IHZhbHVlID09PSBSZWJ1aWxkLl9pZCB8fCB2YWx1ZSA9PT0gVGVzdC5faWQ7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZnJvbSh2YWx1ZTogc3RyaW5nIHwgVGFza0dyb3VwIHwgdW5kZWZpbmVkKTogVGFza0dyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0aWYgKGlzKHZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4geyBfaWQ6IHZhbHVlLCBpc0RlZmF1bHQ6IGZhbHNlIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGFza0dyb3VwIHtcblx0X2lkOiBzdHJpbmc7XG5cdGlzRGVmYXVsdD86IGJvb2xlYW4gfCBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFRhc2tTY29wZSB7XG5cdEdsb2JhbCA9IDEsXG5cdFdvcmtzcGFjZSA9IDIsXG5cdEZvbGRlciA9IDNcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUYXNrU291cmNlS2luZCB7XG5cdGV4cG9ydCBjb25zdCBXb3Jrc3BhY2U6ICd3b3Jrc3BhY2UnID0gJ3dvcmtzcGFjZSc7XG5cdGV4cG9ydCBjb25zdCBFeHRlbnNpb246ICdleHRlbnNpb24nID0gJ2V4dGVuc2lvbic7XG5cdGV4cG9ydCBjb25zdCBJbk1lbW9yeTogJ2luTWVtb3J5JyA9ICdpbk1lbW9yeSc7XG5cdGV4cG9ydCBjb25zdCBXb3Jrc3BhY2VGaWxlOiAnd29ya3NwYWNlRmlsZScgPSAnd29ya3NwYWNlRmlsZSc7XG5cdGV4cG9ydCBjb25zdCBVc2VyOiAndXNlcicgPSAndXNlcic7XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHRvQ29uZmlndXJhdGlvblRhcmdldChraW5kOiBzdHJpbmcpOiBDb25maWd1cmF0aW9uVGFyZ2V0IHtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgVGFza1NvdXJjZUtpbmQuVXNlcjogcmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjtcblx0XHRcdGNhc2UgVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlRmlsZTogcmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFO1xuXHRcdFx0ZGVmYXVsdDogcmV0dXJuIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza1NvdXJjZUNvbmZpZ0VsZW1lbnQge1xuXHR3b3Jrc3BhY2VGb2xkZXI/OiBJV29ya3NwYWNlRm9sZGVyO1xuXHR3b3Jrc3BhY2U/OiBJV29ya3NwYWNlO1xuXHRmaWxlOiBzdHJpbmc7XG5cdGluZGV4OiBudW1iZXI7XG5cdGVsZW1lbnQ6IHVua25vd247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tDb25maWcge1xuXHRsYWJlbDogc3RyaW5nO1xuXHR0YXNrPzogQ29tbWFuZFN0cmluZztcblx0dHlwZT86IHN0cmluZztcblx0Y29tbWFuZD86IHN0cmluZyB8IENvbW1hbmRTdHJpbmc7XG5cdGFyZ3M/OiBzdHJpbmdbXSB8IENvbW1hbmRTdHJpbmdbXTtcblx0cHJlc2VudGF0aW9uPzogSVByZXNlbnRhdGlvbk9wdGlvbnM7XG5cdGlzQmFja2dyb3VuZD86IGJvb2xlYW47XG5cdHByb2JsZW1NYXRjaGVyPzogVHlwZXMuU2luZ2xlT3JNYW55PHN0cmluZz47XG5cdGdyb3VwPzogc3RyaW5nIHwgVGFza0dyb3VwO1xufVxuXG5pbnRlcmZhY2UgSUJhc2VUYXNrU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3Jrc3BhY2VUYXNrU291cmNlIGV4dGVuZHMgSUJhc2VUYXNrU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogJ3dvcmtzcGFjZSc7XG5cdHJlYWRvbmx5IGNvbmZpZzogSVRhc2tTb3VyY2VDb25maWdFbGVtZW50O1xuXHRyZWFkb25seSBjdXN0b21pemVzPzogS2V5ZWRUYXNrSWRlbnRpZmllcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uVGFza1NvdXJjZSBleHRlbmRzIElCYXNlVGFza1NvdXJjZSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICdleHRlbnNpb24nO1xuXHRyZWFkb25seSBleHRlbnNpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNjb3BlOiBUYXNrU2NvcGU7XG5cdHJlYWRvbmx5IHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uVGFza1NvdXJjZVRyYW5zZmVyIHtcblx0X193b3Jrc3BhY2VGb2xkZXI6IFVyaUNvbXBvbmVudHM7XG5cdF9fZGVmaW5pdGlvbjogeyB0eXBlOiBzdHJpbmc7W25hbWU6IHN0cmluZ106IHVua25vd24gfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5NZW1vcnlUYXNrU291cmNlIGV4dGVuZHMgSUJhc2VUYXNrU291cmNlIHtcblx0cmVhZG9ubHkga2luZDogJ2luTWVtb3J5Jztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVXNlclRhc2tTb3VyY2UgZXh0ZW5kcyBJQmFzZVRhc2tTb3VyY2Uge1xuXHRyZWFkb25seSBraW5kOiAndXNlcic7XG5cdHJlYWRvbmx5IGNvbmZpZzogSVRhc2tTb3VyY2VDb25maWdFbGVtZW50O1xuXHRyZWFkb25seSBjdXN0b21pemVzPzogS2V5ZWRUYXNrSWRlbnRpZmllcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBXb3Jrc3BhY2VGaWxlVGFza1NvdXJjZSBleHRlbmRzIElCYXNlVGFza1NvdXJjZSB7XG5cdHJlYWRvbmx5IGtpbmQ6ICd3b3Jrc3BhY2VGaWxlJztcblx0cmVhZG9ubHkgY29uZmlnOiBJVGFza1NvdXJjZUNvbmZpZ0VsZW1lbnQ7XG5cdHJlYWRvbmx5IGN1c3RvbWl6ZXM/OiBLZXllZFRhc2tJZGVudGlmaWVyO1xufVxuXG5leHBvcnQgdHlwZSBUYXNrU291cmNlID0gSVdvcmtzcGFjZVRhc2tTb3VyY2UgfCBJRXh0ZW5zaW9uVGFza1NvdXJjZSB8IElJbk1lbW9yeVRhc2tTb3VyY2UgfCBJVXNlclRhc2tTb3VyY2UgfCBXb3Jrc3BhY2VGaWxlVGFza1NvdXJjZTtcbmV4cG9ydCB0eXBlIEZpbGVCYXNlZFRhc2tTb3VyY2UgPSBJV29ya3NwYWNlVGFza1NvdXJjZSB8IElVc2VyVGFza1NvdXJjZSB8IFdvcmtzcGFjZUZpbGVUYXNrU291cmNlO1xuZXhwb3J0IGludGVyZmFjZSBJVGFza0lkZW50aWZpZXIge1xuXHR0eXBlOiBzdHJpbmc7XG5cdFtuYW1lOiBzdHJpbmddOiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEtleWVkVGFza0lkZW50aWZpZXIgZXh0ZW5kcyBJVGFza0lkZW50aWZpZXIge1xuXHRfa2V5OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tEZXBlbmRlbmN5IHtcblx0dXJpOiBVUkkgfCBzdHJpbmc7XG5cdHRhc2s6IHN0cmluZyB8IEtleWVkVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIERlcGVuZHNPcmRlciB7XG5cdHBhcmFsbGVsID0gJ3BhcmFsbGVsJyxcblx0c2VxdWVuY2UgPSAnc2VxdWVuY2UnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblxuXHQvKipcblx0ICogVGhlIHRhc2sncyBuYW1lXG5cdCAqL1xuXHRuYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBUaGUgdGFzaydzIG5hbWVcblx0ICovXG5cdGlkZW50aWZpZXI/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSB0YXNrJ3MgZ3JvdXA7XG5cdCAqL1xuXHRncm91cD86IHN0cmluZyB8IFRhc2tHcm91cDtcblxuXHQvKipcblx0ICogVGhlIHByZXNlbnRhdGlvbiBvcHRpb25zXG5cdCAqL1xuXHRwcmVzZW50YXRpb24/OiBJUHJlc2VudGF0aW9uT3B0aW9ucztcblxuXHQvKipcblx0ICogVGhlIGNvbW1hbmQgb3B0aW9ucztcblx0ICovXG5cdG9wdGlvbnM/OiBDb21tYW5kT3B0aW9ucztcblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgdGFzayBpcyBhIGJhY2tncm91bmQgdGFzayBvciBub3QuXG5cdCAqL1xuXHRpc0JhY2tncm91bmQ/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB0YXNrIHNob3VsZCBwcm9tcHQgb24gY2xvc2UgZm9yIGNvbmZpcm1hdGlvbiBpZiBydW5uaW5nLlxuXHQgKi9cblx0cHJvbXB0T25DbG9zZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBvdGhlciB0YXNrcyB0aGlzIHRhc2sgZGVwZW5kcyBvbi5cblx0ICovXG5cdGRlcGVuZHNPbj86IElUYXNrRGVwZW5kZW5jeVtdO1xuXG5cdC8qKlxuXHQgKiBUaGUgb3JkZXIgdGhlIGRlcGVuZHNPbiB0YXNrcyBzaG91bGQgYmUgZXhlY3V0ZWQgaW4uXG5cdCAqL1xuXHRkZXBlbmRzT3JkZXI/OiBEZXBlbmRzT3JkZXI7XG5cblx0LyoqXG5cdCAqIEEgZGVzY3JpcHRpb24gb2YgdGhlIHRhc2suXG5cdCAqL1xuXHRkZXRhaWw/OiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBwcm9ibGVtIHdhdGNoZXJzIHRvIHVzZSBmb3IgdGhpcyB0YXNrXG5cdCAqL1xuXHRwcm9ibGVtTWF0Y2hlcnM/OiBBcnJheTxzdHJpbmcgfCBQcm9ibGVtTWF0Y2hlcj47XG5cblx0LyoqXG5cdCAqIFRoZSBpY29uIGZvciB0aGlzIHRhc2sgaW4gdGhlIHRlcm1pbmFsIHRhYnMgbGlzdFxuXHQgKi9cblx0aWNvbj86IHsgaWQ/OiBzdHJpbmc7IGNvbG9yPzogc3RyaW5nIH07XG5cblx0LyoqXG5cdCAqIERvIG5vdCBzaG93IHRoaXMgdGFzayBpbiB0aGUgcnVuIHRhc2sgcXVpY2twaWNrXG5cdCAqL1xuXHRoaWRlPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogU2hvdyB0aGlzIHRhc2sgaW4gdGhlIEFnZW50cyBydW4gYWN0aW9uIGRyb3Bkb3duXG5cdCAqL1xuXHRpbkFnZW50cz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBlbnVtIFJ1bk9uT3B0aW9ucyB7XG5cdGRlZmF1bHQgPSAxLFxuXHRmb2xkZXJPcGVuID0gMixcblx0d29ya3RyZWVDcmVhdGVkID0gM1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBJbnN0YW5jZVBvbGljeSB7XG5cdHRlcm1pbmF0ZU5ld2VzdCA9ICd0ZXJtaW5hdGVOZXdlc3QnLFxuXHR0ZXJtaW5hdGVPbGRlc3QgPSAndGVybWluYXRlT2xkZXN0Jyxcblx0cHJvbXB0ID0gJ3Byb21wdCcsXG5cdHdhcm4gPSAnd2FybicsXG5cdHNpbGVudCA9ICdzaWxlbnQnXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJ1bk9wdGlvbnMge1xuXHRyZWV2YWx1YXRlT25SZXJ1bj86IGJvb2xlYW47XG5cdHJ1bk9uPzogUnVuT25PcHRpb25zO1xuXHRpbnN0YW5jZUxpbWl0PzogbnVtYmVyO1xuXHRpbnN0YW5jZVBvbGljeT86IEluc3RhbmNlUG9saWN5O1xufVxuXG5leHBvcnQgbmFtZXNwYWNlIFJ1bk9wdGlvbnMge1xuXHRleHBvcnQgY29uc3QgZGVmYXVsdHM6IElSdW5PcHRpb25zID0geyByZWV2YWx1YXRlT25SZXJ1bjogdHJ1ZSwgcnVuT246IFJ1bk9uT3B0aW9ucy5kZWZhdWx0LCBpbnN0YW5jZUxpbWl0OiAxLCBpbnN0YW5jZVBvbGljeTogSW5zdGFuY2VQb2xpY3kucHJvbXB0IH07XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBDb21tb25UYXNrIHtcblxuXHQvKipcblx0ICogVGhlIHRhc2sncyBpbnRlcm5hbCBpZFxuXHQgKi9cblx0cmVhZG9ubHkgX2lkOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFRoZSBjYWNoZWQgbGFiZWwuXG5cdCAqL1xuXHRfbGFiZWw6IHN0cmluZyA9ICcnO1xuXG5cdHR5cGU/OiBzdHJpbmc7XG5cblx0cnVuT3B0aW9uczogSVJ1bk9wdGlvbnM7XG5cblx0Y29uZmlndXJhdGlvblByb3BlcnRpZXM6IElDb25maWd1cmF0aW9uUHJvcGVydGllcztcblxuXHRfc291cmNlOiBJQmFzZVRhc2tTb3VyY2U7XG5cblx0cHJpdmF0ZSBfdGFza0xvYWRNZXNzYWdlczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKGlkOiBzdHJpbmcsIGxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgcnVuT3B0aW9uczogSVJ1bk9wdGlvbnMsXG5cdFx0Y29uZmlndXJhdGlvblByb3BlcnRpZXM6IElDb25maWd1cmF0aW9uUHJvcGVydGllcywgc291cmNlOiBJQmFzZVRhc2tTb3VyY2UpIHtcblx0XHR0aGlzLl9pZCA9IGlkO1xuXHRcdGlmIChsYWJlbCkge1xuXHRcdFx0dGhpcy5fbGFiZWwgPSBsYWJlbDtcblx0XHR9XG5cdFx0aWYgKHR5cGUpIHtcblx0XHRcdHRoaXMudHlwZSA9IHR5cGU7XG5cdFx0fVxuXHRcdHRoaXMucnVuT3B0aW9ucyA9IHJ1bk9wdGlvbnM7XG5cdFx0dGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcyA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzO1xuXHRcdHRoaXMuX3NvdXJjZSA9IHNvdXJjZTtcblx0fVxuXG5cdHB1YmxpYyBnZXREZWZpbml0aW9uKHVzZVNvdXJjZT86IGJvb2xlYW4pOiBLZXllZFRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldE1hcEtleSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9pZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRLZXkoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEZvbGRlcklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgZ2V0Q29tbW9uVGFza0lkKCk6IHN0cmluZyB7XG5cdFx0aW50ZXJmYWNlIElSZWNlbnRUYXNrS2V5IHtcblx0XHRcdGZvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHR9XG5cblx0XHRjb25zdCBrZXk6IElSZWNlbnRUYXNrS2V5ID0geyBmb2xkZXI6IHRoaXMuZ2V0Rm9sZGVySWQoKSwgaWQ6IHRoaXMuX2lkIH07XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KGtleSk7XG5cdH1cblxuXHRwdWJsaWMgY2xvbmUoKTogVGFzayB7XG5cdFx0cmV0dXJuIHRoaXMuZnJvbU9iamVjdChPYmplY3QuYXNzaWduKHt9LCB0aGlzIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBmcm9tT2JqZWN0KG9iamVjdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBUYXNrO1xuXG5cdHB1YmxpYyBnZXRXb3Jrc3BhY2VGb2xkZXIoKTogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRXb3Jrc3BhY2VGaWxlTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGVsZW1ldHJ5S2luZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAndW5rbm93bic7XG5cdH1cblxuXHRwdWJsaWMgbWF0Y2hlcyhrZXk6IHN0cmluZyB8IEtleWVkVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQsIGNvbXBhcmVJZDogYm9vbGVhbiA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0aWYgKGtleSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhrZXkpKSB7XG5cdFx0XHRyZXR1cm4ga2V5ID09PSB0aGlzLl9sYWJlbCB8fCBrZXkgPT09IHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciB8fCAoY29tcGFyZUlkICYmIGtleSA9PT0gdGhpcy5faWQpO1xuXHRcdH1cblx0XHRjb25zdCBpZGVudGlmaWVyID0gdGhpcy5nZXREZWZpbml0aW9uKHRydWUpO1xuXHRcdHJldHVybiBpZGVudGlmaWVyICE9PSB1bmRlZmluZWQgJiYgaWRlbnRpZmllci5fa2V5ID09PSBrZXkuX2tleTtcblx0fVxuXG5cdHB1YmxpYyBnZXRRdWFsaWZpZWRMYWJlbCgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuZ2V0V29ya3NwYWNlRm9sZGVyKCk7XG5cdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0cmV0dXJuIGAke3RoaXMuX2xhYmVsfSAoJHt3b3Jrc3BhY2VGb2xkZXIubmFtZX0pYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhYmVsO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBnZXRUYXNrRXhlY3V0aW9uKCk6IElUYXNrRXhlY3V0aW9uIHtcblx0XHRjb25zdCByZXN1bHQ6IElUYXNrRXhlY3V0aW9uID0ge1xuXHRcdFx0aWQ6IHRoaXMuX2lkLFxuXHRcdFx0dGFzazogdGhpcyBhcyB1bmtub3duIGFzIFRhc2tcblx0XHR9O1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYWRkVGFza0xvYWRNZXNzYWdlcyhtZXNzYWdlczogc3RyaW5nW10gfCB1bmRlZmluZWQpIHtcblx0XHRpZiAodGhpcy5fdGFza0xvYWRNZXNzYWdlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl90YXNrTG9hZE1lc3NhZ2VzID0gW107XG5cdFx0fVxuXHRcdGlmIChtZXNzYWdlcykge1xuXHRcdFx0dGhpcy5fdGFza0xvYWRNZXNzYWdlcyA9IHRoaXMuX3Rhc2tMb2FkTWVzc2FnZXMuY29uY2F0KG1lc3NhZ2VzKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgdGFza0xvYWRNZXNzYWdlcygpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2tMb2FkTWVzc2FnZXM7XG5cdH1cbn1cblxuLyoqXG4gKiBGb3IgdGFza3Mgb2YgdHlwZSBzaGVsbCBvciBwcm9jZXNzLCB0aGlzIGlzIGNyZWF0ZWQgdXBvbiBwYXJzZVxuICogb2YgdGhlIHRhc2tzLmpzb24gb3Igd29ya3NwYWNlIGZpbGUuXG4gKiBGb3IgQ29udHJpYnV0ZWRUYXNrcyBvZiBhbGwgb3RoZXIgdHlwZXMsIHRoaXMgaXMgdGhlIHJlc3VsdCBvZlxuICogcmVzb2x2aW5nIGEgQ29uZmlndXJpbmdUYXNrLlxuICovXG5leHBvcnQgY2xhc3MgQ3VzdG9tVGFzayBleHRlbmRzIENvbW1vblRhc2sge1xuXG5cdGRlY2xhcmUgdHlwZTogJyRjdXN0b21pemVkJzsgLy8gQ1VTVE9NSVpFRF9UQVNLX1RZUEVcblxuXHRpbnN0YW5jZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBJbmRpY2F0ZWQgdGhlIHNvdXJjZSBvZiB0aGUgdGFzayAoZS5nLiB0YXNrcy5qc29uIG9yIGV4dGVuc2lvbilcblx0ICovXG5cdG92ZXJyaWRlIF9zb3VyY2U6IEZpbGVCYXNlZFRhc2tTb3VyY2U7XG5cblx0aGFzRGVmaW5lZE1hdGNoZXJzOiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBUaGUgY29tbWFuZCBjb25maWd1cmF0aW9uXG5cdCAqL1xuXHRjb21tYW5kOiBJQ29tbWFuZENvbmZpZ3VyYXRpb24gPSB7fTtcblxuXHRwdWJsaWMgY29uc3RydWN0b3IoaWQ6IHN0cmluZywgc291cmNlOiBGaWxlQmFzZWRUYXNrU291cmNlLCBsYWJlbDogc3RyaW5nLCB0eXBlOiBzdHJpbmcsIGNvbW1hbmQ6IElDb21tYW5kQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRoYXNEZWZpbmVkTWF0Y2hlcnM6IGJvb2xlYW4sIHJ1bk9wdGlvbnM6IElSdW5PcHRpb25zLCBjb25maWd1cmF0aW9uUHJvcGVydGllczogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKSB7XG5cdFx0c3VwZXIoaWQsIGxhYmVsLCB1bmRlZmluZWQsIHJ1bk9wdGlvbnMsIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBzb3VyY2UpO1xuXHRcdHRoaXMuX3NvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLmhhc0RlZmluZWRNYXRjaGVycyA9IGhhc0RlZmluZWRNYXRjaGVycztcblx0XHRpZiAoY29tbWFuZCkge1xuXHRcdFx0dGhpcy5jb21tYW5kID0gY29tbWFuZDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY2xvbmUoKTogQ3VzdG9tVGFzayB7XG5cdFx0cmV0dXJuIG5ldyBDdXN0b21UYXNrKHRoaXMuX2lkLCB0aGlzLl9zb3VyY2UsIHRoaXMuX2xhYmVsLCB0aGlzLnR5cGUsIHRoaXMuY29tbWFuZCwgdGhpcy5oYXNEZWZpbmVkTWF0Y2hlcnMsIHRoaXMucnVuT3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcyk7XG5cdH1cblxuXHRwdWJsaWMgY3VzdG9taXplcygpOiBLZXllZFRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fc291cmNlICYmIHRoaXMuX3NvdXJjZS5jdXN0b21pemVzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc291cmNlLmN1c3RvbWl6ZXM7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0RGVmaW5pdGlvbih1c2VTb3VyY2U6IGJvb2xlYW4gPSBmYWxzZSk6IEtleWVkVGFza0lkZW50aWZpZXIge1xuXHRcdGlmICh1c2VTb3VyY2UgJiYgdGhpcy5fc291cmNlLmN1c3RvbWl6ZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5jdXN0b21pemVzO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsZXQgdHlwZTogc3RyaW5nO1xuXHRcdFx0Y29uc3QgY29tbWFuZFJ1bnRpbWUgPSB0aGlzLmNvbW1hbmQgPyB0aGlzLmNvbW1hbmQucnVudGltZSA6IHVuZGVmaW5lZDtcblx0XHRcdHN3aXRjaCAoY29tbWFuZFJ1bnRpbWUpIHtcblx0XHRcdFx0Y2FzZSBSdW50aW1lVHlwZS5TaGVsbDpcblx0XHRcdFx0XHR0eXBlID0gJ3NoZWxsJztcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFJ1bnRpbWVUeXBlLlByb2Nlc3M6XG5cdFx0XHRcdFx0dHlwZSA9ICdwcm9jZXNzJztcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFJ1bnRpbWVUeXBlLkN1c3RvbUV4ZWN1dGlvbjpcblx0XHRcdFx0XHR0eXBlID0gJ2N1c3RvbUV4ZWN1dGlvbic7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSB1bmRlZmluZWQ6XG5cdFx0XHRcdFx0dHlwZSA9ICckY29tcG9zaXRlJztcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB0YXNrIHJ1bnRpbWUnKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBLZXllZFRhc2tJZGVudGlmaWVyID0ge1xuXHRcdFx0XHR0eXBlLFxuXHRcdFx0XHRfa2V5OiB0aGlzLl9pZCxcblx0XHRcdFx0aWQ6IHRoaXMuX2lkXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGlzKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgQ3VzdG9tVGFzayB7XG5cdFx0cmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgQ3VzdG9tVGFzaztcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRNYXBLZXkoKTogc3RyaW5nIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZUZvbGRlcjtcblx0XHRyZXR1cm4gd29ya3NwYWNlRm9sZGVyID8gYCR7d29ya3NwYWNlRm9sZGVyLnVyaS50b1N0cmluZygpfXwke3RoaXMuX2lkfXwke3RoaXMuaW5zdGFuY2V9YCA6IGAke3RoaXMuX2lkfXwke3RoaXMuaW5zdGFuY2V9YDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRGb2xkZXJJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuVXNlciA/IFVTRVJfVEFTS1NfR1JPVVBfS0VZIDogdGhpcy5fc291cmNlLmNvbmZpZy53b3Jrc3BhY2VGb2xkZXI/LnVyaS50b1N0cmluZygpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldENvbW1vblRhc2tJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuY3VzdG9taXplcyA/IHN1cGVyLmdldENvbW1vblRhc2tJZCgpIDogKHRoaXMuZ2V0S2V5KCkgPz8gc3VwZXIuZ2V0Q29tbW9uVGFza0lkKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIEEga2V5IHJlcHJlc2VudGluZyB0aGUgdGFza1xuXHQgKi9cblx0cHVibGljIG92ZXJyaWRlIGdldEtleSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGludGVyZmFjZSBJQ3VzdG9tS2V5IHtcblx0XHRcdHR5cGU6IHN0cmluZztcblx0XHRcdGZvbGRlcjogc3RyaW5nO1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHR9XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5nZXRGb2xkZXJJZCgpO1xuXHRcdGlmICghd29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgaWQ6IHN0cmluZyA9IHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciE7XG5cdFx0aWYgKHRoaXMuX3NvdXJjZS5raW5kICE9PSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UpIHtcblx0XHRcdGlkICs9IHRoaXMuX3NvdXJjZS5raW5kO1xuXHRcdH1cblx0XHRjb25zdCBrZXk6IElDdXN0b21LZXkgPSB7IHR5cGU6IENVU1RPTUlaRURfVEFTS19UWVBFLCBmb2xkZXI6IHdvcmtzcGFjZUZvbGRlciwgaWQgfTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoa2V5KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRXb3Jrc3BhY2VGb2xkZXIoKTogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS5jb25maWcud29ya3NwYWNlRm9sZGVyO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldFdvcmtzcGFjZUZpbGVOYW1lKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuICh0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZSAmJiB0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZS5jb25maWd1cmF0aW9uKSA/IHJlc291cmNlcy5iYXNlbmFtZSh0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZS5jb25maWd1cmF0aW9uKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRUZWxlbWV0cnlLaW5kKCk6IHN0cmluZyB7XG5cdFx0aWYgKHRoaXMuX3NvdXJjZS5jdXN0b21pemVzKSB7XG5cdFx0XHRyZXR1cm4gJ3dvcmtzcGFjZT5leHRlbnNpb24nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gJ3dvcmtzcGFjZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGZyb21PYmplY3Qob2JqZWN0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IEN1c3RvbVRhc2sge1xuXHRcdGNvbnN0IG9iaiA9IG9iamVjdCBhcyB1bmtub3duIGFzIEN1c3RvbVRhc2s7XG5cdFx0cmV0dXJuIG5ldyBDdXN0b21UYXNrKG9iai5faWQsIG9iai5fc291cmNlLCBvYmouX2xhYmVsLCBvYmoudHlwZSwgb2JqLmNvbW1hbmQsIG9iai5oYXNEZWZpbmVkTWF0Y2hlcnMsIG9iai5ydW5PcHRpb25zLCBvYmouY29uZmlndXJhdGlvblByb3BlcnRpZXMpO1xuXHR9XG59XG5cbi8qKlxuICogQWZ0ZXIgYSBjb250cmlidXRlZCB0YXNrIGhhcyBiZWVuIHBhcnNlZCwgYnV0IGJlZm9yZVxuICogdGhlIHRhc2sgaGFzIGJlZW4gcmVzb2x2ZWQgdmlhIHRoZSBleHRlbnNpb24sIGl0cyBwcm9wZXJ0aWVzXG4gKiBhcmUgc3RvcmVkIGluIHRoaXNcbiAqL1xuZXhwb3J0IGNsYXNzIENvbmZpZ3VyaW5nVGFzayBleHRlbmRzIENvbW1vblRhc2sge1xuXG5cdC8qKlxuXHQgKiBJbmRpY2F0ZWQgdGhlIHNvdXJjZSBvZiB0aGUgdGFzayAoZS5nLiB0YXNrcy5qc29uIG9yIGV4dGVuc2lvbilcblx0ICovXG5cdG92ZXJyaWRlIF9zb3VyY2U6IEZpbGVCYXNlZFRhc2tTb3VyY2U7XG5cblx0Y29uZmlndXJlczogS2V5ZWRUYXNrSWRlbnRpZmllcjtcblxuXHRwdWJsaWMgY29uc3RydWN0b3IoaWQ6IHN0cmluZywgc291cmNlOiBGaWxlQmFzZWRUYXNrU291cmNlLCBsYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0Y29uZmlndXJlczogS2V5ZWRUYXNrSWRlbnRpZmllciwgcnVuT3B0aW9uczogSVJ1bk9wdGlvbnMsIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwsIHR5cGUsIHJ1bk9wdGlvbnMsIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBzb3VyY2UpO1xuXHRcdHRoaXMuX3NvdXJjZSA9IHNvdXJjZTtcblx0XHR0aGlzLmNvbmZpZ3VyZXMgPSBjb25maWd1cmVzO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIENvbmZpZ3VyaW5nVGFzayB7XG5cdFx0cmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgQ29uZmlndXJpbmdUYXNrO1xuXHR9XG5cblx0cHJvdGVjdGVkIGZyb21PYmplY3Qob2JqZWN0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFRhc2sge1xuXHRcdHJldHVybiBvYmplY3QgYXMgdW5rbm93biBhcyBUYXNrO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldERlZmluaXRpb24oKTogS2V5ZWRUYXNrSWRlbnRpZmllciB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJlcztcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRXb3Jrc3BhY2VGaWxlTmFtZSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiAodGhpcy5fc291cmNlLmNvbmZpZy53b3Jrc3BhY2UgJiYgdGhpcy5fc291cmNlLmNvbmZpZy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbikgPyByZXNvdXJjZXMuYmFzZW5hbWUodGhpcy5fc291cmNlLmNvbmZpZy53b3Jrc3BhY2UuY29uZmlndXJhdGlvbikgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0V29ya3NwYWNlRm9sZGVyKCk6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZUZvbGRlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRGb2xkZXJJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuVXNlciA/IFVTRVJfVEFTS1NfR1JPVVBfS0VZIDogdGhpcy5fc291cmNlLmNvbmZpZy53b3Jrc3BhY2VGb2xkZXI/LnVyaS50b1N0cmluZygpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldEtleSgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGludGVyZmFjZSBJQ3VzdG9tS2V5IHtcblx0XHRcdHR5cGU6IHN0cmluZztcblx0XHRcdGZvbGRlcjogc3RyaW5nO1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHR9XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5nZXRGb2xkZXJJZCgpO1xuXHRcdGlmICghd29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgaWQ6IHN0cmluZyA9IHRoaXMuY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciE7XG5cdFx0aWYgKHRoaXMuX3NvdXJjZS5raW5kICE9PSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UpIHtcblx0XHRcdGlkICs9IHRoaXMuX3NvdXJjZS5raW5kO1xuXHRcdH1cblx0XHRjb25zdCBrZXk6IElDdXN0b21LZXkgPSB7IHR5cGU6IENVU1RPTUlaRURfVEFTS19UWVBFLCBmb2xkZXI6IHdvcmtzcGFjZUZvbGRlciwgaWQgfTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoa2V5KTtcblx0fVxufVxuXG4vKipcbiAqIEEgdGFzayBmcm9tIGFuIGV4dGVuc2lvbiBjcmVhdGVkIHZpYSByZXNvbHZlVGFzayBvciBwcm92aWRlVGFza1xuICovXG5leHBvcnQgY2xhc3MgQ29udHJpYnV0ZWRUYXNrIGV4dGVuZHMgQ29tbW9uVGFzayB7XG5cblx0LyoqXG5cdCAqIEluZGljYXRlZCB0aGUgc291cmNlIG9mIHRoZSB0YXNrIChlLmcuIHRhc2tzLmpzb24gb3IgZXh0ZW5zaW9uKVxuXHQgKiBTZXQgaW4gdGhlIHN1cGVyIGNvbnN0cnVjdG9yXG5cdCAqL1xuXHRkZWNsYXJlIF9zb3VyY2U6IElFeHRlbnNpb25UYXNrU291cmNlO1xuXG5cdGluc3RhbmNlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0ZGVmaW5lczogS2V5ZWRUYXNrSWRlbnRpZmllcjtcblxuXHRoYXNEZWZpbmVkTWF0Y2hlcnM6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFRoZSBjb21tYW5kIGNvbmZpZ3VyYXRpb25cblx0ICovXG5cdGNvbW1hbmQ6IElDb21tYW5kQ29uZmlndXJhdGlvbjtcblxuXHQvKipcblx0ICogVGhlIGljb24gZm9yIHRoZSB0YXNrXG5cdCAqL1xuXHRpY29uOiB7IGlkPzogc3RyaW5nOyBjb2xvcj86IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBEb24ndCBzaG93IHRoZSB0YXNrIGluIHRoZSBydW4gdGFzayBxdWlja3BpY2tcblx0ICovXG5cdGhpZGU/OiBib29sZWFuO1xuXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBzb3VyY2U6IElFeHRlbnNpb25UYXNrU291cmNlLCBsYWJlbDogc3RyaW5nLCB0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGRlZmluZXM6IEtleWVkVGFza0lkZW50aWZpZXIsXG5cdFx0Y29tbWFuZDogSUNvbW1hbmRDb25maWd1cmF0aW9uLCBoYXNEZWZpbmVkTWF0Y2hlcnM6IGJvb2xlYW4sIHJ1bk9wdGlvbnM6IElSdW5PcHRpb25zLFxuXHRcdGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzOiBJQ29uZmlndXJhdGlvblByb3BlcnRpZXMpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwsIHR5cGUsIHJ1bk9wdGlvbnMsIGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLCBzb3VyY2UpO1xuXHRcdHRoaXMuZGVmaW5lcyA9IGRlZmluZXM7XG5cdFx0dGhpcy5oYXNEZWZpbmVkTWF0Y2hlcnMgPSBoYXNEZWZpbmVkTWF0Y2hlcnM7XG5cdFx0dGhpcy5jb21tYW5kID0gY29tbWFuZDtcblx0XHR0aGlzLmljb24gPSBjb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uO1xuXHRcdHRoaXMuaGlkZSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmhpZGU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgY2xvbmUoKTogQ29udHJpYnV0ZWRUYXNrIHtcblx0XHRyZXR1cm4gbmV3IENvbnRyaWJ1dGVkVGFzayh0aGlzLl9pZCwgdGhpcy5fc291cmNlLCB0aGlzLl9sYWJlbCwgdGhpcy50eXBlLCB0aGlzLmRlZmluZXMsIHRoaXMuY29tbWFuZCwgdGhpcy5oYXNEZWZpbmVkTWF0Y2hlcnMsIHRoaXMucnVuT3B0aW9ucywgdGhpcy5jb25maWd1cmF0aW9uUHJvcGVydGllcyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0RGVmaW5pdGlvbigpOiBLZXllZFRhc2tJZGVudGlmaWVyIHtcblx0XHRyZXR1cm4gdGhpcy5kZWZpbmVzO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpcyh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIENvbnRyaWJ1dGVkVGFzayB7XG5cdFx0cmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgQ29udHJpYnV0ZWRUYXNrO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldE1hcEtleSgpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuX3NvdXJjZS53b3Jrc3BhY2VGb2xkZXI7XG5cdFx0cmV0dXJuIHdvcmtzcGFjZUZvbGRlclxuXHRcdFx0PyBgJHt0aGlzLl9zb3VyY2Uuc2NvcGUudG9TdHJpbmcoKX18JHt3b3Jrc3BhY2VGb2xkZXIudXJpLnRvU3RyaW5nKCl9fCR7dGhpcy5faWR9fCR7dGhpcy5pbnN0YW5jZX1gXG5cdFx0XHQ6IGAke3RoaXMuX3NvdXJjZS5zY29wZS50b1N0cmluZygpfXwke3RoaXMuX2lkfXwke3RoaXMuaW5zdGFuY2V9YDtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRGb2xkZXJJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9zb3VyY2Uuc2NvcGUgPT09IFRhc2tTY29wZS5Gb2xkZXIgJiYgdGhpcy5fc291cmNlLndvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS53b3Jrc3BhY2VGb2xkZXIudXJpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0S2V5KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aW50ZXJmYWNlIElDb250cmlidXRlZEtleSB7XG5cdFx0XHR0eXBlOiBzdHJpbmc7XG5cdFx0XHRzY29wZTogbnVtYmVyO1xuXHRcdFx0Zm9sZGVyPzogc3RyaW5nO1xuXHRcdFx0aWQ6IHN0cmluZztcblx0XHR9XG5cblx0XHRjb25zdCBrZXk6IElDb250cmlidXRlZEtleSA9IHsgdHlwZTogJ2NvbnRyaWJ1dGVkJywgc2NvcGU6IHRoaXMuX3NvdXJjZS5zY29wZSwgaWQ6IHRoaXMuX2lkIH07XG5cdFx0a2V5LmZvbGRlciA9IHRoaXMuZ2V0Rm9sZGVySWQoKTtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoa2V5KTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRXb3Jrc3BhY2VGb2xkZXIoKTogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvdXJjZS53b3Jrc3BhY2VGb2xkZXI7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZ2V0VGVsZW1ldHJ5S2luZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnZXh0ZW5zaW9uJztcblx0fVxuXG5cdHByb3RlY3RlZCBmcm9tT2JqZWN0KG9iamVjdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBDb250cmlidXRlZFRhc2sge1xuXHRcdGNvbnN0IG9iaiA9IG9iamVjdCBhcyB1bmtub3duIGFzIENvbnRyaWJ1dGVkVGFzaztcblx0XHRyZXR1cm4gbmV3IENvbnRyaWJ1dGVkVGFzayhvYmouX2lkLCBvYmouX3NvdXJjZSwgb2JqLl9sYWJlbCwgb2JqLnR5cGUsIG9iai5kZWZpbmVzLCBvYmouY29tbWFuZCwgb2JqLmhhc0RlZmluZWRNYXRjaGVycywgb2JqLnJ1bk9wdGlvbnMsIG9iai5jb25maWd1cmF0aW9uUHJvcGVydGllcyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluTWVtb3J5VGFzayBleHRlbmRzIENvbW1vblRhc2sge1xuXHQvKipcblx0ICogSW5kaWNhdGVkIHRoZSBzb3VyY2Ugb2YgdGhlIHRhc2sgKGUuZy4gdGFza3MuanNvbiBvciBleHRlbnNpb24pXG5cdCAqL1xuXHRvdmVycmlkZSBfc291cmNlOiBJSW5NZW1vcnlUYXNrU291cmNlO1xuXG5cdGluc3RhbmNlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0ZGVjbGFyZSB0eXBlOiAnaW5NZW1vcnknO1xuXG5cdHB1YmxpYyBjb25zdHJ1Y3RvcihpZDogc3RyaW5nLCBzb3VyY2U6IElJbk1lbW9yeVRhc2tTb3VyY2UsIGxhYmVsOiBzdHJpbmcsIHR5cGU6IHN0cmluZyxcblx0XHRydW5PcHRpb25zOiBJUnVuT3B0aW9ucywgY29uZmlndXJhdGlvblByb3BlcnRpZXM6IElDb25maWd1cmF0aW9uUHJvcGVydGllcykge1xuXHRcdHN1cGVyKGlkLCBsYWJlbCwgdHlwZSwgcnVuT3B0aW9ucywgY29uZmlndXJhdGlvblByb3BlcnRpZXMsIHNvdXJjZSk7XG5cdFx0dGhpcy5fc291cmNlID0gc291cmNlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGNsb25lKCk6IEluTWVtb3J5VGFzayB7XG5cdFx0cmV0dXJuIG5ldyBJbk1lbW9yeVRhc2sodGhpcy5faWQsIHRoaXMuX3NvdXJjZSwgdGhpcy5fbGFiZWwsIHRoaXMudHlwZSwgdGhpcy5ydW5PcHRpb25zLCB0aGlzLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaXModmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyBJbk1lbW9yeVRhc2sge1xuXHRcdHJldHVybiB2YWx1ZSBpbnN0YW5jZW9mIEluTWVtb3J5VGFzaztcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBnZXRUZWxlbWV0cnlLaW5kKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdjb21wb3NpdGUnO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldE1hcEtleSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHt0aGlzLl9pZH18JHt0aGlzLmluc3RhbmNlfWA7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Rm9sZGVySWQoKTogdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIGZyb21PYmplY3Qob2JqZWN0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IEluTWVtb3J5VGFzayB7XG5cdFx0Y29uc3Qgb2JqID0gb2JqZWN0IGFzIHVua25vd24gYXMgSW5NZW1vcnlUYXNrO1xuXHRcdHJldHVybiBuZXcgSW5NZW1vcnlUYXNrKG9iai5faWQsIG9iai5fc291cmNlLCBvYmouX2xhYmVsLCBvYmoudHlwZSwgb2JqLnJ1bk9wdGlvbnMsIG9iai5jb25maWd1cmF0aW9uUHJvcGVydGllcyk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgVGFzayA9IEN1c3RvbVRhc2sgfCBDb250cmlidXRlZFRhc2sgfCBJbk1lbW9yeVRhc2s7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRhc2tFeGVjdXRpb24ge1xuXHRpZDogc3RyaW5nO1xuXHR0YXNrOiBUYXNrO1xufVxuXG5leHBvcnQgZW51bSBFeGVjdXRpb25FbmdpbmUge1xuXHRQcm9jZXNzID0gMSxcblx0VGVybWluYWwgPSAyXG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgRXhlY3V0aW9uRW5naW5lIHtcblx0ZXhwb3J0IGNvbnN0IF9kZWZhdWx0OiBFeGVjdXRpb25FbmdpbmUgPSBFeGVjdXRpb25FbmdpbmUuVGVybWluYWw7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEpzb25TY2hlbWFWZXJzaW9uIHtcblx0VjBfMV8wID0gMSxcblx0VjJfMF8wID0gMlxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrU2V0IHtcblx0dGFza3M6IFRhc2tbXTtcblx0ZXh0ZW5zaW9uPzogSUV4dGVuc2lvbkRlc2NyaXB0aW9uO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrRGVmaW5pdGlvbiB7XG5cdGV4dGVuc2lvbklkOiBzdHJpbmc7XG5cdHRhc2tUeXBlOiBzdHJpbmc7XG5cdHJlcXVpcmVkOiBzdHJpbmdbXTtcblx0cHJvcGVydGllczogSUpTT05TY2hlbWFNYXA7XG5cdHdoZW4/OiBDb250ZXh0S2V5RXhwcmVzc2lvbjtcbn1cblxuZXhwb3J0IGNsYXNzIFRhc2tTb3J0ZXIge1xuXG5cdHByaXZhdGUgX29yZGVyOiBNYXA8c3RyaW5nLCBudW1iZXI+ID0gbmV3IE1hcCgpO1xuXG5cdGNvbnN0cnVjdG9yKHdvcmtzcGFjZUZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSkge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgd29ya3NwYWNlRm9sZGVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fb3JkZXIuc2V0KHdvcmtzcGFjZUZvbGRlcnNbaV0udXJpLnRvU3RyaW5nKCksIGkpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBjb21wYXJlKGE6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2ssIGI6IFRhc2sgfCBDb25maWd1cmluZ1Rhc2spOiBudW1iZXIge1xuXHRcdGNvbnN0IGF3ID0gYS5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRjb25zdCBidyA9IGIuZ2V0V29ya3NwYWNlRm9sZGVyKCk7XG5cdFx0aWYgKGF3ICYmIGJ3KSB7XG5cdFx0XHRsZXQgYWkgPSB0aGlzLl9vcmRlci5nZXQoYXcudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YWkgPSBhaSA9PT0gdW5kZWZpbmVkID8gMCA6IGFpICsgMTtcblx0XHRcdGxldCBiaSA9IHRoaXMuX29yZGVyLmdldChidy51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRiaSA9IGJpID09PSB1bmRlZmluZWQgPyAwIDogYmkgKyAxO1xuXHRcdFx0aWYgKGFpID09PSBiaSkge1xuXHRcdFx0XHRyZXR1cm4gYS5fbGFiZWwubG9jYWxlQ29tcGFyZShiLl9sYWJlbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gYWkgLSBiaTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKCFhdyAmJiBidykge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH0gZWxzZSBpZiAoYXcgJiYgIWJ3KSB7XG5cdFx0XHRyZXR1cm4gKzE7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxufVxuXG5cblxuZXhwb3J0IGNvbnN0IGVudW0gVGFza1J1blR5cGUge1xuXHRTaW5nbGVSdW4gPSAnc2luZ2xlUnVuJyxcblx0QmFja2dyb3VuZCA9ICdiYWNrZ3JvdW5kJ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrQ2hhbmdlZEV2ZW50IHtcblx0a2luZDogVGFza0V2ZW50S2luZC5DaGFuZ2VkO1xufVxuXG5cblxuZXhwb3J0IGVudW0gVGFza0V2ZW50S2luZCB7XG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIHRhc2sncyBwcm9wZXJ0aWVzIG9yIGNvbmZpZ3VyYXRpb24gaGF2ZSBjaGFuZ2VkICovXG5cdENoYW5nZWQgPSAnY2hhbmdlZCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzayBoYXMgYmVndW4gZXhlY3V0aW5nICovXG5cdFByb2Nlc3NTdGFydGVkID0gJ3Byb2Nlc3NTdGFydGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrIHByb2Nlc3MgaGFzIGNvbXBsZXRlZCAqL1xuXHRQcm9jZXNzRW5kZWQgPSAncHJvY2Vzc0VuZGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrIHdhcyB0ZXJtaW5hdGVkLCBlaXRoZXIgYnkgdXNlciBhY3Rpb24gb3IgYnkgdGhlIHN5c3RlbSAqL1xuXHRUZXJtaW5hdGVkID0gJ3Rlcm1pbmF0ZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIHRhc2sgaGFzIHN0YXJ0ZWQgcnVubmluZyAqL1xuXHRTdGFydCA9ICdzdGFydCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzayBoYXMgYWNxdWlyZWQgYWxsIG5lZWRlZCBpbnB1dC92YXJpYWJsZXMgdG8gZXhlY3V0ZSAqL1xuXHRBY3F1aXJlZElucHV0ID0gJ2FjcXVpcmVkSW5wdXQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIGRlcGVuZGVudCB0YXNrIGhhcyBzdGFydGVkICovXG5cdERlcGVuZHNPblN0YXJ0ZWQgPSAnZGVwZW5kc09uU3RhcnRlZCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzayBpcyBhY3RpdmVseSBydW5uaW5nL3Byb2Nlc3NpbmcgKi9cblx0QWN0aXZlID0gJ2FjdGl2ZScsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzayBpcyBwYXVzZWQvd2FpdGluZyBidXQgbm90IGNvbXBsZXRlICovXG5cdEluYWN0aXZlID0gJ2luYWN0aXZlJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrIGhhcyBjb21wbGV0ZWQgZnVsbHkgKi9cblx0RW5kID0gJ2VuZCcsXG5cblx0LyoqIEluZGljYXRlcyB0aGF0IGEgdGFzaydzIHByb2JsZW0gbWF0Y2hlciBoYXMgc3RhcnRlZCAqL1xuXHRQcm9ibGVtTWF0Y2hlclN0YXJ0ZWQgPSAncHJvYmxlbU1hdGNoZXJTdGFydGVkJyxcblxuXHQvKiogSW5kaWNhdGVzIHRoYXQgYSB0YXNrJ3MgcHJvYmxlbSBtYXRjaGVyIGhhcyBlbmRlZCAqL1xuXHRQcm9ibGVtTWF0Y2hlckVuZGVkID0gJ3Byb2JsZW1NYXRjaGVyRW5kZWQnLFxuXG5cdC8qKiBJbmRpY2F0ZXMgdGhhdCBhIHRhc2sncyBwcm9ibGVtIG1hdGNoZXIgaGFzIGZvdW5kIGVycm9ycyAqL1xuXHRQcm9ibGVtTWF0Y2hlckZvdW5kRXJyb3JzID0gJ3Byb2JsZW1NYXRjaGVyRm91bmRFcnJvcnMnXG59XG5cbmludGVyZmFjZSBJVGFza0NvbW1vbiB7XG5cdHRhc2tJZDogc3RyaW5nO1xuXHRydW5UeXBlOiBUYXNrUnVuVHlwZTtcblx0dGFza05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z3JvdXA6IHN0cmluZyB8IFRhc2tHcm91cCB8IHVuZGVmaW5lZDtcblx0X190YXNrOiBUYXNrO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUHJvY2Vzc1N0YXJ0ZWRFdmVudCBleHRlbmRzIElUYXNrQ29tbW9uIHtcblx0a2luZDogVGFza0V2ZW50S2luZC5Qcm9jZXNzU3RhcnRlZDtcblx0dGVybWluYWxJZDogbnVtYmVyO1xuXHRwcm9jZXNzSWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza1Byb2Nlc3NFbmRlZEV2ZW50IGV4dGVuZHMgSVRhc2tDb21tb24ge1xuXHRraW5kOiBUYXNrRXZlbnRLaW5kLlByb2Nlc3NFbmRlZDtcblx0dGVybWluYWxJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRleGl0Q29kZT86IG51bWJlcjtcblx0ZHVyYXRpb25Ncz86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza0luYWN0aXZlRXZlbnQgZXh0ZW5kcyBJVGFza0NvbW1vbiB7XG5cdGtpbmQ6IFRhc2tFdmVudEtpbmQuSW5hY3RpdmU7XG5cdHRlcm1pbmFsSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0ZHVyYXRpb25NczogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrVGVybWluYXRlZEV2ZW50IGV4dGVuZHMgSVRhc2tDb21tb24ge1xuXHRraW5kOiBUYXNrRXZlbnRLaW5kLlRlcm1pbmF0ZWQ7XG5cdHRlcm1pbmFsSWQ6IG51bWJlcjtcblx0ZXhpdFJlYXNvbjogVGVybWluYWxFeGl0UmVhc29uIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrU3RhcnRlZEV2ZW50IGV4dGVuZHMgSVRhc2tDb21tb24ge1xuXHRraW5kOiBUYXNrRXZlbnRLaW5kLlN0YXJ0O1xuXHR0ZXJtaW5hbElkOiBudW1iZXI7XG5cdHJlc29sdmVkVmFyaWFibGVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUYXNrUHJvYmxlbU1hdGNoZXJFbmRlZEV2ZW50IGV4dGVuZHMgSVRhc2tDb21tb24ge1xuXHRraW5kOiBUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyRW5kZWQ7XG5cdGhhc0Vycm9yczogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGFza0dlbmVyYWxFdmVudCBleHRlbmRzIElUYXNrQ29tbW9uIHtcblx0a2luZDogVGFza0V2ZW50S2luZC5BY3F1aXJlZElucHV0IHwgVGFza0V2ZW50S2luZC5EZXBlbmRzT25TdGFydGVkIHwgVGFza0V2ZW50S2luZC5BY3RpdmUgfCBUYXNrRXZlbnRLaW5kLkluYWN0aXZlIHwgVGFza0V2ZW50S2luZC5FbmQgfCBUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyU3RhcnRlZCB8IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJGb3VuZEVycm9ycztcblx0dGVybWluYWxJZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgdHlwZSBJVGFza0V2ZW50ID1cblx0fCBJVGFza0NoYW5nZWRFdmVudFxuXHR8IElUYXNrUHJvY2Vzc1N0YXJ0ZWRFdmVudFxuXHR8IElUYXNrUHJvY2Vzc0VuZGVkRXZlbnRcblx0fCBJVGFza1Rlcm1pbmF0ZWRFdmVudFxuXHR8IElUYXNrU3RhcnRlZEV2ZW50XG5cdHwgSVRhc2tHZW5lcmFsRXZlbnRcblx0fCBJVGFza1Byb2JsZW1NYXRjaGVyRW5kZWRFdmVudDtcblxuZXhwb3J0IGNvbnN0IGVudW0gVGFza1J1blNvdXJjZSB7XG5cdFN5c3RlbSxcblx0VXNlcixcblx0Rm9sZGVyT3Blbixcblx0Q29uZmlndXJhdGlvbkNoYW5nZSxcblx0UmVjb25uZWN0LFxuXHRDaGF0QWdlbnRcbn1cblxuZXhwb3J0IG5hbWVzcGFjZSBUYXNrRXZlbnQge1xuXHRmdW5jdGlvbiBjb21tb24odGFzazogVGFzayk6IElUYXNrQ29tbW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGFza0lkOiB0YXNrLl9pZCxcblx0XHRcdHRhc2tOYW1lOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUsXG5cdFx0XHRydW5UeXBlOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCA/IFRhc2tSdW5UeXBlLkJhY2tncm91bmQgOiBUYXNrUnVuVHlwZS5TaW5nbGVSdW4sXG5cdFx0XHRncm91cDogdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCxcblx0XHRcdF9fdGFzazogdGFzayxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0KHRhc2s6IFRhc2ssIHRlcm1pbmFsSWQ6IG51bWJlciwgcmVzb2x2ZWRWYXJpYWJsZXM6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBJVGFza1N0YXJ0ZWRFdmVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vbih0YXNrKSxcblx0XHRcdGtpbmQ6IFRhc2tFdmVudEtpbmQuU3RhcnQsXG5cdFx0XHR0ZXJtaW5hbElkLFxuXHRcdFx0cmVzb2x2ZWRWYXJpYWJsZXMsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBwcm9jZXNzU3RhcnRlZCh0YXNrOiBUYXNrLCB0ZXJtaW5hbElkOiBudW1iZXIsIHByb2Nlc3NJZDogbnVtYmVyKTogSVRhc2tQcm9jZXNzU3RhcnRlZEV2ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uKHRhc2spLFxuXHRcdFx0a2luZDogVGFza0V2ZW50S2luZC5Qcm9jZXNzU3RhcnRlZCxcblx0XHRcdHRlcm1pbmFsSWQsXG5cdFx0XHRwcm9jZXNzSWQsXG5cdFx0fTtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gcHJvY2Vzc0VuZGVkKHRhc2s6IFRhc2ssIHRlcm1pbmFsSWQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZXhpdENvZGU6IG51bWJlciB8IHVuZGVmaW5lZCwgZHVyYXRpb25Ncz86IG51bWJlcik6IElUYXNrUHJvY2Vzc0VuZGVkRXZlbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5jb21tb24odGFzayksXG5cdFx0XHRraW5kOiBUYXNrRXZlbnRLaW5kLlByb2Nlc3NFbmRlZCxcblx0XHRcdHRlcm1pbmFsSWQsXG5cdFx0XHRleGl0Q29kZSxcblx0XHRcdGR1cmF0aW9uTXMsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBpbmFjdGl2ZSh0YXNrOiBUYXNrLCB0ZXJtaW5hbElkPzogbnVtYmVyLCBkdXJhdGlvbk1zPzogbnVtYmVyKTogSVRhc2tJbmFjdGl2ZUV2ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uKHRhc2spLFxuXHRcdFx0a2luZDogVGFza0V2ZW50S2luZC5JbmFjdGl2ZSxcblx0XHRcdHRlcm1pbmFsSWQsXG5cdFx0XHRkdXJhdGlvbk1zLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gdGVybWluYXRlZCh0YXNrOiBUYXNrLCB0ZXJtaW5hbElkOiBudW1iZXIsIGV4aXRSZWFzb246IFRlcm1pbmFsRXhpdFJlYXNvbiB8IHVuZGVmaW5lZCk6IElUYXNrVGVybWluYXRlZEV2ZW50IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29tbW9uKHRhc2spLFxuXHRcdFx0a2luZDogVGFza0V2ZW50S2luZC5UZXJtaW5hdGVkLFxuXHRcdFx0ZXhpdFJlYXNvbixcblx0XHRcdHRlcm1pbmFsSWQsXG5cdFx0fTtcblx0fVxuXG5cdGV4cG9ydCBmdW5jdGlvbiBnZW5lcmFsKGtpbmQ6IFRhc2tFdmVudEtpbmQuQWNxdWlyZWRJbnB1dCB8IFRhc2tFdmVudEtpbmQuRGVwZW5kc09uU3RhcnRlZCB8IFRhc2tFdmVudEtpbmQuQWN0aXZlIHwgVGFza0V2ZW50S2luZC5JbmFjdGl2ZSB8IFRhc2tFdmVudEtpbmQuRW5kIHwgVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlclN0YXJ0ZWQgfCBUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyRm91bmRFcnJvcnMsIHRhc2s6IFRhc2ssIHRlcm1pbmFsSWQ/OiBudW1iZXIpOiBJVGFza0dlbmVyYWxFdmVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vbih0YXNrKSxcblx0XHRcdGtpbmQsXG5cdFx0XHR0ZXJtaW5hbElkLFxuXHRcdH07XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gcHJvYmxlbU1hdGNoZXJFbmRlZCh0YXNrOiBUYXNrLCBoYXNFcnJvcnM6IGJvb2xlYW4sIHRlcm1pbmFsSWQ/OiBudW1iZXIpOiBJVGFza1Byb2JsZW1NYXRjaGVyRW5kZWRFdmVudCB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNvbW1vbih0YXNrKSxcblx0XHRcdGtpbmQ6IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJFbmRlZCxcblx0XHRcdGhhc0Vycm9ycyxcblx0XHR9O1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGNoYW5nZWQoKTogSVRhc2tDaGFuZ2VkRXZlbnQge1xuXHRcdHJldHVybiB7IGtpbmQ6IFRhc2tFdmVudEtpbmQuQ2hhbmdlZCB9O1xuXHR9XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgS2V5ZWRUYXNrSWRlbnRpZmllciB7XG5cdGZ1bmN0aW9uIHNvcnRlZFN0cmluZ2lmeShsaXRlcmFsOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHN0cmluZyB7XG5cdFx0Y29uc3Qga2V5cyA9IE9iamVjdC5rZXlzKGxpdGVyYWwpLnNvcnQoKTtcblx0XHRsZXQgcmVzdWx0OiBzdHJpbmcgPSAnJztcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRsZXQgc3RyaW5naWZpZWQgPSBsaXRlcmFsW2tleV07XG5cdFx0XHRpZiAoc3RyaW5naWZpZWQgaW5zdGFuY2VvZiBPYmplY3QpIHtcblx0XHRcdFx0c3RyaW5naWZpZWQgPSBzb3J0ZWRTdHJpbmdpZnkoc3RyaW5naWZpZWQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2Ygc3RyaW5naWZpZWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHN0cmluZ2lmaWVkID0gc3RyaW5naWZpZWQucmVwbGFjZSgvLC9nLCAnLCwnKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdCArPSBrZXkgKyAnLCcgKyBzdHJpbmdpZmllZCArICcsJztcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXHRleHBvcnQgZnVuY3Rpb24gY3JlYXRlKHZhbHVlOiBJVGFza0lkZW50aWZpZXIpOiBLZXllZFRhc2tJZGVudGlmaWVyIHtcblx0XHRjb25zdCByZXN1bHRLZXkgPSBzb3J0ZWRTdHJpbmdpZnkodmFsdWUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHsgX2tleTogcmVzdWx0S2V5LCB0eXBlOiB2YWx1ZS50YXNrVHlwZSBhcyBzdHJpbmcgfTtcblx0XHRPYmplY3QuYXNzaWduKHJlc3VsdCwgdmFsdWUpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVGFza1NldHRpbmdJZCB7XG5cdEF1dG9EZXRlY3QgPSAndGFzay5hdXRvRGV0ZWN0Jyxcblx0U2F2ZUJlZm9yZVJ1biA9ICd0YXNrLnNhdmVCZWZvcmVSdW4nLFxuXHRTaG93RGVjb3JhdGlvbnMgPSAndGFzay5zaG93RGVjb3JhdGlvbnMnLFxuXHRQcm9ibGVtTWF0Y2hlcnNOZXZlclByb21wdCA9ICd0YXNrLnByb2JsZW1NYXRjaGVycy5uZXZlclByb21wdCcsXG5cdFNsb3dQcm92aWRlcldhcm5pbmcgPSAndGFzay5zbG93UHJvdmlkZXJXYXJuaW5nJyxcblx0UXVpY2tPcGVuSGlzdG9yeSA9ICd0YXNrLnF1aWNrT3Blbi5oaXN0b3J5Jyxcblx0UXVpY2tPcGVuRGV0YWlsID0gJ3Rhc2sucXVpY2tPcGVuLmRldGFpbCcsXG5cdFF1aWNrT3BlblNraXAgPSAndGFzay5xdWlja09wZW4uc2tpcCcsXG5cdFF1aWNrT3BlblNob3dBbGwgPSAndGFzay5xdWlja09wZW4uc2hvd0FsbCcsXG5cdEFsbG93QXV0b21hdGljVGFza3MgPSAndGFzay5hbGxvd0F1dG9tYXRpY1Rhc2tzJyxcblx0UmVjb25uZWN0aW9uID0gJ3Rhc2sucmVjb25uZWN0aW9uJyxcblx0VmVyYm9zZUxvZ2dpbmcgPSAndGFzay52ZXJib3NlTG9nZ2luZycsXG5cdE5vdGlmeVdpbmRvd09uVGFza0NvbXBsZXRpb24gPSAndGFzay5ub3RpZnlXaW5kb3dPblRhc2tDb21wbGV0aW9uJ1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBUYXNrc1NjaGVtYVByb3BlcnRpZXMge1xuXHRUYXNrcyA9ICd0YXNrcycsXG5cdFN1cHByZXNzVGFza05hbWUgPSAndGFza3Muc3VwcHJlc3NUYXNrTmFtZScsXG5cdFdpbmRvd3MgPSAndGFza3Mud2luZG93cycsXG5cdE9zeCA9ICd0YXNrcy5vc3gnLFxuXHRMaW51eCA9ICd0YXNrcy5saW51eCcsXG5cdFNob3dPdXRwdXQgPSAndGFza3Muc2hvd091dHB1dCcsXG5cdElzU2hlbGxDb21tYW5kID0gJ3Rhc2tzLmlzU2hlbGxDb21tYW5kJyxcblx0U2VydmljZVRlc3RTZXR0aW5nID0gJ3Rhc2tzLnNlcnZpY2UudGVzdFNldHRpbmcnLFxufVxuXG5leHBvcnQgbmFtZXNwYWNlIFRhc2tEZWZpbml0aW9uIHtcblx0ZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVRhc2tJZGVudGlmaWVyKGV4dGVybmFsOiBJVGFza0lkZW50aWZpZXIsIHJlcG9ydGVyOiB7IGVycm9yKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQgfSk6IEtleWVkVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRlZmluaXRpb24gPSBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmdldChleHRlcm5hbC50eXBlKTtcblx0XHRpZiAoZGVmaW5pdGlvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBXZSBoYXZlIG5vIHRhc2sgZGVmaW5pdGlvbiBzbyB3ZSBjYW4ndCBzYW5pdGl6ZSB0aGUgbGl0ZXJhbC4gVGFrZSBpdCBhcyBpc1xuXHRcdFx0Y29uc3QgY29weSA9IE9iamVjdHMuZGVlcENsb25lKGV4dGVybmFsKTtcblx0XHRcdGRlbGV0ZSBjb3B5Ll9rZXk7XG5cdFx0XHRyZXR1cm4gS2V5ZWRUYXNrSWRlbnRpZmllci5jcmVhdGUoY29weSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGl0ZXJhbDogeyB0eXBlOiBzdHJpbmc7W25hbWU6IHN0cmluZ106IHVua25vd24gfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0bGl0ZXJhbC50eXBlID0gZGVmaW5pdGlvbi50YXNrVHlwZTtcblx0XHRjb25zdCByZXF1aXJlZDogU2V0PHN0cmluZz4gPSBuZXcgU2V0KCk7XG5cdFx0ZGVmaW5pdGlvbi5yZXF1aXJlZC5mb3JFYWNoKGVsZW1lbnQgPT4gcmVxdWlyZWQuYWRkKGVsZW1lbnQpKTtcblxuXHRcdGNvbnN0IHByb3BlcnRpZXMgPSBkZWZpbml0aW9uLnByb3BlcnRpZXM7XG5cdFx0Zm9yIChjb25zdCBwcm9wZXJ0eSBvZiBPYmplY3Qua2V5cyhwcm9wZXJ0aWVzKSkge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBleHRlcm5hbFtwcm9wZXJ0eV07XG5cdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRsaXRlcmFsW3Byb3BlcnR5XSA9IHZhbHVlO1xuXHRcdFx0fSBlbHNlIGlmIChyZXF1aXJlZC5oYXMocHJvcGVydHkpKSB7XG5cdFx0XHRcdGNvbnN0IHNjaGVtYSA9IHByb3BlcnRpZXNbcHJvcGVydHldO1xuXHRcdFx0XHRpZiAoc2NoZW1hLmRlZmF1bHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGxpdGVyYWxbcHJvcGVydHldID0gT2JqZWN0cy5kZWVwQ2xvbmUoc2NoZW1hLmRlZmF1bHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN3aXRjaCAoc2NoZW1hLnR5cGUpIHtcblx0XHRcdFx0XHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0XHRcdFx0XHRsaXRlcmFsW3Byb3BlcnR5XSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRcdFx0XHRjYXNlICdpbnRlZ2VyJzpcblx0XHRcdFx0XHRcdFx0bGl0ZXJhbFtwcm9wZXJ0eV0gPSAwO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdGNhc2UgJ3N0cmluZyc6XG5cdFx0XHRcdFx0XHRcdGxpdGVyYWxbcHJvcGVydHldID0gJyc7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdFx0cmVwb3J0ZXIuZXJyb3IobmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdCdUYXNrRGVmaW5pdGlvbi5taXNzaW5nUmVxdWlyZWRQcm9wZXJ0eScsXG5cdFx0XHRcdFx0XHRcdFx0J0Vycm9yOiB0aGUgdGFzayBpZGVudGlmaWVyIFxcJ3swfVxcJyBpcyBtaXNzaW5nIHRoZSByZXF1aXJlZCBwcm9wZXJ0eSBcXCd7MX1cXCcuIFRoZSB0YXNrIGlkZW50aWZpZXIgd2lsbCBiZSBpZ25vcmVkLicsIEpTT04uc3RyaW5naWZ5KGV4dGVybmFsLCB1bmRlZmluZWQsIDApLCBwcm9wZXJ0eVxuXHRcdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIEtleWVkVGFza0lkZW50aWZpZXIuY3JlYXRlKGxpdGVyYWwpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCByZXJ1blRhc2tJY29uID0gcmVnaXN0ZXJJY29uKCdyZXJ1bi10YXNrJywgQ29kaWNvbi5yZWZyZXNoLCBubHMubG9jYWxpemUoJ3JlcnVuVGFza0ljb24nLCAnVmlldyBpY29uIG9mIHRoZSByZXJ1biB0YXNrLicpKTtcbmV4cG9ydCBjb25zdCBSZXJ1bkZvckFjdGl2ZVRlcm1pbmFsQ29tbWFuZElkID0gJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVydW5Gb3JBY3RpdmVUZXJtaW5hbCc7XG5leHBvcnQgY29uc3QgUmVydW5BbGxSdW5uaW5nVGFza3NDb21tYW5kSWQgPSAnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZXJ1bkFsbFJ1bm5pbmdUYXNrcyc7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksZUFBZTtBQUUzQixZQUFZLGFBQWE7QUFLekIsU0FBUyxxQkFBMkM7QUFDcEQsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsb0JBQW9CO0FBSXRCLE1BQU0sdUJBQXVCO0FBRTdCLE1BQU0scUJBQXFCLElBQUksY0FBdUIsZUFBZSxPQUFPLElBQUksU0FBUyw0QkFBNEIsc0NBQXNDLENBQUM7QUFFNUosTUFBTSx1QkFBdUIsSUFBSSxjQUF1QixzQkFBc0IsT0FBTyxJQUFJLFNBQVMsc0JBQXNCLGlEQUFpRCxDQUFDO0FBQzFLLE1BQU0saUJBQWlCLElBQUksVUFBVSxpQkFBaUIsT0FBTztBQUU3RCxJQUFLLGVBQUwsa0JBQUtBLGtCQUFMO0FBSU4sRUFBQUEsNEJBQUEsWUFBUyxLQUFUO0FBS0EsRUFBQUEsNEJBQUEsWUFBUyxLQUFUO0FBS0EsRUFBQUEsNEJBQUEsVUFBTyxLQUFQO0FBZFcsU0FBQUE7QUFBQSxHQUFBO0FBaUJMLE1BQU0sdUJBQXVCO0FBQUEsQ0FFN0IsQ0FBVUEsa0JBQVY7QUFDQyxXQUFTLEtBQWlCLE9BQTZCO0FBQzdELFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFDQSxZQUFRLE1BQU0sWUFBWSxHQUFHO0FBQUEsTUFDNUIsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSLEtBQUs7QUFDSixlQUFPO0FBQUEsTUFDUixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1I7QUFDQyxlQUFPO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFkTyxFQUFBQSxjQUFTO0FBQUEsR0FEQTtBQTJFVixJQUFVO0FBQUEsQ0FBVixDQUFVQyxvQkFBVjtBQUNDLEVBQU1BLGdCQUFBLFdBQTJCLEVBQUUsS0FBSyxxQkFBcUI7QUFBQSxHQURwRDtBQUlWLElBQUssYUFBTCxrQkFBS0MsZ0JBQUw7QUFJTixFQUFBQSx3QkFBQSxZQUFTLEtBQVQ7QUFRQSxFQUFBQSx3QkFBQSxZQUFTLEtBQVQ7QUFLQSxFQUFBQSx3QkFBQSxXQUFRLEtBQVI7QUFqQlcsU0FBQUE7QUFBQSxHQUFBO0FBQUEsQ0FvQkwsQ0FBVUEsZ0JBQVY7QUFDQyxXQUFTLFdBQXVCLE9BQTJCO0FBQ2pFLFlBQVEsTUFBTSxZQUFZLEdBQUc7QUFBQSxNQUM1QixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSLEtBQUs7QUFDSixlQUFPO0FBQUEsTUFDUjtBQUNDLGVBQU87QUFBQSxJQUNUO0FBQUEsRUFDRDtBQVhPLEVBQUFBLFlBQVM7QUFBQSxHQURBO0FBZVYsSUFBSyxvQkFBTCxrQkFBS0MsdUJBQUw7QUFJTixFQUFBQSxzQ0FBQSxXQUFRLEtBQVI7QUFNQSxFQUFBQSxzQ0FBQSxlQUFZLEtBQVo7QUFLQSxFQUFBQSxzQ0FBQSxZQUFTLEtBQVQ7QUFmVyxTQUFBQTtBQUFBLEdBQUE7QUFBQSxDQWtCTCxDQUFVQSx1QkFBVjtBQUNDLFdBQVMsV0FBdUIsT0FBa0M7QUFDeEUsWUFBUSxNQUFNLFlBQVksR0FBRztBQUFBLE1BQzVCLEtBQUs7QUFDSixlQUFPO0FBQUEsTUFDUixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBWE8sRUFBQUEsbUJBQVM7QUFBQSxHQURBO0FBZVYsSUFBSyxZQUFMLGtCQUFLQyxlQUFMO0FBS04sRUFBQUEsc0JBQUEsWUFBUyxLQUFUO0FBTUEsRUFBQUEsc0JBQUEsZUFBWSxLQUFaO0FBS0EsRUFBQUEsc0JBQUEsU0FBTSxLQUFOO0FBaEJXLFNBQUFBO0FBQUEsR0FBQTtBQUFBLENBbUJMLENBQVVBLGVBQVY7QUFDQyxXQUFTLFdBQVcsT0FBMEI7QUFDcEQsWUFBUSxNQUFNLFlBQVksR0FBRztBQUFBLE1BQzVCLEtBQUs7QUFDSixlQUFPO0FBQUEsTUFDUixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBWE8sRUFBQUEsV0FBUztBQUFBLEdBREE7QUF3RVYsSUFBVTtBQUFBLENBQVYsQ0FBVUMseUJBQVY7QUFDQyxFQUFNQSxxQkFBQSxXQUFpQztBQUFBLElBQzdDLE1BQU07QUFBQSxJQUFNLFFBQVE7QUFBQSxJQUFtQixnQkFBZ0I7QUFBQSxJQUF5QixPQUFPO0FBQUEsSUFBTyxPQUFPO0FBQUEsSUFBa0Isa0JBQWtCO0FBQUEsSUFBTSxPQUFPO0FBQUEsSUFBTyxzQkFBc0I7QUFBQSxFQUNwTDtBQUFBLEdBSGdCO0FBTVYsSUFBSyxjQUFMLGtCQUFLQyxpQkFBTDtBQUNOLEVBQUFBLDBCQUFBLFdBQVEsS0FBUjtBQUNBLEVBQUFBLDBCQUFBLGFBQVUsS0FBVjtBQUNBLEVBQUFBLDBCQUFBLHFCQUFrQixLQUFsQjtBQUhXLFNBQUFBO0FBQUEsR0FBQTtBQUFBLENBTUwsQ0FBVUEsaUJBQVY7QUFDQyxXQUFTLFdBQVcsT0FBNEI7QUFDdEQsWUFBUSxNQUFNLFlBQVksR0FBRztBQUFBLE1BQzVCLEtBQUs7QUFDSixlQUFPO0FBQUEsTUFDUixLQUFLO0FBQ0osZUFBTztBQUFBLE1BQ1IsS0FBSztBQUNKLGVBQU87QUFBQSxNQUNSO0FBQ0MsZUFBTztBQUFBLElBQ1Q7QUFBQSxFQUNEO0FBWE8sRUFBQUEsYUFBUztBQVlULFdBQVMsU0FBUyxPQUE0QjtBQUNwRCxZQUFRLE9BQU87QUFBQSxNQUNkLEtBQUs7QUFBbUIsZUFBTztBQUFBLE1BQy9CLEtBQUs7QUFBcUIsZUFBTztBQUFBLE1BQ2pDLEtBQUs7QUFBNkIsZUFBTztBQUFBLE1BQ3pDO0FBQVMsZUFBTztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQVBPLEVBQUFBLGFBQVM7QUFBQSxHQWJBO0FBOEJWLElBQVU7QUFBQSxDQUFWLENBQVVDLG1CQUFWO0FBQ0MsV0FBUyxNQUFNQyxRQUE4QjtBQUNuRCxRQUFJLE1BQU0sU0FBU0EsTUFBSyxHQUFHO0FBQzFCLGFBQU9BO0FBQUEsSUFDUixPQUFPO0FBQ04sYUFBT0EsT0FBTTtBQUFBLElBQ2Q7QUFBQSxFQUNEO0FBTk8sRUFBQUQsZUFBUztBQUFBLEdBREE7QUFpRFYsSUFBVTtBQUFBLENBQVYsQ0FBVUUsZUFBVjtBQUNDLEVBQU1BLFdBQUEsUUFBbUIsRUFBRSxLQUFLLFNBQVMsV0FBVyxNQUFNO0FBRTFELEVBQU1BLFdBQUEsUUFBbUIsRUFBRSxLQUFLLFNBQVMsV0FBVyxNQUFNO0FBRTFELEVBQU1BLFdBQUEsVUFBcUIsRUFBRSxLQUFLLFdBQVcsV0FBVyxNQUFNO0FBRTlELEVBQU1BLFdBQUEsT0FBa0IsRUFBRSxLQUFLLFFBQVEsV0FBVyxNQUFNO0FBRXhELFdBQVMsR0FBRyxPQUFpQztBQUNuRCxXQUFPLFVBQVVBLFdBQUEsTUFBTSxPQUFPLFVBQVVBLFdBQUEsTUFBTSxPQUFPLFVBQVVBLFdBQUEsUUFBUSxPQUFPLFVBQVVBLFdBQUEsS0FBSztBQUFBLEVBQzlGO0FBRk8sRUFBQUEsV0FBUztBQUlULFdBQVMsS0FBSyxPQUE4RDtBQUNsRixRQUFJLFVBQVUsUUFBVztBQUN4QixhQUFPO0FBQUEsSUFDUixXQUFXLE1BQU0sU0FBUyxLQUFLLEdBQUc7QUFDakMsVUFBSSxHQUFHLEtBQUssR0FBRztBQUNkLGVBQU8sRUFBRSxLQUFLLE9BQU8sV0FBVyxNQUFNO0FBQUEsTUFDdkM7QUFDQSxhQUFPO0FBQUEsSUFDUixPQUFPO0FBQ04sYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBWE8sRUFBQUEsV0FBUztBQUFBLEdBYkE7QUFnQ1YsSUFBVyxZQUFYLGtCQUFXQyxlQUFYO0FBQ04sRUFBQUEsc0JBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsc0JBQUEsZUFBWSxLQUFaO0FBQ0EsRUFBQUEsc0JBQUEsWUFBUyxLQUFUO0FBSGlCLFNBQUFBO0FBQUEsR0FBQTtBQU1YLElBQVU7QUFBQSxDQUFWLENBQVVDLG9CQUFWO0FBQ0MsRUFBTUEsZ0JBQUEsWUFBeUI7QUFDL0IsRUFBTUEsZ0JBQUEsWUFBeUI7QUFDL0IsRUFBTUEsZ0JBQUEsV0FBdUI7QUFDN0IsRUFBTUEsZ0JBQUEsZ0JBQWlDO0FBQ3ZDLEVBQU1BLGdCQUFBLE9BQWU7QUFFckIsV0FBUyxzQkFBc0IsTUFBbUM7QUFDeEUsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLQSxnQkFBZTtBQUFNLGVBQU8sb0JBQW9CO0FBQUEsTUFDckQsS0FBS0EsZ0JBQWU7QUFBZSxlQUFPLG9CQUFvQjtBQUFBLE1BQzlEO0FBQVMsZUFBTyxvQkFBb0I7QUFBQSxJQUNyQztBQUFBLEVBQ0Q7QUFOTyxFQUFBQSxnQkFBUztBQUFBLEdBUEE7QUEyRlYsSUFBVyxlQUFYLGtCQUFXQyxrQkFBWDtBQUNOLEVBQUFBLGNBQUEsY0FBVztBQUNYLEVBQUFBLGNBQUEsY0FBVztBQUZNLFNBQUFBO0FBQUEsR0FBQTtBQThFWCxJQUFLLGVBQUwsa0JBQUtDLGtCQUFMO0FBQ04sRUFBQUEsNEJBQUEsYUFBVSxLQUFWO0FBQ0EsRUFBQUEsNEJBQUEsZ0JBQWEsS0FBYjtBQUNBLEVBQUFBLDRCQUFBLHFCQUFrQixLQUFsQjtBQUhXLFNBQUFBO0FBQUEsR0FBQTtBQU1MLElBQVcsaUJBQVgsa0JBQVdDLG9CQUFYO0FBQ04sRUFBQUEsZ0JBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLGdCQUFBLHFCQUFrQjtBQUNsQixFQUFBQSxnQkFBQSxZQUFTO0FBQ1QsRUFBQUEsZ0JBQUEsVUFBTztBQUNQLEVBQUFBLGdCQUFBLFlBQVM7QUFMUSxTQUFBQTtBQUFBLEdBQUE7QUFlWCxJQUFVO0FBQUEsQ0FBVixDQUFVQyxnQkFBVjtBQUNDLEVBQU1BLFlBQUEsV0FBd0IsRUFBRSxtQkFBbUIsTUFBTSxPQUFPLGlCQUFzQixlQUFlLEdBQUcsZ0JBQWdCLHNCQUFzQjtBQUFBLEdBRHJJO0FBSVYsTUFBZSxXQUFXO0FBQUEsRUFzQnRCLFlBQVksSUFBWSxPQUEyQixNQUEwQixZQUN0Rix5QkFBbUQsUUFBeUI7QUFiN0U7QUFBQTtBQUFBO0FBQUEsa0JBQWlCO0FBY2hCLFNBQUssTUFBTTtBQUNYLFFBQUksT0FBTztBQUNWLFdBQUssU0FBUztBQUFBLElBQ2Y7QUFDQSxRQUFJLE1BQU07QUFDVCxXQUFLLE9BQU87QUFBQSxJQUNiO0FBQ0EsU0FBSyxhQUFhO0FBQ2xCLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssVUFBVTtBQUFBLEVBQ2hCO0FBQUEsRUFFTyxjQUFjLFdBQXNEO0FBQzFFLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxZQUFvQjtBQUMxQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFTyxTQUE2QjtBQUNuQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBSU8sa0JBQTBCO0FBTWhDLFVBQU0sTUFBc0IsRUFBRSxRQUFRLEtBQUssWUFBWSxHQUFHLElBQUksS0FBSyxJQUFJO0FBQ3ZFLFdBQU8sS0FBSyxVQUFVLEdBQUc7QUFBQSxFQUMxQjtBQUFBLEVBRU8sUUFBYztBQUNwQixXQUFPLEtBQUssV0FBVyxPQUFPLE9BQU8sQ0FBQyxHQUFHLElBQTBDLENBQUM7QUFBQSxFQUNyRjtBQUFBLEVBSU8scUJBQW1EO0FBQ3pELFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyx1QkFBMkM7QUFDakQsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVPLG1CQUEyQjtBQUNqQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRU8sUUFBUSxLQUErQyxZQUFxQixPQUFnQjtBQUNsRyxRQUFJLFFBQVEsUUFBVztBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksTUFBTSxTQUFTLEdBQUcsR0FBRztBQUN4QixhQUFPLFFBQVEsS0FBSyxVQUFVLFFBQVEsS0FBSyx3QkFBd0IsY0FBZSxhQUFhLFFBQVEsS0FBSztBQUFBLElBQzdHO0FBQ0EsVUFBTSxhQUFhLEtBQUssY0FBYyxJQUFJO0FBQzFDLFdBQU8sZUFBZSxVQUFhLFdBQVcsU0FBUyxJQUFJO0FBQUEsRUFDNUQ7QUFBQSxFQUVPLG9CQUE0QjtBQUNsQyxVQUFNLGtCQUFrQixLQUFLLG1CQUFtQjtBQUNoRCxRQUFJLGlCQUFpQjtBQUNwQixhQUFPLEdBQUcsS0FBSyxNQUFNLEtBQUssZ0JBQWdCLElBQUk7QUFBQSxJQUMvQyxPQUFPO0FBQ04sYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVPLG1CQUFtQztBQUN6QyxVQUFNLFNBQXlCO0FBQUEsTUFDOUIsSUFBSSxLQUFLO0FBQUEsTUFDVCxNQUFNO0FBQUEsSUFDUDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFTyxvQkFBb0IsVUFBZ0M7QUFDMUQsUUFBSSxLQUFLLHNCQUFzQixRQUFXO0FBQ3pDLFdBQUssb0JBQW9CLENBQUM7QUFBQSxJQUMzQjtBQUNBLFFBQUksVUFBVTtBQUNiLFdBQUssb0JBQW9CLEtBQUssa0JBQWtCLE9BQU8sUUFBUTtBQUFBLElBQ2hFO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxtQkFBeUM7QUFDNUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUNEO0FBUU8sTUFBTSxtQkFBbUIsV0FBVztBQUFBLEVBa0JuQyxZQUFZLElBQVksUUFBNkIsT0FBZSxNQUFjLFNBQ3hGLG9CQUE2QixZQUF5Qix5QkFBbUQ7QUFDekcsVUFBTSxJQUFJLE9BQU8sUUFBVyxZQUFZLHlCQUF5QixNQUFNO0FBSnhFO0FBQUE7QUFBQTtBQUFBLG1CQUFpQyxDQUFDO0FBS2pDLFNBQUssVUFBVTtBQUNmLFNBQUsscUJBQXFCO0FBQzFCLFFBQUksU0FBUztBQUNaLFdBQUssVUFBVTtBQUFBLElBQ2hCO0FBQUEsRUFDRDtBQUFBLEVBRWdCLFFBQW9CO0FBQ25DLFdBQU8sSUFBSSxXQUFXLEtBQUssS0FBSyxLQUFLLFNBQVMsS0FBSyxRQUFRLEtBQUssTUFBTSxLQUFLLFNBQVMsS0FBSyxvQkFBb0IsS0FBSyxZQUFZLEtBQUssdUJBQXVCO0FBQUEsRUFDM0o7QUFBQSxFQUVPLGFBQThDO0FBQ3BELFFBQUksS0FBSyxXQUFXLEtBQUssUUFBUSxZQUFZO0FBQzVDLGFBQU8sS0FBSyxRQUFRO0FBQUEsSUFDckI7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRWdCLGNBQWMsWUFBcUIsT0FBNEI7QUFDOUUsUUFBSSxhQUFhLEtBQUssUUFBUSxlQUFlLFFBQVc7QUFDdkQsYUFBTyxLQUFLLFFBQVE7QUFBQSxJQUNyQixPQUFPO0FBQ04sVUFBSTtBQUNKLFlBQU0saUJBQWlCLEtBQUssVUFBVSxLQUFLLFFBQVEsVUFBVTtBQUM3RCxjQUFRLGdCQUFnQjtBQUFBLFFBQ3ZCLEtBQUs7QUFDSixpQkFBTztBQUNQO0FBQUEsUUFFRCxLQUFLO0FBQ0osaUJBQU87QUFDUDtBQUFBLFFBRUQsS0FBSztBQUNKLGlCQUFPO0FBQ1A7QUFBQSxRQUVELEtBQUs7QUFDSixpQkFBTztBQUNQO0FBQUEsUUFFRDtBQUNDLGdCQUFNLElBQUksTUFBTSx5QkFBeUI7QUFBQSxNQUMzQztBQUVBLFlBQU0sU0FBOEI7QUFBQSxRQUNuQztBQUFBLFFBQ0EsTUFBTSxLQUFLO0FBQUEsUUFDWCxJQUFJLEtBQUs7QUFBQSxNQUNWO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFjLEdBQUcsT0FBcUM7QUFDckQsV0FBTyxpQkFBaUI7QUFBQSxFQUN6QjtBQUFBLEVBRWdCLFlBQW9CO0FBQ25DLFVBQU0sa0JBQWtCLEtBQUssUUFBUSxPQUFPO0FBQzVDLFdBQU8sa0JBQWtCLEdBQUcsZ0JBQWdCLElBQUksU0FBUyxDQUFDLElBQUksS0FBSyxHQUFHLElBQUksS0FBSyxRQUFRLEtBQUssR0FBRyxLQUFLLEdBQUcsSUFBSSxLQUFLLFFBQVE7QUFBQSxFQUN6SDtBQUFBLEVBRVUsY0FBa0M7QUFDM0MsV0FBTyxLQUFLLFFBQVEsU0FBUyxlQUFlLE9BQU8sdUJBQXVCLEtBQUssUUFBUSxPQUFPLGlCQUFpQixJQUFJLFNBQVM7QUFBQSxFQUM3SDtBQUFBLEVBRWdCLGtCQUEwQjtBQUN6QyxXQUFPLEtBQUssUUFBUSxhQUFhLE1BQU0sZ0JBQWdCLElBQUssS0FBSyxPQUFPLEtBQUssTUFBTSxnQkFBZ0I7QUFBQSxFQUNwRztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS2dCLFNBQTZCO0FBTTVDLFVBQU0sa0JBQWtCLEtBQUssWUFBWTtBQUN6QyxRQUFJLENBQUMsaUJBQWlCO0FBQ3JCLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxLQUFhLEtBQUssd0JBQXdCO0FBQzlDLFFBQUksS0FBSyxRQUFRLFNBQVMsZUFBZSxXQUFXO0FBQ25ELFlBQU0sS0FBSyxRQUFRO0FBQUEsSUFDcEI7QUFDQSxVQUFNLE1BQWtCLEVBQUUsTUFBTSxzQkFBc0IsUUFBUSxpQkFBaUIsR0FBRztBQUNsRixXQUFPLEtBQUssVUFBVSxHQUFHO0FBQUEsRUFDMUI7QUFBQSxFQUVnQixxQkFBbUQ7QUFDbEUsV0FBTyxLQUFLLFFBQVEsT0FBTztBQUFBLEVBQzVCO0FBQUEsRUFFZ0IsdUJBQTJDO0FBQzFELFdBQVEsS0FBSyxRQUFRLE9BQU8sYUFBYSxLQUFLLFFBQVEsT0FBTyxVQUFVLGdCQUFpQixVQUFVLFNBQVMsS0FBSyxRQUFRLE9BQU8sVUFBVSxhQUFhLElBQUk7QUFBQSxFQUMzSjtBQUFBLEVBRWdCLG1CQUEyQjtBQUMxQyxRQUFJLEtBQUssUUFBUSxZQUFZO0FBQzVCLGFBQU87QUFBQSxJQUNSLE9BQU87QUFDTixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVVLFdBQVcsUUFBNkM7QUFDakUsVUFBTSxNQUFNO0FBQ1osV0FBTyxJQUFJLFdBQVcsSUFBSSxLQUFLLElBQUksU0FBUyxJQUFJLFFBQVEsSUFBSSxNQUFNLElBQUksU0FBUyxJQUFJLG9CQUFvQixJQUFJLFlBQVksSUFBSSx1QkFBdUI7QUFBQSxFQUNuSjtBQUNEO0FBT08sTUFBTSx3QkFBd0IsV0FBVztBQUFBLEVBU3hDLFlBQVksSUFBWSxRQUE2QixPQUEyQixNQUN0RixZQUFpQyxZQUF5Qix5QkFBbUQ7QUFDN0csVUFBTSxJQUFJLE9BQU8sTUFBTSxZQUFZLHlCQUF5QixNQUFNO0FBQ2xFLFNBQUssVUFBVTtBQUNmLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFQSxPQUFjLEdBQUcsT0FBMEM7QUFDMUQsV0FBTyxpQkFBaUI7QUFBQSxFQUN6QjtBQUFBLEVBRVUsV0FBVyxRQUF1QztBQUMzRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRWdCLGdCQUFxQztBQUNwRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFZ0IsdUJBQTJDO0FBQzFELFdBQVEsS0FBSyxRQUFRLE9BQU8sYUFBYSxLQUFLLFFBQVEsT0FBTyxVQUFVLGdCQUFpQixVQUFVLFNBQVMsS0FBSyxRQUFRLE9BQU8sVUFBVSxhQUFhLElBQUk7QUFBQSxFQUMzSjtBQUFBLEVBRWdCLHFCQUFtRDtBQUNsRSxXQUFPLEtBQUssUUFBUSxPQUFPO0FBQUEsRUFDNUI7QUFBQSxFQUVVLGNBQWtDO0FBQzNDLFdBQU8sS0FBSyxRQUFRLFNBQVMsZUFBZSxPQUFPLHVCQUF1QixLQUFLLFFBQVEsT0FBTyxpQkFBaUIsSUFBSSxTQUFTO0FBQUEsRUFDN0g7QUFBQSxFQUVnQixTQUE2QjtBQU01QyxVQUFNLGtCQUFrQixLQUFLLFlBQVk7QUFDekMsUUFBSSxDQUFDLGlCQUFpQjtBQUNyQixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksS0FBYSxLQUFLLHdCQUF3QjtBQUM5QyxRQUFJLEtBQUssUUFBUSxTQUFTLGVBQWUsV0FBVztBQUNuRCxZQUFNLEtBQUssUUFBUTtBQUFBLElBQ3BCO0FBQ0EsVUFBTSxNQUFrQixFQUFFLE1BQU0sc0JBQXNCLFFBQVEsaUJBQWlCLEdBQUc7QUFDbEYsV0FBTyxLQUFLLFVBQVUsR0FBRztBQUFBLEVBQzFCO0FBQ0Q7QUFLTyxNQUFNLHdCQUF3QixXQUFXO0FBQUEsRUE2QnhDLFlBQVksSUFBWSxRQUE4QixPQUFlLE1BQTBCLFNBQ3JHLFNBQWdDLG9CQUE2QixZQUM3RCx5QkFBbUQ7QUFDbkQsVUFBTSxJQUFJLE9BQU8sTUFBTSxZQUFZLHlCQUF5QixNQUFNO0FBQ2xFLFNBQUssVUFBVTtBQUNmLFNBQUsscUJBQXFCO0FBQzFCLFNBQUssVUFBVTtBQUNmLFNBQUssT0FBTyx3QkFBd0I7QUFDcEMsU0FBSyxPQUFPLHdCQUF3QjtBQUFBLEVBQ3JDO0FBQUEsRUFFZ0IsUUFBeUI7QUFDeEMsV0FBTyxJQUFJLGdCQUFnQixLQUFLLEtBQUssS0FBSyxTQUFTLEtBQUssUUFBUSxLQUFLLE1BQU0sS0FBSyxTQUFTLEtBQUssU0FBUyxLQUFLLG9CQUFvQixLQUFLLFlBQVksS0FBSyx1QkFBdUI7QUFBQSxFQUM5SztBQUFBLEVBRWdCLGdCQUFxQztBQUNwRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxPQUFjLEdBQUcsT0FBMEM7QUFDMUQsV0FBTyxpQkFBaUI7QUFBQSxFQUN6QjtBQUFBLEVBRWdCLFlBQW9CO0FBQ25DLFVBQU0sa0JBQWtCLEtBQUssUUFBUTtBQUNyQyxXQUFPLGtCQUNKLEdBQUcsS0FBSyxRQUFRLE1BQU0sU0FBUyxDQUFDLElBQUksZ0JBQWdCLElBQUksU0FBUyxDQUFDLElBQUksS0FBSyxHQUFHLElBQUksS0FBSyxRQUFRLEtBQy9GLEdBQUcsS0FBSyxRQUFRLE1BQU0sU0FBUyxDQUFDLElBQUksS0FBSyxHQUFHLElBQUksS0FBSyxRQUFRO0FBQUEsRUFDakU7QUFBQSxFQUVVLGNBQWtDO0FBQzNDLFFBQUksS0FBSyxRQUFRLFVBQVUsa0JBQW9CLEtBQUssUUFBUSxpQkFBaUI7QUFDNUUsYUFBTyxLQUFLLFFBQVEsZ0JBQWdCLElBQUksU0FBUztBQUFBLElBQ2xEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVnQixTQUE2QjtBQVE1QyxVQUFNLE1BQXVCLEVBQUUsTUFBTSxlQUFlLE9BQU8sS0FBSyxRQUFRLE9BQU8sSUFBSSxLQUFLLElBQUk7QUFDNUYsUUFBSSxTQUFTLEtBQUssWUFBWTtBQUM5QixXQUFPLEtBQUssVUFBVSxHQUFHO0FBQUEsRUFDMUI7QUFBQSxFQUVnQixxQkFBbUQ7QUFDbEUsV0FBTyxLQUFLLFFBQVE7QUFBQSxFQUNyQjtBQUFBLEVBRWdCLG1CQUEyQjtBQUMxQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVUsV0FBVyxRQUFrRDtBQUN0RSxVQUFNLE1BQU07QUFDWixXQUFPLElBQUksZ0JBQWdCLElBQUksS0FBSyxJQUFJLFNBQVMsSUFBSSxRQUFRLElBQUksTUFBTSxJQUFJLFNBQVMsSUFBSSxTQUFTLElBQUksb0JBQW9CLElBQUksWUFBWSxJQUFJLHVCQUF1QjtBQUFBLEVBQ3JLO0FBQ0Q7QUFFTyxNQUFNLHFCQUFxQixXQUFXO0FBQUEsRUFVckMsWUFBWSxJQUFZLFFBQTZCLE9BQWUsTUFDMUUsWUFBeUIseUJBQW1EO0FBQzVFLFVBQU0sSUFBSSxPQUFPLE1BQU0sWUFBWSx5QkFBeUIsTUFBTTtBQUNsRSxTQUFLLFVBQVU7QUFBQSxFQUNoQjtBQUFBLEVBRWdCLFFBQXNCO0FBQ3JDLFdBQU8sSUFBSSxhQUFhLEtBQUssS0FBSyxLQUFLLFNBQVMsS0FBSyxRQUFRLEtBQUssTUFBTSxLQUFLLFlBQVksS0FBSyx1QkFBdUI7QUFBQSxFQUN0SDtBQUFBLEVBRUEsT0FBYyxHQUFHLE9BQXVDO0FBQ3ZELFdBQU8saUJBQWlCO0FBQUEsRUFDekI7QUFBQSxFQUVnQixtQkFBMkI7QUFDMUMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVnQixZQUFvQjtBQUNuQyxXQUFPLEdBQUcsS0FBSyxHQUFHLElBQUksS0FBSyxRQUFRO0FBQUEsRUFDcEM7QUFBQSxFQUVVLGNBQXlCO0FBQ2xDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFVSxXQUFXLFFBQStDO0FBQ25FLFVBQU0sTUFBTTtBQUNaLFdBQU8sSUFBSSxhQUFhLElBQUksS0FBSyxJQUFJLFNBQVMsSUFBSSxRQUFRLElBQUksTUFBTSxJQUFJLFlBQVksSUFBSSx1QkFBdUI7QUFBQSxFQUNoSDtBQUNEO0FBU08sSUFBSyxrQkFBTCxrQkFBS0MscUJBQUw7QUFDTixFQUFBQSxrQ0FBQSxhQUFVLEtBQVY7QUFDQSxFQUFBQSxrQ0FBQSxjQUFXLEtBQVg7QUFGVyxTQUFBQTtBQUFBLEdBQUE7QUFBQSxDQUtMLENBQVVBLHFCQUFWO0FBQ0MsRUFBTUEsaUJBQUEsV0FBNEI7QUFBQSxHQUR6QjtBQUlWLElBQVcsb0JBQVgsa0JBQVdDLHVCQUFYO0FBQ04sRUFBQUEsc0NBQUEsWUFBUyxLQUFUO0FBQ0EsRUFBQUEsc0NBQUEsWUFBUyxLQUFUO0FBRmlCLFNBQUFBO0FBQUEsR0FBQTtBQWtCWCxNQUFNLFdBQVc7QUFBQSxFQUl2QixZQUFZLGtCQUFzQztBQUZsRCxTQUFRLFNBQThCLG9CQUFJLElBQUk7QUFHN0MsYUFBUyxJQUFJLEdBQUcsSUFBSSxpQkFBaUIsUUFBUSxLQUFLO0FBQ2pELFdBQUssT0FBTyxJQUFJLGlCQUFpQixDQUFDLEVBQUUsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLElBQ3REO0FBQUEsRUFDRDtBQUFBLEVBRU8sUUFBUSxHQUEyQixHQUFtQztBQUM1RSxVQUFNLEtBQUssRUFBRSxtQkFBbUI7QUFDaEMsVUFBTSxLQUFLLEVBQUUsbUJBQW1CO0FBQ2hDLFFBQUksTUFBTSxJQUFJO0FBQ2IsVUFBSSxLQUFLLEtBQUssT0FBTyxJQUFJLEdBQUcsSUFBSSxTQUFTLENBQUM7QUFDMUMsV0FBSyxPQUFPLFNBQVksSUFBSSxLQUFLO0FBQ2pDLFVBQUksS0FBSyxLQUFLLE9BQU8sSUFBSSxHQUFHLElBQUksU0FBUyxDQUFDO0FBQzFDLFdBQUssT0FBTyxTQUFZLElBQUksS0FBSztBQUNqQyxVQUFJLE9BQU8sSUFBSTtBQUNkLGVBQU8sRUFBRSxPQUFPLGNBQWMsRUFBRSxNQUFNO0FBQUEsTUFDdkMsT0FBTztBQUNOLGVBQU8sS0FBSztBQUFBLE1BQ2I7QUFBQSxJQUNELFdBQVcsQ0FBQyxNQUFNLElBQUk7QUFDckIsYUFBTztBQUFBLElBQ1IsV0FBVyxNQUFNLENBQUMsSUFBSTtBQUNyQixhQUFPO0FBQUEsSUFDUixPQUFPO0FBQ04sYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUFJTyxJQUFXLGNBQVgsa0JBQVdDLGlCQUFYO0FBQ04sRUFBQUEsYUFBQSxlQUFZO0FBQ1osRUFBQUEsYUFBQSxnQkFBYTtBQUZJLFNBQUFBO0FBQUEsR0FBQTtBQVdYLElBQUssZ0JBQUwsa0JBQUtDLG1CQUFMO0FBRU4sRUFBQUEsZUFBQSxhQUFVO0FBR1YsRUFBQUEsZUFBQSxvQkFBaUI7QUFHakIsRUFBQUEsZUFBQSxrQkFBZTtBQUdmLEVBQUFBLGVBQUEsZ0JBQWE7QUFHYixFQUFBQSxlQUFBLFdBQVE7QUFHUixFQUFBQSxlQUFBLG1CQUFnQjtBQUdoQixFQUFBQSxlQUFBLHNCQUFtQjtBQUduQixFQUFBQSxlQUFBLFlBQVM7QUFHVCxFQUFBQSxlQUFBLGNBQVc7QUFHWCxFQUFBQSxlQUFBLFNBQU07QUFHTixFQUFBQSxlQUFBLDJCQUF3QjtBQUd4QixFQUFBQSxlQUFBLHlCQUFzQjtBQUd0QixFQUFBQSxlQUFBLCtCQUE0QjtBQXRDakIsU0FBQUE7QUFBQSxHQUFBO0FBbUdMLElBQVcsZ0JBQVgsa0JBQVdDLG1CQUFYO0FBQ04sRUFBQUEsOEJBQUE7QUFDQSxFQUFBQSw4QkFBQTtBQUNBLEVBQUFBLDhCQUFBO0FBQ0EsRUFBQUEsOEJBQUE7QUFDQSxFQUFBQSw4QkFBQTtBQUNBLEVBQUFBLDhCQUFBO0FBTmlCLFNBQUFBO0FBQUEsR0FBQTtBQVNYLElBQVU7QUFBQSxDQUFWLENBQVVDLGVBQVY7QUFDTixXQUFTLE9BQU8sTUFBeUI7QUFDeEMsV0FBTztBQUFBLE1BQ04sUUFBUSxLQUFLO0FBQUEsTUFDYixVQUFVLEtBQUssd0JBQXdCO0FBQUEsTUFDdkMsU0FBUyxLQUFLLHdCQUF3QixlQUFlLGdDQUF5QjtBQUFBLE1BQzlFLE9BQU8sS0FBSyx3QkFBd0I7QUFBQSxNQUNwQyxRQUFRO0FBQUEsSUFDVDtBQUFBLEVBQ0Q7QUFFTyxXQUFTLE1BQU0sTUFBWSxZQUFvQixtQkFBMkQ7QUFDaEgsV0FBTztBQUFBLE1BQ04sR0FBRyxPQUFPLElBQUk7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBUE8sRUFBQUEsV0FBUztBQVNULFdBQVMsZUFBZSxNQUFZLFlBQW9CLFdBQTZDO0FBQzNHLFdBQU87QUFBQSxNQUNOLEdBQUcsT0FBTyxJQUFJO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQVBPLEVBQUFBLFdBQVM7QUFRVCxXQUFTLGFBQWEsTUFBWSxZQUFnQyxVQUE4QixZQUE2QztBQUNuSixXQUFPO0FBQUEsTUFDTixHQUFHLE9BQU8sSUFBSTtBQUFBLE1BQ2QsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBUk8sRUFBQUEsV0FBUztBQVVULFdBQVMsU0FBUyxNQUFZLFlBQXFCLFlBQXlDO0FBQ2xHLFdBQU87QUFBQSxNQUNOLEdBQUcsT0FBTyxJQUFJO0FBQUEsTUFDZCxNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQVBPLEVBQUFBLFdBQVM7QUFTVCxXQUFTLFdBQVcsTUFBWSxZQUFvQixZQUFrRTtBQUM1SCxXQUFPO0FBQUEsTUFDTixHQUFHLE9BQU8sSUFBSTtBQUFBLE1BQ2QsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFQTyxFQUFBQSxXQUFTO0FBU1QsV0FBUyxRQUFRLE1BQXdOLE1BQVksWUFBd0M7QUFDblMsV0FBTztBQUFBLE1BQ04sR0FBRyxPQUFPLElBQUk7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBTk8sRUFBQUEsV0FBUztBQVFULFdBQVMsb0JBQW9CLE1BQVksV0FBb0IsWUFBb0Q7QUFDdkgsV0FBTztBQUFBLE1BQ04sR0FBRyxPQUFPLElBQUk7QUFBQSxNQUNkLE1BQU07QUFBQSxNQUNOO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFOTyxFQUFBQSxXQUFTO0FBUVQsV0FBUyxVQUE2QjtBQUM1QyxXQUFPLEVBQUUsTUFBTSx3QkFBc0I7QUFBQSxFQUN0QztBQUZPLEVBQUFBLFdBQVM7QUFBQSxHQXhFQTtBQTZFVixJQUFVO0FBQUEsQ0FBVixDQUFVQyx5QkFBVjtBQUNOLFdBQVMsZ0JBQWdCLFNBQTBDO0FBQ2xFLFVBQU0sT0FBTyxPQUFPLEtBQUssT0FBTyxFQUFFLEtBQUs7QUFDdkMsUUFBSSxTQUFpQjtBQUNyQixlQUFXLE9BQU8sTUFBTTtBQUN2QixVQUFJLGNBQWMsUUFBUSxHQUFHO0FBQzdCLFVBQUksdUJBQXVCLFFBQVE7QUFDbEMsc0JBQWMsZ0JBQWdCLFdBQXNDO0FBQUEsTUFDckUsV0FBVyxPQUFPLGdCQUFnQixVQUFVO0FBQzNDLHNCQUFjLFlBQVksUUFBUSxNQUFNLElBQUk7QUFBQSxNQUM3QztBQUNBLGdCQUFVLE1BQU0sTUFBTSxjQUFjO0FBQUEsSUFDckM7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNPLFdBQVMsT0FBTyxPQUE2QztBQUNuRSxVQUFNLFlBQVksZ0JBQWdCLEtBQUs7QUFDdkMsVUFBTSxTQUFTLEVBQUUsTUFBTSxXQUFXLE1BQU0sTUFBTSxTQUFtQjtBQUNqRSxXQUFPLE9BQU8sUUFBUSxLQUFLO0FBQzNCLFdBQU87QUFBQSxFQUNSO0FBTE8sRUFBQUEscUJBQVM7QUFBQSxHQWZBO0FBdUJWLElBQVcsZ0JBQVgsa0JBQVdDLG1CQUFYO0FBQ04sRUFBQUEsZUFBQSxnQkFBYTtBQUNiLEVBQUFBLGVBQUEsbUJBQWdCO0FBQ2hCLEVBQUFBLGVBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLGVBQUEsZ0NBQTZCO0FBQzdCLEVBQUFBLGVBQUEseUJBQXNCO0FBQ3RCLEVBQUFBLGVBQUEsc0JBQW1CO0FBQ25CLEVBQUFBLGVBQUEscUJBQWtCO0FBQ2xCLEVBQUFBLGVBQUEsbUJBQWdCO0FBQ2hCLEVBQUFBLGVBQUEsc0JBQW1CO0FBQ25CLEVBQUFBLGVBQUEseUJBQXNCO0FBQ3RCLEVBQUFBLGVBQUEsa0JBQWU7QUFDZixFQUFBQSxlQUFBLG9CQUFpQjtBQUNqQixFQUFBQSxlQUFBLGtDQUErQjtBQWJkLFNBQUFBO0FBQUEsR0FBQTtBQWdCWCxJQUFXLHdCQUFYLGtCQUFXQywyQkFBWDtBQUNOLEVBQUFBLHVCQUFBLFdBQVE7QUFDUixFQUFBQSx1QkFBQSxzQkFBbUI7QUFDbkIsRUFBQUEsdUJBQUEsYUFBVTtBQUNWLEVBQUFBLHVCQUFBLFNBQU07QUFDTixFQUFBQSx1QkFBQSxXQUFRO0FBQ1IsRUFBQUEsdUJBQUEsZ0JBQWE7QUFDYixFQUFBQSx1QkFBQSxvQkFBaUI7QUFDakIsRUFBQUEsdUJBQUEsd0JBQXFCO0FBUkosU0FBQUE7QUFBQSxHQUFBO0FBV1gsSUFBVTtBQUFBLENBQVYsQ0FBVUMsb0JBQVY7QUFDQyxXQUFTLHFCQUFxQixVQUEyQixVQUE2RTtBQUM1SSxVQUFNLGFBQWEsdUJBQXVCLElBQUksU0FBUyxJQUFJO0FBQzNELFFBQUksZUFBZSxRQUFXO0FBRTdCLFlBQU0sT0FBTyxRQUFRLFVBQVUsUUFBUTtBQUN2QyxhQUFPLEtBQUs7QUFDWixhQUFPLG9CQUFvQixPQUFPLElBQUk7QUFBQSxJQUN2QztBQUVBLFVBQU0sVUFBb0QsdUJBQU8sT0FBTyxJQUFJO0FBQzVFLFlBQVEsT0FBTyxXQUFXO0FBQzFCLFVBQU0sV0FBd0Isb0JBQUksSUFBSTtBQUN0QyxlQUFXLFNBQVMsUUFBUSxhQUFXLFNBQVMsSUFBSSxPQUFPLENBQUM7QUFFNUQsVUFBTSxhQUFhLFdBQVc7QUFDOUIsZUFBVyxZQUFZLE9BQU8sS0FBSyxVQUFVLEdBQUc7QUFDL0MsWUFBTSxRQUFRLFNBQVMsUUFBUTtBQUMvQixVQUFJLFVBQVUsVUFBYSxVQUFVLE1BQU07QUFDMUMsZ0JBQVEsUUFBUSxJQUFJO0FBQUEsTUFDckIsV0FBVyxTQUFTLElBQUksUUFBUSxHQUFHO0FBQ2xDLGNBQU0sU0FBUyxXQUFXLFFBQVE7QUFDbEMsWUFBSSxPQUFPLFlBQVksUUFBVztBQUNqQyxrQkFBUSxRQUFRLElBQUksUUFBUSxVQUFVLE9BQU8sT0FBTztBQUFBLFFBQ3JELE9BQU87QUFDTixrQkFBUSxPQUFPLE1BQU07QUFBQSxZQUNwQixLQUFLO0FBQ0osc0JBQVEsUUFBUSxJQUFJO0FBQ3BCO0FBQUEsWUFDRCxLQUFLO0FBQUEsWUFDTCxLQUFLO0FBQ0osc0JBQVEsUUFBUSxJQUFJO0FBQ3BCO0FBQUEsWUFDRCxLQUFLO0FBQ0osc0JBQVEsUUFBUSxJQUFJO0FBQ3BCO0FBQUEsWUFDRDtBQUNDLHVCQUFTLE1BQU0sSUFBSTtBQUFBLGdCQUNsQjtBQUFBLGdCQUNBO0FBQUEsZ0JBQXFILEtBQUssVUFBVSxVQUFVLFFBQVcsQ0FBQztBQUFBLGdCQUFHO0FBQUEsY0FDOUosQ0FBQztBQUNELHFCQUFPO0FBQUEsVUFDVDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sb0JBQW9CLE9BQU8sT0FBTztBQUFBLEVBQzFDO0FBOUNPLEVBQUFBLGdCQUFTO0FBQUEsR0FEQTtBQWtEVixNQUFNLGdCQUFnQixhQUFhLGNBQWMsUUFBUSxTQUFTLElBQUksU0FBUyxpQkFBaUIsOEJBQThCLENBQUM7QUFDL0gsTUFBTSxrQ0FBa0M7QUFDeEMsTUFBTSxnQ0FBZ0M7IiwKICAibmFtZXMiOiBbIlNoZWxsUXVvdGluZyIsICJDb21tYW5kT3B0aW9ucyIsICJSZXZlYWxLaW5kIiwgIlJldmVhbFByb2JsZW1LaW5kIiwgIlBhbmVsS2luZCIsICJQcmVzZW50YXRpb25PcHRpb25zIiwgIlJ1bnRpbWVUeXBlIiwgIkNvbW1hbmRTdHJpbmciLCAidmFsdWUiLCAiVGFza0dyb3VwIiwgIlRhc2tTY29wZSIsICJUYXNrU291cmNlS2luZCIsICJEZXBlbmRzT3JkZXIiLCAiUnVuT25PcHRpb25zIiwgIkluc3RhbmNlUG9saWN5IiwgIlJ1bk9wdGlvbnMiLCAiRXhlY3V0aW9uRW5naW5lIiwgIkpzb25TY2hlbWFWZXJzaW9uIiwgIlRhc2tSdW5UeXBlIiwgIlRhc2tFdmVudEtpbmQiLCAiVGFza1J1blNvdXJjZSIsICJUYXNrRXZlbnQiLCAiS2V5ZWRUYXNrSWRlbnRpZmllciIsICJUYXNrU2V0dGluZ0lkIiwgIlRhc2tzU2NoZW1hUHJvcGVydGllcyIsICJUYXNrRGVmaW5pdGlvbiJdCn0K
