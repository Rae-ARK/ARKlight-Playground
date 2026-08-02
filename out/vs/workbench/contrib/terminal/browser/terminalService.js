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
import * as domStylesheets from "../../../../base/browser/domStylesheets.js";
import * as cssValue from "../../../../base/browser/cssValue.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { debounce, memoize } from "../../../../base/common/decorators.js";
import { DynamicListEventMultiplexer, Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isMacintosh, isWeb } from "../../../../base/common/platform.js";
import { URI } from "../../../../base/common/uri.js";
import * as nls from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ITerminalLogService, TerminalExitReason, TerminalLocation, TerminalSettingId, TitleEventSource } from "../../../../platform/terminal/common/terminal.js";
import { formatMessageForTerminal } from "../../../../platform/terminal/common/terminalStrings.js";
import { iconForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { getIconRegistry } from "../../../../platform/theme/common/iconRegistry.js";
import { isDark } from "../../../../platform/theme/common/theme.js";
import { IThemeService, Themable } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { VirtualWorkspaceContext } from "../../../common/contextkeys.js";
import { ITerminalConfigurationService, ITerminalEditorService, ITerminalGroupService, ITerminalInstanceService, ITerminalService, TerminalConnectionState } from "./terminal.js";
import { getCwdForSplit } from "./terminalActions.js";
import { TerminalEditorInput } from "./terminalEditorInput.js";
import { getColorStyleContent, getUriClasses } from "./terminalIcon.js";
import { TerminalProfileQuickpick } from "./terminalProfileQuickpick.js";
import { getInstanceFromResource, getTerminalUri, parseTerminalUri } from "./terminalUri.js";
import { ITerminalProfileService } from "../common/terminal.js";
import { TerminalContextKeys } from "../common/terminalContextKey.js";
import { columnToEditorGroup } from "../../../services/editor/common/editorGroupColumn.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ILifecycleService, ShutdownReason, StartupKind } from "../../../services/lifecycle/common/lifecycle.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { XtermTerminal } from "./xterm/xtermTerminal.js";
import { TerminalInstance } from "./terminalInstance.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { TerminalCapabilityStore } from "../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { mark } from "../../../../base/common/performance.js";
import { DetachedTerminal } from "./detachedTerminal.js";
import { TerminalCapability } from "../../../../platform/terminal/common/capabilities/capabilities.js";
import { createInstanceCapabilityEventMultiplexer } from "./terminalEvents.js";
import { isAuxiliaryWindow, mainWindow } from "../../../../base/browser/window.js";
import { getActiveWindow } from "../../../../base/browser/dom.js";
import { hasKey, isString } from "../../../../base/common/types.js";
let TerminalService = class extends Disposable {
  constructor(_contextKeyService, _lifecycleService, _logService, _dialogService, _instantiationService, _remoteAgentService, _configurationService, _environmentService, _terminalConfigurationService, _terminalEditorService, _terminalGroupService, _terminalInstanceService, _editorGroupsService, _terminalProfileService, _extensionService, _notificationService, _workspaceContextService, _commandService, _keybindingService, _timerService, _themeService) {
    super();
    this._contextKeyService = _contextKeyService;
    this._lifecycleService = _lifecycleService;
    this._logService = _logService;
    this._dialogService = _dialogService;
    this._instantiationService = _instantiationService;
    this._remoteAgentService = _remoteAgentService;
    this._configurationService = _configurationService;
    this._environmentService = _environmentService;
    this._terminalConfigurationService = _terminalConfigurationService;
    this._terminalEditorService = _terminalEditorService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalInstanceService = _terminalInstanceService;
    this._editorGroupsService = _editorGroupsService;
    this._terminalProfileService = _terminalProfileService;
    this._extensionService = _extensionService;
    this._notificationService = _notificationService;
    this._workspaceContextService = _workspaceContextService;
    this._commandService = _commandService;
    this._keybindingService = _keybindingService;
    this._timerService = _timerService;
    this._themeService = _themeService;
    this._hostActiveTerminals = /* @__PURE__ */ new Map();
    this._detachedXterms = /* @__PURE__ */ new Set();
    this._detachedListenersRegistered = false;
    this._isShuttingDown = false;
    this._backgroundedTerminalInstances = [];
    this._backgroundedTerminalDisposables = this._register(new DisposableMap());
    this._connectionState = TerminalConnectionState.Connecting;
    this._whenConnected = new DeferredPromise();
    this._restoredGroupCount = 0;
    this._reconnectedTerminals = /* @__PURE__ */ new Map();
    this._onDidCreateInstance = this._register(new Emitter());
    this._onDidChangeInstanceDimensions = this._register(new Emitter());
    this._onDidRegisterProcessSupport = this._register(new Emitter());
    this._onDidChangeConnectionState = this._register(new Emitter());
    this._onDidRequestStartExtensionTerminal = this._register(new Emitter());
    // ITerminalInstanceHost events
    this._onDidDisposeInstance = this._register(new Emitter());
    this._onDidFocusInstance = this._register(new Emitter());
    this._onDidChangeActiveInstance = this._register(new Emitter());
    this._onDidChangeInstances = this._register(new Emitter());
    this._onDidChangeInstanceCapability = this._register(new Emitter());
    // Terminal view events
    this._onDidChangeActiveGroup = this._register(new Emitter());
    this._register(this.onDidCreateInstance(() => this._terminalProfileService.refreshAvailableProfiles()));
    this._forwardInstanceHostEvents(this._terminalGroupService);
    this._forwardInstanceHostEvents(this._terminalEditorService);
    this._register(this._terminalGroupService.onDidChangeActiveGroup(this._onDidChangeActiveGroup.fire, this._onDidChangeActiveGroup));
    this._register(this._terminalInstanceService.onDidCreateInstance((instance) => {
      this._initInstanceListeners(instance);
      this._onDidCreateInstance.fire(instance);
    }));
    this._register(this._terminalGroupService.onDidChangeActiveInstance((instance) => {
      if (!instance && !this._isShuttingDown && this._terminalConfigurationService.config.hideOnLastClosed) {
        this._terminalGroupService.hidePanel();
      }
      if (instance?.shellType) {
        this._terminalShellTypeContextKey.set(instance.shellType.toString());
      } else if (!instance || !instance.shellType) {
        this._terminalShellTypeContextKey.reset();
      }
    }));
    this._handleInstanceContextKeys();
    this._terminalShellTypeContextKey = TerminalContextKeys.shellType.bindTo(this._contextKeyService);
    this._processSupportContextKey = TerminalContextKeys.processSupported.bindTo(this._contextKeyService);
    this._processSupportContextKey.set(!isWeb || this._remoteAgentService.getConnection() !== null);
    this._terminalHasBeenCreated = TerminalContextKeys.terminalHasBeenCreated.bindTo(this._contextKeyService);
    this._terminalCountContextKey = TerminalContextKeys.count.bindTo(this._contextKeyService);
    this._register(_lifecycleService.onBeforeShutdown(async (e) => e.veto(this._onBeforeShutdown(e.reason), "veto.terminal")));
    this._register(_lifecycleService.onWillShutdown((e) => this._onWillShutdown(e)));
    this._initializePrimaryBackend();
    timeout(0).then(() => this._register(this._instantiationService.createInstance(TerminalEditorStyle, mainWindow.document.head)));
  }
  get isProcessSupportRegistered() {
    return !!this._processSupportContextKey.get();
  }
  get connectionState() {
    return this._connectionState;
  }
  get whenConnected() {
    return this._whenConnected.p;
  }
  get restoredGroupCount() {
    return this._restoredGroupCount;
  }
  get instances() {
    return this._terminalGroupService.instances.concat(this._terminalEditorService.instances).concat(this._backgroundedTerminalInstances.map((bg) => bg.instance));
  }
  /** Gets all non-background terminals. */
  get foregroundInstances() {
    return this._terminalGroupService.instances.concat(this._terminalEditorService.instances);
  }
  get detachedInstances() {
    return this._detachedXterms;
  }
  getReconnectedTerminals(reconnectionOwner) {
    return this._reconnectedTerminals.get(reconnectionOwner);
  }
  get activeInstance() {
    for (const activeHostTerminal of this._hostActiveTerminals.values()) {
      if (activeHostTerminal?.hasFocus) {
        return activeHostTerminal;
      }
    }
    return this._activeInstance;
  }
  get onDidCreateInstance() {
    return this._onDidCreateInstance.event;
  }
  get onDidChangeInstanceDimensions() {
    return this._onDidChangeInstanceDimensions.event;
  }
  get onDidRegisterProcessSupport() {
    return this._onDidRegisterProcessSupport.event;
  }
  get onDidChangeConnectionState() {
    return this._onDidChangeConnectionState.event;
  }
  get onDidRequestStartExtensionTerminal() {
    return this._onDidRequestStartExtensionTerminal.event;
  }
  get onDidDisposeInstance() {
    return this._onDidDisposeInstance.event;
  }
  get onDidFocusInstance() {
    return this._onDidFocusInstance.event;
  }
  get onDidChangeActiveInstance() {
    return this._onDidChangeActiveInstance.event;
  }
  get onDidChangeInstances() {
    return this._onDidChangeInstances.event;
  }
  get onDidChangeInstanceCapability() {
    return this._onDidChangeInstanceCapability.event;
  }
  get onDidChangeActiveGroup() {
    return this._onDidChangeActiveGroup.event;
  }
  get onAnyInstanceData() {
    return this._register(this.createOnInstanceEvent((instance) => Event.map(instance.onData, (data) => ({ instance, data })))).event;
  }
  get onAnyInstanceDataInput() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.onDidInputData, () => e, e.store))).event;
  }
  get onAnyInstanceIconChange() {
    return this._register(this.createOnInstanceEvent((e) => e.onIconChanged)).event;
  }
  get onAnyInstanceMaximumDimensionsChange() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.onMaximumDimensionsChanged, () => e, e.store))).event;
  }
  get onAnyInstancePrimaryStatusChange() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.statusList.onDidChangePrimaryStatus, () => e, e.store))).event;
  }
  get onAnyInstanceProcessIdReady() {
    return this._register(this.createOnInstanceEvent((e) => e.onProcessIdReady)).event;
  }
  get onAnyInstanceSelectionChange() {
    return this._register(this.createOnInstanceEvent((e) => e.onDidChangeSelection)).event;
  }
  get onAnyInstanceTitleChange() {
    return this._register(this.createOnInstanceEvent((e) => e.onTitleChanged)).event;
  }
  get onAnyInstanceShellTypeChanged() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.onDidChangeShellType, () => e))).event;
  }
  get onAnyInstanceAddedCapabilityType() {
    return this._register(this.createOnInstanceEvent((e) => Event.map(e.capabilities.onDidAddCapability, (e2) => e2.id))).event;
  }
  async showProfileQuickPick(type, cwd) {
    const quickPick = this._instantiationService.createInstance(TerminalProfileQuickpick);
    const result = await quickPick.showAndGetResult(type);
    if (!result) {
      return;
    }
    if (isString(result)) {
      return;
    }
    const keyMods = result.keyMods;
    if (type === "createInstance") {
      const activeInstance = this.getDefaultInstanceHost().activeInstance;
      const defaultLocation = this._terminalConfigurationService.defaultLocation;
      let instance;
      if (result.config && hasKey(result.config, { id: true })) {
        await this.createContributedTerminalProfile(result.config.extensionIdentifier, result.config.id, {
          icon: result.config.options?.icon,
          color: result.config.options?.color,
          location: !!(keyMods?.alt && activeInstance) ? { splitActiveTerminal: true } : defaultLocation,
          titleTemplate: result.config.titleTemplate
        });
        return;
      } else if (result.config && hasKey(result.config, { profileName: true })) {
        if (keyMods?.alt && activeInstance) {
          instance = await this.createTerminal({ location: { parentTerminal: activeInstance }, config: result.config, cwd });
        } else {
          instance = await this.createTerminal({ location: defaultLocation, config: result.config, cwd });
        }
      }
      if (instance && defaultLocation !== TerminalLocation.Editor) {
        this._terminalGroupService.showPanel(true);
        this.setActiveInstance(instance);
        return instance;
      }
    }
    return void 0;
  }
  async _initializePrimaryBackend() {
    mark("code/terminal/willGetTerminalBackend");
    this._primaryBackend = await this._terminalInstanceService.getBackend(this._environmentService.remoteAuthority);
    mark("code/terminal/didGetTerminalBackend");
    const enableTerminalReconnection = this._terminalConfigurationService.config.enablePersistentSessions;
    this._connectionState = TerminalConnectionState.Connecting;
    const isPersistentRemote = !!this._environmentService.remoteAuthority && enableTerminalReconnection;
    if (this._primaryBackend) {
      this._register(this._primaryBackend.onDidRequestDetach(async (e) => {
        const instanceToDetach = this.getInstanceFromResource(getTerminalUri(e.workspaceId, e.instanceId));
        if (instanceToDetach) {
          const persistentProcessId = instanceToDetach?.persistentProcessId;
          if (persistentProcessId && !instanceToDetach.shellLaunchConfig.isFeatureTerminal && !instanceToDetach.shellLaunchConfig.customPtyImplementation) {
            if (instanceToDetach.target === TerminalLocation.Editor) {
              this._terminalEditorService.detachInstance(instanceToDetach);
            } else {
              this._terminalGroupService.getGroupForInstance(instanceToDetach)?.removeInstance(instanceToDetach);
            }
            await instanceToDetach.detachProcessAndDispose(TerminalExitReason.User);
            await this._primaryBackend?.acceptDetachInstanceReply(e.requestId, persistentProcessId);
          } else {
            await this._primaryBackend?.acceptDetachInstanceReply(e.requestId, void 0);
          }
        }
      }));
    }
    mark("code/terminal/willReconnect");
    let reconnectedPromise;
    if (isPersistentRemote) {
      reconnectedPromise = this._reconnectToRemoteTerminals();
    } else if (enableTerminalReconnection) {
      reconnectedPromise = this._reconnectToLocalTerminals();
    } else {
      reconnectedPromise = Promise.resolve();
    }
    reconnectedPromise.then(async () => {
      this._setConnected();
      mark("code/terminal/didReconnect");
      mark("code/terminal/willReplay");
      const instances = await this._reconnectedTerminalGroups?.then((groups) => groups.map((e) => e.terminalInstances).flat()) ?? [];
      await Promise.all(instances.map((e) => new Promise((r) => Event.once(e.onProcessReplayComplete)(r))));
      mark("code/terminal/didReplay");
      mark("code/terminal/willGetPerformanceMarks");
      await Promise.all(Array.from(this._terminalInstanceService.getRegisteredBackends()).map(async (backend) => {
        this._timerService.setPerformanceMarks(backend.remoteAuthority === void 0 ? "localPtyHost" : "remotePtyHost", await backend.getPerformanceMarks());
        backend.setReady();
      }));
      mark("code/terminal/didGetPerformanceMarks");
      this._whenConnected.complete();
    });
  }
  getPrimaryBackend() {
    return this._primaryBackend;
  }
  async setNextCommandId(id, commandLine, commandId) {
    if (!this._primaryBackend || id <= 0) {
      return;
    }
    await this._primaryBackend.setNextCommandId(id, commandLine, commandId);
  }
  _forwardInstanceHostEvents(host) {
    this._register(host.onDidChangeInstances(this._onDidChangeInstances.fire, this._onDidChangeInstances));
    this._register(host.onDidDisposeInstance(this._onDidDisposeInstance.fire, this._onDidDisposeInstance));
    this._register(host.onDidChangeActiveInstance((instance) => this._evaluateActiveInstance(host, instance)));
    this._register(host.onDidFocusInstance((instance) => {
      this._onDidFocusInstance.fire(instance);
      this._evaluateActiveInstance(host, instance);
    }));
    this._register(host.onDidChangeInstanceCapability((instance) => {
      this._onDidChangeInstanceCapability.fire(instance);
    }));
    this._hostActiveTerminals.set(host, void 0);
  }
  _evaluateActiveInstance(host, instance) {
    this._hostActiveTerminals.set(host, instance);
    if (instance === void 0) {
      for (const active of this._hostActiveTerminals.values()) {
        if (active) {
          instance = active;
        }
      }
    }
    this._activeInstance = instance;
    this._onDidChangeActiveInstance.fire(instance);
  }
  setActiveInstance(value) {
    if (!value) {
      return;
    }
    if (value.shellLaunchConfig.hideFromUser) {
      this.showBackgroundTerminal(value);
    }
    if (value.target === TerminalLocation.Editor) {
      this._terminalEditorService.setActiveInstance(value);
    } else {
      this._terminalGroupService.setActiveInstance(value);
    }
  }
  async focusInstance(instance) {
    if (this._activeInstance !== instance) {
      this.setActiveInstance(instance);
    }
    if (instance.target === TerminalLocation.Editor) {
      await this._terminalEditorService.focusInstance(instance);
      return;
    }
    await this._terminalGroupService.focusInstance(instance);
  }
  async focusActiveInstance() {
    if (!this._activeInstance) {
      return;
    }
    return this.focusInstance(this._activeInstance);
  }
  async createContributedTerminalProfile(extensionIdentifier, id, options) {
    await this._extensionService.activateByEvent(`onTerminalProfile:${id}`);
    const profileProvider = this._terminalProfileService.getContributedProfileProvider(extensionIdentifier, id);
    if (!profileProvider) {
      this._notificationService.error(`No terminal profile provider registered for id "${id}"`);
      return;
    }
    try {
      await profileProvider.createContributedTerminalProfile(options);
      this._terminalGroupService.setActiveInstanceByIndex(this._terminalGroupService.instances.length - 1);
      await this._terminalGroupService.activeInstance?.focusWhenReady();
    } catch (e) {
      this._notificationService.error(e.message);
    }
  }
  async safeDisposeTerminal(instance) {
    if (instance.target !== TerminalLocation.Editor && instance.hasChildProcesses && (this._terminalConfigurationService.config.confirmOnKill === "panel" || this._terminalConfigurationService.config.confirmOnKill === "always")) {
      const veto = await this._showTerminalCloseConfirmation(true);
      if (veto) {
        return;
      }
    }
    return new Promise((r) => {
      Event.once(instance.onExit)(() => r());
      instance.dispose(TerminalExitReason.User);
    });
  }
  _setConnected() {
    this._connectionState = TerminalConnectionState.Connected;
    this._onDidChangeConnectionState.fire();
    this._logService.trace("Pty host ready");
  }
  async _reconnectToRemoteTerminals() {
    const remoteAuthority = this._environmentService.remoteAuthority;
    if (!remoteAuthority) {
      return;
    }
    const backend = await this._terminalInstanceService.getBackend(remoteAuthority);
    if (!backend) {
      return;
    }
    mark("code/terminal/willGetTerminalLayoutInfo");
    const layoutInfo = await backend.getTerminalLayoutInfo();
    mark("code/terminal/didGetTerminalLayoutInfo");
    backend.reduceConnectionGraceTime();
    mark("code/terminal/willRecreateTerminalGroups");
    await this._recreateTerminalGroups(layoutInfo);
    mark("code/terminal/didRecreateTerminalGroups");
    this._attachProcessLayoutListeners();
    this._logService.trace("Reconnected to remote terminals");
  }
  async _reconnectToLocalTerminals() {
    const localBackend = await this._terminalInstanceService.getBackend();
    if (!localBackend) {
      return;
    }
    mark("code/terminal/willGetTerminalLayoutInfo");
    const layoutInfo = await localBackend.getTerminalLayoutInfo();
    mark("code/terminal/didGetTerminalLayoutInfo");
    if (layoutInfo && (layoutInfo.tabs.length > 0 || layoutInfo?.background?.length)) {
      mark("code/terminal/willRecreateTerminalGroups");
      this._reconnectedTerminalGroups = this._recreateTerminalGroups(layoutInfo);
      const revivedInstances = await this._reviveBackgroundTerminalInstances(layoutInfo.background || []);
      this._backgroundedTerminalInstances = revivedInstances.map((instance) => ({ instance }));
      mark("code/terminal/didRecreateTerminalGroups");
    }
    this._attachProcessLayoutListeners();
    this._logService.trace("Reconnected to local terminals");
  }
  _recreateTerminalGroups(layoutInfo) {
    const groupPromises = [];
    let activeGroup;
    if (layoutInfo) {
      for (const tabLayout of layoutInfo.tabs) {
        const terminalLayouts = tabLayout.terminals.filter((t) => t.terminal && t.terminal.isOrphan);
        if (terminalLayouts.length) {
          this._restoredGroupCount += terminalLayouts.length;
          const promise = this._recreateTerminalGroup(tabLayout, terminalLayouts);
          groupPromises.push(promise);
          if (tabLayout.isActive) {
            activeGroup = promise;
          }
          const activeInstance = this.instances.find((t) => t.shellLaunchConfig.attachPersistentProcess?.id === tabLayout.activePersistentProcessId);
          if (activeInstance) {
            this.setActiveInstance(activeInstance);
          }
        }
      }
      if (layoutInfo.tabs.length) {
        activeGroup?.then((group) => this._terminalGroupService.activeGroup = group);
      }
    }
    return Promise.all(groupPromises).then((result) => result.filter((e) => !!e));
  }
  async _reviveBackgroundTerminalInstances(bgTerminals) {
    const instances = [];
    for (const bg of bgTerminals) {
      const attachPersistentProcess = bg;
      if (!attachPersistentProcess) {
        continue;
      }
      const instance = await this.createTerminal({ config: { attachPersistentProcess, hideFromUser: true, forcePersist: true }, location: TerminalLocation.Panel });
      instances.push(instance);
    }
    return instances;
  }
  async _recreateTerminalGroup(tabLayout, terminalLayouts) {
    let lastInstance;
    for (const terminalLayout of terminalLayouts) {
      const attachPersistentProcess = terminalLayout.terminal;
      if (this._lifecycleService.startupKind !== StartupKind.ReloadedWindow && attachPersistentProcess.type === "Task") {
        continue;
      }
      mark(`code/terminal/willRecreateTerminal/${attachPersistentProcess.id}-${attachPersistentProcess.pid}`);
      lastInstance = this.createTerminal({
        config: { attachPersistentProcess },
        location: lastInstance ? { parentTerminal: lastInstance } : TerminalLocation.Panel
      });
      lastInstance.then(() => mark(`code/terminal/didRecreateTerminal/${attachPersistentProcess.id}-${attachPersistentProcess.pid}`));
    }
    const group = lastInstance?.then((instance) => {
      const g = this._terminalGroupService.getGroupForInstance(instance);
      g?.resizePanes(tabLayout.terminals.map((terminal) => terminal.relativeSize));
      return g;
    });
    return group;
  }
  _attachProcessLayoutListeners() {
    this._register(this.onDidChangeActiveGroup(() => this._saveState()));
    this._register(this.onDidChangeActiveInstance(() => this._saveState()));
    this._register(this.onDidChangeInstances(() => this._saveState()));
    this._register(this.onAnyInstanceProcessIdReady(() => this._saveState()));
    this._register(this.onAnyInstanceTitleChange((instance) => this._updateTitle(instance)));
    this._register(this.onAnyInstanceIconChange((e) => this._updateIcon(e.instance, e.userInitiated)));
  }
  _handleInstanceContextKeys() {
    const terminalIsOpenContext = TerminalContextKeys.isOpen.bindTo(this._contextKeyService);
    const updateTerminalContextKeys = () => {
      terminalIsOpenContext.set(this.instances.length > 0);
      this._terminalCountContextKey.set(this.instances.length);
    };
    this._register(this.onDidChangeInstances(() => updateTerminalContextKeys()));
  }
  async getActiveOrCreateInstance(options) {
    const activeInstance = this.activeInstance;
    if (!activeInstance) {
      return this.createTerminal();
    }
    if (!options?.acceptsInput || activeInstance.xterm?.isStdinDisabled !== true) {
      return activeInstance;
    }
    const instance = await this.createTerminal();
    this.setActiveInstance(instance);
    await this.revealActiveTerminal();
    return instance;
  }
  async revealTerminal(source, preserveFocus) {
    if (source.target === TerminalLocation.Editor) {
      await this._terminalEditorService.revealActiveEditor(preserveFocus);
    } else {
      await this._terminalGroupService.showPanel();
    }
  }
  async revealActiveTerminal(preserveFocus) {
    const instance = this.activeInstance;
    if (!instance) {
      return;
    }
    await this.revealTerminal(instance, preserveFocus);
  }
  requestStartExtensionTerminal(proxy, cols, rows) {
    return new Promise((callback) => {
      this._onDidRequestStartExtensionTerminal.fire({ proxy, cols, rows, callback });
    });
  }
  _onBeforeShutdown(reason) {
    if (isWeb) {
      this._isShuttingDown = true;
      return false;
    }
    return this._onBeforeShutdownAsync(reason);
  }
  async _onBeforeShutdownAsync(reason) {
    if (this.instances.length === 0) {
      return false;
    }
    try {
      this._shutdownWindowCount = await this._nativeDelegate?.getWindowCount();
      const shouldReviveProcesses = this._shouldReviveProcesses(reason);
      if (shouldReviveProcesses) {
        await Promise.race([
          this._primaryBackend?.persistTerminalState(),
          timeout(2e3)
        ]);
      }
      const shouldPersistProcesses = this._terminalConfigurationService.config.enablePersistentSessions && reason === ShutdownReason.RELOAD;
      if (!shouldPersistProcesses) {
        const hasDirtyInstances = this._terminalConfigurationService.config.confirmOnExit === "always" && this.foregroundInstances.length > 0 || this._terminalConfigurationService.config.confirmOnExit === "hasChildProcesses" && this.foregroundInstances.some((e) => e.hasChildProcesses);
        if (hasDirtyInstances) {
          return this._onBeforeShutdownConfirmation(reason);
        }
      }
    } catch (err) {
      this._logService.warn("Exception occurred during terminal shutdown", err);
    }
    this._isShuttingDown = true;
    return false;
  }
  setNativeDelegate(nativeDelegate) {
    this._nativeDelegate = nativeDelegate;
  }
  _shouldReviveProcesses(reason) {
    if (!this._terminalConfigurationService.config.enablePersistentSessions) {
      return false;
    }
    switch (this._terminalConfigurationService.config.persistentSessionReviveProcess) {
      case "onExit": {
        if (reason === ShutdownReason.CLOSE && (this._shutdownWindowCount === 1 && !isMacintosh)) {
          return true;
        }
        return reason === ShutdownReason.LOAD || reason === ShutdownReason.QUIT;
      }
      case "onExitAndWindowClose":
        return reason !== ShutdownReason.RELOAD;
      default:
        return false;
    }
  }
  async _onBeforeShutdownConfirmation(reason) {
    const veto = await this._showTerminalCloseConfirmation();
    if (!veto) {
      this._isShuttingDown = true;
    }
    return veto;
  }
  _onWillShutdown(e) {
    const shouldPersistTerminals = this._terminalConfigurationService.config.enablePersistentSessions && e.reason === ShutdownReason.RELOAD;
    for (const instance of [...this._terminalGroupService.instances, ...this._backgroundedTerminalInstances.map((bg) => bg.instance)]) {
      if (shouldPersistTerminals && instance.shouldPersist) {
        instance.detachProcessAndDispose(TerminalExitReason.Shutdown);
      } else {
        instance.dispose(TerminalExitReason.Shutdown);
      }
    }
    if (!shouldPersistTerminals && !this._shouldReviveProcesses(e.reason)) {
      this._primaryBackend?.setTerminalLayoutInfo(void 0);
    }
  }
  _saveState() {
    if (this._isShuttingDown) {
      return;
    }
    if (!this._terminalConfigurationService.config.enablePersistentSessions) {
      return;
    }
    const tabs = this._terminalGroupService.groups.map((g) => g.getLayoutInfo(g === this._terminalGroupService.activeGroup));
    const state = { tabs, background: this._backgroundedTerminalInstances.map((bg) => bg.instance).filter((i) => i.shellLaunchConfig.forcePersist).map((i) => i.persistentProcessId).filter((e) => e !== void 0) };
    this._primaryBackend?.setTerminalLayoutInfo(state);
  }
  _updateTitle(instance) {
    if (!this._terminalConfigurationService.config.enablePersistentSessions || !instance || instance.shellLaunchConfig.customPtyImplementation || !instance.persistentProcessId || !instance.title || instance.isDisposed) {
      return;
    }
    if (instance.staticTitle) {
      this._primaryBackend?.updateTitle(instance.persistentProcessId, instance.staticTitle, TitleEventSource.Api);
    } else {
      this._primaryBackend?.updateTitle(instance.persistentProcessId, instance.title, instance.titleSource);
    }
  }
  _updateIcon(instance, userInitiated) {
    if (!this._terminalConfigurationService.config.enablePersistentSessions || !instance || instance.shellLaunchConfig.customPtyImplementation || !instance.persistentProcessId || !instance.icon || instance.isDisposed) {
      return;
    }
    this._primaryBackend?.updateIcon(instance.persistentProcessId, userInitiated, instance.icon, instance.color);
  }
  refreshActiveGroup() {
    this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
  }
  getInstanceFromId(terminalId) {
    let bgIndex = -1;
    this._backgroundedTerminalInstances.forEach((bg, i) => {
      if (bg.instance.instanceId === terminalId) {
        bgIndex = i;
      }
    });
    if (bgIndex !== -1) {
      return this._backgroundedTerminalInstances[bgIndex].instance;
    }
    try {
      return this.instances[this._getIndexFromId(terminalId)];
    } catch {
      return void 0;
    }
  }
  getInstanceFromResource(resource) {
    return getInstanceFromResource(this.instances, resource);
  }
  openResource(resource) {
    const instance = this.getInstanceFromResource(resource);
    if (instance) {
      this.setActiveInstance(instance);
      this.revealTerminal(instance);
      const commands = instance.capabilities.get(TerminalCapability.CommandDetection)?.commands;
      const params = new URLSearchParams(resource.query);
      const relevantCommand = commands?.find((c) => c.id === params.get("command"));
      if (relevantCommand) {
        instance.xterm?.markTracker.revealCommand(relevantCommand);
      }
    }
  }
  isAttachedToTerminal(remoteTerm) {
    return this.instances.some((term) => term.processId === remoteTerm.pid);
  }
  moveToEditor(source, group) {
    if (source.target === TerminalLocation.Editor) {
      return;
    }
    const sourceGroup = this._terminalGroupService.getGroupForInstance(source);
    if (!sourceGroup) {
      return;
    }
    sourceGroup.removeInstance(source);
    this._terminalEditorService.openEditor(source, group ? { viewColumn: group } : void 0);
  }
  moveIntoNewEditor(source) {
    this.moveToEditor(source, AUX_WINDOW_GROUP);
  }
  async moveToTerminalView(source, target, side) {
    if (URI.isUri(source)) {
      source = this.getInstanceFromResource(source);
    }
    if (!source) {
      return;
    }
    this._terminalEditorService.detachInstance(source);
    if (source.target !== TerminalLocation.Editor) {
      await this._terminalGroupService.showPanel(true);
      return;
    }
    source.target = TerminalLocation.Panel;
    let group;
    if (target) {
      group = this._terminalGroupService.getGroupForInstance(target);
    }
    if (!group) {
      group = this._terminalGroupService.createGroup();
    }
    group.addInstance(source);
    this.setActiveInstance(source);
    await this._terminalGroupService.showPanel(true);
    if (target && side) {
      const index = group.terminalInstances.indexOf(target) + (side === "after" ? 1 : 0);
      group.moveInstance(source, index, side);
    }
    this._onDidChangeInstances.fire();
    this._onDidChangeActiveGroup.fire(this._terminalGroupService.activeGroup);
  }
  _initInstanceListeners(instance) {
    const instanceDisposables = new DisposableStore();
    instanceDisposables.add(instance.onDimensionsChanged(() => {
      this._onDidChangeInstanceDimensions.fire(instance);
      if (this._terminalConfigurationService.config.enablePersistentSessions && this.isProcessSupportRegistered) {
        this._saveState();
      }
    }));
    instanceDisposables.add(instance.onDidFocus(this._onDidChangeActiveInstance.fire, this._onDidChangeActiveInstance));
    instanceDisposables.add(instance.onRequestAddInstanceToGroup(async (e) => await this._addInstanceToGroup(instance, e)));
    instanceDisposables.add(instance.onDidChangeShellType(() => this._extensionService.activateByEvent(`onTerminal:${instance.shellType}`)));
    instanceDisposables.add(Event.runAndSubscribe(instance.capabilities.onDidAddCapability, (() => {
      if (instance.capabilities.has(TerminalCapability.CommandDetection)) {
        this._extensionService.activateByEvent(`onTerminalShellIntegration:${instance.shellType}`);
      }
    })));
    const disposeListener = this._register(instance.onDisposed(() => {
      instanceDisposables.dispose();
      this._store.delete(disposeListener);
    }));
  }
  async _addInstanceToGroup(instance, e) {
    const terminalIdentifier = parseTerminalUri(e.uri);
    if (terminalIdentifier.instanceId === void 0) {
      return;
    }
    let sourceInstance = this.getInstanceFromResource(e.uri);
    if (!sourceInstance) {
      const attachPersistentProcess = await this._primaryBackend?.requestDetachInstance(terminalIdentifier.workspaceId, terminalIdentifier.instanceId);
      if (attachPersistentProcess) {
        sourceInstance = await this.createTerminal({ config: { attachPersistentProcess }, resource: e.uri });
        this._terminalGroupService.moveInstance(sourceInstance, instance, e.side);
        return;
      }
    }
    sourceInstance = this._terminalGroupService.getInstanceFromResource(e.uri);
    if (sourceInstance) {
      this._terminalGroupService.moveInstance(sourceInstance, instance, e.side);
      return;
    }
    sourceInstance = this._terminalEditorService.getInstanceFromResource(e.uri);
    if (sourceInstance) {
      this.moveToTerminalView(sourceInstance, instance, e.side);
      return;
    }
    return;
  }
  registerProcessSupport(isSupported) {
    if (!isSupported) {
      return;
    }
    this._processSupportContextKey.set(isSupported);
    this._onDidRegisterProcessSupport.fire();
  }
  // TODO: Remove this, it should live in group/editor servioce
  _getIndexFromId(terminalId) {
    let terminalIndex = -1;
    this.instances.forEach((terminalInstance, i) => {
      if (terminalInstance.instanceId === terminalId) {
        terminalIndex = i;
      }
    });
    if (terminalIndex === -1) {
      throw new Error(`Terminal with ID ${terminalId} does not exist (has it already been disposed?)`);
    }
    return terminalIndex;
  }
  async _showTerminalCloseConfirmation(singleTerminal) {
    let message;
    const foregroundInstances = this.foregroundInstances;
    if (foregroundInstances.length === 1 || singleTerminal) {
      message = nls.localize("terminalService.terminalCloseConfirmationSingular", "Do you want to terminate the active terminal session?");
    } else {
      message = nls.localize("terminalService.terminalCloseConfirmationPlural", "Do you want to terminate the {0} active terminal sessions?", foregroundInstances.length);
    }
    const { confirmed } = await this._dialogService.confirm({
      type: "warning",
      message,
      primaryButton: nls.localize({ key: "terminate", comment: ["&& denotes a mnemonic"] }, "&&Terminate")
    });
    return !confirmed;
  }
  getDefaultInstanceHost() {
    if (this._terminalConfigurationService.defaultLocation === TerminalLocation.Editor) {
      return this._terminalEditorService;
    }
    return this._terminalGroupService;
  }
  async getInstanceHost(location) {
    if (location) {
      if (location === TerminalLocation.Editor) {
        return this._terminalEditorService;
      } else if (typeof location === "object") {
        if (hasKey(location, { viewColumn: true })) {
          return this._terminalEditorService;
        } else if (hasKey(location, { parentTerminal: true })) {
          return (await location.parentTerminal).target === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
        }
      } else {
        return this._terminalGroupService;
      }
    }
    return this;
  }
  async createTerminal(options) {
    const isLocalInRemoteTerminal = this._remoteAgentService.getConnection() && URI.isUri(options?.cwd) && options?.cwd.scheme === Schemas.file;
    if (this._terminalProfileService.availableProfiles.length === 0) {
      const isPtyTerminal = options?.config && hasKey(options.config, { customPtyImplementation: true });
      if (!isPtyTerminal && !isLocalInRemoteTerminal) {
        if (this._connectionState === TerminalConnectionState.Connecting) {
          mark(`code/terminal/willGetProfiles`);
        }
        await this._terminalProfileService.profilesReady;
        if (this._connectionState === TerminalConnectionState.Connecting) {
          mark(`code/terminal/didGetProfiles`);
        }
      }
    }
    let config = options?.config;
    if (!config && isLocalInRemoteTerminal) {
      const backend = await this._terminalInstanceService.getBackend(void 0);
      const executable = await backend?.getDefaultSystemShell();
      if (executable) {
        config = { executable };
      }
    }
    if (!config) {
      config = this._terminalProfileService.getDefaultProfile();
    }
    const shellLaunchConfig = config && hasKey(config, { extensionIdentifier: true }) ? {} : this._terminalInstanceService.convertProfileToShellLaunchConfig(config || {});
    const contributedProfile = options?.skipContributedProfileCheck ? void 0 : await this._getContributedProfile(shellLaunchConfig, options);
    const splitActiveTerminal = typeof options?.location === "object" && hasKey(options.location, { splitActiveTerminal: true }) ? options.location.splitActiveTerminal : typeof options?.location === "object" ? hasKey(options.location, { parentTerminal: true }) : false;
    await this._resolveCwd(shellLaunchConfig, splitActiveTerminal, options);
    if (!shellLaunchConfig.customPtyImplementation && contributedProfile) {
      const resolvedLocation = await this.resolveLocation(options?.location);
      let location2;
      if (splitActiveTerminal) {
        location2 = resolvedLocation === TerminalLocation.Editor ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
      } else {
        location2 = typeof options?.location === "object" && hasKey(options.location, { viewColumn: true }) ? options.location : resolvedLocation;
      }
      await this.createContributedTerminalProfile(contributedProfile.extensionIdentifier, contributedProfile.id, {
        icon: contributedProfile.icon,
        color: contributedProfile.color,
        location: location2,
        cwd: shellLaunchConfig.cwd,
        titleTemplate: contributedProfile.titleTemplate
      });
      const instanceHost = resolvedLocation === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
      const instance2 = instanceHost.instances[instanceHost.instances.length - 1];
      await instance2?.focusWhenReady();
      this._terminalHasBeenCreated.set(true);
      return instance2;
    }
    if (!shellLaunchConfig.customPtyImplementation && !this.isProcessSupportRegistered) {
      const resolvedLocation = await this.resolveLocation(options?.location);
      let location2;
      if (splitActiveTerminal) {
        location2 = resolvedLocation === TerminalLocation.Editor ? { viewColumn: SIDE_GROUP } : { splitActiveTerminal: true };
      } else {
        location2 = typeof options?.location === "object" && hasKey(options.location, { viewColumn: true }) ? options.location : resolvedLocation;
      }
      const instanceHost = resolvedLocation === TerminalLocation.Editor ? this._terminalEditorService : this._terminalGroupService;
      for (const fallbackProfile of this._terminalProfileService.contributedProfiles) {
        const instanceCount = instanceHost.instances.length;
        await this.createContributedTerminalProfile(fallbackProfile.extensionIdentifier, fallbackProfile.id, {
          icon: fallbackProfile.icon,
          color: fallbackProfile.color,
          location: location2,
          cwd: shellLaunchConfig.cwd,
          titleTemplate: fallbackProfile.titleTemplate
        });
        const instance2 = instanceHost.instances[instanceCount];
        if (!instance2) {
          continue;
        }
        await instance2.focusWhenReady();
        this._terminalHasBeenCreated.set(true);
        return instance2;
      }
      throw new Error("Could not create terminal when process support is not registered");
    }
    this._evaluateLocalCwd(shellLaunchConfig);
    const location = await this.resolveLocation(options?.location) || this._terminalConfigurationService.defaultLocation;
    if (shellLaunchConfig.hideFromUser) {
      const instance2 = this._terminalInstanceService.createInstance(shellLaunchConfig, location);
      this._backgroundedTerminalInstances.push({ instance: instance2, terminalLocationOptions: options?.location });
      this._backgroundedTerminalDisposables.set(instance2.instanceId, instance2.onDisposed((instance3) => this._onBackgroundTerminalDisposed(instance3)));
      this._onDidChangeInstances.fire();
      return instance2;
    }
    const parent = await this._getSplitParent(options?.location);
    this._terminalHasBeenCreated.set(true);
    this._extensionService.activateByEvent("onTerminal:*");
    let instance;
    if (parent) {
      instance = await this._splitTerminal(shellLaunchConfig, location, parent);
    } else {
      instance = this._createTerminal(shellLaunchConfig, location, options);
    }
    if (instance.shellType) {
      this._extensionService.activateByEvent(`onTerminal:${instance.shellType}`);
    }
    return instance;
  }
  async createAndFocusTerminal(options) {
    const instance = await this.createTerminal(options);
    this.setActiveInstance(instance);
    await instance.focusWhenReady();
    return instance;
  }
  async _getContributedProfile(shellLaunchConfig, options) {
    if (options?.config && hasKey(options.config, { extensionIdentifier: true })) {
      return options.config;
    }
    return this._terminalProfileService.getContributedDefaultProfile(shellLaunchConfig);
  }
  async createDetachedTerminal(options) {
    const ctor = await TerminalInstance.getXtermConstructor(this._keybindingService, this._contextKeyService);
    const capabilities = options.capabilities ?? new TerminalCapabilityStore();
    const xterm = this._instantiationService.createInstance(XtermTerminal, void 0, ctor, {
      cols: options.cols,
      rows: options.rows,
      xtermColorProvider: options.colorProvider,
      capabilities,
      disableOverviewRuler: options.disableOverviewRuler,
      detached: true
    }, void 0);
    if (options.readonly) {
      xterm.raw.attachCustomKeyEventHandler(() => false);
    }
    const instance = new DetachedTerminal(xterm, { ...options, capabilities }, this._instantiationService);
    this._detachedXterms.add(instance);
    this._ensureDetachedTerminalListeners();
    const l = xterm.onDidDispose(() => {
      this._detachedXterms.delete(instance);
      l.dispose();
    });
    return instance;
  }
  /**
   * Registers a single set of global service listeners (theme/config/log-level
   * changes) that forward updates to all detached xterm instances. This avoids
   * each detached terminal registering its own listener on global singletons.
   */
  _ensureDetachedTerminalListeners() {
    if (this._detachedListenersRegistered) {
      return;
    }
    this._detachedListenersRegistered = true;
    this._register(this._themeService.onDidColorThemeChange(() => {
      for (const instance of this._detachedXterms) {
        instance.xterm.updateTheme();
      }
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      const shouldUpdateConfig = e.affectsConfiguration("terminal.integrated") || e.affectsConfiguration("editor.fastScrollSensitivity") || e.affectsConfiguration("editor.mouseWheelScrollSensitivity") || e.affectsConfiguration("editor.multiCursorModifier");
      const shouldUpdateTheme = e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled);
      if (shouldUpdateConfig || shouldUpdateTheme) {
        for (const instance of this._detachedXterms) {
          if (shouldUpdateConfig) {
            instance.xterm.updateConfig();
          }
          if (shouldUpdateTheme) {
            instance.xterm.updateTheme();
          }
        }
      }
    }));
    this._register(this._logService.onDidChangeLogLevel(() => {
      for (const instance of this._detachedXterms) {
        instance.xterm.updateLogLevel();
      }
    }));
  }
  async _resolveCwd(shellLaunchConfig, splitActiveTerminal, options) {
    const cwd = shellLaunchConfig.cwd;
    if (!cwd) {
      if (options?.cwd) {
        shellLaunchConfig.cwd = options.cwd;
      } else if (splitActiveTerminal && options?.location) {
        let parent = this.activeInstance;
        if (typeof options.location === "object" && hasKey(options.location, { parentTerminal: true })) {
          parent = await options.location.parentTerminal;
        }
        if (!parent) {
          throw new Error("Cannot split without an active instance");
        }
        shellLaunchConfig.cwd = await getCwdForSplit(parent, this._workspaceContextService.getWorkspace().folders, this._commandService, this._terminalConfigurationService);
      }
    }
  }
  async _splitTerminal(shellLaunchConfig, location, parent) {
    let instance;
    if (typeof shellLaunchConfig.cwd !== "object" && typeof parent.shellLaunchConfig.cwd === "object") {
      let path = shellLaunchConfig.cwd || parent.shellLaunchConfig.cwd.path;
      if (parent.shellLaunchConfig.cwd.authority && path && path[0] !== "/") {
        path = "/" + path;
      }
      shellLaunchConfig.cwd = URI.from({
        scheme: parent.shellLaunchConfig.cwd.scheme,
        authority: parent.shellLaunchConfig.cwd.authority,
        path
      });
    }
    if (location === TerminalLocation.Editor || parent.target === TerminalLocation.Editor) {
      instance = await this._terminalEditorService.splitInstance(parent, shellLaunchConfig);
    } else {
      const group = this._terminalGroupService.getGroupForInstance(parent);
      if (!group) {
        throw new Error(`Cannot split a terminal without a group (instanceId: ${parent.instanceId}, title: ${parent.title})`);
      }
      shellLaunchConfig.parentTerminalId = parent.instanceId;
      instance = group.split(shellLaunchConfig);
    }
    return instance;
  }
  _createTerminal(shellLaunchConfig, location, options) {
    let instance;
    if (location === TerminalLocation.Editor) {
      instance = this._terminalInstanceService.createInstance(shellLaunchConfig, TerminalLocation.Editor);
      if (!shellLaunchConfig.hideFromUser) {
        const editorOptions = this._getEditorOptions(options?.location);
        this._terminalEditorService.openEditor(instance, editorOptions);
      }
    } else {
      const group = this._terminalGroupService.createGroup(shellLaunchConfig);
      instance = group.terminalInstances[0];
    }
    return instance;
  }
  async resolveLocation(location) {
    if (location && typeof location === "object") {
      if (hasKey(location, { parentTerminal: true })) {
        const parentTerminal = await location.parentTerminal;
        return !parentTerminal.target ? TerminalLocation.Panel : parentTerminal.target;
      } else if (hasKey(location, { viewColumn: true })) {
        return TerminalLocation.Editor;
      } else if (hasKey(location, { splitActiveTerminal: true })) {
        return !this._activeInstance?.target ? TerminalLocation.Panel : this._activeInstance?.target;
      }
    }
    return location;
  }
  async _getSplitParent(location) {
    if (location && typeof location === "object" && hasKey(location, { parentTerminal: true })) {
      return location.parentTerminal;
    } else if (location && typeof location === "object" && hasKey(location, { splitActiveTerminal: true })) {
      return this.activeInstance;
    }
    return void 0;
  }
  _getEditorOptions(location) {
    if (location && typeof location === "object" && hasKey(location, { viewColumn: true })) {
      if (location.viewColumn === ACTIVE_GROUP && isAuxiliaryWindow(getActiveWindow())) {
        location.viewColumn = this._editorGroupsService.activeGroup.id;
        return location;
      }
      location.viewColumn = columnToEditorGroup(this._editorGroupsService, this._configurationService, location.viewColumn);
      return location;
    }
    return void 0;
  }
  _evaluateLocalCwd(shellLaunchConfig) {
    if (this._environmentService.isSessionsWindow) {
      return;
    }
    if (!isString(shellLaunchConfig.cwd) && shellLaunchConfig.cwd?.scheme === Schemas.file) {
      if (VirtualWorkspaceContext.getValue(this._contextKeyService)) {
        shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize("localTerminalVirtualWorkspace", "This shell is open to a {0}local{1} folder, NOT to the virtual folder", "\x1B[3m", "\x1B[23m"), { excludeLeadingNewLine: true, loudFormatting: true });
        shellLaunchConfig.type = "Local";
      } else if (this._remoteAgentService.getConnection()) {
        shellLaunchConfig.initialText = formatMessageForTerminal(nls.localize("localTerminalRemote", "This shell is running on your {0}local{1} machine, NOT on the connected remote machine", "\x1B[3m", "\x1B[23m"), { excludeLeadingNewLine: true, loudFormatting: true });
        shellLaunchConfig.type = "Local";
      }
    }
  }
  moveToBackground(instance) {
    if (this._backgroundedTerminalInstances.some((bg) => bg.instance === instance)) {
      return;
    }
    if (instance.target === TerminalLocation.Editor) {
      this._terminalEditorService.detachInstance(instance);
    } else {
      const group = this._terminalGroupService.getGroupForInstance(instance);
      if (!group) {
        return;
      }
      group.removeInstance(instance);
    }
    instance.detachFromElement();
    this._backgroundedTerminalInstances.push({ instance, terminalLocationOptions: instance.target === TerminalLocation.Editor ? { viewColumn: ACTIVE_GROUP } : void 0 });
    this._backgroundedTerminalDisposables.set(instance.instanceId, instance.onDisposed((instance2) => this._onBackgroundTerminalDisposed(instance2)));
    this._onDidChangeInstances.fire();
  }
  _onBackgroundTerminalDisposed(instance) {
    const index = this._backgroundedTerminalInstances.findIndex((backgrounded) => backgrounded.instance === instance);
    if (index !== -1) {
      this._backgroundedTerminalInstances.splice(index, 1);
    }
    this._backgroundedTerminalDisposables.deleteAndDispose(instance.instanceId);
    this._onDidDisposeInstance.fire(instance);
  }
  async showBackgroundTerminal(instance, suppressSetActive) {
    const index = this._backgroundedTerminalInstances.findIndex((bg) => bg.instance === instance);
    if (index === -1) {
      return;
    }
    const backgroundTerminal = this._backgroundedTerminalInstances[index];
    this._backgroundedTerminalInstances.splice(index, 1);
    this._backgroundedTerminalDisposables.deleteAndDispose(instance.instanceId);
    if (instance.target === TerminalLocation.Panel) {
      this._terminalGroupService.createGroup(instance);
      if (this.instances.length === 1 && !suppressSetActive) {
        this._terminalGroupService.setActiveInstanceByIndex(0);
      }
    } else {
      const editorOptions = backgroundTerminal.terminalLocationOptions ? this._getEditorOptions(backgroundTerminal.terminalLocationOptions) : this._getEditorOptions(instance.target);
      this._terminalEditorService.openEditor(instance, editorOptions);
    }
    this._onDidChangeInstances.fire();
  }
  async setContainers(panelContainer, terminalContainer) {
    this._terminalConfigurationService.setPanelContainer(panelContainer);
    this._terminalGroupService.setContainer(terminalContainer);
  }
  createOnInstanceEvent(getEvent) {
    return new DynamicListEventMultiplexer(this.instances, this.onDidCreateInstance, this.onDidDisposeInstance, getEvent);
  }
  createOnInstanceCapabilityEvent(capabilityId, getEvent) {
    return createInstanceCapabilityEventMultiplexer(this.instances, this.onDidCreateInstance, this.onDidDisposeInstance, capabilityId, getEvent);
  }
};
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceData", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceDataInput", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceIconChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceMaximumDimensionsChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstancePrimaryStatusChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceProcessIdReady", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceSelectionChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceTitleChange", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceShellTypeChanged", 1);
__decorateClass([
  memoize
], TerminalService.prototype, "onAnyInstanceAddedCapabilityType", 1);
__decorateClass([
  debounce(500)
], TerminalService.prototype, "_saveState", 1);
__decorateClass([
  debounce(500)
], TerminalService.prototype, "_updateTitle", 1);
__decorateClass([
  debounce(500)
], TerminalService.prototype, "_updateIcon", 1);
TerminalService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, ITerminalLogService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IRemoteAgentService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IWorkbenchEnvironmentService),
  __decorateParam(8, ITerminalConfigurationService),
  __decorateParam(9, ITerminalEditorService),
  __decorateParam(10, ITerminalGroupService),
  __decorateParam(11, ITerminalInstanceService),
  __decorateParam(12, IEditorGroupsService),
  __decorateParam(13, ITerminalProfileService),
  __decorateParam(14, IExtensionService),
  __decorateParam(15, INotificationService),
  __decorateParam(16, IWorkspaceContextService),
  __decorateParam(17, ICommandService),
  __decorateParam(18, IKeybindingService),
  __decorateParam(19, ITimerService),
  __decorateParam(20, IThemeService)
], TerminalService);
let TerminalEditorStyle = class extends Themable {
  constructor(container, _terminalService, _themeService, _terminalProfileService, _editorService) {
    super(_themeService);
    this._terminalService = _terminalService;
    this._themeService = _themeService;
    this._terminalProfileService = _terminalProfileService;
    this._editorService = _editorService;
    this._registerListeners();
    this._styleElement = domStylesheets.createStyleSheet(container);
    this._register(toDisposable(() => this._styleElement.remove()));
    this.updateStyles();
  }
  _registerListeners() {
    this._register(this._terminalService.onAnyInstanceIconChange(() => this.updateStyles()));
    this._register(this._terminalService.onDidCreateInstance(() => this.updateStyles()));
    this._register(this._editorService.onDidActiveEditorChange(() => {
      if (this._editorService.activeEditor instanceof TerminalEditorInput) {
        this.updateStyles();
      }
    }));
    this._register(this._editorService.onDidCloseEditor(() => {
      if (this._editorService.activeEditor instanceof TerminalEditorInput) {
        this.updateStyles();
      }
    }));
    this._register(this._terminalProfileService.onDidChangeAvailableProfiles(() => this.updateStyles()));
  }
  updateStyles() {
    super.updateStyles();
    const colorTheme = this._themeService.getColorTheme();
    let css = "";
    const productIconTheme = this._themeService.getProductIconTheme();
    for (const instance of this._terminalService.instances) {
      const icon = instance.icon;
      if (!icon) {
        continue;
      }
      let uri = void 0;
      if (icon instanceof URI) {
        uri = icon;
      } else if (icon instanceof Object && hasKey(icon, { light: true, dark: true })) {
        uri = isDark(colorTheme.type) ? icon.dark : icon.light;
      }
      const iconClasses = getUriClasses(instance, colorTheme.type);
      if (uri instanceof URI && iconClasses && iconClasses.length > 1) {
        css += cssValue.inline`.monaco-workbench .terminal-tab.${cssValue.className(iconClasses[0])}::before
					{content: ''; background-image: ${cssValue.asCSSUrl(uri)};}`;
      }
      if (ThemeIcon.isThemeIcon(icon)) {
        const iconRegistry = getIconRegistry();
        const iconContribution = iconRegistry.getIcon(icon.id);
        if (iconContribution) {
          const def = productIconTheme.getIcon(iconContribution);
          if (def) {
            css += cssValue.inline`.monaco-workbench .terminal-tab.codicon-${cssValue.className(icon.id)}::before
							{content: ${cssValue.stringValue(def.fontCharacter)} !important; font-family: ${cssValue.stringValue(def.font?.id ?? "codicon")} !important;}`;
          }
        }
      }
    }
    const iconForegroundColor = colorTheme.getColor(iconForeground);
    if (iconForegroundColor) {
      css += cssValue.inline`.monaco-workbench .show-file-icons .file-icon.terminal-tab::before { color: ${iconForegroundColor}; }`;
    }
    css += getColorStyleContent(colorTheme, true);
    this._styleElement.textContent = css;
  }
};
TerminalEditorStyle = __decorateClass([
  __decorateParam(1, ITerminalService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, ITerminalProfileService),
  __decorateParam(4, IEditorService)
], TerminalEditorStyle);
export {
  TerminalService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWxTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tU3R5bGVzaGVldHMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCAqIGFzIGNzc1ZhbHVlIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9jc3NWYWx1ZS5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHRpbWVvdXQsIHR5cGUgTWF5YmVQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgZGVib3VuY2UsIG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IER5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlciwgRW1pdHRlciwgRXZlbnQsIElEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc01hY2ludG9zaCwgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUtleU1vZHMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGVPcHRpb25zLCBJRXh0ZW5zaW9uVGVybWluYWxQcm9maWxlLCBJUHR5SG9zdEF0dGFjaFRhcmdldCwgSVJhd1Rlcm1pbmFsSW5zdGFuY2VMYXlvdXRJbmZvLCBJUmF3VGVybWluYWxUYWJMYXlvdXRJbmZvLCBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbEJhY2tlbmQsIElUZXJtaW5hbExhdW5jaEVycm9yLCBJVGVybWluYWxMb2dTZXJ2aWNlLCBJVGVybWluYWxzTGF5b3V0SW5mbywgSVRlcm1pbmFsc0xheW91dEluZm9CeUlkLCBUZXJtaW5hbEV4aXRSZWFzb24sIFRlcm1pbmFsTG9jYXRpb24sIFRlcm1pbmFsU2V0dGluZ0lkLCBUaXRsZUV2ZW50U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IGZvcm1hdE1lc3NhZ2VGb3JUZXJtaW5hbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFN0cmluZ3MuanMnO1xuaW1wb3J0IHsgaWNvbkZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGlzRGFyayB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCBUaGVtYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFZpcnR1YWxXb3Jrc3BhY2VDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMsIElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2UsIElEZXRhY2hlZFhUZXJtT3B0aW9ucywgSVJlcXVlc3RBZGRJbnN0YW5jZVRvR3JvdXBFdmVudCwgSVRlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UsIElUZXJtaW5hbEVkaXRvclNlcnZpY2UsIElUZXJtaW5hbEdyb3VwLCBJVGVybWluYWxHcm91cFNlcnZpY2UsIElUZXJtaW5hbEluc3RhbmNlLCBJVGVybWluYWxJbnN0YW5jZUhvc3QsIElUZXJtaW5hbEluc3RhbmNlU2VydmljZSwgSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zLCBJVGVybWluYWxTZXJ2aWNlLCBJVGVybWluYWxTZXJ2aWNlTmF0aXZlRGVsZWdhdGUsIFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlLCBUZXJtaW5hbEVkaXRvckxvY2F0aW9uIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBnZXRDd2RGb3JTcGxpdCB9IGZyb20gJy4vdGVybWluYWxBY3Rpb25zLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsRWRpdG9ySW5wdXQgfSBmcm9tICcuL3Rlcm1pbmFsRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0Q29sb3JTdHlsZUNvbnRlbnQsIGdldFVyaUNsYXNzZXMgfSBmcm9tICcuL3Rlcm1pbmFsSWNvbi5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFByb2ZpbGVRdWlja3BpY2sgfSBmcm9tICcuL3Rlcm1pbmFsUHJvZmlsZVF1aWNrcGljay5qcyc7XG5pbXBvcnQgeyBnZXRJbnN0YW5jZUZyb21SZXNvdXJjZSwgZ2V0VGVybWluYWxVcmksIHBhcnNlVGVybWluYWxVcmkgfSBmcm9tICcuL3Rlcm1pbmFsVXJpLmpzJztcbmltcG9ydCB7IElSZW1vdGVUZXJtaW5hbEF0dGFjaFRhcmdldCwgSVN0YXJ0RXh0ZW5zaW9uVGVybWluYWxSZXF1ZXN0LCBJVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5LCBJVGVybWluYWxQcm9maWxlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsQ29udGV4dEtleS5qcyc7XG5pbXBvcnQgeyBjb2x1bW5Ub0VkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cENvbHVtbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIEFDVElWRV9HUk9VUF9UWVBFLCBBVVhfV0lORE9XX0dST1VQLCBBVVhfV0lORE9XX0dST1VQX1RZUEUsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQLCBTSURFX0dST1VQX1RZUEUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBTaHV0ZG93blJlYXNvbiwgU3RhcnR1cEtpbmQsIFdpbGxTaHV0ZG93bkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlQWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFh0ZXJtVGVybWluYWwgfSBmcm9tICcuL3h0ZXJtL3h0ZXJtVGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxJbnN0YW5jZSB9IGZyb20gJy4vdGVybWluYWxJbnN0YW5jZS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2NhcGFiaWxpdGllcy90ZXJtaW5hbENhcGFiaWxpdHlTdG9yZS5qcyc7XG5pbXBvcnQgeyBJVGltZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGltZXIvYnJvd3Nlci90aW1lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbWFyayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IERldGFjaGVkVGVybWluYWwgfSBmcm9tICcuL2RldGFjaGVkVGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2FwYWJpbGl0eUltcGxNYXAsIFRlcm1pbmFsQ2FwYWJpbGl0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUluc3RhbmNlQ2FwYWJpbGl0eUV2ZW50TXVsdGlwbGV4ZXIgfSBmcm9tICcuL3Rlcm1pbmFsRXZlbnRzLmpzJztcbmltcG9ydCB7IGlzQXV4aWxpYXJ5V2luZG93LCBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBHcm91cElkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGdldEFjdGl2ZVdpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuaW50ZXJmYWNlIElCYWNrZ3JvdW5kVGVybWluYWwge1xuXHRpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7XG5cdHRlcm1pbmFsTG9jYXRpb25PcHRpb25zPzogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zO1xufVxuXG5leHBvcnQgY2xhc3MgVGVybWluYWxTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUZXJtaW5hbFNlcnZpY2Uge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9ob3N0QWN0aXZlVGVybWluYWxzOiBNYXA8SVRlcm1pbmFsSW5zdGFuY2VIb3N0LCBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4gPSBuZXcgTWFwKCk7XG5cblx0cHJpdmF0ZSBfZGV0YWNoZWRYdGVybXMgPSBuZXcgU2V0PElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U+KCk7XG5cdHByaXZhdGUgX2RldGFjaGVkTGlzdGVuZXJzUmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNoZWxsVHlwZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PHN0cmluZz47XG5cblx0cHJpdmF0ZSBfaXNTaHV0dGluZ0Rvd246IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXM6IElCYWNrZ3JvdW5kVGVybWluYWxbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9iYWNrZ3JvdW5kZWRUZXJtaW5hbERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8bnVtYmVyPigpKTtcblx0cHJpdmF0ZSBfcHJvY2Vzc1N1cHBvcnRDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9wcmltYXJ5QmFja2VuZD86IElUZXJtaW5hbEJhY2tlbmQ7XG5cdHByaXZhdGUgX3Rlcm1pbmFsSGFzQmVlbkNyZWF0ZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIF90ZXJtaW5hbENvdW50Q29udGV4dEtleTogSUNvbnRleHRLZXk8bnVtYmVyPjtcblx0cHJpdmF0ZSBfbmF0aXZlRGVsZWdhdGU/OiBJVGVybWluYWxTZXJ2aWNlTmF0aXZlRGVsZWdhdGU7XG5cdHByaXZhdGUgX3NodXRkb3duV2luZG93Q291bnQ/OiBudW1iZXI7XG5cblx0Z2V0IGlzUHJvY2Vzc1N1cHBvcnRSZWdpc3RlcmVkKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLl9wcm9jZXNzU3VwcG9ydENvbnRleHRLZXkuZ2V0KCk7IH1cblxuXHRwcml2YXRlIF9jb25uZWN0aW9uU3RhdGU6IFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlID0gVGVybWluYWxDb25uZWN0aW9uU3RhdGUuQ29ubmVjdGluZztcblx0Z2V0IGNvbm5lY3Rpb25TdGF0ZSgpOiBUZXJtaW5hbENvbm5lY3Rpb25TdGF0ZSB7IHJldHVybiB0aGlzLl9jb25uZWN0aW9uU3RhdGU7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF93aGVuQ29ubmVjdGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRnZXQgd2hlbkNvbm5lY3RlZCgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMuX3doZW5Db25uZWN0ZWQucDsgfVxuXG5cdHByaXZhdGUgX3Jlc3RvcmVkR3JvdXBDb3VudDogbnVtYmVyID0gMDtcblx0Z2V0IHJlc3RvcmVkR3JvdXBDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fcmVzdG9yZWRHcm91cENvdW50OyB9XG5cblx0Z2V0IGluc3RhbmNlcygpOiBJVGVybWluYWxJbnN0YW5jZVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuaW5zdGFuY2VzLmNvbmNhdCh0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UuaW5zdGFuY2VzKS5jb25jYXQodGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMubWFwKGJnID0+IGJnLmluc3RhbmNlKSk7XG5cdH1cblx0LyoqIEdldHMgYWxsIG5vbi1iYWNrZ3JvdW5kIHRlcm1pbmFscy4gKi9cblx0Z2V0IGZvcmVncm91bmRJbnN0YW5jZXMoKTogSVRlcm1pbmFsSW5zdGFuY2VbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5jb25jYXQodGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLmluc3RhbmNlcyk7XG5cdH1cblx0Z2V0IGRldGFjaGVkSW5zdGFuY2VzKCk6IEl0ZXJhYmxlPElEZXRhY2hlZFRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGV0YWNoZWRYdGVybXM7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbm5lY3RlZFRlcm1pbmFsR3JvdXBzOiBQcm9taXNlPElUZXJtaW5hbEdyb3VwW10+IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX3JlY29ubmVjdGVkVGVybWluYWxzOiBNYXA8c3RyaW5nLCBJVGVybWluYWxJbnN0YW5jZVtdPiA9IG5ldyBNYXAoKTtcblx0Z2V0UmVjb25uZWN0ZWRUZXJtaW5hbHMocmVjb25uZWN0aW9uT3duZXI6IHN0cmluZyk6IElUZXJtaW5hbEluc3RhbmNlW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZWNvbm5lY3RlZFRlcm1pbmFscy5nZXQocmVjb25uZWN0aW9uT3duZXIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWN0aXZlSW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkO1xuXHRnZXQgYWN0aXZlSW5zdGFuY2UoKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRcdC8vIENoZWNrIGlmIGVpdGhlciBhbiBlZGl0b3Igb3IgcGFuZWwgdGVybWluYWwgaGFzIGZvY3VzIGFuZCByZXR1cm4gdGhhdCwgcmVnYXJkbGVzcyBvZiB0aGVcblx0XHQvLyB2YWx1ZSBvZiBfYWN0aXZlSW5zdGFuY2UuIFRoaXMgYXZvaWRzIHRlcm1pbmFscyBjcmVhdGVkIGluIHRoZSBwYW5lbCBmb3IgZXhhbXBsZSBzdGVhbGluZ1xuXHRcdC8vIHRoZSBhY3RpdmUgc3RhdHVzIGV2ZW4gd2hlbiBpdCdzIG5vdCBmb2N1c2VkLlxuXHRcdGZvciAoY29uc3QgYWN0aXZlSG9zdFRlcm1pbmFsIG9mIHRoaXMuX2hvc3RBY3RpdmVUZXJtaW5hbHMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChhY3RpdmVIb3N0VGVybWluYWw/Lmhhc0ZvY3VzKSB7XG5cdFx0XHRcdHJldHVybiBhY3RpdmVIb3N0VGVybWluYWw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEZhbGxiYWNrIHRvIHRoZSBsYXN0IHJlY29yZGVkIGFjdGl2ZSB0ZXJtaW5hbCBpZiBuZWl0aGVyIGhhdmUgZm9jdXNcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlSW5zdGFuY2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENyZWF0ZUluc3RhbmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRnZXQgb25EaWRDcmVhdGVJbnN0YW5jZSgpOiBFdmVudDxJVGVybWluYWxJbnN0YW5jZT4geyByZXR1cm4gdGhpcy5fb25EaWRDcmVhdGVJbnN0YW5jZS5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUluc3RhbmNlRGltZW5zaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlSW5zdGFuY2VEaW1lbnNpb25zKCk6IEV2ZW50PElUZXJtaW5hbEluc3RhbmNlPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlRGltZW5zaW9ucy5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkUmVnaXN0ZXJQcm9jZXNzU3VwcG9ydCgpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZFJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQuZXZlbnQ7IH1cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDb25uZWN0aW9uU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdFN0YXJ0RXh0ZW5zaW9uVGVybWluYWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU3RhcnRFeHRlbnNpb25UZXJtaW5hbFJlcXVlc3Q+KCkpO1xuXHRnZXQgb25EaWRSZXF1ZXN0U3RhcnRFeHRlbnNpb25UZXJtaW5hbCgpOiBFdmVudDxJU3RhcnRFeHRlbnNpb25UZXJtaW5hbFJlcXVlc3Q+IHsgcmV0dXJuIHRoaXMuX29uRGlkUmVxdWVzdFN0YXJ0RXh0ZW5zaW9uVGVybWluYWwuZXZlbnQ7IH1cblxuXHQvLyBJVGVybWluYWxJbnN0YW5jZUhvc3QgZXZlbnRzXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZUluc3RhbmNlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVRlcm1pbmFsSW5zdGFuY2U+KCkpO1xuXHRnZXQgb25EaWREaXNwb3NlSW5zdGFuY2UoKTogRXZlbnQ8SVRlcm1pbmFsSW5zdGFuY2U+IHsgcmV0dXJuIHRoaXMuX29uRGlkRGlzcG9zZUluc3RhbmNlLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNJbnN0YW5jZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0Z2V0IG9uRGlkRm9jdXNJbnN0YW5jZSgpOiBFdmVudDxJVGVybWluYWxJbnN0YW5jZT4geyByZXR1cm4gdGhpcy5fb25EaWRGb2N1c0luc3RhbmNlLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlKCk6IEV2ZW50PElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSW5zdGFuY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZUluc3RhbmNlcygpOiBFdmVudDx2b2lkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5ldmVudDsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElUZXJtaW5hbEluc3RhbmNlPigpKTtcblx0Z2V0IG9uRGlkQ2hhbmdlSW5zdGFuY2VDYXBhYmlsaXR5KCk6IEV2ZW50PElUZXJtaW5hbEluc3RhbmNlPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eS5ldmVudDsgfVxuXG5cdC8vIFRlcm1pbmFsIHZpZXcgZXZlbnRzXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZD4oKSk7XG5cdGdldCBvbkRpZENoYW5nZUFjdGl2ZUdyb3VwKCk6IEV2ZW50PElUZXJtaW5hbEdyb3VwIHwgdW5kZWZpbmVkPiB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUdyb3VwLmV2ZW50OyB9XG5cblx0Ly8gTGF6aWx5IGluaXRpYWxpemVkIGV2ZW50cyB0aGF0IGZpcmUgd2hlbiB0aGUgc3BlY2lmaWVkIGV2ZW50IGZpcmVzIG9uIF9hbnlfIHRlcm1pbmFsXG5cdC8vIFRPRE86IEJhdGNoIGV2ZW50c1xuXHRAbWVtb2l6ZSBnZXQgb25BbnlJbnN0YW5jZURhdGEoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChpbnN0YW5jZSA9PiBFdmVudC5tYXAoaW5zdGFuY2Uub25EYXRhLCBkYXRhID0+ICh7IGluc3RhbmNlLCBkYXRhIH0pKSkpLmV2ZW50OyB9XG5cdEBtZW1vaXplIGdldCBvbkFueUluc3RhbmNlRGF0YUlucHV0KCkgeyByZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVPbkluc3RhbmNlRXZlbnQoZSA9PiBFdmVudC5tYXAoZS5vbkRpZElucHV0RGF0YSwgKCkgPT4gZSwgZS5zdG9yZSkpKS5ldmVudDsgfVxuXHRAbWVtb2l6ZSBnZXQgb25BbnlJbnN0YW5jZUljb25DaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChlID0+IGUub25JY29uQ2hhbmdlZCkpLmV2ZW50OyB9XG5cdEBtZW1vaXplIGdldCBvbkFueUluc3RhbmNlTWF4aW11bURpbWVuc2lvbnNDaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChlID0+IEV2ZW50Lm1hcChlLm9uTWF4aW11bURpbWVuc2lvbnNDaGFuZ2VkLCAoKSA9PiBlLCBlLnN0b3JlKSkpLmV2ZW50OyB9XG5cdEBtZW1vaXplIGdldCBvbkFueUluc3RhbmNlUHJpbWFyeVN0YXR1c0NoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlT25JbnN0YW5jZUV2ZW50KGUgPT4gRXZlbnQubWFwKGUuc3RhdHVzTGlzdC5vbkRpZENoYW5nZVByaW1hcnlTdGF0dXMsICgpID0+IGUsIGUuc3RvcmUpKSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uQW55SW5zdGFuY2VQcm9jZXNzSWRSZWFkeSgpIHsgcmV0dXJuIHRoaXMuX3JlZ2lzdGVyKHRoaXMuY3JlYXRlT25JbnN0YW5jZUV2ZW50KGUgPT4gZS5vblByb2Nlc3NJZFJlYWR5KSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uQW55SW5zdGFuY2VTZWxlY3Rpb25DaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChlID0+IGUub25EaWRDaGFuZ2VTZWxlY3Rpb24pKS5ldmVudDsgfVxuXHRAbWVtb2l6ZSBnZXQgb25BbnlJbnN0YW5jZVRpdGxlQ2hhbmdlKCkgeyByZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVPbkluc3RhbmNlRXZlbnQoZSA9PiBlLm9uVGl0bGVDaGFuZ2VkKSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uQW55SW5zdGFuY2VTaGVsbFR5cGVDaGFuZ2VkKCkgeyByZXR1cm4gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVPbkluc3RhbmNlRXZlbnQoZSA9PiBFdmVudC5tYXAoZS5vbkRpZENoYW5nZVNoZWxsVHlwZSwgKCkgPT4gZSkpKS5ldmVudDsgfVxuXHRAbWVtb2l6ZSBnZXQgb25BbnlJbnN0YW5jZUFkZGVkQ2FwYWJpbGl0eVR5cGUoKSB7IHJldHVybiB0aGlzLl9yZWdpc3Rlcih0aGlzLmNyZWF0ZU9uSW5zdGFuY2VFdmVudChlID0+IEV2ZW50Lm1hcChlLmNhcGFiaWxpdGllcy5vbkRpZEFkZENhcGFiaWxpdHksIGUgPT4gZS5pZCkpKS5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHByaXZhdGUgX3JlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEVkaXRvclNlcnZpY2U6IElUZXJtaW5hbEVkaXRvclNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEdyb3VwU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbEdyb3VwU2VydmljZTogSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxJbnN0YW5jZVNlcnZpY2U6IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXBzU2VydmljZTogSUVkaXRvckdyb3Vwc1NlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2U6IElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElUaW1lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGltZXJTZXJ2aWNlOiBJVGltZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gdGhlIGJlbG93IGF2b2lkcyBoYXZpbmcgdG8gcG9sbCByb3V0aW5lbHkuXG5cdFx0Ly8gd2UgdXBkYXRlIGRldGVjdGVkIHByb2ZpbGVzIHdoZW4gYW4gaW5zdGFuY2UgaXMgY3JlYXRlZCBzbyB0aGF0LFxuXHRcdC8vIGZvciBleGFtcGxlLCB3ZSBkZXRlY3QgaWYgeW91J3ZlIGluc3RhbGxlZCBhIHB3c2hcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ3JlYXRlSW5zdGFuY2UoKCkgPT4gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5yZWZyZXNoQXZhaWxhYmxlUHJvZmlsZXMoKSkpO1xuXHRcdHRoaXMuX2ZvcndhcmRJbnN0YW5jZUhvc3RFdmVudHModGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UpO1xuXHRcdHRoaXMuX2ZvcndhcmRJbnN0YW5jZUhvc3RFdmVudHModGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5vbkRpZENoYW5nZUFjdGl2ZUdyb3VwKHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZmlyZSwgdGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVHcm91cCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLm9uRGlkQ3JlYXRlSW5zdGFuY2UoaW5zdGFuY2UgPT4ge1xuXHRcdFx0dGhpcy5faW5pdEluc3RhbmNlTGlzdGVuZXJzKGluc3RhbmNlKTtcblx0XHRcdHRoaXMuX29uRGlkQ3JlYXRlSW5zdGFuY2UuZmlyZShpbnN0YW5jZSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGlkZSB0aGUgcGFuZWwgaWYgdGhlcmUgYXJlIG5vIG1vcmUgaW5zdGFuY2VzLCBwcm92aWRlZCB0aGF0IFZTIENvZGUgaXMgbm90IHNodXR0aW5nXG5cdFx0Ly8gZG93bi4gV2hlbiBzaHV0dGluZyBkb3duIHRoZSBwYW5lbCBpcyBsb2NrZWQgaW4gcGxhY2Ugc28gdGhhdCBpdCBpcyByZXN0b3JlZCB1cG9uIG5leHRcblx0XHQvLyBsYXVuY2guXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uub25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSA9PiB7XG5cdFx0XHRpZiAoIWluc3RhbmNlICYmICF0aGlzLl9pc1NodXR0aW5nRG93biAmJiB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5oaWRlT25MYXN0Q2xvc2VkKSB7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmhpZGVQYW5lbCgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGluc3RhbmNlPy5zaGVsbFR5cGUpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5LnNldChpbnN0YW5jZS5zaGVsbFR5cGUudG9TdHJpbmcoKSk7XG5cdFx0XHR9IGVsc2UgaWYgKCFpbnN0YW5jZSB8fCAhKGluc3RhbmNlLnNoZWxsVHlwZSkpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxTaGVsbFR5cGVDb250ZXh0S2V5LnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5faGFuZGxlSW5zdGFuY2VDb250ZXh0S2V5cygpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsU2hlbGxUeXBlQ29udGV4dEtleSA9IFRlcm1pbmFsQ29udGV4dEtleXMuc2hlbGxUeXBlLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcHJvY2Vzc1N1cHBvcnRDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5wcm9jZXNzU3VwcG9ydGVkLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fcHJvY2Vzc1N1cHBvcnRDb250ZXh0S2V5LnNldCghaXNXZWIgfHwgdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKSAhPT0gbnVsbCk7XG5cdFx0dGhpcy5fdGVybWluYWxIYXNCZWVuQ3JlYXRlZCA9IFRlcm1pbmFsQ29udGV4dEtleXMudGVybWluYWxIYXNCZWVuQ3JlYXRlZC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ291bnRDb250ZXh0S2V5ID0gVGVybWluYWxDb250ZXh0S2V5cy5jb3VudC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoX2xpZmVjeWNsZVNlcnZpY2Uub25CZWZvcmVTaHV0ZG93bihhc3luYyBlID0+IGUudmV0byh0aGlzLl9vbkJlZm9yZVNodXRkb3duKGUucmVhc29uKSwgJ3ZldG8udGVybWluYWwnKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9saWZlY3ljbGVTZXJ2aWNlLm9uV2lsbFNodXRkb3duKGUgPT4gdGhpcy5fb25XaWxsU2h1dGRvd24oZSkpKTtcblxuXHRcdHRoaXMuX2luaXRpYWxpemVQcmltYXJ5QmFja2VuZCgpO1xuXG5cdFx0Ly8gQ3JlYXRlIGFzeW5jIGFzIHRoZSBjbGFzcyBkZXBlbmRzIG9uIGB0aGlzYFxuXHRcdHRpbWVvdXQoMCkudGhlbigoKSA9PiB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbEVkaXRvclN0eWxlLCBtYWluV2luZG93LmRvY3VtZW50LmhlYWQpKSk7XG5cdH1cblxuXHRhc3luYyBzaG93UHJvZmlsZVF1aWNrUGljayh0eXBlOiAnc2V0RGVmYXVsdCcgfCAnY3JlYXRlSW5zdGFuY2UnLCBjd2Q/OiBzdHJpbmcgfCBVUkkpOiBQcm9taXNlPElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcXVpY2tQaWNrID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxQcm9maWxlUXVpY2twaWNrKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja1BpY2suc2hvd0FuZEdldFJlc3VsdCh0eXBlKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaXNTdHJpbmcocmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXlNb2RzOiBJS2V5TW9kcyB8IHVuZGVmaW5lZCA9IHJlc3VsdC5rZXlNb2RzO1xuXHRcdGlmICh0eXBlID09PSAnY3JlYXRlSW5zdGFuY2UnKSB7XG5cdFx0XHRjb25zdCBhY3RpdmVJbnN0YW5jZSA9IHRoaXMuZ2V0RGVmYXVsdEluc3RhbmNlSG9zdCgpLmFjdGl2ZUluc3RhbmNlO1xuXHRcdFx0Y29uc3QgZGVmYXVsdExvY2F0aW9uID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5kZWZhdWx0TG9jYXRpb247XG5cdFx0XHRsZXQgaW5zdGFuY2U7XG5cblx0XHRcdGlmIChyZXN1bHQuY29uZmlnICYmIGhhc0tleShyZXN1bHQuY29uZmlnLCB7IGlkOiB0cnVlIH0pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuY3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGUocmVzdWx0LmNvbmZpZy5leHRlbnNpb25JZGVudGlmaWVyLCByZXN1bHQuY29uZmlnLmlkLCB7XG5cdFx0XHRcdFx0aWNvbjogcmVzdWx0LmNvbmZpZy5vcHRpb25zPy5pY29uLFxuXHRcdFx0XHRcdGNvbG9yOiByZXN1bHQuY29uZmlnLm9wdGlvbnM/LmNvbG9yLFxuXHRcdFx0XHRcdGxvY2F0aW9uOiAhIShrZXlNb2RzPy5hbHQgJiYgYWN0aXZlSW5zdGFuY2UpID8geyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiB0cnVlIH0gOiBkZWZhdWx0TG9jYXRpb24sXG5cdFx0XHRcdFx0dGl0bGVUZW1wbGF0ZTogcmVzdWx0LmNvbmZpZy50aXRsZVRlbXBsYXRlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fSBlbHNlIGlmIChyZXN1bHQuY29uZmlnICYmIGhhc0tleShyZXN1bHQuY29uZmlnLCB7IHByb2ZpbGVOYW1lOiB0cnVlIH0pKSB7XG5cdFx0XHRcdGlmIChrZXlNb2RzPy5hbHQgJiYgYWN0aXZlSW5zdGFuY2UpIHtcblx0XHRcdFx0XHQvLyBjcmVhdGUgc3BsaXQsIG9ubHkgdmFsaWQgaWYgdGhlcmUncyBhbiBhY3RpdmUgaW5zdGFuY2Vcblx0XHRcdFx0XHRpbnN0YW5jZSA9IGF3YWl0IHRoaXMuY3JlYXRlVGVybWluYWwoeyBsb2NhdGlvbjogeyBwYXJlbnRUZXJtaW5hbDogYWN0aXZlSW5zdGFuY2UgfSwgY29uZmlnOiByZXN1bHQuY29uZmlnLCBjd2QgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aW5zdGFuY2UgPSBhd2FpdCB0aGlzLmNyZWF0ZVRlcm1pbmFsKHsgbG9jYXRpb246IGRlZmF1bHRMb2NhdGlvbiwgY29uZmlnOiByZXN1bHQuY29uZmlnLCBjd2QgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGluc3RhbmNlICYmIGRlZmF1bHRMb2NhdGlvbiAhPT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXHRcdFx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW5pdGlhbGl6ZVByaW1hcnlCYWNrZW5kKCkge1xuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbEdldFRlcm1pbmFsQmFja2VuZCcpO1xuXHRcdHRoaXMuX3ByaW1hcnlCYWNrZW5kID0gYXdhaXQgdGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZ2V0QmFja2VuZCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KTtcblx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZEdldFRlcm1pbmFsQmFja2VuZCcpO1xuXHRcdGNvbnN0IGVuYWJsZVRlcm1pbmFsUmVjb25uZWN0aW9uID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlUGVyc2lzdGVudFNlc3Npb25zO1xuXG5cdFx0Ly8gQ29ubmVjdCB0byB0aGUgZXh0ZW5zaW9uIGhvc3QgaWYgaXQncyB0aGVyZSwgc2V0IHRoZSBjb25uZWN0aW9uIHN0YXRlIHRvIGNvbm5lY3RlZCB3aGVuXG5cdFx0Ly8gaXQncyBkb25lLiBUaGlzIHNob3VsZCBoYXBwZW4gZXZlbiB3aGVuIHRoZXJlIGlzIG5vIGV4dGVuc2lvbiBob3N0LlxuXHRcdHRoaXMuX2Nvbm5lY3Rpb25TdGF0ZSA9IFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlLkNvbm5lY3Rpbmc7XG5cblx0XHRjb25zdCBpc1BlcnNpc3RlbnRSZW1vdGUgPSAhIXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgJiYgZW5hYmxlVGVybWluYWxSZWNvbm5lY3Rpb247XG5cblx0XHRpZiAodGhpcy5fcHJpbWFyeUJhY2tlbmQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3ByaW1hcnlCYWNrZW5kLm9uRGlkUmVxdWVzdERldGFjaChhc3luYyAoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW5jZVRvRGV0YWNoID0gdGhpcy5nZXRJbnN0YW5jZUZyb21SZXNvdXJjZShnZXRUZXJtaW5hbFVyaShlLndvcmtzcGFjZUlkLCBlLmluc3RhbmNlSWQpKTtcblx0XHRcdFx0aWYgKGluc3RhbmNlVG9EZXRhY2gpIHtcblx0XHRcdFx0XHRjb25zdCBwZXJzaXN0ZW50UHJvY2Vzc0lkID0gaW5zdGFuY2VUb0RldGFjaD8ucGVyc2lzdGVudFByb2Nlc3NJZDtcblx0XHRcdFx0XHRpZiAocGVyc2lzdGVudFByb2Nlc3NJZCAmJiAhaW5zdGFuY2VUb0RldGFjaC5zaGVsbExhdW5jaENvbmZpZy5pc0ZlYXR1cmVUZXJtaW5hbCAmJiAhaW5zdGFuY2VUb0RldGFjaC5zaGVsbExhdW5jaENvbmZpZy5jdXN0b21QdHlJbXBsZW1lbnRhdGlvbikge1xuXHRcdFx0XHRcdFx0aWYgKGluc3RhbmNlVG9EZXRhY2gudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UuZGV0YWNoSW5zdGFuY2UoaW5zdGFuY2VUb0RldGFjaCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5nZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlVG9EZXRhY2gpPy5yZW1vdmVJbnN0YW5jZShpbnN0YW5jZVRvRGV0YWNoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGF3YWl0IGluc3RhbmNlVG9EZXRhY2guZGV0YWNoUHJvY2Vzc0FuZERpc3Bvc2UoVGVybWluYWxFeGl0UmVhc29uLlVzZXIpO1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcHJpbWFyeUJhY2tlbmQ/LmFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkoZS5yZXF1ZXN0SWQsIHBlcnNpc3RlbnRQcm9jZXNzSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyB3aWxsIGdldCByZWplY3RlZCB3aXRob3V0IGEgcGVyc2lzdGVudFByb2Nlc3NJZCB0byBhdHRhY2ggdG9cblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3ByaW1hcnlCYWNrZW5kPy5hY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5KGUucmVxdWVzdElkLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbFJlY29ubmVjdCcpO1xuXHRcdGxldCByZWNvbm5lY3RlZFByb21pc2U6IFByb21pc2U8dW5rbm93bj47XG5cdFx0aWYgKGlzUGVyc2lzdGVudFJlbW90ZSkge1xuXHRcdFx0cmVjb25uZWN0ZWRQcm9taXNlID0gdGhpcy5fcmVjb25uZWN0VG9SZW1vdGVUZXJtaW5hbHMoKTtcblx0XHR9IGVsc2UgaWYgKGVuYWJsZVRlcm1pbmFsUmVjb25uZWN0aW9uKSB7XG5cdFx0XHRyZWNvbm5lY3RlZFByb21pc2UgPSB0aGlzLl9yZWNvbm5lY3RUb0xvY2FsVGVybWluYWxzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJlY29ubmVjdGVkUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRyZWNvbm5lY3RlZFByb21pc2UudGhlbihhc3luYyAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXRDb25uZWN0ZWQoKTtcblx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkUmVjb25uZWN0Jyk7XG5cdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxSZXBsYXknKTtcblx0XHRcdGNvbnN0IGluc3RhbmNlcyA9IGF3YWl0IHRoaXMuX3JlY29ubmVjdGVkVGVybWluYWxHcm91cHM/LnRoZW4oZ3JvdXBzID0+IGdyb3Vwcy5tYXAoZSA9PiBlLnRlcm1pbmFsSW5zdGFuY2VzKS5mbGF0KCkpID8/IFtdO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoaW5zdGFuY2VzLm1hcChlID0+IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gRXZlbnQub25jZShlLm9uUHJvY2Vzc1JlcGxheUNvbXBsZXRlKShyKSkpKTtcblx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkUmVwbGF5Jyk7XG5cdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxHZXRQZXJmb3JtYW5jZU1hcmtzJyk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmdldFJlZ2lzdGVyZWRCYWNrZW5kcygpKS5tYXAoYXN5bmMgYmFja2VuZCA9PiB7XG5cdFx0XHRcdHRoaXMuX3RpbWVyU2VydmljZS5zZXRQZXJmb3JtYW5jZU1hcmtzKGJhY2tlbmQucmVtb3RlQXV0aG9yaXR5ID09PSB1bmRlZmluZWQgPyAnbG9jYWxQdHlIb3N0JyA6ICdyZW1vdGVQdHlIb3N0JywgYXdhaXQgYmFja2VuZC5nZXRQZXJmb3JtYW5jZU1hcmtzKCkpO1xuXHRcdFx0XHRiYWNrZW5kLnNldFJlYWR5KCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZEdldFBlcmZvcm1hbmNlTWFya3MnKTtcblx0XHRcdHRoaXMuX3doZW5Db25uZWN0ZWQuY29tcGxldGUoKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldFByaW1hcnlCYWNrZW5kKCk6IElUZXJtaW5hbEJhY2tlbmQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9wcmltYXJ5QmFja2VuZDtcblx0fVxuXG5cdGFzeW5jIHNldE5leHRDb21tYW5kSWQoaWQ6IG51bWJlciwgY29tbWFuZExpbmU6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX3ByaW1hcnlCYWNrZW5kIHx8IGlkIDw9IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fcHJpbWFyeUJhY2tlbmQuc2V0TmV4dENvbW1hbmRJZChpZCwgY29tbWFuZExpbmUsIGNvbW1hbmRJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3J3YXJkSW5zdGFuY2VIb3N0RXZlbnRzKGhvc3Q6IElUZXJtaW5hbEluc3RhbmNlSG9zdCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvc3Qub25EaWRDaGFuZ2VJbnN0YW5jZXModGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSwgdGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihob3N0Lm9uRGlkRGlzcG9zZUluc3RhbmNlKHRoaXMuX29uRGlkRGlzcG9zZUluc3RhbmNlLmZpcmUsIHRoaXMuX29uRGlkRGlzcG9zZUluc3RhbmNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG9zdC5vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlKGluc3RhbmNlID0+IHRoaXMuX2V2YWx1YXRlQWN0aXZlSW5zdGFuY2UoaG9zdCwgaW5zdGFuY2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG9zdC5vbkRpZEZvY3VzSW5zdGFuY2UoaW5zdGFuY2UgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRGb2N1c0luc3RhbmNlLmZpcmUoaW5zdGFuY2UpO1xuXHRcdFx0dGhpcy5fZXZhbHVhdGVBY3RpdmVJbnN0YW5jZShob3N0LCBpbnN0YW5jZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGhvc3Qub25EaWRDaGFuZ2VJbnN0YW5jZUNhcGFiaWxpdHkoKGluc3RhbmNlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlQ2FwYWJpbGl0eS5maXJlKGluc3RhbmNlKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5faG9zdEFjdGl2ZVRlcm1pbmFscy5zZXQoaG9zdCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX2V2YWx1YXRlQWN0aXZlSW5zdGFuY2UoaG9zdDogSVRlcm1pbmFsSW5zdGFuY2VIb3N0LCBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQpIHtcblx0XHQvLyBUcmFjayB0aGUgbGF0ZXN0IGFjdGl2ZSB0ZXJtaW5hbCBmb3IgZWFjaCBob3N0IHNvIHRoYXQgd2hlbiBvbmUgYmVjb21lcyB1bmRlZmluZWQsIHRoZVxuXHRcdC8vIFRlcm1pbmFsU2VydmljZSdzIGFjdGl2ZSB0ZXJtaW5hbCBpcyBzZXQgdG8gdGhlIGxhc3QgYWN0aXZlIHRlcm1pbmFsIGZyb20gdGhlIG90aGVyIGhvc3QuXG5cdFx0Ly8gVGhpcyBtZWFucyBpZiB0aGUgbGFzdCB0ZXJtaW5hbCBlZGl0b3IgaXMgY2xvc2VkIHN1Y2ggdGhhdCBpdCBiZWNvbWVzIHVuZGVmaW5lZCwgdGhlIGxhc3Rcblx0XHQvLyBhY3RpdmUgZ3JvdXAncyB0ZXJtaW5hbCB3aWxsIGJlIHVzZWQgYXMgdGhlIGFjdGl2ZSB0ZXJtaW5hbCBpZiBhdmFpbGFibGUuXG5cdFx0dGhpcy5faG9zdEFjdGl2ZVRlcm1pbmFscy5zZXQoaG9zdCwgaW5zdGFuY2UpO1xuXHRcdGlmIChpbnN0YW5jZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGl2ZSBvZiB0aGlzLl9ob3N0QWN0aXZlVGVybWluYWxzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGlmIChhY3RpdmUpIHtcblx0XHRcdFx0XHRpbnN0YW5jZSA9IGFjdGl2ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVJbnN0YW5jZSA9IGluc3RhbmNlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UuZmlyZShpbnN0YW5jZSk7XG5cdH1cblxuXHRzZXRBY3RpdmVJbnN0YW5jZSh2YWx1ZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQpIHtcblx0XHQvLyBUT0RPQG1lZ2Fucm9nZ2U6IElzIHRoaXMgdGhlIHJpZ2h0IGxvZ2ljIGZvciB3aGVuIGluc3RhbmNlIGlzIHVuZGVmaW5lZD9cblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIElmIHRoaXMgd2FzIGEgaGlkZUZyb21Vc2VyIHRlcm1pbmFsIGNyZWF0ZWQgYnkgdGhlIEFQSSB0aGlzIHdhcyB0cmlnZ2VyZWQgYnkgc2hvdyxcblx0XHQvLyBpbiB3aGljaCBjYXNlIHdlIG5lZWQgdG8gY3JlYXRlIHRoZSB0ZXJtaW5hbCBncm91cFxuXHRcdGlmICh2YWx1ZS5zaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIpIHtcblx0XHRcdHRoaXMuc2hvd0JhY2tncm91bmRUZXJtaW5hbCh2YWx1ZSk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodmFsdWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZSh2YWx1ZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZm9jdXNJbnN0YW5jZShpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fYWN0aXZlSW5zdGFuY2UgIT09IGluc3RhbmNlKSB7XG5cdFx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlKGluc3RhbmNlKTtcblx0XHR9XG5cdFx0aWYgKGluc3RhbmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5mb2N1c0luc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZm9jdXNJbnN0YW5jZShpbnN0YW5jZSk7XG5cdH1cblxuXHRhc3luYyBmb2N1c0FjdGl2ZUluc3RhbmNlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fYWN0aXZlSW5zdGFuY2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZm9jdXNJbnN0YW5jZSh0aGlzLl9hY3RpdmVJbnN0YW5jZSk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZShleHRlbnNpb25JZGVudGlmaWVyOiBzdHJpbmcsIGlkOiBzdHJpbmcsIG9wdGlvbnM6IElDcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZU9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25UZXJtaW5hbFByb2ZpbGU6JHtpZH1gKTtcblxuXHRcdGNvbnN0IHByb2ZpbGVQcm92aWRlciA9IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuZ2V0Q29udHJpYnV0ZWRQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllciwgaWQpO1xuXHRcdGlmICghcHJvZmlsZVByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGBObyB0ZXJtaW5hbCBwcm9maWxlIHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yIGlkIFwiJHtpZH1cImApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvZmlsZVByb3ZpZGVyLmNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlKG9wdGlvbnMpO1xuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2VCeUluZGV4KHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcy5sZW5ndGggLSAxKTtcblx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlPy5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IoZS5tZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzYWZlRGlzcG9zZVRlcm1pbmFsKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENvbmZpcm0gb24ga2lsbCBpbiB0aGUgZWRpdG9yIGlzIGhhbmRsZWQgYnkgdGhlIGVkaXRvciBpbnB1dFxuXHRcdGlmIChpbnN0YW5jZS50YXJnZXQgIT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yICYmXG5cdFx0XHRpbnN0YW5jZS5oYXNDaGlsZFByb2Nlc3NlcyAmJlxuXHRcdFx0KHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmNvbmZpcm1PbktpbGwgPT09ICdwYW5lbCcgfHwgdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuY29uZmlybU9uS2lsbCA9PT0gJ2Fsd2F5cycpKSB7XG5cdFx0XHRjb25zdCB2ZXRvID0gYXdhaXQgdGhpcy5fc2hvd1Rlcm1pbmFsQ2xvc2VDb25maXJtYXRpb24odHJ1ZSk7XG5cdFx0XHRpZiAodmV0bykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcblx0XHRcdEV2ZW50Lm9uY2UoaW5zdGFuY2Uub25FeGl0KSgoKSA9PiByKCkpO1xuXHRcdFx0aW5zdGFuY2UuZGlzcG9zZShUZXJtaW5hbEV4aXRSZWFzb24uVXNlcik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDb25uZWN0ZWQoKSB7XG5cdFx0dGhpcy5fY29ubmVjdGlvblN0YXRlID0gVGVybWluYWxDb25uZWN0aW9uU3RhdGUuQ29ubmVjdGVkO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQ29ubmVjdGlvblN0YXRlLmZpcmUoKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdQdHkgaG9zdCByZWFkeScpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25uZWN0VG9SZW1vdGVUZXJtaW5hbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVtb3RlQXV0aG9yaXR5ID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eTtcblx0XHRpZiAoIXJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiYWNrZW5kID0gYXdhaXQgdGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZ2V0QmFja2VuZChyZW1vdGVBdXRob3JpdHkpO1xuXHRcdGlmICghYmFja2VuZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxHZXRUZXJtaW5hbExheW91dEluZm8nKTtcblx0XHRjb25zdCBsYXlvdXRJbmZvID0gYXdhaXQgYmFja2VuZC5nZXRUZXJtaW5hbExheW91dEluZm8oKTtcblx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZEdldFRlcm1pbmFsTGF5b3V0SW5mbycpO1xuXHRcdGJhY2tlbmQucmVkdWNlQ29ubmVjdGlvbkdyYWNlVGltZSgpO1xuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbFJlY3JlYXRlVGVybWluYWxHcm91cHMnKTtcblx0XHRhd2FpdCB0aGlzLl9yZWNyZWF0ZVRlcm1pbmFsR3JvdXBzKGxheW91dEluZm8pO1xuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkUmVjcmVhdGVUZXJtaW5hbEdyb3VwcycpO1xuXHRcdC8vIG5vdyB0aGF0IHRlcm1pbmFscyBoYXZlIGJlZW4gcmVzdG9yZWQsXG5cdFx0Ly8gYXR0YWNoIGxpc3RlbmVycyB0byB1cGRhdGUgcmVtb3RlIHdoZW4gdGVybWluYWxzIGFyZSBjaGFuZ2VkXG5cdFx0dGhpcy5fYXR0YWNoUHJvY2Vzc0xheW91dExpc3RlbmVycygpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnUmVjb25uZWN0ZWQgdG8gcmVtb3RlIHRlcm1pbmFscycpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25uZWN0VG9Mb2NhbFRlcm1pbmFscygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsb2NhbEJhY2tlbmQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbEluc3RhbmNlU2VydmljZS5nZXRCYWNrZW5kKCk7XG5cdFx0aWYgKCFsb2NhbEJhY2tlbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsR2V0VGVybWluYWxMYXlvdXRJbmZvJyk7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IGF3YWl0IGxvY2FsQmFja2VuZC5nZXRUZXJtaW5hbExheW91dEluZm8oKTtcblx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZEdldFRlcm1pbmFsTGF5b3V0SW5mbycpO1xuXHRcdGlmIChsYXlvdXRJbmZvICYmIChsYXlvdXRJbmZvLnRhYnMubGVuZ3RoID4gMCB8fCBsYXlvdXRJbmZvPy5iYWNrZ3JvdW5kPy5sZW5ndGgpKSB7XG5cdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxSZWNyZWF0ZVRlcm1pbmFsR3JvdXBzJyk7XG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RlZFRlcm1pbmFsR3JvdXBzID0gdGhpcy5fcmVjcmVhdGVUZXJtaW5hbEdyb3VwcyhsYXlvdXRJbmZvKTtcblx0XHRcdGNvbnN0IHJldml2ZWRJbnN0YW5jZXMgPSBhd2FpdCB0aGlzLl9yZXZpdmVCYWNrZ3JvdW5kVGVybWluYWxJbnN0YW5jZXMobGF5b3V0SW5mby5iYWNrZ3JvdW5kIHx8IFtdKTtcblx0XHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzID0gcmV2aXZlZEluc3RhbmNlcy5tYXAoaW5zdGFuY2UgPT4gKHsgaW5zdGFuY2UgfSkpO1xuXHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRSZWNyZWF0ZVRlcm1pbmFsR3JvdXBzJyk7XG5cdFx0fVxuXHRcdC8vIG5vdyB0aGF0IHRlcm1pbmFscyBoYXZlIGJlZW4gcmVzdG9yZWQsXG5cdFx0Ly8gYXR0YWNoIGxpc3RlbmVycyB0byB1cGRhdGUgbG9jYWwgc3RhdGUgd2hlbiB0ZXJtaW5hbHMgYXJlIGNoYW5nZWRcblx0XHR0aGlzLl9hdHRhY2hQcm9jZXNzTGF5b3V0TGlzdGVuZXJzKCk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdSZWNvbm5lY3RlZCB0byBsb2NhbCB0ZXJtaW5hbHMnKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY3JlYXRlVGVybWluYWxHcm91cHMobGF5b3V0SW5mbz86IElUZXJtaW5hbHNMYXlvdXRJbmZvKTogUHJvbWlzZTxJVGVybWluYWxHcm91cFtdPiB7XG5cdFx0Y29uc3QgZ3JvdXBQcm9taXNlczogUHJvbWlzZTxJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZD5bXSA9IFtdO1xuXHRcdGxldCBhY3RpdmVHcm91cDogUHJvbWlzZTxJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGxheW91dEluZm8pIHtcblx0XHRcdGZvciAoY29uc3QgdGFiTGF5b3V0IG9mIGxheW91dEluZm8udGFicykge1xuXHRcdFx0XHRjb25zdCB0ZXJtaW5hbExheW91dHMgPSB0YWJMYXlvdXQudGVybWluYWxzLmZpbHRlcih0ID0+IHQudGVybWluYWwgJiYgdC50ZXJtaW5hbC5pc09ycGhhbik7XG5cdFx0XHRcdGlmICh0ZXJtaW5hbExheW91dHMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVzdG9yZWRHcm91cENvdW50ICs9IHRlcm1pbmFsTGF5b3V0cy5sZW5ndGg7XG5cdFx0XHRcdFx0Y29uc3QgcHJvbWlzZSA9IHRoaXMuX3JlY3JlYXRlVGVybWluYWxHcm91cCh0YWJMYXlvdXQsIHRlcm1pbmFsTGF5b3V0cyk7XG5cdFx0XHRcdFx0Z3JvdXBQcm9taXNlcy5wdXNoKHByb21pc2UpO1xuXHRcdFx0XHRcdGlmICh0YWJMYXlvdXQuaXNBY3RpdmUpIHtcblx0XHRcdFx0XHRcdGFjdGl2ZUdyb3VwID0gcHJvbWlzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgYWN0aXZlSW5zdGFuY2UgPSB0aGlzLmluc3RhbmNlcy5maW5kKHQgPT4gdC5zaGVsbExhdW5jaENvbmZpZy5hdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcz8uaWQgPT09IHRhYkxheW91dC5hY3RpdmVQZXJzaXN0ZW50UHJvY2Vzc0lkKTtcblx0XHRcdFx0XHRpZiAoYWN0aXZlSW5zdGFuY2UpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0QWN0aXZlSW5zdGFuY2UoYWN0aXZlSW5zdGFuY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGxheW91dEluZm8udGFicy5sZW5ndGgpIHtcblx0XHRcdFx0YWN0aXZlR3JvdXA/LnRoZW4oZ3JvdXAgPT4gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAgPSBncm91cCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLmFsbChncm91cFByb21pc2VzKS50aGVuKHJlc3VsdCA9PiByZXN1bHQuZmlsdGVyKGUgPT4gISFlKSBhcyBJVGVybWluYWxHcm91cFtdKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jldml2ZUJhY2tncm91bmRUZXJtaW5hbEluc3RhbmNlcyhiZ1Rlcm1pbmFsczogKElQdHlIb3N0QXR0YWNoVGFyZ2V0IHwgbnVsbClbXSk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2VbXT4ge1xuXHRcdGNvbnN0IGluc3RhbmNlczogSVRlcm1pbmFsSW5zdGFuY2VbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgYmcgb2YgYmdUZXJtaW5hbHMpIHtcblx0XHRcdGNvbnN0IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzID0gYmc7XG5cdFx0XHRpZiAoIWF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCB0aGlzLmNyZWF0ZVRlcm1pbmFsKHsgY29uZmlnOiB7IGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLCBoaWRlRnJvbVVzZXI6IHRydWUsIGZvcmNlUGVyc2lzdDogdHJ1ZSB9LCBsb2NhdGlvbjogVGVybWluYWxMb2NhdGlvbi5QYW5lbCB9KTtcblx0XHRcdGluc3RhbmNlcy5wdXNoKGluc3RhbmNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGluc3RhbmNlcztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY3JlYXRlVGVybWluYWxHcm91cCh0YWJMYXlvdXQ6IElSYXdUZXJtaW5hbFRhYkxheW91dEluZm88SVB0eUhvc3RBdHRhY2hUYXJnZXQgfCBudWxsPiwgdGVybWluYWxMYXlvdXRzOiBJUmF3VGVybWluYWxJbnN0YW5jZUxheW91dEluZm88SVB0eUhvc3RBdHRhY2hUYXJnZXQgfCBudWxsPltdKTogUHJvbWlzZTxJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZD4ge1xuXHRcdGxldCBsYXN0SW5zdGFuY2U6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3QgdGVybWluYWxMYXlvdXQgb2YgdGVybWluYWxMYXlvdXRzKSB7XG5cdFx0XHRjb25zdCBhdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyA9IHRlcm1pbmFsTGF5b3V0LnRlcm1pbmFsITtcblx0XHRcdGlmICh0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLnN0YXJ0dXBLaW5kICE9PSBTdGFydHVwS2luZC5SZWxvYWRlZFdpbmRvdyAmJiBhdHRhY2hQZXJzaXN0ZW50UHJvY2Vzcy50eXBlID09PSAnVGFzaycpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRtYXJrKGBjb2RlL3Rlcm1pbmFsL3dpbGxSZWNyZWF0ZVRlcm1pbmFsLyR7YXR0YWNoUGVyc2lzdGVudFByb2Nlc3MuaWR9LSR7YXR0YWNoUGVyc2lzdGVudFByb2Nlc3MucGlkfWApO1xuXHRcdFx0bGFzdEluc3RhbmNlID0gdGhpcy5jcmVhdGVUZXJtaW5hbCh7XG5cdFx0XHRcdGNvbmZpZzogeyBhdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyB9LFxuXHRcdFx0XHRsb2NhdGlvbjogbGFzdEluc3RhbmNlID8geyBwYXJlbnRUZXJtaW5hbDogbGFzdEluc3RhbmNlIH0gOiBUZXJtaW5hbExvY2F0aW9uLlBhbmVsXG5cdFx0XHR9KTtcblx0XHRcdGxhc3RJbnN0YW5jZS50aGVuKCgpID0+IG1hcmsoYGNvZGUvdGVybWluYWwvZGlkUmVjcmVhdGVUZXJtaW5hbC8ke2F0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLmlkfS0ke2F0dGFjaFBlcnNpc3RlbnRQcm9jZXNzLnBpZH1gKSk7XG5cdFx0fVxuXHRcdGNvbnN0IGdyb3VwID0gbGFzdEluc3RhbmNlPy50aGVuKGluc3RhbmNlID0+IHtcblx0XHRcdGNvbnN0IGcgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5nZXRHcm91cEZvckluc3RhbmNlKGluc3RhbmNlKTtcblx0XHRcdGc/LnJlc2l6ZVBhbmVzKHRhYkxheW91dC50ZXJtaW5hbHMubWFwKHRlcm1pbmFsID0+IHRlcm1pbmFsLnJlbGF0aXZlU2l6ZSkpO1xuXHRcdFx0cmV0dXJuIGc7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIGdyb3VwO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXR0YWNoUHJvY2Vzc0xheW91dExpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlR3JvdXAoKCkgPT4gdGhpcy5fc2F2ZVN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlSW5zdGFuY2UoKCkgPT4gdGhpcy5fc2F2ZVN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uRGlkQ2hhbmdlSW5zdGFuY2VzKCgpID0+IHRoaXMuX3NhdmVTdGF0ZSgpKSk7XG5cdFx0Ly8gVGhlIHN0YXRlIG11c3QgYmUgdXBkYXRlZCB3aGVuIHRoZSB0ZXJtaW5hbCBpcyByZWxhdW5jaGVkLCBvdGhlcndpc2UgdGhlIHBlcnNpc3RlbnRcblx0XHQvLyB0ZXJtaW5hbCBJRCB3aWxsIGJlIHN0YWxlIGFuZCB0aGUgcHJvY2VzcyB3aWxsIGJlIGxlYWtlZC5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uQW55SW5zdGFuY2VQcm9jZXNzSWRSZWFkeSgoKSA9PiB0aGlzLl9zYXZlU3RhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25BbnlJbnN0YW5jZVRpdGxlQ2hhbmdlKGluc3RhbmNlID0+IHRoaXMuX3VwZGF0ZVRpdGxlKGluc3RhbmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25BbnlJbnN0YW5jZUljb25DaGFuZ2UoZSA9PiB0aGlzLl91cGRhdGVJY29uKGUuaW5zdGFuY2UsIGUudXNlckluaXRpYXRlZCkpKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUluc3RhbmNlQ29udGV4dEtleXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdGVybWluYWxJc09wZW5Db250ZXh0ID0gVGVybWluYWxDb250ZXh0S2V5cy5pc09wZW4uYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCB1cGRhdGVUZXJtaW5hbENvbnRleHRLZXlzID0gKCkgPT4ge1xuXHRcdFx0dGVybWluYWxJc09wZW5Db250ZXh0LnNldCh0aGlzLmluc3RhbmNlcy5sZW5ndGggPiAwKTtcblx0XHRcdHRoaXMuX3Rlcm1pbmFsQ291bnRDb250ZXh0S2V5LnNldCh0aGlzLmluc3RhbmNlcy5sZW5ndGgpO1xuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUluc3RhbmNlcygoKSA9PiB1cGRhdGVUZXJtaW5hbENvbnRleHRLZXlzKCkpKTtcblx0fVxuXG5cdGFzeW5jIGdldEFjdGl2ZU9yQ3JlYXRlSW5zdGFuY2Uob3B0aW9ucz86IHsgYWNjZXB0c0lucHV0PzogYm9vbGVhbiB9KTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGNvbnN0IGFjdGl2ZUluc3RhbmNlID0gdGhpcy5hY3RpdmVJbnN0YW5jZTtcblx0XHQvLyBObyBpbnN0YW5jZSwgY3JlYXRlXG5cdFx0aWYgKCFhY3RpdmVJbnN0YW5jZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlVGVybWluYWwoKTtcblx0XHR9XG5cdFx0Ly8gQWN0aXZlIGluc3RhbmNlLCBlbnN1cmUgYWNjZXB0cyBpbnB1dFxuXHRcdGlmICghb3B0aW9ucz8uYWNjZXB0c0lucHV0IHx8IGFjdGl2ZUluc3RhbmNlLnh0ZXJtPy5pc1N0ZGluRGlzYWJsZWQgIT09IHRydWUpIHtcblx0XHRcdHJldHVybiBhY3RpdmVJbnN0YW5jZTtcblx0XHR9XG5cdFx0Ly8gQWN0aXZlIGluc3RhbmNlIGRvZXNuJ3QgYWNjZXB0IGlucHV0LCBjcmVhdGUgYW5kIGZvY3VzXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBhd2FpdCB0aGlzLmNyZWF0ZVRlcm1pbmFsKCk7XG5cdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0YXdhaXQgdGhpcy5yZXZlYWxBY3RpdmVUZXJtaW5hbCgpO1xuXHRcdHJldHVybiBpbnN0YW5jZTtcblx0fVxuXG5cdGFzeW5jIHJldmVhbFRlcm1pbmFsKHNvdXJjZTogSVRlcm1pbmFsSW5zdGFuY2UsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHNvdXJjZS50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UucmV2ZWFsQWN0aXZlRWRpdG9yKHByZXNlcnZlRm9jdXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXZlYWxBY3RpdmVUZXJtaW5hbChwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5hY3RpdmVJbnN0YW5jZTtcblx0XHRpZiAoIWluc3RhbmNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMucmV2ZWFsVGVybWluYWwoaW5zdGFuY2UsIHByZXNlcnZlRm9jdXMpO1xuXHR9XG5cblxuXG5cdHJlcXVlc3RTdGFydEV4dGVuc2lvblRlcm1pbmFsKHByb3h5OiBJVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5LCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBUaGUgaW5pdGlhbCByZXF1ZXN0IGNhbWUgZnJvbSB0aGUgZXh0ZW5zaW9uIGhvc3QsIG5vIG5lZWQgdG8gd2FpdCBmb3IgaXRcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCB1bmRlZmluZWQ+KGNhbGxiYWNrID0+IHtcblx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdFN0YXJ0RXh0ZW5zaW9uVGVybWluYWwuZmlyZSh7IHByb3h5LCBjb2xzLCByb3dzLCBjYWxsYmFjayB9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX29uQmVmb3JlU2h1dGRvd24ocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IE1heWJlUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gTmV2ZXIgdmV0byBvbiB3ZWIgYXMgdGhpcyB3b3VsZCBibG9jayBhbGwgd2luZG93cyBmcm9tIGJlaW5nIGNsb3NlZC4gVGhpcyBkaXNhYmxlc1xuXHRcdC8vIHByb2Nlc3MgcmV2aXZlIGFzIHdlIGNhbid0IGhhbmRsZSBpdCBvbiBzaHV0ZG93bi5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuX2lzU2h1dHRpbmdEb3duID0gdHJ1ZTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX29uQmVmb3JlU2h1dGRvd25Bc3luYyhyZWFzb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfb25CZWZvcmVTaHV0ZG93bkFzeW5jKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAodGhpcy5pbnN0YW5jZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyBObyB0ZXJtaW5hbCBpbnN0YW5jZXMsIGRvbid0IHZldG9cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBQZXJzaXN0IHRlcm1pbmFsIF9idWZmZXIgc3RhdGVfLCBub3RlIHRoYXQgZXZlbiBpZiB0aGlzIGhhcHBlbnMgdGhlIGRpcnR5IHRlcm1pbmFsIHByb21wdFxuXHRcdC8vIHN0aWxsIHNob3dzIGFzIHRoYXQgY2Fubm90IGJlIHJldml2ZWRcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fc2h1dGRvd25XaW5kb3dDb3VudCA9IGF3YWl0IHRoaXMuX25hdGl2ZURlbGVnYXRlPy5nZXRXaW5kb3dDb3VudCgpO1xuXHRcdFx0Y29uc3Qgc2hvdWxkUmV2aXZlUHJvY2Vzc2VzID0gdGhpcy5fc2hvdWxkUmV2aXZlUHJvY2Vzc2VzKHJlYXNvbik7XG5cdFx0XHRpZiAoc2hvdWxkUmV2aXZlUHJvY2Vzc2VzKSB7XG5cdFx0XHRcdC8vIEF0dGVtcHQgdG8gcGVyc2lzdCB0aGUgdGVybWluYWwgc3RhdGUgYnV0IG9ubHkgYWxsb3cgMjAwMG1zIGFzIHdlIGNhbid0IGJsb2NrXG5cdFx0XHRcdC8vIHNodXRkb3duLiBUaGlzIGNhbiBoYXBwZW4gd2hlbiBpbiBhIHJlbW90ZSB3b3Jrc3BhY2UgYnV0IHRoZSBvdGhlciBzaWRlIGhhcyBiZWVuXG5cdFx0XHRcdC8vIHN1c3BlbmRlZCBhbmQgaXMgaW4gdGhlIHByb2Nlc3Mgb2YgcmVjb25uZWN0aW5nLCB0aGUgbWVzc2FnZSB3aWxsIGJlIHB1dCBpbiBhXG5cdFx0XHRcdC8vIHF1ZXVlIGluIHRoaXMgY2FzZSBmb3Igd2hlbiB0aGUgY29ubmVjdGlvbiBpcyBiYWNrIHVwIGFuZCBydW5uaW5nLiBBYm9ydGluZyB0aGVcblx0XHRcdFx0Ly8gcHJvY2VzcyBpcyBwcmVmZXJhYmxlIGluIHRoaXMgY2FzZS5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0XHR0aGlzLl9wcmltYXJ5QmFja2VuZD8ucGVyc2lzdFRlcm1pbmFsU3RhdGUoKSxcblx0XHRcdFx0XHR0aW1lb3V0KDIwMDApXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBQZXJzaXN0IHRlcm1pbmFsIF9wcm9jZXNzZXNfXG5cdFx0XHRjb25zdCBzaG91bGRQZXJzaXN0UHJvY2Vzc2VzID0gdGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlUGVyc2lzdGVudFNlc3Npb25zICYmIHJlYXNvbiA9PT0gU2h1dGRvd25SZWFzb24uUkVMT0FEO1xuXHRcdFx0aWYgKCFzaG91bGRQZXJzaXN0UHJvY2Vzc2VzKSB7XG5cdFx0XHRcdGNvbnN0IGhhc0RpcnR5SW5zdGFuY2VzID0gKFxuXHRcdFx0XHRcdCh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5jb25maXJtT25FeGl0ID09PSAnYWx3YXlzJyAmJiB0aGlzLmZvcmVncm91bmRJbnN0YW5jZXMubGVuZ3RoID4gMCkgfHxcblx0XHRcdFx0XHQodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuY29uZmlybU9uRXhpdCA9PT0gJ2hhc0NoaWxkUHJvY2Vzc2VzJyAmJiB0aGlzLmZvcmVncm91bmRJbnN0YW5jZXMuc29tZShlID0+IGUuaGFzQ2hpbGRQcm9jZXNzZXMpKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoaGFzRGlydHlJbnN0YW5jZXMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fb25CZWZvcmVTaHV0ZG93bkNvbmZpcm1hdGlvbihyZWFzb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyOiB1bmtub3duKSB7XG5cdFx0XHQvLyBTd2FsbG93IGFzIGV4Y2VwdGlvbnMgc2hvdWxkIG5vdCBjYXVzZSBhIHZldG8gdG8gcHJldmVudCBzaHV0ZG93blxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdFeGNlcHRpb24gb2NjdXJyZWQgZHVyaW5nIHRlcm1pbmFsIHNodXRkb3duJywgZXJyKTtcblx0XHR9XG5cblx0XHR0aGlzLl9pc1NodXR0aW5nRG93biA9IHRydWU7XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRzZXROYXRpdmVEZWxlZ2F0ZShuYXRpdmVEZWxlZ2F0ZTogSVRlcm1pbmFsU2VydmljZU5hdGl2ZURlbGVnYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5fbmF0aXZlRGVsZWdhdGUgPSBuYXRpdmVEZWxlZ2F0ZTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3VsZFJldml2ZVByb2Nlc3NlcyhyZWFzb246IFNodXRkb3duUmVhc29uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0c3dpdGNoICh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5wZXJzaXN0ZW50U2Vzc2lvblJldml2ZVByb2Nlc3MpIHtcblx0XHRcdGNhc2UgJ29uRXhpdCc6IHtcblx0XHRcdFx0Ly8gQWxsb3cgb24gY2xvc2UgaWYgaXQncyB0aGUgbGFzdCB3aW5kb3cgb24gV2luZG93cyBvciBMaW51eFxuXHRcdFx0XHRpZiAocmVhc29uID09PSBTaHV0ZG93blJlYXNvbi5DTE9TRSAmJiAodGhpcy5fc2h1dGRvd25XaW5kb3dDb3VudCA9PT0gMSAmJiAhaXNNYWNpbnRvc2gpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlYXNvbiA9PT0gU2h1dGRvd25SZWFzb24uTE9BRCB8fCByZWFzb24gPT09IFNodXRkb3duUmVhc29uLlFVSVQ7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdvbkV4aXRBbmRXaW5kb3dDbG9zZSc6IHJldHVybiByZWFzb24gIT09IFNodXRkb3duUmVhc29uLlJFTE9BRDtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9vbkJlZm9yZVNodXRkb3duQ29uZmlybWF0aW9uKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHQvLyB2ZXRvIGlmIGNvbmZpZ3VyZWQgdG8gc2hvdyBjb25maXJtYXRpb24gYW5kIHRoZSB1c2VyIGNob3NlIG5vdCB0byBleGl0XG5cdFx0Y29uc3QgdmV0byA9IGF3YWl0IHRoaXMuX3Nob3dUZXJtaW5hbENsb3NlQ29uZmlybWF0aW9uKCk7XG5cdFx0aWYgKCF2ZXRvKSB7XG5cdFx0XHR0aGlzLl9pc1NodXR0aW5nRG93biA9IHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZldG87XG5cdH1cblxuXHRwcml2YXRlIF9vbldpbGxTaHV0ZG93bihlOiBXaWxsU2h1dGRvd25FdmVudCk6IHZvaWQge1xuXHRcdC8vIERvbid0IHRvdWNoIHByb2Nlc3NlcyBpZiB0aGUgc2h1dGRvd24gd2FzIGEgcmVzdWx0IG9mIHJlbG9hZCBhcyB0aGV5IHdpbGwgYmUgcmVhdHRhY2hlZFxuXHRcdGNvbnN0IHNob3VsZFBlcnNpc3RUZXJtaW5hbHMgPSB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMgJiYgZS5yZWFzb24gPT09IFNodXRkb3duUmVhc29uLlJFTE9BRDtcblxuXHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgWy4uLnRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmluc3RhbmNlcywgLi4udGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMubWFwKGJnID0+IGJnLmluc3RhbmNlKV0pIHtcblx0XHRcdGlmIChzaG91bGRQZXJzaXN0VGVybWluYWxzICYmIGluc3RhbmNlLnNob3VsZFBlcnNpc3QpIHtcblx0XHRcdFx0aW5zdGFuY2UuZGV0YWNoUHJvY2Vzc0FuZERpc3Bvc2UoVGVybWluYWxFeGl0UmVhc29uLlNodXRkb3duKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGluc3RhbmNlLmRpc3Bvc2UoVGVybWluYWxFeGl0UmVhc29uLlNodXRkb3duKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDbGVhciB0ZXJtaW5hbCBsYXlvdXQgaW5mbyBvbmx5IHdoZW4gbm90IHBlcnNpc3Rpbmdcblx0XHRpZiAoIXNob3VsZFBlcnNpc3RUZXJtaW5hbHMgJiYgIXRoaXMuX3Nob3VsZFJldml2ZVByb2Nlc3NlcyhlLnJlYXNvbikpIHtcblx0XHRcdHRoaXMuX3ByaW1hcnlCYWNrZW5kPy5zZXRUZXJtaW5hbExheW91dEluZm8odW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRAZGVib3VuY2UoNTAwKVxuXHRwcml2YXRlIF9zYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0Ly8gQXZvaWQgc2F2aW5nIHN0YXRlIHdoZW4gc2h1dHRpbmcgZG93biBhcyB0aGF0IHdvdWxkIG92ZXJyaWRlIHByb2Nlc3Mgc3RhdGUgdG8gYmUgcmV2aXZlZFxuXHRcdGlmICh0aGlzLl9pc1NodXR0aW5nRG93bikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2UuY29uZmlnLmVuYWJsZVBlcnNpc3RlbnRTZXNzaW9ucykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0YWJzID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ3JvdXBzLm1hcChnID0+IGcuZ2V0TGF5b3V0SW5mbyhnID09PSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVHcm91cCkpO1xuXHRcdGNvbnN0IHN0YXRlOiBJVGVybWluYWxzTGF5b3V0SW5mb0J5SWQgPSB7IHRhYnMsIGJhY2tncm91bmQ6IHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzLm1hcChiZyA9PiBiZy5pbnN0YW5jZSkuZmlsdGVyKGkgPT4gaS5zaGVsbExhdW5jaENvbmZpZy5mb3JjZVBlcnNpc3QpLm1hcChpID0+IGkucGVyc2lzdGVudFByb2Nlc3NJZCkuZmlsdGVyKChlKTogZSBpcyBudW1iZXIgPT4gZSAhPT0gdW5kZWZpbmVkKSB9O1xuXHRcdHRoaXMuX3ByaW1hcnlCYWNrZW5kPy5zZXRUZXJtaW5hbExheW91dEluZm8oc3RhdGUpO1xuXHR9XG5cblx0QGRlYm91bmNlKDUwMClcblx0cHJpdmF0ZSBfdXBkYXRlVGl0bGUoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMgfHwgIWluc3RhbmNlIHx8IGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uIHx8ICFpbnN0YW5jZS5wZXJzaXN0ZW50UHJvY2Vzc0lkIHx8ICFpbnN0YW5jZS50aXRsZSB8fCBpbnN0YW5jZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpbnN0YW5jZS5zdGF0aWNUaXRsZSkge1xuXHRcdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmQ/LnVwZGF0ZVRpdGxlKGluc3RhbmNlLnBlcnNpc3RlbnRQcm9jZXNzSWQsIGluc3RhbmNlLnN0YXRpY1RpdGxlLCBUaXRsZUV2ZW50U291cmNlLkFwaSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3ByaW1hcnlCYWNrZW5kPy51cGRhdGVUaXRsZShpbnN0YW5jZS5wZXJzaXN0ZW50UHJvY2Vzc0lkLCBpbnN0YW5jZS50aXRsZSwgaW5zdGFuY2UudGl0bGVTb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdEBkZWJvdW5jZSg1MDApXG5cdHByaXZhdGUgX3VwZGF0ZUljb24oaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlLCB1c2VySW5pdGlhdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZy5lbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnMgfHwgIWluc3RhbmNlIHx8IGluc3RhbmNlLnNoZWxsTGF1bmNoQ29uZmlnLmN1c3RvbVB0eUltcGxlbWVudGF0aW9uIHx8ICFpbnN0YW5jZS5wZXJzaXN0ZW50UHJvY2Vzc0lkIHx8ICFpbnN0YW5jZS5pY29uIHx8IGluc3RhbmNlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcHJpbWFyeUJhY2tlbmQ/LnVwZGF0ZUljb24oaW5zdGFuY2UucGVyc2lzdGVudFByb2Nlc3NJZCwgdXNlckluaXRpYXRlZCwgaW5zdGFuY2UuaWNvbiwgaW5zdGFuY2UuY29sb3IpO1xuXHR9XG5cblx0cmVmcmVzaEFjdGl2ZUdyb3VwKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZmlyZSh0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVHcm91cCk7XG5cdH1cblxuXHRnZXRJbnN0YW5jZUZyb21JZCh0ZXJtaW5hbElkOiBudW1iZXIpOiBJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGJnSW5kZXggPSAtMTtcblx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5mb3JFYWNoKChiZywgaSkgPT4ge1xuXHRcdFx0aWYgKGJnLmluc3RhbmNlLmluc3RhbmNlSWQgPT09IHRlcm1pbmFsSWQpIHtcblx0XHRcdFx0YmdJbmRleCA9IGk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0aWYgKGJnSW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXNbYmdJbmRleF0uaW5zdGFuY2U7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW5jZXNbdGhpcy5fZ2V0SW5kZXhGcm9tSWQodGVybWluYWxJZCldO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRnZXRJbnN0YW5jZUZyb21SZXNvdXJjZShyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBnZXRJbnN0YW5jZUZyb21SZXNvdXJjZSh0aGlzLmluc3RhbmNlcywgcmVzb3VyY2UpO1xuXHR9XG5cblx0b3BlblJlc291cmNlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IHRoaXMuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UocmVzb3VyY2UpO1xuXHRcdGlmIChpbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0XHR0aGlzLnJldmVhbFRlcm1pbmFsKGluc3RhbmNlKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRzID0gaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmdldChUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbik/LmNvbW1hbmRzO1xuXHRcdFx0Y29uc3QgcGFyYW1zID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhyZXNvdXJjZS5xdWVyeSk7XG5cdFx0XHRjb25zdCByZWxldmFudENvbW1hbmQgPSBjb21tYW5kcz8uZmluZChjID0+IGMuaWQgPT09IHBhcmFtcy5nZXQoJ2NvbW1hbmQnKSk7XG5cdFx0XHRpZiAocmVsZXZhbnRDb21tYW5kKSB7XG5cdFx0XHRcdGluc3RhbmNlLnh0ZXJtPy5tYXJrVHJhY2tlci5yZXZlYWxDb21tYW5kKHJlbGV2YW50Q29tbWFuZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aXNBdHRhY2hlZFRvVGVybWluYWwocmVtb3RlVGVybTogSVJlbW90ZVRlcm1pbmFsQXR0YWNoVGFyZ2V0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFuY2VzLnNvbWUodGVybSA9PiB0ZXJtLnByb2Nlc3NJZCA9PT0gcmVtb3RlVGVybS5waWQpO1xuXHR9XG5cblx0bW92ZVRvRWRpdG9yKHNvdXJjZTogSVRlcm1pbmFsSW5zdGFuY2UsIGdyb3VwPzogR3JvdXBJZGVudGlmaWVyIHwgU0lERV9HUk9VUF9UWVBFIHwgQUNUSVZFX0dST1VQX1RZUEUgfCBBVVhfV0lORE9XX0dST1VQX1RZUEUpOiB2b2lkIHtcblx0XHRpZiAoc291cmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc291cmNlR3JvdXAgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5nZXRHcm91cEZvckluc3RhbmNlKHNvdXJjZSk7XG5cdFx0aWYgKCFzb3VyY2VHcm91cCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzb3VyY2VHcm91cC5yZW1vdmVJbnN0YW5jZShzb3VyY2UpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHNvdXJjZSwgZ3JvdXAgPyB7IHZpZXdDb2x1bW46IGdyb3VwIH0gOiB1bmRlZmluZWQpO1xuXG5cdH1cblxuXHRtb3ZlSW50b05ld0VkaXRvcihzb3VyY2U6IElUZXJtaW5hbEluc3RhbmNlKTogdm9pZCB7XG5cdFx0dGhpcy5tb3ZlVG9FZGl0b3Ioc291cmNlLCBBVVhfV0lORE9XX0dST1VQKTtcblx0fVxuXG5cdGFzeW5jIG1vdmVUb1Rlcm1pbmFsVmlldyhzb3VyY2U/OiBJVGVybWluYWxJbnN0YW5jZSB8IFVSSSwgdGFyZ2V0PzogSVRlcm1pbmFsSW5zdGFuY2UsIHNpZGU/OiAnYmVmb3JlJyB8ICdhZnRlcicpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoVVJJLmlzVXJpKHNvdXJjZSkpIHtcblx0XHRcdHNvdXJjZSA9IHRoaXMuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2Uoc291cmNlKTtcblx0XHR9XG5cblx0XHRpZiAoIXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5kZXRhY2hJbnN0YW5jZShzb3VyY2UpO1xuXG5cdFx0aWYgKHNvdXJjZS50YXJnZXQgIT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zaG93UGFuZWwodHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNvdXJjZS50YXJnZXQgPSBUZXJtaW5hbExvY2F0aW9uLlBhbmVsO1xuXG5cdFx0bGV0IGdyb3VwOiBJVGVybWluYWxHcm91cCB8IHVuZGVmaW5lZDtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRncm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UodGFyZ2V0KTtcblx0XHR9XG5cblx0XHRpZiAoIWdyb3VwKSB7XG5cdFx0XHRncm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmNyZWF0ZUdyb3VwKCk7XG5cdFx0fVxuXG5cdFx0Z3JvdXAuYWRkSW5zdGFuY2Uoc291cmNlKTtcblx0XHR0aGlzLnNldEFjdGl2ZUluc3RhbmNlKHNvdXJjZSk7XG5cdFx0YXdhaXQgdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKHRydWUpO1xuXG5cdFx0aWYgKHRhcmdldCAmJiBzaWRlKSB7XG5cdFx0XHRjb25zdCBpbmRleCA9IGdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmluZGV4T2YodGFyZ2V0KSArIChzaWRlID09PSAnYWZ0ZXInID8gMSA6IDApO1xuXHRcdFx0Z3JvdXAubW92ZUluc3RhbmNlKHNvdXJjZSwgaW5kZXgsIHNpZGUpO1xuXHRcdH1cblxuXHRcdC8vIEZpcmUgZXZlbnRzXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlR3JvdXAuZmlyZSh0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5hY3RpdmVHcm91cCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2luaXRJbnN0YW5jZUxpc3RlbmVycyhpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHRjb25zdCBpbnN0YW5jZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbmNlRGlzcG9zYWJsZXMuYWRkKGluc3RhbmNlLm9uRGltZW5zaW9uc0NoYW5nZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZURpbWVuc2lvbnMuZmlyZShpbnN0YW5jZSk7XG5cdFx0XHRpZiAodGhpcy5fdGVybWluYWxDb25maWd1cmF0aW9uU2VydmljZS5jb25maWcuZW5hYmxlUGVyc2lzdGVudFNlc3Npb25zICYmIHRoaXMuaXNQcm9jZXNzU3VwcG9ydFJlZ2lzdGVyZWQpIHtcblx0XHRcdFx0dGhpcy5fc2F2ZVN0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGluc3RhbmNlRGlzcG9zYWJsZXMuYWRkKGluc3RhbmNlLm9uRGlkRm9jdXModGhpcy5fb25EaWRDaGFuZ2VBY3RpdmVJbnN0YW5jZS5maXJlLCB0aGlzLl9vbkRpZENoYW5nZUFjdGl2ZUluc3RhbmNlKSk7XG5cdFx0aW5zdGFuY2VEaXNwb3NhYmxlcy5hZGQoaW5zdGFuY2Uub25SZXF1ZXN0QWRkSW5zdGFuY2VUb0dyb3VwKGFzeW5jIGUgPT4gYXdhaXQgdGhpcy5fYWRkSW5zdGFuY2VUb0dyb3VwKGluc3RhbmNlLCBlKSkpO1xuXHRcdGluc3RhbmNlRGlzcG9zYWJsZXMuYWRkKGluc3RhbmNlLm9uRGlkQ2hhbmdlU2hlbGxUeXBlKCgpID0+IHRoaXMuX2V4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvblRlcm1pbmFsOiR7aW5zdGFuY2Uuc2hlbGxUeXBlfWApKSk7XG5cdFx0aW5zdGFuY2VEaXNwb3NhYmxlcy5hZGQoRXZlbnQucnVuQW5kU3Vic2NyaWJlKGluc3RhbmNlLmNhcGFiaWxpdGllcy5vbkRpZEFkZENhcGFiaWxpdHksICgoKSA9PiB7XG5cdFx0XHRpZiAoaW5zdGFuY2UuY2FwYWJpbGl0aWVzLmhhcyhUZXJtaW5hbENhcGFiaWxpdHkuQ29tbWFuZERldGVjdGlvbikpIHtcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uVGVybWluYWxTaGVsbEludGVncmF0aW9uOiR7aW5zdGFuY2Uuc2hlbGxUeXBlfWApO1xuXHRcdFx0fVxuXHRcdH0pKSk7XG5cdFx0Y29uc3QgZGlzcG9zZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFuY2Uub25EaXNwb3NlZCgoKSA9PiB7XG5cdFx0XHRpbnN0YW5jZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3N0b3JlLmRlbGV0ZShkaXNwb3NlTGlzdGVuZXIpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2FkZEluc3RhbmNlVG9Hcm91cChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIGU6IElSZXF1ZXN0QWRkSW5zdGFuY2VUb0dyb3VwRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbElkZW50aWZpZXIgPSBwYXJzZVRlcm1pbmFsVXJpKGUudXJpKTtcblx0XHRpZiAodGVybWluYWxJZGVudGlmaWVyLmluc3RhbmNlSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzb3VyY2VJbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UgfCB1bmRlZmluZWQgPSB0aGlzLmdldEluc3RhbmNlRnJvbVJlc291cmNlKGUudXJpKTtcblxuXHRcdC8vIFRlcm1pbmFsIGZyb20gYSBkaWZmZXJlbnQgd2luZG93XG5cdFx0aWYgKCFzb3VyY2VJbnN0YW5jZSkge1xuXHRcdFx0Y29uc3QgYXR0YWNoUGVyc2lzdGVudFByb2Nlc3MgPSBhd2FpdCB0aGlzLl9wcmltYXJ5QmFja2VuZD8ucmVxdWVzdERldGFjaEluc3RhbmNlKHRlcm1pbmFsSWRlbnRpZmllci53b3Jrc3BhY2VJZCwgdGVybWluYWxJZGVudGlmaWVyLmluc3RhbmNlSWQpO1xuXHRcdFx0aWYgKGF0dGFjaFBlcnNpc3RlbnRQcm9jZXNzKSB7XG5cdFx0XHRcdHNvdXJjZUluc3RhbmNlID0gYXdhaXQgdGhpcy5jcmVhdGVUZXJtaW5hbCh7IGNvbmZpZzogeyBhdHRhY2hQZXJzaXN0ZW50UHJvY2VzcyB9LCByZXNvdXJjZTogZS51cmkgfSk7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLm1vdmVJbnN0YW5jZShzb3VyY2VJbnN0YW5jZSwgaW5zdGFuY2UsIGUuc2lkZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBWaWV3IHRlcm1pbmFsc1xuXHRcdHNvdXJjZUluc3RhbmNlID0gdGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UoZS51cmkpO1xuXHRcdGlmIChzb3VyY2VJbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UubW92ZUluc3RhbmNlKHNvdXJjZUluc3RhbmNlLCBpbnN0YW5jZSwgZS5zaWRlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUZXJtaW5hbCBlZGl0b3JzXG5cdFx0c291cmNlSW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UuZ2V0SW5zdGFuY2VGcm9tUmVzb3VyY2UoZS51cmkpO1xuXHRcdGlmIChzb3VyY2VJbnN0YW5jZSkge1xuXHRcdFx0dGhpcy5tb3ZlVG9UZXJtaW5hbFZpZXcoc291cmNlSW5zdGFuY2UsIGluc3RhbmNlLCBlLnNpZGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHRyZWdpc3RlclByb2Nlc3NTdXBwb3J0KGlzU3VwcG9ydGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFpc1N1cHBvcnRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wcm9jZXNzU3VwcG9ydENvbnRleHRLZXkuc2V0KGlzU3VwcG9ydGVkKTtcblx0XHR0aGlzLl9vbkRpZFJlZ2lzdGVyUHJvY2Vzc1N1cHBvcnQuZmlyZSgpO1xuXHR9XG5cblx0Ly8gVE9ETzogUmVtb3ZlIHRoaXMsIGl0IHNob3VsZCBsaXZlIGluIGdyb3VwL2VkaXRvciBzZXJ2aW9jZVxuXHRwcml2YXRlIF9nZXRJbmRleEZyb21JZCh0ZXJtaW5hbElkOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCB0ZXJtaW5hbEluZGV4ID0gLTE7XG5cdFx0dGhpcy5pbnN0YW5jZXMuZm9yRWFjaCgodGVybWluYWxJbnN0YW5jZSwgaSkgPT4ge1xuXHRcdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UuaW5zdGFuY2VJZCA9PT0gdGVybWluYWxJZCkge1xuXHRcdFx0XHR0ZXJtaW5hbEluZGV4ID0gaTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpZiAodGVybWluYWxJbmRleCA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVGVybWluYWwgd2l0aCBJRCAke3Rlcm1pbmFsSWR9IGRvZXMgbm90IGV4aXN0IChoYXMgaXQgYWxyZWFkeSBiZWVuIGRpc3Bvc2VkPylgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRlcm1pbmFsSW5kZXg7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3Nob3dUZXJtaW5hbENsb3NlQ29uZmlybWF0aW9uKHNpbmdsZVRlcm1pbmFsPzogYm9vbGVhbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGxldCBtZXNzYWdlOiBzdHJpbmc7XG5cdFx0Y29uc3QgZm9yZWdyb3VuZEluc3RhbmNlcyA9IHRoaXMuZm9yZWdyb3VuZEluc3RhbmNlcztcblx0XHRpZiAoZm9yZWdyb3VuZEluc3RhbmNlcy5sZW5ndGggPT09IDEgfHwgc2luZ2xlVGVybWluYWwpIHtcblx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ3Rlcm1pbmFsU2VydmljZS50ZXJtaW5hbENsb3NlQ29uZmlybWF0aW9uU2luZ3VsYXInLCBcIkRvIHlvdSB3YW50IHRvIHRlcm1pbmF0ZSB0aGUgYWN0aXZlIHRlcm1pbmFsIHNlc3Npb24/XCIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCd0ZXJtaW5hbFNlcnZpY2UudGVybWluYWxDbG9zZUNvbmZpcm1hdGlvblBsdXJhbCcsIFwiRG8geW91IHdhbnQgdG8gdGVybWluYXRlIHRoZSB7MH0gYWN0aXZlIHRlcm1pbmFsIHNlc3Npb25zP1wiLCBmb3JlZ3JvdW5kSW5zdGFuY2VzLmxlbmd0aCk7XG5cdFx0fVxuXHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0dHlwZTogJ3dhcm5pbmcnLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdHByaW1hcnlCdXR0b246IG5scy5sb2NhbGl6ZSh7IGtleTogJ3Rlcm1pbmF0ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRlcm1pbmF0ZVwiKVxuXHRcdH0pO1xuXHRcdHJldHVybiAhY29uZmlybWVkO1xuXHR9XG5cblx0Z2V0RGVmYXVsdEluc3RhbmNlSG9zdCgpOiBJVGVybWluYWxJbnN0YW5jZUhvc3Qge1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmRlZmF1bHRMb2NhdGlvbiA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZTtcblx0fVxuXG5cdGFzeW5jIGdldEluc3RhbmNlSG9zdChsb2NhdGlvbjogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZUhvc3Q+IHtcblx0XHRpZiAobG9jYXRpb24pIHtcblx0XHRcdGlmIChsb2NhdGlvbiA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGxvY2F0aW9uID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRpZiAoaGFzS2V5KGxvY2F0aW9uLCB7IHZpZXdDb2x1bW46IHRydWUgfSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGhhc0tleShsb2NhdGlvbiwgeyBwYXJlbnRUZXJtaW5hbDogdHJ1ZSB9KSkge1xuXHRcdFx0XHRcdHJldHVybiAoYXdhaXQgbG9jYXRpb24ucGFyZW50VGVybWluYWwpLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5FZGl0b3IgPyB0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UgOiB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVRlcm1pbmFsKG9wdGlvbnM/OiBJQ3JlYXRlVGVybWluYWxPcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdC8vIEF3YWl0IHRoZSBpbml0aWFsaXphdGlvbiBvZiBhdmFpbGFibGUgcHJvZmlsZXMgYXMgbG9uZyBhcyB0aGlzIGlzIG5vdCBhIHB0eSB0ZXJtaW5hbCBvciBhXG5cdFx0Ly8gbG9jYWwgdGVybWluYWwgaW4gYSByZW1vdGUgd29ya3NwYWNlIGFzIHByb2ZpbGUgd29uJ3QgYmUgdXNlZCBpbiB0aG9zZSBjYXNlcyBhbmQgdGhlc2Vcblx0XHQvLyB0ZXJtaW5hbHMgbmVlZCB0byBiZSBsYXVuY2hlZCBiZWZvcmUgcmVtb3RlIGNvbm5lY3Rpb25zIGFyZSBlc3RhYmxpc2hlZC5cblx0XHRjb25zdCBpc0xvY2FsSW5SZW1vdGVUZXJtaW5hbCA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCkgJiYgVVJJLmlzVXJpKG9wdGlvbnM/LmN3ZCkgJiYgb3B0aW9ucz8uY3dkLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlO1xuXHRcdGlmICh0aGlzLl90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlLmF2YWlsYWJsZVByb2ZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3QgaXNQdHlUZXJtaW5hbCA9IG9wdGlvbnM/LmNvbmZpZyAmJiBoYXNLZXkob3B0aW9ucy5jb25maWcsIHsgY3VzdG9tUHR5SW1wbGVtZW50YXRpb246IHRydWUgfSk7XG5cdFx0XHRpZiAoIWlzUHR5VGVybWluYWwgJiYgIWlzTG9jYWxJblJlbW90ZVRlcm1pbmFsKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jb25uZWN0aW9uU3RhdGUgPT09IFRlcm1pbmFsQ29ubmVjdGlvblN0YXRlLkNvbm5lY3RpbmcpIHtcblx0XHRcdFx0XHRtYXJrKGBjb2RlL3Rlcm1pbmFsL3dpbGxHZXRQcm9maWxlc2ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UucHJvZmlsZXNSZWFkeTtcblx0XHRcdFx0aWYgKHRoaXMuX2Nvbm5lY3Rpb25TdGF0ZSA9PT0gVGVybWluYWxDb25uZWN0aW9uU3RhdGUuQ29ubmVjdGluZykge1xuXHRcdFx0XHRcdG1hcmsoYGNvZGUvdGVybWluYWwvZGlkR2V0UHJvZmlsZXNgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBjb25maWcgPSBvcHRpb25zPy5jb25maWc7XG5cdFx0aWYgKCFjb25maWcgJiYgaXNMb2NhbEluUmVtb3RlVGVybWluYWwpIHtcblx0XHRcdGNvbnN0IGJhY2tlbmQgPSBhd2FpdCB0aGlzLl90ZXJtaW5hbEluc3RhbmNlU2VydmljZS5nZXRCYWNrZW5kKHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBleGVjdXRhYmxlID0gYXdhaXQgYmFja2VuZD8uZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKCk7XG5cdFx0XHRpZiAoZXhlY3V0YWJsZSkge1xuXHRcdFx0XHRjb25maWcgPSB7IGV4ZWN1dGFibGUgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWNvbmZpZykge1xuXHRcdFx0Y29uZmlnID0gdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5nZXREZWZhdWx0UHJvZmlsZSgpO1xuXHRcdH1cblx0XHRjb25zdCBzaGVsbExhdW5jaENvbmZpZyA9IGNvbmZpZyAmJiBoYXNLZXkoY29uZmlnLCB7IGV4dGVuc2lvbklkZW50aWZpZXI6IHRydWUgfSkgPyB7fSA6IHRoaXMuX3Rlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmNvbnZlcnRQcm9maWxlVG9TaGVsbExhdW5jaENvbmZpZyhjb25maWcgfHwge30pO1xuXG5cdFx0Ly8gR2V0IHRoZSBjb250cmlidXRlZCBwcm9maWxlIGlmIGl0IHdhcyBwcm92aWRlZFxuXHRcdGNvbnN0IGNvbnRyaWJ1dGVkUHJvZmlsZSA9IG9wdGlvbnM/LnNraXBDb250cmlidXRlZFByb2ZpbGVDaGVjayA/IHVuZGVmaW5lZCA6IGF3YWl0IHRoaXMuX2dldENvbnRyaWJ1dGVkUHJvZmlsZShzaGVsbExhdW5jaENvbmZpZywgb3B0aW9ucyk7XG5cblx0XHRjb25zdCBzcGxpdEFjdGl2ZVRlcm1pbmFsID0gdHlwZW9mIG9wdGlvbnM/LmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkob3B0aW9ucy5sb2NhdGlvbiwgeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiB0cnVlIH0pXG5cdFx0XHQ/IG9wdGlvbnMubG9jYXRpb24uc3BsaXRBY3RpdmVUZXJtaW5hbFxuXHRcdFx0OiB0eXBlb2Ygb3B0aW9ucz8ubG9jYXRpb24gPT09ICdvYmplY3QnID8gaGFzS2V5KG9wdGlvbnMubG9jYXRpb24sIHsgcGFyZW50VGVybWluYWw6IHRydWUgfSkgOiBmYWxzZTtcblxuXHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVDd2Qoc2hlbGxMYXVuY2hDb25maWcsIHNwbGl0QWN0aXZlVGVybWluYWwsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gTGF1bmNoIHRoZSBjb250cmlidXRlZCBwcm9maWxlXG5cdFx0Ly8gSWYgaXQncyBhIGN1c3RvbSBwdHkgaW1wbGVtZW50YXRpb24sIHdlIGRpZCBub3QgYXdhaXQgdGhlIHByb2ZpbGVzIHJlYWR5LCBzb1xuXHRcdC8vIHdlIGNhbm5vdCBsYXVuY2ggdGhlIGNvbnRyaWJ1dGVkIHByb2ZpbGUgYW5kIGRvaW5nIHNvIHdvdWxkIGNhdXNlIGFuIGVycm9yXG5cdFx0aWYgKCFzaGVsbExhdW5jaENvbmZpZy5jdXN0b21QdHlJbXBsZW1lbnRhdGlvbiAmJiBjb250cmlidXRlZFByb2ZpbGUpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkTG9jYXRpb24gPSBhd2FpdCB0aGlzLnJlc29sdmVMb2NhdGlvbihvcHRpb25zPy5sb2NhdGlvbik7XG5cdFx0XHRsZXQgbG9jYXRpb246IFRlcm1pbmFsTG9jYXRpb24gfCB7IHZpZXdDb2x1bW46IG51bWJlcjsgcHJlc2VydmVTdGF0ZT86IGJvb2xlYW4gfSB8IHsgc3BsaXRBY3RpdmVUZXJtaW5hbDogYm9vbGVhbiB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHNwbGl0QWN0aXZlVGVybWluYWwpIHtcblx0XHRcdFx0bG9jYXRpb24gPSByZXNvbHZlZExvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvciA/IHsgdmlld0NvbHVtbjogU0lERV9HUk9VUCB9IDogeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiB0cnVlIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsb2NhdGlvbiA9IHR5cGVvZiBvcHRpb25zPy5sb2NhdGlvbiA9PT0gJ29iamVjdCcgJiYgaGFzS2V5KG9wdGlvbnMubG9jYXRpb24sIHsgdmlld0NvbHVtbjogdHJ1ZSB9KSA/IG9wdGlvbnMubG9jYXRpb24gOiByZXNvbHZlZExvY2F0aW9uO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZShjb250cmlidXRlZFByb2ZpbGUuZXh0ZW5zaW9uSWRlbnRpZmllciwgY29udHJpYnV0ZWRQcm9maWxlLmlkLCB7XG5cdFx0XHRcdGljb246IGNvbnRyaWJ1dGVkUHJvZmlsZS5pY29uLFxuXHRcdFx0XHRjb2xvcjogY29udHJpYnV0ZWRQcm9maWxlLmNvbG9yLFxuXHRcdFx0XHRsb2NhdGlvbixcblx0XHRcdFx0Y3dkOiBzaGVsbExhdW5jaENvbmZpZy5jd2QsXG5cdFx0XHRcdHRpdGxlVGVtcGxhdGU6IGNvbnRyaWJ1dGVkUHJvZmlsZS50aXRsZVRlbXBsYXRlLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnN0YW5jZUhvc3QgPSByZXNvbHZlZExvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvciA/IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZSA6IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlO1xuXHRcdFx0Ly8gVE9ET0BtZWdhbnJvZ2dlOiBUaGlzIHJldHVybnMgdW5kZWZpbmVkIGluIHRoZSByZW1vdGUgJiB3ZWIgc21va2UgdGVzdHMgYnV0IHRoZSBmdW5jdGlvblxuXHRcdFx0Ly8gZG9lcyBub3QgcmV0dXJuIHVuZGVmaW5lZC4gVGhpcyBzaG91bGQgYmUgaGFuZGxlZCBjb3JyZWN0bHkuXG5cdFx0XHRjb25zdCBpbnN0YW5jZSA9IGluc3RhbmNlSG9zdC5pbnN0YW5jZXNbaW5zdGFuY2VIb3N0Lmluc3RhbmNlcy5sZW5ndGggLSAxXTtcblx0XHRcdGF3YWl0IGluc3RhbmNlPy5mb2N1c1doZW5SZWFkeSgpO1xuXHRcdFx0dGhpcy5fdGVybWluYWxIYXNCZWVuQ3JlYXRlZC5zZXQodHJ1ZSk7XG5cdFx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdFx0fVxuXG5cdFx0aWYgKCFzaGVsbExhdW5jaENvbmZpZy5jdXN0b21QdHlJbXBsZW1lbnRhdGlvbiAmJiAhdGhpcy5pc1Byb2Nlc3NTdXBwb3J0UmVnaXN0ZXJlZCkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRMb2NhdGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxvY2F0aW9uKG9wdGlvbnM/LmxvY2F0aW9uKTtcblx0XHRcdGxldCBsb2NhdGlvbjogVGVybWluYWxMb2NhdGlvbiB8IHsgdmlld0NvbHVtbjogbnVtYmVyOyBwcmVzZXJ2ZVN0YXRlPzogYm9vbGVhbiB9IHwgeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiBib29sZWFuIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoc3BsaXRBY3RpdmVUZXJtaW5hbCkge1xuXHRcdFx0XHRsb2NhdGlvbiA9IHJlc29sdmVkTG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yID8geyB2aWV3Q29sdW1uOiBTSURFX0dST1VQIH0gOiB7IHNwbGl0QWN0aXZlVGVybWluYWw6IHRydWUgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxvY2F0aW9uID0gdHlwZW9mIG9wdGlvbnM/LmxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkob3B0aW9ucy5sb2NhdGlvbiwgeyB2aWV3Q29sdW1uOiB0cnVlIH0pID8gb3B0aW9ucy5sb2NhdGlvbiA6IHJlc29sdmVkTG9jYXRpb247XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbnN0YW5jZUhvc3QgPSByZXNvbHZlZExvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvciA/IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZSA6IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlO1xuXHRcdFx0Zm9yIChjb25zdCBmYWxsYmFja1Byb2ZpbGUgb2YgdGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5jb250cmlidXRlZFByb2ZpbGVzKSB7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlQ291bnQgPSBpbnN0YW5jZUhvc3QuaW5zdGFuY2VzLmxlbmd0aDtcblx0XHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZShmYWxsYmFja1Byb2ZpbGUuZXh0ZW5zaW9uSWRlbnRpZmllciwgZmFsbGJhY2tQcm9maWxlLmlkLCB7XG5cdFx0XHRcdFx0aWNvbjogZmFsbGJhY2tQcm9maWxlLmljb24sXG5cdFx0XHRcdFx0Y29sb3I6IGZhbGxiYWNrUHJvZmlsZS5jb2xvcixcblx0XHRcdFx0XHRsb2NhdGlvbixcblx0XHRcdFx0XHRjd2Q6IHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCxcblx0XHRcdFx0XHR0aXRsZVRlbXBsYXRlOiBmYWxsYmFja1Byb2ZpbGUudGl0bGVUZW1wbGF0ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IGluc3RhbmNlID0gaW5zdGFuY2VIb3N0Lmluc3RhbmNlc1tpbnN0YW5jZUNvdW50XTtcblx0XHRcdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF3YWl0IGluc3RhbmNlLmZvY3VzV2hlblJlYWR5KCk7XG5cdFx0XHRcdHRoaXMuX3Rlcm1pbmFsSGFzQmVlbkNyZWF0ZWQuc2V0KHRydWUpO1xuXHRcdFx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBjcmVhdGUgdGVybWluYWwgd2hlbiBwcm9jZXNzIHN1cHBvcnQgaXMgbm90IHJlZ2lzdGVyZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLl9ldmFsdWF0ZUxvY2FsQ3dkKHNoZWxsTGF1bmNoQ29uZmlnKTtcblx0XHRjb25zdCBsb2NhdGlvbiA9IGF3YWl0IHRoaXMucmVzb2x2ZUxvY2F0aW9uKG9wdGlvbnM/LmxvY2F0aW9uKSB8fCB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlLmRlZmF1bHRMb2NhdGlvbjtcblxuXHRcdGlmIChzaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIpIHtcblx0XHRcdGNvbnN0IGluc3RhbmNlID0gdGhpcy5fdGVybWluYWxJbnN0YW5jZVNlcnZpY2UuY3JlYXRlSW5zdGFuY2Uoc2hlbGxMYXVuY2hDb25maWcsIGxvY2F0aW9uKTtcblx0XHRcdHRoaXMuX2JhY2tncm91bmRlZFRlcm1pbmFsSW5zdGFuY2VzLnB1c2goeyBpbnN0YW5jZSwgdGVybWluYWxMb2NhdGlvbk9wdGlvbnM6IG9wdGlvbnM/LmxvY2F0aW9uIH0pO1xuXHRcdFx0dGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxEaXNwb3NhYmxlcy5zZXQoaW5zdGFuY2UuaW5zdGFuY2VJZCwgaW5zdGFuY2Uub25EaXNwb3NlZChpbnN0YW5jZSA9PiB0aGlzLl9vbkJhY2tncm91bmRUZXJtaW5hbERpc3Bvc2VkKGluc3RhbmNlKSkpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHRcdFx0cmV0dXJuIGluc3RhbmNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHRoaXMuX2dldFNwbGl0UGFyZW50KG9wdGlvbnM/LmxvY2F0aW9uKTtcblx0XHR0aGlzLl90ZXJtaW5hbEhhc0JlZW5DcmVhdGVkLnNldCh0cnVlKTtcblx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudCgnb25UZXJtaW5hbDoqJyk7XG5cdFx0bGV0IGluc3RhbmNlO1xuXHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdGluc3RhbmNlID0gYXdhaXQgdGhpcy5fc3BsaXRUZXJtaW5hbChzaGVsbExhdW5jaENvbmZpZywgbG9jYXRpb24sIHBhcmVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluc3RhbmNlID0gdGhpcy5fY3JlYXRlVGVybWluYWwoc2hlbGxMYXVuY2hDb25maWcsIGxvY2F0aW9uLCBvcHRpb25zKTtcblx0XHR9XG5cdFx0aWYgKGluc3RhbmNlLnNoZWxsVHlwZSkge1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uVGVybWluYWw6JHtpbnN0YW5jZS5zaGVsbFR5cGV9YCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGluc3RhbmNlO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlQW5kRm9jdXNUZXJtaW5hbChvcHRpb25zPzogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyk6IFByb21pc2U8SVRlcm1pbmFsSW5zdGFuY2U+IHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IGF3YWl0IHRoaXMuY3JlYXRlVGVybWluYWwob3B0aW9ucyk7XG5cdFx0dGhpcy5zZXRBY3RpdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0YXdhaXQgaW5zdGFuY2UuZm9jdXNXaGVuUmVhZHkoKTtcblx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRDb250cmlidXRlZFByb2ZpbGUoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgb3B0aW9ucz86IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMpOiBQcm9taXNlPElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAob3B0aW9ucz8uY29uZmlnICYmIGhhc0tleShvcHRpb25zLmNvbmZpZywgeyBleHRlbnNpb25JZGVudGlmaWVyOiB0cnVlIH0pKSB7XG5cdFx0XHRyZXR1cm4gb3B0aW9ucy5jb25maWc7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX3Rlcm1pbmFsUHJvZmlsZVNlcnZpY2UuZ2V0Q29udHJpYnV0ZWREZWZhdWx0UHJvZmlsZShzaGVsbExhdW5jaENvbmZpZyk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVEZXRhY2hlZFRlcm1pbmFsKG9wdGlvbnM6IElEZXRhY2hlZFhUZXJtT3B0aW9ucyk6IFByb21pc2U8SURldGFjaGVkVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGNvbnN0IGN0b3IgPSBhd2FpdCBUZXJtaW5hbEluc3RhbmNlLmdldFh0ZXJtQ29uc3RydWN0b3IodGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBjYXBhYmlsaXRpZXMgPSBvcHRpb25zLmNhcGFiaWxpdGllcyA/PyBuZXcgVGVybWluYWxDYXBhYmlsaXR5U3RvcmUoKTtcblx0XHRjb25zdCB4dGVybSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFh0ZXJtVGVybWluYWwsIHVuZGVmaW5lZCwgY3Rvciwge1xuXHRcdFx0Y29sczogb3B0aW9ucy5jb2xzLFxuXHRcdFx0cm93czogb3B0aW9ucy5yb3dzLFxuXHRcdFx0eHRlcm1Db2xvclByb3ZpZGVyOiBvcHRpb25zLmNvbG9yUHJvdmlkZXIsXG5cdFx0XHRjYXBhYmlsaXRpZXMsXG5cdFx0XHRkaXNhYmxlT3ZlcnZpZXdSdWxlcjogb3B0aW9ucy5kaXNhYmxlT3ZlcnZpZXdSdWxlcixcblx0XHRcdGRldGFjaGVkOiB0cnVlLFxuXHRcdH0sIHVuZGVmaW5lZCk7XG5cblx0XHRpZiAob3B0aW9ucy5yZWFkb25seSkge1xuXHRcdFx0eHRlcm0ucmF3LmF0dGFjaEN1c3RvbUtleUV2ZW50SGFuZGxlcigoKSA9PiBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zdGFuY2UgPSBuZXcgRGV0YWNoZWRUZXJtaW5hbCh4dGVybSwgeyAuLi5vcHRpb25zLCBjYXBhYmlsaXRpZXMgfSwgdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX2RldGFjaGVkWHRlcm1zLmFkZChpbnN0YW5jZSk7XG5cdFx0Ly8gRW5zdXJlIGNlbnRyYWxpemVkIHRoZW1lL2NvbmZpZyBsaXN0ZW5lcnMgdXBkYXRlIHRoaXMgZGV0YWNoZWQgdGVybWluYWxcblx0XHR0aGlzLl9lbnN1cmVEZXRhY2hlZFRlcm1pbmFsTGlzdGVuZXJzKCk7XG5cdFx0Y29uc3QgbCA9IHh0ZXJtLm9uRGlkRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9kZXRhY2hlZFh0ZXJtcy5kZWxldGUoaW5zdGFuY2UpO1xuXHRcdFx0bC5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gaW5zdGFuY2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGEgc2luZ2xlIHNldCBvZiBnbG9iYWwgc2VydmljZSBsaXN0ZW5lcnMgKHRoZW1lL2NvbmZpZy9sb2ctbGV2ZWxcblx0ICogY2hhbmdlcykgdGhhdCBmb3J3YXJkIHVwZGF0ZXMgdG8gYWxsIGRldGFjaGVkIHh0ZXJtIGluc3RhbmNlcy4gVGhpcyBhdm9pZHNcblx0ICogZWFjaCBkZXRhY2hlZCB0ZXJtaW5hbCByZWdpc3RlcmluZyBpdHMgb3duIGxpc3RlbmVyIG9uIGdsb2JhbCBzaW5nbGV0b25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlRGV0YWNoZWRUZXJtaW5hbExpc3RlbmVycygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGV0YWNoZWRMaXN0ZW5lcnNSZWdpc3RlcmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RldGFjaGVkTGlzdGVuZXJzUmVnaXN0ZXJlZCA9IHRydWU7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX2RldGFjaGVkWHRlcm1zKSB7XG5cdFx0XHRcdGluc3RhbmNlLnh0ZXJtLnVwZGF0ZVRoZW1lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZFVwZGF0ZUNvbmZpZyA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Rlcm1pbmFsLmludGVncmF0ZWQnKSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdlZGl0b3IuZmFzdFNjcm9sbFNlbnNpdGl2aXR5JykgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbignZWRpdG9yLm1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eScpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2VkaXRvci5tdWx0aUN1cnNvck1vZGlmaWVyJyk7XG5cdFx0XHRjb25zdCBzaG91bGRVcGRhdGVUaGVtZSA9IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkRlY29yYXRpb25zRW5hYmxlZCk7XG5cdFx0XHRpZiAoc2hvdWxkVXBkYXRlQ29uZmlnIHx8IHNob3VsZFVwZGF0ZVRoZW1lKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaW5zdGFuY2Ugb2YgdGhpcy5fZGV0YWNoZWRYdGVybXMpIHtcblx0XHRcdFx0XHRpZiAoc2hvdWxkVXBkYXRlQ29uZmlnKSB7XG5cdFx0XHRcdFx0XHRpbnN0YW5jZS54dGVybS51cGRhdGVDb25maWcoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHNob3VsZFVwZGF0ZVRoZW1lKSB7XG5cdFx0XHRcdFx0XHRpbnN0YW5jZS54dGVybS51cGRhdGVUaGVtZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sb2dTZXJ2aWNlLm9uRGlkQ2hhbmdlTG9nTGV2ZWwoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBpbnN0YW5jZSBvZiB0aGlzLl9kZXRhY2hlZFh0ZXJtcykge1xuXHRcdFx0XHRpbnN0YW5jZS54dGVybS51cGRhdGVMb2dMZXZlbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDd2Qoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZywgc3BsaXRBY3RpdmVUZXJtaW5hbDogYm9vbGVhbiwgb3B0aW9ucz86IElDcmVhdGVUZXJtaW5hbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjd2QgPSBzaGVsbExhdW5jaENvbmZpZy5jd2Q7XG5cdFx0aWYgKCFjd2QpIHtcblx0XHRcdGlmIChvcHRpb25zPy5jd2QpIHtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuY3dkID0gb3B0aW9ucy5jd2Q7XG5cdFx0XHR9IGVsc2UgaWYgKHNwbGl0QWN0aXZlVGVybWluYWwgJiYgb3B0aW9ucz8ubG9jYXRpb24pIHtcblx0XHRcdFx0bGV0IHBhcmVudCA9IHRoaXMuYWN0aXZlSW5zdGFuY2U7XG5cdFx0XHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5sb2NhdGlvbiA9PT0gJ29iamVjdCcgJiYgaGFzS2V5KG9wdGlvbnMubG9jYXRpb24sIHsgcGFyZW50VGVybWluYWw6IHRydWUgfSkpIHtcblx0XHRcdFx0XHRwYXJlbnQgPSBhd2FpdCBvcHRpb25zLmxvY2F0aW9uLnBhcmVudFRlcm1pbmFsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcGFyZW50KSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgc3BsaXQgd2l0aG91dCBhbiBhY3RpdmUgaW5zdGFuY2UnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzaGVsbExhdW5jaENvbmZpZy5jd2QgPSBhd2FpdCBnZXRDd2RGb3JTcGxpdChwYXJlbnQsIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMsIHRoaXMuX2NvbW1hbmRTZXJ2aWNlLCB0aGlzLl90ZXJtaW5hbENvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zcGxpdFRlcm1pbmFsKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLCBwYXJlbnQ6IElUZXJtaW5hbEluc3RhbmNlKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdGxldCBpbnN0YW5jZTtcblx0XHQvLyBVc2UgdGhlIFVSSSBmcm9tIHRoZSBiYXNlIGluc3RhbmNlIGlmIGl0IGV4aXN0cywgdGhpcyB3aWxsIGNvcnJlY3RseSBzcGxpdCBsb2NhbCB0ZXJtaW5hbHNcblx0XHRpZiAodHlwZW9mIHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCAhPT0gJ29iamVjdCcgJiYgdHlwZW9mIHBhcmVudC5zaGVsbExhdW5jaENvbmZpZy5jd2QgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRsZXQgcGF0aCA9IHNoZWxsTGF1bmNoQ29uZmlnLmN3ZCB8fCBwYXJlbnQuc2hlbGxMYXVuY2hDb25maWcuY3dkLnBhdGg7XG5cdFx0XHRpZiAocGFyZW50LnNoZWxsTGF1bmNoQ29uZmlnLmN3ZC5hdXRob3JpdHkgJiYgcGF0aCAmJiBwYXRoWzBdICE9PSAnLycpIHtcblx0XHRcdFx0cGF0aCA9ICcvJyArIHBhdGg7XG5cdFx0XHR9XG5cdFx0XHRzaGVsbExhdW5jaENvbmZpZy5jd2QgPSBVUkkuZnJvbSh7XG5cdFx0XHRcdHNjaGVtZTogcGFyZW50LnNoZWxsTGF1bmNoQ29uZmlnLmN3ZC5zY2hlbWUsXG5cdFx0XHRcdGF1dGhvcml0eTogcGFyZW50LnNoZWxsTGF1bmNoQ29uZmlnLmN3ZC5hdXRob3JpdHksXG5cdFx0XHRcdHBhdGhcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRpZiAobG9jYXRpb24gPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yIHx8IHBhcmVudC50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHRpbnN0YW5jZSA9IGF3YWl0IHRoaXMuX3Rlcm1pbmFsRWRpdG9yU2VydmljZS5zcGxpdEluc3RhbmNlKHBhcmVudCwgc2hlbGxMYXVuY2hDb25maWcpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UocGFyZW50KTtcblx0XHRcdGlmICghZ3JvdXApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3Qgc3BsaXQgYSB0ZXJtaW5hbCB3aXRob3V0IGEgZ3JvdXAgKGluc3RhbmNlSWQ6ICR7cGFyZW50Lmluc3RhbmNlSWR9LCB0aXRsZTogJHtwYXJlbnQudGl0bGV9KWApO1xuXHRcdFx0fVxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWcucGFyZW50VGVybWluYWxJZCA9IHBhcmVudC5pbnN0YW5jZUlkO1xuXHRcdFx0aW5zdGFuY2UgPSBncm91cC5zcGxpdChzaGVsbExhdW5jaENvbmZpZyk7XG5cdFx0fVxuXHRcdHJldHVybiBpbnN0YW5jZTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRlcm1pbmFsKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIGxvY2F0aW9uOiBUZXJtaW5hbExvY2F0aW9uLCBvcHRpb25zPzogSUNyZWF0ZVRlcm1pbmFsT3B0aW9ucyk6IElUZXJtaW5hbEluc3RhbmNlIHtcblx0XHRsZXQgaW5zdGFuY2U7XG5cdFx0aWYgKGxvY2F0aW9uID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0aW5zdGFuY2UgPSB0aGlzLl90ZXJtaW5hbEluc3RhbmNlU2VydmljZS5jcmVhdGVJbnN0YW5jZShzaGVsbExhdW5jaENvbmZpZywgVGVybWluYWxMb2NhdGlvbi5FZGl0b3IpO1xuXHRcdFx0aWYgKCFzaGVsbExhdW5jaENvbmZpZy5oaWRlRnJvbVVzZXIpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yT3B0aW9ucyA9IHRoaXMuX2dldEVkaXRvck9wdGlvbnMob3B0aW9ucz8ubG9jYXRpb24pO1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnN0YW5jZSwgZWRpdG9yT3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIFRPRE86IHBhc3MgcmVzb3VyY2U/XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmNyZWF0ZUdyb3VwKHNoZWxsTGF1bmNoQ29uZmlnKTtcblx0XHRcdGluc3RhbmNlID0gZ3JvdXAudGVybWluYWxJbnN0YW5jZXNbMF07XG5cdFx0fVxuXHRcdHJldHVybiBpbnN0YW5jZTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVMb2NhdGlvbihsb2NhdGlvbj86IElUZXJtaW5hbExvY2F0aW9uT3B0aW9ucyk6IFByb21pc2U8VGVybWluYWxMb2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChsb2NhdGlvbiAmJiB0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnKSB7XG5cdFx0XHRpZiAoaGFzS2V5KGxvY2F0aW9uLCB7IHBhcmVudFRlcm1pbmFsOiB0cnVlIH0pKSB7XG5cdFx0XHRcdC8vIHNpbmNlIHdlIGRvbid0IHNldCB0aGUgdGFyZ2V0IHVubGVzcyBpdCdzIGFuIGVkaXRvciB0ZXJtaW5hbCwgdGhpcyBpcyBuZWNlc3Nhcnlcblx0XHRcdFx0Y29uc3QgcGFyZW50VGVybWluYWwgPSBhd2FpdCBsb2NhdGlvbi5wYXJlbnRUZXJtaW5hbDtcblx0XHRcdFx0cmV0dXJuICFwYXJlbnRUZXJtaW5hbC50YXJnZXQgPyBUZXJtaW5hbExvY2F0aW9uLlBhbmVsIDogcGFyZW50VGVybWluYWwudGFyZ2V0O1xuXHRcdFx0fSBlbHNlIGlmIChoYXNLZXkobG9jYXRpb24sIHsgdmlld0NvbHVtbjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRyZXR1cm4gVGVybWluYWxMb2NhdGlvbi5FZGl0b3I7XG5cdFx0XHR9IGVsc2UgaWYgKGhhc0tleShsb2NhdGlvbiwgeyBzcGxpdEFjdGl2ZVRlcm1pbmFsOiB0cnVlIH0pKSB7XG5cdFx0XHRcdC8vIHNpbmNlIHdlIGRvbid0IHNldCB0aGUgdGFyZ2V0IHVubGVzcyBpdCdzIGFuIGVkaXRvciB0ZXJtaW5hbCwgdGhpcyBpcyBuZWNlc3Nhcnlcblx0XHRcdFx0cmV0dXJuICF0aGlzLl9hY3RpdmVJbnN0YW5jZT8udGFyZ2V0ID8gVGVybWluYWxMb2NhdGlvbi5QYW5lbCA6IHRoaXMuX2FjdGl2ZUluc3RhbmNlPy50YXJnZXQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldFNwbGl0UGFyZW50KGxvY2F0aW9uPzogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChsb2NhdGlvbiAmJiB0eXBlb2YgbG9jYXRpb24gPT09ICdvYmplY3QnICYmIGhhc0tleShsb2NhdGlvbiwgeyBwYXJlbnRUZXJtaW5hbDogdHJ1ZSB9KSkge1xuXHRcdFx0cmV0dXJuIGxvY2F0aW9uLnBhcmVudFRlcm1pbmFsO1xuXHRcdH0gZWxzZSBpZiAobG9jYXRpb24gJiYgdHlwZW9mIGxvY2F0aW9uID09PSAnb2JqZWN0JyAmJiBoYXNLZXkobG9jYXRpb24sIHsgc3BsaXRBY3RpdmVUZXJtaW5hbDogdHJ1ZSB9KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWN0aXZlSW5zdGFuY2U7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFZGl0b3JPcHRpb25zKGxvY2F0aW9uPzogSVRlcm1pbmFsTG9jYXRpb25PcHRpb25zKTogVGVybWluYWxFZGl0b3JMb2NhdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGxvY2F0aW9uICYmIHR5cGVvZiBsb2NhdGlvbiA9PT0gJ29iamVjdCcgJiYgaGFzS2V5KGxvY2F0aW9uLCB7IHZpZXdDb2x1bW46IHRydWUgfSkpIHtcblx0XHRcdC8vIFRlcm1pbmFsLXNwZWNpZmljIHdvcmthcm91bmQgdG8gcmVzb2x2ZSB0aGUgYWN0aXZlIGdyb3VwIGluIGF1eGlsaWFyeSB3aW5kb3dzIHRvXG5cdFx0XHQvLyBvdmVycmlkZSB0aGUgbG9ja2VkIGVkaXRvciBiZWhhdmlvci5cblx0XHRcdGlmIChsb2NhdGlvbi52aWV3Q29sdW1uID09PSBBQ1RJVkVfR1JPVVAgJiYgaXNBdXhpbGlhcnlXaW5kb3coZ2V0QWN0aXZlV2luZG93KCkpKSB7XG5cdFx0XHRcdGxvY2F0aW9uLnZpZXdDb2x1bW4gPSB0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwLmlkO1xuXHRcdFx0XHRyZXR1cm4gbG9jYXRpb247XG5cdFx0XHR9XG5cdFx0XHRsb2NhdGlvbi52aWV3Q29sdW1uID0gY29sdW1uVG9FZGl0b3JHcm91cCh0aGlzLl9lZGl0b3JHcm91cHNTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgbG9jYXRpb24udmlld0NvbHVtbik7XG5cdFx0XHRyZXR1cm4gbG9jYXRpb247XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9ldmFsdWF0ZUxvY2FsQ3dkKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcpIHtcblx0XHRpZiAodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBZGQgd2VsY29tZSBtZXNzYWdlIGFuZCB0aXRsZSBhbm5vdGF0aW9uIGZvciBsb2NhbCB0ZXJtaW5hbHMgbGF1bmNoZWQgd2l0aGluIHJlbW90ZSBvclxuXHRcdC8vIHZpcnR1YWwgd29ya3NwYWNlc1xuXHRcdGlmICghaXNTdHJpbmcoc2hlbGxMYXVuY2hDb25maWcuY3dkKSAmJiBzaGVsbExhdW5jaENvbmZpZy5jd2Q/LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRpZiAoVmlydHVhbFdvcmtzcGFjZUNvbnRleHQuZ2V0VmFsdWUodGhpcy5fY29udGV4dEtleVNlcnZpY2UpKSB7XG5cdFx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLmluaXRpYWxUZXh0ID0gZm9ybWF0TWVzc2FnZUZvclRlcm1pbmFsKG5scy5sb2NhbGl6ZSgnbG9jYWxUZXJtaW5hbFZpcnR1YWxXb3Jrc3BhY2UnLCBcIlRoaXMgc2hlbGwgaXMgb3BlbiB0byBhIHswfWxvY2FsezF9IGZvbGRlciwgTk9UIHRvIHRoZSB2aXJ0dWFsIGZvbGRlclwiLCAnXFx4MWJbM20nLCAnXFx4MWJbMjNtJyksIHsgZXhjbHVkZUxlYWRpbmdOZXdMaW5lOiB0cnVlLCBsb3VkRm9ybWF0dGluZzogdHJ1ZSB9KTtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcudHlwZSA9ICdMb2NhbCc7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCkpIHtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcuaW5pdGlhbFRleHQgPSBmb3JtYXRNZXNzYWdlRm9yVGVybWluYWwobmxzLmxvY2FsaXplKCdsb2NhbFRlcm1pbmFsUmVtb3RlJywgXCJUaGlzIHNoZWxsIGlzIHJ1bm5pbmcgb24geW91ciB7MH1sb2NhbHsxfSBtYWNoaW5lLCBOT1Qgb24gdGhlIGNvbm5lY3RlZCByZW1vdGUgbWFjaGluZVwiLCAnXFx4MWJbM20nLCAnXFx4MWJbMjNtJyksIHsgZXhjbHVkZUxlYWRpbmdOZXdMaW5lOiB0cnVlLCBsb3VkRm9ybWF0dGluZzogdHJ1ZSB9KTtcblx0XHRcdFx0c2hlbGxMYXVuY2hDb25maWcudHlwZSA9ICdMb2NhbCc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0bW92ZVRvQmFja2dyb3VuZChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UpOiB2b2lkIHtcblx0XHQvLyBBbHJlYWR5IGJhY2tncm91bmRlZFxuXHRcdGlmICh0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5zb21lKGJnID0+IGJnLmluc3RhbmNlID09PSBpbnN0YW5jZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZnJvbSBpdHMgY3VycmVudCBsb2NhdGlvbiAocGFuZWwgZ3JvdXAgb3IgZWRpdG9yKVxuXHRcdGlmIChpbnN0YW5jZS50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yKSB7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2UuZGV0YWNoSW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLmdldEdyb3VwRm9ySW5zdGFuY2UoaW5zdGFuY2UpO1xuXHRcdFx0aWYgKCFncm91cCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRncm91cC5yZW1vdmVJbnN0YW5jZShpbnN0YW5jZSk7XG5cdFx0fVxuXG5cdFx0aW5zdGFuY2UuZGV0YWNoRnJvbUVsZW1lbnQoKTtcblxuXHRcdC8vIFRyYWNrIGluIGJhY2tncm91bmRcblx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5wdXNoKHsgaW5zdGFuY2UsIHRlcm1pbmFsTG9jYXRpb25PcHRpb25zOiBpbnN0YW5jZS50YXJnZXQgPT09IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yID8geyB2aWV3Q29sdW1uOiBBQ1RJVkVfR1JPVVAgfSA6IHVuZGVmaW5lZCB9KTtcblx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbERpc3Bvc2FibGVzLnNldChpbnN0YW5jZS5pbnN0YW5jZUlkLCBpbnN0YW5jZS5vbkRpc3Bvc2VkKGluc3RhbmNlID0+IHRoaXMuX29uQmFja2dyb3VuZFRlcm1pbmFsRGlzcG9zZWQoaW5zdGFuY2UpKSk7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUluc3RhbmNlcy5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkJhY2tncm91bmRUZXJtaW5hbERpc3Bvc2VkKGluc3RhbmNlOiBJVGVybWluYWxJbnN0YW5jZSk6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMuZmluZEluZGV4KGJhY2tncm91bmRlZCA9PiBiYWNrZ3JvdW5kZWQuaW5zdGFuY2UgPT09IGluc3RhbmNlKTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlcy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdH1cblx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbERpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0dGhpcy5fb25EaWREaXNwb3NlSW5zdGFuY2UuZmlyZShpbnN0YW5jZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc2hvd0JhY2tncm91bmRUZXJtaW5hbChpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2UsIHN1cHByZXNzU2V0QWN0aXZlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMuZmluZEluZGV4KGJnID0+IGJnLmluc3RhbmNlID09PSBpbnN0YW5jZSk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBiYWNrZ3JvdW5kVGVybWluYWwgPSB0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbEluc3RhbmNlc1tpbmRleF07XG5cdFx0dGhpcy5fYmFja2dyb3VuZGVkVGVybWluYWxJbnN0YW5jZXMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR0aGlzLl9iYWNrZ3JvdW5kZWRUZXJtaW5hbERpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoaW5zdGFuY2UuaW5zdGFuY2VJZCk7XG5cdFx0aWYgKGluc3RhbmNlLnRhcmdldCA9PT0gVGVybWluYWxMb2NhdGlvbi5QYW5lbCkge1xuXHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2UuY3JlYXRlR3JvdXAoaW5zdGFuY2UpO1xuXG5cdFx0XHQvLyBNYWtlIGFjdGl2ZSBhdXRvbWF0aWNhbGx5IGlmIGl0J3MgdGhlIGZpcnN0IGluc3RhbmNlXG5cdFx0XHRpZiAodGhpcy5pbnN0YW5jZXMubGVuZ3RoID09PSAxICYmICFzdXBwcmVzc1NldEFjdGl2ZSkge1xuXHRcdFx0XHR0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5zZXRBY3RpdmVJbnN0YW5jZUJ5SW5kZXgoMCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSBiYWNrZ3JvdW5kVGVybWluYWwudGVybWluYWxMb2NhdGlvbk9wdGlvbnMgPyB0aGlzLl9nZXRFZGl0b3JPcHRpb25zKGJhY2tncm91bmRUZXJtaW5hbC50ZXJtaW5hbExvY2F0aW9uT3B0aW9ucykgOiB0aGlzLl9nZXRFZGl0b3JPcHRpb25zKGluc3RhbmNlLnRhcmdldCk7XG5cdFx0XHR0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnN0YW5jZSwgZWRpdG9yT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJbnN0YW5jZXMuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgc2V0Q29udGFpbmVycyhwYW5lbENvbnRhaW5lcjogSFRNTEVsZW1lbnQsIHRlcm1pbmFsQ29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Rlcm1pbmFsQ29uZmlndXJhdGlvblNlcnZpY2Uuc2V0UGFuZWxDb250YWluZXIocGFuZWxDb250YWluZXIpO1xuXHRcdHRoaXMuX3Rlcm1pbmFsR3JvdXBTZXJ2aWNlLnNldENvbnRhaW5lcih0ZXJtaW5hbENvbnRhaW5lcik7XG5cdH1cblxuXG5cblx0Y3JlYXRlT25JbnN0YW5jZUV2ZW50PFQ+KGdldEV2ZW50OiAoaW5zdGFuY2U6IElUZXJtaW5hbEluc3RhbmNlKSA9PiBFdmVudDxUPik6IER5bmFtaWNMaXN0RXZlbnRNdWx0aXBsZXhlcjxJVGVybWluYWxJbnN0YW5jZSwgVD4ge1xuXHRcdHJldHVybiBuZXcgRHluYW1pY0xpc3RFdmVudE11bHRpcGxleGVyKHRoaXMuaW5zdGFuY2VzLCB0aGlzLm9uRGlkQ3JlYXRlSW5zdGFuY2UsIHRoaXMub25EaWREaXNwb3NlSW5zdGFuY2UsIGdldEV2ZW50KTtcblx0fVxuXG5cdGNyZWF0ZU9uSW5zdGFuY2VDYXBhYmlsaXR5RXZlbnQ8VCBleHRlbmRzIFRlcm1pbmFsQ2FwYWJpbGl0eSwgSz4oY2FwYWJpbGl0eUlkOiBULCBnZXRFdmVudDogKGNhcGFiaWxpdHk6IElUZXJtaW5hbENhcGFiaWxpdHlJbXBsTWFwW1RdKSA9PiBFdmVudDxLPik6IElEeW5hbWljTGlzdEV2ZW50TXVsdGlwbGV4ZXI8eyBpbnN0YW5jZTogSVRlcm1pbmFsSW5zdGFuY2U7IGRhdGE6IEsgfT4ge1xuXHRcdHJldHVybiBjcmVhdGVJbnN0YW5jZUNhcGFiaWxpdHlFdmVudE11bHRpcGxleGVyKHRoaXMuaW5zdGFuY2VzLCB0aGlzLm9uRGlkQ3JlYXRlSW5zdGFuY2UsIHRoaXMub25EaWREaXNwb3NlSW5zdGFuY2UsIGNhcGFiaWxpdHlJZCwgZ2V0RXZlbnQpO1xuXHR9XG59XG5cbmNsYXNzIFRlcm1pbmFsRWRpdG9yU3R5bGUgZXh0ZW5kcyBUaGVtYWJsZSB7XG5cdHByaXZhdGUgX3N0eWxlRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFByb2ZpbGVTZXJ2aWNlOiBJVGVybWluYWxQcm9maWxlU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoX3RoZW1lU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnQgPSBkb21TdHlsZXNoZWV0cy5jcmVhdGVTdHlsZVNoZWV0KGNvbnRhaW5lcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3N0eWxlRWxlbWVudC5yZW1vdmUoKSkpO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90ZXJtaW5hbFNlcnZpY2Uub25BbnlJbnN0YW5jZUljb25DaGFuZ2UoKCkgPT4gdGhpcy51cGRhdGVTdHlsZXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsU2VydmljZS5vbkRpZENyZWF0ZUluc3RhbmNlKCgpID0+IHRoaXMudXBkYXRlU3R5bGVzKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIFRlcm1pbmFsRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yU2VydmljZS5vbkRpZENsb3NlRWRpdG9yKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvciBpbnN0YW5jZW9mIFRlcm1pbmFsRWRpdG9ySW5wdXQpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdGVybWluYWxQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUF2YWlsYWJsZVByb2ZpbGVzKCgpID0+IHRoaXMudXBkYXRlU3R5bGVzKCkpKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblx0XHRjb25zdCBjb2xvclRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblxuXHRcdC8vIFRPRE86IGFkZCBhIHJ1bGUgY29sbGVjdG9yIHRvIGF2b2lkIGR1cGxpY2F0aW9uXG5cdFx0bGV0IGNzcyA9ICcnO1xuXG5cdFx0Y29uc3QgcHJvZHVjdEljb25UaGVtZSA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRQcm9kdWN0SWNvblRoZW1lKCk7XG5cblx0XHQvLyBBZGQgaWNvbnNcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IGljb24gPSBpbnN0YW5jZS5pY29uO1xuXHRcdFx0aWYgKCFpY29uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHVyaSA9IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpY29uIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRcdHVyaSA9IGljb247XG5cdFx0XHR9IGVsc2UgaWYgKGljb24gaW5zdGFuY2VvZiBPYmplY3QgJiYgaGFzS2V5KGljb24sIHsgbGlnaHQ6IHRydWUsIGRhcms6IHRydWUgfSkpIHtcblx0XHRcdFx0dXJpID0gaXNEYXJrKGNvbG9yVGhlbWUudHlwZSkgPyBpY29uLmRhcmsgOiBpY29uLmxpZ2h0O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaWNvbkNsYXNzZXMgPSBnZXRVcmlDbGFzc2VzKGluc3RhbmNlLCBjb2xvclRoZW1lLnR5cGUpO1xuXHRcdFx0aWYgKHVyaSBpbnN0YW5jZW9mIFVSSSAmJiBpY29uQ2xhc3NlcyAmJiBpY29uQ2xhc3Nlcy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdGNzcyArPSAoXG5cdFx0XHRcdFx0Y3NzVmFsdWUuaW5saW5lYC5tb25hY28td29ya2JlbmNoIC50ZXJtaW5hbC10YWIuJHtjc3NWYWx1ZS5jbGFzc05hbWUoaWNvbkNsYXNzZXNbMF0pfTo6YmVmb3JlXG5cdFx0XHRcdFx0e2NvbnRlbnQ6ICcnOyBiYWNrZ3JvdW5kLWltYWdlOiAke2Nzc1ZhbHVlLmFzQ1NTVXJsKHVyaSl9O31gXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoVGhlbWVJY29uLmlzVGhlbWVJY29uKGljb24pKSB7XG5cdFx0XHRcdGNvbnN0IGljb25SZWdpc3RyeSA9IGdldEljb25SZWdpc3RyeSgpO1xuXHRcdFx0XHRjb25zdCBpY29uQ29udHJpYnV0aW9uID0gaWNvblJlZ2lzdHJ5LmdldEljb24oaWNvbi5pZCk7XG5cdFx0XHRcdGlmIChpY29uQ29udHJpYnV0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVmID0gcHJvZHVjdEljb25UaGVtZS5nZXRJY29uKGljb25Db250cmlidXRpb24pO1xuXHRcdFx0XHRcdGlmIChkZWYpIHtcblx0XHRcdFx0XHRcdGNzcyArPSBjc3NWYWx1ZS5pbmxpbmVgLm1vbmFjby13b3JrYmVuY2ggLnRlcm1pbmFsLXRhYi5jb2RpY29uLSR7Y3NzVmFsdWUuY2xhc3NOYW1lKGljb24uaWQpfTo6YmVmb3JlXG5cdFx0XHRcdFx0XHRcdHtjb250ZW50OiAke2Nzc1ZhbHVlLnN0cmluZ1ZhbHVlKGRlZi5mb250Q2hhcmFjdGVyKX0gIWltcG9ydGFudDsgZm9udC1mYW1pbHk6ICR7Y3NzVmFsdWUuc3RyaW5nVmFsdWUoZGVmLmZvbnQ/LmlkID8/ICdjb2RpY29uJyl9ICFpbXBvcnRhbnQ7fWA7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGNvbG9yc1xuXHRcdGNvbnN0IGljb25Gb3JlZ3JvdW5kQ29sb3IgPSBjb2xvclRoZW1lLmdldENvbG9yKGljb25Gb3JlZ3JvdW5kKTtcblx0XHRpZiAoaWNvbkZvcmVncm91bmRDb2xvcikge1xuXHRcdFx0Y3NzICs9IGNzc1ZhbHVlLmlubGluZWAubW9uYWNvLXdvcmtiZW5jaCAuc2hvdy1maWxlLWljb25zIC5maWxlLWljb24udGVybWluYWwtdGFiOjpiZWZvcmUgeyBjb2xvcjogJHtpY29uRm9yZWdyb3VuZENvbG9yfTsgfWA7XG5cdFx0fVxuXG5cdFx0Y3NzICs9IGdldENvbG9yU3R5bGVDb250ZW50KGNvbG9yVGhlbWUsIHRydWUpO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGNzcztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLG9CQUFvQjtBQUNoQyxZQUFZLGNBQWM7QUFDMUIsU0FBUyxpQkFBaUIsZUFBa0M7QUFDNUQsU0FBUyxVQUFVLGVBQWU7QUFDbEMsU0FBUyw2QkFBNkIsU0FBUyxhQUEyQztBQUMxRixTQUFTLFlBQVksZUFBZSxpQkFBaUIsb0JBQW9CO0FBQ3pFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWEsYUFBYTtBQUNuQyxTQUFTLFdBQVc7QUFFcEIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFT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LFVBQUksS0FBSyxlQUFlLHdCQUF3QixxQkFBcUI7QUFDcEUsYUFBSyxhQUFhO0FBQUEsTUFDbkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxLQUFLLHdCQUF3Qiw2QkFBNkIsTUFBTSxLQUFLLGFBQWEsQ0FBQyxDQUFDO0FBQUEsRUFDcEc7QUFBQSxFQUVTLGVBQXFCO0FBQzdCLFVBQU0sYUFBYTtBQUNuQixVQUFNLGFBQWEsS0FBSyxjQUFjLGNBQWM7QUFHcEQsUUFBSSxNQUFNO0FBRVYsVUFBTSxtQkFBbUIsS0FBSyxjQUFjLG9CQUFvQjtBQUdoRSxlQUFXLFlBQVksS0FBSyxpQkFBaUIsV0FBVztBQUN2RCxZQUFNLE9BQU8sU0FBUztBQUN0QixVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUNBLFVBQUksTUFBTTtBQUNWLFVBQUksZ0JBQWdCLEtBQUs7QUFDeEIsY0FBTTtBQUFBLE1BQ1AsV0FBVyxnQkFBZ0IsVUFBVSxPQUFPLE1BQU0sRUFBRSxPQUFPLE1BQU0sTUFBTSxLQUFLLENBQUMsR0FBRztBQUMvRSxjQUFNLE9BQU8sV0FBVyxJQUFJLElBQUksS0FBSyxPQUFPLEtBQUs7QUFBQSxNQUNsRDtBQUNBLFlBQU0sY0FBYyxjQUFjLFVBQVUsV0FBVyxJQUFJO0FBQzNELFVBQUksZUFBZSxPQUFPLGVBQWUsWUFBWSxTQUFTLEdBQUc7QUFDaEUsZUFDQyxTQUFTLHlDQUF5QyxTQUFTLFVBQVUsWUFBWSxDQUFDLENBQUMsQ0FBQztBQUFBLHVDQUNsRCxTQUFTLFNBQVMsR0FBRyxDQUFDO0FBQUEsTUFFMUQ7QUFDQSxVQUFJLFVBQVUsWUFBWSxJQUFJLEdBQUc7QUFDaEMsY0FBTSxlQUFlLGdCQUFnQjtBQUNyQyxjQUFNLG1CQUFtQixhQUFhLFFBQVEsS0FBSyxFQUFFO0FBQ3JELFlBQUksa0JBQWtCO0FBQ3JCLGdCQUFNLE1BQU0saUJBQWlCLFFBQVEsZ0JBQWdCO0FBQ3JELGNBQUksS0FBSztBQUNSLG1CQUFPLFNBQVMsaURBQWlELFNBQVMsVUFBVSxLQUFLLEVBQUUsQ0FBQztBQUFBLG1CQUMvRSxTQUFTLFlBQVksSUFBSSxhQUFhLENBQUMsNkJBQTZCLFNBQVMsWUFBWSxJQUFJLE1BQU0sTUFBTSxTQUFTLENBQUM7QUFBQSxVQUNqSTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFVBQU0sc0JBQXNCLFdBQVcsU0FBUyxjQUFjO0FBQzlELFFBQUkscUJBQXFCO0FBQ3hCLGFBQU8sU0FBUyxxRkFBcUYsbUJBQW1CO0FBQUEsSUFDekg7QUFFQSxXQUFPLHFCQUFxQixZQUFZLElBQUk7QUFDNUMsU0FBSyxjQUFjLGNBQWM7QUFBQSxFQUNsQztBQUNEO0FBbkZNLHNCQUFOO0FBQUEsRUFLRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUkc7IiwKICAibmFtZXMiOiBbImUiLCAibG9jYXRpb24iLCAiaW5zdGFuY2UiXQp9Cg==
