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
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { toAction } from "../../../../base/common/actions.js";
import { distinct } from "../../../../base/common/arrays.js";
import { RunOnceScheduler, raceTimeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isErrorWithActions } from "../../../../base/common/errorMessage.js";
import * as errors from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { deepClone, equals } from "../../../../base/common/objects.js";
import severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IExtensionHostDebugService } from "../../../../platform/debug/common/extensionHostDebug.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { FileChangeType, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustRequestService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { EditorsOrder } from "../../../common/editor.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { IWorkbenchLayoutService, Parts } from "../../../services/layout/browser/layoutService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { VIEWLET_ID as EXPLORER_VIEWLET_ID } from "../../files/common/files.js";
import { ITestService } from "../../testing/common/testService.js";
import { CALLSTACK_VIEW_ID, CONTEXT_BREAKPOINTS_EXIST, CONTEXT_DEBUG_STATE, CONTEXT_DEBUG_TYPE, CONTEXT_DEBUG_UX, CONTEXT_DISASSEMBLY_VIEW_FOCUS, CONTEXT_HAS_DEBUGGED, CONTEXT_IN_DEBUG_MODE, DEBUG_MEMORY_SCHEME, DEBUG_SCHEME, REPL_VIEW_ID, State, VIEWLET_ID, debuggerDisabledMessage, getStateLabel } from "../common/debug.js";
import { DebugCompoundRoot } from "../common/debugCompoundRoot.js";
import { Breakpoint, DataBreakpoint, DebugModel, FunctionBreakpoint, InstructionBreakpoint } from "../common/debugModel.js";
import { Source } from "../common/debugSource.js";
import { DebugStorage } from "../common/debugStorage.js";
import { DebugTelemetry } from "../common/debugTelemetry.js";
import { getExtensionHostDebugSession, saveAllBeforeDebugStart } from "../common/debugUtils.js";
import { ViewModel } from "../common/debugViewModel.js";
import { DisassemblyViewInput } from "../common/disassemblyViewInput.js";
import { AdapterManager } from "./debugAdapterManager.js";
import { DEBUG_CONFIGURE_COMMAND_ID, DEBUG_CONFIGURE_LABEL } from "./debugCommands.js";
import { ConfigurationManager } from "./debugConfigurationManager.js";
import { DebugMemoryFileSystemProvider } from "./debugMemory.js";
import { DebugSession } from "./debugSession.js";
import { DebugTaskRunner, TaskRunResult } from "./debugTaskRunner.js";
let DebugService = class {
  constructor(editorService, paneCompositeService, viewsService, viewDescriptorService, notificationService, dialogService, layoutService, contextService, contextKeyService, lifecycleService, instantiationService, extensionService, fileService, configurationService, extensionHostDebugService, activityService, commandService, quickInputService, workspaceTrustRequestService, uriIdentityService, testService) {
    this.editorService = editorService;
    this.paneCompositeService = paneCompositeService;
    this.viewsService = viewsService;
    this.viewDescriptorService = viewDescriptorService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.layoutService = layoutService;
    this.contextService = contextService;
    this.contextKeyService = contextKeyService;
    this.lifecycleService = lifecycleService;
    this.instantiationService = instantiationService;
    this.extensionService = extensionService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.extensionHostDebugService = extensionHostDebugService;
    this.activityService = activityService;
    this.commandService = commandService;
    this.quickInputService = quickInputService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.uriIdentityService = uriIdentityService;
    this.testService = testService;
    this.restartingSessions = /* @__PURE__ */ new Set();
    this.disposables = new DisposableStore();
    this.initializing = false;
    this.sessionCancellationTokens = /* @__PURE__ */ new Map();
    this.haveDoneLazySetup = false;
    this.breakpointsToSendOnResourceSaved = /* @__PURE__ */ new Set();
    this._onDidChangeState = this.disposables.add(new Emitter());
    this._onDidNewSession = this.disposables.add(new Emitter());
    this._onWillNewSession = this.disposables.add(new Emitter());
    this._onDidEndSession = this.disposables.add(new Emitter());
    this.adapterManager = this.instantiationService.createInstance(AdapterManager, {
      onDidNewSession: this.onDidNewSession,
      configurationManager: () => this.configurationManager
    });
    this.disposables.add(this.adapterManager);
    this.configurationManager = this.instantiationService.createInstance(ConfigurationManager, this.adapterManager);
    this.disposables.add(this.configurationManager);
    this.debugStorage = this.disposables.add(this.instantiationService.createInstance(DebugStorage));
    this.chosenEnvironments = this.debugStorage.loadChosenEnvironments();
    this.model = this.instantiationService.createInstance(DebugModel, this.debugStorage);
    this.telemetry = this.instantiationService.createInstance(DebugTelemetry, this.model);
    this.viewModel = this.disposables.add(new ViewModel(contextKeyService));
    this.taskRunner = this.instantiationService.createInstance(DebugTaskRunner);
    this.disposables.add(this.fileService.onDidFilesChange((e) => this.onFileChanges(e)));
    this.disposables.add(this.lifecycleService.onWillShutdown(this.dispose, this));
    this.disposables.add(this.extensionHostDebugService.onAttachSession((event) => {
      const session = this.model.getSession(event.sessionId, true);
      if (session) {
        session.configuration.request = "attach";
        session.configuration.port = event.port;
        session.setSubId(event.subId);
        this.launchOrAttachToSession(session);
      }
    }));
    this.disposables.add(this.extensionHostDebugService.onTerminateSession((event) => {
      const session = this.model.getSession(event.sessionId);
      if (session && session.subId === event.subId) {
        session.disconnect();
      }
    }));
    this.disposables.add(this.viewModel.onDidFocusStackFrame(() => {
      this.onStateChange();
    }));
    this.disposables.add(this.viewModel.onDidFocusSession((session) => {
      this.onStateChange();
      if (session) {
        this.setExceptionBreakpointFallbackSession(session.getId());
      }
    }));
    this.disposables.add(Event.any(this.adapterManager.onDidRegisterDebugger, this.configurationManager.onDidSelectConfiguration)(() => {
      const debugUxValue = this.state !== State.Inactive || this.configurationManager.getAllConfigurations().length > 0 && this.adapterManager.hasEnabledDebuggers() ? "default" : "simple";
      this.debugUx.set(debugUxValue);
      this.debugStorage.storeDebugUxState(debugUxValue);
    }));
    this.disposables.add(this.model.onDidChangeCallStack(() => {
      const numberOfSessions = this.model.getSessions().filter((s) => !s.parentSession).length;
      this.activity?.dispose();
      if (numberOfSessions > 0) {
        const viewContainer = this.viewDescriptorService.getViewContainerByViewId(CALLSTACK_VIEW_ID);
        if (viewContainer) {
          this.activity = this.activityService.showViewContainerActivity(viewContainer.id, { badge: new NumberBadge(numberOfSessions, (n) => n === 1 ? nls.localize("1activeSession", "1 active session") : nls.localize("nActiveSessions", "{0} active sessions", n)) });
        }
      }
    }));
    this.disposables.add(editorService.onDidActiveEditorChange(() => {
      this.contextKeyService.bufferChangeEvents(() => {
        if (editorService.activeEditor === DisassemblyViewInput.instance) {
          this.disassemblyViewFocus.set(true);
        } else {
          this.disassemblyViewFocus?.reset();
        }
      });
    }));
    this.disposables.add(this.lifecycleService.onBeforeShutdown(() => {
      for (const editor of editorService.editors) {
        if (editor.resource?.scheme === DEBUG_MEMORY_SCHEME) {
          editor.dispose();
        }
      }
    }));
    this.disposables.add(extensionService.onWillStop((evt) => {
      evt.veto(
        this.model.getSessions().length > 0,
        nls.localize("active debug session", "A debug session is still running that would terminate.")
      );
    }));
    this.initContextKeys(contextKeyService);
  }
  initContextKeys(contextKeyService) {
    queueMicrotask(() => {
      contextKeyService.bufferChangeEvents(() => {
        this.debugType = CONTEXT_DEBUG_TYPE.bindTo(contextKeyService);
        this.debugState = CONTEXT_DEBUG_STATE.bindTo(contextKeyService);
        this.hasDebugged = CONTEXT_HAS_DEBUGGED.bindTo(contextKeyService);
        this.inDebugMode = CONTEXT_IN_DEBUG_MODE.bindTo(contextKeyService);
        this.debugUx = CONTEXT_DEBUG_UX.bindTo(contextKeyService);
        this.debugUx.set(this.debugStorage.loadDebugUxState());
        this.breakpointsExist = CONTEXT_BREAKPOINTS_EXIST.bindTo(contextKeyService);
        this.disassemblyViewFocus = CONTEXT_DISASSEMBLY_VIEW_FOCUS.bindTo(contextKeyService);
      });
      const setBreakpointsExistContext = () => this.breakpointsExist.set(!!(this.model.getBreakpoints().length || this.model.getDataBreakpoints().length || this.model.getFunctionBreakpoints().length));
      setBreakpointsExistContext();
      this.disposables.add(this.model.onDidChangeBreakpoints(() => setBreakpointsExistContext()));
    });
  }
  getModel() {
    return this.model;
  }
  getViewModel() {
    return this.viewModel;
  }
  getConfigurationManager() {
    return this.configurationManager;
  }
  getAdapterManager() {
    return this.adapterManager;
  }
  sourceIsNotAvailable(uri2) {
    this.model.sourceIsNotAvailable(uri2);
  }
  dispose() {
    this.disposables.dispose();
  }
  //---- state management
  get state() {
    const focusedSession = this.viewModel.focusedSession;
    if (focusedSession) {
      return focusedSession.state;
    }
    return this.initializing ? State.Initializing : State.Inactive;
  }
  get initializingOptions() {
    return this._initializingOptions;
  }
  startInitializingState(options) {
    if (!this.initializing) {
      this.initializing = true;
      this._initializingOptions = options;
      this.onStateChange();
    }
  }
  endInitializingState() {
    if (this.initializing) {
      this.initializing = false;
      this._initializingOptions = void 0;
      this.onStateChange();
    }
  }
  cancelTokens(id) {
    if (id) {
      const token = this.sessionCancellationTokens.get(id);
      if (token) {
        token.cancel();
        this.sessionCancellationTokens.delete(id);
      }
    } else {
      this.sessionCancellationTokens.forEach((t) => t.cancel());
      this.sessionCancellationTokens.clear();
    }
  }
  onStateChange() {
    const state = this.state;
    if (this.previousState !== state) {
      this.contextKeyService.bufferChangeEvents(() => {
        this.debugState.set(getStateLabel(state));
        this.inDebugMode.set(state !== State.Inactive);
        const debugUxValue = state !== State.Inactive && state !== State.Initializing || this.adapterManager.hasEnabledDebuggers() && this.configurationManager.selectedConfiguration.name ? "default" : "simple";
        this.debugUx.set(debugUxValue);
        this.debugStorage.storeDebugUxState(debugUxValue);
      });
      this.previousState = state;
      this._onDidChangeState.fire(state);
    }
  }
  get onDidChangeState() {
    return this._onDidChangeState.event;
  }
  get onDidNewSession() {
    return this._onDidNewSession.event;
  }
  get onWillNewSession() {
    return this._onWillNewSession.event;
  }
  get onDidEndSession() {
    return this._onDidEndSession.event;
  }
  lazySetup() {
    if (!this.haveDoneLazySetup) {
      this.disposables.add(this.fileService.registerProvider(DEBUG_MEMORY_SCHEME, this.disposables.add(new DebugMemoryFileSystemProvider(this))));
      this.haveDoneLazySetup = true;
    }
  }
  //---- life cycle management
  /**
   * main entry point
   * properly manages compounds, checks for errors and handles the initializing state.
   */
  async startDebugging(launch, configOrName, options, saveBeforeStart = !options?.parentSession) {
    const message = options && options.noDebug ? nls.localize("runTrust", "Running executes build tasks and program code from your workspace.") : nls.localize("debugTrust", "Debugging executes build tasks and program code from your workspace.");
    const trust = await this.workspaceTrustRequestService.requestWorkspaceTrust({ message });
    if (!trust) {
      return false;
    }
    this.lazySetup();
    this.startInitializingState(options);
    this.hasDebugged.set(true);
    try {
      await this.extensionService.activateByEvent("onDebug");
      if (saveBeforeStart) {
        await saveAllBeforeDebugStart(this.configurationService, this.editorService);
      }
      await this.extensionService.whenInstalledExtensionsRegistered();
      let config;
      let compound;
      if (!configOrName) {
        configOrName = this.configurationManager.selectedConfiguration.name;
      }
      if (typeof configOrName === "string" && launch) {
        config = launch.getConfiguration(configOrName);
        compound = launch.getCompound(configOrName);
      } else if (typeof configOrName !== "string") {
        config = configOrName;
      }
      if (compound) {
        if (!compound.configurations) {
          throw new Error(nls.localize(
            { key: "compoundMustHaveConfigurations", comment: ['compound indicates a "compounds" configuration item', '"configurations" is an attribute and should not be localized'] },
            'Compound must have "configurations" attribute set in order to start multiple configurations.'
          ));
        }
        if (compound.preLaunchTask) {
          const taskResult = await this.taskRunner.runTaskAndCheckErrors(launch?.workspace || this.contextService.getWorkspace(), compound.preLaunchTask);
          if (taskResult === TaskRunResult.Failure) {
            this.endInitializingState();
            return false;
          }
        }
        if (compound.stopAll) {
          options = { ...options, compoundRoot: new DebugCompoundRoot() };
        }
        const values = await Promise.all(compound.configurations.map((configData) => {
          const name = typeof configData === "string" ? configData : configData.name;
          if (name === compound.name) {
            return Promise.resolve(false);
          }
          let launchForName;
          if (typeof configData === "string") {
            const launchesContainingName = this.configurationManager.getLaunches().filter((l) => !!l.getConfiguration(name));
            if (launchesContainingName.length === 1) {
              launchForName = launchesContainingName[0];
            } else if (launch && launchesContainingName.length > 1 && launchesContainingName.indexOf(launch) >= 0) {
              launchForName = launch;
            } else {
              throw new Error(launchesContainingName.length === 0 ? nls.localize("noConfigurationNameInWorkspace", "Could not find launch configuration '{0}' in the workspace.", name) : nls.localize("multipleConfigurationNamesInWorkspace", "There are multiple launch configurations '{0}' in the workspace. Use folder name to qualify the configuration.", name));
            }
          } else if (configData.folder) {
            const launchesMatchingConfigData = this.configurationManager.getLaunches().filter((l) => l.workspace && l.workspace.name === configData.folder && !!l.getConfiguration(configData.name));
            if (launchesMatchingConfigData.length === 1) {
              launchForName = launchesMatchingConfigData[0];
            } else {
              throw new Error(nls.localize("noFolderWithName", "Can not find folder with name '{0}' for configuration '{1}' in compound '{2}'.", configData.folder, configData.name, compound.name));
            }
          }
          return this.createSession(launchForName, launchForName.getConfiguration(name), options);
        }));
        const result2 = values.every((success) => !!success);
        this.endInitializingState();
        return result2;
      }
      if (configOrName && !config) {
        const message2 = !!launch ? nls.localize("configMissing", "Configuration '{0}' is missing in 'launch.json'.", typeof configOrName === "string" ? configOrName : configOrName.name) : nls.localize("launchJsonDoesNotExist", "'launch.json' does not exist for passed workspace folder.");
        throw new Error(message2);
      }
      const result = await this.createSession(launch, config, options);
      this.endInitializingState();
      return result;
    } catch (err) {
      this.notificationService.error(err);
      this.endInitializingState();
      return Promise.reject(err);
    }
  }
  /**
   * gets the debugger for the type, resolves configurations by providers, substitutes variables and runs prelaunch tasks
   */
  async createSession(launch, config, options) {
    let type;
    if (config) {
      type = config.type;
    } else {
      config = /* @__PURE__ */ Object.create(null);
    }
    if (options && options.noDebug) {
      config.noDebug = true;
    } else if (options && typeof options.noDebug === "undefined" && options.parentSession && options.parentSession.configuration.noDebug) {
      config.noDebug = true;
    }
    const unresolvedConfig = deepClone(config);
    let guess;
    let activeEditor;
    if (!type) {
      activeEditor = this.editorService.activeEditor;
      if (activeEditor && activeEditor.resource) {
        const chosen = this.chosenEnvironments[activeEditor.resource.toString()];
        if (chosen) {
          type = chosen.type;
          if (chosen.dynamicLabel) {
            const dyn = await this.configurationManager.getDynamicConfigurationsByType(chosen.type);
            const found = dyn.find((d) => d.label === chosen.dynamicLabel);
            if (found) {
              launch = found.launch;
              Object.assign(config, found.config);
            }
          }
        }
      }
      if (!type) {
        guess = await this.adapterManager.guessDebugger(false);
        if (guess) {
          type = guess.debugger.type;
          if (guess.withConfig) {
            launch = guess.withConfig.launch;
            Object.assign(config, guess.withConfig.config);
          }
        }
      }
    }
    const initCancellationToken = new CancellationTokenSource();
    const sessionId = generateUuid();
    this.sessionCancellationTokens.set(sessionId, initCancellationToken);
    const configByProviders = await this.configurationManager.resolveConfigurationByProviders(launch && launch.workspace ? launch.workspace.uri : void 0, type, config, initCancellationToken.token);
    if (configByProviders && configByProviders.type) {
      try {
        let resolvedConfig = await this.substituteVariables(launch, configByProviders);
        if (!resolvedConfig) {
          return false;
        }
        if (initCancellationToken.token.isCancellationRequested) {
          return false;
        }
        let userConfirmedConcurrentSession = false;
        if (options?.startedByUser && resolvedConfig && resolvedConfig.suppressMultipleSessionWarning !== true) {
          const existingSessions = this.model.getSessions();
          const workspace2 = launch?.workspace;
          const existingSession = existingSessions.find(
            (s) => s.configuration.name === resolvedConfig.name && s.configuration.type === resolvedConfig.type && s.configuration.request === resolvedConfig.request && s.root === workspace2
          );
          if (existingSession) {
            const confirmed = await this.confirmConcurrentSession(existingSession.getLabel());
            if (!confirmed) {
              return false;
            }
            userConfirmedConcurrentSession = true;
          }
        }
        const workspace = launch?.workspace || this.contextService.getWorkspace();
        const taskResult = await this.taskRunner.runTaskAndCheckErrors(workspace, resolvedConfig.preLaunchTask);
        if (taskResult === TaskRunResult.Failure) {
          return false;
        }
        const cfg = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : void 0, resolvedConfig.type, resolvedConfig, initCancellationToken.token);
        if (!cfg) {
          if (launch && type && cfg === null && !initCancellationToken.token.isCancellationRequested) {
            await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
          }
          return false;
        }
        resolvedConfig = cfg;
        const dbg = this.adapterManager.getDebugger(resolvedConfig.type);
        if (!dbg || configByProviders.request !== "attach" && configByProviders.request !== "launch") {
          let message;
          if (configByProviders.request !== "attach" && configByProviders.request !== "launch") {
            message = configByProviders.request ? nls.localize("debugRequestNotSupported", "Attribute '{0}' has an unsupported value '{1}' in the chosen debug configuration.", "request", configByProviders.request) : nls.localize("debugRequesMissing", "Attribute '{0}' is missing from the chosen debug configuration.", "request");
          } else {
            message = resolvedConfig.type ? nls.localize("debugTypeNotSupported", "Configured debug type '{0}' is not supported.", resolvedConfig.type) : nls.localize("debugTypeMissing", "Missing property 'type' for the chosen launch configuration.");
          }
          const actionList = [];
          actionList.push(toAction({
            id: "installAdditionalDebuggers",
            label: nls.localize({ key: "installAdditionalDebuggers", comment: ['Placeholder is the debug type, so for example "node", "python"'] }, "Install {0} Extension", resolvedConfig.type),
            enabled: true,
            run: async () => this.commandService.executeCommand("debug.installAdditionalDebuggers", resolvedConfig?.type)
          }));
          await this.showError(message, actionList);
          return false;
        }
        if (!dbg.enabled) {
          await this.showError(debuggerDisabledMessage(dbg.type), []);
          return false;
        }
        const result = await this.doCreateSession(sessionId, launch?.workspace, { resolved: resolvedConfig, unresolved: unresolvedConfig }, options, userConfirmedConcurrentSession);
        if (result && guess && activeEditor && activeEditor.resource) {
          this.chosenEnvironments[activeEditor.resource.toString()] = { type: guess.debugger.type, dynamicLabel: guess.withConfig?.label };
          this.debugStorage.storeChosenEnvironments(this.chosenEnvironments);
        }
        return result;
      } catch (err) {
        if (err && err.message) {
          await this.showError(err.message);
        } else if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
          await this.showError(nls.localize("noFolderWorkspaceDebugError", "The active file can not be debugged. Make sure it is saved and that you have a debug extension installed for that file type."));
        }
        if (launch && !initCancellationToken.token.isCancellationRequested) {
          await launch.openConfigFile({ preserveFocus: true }, initCancellationToken.token);
        }
        return false;
      }
    }
    if (launch && type && configByProviders === null && !initCancellationToken.token.isCancellationRequested) {
      await launch.openConfigFile({ preserveFocus: true, type }, initCancellationToken.token);
    }
    return false;
  }
  /**
   * instantiates the new session, initializes the session, registers session listeners and reports telemetry
   */
  async doCreateSession(sessionId, root, configuration, options, userConfirmedConcurrentSession = false) {
    const session = this.instantiationService.createInstance(DebugSession, sessionId, configuration, root, this.model, options);
    if (!userConfirmedConcurrentSession && options?.startedByUser && this.model.getSessions().some(
      (s) => s.configuration.name === configuration.resolved.name && s.configuration.type === configuration.resolved.type && s.configuration.request === configuration.resolved.request && s.root === root
    ) && configuration.resolved.suppressMultipleSessionWarning !== true) {
      const confirmed = await this.confirmConcurrentSession(session.getLabel());
      if (!confirmed) {
        return false;
      }
    }
    this.model.addSession(session);
    this._onWillNewSession.fire(session);
    const openDebug = this.configurationService.getValue("debug").openDebug;
    if (!configuration.resolved.noDebug && (openDebug === "openOnSessionStart" || openDebug === "openOnFirstSessionStart" && this.viewModel.firstSessionStart) && !session.suppressDebugView) {
      await this.paneCompositeService.openPaneComposite(VIEWLET_ID, ViewContainerLocation.Sidebar);
    }
    try {
      await this.launchOrAttachToSession(session);
      const internalConsoleOptions = session.configuration.internalConsoleOptions || this.configurationService.getValue("debug").internalConsoleOptions;
      if (internalConsoleOptions === "openOnSessionStart" || this.viewModel.firstSessionStart && internalConsoleOptions === "openOnFirstSessionStart") {
        this.viewsService.openView(REPL_VIEW_ID, false);
      }
      this.viewModel.firstSessionStart = false;
      const showSubSessions = this.configurationService.getValue("debug").showSubSessionsInToolBar;
      const sessions = this.model.getSessions();
      const shownSessions = showSubSessions ? sessions : sessions.filter((s) => !s.parentSession);
      if (shownSessions.length > 1) {
        this.viewModel.setMultiSessionView(true);
      }
      this._onDidNewSession.fire(session);
      return true;
    } catch (error) {
      if (errors.isCancellationError(error)) {
        return false;
      }
      if (session && session.getReplElements().length > 0) {
        this.viewsService.openView(REPL_VIEW_ID, false);
      }
      if (session.configuration && session.configuration.request === "attach" && session.configuration.__autoAttach) {
        return false;
      }
      const errorMessage = error instanceof Error ? error.message : error;
      if (error.showUser !== false) {
        await this.showError(errorMessage, isErrorWithActions(error) ? error.actions : []);
      }
      return false;
    }
  }
  async confirmConcurrentSession(sessionLabel) {
    const result = await this.dialogService.confirm({
      message: nls.localize("multipleSession", "'{0}' is already running. Do you want to start another instance?", sessionLabel)
    });
    return result.confirmed;
  }
  async launchOrAttachToSession(session, forceFocus = false) {
    this.registerSessionListeners(session);
    const dbgr = this.adapterManager.getDebugger(session.configuration.type);
    try {
      await session.initialize(dbgr);
      await session.launchOrAttach(session.configuration);
      const launchJsonExists = !!session.root && !!this.configurationService.getValue("launch", { resource: session.root.uri });
      await this.telemetry.logDebugSessionStart(dbgr, launchJsonExists);
      if (forceFocus || !this.viewModel.focusedSession || session.parentSession === this.viewModel.focusedSession && session.compact) {
        await this.focusStackFrame(void 0, void 0, session);
      }
    } catch (err) {
      if (this.viewModel.focusedSession === session) {
        await this.focusStackFrame(void 0);
      }
      return Promise.reject(err);
    }
  }
  registerSessionListeners(session) {
    const listenerDisposables = new DisposableStore();
    this.disposables.add(listenerDisposables);
    const sessionRunningScheduler = listenerDisposables.add(new RunOnceScheduler(() => {
      if (session.state === State.Running && this.viewModel.focusedSession === session) {
        this.viewModel.setFocus(void 0, this.viewModel.focusedThread, session, false);
      }
    }, 200));
    listenerDisposables.add(session.onDidChangeState(() => {
      if (session.state === State.Running && this.viewModel.focusedSession === session) {
        sessionRunningScheduler.schedule();
      }
      if (session === this.viewModel.focusedSession) {
        this.onStateChange();
      }
    }));
    listenerDisposables.add(this.onDidEndSession((e) => {
      if (e.session === session) {
        this.disposables.delete(listenerDisposables);
      }
    }));
    listenerDisposables.add(session.onDidEndAdapter(async (adapterExitEvent) => {
      if (adapterExitEvent) {
        if (adapterExitEvent.error) {
          this.notificationService.error(nls.localize("debugAdapterCrash", "Debug adapter process has terminated unexpectedly ({0})", adapterExitEvent.error.message || adapterExitEvent.error.toString()));
        }
        this.telemetry.logDebugSessionStop(session, adapterExitEvent);
      }
      const extensionDebugSession = getExtensionHostDebugSession(session);
      if (extensionDebugSession && extensionDebugSession.state === State.Running && extensionDebugSession.configuration.noDebug) {
        this.extensionHostDebugService.close(extensionDebugSession.getId());
      }
      if (session.configuration.postDebugTask) {
        const root = session.root ?? this.contextService.getWorkspace();
        try {
          await this.taskRunner.runTask(root, session.configuration.postDebugTask);
        } catch (err) {
          this.notificationService.error(err);
        }
      }
      this.endInitializingState();
      this.cancelTokens(session.getId());
      if (this.configurationService.getValue("debug").closeReadonlyTabsOnEnd) {
        const editorsToClose = this.editorService.getEditors(EditorsOrder.SEQUENTIAL).filter(({ editor }) => {
          return editor.resource?.scheme === DEBUG_SCHEME && session.getId() === Source.getEncodedDebugData(editor.resource).sessionId;
        });
        this.editorService.closeEditors(editorsToClose);
      }
      this._onDidEndSession.fire({ session, restart: this.restartingSessions.has(session) });
      const focusedSession = this.viewModel.focusedSession;
      if (focusedSession && focusedSession.getId() === session.getId()) {
        const { session: session2, thread, stackFrame } = getStackFrameThreadAndSessionToFocus(this.model, void 0, void 0, void 0, focusedSession);
        this.viewModel.setFocus(stackFrame, thread, session2, false);
      }
      if (this.model.getSessions().length === 0) {
        this.viewModel.setMultiSessionView(false);
        if (this.layoutService.isVisible(Parts.SIDEBAR_PART) && this.configurationService.getValue("debug").openExplorerOnEnd) {
          this.paneCompositeService.openPaneComposite(EXPLORER_VIEWLET_ID, ViewContainerLocation.Sidebar);
        }
        const dataBreakpoints = this.model.getDataBreakpoints().filter((dbp) => !dbp.canPersist);
        dataBreakpoints.forEach((dbp) => this.model.removeDataBreakpoints(dbp.getId()));
        if (this.configurationService.getValue("debug").console.closeOnEnd) {
          const debugConsoleContainer = this.viewDescriptorService.getViewContainerByViewId(REPL_VIEW_ID);
          if (debugConsoleContainer && this.viewsService.isViewContainerVisible(debugConsoleContainer.id)) {
            this.viewsService.closeViewContainer(debugConsoleContainer.id);
          }
        }
      }
      this.model.removeExceptionBreakpointsForSession(session.getId());
    }));
  }
  async restartSession(session, restartData) {
    if (session.saveBeforeRestart) {
      await saveAllBeforeDebugStart(this.configurationService, this.editorService);
    }
    const isAutoRestart = !!restartData;
    const runTasks = async () => {
      if (isAutoRestart) {
        return Promise.resolve(TaskRunResult.Success);
      }
      const root = session.root || this.contextService.getWorkspace();
      await this.taskRunner.runTask(root, session.configuration.preRestartTask);
      await this.taskRunner.runTask(root, session.configuration.postDebugTask);
      const taskResult1 = await this.taskRunner.runTaskAndCheckErrors(root, session.configuration.preLaunchTask);
      if (taskResult1 !== TaskRunResult.Success) {
        return taskResult1;
      }
      return this.taskRunner.runTaskAndCheckErrors(root, session.configuration.postRestartTask);
    };
    const extensionDebugSession = getExtensionHostDebugSession(session);
    if (extensionDebugSession) {
      const taskResult = await runTasks();
      if (taskResult === TaskRunResult.Success) {
        this.extensionHostDebugService.reload(extensionDebugSession.getId());
      }
      return;
    }
    let needsToSubstitute = false;
    let unresolved;
    const launch = session.root ? this.configurationManager.getLaunch(session.root.uri) : void 0;
    if (launch) {
      unresolved = launch.getConfiguration(session.configuration.name);
      if (unresolved && !equals(unresolved, session.unresolvedConfiguration)) {
        unresolved.noDebug = session.configuration.noDebug;
        needsToSubstitute = true;
      }
    }
    let resolved = session.configuration;
    if (launch && needsToSubstitute && unresolved) {
      const initCancellationToken = new CancellationTokenSource();
      this.sessionCancellationTokens.set(session.getId(), initCancellationToken);
      const resolvedByProviders = await this.configurationManager.resolveConfigurationByProviders(launch.workspace ? launch.workspace.uri : void 0, unresolved.type, unresolved, initCancellationToken.token);
      if (resolvedByProviders) {
        resolved = await this.substituteVariables(launch, resolvedByProviders);
        if (resolved && !initCancellationToken.token.isCancellationRequested) {
          resolved = await this.configurationManager.resolveDebugConfigurationWithSubstitutedVariables(launch && launch.workspace ? launch.workspace.uri : void 0, resolved.type, resolved, initCancellationToken.token);
        }
      } else {
        resolved = resolvedByProviders;
      }
    }
    if (resolved) {
      session.setConfiguration({ resolved, unresolved });
    }
    session.configuration.__restart = restartData;
    const doRestart = async (fn) => {
      this.restartingSessions.add(session);
      let didRestart = false;
      try {
        didRestart = await fn() !== false;
      } catch (e) {
        didRestart = false;
        throw e;
      } finally {
        this.restartingSessions.delete(session);
        if (!didRestart) {
          this._onDidEndSession.fire({ session, restart: false });
        }
      }
    };
    for (const breakpoint of this.model.getBreakpoints({ triggeredOnly: true })) {
      breakpoint.setSessionDidTrigger(session.getId(), false);
    }
    if (session.correlatedTestRun) {
      if (!session.correlatedTestRun.completedAt) {
        session.cancelCorrelatedTestRun();
        await Event.toPromise(session.correlatedTestRun.onComplete);
      }
      this.testService.runResolvedTests(session.correlatedTestRun.request);
      return;
    }
    if (session.capabilities.supportsRestartRequest) {
      const taskResult = await runTasks();
      if (taskResult === TaskRunResult.Success) {
        await doRestart(async () => {
          await session.restart();
          return true;
        });
      }
      return;
    }
    const shouldFocus = !!this.viewModel.focusedSession && session.getId() === this.viewModel.focusedSession.getId();
    return doRestart(async () => {
      if (isAutoRestart) {
        await session.disconnect(true);
      } else {
        await session.terminate(true);
      }
      return new Promise((c, e) => {
        setTimeout(async () => {
          const taskResult = await runTasks();
          if (taskResult !== TaskRunResult.Success) {
            return c(false);
          }
          if (!resolved) {
            return c(false);
          }
          try {
            await this.launchOrAttachToSession(session, shouldFocus);
            this._onDidNewSession.fire(session);
            c(true);
          } catch (error) {
            e(error);
          }
        }, 300);
      });
    });
  }
  async stopSession(session, disconnect = false, suspend = false) {
    if (session) {
      return disconnect ? session.disconnect(void 0, suspend) : session.terminate();
    }
    const sessions = this.model.getSessions();
    if (sessions.length === 0) {
      this.taskRunner.cancel();
      await this.quickInputService.cancel();
      this.endInitializingState();
      this.cancelTokens(void 0);
    }
    return Promise.all(sessions.map((s) => disconnect ? s.disconnect(void 0, suspend) : s.terminate()));
  }
  async substituteVariables(launch, config) {
    const dbg = this.adapterManager.getDebugger(config.type);
    if (dbg) {
      let folder = void 0;
      if (launch && launch.workspace) {
        folder = launch.workspace;
      } else {
        const folders = this.contextService.getWorkspace().folders;
        if (folders.length === 1) {
          folder = folders[0];
        }
      }
      try {
        return await dbg.substituteVariables(folder, config);
      } catch (err) {
        if (err.message !== errors.canceledName) {
          this.showError(err.message, void 0, !!launch?.getConfiguration(config.name));
        }
        return void 0;
      }
    }
    return Promise.resolve(config);
  }
  async showError(message, errorActions = [], promptLaunchJson = true) {
    const configureAction = toAction({ id: DEBUG_CONFIGURE_COMMAND_ID, label: DEBUG_CONFIGURE_LABEL, enabled: true, run: () => this.commandService.executeCommand(DEBUG_CONFIGURE_COMMAND_ID) });
    const actions = errorActions.filter((action) => action.id.endsWith(".command")).length > 0 ? errorActions : [...errorActions, ...promptLaunchJson ? [configureAction] : []];
    await this.dialogService.prompt({
      type: severity.Error,
      message,
      buttons: actions.map((action) => ({
        label: action.label,
        run: () => action.run()
      })),
      cancelButton: true
    });
  }
  //---- focus management
  async focusStackFrame(_stackFrame, _thread, _session, options) {
    const { stackFrame, thread, session } = getStackFrameThreadAndSessionToFocus(this.model, _stackFrame, _thread, _session);
    if (stackFrame) {
      const editor = await stackFrame.openInEditor(this.editorService, options?.preserveFocus ?? true, options?.sideBySide, options?.pinned);
      if (editor) {
        if (editor.input === DisassemblyViewInput.instance) {
        } else {
          const control = editor.getControl();
          if (stackFrame && isCodeEditor(control) && control.hasModel()) {
            const model = control.getModel();
            const lineNumber = stackFrame.range.startLineNumber;
            if (lineNumber >= 1 && lineNumber <= model.getLineCount()) {
              const lineContent = control.getModel().getLineContent(lineNumber);
              aria.alert(nls.localize(
                { key: "debuggingPaused", comment: ['First placeholder is the file line content, second placeholder is the reason why debugging is stopped, for example "breakpoint", third is the stack frame name, and last is the line number.'] },
                "{0}, debugging paused {1}, {2}:{3}",
                lineContent,
                thread && thread.stoppedDetails ? `, reason ${thread.stoppedDetails.reason}` : "",
                stackFrame.source ? stackFrame.source.name : "",
                stackFrame.range.startLineNumber
              ));
            }
          }
        }
      }
    }
    if (session) {
      this.debugType.set(session.configuration.type);
    } else {
      this.debugType.reset();
    }
    this.viewModel.setFocus(stackFrame, thread, session, !!options?.explicit);
  }
  //---- watches
  addWatchExpression(name) {
    const we = this.model.addWatchExpression(name);
    if (!name) {
      this.viewModel.setSelectedExpression(we, false);
    }
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  renameWatchExpression(id, newName) {
    this.model.renameWatchExpression(id, newName);
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  moveWatchExpression(id, position) {
    this.model.moveWatchExpression(id, position);
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  removeWatchExpressions(id) {
    this.model.removeWatchExpressions(id);
    this.debugStorage.storeWatchExpressions(this.model.getWatchExpressions());
  }
  //---- breakpoints
  canSetBreakpointsIn(model) {
    return this.adapterManager.canSetBreakpointsIn(model);
  }
  async enableOrDisableBreakpoints(enable, breakpoint) {
    if (breakpoint) {
      this.model.setEnablement(breakpoint, enable);
      this.debugStorage.storeBreakpoints(this.model);
      if (breakpoint instanceof Breakpoint) {
        await this.makeTriggeredBreakpointsMatchEnablement(enable, breakpoint);
        await this.sendBreakpoints(breakpoint.originalUri);
      } else if (breakpoint instanceof FunctionBreakpoint) {
        await this.sendFunctionBreakpoints();
      } else if (breakpoint instanceof DataBreakpoint) {
        await this.sendDataBreakpoints();
      } else if (breakpoint instanceof InstructionBreakpoint) {
        await this.sendInstructionBreakpoints();
      } else {
        await this.sendExceptionBreakpoints();
      }
    } else {
      this.model.enableOrDisableAllBreakpoints(enable);
      this.debugStorage.storeBreakpoints(this.model);
      await this.sendAllBreakpoints();
    }
    this.debugStorage.storeBreakpoints(this.model);
  }
  async addBreakpoints(uri2, rawBreakpoints, ariaAnnounce = true) {
    const breakpoints = this.model.addBreakpoints(uri2, rawBreakpoints);
    if (ariaAnnounce) {
      breakpoints.forEach((bp) => aria.status(nls.localize("breakpointAdded", "Added breakpoint, line {0}, file {1}", bp.lineNumber, uri2.fsPath)));
    }
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendBreakpoints(uri2);
    this.debugStorage.storeBreakpoints(this.model);
    return breakpoints;
  }
  async updateBreakpoints(uri2, data, sendOnResourceSaved) {
    this.model.updateBreakpoints(data);
    this.debugStorage.storeBreakpoints(this.model);
    if (sendOnResourceSaved) {
      this.breakpointsToSendOnResourceSaved.add(uri2);
    } else {
      await this.sendBreakpoints(uri2);
      this.debugStorage.storeBreakpoints(this.model);
    }
  }
  async removeBreakpoints(id) {
    const breakpoints = this.model.getBreakpoints();
    const toRemove = id === void 0 ? breakpoints : id instanceof Array ? breakpoints.filter((bp) => id.includes(bp.getId())) : breakpoints.filter((bp) => bp.getId() === id);
    toRemove.forEach((bp) => aria.status(nls.localize("breakpointRemoved", "Removed breakpoint, line {0}, file {1}", bp.lineNumber, bp.uri.fsPath)));
    const urisToClear = new Set(toRemove.map((bp) => bp.originalUri.toString()));
    this.model.removeBreakpoints(toRemove);
    this.unlinkTriggeredBreakpoints(breakpoints, toRemove).forEach((uri2) => urisToClear.add(uri2.toString()));
    this.debugStorage.storeBreakpoints(this.model);
    await Promise.all([...urisToClear].map((uri2) => this.sendBreakpoints(URI.parse(uri2))));
  }
  setBreakpointsActivated(activated) {
    this.model.setBreakpointsActivated(activated);
    return this.sendAllBreakpoints();
  }
  async addFunctionBreakpoint(opts, id) {
    this.model.addFunctionBreakpoint(opts ?? { name: "" }, id);
    if (opts) {
      this.debugStorage.storeBreakpoints(this.model);
      await this.sendFunctionBreakpoints();
      this.debugStorage.storeBreakpoints(this.model);
    }
  }
  async updateFunctionBreakpoint(id, update) {
    this.model.updateFunctionBreakpoint(id, update);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendFunctionBreakpoints();
  }
  async removeFunctionBreakpoints(id) {
    this.model.removeFunctionBreakpoints(id);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendFunctionBreakpoints();
  }
  async addDataBreakpoint(opts) {
    this.model.addDataBreakpoint(opts);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendDataBreakpoints();
    this.debugStorage.storeBreakpoints(this.model);
  }
  async updateDataBreakpoint(id, update) {
    this.model.updateDataBreakpoint(id, update);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendDataBreakpoints();
  }
  async removeDataBreakpoints(id) {
    this.model.removeDataBreakpoints(id);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendDataBreakpoints();
  }
  async addInstructionBreakpoint(opts) {
    this.model.addInstructionBreakpoint(opts);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendInstructionBreakpoints();
    this.debugStorage.storeBreakpoints(this.model);
  }
  async removeInstructionBreakpoints(instructionReference, offset, address) {
    this.model.removeInstructionBreakpoints(instructionReference, offset, address);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendInstructionBreakpoints();
  }
  setExceptionBreakpointFallbackSession(sessionId) {
    this.model.setExceptionBreakpointFallbackSession(sessionId);
    this.debugStorage.storeBreakpoints(this.model);
  }
  setExceptionBreakpointsForSession(session, filters) {
    this.model.setExceptionBreakpointsForSession(session.getId(), filters);
    this.debugStorage.storeBreakpoints(this.model);
  }
  async setExceptionBreakpointCondition(exceptionBreakpoint, condition) {
    this.model.setExceptionBreakpointCondition(exceptionBreakpoint, condition);
    this.debugStorage.storeBreakpoints(this.model);
    await this.sendExceptionBreakpoints();
  }
  async sendAllBreakpoints(session) {
    const setBreakpointsPromises = distinct(this.model.getBreakpoints(), (bp) => bp.originalUri.toString()).map((bp) => this.sendBreakpoints(bp.originalUri, false, session));
    if (session?.capabilities.supportsConfigurationDoneRequest) {
      await Promise.all([
        ...setBreakpointsPromises,
        this.sendFunctionBreakpoints(session),
        this.sendDataBreakpoints(session),
        this.sendInstructionBreakpoints(session),
        this.sendExceptionBreakpoints(session)
      ]);
    } else {
      await Promise.all(setBreakpointsPromises);
      await this.sendFunctionBreakpoints(session);
      await this.sendDataBreakpoints(session);
      await this.sendInstructionBreakpoints(session);
      await this.sendExceptionBreakpoints(session);
    }
  }
  /**
   * Removes the condition of triggered breakpoints that depended on
   * breakpoints in `removedBreakpoints`. Returns the URIs of resources that
   * had their breakpoints changed in this way.
   */
  unlinkTriggeredBreakpoints(allBreakpoints, removedBreakpoints) {
    const affectedUris = [];
    for (const removed of removedBreakpoints) {
      for (const existing of allBreakpoints) {
        if (!removedBreakpoints.includes(existing) && existing.triggeredBy === removed.getId()) {
          this.model.updateBreakpoints(/* @__PURE__ */ new Map([[existing.getId(), { triggeredBy: void 0 }]]));
          affectedUris.push(existing.originalUri);
        }
      }
    }
    return affectedUris;
  }
  async makeTriggeredBreakpointsMatchEnablement(enable, breakpoint) {
    if (enable) {
      if (breakpoint.triggeredBy) {
        const trigger = this.model.getBreakpoints().find((bp) => breakpoint.triggeredBy === bp.getId());
        if (trigger && !trigger.enabled) {
          await this.enableOrDisableBreakpoints(enable, trigger);
        }
      }
    }
    await Promise.all(
      this.model.getBreakpoints().filter((bp) => bp.triggeredBy === breakpoint.getId() && bp.enabled !== enable).map((bp) => this.enableOrDisableBreakpoints(enable, bp))
    );
  }
  async sendBreakpoints(modelUri, sourceModified = false, session) {
    const breakpointsToSend = this.model.getBreakpoints({ originalUri: modelUri, enabledOnly: true });
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (!s.configuration.noDebug) {
        const sessionBps = breakpointsToSend.filter((bp) => !bp.triggeredBy || bp.getSessionDidTrigger(s.getId()));
        await s.sendBreakpoints(modelUri, sessionBps, sourceModified);
      }
    });
  }
  async sendFunctionBreakpoints(session) {
    const breakpointsToSend = this.model.getFunctionBreakpoints().filter((fbp) => fbp.enabled && this.model.areBreakpointsActivated());
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (s.capabilities.supportsFunctionBreakpoints && !s.configuration.noDebug) {
        await s.sendFunctionBreakpoints(breakpointsToSend);
      }
    });
  }
  async sendDataBreakpoints(session) {
    const breakpointsToSend = this.model.getDataBreakpoints().filter((fbp) => fbp.enabled && this.model.areBreakpointsActivated());
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (s.capabilities.supportsDataBreakpoints && !s.configuration.noDebug) {
        await s.sendDataBreakpoints(breakpointsToSend);
      }
    });
  }
  async sendInstructionBreakpoints(session) {
    const breakpointsToSend = this.model.getInstructionBreakpoints().filter((fbp) => fbp.enabled && this.model.areBreakpointsActivated());
    await sendToOneOrAllSessions(this.model, session, async (s) => {
      if (s.capabilities.supportsInstructionBreakpoints && !s.configuration.noDebug) {
        await s.sendInstructionBreakpoints(breakpointsToSend);
      }
    });
  }
  sendExceptionBreakpoints(session) {
    return sendToOneOrAllSessions(this.model, session, async (s) => {
      const enabledExceptionBps = this.model.getExceptionBreakpointsForSession(s.getId()).filter((exb) => exb.enabled);
      if (s.capabilities.supportsConfigurationDoneRequest && (!s.capabilities.exceptionBreakpointFilters || s.capabilities.exceptionBreakpointFilters.length === 0)) {
        return;
      }
      if (!s.configuration.noDebug) {
        await s.sendExceptionBreakpoints(enabledExceptionBps);
      }
    });
  }
  onFileChanges(fileChangesEvent) {
    const toRemove = this.model.getBreakpoints().filter((bp) => fileChangesEvent.contains(bp.originalUri, FileChangeType.DELETED));
    if (toRemove.length) {
      this.model.removeBreakpoints(toRemove);
    }
    const toSend = [];
    for (const uri2 of this.breakpointsToSendOnResourceSaved) {
      if (fileChangesEvent.contains(uri2, FileChangeType.UPDATED)) {
        toSend.push(uri2);
      }
    }
    for (const uri2 of toSend) {
      this.breakpointsToSendOnResourceSaved.delete(uri2);
      this.sendBreakpoints(uri2, true);
    }
  }
  async runTo(uri2, lineNumber, column) {
    let breakpointToRemove;
    let threadToContinue = this.getViewModel().focusedThread;
    const addTempBreakPoint = async () => {
      const bpExists = !!this.getModel().getBreakpoints({ column, lineNumber, uri: uri2 }).length;
      if (!bpExists) {
        const addResult = await this.addAndValidateBreakpoints(uri2, lineNumber, column);
        if (addResult.thread) {
          threadToContinue = addResult.thread;
        }
        if (addResult.breakpoint) {
          breakpointToRemove = addResult.breakpoint;
        }
      }
      return { threadToContinue, breakpointToRemove };
    };
    const removeTempBreakPoint = (state) => {
      if (state === State.Stopped || state === State.Inactive) {
        if (breakpointToRemove) {
          this.removeBreakpoints(breakpointToRemove.getId());
        }
        return true;
      }
      return false;
    };
    await addTempBreakPoint();
    if (this.state === State.Inactive) {
      const { launch, name, getConfig } = this.getConfigurationManager().selectedConfiguration;
      const config = await getConfig();
      const configOrName = config ? Object.assign(deepClone(config), {}) : name;
      const listener = this.onDidChangeState((state) => {
        if (removeTempBreakPoint(state)) {
          listener.dispose();
        }
      });
      await this.startDebugging(launch, configOrName, void 0, true);
    }
    if (this.state === State.Stopped) {
      const focusedSession = this.getViewModel().focusedSession;
      if (!focusedSession || !threadToContinue) {
        return;
      }
      const listener = threadToContinue.session.onDidChangeState(() => {
        if (removeTempBreakPoint(focusedSession.state)) {
          listener.dispose();
        }
      });
      await threadToContinue.continue();
    }
  }
  async addAndValidateBreakpoints(uri2, lineNumber, column) {
    const debugModel = this.getModel();
    const viewModel = this.getViewModel();
    const breakpoints = await this.addBreakpoints(uri2, [{ lineNumber, column }], false);
    const breakpoint = breakpoints?.[0];
    if (!breakpoint) {
      return { breakpoint: void 0, thread: viewModel.focusedThread };
    }
    if (!breakpoint.verified) {
      let listener;
      await raceTimeout(new Promise((resolve) => {
        listener = debugModel.onDidChangeBreakpoints(() => {
          if (breakpoint.verified) {
            resolve();
          }
        });
      }), 2e3);
      listener.dispose();
    }
    let Score;
    ((Score2) => {
      Score2[Score2["Focused"] = 0] = "Focused";
      Score2[Score2["Verified"] = 1] = "Verified";
      Score2[Score2["VerifiedAndPausedInFile"] = 2] = "VerifiedAndPausedInFile";
      Score2[Score2["VerifiedAndFocused"] = 3] = "VerifiedAndFocused";
    })(Score || (Score = {}));
    let bestThread = viewModel.focusedThread;
    let bestScore = 0 /* Focused */;
    for (const sessionId of breakpoint.sessionsThatVerified) {
      const session = debugModel.getSession(sessionId);
      if (!session) {
        continue;
      }
      const threads = session.getAllThreads().filter((t) => t.stopped);
      if (bestScore < 3 /* VerifiedAndFocused */) {
        if (viewModel.focusedThread && threads.includes(viewModel.focusedThread)) {
          bestThread = viewModel.focusedThread;
          bestScore = 3 /* VerifiedAndFocused */;
        }
      }
      if (bestScore < 2 /* VerifiedAndPausedInFile */) {
        const pausedInThisFile = threads.find((t) => {
          const top = t.getTopStackFrame();
          return top && this.uriIdentityService.extUri.isEqual(top.source.uri, uri2);
        });
        if (pausedInThisFile) {
          bestThread = pausedInThisFile;
          bestScore = 2 /* VerifiedAndPausedInFile */;
        }
      }
      if (bestScore < 1 /* Verified */) {
        bestThread = threads[0];
        bestScore = 2 /* VerifiedAndPausedInFile */;
      }
    }
    return { thread: bestThread, breakpoint };
  }
};
DebugService = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IPaneCompositePartService),
  __decorateParam(2, IViewsService),
  __decorateParam(3, IViewDescriptorService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, IWorkspaceContextService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, ILifecycleService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IExtensionService),
  __decorateParam(12, IFileService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IExtensionHostDebugService),
  __decorateParam(15, IActivityService),
  __decorateParam(16, ICommandService),
  __decorateParam(17, IQuickInputService),
  __decorateParam(18, IWorkspaceTrustRequestService),
  __decorateParam(19, IUriIdentityService),
  __decorateParam(20, ITestService)
], DebugService);
function getStackFrameThreadAndSessionToFocus(model, stackFrame, thread, session, avoidSession) {
  if (!session) {
    if (stackFrame || thread) {
      session = stackFrame ? stackFrame.thread.session : thread.session;
    } else {
      const sessions = model.getSessions();
      const stoppedSession = sessions.find((s) => s.state === State.Stopped);
      session = stoppedSession || sessions.find((s) => s !== avoidSession && s !== avoidSession?.parentSession) || (sessions.length ? sessions[0] : void 0);
    }
  }
  if (!thread) {
    if (stackFrame) {
      thread = stackFrame.thread;
    } else {
      const threads = session ? session.getAllThreads() : void 0;
      const stoppedThread = threads && threads.find((t) => t.stopped);
      thread = stoppedThread || (threads && threads.length ? threads[0] : void 0);
    }
  }
  if (!stackFrame && thread) {
    stackFrame = thread.getTopStackFrame();
  }
  return { session, thread, stackFrame };
}
async function sendToOneOrAllSessions(model, session, send) {
  if (session) {
    await send(session);
  } else {
    await Promise.all(model.getSessions().map((s) => send(s)));
  }
}
export {
  DebugService,
  getStackFrameThreadAndSessionToFocus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2RlYnVnL2Jyb3dzZXIvZGVidWdTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYXJpYSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIHRvQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzRXJyb3JXaXRoQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZWVwQ2xvbmUsIGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuXG5pbXBvcnQgc2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgVVJJLCBVUkkgYXMgdXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGVidWcvY29tbW9uL2V4dGVuc2lvbkhvc3REZWJ1Zy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZVR5cGUsIEZpbGVDaGFuZ2VzRXZlbnQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgRWRpdG9yc09yZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgVmlld0NvbnRhaW5lckxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IElBY3Rpdml0eVNlcnZpY2UsIE51bWJlckJhZGdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYWN0aXZpdHkvY29tbW9uL2FjdGl2aXR5LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSwgUGFydHMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFZJRVdMRVRfSUQgYXMgRVhQTE9SRVJfVklFV0xFVF9JRCB9IGZyb20gJy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJVGVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXN0aW5nL2NvbW1vbi90ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDQUxMU1RBQ0tfVklFV19JRCwgQ09OVEVYVF9CUkVBS1BPSU5UU19FWElTVCwgQ09OVEVYVF9ERUJVR19TVEFURSwgQ09OVEVYVF9ERUJVR19UWVBFLCBDT05URVhUX0RFQlVHX1VYLCBDT05URVhUX0RJU0FTU0VNQkxZX1ZJRVdfRk9DVVMsIENPTlRFWFRfSEFTX0RFQlVHR0VELCBDT05URVhUX0lOX0RFQlVHX01PREUsIERFQlVHX01FTU9SWV9TQ0hFTUUsIERFQlVHX1NDSEVNRSwgSUFkYXB0ZXJNYW5hZ2VyLCBJQnJlYWtwb2ludCwgSUJyZWFrcG9pbnREYXRhLCBJQnJlYWtwb2ludFVwZGF0ZURhdGEsIElDb21wb3VuZCwgSUNvbmZpZywgSUNvbmZpZ3VyYXRpb25NYW5hZ2VyLCBJRGVidWdDb25maWd1cmF0aW9uLCBJRGVidWdNb2RlbCwgSURlYnVnU2VydmljZSwgSURlYnVnU2Vzc2lvbiwgSURlYnVnU2Vzc2lvbk9wdGlvbnMsIElFbmFibGVtZW50LCBJRXhjZXB0aW9uQnJlYWtwb2ludCwgSUdsb2JhbENvbmZpZywgSUd1ZXNzZWREZWJ1Z2dlciwgSUxhdW5jaCwgSVN0YWNrRnJhbWUsIElUaHJlYWQsIElWaWV3TW9kZWwsIFJFUExfVklFV19JRCwgU3RhdGUsIFZJRVdMRVRfSUQsIGRlYnVnZ2VyRGlzYWJsZWRNZXNzYWdlLCBnZXRTdGF0ZUxhYmVsIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IERlYnVnQ29tcG91bmRSb290IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnQ29tcG91bmRSb290LmpzJztcbmltcG9ydCB7IEJyZWFrcG9pbnQsIERhdGFCcmVha3BvaW50LCBEZWJ1Z01vZGVsLCBGdW5jdGlvbkJyZWFrcG9pbnQsIElEYXRhQnJlYWtwb2ludE9wdGlvbnMsIElGdW5jdGlvbkJyZWFrcG9pbnRPcHRpb25zLCBJSW5zdHJ1Y3Rpb25CcmVha3BvaW50T3B0aW9ucywgSW5zdHJ1Y3Rpb25CcmVha3BvaW50IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnTW9kZWwuanMnO1xuaW1wb3J0IHsgU291cmNlIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnU291cmNlLmpzJztcbmltcG9ydCB7IERlYnVnU3RvcmFnZSwgSUNob3NlbkVudmlyb25tZW50IH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnU3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBEZWJ1Z1RlbGVtZXRyeSB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBnZXRFeHRlbnNpb25Ib3N0RGVidWdTZXNzaW9uLCBzYXZlQWxsQmVmb3JlRGVidWdTdGFydCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1V0aWxzLmpzJztcbmltcG9ydCB7IFZpZXdNb2RlbCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Z1ZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBEaXNhc3NlbWJseVZpZXdJbnB1dCB9IGZyb20gJy4uL2NvbW1vbi9kaXNhc3NlbWJseVZpZXdJbnB1dC5qcyc7XG5pbXBvcnQgeyBBZGFwdGVyTWFuYWdlciB9IGZyb20gJy4vZGVidWdBZGFwdGVyTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBERUJVR19DT05GSUdVUkVfQ09NTUFORF9JRCwgREVCVUdfQ09ORklHVVJFX0xBQkVMIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25NYW5hZ2VyIH0gZnJvbSAnLi9kZWJ1Z0NvbmZpZ3VyYXRpb25NYW5hZ2VyLmpzJztcbmltcG9ydCB7IERlYnVnTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi9kZWJ1Z01lbW9yeS5qcyc7XG5pbXBvcnQgeyBEZWJ1Z1Nlc3Npb24gfSBmcm9tICcuL2RlYnVnU2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBEZWJ1Z1Rhc2tSdW5uZXIsIFRhc2tSdW5SZXN1bHQgfSBmcm9tICcuL2RlYnVnVGFza1J1bm5lci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1NlcnZpY2UgaW1wbGVtZW50cyBJRGVidWdTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0ZTogRW1pdHRlcjxTdGF0ZT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTmV3U2Vzc2lvbjogRW1pdHRlcjxJRGVidWdTZXNzaW9uPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsTmV3U2Vzc2lvbjogRW1pdHRlcjxJRGVidWdTZXNzaW9uPjtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmRTZXNzaW9uOiBFbWl0dGVyPHsgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbjsgcmVzdGFydDogYm9vbGVhbiB9Pjtcblx0cHJpdmF0ZSByZWFkb25seSByZXN0YXJ0aW5nU2Vzc2lvbnMgPSBuZXcgU2V0PElEZWJ1Z1Nlc3Npb24+KCk7XG5cdHByaXZhdGUgZGVidWdTdG9yYWdlOiBEZWJ1Z1N0b3JhZ2U7XG5cdHByaXZhdGUgbW9kZWw6IERlYnVnTW9kZWw7XG5cdHByaXZhdGUgdmlld01vZGVsOiBWaWV3TW9kZWw7XG5cdHByaXZhdGUgdGVsZW1ldHJ5OiBEZWJ1Z1RlbGVtZXRyeTtcblx0cHJpdmF0ZSB0YXNrUnVubmVyOiBEZWJ1Z1Rhc2tSdW5uZXI7XG5cdHByaXZhdGUgY29uZmlndXJhdGlvbk1hbmFnZXI6IENvbmZpZ3VyYXRpb25NYW5hZ2VyO1xuXHRwcml2YXRlIGFkYXB0ZXJNYW5hZ2VyOiBBZGFwdGVyTWFuYWdlcjtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBkZWJ1Z1R5cGUhOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIGRlYnVnU3RhdGUhOiBJQ29udGV4dEtleTxzdHJpbmc+O1xuXHRwcml2YXRlIGluRGVidWdNb2RlITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZGVidWdVeCE6IElDb250ZXh0S2V5PHN0cmluZz47XG5cdHByaXZhdGUgaGFzRGVidWdnZWQhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBicmVha3BvaW50c0V4aXN0ITogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZGlzYXNzZW1ibHlWaWV3Rm9jdXMhOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBicmVha3BvaW50c1RvU2VuZE9uUmVzb3VyY2VTYXZlZDogU2V0PFVSST47XG5cdHByaXZhdGUgaW5pdGlhbGl6aW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2luaXRpYWxpemluZ09wdGlvbnM6IElEZWJ1Z1Nlc3Npb25PcHRpb25zIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHByZXZpb3VzU3RhdGU6IFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25DYW5jZWxsYXRpb25Ub2tlbnMgPSBuZXcgTWFwPHN0cmluZywgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCk7XG5cdHByaXZhdGUgYWN0aXZpdHk6IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNob3NlbkVudmlyb25tZW50czogUmVjb3JkPHN0cmluZywgSUNob3NlbkVudmlyb25tZW50Pjtcblx0cHJpdmF0ZSBoYXZlRG9uZUxhenlTZXR1cCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZTogSUV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UsXG5cdFx0QElBY3Rpdml0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY3Rpdml0eVNlcnZpY2U6IElBY3Rpdml0eVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuYnJlYWtwb2ludHNUb1NlbmRPblJlc291cmNlU2F2ZWQgPSBuZXcgU2V0PFVSST4oKTtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxTdGF0ZT4oKSk7XG5cdFx0dGhpcy5fb25EaWROZXdTZXNzaW9uID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SURlYnVnU2Vzc2lvbj4oKSk7XG5cdFx0dGhpcy5fb25XaWxsTmV3U2Vzc2lvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElEZWJ1Z1Nlc3Npb24+KCkpO1xuXHRcdHRoaXMuX29uRGlkRW5kU2Vzc2lvbiA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyKCkpO1xuXG5cdFx0dGhpcy5hZGFwdGVyTWFuYWdlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWRhcHRlck1hbmFnZXIsIHtcblx0XHRcdG9uRGlkTmV3U2Vzc2lvbjogdGhpcy5vbkRpZE5ld1Nlc3Npb24sXG5cdFx0XHRjb25maWd1cmF0aW9uTWFuYWdlcjogKCkgPT4gdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlcixcblx0XHR9KTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmFkYXB0ZXJNYW5hZ2VyKTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb25maWd1cmF0aW9uTWFuYWdlciwgdGhpcy5hZGFwdGVyTWFuYWdlcik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5jb25maWd1cmF0aW9uTWFuYWdlcik7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2UgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlYnVnU3RvcmFnZSkpO1xuXG5cdFx0dGhpcy5jaG9zZW5FbnZpcm9ubWVudHMgPSB0aGlzLmRlYnVnU3RvcmFnZS5sb2FkQ2hvc2VuRW52aXJvbm1lbnRzKCk7XG5cblx0XHR0aGlzLm1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWJ1Z01vZGVsLCB0aGlzLmRlYnVnU3RvcmFnZSk7XG5cdFx0dGhpcy50ZWxlbWV0cnkgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlYnVnVGVsZW1ldHJ5LCB0aGlzLm1vZGVsKTtcblxuXHRcdHRoaXMudmlld01vZGVsID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFZpZXdNb2RlbChjb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdHRoaXMudGFza1J1bm5lciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdUYXNrUnVubmVyKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHRoaXMub25GaWxlQ2hhbmdlcyhlKSkpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bih0aGlzLmRpc3Bvc2UsIHRoaXMpKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuZXh0ZW5zaW9uSG9zdERlYnVnU2VydmljZS5vbkF0dGFjaFNlc3Npb24oZXZlbnQgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMubW9kZWwuZ2V0U2Vzc2lvbihldmVudC5zZXNzaW9uSWQsIHRydWUpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0Ly8gRUggd2FzIHN0YXJ0ZWQgaW4gZGVidWcgbW9kZSAtPiBhdHRhY2ggdG8gaXRcblx0XHRcdFx0c2Vzc2lvbi5jb25maWd1cmF0aW9uLnJlcXVlc3QgPSAnYXR0YWNoJztcblx0XHRcdFx0c2Vzc2lvbi5jb25maWd1cmF0aW9uLnBvcnQgPSBldmVudC5wb3J0O1xuXHRcdFx0XHRzZXNzaW9uLnNldFN1YklkKGV2ZW50LnN1YklkKTtcblx0XHRcdFx0dGhpcy5sYXVuY2hPckF0dGFjaFRvU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5leHRlbnNpb25Ib3N0RGVidWdTZXJ2aWNlLm9uVGVybWluYXRlU2Vzc2lvbihldmVudCA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5tb2RlbC5nZXRTZXNzaW9uKGV2ZW50LnNlc3Npb25JZCk7XG5cdFx0XHRpZiAoc2Vzc2lvbiAmJiBzZXNzaW9uLnN1YklkID09PSBldmVudC5zdWJJZCkge1xuXHRcdFx0XHRzZXNzaW9uLmRpc2Nvbm5lY3QoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnZpZXdNb2RlbC5vbkRpZEZvY3VzU3RhY2tGcmFtZSgoKSA9PiB7XG5cdFx0XHR0aGlzLm9uU3RhdGVDaGFuZ2UoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy52aWV3TW9kZWwub25EaWRGb2N1c1Nlc3Npb24oKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdHRoaXMub25TdGF0ZUNoYW5nZSgpO1xuXG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRGYWxsYmFja1Nlc3Npb24oc2Vzc2lvbi5nZXRJZCgpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoRXZlbnQuYW55KHRoaXMuYWRhcHRlck1hbmFnZXIub25EaWRSZWdpc3RlckRlYnVnZ2VyLCB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLm9uRGlkU2VsZWN0Q29uZmlndXJhdGlvbikoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVidWdVeFZhbHVlID0gKHRoaXMuc3RhdGUgIT09IFN0YXRlLkluYWN0aXZlIHx8ICh0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLmdldEFsbENvbmZpZ3VyYXRpb25zKCkubGVuZ3RoID4gMCAmJiB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmhhc0VuYWJsZWREZWJ1Z2dlcnMoKSkpID8gJ2RlZmF1bHQnIDogJ3NpbXBsZSc7XG5cdFx0XHR0aGlzLmRlYnVnVXguc2V0KGRlYnVnVXhWYWx1ZSk7XG5cdFx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZURlYnVnVXhTdGF0ZShkZWJ1Z1V4VmFsdWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm1vZGVsLm9uRGlkQ2hhbmdlQ2FsbFN0YWNrKCgpID0+IHtcblx0XHRcdGNvbnN0IG51bWJlck9mU2Vzc2lvbnMgPSB0aGlzLm1vZGVsLmdldFNlc3Npb25zKCkuZmlsdGVyKHMgPT4gIXMucGFyZW50U2Vzc2lvbikubGVuZ3RoO1xuXHRcdFx0dGhpcy5hY3Rpdml0eT8uZGlzcG9zZSgpO1xuXHRcdFx0aWYgKG51bWJlck9mU2Vzc2lvbnMgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoQ0FMTFNUQUNLX1ZJRVdfSUQpO1xuXHRcdFx0XHRpZiAodmlld0NvbnRhaW5lcikge1xuXHRcdFx0XHRcdHRoaXMuYWN0aXZpdHkgPSB0aGlzLmFjdGl2aXR5U2VydmljZS5zaG93Vmlld0NvbnRhaW5lckFjdGl2aXR5KHZpZXdDb250YWluZXIuaWQsIHsgYmFkZ2U6IG5ldyBOdW1iZXJCYWRnZShudW1iZXJPZlNlc3Npb25zLCBuID0+IG4gPT09IDEgPyBubHMubG9jYWxpemUoJzFhY3RpdmVTZXNzaW9uJywgXCIxIGFjdGl2ZSBzZXNzaW9uXCIpIDogbmxzLmxvY2FsaXplKCduQWN0aXZlU2Vzc2lvbnMnLCBcInswfSBhY3RpdmUgc2Vzc2lvbnNcIiwgbikpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHRcdGlmIChlZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciA9PT0gRGlzYXNzZW1ibHlWaWV3SW5wdXQuaW5zdGFuY2UpIHtcblx0XHRcdFx0XHR0aGlzLmRpc2Fzc2VtYmx5Vmlld0ZvY3VzLnNldCh0cnVlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBUaGlzIGtleSBjYW4gYmUgaW5pdGlhbGl6ZWQgYSB0aWNrIGFmdGVyIHRoaXMgZXZlbnQgaXMgZmlyZWRcblx0XHRcdFx0XHR0aGlzLmRpc2Fzc2VtYmx5Vmlld0ZvY3VzPy5yZXNldCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmxpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bigoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvciBvZiBlZGl0b3JTZXJ2aWNlLmVkaXRvcnMpIHtcblx0XHRcdFx0Ly8gRWRpdG9ycyB3aWxsIG5vdCBiZSB2YWxpZCBvbiB3aW5kb3cgcmVsb2FkLCBzbyBjbG9zZSB0aGVtLlxuXHRcdFx0XHRpZiAoZWRpdG9yLnJlc291cmNlPy5zY2hlbWUgPT09IERFQlVHX01FTU9SWV9TQ0hFTUUpIHtcblx0XHRcdFx0XHRlZGl0b3IuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZXh0ZW5zaW9uU2VydmljZS5vbldpbGxTdG9wKGV2dCA9PiB7XG5cdFx0XHRldnQudmV0byhcblx0XHRcdFx0dGhpcy5tb2RlbC5nZXRTZXNzaW9ucygpLmxlbmd0aCA+IDAsXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYWN0aXZlIGRlYnVnIHNlc3Npb24nLCAnQSBkZWJ1ZyBzZXNzaW9uIGlzIHN0aWxsIHJ1bm5pbmcgdGhhdCB3b3VsZCB0ZXJtaW5hdGUuJyksXG5cdFx0XHQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuaW5pdENvbnRleHRLZXlzKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgaW5pdENvbnRleHRLZXlzKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UpOiB2b2lkIHtcblx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmRlYnVnVHlwZSA9IENPTlRFWFRfREVCVUdfVFlQRS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0XHR0aGlzLmRlYnVnU3RhdGUgPSBDT05URVhUX0RFQlVHX1NUQVRFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdHRoaXMuaGFzRGVidWdnZWQgPSBDT05URVhUX0hBU19ERUJVR0dFRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdFx0XHR0aGlzLmluRGVidWdNb2RlID0gQ09OVEVYVF9JTl9ERUJVR19NT0RFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdHRoaXMuZGVidWdVeCA9IENPTlRFWFRfREVCVUdfVVguYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRcdFx0dGhpcy5kZWJ1Z1V4LnNldCh0aGlzLmRlYnVnU3RvcmFnZS5sb2FkRGVidWdVeFN0YXRlKCkpO1xuXHRcdFx0XHR0aGlzLmJyZWFrcG9pbnRzRXhpc3QgPSBDT05URVhUX0JSRUFLUE9JTlRTX0VYSVNULmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdC8vIE5lZWQgdG8gc2V0IGRpc2Fzc2VtYmx5Vmlld0ZvY3VzIGhlcmUgdG8gbWFrZSBpdCBpbiB0aGUgc2FtZSBjb250ZXh0IGFzIHRoZSBkZWJ1ZyBldmVudCBoYW5kbGVyc1xuXHRcdFx0XHR0aGlzLmRpc2Fzc2VtYmx5Vmlld0ZvY3VzID0gQ09OVEVYVF9ESVNBU1NFTUJMWV9WSUVXX0ZPQ1VTLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2V0QnJlYWtwb2ludHNFeGlzdENvbnRleHQgPSAoKSA9PiB0aGlzLmJyZWFrcG9pbnRzRXhpc3Quc2V0KCEhKHRoaXMubW9kZWwuZ2V0QnJlYWtwb2ludHMoKS5sZW5ndGggfHwgdGhpcy5tb2RlbC5nZXREYXRhQnJlYWtwb2ludHMoKS5sZW5ndGggfHwgdGhpcy5tb2RlbC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCkubGVuZ3RoKSk7XG5cdFx0XHRzZXRCcmVha3BvaW50c0V4aXN0Q29udGV4dCgpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5tb2RlbC5vbkRpZENoYW5nZUJyZWFrcG9pbnRzKCgpID0+IHNldEJyZWFrcG9pbnRzRXhpc3RDb250ZXh0KCkpKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldE1vZGVsKCk6IElEZWJ1Z01vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbDtcblx0fVxuXG5cdGdldFZpZXdNb2RlbCgpOiBJVmlld01vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw7XG5cdH1cblxuXHRnZXRDb25maWd1cmF0aW9uTWFuYWdlcigpOiBJQ29uZmlndXJhdGlvbk1hbmFnZXIge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyO1xuXHR9XG5cblx0Z2V0QWRhcHRlck1hbmFnZXIoKTogSUFkYXB0ZXJNYW5hZ2VyIHtcblx0XHRyZXR1cm4gdGhpcy5hZGFwdGVyTWFuYWdlcjtcblx0fVxuXG5cdHNvdXJjZUlzTm90QXZhaWxhYmxlKHVyaTogdXJpKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5zb3VyY2VJc05vdEF2YWlsYWJsZSh1cmkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8vLS0tLSBzdGF0ZSBtYW5hZ2VtZW50XG5cblx0Z2V0IHN0YXRlKCk6IFN0YXRlIHtcblx0XHRjb25zdCBmb2N1c2VkU2Vzc2lvbiA9IHRoaXMudmlld01vZGVsLmZvY3VzZWRTZXNzaW9uO1xuXHRcdGlmIChmb2N1c2VkU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIGZvY3VzZWRTZXNzaW9uLnN0YXRlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmluaXRpYWxpemluZyA/IFN0YXRlLkluaXRpYWxpemluZyA6IFN0YXRlLkluYWN0aXZlO1xuXHR9XG5cblx0Z2V0IGluaXRpYWxpemluZ09wdGlvbnMoKTogSURlYnVnU2Vzc2lvbk9wdGlvbnMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9pbml0aWFsaXppbmdPcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGFydEluaXRpYWxpemluZ1N0YXRlKG9wdGlvbnM/OiBJRGVidWdTZXNzaW9uT3B0aW9ucyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pbml0aWFsaXppbmcpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6aW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2luaXRpYWxpemluZ09wdGlvbnMgPSBvcHRpb25zO1xuXHRcdFx0dGhpcy5vblN0YXRlQ2hhbmdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBlbmRJbml0aWFsaXppbmdTdGF0ZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pbml0aWFsaXppbmcpIHtcblx0XHRcdHRoaXMuaW5pdGlhbGl6aW5nID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9pbml0aWFsaXppbmdPcHRpb25zID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5vblN0YXRlQ2hhbmdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjYW5jZWxUb2tlbnMoaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChpZCkge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSB0aGlzLnNlc3Npb25DYW5jZWxsYXRpb25Ub2tlbnMuZ2V0KGlkKTtcblx0XHRcdGlmICh0b2tlbikge1xuXHRcdFx0XHR0b2tlbi5jYW5jZWwoKTtcblx0XHRcdFx0dGhpcy5zZXNzaW9uQ2FuY2VsbGF0aW9uVG9rZW5zLmRlbGV0ZShpZCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Vzc2lvbkNhbmNlbGxhdGlvblRva2Vucy5mb3JFYWNoKHQgPT4gdC5jYW5jZWwoKSk7XG5cdFx0XHR0aGlzLnNlc3Npb25DYW5jZWxsYXRpb25Ub2tlbnMuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uU3RhdGVDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlO1xuXHRcdGlmICh0aGlzLnByZXZpb3VzU3RhdGUgIT09IHN0YXRlKSB7XG5cdFx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmJ1ZmZlckNoYW5nZUV2ZW50cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZGVidWdTdGF0ZS5zZXQoZ2V0U3RhdGVMYWJlbChzdGF0ZSkpO1xuXHRcdFx0XHR0aGlzLmluRGVidWdNb2RlLnNldChzdGF0ZSAhPT0gU3RhdGUuSW5hY3RpdmUpO1xuXHRcdFx0XHQvLyBPbmx5IHNob3cgdGhlIHNpbXBsZSB1eCBpZiBkZWJ1ZyBpcyBub3QgeWV0IHN0YXJ0ZWQgYW5kIGlmIG5vIGxhdW5jaC5qc29uIGV4aXN0c1xuXHRcdFx0XHRjb25zdCBkZWJ1Z1V4VmFsdWUgPSAoKHN0YXRlICE9PSBTdGF0ZS5JbmFjdGl2ZSAmJiBzdGF0ZSAhPT0gU3RhdGUuSW5pdGlhbGl6aW5nKSB8fCAodGhpcy5hZGFwdGVyTWFuYWdlci5oYXNFbmFibGVkRGVidWdnZXJzKCkgJiYgdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubmFtZSkpID8gJ2RlZmF1bHQnIDogJ3NpbXBsZSc7XG5cdFx0XHRcdHRoaXMuZGVidWdVeC5zZXQoZGVidWdVeFZhbHVlKTtcblx0XHRcdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVEZWJ1Z1V4U3RhdGUoZGVidWdVeFZhbHVlKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5wcmV2aW91c1N0YXRlID0gc3RhdGU7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0YXRlLmZpcmUoc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZVN0YXRlKCk6IEV2ZW50PFN0YXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlU3RhdGUuZXZlbnQ7XG5cdH1cblxuXHRnZXQgb25EaWROZXdTZXNzaW9uKCk6IEV2ZW50PElEZWJ1Z1Nlc3Npb24+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25EaWROZXdTZXNzaW9uLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uV2lsbE5ld1Nlc3Npb24oKTogRXZlbnQ8SURlYnVnU2Vzc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLl9vbldpbGxOZXdTZXNzaW9uLmV2ZW50O1xuXHR9XG5cblx0Z2V0IG9uRGlkRW5kU2Vzc2lvbigpOiBFdmVudDx7IHNlc3Npb246IElEZWJ1Z1Nlc3Npb247IHJlc3RhcnQ6IGJvb2xlYW4gfT4ge1xuXHRcdHJldHVybiB0aGlzLl9vbkRpZEVuZFNlc3Npb24uZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIGxhenlTZXR1cCgpIHtcblx0XHRpZiAoIXRoaXMuaGF2ZURvbmVMYXp5U2V0dXApIHtcblx0XHRcdC8vIFJlZ2lzdGVyaW5nIGZzIHByb3ZpZGVycyBpcyBzbG93XG5cdFx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTU5ODg2XG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoREVCVUdfTUVNT1JZX1NDSEVNRSwgdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERlYnVnTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKHRoaXMpKSkpO1xuXHRcdFx0dGhpcy5oYXZlRG9uZUxhenlTZXR1cCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0Ly8tLS0tIGxpZmUgY3ljbGUgbWFuYWdlbWVudFxuXG5cdC8qKlxuXHQgKiBtYWluIGVudHJ5IHBvaW50XG5cdCAqIHByb3Blcmx5IG1hbmFnZXMgY29tcG91bmRzLCBjaGVja3MgZm9yIGVycm9ycyBhbmQgaGFuZGxlcyB0aGUgaW5pdGlhbGl6aW5nIHN0YXRlLlxuXHQgKi9cblx0YXN5bmMgc3RhcnREZWJ1Z2dpbmcobGF1bmNoOiBJTGF1bmNoIHwgdW5kZWZpbmVkLCBjb25maWdPck5hbWU/OiBJQ29uZmlnIHwgc3RyaW5nLCBvcHRpb25zPzogSURlYnVnU2Vzc2lvbk9wdGlvbnMsIHNhdmVCZWZvcmVTdGFydCA9ICFvcHRpb25zPy5wYXJlbnRTZXNzaW9uKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IG9wdGlvbnMgJiYgb3B0aW9ucy5ub0RlYnVnID8gbmxzLmxvY2FsaXplKCdydW5UcnVzdCcsIFwiUnVubmluZyBleGVjdXRlcyBidWlsZCB0YXNrcyBhbmQgcHJvZ3JhbSBjb2RlIGZyb20geW91ciB3b3Jrc3BhY2UuXCIpIDogbmxzLmxvY2FsaXplKCdkZWJ1Z1RydXN0JywgXCJEZWJ1Z2dpbmcgZXhlY3V0ZXMgYnVpbGQgdGFza3MgYW5kIHByb2dyYW0gY29kZSBmcm9tIHlvdXIgd29ya3NwYWNlLlwiKTtcblx0XHRjb25zdCB0cnVzdCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3QoeyBtZXNzYWdlIH0pO1xuXHRcdGlmICghdHJ1c3QpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLmxhenlTZXR1cCgpO1xuXHRcdHRoaXMuc3RhcnRJbml0aWFsaXppbmdTdGF0ZShvcHRpb25zKTtcblx0XHR0aGlzLmhhc0RlYnVnZ2VkLnNldCh0cnVlKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gbWFrZSBzdXJlIHRvIHNhdmUgYWxsIGZpbGVzIGFuZCB0aGF0IHRoZSBjb25maWd1cmF0aW9uIGlzIHVwIHRvIGRhdGVcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoJ29uRGVidWcnKTtcblx0XHRcdGlmIChzYXZlQmVmb3JlU3RhcnQpIHtcblx0XHRcdFx0YXdhaXQgc2F2ZUFsbEJlZm9yZURlYnVnU3RhcnQodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5lZGl0b3JTZXJ2aWNlKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdFx0bGV0IGNvbmZpZzogSUNvbmZpZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBjb21wb3VuZDogSUNvbXBvdW5kIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFjb25maWdPck5hbWUpIHtcblx0XHRcdFx0Y29uZmlnT3JOYW1lID0gdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubmFtZTtcblx0XHRcdH1cblx0XHRcdGlmICh0eXBlb2YgY29uZmlnT3JOYW1lID09PSAnc3RyaW5nJyAmJiBsYXVuY2gpIHtcblx0XHRcdFx0Y29uZmlnID0gbGF1bmNoLmdldENvbmZpZ3VyYXRpb24oY29uZmlnT3JOYW1lKTtcblx0XHRcdFx0Y29tcG91bmQgPSBsYXVuY2guZ2V0Q29tcG91bmQoY29uZmlnT3JOYW1lKTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGNvbmZpZ09yTmFtZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0Y29uZmlnID0gY29uZmlnT3JOYW1lO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY29tcG91bmQpIHtcblx0XHRcdFx0Ly8gd2UgYXJlIHN0YXJ0aW5nIGEgY29tcG91bmQgZGVidWcsIGZpcnN0IGRvIHNvbWUgZXJyb3IgY2hlY2tpbmcgYW5kIHRoYW4gc3RhcnQgZWFjaCBjb25maWd1cmF0aW9uIGluIHRoZSBjb21wb3VuZFxuXHRcdFx0XHRpZiAoIWNvbXBvdW5kLmNvbmZpZ3VyYXRpb25zKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSh7IGtleTogJ2NvbXBvdW5kTXVzdEhhdmVDb25maWd1cmF0aW9ucycsIGNvbW1lbnQ6IFsnY29tcG91bmQgaW5kaWNhdGVzIGEgXCJjb21wb3VuZHNcIiBjb25maWd1cmF0aW9uIGl0ZW0nLCAnXCJjb25maWd1cmF0aW9uc1wiIGlzIGFuIGF0dHJpYnV0ZSBhbmQgc2hvdWxkIG5vdCBiZSBsb2NhbGl6ZWQnXSB9LFxuXHRcdFx0XHRcdFx0XCJDb21wb3VuZCBtdXN0IGhhdmUgXFxcImNvbmZpZ3VyYXRpb25zXFxcIiBhdHRyaWJ1dGUgc2V0IGluIG9yZGVyIHRvIHN0YXJ0IG11bHRpcGxlIGNvbmZpZ3VyYXRpb25zLlwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNvbXBvdW5kLnByZUxhdW5jaFRhc2spIHtcblx0XHRcdFx0XHRjb25zdCB0YXNrUmVzdWx0ID0gYXdhaXQgdGhpcy50YXNrUnVubmVyLnJ1blRhc2tBbmRDaGVja0Vycm9ycyhsYXVuY2g/LndvcmtzcGFjZSB8fCB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLCBjb21wb3VuZC5wcmVMYXVuY2hUYXNrKTtcblx0XHRcdFx0XHRpZiAodGFza1Jlc3VsdCA9PT0gVGFza1J1blJlc3VsdC5GYWlsdXJlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmVuZEluaXRpYWxpemluZ1N0YXRlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb21wb3VuZC5zdG9wQWxsKSB7XG5cdFx0XHRcdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgY29tcG91bmRSb290OiBuZXcgRGVidWdDb21wb3VuZFJvb3QoKSB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdmFsdWVzID0gYXdhaXQgUHJvbWlzZS5hbGwoY29tcG91bmQuY29uZmlndXJhdGlvbnMubWFwKGNvbmZpZ0RhdGEgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG5hbWUgPSB0eXBlb2YgY29uZmlnRGF0YSA9PT0gJ3N0cmluZycgPyBjb25maWdEYXRhIDogY29uZmlnRGF0YS5uYW1lO1xuXHRcdFx0XHRcdGlmIChuYW1lID09PSBjb21wb3VuZC5uYW1lKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRsZXQgbGF1bmNoRm9yTmFtZTogSUxhdW5jaCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGNvbmZpZ0RhdGEgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYXVuY2hlc0NvbnRhaW5pbmdOYW1lID0gdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5nZXRMYXVuY2hlcygpLmZpbHRlcihsID0+ICEhbC5nZXRDb25maWd1cmF0aW9uKG5hbWUpKTtcblx0XHRcdFx0XHRcdGlmIChsYXVuY2hlc0NvbnRhaW5pbmdOYW1lLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHRsYXVuY2hGb3JOYW1lID0gbGF1bmNoZXNDb250YWluaW5nTmFtZVswXTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAobGF1bmNoICYmIGxhdW5jaGVzQ29udGFpbmluZ05hbWUubGVuZ3RoID4gMSAmJiBsYXVuY2hlc0NvbnRhaW5pbmdOYW1lLmluZGV4T2YobGF1bmNoKSA+PSAwKSB7XG5cdFx0XHRcdFx0XHRcdC8vIElmIHRoZXJlIGFyZSBtdWx0aXBsZSBsYXVuY2hlcyBjb250YWluaW5nIHRoZSBjb25maWd1cmF0aW9uIGdpdmUgcHJpb3JpdHkgdG8gdGhlIGNvbmZpZ3VyYXRpb24gaW4gdGhlIGN1cnJlbnQgbGF1bmNoXG5cdFx0XHRcdFx0XHRcdGxhdW5jaEZvck5hbWUgPSBsYXVuY2g7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobGF1bmNoZXNDb250YWluaW5nTmFtZS5sZW5ndGggPT09IDAgPyBubHMubG9jYWxpemUoJ25vQ29uZmlndXJhdGlvbk5hbWVJbldvcmtzcGFjZScsIFwiQ291bGQgbm90IGZpbmQgbGF1bmNoIGNvbmZpZ3VyYXRpb24gJ3swfScgaW4gdGhlIHdvcmtzcGFjZS5cIiwgbmFtZSlcblx0XHRcdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnbXVsdGlwbGVDb25maWd1cmF0aW9uTmFtZXNJbldvcmtzcGFjZScsIFwiVGhlcmUgYXJlIG11bHRpcGxlIGxhdW5jaCBjb25maWd1cmF0aW9ucyAnezB9JyBpbiB0aGUgd29ya3NwYWNlLiBVc2UgZm9sZGVyIG5hbWUgdG8gcXVhbGlmeSB0aGUgY29uZmlndXJhdGlvbi5cIiwgbmFtZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoY29uZmlnRGF0YS5mb2xkZXIpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdW5jaGVzTWF0Y2hpbmdDb25maWdEYXRhID0gdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5nZXRMYXVuY2hlcygpLmZpbHRlcihsID0+IGwud29ya3NwYWNlICYmIGwud29ya3NwYWNlLm5hbWUgPT09IGNvbmZpZ0RhdGEuZm9sZGVyICYmICEhbC5nZXRDb25maWd1cmF0aW9uKGNvbmZpZ0RhdGEubmFtZSkpO1xuXHRcdFx0XHRcdFx0aWYgKGxhdW5jaGVzTWF0Y2hpbmdDb25maWdEYXRhLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0XHRsYXVuY2hGb3JOYW1lID0gbGF1bmNoZXNNYXRjaGluZ0NvbmZpZ0RhdGFbMF07XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobmxzLmxvY2FsaXplKCdub0ZvbGRlcldpdGhOYW1lJywgXCJDYW4gbm90IGZpbmQgZm9sZGVyIHdpdGggbmFtZSAnezB9JyBmb3IgY29uZmlndXJhdGlvbiAnezF9JyBpbiBjb21wb3VuZCAnezJ9Jy5cIiwgY29uZmlnRGF0YS5mb2xkZXIsIGNvbmZpZ0RhdGEubmFtZSwgY29tcG91bmQubmFtZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb24obGF1bmNoRm9yTmFtZSwgbGF1bmNoRm9yTmFtZSEuZ2V0Q29uZmlndXJhdGlvbihuYW1lKSwgb3B0aW9ucyk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSB2YWx1ZXMuZXZlcnkoc3VjY2VzcyA9PiAhIXN1Y2Nlc3MpOyAvLyBDb21wb3VuZCBsYXVuY2ggaXMgYSBzdWNjZXNzIG9ubHkgaWYgZWFjaCBjb25maWd1cmF0aW9uIGxhdW5jaGVkIHN1Y2Nlc3NmdWxseVxuXHRcdFx0XHR0aGlzLmVuZEluaXRpYWxpemluZ1N0YXRlKCk7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjb25maWdPck5hbWUgJiYgIWNvbmZpZykge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gISFsYXVuY2ggPyBubHMubG9jYWxpemUoJ2NvbmZpZ01pc3NpbmcnLCBcIkNvbmZpZ3VyYXRpb24gJ3swfScgaXMgbWlzc2luZyBpbiAnbGF1bmNoLmpzb24nLlwiLCB0eXBlb2YgY29uZmlnT3JOYW1lID09PSAnc3RyaW5nJyA/IGNvbmZpZ09yTmFtZSA6IGNvbmZpZ09yTmFtZS5uYW1lKSA6XG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdsYXVuY2hKc29uRG9lc05vdEV4aXN0JywgXCInbGF1bmNoLmpzb24nIGRvZXMgbm90IGV4aXN0IGZvciBwYXNzZWQgd29ya3NwYWNlIGZvbGRlci5cIik7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihtZXNzYWdlKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jcmVhdGVTZXNzaW9uKGxhdW5jaCwgY29uZmlnLCBvcHRpb25zKTtcblx0XHRcdHRoaXMuZW5kSW5pdGlhbGl6aW5nU3RhdGUoKTtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBtYWtlIHN1cmUgdG8gZ2V0IG91dCBvZiBpbml0aWFsaXppbmcgc3RhdGUsIGFuZCBwcm9wYWdhdGUgdGhlIHJlc3VsdFxuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHR0aGlzLmVuZEluaXRpYWxpemluZ1N0YXRlKCk7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QoZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogZ2V0cyB0aGUgZGVidWdnZXIgZm9yIHRoZSB0eXBlLCByZXNvbHZlcyBjb25maWd1cmF0aW9ucyBieSBwcm92aWRlcnMsIHN1YnN0aXR1dGVzIHZhcmlhYmxlcyBhbmQgcnVucyBwcmVsYXVuY2ggdGFza3Ncblx0ICovXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlU2Vzc2lvbihsYXVuY2g6IElMYXVuY2ggfCB1bmRlZmluZWQsIGNvbmZpZzogSUNvbmZpZyB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElEZWJ1Z1Nlc3Npb25PcHRpb25zKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gV2Uga2VlcCB0aGUgZGVidWcgdHlwZSBpbiBhIHNlcGFyYXRlIHZhcmlhYmxlICd0eXBlJyBzbyB0aGF0IGEgbm8tZm9sZGVyIGNvbmZpZyBoYXMgbm8gYXR0cmlidXRlcy5cblx0XHQvLyBTdG9yaW5nIHRoZSB0eXBlIGluIHRoZSBjb25maWcgd291bGQgYnJlYWsgZXh0ZW5zaW9ucyB0aGF0IGFzc3VtZSB0aGF0IHRoZSBuby1mb2xkZXIgY2FzZSBpcyBpbmRpY2F0ZWQgYnkgYW4gZW1wdHkgY29uZmlnLlxuXHRcdGxldCB0eXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGNvbmZpZykge1xuXHRcdFx0dHlwZSA9IGNvbmZpZy50eXBlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBhIG5vLWZvbGRlciB3b3Jrc3BhY2UgaGFzIG5vIGxhdW5jaC5jb25maWdcblx0XHRcdGNvbmZpZyA9IE9iamVjdC5jcmVhdGUobnVsbCkgYXMgSUNvbmZpZztcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMgJiYgb3B0aW9ucy5ub0RlYnVnKSB7XG5cdFx0XHRjb25maWcubm9EZWJ1ZyA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm5vRGVidWcgPT09ICd1bmRlZmluZWQnICYmIG9wdGlvbnMucGFyZW50U2Vzc2lvbiAmJiBvcHRpb25zLnBhcmVudFNlc3Npb24uY29uZmlndXJhdGlvbi5ub0RlYnVnKSB7XG5cdFx0XHRjb25maWcubm9EZWJ1ZyA9IHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHVucmVzb2x2ZWRDb25maWcgPSBkZWVwQ2xvbmUoY29uZmlnKTtcblxuXHRcdGxldCBndWVzczogSUd1ZXNzZWREZWJ1Z2dlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYWN0aXZlRWRpdG9yOiBFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIXR5cGUpIHtcblx0XHRcdGFjdGl2ZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0XHRpZiAoYWN0aXZlRWRpdG9yICYmIGFjdGl2ZUVkaXRvci5yZXNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBjaG9zZW4gPSB0aGlzLmNob3NlbkVudmlyb25tZW50c1thY3RpdmVFZGl0b3IucmVzb3VyY2UudG9TdHJpbmcoKV07XG5cdFx0XHRcdGlmIChjaG9zZW4pIHtcblx0XHRcdFx0XHR0eXBlID0gY2hvc2VuLnR5cGU7XG5cdFx0XHRcdFx0aWYgKGNob3Nlbi5keW5hbWljTGFiZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGR5biA9IGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIuZ2V0RHluYW1pY0NvbmZpZ3VyYXRpb25zQnlUeXBlKGNob3Nlbi50eXBlKTtcblx0XHRcdFx0XHRcdGNvbnN0IGZvdW5kID0gZHluLmZpbmQoZCA9PiBkLmxhYmVsID09PSBjaG9zZW4uZHluYW1pY0xhYmVsKTtcblx0XHRcdFx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRcdFx0XHRsYXVuY2ggPSBmb3VuZC5sYXVuY2g7XG5cdFx0XHRcdFx0XHRcdE9iamVjdC5hc3NpZ24oY29uZmlnLCBmb3VuZC5jb25maWcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXR5cGUpIHtcblx0XHRcdFx0Z3Vlc3MgPSBhd2FpdCB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmd1ZXNzRGVidWdnZXIoZmFsc2UpO1xuXHRcdFx0XHRpZiAoZ3Vlc3MpIHtcblx0XHRcdFx0XHR0eXBlID0gZ3Vlc3MuZGVidWdnZXIudHlwZTtcblx0XHRcdFx0XHRpZiAoZ3Vlc3Mud2l0aENvbmZpZykge1xuXHRcdFx0XHRcdFx0bGF1bmNoID0gZ3Vlc3Mud2l0aENvbmZpZy5sYXVuY2g7XG5cdFx0XHRcdFx0XHRPYmplY3QuYXNzaWduKGNvbmZpZywgZ3Vlc3Mud2l0aENvbmZpZy5jb25maWcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGluaXRDYW5jZWxsYXRpb25Ub2tlbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuc2Vzc2lvbkNhbmNlbGxhdGlvblRva2Vucy5zZXQoc2Vzc2lvbklkLCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXG5cdFx0Y29uc3QgY29uZmlnQnlQcm92aWRlcnMgPSBhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLnJlc29sdmVDb25maWd1cmF0aW9uQnlQcm92aWRlcnMobGF1bmNoICYmIGxhdW5jaC53b3Jrc3BhY2UgPyBsYXVuY2gud29ya3NwYWNlLnVyaSA6IHVuZGVmaW5lZCwgdHlwZSwgY29uZmlnLCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pO1xuXHRcdC8vIGEgZmFsc3kgY29uZmlnIGluZGljYXRlcyBhbiBhYm9ydGVkIGxhdW5jaFxuXHRcdGlmIChjb25maWdCeVByb3ZpZGVycyAmJiBjb25maWdCeVByb3ZpZGVycy50eXBlKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRsZXQgcmVzb2x2ZWRDb25maWcgPSBhd2FpdCB0aGlzLnN1YnN0aXR1dGVWYXJpYWJsZXMobGF1bmNoLCBjb25maWdCeVByb3ZpZGVycyk7XG5cdFx0XHRcdGlmICghcmVzb2x2ZWRDb25maWcpIHtcblx0XHRcdFx0XHQvLyBVc2VyIGNhbmNlbGxlZCByZXNvbHZpbmcgb2YgaW50ZXJhY3RpdmUgdmFyaWFibGVzLCBzaWxlbnRseSByZXR1cm5cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0Ly8gVXNlciBjYW5jZWxsZWQsIHNpbGVudGx5IHJldHVyblxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIENoZWNrIGZvciBjb25jdXJyZW50IHNlc3Npb25zIGJlZm9yZSBydW5uaW5nIHByZUxhdW5jaFRhc2sgdG8gYXZvaWQgcnVubmluZyB0aGUgdGFzayBpZiB1c2VyIGNhbmNlbHNcblx0XHRcdFx0bGV0IHVzZXJDb25maXJtZWRDb25jdXJyZW50U2Vzc2lvbiA9IGZhbHNlO1xuXHRcdFx0XHRpZiAob3B0aW9ucz8uc3RhcnRlZEJ5VXNlciAmJiByZXNvbHZlZENvbmZpZyAmJiByZXNvbHZlZENvbmZpZy5zdXBwcmVzc011bHRpcGxlU2Vzc2lvbldhcm5pbmcgIT09IHRydWUpIHtcblx0XHRcdFx0XHQvLyBDaGVjayBpZiB0aGVyZSdzIGFscmVhZHkgYSBzZXNzaW9uIHdpdGggdGhlIHNhbWUgbGF1bmNoIGNvbmZpZ3VyYXRpb25cblx0XHRcdFx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb25zID0gdGhpcy5tb2RlbC5nZXRTZXNzaW9ucygpO1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGxhdW5jaD8ud29ya3NwYWNlO1xuXG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmdTZXNzaW9uID0gZXhpc3RpbmdTZXNzaW9ucy5maW5kKHMgPT5cblx0XHRcdFx0XHRcdHMuY29uZmlndXJhdGlvbi5uYW1lID09PSByZXNvbHZlZENvbmZpZyEubmFtZSAmJlxuXHRcdFx0XHRcdFx0cy5jb25maWd1cmF0aW9uLnR5cGUgPT09IHJlc29sdmVkQ29uZmlnIS50eXBlICYmXG5cdFx0XHRcdFx0XHRzLmNvbmZpZ3VyYXRpb24ucmVxdWVzdCA9PT0gcmVzb2x2ZWRDb25maWchLnJlcXVlc3QgJiZcblx0XHRcdFx0XHRcdHMucm9vdCA9PT0gd29ya3NwYWNlXG5cdFx0XHRcdFx0KTtcblxuXHRcdFx0XHRcdGlmIChleGlzdGluZ1Nlc3Npb24pIHtcblx0XHRcdFx0XHRcdC8vIFRoZXJlIGlzIGFscmVhZHkgYSBzZXNzaW9uIHdpdGggdGhlIHNhbWUgY29uZmlndXJhdGlvbiwgcHJvbXB0IHVzZXIgYmVmb3JlIHJ1bm5pbmcgcHJlTGF1bmNoVGFza1xuXHRcdFx0XHRcdFx0Y29uc3QgY29uZmlybWVkID0gYXdhaXQgdGhpcy5jb25maXJtQ29uY3VycmVudFNlc3Npb24oZXhpc3RpbmdTZXNzaW9uLmdldExhYmVsKCkpO1xuXHRcdFx0XHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dXNlckNvbmZpcm1lZENvbmN1cnJlbnRTZXNzaW9uID0gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBsYXVuY2g/LndvcmtzcGFjZSB8fCB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdFx0XHRjb25zdCB0YXNrUmVzdWx0ID0gYXdhaXQgdGhpcy50YXNrUnVubmVyLnJ1blRhc2tBbmRDaGVja0Vycm9ycyh3b3Jrc3BhY2UsIHJlc29sdmVkQ29uZmlnLnByZUxhdW5jaFRhc2spO1xuXHRcdFx0XHRpZiAodGFza1Jlc3VsdCA9PT0gVGFza1J1blJlc3VsdC5GYWlsdXJlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY2ZnID0gYXdhaXQgdGhpcy5jb25maWd1cmF0aW9uTWFuYWdlci5yZXNvbHZlRGVidWdDb25maWd1cmF0aW9uV2l0aFN1YnN0aXR1dGVkVmFyaWFibGVzKGxhdW5jaCAmJiBsYXVuY2gud29ya3NwYWNlID8gbGF1bmNoLndvcmtzcGFjZS51cmkgOiB1bmRlZmluZWQsIHJlc29sdmVkQ29uZmlnLnR5cGUsIHJlc29sdmVkQ29uZmlnLCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pO1xuXHRcdFx0XHRpZiAoIWNmZykge1xuXHRcdFx0XHRcdGlmIChsYXVuY2ggJiYgdHlwZSAmJiBjZmcgPT09IG51bGwgJiYgIWluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1x0Ly8gc2hvdyBsYXVuY2guanNvbiBvbmx5IGZvciBcImNvbmZpZ1wiIGJlaW5nIFwibnVsbFwiLlxuXHRcdFx0XHRcdFx0YXdhaXQgbGF1bmNoLm9wZW5Db25maWdGaWxlKHsgcHJlc2VydmVGb2N1czogdHJ1ZSwgdHlwZSB9LCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZWRDb25maWcgPSBjZmc7XG5cblx0XHRcdFx0Y29uc3QgZGJnID0gdGhpcy5hZGFwdGVyTWFuYWdlci5nZXREZWJ1Z2dlcihyZXNvbHZlZENvbmZpZy50eXBlKTtcblx0XHRcdFx0aWYgKCFkYmcgfHwgKGNvbmZpZ0J5UHJvdmlkZXJzLnJlcXVlc3QgIT09ICdhdHRhY2gnICYmIGNvbmZpZ0J5UHJvdmlkZXJzLnJlcXVlc3QgIT09ICdsYXVuY2gnKSkge1xuXHRcdFx0XHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0XHRcdFx0aWYgKGNvbmZpZ0J5UHJvdmlkZXJzLnJlcXVlc3QgIT09ICdhdHRhY2gnICYmIGNvbmZpZ0J5UHJvdmlkZXJzLnJlcXVlc3QgIT09ICdsYXVuY2gnKSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlID0gY29uZmlnQnlQcm92aWRlcnMucmVxdWVzdCA/IG5scy5sb2NhbGl6ZSgnZGVidWdSZXF1ZXN0Tm90U3VwcG9ydGVkJywgXCJBdHRyaWJ1dGUgJ3swfScgaGFzIGFuIHVuc3VwcG9ydGVkIHZhbHVlICd7MX0nIGluIHRoZSBjaG9zZW4gZGVidWcgY29uZmlndXJhdGlvbi5cIiwgJ3JlcXVlc3QnLCBjb25maWdCeVByb3ZpZGVycy5yZXF1ZXN0KVxuXHRcdFx0XHRcdFx0XHQ6IG5scy5sb2NhbGl6ZSgnZGVidWdSZXF1ZXNNaXNzaW5nJywgXCJBdHRyaWJ1dGUgJ3swfScgaXMgbWlzc2luZyBmcm9tIHRoZSBjaG9zZW4gZGVidWcgY29uZmlndXJhdGlvbi5cIiwgJ3JlcXVlc3QnKTtcblxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlID0gcmVzb2x2ZWRDb25maWcudHlwZSA/IG5scy5sb2NhbGl6ZSgnZGVidWdUeXBlTm90U3VwcG9ydGVkJywgXCJDb25maWd1cmVkIGRlYnVnIHR5cGUgJ3swfScgaXMgbm90IHN1cHBvcnRlZC5cIiwgcmVzb2x2ZWRDb25maWcudHlwZSkgOlxuXHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2RlYnVnVHlwZU1pc3NpbmcnLCBcIk1pc3NpbmcgcHJvcGVydHkgJ3R5cGUnIGZvciB0aGUgY2hvc2VuIGxhdW5jaCBjb25maWd1cmF0aW9uLlwiKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBhY3Rpb25MaXN0OiBJQWN0aW9uW10gPSBbXTtcblxuXHRcdFx0XHRcdGFjdGlvbkxpc3QucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdFx0XHRpZDogJ2luc3RhbGxBZGRpdGlvbmFsRGVidWdnZXJzJyxcblx0XHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoeyBrZXk6ICdpbnN0YWxsQWRkaXRpb25hbERlYnVnZ2VycycsIGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgaXMgdGhlIGRlYnVnIHR5cGUsIHNvIGZvciBleGFtcGxlIFwibm9kZVwiLCBcInB5dGhvblwiJ10gfSwgXCJJbnN0YWxsIHswfSBFeHRlbnNpb25cIiwgcmVzb2x2ZWRDb25maWcudHlwZSksXG5cdFx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdkZWJ1Zy5pbnN0YWxsQWRkaXRpb25hbERlYnVnZ2VycycsIHJlc29sdmVkQ29uZmlnPy50eXBlKVxuXHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0Vycm9yKG1lc3NhZ2UsIGFjdGlvbkxpc3QpOyByZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWRiZy5lbmFibGVkKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93RXJyb3IoZGVidWdnZXJEaXNhYmxlZE1lc3NhZ2UoZGJnLnR5cGUpLCBbXSk7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kb0NyZWF0ZVNlc3Npb24oc2Vzc2lvbklkLCBsYXVuY2g/LndvcmtzcGFjZSwgeyByZXNvbHZlZDogcmVzb2x2ZWRDb25maWcsIHVucmVzb2x2ZWQ6IHVucmVzb2x2ZWRDb25maWcgfSwgb3B0aW9ucywgdXNlckNvbmZpcm1lZENvbmN1cnJlbnRTZXNzaW9uKTtcblx0XHRcdFx0aWYgKHJlc3VsdCAmJiBndWVzcyAmJiBhY3RpdmVFZGl0b3IgJiYgYWN0aXZlRWRpdG9yLnJlc291cmNlKSB7XG5cdFx0XHRcdFx0Ly8gUmVtZWJlciB1c2VyIGNob2ljZSBvZiBlbnZpcm9ubWVudCBwZXIgYWN0aXZlIGVkaXRvciB0byBtYWtlIHN0YXJ0aW5nIGRlYnVnZ2luZyBzbW9vdGhlciAjMTI0NzcwXG5cdFx0XHRcdFx0dGhpcy5jaG9zZW5FbnZpcm9ubWVudHNbYWN0aXZlRWRpdG9yLnJlc291cmNlLnRvU3RyaW5nKCldID0geyB0eXBlOiBndWVzcy5kZWJ1Z2dlci50eXBlLCBkeW5hbWljTGFiZWw6IGd1ZXNzLndpdGhDb25maWc/LmxhYmVsIH07XG5cdFx0XHRcdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVDaG9zZW5FbnZpcm9ubWVudHModGhpcy5jaG9zZW5FbnZpcm9ubWVudHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKGVyciAmJiBlcnIubWVzc2FnZSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2hvd0Vycm9yKGVyci5tZXNzYWdlKTtcblx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zaG93RXJyb3IobmxzLmxvY2FsaXplKCdub0ZvbGRlcldvcmtzcGFjZURlYnVnRXJyb3InLCBcIlRoZSBhY3RpdmUgZmlsZSBjYW4gbm90IGJlIGRlYnVnZ2VkLiBNYWtlIHN1cmUgaXQgaXMgc2F2ZWQgYW5kIHRoYXQgeW91IGhhdmUgYSBkZWJ1ZyBleHRlbnNpb24gaW5zdGFsbGVkIGZvciB0aGF0IGZpbGUgdHlwZS5cIikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsYXVuY2ggJiYgIWluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdGF3YWl0IGxhdW5jaC5vcGVuQ29uZmlnRmlsZSh7IHByZXNlcnZlRm9jdXM6IHRydWUgfSwgaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAobGF1bmNoICYmIHR5cGUgJiYgY29uZmlnQnlQcm92aWRlcnMgPT09IG51bGwgJiYgIWluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1x0Ly8gc2hvdyBsYXVuY2guanNvbiBvbmx5IGZvciBcImNvbmZpZ1wiIGJlaW5nIFwibnVsbFwiLlxuXHRcdFx0YXdhaXQgbGF1bmNoLm9wZW5Db25maWdGaWxlKHsgcHJlc2VydmVGb2N1czogdHJ1ZSwgdHlwZSB9LCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4udG9rZW4pO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBpbnN0YW50aWF0ZXMgdGhlIG5ldyBzZXNzaW9uLCBpbml0aWFsaXplcyB0aGUgc2Vzc2lvbiwgcmVnaXN0ZXJzIHNlc3Npb24gbGlzdGVuZXJzIGFuZCByZXBvcnRzIHRlbGVtZXRyeVxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBkb0NyZWF0ZVNlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcsIHJvb3Q6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb246IHsgcmVzb2x2ZWQ6IElDb25maWc7IHVucmVzb2x2ZWQ6IElDb25maWcgfCB1bmRlZmluZWQgfSwgb3B0aW9ucz86IElEZWJ1Z1Nlc3Npb25PcHRpb25zLCB1c2VyQ29uZmlybWVkQ29uY3VycmVudFNlc3Npb24gPSBmYWxzZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVidWdTZXNzaW9uLCBzZXNzaW9uSWQsIGNvbmZpZ3VyYXRpb24sIHJvb3QsIHRoaXMubW9kZWwsIG9wdGlvbnMpO1xuXHRcdGlmICghdXNlckNvbmZpcm1lZENvbmN1cnJlbnRTZXNzaW9uICYmIG9wdGlvbnM/LnN0YXJ0ZWRCeVVzZXIgJiYgdGhpcy5tb2RlbC5nZXRTZXNzaW9ucygpLnNvbWUocyA9PlxuXHRcdFx0cy5jb25maWd1cmF0aW9uLm5hbWUgPT09IGNvbmZpZ3VyYXRpb24ucmVzb2x2ZWQubmFtZSAmJlxuXHRcdFx0cy5jb25maWd1cmF0aW9uLnR5cGUgPT09IGNvbmZpZ3VyYXRpb24ucmVzb2x2ZWQudHlwZSAmJlxuXHRcdFx0cy5jb25maWd1cmF0aW9uLnJlcXVlc3QgPT09IGNvbmZpZ3VyYXRpb24ucmVzb2x2ZWQucmVxdWVzdCAmJlxuXHRcdFx0cy5yb290ID09PSByb290XG5cdFx0KSAmJiBjb25maWd1cmF0aW9uLnJlc29sdmVkLnN1cHByZXNzTXVsdGlwbGVTZXNzaW9uV2FybmluZyAhPT0gdHJ1ZSkge1xuXHRcdFx0Ly8gVGhlcmUgaXMgYWxyZWFkeSBhIHNlc3Npb24gd2l0aCB0aGUgc2FtZSBjb25maWd1cmF0aW9uLCBwcm9tcHQgdXNlciAjMTI3NzIxXG5cdFx0XHRjb25zdCBjb25maXJtZWQgPSBhd2FpdCB0aGlzLmNvbmZpcm1Db25jdXJyZW50U2Vzc2lvbihzZXNzaW9uLmdldExhYmVsKCkpO1xuXHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubW9kZWwuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdC8vIHNpbmNlIHRoZSBTZXNzaW9uIGlzIG5vdyBwcm9wZXJseSByZWdpc3RlcmVkIHVuZGVyIGl0cyBJRCBhbmQgaG9va2VkLCB3ZSBjYW4gYW5ub3VuY2UgaXRcblx0XHQvLyB0aGlzIGV2ZW50IGRvZXNuJ3QgZ28gdG8gZXh0ZW5zaW9uc1xuXHRcdHRoaXMuX29uV2lsbE5ld1Nlc3Npb24uZmlyZShzZXNzaW9uKTtcblxuXHRcdGNvbnN0IG9wZW5EZWJ1ZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykub3BlbkRlYnVnO1xuXHRcdC8vIE9wZW4gZGVidWcgdmlld2xldCBiYXNlZCBvbiB0aGUgdmlzaWJpbGl0eSBvZiB0aGUgc2lkZSBiYXIgYW5kIG9wZW5EZWJ1ZyBzZXR0aW5nLiBEbyBub3Qgb3BlbiBmb3IgJ3J1biB3aXRob3V0IGRlYnVnJy5cblx0XHQvLyBOb3RlOiAnb3Blbk9uRGVidWdCcmVhaycgaXMgaW50ZW50aW9uYWxseSBleGNsdWRlZCBoZXJlIC0gdGhhdCBjYXNlIGlzIGhhbmRsZWQgaW4gZGVidWdTZXNzaW9uIHdoZW4gYSBicmVha3BvaW50IGlzIGhpdC5cblx0XHRpZiAoIWNvbmZpZ3VyYXRpb24ucmVzb2x2ZWQubm9EZWJ1ZyAmJiAob3BlbkRlYnVnID09PSAnb3Blbk9uU2Vzc2lvblN0YXJ0JyB8fCAob3BlbkRlYnVnID09PSAnb3Blbk9uRmlyc3RTZXNzaW9uU3RhcnQnICYmIHRoaXMudmlld01vZGVsLmZpcnN0U2Vzc2lvblN0YXJ0KSkgJiYgIXNlc3Npb24uc3VwcHJlc3NEZWJ1Z1ZpZXcpIHtcblx0XHRcdGF3YWl0IHRoaXMucGFuZUNvbXBvc2l0ZVNlcnZpY2Uub3BlblBhbmVDb21wb3NpdGUoVklFV0xFVF9JRCwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmxhdW5jaE9yQXR0YWNoVG9TZXNzaW9uKHNlc3Npb24pO1xuXG5cdFx0XHRjb25zdCBpbnRlcm5hbENvbnNvbGVPcHRpb25zID0gc2Vzc2lvbi5jb25maWd1cmF0aW9uLmludGVybmFsQ29uc29sZU9wdGlvbnMgfHwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5pbnRlcm5hbENvbnNvbGVPcHRpb25zO1xuXHRcdFx0aWYgKGludGVybmFsQ29uc29sZU9wdGlvbnMgPT09ICdvcGVuT25TZXNzaW9uU3RhcnQnIHx8ICh0aGlzLnZpZXdNb2RlbC5maXJzdFNlc3Npb25TdGFydCAmJiBpbnRlcm5hbENvbnNvbGVPcHRpb25zID09PSAnb3Blbk9uRmlyc3RTZXNzaW9uU3RhcnQnKSkge1xuXHRcdFx0XHR0aGlzLnZpZXdzU2VydmljZS5vcGVuVmlldyhSRVBMX1ZJRVdfSUQsIGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy52aWV3TW9kZWwuZmlyc3RTZXNzaW9uU3RhcnQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHNob3dTdWJTZXNzaW9ucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuc2hvd1N1YlNlc3Npb25zSW5Ub29sQmFyO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLm1vZGVsLmdldFNlc3Npb25zKCk7XG5cdFx0XHRjb25zdCBzaG93blNlc3Npb25zID0gc2hvd1N1YlNlc3Npb25zID8gc2Vzc2lvbnMgOiBzZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5wYXJlbnRTZXNzaW9uKTtcblx0XHRcdGlmIChzaG93blNlc3Npb25zLmxlbmd0aCA+IDEpIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwuc2V0TXVsdGlTZXNzaW9uVmlldyh0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2luY2UgdGhlIGluaXRpYWxpemVkIHJlc3BvbnNlIGhhcyBhcnJpdmVkIGFubm91bmNlIHRoZSBuZXcgU2Vzc2lvbiAoaW5jbHVkaW5nIGV4dGVuc2lvbnMpXG5cdFx0XHR0aGlzLl9vbkRpZE5ld1Nlc3Npb24uZmlyZShzZXNzaW9uKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblxuXHRcdFx0aWYgKGVycm9ycy5pc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHQvLyBkb24ndCBzaG93ICdjYW5jZWxlZCcgZXJyb3IgbWVzc2FnZXMgdG8gdGhlIHVzZXIgIzc5MDZcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IHRoZSByZXBsIGlmIHNvbWUgZXJyb3IgZ290IGxvZ2dlZCB0aGVyZSAjNTg3MFxuXHRcdFx0aWYgKHNlc3Npb24gJiYgc2Vzc2lvbi5nZXRSZXBsRWxlbWVudHMoKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KFJFUExfVklFV19JRCwgZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2Vzc2lvbi5jb25maWd1cmF0aW9uICYmIHNlc3Npb24uY29uZmlndXJhdGlvbi5yZXF1ZXN0ID09PSAnYXR0YWNoJyAmJiBzZXNzaW9uLmNvbmZpZ3VyYXRpb24uX19hdXRvQXR0YWNoKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBhdHRhY2ggdGltZW91dHMgaW4gYXV0byBhdHRhY2ggbW9kZVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVycm9yTWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogZXJyb3I7XG5cdFx0XHRpZiAoZXJyb3Iuc2hvd1VzZXIgIT09IGZhbHNlKSB7XG5cdFx0XHRcdC8vIE9ubHkgc2hvdyB0aGUgZXJyb3Igd2hlbiBzaG93VXNlciBpcyBlaXRoZXIgbm90IGRlZmluZWQsIG9yIGlzIHRydWUgIzEyODQ4NFxuXHRcdFx0XHRhd2FpdCB0aGlzLnNob3dFcnJvcihlcnJvck1lc3NhZ2UsIGlzRXJyb3JXaXRoQWN0aW9ucyhlcnJvcikgPyBlcnJvci5hY3Rpb25zIDogW10pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29uZmlybUNvbmN1cnJlbnRTZXNzaW9uKHNlc3Npb25MYWJlbDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdtdWx0aXBsZVNlc3Npb24nLCBcIid7MH0nIGlzIGFscmVhZHkgcnVubmluZy4gRG8geW91IHdhbnQgdG8gc3RhcnQgYW5vdGhlciBpbnN0YW5jZT9cIiwgc2Vzc2lvbkxhYmVsKVxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQuY29uZmlybWVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsYXVuY2hPckF0dGFjaFRvU2Vzc2lvbihzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBmb3JjZUZvY3VzID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyByZWdpc3RlciBsaXN0ZW5lcnMgYXMgdGhlIHZlcnkgZmlyc3QgdGhpbmchXG5cdFx0dGhpcy5yZWdpc3RlclNlc3Npb25MaXN0ZW5lcnMoc2Vzc2lvbik7XG5cblx0XHRjb25zdCBkYmdyID0gdGhpcy5hZGFwdGVyTWFuYWdlci5nZXREZWJ1Z2dlcihzZXNzaW9uLmNvbmZpZ3VyYXRpb24udHlwZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHNlc3Npb24uaW5pdGlhbGl6ZShkYmdyISk7XG5cdFx0XHRhd2FpdCBzZXNzaW9uLmxhdW5jaE9yQXR0YWNoKHNlc3Npb24uY29uZmlndXJhdGlvbik7XG5cdFx0XHRjb25zdCBsYXVuY2hKc29uRXhpc3RzID0gISFzZXNzaW9uLnJvb3QgJiYgISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElHbG9iYWxDb25maWc+KCdsYXVuY2gnLCB7IHJlc291cmNlOiBzZXNzaW9uLnJvb3QudXJpIH0pO1xuXHRcdFx0YXdhaXQgdGhpcy50ZWxlbWV0cnkubG9nRGVidWdTZXNzaW9uU3RhcnQoZGJnciEsIGxhdW5jaEpzb25FeGlzdHMpO1xuXG5cdFx0XHRpZiAoZm9yY2VGb2N1cyB8fCAhdGhpcy52aWV3TW9kZWwuZm9jdXNlZFNlc3Npb24gfHwgKHNlc3Npb24ucGFyZW50U2Vzc2lvbiA9PT0gdGhpcy52aWV3TW9kZWwuZm9jdXNlZFNlc3Npb24gJiYgc2Vzc2lvbi5jb21wYWN0KSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZvY3VzU3RhY2tGcmFtZSh1bmRlZmluZWQsIHVuZGVmaW5lZCwgc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAodGhpcy52aWV3TW9kZWwuZm9jdXNlZFNlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5mb2N1c1N0YWNrRnJhbWUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBsaXN0ZW5lckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGxpc3RlbmVyRGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblJ1bm5pbmdTY2hlZHVsZXIgPSBsaXN0ZW5lckRpc3Bvc2FibGVzLmFkZChuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHQvLyBEbyBub3QgaW1tZWRpYXRseSBkZWZvY3VzIHRoZSBzdGFjayBmcmFtZSBpZiB0aGUgc2Vzc2lvbiBpcyBydW5uaW5nXG5cdFx0XHRpZiAoc2Vzc2lvbi5zdGF0ZSA9PT0gU3RhdGUuUnVubmluZyAmJiB0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbiA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZXRGb2N1cyh1bmRlZmluZWQsIHRoaXMudmlld01vZGVsLmZvY3VzZWRUaHJlYWQsIHNlc3Npb24sIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9LCAyMDApKTtcblx0XHRsaXN0ZW5lckRpc3Bvc2FibGVzLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlU3RhdGUoKCkgPT4ge1xuXHRcdFx0aWYgKHNlc3Npb24uc3RhdGUgPT09IFN0YXRlLlJ1bm5pbmcgJiYgdGhpcy52aWV3TW9kZWwuZm9jdXNlZFNlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdFx0c2Vzc2lvblJ1bm5pbmdTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHRcdH1cblx0XHRcdGlmIChzZXNzaW9uID09PSB0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLm9uU3RhdGVDaGFuZ2UoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0bGlzdGVuZXJEaXNwb3NhYmxlcy5hZGQodGhpcy5vbkRpZEVuZFNlc3Npb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5zZXNzaW9uID09PSBzZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuZGVsZXRlKGxpc3RlbmVyRGlzcG9zYWJsZXMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRsaXN0ZW5lckRpc3Bvc2FibGVzLmFkZChzZXNzaW9uLm9uRGlkRW5kQWRhcHRlcihhc3luYyBhZGFwdGVyRXhpdEV2ZW50ID0+IHtcblxuXHRcdFx0aWYgKGFkYXB0ZXJFeGl0RXZlbnQpIHtcblx0XHRcdFx0aWYgKGFkYXB0ZXJFeGl0RXZlbnQuZXJyb3IpIHtcblx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobmxzLmxvY2FsaXplKCdkZWJ1Z0FkYXB0ZXJDcmFzaCcsIFwiRGVidWcgYWRhcHRlciBwcm9jZXNzIGhhcyB0ZXJtaW5hdGVkIHVuZXhwZWN0ZWRseSAoezB9KVwiLCBhZGFwdGVyRXhpdEV2ZW50LmVycm9yLm1lc3NhZ2UgfHwgYWRhcHRlckV4aXRFdmVudC5lcnJvci50b1N0cmluZygpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy50ZWxlbWV0cnkubG9nRGVidWdTZXNzaW9uU3RvcChzZXNzaW9uLCBhZGFwdGVyRXhpdEV2ZW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gJ1J1biB3aXRob3V0IGRlYnVnZ2luZycgbW9kZSBWU0NvZGUgbXVzdCB0ZXJtaW5hdGUgdGhlIGV4dGVuc2lvbiBob3N0LiBNb3JlIGRldGFpbHM6ICMzOTA1XG5cdFx0XHRjb25zdCBleHRlbnNpb25EZWJ1Z1Nlc3Npb24gPSBnZXRFeHRlbnNpb25Ib3N0RGVidWdTZXNzaW9uKHNlc3Npb24pO1xuXHRcdFx0aWYgKGV4dGVuc2lvbkRlYnVnU2Vzc2lvbiAmJiBleHRlbnNpb25EZWJ1Z1Nlc3Npb24uc3RhdGUgPT09IFN0YXRlLlJ1bm5pbmcgJiYgZXh0ZW5zaW9uRGVidWdTZXNzaW9uLmNvbmZpZ3VyYXRpb24ubm9EZWJ1Zykge1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UuY2xvc2UoZXh0ZW5zaW9uRGVidWdTZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2Vzc2lvbi5jb25maWd1cmF0aW9uLnBvc3REZWJ1Z1Rhc2spIHtcblx0XHRcdFx0Y29uc3Qgcm9vdCA9IHNlc3Npb24ucm9vdCA/PyB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudGFza1J1bm5lci5ydW5UYXNrKHJvb3QsIHNlc3Npb24uY29uZmlndXJhdGlvbi5wb3N0RGVidWdUYXNrKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuZW5kSW5pdGlhbGl6aW5nU3RhdGUoKTtcblx0XHRcdHRoaXMuY2FuY2VsVG9rZW5zKHNlc3Npb24uZ2V0SWQoKSk7XG5cblx0XHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLmNsb3NlUmVhZG9ubHlUYWJzT25FbmQpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yc1RvQ2xvc2UgPSB0aGlzLmVkaXRvclNlcnZpY2UuZ2V0RWRpdG9ycyhFZGl0b3JzT3JkZXIuU0VRVUVOVElBTCkuZmlsdGVyKCh7IGVkaXRvciB9KSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIGVkaXRvci5yZXNvdXJjZT8uc2NoZW1lID09PSBERUJVR19TQ0hFTUUgJiYgc2Vzc2lvbi5nZXRJZCgpID09PSBTb3VyY2UuZ2V0RW5jb2RlZERlYnVnRGF0YShlZGl0b3IucmVzb3VyY2UpLnNlc3Npb25JZDtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5jbG9zZUVkaXRvcnMoZWRpdG9yc1RvQ2xvc2UpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fb25EaWRFbmRTZXNzaW9uLmZpcmUoeyBzZXNzaW9uLCByZXN0YXJ0OiB0aGlzLnJlc3RhcnRpbmdTZXNzaW9ucy5oYXMoc2Vzc2lvbikgfSk7XG5cblx0XHRcdGNvbnN0IGZvY3VzZWRTZXNzaW9uID0gdGhpcy52aWV3TW9kZWwuZm9jdXNlZFNlc3Npb247XG5cdFx0XHRpZiAoZm9jdXNlZFNlc3Npb24gJiYgZm9jdXNlZFNlc3Npb24uZ2V0SWQoKSA9PT0gc2Vzc2lvbi5nZXRJZCgpKSB7XG5cdFx0XHRcdGNvbnN0IHsgc2Vzc2lvbiwgdGhyZWFkLCBzdGFja0ZyYW1lIH0gPSBnZXRTdGFja0ZyYW1lVGhyZWFkQW5kU2Vzc2lvblRvRm9jdXModGhpcy5tb2RlbCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZm9jdXNlZFNlc3Npb24pO1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZXRGb2N1cyhzdGFja0ZyYW1lLCB0aHJlYWQsIHNlc3Npb24sIGZhbHNlKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMubW9kZWwuZ2V0U2Vzc2lvbnMoKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwuc2V0TXVsdGlTZXNzaW9uVmlldyhmYWxzZSk7XG5cblx0XHRcdFx0aWYgKHRoaXMubGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuU0lERUJBUl9QQVJUKSAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElEZWJ1Z0NvbmZpZ3VyYXRpb24+KCdkZWJ1ZycpLm9wZW5FeHBsb3Jlck9uRW5kKSB7XG5cdFx0XHRcdFx0dGhpcy5wYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZShFWFBMT1JFUl9WSUVXTEVUX0lELCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEYXRhIGJyZWFrcG9pbnRzIHRoYXQgY2FuIG5vdCBiZSBwZXJzaXN0ZWQgc2hvdWxkIGJlIGNsZWFyZWQgd2hlbiBhIHNlc3Npb24gZW5kc1xuXHRcdFx0XHRjb25zdCBkYXRhQnJlYWtwb2ludHMgPSB0aGlzLm1vZGVsLmdldERhdGFCcmVha3BvaW50cygpLmZpbHRlcihkYnAgPT4gIWRicC5jYW5QZXJzaXN0KTtcblx0XHRcdFx0ZGF0YUJyZWFrcG9pbnRzLmZvckVhY2goZGJwID0+IHRoaXMubW9kZWwucmVtb3ZlRGF0YUJyZWFrcG9pbnRzKGRicC5nZXRJZCgpKSk7XG5cblx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SURlYnVnQ29uZmlndXJhdGlvbj4oJ2RlYnVnJykuY29uc29sZS5jbG9zZU9uRW5kKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVidWdDb25zb2xlQ29udGFpbmVyID0gdGhpcy52aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKFJFUExfVklFV19JRCk7XG5cdFx0XHRcdFx0aWYgKGRlYnVnQ29uc29sZUNvbnRhaW5lciAmJiB0aGlzLnZpZXdzU2VydmljZS5pc1ZpZXdDb250YWluZXJWaXNpYmxlKGRlYnVnQ29uc29sZUNvbnRhaW5lci5pZCkpIHtcblx0XHRcdFx0XHRcdHRoaXMudmlld3NTZXJ2aWNlLmNsb3NlVmlld0NvbnRhaW5lcihkZWJ1Z0NvbnNvbGVDb250YWluZXIuaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLm1vZGVsLnJlbW92ZUV4Y2VwdGlvbkJyZWFrcG9pbnRzRm9yU2Vzc2lvbihzZXNzaW9uLmdldElkKCkpO1xuXHRcdFx0Ly8gc2Vzc2lvbi5kaXNwb3NlKCk7IFRPRE9Acm9ibG91cmVuc1xuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIHJlc3RhcnRTZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24sIHJlc3RhcnREYXRhPzogYW55KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNlc3Npb24uc2F2ZUJlZm9yZVJlc3RhcnQpIHtcblx0XHRcdGF3YWl0IHNhdmVBbGxCZWZvcmVEZWJ1Z1N0YXJ0KHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuZWRpdG9yU2VydmljZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNBdXRvUmVzdGFydCA9ICEhcmVzdGFydERhdGE7XG5cblx0XHRjb25zdCBydW5UYXNrczogKCkgPT4gUHJvbWlzZTxUYXNrUnVuUmVzdWx0PiA9IGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChpc0F1dG9SZXN0YXJ0KSB7XG5cdFx0XHRcdC8vIERvIG5vdCBydW4gcHJlTGF1bmNoIGFuZCBwb3N0RGVidWcgdGFza3MgZm9yIGF1dG9tYXRpYyByZXN0YXJ0c1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFRhc2tSdW5SZXN1bHQuU3VjY2Vzcyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJvb3QgPSBzZXNzaW9uLnJvb3QgfHwgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRcdGF3YWl0IHRoaXMudGFza1J1bm5lci5ydW5UYXNrKHJvb3QsIHNlc3Npb24uY29uZmlndXJhdGlvbi5wcmVSZXN0YXJ0VGFzayk7XG5cdFx0XHRhd2FpdCB0aGlzLnRhc2tSdW5uZXIucnVuVGFzayhyb290LCBzZXNzaW9uLmNvbmZpZ3VyYXRpb24ucG9zdERlYnVnVGFzayk7XG5cblx0XHRcdGNvbnN0IHRhc2tSZXN1bHQxID0gYXdhaXQgdGhpcy50YXNrUnVubmVyLnJ1blRhc2tBbmRDaGVja0Vycm9ycyhyb290LCBzZXNzaW9uLmNvbmZpZ3VyYXRpb24ucHJlTGF1bmNoVGFzayk7XG5cdFx0XHRpZiAodGFza1Jlc3VsdDEgIT09IFRhc2tSdW5SZXN1bHQuU3VjY2Vzcykge1xuXHRcdFx0XHRyZXR1cm4gdGFza1Jlc3VsdDE7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLnRhc2tSdW5uZXIucnVuVGFza0FuZENoZWNrRXJyb3JzKHJvb3QsIHNlc3Npb24uY29uZmlndXJhdGlvbi5wb3N0UmVzdGFydFRhc2spO1xuXHRcdH07XG5cblx0XHRjb25zdCBleHRlbnNpb25EZWJ1Z1Nlc3Npb24gPSBnZXRFeHRlbnNpb25Ib3N0RGVidWdTZXNzaW9uKHNlc3Npb24pO1xuXHRcdGlmIChleHRlbnNpb25EZWJ1Z1Nlc3Npb24pIHtcblx0XHRcdGNvbnN0IHRhc2tSZXN1bHQgPSBhd2FpdCBydW5UYXNrcygpO1xuXHRcdFx0aWYgKHRhc2tSZXN1bHQgPT09IFRhc2tSdW5SZXN1bHQuU3VjY2Vzcykge1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvbkhvc3REZWJ1Z1NlcnZpY2UucmVsb2FkKGV4dGVuc2lvbkRlYnVnU2Vzc2lvbi5nZXRJZCgpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJlYWQgdGhlIGNvbmZpZ3VyYXRpb24gYWdhaW4gaWYgYSBsYXVuY2guanNvbiBoYXMgYmVlbiBjaGFuZ2VkLCBpZiBub3QganVzdCB1c2UgdGhlIGlubWVtb3J5IGNvbmZpZ3VyYXRpb25cblx0XHRsZXQgbmVlZHNUb1N1YnN0aXR1dGUgPSBmYWxzZTtcblx0XHRsZXQgdW5yZXNvbHZlZDogSUNvbmZpZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBsYXVuY2ggPSBzZXNzaW9uLnJvb3QgPyB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLmdldExhdW5jaChzZXNzaW9uLnJvb3QudXJpKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAobGF1bmNoKSB7XG5cdFx0XHR1bnJlc29sdmVkID0gbGF1bmNoLmdldENvbmZpZ3VyYXRpb24oc2Vzc2lvbi5jb25maWd1cmF0aW9uLm5hbWUpO1xuXHRcdFx0aWYgKHVucmVzb2x2ZWQgJiYgIWVxdWFscyh1bnJlc29sdmVkLCBzZXNzaW9uLnVucmVzb2x2ZWRDb25maWd1cmF0aW9uKSkge1xuXHRcdFx0XHR1bnJlc29sdmVkLm5vRGVidWcgPSBzZXNzaW9uLmNvbmZpZ3VyYXRpb24ubm9EZWJ1Zztcblx0XHRcdFx0bmVlZHNUb1N1YnN0aXR1dGUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCByZXNvbHZlZDogSUNvbmZpZyB8IHVuZGVmaW5lZCB8IG51bGwgPSBzZXNzaW9uLmNvbmZpZ3VyYXRpb247XG5cdFx0aWYgKGxhdW5jaCAmJiBuZWVkc1RvU3Vic3RpdHV0ZSAmJiB1bnJlc29sdmVkKSB7XG5cdFx0XHRjb25zdCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHRoaXMuc2Vzc2lvbkNhbmNlbGxhdGlvblRva2Vucy5zZXQoc2Vzc2lvbi5nZXRJZCgpLCBpbml0Q2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRCeVByb3ZpZGVycyA9IGF3YWl0IHRoaXMuY29uZmlndXJhdGlvbk1hbmFnZXIucmVzb2x2ZUNvbmZpZ3VyYXRpb25CeVByb3ZpZGVycyhsYXVuY2gud29ya3NwYWNlID8gbGF1bmNoLndvcmtzcGFjZS51cmkgOiB1bmRlZmluZWQsIHVucmVzb2x2ZWQudHlwZSwgdW5yZXNvbHZlZCwgaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuKTtcblx0XHRcdGlmIChyZXNvbHZlZEJ5UHJvdmlkZXJzKSB7XG5cdFx0XHRcdHJlc29sdmVkID0gYXdhaXQgdGhpcy5zdWJzdGl0dXRlVmFyaWFibGVzKGxhdW5jaCwgcmVzb2x2ZWRCeVByb3ZpZGVycyk7XG5cdFx0XHRcdGlmIChyZXNvbHZlZCAmJiAhaW5pdENhbmNlbGxhdGlvblRva2VuLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZWQgPSBhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25NYW5hZ2VyLnJlc29sdmVEZWJ1Z0NvbmZpZ3VyYXRpb25XaXRoU3Vic3RpdHV0ZWRWYXJpYWJsZXMobGF1bmNoICYmIGxhdW5jaC53b3Jrc3BhY2UgPyBsYXVuY2gud29ya3NwYWNlLnVyaSA6IHVuZGVmaW5lZCwgcmVzb2x2ZWQudHlwZSwgcmVzb2x2ZWQsIGluaXRDYW5jZWxsYXRpb25Ub2tlbi50b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc29sdmVkID0gcmVzb2x2ZWRCeVByb3ZpZGVycztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHJlc29sdmVkKSB7XG5cdFx0XHRzZXNzaW9uLnNldENvbmZpZ3VyYXRpb24oeyByZXNvbHZlZCwgdW5yZXNvbHZlZCB9KTtcblx0XHR9XG5cdFx0c2Vzc2lvbi5jb25maWd1cmF0aW9uLl9fcmVzdGFydCA9IHJlc3RhcnREYXRhO1xuXG5cdFx0Y29uc3QgZG9SZXN0YXJ0ID0gYXN5bmMgKGZuOiAoKSA9PiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+KSA9PiB7XG5cdFx0XHR0aGlzLnJlc3RhcnRpbmdTZXNzaW9ucy5hZGQoc2Vzc2lvbik7XG5cdFx0XHRsZXQgZGlkUmVzdGFydCA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZGlkUmVzdGFydCA9IChhd2FpdCBmbigpKSAhPT0gZmFsc2U7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGRpZFJlc3RhcnQgPSBmYWxzZTtcblx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMucmVzdGFydGluZ1Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uKTtcblx0XHRcdFx0Ly8gd2UgcHJldmlvdXNseSBtYXkgaGF2ZSBpc3N1ZWQgYW4gb25EaWRFbmRTZXNzaW9uIHdpdGggcmVzdGFydDogdHJ1ZSxcblx0XHRcdFx0Ly8gYXNzdW1pbmcgdGhlIGFkYXB0ZXIgZXhpdGVkIChpbiBgcmVnaXN0ZXJTZXNzaW9uTGlzdGVuZXJzYCkuIEJ1dCB0aGVcblx0XHRcdFx0Ly8gcmVzdGFydCBmYWlsZWQsIHNvIGVtaXQgdGhlIGZpbmFsIHRlcm1pbmF0aW9uIG5vdy5cblx0XHRcdFx0aWYgKCFkaWRSZXN0YXJ0KSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRFbmRTZXNzaW9uLmZpcmUoeyBzZXNzaW9uLCByZXN0YXJ0OiBmYWxzZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRmb3IgKGNvbnN0IGJyZWFrcG9pbnQgb2YgdGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cyh7IHRyaWdnZXJlZE9ubHk6IHRydWUgfSkpIHtcblx0XHRcdGJyZWFrcG9pbnQuc2V0U2Vzc2lvbkRpZFRyaWdnZXIoc2Vzc2lvbi5nZXRJZCgpLCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yIGRlYnVnIHNlc3Npb25zIHNwYXduZWQgYnkgdGVzdCBydW5zLCBjYW5jZWwgdGhlIHRlc3QgcnVuIGFuZCBzdG9wXG5cdFx0Ly8gdGhlIHNlc3Npb24sIHRoZW4gc3RhcnQgdGhlIHRlc3QgcnVuIGFnYWluOyB0ZXN0cyBoYXZlIG5vIG5vdGlvbiBvZiByZXN0YXJ0cy5cblx0XHRpZiAoc2Vzc2lvbi5jb3JyZWxhdGVkVGVzdFJ1bikge1xuXHRcdFx0aWYgKCFzZXNzaW9uLmNvcnJlbGF0ZWRUZXN0UnVuLmNvbXBsZXRlZEF0KSB7XG5cdFx0XHRcdHNlc3Npb24uY2FuY2VsQ29ycmVsYXRlZFRlc3RSdW4oKTtcblx0XHRcdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKHNlc3Npb24uY29ycmVsYXRlZFRlc3RSdW4ub25Db21wbGV0ZSk7XG5cdFx0XHRcdC8vIHRvZG9AY29ubm9yNDMxMiBpcyB0aGVyZSBhbnkgcmVhc29uIHRvIHdhaXQgZm9yIHRoZSBkZWJ1ZyBzZXNzaW9uIHRvXG5cdFx0XHRcdC8vIHRlcm1pbmF0ZT8gSSBkb24ndCB0aGluayBzbywgdGVzdCBleHRlbnNpb24gc2hvdWxkIGFscmVhZHkgaGFuZGxlIGFueVxuXHRcdFx0XHQvLyBzdGF0ZSBjb25mbGljdHMuLi5cblx0XHRcdH1cblxuXHRcdFx0dGhpcy50ZXN0U2VydmljZS5ydW5SZXNvbHZlZFRlc3RzKHNlc3Npb24uY29ycmVsYXRlZFRlc3RSdW4ucmVxdWVzdCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNlc3Npb24uY2FwYWJpbGl0aWVzLnN1cHBvcnRzUmVzdGFydFJlcXVlc3QpIHtcblx0XHRcdGNvbnN0IHRhc2tSZXN1bHQgPSBhd2FpdCBydW5UYXNrcygpO1xuXHRcdFx0aWYgKHRhc2tSZXN1bHQgPT09IFRhc2tSdW5SZXN1bHQuU3VjY2Vzcykge1xuXHRcdFx0XHRhd2FpdCBkb1Jlc3RhcnQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHNlc3Npb24ucmVzdGFydCgpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNob3VsZEZvY3VzID0gISF0aGlzLnZpZXdNb2RlbC5mb2N1c2VkU2Vzc2lvbiAmJiBzZXNzaW9uLmdldElkKCkgPT09IHRoaXMudmlld01vZGVsLmZvY3VzZWRTZXNzaW9uLmdldElkKCk7XG5cdFx0cmV0dXJuIGRvUmVzdGFydChhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBJZiB0aGUgcmVzdGFydCBpcyBhdXRvbWF0aWMgIC0+IGRpc2Nvbm5lY3QsIG90aGVyd2lzZSAtPiB0ZXJtaW5hdGUgIzU1MDY0XG5cdFx0XHRpZiAoaXNBdXRvUmVzdGFydCkge1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uLmRpc2Nvbm5lY3QodHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhd2FpdCBzZXNzaW9uLnRlcm1pbmF0ZSh0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPGJvb2xlYW4+KChjLCBlKSA9PiB7XG5cdFx0XHRcdHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRhc2tSZXN1bHQgPSBhd2FpdCBydW5UYXNrcygpO1xuXHRcdFx0XHRcdGlmICh0YXNrUmVzdWx0ICE9PSBUYXNrUnVuUmVzdWx0LlN1Y2Nlc3MpIHtcblx0XHRcdFx0XHRcdHJldHVybiBjKGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYyhmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMubGF1bmNoT3JBdHRhY2hUb1Nlc3Npb24oc2Vzc2lvbiwgc2hvdWxkRm9jdXMpO1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWROZXdTZXNzaW9uLmZpcmUoc2Vzc2lvbik7XG5cdFx0XHRcdFx0XHRjKHRydWUpO1xuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRlKGVycm9yKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDMwMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHN0b3BTZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQsIGRpc2Nvbm5lY3QgPSBmYWxzZSwgc3VzcGVuZCA9IGZhbHNlKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIGRpc2Nvbm5lY3QgPyBzZXNzaW9uLmRpc2Nvbm5lY3QodW5kZWZpbmVkLCBzdXNwZW5kKSA6IHNlc3Npb24udGVybWluYXRlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLm1vZGVsLmdldFNlc3Npb25zKCk7XG5cdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy50YXNrUnVubmVyLmNhbmNlbCgpO1xuXHRcdFx0Ly8gVXNlciBtaWdodCBoYXZlIGNhbmNlbGxlZCBzdGFydGluZyBvZiBhIGRlYnVnIHNlc3Npb24sIGFuZCBpbiBzb21lIGNhc2VzIHRoZSBxdWljayBwaWNrIGlzIGxlZnQgb3BlblxuXHRcdFx0YXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5jYW5jZWwoKTtcblx0XHRcdHRoaXMuZW5kSW5pdGlhbGl6aW5nU3RhdGUoKTtcblx0XHRcdHRoaXMuY2FuY2VsVG9rZW5zKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHNlc3Npb25zLm1hcChzID0+IGRpc2Nvbm5lY3QgPyBzLmRpc2Nvbm5lY3QodW5kZWZpbmVkLCBzdXNwZW5kKSA6IHMudGVybWluYXRlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc3Vic3RpdHV0ZVZhcmlhYmxlcyhsYXVuY2g6IElMYXVuY2ggfCB1bmRlZmluZWQsIGNvbmZpZzogSUNvbmZpZyk6IFByb21pc2U8SUNvbmZpZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRiZyA9IHRoaXMuYWRhcHRlck1hbmFnZXIuZ2V0RGVidWdnZXIoY29uZmlnLnR5cGUpO1xuXHRcdGlmIChkYmcpIHtcblx0XHRcdGxldCBmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAobGF1bmNoICYmIGxhdW5jaC53b3Jrc3BhY2UpIHtcblx0XHRcdFx0Zm9sZGVyID0gbGF1bmNoLndvcmtzcGFjZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlcnMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRcdGlmIChmb2xkZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdGZvbGRlciA9IGZvbGRlcnNbMF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCBkYmcuc3Vic3RpdHV0ZVZhcmlhYmxlcyhmb2xkZXIsIGNvbmZpZyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0aWYgKGVyci5tZXNzYWdlICE9PSBlcnJvcnMuY2FuY2VsZWROYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93RXJyb3IoZXJyLm1lc3NhZ2UsIHVuZGVmaW5lZCwgISFsYXVuY2g/LmdldENvbmZpZ3VyYXRpb24oY29uZmlnLm5hbWUpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1x0Ly8gYmFpbCBvdXRcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShjb25maWcpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzaG93RXJyb3IobWVzc2FnZTogc3RyaW5nLCBlcnJvckFjdGlvbnM6IFJlYWRvbmx5QXJyYXk8SUFjdGlvbj4gPSBbXSwgcHJvbXB0TGF1bmNoSnNvbiA9IHRydWUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb25maWd1cmVBY3Rpb24gPSB0b0FjdGlvbih7IGlkOiBERUJVR19DT05GSUdVUkVfQ09NTUFORF9JRCwgbGFiZWw6IERFQlVHX0NPTkZJR1VSRV9MQUJFTCwgZW5hYmxlZDogdHJ1ZSwgcnVuOiAoKSA9PiB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKERFQlVHX0NPTkZJR1VSRV9DT01NQU5EX0lEKSB9KTtcblx0XHQvLyBEb24ndCBhcHBlbmQgdGhlIHN0YW5kYXJkIGNvbW1hbmQgaWYgaWQgb2YgYW55IHByb3ZpZGVkIGFjdGlvbiBpbmRpY2F0ZXMgaXQgaXMgYSBjb21tYW5kXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGVycm9yQWN0aW9ucy5maWx0ZXIoKGFjdGlvbikgPT4gYWN0aW9uLmlkLmVuZHNXaXRoKCcuY29tbWFuZCcpKS5sZW5ndGggPiAwID9cblx0XHRcdGVycm9yQWN0aW9ucyA6XG5cdFx0XHRbLi4uZXJyb3JBY3Rpb25zLCAuLi4ocHJvbXB0TGF1bmNoSnNvbiA/IFtjb25maWd1cmVBY3Rpb25dIDogW10pXTtcblx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6IHNldmVyaXR5LkVycm9yLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdGJ1dHRvbnM6IGFjdGlvbnMubWFwKGFjdGlvbiA9PiAoe1xuXHRcdFx0XHRsYWJlbDogYWN0aW9uLmxhYmVsLFxuXHRcdFx0XHRydW46ICgpID0+IGFjdGlvbi5ydW4oKVxuXHRcdFx0fSkpLFxuXHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHQvLy0tLS0gZm9jdXMgbWFuYWdlbWVudFxuXG5cdGFzeW5jIGZvY3VzU3RhY2tGcmFtZShfc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQsIF90aHJlYWQ/OiBJVGhyZWFkLCBfc2Vzc2lvbj86IElEZWJ1Z1Nlc3Npb24sIG9wdGlvbnM/OiB7IGV4cGxpY2l0PzogYm9vbGVhbjsgcHJlc2VydmVGb2N1cz86IGJvb2xlYW47IHNpZGVCeVNpZGU/OiBib29sZWFuOyBwaW5uZWQ/OiBib29sZWFuIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IHN0YWNrRnJhbWUsIHRocmVhZCwgc2Vzc2lvbiB9ID0gZ2V0U3RhY2tGcmFtZVRocmVhZEFuZFNlc3Npb25Ub0ZvY3VzKHRoaXMubW9kZWwsIF9zdGFja0ZyYW1lLCBfdGhyZWFkLCBfc2Vzc2lvbik7XG5cblx0XHRpZiAoc3RhY2tGcmFtZSkge1xuXHRcdFx0Y29uc3QgZWRpdG9yID0gYXdhaXQgc3RhY2tGcmFtZS5vcGVuSW5FZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLCBvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzID8/IHRydWUsIG9wdGlvbnM/LnNpZGVCeVNpZGUsIG9wdGlvbnM/LnBpbm5lZCk7XG5cdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdGlmIChlZGl0b3IuaW5wdXQgPT09IERpc2Fzc2VtYmx5Vmlld0lucHV0Lmluc3RhbmNlKSB7XG5cdFx0XHRcdFx0Ly8gR28gdG8gYWRkcmVzcyBpcyBpbnZva2VkIHZpYSBzZXRGb2N1c1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRyb2wgPSBlZGl0b3IuZ2V0Q29udHJvbCgpO1xuXHRcdFx0XHRcdGlmIChzdGFja0ZyYW1lICYmIGlzQ29kZUVkaXRvcihjb250cm9sKSAmJiBjb250cm9sLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gY29udHJvbC5nZXRNb2RlbCgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHN0YWNrRnJhbWUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPj0gMSAmJiBsaW5lTnVtYmVyIDw9IG1vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxpbmVDb250ZW50ID0gY29udHJvbC5nZXRNb2RlbCgpLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdFx0XHRhcmlhLmFsZXJ0KG5scy5sb2NhbGl6ZSh7IGtleTogJ2RlYnVnZ2luZ1BhdXNlZCcsIGNvbW1lbnQ6IFsnRmlyc3QgcGxhY2Vob2xkZXIgaXMgdGhlIGZpbGUgbGluZSBjb250ZW50LCBzZWNvbmQgcGxhY2Vob2xkZXIgaXMgdGhlIHJlYXNvbiB3aHkgZGVidWdnaW5nIGlzIHN0b3BwZWQsIGZvciBleGFtcGxlIFwiYnJlYWtwb2ludFwiLCB0aGlyZCBpcyB0aGUgc3RhY2sgZnJhbWUgbmFtZSwgYW5kIGxhc3QgaXMgdGhlIGxpbmUgbnVtYmVyLiddIH0sXG5cdFx0XHRcdFx0XHRcdFx0XCJ7MH0sIGRlYnVnZ2luZyBwYXVzZWQgezF9LCB7Mn06ezN9XCIsIGxpbmVDb250ZW50LCB0aHJlYWQgJiYgdGhyZWFkLnN0b3BwZWREZXRhaWxzID8gYCwgcmVhc29uICR7dGhyZWFkLnN0b3BwZWREZXRhaWxzLnJlYXNvbn1gIDogJycsIHN0YWNrRnJhbWUuc291cmNlID8gc3RhY2tGcmFtZS5zb3VyY2UubmFtZSA6ICcnLCBzdGFja0ZyYW1lLnJhbmdlLnN0YXJ0TGluZU51bWJlcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dGhpcy5kZWJ1Z1R5cGUuc2V0KHNlc3Npb24uY29uZmlndXJhdGlvbi50eXBlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kZWJ1Z1R5cGUucmVzZXQoKTtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdNb2RlbC5zZXRGb2N1cyhzdGFja0ZyYW1lLCB0aHJlYWQsIHNlc3Npb24sICEhb3B0aW9ucz8uZXhwbGljaXQpO1xuXHR9XG5cblx0Ly8tLS0tIHdhdGNoZXNcblxuXHRhZGRXYXRjaEV4cHJlc3Npb24obmFtZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHdlID0gdGhpcy5tb2RlbC5hZGRXYXRjaEV4cHJlc3Npb24obmFtZSk7XG5cdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZXRTZWxlY3RlZEV4cHJlc3Npb24od2UsIGZhbHNlKTtcblx0XHR9XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVXYXRjaEV4cHJlc3Npb25zKHRoaXMubW9kZWwuZ2V0V2F0Y2hFeHByZXNzaW9ucygpKTtcblx0fVxuXG5cdHJlbmFtZVdhdGNoRXhwcmVzc2lvbihpZDogc3RyaW5nLCBuZXdOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnJlbmFtZVdhdGNoRXhwcmVzc2lvbihpZCwgbmV3TmFtZSk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVXYXRjaEV4cHJlc3Npb25zKHRoaXMubW9kZWwuZ2V0V2F0Y2hFeHByZXNzaW9ucygpKTtcblx0fVxuXG5cdG1vdmVXYXRjaEV4cHJlc3Npb24oaWQ6IHN0cmluZywgcG9zaXRpb246IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwubW92ZVdhdGNoRXhwcmVzc2lvbihpZCwgcG9zaXRpb24pO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlV2F0Y2hFeHByZXNzaW9ucyh0aGlzLm1vZGVsLmdldFdhdGNoRXhwcmVzc2lvbnMoKSk7XG5cdH1cblxuXHRyZW1vdmVXYXRjaEV4cHJlc3Npb25zKGlkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5yZW1vdmVXYXRjaEV4cHJlc3Npb25zKGlkKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZVdhdGNoRXhwcmVzc2lvbnModGhpcy5tb2RlbC5nZXRXYXRjaEV4cHJlc3Npb25zKCkpO1xuXHR9XG5cblx0Ly8tLS0tIGJyZWFrcG9pbnRzXG5cblx0Y2FuU2V0QnJlYWtwb2ludHNJbihtb2RlbDogSVRleHRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmFkYXB0ZXJNYW5hZ2VyLmNhblNldEJyZWFrcG9pbnRzSW4obW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlOiBib29sZWFuLCBicmVha3BvaW50PzogSUVuYWJsZW1lbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJlYWtwb2ludCkge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXRFbmFibGVtZW50KGJyZWFrcG9pbnQsIGVuYWJsZSk7XG5cdFx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdFx0aWYgKGJyZWFrcG9pbnQgaW5zdGFuY2VvZiBCcmVha3BvaW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMubWFrZVRyaWdnZXJlZEJyZWFrcG9pbnRzTWF0Y2hFbmFibGVtZW50KGVuYWJsZSwgYnJlYWtwb2ludCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VuZEJyZWFrcG9pbnRzKGJyZWFrcG9pbnQub3JpZ2luYWxVcmkpO1xuXHRcdFx0fSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgRnVuY3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKTtcblx0XHRcdH0gZWxzZSBpZiAoYnJlYWtwb2ludCBpbnN0YW5jZW9mIERhdGFCcmVha3BvaW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VuZERhdGFCcmVha3BvaW50cygpO1xuXHRcdFx0fSBlbHNlIGlmIChicmVha3BvaW50IGluc3RhbmNlb2YgSW5zdHJ1Y3Rpb25CcmVha3BvaW50KSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VuZEluc3RydWN0aW9uQnJlYWtwb2ludHMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubW9kZWwuZW5hYmxlT3JEaXNhYmxlQWxsQnJlYWtwb2ludHMoZW5hYmxlKTtcblx0XHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0XHRhd2FpdCB0aGlzLnNlbmRBbGxCcmVha3BvaW50cygpO1xuXHRcdH1cblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgYWRkQnJlYWtwb2ludHModXJpOiB1cmksIHJhd0JyZWFrcG9pbnRzOiBJQnJlYWtwb2ludERhdGFbXSwgYXJpYUFubm91bmNlID0gdHJ1ZSk6IFByb21pc2U8SUJyZWFrcG9pbnRbXT4ge1xuXHRcdGNvbnN0IGJyZWFrcG9pbnRzID0gdGhpcy5tb2RlbC5hZGRCcmVha3BvaW50cyh1cmksIHJhd0JyZWFrcG9pbnRzKTtcblx0XHRpZiAoYXJpYUFubm91bmNlKSB7XG5cdFx0XHRicmVha3BvaW50cy5mb3JFYWNoKGJwID0+IGFyaWEuc3RhdHVzKG5scy5sb2NhbGl6ZSgnYnJlYWtwb2ludEFkZGVkJywgXCJBZGRlZCBicmVha3BvaW50LCBsaW5lIHswfSwgZmlsZSB7MX1cIiwgYnAubGluZU51bWJlciwgdXJpLmZzUGF0aCkpKTtcblx0XHR9XG5cblx0XHQvLyBJbiBzb21lIGNhc2VzIHdlIG5lZWQgdG8gc3RvcmUgYnJlYWtwb2ludHMgYmVmb3JlIHdlIHNlbmQgdGhlbSBiZWNhdXNlIHNlbmRpbmcgdGhlbSBjYW4gdGFrZSBhIGxvbmcgdGltZVxuXHRcdC8vIEFuZCBhZnRlciBzZW5kaW5nIHRoZW0gYmVjYXVzZSB0aGUgZGVidWcgYWRhcHRlciBjYW4gYXR0YWNoIGFkYXB0ZXIgZGF0YSB0byBhIGJyZWFrcG9pbnRcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGF3YWl0IHRoaXMuc2VuZEJyZWFrcG9pbnRzKHVyaSk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRyZXR1cm4gYnJlYWtwb2ludHM7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVCcmVha3BvaW50cyh1cmk6IHVyaSwgZGF0YTogTWFwPHN0cmluZywgSUJyZWFrcG9pbnRVcGRhdGVEYXRhPiwgc2VuZE9uUmVzb3VyY2VTYXZlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubW9kZWwudXBkYXRlQnJlYWtwb2ludHMoZGF0YSk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRpZiAoc2VuZE9uUmVzb3VyY2VTYXZlZCkge1xuXHRcdFx0dGhpcy5icmVha3BvaW50c1RvU2VuZE9uUmVzb3VyY2VTYXZlZC5hZGQodXJpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5zZW5kQnJlYWtwb2ludHModXJpKTtcblx0XHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVtb3ZlQnJlYWtwb2ludHMoaWQ/OiBzdHJpbmcgfCBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJyZWFrcG9pbnRzID0gdGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cygpO1xuXHRcdGNvbnN0IHRvUmVtb3ZlID0gaWQgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyBicmVha3BvaW50c1xuXHRcdFx0OiBpZCBpbnN0YW5jZW9mIEFycmF5XG5cdFx0XHRcdD8gYnJlYWtwb2ludHMuZmlsdGVyKGJwID0+IGlkLmluY2x1ZGVzKGJwLmdldElkKCkpKVxuXHRcdFx0XHQ6IGJyZWFrcG9pbnRzLmZpbHRlcihicCA9PiBicC5nZXRJZCgpID09PSBpZCk7XG5cdFx0Ly8gbm90ZTogdXNpbmcgdGhlIGRlYnVnZ2VyLXJlc29sdmVkIHVyaSBmb3IgYXJpYSB0byByZWZsZWN0IFVJIHN0YXRlXG5cdFx0dG9SZW1vdmUuZm9yRWFjaChicCA9PiBhcmlhLnN0YXR1cyhubHMubG9jYWxpemUoJ2JyZWFrcG9pbnRSZW1vdmVkJywgXCJSZW1vdmVkIGJyZWFrcG9pbnQsIGxpbmUgezB9LCBmaWxlIHsxfVwiLCBicC5saW5lTnVtYmVyLCBicC51cmkuZnNQYXRoKSkpO1xuXHRcdGNvbnN0IHVyaXNUb0NsZWFyID0gbmV3IFNldCh0b1JlbW92ZS5tYXAoYnAgPT4gYnAub3JpZ2luYWxVcmkudG9TdHJpbmcoKSkpO1xuXG5cdFx0dGhpcy5tb2RlbC5yZW1vdmVCcmVha3BvaW50cyh0b1JlbW92ZSk7XG5cdFx0dGhpcy51bmxpbmtUcmlnZ2VyZWRCcmVha3BvaW50cyhicmVha3BvaW50cywgdG9SZW1vdmUpLmZvckVhY2godXJpID0+IHVyaXNUb0NsZWFyLmFkZCh1cmkudG9TdHJpbmcoKSkpO1xuXG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbLi4udXJpc1RvQ2xlYXJdLm1hcCh1cmkgPT4gdGhpcy5zZW5kQnJlYWtwb2ludHMoVVJJLnBhcnNlKHVyaSkpKSk7XG5cdH1cblxuXHRzZXRCcmVha3BvaW50c0FjdGl2YXRlZChhY3RpdmF0ZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLnNldEJyZWFrcG9pbnRzQWN0aXZhdGVkKGFjdGl2YXRlZCk7XG5cdFx0cmV0dXJuIHRoaXMuc2VuZEFsbEJyZWFrcG9pbnRzKCk7XG5cdH1cblxuXHRhc3luYyBhZGRGdW5jdGlvbkJyZWFrcG9pbnQob3B0cz86IElGdW5jdGlvbkJyZWFrcG9pbnRPcHRpb25zLCBpZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMubW9kZWwuYWRkRnVuY3Rpb25CcmVha3BvaW50KG9wdHMgPz8geyBuYW1lOiAnJyB9LCBpZCk7XG5cdFx0Ly8gSWYgb3B0cyBub3QgcHJvdmlkZWQsIHNlbmRpbmcgdGhlIGJyZWFrcG9pbnQgaXMgaGFuZGxlZCBieSBhIGxhdGVyIHRvIGNhbGwgdG8gYHVwZGF0ZUZ1bmN0aW9uQnJlYWtwb2ludGBcblx0XHRpZiAob3B0cykge1xuXHRcdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRcdGF3YWl0IHRoaXMuc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKTtcblx0XHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgdXBkYXRlRnVuY3Rpb25CcmVha3BvaW50KGlkOiBzdHJpbmcsIHVwZGF0ZTogeyBuYW1lPzogc3RyaW5nOyBoaXRDb25kaXRpb24/OiBzdHJpbmc7IGNvbmRpdGlvbj86IHN0cmluZyB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC51cGRhdGVGdW5jdGlvbkJyZWFrcG9pbnQoaWQsIHVwZGF0ZSk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0XHRhd2FpdCB0aGlzLnNlbmRGdW5jdGlvbkJyZWFrcG9pbnRzKCk7XG5cdH1cblxuXHRhc3luYyByZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC5yZW1vdmVGdW5jdGlvbkJyZWFrcG9pbnRzKGlkKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGF3YWl0IHRoaXMuc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoKTtcblx0fVxuXG5cdGFzeW5jIGFkZERhdGFCcmVha3BvaW50KG9wdHM6IElEYXRhQnJlYWtwb2ludE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLmFkZERhdGFCcmVha3BvaW50KG9wdHMpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kRGF0YUJyZWFrcG9pbnRzKCk7XG5cdFx0dGhpcy5kZWJ1Z1N0b3JhZ2Uuc3RvcmVCcmVha3BvaW50cyh0aGlzLm1vZGVsKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZURhdGFCcmVha3BvaW50KGlkOiBzdHJpbmcsIHVwZGF0ZTogeyBoaXRDb25kaXRpb24/OiBzdHJpbmc7IGNvbmRpdGlvbj86IHN0cmluZyB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC51cGRhdGVEYXRhQnJlYWtwb2ludChpZCwgdXBkYXRlKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGF3YWl0IHRoaXMuc2VuZERhdGFCcmVha3BvaW50cygpO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlRGF0YUJyZWFrcG9pbnRzKGlkPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC5yZW1vdmVEYXRhQnJlYWtwb2ludHMoaWQpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kRGF0YUJyZWFrcG9pbnRzKCk7XG5cdH1cblxuXHRhc3luYyBhZGRJbnN0cnVjdGlvbkJyZWFrcG9pbnQob3B0czogSUluc3RydWN0aW9uQnJlYWtwb2ludE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLmFkZEluc3RydWN0aW9uQnJlYWtwb2ludChvcHRzKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGF3YWl0IHRoaXMuc2VuZEluc3RydWN0aW9uQnJlYWtwb2ludHMoKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhpbnN0cnVjdGlvblJlZmVyZW5jZT86IHN0cmluZywgb2Zmc2V0PzogbnVtYmVyLCBhZGRyZXNzPzogYmlnaW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5tb2RlbC5yZW1vdmVJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKGluc3RydWN0aW9uUmVmZXJlbmNlLCBvZmZzZXQsIGFkZHJlc3MpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdFx0YXdhaXQgdGhpcy5zZW5kSW5zdHJ1Y3Rpb25CcmVha3BvaW50cygpO1xuXHR9XG5cblx0c2V0RXhjZXB0aW9uQnJlYWtwb2ludEZhbGxiYWNrU2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZykge1xuXHRcdHRoaXMubW9kZWwuc2V0RXhjZXB0aW9uQnJlYWtwb2ludEZhbGxiYWNrU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdHRoaXMuZGVidWdTdG9yYWdlLnN0b3JlQnJlYWtwb2ludHModGhpcy5tb2RlbCk7XG5cdH1cblxuXHRzZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiwgZmlsdGVyczogRGVidWdQcm90b2NvbC5FeGNlcHRpb25CcmVha3BvaW50c0ZpbHRlcltdKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5zZXRFeGNlcHRpb25CcmVha3BvaW50c0ZvclNlc3Npb24oc2Vzc2lvbi5nZXRJZCgpLCBmaWx0ZXJzKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHR9XG5cblx0YXN5bmMgc2V0RXhjZXB0aW9uQnJlYWtwb2ludENvbmRpdGlvbihleGNlcHRpb25CcmVha3BvaW50OiBJRXhjZXB0aW9uQnJlYWtwb2ludCwgY29uZGl0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLm1vZGVsLnNldEV4Y2VwdGlvbkJyZWFrcG9pbnRDb25kaXRpb24oZXhjZXB0aW9uQnJlYWtwb2ludCwgY29uZGl0aW9uKTtcblx0XHR0aGlzLmRlYnVnU3RvcmFnZS5zdG9yZUJyZWFrcG9pbnRzKHRoaXMubW9kZWwpO1xuXHRcdGF3YWl0IHRoaXMuc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKCk7XG5cdH1cblxuXHRhc3luYyBzZW5kQWxsQnJlYWtwb2ludHMoc2Vzc2lvbj86IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXRCcmVha3BvaW50c1Byb21pc2VzID0gZGlzdGluY3QodGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cygpLCBicCA9PiBicC5vcmlnaW5hbFVyaS50b1N0cmluZygpKVxuXHRcdFx0Lm1hcChicCA9PiB0aGlzLnNlbmRCcmVha3BvaW50cyhicC5vcmlnaW5hbFVyaSwgZmFsc2UsIHNlc3Npb24pKTtcblxuXHRcdC8vIElmIHNlbmRpbmcgYnJlYWtwb2ludHMgdG8gb25lIHNlc3Npb24gd2hpY2ggd2Uga25vdyBzdXBwb3J0cyB0aGUgY29uZmlndXJhdGlvbkRvbmUgcmVxdWVzdCwgY2FuIG1ha2UgYWxsIHJlcXVlc3RzIGluIHBhcmFsbGVsXG5cdFx0aWYgKHNlc3Npb24/LmNhcGFiaWxpdGllcy5zdXBwb3J0c0NvbmZpZ3VyYXRpb25Eb25lUmVxdWVzdCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHQuLi5zZXRCcmVha3BvaW50c1Byb21pc2VzLFxuXHRcdFx0XHR0aGlzLnNlbmRGdW5jdGlvbkJyZWFrcG9pbnRzKHNlc3Npb24pLFxuXHRcdFx0XHR0aGlzLnNlbmREYXRhQnJlYWtwb2ludHMoc2Vzc2lvbiksXG5cdFx0XHRcdHRoaXMuc2VuZEluc3RydWN0aW9uQnJlYWtwb2ludHMoc2Vzc2lvbiksXG5cdFx0XHRcdHRoaXMuc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKHNlc3Npb24pLFxuXHRcdFx0XSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHNldEJyZWFrcG9pbnRzUHJvbWlzZXMpO1xuXHRcdFx0YXdhaXQgdGhpcy5zZW5kRnVuY3Rpb25CcmVha3BvaW50cyhzZXNzaW9uKTtcblx0XHRcdGF3YWl0IHRoaXMuc2VuZERhdGFCcmVha3BvaW50cyhzZXNzaW9uKTtcblx0XHRcdGF3YWl0IHRoaXMuc2VuZEluc3RydWN0aW9uQnJlYWtwb2ludHMoc2Vzc2lvbik7XG5cdFx0XHQvLyBzZW5kIGV4Y2VwdGlvbiBicmVha3BvaW50cyBhdCB0aGUgZW5kIHNpbmNlIHNvbWUgZGVidWcgYWRhcHRlcnMgbWF5IHJlbHkgb24gdGhlIG9yZGVyIC0gdGhpcyB3YXMgdGhlIGNhc2UgYmVmb3JlXG5cdFx0XHQvLyB0aGUgY29uZmlndXJhdGlvbkRvbmUgcmVxdWVzdCB3YXMgaW50cm9kdWNlZC5cblx0XHRcdGF3YWl0IHRoaXMuc2VuZEV4Y2VwdGlvbkJyZWFrcG9pbnRzKHNlc3Npb24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmVzIHRoZSBjb25kaXRpb24gb2YgdHJpZ2dlcmVkIGJyZWFrcG9pbnRzIHRoYXQgZGVwZW5kZWQgb25cblx0ICogYnJlYWtwb2ludHMgaW4gYHJlbW92ZWRCcmVha3BvaW50c2AuIFJldHVybnMgdGhlIFVSSXMgb2YgcmVzb3VyY2VzIHRoYXRcblx0ICogaGFkIHRoZWlyIGJyZWFrcG9pbnRzIGNoYW5nZWQgaW4gdGhpcyB3YXkuXG5cdCAqL1xuXHRwcml2YXRlIHVubGlua1RyaWdnZXJlZEJyZWFrcG9pbnRzKGFsbEJyZWFrcG9pbnRzOiByZWFkb25seSBJQnJlYWtwb2ludFtdLCByZW1vdmVkQnJlYWtwb2ludHM6IHJlYWRvbmx5IElCcmVha3BvaW50W10pOiB1cmlbXSB7XG5cdFx0Y29uc3QgYWZmZWN0ZWRVcmlzOiB1cmlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVtb3ZlZCBvZiByZW1vdmVkQnJlYWtwb2ludHMpIHtcblx0XHRcdGZvciAoY29uc3QgZXhpc3Rpbmcgb2YgYWxsQnJlYWtwb2ludHMpIHtcblx0XHRcdFx0aWYgKCFyZW1vdmVkQnJlYWtwb2ludHMuaW5jbHVkZXMoZXhpc3RpbmcpICYmIGV4aXN0aW5nLnRyaWdnZXJlZEJ5ID09PSByZW1vdmVkLmdldElkKCkpIHtcblx0XHRcdFx0XHR0aGlzLm1vZGVsLnVwZGF0ZUJyZWFrcG9pbnRzKG5ldyBNYXAoW1tleGlzdGluZy5nZXRJZCgpLCB7IHRyaWdnZXJlZEJ5OiB1bmRlZmluZWQgfV1dKSk7XG5cdFx0XHRcdFx0YWZmZWN0ZWRVcmlzLnB1c2goZXhpc3Rpbmcub3JpZ2luYWxVcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFmZmVjdGVkVXJpcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWFrZVRyaWdnZXJlZEJyZWFrcG9pbnRzTWF0Y2hFbmFibGVtZW50KGVuYWJsZTogYm9vbGVhbiwgYnJlYWtwb2ludDogQnJlYWtwb2ludCkge1xuXHRcdGlmIChlbmFibGUpIHtcblx0XHRcdC8qKiBJZiB0aGUgYnJlYWtwb2ludCBpcyBiZWluZyBlbmFibGVkLCBhbHNvIGVuc3VyZSBpdHMgdHJpZ2dlcmVyIGlzIGVuYWJsZWQgKi9cblx0XHRcdGlmIChicmVha3BvaW50LnRyaWdnZXJlZEJ5KSB7XG5cdFx0XHRcdGNvbnN0IHRyaWdnZXIgPSB0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKCkuZmluZChicCA9PiBicmVha3BvaW50LnRyaWdnZXJlZEJ5ID09PSBicC5nZXRJZCgpKTtcblx0XHRcdFx0aWYgKHRyaWdnZXIgJiYgIXRyaWdnZXIuZW5hYmxlZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlLCB0cmlnZ2VyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0LyoqIE1ha2VzIGl0cyB0cmlnZ2VyZWUgc3RhdGVzIG1hdGNoIHRoZSBzdGF0ZSBvZiB0aGlzIGJyZWFrcG9pbnQgKi9cblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLm1vZGVsLmdldEJyZWFrcG9pbnRzKClcblx0XHRcdC5maWx0ZXIoYnAgPT4gYnAudHJpZ2dlcmVkQnkgPT09IGJyZWFrcG9pbnQuZ2V0SWQoKSAmJiBicC5lbmFibGVkICE9PSBlbmFibGUpXG5cdFx0XHQubWFwKGJwID0+IHRoaXMuZW5hYmxlT3JEaXNhYmxlQnJlYWtwb2ludHMoZW5hYmxlLCBicCkpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBzZW5kQnJlYWtwb2ludHMobW9kZWxVcmk6IHVyaSwgc291cmNlTW9kaWZpZWQgPSBmYWxzZSwgc2Vzc2lvbj86IElEZWJ1Z1Nlc3Npb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBicmVha3BvaW50c1RvU2VuZCA9IHRoaXMubW9kZWwuZ2V0QnJlYWtwb2ludHMoeyBvcmlnaW5hbFVyaTogbW9kZWxVcmksIGVuYWJsZWRPbmx5OiB0cnVlIH0pO1xuXHRcdGF3YWl0IHNlbmRUb09uZU9yQWxsU2Vzc2lvbnModGhpcy5tb2RlbCwgc2Vzc2lvbiwgYXN5bmMgcyA9PiB7XG5cdFx0XHRpZiAoIXMuY29uZmlndXJhdGlvbi5ub0RlYnVnKSB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25CcHMgPSBicmVha3BvaW50c1RvU2VuZC5maWx0ZXIoYnAgPT4gIWJwLnRyaWdnZXJlZEJ5IHx8IGJwLmdldFNlc3Npb25EaWRUcmlnZ2VyKHMuZ2V0SWQoKSkpO1xuXHRcdFx0XHRhd2FpdCBzLnNlbmRCcmVha3BvaW50cyhtb2RlbFVyaSwgc2Vzc2lvbkJwcywgc291cmNlTW9kaWZpZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZW5kRnVuY3Rpb25CcmVha3BvaW50cyhzZXNzaW9uPzogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGJyZWFrcG9pbnRzVG9TZW5kID0gdGhpcy5tb2RlbC5nZXRGdW5jdGlvbkJyZWFrcG9pbnRzKCkuZmlsdGVyKGZicCA9PiBmYnAuZW5hYmxlZCAmJiB0aGlzLm1vZGVsLmFyZUJyZWFrcG9pbnRzQWN0aXZhdGVkKCkpO1xuXG5cdFx0YXdhaXQgc2VuZFRvT25lT3JBbGxTZXNzaW9ucyh0aGlzLm1vZGVsLCBzZXNzaW9uLCBhc3luYyBzID0+IHtcblx0XHRcdGlmIChzLmNhcGFiaWxpdGllcy5zdXBwb3J0c0Z1bmN0aW9uQnJlYWtwb2ludHMgJiYgIXMuY29uZmlndXJhdGlvbi5ub0RlYnVnKSB7XG5cdFx0XHRcdGF3YWl0IHMuc2VuZEZ1bmN0aW9uQnJlYWtwb2ludHMoYnJlYWtwb2ludHNUb1NlbmQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZW5kRGF0YUJyZWFrcG9pbnRzKHNlc3Npb24/OiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnJlYWtwb2ludHNUb1NlbmQgPSB0aGlzLm1vZGVsLmdldERhdGFCcmVha3BvaW50cygpLmZpbHRlcihmYnAgPT4gZmJwLmVuYWJsZWQgJiYgdGhpcy5tb2RlbC5hcmVCcmVha3BvaW50c0FjdGl2YXRlZCgpKTtcblxuXHRcdGF3YWl0IHNlbmRUb09uZU9yQWxsU2Vzc2lvbnModGhpcy5tb2RlbCwgc2Vzc2lvbiwgYXN5bmMgcyA9PiB7XG5cdFx0XHRpZiAocy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNEYXRhQnJlYWtwb2ludHMgJiYgIXMuY29uZmlndXJhdGlvbi5ub0RlYnVnKSB7XG5cdFx0XHRcdGF3YWl0IHMuc2VuZERhdGFCcmVha3BvaW50cyhicmVha3BvaW50c1RvU2VuZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlbmRJbnN0cnVjdGlvbkJyZWFrcG9pbnRzKHNlc3Npb24/OiBJRGVidWdTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnJlYWtwb2ludHNUb1NlbmQgPSB0aGlzLm1vZGVsLmdldEluc3RydWN0aW9uQnJlYWtwb2ludHMoKS5maWx0ZXIoZmJwID0+IGZicC5lbmFibGVkICYmIHRoaXMubW9kZWwuYXJlQnJlYWtwb2ludHNBY3RpdmF0ZWQoKSk7XG5cblx0XHRhd2FpdCBzZW5kVG9PbmVPckFsbFNlc3Npb25zKHRoaXMubW9kZWwsIHNlc3Npb24sIGFzeW5jIHMgPT4ge1xuXHRcdFx0aWYgKHMuY2FwYWJpbGl0aWVzLnN1cHBvcnRzSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyAmJiAhcy5jb25maWd1cmF0aW9uLm5vRGVidWcpIHtcblx0XHRcdFx0YXdhaXQgcy5zZW5kSW5zdHJ1Y3Rpb25CcmVha3BvaW50cyhicmVha3BvaW50c1RvU2VuZCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHNlbmRFeGNlcHRpb25CcmVha3BvaW50cyhzZXNzaW9uPzogSURlYnVnU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBzZW5kVG9PbmVPckFsbFNlc3Npb25zKHRoaXMubW9kZWwsIHNlc3Npb24sIGFzeW5jIHMgPT4ge1xuXHRcdFx0Y29uc3QgZW5hYmxlZEV4Y2VwdGlvbkJwcyA9IHRoaXMubW9kZWwuZ2V0RXhjZXB0aW9uQnJlYWtwb2ludHNGb3JTZXNzaW9uKHMuZ2V0SWQoKSkuZmlsdGVyKGV4YiA9PiBleGIuZW5hYmxlZCk7XG5cdFx0XHRpZiAocy5jYXBhYmlsaXRpZXMuc3VwcG9ydHNDb25maWd1cmF0aW9uRG9uZVJlcXVlc3QgJiYgKCFzLmNhcGFiaWxpdGllcy5leGNlcHRpb25CcmVha3BvaW50RmlsdGVycyB8fCBzLmNhcGFiaWxpdGllcy5leGNlcHRpb25CcmVha3BvaW50RmlsdGVycy5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRcdC8vIE9ubHkgY2FsbCBgc2V0RXhjZXB0aW9uQnJlYWtwb2ludHNgIGFzIHNwZWNpZmllZCBpbiBkYXAgcHJvdG9jb2wgIzkwMDAxXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghcy5jb25maWd1cmF0aW9uLm5vRGVidWcpIHtcblx0XHRcdFx0YXdhaXQgcy5zZW5kRXhjZXB0aW9uQnJlYWtwb2ludHMoZW5hYmxlZEV4Y2VwdGlvbkJwcyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRmlsZUNoYW5nZXMoZmlsZUNoYW5nZXNFdmVudDogRmlsZUNoYW5nZXNFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvUmVtb3ZlID0gdGhpcy5tb2RlbC5nZXRCcmVha3BvaW50cygpLmZpbHRlcihicCA9PlxuXHRcdFx0ZmlsZUNoYW5nZXNFdmVudC5jb250YWlucyhicC5vcmlnaW5hbFVyaSwgRmlsZUNoYW5nZVR5cGUuREVMRVRFRCkpO1xuXHRcdGlmICh0b1JlbW92ZS5sZW5ndGgpIHtcblx0XHRcdHRoaXMubW9kZWwucmVtb3ZlQnJlYWtwb2ludHModG9SZW1vdmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvU2VuZDogVVJJW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHVyaSBvZiB0aGlzLmJyZWFrcG9pbnRzVG9TZW5kT25SZXNvdXJjZVNhdmVkKSB7XG5cdFx0XHRpZiAoZmlsZUNoYW5nZXNFdmVudC5jb250YWlucyh1cmksIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpKSB7XG5cdFx0XHRcdHRvU2VuZC5wdXNoKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgdG9TZW5kKSB7XG5cdFx0XHR0aGlzLmJyZWFrcG9pbnRzVG9TZW5kT25SZXNvdXJjZVNhdmVkLmRlbGV0ZSh1cmkpO1xuXHRcdFx0dGhpcy5zZW5kQnJlYWtwb2ludHModXJpLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBydW5Ubyh1cmk6IHVyaSwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW4/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgYnJlYWtwb2ludFRvUmVtb3ZlOiBJQnJlYWtwb2ludCB8IHVuZGVmaW5lZDtcblx0XHRsZXQgdGhyZWFkVG9Db250aW51ZSA9IHRoaXMuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFRocmVhZDtcblx0XHRjb25zdCBhZGRUZW1wQnJlYWtQb2ludCA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGJwRXhpc3RzID0gISEodGhpcy5nZXRNb2RlbCgpLmdldEJyZWFrcG9pbnRzKHsgY29sdW1uLCBsaW5lTnVtYmVyLCB1cmkgfSkubGVuZ3RoKTtcblxuXHRcdFx0aWYgKCFicEV4aXN0cykge1xuXHRcdFx0XHRjb25zdCBhZGRSZXN1bHQgPSBhd2FpdCB0aGlzLmFkZEFuZFZhbGlkYXRlQnJlYWtwb2ludHModXJpLCBsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdFx0XHRpZiAoYWRkUmVzdWx0LnRocmVhZCkge1xuXHRcdFx0XHRcdHRocmVhZFRvQ29udGludWUgPSBhZGRSZXN1bHQudGhyZWFkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGFkZFJlc3VsdC5icmVha3BvaW50KSB7XG5cdFx0XHRcdFx0YnJlYWtwb2ludFRvUmVtb3ZlID0gYWRkUmVzdWx0LmJyZWFrcG9pbnQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IHRocmVhZFRvQ29udGludWUsIGJyZWFrcG9pbnRUb1JlbW92ZSB9O1xuXHRcdH07XG5cdFx0Y29uc3QgcmVtb3ZlVGVtcEJyZWFrUG9pbnQgPSAoc3RhdGU6IFN0YXRlKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRpZiAoc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQgfHwgc3RhdGUgPT09IFN0YXRlLkluYWN0aXZlKSB7XG5cdFx0XHRcdGlmIChicmVha3BvaW50VG9SZW1vdmUpIHtcblx0XHRcdFx0XHR0aGlzLnJlbW92ZUJyZWFrcG9pbnRzKGJyZWFrcG9pbnRUb1JlbW92ZS5nZXRJZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXG5cdFx0YXdhaXQgYWRkVGVtcEJyZWFrUG9pbnQoKTtcblx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gU3RhdGUuSW5hY3RpdmUpIHtcblx0XHRcdC8vIElmIG5vIHNlc3Npb24gZXhpc3RzIHN0YXJ0IHRoZSBkZWJ1Z2dlclxuXHRcdFx0Y29uc3QgeyBsYXVuY2gsIG5hbWUsIGdldENvbmZpZyB9ID0gdGhpcy5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpLnNlbGVjdGVkQ29uZmlndXJhdGlvbjtcblx0XHRcdGNvbnN0IGNvbmZpZyA9IGF3YWl0IGdldENvbmZpZygpO1xuXHRcdFx0Y29uc3QgY29uZmlnT3JOYW1lID0gY29uZmlnID8gT2JqZWN0LmFzc2lnbihkZWVwQ2xvbmUoY29uZmlnKSwge30pIDogbmFtZTtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGhpcy5vbkRpZENoYW5nZVN0YXRlKHN0YXRlID0+IHtcblx0XHRcdFx0aWYgKHJlbW92ZVRlbXBCcmVha1BvaW50KHN0YXRlKSkge1xuXHRcdFx0XHRcdGxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCB0aGlzLnN0YXJ0RGVidWdnaW5nKGxhdW5jaCwgY29uZmlnT3JOYW1lLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5zdGF0ZSA9PT0gU3RhdGUuU3RvcHBlZCkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZFNlc3Npb24gPSB0aGlzLmdldFZpZXdNb2RlbCgpLmZvY3VzZWRTZXNzaW9uO1xuXHRcdFx0aWYgKCFmb2N1c2VkU2Vzc2lvbiB8fCAhdGhyZWFkVG9Db250aW51ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gdGhyZWFkVG9Db250aW51ZS5zZXNzaW9uLm9uRGlkQ2hhbmdlU3RhdGUoKCkgPT4ge1xuXHRcdFx0XHRpZiAocmVtb3ZlVGVtcEJyZWFrUG9pbnQoZm9jdXNlZFNlc3Npb24uc3RhdGUpKSB7XG5cdFx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRocmVhZFRvQ29udGludWUuY29udGludWUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZEFuZFZhbGlkYXRlQnJlYWtwb2ludHModXJpOiBVUkksIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uPzogbnVtYmVyKSB7XG5cdFx0Y29uc3QgZGVidWdNb2RlbCA9IHRoaXMuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLmdldFZpZXdNb2RlbCgpO1xuXG5cdFx0Y29uc3QgYnJlYWtwb2ludHMgPSBhd2FpdCB0aGlzLmFkZEJyZWFrcG9pbnRzKHVyaSwgW3sgbGluZU51bWJlciwgY29sdW1uIH1dLCBmYWxzZSk7XG5cdFx0Y29uc3QgYnJlYWtwb2ludCA9IGJyZWFrcG9pbnRzPy5bMF07XG5cdFx0aWYgKCFicmVha3BvaW50KSB7XG5cdFx0XHRyZXR1cm4geyBicmVha3BvaW50OiB1bmRlZmluZWQsIHRocmVhZDogdmlld01vZGVsLmZvY3VzZWRUaHJlYWQgfTtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgYnJlYWtwb2ludCB3YXMgbm90IGluaXRpYWxseSB2ZXJpZmllZCwgd2FpdCB1cCB0byAycyBmb3IgaXQgdG8gYmVjb21lIHNvLlxuXHRcdC8vIEluaGVyZW50bHkgcmFjZXkgaWYgbXVsdGlwbGUgc2Vzc2lvbnMgY2FuIHZlcmlmeSBhc3luYywgYnV0IG5vdCBzb2x2YWJsZS4uLlxuXHRcdGlmICghYnJlYWtwb2ludC52ZXJpZmllZCkge1xuXHRcdFx0bGV0IGxpc3RlbmVyOiBJRGlzcG9zYWJsZTtcblx0XHRcdGF3YWl0IHJhY2VUaW1lb3V0KG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRsaXN0ZW5lciA9IGRlYnVnTW9kZWwub25EaWRDaGFuZ2VCcmVha3BvaW50cygoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKGJyZWFrcG9pbnQudmVyaWZpZWQpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSksIDIwMDApO1xuXHRcdFx0bGlzdGVuZXIhLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBMb29rIGF0IHBhdXNlZCB0aHJlYWRzIGZvciBzZXNzaW9ucyB0aGF0IHZlcmlmaWVkIHRoaXMgYnAuIFByZWZlciwgaW4gb3JkZXI6XG5cdFx0Y29uc3QgZW51bSBTY29yZSB7XG5cdFx0XHQvKiogVGhlIGZvY3VzZWQgdGhyZWFkICovXG5cdFx0XHRGb2N1c2VkLFxuXHRcdFx0LyoqIEFueSBvdGhlciBzdG9wcGVkIHRocmVhZCBvZiBhIHNlc3Npb24gdGhhdCB2ZXJpZmllZCB0aGUgYnAgKi9cblx0XHRcdFZlcmlmaWVkLFxuXHRcdFx0LyoqIEFueSB0aHJlYWQgdGhhdCB2ZXJpZmllZCBhbmQgcGF1c2VkIGluIHRoZSBzYW1lIGZpbGUgKi9cblx0XHRcdFZlcmlmaWVkQW5kUGF1c2VkSW5GaWxlLFxuXHRcdFx0LyoqIFRoZSBmb2N1c2VkIHRocmVhZCBpZiBpdCB2ZXJpZmllZCB0aGUgYnJlYWtwb2ludCAqL1xuXHRcdFx0VmVyaWZpZWRBbmRGb2N1c2VkLFxuXHRcdH1cblxuXHRcdGxldCBiZXN0VGhyZWFkID0gdmlld01vZGVsLmZvY3VzZWRUaHJlYWQ7XG5cdFx0bGV0IGJlc3RTY29yZSA9IFNjb3JlLkZvY3VzZWQ7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uSWQgb2YgYnJlYWtwb2ludC5zZXNzaW9uc1RoYXRWZXJpZmllZCkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IGRlYnVnTW9kZWwuZ2V0U2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0aHJlYWRzID0gc2Vzc2lvbi5nZXRBbGxUaHJlYWRzKCkuZmlsdGVyKHQgPT4gdC5zdG9wcGVkKTtcblx0XHRcdGlmIChiZXN0U2NvcmUgPCBTY29yZS5WZXJpZmllZEFuZEZvY3VzZWQpIHtcblx0XHRcdFx0aWYgKHZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkICYmIHRocmVhZHMuaW5jbHVkZXModmlld01vZGVsLmZvY3VzZWRUaHJlYWQpKSB7XG5cdFx0XHRcdFx0YmVzdFRocmVhZCA9IHZpZXdNb2RlbC5mb2N1c2VkVGhyZWFkO1xuXHRcdFx0XHRcdGJlc3RTY29yZSA9IFNjb3JlLlZlcmlmaWVkQW5kRm9jdXNlZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYmVzdFNjb3JlIDwgU2NvcmUuVmVyaWZpZWRBbmRQYXVzZWRJbkZpbGUpIHtcblx0XHRcdFx0Y29uc3QgcGF1c2VkSW5UaGlzRmlsZSA9IHRocmVhZHMuZmluZCh0ID0+IHtcblx0XHRcdFx0XHRjb25zdCB0b3AgPSB0LmdldFRvcFN0YWNrRnJhbWUoKTtcblx0XHRcdFx0XHRyZXR1cm4gdG9wICYmIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHRvcC5zb3VyY2UudXJpLCB1cmkpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpZiAocGF1c2VkSW5UaGlzRmlsZSkge1xuXHRcdFx0XHRcdGJlc3RUaHJlYWQgPSBwYXVzZWRJblRoaXNGaWxlO1xuXHRcdFx0XHRcdGJlc3RTY29yZSA9IFNjb3JlLlZlcmlmaWVkQW5kUGF1c2VkSW5GaWxlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChiZXN0U2NvcmUgPCBTY29yZS5WZXJpZmllZCkge1xuXHRcdFx0XHRiZXN0VGhyZWFkID0gdGhyZWFkc1swXTtcblx0XHRcdFx0YmVzdFNjb3JlID0gU2NvcmUuVmVyaWZpZWRBbmRQYXVzZWRJbkZpbGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgdGhyZWFkOiBiZXN0VGhyZWFkLCBicmVha3BvaW50IH07XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFN0YWNrRnJhbWVUaHJlYWRBbmRTZXNzaW9uVG9Gb2N1cyhtb2RlbDogSURlYnVnTW9kZWwsIHN0YWNrRnJhbWU6IElTdGFja0ZyYW1lIHwgdW5kZWZpbmVkLCB0aHJlYWQ/OiBJVGhyZWFkLCBzZXNzaW9uPzogSURlYnVnU2Vzc2lvbiwgYXZvaWRTZXNzaW9uPzogSURlYnVnU2Vzc2lvbik6IHsgc3RhY2tGcmFtZTogSVN0YWNrRnJhbWUgfCB1bmRlZmluZWQ7IHRocmVhZDogSVRocmVhZCB8IHVuZGVmaW5lZDsgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCB9IHtcblx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0aWYgKHN0YWNrRnJhbWUgfHwgdGhyZWFkKSB7XG5cdFx0XHRzZXNzaW9uID0gc3RhY2tGcmFtZSA/IHN0YWNrRnJhbWUudGhyZWFkLnNlc3Npb24gOiB0aHJlYWQhLnNlc3Npb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gbW9kZWwuZ2V0U2Vzc2lvbnMoKTtcblx0XHRcdGNvbnN0IHN0b3BwZWRTZXNzaW9uID0gc2Vzc2lvbnMuZmluZChzID0+IHMuc3RhdGUgPT09IFN0YXRlLlN0b3BwZWQpO1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRvIG5vdCBmb2N1cyBzZXNzaW9uIHRoYXQgaXMgZ29pbmcgZG93blxuXHRcdFx0c2Vzc2lvbiA9IHN0b3BwZWRTZXNzaW9uIHx8IHNlc3Npb25zLmZpbmQocyA9PiBzICE9PSBhdm9pZFNlc3Npb24gJiYgcyAhPT0gYXZvaWRTZXNzaW9uPy5wYXJlbnRTZXNzaW9uKSB8fCAoc2Vzc2lvbnMubGVuZ3RoID8gc2Vzc2lvbnNbMF0gOiB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdGlmICghdGhyZWFkKSB7XG5cdFx0aWYgKHN0YWNrRnJhbWUpIHtcblx0XHRcdHRocmVhZCA9IHN0YWNrRnJhbWUudGhyZWFkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB0aHJlYWRzID0gc2Vzc2lvbiA/IHNlc3Npb24uZ2V0QWxsVGhyZWFkcygpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc3RvcHBlZFRocmVhZCA9IHRocmVhZHMgJiYgdGhyZWFkcy5maW5kKHQgPT4gdC5zdG9wcGVkKTtcblx0XHRcdHRocmVhZCA9IHN0b3BwZWRUaHJlYWQgfHwgKHRocmVhZHMgJiYgdGhyZWFkcy5sZW5ndGggPyB0aHJlYWRzWzBdIDogdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIXN0YWNrRnJhbWUgJiYgdGhyZWFkKSB7XG5cdFx0c3RhY2tGcmFtZSA9IHRocmVhZC5nZXRUb3BTdGFja0ZyYW1lKCk7XG5cdH1cblxuXHRyZXR1cm4geyBzZXNzaW9uLCB0aHJlYWQsIHN0YWNrRnJhbWUgfTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2VuZFRvT25lT3JBbGxTZXNzaW9ucyhtb2RlbDogRGVidWdNb2RlbCwgc2Vzc2lvbjogSURlYnVnU2Vzc2lvbiB8IHVuZGVmaW5lZCwgc2VuZDogKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pID0+IFByb21pc2U8dm9pZD4pOiBQcm9taXNlPHZvaWQ+IHtcblx0aWYgKHNlc3Npb24pIHtcblx0XHRhd2FpdCBzZW5kKHNlc3Npb24pO1xuXHR9IGVsc2Uge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKG1vZGVsLmdldFNlc3Npb25zKCkubWFwKHMgPT4gc2VuZChzKSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksVUFBVTtBQUN0QixTQUFrQixnQkFBZ0I7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBQ25DLFlBQVksWUFBWTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHVCQUFvQztBQUM3QyxTQUFTLFdBQVcsY0FBYztBQUVsQyxPQUFPLGNBQWM7QUFDckIsU0FBUyxXQUF1QjtBQUNoQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG9CQUFvQjtBQUU3QixZQUFZLFNBQVM7QUFDckIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBc0IsMEJBQTBCO0FBQ2hELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWtDLG9CQUFvQjtBQUMvRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUE0QyxzQkFBc0I7QUFDM0UsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyx3QkFBd0IsNkJBQTZCO0FBQzlELFNBQVMsa0JBQWtCLG1CQUFtQjtBQUM5QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QixhQUFhO0FBQy9DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsY0FBYywyQkFBMkI7QUFDbEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUIsMkJBQTJCLHFCQUFxQixvQkFBb0Isa0JBQWtCLGdDQUFnQyxzQkFBc0IsdUJBQXVCLHFCQUFxQixjQUFvVSxjQUFjLE9BQU8sWUFBWSx5QkFBeUIscUJBQXFCO0FBQ3ZtQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQVksZ0JBQWdCLFlBQVksb0JBQXVHLDZCQUE2QjtBQUNyTCxTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBd0M7QUFDakQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEIsK0JBQStCO0FBQ3RFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNEJBQTRCLDZCQUE2QjtBQUNsRSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQixxQkFBcUI7QUFFeEMsSUFBTSxlQUFOLE1BQTRDO0FBQUEsRUFnQ2xELFlBQ2tDLGVBQ1csc0JBQ1osY0FDUyx1QkFDRixxQkFDTixlQUNTLGVBQ0MsZ0JBQ04sbUJBQ0Qsa0JBQ0ksc0JBQ0osa0JBQ0wsYUFDUyxzQkFDSywyQkFDVixpQkFDRCxnQkFDRyxtQkFDVyw4QkFDVixvQkFDUCxhQUM5QjtBQXJCZ0M7QUFDVztBQUNaO0FBQ1M7QUFDRjtBQUNOO0FBQ1M7QUFDQztBQUNOO0FBQ0Q7QUFDSTtBQUNKO0FBQ0w7QUFDUztBQUNLO0FBQ1Y7QUFDRDtBQUNHO0FBQ1c7QUFDVjtBQUNQO0FBOUNoQyxTQUFpQixxQkFBcUIsb0JBQUksSUFBbUI7QUFRN0QsU0FBaUIsY0FBYyxJQUFJLGdCQUFnQjtBQVNuRCxTQUFRLGVBQWU7QUFHdkIsU0FBUSw0QkFBNEIsb0JBQUksSUFBcUM7QUFHN0UsU0FBUSxvQkFBb0I7QUF5QjNCLFNBQUssbUNBQW1DLG9CQUFJLElBQVM7QUFFckQsU0FBSyxvQkFBb0IsS0FBSyxZQUFZLElBQUksSUFBSSxRQUFlLENBQUM7QUFDbEUsU0FBSyxtQkFBbUIsS0FBSyxZQUFZLElBQUksSUFBSSxRQUF1QixDQUFDO0FBQ3pFLFNBQUssb0JBQW9CLEtBQUssWUFBWSxJQUFJLElBQUksUUFBdUIsQ0FBQztBQUMxRSxTQUFLLG1CQUFtQixLQUFLLFlBQVksSUFBSSxJQUFJLFFBQVEsQ0FBQztBQUUxRCxTQUFLLGlCQUFpQixLQUFLLHFCQUFxQixlQUFlLGdCQUFnQjtBQUFBLE1BQzlFLGlCQUFpQixLQUFLO0FBQUEsTUFDdEIsc0JBQXNCLE1BQU0sS0FBSztBQUFBLElBQ2xDLENBQUM7QUFDRCxTQUFLLFlBQVksSUFBSSxLQUFLLGNBQWM7QUFDeEMsU0FBSyx1QkFBdUIsS0FBSyxxQkFBcUIsZUFBZSxzQkFBc0IsS0FBSyxjQUFjO0FBQzlHLFNBQUssWUFBWSxJQUFJLEtBQUssb0JBQW9CO0FBQzlDLFNBQUssZUFBZSxLQUFLLFlBQVksSUFBSSxLQUFLLHFCQUFxQixlQUFlLFlBQVksQ0FBQztBQUUvRixTQUFLLHFCQUFxQixLQUFLLGFBQWEsdUJBQXVCO0FBRW5FLFNBQUssUUFBUSxLQUFLLHFCQUFxQixlQUFlLFlBQVksS0FBSyxZQUFZO0FBQ25GLFNBQUssWUFBWSxLQUFLLHFCQUFxQixlQUFlLGdCQUFnQixLQUFLLEtBQUs7QUFFcEYsU0FBSyxZQUFZLEtBQUssWUFBWSxJQUFJLElBQUksVUFBVSxpQkFBaUIsQ0FBQztBQUN0RSxTQUFLLGFBQWEsS0FBSyxxQkFBcUIsZUFBZSxlQUFlO0FBRTFFLFNBQUssWUFBWSxJQUFJLEtBQUssWUFBWSxpQkFBaUIsT0FBSyxLQUFLLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDbEYsU0FBSyxZQUFZLElBQUksS0FBSyxpQkFBaUIsZUFBZSxLQUFLLFNBQVMsSUFBSSxDQUFDO0FBRTdFLFNBQUssWUFBWSxJQUFJLEtBQUssMEJBQTBCLGdCQUFnQixXQUFTO0FBQzVFLFlBQU0sVUFBVSxLQUFLLE1BQU0sV0FBVyxNQUFNLFdBQVcsSUFBSTtBQUMzRCxVQUFJLFNBQVM7QUFFWixnQkFBUSxjQUFjLFVBQVU7QUFDaEMsZ0JBQVEsY0FBYyxPQUFPLE1BQU07QUFDbkMsZ0JBQVEsU0FBUyxNQUFNLEtBQUs7QUFDNUIsYUFBSyx3QkFBd0IsT0FBTztBQUFBLE1BQ3JDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFlBQVksSUFBSSxLQUFLLDBCQUEwQixtQkFBbUIsV0FBUztBQUMvRSxZQUFNLFVBQVUsS0FBSyxNQUFNLFdBQVcsTUFBTSxTQUFTO0FBQ3JELFVBQUksV0FBVyxRQUFRLFVBQVUsTUFBTSxPQUFPO0FBQzdDLGdCQUFRLFdBQVc7QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxZQUFZLElBQUksS0FBSyxVQUFVLHFCQUFxQixNQUFNO0FBQzlELFdBQUssY0FBYztBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUNGLFNBQUssWUFBWSxJQUFJLEtBQUssVUFBVSxrQkFBa0IsQ0FBQyxZQUF1QztBQUM3RixXQUFLLGNBQWM7QUFFbkIsVUFBSSxTQUFTO0FBQ1osYUFBSyxzQ0FBc0MsUUFBUSxNQUFNLENBQUM7QUFBQSxNQUMzRDtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxZQUFZLElBQUksTUFBTSxJQUFJLEtBQUssZUFBZSx1QkFBdUIsS0FBSyxxQkFBcUIsd0JBQXdCLEVBQUUsTUFBTTtBQUNuSSxZQUFNLGVBQWdCLEtBQUssVUFBVSxNQUFNLFlBQWEsS0FBSyxxQkFBcUIscUJBQXFCLEVBQUUsU0FBUyxLQUFLLEtBQUssZUFBZSxvQkFBb0IsSUFBTSxZQUFZO0FBQ2pMLFdBQUssUUFBUSxJQUFJLFlBQVk7QUFDN0IsV0FBSyxhQUFhLGtCQUFrQixZQUFZO0FBQUEsSUFDakQsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxZQUFZLElBQUksS0FBSyxNQUFNLHFCQUFxQixNQUFNO0FBQzFELFlBQU0sbUJBQW1CLEtBQUssTUFBTSxZQUFZLEVBQUUsT0FBTyxPQUFLLENBQUMsRUFBRSxhQUFhLEVBQUU7QUFDaEYsV0FBSyxVQUFVLFFBQVE7QUFDdkIsVUFBSSxtQkFBbUIsR0FBRztBQUN6QixjQUFNLGdCQUFnQixLQUFLLHNCQUFzQix5QkFBeUIsaUJBQWlCO0FBQzNGLFlBQUksZUFBZTtBQUNsQixlQUFLLFdBQVcsS0FBSyxnQkFBZ0IsMEJBQTBCLGNBQWMsSUFBSSxFQUFFLE9BQU8sSUFBSSxZQUFZLGtCQUFrQixPQUFLLE1BQU0sSUFBSSxJQUFJLFNBQVMsa0JBQWtCLGtCQUFrQixJQUFJLElBQUksU0FBUyxtQkFBbUIsdUJBQXVCLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUM3UDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssWUFBWSxJQUFJLGNBQWMsd0JBQXdCLE1BQU07QUFDaEUsV0FBSyxrQkFBa0IsbUJBQW1CLE1BQU07QUFDL0MsWUFBSSxjQUFjLGlCQUFpQixxQkFBcUIsVUFBVTtBQUNqRSxlQUFLLHFCQUFxQixJQUFJLElBQUk7QUFBQSxRQUNuQyxPQUFPO0FBRU4sZUFBSyxzQkFBc0IsTUFBTTtBQUFBLFFBQ2xDO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFFRixTQUFLLFlBQVksSUFBSSxLQUFLLGlCQUFpQixpQkFBaUIsTUFBTTtBQUNqRSxpQkFBVyxVQUFVLGNBQWMsU0FBUztBQUUzQyxZQUFJLE9BQU8sVUFBVSxXQUFXLHFCQUFxQjtBQUNwRCxpQkFBTyxRQUFRO0FBQUEsUUFDaEI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFlBQVksSUFBSSxpQkFBaUIsV0FBVyxTQUFPO0FBQ3ZELFVBQUk7QUFBQSxRQUNILEtBQUssTUFBTSxZQUFZLEVBQUUsU0FBUztBQUFBLFFBQ2xDLElBQUksU0FBUyx3QkFBd0Isd0RBQXdEO0FBQUEsTUFDOUY7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFNBQUssZ0JBQWdCLGlCQUFpQjtBQUFBLEVBQ3ZDO0FBQUEsRUFFUSxnQkFBZ0IsbUJBQTZDO0FBQ3BFLG1CQUFlLE1BQU07QUFDcEIsd0JBQWtCLG1CQUFtQixNQUFNO0FBQzFDLGFBQUssWUFBWSxtQkFBbUIsT0FBTyxpQkFBaUI7QUFDNUQsYUFBSyxhQUFhLG9CQUFvQixPQUFPLGlCQUFpQjtBQUM5RCxhQUFLLGNBQWMscUJBQXFCLE9BQU8saUJBQWlCO0FBQ2hFLGFBQUssY0FBYyxzQkFBc0IsT0FBTyxpQkFBaUI7QUFDakUsYUFBSyxVQUFVLGlCQUFpQixPQUFPLGlCQUFpQjtBQUN4RCxhQUFLLFFBQVEsSUFBSSxLQUFLLGFBQWEsaUJBQWlCLENBQUM7QUFDckQsYUFBSyxtQkFBbUIsMEJBQTBCLE9BQU8saUJBQWlCO0FBRTFFLGFBQUssdUJBQXVCLCtCQUErQixPQUFPLGlCQUFpQjtBQUFBLE1BQ3BGLENBQUM7QUFFRCxZQUFNLDZCQUE2QixNQUFNLEtBQUssaUJBQWlCLElBQUksQ0FBQyxFQUFFLEtBQUssTUFBTSxlQUFlLEVBQUUsVUFBVSxLQUFLLE1BQU0sbUJBQW1CLEVBQUUsVUFBVSxLQUFLLE1BQU0sdUJBQXVCLEVBQUUsT0FBTztBQUNqTSxpQ0FBMkI7QUFDM0IsV0FBSyxZQUFZLElBQUksS0FBSyxNQUFNLHVCQUF1QixNQUFNLDJCQUEyQixDQUFDLENBQUM7QUFBQSxJQUMzRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsV0FBd0I7QUFDdkIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsZUFBMkI7QUFDMUIsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsMEJBQWlEO0FBQ2hELFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLG9CQUFxQztBQUNwQyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxxQkFBcUJBLE1BQWdCO0FBQ3BDLFNBQUssTUFBTSxxQkFBcUJBLElBQUc7QUFBQSxFQUNwQztBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLFlBQVksUUFBUTtBQUFBLEVBQzFCO0FBQUE7QUFBQSxFQUlBLElBQUksUUFBZTtBQUNsQixVQUFNLGlCQUFpQixLQUFLLFVBQVU7QUFDdEMsUUFBSSxnQkFBZ0I7QUFDbkIsYUFBTyxlQUFlO0FBQUEsSUFDdkI7QUFFQSxXQUFPLEtBQUssZUFBZSxNQUFNLGVBQWUsTUFBTTtBQUFBLEVBQ3ZEO0FBQUEsRUFFQSxJQUFJLHNCQUF3RDtBQUMzRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFUSx1QkFBdUIsU0FBc0M7QUFDcEUsUUFBSSxDQUFDLEtBQUssY0FBYztBQUN2QixXQUFLLGVBQWU7QUFDcEIsV0FBSyx1QkFBdUI7QUFDNUIsV0FBSyxjQUFjO0FBQUEsSUFDcEI7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsUUFBSSxLQUFLLGNBQWM7QUFDdEIsV0FBSyxlQUFlO0FBQ3BCLFdBQUssdUJBQXVCO0FBQzVCLFdBQUssY0FBYztBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBYSxJQUE4QjtBQUNsRCxRQUFJLElBQUk7QUFDUCxZQUFNLFFBQVEsS0FBSywwQkFBMEIsSUFBSSxFQUFFO0FBQ25ELFVBQUksT0FBTztBQUNWLGNBQU0sT0FBTztBQUNiLGFBQUssMEJBQTBCLE9BQU8sRUFBRTtBQUFBLE1BQ3pDO0FBQUEsSUFDRCxPQUFPO0FBQ04sV0FBSywwQkFBMEIsUUFBUSxPQUFLLEVBQUUsT0FBTyxDQUFDO0FBQ3RELFdBQUssMEJBQTBCLE1BQU07QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFzQjtBQUM3QixVQUFNLFFBQVEsS0FBSztBQUNuQixRQUFJLEtBQUssa0JBQWtCLE9BQU87QUFDakMsV0FBSyxrQkFBa0IsbUJBQW1CLE1BQU07QUFDL0MsYUFBSyxXQUFXLElBQUksY0FBYyxLQUFLLENBQUM7QUFDeEMsYUFBSyxZQUFZLElBQUksVUFBVSxNQUFNLFFBQVE7QUFFN0MsY0FBTSxlQUFpQixVQUFVLE1BQU0sWUFBWSxVQUFVLE1BQU0sZ0JBQWtCLEtBQUssZUFBZSxvQkFBb0IsS0FBSyxLQUFLLHFCQUFxQixzQkFBc0IsT0FBUyxZQUFZO0FBQ3ZNLGFBQUssUUFBUSxJQUFJLFlBQVk7QUFDN0IsYUFBSyxhQUFhLGtCQUFrQixZQUFZO0FBQUEsTUFDakQsQ0FBQztBQUNELFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssa0JBQWtCLEtBQUssS0FBSztBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRUEsSUFBSSxtQkFBaUM7QUFDcEMsV0FBTyxLQUFLLGtCQUFrQjtBQUFBLEVBQy9CO0FBQUEsRUFFQSxJQUFJLGtCQUF3QztBQUMzQyxXQUFPLEtBQUssaUJBQWlCO0FBQUEsRUFDOUI7QUFBQSxFQUVBLElBQUksbUJBQXlDO0FBQzVDLFdBQU8sS0FBSyxrQkFBa0I7QUFBQSxFQUMvQjtBQUFBLEVBRUEsSUFBSSxrQkFBdUU7QUFDMUUsV0FBTyxLQUFLLGlCQUFpQjtBQUFBLEVBQzlCO0FBQUEsRUFFUSxZQUFZO0FBQ25CLFFBQUksQ0FBQyxLQUFLLG1CQUFtQjtBQUc1QixXQUFLLFlBQVksSUFBSSxLQUFLLFlBQVksaUJBQWlCLHFCQUFxQixLQUFLLFlBQVksSUFBSSxJQUFJLDhCQUE4QixJQUFJLENBQUMsQ0FBQyxDQUFDO0FBQzFJLFdBQUssb0JBQW9CO0FBQUEsSUFDMUI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBTSxlQUFlLFFBQTZCLGNBQWlDLFNBQWdDLGtCQUFrQixDQUFDLFNBQVMsZUFBaUM7QUFDL0ssVUFBTSxVQUFVLFdBQVcsUUFBUSxVQUFVLElBQUksU0FBUyxZQUFZLG9FQUFvRSxJQUFJLElBQUksU0FBUyxjQUFjLHNFQUFzRTtBQUMvTyxVQUFNLFFBQVEsTUFBTSxLQUFLLDZCQUE2QixzQkFBc0IsRUFBRSxRQUFRLENBQUM7QUFDdkYsUUFBSSxDQUFDLE9BQU87QUFDWCxhQUFPO0FBQUEsSUFDUjtBQUVBLFNBQUssVUFBVTtBQUNmLFNBQUssdUJBQXVCLE9BQU87QUFDbkMsU0FBSyxZQUFZLElBQUksSUFBSTtBQUN6QixRQUFJO0FBRUgsWUFBTSxLQUFLLGlCQUFpQixnQkFBZ0IsU0FBUztBQUNyRCxVQUFJLGlCQUFpQjtBQUNwQixjQUFNLHdCQUF3QixLQUFLLHNCQUFzQixLQUFLLGFBQWE7QUFBQSxNQUM1RTtBQUNBLFlBQU0sS0FBSyxpQkFBaUIsa0NBQWtDO0FBRTlELFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSSxDQUFDLGNBQWM7QUFDbEIsdUJBQWUsS0FBSyxxQkFBcUIsc0JBQXNCO0FBQUEsTUFDaEU7QUFDQSxVQUFJLE9BQU8saUJBQWlCLFlBQVksUUFBUTtBQUMvQyxpQkFBUyxPQUFPLGlCQUFpQixZQUFZO0FBQzdDLG1CQUFXLE9BQU8sWUFBWSxZQUFZO0FBQUEsTUFDM0MsV0FBVyxPQUFPLGlCQUFpQixVQUFVO0FBQzVDLGlCQUFTO0FBQUEsTUFDVjtBQUVBLFVBQUksVUFBVTtBQUViLFlBQUksQ0FBQyxTQUFTLGdCQUFnQjtBQUM3QixnQkFBTSxJQUFJLE1BQU0sSUFBSTtBQUFBLFlBQVMsRUFBRSxLQUFLLGtDQUFrQyxTQUFTLENBQUMsdURBQXVELDhEQUE4RCxFQUFFO0FBQUEsWUFDdE07QUFBQSxVQUFnRyxDQUFDO0FBQUEsUUFDbkc7QUFDQSxZQUFJLFNBQVMsZUFBZTtBQUMzQixnQkFBTSxhQUFhLE1BQU0sS0FBSyxXQUFXLHNCQUFzQixRQUFRLGFBQWEsS0FBSyxlQUFlLGFBQWEsR0FBRyxTQUFTLGFBQWE7QUFDOUksY0FBSSxlQUFlLGNBQWMsU0FBUztBQUN6QyxpQkFBSyxxQkFBcUI7QUFDMUIsbUJBQU87QUFBQSxVQUNSO0FBQUEsUUFDRDtBQUNBLFlBQUksU0FBUyxTQUFTO0FBQ3JCLG9CQUFVLEVBQUUsR0FBRyxTQUFTLGNBQWMsSUFBSSxrQkFBa0IsRUFBRTtBQUFBLFFBQy9EO0FBRUEsY0FBTSxTQUFTLE1BQU0sUUFBUSxJQUFJLFNBQVMsZUFBZSxJQUFJLGdCQUFjO0FBQzFFLGdCQUFNLE9BQU8sT0FBTyxlQUFlLFdBQVcsYUFBYSxXQUFXO0FBQ3RFLGNBQUksU0FBUyxTQUFTLE1BQU07QUFDM0IsbUJBQU8sUUFBUSxRQUFRLEtBQUs7QUFBQSxVQUM3QjtBQUVBLGNBQUk7QUFDSixjQUFJLE9BQU8sZUFBZSxVQUFVO0FBQ25DLGtCQUFNLHlCQUF5QixLQUFLLHFCQUFxQixZQUFZLEVBQUUsT0FBTyxPQUFLLENBQUMsQ0FBQyxFQUFFLGlCQUFpQixJQUFJLENBQUM7QUFDN0csZ0JBQUksdUJBQXVCLFdBQVcsR0FBRztBQUN4Qyw4QkFBZ0IsdUJBQXVCLENBQUM7QUFBQSxZQUN6QyxXQUFXLFVBQVUsdUJBQXVCLFNBQVMsS0FBSyx1QkFBdUIsUUFBUSxNQUFNLEtBQUssR0FBRztBQUV0Ryw4QkFBZ0I7QUFBQSxZQUNqQixPQUFPO0FBQ04sb0JBQU0sSUFBSSxNQUFNLHVCQUF1QixXQUFXLElBQUksSUFBSSxTQUFTLGtDQUFrQywrREFBK0QsSUFBSSxJQUNySyxJQUFJLFNBQVMseUNBQXlDLGtIQUFrSCxJQUFJLENBQUM7QUFBQSxZQUNqTDtBQUFBLFVBQ0QsV0FBVyxXQUFXLFFBQVE7QUFDN0Isa0JBQU0sNkJBQTZCLEtBQUsscUJBQXFCLFlBQVksRUFBRSxPQUFPLE9BQUssRUFBRSxhQUFhLEVBQUUsVUFBVSxTQUFTLFdBQVcsVUFBVSxDQUFDLENBQUMsRUFBRSxpQkFBaUIsV0FBVyxJQUFJLENBQUM7QUFDckwsZ0JBQUksMkJBQTJCLFdBQVcsR0FBRztBQUM1Qyw4QkFBZ0IsMkJBQTJCLENBQUM7QUFBQSxZQUM3QyxPQUFPO0FBQ04sb0JBQU0sSUFBSSxNQUFNLElBQUksU0FBUyxvQkFBb0Isa0ZBQWtGLFdBQVcsUUFBUSxXQUFXLE1BQU0sU0FBUyxJQUFJLENBQUM7QUFBQSxZQUN0TDtBQUFBLFVBQ0Q7QUFFQSxpQkFBTyxLQUFLLGNBQWMsZUFBZSxjQUFlLGlCQUFpQixJQUFJLEdBQUcsT0FBTztBQUFBLFFBQ3hGLENBQUMsQ0FBQztBQUVGLGNBQU1DLFVBQVMsT0FBTyxNQUFNLGFBQVcsQ0FBQyxDQUFDLE9BQU87QUFDaEQsYUFBSyxxQkFBcUI7QUFDMUIsZUFBT0E7QUFBQSxNQUNSO0FBRUEsVUFBSSxnQkFBZ0IsQ0FBQyxRQUFRO0FBQzVCLGNBQU1DLFdBQVUsQ0FBQyxDQUFDLFNBQVMsSUFBSSxTQUFTLGlCQUFpQixvREFBb0QsT0FBTyxpQkFBaUIsV0FBVyxlQUFlLGFBQWEsSUFBSSxJQUMvSyxJQUFJLFNBQVMsMEJBQTBCLDJEQUEyRDtBQUNuRyxjQUFNLElBQUksTUFBTUEsUUFBTztBQUFBLE1BQ3hCO0FBRUEsWUFBTSxTQUFTLE1BQU0sS0FBSyxjQUFjLFFBQVEsUUFBUSxPQUFPO0FBQy9ELFdBQUsscUJBQXFCO0FBQzFCLGFBQU87QUFBQSxJQUNSLFNBQVMsS0FBSztBQUViLFdBQUssb0JBQW9CLE1BQU0sR0FBRztBQUNsQyxXQUFLLHFCQUFxQjtBQUMxQixhQUFPLFFBQVEsT0FBTyxHQUFHO0FBQUEsSUFDMUI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFjLGNBQWMsUUFBNkIsUUFBNkIsU0FBa0Q7QUFHdkksUUFBSTtBQUNKLFFBQUksUUFBUTtBQUNYLGFBQU8sT0FBTztBQUFBLElBQ2YsT0FBTztBQUVOLGVBQVMsdUJBQU8sT0FBTyxJQUFJO0FBQUEsSUFDNUI7QUFDQSxRQUFJLFdBQVcsUUFBUSxTQUFTO0FBQy9CLGFBQU8sVUFBVTtBQUFBLElBQ2xCLFdBQVcsV0FBVyxPQUFPLFFBQVEsWUFBWSxlQUFlLFFBQVEsaUJBQWlCLFFBQVEsY0FBYyxjQUFjLFNBQVM7QUFDckksYUFBTyxVQUFVO0FBQUEsSUFDbEI7QUFDQSxVQUFNLG1CQUFtQixVQUFVLE1BQU07QUFFekMsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJLENBQUMsTUFBTTtBQUNWLHFCQUFlLEtBQUssY0FBYztBQUNsQyxVQUFJLGdCQUFnQixhQUFhLFVBQVU7QUFDMUMsY0FBTSxTQUFTLEtBQUssbUJBQW1CLGFBQWEsU0FBUyxTQUFTLENBQUM7QUFDdkUsWUFBSSxRQUFRO0FBQ1gsaUJBQU8sT0FBTztBQUNkLGNBQUksT0FBTyxjQUFjO0FBQ3hCLGtCQUFNLE1BQU0sTUFBTSxLQUFLLHFCQUFxQiwrQkFBK0IsT0FBTyxJQUFJO0FBQ3RGLGtCQUFNLFFBQVEsSUFBSSxLQUFLLE9BQUssRUFBRSxVQUFVLE9BQU8sWUFBWTtBQUMzRCxnQkFBSSxPQUFPO0FBQ1YsdUJBQVMsTUFBTTtBQUNmLHFCQUFPLE9BQU8sUUFBUSxNQUFNLE1BQU07QUFBQSxZQUNuQztBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFVBQUksQ0FBQyxNQUFNO0FBQ1YsZ0JBQVEsTUFBTSxLQUFLLGVBQWUsY0FBYyxLQUFLO0FBQ3JELFlBQUksT0FBTztBQUNWLGlCQUFPLE1BQU0sU0FBUztBQUN0QixjQUFJLE1BQU0sWUFBWTtBQUNyQixxQkFBUyxNQUFNLFdBQVc7QUFDMUIsbUJBQU8sT0FBTyxRQUFRLE1BQU0sV0FBVyxNQUFNO0FBQUEsVUFDOUM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxVQUFNLHdCQUF3QixJQUFJLHdCQUF3QjtBQUMxRCxVQUFNLFlBQVksYUFBYTtBQUMvQixTQUFLLDBCQUEwQixJQUFJLFdBQVcscUJBQXFCO0FBRW5FLFVBQU0sb0JBQW9CLE1BQU0sS0FBSyxxQkFBcUIsZ0NBQWdDLFVBQVUsT0FBTyxZQUFZLE9BQU8sVUFBVSxNQUFNLFFBQVcsTUFBTSxRQUFRLHNCQUFzQixLQUFLO0FBRWxNLFFBQUkscUJBQXFCLGtCQUFrQixNQUFNO0FBQ2hELFVBQUk7QUFDSCxZQUFJLGlCQUFpQixNQUFNLEtBQUssb0JBQW9CLFFBQVEsaUJBQWlCO0FBQzdFLFlBQUksQ0FBQyxnQkFBZ0I7QUFFcEIsaUJBQU87QUFBQSxRQUNSO0FBRUEsWUFBSSxzQkFBc0IsTUFBTSx5QkFBeUI7QUFFeEQsaUJBQU87QUFBQSxRQUNSO0FBR0EsWUFBSSxpQ0FBaUM7QUFDckMsWUFBSSxTQUFTLGlCQUFpQixrQkFBa0IsZUFBZSxtQ0FBbUMsTUFBTTtBQUV2RyxnQkFBTSxtQkFBbUIsS0FBSyxNQUFNLFlBQVk7QUFDaEQsZ0JBQU1DLGFBQVksUUFBUTtBQUUxQixnQkFBTSxrQkFBa0IsaUJBQWlCO0FBQUEsWUFBSyxPQUM3QyxFQUFFLGNBQWMsU0FBUyxlQUFnQixRQUN6QyxFQUFFLGNBQWMsU0FBUyxlQUFnQixRQUN6QyxFQUFFLGNBQWMsWUFBWSxlQUFnQixXQUM1QyxFQUFFLFNBQVNBO0FBQUEsVUFDWjtBQUVBLGNBQUksaUJBQWlCO0FBRXBCLGtCQUFNLFlBQVksTUFBTSxLQUFLLHlCQUF5QixnQkFBZ0IsU0FBUyxDQUFDO0FBQ2hGLGdCQUFJLENBQUMsV0FBVztBQUNmLHFCQUFPO0FBQUEsWUFDUjtBQUNBLDZDQUFpQztBQUFBLFVBQ2xDO0FBQUEsUUFDRDtBQUVBLGNBQU0sWUFBWSxRQUFRLGFBQWEsS0FBSyxlQUFlLGFBQWE7QUFDeEUsY0FBTSxhQUFhLE1BQU0sS0FBSyxXQUFXLHNCQUFzQixXQUFXLGVBQWUsYUFBYTtBQUN0RyxZQUFJLGVBQWUsY0FBYyxTQUFTO0FBQ3pDLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sTUFBTSxNQUFNLEtBQUsscUJBQXFCLGtEQUFrRCxVQUFVLE9BQU8sWUFBWSxPQUFPLFVBQVUsTUFBTSxRQUFXLGVBQWUsTUFBTSxnQkFBZ0Isc0JBQXNCLEtBQUs7QUFDN04sWUFBSSxDQUFDLEtBQUs7QUFDVCxjQUFJLFVBQVUsUUFBUSxRQUFRLFFBQVEsQ0FBQyxzQkFBc0IsTUFBTSx5QkFBeUI7QUFDM0Ysa0JBQU0sT0FBTyxlQUFlLEVBQUUsZUFBZSxNQUFNLEtBQUssR0FBRyxzQkFBc0IsS0FBSztBQUFBLFVBQ3ZGO0FBQ0EsaUJBQU87QUFBQSxRQUNSO0FBQ0EseUJBQWlCO0FBRWpCLGNBQU0sTUFBTSxLQUFLLGVBQWUsWUFBWSxlQUFlLElBQUk7QUFDL0QsWUFBSSxDQUFDLE9BQVEsa0JBQWtCLFlBQVksWUFBWSxrQkFBa0IsWUFBWSxVQUFXO0FBQy9GLGNBQUk7QUFDSixjQUFJLGtCQUFrQixZQUFZLFlBQVksa0JBQWtCLFlBQVksVUFBVTtBQUNyRixzQkFBVSxrQkFBa0IsVUFBVSxJQUFJLFNBQVMsNEJBQTRCLHFGQUFxRixXQUFXLGtCQUFrQixPQUFPLElBQ3JNLElBQUksU0FBUyxzQkFBc0IsbUVBQW1FLFNBQVM7QUFBQSxVQUVuSCxPQUFPO0FBQ04sc0JBQVUsZUFBZSxPQUFPLElBQUksU0FBUyx5QkFBeUIsaURBQWlELGVBQWUsSUFBSSxJQUN6SSxJQUFJLFNBQVMsb0JBQW9CLDhEQUE4RDtBQUFBLFVBQ2pHO0FBRUEsZ0JBQU0sYUFBd0IsQ0FBQztBQUUvQixxQkFBVyxLQUFLLFNBQVM7QUFBQSxZQUN4QixJQUFJO0FBQUEsWUFDSixPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssOEJBQThCLFNBQVMsQ0FBQyxnRUFBZ0UsRUFBRSxHQUFHLHlCQUF5QixlQUFlLElBQUk7QUFBQSxZQUNwTCxTQUFTO0FBQUEsWUFDVCxLQUFLLFlBQVksS0FBSyxlQUFlLGVBQWUsb0NBQW9DLGdCQUFnQixJQUFJO0FBQUEsVUFDN0csQ0FBQyxDQUFDO0FBRUYsZ0JBQU0sS0FBSyxVQUFVLFNBQVMsVUFBVTtBQUFHLGlCQUFPO0FBQUEsUUFDbkQ7QUFFQSxZQUFJLENBQUMsSUFBSSxTQUFTO0FBQ2pCLGdCQUFNLEtBQUssVUFBVSx3QkFBd0IsSUFBSSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQzFELGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sU0FBUyxNQUFNLEtBQUssZ0JBQWdCLFdBQVcsUUFBUSxXQUFXLEVBQUUsVUFBVSxnQkFBZ0IsWUFBWSxpQkFBaUIsR0FBRyxTQUFTLDhCQUE4QjtBQUMzSyxZQUFJLFVBQVUsU0FBUyxnQkFBZ0IsYUFBYSxVQUFVO0FBRTdELGVBQUssbUJBQW1CLGFBQWEsU0FBUyxTQUFTLENBQUMsSUFBSSxFQUFFLE1BQU0sTUFBTSxTQUFTLE1BQU0sY0FBYyxNQUFNLFlBQVksTUFBTTtBQUMvSCxlQUFLLGFBQWEsd0JBQXdCLEtBQUssa0JBQWtCO0FBQUEsUUFDbEU7QUFDQSxlQUFPO0FBQUEsTUFDUixTQUFTLEtBQUs7QUFDYixZQUFJLE9BQU8sSUFBSSxTQUFTO0FBQ3ZCLGdCQUFNLEtBQUssVUFBVSxJQUFJLE9BQU87QUFBQSxRQUNqQyxXQUFXLEtBQUssZUFBZSxrQkFBa0IsTUFBTSxlQUFlLE9BQU87QUFDNUUsZ0JBQU0sS0FBSyxVQUFVLElBQUksU0FBUywrQkFBK0IsOEhBQThILENBQUM7QUFBQSxRQUNqTTtBQUNBLFlBQUksVUFBVSxDQUFDLHNCQUFzQixNQUFNLHlCQUF5QjtBQUNuRSxnQkFBTSxPQUFPLGVBQWUsRUFBRSxlQUFlLEtBQUssR0FBRyxzQkFBc0IsS0FBSztBQUFBLFFBQ2pGO0FBRUEsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsUUFBSSxVQUFVLFFBQVEsc0JBQXNCLFFBQVEsQ0FBQyxzQkFBc0IsTUFBTSx5QkFBeUI7QUFDekcsWUFBTSxPQUFPLGVBQWUsRUFBRSxlQUFlLE1BQU0sS0FBSyxHQUFHLHNCQUFzQixLQUFLO0FBQUEsSUFDdkY7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBYyxnQkFBZ0IsV0FBbUIsTUFBb0MsZUFBdUUsU0FBZ0MsaUNBQWlDLE9BQXlCO0FBRXJQLFVBQU0sVUFBVSxLQUFLLHFCQUFxQixlQUFlLGNBQWMsV0FBVyxlQUFlLE1BQU0sS0FBSyxPQUFPLE9BQU87QUFDMUgsUUFBSSxDQUFDLGtDQUFrQyxTQUFTLGlCQUFpQixLQUFLLE1BQU0sWUFBWSxFQUFFO0FBQUEsTUFBSyxPQUM5RixFQUFFLGNBQWMsU0FBUyxjQUFjLFNBQVMsUUFDaEQsRUFBRSxjQUFjLFNBQVMsY0FBYyxTQUFTLFFBQ2hELEVBQUUsY0FBYyxZQUFZLGNBQWMsU0FBUyxXQUNuRCxFQUFFLFNBQVM7QUFBQSxJQUNaLEtBQUssY0FBYyxTQUFTLG1DQUFtQyxNQUFNO0FBRXBFLFlBQU0sWUFBWSxNQUFNLEtBQUsseUJBQXlCLFFBQVEsU0FBUyxDQUFDO0FBQ3hFLFVBQUksQ0FBQyxXQUFXO0FBQ2YsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsU0FBSyxNQUFNLFdBQVcsT0FBTztBQUk3QixTQUFLLGtCQUFrQixLQUFLLE9BQU87QUFFbkMsVUFBTSxZQUFZLEtBQUsscUJBQXFCLFNBQThCLE9BQU8sRUFBRTtBQUduRixRQUFJLENBQUMsY0FBYyxTQUFTLFlBQVksY0FBYyx3QkFBeUIsY0FBYyw2QkFBNkIsS0FBSyxVQUFVLHNCQUF1QixDQUFDLFFBQVEsbUJBQW1CO0FBQzNMLFlBQU0sS0FBSyxxQkFBcUIsa0JBQWtCLFlBQVksc0JBQXNCLE9BQU87QUFBQSxJQUM1RjtBQUVBLFFBQUk7QUFDSCxZQUFNLEtBQUssd0JBQXdCLE9BQU87QUFFMUMsWUFBTSx5QkFBeUIsUUFBUSxjQUFjLDBCQUEwQixLQUFLLHFCQUFxQixTQUE4QixPQUFPLEVBQUU7QUFDaEosVUFBSSwyQkFBMkIsd0JBQXlCLEtBQUssVUFBVSxxQkFBcUIsMkJBQTJCLDJCQUE0QjtBQUNsSixhQUFLLGFBQWEsU0FBUyxjQUFjLEtBQUs7QUFBQSxNQUMvQztBQUVBLFdBQUssVUFBVSxvQkFBb0I7QUFDbkMsWUFBTSxrQkFBa0IsS0FBSyxxQkFBcUIsU0FBOEIsT0FBTyxFQUFFO0FBQ3pGLFlBQU0sV0FBVyxLQUFLLE1BQU0sWUFBWTtBQUN4QyxZQUFNLGdCQUFnQixrQkFBa0IsV0FBVyxTQUFTLE9BQU8sT0FBSyxDQUFDLEVBQUUsYUFBYTtBQUN4RixVQUFJLGNBQWMsU0FBUyxHQUFHO0FBQzdCLGFBQUssVUFBVSxvQkFBb0IsSUFBSTtBQUFBLE1BQ3hDO0FBR0EsV0FBSyxpQkFBaUIsS0FBSyxPQUFPO0FBRWxDLGFBQU87QUFBQSxJQUNSLFNBQVMsT0FBTztBQUVmLFVBQUksT0FBTyxvQkFBb0IsS0FBSyxHQUFHO0FBRXRDLGVBQU87QUFBQSxNQUNSO0FBR0EsVUFBSSxXQUFXLFFBQVEsZ0JBQWdCLEVBQUUsU0FBUyxHQUFHO0FBQ3BELGFBQUssYUFBYSxTQUFTLGNBQWMsS0FBSztBQUFBLE1BQy9DO0FBRUEsVUFBSSxRQUFRLGlCQUFpQixRQUFRLGNBQWMsWUFBWSxZQUFZLFFBQVEsY0FBYyxjQUFjO0FBRTlHLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxlQUFlLGlCQUFpQixRQUFRLE1BQU0sVUFBVTtBQUM5RCxVQUFJLE1BQU0sYUFBYSxPQUFPO0FBRTdCLGNBQU0sS0FBSyxVQUFVLGNBQWMsbUJBQW1CLEtBQUssSUFBSSxNQUFNLFVBQVUsQ0FBQyxDQUFDO0FBQUEsTUFDbEY7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMseUJBQXlCLGNBQXdDO0FBQzlFLFVBQU0sU0FBUyxNQUFNLEtBQUssY0FBYyxRQUFRO0FBQUEsTUFDL0MsU0FBUyxJQUFJLFNBQVMsbUJBQW1CLG9FQUFvRSxZQUFZO0FBQUEsSUFDMUgsQ0FBQztBQUNELFdBQU8sT0FBTztBQUFBLEVBQ2Y7QUFBQSxFQUVBLE1BQWMsd0JBQXdCLFNBQXdCLGFBQWEsT0FBc0I7QUFFaEcsU0FBSyx5QkFBeUIsT0FBTztBQUVyQyxVQUFNLE9BQU8sS0FBSyxlQUFlLFlBQVksUUFBUSxjQUFjLElBQUk7QUFDdkUsUUFBSTtBQUNILFlBQU0sUUFBUSxXQUFXLElBQUs7QUFDOUIsWUFBTSxRQUFRLGVBQWUsUUFBUSxhQUFhO0FBQ2xELFlBQU0sbUJBQW1CLENBQUMsQ0FBQyxRQUFRLFFBQVEsQ0FBQyxDQUFDLEtBQUsscUJBQXFCLFNBQXdCLFVBQVUsRUFBRSxVQUFVLFFBQVEsS0FBSyxJQUFJLENBQUM7QUFDdkksWUFBTSxLQUFLLFVBQVUscUJBQXFCLE1BQU8sZ0JBQWdCO0FBRWpFLFVBQUksY0FBYyxDQUFDLEtBQUssVUFBVSxrQkFBbUIsUUFBUSxrQkFBa0IsS0FBSyxVQUFVLGtCQUFrQixRQUFRLFNBQVU7QUFDakksY0FBTSxLQUFLLGdCQUFnQixRQUFXLFFBQVcsT0FBTztBQUFBLE1BQ3pEO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixVQUFJLEtBQUssVUFBVSxtQkFBbUIsU0FBUztBQUM5QyxjQUFNLEtBQUssZ0JBQWdCLE1BQVM7QUFBQSxNQUNyQztBQUNBLGFBQU8sUUFBUSxPQUFPLEdBQUc7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHlCQUF5QixTQUE4QjtBQUM5RCxVQUFNLHNCQUFzQixJQUFJLGdCQUFnQjtBQUNoRCxTQUFLLFlBQVksSUFBSSxtQkFBbUI7QUFFeEMsVUFBTSwwQkFBMEIsb0JBQW9CLElBQUksSUFBSSxpQkFBaUIsTUFBTTtBQUVsRixVQUFJLFFBQVEsVUFBVSxNQUFNLFdBQVcsS0FBSyxVQUFVLG1CQUFtQixTQUFTO0FBQ2pGLGFBQUssVUFBVSxTQUFTLFFBQVcsS0FBSyxVQUFVLGVBQWUsU0FBUyxLQUFLO0FBQUEsTUFDaEY7QUFBQSxJQUNELEdBQUcsR0FBRyxDQUFDO0FBQ1Asd0JBQW9CLElBQUksUUFBUSxpQkFBaUIsTUFBTTtBQUN0RCxVQUFJLFFBQVEsVUFBVSxNQUFNLFdBQVcsS0FBSyxVQUFVLG1CQUFtQixTQUFTO0FBQ2pGLGdDQUF3QixTQUFTO0FBQUEsTUFDbEM7QUFDQSxVQUFJLFlBQVksS0FBSyxVQUFVLGdCQUFnQjtBQUM5QyxhQUFLLGNBQWM7QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQ0Ysd0JBQW9CLElBQUksS0FBSyxnQkFBZ0IsT0FBSztBQUNqRCxVQUFJLEVBQUUsWUFBWSxTQUFTO0FBQzFCLGFBQUssWUFBWSxPQUFPLG1CQUFtQjtBQUFBLE1BQzVDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRix3QkFBb0IsSUFBSSxRQUFRLGdCQUFnQixPQUFNLHFCQUFvQjtBQUV6RSxVQUFJLGtCQUFrQjtBQUNyQixZQUFJLGlCQUFpQixPQUFPO0FBQzNCLGVBQUssb0JBQW9CLE1BQU0sSUFBSSxTQUFTLHFCQUFxQiwyREFBMkQsaUJBQWlCLE1BQU0sV0FBVyxpQkFBaUIsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLFFBQ2pNO0FBQ0EsYUFBSyxVQUFVLG9CQUFvQixTQUFTLGdCQUFnQjtBQUFBLE1BQzdEO0FBR0EsWUFBTSx3QkFBd0IsNkJBQTZCLE9BQU87QUFDbEUsVUFBSSx5QkFBeUIsc0JBQXNCLFVBQVUsTUFBTSxXQUFXLHNCQUFzQixjQUFjLFNBQVM7QUFDMUgsYUFBSywwQkFBMEIsTUFBTSxzQkFBc0IsTUFBTSxDQUFDO0FBQUEsTUFDbkU7QUFFQSxVQUFJLFFBQVEsY0FBYyxlQUFlO0FBQ3hDLGNBQU0sT0FBTyxRQUFRLFFBQVEsS0FBSyxlQUFlLGFBQWE7QUFDOUQsWUFBSTtBQUNILGdCQUFNLEtBQUssV0FBVyxRQUFRLE1BQU0sUUFBUSxjQUFjLGFBQWE7QUFBQSxRQUN4RSxTQUFTLEtBQUs7QUFDYixlQUFLLG9CQUFvQixNQUFNLEdBQUc7QUFBQSxRQUNuQztBQUFBLE1BQ0Q7QUFDQSxXQUFLLHFCQUFxQjtBQUMxQixXQUFLLGFBQWEsUUFBUSxNQUFNLENBQUM7QUFFakMsVUFBSSxLQUFLLHFCQUFxQixTQUE4QixPQUFPLEVBQUUsd0JBQXdCO0FBQzVGLGNBQU0saUJBQWlCLEtBQUssY0FBYyxXQUFXLGFBQWEsVUFBVSxFQUFFLE9BQU8sQ0FBQyxFQUFFLE9BQU8sTUFBTTtBQUNwRyxpQkFBTyxPQUFPLFVBQVUsV0FBVyxnQkFBZ0IsUUFBUSxNQUFNLE1BQU0sT0FBTyxvQkFBb0IsT0FBTyxRQUFRLEVBQUU7QUFBQSxRQUNwSCxDQUFDO0FBQ0QsYUFBSyxjQUFjLGFBQWEsY0FBYztBQUFBLE1BQy9DO0FBQ0EsV0FBSyxpQkFBaUIsS0FBSyxFQUFFLFNBQVMsU0FBUyxLQUFLLG1CQUFtQixJQUFJLE9BQU8sRUFBRSxDQUFDO0FBRXJGLFlBQU0saUJBQWlCLEtBQUssVUFBVTtBQUN0QyxVQUFJLGtCQUFrQixlQUFlLE1BQU0sTUFBTSxRQUFRLE1BQU0sR0FBRztBQUNqRSxjQUFNLEVBQUUsU0FBQUMsVUFBUyxRQUFRLFdBQVcsSUFBSSxxQ0FBcUMsS0FBSyxPQUFPLFFBQVcsUUFBVyxRQUFXLGNBQWM7QUFDeEksYUFBSyxVQUFVLFNBQVMsWUFBWSxRQUFRQSxVQUFTLEtBQUs7QUFBQSxNQUMzRDtBQUVBLFVBQUksS0FBSyxNQUFNLFlBQVksRUFBRSxXQUFXLEdBQUc7QUFDMUMsYUFBSyxVQUFVLG9CQUFvQixLQUFLO0FBRXhDLFlBQUksS0FBSyxjQUFjLFVBQVUsTUFBTSxZQUFZLEtBQUssS0FBSyxxQkFBcUIsU0FBOEIsT0FBTyxFQUFFLG1CQUFtQjtBQUMzSSxlQUFLLHFCQUFxQixrQkFBa0IscUJBQXFCLHNCQUFzQixPQUFPO0FBQUEsUUFDL0Y7QUFHQSxjQUFNLGtCQUFrQixLQUFLLE1BQU0sbUJBQW1CLEVBQUUsT0FBTyxTQUFPLENBQUMsSUFBSSxVQUFVO0FBQ3JGLHdCQUFnQixRQUFRLFNBQU8sS0FBSyxNQUFNLHNCQUFzQixJQUFJLE1BQU0sQ0FBQyxDQUFDO0FBRTVFLFlBQUksS0FBSyxxQkFBcUIsU0FBOEIsT0FBTyxFQUFFLFFBQVEsWUFBWTtBQUN4RixnQkFBTSx3QkFBd0IsS0FBSyxzQkFBc0IseUJBQXlCLFlBQVk7QUFDOUYsY0FBSSx5QkFBeUIsS0FBSyxhQUFhLHVCQUF1QixzQkFBc0IsRUFBRSxHQUFHO0FBQ2hHLGlCQUFLLGFBQWEsbUJBQW1CLHNCQUFzQixFQUFFO0FBQUEsVUFDOUQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFdBQUssTUFBTSxxQ0FBcUMsUUFBUSxNQUFNLENBQUM7QUFBQSxJQUVoRSxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxNQUFNLGVBQWUsU0FBd0IsYUFBa0M7QUFDOUUsUUFBSSxRQUFRLG1CQUFtQjtBQUM5QixZQUFNLHdCQUF3QixLQUFLLHNCQUFzQixLQUFLLGFBQWE7QUFBQSxJQUM1RTtBQUVBLFVBQU0sZ0JBQWdCLENBQUMsQ0FBQztBQUV4QixVQUFNLFdBQXlDLFlBQVk7QUFDMUQsVUFBSSxlQUFlO0FBRWxCLGVBQU8sUUFBUSxRQUFRLGNBQWMsT0FBTztBQUFBLE1BQzdDO0FBRUEsWUFBTSxPQUFPLFFBQVEsUUFBUSxLQUFLLGVBQWUsYUFBYTtBQUM5RCxZQUFNLEtBQUssV0FBVyxRQUFRLE1BQU0sUUFBUSxjQUFjLGNBQWM7QUFDeEUsWUFBTSxLQUFLLFdBQVcsUUFBUSxNQUFNLFFBQVEsY0FBYyxhQUFhO0FBRXZFLFlBQU0sY0FBYyxNQUFNLEtBQUssV0FBVyxzQkFBc0IsTUFBTSxRQUFRLGNBQWMsYUFBYTtBQUN6RyxVQUFJLGdCQUFnQixjQUFjLFNBQVM7QUFDMUMsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPLEtBQUssV0FBVyxzQkFBc0IsTUFBTSxRQUFRLGNBQWMsZUFBZTtBQUFBLElBQ3pGO0FBRUEsVUFBTSx3QkFBd0IsNkJBQTZCLE9BQU87QUFDbEUsUUFBSSx1QkFBdUI7QUFDMUIsWUFBTSxhQUFhLE1BQU0sU0FBUztBQUNsQyxVQUFJLGVBQWUsY0FBYyxTQUFTO0FBQ3pDLGFBQUssMEJBQTBCLE9BQU8sc0JBQXNCLE1BQU0sQ0FBQztBQUFBLE1BQ3BFO0FBRUE7QUFBQSxJQUNEO0FBR0EsUUFBSSxvQkFBb0I7QUFDeEIsUUFBSTtBQUNKLFVBQU0sU0FBUyxRQUFRLE9BQU8sS0FBSyxxQkFBcUIsVUFBVSxRQUFRLEtBQUssR0FBRyxJQUFJO0FBQ3RGLFFBQUksUUFBUTtBQUNYLG1CQUFhLE9BQU8saUJBQWlCLFFBQVEsY0FBYyxJQUFJO0FBQy9ELFVBQUksY0FBYyxDQUFDLE9BQU8sWUFBWSxRQUFRLHVCQUF1QixHQUFHO0FBQ3ZFLG1CQUFXLFVBQVUsUUFBUSxjQUFjO0FBQzNDLDRCQUFvQjtBQUFBLE1BQ3JCO0FBQUEsSUFDRDtBQUVBLFFBQUksV0FBdUMsUUFBUTtBQUNuRCxRQUFJLFVBQVUscUJBQXFCLFlBQVk7QUFDOUMsWUFBTSx3QkFBd0IsSUFBSSx3QkFBd0I7QUFDMUQsV0FBSywwQkFBMEIsSUFBSSxRQUFRLE1BQU0sR0FBRyxxQkFBcUI7QUFDekUsWUFBTSxzQkFBc0IsTUFBTSxLQUFLLHFCQUFxQixnQ0FBZ0MsT0FBTyxZQUFZLE9BQU8sVUFBVSxNQUFNLFFBQVcsV0FBVyxNQUFNLFlBQVksc0JBQXNCLEtBQUs7QUFDek0sVUFBSSxxQkFBcUI7QUFDeEIsbUJBQVcsTUFBTSxLQUFLLG9CQUFvQixRQUFRLG1CQUFtQjtBQUNyRSxZQUFJLFlBQVksQ0FBQyxzQkFBc0IsTUFBTSx5QkFBeUI7QUFDckUscUJBQVcsTUFBTSxLQUFLLHFCQUFxQixrREFBa0QsVUFBVSxPQUFPLFlBQVksT0FBTyxVQUFVLE1BQU0sUUFBVyxTQUFTLE1BQU0sVUFBVSxzQkFBc0IsS0FBSztBQUFBLFFBQ2pOO0FBQUEsTUFDRCxPQUFPO0FBQ04sbUJBQVc7QUFBQSxNQUNaO0FBQUEsSUFDRDtBQUNBLFFBQUksVUFBVTtBQUNiLGNBQVEsaUJBQWlCLEVBQUUsVUFBVSxXQUFXLENBQUM7QUFBQSxJQUNsRDtBQUNBLFlBQVEsY0FBYyxZQUFZO0FBRWxDLFVBQU0sWUFBWSxPQUFPLE9BQTJDO0FBQ25FLFdBQUssbUJBQW1CLElBQUksT0FBTztBQUNuQyxVQUFJLGFBQWE7QUFDakIsVUFBSTtBQUNILHFCQUFjLE1BQU0sR0FBRyxNQUFPO0FBQUEsTUFDL0IsU0FBUyxHQUFHO0FBQ1gscUJBQWE7QUFDYixjQUFNO0FBQUEsTUFDUCxVQUFFO0FBQ0QsYUFBSyxtQkFBbUIsT0FBTyxPQUFPO0FBSXRDLFlBQUksQ0FBQyxZQUFZO0FBQ2hCLGVBQUssaUJBQWlCLEtBQUssRUFBRSxTQUFTLFNBQVMsTUFBTSxDQUFDO0FBQUEsUUFDdkQ7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLGVBQVcsY0FBYyxLQUFLLE1BQU0sZUFBZSxFQUFFLGVBQWUsS0FBSyxDQUFDLEdBQUc7QUFDNUUsaUJBQVcscUJBQXFCLFFBQVEsTUFBTSxHQUFHLEtBQUs7QUFBQSxJQUN2RDtBQUlBLFFBQUksUUFBUSxtQkFBbUI7QUFDOUIsVUFBSSxDQUFDLFFBQVEsa0JBQWtCLGFBQWE7QUFDM0MsZ0JBQVEsd0JBQXdCO0FBQ2hDLGNBQU0sTUFBTSxVQUFVLFFBQVEsa0JBQWtCLFVBQVU7QUFBQSxNQUkzRDtBQUVBLFdBQUssWUFBWSxpQkFBaUIsUUFBUSxrQkFBa0IsT0FBTztBQUNuRTtBQUFBLElBQ0Q7QUFFQSxRQUFJLFFBQVEsYUFBYSx3QkFBd0I7QUFDaEQsWUFBTSxhQUFhLE1BQU0sU0FBUztBQUNsQyxVQUFJLGVBQWUsY0FBYyxTQUFTO0FBQ3pDLGNBQU0sVUFBVSxZQUFZO0FBQzNCLGdCQUFNLFFBQVEsUUFBUTtBQUN0QixpQkFBTztBQUFBLFFBQ1IsQ0FBQztBQUFBLE1BQ0Y7QUFFQTtBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQWMsQ0FBQyxDQUFDLEtBQUssVUFBVSxrQkFBa0IsUUFBUSxNQUFNLE1BQU0sS0FBSyxVQUFVLGVBQWUsTUFBTTtBQUMvRyxXQUFPLFVBQVUsWUFBWTtBQUU1QixVQUFJLGVBQWU7QUFDbEIsY0FBTSxRQUFRLFdBQVcsSUFBSTtBQUFBLE1BQzlCLE9BQU87QUFDTixjQUFNLFFBQVEsVUFBVSxJQUFJO0FBQUEsTUFDN0I7QUFFQSxhQUFPLElBQUksUUFBaUIsQ0FBQyxHQUFHLE1BQU07QUFDckMsbUJBQVcsWUFBWTtBQUN0QixnQkFBTSxhQUFhLE1BQU0sU0FBUztBQUNsQyxjQUFJLGVBQWUsY0FBYyxTQUFTO0FBQ3pDLG1CQUFPLEVBQUUsS0FBSztBQUFBLFVBQ2Y7QUFFQSxjQUFJLENBQUMsVUFBVTtBQUNkLG1CQUFPLEVBQUUsS0FBSztBQUFBLFVBQ2Y7QUFFQSxjQUFJO0FBQ0gsa0JBQU0sS0FBSyx3QkFBd0IsU0FBUyxXQUFXO0FBQ3ZELGlCQUFLLGlCQUFpQixLQUFLLE9BQU87QUFDbEMsY0FBRSxJQUFJO0FBQUEsVUFDUCxTQUFTLE9BQU87QUFDZixjQUFFLEtBQUs7QUFBQSxVQUNSO0FBQUEsUUFDRCxHQUFHLEdBQUc7QUFBQSxNQUNQLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLFlBQVksU0FBb0MsYUFBYSxPQUFPLFVBQVUsT0FBcUI7QUFDeEcsUUFBSSxTQUFTO0FBQ1osYUFBTyxhQUFhLFFBQVEsV0FBVyxRQUFXLE9BQU8sSUFBSSxRQUFRLFVBQVU7QUFBQSxJQUNoRjtBQUVBLFVBQU0sV0FBVyxLQUFLLE1BQU0sWUFBWTtBQUN4QyxRQUFJLFNBQVMsV0FBVyxHQUFHO0FBQzFCLFdBQUssV0FBVyxPQUFPO0FBRXZCLFlBQU0sS0FBSyxrQkFBa0IsT0FBTztBQUNwQyxXQUFLLHFCQUFxQjtBQUMxQixXQUFLLGFBQWEsTUFBUztBQUFBLElBQzVCO0FBRUEsV0FBTyxRQUFRLElBQUksU0FBUyxJQUFJLE9BQUssYUFBYSxFQUFFLFdBQVcsUUFBVyxPQUFPLElBQUksRUFBRSxVQUFVLENBQUMsQ0FBQztBQUFBLEVBQ3BHO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixRQUE2QixRQUErQztBQUM3RyxVQUFNLE1BQU0sS0FBSyxlQUFlLFlBQVksT0FBTyxJQUFJO0FBQ3ZELFFBQUksS0FBSztBQUNSLFVBQUksU0FBdUM7QUFDM0MsVUFBSSxVQUFVLE9BQU8sV0FBVztBQUMvQixpQkFBUyxPQUFPO0FBQUEsTUFDakIsT0FBTztBQUNOLGNBQU0sVUFBVSxLQUFLLGVBQWUsYUFBYSxFQUFFO0FBQ25ELFlBQUksUUFBUSxXQUFXLEdBQUc7QUFDekIsbUJBQVMsUUFBUSxDQUFDO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBQ0EsVUFBSTtBQUNILGVBQU8sTUFBTSxJQUFJLG9CQUFvQixRQUFRLE1BQU07QUFBQSxNQUNwRCxTQUFTLEtBQUs7QUFDYixZQUFJLElBQUksWUFBWSxPQUFPLGNBQWM7QUFDeEMsZUFBSyxVQUFVLElBQUksU0FBUyxRQUFXLENBQUMsQ0FBQyxRQUFRLGlCQUFpQixPQUFPLElBQUksQ0FBQztBQUFBLFFBQy9FO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQ0EsV0FBTyxRQUFRLFFBQVEsTUFBTTtBQUFBLEVBQzlCO0FBQUEsRUFFQSxNQUFjLFVBQVUsU0FBaUIsZUFBdUMsQ0FBQyxHQUFHLG1CQUFtQixNQUFxQjtBQUMzSCxVQUFNLGtCQUFrQixTQUFTLEVBQUUsSUFBSSw0QkFBNEIsT0FBTyx1QkFBdUIsU0FBUyxNQUFNLEtBQUssTUFBTSxLQUFLLGVBQWUsZUFBZSwwQkFBMEIsRUFBRSxDQUFDO0FBRTNMLFVBQU0sVUFBVSxhQUFhLE9BQU8sQ0FBQyxXQUFXLE9BQU8sR0FBRyxTQUFTLFVBQVUsQ0FBQyxFQUFFLFNBQVMsSUFDeEYsZUFDQSxDQUFDLEdBQUcsY0FBYyxHQUFJLG1CQUFtQixDQUFDLGVBQWUsSUFBSSxDQUFDLENBQUU7QUFDakUsVUFBTSxLQUFLLGNBQWMsT0FBTztBQUFBLE1BQy9CLE1BQU0sU0FBUztBQUFBLE1BQ2Y7QUFBQSxNQUNBLFNBQVMsUUFBUSxJQUFJLGFBQVc7QUFBQSxRQUMvQixPQUFPLE9BQU87QUFBQSxRQUNkLEtBQUssTUFBTSxPQUFPLElBQUk7QUFBQSxNQUN2QixFQUFFO0FBQUEsTUFDRixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFJQSxNQUFNLGdCQUFnQixhQUFzQyxTQUFtQixVQUEwQixTQUFrSDtBQUMxTixVQUFNLEVBQUUsWUFBWSxRQUFRLFFBQVEsSUFBSSxxQ0FBcUMsS0FBSyxPQUFPLGFBQWEsU0FBUyxRQUFRO0FBRXZILFFBQUksWUFBWTtBQUNmLFlBQU0sU0FBUyxNQUFNLFdBQVcsYUFBYSxLQUFLLGVBQWUsU0FBUyxpQkFBaUIsTUFBTSxTQUFTLFlBQVksU0FBUyxNQUFNO0FBQ3JJLFVBQUksUUFBUTtBQUNYLFlBQUksT0FBTyxVQUFVLHFCQUFxQixVQUFVO0FBQUEsUUFFcEQsT0FBTztBQUNOLGdCQUFNLFVBQVUsT0FBTyxXQUFXO0FBQ2xDLGNBQUksY0FBYyxhQUFhLE9BQU8sS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM5RCxrQkFBTSxRQUFRLFFBQVEsU0FBUztBQUMvQixrQkFBTSxhQUFhLFdBQVcsTUFBTTtBQUNwQyxnQkFBSSxjQUFjLEtBQUssY0FBYyxNQUFNLGFBQWEsR0FBRztBQUMxRCxvQkFBTSxjQUFjLFFBQVEsU0FBUyxFQUFFLGVBQWUsVUFBVTtBQUNoRSxtQkFBSyxNQUFNLElBQUk7QUFBQSxnQkFBUyxFQUFFLEtBQUssbUJBQW1CLFNBQVMsQ0FBQyw4TEFBOEwsRUFBRTtBQUFBLGdCQUMzUDtBQUFBLGdCQUFzQztBQUFBLGdCQUFhLFVBQVUsT0FBTyxpQkFBaUIsWUFBWSxPQUFPLGVBQWUsTUFBTSxLQUFLO0FBQUEsZ0JBQUksV0FBVyxTQUFTLFdBQVcsT0FBTyxPQUFPO0FBQUEsZ0JBQUksV0FBVyxNQUFNO0FBQUEsY0FBZSxDQUFDO0FBQUEsWUFDMU47QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsUUFBSSxTQUFTO0FBQ1osV0FBSyxVQUFVLElBQUksUUFBUSxjQUFjLElBQUk7QUFBQSxJQUM5QyxPQUFPO0FBQ04sV0FBSyxVQUFVLE1BQU07QUFBQSxJQUN0QjtBQUVBLFNBQUssVUFBVSxTQUFTLFlBQVksUUFBUSxTQUFTLENBQUMsQ0FBQyxTQUFTLFFBQVE7QUFBQSxFQUN6RTtBQUFBO0FBQUEsRUFJQSxtQkFBbUIsTUFBcUI7QUFDdkMsVUFBTSxLQUFLLEtBQUssTUFBTSxtQkFBbUIsSUFBSTtBQUM3QyxRQUFJLENBQUMsTUFBTTtBQUNWLFdBQUssVUFBVSxzQkFBc0IsSUFBSSxLQUFLO0FBQUEsSUFDL0M7QUFDQSxTQUFLLGFBQWEsc0JBQXNCLEtBQUssTUFBTSxvQkFBb0IsQ0FBQztBQUFBLEVBQ3pFO0FBQUEsRUFFQSxzQkFBc0IsSUFBWSxTQUF1QjtBQUN4RCxTQUFLLE1BQU0sc0JBQXNCLElBQUksT0FBTztBQUM1QyxTQUFLLGFBQWEsc0JBQXNCLEtBQUssTUFBTSxvQkFBb0IsQ0FBQztBQUFBLEVBQ3pFO0FBQUEsRUFFQSxvQkFBb0IsSUFBWSxVQUF3QjtBQUN2RCxTQUFLLE1BQU0sb0JBQW9CLElBQUksUUFBUTtBQUMzQyxTQUFLLGFBQWEsc0JBQXNCLEtBQUssTUFBTSxvQkFBb0IsQ0FBQztBQUFBLEVBQ3pFO0FBQUEsRUFFQSx1QkFBdUIsSUFBbUI7QUFDekMsU0FBSyxNQUFNLHVCQUF1QixFQUFFO0FBQ3BDLFNBQUssYUFBYSxzQkFBc0IsS0FBSyxNQUFNLG9CQUFvQixDQUFDO0FBQUEsRUFDekU7QUFBQTtBQUFBLEVBSUEsb0JBQW9CLE9BQTRCO0FBQy9DLFdBQU8sS0FBSyxlQUFlLG9CQUFvQixLQUFLO0FBQUEsRUFDckQ7QUFBQSxFQUVBLE1BQU0sMkJBQTJCLFFBQWlCLFlBQXlDO0FBQzFGLFFBQUksWUFBWTtBQUNmLFdBQUssTUFBTSxjQUFjLFlBQVksTUFBTTtBQUMzQyxXQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUM3QyxVQUFJLHNCQUFzQixZQUFZO0FBQ3JDLGNBQU0sS0FBSyx3Q0FBd0MsUUFBUSxVQUFVO0FBQ3JFLGNBQU0sS0FBSyxnQkFBZ0IsV0FBVyxXQUFXO0FBQUEsTUFDbEQsV0FBVyxzQkFBc0Isb0JBQW9CO0FBQ3BELGNBQU0sS0FBSyx3QkFBd0I7QUFBQSxNQUNwQyxXQUFXLHNCQUFzQixnQkFBZ0I7QUFDaEQsY0FBTSxLQUFLLG9CQUFvQjtBQUFBLE1BQ2hDLFdBQVcsc0JBQXNCLHVCQUF1QjtBQUN2RCxjQUFNLEtBQUssMkJBQTJCO0FBQUEsTUFDdkMsT0FBTztBQUNOLGNBQU0sS0FBSyx5QkFBeUI7QUFBQSxNQUNyQztBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssTUFBTSw4QkFBOEIsTUFBTTtBQUMvQyxXQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUM3QyxZQUFNLEtBQUssbUJBQW1CO0FBQUEsSUFDL0I7QUFDQSxTQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFQSxNQUFNLGVBQWVKLE1BQVUsZ0JBQW1DLGVBQWUsTUFBOEI7QUFDOUcsVUFBTSxjQUFjLEtBQUssTUFBTSxlQUFlQSxNQUFLLGNBQWM7QUFDakUsUUFBSSxjQUFjO0FBQ2pCLGtCQUFZLFFBQVEsUUFBTSxLQUFLLE9BQU8sSUFBSSxTQUFTLG1CQUFtQix3Q0FBd0MsR0FBRyxZQUFZQSxLQUFJLE1BQU0sQ0FBQyxDQUFDO0FBQUEsSUFDMUk7QUFJQSxTQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUM3QyxVQUFNLEtBQUssZ0JBQWdCQSxJQUFHO0FBQzlCLFNBQUssYUFBYSxpQkFBaUIsS0FBSyxLQUFLO0FBQzdDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFNLGtCQUFrQkEsTUFBVSxNQUEwQyxxQkFBNkM7QUFDeEgsU0FBSyxNQUFNLGtCQUFrQixJQUFJO0FBQ2pDLFNBQUssYUFBYSxpQkFBaUIsS0FBSyxLQUFLO0FBQzdDLFFBQUkscUJBQXFCO0FBQ3hCLFdBQUssaUNBQWlDLElBQUlBLElBQUc7QUFBQSxJQUM5QyxPQUFPO0FBQ04sWUFBTSxLQUFLLGdCQUFnQkEsSUFBRztBQUM5QixXQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxrQkFBa0IsSUFBdUM7QUFDOUQsVUFBTSxjQUFjLEtBQUssTUFBTSxlQUFlO0FBQzlDLFVBQU0sV0FBVyxPQUFPLFNBQ3JCLGNBQ0EsY0FBYyxRQUNiLFlBQVksT0FBTyxRQUFNLEdBQUcsU0FBUyxHQUFHLE1BQU0sQ0FBQyxDQUFDLElBQ2hELFlBQVksT0FBTyxRQUFNLEdBQUcsTUFBTSxNQUFNLEVBQUU7QUFFOUMsYUFBUyxRQUFRLFFBQU0sS0FBSyxPQUFPLElBQUksU0FBUyxxQkFBcUIsMENBQTBDLEdBQUcsWUFBWSxHQUFHLElBQUksTUFBTSxDQUFDLENBQUM7QUFDN0ksVUFBTSxjQUFjLElBQUksSUFBSSxTQUFTLElBQUksUUFBTSxHQUFHLFlBQVksU0FBUyxDQUFDLENBQUM7QUFFekUsU0FBSyxNQUFNLGtCQUFrQixRQUFRO0FBQ3JDLFNBQUssMkJBQTJCLGFBQWEsUUFBUSxFQUFFLFFBQVEsQ0FBQUEsU0FBTyxZQUFZLElBQUlBLEtBQUksU0FBUyxDQUFDLENBQUM7QUFFckcsU0FBSyxhQUFhLGlCQUFpQixLQUFLLEtBQUs7QUFDN0MsVUFBTSxRQUFRLElBQUksQ0FBQyxHQUFHLFdBQVcsRUFBRSxJQUFJLENBQUFBLFNBQU8sS0FBSyxnQkFBZ0IsSUFBSSxNQUFNQSxJQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDcEY7QUFBQSxFQUVBLHdCQUF3QixXQUFtQztBQUMxRCxTQUFLLE1BQU0sd0JBQXdCLFNBQVM7QUFDNUMsV0FBTyxLQUFLLG1CQUFtQjtBQUFBLEVBQ2hDO0FBQUEsRUFFQSxNQUFNLHNCQUFzQixNQUFtQyxJQUE0QjtBQUMxRixTQUFLLE1BQU0sc0JBQXNCLFFBQVEsRUFBRSxNQUFNLEdBQUcsR0FBRyxFQUFFO0FBRXpELFFBQUksTUFBTTtBQUNULFdBQUssYUFBYSxpQkFBaUIsS0FBSyxLQUFLO0FBQzdDLFlBQU0sS0FBSyx3QkFBd0I7QUFDbkMsV0FBSyxhQUFhLGlCQUFpQixLQUFLLEtBQUs7QUFBQSxJQUM5QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0seUJBQXlCLElBQVksUUFBcUY7QUFDL0gsU0FBSyxNQUFNLHlCQUF5QixJQUFJLE1BQU07QUFDOUMsU0FBSyxhQUFhLGlCQUFpQixLQUFLLEtBQUs7QUFDN0MsVUFBTSxLQUFLLHdCQUF3QjtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxNQUFNLDBCQUEwQixJQUE0QjtBQUMzRCxTQUFLLE1BQU0sMEJBQTBCLEVBQUU7QUFDdkMsU0FBSyxhQUFhLGlCQUFpQixLQUFLLEtBQUs7QUFDN0MsVUFBTSxLQUFLLHdCQUF3QjtBQUFBLEVBQ3BDO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixNQUE2QztBQUNwRSxTQUFLLE1BQU0sa0JBQWtCLElBQUk7QUFDakMsU0FBSyxhQUFhLGlCQUFpQixLQUFLLEtBQUs7QUFDN0MsVUFBTSxLQUFLLG9CQUFvQjtBQUMvQixTQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixJQUFZLFFBQXNFO0FBQzVHLFNBQUssTUFBTSxxQkFBcUIsSUFBSSxNQUFNO0FBQzFDLFNBQUssYUFBYSxpQkFBaUIsS0FBSyxLQUFLO0FBQzdDLFVBQU0sS0FBSyxvQkFBb0I7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBTSxzQkFBc0IsSUFBNEI7QUFDdkQsU0FBSyxNQUFNLHNCQUFzQixFQUFFO0FBQ25DLFNBQUssYUFBYSxpQkFBaUIsS0FBSyxLQUFLO0FBQzdDLFVBQU0sS0FBSyxvQkFBb0I7QUFBQSxFQUNoQztBQUFBLEVBRUEsTUFBTSx5QkFBeUIsTUFBb0Q7QUFDbEYsU0FBSyxNQUFNLHlCQUF5QixJQUFJO0FBQ3hDLFNBQUssYUFBYSxpQkFBaUIsS0FBSyxLQUFLO0FBQzdDLFVBQU0sS0FBSywyQkFBMkI7QUFDdEMsU0FBSyxhQUFhLGlCQUFpQixLQUFLLEtBQUs7QUFBQSxFQUM5QztBQUFBLEVBRUEsTUFBTSw2QkFBNkIsc0JBQStCLFFBQWlCLFNBQWlDO0FBQ25ILFNBQUssTUFBTSw2QkFBNkIsc0JBQXNCLFFBQVEsT0FBTztBQUM3RSxTQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUM3QyxVQUFNLEtBQUssMkJBQTJCO0FBQUEsRUFDdkM7QUFBQSxFQUVBLHNDQUFzQyxXQUFtQjtBQUN4RCxTQUFLLE1BQU0sc0NBQXNDLFNBQVM7QUFDMUQsU0FBSyxhQUFhLGlCQUFpQixLQUFLLEtBQUs7QUFBQSxFQUM5QztBQUFBLEVBRUEsa0NBQWtDLFNBQXdCLFNBQTJEO0FBQ3BILFNBQUssTUFBTSxrQ0FBa0MsUUFBUSxNQUFNLEdBQUcsT0FBTztBQUNyRSxTQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUFBLEVBQzlDO0FBQUEsRUFFQSxNQUFNLGdDQUFnQyxxQkFBMkMsV0FBOEM7QUFDOUgsU0FBSyxNQUFNLGdDQUFnQyxxQkFBcUIsU0FBUztBQUN6RSxTQUFLLGFBQWEsaUJBQWlCLEtBQUssS0FBSztBQUM3QyxVQUFNLEtBQUsseUJBQXlCO0FBQUEsRUFDckM7QUFBQSxFQUVBLE1BQU0sbUJBQW1CLFNBQXdDO0FBQ2hFLFVBQU0seUJBQXlCLFNBQVMsS0FBSyxNQUFNLGVBQWUsR0FBRyxRQUFNLEdBQUcsWUFBWSxTQUFTLENBQUMsRUFDbEcsSUFBSSxRQUFNLEtBQUssZ0JBQWdCLEdBQUcsYUFBYSxPQUFPLE9BQU8sQ0FBQztBQUdoRSxRQUFJLFNBQVMsYUFBYSxrQ0FBa0M7QUFDM0QsWUFBTSxRQUFRLElBQUk7QUFBQSxRQUNqQixHQUFHO0FBQUEsUUFDSCxLQUFLLHdCQUF3QixPQUFPO0FBQUEsUUFDcEMsS0FBSyxvQkFBb0IsT0FBTztBQUFBLFFBQ2hDLEtBQUssMkJBQTJCLE9BQU87QUFBQSxRQUN2QyxLQUFLLHlCQUF5QixPQUFPO0FBQUEsTUFDdEMsQ0FBQztBQUFBLElBQ0YsT0FBTztBQUNOLFlBQU0sUUFBUSxJQUFJLHNCQUFzQjtBQUN4QyxZQUFNLEtBQUssd0JBQXdCLE9BQU87QUFDMUMsWUFBTSxLQUFLLG9CQUFvQixPQUFPO0FBQ3RDLFlBQU0sS0FBSywyQkFBMkIsT0FBTztBQUc3QyxZQUFNLEtBQUsseUJBQXlCLE9BQU87QUFBQSxJQUM1QztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSwyQkFBMkIsZ0JBQXdDLG9CQUFtRDtBQUM3SCxVQUFNLGVBQXNCLENBQUM7QUFDN0IsZUFBVyxXQUFXLG9CQUFvQjtBQUN6QyxpQkFBVyxZQUFZLGdCQUFnQjtBQUN0QyxZQUFJLENBQUMsbUJBQW1CLFNBQVMsUUFBUSxLQUFLLFNBQVMsZ0JBQWdCLFFBQVEsTUFBTSxHQUFHO0FBQ3ZGLGVBQUssTUFBTSxrQkFBa0Isb0JBQUksSUFBSSxDQUFDLENBQUMsU0FBUyxNQUFNLEdBQUcsRUFBRSxhQUFhLE9BQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN0Rix1QkFBYSxLQUFLLFNBQVMsV0FBVztBQUFBLFFBQ3ZDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyx3Q0FBd0MsUUFBaUIsWUFBd0I7QUFDOUYsUUFBSSxRQUFRO0FBRVgsVUFBSSxXQUFXLGFBQWE7QUFDM0IsY0FBTSxVQUFVLEtBQUssTUFBTSxlQUFlLEVBQUUsS0FBSyxRQUFNLFdBQVcsZ0JBQWdCLEdBQUcsTUFBTSxDQUFDO0FBQzVGLFlBQUksV0FBVyxDQUFDLFFBQVEsU0FBUztBQUNoQyxnQkFBTSxLQUFLLDJCQUEyQixRQUFRLE9BQU87QUFBQSxRQUN0RDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBSUEsVUFBTSxRQUFRO0FBQUEsTUFBSSxLQUFLLE1BQU0sZUFBZSxFQUMxQyxPQUFPLFFBQU0sR0FBRyxnQkFBZ0IsV0FBVyxNQUFNLEtBQUssR0FBRyxZQUFZLE1BQU0sRUFDM0UsSUFBSSxRQUFNLEtBQUssMkJBQTJCLFFBQVEsRUFBRSxDQUFDO0FBQUEsSUFDdkQ7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFhLGdCQUFnQixVQUFlLGlCQUFpQixPQUFPLFNBQXdDO0FBQzNHLFVBQU0sb0JBQW9CLEtBQUssTUFBTSxlQUFlLEVBQUUsYUFBYSxVQUFVLGFBQWEsS0FBSyxDQUFDO0FBQ2hHLFVBQU0sdUJBQXVCLEtBQUssT0FBTyxTQUFTLE9BQU0sTUFBSztBQUM1RCxVQUFJLENBQUMsRUFBRSxjQUFjLFNBQVM7QUFDN0IsY0FBTSxhQUFhLGtCQUFrQixPQUFPLFFBQU0sQ0FBQyxHQUFHLGVBQWUsR0FBRyxxQkFBcUIsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUN2RyxjQUFNLEVBQUUsZ0JBQWdCLFVBQVUsWUFBWSxjQUFjO0FBQUEsTUFDN0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLHdCQUF3QixTQUF3QztBQUM3RSxVQUFNLG9CQUFvQixLQUFLLE1BQU0sdUJBQXVCLEVBQUUsT0FBTyxTQUFPLElBQUksV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFL0gsVUFBTSx1QkFBdUIsS0FBSyxPQUFPLFNBQVMsT0FBTSxNQUFLO0FBQzVELFVBQUksRUFBRSxhQUFhLCtCQUErQixDQUFDLEVBQUUsY0FBYyxTQUFTO0FBQzNFLGNBQU0sRUFBRSx3QkFBd0IsaUJBQWlCO0FBQUEsTUFDbEQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixTQUF3QztBQUN6RSxVQUFNLG9CQUFvQixLQUFLLE1BQU0sbUJBQW1CLEVBQUUsT0FBTyxTQUFPLElBQUksV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFM0gsVUFBTSx1QkFBdUIsS0FBSyxPQUFPLFNBQVMsT0FBTSxNQUFLO0FBQzVELFVBQUksRUFBRSxhQUFhLDJCQUEyQixDQUFDLEVBQUUsY0FBYyxTQUFTO0FBQ3ZFLGNBQU0sRUFBRSxvQkFBb0IsaUJBQWlCO0FBQUEsTUFDOUM7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLDJCQUEyQixTQUF3QztBQUNoRixVQUFNLG9CQUFvQixLQUFLLE1BQU0sMEJBQTBCLEVBQUUsT0FBTyxTQUFPLElBQUksV0FBVyxLQUFLLE1BQU0sd0JBQXdCLENBQUM7QUFFbEksVUFBTSx1QkFBdUIsS0FBSyxPQUFPLFNBQVMsT0FBTSxNQUFLO0FBQzVELFVBQUksRUFBRSxhQUFhLGtDQUFrQyxDQUFDLEVBQUUsY0FBYyxTQUFTO0FBQzlFLGNBQU0sRUFBRSwyQkFBMkIsaUJBQWlCO0FBQUEsTUFDckQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx5QkFBeUIsU0FBd0M7QUFDeEUsV0FBTyx1QkFBdUIsS0FBSyxPQUFPLFNBQVMsT0FBTSxNQUFLO0FBQzdELFlBQU0sc0JBQXNCLEtBQUssTUFBTSxrQ0FBa0MsRUFBRSxNQUFNLENBQUMsRUFBRSxPQUFPLFNBQU8sSUFBSSxPQUFPO0FBQzdHLFVBQUksRUFBRSxhQUFhLHFDQUFxQyxDQUFDLEVBQUUsYUFBYSw4QkFBOEIsRUFBRSxhQUFhLDJCQUEyQixXQUFXLElBQUk7QUFFOUo7QUFBQSxNQUNEO0FBQ0EsVUFBSSxDQUFDLEVBQUUsY0FBYyxTQUFTO0FBQzdCLGNBQU0sRUFBRSx5QkFBeUIsbUJBQW1CO0FBQUEsTUFDckQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxjQUFjLGtCQUEwQztBQUMvRCxVQUFNLFdBQVcsS0FBSyxNQUFNLGVBQWUsRUFBRSxPQUFPLFFBQ25ELGlCQUFpQixTQUFTLEdBQUcsYUFBYSxlQUFlLE9BQU8sQ0FBQztBQUNsRSxRQUFJLFNBQVMsUUFBUTtBQUNwQixXQUFLLE1BQU0sa0JBQWtCLFFBQVE7QUFBQSxJQUN0QztBQUVBLFVBQU0sU0FBZ0IsQ0FBQztBQUN2QixlQUFXQSxRQUFPLEtBQUssa0NBQWtDO0FBQ3hELFVBQUksaUJBQWlCLFNBQVNBLE1BQUssZUFBZSxPQUFPLEdBQUc7QUFDM0QsZUFBTyxLQUFLQSxJQUFHO0FBQUEsTUFDaEI7QUFBQSxJQUNEO0FBRUEsZUFBV0EsUUFBTyxRQUFRO0FBQ3pCLFdBQUssaUNBQWlDLE9BQU9BLElBQUc7QUFDaEQsV0FBSyxnQkFBZ0JBLE1BQUssSUFBSTtBQUFBLElBQy9CO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxNQUFNQSxNQUFVLFlBQW9CLFFBQWdDO0FBQ3pFLFFBQUk7QUFDSixRQUFJLG1CQUFtQixLQUFLLGFBQWEsRUFBRTtBQUMzQyxVQUFNLG9CQUFvQixZQUFZO0FBQ3JDLFlBQU0sV0FBVyxDQUFDLENBQUUsS0FBSyxTQUFTLEVBQUUsZUFBZSxFQUFFLFFBQVEsWUFBWSxLQUFBQSxLQUFJLENBQUMsRUFBRTtBQUVoRixVQUFJLENBQUMsVUFBVTtBQUNkLGNBQU0sWUFBWSxNQUFNLEtBQUssMEJBQTBCQSxNQUFLLFlBQVksTUFBTTtBQUM5RSxZQUFJLFVBQVUsUUFBUTtBQUNyQiw2QkFBbUIsVUFBVTtBQUFBLFFBQzlCO0FBRUEsWUFBSSxVQUFVLFlBQVk7QUFDekIsK0JBQXFCLFVBQVU7QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFDQSxhQUFPLEVBQUUsa0JBQWtCLG1CQUFtQjtBQUFBLElBQy9DO0FBQ0EsVUFBTSx1QkFBdUIsQ0FBQyxVQUEwQjtBQUN2RCxVQUFJLFVBQVUsTUFBTSxXQUFXLFVBQVUsTUFBTSxVQUFVO0FBQ3hELFlBQUksb0JBQW9CO0FBQ3ZCLGVBQUssa0JBQWtCLG1CQUFtQixNQUFNLENBQUM7QUFBQSxRQUNsRDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQ0EsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGtCQUFrQjtBQUN4QixRQUFJLEtBQUssVUFBVSxNQUFNLFVBQVU7QUFFbEMsWUFBTSxFQUFFLFFBQVEsTUFBTSxVQUFVLElBQUksS0FBSyx3QkFBd0IsRUFBRTtBQUNuRSxZQUFNLFNBQVMsTUFBTSxVQUFVO0FBQy9CLFlBQU0sZUFBZSxTQUFTLE9BQU8sT0FBTyxVQUFVLE1BQU0sR0FBRyxDQUFDLENBQUMsSUFBSTtBQUNyRSxZQUFNLFdBQVcsS0FBSyxpQkFBaUIsV0FBUztBQUMvQyxZQUFJLHFCQUFxQixLQUFLLEdBQUc7QUFDaEMsbUJBQVMsUUFBUTtBQUFBLFFBQ2xCO0FBQUEsTUFDRCxDQUFDO0FBQ0QsWUFBTSxLQUFLLGVBQWUsUUFBUSxjQUFjLFFBQVcsSUFBSTtBQUFBLElBQ2hFO0FBQ0EsUUFBSSxLQUFLLFVBQVUsTUFBTSxTQUFTO0FBQ2pDLFlBQU0saUJBQWlCLEtBQUssYUFBYSxFQUFFO0FBQzNDLFVBQUksQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0I7QUFDekM7QUFBQSxNQUNEO0FBRUEsWUFBTSxXQUFXLGlCQUFpQixRQUFRLGlCQUFpQixNQUFNO0FBQ2hFLFlBQUkscUJBQXFCLGVBQWUsS0FBSyxHQUFHO0FBQy9DLG1CQUFTLFFBQVE7QUFBQSxRQUNsQjtBQUFBLE1BQ0QsQ0FBQztBQUNELFlBQU0saUJBQWlCLFNBQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsMEJBQTBCQSxNQUFVLFlBQW9CLFFBQWlCO0FBQ3RGLFVBQU0sYUFBYSxLQUFLLFNBQVM7QUFDakMsVUFBTSxZQUFZLEtBQUssYUFBYTtBQUVwQyxVQUFNLGNBQWMsTUFBTSxLQUFLLGVBQWVBLE1BQUssQ0FBQyxFQUFFLFlBQVksT0FBTyxDQUFDLEdBQUcsS0FBSztBQUNsRixVQUFNLGFBQWEsY0FBYyxDQUFDO0FBQ2xDLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLGFBQU8sRUFBRSxZQUFZLFFBQVcsUUFBUSxVQUFVLGNBQWM7QUFBQSxJQUNqRTtBQUlBLFFBQUksQ0FBQyxXQUFXLFVBQVU7QUFDekIsVUFBSTtBQUNKLFlBQU0sWUFBWSxJQUFJLFFBQWMsYUFBVztBQUM5QyxtQkFBVyxXQUFXLHVCQUF1QixNQUFNO0FBQ2xELGNBQUksV0FBVyxVQUFVO0FBQ3hCLG9CQUFRO0FBQUEsVUFDVDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQyxHQUFHLEdBQUk7QUFDUixlQUFVLFFBQVE7QUFBQSxJQUNuQjtBQUdBLFFBQVc7QUFBWCxNQUFXSyxXQUFYO0FBRUMsTUFBQUEsY0FBQTtBQUVBLE1BQUFBLGNBQUE7QUFFQSxNQUFBQSxjQUFBO0FBRUEsTUFBQUEsY0FBQTtBQUFBLE9BUlU7QUFXWCxRQUFJLGFBQWEsVUFBVTtBQUMzQixRQUFJLFlBQVk7QUFDaEIsZUFBVyxhQUFhLFdBQVcsc0JBQXNCO0FBQ3hELFlBQU0sVUFBVSxXQUFXLFdBQVcsU0FBUztBQUMvQyxVQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsTUFDRDtBQUVBLFlBQU0sVUFBVSxRQUFRLGNBQWMsRUFBRSxPQUFPLE9BQUssRUFBRSxPQUFPO0FBQzdELFVBQUksWUFBWSw0QkFBMEI7QUFDekMsWUFBSSxVQUFVLGlCQUFpQixRQUFRLFNBQVMsVUFBVSxhQUFhLEdBQUc7QUFDekUsdUJBQWEsVUFBVTtBQUN2QixzQkFBWTtBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBRUEsVUFBSSxZQUFZLGlDQUErQjtBQUM5QyxjQUFNLG1CQUFtQixRQUFRLEtBQUssT0FBSztBQUMxQyxnQkFBTSxNQUFNLEVBQUUsaUJBQWlCO0FBQy9CLGlCQUFPLE9BQU8sS0FBSyxtQkFBbUIsT0FBTyxRQUFRLElBQUksT0FBTyxLQUFLTCxJQUFHO0FBQUEsUUFDekUsQ0FBQztBQUVELFlBQUksa0JBQWtCO0FBQ3JCLHVCQUFhO0FBQ2Isc0JBQVk7QUFBQSxRQUNiO0FBQUEsTUFDRDtBQUVBLFVBQUksWUFBWSxrQkFBZ0I7QUFDL0IscUJBQWEsUUFBUSxDQUFDO0FBQ3RCLG9CQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0Q7QUFFQSxXQUFPLEVBQUUsUUFBUSxZQUFZLFdBQVc7QUFBQSxFQUN6QztBQUNEO0FBaDVDYSxlQUFOO0FBQUEsRUFpQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBckRVO0FBazVDTixTQUFTLHFDQUFxQyxPQUFvQixZQUFxQyxRQUFrQixTQUF5QixjQUF3STtBQUNoUyxNQUFJLENBQUMsU0FBUztBQUNiLFFBQUksY0FBYyxRQUFRO0FBQ3pCLGdCQUFVLGFBQWEsV0FBVyxPQUFPLFVBQVUsT0FBUTtBQUFBLElBQzVELE9BQU87QUFDTixZQUFNLFdBQVcsTUFBTSxZQUFZO0FBQ25DLFlBQU0saUJBQWlCLFNBQVMsS0FBSyxPQUFLLEVBQUUsVUFBVSxNQUFNLE9BQU87QUFFbkUsZ0JBQVUsa0JBQWtCLFNBQVMsS0FBSyxPQUFLLE1BQU0sZ0JBQWdCLE1BQU0sY0FBYyxhQUFhLE1BQU0sU0FBUyxTQUFTLFNBQVMsQ0FBQyxJQUFJO0FBQUEsSUFDN0k7QUFBQSxFQUNEO0FBRUEsTUFBSSxDQUFDLFFBQVE7QUFDWixRQUFJLFlBQVk7QUFDZixlQUFTLFdBQVc7QUFBQSxJQUNyQixPQUFPO0FBQ04sWUFBTSxVQUFVLFVBQVUsUUFBUSxjQUFjLElBQUk7QUFDcEQsWUFBTSxnQkFBZ0IsV0FBVyxRQUFRLEtBQUssT0FBSyxFQUFFLE9BQU87QUFDNUQsZUFBUyxrQkFBa0IsV0FBVyxRQUFRLFNBQVMsUUFBUSxDQUFDLElBQUk7QUFBQSxJQUNyRTtBQUFBLEVBQ0Q7QUFFQSxNQUFJLENBQUMsY0FBYyxRQUFRO0FBQzFCLGlCQUFhLE9BQU8saUJBQWlCO0FBQUEsRUFDdEM7QUFFQSxTQUFPLEVBQUUsU0FBUyxRQUFRLFdBQVc7QUFDdEM7QUFFQSxlQUFlLHVCQUF1QixPQUFtQixTQUFvQyxNQUFnRTtBQUM1SixNQUFJLFNBQVM7QUFDWixVQUFNLEtBQUssT0FBTztBQUFBLEVBQ25CLE9BQU87QUFDTixVQUFNLFFBQVEsSUFBSSxNQUFNLFlBQVksRUFBRSxJQUFJLE9BQUssS0FBSyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ3hEO0FBQ0Q7IiwKICAibmFtZXMiOiBbInVyaSIsICJyZXN1bHQiLCAibWVzc2FnZSIsICJ3b3Jrc3BhY2UiLCAic2Vzc2lvbiIsICJTY29yZSJdCn0K
