import { asArray } from "../../../../base/common/arrays.js";
import * as Async from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { isUNC } from "../../../../base/common/extpath.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { LinkedMap, Touch } from "../../../../base/common/map.js";
import * as Objects from "../../../../base/common/objects.js";
import * as path from "../../../../base/common/path.js";
import * as Platform from "../../../../base/common/platform.js";
import * as resources from "../../../../base/common/resources.js";
import Severity from "../../../../base/common/severity.js";
import * as Types from "../../../../base/common/types.js";
import * as nls from "../../../../nls.js";
import { MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { Markers } from "../../markers/common/markers.js";
import { ProblemMatcherRegistry } from "../common/problemMatcher.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Schemas } from "../../../../base/common/network.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { ViewContainerLocation } from "../../../common/views.js";
import { TaskTerminalStatus } from "./taskTerminalStatus.js";
import { ProblemCollectorEventKind, ProblemHandlingStrategy, StartStopProblemCollector, WatchingProblemCollector } from "../common/problemCollectors.js";
import { GroupKind } from "../common/taskConfiguration.js";
import { TaskError, TaskErrors, TaskExecuteKind, Triggers, VerifiedTask } from "../common/taskSystem.js";
import { CommandString, ContributedTask, CustomTask, DependsOrder, InMemoryTask, PanelKind, RerunForActiveTerminalCommandId, RevealKind, RevealProblemKind, RuntimeType, ShellQuoting, TASK_TERMINAL_ACTIVE, TaskEvent, TaskEventKind, TaskScope, TaskSourceKind, rerunTaskIcon } from "../common/tasks.js";
import { VSCodeOscProperty, VSCodeOscPt, VSCodeSequence } from "../../terminal/browser/terminalEscapeSequences.js";
import { TerminalProcessExtHostProxy } from "../../terminal/browser/terminalProcessExtHostProxy.js";
import { TERMINAL_VIEW_ID } from "../../terminal/common/terminal.js";
import { TaskProblemMonitor } from "./taskProblemMonitor.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { serializeVSCodeOscMessage } from "../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
const TaskTerminalType = "Task";
const _VariableResolver = class _VariableResolver {
  constructor(workspaceFolder, taskSystemInfo, values, _service) {
    this.workspaceFolder = workspaceFolder;
    this.taskSystemInfo = taskSystemInfo;
    this.values = values;
    this._service = _service;
  }
  async resolve(value) {
    const replacers = [];
    value.replace(_VariableResolver._regex, (match, ...args) => {
      replacers.push(this._replacer(match, args));
      return match;
    });
    const resolvedReplacers = await Promise.all(replacers);
    return value.replace(_VariableResolver._regex, () => resolvedReplacers.shift());
  }
  async _replacer(match, args) {
    const result = this.values.get(match.substring(2, match.length - 1));
    if (result !== void 0 && result !== null) {
      return result;
    }
    if (this._service) {
      return this._service.resolveAsync(this.workspaceFolder, match);
    }
    return match;
  }
};
_VariableResolver._regex = /\$\{(.*?)\}/g;
let VariableResolver = _VariableResolver;
const _TerminalTaskSystem = class _TerminalTaskSystem extends Disposable {
  constructor(_terminalService, _terminalGroupService, _outputService, _paneCompositeService, _viewsService, _markerService, _modelService, _configurationResolverService, _contextService, _environmentService, _outputChannelId, _fileService, _terminalProfileResolverService, _pathService, _viewDescriptorService, _logService, _notificationService, contextKeyService, instantiationService, taskSystemInfoResolver, _taskLookup) {
    super();
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._outputService = _outputService;
    this._paneCompositeService = _paneCompositeService;
    this._viewsService = _viewsService;
    this._markerService = _markerService;
    this._modelService = _modelService;
    this._configurationResolverService = _configurationResolverService;
    this._contextService = _contextService;
    this._environmentService = _environmentService;
    this._outputChannelId = _outputChannelId;
    this._fileService = _fileService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._pathService = _pathService;
    this._viewDescriptorService = _viewDescriptorService;
    this._logService = _logService;
    this._notificationService = _notificationService;
    this._taskLookup = _taskLookup;
    this._isRerun = false;
    this._terminalCreationQueue = Promise.resolve();
    this._hasReconnected = false;
    this._terminalTabActions = [{ id: RerunForActiveTerminalCommandId, label: nls.localize("rerunTask", "Rerun Task"), icon: rerunTaskIcon }];
    this._taskStartTimes = /* @__PURE__ */ new Map();
    this._capturedTaskVariables = /* @__PURE__ */ new Map();
    this._activeTasks = /* @__PURE__ */ Object.create(null);
    this._busyTasks = /* @__PURE__ */ Object.create(null);
    this._taskErrors = /* @__PURE__ */ Object.create(null);
    this._taskDependencies = /* @__PURE__ */ Object.create(null);
    this._terminals = /* @__PURE__ */ Object.create(null);
    this._idleTaskTerminals = new LinkedMap();
    this._sameTaskTerminals = /* @__PURE__ */ Object.create(null);
    this._onDidStateChange = this._register(new Emitter());
    this._taskSystemInfoResolver = taskSystemInfoResolver;
    this._register(this._terminalStatusManager = instantiationService.createInstance(TaskTerminalStatus));
    this._register(this._taskProblemMonitor = instantiationService.createInstance(TaskProblemMonitor));
    this._taskTerminalActive = TASK_TERMINAL_ACTIVE.bindTo(contextKeyService);
    this._register(this._terminalService.onDidChangeActiveInstance((e) => this._taskTerminalActive.set(e?.shellLaunchConfig.type === "Task")));
  }
  taskShellIntegrationStartSequence(cwd) {
    return VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.HasRichCommandDetection}=True`) + VSCodeSequence(VSCodeOscPt.PromptStart) + VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.Task}=True`) + (cwd ? VSCodeSequence(VSCodeOscPt.Property, `${VSCodeOscProperty.Cwd}=${typeof cwd === "string" ? cwd : cwd.fsPath}`) : "") + VSCodeSequence(VSCodeOscPt.CommandStart);
  }
  getTaskShellIntegrationOutputSequence(commandLineInfo) {
    return (commandLineInfo ? VSCodeSequence(VSCodeOscPt.CommandLine, `${serializeVSCodeOscMessage(commandLineInfo.commandLine)};${commandLineInfo.nonce}`) : "") + VSCodeSequence(VSCodeOscPt.CommandExecuted);
  }
  get onDidStateChange() {
    return this._onDidStateChange.event;
  }
  _log(value) {
    this._appendOutput(value + "\n");
  }
  _showOutput() {
    this._outputService.showChannel(this._outputChannelId, true);
  }
  reconnect(task, resolver) {
    this._reconnectToTerminals();
    return this.run(task, resolver, Triggers.reconnect);
  }
  run(task, resolver, trigger = Triggers.command) {
    task = task.clone();
    const instances = InMemoryTask.is(task) || this._isTaskEmpty(task) ? [] : this._getInstances(task);
    const validInstance = instances.length < ((task.runOptions && task.runOptions.instanceLimit) ?? 1);
    const instance = instances[0]?.count?.count ?? 0;
    this._currentTask = new VerifiedTask(task, resolver, trigger);
    if (instance > 0) {
      task.instance = instance;
    }
    if (!validInstance) {
      const terminalData = instances[instances.length - 1];
      this._lastTask = this._currentTask;
      return { kind: TaskExecuteKind.Active, task: terminalData.task, active: { same: true, background: task.configurationProperties.isBackground }, promise: terminalData.promise };
    }
    try {
      const executeResult = { kind: TaskExecuteKind.Started, task, started: {}, promise: this._executeTask(task, resolver, trigger, /* @__PURE__ */ new Set(), /* @__PURE__ */ new Map(), void 0) };
      executeResult.promise.then((summary) => {
        this._lastTask = this._currentTask;
      });
      return executeResult;
    } catch (error) {
      if (error instanceof TaskError) {
        throw error;
      } else if (error instanceof Error) {
        this._log(error.message);
        throw new TaskError(Severity.Error, error.message, TaskErrors.UnknownError);
      } else {
        this._log(error.toString());
        throw new TaskError(Severity.Error, nls.localize("TerminalTaskSystem.unknownError", "A unknown error has occurred while executing a task. See task output log for details."), TaskErrors.UnknownError);
      }
    }
  }
  getTerminalsForTasks(tasks) {
    const results = [];
    for (const t of asArray(tasks)) {
      for (const key of Object.keys(this._terminals)) {
        const value = this._terminals[key];
        if (value.lastTask === t.getMapKey()) {
          results.push(value.terminal.resource);
        }
      }
    }
    return results.length > 0 ? results : void 0;
  }
  getTaskProblems(instanceId) {
    return this._taskProblemMonitor.getTaskProblems(instanceId);
  }
  rerun() {
    if (this._lastTask && this._lastTask.verify()) {
      if (this._lastTask.task.runOptions.reevaluateOnRerun !== void 0 && !this._lastTask.task.runOptions.reevaluateOnRerun) {
        this._isRerun = true;
      }
      const result = this.run(this._lastTask.task, this._lastTask.resolver);
      result.promise.then((summary) => {
        this._isRerun = false;
      });
      return result;
    } else {
      return void 0;
    }
  }
  get lastTask() {
    return this._lastTask;
  }
  set lastTask(task) {
    this._lastTask = task;
  }
  _showTaskLoadErrors(task) {
    if (task.taskLoadMessages && task.taskLoadMessages.length > 0) {
      task.taskLoadMessages.forEach((loadMessage) => {
        this._log(loadMessage + "\n");
      });
      const openOutput = "Show Output";
      this._notificationService.prompt(
        Severity.Warning,
        nls.localize(
          "TerminalTaskSystem.taskLoadReporting",
          'There are issues with task "{0}". See the output for more details.',
          task._label
        ),
        [{
          label: openOutput,
          run: () => this._showOutput()
        }]
      );
    }
  }
  isTaskVisible(task) {
    const terminalData = this._activeTasks[task.getMapKey()];
    if (!terminalData?.terminal) {
      return false;
    }
    const activeTerminalInstance = this._terminalService.activeInstance;
    const isPanelShowingTerminal = !!this._viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
    return isPanelShowingTerminal && activeTerminalInstance?.instanceId === terminalData.terminal.instanceId;
  }
  revealTask(task) {
    const terminalData = this._activeTasks[task.getMapKey()];
    if (!terminalData?.terminal) {
      return false;
    }
    const isTerminalInPanel = this._viewDescriptorService.getViewLocationById(TERMINAL_VIEW_ID) === ViewContainerLocation.Panel;
    if (isTerminalInPanel && this.isTaskVisible(task)) {
      if (this._previousPanelId) {
        if (this._previousTerminalInstance) {
          this._terminalService.setActiveInstance(this._previousTerminalInstance);
        }
        this._paneCompositeService.openPaneComposite(this._previousPanelId, ViewContainerLocation.Panel);
      } else {
        this._paneCompositeService.hideActivePaneComposite(ViewContainerLocation.Panel);
      }
      this._previousPanelId = void 0;
      this._previousTerminalInstance = void 0;
    } else {
      if (isTerminalInPanel) {
        this._previousPanelId = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel)?.getId();
        if (this._previousPanelId === TERMINAL_VIEW_ID) {
          this._previousTerminalInstance = this._terminalService.activeInstance ?? void 0;
        }
      }
      this._terminalService.setActiveInstance(terminalData.terminal);
      if (CustomTask.is(task) || ContributedTask.is(task)) {
        this._terminalGroupService.showPanel(task.command.presentation.focus);
      }
    }
    return true;
  }
  isActive() {
    return Promise.resolve(this.isActiveSync());
  }
  isActiveSync() {
    return Object.values(this._activeTasks).some((value) => !!value.terminal);
  }
  canAutoTerminate() {
    return Object.values(this._activeTasks).every((value) => !value.task.configurationProperties.promptOnClose);
  }
  getActiveTasks() {
    return Object.values(this._activeTasks).flatMap((value) => value.terminal ? value.task : []);
  }
  getLastInstance(task) {
    const recentKey = task.getKey();
    return Object.values(this._activeTasks).reverse().find(
      (value) => recentKey && recentKey === value.task.getKey()
    )?.task;
  }
  getFirstInstance(task) {
    const recentKey = task.getKey();
    for (const task2 of this.getActiveTasks()) {
      if (recentKey && recentKey === task2.getKey()) {
        return task2;
      }
    }
    return void 0;
  }
  getBusyTasks() {
    return Object.keys(this._busyTasks).map((key) => this._busyTasks[key]);
  }
  customExecutionComplete(task, result) {
    const activeTerminal = this._activeTasks[task.getMapKey()];
    if (!activeTerminal?.terminal) {
      return Promise.reject(new Error("Expected to have a terminal for a custom execution task"));
    }
    return new Promise((resolve) => {
      resolve();
    });
  }
  _getInstances(task) {
    const recentKey = task.getKey();
    return Object.values(this._activeTasks).filter(
      (value) => recentKey && recentKey === value.task.getKey()
    );
  }
  _removeFromActiveTasks(task) {
    const key = typeof task === "string" ? task : task.getMapKey();
    const taskToRemove = this._activeTasks[key];
    if (!taskToRemove) {
      return;
    }
    delete this._activeTasks[key];
  }
  _fireTaskEvent(event) {
    if (event.kind !== TaskEventKind.Changed && event.kind !== TaskEventKind.ProblemMatcherEnded && event.kind !== TaskEventKind.ProblemMatcherStarted) {
      const activeTask = this._activeTasks[event.__task.getMapKey()];
      if (activeTask) {
        activeTask.state = event.kind;
      }
    }
    this._onDidStateChange.fire(event);
  }
  terminate(task) {
    const activeTerminal = this._activeTasks[task.getMapKey()];
    if (!activeTerminal) {
      return Promise.resolve({ success: false, task: void 0 });
    }
    const terminal = activeTerminal.terminal;
    if (!terminal) {
      return Promise.resolve({ success: false, task: void 0 });
    }
    return new Promise((resolve, reject) => {
      const onExit = terminal.onExit(() => {
        const terminatedTask = activeTerminal.task;
        try {
          onExit.dispose();
          this._fireTaskEvent(TaskEvent.terminated(terminatedTask, terminal.instanceId, terminal.exitReason));
        } catch (error) {
        }
        resolve({ success: true, task: terminatedTask });
      });
      terminal.dispose();
    });
  }
  terminateAll() {
    const promises = [];
    for (const [key, terminalData] of Object.entries(this._activeTasks)) {
      const terminal = terminalData?.terminal;
      if (terminal) {
        promises.push(new Promise((resolve, reject) => {
          const onExit = terminal.onExit(() => {
            const task = terminalData.task;
            try {
              onExit.dispose();
              this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
            } catch (error) {
            }
            if (this._activeTasks[key] === terminalData) {
              delete this._activeTasks[key];
            }
            resolve({ success: true, task: terminalData.task });
          });
        }));
        terminal.dispose();
      }
    }
    return Promise.all(promises);
  }
  _showDependencyCycleMessage(task) {
    this._log(nls.localize(
      "dependencyCycle",
      'There is a dependency cycle. See task "{0}".',
      task._label
    ));
    this._showOutput();
  }
  _executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved) {
    this._showTaskLoadErrors(task);
    const mapKey = task.getMapKey();
    const promise = Promise.resolve().then(async () => {
      alreadyResolved = alreadyResolved ?? /* @__PURE__ */ new Map();
      const promises = [];
      if (task.configurationProperties.dependsOn) {
        const nextLiveDependencies = new Set(liveDependencies).add(task.getCommonTaskId());
        for (const dependency of task.configurationProperties.dependsOn) {
          const dependencyTask = await resolver.resolve(dependency.uri, dependency.task);
          if (dependencyTask) {
            this._adoptConfigurationForDependencyTask(dependencyTask, task);
            const taskMapKey = task.getMapKey();
            const dependencyMapKey = dependencyTask.getMapKey();
            if (!this._taskDependencies[taskMapKey]) {
              this._taskDependencies[taskMapKey] = [];
            }
            if (!this._taskDependencies[taskMapKey].includes(dependencyMapKey)) {
              this._taskDependencies[taskMapKey].push(dependencyMapKey);
            }
            let taskResult;
            const commonKey = dependencyTask.getCommonTaskId();
            if (nextLiveDependencies.has(commonKey)) {
              this._showDependencyCycleMessage(dependencyTask);
              taskResult = Promise.resolve({});
            } else {
              taskResult = encounteredTasks.get(commonKey);
              if (!taskResult) {
                const activeTask2 = this._activeTasks[dependencyTask.getMapKey()] ?? this._getInstances(dependencyTask).pop();
                taskResult = activeTask2 && this._getDependencyPromise(activeTask2);
              }
            }
            if (!taskResult) {
              this._fireTaskEvent(TaskEvent.general(TaskEventKind.DependsOnStarted, task));
              taskResult = this._executeDependencyTask(dependencyTask, resolver, trigger, nextLiveDependencies, encounteredTasks, alreadyResolved);
            }
            encounteredTasks.set(commonKey, taskResult);
            promises.push(taskResult);
            if (task.configurationProperties.dependsOrder === DependsOrder.sequence) {
              const promiseResult = await taskResult;
              if (promiseResult.exitCode !== 0) {
                break;
              }
            }
          } else {
            this._log(nls.localize(
              "dependencyFailed",
              "Couldn't resolve dependent task '{0}' in workspace folder '{1}'",
              Types.isString(dependency.task) ? dependency.task : JSON.stringify(dependency.task, void 0, 0),
              dependency.uri.toString()
            ));
            this._showOutput();
          }
        }
      }
      return Promise.all(promises).then((summaries) => {
        for (const summary of summaries) {
          if (summary.exitCode !== 0) {
            return { exitCode: summary.exitCode };
          }
        }
        if ((ContributedTask.is(task) || CustomTask.is(task)) && task.command) {
          if (this._isRerun) {
            return this._reexecuteCommand(task, trigger, alreadyResolved);
          } else {
            return this._executeCommand(task, trigger, alreadyResolved);
          }
        }
        return { exitCode: 0 };
      });
    }).finally(() => {
      if (this._activeTasks[mapKey] === activeTask) {
        delete this._activeTasks[mapKey];
      }
    });
    const lastInstance = this._getInstances(task).pop();
    const count = lastInstance?.count ?? { count: 0 };
    count.count++;
    const activeTask = { task, promise, count };
    this._activeTasks[mapKey] = activeTask;
    return promise;
  }
  _createInactiveDependencyPromise(task) {
    return new Promise((resolve) => {
      const taskInactiveDisposable = this.onDidStateChange((taskEvent) => {
        if (taskEvent.kind === TaskEventKind.Inactive && taskEvent.__task === task) {
          taskInactiveDisposable.dispose();
          resolve({ exitCode: 0 });
        }
      });
    });
  }
  _taskHasErrors(task) {
    const taskMapKey = task.getMapKey();
    if (this._taskErrors[taskMapKey]) {
      return true;
    }
    const dependencies = this._taskDependencies[taskMapKey];
    if (dependencies) {
      for (const dependencyMapKey of dependencies) {
        if (this._taskErrors[dependencyMapKey]) {
          return true;
        }
      }
    }
    return false;
  }
  _cleanupTaskTracking(task) {
    const taskMapKey = task.getMapKey();
    delete this._taskErrors[taskMapKey];
    delete this._taskDependencies[taskMapKey];
  }
  _adoptConfigurationForDependencyTask(dependencyTask, task) {
    if (dependencyTask.configurationProperties.icon) {
      dependencyTask.configurationProperties.icon.id ||= task.configurationProperties.icon?.id;
      dependencyTask.configurationProperties.icon.color ||= task.configurationProperties.icon?.color;
    } else {
      dependencyTask.configurationProperties.icon = task.configurationProperties.icon;
    }
  }
  async _getDependencyPromise(task) {
    if (!task.task.configurationProperties.isBackground) {
      return task.promise;
    }
    if (!task.task.configurationProperties.problemMatchers || task.task.configurationProperties.problemMatchers.length === 0) {
      return task.promise;
    }
    if (task.state === TaskEventKind.Inactive) {
      return { exitCode: 0 };
    }
    return this._createInactiveDependencyPromise(task.task);
  }
  async _executeDependencyTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved) {
    if (!task.configurationProperties.isBackground) {
      return this._executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved);
    }
    const inactivePromise = this._createInactiveDependencyPromise(task);
    return Promise.race([inactivePromise, this._executeTask(task, resolver, trigger, liveDependencies, encounteredTasks, alreadyResolved)]);
  }
  async _resolveAndFindExecutable(systemInfo, workspaceFolder, task, cwd, envPath) {
    const command = await this._configurationResolverService.resolveAsync(workspaceFolder, CommandString.value(task.command.name));
    cwd = cwd ? await this._configurationResolverService.resolveAsync(workspaceFolder, cwd) : void 0;
    const delimiter = (await this._pathService.path).delimiter;
    const paths = envPath ? await Promise.all(envPath.split(delimiter).map((p) => this._configurationResolverService.resolveAsync(workspaceFolder, p))) : void 0;
    const foundExecutable = await systemInfo?.findExecutable(command, cwd, paths);
    if (foundExecutable) {
      return foundExecutable;
    }
    if (path.isAbsolute(command)) {
      return command;
    }
    return path.join(cwd ?? "", command);
  }
  _findUnresolvedVariables(variables, alreadyResolved) {
    if (alreadyResolved.size === 0) {
      return variables;
    }
    const unresolved = /* @__PURE__ */ new Set();
    for (const variable of variables) {
      if (!alreadyResolved.has(variable.substring(2, variable.length - 1))) {
        unresolved.add(variable);
      }
    }
    return unresolved;
  }
  _mergeMaps(mergeInto, mergeFrom) {
    for (const entry of mergeFrom) {
      if (!mergeInto.has(entry[0])) {
        mergeInto.set(entry[0], entry[1]);
      }
    }
  }
  async _acquireInput(taskSystemInfo, workspaceFolder, task, variables, alreadyResolved) {
    const resolved = await this._resolveVariablesFromSet(taskSystemInfo, workspaceFolder, task, variables, alreadyResolved);
    this._fireTaskEvent(TaskEvent.general(TaskEventKind.AcquiredInput, task));
    return resolved;
  }
  _resolveVariablesFromSet(taskSystemInfo, workspaceFolder, task, variables, alreadyResolved) {
    const isProcess = task.command && task.command.runtime === RuntimeType.Process;
    const options = task.command && task.command.options ? task.command.options : void 0;
    const cwd = options ? options.cwd : void 0;
    let envPath = void 0;
    if (options && options.env) {
      for (const key of Object.keys(options.env)) {
        if (key.toLowerCase() === "path") {
          if (Types.isString(options.env[key])) {
            envPath = options.env[key];
          }
          break;
        }
      }
    }
    const unresolved = this._findUnresolvedVariables(variables, alreadyResolved);
    let resolvedVariables;
    if (taskSystemInfo && workspaceFolder) {
      const resolveSet = {
        variables: unresolved
      };
      if (taskSystemInfo.platform === Platform.Platform.Windows && isProcess) {
        resolveSet.process = { name: CommandString.value(task.command.name) };
        if (cwd) {
          resolveSet.process.cwd = cwd;
        }
        if (envPath) {
          resolveSet.process.path = envPath;
        }
      }
      resolvedVariables = taskSystemInfo.resolveVariables(workspaceFolder, resolveSet, TaskSourceKind.toConfigurationTarget(task._source.kind)).then(async (resolved) => {
        if (!resolved) {
          return void 0;
        }
        this._mergeMaps(alreadyResolved, resolved.variables);
        resolved.variables = new Map(alreadyResolved);
        if (isProcess) {
          let process = CommandString.value(task.command.name);
          if (taskSystemInfo.platform === Platform.Platform.Windows) {
            process = await this._resolveAndFindExecutable(taskSystemInfo, workspaceFolder, task, cwd, envPath);
          }
          resolved.variables.set(_TerminalTaskSystem.ProcessVarName, process);
        }
        return resolved;
      });
      return resolvedVariables;
    } else {
      const variablesArray = new Array();
      unresolved.forEach((variable) => variablesArray.push(variable));
      return new Promise((resolve, reject) => {
        this._configurationResolverService.resolveWithInteraction(workspaceFolder, variablesArray, "tasks", void 0, TaskSourceKind.toConfigurationTarget(task._source.kind)).then(async (resolvedVariablesMap) => {
          if (resolvedVariablesMap) {
            this._mergeMaps(alreadyResolved, resolvedVariablesMap);
            resolvedVariablesMap = new Map(alreadyResolved);
            if (isProcess) {
              let processVarValue;
              if (Platform.isWindows) {
                processVarValue = await this._resolveAndFindExecutable(taskSystemInfo, workspaceFolder, task, cwd, envPath);
              } else {
                processVarValue = await this._configurationResolverService.resolveAsync(workspaceFolder, CommandString.value(task.command.name));
              }
              resolvedVariablesMap.set(_TerminalTaskSystem.ProcessVarName, processVarValue);
            }
            const resolvedVariablesResult = {
              variables: resolvedVariablesMap
            };
            resolve(resolvedVariablesResult);
          } else {
            resolve(void 0);
          }
        }, (reason) => {
          reject(reason);
        });
      });
    }
  }
  _executeCommand(task, trigger, alreadyResolved) {
    const taskWorkspaceFolder = task.getWorkspaceFolder();
    let workspaceFolder;
    if (taskWorkspaceFolder) {
      workspaceFolder = this._currentTask.workspaceFolder = taskWorkspaceFolder;
    } else {
      const folders = this._contextService.getWorkspace().folders;
      workspaceFolder = folders.length > 0 ? folders[0] : void 0;
    }
    const systemInfo = this._currentTask.systemInfo = this._taskSystemInfoResolver(workspaceFolder);
    const variables = /* @__PURE__ */ new Set();
    this._collectTaskVariables(variables, task);
    const resolvedVariables = this._acquireInput(systemInfo, workspaceFolder, task, variables, alreadyResolved);
    return resolvedVariables.then((resolvedVariables2) => {
      if (resolvedVariables2 && !this._isTaskEmpty(task)) {
        this._currentTask.resolvedVariables = resolvedVariables2;
        return this._executeInTerminal(task, trigger, new VariableResolver(workspaceFolder, systemInfo, resolvedVariables2.variables, this._configurationResolverService), workspaceFolder);
      } else {
        this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
        return Promise.resolve({ exitCode: 0 });
      }
    }, (reason) => {
      return Promise.reject(reason);
    });
  }
  _isTaskEmpty(task) {
    const isCustomExecution = task.command.runtime === RuntimeType.CustomExecution;
    return !(task.command !== void 0 && task.command.runtime && (isCustomExecution || task.command.name !== void 0));
  }
  _reexecuteCommand(task, trigger, alreadyResolved) {
    const lastTask = this._lastTask;
    if (!lastTask) {
      return Promise.reject(new Error("No task previously run"));
    }
    const workspaceFolder = this._currentTask.workspaceFolder = lastTask.workspaceFolder;
    this._currentTask.systemInfo = lastTask.systemInfo;
    const variables = /* @__PURE__ */ new Set();
    this._collectTaskVariables(variables, task);
    let hasAllVariables = true;
    variables.forEach((value) => {
      if (Object.hasOwn(lastTask.getVerifiedTask().resolvedVariables, value.substring(2, value.length - 1))) {
        hasAllVariables = false;
      }
    });
    if (!hasAllVariables) {
      return this._acquireInput(lastTask.getVerifiedTask().systemInfo, lastTask.getVerifiedTask().workspaceFolder, task, variables, alreadyResolved).then((resolvedVariables) => {
        if (!resolvedVariables) {
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
          return { exitCode: 0 };
        }
        this._currentTask.resolvedVariables = resolvedVariables;
        return this._executeInTerminal(task, trigger, new VariableResolver(lastTask.getVerifiedTask().workspaceFolder, lastTask.getVerifiedTask().systemInfo, resolvedVariables.variables, this._configurationResolverService), workspaceFolder);
      }, (reason) => {
        return Promise.reject(reason);
      });
    } else {
      this._currentTask.resolvedVariables = lastTask.getVerifiedTask().resolvedVariables;
      return this._executeInTerminal(task, trigger, new VariableResolver(lastTask.getVerifiedTask().workspaceFolder, lastTask.getVerifiedTask().systemInfo, lastTask.getVerifiedTask().resolvedVariables.variables, this._configurationResolverService), workspaceFolder);
    }
  }
  async _executeInTerminal(task, trigger, resolver, workspaceFolder) {
    let terminal = void 0;
    let error = void 0;
    let promise = void 0;
    if (task.configurationProperties.isBackground) {
      const problemMatchers = await this._resolveMatchers(resolver, task.configurationProperties.problemMatchers);
      const watchingProblemMatcher = new WatchingProblemCollector(problemMatchers, this._markerService, this._modelService, this._fileService, this._logService);
      if (problemMatchers.length > 0 && !watchingProblemMatcher.isWatching()) {
        this._appendOutput(nls.localize("TerminalTaskSystem.nonWatchingMatcher", "Task {0} is a background task but uses a problem matcher without a background pattern", task._label));
        this._showOutput();
      }
      const toDispose = new DisposableStore();
      let eventCounter = 0;
      const mapKey = task.getMapKey();
      toDispose.add(watchingProblemMatcher.onDidStateChange((event) => {
        if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
          eventCounter++;
          this._busyTasks[mapKey] = task;
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.Active, task, terminal?.instanceId));
        } else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
          eventCounter--;
          if (this._busyTasks[mapKey]) {
            delete this._busyTasks[mapKey];
          }
          if (event.capturedVariables) {
            this._registerCapturedVariables(event.capturedVariables);
          }
          this._fireTaskEvent(TaskEvent.inactive(task, terminal?.instanceId, this._takeTaskDuration(terminal?.instanceId)));
          if (eventCounter === 0) {
            if (watchingProblemMatcher.numberOfMatches > 0 && watchingProblemMatcher.maxMarkerSeverity && watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
              this._taskErrors[task.getMapKey()] = true;
              this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
              const reveal = task.command.presentation.reveal;
              const revealProblems = task.command.presentation.revealProblems;
              if (revealProblems === RevealProblemKind.OnProblem) {
                this._viewsService.openView(Markers.MARKERS_VIEW_ID, true);
              } else if (reveal === RevealKind.Silent) {
                this._terminalService.setActiveInstance(terminal);
                this._terminalGroupService.showPanel(false);
              }
            } else {
              this._fireTaskEvent(TaskEvent.problemMatcherEnded(task, this._taskHasErrors(task), terminal?.instanceId));
            }
          }
        }
      }));
      watchingProblemMatcher.aboutToStart();
      let delayer = void 0;
      [terminal, error] = await this._createTerminal(task, resolver, workspaceFolder);
      if (error) {
        return Promise.reject(new Error(error.message));
      }
      if (!terminal) {
        return Promise.reject(new Error(`Failed to create terminal for task ${task._label}`));
      }
      this._terminalStatusManager.addTerminal(task, terminal, watchingProblemMatcher);
      this._taskProblemMonitor.addTerminal(terminal, watchingProblemMatcher);
      let processStartedSignaled = false;
      terminal.processReady.then(() => {
        if (!processStartedSignaled) {
          this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
          processStartedSignaled = true;
        }
      }, (_error) => {
        this._logService.error("Task terminal process never got ready");
      });
      this._taskStartTimes.set(terminal.instanceId, Date.now());
      this._fireTaskEvent(TaskEvent.start(task, terminal.instanceId, resolver.values));
      let onData;
      if (problemMatchers.length) {
        onData = terminal.onLineData((line) => {
          watchingProblemMatcher.processLine(line);
          if (!delayer) {
            delayer = new Async.Delayer(3e3);
          }
          delayer.trigger(() => {
            watchingProblemMatcher.forceDelivery();
            delayer = void 0;
          });
        });
      }
      promise = new Promise((resolve, reject) => {
        const boundTerminal = terminal;
        const onExit = terminal.onExit((terminalLaunchResult) => {
          const exitCode = typeof terminalLaunchResult === "number" ? terminalLaunchResult : terminalLaunchResult?.code;
          onData?.dispose();
          onExit.dispose();
          const key = task.getMapKey();
          if (this._busyTasks[mapKey]) {
            delete this._busyTasks[mapKey];
          }
          const cur = this._activeTasks[key];
          if (cur && cur.terminal === boundTerminal) {
            this._removeFromActiveTasks(task);
          }
          this._fireTaskEvent(TaskEvent.changed());
          if (terminalLaunchResult !== void 0) {
            switch (task.command.presentation.panel) {
              case PanelKind.Dedicated:
                this._sameTaskTerminals[key] = terminal.instanceId.toString();
                break;
              case PanelKind.Shared:
                this._idleTaskTerminals.set(key, terminal.instanceId.toString(), Touch.AsOld);
                break;
            }
          }
          const reveal = task.command.presentation.reveal;
          if (reveal === RevealKind.Silent && (exitCode !== 0 || watchingProblemMatcher.numberOfMatches > 0 && watchingProblemMatcher.maxMarkerSeverity && watchingProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error)) {
            try {
              this._terminalService.setActiveInstance(terminal);
              this._terminalGroupService.showPanel(false);
            } catch (e) {
            }
          }
          watchingProblemMatcher.done();
          watchingProblemMatcher.dispose();
          if (!processStartedSignaled) {
            this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
            processStartedSignaled = true;
          }
          const durationMs = this._takeTaskDuration(terminal.instanceId);
          this._fireTaskEvent(TaskEvent.processEnded(task, terminal.instanceId, exitCode, durationMs));
          for (let i = 0; i < eventCounter; i++) {
            this._fireTaskEvent(TaskEvent.inactive(task, terminal.instanceId));
          }
          eventCounter = 0;
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task));
          toDispose.dispose();
          resolve({ exitCode: exitCode ?? void 0 });
        });
      });
      if (trigger === Triggers.reconnect && !!terminal.xterm) {
        const bufferLines = [];
        const bufferReverseIterator = terminal.xterm.getBufferReverseIterator();
        const startRegex = new RegExp(watchingProblemMatcher.beginPatterns.map((pattern) => pattern.source).join("|"));
        for (const nextLine of bufferReverseIterator) {
          bufferLines.push(nextLine);
          if (startRegex.test(nextLine)) {
            break;
          }
        }
        let delayer2 = void 0;
        for (let i = bufferLines.length - 1; i >= 0; i--) {
          watchingProblemMatcher.processLine(bufferLines[i]);
          if (!delayer2) {
            delayer2 = new Async.Delayer(3e3);
          }
          delayer2.trigger(() => {
            watchingProblemMatcher.forceDelivery();
            delayer2 = void 0;
          });
        }
      }
    } else {
      [terminal, error] = await this._createTerminal(task, resolver, workspaceFolder);
      if (error) {
        return Promise.reject(new Error(error.message));
      }
      if (!terminal) {
        return Promise.reject(new Error(`Failed to create terminal for task ${task._label}`));
      }
      this._taskStartTimes.set(terminal.instanceId, Date.now());
      this._fireTaskEvent(TaskEvent.start(task, terminal.instanceId, resolver.values));
      const mapKey = task.getMapKey();
      this._busyTasks[mapKey] = task;
      this._fireTaskEvent(TaskEvent.general(TaskEventKind.Active, task, terminal.instanceId));
      const problemMatchers = await this._resolveMatchers(resolver, task.configurationProperties.problemMatchers);
      const startStopProblemMatcher = new StartStopProblemCollector(problemMatchers, this._markerService, this._modelService, ProblemHandlingStrategy.Clean, this._fileService, this._logService);
      this._terminalStatusManager.addTerminal(task, terminal, startStopProblemMatcher);
      this._taskProblemMonitor.addTerminal(terminal, startStopProblemMatcher);
      const problemMatcherListener = startStopProblemMatcher.onDidStateChange((event) => {
        if (event.kind === ProblemCollectorEventKind.BackgroundProcessingBegins) {
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherStarted, task, terminal?.instanceId));
        } else if (event.kind === ProblemCollectorEventKind.BackgroundProcessingEnds) {
          if (startStopProblemMatcher.numberOfMatches && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
            this._taskErrors[task.getMapKey()] = true;
            this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
          } else {
            this._fireTaskEvent(TaskEvent.problemMatcherEnded(task, this._taskHasErrors(task), terminal?.instanceId));
          }
        }
      });
      let processStartedSignaled = false;
      terminal.processReady.then(() => {
        if (!processStartedSignaled) {
          this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
          processStartedSignaled = true;
        }
      }, (_error) => {
      });
      const onData = terminal.onLineData((line) => {
        startStopProblemMatcher.processLine(line);
      });
      promise = new Promise((resolve, reject) => {
        const boundTerminal = terminal;
        const onExit = terminal.onExit((terminalLaunchResult) => {
          const exitCode = typeof terminalLaunchResult === "number" ? terminalLaunchResult : terminalLaunchResult?.code;
          onExit.dispose();
          const key = task.getMapKey();
          const cur = this._activeTasks[key];
          if (cur && cur.terminal === boundTerminal) {
            this._removeFromActiveTasks(task);
          }
          this._fireTaskEvent(TaskEvent.changed());
          if (terminalLaunchResult !== void 0) {
            switch (task.command.presentation.panel) {
              case PanelKind.Dedicated:
                this._sameTaskTerminals[key] = terminal.instanceId.toString();
                break;
              case PanelKind.Shared:
                this._idleTaskTerminals.set(key, terminal.instanceId.toString(), Touch.AsOld);
                break;
            }
          }
          const reveal = task.command.presentation.reveal;
          const revealProblems = task.command.presentation.revealProblems;
          const revealProblemPanel = terminal && revealProblems === RevealProblemKind.OnProblem && startStopProblemMatcher.numberOfMatches > 0;
          if (revealProblemPanel) {
            this._viewsService.openView(Markers.MARKERS_VIEW_ID);
          } else if (terminal && reveal === RevealKind.Silent && (exitCode !== 0 || startStopProblemMatcher.numberOfMatches > 0 && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error)) {
            try {
              this._terminalService.setActiveInstance(terminal);
              this._terminalGroupService.showPanel(false);
            } catch (e) {
            }
          }
          setTimeout(() => {
            onData.dispose();
            startStopProblemMatcher.done();
            startStopProblemMatcher.dispose();
            problemMatcherListener.dispose();
          }, 100);
          if (!processStartedSignaled && terminal) {
            this._fireTaskEvent(TaskEvent.processStarted(task, terminal.instanceId, terminal.processId));
            processStartedSignaled = true;
          }
          const durationMs = this._takeTaskDuration(terminal?.instanceId);
          this._fireTaskEvent(TaskEvent.processEnded(task, terminal?.instanceId, exitCode ?? void 0, durationMs));
          if (this._busyTasks[mapKey]) {
            delete this._busyTasks[mapKey];
          }
          this._fireTaskEvent(TaskEvent.inactive(task, terminal?.instanceId, durationMs));
          if (startStopProblemMatcher.numberOfMatches && startStopProblemMatcher.maxMarkerSeverity && startStopProblemMatcher.maxMarkerSeverity >= MarkerSeverity.Error) {
            this._taskErrors[task.getMapKey()] = true;
            this._fireTaskEvent(TaskEvent.general(TaskEventKind.ProblemMatcherFoundErrors, task, terminal?.instanceId));
          } else {
            this._fireTaskEvent(TaskEvent.problemMatcherEnded(task, this._taskHasErrors(task), terminal?.instanceId));
          }
          this._fireTaskEvent(TaskEvent.general(TaskEventKind.End, task, terminal?.instanceId));
          this._cleanupTaskTracking(task);
          resolve({ exitCode: exitCode ?? void 0 });
        });
      });
    }
    const showProblemPanel = task.command.presentation && task.command.presentation.revealProblems === RevealProblemKind.Always;
    if (showProblemPanel) {
      this._viewsService.openView(Markers.MARKERS_VIEW_ID);
    } else if (task.command.presentation && (task.command.presentation.focus || task.command.presentation.reveal === RevealKind.Always)) {
      this._terminalService.setActiveInstance(terminal);
      await this._terminalService.revealTerminal(terminal);
      if (task.command.presentation.focus && terminal) {
        await this._terminalService.focusInstance(terminal);
      }
    }
    if (this._activeTasks[task.getMapKey()]) {
      this._activeTasks[task.getMapKey()].terminal = terminal;
    } else {
      this._logService.warn("No active tasks found for the terminal.");
    }
    this._fireTaskEvent(TaskEvent.changed());
    return promise;
  }
  _takeTaskDuration(terminalId) {
    if (terminalId === void 0) {
      return void 0;
    }
    const startTime = this._taskStartTimes.get(terminalId);
    if (startTime === void 0) {
      return void 0;
    }
    this._taskStartTimes.delete(terminalId);
    return Date.now() - startTime;
  }
  _registerCapturedVariables(capturedVariables) {
    for (const [name, value] of capturedVariables) {
      this._capturedTaskVariables.set(name, value);
      if (!this._configurationResolverService.resolvableVariables.has(`taskVar:${name}`)) {
        this._configurationResolverService.contributeVariable(`taskVar:${name}`, async () => this._capturedTaskVariables.get(name));
      }
    }
  }
  _createTerminalName(task) {
    const needsFolderQualification = this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
    return needsFolderQualification ? task.getQualifiedLabel() : task.configurationProperties.name || "";
  }
  async _createShellLaunchConfig(task, workspaceFolder, variableResolver, platform, options, command, args, waitOnExit, presentationOptions) {
    let shellLaunchConfig;
    const isShellCommand = task.command.runtime === RuntimeType.Shell;
    const needsFolderQualification = this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
    const terminalName = this._createTerminalName(task);
    const type = TaskTerminalType;
    const originalCommand = task.command.name;
    let cwd;
    if (options.cwd) {
      cwd = options.cwd;
      if (!path.isAbsolute(cwd)) {
        if (workspaceFolder && workspaceFolder.uri.scheme === Schemas.file) {
          cwd = path.join(workspaceFolder.uri.fsPath, cwd);
        }
      }
      cwd = isUNC(cwd) ? cwd : resources.toLocalResource(URI.from({ scheme: Schemas.file, path: cwd }), this._environmentService.remoteAuthority, this._pathService.defaultUriScheme);
    }
    if (isShellCommand) {
      let os;
      switch (platform) {
        case Platform.Platform.Windows:
          os = Platform.OperatingSystem.Windows;
          break;
        case Platform.Platform.Mac:
          os = Platform.OperatingSystem.Macintosh;
          break;
        case Platform.Platform.Linux:
        default:
          os = Platform.OperatingSystem.Linux;
          break;
      }
      const defaultProfile = await this._terminalProfileResolverService.getDefaultProfile({
        allowAutomationShell: true,
        os,
        remoteAuthority: this._environmentService.remoteAuthority
      });
      let icon;
      if (task.configurationProperties.icon?.id) {
        icon = ThemeIcon.fromId(task.configurationProperties.icon.id);
      } else {
        const taskGroupKind = task.configurationProperties.group ? GroupKind.to(task.configurationProperties.group) : void 0;
        const kindId = typeof taskGroupKind === "string" ? taskGroupKind : taskGroupKind?.kind;
        icon = kindId === "test" ? ThemeIcon.fromId(Codicon.beaker.id) : defaultProfile.icon;
      }
      shellLaunchConfig = {
        name: terminalName,
        type,
        executable: defaultProfile.path,
        args: defaultProfile.args,
        env: { ...defaultProfile.env },
        icon,
        color: task.configurationProperties.icon?.color || void 0,
        waitOnExit
      };
      let shellSpecified = false;
      const shellOptions = task.command.options && task.command.options.shell;
      if (shellOptions) {
        if (shellOptions.executable) {
          if (shellOptions.executable !== shellLaunchConfig.executable) {
            shellLaunchConfig.args = void 0;
          }
          shellLaunchConfig.executable = await this._resolveVariable(variableResolver, shellOptions.executable);
          shellSpecified = true;
        }
        if (shellOptions.args) {
          shellLaunchConfig.args = await this._resolveVariables(variableResolver, shellOptions.args.slice());
        }
      }
      if (shellLaunchConfig.args === void 0) {
        shellLaunchConfig.args = [];
      }
      const shellArgs = Array.isArray(shellLaunchConfig.args) ? shellLaunchConfig.args.slice(0) : [shellLaunchConfig.args];
      const toAdd = [];
      const basename = path.posix.basename((await this._pathService.fileURI(shellLaunchConfig.executable)).path).toLowerCase();
      const commandLine = this._buildShellCommandLine(platform, basename, shellOptions, command, originalCommand, args);
      let windowsShellArgs = false;
      if (platform === Platform.Platform.Windows) {
        windowsShellArgs = true;
        const userHome = await this._pathService.userHome();
        if (basename === "cmd.exe" && (options.cwd && isUNC(options.cwd) || !options.cwd && isUNC(userHome.fsPath))) {
          return void 0;
        }
        if (basename === "powershell.exe" || basename === "pwsh.exe") {
          if (!shellSpecified) {
            toAdd.push("-Command");
          }
        } else if (basename === "bash.exe" || basename === "zsh.exe") {
          windowsShellArgs = false;
          if (!shellSpecified) {
            toAdd.push("-c");
          }
        } else if (basename === "wsl.exe") {
          if (!shellSpecified) {
            toAdd.push("-e");
          }
        } else if (basename === "nu.exe") {
          if (!shellSpecified) {
            toAdd.push("-c");
          }
        } else {
          if (!shellSpecified) {
            toAdd.push("/d", "/c");
          }
        }
      } else {
        if (!shellSpecified) {
          if (platform === Platform.Platform.Mac) {
          }
          toAdd.push("-c");
        }
      }
      const combinedShellArgs = this._addAllArgument(toAdd, shellArgs);
      combinedShellArgs.push(commandLine);
      shellLaunchConfig.shellIntegrationNonce = generateUuid();
      const commandLineInfo = {
        commandLine,
        nonce: shellLaunchConfig.shellIntegrationNonce
      };
      shellLaunchConfig.args = windowsShellArgs ? combinedShellArgs.join(" ") : combinedShellArgs;
      if (task.command.presentation && task.command.presentation.echo) {
        if (needsFolderQualification && workspaceFolder) {
          const folder = cwd && typeof cwd === "object" && Object.hasOwn(cwd, "path") ? path.basename(cwd.path) : workspaceFolder.name;
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executingInFolder",
            comment: ["The workspace folder the task is running in", "The task command line or label"]
          }, "Executing task in folder {0}: {1}", folder, commandLine), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(commandLineInfo);
        } else {
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executing.shellIntegration",
            comment: ["The task command line or label"]
          }, "Executing task: {0}", commandLine), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(commandLineInfo);
        }
      } else {
        shellLaunchConfig.initialText = {
          text: this.taskShellIntegrationStartSequence(cwd) + this.getTaskShellIntegrationOutputSequence(commandLineInfo),
          trailingNewLine: false
        };
      }
    } else {
      const commandExecutable = task.command.runtime !== RuntimeType.CustomExecution ? CommandString.value(command) : void 0;
      const executable = !isShellCommand ? await this._resolveVariable(variableResolver, await this._resolveVariable(variableResolver, "${" + _TerminalTaskSystem.ProcessVarName + "}")) : commandExecutable;
      shellLaunchConfig = {
        name: terminalName,
        type,
        icon: task.configurationProperties.icon?.id ? ThemeIcon.fromId(task.configurationProperties.icon.id) : void 0,
        color: task.configurationProperties.icon?.color || void 0,
        executable,
        args: args.map((a) => Types.isString(a) ? a : a.value),
        waitOnExit
      };
      if (task.command.presentation && task.command.presentation.echo) {
        const getArgsToEcho = (args2) => {
          if (!args2 || args2.length === 0) {
            return "";
          }
          if (Types.isString(args2)) {
            return args2;
          }
          return args2.join(" ");
        };
        if (needsFolderQualification && workspaceFolder) {
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executingInFolder",
            comment: ["The workspace folder the task is running in", "The task command line or label"]
          }, "Executing task in folder {0}: {1}", workspaceFolder.name, `${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)}`), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(void 0);
        } else {
          shellLaunchConfig.initialText = this.taskShellIntegrationStartSequence(cwd) + formatMessageForTerminal(nls.localize({
            key: "task.executing.shell-integration",
            comment: ["The task command line or label"]
          }, "Executing task: {0}", `${shellLaunchConfig.executable} ${getArgsToEcho(shellLaunchConfig.args)}`), { excludeLeadingNewLine: true }) + this.getTaskShellIntegrationOutputSequence(void 0);
        }
      } else {
        shellLaunchConfig.initialText = {
          text: this.taskShellIntegrationStartSequence(cwd) + this.getTaskShellIntegrationOutputSequence(void 0),
          trailingNewLine: false
        };
      }
    }
    if (cwd) {
      shellLaunchConfig.cwd = cwd;
    }
    if (options.env) {
      if (shellLaunchConfig.env) {
        shellLaunchConfig.env = { ...shellLaunchConfig.env, ...options.env };
      } else {
        shellLaunchConfig.env = options.env;
      }
    }
    shellLaunchConfig.isFeatureTerminal = true;
    shellLaunchConfig.useShellEnvironment = true;
    shellLaunchConfig.tabActions = this._terminalTabActions;
    return shellLaunchConfig;
  }
  _addAllArgument(shellCommandArgs, configuredShellArgs) {
    const combinedShellArgs = Objects.deepClone(configuredShellArgs);
    shellCommandArgs.forEach((element) => {
      const shouldAddShellCommandArg = configuredShellArgs.every((arg, index) => {
        if (arg.toLowerCase() === element && configuredShellArgs.length > index + 1) {
          return !configuredShellArgs.slice(index + 1).every((testArg) => testArg.startsWith("-"));
        } else {
          return arg.toLowerCase() !== element;
        }
      });
      if (shouldAddShellCommandArg) {
        combinedShellArgs.push(element);
      }
    });
    return combinedShellArgs;
  }
  async _reconnectToTerminal(task) {
    const reconnectedInstances = this._terminalService.instances.filter((e) => e.reconnectionProperties?.ownerId === TaskTerminalType);
    return reconnectedInstances.find((e) => getReconnectionData(e)?.lastTask === task.getCommonTaskId());
  }
  async _doCreateTerminal(task, group, launchConfigs) {
    const reconnectedTerminal = await this._reconnectToTerminal(task);
    const registerOnDisposed = (terminal) => {
      const listener = terminal.onDisposed(() => {
        this._fireTaskEvent(TaskEvent.terminated(task, terminal.instanceId, terminal.exitReason));
        listener.dispose();
      });
    };
    if (reconnectedTerminal) {
      if ((CustomTask.is(task) || ContributedTask.is(task)) && task.command.presentation) {
        reconnectedTerminal.waitOnExit = getWaitOnExitValue(task.command.presentation, task.configurationProperties);
      }
      registerOnDisposed(reconnectedTerminal);
      this._logService.trace("reconnected to task and terminal", task._id);
      return reconnectedTerminal;
    }
    if (group) {
      for (const terminal of Object.values(this._terminals)) {
        if (terminal.group === group) {
          this._logService.trace(`Found terminal to split for group ${group}`);
          const originalInstance = terminal.terminal;
          const result = await this._terminalService.createTerminal({ location: { parentTerminal: originalInstance }, config: launchConfigs });
          registerOnDisposed(result);
          if (result) {
            return result;
          }
        }
      }
      this._logService.trace(`No terminal found to split for group ${group}`);
    }
    const createdTerminal = await this._terminalService.createTerminal({ config: launchConfigs });
    registerOnDisposed(createdTerminal);
    return createdTerminal;
  }
  _reconnectToTerminals() {
    if (this._hasReconnected) {
      this._logService.trace(`Already reconnected to terminals, so returning`);
      return;
    }
    const reconnectedInstances = this._terminalService.instances.filter((e) => e.reconnectionProperties?.ownerId === TaskTerminalType);
    this._logService.trace(`Attempting reconnection of ${reconnectedInstances.length} terminals`);
    if (!reconnectedInstances.length) {
      this._logService.trace(`No terminals to reconnect to so returning`);
    } else {
      for (const terminal of reconnectedInstances) {
        const data = getReconnectionData(terminal);
        if (data) {
          const terminalData = { lastTask: data.lastTask, group: data.group, terminal, shellIntegrationNonce: data.shellIntegrationNonce };
          this._terminals[terminal.instanceId] = terminalData;
          const listener = terminal.onDisposed(() => {
            this._deleteTaskAndTerminal(terminal, terminalData);
            listener.dispose();
          });
          this._logService.trace("Reconnecting to task terminal", terminalData.lastTask, terminal.instanceId);
        }
      }
    }
    this._hasReconnected = true;
  }
  _deleteTaskAndTerminal(terminal, terminalData) {
    delete this._terminals[terminal.instanceId];
    delete this._sameTaskTerminals[terminalData.lastTask];
    this._idleTaskTerminals.delete(terminalData.lastTask);
    const mapKey = terminalData.lastTask;
    const cur = this._activeTasks[mapKey];
    if (cur && cur.terminal === terminal) {
      this._removeFromActiveTasks(mapKey);
    }
    if (this._busyTasks[mapKey]) {
      delete this._busyTasks[mapKey];
    }
  }
  async _createTerminal(task, resolver, workspaceFolder) {
    const platform = resolver.taskSystemInfo ? resolver.taskSystemInfo.platform : Platform.platform;
    const options = await this._resolveOptions(resolver, task.command.options);
    const presentationOptions = task.command.presentation;
    if (!presentationOptions) {
      throw new Error("Task presentation options should not be undefined here.");
    }
    const waitOnExit = getWaitOnExitValue(presentationOptions, task.configurationProperties);
    let command;
    let args;
    let launchConfigs;
    if (task.command.runtime === RuntimeType.CustomExecution) {
      this._currentTask.shellLaunchConfig = launchConfigs = {
        customPtyImplementation: (id, cols, rows) => new TerminalProcessExtHostProxy(id, cols, rows, this._terminalService),
        waitOnExit,
        name: this._createTerminalName(task),
        initialText: task.command.presentation && task.command.presentation.echo ? formatMessageForTerminal(nls.localize({
          key: "task.executing",
          comment: ["The task command line or label"]
        }, "Executing task: {0}", task._label), { excludeLeadingNewLine: true }) : void 0,
        isFeatureTerminal: true,
        icon: task.configurationProperties.icon?.id ? ThemeIcon.fromId(task.configurationProperties.icon.id) : void 0,
        color: task.configurationProperties.icon?.color || void 0
      };
    } else {
      const resolvedResult = await this._resolveCommandAndArgs(resolver, task.command);
      command = resolvedResult.command;
      args = resolvedResult.args;
      this._currentTask.shellLaunchConfig = launchConfigs = await this._createShellLaunchConfig(task, workspaceFolder, resolver, platform, options, command, args, waitOnExit, presentationOptions);
      if (launchConfigs === void 0) {
        return [void 0, new TaskError(Severity.Error, nls.localize("TerminalTaskSystem", "Can't execute a shell command on an UNC drive using cmd.exe."), TaskErrors.UnknownError)];
      }
    }
    const prefersSameTerminal = presentationOptions.panel === PanelKind.Dedicated;
    const allowsSharedTerminal = presentationOptions.panel === PanelKind.Shared;
    const group = presentationOptions.group;
    const taskKey = task.getMapKey();
    let terminalToReuse;
    if (prefersSameTerminal) {
      const terminalId = this._sameTaskTerminals[taskKey];
      if (terminalId) {
        terminalToReuse = this._terminals[terminalId];
        delete this._sameTaskTerminals[taskKey];
      }
    } else if (allowsSharedTerminal) {
      let terminalId = this._idleTaskTerminals.remove(taskKey);
      if (!terminalId) {
        for (const taskId of this._idleTaskTerminals.keys()) {
          const idleTerminalId = this._idleTaskTerminals.get(taskId);
          if (idleTerminalId && this._terminals[idleTerminalId] && this._terminals[idleTerminalId].group === group) {
            terminalId = this._idleTaskTerminals.remove(taskId);
            break;
          }
        }
      }
      if (terminalId) {
        terminalToReuse = this._terminals[terminalId];
      }
    }
    if (terminalToReuse) {
      if (!launchConfigs) {
        throw new Error("Task shell launch configuration should not be undefined here.");
      }
      terminalToReuse.terminal.scrollToBottom();
      if (task.configurationProperties.isBackground) {
        launchConfigs.reconnectionProperties = { ownerId: TaskTerminalType, data: { lastTask: task.getCommonTaskId(), group, label: task._label, id: task._id } };
      }
      if (terminalToReuse.shellIntegrationNonce) {
        if (Types.isString(launchConfigs.initialText) && launchConfigs.shellIntegrationNonce) {
          launchConfigs.initialText = launchConfigs.initialText.replace(launchConfigs.shellIntegrationNonce, terminalToReuse.shellIntegrationNonce);
        }
      }
      await terminalToReuse.terminal.reuseTerminal(launchConfigs);
      if (task.command.presentation && task.command.presentation.clear) {
        terminalToReuse.terminal.clearBuffer();
      }
      this._terminals[terminalToReuse.terminal.instanceId.toString()].lastTask = taskKey;
      return [terminalToReuse.terminal, void 0];
    }
    this._terminalCreationQueue = this._terminalCreationQueue.then(() => this._doCreateTerminal(task, group, launchConfigs));
    const terminal = await this._terminalCreationQueue;
    if (task.configurationProperties.isBackground) {
      terminal.shellLaunchConfig.reconnectionProperties = { ownerId: TaskTerminalType, data: { lastTask: task.getCommonTaskId(), group, label: task._label, id: task._id } };
    }
    const terminalKey = terminal.instanceId.toString();
    const terminalData = { terminal, lastTask: taskKey, group, shellIntegrationNonce: terminal.shellLaunchConfig.shellIntegrationNonce };
    const onDisposedListener = terminal.onDisposed(() => {
      this._deleteTaskAndTerminal(terminal, terminalData);
      onDisposedListener.dispose();
    });
    this._terminals[terminalKey] = terminalData;
    terminal.shellLaunchConfig.tabActions = this._terminalTabActions;
    return [terminal, void 0];
  }
  _buildShellCommandLine(platform, shellExecutable, shellOptions, command, originalCommand, args) {
    const basename = path.parse(shellExecutable).name.toLowerCase();
    const shellQuoteOptions = this._getQuotingOptions(basename, shellOptions, platform);
    function needsQuotes(value2) {
      if (value2.length >= 2) {
        const first = value2[0] === shellQuoteOptions.strong ? shellQuoteOptions.strong : value2[0] === shellQuoteOptions.weak ? shellQuoteOptions.weak : void 0;
        if (first === value2[value2.length - 1]) {
          return false;
        }
      }
      let quote2;
      for (let i = 0; i < value2.length; i++) {
        const ch = value2[i];
        if (ch === quote2) {
          quote2 = void 0;
        } else if (quote2 !== void 0) {
          continue;
        } else if (ch === shellQuoteOptions.escape) {
          i++;
        } else if (ch === shellQuoteOptions.strong || ch === shellQuoteOptions.weak) {
          quote2 = ch;
        } else if (ch === " ") {
          return true;
        }
      }
      return false;
    }
    function quote(value2, kind) {
      if (kind === ShellQuoting.Strong && shellQuoteOptions.strong) {
        return [shellQuoteOptions.strong + value2 + shellQuoteOptions.strong, true];
      } else if (kind === ShellQuoting.Weak && shellQuoteOptions.weak) {
        return [shellQuoteOptions.weak + value2 + shellQuoteOptions.weak, true];
      } else if (kind === ShellQuoting.Escape && shellQuoteOptions.escape) {
        if (Types.isString(shellQuoteOptions.escape)) {
          return [value2.replace(/ /g, shellQuoteOptions.escape + " "), true];
        } else {
          const buffer = [];
          for (const ch of shellQuoteOptions.escape.charsToEscape) {
            buffer.push(`\\${ch}`);
          }
          const regexp = new RegExp("[" + buffer.join(",") + "]", "g");
          const escapeChar = shellQuoteOptions.escape.escapeChar;
          return [value2.replace(regexp, (match) => escapeChar + match), true];
        }
      }
      return [value2, false];
    }
    function quoteIfNecessary(value2) {
      if (Types.isString(value2)) {
        if (needsQuotes(value2)) {
          return quote(value2, ShellQuoting.Strong);
        } else {
          return [value2, false];
        }
      } else {
        return quote(value2.value, value2.quoting);
      }
    }
    if ((!args || args.length === 0) && Types.isString(command) && (command === originalCommand || needsQuotes(originalCommand))) {
      return command;
    }
    const result = [];
    let commandQuoted = false;
    let argQuoted = false;
    let value;
    let quoted;
    [value, quoted] = quoteIfNecessary(command);
    result.push(value);
    commandQuoted = quoted;
    for (const arg of args) {
      [value, quoted] = quoteIfNecessary(arg);
      result.push(value);
      argQuoted = argQuoted || quoted;
    }
    let commandLine = result.join(" ");
    if (platform === Platform.Platform.Windows) {
      if (basename === "cmd" && commandQuoted && argQuoted) {
        commandLine = '"' + commandLine + '"';
      } else if ((basename === "powershell" || basename === "pwsh") && commandQuoted) {
        commandLine = "& " + commandLine;
      }
    }
    return commandLine;
  }
  _getQuotingOptions(shellBasename, shellOptions, platform) {
    if (shellOptions && shellOptions.quoting) {
      return shellOptions.quoting;
    }
    return _TerminalTaskSystem._shellQuotes[shellBasename] || _TerminalTaskSystem._osShellQuotes[Platform.PlatformToString(platform)];
  }
  _collectTaskVariables(variables, task) {
    if (task.command && task.command.name) {
      this._collectCommandVariables(variables, task.command, task);
    }
    this._collectMatcherVariables(variables, task.configurationProperties.problemMatchers);
    if (task.command.runtime === RuntimeType.CustomExecution && (CustomTask.is(task) || ContributedTask.is(task))) {
      let definition;
      if (CustomTask.is(task)) {
        definition = task._source.config.element;
      } else {
        definition = Objects.deepClone(task.defines);
        delete definition._key;
        delete definition.type;
      }
      this._collectDefinitionVariables(variables, definition);
    }
  }
  _collectDefinitionVariables(variables, definition) {
    if (Types.isString(definition)) {
      this._collectVariables(variables, definition);
    } else if (Array.isArray(definition)) {
      definition.forEach((element) => this._collectDefinitionVariables(variables, element));
    } else if (Types.isObject(definition)) {
      for (const key of Object.keys(definition)) {
        this._collectDefinitionVariables(variables, definition[key]);
      }
    }
  }
  _collectCommandVariables(variables, command, task) {
    if (command.runtime === RuntimeType.CustomExecution) {
      return;
    }
    if (command.name === void 0) {
      throw new Error("Command name should never be undefined here.");
    }
    this._collectVariables(variables, command.name);
    command.args?.forEach((arg) => this._collectVariables(variables, arg));
    const scope = task._source.scope;
    if (scope !== TaskScope.Global) {
      variables.add("${workspaceFolder}");
    }
    if (command.options) {
      const options = command.options;
      if (options.cwd) {
        this._collectVariables(variables, options.cwd);
      }
      const optionsEnv = options.env;
      if (optionsEnv) {
        Object.keys(optionsEnv).forEach((key) => {
          const value = optionsEnv[key];
          if (Types.isString(value)) {
            this._collectVariables(variables, value);
          }
        });
      }
      if (options.shell) {
        if (options.shell.executable) {
          this._collectVariables(variables, options.shell.executable);
        }
        options.shell.args?.forEach((arg) => this._collectVariables(variables, arg));
      }
    }
  }
  _collectMatcherVariables(variables, values) {
    if (values === void 0 || values === null || values.length === 0) {
      return;
    }
    values.forEach((value) => {
      let matcher;
      if (Types.isString(value)) {
        if (value[0] === "$") {
          matcher = ProblemMatcherRegistry.get(value.substring(1));
        } else {
          matcher = ProblemMatcherRegistry.get(value);
        }
      } else {
        matcher = value;
      }
      if (matcher && matcher.filePrefix) {
        if (Types.isString(matcher.filePrefix)) {
          this._collectVariables(variables, matcher.filePrefix);
        } else {
          for (const fp of [...asArray(matcher.filePrefix.include || []), ...asArray(matcher.filePrefix.exclude || [])]) {
            this._collectVariables(variables, fp);
          }
        }
      }
    });
  }
  _collectVariables(variables, value) {
    const string = Types.isString(value) ? value : value.value;
    const r = /\$\{(.*?)\}/g;
    let matches;
    do {
      matches = r.exec(string);
      if (matches) {
        variables.add(matches[0]);
      }
    } while (matches);
  }
  async _resolveCommandAndArgs(resolver, commandConfig) {
    let args = commandConfig.args ? commandConfig.args.slice() : [];
    args = await this._resolveVariables(resolver, args);
    const command = await this._resolveVariable(resolver, commandConfig.name);
    return { command, args };
  }
  async _resolveVariables(resolver, value) {
    return Promise.all(value.map((s) => this._resolveVariable(resolver, s)));
  }
  async _resolveMatchers(resolver, values) {
    if (values === void 0 || values === null || values.length === 0) {
      return [];
    }
    const result = [];
    for (const value of values) {
      let matcher;
      if (Types.isString(value)) {
        if (value[0] === "$") {
          matcher = ProblemMatcherRegistry.get(value.substring(1));
        } else {
          matcher = ProblemMatcherRegistry.get(value);
        }
      } else {
        matcher = value;
      }
      if (!matcher) {
        this._appendOutput(nls.localize("unknownProblemMatcher", "Problem matcher {0} can't be resolved. The matcher will be ignored"));
        continue;
      }
      const taskSystemInfo = resolver.taskSystemInfo;
      const hasFilePrefix = matcher.filePrefix !== void 0;
      const hasUriProvider = taskSystemInfo !== void 0 && taskSystemInfo.uriProvider !== void 0;
      if (!hasFilePrefix && !hasUriProvider) {
        result.push(matcher);
      } else {
        const copy = Objects.deepClone(matcher);
        if (hasUriProvider && taskSystemInfo !== void 0) {
          copy.uriProvider = taskSystemInfo.uriProvider;
        }
        if (hasFilePrefix) {
          const filePrefix = copy.filePrefix;
          if (Types.isString(filePrefix)) {
            copy.filePrefix = await this._resolveVariable(resolver, filePrefix);
          } else if (filePrefix !== void 0) {
            if (filePrefix.include) {
              filePrefix.include = Array.isArray(filePrefix.include) ? await Promise.all(filePrefix.include.map((x) => this._resolveVariable(resolver, x))) : await this._resolveVariable(resolver, filePrefix.include);
            }
            if (filePrefix.exclude) {
              filePrefix.exclude = Array.isArray(filePrefix.exclude) ? await Promise.all(filePrefix.exclude.map((x) => this._resolveVariable(resolver, x))) : await this._resolveVariable(resolver, filePrefix.exclude);
            }
          }
        }
        result.push(copy);
      }
    }
    return result;
  }
  async _resolveVariable(resolver, value) {
    if (Types.isString(value)) {
      return resolver.resolve(value);
    } else if (value !== void 0) {
      return {
        value: await resolver.resolve(value.value),
        quoting: value.quoting
      };
    } else {
      throw new Error("Should never try to resolve undefined.");
    }
  }
  async _resolveOptions(resolver, options) {
    if (options === void 0 || options === null) {
      let cwd;
      try {
        cwd = await this._resolveVariable(resolver, "${workspaceFolder}");
      } catch (e) {
      }
      return { cwd };
    }
    const result = Types.isString(options.cwd) ? { cwd: await this._resolveVariable(resolver, options.cwd) } : { cwd: await this._resolveVariable(resolver, "${workspaceFolder}") };
    if (options.env) {
      result.env = /* @__PURE__ */ Object.create(null);
      for (const key of Object.keys(options.env)) {
        const value = options.env[key];
        if (Types.isString(value)) {
          result.env[key] = await this._resolveVariable(resolver, value);
        } else {
          result.env[key] = String(value);
        }
      }
    }
    return result;
  }
  getSanitizedCommand(cmd) {
    let result = cmd.toLowerCase();
    const index = result.lastIndexOf(path.sep);
    if (index !== -1) {
      result = result.substring(index + 1);
    }
    if (_TerminalTaskSystem.WellKnownCommands[result]) {
      return result;
    }
    return "other";
  }
  async getTaskForTerminal(instanceId) {
    for (const key of Object.keys(this._activeTasks)) {
      const activeTask = this._activeTasks[key];
      if (activeTask.terminal?.instanceId === instanceId) {
        return activeTask.task;
      }
    }
    const terminalData = this._terminals[instanceId.toString()];
    if (terminalData?.lastTask) {
      return await this._taskLookup(terminalData.lastTask);
    }
    return void 0;
  }
  _appendOutput(output) {
    const outputChannel = this._outputService.getChannel(this._outputChannelId);
    outputChannel?.append(output);
  }
};
_TerminalTaskSystem.TelemetryEventName = "taskService";
_TerminalTaskSystem.ProcessVarName = "__process__";
_TerminalTaskSystem._shellQuotes = {
  "cmd": {
    strong: '"'
  },
  "powershell": {
    escape: {
      escapeChar: "`",
      charsToEscape: ` "'()`
    },
    strong: "'",
    weak: '"'
  },
  "bash": {
    escape: {
      escapeChar: "\\",
      charsToEscape: ` "'`
    },
    strong: "'",
    weak: '"'
  },
  "zsh": {
    escape: {
      escapeChar: "\\",
      charsToEscape: ` "'`
    },
    strong: "'",
    weak: '"'
  }
};
_TerminalTaskSystem._osShellQuotes = {
  "Linux": _TerminalTaskSystem._shellQuotes["bash"],
  "Mac": _TerminalTaskSystem._shellQuotes["bash"],
  "Windows": _TerminalTaskSystem._shellQuotes["powershell"]
};
_TerminalTaskSystem.WellKnownCommands = {
  "ant": true,
  "cmake": true,
  "eslint": true,
  "gradle": true,
  "grunt": true,
  "gulp": true,
  "jake": true,
  "jenkins": true,
  "jshint": true,
  "make": true,
  "maven": true,
  "msbuild": true,
  "msc": true,
  "nmake": true,
  "npm": true,
  "rake": true,
  "tsc": true,
  "xbuild": true
};
let TerminalTaskSystem = _TerminalTaskSystem;
function getWaitOnExitValue(presentationOptions, configurationProperties) {
  if (presentationOptions.close === void 0 || presentationOptions.close === false) {
    if (presentationOptions.reveal !== RevealKind.Never || !configurationProperties.isBackground || presentationOptions.close === false) {
      if (presentationOptions.panel === PanelKind.New) {
        return taskShellIntegrationWaitOnExitSequence(nls.localize("closeTerminal", "Press any key to close the terminal."));
      } else if (presentationOptions.showReuseMessage) {
        return taskShellIntegrationWaitOnExitSequence(nls.localize("reuseTerminal", "Terminal will be reused by tasks, press any key to close it."));
      } else {
        return true;
      }
    }
  }
  return !presentationOptions.close;
}
function taskShellIntegrationWaitOnExitSequence(message) {
  return (exitCode) => {
    return `${VSCodeSequence(VSCodeOscPt.CommandFinished, exitCode.toString())}${message}`;
  };
}
function getReconnectionData(terminal) {
  return terminal.shellLaunchConfig.attachPersistentProcess?.reconnectionProperties?.data;
}
export {
  TerminalTaskSystem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2Jyb3dzZXIvdGVybWluYWxUYXNrU3lzdGVtLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgYXNBcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgKiBhcyBBc3luYyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgaXNVTkMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9leHRwYXRoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTGlua2VkTWFwLCBUb3VjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgKiBhcyBPYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIFBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCAqIGFzIFR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuXG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU1hcmtlckRhdGEsIElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IE1hcmtlcnMgfSBmcm9tICcuLi8uLi9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFByb2JsZW1NYXRjaGVyLCBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5IC8qLCBQcm9ibGVtUGF0dGVybiwgZ2V0UmVzb3VyY2UgKi8gfSBmcm9tICcuLi9jb21tb24vcHJvYmxlbU1hdGNoZXIuanMnO1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU2hlbGxMYXVuY2hDb25maWcsIFdhaXRPbkV4aXRWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxTdHJpbmdzLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUYXNrVGVybWluYWxTdGF0dXMgfSBmcm9tICcuL3Rhc2tUZXJtaW5hbFN0YXR1cy5qcyc7XG5pbXBvcnQgeyBQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kLCBQcm9ibGVtSGFuZGxpbmdTdHJhdGVneSwgU3RhcnRTdG9wUHJvYmxlbUNvbGxlY3RvciwgV2F0Y2hpbmdQcm9ibGVtQ29sbGVjdG9yIH0gZnJvbSAnLi4vY29tbW9uL3Byb2JsZW1Db2xsZWN0b3JzLmpzJztcbmltcG9ydCB7IEdyb3VwS2luZCB9IGZyb20gJy4uL2NvbW1vbi90YXNrQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZVNldCwgSVJlc29sdmVkVmFyaWFibGVzLCBJVGFza0V4ZWN1dGVSZXN1bHQsIElUYXNrUmVzb2x2ZXIsIElUYXNrU3VtbWFyeSwgSVRhc2tTeXN0ZW0sIElUYXNrU3lzdGVtSW5mbywgSVRhc2tTeXN0ZW1JbmZvUmVzb2x2ZXIsIElUYXNrVGVybWluYXRlUmVzcG9uc2UsIFRhc2tFcnJvciwgVGFza0Vycm9ycywgVGFza0V4ZWN1dGVLaW5kLCBUcmlnZ2VycywgVmVyaWZpZWRUYXNrIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tTeXN0ZW0uanMnO1xuaW1wb3J0IHsgQ29tbWFuZE9wdGlvbnMsIENvbW1hbmRTdHJpbmcsIENvbnRyaWJ1dGVkVGFzaywgQ3VzdG9tVGFzaywgRGVwZW5kc09yZGVyLCBJQ29tbWFuZENvbmZpZ3VyYXRpb24sIElDb25maWd1cmF0aW9uUHJvcGVydGllcywgSUV4dGVuc2lvblRhc2tTb3VyY2UsIElQcmVzZW50YXRpb25PcHRpb25zLCBJU2hlbGxDb25maWd1cmF0aW9uLCBJU2hlbGxRdW90aW5nT3B0aW9ucywgSVRhc2tFdmVudCwgSW5NZW1vcnlUYXNrLCBQYW5lbEtpbmQsIFJlcnVuRm9yQWN0aXZlVGVybWluYWxDb21tYW5kSWQsIFJldmVhbEtpbmQsIFJldmVhbFByb2JsZW1LaW5kLCBSdW50aW1lVHlwZSwgU2hlbGxRdW90aW5nLCBUQVNLX1RFUk1JTkFMX0FDVElWRSwgVGFzaywgVGFza0V2ZW50LCBUYXNrRXZlbnRLaW5kLCBUYXNrU2NvcGUsIFRhc2tTb3VyY2VLaW5kLCByZXJ1blRhc2tJY29uIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEdyb3VwU2VydmljZSwgSVRlcm1pbmFsSW5zdGFuY2UsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFZTQ29kZU9zY1Byb3BlcnR5LCBWU0NvZGVPc2NQdCwgVlNDb2RlU2VxdWVuY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsRXNjYXBlU2VxdWVuY2VzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsUHJvY2Vzc0V4dEhvc3RQcm94eSB9IGZyb20gJy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5LmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UsIFRFUk1JTkFMX1ZJRVdfSUQgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYW5lY29tcG9zaXRlL2Jyb3dzZXIvcGFuZWNvbXBvc2l0ZS5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBUYXNrUHJvYmxlbU1vbml0b3IgfSBmcm9tICcuL3Rhc2tQcm9ibGVtTW9uaXRvci5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IHNlcmlhbGl6ZVZTQ29kZU9zY01lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24veHRlcm0vc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmpzJztcblxuaW50ZXJmYWNlIElUZXJtaW5hbERhdGEge1xuXHR0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2U7XG5cdGxhc3RUYXNrOiBzdHJpbmc7XG5cdGdyb3VwPzogc3RyaW5nO1xuXHRzaGVsbEludGVncmF0aW9uTm9uY2U/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJSW5zdGFuY2VDb3VudCB7XG5cdGNvdW50OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJQWN0aXZlVGVybWluYWxEYXRhIHtcblx0dGVybWluYWw/OiBJVGVybWluYWxJbnN0YW5jZTtcblx0dGFzazogVGFzaztcblx0cHJvbWlzZTogUHJvbWlzZTxJVGFza1N1bW1hcnk+O1xuXHRzdGF0ZT86IFRhc2tFdmVudEtpbmQ7XG5cdGNvdW50OiBJSW5zdGFuY2VDb3VudDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVjb25uZWN0aW9uVGFza0RhdGEge1xuXHRsYWJlbDogc3RyaW5nO1xuXHRpZDogc3RyaW5nO1xuXHRsYXN0VGFzazogc3RyaW5nO1xuXHRncm91cD86IHN0cmluZztcblx0c2hlbGxJbnRlZ3JhdGlvbk5vbmNlPzogc3RyaW5nO1xufVxuXG5jb25zdCBUYXNrVGVybWluYWxUeXBlID0gJ1Rhc2snO1xuXG5jbGFzcyBWYXJpYWJsZVJlc29sdmVyIHtcblx0cHJpdmF0ZSBzdGF0aWMgX3JlZ2V4ID0gL1xcJFxceyguKj8pXFx9L2c7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsIHB1YmxpYyB0YXNrU3lzdGVtSW5mbzogSVRhc2tTeXN0ZW1JbmZvIHwgdW5kZWZpbmVkLCBwdWJsaWMgcmVhZG9ubHkgdmFsdWVzOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBwcml2YXRlIF9zZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB8IHVuZGVmaW5lZCkge1xuXHR9XG5cdGFzeW5jIHJlc29sdmUodmFsdWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgcmVwbGFjZXJzOiBQcm9taXNlPHN0cmluZz5bXSA9IFtdO1xuXHRcdHZhbHVlLnJlcGxhY2UoVmFyaWFibGVSZXNvbHZlci5fcmVnZXgsIChtYXRjaCwgLi4uYXJncykgPT4ge1xuXHRcdFx0cmVwbGFjZXJzLnB1c2godGhpcy5fcmVwbGFjZXIobWF0Y2gsIGFyZ3MpKTtcblx0XHRcdHJldHVybiBtYXRjaDtcblx0XHR9KTtcblx0XHRjb25zdCByZXNvbHZlZFJlcGxhY2VycyA9IGF3YWl0IFByb21pc2UuYWxsKHJlcGxhY2Vycyk7XG5cdFx0cmV0dXJuIHZhbHVlLnJlcGxhY2UoVmFyaWFibGVSZXNvbHZlci5fcmVnZXgsICgpID0+IHJlc29sdmVkUmVwbGFjZXJzLnNoaWZ0KCkhKTtcblxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVwbGFjZXIobWF0Y2g6IHN0cmluZywgYXJnczogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdC8vIFN0cmlwIG91dCB0aGUgJHt9IGJlY2F1c2UgdGhlIG1hcCBjb250YWlucyB0aGVtIHZhcmlhYmxlcyB3aXRob3V0IHRob3NlIGNoYXJhY3RlcnMuXG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy52YWx1ZXMuZ2V0KG1hdGNoLnN1YnN0cmluZygyLCBtYXRjaC5sZW5ndGggLSAxKSk7XG5cdFx0aWYgKChyZXN1bHQgIT09IHVuZGVmaW5lZCkgJiYgKHJlc3VsdCAhPT0gbnVsbCkpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VydmljZS5yZXNvbHZlQXN5bmModGhpcy53b3Jrc3BhY2VGb2xkZXIsIG1hdGNoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1hdGNoO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsVGFza1N5c3RlbSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVGFza1N5c3RlbSB7XG5cblx0cHVibGljIHN0YXRpYyBUZWxlbWV0cnlFdmVudE5hbWU6IHN0cmluZyA9ICd0YXNrU2VydmljZSc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUHJvY2Vzc1Zhck5hbWUgPSAnX19wcm9jZXNzX18nO1xuXG5cdHByaXZhdGUgc3RhdGljIF9zaGVsbFF1b3RlczogSVN0cmluZ0RpY3Rpb25hcnk8SVNoZWxsUXVvdGluZ09wdGlvbnM+ID0ge1xuXHRcdCdjbWQnOiB7XG5cdFx0XHRzdHJvbmc6ICdcIidcblx0XHR9LFxuXHRcdCdwb3dlcnNoZWxsJzoge1xuXHRcdFx0ZXNjYXBlOiB7XG5cdFx0XHRcdGVzY2FwZUNoYXI6ICdgJyxcblx0XHRcdFx0Y2hhcnNUb0VzY2FwZTogJyBcIlxcJygpJ1xuXHRcdFx0fSxcblx0XHRcdHN0cm9uZzogJ1xcJycsXG5cdFx0XHR3ZWFrOiAnXCInXG5cdFx0fSxcblx0XHQnYmFzaCc6IHtcblx0XHRcdGVzY2FwZToge1xuXHRcdFx0XHRlc2NhcGVDaGFyOiAnXFxcXCcsXG5cdFx0XHRcdGNoYXJzVG9Fc2NhcGU6ICcgXCJcXCcnXG5cdFx0XHR9LFxuXHRcdFx0c3Ryb25nOiAnXFwnJyxcblx0XHRcdHdlYWs6ICdcIidcblx0XHR9LFxuXHRcdCd6c2gnOiB7XG5cdFx0XHRlc2NhcGU6IHtcblx0XHRcdFx0ZXNjYXBlQ2hhcjogJ1xcXFwnLFxuXHRcdFx0XHRjaGFyc1RvRXNjYXBlOiAnIFwiXFwnJ1xuXHRcdFx0fSxcblx0XHRcdHN0cm9uZzogJ1xcJycsXG5cdFx0XHR3ZWFrOiAnXCInXG5cdFx0fVxuXHR9O1xuXG5cdHByaXZhdGUgc3RhdGljIF9vc1NoZWxsUXVvdGVzOiBJU3RyaW5nRGljdGlvbmFyeTxJU2hlbGxRdW90aW5nT3B0aW9ucz4gPSB7XG5cdFx0J0xpbnV4JzogVGVybWluYWxUYXNrU3lzdGVtLl9zaGVsbFF1b3Rlc1snYmFzaCddLFxuXHRcdCdNYWMnOiBUZXJtaW5hbFRhc2tTeXN0ZW0uX3NoZWxsUXVvdGVzWydiYXNoJ10sXG5cdFx0J1dpbmRvd3MnOiBUZXJtaW5hbFRhc2tTeXN0ZW0uX3NoZWxsUXVvdGVzWydwb3dlcnNoZWxsJ11cblx0fTtcblxuXHRwcml2YXRlIF9hY3RpdmVUYXNrczogSVN0cmluZ0RpY3Rpb25hcnk8SUFjdGl2ZVRlcm1pbmFsRGF0YT47XG5cdHByaXZhdGUgX2J1c3lUYXNrczogSVN0cmluZ0RpY3Rpb25hcnk8VGFzaz47XG5cdHByaXZhdGUgX3Rhc2tFcnJvcnM6IElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+OyAvLyBUcmFja3Mgd2hpY2ggdGFza3MgaGFkIGVycm9ycyBmcm9tIHByb2JsZW0gbWF0Y2hlcnNcblx0cHJpdmF0ZSBfdGFza0RlcGVuZGVuY2llczogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nW10+OyAvLyBUcmFja3Mgd2hpY2ggdGFza3MgZGVwZW5kIG9uIHdoaWNoIG90aGVyIHRhc2tzXG5cdHByaXZhdGUgX3Rlcm1pbmFsczogSVN0cmluZ0RpY3Rpb25hcnk8SVRlcm1pbmFsRGF0YT47XG5cdHByaXZhdGUgX2lkbGVUYXNrVGVybWluYWxzOiBMaW5rZWRNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHRwcml2YXRlIF9zYW1lVGFza1Rlcm1pbmFsczogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPjtcblx0cHJpdmF0ZSBfdGFza1N5c3RlbUluZm9SZXNvbHZlcjogSVRhc2tTeXN0ZW1JbmZvUmVzb2x2ZXI7XG5cdHByaXZhdGUgX2xhc3RUYXNrOiBWZXJpZmllZFRhc2sgfCB1bmRlZmluZWQ7XG5cdC8vIFNob3VsZCBhbHdheXMgYmUgc2V0IGluIHJ1blxuXHRwcml2YXRlIF9jdXJyZW50VGFzayE6IFZlcmlmaWVkVGFzaztcblx0cHJpdmF0ZSBfaXNSZXJ1bjogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF9wcmV2aW91c1BhbmVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJldmlvdXNUZXJtaW5hbEluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdGVybWluYWxTdGF0dXNNYW5hZ2VyOiBUYXNrVGVybWluYWxTdGF0dXM7XG5cdHByaXZhdGUgX3Rhc2tQcm9ibGVtTW9uaXRvcjogVGFza1Byb2JsZW1Nb25pdG9yO1xuXHRwcml2YXRlIF90ZXJtaW5hbENyZWF0aW9uUXVldWU6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB2b2lkPiA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRwcml2YXRlIF9oYXNSZWNvbm5lY3RlZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN0YXRlQ2hhbmdlOiBFbWl0dGVyPElUYXNrRXZlbnQ+O1xuXHRwcml2YXRlIF90ZXJtaW5hbFRhYkFjdGlvbnMgPSBbeyBpZDogUmVydW5Gb3JBY3RpdmVUZXJtaW5hbENvbW1hbmRJZCwgbGFiZWw6IG5scy5sb2NhbGl6ZSgncmVydW5UYXNrJywgJ1JlcnVuIFRhc2snKSwgaWNvbjogcmVydW5UYXNrSWNvbiB9XTtcblx0cHJpdmF0ZSBfdGFza1Rlcm1pbmFsQWN0aXZlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFza1N0YXJ0VGltZXMgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYXB0dXJlZFRhc2tWYXJpYWJsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdHRhc2tTaGVsbEludGVncmF0aW9uU3RhcnRTZXF1ZW5jZShjd2Q6IHN0cmluZyB8IFVSSSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIChcblx0XHRcdFZTQ29kZVNlcXVlbmNlKFZTQ29kZU9zY1B0LlByb3BlcnR5LCBgJHtWU0NvZGVPc2NQcm9wZXJ0eS5IYXNSaWNoQ29tbWFuZERldGVjdGlvbn09VHJ1ZWApICtcblx0XHRcdFZTQ29kZVNlcXVlbmNlKFZTQ29kZU9zY1B0LlByb21wdFN0YXJ0KSArXG5cdFx0XHRWU0NvZGVTZXF1ZW5jZShWU0NvZGVPc2NQdC5Qcm9wZXJ0eSwgYCR7VlNDb2RlT3NjUHJvcGVydHkuVGFza309VHJ1ZWApICtcblx0XHRcdChjd2Rcblx0XHRcdFx0PyBWU0NvZGVTZXF1ZW5jZShWU0NvZGVPc2NQdC5Qcm9wZXJ0eSwgYCR7VlNDb2RlT3NjUHJvcGVydHkuQ3dkfT0ke3R5cGVvZiBjd2QgPT09ICdzdHJpbmcnID8gY3dkIDogY3dkLmZzUGF0aH1gKVxuXHRcdFx0XHQ6ICcnXG5cdFx0XHQpICtcblx0XHRcdFZTQ29kZVNlcXVlbmNlKFZTQ29kZU9zY1B0LkNvbW1hbmRTdGFydClcblx0XHQpO1xuXHR9XG5cdGdldFRhc2tTaGVsbEludGVncmF0aW9uT3V0cHV0U2VxdWVuY2UoY29tbWFuZExpbmVJbmZvOiB7IGNvbW1hbmRMaW5lOiBzdHJpbmc7IG5vbmNlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIChcblx0XHRcdChjb21tYW5kTGluZUluZm9cblx0XHRcdFx0PyBWU0NvZGVTZXF1ZW5jZShWU0NvZGVPc2NQdC5Db21tYW5kTGluZSwgYCR7c2VyaWFsaXplVlNDb2RlT3NjTWVzc2FnZShjb21tYW5kTGluZUluZm8uY29tbWFuZExpbmUpfTske2NvbW1hbmRMaW5lSW5mby5ub25jZX1gKVxuXHRcdFx0XHQ6ICcnXG5cdFx0XHQpICtcblx0XHRcdFZTQ29kZVNlcXVlbmNlKFZTQ29kZU9zY1B0LkNvbW1hbmRFeGVjdXRlZClcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlOiBJVGVybWluYWxHcm91cFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfb3V0cHV0U2VydmljZTogSU91dHB1dFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBfdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX21hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRwcml2YXRlIF9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRwcml2YXRlIF9jb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX2Vudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRwcml2YXRlIF9vdXRwdXRDaGFubmVsSWQ6IHN0cmluZyxcblx0XHRwcml2YXRlIF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSxcblx0XHRwcml2YXRlIF9wYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdHByaXZhdGUgX3ZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRwcml2YXRlIF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0dGFza1N5c3RlbUluZm9SZXNvbHZlcjogSVRhc2tTeXN0ZW1JbmZvUmVzb2x2ZXIsXG5cdFx0cHJpdmF0ZSBfdGFza0xvb2t1cDogKHRhc2tLZXk6IHN0cmluZykgPT4gUHJvbWlzZTxUYXNrIHwgdW5kZWZpbmVkPixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2FjdGl2ZVRhc2tzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9idXN5VGFza3MgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX3Rhc2tFcnJvcnMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX3Rhc2tEZXBlbmRlbmNpZXMgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdHRoaXMuX3Rlcm1pbmFscyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0dGhpcy5faWRsZVRhc2tUZXJtaW5hbHMgPSBuZXcgTGlua2VkTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdHRoaXMuX3NhbWVUYXNrVGVybWluYWxzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXIoKSk7XG5cdFx0dGhpcy5fdGFza1N5c3RlbUluZm9SZXNvbHZlciA9IHRhc2tTeXN0ZW1JbmZvUmVzb2x2ZXI7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxTdGF0dXNNYW5hZ2VyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFza1Rlcm1pbmFsU3RhdHVzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGFza1Byb2JsZW1Nb25pdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFza1Byb2JsZW1Nb25pdG9yKSk7XG5cdFx0dGhpcy5fdGFza1Rlcm1pbmFsQWN0aXZlID0gVEFTS19URVJNSU5BTF9BQ1RJVkUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZSgoZSkgPT4gdGhpcy5fdGFza1Rlcm1pbmFsQWN0aXZlLnNldChlPy5zaGVsbExhdW5jaENvbmZpZy50eXBlID09PSAnVGFzaycpKSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG9uRGlkU3RhdGVDaGFuZ2UoKTogRXZlbnQ8SVRhc2tFdmVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmV2ZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nKHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9hcHBlbmRPdXRwdXQodmFsdWUgKyAnXFxuJyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Nob3dPdXRwdXQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb3V0cHV0U2VydmljZS5zaG93Q2hhbm5lbCh0aGlzLl9vdXRwdXRDaGFubmVsSWQsIHRydWUpO1xuXHR9XG5cblx0cHVibGljIHJlY29ubmVjdCh0YXNrOiBUYXNrLCByZXNvbHZlcjogSVRhc2tSZXNvbHZlcik6IElUYXNrRXhlY3V0ZVJlc3VsdCB7XG5cdFx0dGhpcy5fcmVjb25uZWN0VG9UZXJtaW5hbHMoKTtcblx0XHRyZXR1cm4gdGhpcy5ydW4odGFzaywgcmVzb2x2ZXIsIFRyaWdnZXJzLnJlY29ubmVjdCk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKHRhc2s6IFRhc2ssIHJlc29sdmVyOiBJVGFza1Jlc29sdmVyLCB0cmlnZ2VyOiBzdHJpbmcgPSBUcmlnZ2Vycy5jb21tYW5kKTogSVRhc2tFeGVjdXRlUmVzdWx0IHtcblx0XHR0YXNrID0gdGFzay5jbG9uZSgpOyAvLyBBIHNtYWxsIGFtb3VudCBvZiB0YXNrIHN0YXRlIGlzIHN0b3JlZCBpbiB0aGUgdGFzayAoaW5zdGFuY2UpIGFuZCB0YXNrcyBwYXNzZWQgaW4gdG8gcnVuIG1heSBoYXZlIHRoYXQgc2V0IGFscmVhZHkuXG5cdFx0Y29uc3QgaW5zdGFuY2VzID0gSW5NZW1vcnlUYXNrLmlzKHRhc2spIHx8IHRoaXMuX2lzVGFza0VtcHR5KHRhc2spID8gW10gOiB0aGlzLl9nZXRJbnN0YW5jZXModGFzayk7XG5cdFx0Y29uc3QgdmFsaWRJbnN0YW5jZSA9IGluc3RhbmNlcy5sZW5ndGggPCAoKHRhc2sucnVuT3B0aW9ucyAmJiB0YXNrLnJ1bk9wdGlvbnMuaW5zdGFuY2VMaW1pdCkgPz8gMSk7XG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBpbnN0YW5jZXNbMF0/LmNvdW50Py5jb3VudCA/PyAwO1xuXHRcdHRoaXMuX2N1cnJlbnRUYXNrID0gbmV3IFZlcmlmaWVkVGFzayh0YXNrLCByZXNvbHZlciwgdHJpZ2dlcik7XG5cdFx0aWYgKGluc3RhbmNlID4gMCkge1xuXHRcdFx0dGFzay5pbnN0YW5jZSA9IGluc3RhbmNlO1xuXHRcdH1cblx0XHRpZiAoIXZhbGlkSW5zdGFuY2UpIHtcblx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IGluc3RhbmNlc1tpbnN0YW5jZXMubGVuZ3RoIC0gMV07XG5cdFx0XHR0aGlzLl9sYXN0VGFzayA9IHRoaXMuX2N1cnJlbnRUYXNrO1xuXHRcdFx0cmV0dXJuIHsga2luZDogVGFza0V4ZWN1dGVLaW5kLkFjdGl2ZSwgdGFzazogdGVybWluYWxEYXRhLnRhc2ssIGFjdGl2ZTogeyBzYW1lOiB0cnVlLCBiYWNrZ3JvdW5kOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCEgfSwgcHJvbWlzZTogdGVybWluYWxEYXRhLnByb21pc2UgfTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgZXhlY3V0ZVJlc3VsdCA9IHsga2luZDogVGFza0V4ZWN1dGVLaW5kLlN0YXJ0ZWQsIHRhc2ssIHN0YXJ0ZWQ6IHt9LCBwcm9taXNlOiB0aGlzLl9leGVjdXRlVGFzayh0YXNrLCByZXNvbHZlciwgdHJpZ2dlciwgbmV3IFNldCgpLCBuZXcgTWFwKCksIHVuZGVmaW5lZCkgfTtcblx0XHRcdGV4ZWN1dGVSZXN1bHQucHJvbWlzZS50aGVuKHN1bW1hcnkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sYXN0VGFzayA9IHRoaXMuX2N1cnJlbnRUYXNrO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZXhlY3V0ZVJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgVGFza0Vycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fSBlbHNlIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhlcnJvci5tZXNzYWdlKTtcblx0XHRcdFx0dGhyb3cgbmV3IFRhc2tFcnJvcihTZXZlcml0eS5FcnJvciwgZXJyb3IubWVzc2FnZSwgVGFza0Vycm9ycy5Vbmtub3duRXJyb3IpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nKGVycm9yLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR0aHJvdyBuZXcgVGFza0Vycm9yKFNldmVyaXR5LkVycm9yLCBubHMubG9jYWxpemUoJ1Rlcm1pbmFsVGFza1N5c3RlbS51bmtub3duRXJyb3InLCAnQSB1bmtub3duIGVycm9yIGhhcyBvY2N1cnJlZCB3aGlsZSBleGVjdXRpbmcgYSB0YXNrLiBTZWUgdGFzayBvdXRwdXQgbG9nIGZvciBkZXRhaWxzLicpLCBUYXNrRXJyb3JzLlVua25vd25FcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0VGVybWluYWxzRm9yVGFza3ModGFza3M6IFR5cGVzLlNpbmdsZU9yTWFueTxUYXNrPik6IFVSSVtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXN1bHRzOiBVUklbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdCBvZiBhc0FycmF5KHRhc2tzKSkge1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModGhpcy5fdGVybWluYWxzKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3Rlcm1pbmFsc1trZXldO1xuXHRcdFx0XHRpZiAodmFsdWUubGFzdFRhc2sgPT09IHQuZ2V0TWFwS2V5KCkpIHtcblx0XHRcdFx0XHRyZXN1bHRzLnB1c2godmFsdWUudGVybWluYWwucmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHRzLmxlbmd0aCA+IDAgPyByZXN1bHRzIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldFRhc2tQcm9ibGVtcyhpbnN0YW5jZUlkOiBudW1iZXIpOiBNYXA8c3RyaW5nLCB7IHJlc291cmNlczogVVJJW107IG1hcmtlcnM6IElNYXJrZXJEYXRhW10gfT4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90YXNrUHJvYmxlbU1vbml0b3IuZ2V0VGFza1Byb2JsZW1zKGluc3RhbmNlSWQpO1xuXHR9XG5cblx0cHVibGljIHJlcnVuKCk6IElUYXNrRXhlY3V0ZVJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2xhc3RUYXNrICYmIHRoaXMuX2xhc3RUYXNrLnZlcmlmeSgpKSB7XG5cdFx0XHRpZiAoKHRoaXMuX2xhc3RUYXNrLnRhc2sucnVuT3B0aW9ucy5yZWV2YWx1YXRlT25SZXJ1biAhPT0gdW5kZWZpbmVkKSAmJiAhdGhpcy5fbGFzdFRhc2sudGFzay5ydW5PcHRpb25zLnJlZXZhbHVhdGVPblJlcnVuKSB7XG5cdFx0XHRcdHRoaXMuX2lzUmVydW4gPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5ydW4odGhpcy5fbGFzdFRhc2sudGFzaywgdGhpcy5fbGFzdFRhc2sucmVzb2x2ZXIpO1xuXHRcdFx0cmVzdWx0LnByb21pc2UudGhlbihzdW1tYXJ5ID0+IHtcblx0XHRcdFx0dGhpcy5faXNSZXJ1biA9IGZhbHNlO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdGdldCBsYXN0VGFzaygpOiBWZXJpZmllZFRhc2sgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0VGFzaztcblx0fVxuXG5cdHNldCBsYXN0VGFzayh0YXNrOiBWZXJpZmllZFRhc2sgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9sYXN0VGFzayA9IHRhc2s7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93VGFza0xvYWRFcnJvcnModGFzazogVGFzaykge1xuXHRcdGlmICh0YXNrLnRhc2tMb2FkTWVzc2FnZXMgJiYgdGFzay50YXNrTG9hZE1lc3NhZ2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRhc2sudGFza0xvYWRNZXNzYWdlcy5mb3JFYWNoKGxvYWRNZXNzYWdlID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nKGxvYWRNZXNzYWdlICsgJ1xcbicpO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBvcGVuT3V0cHV0ID0gJ1Nob3cgT3V0cHV0Jztcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnVGVybWluYWxUYXNrU3lzdGVtLnRhc2tMb2FkUmVwb3J0aW5nJywgXCJUaGVyZSBhcmUgaXNzdWVzIHdpdGggdGFzayBcXFwiezB9XFxcIi4gU2VlIHRoZSBvdXRwdXQgZm9yIG1vcmUgZGV0YWlscy5cIixcblx0XHRcdFx0XHR0YXNrLl9sYWJlbCksIFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogb3Blbk91dHB1dCxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fc2hvd091dHB1dCgpXG5cdFx0XHRcdFx0fV0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBpc1Rhc2tWaXNpYmxlKHRhc2s6IFRhc2spOiBib29sZWFuIHtcblx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSB0aGlzLl9hY3RpdmVUYXNrc1t0YXNrLmdldE1hcEtleSgpXTtcblx0XHRpZiAoIXRlcm1pbmFsRGF0YT8udGVybWluYWwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlVGVybWluYWxJbnN0YW5jZSA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5hY3RpdmVJbnN0YW5jZTtcblx0XHRjb25zdCBpc1BhbmVsU2hvd2luZ1Rlcm1pbmFsID0gISF0aGlzLl92aWV3c1NlcnZpY2UuZ2V0QWN0aXZlVmlld1dpdGhJZChURVJNSU5BTF9WSUVXX0lEKTtcblx0XHRyZXR1cm4gaXNQYW5lbFNob3dpbmdUZXJtaW5hbCAmJiAoYWN0aXZlVGVybWluYWxJbnN0YW5jZT8uaW5zdGFuY2VJZCA9PT0gdGVybWluYWxEYXRhLnRlcm1pbmFsLmluc3RhbmNlSWQpO1xuXHR9XG5cblxuXHRwdWJsaWMgcmV2ZWFsVGFzayh0YXNrOiBUYXNrKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGVybWluYWxEYXRhID0gdGhpcy5fYWN0aXZlVGFza3NbdGFzay5nZXRNYXBLZXkoKV07XG5cdFx0aWYgKCF0ZXJtaW5hbERhdGE/LnRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGlzVGVybWluYWxJblBhbmVsOiBib29sZWFuID0gdGhpcy5fdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQoVEVSTUlOQUxfVklFV19JRCkgPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbDtcblx0XHRpZiAoaXNUZXJtaW5hbEluUGFuZWwgJiYgdGhpcy5pc1Rhc2tWaXNpYmxlKHRhc2spKSB7XG5cdFx0XHRpZiAodGhpcy5fcHJldmlvdXNQYW5lbElkKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9wcmV2aW91c1Rlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGhpcy5fcHJldmlvdXNUZXJtaW5hbEluc3RhbmNlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZSh0aGlzLl9wcmV2aW91c1BhbmVsSWQsIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wYW5lQ29tcG9zaXRlU2VydmljZS5oaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJldmlvdXNQYW5lbElkID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fcHJldmlvdXNUZXJtaW5hbEluc3RhbmNlID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoaXNUZXJtaW5hbEluUGFuZWwpIHtcblx0XHRcdFx0dGhpcy5fcHJldmlvdXNQYW5lbElkID0gdGhpcy5fcGFuZUNvbXBvc2l0ZVNlcnZpY2UuZ2V0QWN0aXZlUGFuZUNvbXBvc2l0ZShWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpPy5nZXRJZCgpO1xuXHRcdFx0XHRpZiAodGhpcy5fcHJldmlvdXNQYW5lbElkID09PSBURVJNSU5BTF9WSUVXX0lEKSB7XG5cdFx0XHRcdFx0dGhpcy5fcHJldmlvdXNUZXJtaW5hbEluc3RhbmNlID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlID8/IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHRlcm1pbmFsRGF0YS50ZXJtaW5hbCk7XG5cdFx0XHRpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSB8fCBDb250cmlidXRlZFRhc2suaXModGFzaykpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24hLmZvY3VzKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgaXNBY3RpdmUoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmlzQWN0aXZlU3luYygpKTtcblx0fVxuXG5cdHB1YmxpYyBpc0FjdGl2ZVN5bmMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIE9iamVjdC52YWx1ZXModGhpcy5fYWN0aXZlVGFza3MpLnNvbWUodmFsdWUgPT4gISF2YWx1ZS50ZXJtaW5hbCk7XG5cdH1cblxuXHRwdWJsaWMgY2FuQXV0b1Rlcm1pbmF0ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gT2JqZWN0LnZhbHVlcyh0aGlzLl9hY3RpdmVUYXNrcykuZXZlcnkodmFsdWUgPT4gIXZhbHVlLnRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvbXB0T25DbG9zZSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWN0aXZlVGFza3MoKTogVGFza1tdIHtcblx0XHRyZXR1cm4gT2JqZWN0LnZhbHVlcyh0aGlzLl9hY3RpdmVUYXNrcykuZmxhdE1hcCh2YWx1ZSA9PiB2YWx1ZS50ZXJtaW5hbCA/IHZhbHVlLnRhc2sgOiBbXSk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TGFzdEluc3RhbmNlKHRhc2s6IFRhc2spOiBUYXNrIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWNlbnRLZXkgPSB0YXNrLmdldEtleSgpO1xuXHRcdHJldHVybiBPYmplY3QudmFsdWVzKHRoaXMuX2FjdGl2ZVRhc2tzKS5yZXZlcnNlKCkuZmluZChcblx0XHRcdCh2YWx1ZSkgPT4gcmVjZW50S2V5ICYmIHJlY2VudEtleSA9PT0gdmFsdWUudGFzay5nZXRLZXkoKSk/LnRhc2s7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Rmlyc3RJbnN0YW5jZSh0YXNrOiBUYXNrKTogVGFzayB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVjZW50S2V5ID0gdGFzay5nZXRLZXkoKTtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGhpcy5nZXRBY3RpdmVUYXNrcygpKSB7XG5cdFx0XHRpZiAocmVjZW50S2V5ICYmIHJlY2VudEtleSA9PT0gdGFzay5nZXRLZXkoKSkge1xuXHRcdFx0XHRyZXR1cm4gdGFzaztcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBnZXRCdXN5VGFza3MoKTogVGFza1tdIHtcblx0XHRyZXR1cm4gT2JqZWN0LmtleXModGhpcy5fYnVzeVRhc2tzKS5tYXAoa2V5ID0+IHRoaXMuX2J1c3lUYXNrc1trZXldKTtcblx0fVxuXG5cdHB1YmxpYyBjdXN0b21FeGVjdXRpb25Db21wbGV0ZSh0YXNrOiBUYXNrLCByZXN1bHQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFjdGl2ZVRlcm1pbmFsID0gdGhpcy5fYWN0aXZlVGFza3NbdGFzay5nZXRNYXBLZXkoKV07XG5cdFx0aWYgKCFhY3RpdmVUZXJtaW5hbD8udGVybWluYWwpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ0V4cGVjdGVkIHRvIGhhdmUgYSB0ZXJtaW5hbCBmb3IgYSBjdXN0b20gZXhlY3V0aW9uIHRhc2snKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHQvLyBhY3RpdmVUZXJtaW5hbC50ZXJtaW5hbC5yZW5kZXJlckV4aXQocmVzdWx0KTtcblx0XHRcdHJlc29sdmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEluc3RhbmNlcyh0YXNrOiBUYXNrKTogSUFjdGl2ZVRlcm1pbmFsRGF0YVtdIHtcblx0XHRjb25zdCByZWNlbnRLZXkgPSB0YXNrLmdldEtleSgpO1xuXHRcdHJldHVybiBPYmplY3QudmFsdWVzKHRoaXMuX2FjdGl2ZVRhc2tzKS5maWx0ZXIoXG5cdFx0XHQodmFsdWUpID0+IHJlY2VudEtleSAmJiByZWNlbnRLZXkgPT09IHZhbHVlLnRhc2suZ2V0S2V5KCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlRnJvbUFjdGl2ZVRhc2tzKHRhc2s6IFRhc2sgfCBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSB0eXBlb2YgdGFzayA9PT0gJ3N0cmluZycgPyB0YXNrIDogdGFzay5nZXRNYXBLZXkoKTtcblx0XHRjb25zdCB0YXNrVG9SZW1vdmUgPSB0aGlzLl9hY3RpdmVUYXNrc1trZXldO1xuXHRcdGlmICghdGFza1RvUmVtb3ZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGRlbGV0ZSB0aGlzLl9hY3RpdmVUYXNrc1trZXldO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmlyZVRhc2tFdmVudChldmVudDogSVRhc2tFdmVudCkge1xuXHRcdGlmIChldmVudC5raW5kICE9PSBUYXNrRXZlbnRLaW5kLkNoYW5nZWQgJiYgZXZlbnQua2luZCAhPT0gVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlckVuZGVkICYmIGV2ZW50LmtpbmQgIT09IFRhc2tFdmVudEtpbmQuUHJvYmxlbU1hdGNoZXJTdGFydGVkKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVUYXNrID0gdGhpcy5fYWN0aXZlVGFza3NbZXZlbnQuX190YXNrLmdldE1hcEtleSgpXTtcblx0XHRcdGlmIChhY3RpdmVUYXNrKSB7XG5cdFx0XHRcdGFjdGl2ZVRhc2suc3RhdGUgPSBldmVudC5raW5kO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9vbkRpZFN0YXRlQ2hhbmdlLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0cHVibGljIHRlcm1pbmF0ZSh0YXNrOiBUYXNrKTogUHJvbWlzZTxJVGFza1Rlcm1pbmF0ZVJlc3BvbnNlPiB7XG5cdFx0Y29uc3QgYWN0aXZlVGVybWluYWwgPSB0aGlzLl9hY3RpdmVUYXNrc1t0YXNrLmdldE1hcEtleSgpXTtcblx0XHRpZiAoIWFjdGl2ZVRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlPElUYXNrVGVybWluYXRlUmVzcG9uc2U+KHsgc3VjY2VzczogZmFsc2UsIHRhc2s6IHVuZGVmaW5lZCB9KTtcblx0XHR9XG5cdFx0Y29uc3QgdGVybWluYWwgPSBhY3RpdmVUZXJtaW5hbC50ZXJtaW5hbDtcblx0XHRpZiAoIXRlcm1pbmFsKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlPElUYXNrVGVybWluYXRlUmVzcG9uc2U+KHsgc3VjY2VzczogZmFsc2UsIHRhc2s6IHVuZGVmaW5lZCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElUYXNrVGVybWluYXRlUmVzcG9uc2U+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IG9uRXhpdCA9IHRlcm1pbmFsLm9uRXhpdCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRlcm1pbmF0ZWRUYXNrID0gYWN0aXZlVGVybWluYWwudGFzaztcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRvbkV4aXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnRlcm1pbmF0ZWQodGVybWluYXRlZFRhc2ssIHRlcm1pbmFsLmluc3RhbmNlSWQsIHRlcm1pbmFsLmV4aXRSZWFzb24pKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHQvLyBEbyBub3RoaW5nLlxuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmUoeyBzdWNjZXNzOiB0cnVlLCB0YXNrOiB0ZXJtaW5hdGVkVGFzayB9KTtcblx0XHRcdH0pO1xuXHRcdFx0dGVybWluYWwuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHRlcm1pbmF0ZUFsbCgpOiBQcm9taXNlPElUYXNrVGVybWluYXRlUmVzcG9uc2VbXT4ge1xuXHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElUYXNrVGVybWluYXRlUmVzcG9uc2U+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHRlcm1pbmFsRGF0YV0gb2YgT2JqZWN0LmVudHJpZXModGhpcy5fYWN0aXZlVGFza3MpKSB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbCA9IHRlcm1pbmFsRGF0YT8udGVybWluYWw7XG5cdFx0XHRpZiAodGVybWluYWwpIHtcblx0XHRcdFx0cHJvbWlzZXMucHVzaChuZXcgUHJvbWlzZTxJVGFza1Rlcm1pbmF0ZVJlc3BvbnNlPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgb25FeGl0ID0gdGVybWluYWwub25FeGl0KCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRhc2sgPSB0ZXJtaW5hbERhdGEudGFzaztcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdG9uRXhpdC5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnRlcm1pbmF0ZWQodGFzaywgdGVybWluYWwuaW5zdGFuY2VJZCwgdGVybWluYWwuZXhpdFJlYXNvbikpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdFx0Ly8gRG8gbm90aGluZy5cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVUYXNrc1trZXldID09PSB0ZXJtaW5hbERhdGEpIHtcblx0XHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX2FjdGl2ZVRhc2tzW2tleV07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHsgc3VjY2VzczogdHJ1ZSwgdGFzazogdGVybWluYWxEYXRhLnRhc2sgfSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGVybWluYWwuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGw8SVRhc2tUZXJtaW5hdGVSZXNwb25zZT4ocHJvbWlzZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0RlcGVuZGVuY3lDeWNsZU1lc3NhZ2UodGFzazogVGFzaykge1xuXHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ2RlcGVuZGVuY3lDeWNsZScsXG5cdFx0XHQnVGhlcmUgaXMgYSBkZXBlbmRlbmN5IGN5Y2xlLiBTZWUgdGFzayBcInswfVwiLicsXG5cdFx0XHR0YXNrLl9sYWJlbFxuXHRcdCkpO1xuXHRcdHRoaXMuX3Nob3dPdXRwdXQoKTtcblx0fVxuXG5cdHByaXZhdGUgX2V4ZWN1dGVUYXNrKHRhc2s6IFRhc2ssIHJlc29sdmVyOiBJVGFza1Jlc29sdmVyLCB0cmlnZ2VyOiBzdHJpbmcsIGxpdmVEZXBlbmRlbmNpZXM6IFNldDxzdHJpbmc+LCBlbmNvdW50ZXJlZFRhc2tzOiBNYXA8c3RyaW5nLCBQcm9taXNlPElUYXNrU3VtbWFyeT4+LCBhbHJlYWR5UmVzb2x2ZWQ/OiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHR0aGlzLl9zaG93VGFza0xvYWRFcnJvcnModGFzayk7XG5cblx0XHRjb25zdCBtYXBLZXkgPSB0YXNrLmdldE1hcEtleSgpO1xuXG5cdFx0Ly8gSXQncyBpbXBvcnRhbnQgdGhhdCB3ZSBhZGQgdGhpcyB0YXNrJ3MgZW50cnkgdG8gX2FjdGl2ZVRhc2tzIGJlZm9yZVxuXHRcdC8vIGFueSBvZiB0aGUgY29kZSBpbiB0aGUgdGhlbiBydW5zIChzZWUgIzE4MDU0MSBhbmQgIzE4MDU3OCkuIFdyYXBwaW5nXG5cdFx0Ly8gaXQgaW4gUHJvbWlzZS5yZXNvbHZlKCkudGhlbigpIGVuc3VyZXMgdGhhdC5cblx0XHRjb25zdCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCkudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRhbHJlYWR5UmVzb2x2ZWQgPSBhbHJlYWR5UmVzb2x2ZWQgPz8gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0XHRcdGNvbnN0IHByb21pc2VzOiBQcm9taXNlPElUYXNrU3VtbWFyeT5bXSA9IFtdO1xuXHRcdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGVwZW5kc09uKSB7XG5cdFx0XHRcdGNvbnN0IG5leHRMaXZlRGVwZW5kZW5jaWVzID0gbmV3IFNldChsaXZlRGVwZW5kZW5jaWVzKS5hZGQodGFzay5nZXRDb21tb25UYXNrSWQoKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgZGVwZW5kZW5jeSBvZiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRlcGVuZHNPbikge1xuXHRcdFx0XHRcdGNvbnN0IGRlcGVuZGVuY3lUYXNrID0gYXdhaXQgcmVzb2x2ZXIucmVzb2x2ZShkZXBlbmRlbmN5LnVyaSwgZGVwZW5kZW5jeS50YXNrKTtcblx0XHRcdFx0XHRpZiAoZGVwZW5kZW5jeVRhc2spIHtcblx0XHRcdFx0XHRcdHRoaXMuX2Fkb3B0Q29uZmlndXJhdGlvbkZvckRlcGVuZGVuY3lUYXNrKGRlcGVuZGVuY3lUYXNrLCB0YXNrKTtcblxuXHRcdFx0XHRcdFx0Ly8gVHJhY2sgdGhlIGRlcGVuZGVuY3kgcmVsYXRpb25zaGlwXG5cdFx0XHRcdFx0XHRjb25zdCB0YXNrTWFwS2V5ID0gdGFzay5nZXRNYXBLZXkoKTtcblx0XHRcdFx0XHRcdGNvbnN0IGRlcGVuZGVuY3lNYXBLZXkgPSBkZXBlbmRlbmN5VGFzay5nZXRNYXBLZXkoKTtcblx0XHRcdFx0XHRcdGlmICghdGhpcy5fdGFza0RlcGVuZGVuY2llc1t0YXNrTWFwS2V5XSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90YXNrRGVwZW5kZW5jaWVzW3Rhc2tNYXBLZXldID0gW107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIXRoaXMuX3Rhc2tEZXBlbmRlbmNpZXNbdGFza01hcEtleV0uaW5jbHVkZXMoZGVwZW5kZW5jeU1hcEtleSkpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fdGFza0RlcGVuZGVuY2llc1t0YXNrTWFwS2V5XS5wdXNoKGRlcGVuZGVuY3lNYXBLZXkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0bGV0IHRhc2tSZXN1bHQ7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21tb25LZXkgPSBkZXBlbmRlbmN5VGFzay5nZXRDb21tb25UYXNrSWQoKTtcblx0XHRcdFx0XHRcdGlmIChuZXh0TGl2ZURlcGVuZGVuY2llcy5oYXMoY29tbW9uS2V5KSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zaG93RGVwZW5kZW5jeUN5Y2xlTWVzc2FnZShkZXBlbmRlbmN5VGFzayk7XG5cdFx0XHRcdFx0XHRcdHRhc2tSZXN1bHQgPSBQcm9taXNlLnJlc29sdmU8SVRhc2tTdW1tYXJ5Pih7fSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0YXNrUmVzdWx0ID0gZW5jb3VudGVyZWRUYXNrcy5nZXQoY29tbW9uS2V5KTtcblx0XHRcdFx0XHRcdFx0aWYgKCF0YXNrUmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0aXZlVGFzayA9IHRoaXMuX2FjdGl2ZVRhc2tzW2RlcGVuZGVuY3lUYXNrLmdldE1hcEtleSgpXSA/PyB0aGlzLl9nZXRJbnN0YW5jZXMoZGVwZW5kZW5jeVRhc2spLnBvcCgpO1xuXHRcdFx0XHRcdFx0XHRcdHRhc2tSZXN1bHQgPSBhY3RpdmVUYXNrICYmIHRoaXMuX2dldERlcGVuZGVuY3lQcm9taXNlKGFjdGl2ZVRhc2spO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoIXRhc2tSZXN1bHQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLkRlcGVuZHNPblN0YXJ0ZWQsIHRhc2spKTtcblx0XHRcdFx0XHRcdFx0dGFza1Jlc3VsdCA9IHRoaXMuX2V4ZWN1dGVEZXBlbmRlbmN5VGFzayhkZXBlbmRlbmN5VGFzaywgcmVzb2x2ZXIsIHRyaWdnZXIsIG5leHRMaXZlRGVwZW5kZW5jaWVzLCBlbmNvdW50ZXJlZFRhc2tzLCBhbHJlYWR5UmVzb2x2ZWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZW5jb3VudGVyZWRUYXNrcy5zZXQoY29tbW9uS2V5LCB0YXNrUmVzdWx0KTtcblx0XHRcdFx0XHRcdHByb21pc2VzLnB1c2godGFza1Jlc3VsdCk7XG5cdFx0XHRcdFx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXBlbmRzT3JkZXIgPT09IERlcGVuZHNPcmRlci5zZXF1ZW5jZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcm9taXNlUmVzdWx0ID0gYXdhaXQgdGFza1Jlc3VsdDtcblx0XHRcdFx0XHRcdFx0aWYgKHByb21pc2VSZXN1bHQuZXhpdENvZGUgIT09IDApIHtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdkZXBlbmRlbmN5RmFpbGVkJyxcblx0XHRcdFx0XHRcdFx0J0NvdWxkblxcJ3QgcmVzb2x2ZSBkZXBlbmRlbnQgdGFzayBcXCd7MH1cXCcgaW4gd29ya3NwYWNlIGZvbGRlciBcXCd7MX1cXCcnLFxuXHRcdFx0XHRcdFx0XHRUeXBlcy5pc1N0cmluZyhkZXBlbmRlbmN5LnRhc2spID8gZGVwZW5kZW5jeS50YXNrIDogSlNPTi5zdHJpbmdpZnkoZGVwZW5kZW5jeS50YXNrLCB1bmRlZmluZWQsIDApLFxuXHRcdFx0XHRcdFx0XHRkZXBlbmRlbmN5LnVyaS50b1N0cmluZygpXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nob3dPdXRwdXQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKS50aGVuKChzdW1tYXJpZXMpOiBBc3luYy5NYXliZVByb21pc2U8SVRhc2tTdW1tYXJ5PiA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc3VtbWFyeSBvZiBzdW1tYXJpZXMpIHtcblx0XHRcdFx0XHRpZiAoc3VtbWFyeS5leGl0Q29kZSAhPT0gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgZXhpdENvZGU6IHN1bW1hcnkuZXhpdENvZGUgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChDb250cmlidXRlZFRhc2suaXModGFzaykgfHwgQ3VzdG9tVGFzay5pcyh0YXNrKSkgJiYgKHRhc2suY29tbWFuZCkpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5faXNSZXJ1bikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuX3JlZXhlY3V0ZUNvbW1hbmQodGFzaywgdHJpZ2dlciwgYWxyZWFkeVJlc29sdmVkISk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9leGVjdXRlQ29tbWFuZCh0YXNrLCB0cmlnZ2VyLCBhbHJlYWR5UmVzb2x2ZWQhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgZXhpdENvZGU6IDAgfTtcblx0XHRcdH0pO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0Ly8gU2tpcCBpZiBhIGxhdGVyIHJ1biByZXBsYWNlZCBvdXIgZW50cnk7IHdpcGluZyBpdCB3b3VsZCBvcnBoYW4gdGhlIGxpdmUgdGFzay5cblx0XHRcdGlmICh0aGlzLl9hY3RpdmVUYXNrc1ttYXBLZXldID09PSBhY3RpdmVUYXNrKSB7XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLl9hY3RpdmVUYXNrc1ttYXBLZXldO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGxhc3RJbnN0YW5jZSA9IHRoaXMuX2dldEluc3RhbmNlcyh0YXNrKS5wb3AoKTtcblx0XHRjb25zdCBjb3VudCA9IGxhc3RJbnN0YW5jZT8uY291bnQgPz8geyBjb3VudDogMCB9O1xuXHRcdGNvdW50LmNvdW50Kys7XG5cdFx0Y29uc3QgYWN0aXZlVGFzazogSUFjdGl2ZVRlcm1pbmFsRGF0YSA9IHsgdGFzaywgcHJvbWlzZSwgY291bnQgfTtcblx0XHR0aGlzLl9hY3RpdmVUYXNrc1ttYXBLZXldID0gYWN0aXZlVGFzaztcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUluYWN0aXZlRGVwZW5kZW5jeVByb21pc2UodGFzazogVGFzayk6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElUYXNrU3VtbWFyeT4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCB0YXNrSW5hY3RpdmVEaXNwb3NhYmxlID0gdGhpcy5vbkRpZFN0YXRlQ2hhbmdlKHRhc2tFdmVudCA9PiB7XG5cdFx0XHRcdGlmICgodGFza0V2ZW50LmtpbmQgPT09IFRhc2tFdmVudEtpbmQuSW5hY3RpdmUpICYmICh0YXNrRXZlbnQuX190YXNrID09PSB0YXNrKSkge1xuXHRcdFx0XHRcdHRhc2tJbmFjdGl2ZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoeyBleGl0Q29kZTogMCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF90YXNrSGFzRXJyb3JzKHRhc2s6IFRhc2spOiBib29sZWFuIHtcblx0XHRjb25zdCB0YXNrTWFwS2V5ID0gdGFzay5nZXRNYXBLZXkoKTtcblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgdGFzayBpdHNlbGYgaGFkIGVycm9yc1xuXHRcdGlmICh0aGlzLl90YXNrRXJyb3JzW3Rhc2tNYXBLZXldKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBhbnkgdHJhY2tlZCBkZXBlbmRlbmNpZXMgaGFkIGVycm9yc1xuXHRcdGNvbnN0IGRlcGVuZGVuY2llcyA9IHRoaXMuX3Rhc2tEZXBlbmRlbmNpZXNbdGFza01hcEtleV07XG5cdFx0aWYgKGRlcGVuZGVuY2llcykge1xuXHRcdFx0Zm9yIChjb25zdCBkZXBlbmRlbmN5TWFwS2V5IG9mIGRlcGVuZGVuY2llcykge1xuXHRcdFx0XHRpZiAodGhpcy5fdGFza0Vycm9yc1tkZXBlbmRlbmN5TWFwS2V5XSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYW51cFRhc2tUcmFja2luZyh0YXNrOiBUYXNrKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFza01hcEtleSA9IHRhc2suZ2V0TWFwS2V5KCk7XG5cdFx0ZGVsZXRlIHRoaXMuX3Rhc2tFcnJvcnNbdGFza01hcEtleV07XG5cdFx0ZGVsZXRlIHRoaXMuX3Rhc2tEZXBlbmRlbmNpZXNbdGFza01hcEtleV07XG5cdH1cblxuXHRwcml2YXRlIF9hZG9wdENvbmZpZ3VyYXRpb25Gb3JEZXBlbmRlbmN5VGFzayhkZXBlbmRlbmN5VGFzazogVGFzaywgdGFzazogVGFzayk6IHZvaWQge1xuXHRcdGlmIChkZXBlbmRlbmN5VGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uKSB7XG5cdFx0XHRkZXBlbmRlbmN5VGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uLmlkIHx8PSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24/LmlkO1xuXHRcdFx0ZGVwZW5kZW5jeVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbi5jb2xvciB8fD0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uPy5jb2xvcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGVwZW5kZW5jeVRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbiA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXREZXBlbmRlbmN5UHJvbWlzZSh0YXNrOiBJQWN0aXZlVGVybWluYWxEYXRhKTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRpZiAoIXRhc2sudGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpIHtcblx0XHRcdHJldHVybiB0YXNrLnByb21pc2U7XG5cdFx0fVxuXHRcdGlmICghdGFzay50YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyB8fCB0YXNrLnRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRhc2sucHJvbWlzZTtcblx0XHR9XG5cdFx0aWYgKHRhc2suc3RhdGUgPT09IFRhc2tFdmVudEtpbmQuSW5hY3RpdmUpIHtcblx0XHRcdHJldHVybiB7IGV4aXRDb2RlOiAwIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVJbmFjdGl2ZURlcGVuZGVuY3lQcm9taXNlKHRhc2sudGFzayk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlRGVwZW5kZW5jeVRhc2sodGFzazogVGFzaywgcmVzb2x2ZXI6IElUYXNrUmVzb2x2ZXIsIHRyaWdnZXI6IHN0cmluZywgbGl2ZURlcGVuZGVuY2llczogU2V0PHN0cmluZz4sIGVuY291bnRlcmVkVGFza3M6IE1hcDxzdHJpbmcsIFByb21pc2U8SVRhc2tTdW1tYXJ5Pj4sIGFscmVhZHlSZXNvbHZlZD86IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPElUYXNrU3VtbWFyeT4ge1xuXHRcdC8vIElmIHRoZSB0YXNrIGlzIGEgYmFja2dyb3VuZCB0YXNrIHdpdGggYSB3YXRjaGluZyBwcm9ibGVtIG1hdGNoZXIsIHdlIGRvbid0IHdhaXQgZm9yIHRoZSB3aG9sZSB0YXNrIHRvIGZpbmlzaCxcblx0XHQvLyBqdXN0IGZvciB0aGUgcHJvYmxlbSBtYXRjaGVyIHRvIGdvIGluYWN0aXZlLlxuXHRcdGlmICghdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9leGVjdXRlVGFzayh0YXNrLCByZXNvbHZlciwgdHJpZ2dlciwgbGl2ZURlcGVuZGVuY2llcywgZW5jb3VudGVyZWRUYXNrcywgYWxyZWFkeVJlc29sdmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBpbmFjdGl2ZVByb21pc2UgPSB0aGlzLl9jcmVhdGVJbmFjdGl2ZURlcGVuZGVuY3lQcm9taXNlKHRhc2spO1xuXHRcdHJldHVybiBQcm9taXNlLnJhY2UoW2luYWN0aXZlUHJvbWlzZSwgdGhpcy5fZXhlY3V0ZVRhc2sodGFzaywgcmVzb2x2ZXIsIHRyaWdnZXIsIGxpdmVEZXBlbmRlbmNpZXMsIGVuY291bnRlcmVkVGFza3MsIGFscmVhZHlSZXNvbHZlZCldKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVBbmRGaW5kRXhlY3V0YWJsZShzeXN0ZW1JbmZvOiBJVGFza1N5c3RlbUluZm8gfCB1bmRlZmluZWQsIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgdGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzaywgY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGVudlBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgY29tbWFuZCA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZUZvbGRlciwgQ29tbWFuZFN0cmluZy52YWx1ZSh0YXNrLmNvbW1hbmQubmFtZSEpKTtcblx0XHRjd2QgPSBjd2QgPyBhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVBc3luYyh3b3Jrc3BhY2VGb2xkZXIsIGN3ZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGVsaW1pdGVyID0gKGF3YWl0IHRoaXMuX3BhdGhTZXJ2aWNlLnBhdGgpLmRlbGltaXRlcjtcblx0XHRjb25zdCBwYXRocyA9IGVudlBhdGggPyBhd2FpdCBQcm9taXNlLmFsbChlbnZQYXRoLnNwbGl0KGRlbGltaXRlcikubWFwKHAgPT4gdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS5yZXNvbHZlQXN5bmMod29ya3NwYWNlRm9sZGVyLCBwKSkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZvdW5kRXhlY3V0YWJsZSA9IGF3YWl0IHN5c3RlbUluZm8/LmZpbmRFeGVjdXRhYmxlKGNvbW1hbmQsIGN3ZCwgcGF0aHMpO1xuXHRcdGlmIChmb3VuZEV4ZWN1dGFibGUpIHtcblx0XHRcdHJldHVybiBmb3VuZEV4ZWN1dGFibGU7XG5cdFx0fVxuXHRcdGlmIChwYXRoLmlzQWJzb2x1dGUoY29tbWFuZCkpIHtcblx0XHRcdHJldHVybiBjb21tYW5kO1xuXHRcdH1cblx0XHRyZXR1cm4gcGF0aC5qb2luKGN3ZCA/PyAnJywgY29tbWFuZCk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kVW5yZXNvbHZlZFZhcmlhYmxlcyh2YXJpYWJsZXM6IFNldDxzdHJpbmc+LCBhbHJlYWR5UmVzb2x2ZWQ6IE1hcDxzdHJpbmcsIHN0cmluZz4pOiBTZXQ8c3RyaW5nPiB7XG5cdFx0aWYgKGFscmVhZHlSZXNvbHZlZC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdmFyaWFibGVzO1xuXHRcdH1cblx0XHRjb25zdCB1bnJlc29sdmVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdGlmICghYWxyZWFkeVJlc29sdmVkLmhhcyh2YXJpYWJsZS5zdWJzdHJpbmcoMiwgdmFyaWFibGUubGVuZ3RoIC0gMSkpKSB7XG5cdFx0XHRcdHVucmVzb2x2ZWQuYWRkKHZhcmlhYmxlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVucmVzb2x2ZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9tZXJnZU1hcHMobWVyZ2VJbnRvOiBNYXA8c3RyaW5nLCBzdHJpbmc+LCBtZXJnZUZyb206IE1hcDxzdHJpbmcsIHN0cmluZz4pIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIG1lcmdlRnJvbSkge1xuXHRcdFx0aWYgKCFtZXJnZUludG8uaGFzKGVudHJ5WzBdKSkge1xuXHRcdFx0XHRtZXJnZUludG8uc2V0KGVudHJ5WzBdLCBlbnRyeVsxXSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWNxdWlyZUlucHV0KHRhc2tTeXN0ZW1JbmZvOiBJVGFza1N5c3RlbUluZm8gfCB1bmRlZmluZWQsIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgdGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzaywgdmFyaWFibGVzOiBTZXQ8c3RyaW5nPiwgYWxyZWFkeVJlc29sdmVkOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxJUmVzb2x2ZWRWYXJpYWJsZXMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZXNGcm9tU2V0KHRhc2tTeXN0ZW1JbmZvLCB3b3Jrc3BhY2VGb2xkZXIsIHRhc2ssIHZhcmlhYmxlcywgYWxyZWFkeVJlc29sdmVkKTtcblx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuQWNxdWlyZWRJbnB1dCwgdGFzaykpO1xuXHRcdHJldHVybiByZXNvbHZlZDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVWYXJpYWJsZXNGcm9tU2V0KHRhc2tTeXN0ZW1JbmZvOiBJVGFza1N5c3RlbUluZm8gfCB1bmRlZmluZWQsIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCwgdGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzaywgdmFyaWFibGVzOiBTZXQ8c3RyaW5nPiwgYWxyZWFkeVJlc29sdmVkOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxJUmVzb2x2ZWRWYXJpYWJsZXMgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpc1Byb2Nlc3MgPSB0YXNrLmNvbW1hbmQgJiYgdGFzay5jb21tYW5kLnJ1bnRpbWUgPT09IFJ1bnRpbWVUeXBlLlByb2Nlc3M7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRhc2suY29tbWFuZCAmJiB0YXNrLmNvbW1hbmQub3B0aW9ucyA/IHRhc2suY29tbWFuZC5vcHRpb25zIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGN3ZCA9IG9wdGlvbnMgPyBvcHRpb25zLmN3ZCA6IHVuZGVmaW5lZDtcblx0XHRsZXQgZW52UGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zICYmIG9wdGlvbnMuZW52KSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvcHRpb25zLmVudikpIHtcblx0XHRcdFx0aWYgKGtleS50b0xvd2VyQ2FzZSgpID09PSAncGF0aCcpIHtcblx0XHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcob3B0aW9ucy5lbnZba2V5XSkpIHtcblx0XHRcdFx0XHRcdGVudlBhdGggPSBvcHRpb25zLmVudltrZXldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCB1bnJlc29sdmVkID0gdGhpcy5fZmluZFVucmVzb2x2ZWRWYXJpYWJsZXModmFyaWFibGVzLCBhbHJlYWR5UmVzb2x2ZWQpO1xuXHRcdGxldCByZXNvbHZlZFZhcmlhYmxlczogUHJvbWlzZTxJUmVzb2x2ZWRWYXJpYWJsZXMgfCB1bmRlZmluZWQ+O1xuXHRcdGlmICh0YXNrU3lzdGVtSW5mbyAmJiB3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVTZXQ6IElSZXNvbHZlU2V0ID0ge1xuXHRcdFx0XHR2YXJpYWJsZXM6IHVucmVzb2x2ZWRcblx0XHRcdH07XG5cblx0XHRcdGlmICh0YXNrU3lzdGVtSW5mby5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uUGxhdGZvcm0uV2luZG93cyAmJiBpc1Byb2Nlc3MpIHtcblx0XHRcdFx0cmVzb2x2ZVNldC5wcm9jZXNzID0geyBuYW1lOiBDb21tYW5kU3RyaW5nLnZhbHVlKHRhc2suY29tbWFuZC5uYW1lISkgfTtcblx0XHRcdFx0aWYgKGN3ZCkge1xuXHRcdFx0XHRcdHJlc29sdmVTZXQucHJvY2Vzcy5jd2QgPSBjd2Q7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVudlBhdGgpIHtcblx0XHRcdFx0XHRyZXNvbHZlU2V0LnByb2Nlc3MucGF0aCA9IGVudlBhdGg7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc29sdmVkVmFyaWFibGVzID0gdGFza1N5c3RlbUluZm8ucmVzb2x2ZVZhcmlhYmxlcyh3b3Jrc3BhY2VGb2xkZXIsIHJlc29sdmVTZXQsIFRhc2tTb3VyY2VLaW5kLnRvQ29uZmlndXJhdGlvblRhcmdldCh0YXNrLl9zb3VyY2Uua2luZCkpLnRoZW4oYXN5bmMgKHJlc29sdmVkKSA9PiB7XG5cdFx0XHRcdGlmICghcmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fbWVyZ2VNYXBzKGFscmVhZHlSZXNvbHZlZCwgcmVzb2x2ZWQudmFyaWFibGVzKTtcblx0XHRcdFx0cmVzb2x2ZWQudmFyaWFibGVzID0gbmV3IE1hcChhbHJlYWR5UmVzb2x2ZWQpO1xuXHRcdFx0XHRpZiAoaXNQcm9jZXNzKSB7XG5cdFx0XHRcdFx0bGV0IHByb2Nlc3MgPSBDb21tYW5kU3RyaW5nLnZhbHVlKHRhc2suY29tbWFuZC5uYW1lISk7XG5cdFx0XHRcdFx0aWYgKHRhc2tTeXN0ZW1JbmZvLnBsYXRmb3JtID09PSBQbGF0Zm9ybS5QbGF0Zm9ybS5XaW5kb3dzKSB7XG5cdFx0XHRcdFx0XHRwcm9jZXNzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUFuZEZpbmRFeGVjdXRhYmxlKHRhc2tTeXN0ZW1JbmZvLCB3b3Jrc3BhY2VGb2xkZXIsIHRhc2ssIGN3ZCwgZW52UGF0aCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc29sdmVkLnZhcmlhYmxlcy5zZXQoVGVybWluYWxUYXNrU3lzdGVtLlByb2Nlc3NWYXJOYW1lLCBwcm9jZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiByZXNvbHZlZFZhcmlhYmxlcztcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdmFyaWFibGVzQXJyYXkgPSBuZXcgQXJyYXk8c3RyaW5nPigpO1xuXHRcdFx0dW5yZXNvbHZlZC5mb3JFYWNoKHZhcmlhYmxlID0+IHZhcmlhYmxlc0FycmF5LnB1c2godmFyaWFibGUpKTtcblxuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPElSZXNvbHZlZFZhcmlhYmxlcyB8IHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVXaXRoSW50ZXJhY3Rpb24od29ya3NwYWNlRm9sZGVyLCB2YXJpYWJsZXNBcnJheSwgJ3Rhc2tzJywgdW5kZWZpbmVkLCBUYXNrU291cmNlS2luZC50b0NvbmZpZ3VyYXRpb25UYXJnZXQodGFzay5fc291cmNlLmtpbmQpKS50aGVuKGFzeW5jIChyZXNvbHZlZFZhcmlhYmxlc01hcDogTWFwPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlZFZhcmlhYmxlc01hcCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbWVyZ2VNYXBzKGFscmVhZHlSZXNvbHZlZCwgcmVzb2x2ZWRWYXJpYWJsZXNNYXApO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZWRWYXJpYWJsZXNNYXAgPSBuZXcgTWFwKGFscmVhZHlSZXNvbHZlZCk7XG5cdFx0XHRcdFx0XHRpZiAoaXNQcm9jZXNzKSB7XG5cdFx0XHRcdFx0XHRcdGxldCBwcm9jZXNzVmFyVmFsdWU6IHN0cmluZztcblx0XHRcdFx0XHRcdFx0aWYgKFBsYXRmb3JtLmlzV2luZG93cykge1xuXHRcdFx0XHRcdFx0XHRcdHByb2Nlc3NWYXJWYWx1ZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVBbmRGaW5kRXhlY3V0YWJsZSh0YXNrU3lzdGVtSW5mbywgd29ya3NwYWNlRm9sZGVyLCB0YXNrLCBjd2QsIGVudlBhdGgpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHByb2Nlc3NWYXJWYWx1ZSA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UucmVzb2x2ZUFzeW5jKHdvcmtzcGFjZUZvbGRlciwgQ29tbWFuZFN0cmluZy52YWx1ZSh0YXNrLmNvbW1hbmQubmFtZSEpKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXNvbHZlZFZhcmlhYmxlc01hcC5zZXQoVGVybWluYWxUYXNrU3lzdGVtLlByb2Nlc3NWYXJOYW1lLCBwcm9jZXNzVmFyVmFsdWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzb2x2ZWRWYXJpYWJsZXNSZXN1bHQ6IElSZXNvbHZlZFZhcmlhYmxlcyA9IHtcblx0XHRcdFx0XHRcdFx0dmFyaWFibGVzOiByZXNvbHZlZFZhcmlhYmxlc01hcCxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHJlc29sdmVkVmFyaWFibGVzUmVzdWx0KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgcmVhc29uID0+IHtcblx0XHRcdFx0XHRyZWplY3QocmVhc29uKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9leGVjdXRlQ29tbWFuZCh0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrLCB0cmlnZ2VyOiBzdHJpbmcsIGFscmVhZHlSZXNvbHZlZDogTWFwPHN0cmluZywgc3RyaW5nPik6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0Y29uc3QgdGFza1dvcmtzcGFjZUZvbGRlciA9IHRhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCk7XG5cdFx0bGV0IHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGFza1dvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0d29ya3NwYWNlRm9sZGVyID0gdGhpcy5fY3VycmVudFRhc2sud29ya3NwYWNlRm9sZGVyID0gdGFza1dvcmtzcGFjZUZvbGRlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgZm9sZGVycyA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXIgPSBmb2xkZXJzLmxlbmd0aCA+IDAgPyBmb2xkZXJzWzBdIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzeXN0ZW1JbmZvOiBJVGFza1N5c3RlbUluZm8gfCB1bmRlZmluZWQgPSB0aGlzLl9jdXJyZW50VGFzay5zeXN0ZW1JbmZvID0gdGhpcy5fdGFza1N5c3RlbUluZm9SZXNvbHZlcih3b3Jrc3BhY2VGb2xkZXIpO1xuXG5cdFx0Y29uc3QgdmFyaWFibGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy5fY29sbGVjdFRhc2tWYXJpYWJsZXModmFyaWFibGVzLCB0YXNrKTtcblx0XHRjb25zdCByZXNvbHZlZFZhcmlhYmxlcyA9IHRoaXMuX2FjcXVpcmVJbnB1dChzeXN0ZW1JbmZvLCB3b3Jrc3BhY2VGb2xkZXIsIHRhc2ssIHZhcmlhYmxlcywgYWxyZWFkeVJlc29sdmVkKTtcblxuXHRcdHJldHVybiByZXNvbHZlZFZhcmlhYmxlcy50aGVuKChyZXNvbHZlZFZhcmlhYmxlcykgPT4ge1xuXHRcdFx0aWYgKHJlc29sdmVkVmFyaWFibGVzICYmICF0aGlzLl9pc1Rhc2tFbXB0eSh0YXNrKSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50VGFzay5yZXNvbHZlZFZhcmlhYmxlcyA9IHJlc29sdmVkVmFyaWFibGVzO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZXhlY3V0ZUluVGVybWluYWwodGFzaywgdHJpZ2dlciwgbmV3IFZhcmlhYmxlUmVzb2x2ZXIod29ya3NwYWNlRm9sZGVyLCBzeXN0ZW1JbmZvLCByZXNvbHZlZFZhcmlhYmxlcy52YXJpYWJsZXMsIHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UpLCB3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQWxsb3dzIHRoZSB0YXNrRXhlY3V0aW9ucyBhcnJheSB0byBiZSB1cGRhdGVkIGluIHRoZSBleHRlbnNpb24gaG9zdFxuXHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuRW5kLCB0YXNrKSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBleGl0Q29kZTogMCB9KTtcblx0XHRcdH1cblx0XHR9LCByZWFzb24gPT4ge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHJlYXNvbik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1Rhc2tFbXB0eSh0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaXNDdXN0b21FeGVjdXRpb24gPSAodGFzay5jb21tYW5kLnJ1bnRpbWUgPT09IFJ1bnRpbWVUeXBlLkN1c3RvbUV4ZWN1dGlvbik7XG5cdFx0cmV0dXJuICEoKHRhc2suY29tbWFuZCAhPT0gdW5kZWZpbmVkKSAmJiB0YXNrLmNvbW1hbmQucnVudGltZSAmJiAoaXNDdXN0b21FeGVjdXRpb24gfHwgKHRhc2suY29tbWFuZC5uYW1lICE9PSB1bmRlZmluZWQpKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWV4ZWN1dGVDb21tYW5kKHRhc2s6IEN1c3RvbVRhc2sgfCBDb250cmlidXRlZFRhc2ssIHRyaWdnZXI6IHN0cmluZywgYWxyZWFkeVJlc29sdmVkOiBNYXA8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRjb25zdCBsYXN0VGFzayA9IHRoaXMuX2xhc3RUYXNrO1xuXHRcdGlmICghbGFzdFRhc2spIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ05vIHRhc2sgcHJldmlvdXNseSBydW4nKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuX2N1cnJlbnRUYXNrLndvcmtzcGFjZUZvbGRlciA9IGxhc3RUYXNrLndvcmtzcGFjZUZvbGRlcjtcblx0XHQvLyBDYXJyeSBzeXN0ZW1JbmZvIGZvcndhcmQsIGVsc2UgYSBsYXRlciByZXJ1biByZXNvbHZlcyB0aGUgc2hlbGwgb24gdGhlIGxvY2FsIGhvc3QgKCMxNzUxMTgpLlxuXHRcdHRoaXMuX2N1cnJlbnRUYXNrLnN5c3RlbUluZm8gPSBsYXN0VGFzay5zeXN0ZW1JbmZvO1xuXHRcdGNvbnN0IHZhcmlhYmxlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdHRoaXMuX2NvbGxlY3RUYXNrVmFyaWFibGVzKHZhcmlhYmxlcywgdGFzayk7XG5cblx0XHQvLyBDaGVjayB0aGF0IHRoZSB0YXNrIGhhc24ndCBjaGFuZ2VkIHRvIGluY2x1ZGUgbmV3IHZhcmlhYmxlc1xuXHRcdGxldCBoYXNBbGxWYXJpYWJsZXMgPSB0cnVlO1xuXHRcdHZhcmlhYmxlcy5mb3JFYWNoKHZhbHVlID0+IHtcblx0XHRcdGlmIChPYmplY3QuaGFzT3duKGxhc3RUYXNrLmdldFZlcmlmaWVkVGFzaygpLnJlc29sdmVkVmFyaWFibGVzLCB2YWx1ZS5zdWJzdHJpbmcoMiwgdmFsdWUubGVuZ3RoIC0gMSkpKSB7XG5cdFx0XHRcdGhhc0FsbFZhcmlhYmxlcyA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFoYXNBbGxWYXJpYWJsZXMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3F1aXJlSW5wdXQobGFzdFRhc2suZ2V0VmVyaWZpZWRUYXNrKCkuc3lzdGVtSW5mbywgbGFzdFRhc2suZ2V0VmVyaWZpZWRUYXNrKCkud29ya3NwYWNlRm9sZGVyLCB0YXNrLCB2YXJpYWJsZXMsIGFscmVhZHlSZXNvbHZlZCkudGhlbigocmVzb2x2ZWRWYXJpYWJsZXMpID0+IHtcblx0XHRcdFx0aWYgKCFyZXNvbHZlZFZhcmlhYmxlcykge1xuXHRcdFx0XHRcdC8vIEFsbG93cyB0aGUgdGFza0V4ZWN1dGlvbnMgYXJyYXkgdG8gYmUgdXBkYXRlZCBpbiB0aGUgZXh0ZW5zaW9uIGhvc3Rcblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5nZW5lcmFsKFRhc2tFdmVudEtpbmQuRW5kLCB0YXNrKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZXhpdENvZGU6IDAgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9jdXJyZW50VGFzay5yZXNvbHZlZFZhcmlhYmxlcyA9IHJlc29sdmVkVmFyaWFibGVzO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZXhlY3V0ZUluVGVybWluYWwodGFzaywgdHJpZ2dlciwgbmV3IFZhcmlhYmxlUmVzb2x2ZXIobGFzdFRhc2suZ2V0VmVyaWZpZWRUYXNrKCkud29ya3NwYWNlRm9sZGVyLCBsYXN0VGFzay5nZXRWZXJpZmllZFRhc2soKS5zeXN0ZW1JbmZvLCByZXNvbHZlZFZhcmlhYmxlcy52YXJpYWJsZXMsIHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UpLCB3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdFx0fSwgcmVhc29uID0+IHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHJlYXNvbik7XG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fY3VycmVudFRhc2sucmVzb2x2ZWRWYXJpYWJsZXMgPSBsYXN0VGFzay5nZXRWZXJpZmllZFRhc2soKS5yZXNvbHZlZFZhcmlhYmxlcztcblx0XHRcdHJldHVybiB0aGlzLl9leGVjdXRlSW5UZXJtaW5hbCh0YXNrLCB0cmlnZ2VyLCBuZXcgVmFyaWFibGVSZXNvbHZlcihsYXN0VGFzay5nZXRWZXJpZmllZFRhc2soKS53b3Jrc3BhY2VGb2xkZXIsIGxhc3RUYXNrLmdldFZlcmlmaWVkVGFzaygpLnN5c3RlbUluZm8sIGxhc3RUYXNrLmdldFZlcmlmaWVkVGFzaygpLnJlc29sdmVkVmFyaWFibGVzLnZhcmlhYmxlcywgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSksIHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZUluVGVybWluYWwodGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzaywgdHJpZ2dlcjogc3RyaW5nLCByZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRsZXQgdGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBlcnJvcjogVGFza0Vycm9yIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBwcm9taXNlOiBQcm9taXNlPElUYXNrU3VtbWFyeT4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb25zdCBwcm9ibGVtTWF0Y2hlcnMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlTWF0Y2hlcnMocmVzb2x2ZXIsIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzKTtcblx0XHRcdGNvbnN0IHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIgPSBuZXcgV2F0Y2hpbmdQcm9ibGVtQ29sbGVjdG9yKHByb2JsZW1NYXRjaGVycywgdGhpcy5fbWFya2VyU2VydmljZSwgdGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0XHRpZiAoKHByb2JsZW1NYXRjaGVycy5sZW5ndGggPiAwKSAmJiAhd2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5pc1dhdGNoaW5nKCkpIHtcblx0XHRcdFx0dGhpcy5fYXBwZW5kT3V0cHV0KG5scy5sb2NhbGl6ZSgnVGVybWluYWxUYXNrU3lzdGVtLm5vbldhdGNoaW5nTWF0Y2hlcicsICdUYXNrIHswfSBpcyBhIGJhY2tncm91bmQgdGFzayBidXQgdXNlcyBhIHByb2JsZW0gbWF0Y2hlciB3aXRob3V0IGEgYmFja2dyb3VuZCBwYXR0ZXJuJywgdGFzay5fbGFiZWwpKTtcblx0XHRcdFx0dGhpcy5fc2hvd091dHB1dCgpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9EaXNwb3NlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bGV0IGV2ZW50Q291bnRlcjogbnVtYmVyID0gMDtcblx0XHRcdGNvbnN0IG1hcEtleSA9IHRhc2suZ2V0TWFwS2V5KCk7XG5cdFx0XHR0b0Rpc3Bvc2UuYWRkKHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIub25EaWRTdGF0ZUNoYW5nZSgoZXZlbnQpID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50LmtpbmQgPT09IFByb2JsZW1Db2xsZWN0b3JFdmVudEtpbmQuQmFja2dyb3VuZFByb2Nlc3NpbmdCZWdpbnMpIHtcblx0XHRcdFx0XHRldmVudENvdW50ZXIrKztcblx0XHRcdFx0XHR0aGlzLl9idXN5VGFza3NbbWFwS2V5XSA9IHRhc2s7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLkFjdGl2ZSwgdGFzaywgdGVybWluYWw/Lmluc3RhbmNlSWQpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5raW5kID09PSBQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kLkJhY2tncm91bmRQcm9jZXNzaW5nRW5kcykge1xuXHRcdFx0XHRcdGV2ZW50Q291bnRlci0tO1xuXHRcdFx0XHRcdGlmICh0aGlzLl9idXN5VGFza3NbbWFwS2V5XSkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX2J1c3lUYXNrc1ttYXBLZXldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZXZlbnQuY2FwdHVyZWRWYXJpYWJsZXMpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3JlZ2lzdGVyQ2FwdHVyZWRWYXJpYWJsZXMoZXZlbnQuY2FwdHVyZWRWYXJpYWJsZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5pbmFjdGl2ZSh0YXNrLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCwgdGhpcy5fdGFrZVRhc2tEdXJhdGlvbih0ZXJtaW5hbD8uaW5zdGFuY2VJZCkpKTtcblx0XHRcdFx0XHRpZiAoZXZlbnRDb3VudGVyID09PSAwKSB7XG5cdFx0XHRcdFx0XHRpZiAoKHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIubnVtYmVyT2ZNYXRjaGVzID4gMCkgJiYgd2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5tYXhNYXJrZXJTZXZlcml0eSAmJlxuXHRcdFx0XHRcdFx0XHQod2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5tYXhNYXJrZXJTZXZlcml0eSA+PSBNYXJrZXJTZXZlcml0eS5FcnJvcikpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fdGFza0Vycm9yc1t0YXNrLmdldE1hcEtleSgpXSA9IHRydWU7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmdlbmVyYWwoVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlckZvdW5kRXJyb3JzLCB0YXNrLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZXZlYWwgPSB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uIS5yZXZlYWw7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJldmVhbFByb2JsZW1zID0gdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiEucmV2ZWFsUHJvYmxlbXM7XG5cdFx0XHRcdFx0XHRcdGlmIChyZXZlYWxQcm9ibGVtcyA9PT0gUmV2ZWFsUHJvYmxlbUtpbmQuT25Qcm9ibGVtKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lELCB0cnVlKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChyZXZlYWwgPT09IFJldmVhbEtpbmQuU2lsZW50KSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHRlcm1pbmFsISk7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQucHJvYmxlbU1hdGNoZXJFbmRlZCh0YXNrLCB0aGlzLl90YXNrSGFzRXJyb3JzKHRhc2spLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0d2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5hYm91dFRvU3RhcnQoKTtcblx0XHRcdGxldCBkZWxheWVyOiBBc3luYy5EZWxheWVyPHZvaWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0W3Rlcm1pbmFsLCBlcnJvcl0gPSBhd2FpdCB0aGlzLl9jcmVhdGVUZXJtaW5hbCh0YXNrLCByZXNvbHZlciwgd29ya3NwYWNlRm9sZGVyKTtcblxuXHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoKDxUYXNrRXJyb3I+ZXJyb3IpLm1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSB0ZXJtaW5hbCBmb3IgdGFzayAke3Rhc2suX2xhYmVsfWApKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rlcm1pbmFsU3RhdHVzTWFuYWdlci5hZGRUZXJtaW5hbCh0YXNrLCB0ZXJtaW5hbCwgd2F0Y2hpbmdQcm9ibGVtTWF0Y2hlcik7XG5cdFx0XHR0aGlzLl90YXNrUHJvYmxlbU1vbml0b3IuYWRkVGVybWluYWwodGVybWluYWwsIHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIpO1xuXHRcdFx0bGV0IHByb2Nlc3NTdGFydGVkU2lnbmFsZWQgPSBmYWxzZTtcblx0XHRcdHRlcm1pbmFsLnByb2Nlc3NSZWFkeS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKCFwcm9jZXNzU3RhcnRlZFNpZ25hbGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQucHJvY2Vzc1N0YXJ0ZWQodGFzaywgdGVybWluYWwhLmluc3RhbmNlSWQsIHRlcm1pbmFsIS5wcm9jZXNzSWQhKSk7XG5cdFx0XHRcdFx0cHJvY2Vzc1N0YXJ0ZWRTaWduYWxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sIChfZXJyb3IpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignVGFzayB0ZXJtaW5hbCBwcm9jZXNzIG5ldmVyIGdvdCByZWFkeScpO1xuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl90YXNrU3RhcnRUaW1lcy5zZXQodGVybWluYWwuaW5zdGFuY2VJZCwgRGF0ZS5ub3coKSk7XG5cdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5zdGFydCh0YXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkLCByZXNvbHZlci52YWx1ZXMpKTtcblx0XHRcdGxldCBvbkRhdGE6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHByb2JsZW1NYXRjaGVycy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gdGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyU3RhcnRlZCwgdGFzaywgdGVybWluYWwuaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHQvLyBwcmV2ZW50IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNzQ1MTEgZnJvbSBoYXBwZW5pbmdcblx0XHRcdFx0b25EYXRhID0gdGVybWluYWwub25MaW5lRGF0YSgobGluZSkgPT4ge1xuXHRcdFx0XHRcdHdhdGNoaW5nUHJvYmxlbU1hdGNoZXIucHJvY2Vzc0xpbmUobGluZSk7XG5cdFx0XHRcdFx0aWYgKCFkZWxheWVyKSB7XG5cdFx0XHRcdFx0XHRkZWxheWVyID0gbmV3IEFzeW5jLkRlbGF5ZXIoMzAwMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdFx0XHR3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLmZvcmNlRGVsaXZlcnkoKTtcblx0XHRcdFx0XHRcdGRlbGF5ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRwcm9taXNlID0gbmV3IFByb21pc2U8SVRhc2tTdW1tYXJ5PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJvdW5kVGVybWluYWwgPSB0ZXJtaW5hbCE7XG5cdFx0XHRcdGNvbnN0IG9uRXhpdCA9IHRlcm1pbmFsIS5vbkV4aXQoKHRlcm1pbmFsTGF1bmNoUmVzdWx0KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpdENvZGUgPSB0eXBlb2YgdGVybWluYWxMYXVuY2hSZXN1bHQgPT09ICdudW1iZXInID8gdGVybWluYWxMYXVuY2hSZXN1bHQgOiB0ZXJtaW5hbExhdW5jaFJlc3VsdD8uY29kZTtcblx0XHRcdFx0XHRvbkRhdGE/LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRvbkV4aXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IHRhc2suZ2V0TWFwS2V5KCk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2J1c3lUYXNrc1ttYXBLZXldKSB7XG5cdFx0XHRcdFx0XHRkZWxldGUgdGhpcy5fYnVzeVRhc2tzW21hcEtleV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIFNraXAgaWYgYSBsYXRlciBydW4gcmVwbGFjZWQgdGhlIGVudHJ5IHdpdGggYSBkaWZmZXJlbnQgdGVybWluYWwuXG5cdFx0XHRcdFx0Y29uc3QgY3VyID0gdGhpcy5fYWN0aXZlVGFza3Nba2V5XTtcblx0XHRcdFx0XHRpZiAoY3VyICYmIGN1ci50ZXJtaW5hbCA9PT0gYm91bmRUZXJtaW5hbCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVtb3ZlRnJvbUFjdGl2ZVRhc2tzKHRhc2spO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5jaGFuZ2VkKCkpO1xuXHRcdFx0XHRcdGlmICh0ZXJtaW5hbExhdW5jaFJlc3VsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHQvLyBPbmx5IGtlZXAgYSByZWZlcmVuY2UgdG8gdGhlIHRlcm1pbmFsIGlmIGl0IGlzIG5vdCBiZWluZyBkaXNwb3NlZC5cblx0XHRcdFx0XHRcdHN3aXRjaCAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiEucGFuZWwpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSBQYW5lbEtpbmQuRGVkaWNhdGVkOlxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3NhbWVUYXNrVGVybWluYWxzW2tleV0gPSB0ZXJtaW5hbCEuaW5zdGFuY2VJZC50b1N0cmluZygpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRjYXNlIFBhbmVsS2luZC5TaGFyZWQ6XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5faWRsZVRhc2tUZXJtaW5hbHMuc2V0KGtleSwgdGVybWluYWwhLmluc3RhbmNlSWQudG9TdHJpbmcoKSwgVG91Y2guQXNPbGQpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZXZlYWwgPSB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uIS5yZXZlYWw7XG5cdFx0XHRcdFx0aWYgKChyZXZlYWwgPT09IFJldmVhbEtpbmQuU2lsZW50KSAmJiAoKGV4aXRDb2RlICE9PSAwKSB8fCAod2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5udW1iZXJPZk1hdGNoZXMgPiAwKSAmJiB3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLm1heE1hcmtlclNldmVyaXR5ICYmXG5cdFx0XHRcdFx0XHQod2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5tYXhNYXJrZXJTZXZlcml0eSA+PSBNYXJrZXJTZXZlcml0eS5FcnJvcikpKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwhKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKGZhbHNlKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHRlcm1pbmFsIGhhcyBhbHJlYWR5IGJlZW4gZGlzcG9zZWQsIHRoZW4gc2V0dGluZyB0aGUgYWN0aXZlIGluc3RhbmNlIHdpbGwgZmFpbC4gIzk5ODI4XG5cdFx0XHRcdFx0XHRcdC8vIFRoZXJlIGlzIG5vdGhpbmcgZWxzZSB0byBkbyBoZXJlLlxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLmRvbmUoKTtcblx0XHRcdFx0XHR3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRpZiAoIXByb2Nlc3NTdGFydGVkU2lnbmFsZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnByb2Nlc3NTdGFydGVkKHRhc2ssIHRlcm1pbmFsIS5pbnN0YW5jZUlkLCB0ZXJtaW5hbCEucHJvY2Vzc0lkISkpO1xuXHRcdFx0XHRcdFx0cHJvY2Vzc1N0YXJ0ZWRTaWduYWxlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGR1cmF0aW9uTXMgPSB0aGlzLl90YWtlVGFza0R1cmF0aW9uKHRlcm1pbmFsIS5pbnN0YW5jZUlkKTtcblx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5wcm9jZXNzRW5kZWQodGFzaywgdGVybWluYWwhLmluc3RhbmNlSWQsIGV4aXRDb2RlLCBkdXJhdGlvbk1zKSk7XG5cblx0XHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV2ZW50Q291bnRlcjsgaSsrKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5pbmFjdGl2ZSh0YXNrLCB0ZXJtaW5hbCEuaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRldmVudENvdW50ZXIgPSAwO1xuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmdlbmVyYWwoVGFza0V2ZW50S2luZC5FbmQsIHRhc2spKTtcblx0XHRcdFx0XHR0b0Rpc3Bvc2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoeyBleGl0Q29kZTogZXhpdENvZGUgPz8gdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHRyaWdnZXIgPT09IFRyaWdnZXJzLnJlY29ubmVjdCAmJiAhIXRlcm1pbmFsLnh0ZXJtKSB7XG5cdFx0XHRcdGNvbnN0IGJ1ZmZlckxpbmVzID0gW107XG5cdFx0XHRcdGNvbnN0IGJ1ZmZlclJldmVyc2VJdGVyYXRvciA9IHRlcm1pbmFsLnh0ZXJtLmdldEJ1ZmZlclJldmVyc2VJdGVyYXRvcigpO1xuXHRcdFx0XHRjb25zdCBzdGFydFJlZ2V4ID0gbmV3IFJlZ0V4cCh3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLmJlZ2luUGF0dGVybnMubWFwKHBhdHRlcm4gPT4gcGF0dGVybi5zb3VyY2UpLmpvaW4oJ3wnKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgbmV4dExpbmUgb2YgYnVmZmVyUmV2ZXJzZUl0ZXJhdG9yKSB7XG5cdFx0XHRcdFx0YnVmZmVyTGluZXMucHVzaChuZXh0TGluZSk7XG5cdFx0XHRcdFx0aWYgKHN0YXJ0UmVnZXgudGVzdChuZXh0TGluZSkpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRsZXQgZGVsYXllcjogQXN5bmMuRGVsYXllcjx2b2lkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IGJ1ZmZlckxpbmVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0d2F0Y2hpbmdQcm9ibGVtTWF0Y2hlci5wcm9jZXNzTGluZShidWZmZXJMaW5lc1tpXSk7XG5cdFx0XHRcdFx0aWYgKCFkZWxheWVyKSB7XG5cdFx0XHRcdFx0XHRkZWxheWVyID0gbmV3IEFzeW5jLkRlbGF5ZXIoMzAwMCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGRlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdFx0XHR3YXRjaGluZ1Byb2JsZW1NYXRjaGVyLmZvcmNlRGVsaXZlcnkoKTtcblx0XHRcdFx0XHRcdGRlbGF5ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0W3Rlcm1pbmFsLCBlcnJvcl0gPSBhd2FpdCB0aGlzLl9jcmVhdGVUZXJtaW5hbCh0YXNrLCByZXNvbHZlciwgd29ya3NwYWNlRm9sZGVyKTtcblxuXHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoKDxUYXNrRXJyb3I+ZXJyb3IpLm1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHRcdGlmICghdGVybWluYWwpIHtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihgRmFpbGVkIHRvIGNyZWF0ZSB0ZXJtaW5hbCBmb3IgdGFzayAke3Rhc2suX2xhYmVsfWApKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fdGFza1N0YXJ0VGltZXMuc2V0KHRlcm1pbmFsLmluc3RhbmNlSWQsIERhdGUubm93KCkpO1xuXHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuc3RhcnQodGFzaywgdGVybWluYWwuaW5zdGFuY2VJZCwgcmVzb2x2ZXIudmFsdWVzKSk7XG5cdFx0XHRjb25zdCBtYXBLZXkgPSB0YXNrLmdldE1hcEtleSgpO1xuXHRcdFx0dGhpcy5fYnVzeVRhc2tzW21hcEtleV0gPSB0YXNrO1xuXHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLkFjdGl2ZSwgdGFzaywgdGVybWluYWwuaW5zdGFuY2VJZCkpO1xuXG5cdFx0XHRjb25zdCBwcm9ibGVtTWF0Y2hlcnMgPSBhd2FpdCB0aGlzLl9yZXNvbHZlTWF0Y2hlcnMocmVzb2x2ZXIsIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzKTtcblx0XHRcdGNvbnN0IHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyID0gbmV3IFN0YXJ0U3RvcFByb2JsZW1Db2xsZWN0b3IocHJvYmxlbU1hdGNoZXJzLCB0aGlzLl9tYXJrZXJTZXJ2aWNlLCB0aGlzLl9tb2RlbFNlcnZpY2UsIFByb2JsZW1IYW5kbGluZ1N0cmF0ZWd5LkNsZWFuLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbFN0YXR1c01hbmFnZXIuYWRkVGVybWluYWwodGFzaywgdGVybWluYWwsIHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyKTtcblx0XHRcdHRoaXMuX3Rhc2tQcm9ibGVtTW9uaXRvci5hZGRUZXJtaW5hbCh0ZXJtaW5hbCwgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIpO1xuXHRcdFx0Y29uc3QgcHJvYmxlbU1hdGNoZXJMaXN0ZW5lciA9IHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLm9uRGlkU3RhdGVDaGFuZ2UoKGV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChldmVudC5raW5kID09PSBQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kLkJhY2tncm91bmRQcm9jZXNzaW5nQmVnaW5zKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyU3RhcnRlZCwgdGFzaywgdGVybWluYWw/Lmluc3RhbmNlSWQpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5raW5kID09PSBQcm9ibGVtQ29sbGVjdG9yRXZlbnRLaW5kLkJhY2tncm91bmRQcm9jZXNzaW5nRW5kcykge1xuXHRcdFx0XHRcdGlmIChzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5udW1iZXJPZk1hdGNoZXMgJiYgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubWF4TWFya2VyU2V2ZXJpdHkgJiYgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubWF4TWFya2VyU2V2ZXJpdHkgPj0gTWFya2VyU2V2ZXJpdHkuRXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tFcnJvcnNbdGFzay5nZXRNYXBLZXkoKV0gPSB0cnVlO1xuXHRcdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuZ2VuZXJhbChUYXNrRXZlbnRLaW5kLlByb2JsZW1NYXRjaGVyRm91bmRFcnJvcnMsIHRhc2ssIHRlcm1pbmFsPy5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnByb2JsZW1NYXRjaGVyRW5kZWQodGFzaywgdGhpcy5fdGFza0hhc0Vycm9ycyh0YXNrKSwgdGVybWluYWw/Lmluc3RhbmNlSWQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0bGV0IHByb2Nlc3NTdGFydGVkU2lnbmFsZWQgPSBmYWxzZTtcblx0XHRcdHRlcm1pbmFsLnByb2Nlc3NSZWFkeS50aGVuKCgpID0+IHtcblx0XHRcdFx0aWYgKCFwcm9jZXNzU3RhcnRlZFNpZ25hbGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQucHJvY2Vzc1N0YXJ0ZWQodGFzaywgdGVybWluYWwhLmluc3RhbmNlSWQsIHRlcm1pbmFsIS5wcm9jZXNzSWQhKSk7XG5cdFx0XHRcdFx0cHJvY2Vzc1N0YXJ0ZWRTaWduYWxlZCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sIChfZXJyb3IpID0+IHtcblx0XHRcdFx0Ly8gVGhlIHByb2Nlc3MgbmV2ZXIgZ290IHJlYWR5LiBOZWVkIHRvIHRoaW5rIGhvdyB0byBoYW5kbGUgdGhpcy5cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBvbkRhdGEgPSB0ZXJtaW5hbC5vbkxpbmVEYXRhKChsaW5lKSA9PiB7XG5cdFx0XHRcdHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLnByb2Nlc3NMaW5lKGxpbmUpO1xuXHRcdFx0fSk7XG5cdFx0XHRwcm9taXNlID0gbmV3IFByb21pc2U8SVRhc2tTdW1tYXJ5PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJvdW5kVGVybWluYWwgPSB0ZXJtaW5hbCE7XG5cdFx0XHRcdGNvbnN0IG9uRXhpdCA9IHRlcm1pbmFsIS5vbkV4aXQoKHRlcm1pbmFsTGF1bmNoUmVzdWx0KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpdENvZGUgPSB0eXBlb2YgdGVybWluYWxMYXVuY2hSZXN1bHQgPT09ICdudW1iZXInID8gdGVybWluYWxMYXVuY2hSZXN1bHQgOiB0ZXJtaW5hbExhdW5jaFJlc3VsdD8uY29kZTtcblx0XHRcdFx0XHRvbkV4aXQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGNvbnN0IGtleSA9IHRhc2suZ2V0TWFwS2V5KCk7XG5cdFx0XHRcdFx0Ly8gU2tpcCBpZiBhIGxhdGVyIHJ1biByZXBsYWNlZCB0aGUgZW50cnkgd2l0aCBhIGRpZmZlcmVudCB0ZXJtaW5hbC5cblx0XHRcdFx0XHRjb25zdCBjdXIgPSB0aGlzLl9hY3RpdmVUYXNrc1trZXldO1xuXHRcdFx0XHRcdGlmIChjdXIgJiYgY3VyLnRlcm1pbmFsID09PSBib3VuZFRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZW1vdmVGcm9tQWN0aXZlVGFza3ModGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmNoYW5nZWQoKSk7XG5cdFx0XHRcdFx0aWYgKHRlcm1pbmFsTGF1bmNoUmVzdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkga2VlcCBhIHJlZmVyZW5jZSB0byB0aGUgdGVybWluYWwgaWYgaXQgaXMgbm90IGJlaW5nIGRpc3Bvc2VkLlxuXHRcdFx0XHRcdFx0c3dpdGNoICh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uIS5wYW5lbCkge1xuXHRcdFx0XHRcdFx0XHRjYXNlIFBhbmVsS2luZC5EZWRpY2F0ZWQ6XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2FtZVRhc2tUZXJtaW5hbHNba2V5XSA9IHRlcm1pbmFsIS5pbnN0YW5jZUlkLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdGNhc2UgUGFuZWxLaW5kLlNoYXJlZDpcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9pZGxlVGFza1Rlcm1pbmFscy5zZXQoa2V5LCB0ZXJtaW5hbCEuaW5zdGFuY2VJZC50b1N0cmluZygpLCBUb3VjaC5Bc09sZCk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHJldmVhbCA9IHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24hLnJldmVhbDtcblx0XHRcdFx0XHRjb25zdCByZXZlYWxQcm9ibGVtcyA9IHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24hLnJldmVhbFByb2JsZW1zO1xuXHRcdFx0XHRcdGNvbnN0IHJldmVhbFByb2JsZW1QYW5lbCA9IHRlcm1pbmFsICYmIChyZXZlYWxQcm9ibGVtcyA9PT0gUmV2ZWFsUHJvYmxlbUtpbmQuT25Qcm9ibGVtKSAmJiAoc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubnVtYmVyT2ZNYXRjaGVzID4gMCk7XG5cdFx0XHRcdFx0aWYgKHJldmVhbFByb2JsZW1QYW5lbCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKHRlcm1pbmFsICYmIChyZXZlYWwgPT09IFJldmVhbEtpbmQuU2lsZW50KSAmJiAoKGV4aXRDb2RlICE9PSAwKSB8fCAoc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubnVtYmVyT2ZNYXRjaGVzID4gMCkgJiYgc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubWF4TWFya2VyU2V2ZXJpdHkgJiZcblx0XHRcdFx0XHRcdChzdGFydFN0b3BQcm9ibGVtTWF0Y2hlci5tYXhNYXJrZXJTZXZlcml0eSA+PSBNYXJrZXJTZXZlcml0eS5FcnJvcikpKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwoZmFsc2UpO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHQvLyBJZiB0aGUgdGVybWluYWwgaGFzIGFscmVhZHkgYmVlbiBkaXNwb3NlZCwgdGhlbiBzZXR0aW5nIHRoZSBhY3RpdmUgaW5zdGFuY2Ugd2lsbCBmYWlsLiAjOTk4Mjhcblx0XHRcdFx0XHRcdFx0Ly8gVGhlcmUgaXMgbm90aGluZyBlbHNlIHRvIGRvIGhlcmUuXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIEhhY2sgdG8gd29yayBhcm91bmQgIzkyODY4IHVudGlsIHRlcm1pbmFsIGlzIGZpeGVkLlxuXHRcdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0b25EYXRhLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLmRvbmUoKTtcblx0XHRcdFx0XHRcdHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHByb2JsZW1NYXRjaGVyTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH0sIDEwMCk7XG5cdFx0XHRcdFx0aWYgKCFwcm9jZXNzU3RhcnRlZFNpZ25hbGVkICYmIHRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5wcm9jZXNzU3RhcnRlZCh0YXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkLCB0ZXJtaW5hbC5wcm9jZXNzSWQhKSk7XG5cdFx0XHRcdFx0XHRwcm9jZXNzU3RhcnRlZFNpZ25hbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBkdXJhdGlvbk1zID0gdGhpcy5fdGFrZVRhc2tEdXJhdGlvbih0ZXJtaW5hbD8uaW5zdGFuY2VJZCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQucHJvY2Vzc0VuZGVkKHRhc2ssIHRlcm1pbmFsPy5pbnN0YW5jZUlkLCBleGl0Q29kZSA/PyB1bmRlZmluZWQsIGR1cmF0aW9uTXMpKTtcblx0XHRcdFx0XHRpZiAodGhpcy5fYnVzeVRhc2tzW21hcEtleV0pIHtcblx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9idXN5VGFza3NbbWFwS2V5XTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuaW5hY3RpdmUodGFzaywgdGVybWluYWw/Lmluc3RhbmNlSWQsIGR1cmF0aW9uTXMpKTtcblx0XHRcdFx0XHRpZiAoc3RhcnRTdG9wUHJvYmxlbU1hdGNoZXIubnVtYmVyT2ZNYXRjaGVzICYmIHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLm1heE1hcmtlclNldmVyaXR5ICYmIHN0YXJ0U3RvcFByb2JsZW1NYXRjaGVyLm1heE1hcmtlclNldmVyaXR5ID49IE1hcmtlclNldmVyaXR5LkVycm9yKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90YXNrRXJyb3JzW3Rhc2suZ2V0TWFwS2V5KCldID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmdlbmVyYWwoVGFza0V2ZW50S2luZC5Qcm9ibGVtTWF0Y2hlckZvdW5kRXJyb3JzLCB0YXNrLCB0ZXJtaW5hbD8uaW5zdGFuY2VJZCkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9maXJlVGFza0V2ZW50KFRhc2tFdmVudC5wcm9ibGVtTWF0Y2hlckVuZGVkKHRhc2ssIHRoaXMuX3Rhc2tIYXNFcnJvcnModGFzayksIHRlcm1pbmFsPy5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LmdlbmVyYWwoVGFza0V2ZW50S2luZC5FbmQsIHRhc2ssIHRlcm1pbmFsPy5pbnN0YW5jZUlkKSk7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYW51cFRhc2tUcmFja2luZyh0YXNrKTtcblx0XHRcdFx0XHRyZXNvbHZlKHsgZXhpdENvZGU6IGV4aXRDb2RlID8/IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBzaG93UHJvYmxlbVBhbmVsID0gdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiAmJiAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbi5yZXZlYWxQcm9ibGVtcyA9PT0gUmV2ZWFsUHJvYmxlbUtpbmQuQWx3YXlzKTtcblx0XHRpZiAoc2hvd1Byb2JsZW1QYW5lbCkge1xuXHRcdFx0dGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3KE1hcmtlcnMuTUFSS0VSU19WSUVXX0lEKTtcblx0XHR9IGVsc2UgaWYgKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24gJiYgKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24uZm9jdXMgfHwgdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbi5yZXZlYWwgPT09IFJldmVhbEtpbmQuQWx3YXlzKSkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHRlcm1pbmFsKTtcblx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5yZXZlYWxUZXJtaW5hbCh0ZXJtaW5hbCk7XG5cdFx0XHRpZiAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbi5mb2N1cyAmJiB0ZXJtaW5hbCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbFNlcnZpY2UuZm9jdXNJbnN0YW5jZSh0ZXJtaW5hbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9hY3RpdmVUYXNrc1t0YXNrLmdldE1hcEtleSgpXSkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVGFza3NbdGFzay5nZXRNYXBLZXkoKV0udGVybWluYWwgPSB0ZXJtaW5hbDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdObyBhY3RpdmUgdGFza3MgZm91bmQgZm9yIHRoZSB0ZXJtaW5hbC4nKTtcblx0XHR9XG5cdFx0dGhpcy5fZmlyZVRhc2tFdmVudChUYXNrRXZlbnQuY2hhbmdlZCgpKTtcblx0XHRyZXR1cm4gcHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgX3Rha2VUYXNrRHVyYXRpb24odGVybWluYWxJZDogbnVtYmVyIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGVybWluYWxJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydFRpbWUgPSB0aGlzLl90YXNrU3RhcnRUaW1lcy5nZXQodGVybWluYWxJZCk7XG5cdFx0aWYgKHN0YXJ0VGltZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl90YXNrU3RhcnRUaW1lcy5kZWxldGUodGVybWluYWxJZCk7XG5cdFx0cmV0dXJuIERhdGUubm93KCkgLSBzdGFydFRpbWU7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckNhcHR1cmVkVmFyaWFibGVzKGNhcHR1cmVkVmFyaWFibGVzOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtuYW1lLCB2YWx1ZV0gb2YgY2FwdHVyZWRWYXJpYWJsZXMpIHtcblx0XHRcdHRoaXMuX2NhcHR1cmVkVGFza1ZhcmlhYmxlcy5zZXQobmFtZSwgdmFsdWUpO1xuXHRcdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmFibGVWYXJpYWJsZXMuaGFzKGB0YXNrVmFyOiR7bmFtZX1gKSkge1xuXHRcdFx0XHR0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLmNvbnRyaWJ1dGVWYXJpYWJsZShgdGFza1Zhcjoke25hbWV9YCwgYXN5bmMgKCkgPT4gdGhpcy5fY2FwdHVyZWRUYXNrVmFyaWFibGVzLmdldChuYW1lKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlVGVybWluYWxOYW1lKHRhc2s6IEN1c3RvbVRhc2sgfCBDb250cmlidXRlZFRhc2spOiBzdHJpbmcge1xuXHRcdGNvbnN0IG5lZWRzRm9sZGVyUXVhbGlmaWNhdGlvbiA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTtcblx0XHRyZXR1cm4gbmVlZHNGb2xkZXJRdWFsaWZpY2F0aW9uID8gdGFzay5nZXRRdWFsaWZpZWRMYWJlbCgpIDogKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMubmFtZSB8fCAnJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVTaGVsbExhdW5jaENvbmZpZyh0YXNrOiBDdXN0b21UYXNrIHwgQ29udHJpYnV0ZWRUYXNrLCB3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsIHZhcmlhYmxlUmVzb2x2ZXI6IFZhcmlhYmxlUmVzb2x2ZXIsIHBsYXRmb3JtOiBQbGF0Zm9ybS5QbGF0Zm9ybSwgb3B0aW9uczogQ29tbWFuZE9wdGlvbnMsIGNvbW1hbmQ6IENvbW1hbmRTdHJpbmcsIGFyZ3M6IENvbW1hbmRTdHJpbmdbXSwgd2FpdE9uRXhpdDogV2FpdE9uRXhpdFZhbHVlLCBwcmVzZW50YXRpb25PcHRpb25zOiBJUHJlc2VudGF0aW9uT3B0aW9ucyk6IFByb21pc2U8SVNoZWxsTGF1bmNoQ29uZmlnIHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWc7XG5cdFx0Y29uc3QgaXNTaGVsbENvbW1hbmQgPSB0YXNrLmNvbW1hbmQucnVudGltZSA9PT0gUnVudGltZVR5cGUuU2hlbGw7XG5cdFx0Y29uc3QgbmVlZHNGb2xkZXJRdWFsaWZpY2F0aW9uID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHRcdGNvbnN0IHRlcm1pbmFsTmFtZSA9IHRoaXMuX2NyZWF0ZVRlcm1pbmFsTmFtZSh0YXNrKTtcblx0XHRjb25zdCB0eXBlID0gVGFza1Rlcm1pbmFsVHlwZTtcblx0XHRjb25zdCBvcmlnaW5hbENvbW1hbmQgPSB0YXNrLmNvbW1hbmQubmFtZTtcblx0XHRsZXQgY3dkOiBzdHJpbmcgfCBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG9wdGlvbnMuY3dkKSB7XG5cdFx0XHRjd2QgPSBvcHRpb25zLmN3ZDtcblx0XHRcdGlmICghcGF0aC5pc0Fic29sdXRlKGN3ZCkpIHtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlciAmJiAod29ya3NwYWNlRm9sZGVyLnVyaS5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSkpIHtcblx0XHRcdFx0XHRjd2QgPSBwYXRoLmpvaW4od29ya3NwYWNlRm9sZGVyLnVyaS5mc1BhdGgsIGN3ZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFRoaXMgbXVzdCBiZSBub3JtYWxpemVkIHRvIHRoZSBPU1xuXHRcdFx0Y3dkID0gaXNVTkMoY3dkKSA/IGN3ZCA6IHJlc291cmNlcy50b0xvY2FsUmVzb3VyY2UoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogY3dkIH0pLCB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5LCB0aGlzLl9wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lKTtcblx0XHR9XG5cdFx0aWYgKGlzU2hlbGxDb21tYW5kKSB7XG5cdFx0XHRsZXQgb3M6IFBsYXRmb3JtLk9wZXJhdGluZ1N5c3RlbTtcblx0XHRcdHN3aXRjaCAocGxhdGZvcm0pIHtcblx0XHRcdFx0Y2FzZSBQbGF0Zm9ybS5QbGF0Zm9ybS5XaW5kb3dzOiBvcyA9IFBsYXRmb3JtLk9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzOyBicmVhaztcblx0XHRcdFx0Y2FzZSBQbGF0Zm9ybS5QbGF0Zm9ybS5NYWM6IG9zID0gUGxhdGZvcm0uT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaDsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgUGxhdGZvcm0uUGxhdGZvcm0uTGludXg6XG5cdFx0XHRcdGRlZmF1bHQ6IG9zID0gUGxhdGZvcm0uT3BlcmF0aW5nU3lzdGVtLkxpbnV4OyBicmVhaztcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlZmF1bHRQcm9maWxlID0gYXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLmdldERlZmF1bHRQcm9maWxlKHtcblx0XHRcdFx0YWxsb3dBdXRvbWF0aW9uU2hlbGw6IHRydWUsXG5cdFx0XHRcdG9zLFxuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHk6IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHlcblx0XHRcdH0pO1xuXHRcdFx0bGV0IGljb246IFVSSSB8IFRoZW1lSWNvbiB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uPy5pZCkge1xuXHRcdFx0XHRpY29uID0gVGhlbWVJY29uLmZyb21JZCh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24uaWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdGFza0dyb3VwS2luZCA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPyBHcm91cEtpbmQudG8odGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGtpbmRJZCA9IHR5cGVvZiB0YXNrR3JvdXBLaW5kID09PSAnc3RyaW5nJyA/IHRhc2tHcm91cEtpbmQgOiB0YXNrR3JvdXBLaW5kPy5raW5kO1xuXHRcdFx0XHRpY29uID0ga2luZElkID09PSAndGVzdCcgPyBUaGVtZUljb24uZnJvbUlkKENvZGljb24uYmVha2VyLmlkKSA6IGRlZmF1bHRQcm9maWxlLmljb247XG5cdFx0XHR9XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZyA9IHtcblx0XHRcdFx0bmFtZTogdGVybWluYWxOYW1lLFxuXHRcdFx0XHR0eXBlLFxuXHRcdFx0XHRleGVjdXRhYmxlOiBkZWZhdWx0UHJvZmlsZS5wYXRoLFxuXHRcdFx0XHRhcmdzOiBkZWZhdWx0UHJvZmlsZS5hcmdzLFxuXHRcdFx0XHRlbnY6IHsgLi4uZGVmYXVsdFByb2ZpbGUuZW52IH0sXG5cdFx0XHRcdGljb24sXG5cdFx0XHRcdGNvbG9yOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24/LmNvbG9yIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0d2FpdE9uRXhpdFxuXHRcdFx0fTtcblx0XHRcdGxldCBzaGVsbFNwZWNpZmllZDogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdFx0Y29uc3Qgc2hlbGxPcHRpb25zOiBJU2hlbGxDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkID0gdGFzay5jb21tYW5kLm9wdGlvbnMgJiYgdGFzay5jb21tYW5kLm9wdGlvbnMuc2hlbGw7XG5cdFx0XHRpZiAoc2hlbGxPcHRpb25zKSB7XG5cdFx0XHRcdGlmIChzaGVsbE9wdGlvbnMuZXhlY3V0YWJsZSkge1xuXHRcdFx0XHRcdC8vIENsZWFyIG91dCB0aGUgYXJncyBzbyB0aGF0IHdlIGRvbid0IGVuZCB1cCB3aXRoIG1pc21hdGNoZWQgYXJncy5cblx0XHRcdFx0XHRpZiAoc2hlbGxPcHRpb25zLmV4ZWN1dGFibGUgIT09IHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUpIHtcblx0XHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUodmFyaWFibGVSZXNvbHZlciwgc2hlbGxPcHRpb25zLmV4ZWN1dGFibGUpO1xuXHRcdFx0XHRcdHNoZWxsU3BlY2lmaWVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2hlbGxPcHRpb25zLmFyZ3MpIHtcblx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5hcmdzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlcyh2YXJpYWJsZVJlc29sdmVyLCBzaGVsbE9wdGlvbnMuYXJncy5zbGljZSgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5hcmdzID0gW107XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzaGVsbEFyZ3MgPSBBcnJheS5pc0FycmF5KHNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MpID8gPHN0cmluZ1tdPnNoZWxsTGF1bmNoQ29uZmlnLmFyZ3Muc2xpY2UoMCkgOiBbc2hlbGxMYXVuY2hDb25maWcuYXJnc107XG5cdFx0XHRjb25zdCB0b0FkZDogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGJhc2VuYW1lID0gcGF0aC5wb3NpeC5iYXNlbmFtZSgoYXdhaXQgdGhpcy5fcGF0aFNlcnZpY2UuZmlsZVVSSShzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlISkpLnBhdGgpLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRjb25zdCBjb21tYW5kTGluZSA9IHRoaXMuX2J1aWxkU2hlbGxDb21tYW5kTGluZShwbGF0Zm9ybSwgYmFzZW5hbWUsIHNoZWxsT3B0aW9ucywgY29tbWFuZCwgb3JpZ2luYWxDb21tYW5kLCBhcmdzKTtcblx0XHRcdGxldCB3aW5kb3dzU2hlbGxBcmdzOiBib29sZWFuID0gZmFsc2U7XG5cdFx0XHRpZiAocGxhdGZvcm0gPT09IFBsYXRmb3JtLlBsYXRmb3JtLldpbmRvd3MpIHtcblx0XHRcdFx0d2luZG93c1NoZWxsQXJncyA9IHRydWU7XG5cdFx0XHRcdC8vIElmIHdlIGRvbid0IGhhdmUgYSBjd2QsIHRoZW4gdGhlIHRlcm1pbmFsIHVzZXMgdGhlIGhvbWUgZGlyLlxuXHRcdFx0XHRjb25zdCB1c2VySG9tZSA9IGF3YWl0IHRoaXMuX3BhdGhTZXJ2aWNlLnVzZXJIb21lKCk7XG5cdFx0XHRcdGlmIChiYXNlbmFtZSA9PT0gJ2NtZC5leGUnICYmICgob3B0aW9ucy5jd2QgJiYgaXNVTkMob3B0aW9ucy5jd2QpKSB8fCAoIW9wdGlvbnMuY3dkICYmIGlzVU5DKHVzZXJIb21lLmZzUGF0aCkpKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChiYXNlbmFtZSA9PT0gJ3Bvd2Vyc2hlbGwuZXhlJykgfHwgKGJhc2VuYW1lID09PSAncHdzaC5leGUnKSkge1xuXHRcdFx0XHRcdGlmICghc2hlbGxTcGVjaWZpZWQpIHtcblx0XHRcdFx0XHRcdHRvQWRkLnB1c2goJy1Db21tYW5kJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKChiYXNlbmFtZSA9PT0gJ2Jhc2guZXhlJykgfHwgKGJhc2VuYW1lID09PSAnenNoLmV4ZScpKSB7XG5cdFx0XHRcdFx0d2luZG93c1NoZWxsQXJncyA9IGZhbHNlO1xuXHRcdFx0XHRcdGlmICghc2hlbGxTcGVjaWZpZWQpIHtcblx0XHRcdFx0XHRcdHRvQWRkLnB1c2goJy1jJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGJhc2VuYW1lID09PSAnd3NsLmV4ZScpIHtcblx0XHRcdFx0XHRpZiAoIXNoZWxsU3BlY2lmaWVkKSB7XG5cdFx0XHRcdFx0XHR0b0FkZC5wdXNoKCctZScpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIGlmIChiYXNlbmFtZSA9PT0gJ251LmV4ZScpIHtcblx0XHRcdFx0XHRpZiAoIXNoZWxsU3BlY2lmaWVkKSB7XG5cdFx0XHRcdFx0XHR0b0FkZC5wdXNoKCctYycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpZiAoIXNoZWxsU3BlY2lmaWVkKSB7XG5cdFx0XHRcdFx0XHR0b0FkZC5wdXNoKCcvZCcsICcvYycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKCFzaGVsbFNwZWNpZmllZCkge1xuXHRcdFx0XHRcdC8vIFVuZGVyIE1hYyByZW1vdmUgLWwgdG8gbm90IHN0YXJ0IGl0IGFzIGEgbG9naW4gc2hlbGwuXG5cdFx0XHRcdFx0aWYgKHBsYXRmb3JtID09PSBQbGF0Zm9ybS5QbGF0Zm9ybS5NYWMpIHtcblx0XHRcdFx0XHRcdC8vIEJhY2tncm91bmQgb24gLWwgb24gb3N4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDc1NjNcblx0XHRcdFx0XHRcdC8vIFRPRE86IEhhbmRsZSBieSBwdWxsaW5nIHRoZSBkZWZhdWx0IHRlcm1pbmFsIHByb2ZpbGU/XG5cdFx0XHRcdFx0XHQvLyBjb25zdCBvc3hTaGVsbEFyZ3MgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KFRlcm1pbmFsU2V0dGluZ0lkLlNoZWxsQXJnc01hY09zKTtcblx0XHRcdFx0XHRcdC8vIGlmICgob3N4U2hlbGxBcmdzLnVzZXIgPT09IHVuZGVmaW5lZCkgJiYgKG9zeFNoZWxsQXJncy51c2VyTG9jYWwgPT09IHVuZGVmaW5lZCkgJiYgKG9zeFNoZWxsQXJncy51c2VyTG9jYWxWYWx1ZSA9PT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0Ly8gXHQmJiAob3N4U2hlbGxBcmdzLnVzZXJSZW1vdGUgPT09IHVuZGVmaW5lZCkgJiYgKG9zeFNoZWxsQXJncy51c2VyUmVtb3RlVmFsdWUgPT09IHVuZGVmaW5lZClcblx0XHRcdFx0XHRcdC8vIFx0JiYgKG9zeFNoZWxsQXJncy51c2VyVmFsdWUgPT09IHVuZGVmaW5lZCkgJiYgKG9zeFNoZWxsQXJncy53b3Jrc3BhY2UgPT09IHVuZGVmaW5lZClcblx0XHRcdFx0XHRcdC8vIFx0JiYgKG9zeFNoZWxsQXJncy53b3Jrc3BhY2VGb2xkZXIgPT09IHVuZGVmaW5lZCkgJiYgKG9zeFNoZWxsQXJncy53b3Jrc3BhY2VGb2xkZXJWYWx1ZSA9PT0gdW5kZWZpbmVkKVxuXHRcdFx0XHRcdFx0Ly8gXHQmJiAob3N4U2hlbGxBcmdzLndvcmtzcGFjZVZhbHVlID09PSB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdFx0XHQvLyBcdGNvbnN0IGluZGV4ID0gc2hlbGxBcmdzLmluZGV4T2YoJy1sJyk7XG5cdFx0XHRcdFx0XHQvLyBcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdC8vIFx0XHRzaGVsbEFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0XHRcdC8vIFx0fVxuXHRcdFx0XHRcdFx0Ly8gfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0b0FkZC5wdXNoKCctYycpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb21iaW5lZFNoZWxsQXJncyA9IHRoaXMuX2FkZEFsbEFyZ3VtZW50KHRvQWRkLCBzaGVsbEFyZ3MpO1xuXHRcdFx0Y29tYmluZWRTaGVsbEFyZ3MucHVzaChjb21tYW5kTGluZSk7XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5zaGVsbEludGVncmF0aW9uTm9uY2UgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRMaW5lSW5mbyA9IHtcblx0XHRcdFx0Y29tbWFuZExpbmUsXG5cdFx0XHRcdG5vbmNlOiBzaGVsbExhdW5jaENvbmZpZy5zaGVsbEludGVncmF0aW9uTm9uY2Vcblx0XHRcdH07XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5hcmdzID0gd2luZG93c1NoZWxsQXJncyA/IGNvbWJpbmVkU2hlbGxBcmdzLmpvaW4oJyAnKSA6IGNvbWJpbmVkU2hlbGxBcmdzO1xuXHRcdFx0aWYgKHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24gJiYgdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbi5lY2hvKSB7XG5cdFx0XHRcdGlmIChuZWVkc0ZvbGRlclF1YWxpZmljYXRpb24gJiYgd29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9sZGVyID0gY3dkICYmIHR5cGVvZiBjd2QgPT09ICdvYmplY3QnICYmIE9iamVjdC5oYXNPd24oY3dkLCAncGF0aCcpID8gcGF0aC5iYXNlbmFtZShjd2QucGF0aCkgOiB3b3Jrc3BhY2VGb2xkZXIubmFtZTtcblx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IHRoaXMudGFza1NoZWxsSW50ZWdyYXRpb25TdGFydFNlcXVlbmNlKGN3ZCkgKyBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwobmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdGtleTogJ3Rhc2suZXhlY3V0aW5nSW5Gb2xkZXInLFxuXHRcdFx0XHRcdFx0Y29tbWVudDogWydUaGUgd29ya3NwYWNlIGZvbGRlciB0aGUgdGFzayBpcyBydW5uaW5nIGluJywgJ1RoZSB0YXNrIGNvbW1hbmQgbGluZSBvciBsYWJlbCddXG5cblx0XHRcdFx0XHR9LCAnRXhlY3V0aW5nIHRhc2sgaW4gZm9sZGVyIHswfTogezF9JywgZm9sZGVyLCBjb21tYW5kTGluZSksIHsgZXhjbHVkZUxlYWRpbmdOZXdMaW5lOiB0cnVlIH0pICsgdGhpcy5nZXRUYXNrU2hlbGxJbnRlZ3JhdGlvbk91dHB1dFNlcXVlbmNlKGNvbW1hbmRMaW5lSW5mbyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQgPSB0aGlzLnRhc2tTaGVsbEludGVncmF0aW9uU3RhcnRTZXF1ZW5jZShjd2QpICsgZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKG5scy5sb2NhbGl6ZSh7XG5cdFx0XHRcdFx0XHRrZXk6ICd0YXNrLmV4ZWN1dGluZy5zaGVsbEludGVncmF0aW9uJyxcblx0XHRcdFx0XHRcdGNvbW1lbnQ6IFsnVGhlIHRhc2sgY29tbWFuZCBsaW5lIG9yIGxhYmVsJ11cblx0XHRcdFx0XHR9LCAnRXhlY3V0aW5nIHRhc2s6IHswfScsIGNvbW1hbmRMaW5lKSwgeyBleGNsdWRlTGVhZGluZ05ld0xpbmU6IHRydWUgfSkgKyB0aGlzLmdldFRhc2tTaGVsbEludGVncmF0aW9uT3V0cHV0U2VxdWVuY2UoY29tbWFuZExpbmVJbmZvKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQgPSB7XG5cdFx0XHRcdFx0dGV4dDogdGhpcy50YXNrU2hlbGxJbnRlZ3JhdGlvblN0YXJ0U2VxdWVuY2UoY3dkKSArIHRoaXMuZ2V0VGFza1NoZWxsSW50ZWdyYXRpb25PdXRwdXRTZXF1ZW5jZShjb21tYW5kTGluZUluZm8pLFxuXHRcdFx0XHRcdHRyYWlsaW5nTmV3TGluZTogZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgY29tbWFuZEV4ZWN1dGFibGUgPSAodGFzay5jb21tYW5kLnJ1bnRpbWUgIT09IFJ1bnRpbWVUeXBlLkN1c3RvbUV4ZWN1dGlvbikgPyBDb21tYW5kU3RyaW5nLnZhbHVlKGNvbW1hbmQpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZXhlY3V0YWJsZSA9ICFpc1NoZWxsQ29tbWFuZFxuXHRcdFx0XHQ/IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZSh2YXJpYWJsZVJlc29sdmVyLCBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUodmFyaWFibGVSZXNvbHZlciwgJyR7JyArIFRlcm1pbmFsVGFza1N5c3RlbS5Qcm9jZXNzVmFyTmFtZSArICd9JykpXG5cdFx0XHRcdDogY29tbWFuZEV4ZWN1dGFibGU7XG5cblx0XHRcdC8vIFdoZW4gd2UgaGF2ZSBhIHByb2Nlc3MgdGFzayB0aGVyZSBpcyBubyBuZWVkIHRvIHF1b3RlIGFyZ3VtZW50cy4gU28gd2UgZ28gYWhlYWQgYW5kIHRha2UgdGhlIHN0cmluZyB2YWx1ZS5cblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnID0ge1xuXHRcdFx0XHRuYW1lOiB0ZXJtaW5hbE5hbWUsXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdGljb246IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbj8uaWQgPyBUaGVtZUljb24uZnJvbUlkKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWNvbi5pZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbG9yOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24/LmNvbG9yIHx8IHVuZGVmaW5lZCxcblx0XHRcdFx0ZXhlY3V0YWJsZTogZXhlY3V0YWJsZSxcblx0XHRcdFx0YXJnczogYXJncy5tYXAoYSA9PiBUeXBlcy5pc1N0cmluZyhhKSA/IGEgOiBhLnZhbHVlKSxcblx0XHRcdFx0d2FpdE9uRXhpdFxuXHRcdFx0fTtcblx0XHRcdGlmICh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uICYmIHRhc2suY29tbWFuZC5wcmVzZW50YXRpb24uZWNobykge1xuXHRcdFx0XHRjb25zdCBnZXRBcmdzVG9FY2hvID0gKGFyZ3M6IFR5cGVzLlNpbmdsZU9yTWFueTxzdHJpbmc+IHwgdW5kZWZpbmVkKTogc3RyaW5nID0+IHtcblx0XHRcdFx0XHRpZiAoIWFyZ3MgfHwgYXJncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiAnJztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGFyZ3MpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXJncztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGFyZ3Muam9pbignICcpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAobmVlZHNGb2xkZXJRdWFsaWZpY2F0aW9uICYmIHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0ID0gdGhpcy50YXNrU2hlbGxJbnRlZ3JhdGlvblN0YXJ0U2VxdWVuY2UoY3dkKSArIGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbChubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0a2V5OiAndGFzay5leGVjdXRpbmdJbkZvbGRlcicsXG5cdFx0XHRcdFx0XHRjb21tZW50OiBbJ1RoZSB3b3Jrc3BhY2UgZm9sZGVyIHRoZSB0YXNrIGlzIHJ1bm5pbmcgaW4nLCAnVGhlIHRhc2sgY29tbWFuZCBsaW5lIG9yIGxhYmVsJ11cblx0XHRcdFx0XHR9LCAnRXhlY3V0aW5nIHRhc2sgaW4gZm9sZGVyIHswfTogezF9Jywgd29ya3NwYWNlRm9sZGVyLm5hbWUsIGAke3NoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGV9ICR7Z2V0QXJnc1RvRWNobyhzaGVsbExhdW5jaENvbmZpZy5hcmdzKX1gKSwgeyBleGNsdWRlTGVhZGluZ05ld0xpbmU6IHRydWUgfSkgKyB0aGlzLmdldFRhc2tTaGVsbEludGVncmF0aW9uT3V0cHV0U2VxdWVuY2UodW5kZWZpbmVkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5pbml0aWFsVGV4dCA9IHRoaXMudGFza1NoZWxsSW50ZWdyYXRpb25TdGFydFNlcXVlbmNlKGN3ZCkgKyBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwobmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdGtleTogJ3Rhc2suZXhlY3V0aW5nLnNoZWxsLWludGVncmF0aW9uJyxcblx0XHRcdFx0XHRcdGNvbW1lbnQ6IFsnVGhlIHRhc2sgY29tbWFuZCBsaW5lIG9yIGxhYmVsJ11cblx0XHRcdFx0XHR9LCAnRXhlY3V0aW5nIHRhc2s6IHswfScsIGAke3NoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGV9ICR7Z2V0QXJnc1RvRWNobyhzaGVsbExhdW5jaENvbmZpZy5hcmdzKX1gKSwgeyBleGNsdWRlTGVhZGluZ05ld0xpbmU6IHRydWUgfSkgKyB0aGlzLmdldFRhc2tTaGVsbEludGVncmF0aW9uT3V0cHV0U2VxdWVuY2UodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQgPSB7XG5cdFx0XHRcdFx0dGV4dDogdGhpcy50YXNrU2hlbGxJbnRlZ3JhdGlvblN0YXJ0U2VxdWVuY2UoY3dkKSArIHRoaXMuZ2V0VGFza1NoZWxsSW50ZWdyYXRpb25PdXRwdXRTZXF1ZW5jZSh1bmRlZmluZWQpLFxuXHRcdFx0XHRcdHRyYWlsaW5nTmV3TGluZTogZmFsc2Vcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY3dkKSB7XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5jd2QgPSBjd2Q7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLmVudikge1xuXHRcdFx0aWYgKHNoZWxsTGF1bmNoQ29uZmlnLmVudikge1xuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5lbnYgPSB7IC4uLnNoZWxsTGF1bmNoQ29uZmlnLmVudiwgLi4ub3B0aW9ucy5lbnYgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmVudiA9IG9wdGlvbnMuZW52O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRzaGVsbExhdW5jaENvbmZpZy5pc0ZlYXR1cmVUZXJtaW5hbCA9IHRydWU7XG5cdFx0c2hlbGxMYXVuY2hDb25maWcudXNlU2hlbGxFbnZpcm9ubWVudCA9IHRydWU7XG5cdFx0c2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucyA9IHRoaXMuX3Rlcm1pbmFsVGFiQWN0aW9ucztcblx0XHRyZXR1cm4gc2hlbGxMYXVuY2hDb25maWc7XG5cdH1cblxuXHRwcml2YXRlIF9hZGRBbGxBcmd1bWVudChzaGVsbENvbW1hbmRBcmdzOiBzdHJpbmdbXSwgY29uZmlndXJlZFNoZWxsQXJnczogc3RyaW5nW10pOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgY29tYmluZWRTaGVsbEFyZ3M6IHN0cmluZ1tdID0gT2JqZWN0cy5kZWVwQ2xvbmUoY29uZmlndXJlZFNoZWxsQXJncyk7XG5cdFx0c2hlbGxDb21tYW5kQXJncy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvdWxkQWRkU2hlbGxDb21tYW5kQXJnID0gY29uZmlndXJlZFNoZWxsQXJncy5ldmVyeSgoYXJnLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRpZiAoKGFyZy50b0xvd2VyQ2FzZSgpID09PSBlbGVtZW50KSAmJiAoY29uZmlndXJlZFNoZWxsQXJncy5sZW5ndGggPiBpbmRleCArIDEpKSB7XG5cdFx0XHRcdFx0Ly8gV2UgY2FuIHN0aWxsIGFkZCB0aGUgYXJndW1lbnQsIGJ1dCBvbmx5IGlmIG5vdCBhbGwgb2YgdGhlIGZvbGxvd2luZyBhcmd1bWVudHMgYmVnaW4gd2l0aCBcIi1cIi5cblx0XHRcdFx0XHRyZXR1cm4gIWNvbmZpZ3VyZWRTaGVsbEFyZ3Muc2xpY2UoaW5kZXggKyAxKS5ldmVyeSh0ZXN0QXJnID0+IHRlc3RBcmcuc3RhcnRzV2l0aCgnLScpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXR1cm4gYXJnLnRvTG93ZXJDYXNlKCkgIT09IGVsZW1lbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYgKHNob3VsZEFkZFNoZWxsQ29tbWFuZEFyZykge1xuXHRcdFx0XHRjb21iaW5lZFNoZWxsQXJncy5wdXNoKGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiBjb21iaW5lZFNoZWxsQXJncztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29ubmVjdFRvVGVybWluYWwodGFzazogVGFzayk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZWNvbm5lY3RlZEluc3RhbmNlcyA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMuZmlsdGVyKGUgPT4gZS5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzPy5vd25lcklkID09PSBUYXNrVGVybWluYWxUeXBlKTtcblx0XHRyZXR1cm4gcmVjb25uZWN0ZWRJbnN0YW5jZXMuZmluZChlID0+IGdldFJlY29ubmVjdGlvbkRhdGEoZSk/Lmxhc3RUYXNrID09PSB0YXNrLmdldENvbW1vblRhc2tJZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvQ3JlYXRlVGVybWluYWwodGFzazogVGFzaywgZ3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZCwgbGF1bmNoQ29uZmlnczogSVNoZWxsTGF1bmNoQ29uZmlnKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGNvbnN0IHJlY29ubmVjdGVkVGVybWluYWwgPSBhd2FpdCB0aGlzLl9yZWNvbm5lY3RUb1Rlcm1pbmFsKHRhc2spO1xuXHRcdGNvbnN0IHJlZ2lzdGVyT25EaXNwb3NlZCA9ICh0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UpID0+IHtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGVybWluYWwub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2ZpcmVUYXNrRXZlbnQoVGFza0V2ZW50LnRlcm1pbmF0ZWQodGFzaywgdGVybWluYWwuaW5zdGFuY2VJZCwgdGVybWluYWwuZXhpdFJlYXNvbikpO1xuXHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdGlmIChyZWNvbm5lY3RlZFRlcm1pbmFsKSB7XG5cdFx0XHRpZiAoKEN1c3RvbVRhc2suaXModGFzaykgfHwgQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSAmJiB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uKSB7XG5cdFx0XHRcdHJlY29ubmVjdGVkVGVybWluYWwud2FpdE9uRXhpdCA9IGdldFdhaXRPbkV4aXRWYWx1ZSh0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKTtcblx0XHRcdH1cblx0XHRcdHJlZ2lzdGVyT25EaXNwb3NlZChyZWNvbm5lY3RlZFRlcm1pbmFsKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ3JlY29ubmVjdGVkIHRvIHRhc2sgYW5kIHRlcm1pbmFsJywgdGFzay5faWQpO1xuXHRcdFx0cmV0dXJuIHJlY29ubmVjdGVkVGVybWluYWw7XG5cdFx0fVxuXHRcdGlmIChncm91cCkge1xuXHRcdFx0Ly8gVHJ5IHRvIGZpbmQgYW4gZXhpc3RpbmcgdGVybWluYWwgdG8gc3BsaXQuXG5cdFx0XHQvLyBFdmVuIGlmIGFuIGV4aXN0aW5nIHRlcm1pbmFsIGlzIGZvdW5kLCB0aGUgc3BsaXQgY2FuIGZhaWwgaWYgdGhlIHRlcm1pbmFsIHdpZHRoIGlzIHRvbyBzbWFsbC5cblx0XHRcdGZvciAoY29uc3QgdGVybWluYWwgb2YgT2JqZWN0LnZhbHVlcyh0aGlzLl90ZXJtaW5hbHMpKSB7XG5cdFx0XHRcdGlmICh0ZXJtaW5hbC5ncm91cCA9PT0gZ3JvdXApIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBGb3VuZCB0ZXJtaW5hbCB0byBzcGxpdCBmb3IgZ3JvdXAgJHtncm91cH1gKTtcblx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbEluc3RhbmNlID0gdGVybWluYWwudGVybWluYWw7XG5cdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fdGVybWluYWxTZXJ2aWNlLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IHsgcGFyZW50VGVybWluYWw6IG9yaWdpbmFsSW5zdGFuY2UgfSwgY29uZmlnOiBsYXVuY2hDb25maWdzIH0pO1xuXHRcdFx0XHRcdHJlZ2lzdGVyT25EaXNwb3NlZChyZXN1bHQpO1xuXHRcdFx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBObyB0ZXJtaW5hbCBmb3VuZCB0byBzcGxpdCBmb3IgZ3JvdXAgJHtncm91cH1gKTtcblx0XHR9XG5cdFx0Ly8gRWl0aGVyIG5vIGdyb3VwIGlzIHVzZWQsIG5vIHRlcm1pbmFsIHdpdGggdGhlIGdyb3VwIGV4aXN0cyBvciBzcGxpdHRpbmcgYW4gZXhpc3RpbmcgdGVybWluYWwgZmFpbGVkLlxuXHRcdGNvbnN0IGNyZWF0ZWRUZXJtaW5hbCA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5jcmVhdGVUZXJtaW5hbCh7IGNvbmZpZzogbGF1bmNoQ29uZmlncyB9KTtcblx0XHRyZWdpc3Rlck9uRGlzcG9zZWQoY3JlYXRlZFRlcm1pbmFsKTtcblx0XHRyZXR1cm4gY3JlYXRlZFRlcm1pbmFsO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb25uZWN0VG9UZXJtaW5hbHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2hhc1JlY29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBBbHJlYWR5IHJlY29ubmVjdGVkIHRvIHRlcm1pbmFscywgc28gcmV0dXJuaW5nYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlY29ubmVjdGVkSW5zdGFuY2VzID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5maWx0ZXIoZSA9PiBlLnJlY29ubmVjdGlvblByb3BlcnRpZXM/Lm93bmVySWQgPT09IFRhc2tUZXJtaW5hbFR5cGUpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYEF0dGVtcHRpbmcgcmVjb25uZWN0aW9uIG9mICR7cmVjb25uZWN0ZWRJbnN0YW5jZXMubGVuZ3RofSB0ZXJtaW5hbHNgKTtcblx0XHRpZiAoIXJlY29ubmVjdGVkSW5zdGFuY2VzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgTm8gdGVybWluYWxzIHRvIHJlY29ubmVjdCB0byBzbyByZXR1cm5pbmdgKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCB0ZXJtaW5hbCBvZiByZWNvbm5lY3RlZEluc3RhbmNlcykge1xuXHRcdFx0XHRjb25zdCBkYXRhID0gZ2V0UmVjb25uZWN0aW9uRGF0YSh0ZXJtaW5hbCkgYXMgSVJlY29ubmVjdGlvblRhc2tEYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdGNvbnN0IHRlcm1pbmFsRGF0YSA9IHsgbGFzdFRhc2s6IGRhdGEubGFzdFRhc2ssIGdyb3VwOiBkYXRhLmdyb3VwLCB0ZXJtaW5hbCwgc2hlbGxJbnRlZ3JhdGlvbk5vbmNlOiBkYXRhLnNoZWxsSW50ZWdyYXRpb25Ob25jZSB9O1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmFsc1t0ZXJtaW5hbC5pbnN0YW5jZUlkXSA9IHRlcm1pbmFsRGF0YTtcblx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IHRlcm1pbmFsLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fZGVsZXRlVGFza0FuZFRlcm1pbmFsKHRlcm1pbmFsLCB0ZXJtaW5hbERhdGEpO1xuXHRcdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1JlY29ubmVjdGluZyB0byB0YXNrIHRlcm1pbmFsJywgdGVybWluYWxEYXRhLmxhc3RUYXNrLCB0ZXJtaW5hbC5pbnN0YW5jZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9oYXNSZWNvbm5lY3RlZCA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9kZWxldGVUYXNrQW5kVGVybWluYWwodGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlLCB0ZXJtaW5hbERhdGE6IElUZXJtaW5hbERhdGEpOiB2b2lkIHtcblx0XHRkZWxldGUgdGhpcy5fdGVybWluYWxzW3Rlcm1pbmFsLmluc3RhbmNlSWRdO1xuXHRcdGRlbGV0ZSB0aGlzLl9zYW1lVGFza1Rlcm1pbmFsc1t0ZXJtaW5hbERhdGEubGFzdFRhc2tdO1xuXHRcdHRoaXMuX2lkbGVUYXNrVGVybWluYWxzLmRlbGV0ZSh0ZXJtaW5hbERhdGEubGFzdFRhc2spO1xuXHRcdC8vIERlbGV0ZSB0aGUgdGFzayBub3cgYXMgYSB3b3JrIGFyb3VuZCBmb3IgY2FzZXMgd2hlbiB0aGUgb25FeGl0IGlzbid0IGZpcmVkLlxuXHRcdC8vIFRoaXMgY2FuIGhhcHBlbiBpZiB0aGUgdGVybWluYWwgd2Fzbid0IHNodXRkb3duIHdpdGggYW4gXCJpbW1lZGlhdGVcIiBmbGFnIGFuZCBpcyBleHBlY3RlZC5cblx0XHQvLyBGb3IgY29ycmVjdCB0ZXJtaW5hbCByZS11c2UsIHRoZSB0YXNrIG5lZWRzIHRvIGJlIGRlbGV0ZWQgaW1tZWRpYXRlbHkuXG5cdFx0Ly8gTm90ZSB0aGF0IHRoaXMgc2hvdWxkbid0IGJlIGEgcHJvYmxlbSBhbnltb3JlIHNpbmNlIHVzZXIgaW5pdGlhdGVkIHRlcm1pbmFsIGtpbGxzIGFyZSBub3cgaW1tZWRpYXRlLlxuXHRcdGNvbnN0IG1hcEtleSA9IHRlcm1pbmFsRGF0YS5sYXN0VGFzaztcblx0XHQvLyBTa2lwIGlmIGEgbGF0ZXIgcnVuIHJlcGxhY2VkIHRoZSBlbnRyeSB3aXRoIGEgZGlmZmVyZW50IHRlcm1pbmFsLlxuXHRcdGNvbnN0IGN1ciA9IHRoaXMuX2FjdGl2ZVRhc2tzW21hcEtleV07XG5cdFx0aWYgKGN1ciAmJiBjdXIudGVybWluYWwgPT09IHRlcm1pbmFsKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVGcm9tQWN0aXZlVGFza3MobWFwS2V5KTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2J1c3lUYXNrc1ttYXBLZXldKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fYnVzeVRhc2tzW21hcEtleV07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlVGVybWluYWwodGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzaywgcmVzb2x2ZXI6IFZhcmlhYmxlUmVzb2x2ZXIsIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8W0lUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkLCBUYXNrRXJyb3IgfCB1bmRlZmluZWRdPiB7XG5cdFx0Y29uc3QgcGxhdGZvcm0gPSByZXNvbHZlci50YXNrU3lzdGVtSW5mbyA/IHJlc29sdmVyLnRhc2tTeXN0ZW1JbmZvLnBsYXRmb3JtIDogUGxhdGZvcm0ucGxhdGZvcm07XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVPcHRpb25zKHJlc29sdmVyLCB0YXNrLmNvbW1hbmQub3B0aW9ucyk7XG5cdFx0Y29uc3QgcHJlc2VudGF0aW9uT3B0aW9ucyA9IHRhc2suY29tbWFuZC5wcmVzZW50YXRpb247XG5cblx0XHRpZiAoIXByZXNlbnRhdGlvbk9wdGlvbnMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVGFzayBwcmVzZW50YXRpb24gb3B0aW9ucyBzaG91bGQgbm90IGJlIHVuZGVmaW5lZCBoZXJlLicpO1xuXHRcdH1cblx0XHRjb25zdCB3YWl0T25FeGl0ID0gZ2V0V2FpdE9uRXhpdFZhbHVlKHByZXNlbnRhdGlvbk9wdGlvbnMsIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMpO1xuXG5cdFx0bGV0IGNvbW1hbmQ6IENvbW1hbmRTdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGFyZ3M6IENvbW1hbmRTdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGF1bmNoQ29uZmlnczogSVNoZWxsTGF1bmNoQ29uZmlnIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRhc2suY29tbWFuZC5ydW50aW1lID09PSBSdW50aW1lVHlwZS5DdXN0b21FeGVjdXRpb24pIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRUYXNrLnNoZWxsTGF1bmNoQ29uZmlnID0gbGF1bmNoQ29uZmlncyA9IHtcblx0XHRcdFx0Y3VzdG9tUHR5SW1wbGVtZW50YXRpb246IChpZCwgY29scywgcm93cykgPT4gbmV3IFRlcm1pbmFsUHJvY2Vzc0V4dEhvc3RQcm94eShpZCwgY29scywgcm93cywgdGhpcy5fdGVybWluYWxTZXJ2aWNlKSxcblx0XHRcdFx0d2FpdE9uRXhpdCxcblx0XHRcdFx0bmFtZTogdGhpcy5fY3JlYXRlVGVybWluYWxOYW1lKHRhc2spLFxuXHRcdFx0XHRpbml0aWFsVGV4dDogdGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiAmJiB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uLmVjaG8gPyBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwobmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRrZXk6ICd0YXNrLmV4ZWN1dGluZycsXG5cdFx0XHRcdFx0Y29tbWVudDogWydUaGUgdGFzayBjb21tYW5kIGxpbmUgb3IgbGFiZWwnXVxuXHRcdFx0XHR9LCAnRXhlY3V0aW5nIHRhc2s6IHswfScsIHRhc2suX2xhYmVsKSwgeyBleGNsdWRlTGVhZGluZ05ld0xpbmU6IHRydWUgfSkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzRmVhdHVyZVRlcm1pbmFsOiB0cnVlLFxuXHRcdFx0XHRpY29uOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24/LmlkID8gVGhlbWVJY29uLmZyb21JZCh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmljb24uaWQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb2xvcjogdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pY29uPy5jb2xvciB8fCB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZFJlc3VsdDogeyBjb21tYW5kOiBDb21tYW5kU3RyaW5nOyBhcmdzOiBDb21tYW5kU3RyaW5nW10gfSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVDb21tYW5kQW5kQXJncyhyZXNvbHZlciwgdGFzay5jb21tYW5kKTtcblx0XHRcdGNvbW1hbmQgPSByZXNvbHZlZFJlc3VsdC5jb21tYW5kO1xuXHRcdFx0YXJncyA9IHJlc29sdmVkUmVzdWx0LmFyZ3M7XG5cblx0XHRcdHRoaXMuX2N1cnJlbnRUYXNrLnNoZWxsTGF1bmNoQ29uZmlnID0gbGF1bmNoQ29uZmlncyA9IGF3YWl0IHRoaXMuX2NyZWF0ZVNoZWxsTGF1bmNoQ29uZmlnKHRhc2ssIHdvcmtzcGFjZUZvbGRlciwgcmVzb2x2ZXIsIHBsYXRmb3JtLCBvcHRpb25zLCBjb21tYW5kLCBhcmdzLCB3YWl0T25FeGl0LCBwcmVzZW50YXRpb25PcHRpb25zKTtcblx0XHRcdGlmIChsYXVuY2hDb25maWdzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIFt1bmRlZmluZWQsIG5ldyBUYXNrRXJyb3IoU2V2ZXJpdHkuRXJyb3IsIG5scy5sb2NhbGl6ZSgnVGVybWluYWxUYXNrU3lzdGVtJywgJ0NhblxcJ3QgZXhlY3V0ZSBhIHNoZWxsIGNvbW1hbmQgb24gYW4gVU5DIGRyaXZlIHVzaW5nIGNtZC5leGUuJyksIFRhc2tFcnJvcnMuVW5rbm93bkVycm9yKV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHByZWZlcnNTYW1lVGVybWluYWwgPSBwcmVzZW50YXRpb25PcHRpb25zLnBhbmVsID09PSBQYW5lbEtpbmQuRGVkaWNhdGVkO1xuXHRcdGNvbnN0IGFsbG93c1NoYXJlZFRlcm1pbmFsID0gcHJlc2VudGF0aW9uT3B0aW9ucy5wYW5lbCA9PT0gUGFuZWxLaW5kLlNoYXJlZDtcblx0XHRjb25zdCBncm91cCA9IHByZXNlbnRhdGlvbk9wdGlvbnMuZ3JvdXA7XG5cblx0XHRjb25zdCB0YXNrS2V5ID0gdGFzay5nZXRNYXBLZXkoKTtcblx0XHRsZXQgdGVybWluYWxUb1JldXNlOiBJVGVybWluYWxEYXRhIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChwcmVmZXJzU2FtZVRlcm1pbmFsKSB7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbElkID0gdGhpcy5fc2FtZVRhc2tUZXJtaW5hbHNbdGFza0tleV07XG5cdFx0XHRpZiAodGVybWluYWxJZCkge1xuXHRcdFx0XHR0ZXJtaW5hbFRvUmV1c2UgPSB0aGlzLl90ZXJtaW5hbHNbdGVybWluYWxJZF07XG5cdFx0XHRcdGRlbGV0ZSB0aGlzLl9zYW1lVGFza1Rlcm1pbmFsc1t0YXNrS2V5XTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGFsbG93c1NoYXJlZFRlcm1pbmFsKSB7XG5cdFx0XHQvLyBBbHdheXMgYWxsb3cgdG8gcmV1c2UgdGhlIHRlcm1pbmFsIHByZXZpb3VzbHkgdXNlZCBieSB0aGUgc2FtZSB0YXNrLlxuXHRcdFx0bGV0IHRlcm1pbmFsSWQgPSB0aGlzLl9pZGxlVGFza1Rlcm1pbmFscy5yZW1vdmUodGFza0tleSk7XG5cdFx0XHRpZiAoIXRlcm1pbmFsSWQpIHtcblx0XHRcdFx0Ly8gVGhlcmUgaXMgbm8gaWRsZSB0ZXJtaW5hbCB3aGljaCB3YXMgdXNlZCBieSB0aGUgc2FtZSB0YXNrLlxuXHRcdFx0XHQvLyBTZWFyY2ggZm9yIGFueSBpZGxlIHRlcm1pbmFsIHVzZWQgcHJldmlvdXNseSBieSBhIHRhc2sgb2YgdGhlIHNhbWUgZ3JvdXBcblx0XHRcdFx0Ly8gKG9yLCBpZiB0aGUgdGFzayBoYXMgbm8gZ3JvdXAsIGEgdGVybWluYWwgdXNlZCBieSBhIHRhc2sgd2l0aG91dCBncm91cCkuXG5cdFx0XHRcdGZvciAoY29uc3QgdGFza0lkIG9mIHRoaXMuX2lkbGVUYXNrVGVybWluYWxzLmtleXMoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGlkbGVUZXJtaW5hbElkID0gdGhpcy5faWRsZVRhc2tUZXJtaW5hbHMuZ2V0KHRhc2tJZCkhO1xuXHRcdFx0XHRcdGlmIChpZGxlVGVybWluYWxJZCAmJiB0aGlzLl90ZXJtaW5hbHNbaWRsZVRlcm1pbmFsSWRdICYmIHRoaXMuX3Rlcm1pbmFsc1tpZGxlVGVybWluYWxJZF0uZ3JvdXAgPT09IGdyb3VwKSB7XG5cdFx0XHRcdFx0XHR0ZXJtaW5hbElkID0gdGhpcy5faWRsZVRhc2tUZXJtaW5hbHMucmVtb3ZlKHRhc2tJZCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0ZXJtaW5hbElkKSB7XG5cdFx0XHRcdHRlcm1pbmFsVG9SZXVzZSA9IHRoaXMuX3Rlcm1pbmFsc1t0ZXJtaW5hbElkXTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRlcm1pbmFsVG9SZXVzZSkge1xuXHRcdFx0aWYgKCFsYXVuY2hDb25maWdzKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignVGFzayBzaGVsbCBsYXVuY2ggY29uZmlndXJhdGlvbiBzaG91bGQgbm90IGJlIHVuZGVmaW5lZCBoZXJlLicpO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXJtaW5hbFRvUmV1c2UudGVybWluYWwuc2Nyb2xsVG9Cb3R0b20oKTtcblx0XHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCkge1xuXHRcdFx0XHRsYXVuY2hDb25maWdzLnJlY29ubmVjdGlvblByb3BlcnRpZXMgPSB7IG93bmVySWQ6IFRhc2tUZXJtaW5hbFR5cGUsIGRhdGE6IHsgbGFzdFRhc2s6IHRhc2suZ2V0Q29tbW9uVGFza0lkKCksIGdyb3VwLCBsYWJlbDogdGFzay5fbGFiZWwsIGlkOiB0YXNrLl9pZCB9IH07XG5cdFx0XHR9XG5cdFx0XHQvLyBIQUNLOiBSZXdyaXRlIHRoZSBub25jZSBpbiBpbml0aWFsVGV4dCBvbmx5IGZvciByZXVzZWQgdGVybWluYWxzLCB0aGlzIGVuc3VyZXMgdGhlXG5cdFx0XHQvLyBjb21tYW5kIGxpbmUgc2VxdWVuY2UgcmVwb3J0cyB0aGUgY29ycmVjdCBub25jZSBhbmQgYmVjb21lcyB0cnVzdGVkIGFzIGEgcmVzdWx0LlxuXHRcdFx0aWYgKHRlcm1pbmFsVG9SZXVzZS5zaGVsbEludGVncmF0aW9uTm9uY2UpIHtcblx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGxhdW5jaENvbmZpZ3MuaW5pdGlhbFRleHQpICYmIGxhdW5jaENvbmZpZ3Muc2hlbGxJbnRlZ3JhdGlvbk5vbmNlKSB7XG5cdFx0XHRcdFx0bGF1bmNoQ29uZmlncy5pbml0aWFsVGV4dCA9IGxhdW5jaENvbmZpZ3MuaW5pdGlhbFRleHQucmVwbGFjZShsYXVuY2hDb25maWdzLnNoZWxsSW50ZWdyYXRpb25Ob25jZSwgdGVybWluYWxUb1JldXNlLnNoZWxsSW50ZWdyYXRpb25Ob25jZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IHRlcm1pbmFsVG9SZXVzZS50ZXJtaW5hbC5yZXVzZVRlcm1pbmFsKGxhdW5jaENvbmZpZ3MpO1xuXG5cdFx0XHRpZiAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbiAmJiB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uLmNsZWFyKSB7XG5cdFx0XHRcdHRlcm1pbmFsVG9SZXVzZS50ZXJtaW5hbC5jbGVhckJ1ZmZlcigpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fdGVybWluYWxzW3Rlcm1pbmFsVG9SZXVzZS50ZXJtaW5hbC5pbnN0YW5jZUlkLnRvU3RyaW5nKCldLmxhc3RUYXNrID0gdGFza0tleTtcblx0XHRcdHJldHVybiBbdGVybWluYWxUb1JldXNlLnRlcm1pbmFsLCB1bmRlZmluZWRdO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Rlcm1pbmFsQ3JlYXRpb25RdWV1ZSA9IHRoaXMuX3Rlcm1pbmFsQ3JlYXRpb25RdWV1ZS50aGVuKCgpID0+IHRoaXMuX2RvQ3JlYXRlVGVybWluYWwodGFzaywgZ3JvdXAsIGxhdW5jaENvbmZpZ3MpKTtcblx0XHRjb25zdCB0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UgPSAoYXdhaXQgdGhpcy5fdGVybWluYWxDcmVhdGlvblF1ZXVlKSE7XG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kKSB7XG5cdFx0XHR0ZXJtaW5hbC5zaGVsbExhdW5jaENvbmZpZy5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzID0geyBvd25lcklkOiBUYXNrVGVybWluYWxUeXBlLCBkYXRhOiB7IGxhc3RUYXNrOiB0YXNrLmdldENvbW1vblRhc2tJZCgpLCBncm91cCwgbGFiZWw6IHRhc2suX2xhYmVsLCBpZDogdGFzay5faWQgfSB9O1xuXHRcdH1cblx0XHRjb25zdCB0ZXJtaW5hbEtleSA9IHRlcm1pbmFsLmluc3RhbmNlSWQudG9TdHJpbmcoKTtcblx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSB7IHRlcm1pbmFsOiB0ZXJtaW5hbCwgbGFzdFRhc2s6IHRhc2tLZXksIGdyb3VwLCBzaGVsbEludGVncmF0aW9uTm9uY2U6IHRlcm1pbmFsLnNoZWxsTGF1bmNoQ29uZmlnLnNoZWxsSW50ZWdyYXRpb25Ob25jZSB9O1xuXHRcdGNvbnN0IG9uRGlzcG9zZWRMaXN0ZW5lciA9IHRlcm1pbmFsLm9uRGlzcG9zZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGVsZXRlVGFza0FuZFRlcm1pbmFsKHRlcm1pbmFsLCB0ZXJtaW5hbERhdGEpO1xuXHRcdFx0b25EaXNwb3NlZExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0XHR0aGlzLl90ZXJtaW5hbHNbdGVybWluYWxLZXldID0gdGVybWluYWxEYXRhO1xuXHRcdHRlcm1pbmFsLnNoZWxsTGF1bmNoQ29uZmlnLnRhYkFjdGlvbnMgPSB0aGlzLl90ZXJtaW5hbFRhYkFjdGlvbnM7XG5cdFx0cmV0dXJuIFt0ZXJtaW5hbCwgdW5kZWZpbmVkXTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkU2hlbGxDb21tYW5kTGluZShwbGF0Zm9ybTogUGxhdGZvcm0uUGxhdGZvcm0sIHNoZWxsRXhlY3V0YWJsZTogc3RyaW5nLCBzaGVsbE9wdGlvbnM6IElTaGVsbENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQsIGNvbW1hbmQ6IENvbW1hbmRTdHJpbmcsIG9yaWdpbmFsQ29tbWFuZDogQ29tbWFuZFN0cmluZyB8IHVuZGVmaW5lZCwgYXJnczogQ29tbWFuZFN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRjb25zdCBiYXNlbmFtZSA9IHBhdGgucGFyc2Uoc2hlbGxFeGVjdXRhYmxlKS5uYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3Qgc2hlbGxRdW90ZU9wdGlvbnMgPSB0aGlzLl9nZXRRdW90aW5nT3B0aW9ucyhiYXNlbmFtZSwgc2hlbGxPcHRpb25zLCBwbGF0Zm9ybSk7XG5cblx0XHRmdW5jdGlvbiBuZWVkc1F1b3Rlcyh2YWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0XHRpZiAodmFsdWUubGVuZ3RoID49IDIpIHtcblx0XHRcdFx0Y29uc3QgZmlyc3QgPSB2YWx1ZVswXSA9PT0gc2hlbGxRdW90ZU9wdGlvbnMuc3Ryb25nID8gc2hlbGxRdW90ZU9wdGlvbnMuc3Ryb25nIDogdmFsdWVbMF0gPT09IHNoZWxsUXVvdGVPcHRpb25zLndlYWsgPyBzaGVsbFF1b3RlT3B0aW9ucy53ZWFrIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoZmlyc3QgPT09IHZhbHVlW3ZhbHVlLmxlbmd0aCAtIDFdKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRsZXQgcXVvdGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmFsdWUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Ly8gV2UgZm91bmQgdGhlIGVuZCBxdW90ZS5cblx0XHRcdFx0Y29uc3QgY2ggPSB2YWx1ZVtpXTtcblx0XHRcdFx0aWYgKGNoID09PSBxdW90ZSkge1xuXHRcdFx0XHRcdHF1b3RlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHF1b3RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBza2lwIHRoZSBjaGFyYWN0ZXIuIFdlIGFyZSBxdW90ZWQuXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY2ggPT09IHNoZWxsUXVvdGVPcHRpb25zLmVzY2FwZSkge1xuXHRcdFx0XHRcdC8vIFNraXAgdGhlIG5leHQgY2hhcmFjdGVyXG5cdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNoID09PSBzaGVsbFF1b3RlT3B0aW9ucy5zdHJvbmcgfHwgY2ggPT09IHNoZWxsUXVvdGVPcHRpb25zLndlYWspIHtcblx0XHRcdFx0XHRxdW90ZSA9IGNoO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNoID09PSAnICcpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHF1b3RlKHZhbHVlOiBzdHJpbmcsIGtpbmQ6IFNoZWxsUXVvdGluZyk6IFtzdHJpbmcsIGJvb2xlYW5dIHtcblx0XHRcdGlmIChraW5kID09PSBTaGVsbFF1b3RpbmcuU3Ryb25nICYmIHNoZWxsUXVvdGVPcHRpb25zLnN0cm9uZykge1xuXHRcdFx0XHRyZXR1cm4gW3NoZWxsUXVvdGVPcHRpb25zLnN0cm9uZyArIHZhbHVlICsgc2hlbGxRdW90ZU9wdGlvbnMuc3Ryb25nLCB0cnVlXTtcblx0XHRcdH0gZWxzZSBpZiAoa2luZCA9PT0gU2hlbGxRdW90aW5nLldlYWsgJiYgc2hlbGxRdW90ZU9wdGlvbnMud2Vhaykge1xuXHRcdFx0XHRyZXR1cm4gW3NoZWxsUXVvdGVPcHRpb25zLndlYWsgKyB2YWx1ZSArIHNoZWxsUXVvdGVPcHRpb25zLndlYWssIHRydWVdO1xuXHRcdFx0fSBlbHNlIGlmIChraW5kID09PSBTaGVsbFF1b3RpbmcuRXNjYXBlICYmIHNoZWxsUXVvdGVPcHRpb25zLmVzY2FwZSkge1xuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoc2hlbGxRdW90ZU9wdGlvbnMuZXNjYXBlKSkge1xuXHRcdFx0XHRcdHJldHVybiBbdmFsdWUucmVwbGFjZSgvIC9nLCBzaGVsbFF1b3RlT3B0aW9ucy5lc2NhcGUgKyAnICcpLCB0cnVlXTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBidWZmZXI6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBjaCBvZiBzaGVsbFF1b3RlT3B0aW9ucy5lc2NhcGUuY2hhcnNUb0VzY2FwZSkge1xuXHRcdFx0XHRcdFx0YnVmZmVyLnB1c2goYFxcXFwke2NofWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByZWdleHA6IFJlZ0V4cCA9IG5ldyBSZWdFeHAoJ1snICsgYnVmZmVyLmpvaW4oJywnKSArICddJywgJ2cnKTtcblx0XHRcdFx0XHRjb25zdCBlc2NhcGVDaGFyID0gc2hlbGxRdW90ZU9wdGlvbnMuZXNjYXBlLmVzY2FwZUNoYXI7XG5cdFx0XHRcdFx0cmV0dXJuIFt2YWx1ZS5yZXBsYWNlKHJlZ2V4cCwgKG1hdGNoKSA9PiBlc2NhcGVDaGFyICsgbWF0Y2gpLCB0cnVlXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFt2YWx1ZSwgZmFsc2VdO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHF1b3RlSWZOZWNlc3NhcnkodmFsdWU6IENvbW1hbmRTdHJpbmcpOiBbc3RyaW5nLCBib29sZWFuXSB7XG5cdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodmFsdWUpKSB7XG5cdFx0XHRcdGlmIChuZWVkc1F1b3Rlcyh2YWx1ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcXVvdGUodmFsdWUsIFNoZWxsUXVvdGluZy5TdHJvbmcpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBbdmFsdWUsIGZhbHNlXTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHF1b3RlKHZhbHVlLnZhbHVlLCB2YWx1ZS5xdW90aW5nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB3ZSBoYXZlIG5vIGFyZ3MgYW5kIHRoZSBjb21tYW5kIGlzIGEgc3RyaW5nIHRoZW4gdXNlIHRoZSBjb21tYW5kIHRvIHN0YXkgYmFja3dhcmRzIGNvbXBhdGlibGUgd2l0aCB0aGUgb2xkIGNvbW1hbmQgbGluZVxuXHRcdC8vIG1vZGVsLiBUbyBhbGxvdyB2YXJpYWJsZSByZXNvbHZpbmcgd2l0aCBzcGFjZXMgd2UgZG8gY29udGludWUgaWYgdGhlIHJlc29sdmVkIHZhbHVlIGlzIGRpZmZlcmVudCB0aGFuIHRoZSBvcmlnaW5hbCBvbmVcblx0XHQvLyBhbmQgdGhlIHJlc29sdmVkIG9uZSBuZWVkcyBxdW90aW5nLlxuXHRcdGlmICgoIWFyZ3MgfHwgYXJncy5sZW5ndGggPT09IDApICYmIFR5cGVzLmlzU3RyaW5nKGNvbW1hbmQpICYmIChjb21tYW5kID09PSBvcmlnaW5hbENvbW1hbmQgYXMgc3RyaW5nIHx8IG5lZWRzUXVvdGVzKG9yaWdpbmFsQ29tbWFuZCBhcyBzdHJpbmcpKSkge1xuXHRcdFx0cmV0dXJuIGNvbW1hbmQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCBjb21tYW5kUXVvdGVkID0gZmFsc2U7XG5cdFx0bGV0IGFyZ1F1b3RlZCA9IGZhbHNlO1xuXHRcdGxldCB2YWx1ZTogc3RyaW5nO1xuXHRcdGxldCBxdW90ZWQ6IGJvb2xlYW47XG5cdFx0W3ZhbHVlLCBxdW90ZWRdID0gcXVvdGVJZk5lY2Vzc2FyeShjb21tYW5kKTtcblx0XHRyZXN1bHQucHVzaCh2YWx1ZSk7XG5cdFx0Y29tbWFuZFF1b3RlZCA9IHF1b3RlZDtcblx0XHRmb3IgKGNvbnN0IGFyZyBvZiBhcmdzKSB7XG5cdFx0XHRbdmFsdWUsIHF1b3RlZF0gPSBxdW90ZUlmTmVjZXNzYXJ5KGFyZyk7XG5cdFx0XHRyZXN1bHQucHVzaCh2YWx1ZSk7XG5cdFx0XHRhcmdRdW90ZWQgPSBhcmdRdW90ZWQgfHwgcXVvdGVkO1xuXHRcdH1cblxuXHRcdGxldCBjb21tYW5kTGluZSA9IHJlc3VsdC5qb2luKCcgJyk7XG5cdFx0Ly8gVGhlcmUgYXJlIHNwZWNpYWwgcnVsZXMgcXVvdGVkIGNvbW1hbmQgbGluZSBpbiBjbWQuZXhlXG5cdFx0aWYgKHBsYXRmb3JtID09PSBQbGF0Zm9ybS5QbGF0Zm9ybS5XaW5kb3dzKSB7XG5cdFx0XHRpZiAoYmFzZW5hbWUgPT09ICdjbWQnICYmIGNvbW1hbmRRdW90ZWQgJiYgYXJnUXVvdGVkKSB7XG5cdFx0XHRcdGNvbW1hbmRMaW5lID0gJ1wiJyArIGNvbW1hbmRMaW5lICsgJ1wiJztcblx0XHRcdH0gZWxzZSBpZiAoKGJhc2VuYW1lID09PSAncG93ZXJzaGVsbCcgfHwgYmFzZW5hbWUgPT09ICdwd3NoJykgJiYgY29tbWFuZFF1b3RlZCkge1xuXHRcdFx0XHRjb21tYW5kTGluZSA9ICcmICcgKyBjb21tYW5kTGluZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gY29tbWFuZExpbmU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRRdW90aW5nT3B0aW9ucyhzaGVsbEJhc2VuYW1lOiBzdHJpbmcsIHNoZWxsT3B0aW9uczogSVNoZWxsQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCwgcGxhdGZvcm06IFBsYXRmb3JtLlBsYXRmb3JtKTogSVNoZWxsUXVvdGluZ09wdGlvbnMge1xuXHRcdGlmIChzaGVsbE9wdGlvbnMgJiYgc2hlbGxPcHRpb25zLnF1b3RpbmcpIHtcblx0XHRcdHJldHVybiBzaGVsbE9wdGlvbnMucXVvdGluZztcblx0XHR9XG5cdFx0cmV0dXJuIFRlcm1pbmFsVGFza1N5c3RlbS5fc2hlbGxRdW90ZXNbc2hlbGxCYXNlbmFtZV0gfHwgVGVybWluYWxUYXNrU3lzdGVtLl9vc1NoZWxsUXVvdGVzW1BsYXRmb3JtLlBsYXRmb3JtVG9TdHJpbmcocGxhdGZvcm0pXTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbGxlY3RUYXNrVmFyaWFibGVzKHZhcmlhYmxlczogU2V0PHN0cmluZz4sIHRhc2s6IEN1c3RvbVRhc2sgfCBDb250cmlidXRlZFRhc2spOiB2b2lkIHtcblx0XHRpZiAodGFzay5jb21tYW5kICYmIHRhc2suY29tbWFuZC5uYW1lKSB7XG5cdFx0XHR0aGlzLl9jb2xsZWN0Q29tbWFuZFZhcmlhYmxlcyh2YXJpYWJsZXMsIHRhc2suY29tbWFuZCwgdGFzayk7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbGxlY3RNYXRjaGVyVmFyaWFibGVzKHZhcmlhYmxlcywgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlcnMpO1xuXG5cdFx0aWYgKHRhc2suY29tbWFuZC5ydW50aW1lID09PSBSdW50aW1lVHlwZS5DdXN0b21FeGVjdXRpb24gJiYgKEN1c3RvbVRhc2suaXModGFzaykgfHwgQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSkge1xuXHRcdFx0bGV0IGRlZmluaXRpb246IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0ZGVmaW5pdGlvbiA9IHRhc2suX3NvdXJjZS5jb25maWcuZWxlbWVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRlZmluaXRpb24gPSBPYmplY3RzLmRlZXBDbG9uZSh0YXNrLmRlZmluZXMpIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0XHRkZWxldGUgZGVmaW5pdGlvbi5fa2V5O1xuXHRcdFx0XHRkZWxldGUgZGVmaW5pdGlvbi50eXBlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fY29sbGVjdERlZmluaXRpb25WYXJpYWJsZXModmFyaWFibGVzLCBkZWZpbml0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsZWN0RGVmaW5pdGlvblZhcmlhYmxlcyh2YXJpYWJsZXM6IFNldDxzdHJpbmc+LCBkZWZpbml0aW9uOiB1bmtub3duKTogdm9pZCB7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGRlZmluaXRpb24pKSB7XG5cdFx0XHR0aGlzLl9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlcywgZGVmaW5pdGlvbik7XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KGRlZmluaXRpb24pKSB7XG5cdFx0XHRkZWZpbml0aW9uLmZvckVhY2goKGVsZW1lbnQ6IHVua25vd24pID0+IHRoaXMuX2NvbGxlY3REZWZpbml0aW9uVmFyaWFibGVzKHZhcmlhYmxlcywgZWxlbWVudCkpO1xuXHRcdH0gZWxzZSBpZiAoVHlwZXMuaXNPYmplY3QoZGVmaW5pdGlvbikpIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIE9iamVjdC5rZXlzKGRlZmluaXRpb24pKSB7XG5cdFx0XHRcdHRoaXMuX2NvbGxlY3REZWZpbml0aW9uVmFyaWFibGVzKHZhcmlhYmxlcywgKGRlZmluaXRpb24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbGxlY3RDb21tYW5kVmFyaWFibGVzKHZhcmlhYmxlczogU2V0PHN0cmluZz4sIGNvbW1hbmQ6IElDb21tYW5kQ29uZmlndXJhdGlvbiwgdGFzazogQ3VzdG9tVGFzayB8IENvbnRyaWJ1dGVkVGFzayk6IHZvaWQge1xuXHRcdC8vIFRoZSBjdXN0b20gZXhlY3V0aW9uIHNob3VsZCBoYXZlIGV2ZXJ5dGhpbmcgaXQgbmVlZHMgYWxyZWFkeSBhcyBpdCBwcm92aWRlZFxuXHRcdC8vIHRoZSBjYWxsYmFjay5cblx0XHRpZiAoY29tbWFuZC5ydW50aW1lID09PSBSdW50aW1lVHlwZS5DdXN0b21FeGVjdXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoY29tbWFuZC5uYW1lID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29tbWFuZCBuYW1lIHNob3VsZCBuZXZlciBiZSB1bmRlZmluZWQgaGVyZS4nKTtcblx0XHR9XG5cdFx0dGhpcy5fY29sbGVjdFZhcmlhYmxlcyh2YXJpYWJsZXMsIGNvbW1hbmQubmFtZSk7XG5cdFx0Y29tbWFuZC5hcmdzPy5mb3JFYWNoKGFyZyA9PiB0aGlzLl9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlcywgYXJnKSk7XG5cdFx0Ly8gVHJ5IHRvIGdldCBhIHNjb3BlLlxuXHRcdGNvbnN0IHNjb3BlID0gKDxJRXh0ZW5zaW9uVGFza1NvdXJjZT50YXNrLl9zb3VyY2UpLnNjb3BlO1xuXHRcdGlmIChzY29wZSAhPT0gVGFza1Njb3BlLkdsb2JhbCkge1xuXHRcdFx0dmFyaWFibGVzLmFkZCgnJHt3b3Jrc3BhY2VGb2xkZXJ9Jyk7XG5cdFx0fVxuXHRcdGlmIChjb21tYW5kLm9wdGlvbnMpIHtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSBjb21tYW5kLm9wdGlvbnM7XG5cdFx0XHRpZiAob3B0aW9ucy5jd2QpIHtcblx0XHRcdFx0dGhpcy5fY29sbGVjdFZhcmlhYmxlcyh2YXJpYWJsZXMsIG9wdGlvbnMuY3dkKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9wdGlvbnNFbnYgPSBvcHRpb25zLmVudjtcblx0XHRcdGlmIChvcHRpb25zRW52KSB7XG5cdFx0XHRcdE9iamVjdC5rZXlzKG9wdGlvbnNFbnYpLmZvckVhY2goKGtleSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gb3B0aW9uc0VudltrZXldO1xuXHRcdFx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbGxlY3RWYXJpYWJsZXModmFyaWFibGVzLCB2YWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGlmIChvcHRpb25zLnNoZWxsKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zLnNoZWxsLmV4ZWN1dGFibGUpIHtcblx0XHRcdFx0XHR0aGlzLl9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlcywgb3B0aW9ucy5zaGVsbC5leGVjdXRhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvcHRpb25zLnNoZWxsLmFyZ3M/LmZvckVhY2goYXJnID0+IHRoaXMuX2NvbGxlY3RWYXJpYWJsZXModmFyaWFibGVzLCBhcmcpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsZWN0TWF0Y2hlclZhcmlhYmxlcyh2YXJpYWJsZXM6IFNldDxzdHJpbmc+LCB2YWx1ZXM6IEFycmF5PHN0cmluZyB8IFByb2JsZW1NYXRjaGVyPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh2YWx1ZXMgPT09IHVuZGVmaW5lZCB8fCB2YWx1ZXMgPT09IG51bGwgfHwgdmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR2YWx1ZXMuZm9yRWFjaCgodmFsdWUpID0+IHtcblx0XHRcdGxldCBtYXRjaGVyOiBQcm9ibGVtTWF0Y2hlcjtcblx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdFx0aWYgKHZhbHVlWzBdID09PSAnJCcpIHtcblx0XHRcdFx0XHRtYXRjaGVyID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQodmFsdWUuc3Vic3RyaW5nKDEpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtYXRjaGVyID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQodmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXRjaGVyID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobWF0Y2hlciAmJiBtYXRjaGVyLmZpbGVQcmVmaXgpIHtcblx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKG1hdGNoZXIuZmlsZVByZWZpeCkpIHtcblx0XHRcdFx0XHR0aGlzLl9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlcywgbWF0Y2hlci5maWxlUHJlZml4KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGZwIG9mIFsuLi5hc0FycmF5KG1hdGNoZXIuZmlsZVByZWZpeC5pbmNsdWRlIHx8IFtdKSwgLi4uYXNBcnJheShtYXRjaGVyLmZpbGVQcmVmaXguZXhjbHVkZSB8fCBbXSldKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9jb2xsZWN0VmFyaWFibGVzKHZhcmlhYmxlcywgZnApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29sbGVjdFZhcmlhYmxlcyh2YXJpYWJsZXM6IFNldDxzdHJpbmc+LCB2YWx1ZTogc3RyaW5nIHwgQ29tbWFuZFN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHN0cmluZzogc3RyaW5nID0gVHlwZXMuaXNTdHJpbmcodmFsdWUpID8gdmFsdWUgOiB2YWx1ZS52YWx1ZTtcblx0XHRjb25zdCByID0gL1xcJFxceyguKj8pXFx9L2c7XG5cdFx0bGV0IG1hdGNoZXM6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGw7XG5cdFx0ZG8ge1xuXHRcdFx0bWF0Y2hlcyA9IHIuZXhlYyhzdHJpbmcpO1xuXHRcdFx0aWYgKG1hdGNoZXMpIHtcblx0XHRcdFx0dmFyaWFibGVzLmFkZChtYXRjaGVzWzBdKTtcblx0XHRcdH1cblx0XHR9IHdoaWxlIChtYXRjaGVzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDb21tYW5kQW5kQXJncyhyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgY29tbWFuZENvbmZpZzogSUNvbW1hbmRDb25maWd1cmF0aW9uKTogUHJvbWlzZTx7IGNvbW1hbmQ6IENvbW1hbmRTdHJpbmc7IGFyZ3M6IENvbW1hbmRTdHJpbmdbXSB9PiB7XG5cdFx0Ly8gRmlyc3Qgd2UgbmVlZCB0byB1c2UgdGhlIGNvbW1hbmQgYXJnczpcblx0XHRsZXQgYXJnczogQ29tbWFuZFN0cmluZ1tdID0gY29tbWFuZENvbmZpZy5hcmdzID8gY29tbWFuZENvbmZpZy5hcmdzLnNsaWNlKCkgOiBbXTtcblx0XHRhcmdzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlcyhyZXNvbHZlciwgYXJncyk7XG5cdFx0Y29uc3QgY29tbWFuZDogQ29tbWFuZFN0cmluZyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgY29tbWFuZENvbmZpZy5uYW1lKTtcblx0XHRyZXR1cm4geyBjb21tYW5kLCBhcmdzIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVmFyaWFibGVzKHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyLCB2YWx1ZTogc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZ1tdPjtcblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVZhcmlhYmxlcyhyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgdmFsdWU6IENvbW1hbmRTdHJpbmdbXSk6IFByb21pc2U8Q29tbWFuZFN0cmluZ1tdPjtcblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVZhcmlhYmxlcyhyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgdmFsdWU6IENvbW1hbmRTdHJpbmdbXSk6IFByb21pc2U8Q29tbWFuZFN0cmluZ1tdPiB7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHZhbHVlLm1hcChzID0+IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgcykpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVNYXRjaGVycyhyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgdmFsdWVzOiBBcnJheTxzdHJpbmcgfCBQcm9ibGVtTWF0Y2hlcj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPFByb2JsZW1NYXRjaGVyW10+IHtcblx0XHRpZiAodmFsdWVzID09PSB1bmRlZmluZWQgfHwgdmFsdWVzID09PSBudWxsIHx8IHZhbHVlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBQcm9ibGVtTWF0Y2hlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdGxldCBtYXRjaGVyOiBQcm9ibGVtTWF0Y2hlcjtcblx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdFx0aWYgKHZhbHVlWzBdID09PSAnJCcpIHtcblx0XHRcdFx0XHRtYXRjaGVyID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQodmFsdWUuc3Vic3RyaW5nKDEpKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtYXRjaGVyID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQodmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtYXRjaGVyID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW1hdGNoZXIpIHtcblx0XHRcdFx0dGhpcy5fYXBwZW5kT3V0cHV0KG5scy5sb2NhbGl6ZSgndW5rbm93blByb2JsZW1NYXRjaGVyJywgJ1Byb2JsZW0gbWF0Y2hlciB7MH0gY2FuXFwndCBiZSByZXNvbHZlZC4gVGhlIG1hdGNoZXIgd2lsbCBiZSBpZ25vcmVkJykpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRhc2tTeXN0ZW1JbmZvOiBJVGFza1N5c3RlbUluZm8gfCB1bmRlZmluZWQgPSByZXNvbHZlci50YXNrU3lzdGVtSW5mbztcblx0XHRcdGNvbnN0IGhhc0ZpbGVQcmVmaXggPSBtYXRjaGVyLmZpbGVQcmVmaXggIT09IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGhhc1VyaVByb3ZpZGVyID0gdGFza1N5c3RlbUluZm8gIT09IHVuZGVmaW5lZCAmJiB0YXNrU3lzdGVtSW5mby51cmlQcm92aWRlciAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFoYXNGaWxlUHJlZml4ICYmICFoYXNVcmlQcm92aWRlcikge1xuXHRcdFx0XHRyZXN1bHQucHVzaChtYXRjaGVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNvcHkgPSBPYmplY3RzLmRlZXBDbG9uZShtYXRjaGVyKTtcblx0XHRcdFx0aWYgKGhhc1VyaVByb3ZpZGVyICYmICh0YXNrU3lzdGVtSW5mbyAhPT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0XHRcdGNvcHkudXJpUHJvdmlkZXIgPSB0YXNrU3lzdGVtSW5mby51cmlQcm92aWRlcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaGFzRmlsZVByZWZpeCkge1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVQcmVmaXggPSBjb3B5LmZpbGVQcmVmaXg7XG5cdFx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKGZpbGVQcmVmaXgpKSB7XG5cdFx0XHRcdFx0XHRjb3B5LmZpbGVQcmVmaXggPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXIsIGZpbGVQcmVmaXgpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZmlsZVByZWZpeCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRpZiAoZmlsZVByZWZpeC5pbmNsdWRlKSB7XG5cdFx0XHRcdFx0XHRcdGZpbGVQcmVmaXguaW5jbHVkZSA9IEFycmF5LmlzQXJyYXkoZmlsZVByZWZpeC5pbmNsdWRlKVxuXHRcdFx0XHRcdFx0XHRcdD8gYXdhaXQgUHJvbWlzZS5hbGwoZmlsZVByZWZpeC5pbmNsdWRlLm1hcCh4ID0+IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgeCkpKVxuXHRcdFx0XHRcdFx0XHRcdDogYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyLCBmaWxlUHJlZml4LmluY2x1ZGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGZpbGVQcmVmaXguZXhjbHVkZSkge1xuXHRcdFx0XHRcdFx0XHRmaWxlUHJlZml4LmV4Y2x1ZGUgPSBBcnJheS5pc0FycmF5KGZpbGVQcmVmaXguZXhjbHVkZSlcblx0XHRcdFx0XHRcdFx0XHQ/IGF3YWl0IFByb21pc2UuYWxsKGZpbGVQcmVmaXguZXhjbHVkZS5tYXAoeCA9PiB0aGlzLl9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXIsIHgpKSlcblx0XHRcdFx0XHRcdFx0XHQ6IGF3YWl0IHRoaXMuX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlciwgZmlsZVByZWZpeC5leGNsdWRlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2goY29weSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXI6IFZhcmlhYmxlUmVzb2x2ZXIsIHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZz47XG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVWYXJpYWJsZShyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgdmFsdWU6IENvbW1hbmRTdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPENvbW1hbmRTdHJpbmc+O1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXI6IFZhcmlhYmxlUmVzb2x2ZXIsIHZhbHVlOiBDb21tYW5kU3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxDb21tYW5kU3RyaW5nPiB7XG5cdFx0Ly8gVE9ET0BEaXJrIFRhc2suZ2V0V29ya3NwYWNlRm9sZGVyIHNob3VsZCByZXR1cm4gYSBXb3Jrc3BhY2VGb2xkZXIgdGhhdCBpcyBkZWZpbmVkIGluIHdvcmtzcGFjZS50c1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyh2YWx1ZSkpIHtcblx0XHRcdHJldHVybiByZXNvbHZlci5yZXNvbHZlKHZhbHVlKTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHZhbHVlOiBhd2FpdCByZXNvbHZlci5yZXNvbHZlKHZhbHVlLnZhbHVlKSxcblx0XHRcdFx0cXVvdGluZzogdmFsdWUucXVvdGluZ1xuXHRcdFx0fTtcblx0XHR9IGVsc2UgeyAvLyBUaGlzIHNob3VsZCBuZXZlciBoYXBwZW5cblx0XHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5ldmVyIHRyeSB0byByZXNvbHZlIHVuZGVmaW5lZC4nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlT3B0aW9ucyhyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgb3B0aW9uczogQ29tbWFuZE9wdGlvbnMgfCB1bmRlZmluZWQpOiBQcm9taXNlPENvbW1hbmRPcHRpb25zPiB7XG5cdFx0aWYgKG9wdGlvbnMgPT09IHVuZGVmaW5lZCB8fCBvcHRpb25zID09PSBudWxsKSB7XG5cdFx0XHRsZXQgY3dkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjd2QgPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXIsICcke3dvcmtzcGFjZUZvbGRlcn0nKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gTm8gd29ya3NwYWNlXG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBjd2QgfTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiBDb21tYW5kT3B0aW9ucyA9IFR5cGVzLmlzU3RyaW5nKG9wdGlvbnMuY3dkKVxuXHRcdFx0PyB7IGN3ZDogYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyLCBvcHRpb25zLmN3ZCkgfVxuXHRcdFx0OiB7IGN3ZDogYXdhaXQgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlKHJlc29sdmVyLCAnJHt3b3Jrc3BhY2VGb2xkZXJ9JykgfTtcblx0XHRpZiAob3B0aW9ucy5lbnYpIHtcblx0XHRcdHJlc3VsdC5lbnYgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMob3B0aW9ucy5lbnYpKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gb3B0aW9ucy5lbnZba2V5XTtcblx0XHRcdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHZhbHVlKSkge1xuXHRcdFx0XHRcdHJlc3VsdC5lbnYhW2tleV0gPSBhd2FpdCB0aGlzLl9yZXNvbHZlVmFyaWFibGUocmVzb2x2ZXIsIHZhbHVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQuZW52IVtrZXldID0gU3RyaW5nKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0c3RhdGljIFdlbGxLbm93bkNvbW1hbmRzOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPiA9IHtcblx0XHQnYW50JzogdHJ1ZSxcblx0XHQnY21ha2UnOiB0cnVlLFxuXHRcdCdlc2xpbnQnOiB0cnVlLFxuXHRcdCdncmFkbGUnOiB0cnVlLFxuXHRcdCdncnVudCc6IHRydWUsXG5cdFx0J2d1bHAnOiB0cnVlLFxuXHRcdCdqYWtlJzogdHJ1ZSxcblx0XHQnamVua2lucyc6IHRydWUsXG5cdFx0J2pzaGludCc6IHRydWUsXG5cdFx0J21ha2UnOiB0cnVlLFxuXHRcdCdtYXZlbic6IHRydWUsXG5cdFx0J21zYnVpbGQnOiB0cnVlLFxuXHRcdCdtc2MnOiB0cnVlLFxuXHRcdCdubWFrZSc6IHRydWUsXG5cdFx0J25wbSc6IHRydWUsXG5cdFx0J3Jha2UnOiB0cnVlLFxuXHRcdCd0c2MnOiB0cnVlLFxuXHRcdCd4YnVpbGQnOiB0cnVlXG5cdH07XG5cblx0cHVibGljIGdldFNhbml0aXplZENvbW1hbmQoY21kOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGxldCByZXN1bHQgPSBjbWQudG9Mb3dlckNhc2UoKTtcblx0XHRjb25zdCBpbmRleCA9IHJlc3VsdC5sYXN0SW5kZXhPZihwYXRoLnNlcCk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0cmVzdWx0ID0gcmVzdWx0LnN1YnN0cmluZyhpbmRleCArIDEpO1xuXHRcdH1cblx0XHRpZiAoVGVybWluYWxUYXNrU3lzdGVtLldlbGxLbm93bkNvbW1hbmRzW3Jlc3VsdF0pIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiAnb3RoZXInO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFRhc2tGb3JUZXJtaW5hbChpbnN0YW5jZUlkOiBudW1iZXIpOiBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBGaXJzdCBjaGVjayBpZiB0aGVyZSdzIGFuIGFjdGl2ZSB0YXNrIGZvciB0aGlzIHRlcm1pbmFsXG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXModGhpcy5fYWN0aXZlVGFza3MpKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVUYXNrID0gdGhpcy5fYWN0aXZlVGFza3Nba2V5XTtcblx0XHRcdGlmIChhY3RpdmVUYXNrLnRlcm1pbmFsPy5pbnN0YW5jZUlkID09PSBpbnN0YW5jZUlkKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVUYXNrLnRhc2s7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIElmIG5vIGFjdGl2ZSB0YXNrLCBjaGVjayB0aGUgdGVybWluYWxzIG1hcCBmb3IgdGhlIGxhc3QgdGFzayB0aGF0IHJhbiBpbiB0aGlzIHRlcm1pbmFsXG5cdFx0Y29uc3QgdGVybWluYWxEYXRhID0gdGhpcy5fdGVybWluYWxzW2luc3RhbmNlSWQudG9TdHJpbmcoKV07XG5cdFx0aWYgKHRlcm1pbmFsRGF0YT8ubGFzdFRhc2spIHtcblx0XHRcdC8vIExvb2sgdXAgdGhlIHRhc2sgdXNpbmcgdGhlIGNhbGxiYWNrIHByb3ZpZGVkIGJ5IHRoZSB0YXNrIHNlcnZpY2Vcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl90YXNrTG9va3VwKHRlcm1pbmFsRGF0YS5sYXN0VGFzayk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9hcHBlbmRPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBvdXRwdXRDaGFubmVsID0gdGhpcy5fb3V0cHV0U2VydmljZS5nZXRDaGFubmVsKHRoaXMuX291dHB1dENoYW5uZWxJZCk7XG5cdFx0b3V0cHV0Q2hhbm5lbD8uYXBwZW5kKG91dHB1dCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0V2FpdE9uRXhpdFZhbHVlKHByZXNlbnRhdGlvbk9wdGlvbnM6IElQcmVzZW50YXRpb25PcHRpb25zLCBjb25maWd1cmF0aW9uUHJvcGVydGllczogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKSB7XG5cdGlmICgocHJlc2VudGF0aW9uT3B0aW9ucy5jbG9zZSA9PT0gdW5kZWZpbmVkKSB8fCAocHJlc2VudGF0aW9uT3B0aW9ucy5jbG9zZSA9PT0gZmFsc2UpKSB7XG5cdFx0aWYgKChwcmVzZW50YXRpb25PcHRpb25zLnJldmVhbCAhPT0gUmV2ZWFsS2luZC5OZXZlcikgfHwgIWNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCB8fCAocHJlc2VudGF0aW9uT3B0aW9ucy5jbG9zZSA9PT0gZmFsc2UpKSB7XG5cdFx0XHRpZiAocHJlc2VudGF0aW9uT3B0aW9ucy5wYW5lbCA9PT0gUGFuZWxLaW5kLk5ldykge1xuXHRcdFx0XHRyZXR1cm4gdGFza1NoZWxsSW50ZWdyYXRpb25XYWl0T25FeGl0U2VxdWVuY2UobmxzLmxvY2FsaXplKCdjbG9zZVRlcm1pbmFsJywgJ1ByZXNzIGFueSBrZXkgdG8gY2xvc2UgdGhlIHRlcm1pbmFsLicpKTtcblx0XHRcdH0gZWxzZSBpZiAocHJlc2VudGF0aW9uT3B0aW9ucy5zaG93UmV1c2VNZXNzYWdlKSB7XG5cdFx0XHRcdHJldHVybiB0YXNrU2hlbGxJbnRlZ3JhdGlvbldhaXRPbkV4aXRTZXF1ZW5jZShubHMubG9jYWxpemUoJ3JldXNlVGVybWluYWwnLCAnVGVybWluYWwgd2lsbCBiZSByZXVzZWQgYnkgdGFza3MsIHByZXNzIGFueSBrZXkgdG8gY2xvc2UgaXQuJykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiAhcHJlc2VudGF0aW9uT3B0aW9ucy5jbG9zZTtcbn1cblxuZnVuY3Rpb24gdGFza1NoZWxsSW50ZWdyYXRpb25XYWl0T25FeGl0U2VxdWVuY2UobWVzc2FnZTogc3RyaW5nKTogKGV4aXRDb2RlOiBudW1iZXIpID0+IHN0cmluZyB7XG5cdHJldHVybiAoZXhpdENvZGUpID0+IHtcblx0XHRyZXR1cm4gYCR7VlNDb2RlU2VxdWVuY2UoVlNDb2RlT3NjUHQuQ29tbWFuZEZpbmlzaGVkLCBleGl0Q29kZS50b1N0cmluZygpKX0ke21lc3NhZ2V9YDtcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0UmVjb25uZWN0aW9uRGF0YSh0ZXJtaW5hbDogSVRlcm1pbmFsSW5zdGFuY2UpOiBJUmVjb25uZWN0aW9uVGFza0RhdGEgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdGVybWluYWwuc2hlbGxMYXVuY2hDb25maWcuYXR0YWNoUGVyc2lzdGVudFByb2Nlc3M/LnJlY29ubmVjdGlvblByb3BlcnRpZXM/LmRhdGEgYXMgSVJlY29ubmVjdGlvblRhc2tEYXRhIHwgdW5kZWZpbmVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxlQUFlO0FBQ3hCLFlBQVksV0FBVztBQUV2QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVksdUJBQW9DO0FBQ3pELFNBQVMsV0FBVyxhQUFhO0FBQ2pDLFlBQVksYUFBYTtBQUN6QixZQUFZLFVBQVU7QUFDdEIsWUFBWSxjQUFjO0FBQzFCLFlBQVksZUFBZTtBQUMzQixPQUFPLGNBQWM7QUFDckIsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksU0FBUztBQUlyQixTQUFzQyxzQkFBc0I7QUFDNUQsU0FBcUQsc0JBQXNCO0FBQzNFLFNBQVMsZUFBZTtBQUN4QixTQUF5Qiw4QkFBaUU7QUFFMUYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFT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
