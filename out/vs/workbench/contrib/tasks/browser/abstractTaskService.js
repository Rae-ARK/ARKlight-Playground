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
import { Action } from "../../../../base/common/actions.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import * as glob from "../../../../base/common/glob.js";
import * as json from "../../../../base/common/json.js";
import { Disposable, dispose, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { LRUCache, Touch } from "../../../../base/common/map.js";
import * as Objects from "../../../../base/common/objects.js";
import { ValidationState, ValidationStatus } from "../../../../base/common/parsers.js";
import * as Platform from "../../../../base/common/platform.js";
import { TerminateResponseCode } from "../../../../base/common/processes.js";
import * as resources from "../../../../base/common/resources.js";
import Severity from "../../../../base/common/severity.js";
import * as Types from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import * as UUID from "../../../../base/common/uuid.js";
import * as nls from "../../../../nls.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IMarkerService } from "../../../../platform/markers/common/markers.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ProblemMatcherRegistry } from "../common/problemMatcher.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { IWorkspaceContextService, WorkbenchState, WorkspaceFolder } from "../../../../platform/workspace/common/workspace.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Markers } from "../../markers/common/markers.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { ITerminalGroupService, ITerminalService } from "../../terminal/browser/terminal.js";
import { ITerminalProfileResolverService } from "../../terminal/common/terminal.js";
import { ConfiguringTask, ContributedTask, CustomTask, ExecutionEngine, InMemoryTask, InstancePolicy, JsonSchemaVersion, KeyedTaskIdentifier, RerunAllRunningTasksCommandId, RuntimeType, TASK_RUNNING_STATE, TaskDefinition, TaskEventKind, TaskGroup, TaskRunSource, TaskSettingId, TaskSorter, TaskSourceKind, TasksSchemaProperties, USER_TASKS_GROUP_KEY } from "../common/tasks.js";
import { ChatAgentLocation, ChatModeKind } from "../../chat/common/constants.js";
import { CustomExecutionSupportedContext, ProcessExecutionSupportedContext, ServerlessWebContext, ShellExecutionSupportedContext, TaskCommandsRegistered, TaskExecutionSupportedContext, TasksAvailableContext } from "../common/taskService.js";
import { TaskError, TaskErrors, TaskExecuteKind, Triggers, VerifiedTask } from "../common/taskSystem.js";
import { getTemplates as getTaskTemplates } from "../common/taskTemplates.js";
import * as TaskConfig from "../common/taskConfiguration.js";
import { TerminalTaskSystem } from "./terminalTaskSystem.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { TaskDefinitionRegistry } from "../common/taskDefinitionRegistry.js";
import { getActiveElement } from "../../../../base/browser/dom.js";
import { raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { toFormattedString } from "../../../../base/common/jsonFormatter.js";
import { Schemas } from "../../../../base/common/network.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { TerminalExitReason } from "../../../../platform/terminal/common/terminal.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { VirtualWorkspaceContext } from "../../../common/contextkeys.js";
import { EditorResourceAccessor, SaveReason } from "../../../common/editor.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { ILifecycleService, ShutdownReason, StartupKind } from "../../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { CHAT_OPEN_ACTION_ID } from "../../chat/browser/actions/chatActions.js";
import { IChatAgentService } from "../../chat/common/participants/chatAgents.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { configureTaskIcon, isWorkspaceFolder, QUICKOPEN_DETAIL_CONFIG, QUICKOPEN_SKIP_CONFIG, TaskQuickPick } from "./taskQuickPick.js";
import { IHostService } from "../../../services/host/browser/host.js";
import * as dom from "../../../../base/browser/dom.js";
import { FocusMode } from "../../../../platform/native/common/native.js";
const QUICKOPEN_HISTORY_LIMIT_CONFIG = "task.quickOpen.history";
const PROBLEM_MATCHER_NEVER_CONFIG = "task.problemMatchers.neverPrompt";
const USE_SLOW_PICKER = "task.quickOpen.showAll";
const TaskTerminalType = "Task";
var ConfigureTaskAction;
((ConfigureTaskAction2) => {
  ConfigureTaskAction2.ID = "workbench.action.tasks.configureTaskRunner";
  ConfigureTaskAction2.TEXT = nls.localize2("ConfigureTaskRunnerAction.label", "Configure Task");
})(ConfigureTaskAction || (ConfigureTaskAction = {}));
class ProblemReporter {
  constructor(_outputChannel) {
    this._outputChannel = _outputChannel;
    this._onDidError = new Emitter();
    this.onDidError = this._onDidError.event;
    this._validationStatus = new ValidationStatus();
  }
  info(message) {
    this._validationStatus.state = ValidationState.Info;
    this._outputChannel.append(message + "\n");
  }
  warn(message) {
    this._validationStatus.state = ValidationState.Warning;
    this._outputChannel.append(message + "\n");
  }
  error(message) {
    this._validationStatus.state = ValidationState.Error;
    this._outputChannel.append(message + "\n");
    this._onDidError.fire(message);
  }
  fatal(message) {
    this._validationStatus.state = ValidationState.Fatal;
    this._outputChannel.append(message + "\n");
    this._onDidError.fire(message);
  }
  get status() {
    return this._validationStatus;
  }
}
class TaskMap {
  constructor() {
    this._store = /* @__PURE__ */ new Map();
  }
  forEach(callback) {
    this._store.forEach(callback);
  }
  static getKey(workspaceFolder) {
    let key;
    if (Types.isString(workspaceFolder)) {
      key = workspaceFolder;
    } else {
      const uri = isWorkspaceFolder(workspaceFolder) ? workspaceFolder.uri : workspaceFolder.configuration;
      key = uri ? uri.toString() : "";
    }
    return key;
  }
  get(workspaceFolder) {
    const key = TaskMap.getKey(workspaceFolder);
    let result = this._store.get(key);
    if (!result) {
      result = [];
      this._store.set(key, result);
    }
    return result;
  }
  add(workspaceFolder, ...task) {
    const key = TaskMap.getKey(workspaceFolder);
    let values = this._store.get(key);
    if (!values) {
      values = [];
      this._store.set(key, values);
    }
    values.push(...task);
  }
  all() {
    const result = [];
    this._store.forEach((values) => result.push(...values));
    return result;
  }
}
let AbstractTaskService = class extends Disposable {
  constructor(_configurationService, _markerService, _outputService, _paneCompositeService, _viewsService, _commandService, _editorService, _fileService, _contextService, _telemetryService, _textFileService, _modelService, _extensionService, _quickInputService, _configurationResolverService, _terminalService, _terminalGroupService, _storageService, _progressService, _openerService, _dialogService, _notificationService, _contextKeyService, _environmentService, _terminalProfileResolverService, _pathService, _textModelResolverService, _preferencesService, _viewDescriptorService, _workspaceTrustRequestService, _workspaceTrustManagementService, _logService, _themeService, _lifecycleService, remoteAgentService, _instantiationService, _chatService, _chatAgentService, _hostService) {
    super();
    this._configurationService = _configurationService;
    this._markerService = _markerService;
    this._outputService = _outputService;
    this._paneCompositeService = _paneCompositeService;
    this._viewsService = _viewsService;
    this._commandService = _commandService;
    this._editorService = _editorService;
    this._fileService = _fileService;
    this._contextService = _contextService;
    this._telemetryService = _telemetryService;
    this._textFileService = _textFileService;
    this._modelService = _modelService;
    this._extensionService = _extensionService;
    this._quickInputService = _quickInputService;
    this._configurationResolverService = _configurationResolverService;
    this._terminalService = _terminalService;
    this._terminalGroupService = _terminalGroupService;
    this._storageService = _storageService;
    this._progressService = _progressService;
    this._openerService = _openerService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._contextKeyService = _contextKeyService;
    this._environmentService = _environmentService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._pathService = _pathService;
    this._textModelResolverService = _textModelResolverService;
    this._preferencesService = _preferencesService;
    this._viewDescriptorService = _viewDescriptorService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._workspaceTrustManagementService = _workspaceTrustManagementService;
    this._logService = _logService;
    this._themeService = _themeService;
    this._lifecycleService = _lifecycleService;
    this._instantiationService = _instantiationService;
    this._chatService = _chatService;
    this._chatAgentService = _chatAgentService;
    this._hostService = _hostService;
    this._tasksReconnected = false;
    this._taskSystemListeners = [];
    this._onDidRegisterSupportedExecutions = this._register(new Emitter());
    this._onDidRegisterAllSupportedExecutions = this._register(new Emitter());
    this._onDidChangeTaskSystemInfo = this._register(new Emitter());
    this._willRestart = false;
    this.onDidChangeTaskSystemInfo = this._onDidChangeTaskSystemInfo.event;
    this._onDidReconnectToTasks = this._register(new Emitter());
    this.onDidReconnectToTasks = this._onDidReconnectToTasks.event;
    this._onDidChangeTaskConfig = this._register(new Emitter());
    this.onDidChangeTaskConfig = this._onDidChangeTaskConfig.event;
    this._onDidChangeTaskProviders = this._register(new Emitter());
    this.onDidChangeTaskProviders = this._onDidChangeTaskProviders.event;
    this._taskRunStartTimes = /* @__PURE__ */ new Map();
    this._taskRunSources = /* @__PURE__ */ new Map();
    this._activatedTaskProviders = /* @__PURE__ */ new Set();
    this.toast = this._register(new MutableDisposable());
    this._whenTaskSystemReady = Event.toPromise(this.onDidChangeTaskSystemInfo);
    this._workspaceTasksPromise = void 0;
    this._taskSystem = void 0;
    this._taskSystemListeners = void 0;
    this._outputChannel = this._outputService.getChannel(AbstractTaskService.OutputChannelId);
    this._providers = /* @__PURE__ */ new Map();
    this._providerTypes = /* @__PURE__ */ new Map();
    this._taskSystemInfos = /* @__PURE__ */ new Map();
    this._register(this._contextService.onDidChangeWorkspaceFolders(() => {
      const folderSetup = this._computeWorkspaceFolderSetup();
      if (this.executionEngine !== folderSetup[2]) {
        this._disposeTaskSystemListeners();
        this._taskSystem = void 0;
      }
      this._updateSetup(folderSetup);
      return this._updateWorkspaceTasks(TaskRunSource.FolderOpen);
    }));
    this._register(this._configurationService.onDidChangeConfiguration(async (e) => {
      if (!e.affectsConfiguration("tasks") || !this._taskSystem && !this._workspaceTasksPromise) {
        return;
      }
      if (!this._taskSystem || this._taskSystem instanceof TerminalTaskSystem) {
        this._outputChannel.clear();
      }
      if (e.affectsConfiguration(TaskSettingId.Reconnection)) {
        if (!this._configurationService.getValue(TaskSettingId.Reconnection)) {
          this._persistentTasks?.clear();
          this._storageService.remove(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
        }
      }
      this._setTaskLRUCacheLimit();
      const mapStringToFolderTasks = await this._updateWorkspaceTasks(TaskRunSource.ConfigurationChange);
      this._onDidChangeTaskConfig.fire();
      for (const [folderUri, folderResult] of mapStringToFolderTasks) {
        if (!folderResult.set?.tasks?.length) {
          continue;
        }
        for (const task of folderResult.set.tasks) {
          const realUniqueId = task._id;
          const lastTask = this._taskSystem?.lastTask?.task._id;
          if (lastTask && lastTask === realUniqueId && folderUri !== "setting") {
            const verifiedLastTask = new VerifiedTask(task, this._taskSystem.lastTask.resolver, Triggers.command);
            this._taskSystem.lastTask = verifiedLastTask;
          }
        }
      }
    }));
    this._taskRunningState = TASK_RUNNING_STATE.bindTo(_contextKeyService);
    this._tasksAvailableState = TasksAvailableContext.bindTo(_contextKeyService);
    this._onDidStateChange = this._register(new Emitter());
    this._registerCommands().then(() => TaskCommandsRegistered.bindTo(this._contextKeyService).set(true));
    ServerlessWebContext.bindTo(this._contextKeyService).set(Platform.isWeb && !remoteAgentService.getConnection()?.remoteAuthority);
    this._configurationResolverService.contributeVariable("defaultBuildTask", async () => {
      let tasks = await this._getTasksForGroup(TaskGroup.Build, true);
      if (tasks.length > 0) {
        const defaults2 = this._getDefaultTasks(tasks);
        if (defaults2.length === 1) {
          return defaults2[0]._label;
        }
      }
      tasks = await this._getTasksForGroup(TaskGroup.Build);
      const defaults = this._getDefaultTasks(tasks);
      if (defaults.length === 1) {
        return defaults[0]._label;
      } else if (defaults.length) {
        tasks = defaults;
      }
      let entry;
      if (tasks && tasks.length > 0) {
        entry = await this._showQuickPick(tasks, nls.localize("TaskService.pickBuildTaskForLabel", "Select the build task (there is no default build task defined)"));
      }
      const task = entry ? entry.task : void 0;
      if (!task) {
        return void 0;
      }
      return task._label;
    });
    this._register(this._lifecycleService.onBeforeShutdown((e) => {
      this._willRestart = e.reason !== ShutdownReason.RELOAD;
    }));
    this._register(this.onDidStateChange(async (e) => {
      this._log(nls.localize("taskEvent", "Task Event kind: {0}", e.kind), true);
      switch (e.kind) {
        case TaskEventKind.Start:
          this._taskRunStartTimes.set(e.taskId, Date.now());
          break;
        case TaskEventKind.ProcessEnded: {
          const processEndedEvent = e;
          const startTime = this._taskRunStartTimes.get(e.taskId);
          if (!startTime) {
            break;
          }
          const durationMs = processEndedEvent.durationMs ?? Date.now() - startTime;
          if (durationMs !== void 0) {
            this._handleLongRunningTaskCompletion(processEndedEvent, durationMs);
          }
          this._taskRunStartTimes.delete(e.taskId);
          this._taskRunSources.delete(e.taskId);
          break;
        }
        case TaskEventKind.Inactive: {
          const processEndedEvent = e;
          const startTime = this._taskRunStartTimes.get(e.taskId);
          if (!startTime) {
            break;
          }
          const durationMs = processEndedEvent.durationMs ?? Date.now() - startTime;
          if (durationMs !== void 0) {
            this._handleLongRunningTaskCompletion(processEndedEvent, durationMs);
          }
          this._taskRunStartTimes.delete(e.taskId);
          this._taskRunSources.delete(e.taskId);
          break;
        }
        case TaskEventKind.Terminated:
          this._taskRunStartTimes.delete(e.taskId);
          this._taskRunSources.delete(e.taskId);
          break;
      }
      if (e.kind === TaskEventKind.Changed) {
      } else if ((this._willRestart || e.kind === TaskEventKind.Terminated && e.exitReason === TerminalExitReason.User) && e.taskId) {
        const key = e.__task.getKey();
        if (key) {
          this.removePersistentTask(key);
        }
      } else if (e.kind === TaskEventKind.Start && e.__task && e.__task.getWorkspaceFolder()) {
        this._setPersistentTask(e.__task);
      }
    }));
    this._waitForAllSupportedExecutions = new Promise((resolve) => {
      Event.once(this._onDidRegisterAllSupportedExecutions.event)(() => resolve());
    });
    this._terminalService.whenConnected.then(() => {
      const reconnectedInstances = this._terminalService.instances.filter((e) => e.reconnectionProperties?.ownerId === TaskTerminalType);
      if (reconnectedInstances.length) {
        this._attemptTaskReconnection();
      } else {
        this._tasksReconnected = true;
        this._onDidReconnectToTasks.fire();
      }
    });
    this._upgrade();
  }
  get isReconnected() {
    return this._tasksReconnected;
  }
  registerSupportedExecutions(custom, shell, process) {
    if (custom !== void 0) {
      const customContext = CustomExecutionSupportedContext.bindTo(this._contextKeyService);
      customContext.set(custom);
    }
    const isVirtual = !!VirtualWorkspaceContext.getValue(this._contextKeyService);
    if (shell !== void 0) {
      const shellContext = ShellExecutionSupportedContext.bindTo(this._contextKeyService);
      shellContext.set(shell && !isVirtual);
    }
    if (process !== void 0) {
      const processContext = ProcessExecutionSupportedContext.bindTo(this._contextKeyService);
      processContext.set(process && !isVirtual);
    }
    this._workspaceTasksPromise = void 0;
    this._onDidRegisterSupportedExecutions.fire();
    if (ServerlessWebContext.getValue(this._contextKeyService) || custom && shell && process) {
      this._onDidRegisterAllSupportedExecutions.fire();
    }
  }
  _attemptTaskReconnection() {
    if (this._lifecycleService.startupKind !== StartupKind.ReloadedWindow) {
      this._log(nls.localize("TaskService.skippingReconnection", "Startup kind not window reload, setting connected and removing persistent tasks"), true);
      this._tasksReconnected = true;
      this._storageService.remove(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
    }
    if (!this._configurationService.getValue(TaskSettingId.Reconnection) || this._tasksReconnected) {
      this._log(nls.localize("TaskService.notConnecting", "Setting tasks connected configured value {0}, tasks were already reconnected {1}", this._configurationService.getValue(TaskSettingId.Reconnection), this._tasksReconnected), true);
      this._tasksReconnected = true;
      return;
    }
    this._log(nls.localize("TaskService.reconnecting", "Reconnecting to running tasks..."), true);
    this.getWorkspaceTasks(TaskRunSource.Reconnect).then(async () => {
      this._tasksReconnected = await this._reconnectTasks();
      this._log(nls.localize("TaskService.reconnected", "Reconnected to running tasks."), true);
      this._onDidReconnectToTasks.fire();
    });
  }
  async _handleLongRunningTaskCompletion(event, durationMs) {
    const notificationThreshold = this._configurationService.getValue(TaskSettingId.NotifyWindowOnTaskCompletion);
    if (notificationThreshold === -1 || notificationThreshold > 0 && durationMs < notificationThreshold) {
      return;
    }
    const taskRunSource = this._taskRunSources.get(event.taskId);
    if (taskRunSource === TaskRunSource.ChatAgent) {
      return;
    }
    const terminalForTask = this._terminalService.instances.find((i) => i.instanceId === event.terminalId);
    if (!terminalForTask) {
      return;
    }
    const taskLabel = terminalForTask.title;
    const targetWindow = dom.getWindow(terminalForTask.domElement);
    if (targetWindow.document.hasFocus()) {
      return;
    }
    const durationText = this._formatTaskDuration(durationMs);
    const message = taskLabel ? nls.localize("task.longRunningTaskCompletedWithLabel", 'Task "{0}" finished in {1}.', taskLabel, durationText) : nls.localize("task.longRunningTaskCompleted", "Task finished in {0}.", durationText);
    this._hostService.focus(targetWindow, { mode: FocusMode.Notify });
    const cts = new CancellationTokenSource();
    this.toast.value = toDisposable(() => cts.dispose(true));
    const { clicked } = await this._hostService.showToast({ title: message }, cts.token);
    this.toast.clear();
    if (clicked) {
      this._hostService.focus(targetWindow, { mode: FocusMode.Force });
    }
  }
  _formatTaskDuration(durationMs) {
    const totalSeconds = Math.max(1, Math.round(durationMs / 1e3));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return seconds > 0 ? nls.localize("task.longRunningTaskDurationMinutesSeconds", "{0}m {1}s", minutes, seconds) : nls.localize("task.longRunningTaskDurationMinutes", "{0}m", minutes);
    }
    return nls.localize("task.longRunningTaskDurationSeconds", "{0}s", seconds);
  }
  async _reconnectTasks() {
    const tasks = await this.getSavedTasks("persistent");
    if (!tasks.length) {
      this._log(nls.localize("TaskService.noTasks", "No persistent tasks to reconnect."), true);
      return true;
    }
    const taskLabels = tasks.map((task) => task._label).join(", ");
    this._log(nls.localize("TaskService.reconnectingTasks", "Reconnecting to {0} tasks...", taskLabels), true);
    for (const task of tasks) {
      if (ConfiguringTask.is(task)) {
        const resolved = await this.tryResolveTask(task);
        if (resolved) {
          this.run(resolved, void 0, TaskRunSource.Reconnect);
        }
      } else {
        this.run(task, void 0, TaskRunSource.Reconnect);
      }
    }
    return true;
  }
  get onDidStateChange() {
    return this._onDidStateChange.event;
  }
  get supportsMultipleTaskExecutions() {
    return this.inTerminal();
  }
  async _registerCommands() {
    CommandsRegistry.registerCommand({
      id: "workbench.action.tasks.runTask",
      handler: async (accessor, arg) => {
        if (await this._trust()) {
          await this._runTaskCommand(arg);
        }
      },
      metadata: {
        description: "Run Task",
        args: [{
          name: "args",
          isOptional: true,
          description: nls.localize("runTask.arg", "Filters the tasks shown in the quickpick"),
          schema: {
            anyOf: [
              {
                type: "string",
                description: nls.localize("runTask.label", "The task's label or a term to filter by")
              },
              {
                type: "object",
                properties: {
                  type: {
                    type: "string",
                    description: nls.localize("runTask.type", "The contributed task type")
                  },
                  task: {
                    type: "string",
                    description: nls.localize("runTask.task", "The task's label or a term to filter by")
                  }
                }
              }
            ]
          }
        }]
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.reRunTask", async (accessor) => {
      if (await this._trust()) {
        this._reRunTaskCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.restartTask", async (accessor, arg) => {
      if (await this._trust()) {
        this._runRestartTaskCommand(arg);
      }
    });
    CommandsRegistry.registerCommand(RerunAllRunningTasksCommandId, async (accessor) => {
      if (await this._trust()) {
        this._runRerunAllRunningTasksCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.terminate", async (accessor, arg) => {
      if (await this._trust()) {
        this._runTerminateCommand(arg);
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.showLog", () => {
      this._showOutput(void 0, true);
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.build", async () => {
      if (await this._trust()) {
        this._runBuildCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.test", async () => {
      if (await this._trust()) {
        this._runTestCommand();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.configureTaskRunner", async () => {
      if (await this._trust()) {
        this._runConfigureTasks();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.configureDefaultBuildTask", async () => {
      if (await this._trust()) {
        this._runConfigureDefaultBuildTask();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.configureDefaultTestTask", async () => {
      if (await this._trust()) {
        this._runConfigureDefaultTestTask();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.showTasks", async () => {
      if (await this._trust()) {
        return this.runShowTasks();
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.toggleProblems", () => this._commandService.executeCommand(Markers.TOGGLE_MARKERS_VIEW_ACTION_ID));
    CommandsRegistry.registerCommand("workbench.action.tasks.openUserTasks", async () => {
      const resource = this._getResourceForKind(TaskSourceKind.User);
      if (resource) {
        this._openTaskFile(resource, TaskSourceKind.User);
      }
    });
    CommandsRegistry.registerCommand("workbench.action.tasks.openWorkspaceFileTasks", async () => {
      const resource = this._getResourceForKind(TaskSourceKind.WorkspaceFile);
      if (resource) {
        this._openTaskFile(resource, TaskSourceKind.WorkspaceFile);
      }
    });
  }
  get workspaceFolders() {
    if (!this._workspaceFolders) {
      this._updateSetup();
    }
    return this._workspaceFolders;
  }
  get ignoredWorkspaceFolders() {
    if (!this._ignoredWorkspaceFolders) {
      this._updateSetup();
    }
    return this._ignoredWorkspaceFolders;
  }
  get executionEngine() {
    if (this._executionEngine === void 0) {
      this._updateSetup();
    }
    return this._executionEngine;
  }
  get schemaVersion() {
    if (this._schemaVersion === void 0) {
      this._updateSetup();
    }
    return this._schemaVersion;
  }
  get showIgnoreMessage() {
    if (this._showIgnoreMessage === void 0) {
      this._showIgnoreMessage = !this._storageService.getBoolean(AbstractTaskService.IgnoreTask010DonotShowAgain_key, StorageScope.WORKSPACE, false);
    }
    return this._showIgnoreMessage;
  }
  _getActivationEvents(type) {
    const result = [];
    result.push("onCommand:workbench.action.tasks.runTask");
    if (type) {
      result.push(`onTaskType:${type}`);
    } else {
      for (const definition of TaskDefinitionRegistry.all()) {
        result.push(`onTaskType:${definition.taskType}`);
      }
    }
    return result;
  }
  async _activateTaskProviders(type) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const hasLoggedActivation = this._activatedTaskProviders.has(type ?? "all");
    if (!hasLoggedActivation) {
      this._log("Activating task providers " + (type ?? "all"));
    }
    const result = await raceTimeout(
      Promise.all(this._getActivationEvents(type).map((activationEvent) => this._extensionService.activateByEvent(activationEvent))),
      5e3,
      () => this._logService.warn("Timed out activating extensions for task providers")
    );
    if (result) {
      this._activatedTaskProviders.add(type ?? "all");
    }
  }
  _updateSetup(setup) {
    if (!setup) {
      setup = this._computeWorkspaceFolderSetup();
    }
    this._workspaceFolders = setup[0];
    if (this._ignoredWorkspaceFolders) {
      if (this._ignoredWorkspaceFolders.length !== setup[1].length) {
        this._showIgnoreMessage = void 0;
      } else {
        const set = /* @__PURE__ */ new Set();
        this._ignoredWorkspaceFolders.forEach((folder) => set.add(folder.uri.toString()));
        for (const folder of setup[1]) {
          if (!set.has(folder.uri.toString())) {
            this._showIgnoreMessage = void 0;
            break;
          }
        }
      }
    }
    this._ignoredWorkspaceFolders = setup[1];
    this._executionEngine = setup[2];
    this._schemaVersion = setup[3];
    this._workspace = setup[4];
  }
  _showOutput(runSource = TaskRunSource.User, userRequested, errorMessage) {
    if (!VirtualWorkspaceContext.getValue(this._contextKeyService) && (runSource === TaskRunSource.User || runSource === TaskRunSource.ConfigurationChange)) {
      if (userRequested) {
        this._outputService.showChannel(this._outputChannel.id, true);
      } else {
        const chatEnabled = this._chatService.isEnabled(ChatAgentLocation.Chat);
        const actions = [];
        if (chatEnabled && errorMessage) {
          const beforeJSONregex = /^(.*?)\s*\{[\s\S]*$/;
          const matches = errorMessage.match(beforeJSONregex);
          if (matches && matches.length > 1) {
            const message = matches[1];
            const customMessage = message === errorMessage ? `\`${message}\`` : `\`${message}\`
\`\`\`json${errorMessage}\`\`\``;
            const defaultAgent = this._chatAgentService.getDefaultAgent(ChatAgentLocation.Chat);
            if (defaultAgent) {
              actions.push({
                label: nls.localize("troubleshootWithChat", "Fix with AI"),
                run: async () => {
                  this._commandService.executeCommand(CHAT_OPEN_ACTION_ID, {
                    mode: ChatModeKind.Agent,
                    query: `Fix this task configuration error: ${customMessage}`
                  });
                }
              });
            }
          }
        }
        actions.push({
          label: nls.localize("showOutput", "Show Output"),
          run: () => {
            this._outputService.showChannel(this._outputChannel.id, true);
          }
        });
        if (chatEnabled && actions.length > 1) {
          this._notificationService.prompt(Severity.Warning, nls.localize("taskServiceOutputPromptChat", "There are task errors. Use chat to fix them or view the output for details."), actions);
        } else {
          this._notificationService.prompt(Severity.Warning, nls.localize("taskServiceOutputPrompt", "There are task errors. See the output for details."), actions);
        }
      }
    }
  }
  _disposeTaskSystemListeners() {
    if (this._taskSystemListeners) {
      dispose(this._taskSystemListeners);
      this._taskSystemListeners = void 0;
    }
  }
  registerTaskProvider(provider, type) {
    if (!provider) {
      return {
        dispose: () => {
        }
      };
    }
    const handle = AbstractTaskService._nextHandle++;
    this._providers.set(handle, provider);
    this._providerTypes.set(handle, type);
    this._onDidChangeTaskProviders.fire();
    return {
      dispose: () => {
        this._providers.delete(handle);
        this._providerTypes.delete(handle);
        this._onDidChangeTaskProviders.fire();
      }
    };
  }
  get hasTaskSystemInfo() {
    const infosCount = Array.from(this._taskSystemInfos.values()).flat().length;
    if (this._environmentService.remoteAuthority) {
      return infosCount > 1;
    }
    return infosCount > 0;
  }
  registerTaskSystem(key, info) {
    if (info.platform === Platform.Platform.Web) {
      key = this.workspaceFolders.length ? this.workspaceFolders[0].uri.scheme : key;
    }
    if (!this._taskSystemInfos.has(key)) {
      this._taskSystemInfos.set(key, [info]);
    } else {
      const infos = this._taskSystemInfos.get(key);
      if (info.platform === Platform.Platform.Web) {
        infos.push(info);
      } else {
        infos.unshift(info);
      }
    }
    if (this.hasTaskSystemInfo) {
      this._onDidChangeTaskSystemInfo.fire();
    }
  }
  _getTaskSystemInfo(key) {
    const infos = this._taskSystemInfos.get(key);
    return infos && infos.length ? infos[0] : void 0;
  }
  extensionCallbackTaskComplete(task, result) {
    if (!this._taskSystem) {
      return Promise.resolve();
    }
    return this._taskSystem.customExecutionComplete(task, result);
  }
  /**
   * Get a subset of workspace tasks that match a certain predicate.
   */
  async _findWorkspaceTasks(predicate) {
    const result = [];
    const tasks = await this.getWorkspaceTasks();
    for (const [, workspaceTasks] of tasks) {
      if (workspaceTasks.configurations) {
        for (const taskName of Object.keys(workspaceTasks.configurations.byIdentifier)) {
          const task = workspaceTasks.configurations.byIdentifier[taskName];
          if (predicate(task, workspaceTasks.workspaceFolder)) {
            result.push(task);
          }
        }
      }
      if (workspaceTasks.set) {
        for (const task of workspaceTasks.set.tasks) {
          if (predicate(task, workspaceTasks.workspaceFolder)) {
            result.push(task);
          }
        }
      }
    }
    return result;
  }
  async _findWorkspaceTasksInGroup(group, isDefault) {
    return this._findWorkspaceTasks((task) => {
      const taskGroup = task.configurationProperties.group;
      if (taskGroup && typeof taskGroup !== "string") {
        return taskGroup._id === group._id && (!isDefault || !!taskGroup.isDefault);
      }
      return false;
    });
  }
  async getTask(folder, identifier, compareId = false, type = void 0) {
    if (!await this._trust()) {
      return;
    }
    const name = Types.isString(folder) ? folder : isWorkspaceFolder(folder) ? folder.name : folder.configuration ? resources.basename(folder.configuration) : void 0;
    if (this.ignoredWorkspaceFolders.some((ignored) => ignored.name === name)) {
      return Promise.reject(new Error(nls.localize("TaskServer.folderIgnored", "The folder {0} is ignored since it uses task version 0.1.0", name)));
    }
    const key = !Types.isString(identifier) ? TaskDefinition.createTaskIdentifier(identifier, console) : identifier;
    if (key === void 0) {
      return Promise.resolve(void 0);
    }
    const requestedFolder = TaskMap.getKey(folder);
    const matchedTasks = await this._findWorkspaceTasks((task, workspaceFolder) => {
      const taskFolder = TaskMap.getKey(workspaceFolder);
      if (taskFolder !== requestedFolder && taskFolder !== USER_TASKS_GROUP_KEY) {
        return false;
      }
      return task.matches(key, compareId);
    });
    matchedTasks.sort((task) => task._source.kind === TaskSourceKind.Extension ? 1 : -1);
    if (matchedTasks.length > 0) {
      const task = matchedTasks[0];
      if (ConfiguringTask.is(task)) {
        return this.tryResolveTask(task);
      } else {
        return task;
      }
    }
    const map = await this._getGroupedTasks({ type });
    let values = map.get(folder);
    values = values.concat(map.get(USER_TASKS_GROUP_KEY));
    if (!values) {
      return void 0;
    }
    values = values.filter((task) => task.matches(key, compareId)).sort((task) => task._source.kind === TaskSourceKind.Extension ? 1 : -1);
    return values.length > 0 ? values[0] : void 0;
  }
  async tryResolveTask(configuringTask) {
    if (!await this._trust()) {
      return;
    }
    await this._activateTaskProviders(configuringTask.type);
    let matchingProvider;
    let matchingProviderUnavailable = false;
    for (const [handle, provider] of this._providers) {
      const providerType = this._providerTypes.get(handle);
      if (configuringTask.type === providerType) {
        if (providerType && !this._isTaskProviderEnabled(providerType)) {
          matchingProviderUnavailable = true;
          continue;
        }
        matchingProvider = provider;
        break;
      }
    }
    if (!matchingProvider) {
      if (matchingProviderUnavailable) {
        this._log(nls.localize(
          "TaskService.providerUnavailable",
          "Warning: {0} tasks are unavailable in the current environment.",
          configuringTask.configures.type
        ));
      }
      return;
    }
    try {
      const resolvedTask = await matchingProvider.resolveTask(configuringTask);
      if (resolvedTask && resolvedTask._id === configuringTask._id) {
        return TaskConfig.createCustomTask(resolvedTask, configuringTask);
      }
    } catch (error) {
    }
    const tasks = await this.tasks({ type: configuringTask.type });
    for (const task of tasks) {
      if (task._id === configuringTask._id) {
        return TaskConfig.createCustomTask(task, configuringTask);
      }
    }
    return;
  }
  async tasks(filter) {
    if (!await this._trust()) {
      return [];
    }
    if (!this._versionAndEngineCompatible(filter)) {
      return Promise.resolve([]);
    }
    return this._getGroupedTasks(filter).then((map) => this.applyFilterToTaskMap(filter, map));
  }
  async getKnownTasks(filter) {
    if (!this._versionAndEngineCompatible(filter)) {
      return Promise.resolve([]);
    }
    return this._getGroupedTasks(filter, true, true).then((map) => this.applyFilterToTaskMap(filter, map));
  }
  taskTypes() {
    const types = [];
    if (this._isProvideTasksEnabled()) {
      for (const definition of TaskDefinitionRegistry.all()) {
        if (this._isTaskProviderEnabled(definition.taskType)) {
          types.push(definition.taskType);
        }
      }
    }
    return types;
  }
  createSorter() {
    return new TaskSorter(this._contextService.getWorkspace() ? this._contextService.getWorkspace().folders : []);
  }
  _isActive() {
    if (!this._taskSystem) {
      return Promise.resolve(false);
    }
    return this._taskSystem.isActive();
  }
  async getActiveTasks() {
    if (!this._taskSystem) {
      return [];
    }
    return this._taskSystem.getActiveTasks();
  }
  async getBusyTasks() {
    if (!this._taskSystem) {
      return [];
    }
    return this._taskSystem.getBusyTasks();
  }
  getRecentlyUsedTasksV1() {
    if (this._recentlyUsedTasksV1) {
      return this._recentlyUsedTasksV1;
    }
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    this._recentlyUsedTasksV1 = new LRUCache(quickOpenHistoryLimit);
    const storageValue = this._storageService.get(AbstractTaskService.RecentlyUsedTasks_Key, StorageScope.WORKSPACE);
    if (storageValue) {
      try {
        const values = JSON.parse(storageValue);
        if (Array.isArray(values)) {
          for (const value of values) {
            this._recentlyUsedTasksV1.set(value, value);
          }
        }
      } catch (error) {
      }
    }
    return this._recentlyUsedTasksV1;
  }
  applyFilterToTaskMap(filter, map) {
    if (!filter || !filter.type) {
      return map.all();
    }
    const result = [];
    map.forEach((tasks) => {
      for (const task of tasks) {
        if (ContributedTask.is(task) && (task.defines.type === filter.type || task._source.label === filter.type)) {
          result.push(task);
        } else if (CustomTask.is(task)) {
          if (task.type === filter.type) {
            result.push(task);
          } else {
            const customizes = task.customizes();
            if (customizes && customizes.type === filter.type) {
              result.push(task);
            }
          }
        }
      }
    });
    return result;
  }
  _getTasksFromStorage(type) {
    return type === "persistent" ? this._getPersistentTasks() : this._getRecentTasks();
  }
  _getRecentTasks() {
    if (this._recentlyUsedTasks) {
      return this._recentlyUsedTasks;
    }
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    this._recentlyUsedTasks = new LRUCache(quickOpenHistoryLimit);
    const storageValue = this._storageService.get(AbstractTaskService.RecentlyUsedTasks_KeyV2, StorageScope.WORKSPACE);
    if (storageValue) {
      try {
        const values = JSON.parse(storageValue);
        if (Array.isArray(values)) {
          for (const value of values) {
            this._recentlyUsedTasks.set(value[0], value[1]);
          }
        }
      } catch (error) {
      }
    }
    return this._recentlyUsedTasks;
  }
  _getPersistentTasks() {
    if (this._persistentTasks) {
      this._log(nls.localize("taskService.gettingCachedTasks", "Returning cached tasks {0}", this._persistentTasks.size), true);
      return this._persistentTasks;
    }
    this._persistentTasks = new LRUCache(10);
    const storageValue = this._storageService.get(AbstractTaskService.PersistentTasks_Key, StorageScope.WORKSPACE);
    if (storageValue) {
      try {
        const values = JSON.parse(storageValue);
        if (Array.isArray(values)) {
          for (const value of values) {
            this._persistentTasks.set(value[0], value[1]);
          }
        }
      } catch (error) {
      }
    }
    return this._persistentTasks;
  }
  _getFolderFromTaskKey(key) {
    const keyValue = JSON.parse(key);
    return {
      folder: keyValue.folder,
      isWorkspaceFile: keyValue.id?.endsWith(TaskSourceKind.WorkspaceFile)
    };
  }
  async getSavedTasks(type) {
    const folderMap = /* @__PURE__ */ Object.create(null);
    this.workspaceFolders.forEach((folder) => {
      folderMap[folder.uri.toString()] = folder;
    });
    const folderToTasksMap = /* @__PURE__ */ new Map();
    const workspaceToTaskMap = /* @__PURE__ */ new Map();
    const storedTasks = this._getTasksFromStorage(type);
    const tasks = [];
    this._log(nls.localize("taskService.getSavedTasks", "Fetching tasks from task storage."), true);
    function addTaskToMap(map, folder, task) {
      if (folder && !map.has(folder)) {
        map.set(folder, []);
      }
      if (folder && (folderMap[folder] || folder === USER_TASKS_GROUP_KEY) && task) {
        map.get(folder).push(task);
      }
    }
    for (const entry of storedTasks.entries()) {
      try {
        const key = entry[0];
        const task = JSON.parse(entry[1]);
        const folderInfo = this._getFolderFromTaskKey(key);
        this._log(nls.localize("taskService.getSavedTasks.reading", "Reading tasks from task storage, {0}, {1}, {2}", key, task, folderInfo.folder), true);
        addTaskToMap(folderInfo.isWorkspaceFile ? workspaceToTaskMap : folderToTasksMap, folderInfo.folder, task);
      } catch (error) {
        this._log(nls.localize("taskService.getSavedTasks.error", "Fetching a task from task storage failed: {0}.", error), true);
      }
    }
    const readTasksMap = /* @__PURE__ */ new Map();
    async function readTasks(that, map, isWorkspaceFile) {
      for (const key of map.keys()) {
        const custom = [];
        const customized = /* @__PURE__ */ Object.create(null);
        const taskConfigSource = folderMap[key] ? isWorkspaceFile ? TaskConfig.TaskConfigSource.WorkspaceFile : TaskConfig.TaskConfigSource.TasksJson : TaskConfig.TaskConfigSource.User;
        await that._computeTasksForSingleConfig(folderMap[key] ?? await that._getAFolder(), {
          version: "2.0.0",
          tasks: map.get(key)
        }, TaskRunSource.System, custom, customized, taskConfigSource, true);
        custom.forEach((task) => {
          const taskKey = task.getKey();
          if (taskKey) {
            readTasksMap.set(taskKey, task);
          }
        });
        for (const configuration of Object.keys(customized)) {
          const taskKey = customized[configuration].getKey();
          if (taskKey) {
            readTasksMap.set(taskKey, customized[configuration]);
          }
        }
      }
    }
    await readTasks(this, folderToTasksMap, false);
    await readTasks(this, workspaceToTaskMap, true);
    for (const key of storedTasks.keys()) {
      if (readTasksMap.has(key)) {
        tasks.push(readTasksMap.get(key));
        this._log(nls.localize("taskService.getSavedTasks.resolved", "Resolved task {0}", key), true);
      } else {
        this._log(nls.localize("taskService.getSavedTasks.unresolved", "Unable to resolve task {0} ", key), true);
      }
    }
    return tasks;
  }
  removeRecentlyUsedTask(taskRecentlyUsedKey) {
    if (this._getTasksFromStorage("historical").delete(taskRecentlyUsedKey)) {
      this._saveRecentlyUsedTasks();
    }
  }
  removePersistentTask(key) {
    this._log(nls.localize("taskService.removePersistentTask", "Removing persistent task {0}", key), true);
    if (this._getTasksFromStorage("persistent").delete(key)) {
      this._savePersistentTasks();
    }
  }
  _setTaskLRUCacheLimit() {
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    if (this._recentlyUsedTasks) {
      this._recentlyUsedTasks.limit = quickOpenHistoryLimit;
    }
  }
  async _setRecentlyUsedTask(task) {
    let key = task.getKey();
    if (!InMemoryTask.is(task) && key) {
      const customizations = this._createCustomizableTask(task);
      if (ContributedTask.is(task) && customizations) {
        const custom = [];
        const customized = /* @__PURE__ */ Object.create(null);
        await this._computeTasksForSingleConfig(task._source.workspaceFolder ?? this.workspaceFolders[0], {
          version: "2.0.0",
          tasks: [customizations]
        }, TaskRunSource.System, custom, customized, TaskConfig.TaskConfigSource.TasksJson, true);
        for (const configuration of Object.keys(customized)) {
          key = customized[configuration].getKey();
        }
      }
      this._getTasksFromStorage("historical").set(key, JSON.stringify(customizations));
      this._saveRecentlyUsedTasks();
    }
  }
  _saveRecentlyUsedTasks() {
    if (!this._recentlyUsedTasks) {
      return;
    }
    const quickOpenHistoryLimit = this._configurationService.getValue(QUICKOPEN_HISTORY_LIMIT_CONFIG);
    if (quickOpenHistoryLimit === 0) {
      return;
    }
    let keys = [...this._recentlyUsedTasks.keys()];
    if (keys.length > quickOpenHistoryLimit) {
      keys = keys.slice(0, quickOpenHistoryLimit);
    }
    const keyValues = [];
    for (const key of keys) {
      keyValues.push([key, this._recentlyUsedTasks.get(key, Touch.None)]);
    }
    this._storageService.store(AbstractTaskService.RecentlyUsedTasks_KeyV2, JSON.stringify(keyValues), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async _setPersistentTask(task) {
    if (!this._configurationService.getValue(TaskSettingId.Reconnection)) {
      return;
    }
    let key = task.getKey();
    if (!InMemoryTask.is(task) && key) {
      const customizations = this._createCustomizableTask(task);
      if (ContributedTask.is(task) && customizations) {
        const custom = [];
        const customized = /* @__PURE__ */ Object.create(null);
        await this._computeTasksForSingleConfig(task._source.workspaceFolder ?? this.workspaceFolders[0], {
          version: "2.0.0",
          tasks: [customizations]
        }, TaskRunSource.System, custom, customized, TaskConfig.TaskConfigSource.TasksJson, true);
        for (const configuration of Object.keys(customized)) {
          key = customized[configuration].getKey();
        }
      }
      if (!task.configurationProperties.isBackground) {
        return;
      }
      this._log(nls.localize("taskService.setPersistentTask", "Setting persistent task {0}", key), true);
      this._getTasksFromStorage("persistent").set(key, JSON.stringify(customizations));
      this._savePersistentTasks();
    }
  }
  _savePersistentTasks() {
    this._persistentTasks = this._getTasksFromStorage("persistent");
    const keys = [...this._persistentTasks.keys()];
    const keyValues = [];
    for (const key of keys) {
      keyValues.push([key, this._persistentTasks.get(key, Touch.None)]);
    }
    this._log(nls.localize("savePersistentTask", "Saving persistent tasks: {0}", keys.join(", ")), true);
    this._storageService.store(AbstractTaskService.PersistentTasks_Key, JSON.stringify(keyValues), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  _openDocumentation() {
    this._openerService.open(URI.parse("https://code.visualstudio.com/docs/editor/tasks#_defining-a-problem-matcher"));
  }
  async _findSingleWorkspaceTaskOfGroup(group) {
    const tasksOfGroup = await this._findWorkspaceTasksInGroup(group, true);
    if (tasksOfGroup.length === 1 && typeof tasksOfGroup[0].configurationProperties.group !== "string" && tasksOfGroup[0].configurationProperties.group?.isDefault) {
      let resolvedTask;
      if (ConfiguringTask.is(tasksOfGroup[0])) {
        resolvedTask = await this.tryResolveTask(tasksOfGroup[0]);
      } else {
        resolvedTask = tasksOfGroup[0];
      }
      if (resolvedTask) {
        return this.run(resolvedTask, void 0, TaskRunSource.User);
      }
    }
    return void 0;
  }
  async _build() {
    const tryBuildShortcut = await this._findSingleWorkspaceTaskOfGroup(TaskGroup.Build);
    if (tryBuildShortcut) {
      return tryBuildShortcut;
    }
    return this._getGroupedTasksAndExecute();
  }
  async _runTest() {
    const tryTestShortcut = await this._findSingleWorkspaceTaskOfGroup(TaskGroup.Test);
    if (tryTestShortcut) {
      return tryTestShortcut;
    }
    return this._getGroupedTasksAndExecute(true);
  }
  async _getGroupedTasksAndExecute(test) {
    const tasks = await this._getGroupedTasks();
    const runnable = this._createRunnableTask(tasks, test ? TaskGroup.Test : TaskGroup.Build);
    if (!runnable || !runnable.task) {
      if (test) {
        if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noTestTask1", "No test task defined. Mark a task with 'isTestCommand' in the tasks.json file."), TaskErrors.NoTestTask);
        } else {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noTestTask2", "No test task defined. Mark a task with as a 'test' group in the tasks.json file."), TaskErrors.NoTestTask);
        }
      } else {
        if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noBuildTask1", "No build task defined. Mark a task with 'isBuildCommand' in the tasks.json file."), TaskErrors.NoBuildTask);
        } else {
          throw new TaskError(Severity.Info, nls.localize("TaskService.noBuildTask2", "No build task defined. Mark a task with as a 'build' group in the tasks.json file."), TaskErrors.NoBuildTask);
        }
      }
    }
    let executeTaskResult;
    try {
      executeTaskResult = await this._executeTask(runnable.task, runnable.resolver, TaskRunSource.User);
    } catch (error) {
      this._handleError(error);
      return Promise.reject(error);
    }
    return executeTaskResult;
  }
  async run(task, options, runSource = TaskRunSource.System) {
    if (!await this._trust()) {
      return;
    }
    if (!task) {
      throw new TaskError(Severity.Info, nls.localize("TaskServer.noTask", "Task to execute is undefined"), TaskErrors.TaskNotFound);
    }
    const resolver = this._createResolver();
    let executeTaskResult;
    try {
      if (options && options.attachProblemMatcher && this._shouldAttachProblemMatcher(task) && !InMemoryTask.is(task)) {
        const taskToExecute = await this._attachProblemMatcher(task);
        if (taskToExecute) {
          executeTaskResult = await this._executeTask(taskToExecute, resolver, runSource);
        }
      } else {
        executeTaskResult = await this._executeTask(task, resolver, runSource);
      }
      return executeTaskResult;
    } catch (error) {
      this._handleError(error);
      return Promise.reject(error);
    }
  }
  _isProvideTasksEnabled() {
    const settingValue = this._configurationService.getValue(TaskSettingId.AutoDetect);
    return settingValue === "on";
  }
  _isProblemMatcherPromptEnabled(type) {
    const settingValue = this._configurationService.getValue(PROBLEM_MATCHER_NEVER_CONFIG);
    if (Types.isBoolean(settingValue)) {
      return !settingValue;
    }
    if (type === void 0) {
      return true;
    }
    const settingValueMap = settingValue;
    return !settingValueMap[type];
  }
  _getTypeForTask(task) {
    let type;
    if (CustomTask.is(task)) {
      const configProperties = task._source.config.element;
      type = configProperties.type ?? "";
    } else {
      type = task.getDefinition().type;
    }
    return type;
  }
  _shouldAttachProblemMatcher(task) {
    const enabled = this._isProblemMatcherPromptEnabled(this._getTypeForTask(task));
    if (enabled === false) {
      return false;
    }
    if (!this._canCustomize(task)) {
      return false;
    }
    if (task.configurationProperties.group !== void 0 && task.configurationProperties.group !== TaskGroup.Build) {
      return false;
    }
    if (task.configurationProperties.problemMatchers !== void 0 && task.configurationProperties.problemMatchers.length > 0) {
      return false;
    }
    if (ContributedTask.is(task)) {
      return !task.hasDefinedMatchers && !!task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length === 0;
    }
    if (CustomTask.is(task)) {
      const configProperties = task._source.config.element;
      return configProperties.problemMatcher === void 0 && !task.hasDefinedMatchers;
    }
    return false;
  }
  async _updateNeverProblemMatcherSetting(type) {
    const current = this._configurationService.getValue(PROBLEM_MATCHER_NEVER_CONFIG);
    if (current === true) {
      return;
    }
    let newValue;
    if (current !== false) {
      newValue = current;
    } else {
      newValue = /* @__PURE__ */ Object.create(null);
    }
    newValue[type] = true;
    return this._configurationService.updateValue(PROBLEM_MATCHER_NEVER_CONFIG, newValue);
  }
  async _attachProblemMatcher(task) {
    let entries = [];
    for (const key of ProblemMatcherRegistry.keys()) {
      const matcher = ProblemMatcherRegistry.get(key);
      if (matcher.deprecated) {
        continue;
      }
      if (matcher.name === matcher.label) {
        entries.push({ label: matcher.name, matcher });
      } else {
        entries.push({
          label: matcher.label,
          description: `$${matcher.name}`,
          matcher
        });
      }
    }
    if (entries.length === 0) {
      return;
    }
    entries = entries.sort((a, b) => {
      if (a.label && b.label) {
        return a.label.localeCompare(b.label);
      } else {
        return 0;
      }
    });
    entries.unshift({ type: "separator", label: nls.localize("TaskService.associate", "associate") });
    let taskType;
    if (CustomTask.is(task)) {
      const configProperties = task._source.config.element;
      taskType = configProperties.type ?? "";
    } else {
      taskType = task.getDefinition().type;
    }
    entries.unshift(
      { label: nls.localize("TaskService.attachProblemMatcher.continueWithout", "Continue without scanning the task output"), matcher: void 0 },
      { label: nls.localize("TaskService.attachProblemMatcher.never", "Never scan the task output for this task"), matcher: void 0, never: true },
      { label: nls.localize("TaskService.attachProblemMatcher.neverType", "Never scan the task output for {0} tasks", taskType), matcher: void 0, setting: taskType },
      { label: nls.localize("TaskService.attachProblemMatcher.learnMoreAbout", "Learn more about scanning the task output"), matcher: void 0, learnMore: true }
    );
    const problemMatcher = await this._quickInputService.pick(entries, { placeHolder: nls.localize("selectProblemMatcher", "Select for which kind of errors and warnings to scan the task output") });
    if (!problemMatcher) {
      return task;
    }
    if (problemMatcher.learnMore) {
      this._openDocumentation();
      return void 0;
    }
    if (problemMatcher.never) {
      this.customize(task, { problemMatcher: [] }, true);
      return task;
    }
    if (problemMatcher.matcher) {
      const newTask = task.clone();
      const matcherReference = `$${problemMatcher.matcher.name}`;
      const properties = { problemMatcher: [matcherReference] };
      newTask.configurationProperties.problemMatchers = [matcherReference];
      const matcher = ProblemMatcherRegistry.get(problemMatcher.matcher.name);
      if (matcher && matcher.watching !== void 0) {
        properties.isBackground = true;
        newTask.configurationProperties.isBackground = true;
      }
      this.customize(task, properties, true);
      return newTask;
    }
    if (problemMatcher.setting) {
      await this._updateNeverProblemMatcherSetting(problemMatcher.setting);
    }
    return task;
  }
  async _getTasksForGroup(group, waitToActivate) {
    const groups = await this._getGroupedTasks(void 0, waitToActivate);
    const result = [];
    groups.forEach((tasks) => {
      for (const task of tasks) {
        const configTaskGroup = TaskGroup.from(task.configurationProperties.group);
        if (configTaskGroup?._id === group._id) {
          result.push(task);
        }
      }
    });
    return result;
  }
  needsFolderQualification() {
    return this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE;
  }
  _canCustomize(task) {
    if (this.schemaVersion !== JsonSchemaVersion.V2_0_0) {
      return false;
    }
    if (CustomTask.is(task)) {
      return true;
    }
    if (ContributedTask.is(task)) {
      return !!task.getWorkspaceFolder();
    }
    return false;
  }
  async _formatTaskForJson(resource, task) {
    let reference;
    let stringValue = "";
    try {
      reference = await this._textModelResolverService.createModelReference(resource);
      const model = reference.object.textEditorModel;
      const { tabSize, insertSpaces } = model.getOptions();
      const eol = model.getEOL();
      let stringified = toFormattedString(task, { eol, tabSize, insertSpaces });
      const regex = new RegExp(eol + (insertSpaces ? " ".repeat(tabSize) : "\\t"), "g");
      stringified = stringified.replace(regex, eol + (insertSpaces ? " ".repeat(tabSize * 3) : "			"));
      const twoTabs = insertSpaces ? " ".repeat(tabSize * 2) : "		";
      stringValue = twoTabs + stringified.slice(0, stringified.length - 1) + twoTabs + stringified.slice(stringified.length - 1);
    } finally {
      reference?.dispose();
    }
    return stringValue;
  }
  async _openEditorAtTask(resource, task, configIndex = -1) {
    if (resource === void 0) {
      return Promise.resolve(false);
    }
    const fileContent = await this._fileService.readFile(resource);
    const content = fileContent.value;
    if (!content || !task) {
      return false;
    }
    const contentValue = content.toString();
    let stringValue;
    if (configIndex !== -1) {
      const json2 = this._configurationService.getValue("tasks", { resource });
      if (json2.tasks && json2.tasks.length > configIndex) {
        stringValue = await this._formatTaskForJson(resource, json2.tasks[configIndex]);
      }
    }
    if (!stringValue) {
      if (typeof task === "string") {
        stringValue = task;
      } else {
        stringValue = await this._formatTaskForJson(resource, task);
      }
    }
    const index = contentValue.indexOf(stringValue);
    let startLineNumber = 1;
    for (let i = 0; i < index; i++) {
      if (contentValue.charAt(i) === "\n") {
        startLineNumber++;
      }
    }
    let endLineNumber = startLineNumber;
    for (let i = 0; i < stringValue.length; i++) {
      if (stringValue.charAt(i) === "\n") {
        endLineNumber++;
      }
    }
    const selection = startLineNumber > 1 ? { startLineNumber, startColumn: startLineNumber === endLineNumber ? 4 : 3, endLineNumber, endColumn: startLineNumber === endLineNumber ? void 0 : 4 } : void 0;
    await this._editorService.openEditor({
      resource,
      options: {
        pinned: false,
        forceReload: true,
        // because content might have changed
        selection,
        selectionRevealType: TextEditorSelectionRevealType.CenterIfOutsideViewport
      }
    });
    return !!selection;
  }
  _createCustomizableTask(task) {
    let toCustomize;
    const taskConfig = CustomTask.is(task) || ConfiguringTask.is(task) ? task._source.config : void 0;
    if (taskConfig && taskConfig.element) {
      toCustomize = { ...taskConfig.element };
    } else if (ContributedTask.is(task)) {
      toCustomize = {};
      const identifier = Object.assign(/* @__PURE__ */ Object.create(null), task.defines);
      delete identifier["_key"];
      Object.keys(identifier).forEach((key) => toCustomize[key] = identifier[key]);
      if (task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length > 0 && Types.isStringArray(task.configurationProperties.problemMatchers)) {
        toCustomize.problemMatcher = task.configurationProperties.problemMatchers;
      }
      if (task.configurationProperties.group) {
        toCustomize.group = TaskConfig.GroupKind.to(task.configurationProperties.group);
      }
    }
    if (!toCustomize) {
      return void 0;
    }
    if (toCustomize.problemMatcher === void 0 && task.configurationProperties.problemMatchers === void 0 || task.configurationProperties.problemMatchers && task.configurationProperties.problemMatchers.length === 0) {
      toCustomize.problemMatcher = [];
    }
    if (task._source.label !== "Workspace") {
      toCustomize.label = task.configurationProperties.identifier;
    } else {
      toCustomize.label = task._label;
    }
    toCustomize.detail = task.configurationProperties.detail;
    return toCustomize;
  }
  async customize(task, properties, openConfig) {
    if (!await this._trust()) {
      return;
    }
    const workspaceFolder = task.getWorkspaceFolder();
    if (!workspaceFolder) {
      return Promise.resolve(void 0);
    }
    const configuration = this._getConfiguration(workspaceFolder, task._source.kind);
    if (configuration.hasParseErrors) {
      this._notificationService.warn(nls.localize("customizeParseErrors", "The current task configuration has errors. Please fix the errors first before customizing a task."));
      return Promise.resolve(void 0);
    }
    const fileConfig = configuration.config;
    const toCustomize = this._createCustomizableTask(task);
    if (!toCustomize) {
      return Promise.resolve(void 0);
    }
    const index = CustomTask.is(task) ? task._source.config.index : void 0;
    if (properties) {
      for (const property of Object.getOwnPropertyNames(properties)) {
        const value = properties[property];
        if (value !== void 0 && value !== null) {
          toCustomize[property] = value;
        }
      }
    }
    if (!fileConfig) {
      const value = {
        version: "2.0.0",
        tasks: [toCustomize]
      };
      let content = [
        "{",
        nls.localize("tasksJsonComment", "	// See https://go.microsoft.com/fwlink/?LinkId=733558 \n	// for the documentation about the tasks.json format")
      ].join("\n") + JSON.stringify(value, null, "	").substr(1);
      const editorConfig = this._configurationService.getValue();
      if (editorConfig.editor.insertSpaces) {
        content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + " ".repeat(s2.length * editorConfig.editor.tabSize));
      }
      await this._textFileService.create([{ resource: workspaceFolder.toResource(".vscode/tasks.json"), value: content }]);
    } else {
      if (index === -1 && properties) {
        if (properties.problemMatcher !== void 0) {
          fileConfig.problemMatcher = properties.problemMatcher;
          await this._writeConfiguration(workspaceFolder, "tasks.problemMatchers", fileConfig.problemMatcher, task._source.kind);
        } else if (properties.group !== void 0) {
          fileConfig.group = properties.group;
          await this._writeConfiguration(workspaceFolder, "tasks.group", fileConfig.group, task._source.kind);
        }
      } else {
        if (!Array.isArray(fileConfig.tasks)) {
          fileConfig.tasks = [];
        }
        if (index === void 0) {
          fileConfig.tasks.push(toCustomize);
        } else {
          fileConfig.tasks[index] = toCustomize;
        }
        await this._writeConfiguration(workspaceFolder, "tasks.tasks", fileConfig.tasks, task._source.kind);
      }
    }
    if (openConfig) {
      this._openEditorAtTask(this._getResourceForTask(task), toCustomize);
    }
  }
  _writeConfiguration(workspaceFolder, key, value, source) {
    let target = void 0;
    switch (source) {
      case TaskSourceKind.User:
        target = ConfigurationTarget.USER;
        break;
      case TaskSourceKind.WorkspaceFile:
        target = ConfigurationTarget.WORKSPACE;
        break;
      default:
        if (this._contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
          target = ConfigurationTarget.WORKSPACE;
        } else if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
          target = ConfigurationTarget.WORKSPACE_FOLDER;
        }
    }
    if (target) {
      return this._configurationService.updateValue(key, value, { resource: workspaceFolder.uri }, target);
    } else {
      return void 0;
    }
  }
  _getResourceForKind(kind) {
    this._updateSetup();
    switch (kind) {
      case TaskSourceKind.User: {
        return resources.joinPath(resources.dirname(this._preferencesService.userSettingsResource), "tasks.json");
      }
      case TaskSourceKind.WorkspaceFile: {
        if (this._workspace && this._workspace.configuration) {
          return this._workspace.configuration;
        }
      }
      default: {
        return void 0;
      }
    }
  }
  _getResourceForTask(task) {
    if (CustomTask.is(task)) {
      let uri = this._getResourceForKind(task._source.kind);
      if (!uri) {
        const taskFolder = task.getWorkspaceFolder();
        if (taskFolder) {
          uri = taskFolder.toResource(task._source.config.file);
        } else {
          uri = this.workspaceFolders[0].uri;
        }
      }
      return uri;
    } else {
      return task.getWorkspaceFolder().toResource(".vscode/tasks.json");
    }
  }
  async openConfig(task) {
    let resource;
    if (task) {
      resource = this._getResourceForTask(task);
    } else {
      resource = this._workspaceFolders && this._workspaceFolders.length > 0 ? this._workspaceFolders[0].toResource(".vscode/tasks.json") : void 0;
    }
    return this._openEditorAtTask(resource, task ? task._label : void 0, task ? task._source.config.index : -1);
  }
  _createRunnableTask(tasks, group) {
    const resolverData = /* @__PURE__ */ new Map();
    const workspaceTasks = [];
    const extensionTasks = [];
    tasks.forEach((tasks2, folder) => {
      let data = resolverData.get(folder);
      if (!data) {
        data = {
          id: /* @__PURE__ */ new Map(),
          label: /* @__PURE__ */ new Map(),
          identifier: /* @__PURE__ */ new Map()
        };
        resolverData.set(folder, data);
      }
      for (const task of tasks2) {
        data.id.set(task._id, task);
        data.label.set(task._label, task);
        if (task.configurationProperties.identifier) {
          data.identifier.set(task.configurationProperties.identifier, task);
        }
        if (group && task.configurationProperties.group === group) {
          if (task._source.kind === TaskSourceKind.Workspace) {
            workspaceTasks.push(task);
          } else {
            extensionTasks.push(task);
          }
        }
      }
    });
    const resolver = {
      resolve: async (uri, alias) => {
        const data = resolverData.get(typeof uri === "string" ? uri : uri.toString());
        if (!data) {
          return void 0;
        }
        return data.id.get(alias) || data.label.get(alias) || data.identifier.get(alias);
      }
    };
    if (workspaceTasks.length > 0) {
      if (workspaceTasks.length > 1) {
        this._log(nls.localize("moreThanOneBuildTask", "There are many build tasks defined in the tasks.json. Executing the first one."));
      }
      return { task: workspaceTasks[0], resolver };
    }
    if (extensionTasks.length === 0) {
      return void 0;
    }
    if (extensionTasks.length === 1) {
      return { task: extensionTasks[0], resolver };
    } else {
      const id = UUID.generateUuid();
      const task = new InMemoryTask(
        id,
        { kind: TaskSourceKind.InMemory, label: "inMemory" },
        id,
        "inMemory",
        { reevaluateOnRerun: true },
        {
          identifier: id,
          dependsOn: extensionTasks.map((extensionTask) => {
            return { uri: extensionTask.getWorkspaceFolder().uri, task: extensionTask._id };
          }),
          name: id
        }
      );
      return { task, resolver };
    }
  }
  _createResolver(grouped) {
    let resolverData;
    async function quickResolve(that, uri, identifier) {
      const foundTasks = await that._findWorkspaceTasks((task2) => {
        const taskUri = ConfiguringTask.is(task2) || CustomTask.is(task2) ? task2._source.config.workspaceFolder?.uri : void 0;
        const originalUri = typeof uri === "string" ? uri : uri.toString();
        if (taskUri?.toString() !== originalUri) {
          return false;
        }
        if (Types.isString(identifier)) {
          return task2._label === identifier || task2.configurationProperties.identifier === identifier;
        } else {
          const keyedIdentifier = task2.getDefinition(true);
          const searchIdentifier = TaskDefinition.createTaskIdentifier(identifier, console);
          return searchIdentifier && keyedIdentifier ? searchIdentifier._key === keyedIdentifier._key : false;
        }
      });
      if (foundTasks.length === 0) {
        return void 0;
      }
      const task = foundTasks[0];
      if (ConfiguringTask.is(task)) {
        return that.tryResolveTask(task);
      }
      return task;
    }
    async function getResolverData(that) {
      if (resolverData === void 0) {
        resolverData = /* @__PURE__ */ new Map();
        (grouped || await that._getGroupedTasks()).forEach((tasks, folder) => {
          let data = resolverData.get(folder);
          if (!data) {
            data = { label: /* @__PURE__ */ new Map(), identifier: /* @__PURE__ */ new Map(), taskIdentifier: /* @__PURE__ */ new Map() };
            resolverData.set(folder, data);
          }
          for (const task of tasks) {
            data.label.set(task._label, task);
            if (task.configurationProperties.identifier) {
              data.identifier.set(task.configurationProperties.identifier, task);
            }
            const keyedIdentifier = task.getDefinition(true);
            if (keyedIdentifier !== void 0) {
              data.taskIdentifier.set(keyedIdentifier._key, task);
            }
          }
        });
      }
      return resolverData;
    }
    async function fullResolve(that, uri, identifier) {
      const allResolverData = await getResolverData(that);
      const data = allResolverData.get(typeof uri === "string" ? uri : uri.toString());
      if (!data) {
        return void 0;
      }
      if (Types.isString(identifier)) {
        return data.label.get(identifier) || data.identifier.get(identifier);
      } else {
        const key = TaskDefinition.createTaskIdentifier(identifier, console);
        return key !== void 0 ? data.taskIdentifier.get(key._key) : void 0;
      }
    }
    return {
      resolve: async (uri, identifier) => {
        if (!identifier) {
          return void 0;
        }
        if (resolverData === void 0 && grouped === void 0) {
          return await quickResolve(this, uri, identifier) ?? fullResolve(this, uri, identifier);
        } else {
          return fullResolve(this, uri, identifier);
        }
      }
    };
  }
  async _saveBeforeRun() {
    let SaveBeforeRunConfigOptions;
    ((SaveBeforeRunConfigOptions2) => {
      SaveBeforeRunConfigOptions2["Always"] = "always";
      SaveBeforeRunConfigOptions2["Never"] = "never";
      SaveBeforeRunConfigOptions2["Prompt"] = "prompt";
    })(SaveBeforeRunConfigOptions || (SaveBeforeRunConfigOptions = {}));
    const saveBeforeRunTaskConfig = this._configurationService.getValue(TaskSettingId.SaveBeforeRun);
    if (saveBeforeRunTaskConfig === "never" /* Never */) {
      return false;
    } else if (saveBeforeRunTaskConfig === "prompt" /* Prompt */ && this._editorService.editors.some((e) => e.isDirty())) {
      const { confirmed } = await this._dialogService.confirm({
        message: nls.localize("TaskSystem.saveBeforeRun.prompt.title", "Save all editors?"),
        detail: nls.localize("detail", "Do you want to save all editors before running the task?"),
        primaryButton: nls.localize({ key: "saveBeforeRun.save", comment: ["&& denotes a mnemonic"] }, "&&Save"),
        cancelButton: nls.localize({ key: "saveBeforeRun.dontSave", comment: ["&& denotes a mnemonic"] }, "Do&&n't Save")
      });
      if (!confirmed) {
        return false;
      }
    }
    await this._editorService.saveAll({ reason: SaveReason.EXPLICIT });
    return true;
  }
  async _executeTask(task, resolver, runSource) {
    let taskToRun = task;
    if (await this._saveBeforeRun()) {
      await this._configurationService.reloadConfiguration();
      await this._updateWorkspaceTasks();
      const taskFolder = task.getWorkspaceFolder();
      const taskIdentifier = task.configurationProperties.identifier;
      const taskType = CustomTask.is(task) ? task.customizes()?.type : ContributedTask.is(task) ? task.type : void 0;
      taskToRun = (taskFolder && taskIdentifier && runSource === TaskRunSource.User ? await this.getTask(taskFolder, taskIdentifier, false, taskType) : task) ?? task;
    }
    await ProblemMatcherRegistry.onReady();
    const executeResult = runSource === TaskRunSource.Reconnect ? this._getTaskSystem().reconnect(taskToRun, resolver) : this._getTaskSystem().run(taskToRun, resolver);
    if (executeResult) {
      return this._handleExecuteResult(executeResult, runSource);
    }
    return { exitCode: 0 };
  }
  async _handleExecuteResult(executeResult, runSource) {
    if (runSource && executeResult.task._id) {
      this._taskRunSources.set(executeResult.task._id, runSource);
    }
    if (runSource === TaskRunSource.User) {
      await this._setRecentlyUsedTask(executeResult.task);
    }
    if (executeResult.kind === TaskExecuteKind.Active) {
      const active = executeResult.active;
      if (active && active.same && runSource === TaskRunSource.FolderOpen || runSource === TaskRunSource.Reconnect) {
        this._logService.debug("Ignoring task that is already active", executeResult.task);
        return executeResult.promise;
      }
      if (active && active.same) {
        this._handleInstancePolicy(executeResult.task, executeResult.task.runOptions.instancePolicy);
      } else {
        throw new TaskError(Severity.Warning, nls.localize("TaskSystem.active", "There is already a task running. Terminate it first before executing another task."), TaskErrors.RunningTask);
      }
    }
    this._setRecentlyUsedTask(executeResult.task);
    return executeResult.promise;
  }
  _handleInstancePolicy(task, policy) {
    if (!this._taskSystem?.isTaskVisible(task)) {
      this._taskSystem?.revealTask(task);
    }
    switch (policy) {
      case InstancePolicy.terminateNewest:
        this._restart(this._getTaskSystem().getLastInstance(task) ?? task);
        break;
      case InstancePolicy.terminateOldest:
        this._restart(this._getTaskSystem().getFirstInstance(task) ?? task);
        break;
      case InstancePolicy.silent:
        break;
      case InstancePolicy.warn:
        this._notificationService.warn(nls.localize("TaskSystem.InstancePolicy.warn", "The instance limit for this task has been reached."));
        break;
      case InstancePolicy.prompt:
      default: {
        if (this._environmentService.isSessionsWindow) {
          this._logService.warn(`[tasks] InstancePolicy.prompt hit in sessions window for task '${task._label}'
${new Error().stack}`);
        }
        this._showQuickPick(
          this._taskSystem.getActiveTasks().filter((t) => task._id === t._id),
          nls.localize("TaskService.instanceToTerminate", "Select an instance to terminate"),
          {
            label: nls.localize("TaskService.noInstanceRunning", "No instance is currently running"),
            task: void 0
          },
          false,
          true,
          void 0
        ).then((entry) => {
          const task2 = entry ? entry.task : void 0;
          if (task2 === void 0 || task2 === null) {
            return;
          }
          this._restart(task2);
        });
      }
    }
  }
  async _restart(task) {
    if (!this._taskSystem) {
      return;
    }
    const isTaskRunning = await this.getActiveTasks().then((tasks) => tasks.some((t) => t.getMapKey() === task.getMapKey()));
    if (isTaskRunning) {
      const response = await this._taskSystem.terminate(task);
      if (!response.success) {
        this._notificationService.warn(nls.localize("TaskSystem.restartFailed", "Failed to terminate and restart task {0}", Types.isString(task) ? task : task.configurationProperties.name));
        return;
      }
    }
    try {
      const updatedTask = await this._findUpdatedTask(task);
      if (updatedTask) {
        await this.run(updatedTask);
      } else {
        const success = await this.run(task);
        if (!success || typeof success.exitCode === "number" && success.exitCode !== 0) {
          this._notificationService.warn(nls.localize("TaskSystem.taskNoLongerExists", "Task {0} no longer exists or has been modified. Cannot restart.", task.configurationProperties.name));
        }
      }
    } catch {
    }
  }
  async _findUpdatedTask(originalTask) {
    const mapStringToFolderTasks = await this._updateWorkspaceTasks(TaskRunSource.System);
    for (const [_, folderResult] of mapStringToFolderTasks) {
      if (!folderResult.set?.tasks?.length && !folderResult.configurations?.byIdentifier) {
        continue;
      }
      if (folderResult.set?.tasks) {
        for (const task of folderResult.set.tasks) {
          if (task._id === originalTask._id) {
            return task;
          }
        }
      }
      if (folderResult.configurations?.byIdentifier) {
        for (const [_2, configuringTask] of Object.entries(folderResult.configurations.byIdentifier)) {
          if (configuringTask._id === originalTask._id) {
            return this.tryResolveTask(configuringTask);
          }
        }
      }
    }
    if (ContributedTask.is(originalTask)) {
      const allTasks = await this.tasks({ type: originalTask.type });
      for (const task of allTasks) {
        if (task._id === originalTask._id) {
          return task;
        }
      }
    }
    return void 0;
  }
  async terminate(task) {
    if (!await this._trust()) {
      return { success: true, task: void 0 };
    }
    if (!this._taskSystem) {
      return { success: true, task: void 0 };
    }
    return this._taskSystem.terminate(task);
  }
  _terminateAll() {
    if (!this._taskSystem) {
      return Promise.resolve([]);
    }
    return this._taskSystem.terminateAll();
  }
  _createTerminalTaskSystem() {
    return new TerminalTaskSystem(
      this._terminalService,
      this._terminalGroupService,
      this._outputService,
      this._paneCompositeService,
      this._viewsService,
      this._markerService,
      this._modelService,
      this._configurationResolverService,
      this._contextService,
      this._environmentService,
      AbstractTaskService.OutputChannelId,
      this._fileService,
      this._terminalProfileResolverService,
      this._pathService,
      this._viewDescriptorService,
      this._logService,
      this._notificationService,
      this._contextKeyService,
      this._instantiationService,
      (workspaceFolder) => {
        if (workspaceFolder) {
          return this._getTaskSystemInfo(workspaceFolder.uri.scheme);
        } else if (this._taskSystemInfos.size > 0) {
          const infos = Array.from(this._taskSystemInfos.entries());
          const notFile = infos.filter((info) => info[0] !== Schemas.file);
          if (notFile.length > 0) {
            return notFile[0][1][0];
          }
          return infos[0][1][0];
        } else {
          return void 0;
        }
      },
      async (taskKey) => {
        const taskMap = await this._getGroupedTasks();
        const allTasks = taskMap.all();
        for (const task of allTasks) {
          if (task.getMapKey() === taskKey) {
            return task;
          }
        }
        return void 0;
      }
    );
  }
  _isTaskProviderEnabled(type) {
    const definition = TaskDefinitionRegistry.get(type);
    return !definition || !definition.when || this._contextKeyService.contextMatchesRules(definition.when);
  }
  async _getGroupedTasks(filter, waitToActivate, knownOnlyOrTrusted) {
    await this._waitForAllSupportedExecutions;
    const type = filter?.type;
    const needsRecentTasksMigration = this._needsRecentTasksMigration();
    if (!waitToActivate) {
      await this._activateTaskProviders(filter?.type);
    }
    const validTypes = /* @__PURE__ */ Object.create(null);
    TaskDefinitionRegistry.all().forEach((definition) => validTypes[definition.taskType] = true);
    validTypes["shell"] = true;
    validTypes["process"] = true;
    const contributedTaskSets = await new Promise((resolve) => {
      const result2 = [];
      let counter = 0;
      const done = (value) => {
        if (value) {
          result2.push(value);
        }
        if (--counter === 0) {
          resolve(result2);
        }
      };
      const error = (error2) => {
        try {
          if (!isCancellationError(error2)) {
            if (error2 && Types.isString(error2.message)) {
              this._log(`Error: ${error2.message}
`);
              this._showOutput(void 0, void 0, error2.message);
            } else {
              this._log("Unknown error received while collecting tasks from providers.");
              this._showOutput();
            }
          }
        } finally {
          if (--counter === 0) {
            resolve(result2);
          }
        }
      };
      if (this._isProvideTasksEnabled() && this.schemaVersion === JsonSchemaVersion.V2_0_0 && this._providers.size > 0) {
        let foundAnyProviders = false;
        for (const [handle, provider] of this._providers) {
          const providerType = this._providerTypes.get(handle);
          if (type === void 0 || type === providerType) {
            if (providerType && !this._isTaskProviderEnabled(providerType)) {
              continue;
            }
            foundAnyProviders = true;
            counter++;
            raceTimeout(provider.provideTasks(validTypes).then((taskSet) => {
              for (const task of taskSet.tasks) {
                if (task.type !== this._providerTypes.get(handle)) {
                  this._log(nls.localize("unexpectedTaskType", 'The task provider for "{0}" tasks unexpectedly provided a task of type "{1}".\n', this._providerTypes.get(handle), task.type));
                  if (task.type !== "shell" && task.type !== "process") {
                    this._showOutput();
                  }
                  break;
                }
              }
              return done(taskSet);
            }, error), 5e3, () => {
              done(void 0);
            });
          }
        }
        if (!foundAnyProviders) {
          resolve(result2);
        }
      } else {
        resolve(result2);
      }
    });
    const result = new TaskMap();
    const contributedTasks = new TaskMap();
    for (const set of contributedTaskSets) {
      for (const task of set.tasks) {
        const workspaceFolder = task.getWorkspaceFolder();
        if (workspaceFolder) {
          contributedTasks.add(workspaceFolder, task);
        }
      }
    }
    try {
      let tasks = [];
      if (!knownOnlyOrTrusted || this._workspaceTrustManagementService.isWorkspaceTrusted()) {
        tasks = Array.from(await this.getWorkspaceTasks());
      }
      await Promise.all(this._getCustomTaskPromises(tasks, filter, result, contributedTasks, waitToActivate));
      if (needsRecentTasksMigration) {
        await this._migrateRecentTasks(result.all());
      }
      return result;
    } catch {
      const result2 = new TaskMap();
      for (const set of contributedTaskSets) {
        for (const task of set.tasks) {
          const folder = task.getWorkspaceFolder();
          if (folder) {
            result2.add(folder, task);
          }
        }
      }
      return result2;
    }
  }
  _getCustomTaskPromises(customTasksKeyValuePairs, filter, result, contributedTasks, waitToActivate) {
    return customTasksKeyValuePairs.map(async ([key, folderTasks]) => {
      const contributed = contributedTasks.get(key);
      if (!folderTasks.set) {
        if (contributed) {
          result.add(key, ...contributed);
        }
        return;
      }
      if (this._contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
        result.add(key, ...folderTasks.set.tasks);
      } else {
        const configurations = folderTasks.configurations;
        const legacyTaskConfigurations = folderTasks.set ? this._getLegacyTaskConfigurations(folderTasks.set) : void 0;
        const customTasksToDelete = [];
        if (configurations || legacyTaskConfigurations) {
          const unUsedConfigurations = /* @__PURE__ */ new Set();
          if (configurations) {
            Object.keys(configurations.byIdentifier).forEach((key2) => unUsedConfigurations.add(key2));
          }
          for (const task of contributed) {
            if (!ContributedTask.is(task)) {
              continue;
            }
            if (configurations) {
              const configuringTask = configurations.byIdentifier[task.defines._key];
              if (configuringTask) {
                unUsedConfigurations.delete(task.defines._key);
                result.add(key, TaskConfig.createCustomTask(task, configuringTask));
              } else {
                result.add(key, task);
              }
            } else if (legacyTaskConfigurations) {
              const configuringTask = legacyTaskConfigurations[task.defines._key];
              if (configuringTask) {
                result.add(key, TaskConfig.createCustomTask(task, configuringTask));
                customTasksToDelete.push(configuringTask);
              } else {
                result.add(key, task);
              }
            } else {
              result.add(key, task);
            }
          }
          if (customTasksToDelete.length > 0) {
            const toDelete = customTasksToDelete.reduce((map, task) => {
              map[task._id] = true;
              return map;
            }, /* @__PURE__ */ Object.create(null));
            for (const task of folderTasks.set.tasks) {
              if (toDelete[task._id]) {
                continue;
              }
              result.add(key, task);
            }
          } else {
            result.add(key, ...folderTasks.set.tasks);
          }
          const unUsedConfigurationsAsArray = Array.from(unUsedConfigurations);
          const unUsedConfigurationPromises = unUsedConfigurationsAsArray.map(async (value) => {
            const configuringTask = configurations.byIdentifier[value];
            if (filter?.type && filter.type !== configuringTask.configures.type) {
              return;
            }
            let requiredTaskProviderUnavailable = false;
            for (const [handle, provider] of this._providers) {
              const providerType = this._providerTypes.get(handle);
              if (configuringTask.type === providerType) {
                if (providerType && !this._isTaskProviderEnabled(providerType)) {
                  requiredTaskProviderUnavailable = true;
                  continue;
                }
                try {
                  const resolvedTask = await provider.resolveTask(configuringTask);
                  if (resolvedTask && resolvedTask._id === configuringTask._id) {
                    result.add(key, TaskConfig.createCustomTask(resolvedTask, configuringTask));
                    return;
                  }
                } catch (error) {
                }
              }
            }
            if (requiredTaskProviderUnavailable) {
              this._log(nls.localize(
                "TaskService.providerUnavailable",
                "Warning: {0} tasks are unavailable in the current environment.",
                configuringTask.configures.type
              ));
            } else if (!waitToActivate) {
              this._log(nls.localize(
                "TaskService.noConfiguration",
                "Error: The {0} task detection didn't contribute a task for the following configuration:\n{1}\nThe task will be ignored.",
                configuringTask.configures.type,
                JSON.stringify(configuringTask._source.config.element, void 0, 4)
              ));
            }
          });
          await Promise.all(unUsedConfigurationPromises);
        } else {
          result.add(key, ...folderTasks.set.tasks);
          result.add(key, ...contributed);
        }
      }
    });
  }
  _getLegacyTaskConfigurations(workspaceTasks) {
    let result;
    function getResult() {
      if (result) {
        return result;
      }
      result = /* @__PURE__ */ Object.create(null);
      return result;
    }
    for (const task of workspaceTasks.tasks) {
      if (CustomTask.is(task)) {
        const commandName = task.command && task.command.name;
        if (commandName === "gulp" || commandName === "grunt" || commandName === "jake") {
          const identifier = KeyedTaskIdentifier.create({
            type: commandName,
            task: task.configurationProperties.name
          });
          getResult()[identifier._key] = task;
        }
      }
    }
    return result;
  }
  async getWorkspaceTasks(runSource = TaskRunSource.User) {
    if (!await this._trust()) {
      return /* @__PURE__ */ new Map();
    }
    await raceTimeout(this._waitForAllSupportedExecutions, 2e3, () => {
      this._logService.warn("Timed out waiting for all supported executions");
    });
    await this._whenTaskSystemReady;
    if (this._workspaceTasksPromise) {
      return this._workspaceTasksPromise;
    }
    return this._updateWorkspaceTasks(runSource);
  }
  getTaskProblems(instanceId) {
    return this._taskSystem?.getTaskProblems(instanceId);
  }
  _updateWorkspaceTasks(runSource = TaskRunSource.User) {
    this._workspaceTasksPromise = this._computeWorkspaceTasks(runSource);
    return this._workspaceTasksPromise;
  }
  async _getAFolder() {
    let folder = this.workspaceFolders.length > 0 ? this.workspaceFolders[0] : void 0;
    if (!folder) {
      const userhome = await this._pathService.userHome();
      folder = new WorkspaceFolder({ uri: userhome, name: resources.basename(userhome), index: 0 });
    }
    return folder;
  }
  getTerminalsForTasks(task) {
    return this._taskSystem?.getTerminalsForTasks(task);
  }
  async _computeWorkspaceTasks(runSource = TaskRunSource.User) {
    const promises = [];
    for (const folder2 of this.workspaceFolders) {
      promises.push(this._computeWorkspaceFolderTasks(folder2, runSource));
    }
    const values = await Promise.all(promises);
    const result = /* @__PURE__ */ new Map();
    for (const value of values) {
      if (value) {
        result.set(value.workspaceFolder.uri.toString(), value);
      }
    }
    const folder = await this._getAFolder();
    if (this._contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
      const workspaceFileTasks = await this._computeWorkspaceFileTasks(folder, runSource);
      if (workspaceFileTasks && this._workspace && this._workspace.configuration) {
        result.set(this._workspace.configuration.toString(), workspaceFileTasks);
      }
    }
    const userTasks = await this._computeUserTasks(folder, runSource);
    if (userTasks) {
      result.set(USER_TASKS_GROUP_KEY, userTasks);
    }
    const hasAnyTasks = Array.from(result.values()).some(
      (folderResult) => folderResult.set?.tasks && folderResult.set.tasks.length > 0 || folderResult.configurations?.byIdentifier && Object.keys(folderResult.configurations.byIdentifier).length > 0
    );
    this._tasksAvailableState.set(hasAnyTasks);
    return result;
  }
  get _jsonTasksSupported() {
    return ShellExecutionSupportedContext.getValue(this._contextKeyService) === true && ProcessExecutionSupportedContext.getValue(this._contextKeyService) === true;
  }
  async _computeWorkspaceFolderTasks(workspaceFolder, runSource = TaskRunSource.User) {
    const workspaceFolderConfiguration = this._executionEngine === ExecutionEngine.Process ? await this._computeLegacyConfiguration(workspaceFolder) : await this._computeConfiguration(workspaceFolder);
    if (!workspaceFolderConfiguration || !workspaceFolderConfiguration.config || workspaceFolderConfiguration.hasErrors) {
      return Promise.resolve({ workspaceFolder, set: void 0, configurations: void 0, hasErrors: workspaceFolderConfiguration ? workspaceFolderConfiguration.hasErrors : false });
    }
    await ProblemMatcherRegistry.onReady();
    const taskSystemInfo = this._getTaskSystemInfo(workspaceFolder.uri.scheme);
    const problemReporter = new ProblemReporter(this._outputChannel);
    const problemReporterListener = problemReporter.onDidError((error) => this._showOutput(runSource, void 0, error));
    const parseResult = TaskConfig.parse(workspaceFolder, void 0, taskSystemInfo ? taskSystemInfo.platform : Platform.platform, workspaceFolderConfiguration.config, problemReporter, TaskConfig.TaskConfigSource.TasksJson, this._contextKeyService);
    problemReporterListener.dispose();
    let hasErrors = false;
    if (!parseResult.validationStatus.isOK() && parseResult.validationStatus.state !== ValidationState.Info) {
      hasErrors = true;
    }
    if (problemReporter.status.isFatal()) {
      problemReporter.fatal(nls.localize("TaskSystem.configurationErrors", "Error: the provided task configuration has validation errors and can't not be used. Please correct the errors first."));
      return { workspaceFolder, set: void 0, configurations: void 0, hasErrors };
    }
    let customizedTasks;
    if (parseResult.configured && parseResult.configured.length > 0) {
      customizedTasks = {
        byIdentifier: /* @__PURE__ */ Object.create(null)
      };
      for (const task of parseResult.configured) {
        customizedTasks.byIdentifier[task.configures._key] = task;
      }
    }
    if (!this._jsonTasksSupported && parseResult.custom.length > 0) {
      this._logService.warn("Custom workspace tasks are not supported.");
    }
    return { workspaceFolder, set: { tasks: this._jsonTasksSupported ? parseResult.custom : [] }, configurations: customizedTasks, hasErrors };
  }
  _testParseExternalConfig(config, location) {
    if (!config) {
      return { config: void 0, hasParseErrors: false };
    }
    const parseErrors = config.$parseErrors;
    if (parseErrors) {
      let isAffected = false;
      for (const parseError of parseErrors) {
        if (/tasks\.json$/.test(parseError)) {
          isAffected = true;
          break;
        }
      }
      if (isAffected) {
        this._log(nls.localize({ key: "TaskSystem.invalidTaskJsonOther", comment: ["Message notifies of an error in one of several places there is tasks related json, not necessarily in a file named tasks.json"] }, "Error: The content of the tasks json in {0} has syntax errors. Please correct them before executing a task.", location));
        this._showOutput(void 0, void 0, nls.localize({ key: "TaskSystem.invalidTaskJsonOther", comment: ["Message notifies of an error in one of several places there is tasks related json, not necessarily in a file named tasks.json"] }, "Error: The content of the tasks json in {0} has syntax errors. Please correct them before executing a task.", location));
        return { config, hasParseErrors: true };
      }
    }
    return { config, hasParseErrors: false };
  }
  _log(value, verbose) {
    if (!verbose || this._configurationService.getValue(TaskSettingId.VerboseLogging)) {
      this._outputChannel.append(value + "\n");
    }
  }
  async _computeWorkspaceFileTasks(workspaceFolder, runSource = TaskRunSource.User) {
    if (this._executionEngine === ExecutionEngine.Process) {
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    const workspaceFileConfig = this._getConfiguration(workspaceFolder, TaskSourceKind.WorkspaceFile);
    const configuration = this._testParseExternalConfig(workspaceFileConfig.config, nls.localize("TasksSystem.locationWorkspaceConfig", "workspace file"));
    const customizedTasks = {
      byIdentifier: /* @__PURE__ */ Object.create(null)
    };
    const custom = [];
    await this._computeTasksForSingleConfig(workspaceFolder, configuration.config, runSource, custom, customizedTasks.byIdentifier, TaskConfig.TaskConfigSource.WorkspaceFile);
    const engine = configuration.config ? TaskConfig.ExecutionEngine.from(configuration.config) : ExecutionEngine.Terminal;
    if (engine === ExecutionEngine.Process) {
      this._notificationService.warn(nls.localize("TaskSystem.versionWorkspaceFile", "Only tasks version 2.0.0 permitted in workspace configuration files."));
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    return { workspaceFolder, set: { tasks: custom }, configurations: customizedTasks, hasErrors: configuration.hasParseErrors };
  }
  async _computeUserTasks(workspaceFolder, runSource = TaskRunSource.User) {
    if (this._executionEngine === ExecutionEngine.Process) {
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    const userTasksConfig = this._getConfiguration(workspaceFolder, TaskSourceKind.User);
    const configuration = this._testParseExternalConfig(userTasksConfig.config, nls.localize("TasksSystem.locationUserConfig", "user settings"));
    const customizedTasks = {
      byIdentifier: /* @__PURE__ */ Object.create(null)
    };
    const custom = [];
    await this._computeTasksForSingleConfig(workspaceFolder, configuration.config, runSource, custom, customizedTasks.byIdentifier, TaskConfig.TaskConfigSource.User);
    const engine = configuration.config ? TaskConfig.ExecutionEngine.from(configuration.config) : ExecutionEngine.Terminal;
    if (engine === ExecutionEngine.Process) {
      this._notificationService.warn(nls.localize("TaskSystem.versionSettings", "Only tasks version 2.0.0 permitted in user settings."));
      return this._emptyWorkspaceTaskResults(workspaceFolder);
    }
    return { workspaceFolder, set: { tasks: custom }, configurations: customizedTasks, hasErrors: configuration.hasParseErrors };
  }
  _emptyWorkspaceTaskResults(workspaceFolder) {
    return { workspaceFolder, set: void 0, configurations: void 0, hasErrors: false };
  }
  async _computeTasksForSingleConfig(workspaceFolder, config, runSource, custom, customized, source, isRecentTask = false) {
    if (!config) {
      return false;
    } else if (!workspaceFolder) {
      this._logService.trace("TaskService.computeTasksForSingleConfig: no workspace folder for worskspace", this._workspace?.id);
      return false;
    }
    const taskSystemInfo = this._getTaskSystemInfo(workspaceFolder.uri.scheme);
    const problemReporter = new ProblemReporter(this._outputChannel);
    const parseResult = TaskConfig.parse(workspaceFolder, this._workspace, taskSystemInfo ? taskSystemInfo.platform : Platform.platform, config, problemReporter, source, this._contextKeyService, isRecentTask);
    let hasErrors = false;
    if (!parseResult.validationStatus.isOK() && parseResult.validationStatus.state !== ValidationState.Info) {
      this._showOutput(runSource);
      hasErrors = true;
    }
    if (problemReporter.status.isFatal()) {
      problemReporter.fatal(nls.localize("TaskSystem.configurationErrors", "Error: the provided task configuration has validation errors and can't not be used. Please correct the errors first."));
      return hasErrors;
    }
    if (parseResult.configured && parseResult.configured.length > 0) {
      for (const task of parseResult.configured) {
        customized[task.configures._key] = task;
      }
    }
    if (!this._jsonTasksSupported && parseResult.custom.length > 0) {
      this._logService.warn("Custom workspace tasks are not supported.");
    } else {
      for (const task of parseResult.custom) {
        custom.push(task);
      }
    }
    return hasErrors;
  }
  _computeConfiguration(workspaceFolder) {
    const { config, hasParseErrors } = this._getConfiguration(workspaceFolder);
    return Promise.resolve({ workspaceFolder, config, hasErrors: hasParseErrors });
  }
  _computeWorkspaceFolderSetup() {
    const workspaceFolders = [];
    const ignoredWorkspaceFolders = [];
    let executionEngine = ExecutionEngine.Terminal;
    let schemaVersion = JsonSchemaVersion.V2_0_0;
    let workspace;
    if (this._contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      const workspaceFolder = this._contextService.getWorkspace().folders[0];
      workspaceFolders.push(workspaceFolder);
      executionEngine = this._computeExecutionEngine(workspaceFolder);
      schemaVersion = this._computeJsonSchemaVersion(workspaceFolder);
    } else if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      workspace = this._contextService.getWorkspace();
      for (const workspaceFolder of this._contextService.getWorkspace().folders) {
        if (schemaVersion === this._computeJsonSchemaVersion(workspaceFolder)) {
          workspaceFolders.push(workspaceFolder);
        } else {
          ignoredWorkspaceFolders.push(workspaceFolder);
          this._log(nls.localize(
            "taskService.ignoringFolder",
            "Ignoring task configurations for workspace folder {0}. Multi folder workspace task support requires that all folders use task version 2.0.0",
            workspaceFolder.uri.fsPath
          ));
        }
      }
    }
    return [workspaceFolders, ignoredWorkspaceFolders, executionEngine, schemaVersion, workspace];
  }
  _computeExecutionEngine(workspaceFolder) {
    const { config } = this._getConfiguration(workspaceFolder);
    if (!config) {
      return ExecutionEngine._default;
    }
    return TaskConfig.ExecutionEngine.from(config);
  }
  _computeJsonSchemaVersion(workspaceFolder) {
    const { config } = this._getConfiguration(workspaceFolder);
    if (!config) {
      return JsonSchemaVersion.V2_0_0;
    }
    return TaskConfig.JsonSchemaVersion.from(config);
  }
  _getConfiguration(workspaceFolder, source) {
    let result;
    if (source !== TaskSourceKind.User && this._contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      result = void 0;
    } else {
      const wholeConfig = this._configurationService.inspect("tasks", { resource: workspaceFolder.uri });
      switch (source) {
        case TaskSourceKind.User: {
          if (wholeConfig.userValue !== wholeConfig.workspaceFolderValue) {
            result = Objects.deepClone(wholeConfig.userValue);
          }
          break;
        }
        case TaskSourceKind.Workspace:
          result = Objects.deepClone(wholeConfig.workspaceFolderValue);
          break;
        case TaskSourceKind.WorkspaceFile: {
          if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && wholeConfig.workspaceFolderValue !== wholeConfig.workspaceValue) {
            result = Objects.deepClone(wholeConfig.workspaceValue);
          }
          break;
        }
        default:
          result = Objects.deepClone(wholeConfig.workspaceFolderValue);
      }
    }
    if (!result) {
      return { config: void 0, hasParseErrors: false };
    }
    const parseErrors = result.$parseErrors;
    if (parseErrors) {
      let isAffected = false;
      for (const parseError of parseErrors) {
        if (/tasks\.json$/.test(parseError)) {
          isAffected = true;
          break;
        }
      }
      if (isAffected) {
        this._log(nls.localize("TaskSystem.invalidTaskJson", "Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task."));
        this._showOutput(void 0, void 0, nls.localize("TaskSystem.invalidTaskJson", "Error: The content of the tasks.json file has syntax errors. Please correct them before executing a task."));
        return { config: void 0, hasParseErrors: true };
      }
    }
    return { config: result, hasParseErrors: false };
  }
  inTerminal() {
    if (this._taskSystem) {
      return this._taskSystem instanceof TerminalTaskSystem;
    }
    return this._executionEngine === ExecutionEngine.Terminal;
  }
  configureAction() {
    const thisCapture = this;
    return new class extends Action {
      constructor() {
        super(ConfigureTaskAction.ID, ConfigureTaskAction.TEXT.value, void 0, true, () => {
          thisCapture._runConfigureTasks();
          return Promise.resolve(void 0);
        });
      }
    }();
  }
  _handleError(err) {
    let showOutput = true;
    if (err instanceof TaskError) {
      const buildError = err;
      const needsConfig = buildError.code === TaskErrors.NotConfigured || buildError.code === TaskErrors.NoBuildTask || buildError.code === TaskErrors.NoTestTask;
      const needsTerminate = buildError.code === TaskErrors.RunningTask;
      if (needsConfig || needsTerminate) {
        this._notificationService.prompt(buildError.severity, buildError.message, [{
          label: needsConfig ? ConfigureTaskAction.TEXT.value : nls.localize("TerminateAction.label", "Terminate Task"),
          run: () => {
            if (needsConfig) {
              this._runConfigureTasks();
            } else {
              this._runTerminateCommand();
            }
          }
        }]);
      } else {
        this._notificationService.notify({ severity: buildError.severity, message: buildError.message });
      }
    } else if (err instanceof Error) {
      const error = err;
      this._notificationService.error(error.message);
      showOutput = false;
    } else if (Types.isString(err)) {
      this._notificationService.error(err);
    } else {
      this._notificationService.error(nls.localize("TaskSystem.unknownError", "An error has occurred while running a task. See task log for details."));
    }
    if (showOutput) {
      this._showOutput(void 0, void 0, Types.isString(err) ? err : void 0);
    }
  }
  _showDetail() {
    return this._configurationService.getValue(QUICKOPEN_DETAIL_CONFIG);
  }
  async _createTaskQuickPickEntries(tasks, group = false, sort = false, selectedEntry, includeRecents = true) {
    let encounteredTasks = {};
    if (tasks === void 0 || tasks === null || tasks.length === 0) {
      return [];
    }
    const TaskQuickPickEntry = (task) => {
      const newEntry = { label: task._label, description: this.getTaskDescription(task), task, detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
      if (encounteredTasks[task._id]) {
        if (encounteredTasks[task._id].length === 1) {
          encounteredTasks[task._id][0].label += " (1)";
        }
        newEntry.label = newEntry.label + " (" + (encounteredTasks[task._id].length + 1).toString() + ")";
      } else {
        encounteredTasks[task._id] = [];
      }
      encounteredTasks[task._id].push(newEntry);
      return newEntry;
    };
    function fillEntries(entries2, tasks2, groupLabel) {
      if (tasks2.length) {
        entries2.push({ type: "separator", label: groupLabel });
      }
      for (const task of tasks2) {
        const entry = TaskQuickPickEntry(task);
        entry.buttons = [{ iconClass: ThemeIcon.asClassName(configureTaskIcon), tooltip: nls.localize("configureTask", "Configure Task") }];
        if (selectedEntry && task === selectedEntry.task) {
          entries2.unshift(selectedEntry);
        } else {
          entries2.push(entry);
        }
      }
    }
    let entries;
    if (group) {
      entries = [];
      if (tasks.length === 1) {
        entries.push(TaskQuickPickEntry(tasks[0]));
      } else {
        const recentlyUsedTasks = await this.getSavedTasks("historical");
        const recent = [];
        const recentSet = /* @__PURE__ */ new Set();
        let configured = [];
        let detected = [];
        const taskMap = /* @__PURE__ */ Object.create(null);
        tasks.forEach((task) => {
          const key = task.getCommonTaskId();
          if (key) {
            taskMap[key] = task;
          }
        });
        recentlyUsedTasks.reverse().forEach((recentTask) => {
          const key = recentTask.getCommonTaskId();
          if (key) {
            recentSet.add(key);
            const task = taskMap[key];
            if (task) {
              recent.push(task);
            }
          }
        });
        for (const task of tasks) {
          const key = task.getCommonTaskId();
          if (!key || !recentSet.has(key)) {
            if (task._source.kind === TaskSourceKind.Workspace || task._source.kind === TaskSourceKind.User) {
              configured.push(task);
            } else {
              detected.push(task);
            }
          }
        }
        const sorter = this.createSorter();
        if (includeRecents) {
          fillEntries(entries, recent, nls.localize("recentlyUsed", "recently used tasks"));
        }
        configured = configured.sort((a, b) => sorter.compare(a, b));
        fillEntries(entries, configured, nls.localize("configured", "configured tasks"));
        detected = detected.sort((a, b) => sorter.compare(a, b));
        fillEntries(entries, detected, nls.localize("detected", "detected tasks"));
      }
    } else {
      if (sort) {
        const sorter = this.createSorter();
        tasks = tasks.sort((a, b) => sorter.compare(a, b));
      }
      entries = tasks.map((task) => TaskQuickPickEntry(task));
    }
    encounteredTasks = {};
    return entries;
  }
  async _showTwoLevelQuickPick(placeHolder, defaultEntry, type, name) {
    const taskQuickPick = this._instantiationService.createInstance(TaskQuickPick);
    try {
      return await taskQuickPick.show(placeHolder, defaultEntry, type, name);
    } finally {
      taskQuickPick.dispose();
    }
  }
  async _showQuickPick(tasks, placeHolder, defaultEntry, group = false, sort = false, selectedEntry, additionalEntries, name) {
    const resolvedTasks = await tasks;
    const entries = await raceTimeout(this._createTaskQuickPickEntries(resolvedTasks, group, sort, selectedEntry), 200, () => void 0);
    if (!entries) {
      return void 0;
    }
    if (entries.length === 1 && this._configurationService.getValue(QUICKOPEN_SKIP_CONFIG)) {
      return entries[0];
    } else if (entries.length === 0 && defaultEntry) {
      entries.push(defaultEntry);
    } else if (entries.length > 1 && additionalEntries && additionalEntries.length > 0) {
      entries.push({ type: "separator", label: "" });
      entries.push(additionalEntries[0]);
    }
    return this._quickInputService.pick(
      entries,
      {
        value: name,
        placeHolder,
        matchOnDescription: true,
        onDidTriggerItemButton: (context) => {
          const task = context.item.task;
          this._quickInputService.cancel();
          if (ContributedTask.is(task)) {
            this.customize(task, void 0, true);
          } else if (CustomTask.is(task)) {
            this.openConfig(task);
          }
        }
      }
    );
  }
  _needsRecentTasksMigration() {
    return this.getRecentlyUsedTasksV1().size > 0 && this._getTasksFromStorage("historical").size === 0;
  }
  async _migrateRecentTasks(tasks) {
    if (!this._needsRecentTasksMigration()) {
      return;
    }
    const recentlyUsedTasks = this.getRecentlyUsedTasksV1();
    const taskMap = /* @__PURE__ */ Object.create(null);
    tasks.forEach((task) => {
      const key = task.getKey();
      if (key) {
        taskMap[key] = task;
      }
    });
    const reversed = [...recentlyUsedTasks.keys()].reverse();
    for (const key in reversed) {
      const task = taskMap[key];
      if (task) {
        await this._setRecentlyUsedTask(task);
      }
    }
    this._storageService.remove(AbstractTaskService.RecentlyUsedTasks_Key, StorageScope.WORKSPACE);
  }
  _showIgnoredFoldersMessage() {
    if (this.ignoredWorkspaceFolders.length === 0 || !this.showIgnoreMessage) {
      return Promise.resolve(void 0);
    }
    this._notificationService.prompt(
      Severity.Info,
      nls.localize("TaskService.ignoredFolder", "The following workspace folders are ignored since they use task version 0.1.0: {0}", this.ignoredWorkspaceFolders.map((f) => f.name).join(", ")),
      [{
        label: nls.localize("TaskService.notAgain", "Don't Show Again"),
        isSecondary: true,
        run: () => {
          this._storageService.store(AbstractTaskService.IgnoreTask010DonotShowAgain_key, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
          this._showIgnoreMessage = false;
        }
      }]
    );
    return Promise.resolve(void 0);
  }
  async _trust() {
    const context = this._contextKeyService.getContext(getActiveElement());
    if (ServerlessWebContext.getValue(this._contextKeyService) && !TaskExecutionSupportedContext?.evaluate(context)) {
      return false;
    }
    await this._workspaceTrustManagementService.workspaceTrustInitialized;
    if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      return await this._workspaceTrustRequestService.requestWorkspaceTrust(
        {
          message: nls.localize("TaskService.requestTrust", "Listing and running tasks requires that some of the files in this workspace be executed as code.")
        }
      ) === true;
    }
    return true;
  }
  async _runTaskCommand(filter) {
    if (!this._tasksReconnected) {
      return;
    }
    if (!filter) {
      return this._doRunTaskCommand();
    }
    const type = typeof filter === "string" ? void 0 : filter.type;
    const taskName = typeof filter === "string" ? filter : filter.task;
    const grouped = await this._getGroupedTasks({ type });
    const identifier = this._getTaskIdentifier(filter);
    const tasks = grouped.all();
    const resolver = this._createResolver(grouped);
    const folderURIs = this._contextService.getWorkspace().folders.map((folder) => folder.uri);
    if (this._contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      folderURIs.push(this._contextService.getWorkspace().configuration);
    }
    folderURIs.push(USER_TASKS_GROUP_KEY);
    if (identifier) {
      for (const uri of folderURIs) {
        const task = await resolver.resolve(uri, identifier);
        if (task) {
          this.run(task);
          return;
        }
      }
    }
    const exactMatchTask = !taskName ? void 0 : tasks.find((t) => t.configurationProperties.identifier === taskName);
    if (!exactMatchTask) {
      return this._doRunTaskCommand(tasks, type, taskName);
    }
    for (const uri of folderURIs) {
      const task = await resolver.resolve(uri, taskName);
      if (task) {
        await this.run(task, { attachProblemMatcher: true }, TaskRunSource.User);
        return;
      }
    }
  }
  _tasksAndGroupedTasks(filter) {
    if (!this._versionAndEngineCompatible(filter)) {
      return { tasks: Promise.resolve([]), grouped: Promise.resolve(new TaskMap()) };
    }
    const grouped = this._getGroupedTasks(filter);
    const tasks = grouped.then((map) => {
      if (!filter || !filter.type) {
        return map.all();
      }
      const result = [];
      map.forEach((tasks2) => {
        for (const task of tasks2) {
          if (ContributedTask.is(task) && task.defines.type === filter.type) {
            result.push(task);
          } else if (CustomTask.is(task)) {
            if (task.type === filter.type) {
              result.push(task);
            } else {
              const customizes = task.customizes();
              if (customizes && customizes.type === filter.type) {
                result.push(task);
              }
            }
          }
        }
      });
      return result;
    });
    return { tasks, grouped };
  }
  _doRunTaskCommand(tasks, type, name) {
    const pickThen = (task) => {
      if (task === void 0) {
        return;
      }
      if (task === null) {
        this._runConfigureTasks();
      } else {
        this.run(task, { attachProblemMatcher: true }, TaskRunSource.User).then(void 0, (reason) => {
        });
      }
    };
    const placeholder = nls.localize("TaskService.pickRunTask", "Select the task to run");
    this._showIgnoredFoldersMessage().then(() => {
      if (this._configurationService.getValue(USE_SLOW_PICKER)) {
        let taskResult = void 0;
        if (!tasks) {
          taskResult = this._tasksAndGroupedTasks();
        }
        this._showQuickPick(
          tasks ? tasks : taskResult.tasks,
          placeholder,
          {
            label: "$(plus) " + nls.localize("TaskService.noEntryToRun", "Configure a Task"),
            task: null
          },
          true,
          void 0,
          void 0,
          void 0,
          name
        ).then((entry) => {
          return pickThen(entry ? entry.task : void 0);
        });
      } else {
        this._showTwoLevelQuickPick(
          placeholder,
          {
            label: "$(plus) " + nls.localize("TaskService.noEntryToRun", "Configure a Task"),
            task: null
          },
          type,
          name
        ).then(pickThen);
      }
    });
  }
  async rerun(terminalInstanceId) {
    const task = await this._taskSystem?.getTaskForTerminal(terminalInstanceId);
    if (task) {
      this._restart(task);
    } else {
      this._reRunTaskCommand(true);
    }
  }
  _reRunTaskCommand(onlyRerun) {
    ProblemMatcherRegistry.onReady().then(() => {
      return this._editorService.saveAll({ reason: SaveReason.EXPLICIT }).then(() => {
        const executeResult = this._getTaskSystem().rerun();
        if (executeResult) {
          return this._handleExecuteResult(executeResult);
        } else {
          if (!onlyRerun && !this._taskRunningState.get()) {
            this._doRunTaskCommand();
          }
          return Promise.resolve(void 0);
        }
      });
    });
  }
  /**
   *
   * @param tasks - The tasks which need to be filtered
   * @param tasksInList - This tells splitPerGroupType to filter out globbed tasks (into defaults)
   * @returns
   */
  _getDefaultTasks(tasks, taskGlobsInList = false) {
    const defaults = [];
    for (const task of tasks.filter((t) => !!t.configurationProperties.group)) {
      if (taskGlobsInList && typeof task.configurationProperties.group.isDefault === "string") {
        defaults.push(task);
      } else if (!taskGlobsInList && task.configurationProperties.group.isDefault === true) {
        defaults.push(task);
      }
    }
    return defaults;
  }
  _runTaskGroupCommand(taskGroup, strings, configure, legacyCommand) {
    if (this.schemaVersion === JsonSchemaVersion.V0_1_0) {
      legacyCommand();
      return;
    }
    const options = {
      location: ProgressLocation.Window,
      title: strings.fetching
    };
    const promise = (async () => {
      async function runSingleTask(task, problemMatcherOptions, that) {
        that.run(task, problemMatcherOptions, TaskRunSource.User).then(void 0, (reason) => {
        });
      }
      const chooseAndRunTask = (tasks) => {
        this._showIgnoredFoldersMessage().then(() => {
          this._showQuickPick(
            tasks,
            strings.select,
            {
              label: strings.notFoundConfigure,
              task: null
            },
            true
          ).then((entry) => {
            const task = entry ? entry.task : void 0;
            if (task === void 0) {
              return;
            }
            if (task === null) {
              configure.apply(this);
              return;
            }
            runSingleTask(task, { attachProblemMatcher: true }, this);
          });
        });
      };
      let groupTasks = [];
      const { globGroupTasks, globTasksDetected } = await this._getGlobTasks(taskGroup._id);
      groupTasks = [...globGroupTasks];
      if (!globTasksDetected && groupTasks.length === 0) {
        groupTasks = await this._findWorkspaceTasksInGroup(taskGroup, true);
      }
      const handleMultipleTasks = (areGlobTasks) => {
        return this._getTasksForGroup(taskGroup).then((tasks) => {
          if (tasks.length > 0) {
            const defaults = this._getDefaultTasks(tasks, areGlobTasks);
            if (defaults.length === 1) {
              runSingleTask(defaults[0], void 0, this);
              return;
            } else if (defaults.length > 0) {
              tasks = defaults;
            }
          }
          chooseAndRunTask(tasks);
        });
      };
      const resolveTaskAndRun = (taskGroupTask) => {
        if (ConfiguringTask.is(taskGroupTask)) {
          this.tryResolveTask(taskGroupTask).then((resolvedTask) => {
            runSingleTask(resolvedTask, void 0, this);
          });
        } else {
          runSingleTask(taskGroupTask, void 0, this);
        }
      };
      if (groupTasks.length === 1) {
        return resolveTaskAndRun(groupTasks[0]);
      }
      if (globTasksDetected && groupTasks.length > 1) {
        return handleMultipleTasks(true);
      }
      if (!groupTasks.length) {
        groupTasks = await this._findWorkspaceTasksInGroup(taskGroup, true);
      }
      if (groupTasks.length === 1) {
        return resolveTaskAndRun(groupTasks[0]);
      }
      return handleMultipleTasks(false);
    })();
    this._progressService.withProgress(options, () => promise);
  }
  async _getGlobTasks(taskGroupId) {
    let globTasksDetected = false;
    const absoluteURI = EditorResourceAccessor.getOriginalUri(this._editorService.activeEditor);
    if (absoluteURI) {
      const workspaceFolder = this._contextService.getWorkspaceFolder(absoluteURI);
      if (workspaceFolder) {
        const configuredTasks = this._getConfiguration(workspaceFolder)?.config?.tasks;
        if (configuredTasks) {
          globTasksDetected = configuredTasks.filter((task) => task.group && typeof task.group !== "string" && typeof task.group.isDefault === "string").length > 0;
          if (globTasksDetected) {
            const relativePath = workspaceFolder?.uri ? resources.relativePath(workspaceFolder.uri, absoluteURI) ?? absoluteURI.path : absoluteURI.path;
            const globGroupTasks = await this._findWorkspaceTasks((task) => {
              const currentTaskGroup = task.configurationProperties.group;
              if (currentTaskGroup && typeof currentTaskGroup !== "string" && typeof currentTaskGroup.isDefault === "string") {
                return currentTaskGroup._id === taskGroupId && glob.match(currentTaskGroup.isDefault, relativePath, { ignoreCase: true });
              }
              globTasksDetected = false;
              return false;
            });
            return { globGroupTasks, globTasksDetected };
          }
        }
      }
    }
    return { globGroupTasks: [], globTasksDetected };
  }
  _runBuildCommand() {
    if (!this._tasksReconnected) {
      return;
    }
    return this._runTaskGroupCommand(TaskGroup.Build, {
      fetching: nls.localize("TaskService.fetchingBuildTasks", "Fetching build tasks..."),
      select: nls.localize("TaskService.pickBuildTask", "Select the build task to run"),
      notFoundConfigure: nls.localize("TaskService.noBuildTask", "No build task to run found. Configure Build Task...")
    }, this._runConfigureDefaultBuildTask, this._build);
  }
  _runTestCommand() {
    return this._runTaskGroupCommand(TaskGroup.Test, {
      fetching: nls.localize("TaskService.fetchingTestTasks", "Fetching test tasks..."),
      select: nls.localize("TaskService.pickTestTask", "Select the test task to run"),
      notFoundConfigure: nls.localize("TaskService.noTestTaskTerminal", "No test task to run found. Configure Tasks...")
    }, this._runConfigureDefaultTestTask, this._runTest);
  }
  _runTerminateCommand(arg) {
    if (arg === "terminateAll") {
      this._terminateAll();
      return;
    }
    const runQuickPick = (promise) => {
      this._showQuickPick(
        promise || this.getActiveTasks(),
        nls.localize("TaskService.taskToTerminate", "Select a task to terminate"),
        {
          label: nls.localize("TaskService.noTaskRunning", "No task is currently running"),
          task: void 0
        },
        false,
        true,
        void 0,
        [{
          label: nls.localize("TaskService.terminateAllRunningTasks", "All Running Tasks"),
          id: "terminateAll",
          task: void 0
        }]
      ).then((entry) => {
        if (entry && entry.id === "terminateAll") {
          this._terminateAll();
        }
        const task = entry ? entry.task : void 0;
        if (task === void 0 || task === null) {
          return;
        }
        this.terminate(task);
      });
    };
    if (this.inTerminal()) {
      const identifier = this._getTaskIdentifier(arg);
      let promise;
      if (identifier !== void 0) {
        promise = this.getActiveTasks();
        promise.then((tasks) => {
          for (const task of tasks) {
            if (task.matches(identifier)) {
              this.terminate(task);
              return;
            }
          }
          runQuickPick(promise);
        });
      } else {
        runQuickPick();
      }
    } else {
      this._isActive().then((active) => {
        if (active) {
          this._terminateAll().then((responses) => {
            const response = responses[0];
            if (response.success) {
              return;
            }
            if (response.code && response.code === TerminateResponseCode.ProcessNotFound) {
              this._notificationService.error(nls.localize("TerminateAction.noProcess", "The launched process doesn't exist anymore. If the task spawned background tasks exiting VS Code might result in orphaned processes."));
            } else {
              this._notificationService.error(nls.localize("TerminateAction.failed", "Failed to terminate running task"));
            }
          });
        }
      });
    }
  }
  async _runRestartTaskCommand(arg) {
    const activeTasks = await this.getActiveTasks();
    if (activeTasks.length === 1) {
      this._restart(activeTasks[0]);
      return;
    }
    if (this.inTerminal()) {
      const identifier = this._getTaskIdentifier(arg);
      if (identifier !== void 0) {
        for (const task of activeTasks) {
          if (task.matches(identifier)) {
            this._restart(task);
            return;
          }
        }
      }
      const entry = await this._showQuickPick(
        activeTasks,
        nls.localize("TaskService.taskToRestart", "Select the task to restart"),
        {
          label: nls.localize("TaskService.noTaskToRestart", "No task to restart"),
          task: null
        },
        false,
        true
      );
      if (entry && entry.task) {
        this._restart(entry.task);
      }
    } else {
      if (activeTasks.length > 0) {
        this._restart(activeTasks[0]);
      }
    }
  }
  async _runRerunAllRunningTasksCommand() {
    const activeTasks = await this.getActiveTasks();
    if (activeTasks.length === 0) {
      this._notificationService.info(nls.localize("TaskService.noRunningTasks", "No running tasks to restart"));
      return;
    }
    const restartPromises = activeTasks.map((task) => this._restart(task));
    await Promise.allSettled(restartPromises);
  }
  _getTaskIdentifier(filter) {
    let result = void 0;
    if (Types.isString(filter)) {
      result = filter;
    } else if (filter && Types.isString(filter.type)) {
      result = TaskDefinition.createTaskIdentifier(filter, console);
    }
    return result;
  }
  _configHasTasks(taskConfig) {
    return !!taskConfig && !!taskConfig.tasks && taskConfig.tasks.length > 0;
  }
  _openTaskFile(resource, taskSource) {
    let configFileCreated = false;
    this._fileService.stat(resource).then((stat) => stat, () => void 0).then(async (stat) => {
      const fileExists = !!stat;
      const configValue = this._configurationService.inspect("tasks", { resource });
      let tasksExistInFile;
      let target;
      switch (taskSource) {
        case TaskSourceKind.User:
          tasksExistInFile = this._configHasTasks(configValue.userValue);
          target = ConfigurationTarget.USER;
          break;
        case TaskSourceKind.WorkspaceFile:
          tasksExistInFile = this._configHasTasks(configValue.workspaceValue);
          target = ConfigurationTarget.WORKSPACE;
          break;
        default:
          tasksExistInFile = this._configHasTasks(configValue.workspaceFolderValue);
          target = ConfigurationTarget.WORKSPACE_FOLDER;
      }
      let content;
      if (!tasksExistInFile) {
        const pickTemplateResult = await this._quickInputService.pick(getTaskTemplates(), { placeHolder: nls.localize("TaskService.template", "Select a Task Template") });
        if (!pickTemplateResult) {
          return Promise.resolve(void 0);
        }
        content = pickTemplateResult.content;
        const editorConfig = this._configurationService.getValue();
        if (editorConfig.editor.insertSpaces) {
          content = content.replace(/(\n)(\t+)/g, (_, s1, s2) => s1 + " ".repeat(s2.length * editorConfig.editor.tabSize));
        }
        configFileCreated = true;
      }
      if (!fileExists && content) {
        return this._textFileService.create([{ resource, value: content }]).then((result) => {
          return result[0].resource;
        });
      } else if (fileExists && (tasksExistInFile || content)) {
        const statResource = stat?.resource;
        if (content && statResource) {
          this._configurationService.updateValue("tasks", json.parse(content), { resource: statResource }, target);
        }
        return statResource;
      }
      return void 0;
    }).then((resource2) => {
      if (!resource2) {
        return;
      }
      this._editorService.openEditor({
        resource: resource2,
        options: {
          pinned: configFileCreated
          // pin only if config file is created #8727
        }
      });
    });
  }
  _isTaskEntry(value) {
    const candidate = value;
    return candidate && !!candidate.task;
  }
  _isSettingEntry(value) {
    const candidate = value;
    return candidate && !!candidate.settingType;
  }
  _configureTask(task) {
    if (ContributedTask.is(task)) {
      this.customize(task, void 0, true);
    } else if (CustomTask.is(task)) {
      this.openConfig(task);
    } else if (ConfiguringTask.is(task)) {
    }
  }
  _handleSelection(selection) {
    if (!selection) {
      return;
    }
    if (this._isTaskEntry(selection)) {
      this._configureTask(selection.task);
    } else if (this._isSettingEntry(selection)) {
      const taskQuickPick = this._instantiationService.createInstance(TaskQuickPick);
      taskQuickPick.handleSettingOption(selection.settingType);
    } else if (selection.folder && this._contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
      this._openTaskFile(selection.folder.toResource(".vscode/tasks.json"), TaskSourceKind.Workspace);
    } else {
      const resource = this._getResourceForKind(TaskSourceKind.User);
      if (resource) {
        this._openTaskFile(resource, TaskSourceKind.User);
      }
    }
  }
  getTaskDescription(task) {
    let description;
    if (task._source.kind === TaskSourceKind.User) {
      description = nls.localize("taskQuickPick.userSettings", "User");
    } else if (task._source.kind === TaskSourceKind.WorkspaceFile) {
      description = task.getWorkspaceFileName();
    } else if (this.needsFolderQualification()) {
      const workspaceFolder = task.getWorkspaceFolder();
      if (workspaceFolder) {
        description = workspaceFolder.name;
      }
    }
    return description;
  }
  async _runConfigureTasks() {
    if (!await this._trust()) {
      return;
    }
    let taskPromise;
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      taskPromise = this._getGroupedTasks();
    } else {
      taskPromise = Promise.resolve(new TaskMap());
    }
    const stats = this._contextService.getWorkspace().folders.map((folder) => {
      return this._fileService.stat(folder.toResource(".vscode/tasks.json")).then((stat) => stat, () => void 0);
    });
    const createLabel = nls.localize("TaskService.createJsonFile", "Create tasks.json file from template");
    const openLabel = nls.localize("TaskService.openJsonFile", "Open tasks.json file");
    const tokenSource = new CancellationTokenSource();
    const cancellationToken = tokenSource.token;
    const entries = Promise.all(stats).then((stats2) => {
      return taskPromise.then((taskMap) => {
        const entries2 = [];
        let configuredCount = 0;
        let tasks = taskMap.all();
        if (tasks.length > 0) {
          tasks = tasks.sort((a, b) => a._label.localeCompare(b._label));
          for (const task of tasks) {
            const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task), task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
            TaskQuickPick.applyColorStyles(task, entry, this._themeService);
            entries2.push(entry);
            if (!ContributedTask.is(task)) {
              configuredCount++;
            }
          }
        }
        const needsCreateOrOpen = configuredCount === 0;
        if (needsCreateOrOpen || taskMap.get(USER_TASKS_GROUP_KEY).length === configuredCount) {
          const label = stats2[0] !== void 0 ? openLabel : createLabel;
          if (entries2.length) {
            entries2.push({ type: "separator" });
          }
          entries2.push({ label, folder: this._contextService.getWorkspace().folders[0] });
        }
        if (entries2.length === 1 && !needsCreateOrOpen) {
          tokenSource.cancel();
        }
        return entries2;
      });
    });
    const timeout = await Promise.race([new Promise((resolve) => {
      entries.then(() => resolve(false));
    }), new Promise((resolve) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        resolve(true);
      }, 200);
    })]);
    if (!timeout && (await entries).length === 1 && this._configurationService.getValue(QUICKOPEN_SKIP_CONFIG)) {
      const entry = (await entries)[0];
      if (entry.task) {
        this._handleSelection(entry);
        return;
      }
    }
    const entriesWithSettings = entries.then((resolvedEntries) => {
      resolvedEntries.push(...TaskQuickPick.allSettingEntries(this._configurationService));
      return resolvedEntries;
    });
    this._quickInputService.pick(
      entriesWithSettings,
      { placeHolder: nls.localize("TaskService.pickTask", "Select a task to configure") },
      cancellationToken
    ).then(async (selection) => {
      if (cancellationToken.isCancellationRequested) {
        const task = (await entries)[0];
        if (task.task) {
          selection = task;
        }
      }
      this._handleSelection(selection);
    });
  }
  _runConfigureDefaultBuildTask() {
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      this.tasks().then(((tasks) => {
        if (tasks.length === 0) {
          this._runConfigureTasks();
          return;
        }
        const entries = [];
        let selectedTask;
        let selectedEntry;
        this._showIgnoredFoldersMessage().then(async () => {
          const { globGroupTasks } = await this._getGlobTasks(TaskGroup.Build._id);
          let defaultTasks = globGroupTasks;
          if (!defaultTasks?.length) {
            defaultTasks = this._getDefaultTasks(tasks, false);
          }
          let defaultBuildTask;
          if (defaultTasks.length === 1) {
            const group = defaultTasks[0].configurationProperties.group;
            if (group) {
              if (typeof group === "string" && group === TaskGroup.Build._id) {
                defaultBuildTask = defaultTasks[0];
              } else {
                defaultBuildTask = defaultTasks[0];
              }
            }
          }
          for (const task of tasks) {
            if (task === defaultBuildTask) {
              const label = nls.localize("TaskService.defaultBuildTaskExists", "{0} is already marked as the default build task", TaskQuickPick.getTaskLabelWithIcon(task, task.getQualifiedLabel()));
              selectedTask = task;
              selectedEntry = { label, task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
              TaskQuickPick.applyColorStyles(task, selectedEntry, this._themeService);
            } else {
              const entry = { label: TaskQuickPick.getTaskLabelWithIcon(task), task, description: this.getTaskDescription(task), detail: this._showDetail() ? task.configurationProperties.detail : void 0 };
              TaskQuickPick.applyColorStyles(task, entry, this._themeService);
              entries.push(entry);
            }
          }
          if (selectedEntry) {
            entries.unshift(selectedEntry);
          }
          const tokenSource = new CancellationTokenSource();
          const cancellationToken = tokenSource.token;
          this._quickInputService.pick(
            entries,
            { placeHolder: nls.localize("TaskService.pickTask", "Select a task to configure") },
            cancellationToken
          ).then(async (entry) => {
            if (cancellationToken.isCancellationRequested) {
              const task2 = (await entries)[0];
              if (task2.task) {
                entry = task2;
              }
            }
            const task = entry && Object.hasOwn(entry, "task") ? entry.task : void 0;
            if (task === void 0 || task === null) {
              return;
            }
            if (task === selectedTask && CustomTask.is(task)) {
              this.openConfig(task);
            }
            if (!InMemoryTask.is(task)) {
              this.customize(task, { group: { kind: "build", isDefault: true } }, true).then(() => {
                if (selectedTask && task !== selectedTask && !InMemoryTask.is(selectedTask)) {
                  this.customize(selectedTask, { group: "build" }, false);
                }
              });
            }
          });
          this._quickInputService.pick(entries, {
            placeHolder: nls.localize("TaskService.pickDefaultBuildTask", "Select the task to be used as the default build task")
          }).then((entry) => {
            const task = entry && Object.hasOwn(entry, "task") ? entry.task : void 0;
            if (task === void 0 || task === null) {
              return;
            }
            if (task === selectedTask && CustomTask.is(task)) {
              this.openConfig(task);
            }
            if (!InMemoryTask.is(task)) {
              this.customize(task, { group: { kind: "build", isDefault: true } }, true).then(() => {
                if (selectedTask && task !== selectedTask && !InMemoryTask.is(selectedTask)) {
                  this.customize(selectedTask, { group: "build" }, false);
                }
              });
            }
          });
        });
      }));
    } else {
      this._runConfigureTasks();
    }
  }
  _runConfigureDefaultTestTask() {
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      this.tasks().then(((tasks) => {
        if (tasks.length === 0) {
          this._runConfigureTasks();
          return;
        }
        let selectedTask;
        let selectedEntry;
        for (const task of tasks) {
          const taskGroup = TaskGroup.from(task.configurationProperties.group);
          if (taskGroup && taskGroup.isDefault && taskGroup._id === TaskGroup.Test._id) {
            selectedTask = task;
            break;
          }
        }
        if (selectedTask) {
          selectedEntry = {
            label: nls.localize("TaskService.defaultTestTaskExists", "{0} is already marked as the default test task.", selectedTask.getQualifiedLabel()),
            task: selectedTask,
            detail: this._showDetail() ? selectedTask.configurationProperties.detail : void 0
          };
        }
        this._showIgnoredFoldersMessage().then(() => {
          this._showQuickPick(
            tasks,
            nls.localize("TaskService.pickDefaultTestTask", "Select the task to be used as the default test task"),
            void 0,
            true,
            false,
            selectedEntry
          ).then((entry) => {
            const task = entry && Object.hasOwn(entry, "task") ? entry.task : void 0;
            if (!task) {
              return;
            }
            if (task === selectedTask && CustomTask.is(task)) {
              this.openConfig(task);
            }
            if (!InMemoryTask.is(task)) {
              this.customize(task, { group: { kind: "test", isDefault: true } }, true).then(() => {
                if (selectedTask && task !== selectedTask && !InMemoryTask.is(selectedTask)) {
                  this.customize(selectedTask, { group: "test" }, false);
                }
              });
            }
          });
        });
      }));
    } else {
      this._runConfigureTasks();
    }
  }
  async runShowTasks() {
    const activeTasksPromise = this.getActiveTasks();
    const activeTasks = await activeTasksPromise;
    let group;
    if (activeTasks.length === 1) {
      this._taskSystem.revealTask(activeTasks[0]);
    } else if (activeTasks.length && activeTasks.every((task) => {
      if (InMemoryTask.is(task)) {
        return false;
      }
      if (!group) {
        group = task.command.presentation?.group;
      }
      return task.command.presentation?.group && task.command.presentation.group === group;
    })) {
      this._taskSystem.revealTask(activeTasks[0]);
    } else {
      this._showQuickPick(
        activeTasksPromise,
        nls.localize("TaskService.pickShowTask", "Select the task to show its output"),
        {
          label: nls.localize("TaskService.noTaskIsRunning", "No task is running"),
          task: null
        },
        false,
        true
      ).then((entry) => {
        const task = entry ? entry.task : void 0;
        if (task === void 0 || task === null) {
          return;
        }
        this._taskSystem.revealTask(task);
      });
    }
  }
  async _createTasksDotOld(folder) {
    const tasksFile = folder.toResource(".vscode/tasks.json");
    if (await this._fileService.exists(tasksFile)) {
      const oldFile = tasksFile.with({ path: `${tasksFile.path}.old` });
      await this._fileService.copy(tasksFile, oldFile, true);
      return [oldFile, tasksFile];
    }
    return void 0;
  }
  _upgradeTask(task, suppressTaskName, globalConfig) {
    if (!CustomTask.is(task)) {
      return;
    }
    const configElement = {
      label: task._label
    };
    const oldTaskTypes = /* @__PURE__ */ new Set(["gulp", "jake", "grunt"]);
    if (Types.isString(task.command.name) && oldTaskTypes.has(task.command.name)) {
      configElement.type = task.command.name;
      configElement.task = task.command.args[0];
    } else {
      if (task.command.runtime === RuntimeType.Shell) {
        configElement.type = RuntimeType.toString(RuntimeType.Shell);
      }
      if (task.command.name && !suppressTaskName && !globalConfig.windows?.command && !globalConfig.osx?.command && !globalConfig.linux?.command) {
        configElement.command = task.command.name;
      } else if (suppressTaskName) {
        configElement.command = task._source.config.element.command;
      }
      if (task.command.args && (!Array.isArray(task.command.args) || task.command.args.length > 0)) {
        if (!globalConfig.windows?.args && !globalConfig.osx?.args && !globalConfig.linux?.args) {
          configElement.args = task.command.args;
        } else {
          configElement.args = task._source.config.element.args;
        }
      }
    }
    if (task.configurationProperties.presentation) {
      configElement.presentation = task.configurationProperties.presentation;
    }
    if (task.configurationProperties.isBackground) {
      configElement.isBackground = task.configurationProperties.isBackground;
    }
    if (task.configurationProperties.problemMatchers) {
      configElement.problemMatcher = task._source.config.element.problemMatcher;
    }
    if (task.configurationProperties.group) {
      configElement.group = task.configurationProperties.group;
    }
    task._source.config.element = configElement;
    const tempTask = new CustomTask(task._id, task._source, task._label, task.type, task.command, task.hasDefinedMatchers, task.runOptions, task.configurationProperties);
    const configTask = this._createCustomizableTask(tempTask);
    if (configTask) {
      return configTask;
    }
    return;
  }
  async _upgrade() {
    if (this.schemaVersion === JsonSchemaVersion.V2_0_0) {
      return;
    }
    if (!this._workspaceTrustManagementService.isWorkspaceTrusted()) {
      this._register(Event.once(this._workspaceTrustManagementService.onDidChangeTrust)((isTrusted) => {
        if (isTrusted) {
          this._upgrade();
        }
      }));
      return;
    }
    const tasks = await this._getGroupedTasks();
    const fileDiffs = [];
    for (const folder of this.workspaceFolders) {
      const diff = await this._createTasksDotOld(folder);
      if (diff) {
        fileDiffs.push(diff);
      }
      if (!diff) {
        continue;
      }
      const configTasks = [];
      const suppressTaskName = !!this._configurationService.getValue(TasksSchemaProperties.SuppressTaskName, { resource: folder.uri });
      const globalConfig = {
        windows: this._configurationService.getValue(TasksSchemaProperties.Windows, { resource: folder.uri }),
        osx: this._configurationService.getValue(TasksSchemaProperties.Osx, { resource: folder.uri }),
        linux: this._configurationService.getValue(TasksSchemaProperties.Linux, { resource: folder.uri })
      };
      tasks.get(folder).forEach((task) => {
        const configTask = this._upgradeTask(task, suppressTaskName, globalConfig);
        if (configTask) {
          configTasks.push(configTask);
        }
      });
      this._taskSystem = void 0;
      this._workspaceTasksPromise = void 0;
      await this._writeConfiguration(folder, "tasks.tasks", configTasks);
      await this._writeConfiguration(folder, "tasks.version", "2.0.0");
      if (this._configurationService.getValue(TasksSchemaProperties.ShowOutput, { resource: folder.uri })) {
        await this._configurationService.updateValue(TasksSchemaProperties.ShowOutput, void 0, { resource: folder.uri });
      }
      if (this._configurationService.getValue(TasksSchemaProperties.IsShellCommand, { resource: folder.uri })) {
        await this._configurationService.updateValue(TasksSchemaProperties.IsShellCommand, void 0, { resource: folder.uri });
      }
      if (this._configurationService.getValue(TasksSchemaProperties.SuppressTaskName, { resource: folder.uri })) {
        await this._configurationService.updateValue(TasksSchemaProperties.SuppressTaskName, void 0, { resource: folder.uri });
      }
    }
    this._updateSetup();
    this._notificationService.prompt(
      Severity.Warning,
      fileDiffs.length === 1 ? nls.localize("taskService.upgradeVersion", "The deprecated tasks version 0.1.0 has been removed. Your tasks have been upgraded to version 2.0.0. Open the diff to review the upgrade.") : nls.localize("taskService.upgradeVersionPlural", "The deprecated tasks version 0.1.0 has been removed. Your tasks have been upgraded to version 2.0.0. Open the diffs to review the upgrade."),
      [{
        label: fileDiffs.length === 1 ? nls.localize("taskService.openDiff", "Open diff") : nls.localize("taskService.openDiffs", "Open diffs"),
        run: async () => {
          for (const upgrade of fileDiffs) {
            await this._editorService.openEditor({
              original: { resource: upgrade[0] },
              modified: { resource: upgrade[1] }
            });
          }
        }
      }]
    );
  }
};
// private static autoDetectTelemetryName: string = 'taskServer.autoDetect';
AbstractTaskService.RecentlyUsedTasks_Key = "workbench.tasks.recentlyUsedTasks";
AbstractTaskService.RecentlyUsedTasks_KeyV2 = "workbench.tasks.recentlyUsedTasks2";
AbstractTaskService.PersistentTasks_Key = "workbench.tasks.persistentTasks";
AbstractTaskService.IgnoreTask010DonotShowAgain_key = "workbench.tasks.ignoreTask010Shown";
AbstractTaskService.OutputChannelId = "tasks";
AbstractTaskService.OutputChannelLabel = nls.localize("tasks", "Tasks");
AbstractTaskService._nextHandle = 0;
AbstractTaskService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IMarkerService),
  __decorateParam(2, IOutputService),
  __decorateParam(3, IPaneCompositePartService),
  __decorateParam(4, IViewsService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IEditorService),
  __decorateParam(7, IFileService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ITextFileService),
  __decorateParam(11, IModelService),
  __decorateParam(12, IExtensionService),
  __decorateParam(13, IQuickInputService),
  __decorateParam(14, IConfigurationResolverService),
  __decorateParam(15, ITerminalService),
  __decorateParam(16, ITerminalGroupService),
  __decorateParam(17, IStorageService),
  __decorateParam(18, IProgressService),
  __decorateParam(19, IOpenerService),
  __decorateParam(20, IDialogService),
  __decorateParam(21, INotificationService),
  __decorateParam(22, IContextKeyService),
  __decorateParam(23, IWorkbenchEnvironmentService),
  __decorateParam(24, ITerminalProfileResolverService),
  __decorateParam(25, IPathService),
  __decorateParam(26, ITextModelService),
  __decorateParam(27, IPreferencesService),
  __decorateParam(28, IViewDescriptorService),
  __decorateParam(29, IWorkspaceTrustRequestService),
  __decorateParam(30, IWorkspaceTrustManagementService),
  __decorateParam(31, ILogService),
  __decorateParam(32, IThemeService),
  __decorateParam(33, ILifecycleService),
  __decorateParam(34, IRemoteAgentService),
  __decorateParam(35, IInstantiationService),
  __decorateParam(36, IChatService),
  __decorateParam(37, IChatAgentService),
  __decorateParam(38, IHostService)
], AbstractTaskService);
export {
  AbstractTaskService,
  ConfigureTaskAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rhc2tzL2Jyb3dzZXIvYWJzdHJhY3RUYXNrU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgKiBhcyBqc29uIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTFJVQ2FjaGUsIFRvdWNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCAqIGFzIE9iamVjdHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBWYWxpZGF0aW9uU3RhdGUsIFZhbGlkYXRpb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXJzZXJzLmpzJztcbmltcG9ydCAqIGFzIFBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRlcm1pbmF0ZVJlc3BvbnNlQ29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3Nlcy5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgKiBhcyBUeXBlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgVVVJRCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBJTWFya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzT3B0aW9ucywgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSU5hbWVkUHJvYmxlbU1hdGNoZXIsIFByb2JsZW1NYXRjaGVyUmVnaXN0cnkgfSBmcm9tICcuLi9jb21tb24vcHJvYmxlbU1hdGNoZXIuanMnO1xuXG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcblxuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuXG5pbXBvcnQgeyBJV29ya3NwYWNlLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIFdvcmtiZW5jaFN0YXRlLCBXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb25SZXNvbHZlci9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1hcmtlcnMgfSBmcm9tICcuLi8uLi9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcblxuaW1wb3J0IHsgSU91dHB1dENoYW5uZWwsIElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuXG5pbXBvcnQgeyBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuXG5pbXBvcnQgeyBDb21tYW5kU3RyaW5nLCBDb25maWd1cmluZ1Rhc2ssIENvbnRyaWJ1dGVkVGFzaywgQ3VzdG9tVGFzaywgRXhlY3V0aW9uRW5naW5lLCBJbk1lbW9yeVRhc2ssIEluc3RhbmNlUG9saWN5LCBJVGFza0NvbmZpZywgSVRhc2tFdmVudCwgSVRhc2tJZGVudGlmaWVyLCBJVGFza0luYWN0aXZlRXZlbnQsIElUYXNrUHJvY2Vzc0VuZGVkRXZlbnQsIElUYXNrU2V0LCBKc29uU2NoZW1hVmVyc2lvbiwgS2V5ZWRUYXNrSWRlbnRpZmllciwgUmVydW5BbGxSdW5uaW5nVGFza3NDb21tYW5kSWQsIFJ1bnRpbWVUeXBlLCBUYXNrLCBUQVNLX1JVTk5JTkdfU1RBVEUsIFRhc2tEZWZpbml0aW9uLCBUYXNrRXZlbnRLaW5kLCBUYXNrR3JvdXAsIFRhc2tSdW5Tb3VyY2UsIFRhc2tTZXR0aW5nSWQsIFRhc2tTb3J0ZXIsIFRhc2tTb3VyY2VLaW5kLCBUYXNrc1NjaGVtYVByb3BlcnRpZXMsIFVTRVJfVEFTS1NfR1JPVVBfS0VZIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ3VzdG9tRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dCwgSUN1c3RvbWl6YXRpb25Qcm9wZXJ0aWVzLCBJUHJvYmxlbU1hdGNoZXJSdW5PcHRpb25zLCBJVGFza0ZpbHRlciwgSVRhc2tQcm92aWRlciwgSVRhc2tTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdCwgUHJvY2Vzc0V4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQsIFNlcnZlcmxlc3NXZWJDb250ZXh0LCBTaGVsbEV4ZWN1dGlvblN1cHBvcnRlZENvbnRleHQsIFRhc2tDb21tYW5kc1JlZ2lzdGVyZWQsIFRhc2tFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LCBUYXNrc0F2YWlsYWJsZUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vdGFza1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRhc2tFeGVjdXRlUmVzdWx0LCBJVGFza1Jlc29sdmVyLCBJVGFza1N1bW1hcnksIElUYXNrU3lzdGVtLCBJVGFza1N5c3RlbUluZm8sIElUYXNrVGVybWluYXRlUmVzcG9uc2UsIFRhc2tFcnJvciwgVGFza0Vycm9ycywgVGFza0V4ZWN1dGVLaW5kLCBUcmlnZ2VycywgVmVyaWZpZWRUYXNrIH0gZnJvbSAnLi4vY29tbW9uL3Rhc2tTeXN0ZW0uanMnO1xuaW1wb3J0IHsgZ2V0VGVtcGxhdGVzIGFzIGdldFRhc2tUZW1wbGF0ZXMgfSBmcm9tICcuLi9jb21tb24vdGFza1RlbXBsYXRlcy5qcyc7XG5cbmltcG9ydCAqIGFzIFRhc2tDb25maWcgZnJvbSAnLi4vY29tbW9uL3Rhc2tDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsVGFza1N5c3RlbSB9IGZyb20gJy4vdGVybWluYWxUYXNrU3lzdGVtLmpzJztcblxuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrUGlja1NlcGFyYXRvciwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcblxuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVGFza0RlZmluaXRpb25SZWdpc3RyeSB9IGZyb20gJy4uL2NvbW1vbi90YXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmpzJztcblxuaW1wb3J0IHsgZ2V0QWN0aXZlRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyB0b0Zvcm1hdHRlZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25Gb3JtYXR0ZXIuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCwgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbEV4aXRSZWFzb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBWaXJ0dWFsV29ya3NwYWNlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTYXZlUmVhc29uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBTaHV0ZG93blJlYXNvbiwgU3RhcnR1cEtpbmQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ0hBVF9PUEVOX0FDVElPTl9JRCB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY29uZmlndXJlVGFza0ljb24sIGlzV29ya3NwYWNlRm9sZGVyLCBJVGFza1F1aWNrUGlja0VudHJ5LCBRVUlDS09QRU5fREVUQUlMX0NPTkZJRywgUVVJQ0tPUEVOX1NLSVBfQ09ORklHLCBUYXNrUXVpY2tQaWNrIH0gZnJvbSAnLi90YXNrUXVpY2tQaWNrLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEZvY3VzTW9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcblxuY29uc3QgUVVJQ0tPUEVOX0hJU1RPUllfTElNSVRfQ09ORklHID0gJ3Rhc2sucXVpY2tPcGVuLmhpc3RvcnknO1xuY29uc3QgUFJPQkxFTV9NQVRDSEVSX05FVkVSX0NPTkZJRyA9ICd0YXNrLnByb2JsZW1NYXRjaGVycy5uZXZlclByb21wdCc7XG5jb25zdCBVU0VfU0xPV19QSUNLRVIgPSAndGFzay5xdWlja09wZW4uc2hvd0FsbCc7XG5cbmNvbnN0IFRhc2tUZXJtaW5hbFR5cGUgPSAnVGFzayc7XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ29uZmlndXJlVGFza0FjdGlvbiB7XG5cdGV4cG9ydCBjb25zdCBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZVRhc2tSdW5uZXInO1xuXHRleHBvcnQgY29uc3QgVEVYVCA9IG5scy5sb2NhbGl6ZTIoJ0NvbmZpZ3VyZVRhc2tSdW5uZXJBY3Rpb24ubGFiZWwnLCBcIkNvbmZpZ3VyZSBUYXNrXCIpO1xufVxuXG5leHBvcnQgdHlwZSBUYXNrUXVpY2tQaWNrRW50cnlUeXBlID0gKElRdWlja1BpY2tJdGVtICYgeyB0YXNrOiBUYXNrIH0pIHwgKElRdWlja1BpY2tJdGVtICYgeyBmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfSkgfCAoSVF1aWNrUGlja0l0ZW0gJiB7IHNldHRpbmdUeXBlOiBzdHJpbmcgfSk7XG5cbmNsYXNzIFByb2JsZW1SZXBvcnRlciBpbXBsZW1lbnRzIFRhc2tDb25maWcuSVByb2JsZW1SZXBvcnRlciB7XG5cblx0cHJpdmF0ZSBfdmFsaWRhdGlvblN0YXR1czogVmFsaWRhdGlvblN0YXR1cztcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFcnJvcjogRW1pdHRlcjxzdHJpbmc+ID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRFcnJvcjogRXZlbnQ8c3RyaW5nPiA9IHRoaXMuX29uRGlkRXJyb3IuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfb3V0cHV0Q2hhbm5lbDogSU91dHB1dENoYW5uZWwpIHtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzID0gbmV3IFZhbGlkYXRpb25TdGF0dXMoKTtcblx0fVxuXG5cdHB1YmxpYyBpbmZvKG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbGlkYXRpb25TdGF0dXMuc3RhdGUgPSBWYWxpZGF0aW9uU3RhdGUuSW5mbztcblx0XHR0aGlzLl9vdXRwdXRDaGFubmVsLmFwcGVuZChtZXNzYWdlICsgJ1xcbicpO1xuXHR9XG5cblx0cHVibGljIHdhcm4obWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cy5zdGF0ZSA9IFZhbGlkYXRpb25TdGF0ZS5XYXJuaW5nO1xuXHRcdHRoaXMuX291dHB1dENoYW5uZWwuYXBwZW5kKG1lc3NhZ2UgKyAnXFxuJyk7XG5cdH1cblxuXHRwdWJsaWMgZXJyb3IobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdmFsaWRhdGlvblN0YXR1cy5zdGF0ZSA9IFZhbGlkYXRpb25TdGF0ZS5FcnJvcjtcblx0XHR0aGlzLl9vdXRwdXRDaGFubmVsLmFwcGVuZChtZXNzYWdlICsgJ1xcbicpO1xuXHRcdHRoaXMuX29uRGlkRXJyb3IuZmlyZShtZXNzYWdlKTtcblx0fVxuXG5cdHB1YmxpYyBmYXRhbChtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl92YWxpZGF0aW9uU3RhdHVzLnN0YXRlID0gVmFsaWRhdGlvblN0YXRlLkZhdGFsO1xuXHRcdHRoaXMuX291dHB1dENoYW5uZWwuYXBwZW5kKG1lc3NhZ2UgKyAnXFxuJyk7XG5cdFx0dGhpcy5fb25EaWRFcnJvci5maXJlKG1lc3NhZ2UpO1xuXHR9XG5cblx0cHVibGljIGdldCBzdGF0dXMoKTogVmFsaWRhdGlvblN0YXR1cyB7XG5cdFx0cmV0dXJuIHRoaXMuX3ZhbGlkYXRpb25TdGF0dXM7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvblJlc3VsdCB7XG5cdHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcjtcblx0Y29uZmlnOiBUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkO1xuXHRoYXNFcnJvcnM6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJQ29tbWFuZFVwZ3JhZGUge1xuXHRjb21tYW5kPzogc3RyaW5nO1xuXHRhcmdzPzogc3RyaW5nW107XG59XG5cbmNsYXNzIFRhc2tNYXAge1xuXHRwcml2YXRlIF9zdG9yZTogTWFwPHN0cmluZywgVGFza1tdPiA9IG5ldyBNYXAoKTtcblxuXHRwdWJsaWMgZm9yRWFjaChjYWxsYmFjazogKHZhbHVlOiBUYXNrW10sIGZvbGRlcjogc3RyaW5nKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RvcmUuZm9yRWFjaChjYWxsYmFjayk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldEtleSh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyIHwgc3RyaW5nKTogc3RyaW5nIHtcblx0XHRsZXQga2V5OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKFR5cGVzLmlzU3RyaW5nKHdvcmtzcGFjZUZvbGRlcikpIHtcblx0XHRcdGtleSA9IHdvcmtzcGFjZUZvbGRlcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdXJpOiBVUkkgfCBudWxsIHwgdW5kZWZpbmVkID0gaXNXb3Jrc3BhY2VGb2xkZXIod29ya3NwYWNlRm9sZGVyKSA/IHdvcmtzcGFjZUZvbGRlci51cmkgOiB3b3Jrc3BhY2VGb2xkZXIuY29uZmlndXJhdGlvbjtcblx0XHRcdGtleSA9IHVyaSA/IHVyaS50b1N0cmluZygpIDogJyc7XG5cdFx0fVxuXHRcdHJldHVybiBrZXk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0KHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZSB8IElXb3Jrc3BhY2VGb2xkZXIgfCBzdHJpbmcpOiBUYXNrW10ge1xuXHRcdGNvbnN0IGtleSA9IFRhc2tNYXAuZ2V0S2V5KHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0bGV0IHJlc3VsdDogVGFza1tdIHwgdW5kZWZpbmVkID0gdGhpcy5fc3RvcmUuZ2V0KGtleSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJlc3VsdCA9IFtdO1xuXHRcdFx0dGhpcy5fc3RvcmUuc2V0KGtleSwgcmVzdWx0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHB1YmxpYyBhZGQod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlIHwgSVdvcmtzcGFjZUZvbGRlciB8IHN0cmluZywgLi4udGFzazogVGFza1tdKTogdm9pZCB7XG5cdFx0Y29uc3Qga2V5ID0gVGFza01hcC5nZXRLZXkod29ya3NwYWNlRm9sZGVyKTtcblx0XHRsZXQgdmFsdWVzID0gdGhpcy5fc3RvcmUuZ2V0KGtleSk7XG5cdFx0aWYgKCF2YWx1ZXMpIHtcblx0XHRcdHZhbHVlcyA9IFtdO1xuXHRcdFx0dGhpcy5fc3RvcmUuc2V0KGtleSwgdmFsdWVzKTtcblx0XHR9XG5cdFx0dmFsdWVzLnB1c2goLi4udGFzayk7XG5cdH1cblxuXHRwdWJsaWMgYWxsKCk6IFRhc2tbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBUYXNrW10gPSBbXTtcblx0XHR0aGlzLl9zdG9yZS5mb3JFYWNoKCh2YWx1ZXMpID0+IHJlc3VsdC5wdXNoKC4uLnZhbHVlcykpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VGFza1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRhc2tTZXJ2aWNlIHtcblxuXHQvLyBwcml2YXRlIHN0YXRpYyBhdXRvRGV0ZWN0VGVsZW1ldHJ5TmFtZTogc3RyaW5nID0gJ3Rhc2tTZXJ2ZXIuYXV0b0RldGVjdCc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFJlY2VudGx5VXNlZFRhc2tzX0tleSA9ICd3b3JrYmVuY2gudGFza3MucmVjZW50bHlVc2VkVGFza3MnO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBSZWNlbnRseVVzZWRUYXNrc19LZXlWMiA9ICd3b3JrYmVuY2gudGFza3MucmVjZW50bHlVc2VkVGFza3MyJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUGVyc2lzdGVudFRhc2tzX0tleSA9ICd3b3JrYmVuY2gudGFza3MucGVyc2lzdGVudFRhc2tzJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSWdub3JlVGFzazAxMERvbm90U2hvd0FnYWluX2tleSA9ICd3b3JrYmVuY2gudGFza3MuaWdub3JlVGFzazAxMFNob3duJztcblxuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRwdWJsaWMgc3RhdGljIE91dHB1dENoYW5uZWxJZDogc3RyaW5nID0gJ3Rhc2tzJztcblx0cHVibGljIHN0YXRpYyBPdXRwdXRDaGFubmVsTGFiZWw6IHN0cmluZyA9IG5scy5sb2NhbGl6ZSgndGFza3MnLCBcIlRhc2tzXCIpO1xuXG5cdHByaXZhdGUgc3RhdGljIF9uZXh0SGFuZGxlOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgX3Rhc2tzUmVjb25uZWN0ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfc2NoZW1hVmVyc2lvbjogSnNvblNjaGVtYVZlcnNpb24gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2V4ZWN1dGlvbkVuZ2luZTogRXhlY3V0aW9uRW5naW5lIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF93b3Jrc3BhY2VGb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dvcmtzcGFjZTogSVdvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaWdub3JlZFdvcmtzcGFjZUZvbGRlcnM6IElXb3Jrc3BhY2VGb2xkZXJbXSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfc2hvd0lnbm9yZU1lc3NhZ2U/OiBib29sZWFuO1xuXHRwcml2YXRlIF9wcm92aWRlcnM6IE1hcDxudW1iZXIsIElUYXNrUHJvdmlkZXI+O1xuXHRwcml2YXRlIF9wcm92aWRlclR5cGVzOiBNYXA8bnVtYmVyLCBzdHJpbmc+O1xuXHRwcm90ZWN0ZWQgX3Rhc2tTeXN0ZW1JbmZvczogTWFwPHN0cmluZywgSVRhc2tTeXN0ZW1JbmZvW10+O1xuXG5cdHByb3RlY3RlZCBfd29ya3NwYWNlVGFza3NQcm9taXNlPzogUHJvbWlzZTxNYXA8c3RyaW5nLCBJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdD4+O1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX3doZW5UYXNrU3lzdGVtUmVhZHk6IFByb21pc2U8dm9pZD47XG5cblx0cHJvdGVjdGVkIF90YXNrU3lzdGVtPzogSVRhc2tTeXN0ZW07XG5cdHByb3RlY3RlZCBfdGFza1N5c3RlbUxpc3RlbmVycz86IElEaXNwb3NhYmxlW10gPSBbXTtcblx0cHJpdmF0ZSBfcmVjZW50bHlVc2VkVGFza3NWMTogTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZWNlbnRseVVzZWRUYXNrczogTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3BlcnNpc3RlbnRUYXNrczogTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXG5cdHByb3RlY3RlZCBfdGFza1J1bm5pbmdTdGF0ZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByb3RlY3RlZCBfdGFza3NBdmFpbGFibGVTdGF0ZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJvdGVjdGVkIF9vdXRwdXRDaGFubmVsOiBJT3V0cHV0Q2hhbm5lbDtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFN0YXRlQ2hhbmdlOiBFbWl0dGVyPElUYXNrRXZlbnQ+O1xuXHRwcml2YXRlIF93YWl0Rm9yQWxsU3VwcG9ydGVkRXhlY3V0aW9uczogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBfb25EaWRSZWdpc3RlclN1cHBvcnRlZEV4ZWN1dGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSBfb25EaWRSZWdpc3RlckFsbFN1cHBvcnRlZEV4ZWN1dGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VUYXNrU3lzdGVtSW5mbyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwcml2YXRlIF93aWxsUmVzdGFydDogYm9vbGVhbiA9IGZhbHNlO1xuXHRwdWJsaWMgb25EaWRDaGFuZ2VUYXNrU3lzdGVtSW5mbyA9IHRoaXMuX29uRGlkQ2hhbmdlVGFza1N5c3RlbUluZm8uZXZlbnQ7XG5cdHByaXZhdGUgX29uRGlkUmVjb25uZWN0VG9UYXNrcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgb25EaWRSZWNvbm5lY3RUb1Rhc2tzID0gdGhpcy5fb25EaWRSZWNvbm5lY3RUb1Rhc2tzLmV2ZW50O1xuXHRwcml2YXRlIF9vbkRpZENoYW5nZVRhc2tDb25maWcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIG9uRGlkQ2hhbmdlVGFza0NvbmZpZyA9IHRoaXMuX29uRGlkQ2hhbmdlVGFza0NvbmZpZy5ldmVudDtcblx0cHVibGljIGdldCBpc1JlY29ubmVjdGVkKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fdGFza3NSZWNvbm5lY3RlZDsgfVxuXHRwcml2YXRlIF9vbkRpZENoYW5nZVRhc2tQcm92aWRlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIG9uRGlkQ2hhbmdlVGFza1Byb3ZpZGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlVGFza1Byb3ZpZGVycy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFza1J1blN0YXJ0VGltZXMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90YXNrUnVuU291cmNlcyA9IG5ldyBNYXA8c3RyaW5nLCBUYXNrUnVuU291cmNlPigpO1xuXG5cdHByaXZhdGUgX2FjdGl2YXRlZFRhc2tQcm92aWRlcnM6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdG9hc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASU91dHB1dFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9vdXRwdXRTZXJ2aWNlOiBJT3V0cHV0U2VydmljZSxcblx0XHRASVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYW5lQ29tcG9zaXRlU2VydmljZTogSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgX2RpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGF0aFNlcnZpY2U6IElQYXRoU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3doZW5UYXNrU3lzdGVtUmVhZHkgPSBFdmVudC50b1Byb21pc2UodGhpcy5vbkRpZENoYW5nZVRhc2tTeXN0ZW1JbmZvKTtcblx0XHR0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fdGFza1N5c3RlbSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90YXNrU3lzdGVtTGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX291dHB1dENoYW5uZWwgPSB0aGlzLl9vdXRwdXRTZXJ2aWNlLmdldENoYW5uZWwoQWJzdHJhY3RUYXNrU2VydmljZS5PdXRwdXRDaGFubmVsSWQpITtcblx0XHR0aGlzLl9wcm92aWRlcnMgPSBuZXcgTWFwPG51bWJlciwgSVRhc2tQcm92aWRlcj4oKTtcblx0XHR0aGlzLl9wcm92aWRlclR5cGVzID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblx0XHR0aGlzLl90YXNrU3lzdGVtSW5mb3MgPSBuZXcgTWFwPHN0cmluZywgSVRhc2tTeXN0ZW1JbmZvW10+KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHtcblx0XHRcdGNvbnN0IGZvbGRlclNldHVwID0gdGhpcy5fY29tcHV0ZVdvcmtzcGFjZUZvbGRlclNldHVwKCk7XG5cdFx0XHRpZiAodGhpcy5leGVjdXRpb25FbmdpbmUgIT09IGZvbGRlclNldHVwWzJdKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VUYXNrU3lzdGVtTGlzdGVuZXJzKCk7XG5cdFx0XHRcdHRoaXMuX3Rhc2tTeXN0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl91cGRhdGVTZXR1cChmb2xkZXJTZXR1cCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdXBkYXRlV29ya3NwYWNlVGFza3MoVGFza1J1blNvdXJjZS5Gb2xkZXJPcGVuKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGFzeW5jIChlKSA9PiB7XG5cdFx0XHRpZiAoIWUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Rhc2tzJykgfHwgKCF0aGlzLl90YXNrU3lzdGVtICYmICF0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2UpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl90YXNrU3lzdGVtIHx8IHRoaXMuX3Rhc2tTeXN0ZW0gaW5zdGFuY2VvZiBUZXJtaW5hbFRhc2tTeXN0ZW0pIHtcblx0XHRcdFx0dGhpcy5fb3V0cHV0Q2hhbm5lbC5jbGVhcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUYXNrU2V0dGluZ0lkLlJlY29ubmVjdGlvbikpIHtcblx0XHRcdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrU2V0dGluZ0lkLlJlY29ubmVjdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLl9wZXJzaXN0ZW50VGFza3M/LmNsZWFyKCk7XG5cdFx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFic3RyYWN0VGFza1NlcnZpY2UuUGVyc2lzdGVudFRhc2tzX0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2V0VGFza0xSVUNhY2hlTGltaXQoKTtcblx0XHRcdGNvbnN0IG1hcFN0cmluZ1RvRm9sZGVyVGFza3M6IE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0PiA9IGF3YWl0IHRoaXMuX3VwZGF0ZVdvcmtzcGFjZVRhc2tzKFRhc2tSdW5Tb3VyY2UuQ29uZmlndXJhdGlvbkNoYW5nZSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRhc2tDb25maWcuZmlyZSgpO1xuXG5cdFx0XHQvLyBMb29wIHRocm91Z2ggYWxsIHdvcmtzcGFjZUZvbGRlclRhc2sgcmVzdWx0XG5cdFx0XHRmb3IgKGNvbnN0IFtmb2xkZXJVcmksIGZvbGRlclJlc3VsdF0gb2YgbWFwU3RyaW5nVG9Gb2xkZXJUYXNrcykge1xuXHRcdFx0XHRpZiAoIWZvbGRlclJlc3VsdC5zZXQ/LnRhc2tzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBmb2xkZXJSZXN1bHQuc2V0LnRhc2tzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVhbFVuaXF1ZUlkID0gdGFzay5faWQ7XG5cdFx0XHRcdFx0Y29uc3QgbGFzdFRhc2sgPSB0aGlzLl90YXNrU3lzdGVtPy5sYXN0VGFzaz8udGFzay5faWQ7XG5cblx0XHRcdFx0XHRpZiAobGFzdFRhc2sgJiYgbGFzdFRhc2sgPT09IHJlYWxVbmlxdWVJZCAmJiBmb2xkZXJVcmkgIT09ICdzZXR0aW5nJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmVyaWZpZWRMYXN0VGFzayA9IG5ldyBWZXJpZmllZFRhc2sodGFzaywgdGhpcy5fdGFza1N5c3RlbSEubGFzdFRhc2shLnJlc29sdmVyLCBUcmlnZ2Vycy5jb21tYW5kKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Rhc2tTeXN0ZW0hLmxhc3RUYXNrID0gdmVyaWZpZWRMYXN0VGFzaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH0pKTtcblx0XHR0aGlzLl90YXNrUnVubmluZ1N0YXRlID0gVEFTS19SVU5OSU5HX1NUQVRFLmJpbmRUbyhfY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Rhc2tzQXZhaWxhYmxlU3RhdGUgPSBUYXNrc0F2YWlsYWJsZUNvbnRleHQuYmluZFRvKF9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fb25EaWRTdGF0ZUNoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyQ29tbWFuZHMoKS50aGVuKCgpID0+IFRhc2tDb21tYW5kc1JlZ2lzdGVyZWQuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSkpO1xuXHRcdFNlcnZlcmxlc3NXZWJDb250ZXh0LmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkuc2V0KFBsYXRmb3JtLmlzV2ViICYmICFyZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UuY29udHJpYnV0ZVZhcmlhYmxlKCdkZWZhdWx0QnVpbGRUYXNrJywgYXN5bmMgKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHQvLyBkZWxheSBwcm92aWRlciBhY3RpdmF0aW9uLCB3ZSBtaWdodCBmaW5kIGEgc2luZ2xlIGRlZmF1bHQgYnVpbGQgdGFzayBpbiB0aGUgdGFza3MuanNvbiBmaWxlXG5cdFx0XHRsZXQgdGFza3MgPSBhd2FpdCB0aGlzLl9nZXRUYXNrc0Zvckdyb3VwKFRhc2tHcm91cC5CdWlsZCwgdHJ1ZSk7XG5cdFx0XHRpZiAodGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0cyA9IHRoaXMuX2dldERlZmF1bHRUYXNrcyh0YXNrcyk7XG5cdFx0XHRcdGlmIChkZWZhdWx0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRyZXR1cm4gZGVmYXVsdHNbMF0uX2xhYmVsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBhY3RpdmF0ZSBhbGwgcHJvdmlkZXJzLCB3ZSBoYXZlbid0IGZvdW5kIHRoZSBkZWZhdWx0IGJ1aWxkIHRhc2sgaW4gdGhlIHRhc2tzLmpzb24gZmlsZVxuXHRcdFx0dGFza3MgPSBhd2FpdCB0aGlzLl9nZXRUYXNrc0Zvckdyb3VwKFRhc2tHcm91cC5CdWlsZCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0cyA9IHRoaXMuX2dldERlZmF1bHRUYXNrcyh0YXNrcyk7XG5cdFx0XHRpZiAoZGVmYXVsdHMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiBkZWZhdWx0c1swXS5fbGFiZWw7XG5cdFx0XHR9IGVsc2UgaWYgKGRlZmF1bHRzLmxlbmd0aCkge1xuXHRcdFx0XHR0YXNrcyA9IGRlZmF1bHRzO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgZW50cnk6IElUYXNrUXVpY2tQaWNrRW50cnkgfCBudWxsIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRhc2tzICYmIHRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZW50cnkgPSBhd2FpdCB0aGlzLl9zaG93UXVpY2tQaWNrKHRhc2tzLCBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnBpY2tCdWlsZFRhc2tGb3JMYWJlbCcsICdTZWxlY3QgdGhlIGJ1aWxkIHRhc2sgKHRoZXJlIGlzIG5vIGRlZmF1bHQgYnVpbGQgdGFzayBkZWZpbmVkKScpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFzazogVGFzayB8IHVuZGVmaW5lZCB8IG51bGwgPSBlbnRyeSA/IGVudHJ5LnRhc2sgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIXRhc2spIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0YXNrLl9sYWJlbDtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLm9uQmVmb3JlU2h1dGRvd24oZSA9PiB7XG5cdFx0XHR0aGlzLl93aWxsUmVzdGFydCA9IGUucmVhc29uICE9PSBTaHV0ZG93blJlYXNvbi5SRUxPQUQ7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRTdGF0ZUNoYW5nZShhc3luYyBlID0+IHtcblx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3Rhc2tFdmVudCcsICdUYXNrIEV2ZW50IGtpbmQ6IHswfScsIGUua2luZCksIHRydWUpO1xuXHRcdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBUYXNrRXZlbnRLaW5kLlN0YXJ0OlxuXHRcdFx0XHRcdHRoaXMuX3Rhc2tSdW5TdGFydFRpbWVzLnNldChlLnRhc2tJZCwgRGF0ZS5ub3coKSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGFza0V2ZW50S2luZC5Qcm9jZXNzRW5kZWQ6IHtcblx0XHRcdFx0XHRjb25zdCBwcm9jZXNzRW5kZWRFdmVudCA9IGUgYXMgSVRhc2tQcm9jZXNzRW5kZWRFdmVudDtcblx0XHRcdFx0XHRjb25zdCBzdGFydFRpbWUgPSB0aGlzLl90YXNrUnVuU3RhcnRUaW1lcy5nZXQoZS50YXNrSWQpO1xuXHRcdFx0XHRcdGlmICghc3RhcnRUaW1lKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZHVyYXRpb25NcyA9IHByb2Nlc3NFbmRlZEV2ZW50LmR1cmF0aW9uTXMgPz8gKERhdGUubm93KCkgLSBzdGFydFRpbWUpO1xuXHRcdFx0XHRcdGlmIChkdXJhdGlvbk1zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2hhbmRsZUxvbmdSdW5uaW5nVGFza0NvbXBsZXRpb24ocHJvY2Vzc0VuZGVkRXZlbnQsIGR1cmF0aW9uTXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl90YXNrUnVuU3RhcnRUaW1lcy5kZWxldGUoZS50YXNrSWQpO1xuXHRcdFx0XHRcdHRoaXMuX3Rhc2tSdW5Tb3VyY2VzLmRlbGV0ZShlLnRhc2tJZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBUYXNrRXZlbnRLaW5kLkluYWN0aXZlOiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvY2Vzc0VuZGVkRXZlbnQgPSBlIGFzIElUYXNrSW5hY3RpdmVFdmVudDtcblx0XHRcdFx0XHRjb25zdCBzdGFydFRpbWUgPSB0aGlzLl90YXNrUnVuU3RhcnRUaW1lcy5nZXQoZS50YXNrSWQpO1xuXHRcdFx0XHRcdGlmICghc3RhcnRUaW1lKSB7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZHVyYXRpb25NcyA9IHByb2Nlc3NFbmRlZEV2ZW50LmR1cmF0aW9uTXMgPz8gKERhdGUubm93KCkgLSBzdGFydFRpbWUpO1xuXHRcdFx0XHRcdGlmIChkdXJhdGlvbk1zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2hhbmRsZUxvbmdSdW5uaW5nVGFza0NvbXBsZXRpb24ocHJvY2Vzc0VuZGVkRXZlbnQsIGR1cmF0aW9uTXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl90YXNrUnVuU3RhcnRUaW1lcy5kZWxldGUoZS50YXNrSWQpO1xuXHRcdFx0XHRcdHRoaXMuX3Rhc2tSdW5Tb3VyY2VzLmRlbGV0ZShlLnRhc2tJZCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBUYXNrRXZlbnRLaW5kLlRlcm1pbmF0ZWQ6XG5cdFx0XHRcdFx0dGhpcy5fdGFza1J1blN0YXJ0VGltZXMuZGVsZXRlKGUudGFza0lkKTtcblx0XHRcdFx0XHR0aGlzLl90YXNrUnVuU291cmNlcy5kZWxldGUoZS50YXNrSWQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUua2luZCA9PT0gVGFza0V2ZW50S2luZC5DaGFuZ2VkKSB7XG5cdFx0XHRcdC8vIG5vLW9wXG5cdFx0XHR9IGVsc2UgaWYgKCh0aGlzLl93aWxsUmVzdGFydCB8fCAoZS5raW5kID09PSBUYXNrRXZlbnRLaW5kLlRlcm1pbmF0ZWQgJiYgZS5leGl0UmVhc29uID09PSBUZXJtaW5hbEV4aXRSZWFzb24uVXNlcikpICYmIGUudGFza0lkKSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IGUuX190YXNrLmdldEtleSgpO1xuXHRcdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdFx0dGhpcy5yZW1vdmVQZXJzaXN0ZW50VGFzayhrZXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGUua2luZCA9PT0gVGFza0V2ZW50S2luZC5TdGFydCAmJiBlLl9fdGFzayAmJiBlLl9fdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKSkge1xuXHRcdFx0XHR0aGlzLl9zZXRQZXJzaXN0ZW50VGFzayhlLl9fdGFzayk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3dhaXRGb3JBbGxTdXBwb3J0ZWRFeGVjdXRpb25zID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRFdmVudC5vbmNlKHRoaXMuX29uRGlkUmVnaXN0ZXJBbGxTdXBwb3J0ZWRFeGVjdXRpb25zLmV2ZW50KSgoKSA9PiByZXNvbHZlKCkpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLndoZW5Db25uZWN0ZWQudGhlbigoKSA9PiB7XG5cdFx0XHRjb25zdCByZWNvbm5lY3RlZEluc3RhbmNlcyA9IHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMuZmlsdGVyKGUgPT4gZS5yZWNvbm5lY3Rpb25Qcm9wZXJ0aWVzPy5vd25lcklkID09PSBUYXNrVGVybWluYWxUeXBlKTtcblx0XHRcdGlmIChyZWNvbm5lY3RlZEluc3RhbmNlcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fYXR0ZW1wdFRhc2tSZWNvbm5lY3Rpb24oKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX3Rhc2tzUmVjb25uZWN0ZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLl9vbkRpZFJlY29ubmVjdFRvVGFza3MuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5fdXBncmFkZSgpO1xuXHR9XG5cblx0cHVibGljIHJlZ2lzdGVyU3VwcG9ydGVkRXhlY3V0aW9ucyhjdXN0b20/OiBib29sZWFuLCBzaGVsbD86IGJvb2xlYW4sIHByb2Nlc3M/OiBib29sZWFuKSB7XG5cdFx0aWYgKGN1c3RvbSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBjdXN0b21Db250ZXh0ID0gQ3VzdG9tRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0Y3VzdG9tQ29udGV4dC5zZXQoY3VzdG9tKTtcblx0XHR9XG5cdFx0Y29uc3QgaXNWaXJ0dWFsID0gISFWaXJ0dWFsV29ya3NwYWNlQ29udGV4dC5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0aWYgKHNoZWxsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHNoZWxsQ29udGV4dCA9IFNoZWxsRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0c2hlbGxDb250ZXh0LnNldChzaGVsbCAmJiAhaXNWaXJ0dWFsKTtcblx0XHR9XG5cdFx0aWYgKHByb2Nlc3MgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgcHJvY2Vzc0NvbnRleHQgPSBQcm9jZXNzRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0cHJvY2Vzc0NvbnRleHQuc2V0KHByb2Nlc3MgJiYgIWlzVmlydHVhbCk7XG5cdFx0fVxuXHRcdC8vIHVwZGF0ZSB0YXNrcyBzbyBhbiBpbmNvbXBsZXRlIGxpc3QgaXNuJ3QgcmV0dXJuZWQgd2hlbiBnZXRXb3Jrc3BhY2VUYXNrcyBpcyBjYWxsZWRcblx0XHR0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRSZWdpc3RlclN1cHBvcnRlZEV4ZWN1dGlvbnMuZmlyZSgpO1xuXHRcdGlmIChTZXJ2ZXJsZXNzV2ViQ29udGV4dC5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkgfHwgKGN1c3RvbSAmJiBzaGVsbCAmJiBwcm9jZXNzKSkge1xuXHRcdFx0dGhpcy5fb25EaWRSZWdpc3RlckFsbFN1cHBvcnRlZEV4ZWN1dGlvbnMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2F0dGVtcHRUYXNrUmVjb25uZWN0aW9uKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLnN0YXJ0dXBLaW5kICE9PSBTdGFydHVwS2luZC5SZWxvYWRlZFdpbmRvdykge1xuXHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uuc2tpcHBpbmdSZWNvbm5lY3Rpb24nLCAnU3RhcnR1cCBraW5kIG5vdCB3aW5kb3cgcmVsb2FkLCBzZXR0aW5nIGNvbm5lY3RlZCBhbmQgcmVtb3ZpbmcgcGVyc2lzdGVudCB0YXNrcycpLCB0cnVlKTtcblx0XHRcdHRoaXMuX3Rhc2tzUmVjb25uZWN0ZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFic3RyYWN0VGFza1NlcnZpY2UuUGVyc2lzdGVudFRhc2tzX0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza1NldHRpbmdJZC5SZWNvbm5lY3Rpb24pIHx8IHRoaXMuX3Rhc2tzUmVjb25uZWN0ZWQpIHtcblx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vdENvbm5lY3RpbmcnLCAnU2V0dGluZyB0YXNrcyBjb25uZWN0ZWQgY29uZmlndXJlZCB2YWx1ZSB7MH0sIHRhc2tzIHdlcmUgYWxyZWFkeSByZWNvbm5lY3RlZCB7MX0nLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrU2V0dGluZ0lkLlJlY29ubmVjdGlvbiksIHRoaXMuX3Rhc2tzUmVjb25uZWN0ZWQpLCB0cnVlKTtcblx0XHRcdHRoaXMuX3Rhc2tzUmVjb25uZWN0ZWQgPSB0cnVlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5yZWNvbm5lY3RpbmcnLCAnUmVjb25uZWN0aW5nIHRvIHJ1bm5pbmcgdGFza3MuLi4nKSwgdHJ1ZSk7XG5cdFx0dGhpcy5nZXRXb3Jrc3BhY2VUYXNrcyhUYXNrUnVuU291cmNlLlJlY29ubmVjdCkudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl90YXNrc1JlY29ubmVjdGVkID0gYXdhaXQgdGhpcy5fcmVjb25uZWN0VGFza3MoKTtcblx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnJlY29ubmVjdGVkJywgJ1JlY29ubmVjdGVkIHRvIHJ1bm5pbmcgdGFza3MuJyksIHRydWUpO1xuXHRcdFx0dGhpcy5fb25EaWRSZWNvbm5lY3RUb1Rhc2tzLmZpcmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUxvbmdSdW5uaW5nVGFza0NvbXBsZXRpb24oZXZlbnQ6IElUYXNrUHJvY2Vzc0VuZGVkRXZlbnQgfCBJVGFza0luYWN0aXZlRXZlbnQsIGR1cmF0aW9uTXM6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblRocmVzaG9sZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oVGFza1NldHRpbmdJZC5Ob3RpZnlXaW5kb3dPblRhc2tDb21wbGV0aW9uKTtcblx0XHQvLyBJZiB0aHJlc2hvbGQgaXMgLTEsIG5vdGlmaWNhdGlvbnMgYXJlIGRpc2FibGVkXG5cdFx0Ly8gSWYgdGhyZXNob2xkIGlzIDAsIGFsd2F5cyBzaG93IG5vdGlmaWNhdGlvbnMgKG5vIG1pbmltdW0gZHVyYXRpb24pXG5cdFx0Ly8gT3RoZXJ3aXNlLCBvbmx5IHNob3cgaWYgZHVyYXRpb24gbWVldHMgb3IgZXhjZWVkcyB0aGUgdGhyZXNob2xkXG5cdFx0aWYgKG5vdGlmaWNhdGlvblRocmVzaG9sZCA9PT0gLTEgfHwgKG5vdGlmaWNhdGlvblRocmVzaG9sZCA+IDAgJiYgZHVyYXRpb25NcyA8IG5vdGlmaWNhdGlvblRocmVzaG9sZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0YXNrUnVuU291cmNlID0gdGhpcy5fdGFza1J1blNvdXJjZXMuZ2V0KGV2ZW50LnRhc2tJZCk7XG5cdFx0aWYgKHRhc2tSdW5Tb3VyY2UgPT09IFRhc2tSdW5Tb3VyY2UuQ2hhdEFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVybWluYWxGb3JUYXNrID0gdGhpcy5fdGVybWluYWxTZXJ2aWNlLmluc3RhbmNlcy5maW5kKGkgPT4gaS5pbnN0YW5jZUlkID09PSBldmVudC50ZXJtaW5hbElkKTtcblx0XHRpZiAoIXRlcm1pbmFsRm9yVGFzaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0YXNrTGFiZWwgPSB0ZXJtaW5hbEZvclRhc2sudGl0bGU7XG5cdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyh0ZXJtaW5hbEZvclRhc2suZG9tRWxlbWVudCk7XG5cdFx0aWYgKHRhcmdldFdpbmRvdy5kb2N1bWVudC5oYXNGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZHVyYXRpb25UZXh0ID0gdGhpcy5fZm9ybWF0VGFza0R1cmF0aW9uKGR1cmF0aW9uTXMpO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSB0YXNrTGFiZWxcblx0XHRcdD8gbmxzLmxvY2FsaXplKCd0YXNrLmxvbmdSdW5uaW5nVGFza0NvbXBsZXRlZFdpdGhMYWJlbCcsICdUYXNrIFwiezB9XCIgZmluaXNoZWQgaW4gezF9LicsIHRhc2tMYWJlbCwgZHVyYXRpb25UZXh0KVxuXHRcdFx0OiBubHMubG9jYWxpemUoJ3Rhc2subG9uZ1J1bm5pbmdUYXNrQ29tcGxldGVkJywgJ1Rhc2sgZmluaXNoZWQgaW4gezB9LicsIGR1cmF0aW9uVGV4dCk7XG5cdFx0dGhpcy5faG9zdFNlcnZpY2UuZm9jdXModGFyZ2V0V2luZG93LCB7IG1vZGU6IEZvY3VzTW9kZS5Ob3RpZnkgfSk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy50b2FzdC52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSk7XG5cdFx0Y29uc3QgeyBjbGlja2VkIH0gPSBhd2FpdCB0aGlzLl9ob3N0U2VydmljZS5zaG93VG9hc3QoeyB0aXRsZTogbWVzc2FnZSB9LCBjdHMudG9rZW4pO1xuXHRcdHRoaXMudG9hc3QuY2xlYXIoKTtcblx0XHRpZiAoY2xpY2tlZCkge1xuXHRcdFx0dGhpcy5faG9zdFNlcnZpY2UuZm9jdXModGFyZ2V0V2luZG93LCB7IG1vZGU6IEZvY3VzTW9kZS5Gb3JjZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRUYXNrRHVyYXRpb24oZHVyYXRpb25NczogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCB0b3RhbFNlY29uZHMgPSBNYXRoLm1heCgxLCBNYXRoLnJvdW5kKGR1cmF0aW9uTXMgLyAxMDAwKSk7XG5cdFx0Y29uc3QgbWludXRlcyA9IE1hdGguZmxvb3IodG90YWxTZWNvbmRzIC8gNjApO1xuXHRcdGNvbnN0IHNlY29uZHMgPSB0b3RhbFNlY29uZHMgJSA2MDtcblx0XHRpZiAobWludXRlcyA+IDApIHtcblx0XHRcdHJldHVybiBzZWNvbmRzID4gMFxuXHRcdFx0XHQ/IG5scy5sb2NhbGl6ZSgndGFzay5sb25nUnVubmluZ1Rhc2tEdXJhdGlvbk1pbnV0ZXNTZWNvbmRzJywgJ3swfW0gezF9cycsIG1pbnV0ZXMsIHNlY29uZHMpXG5cdFx0XHRcdDogbmxzLmxvY2FsaXplKCd0YXNrLmxvbmdSdW5uaW5nVGFza0R1cmF0aW9uTWludXRlcycsICd7MH1tJywgbWludXRlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3Rhc2subG9uZ1J1bm5pbmdUYXNrRHVyYXRpb25TZWNvbmRzJywgJ3swfXMnLCBzZWNvbmRzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29ubmVjdFRhc2tzKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHRhc2tzID0gYXdhaXQgdGhpcy5nZXRTYXZlZFRhc2tzKCdwZXJzaXN0ZW50Jyk7XG5cdFx0aWYgKCF0YXNrcy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vVGFza3MnLCAnTm8gcGVyc2lzdGVudCB0YXNrcyB0byByZWNvbm5lY3QuJyksIHRydWUpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHRhc2tMYWJlbHMgPSB0YXNrcy5tYXAodGFzayA9PiB0YXNrLl9sYWJlbCkuam9pbignLCAnKTtcblx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5yZWNvbm5lY3RpbmdUYXNrcycsICdSZWNvbm5lY3RpbmcgdG8gezB9IHRhc2tzLi4uJywgdGFza0xhYmVscyksIHRydWUpO1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0aWYgKENvbmZpZ3VyaW5nVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMudHJ5UmVzb2x2ZVRhc2sodGFzayk7XG5cdFx0XHRcdGlmIChyZXNvbHZlZCkge1xuXHRcdFx0XHRcdHRoaXMucnVuKHJlc29sdmVkLCB1bmRlZmluZWQsIFRhc2tSdW5Tb3VyY2UuUmVjb25uZWN0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5ydW4odGFzaywgdW5kZWZpbmVkLCBUYXNrUnVuU291cmNlLlJlY29ubmVjdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIGdldCBvbkRpZFN0YXRlQ2hhbmdlKCk6IEV2ZW50PElUYXNrRXZlbnQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWRTdGF0ZUNoYW5nZS5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgc3VwcG9ydHNNdWx0aXBsZVRhc2tFeGVjdXRpb25zKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmluVGVybWluYWwoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlZ2lzdGVyQ29tbWFuZHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJ1blRhc2snLFxuXHRcdFx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yLCBhcmc/OiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIpID0+IHtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9ydW5UYXNrQ29tbWFuZChhcmcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdSdW4gVGFzaycsXG5cdFx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ2FyZ3MnLFxuXHRcdFx0XHRcdGlzT3B0aW9uYWw6IHRydWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVuVGFzay5hcmcnLCBcIkZpbHRlcnMgdGhlIHRhc2tzIHNob3duIGluIHRoZSBxdWlja3BpY2tcIiksXG5cdFx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncnVuVGFzay5sYWJlbCcsIFwiVGhlIHRhc2sncyBsYWJlbCBvciBhIHRlcm0gdG8gZmlsdGVyIGJ5XCIpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdydW5UYXNrLnR5cGUnLCBcIlRoZSBjb250cmlidXRlZCB0YXNrIHR5cGVcIilcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR0YXNrOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdydW5UYXNrLnRhc2snLCBcIlRoZSB0YXNrJ3MgbGFiZWwgb3IgYSB0ZXJtIHRvIGZpbHRlciBieVwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnJlUnVuVGFzaycsIGFzeW5jIChhY2Nlc3NvcikgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5fcmVSdW5UYXNrQ29tbWFuZCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVzdGFydFRhc2snLCBhc3luYyAoYWNjZXNzb3IsIGFyZz86IHN0cmluZyB8IElUYXNrSWRlbnRpZmllcikgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5fcnVuUmVzdGFydFRhc2tDb21tYW5kKGFyZyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChSZXJ1bkFsbFJ1bm5pbmdUYXNrc0NvbW1hbmRJZCwgYXN5bmMgKGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fdHJ1c3QoKSkge1xuXHRcdFx0XHR0aGlzLl9ydW5SZXJ1bkFsbFJ1bm5pbmdUYXNrc0NvbW1hbmQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnRlcm1pbmF0ZScsIGFzeW5jIChhY2Nlc3NvciwgYXJnPzogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyKSA9PiB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fdHJ1c3QoKSkge1xuXHRcdFx0XHR0aGlzLl9ydW5UZXJtaW5hdGVDb21tYW5kKGFyZyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Muc2hvd0xvZycsICgpID0+IHtcblx0XHRcdHRoaXMuX3Nob3dPdXRwdXQodW5kZWZpbmVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmJ1aWxkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5fcnVuQnVpbGRDb21tYW5kKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy50ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0dGhpcy5fcnVuVGVzdENvbW1hbmQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZVRhc2tSdW5uZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fdHJ1c3QoKSkge1xuXHRcdFx0XHR0aGlzLl9ydW5Db25maWd1cmVUYXNrcygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3MuY29uZmlndXJlRGVmYXVsdEJ1aWxkVGFzaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuX3J1bkNvbmZpZ3VyZURlZmF1bHRCdWlsZFRhc2soKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmNvbmZpZ3VyZURlZmF1bHRUZXN0VGFzaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLl90cnVzdCgpKSB7XG5cdFx0XHRcdHRoaXMuX3J1bkNvbmZpZ3VyZURlZmF1bHRUZXN0VGFzaygpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Muc2hvd1Rhc2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3RydXN0KCkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucnVuU2hvd1Rhc2tzKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRDb21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi50YXNrcy50b2dnbGVQcm9ibGVtcycsICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKE1hcmtlcnMuVE9HR0xFX01BUktFUlNfVklFV19BQ1RJT05fSUQpKTtcblxuXHRcdENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLm9wZW5Vc2VyVGFza3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX2dldFJlc291cmNlRm9yS2luZChUYXNrU291cmNlS2luZC5Vc2VyKTtcblx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHR0aGlzLl9vcGVuVGFza0ZpbGUocmVzb3VyY2UsIFRhc2tTb3VyY2VLaW5kLlVzZXIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoJ3dvcmtiZW5jaC5hY3Rpb24udGFza3Mub3BlbldvcmtzcGFjZUZpbGVUYXNrcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fZ2V0UmVzb3VyY2VGb3JLaW5kKFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGUpO1xuXHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdHRoaXMuX29wZW5UYXNrRmlsZShyZXNvdXJjZSwgVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlRmlsZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldCB3b3Jrc3BhY2VGb2xkZXJzKCk6IElXb3Jrc3BhY2VGb2xkZXJbXSB7XG5cdFx0aWYgKCF0aGlzLl93b3Jrc3BhY2VGb2xkZXJzKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVTZXR1cCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd29ya3NwYWNlRm9sZGVycyE7XG5cdH1cblxuXHRwcml2YXRlIGdldCBpZ25vcmVkV29ya3NwYWNlRm9sZGVycygpOiBJV29ya3NwYWNlRm9sZGVyW10ge1xuXHRcdGlmICghdGhpcy5faWdub3JlZFdvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdHRoaXMuX3VwZGF0ZVNldHVwKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9pZ25vcmVkV29ya3NwYWNlRm9sZGVycyE7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0IGV4ZWN1dGlvbkVuZ2luZSgpOiBFeGVjdXRpb25FbmdpbmUge1xuXHRcdGlmICh0aGlzLl9leGVjdXRpb25FbmdpbmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdXBkYXRlU2V0dXAoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2V4ZWN1dGlvbkVuZ2luZSE7XG5cdH1cblxuXHRwcml2YXRlIGdldCBzY2hlbWFWZXJzaW9uKCk6IEpzb25TY2hlbWFWZXJzaW9uIHtcblx0XHRpZiAodGhpcy5fc2NoZW1hVmVyc2lvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl91cGRhdGVTZXR1cCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2NoZW1hVmVyc2lvbiE7XG5cdH1cblxuXHRwcml2YXRlIGdldCBzaG93SWdub3JlTWVzc2FnZSgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fc2hvd0lnbm9yZU1lc3NhZ2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc2hvd0lnbm9yZU1lc3NhZ2UgPSAhdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihBYnN0cmFjdFRhc2tTZXJ2aWNlLklnbm9yZVRhc2swMTBEb25vdFNob3dBZ2Fpbl9rZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIGZhbHNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3dJZ25vcmVNZXNzYWdlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0QWN0aXZhdGlvbkV2ZW50cyh0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRcdHJlc3VsdC5wdXNoKCdvbkNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi50YXNrcy5ydW5UYXNrJyk7XG5cdFx0aWYgKHR5cGUpIHtcblx0XHRcdC8vIHNlbmQgYSBzcGVjaWZpYyBhY3RpdmF0aW9uIGV2ZW50IGZvciB0aGlzIHRhc2sgdHlwZVxuXHRcdFx0cmVzdWx0LnB1c2goYG9uVGFza1R5cGU6JHt0eXBlfWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBzZW5kIGFjdGl2YXRpb24gZXZlbnRzIGZvciBhbGwgdGFzayB0eXBlc1xuXHRcdFx0Zm9yIChjb25zdCBkZWZpbml0aW9uIG9mIFRhc2tEZWZpbml0aW9uUmVnaXN0cnkuYWxsKCkpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goYG9uVGFza1R5cGU6JHtkZWZpbml0aW9uLnRhc2tUeXBlfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWN0aXZhdGVUYXNrUHJvdmlkZXJzKHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFdlIG5lZWQgdG8gZmlyc3Qgd2FpdCBmb3IgZXh0ZW5zaW9ucyB0byBiZSByZWdpc3RlcmVkIGJlY2F1c2Ugd2UgbWlnaHQgcmVhZFxuXHRcdC8vIHRoZSBgVGFza0RlZmluaXRpb25SZWdpc3RyeWAgaW4gY2FzZSBgdHlwZWAgaXMgYHVuZGVmaW5lZGBcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGNvbnN0IGhhc0xvZ2dlZEFjdGl2YXRpb24gPSB0aGlzLl9hY3RpdmF0ZWRUYXNrUHJvdmlkZXJzLmhhcyh0eXBlID8/ICdhbGwnKTtcblx0XHRpZiAoIWhhc0xvZ2dlZEFjdGl2YXRpb24pIHtcblx0XHRcdHRoaXMuX2xvZygnQWN0aXZhdGluZyB0YXNrIHByb3ZpZGVycyAnICsgKHR5cGUgPz8gJ2FsbCcpKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRQcm9taXNlLmFsbCh0aGlzLl9nZXRBY3RpdmF0aW9uRXZlbnRzKHR5cGUpLm1hcChhY3RpdmF0aW9uRXZlbnQgPT4gdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYWN0aXZhdGlvbkV2ZW50KSkpLFxuXHRcdFx0NTAwMCxcblx0XHRcdCgpID0+IHRoaXMuX2xvZ1NlcnZpY2Uud2FybignVGltZWQgb3V0IGFjdGl2YXRpbmcgZXh0ZW5zaW9ucyBmb3IgdGFzayBwcm92aWRlcnMnKVxuXHRcdCk7XG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0dGhpcy5fYWN0aXZhdGVkVGFza1Byb3ZpZGVycy5hZGQodHlwZSA/PyAnYWxsJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2V0dXAoc2V0dXA/OiBbSVdvcmtzcGFjZUZvbGRlcltdLCBJV29ya3NwYWNlRm9sZGVyW10sIEV4ZWN1dGlvbkVuZ2luZSwgSnNvblNjaGVtYVZlcnNpb24sIElXb3Jrc3BhY2UgfCB1bmRlZmluZWRdKTogdm9pZCB7XG5cdFx0aWYgKCFzZXR1cCkge1xuXHRcdFx0c2V0dXAgPSB0aGlzLl9jb21wdXRlV29ya3NwYWNlRm9sZGVyU2V0dXAoKTtcblx0XHR9XG5cdFx0dGhpcy5fd29ya3NwYWNlRm9sZGVycyA9IHNldHVwWzBdO1xuXHRcdGlmICh0aGlzLl9pZ25vcmVkV29ya3NwYWNlRm9sZGVycykge1xuXHRcdFx0aWYgKHRoaXMuX2lnbm9yZWRXb3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCAhPT0gc2V0dXBbMV0ubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dJZ25vcmVNZXNzYWdlID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2V0OiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoKTtcblx0XHRcdFx0dGhpcy5faWdub3JlZFdvcmtzcGFjZUZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4gc2V0LmFkZChmb2xkZXIudXJpLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2Ygc2V0dXBbMV0pIHtcblx0XHRcdFx0XHRpZiAoIXNldC5oYXMoZm9sZGVyLnVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fc2hvd0lnbm9yZU1lc3NhZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5faWdub3JlZFdvcmtzcGFjZUZvbGRlcnMgPSBzZXR1cFsxXTtcblx0XHR0aGlzLl9leGVjdXRpb25FbmdpbmUgPSBzZXR1cFsyXTtcblx0XHR0aGlzLl9zY2hlbWFWZXJzaW9uID0gc2V0dXBbM107XG5cdFx0dGhpcy5fd29ya3NwYWNlID0gc2V0dXBbNF07XG5cdH1cblxuXHRwcm90ZWN0ZWQgX3Nob3dPdXRwdXQocnVuU291cmNlOiBUYXNrUnVuU291cmNlID0gVGFza1J1blNvdXJjZS5Vc2VyLCB1c2VyUmVxdWVzdGVkPzogYm9vbGVhbiwgZXJyb3JNZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCFWaXJ0dWFsV29ya3NwYWNlQ29udGV4dC5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkgJiYgKChydW5Tb3VyY2UgPT09IFRhc2tSdW5Tb3VyY2UuVXNlcikgfHwgKHJ1blNvdXJjZSA9PT0gVGFza1J1blNvdXJjZS5Db25maWd1cmF0aW9uQ2hhbmdlKSkpIHtcblx0XHRcdGlmICh1c2VyUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRoaXMuX291dHB1dFNlcnZpY2Uuc2hvd0NoYW5uZWwodGhpcy5fb3V0cHV0Q2hhbm5lbC5pZCwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBjaGF0RW5hYmxlZCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmlzRW5hYmxlZChDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHRcdFx0Y29uc3QgYWN0aW9ucyA9IFtdO1xuXHRcdFx0XHRpZiAoY2hhdEVuYWJsZWQgJiYgZXJyb3JNZXNzYWdlKSB7XG5cdFx0XHRcdFx0Y29uc3QgYmVmb3JlSlNPTnJlZ2V4ID0gL14oLio/KVxccypcXHtbXFxzXFxTXSokLztcblx0XHRcdFx0XHRjb25zdCBtYXRjaGVzID0gZXJyb3JNZXNzYWdlLm1hdGNoKGJlZm9yZUpTT05yZWdleCk7XG5cdFx0XHRcdFx0aWYgKG1hdGNoZXMgJiYgbWF0Y2hlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gbWF0Y2hlc1sxXTtcblx0XHRcdFx0XHRcdGNvbnN0IGN1c3RvbU1lc3NhZ2UgPSBtZXNzYWdlID09PSBlcnJvck1lc3NhZ2Vcblx0XHRcdFx0XHRcdFx0PyBgXFxgJHttZXNzYWdlfVxcYGBcblx0XHRcdFx0XHRcdFx0OiBgXFxgJHttZXNzYWdlfVxcYFxcblxcYFxcYFxcYGpzb24ke2Vycm9yTWVzc2FnZX1cXGBcXGBcXGBgO1xuXG5cblx0XHRcdFx0XHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0XHRcdFx0aWYgKGRlZmF1bHRBZ2VudCkge1xuXHRcdFx0XHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3Ryb3VibGVzaG9vdFdpdGhDaGF0JywgXCJGaXggd2l0aCBBSVwiKSxcblx0XHRcdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfT1BFTl9BQ1RJT05fSUQsIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0bW9kZTogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRxdWVyeTogYEZpeCB0aGlzIHRhc2sgY29uZmlndXJhdGlvbiBlcnJvcjogJHtjdXN0b21NZXNzYWdlfWBcblx0XHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2hvd091dHB1dCcsIFwiU2hvdyBPdXRwdXRcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9vdXRwdXRTZXJ2aWNlLnNob3dDaGFubmVsKHRoaXMuX291dHB1dENoYW5uZWwuaWQsIHRydWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChjaGF0RW5hYmxlZCAmJiBhY3Rpb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5XYXJuaW5nLCBubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlT3V0cHV0UHJvbXB0Q2hhdCcsICdUaGVyZSBhcmUgdGFzayBlcnJvcnMuIFVzZSBjaGF0IHRvIGZpeCB0aGVtIG9yIHZpZXcgdGhlIG91dHB1dCBmb3IgZGV0YWlscy4nKSwgYWN0aW9ucyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuV2FybmluZywgbmxzLmxvY2FsaXplKCd0YXNrU2VydmljZU91dHB1dFByb21wdCcsICdUaGVyZSBhcmUgdGFzayBlcnJvcnMuIFNlZSB0aGUgb3V0cHV0IGZvciBkZXRhaWxzLicpLCBhY3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBfZGlzcG9zZVRhc2tTeXN0ZW1MaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Rhc2tTeXN0ZW1MaXN0ZW5lcnMpIHtcblx0XHRcdGRpc3Bvc2UodGhpcy5fdGFza1N5c3RlbUxpc3RlbmVycyk7XG5cdFx0XHR0aGlzLl90YXNrU3lzdGVtTGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyByZWdpc3RlclRhc2tQcm92aWRlcihwcm92aWRlcjogSVRhc2tQcm92aWRlciwgdHlwZTogc3RyaW5nKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3QgaGFuZGxlID0gQWJzdHJhY3RUYXNrU2VydmljZS5fbmV4dEhhbmRsZSsrO1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQoaGFuZGxlLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fcHJvdmlkZXJUeXBlcy5zZXQoaGFuZGxlLCB0eXBlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVRhc2tQcm92aWRlcnMuZmlyZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVycy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJUeXBlcy5kZWxldGUoaGFuZGxlKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYXNrUHJvdmlkZXJzLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0Z2V0IGhhc1Rhc2tTeXN0ZW1JbmZvKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGluZm9zQ291bnQgPSBBcnJheS5mcm9tKHRoaXMuX3Rhc2tTeXN0ZW1JbmZvcy52YWx1ZXMoKSkuZmxhdCgpLmxlbmd0aDtcblx0XHQvLyBJZiB0aGVyZSdzIGEgcmVtb3RlQXV0aG9yaXR5LCB0aGVuIHdlIGVuZCB1cCB3aXRoIDIgdGFza1N5c3RlbUluZm9zLFxuXHRcdC8vIG9uZSBmb3IgZWFjaCBleHRlbnNpb24gaG9zdC5cblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIGluZm9zQ291bnQgPiAxO1xuXHRcdH1cblx0XHRyZXR1cm4gaW5mb3NDb3VudCA+IDA7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJUYXNrU3lzdGVtKGtleTogc3RyaW5nLCBpbmZvOiBJVGFza1N5c3RlbUluZm8pOiB2b2lkIHtcblx0XHQvLyBJZGVhbGx5IHRoZSBXZWIgY2FsbGVyIG9mIHJlZ2lzdGVyUmVnaXN0ZXJUYXNrU3lzdGVtIHdvdWxkIHVzZSB0aGUgY29ycmVjdCBrZXkuXG5cdFx0Ly8gSG93ZXZlciwgdGhlIGNhbGxlciBkb2Vzbid0IGtub3cgYWJvdXQgdGhlIHdvcmtzcGFjZSBmb2xkZXJzIGF0IHRoZSB0aW1lIG9mIHRoZSBjYWxsLCBldmVuIHRob3VnaCB3ZSBrbm93IGFib3V0IHRoZW0gaGVyZS5cblx0XHRpZiAoaW5mby5wbGF0Zm9ybSA9PT0gUGxhdGZvcm0uUGxhdGZvcm0uV2ViKSB7XG5cdFx0XHRrZXkgPSB0aGlzLndvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID8gdGhpcy53b3Jrc3BhY2VGb2xkZXJzWzBdLnVyaS5zY2hlbWUgOiBrZXk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdGFza1N5c3RlbUluZm9zLmhhcyhrZXkpKSB7XG5cdFx0XHR0aGlzLl90YXNrU3lzdGVtSW5mb3Muc2V0KGtleSwgW2luZm9dKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgaW5mb3MgPSB0aGlzLl90YXNrU3lzdGVtSW5mb3MuZ2V0KGtleSkhO1xuXHRcdFx0aWYgKGluZm8ucGxhdGZvcm0gPT09IFBsYXRmb3JtLlBsYXRmb3JtLldlYikge1xuXHRcdFx0XHQvLyBXZWIgaW5mb3Mgc2hvdWxkIGJlIHB1c2hlZCBsYXN0LlxuXHRcdFx0XHRpbmZvcy5wdXNoKGluZm8pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aW5mb3MudW5zaGlmdChpbmZvKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5oYXNUYXNrU3lzdGVtSW5mbykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VUYXNrU3lzdGVtSW5mby5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGFza1N5c3RlbUluZm8oa2V5OiBzdHJpbmcpOiBJVGFza1N5c3RlbUluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGluZm9zID0gdGhpcy5fdGFza1N5c3RlbUluZm9zLmdldChrZXkpO1xuXHRcdHJldHVybiAoaW5mb3MgJiYgaW5mb3MubGVuZ3RoKSA/IGluZm9zWzBdIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGV4dGVuc2lvbkNhbGxiYWNrVGFza0NvbXBsZXRlKHRhc2s6IFRhc2ssIHJlc3VsdDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl90YXNrU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtLmN1c3RvbUV4ZWN1dGlvbkNvbXBsZXRlKHRhc2ssIHJlc3VsdCk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGEgc3Vic2V0IG9mIHdvcmtzcGFjZSB0YXNrcyB0aGF0IG1hdGNoIGEgY2VydGFpbiBwcmVkaWNhdGUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9maW5kV29ya3NwYWNlVGFza3MocHJlZGljYXRlOiAodGFzazogQ29uZmlndXJpbmdUYXNrIHwgVGFzaywgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKSA9PiBib29sZWFuKTogUHJvbWlzZTwoQ29uZmlndXJpbmdUYXNrIHwgVGFzaylbXT4ge1xuXHRcdGNvbnN0IHJlc3VsdDogKENvbmZpZ3VyaW5nVGFzayB8IFRhc2spW10gPSBbXTtcblxuXHRcdGNvbnN0IHRhc2tzID0gYXdhaXQgdGhpcy5nZXRXb3Jrc3BhY2VUYXNrcygpO1xuXHRcdGZvciAoY29uc3QgWywgd29ya3NwYWNlVGFza3NdIG9mIHRhc2tzKSB7XG5cdFx0XHRpZiAod29ya3NwYWNlVGFza3MuY29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrTmFtZSBvZiBPYmplY3Qua2V5cyh3b3Jrc3BhY2VUYXNrcy5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFzayA9IHdvcmtzcGFjZVRhc2tzLmNvbmZpZ3VyYXRpb25zLmJ5SWRlbnRpZmllclt0YXNrTmFtZV07XG5cdFx0XHRcdFx0aWYgKHByZWRpY2F0ZSh0YXNrLCB3b3Jrc3BhY2VUYXNrcy53b3Jrc3BhY2VGb2xkZXIpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh0YXNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh3b3Jrc3BhY2VUYXNrcy5zZXQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHdvcmtzcGFjZVRhc2tzLnNldC50YXNrcykge1xuXHRcdFx0XHRcdGlmIChwcmVkaWNhdGUodGFzaywgd29ya3NwYWNlVGFza3Mud29ya3NwYWNlRm9sZGVyKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9maW5kV29ya3NwYWNlVGFza3NJbkdyb3VwKGdyb3VwOiBUYXNrR3JvdXAsIGlzRGVmYXVsdDogYm9vbGVhbik6IFByb21pc2U8KENvbmZpZ3VyaW5nVGFzayB8IFRhc2spW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fZmluZFdvcmtzcGFjZVRhc2tzKCh0YXNrKSA9PiB7XG5cdFx0XHRjb25zdCB0YXNrR3JvdXAgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwO1xuXHRcdFx0aWYgKHRhc2tHcm91cCAmJiB0eXBlb2YgdGFza0dyb3VwICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gKHRhc2tHcm91cC5faWQgPT09IGdyb3VwLl9pZCAmJiAoIWlzRGVmYXVsdCB8fCAhIXRhc2tHcm91cC5pc0RlZmF1bHQpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRUYXNrKGZvbGRlcjogSVdvcmtzcGFjZSB8IElXb3Jrc3BhY2VGb2xkZXIgfCBzdHJpbmcsIGlkZW50aWZpZXI6IHN0cmluZyB8IElUYXNrSWRlbnRpZmllciwgY29tcGFyZUlkOiBib29sZWFuID0gZmFsc2UsIHR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX3RydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG5hbWUgPSBUeXBlcy5pc1N0cmluZyhmb2xkZXIpID8gZm9sZGVyIDogaXNXb3Jrc3BhY2VGb2xkZXIoZm9sZGVyKSA/IGZvbGRlci5uYW1lIDogZm9sZGVyLmNvbmZpZ3VyYXRpb24gPyByZXNvdXJjZXMuYmFzZW5hbWUoZm9sZGVyLmNvbmZpZ3VyYXRpb24pIDogdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmlnbm9yZWRXb3Jrc3BhY2VGb2xkZXJzLnNvbWUoaWdub3JlZCA9PiBpZ25vcmVkLm5hbWUgPT09IG5hbWUpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnVGFza1NlcnZlci5mb2xkZXJJZ25vcmVkJywgJ1RoZSBmb2xkZXIgezB9IGlzIGlnbm9yZWQgc2luY2UgaXQgdXNlcyB0YXNrIHZlcnNpb24gMC4xLjAnLCBuYW1lKSkpO1xuXHRcdH1cblx0XHRjb25zdCBrZXk6IHN0cmluZyB8IEtleWVkVGFza0lkZW50aWZpZXIgfCB1bmRlZmluZWQgPSAhVHlwZXMuaXNTdHJpbmcoaWRlbnRpZmllcilcblx0XHRcdD8gVGFza0RlZmluaXRpb24uY3JlYXRlVGFza0lkZW50aWZpZXIoaWRlbnRpZmllciwgY29uc29sZSlcblx0XHRcdDogaWRlbnRpZmllcjtcblxuXHRcdGlmIChrZXkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdC8vIFRyeSB0byBmaW5kIHRoZSB0YXNrIGluIHRoZSB3b3Jrc3BhY2Vcblx0XHRjb25zdCByZXF1ZXN0ZWRGb2xkZXIgPSBUYXNrTWFwLmdldEtleShmb2xkZXIpO1xuXHRcdGNvbnN0IG1hdGNoZWRUYXNrcyA9IGF3YWl0IHRoaXMuX2ZpbmRXb3Jrc3BhY2VUYXNrcygodGFzaywgd29ya3NwYWNlRm9sZGVyKSA9PiB7XG5cdFx0XHRjb25zdCB0YXNrRm9sZGVyID0gVGFza01hcC5nZXRLZXkod29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdGlmICh0YXNrRm9sZGVyICE9PSByZXF1ZXN0ZWRGb2xkZXIgJiYgdGFza0ZvbGRlciAhPT0gVVNFUl9UQVNLU19HUk9VUF9LRVkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRhc2subWF0Y2hlcyhrZXksIGNvbXBhcmVJZCk7XG5cdFx0fSk7XG5cdFx0bWF0Y2hlZFRhc2tzLnNvcnQodGFzayA9PiB0YXNrLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuRXh0ZW5zaW9uID8gMSA6IC0xKTtcblx0XHRpZiAobWF0Y2hlZFRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIE5pY2UsIHdlIGZvdW5kIGEgY29uZmlndXJlZCB0YXNrIVxuXHRcdFx0Y29uc3QgdGFzayA9IG1hdGNoZWRUYXNrc1swXTtcblx0XHRcdGlmIChDb25maWd1cmluZ1Rhc2suaXModGFzaykpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudHJ5UmVzb2x2ZVRhc2sodGFzayk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGFzaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBXZSBkaWRuJ3QgZmluZCB0aGUgdGFzaywgc28gd2UgbmVlZCB0byBhc2sgYWxsIHJlc29sdmVycyBhYm91dCBpdFxuXHRcdGNvbnN0IG1hcCA9IGF3YWl0IHRoaXMuX2dldEdyb3VwZWRUYXNrcyh7IHR5cGUgfSk7XG5cdFx0bGV0IHZhbHVlcyA9IG1hcC5nZXQoZm9sZGVyKTtcblx0XHR2YWx1ZXMgPSB2YWx1ZXMuY29uY2F0KG1hcC5nZXQoVVNFUl9UQVNLU19HUk9VUF9LRVkpKTtcblxuXHRcdGlmICghdmFsdWVzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR2YWx1ZXMgPSB2YWx1ZXMuZmlsdGVyKHRhc2sgPT4gdGFzay5tYXRjaGVzKGtleSwgY29tcGFyZUlkKSkuc29ydCh0YXNrID0+IHRhc2suX3NvdXJjZS5raW5kID09PSBUYXNrU291cmNlS2luZC5FeHRlbnNpb24gPyAxIDogLTEpO1xuXHRcdHJldHVybiB2YWx1ZXMubGVuZ3RoID4gMCA/IHZhbHVlc1swXSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB0cnlSZXNvbHZlVGFzayhjb25maWd1cmluZ1Rhc2s6IENvbmZpZ3VyaW5nVGFzayk6IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX3RydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX2FjdGl2YXRlVGFza1Byb3ZpZGVycyhjb25maWd1cmluZ1Rhc2sudHlwZSk7XG5cdFx0bGV0IG1hdGNoaW5nUHJvdmlkZXI6IElUYXNrUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG1hdGNoaW5nUHJvdmlkZXJVbmF2YWlsYWJsZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgW2hhbmRsZSwgcHJvdmlkZXJdIG9mIHRoaXMuX3Byb3ZpZGVycykge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXJUeXBlID0gdGhpcy5fcHJvdmlkZXJUeXBlcy5nZXQoaGFuZGxlKTtcblx0XHRcdGlmIChjb25maWd1cmluZ1Rhc2sudHlwZSA9PT0gcHJvdmlkZXJUeXBlKSB7XG5cdFx0XHRcdGlmIChwcm92aWRlclR5cGUgJiYgIXRoaXMuX2lzVGFza1Byb3ZpZGVyRW5hYmxlZChwcm92aWRlclR5cGUpKSB7XG5cdFx0XHRcdFx0bWF0Y2hpbmdQcm92aWRlclVuYXZhaWxhYmxlID0gdHJ1ZTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtYXRjaGluZ1Byb3ZpZGVyID0gcHJvdmlkZXI7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghbWF0Y2hpbmdQcm92aWRlcikge1xuXHRcdFx0aWYgKG1hdGNoaW5nUHJvdmlkZXJVbmF2YWlsYWJsZSkge1xuXHRcdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdCdUYXNrU2VydmljZS5wcm92aWRlclVuYXZhaWxhYmxlJyxcblx0XHRcdFx0XHQnV2FybmluZzogezB9IHRhc2tzIGFyZSB1bmF2YWlsYWJsZSBpbiB0aGUgY3VycmVudCBlbnZpcm9ubWVudC4nLFxuXHRcdFx0XHRcdGNvbmZpZ3VyaW5nVGFzay5jb25maWd1cmVzLnR5cGVcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVHJ5IHRvIHJlc29sdmUgdGhlIHRhc2sgZmlyc3Rcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRUYXNrID0gYXdhaXQgbWF0Y2hpbmdQcm92aWRlci5yZXNvbHZlVGFzayhjb25maWd1cmluZ1Rhc2spO1xuXHRcdFx0aWYgKHJlc29sdmVkVGFzayAmJiAocmVzb2x2ZWRUYXNrLl9pZCA9PT0gY29uZmlndXJpbmdUYXNrLl9pZCkpIHtcblx0XHRcdFx0cmV0dXJuIFRhc2tDb25maWcuY3JlYXRlQ3VzdG9tVGFzayhyZXNvbHZlZFRhc2ssIGNvbmZpZ3VyaW5nVGFzayk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIElnbm9yZSBlcnJvcnMuIFRoZSB0YXNrIGNvdWxkIG5vdCBiZSBwcm92aWRlZCBieSBhbnkgb2YgdGhlIHByb3ZpZGVycy5cblx0XHR9XG5cblx0XHQvLyBUaGUgdGFzayBjb3VsZG4ndCBiZSByZXNvbHZlZC4gSW5zdGVhZCwgdXNlIHRoZSBsZXNzIGVmZmljaWVudCBwcm92aWRlVGFzay5cblx0XHRjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMudGFza3MoeyB0eXBlOiBjb25maWd1cmluZ1Rhc2sudHlwZSB9KTtcblx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdGlmICh0YXNrLl9pZCA9PT0gY29uZmlndXJpbmdUYXNrLl9pZCkge1xuXHRcdFx0XHRyZXR1cm4gVGFza0NvbmZpZy5jcmVhdGVDdXN0b21UYXNrKDxDb250cmlidXRlZFRhc2s+dGFzaywgY29uZmlndXJpbmdUYXNrKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX3ZlcnNpb25BbmRFbmdpbmVDb21wYXRpYmxlKGZpbHRlcj86IElUYXNrRmlsdGVyKTogYm9vbGVhbjtcblxuXHRwdWJsaWMgYXN5bmMgdGFza3MoZmlsdGVyPzogSVRhc2tGaWx0ZXIpOiBQcm9taXNlPFRhc2tbXT4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX3RydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fdmVyc2lvbkFuZEVuZ2luZUNvbXBhdGlibGUoZmlsdGVyKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZTxUYXNrW10+KFtdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dldEdyb3VwZWRUYXNrcyhmaWx0ZXIpLnRoZW4oKG1hcCkgPT4gdGhpcy5hcHBseUZpbHRlclRvVGFza01hcChmaWx0ZXIsIG1hcCkpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldEtub3duVGFza3MoZmlsdGVyPzogSVRhc2tGaWx0ZXIpOiBQcm9taXNlPFRhc2tbXT4ge1xuXHRcdGlmICghdGhpcy5fdmVyc2lvbkFuZEVuZ2luZUNvbXBhdGlibGUoZmlsdGVyKSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZTxUYXNrW10+KFtdKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fZ2V0R3JvdXBlZFRhc2tzKGZpbHRlciwgdHJ1ZSwgdHJ1ZSkudGhlbigobWFwKSA9PiB0aGlzLmFwcGx5RmlsdGVyVG9UYXNrTWFwKGZpbHRlciwgbWFwKSk7XG5cdH1cblxuXHRwdWJsaWMgdGFza1R5cGVzKCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCB0eXBlczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAodGhpcy5faXNQcm92aWRlVGFza3NFbmFibGVkKCkpIHtcblx0XHRcdGZvciAoY29uc3QgZGVmaW5pdGlvbiBvZiBUYXNrRGVmaW5pdGlvblJlZ2lzdHJ5LmFsbCgpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1Rhc2tQcm92aWRlckVuYWJsZWQoZGVmaW5pdGlvbi50YXNrVHlwZSkpIHtcblx0XHRcdFx0XHR0eXBlcy5wdXNoKGRlZmluaXRpb24udGFza1R5cGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlcztcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVTb3J0ZXIoKTogVGFza1NvcnRlciB7XG5cdFx0cmV0dXJuIG5ldyBUYXNrU29ydGVyKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpID8gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycyA6IFtdKTtcblx0fVxuXG5cdHByaXZhdGUgX2lzQWN0aXZlKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghdGhpcy5fdGFza1N5c3RlbSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtLmlzQWN0aXZlKCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0QWN0aXZlVGFza3MoKTogUHJvbWlzZTxUYXNrW10+IHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW0pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2tTeXN0ZW0uZ2V0QWN0aXZlVGFza3MoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRCdXN5VGFza3MoKTogUHJvbWlzZTxUYXNrW10+IHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW0pIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2tTeXN0ZW0uZ2V0QnVzeVRhc2tzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UmVjZW50bHlVc2VkVGFza3NWMSgpOiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGlmICh0aGlzLl9yZWNlbnRseVVzZWRUYXNrc1YxKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVjZW50bHlVc2VkVGFza3NWMTtcblx0XHR9XG5cdFx0Y29uc3QgcXVpY2tPcGVuSGlzdG9yeUxpbWl0ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihRVUlDS09QRU5fSElTVE9SWV9MSU1JVF9DT05GSUcpO1xuXHRcdHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzVjEgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+KHF1aWNrT3Blbkhpc3RvcnlMaW1pdCk7XG5cblx0XHRjb25zdCBzdG9yYWdlVmFsdWUgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQWJzdHJhY3RUYXNrU2VydmljZS5SZWNlbnRseVVzZWRUYXNrc19LZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChzdG9yYWdlVmFsdWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlczogc3RyaW5nW10gPSBKU09OLnBhcnNlKHN0b3JhZ2VWYWx1ZSk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVjZW50bHlVc2VkVGFza3NWMS5zZXQodmFsdWUsIHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIElnbm9yZS4gV2UgdXNlIHRoZSBlbXB0eSByZXN1bHRcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzVjE7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5RmlsdGVyVG9UYXNrTWFwKGZpbHRlcjogSVRhc2tGaWx0ZXIgfCB1bmRlZmluZWQsIG1hcDogVGFza01hcCk6IFRhc2tbXSB7XG5cdFx0aWYgKCFmaWx0ZXIgfHwgIWZpbHRlci50eXBlKSB7XG5cdFx0XHRyZXR1cm4gbWFwLmFsbCgpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IFRhc2tbXSA9IFtdO1xuXHRcdG1hcC5mb3JFYWNoKCh0YXNrcykgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdGlmIChDb250cmlidXRlZFRhc2suaXModGFzaykgJiYgKCh0YXNrLmRlZmluZXMudHlwZSA9PT0gZmlsdGVyLnR5cGUpIHx8ICh0YXNrLl9zb3VyY2UubGFiZWwgPT09IGZpbHRlci50eXBlKSkpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0YXNrKTtcblx0XHRcdFx0fSBlbHNlIGlmIChDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0aWYgKHRhc2sudHlwZSA9PT0gZmlsdGVyLnR5cGUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXN0b21pemVzID0gdGFzay5jdXN0b21pemVzKCk7XG5cdFx0XHRcdFx0XHRpZiAoY3VzdG9taXplcyAmJiBjdXN0b21pemVzLnR5cGUgPT09IGZpbHRlci50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUYXNrc0Zyb21TdG9yYWdlKHR5cGU6ICdwZXJzaXN0ZW50JyB8ICdoaXN0b3JpY2FsJyk6IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0cmV0dXJuIHR5cGUgPT09ICdwZXJzaXN0ZW50JyA/IHRoaXMuX2dldFBlcnNpc3RlbnRUYXNrcygpIDogdGhpcy5fZ2V0UmVjZW50VGFza3MoKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlY2VudFRhc2tzKCk6IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVjZW50bHlVc2VkVGFza3M7XG5cdFx0fVxuXHRcdGNvbnN0IHF1aWNrT3Blbkhpc3RvcnlMaW1pdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oUVVJQ0tPUEVOX0hJU1RPUllfTElNSVRfQ09ORklHKTtcblx0XHR0aGlzLl9yZWNlbnRseVVzZWRUYXNrcyA9IG5ldyBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4ocXVpY2tPcGVuSGlzdG9yeUxpbWl0KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2VWYWx1ZSA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChBYnN0cmFjdFRhc2tTZXJ2aWNlLlJlY2VudGx5VXNlZFRhc2tzX0tleVYyLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAoc3RvcmFnZVZhbHVlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZXM6IFtzdHJpbmcsIHN0cmluZ11bXSA9IEpTT04ucGFyc2Uoc3RvcmFnZVZhbHVlKTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgdmFsdWUgb2YgdmFsdWVzKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWNlbnRseVVzZWRUYXNrcy5zZXQodmFsdWVbMF0sIHZhbHVlWzFdKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIElnbm9yZS4gV2UgdXNlIHRoZSBlbXB0eSByZXN1bHRcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UGVyc2lzdGVudFRhc2tzKCk6IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0aWYgKHRoaXMuX3BlcnNpc3RlbnRUYXNrcykge1xuXHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2UuZ2V0dGluZ0NhY2hlZFRhc2tzJywgJ1JldHVybmluZyBjYWNoZWQgdGFza3MgezB9JywgdGhpcy5fcGVyc2lzdGVudFRhc2tzLnNpemUpLCB0cnVlKTtcblx0XHRcdHJldHVybiB0aGlzLl9wZXJzaXN0ZW50VGFza3M7XG5cdFx0fVxuXHRcdC8vVE9ETzogc2hvdWxkIHRoaXMgIyBiZSBjb25maWd1cmFibGU/XG5cdFx0dGhpcy5fcGVyc2lzdGVudFRhc2tzID0gbmV3IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPigxMCk7XG5cdFx0Y29uc3Qgc3RvcmFnZVZhbHVlID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KEFic3RyYWN0VGFza1NlcnZpY2UuUGVyc2lzdGVudFRhc2tzX0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKHN0b3JhZ2VWYWx1ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgdmFsdWVzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBKU09OLnBhcnNlKHN0b3JhZ2VWYWx1ZSk7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHZhbHVlIG9mIHZhbHVlcykge1xuXHRcdFx0XHRcdFx0dGhpcy5fcGVyc2lzdGVudFRhc2tzLnNldCh2YWx1ZVswXSwgdmFsdWVbMV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gSWdub3JlLiBXZSB1c2UgdGhlIGVtcHR5IHJlc3VsdFxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcGVyc2lzdGVudFRhc2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Rm9sZGVyRnJvbVRhc2tLZXkoa2V5OiBzdHJpbmcpOiB7IGZvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkOyBpc1dvcmtzcGFjZUZpbGU6IGJvb2xlYW4gfCB1bmRlZmluZWQgfSB7XG5cdFx0Y29uc3Qga2V5VmFsdWU6IHsgZm9sZGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGlkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSA9IEpTT04ucGFyc2Uoa2V5KTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9sZGVyOiBrZXlWYWx1ZS5mb2xkZXIsIGlzV29ya3NwYWNlRmlsZToga2V5VmFsdWUuaWQ/LmVuZHNXaXRoKFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGUpXG5cdFx0fTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBnZXRTYXZlZFRhc2tzKHR5cGU6ICdwZXJzaXN0ZW50JyB8ICdoaXN0b3JpY2FsJyk6IFByb21pc2U8KFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10+IHtcblx0XHRjb25zdCBmb2xkZXJNYXA6IElTdHJpbmdEaWN0aW9uYXJ5PElXb3Jrc3BhY2VGb2xkZXI+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLndvcmtzcGFjZUZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4ge1xuXHRcdFx0Zm9sZGVyTWFwW2ZvbGRlci51cmkudG9TdHJpbmcoKV0gPSBmb2xkZXI7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZm9sZGVyVG9UYXNrc01hcDogTWFwPHN0cmluZywgKFRhc2tDb25maWcuSUN1c3RvbVRhc2sgfCBUYXNrQ29uZmlnLklDb25maWd1cmluZ1Rhc2spW10+ID0gbmV3IE1hcCgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVRvVGFza01hcDogTWFwPHN0cmluZywgKFRhc2tDb25maWcuSUN1c3RvbVRhc2sgfCBUYXNrQ29uZmlnLklDb25maWd1cmluZ1Rhc2spW10+ID0gbmV3IE1hcCgpO1xuXHRcdGNvbnN0IHN0b3JlZFRhc2tzID0gdGhpcy5fZ2V0VGFza3NGcm9tU3RvcmFnZSh0eXBlKTtcblx0XHRjb25zdCB0YXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW10gPSBbXTtcblx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCd0YXNrU2VydmljZS5nZXRTYXZlZFRhc2tzJywgJ0ZldGNoaW5nIHRhc2tzIGZyb20gdGFzayBzdG9yYWdlLicpLCB0cnVlKTtcblx0XHRmdW5jdGlvbiBhZGRUYXNrVG9NYXAobWFwOiBNYXA8c3RyaW5nLCAoVGFza0NvbmZpZy5JQ3VzdG9tVGFzayB8IFRhc2tDb25maWcuSUNvbmZpZ3VyaW5nVGFzaylbXT4sIGZvbGRlcjogc3RyaW5nIHwgdW5kZWZpbmVkLCB0YXNrOiBUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrKSB7XG5cdFx0XHRpZiAoZm9sZGVyICYmICFtYXAuaGFzKGZvbGRlcikpIHtcblx0XHRcdFx0bWFwLnNldChmb2xkZXIsIFtdKTtcblx0XHRcdH1cblx0XHRcdGlmIChmb2xkZXIgJiYgKGZvbGRlck1hcFtmb2xkZXJdIHx8IChmb2xkZXIgPT09IFVTRVJfVEFTS1NfR1JPVVBfS0VZKSkgJiYgdGFzaykge1xuXHRcdFx0XHRtYXAuZ2V0KGZvbGRlcikhLnB1c2godGFzayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZW50cnkgb2Ygc3RvcmVkVGFza3MuZW50cmllcygpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBlbnRyeVswXTtcblx0XHRcdFx0Y29uc3QgdGFzayA9IEpTT04ucGFyc2UoZW50cnlbMV0pO1xuXHRcdFx0XHRjb25zdCBmb2xkZXJJbmZvID0gdGhpcy5fZ2V0Rm9sZGVyRnJvbVRhc2tLZXkoa2V5KTtcblx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2UuZ2V0U2F2ZWRUYXNrcy5yZWFkaW5nJywgJ1JlYWRpbmcgdGFza3MgZnJvbSB0YXNrIHN0b3JhZ2UsIHswfSwgezF9LCB7Mn0nLCBrZXksIHRhc2ssIGZvbGRlckluZm8uZm9sZGVyKSwgdHJ1ZSk7XG5cdFx0XHRcdGFkZFRhc2tUb01hcChmb2xkZXJJbmZvLmlzV29ya3NwYWNlRmlsZSA/IHdvcmtzcGFjZVRvVGFza01hcCA6IGZvbGRlclRvVGFza3NNYXAsIGZvbGRlckluZm8uZm9sZGVyLCB0YXNrKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLmdldFNhdmVkVGFza3MuZXJyb3InLCAnRmV0Y2hpbmcgYSB0YXNrIGZyb20gdGFzayBzdG9yYWdlIGZhaWxlZDogezB9LicsIGVycm9yKSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVhZFRhc2tzTWFwOiBNYXA8c3RyaW5nLCAoVGFzayB8IENvbmZpZ3VyaW5nVGFzayk+ID0gbmV3IE1hcCgpO1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gcmVhZFRhc2tzKHRoYXQ6IEFic3RyYWN0VGFza1NlcnZpY2UsIG1hcDogTWFwPHN0cmluZywgKFRhc2tDb25maWcuSUN1c3RvbVRhc2sgfCBUYXNrQ29uZmlnLklDb25maWd1cmluZ1Rhc2spW10+LCBpc1dvcmtzcGFjZUZpbGU6IGJvb2xlYW4pIHtcblx0XHRcdGZvciAoY29uc3Qga2V5IG9mIG1hcC5rZXlzKCkpIHtcblx0XHRcdFx0Y29uc3QgY3VzdG9tOiBDdXN0b21UYXNrW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgY3VzdG9taXplZDogSVN0cmluZ0RpY3Rpb25hcnk8Q29uZmlndXJpbmdUYXNrPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRcdGNvbnN0IHRhc2tDb25maWdTb3VyY2UgPSAoZm9sZGVyTWFwW2tleV1cblx0XHRcdFx0XHQ/IChpc1dvcmtzcGFjZUZpbGVcblx0XHRcdFx0XHRcdD8gVGFza0NvbmZpZy5UYXNrQ29uZmlnU291cmNlLldvcmtzcGFjZUZpbGUgOiBUYXNrQ29uZmlnLlRhc2tDb25maWdTb3VyY2UuVGFza3NKc29uKVxuXHRcdFx0XHRcdDogVGFza0NvbmZpZy5UYXNrQ29uZmlnU291cmNlLlVzZXIpO1xuXHRcdFx0XHRhd2FpdCB0aGF0Ll9jb21wdXRlVGFza3NGb3JTaW5nbGVDb25maWcoZm9sZGVyTWFwW2tleV0gPz8gYXdhaXQgdGhhdC5fZ2V0QUZvbGRlcigpLCB7XG5cdFx0XHRcdFx0dmVyc2lvbjogJzIuMC4wJyxcblx0XHRcdFx0XHR0YXNrczogbWFwLmdldChrZXkpXG5cdFx0XHRcdH0sIFRhc2tSdW5Tb3VyY2UuU3lzdGVtLCBjdXN0b20sIGN1c3RvbWl6ZWQsIHRhc2tDb25maWdTb3VyY2UsIHRydWUpO1xuXHRcdFx0XHRjdXN0b20uZm9yRWFjaCh0YXNrID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXNrS2V5ID0gdGFzay5nZXRLZXkoKTtcblx0XHRcdFx0XHRpZiAodGFza0tleSkge1xuXHRcdFx0XHRcdFx0cmVhZFRhc2tzTWFwLnNldCh0YXNrS2V5LCB0YXNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbmZpZ3VyYXRpb24gb2YgT2JqZWN0LmtleXMoY3VzdG9taXplZCkpIHtcblx0XHRcdFx0XHRjb25zdCB0YXNrS2V5ID0gY3VzdG9taXplZFtjb25maWd1cmF0aW9uXS5nZXRLZXkoKTtcblx0XHRcdFx0XHRpZiAodGFza0tleSkge1xuXHRcdFx0XHRcdFx0cmVhZFRhc2tzTWFwLnNldCh0YXNrS2V5LCBjdXN0b21pemVkW2NvbmZpZ3VyYXRpb25dKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0YXdhaXQgcmVhZFRhc2tzKHRoaXMsIGZvbGRlclRvVGFza3NNYXAsIGZhbHNlKTtcblx0XHRhd2FpdCByZWFkVGFza3ModGhpcywgd29ya3NwYWNlVG9UYXNrTWFwLCB0cnVlKTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBzdG9yZWRUYXNrcy5rZXlzKCkpIHtcblx0XHRcdGlmIChyZWFkVGFza3NNYXAuaGFzKGtleSkpIHtcblx0XHRcdFx0dGFza3MucHVzaChyZWFkVGFza3NNYXAuZ2V0KGtleSkhKTtcblx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2UuZ2V0U2F2ZWRUYXNrcy5yZXNvbHZlZCcsICdSZXNvbHZlZCB0YXNrIHswfScsIGtleSksIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2UuZ2V0U2F2ZWRUYXNrcy51bnJlc29sdmVkJywgJ1VuYWJsZSB0byByZXNvbHZlIHRhc2sgezB9ICcsIGtleSksIHRydWUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGFza3M7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlUmVjZW50bHlVc2VkVGFzayh0YXNrUmVjZW50bHlVc2VkS2V5OiBzdHJpbmcpIHtcblx0XHRpZiAodGhpcy5fZ2V0VGFza3NGcm9tU3RvcmFnZSgnaGlzdG9yaWNhbCcpLmRlbGV0ZSh0YXNrUmVjZW50bHlVc2VkS2V5KSkge1xuXHRcdFx0dGhpcy5fc2F2ZVJlY2VudGx5VXNlZFRhc2tzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIHJlbW92ZVBlcnNpc3RlbnRUYXNrKGtleTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2UucmVtb3ZlUGVyc2lzdGVudFRhc2snLCAnUmVtb3ZpbmcgcGVyc2lzdGVudCB0YXNrIHswfScsIGtleSksIHRydWUpO1xuXHRcdGlmICh0aGlzLl9nZXRUYXNrc0Zyb21TdG9yYWdlKCdwZXJzaXN0ZW50JykuZGVsZXRlKGtleSkpIHtcblx0XHRcdHRoaXMuX3NhdmVQZXJzaXN0ZW50VGFza3MoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXRUYXNrTFJVQ2FjaGVMaW1pdCgpIHtcblx0XHRjb25zdCBxdWlja09wZW5IaXN0b3J5TGltaXQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KFFVSUNLT1BFTl9ISVNUT1JZX0xJTUlUX0NPTkZJRyk7XG5cdFx0aWYgKHRoaXMuX3JlY2VudGx5VXNlZFRhc2tzKSB7XG5cdFx0XHR0aGlzLl9yZWNlbnRseVVzZWRUYXNrcy5saW1pdCA9IHF1aWNrT3Blbkhpc3RvcnlMaW1pdDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZXRSZWNlbnRseVVzZWRUYXNrKHRhc2s6IFRhc2spOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQga2V5ID0gdGFzay5nZXRLZXkoKTtcblx0XHRpZiAoIUluTWVtb3J5VGFzay5pcyh0YXNrKSAmJiBrZXkpIHtcblx0XHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gdGhpcy5fY3JlYXRlQ3VzdG9taXphYmxlVGFzayh0YXNrKTtcblx0XHRcdGlmIChDb250cmlidXRlZFRhc2suaXModGFzaykgJiYgY3VzdG9taXphdGlvbnMpIHtcblx0XHRcdFx0Y29uc3QgY3VzdG9tOiBDdXN0b21UYXNrW10gPSBbXTtcblx0XHRcdFx0Y29uc3QgY3VzdG9taXplZDogSVN0cmluZ0RpY3Rpb25hcnk8Q29uZmlndXJpbmdUYXNrPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NvbXB1dGVUYXNrc0ZvclNpbmdsZUNvbmZpZyh0YXNrLl9zb3VyY2Uud29ya3NwYWNlRm9sZGVyID8/IHRoaXMud29ya3NwYWNlRm9sZGVyc1swXSwge1xuXHRcdFx0XHRcdHZlcnNpb246ICcyLjAuMCcsXG5cdFx0XHRcdFx0dGFza3M6IFtjdXN0b21pemF0aW9uc11cblx0XHRcdFx0fSwgVGFza1J1blNvdXJjZS5TeXN0ZW0sIGN1c3RvbSwgY3VzdG9taXplZCwgVGFza0NvbmZpZy5UYXNrQ29uZmlnU291cmNlLlRhc2tzSnNvbiwgdHJ1ZSk7XG5cdFx0XHRcdGZvciAoY29uc3QgY29uZmlndXJhdGlvbiBvZiBPYmplY3Qua2V5cyhjdXN0b21pemVkKSkge1xuXHRcdFx0XHRcdGtleSA9IGN1c3RvbWl6ZWRbY29uZmlndXJhdGlvbl0uZ2V0S2V5KCkhO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9nZXRUYXNrc0Zyb21TdG9yYWdlKCdoaXN0b3JpY2FsJykuc2V0KGtleSwgSlNPTi5zdHJpbmdpZnkoY3VzdG9taXphdGlvbnMpKTtcblx0XHRcdHRoaXMuX3NhdmVSZWNlbnRseVVzZWRUYXNrcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NhdmVSZWNlbnRseVVzZWRUYXNrcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3JlY2VudGx5VXNlZFRhc2tzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHF1aWNrT3Blbkhpc3RvcnlMaW1pdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oUVVJQ0tPUEVOX0hJU1RPUllfTElNSVRfQ09ORklHKTtcblx0XHQvLyBzZXR0aW5nIGhpc3RvcnkgbGltaXQgdG8gMCBtZWFucyBubyBMUlUgc29ydGluZ1xuXHRcdGlmIChxdWlja09wZW5IaXN0b3J5TGltaXQgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGtleXMgPSBbLi4udGhpcy5fcmVjZW50bHlVc2VkVGFza3Mua2V5cygpXTtcblx0XHRpZiAoa2V5cy5sZW5ndGggPiBxdWlja09wZW5IaXN0b3J5TGltaXQpIHtcblx0XHRcdGtleXMgPSBrZXlzLnNsaWNlKDAsIHF1aWNrT3Blbkhpc3RvcnlMaW1pdCk7XG5cdFx0fVxuXHRcdGNvbnN0IGtleVZhbHVlczogW3N0cmluZywgc3RyaW5nXVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2Yga2V5cykge1xuXHRcdFx0a2V5VmFsdWVzLnB1c2goW2tleSwgdGhpcy5fcmVjZW50bHlVc2VkVGFza3MuZ2V0KGtleSwgVG91Y2guTm9uZSkhXSk7XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFic3RyYWN0VGFza1NlcnZpY2UuUmVjZW50bHlVc2VkVGFza3NfS2V5VjIsIEpTT04uc3RyaW5naWZ5KGtleVZhbHVlcyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zZXRQZXJzaXN0ZW50VGFzayh0YXNrOiBUYXNrKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrU2V0dGluZ0lkLlJlY29ubmVjdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGtleSA9IHRhc2suZ2V0S2V5KCk7XG5cdFx0aWYgKCFJbk1lbW9yeVRhc2suaXModGFzaykgJiYga2V5KSB7XG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IHRoaXMuX2NyZWF0ZUN1c3RvbWl6YWJsZVRhc2sodGFzayk7XG5cdFx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spICYmIGN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGN1c3RvbTogQ3VzdG9tVGFza1tdID0gW107XG5cdFx0XHRcdGNvbnN0IGN1c3RvbWl6ZWQ6IElTdHJpbmdEaWN0aW9uYXJ5PENvbmZpZ3VyaW5nVGFzaz4gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb21wdXRlVGFza3NGb3JTaW5nbGVDb25maWcodGFzay5fc291cmNlLndvcmtzcGFjZUZvbGRlciA/PyB0aGlzLndvcmtzcGFjZUZvbGRlcnNbMF0sIHtcblx0XHRcdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0XHRcdHRhc2tzOiBbY3VzdG9taXphdGlvbnNdXG5cdFx0XHRcdH0sIFRhc2tSdW5Tb3VyY2UuU3lzdGVtLCBjdXN0b20sIGN1c3RvbWl6ZWQsIFRhc2tDb25maWcuVGFza0NvbmZpZ1NvdXJjZS5UYXNrc0pzb24sIHRydWUpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbmZpZ3VyYXRpb24gb2YgT2JqZWN0LmtleXMoY3VzdG9taXplZCkpIHtcblx0XHRcdFx0XHRrZXkgPSBjdXN0b21pemVkW2NvbmZpZ3VyYXRpb25dLmdldEtleSgpITtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCF0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlzQmFja2dyb3VuZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCd0YXNrU2VydmljZS5zZXRQZXJzaXN0ZW50VGFzaycsICdTZXR0aW5nIHBlcnNpc3RlbnQgdGFzayB7MH0nLCBrZXkpLCB0cnVlKTtcblx0XHRcdHRoaXMuX2dldFRhc2tzRnJvbVN0b3JhZ2UoJ3BlcnNpc3RlbnQnKS5zZXQoa2V5LCBKU09OLnN0cmluZ2lmeShjdXN0b21pemF0aW9ucykpO1xuXHRcdFx0dGhpcy5fc2F2ZVBlcnNpc3RlbnRUYXNrcygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NhdmVQZXJzaXN0ZW50VGFza3MoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVyc2lzdGVudFRhc2tzID0gdGhpcy5fZ2V0VGFza3NGcm9tU3RvcmFnZSgncGVyc2lzdGVudCcpO1xuXHRcdGNvbnN0IGtleXMgPSBbLi4udGhpcy5fcGVyc2lzdGVudFRhc2tzLmtleXMoKV07XG5cdFx0Y29uc3Qga2V5VmFsdWVzOiBbc3RyaW5nLCBzdHJpbmddW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG5cdFx0XHRrZXlWYWx1ZXMucHVzaChba2V5LCB0aGlzLl9wZXJzaXN0ZW50VGFza3MuZ2V0KGtleSwgVG91Y2guTm9uZSkhXSk7XG5cdFx0fVxuXHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3NhdmVQZXJzaXN0ZW50VGFzaycsICdTYXZpbmcgcGVyc2lzdGVudCB0YXNrczogezB9Jywga2V5cy5qb2luKCcsICcpKSwgdHJ1ZSk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoQWJzdHJhY3RUYXNrU2VydmljZS5QZXJzaXN0ZW50VGFza3NfS2V5LCBKU09OLnN0cmluZ2lmeShrZXlWYWx1ZXMpLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb3BlbkRvY3VtZW50YXRpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSgnaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvdGFza3MjX2RlZmluaW5nLWEtcHJvYmxlbS1tYXRjaGVyJykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluZFNpbmdsZVdvcmtzcGFjZVRhc2tPZkdyb3VwKGdyb3VwOiBUYXNrR3JvdXApOiBQcm9taXNlPElUYXNrU3VtbWFyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRhc2tzT2ZHcm91cCA9IGF3YWl0IHRoaXMuX2ZpbmRXb3Jrc3BhY2VUYXNrc0luR3JvdXAoZ3JvdXAsIHRydWUpO1xuXHRcdGlmICgodGFza3NPZkdyb3VwLmxlbmd0aCA9PT0gMSkgJiYgKHR5cGVvZiB0YXNrc09mR3JvdXBbMF0uY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgIT09ICdzdHJpbmcnKSAmJiB0YXNrc09mR3JvdXBbMF0uY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXA/LmlzRGVmYXVsdCkge1xuXHRcdFx0bGV0IHJlc29sdmVkVGFzazogVGFzayB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChDb25maWd1cmluZ1Rhc2suaXModGFza3NPZkdyb3VwWzBdKSkge1xuXHRcdFx0XHRyZXNvbHZlZFRhc2sgPSBhd2FpdCB0aGlzLnRyeVJlc29sdmVUYXNrKHRhc2tzT2ZHcm91cFswXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvbHZlZFRhc2sgPSB0YXNrc09mR3JvdXBbMF07XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzb2x2ZWRUYXNrKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJ1bihyZXNvbHZlZFRhc2ssIHVuZGVmaW5lZCwgVGFza1J1blNvdXJjZS5Vc2VyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2J1aWxkKCk6IFByb21pc2U8SVRhc2tTdW1tYXJ5PiB7XG5cdFx0Y29uc3QgdHJ5QnVpbGRTaG9ydGN1dCA9IGF3YWl0IHRoaXMuX2ZpbmRTaW5nbGVXb3Jrc3BhY2VUYXNrT2ZHcm91cChUYXNrR3JvdXAuQnVpbGQpO1xuXHRcdGlmICh0cnlCdWlsZFNob3J0Y3V0KSB7XG5cdFx0XHRyZXR1cm4gdHJ5QnVpbGRTaG9ydGN1dDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dldEdyb3VwZWRUYXNrc0FuZEV4ZWN1dGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1blRlc3QoKTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRjb25zdCB0cnlUZXN0U2hvcnRjdXQgPSBhd2FpdCB0aGlzLl9maW5kU2luZ2xlV29ya3NwYWNlVGFza09mR3JvdXAoVGFza0dyb3VwLlRlc3QpO1xuXHRcdGlmICh0cnlUZXN0U2hvcnRjdXQpIHtcblx0XHRcdHJldHVybiB0cnlUZXN0U2hvcnRjdXQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2dldEdyb3VwZWRUYXNrc0FuZEV4ZWN1dGUodHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRHcm91cGVkVGFza3NBbmRFeGVjdXRlKHRlc3Q/OiBib29sZWFuKTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRjb25zdCB0YXNrcyA9IGF3YWl0IHRoaXMuX2dldEdyb3VwZWRUYXNrcygpO1xuXHRcdGNvbnN0IHJ1bm5hYmxlID0gdGhpcy5fY3JlYXRlUnVubmFibGVUYXNrKHRhc2tzLCB0ZXN0ID8gVGFza0dyb3VwLlRlc3QgOiBUYXNrR3JvdXAuQnVpbGQpO1xuXHRcdGlmICghcnVubmFibGUgfHwgIXJ1bm5hYmxlLnRhc2spIHtcblx0XHRcdGlmICh0ZXN0KSB7XG5cdFx0XHRcdGlmICh0aGlzLnNjaGVtYVZlcnNpb24gPT09IEpzb25TY2hlbWFWZXJzaW9uLlYwXzFfMCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBUYXNrRXJyb3IoU2V2ZXJpdHkuSW5mbywgbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub1Rlc3RUYXNrMScsICdObyB0ZXN0IHRhc2sgZGVmaW5lZC4gTWFyayBhIHRhc2sgd2l0aCBcXCdpc1Rlc3RDb21tYW5kXFwnIGluIHRoZSB0YXNrcy5qc29uIGZpbGUuJyksIFRhc2tFcnJvcnMuTm9UZXN0VGFzayk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFRhc2tFcnJvcihTZXZlcml0eS5JbmZvLCBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vVGVzdFRhc2syJywgJ05vIHRlc3QgdGFzayBkZWZpbmVkLiBNYXJrIGEgdGFzayB3aXRoIGFzIGEgXFwndGVzdFxcJyBncm91cCBpbiB0aGUgdGFza3MuanNvbiBmaWxlLicpLCBUYXNrRXJyb3JzLk5vVGVzdFRhc2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMF8xXzApIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgVGFza0Vycm9yKFNldmVyaXR5LkluZm8sIG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9CdWlsZFRhc2sxJywgJ05vIGJ1aWxkIHRhc2sgZGVmaW5lZC4gTWFyayBhIHRhc2sgd2l0aCBcXCdpc0J1aWxkQ29tbWFuZFxcJyBpbiB0aGUgdGFza3MuanNvbiBmaWxlLicpLCBUYXNrRXJyb3JzLk5vQnVpbGRUYXNrKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgVGFza0Vycm9yKFNldmVyaXR5LkluZm8sIG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9CdWlsZFRhc2syJywgJ05vIGJ1aWxkIHRhc2sgZGVmaW5lZC4gTWFyayBhIHRhc2sgd2l0aCBhcyBhIFxcJ2J1aWxkXFwnIGdyb3VwIGluIHRoZSB0YXNrcy5qc29uIGZpbGUuJyksIFRhc2tFcnJvcnMuTm9CdWlsZFRhc2spO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGxldCBleGVjdXRlVGFza1Jlc3VsdDogSVRhc2tTdW1tYXJ5O1xuXHRcdHRyeSB7XG5cdFx0XHRleGVjdXRlVGFza1Jlc3VsdCA9IGF3YWl0IHRoaXMuX2V4ZWN1dGVUYXNrKHJ1bm5hYmxlLnRhc2ssIHJ1bm5hYmxlLnJlc29sdmVyLCBUYXNrUnVuU291cmNlLlVzZXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVFcnJvcihlcnJvcik7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuXHRcdH1cblx0XHRyZXR1cm4gZXhlY3V0ZVRhc2tSZXN1bHQ7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcnVuKHRhc2s6IFRhc2sgfCB1bmRlZmluZWQsIG9wdGlvbnM/OiBJUHJvYmxlbU1hdGNoZXJSdW5PcHRpb25zLCBydW5Tb3VyY2U6IFRhc2tSdW5Tb3VyY2UgPSBUYXNrUnVuU291cmNlLlN5c3RlbSk6IFByb21pc2U8SVRhc2tTdW1tYXJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fdHJ1c3QoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0YXNrKSB7XG5cdFx0XHR0aHJvdyBuZXcgVGFza0Vycm9yKFNldmVyaXR5LkluZm8sIG5scy5sb2NhbGl6ZSgnVGFza1NlcnZlci5ub1Rhc2snLCAnVGFzayB0byBleGVjdXRlIGlzIHVuZGVmaW5lZCcpLCBUYXNrRXJyb3JzLlRhc2tOb3RGb3VuZCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc29sdmVyID0gdGhpcy5fY3JlYXRlUmVzb2x2ZXIoKTtcblx0XHRsZXQgZXhlY3V0ZVRhc2tSZXN1bHQ6IElUYXNrU3VtbWFyeSB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0aWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5hdHRhY2hQcm9ibGVtTWF0Y2hlciAmJiB0aGlzLl9zaG91bGRBdHRhY2hQcm9ibGVtTWF0Y2hlcih0YXNrKSAmJiAhSW5NZW1vcnlUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdGNvbnN0IHRhc2tUb0V4ZWN1dGUgPSBhd2FpdCB0aGlzLl9hdHRhY2hQcm9ibGVtTWF0Y2hlcih0YXNrKTtcblx0XHRcdFx0aWYgKHRhc2tUb0V4ZWN1dGUpIHtcblx0XHRcdFx0XHRleGVjdXRlVGFza1Jlc3VsdCA9IGF3YWl0IHRoaXMuX2V4ZWN1dGVUYXNrKHRhc2tUb0V4ZWN1dGUsIHJlc29sdmVyLCBydW5Tb3VyY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRleGVjdXRlVGFza1Jlc3VsdCA9IGF3YWl0IHRoaXMuX2V4ZWN1dGVUYXNrKHRhc2ssIHJlc29sdmVyLCBydW5Tb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4ZWN1dGVUYXNrUmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9oYW5kbGVFcnJvcihlcnJvcik7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyb3IpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2lzUHJvdmlkZVRhc2tzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBzZXR0aW5nVmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrU2V0dGluZ0lkLkF1dG9EZXRlY3QpO1xuXHRcdHJldHVybiBzZXR0aW5nVmFsdWUgPT09ICdvbic7XG5cdH1cblxuXHRwcml2YXRlIF9pc1Byb2JsZW1NYXRjaGVyUHJvbXB0RW5hYmxlZCh0eXBlPzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2V0dGluZ1ZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUFJPQkxFTV9NQVRDSEVSX05FVkVSX0NPTkZJRyk7XG5cdFx0aWYgKFR5cGVzLmlzQm9vbGVhbihzZXR0aW5nVmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gIXNldHRpbmdWYWx1ZTtcblx0XHR9XG5cdFx0aWYgKHR5cGUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHNldHRpbmdWYWx1ZU1hcDogSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj4gPSBzZXR0aW5nVmFsdWUgYXMgSVN0cmluZ0RpY3Rpb25hcnk8Ym9vbGVhbj47XG5cdFx0cmV0dXJuICFzZXR0aW5nVmFsdWVNYXBbdHlwZV07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUeXBlRm9yVGFzayh0YXNrOiBUYXNrKTogc3RyaW5nIHtcblx0XHRsZXQgdHlwZTogc3RyaW5nO1xuXHRcdGlmIChDdXN0b21UYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRjb25zdCBjb25maWdQcm9wZXJ0aWVzID0gdGFzay5fc291cmNlLmNvbmZpZy5lbGVtZW50IGFzIFRhc2tDb25maWcuSUN1c3RvbVRhc2s7XG5cdFx0XHR0eXBlID0gY29uZmlnUHJvcGVydGllcy50eXBlID8/ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0eXBlID0gdGFzay5nZXREZWZpbml0aW9uKCkhLnR5cGU7XG5cdFx0fVxuXHRcdHJldHVybiB0eXBlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkQXR0YWNoUHJvYmxlbU1hdGNoZXIodGFzazogVGFzayk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9pc1Byb2JsZW1NYXRjaGVyUHJvbXB0RW5hYmxlZCh0aGlzLl9nZXRUeXBlRm9yVGFzayh0YXNrKSk7XG5cdFx0aWYgKGVuYWJsZWQgPT09IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fY2FuQ3VzdG9taXplKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwICE9PSB1bmRlZmluZWQgJiYgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCAhPT0gVGFza0dyb3VwLkJ1aWxkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyAhPT0gdW5kZWZpbmVkICYmIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0cmV0dXJuICF0YXNrLmhhc0RlZmluZWRNYXRjaGVycyAmJiAhIXRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzICYmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycy5sZW5ndGggPT09IDApO1xuXHRcdH1cblx0XHRpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0Y29uc3QgY29uZmlnUHJvcGVydGllcyA9IHRhc2suX3NvdXJjZS5jb25maWcuZWxlbWVudCBhcyBUYXNrQ29uZmlnLklDb25maWd1cmF0aW9uUHJvcGVydGllcztcblx0XHRcdHJldHVybiBjb25maWdQcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVyID09PSB1bmRlZmluZWQgJiYgIXRhc2suaGFzRGVmaW5lZE1hdGNoZXJzO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVOZXZlclByb2JsZW1NYXRjaGVyU2V0dGluZyh0eXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUFJPQkxFTV9NQVRDSEVSX05FVkVSX0NPTkZJRyk7XG5cdFx0aWYgKGN1cnJlbnQgPT09IHRydWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IG5ld1ZhbHVlOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPjtcblx0XHRpZiAoY3VycmVudCAhPT0gZmFsc2UpIHtcblx0XHRcdG5ld1ZhbHVlID0gY3VycmVudCBhcyBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bmV3VmFsdWUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdH1cblx0XHRuZXdWYWx1ZVt0eXBlXSA9IHRydWU7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKFBST0JMRU1fTUFUQ0hFUl9ORVZFUl9DT05GSUcsIG5ld1ZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2F0dGFjaFByb2JsZW1NYXRjaGVyKHRhc2s6IENvbnRyaWJ1dGVkVGFzayB8IEN1c3RvbVRhc2spOiBQcm9taXNlPFRhc2sgfCB1bmRlZmluZWQ+IHtcblx0XHRpbnRlcmZhY2UgSVByb2JsZW1NYXRjaGVyUGlja0VudHJ5IGV4dGVuZHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRcdFx0bWF0Y2hlcjogSU5hbWVkUHJvYmxlbU1hdGNoZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRuZXZlcj86IGJvb2xlYW47XG5cdFx0XHRsZWFybk1vcmU/OiBib29sZWFuO1xuXHRcdFx0c2V0dGluZz86IHN0cmluZztcblx0XHR9XG5cdFx0bGV0IGVudHJpZXM6IFF1aWNrUGlja0lucHV0PElQcm9ibGVtTWF0Y2hlclBpY2tFbnRyeT5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIFByb2JsZW1NYXRjaGVyUmVnaXN0cnkua2V5cygpKSB7XG5cdFx0XHRjb25zdCBtYXRjaGVyID0gUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5nZXQoa2V5KTtcblx0XHRcdGlmIChtYXRjaGVyLmRlcHJlY2F0ZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAobWF0Y2hlci5uYW1lID09PSBtYXRjaGVyLmxhYmVsKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IGxhYmVsOiBtYXRjaGVyLm5hbWUsIG1hdGNoZXI6IG1hdGNoZXIgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRcdGxhYmVsOiBtYXRjaGVyLmxhYmVsLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBgJCR7bWF0Y2hlci5uYW1lfWAsXG5cdFx0XHRcdFx0bWF0Y2hlcjogbWF0Y2hlclxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJpZXMgPSBlbnRyaWVzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdGlmIChhLmxhYmVsICYmIGIubGFiZWwpIHtcblx0XHRcdFx0cmV0dXJuIGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGVudHJpZXMudW5zaGlmdCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5hc3NvY2lhdGUnLCAnYXNzb2NpYXRlJykgfSk7XG5cdFx0bGV0IHRhc2tUeXBlOiBzdHJpbmc7XG5cdFx0aWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ1Byb3BlcnRpZXMgPSB0YXNrLl9zb3VyY2UuY29uZmlnLmVsZW1lbnQgYXMgVGFza0NvbmZpZy5JQ3VzdG9tVGFzaztcblx0XHRcdHRhc2tUeXBlID0gY29uZmlnUHJvcGVydGllcy50eXBlID8/ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0YXNrVHlwZSA9IHRhc2suZ2V0RGVmaW5pdGlvbigpLnR5cGU7XG5cdFx0fVxuXHRcdGVudHJpZXMudW5zaGlmdChcblx0XHRcdHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuYXR0YWNoUHJvYmxlbU1hdGNoZXIuY29udGludWVXaXRob3V0JywgJ0NvbnRpbnVlIHdpdGhvdXQgc2Nhbm5pbmcgdGhlIHRhc2sgb3V0cHV0JyksIG1hdGNoZXI6IHVuZGVmaW5lZCB9LFxuXHRcdFx0eyBsYWJlbDogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5hdHRhY2hQcm9ibGVtTWF0Y2hlci5uZXZlcicsICdOZXZlciBzY2FuIHRoZSB0YXNrIG91dHB1dCBmb3IgdGhpcyB0YXNrJyksIG1hdGNoZXI6IHVuZGVmaW5lZCwgbmV2ZXI6IHRydWUgfSxcblx0XHRcdHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuYXR0YWNoUHJvYmxlbU1hdGNoZXIubmV2ZXJUeXBlJywgJ05ldmVyIHNjYW4gdGhlIHRhc2sgb3V0cHV0IGZvciB7MH0gdGFza3MnLCB0YXNrVHlwZSksIG1hdGNoZXI6IHVuZGVmaW5lZCwgc2V0dGluZzogdGFza1R5cGUgfSxcblx0XHRcdHsgbGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuYXR0YWNoUHJvYmxlbU1hdGNoZXIubGVhcm5Nb3JlQWJvdXQnLCAnTGVhcm4gbW9yZSBhYm91dCBzY2FubmluZyB0aGUgdGFzayBvdXRwdXQnKSwgbWF0Y2hlcjogdW5kZWZpbmVkLCBsZWFybk1vcmU6IHRydWUgfVxuXHRcdCk7XG5cdFx0Y29uc3QgcHJvYmxlbU1hdGNoZXIgPSBhd2FpdCB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrKGVudHJpZXMsIHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnc2VsZWN0UHJvYmxlbU1hdGNoZXInLCAnU2VsZWN0IGZvciB3aGljaCBraW5kIG9mIGVycm9ycyBhbmQgd2FybmluZ3MgdG8gc2NhbiB0aGUgdGFzayBvdXRwdXQnKSB9KTtcblx0XHRpZiAoIXByb2JsZW1NYXRjaGVyKSB7XG5cdFx0XHRyZXR1cm4gdGFzaztcblx0XHR9XG5cdFx0aWYgKHByb2JsZW1NYXRjaGVyLmxlYXJuTW9yZSkge1xuXHRcdFx0dGhpcy5fb3BlbkRvY3VtZW50YXRpb24oKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChwcm9ibGVtTWF0Y2hlci5uZXZlcikge1xuXHRcdFx0dGhpcy5jdXN0b21pemUodGFzaywgeyBwcm9ibGVtTWF0Y2hlcjogW10gfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm4gdGFzaztcblx0XHR9XG5cdFx0aWYgKHByb2JsZW1NYXRjaGVyLm1hdGNoZXIpIHtcblx0XHRcdGNvbnN0IG5ld1Rhc2sgPSB0YXNrLmNsb25lKCk7XG5cdFx0XHRjb25zdCBtYXRjaGVyUmVmZXJlbmNlID0gYCQke3Byb2JsZW1NYXRjaGVyLm1hdGNoZXIubmFtZX1gO1xuXHRcdFx0Y29uc3QgcHJvcGVydGllczogSUN1c3RvbWl6YXRpb25Qcm9wZXJ0aWVzID0geyBwcm9ibGVtTWF0Y2hlcjogW21hdGNoZXJSZWZlcmVuY2VdIH07XG5cdFx0XHRuZXdUYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycyA9IFttYXRjaGVyUmVmZXJlbmNlXTtcblx0XHRcdGNvbnN0IG1hdGNoZXIgPSBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5LmdldChwcm9ibGVtTWF0Y2hlci5tYXRjaGVyLm5hbWUpO1xuXHRcdFx0aWYgKG1hdGNoZXIgJiYgbWF0Y2hlci53YXRjaGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHByb3BlcnRpZXMuaXNCYWNrZ3JvdW5kID0gdHJ1ZTtcblx0XHRcdFx0bmV3VGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jdXN0b21pemUodGFzaywgcHJvcGVydGllcywgdHJ1ZSk7XG5cdFx0XHRyZXR1cm4gbmV3VGFzaztcblx0XHR9XG5cdFx0aWYgKHByb2JsZW1NYXRjaGVyLnNldHRpbmcpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZU5ldmVyUHJvYmxlbU1hdGNoZXJTZXR0aW5nKHByb2JsZW1NYXRjaGVyLnNldHRpbmcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGFzaztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFRhc2tzRm9yR3JvdXAoZ3JvdXA6IFRhc2tHcm91cCwgd2FpdFRvQWN0aXZhdGU/OiBib29sZWFuKTogUHJvbWlzZTxUYXNrW10+IHtcblx0XHRjb25zdCBncm91cHMgPSBhd2FpdCB0aGlzLl9nZXRHcm91cGVkVGFza3ModW5kZWZpbmVkLCB3YWl0VG9BY3RpdmF0ZSk7XG5cdFx0Y29uc3QgcmVzdWx0OiBUYXNrW10gPSBbXTtcblx0XHRncm91cHMuZm9yRWFjaCh0YXNrcyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0Y29uc3QgY29uZmlnVGFza0dyb3VwID0gVGFza0dyb3VwLmZyb20odGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCk7XG5cdFx0XHRcdGlmIChjb25maWdUYXNrR3JvdXA/Ll9pZCA9PT0gZ3JvdXAuX2lkKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2godGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIG5lZWRzRm9sZGVyUXVhbGlmaWNhdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuQ3VzdG9taXplKHRhc2s6IFRhc2spOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uICE9PSBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRyZXR1cm4gISF0YXNrLmdldFdvcmtzcGFjZUZvbGRlcigpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mb3JtYXRUYXNrRm9ySnNvbihyZXNvdXJjZTogVVJJLCB0YXNrOiBUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRsZXQgcmVmZXJlbmNlOiBJUmVmZXJlbmNlPElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbD4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHN0cmluZ1ZhbHVlOiBzdHJpbmcgPSAnJztcblx0XHR0cnkge1xuXHRcdFx0cmVmZXJlbmNlID0gYXdhaXQgdGhpcy5fdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IG1vZGVsID0gcmVmZXJlbmNlLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRjb25zdCB7IHRhYlNpemUsIGluc2VydFNwYWNlcyB9ID0gbW9kZWwuZ2V0T3B0aW9ucygpO1xuXHRcdFx0Y29uc3QgZW9sID0gbW9kZWwuZ2V0RU9MKCk7XG5cdFx0XHRsZXQgc3RyaW5naWZpZWQgPSB0b0Zvcm1hdHRlZFN0cmluZyh0YXNrLCB7IGVvbCwgdGFiU2l6ZSwgaW5zZXJ0U3BhY2VzIH0pO1xuXHRcdFx0Y29uc3QgcmVnZXggPSBuZXcgUmVnRXhwKGVvbCArIChpbnNlcnRTcGFjZXMgPyAnICcucmVwZWF0KHRhYlNpemUpIDogJ1xcXFx0JyksICdnJyk7XG5cdFx0XHRzdHJpbmdpZmllZCA9IHN0cmluZ2lmaWVkLnJlcGxhY2UocmVnZXgsIGVvbCArIChpbnNlcnRTcGFjZXMgPyAnICcucmVwZWF0KHRhYlNpemUgKiAzKSA6ICdcXHRcXHRcXHQnKSk7XG5cdFx0XHRjb25zdCB0d29UYWJzID0gaW5zZXJ0U3BhY2VzID8gJyAnLnJlcGVhdCh0YWJTaXplICogMikgOiAnXFx0XFx0Jztcblx0XHRcdHN0cmluZ1ZhbHVlID0gdHdvVGFicyArIHN0cmluZ2lmaWVkLnNsaWNlKDAsIHN0cmluZ2lmaWVkLmxlbmd0aCAtIDEpICsgdHdvVGFicyArIHN0cmluZ2lmaWVkLnNsaWNlKHN0cmluZ2lmaWVkLmxlbmd0aCAtIDEpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWZlcmVuY2U/LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0cmluZ1ZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb3BlbkVkaXRvckF0VGFzayhyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCB0YXNrOiBUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrIHwgc3RyaW5nIHwgdW5kZWZpbmVkLCBjb25maWdJbmRleDogbnVtYmVyID0gLTEpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAocmVzb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShmYWxzZSk7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVDb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBmaWxlQ29udGVudC52YWx1ZTtcblx0XHRpZiAoIWNvbnRlbnQgfHwgIXRhc2spIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgY29udGVudFZhbHVlID0gY29udGVudC50b1N0cmluZygpO1xuXHRcdGxldCBzdHJpbmdWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjb25maWdJbmRleCAhPT0gLTEpIHtcblx0XHRcdGNvbnN0IGpzb246IFRhc2tDb25maWcuSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uPigndGFza3MnLCB7IHJlc291cmNlIH0pO1xuXHRcdFx0aWYgKGpzb24udGFza3MgJiYgKGpzb24udGFza3MubGVuZ3RoID4gY29uZmlnSW5kZXgpKSB7XG5cdFx0XHRcdHN0cmluZ1ZhbHVlID0gYXdhaXQgdGhpcy5fZm9ybWF0VGFza0Zvckpzb24ocmVzb3VyY2UsIGpzb24udGFza3NbY29uZmlnSW5kZXhdKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFzdHJpbmdWYWx1ZSkge1xuXHRcdFx0aWYgKHR5cGVvZiB0YXNrID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRzdHJpbmdWYWx1ZSA9IHRhc2s7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzdHJpbmdWYWx1ZSA9IGF3YWl0IHRoaXMuX2Zvcm1hdFRhc2tGb3JKc29uKHJlc291cmNlLCB0YXNrKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbmRleCA9IGNvbnRlbnRWYWx1ZS5pbmRleE9mKHN0cmluZ1ZhbHVlKTtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyID0gMTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGluZGV4OyBpKyspIHtcblx0XHRcdGlmIChjb250ZW50VmFsdWUuY2hhckF0KGkpID09PSAnXFxuJykge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXIrKztcblx0XHRcdH1cblx0XHR9XG5cdFx0bGV0IGVuZExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzdHJpbmdWYWx1ZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKHN0cmluZ1ZhbHVlLmNoYXJBdChpKSA9PT0gJ1xcbicpIHtcblx0XHRcdFx0ZW5kTGluZU51bWJlcisrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBzdGFydExpbmVOdW1iZXIgPiAxID8geyBzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBzdGFydExpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXIgPyA0IDogMywgZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiBzdGFydExpbmVOdW1iZXIgPT09IGVuZExpbmVOdW1iZXIgPyB1bmRlZmluZWQgOiA0IH0gOiB1bmRlZmluZWQ7XG5cblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdHBpbm5lZDogZmFsc2UsXG5cdFx0XHRcdGZvcmNlUmVsb2FkOiB0cnVlLCAvLyBiZWNhdXNlIGNvbnRlbnQgbWlnaHQgaGF2ZSBjaGFuZ2VkXG5cdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0c2VsZWN0aW9uUmV2ZWFsVHlwZTogVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUuQ2VudGVySWZPdXRzaWRlVmlld3BvcnRcblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gISFzZWxlY3Rpb247XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDdXN0b21pemFibGVUYXNrKHRhc2s6IENvbnRyaWJ1dGVkVGFzayB8IEN1c3RvbVRhc2sgfCBDb25maWd1cmluZ1Rhc2spOiBUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgdG9DdXN0b21pemU6IFRhc2tDb25maWcuSUN1c3RvbVRhc2sgfCBUYXNrQ29uZmlnLklDb25maWd1cmluZ1Rhc2sgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdGFza0NvbmZpZyA9IEN1c3RvbVRhc2suaXModGFzaykgfHwgQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spID8gdGFzay5fc291cmNlLmNvbmZpZyA6IHVuZGVmaW5lZDtcblx0XHRpZiAodGFza0NvbmZpZyAmJiB0YXNrQ29uZmlnLmVsZW1lbnQpIHtcblx0XHRcdHRvQ3VzdG9taXplID0geyAuLi4odGFza0NvbmZpZy5lbGVtZW50KSB9O1xuXHRcdH0gZWxzZSBpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHR0b0N1c3RvbWl6ZSA9IHtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpZGVudGlmaWVyOiBUYXNrQ29uZmlnLklUYXNrSWRlbnRpZmllciA9IE9iamVjdC5hc3NpZ24oT2JqZWN0LmNyZWF0ZShudWxsKSwgdGFzay5kZWZpbmVzKTtcblx0XHRcdGRlbGV0ZSBpZGVudGlmaWVyWydfa2V5J107XG5cdFx0XHRPYmplY3Qua2V5cyhpZGVudGlmaWVyKS5mb3JFYWNoKGtleSA9PiAodG9DdXN0b21pemUgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikhW2tleV0gPSBpZGVudGlmaWVyW2tleV0pO1xuXHRcdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzICYmIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLmxlbmd0aCA+IDAgJiYgVHlwZXMuaXNTdHJpbmdBcnJheSh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycykpIHtcblx0XHRcdFx0dG9DdXN0b21pemUucHJvYmxlbU1hdGNoZXIgPSB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycztcblx0XHRcdH1cblx0XHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmdyb3VwKSB7XG5cdFx0XHRcdHRvQ3VzdG9taXplLmdyb3VwID0gVGFza0NvbmZpZy5Hcm91cEtpbmQudG8odGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdG9DdXN0b21pemUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0b0N1c3RvbWl6ZS5wcm9ibGVtTWF0Y2hlciA9PT0gdW5kZWZpbmVkICYmIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzID09PSB1bmRlZmluZWQgfHwgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzICYmIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXJzLmxlbmd0aCA9PT0gMCkpIHtcblx0XHRcdHRvQ3VzdG9taXplLnByb2JsZW1NYXRjaGVyID0gW107XG5cdFx0fVxuXHRcdGlmICh0YXNrLl9zb3VyY2UubGFiZWwgIT09ICdXb3Jrc3BhY2UnKSB7XG5cdFx0XHR0b0N1c3RvbWl6ZS5sYWJlbCA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllcjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dG9DdXN0b21pemUubGFiZWwgPSB0YXNrLl9sYWJlbDtcblx0XHR9XG5cdFx0dG9DdXN0b21pemUuZGV0YWlsID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXRhaWw7XG5cdFx0cmV0dXJuIHRvQ3VzdG9taXplO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGN1c3RvbWl6ZSh0YXNrOiBDb250cmlidXRlZFRhc2sgfCBDdXN0b21UYXNrIHwgQ29uZmlndXJpbmdUYXNrLCBwcm9wZXJ0aWVzPzogSUN1c3RvbWl6YXRpb25Qcm9wZXJ0aWVzLCBvcGVuQ29uZmlnPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghKGF3YWl0IHRoaXMuX3RydXN0KCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRpZiAoIXdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5fZ2V0Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIsIHRhc2suX3NvdXJjZS5raW5kKTtcblx0XHRpZiAoY29uZmlndXJhdGlvbi5oYXNQYXJzZUVycm9ycykge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS53YXJuKG5scy5sb2NhbGl6ZSgnY3VzdG9taXplUGFyc2VFcnJvcnMnLCAnVGhlIGN1cnJlbnQgdGFzayBjb25maWd1cmF0aW9uIGhhcyBlcnJvcnMuIFBsZWFzZSBmaXggdGhlIGVycm9ycyBmaXJzdCBiZWZvcmUgY3VzdG9taXppbmcgYSB0YXNrLicpKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8dm9pZD4odW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlQ29uZmlnID0gY29uZmlndXJhdGlvbi5jb25maWc7XG5cdFx0Y29uc3QgdG9DdXN0b21pemUgPSB0aGlzLl9jcmVhdGVDdXN0b21pemFibGVUYXNrKHRhc2spO1xuXHRcdGlmICghdG9DdXN0b21pemUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCA9IEN1c3RvbVRhc2suaXModGFzaykgPyB0YXNrLl9zb3VyY2UuY29uZmlnLmluZGV4IDogdW5kZWZpbmVkO1xuXHRcdGlmIChwcm9wZXJ0aWVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3BlcnR5IG9mIE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHByb3BlcnRpZXMpKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gKHByb3BlcnRpZXMgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW3Byb3BlcnR5XTtcblx0XHRcdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwpIHtcblx0XHRcdFx0XHQodG9DdXN0b21pemUgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbcHJvcGVydHldID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWZpbGVDb25maWcpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0ge1xuXHRcdFx0XHR2ZXJzaW9uOiAnMi4wLjAnLFxuXHRcdFx0XHR0YXNrczogW3RvQ3VzdG9taXplXVxuXHRcdFx0fTtcblx0XHRcdGxldCBjb250ZW50ID0gW1xuXHRcdFx0XHQneycsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgndGFza3NKc29uQ29tbWVudCcsICdcXHQvLyBTZWUgaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkPTczMzU1OCBcXG5cXHQvLyBmb3IgdGhlIGRvY3VtZW50YXRpb24gYWJvdXQgdGhlIHRhc2tzLmpzb24gZm9ybWF0JyksXG5cdFx0XHRdLmpvaW4oJ1xcbicpICsgSlNPTi5zdHJpbmdpZnkodmFsdWUsIG51bGwsICdcXHQnKS5zdWJzdHIoMSk7XG5cdFx0XHRjb25zdCBlZGl0b3JDb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IGVkaXRvcjogeyBpbnNlcnRTcGFjZXM6IGJvb2xlYW47IHRhYlNpemU6IG51bWJlciB9IH0+KCk7XG5cdFx0XHRpZiAoZWRpdG9yQ29uZmlnLmVkaXRvci5pbnNlcnRTcGFjZXMpIHtcblx0XHRcdFx0Y29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvKFxcbikoXFx0KykvZywgKF8sIHMxLCBzMikgPT4gczEgKyAnICcucmVwZWF0KHMyLmxlbmd0aCAqIGVkaXRvckNvbmZpZy5lZGl0b3IudGFiU2l6ZSkpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fdGV4dEZpbGVTZXJ2aWNlLmNyZWF0ZShbeyByZXNvdXJjZTogd29ya3NwYWNlRm9sZGVyLnRvUmVzb3VyY2UoJy52c2NvZGUvdGFza3MuanNvbicpLCB2YWx1ZTogY29udGVudCB9XSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFdlIGhhdmUgYSBnbG9iYWwgdGFzayBjb25maWd1cmF0aW9uXG5cdFx0XHRpZiAoKGluZGV4ID09PSAtMSkgJiYgcHJvcGVydGllcykge1xuXHRcdFx0XHRpZiAocHJvcGVydGllcy5wcm9ibGVtTWF0Y2hlciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZmlsZUNvbmZpZy5wcm9ibGVtTWF0Y2hlciA9IHByb3BlcnRpZXMucHJvYmxlbU1hdGNoZXI7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fd3JpdGVDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlciwgJ3Rhc2tzLnByb2JsZW1NYXRjaGVycycsIGZpbGVDb25maWcucHJvYmxlbU1hdGNoZXIsIHRhc2suX3NvdXJjZS5raW5kKTtcblx0XHRcdFx0fSBlbHNlIGlmIChwcm9wZXJ0aWVzLmdyb3VwICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRmaWxlQ29uZmlnLmdyb3VwID0gcHJvcGVydGllcy5ncm91cDtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl93cml0ZUNvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyLCAndGFza3MuZ3JvdXAnLCBmaWxlQ29uZmlnLmdyb3VwLCB0YXNrLl9zb3VyY2Uua2luZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShmaWxlQ29uZmlnLnRhc2tzKSkge1xuXHRcdFx0XHRcdGZpbGVDb25maWcudGFza3MgPSBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGZpbGVDb25maWcudGFza3MucHVzaCh0b0N1c3RvbWl6ZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZmlsZUNvbmZpZy50YXNrc1tpbmRleF0gPSB0b0N1c3RvbWl6ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGlzLl93cml0ZUNvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyLCAndGFza3MudGFza3MnLCBmaWxlQ29uZmlnLnRhc2tzLCB0YXNrLl9zb3VyY2Uua2luZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9wZW5Db25maWcpIHtcblx0XHRcdHRoaXMuX29wZW5FZGl0b3JBdFRhc2sodGhpcy5fZ2V0UmVzb3VyY2VGb3JUYXNrKHRhc2spLCB0b0N1c3RvbWl6ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfd3JpdGVDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwga2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBzb3VyY2U/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgdGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdHN3aXRjaCAoc291cmNlKSB7XG5cdFx0XHRjYXNlIFRhc2tTb3VyY2VLaW5kLlVzZXI6IHRhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUjsgYnJlYWs7XG5cdFx0XHRjYXNlIFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGU6IHRhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOyBicmVhaztcblx0XHRcdGRlZmF1bHQ6IGlmICh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdFx0dGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0XHR0YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCB7IHJlc291cmNlOiB3b3Jrc3BhY2VGb2xkZXIudXJpIH0sIHRhcmdldCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UmVzb3VyY2VGb3JLaW5kKGtpbmQ6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0dGhpcy5fdXBkYXRlU2V0dXAoKTtcblx0XHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRcdGNhc2UgVGFza1NvdXJjZUtpbmQuVXNlcjoge1xuXHRcdFx0XHRyZXR1cm4gcmVzb3VyY2VzLmpvaW5QYXRoKHJlc291cmNlcy5kaXJuYW1lKHRoaXMuX3ByZWZlcmVuY2VzU2VydmljZS51c2VyU2V0dGluZ3NSZXNvdXJjZSksICd0YXNrcy5qc29uJyk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGU6IHtcblx0XHRcdFx0aWYgKHRoaXMuX3dvcmtzcGFjZSAmJiB0aGlzLl93b3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2UuY29uZmlndXJhdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFJlc291cmNlRm9yVGFzayh0YXNrOiBDdXN0b21UYXNrIHwgQ29uZmlndXJpbmdUYXNrIHwgQ29udHJpYnV0ZWRUYXNrKTogVVJJIHtcblx0XHRpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0bGV0IHVyaSA9IHRoaXMuX2dldFJlc291cmNlRm9yS2luZCh0YXNrLl9zb3VyY2Uua2luZCk7XG5cdFx0XHRpZiAoIXVyaSkge1xuXHRcdFx0XHRjb25zdCB0YXNrRm9sZGVyID0gdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKTtcblx0XHRcdFx0aWYgKHRhc2tGb2xkZXIpIHtcblx0XHRcdFx0XHR1cmkgPSB0YXNrRm9sZGVyLnRvUmVzb3VyY2UodGFzay5fc291cmNlLmNvbmZpZy5maWxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR1cmkgPSB0aGlzLndvcmtzcGFjZUZvbGRlcnNbMF0udXJpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGFzay5nZXRXb3Jrc3BhY2VGb2xkZXIoKSEudG9SZXNvdXJjZSgnLnZzY29kZS90YXNrcy5qc29uJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGFzeW5jIG9wZW5Db25maWcodGFzazogQ3VzdG9tVGFzayB8IENvbmZpZ3VyaW5nVGFzayB8IHVuZGVmaW5lZCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCByZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0YXNrKSB7XG5cdFx0XHRyZXNvdXJjZSA9IHRoaXMuX2dldFJlc291cmNlRm9yVGFzayh0YXNrKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2UgPSAodGhpcy5fd29ya3NwYWNlRm9sZGVycyAmJiAodGhpcy5fd29ya3NwYWNlRm9sZGVycy5sZW5ndGggPiAwKSkgPyB0aGlzLl93b3Jrc3BhY2VGb2xkZXJzWzBdLnRvUmVzb3VyY2UoJy52c2NvZGUvdGFza3MuanNvbicpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fb3BlbkVkaXRvckF0VGFzayhyZXNvdXJjZSwgdGFzayA/IHRhc2suX2xhYmVsIDogdW5kZWZpbmVkLCB0YXNrID8gdGFzay5fc291cmNlLmNvbmZpZy5pbmRleCA6IC0xKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVJ1bm5hYmxlVGFzayh0YXNrczogVGFza01hcCwgZ3JvdXA6IFRhc2tHcm91cCk6IHsgdGFzazogVGFzazsgcmVzb2x2ZXI6IElUYXNrUmVzb2x2ZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aW50ZXJmYWNlIElSZXNvbHZlckRhdGEge1xuXHRcdFx0aWQ6IE1hcDxzdHJpbmcsIFRhc2s+O1xuXHRcdFx0bGFiZWw6IE1hcDxzdHJpbmcsIFRhc2s+O1xuXHRcdFx0aWRlbnRpZmllcjogTWFwPHN0cmluZywgVGFzaz47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzb2x2ZXJEYXRhOiBNYXA8c3RyaW5nLCBJUmVzb2x2ZXJEYXRhPiA9IG5ldyBNYXAoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VUYXNrczogVGFza1tdID0gW107XG5cdFx0Y29uc3QgZXh0ZW5zaW9uVGFza3M6IFRhc2tbXSA9IFtdO1xuXHRcdHRhc2tzLmZvckVhY2goKHRhc2tzLCBmb2xkZXIpID0+IHtcblx0XHRcdGxldCBkYXRhID0gcmVzb2x2ZXJEYXRhLmdldChmb2xkZXIpO1xuXHRcdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRcdGRhdGEgPSB7XG5cdFx0XHRcdFx0aWQ6IG5ldyBNYXA8c3RyaW5nLCBUYXNrPigpLFxuXHRcdFx0XHRcdGxhYmVsOiBuZXcgTWFwPHN0cmluZywgVGFzaz4oKSxcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBuZXcgTWFwPHN0cmluZywgVGFzaz4oKVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXNvbHZlckRhdGEuc2V0KGZvbGRlciwgZGF0YSk7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0ZGF0YS5pZC5zZXQodGFzay5faWQsIHRhc2spO1xuXHRcdFx0XHRkYXRhLmxhYmVsLnNldCh0YXNrLl9sYWJlbCwgdGFzayk7XG5cdFx0XHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmlkZW50aWZpZXIpIHtcblx0XHRcdFx0XHRkYXRhLmlkZW50aWZpZXIuc2V0KHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciwgdGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGdyb3VwICYmIHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXAgPT09IGdyb3VwKSB7XG5cdFx0XHRcdFx0aWYgKHRhc2suX3NvdXJjZS5raW5kID09PSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRcdHdvcmtzcGFjZVRhc2tzLnB1c2godGFzayk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvblRhc2tzLnB1c2godGFzayk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzb2x2ZXI6IElUYXNrUmVzb2x2ZXIgPSB7XG5cdFx0XHRyZXNvbHZlOiBhc3luYyAodXJpOiBVUkkgfCBzdHJpbmcsIGFsaWFzOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IHJlc29sdmVyRGF0YS5nZXQodHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgPyB1cmkgOiB1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGlmICghZGF0YSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGRhdGEuaWQuZ2V0KGFsaWFzKSB8fCBkYXRhLmxhYmVsLmdldChhbGlhcykgfHwgZGF0YS5pZGVudGlmaWVyLmdldChhbGlhcyk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRpZiAod29ya3NwYWNlVGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0aWYgKHdvcmtzcGFjZVRhc2tzLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZSgnbW9yZVRoYW5PbmVCdWlsZFRhc2snLCAnVGhlcmUgYXJlIG1hbnkgYnVpbGQgdGFza3MgZGVmaW5lZCBpbiB0aGUgdGFza3MuanNvbi4gRXhlY3V0aW5nIHRoZSBmaXJzdCBvbmUuJykpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdGFzazogd29ya3NwYWNlVGFza3NbMF0sIHJlc29sdmVyIH07XG5cdFx0fVxuXHRcdGlmIChleHRlbnNpb25UYXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gV2UgY2FuIG9ubHkgaGF2ZSBleHRlbnNpb24gdGFza3MgaWYgd2UgYXJlIGluIHZlcnNpb24gMi4wLjAuIFRoZW4gd2UgY2FuIGV2ZW4gcnVuXG5cdFx0Ly8gbXVsdGlwbGUgYnVpbGQgdGFza3MuXG5cdFx0aWYgKGV4dGVuc2lvblRhc2tzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIHsgdGFzazogZXh0ZW5zaW9uVGFza3NbMF0sIHJlc29sdmVyIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGlkOiBzdHJpbmcgPSBVVUlELmdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0Y29uc3QgdGFzazogSW5NZW1vcnlUYXNrID0gbmV3IEluTWVtb3J5VGFzayhcblx0XHRcdFx0aWQsXG5cdFx0XHRcdHsga2luZDogVGFza1NvdXJjZUtpbmQuSW5NZW1vcnksIGxhYmVsOiAnaW5NZW1vcnknIH0sXG5cdFx0XHRcdGlkLFxuXHRcdFx0XHQnaW5NZW1vcnknLFxuXHRcdFx0XHR7IHJlZXZhbHVhdGVPblJlcnVuOiB0cnVlIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGVudGlmaWVyOiBpZCxcblx0XHRcdFx0XHRkZXBlbmRzT246IGV4dGVuc2lvblRhc2tzLm1hcCgoZXh0ZW5zaW9uVGFzaykgPT4geyByZXR1cm4geyB1cmk6IGV4dGVuc2lvblRhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCkhLnVyaSwgdGFzazogZXh0ZW5zaW9uVGFzay5faWQgfTsgfSksXG5cdFx0XHRcdFx0bmFtZTogaWRcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdHJldHVybiB7IHRhc2ssIHJlc29sdmVyIH07XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUmVzb2x2ZXIoZ3JvdXBlZD86IFRhc2tNYXApOiBJVGFza1Jlc29sdmVyIHtcblx0XHRpbnRlcmZhY2UgUmVzb2x2ZXJEYXRhIHtcblx0XHRcdGxhYmVsOiBNYXA8c3RyaW5nLCBUYXNrPjtcblx0XHRcdGlkZW50aWZpZXI6IE1hcDxzdHJpbmcsIFRhc2s+O1xuXHRcdFx0dGFza0lkZW50aWZpZXI6IE1hcDxzdHJpbmcsIFRhc2s+O1xuXHRcdH1cblxuXHRcdGxldCByZXNvbHZlckRhdGE6IE1hcDxzdHJpbmcsIFJlc29sdmVyRGF0YT4gfCB1bmRlZmluZWQ7XG5cblx0XHRhc3luYyBmdW5jdGlvbiBxdWlja1Jlc29sdmUodGhhdDogQWJzdHJhY3RUYXNrU2VydmljZSwgdXJpOiBVUkkgfCBzdHJpbmcsIGlkZW50aWZpZXI6IHN0cmluZyB8IElUYXNrSWRlbnRpZmllcikge1xuXHRcdFx0Y29uc3QgZm91bmRUYXNrcyA9IGF3YWl0IHRoYXQuX2ZpbmRXb3Jrc3BhY2VUYXNrcygodGFzazogVGFzayB8IENvbmZpZ3VyaW5nVGFzayk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0XHRjb25zdCB0YXNrVXJpID0gKChDb25maWd1cmluZ1Rhc2suaXModGFzaykgfHwgQ3VzdG9tVGFzay5pcyh0YXNrKSkgPyB0YXNrLl9zb3VyY2UuY29uZmlnLndvcmtzcGFjZUZvbGRlcj8udXJpIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxVcmkgPSAodHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgPyB1cmkgOiB1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGlmICh0YXNrVXJpPy50b1N0cmluZygpICE9PSBvcmlnaW5hbFVyaSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoVHlwZXMuaXNTdHJpbmcoaWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHRyZXR1cm4gKCh0YXNrLl9sYWJlbCA9PT0gaWRlbnRpZmllcikgfHwgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllciA9PT0gaWRlbnRpZmllcikpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGtleWVkSWRlbnRpZmllciA9IHRhc2suZ2V0RGVmaW5pdGlvbih0cnVlKTtcblx0XHRcdFx0XHRjb25zdCBzZWFyY2hJZGVudGlmaWVyID0gVGFza0RlZmluaXRpb24uY3JlYXRlVGFza0lkZW50aWZpZXIoaWRlbnRpZmllciwgY29uc29sZSk7XG5cdFx0XHRcdFx0cmV0dXJuIChzZWFyY2hJZGVudGlmaWVyICYmIGtleWVkSWRlbnRpZmllcikgPyAoc2VhcmNoSWRlbnRpZmllci5fa2V5ID09PSBrZXllZElkZW50aWZpZXIuX2tleSkgOiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoZm91bmRUYXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRhc2sgPSBmb3VuZFRhc2tzWzBdO1xuXHRcdFx0aWYgKENvbmZpZ3VyaW5nVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhhdC50cnlSZXNvbHZlVGFzayh0YXNrKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0YXNrO1xuXHRcdH1cblxuXHRcdGFzeW5jIGZ1bmN0aW9uIGdldFJlc29sdmVyRGF0YSh0aGF0OiBBYnN0cmFjdFRhc2tTZXJ2aWNlKSB7XG5cdFx0XHRpZiAocmVzb2x2ZXJEYXRhID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVzb2x2ZXJEYXRhID0gbmV3IE1hcCgpO1xuXHRcdFx0XHQoZ3JvdXBlZCB8fCBhd2FpdCB0aGF0Ll9nZXRHcm91cGVkVGFza3MoKSkuZm9yRWFjaCgodGFza3MsIGZvbGRlcikgPT4ge1xuXHRcdFx0XHRcdGxldCBkYXRhID0gcmVzb2x2ZXJEYXRhIS5nZXQoZm9sZGVyKTtcblx0XHRcdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0XHRcdGRhdGEgPSB7IGxhYmVsOiBuZXcgTWFwPHN0cmluZywgVGFzaz4oKSwgaWRlbnRpZmllcjogbmV3IE1hcDxzdHJpbmcsIFRhc2s+KCksIHRhc2tJZGVudGlmaWVyOiBuZXcgTWFwPHN0cmluZywgVGFzaz4oKSB9O1xuXHRcdFx0XHRcdFx0cmVzb2x2ZXJEYXRhIS5zZXQoZm9sZGVyLCBkYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdFx0XHRkYXRhLmxhYmVsLnNldCh0YXNrLl9sYWJlbCwgdGFzayk7XG5cdFx0XHRcdFx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyKSB7XG5cdFx0XHRcdFx0XHRcdGRhdGEuaWRlbnRpZmllci5zZXQodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyLCB0YXNrKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGtleWVkSWRlbnRpZmllciA9IHRhc2suZ2V0RGVmaW5pdGlvbih0cnVlKTtcblx0XHRcdFx0XHRcdGlmIChrZXllZElkZW50aWZpZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRkYXRhLnRhc2tJZGVudGlmaWVyLnNldChrZXllZElkZW50aWZpZXIuX2tleSwgdGFzayk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXNvbHZlckRhdGE7XG5cdFx0fVxuXG5cdFx0YXN5bmMgZnVuY3Rpb24gZnVsbFJlc29sdmUodGhhdDogQWJzdHJhY3RUYXNrU2VydmljZSwgdXJpOiBVUkkgfCBzdHJpbmcsIGlkZW50aWZpZXI6IHN0cmluZyB8IElUYXNrSWRlbnRpZmllcikge1xuXHRcdFx0Y29uc3QgYWxsUmVzb2x2ZXJEYXRhID0gYXdhaXQgZ2V0UmVzb2x2ZXJEYXRhKHRoYXQpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGFsbFJlc29sdmVyRGF0YS5nZXQodHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgPyB1cmkgOiB1cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmIChUeXBlcy5pc1N0cmluZyhpZGVudGlmaWVyKSkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5sYWJlbC5nZXQoaWRlbnRpZmllcikgfHwgZGF0YS5pZGVudGlmaWVyLmdldChpZGVudGlmaWVyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGtleSA9IFRhc2tEZWZpbml0aW9uLmNyZWF0ZVRhc2tJZGVudGlmaWVyKGlkZW50aWZpZXIsIGNvbnNvbGUpO1xuXHRcdFx0XHRyZXR1cm4ga2V5ICE9PSB1bmRlZmluZWQgPyBkYXRhLnRhc2tJZGVudGlmaWVyLmdldChrZXkuX2tleSkgOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc29sdmU6IGFzeW5jICh1cmk6IFVSSSB8IHN0cmluZywgaWRlbnRpZmllcjogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmICghaWRlbnRpZmllcikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChyZXNvbHZlckRhdGEgPT09IHVuZGVmaW5lZCkgJiYgKGdyb3VwZWQgPT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gKGF3YWl0IHF1aWNrUmVzb2x2ZSh0aGlzLCB1cmksIGlkZW50aWZpZXIpKSA/PyBmdWxsUmVzb2x2ZSh0aGlzLCB1cmksIGlkZW50aWZpZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBmdWxsUmVzb2x2ZSh0aGlzLCB1cmksIGlkZW50aWZpZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NhdmVCZWZvcmVSdW4oKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0ZW51bSBTYXZlQmVmb3JlUnVuQ29uZmlnT3B0aW9ucyB7XG5cdFx0XHRBbHdheXMgPSAnYWx3YXlzJyxcblx0XHRcdE5ldmVyID0gJ25ldmVyJyxcblx0XHRcdFByb21wdCA9ICdwcm9tcHQnXG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2F2ZUJlZm9yZVJ1blRhc2tDb25maWc6IFNhdmVCZWZvcmVSdW5Db25maWdPcHRpb25zID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza1NldHRpbmdJZC5TYXZlQmVmb3JlUnVuKTtcblxuXHRcdGlmIChzYXZlQmVmb3JlUnVuVGFza0NvbmZpZyA9PT0gU2F2ZUJlZm9yZVJ1bkNvbmZpZ09wdGlvbnMuTmV2ZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKHNhdmVCZWZvcmVSdW5UYXNrQ29uZmlnID09PSBTYXZlQmVmb3JlUnVuQ29uZmlnT3B0aW9ucy5Qcm9tcHQgJiYgdGhpcy5fZWRpdG9yU2VydmljZS5lZGl0b3JzLnNvbWUoZSA9PiBlLmlzRGlydHkoKSkpIHtcblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ1Rhc2tTeXN0ZW0uc2F2ZUJlZm9yZVJ1bi5wcm9tcHQudGl0bGUnLCBcIlNhdmUgYWxsIGVkaXRvcnM/XCIpLFxuXHRcdFx0XHRkZXRhaWw6IG5scy5sb2NhbGl6ZSgnZGV0YWlsJywgXCJEbyB5b3Ugd2FudCB0byBzYXZlIGFsbCBlZGl0b3JzIGJlZm9yZSBydW5uaW5nIHRoZSB0YXNrP1wiKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnc2F2ZUJlZm9yZVJ1bi5zYXZlJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCAnJiZTYXZlJyksXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAnc2F2ZUJlZm9yZVJ1bi5kb250U2F2ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJEbyYmbid0IFNhdmVcIiksXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLnNhdmVBbGwoeyByZWFzb246IFNhdmVSZWFzb24uRVhQTElDSVQgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9leGVjdXRlVGFzayh0YXNrOiBUYXNrLCByZXNvbHZlcjogSVRhc2tSZXNvbHZlciwgcnVuU291cmNlOiBUYXNrUnVuU291cmNlKTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRsZXQgdGFza1RvUnVuOiBUYXNrID0gdGFzaztcblx0XHRpZiAoYXdhaXQgdGhpcy5fc2F2ZUJlZm9yZVJ1bigpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5yZWxvYWRDb25maWd1cmF0aW9uKCk7XG5cdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVXb3Jrc3BhY2VUYXNrcygpO1xuXHRcdFx0Y29uc3QgdGFza0ZvbGRlciA9IHRhc2suZ2V0V29ya3NwYWNlRm9sZGVyKCk7XG5cdFx0XHRjb25zdCB0YXNrSWRlbnRpZmllciA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuaWRlbnRpZmllcjtcblx0XHRcdGNvbnN0IHRhc2tUeXBlID0gQ3VzdG9tVGFzay5pcyh0YXNrKSA/IHRhc2suY3VzdG9taXplcygpPy50eXBlIDogKENvbnRyaWJ1dGVkVGFzay5pcyh0YXNrKSA/IHRhc2sudHlwZSA6IHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBTaW5jZSB3ZSBzYXZlIGJlZm9yZSBydW5uaW5nIHRhc2tzLCB0aGUgdGFzayBtYXkgaGF2ZSBjaGFuZ2VkIGFzIHBhcnQgb2YgdGhlIHNhdmUuXG5cdFx0XHQvLyBIb3dldmVyLCBpZiB0aGUgVGFza1J1blNvdXJjZSBpcyBub3QgVXNlciwgdGhlbiB3ZSBzaG91bGRuJ3QgdHJ5IHRvIGZldGNoIHRoZSB0YXNrIGFnYWluXG5cdFx0XHQvLyBzaW5jZSB0aGlzIGNhbiBjYXVzZSBhIG5ldydkIHRhc2sgdG8gZ2V0IG92ZXJ3cml0dGVuIHdpdGggYSBwcm92aWRlZCB0YXNrLlxuXHRcdFx0dGFza1RvUnVuID0gKCh0YXNrRm9sZGVyICYmIHRhc2tJZGVudGlmaWVyICYmIChydW5Tb3VyY2UgPT09IFRhc2tSdW5Tb3VyY2UuVXNlcikpXG5cdFx0XHRcdD8gYXdhaXQgdGhpcy5nZXRUYXNrKHRhc2tGb2xkZXIsIHRhc2tJZGVudGlmaWVyLCBmYWxzZSwgdGFza1R5cGUpIDogdGFzaykgPz8gdGFzaztcblx0XHR9XG5cdFx0YXdhaXQgUHJvYmxlbU1hdGNoZXJSZWdpc3RyeS5vblJlYWR5KCk7XG5cdFx0Y29uc3QgZXhlY3V0ZVJlc3VsdCA9IHJ1blNvdXJjZSA9PT0gVGFza1J1blNvdXJjZS5SZWNvbm5lY3QgPyB0aGlzLl9nZXRUYXNrU3lzdGVtKCkucmVjb25uZWN0KHRhc2tUb1J1biwgcmVzb2x2ZXIpIDogdGhpcy5fZ2V0VGFza1N5c3RlbSgpLnJ1bih0YXNrVG9SdW4sIHJlc29sdmVyKTtcblx0XHRpZiAoZXhlY3V0ZVJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZUV4ZWN1dGVSZXN1bHQoZXhlY3V0ZVJlc3VsdCwgcnVuU291cmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZXhpdENvZGU6IDAgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZUV4ZWN1dGVSZXN1bHQoZXhlY3V0ZVJlc3VsdDogSVRhc2tFeGVjdXRlUmVzdWx0LCBydW5Tb3VyY2U/OiBUYXNrUnVuU291cmNlKTogUHJvbWlzZTxJVGFza1N1bW1hcnk+IHtcblx0XHRpZiAocnVuU291cmNlICYmIGV4ZWN1dGVSZXN1bHQudGFzay5faWQpIHtcblx0XHRcdHRoaXMuX3Rhc2tSdW5Tb3VyY2VzLnNldChleGVjdXRlUmVzdWx0LnRhc2suX2lkLCBydW5Tb3VyY2UpO1xuXHRcdH1cblxuXHRcdGlmIChydW5Tb3VyY2UgPT09IFRhc2tSdW5Tb3VyY2UuVXNlcikge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2V0UmVjZW50bHlVc2VkVGFzayhleGVjdXRlUmVzdWx0LnRhc2spO1xuXHRcdH1cblx0XHRpZiAoZXhlY3V0ZVJlc3VsdC5raW5kID09PSBUYXNrRXhlY3V0ZUtpbmQuQWN0aXZlKSB7XG5cdFx0XHRjb25zdCBhY3RpdmUgPSBleGVjdXRlUmVzdWx0LmFjdGl2ZTtcblx0XHRcdGlmIChhY3RpdmUgJiYgYWN0aXZlLnNhbWUgJiYgcnVuU291cmNlID09PSBUYXNrUnVuU291cmNlLkZvbGRlck9wZW4gfHwgcnVuU291cmNlID09PSBUYXNrUnVuU291cmNlLlJlY29ubmVjdCkge1xuXHRcdFx0XHQvLyBpZ25vcmUsIHRoZSB0YXNrIGlzIGFscmVhZHkgYWN0aXZlLCBsaWtlbHkgZnJvbSBiZWluZyByZWNvbm5lY3RlZCBvciBmcm9tIGZvbGRlciBvcGVuLlxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdJZ25vcmluZyB0YXNrIHRoYXQgaXMgYWxyZWFkeSBhY3RpdmUnLCBleGVjdXRlUmVzdWx0LnRhc2spO1xuXHRcdFx0XHRyZXR1cm4gZXhlY3V0ZVJlc3VsdC5wcm9taXNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGl2ZSAmJiBhY3RpdmUuc2FtZSkge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVJbnN0YW5jZVBvbGljeShleGVjdXRlUmVzdWx0LnRhc2ssIGV4ZWN1dGVSZXN1bHQudGFzay5ydW5PcHRpb25zIS5pbnN0YW5jZVBvbGljeSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBuZXcgVGFza0Vycm9yKFNldmVyaXR5Lldhcm5pbmcsIG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS5hY3RpdmUnLCAnVGhlcmUgaXMgYWxyZWFkeSBhIHRhc2sgcnVubmluZy4gVGVybWluYXRlIGl0IGZpcnN0IGJlZm9yZSBleGVjdXRpbmcgYW5vdGhlciB0YXNrLicpLCBUYXNrRXJyb3JzLlJ1bm5pbmdUYXNrKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc2V0UmVjZW50bHlVc2VkVGFzayhleGVjdXRlUmVzdWx0LnRhc2spO1xuXHRcdHJldHVybiBleGVjdXRlUmVzdWx0LnByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVJbnN0YW5jZVBvbGljeSh0YXNrOiBUYXNrLCBwb2xpY3k/OiBJbnN0YW5jZVBvbGljeSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdGFza1N5c3RlbT8uaXNUYXNrVmlzaWJsZSh0YXNrKSkge1xuXHRcdFx0dGhpcy5fdGFza1N5c3RlbT8ucmV2ZWFsVGFzayh0YXNrKTtcblx0XHR9XG5cdFx0c3dpdGNoIChwb2xpY3kpIHtcblx0XHRcdGNhc2UgSW5zdGFuY2VQb2xpY3kudGVybWluYXRlTmV3ZXN0OlxuXHRcdFx0XHR0aGlzLl9yZXN0YXJ0KHRoaXMuX2dldFRhc2tTeXN0ZW0oKS5nZXRMYXN0SW5zdGFuY2UodGFzaykgPz8gdGFzayk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBJbnN0YW5jZVBvbGljeS50ZXJtaW5hdGVPbGRlc3Q6XG5cdFx0XHRcdHRoaXMuX3Jlc3RhcnQodGhpcy5fZ2V0VGFza1N5c3RlbSgpLmdldEZpcnN0SW5zdGFuY2UodGFzaykgPz8gdGFzayk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBJbnN0YW5jZVBvbGljeS5zaWxlbnQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBJbnN0YW5jZVBvbGljeS53YXJuOlxuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdUYXNrU3lzdGVtLkluc3RhbmNlUG9saWN5Lndhcm4nLCAnVGhlIGluc3RhbmNlIGxpbWl0IGZvciB0aGlzIHRhc2sgaGFzIGJlZW4gcmVhY2hlZC4nKSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBJbnN0YW5jZVBvbGljeS5wcm9tcHQ6XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGlmICh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW3Rhc2tzXSBJbnN0YW5jZVBvbGljeS5wcm9tcHQgaGl0IGluIHNlc3Npb25zIHdpbmRvdyBmb3IgdGFzayAnJHt0YXNrLl9sYWJlbH0nXFxuJHtuZXcgRXJyb3IoKS5zdGFja31gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9zaG93UXVpY2tQaWNrKHRoaXMuX3Rhc2tTeXN0ZW0hLmdldEFjdGl2ZVRhc2tzKCkuZmlsdGVyKHQgPT4gdGFzay5faWQgPT09IHQuX2lkKSxcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmluc3RhbmNlVG9UZXJtaW5hdGUnLCAnU2VsZWN0IGFuIGluc3RhbmNlIHRvIHRlcm1pbmF0ZScpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vSW5zdGFuY2VSdW5uaW5nJywgJ05vIGluc3RhbmNlIGlzIGN1cnJlbnRseSBydW5uaW5nJyksXG5cdFx0XHRcdFx0XHR0YXNrOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZhbHNlLCB0cnVlLFxuXHRcdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0XHQpLnRoZW4oZW50cnkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsID0gZW50cnkgPyBlbnRyeS50YXNrIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmICh0YXNrID09PSB1bmRlZmluZWQgfHwgdGFzayA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9yZXN0YXJ0KHRhc2spO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXN0YXJ0KHRhc2s6IFRhc2spOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tTeXN0ZW0pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiB0aGUgdGFzayBpcyBjdXJyZW50bHkgcnVubmluZ1xuXHRcdGNvbnN0IGlzVGFza1J1bm5pbmcgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZVRhc2tzKCkudGhlbih0YXNrcyA9PiB0YXNrcy5zb21lKHQgPT4gdC5nZXRNYXBLZXkoKSA9PT0gdGFzay5nZXRNYXBLZXkoKSkpO1xuXG5cdFx0aWYgKGlzVGFza1J1bm5pbmcpIHtcblx0XHRcdC8vIFRhc2sgaXMgcnVubmluZywgdGVybWluYXRlIGl0IGZpcnN0XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRoaXMuX3Rhc2tTeXN0ZW0udGVybWluYXRlKHRhc2spO1xuXHRcdFx0aWYgKCFyZXNwb25zZS5zdWNjZXNzKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uud2FybihubHMubG9jYWxpemUoJ1Rhc2tTeXN0ZW0ucmVzdGFydEZhaWxlZCcsICdGYWlsZWQgdG8gdGVybWluYXRlIGFuZCByZXN0YXJ0IHRhc2sgezB9JywgVHlwZXMuaXNTdHJpbmcodGFzaykgPyB0YXNrIDogdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5uYW1lKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUYXNrIGlzIG5vdCBydW5uaW5nIG9yIHdhcyBzdWNjZXNzZnVsbHkgdGVybWluYXRlZCwgbm93IHJ1biBpdFxuXHRcdHRyeSB7XG5cdFx0XHQvLyBCZWZvcmUgcmVzdGFydGluZywgY2hlY2sgaWYgdGhlIHRhc2sgc3RpbGwgZXhpc3RzIGFuZCBnZXQgdXBkYXRlZCB2ZXJzaW9uXG5cdFx0XHRjb25zdCB1cGRhdGVkVGFzayA9IGF3YWl0IHRoaXMuX2ZpbmRVcGRhdGVkVGFzayh0YXNrKTtcblx0XHRcdGlmICh1cGRhdGVkVGFzaykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJ1bih1cGRhdGVkVGFzayk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBzdWNjZXNzID0gYXdhaXQgdGhpcy5ydW4odGFzayk7XG5cdFx0XHRcdGlmICghc3VjY2VzcyB8fCAodHlwZW9mIHN1Y2Nlc3MuZXhpdENvZGUgPT09ICdudW1iZXInICYmIHN1Y2Nlc3MuZXhpdENvZGUgIT09IDApKSB7XG5cdFx0XHRcdFx0Ly8gVGFzayBubyBsb25nZXIgZXhpc3RzLCBzaG93IHdhcm5pbmdcblx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdUYXNrU3lzdGVtLnRhc2tOb0xvbmdlckV4aXN0cycsICdUYXNrIHswfSBubyBsb25nZXIgZXhpc3RzIG9yIGhhcyBiZWVuIG1vZGlmaWVkLiBDYW5ub3QgcmVzdGFydC4nLCB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gZWF0IHRoZSBlcnJvciwgd2UgZG9uJ3QgY2FyZSBhYm91dCBpdCBoZXJlXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZmluZFVwZGF0ZWRUYXNrKG9yaWdpbmFsVGFzazogVGFzayk6IFByb21pc2U8VGFzayB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG1hcFN0cmluZ1RvRm9sZGVyVGFza3MgPSBhd2FpdCB0aGlzLl91cGRhdGVXb3Jrc3BhY2VUYXNrcyhUYXNrUnVuU291cmNlLlN5c3RlbSk7XG5cblx0XHQvLyBMb29rIGZvciB0aGUgdGFzayBpbiBjdXJyZW50IHdvcmtzcGFjZSBjb25maWd1cmF0aW9uXG5cdFx0Zm9yIChjb25zdCBbXywgZm9sZGVyUmVzdWx0XSBvZiBtYXBTdHJpbmdUb0ZvbGRlclRhc2tzKSB7XG5cdFx0XHRpZiAoIWZvbGRlclJlc3VsdC5zZXQ/LnRhc2tzPy5sZW5ndGggJiYgIWZvbGRlclJlc3VsdC5jb25maWd1cmF0aW9ucz8uYnlJZGVudGlmaWVyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlcmUgYXJlIHR3byB3YXlzIHdoZXJlIFRhc2sgbGl2ZXM6XG5cdFx0XHQvLyAxLiBmb2xkZXJSZXN1bHQuc2V0LnRhc2tzXG5cdFx0XHRpZiAoZm9sZGVyUmVzdWx0LnNldD8udGFza3MpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIGZvbGRlclJlc3VsdC5zZXQudGFza3MpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIHRoZSBzYW1lIHRhc2sgYnkgSURcblx0XHRcdFx0XHRpZiAodGFzay5faWQgPT09IG9yaWdpbmFsVGFzay5faWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0YXNrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Ly8gMi4gZm9sZGVyUmVzdWx0LmNvbmZpZ3VyYXRpb25zLmJ5SWRlbnRpZmllclxuXHRcdFx0aWYgKGZvbGRlclJlc3VsdC5jb25maWd1cmF0aW9ucz8uYnlJZGVudGlmaWVyKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgW18sIGNvbmZpZ3VyaW5nVGFza10gb2YgT2JqZWN0LmVudHJpZXMoZm9sZGVyUmVzdWx0LmNvbmZpZ3VyYXRpb25zLmJ5SWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGlzIGlzIHRoZSBzYW1lIHRhc2sgYnkgSURcblx0XHRcdFx0XHRpZiAoY29uZmlndXJpbmdUYXNrLl9pZCA9PT0gb3JpZ2luYWxUYXNrLl9pZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMudHJ5UmVzb2x2ZVRhc2soY29uZmlndXJpbmdUYXNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiB0YXNrIHdhc24ndCBmb3VuZCBpbiB3b3Jrc3BhY2UgY29uZmlndXJhdGlvbiwgY2hlY2sgY29udHJpYnV0ZWQgdGFza3MgZnJvbSBwcm92aWRlcnNcblx0XHQvLyBUaGlzIGlzIGltcG9ydGFudCBmb3IgdGFza3MgZnJvbSBleHRlbnNpb25zIGxpa2UgbnBtLCB3aGljaCBhcmUgQ29udHJpYnV0ZWRUYXNrc1xuXHRcdGlmIChDb250cmlidXRlZFRhc2suaXMob3JpZ2luYWxUYXNrKSkge1xuXHRcdFx0Ly8gVGhlIHR5cGUgZmlsdGVyIGVuc3VyZXMgb25seSB0aGUgbWF0Y2hpbmcgcHJvdmlkZXIgaXMgY2FsbGVkIChlLmcuLCBvbmx5IG5wbSBwcm92aWRlciBmb3IgbnBtIHRhc2tzKVxuXHRcdFx0Ly8gVGhpcyBpcyB0aGUgc2FtZSBwYXR0ZXJuIHVzZWQgaW4gdHJ5UmVzb2x2ZVRhc2sgYXMgYSBmYWxsYmFja1xuXHRcdFx0Y29uc3QgYWxsVGFza3MgPSBhd2FpdCB0aGlzLnRhc2tzKHsgdHlwZTogb3JpZ2luYWxUYXNrLnR5cGUgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgYWxsVGFza3MpIHtcblx0XHRcdFx0aWYgKHRhc2suX2lkID09PSBvcmlnaW5hbFRhc2suX2lkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRhc2s7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHRlcm1pbmF0ZSh0YXNrOiBUYXNrKTogUHJvbWlzZTxJVGFza1Rlcm1pbmF0ZVJlc3BvbnNlPiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fdHJ1c3QoKSkpIHtcblx0XHRcdHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIHRhc2s6IHVuZGVmaW5lZCB9O1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fdGFza1N5c3RlbSkge1xuXHRcdFx0cmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgdGFzazogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtLnRlcm1pbmF0ZSh0YXNrKTtcblx0fVxuXG5cdHByaXZhdGUgX3Rlcm1pbmF0ZUFsbCgpOiBQcm9taXNlPElUYXNrVGVybWluYXRlUmVzcG9uc2VbXT4ge1xuXHRcdGlmICghdGhpcy5fdGFza1N5c3RlbSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZTxJVGFza1Rlcm1pbmF0ZVJlc3BvbnNlW10+KFtdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Rhc2tTeXN0ZW0udGVybWluYXRlQWxsKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2NyZWF0ZVRlcm1pbmFsVGFza1N5c3RlbSgpOiBJVGFza1N5c3RlbSB7XG5cdFx0cmV0dXJuIG5ldyBUZXJtaW5hbFRhc2tTeXN0ZW0oXG5cdFx0XHR0aGlzLl90ZXJtaW5hbFNlcnZpY2UsIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLCB0aGlzLl9vdXRwdXRTZXJ2aWNlLCB0aGlzLl9wYW5lQ29tcG9zaXRlU2VydmljZSwgdGhpcy5fdmlld3NTZXJ2aWNlLCB0aGlzLl9tYXJrZXJTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fbW9kZWxTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fY29udGV4dFNlcnZpY2UsIHRoaXMuX2Vudmlyb25tZW50U2VydmljZSxcblx0XHRcdEFic3RyYWN0VGFza1NlcnZpY2UuT3V0cHV0Q2hhbm5lbElkLCB0aGlzLl9maWxlU2VydmljZSwgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fcGF0aFNlcnZpY2UsIHRoaXMuX3ZpZXdEZXNjcmlwdG9yU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdCh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9nZXRUYXNrU3lzdGVtSW5mbyh3b3Jrc3BhY2VGb2xkZXIudXJpLnNjaGVtZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5fdGFza1N5c3RlbUluZm9zLnNpemUgPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5mb3MgPSBBcnJheS5mcm9tKHRoaXMuX3Rhc2tTeXN0ZW1JbmZvcy5lbnRyaWVzKCkpO1xuXHRcdFx0XHRcdGNvbnN0IG5vdEZpbGUgPSBpbmZvcy5maWx0ZXIoaW5mbyA9PiBpbmZvWzBdICE9PSBTY2hlbWFzLmZpbGUpO1xuXHRcdFx0XHRcdGlmIChub3RGaWxlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiBub3RGaWxlWzBdWzFdWzBdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gaW5mb3NbMF1bMV1bMF07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFzeW5jICh0YXNrS2V5OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0Ly8gTG9vayB1cCB0YXNrIGJ5IGl0cyBtYXAga2V5IGFjcm9zcyBhbGwgd29ya3NwYWNlIHRhc2tzXG5cdFx0XHRcdGNvbnN0IHRhc2tNYXAgPSBhd2FpdCB0aGlzLl9nZXRHcm91cGVkVGFza3MoKTtcblx0XHRcdFx0Y29uc3QgYWxsVGFza3MgPSB0YXNrTWFwLmFsbCgpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgYWxsVGFza3MpIHtcblx0XHRcdFx0XHRpZiAodGFzay5nZXRNYXBLZXkoKSA9PT0gdGFza0tleSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRhc2s7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBfZ2V0VGFza1N5c3RlbSgpOiBJVGFza1N5c3RlbTtcblxuXHRwcml2YXRlIF9pc1Rhc2tQcm92aWRlckVuYWJsZWQodHlwZTogc3RyaW5nKSB7XG5cdFx0Y29uc3QgZGVmaW5pdGlvbiA9IFRhc2tEZWZpbml0aW9uUmVnaXN0cnkuZ2V0KHR5cGUpO1xuXHRcdHJldHVybiAhZGVmaW5pdGlvbiB8fCAhZGVmaW5pdGlvbi53aGVuIHx8IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoZGVmaW5pdGlvbi53aGVuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEdyb3VwZWRUYXNrcyhmaWx0ZXI/OiBJVGFza0ZpbHRlciwgd2FpdFRvQWN0aXZhdGU/OiBib29sZWFuLCBrbm93bk9ubHlPclRydXN0ZWQ/OiBib29sZWFuKTogUHJvbWlzZTxUYXNrTWFwPiB7XG5cdFx0YXdhaXQgdGhpcy5fd2FpdEZvckFsbFN1cHBvcnRlZEV4ZWN1dGlvbnM7XG5cdFx0Y29uc3QgdHlwZSA9IGZpbHRlcj8udHlwZTtcblx0XHRjb25zdCBuZWVkc1JlY2VudFRhc2tzTWlncmF0aW9uID0gdGhpcy5fbmVlZHNSZWNlbnRUYXNrc01pZ3JhdGlvbigpO1xuXHRcdGlmICghd2FpdFRvQWN0aXZhdGUpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2FjdGl2YXRlVGFza1Byb3ZpZGVycyhmaWx0ZXI/LnR5cGUpO1xuXHRcdH1cblx0XHRjb25zdCB2YWxpZFR5cGVzOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0VGFza0RlZmluaXRpb25SZWdpc3RyeS5hbGwoKS5mb3JFYWNoKGRlZmluaXRpb24gPT4gdmFsaWRUeXBlc1tkZWZpbml0aW9uLnRhc2tUeXBlXSA9IHRydWUpO1xuXHRcdHZhbGlkVHlwZXNbJ3NoZWxsJ10gPSB0cnVlO1xuXHRcdHZhbGlkVHlwZXNbJ3Byb2Nlc3MnXSA9IHRydWU7XG5cdFx0Y29uc3QgY29udHJpYnV0ZWRUYXNrU2V0cyA9IGF3YWl0IG5ldyBQcm9taXNlPElUYXNrU2V0W10+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBJVGFza1NldFtdID0gW107XG5cdFx0XHRsZXQgY291bnRlcjogbnVtYmVyID0gMDtcblx0XHRcdGNvbnN0IGRvbmUgPSAodmFsdWU6IElUYXNrU2V0IHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoLS1jb3VudGVyID09PSAwKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZXJyb3IgPSAoZXJyb3I6IHVua25vd24pID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0XHRpZiAoZXJyb3IgJiYgVHlwZXMuaXNTdHJpbmcoKGVycm9yIGFzIHsgbWVzc2FnZT86IHN0cmluZyB9KS5tZXNzYWdlKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2coYEVycm9yOiAkeyhlcnJvciBhcyB7IG1lc3NhZ2U6IHN0cmluZyB9KS5tZXNzYWdlfVxcbmApO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zaG93T3V0cHV0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCAoZXJyb3IgYXMgeyBtZXNzYWdlOiBzdHJpbmcgfSkubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2coJ1Vua25vd24gZXJyb3IgcmVjZWl2ZWQgd2hpbGUgY29sbGVjdGluZyB0YXNrcyBmcm9tIHByb3ZpZGVycy4nKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc2hvd091dHB1dCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRpZiAoLS1jb3VudGVyID09PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0aWYgKHRoaXMuX2lzUHJvdmlkZVRhc2tzRW5hYmxlZCgpICYmICh0aGlzLnNjaGVtYVZlcnNpb24gPT09IEpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMCkgJiYgKHRoaXMuX3Byb3ZpZGVycy5zaXplID4gMCkpIHtcblx0XHRcdFx0bGV0IGZvdW5kQW55UHJvdmlkZXJzID0gZmFsc2U7XG5cdFx0XHRcdGZvciAoY29uc3QgW2hhbmRsZSwgcHJvdmlkZXJdIG9mIHRoaXMuX3Byb3ZpZGVycykge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyVHlwZSA9IHRoaXMuX3Byb3ZpZGVyVHlwZXMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRcdFx0aWYgKCh0eXBlID09PSB1bmRlZmluZWQpIHx8ICh0eXBlID09PSBwcm92aWRlclR5cGUpKSB7XG5cdFx0XHRcdFx0XHRpZiAocHJvdmlkZXJUeXBlICYmICF0aGlzLl9pc1Rhc2tQcm92aWRlckVuYWJsZWQocHJvdmlkZXJUeXBlKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGZvdW5kQW55UHJvdmlkZXJzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdGNvdW50ZXIrKztcblx0XHRcdFx0XHRcdHJhY2VUaW1lb3V0KHByb3ZpZGVyLnByb3ZpZGVUYXNrcyh2YWxpZFR5cGVzKS50aGVuKCh0YXNrU2V0OiBJVGFza1NldCkgPT4ge1xuXHRcdFx0XHRcdFx0XHQvLyBDaGVjayB0aGF0IHRoZSB0YXNrcyBwcm92aWRlZCBhcmUgb2YgdGhlIGNvcnJlY3QgdHlwZVxuXHRcdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza1NldC50YXNrcykge1xuXHRcdFx0XHRcdFx0XHRcdGlmICh0YXNrLnR5cGUgIT09IHRoaXMuX3Byb3ZpZGVyVHlwZXMuZ2V0KGhhbmRsZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoJ3VuZXhwZWN0ZWRUYXNrVHlwZScsIFwiVGhlIHRhc2sgcHJvdmlkZXIgZm9yIFxcXCJ7MH1cXFwiIHRhc2tzIHVuZXhwZWN0ZWRseSBwcm92aWRlZCBhIHRhc2sgb2YgdHlwZSBcXFwiezF9XFxcIi5cXG5cIiwgdGhpcy5fcHJvdmlkZXJUeXBlcy5nZXQoaGFuZGxlKSwgdGFzay50eXBlKSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoKHRhc2sudHlwZSAhPT0gJ3NoZWxsJykgJiYgKHRhc2sudHlwZSAhPT0gJ3Byb2Nlc3MnKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zaG93T3V0cHV0KCk7XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIGRvbmUodGFza1NldCk7XG5cdFx0XHRcdFx0XHR9LCBlcnJvciksIDUwMDAsICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gb25UaW1lb3V0XG5cdFx0XHRcdFx0XHRcdGRvbmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIWZvdW5kQW55UHJvdmlkZXJzKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvbHZlKHJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQ6IFRhc2tNYXAgPSBuZXcgVGFza01hcCgpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkVGFza3M6IFRhc2tNYXAgPSBuZXcgVGFza01hcCgpO1xuXG5cdFx0Zm9yIChjb25zdCBzZXQgb2YgY29udHJpYnV0ZWRUYXNrU2V0cykge1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHNldC50YXNrcykge1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0YXNrLmdldFdvcmtzcGFjZUZvbGRlcigpO1xuXHRcdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdFx0Y29udHJpYnV0ZWRUYXNrcy5hZGQod29ya3NwYWNlRm9sZGVyLCB0YXNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRsZXQgdGFza3M6IFtzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0XVtdID0gW107XG5cdFx0XHQvLyBwcmV2ZW50IHdvcmtzcGFjZSB0cnVzdCBkaWFsb2cgZnJvbSBiZWluZyBzaG93biBpbiB1bmV4cGVjdGVkIGNhc2VzICMyMjQ4ODFcblx0XHRcdGlmICgha25vd25Pbmx5T3JUcnVzdGVkIHx8IHRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdFx0dGFza3MgPSBBcnJheS5mcm9tKGF3YWl0IHRoaXMuZ2V0V29ya3NwYWNlVGFza3MoKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLl9nZXRDdXN0b21UYXNrUHJvbWlzZXModGFza3MsIGZpbHRlciwgcmVzdWx0LCBjb250cmlidXRlZFRhc2tzLCB3YWl0VG9BY3RpdmF0ZSkpO1xuXHRcdFx0aWYgKG5lZWRzUmVjZW50VGFza3NNaWdyYXRpb24pIHtcblx0XHRcdFx0Ly8gQXQgdGhpcyBwb2ludCB3ZSBoYXZlIGFsbCB0aGUgdGFza3MgYW5kIGNhbiBtaWdyYXRlIHRoZSByZWNlbnRseSB1c2VkIHRhc2tzLlxuXHRcdFx0XHRhd2FpdCB0aGlzLl9taWdyYXRlUmVjZW50VGFza3MocmVzdWx0LmFsbCgpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZiB3ZSBjYW4ndCByZWFkIHRoZSB0YXNrcy5qc29uIGZpbGUgcHJvdmlkZSBhdCBsZWFzdCB0aGUgY29udHJpYnV0ZWQgdGFza3Ncblx0XHRcdGNvbnN0IHJlc3VsdDogVGFza01hcCA9IG5ldyBUYXNrTWFwKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHNldCBvZiBjb250cmlidXRlZFRhc2tTZXRzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBzZXQudGFza3MpIHtcblx0XHRcdFx0XHRjb25zdCBmb2xkZXIgPSB0YXNrLmdldFdvcmtzcGFjZUZvbGRlcigpO1xuXHRcdFx0XHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5hZGQoZm9sZGVyLCB0YXNrKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgX2dldEN1c3RvbVRhc2tQcm9taXNlcyhjdXN0b21UYXNrc0tleVZhbHVlUGFpcnM6IFtzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0XVtdLCBmaWx0ZXI6IElUYXNrRmlsdGVyIHwgdW5kZWZpbmVkLCByZXN1bHQ6IFRhc2tNYXAsIGNvbnRyaWJ1dGVkVGFza3M6IFRhc2tNYXAsIHdhaXRUb0FjdGl2YXRlOiBib29sZWFuIHwgdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGN1c3RvbVRhc2tzS2V5VmFsdWVQYWlycy5tYXAoYXN5bmMgKFtrZXksIGZvbGRlclRhc2tzXSkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJpYnV0ZWQgPSBjb250cmlidXRlZFRhc2tzLmdldChrZXkpO1xuXHRcdFx0aWYgKCFmb2xkZXJUYXNrcy5zZXQpIHtcblx0XHRcdFx0aWYgKGNvbnRyaWJ1dGVkKSB7XG5cdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIC4uLmNvbnRyaWJ1dGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgLi4uZm9sZGVyVGFza3Muc2V0LnRhc2tzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25zID0gZm9sZGVyVGFza3MuY29uZmlndXJhdGlvbnM7XG5cdFx0XHRcdGNvbnN0IGxlZ2FjeVRhc2tDb25maWd1cmF0aW9ucyA9IGZvbGRlclRhc2tzLnNldCA/IHRoaXMuX2dldExlZ2FjeVRhc2tDb25maWd1cmF0aW9ucyhmb2xkZXJUYXNrcy5zZXQpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBjdXN0b21UYXNrc1RvRGVsZXRlOiBUYXNrW10gPSBbXTtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25zIHx8IGxlZ2FjeVRhc2tDb25maWd1cmF0aW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IHVuVXNlZENvbmZpZ3VyYXRpb25zOiBTZXQ8c3RyaW5nPiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHRcdGlmIChjb25maWd1cmF0aW9ucykge1xuXHRcdFx0XHRcdFx0T2JqZWN0LmtleXMoY29uZmlndXJhdGlvbnMuYnlJZGVudGlmaWVyKS5mb3JFYWNoKGtleSA9PiB1blVzZWRDb25maWd1cmF0aW9ucy5hZGQoa2V5KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBjb250cmlidXRlZCkge1xuXHRcdFx0XHRcdFx0aWYgKCFDb250cmlidXRlZFRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoY29uZmlndXJhdGlvbnMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY29uZmlndXJpbmdUYXNrID0gY29uZmlndXJhdGlvbnMuYnlJZGVudGlmaWVyW3Rhc2suZGVmaW5lcy5fa2V5XTtcblx0XHRcdFx0XHRcdFx0aWYgKGNvbmZpZ3VyaW5nVGFzaykge1xuXHRcdFx0XHRcdFx0XHRcdHVuVXNlZENvbmZpZ3VyYXRpb25zLmRlbGV0ZSh0YXNrLmRlZmluZXMuX2tleSk7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIFRhc2tDb25maWcuY3JlYXRlQ3VzdG9tVGFzayh0YXNrLCBjb25maWd1cmluZ1Rhc2spKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgdGFzayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAobGVnYWN5VGFza0NvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyaW5nVGFzayA9IGxlZ2FjeVRhc2tDb25maWd1cmF0aW9uc1t0YXNrLmRlZmluZXMuX2tleV07XG5cdFx0XHRcdFx0XHRcdGlmIChjb25maWd1cmluZ1Rhc2spIHtcblx0XHRcdFx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgVGFza0NvbmZpZy5jcmVhdGVDdXN0b21UYXNrKHRhc2ssIGNvbmZpZ3VyaW5nVGFzaykpO1xuXHRcdFx0XHRcdFx0XHRcdGN1c3RvbVRhc2tzVG9EZWxldGUucHVzaChjb25maWd1cmluZ1Rhc2spO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHJlc3VsdC5hZGQoa2V5LCB0YXNrKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmVzdWx0LmFkZChrZXksIHRhc2spO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoY3VzdG9tVGFza3NUb0RlbGV0ZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b0RlbGV0ZSA9IGN1c3RvbVRhc2tzVG9EZWxldGUucmVkdWNlPElTdHJpbmdEaWN0aW9uYXJ5PGJvb2xlYW4+PigobWFwLCB0YXNrKSA9PiB7XG5cdFx0XHRcdFx0XHRcdG1hcFt0YXNrLl9pZF0gPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbWFwO1xuXHRcdFx0XHRcdFx0fSwgT2JqZWN0LmNyZWF0ZShudWxsKSk7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgZm9sZGVyVGFza3Muc2V0LnRhc2tzKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0b0RlbGV0ZVt0YXNrLl9pZF0pIHtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgdGFzayk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlc3VsdC5hZGQoa2V5LCAuLi5mb2xkZXJUYXNrcy5zZXQudGFza3MpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHVuVXNlZENvbmZpZ3VyYXRpb25zQXNBcnJheSA9IEFycmF5LmZyb20odW5Vc2VkQ29uZmlndXJhdGlvbnMpO1xuXG5cdFx0XHRcdFx0Y29uc3QgdW5Vc2VkQ29uZmlndXJhdGlvblByb21pc2VzID0gdW5Vc2VkQ29uZmlndXJhdGlvbnNBc0FycmF5Lm1hcChhc3luYyAodmFsdWUpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbmZpZ3VyaW5nVGFzayA9IGNvbmZpZ3VyYXRpb25zIS5ieUlkZW50aWZpZXJbdmFsdWVdO1xuXHRcdFx0XHRcdFx0aWYgKGZpbHRlcj8udHlwZSAmJiAoZmlsdGVyLnR5cGUgIT09IGNvbmZpZ3VyaW5nVGFzay5jb25maWd1cmVzLnR5cGUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0bGV0IHJlcXVpcmVkVGFza1Byb3ZpZGVyVW5hdmFpbGFibGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBbaGFuZGxlLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyVHlwZSA9IHRoaXMuX3Byb3ZpZGVyVHlwZXMuZ2V0KGhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChjb25maWd1cmluZ1Rhc2sudHlwZSA9PT0gcHJvdmlkZXJUeXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHByb3ZpZGVyVHlwZSAmJiAhdGhpcy5faXNUYXNrUHJvdmlkZXJFbmFibGVkKHByb3ZpZGVyVHlwZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkVGFza1Byb3ZpZGVyVW5hdmFpbGFibGUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkVGFzayA9IGF3YWl0IHByb3ZpZGVyLnJlc29sdmVUYXNrKGNvbmZpZ3VyaW5nVGFzayk7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAocmVzb2x2ZWRUYXNrICYmIChyZXNvbHZlZFRhc2suX2lkID09PSBjb25maWd1cmluZ1Rhc2suX2lkKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgVGFza0NvbmZpZy5jcmVhdGVDdXN0b21UYXNrKHJlc29sdmVkVGFzaywgY29uZmlndXJpbmdUYXNrKSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gSWdub3JlIGVycm9ycy4gVGhlIHRhc2sgY291bGQgbm90IGJlIHByb3ZpZGVkIGJ5IGFueSBvZiB0aGUgcHJvdmlkZXJzLlxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHJlcXVpcmVkVGFza1Byb3ZpZGVyVW5hdmFpbGFibGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0XHQnVGFza1NlcnZpY2UucHJvdmlkZXJVbmF2YWlsYWJsZScsXG5cdFx0XHRcdFx0XHRcdFx0J1dhcm5pbmc6IHswfSB0YXNrcyBhcmUgdW5hdmFpbGFibGUgaW4gdGhlIGN1cnJlbnQgZW52aXJvbm1lbnQuJyxcblx0XHRcdFx0XHRcdFx0XHRjb25maWd1cmluZ1Rhc2suY29uZmlndXJlcy50eXBlXG5cdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICghd2FpdFRvQWN0aXZhdGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHRcdFx0XHQnVGFza1NlcnZpY2Uubm9Db25maWd1cmF0aW9uJyxcblx0XHRcdFx0XHRcdFx0XHQnRXJyb3I6IFRoZSB7MH0gdGFzayBkZXRlY3Rpb24gZGlkblxcJ3QgY29udHJpYnV0ZSBhIHRhc2sgZm9yIHRoZSBmb2xsb3dpbmcgY29uZmlndXJhdGlvbjpcXG57MX1cXG5UaGUgdGFzayB3aWxsIGJlIGlnbm9yZWQuJyxcblx0XHRcdFx0XHRcdFx0XHRjb25maWd1cmluZ1Rhc2suY29uZmlndXJlcy50eXBlLFxuXHRcdFx0XHRcdFx0XHRcdEpTT04uc3RyaW5naWZ5KGNvbmZpZ3VyaW5nVGFzay5fc291cmNlLmNvbmZpZy5lbGVtZW50LCB1bmRlZmluZWQsIDQpXG5cdFx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwodW5Vc2VkQ29uZmlndXJhdGlvblByb21pc2VzKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgLi4uZm9sZGVyVGFza3Muc2V0LnRhc2tzKTtcblx0XHRcdFx0XHRyZXN1bHQuYWRkKGtleSwgLi4uY29udHJpYnV0ZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMZWdhY3lUYXNrQ29uZmlndXJhdGlvbnMod29ya3NwYWNlVGFza3M6IElUYXNrU2V0KTogSVN0cmluZ0RpY3Rpb25hcnk8Q3VzdG9tVGFzaz4gfCB1bmRlZmluZWQge1xuXHRcdGxldCByZXN1bHQ6IElTdHJpbmdEaWN0aW9uYXJ5PEN1c3RvbVRhc2s+IHwgdW5kZWZpbmVkO1xuXHRcdGZ1bmN0aW9uIGdldFJlc3VsdCgpOiBJU3RyaW5nRGljdGlvbmFyeTxDdXN0b21UYXNrPiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdCE7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdGFzayBvZiB3b3Jrc3BhY2VUYXNrcy50YXNrcykge1xuXHRcdFx0aWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZE5hbWUgPSB0YXNrLmNvbW1hbmQgJiYgdGFzay5jb21tYW5kLm5hbWU7XG5cdFx0XHRcdC8vIFRoaXMgaXMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IHdpdGggdGhlIDAuMS4wIHRhc2sgYW5ub3RhdGlvbiBjb2RlXG5cdFx0XHRcdC8vIGlmIHdlIGhhZCBhIGd1bHAsIGpha2Ugb3IgZ3J1bnQgY29tbWFuZCBhIHRhc2sgc3BlY2lmaWNhdGlvbiB3YXMgYSBhbm5vdGF0aW9uXG5cdFx0XHRcdGlmIChjb21tYW5kTmFtZSA9PT0gJ2d1bHAnIHx8IGNvbW1hbmROYW1lID09PSAnZ3J1bnQnIHx8IGNvbW1hbmROYW1lID09PSAnamFrZScpIHtcblx0XHRcdFx0XHRjb25zdCBpZGVudGlmaWVyID0gS2V5ZWRUYXNrSWRlbnRpZmllci5jcmVhdGUoe1xuXHRcdFx0XHRcdFx0dHlwZTogY29tbWFuZE5hbWUsXG5cdFx0XHRcdFx0XHR0YXNrOiB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLm5hbWVcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRnZXRSZXN1bHQoKVtpZGVudGlmaWVyLl9rZXldID0gdGFzaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldFdvcmtzcGFjZVRhc2tzKHJ1blNvdXJjZTogVGFza1J1blNvdXJjZSA9IFRhc2tSdW5Tb3VyY2UuVXNlcik6IFByb21pc2U8TWFwPHN0cmluZywgSVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQ+PiB7XG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fdHJ1c3QoKSkpIHtcblx0XHRcdHJldHVybiBuZXcgTWFwKCk7XG5cdFx0fVxuXHRcdGF3YWl0IHJhY2VUaW1lb3V0KHRoaXMuX3dhaXRGb3JBbGxTdXBwb3J0ZWRFeGVjdXRpb25zLCAyMDAwLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1RpbWVkIG91dCB3YWl0aW5nIGZvciBhbGwgc3VwcG9ydGVkIGV4ZWN1dGlvbnMnKTtcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLl93aGVuVGFza1N5c3RlbVJlYWR5O1xuXHRcdGlmICh0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl91cGRhdGVXb3Jrc3BhY2VUYXNrcyhydW5Tb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIGdldFRhc2tQcm9ibGVtcyhpbnN0YW5jZUlkOiBudW1iZXIpOiBNYXA8c3RyaW5nLCB7IHJlc291cmNlczogVVJJW107IG1hcmtlcnM6IElNYXJrZXJEYXRhW10gfT4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtPy5nZXRUYXNrUHJvYmxlbXMoaW5zdGFuY2VJZCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVXb3Jrc3BhY2VUYXNrcyhydW5Tb3VyY2U6IFRhc2tSdW5Tb3VyY2UgPSBUYXNrUnVuU291cmNlLlVzZXIpOiBQcm9taXNlPE1hcDxzdHJpbmcsIElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0Pj4ge1xuXHRcdHRoaXMuX3dvcmtzcGFjZVRhc2tzUHJvbWlzZSA9IHRoaXMuX2NvbXB1dGVXb3Jrc3BhY2VUYXNrcyhydW5Tb3VyY2UpO1xuXHRcdHJldHVybiB0aGlzLl93b3Jrc3BhY2VUYXNrc1Byb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRBRm9sZGVyKCk6IFByb21pc2U8SVdvcmtzcGFjZUZvbGRlcj4ge1xuXHRcdGxldCBmb2xkZXIgPSB0aGlzLndvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID4gMCA/IHRoaXMud29ya3NwYWNlRm9sZGVyc1swXSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWZvbGRlcikge1xuXHRcdFx0Y29uc3QgdXNlcmhvbWUgPSBhd2FpdCB0aGlzLl9wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdFx0Zm9sZGVyID0gbmV3IFdvcmtzcGFjZUZvbGRlcih7IHVyaTogdXNlcmhvbWUsIG5hbWU6IHJlc291cmNlcy5iYXNlbmFtZSh1c2VyaG9tZSksIGluZGV4OiAwIH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9sZGVyO1xuXHR9XG5cblx0Z2V0VGVybWluYWxzRm9yVGFza3ModGFzazogVHlwZXMuU2luZ2xlT3JNYW55PFRhc2s+KTogVVJJW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtPy5nZXRUZXJtaW5hbHNGb3JUYXNrcyh0YXNrKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfY29tcHV0ZVdvcmtzcGFjZVRhc2tzKHJ1blNvdXJjZTogVGFza1J1blNvdXJjZSA9IFRhc2tSdW5Tb3VyY2UuVXNlcik6IFByb21pc2U8TWFwPHN0cmluZywgSVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQ+PiB7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8SVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQgfCB1bmRlZmluZWQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZUZvbGRlcnMpIHtcblx0XHRcdHByb21pc2VzLnB1c2godGhpcy5fY29tcHV0ZVdvcmtzcGFjZUZvbGRlclRhc2tzKGZvbGRlciwgcnVuU291cmNlKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlcyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgSVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQ+KCk7XG5cdFx0Zm9yIChjb25zdCB2YWx1ZSBvZiB2YWx1ZXMpIHtcblx0XHRcdGlmICh2YWx1ZSkge1xuXHRcdFx0XHRyZXN1bHQuc2V0KHZhbHVlLndvcmtzcGFjZUZvbGRlci51cmkudG9TdHJpbmcoKSwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IHRoaXMuX2dldEFGb2xkZXIoKTtcblx0XHRpZiAodGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZpbGVUYXNrcyA9IGF3YWl0IHRoaXMuX2NvbXB1dGVXb3Jrc3BhY2VGaWxlVGFza3MoZm9sZGVyLCBydW5Tb3VyY2UpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUZpbGVUYXNrcyAmJiB0aGlzLl93b3Jrc3BhY2UgJiYgdGhpcy5fd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0cmVzdWx0LnNldCh0aGlzLl93b3Jrc3BhY2UuY29uZmlndXJhdGlvbi50b1N0cmluZygpLCB3b3Jrc3BhY2VGaWxlVGFza3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVzZXJUYXNrcyA9IGF3YWl0IHRoaXMuX2NvbXB1dGVVc2VyVGFza3MoZm9sZGVyLCBydW5Tb3VyY2UpO1xuXHRcdGlmICh1c2VyVGFza3MpIHtcblx0XHRcdHJlc3VsdC5zZXQoVVNFUl9UQVNLU19HUk9VUF9LRVksIHVzZXJUYXNrcyk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRhc2tzIGF2YWlsYWJsZSBjb250ZXh0IGtleVxuXHRcdGNvbnN0IGhhc0FueVRhc2tzID0gQXJyYXkuZnJvbShyZXN1bHQudmFsdWVzKCkpLnNvbWUoZm9sZGVyUmVzdWx0ID0+XG5cdFx0XHQoZm9sZGVyUmVzdWx0LnNldD8udGFza3MgJiYgZm9sZGVyUmVzdWx0LnNldC50YXNrcy5sZW5ndGggPiAwKSB8fFxuXHRcdFx0KGZvbGRlclJlc3VsdC5jb25maWd1cmF0aW9ucz8uYnlJZGVudGlmaWVyICYmIE9iamVjdC5rZXlzKGZvbGRlclJlc3VsdC5jb25maWd1cmF0aW9ucy5ieUlkZW50aWZpZXIpLmxlbmd0aCA+IDApXG5cdFx0KTtcblx0XHR0aGlzLl90YXNrc0F2YWlsYWJsZVN0YXRlLnNldChoYXNBbnlUYXNrcyk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2pzb25UYXNrc1N1cHBvcnRlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gU2hlbGxFeGVjdXRpb25TdXBwb3J0ZWRDb250ZXh0LmdldFZhbHVlKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKSA9PT0gdHJ1ZSAmJiBQcm9jZXNzRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dC5nZXRWYWx1ZSh0aGlzLl9jb250ZXh0S2V5U2VydmljZSkgPT09IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlV29ya3NwYWNlRm9sZGVyVGFza3Mod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCBydW5Tb3VyY2U6IFRhc2tSdW5Tb3VyY2UgPSBUYXNrUnVuU291cmNlLlVzZXIpOiBQcm9taXNlPElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbiA9ICh0aGlzLl9leGVjdXRpb25FbmdpbmUgPT09IEV4ZWN1dGlvbkVuZ2luZS5Qcm9jZXNzID8gYXdhaXQgdGhpcy5fY29tcHV0ZUxlZ2FjeUNvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyKSA6IGF3YWl0IHRoaXMuX2NvbXB1dGVDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcikpO1xuXHRcdGlmICghd29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbiB8fCAhd29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbi5jb25maWcgfHwgd29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbi5oYXNFcnJvcnMpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyB3b3Jrc3BhY2VGb2xkZXIsIHNldDogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uczogdW5kZWZpbmVkLCBoYXNFcnJvcnM6IHdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24gPyB3b3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uLmhhc0Vycm9ycyA6IGZhbHNlIH0pO1xuXHRcdH1cblx0XHRhd2FpdCBQcm9ibGVtTWF0Y2hlclJlZ2lzdHJ5Lm9uUmVhZHkoKTtcblx0XHRjb25zdCB0YXNrU3lzdGVtSW5mbzogSVRhc2tTeXN0ZW1JbmZvIHwgdW5kZWZpbmVkID0gdGhpcy5fZ2V0VGFza1N5c3RlbUluZm8od29ya3NwYWNlRm9sZGVyLnVyaS5zY2hlbWUpO1xuXHRcdGNvbnN0IHByb2JsZW1SZXBvcnRlciA9IG5ldyBQcm9ibGVtUmVwb3J0ZXIodGhpcy5fb3V0cHV0Q2hhbm5lbCk7XG5cdFx0Y29uc3QgcHJvYmxlbVJlcG9ydGVyTGlzdGVuZXIgPSBwcm9ibGVtUmVwb3J0ZXIub25EaWRFcnJvcihlcnJvciA9PiB0aGlzLl9zaG93T3V0cHV0KHJ1blNvdXJjZSwgdW5kZWZpbmVkLCBlcnJvcikpO1xuXHRcdGNvbnN0IHBhcnNlUmVzdWx0ID0gVGFza0NvbmZpZy5wYXJzZSh3b3Jrc3BhY2VGb2xkZXIsIHVuZGVmaW5lZCwgdGFza1N5c3RlbUluZm8gPyB0YXNrU3lzdGVtSW5mby5wbGF0Zm9ybSA6IFBsYXRmb3JtLnBsYXRmb3JtLCB3b3Jrc3BhY2VGb2xkZXJDb25maWd1cmF0aW9uLmNvbmZpZywgcHJvYmxlbVJlcG9ydGVyLCBUYXNrQ29uZmlnLlRhc2tDb25maWdTb3VyY2UuVGFza3NKc29uLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0cHJvYmxlbVJlcG9ydGVyTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdGxldCBoYXNFcnJvcnMgPSBmYWxzZTtcblx0XHRpZiAoIXBhcnNlUmVzdWx0LnZhbGlkYXRpb25TdGF0dXMuaXNPSygpICYmIChwYXJzZVJlc3VsdC52YWxpZGF0aW9uU3RhdHVzLnN0YXRlICE9PSBWYWxpZGF0aW9uU3RhdGUuSW5mbykpIHtcblx0XHRcdGhhc0Vycm9ycyA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChwcm9ibGVtUmVwb3J0ZXIuc3RhdHVzLmlzRmF0YWwoKSkge1xuXHRcdFx0cHJvYmxlbVJlcG9ydGVyLmZhdGFsKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS5jb25maWd1cmF0aW9uRXJyb3JzJywgJ0Vycm9yOiB0aGUgcHJvdmlkZWQgdGFzayBjb25maWd1cmF0aW9uIGhhcyB2YWxpZGF0aW9uIGVycm9ycyBhbmQgY2FuXFwndCBub3QgYmUgdXNlZC4gUGxlYXNlIGNvcnJlY3QgdGhlIGVycm9ycyBmaXJzdC4nKSk7XG5cdFx0XHRyZXR1cm4geyB3b3Jrc3BhY2VGb2xkZXIsIHNldDogdW5kZWZpbmVkLCBjb25maWd1cmF0aW9uczogdW5kZWZpbmVkLCBoYXNFcnJvcnMgfTtcblx0XHR9XG5cdFx0bGV0IGN1c3RvbWl6ZWRUYXNrczogeyBieUlkZW50aWZpZXI6IElTdHJpbmdEaWN0aW9uYXJ5PENvbmZpZ3VyaW5nVGFzaz4gfSB8IHVuZGVmaW5lZDtcblx0XHRpZiAocGFyc2VSZXN1bHQuY29uZmlndXJlZCAmJiBwYXJzZVJlc3VsdC5jb25maWd1cmVkLmxlbmd0aCA+IDApIHtcblx0XHRcdGN1c3RvbWl6ZWRUYXNrcyA9IHtcblx0XHRcdFx0YnlJZGVudGlmaWVyOiBPYmplY3QuY3JlYXRlKG51bGwpXG5cdFx0XHR9O1xuXHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHBhcnNlUmVzdWx0LmNvbmZpZ3VyZWQpIHtcblx0XHRcdFx0Y3VzdG9taXplZFRhc2tzLmJ5SWRlbnRpZmllclt0YXNrLmNvbmZpZ3VyZXMuX2tleV0gPSB0YXNrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2pzb25UYXNrc1N1cHBvcnRlZCAmJiAocGFyc2VSZXN1bHQuY3VzdG9tLmxlbmd0aCA+IDApKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0N1c3RvbSB3b3Jrc3BhY2UgdGFza3MgYXJlIG5vdCBzdXBwb3J0ZWQuJyk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHdvcmtzcGFjZUZvbGRlciwgc2V0OiB7IHRhc2tzOiB0aGlzLl9qc29uVGFza3NTdXBwb3J0ZWQgPyBwYXJzZVJlc3VsdC5jdXN0b20gOiBbXSB9LCBjb25maWd1cmF0aW9uczogY3VzdG9taXplZFRhc2tzLCBoYXNFcnJvcnMgfTtcblx0fVxuXG5cdHByaXZhdGUgX3Rlc3RQYXJzZUV4dGVybmFsQ29uZmlnKGNvbmZpZzogVGFza0NvbmZpZy5JRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCwgbG9jYXRpb246IHN0cmluZyk6IHsgY29uZmlnOiBUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkOyBoYXNQYXJzZUVycm9yczogYm9vbGVhbiB9IHtcblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0cmV0dXJuIHsgY29uZmlnOiB1bmRlZmluZWQsIGhhc1BhcnNlRXJyb3JzOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZUVycm9yczogc3RyaW5nW10gPSAoY29uZmlnIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLiRwYXJzZUVycm9ycyBhcyBzdHJpbmdbXTtcblx0XHRpZiAocGFyc2VFcnJvcnMpIHtcblx0XHRcdGxldCBpc0FmZmVjdGVkID0gZmFsc2U7XG5cdFx0XHRmb3IgKGNvbnN0IHBhcnNlRXJyb3Igb2YgcGFyc2VFcnJvcnMpIHtcblx0XHRcdFx0aWYgKC90YXNrc1xcLmpzb24kLy50ZXN0KHBhcnNlRXJyb3IpKSB7XG5cdFx0XHRcdFx0aXNBZmZlY3RlZCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpc0FmZmVjdGVkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZyhubHMubG9jYWxpemUoeyBrZXk6ICdUYXNrU3lzdGVtLmludmFsaWRUYXNrSnNvbk90aGVyJywgY29tbWVudDogWydNZXNzYWdlIG5vdGlmaWVzIG9mIGFuIGVycm9yIGluIG9uZSBvZiBzZXZlcmFsIHBsYWNlcyB0aGVyZSBpcyB0YXNrcyByZWxhdGVkIGpzb24sIG5vdCBuZWNlc3NhcmlseSBpbiBhIGZpbGUgbmFtZWQgdGFza3MuanNvbiddIH0sICdFcnJvcjogVGhlIGNvbnRlbnQgb2YgdGhlIHRhc2tzIGpzb24gaW4gezB9IGhhcyBzeW50YXggZXJyb3JzLiBQbGVhc2UgY29ycmVjdCB0aGVtIGJlZm9yZSBleGVjdXRpbmcgYSB0YXNrLicsIGxvY2F0aW9uKSk7XG5cdFx0XHRcdHRoaXMuX3Nob3dPdXRwdXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIG5scy5sb2NhbGl6ZSh7IGtleTogJ1Rhc2tTeXN0ZW0uaW52YWxpZFRhc2tKc29uT3RoZXInLCBjb21tZW50OiBbJ01lc3NhZ2Ugbm90aWZpZXMgb2YgYW4gZXJyb3IgaW4gb25lIG9mIHNldmVyYWwgcGxhY2VzIHRoZXJlIGlzIHRhc2tzIHJlbGF0ZWQganNvbiwgbm90IG5lY2Vzc2FyaWx5IGluIGEgZmlsZSBuYW1lZCB0YXNrcy5qc29uJ10gfSwgJ0Vycm9yOiBUaGUgY29udGVudCBvZiB0aGUgdGFza3MganNvbiBpbiB7MH0gaGFzIHN5bnRheCBlcnJvcnMuIFBsZWFzZSBjb3JyZWN0IHRoZW0gYmVmb3JlIGV4ZWN1dGluZyBhIHRhc2suJywgbG9jYXRpb24pKTtcblx0XHRcdFx0cmV0dXJuIHsgY29uZmlnLCBoYXNQYXJzZUVycm9yczogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBjb25maWcsIGhhc1BhcnNlRXJyb3JzOiBmYWxzZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfbG9nKHZhbHVlOiBzdHJpbmcsIHZlcmJvc2U/OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF2ZXJib3NlIHx8IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tTZXR0aW5nSWQuVmVyYm9zZUxvZ2dpbmcpKSB7XG5cdFx0XHR0aGlzLl9vdXRwdXRDaGFubmVsLmFwcGVuZCh2YWx1ZSArICdcXG4nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlV29ya3NwYWNlRmlsZVRhc2tzKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgcnVuU291cmNlOiBUYXNrUnVuU291cmNlID0gVGFza1J1blNvdXJjZS5Vc2VyKTogUHJvbWlzZTxJV29ya3NwYWNlRm9sZGVyVGFza1Jlc3VsdD4ge1xuXHRcdGlmICh0aGlzLl9leGVjdXRpb25FbmdpbmUgPT09IEV4ZWN1dGlvbkVuZ2luZS5Qcm9jZXNzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW1wdHlXb3Jrc3BhY2VUYXNrUmVzdWx0cyh3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdH1cblx0XHRjb25zdCB3b3Jrc3BhY2VGaWxlQ29uZmlnID0gdGhpcy5fZ2V0Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIsIFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGUpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLl90ZXN0UGFyc2VFeHRlcm5hbENvbmZpZyh3b3Jrc3BhY2VGaWxlQ29uZmlnLmNvbmZpZywgbmxzLmxvY2FsaXplKCdUYXNrc1N5c3RlbS5sb2NhdGlvbldvcmtzcGFjZUNvbmZpZycsICd3b3Jrc3BhY2UgZmlsZScpKTtcblx0XHRjb25zdCBjdXN0b21pemVkVGFza3M6IHsgYnlJZGVudGlmaWVyOiBJU3RyaW5nRGljdGlvbmFyeTxDb25maWd1cmluZ1Rhc2s+IH0gPSB7XG5cdFx0XHRieUlkZW50aWZpZXI6IE9iamVjdC5jcmVhdGUobnVsbClcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VzdG9tOiBDdXN0b21UYXNrW10gPSBbXTtcblx0XHRhd2FpdCB0aGlzLl9jb21wdXRlVGFza3NGb3JTaW5nbGVDb25maWcod29ya3NwYWNlRm9sZGVyLCBjb25maWd1cmF0aW9uLmNvbmZpZywgcnVuU291cmNlLCBjdXN0b20sIGN1c3RvbWl6ZWRUYXNrcy5ieUlkZW50aWZpZXIsIFRhc2tDb25maWcuVGFza0NvbmZpZ1NvdXJjZS5Xb3Jrc3BhY2VGaWxlKTtcblx0XHRjb25zdCBlbmdpbmUgPSBjb25maWd1cmF0aW9uLmNvbmZpZyA/IFRhc2tDb25maWcuRXhlY3V0aW9uRW5naW5lLmZyb20oY29uZmlndXJhdGlvbi5jb25maWcpIDogRXhlY3V0aW9uRW5naW5lLlRlcm1pbmFsO1xuXHRcdGlmIChlbmdpbmUgPT09IEV4ZWN1dGlvbkVuZ2luZS5Qcm9jZXNzKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdUYXNrU3lzdGVtLnZlcnNpb25Xb3Jrc3BhY2VGaWxlJywgJ09ubHkgdGFza3MgdmVyc2lvbiAyLjAuMCBwZXJtaXR0ZWQgaW4gd29ya3NwYWNlIGNvbmZpZ3VyYXRpb24gZmlsZXMuJykpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VtcHR5V29ya3NwYWNlVGFza1Jlc3VsdHMod29ya3NwYWNlRm9sZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgd29ya3NwYWNlRm9sZGVyLCBzZXQ6IHsgdGFza3M6IGN1c3RvbSB9LCBjb25maWd1cmF0aW9uczogY3VzdG9taXplZFRhc2tzLCBoYXNFcnJvcnM6IGNvbmZpZ3VyYXRpb24uaGFzUGFyc2VFcnJvcnMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVVc2VyVGFza3Mod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCBydW5Tb3VyY2U6IFRhc2tSdW5Tb3VyY2UgPSBUYXNrUnVuU291cmNlLlVzZXIpOiBQcm9taXNlPElXb3Jrc3BhY2VGb2xkZXJUYXNrUmVzdWx0PiB7XG5cdFx0aWYgKHRoaXMuX2V4ZWN1dGlvbkVuZ2luZSA9PT0gRXhlY3V0aW9uRW5naW5lLlByb2Nlc3MpIHtcblx0XHRcdHJldHVybiB0aGlzLl9lbXB0eVdvcmtzcGFjZVRhc2tSZXN1bHRzKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0fVxuXHRcdGNvbnN0IHVzZXJUYXNrc0NvbmZpZyA9IHRoaXMuX2dldENvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyLCBUYXNrU291cmNlS2luZC5Vc2VyKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5fdGVzdFBhcnNlRXh0ZXJuYWxDb25maWcodXNlclRhc2tzQ29uZmlnLmNvbmZpZywgbmxzLmxvY2FsaXplKCdUYXNrc1N5c3RlbS5sb2NhdGlvblVzZXJDb25maWcnLCAndXNlciBzZXR0aW5ncycpKTtcblx0XHRjb25zdCBjdXN0b21pemVkVGFza3M6IHsgYnlJZGVudGlmaWVyOiBJU3RyaW5nRGljdGlvbmFyeTxDb25maWd1cmluZ1Rhc2s+IH0gPSB7XG5cdFx0XHRieUlkZW50aWZpZXI6IE9iamVjdC5jcmVhdGUobnVsbClcblx0XHR9O1xuXG5cdFx0Y29uc3QgY3VzdG9tOiBDdXN0b21UYXNrW10gPSBbXTtcblx0XHRhd2FpdCB0aGlzLl9jb21wdXRlVGFza3NGb3JTaW5nbGVDb25maWcod29ya3NwYWNlRm9sZGVyLCBjb25maWd1cmF0aW9uLmNvbmZpZywgcnVuU291cmNlLCBjdXN0b20sIGN1c3RvbWl6ZWRUYXNrcy5ieUlkZW50aWZpZXIsIFRhc2tDb25maWcuVGFza0NvbmZpZ1NvdXJjZS5Vc2VyKTtcblx0XHRjb25zdCBlbmdpbmUgPSBjb25maWd1cmF0aW9uLmNvbmZpZyA/IFRhc2tDb25maWcuRXhlY3V0aW9uRW5naW5lLmZyb20oY29uZmlndXJhdGlvbi5jb25maWcpIDogRXhlY3V0aW9uRW5naW5lLlRlcm1pbmFsO1xuXHRcdGlmIChlbmdpbmUgPT09IEV4ZWN1dGlvbkVuZ2luZS5Qcm9jZXNzKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obmxzLmxvY2FsaXplKCdUYXNrU3lzdGVtLnZlcnNpb25TZXR0aW5ncycsICdPbmx5IHRhc2tzIHZlcnNpb24gMi4wLjAgcGVybWl0dGVkIGluIHVzZXIgc2V0dGluZ3MuJykpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VtcHR5V29ya3NwYWNlVGFza1Jlc3VsdHMod29ya3NwYWNlRm9sZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgd29ya3NwYWNlRm9sZGVyLCBzZXQ6IHsgdGFza3M6IGN1c3RvbSB9LCBjb25maWd1cmF0aW9uczogY3VzdG9taXplZFRhc2tzLCBoYXNFcnJvcnM6IGNvbmZpZ3VyYXRpb24uaGFzUGFyc2VFcnJvcnMgfTtcblx0fVxuXG5cdHByaXZhdGUgX2VtcHR5V29ya3NwYWNlVGFza1Jlc3VsdHMod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKTogSVdvcmtzcGFjZUZvbGRlclRhc2tSZXN1bHQge1xuXHRcdHJldHVybiB7IHdvcmtzcGFjZUZvbGRlciwgc2V0OiB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25zOiB1bmRlZmluZWQsIGhhc0Vycm9yczogZmFsc2UgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVUYXNrc0ZvclNpbmdsZUNvbmZpZyh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsIGNvbmZpZzogVGFza0NvbmZpZy5JRXh0ZXJuYWxUYXNrUnVubmVyQ29uZmlndXJhdGlvbiB8IHVuZGVmaW5lZCwgcnVuU291cmNlOiBUYXNrUnVuU291cmNlLCBjdXN0b206IEN1c3RvbVRhc2tbXSwgY3VzdG9taXplZDogSVN0cmluZ0RpY3Rpb25hcnk8Q29uZmlndXJpbmdUYXNrPiwgc291cmNlOiBUYXNrQ29uZmlnLlRhc2tDb25maWdTb3VyY2UsIGlzUmVjZW50VGFzazogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKCF3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1Rhc2tTZXJ2aWNlLmNvbXB1dGVUYXNrc0ZvclNpbmdsZUNvbmZpZzogbm8gd29ya3NwYWNlIGZvbGRlciBmb3Igd29yc2tzcGFjZScsIHRoaXMuX3dvcmtzcGFjZT8uaWQpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCB0YXNrU3lzdGVtSW5mbzogSVRhc2tTeXN0ZW1JbmZvIHwgdW5kZWZpbmVkID0gdGhpcy5fZ2V0VGFza1N5c3RlbUluZm8od29ya3NwYWNlRm9sZGVyLnVyaS5zY2hlbWUpO1xuXHRcdGNvbnN0IHByb2JsZW1SZXBvcnRlciA9IG5ldyBQcm9ibGVtUmVwb3J0ZXIodGhpcy5fb3V0cHV0Q2hhbm5lbCk7XG5cdFx0Y29uc3QgcGFyc2VSZXN1bHQgPSBUYXNrQ29uZmlnLnBhcnNlKHdvcmtzcGFjZUZvbGRlciwgdGhpcy5fd29ya3NwYWNlLCB0YXNrU3lzdGVtSW5mbyA/IHRhc2tTeXN0ZW1JbmZvLnBsYXRmb3JtIDogUGxhdGZvcm0ucGxhdGZvcm0sIGNvbmZpZywgcHJvYmxlbVJlcG9ydGVyLCBzb3VyY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCBpc1JlY2VudFRhc2spO1xuXHRcdGxldCBoYXNFcnJvcnMgPSBmYWxzZTtcblx0XHRpZiAoIXBhcnNlUmVzdWx0LnZhbGlkYXRpb25TdGF0dXMuaXNPSygpICYmIChwYXJzZVJlc3VsdC52YWxpZGF0aW9uU3RhdHVzLnN0YXRlICE9PSBWYWxpZGF0aW9uU3RhdGUuSW5mbykpIHtcblx0XHRcdHRoaXMuX3Nob3dPdXRwdXQocnVuU291cmNlKTtcblx0XHRcdGhhc0Vycm9ycyA9IHRydWU7XG5cdFx0fVxuXHRcdGlmIChwcm9ibGVtUmVwb3J0ZXIuc3RhdHVzLmlzRmF0YWwoKSkge1xuXHRcdFx0cHJvYmxlbVJlcG9ydGVyLmZhdGFsKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS5jb25maWd1cmF0aW9uRXJyb3JzJywgJ0Vycm9yOiB0aGUgcHJvdmlkZWQgdGFzayBjb25maWd1cmF0aW9uIGhhcyB2YWxpZGF0aW9uIGVycm9ycyBhbmQgY2FuXFwndCBub3QgYmUgdXNlZC4gUGxlYXNlIGNvcnJlY3QgdGhlIGVycm9ycyBmaXJzdC4nKSk7XG5cdFx0XHRyZXR1cm4gaGFzRXJyb3JzO1xuXHRcdH1cblx0XHRpZiAocGFyc2VSZXN1bHQuY29uZmlndXJlZCAmJiBwYXJzZVJlc3VsdC5jb25maWd1cmVkLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBwYXJzZVJlc3VsdC5jb25maWd1cmVkKSB7XG5cdFx0XHRcdGN1c3RvbWl6ZWRbdGFzay5jb25maWd1cmVzLl9rZXldID0gdGFzaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9qc29uVGFza3NTdXBwb3J0ZWQgJiYgKHBhcnNlUmVzdWx0LmN1c3RvbS5sZW5ndGggPiAwKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdDdXN0b20gd29ya3NwYWNlIHRhc2tzIGFyZSBub3Qgc3VwcG9ydGVkLicpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgcGFyc2VSZXN1bHQuY3VzdG9tKSB7XG5cdFx0XHRcdGN1c3RvbS5wdXNoKHRhc2spO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaGFzRXJyb3JzO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUNvbmZpZ3VyYXRpb24od29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKTogUHJvbWlzZTxJV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHsgY29uZmlnLCBoYXNQYXJzZUVycm9ycyB9ID0gdGhpcy5fZ2V0Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmU8SVdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb25SZXN1bHQ+KHsgd29ya3NwYWNlRm9sZGVyLCBjb25maWcsIGhhc0Vycm9yczogaGFzUGFyc2VFcnJvcnMgfSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2NvbXB1dGVMZWdhY3lDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcik6IFByb21pc2U8SVdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb25SZXN1bHQ+O1xuXG5cdHByaXZhdGUgX2NvbXB1dGVXb3Jrc3BhY2VGb2xkZXJTZXR1cCgpOiBbSVdvcmtzcGFjZUZvbGRlcltdLCBJV29ya3NwYWNlRm9sZGVyW10sIEV4ZWN1dGlvbkVuZ2luZSwgSnNvblNjaGVtYVZlcnNpb24sIElXb3Jrc3BhY2UgfCB1bmRlZmluZWRdIHtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10gPSBbXTtcblx0XHRjb25zdCBpZ25vcmVkV29ya3NwYWNlRm9sZGVyczogSVdvcmtzcGFjZUZvbGRlcltdID0gW107XG5cdFx0bGV0IGV4ZWN1dGlvbkVuZ2luZSA9IEV4ZWN1dGlvbkVuZ2luZS5UZXJtaW5hbDtcblx0XHRsZXQgc2NoZW1hVmVyc2lvbiA9IEpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMDtcblx0XHRsZXQgd29ya3NwYWNlOiBJV29ya3NwYWNlIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciA9IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF07XG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXJzLnB1c2god29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdGV4ZWN1dGlvbkVuZ2luZSA9IHRoaXMuX2NvbXB1dGVFeGVjdXRpb25FbmdpbmUod29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdHNjaGVtYVZlcnNpb24gPSB0aGlzLl9jb21wdXRlSnNvblNjaGVtYVZlcnNpb24od29ya3NwYWNlRm9sZGVyKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0d29ya3NwYWNlID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZUZvbGRlciBvZiB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRcdGlmIChzY2hlbWFWZXJzaW9uID09PSB0aGlzLl9jb21wdXRlSnNvblNjaGVtYVZlcnNpb24od29ya3NwYWNlRm9sZGVyKSkge1xuXHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlcnMucHVzaCh3b3Jrc3BhY2VGb2xkZXIpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlnbm9yZWRXb3Jrc3BhY2VGb2xkZXJzLnB1c2god29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKFxuXHRcdFx0XHRcdFx0J3Rhc2tTZXJ2aWNlLmlnbm9yaW5nRm9sZGVyJyxcblx0XHRcdFx0XHRcdCdJZ25vcmluZyB0YXNrIGNvbmZpZ3VyYXRpb25zIGZvciB3b3Jrc3BhY2UgZm9sZGVyIHswfS4gTXVsdGkgZm9sZGVyIHdvcmtzcGFjZSB0YXNrIHN1cHBvcnQgcmVxdWlyZXMgdGhhdCBhbGwgZm9sZGVycyB1c2UgdGFzayB2ZXJzaW9uIDIuMC4wJyxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlci51cmkuZnNQYXRoKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFt3b3Jrc3BhY2VGb2xkZXJzLCBpZ25vcmVkV29ya3NwYWNlRm9sZGVycywgZXhlY3V0aW9uRW5naW5lLCBzY2hlbWFWZXJzaW9uLCB3b3Jrc3BhY2VdO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZUV4ZWN1dGlvbkVuZ2luZSh3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIpOiBFeGVjdXRpb25FbmdpbmUge1xuXHRcdGNvbnN0IHsgY29uZmlnIH0gPSB0aGlzLl9nZXRDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdHJldHVybiBFeGVjdXRpb25FbmdpbmUuX2RlZmF1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiBUYXNrQ29uZmlnLkV4ZWN1dGlvbkVuZ2luZS5mcm9tKGNvbmZpZyk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wdXRlSnNvblNjaGVtYVZlcnNpb24od29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKTogSnNvblNjaGVtYVZlcnNpb24ge1xuXHRcdGNvbnN0IHsgY29uZmlnIH0gPSB0aGlzLl9nZXRDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdHJldHVybiBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzA7XG5cdFx0fVxuXHRcdHJldHVybiBUYXNrQ29uZmlnLkpzb25TY2hlbWFWZXJzaW9uLmZyb20oY29uZmlnKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0Q29uZmlndXJhdGlvbih3b3Jrc3BhY2VGb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIsIHNvdXJjZT86IHN0cmluZyk6IHsgY29uZmlnOiBUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkOyBoYXNQYXJzZUVycm9yczogYm9vbGVhbiB9IHtcblx0XHRsZXQgcmVzdWx0O1xuXHRcdGlmICgoc291cmNlICE9PSBUYXNrU291cmNlS2luZC5Vc2VyKSAmJiAodGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpKSB7XG5cdFx0XHRyZXN1bHQgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHdob2xlQ29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDxUYXNrQ29uZmlnLklFeHRlcm5hbFRhc2tSdW5uZXJDb25maWd1cmF0aW9uPigndGFza3MnLCB7IHJlc291cmNlOiB3b3Jrc3BhY2VGb2xkZXIudXJpIH0pO1xuXHRcdFx0c3dpdGNoIChzb3VyY2UpIHtcblx0XHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Vc2VyOiB7XG5cdFx0XHRcdFx0aWYgKHdob2xlQ29uZmlnLnVzZXJWYWx1ZSAhPT0gd2hvbGVDb25maWcud29ya3NwYWNlRm9sZGVyVmFsdWUpIHtcblx0XHRcdFx0XHRcdHJlc3VsdCA9IE9iamVjdHMuZGVlcENsb25lKHdob2xlQ29uZmlnLnVzZXJWYWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlOiByZXN1bHQgPSBPYmplY3RzLmRlZXBDbG9uZSh3aG9sZUNvbmZpZy53b3Jrc3BhY2VGb2xkZXJWYWx1ZSk7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZUZpbGU6IHtcblx0XHRcdFx0XHRpZiAoKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSlcblx0XHRcdFx0XHRcdCYmICh3aG9sZUNvbmZpZy53b3Jrc3BhY2VGb2xkZXJWYWx1ZSAhPT0gd2hvbGVDb25maWcud29ya3NwYWNlVmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQgPSBPYmplY3RzLmRlZXBDbG9uZSh3aG9sZUNvbmZpZy53b3Jrc3BhY2VWYWx1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRlZmF1bHQ6IHJlc3VsdCA9IE9iamVjdHMuZGVlcENsb25lKHdob2xlQ29uZmlnLndvcmtzcGFjZUZvbGRlclZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiB7IGNvbmZpZzogdW5kZWZpbmVkLCBoYXNQYXJzZUVycm9yczogZmFsc2UgfTtcblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VFcnJvcnM6IHN0cmluZ1tdID0gKHJlc3VsdCBhcyB1bmtub3duIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS4kcGFyc2VFcnJvcnMgYXMgc3RyaW5nW107XG5cdFx0aWYgKHBhcnNlRXJyb3JzKSB7XG5cdFx0XHRsZXQgaXNBZmZlY3RlZCA9IGZhbHNlO1xuXHRcdFx0Zm9yIChjb25zdCBwYXJzZUVycm9yIG9mIHBhcnNlRXJyb3JzKSB7XG5cdFx0XHRcdGlmICgvdGFza3NcXC5qc29uJC8udGVzdChwYXJzZUVycm9yKSkge1xuXHRcdFx0XHRcdGlzQWZmZWN0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBZmZlY3RlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2cobmxzLmxvY2FsaXplKCdUYXNrU3lzdGVtLmludmFsaWRUYXNrSnNvbicsICdFcnJvcjogVGhlIGNvbnRlbnQgb2YgdGhlIHRhc2tzLmpzb24gZmlsZSBoYXMgc3ludGF4IGVycm9ycy4gUGxlYXNlIGNvcnJlY3QgdGhlbSBiZWZvcmUgZXhlY3V0aW5nIGEgdGFzay4nKSk7XG5cdFx0XHRcdHRoaXMuX3Nob3dPdXRwdXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS5pbnZhbGlkVGFza0pzb24nLCAnRXJyb3I6IFRoZSBjb250ZW50IG9mIHRoZSB0YXNrcy5qc29uIGZpbGUgaGFzIHN5bnRheCBlcnJvcnMuIFBsZWFzZSBjb3JyZWN0IHRoZW0gYmVmb3JlIGV4ZWN1dGluZyBhIHRhc2suJykpO1xuXHRcdFx0XHRyZXR1cm4geyBjb25maWc6IHVuZGVmaW5lZCwgaGFzUGFyc2VFcnJvcnM6IHRydWUgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHsgY29uZmlnOiByZXN1bHQsIGhhc1BhcnNlRXJyb3JzOiBmYWxzZSB9O1xuXHR9XG5cblx0cHVibGljIGluVGVybWluYWwoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX3Rhc2tTeXN0ZW0pIHtcblx0XHRcdHJldHVybiB0aGlzLl90YXNrU3lzdGVtIGluc3RhbmNlb2YgVGVybWluYWxUYXNrU3lzdGVtO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZXhlY3V0aW9uRW5naW5lID09PSBFeGVjdXRpb25FbmdpbmUuVGVybWluYWw7XG5cdH1cblxuXHRwdWJsaWMgY29uZmlndXJlQWN0aW9uKCk6IEFjdGlvbiB7XG5cdFx0Y29uc3QgdGhpc0NhcHR1cmU6IEFic3RyYWN0VGFza1NlcnZpY2UgPSB0aGlzO1xuXHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBBY3Rpb24ge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKENvbmZpZ3VyZVRhc2tBY3Rpb24uSUQsIENvbmZpZ3VyZVRhc2tBY3Rpb24uVEVYVC52YWx1ZSwgdW5kZWZpbmVkLCB0cnVlLCAoKSA9PiB7IHRoaXNDYXB0dXJlLl9ydW5Db25maWd1cmVUYXNrcygpOyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7IH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVFcnJvcihlcnI6IHVua25vd24pOiB2b2lkIHtcblx0XHRsZXQgc2hvd091dHB1dCA9IHRydWU7XG5cdFx0aWYgKGVyciBpbnN0YW5jZW9mIFRhc2tFcnJvcikge1xuXHRcdFx0Y29uc3QgYnVpbGRFcnJvciA9IGVycjtcblx0XHRcdGNvbnN0IG5lZWRzQ29uZmlnID0gYnVpbGRFcnJvci5jb2RlID09PSBUYXNrRXJyb3JzLk5vdENvbmZpZ3VyZWQgfHwgYnVpbGRFcnJvci5jb2RlID09PSBUYXNrRXJyb3JzLk5vQnVpbGRUYXNrIHx8IGJ1aWxkRXJyb3IuY29kZSA9PT0gVGFza0Vycm9ycy5Ob1Rlc3RUYXNrO1xuXHRcdFx0Y29uc3QgbmVlZHNUZXJtaW5hdGUgPSBidWlsZEVycm9yLmNvZGUgPT09IFRhc2tFcnJvcnMuUnVubmluZ1Rhc2s7XG5cdFx0XHRpZiAobmVlZHNDb25maWcgfHwgbmVlZHNUZXJtaW5hdGUpIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoYnVpbGRFcnJvci5zZXZlcml0eSwgYnVpbGRFcnJvci5tZXNzYWdlLCBbe1xuXHRcdFx0XHRcdGxhYmVsOiBuZWVkc0NvbmZpZyA/IENvbmZpZ3VyZVRhc2tBY3Rpb24uVEVYVC52YWx1ZSA6IG5scy5sb2NhbGl6ZSgnVGVybWluYXRlQWN0aW9uLmxhYmVsJywgXCJUZXJtaW5hdGUgVGFza1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdGlmIChuZWVkc0NvbmZpZykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9ydW5Db25maWd1cmVUYXNrcygpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcnVuVGVybWluYXRlQ29tbWFuZCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoeyBzZXZlcml0eTogYnVpbGRFcnJvci5zZXZlcml0eSwgbWVzc2FnZTogYnVpbGRFcnJvci5tZXNzYWdlIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoZXJyIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdGNvbnN0IGVycm9yID0gZXJyO1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvci5tZXNzYWdlKTtcblx0XHRcdHNob3dPdXRwdXQgPSBmYWxzZTtcblx0XHR9IGVsc2UgaWYgKFR5cGVzLmlzU3RyaW5nKGVycikpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoPHN0cmluZz5lcnIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnVGFza1N5c3RlbS51bmtub3duRXJyb3InLCAnQW4gZXJyb3IgaGFzIG9jY3VycmVkIHdoaWxlIHJ1bm5pbmcgYSB0YXNrLiBTZWUgdGFzayBsb2cgZm9yIGRldGFpbHMuJykpO1xuXHRcdH1cblx0XHRpZiAoc2hvd091dHB1dCkge1xuXHRcdFx0dGhpcy5fc2hvd091dHB1dCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgVHlwZXMuaXNTdHJpbmcoZXJyKSA/IGVyciBhcyBzdHJpbmcgOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Nob3dEZXRhaWwoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFFVSUNLT1BFTl9ERVRBSUxfQ09ORklHKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVRhc2tRdWlja1BpY2tFbnRyaWVzKHRhc2tzOiBUYXNrW10sIGdyb3VwOiBib29sZWFuID0gZmFsc2UsIHNvcnQ6IGJvb2xlYW4gPSBmYWxzZSwgc2VsZWN0ZWRFbnRyeT86IElUYXNrUXVpY2tQaWNrRW50cnksIGluY2x1ZGVSZWNlbnRzOiBib29sZWFuID0gdHJ1ZSk6IFByb21pc2U8SVRhc2tRdWlja1BpY2tFbnRyeVtdPiB7XG5cdFx0bGV0IGVuY291bnRlcmVkVGFza3M6IHsgW2tleTogc3RyaW5nXTogSVRhc2tRdWlja1BpY2tFbnRyeVtdIH0gPSB7fTtcblx0XHRpZiAodGFza3MgPT09IHVuZGVmaW5lZCB8fCB0YXNrcyA9PT0gbnVsbCB8fCB0YXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgVGFza1F1aWNrUGlja0VudHJ5ID0gKHRhc2s6IFRhc2spOiBJVGFza1F1aWNrUGlja0VudHJ5ID0+IHtcblx0XHRcdGNvbnN0IG5ld0VudHJ5ID0geyBsYWJlbDogdGFzay5fbGFiZWwsIGRlc2NyaXB0aW9uOiB0aGlzLmdldFRhc2tEZXNjcmlwdGlvbih0YXNrKSwgdGFzaywgZGV0YWlsOiB0aGlzLl9zaG93RGV0YWlsKCkgPyB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRldGFpbCA6IHVuZGVmaW5lZCB9O1xuXHRcdFx0aWYgKGVuY291bnRlcmVkVGFza3NbdGFzay5faWRdKSB7XG5cdFx0XHRcdGlmIChlbmNvdW50ZXJlZFRhc2tzW3Rhc2suX2lkXS5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRlbmNvdW50ZXJlZFRhc2tzW3Rhc2suX2lkXVswXS5sYWJlbCArPSAnICgxKSc7XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV3RW50cnkubGFiZWwgPSBuZXdFbnRyeS5sYWJlbCArICcgKCcgKyAoZW5jb3VudGVyZWRUYXNrc1t0YXNrLl9pZF0ubGVuZ3RoICsgMSkudG9TdHJpbmcoKSArICcpJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGVuY291bnRlcmVkVGFza3NbdGFzay5faWRdID0gW107XG5cdFx0XHR9XG5cdFx0XHRlbmNvdW50ZXJlZFRhc2tzW3Rhc2suX2lkXS5wdXNoKG5ld0VudHJ5KTtcblx0XHRcdHJldHVybiBuZXdFbnRyeTtcblxuXHRcdH07XG5cdFx0ZnVuY3Rpb24gZmlsbEVudHJpZXMoZW50cmllczogUXVpY2tQaWNrSW5wdXQ8SVRhc2tRdWlja1BpY2tFbnRyeT5bXSwgdGFza3M6IFRhc2tbXSwgZ3JvdXBMYWJlbDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRpZiAodGFza3MubGVuZ3RoKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogZ3JvdXBMYWJlbCB9KTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRjb25zdCBlbnRyeTogSVRhc2tRdWlja1BpY2tFbnRyeSA9IFRhc2tRdWlja1BpY2tFbnRyeSh0YXNrKTtcblx0XHRcdFx0ZW50cnkuYnV0dG9ucyA9IFt7IGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGNvbmZpZ3VyZVRhc2tJY29uKSwgdG9vbHRpcDogbmxzLmxvY2FsaXplKCdjb25maWd1cmVUYXNrJywgXCJDb25maWd1cmUgVGFza1wiKSB9XTtcblx0XHRcdFx0aWYgKHNlbGVjdGVkRW50cnkgJiYgKHRhc2sgPT09IHNlbGVjdGVkRW50cnkudGFzaykpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnVuc2hpZnQoc2VsZWN0ZWRFbnRyeSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgZW50cmllczogSVRhc2tRdWlja1BpY2tFbnRyeVtdO1xuXHRcdGlmIChncm91cCkge1xuXHRcdFx0ZW50cmllcyA9IFtdO1xuXHRcdFx0aWYgKHRhc2tzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goVGFza1F1aWNrUGlja0VudHJ5KHRhc2tzWzBdKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZWNlbnRseVVzZWRUYXNrcyA9IGF3YWl0IHRoaXMuZ2V0U2F2ZWRUYXNrcygnaGlzdG9yaWNhbCcpO1xuXHRcdFx0XHRjb25zdCByZWNlbnQ6IFRhc2tbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCByZWNlbnRTZXQ6IFNldDxzdHJpbmc+ID0gbmV3IFNldCgpO1xuXHRcdFx0XHRsZXQgY29uZmlndXJlZDogVGFza1tdID0gW107XG5cdFx0XHRcdGxldCBkZXRlY3RlZDogVGFza1tdID0gW107XG5cdFx0XHRcdGNvbnN0IHRhc2tNYXA6IElTdHJpbmdEaWN0aW9uYXJ5PFRhc2s+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdFx0dGFza3MuZm9yRWFjaCh0YXNrID0+IHtcblx0XHRcdFx0XHRjb25zdCBrZXkgPSB0YXNrLmdldENvbW1vblRhc2tJZCgpO1xuXHRcdFx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0XHRcdHRhc2tNYXBba2V5XSA9IHRhc2s7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmVjZW50bHlVc2VkVGFza3MucmV2ZXJzZSgpLmZvckVhY2gocmVjZW50VGFzayA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gcmVjZW50VGFzay5nZXRDb21tb25UYXNrSWQoKTtcblx0XHRcdFx0XHRpZiAoa2V5KSB7XG5cdFx0XHRcdFx0XHRyZWNlbnRTZXQuYWRkKGtleSk7XG5cdFx0XHRcdFx0XHRjb25zdCB0YXNrID0gdGFza01hcFtrZXldO1xuXHRcdFx0XHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0XHRcdFx0cmVjZW50LnB1c2godGFzayk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5ID0gdGFzay5nZXRDb21tb25UYXNrSWQoKTtcblx0XHRcdFx0XHRpZiAoIWtleSB8fCAhcmVjZW50U2V0LmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0XHRpZiAoKHRhc2suX3NvdXJjZS5raW5kID09PSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2UpIHx8ICh0YXNrLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuVXNlcikpIHtcblx0XHRcdFx0XHRcdFx0Y29uZmlndXJlZC5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWQucHVzaCh0YXNrKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc29ydGVyID0gdGhpcy5jcmVhdGVTb3J0ZXIoKTtcblx0XHRcdFx0aWYgKGluY2x1ZGVSZWNlbnRzKSB7XG5cdFx0XHRcdFx0ZmlsbEVudHJpZXMoZW50cmllcywgcmVjZW50LCBubHMubG9jYWxpemUoJ3JlY2VudGx5VXNlZCcsICdyZWNlbnRseSB1c2VkIHRhc2tzJykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbmZpZ3VyZWQgPSBjb25maWd1cmVkLnNvcnQoKGEsIGIpID0+IHNvcnRlci5jb21wYXJlKGEsIGIpKTtcblx0XHRcdFx0ZmlsbEVudHJpZXMoZW50cmllcywgY29uZmlndXJlZCwgbmxzLmxvY2FsaXplKCdjb25maWd1cmVkJywgJ2NvbmZpZ3VyZWQgdGFza3MnKSk7XG5cdFx0XHRcdGRldGVjdGVkID0gZGV0ZWN0ZWQuc29ydCgoYSwgYikgPT4gc29ydGVyLmNvbXBhcmUoYSwgYikpO1xuXHRcdFx0XHRmaWxsRW50cmllcyhlbnRyaWVzLCBkZXRlY3RlZCwgbmxzLmxvY2FsaXplKCdkZXRlY3RlZCcsICdkZXRlY3RlZCB0YXNrcycpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHNvcnQpIHtcblx0XHRcdFx0Y29uc3Qgc29ydGVyID0gdGhpcy5jcmVhdGVTb3J0ZXIoKTtcblx0XHRcdFx0dGFza3MgPSB0YXNrcy5zb3J0KChhLCBiKSA9PiBzb3J0ZXIuY29tcGFyZShhLCBiKSk7XG5cdFx0XHR9XG5cdFx0XHRlbnRyaWVzID0gdGFza3MubWFwPElUYXNrUXVpY2tQaWNrRW50cnk+KHRhc2sgPT4gVGFza1F1aWNrUGlja0VudHJ5KHRhc2spKTtcblx0XHR9XG5cdFx0ZW5jb3VudGVyZWRUYXNrcyA9IHt9O1xuXHRcdHJldHVybiBlbnRyaWVzO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgX3Nob3dUd29MZXZlbFF1aWNrUGljayhwbGFjZUhvbGRlcjogc3RyaW5nLCBkZWZhdWx0RW50cnk/OiBJVGFza1F1aWNrUGlja0VudHJ5LCB0eXBlPzogc3RyaW5nLCBuYW1lPzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgdGFza1F1aWNrUGljayA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRhc2tRdWlja1BpY2spO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGFza1F1aWNrUGljay5zaG93KHBsYWNlSG9sZGVyLCBkZWZhdWx0RW50cnksIHR5cGUsIG5hbWUpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0YXNrUXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93UXVpY2tQaWNrKHRhc2tzOiBQcm9taXNlPFRhc2tbXT4gfCBUYXNrW10sIHBsYWNlSG9sZGVyOiBzdHJpbmcsIGRlZmF1bHRFbnRyeT86IElUYXNrUXVpY2tQaWNrRW50cnksIGdyb3VwOiBib29sZWFuID0gZmFsc2UsIHNvcnQ6IGJvb2xlYW4gPSBmYWxzZSwgc2VsZWN0ZWRFbnRyeT86IElUYXNrUXVpY2tQaWNrRW50cnksIGFkZGl0aW9uYWxFbnRyaWVzPzogSVRhc2tRdWlja1BpY2tFbnRyeVtdLCBuYW1lPzogc3RyaW5nKTogUHJvbWlzZTxJVGFza1F1aWNrUGlja0VudHJ5IHwgdW5kZWZpbmVkIHwgbnVsbD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkVGFza3MgPSBhd2FpdCB0YXNrcztcblx0XHRjb25zdCBlbnRyaWVzOiAoSVRhc2tRdWlja1BpY2tFbnRyeSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gfCB1bmRlZmluZWQgPSBhd2FpdCByYWNlVGltZW91dCh0aGlzLl9jcmVhdGVUYXNrUXVpY2tQaWNrRW50cmllcyhyZXNvbHZlZFRhc2tzLCBncm91cCwgc29ydCwgc2VsZWN0ZWRFbnRyeSksIDIwMCwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRpZiAoIWVudHJpZXMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMSAmJiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihRVUlDS09QRU5fU0tJUF9DT05GSUcpKSB7XG5cdFx0XHRyZXR1cm4gKDxJVGFza1F1aWNrUGlja0VudHJ5PmVudHJpZXNbMF0pO1xuXHRcdH0gZWxzZSBpZiAoKGVudHJpZXMubGVuZ3RoID09PSAwKSAmJiBkZWZhdWx0RW50cnkpIHtcblx0XHRcdGVudHJpZXMucHVzaChkZWZhdWx0RW50cnkpO1xuXHRcdH0gZWxzZSBpZiAoZW50cmllcy5sZW5ndGggPiAxICYmIGFkZGl0aW9uYWxFbnRyaWVzICYmIGFkZGl0aW9uYWxFbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGVudHJpZXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogJycgfSk7XG5cdFx0XHRlbnRyaWVzLnB1c2goYWRkaXRpb25hbEVudHJpZXNbMF0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9xdWlja0lucHV0U2VydmljZS5waWNrPElUYXNrUXVpY2tQaWNrRW50cnk+KFxuXHRcdFx0ZW50cmllcyxcblx0XHRcdHtcblx0XHRcdFx0dmFsdWU6IG5hbWUsXG5cdFx0XHRcdHBsYWNlSG9sZGVyLFxuXHRcdFx0XHRtYXRjaE9uRGVzY3JpcHRpb246IHRydWUsXG5cdFx0XHRcdG9uRGlkVHJpZ2dlckl0ZW1CdXR0b246IGNvbnRleHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2sgPSBjb250ZXh0Lml0ZW0udGFzaztcblx0XHRcdFx0XHR0aGlzLl9xdWlja0lucHV0U2VydmljZS5jYW5jZWwoKTtcblx0XHRcdFx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmN1c3RvbWl6ZSh0YXNrLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5vcGVuQ29uZmlnKHRhc2spO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfbmVlZHNSZWNlbnRUYXNrc01pZ3JhdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHRoaXMuZ2V0UmVjZW50bHlVc2VkVGFza3NWMSgpLnNpemUgPiAwKSAmJiAodGhpcy5fZ2V0VGFza3NGcm9tU3RvcmFnZSgnaGlzdG9yaWNhbCcpLnNpemUgPT09IDApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbWlncmF0ZVJlY2VudFRhc2tzKHRhc2tzOiBUYXNrW10pIHtcblx0XHRpZiAoIXRoaXMuX25lZWRzUmVjZW50VGFza3NNaWdyYXRpb24oKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWNlbnRseVVzZWRUYXNrcyA9IHRoaXMuZ2V0UmVjZW50bHlVc2VkVGFza3NWMSgpO1xuXHRcdGNvbnN0IHRhc2tNYXA6IElTdHJpbmdEaWN0aW9uYXJ5PFRhc2s+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0YXNrcy5mb3JFYWNoKHRhc2sgPT4ge1xuXHRcdFx0Y29uc3Qga2V5ID0gdGFzay5nZXRLZXkoKTtcblx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0dGFza01hcFtrZXldID0gdGFzaztcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCByZXZlcnNlZCA9IFsuLi5yZWNlbnRseVVzZWRUYXNrcy5rZXlzKCldLnJldmVyc2UoKTtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiByZXZlcnNlZCkge1xuXHRcdFx0Y29uc3QgdGFzayA9IHRhc2tNYXBba2V5XTtcblx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3NldFJlY2VudGx5VXNlZFRhc2sodGFzayk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShBYnN0cmFjdFRhc2tTZXJ2aWNlLlJlY2VudGx5VXNlZFRhc2tzX0tleSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93SWdub3JlZEZvbGRlcnNNZXNzYWdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlnbm9yZWRXb3Jrc3BhY2VGb2xkZXJzLmxlbmd0aCA9PT0gMCB8fCAhdGhpcy5zaG93SWdub3JlTWVzc2FnZSkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuaWdub3JlZEZvbGRlcicsICdUaGUgZm9sbG93aW5nIHdvcmtzcGFjZSBmb2xkZXJzIGFyZSBpZ25vcmVkIHNpbmNlIHRoZXkgdXNlIHRhc2sgdmVyc2lvbiAwLjEuMDogezB9JywgdGhpcy5pZ25vcmVkV29ya3NwYWNlRm9sZGVycy5tYXAoZiA9PiBmLm5hbWUpLmpvaW4oJywgJykpLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm90QWdhaW4nLCBcIkRvbid0IFNob3cgQWdhaW5cIiksXG5cdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShBYnN0cmFjdFRhc2tTZXJ2aWNlLklnbm9yZVRhc2swMTBEb25vdFNob3dBZ2Fpbl9rZXksIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd0lnbm9yZU1lc3NhZ2UgPSBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0fV1cblx0XHQpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdHJ1c3QoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHQoZ2V0QWN0aXZlRWxlbWVudCgpKTtcblx0XHRpZiAoU2VydmVybGVzc1dlYkNvbnRleHQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpICYmICFUYXNrRXhlY3V0aW9uU3VwcG9ydGVkQ29udGV4dD8uZXZhbHVhdGUoY29udGV4dCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VUcnVzdEluaXRpYWxpemVkO1xuXHRcdGlmICghdGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucmVxdWVzdFRydXN0JywgXCJMaXN0aW5nIGFuZCBydW5uaW5nIHRhc2tzIHJlcXVpcmVzIHRoYXQgc29tZSBvZiB0aGUgZmlsZXMgaW4gdGhpcyB3b3Jrc3BhY2UgYmUgZXhlY3V0ZWQgYXMgY29kZS5cIilcblx0XHRcdFx0fSkpID09PSB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3J1blRhc2tDb21tYW5kKGZpbHRlcj86IHN0cmluZyB8IElUYXNrSWRlbnRpZmllcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fdGFza3NSZWNvbm5lY3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWZpbHRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvUnVuVGFza0NvbW1hbmQoKTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZSA9IHR5cGVvZiBmaWx0ZXIgPT09ICdzdHJpbmcnID8gdW5kZWZpbmVkIDogZmlsdGVyLnR5cGU7XG5cdFx0Y29uc3QgdGFza05hbWUgPSB0eXBlb2YgZmlsdGVyID09PSAnc3RyaW5nJyA/IGZpbHRlciA6IGZpbHRlci50YXNrIGFzIHN0cmluZztcblx0XHRjb25zdCBncm91cGVkID0gYXdhaXQgdGhpcy5fZ2V0R3JvdXBlZFRhc2tzKHsgdHlwZSB9KTtcblx0XHRjb25zdCBpZGVudGlmaWVyID0gdGhpcy5fZ2V0VGFza0lkZW50aWZpZXIoZmlsdGVyKTtcblx0XHRjb25zdCB0YXNrcyA9IGdyb3VwZWQuYWxsKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSB0aGlzLl9jcmVhdGVSZXNvbHZlcihncm91cGVkKTtcblx0XHRjb25zdCBmb2xkZXJVUklzOiAoVVJJIHwgc3RyaW5nKVtdID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpO1xuXHRcdGlmICh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UpIHtcblx0XHRcdGZvbGRlclVSSXMucHVzaCh0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uISk7XG5cdFx0fVxuXHRcdGZvbGRlclVSSXMucHVzaChVU0VSX1RBU0tTX0dST1VQX0tFWSk7XG5cdFx0aWYgKGlkZW50aWZpZXIpIHtcblx0XHRcdGZvciAoY29uc3QgdXJpIG9mIGZvbGRlclVSSXMpIHtcblx0XHRcdFx0Y29uc3QgdGFzayA9IGF3YWl0IHJlc29sdmVyLnJlc29sdmUodXJpLCBpZGVudGlmaWVyKTtcblx0XHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0XHR0aGlzLnJ1bih0YXNrKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZXhhY3RNYXRjaFRhc2sgPSAhdGFza05hbWUgPyB1bmRlZmluZWQgOiB0YXNrcy5maW5kKHQgPT4gdC5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pZGVudGlmaWVyID09PSB0YXNrTmFtZSk7XG5cdFx0aWYgKCFleGFjdE1hdGNoVGFzaykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvUnVuVGFza0NvbW1hbmQodGFza3MsIHR5cGUsIHRhc2tOYW1lKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgZm9sZGVyVVJJcykge1xuXHRcdFx0Y29uc3QgdGFzayA9IGF3YWl0IHJlc29sdmVyLnJlc29sdmUodXJpLCB0YXNrTmFtZSk7XG5cdFx0XHRpZiAodGFzaykge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnJ1bih0YXNrLCB7IGF0dGFjaFByb2JsZW1NYXRjaGVyOiB0cnVlIH0sIFRhc2tSdW5Tb3VyY2UuVXNlcik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90YXNrc0FuZEdyb3VwZWRUYXNrcyhmaWx0ZXI/OiBJVGFza0ZpbHRlcik6IHsgdGFza3M6IFByb21pc2U8VGFza1tdPjsgZ3JvdXBlZDogUHJvbWlzZTxUYXNrTWFwPiB9IHtcblx0XHRpZiAoIXRoaXMuX3ZlcnNpb25BbmRFbmdpbmVDb21wYXRpYmxlKGZpbHRlcikpIHtcblx0XHRcdHJldHVybiB7IHRhc2tzOiBQcm9taXNlLnJlc29sdmU8VGFza1tdPihbXSksIGdyb3VwZWQ6IFByb21pc2UucmVzb2x2ZShuZXcgVGFza01hcCgpKSB9O1xuXHRcdH1cblx0XHRjb25zdCBncm91cGVkID0gdGhpcy5fZ2V0R3JvdXBlZFRhc2tzKGZpbHRlcik7XG5cdFx0Y29uc3QgdGFza3MgPSBncm91cGVkLnRoZW4oKG1hcCkgPT4ge1xuXHRcdFx0aWYgKCFmaWx0ZXIgfHwgIWZpbHRlci50eXBlKSB7XG5cdFx0XHRcdHJldHVybiBtYXAuYWxsKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQ6IFRhc2tbXSA9IFtdO1xuXHRcdFx0bWFwLmZvckVhY2goKHRhc2tzKSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdGlmIChDb250cmlidXRlZFRhc2suaXModGFzaykgJiYgdGFzay5kZWZpbmVzLnR5cGUgPT09IGZpbHRlci50eXBlKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh0YXNrKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdGlmICh0YXNrLnR5cGUgPT09IGZpbHRlci50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdC5wdXNoKHRhc2spO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY3VzdG9taXplcyA9IHRhc2suY3VzdG9taXplcygpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY3VzdG9taXplcyAmJiBjdXN0b21pemVzLnR5cGUgPT09IGZpbHRlci50eXBlKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0LnB1c2godGFzayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0XHRyZXR1cm4geyB0YXNrcywgZ3JvdXBlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9SdW5UYXNrQ29tbWFuZCh0YXNrcz86IFRhc2tbXSwgdHlwZT86IHN0cmluZywgbmFtZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHBpY2tUaGVuID0gKHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsKSA9PiB7XG5cdFx0XHRpZiAodGFzayA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0YXNrID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMuX3J1bkNvbmZpZ3VyZVRhc2tzKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnJ1bih0YXNrLCB7IGF0dGFjaFByb2JsZW1NYXRjaGVyOiB0cnVlIH0sIFRhc2tSdW5Tb3VyY2UuVXNlcikudGhlbih1bmRlZmluZWQsIHJlYXNvbiA9PiB7XG5cdFx0XHRcdFx0Ly8gZWF0IHRoZSBlcnJvciwgaXQgaGFzIGFscmVhZHkgYmVlbiBzdXJmYWNlZCB0byB0aGUgdXNlciBhbmQgd2UgZG9uJ3QgY2FyZSBhYm91dCBpdCBoZXJlXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBwbGFjZWhvbGRlciA9IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja1J1blRhc2snLCAnU2VsZWN0IHRoZSB0YXNrIHRvIHJ1bicpO1xuXG5cdFx0dGhpcy5fc2hvd0lnbm9yZWRGb2xkZXJzTWVzc2FnZSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFVTRV9TTE9XX1BJQ0tFUikpIHtcblx0XHRcdFx0bGV0IHRhc2tSZXN1bHQ6IHsgdGFza3M6IFByb21pc2U8VGFza1tdPjsgZ3JvdXBlZDogUHJvbWlzZTxUYXNrTWFwPiB9IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIXRhc2tzKSB7XG5cdFx0XHRcdFx0dGFza1Jlc3VsdCA9IHRoaXMuX3Rhc2tzQW5kR3JvdXBlZFRhc2tzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2hvd1F1aWNrUGljayh0YXNrcyA/IHRhc2tzIDogdGFza1Jlc3VsdCEudGFza3MsIHBsYWNlaG9sZGVyLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnJChwbHVzKSAnICsgbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub0VudHJ5VG9SdW4nLCAnQ29uZmlndXJlIGEgVGFzaycpLFxuXHRcdFx0XHRcdFx0dGFzazogbnVsbFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0dHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmFtZSkuXG5cdFx0XHRcdFx0dGhlbigoZW50cnkpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBwaWNrVGhlbihlbnRyeSA/IGVudHJ5LnRhc2sgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fc2hvd1R3b0xldmVsUXVpY2tQaWNrKHBsYWNlaG9sZGVyLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnJChwbHVzKSAnICsgbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub0VudHJ5VG9SdW4nLCAnQ29uZmlndXJlIGEgVGFzaycpLFxuXHRcdFx0XHRcdFx0dGFzazogbnVsbFxuXHRcdFx0XHRcdH0sIHR5cGUsIG5hbWUpLlxuXHRcdFx0XHRcdHRoZW4ocGlja1RoZW4pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblxuXHRhc3luYyByZXJ1bih0ZXJtaW5hbEluc3RhbmNlSWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHRhc2sgPSBhd2FpdCB0aGlzLl90YXNrU3lzdGVtPy5nZXRUYXNrRm9yVGVybWluYWwodGVybWluYWxJbnN0YW5jZUlkKTtcblx0XHRpZiAodGFzaykge1xuXHRcdFx0dGhpcy5fcmVzdGFydCh0YXNrKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVSdW5UYXNrQ29tbWFuZCh0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZVJ1blRhc2tDb21tYW5kKG9ubHlSZXJ1bj86IGJvb2xlYW4pOiB2b2lkIHtcblxuXHRcdFByb2JsZW1NYXRjaGVyUmVnaXN0cnkub25SZWFkeSgpLnRoZW4oKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2VkaXRvclNlcnZpY2Uuc2F2ZUFsbCh7IHJlYXNvbjogU2F2ZVJlYXNvbi5FWFBMSUNJVCB9KS50aGVuKCgpID0+IHsgLy8gbWFrZSBzdXJlIGFsbCBkaXJ0eSBlZGl0b3JzIGFyZSBzYXZlZFxuXHRcdFx0XHRjb25zdCBleGVjdXRlUmVzdWx0ID0gdGhpcy5fZ2V0VGFza1N5c3RlbSgpLnJlcnVuKCk7XG5cdFx0XHRcdGlmIChleGVjdXRlUmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2hhbmRsZUV4ZWN1dGVSZXN1bHQoZXhlY3V0ZVJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCFvbmx5UmVydW4gJiYgIXRoaXMuX3Rhc2tSdW5uaW5nU3RhdGUuZ2V0KCkpIHtcblx0XHRcdFx0XHRcdC8vIE5vIHRhc2sgcnVubmluZywgcHJvbXB0IHRvIGFzayB3aGljaCB0byBydW5cblx0XHRcdFx0XHRcdHRoaXMuX2RvUnVuVGFza0NvbW1hbmQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKlxuXHQgKiBAcGFyYW0gdGFza3MgLSBUaGUgdGFza3Mgd2hpY2ggbmVlZCB0byBiZSBmaWx0ZXJlZFxuXHQgKiBAcGFyYW0gdGFza3NJbkxpc3QgLSBUaGlzIHRlbGxzIHNwbGl0UGVyR3JvdXBUeXBlIHRvIGZpbHRlciBvdXQgZ2xvYmJlZCB0YXNrcyAoaW50byBkZWZhdWx0cylcblx0ICogQHJldHVybnNcblx0ICovXG5cdHByaXZhdGUgX2dldERlZmF1bHRUYXNrcyh0YXNrczogVGFza1tdLCB0YXNrR2xvYnNJbkxpc3Q6IGJvb2xlYW4gPSBmYWxzZSk6IFRhc2tbXSB7XG5cdFx0Y29uc3QgZGVmYXVsdHM6IFRhc2tbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcy5maWx0ZXIodCA9PiAhIXQuY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXApKSB7XG5cdFx0XHQvLyBBdCB0aGlzIHBvaW50IChhc3N1bWluZyB0YXNrR2xvYnNJbkxpc3QgaXMgdHJ1ZSkgdGhlcmUgYXJlIHRhc2tzIHdpdGggbWF0Y2hpbmcgZ2xvYnMsIHNvIG9ubHkgcHV0IHRob3NlIGluIGRlZmF1bHRzXG5cdFx0XHRpZiAodGFza0dsb2JzSW5MaXN0ICYmIHR5cGVvZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCBhcyBUYXNrR3JvdXApLmlzRGVmYXVsdCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0ZGVmYXVsdHMucHVzaCh0YXNrKTtcblx0XHRcdH0gZWxzZSBpZiAoIXRhc2tHbG9ic0luTGlzdCAmJiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCBhcyBUYXNrR3JvdXApLmlzRGVmYXVsdCA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRkZWZhdWx0cy5wdXNoKHRhc2spO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZGVmYXVsdHM7XG5cdH1cblxuXHRwcml2YXRlIF9ydW5UYXNrR3JvdXBDb21tYW5kKHRhc2tHcm91cDogVGFza0dyb3VwLCBzdHJpbmdzOiB7XG5cdFx0ZmV0Y2hpbmc6IHN0cmluZztcblx0XHRzZWxlY3Q6IHN0cmluZztcblx0XHRub3RGb3VuZENvbmZpZ3VyZTogc3RyaW5nO1xuXHR9LCBjb25maWd1cmU6ICgpID0+IHZvaWQsIGxlZ2FjeUNvbW1hbmQ6ICgpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMF8xXzApIHtcblx0XHRcdGxlZ2FjeUNvbW1hbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgb3B0aW9uczogSVByb2dyZXNzT3B0aW9ucyA9IHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdHRpdGxlOiBzdHJpbmdzLmZldGNoaW5nXG5cdFx0fTtcblx0XHRjb25zdCBwcm9taXNlID0gKGFzeW5jICgpID0+IHtcblxuXHRcdFx0YXN5bmMgZnVuY3Rpb24gcnVuU2luZ2xlVGFzayh0YXNrOiBUYXNrIHwgdW5kZWZpbmVkLCBwcm9ibGVtTWF0Y2hlck9wdGlvbnM6IElQcm9ibGVtTWF0Y2hlclJ1bk9wdGlvbnMgfCB1bmRlZmluZWQsIHRoYXQ6IEFic3RyYWN0VGFza1NlcnZpY2UpIHtcblx0XHRcdFx0dGhhdC5ydW4odGFzaywgcHJvYmxlbU1hdGNoZXJPcHRpb25zLCBUYXNrUnVuU291cmNlLlVzZXIpLnRoZW4odW5kZWZpbmVkLCByZWFzb24gPT4ge1xuXHRcdFx0XHRcdC8vIGVhdCB0aGUgZXJyb3IsIGl0IGhhcyBhbHJlYWR5IGJlZW4gc3VyZmFjZWQgdG8gdGhlIHVzZXIgYW5kIHdlIGRvbid0IGNhcmUgYWJvdXQgaXQgaGVyZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNob29zZUFuZFJ1blRhc2sgPSAodGFza3M6IFRhc2tbXSkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zaG93SWdub3JlZEZvbGRlcnNNZXNzYWdlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd1F1aWNrUGljayh0YXNrcyxcblx0XHRcdFx0XHRcdHN0cmluZ3Muc2VsZWN0LFxuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogc3RyaW5ncy5ub3RGb3VuZENvbmZpZ3VyZSxcblx0XHRcdFx0XHRcdFx0dGFzazogbnVsbFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRydWUpLnRoZW4oKGVudHJ5KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsID0gZW50cnkgPyBlbnRyeS50YXNrIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRpZiAodGFzayA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICh0YXNrID09PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uZmlndXJlLmFwcGx5KHRoaXMpO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRydW5TaW5nbGVUYXNrKHRhc2ssIHsgYXR0YWNoUHJvYmxlbU1hdGNoZXI6IHRydWUgfSwgdGhpcyk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXHRcdFx0bGV0IGdyb3VwVGFza3M6IChUYXNrIHwgQ29uZmlndXJpbmdUYXNrKVtdID0gW107XG5cdFx0XHRjb25zdCB7IGdsb2JHcm91cFRhc2tzLCBnbG9iVGFza3NEZXRlY3RlZCB9ID0gYXdhaXQgdGhpcy5fZ2V0R2xvYlRhc2tzKHRhc2tHcm91cC5faWQpO1xuXHRcdFx0Z3JvdXBUYXNrcyA9IFsuLi5nbG9iR3JvdXBUYXNrc107XG5cdFx0XHRpZiAoIWdsb2JUYXNrc0RldGVjdGVkICYmIGdyb3VwVGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdGdyb3VwVGFza3MgPSBhd2FpdCB0aGlzLl9maW5kV29ya3NwYWNlVGFza3NJbkdyb3VwKHRhc2tHcm91cCwgdHJ1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGhhbmRsZU11bHRpcGxlVGFza3MgPSAoYXJlR2xvYlRhc2tzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9nZXRUYXNrc0Zvckdyb3VwKHRhc2tHcm91cCkudGhlbigodGFza3MpID0+IHtcblx0XHRcdFx0XHRpZiAodGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Ly8gSWYgd2UncmUgZGVhbGluZyB3aXRoIHRhc2tzIHRoYXQgd2VyZSBjaG9zZW4gYmVjYXVzZSBvZiBhIGdsb2IgbWF0Y2gsXG5cdFx0XHRcdFx0XHQvLyB0aGVuIHB1dCBnbG9icyBpbiB0aGUgZGVmYXVsdHMgYW5kIGV2ZXJ5dGhpbmcgZWxzZSBpbiBub25lXG5cdFx0XHRcdFx0XHRjb25zdCBkZWZhdWx0cyA9IHRoaXMuX2dldERlZmF1bHRUYXNrcyh0YXNrcywgYXJlR2xvYlRhc2tzKTtcblx0XHRcdFx0XHRcdGlmIChkZWZhdWx0cy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdFx0cnVuU2luZ2xlVGFzayhkZWZhdWx0c1swXSwgdW5kZWZpbmVkLCB0aGlzKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChkZWZhdWx0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRcdHRhc2tzID0gZGVmYXVsdHM7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQXQgdGhpcyB0aGlzIHBvaW50IHRoZXJlIGFyZSBtdWx0aXBsZSB0YXNrcy5cblx0XHRcdFx0XHRjaG9vc2VBbmRSdW5UYXNrKHRhc2tzKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXNvbHZlVGFza0FuZFJ1biA9ICh0YXNrR3JvdXBUYXNrOiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrKSA9PiB7XG5cdFx0XHRcdGlmIChDb25maWd1cmluZ1Rhc2suaXModGFza0dyb3VwVGFzaykpIHtcblx0XHRcdFx0XHR0aGlzLnRyeVJlc29sdmVUYXNrKHRhc2tHcm91cFRhc2spLnRoZW4ocmVzb2x2ZWRUYXNrID0+IHtcblx0XHRcdFx0XHRcdHJ1blNpbmdsZVRhc2socmVzb2x2ZWRUYXNrLCB1bmRlZmluZWQsIHRoaXMpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJ1blNpbmdsZVRhc2sodGFza0dyb3VwVGFzaywgdW5kZWZpbmVkLCB0aGlzKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQSBzaW5nbGUgZGVmYXVsdCBnbG9iIHRhc2sgd2FzIHJldHVybmVkLCBqdXN0IHJ1biBpdCBkaXJlY3RseVxuXHRcdFx0aWYgKGdyb3VwVGFza3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdHJldHVybiByZXNvbHZlVGFza0FuZFJ1bihncm91cFRhc2tzWzBdKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgdGhlcmUncyBtdWx0aXBsZSBnbG9icyB0aGF0IG1hdGNoIHdlIHdhbnQgdG8gc2hvdyB0aGUgcXVpY2sgcGlja2VyIGZvciB0aG9zZSB0YXNrc1xuXHRcdFx0Ly8gV2Ugd2lsbCBuZWVkIHRvIGNhbGwgc3BsaXRQZXJHcm91cFR5cGUgcHV0dGluZyBnbG9icyBpbiBkZWZhdWx0cyBhbmQgdGhlIHJlbWFpbmluZyB0YXNrcyBpbiBub25lLlxuXHRcdFx0Ly8gV2UgZG9uJ3QgbmVlZCB0byBjYXJyeSBvbiBhZnRlciBoZXJlXG5cdFx0XHRpZiAoZ2xvYlRhc2tzRGV0ZWN0ZWQgJiYgZ3JvdXBUYXNrcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdHJldHVybiBoYW5kbGVNdWx0aXBsZVRhc2tzKHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiBubyBnbG9icyBhcmUgZm91bmQgb3IgbWF0Y2hlZCBmYWxsYmFjayB0byBjaGVja2luZyBmb3IgZGVmYXVsdCB0YXNrcyBvZiB0aGUgdGFzayBncm91cFxuXHRcdFx0aWYgKCFncm91cFRhc2tzLmxlbmd0aCkge1xuXHRcdFx0XHRncm91cFRhc2tzID0gYXdhaXQgdGhpcy5fZmluZFdvcmtzcGFjZVRhc2tzSW5Hcm91cCh0YXNrR3JvdXAsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZ3JvdXBUYXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gQSBzaW5nbGUgZGVmYXVsdCB0YXNrIHdhcyByZXR1cm5lZCwganVzdCBydW4gaXQgZGlyZWN0bHlcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVUYXNrQW5kUnVuKGdyb3VwVGFza3NbMF0pO1xuXHRcdFx0fVxuXHRcdFx0Ly8gTXVsdGlwbGUgZGVmYXVsdCB0YXNrcyByZXR1cm5lZCwgc2hvdyB0aGUgcXVpY2tQaWNrZXJcblx0XHRcdHJldHVybiBoYW5kbGVNdWx0aXBsZVRhc2tzKGZhbHNlKTtcblx0XHR9KSgpO1xuXHRcdHRoaXMuX3Byb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Mob3B0aW9ucywgKCkgPT4gcHJvbWlzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRHbG9iVGFza3ModGFza0dyb3VwSWQ6IHN0cmluZyk6IFByb21pc2U8eyBnbG9iR3JvdXBUYXNrczogKFRhc2sgfCBDb25maWd1cmluZ1Rhc2spW107IGdsb2JUYXNrc0RldGVjdGVkOiBib29sZWFuIH0+IHtcblx0XHRsZXQgZ2xvYlRhc2tzRGV0ZWN0ZWQgPSBmYWxzZTtcblx0XHQvLyBGaXJzdCBjaGVjayBmb3IgZ2xvYnMgYmVmb3JlIGNoZWNraW5nIGZvciB0aGUgZGVmYXVsdCB0YXNrcyBvZiB0aGUgdGFzayBncm91cFxuXHRcdGNvbnN0IGFic29sdXRlVVJJID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaSh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcik7XG5cdFx0aWYgKGFic29sdXRlVVJJKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLl9jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoYWJzb2x1dGVVUkkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRjb25zdCBjb25maWd1cmVkVGFza3MgPSB0aGlzLl9nZXRDb25maWd1cmF0aW9uKHdvcmtzcGFjZUZvbGRlcik/LmNvbmZpZz8udGFza3M7XG5cdFx0XHRcdGlmIChjb25maWd1cmVkVGFza3MpIHtcblx0XHRcdFx0XHRnbG9iVGFza3NEZXRlY3RlZCA9IGNvbmZpZ3VyZWRUYXNrcy5maWx0ZXIodGFzayA9PiB0YXNrLmdyb3VwICYmIHR5cGVvZiB0YXNrLmdyb3VwICE9PSAnc3RyaW5nJyAmJiB0eXBlb2YgdGFzay5ncm91cC5pc0RlZmF1bHQgPT09ICdzdHJpbmcnKS5sZW5ndGggPiAwO1xuXHRcdFx0XHRcdC8vIFRoaXMgd2lsbCBhY3RpdmF0ZSBleHRlbnNpb25zLCBzbyBvbmx5IGRvIHNvIGlmIG5lY2Vzc2FyeSAjMTg1OTYwXG5cdFx0XHRcdFx0aWYgKGdsb2JUYXNrc0RldGVjdGVkKSB7XG5cdFx0XHRcdFx0XHQvLyBGYWxsYmFjayB0byBhYnNvbHV0ZSBwYXRoIG9mIHRoZSBmaWxlIGlmIGl0IGlzIG5vdCBpbiBhIHdvcmtzcGFjZSBvciByZWxhdGl2ZSBwYXRoIGNhbm5vdCBiZSBmb3VuZFxuXHRcdFx0XHRcdFx0Y29uc3QgcmVsYXRpdmVQYXRoID0gd29ya3NwYWNlRm9sZGVyPy51cmkgPyAocmVzb3VyY2VzLnJlbGF0aXZlUGF0aCh3b3Jrc3BhY2VGb2xkZXIudXJpLCBhYnNvbHV0ZVVSSSkgPz8gYWJzb2x1dGVVUkkucGF0aCkgOiBhYnNvbHV0ZVVSSS5wYXRoO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBnbG9iR3JvdXBUYXNrcyA9IGF3YWl0IHRoaXMuX2ZpbmRXb3Jrc3BhY2VUYXNrcygodGFzaykgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50VGFza0dyb3VwID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cDtcblx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRUYXNrR3JvdXAgJiYgdHlwZW9mIGN1cnJlbnRUYXNrR3JvdXAgIT09ICdzdHJpbmcnICYmIHR5cGVvZiBjdXJyZW50VGFza0dyb3VwLmlzRGVmYXVsdCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gKGN1cnJlbnRUYXNrR3JvdXAuX2lkID09PSB0YXNrR3JvdXBJZCAmJiBnbG9iLm1hdGNoKGN1cnJlbnRUYXNrR3JvdXAuaXNEZWZhdWx0LCByZWxhdGl2ZVBhdGgsIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSk7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRnbG9iVGFza3NEZXRlY3RlZCA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdHJldHVybiB7IGdsb2JHcm91cFRhc2tzLCBnbG9iVGFza3NEZXRlY3RlZCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBnbG9iR3JvdXBUYXNrczogW10sIGdsb2JUYXNrc0RldGVjdGVkIH07XG5cblx0fVxuXG5cdHByaXZhdGUgX3J1bkJ1aWxkQ29tbWFuZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3Rhc2tzUmVjb25uZWN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3J1blRhc2tHcm91cENvbW1hbmQoVGFza0dyb3VwLkJ1aWxkLCB7XG5cdFx0XHRmZXRjaGluZzogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5mZXRjaGluZ0J1aWxkVGFza3MnLCAnRmV0Y2hpbmcgYnVpbGQgdGFza3MuLi4nKSxcblx0XHRcdHNlbGVjdDogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5waWNrQnVpbGRUYXNrJywgJ1NlbGVjdCB0aGUgYnVpbGQgdGFzayB0byBydW4nKSxcblx0XHRcdG5vdEZvdW5kQ29uZmlndXJlOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vQnVpbGRUYXNrJywgJ05vIGJ1aWxkIHRhc2sgdG8gcnVuIGZvdW5kLiBDb25maWd1cmUgQnVpbGQgVGFzay4uLicpXG5cdFx0fSwgdGhpcy5fcnVuQ29uZmlndXJlRGVmYXVsdEJ1aWxkVGFzaywgdGhpcy5fYnVpbGQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcnVuVGVzdENvbW1hbmQoKTogdm9pZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3J1blRhc2tHcm91cENvbW1hbmQoVGFza0dyb3VwLlRlc3QsIHtcblx0XHRcdGZldGNoaW5nOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmZldGNoaW5nVGVzdFRhc2tzJywgJ0ZldGNoaW5nIHRlc3QgdGFza3MuLi4nKSxcblx0XHRcdHNlbGVjdDogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5waWNrVGVzdFRhc2snLCAnU2VsZWN0IHRoZSB0ZXN0IHRhc2sgdG8gcnVuJyksXG5cdFx0XHRub3RGb3VuZENvbmZpZ3VyZTogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub1Rlc3RUYXNrVGVybWluYWwnLCAnTm8gdGVzdCB0YXNrIHRvIHJ1biBmb3VuZC4gQ29uZmlndXJlIFRhc2tzLi4uJylcblx0XHR9LCB0aGlzLl9ydW5Db25maWd1cmVEZWZhdWx0VGVzdFRhc2ssIHRoaXMuX3J1blRlc3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcnVuVGVybWluYXRlQ29tbWFuZChhcmc/OiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIpOiB2b2lkIHtcblx0XHRpZiAoYXJnID09PSAndGVybWluYXRlQWxsJykge1xuXHRcdFx0dGhpcy5fdGVybWluYXRlQWxsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJ1blF1aWNrUGljayA9IChwcm9taXNlPzogUHJvbWlzZTxUYXNrW10+KSA9PiB7XG5cdFx0XHR0aGlzLl9zaG93UXVpY2tQaWNrKHByb21pc2UgfHwgdGhpcy5nZXRBY3RpdmVUYXNrcygpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnRhc2tUb1Rlcm1pbmF0ZScsICdTZWxlY3QgYSB0YXNrIHRvIHRlcm1pbmF0ZScpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9UYXNrUnVubmluZycsICdObyB0YXNrIGlzIGN1cnJlbnRseSBydW5uaW5nJyksXG5cdFx0XHRcdFx0dGFzazogdW5kZWZpbmVkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZhbHNlLCB0cnVlLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UudGVybWluYXRlQWxsUnVubmluZ1Rhc2tzJywgJ0FsbCBSdW5uaW5nIFRhc2tzJyksXG5cdFx0XHRcdFx0aWQ6ICd0ZXJtaW5hdGVBbGwnLFxuXHRcdFx0XHRcdHRhc2s6IHVuZGVmaW5lZFxuXHRcdFx0XHR9XVxuXHRcdFx0KS50aGVuKGVudHJ5ID0+IHtcblx0XHRcdFx0aWYgKGVudHJ5ICYmIGVudHJ5LmlkID09PSAndGVybWluYXRlQWxsJykge1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmF0ZUFsbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsID0gZW50cnkgPyBlbnRyeS50YXNrIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGFzayA9PT0gdW5kZWZpbmVkIHx8IHRhc2sgPT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy50ZXJtaW5hdGUodGFzayk7XG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdGlmICh0aGlzLmluVGVybWluYWwoKSkge1xuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRoaXMuX2dldFRhc2tJZGVudGlmaWVyKGFyZyk7XG5cdFx0XHRsZXQgcHJvbWlzZTogUHJvbWlzZTxUYXNrW10+O1xuXHRcdFx0aWYgKGlkZW50aWZpZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRwcm9taXNlID0gdGhpcy5nZXRBY3RpdmVUYXNrcygpO1xuXHRcdFx0XHRwcm9taXNlLnRoZW4oKHRhc2tzKSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdFx0XHRpZiAodGFzay5tYXRjaGVzKGlkZW50aWZpZXIpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMudGVybWluYXRlKHRhc2spO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJ1blF1aWNrUGljayhwcm9taXNlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRydW5RdWlja1BpY2soKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faXNBY3RpdmUoKS50aGVuKChhY3RpdmUpID0+IHtcblx0XHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRcdHRoaXMuX3Rlcm1pbmF0ZUFsbCgpLnRoZW4oKHJlc3BvbnNlcykgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gdGhlIG91dHB1dCBydW5uZXIgaGFzIG9ubHkgb25lIHRhc2tcblx0XHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gcmVzcG9uc2VzWzBdO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3BvbnNlLnN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKHJlc3BvbnNlLmNvZGUgJiYgcmVzcG9uc2UuY29kZSA9PT0gVGVybWluYXRlUmVzcG9uc2VDb2RlLlByb2Nlc3NOb3RGb3VuZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKG5scy5sb2NhbGl6ZSgnVGVybWluYXRlQWN0aW9uLm5vUHJvY2VzcycsICdUaGUgbGF1bmNoZWQgcHJvY2VzcyBkb2VzblxcJ3QgZXhpc3QgYW55bW9yZS4gSWYgdGhlIHRhc2sgc3Bhd25lZCBiYWNrZ3JvdW5kIHRhc2tzIGV4aXRpbmcgVlMgQ29kZSBtaWdodCByZXN1bHQgaW4gb3JwaGFuZWQgcHJvY2Vzc2VzLicpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdUZXJtaW5hdGVBY3Rpb24uZmFpbGVkJywgJ0ZhaWxlZCB0byB0ZXJtaW5hdGUgcnVubmluZyB0YXNrJykpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5SZXN0YXJ0VGFza0NvbW1hbmQoYXJnPzogc3RyaW5nIHwgSVRhc2tJZGVudGlmaWVyKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRjb25zdCBhY3RpdmVUYXNrcyA9IGF3YWl0IHRoaXMuZ2V0QWN0aXZlVGFza3MoKTtcblxuXHRcdGlmIChhY3RpdmVUYXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMuX3Jlc3RhcnQoYWN0aXZlVGFza3NbMF0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmluVGVybWluYWwoKSkge1xuXHRcdFx0Ly8gdHJ5IGRpc3BhdGNoaW5nIHVzaW5nIHRhc2sgaWRlbnRpZmllclxuXHRcdFx0Y29uc3QgaWRlbnRpZmllciA9IHRoaXMuX2dldFRhc2tJZGVudGlmaWVyKGFyZyk7XG5cdFx0XHRpZiAoaWRlbnRpZmllciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiBhY3RpdmVUYXNrcykge1xuXHRcdFx0XHRcdGlmICh0YXNrLm1hdGNoZXMoaWRlbnRpZmllcikpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3Jlc3RhcnQodGFzayk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBzaG93IHF1aWNrIHBpY2sgd2l0aCBhY3RpdmUgdGFza3Ncblx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgdGhpcy5fc2hvd1F1aWNrUGljayhcblx0XHRcdFx0YWN0aXZlVGFza3MsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UudGFza1RvUmVzdGFydCcsICdTZWxlY3QgdGhlIHRhc2sgdG8gcmVzdGFydCcpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2Uubm9UYXNrVG9SZXN0YXJ0JywgJ05vIHRhc2sgdG8gcmVzdGFydCcpLFxuXHRcdFx0XHRcdHRhc2s6IG51bGxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdHRydWVcblx0XHRcdCk7XG5cdFx0XHRpZiAoZW50cnkgJiYgZW50cnkudGFzaykge1xuXHRcdFx0XHR0aGlzLl9yZXN0YXJ0KGVudHJ5LnRhc2spO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRpZiAoYWN0aXZlVGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9yZXN0YXJ0KGFjdGl2ZVRhc2tzWzBdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5SZXJ1bkFsbFJ1bm5pbmdUYXNrc0NvbW1hbmQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWN0aXZlVGFza3MgPSBhd2FpdCB0aGlzLmdldEFjdGl2ZVRhc2tzKCk7XG5cblx0XHRpZiAoYWN0aXZlVGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5ub1J1bm5pbmdUYXNrcycsICdObyBydW5uaW5nIHRhc2tzIHRvIHJlc3RhcnQnKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdGFydCBhbGwgYWN0aXZlIHRhc2tzXG5cdFx0Y29uc3QgcmVzdGFydFByb21pc2VzID0gYWN0aXZlVGFza3MubWFwKHRhc2sgPT4gdGhpcy5fcmVzdGFydCh0YXNrKSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHJlc3RhcnRQcm9taXNlcyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUYXNrSWRlbnRpZmllcihmaWx0ZXI/OiBzdHJpbmcgfCBJVGFza0lkZW50aWZpZXIpOiBzdHJpbmcgfCBLZXllZFRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcmVzdWx0OiBzdHJpbmcgfCBLZXllZFRhc2tJZGVudGlmaWVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmIChUeXBlcy5pc1N0cmluZyhmaWx0ZXIpKSB7XG5cdFx0XHRyZXN1bHQgPSBmaWx0ZXI7XG5cdFx0fSBlbHNlIGlmIChmaWx0ZXIgJiYgVHlwZXMuaXNTdHJpbmcoZmlsdGVyLnR5cGUpKSB7XG5cdFx0XHRyZXN1bHQgPSBUYXNrRGVmaW5pdGlvbi5jcmVhdGVUYXNrSWRlbnRpZmllcihmaWx0ZXIsIGNvbnNvbGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlnSGFzVGFza3ModGFza0NvbmZpZz86IFRhc2tDb25maWcuSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0YXNrQ29uZmlnICYmICEhdGFza0NvbmZpZy50YXNrcyAmJiB0YXNrQ29uZmlnLnRhc2tzLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuVGFza0ZpbGUocmVzb3VyY2U6IFVSSSwgdGFza1NvdXJjZTogc3RyaW5nKSB7XG5cdFx0bGV0IGNvbmZpZ0ZpbGVDcmVhdGVkID0gZmFsc2U7XG5cdFx0dGhpcy5fZmlsZVNlcnZpY2Uuc3RhdChyZXNvdXJjZSkudGhlbigoc3RhdCkgPT4gc3RhdCwgKCkgPT4gdW5kZWZpbmVkKS50aGVuKGFzeW5jIChzdGF0KSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlRXhpc3RzOiBib29sZWFuID0gISFzdGF0O1xuXHRcdFx0Y29uc3QgY29uZmlnVmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PFRhc2tDb25maWcuSUV4dGVybmFsVGFza1J1bm5lckNvbmZpZ3VyYXRpb24+KCd0YXNrcycsIHsgcmVzb3VyY2UgfSk7XG5cdFx0XHRsZXQgdGFza3NFeGlzdEluRmlsZTogYm9vbGVhbjtcblx0XHRcdGxldCB0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQ7XG5cdFx0XHRzd2l0Y2ggKHRhc2tTb3VyY2UpIHtcblx0XHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Vc2VyOiB0YXNrc0V4aXN0SW5GaWxlID0gdGhpcy5fY29uZmlnSGFzVGFza3MoY29uZmlnVmFsdWUudXNlclZhbHVlKTsgdGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSOyBicmVhaztcblx0XHRcdFx0Y2FzZSBUYXNrU291cmNlS2luZC5Xb3Jrc3BhY2VGaWxlOiB0YXNrc0V4aXN0SW5GaWxlID0gdGhpcy5fY29uZmlnSGFzVGFza3MoY29uZmlnVmFsdWUud29ya3NwYWNlVmFsdWUpOyB0YXJnZXQgPSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTsgYnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6IHRhc2tzRXhpc3RJbkZpbGUgPSB0aGlzLl9jb25maWdIYXNUYXNrcyhjb25maWdWYWx1ZS53b3Jrc3BhY2VGb2xkZXJWYWx1ZSk7IHRhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjtcblx0XHRcdH1cblx0XHRcdGxldCBjb250ZW50O1xuXHRcdFx0aWYgKCF0YXNrc0V4aXN0SW5GaWxlKSB7XG5cdFx0XHRcdGNvbnN0IHBpY2tUZW1wbGF0ZVJlc3VsdCA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZ2V0VGFza1RlbXBsYXRlcygpLCB7IHBsYWNlSG9sZGVyOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLnRlbXBsYXRlJywgJ1NlbGVjdCBhIFRhc2sgVGVtcGxhdGUnKSB9KTtcblx0XHRcdFx0aWYgKCFwaWNrVGVtcGxhdGVSZXN1bHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGVudCA9IHBpY2tUZW1wbGF0ZVJlc3VsdC5jb250ZW50O1xuXHRcdFx0XHRjb25zdCBlZGl0b3JDb25maWcgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgpIGFzIHsgZWRpdG9yOiB7IGluc2VydFNwYWNlczogYm9vbGVhbjsgdGFiU2l6ZTogbnVtYmVyIH0gfTtcblx0XHRcdFx0aWYgKGVkaXRvckNvbmZpZy5lZGl0b3IuaW5zZXJ0U3BhY2VzKSB7XG5cdFx0XHRcdFx0Y29udGVudCA9IGNvbnRlbnQucmVwbGFjZSgvKFxcbikoXFx0KykvZywgKF8sIHMxLCBzMikgPT4gczEgKyAnICcucmVwZWF0KHMyLmxlbmd0aCAqIGVkaXRvckNvbmZpZy5lZGl0b3IudGFiU2l6ZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbmZpZ0ZpbGVDcmVhdGVkID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFmaWxlRXhpc3RzICYmIGNvbnRlbnQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3RleHRGaWxlU2VydmljZS5jcmVhdGUoW3sgcmVzb3VyY2UsIHZhbHVlOiBjb250ZW50IH1dKS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdFswXS5yZXNvdXJjZTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGZpbGVFeGlzdHMgJiYgKHRhc2tzRXhpc3RJbkZpbGUgfHwgY29udGVudCkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdFJlc291cmNlID0gc3RhdD8ucmVzb3VyY2U7XG5cdFx0XHRcdGlmIChjb250ZW50ICYmIHN0YXRSZXNvdXJjZSkge1xuXHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKCd0YXNrcycsIGpzb24ucGFyc2UoY29udGVudCksIHsgcmVzb3VyY2U6IHN0YXRSZXNvdXJjZSB9LCB0YXJnZXQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0UmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pLnRoZW4oKHJlc291cmNlKSA9PiB7XG5cdFx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0cGlubmVkOiBjb25maWdGaWxlQ3JlYXRlZCAvLyBwaW4gb25seSBpZiBjb25maWcgZmlsZSBpcyBjcmVhdGVkICM4NzI3XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNUYXNrRW50cnkodmFsdWU6IElRdWlja1BpY2tJdGVtKTogdmFsdWUgaXMgSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlOiBJUXVpY2tQaWNrSXRlbSAmIHsgdGFzazogVGFzayB9ID0gdmFsdWUgYXMgSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfTtcblx0XHRyZXR1cm4gY2FuZGlkYXRlICYmICEhY2FuZGlkYXRlLnRhc2s7XG5cdH1cblxuXHRwcml2YXRlIF9pc1NldHRpbmdFbnRyeSh2YWx1ZTogSVF1aWNrUGlja0l0ZW0pOiB2YWx1ZSBpcyBJUXVpY2tQaWNrSXRlbSAmIHsgc2V0dGluZ1R5cGU6IHN0cmluZyB9IHtcblx0XHRjb25zdCBjYW5kaWRhdGU6IElRdWlja1BpY2tJdGVtICYgeyBzZXR0aW5nVHlwZTogc3RyaW5nIH0gPSB2YWx1ZSBhcyBJUXVpY2tQaWNrSXRlbSAmIHsgc2V0dGluZ1R5cGU6IHN0cmluZyB9O1xuXHRcdHJldHVybiBjYW5kaWRhdGUgJiYgISFjYW5kaWRhdGUuc2V0dGluZ1R5cGU7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maWd1cmVUYXNrKHRhc2s6IFRhc2spIHtcblx0XHRpZiAoQ29udHJpYnV0ZWRUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHR0aGlzLmN1c3RvbWl6ZSh0YXNrLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdH0gZWxzZSBpZiAoQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0dGhpcy5vcGVuQ29uZmlnKHRhc2spO1xuXHRcdH0gZWxzZSBpZiAoQ29uZmlndXJpbmdUYXNrLmlzKHRhc2spKSB7XG5cdFx0XHQvLyBEbyBub3RoaW5nLlxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVNlbGVjdGlvbihzZWxlY3Rpb246IFRhc2tRdWlja1BpY2tFbnRyeVR5cGUgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNUYXNrRW50cnkoc2VsZWN0aW9uKSkge1xuXHRcdFx0dGhpcy5fY29uZmlndXJlVGFzayhzZWxlY3Rpb24udGFzayk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9pc1NldHRpbmdFbnRyeShzZWxlY3Rpb24pKSB7XG5cdFx0XHRjb25zdCB0YXNrUXVpY2tQaWNrID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGFza1F1aWNrUGljayk7XG5cdFx0XHR0YXNrUXVpY2tQaWNrLmhhbmRsZVNldHRpbmdPcHRpb24oc2VsZWN0aW9uLnNldHRpbmdUeXBlKTtcblx0XHR9IGVsc2UgaWYgKHNlbGVjdGlvbi5mb2xkZXIgJiYgKHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSkge1xuXHRcdFx0dGhpcy5fb3BlblRhc2tGaWxlKHNlbGVjdGlvbi5mb2xkZXIudG9SZXNvdXJjZSgnLnZzY29kZS90YXNrcy5qc29uJyksIFRhc2tTb3VyY2VLaW5kLldvcmtzcGFjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5fZ2V0UmVzb3VyY2VGb3JLaW5kKFRhc2tTb3VyY2VLaW5kLlVzZXIpO1xuXHRcdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRcdHRoaXMuX29wZW5UYXNrRmlsZShyZXNvdXJjZSwgVGFza1NvdXJjZUtpbmQuVXNlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGdldFRhc2tEZXNjcmlwdGlvbih0YXNrOiBUYXNrIHwgQ29uZmlndXJpbmdUYXNrKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGFzay5fc291cmNlLmtpbmQgPT09IFRhc2tTb3VyY2VLaW5kLlVzZXIpIHtcblx0XHRcdGRlc2NyaXB0aW9uID0gbmxzLmxvY2FsaXplKCd0YXNrUXVpY2tQaWNrLnVzZXJTZXR0aW5ncycsICdVc2VyJyk7XG5cdFx0fSBlbHNlIGlmICh0YXNrLl9zb3VyY2Uua2luZCA9PT0gVGFza1NvdXJjZUtpbmQuV29ya3NwYWNlRmlsZSkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSB0YXNrLmdldFdvcmtzcGFjZUZpbGVOYW1lKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLm5lZWRzRm9sZGVyUXVhbGlmaWNhdGlvbigpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0YXNrLmdldFdvcmtzcGFjZUZvbGRlcigpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcikge1xuXHRcdFx0XHRkZXNjcmlwdGlvbiA9IHdvcmtzcGFjZUZvbGRlci5uYW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZGVzY3JpcHRpb247XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9ydW5Db25maWd1cmVUYXNrcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLl90cnVzdCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCB0YXNrUHJvbWlzZTogUHJvbWlzZTxUYXNrTWFwPjtcblx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApIHtcblx0XHRcdHRhc2tQcm9taXNlID0gdGhpcy5fZ2V0R3JvdXBlZFRhc2tzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRhc2tQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKG5ldyBUYXNrTWFwKCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRzID0gdGhpcy5fY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXA8UHJvbWlzZTxJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIHwgdW5kZWZpbmVkPj4oKGZvbGRlcikgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQoZm9sZGVyLnRvUmVzb3VyY2UoJy52c2NvZGUvdGFza3MuanNvbicpKS50aGVuKHN0YXQgPT4gc3RhdCwgKCkgPT4gdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNyZWF0ZUxhYmVsID0gbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5jcmVhdGVKc29uRmlsZScsICdDcmVhdGUgdGFza3MuanNvbiBmaWxlIGZyb20gdGVtcGxhdGUnKTtcblx0XHRjb25zdCBvcGVuTGFiZWwgPSBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm9wZW5Kc29uRmlsZScsICdPcGVuIHRhc2tzLmpzb24gZmlsZScpO1xuXHRcdGNvbnN0IHRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gdG9rZW5Tb3VyY2UudG9rZW47XG5cdFx0Y29uc3QgZW50cmllcyA9IFByb21pc2UuYWxsKHN0YXRzKS50aGVuKChzdGF0cykgPT4ge1xuXHRcdFx0cmV0dXJuIHRhc2tQcm9taXNlLnRoZW4oKHRhc2tNYXApID0+IHtcblx0XHRcdFx0Y29uc3QgZW50cmllczogUXVpY2tQaWNrSW5wdXQ8VGFza1F1aWNrUGlja0VudHJ5VHlwZT5bXSA9IFtdO1xuXHRcdFx0XHRsZXQgY29uZmlndXJlZENvdW50ID0gMDtcblx0XHRcdFx0bGV0IHRhc2tzID0gdGFza01hcC5hbGwoKTtcblx0XHRcdFx0aWYgKHRhc2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0YXNrcyA9IHRhc2tzLnNvcnQoKGEsIGIpID0+IGEuX2xhYmVsLmxvY2FsZUNvbXBhcmUoYi5fbGFiZWwpKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVudHJ5ID0geyBsYWJlbDogVGFza1F1aWNrUGljay5nZXRUYXNrTGFiZWxXaXRoSWNvbih0YXNrKSwgdGFzaywgZGVzY3JpcHRpb246IHRoaXMuZ2V0VGFza0Rlc2NyaXB0aW9uKHRhc2spLCBkZXRhaWw6IHRoaXMuX3Nob3dEZXRhaWwoKSA/IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZGV0YWlsIDogdW5kZWZpbmVkIH07XG5cdFx0XHRcdFx0XHRUYXNrUXVpY2tQaWNrLmFwcGx5Q29sb3JTdHlsZXModGFzaywgZW50cnksIHRoaXMuX3RoZW1lU2VydmljZSk7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0aWYgKCFDb250cmlidXRlZFRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0Y29uZmlndXJlZENvdW50Kys7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG5lZWRzQ3JlYXRlT3JPcGVuID0gKGNvbmZpZ3VyZWRDb3VudCA9PT0gMCk7XG5cdFx0XHRcdC8vIElmIHRoZSBvbmx5IGNvbmZpZ3VyZWQgdGFza3MgYXJlIHVzZXIgdGFza3MsIHRoZW4gd2Ugc2hvdWxkIGFsc28gc2hvdyB0aGUgb3B0aW9uIHRvIGNyZWF0ZSBmcm9tIGEgdGVtcGxhdGUuXG5cdFx0XHRcdGlmIChuZWVkc0NyZWF0ZU9yT3BlbiB8fCAodGFza01hcC5nZXQoVVNFUl9UQVNLU19HUk9VUF9LRVkpLmxlbmd0aCA9PT0gY29uZmlndXJlZENvdW50KSkge1xuXHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gc3RhdHNbMF0gIT09IHVuZGVmaW5lZCA/IG9wZW5MYWJlbCA6IGNyZWF0ZUxhYmVsO1xuXHRcdFx0XHRcdGlmIChlbnRyaWVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGxhYmVsLCBmb2xkZXI6IHRoaXMuX2NvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKChlbnRyaWVzLmxlbmd0aCA9PT0gMSkgJiYgIW5lZWRzQ3JlYXRlT3JPcGVuKSB7XG5cdFx0XHRcdFx0dG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGVudHJpZXM7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRpbWVvdXQ6IGJvb2xlYW4gPSBhd2FpdCBQcm9taXNlLnJhY2UoW25ldyBQcm9taXNlPGJvb2xlYW4+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHRlbnRyaWVzLnRoZW4oKCkgPT4gcmVzb2x2ZShmYWxzZSkpO1xuXHRcdH0pLCBuZXcgUHJvbWlzZTxib29sZWFuPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0Y29uc3QgdGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0cmVzb2x2ZSh0cnVlKTtcblx0XHRcdH0sIDIwMCk7XG5cdFx0fSldKTtcblxuXHRcdGlmICghdGltZW91dCAmJiAoKGF3YWl0IGVudHJpZXMpLmxlbmd0aCA9PT0gMSkgJiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUVVJQ0tPUEVOX1NLSVBfQ09ORklHKSkge1xuXHRcdFx0Y29uc3QgZW50cnkgPSAoYXdhaXQgZW50cmllcylbMF0gYXMgVGFza1F1aWNrUGlja0VudHJ5VHlwZTtcblx0XHRcdGlmICgoZW50cnkgYXMgSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSkudGFzaykge1xuXHRcdFx0XHR0aGlzLl9oYW5kbGVTZWxlY3Rpb24oZW50cnkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZW50cmllc1dpdGhTZXR0aW5ncyA9IGVudHJpZXMudGhlbihyZXNvbHZlZEVudHJpZXMgPT4ge1xuXHRcdFx0cmVzb2x2ZWRFbnRyaWVzLnB1c2goLi4uVGFza1F1aWNrUGljay5hbGxTZXR0aW5nRW50cmllcyh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdFx0cmV0dXJuIHJlc29sdmVkRW50cmllcztcblx0XHR9KTtcblxuXHRcdHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soZW50cmllc1dpdGhTZXR0aW5ncyxcblx0XHRcdHsgcGxhY2VIb2xkZXI6IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja1Rhc2snLCAnU2VsZWN0IGEgdGFzayB0byBjb25maWd1cmUnKSB9LCBjYW5jZWxsYXRpb25Ub2tlbikuXG5cdFx0XHR0aGVuKGFzeW5jIChzZWxlY3Rpb24pID0+IHtcblx0XHRcdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0Ly8gY2FuY2VsZWQgd2hlbiB0aGVyZSdzIG9ubHkgb25lIHRhc2tcblx0XHRcdFx0XHRjb25zdCB0YXNrID0gKGF3YWl0IGVudHJpZXMpWzBdO1xuXHRcdFx0XHRcdGlmICgodGFzayBhcyBJUXVpY2tQaWNrSXRlbSAmIHsgdGFzazogVGFzayB9KS50YXNrKSB7XG5cdFx0XHRcdFx0XHRzZWxlY3Rpb24gPSA8VGFza1F1aWNrUGlja0VudHJ5VHlwZT50YXNrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9oYW5kbGVTZWxlY3Rpb24oc2VsZWN0aW9uKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcnVuQ29uZmlndXJlRGVmYXVsdEJ1aWxkVGFzaygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApIHtcblx0XHRcdHRoaXMudGFza3MoKS50aGVuKCh0YXNrcyA9PiB7XG5cdFx0XHRcdGlmICh0YXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHR0aGlzLl9ydW5Db25maWd1cmVUYXNrcygpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbnRyaWVzOiBRdWlja1BpY2tJbnB1dDxUYXNrUXVpY2tQaWNrRW50cnlUeXBlPltdID0gW107XG5cdFx0XHRcdGxldCBzZWxlY3RlZFRhc2s6IFRhc2sgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBzZWxlY3RlZEVudHJ5OiBUYXNrUXVpY2tQaWNrRW50cnlUeXBlIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9zaG93SWdub3JlZEZvbGRlcnNNZXNzYWdlKCkudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgeyBnbG9iR3JvdXBUYXNrcyB9ID0gYXdhaXQgdGhpcy5fZ2V0R2xvYlRhc2tzKFRhc2tHcm91cC5CdWlsZC5faWQpO1xuXHRcdFx0XHRcdGxldCBkZWZhdWx0VGFza3MgPSBnbG9iR3JvdXBUYXNrcztcblx0XHRcdFx0XHRpZiAoIWRlZmF1bHRUYXNrcz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0VGFza3MgPSB0aGlzLl9nZXREZWZhdWx0VGFza3ModGFza3MsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGV0IGRlZmF1bHRCdWlsZFRhc2s7XG5cdFx0XHRcdFx0aWYgKGRlZmF1bHRUYXNrcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGdyb3VwOiBzdHJpbmcgfCBUYXNrR3JvdXAgfCB1bmRlZmluZWQgPSBkZWZhdWx0VGFza3NbMF0uY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXA7XG5cdFx0XHRcdFx0XHRpZiAoZ3JvdXApIHtcblx0XHRcdFx0XHRcdFx0aWYgKHR5cGVvZiBncm91cCA9PT0gJ3N0cmluZycgJiYgZ3JvdXAgPT09IFRhc2tHcm91cC5CdWlsZC5faWQpIHtcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0QnVpbGRUYXNrID0gZGVmYXVsdFRhc2tzWzBdO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGRlZmF1bHRCdWlsZFRhc2sgPSBkZWZhdWx0VGFza3NbMF07XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB0YXNrIG9mIHRhc2tzKSB7XG5cdFx0XHRcdFx0XHRpZiAodGFzayA9PT0gZGVmYXVsdEJ1aWxkVGFzaykge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UuZGVmYXVsdEJ1aWxkVGFza0V4aXN0cycsICd7MH0gaXMgYWxyZWFkeSBtYXJrZWQgYXMgdGhlIGRlZmF1bHQgYnVpbGQgdGFzaycsIFRhc2tRdWlja1BpY2suZ2V0VGFza0xhYmVsV2l0aEljb24odGFzaywgdGFzay5nZXRRdWFsaWZpZWRMYWJlbCgpKSk7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdGVkVGFzayA9IHRhc2s7XG5cdFx0XHRcdFx0XHRcdHNlbGVjdGVkRW50cnkgPSB7IGxhYmVsLCB0YXNrLCBkZXNjcmlwdGlvbjogdGhpcy5nZXRUYXNrRGVzY3JpcHRpb24odGFzayksIGRldGFpbDogdGhpcy5fc2hvd0RldGFpbCgpID8gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5kZXRhaWwgOiB1bmRlZmluZWQgfTtcblx0XHRcdFx0XHRcdFx0VGFza1F1aWNrUGljay5hcHBseUNvbG9yU3R5bGVzKHRhc2ssIHNlbGVjdGVkRW50cnksIHRoaXMuX3RoZW1lU2VydmljZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBlbnRyeSA9IHsgbGFiZWw6IFRhc2tRdWlja1BpY2suZ2V0VGFza0xhYmVsV2l0aEljb24odGFzayksIHRhc2ssIGRlc2NyaXB0aW9uOiB0aGlzLmdldFRhc2tEZXNjcmlwdGlvbih0YXNrKSwgZGV0YWlsOiB0aGlzLl9zaG93RGV0YWlsKCkgPyB0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRldGFpbCA6IHVuZGVmaW5lZCB9O1xuXHRcdFx0XHRcdFx0XHRUYXNrUXVpY2tQaWNrLmFwcGx5Q29sb3JTdHlsZXModGFzaywgZW50cnksIHRoaXMuX3RoZW1lU2VydmljZSk7XG5cdFx0XHRcdFx0XHRcdGVudHJpZXMucHVzaChlbnRyeSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChzZWxlY3RlZEVudHJ5KSB7XG5cdFx0XHRcdFx0XHRlbnRyaWVzLnVuc2hpZnQoc2VsZWN0ZWRFbnRyeSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gdG9rZW5Tb3VyY2UudG9rZW47XG5cdFx0XHRcdFx0dGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhlbnRyaWVzLFxuXHRcdFx0XHRcdFx0eyBwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5waWNrVGFzaycsICdTZWxlY3QgYSB0YXNrIHRvIGNvbmZpZ3VyZScpIH0sIGNhbmNlbGxhdGlvblRva2VuKS5cblx0XHRcdFx0XHRcdHRoZW4oYXN5bmMgKGVudHJ5KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRcdC8vIGNhbmNlbGVkIHdoZW4gdGhlcmUncyBvbmx5IG9uZSB0YXNrXG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgdGFzayA9IChhd2FpdCBlbnRyaWVzKVswXTtcblx0XHRcdFx0XHRcdFx0XHRpZiAoKHRhc2sgYXMgSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSkudGFzaykge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZW50cnkgPSA8VGFza1F1aWNrUGlja0VudHJ5VHlwZT50YXNrO1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRjb25zdCB0YXNrOiBUYXNrIHwgdW5kZWZpbmVkIHwgbnVsbCA9IGVudHJ5ICYmIE9iamVjdC5oYXNPd24oZW50cnksICd0YXNrJykgPyAoZW50cnkgYXMgSVF1aWNrUGlja0l0ZW0gJiB7IHRhc2s6IFRhc2sgfSkudGFzayA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKCh0YXNrID09PSB1bmRlZmluZWQpIHx8ICh0YXNrID09PSBudWxsKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAodGFzayA9PT0gc2VsZWN0ZWRUYXNrICYmIEN1c3RvbVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLm9wZW5Db25maWcodGFzayk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCFJbk1lbW9yeVRhc2suaXModGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmN1c3RvbWl6ZSh0YXNrLCB7IGdyb3VwOiB7IGtpbmQ6ICdidWlsZCcsIGlzRGVmYXVsdDogdHJ1ZSB9IH0sIHRydWUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKHNlbGVjdGVkVGFzayAmJiAodGFzayAhPT0gc2VsZWN0ZWRUYXNrKSAmJiAhSW5NZW1vcnlUYXNrLmlzKHNlbGVjdGVkVGFzaykpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5jdXN0b21pemUoc2VsZWN0ZWRUYXNrLCB7IGdyb3VwOiAnYnVpbGQnIH0sIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0dGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UucGljayhlbnRyaWVzLCB7XG5cdFx0XHRcdFx0XHRwbGFjZUhvbGRlcjogbmxzLmxvY2FsaXplKCdUYXNrU2VydmljZS5waWNrRGVmYXVsdEJ1aWxkVGFzaycsICdTZWxlY3QgdGhlIHRhc2sgdG8gYmUgdXNlZCBhcyB0aGUgZGVmYXVsdCBidWlsZCB0YXNrJylcblx0XHRcdFx0XHR9KS5cblx0XHRcdFx0XHRcdHRoZW4oKGVudHJ5KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsID0gZW50cnkgJiYgT2JqZWN0Lmhhc093bihlbnRyeSwgJ3Rhc2snKSA/IChlbnRyeSBhcyBJUXVpY2tQaWNrSXRlbSAmIHsgdGFzazogVGFzayB9KS50YXNrIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRpZiAoKHRhc2sgPT09IHVuZGVmaW5lZCkgfHwgKHRhc2sgPT09IG51bGwpKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICh0YXNrID09PSBzZWxlY3RlZFRhc2sgJiYgQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMub3BlbkNvbmZpZyh0YXNrKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoIUluTWVtb3J5VGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuY3VzdG9taXplKHRhc2ssIHsgZ3JvdXA6IHsga2luZDogJ2J1aWxkJywgaXNEZWZhdWx0OiB0cnVlIH0gfSwgdHJ1ZSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoc2VsZWN0ZWRUYXNrICYmICh0YXNrICE9PSBzZWxlY3RlZFRhc2spICYmICFJbk1lbW9yeVRhc2suaXMoc2VsZWN0ZWRUYXNrKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmN1c3RvbWl6ZShzZWxlY3RlZFRhc2ssIHsgZ3JvdXA6ICdidWlsZCcgfSwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3J1bkNvbmZpZ3VyZVRhc2tzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcnVuQ29uZmlndXJlRGVmYXVsdFRlc3RUYXNrKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNjaGVtYVZlcnNpb24gPT09IEpzb25TY2hlbWFWZXJzaW9uLlYyXzBfMCkge1xuXHRcdFx0dGhpcy50YXNrcygpLnRoZW4oKHRhc2tzID0+IHtcblx0XHRcdFx0aWYgKHRhc2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX3J1bkNvbmZpZ3VyZVRhc2tzKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBzZWxlY3RlZFRhc2s6IFRhc2sgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBzZWxlY3RlZEVudHJ5OiBJVGFza1F1aWNrUGlja0VudHJ5O1xuXG5cdFx0XHRcdGZvciAoY29uc3QgdGFzayBvZiB0YXNrcykge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2tHcm91cDogVGFza0dyb3VwIHwgdW5kZWZpbmVkID0gVGFza0dyb3VwLmZyb20odGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCk7XG5cdFx0XHRcdFx0aWYgKHRhc2tHcm91cCAmJiB0YXNrR3JvdXAuaXNEZWZhdWx0ICYmIHRhc2tHcm91cC5faWQgPT09IFRhc2tHcm91cC5UZXN0Ll9pZCkge1xuXHRcdFx0XHRcdFx0c2VsZWN0ZWRUYXNrID0gdGFzaztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2VsZWN0ZWRUYXNrKSB7XG5cdFx0XHRcdFx0c2VsZWN0ZWRFbnRyeSA9IHtcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLmRlZmF1bHRUZXN0VGFza0V4aXN0cycsICd7MH0gaXMgYWxyZWFkeSBtYXJrZWQgYXMgdGhlIGRlZmF1bHQgdGVzdCB0YXNrLicsIHNlbGVjdGVkVGFzay5nZXRRdWFsaWZpZWRMYWJlbCgpKSxcblx0XHRcdFx0XHRcdHRhc2s6IHNlbGVjdGVkVGFzayxcblx0XHRcdFx0XHRcdGRldGFpbDogdGhpcy5fc2hvd0RldGFpbCgpID8gc2VsZWN0ZWRUYXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLmRldGFpbCA6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLl9zaG93SWdub3JlZEZvbGRlcnNNZXNzYWdlKCkudGhlbigoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd1F1aWNrUGljayh0YXNrcyxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja0RlZmF1bHRUZXN0VGFzaycsICdTZWxlY3QgdGhlIHRhc2sgdG8gYmUgdXNlZCBhcyB0aGUgZGVmYXVsdCB0ZXN0IHRhc2snKSwgdW5kZWZpbmVkLCB0cnVlLCBmYWxzZSwgc2VsZWN0ZWRFbnRyeSkudGhlbigoZW50cnkpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgdGFzazogVGFzayB8IHVuZGVmaW5lZCB8IG51bGwgPSBlbnRyeSAmJiBPYmplY3QuaGFzT3duKGVudHJ5LCAndGFzaycpID8gZW50cnkudGFzayA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKCF0YXNrKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICh0YXNrID09PSBzZWxlY3RlZFRhc2sgJiYgQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMub3BlbkNvbmZpZyh0YXNrKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoIUluTWVtb3J5VGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuY3VzdG9taXplKHRhc2ssIHsgZ3JvdXA6IHsga2luZDogJ3Rlc3QnLCBpc0RlZmF1bHQ6IHRydWUgfSB9LCB0cnVlKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChzZWxlY3RlZFRhc2sgJiYgKHRhc2sgIT09IHNlbGVjdGVkVGFzaykgJiYgIUluTWVtb3J5VGFzay5pcyhzZWxlY3RlZFRhc2spKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuY3VzdG9taXplKHNlbGVjdGVkVGFzaywgeyBncm91cDogJ3Rlc3QnIH0sIGZhbHNlKTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9ydW5Db25maWd1cmVUYXNrcygpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBhc3luYyBydW5TaG93VGFza3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWN0aXZlVGFza3NQcm9taXNlOiBQcm9taXNlPFRhc2tbXT4gPSB0aGlzLmdldEFjdGl2ZVRhc2tzKCk7XG5cdFx0Y29uc3QgYWN0aXZlVGFza3M6IFRhc2tbXSA9IGF3YWl0IGFjdGl2ZVRhc2tzUHJvbWlzZTtcblx0XHRsZXQgZ3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoYWN0aXZlVGFza3MubGVuZ3RoID09PSAxKSB7XG5cdFx0XHR0aGlzLl90YXNrU3lzdGVtIS5yZXZlYWxUYXNrKGFjdGl2ZVRhc2tzWzBdKTtcblx0XHR9IGVsc2UgaWYgKGFjdGl2ZVRhc2tzLmxlbmd0aCAmJiBhY3RpdmVUYXNrcy5ldmVyeSgodGFzaykgPT4ge1xuXHRcdFx0aWYgKEluTWVtb3J5VGFzay5pcyh0YXNrKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0Z3JvdXAgPSB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uPy5ncm91cDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0YXNrLmNvbW1hbmQucHJlc2VudGF0aW9uPy5ncm91cCAmJiAodGFzay5jb21tYW5kLnByZXNlbnRhdGlvbi5ncm91cCA9PT0gZ3JvdXApO1xuXHRcdH0pKSB7XG5cdFx0XHR0aGlzLl90YXNrU3lzdGVtIS5yZXZlYWxUYXNrKGFjdGl2ZVRhc2tzWzBdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2hvd1F1aWNrUGljayhhY3RpdmVUYXNrc1Byb21pc2UsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnVGFza1NlcnZpY2UucGlja1Nob3dUYXNrJywgJ1NlbGVjdCB0aGUgdGFzayB0byBzaG93IGl0cyBvdXRwdXQnKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ1Rhc2tTZXJ2aWNlLm5vVGFza0lzUnVubmluZycsICdObyB0YXNrIGlzIHJ1bm5pbmcnKSxcblx0XHRcdFx0XHR0YXNrOiBudWxsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZhbHNlLCB0cnVlXG5cdFx0XHQpLnRoZW4oKGVudHJ5KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhc2s6IFRhc2sgfCB1bmRlZmluZWQgfCBudWxsID0gZW50cnkgPyBlbnRyeS50YXNrIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGFzayA9PT0gdW5kZWZpbmVkIHx8IHRhc2sgPT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fdGFza1N5c3RlbSEucmV2ZWFsVGFzayh0YXNrKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVRhc2tzRG90T2xkKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlcik6IFByb21pc2U8W1VSSSwgVVJJXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRhc2tzRmlsZSA9IGZvbGRlci50b1Jlc291cmNlKCcudnNjb2RlL3Rhc2tzLmpzb24nKTtcblx0XHRpZiAoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZXhpc3RzKHRhc2tzRmlsZSkpIHtcblx0XHRcdGNvbnN0IG9sZEZpbGUgPSB0YXNrc0ZpbGUud2l0aCh7IHBhdGg6IGAke3Rhc2tzRmlsZS5wYXRofS5vbGRgIH0pO1xuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY29weSh0YXNrc0ZpbGUsIG9sZEZpbGUsIHRydWUpO1xuXHRcdFx0cmV0dXJuIFtvbGRGaWxlLCB0YXNrc0ZpbGVdO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBncmFkZVRhc2sodGFzazogVGFzaywgc3VwcHJlc3NUYXNrTmFtZTogYm9vbGVhbiwgZ2xvYmFsQ29uZmlnOiB7IHdpbmRvd3M/OiBJQ29tbWFuZFVwZ3JhZGU7IG9zeD86IElDb21tYW5kVXBncmFkZTsgbGludXg/OiBJQ29tbWFuZFVwZ3JhZGUgfSk6IFRhc2tDb25maWcuSUN1c3RvbVRhc2sgfCBUYXNrQ29uZmlnLklDb25maWd1cmluZ1Rhc2sgfCB1bmRlZmluZWQge1xuXHRcdGlmICghQ3VzdG9tVGFzay5pcyh0YXNrKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjb25maWdFbGVtZW50OiBJVGFza0NvbmZpZyA9IHtcblx0XHRcdGxhYmVsOiB0YXNrLl9sYWJlbFxuXHRcdH07XG5cdFx0Y29uc3Qgb2xkVGFza1R5cGVzID0gbmV3IFNldChbJ2d1bHAnLCAnamFrZScsICdncnVudCddKTtcblx0XHRpZiAoVHlwZXMuaXNTdHJpbmcodGFzay5jb21tYW5kLm5hbWUpICYmIG9sZFRhc2tUeXBlcy5oYXModGFzay5jb21tYW5kLm5hbWUpKSB7XG5cdFx0XHRjb25maWdFbGVtZW50LnR5cGUgPSB0YXNrLmNvbW1hbmQubmFtZTtcblx0XHRcdGNvbmZpZ0VsZW1lbnQudGFzayA9IHRhc2suY29tbWFuZC5hcmdzIVswXTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRhc2suY29tbWFuZC5ydW50aW1lID09PSBSdW50aW1lVHlwZS5TaGVsbCkge1xuXHRcdFx0XHRjb25maWdFbGVtZW50LnR5cGUgPSBSdW50aW1lVHlwZS50b1N0cmluZyhSdW50aW1lVHlwZS5TaGVsbCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGFzay5jb21tYW5kLm5hbWUgJiYgIXN1cHByZXNzVGFza05hbWUgJiYgIWdsb2JhbENvbmZpZy53aW5kb3dzPy5jb21tYW5kICYmICFnbG9iYWxDb25maWcub3N4Py5jb21tYW5kICYmICFnbG9iYWxDb25maWcubGludXg/LmNvbW1hbmQpIHtcblx0XHRcdFx0Y29uZmlnRWxlbWVudC5jb21tYW5kID0gdGFzay5jb21tYW5kLm5hbWU7XG5cdFx0XHR9IGVsc2UgaWYgKHN1cHByZXNzVGFza05hbWUpIHtcblx0XHRcdFx0Y29uZmlnRWxlbWVudC5jb21tYW5kID0gKHRhc2suX3NvdXJjZS5jb25maWcuZWxlbWVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuY29tbWFuZCBhcyBzdHJpbmcgfCBDb21tYW5kU3RyaW5nO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRhc2suY29tbWFuZC5hcmdzICYmICghQXJyYXkuaXNBcnJheSh0YXNrLmNvbW1hbmQuYXJncykgfHwgKHRhc2suY29tbWFuZC5hcmdzLmxlbmd0aCA+IDApKSkge1xuXHRcdFx0XHRpZiAoIWdsb2JhbENvbmZpZy53aW5kb3dzPy5hcmdzICYmICFnbG9iYWxDb25maWcub3N4Py5hcmdzICYmICFnbG9iYWxDb25maWcubGludXg/LmFyZ3MpIHtcblx0XHRcdFx0XHRjb25maWdFbGVtZW50LmFyZ3MgPSB0YXNrLmNvbW1hbmQuYXJncztcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25maWdFbGVtZW50LmFyZ3MgPSAodGFzay5fc291cmNlLmNvbmZpZy5lbGVtZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KS5hcmdzIGFzIHN0cmluZ1tdIHwgQ29tbWFuZFN0cmluZ1tdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJlc2VudGF0aW9uKSB7XG5cdFx0XHRjb25maWdFbGVtZW50LnByZXNlbnRhdGlvbiA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMucHJlc2VudGF0aW9uO1xuXHRcdH1cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQpIHtcblx0XHRcdGNvbmZpZ0VsZW1lbnQuaXNCYWNrZ3JvdW5kID0gdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5pc0JhY2tncm91bmQ7XG5cdFx0fVxuXHRcdGlmICh0YXNrLmNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzLnByb2JsZW1NYXRjaGVycykge1xuXHRcdFx0Y29uZmlnRWxlbWVudC5wcm9ibGVtTWF0Y2hlciA9ICh0YXNrLl9zb3VyY2UuY29uZmlnLmVsZW1lbnQgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnByb2JsZW1NYXRjaGVyIGFzIHN0cmluZ1tdO1xuXHRcdH1cblx0XHRpZiAodGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcy5ncm91cCkge1xuXHRcdFx0Y29uZmlnRWxlbWVudC5ncm91cCA9IHRhc2suY29uZmlndXJhdGlvblByb3BlcnRpZXMuZ3JvdXA7XG5cdFx0fVxuXG5cdFx0dGFzay5fc291cmNlLmNvbmZpZy5lbGVtZW50ID0gY29uZmlnRWxlbWVudDtcblx0XHRjb25zdCB0ZW1wVGFzayA9IG5ldyBDdXN0b21UYXNrKHRhc2suX2lkLCB0YXNrLl9zb3VyY2UsIHRhc2suX2xhYmVsLCB0YXNrLnR5cGUsIHRhc2suY29tbWFuZCwgdGFzay5oYXNEZWZpbmVkTWF0Y2hlcnMsIHRhc2sucnVuT3B0aW9ucywgdGFzay5jb25maWd1cmF0aW9uUHJvcGVydGllcyk7XG5cdFx0Y29uc3QgY29uZmlnVGFzayA9IHRoaXMuX2NyZWF0ZUN1c3RvbWl6YWJsZVRhc2sodGVtcFRhc2spO1xuXHRcdGlmIChjb25maWdUYXNrKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlnVGFzaztcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdXBncmFkZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zY2hlbWFWZXJzaW9uID09PSBKc29uU2NoZW1hVmVyc2lvbi5WMl8wXzApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50Lm9uY2UodGhpcy5fd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KShpc1RydXN0ZWQgPT4ge1xuXHRcdFx0XHRpZiAoaXNUcnVzdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fdXBncmFkZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFza3MgPSBhd2FpdCB0aGlzLl9nZXRHcm91cGVkVGFza3MoKTtcblx0XHRjb25zdCBmaWxlRGlmZnM6IFtVUkksIFVSSV1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHRoaXMud29ya3NwYWNlRm9sZGVycykge1xuXHRcdFx0Y29uc3QgZGlmZiA9IGF3YWl0IHRoaXMuX2NyZWF0ZVRhc2tzRG90T2xkKGZvbGRlcik7XG5cdFx0XHRpZiAoZGlmZikge1xuXHRcdFx0XHRmaWxlRGlmZnMucHVzaChkaWZmKTtcblx0XHRcdH1cblx0XHRcdGlmICghZGlmZikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY29uZmlnVGFza3M6IChUYXNrQ29uZmlnLklDdXN0b21UYXNrIHwgVGFza0NvbmZpZy5JQ29uZmlndXJpbmdUYXNrKVtdID0gW107XG5cdFx0XHRjb25zdCBzdXBwcmVzc1Rhc2tOYW1lID0gISF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrc1NjaGVtYVByb3BlcnRpZXMuU3VwcHJlc3NUYXNrTmFtZSwgeyByZXNvdXJjZTogZm9sZGVyLnVyaSB9KTtcblx0XHRcdGNvbnN0IGdsb2JhbENvbmZpZyA9IHtcblx0XHRcdFx0d2luZG93czogPElDb21tYW5kVXBncmFkZT50aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrc1NjaGVtYVByb3BlcnRpZXMuV2luZG93cywgeyByZXNvdXJjZTogZm9sZGVyLnVyaSB9KSxcblx0XHRcdFx0b3N4OiA8SUNvbW1hbmRVcGdyYWRlPnRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tzU2NoZW1hUHJvcGVydGllcy5Pc3gsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSksXG5cdFx0XHRcdGxpbnV4OiA8SUNvbW1hbmRVcGdyYWRlPnRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRhc2tzU2NoZW1hUHJvcGVydGllcy5MaW51eCwgeyByZXNvdXJjZTogZm9sZGVyLnVyaSB9KVxuXHRcdFx0fTtcblx0XHRcdHRhc2tzLmdldChmb2xkZXIpLmZvckVhY2godGFzayA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ1Rhc2sgPSB0aGlzLl91cGdyYWRlVGFzayh0YXNrLCBzdXBwcmVzc1Rhc2tOYW1lLCBnbG9iYWxDb25maWcpO1xuXHRcdFx0XHRpZiAoY29uZmlnVGFzaykge1xuXHRcdFx0XHRcdGNvbmZpZ1Rhc2tzLnB1c2goY29uZmlnVGFzayk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fdGFza1N5c3RlbSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3dvcmtzcGFjZVRhc2tzUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlQ29uZmlndXJhdGlvbihmb2xkZXIsICd0YXNrcy50YXNrcycsIGNvbmZpZ1Rhc2tzKTtcblx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlQ29uZmlndXJhdGlvbihmb2xkZXIsICd0YXNrcy52ZXJzaW9uJywgJzIuMC4wJyk7XG5cdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLlNob3dPdXRwdXQsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLlNob3dPdXRwdXQsIHVuZGVmaW5lZCwgeyByZXNvdXJjZTogZm9sZGVyLnVyaSB9KTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShUYXNrc1NjaGVtYVByb3BlcnRpZXMuSXNTaGVsbENvbW1hbmQsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLklzU2hlbGxDb21tYW5kLCB1bmRlZmluZWQsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLlN1cHByZXNzVGFza05hbWUsIHsgcmVzb3VyY2U6IGZvbGRlci51cmkgfSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoVGFza3NTY2hlbWFQcm9wZXJ0aWVzLlN1cHByZXNzVGFza05hbWUsIHVuZGVmaW5lZCwgeyByZXNvdXJjZTogZm9sZGVyLnVyaSB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlU2V0dXAoKTtcblxuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRmaWxlRGlmZnMubGVuZ3RoID09PSAxID9cblx0XHRcdFx0bmxzLmxvY2FsaXplKCd0YXNrU2VydmljZS51cGdyYWRlVmVyc2lvbicsIFwiVGhlIGRlcHJlY2F0ZWQgdGFza3MgdmVyc2lvbiAwLjEuMCBoYXMgYmVlbiByZW1vdmVkLiBZb3VyIHRhc2tzIGhhdmUgYmVlbiB1cGdyYWRlZCB0byB2ZXJzaW9uIDIuMC4wLiBPcGVuIHRoZSBkaWZmIHRvIHJldmlldyB0aGUgdXBncmFkZS5cIilcblx0XHRcdFx0OiBubHMubG9jYWxpemUoJ3Rhc2tTZXJ2aWNlLnVwZ3JhZGVWZXJzaW9uUGx1cmFsJywgXCJUaGUgZGVwcmVjYXRlZCB0YXNrcyB2ZXJzaW9uIDAuMS4wIGhhcyBiZWVuIHJlbW92ZWQuIFlvdXIgdGFza3MgaGF2ZSBiZWVuIHVwZ3JhZGVkIHRvIHZlcnNpb24gMi4wLjAuIE9wZW4gdGhlIGRpZmZzIHRvIHJldmlldyB0aGUgdXBncmFkZS5cIiksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogZmlsZURpZmZzLmxlbmd0aCA9PT0gMSA/IG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2Uub3BlbkRpZmYnLCBcIk9wZW4gZGlmZlwiKSA6IG5scy5sb2NhbGl6ZSgndGFza1NlcnZpY2Uub3BlbkRpZmZzJywgXCJPcGVuIGRpZmZzXCIpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHVwZ3JhZGUgb2YgZmlsZURpZmZzKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRcdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogdXBncmFkZVswXSB9LFxuXHRcdFx0XHRcdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogdXBncmFkZVsxXSB9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1dXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFFdkIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsWUFBWSxVQUFVO0FBQ3RCLFlBQVksVUFBVTtBQUN0QixTQUFTLFlBQVksU0FBa0MsbUJBQW1CLG9CQUFvQjtBQUM5RixTQUFTLFVBQVUsYUFBYTtBQUNoQyxZQUFZLGFBQWE7QUFDekIsU0FBUyxpQkFBaUIsd0JBQXdCO0FBQ2xELFlBQVksY0FBYztBQUMxQixTQUFTLDZCQUE2QjtBQUN0QyxZQUFZ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LFlBQVk7QUFDaEIscUJBQVcsV0FBVyxXQUFXO0FBQ2hDLGtCQUFNLEtBQUssZUFBZSxXQUFXO0FBQUEsY0FDcEMsVUFBVSxFQUFFLFVBQVUsUUFBUSxDQUFDLEVBQUU7QUFBQSxjQUNqQyxVQUFVLEVBQUUsVUFBVSxRQUFRLENBQUMsRUFBRTtBQUFBLFlBQ2xDLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUFBQTtBQTF4SHNCLG9CQUdHLHdCQUF3QjtBQUgzQixvQkFJRywwQkFBMEI7QUFKN0Isb0JBS0csc0JBQXNCO0FBTHpCLG9CQU1HLGtDQUFrQztBQU5yQyxvQkFTUCxrQkFBMEI7QUFUbkIsb0JBVVAscUJBQTZCLElBQUksU0FBUyxTQUFTLE9BQU87QUFWbkQsb0JBWU4sY0FBc0I7QUFaaEIsc0JBQWY7QUFBQSxFQTZESjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FuR21COyIsCiAgIm5hbWVzIjogWyJDb25maWd1cmVUYXNrQWN0aW9uIiwgImRlZmF1bHRzIiwgImpzb24iLCAidGFza3MiLCAidGFzayIsICJTYXZlQmVmb3JlUnVuQ29uZmlnT3B0aW9ucyIsICJfIiwgInJlc3VsdCIsICJlcnJvciIsICJrZXkiLCAiZm9sZGVyIiwgImVudHJpZXMiLCAicmVzb3VyY2UiLCAic3RhdHMiXQp9Cg==
