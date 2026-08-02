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
import { $, addDisposableGenericMouseDownListener, addDisposableListener, append, EventType } from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionViewItem, BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Action } from "../../../../base/common/actions.js";
import { equals } from "../../../../base/common/arrays.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derivedOpts } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { localize, localize2 } from "../../../../nls.js";
import { IActionViewItemService } from "../../../../platform/actions/browser/actionViewItemService.js";
import { ActionWidgetDropdownActionViewItem } from "../../../../platform/actions/browser/actionWidgetDropdownActionViewItem.js";
import { MenuId, registerAction2, Action2, MenuRegistry, SubmenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { logSessionsInteraction } from "../../../common/sessionsTelemetry.js";
import { IWorkbenchLayoutService } from "../../../../workbench/services/layout/browser/layoutService.js";
import { SessionsCategories } from "../../../common/categories.js";
import { ISessionsManagementService } from "../../../services/sessions/common/sessionsManagement.js";
import { ISessionsService } from "../../../services/sessions/browser/sessionsService.js";
import { SessionWorkspaceIsVirtualContext, SessionsWelcomeVisibleContext } from "../../../common/contextkeys.js";
import { IChatWidgetService } from "../../../../workbench/contrib/chat/browser/chat.js";
import { Menus } from "../../../browser/menus.js";
import { ISessionsTasksService } from "./sessionsTasksService.js";
import { IsAuxiliaryWindowContext } from "../../../../workbench/common/contextkeys.js";
import { RunScriptCustomTaskWidget } from "./runScriptCustomTaskWidget.js";
const RunScriptDropdownMenuId = MenuId.for("AgentSessionsRunScriptDropdown");
const RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS = "run-script-action-modal-visible";
const RUN_SCRIPT_ACTION_PRIMARY_ID = "workbench.action.agentSessions.runScriptPrimary";
const CONFIGURE_DEFAULT_RUN_ACTION_ID = "workbench.action.agentSessions.configureDefaultRunAction";
const GENERATE_RUN_ACTION_ID = "workbench.action.agentSessions.generateRunAction";
const closeQuickWidgetButton = {
  iconClass: ThemeIcon.asClassName(Codicon.close),
  tooltip: localize("closeQuickWidget", "Close"),
  alwaysVisible: true
};
function getTaskDisplayLabel(task) {
  if (task.label && task.label.length > 0) {
    return task.label;
  }
  if (task.script && task.script.length > 0) {
    return task.script;
  }
  if (task.command && task.command.length > 0) {
    return task.command;
  }
  if (task.task && task.task.toString().length > 0) {
    return task.task.toString();
  }
  return "";
}
function getTaskCommandPreview(task) {
  if (task.command && task.command.length > 0) {
    return task.command;
  }
  if (task.script && task.script.length > 0) {
    return localize("npmTaskCommandPreview", "npm run {0}", task.script);
  }
  if (task.task && task.task.toString().length > 0) {
    return task.task.toString();
  }
  return getTaskDisplayLabel(task);
}
function formatBrowserUrlDescription(url, maxLength) {
  if (!url) {
    return void 0;
  }
  const stripped = url.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (stripped.length <= maxLength) {
    return stripped;
  }
  return `${stripped.substring(0, maxLength - 3)}...`;
}
function getPrimaryTask(tasks, pinnedTaskLabel) {
  if (tasks.length === 0) {
    return void 0;
  }
  if (pinnedTaskLabel) {
    const pinnedTask = tasks.find((task) => task.task.label === pinnedTaskLabel);
    if (pinnedTask) {
      return pinnedTask;
    }
  }
  return tasks[0];
}
let RunScriptContribution = class extends Disposable {
  constructor(_sessionManagementService, _sessionsService, _keybindingService, _quickInputService, _sessionsConfigService, _actionViewItemService, _layoutService, _telemetryService, _chatWidgetService, _commandService) {
    super();
    this._sessionManagementService = _sessionManagementService;
    this._sessionsService = _sessionsService;
    this._quickInputService = _quickInputService;
    this._sessionsConfigService = _sessionsConfigService;
    this._actionViewItemService = _actionViewItemService;
    this._layoutService = _layoutService;
    this._telemetryService = _telemetryService;
    this._chatWidgetService = _chatWidgetService;
    this._commandService = _commandService;
    this._activeRunState = derivedOpts({
      owner: this,
      equalsFn: (a, b) => {
        if (a === b) {
          return true;
        }
        if (!a || !b) {
          return false;
        }
        return a.session === b.session && a.pinnedTaskLabel === b.pinnedTaskLabel && a.browserUrl === b.browserUrl && a.pinnedBrowser === b.pinnedBrowser && equals(a.tasks, b.tasks, (t1, t2) => t1.task.label === t2.task.label && t1.task.command === t2.task.command && t1.target === t2.target && t1.task.runOptions?.runOn === t2.task.runOptions?.runOn);
      }
    }, (reader) => {
      const activeSession = this._sessionsService.activeSession.read(reader);
      if (!activeSession) {
        return void 0;
      }
      const tasks = this._sessionsConfigService.getSessionTasks(activeSession).read(reader);
      const folder = activeSession.workspace.read(reader)?.folders[0];
      const pinnedTaskLabel = this._sessionsConfigService.getPinnedTaskLabel(folder?.root).read(reader);
      const browserUrl = this._sessionsConfigService.getBrowserUrl(folder?.root).read(reader);
      const pinnedBrowser = this._sessionsConfigService.getPinnedBrowser(folder?.root).read(reader);
      return { session: activeSession, tasks, pinnedTaskLabel, browserUrl, pinnedBrowser };
    }).recomputeInitiallyAndOnChange(this._store);
    this._registerActionViewItemProvider();
    this._registerActions();
  }
  _registerActionViewItemProvider() {
    const that = this;
    this._register(this._actionViewItemService.register(
      Menus.TitleBarCenterRight,
      RunScriptDropdownMenuId,
      (action, options, instantiationService) => {
        if (!(action instanceof SubmenuItemAction)) {
          return void 0;
        }
        return instantiationService.createInstance(
          RunScriptActionViewItem,
          action,
          options,
          that._activeRunState,
          (session) => that._showConfigureQuickPick(session),
          (session, existingTask, mode) => that._showCustomCommandInput(session, existingTask, mode),
          (session) => that._generateNewTask(session),
          (session) => that._configureBrowserUrl(session)
        );
      }
    ));
  }
  _registerActions() {
    const that = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: RUN_SCRIPT_ACTION_PRIMARY_ID,
          title: { value: localize("runPrimaryTask", "Run Primary Task"), original: "Run Primary Task" },
          icon: Codicon.play,
          category: SessionsCategories.Sessions,
          f1: true
        });
      }
      async run() {
        const activeState = that._activeRunState.get();
        if (!activeState) {
          return;
        }
        logSessionsInteraction(that._telemetryService, "runPrimaryTask");
        const { tasks, session, pinnedBrowser, browserUrl } = activeState;
        if (pinnedBrowser) {
          await that._commandService.executeCommand("simpleBrowser.show", browserUrl);
          return;
        }
        if (tasks.length === 0) {
          const task = await that._showConfigureQuickPick(session);
          if (task) {
            await that._sessionsConfigService.runTask(task, session);
          }
          return;
        }
        const primaryTask = getPrimaryTask(tasks, activeState.pinnedTaskLabel);
        if (!primaryTask) {
          return;
        }
        await that._sessionsConfigService.runTask(primaryTask.task, session);
      }
    }));
    this._register(autorun((reader) => {
      const activeState = this._activeRunState.read(reader);
      if (!activeState) {
        return;
      }
      const { session, tasks } = activeState;
      const folder = session.workspace.read(reader)?.folders[0];
      const configureScriptPrecondition = folder?.workingDirectory ? ContextKeyExpr.true() : ContextKeyExpr.false();
      reader.store.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: CONFIGURE_DEFAULT_RUN_ACTION_ID,
            title: localize2("configureDefaultRunAction", "Add Task..."),
            category: SessionsCategories.Sessions,
            icon: Codicon.add,
            precondition: configureScriptPrecondition,
            menu: [{
              id: RunScriptDropdownMenuId,
              group: tasks.length === 0 ? "navigation" : "1_configure",
              order: 0
            }]
          });
        }
        async run() {
          logSessionsInteraction(that._telemetryService, "addTask", "menu");
          const task = await that._showConfigureQuickPick(session);
          if (task) {
            await that._sessionsConfigService.runTask(task, session);
          }
        }
      }));
      reader.store.add(registerAction2(class extends Action2 {
        constructor() {
          super({
            id: GENERATE_RUN_ACTION_ID,
            title: localize2("generateRunAction", "Generate New Task..."),
            category: SessionsCategories.Sessions,
            precondition: SessionWorkspaceIsVirtualContext.toNegated(),
            menu: [{
              id: RunScriptDropdownMenuId,
              group: tasks.length === 0 ? "navigation" : "1_configure",
              order: 1
            }]
          });
        }
        async run() {
          logSessionsInteraction(that._telemetryService, "generateNewTask", "menu");
          await that._generateNewTask(session);
        }
      }));
    }));
  }
  async _generateNewTask(session) {
    const query = "/generate-run-commands";
    const widget = this._chatWidgetService.getWidgetBySessionResource(session.mainChat.get().resource);
    if (widget) {
      await widget.acceptInput(query);
    } else {
      await this._sessionManagementService.sendNewChatRequest(session, { query });
    }
  }
  async _configureBrowserUrl(session) {
    const folder = session.workspace.get()?.folders[0];
    if (!folder?.root) {
      return;
    }
    const currentUrl = this._sessionsConfigService.getBrowserUrl(folder.root).get();
    const url = await this._quickInputService.input({
      title: localize("configureBrowserUrlTitle", "Configure Browser URL"),
      prompt: localize("configureBrowserUrlPrompt", "Enter the URL to open in the integrated browser. Leave empty to clear."),
      placeHolder: "https://example.com",
      value: currentUrl ?? "",
      ignoreFocusLost: true
    });
    if (url === void 0) {
      return;
    }
    this._sessionsConfigService.setBrowserUrl(folder.root, url);
  }
  async _showConfigureQuickPick(session) {
    const nonSessionTasks = await this._sessionsConfigService.getNonSessionTasks(session);
    if (nonSessionTasks.length === 0) {
      return this._showCustomCommandInput(session);
    }
    const items = [];
    items.push({ type: "separator", label: localize("custom", "Custom") });
    items.push({
      label: localize("createNewTask", "Create new task..."),
      description: localize("enterCustomCommandDesc", "Create a new shell task")
    });
    if (nonSessionTasks.length > 0) {
      items.push({ type: "separator", label: localize("existingTasks", "Existing Tasks") });
      for (const { task, target } of nonSessionTasks) {
        items.push({
          label: getTaskDisplayLabel(task),
          description: task.command,
          task,
          source: target
        });
      }
    }
    const picked = await this._quickInputService.pick(items, {
      placeHolder: localize("pickRunAction", "Select or create a task")
    });
    if (!picked) {
      return void 0;
    }
    const pickedItem = picked;
    if (pickedItem.task) {
      return this._showCustomCommandInput(session, { task: pickedItem.task, target: pickedItem.source ?? "workspace" }, "add", true);
    } else {
      return this._showCustomCommandInput(session, void 0, "add", true);
    }
  }
  async _showCustomCommandInput(session, existingTask, mode = "add", allowBackNavigation = false) {
    const taskConfiguration = await this._showCustomCommandWidget(session, existingTask, mode, allowBackNavigation);
    if (!taskConfiguration) {
      return void 0;
    }
    if (taskConfiguration === "back") {
      return this._showConfigureQuickPick(session);
    }
    if (existingTask) {
      if (mode === "configure") {
        const newLabel = taskConfiguration.label?.trim() || existingTask.task.label || taskConfiguration.command;
        let updatedTask = {
          ...existingTask.task,
          label: newLabel,
          inAgents: true
        };
        if (taskConfiguration.command && existingTask.task.command !== void 0) {
          updatedTask = {
            ...updatedTask,
            command: taskConfiguration.command
          };
        }
        if (taskConfiguration.runOn) {
          updatedTask = {
            ...updatedTask,
            runOptions: {
              ...existingTask.task.runOptions ?? {},
              runOn: taskConfiguration.runOn
            }
          };
        }
        await this._sessionsConfigService.updateTask(existingTask.task.label, updatedTask, session, existingTask.target, taskConfiguration.target);
        return updatedTask;
      }
      await this._sessionsConfigService.addTaskToSessions(existingTask.task, session, existingTask.target, { runOn: taskConfiguration.runOn ?? "default" });
      return {
        ...existingTask.task,
        inAgents: true,
        ...taskConfiguration.runOn ? { runOptions: { runOn: taskConfiguration.runOn } } : {}
      };
    }
    return this._sessionsConfigService.createAndAddTask(
      taskConfiguration.label,
      taskConfiguration.command,
      session,
      taskConfiguration.target,
      taskConfiguration.runOn ? { runOn: taskConfiguration.runOn } : void 0
    );
  }
  _showCustomCommandWidget(session, existingTask, mode = "add", allowBackNavigation = false) {
    const folder = session.workspace.get()?.folders[0];
    const workspaceTargetDisabledReason = !(folder?.workingDirectory ?? folder?.root) ? localize("workspaceStorageUnavailableTooltip", "Workspace storage is unavailable for this session") : void 0;
    const isConfigureMode = mode === "configure";
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let settled = false;
      const quickWidget = disposables.add(this._quickInputService.createQuickWidget());
      quickWidget.title = isConfigureMode ? localize("configureActionWidgetTitle", "Configure Task") : existingTask ? localize("addExistingActionWidgetTitle", "Add Existing Task") : localize("addActionWidgetTitle", "Add Task");
      quickWidget.description = isConfigureMode ? localize("configureActionWidgetDescription", "Update how this task is named, saved, and run.") : existingTask ? localize("addExistingActionWidgetDescription", "Enable an existing task for sessions and configure when it should run.") : localize("addActionWidgetDescription", "Create a shell task and configure how it should be saved and run.");
      quickWidget.ignoreFocusOut = true;
      quickWidget.buttons = allowBackNavigation ? [this._quickInputService.backButton, closeQuickWidgetButton] : [closeQuickWidgetButton];
      const widget = disposables.add(new RunScriptCustomTaskWidget({
        label: existingTask?.task.label,
        labelDisabledReason: existingTask && !isConfigureMode ? localize("existingTaskLabelLocked", "This name comes from an existing task and cannot be changed here.") : void 0,
        command: existingTask ? getTaskCommandPreview(existingTask.task) : void 0,
        commandDisabledReason: existingTask && !isConfigureMode ? localize("existingTaskCommandLocked", "This command comes from an existing task and cannot be changed here.") : void 0,
        target: existingTask?.target,
        targetDisabledReason: existingTask && !isConfigureMode ? localize("existingTaskTargetLocked", "This existing task cannot be moved between workspace and user storage.") : workspaceTargetDisabledReason,
        runOn: existingTask?.task.runOptions?.runOn === "worktreeCreated" ? "worktreeCreated" : void 0,
        mode: isConfigureMode ? "configure" : existingTask ? "add-existing" : "add"
      }));
      quickWidget.widget = widget.domNode;
      this._layoutService.mainContainer.classList.add(RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS);
      const backdrop = append(this._layoutService.mainContainer, $(".run-script-action-modal-backdrop"));
      disposables.add(addDisposableGenericMouseDownListener(backdrop, (e) => {
        e.preventDefault();
        e.stopPropagation();
        complete(void 0);
      }));
      disposables.add({ dispose: () => backdrop.remove() });
      disposables.add({ dispose: () => this._layoutService.mainContainer.classList.remove(RUN_SCRIPT_ACTION_MODAL_VISIBLE_CLASS) });
      const complete = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
        quickWidget.hide();
      };
      disposables.add(widget.onDidSubmit((result) => complete(result)));
      disposables.add(widget.onDidCancel(() => complete(void 0)));
      disposables.add(quickWidget.onDidTriggerButton((button) => {
        if (allowBackNavigation && button === this._quickInputService.backButton) {
          settled = true;
          resolve("back");
          quickWidget.hide();
          return;
        }
        if (button === closeQuickWidgetButton) {
          complete(void 0);
        }
      }));
      disposables.add(quickWidget.onDidHide(() => {
        if (!settled) {
          settled = true;
          resolve(void 0);
        }
        disposables.dispose();
      }));
      quickWidget.show();
      widget.focus();
    });
  }
};
RunScriptContribution.ID = "workbench.contrib.agentSessions.runScript";
RunScriptContribution = __decorateClass([
  __decorateParam(0, ISessionsManagementService),
  __decorateParam(1, ISessionsService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, ISessionsTasksService),
  __decorateParam(5, IActionViewItemService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IChatWidgetService),
  __decorateParam(9, ICommandService)
], RunScriptContribution);
let RunScriptActionViewItem = class extends BaseActionViewItem {
  constructor(action, _options, _activeRunState, _showConfigureQuickPick, _showCustomCommandInput, _generateNewTask, _configureBrowserUrl, _commandService, _sessionsConfigService, _keybindingService, _actionWidgetService, contextKeyService, _telemetryService) {
    super(void 0, action);
    this._activeRunState = _activeRunState;
    this._showConfigureQuickPick = _showConfigureQuickPick;
    this._showCustomCommandInput = _showCustomCommandInput;
    this._generateNewTask = _generateNewTask;
    this._configureBrowserUrl = _configureBrowserUrl;
    this._commandService = _commandService;
    this._sessionsConfigService = _sessionsConfigService;
    this._keybindingService = _keybindingService;
    this._actionWidgetService = _actionWidgetService;
    this._telemetryService = _telemetryService;
    const state = this._activeRunState.get();
    const isPrimaryEnabled = !!state && (state.tasks.length > 0 || state.pinnedBrowser);
    this._primaryActionAction = this._register(new Action(
      "agentSessions.runScriptPrimary",
      this._getPrimaryActionTooltip(state),
      ThemeIcon.asClassName(Codicon.play),
      isPrimaryEnabled,
      () => this._commandService.executeCommand(RUN_SCRIPT_ACTION_PRIMARY_ID)
    ));
    this._primaryAction = this._register(new ActionViewItem(void 0, this._primaryActionAction, { icon: true, label: false }));
    this._register(autorun((reader) => {
      const runState = this._activeRunState.read(reader);
      this._primaryActionAction.enabled = !!runState && (runState.tasks.length > 0 || runState.pinnedBrowser);
      this._primaryActionAction.label = this._getPrimaryActionTooltip(runState);
    }));
    const dropdownAction = this._register(new Action("agentSessions.runScriptDropdown", localize("runDropdown", "More Tasks...")));
    this._dropdown = this._register(new ChevronActionWidgetDropdown(
      dropdownAction,
      {
        actionProvider: { getActions: () => this._getDropdownActions() },
        showItemKeybindings: true,
        listOptions: { className: "compact-icons" }
      },
      this._actionWidgetService,
      this._keybindingService,
      contextKeyService,
      this._telemetryService
    ));
  }
  render(container) {
    super.render(container);
    container.classList.add("monaco-dropdown-with-default");
    const primaryContainer = $(".action-container");
    this._primaryAction.render(append(container, primaryContainer));
    this._register(addDisposableListener(primaryContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.RightArrow)) {
        this._primaryAction.blur();
        this._dropdown.focus();
        event.stopPropagation();
      }
    }));
    const dropdownContainer = $(".dropdown-action-container");
    this._dropdown.render(append(container, dropdownContainer));
    this._register(addDisposableListener(dropdownContainer, EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.LeftArrow)) {
        this._dropdown.setFocusable(false);
        this._primaryAction.focus();
        event.stopPropagation();
      }
    }));
  }
  focus(fromRight) {
    if (fromRight) {
      this._dropdown.focus();
    } else {
      this._primaryAction.focus();
    }
  }
  blur() {
    this._primaryAction.blur();
    this._dropdown.blur();
  }
  setFocusable(focusable) {
    this._primaryAction.setFocusable(focusable);
    if (!focusable) {
      this._dropdown.setFocusable(false);
    }
  }
  _getPrimaryActionTooltip(state) {
    const keybindingLabel = this._keybindingService.lookupKeybinding(RUN_SCRIPT_ACTION_PRIMARY_ID)?.getLabel();
    const withKeybinding = (label) => keybindingLabel ? localize("runActionTooltipKeybinding", "{0} ({1})", label, keybindingLabel) : label;
    if (state?.pinnedBrowser) {
      return withKeybinding(localize("openBrowserAction", "Open Browser"));
    }
    if (!state || state.tasks.length === 0) {
      return localize("runPrimaryTaskTooltip", "Run Primary Task");
    }
    const primaryTask = getPrimaryTask(state.tasks, state.pinnedTaskLabel)?.task;
    if (!primaryTask) {
      return localize("runPrimaryTaskTooltip", "Run Primary Task");
    }
    return withKeybinding(getTaskDisplayLabel(primaryTask));
  }
  _getDropdownActions() {
    const state = this._activeRunState.get();
    if (!state) {
      return [];
    }
    const { tasks, session, pinnedTaskLabel } = state;
    const folder = session.workspace.get()?.folders[0];
    const actions = [];
    const defaultCategory = { label: "", order: 0, showHeader: false };
    const worktreeCategory = { label: localize("worktreeCreationCategory", "Run on Worktree Creation"), order: 1, showHeader: true };
    const tasksCategory = { label: localize("tasksActionsCategory", "Tasks"), order: 2, showHeader: true };
    for (let i = 0; i < tasks.length; i++) {
      const entry = tasks[i];
      const task = entry.task;
      const isWorktreeTask = task.runOptions?.runOn === "worktreeCreated";
      const isPinned = task.label === pinnedTaskLabel;
      const toolbarActions = [
        {
          id: `runScript.pin.${i}`,
          label: isPinned ? localize("unpinTask", "Unpin") : localize("pinTask", "Pin"),
          tooltip: isPinned ? localize("unpinTaskTooltip", "Unpin") : localize("pinTaskTooltip", "Pin"),
          class: ThemeIcon.asClassName(isPinned ? Codicon.pinned : Codicon.pin),
          enabled: !!folder?.root,
          run: async () => {
            this._actionWidgetService.hide();
            this._sessionsConfigService.setPinnedTaskLabel(folder?.root, isPinned ? void 0 : task.label);
          }
        },
        {
          id: `runScript.configure.${i}`,
          label: localize("configureTask", "Configure"),
          tooltip: localize("configureTask", "Configure"),
          class: ThemeIcon.asClassName(Codicon.gear),
          enabled: true,
          run: async () => {
            this._actionWidgetService.hide();
            await this._showCustomCommandInput(session, { task, target: entry.target }, "configure");
          }
        },
        {
          id: `runScript.remove.${i}`,
          label: localize("removeTask", "Remove"),
          tooltip: localize("removeTask", "Remove"),
          class: ThemeIcon.asClassName(Codicon.close),
          enabled: true,
          run: async () => {
            this._actionWidgetService.hide();
            await this._sessionsConfigService.removeTask(task.label, session, entry.target);
          }
        }
      ];
      actions.push({
        id: `runScript.task.${i}`,
        label: getTaskDisplayLabel(task),
        tooltip: "",
        hover: {
          content: localize("runActionTooltip", "Run '{0}' in terminal", getTaskDisplayLabel(task))
        },
        icon: Codicon.runCompact,
        enabled: true,
        class: void 0,
        category: isWorktreeTask ? worktreeCategory : defaultCategory,
        toolbarActions,
        run: async () => {
          await this._sessionsConfigService.runTask(task, session);
        }
      });
    }
    const canConfigure = !!(folder?.workingDirectory ?? folder?.root);
    actions.push({
      id: "runScript.addAction",
      label: localize("configureDefaultRunAction", "Add Task..."),
      tooltip: "",
      hover: {
        content: canConfigure ? localize("addActionTooltip", "Add a new task") : localize("addActionTooltipDisabled", "Cannot add tasks to this session because workspace storage is unavailable")
      },
      icon: Codicon.addCompact,
      enabled: canConfigure,
      class: void 0,
      category: tasksCategory,
      run: async () => {
        logSessionsInteraction(this._telemetryService, "addTask", "actionWidget");
        const task = await this._showConfigureQuickPick(session);
        if (task) {
          await this._sessionsConfigService.runTask(task, session);
        }
      }
    });
    actions.push({
      id: "runScript.generateAction",
      label: localize("generateRunAction", "Generate New Task..."),
      tooltip: "",
      hover: {
        content: localize("generateRunActionTooltip", "Generate a new workspace task")
      },
      icon: Codicon.sparkleCompact,
      enabled: true,
      class: void 0,
      category: tasksCategory,
      run: async () => {
        logSessionsInteraction(this._telemetryService, "generateNewTask", "actionWidget");
        await this._generateNewTask(session);
      }
    });
    const browserCategory = { label: localize("browserActionsCategory", "Browser"), order: 3, showHeader: true };
    const browserUrl = state.browserUrl;
    const browserUrlDescription = formatBrowserUrlDescription(browserUrl, 20);
    const canConfigureBrowser = !!folder?.root;
    const isBrowserPinned = state.pinnedBrowser;
    actions.push({
      id: "runScript.openBrowser",
      label: localize("openBrowserAction", "Open Browser"),
      tooltip: "",
      description: browserUrlDescription,
      hover: {
        content: browserUrl ? localize("openBrowserActionTooltip", "Open '{0}' in the integrated browser", browserUrl) : localize("openBrowserActionTooltipUnconfigured", "Open the integrated browser")
      },
      icon: Codicon.windowCompact,
      enabled: true,
      class: void 0,
      category: browserCategory,
      toolbarActions: [
        {
          id: "runScript.pinBrowser",
          label: isBrowserPinned ? localize("unpinBrowser", "Unpin") : localize("pinBrowser", "Pin"),
          tooltip: isBrowserPinned ? localize("unpinBrowserTooltip", "Unpin") : localize("pinBrowserTooltip", "Pin"),
          class: ThemeIcon.asClassName(isBrowserPinned ? Codicon.pinned : Codicon.pin),
          enabled: !!folder?.root,
          run: async () => {
            this._actionWidgetService.hide();
            this._sessionsConfigService.setPinnedBrowser(folder?.root, !isBrowserPinned);
          }
        },
        {
          id: "runScript.configureBrowser",
          label: localize("configureBrowserUrl", "Configure URL"),
          tooltip: localize("configureBrowserUrl", "Configure URL"),
          class: ThemeIcon.asClassName(Codicon.gear),
          enabled: canConfigureBrowser,
          run: async () => {
            this._actionWidgetService.hide();
            await this._configureBrowserUrl(session);
          }
        }
      ],
      run: async () => {
        await this._commandService.executeCommand("simpleBrowser.show", browserUrl);
      }
    });
    return actions;
  }
};
RunScriptActionViewItem = __decorateClass([
  __decorateParam(7, ICommandService),
  __decorateParam(8, ISessionsTasksService),
  __decorateParam(9, IKeybindingService),
  __decorateParam(10, IActionWidgetService),
  __decorateParam(11, IContextKeyService),
  __decorateParam(12, ITelemetryService)
], RunScriptActionViewItem);
class ChevronActionWidgetDropdown extends ActionWidgetDropdownActionViewItem {
  renderLabel(element) {
    element.classList.add("codicon", "codicon-chevron-down");
    return null;
  }
}
MenuRegistry.appendMenuItem(Menus.TitleBarCenterRight, {
  submenu: RunScriptDropdownMenuId,
  isSplitButton: true,
  title: localize2("run", "Run"),
  icon: Codicon.play,
  group: "navigation",
  order: 6,
  when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionWorkspaceIsVirtualContext.toNegated())
});
class RunScriptNotAvailableAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.agentSessions.runScript.notAvailable",
      title: localize2("run", "Run"),
      tooltip: localize("runScriptNotAvailableTooltip", "Run Task is not available for this session type"),
      icon: Codicon.play,
      precondition: ContextKeyExpr.false(),
      menu: [{
        id: Menus.TitleBarCenterRight,
        group: "navigation",
        order: 6,
        when: ContextKeyExpr.and(IsAuxiliaryWindowContext.toNegated(), SessionsWelcomeVisibleContext.toNegated(), SessionWorkspaceIsVirtualContext)
      }]
    });
  }
  run() {
  }
}
registerAction2(RunScriptNotAvailableAction);
KeybindingsRegistry.registerKeybindingRule({
  id: RUN_SCRIPT_ACTION_PRIMARY_ID,
  primary: KeyCode.F5,
  weight: KeybindingWeight.WorkbenchContrib + 100,
  when: IsAuxiliaryWindowContext.toNegated()
});
export {
  RunScriptContribution,
  RunScriptDropdownMenuId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3J1blNjcmlwdEFjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVHZW5lcmljTW91c2VEb3duTGlzdGVuZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEFjdGlvblZpZXdJdGVtLCBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24sIElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIEFjdGlvbjIsIE1lbnVSZWdpc3RyeSwgU3VibWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldERyb3Bkb3duLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0QnV0dG9uLCBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgbG9nU2Vzc2lvbnNJbnRlcmFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25zQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbldvcmtzcGFjZUlzVmlydHVhbENvbnRleHQsIFNlc3Npb25zV2VsY29tZVZpc2libGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IElOb25TZXNzaW9uVGFza0VudHJ5LCBJU2Vzc2lvbnNUYXNrc1NlcnZpY2UsIElTZXNzaW9uVGFza1dpdGhUYXJnZXQsIElUYXNrRW50cnksIFRhc2tTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi9zZXNzaW9uc1Rhc2tzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElSdW5TY3JpcHRDdXN0b21UYXNrV2lkZ2V0UmVzdWx0LCBSdW5TY3JpcHRDdXN0b21UYXNrV2lkZ2V0IH0gZnJvbSAnLi9ydW5TY3JpcHRDdXN0b21UYXNrV2lkZ2V0LmpzJztcblxuXG4vLyBNZW51IElEcyAtIGV4cG9ydGVkIGZvciB1c2UgaW4gYXV4aWxpYXJ5IGJhciBwYXJ0XG5leHBvcnQgY29uc3QgUnVuU2NyaXB0RHJvcGRvd25NZW51SWQgPSBNZW51SWQuZm9yKCdBZ2VudFNlc3Npb25zUnVuU2NyaXB0RHJvcGRvd24nKTtcbmNvbnN0IFJVTl9TQ1JJUFRfQUNUSU9OX01PREFMX1ZJU0lCTEVfQ0xBU1MgPSAncnVuLXNjcmlwdC1hY3Rpb24tbW9kYWwtdmlzaWJsZSc7XG5cbi8vIEFjdGlvbiBJRHNcbmNvbnN0IFJVTl9TQ1JJUFRfQUNUSU9OX1BSSU1BUllfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5hZ2VudFNlc3Npb25zLnJ1blNjcmlwdFByaW1hcnknO1xuY29uc3QgQ09ORklHVVJFX0RFRkFVTFRfUlVOX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMuY29uZmlndXJlRGVmYXVsdFJ1bkFjdGlvbic7XG5jb25zdCBHRU5FUkFURV9SVU5fQUNUSU9OX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uYWdlbnRTZXNzaW9ucy5nZW5lcmF0ZVJ1bkFjdGlvbic7XG5jb25zdCBjbG9zZVF1aWNrV2lkZ2V0QnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdHRvb2x0aXA6IGxvY2FsaXplKCdjbG9zZVF1aWNrV2lkZ2V0JywgXCJDbG9zZVwiKSxcblx0YWx3YXlzVmlzaWJsZTogdHJ1ZSxcbn07XG5cbmZ1bmN0aW9uIGdldFRhc2tEaXNwbGF5TGFiZWwodGFzazogSVRhc2tFbnRyeSk6IHN0cmluZyB7XG5cdGlmICh0YXNrLmxhYmVsICYmIHRhc2subGFiZWwubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB0YXNrLmxhYmVsO1xuXHR9XG5cdGlmICh0YXNrLnNjcmlwdCAmJiB0YXNrLnNjcmlwdC5sZW5ndGggPiAwKSB7XG5cdFx0cmV0dXJuIHRhc2suc2NyaXB0O1xuXHR9XG5cdGlmICh0YXNrLmNvbW1hbmQgJiYgdGFzay5jb21tYW5kLmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gdGFzay5jb21tYW5kO1xuXHR9XG5cdGlmICh0YXNrLnRhc2sgJiYgdGFzay50YXNrLnRvU3RyaW5nKCkubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB0YXNrLnRhc2sudG9TdHJpbmcoKTtcblx0fVxuXHRyZXR1cm4gJyc7XG59XG5cbmZ1bmN0aW9uIGdldFRhc2tDb21tYW5kUHJldmlldyh0YXNrOiBJVGFza0VudHJ5KTogc3RyaW5nIHtcblx0aWYgKHRhc2suY29tbWFuZCAmJiB0YXNrLmNvbW1hbmQubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB0YXNrLmNvbW1hbmQ7XG5cdH1cblx0aWYgKHRhc2suc2NyaXB0ICYmIHRhc2suc2NyaXB0Lmxlbmd0aCA+IDApIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ25wbVRhc2tDb21tYW5kUHJldmlldycsIFwibnBtIHJ1biB7MH1cIiwgdGFzay5zY3JpcHQpO1xuXHR9XG5cdGlmICh0YXNrLnRhc2sgJiYgdGFzay50YXNrLnRvU3RyaW5nKCkubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB0YXNrLnRhc2sudG9TdHJpbmcoKTtcblx0fVxuXHRyZXR1cm4gZ2V0VGFza0Rpc3BsYXlMYWJlbCh0YXNrKTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0QnJvd3NlclVybERlc2NyaXB0aW9uKHVybDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtYXhMZW5ndGg6IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghdXJsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdHJpcHBlZCA9IHVybC5yZXBsYWNlKC9eaHR0cHM/OlxcL1xcLy9pLCAnJykucmVwbGFjZSgvXnd3d1xcLi9pLCAnJyk7XG5cdGlmIChzdHJpcHBlZC5sZW5ndGggPD0gbWF4TGVuZ3RoKSB7XG5cdFx0cmV0dXJuIHN0cmlwcGVkO1xuXHR9XG5cdHJldHVybiBgJHtzdHJpcHBlZC5zdWJzdHJpbmcoMCwgbWF4TGVuZ3RoIC0gMyl9Li4uYDtcbn1cblxuZnVuY3Rpb24gZ2V0UHJpbWFyeVRhc2sodGFza3M6IHJlYWRvbmx5IElTZXNzaW9uVGFza1dpdGhUYXJnZXRbXSwgcGlubmVkVGFza0xhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0IHwgdW5kZWZpbmVkIHtcblx0aWYgKHRhc2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRpZiAocGlubmVkVGFza0xhYmVsKSB7XG5cdFx0Y29uc3QgcGlubmVkVGFzayA9IHRhc2tzLmZpbmQodGFzayA9PiB0YXNrLnRhc2subGFiZWwgPT09IHBpbm5lZFRhc2tMYWJlbCk7XG5cdFx0aWYgKHBpbm5lZFRhc2spIHtcblx0XHRcdHJldHVybiBwaW5uZWRUYXNrO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB0YXNrc1swXTtcbn1cblxuaW50ZXJmYWNlIElSdW5TY3JpcHRBY3Rpb25Db250ZXh0IHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogSVNlc3Npb247XG5cdHJlYWRvbmx5IHRhc2tzOiByZWFkb25seSBJU2Vzc2lvblRhc2tXaXRoVGFyZ2V0W107XG5cdHJlYWRvbmx5IHBpbm5lZFRhc2tMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBicm93c2VyVXJsOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHBpbm5lZEJyb3dzZXI6IGJvb2xlYW47XG59XG5cbnR5cGUgVGFza0NvbmZpZ3VyYXRpb25Nb2RlID0gJ2FkZCcgfCAnY29uZmlndXJlJztcblxuLyoqXG4gKiBXb3JrYmVuY2ggY29udHJpYnV0aW9uIHRoYXQgYWRkcyBhIHNwbGl0IGRyb3Bkb3duIGFjdGlvbiB0byB0aGUgYXV4aWxpYXJ5IGJhciB0aXRsZVxuICogZm9yIHJ1bm5pbmcgYSB0YXNrIHZpYSB0YXNrcy5qc29uLlxuICovXG5leHBvcnQgY2xhc3MgUnVuU2NyaXB0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5hZ2VudFNlc3Npb25zLnJ1blNjcmlwdCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUnVuU3RhdGU6IElPYnNlcnZhYmxlPElSdW5TY3JpcHRBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Rhc2tzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc0NvbmZpZ1NlcnZpY2U6IElTZXNzaW9uc1Rhc2tzU2VydmljZSxcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fYWN0aXZlUnVuU3RhdGUgPSBkZXJpdmVkT3B0czxJUnVuU2NyaXB0QWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZD4oe1xuXHRcdFx0b3duZXI6IHRoaXMsXG5cdFx0XHRlcXVhbHNGbjogKGEsIGIpID0+IHtcblx0XHRcdFx0aWYgKGEgPT09IGIpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdFx0aWYgKCFhIHx8ICFiKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0XHRyZXR1cm4gYS5zZXNzaW9uID09PSBiLnNlc3Npb25cblx0XHRcdFx0XHQmJiBhLnBpbm5lZFRhc2tMYWJlbCA9PT0gYi5waW5uZWRUYXNrTGFiZWxcblx0XHRcdFx0XHQmJiBhLmJyb3dzZXJVcmwgPT09IGIuYnJvd3NlclVybFxuXHRcdFx0XHRcdCYmIGEucGlubmVkQnJvd3NlciA9PT0gYi5waW5uZWRCcm93c2VyXG5cdFx0XHRcdFx0JiYgZXF1YWxzKGEudGFza3MsIGIudGFza3MsICh0MSwgdDIpID0+XG5cdFx0XHRcdFx0XHR0MS50YXNrLmxhYmVsID09PSB0Mi50YXNrLmxhYmVsXG5cdFx0XHRcdFx0XHQmJiB0MS50YXNrLmNvbW1hbmQgPT09IHQyLnRhc2suY29tbWFuZFxuXHRcdFx0XHRcdFx0JiYgdDEudGFyZ2V0ID09PSB0Mi50YXJnZXRcblx0XHRcdFx0XHRcdCYmIHQxLnRhc2sucnVuT3B0aW9ucz8ucnVuT24gPT09IHQyLnRhc2sucnVuT3B0aW9ucz8ucnVuT24pO1xuXHRcdFx0fVxuXHRcdH0sIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRhc2tzID0gdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLmdldFNlc3Npb25UYXNrcyhhY3RpdmVTZXNzaW9uKS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBmb2xkZXIgPSBhY3RpdmVTZXNzaW9uLndvcmtzcGFjZS5yZWFkKHJlYWRlcik/LmZvbGRlcnNbMF07XG5cdFx0XHRjb25zdCBwaW5uZWRUYXNrTGFiZWwgPSB0aGlzLl9zZXNzaW9uc0NvbmZpZ1NlcnZpY2UuZ2V0UGlubmVkVGFza0xhYmVsKGZvbGRlcj8ucm9vdCkucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYnJvd3NlclVybCA9IHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5nZXRCcm93c2VyVXJsKGZvbGRlcj8ucm9vdCkucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcGlubmVkQnJvd3NlciA9IHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5nZXRQaW5uZWRCcm93c2VyKGZvbGRlcj8ucm9vdCkucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogYWN0aXZlU2Vzc2lvbiwgdGFza3MsIHBpbm5lZFRhc2tMYWJlbCwgYnJvd3NlclVybCwgcGlubmVkQnJvd3NlciB9O1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyQWN0aW9uVmlld0l0ZW1Qcm92aWRlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyQWN0aW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBY3Rpb25WaWV3SXRlbVByb3ZpZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2FjdGlvblZpZXdJdGVtU2VydmljZS5yZWdpc3Rlcihcblx0XHRcdE1lbnVzLlRpdGxlQmFyQ2VudGVyUmlnaHQsXG5cdFx0XHRSdW5TY3JpcHREcm9wZG93bk1lbnVJZCxcblx0XHRcdChhY3Rpb24sIG9wdGlvbnMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKSA9PiB7XG5cdFx0XHRcdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIFN1Ym1lbnVJdGVtQWN0aW9uKSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFJ1blNjcmlwdEFjdGlvblZpZXdJdGVtLFxuXHRcdFx0XHRcdGFjdGlvbixcblx0XHRcdFx0XHRvcHRpb25zLFxuXHRcdFx0XHRcdHRoYXQuX2FjdGl2ZVJ1blN0YXRlLFxuXHRcdFx0XHRcdChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gdGhhdC5fc2hvd0NvbmZpZ3VyZVF1aWNrUGljayhzZXNzaW9uKSxcblx0XHRcdFx0XHQoc2Vzc2lvbjogSVNlc3Npb24sIGV4aXN0aW5nVGFzazogSU5vblNlc3Npb25UYXNrRW50cnksIG1vZGU/OiBUYXNrQ29uZmlndXJhdGlvbk1vZGUpID0+IHRoYXQuX3Nob3dDdXN0b21Db21tYW5kSW5wdXQoc2Vzc2lvbiwgZXhpc3RpbmdUYXNrLCBtb2RlKSxcblx0XHRcdFx0XHQoc2Vzc2lvbjogSVNlc3Npb24pID0+IHRoYXQuX2dlbmVyYXRlTmV3VGFzayhzZXNzaW9uKSxcblx0XHRcdFx0XHQoc2Vzc2lvbjogSVNlc3Npb24pID0+IHRoYXQuX2NvbmZpZ3VyZUJyb3dzZXJVcmwoc2Vzc2lvbiksXG5cdFx0XHRcdCk7XG5cdFx0XHR9LFxuXHRcdCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBY3Rpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBSVU5fU0NSSVBUX0FDVElPTl9QUklNQVJZX0lELFxuXHRcdFx0XHRcdHRpdGxlOiB7IHZhbHVlOiBsb2NhbGl6ZSgncnVuUHJpbWFyeVRhc2snLCAnUnVuIFByaW1hcnkgVGFzaycpLCBvcmlnaW5hbDogJ1J1biBQcmltYXJ5IFRhc2snIH0sXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5wbGF5LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVN0YXRlID0gdGhhdC5fYWN0aXZlUnVuU3RhdGUuZ2V0KCk7XG5cdFx0XHRcdGlmICghYWN0aXZlU3RhdGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsb2dTZXNzaW9uc0ludGVyYWN0aW9uKHRoYXQuX3RlbGVtZXRyeVNlcnZpY2UsICdydW5QcmltYXJ5VGFzaycpO1xuXG5cdFx0XHRcdGNvbnN0IHsgdGFza3MsIHNlc3Npb24sIHBpbm5lZEJyb3dzZXIsIGJyb3dzZXJVcmwgfSA9IGFjdGl2ZVN0YXRlO1xuXHRcdFx0XHRpZiAocGlubmVkQnJvd3Nlcikge1xuXHRcdFx0XHRcdGF3YWl0IHRoYXQuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdzaW1wbGVCcm93c2VyLnNob3cnLCBicm93c2VyVXJsKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGFza3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGFzayA9IGF3YWl0IHRoYXQuX3Nob3dDb25maWd1cmVRdWlja1BpY2soc2Vzc2lvbik7XG5cdFx0XHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5ydW5UYXNrKHRhc2ssIHNlc3Npb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwcmltYXJ5VGFzayA9IGdldFByaW1hcnlUYXNrKHRhc2tzLCBhY3RpdmVTdGF0ZS5waW5uZWRUYXNrTGFiZWwpO1xuXHRcdFx0XHRpZiAoIXByaW1hcnlUYXNrKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoYXQuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5ydW5UYXNrKHByaW1hcnlUYXNrLnRhc2ssIHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZVN0YXRlID0gdGhpcy5fYWN0aXZlUnVuU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFhY3RpdmVTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgdGFza3MgfSA9IGFjdGl2ZVN0YXRlO1xuXHRcdFx0Y29uc3QgZm9sZGVyID0gc2Vzc2lvbi53b3Jrc3BhY2UucmVhZChyZWFkZXIpPy5mb2xkZXJzWzBdO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlU2NyaXB0UHJlY29uZGl0aW9uID0gZm9sZGVyPy53b3JraW5nRGlyZWN0b3J5ID8gQ29udGV4dEtleUV4cHIudHJ1ZSgpIDogQ29udGV4dEtleUV4cHIuZmFsc2UoKTtcblxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IENPTkZJR1VSRV9ERUZBVUxUX1JVTl9BQ1RJT05fSUQsXG5cdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjb25maWd1cmVEZWZhdWx0UnVuQWN0aW9uJywgXCJBZGQgVGFzay4uLlwiKSxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmFkZCxcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogY29uZmlndXJlU2NyaXB0UHJlY29uZGl0aW9uLFxuXHRcdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdFx0aWQ6IFJ1blNjcmlwdERyb3Bkb3duTWVudUlkLFxuXHRcdFx0XHRcdFx0XHRncm91cDogdGFza3MubGVuZ3RoID09PSAwID8gJ25hdmlnYXRpb24nIDogJzFfY29uZmlndXJlJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDBcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0bG9nU2Vzc2lvbnNJbnRlcmFjdGlvbih0aGF0Ll90ZWxlbWV0cnlTZXJ2aWNlLCAnYWRkVGFzaycsICdtZW51Jyk7XG5cdFx0XHRcdFx0Y29uc3QgdGFzayA9IGF3YWl0IHRoYXQuX3Nob3dDb25maWd1cmVRdWlja1BpY2soc2Vzc2lvbik7XG5cdFx0XHRcdFx0aWYgKHRhc2spIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoYXQuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5ydW5UYXNrKHRhc2ssIHNlc3Npb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0XHRpZDogR0VORVJBVEVfUlVOX0FDVElPTl9JRCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2dlbmVyYXRlUnVuQWN0aW9uJywgXCJHZW5lcmF0ZSBOZXcgVGFzay4uLlwiKSxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBTZXNzaW9uc0NhdGVnb3JpZXMuU2Vzc2lvbnMsXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IFNlc3Npb25Xb3Jrc3BhY2VJc1ZpcnR1YWxDb250ZXh0LnRvTmVnYXRlZCgpLFxuXHRcdFx0XHRcdFx0bWVudTogW3tcblx0XHRcdFx0XHRcdFx0aWQ6IFJ1blNjcmlwdERyb3Bkb3duTWVudUlkLFxuXHRcdFx0XHRcdFx0XHRncm91cDogdGFza3MubGVuZ3RoID09PSAwID8gJ25hdmlnYXRpb24nIDogJzFfY29uZmlndXJlJyxcblx0XHRcdFx0XHRcdFx0b3JkZXI6IDFcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0bG9nU2Vzc2lvbnNJbnRlcmFjdGlvbih0aGF0Ll90ZWxlbWV0cnlTZXJ2aWNlLCAnZ2VuZXJhdGVOZXdUYXNrJywgJ21lbnUnKTtcblx0XHRcdFx0XHRhd2FpdCB0aGF0Ll9nZW5lcmF0ZU5ld1Rhc2soc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZW5lcmF0ZU5ld1Rhc2soc2Vzc2lvbjogSVNlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWVyeSA9ICcvZ2VuZXJhdGUtcnVuLWNvbW1hbmRzJztcblx0XHQvLyBQcmVmZXIgc2VuZGluZyB0byB0aGUgYWxyZWFkeS1vcGVuIGNoYXQgd2lkZ2V0IGZvciB0aGUgc2Vzc2lvbjtcblx0XHQvLyBmYWxsIGJhY2sgdG8gc2VuZFJlcXVlc3QgZm9yIHVudGl0bGVkIHNlc3Npb25zIG9yIHdoZW4gbm8gd2lkZ2V0IGlzIGxvYWRlZC5cblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShzZXNzaW9uLm1haW5DaGF0LmdldCgpLnJlc291cmNlKTtcblx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRhd2FpdCB3aWRnZXQuYWNjZXB0SW5wdXQocXVlcnkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uTWFuYWdlbWVudFNlcnZpY2Uuc2VuZE5ld0NoYXRSZXF1ZXN0KHNlc3Npb24sIHsgcXVlcnkgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29uZmlndXJlQnJvd3NlclVybChzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZvbGRlciA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdO1xuXHRcdGlmICghZm9sZGVyPy5yb290KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGN1cnJlbnRVcmwgPSB0aGlzLl9zZXNzaW9uc0NvbmZpZ1NlcnZpY2UuZ2V0QnJvd3NlclVybChmb2xkZXIucm9vdCkuZ2V0KCk7XG5cdFx0Y29uc3QgdXJsID0gYXdhaXQgdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjb25maWd1cmVCcm93c2VyVXJsVGl0bGUnLCBcIkNvbmZpZ3VyZSBCcm93c2VyIFVSTFwiKSxcblx0XHRcdHByb21wdDogbG9jYWxpemUoJ2NvbmZpZ3VyZUJyb3dzZXJVcmxQcm9tcHQnLCBcIkVudGVyIHRoZSBVUkwgdG8gb3BlbiBpbiB0aGUgaW50ZWdyYXRlZCBicm93c2VyLiBMZWF2ZSBlbXB0eSB0byBjbGVhci5cIiksXG5cdFx0XHRwbGFjZUhvbGRlcjogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0dmFsdWU6IGN1cnJlbnRVcmwgPz8gJycsXG5cdFx0XHRpZ25vcmVGb2N1c0xvc3Q6IHRydWUsXG5cdFx0fSk7XG5cdFx0aWYgKHVybCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5zZXRCcm93c2VyVXJsKGZvbGRlci5yb290LCB1cmwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2hvd0NvbmZpZ3VyZVF1aWNrUGljayhzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8SVRhc2tFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG5vblNlc3Npb25UYXNrcyA9IGF3YWl0IHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5nZXROb25TZXNzaW9uVGFza3Moc2Vzc2lvbik7XG5cdFx0aWYgKG5vblNlc3Npb25UYXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIE5vIGV4aXN0aW5nIHRhc2tzLCBnbyBzdHJhaWdodCB0byBjdXN0b20gY29tbWFuZCBpbnB1dFxuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3dDdXN0b21Db21tYW5kSW5wdXQoc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0aW50ZXJmYWNlIElUYXNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdFx0XHRyZWFkb25seSB0YXNrPzogSVRhc2tFbnRyeTtcblx0XHRcdHJlYWRvbmx5IHNvdXJjZT86IFRhc2tTdG9yYWdlVGFyZ2V0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW1zOiAoSVRhc2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10gPSBbXTtcblxuXHRcdGl0ZW1zLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdjdXN0b20nLCBcIkN1c3RvbVwiKSB9KTtcblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY3JlYXRlTmV3VGFzaycsIFwiQ3JlYXRlIG5ldyB0YXNrLi4uXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdlbnRlckN1c3RvbUNvbW1hbmREZXNjJywgXCJDcmVhdGUgYSBuZXcgc2hlbGwgdGFza1wiKSxcblx0XHR9KTtcblxuXHRcdGlmIChub25TZXNzaW9uVGFza3MubGVuZ3RoID4gMCkge1xuXHRcdFx0aXRlbXMucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ2V4aXN0aW5nVGFza3MnLCBcIkV4aXN0aW5nIFRhc2tzXCIpIH0pO1xuXHRcdFx0Zm9yIChjb25zdCB7IHRhc2ssIHRhcmdldCB9IG9mIG5vblNlc3Npb25UYXNrcykge1xuXHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogZ2V0VGFza0Rpc3BsYXlMYWJlbCh0YXNrKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogdGFzay5jb21tYW5kLFxuXHRcdFx0XHRcdHRhc2ssXG5cdFx0XHRcdFx0c291cmNlOiB0YXJnZXQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBpY2tlZCA9IGF3YWl0IHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMsIHtcblx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgncGlja1J1bkFjdGlvbicsIFwiU2VsZWN0IG9yIGNyZWF0ZSBhIHRhc2tcIiksXG5cdFx0fSk7XG5cblx0XHRpZiAoIXBpY2tlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrZWRJdGVtID0gcGlja2VkIGFzIElUYXNrUGlja0l0ZW07XG5cdFx0aWYgKHBpY2tlZEl0ZW0udGFzaykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3dDdXN0b21Db21tYW5kSW5wdXQoc2Vzc2lvbiwgeyB0YXNrOiBwaWNrZWRJdGVtLnRhc2ssIHRhcmdldDogcGlja2VkSXRlbS5zb3VyY2UgPz8gJ3dvcmtzcGFjZScgfSwgJ2FkZCcsIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBDdXN0b20gY29tbWFuZCBwYXRoXG5cdFx0XHRyZXR1cm4gdGhpcy5fc2hvd0N1c3RvbUNvbW1hbmRJbnB1dChzZXNzaW9uLCB1bmRlZmluZWQsICdhZGQnLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zaG93Q3VzdG9tQ29tbWFuZElucHV0KHNlc3Npb246IElTZXNzaW9uLCBleGlzdGluZ1Rhc2s/OiBJTm9uU2Vzc2lvblRhc2tFbnRyeSwgbW9kZTogVGFza0NvbmZpZ3VyYXRpb25Nb2RlID0gJ2FkZCcsIGFsbG93QmFja05hdmlnYXRpb24gPSBmYWxzZSk6IFByb21pc2U8SVRhc2tFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRhc2tDb25maWd1cmF0aW9uID0gYXdhaXQgdGhpcy5fc2hvd0N1c3RvbUNvbW1hbmRXaWRnZXQoc2Vzc2lvbiwgZXhpc3RpbmdUYXNrLCBtb2RlLCBhbGxvd0JhY2tOYXZpZ2F0aW9uKTtcblx0XHRpZiAoIXRhc2tDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGFza0NvbmZpZ3VyYXRpb24gPT09ICdiYWNrJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Nob3dDb25maWd1cmVRdWlja1BpY2soc2Vzc2lvbik7XG5cdFx0fVxuXG5cdFx0aWYgKGV4aXN0aW5nVGFzaykge1xuXHRcdFx0aWYgKG1vZGUgPT09ICdjb25maWd1cmUnKSB7XG5cdFx0XHRcdGNvbnN0IG5ld0xhYmVsID0gdGFza0NvbmZpZ3VyYXRpb24ubGFiZWw/LnRyaW0oKSB8fCBleGlzdGluZ1Rhc2sudGFzay5sYWJlbCB8fCB0YXNrQ29uZmlndXJhdGlvbi5jb21tYW5kO1xuXG5cdFx0XHRcdGxldCB1cGRhdGVkVGFzazogSVRhc2tFbnRyeSA9IHtcblx0XHRcdFx0XHQuLi5leGlzdGluZ1Rhc2sudGFzayxcblx0XHRcdFx0XHRsYWJlbDogbmV3TGFiZWwsXG5cdFx0XHRcdFx0aW5BZ2VudHM6IHRydWUsXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKHRhc2tDb25maWd1cmF0aW9uLmNvbW1hbmQgJiYgZXhpc3RpbmdUYXNrLnRhc2suY29tbWFuZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0dXBkYXRlZFRhc2sgPSB7XG5cdFx0XHRcdFx0XHQuLi51cGRhdGVkVGFzayxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6IHRhc2tDb25maWd1cmF0aW9uLmNvbW1hbmQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh0YXNrQ29uZmlndXJhdGlvbi5ydW5Pbikge1xuXHRcdFx0XHRcdHVwZGF0ZWRUYXNrID0ge1xuXHRcdFx0XHRcdFx0Li4udXBkYXRlZFRhc2ssXG5cdFx0XHRcdFx0XHRydW5PcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdC4uLihleGlzdGluZ1Rhc2sudGFzay5ydW5PcHRpb25zID8/IHt9KSxcblx0XHRcdFx0XHRcdFx0cnVuT246IHRhc2tDb25maWd1cmF0aW9uLnJ1bk9uLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnVwZGF0ZVRhc2soZXhpc3RpbmdUYXNrLnRhc2subGFiZWwsIHVwZGF0ZWRUYXNrLCBzZXNzaW9uLCBleGlzdGluZ1Rhc2sudGFyZ2V0LCB0YXNrQ29uZmlndXJhdGlvbi50YXJnZXQpO1xuXHRcdFx0XHRyZXR1cm4gdXBkYXRlZFRhc2s7XG5cdFx0XHR9XG5cblx0XHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5hZGRUYXNrVG9TZXNzaW9ucyhleGlzdGluZ1Rhc2sudGFzaywgc2Vzc2lvbiwgZXhpc3RpbmdUYXNrLnRhcmdldCwgeyBydW5PbjogdGFza0NvbmZpZ3VyYXRpb24ucnVuT24gPz8gJ2RlZmF1bHQnIH0pO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uZXhpc3RpbmdUYXNrLnRhc2ssXG5cdFx0XHRcdGluQWdlbnRzOiB0cnVlLFxuXHRcdFx0XHQuLi4odGFza0NvbmZpZ3VyYXRpb24ucnVuT24gPyB7IHJ1bk9wdGlvbnM6IHsgcnVuT246IHRhc2tDb25maWd1cmF0aW9uLnJ1bk9uIH0gfSA6IHt9KSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5jcmVhdGVBbmRBZGRUYXNrKFxuXHRcdFx0dGFza0NvbmZpZ3VyYXRpb24ubGFiZWwsXG5cdFx0XHR0YXNrQ29uZmlndXJhdGlvbi5jb21tYW5kLFxuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHRhc2tDb25maWd1cmF0aW9uLnRhcmdldCxcblx0XHRcdHRhc2tDb25maWd1cmF0aW9uLnJ1bk9uID8geyBydW5PbjogdGFza0NvbmZpZ3VyYXRpb24ucnVuT24gfSA6IHVuZGVmaW5lZFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9zaG93Q3VzdG9tQ29tbWFuZFdpZGdldChzZXNzaW9uOiBJU2Vzc2lvbiwgZXhpc3RpbmdUYXNrPzogSU5vblNlc3Npb25UYXNrRW50cnksIG1vZGU6IFRhc2tDb25maWd1cmF0aW9uTW9kZSA9ICdhZGQnLCBhbGxvd0JhY2tOYXZpZ2F0aW9uID0gZmFsc2UpOiBQcm9taXNlPElSdW5TY3JpcHRDdXN0b21UYXNrV2lkZ2V0UmVzdWx0IHwgJ2JhY2snIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk/LmZvbGRlcnNbMF07XG5cdFx0Y29uc3Qgd29ya3NwYWNlVGFyZ2V0RGlzYWJsZWRSZWFzb24gPSAhKGZvbGRlcj8ud29ya2luZ0RpcmVjdG9yeSA/PyBmb2xkZXI/LnJvb3QpXG5cdFx0XHQ/IGxvY2FsaXplKCd3b3Jrc3BhY2VTdG9yYWdlVW5hdmFpbGFibGVUb29sdGlwJywgXCJXb3Jrc3BhY2Ugc3RvcmFnZSBpcyB1bmF2YWlsYWJsZSBmb3IgdGhpcyBzZXNzaW9uXCIpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpc0NvbmZpZ3VyZU1vZGUgPSBtb2RlID09PSAnY29uZmlndXJlJztcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxJUnVuU2NyaXB0Q3VzdG9tVGFza1dpZGdldFJlc3VsdCB8ICdiYWNrJyB8IHVuZGVmaW5lZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGxldCBzZXR0bGVkID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHF1aWNrV2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrV2lkZ2V0KCkpO1xuXHRcdFx0cXVpY2tXaWRnZXQudGl0bGUgPSBpc0NvbmZpZ3VyZU1vZGVcblx0XHRcdFx0PyBsb2NhbGl6ZSgnY29uZmlndXJlQWN0aW9uV2lkZ2V0VGl0bGUnLCBcIkNvbmZpZ3VyZSBUYXNrXCIpXG5cdFx0XHRcdDogZXhpc3RpbmdUYXNrXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnYWRkRXhpc3RpbmdBY3Rpb25XaWRnZXRUaXRsZScsIFwiQWRkIEV4aXN0aW5nIFRhc2tcIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZGRBY3Rpb25XaWRnZXRUaXRsZScsIFwiQWRkIFRhc2tcIik7XG5cdFx0XHRxdWlja1dpZGdldC5kZXNjcmlwdGlvbiA9IGlzQ29uZmlndXJlTW9kZVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdjb25maWd1cmVBY3Rpb25XaWRnZXREZXNjcmlwdGlvbicsIFwiVXBkYXRlIGhvdyB0aGlzIHRhc2sgaXMgbmFtZWQsIHNhdmVkLCBhbmQgcnVuLlwiKVxuXHRcdFx0XHQ6IGV4aXN0aW5nVGFza1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FkZEV4aXN0aW5nQWN0aW9uV2lkZ2V0RGVzY3JpcHRpb24nLCBcIkVuYWJsZSBhbiBleGlzdGluZyB0YXNrIGZvciBzZXNzaW9ucyBhbmQgY29uZmlndXJlIHdoZW4gaXQgc2hvdWxkIHJ1bi5cIilcblx0XHRcdFx0XHQ6IGxvY2FsaXplKCdhZGRBY3Rpb25XaWRnZXREZXNjcmlwdGlvbicsIFwiQ3JlYXRlIGEgc2hlbGwgdGFzayBhbmQgY29uZmlndXJlIGhvdyBpdCBzaG91bGQgYmUgc2F2ZWQgYW5kIHJ1bi5cIik7XG5cdFx0XHRxdWlja1dpZGdldC5pZ25vcmVGb2N1c091dCA9IHRydWU7XG5cdFx0XHRxdWlja1dpZGdldC5idXR0b25zID0gYWxsb3dCYWNrTmF2aWdhdGlvblxuXHRcdFx0XHQ/IFt0aGlzLl9xdWlja0lucHV0U2VydmljZS5iYWNrQnV0dG9uLCBjbG9zZVF1aWNrV2lkZ2V0QnV0dG9uXVxuXHRcdFx0XHQ6IFtjbG9zZVF1aWNrV2lkZ2V0QnV0dG9uXTtcblx0XHRcdGNvbnN0IHdpZGdldCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUnVuU2NyaXB0Q3VzdG9tVGFza1dpZGdldCh7XG5cdFx0XHRcdGxhYmVsOiBleGlzdGluZ1Rhc2s/LnRhc2subGFiZWwsXG5cdFx0XHRcdGxhYmVsRGlzYWJsZWRSZWFzb246IGV4aXN0aW5nVGFzayAmJiAhaXNDb25maWd1cmVNb2RlID8gbG9jYWxpemUoJ2V4aXN0aW5nVGFza0xhYmVsTG9ja2VkJywgXCJUaGlzIG5hbWUgY29tZXMgZnJvbSBhbiBleGlzdGluZyB0YXNrIGFuZCBjYW5ub3QgYmUgY2hhbmdlZCBoZXJlLlwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29tbWFuZDogZXhpc3RpbmdUYXNrID8gZ2V0VGFza0NvbW1hbmRQcmV2aWV3KGV4aXN0aW5nVGFzay50YXNrKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y29tbWFuZERpc2FibGVkUmVhc29uOiBleGlzdGluZ1Rhc2sgJiYgIWlzQ29uZmlndXJlTW9kZSA/IGxvY2FsaXplKCdleGlzdGluZ1Rhc2tDb21tYW5kTG9ja2VkJywgXCJUaGlzIGNvbW1hbmQgY29tZXMgZnJvbSBhbiBleGlzdGluZyB0YXNrIGFuZCBjYW5ub3QgYmUgY2hhbmdlZCBoZXJlLlwiKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dGFyZ2V0OiBleGlzdGluZ1Rhc2s/LnRhcmdldCxcblx0XHRcdFx0dGFyZ2V0RGlzYWJsZWRSZWFzb246IGV4aXN0aW5nVGFzayAmJiAhaXNDb25maWd1cmVNb2RlID8gbG9jYWxpemUoJ2V4aXN0aW5nVGFza1RhcmdldExvY2tlZCcsIFwiVGhpcyBleGlzdGluZyB0YXNrIGNhbm5vdCBiZSBtb3ZlZCBiZXR3ZWVuIHdvcmtzcGFjZSBhbmQgdXNlciBzdG9yYWdlLlwiKSA6IHdvcmtzcGFjZVRhcmdldERpc2FibGVkUmVhc29uLFxuXHRcdFx0XHRydW5PbjogZXhpc3RpbmdUYXNrPy50YXNrLnJ1bk9wdGlvbnM/LnJ1bk9uID09PSAnd29ya3RyZWVDcmVhdGVkJyA/ICd3b3JrdHJlZUNyZWF0ZWQnIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlOiBpc0NvbmZpZ3VyZU1vZGUgPyAnY29uZmlndXJlJyA6IGV4aXN0aW5nVGFzayA/ICdhZGQtZXhpc3RpbmcnIDogJ2FkZCcsXG5cdFx0XHR9KSk7XG5cdFx0XHRxdWlja1dpZGdldC53aWRnZXQgPSB3aWRnZXQuZG9tTm9kZTtcblx0XHRcdHRoaXMuX2xheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKFJVTl9TQ1JJUFRfQUNUSU9OX01PREFMX1ZJU0lCTEVfQ0xBU1MpO1xuXHRcdFx0Y29uc3QgYmFja2Ryb3AgPSBhcHBlbmQodGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLCAkKCcucnVuLXNjcmlwdC1hY3Rpb24tbW9kYWwtYmFja2Ryb3AnKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcihiYWNrZHJvcCwgZSA9PiB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Y29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGJhY2tkcm9wLnJlbW92ZSgpIH0pO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gdGhpcy5fbGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoUlVOX1NDUklQVF9BQ1RJT05fTU9EQUxfVklTSUJMRV9DTEFTUykgfSk7XG5cblx0XHRcdGNvbnN0IGNvbXBsZXRlID0gKHJlc3VsdDogSVJ1blNjcmlwdEN1c3RvbVRhc2tXaWRnZXRSZXN1bHQgfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdFx0aWYgKHNldHRsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0cXVpY2tXaWRnZXQuaGlkZSgpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHdpZGdldC5vbkRpZFN1Ym1pdChyZXN1bHQgPT4gY29tcGxldGUocmVzdWx0KSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHdpZGdldC5vbkRpZENhbmNlbCgoKSA9PiBjb21wbGV0ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tXaWRnZXQub25EaWRUcmlnZ2VyQnV0dG9uKGJ1dHRvbiA9PiB7XG5cdFx0XHRcdGlmIChhbGxvd0JhY2tOYXZpZ2F0aW9uICYmIGJ1dHRvbiA9PT0gdGhpcy5fcXVpY2tJbnB1dFNlcnZpY2UuYmFja0J1dHRvbikge1xuXHRcdFx0XHRcdHNldHRsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJlc29sdmUoJ2JhY2snKTtcblx0XHRcdFx0XHRxdWlja1dpZGdldC5oaWRlKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChidXR0b24gPT09IGNsb3NlUXVpY2tXaWRnZXRCdXR0b24pIHtcblx0XHRcdFx0XHRjb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tXaWRnZXQub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0aWYgKCFzZXR0bGVkKSB7XG5cdFx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cXVpY2tXaWRnZXQuc2hvdygpO1xuXHRcdFx0d2lkZ2V0LmZvY3VzKCk7XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBTcGxpdC1idXR0b24gYWN0aW9uIHZpZXcgaXRlbSBmb3IgdGhlIHJ1biBzY3JpcHQgcGlja2VyIGluIHRoZSBzZXNzaW9ucyB0aXRsZWJhci5cbiAqIFRoZSBwcmltYXJ5IGJ1dHRvbiBydW5zIHRoZSBwaW5uZWQgdGFzaywgb3IgdGhlIGZpcnN0IHRhc2sgaWYgbm9uZSBpcyBwaW5uZWQuXG4gKiBUaGUgZHJvcGRvd24gYXJyb3cgb3BlbnMgYSBjdXN0b20gYWN0aW9uIHdpZGdldCB3aXRoIGNhdGVnb3JpZXMgYW5kIHBlci1pdGVtXG4gKiB0b29sYmFyIGFjdGlvbnMgKHBpbiwgY29uZmlndXJlLCByZW1vdmUpLlxuICovXG5jbGFzcyBSdW5TY3JpcHRBY3Rpb25WaWV3SXRlbSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJpbWFyeUFjdGlvbkFjdGlvbjogQWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmltYXJ5QWN0aW9uOiBBY3Rpb25WaWV3SXRlbTtcblx0cHJpdmF0ZSByZWFkb25seSBfZHJvcGRvd246IENoZXZyb25BY3Rpb25XaWRnZXREcm9wZG93bjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IElBY3Rpb24sXG5cdFx0X29wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlUnVuU3RhdGU6IElPYnNlcnZhYmxlPElSdW5TY3JpcHRBY3Rpb25Db250ZXh0IHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zaG93Q29uZmlndXJlUXVpY2tQaWNrOiAoc2Vzc2lvbjogSVNlc3Npb24pID0+IFByb21pc2U8SVRhc2tFbnRyeSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2hvd0N1c3RvbUNvbW1hbmRJbnB1dDogKHNlc3Npb246IElTZXNzaW9uLCBleGlzdGluZ1Rhc2s6IElOb25TZXNzaW9uVGFza0VudHJ5LCBtb2RlPzogVGFza0NvbmZpZ3VyYXRpb25Nb2RlKSA9PiBQcm9taXNlPElUYXNrRW50cnkgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dlbmVyYXRlTmV3VGFzazogKHNlc3Npb246IElTZXNzaW9uKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyZUJyb3dzZXJVcmw6IChzZXNzaW9uOiBJU2Vzc2lvbikgPT4gUHJvbWlzZTx2b2lkPixcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Rhc2tzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc0NvbmZpZ1NlcnZpY2U6IElTZXNzaW9uc1Rhc2tzU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElBY3Rpb25XaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKHVuZGVmaW5lZCwgYWN0aW9uKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fYWN0aXZlUnVuU3RhdGUuZ2V0KCk7XG5cdFx0Y29uc3QgaXNQcmltYXJ5RW5hYmxlZCA9ICEhc3RhdGUgJiYgKHN0YXRlLnRhc2tzLmxlbmd0aCA+IDAgfHwgc3RhdGUucGlubmVkQnJvd3Nlcik7XG5cblx0XHQvLyBQcmltYXJ5IGFjdGlvbiBidXR0b24gLSBydW5zIHRoZSBwaW5uZWQgdGFzayAob3IgZmlyc3QgdGFzayB3aGVuIG5vbmUgaXMgcGlubmVkKVxuXHRcdHRoaXMuX3ByaW1hcnlBY3Rpb25BY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKFxuXHRcdFx0J2FnZW50U2Vzc2lvbnMucnVuU2NyaXB0UHJpbWFyeScsXG5cdFx0XHR0aGlzLl9nZXRQcmltYXJ5QWN0aW9uVG9vbHRpcChzdGF0ZSksXG5cdFx0XHRUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5wbGF5KSxcblx0XHRcdGlzUHJpbWFyeUVuYWJsZWQsXG5cdFx0XHQoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChSVU5fU0NSSVBUX0FDVElPTl9QUklNQVJZX0lEKVxuXHRcdCkpO1xuXHRcdHRoaXMuX3ByaW1hcnlBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uVmlld0l0ZW0odW5kZWZpbmVkLCB0aGlzLl9wcmltYXJ5QWN0aW9uQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KSk7XG5cblx0XHQvLyBVcGRhdGUgZW5hYmxlZCBzdGF0ZSB3aGVuIHRhc2tzIGNoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHJ1blN0YXRlID0gdGhpcy5fYWN0aXZlUnVuU3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcHJpbWFyeUFjdGlvbkFjdGlvbi5lbmFibGVkID0gISFydW5TdGF0ZSAmJiAocnVuU3RhdGUudGFza3MubGVuZ3RoID4gMCB8fCBydW5TdGF0ZS5waW5uZWRCcm93c2VyKTtcblx0XHRcdHRoaXMuX3ByaW1hcnlBY3Rpb25BY3Rpb24ubGFiZWwgPSB0aGlzLl9nZXRQcmltYXJ5QWN0aW9uVG9vbHRpcChydW5TdGF0ZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gRHJvcGRvd24gd2l0aCBjYXRlZ29yaXplZCB0YXNrIGFjdGlvbnMgYW5kIHBlci1pdGVtIHRvb2xiYXJzXG5cdFx0Y29uc3QgZHJvcGRvd25BY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdhZ2VudFNlc3Npb25zLnJ1blNjcmlwdERyb3Bkb3duJywgbG9jYWxpemUoJ3J1bkRyb3Bkb3duJywgXCJNb3JlIFRhc2tzLi4uXCIpKSk7XG5cdFx0dGhpcy5fZHJvcGRvd24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQ2hldnJvbkFjdGlvbldpZGdldERyb3Bkb3duKFxuXHRcdFx0ZHJvcGRvd25BY3Rpb24sXG5cdFx0XHR7XG5cdFx0XHRcdGFjdGlvblByb3ZpZGVyOiB7IGdldEFjdGlvbnM6ICgpID0+IHRoaXMuX2dldERyb3Bkb3duQWN0aW9ucygpIH0sXG5cdFx0XHRcdHNob3dJdGVtS2V5YmluZGluZ3M6IHRydWUsXG5cdFx0XHRcdGxpc3RPcHRpb25zOiB7IGNsYXNzTmFtZTogJ2NvbXBhY3QtaWNvbnMnIH0sXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRcdHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgnbW9uYWNvLWRyb3Bkb3duLXdpdGgtZGVmYXVsdCcpO1xuXG5cdFx0Ly8gUHJpbWFyeSBhY3Rpb24gYnV0dG9uXG5cdFx0Y29uc3QgcHJpbWFyeUNvbnRhaW5lciA9ICQoJy5hY3Rpb24tY29udGFpbmVyJyk7XG5cdFx0dGhpcy5fcHJpbWFyeUFjdGlvbi5yZW5kZXIoYXBwZW5kKGNvbnRhaW5lciwgcHJpbWFyeUNvbnRhaW5lcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihwcmltYXJ5Q29udGFpbmVyLCBFdmVudFR5cGUuS0VZX0RPV04sIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0dGhpcy5fcHJpbWFyeUFjdGlvbi5ibHVyKCk7XG5cdFx0XHRcdHRoaXMuX2Ryb3Bkb3duLmZvY3VzKCk7XG5cdFx0XHRcdGV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIERyb3Bkb3duIGFycm93IGJ1dHRvblxuXHRcdGNvbnN0IGRyb3Bkb3duQ29udGFpbmVyID0gJCgnLmRyb3Bkb3duLWFjdGlvbi1jb250YWluZXInKTtcblx0XHR0aGlzLl9kcm9wZG93bi5yZW5kZXIoYXBwZW5kKGNvbnRhaW5lciwgZHJvcGRvd25Db250YWluZXIpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIoZHJvcGRvd25Db250YWluZXIsIEV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5MZWZ0QXJyb3cpKSB7XG5cdFx0XHRcdHRoaXMuX2Ryb3Bkb3duLnNldEZvY3VzYWJsZShmYWxzZSk7XG5cdFx0XHRcdHRoaXMuX3ByaW1hcnlBY3Rpb24uZm9jdXMoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoZnJvbVJpZ2h0PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChmcm9tUmlnaHQpIHtcblx0XHRcdHRoaXMuX2Ryb3Bkb3duLmZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3ByaW1hcnlBY3Rpb24uZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBibHVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX3ByaW1hcnlBY3Rpb24uYmx1cigpO1xuXHRcdHRoaXMuX2Ryb3Bkb3duLmJsdXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldEZvY3VzYWJsZShmb2N1c2FibGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9wcmltYXJ5QWN0aW9uLnNldEZvY3VzYWJsZShmb2N1c2FibGUpO1xuXHRcdGlmICghZm9jdXNhYmxlKSB7XG5cdFx0XHR0aGlzLl9kcm9wZG93bi5zZXRGb2N1c2FibGUoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2dldFByaW1hcnlBY3Rpb25Ub29sdGlwKHN0YXRlOiBJUnVuU2NyaXB0QWN0aW9uQ29udGV4dCB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhSVU5fU0NSSVBUX0FDVElPTl9QUklNQVJZX0lEKT8uZ2V0TGFiZWwoKTtcblx0XHRjb25zdCB3aXRoS2V5YmluZGluZyA9IChsYWJlbDogc3RyaW5nKSA9PiBrZXliaW5kaW5nTGFiZWxcblx0XHRcdD8gbG9jYWxpemUoJ3J1bkFjdGlvblRvb2x0aXBLZXliaW5kaW5nJywgXCJ7MH0gKHsxfSlcIiwgbGFiZWwsIGtleWJpbmRpbmdMYWJlbClcblx0XHRcdDogbGFiZWw7XG5cblx0XHRpZiAoc3RhdGU/LnBpbm5lZEJyb3dzZXIpIHtcblx0XHRcdHJldHVybiB3aXRoS2V5YmluZGluZyhsb2NhbGl6ZSgnb3BlbkJyb3dzZXJBY3Rpb24nLCBcIk9wZW4gQnJvd3NlclwiKSk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS50YXNrcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgncnVuUHJpbWFyeVRhc2tUb29sdGlwJywgXCJSdW4gUHJpbWFyeSBUYXNrXCIpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByaW1hcnlUYXNrID0gZ2V0UHJpbWFyeVRhc2soc3RhdGUudGFza3MsIHN0YXRlLnBpbm5lZFRhc2tMYWJlbCk/LnRhc2s7XG5cdFx0aWYgKCFwcmltYXJ5VGFzaykge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdydW5QcmltYXJ5VGFza1Rvb2x0aXAnLCBcIlJ1biBQcmltYXJ5IFRhc2tcIik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHdpdGhLZXliaW5kaW5nKGdldFRhc2tEaXNwbGF5TGFiZWwocHJpbWFyeVRhc2spKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldERyb3Bkb3duQWN0aW9ucygpOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9hY3RpdmVSdW5TdGF0ZS5nZXQoKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyB0YXNrcywgc2Vzc2lvbiwgcGlubmVkVGFza0xhYmVsIH0gPSBzdGF0ZTtcblx0XHRjb25zdCBmb2xkZXIgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXTtcblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25bXSA9IFtdO1xuXG5cdFx0Ly8gQ2F0ZWdvcnkgZm9yIG5vcm1hbCB0YXNrcyAobm8gaGVhZGVyIHNob3duKVxuXHRcdGNvbnN0IGRlZmF1bHRDYXRlZ29yeSA9IHsgbGFiZWw6ICcnLCBvcmRlcjogMCwgc2hvd0hlYWRlcjogZmFsc2UgfTtcblx0XHQvLyBDYXRlZ29yeSBmb3Igd29ya3RyZWUtY3JlYXRpb24gdGFza3Ncblx0XHRjb25zdCB3b3JrdHJlZUNhdGVnb3J5ID0geyBsYWJlbDogbG9jYWxpemUoJ3dvcmt0cmVlQ3JlYXRpb25DYXRlZ29yeScsIFwiUnVuIG9uIFdvcmt0cmVlIENyZWF0aW9uXCIpLCBvcmRlcjogMSwgc2hvd0hlYWRlcjogdHJ1ZSB9O1xuXHRcdC8vIENhdGVnb3J5IGZvciB0YXNrIGNyZWF0aW9uIGFuZCBtYW5hZ2VtZW50XG5cdFx0Y29uc3QgdGFza3NDYXRlZ29yeSA9IHsgbGFiZWw6IGxvY2FsaXplKCd0YXNrc0FjdGlvbnNDYXRlZ29yeScsIFwiVGFza3NcIiksIG9yZGVyOiAyLCBzaG93SGVhZGVyOiB0cnVlIH07XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRhc2tzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRhc2tzW2ldO1xuXHRcdFx0Y29uc3QgdGFzayA9IGVudHJ5LnRhc2s7XG5cdFx0XHRjb25zdCBpc1dvcmt0cmVlVGFzayA9IHRhc2sucnVuT3B0aW9ucz8ucnVuT24gPT09ICd3b3JrdHJlZUNyZWF0ZWQnO1xuXHRcdFx0Y29uc3QgaXNQaW5uZWQgPSB0YXNrLmxhYmVsID09PSBwaW5uZWRUYXNrTGFiZWw7XG5cblx0XHRcdGNvbnN0IHRvb2xiYXJBY3Rpb25zOiBJQWN0aW9uW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogYHJ1blNjcmlwdC5waW4uJHtpfWAsXG5cdFx0XHRcdFx0bGFiZWw6IGlzUGlubmVkID8gbG9jYWxpemUoJ3VucGluVGFzaycsIFwiVW5waW5cIikgOiBsb2NhbGl6ZSgncGluVGFzaycsIFwiUGluXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGlzUGlubmVkID8gbG9jYWxpemUoJ3VucGluVGFza1Rvb2x0aXAnLCBcIlVucGluXCIpIDogbG9jYWxpemUoJ3BpblRhc2tUb29sdGlwJywgXCJQaW5cIiksXG5cdFx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShpc1Bpbm5lZCA/IENvZGljb24ucGlubmVkIDogQ29kaWNvbi5waW4pLFxuXHRcdFx0XHRcdGVuYWJsZWQ6ICEhZm9sZGVyPy5yb290LFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXNzaW9uc0NvbmZpZ1NlcnZpY2Uuc2V0UGlubmVkVGFza0xhYmVsKGZvbGRlcj8ucm9vdCwgaXNQaW5uZWQgPyB1bmRlZmluZWQgOiB0YXNrLmxhYmVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogYHJ1blNjcmlwdC5jb25maWd1cmUuJHtpfWAsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb25maWd1cmVUYXNrJywgXCJDb25maWd1cmVcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2NvbmZpZ3VyZVRhc2snLCBcIkNvbmZpZ3VyZVwiKSxcblx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ2VhciksXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2FjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2hvd0N1c3RvbUNvbW1hbmRJbnB1dChzZXNzaW9uLCB7IHRhc2ssIHRhcmdldDogZW50cnkudGFyZ2V0IH0sICdjb25maWd1cmUnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogYHJ1blNjcmlwdC5yZW1vdmUuJHtpfWAsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZW1vdmVUYXNrJywgXCJSZW1vdmVcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ3JlbW92ZVRhc2snLCBcIlJlbW92ZVwiKSxcblx0XHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2xvc2UpLFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5yZW1vdmVUYXNrKHRhc2subGFiZWwsIHNlc3Npb24sIGVudHJ5LnRhcmdldCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRpZDogYHJ1blNjcmlwdC50YXNrLiR7aX1gLFxuXHRcdFx0XHRsYWJlbDogZ2V0VGFza0Rpc3BsYXlMYWJlbCh0YXNrKSxcblx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdGhvdmVyOiB7XG5cdFx0XHRcdFx0Y29udGVudDogbG9jYWxpemUoJ3J1bkFjdGlvblRvb2x0aXAnLCBcIlJ1biAnezB9JyBpbiB0ZXJtaW5hbFwiLCBnZXRUYXNrRGlzcGxheUxhYmVsKHRhc2spKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5ydW5Db21wYWN0LFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjYXRlZ29yeTogaXNXb3JrdHJlZVRhc2sgPyB3b3JrdHJlZUNhdGVnb3J5IDogZGVmYXVsdENhdGVnb3J5LFxuXHRcdFx0XHR0b29sYmFyQWN0aW9ucyxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnJ1blRhc2sodGFzaywgc2Vzc2lvbik7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBcIkFkZCBUYXNrLi4uXCIgYWN0aW9uXG5cdFx0Y29uc3QgY2FuQ29uZmlndXJlID0gISEoZm9sZGVyPy53b3JraW5nRGlyZWN0b3J5ID8/IGZvbGRlcj8ucm9vdCk7XG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdGlkOiAncnVuU2NyaXB0LmFkZEFjdGlvbicsXG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbmZpZ3VyZURlZmF1bHRSdW5BY3Rpb24nLCBcIkFkZCBUYXNrLi4uXCIpLFxuXHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRob3Zlcjoge1xuXHRcdFx0XHRjb250ZW50OiBjYW5Db25maWd1cmVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZGRBY3Rpb25Ub29sdGlwJywgXCJBZGQgYSBuZXcgdGFza1wiKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FkZEFjdGlvblRvb2x0aXBEaXNhYmxlZCcsIFwiQ2Fubm90IGFkZCB0YXNrcyB0byB0aGlzIHNlc3Npb24gYmVjYXVzZSB3b3Jrc3BhY2Ugc3RvcmFnZSBpcyB1bmF2YWlsYWJsZVwiKSxcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLmFkZENvbXBhY3QsXG5cdFx0XHRlbmFibGVkOiBjYW5Db25maWd1cmUsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0Y2F0ZWdvcnk6IHRhc2tzQ2F0ZWdvcnksXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9nU2Vzc2lvbnNJbnRlcmFjdGlvbih0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCAnYWRkVGFzaycsICdhY3Rpb25XaWRnZXQnKTtcblx0XHRcdFx0Y29uc3QgdGFzayA9IGF3YWl0IHRoaXMuX3Nob3dDb25maWd1cmVRdWlja1BpY2soc2Vzc2lvbik7XG5cdFx0XHRcdGlmICh0YXNrKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fc2Vzc2lvbnNDb25maWdTZXJ2aWNlLnJ1blRhc2sodGFzaywgc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHQvLyBcIkdlbmVyYXRlIE5ldyBUYXNrLi4uXCIgYWN0aW9uXG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdGlkOiAncnVuU2NyaXB0LmdlbmVyYXRlQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnZ2VuZXJhdGVSdW5BY3Rpb24nLCBcIkdlbmVyYXRlIE5ldyBUYXNrLi4uXCIpLFxuXHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRob3Zlcjoge1xuXHRcdFx0XHRjb250ZW50OiBsb2NhbGl6ZSgnZ2VuZXJhdGVSdW5BY3Rpb25Ub29sdGlwJywgXCJHZW5lcmF0ZSBhIG5ldyB3b3Jrc3BhY2UgdGFza1wiKSxcblx0XHRcdH0sXG5cdFx0XHRpY29uOiBDb2RpY29uLnNwYXJrbGVDb21wYWN0LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRjYXRlZ29yeTogdGFza3NDYXRlZ29yeSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2dTZXNzaW9uc0ludGVyYWN0aW9uKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsICdnZW5lcmF0ZU5ld1Rhc2snLCAnYWN0aW9uV2lkZ2V0Jyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2dlbmVyYXRlTmV3VGFzayhzZXNzaW9uKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHQvLyBCcm93c2VyIGNhdGVnb3J5IC0gT3BlbiBCcm93c2VyIGFjdGlvblxuXHRcdGNvbnN0IGJyb3dzZXJDYXRlZ29yeSA9IHsgbGFiZWw6IGxvY2FsaXplKCdicm93c2VyQWN0aW9uc0NhdGVnb3J5JywgXCJCcm93c2VyXCIpLCBvcmRlcjogMywgc2hvd0hlYWRlcjogdHJ1ZSB9O1xuXHRcdGNvbnN0IGJyb3dzZXJVcmwgPSBzdGF0ZS5icm93c2VyVXJsO1xuXHRcdGNvbnN0IGJyb3dzZXJVcmxEZXNjcmlwdGlvbiA9IGZvcm1hdEJyb3dzZXJVcmxEZXNjcmlwdGlvbihicm93c2VyVXJsLCAyMCk7XG5cdFx0Y29uc3QgY2FuQ29uZmlndXJlQnJvd3NlciA9ICEhZm9sZGVyPy5yb290O1xuXHRcdGNvbnN0IGlzQnJvd3NlclBpbm5lZCA9IHN0YXRlLnBpbm5lZEJyb3dzZXI7XG5cdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdGlkOiAncnVuU2NyaXB0Lm9wZW5Ccm93c2VyJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3BlbkJyb3dzZXJBY3Rpb24nLCBcIk9wZW4gQnJvd3NlclwiKSxcblx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGJyb3dzZXJVcmxEZXNjcmlwdGlvbixcblx0XHRcdGhvdmVyOiB7XG5cdFx0XHRcdGNvbnRlbnQ6IGJyb3dzZXJVcmxcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdvcGVuQnJvd3NlckFjdGlvblRvb2x0aXAnLCBcIk9wZW4gJ3swfScgaW4gdGhlIGludGVncmF0ZWQgYnJvd3NlclwiLCBicm93c2VyVXJsKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ29wZW5Ccm93c2VyQWN0aW9uVG9vbHRpcFVuY29uZmlndXJlZCcsIFwiT3BlbiB0aGUgaW50ZWdyYXRlZCBicm93c2VyXCIpLFxuXHRcdFx0fSxcblx0XHRcdGljb246IENvZGljb24ud2luZG93Q29tcGFjdCxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0Y2F0ZWdvcnk6IGJyb3dzZXJDYXRlZ29yeSxcblx0XHRcdHRvb2xiYXJBY3Rpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3J1blNjcmlwdC5waW5Ccm93c2VyJyxcblx0XHRcdFx0XHRsYWJlbDogaXNCcm93c2VyUGlubmVkID8gbG9jYWxpemUoJ3VucGluQnJvd3NlcicsIFwiVW5waW5cIikgOiBsb2NhbGl6ZSgncGluQnJvd3NlcicsIFwiUGluXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGlzQnJvd3NlclBpbm5lZCA/IGxvY2FsaXplKCd1bnBpbkJyb3dzZXJUb29sdGlwJywgXCJVbnBpblwiKSA6IGxvY2FsaXplKCdwaW5Ccm93c2VyVG9vbHRpcCcsIFwiUGluXCIpLFxuXHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoaXNCcm93c2VyUGlubmVkID8gQ29kaWNvbi5waW5uZWQgOiBDb2RpY29uLnBpbiksXG5cdFx0XHRcdFx0ZW5hYmxlZDogISFmb2xkZXI/LnJvb3QsXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9hY3Rpb25XaWRnZXRTZXJ2aWNlLmhpZGUoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25zQ29uZmlnU2VydmljZS5zZXRQaW5uZWRCcm93c2VyKGZvbGRlcj8ucm9vdCwgIWlzQnJvd3NlclBpbm5lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdydW5TY3JpcHQuY29uZmlndXJlQnJvd3NlcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb25maWd1cmVCcm93c2VyVXJsJywgXCJDb25maWd1cmUgVVJMXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjb25maWd1cmVCcm93c2VyVXJsJywgXCJDb25maWd1cmUgVVJMXCIpLFxuXHRcdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5nZWFyKSxcblx0XHRcdFx0XHRlbmFibGVkOiBjYW5Db25maWd1cmVCcm93c2VyLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jb25maWd1cmVCcm93c2VyVXJsKHNlc3Npb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnc2ltcGxlQnJvd3Nlci5zaG93JywgYnJvd3NlclVybCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cbn1cblxuLyoqXG4gKiB7QGxpbmsgQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25WaWV3SXRlbX0gdGhhdCByZW5kZXJzIGEgY2hldnJvbi1kb3duIGljb25cbiAqIGZvciB0aGUgc3BsaXQgYnV0dG9uIGRyb3Bkb3duIGluIHRoZSB0aXRsZWJhci5cbiAqL1xuY2xhc3MgQ2hldnJvbkFjdGlvbldpZGdldERyb3Bkb3duIGV4dGVuZHMgQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25WaWV3SXRlbSB7XG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJMYWJlbChlbGVtZW50OiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHwgbnVsbCB7XG5cdFx0ZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdjb2RpY29uJywgJ2NvZGljb24tY2hldnJvbi1kb3duJyk7XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cblxuLy8gUmVnaXN0ZXIgdGhlIFJ1biBzcGxpdCBidXR0b24gc3VibWVudSBvbiB0aGUgd29ya2JlbmNoIHRpdGxlIGJhciAoYmFja2dyb3VuZCBzZXNzaW9ucyBvbmx5KS5cbi8vIFBsYWNlZCBpbiB0aGUgY2VudGVyLXJpZ2h0IHRvb2xiYXIsIGltbWVkaWF0ZWx5IGJlZm9yZSB0aGUgXCJPcGVuIGluIFZTIENvZGVcIiBhY3Rpb24gKG9yZGVyIDcpLlxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVzLlRpdGxlQmFyQ2VudGVyUmlnaHQsIHtcblx0c3VibWVudTogUnVuU2NyaXB0RHJvcGRvd25NZW51SWQsXG5cdGlzU3BsaXRCdXR0b246IHRydWUsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ3J1bicsIFwiUnVuXCIpLFxuXHRpY29uOiBDb2RpY29uLnBsYXksXG5cdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdG9yZGVyOiA2LFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBTZXNzaW9uc1dlbGNvbWVWaXNpYmxlQ29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbldvcmtzcGFjZUlzVmlydHVhbENvbnRleHQudG9OZWdhdGVkKCkpXG59KTtcblxuLy8gRGlzYWJsZWQgcGxhY2Vob2xkZXIgc2hvd24gaW4gdGhlIHRpdGxlYmFyIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGRvZXMgbm90IHN1cHBvcnQgcnVubmluZyBzY3JpcHRzXG5jbGFzcyBSdW5TY3JpcHROb3RBdmFpbGFibGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmFnZW50U2Vzc2lvbnMucnVuU2NyaXB0Lm5vdEF2YWlsYWJsZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdydW4nLCBcIlJ1blwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdydW5TY3JpcHROb3RBdmFpbGFibGVUb29sdGlwJywgXCJSdW4gVGFzayBpcyBub3QgYXZhaWxhYmxlIGZvciB0aGlzIHNlc3Npb24gdHlwZVwiKSxcblx0XHRcdGljb246IENvZGljb24ucGxheSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuZmFsc2UoKSxcblx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdGlkOiBNZW51cy5UaXRsZUJhckNlbnRlclJpZ2h0LFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogNixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzQXV4aWxpYXJ5V2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSwgU2Vzc2lvbnNXZWxjb21lVmlzaWJsZUNvbnRleHQudG9OZWdhdGVkKCksIFNlc3Npb25Xb3Jrc3BhY2VJc1ZpcnR1YWxDb250ZXh0KVxuXHRcdFx0fV1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bigpOiB2b2lkIHsgfVxufVxuXG5yZWdpc3RlckFjdGlvbjIoUnVuU2NyaXB0Tm90QXZhaWxhYmxlQWN0aW9uKTtcblxuLy8gUmVnaXN0ZXIgRjUga2V5YmluZGluZyBhdCBtb2R1bGUgbGV2ZWwgdG8gZW5zdXJlIGl0J3MgaW4gdGhlIHJlZ2lzdHJ5XG4vLyBiZWZvcmUgdGhlIGtleWJpbmRpbmcgcmVzb2x2ZXIgaXMgY2FjaGVkLiBUaGUgY29tbWFuZCBoYW5kbGVyIGlzXG4vLyByZWdpc3RlcmVkIGxhdGVyIGJ5IFJ1blNjcmlwdENvbnRyaWJ1dGlvbi5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiBSVU5fU0NSSVBUX0FDVElPTl9QUklNQVJZX0lELFxuXHRwcmltYXJ5OiBLZXlDb2RlLkY1LFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEwMCxcblx0d2hlbjogSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFHLHVDQUF1Qyx1QkFBdUIsUUFBUSxpQkFBaUI7QUFDbkcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQkFBZ0IsMEJBQWtEO0FBQzNFLFNBQVMsY0FBdUI7QUFDaEMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHVCQUFvQztBQUN6RCxTQUFTLFNBQVMsbUJBQWdDO0FBQ2xELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxRQUFRLGlCQUFpQixTQUFTLGNBQWMseUJBQXlCO0FBQ2xGLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBNEIsMEJBQStEO0FBQzNGLFNBQVMseUJBQXlCO0FBRWxDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0NBQWtDLHFDQUFxQztBQUVoRixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGFBQWE7QUFDdEIsU0FBK0IsNkJBQW9GO0FBQ25ILFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQTJDLGlDQUFpQztBQUlyRSxNQUFNLDBC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
