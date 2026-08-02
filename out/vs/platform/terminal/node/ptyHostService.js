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
import { Emitter, Event } from "../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../base/common/lifecycle.js";
import { OS, isWindows } from "../../../base/common/platform.js";
import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ILogService, ILoggerService, LogLevel } from "../../log/common/log.js";
import { RemoteLoggerChannelClient } from "../../log/common/logIpc.js";
import { getResolvedShellEnv } from "../../shell/node/shellEnv.js";
import { RequestStore } from "../common/requestStore.js";
import { HeartbeatConstants, TerminalIpcChannels, TerminalSettingId } from "../common/terminal.js";
import { registerTerminalPlatformConfiguration } from "../common/terminalPlatformConfiguration.js";
import { detectAvailableProfiles } from "./terminalProfiles.js";
import { getSystemShell } from "../../../base/node/shell.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxRestarts"] = 5] = "MaxRestarts";
  return Constants2;
})(Constants || {});
let PtyHostService = class extends Disposable {
  constructor(_ptyHostStarter, _configurationService, _logService, _loggerService) {
    super();
    this._ptyHostStarter = _ptyHostStarter;
    this._configurationService = _configurationService;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._wasQuitRequested = false;
    this._restartCount = 0;
    this._isResponsive = true;
    this._onPtyHostExit = this._register(new Emitter());
    this.onPtyHostExit = this._onPtyHostExit.event;
    this._onPtyHostStart = this._register(new Emitter());
    this.onPtyHostStart = this._onPtyHostStart.event;
    this._onPtyHostUnresponsive = this._register(new Emitter());
    this.onPtyHostUnresponsive = this._onPtyHostUnresponsive.event;
    this._onPtyHostResponsive = this._register(new Emitter());
    this.onPtyHostResponsive = this._onPtyHostResponsive.event;
    this._onPtyHostRequestResolveVariables = this._register(new Emitter());
    this.onPtyHostRequestResolveVariables = this._onPtyHostRequestResolveVariables.event;
    this._onProcessData = this._register(new Emitter());
    this.onProcessData = this._onProcessData.event;
    this._onProcessReady = this._register(new Emitter());
    this.onProcessReady = this._onProcessReady.event;
    this._onProcessReplay = this._register(new Emitter());
    this.onProcessReplay = this._onProcessReplay.event;
    this._onProcessOrphanQuestion = this._register(new Emitter());
    this.onProcessOrphanQuestion = this._onProcessOrphanQuestion.event;
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._onDidRequestDetach.event;
    this._onDidChangeProperty = this._register(new Emitter());
    this.onDidChangeProperty = this._onDidChangeProperty.event;
    this._onProcessExit = this._register(new Emitter());
    this.onProcessExit = this._onProcessExit.event;
    this._ptyHostStore = this._register(new DisposableStore());
    registerTerminalPlatformConfiguration();
    this._register(this._ptyHostStarter);
    this._register(toDisposable(() => this._disposePtyHost()));
    this._resolveVariablesRequestStore = this._register(new RequestStore(void 0, this._logService));
    this._register(this._resolveVariablesRequestStore.onCreateRequest(this._onPtyHostRequestResolveVariables.fire, this._onPtyHostRequestResolveVariables));
    if (this._ptyHostStarter.onRequestConnection) {
      this._register(Event.once(this._ptyHostStarter.onRequestConnection)(() => this._ensurePtyHost()));
    }
    if (this._ptyHostStarter.onWillShutdown) {
      this._register(this._ptyHostStarter.onWillShutdown(() => this._wasQuitRequested = true));
    }
  }
  get _proxy() {
    this._ensurePtyHost();
    return this.__proxy;
  }
  /**
   * Get the proxy if it exists, otherwise undefined. This is used when calls are not needed to be
   * passed through to the pty host if it has not yet been spawned.
   */
  get _optionalProxy() {
    return this.__proxy;
  }
  _ensurePtyHost() {
    if (!this.__connection) {
      this._startPtyHost();
    }
  }
  get _ignoreProcessNames() {
    return this._configurationService.getValue(TerminalSettingId.IgnoreProcessNames);
  }
  async _refreshIgnoreProcessNames() {
    return this._optionalProxy?.refreshIgnoreProcessNames?.(this._ignoreProcessNames);
  }
  async _resolveShellEnv() {
    if (isWindows) {
      return process.env;
    }
    try {
      return await getResolvedShellEnv(this._configurationService, this._logService, { _: [] }, process.env);
    } catch (error) {
      this._logService.error("ptyHost was unable to resolve shell environment", error);
      return {};
    }
  }
  _startPtyHost() {
    const connection = this._ptyHostStarter.start();
    const client = connection.client;
    const store = this._ptyHostStore;
    store.add(connection.store);
    if (this._logService.getLevel() === LogLevel.Trace) {
      this._logService.trace("PtyHostService#_startPtyHost", new Error().stack?.replace(/^Error/, ""));
    }
    const heartbeatService = ProxyChannel.toService(client.getChannel(TerminalIpcChannels.Heartbeat));
    store.add(heartbeatService.onBeat(() => this._handleHeartbeat()));
    this._handleHeartbeat(true);
    store.add(connection.onDidProcessExit((e) => {
      this._onPtyHostExit.fire(e.code);
      if (!this._wasQuitRequested && !this._store.isDisposed) {
        if (this._restartCount <= 5 /* MaxRestarts */) {
          this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}`);
          this._restartCount++;
          this.restartPtyHost();
        } else {
          this._logService.error(`ptyHost terminated unexpectedly with code ${e.code}, giving up`);
        }
      }
    }));
    const proxy = ProxyChannel.toService(client.getChannel(TerminalIpcChannels.PtyHost));
    store.add(proxy.onProcessData((e) => this._onProcessData.fire(e)));
    store.add(proxy.onProcessReady((e) => this._onProcessReady.fire(e)));
    store.add(proxy.onProcessExit((e) => this._onProcessExit.fire(e)));
    store.add(proxy.onDidChangeProperty((e) => this._onDidChangeProperty.fire(e)));
    store.add(proxy.onProcessReplay((e) => this._onProcessReplay.fire(e)));
    store.add(proxy.onProcessOrphanQuestion((e) => this._onProcessOrphanQuestion.fire(e)));
    store.add(proxy.onDidRequestDetach((e) => this._onDidRequestDetach.fire(e)));
    store.add(new RemoteLoggerChannelClient(this._loggerService, client.getChannel(TerminalIpcChannels.Logger)));
    this.__connection = connection;
    this.__proxy = proxy;
    this._onPtyHostStart.fire();
    store.add(this._configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration(TerminalSettingId.IgnoreProcessNames)) {
        await this._refreshIgnoreProcessNames();
      }
    }));
    this._refreshIgnoreProcessNames();
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName) {
    const timeout = setTimeout(() => this._handleUnresponsiveCreateProcess(), HeartbeatConstants.CreateProcessTimeout);
    const id = await this._proxy.createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, executableEnv, options, shouldPersist, workspaceId, workspaceName);
    clearTimeout(timeout);
    return id;
  }
  updateTitle(id, title, titleSource) {
    return this._proxy.updateTitle(id, title, titleSource);
  }
  updateIcon(id, userInitiated, icon, color) {
    return this._proxy.updateIcon(id, userInitiated, icon, color);
  }
  attachToProcess(id) {
    return this._proxy.attachToProcess(id);
  }
  detachFromProcess(id, forcePersist) {
    return this._proxy.detachFromProcess(id, forcePersist);
  }
  shutdownAll() {
    return this._proxy.shutdownAll();
  }
  listProcesses() {
    return this._proxy.listProcesses();
  }
  async getPerformanceMarks() {
    return this._optionalProxy?.getPerformanceMarks() ?? [];
  }
  async reduceConnectionGraceTime() {
    return this._optionalProxy?.reduceConnectionGraceTime();
  }
  start(id) {
    return this._proxy.start(id);
  }
  shutdown(id, immediate) {
    return this._proxy.shutdown(id, immediate);
  }
  input(id, data) {
    return this._proxy.input(id, data);
  }
  sendSignal(id, signal) {
    return this._proxy.sendSignal(id, signal);
  }
  processBinary(id, data) {
    return this._proxy.processBinary(id, data);
  }
  resize(id, cols, rows, pixelWidth, pixelHeight) {
    return this._proxy.resize(id, cols, rows, pixelWidth, pixelHeight);
  }
  clearBuffer(id) {
    return this._proxy.clearBuffer(id);
  }
  acknowledgeDataEvent(id, charCount) {
    return this._proxy.acknowledgeDataEvent(id, charCount);
  }
  setUnicodeVersion(id, version) {
    return this._proxy.setUnicodeVersion(id, version);
  }
  setNextCommandId(id, commandLine, commandId) {
    return this._proxy.setNextCommandId(id, commandLine, commandId);
  }
  getInitialCwd(id) {
    return this._proxy.getInitialCwd(id);
  }
  getCwd(id) {
    return this._proxy.getCwd(id);
  }
  async getLatency() {
    const sw = new StopWatch();
    const results = await this._proxy.getLatency();
    sw.stop();
    return [
      {
        label: "ptyhostservice<->ptyhost",
        latency: sw.elapsed()
      },
      ...results
    ];
  }
  orphanQuestionReply(id) {
    return this._proxy.orphanQuestionReply(id);
  }
  installAutoReply(match, reply) {
    return this._proxy.installAutoReply(match, reply);
  }
  uninstallAllAutoReplies() {
    return this._proxy.uninstallAllAutoReplies();
  }
  getDefaultSystemShell(osOverride) {
    return this._optionalProxy?.getDefaultSystemShell(osOverride) ?? getSystemShell(osOverride ?? OS, process.env);
  }
  async getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles = false) {
    const shellEnv = await this._resolveShellEnv();
    return detectAvailableProfiles(profiles, defaultProfile, includeDetectedProfiles, this._configurationService, shellEnv, void 0, this._logService, this._resolveVariables.bind(this, workspaceId));
  }
  async getEnvironment() {
    if (!this.__proxy) {
      return { ...process.env };
    }
    return this._proxy.getEnvironment();
  }
  getWslPath(original, direction) {
    return this._proxy.getWslPath(original, direction);
  }
  getRevivedPtyNewId(workspaceId, id) {
    return this._proxy.getRevivedPtyNewId(workspaceId, id);
  }
  setTerminalLayoutInfo(args) {
    return this._proxy.setTerminalLayoutInfo(args);
  }
  async getTerminalLayoutInfo(args) {
    return this._optionalProxy?.getTerminalLayoutInfo(args);
  }
  async requestDetachInstance(workspaceId, instanceId) {
    return this._proxy.requestDetachInstance(workspaceId, instanceId);
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    return this._proxy.acceptDetachInstanceReply(requestId, persistentProcessId);
  }
  async freePortKillProcess(port) {
    if (!this._proxy.freePortKillProcess) {
      throw new Error("freePortKillProcess does not exist on the pty proxy");
    }
    return this._proxy.freePortKillProcess(port);
  }
  async serializeTerminalState(ids) {
    return this._proxy.serializeTerminalState(ids);
  }
  async reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate) {
    return this._proxy.reviveTerminalProcesses(workspaceId, state, dateTimeFormatLocate);
  }
  async refreshProperty(id, property) {
    return this._proxy.refreshProperty(id, property);
  }
  async updateProperty(id, property, value) {
    return this._proxy.updateProperty(id, property, value);
  }
  async restartPtyHost() {
    this._disposePtyHost();
    this._isResponsive = true;
    this._startPtyHost();
  }
  _disposePtyHost() {
    this._clearHeartbeatTimeouts();
    this._optionalProxy?.shutdownAll().catch(() => {
    });
    this.__connection = void 0;
    this.__proxy = void 0;
    this._ptyHostStore.clear();
  }
  _handleHeartbeat(isConnecting) {
    this._clearHeartbeatTimeouts();
    this._heartbeatFirstTimeout = setTimeout(() => this._handleHeartbeatFirstTimeout(), isConnecting ? HeartbeatConstants.ConnectingBeatInterval : HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier);
    if (!this._isResponsive) {
      this._isResponsive = true;
      this._onPtyHostResponsive.fire();
    }
  }
  _handleHeartbeatFirstTimeout() {
    this._logService.warn(`No ptyHost heartbeat after ${HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier / 1e3} seconds`);
    this._heartbeatFirstTimeout = void 0;
    this._heartbeatSecondTimeout = setTimeout(() => this._handleHeartbeatSecondTimeout(), HeartbeatConstants.BeatInterval * HeartbeatConstants.SecondWaitMultiplier);
  }
  _handleHeartbeatSecondTimeout() {
    this._logService.error(`No ptyHost heartbeat after ${(HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier + HeartbeatConstants.BeatInterval * HeartbeatConstants.FirstWaitMultiplier) / 1e3} seconds`);
    this._heartbeatSecondTimeout = void 0;
    if (this._isResponsive) {
      this._isResponsive = false;
      this._onPtyHostUnresponsive.fire();
    }
  }
  _handleUnresponsiveCreateProcess() {
    this._clearHeartbeatTimeouts();
    this._logService.error(`No ptyHost response to createProcess after ${HeartbeatConstants.CreateProcessTimeout / 1e3} seconds`);
    if (this._isResponsive) {
      this._isResponsive = false;
      this._onPtyHostUnresponsive.fire();
    }
  }
  _clearHeartbeatTimeouts() {
    if (this._heartbeatFirstTimeout) {
      clearTimeout(this._heartbeatFirstTimeout);
      this._heartbeatFirstTimeout = void 0;
    }
    if (this._heartbeatSecondTimeout) {
      clearTimeout(this._heartbeatSecondTimeout);
      this._heartbeatSecondTimeout = void 0;
    }
  }
  _resolveVariables(workspaceId, text) {
    return this._resolveVariablesRequestStore.createRequest({ workspaceId, originalText: text });
  }
  async acceptPtyHostResolvedVariables(requestId, resolved) {
    this._resolveVariablesRequestStore.acceptReply(requestId, resolved);
  }
};
PtyHostService = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ILoggerService)
], PtyHostService);
export {
  PtyHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Rlcm1pbmFsL25vZGUvcHR5SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIE9TLCBPcGVyYXRpbmdTeXN0ZW0sIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgSUxvZ2dlclNlcnZpY2UsIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUmVtb3RlTG9nZ2VyQ2hhbm5lbENsaWVudCB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nSXBjLmpzJztcbmltcG9ydCB7IGdldFJlc29sdmVkU2hlbGxFbnYgfSBmcm9tICcuLi8uLi9zaGVsbC9ub2RlL3NoZWxsRW52LmpzJztcbmltcG9ydCB7IElQdHlIb3N0UHJvY2Vzc1JlcGxheUV2ZW50IH0gZnJvbSAnLi4vY29tbW9uL2NhcGFiaWxpdGllcy9jYXBhYmlsaXRpZXMuanMnO1xuaW1wb3J0IHsgUmVxdWVzdFN0b3JlIH0gZnJvbSAnLi4vY29tbW9uL3JlcXVlc3RTdG9yZS5qcyc7XG5pbXBvcnQgeyBIZWFydGJlYXRDb25zdGFudHMsIElIZWFydGJlYXRTZXJ2aWNlLCBJVGVybWluYWxMYXVuY2hSZXN1bHQsIElQcm9jZXNzRGF0YUV2ZW50LCBJUHJvY2Vzc1Byb3BlcnR5LCBJUHJvY2Vzc1Byb3BlcnR5TWFwLCBJUHJvY2Vzc1JlYWR5RXZlbnQsIElQdHlIb3N0TGF0ZW5jeU1lYXN1cmVtZW50LCBJUHR5SG9zdFNlcnZpY2UsIElQdHlTZXJ2aWNlLCBJUmVxdWVzdFJlc29sdmVWYXJpYWJsZXNFdmVudCwgSVNlcmlhbGl6ZWRUZXJtaW5hbFN0YXRlLCBJU2hlbGxMYXVuY2hDb25maWcsIElUZXJtaW5hbExhdW5jaEVycm9yLCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgSVRlcm1pbmFsUHJvZmlsZSwgSVRlcm1pbmFsc0xheW91dEluZm8sIFByb2Nlc3NQcm9wZXJ0eVR5cGUsIFRlcm1pbmFsSWNvbiwgVGVybWluYWxJcGNDaGFubmVscywgVGVybWluYWxTZXR0aW5nSWQsIFRpdGxlRXZlbnRTb3VyY2UgfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJUZXJtaW5hbFBsYXRmb3JtQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFBsYXRmb3JtQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJR2V0VGVybWluYWxMYXlvdXRJbmZvQXJncywgSVByb2Nlc3NEZXRhaWxzLCBJU2V0VGVybWluYWxMYXlvdXRJbmZvQXJncyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFByb2Nlc3MuanMnO1xuaW1wb3J0IHsgSVB0eUhvc3RDb25uZWN0aW9uLCBJUHR5SG9zdFN0YXJ0ZXIgfSBmcm9tICcuL3B0eUhvc3QuanMnO1xuaW1wb3J0IHsgZGV0ZWN0QXZhaWxhYmxlUHJvZmlsZXMgfSBmcm9tICcuL3Rlcm1pbmFsUHJvZmlsZXMuanMnO1xuaW1wb3J0ICogYXMgcGVyZm9ybWFuY2UgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgZ2V0U3lzdGVtU2hlbGwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvc2hlbGwuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcblxuZW51bSBDb25zdGFudHMge1xuXHRNYXhSZXN0YXJ0cyA9IDVcbn1cblxuLyoqXG4gKiBUaGlzIHNlcnZpY2UgaW1wbGVtZW50cyBJUHR5U2VydmljZSBieSBsYXVuY2hpbmcgYSBwdHkgaG9zdCBwcm9jZXNzLCBmb3J3YXJkaW5nIG1lc3NhZ2VzIHRvIGFuZFxuICogZnJvbSB0aGUgcHR5IGhvc3QgcHJvY2VzcyBhbmQgbWFuYWdlcyB0aGUgY29ubmVjdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIFB0eUhvc3RTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElQdHlIb3N0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX19jb25uZWN0aW9uPzogSVB0eUhvc3RDb25uZWN0aW9uO1xuXHQvLyBQcm94eUNoYW5uZWwgaXMgbm90IHVzZWQgaGVyZSBiZWNhdXNlIGV2ZW50cyBnZXQgbG9zdCB3aGVuIGZvcndhcmRpbmcgYWNyb3NzIG11bHRpcGxlIHByb3hpZXNcblx0cHJpdmF0ZSBfX3Byb3h5PzogSVB0eVNlcnZpY2U7XG5cblx0cHJpdmF0ZSBnZXQgX3Byb3h5KCk6IElQdHlTZXJ2aWNlIHtcblx0XHR0aGlzLl9lbnN1cmVQdHlIb3N0KCk7XG5cdFx0cmV0dXJuIHRoaXMuX19wcm94eSE7XG5cdH1cblx0LyoqXG5cdCAqIEdldCB0aGUgcHJveHkgaWYgaXQgZXhpc3RzLCBvdGhlcndpc2UgdW5kZWZpbmVkLiBUaGlzIGlzIHVzZWQgd2hlbiBjYWxscyBhcmUgbm90IG5lZWRlZCB0byBiZVxuXHQgKiBwYXNzZWQgdGhyb3VnaCB0byB0aGUgcHR5IGhvc3QgaWYgaXQgaGFzIG5vdCB5ZXQgYmVlbiBzcGF3bmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXQgX29wdGlvbmFsUHJveHkoKTogSVB0eVNlcnZpY2UgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9fcHJveHk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVQdHlIb3N0KCkge1xuXHRcdGlmICghdGhpcy5fX2Nvbm5lY3Rpb24pIHtcblx0XHRcdHRoaXMuX3N0YXJ0UHR5SG9zdCgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc29sdmVWYXJpYWJsZXNSZXF1ZXN0U3RvcmU6IFJlcXVlc3RTdG9yZTxzdHJpbmdbXSwgeyB3b3Jrc3BhY2VJZDogc3RyaW5nOyBvcmlnaW5hbFRleHQ6IHN0cmluZ1tdIH0+O1xuXHRwcml2YXRlIF93YXNRdWl0UmVxdWVzdGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX3Jlc3RhcnRDb3VudCA9IDA7XG5cdHByaXZhdGUgX2lzUmVzcG9uc2l2ZSA9IHRydWU7XG5cdHByaXZhdGUgX2hlYXJ0YmVhdEZpcnN0VGltZW91dD86IFRpbWVvdXQ7XG5cdHByaXZhdGUgX2hlYXJ0YmVhdFNlY29uZFRpbWVvdXQ/OiBUaW1lb3V0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHR5SG9zdEV4aXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRyZWFkb25seSBvblB0eUhvc3RFeGl0ID0gdGhpcy5fb25QdHlIb3N0RXhpdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHlIb3N0U3RhcnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25QdHlIb3N0U3RhcnQgPSB0aGlzLl9vblB0eUhvc3RTdGFydC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHlIb3N0VW5yZXNwb25zaXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uUHR5SG9zdFVucmVzcG9uc2l2ZSA9IHRoaXMuX29uUHR5SG9zdFVucmVzcG9uc2l2ZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHlIb3N0UmVzcG9uc2l2ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblB0eUhvc3RSZXNwb25zaXZlID0gdGhpcy5fb25QdHlIb3N0UmVzcG9uc2l2ZS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHlIb3N0UmVxdWVzdFJlc29sdmVWYXJpYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUmVxdWVzdFJlc29sdmVWYXJpYWJsZXNFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uUHR5SG9zdFJlcXVlc3RSZXNvbHZlVmFyaWFibGVzID0gdGhpcy5fb25QdHlIb3N0UmVxdWVzdFJlc29sdmVWYXJpYWJsZXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzRGF0YSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgZXZlbnQ6IElQcm9jZXNzRGF0YUV2ZW50IHwgc3RyaW5nIH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NEYXRhID0gdGhpcy5fb25Qcm9jZXNzRGF0YS5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25Qcm9jZXNzUmVhZHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGlkOiBudW1iZXI7IGV2ZW50OiBJUHJvY2Vzc1JlYWR5RXZlbnQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlYWR5ID0gdGhpcy5fb25Qcm9jZXNzUmVhZHkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc1JlcGxheSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgZXZlbnQ6IElQdHlIb3N0UHJvY2Vzc1JlcGxheUV2ZW50IH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NSZXBsYXkgPSB0aGlzLl9vblByb2Nlc3NSZXBsYXkuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogbnVtYmVyIH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NPcnBoYW5RdWVzdGlvbiA9IHRoaXMuX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3REZXRhY2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlcXVlc3RJZDogbnVtYmVyOyB3b3Jrc3BhY2VJZDogc3RyaW5nOyBpbnN0YW5jZUlkOiBudW1iZXIgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdERldGFjaCA9IHRoaXMuX29uRGlkUmVxdWVzdERldGFjaC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQcm9wZXJ0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgcHJvcGVydHk6IElQcm9jZXNzUHJvcGVydHkgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvcGVydHkgPSB0aGlzLl9vbkRpZENoYW5nZVByb3BlcnR5LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb2Nlc3NFeGl0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBpZDogbnVtYmVyOyBldmVudDogbnVtYmVyIHwgdW5kZWZpbmVkIH0+KCkpO1xuXHRyZWFkb25seSBvblByb2Nlc3NFeGl0ID0gdGhpcy5fb25Qcm9jZXNzRXhpdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wdHlIb3N0U3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3B0eUhvc3RTdGFydGVyOiBJUHR5SG9zdFN0YXJ0ZXIsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUxvZ2dlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBQbGF0Zm9ybSBjb25maWd1cmF0aW9uIGlzIHJlcXVpcmVkIG9uIHRoZSBwcm9jZXNzIHJ1bm5pbmcgdGhlIHB0eSBob3N0IChzaGFyZWQgcHJvY2VzcyBvclxuXHRcdC8vIHJlbW90ZSBzZXJ2ZXIpLlxuXHRcdHJlZ2lzdGVyVGVybWluYWxQbGF0Zm9ybUNvbmZpZ3VyYXRpb24oKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3B0eUhvc3RTdGFydGVyKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZGlzcG9zZVB0eUhvc3QoKSkpO1xuXG5cdFx0dGhpcy5fcmVzb2x2ZVZhcmlhYmxlc1JlcXVlc3RTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZXF1ZXN0U3RvcmUodW5kZWZpbmVkLCB0aGlzLl9sb2dTZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVzb2x2ZVZhcmlhYmxlc1JlcXVlc3RTdG9yZS5vbkNyZWF0ZVJlcXVlc3QodGhpcy5fb25QdHlIb3N0UmVxdWVzdFJlc29sdmVWYXJpYWJsZXMuZmlyZSwgdGhpcy5fb25QdHlIb3N0UmVxdWVzdFJlc29sdmVWYXJpYWJsZXMpKTtcblxuXHRcdC8vIFN0YXJ0IHRoZSBwdHkgaG9zdCB3aGVuIGEgd2luZG93IHJlcXVlc3RzIGEgY29ubmVjdGlvbiwgaWYgdGhlIHN0YXJ0ZXIgaGFzIHRoYXQgY2FwYWJpbGl0eS5cblx0XHRpZiAodGhpcy5fcHR5SG9zdFN0YXJ0ZXIub25SZXF1ZXN0Q29ubmVjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZSh0aGlzLl9wdHlIb3N0U3RhcnRlci5vblJlcXVlc3RDb25uZWN0aW9uKSgoKSA9PiB0aGlzLl9lbnN1cmVQdHlIb3N0KCkpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcHR5SG9zdFN0YXJ0ZXIub25XaWxsU2h1dGRvd24pIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3B0eUhvc3RTdGFydGVyLm9uV2lsbFNodXRkb3duKCgpID0+IHRoaXMuX3dhc1F1aXRSZXF1ZXN0ZWQgPSB0cnVlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgX2lnbm9yZVByb2Nlc3NOYW1lcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZ1tdPihUZXJtaW5hbFNldHRpbmdJZC5JZ25vcmVQcm9jZXNzTmFtZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaElnbm9yZVByb2Nlc3NOYW1lcygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9uYWxQcm94eT8ucmVmcmVzaElnbm9yZVByb2Nlc3NOYW1lcz8uKHRoaXMuX2lnbm9yZVByb2Nlc3NOYW1lcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU2hlbGxFbnYoKTogUHJvbWlzZTx0eXBlb2YgcHJvY2Vzcy5lbnY+IHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRyZXR1cm4gcHJvY2Vzcy5lbnY7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBnZXRSZXNvbHZlZFNoZWxsRW52KHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCB7IF86IFtdIH0sIHByb2Nlc3MuZW52KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcigncHR5SG9zdCB3YXMgdW5hYmxlIHRvIHJlc29sdmUgc2hlbGwgZW52aXJvbm1lbnQnLCBlcnJvcik7XG5cblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydFB0eUhvc3QoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3B0eUhvc3RTdGFydGVyLnN0YXJ0KCk7XG5cdFx0Y29uc3QgY2xpZW50ID0gY29ubmVjdGlvbi5jbGllbnQ7XG5cdFx0Y29uc3Qgc3RvcmUgPSB0aGlzLl9wdHlIb3N0U3RvcmU7XG5cdFx0Ly8gVHJhbnNmZXIgb3duZXJzaGlwIG9mIHRoZSBwZXItaG9zdCBjb25uZWN0aW9uIHN0b3JlIHNvIGl0IGlzIGRpc3Bvc2VkIHRvZ2V0aGVyIHdpdGggdGhlIGxpc3RlbmVycyBiZWxvdyBvbiB0aGUgbmV4dCByZXN0YXJ0LlxuXHRcdHN0b3JlLmFkZChjb25uZWN0aW9uLnN0b3JlKTtcblxuXHRcdC8vIExvZyBhIGZ1bGwgc3RhY2sgdHJhY2Ugd2hpY2ggd2lsbCB0ZWxsIHRoZSBleGFjdCByZWFzb24gdGhlIHB0eSBob3N0IGlzIHN0YXJ0aW5nIHVwXG5cdFx0aWYgKHRoaXMuX2xvZ1NlcnZpY2UuZ2V0TGV2ZWwoKSA9PT0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1B0eUhvc3RTZXJ2aWNlI19zdGFydFB0eUhvc3QnLCBuZXcgRXJyb3IoKS5zdGFjaz8ucmVwbGFjZSgvXkVycm9yLywgJycpKTtcblx0XHR9XG5cblx0XHQvLyBTZXR1cCBoZWFydGJlYXQgc2VydmljZSBhbmQgdHJpZ2dlciBhIGhlYXJ0YmVhdCBpbW1lZGlhdGVseSB0byByZXNldCB0aGUgdGltZW91dHNcblx0XHRjb25zdCBoZWFydGJlYXRTZXJ2aWNlID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJSGVhcnRiZWF0U2VydmljZT4oY2xpZW50LmdldENoYW5uZWwoVGVybWluYWxJcGNDaGFubmVscy5IZWFydGJlYXQpKTtcblx0XHRzdG9yZS5hZGQoaGVhcnRiZWF0U2VydmljZS5vbkJlYXQoKCkgPT4gdGhpcy5faGFuZGxlSGVhcnRiZWF0KCkpKTtcblx0XHR0aGlzLl9oYW5kbGVIZWFydGJlYXQodHJ1ZSk7XG5cblx0XHQvLyBIYW5kbGUgZXhpdFxuXHRcdHN0b3JlLmFkZChjb25uZWN0aW9uLm9uRGlkUHJvY2Vzc0V4aXQoZSA9PiB7XG5cdFx0XHR0aGlzLl9vblB0eUhvc3RFeGl0LmZpcmUoZS5jb2RlKTtcblx0XHRcdGlmICghdGhpcy5fd2FzUXVpdFJlcXVlc3RlZCAmJiAhdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRpZiAodGhpcy5fcmVzdGFydENvdW50IDw9IENvbnN0YW50cy5NYXhSZXN0YXJ0cykge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYHB0eUhvc3QgdGVybWluYXRlZCB1bmV4cGVjdGVkbHkgd2l0aCBjb2RlICR7ZS5jb2RlfWApO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc3RhcnRDb3VudCsrO1xuXHRcdFx0XHRcdHRoaXMucmVzdGFydFB0eUhvc3QoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBwdHlIb3N0IHRlcm1pbmF0ZWQgdW5leHBlY3RlZGx5IHdpdGggY29kZSAke2UuY29kZX0sIGdpdmluZyB1cGApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ3JlYXRlIHByb3h5IGFuZCBmb3J3YXJkIGV2ZW50c1xuXHRcdGNvbnN0IHByb3h5ID0gUHJveHlDaGFubmVsLnRvU2VydmljZTxJUHR5U2VydmljZT4oY2xpZW50LmdldENoYW5uZWwoVGVybWluYWxJcGNDaGFubmVscy5QdHlIb3N0KSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uUHJvY2Vzc0RhdGEoZSA9PiB0aGlzLl9vblByb2Nlc3NEYXRhLmZpcmUoZSkpKTtcblx0XHRzdG9yZS5hZGQocHJveHkub25Qcm9jZXNzUmVhZHkoZSA9PiB0aGlzLl9vblByb2Nlc3NSZWFkeS5maXJlKGUpKSk7XG5cdFx0c3RvcmUuYWRkKHByb3h5Lm9uUHJvY2Vzc0V4aXQoZSA9PiB0aGlzLl9vblByb2Nlc3NFeGl0LmZpcmUoZSkpKTtcblx0XHRzdG9yZS5hZGQocHJveHkub25EaWRDaGFuZ2VQcm9wZXJ0eShlID0+IHRoaXMuX29uRGlkQ2hhbmdlUHJvcGVydHkuZmlyZShlKSkpO1xuXHRcdHN0b3JlLmFkZChwcm94eS5vblByb2Nlc3NSZXBsYXkoZSA9PiB0aGlzLl9vblByb2Nlc3NSZXBsYXkuZmlyZShlKSkpO1xuXHRcdHN0b3JlLmFkZChwcm94eS5vblByb2Nlc3NPcnBoYW5RdWVzdGlvbihlID0+IHRoaXMuX29uUHJvY2Vzc09ycGhhblF1ZXN0aW9uLmZpcmUoZSkpKTtcblx0XHRzdG9yZS5hZGQocHJveHkub25EaWRSZXF1ZXN0RGV0YWNoKGUgPT4gdGhpcy5fb25EaWRSZXF1ZXN0RGV0YWNoLmZpcmUoZSkpKTtcblxuXHRcdHN0b3JlLmFkZChuZXcgUmVtb3RlTG9nZ2VyQ2hhbm5lbENsaWVudCh0aGlzLl9sb2dnZXJTZXJ2aWNlLCBjbGllbnQuZ2V0Q2hhbm5lbChUZXJtaW5hbElwY0NoYW5uZWxzLkxvZ2dlcikpKTtcblxuXHRcdHRoaXMuX19jb25uZWN0aW9uID0gY29ubmVjdGlvbjtcblx0XHR0aGlzLl9fcHJveHkgPSBwcm94eTtcblxuXHRcdHRoaXMuX29uUHR5SG9zdFN0YXJ0LmZpcmUoKTtcblxuXHRcdHN0b3JlLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihUZXJtaW5hbFNldHRpbmdJZC5JZ25vcmVQcm9jZXNzTmFtZXMpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hJZ25vcmVQcm9jZXNzTmFtZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVmcmVzaElnbm9yZVByb2Nlc3NOYW1lcygpO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlUHJvY2Vzcyhcblx0XHRzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdGN3ZDogc3RyaW5nLFxuXHRcdGNvbHM6IG51bWJlcixcblx0XHRyb3dzOiBudW1iZXIsXG5cdFx0dW5pY29kZVZlcnNpb246ICc2JyB8ICcxMScsXG5cdFx0ZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50LFxuXHRcdGV4ZWN1dGFibGVFbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsXG5cdFx0b3B0aW9uczogSVRlcm1pbmFsUHJvY2Vzc09wdGlvbnMsXG5cdFx0c2hvdWxkUGVyc2lzdDogYm9vbGVhbixcblx0XHR3b3Jrc3BhY2VJZDogc3RyaW5nLFxuXHRcdHdvcmtzcGFjZU5hbWU6IHN0cmluZ1xuXHQpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdGNvbnN0IHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuX2hhbmRsZVVucmVzcG9uc2l2ZUNyZWF0ZVByb2Nlc3MoKSwgSGVhcnRiZWF0Q29uc3RhbnRzLkNyZWF0ZVByb2Nlc3NUaW1lb3V0KTtcblx0XHRjb25zdCBpZCA9IGF3YWl0IHRoaXMuX3Byb3h5LmNyZWF0ZVByb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcsIGN3ZCwgY29scywgcm93cywgdW5pY29kZVZlcnNpb24sIGVudiwgZXhlY3V0YWJsZUVudiwgb3B0aW9ucywgc2hvdWxkUGVyc2lzdCwgd29ya3NwYWNlSWQsIHdvcmtzcGFjZU5hbWUpO1xuXHRcdGNsZWFyVGltZW91dCh0aW1lb3V0KTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cblx0dXBkYXRlVGl0bGUoaWQ6IG51bWJlciwgdGl0bGU6IHN0cmluZywgdGl0bGVTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkudXBkYXRlVGl0bGUoaWQsIHRpdGxlLCB0aXRsZVNvdXJjZSk7XG5cdH1cblx0dXBkYXRlSWNvbihpZDogbnVtYmVyLCB1c2VySW5pdGlhdGVkOiBib29sZWFuLCBpY29uOiBUZXJtaW5hbEljb24sIGNvbG9yPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnVwZGF0ZUljb24oaWQsIHVzZXJJbml0aWF0ZWQsIGljb24sIGNvbG9yKTtcblx0fVxuXHRhdHRhY2hUb1Byb2Nlc3MoaWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5hdHRhY2hUb1Byb2Nlc3MoaWQpO1xuXHR9XG5cdGRldGFjaEZyb21Qcm9jZXNzKGlkOiBudW1iZXIsIGZvcmNlUGVyc2lzdD86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuZGV0YWNoRnJvbVByb2Nlc3MoaWQsIGZvcmNlUGVyc2lzdCk7XG5cdH1cblx0c2h1dGRvd25BbGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnNodXRkb3duQWxsKCk7XG5cdH1cblx0bGlzdFByb2Nlc3NlcygpOiBQcm9taXNlPElQcm9jZXNzRGV0YWlsc1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5Lmxpc3RQcm9jZXNzZXMoKTtcblx0fVxuXHRhc3luYyBnZXRQZXJmb3JtYW5jZU1hcmtzKCk6IFByb21pc2U8cGVyZm9ybWFuY2UuUGVyZm9ybWFuY2VNYXJrW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9uYWxQcm94eT8uZ2V0UGVyZm9ybWFuY2VNYXJrcygpID8/IFtdO1xuXHR9XG5cdGFzeW5jIHJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbmFsUHJveHk/LnJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWUoKTtcblx0fVxuXHRzdGFydChpZDogbnVtYmVyKTogUHJvbWlzZTxJVGVybWluYWxMYXVuY2hFcnJvciB8IElUZXJtaW5hbExhdW5jaFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5zdGFydChpZCk7XG5cdH1cblx0c2h1dGRvd24oaWQ6IG51bWJlciwgaW1tZWRpYXRlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnNodXRkb3duKGlkLCBpbW1lZGlhdGUpO1xuXHR9XG5cdGlucHV0KGlkOiBudW1iZXIsIGRhdGE6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5pbnB1dChpZCwgZGF0YSk7XG5cdH1cblx0c2VuZFNpZ25hbChpZDogbnVtYmVyLCBzaWduYWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5zZW5kU2lnbmFsKGlkLCBzaWduYWwpO1xuXHR9XG5cdHByb2Nlc3NCaW5hcnkoaWQ6IG51bWJlciwgZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnByb2Nlc3NCaW5hcnkoaWQsIGRhdGEpO1xuXHR9XG5cdHJlc2l6ZShpZDogbnVtYmVyLCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkucmVzaXplKGlkLCBjb2xzLCByb3dzLCBwaXhlbFdpZHRoLCBwaXhlbEhlaWdodCk7XG5cdH1cblx0Y2xlYXJCdWZmZXIoaWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5jbGVhckJ1ZmZlcihpZCk7XG5cdH1cblx0YWNrbm93bGVkZ2VEYXRhRXZlbnQoaWQ6IG51bWJlciwgY2hhckNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuYWNrbm93bGVkZ2VEYXRhRXZlbnQoaWQsIGNoYXJDb3VudCk7XG5cdH1cblx0c2V0VW5pY29kZVZlcnNpb24oaWQ6IG51bWJlciwgdmVyc2lvbjogJzYnIHwgJzExJyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5zZXRVbmljb2RlVmVyc2lvbihpZCwgdmVyc2lvbik7XG5cdH1cblx0c2V0TmV4dENvbW1hbmRJZChpZDogbnVtYmVyLCBjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5zZXROZXh0Q29tbWFuZElkKGlkLCBjb21tYW5kTGluZSwgY29tbWFuZElkKTtcblx0fVxuXHRnZXRJbml0aWFsQ3dkKGlkOiBudW1iZXIpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5nZXRJbml0aWFsQ3dkKGlkKTtcblx0fVxuXHRnZXRDd2QoaWQ6IG51bWJlcik6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldEN3ZChpZCk7XG5cdH1cblx0YXN5bmMgZ2V0TGF0ZW5jeSgpOiBQcm9taXNlPElQdHlIb3N0TGF0ZW5jeU1lYXN1cmVtZW50W10+IHtcblx0XHRjb25zdCBzdyA9IG5ldyBTdG9wV2F0Y2goKTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5fcHJveHkuZ2V0TGF0ZW5jeSgpO1xuXHRcdHN3LnN0b3AoKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ3B0eWhvc3RzZXJ2aWNlPC0+cHR5aG9zdCcsXG5cdFx0XHRcdGxhdGVuY3k6IHN3LmVsYXBzZWQoKVxuXHRcdFx0fSxcblx0XHRcdC4uLnJlc3VsdHNcblx0XHRdO1xuXHR9XG5cdG9ycGhhblF1ZXN0aW9uUmVwbHkoaWQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5vcnBoYW5RdWVzdGlvblJlcGx5KGlkKTtcblx0fVxuXG5cdGluc3RhbGxBdXRvUmVwbHkobWF0Y2g6IHN0cmluZywgcmVwbHk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5pbnN0YWxsQXV0b1JlcGx5KG1hdGNoLCByZXBseSk7XG5cdH1cblx0dW5pbnN0YWxsQWxsQXV0b1JlcGxpZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzKCk7XG5cdH1cblxuXHRnZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZT86IE9wZXJhdGluZ1N5c3RlbSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbmFsUHJveHk/LmdldERlZmF1bHRTeXN0ZW1TaGVsbChvc092ZXJyaWRlKSA/PyBnZXRTeXN0ZW1TaGVsbChvc092ZXJyaWRlID8/IE9TLCBwcm9jZXNzLmVudik7XG5cdH1cblx0YXN5bmMgZ2V0UHJvZmlsZXMod29ya3NwYWNlSWQ6IHN0cmluZywgcHJvZmlsZXM6IHVua25vd24sIGRlZmF1bHRQcm9maWxlOiB1bmtub3duLCBpbmNsdWRlRGV0ZWN0ZWRQcm9maWxlczogYm9vbGVhbiA9IGZhbHNlKTogUHJvbWlzZTxJVGVybWluYWxQcm9maWxlW10+IHtcblx0XHRjb25zdCBzaGVsbEVudiA9IGF3YWl0IHRoaXMuX3Jlc29sdmVTaGVsbEVudigpO1xuXHRcdHJldHVybiBkZXRlY3RBdmFpbGFibGVQcm9maWxlcyhwcm9maWxlcywgZGVmYXVsdFByb2ZpbGUsIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSwgc2hlbGxFbnYsIHVuZGVmaW5lZCwgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5fcmVzb2x2ZVZhcmlhYmxlcy5iaW5kKHRoaXMsIHdvcmtzcGFjZUlkKSk7XG5cdH1cblx0YXN5bmMgZ2V0RW52aXJvbm1lbnQoKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50PiB7XG5cdFx0Ly8gSWYgdGhlIHB0eSBob3N0IGlzIHlldCB0byBiZSBsYXVuY2hlZCwganVzdCByZXR1cm4gdGhlIGVudmlyb25tZW50IG9mIHRoaXMgcHJvY2VzcyBhcyBpdFxuXHRcdC8vIGlzIGVzc2VudGlhbGx5IHRoZSBzYW1lIHdoZW4gdXNlZCB0byBldmFsdWF0ZSB0ZXJtaW5hbCBwcm9maWxlcy5cblx0XHRpZiAoIXRoaXMuX19wcm94eSkge1xuXHRcdFx0cmV0dXJuIHsgLi4ucHJvY2Vzcy5lbnYgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmdldEVudmlyb25tZW50KCk7XG5cdH1cblx0Z2V0V3NsUGF0aChvcmlnaW5hbDogc3RyaW5nLCBkaXJlY3Rpb246ICd1bml4LXRvLXdpbicgfCAnd2luLXRvLXVuaXgnKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuZ2V0V3NsUGF0aChvcmlnaW5hbCwgZGlyZWN0aW9uKTtcblx0fVxuXG5cdGdldFJldml2ZWRQdHlOZXdJZCh3b3Jrc3BhY2VJZDogc3RyaW5nLCBpZDogbnVtYmVyKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuZ2V0UmV2aXZlZFB0eU5ld0lkKHdvcmtzcGFjZUlkLCBpZCk7XG5cdH1cblxuXHRzZXRUZXJtaW5hbExheW91dEluZm8oYXJnczogSVNldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3MpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkuc2V0VGVybWluYWxMYXlvdXRJbmZvKGFyZ3MpO1xuXHR9XG5cdGFzeW5jIGdldFRlcm1pbmFsTGF5b3V0SW5mbyhhcmdzOiBJR2V0VGVybWluYWxMYXlvdXRJbmZvQXJncyk6IFByb21pc2U8SVRlcm1pbmFsc0xheW91dEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBUaGlzIGlzIG9wdGlvbmFsIGFzIHdlIHdhbnQgcmVjb25uZWN0IHJlcXVlc3RzIHRvIGdvIHRocm91Z2ggb25seSBpZiB0aGUgcHR5IGhvc3QgZXhpc3RzLlxuXHRcdC8vIFJldml2ZSBpcyBoYW5kbGVkIHNwZWNpYWxseSBhcyByZXZpdmVUZXJtaW5hbFByb2Nlc3NlcyBpcyBndWFyYW50ZWVkIHRvIGJlIGNhbGxlZCBiZWZvcmVcblx0XHQvLyB0aGUgcmVxdWVzdCBmb3IgbGF5b3V0IGluZm8uXG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbmFsUHJveHk/LmdldFRlcm1pbmFsTGF5b3V0SW5mbyhhcmdzKTtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3REZXRhY2hJbnN0YW5jZSh3b3Jrc3BhY2VJZDogc3RyaW5nLCBpbnN0YW5jZUlkOiBudW1iZXIpOiBQcm9taXNlPElQcm9jZXNzRGV0YWlscyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5yZXF1ZXN0RGV0YWNoSW5zdGFuY2Uod29ya3NwYWNlSWQsIGluc3RhbmNlSWQpO1xuXHR9XG5cblx0YXN5bmMgYWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseShyZXF1ZXN0SWQ6IG51bWJlciwgcGVyc2lzdGVudFByb2Nlc3NJZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmFjY2VwdERldGFjaEluc3RhbmNlUmVwbHkocmVxdWVzdElkLCBwZXJzaXN0ZW50UHJvY2Vzc0lkKTtcblx0fVxuXG5cdGFzeW5jIGZyZWVQb3J0S2lsbFByb2Nlc3MocG9ydDogc3RyaW5nKTogUHJvbWlzZTx7IHBvcnQ6IHN0cmluZzsgcHJvY2Vzc0lkOiBzdHJpbmcgfT4ge1xuXHRcdGlmICghdGhpcy5fcHJveHkuZnJlZVBvcnRLaWxsUHJvY2Vzcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdmcmVlUG9ydEtpbGxQcm9jZXNzIGRvZXMgbm90IGV4aXN0IG9uIHRoZSBwdHkgcHJveHknKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LmZyZWVQb3J0S2lsbFByb2Nlc3MocG9ydCk7XG5cdH1cblxuXHRhc3luYyBzZXJpYWxpemVUZXJtaW5hbFN0YXRlKGlkczogbnVtYmVyW10pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS5zZXJpYWxpemVUZXJtaW5hbFN0YXRlKGlkcyk7XG5cdH1cblxuXHRhc3luYyByZXZpdmVUZXJtaW5hbFByb2Nlc3Nlcyh3b3Jrc3BhY2VJZDogc3RyaW5nLCBzdGF0ZTogSVNlcmlhbGl6ZWRUZXJtaW5hbFN0YXRlW10sIGRhdGVUaW1lRm9ybWF0TG9jYXRlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJveHkucmV2aXZlVGVybWluYWxQcm9jZXNzZXMod29ya3NwYWNlSWQsIHN0YXRlLCBkYXRlVGltZUZvcm1hdExvY2F0ZSk7XG5cdH1cblxuXHRhc3luYyByZWZyZXNoUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KGlkOiBudW1iZXIsIHByb3BlcnR5OiBUKTogUHJvbWlzZTxJUHJvY2Vzc1Byb3BlcnR5TWFwW1RdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3h5LnJlZnJlc2hQcm9wZXJ0eShpZCwgcHJvcGVydHkpO1xuXG5cdH1cblx0YXN5bmMgdXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KGlkOiBudW1iZXIsIHByb3BlcnR5OiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm94eS51cGRhdGVQcm9wZXJ0eShpZCwgcHJvcGVydHksIHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIHJlc3RhcnRQdHlIb3N0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2Rpc3Bvc2VQdHlIb3N0KCk7XG5cdFx0dGhpcy5faXNSZXNwb25zaXZlID0gdHJ1ZTtcblx0XHR0aGlzLl9zdGFydFB0eUhvc3QoKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VQdHlIb3N0KCk6IHZvaWQge1xuXHRcdC8vIEhlYXJ0YmVhdCB0aW1lcnMgYXJlIGJhcmUgc2V0VGltZW91dCBoYW5kbGVzLCBub3QgZGlzcG9zYWJsZXMgaW4gdGhlIHN0b3JlLCBzbyB0aGV5IG5lZWQgYW4gZXhwbGljaXQgY2xlYXIuXG5cdFx0Ly8gc2h1dGRvd25BbGwoKSBpcyBmaXJlZCBiZWZvcmUgY2xlYXJpbmcgdGhlIHN0b3JlIHNvIGFueSBpbi1mbGlnaHQgZXhpdCBsaXN0ZW5lciBzdGlsbCBoYXMgYSBsaXZlIHByb3h5IHRvIHJlYWQgZnJvbTtcblx0XHQvLyB0aGUgcGVyLWhvc3QgbGlzdGVuZXIgc3RvcmUgaXMgY2xlYXJlZCBsYXN0IHNvIHRoZSBvbi1leGl0IHNpZ25hbCBpc24ndCBkcm9wcGVkIG9uIHRoZSBmbG9vci5cblx0XHR0aGlzLl9jbGVhckhlYXJ0YmVhdFRpbWVvdXRzKCk7XG5cdFx0Ly8gRmlyZS1hbmQtZm9yZ2V0OiB0aGUgSVBDIGNoYW5uZWwgbWF5IGFscmVhZHkgYmUgZ29uZTsgc3dhbGxvdyByZWplY3Rpb25zIHNvIHdlIGRvbid0IHN1cmZhY2UgYW4gdW5oYW5kbGVkIHByb21pc2UuXG5cdFx0dGhpcy5fb3B0aW9uYWxQcm94eT8uc2h1dGRvd25BbGwoKS5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdHRoaXMuX19jb25uZWN0aW9uID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX19wcm94eSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9wdHlIb3N0U3RvcmUuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUhlYXJ0YmVhdChpc0Nvbm5lY3Rpbmc/OiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY2xlYXJIZWFydGJlYXRUaW1lb3V0cygpO1xuXHRcdHRoaXMuX2hlYXJ0YmVhdEZpcnN0VGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gdGhpcy5faGFuZGxlSGVhcnRiZWF0Rmlyc3RUaW1lb3V0KCksIGlzQ29ubmVjdGluZyA/IEhlYXJ0YmVhdENvbnN0YW50cy5Db25uZWN0aW5nQmVhdEludGVydmFsIDogKEhlYXJ0YmVhdENvbnN0YW50cy5CZWF0SW50ZXJ2YWwgKiBIZWFydGJlYXRDb25zdGFudHMuRmlyc3RXYWl0TXVsdGlwbGllcikpO1xuXHRcdGlmICghdGhpcy5faXNSZXNwb25zaXZlKSB7XG5cdFx0XHR0aGlzLl9pc1Jlc3BvbnNpdmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fb25QdHlIb3N0UmVzcG9uc2l2ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlSGVhcnRiZWF0Rmlyc3RUaW1lb3V0KCkge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgTm8gcHR5SG9zdCBoZWFydGJlYXQgYWZ0ZXIgJHtIZWFydGJlYXRDb25zdGFudHMuQmVhdEludGVydmFsICogSGVhcnRiZWF0Q29uc3RhbnRzLkZpcnN0V2FpdE11bHRpcGxpZXIgLyAxMDAwfSBzZWNvbmRzYCk7XG5cdFx0dGhpcy5faGVhcnRiZWF0Rmlyc3RUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2hlYXJ0YmVhdFNlY29uZFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRoaXMuX2hhbmRsZUhlYXJ0YmVhdFNlY29uZFRpbWVvdXQoKSwgSGVhcnRiZWF0Q29uc3RhbnRzLkJlYXRJbnRlcnZhbCAqIEhlYXJ0YmVhdENvbnN0YW50cy5TZWNvbmRXYWl0TXVsdGlwbGllcik7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVIZWFydGJlYXRTZWNvbmRUaW1lb3V0KCkge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYE5vIHB0eUhvc3QgaGVhcnRiZWF0IGFmdGVyICR7KEhlYXJ0YmVhdENvbnN0YW50cy5CZWF0SW50ZXJ2YWwgKiBIZWFydGJlYXRDb25zdGFudHMuRmlyc3RXYWl0TXVsdGlwbGllciArIEhlYXJ0YmVhdENvbnN0YW50cy5CZWF0SW50ZXJ2YWwgKiBIZWFydGJlYXRDb25zdGFudHMuRmlyc3RXYWl0TXVsdGlwbGllcikgLyAxMDAwfSBzZWNvbmRzYCk7XG5cdFx0dGhpcy5faGVhcnRiZWF0U2Vjb25kVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5faXNSZXNwb25zaXZlKSB7XG5cdFx0XHR0aGlzLl9pc1Jlc3BvbnNpdmUgPSBmYWxzZTtcblx0XHRcdHRoaXMuX29uUHR5SG9zdFVucmVzcG9uc2l2ZS5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlVW5yZXNwb25zaXZlQ3JlYXRlUHJvY2VzcygpIHtcblx0XHR0aGlzLl9jbGVhckhlYXJ0YmVhdFRpbWVvdXRzKCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgTm8gcHR5SG9zdCByZXNwb25zZSB0byBjcmVhdGVQcm9jZXNzIGFmdGVyICR7SGVhcnRiZWF0Q29uc3RhbnRzLkNyZWF0ZVByb2Nlc3NUaW1lb3V0IC8gMTAwMH0gc2Vjb25kc2ApO1xuXHRcdGlmICh0aGlzLl9pc1Jlc3BvbnNpdmUpIHtcblx0XHRcdHRoaXMuX2lzUmVzcG9uc2l2ZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fb25QdHlIb3N0VW5yZXNwb25zaXZlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhckhlYXJ0YmVhdFRpbWVvdXRzKCkge1xuXHRcdGlmICh0aGlzLl9oZWFydGJlYXRGaXJzdFRpbWVvdXQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9oZWFydGJlYXRGaXJzdFRpbWVvdXQpO1xuXHRcdFx0dGhpcy5faGVhcnRiZWF0Rmlyc3RUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faGVhcnRiZWF0U2Vjb25kVGltZW91dCkge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2hlYXJ0YmVhdFNlY29uZFRpbWVvdXQpO1xuXHRcdFx0dGhpcy5faGVhcnRiZWF0U2Vjb25kVGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlVmFyaWFibGVzKHdvcmtzcGFjZUlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlVmFyaWFibGVzUmVxdWVzdFN0b3JlLmNyZWF0ZVJlcXVlc3QoeyB3b3Jrc3BhY2VJZCwgb3JpZ2luYWxUZXh0OiB0ZXh0IH0pO1xuXHR9XG5cdGFzeW5jIGFjY2VwdFB0eUhvc3RSZXNvbHZlZFZhcmlhYmxlcyhyZXF1ZXN0SWQ6IG51bWJlciwgcmVzb2x2ZWQ6IHN0cmluZ1tdKSB7XG5cdFx0dGhpcy5fcmVzb2x2ZVZhcmlhYmxlc1JlcXVlc3RTdG9yZS5hY2NlcHRSZXBseShyZXF1ZXN0SWQsIHJlc29sdmVkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksaUJB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
