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
import { Emitter } from "../../../../base/common/event.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ILocalPtyService, ITerminalLogService, TerminalExtensions, TerminalIpcChannels, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ITerminalInstanceService } from "../browser/terminal.js";
import { ITerminalProfileResolverService } from "../common/terminal.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { LocalPty } from "./localPty.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IShellEnvironmentService } from "../../../services/environment/electron-browser/shellEnvironmentService.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import * as terminalEnvironment from "../common/terminalEnvironment.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IEnvironmentVariableService } from "../common/environmentVariable.js";
import { BaseTerminalBackend } from "../browser/baseTerminalBackend.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Client as MessagePortClient } from "../../../../base/parts/ipc/common/ipc.mp.js";
import { acquirePort } from "../../../../base/parts/ipc/electron-browser/ipc.mp.js";
import { getDelayedChannel, ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { mark } from "../../../../base/common/performance.js";
import { ILifecycleService, LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
import { memoize } from "../../../../base/common/decorators.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { shouldUseEnvironmentVariableCollection } from "../../../../platform/terminal/common/terminalEnvironment.js";
import { DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
let LocalTerminalBackendContribution = class {
  constructor(instantiationService, terminalInstanceService) {
    const backend = instantiationService.createInstance(LocalTerminalBackend);
    Registry.as(TerminalExtensions.Backend).registerTerminalBackend(backend);
    terminalInstanceService.didRegisterBackend(backend);
  }
};
LocalTerminalBackendContribution.ID = "workbench.contrib.localTerminalBackend";
LocalTerminalBackendContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ITerminalInstanceService)
], LocalTerminalBackendContribution);
let LocalTerminalBackend = class extends BaseTerminalBackend {
  constructor(workspaceContextService, _lifecycleService, logService, _localPtyService, _labelService, _shellEnvironmentService, _storageService, _configurationResolverService, _configurationService, _productService, _historyService, _terminalProfileResolverService, _environmentVariableService, historyService, _nativeHostService, statusBarService, _remoteAgentService, _environmentService) {
    super(_localPtyService, logService, historyService, _configurationResolverService, statusBarService, workspaceContextService);
    this._lifecycleService = _lifecycleService;
    this._localPtyService = _localPtyService;
    this._labelService = _labelService;
    this._shellEnvironmentService = _shellEnvironmentService;
    this._storageService = _storageService;
    this._configurationResolverService = _configurationResolverService;
    this._configurationService = _configurationService;
    this._productService = _productService;
    this._historyService = _historyService;
    this._terminalProfileResolverService = _terminalProfileResolverService;
    this._environmentVariableService = _environmentVariableService;
    this._nativeHostService = _nativeHostService;
    this._remoteAgentService = _remoteAgentService;
    this._environmentService = _environmentService;
    this.remoteAuthority = void 0;
    this._ptys = /* @__PURE__ */ new Map();
    this._directProxyDisposables = this._register(new MutableDisposable());
    this._whenReady = new DeferredPromise();
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._onDidRequestDetach.event;
    this._register(this.onPtyHostRestart(() => {
      this._directProxy = void 0;
      this._directProxyClientEventually = void 0;
      this._connectToDirectProxy();
    }));
  }
  /**
   * Communicate to the direct proxy (renderer<->ptyhost) if it's available, otherwise use the
   * indirect proxy (renderer<->main<->ptyhost). The latter may not need to actually launch the
   * pty host, for example when detecting profiles.
   */
  get _proxy() {
    return this._directProxy || this._localPtyService;
  }
  get whenReady() {
    return this._whenReady.p;
  }
  setReady() {
    this._whenReady.complete();
  }
  /**
   * Request a direct connection to the pty host, this will launch the pty host process if necessary.
   */
  async _connectToDirectProxy() {
    if (this._directProxyClientEventually) {
      await this._directProxyClientEventually.p;
      return;
    }
    this._logService.debug("Starting pty host");
    const directProxyClientEventually = new DeferredPromise();
    this._directProxyClientEventually = directProxyClientEventually;
    const directProxy = ProxyChannel.toService(getDelayedChannel(this._directProxyClientEventually.p.then((client) => client.getChannel(TerminalIpcChannels.PtyHostWindow))));
    this._directProxy = directProxy;
    this._directProxyDisposables.clear();
    if (!this._remoteAgentService.getConnection()?.remoteAuthority) {
      await this._lifecycleService.when(LifecyclePhase.Restored);
    }
    mark("code/terminal/willConnectPtyHost");
    this._logService.trace("Renderer->PtyHost#connect: before acquirePort");
    acquirePort("vscode:createPtyHostMessageChannel", "vscode:createPtyHostMessageChannelResult").then((port) => {
      mark("code/terminal/didConnectPtyHost");
      this._logService.trace("Renderer->PtyHost#connect: connection established");
      const store = new DisposableStore();
      this._directProxyDisposables.value = store;
      const client = store.add(new MessagePortClient(port, `window:${this._nativeHostService.windowId}`));
      directProxyClientEventually.complete(client);
      this._onPtyHostConnected.fire();
      store.add(directProxy.onProcessData((e) => this._ptys.get(e.id)?.handleData(e.event)));
      store.add(directProxy.onDidChangeProperty((e) => this._ptys.get(e.id)?.handleDidChangeProperty(e.property)));
      store.add(directProxy.onProcessExit((e) => {
        const pty = this._ptys.get(e.id);
        if (pty) {
          pty.handleExit(e.event);
          pty.dispose();
          this._ptys.delete(e.id);
        }
      }));
      store.add(directProxy.onProcessReady((e) => this._ptys.get(e.id)?.handleReady(e.event)));
      store.add(directProxy.onProcessReplay((e) => this._ptys.get(e.id)?.handleReplay(e.event)));
      store.add(directProxy.onProcessOrphanQuestion((e) => this._ptys.get(e.id)?.handleOrphanQuestion()));
      store.add(directProxy.onDidRequestDetach((e) => this._onDidRequestDetach.fire(e)));
      this.getEnvironment();
    });
  }
  async requestDetachInstance(workspaceId, instanceId) {
    return this._proxy.requestDetachInstance(workspaceId, instanceId);
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    if (!persistentProcessId) {
      this._logService.warn("Cannot attach to feature terminals, custom pty terminals, or those without a persistentProcessId");
      return;
    }
    return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
  }
  async persistTerminalState() {
    const ids = Array.from(this._ptys.keys());
    const serialized = await this._proxy.serializeTerminalState(ids);
    this._storageService.store(TerminalStorageKeys.TerminalBufferState, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async updateTitle(id, title, titleSource) {
    await this._proxy.updateTitle(id, title, titleSource);
  }
  async updateIcon(id, userInitiated, icon, color) {
    await this._proxy.updateIcon(id, userInitiated, icon, color);
  }
  async setNextCommandId(id, commandLine, commandId) {
    await this._proxy.setNextCommandId(id, commandLine, commandId);
  }
  async updateProperty(id, property, value) {
    return this._proxy.updateProperty(id, property, value);
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) {
    await this._connectToDirectProxy();
    const executableEnv = await this._shellEnvironmentService.getShellEnv();
    const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, this._getWorkspaceId(), this._getWorkspaceName());
    const pty = new LocalPty(id, shouldPersist, this._proxy);
    this._ptys.set(id, pty);
    return pty;
  }
  async attachToProcess(id) {
    await this._connectToDirectProxy();
    try {
      await this._proxy.attachToProcess(id);
      const pty = new LocalPty(id, true, this._proxy);
      this._ptys.set(id, pty);
      return pty;
    } catch (e) {
      this._logService.warn(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async attachToRevivedProcess(id) {
    await this._connectToDirectProxy();
    try {
      const newId = await this._proxy.getRevivedPtyNewId(this._getWorkspaceId(), id) ?? id;
      return await this.attachToProcess(newId);
    } catch (e) {
      this._logService.warn(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async listProcesses() {
    await this._connectToDirectProxy();
    return this._proxy.listProcesses();
  }
  async getLatency() {
    const measurements = [];
    const sw = new StopWatch();
    if (this._directProxy) {
      await this._directProxy.getLatency();
      sw.stop();
      measurements.push({
        label: "window<->ptyhost (message port)",
        latency: sw.elapsed()
      });
      sw.reset();
    }
    const results = await this._localPtyService.getLatency();
    sw.stop();
    measurements.push({
      label: "window<->ptyhostservice<->ptyhost",
      latency: sw.elapsed()
    });
    return [
      ...measurements,
      ...results
    ];
  }
  async getPerformanceMarks() {
    return this._proxy.getPerformanceMarks();
  }
  async reduceConnectionGraceTime() {
    this._proxy.reduceConnectionGraceTime();
  }
  async getDefaultSystemShell(osOverride) {
    return this._proxy.getDefaultSystemShell(osOverride);
  }
  async getProfiles(profiles, defaultProfile, includeDetectedProfiles) {
    return this._localPtyService.getProfiles(this._workspaceContextService.getWorkspace().id, profiles, defaultProfile, includeDetectedProfiles) || [];
  }
  async getEnvironment() {
    return this._proxy.getEnvironment();
  }
  async getShellEnvironment() {
    const env = { ...await this._shellEnvironmentService.getShellEnv() };
    if (this._environmentService.debugExtensionHost.env) {
      terminalEnvironment.mergeEnvironments(env, this._environmentService.debugExtensionHost.env);
    }
    return env;
  }
  async getWslPath(original, direction) {
    return this._proxy.getWslPath(original, direction);
  }
  async setTerminalLayoutInfo(layoutInfo) {
    const args = {
      workspaceId: this._getWorkspaceId(),
      tabs: layoutInfo ? layoutInfo.tabs : [],
      background: layoutInfo ? layoutInfo.background : null
    };
    await this._proxy.setTerminalLayoutInfo(args);
    this._storageService.store(TerminalStorageKeys.TerminalLayoutInfo, JSON.stringify(args), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async getTerminalLayoutInfo() {
    const workspaceId = this._getWorkspaceId();
    const layoutArgs = { workspaceId };
    const serializedState = this._storageService.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
    const reviveBufferState = this._deserializeTerminalState(serializedState);
    if (reviveBufferState && reviveBufferState.length > 0) {
      try {
        const activeWorkspaceRootUri = this._historyService.getLastActiveWorkspaceRoot();
        const lastActiveWorkspace = activeWorkspaceRootUri ? this._workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri) ?? void 0 : void 0;
        const variableResolver = terminalEnvironment.createVariableResolver(lastActiveWorkspace, await this._terminalProfileResolverService.getEnvironment(this.remoteAuthority), this._configurationResolverService);
        mark("code/terminal/willGetReviveEnvironments");
        await Promise.all(reviveBufferState.map((state) => new Promise((r) => {
          this._resolveEnvironmentForRevive(variableResolver, state.shellLaunchConfig).then((freshEnv) => {
            state.processLaunchConfig.env = freshEnv;
            r();
          });
        })));
        mark("code/terminal/didGetReviveEnvironments");
        mark("code/terminal/willReviveTerminalProcesses");
        await this._proxy.reviveTerminalProcesses(workspaceId, reviveBufferState, Intl.DateTimeFormat().resolvedOptions().locale);
        mark("code/terminal/didReviveTerminalProcesses");
        this._storageService.remove(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
        const layoutInfo = this._storageService.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        if (layoutInfo) {
          mark("code/terminal/willSetTerminalLayoutInfo");
          await this._proxy.setTerminalLayoutInfo(JSON.parse(layoutInfo));
          mark("code/terminal/didSetTerminalLayoutInfo");
          this._storageService.remove(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        }
      } catch (e) {
        this._logService.warn("LocalTerminalBackend#getTerminalLayoutInfo Error", e.message ?? e);
      }
    }
    return this._proxy.getTerminalLayoutInfo(layoutArgs);
  }
  async _resolveEnvironmentForRevive(variableResolver, shellLaunchConfig) {
    const platformKey = isWindows ? "windows" : isMacintosh ? "osx" : "linux";
    const envFromConfigValue = this._configurationService.getValue(`terminal.integrated.env.${platformKey}`);
    const baseEnv = await (shellLaunchConfig.useShellEnvironment ? this.getShellEnvironment() : this.getEnvironment());
    const env = await terminalEnvironment.createTerminalEnvironment(shellLaunchConfig, envFromConfigValue, variableResolver, this._productService.version, this._configurationService.getValue(TerminalSettingId.DetectLocale), baseEnv);
    if (shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
      const workspaceFolder = terminalEnvironment.getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService);
      await this._environmentVariableService.mergedCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
    }
    return env;
  }
  _getWorkspaceName() {
    return this._labelService.getWorkspaceLabel(this._workspaceContextService.getWorkspace());
  }
  // #region Pty service contribution RPC calls
  installAutoReply(match, reply) {
    return this._proxy.installAutoReply(match, reply);
  }
  uninstallAllAutoReplies() {
    return this._proxy.uninstallAllAutoReplies();
  }
  // #endregion
};
__decorateClass([
  memoize
], LocalTerminalBackend.prototype, "getEnvironment", 1);
__decorateClass([
  memoize
], LocalTerminalBackend.prototype, "getShellEnvironment", 1);
LocalTerminalBackend = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, ILifecycleService),
  __decorateParam(2, ITerminalLogService),
  __decorateParam(3, ILocalPtyService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IShellEnvironmentService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IConfigurationResolverService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IHistoryService),
  __decorateParam(11, ITerminalProfileResolverService),
  __decorateParam(12, IEnvironmentVariableService),
  __decorateParam(13, IHistoryService),
  __decorateParam(14, INativeHostService),
  __decorateParam(15, IStatusbarService),
  __decorateParam(16, IRemoteAgentService),
  __decorateParam(17, INativeWorkbenchEnvironmentService)
], LocalTerminalBackend);
export {
  LocalTerminalBackendContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2VsZWN0cm9uLWJyb3dzZXIvbG9jYWxUZXJtaW5hbEJhY2tlbmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cywgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJTG9jYWxQdHlTZXJ2aWNlLCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBJUHR5SG9zdExhdGVuY3lNZWFzdXJlbWVudCwgSVB0eVNlcnZpY2UsIElTaGVsbExhdW5jaENvbmZpZywgSVRlcm1pbmFsQmFja2VuZCwgSVRlcm1pbmFsQmFja2VuZFJlZ2lzdHJ5LCBJVGVybWluYWxDaGlsZFByb2Nlc3MsIElUZXJtaW5hbEVudmlyb25tZW50LCBJVGVybWluYWxMb2dTZXJ2aWNlLCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgSVRlcm1pbmFsc0xheW91dEluZm8sIElUZXJtaW5hbHNMYXlvdXRJbmZvQnlJZCwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxFeHRlbnNpb25zLCBUZXJtaW5hbElwY0NoYW5uZWxzLCBUZXJtaW5hbFNldHRpbmdJZCwgVGl0bGVFdmVudFNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJR2V0VGVybWluYWxMYXlvdXRJbmZvQXJncywgSVByb2Nlc3NEZXRhaWxzLCBJU2V0VGVybWluYWxMYXlvdXRJbmZvQXJncyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFByb2Nlc3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElUZXJtaW5hbEluc3RhbmNlU2VydmljZSB9IGZyb20gJy4uL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbFN0b3JhZ2VLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsU3RvcmFnZUtleXMuanMnO1xuaW1wb3J0IHsgTG9jYWxQdHkgfSBmcm9tICcuL2xvY2FsUHR5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSVNoZWxsRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9zaGVsbEVudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSGlzdG9yeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9oaXN0b3J5L2NvbW1vbi9oaXN0b3J5LmpzJztcbmltcG9ydCAqIGFzIHRlcm1pbmFsRW52aXJvbm1lbnQgZnJvbSAnLi4vY29tbW9uL3Rlcm1pbmFsRW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgQmFzZVRlcm1pbmFsQmFja2VuZCB9IGZyb20gJy4uL2Jyb3dzZXIvYmFzZVRlcm1pbmFsQmFja2VuZC5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBDbGllbnQgYXMgTWVzc2FnZVBvcnRDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLm1wLmpzJztcbmltcG9ydCB7IGFjcXVpcmVQb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvZWxlY3Ryb24tYnJvd3Nlci9pcGMubXAuanMnO1xuaW1wb3J0IHsgZ2V0RGVsYXllZENoYW5uZWwsIFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgbWFyaywgUGVyZm9ybWFuY2VNYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgSUxpZmVjeWNsZVNlcnZpY2UsIExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zdGF0dXNiYXIvYnJvd3Nlci9zdGF0dXNiYXIuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2hvdWxkVXNlRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWxFbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuZXhwb3J0IGNsYXNzIExvY2FsVGVybWluYWxCYWNrZW5kQ29udHJpYnV0aW9uIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmxvY2FsVGVybWluYWxCYWNrZW5kJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEluc3RhbmNlU2VydmljZSB0ZXJtaW5hbEluc3RhbmNlU2VydmljZTogSVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IGJhY2tlbmQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbFRlcm1pbmFsQmFja2VuZCk7XG5cdFx0UmVnaXN0cnkuYXM8SVRlcm1pbmFsQmFja2VuZFJlZ2lzdHJ5PihUZXJtaW5hbEV4dGVuc2lvbnMuQmFja2VuZCkucmVnaXN0ZXJUZXJtaW5hbEJhY2tlbmQoYmFja2VuZCk7XG5cdFx0dGVybWluYWxJbnN0YW5jZVNlcnZpY2UuZGlkUmVnaXN0ZXJCYWNrZW5kKGJhY2tlbmQpO1xuXHR9XG59XG5cbmNsYXNzIExvY2FsVGVybWluYWxCYWNrZW5kIGV4dGVuZHMgQmFzZVRlcm1pbmFsQmFja2VuZCBpbXBsZW1lbnRzIElUZXJtaW5hbEJhY2tlbmQge1xuXHRyZWFkb25seSByZW1vdGVBdXRob3JpdHkgPSB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHR5czogTWFwPG51bWJlciwgTG9jYWxQdHk+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgX2RpcmVjdFByb3h5Q2xpZW50RXZlbnR1YWxseTogRGVmZXJyZWRQcm9taXNlPE1lc3NhZ2VQb3J0Q2xpZW50PiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGlyZWN0UHJveHk6IElQdHlTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXJlY3RQcm94eURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKlxuXHQgKiBDb21tdW5pY2F0ZSB0byB0aGUgZGlyZWN0IHByb3h5IChyZW5kZXJlcjwtPnB0eWhvc3QpIGlmIGl0J3MgYXZhaWxhYmxlLCBvdGhlcndpc2UgdXNlIHRoZVxuXHQgKiBpbmRpcmVjdCBwcm94eSAocmVuZGVyZXI8LT5tYWluPC0+cHR5aG9zdCkuIFRoZSBsYXR0ZXIgbWF5IG5vdCBuZWVkIHRvIGFjdHVhbGx5IGxhdW5jaCB0aGVcblx0ICogcHR5IGhvc3QsIGZvciBleGFtcGxlIHdoZW4gZGV0ZWN0aW5nIHByb2ZpbGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX3Byb3h5KCk6IElQdHlTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuX2RpcmVjdFByb3h5IHx8IHRoaXMuX2xvY2FsUHR5U2VydmljZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3doZW5SZWFkeSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0Z2V0IHdoZW5SZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMuX3doZW5SZWFkeS5wOyB9XG5cdHNldFJlYWR5KCk6IHZvaWQgeyB0aGlzLl93aGVuUmVhZHkuY29tcGxldGUoKTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdERldGFjaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVxdWVzdElkOiBudW1iZXI7IHdvcmtzcGFjZUlkOiBzdHJpbmc7IGluc3RhbmNlSWQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0RGV0YWNoID0gdGhpcy5fb25EaWRSZXF1ZXN0RGV0YWNoLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbExvZ1NlcnZpY2UgbG9nU2VydmljZTogSVRlcm1pbmFsTG9nU2VydmljZSxcblx0XHRASUxvY2FsUHR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2NhbFB0eVNlcnZpY2U6IElMb2NhbFB0eVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJU2hlbGxFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2hlbGxFbnZpcm9ubWVudFNlcnZpY2U6IElTaGVsbEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2U6IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3J5U2VydmljZTogSUhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZTogSVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZSxcblx0XHRASUVudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50VmFyaWFibGVTZXJ2aWNlOiBJRW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBoaXN0b3J5U2VydmljZTogSUhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2Ugc3RhdHVzQmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoX2xvY2FsUHR5U2VydmljZSwgbG9nU2VydmljZSwgaGlzdG9yeVNlcnZpY2UsIF9jb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLCBzdGF0dXNCYXJTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm9uUHR5SG9zdFJlc3RhcnQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGlyZWN0UHJveHkgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9kaXJlY3RQcm94eUNsaWVudEV2ZW50dWFsbHkgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9jb25uZWN0VG9EaXJlY3RQcm94eSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXF1ZXN0IGEgZGlyZWN0IGNvbm5lY3Rpb24gdG8gdGhlIHB0eSBob3N0LCB0aGlzIHdpbGwgbGF1bmNoIHRoZSBwdHkgaG9zdCBwcm9jZXNzIGlmIG5lY2Vzc2FyeS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Nvbm5lY3RUb0RpcmVjdFByb3h5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIENoZWNrIGlmIGNvbm5lY3RpbmcgaXMgaW4gcHJvZ3Jlc3Ncblx0XHRpZiAodGhpcy5fZGlyZWN0UHJveHlDbGllbnRFdmVudHVhbGx5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9kaXJlY3RQcm94eUNsaWVudEV2ZW50dWFsbHkucDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKCdTdGFydGluZyBwdHkgaG9zdCcpO1xuXHRcdGNvbnN0IGRpcmVjdFByb3h5Q2xpZW50RXZlbnR1YWxseSA9IG5ldyBEZWZlcnJlZFByb21pc2U8TWVzc2FnZVBvcnRDbGllbnQ+KCk7XG5cdFx0dGhpcy5fZGlyZWN0UHJveHlDbGllbnRFdmVudHVhbGx5ID0gZGlyZWN0UHJveHlDbGllbnRFdmVudHVhbGx5O1xuXHRcdGNvbnN0IGRpcmVjdFByb3h5ID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJUHR5U2VydmljZT4oZ2V0RGVsYXllZENoYW5uZWwodGhpcy5fZGlyZWN0UHJveHlDbGllbnRFdmVudHVhbGx5LnAudGhlbihjbGllbnQgPT4gY2xpZW50LmdldENoYW5uZWwoVGVybWluYWxJcGNDaGFubmVscy5QdHlIb3N0V2luZG93KSkpKTtcblx0XHR0aGlzLl9kaXJlY3RQcm94eSA9IGRpcmVjdFByb3h5O1xuXHRcdHRoaXMuX2RpcmVjdFByb3h5RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdC8vIFRoZSBwdHkgaG9zdCBzaG91bGQgbm90IGdldCBsYXVuY2hlZCB1bnRpbCBhdCBsZWFzdCB0aGUgd2luZG93IHJlc3RvcmVkIHBoYXNlXG5cdFx0Ly8gaWYgcmVtb3RlIGF1dGggZXhpc3RzLCBkb24ndCBhd2FpdFxuXHRcdGlmICghdGhpcy5fcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKT8ucmVtb3RlQXV0aG9yaXR5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9saWZlY3ljbGVTZXJ2aWNlLndoZW4oTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXHRcdH1cblxuXHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbENvbm5lY3RQdHlIb3N0Jyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnUmVuZGVyZXItPlB0eUhvc3QjY29ubmVjdDogYmVmb3JlIGFjcXVpcmVQb3J0Jyk7XG5cdFx0YWNxdWlyZVBvcnQoJ3ZzY29kZTpjcmVhdGVQdHlIb3N0TWVzc2FnZUNoYW5uZWwnLCAndnNjb2RlOmNyZWF0ZVB0eUhvc3RNZXNzYWdlQ2hhbm5lbFJlc3VsdCcpLnRoZW4ocG9ydCA9PiB7XG5cdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZENvbm5lY3RQdHlIb3N0Jyk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdSZW5kZXJlci0+UHR5SG9zdCNjb25uZWN0OiBjb25uZWN0aW9uIGVzdGFibGlzaGVkJyk7XG5cblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0dGhpcy5fZGlyZWN0UHJveHlEaXNwb3NhYmxlcy52YWx1ZSA9IHN0b3JlO1xuXG5cdFx0XHQvLyBUaGVyZSBhcmUgdHdvIGNvbm5lY3Rpb25zIHRvIHRoZSBwdHkgaG9zdDsgb25lIHRvIHRoZSByZWd1bGFyIHNoYXJlZCBwcm9jZXNzXG5cdFx0XHQvLyBfbG9jYWxQdHlTZXJ2aWNlLCBhbmQgb25lIGRpcmVjdGx5IHZpYSBtZXNzYWdlIHBvcnQgX3B0eUhvc3REaXJlY3RQcm94eS4gVGhlIGZvcm1lciBpc1xuXHRcdFx0Ly8gdXNlZCBmb3IgcHR5IGhvc3QgbWFuYWdlbWVudCBtZXNzYWdlcywgaXQgd291bGQgbWFrZSBzZW5zZSBpbiB0aGUgZnV0dXJlIHRvIHVzZSBhXG5cdFx0XHQvLyBzZXBhcmF0ZSBpbnRlcmZhY2Uvc2VydmljZSBmb3IgdGhpcyBvbmUuXG5cdFx0XHRjb25zdCBjbGllbnQgPSBzdG9yZS5hZGQobmV3IE1lc3NhZ2VQb3J0Q2xpZW50KHBvcnQsIGB3aW5kb3c6JHt0aGlzLl9uYXRpdmVIb3N0U2VydmljZS53aW5kb3dJZH1gKSk7XG5cdFx0XHRkaXJlY3RQcm94eUNsaWVudEV2ZW50dWFsbHkuY29tcGxldGUoY2xpZW50KTtcblx0XHRcdHRoaXMuX29uUHR5SG9zdENvbm5lY3RlZC5maXJlKCk7XG5cblx0XHRcdC8vIEF0dGFjaCBwcm9jZXNzIGxpc3RlbmVyc1xuXHRcdFx0c3RvcmUuYWRkKGRpcmVjdFByb3h5Lm9uUHJvY2Vzc0RhdGEoZSA9PiB0aGlzLl9wdHlzLmdldChlLmlkKT8uaGFuZGxlRGF0YShlLmV2ZW50KSkpO1xuXHRcdFx0c3RvcmUuYWRkKGRpcmVjdFByb3h5Lm9uRGlkQ2hhbmdlUHJvcGVydHkoZSA9PiB0aGlzLl9wdHlzLmdldChlLmlkKT8uaGFuZGxlRGlkQ2hhbmdlUHJvcGVydHkoZS5wcm9wZXJ0eSkpKTtcblx0XHRcdHN0b3JlLmFkZChkaXJlY3RQcm94eS5vblByb2Nlc3NFeGl0KGUgPT4ge1xuXHRcdFx0XHRjb25zdCBwdHkgPSB0aGlzLl9wdHlzLmdldChlLmlkKTtcblx0XHRcdFx0aWYgKHB0eSkge1xuXHRcdFx0XHRcdHB0eS5oYW5kbGVFeGl0KGUuZXZlbnQpO1xuXHRcdFx0XHRcdHB0eS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fcHR5cy5kZWxldGUoZS5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdHN0b3JlLmFkZChkaXJlY3RQcm94eS5vblByb2Nlc3NSZWFkeShlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVSZWFkeShlLmV2ZW50KSkpO1xuXHRcdFx0c3RvcmUuYWRkKGRpcmVjdFByb3h5Lm9uUHJvY2Vzc1JlcGxheShlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVSZXBsYXkoZS5ldmVudCkpKTtcblx0XHRcdHN0b3JlLmFkZChkaXJlY3RQcm94eS5vblByb2Nlc3NPcnBoYW5RdWVzdGlvbihlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVPcnBoYW5RdWVzdGlvbigpKSk7XG5cdFx0XHRzdG9yZS5hZGQoZGlyZWN0UHJveHkub25EaWRSZXF1ZXN0RGV0YWNoKGUgPT4gdGhpcy5fb25EaWRSZXF1ZXN0RGV0YWNoLmZpcmUoZSkpKTtcblxuXHRcdFx0Ly8gRWFnZXJseSBmZXRjaCB0aGUgYmFja2VuZCdzIGVudmlyb25tZW50IGZvciBtZW1vaXphdGlvblxuXHRcdFx0dGhpcy5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdERldGFjaEluc3RhbmNlKHdvcmtzcGFjZUlkOiBzdHJpbmcsIGluc3RhbmNlSWQ6IG51bWJlcik6IFByb21pc2U8SVByb2Nlc3NEZXRhaWxzIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnJlcXVlc3REZXRhY2hJbnN0YW5jZSh3b3Jrc3BhY2VJZCwgaW5zdGFuY2VJZCk7XG5cdH1cblxuXHRhc3luYyBhY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5KHJlcXVlc3RJZDogbnVtYmVyLCBwZXJzaXN0ZW50UHJvY2Vzc0lkPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFwZXJzaXN0ZW50UHJvY2Vzc0lkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0Nhbm5vdCBhdHRhY2ggdG8gZmVhdHVyZSB0ZXJtaW5hbHMsIGN1c3RvbSBwdHkgdGVybWluYWxzLCBvciB0aG9zZSB3aXRob3V0IGEgcGVyc2lzdGVudFByb2Nlc3NJZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuYWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseShyZXF1ZXN0SWQsIHBlcnNpc3RlbnRQcm9jZXNzSWQpO1xuXHR9XG5cblx0YXN5bmMgcGVyc2lzdFRlcm1pbmFsU3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaWRzID0gQXJyYXkuZnJvbSh0aGlzLl9wdHlzLmtleXMoKSk7XG5cdFx0Y29uc3Qgc2VyaWFsaXplZCA9IGF3YWl0IHRoaXMuX3Byb3h5LnNlcmlhbGl6ZVRlcm1pbmFsU3RhdGUoaWRzKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShUZXJtaW5hbFN0b3JhZ2VLZXlzLlRlcm1pbmFsQnVmZmVyU3RhdGUsIHNlcmlhbGl6ZWQsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVUaXRsZShpZDogbnVtYmVyLCB0aXRsZTogc3RyaW5nLCB0aXRsZVNvdXJjZTogVGl0bGVFdmVudFNvdXJjZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LnVwZGF0ZVRpdGxlKGlkLCB0aXRsZSwgdGl0bGVTb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlSWNvbihpZDogbnVtYmVyLCB1c2VySW5pdGlhdGVkOiBib29sZWFuLCBpY29uOiBVUkkgfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgeyBpZDogc3RyaW5nOyBjb2xvcj86IHsgaWQ6IHN0cmluZyB9IH0sIGNvbG9yPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkudXBkYXRlSWNvbihpZCwgdXNlckluaXRpYXRlZCwgaWNvbiwgY29sb3IpO1xuXHR9XG5cblx0YXN5bmMgc2V0TmV4dENvbW1hbmRJZChpZDogbnVtYmVyLCBjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LnNldE5leHRDb21tYW5kSWQoaWQsIGNvbW1hbmRMaW5lLCBjb21tYW5kSWQpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KGlkOiBudW1iZXIsIHByb3BlcnR5OiBQcm9jZXNzUHJvcGVydHlUeXBlLCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS51cGRhdGVQcm9wZXJ0eShpZCwgcHJvcGVydHksIHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVByb2Nlc3MoXG5cdFx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRjd2Q6IHN0cmluZyxcblx0XHRjb2xzOiBudW1iZXIsXG5cdFx0cm93czogbnVtYmVyLFxuXHRcdHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnLFxuXHRcdGVudjogSVByb2Nlc3NFbnZpcm9ubWVudCxcblx0XHRvcHRpb25zOiBJVGVybWluYWxQcm9jZXNzT3B0aW9ucyxcblx0XHRzaG91bGRQZXJzaXN0OiBib29sZWFuXG5cdCk6IFByb21pc2U8SVRlcm1pbmFsQ2hpbGRQcm9jZXNzPiB7XG5cdFx0YXdhaXQgdGhpcy5fY29ubmVjdFRvRGlyZWN0UHJveHkoKTtcblx0XHRjb25zdCBleGVjdXRhYmxlRW52ID0gYXdhaXQgdGhpcy5fc2hlbGxFbnZpcm9ubWVudFNlcnZpY2UuZ2V0U2hlbGxFbnYoKTtcblx0XHRjb25zdCBpZCA9IGF3YWl0IHRoaXMuX3Byb3h5LmNyZWF0ZVByb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcsIGN3ZCwgY29scywgcm93cywgdW5pY29kZVZlcnNpb24sIGVudiwgZXhlY3V0YWJsZUVudiwgb3B0aW9ucywgc2hvdWxkUGVyc2lzdCwgdGhpcy5fZ2V0V29ya3NwYWNlSWQoKSwgdGhpcy5fZ2V0V29ya3NwYWNlTmFtZSgpKTtcblx0XHRjb25zdCBwdHkgPSBuZXcgTG9jYWxQdHkoaWQsIHNob3VsZFBlcnNpc3QsIHRoaXMuX3Byb3h5KTtcblx0XHR0aGlzLl9wdHlzLnNldChpZCwgcHR5KTtcblx0XHRyZXR1cm4gcHR5O1xuXHR9XG5cblx0YXN5bmMgYXR0YWNoVG9Qcm9jZXNzKGlkOiBudW1iZXIpOiBQcm9taXNlPElUZXJtaW5hbENoaWxkUHJvY2VzcyB8IHVuZGVmaW5lZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3RUb0RpcmVjdFByb3h5KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3Byb3h5LmF0dGFjaFRvUHJvY2VzcyhpZCk7XG5cdFx0XHRjb25zdCBwdHkgPSBuZXcgTG9jYWxQdHkoaWQsIHRydWUsIHRoaXMuX3Byb3h5KTtcblx0XHRcdHRoaXMuX3B0eXMuc2V0KGlkLCBwdHkpO1xuXHRcdFx0cmV0dXJuIHB0eTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYENvdWxkbid0IGF0dGFjaCB0byBwcm9jZXNzICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgYXR0YWNoVG9SZXZpdmVkUHJvY2VzcyhpZDogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxDaGlsZFByb2Nlc3MgfCB1bmRlZmluZWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9jb25uZWN0VG9EaXJlY3RQcm94eSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBuZXdJZCA9IGF3YWl0IHRoaXMuX3Byb3h5LmdldFJldml2ZWRQdHlOZXdJZCh0aGlzLl9nZXRXb3Jrc3BhY2VJZCgpLCBpZCkgPz8gaWQ7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5hdHRhY2hUb1Byb2Nlc3MobmV3SWQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgQ291bGRuJ3QgYXR0YWNoIHRvIHByb2Nlc3MgJHtlLm1lc3NhZ2V9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBsaXN0UHJvY2Vzc2VzKCk6IFByb21pc2U8SVByb2Nlc3NEZXRhaWxzW10+IHtcblx0XHRhd2FpdCB0aGlzLl9jb25uZWN0VG9EaXJlY3RQcm94eSgpO1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5saXN0UHJvY2Vzc2VzKCk7XG5cdH1cblxuXHRhc3luYyBnZXRMYXRlbmN5KCk6IFByb21pc2U8SVB0eUhvc3RMYXRlbmN5TWVhc3VyZW1lbnRbXT4ge1xuXHRcdGNvbnN0IG1lYXN1cmVtZW50czogSVB0eUhvc3RMYXRlbmN5TWVhc3VyZW1lbnRbXSA9IFtdO1xuXHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdGlmICh0aGlzLl9kaXJlY3RQcm94eSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGlyZWN0UHJveHkuZ2V0TGF0ZW5jeSgpO1xuXHRcdFx0c3cuc3RvcCgpO1xuXHRcdFx0bWVhc3VyZW1lbnRzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogJ3dpbmRvdzwtPnB0eWhvc3QgKG1lc3NhZ2UgcG9ydCknLFxuXHRcdFx0XHRsYXRlbmN5OiBzdy5lbGFwc2VkKClcblx0XHRcdH0pO1xuXHRcdFx0c3cucmVzZXQoKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuX2xvY2FsUHR5U2VydmljZS5nZXRMYXRlbmN5KCk7XG5cdFx0c3cuc3RvcCgpO1xuXHRcdG1lYXN1cmVtZW50cy5wdXNoKHtcblx0XHRcdGxhYmVsOiAnd2luZG93PC0+cHR5aG9zdHNlcnZpY2U8LT5wdHlob3N0Jyxcblx0XHRcdGxhdGVuY3k6IHN3LmVsYXBzZWQoKVxuXHRcdH0pO1xuXHRcdHJldHVybiBbXG5cdFx0XHQuLi5tZWFzdXJlbWVudHMsXG5cdFx0XHQuLi5yZXN1bHRzXG5cdFx0XTtcblx0fVxuXG5cdGFzeW5jIGdldFBlcmZvcm1hbmNlTWFya3MoKTogUHJvbWlzZTxQZXJmb3JtYW5jZU1hcmtbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXRQZXJmb3JtYW5jZU1hcmtzKCk7XG5cdH1cblxuXHRhc3luYyByZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3Byb3h5LnJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWUoKTtcblx0fVxuXG5cdGFzeW5jIGdldERlZmF1bHRTeXN0ZW1TaGVsbChvc092ZXJyaWRlPzogT3BlcmF0aW5nU3lzdGVtKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9zT3ZlcnJpZGUpO1xuXHR9XG5cblx0YXN5bmMgZ2V0UHJvZmlsZXMocHJvZmlsZXM6IHVua25vd24sIGRlZmF1bHRQcm9maWxlOiB1bmtub3duLCBpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlcz86IGJvb2xlYW4pIHtcblx0XHRyZXR1cm4gdGhpcy5fbG9jYWxQdHlTZXJ2aWNlLmdldFByb2ZpbGVzKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmlkLCBwcm9maWxlcywgZGVmYXVsdFByb2ZpbGUsIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzKSB8fCBbXTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGFzeW5jIGdldEVudmlyb25tZW50KCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXRFbnZpcm9ubWVudCgpO1xuXHR9XG5cblx0QG1lbW9pemVcblx0YXN5bmMgZ2V0U2hlbGxFbnZpcm9ubWVudCgpOiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQ+IHtcblx0XHRjb25zdCBlbnYgPSB7IC4uLiBhd2FpdCB0aGlzLl9zaGVsbEVudmlyb25tZW50U2VydmljZS5nZXRTaGVsbEVudigpIH07XG5cblx0XHQvLyBJZiBydW5uaW5nIGluIHRoZSBjb250ZXh0IG9mIGFuIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBob3N0LCBpbmNsdWRlIHRoZSBlbnZpcm9ubWVudCBkZXJpdmVkIGZyb20gdGhlIGxhdW5jaCBjb25maWd1cmF0aW9uXG5cdFx0aWYgKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5kZWJ1Z0V4dGVuc2lvbkhvc3QuZW52KSB7XG5cdFx0XHR0ZXJtaW5hbEVudmlyb25tZW50Lm1lcmdlRW52aXJvbm1lbnRzKGVudiwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmRlYnVnRXh0ZW5zaW9uSG9zdC5lbnYpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbnY7XG5cdH1cblxuXHRhc3luYyBnZXRXc2xQYXRoKG9yaWdpbmFsOiBzdHJpbmcsIGRpcmVjdGlvbjogJ3VuaXgtdG8td2luJyB8ICd3aW4tdG8tdW5peCcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXRXc2xQYXRoKG9yaWdpbmFsLCBkaXJlY3Rpb24pO1xuXHR9XG5cblx0YXN5bmMgc2V0VGVybWluYWxMYXlvdXRJbmZvKGxheW91dEluZm8/OiBJVGVybWluYWxzTGF5b3V0SW5mb0J5SWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhcmdzOiBJU2V0VGVybWluYWxMYXlvdXRJbmZvQXJncyA9IHtcblx0XHRcdHdvcmtzcGFjZUlkOiB0aGlzLl9nZXRXb3Jrc3BhY2VJZCgpLFxuXHRcdFx0dGFiczogbGF5b3V0SW5mbyA/IGxheW91dEluZm8udGFicyA6IFtdLFxuXHRcdFx0YmFja2dyb3VuZDogbGF5b3V0SW5mbyA/IGxheW91dEluZm8uYmFja2dyb3VuZCA6IG51bGxcblx0XHR9O1xuXHRcdGF3YWl0IHRoaXMuX3Byb3h5LnNldFRlcm1pbmFsTGF5b3V0SW5mbyhhcmdzKTtcblx0XHQvLyBTdG9yZSBpbiB0aGUgc3RvcmFnZSBzZXJ2aWNlIGFzIHdlbGwgdG8gYmUgdXNlZCB3aGVuIHJldml2aW5nIHByb2Nlc3NlcyBhcyBub3JtYWxseSB0aGlzXG5cdFx0Ly8gaXMgc3RvcmVkIGluIG1lbW9yeSBvbiB0aGUgcHR5IGhvc3Rcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShUZXJtaW5hbFN0b3JhZ2VLZXlzLlRlcm1pbmFsTGF5b3V0SW5mbywgSlNPTi5zdHJpbmdpZnkoYXJncyksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRhc3luYyBnZXRUZXJtaW5hbExheW91dEluZm8oKTogUHJvbWlzZTxJVGVybWluYWxzTGF5b3V0SW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUlkID0gdGhpcy5fZ2V0V29ya3NwYWNlSWQoKTtcblx0XHRjb25zdCBsYXlvdXRBcmdzOiBJR2V0VGVybWluYWxMYXlvdXRJbmZvQXJncyA9IHsgd29ya3NwYWNlSWQgfTtcblxuXHRcdC8vIFJldml2ZSBwcm9jZXNzZXMgaWYgbmVlZGVkXG5cdFx0Y29uc3Qgc2VyaWFsaXplZFN0YXRlID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxCdWZmZXJTdGF0ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0Y29uc3QgcmV2aXZlQnVmZmVyU3RhdGUgPSB0aGlzLl9kZXNlcmlhbGl6ZVRlcm1pbmFsU3RhdGUoc2VyaWFsaXplZFN0YXRlKTtcblx0XHRpZiAocmV2aXZlQnVmZmVyU3RhdGUgJiYgcmV2aXZlQnVmZmVyU3RhdGUubGVuZ3RoID4gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gQ3JlYXRlIHZhcmlhYmxlIHJlc29sdmVyXG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkgPSB0aGlzLl9oaXN0b3J5U2VydmljZS5nZXRMYXN0QWN0aXZlV29ya3NwYWNlUm9vdCgpO1xuXHRcdFx0XHRjb25zdCBsYXN0QWN0aXZlV29ya3NwYWNlID0gYWN0aXZlV29ya3NwYWNlUm9vdFVyaSA/IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihhY3RpdmVXb3Jrc3BhY2VSb290VXJpKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHZhcmlhYmxlUmVzb2x2ZXIgPSB0ZXJtaW5hbEVudmlyb25tZW50LmNyZWF0ZVZhcmlhYmxlUmVzb2x2ZXIobGFzdEFjdGl2ZVdvcmtzcGFjZSwgYXdhaXQgdGhpcy5fdGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlLmdldEVudmlyb25tZW50KHRoaXMucmVtb3RlQXV0aG9yaXR5KSwgdGhpcy5fY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSk7XG5cblx0XHRcdFx0Ly8gUmUtcmVzb2x2ZSB0aGUgZW52aXJvbm1lbnRzIGFuZCByZXBsYWNlIGl0IG9uIHRoZSBzdGF0ZSBzbyBsb2NhbCB0ZXJtaW5hbHMgdXNlIGEgZnJlc2hcblx0XHRcdFx0Ly8gZW52aXJvbm1lbnRcblx0XHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsR2V0UmV2aXZlRW52aXJvbm1lbnRzJyk7XG5cdFx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHJldml2ZUJ1ZmZlclN0YXRlLm1hcChzdGF0ZSA9PiBuZXcgUHJvbWlzZTx2b2lkPihyID0+IHtcblx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlRW52aXJvbm1lbnRGb3JSZXZpdmUodmFyaWFibGVSZXNvbHZlciwgc3RhdGUuc2hlbGxMYXVuY2hDb25maWcpLnRoZW4oZnJlc2hFbnYgPT4ge1xuXHRcdFx0XHRcdFx0c3RhdGUucHJvY2Vzc0xhdW5jaENvbmZpZy5lbnYgPSBmcmVzaEVudjtcblx0XHRcdFx0XHRcdHIoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRHZXRSZXZpdmVFbnZpcm9ubWVudHMnKTtcblxuXHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxSZXZpdmVUZXJtaW5hbFByb2Nlc3NlcycpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eS5yZXZpdmVUZXJtaW5hbFByb2Nlc3Nlcyh3b3Jrc3BhY2VJZCwgcmV2aXZlQnVmZmVyU3RhdGUsIEludGwuRGF0ZVRpbWVGb3JtYXQoKS5yZXNvbHZlZE9wdGlvbnMoKS5sb2NhbGUpO1xuXHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL2RpZFJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzJyk7XG5cdFx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShUZXJtaW5hbFN0b3JhZ2VLZXlzLlRlcm1pbmFsQnVmZmVyU3RhdGUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0XHQvLyBJZiByZXZpdmluZyBwcm9jZXNzZXMsIHNlbmQgdGhlIHRlcm1pbmFsIGxheW91dCBpbmZvIGJhY2sgdG8gdGhlIHB0eSBob3N0IGFzIGl0XG5cdFx0XHRcdC8vIHdpbGwgbm90IGhhdmUgYmVlbiBwZXJzaXN0ZWQgb24gYXBwbGljYXRpb24gZXhpdFxuXHRcdFx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxMYXlvdXRJbmZvLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRcdFx0aWYgKGxheW91dEluZm8pIHtcblx0XHRcdFx0XHRtYXJrKCdjb2RlL3Rlcm1pbmFsL3dpbGxTZXRUZXJtaW5hbExheW91dEluZm8nKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9wcm94eS5zZXRUZXJtaW5hbExheW91dEluZm8oSlNPTi5wYXJzZShsYXlvdXRJbmZvKSk7XG5cdFx0XHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRTZXRUZXJtaW5hbExheW91dEluZm8nKTtcblx0XHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbExheW91dEluZm8sIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlOiB1bmtub3duKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignTG9jYWxUZXJtaW5hbEJhY2tlbmQjZ2V0VGVybWluYWxMYXlvdXRJbmZvIEVycm9yJywgKDx7IG1lc3NhZ2U/OiBzdHJpbmcgfT5lKS5tZXNzYWdlID8/IGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXRUZXJtaW5hbExheW91dEluZm8obGF5b3V0QXJncyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlRW52aXJvbm1lbnRGb3JSZXZpdmUodmFyaWFibGVSZXNvbHZlcjogdGVybWluYWxFbnZpcm9ubWVudC5WYXJpYWJsZVJlc29sdmVyIHwgdW5kZWZpbmVkLCBzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7XG5cdFx0Y29uc3QgcGxhdGZvcm1LZXkgPSBpc1dpbmRvd3MgPyAnd2luZG93cycgOiAoaXNNYWNpbnRvc2ggPyAnb3N4JyA6ICdsaW51eCcpO1xuXHRcdGNvbnN0IGVudkZyb21Db25maWdWYWx1ZSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElUZXJtaW5hbEVudmlyb25tZW50IHwgdW5kZWZpbmVkPihgdGVybWluYWwuaW50ZWdyYXRlZC5lbnYuJHtwbGF0Zm9ybUtleX1gKTtcblx0XHRjb25zdCBiYXNlRW52ID0gYXdhaXQgKHNoZWxsTGF1bmNoQ29uZmlnLnVzZVNoZWxsRW52aXJvbm1lbnQgPyB0aGlzLmdldFNoZWxsRW52aXJvbm1lbnQoKSA6IHRoaXMuZ2V0RW52aXJvbm1lbnQoKSk7XG5cdFx0Y29uc3QgZW52ID0gYXdhaXQgdGVybWluYWxFbnZpcm9ubWVudC5jcmVhdGVUZXJtaW5hbEVudmlyb25tZW50KHNoZWxsTGF1bmNoQ29uZmlnLCBlbnZGcm9tQ29uZmlnVmFsdWUsIHZhcmlhYmxlUmVzb2x2ZXIsIHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnZlcnNpb24sIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKFRlcm1pbmFsU2V0dGluZ0lkLkRldGVjdExvY2FsZSksIGJhc2VFbnYpO1xuXHRcdGlmIChzaG91bGRVc2VFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihzaGVsbExhdW5jaENvbmZpZykpIHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRlcm1pbmFsRW52aXJvbm1lbnQuZ2V0V29ya3NwYWNlRm9yVGVybWluYWwoc2hlbGxMYXVuY2hDb25maWcuY3dkLCB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZSwgdGhpcy5faGlzdG9yeVNlcnZpY2UpO1xuXHRcdFx0YXdhaXQgdGhpcy5fZW52aXJvbm1lbnRWYXJpYWJsZVNlcnZpY2UubWVyZ2VkQ29sbGVjdGlvbi5hcHBseVRvUHJvY2Vzc0Vudmlyb25tZW50KGVudiwgeyB3b3Jrc3BhY2VGb2xkZXIgfSwgdmFyaWFibGVSZXNvbHZlcik7XG5cdFx0fVxuXHRcdHJldHVybiBlbnY7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXb3Jrc3BhY2VOYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VMYWJlbCh0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSk7XG5cdH1cblxuXHQvLyAjcmVnaW9uIFB0eSBzZXJ2aWNlIGNvbnRyaWJ1dGlvbiBSUEMgY2FsbHNcblxuXHRpbnN0YWxsQXV0b1JlcGx5KG1hdGNoOiBzdHJpbmcsIHJlcGx5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuaW5zdGFsbEF1dG9SZXBseShtYXRjaCwgcmVwbHkpO1xuXHR9XG5cdHVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS51bmluc3RhbGxBbGxBdXRvUmVwbGllcygpO1xuXHR9XG5cblx0Ly8gI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBOEIsYUFBYSxpQkFBa0M7QUFFN0UsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyxrQkFBNkwscUJBQW1ILG9CQUFvQixxQkFBcUIseUJBQTJDO0FBRTdZLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUNB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
