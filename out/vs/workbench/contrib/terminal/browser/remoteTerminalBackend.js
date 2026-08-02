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
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { revive } from "../../../../base/common/marshalling.js";
import { mark } from "../../../../base/common/performance.js";
import { OperatingSystem } from "../../../../base/common/platform.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IRemoteAuthorityResolverService } from "../../../../platform/remote/common/remoteAuthorityResolver.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITerminalLogService, TerminalExtensions, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { BaseTerminalBackend } from "./baseTerminalBackend.js";
import { RemotePty } from "./remotePty.js";
import { ITerminalInstanceService } from "./terminal.js";
import { RemoteTerminalChannelClient, REMOTE_TERMINAL_CHANNEL_NAME } from "../common/remote/remoteTerminalChannel.js";
import { TERMINAL_CONFIG_SECTION } from "../common/terminal.js";
import { TerminalStorageKeys } from "../common/terminalStorageKeys.js";
import { IConfigurationResolverService } from "../../../services/configurationResolver/common/configurationResolver.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { getWorkspaceForTerminal } from "../common/terminalEnvironment.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IStatusbarService } from "../../../services/statusbar/browser/statusbar.js";
let RemoteTerminalBackendContribution = class {
  constructor(instantiationService, remoteAgentService, terminalInstanceService) {
    const connection = remoteAgentService.getConnection();
    if (connection?.remoteAuthority) {
      const channel = instantiationService.createInstance(RemoteTerminalChannelClient, connection.remoteAuthority, connection.getChannel(REMOTE_TERMINAL_CHANNEL_NAME));
      const backend = instantiationService.createInstance(RemoteTerminalBackend, connection.remoteAuthority, channel);
      Registry.as(TerminalExtensions.Backend).registerTerminalBackend(backend);
      terminalInstanceService.didRegisterBackend(backend);
    }
  }
};
RemoteTerminalBackendContribution.ID = "remoteTerminalBackend";
RemoteTerminalBackendContribution = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IRemoteAgentService),
  __decorateParam(2, ITerminalInstanceService)
], RemoteTerminalBackendContribution);
let RemoteTerminalBackend = class extends BaseTerminalBackend {
  constructor(remoteAuthority, _remoteTerminalChannel, _remoteAgentService, _instantiationService, logService, _commandService, _storageService, _remoteAuthorityResolverService, workspaceContextService, configurationResolverService, _historyService, _configurationService, statusBarService) {
    super(_remoteTerminalChannel, logService, _historyService, configurationResolverService, statusBarService, workspaceContextService);
    this.remoteAuthority = remoteAuthority;
    this._remoteTerminalChannel = _remoteTerminalChannel;
    this._remoteAgentService = _remoteAgentService;
    this._instantiationService = _instantiationService;
    this._commandService = _commandService;
    this._storageService = _storageService;
    this._remoteAuthorityResolverService = _remoteAuthorityResolverService;
    this._historyService = _historyService;
    this._configurationService = _configurationService;
    this._ptys = /* @__PURE__ */ new Map();
    this._whenConnected = new DeferredPromise();
    this._onDidRequestDetach = this._register(new Emitter());
    this.onDidRequestDetach = this._onDidRequestDetach.event;
    this._onRestoreCommands = this._register(new Emitter());
    this.onRestoreCommands = this._onRestoreCommands.event;
    this._register(this._remoteTerminalChannel.onProcessData((e) => this._ptys.get(e.id)?.handleData(e.event)));
    this._register(this._remoteTerminalChannel.onProcessReplay((e) => {
      this._ptys.get(e.id)?.handleReplay(e.event);
      if (e.event.commands.commands.length > 0) {
        this._onRestoreCommands.fire({ id: e.id, commands: e.event.commands.commands });
      }
    }));
    this._register(this._remoteTerminalChannel.onProcessOrphanQuestion((e) => this._ptys.get(e.id)?.handleOrphanQuestion()));
    this._register(this._remoteTerminalChannel.onDidRequestDetach((e) => this._onDidRequestDetach.fire(e)));
    this._register(this._remoteTerminalChannel.onProcessReady((e) => this._ptys.get(e.id)?.handleReady(e.event)));
    this._register(this._remoteTerminalChannel.onDidChangeProperty((e) => this._ptys.get(e.id)?.handleDidChangeProperty(e.property)));
    this._register(this._remoteTerminalChannel.onProcessExit((e) => {
      const pty = this._ptys.get(e.id);
      if (pty) {
        pty.handleExit(e.event);
        pty.dispose();
        this._ptys.delete(e.id);
      }
    }));
    const allowedCommands = ["_remoteCLI.openExternal", "_remoteCLI.windowOpen", "_remoteCLI.getSystemStatus", "_remoteCLI.manageExtensions"];
    this._register(this._remoteTerminalChannel.onExecuteCommand(async (e) => {
      const pty = this._ptys.get(e.persistentProcessId);
      if (!pty) {
        return;
      }
      const reqId = e.reqId;
      const commandId = e.commandId;
      if (!allowedCommands.includes(commandId)) {
        this._remoteTerminalChannel.sendCommandResult(reqId, true, "Invalid remote cli command: " + commandId);
        return;
      }
      const commandArgs = e.commandArgs.map((arg) => revive(arg));
      try {
        const result = await this._commandService.executeCommand(e.commandId, ...commandArgs);
        this._remoteTerminalChannel.sendCommandResult(reqId, false, result);
      } catch (err) {
        this._remoteTerminalChannel.sendCommandResult(reqId, true, err);
      }
    }));
    this._onPtyHostConnected.fire();
  }
  get whenReady() {
    return this._whenConnected.p;
  }
  setReady() {
    this._whenConnected.complete();
  }
  async requestDetachInstance(workspaceId, instanceId) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot request detach instance when there is no remote!`);
    }
    return this._remoteTerminalChannel.requestDetachInstance(workspaceId, instanceId);
  }
  async acceptDetachInstanceReply(requestId, persistentProcessId) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot accept detached instance when there is no remote!`);
    } else if (!persistentProcessId) {
      this._logService.warn("Cannot attach to feature terminals, custom pty terminals, or those without a persistentProcessId");
      return;
    }
    return this._remoteTerminalChannel.acceptDetachInstanceReply(requestId, persistentProcessId);
  }
  async persistTerminalState() {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot persist terminal state when there is no remote!`);
    }
    const ids = Array.from(this._ptys.keys());
    const serialized = await this._remoteTerminalChannel.serializeTerminalState(ids);
    this._storageService.store(TerminalStorageKeys.TerminalBufferState, serialized, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async createProcess(shellLaunchConfig, cwd, cols, rows, unicodeVersion, env, options, shouldPersist) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot create remote terminal when there is no remote!`);
    }
    const remoteEnv = await this._remoteAgentService.getEnvironment();
    if (!remoteEnv) {
      throw new Error("Could not fetch remote environment");
    }
    const terminalConfig = this._configurationService.getValue(TERMINAL_CONFIG_SECTION);
    const configuration = {
      "terminal.integrated.env.windows": this._configurationService.getValue(TerminalSettingId.EnvWindows),
      "terminal.integrated.env.osx": this._configurationService.getValue(TerminalSettingId.EnvMacOs),
      "terminal.integrated.env.linux": this._configurationService.getValue(TerminalSettingId.EnvLinux),
      "terminal.integrated.cwd": this._configurationService.getValue(TerminalSettingId.Cwd),
      "terminal.integrated.detectLocale": terminalConfig.detectLocale
    };
    const shellLaunchConfigDto = {
      name: shellLaunchConfig.name,
      executable: shellLaunchConfig.executable,
      args: shellLaunchConfig.args,
      cwd: shellLaunchConfig.cwd,
      env: shellLaunchConfig.env,
      useShellEnvironment: shellLaunchConfig.useShellEnvironment,
      reconnectionProperties: shellLaunchConfig.reconnectionProperties,
      type: shellLaunchConfig.type,
      isFeatureTerminal: shellLaunchConfig.isFeatureTerminal,
      forceShellIntegration: shellLaunchConfig.forceShellIntegration,
      tabActions: shellLaunchConfig.tabActions,
      shellIntegrationEnvironmentReporting: shellLaunchConfig.shellIntegrationEnvironmentReporting
    };
    const activeWorkspaceRootUri = getWorkspaceForTerminal(shellLaunchConfig.cwd, this._workspaceContextService, this._historyService)?.uri;
    const result = await this._remoteTerminalChannel.createProcess(
      shellLaunchConfigDto,
      configuration,
      activeWorkspaceRootUri,
      options,
      shouldPersist,
      cols,
      rows,
      unicodeVersion
    );
    const pty = this._instantiationService.createInstance(RemotePty, result.persistentTerminalId, shouldPersist, this._remoteTerminalChannel);
    this._ptys.set(result.persistentTerminalId, pty);
    return pty;
  }
  async attachToProcess(id) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot create remote terminal when there is no remote!`);
    }
    try {
      await this._remoteTerminalChannel.attachToProcess(id);
      const pty = this._instantiationService.createInstance(RemotePty, id, true, this._remoteTerminalChannel);
      this._ptys.set(id, pty);
      return pty;
    } catch (e) {
      this._logService.trace(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async attachToRevivedProcess(id) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot create remote terminal when there is no remote!`);
    }
    try {
      const newId = await this._remoteTerminalChannel.getRevivedPtyNewId(id) ?? id;
      return await this.attachToProcess(newId);
    } catch (e) {
      this._logService.trace(`Couldn't attach to process ${e.message}`);
    }
    return void 0;
  }
  async listProcesses() {
    return this._remoteTerminalChannel.listProcesses();
  }
  async getLatency() {
    const sw = new StopWatch();
    const results = await this._remoteTerminalChannel.getLatency();
    sw.stop();
    return [
      {
        label: "window<->ptyhostservice<->ptyhost",
        latency: sw.elapsed()
      },
      ...results
    ];
  }
  async updateProperty(id, property, value) {
    await this._remoteTerminalChannel.updateProperty(id, property, value);
  }
  async updateTitle(id, title, titleSource) {
    await this._remoteTerminalChannel.updateTitle(id, title, titleSource);
  }
  async updateIcon(id, userInitiated, icon, color) {
    await this._remoteTerminalChannel.updateIcon(id, userInitiated, icon, color);
  }
  async setNextCommandId(id, commandLine, commandId) {
    await this._remoteTerminalChannel.setNextCommandId(id, commandLine, commandId);
  }
  async getDefaultSystemShell(osOverride) {
    return this._remoteTerminalChannel.getDefaultSystemShell(osOverride) || "";
  }
  async getProfiles(profiles, defaultProfile, includeDetectedProfiles) {
    return this._remoteTerminalChannel.getProfiles(profiles, defaultProfile, includeDetectedProfiles) || [];
  }
  async getEnvironment() {
    return this._remoteTerminalChannel.getEnvironment() || {};
  }
  async getShellEnvironment() {
    const connection = this._remoteAgentService.getConnection();
    if (!connection) {
      return void 0;
    }
    const resolverResult = await this._remoteAuthorityResolverService.resolveAuthority(connection.remoteAuthority);
    const envResult = {};
    if (resolverResult.options?.extensionHostEnv) {
      for (const [key, value] of Object.entries(resolverResult.options.extensionHostEnv)) {
        if (value !== null) {
          envResult[key] = value;
        }
      }
    }
    return envResult;
  }
  async getWslPath(original, direction) {
    const env = await this._remoteAgentService.getEnvironment();
    if (env?.os !== OperatingSystem.Windows) {
      return original;
    }
    return this._remoteTerminalChannel.getWslPath(original, direction) || original;
  }
  async setTerminalLayoutInfo(layout) {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot call setActiveInstanceId when there is no remote`);
    }
    return this._remoteTerminalChannel.setTerminalLayoutInfo(layout);
  }
  async reduceConnectionGraceTime() {
    if (!this._remoteTerminalChannel) {
      throw new Error("Cannot reduce grace time when there is no remote");
    }
    return this._remoteTerminalChannel.reduceConnectionGraceTime();
  }
  async getTerminalLayoutInfo() {
    if (!this._remoteTerminalChannel) {
      throw new Error(`Cannot call getActiveInstanceId when there is no remote`);
    }
    const workspaceId = this._getWorkspaceId();
    const serializedState = this._storageService.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
    const reviveBufferState = this._deserializeTerminalState(serializedState);
    if (reviveBufferState && reviveBufferState.length > 0) {
      try {
        mark("code/terminal/willReviveTerminalProcessesRemote");
        await this._remoteTerminalChannel.reviveTerminalProcesses(workspaceId, reviveBufferState, Intl.DateTimeFormat().resolvedOptions().locale);
        mark("code/terminal/didReviveTerminalProcessesRemote");
        this._storageService.remove(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE);
        const layoutInfo = this._storageService.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        if (layoutInfo) {
          mark("code/terminal/willSetTerminalLayoutInfoRemote");
          await this._remoteTerminalChannel.setTerminalLayoutInfo(JSON.parse(layoutInfo));
          mark("code/terminal/didSetTerminalLayoutInfoRemote");
          this._storageService.remove(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE);
        }
      } catch (e) {
        this._logService.warn("RemoteTerminalBackend#getTerminalLayoutInfo Error", e.message ?? e);
      }
    }
    return this._remoteTerminalChannel.getTerminalLayoutInfo();
  }
  async getPerformanceMarks() {
    return this._remoteTerminalChannel.getPerformanceMarks();
  }
  installAutoReply(match, reply) {
    return this._remoteTerminalChannel.installAutoReply(match, reply);
  }
  uninstallAllAutoReplies() {
    return this._remoteTerminalChannel.uninstallAllAutoReplies();
  }
};
RemoteTerminalBackend = __decorateClass([
  __decorateParam(2, IRemoteAgentService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITerminalLogService),
  __decorateParam(5, ICommandService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IRemoteAuthorityResolverService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IConfigurationResolverService),
  __decorateParam(10, IHistoryService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IStatusbarService)
], RemoteTerminalBackend);
export {
  RemoteTerminalBackendContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvcmVtb3RlVGVybWluYWxCYWNrZW5kLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IFBlcmZvcm1hbmNlTWFyaywgbWFyayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BlcmZvcm1hbmNlLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZW1vdGUvY29tbW9uL3JlbW90ZUF1dGhvcml0eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJU2VyaWFsaXplZFRlcm1pbmFsQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElQdHlIb3N0TGF0ZW5jeU1lYXN1cmVtZW50LCBJU2hlbGxMYXVuY2hDb25maWcsIElTaGVsbExhdW5jaENvbmZpZ0R0bywgSVRlcm1pbmFsQmFja2VuZCwgSVRlcm1pbmFsQmFja2VuZFJlZ2lzdHJ5LCBJVGVybWluYWxDaGlsZFByb2Nlc3MsIElUZXJtaW5hbEVudmlyb25tZW50LCBJVGVybWluYWxMb2dTZXJ2aWNlLCBJVGVybWluYWxQcm9jZXNzT3B0aW9ucywgSVRlcm1pbmFsUHJvZmlsZSwgSVRlcm1pbmFsc0xheW91dEluZm8sIElUZXJtaW5hbHNMYXlvdXRJbmZvQnlJZCwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxFeHRlbnNpb25zLCBUZXJtaW5hbEljb24sIFRlcm1pbmFsU2V0dGluZ0lkLCBUaXRsZUV2ZW50U291cmNlLCB0eXBlIElQcm9jZXNzUHJvcGVydHlNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NEZXRhaWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsUHJvY2Vzcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgQmFzZVRlcm1pbmFsQmFja2VuZCB9IGZyb20gJy4vYmFzZVRlcm1pbmFsQmFja2VuZC5qcyc7XG5pbXBvcnQgeyBSZW1vdGVQdHkgfSBmcm9tICcuL3JlbW90ZVB0eS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2UgfSBmcm9tICcuL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IFJlbW90ZVRlcm1pbmFsQ2hhbm5lbENsaWVudCwgUkVNT1RFX1RFUk1JTkFMX0NIQU5ORUxfTkFNRSB9IGZyb20gJy4uL2NvbW1vbi9yZW1vdGUvcmVtb3RlVGVybWluYWxDaGFubmVsLmpzJztcbmltcG9ydCB7IElDb21wbGV0ZVRlcm1pbmFsQ29uZmlndXJhdGlvbiwgSVRlcm1pbmFsQ29uZmlndXJhdGlvbiwgVEVSTUlOQUxfQ09ORklHX1NFQ1RJT04gfSBmcm9tICcuLi9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxTdG9yYWdlS2V5cyB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbFN0b3JhZ2VLZXlzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvblJlc29sdmVyL2NvbW1vbi9jb25maWd1cmF0aW9uUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBnZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbCB9IGZyb20gJy4uL2NvbW1vbi90ZXJtaW5hbEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVUZXJtaW5hbEJhY2tlbmRDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0c3RhdGljIElEID0gJ3JlbW90ZVRlcm1pbmFsQmFja2VuZCc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlIHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlOiBJVGVybWluYWxJbnN0YW5jZVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHJlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKGNvbm5lY3Rpb24/LnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0Y29uc3QgY2hhbm5lbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZVRlcm1pbmFsQ2hhbm5lbENsaWVudCwgY29ubmVjdGlvbi5yZW1vdGVBdXRob3JpdHksIGNvbm5lY3Rpb24uZ2V0Q2hhbm5lbChSRU1PVEVfVEVSTUlOQUxfQ0hBTk5FTF9OQU1FKSk7XG5cdFx0XHRjb25zdCBiYWNrZW5kID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlVGVybWluYWxCYWNrZW5kLCBjb25uZWN0aW9uLnJlbW90ZUF1dGhvcml0eSwgY2hhbm5lbCk7XG5cdFx0XHRSZWdpc3RyeS5hczxJVGVybWluYWxCYWNrZW5kUmVnaXN0cnk+KFRlcm1pbmFsRXh0ZW5zaW9ucy5CYWNrZW5kKS5yZWdpc3RlclRlcm1pbmFsQmFja2VuZChiYWNrZW5kKTtcblx0XHRcdHRlcm1pbmFsSW5zdGFuY2VTZXJ2aWNlLmRpZFJlZ2lzdGVyQmFja2VuZChiYWNrZW5kKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUmVtb3RlVGVybWluYWxCYWNrZW5kIGV4dGVuZHMgQmFzZVRlcm1pbmFsQmFja2VuZCBpbXBsZW1lbnRzIElUZXJtaW5hbEJhY2tlbmQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wdHlzOiBNYXA8bnVtYmVyLCBSZW1vdGVQdHk+ID0gbmV3IE1hcCgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3doZW5Db25uZWN0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdGdldCB3aGVuUmVhZHkoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiB0aGlzLl93aGVuQ29ubmVjdGVkLnA7IH1cblx0c2V0UmVhZHkoKTogdm9pZCB7IHRoaXMuX3doZW5Db25uZWN0ZWQuY29tcGxldGUoKTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWVzdERldGFjaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVxdWVzdElkOiBudW1iZXI7IHdvcmtzcGFjZUlkOiBzdHJpbmc7IGluc3RhbmNlSWQ6IG51bWJlciB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1ZXN0RGV0YWNoID0gdGhpcy5fb25EaWRSZXF1ZXN0RGV0YWNoLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlc3RvcmVDb21tYW5kcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgaWQ6IG51bWJlcjsgY29tbWFuZHM6IElTZXJpYWxpemVkVGVybWluYWxDb21tYW5kW10gfT4oKSk7XG5cdHJlYWRvbmx5IG9uUmVzdG9yZUNvbW1hbmRzID0gdGhpcy5fb25SZXN0b3JlQ29tbWFuZHMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVtb3RlQXV0aG9yaXR5OiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVtb3RlVGVybWluYWxDaGFubmVsOiBSZW1vdGVUZXJtaW5hbENoYW5uZWxDbGllbnQsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRTZXJ2aWNlOiBJUmVtb3RlQWdlbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJVGVybWluYWxMb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElSZW1vdGVBdXRob3JpdHlSZXNvbHZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlOiBJUmVtb3RlQXV0aG9yaXR5UmVzb2x2ZXJTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2Ugd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UgY29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZTogSUNvbmZpZ3VyYXRpb25SZXNvbHZlclNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9oaXN0b3J5U2VydmljZTogSUhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2Ugc3RhdHVzQmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCwgbG9nU2VydmljZSwgX2hpc3RvcnlTZXJ2aWNlLCBjb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLCBzdGF0dXNCYXJTZXJ2aWNlLCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwub25Qcm9jZXNzRGF0YShlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVEYXRhKGUuZXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLm9uUHJvY2Vzc1JlcGxheShlID0+IHtcblx0XHRcdHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVSZXBsYXkoZS5ldmVudCk7XG5cdFx0XHRpZiAoZS5ldmVudC5jb21tYW5kcy5jb21tYW5kcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX29uUmVzdG9yZUNvbW1hbmRzLmZpcmUoeyBpZDogZS5pZCwgY29tbWFuZHM6IGUuZXZlbnQuY29tbWFuZHMuY29tbWFuZHMgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5vblByb2Nlc3NPcnBoYW5RdWVzdGlvbihlID0+IHRoaXMuX3B0eXMuZ2V0KGUuaWQpPy5oYW5kbGVPcnBoYW5RdWVzdGlvbigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLm9uRGlkUmVxdWVzdERldGFjaChlID0+IHRoaXMuX29uRGlkUmVxdWVzdERldGFjaC5maXJlKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLm9uUHJvY2Vzc1JlYWR5KGUgPT4gdGhpcy5fcHR5cy5nZXQoZS5pZCk/LmhhbmRsZVJlYWR5KGUuZXZlbnQpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLm9uRGlkQ2hhbmdlUHJvcGVydHkoZSA9PiB0aGlzLl9wdHlzLmdldChlLmlkKT8uaGFuZGxlRGlkQ2hhbmdlUHJvcGVydHkoZS5wcm9wZXJ0eSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwub25Qcm9jZXNzRXhpdChlID0+IHtcblx0XHRcdGNvbnN0IHB0eSA9IHRoaXMuX3B0eXMuZ2V0KGUuaWQpO1xuXHRcdFx0aWYgKHB0eSkge1xuXHRcdFx0XHRwdHkuaGFuZGxlRXhpdChlLmV2ZW50KTtcblx0XHRcdFx0cHR5LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fcHR5cy5kZWxldGUoZS5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWxsb3dlZENvbW1hbmRzID0gWydfcmVtb3RlQ0xJLm9wZW5FeHRlcm5hbCcsICdfcmVtb3RlQ0xJLndpbmRvd09wZW4nLCAnX3JlbW90ZUNMSS5nZXRTeXN0ZW1TdGF0dXMnLCAnX3JlbW90ZUNMSS5tYW5hZ2VFeHRlbnNpb25zJ107XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLm9uRXhlY3V0ZUNvbW1hbmQoYXN5bmMgZSA9PiB7XG5cdFx0XHQvLyBFbnN1cmUgdGhpcyByZXF1ZXN0IGZvciBmb3IgdGhpcyB3aW5kb3dcblx0XHRcdGNvbnN0IHB0eSA9IHRoaXMuX3B0eXMuZ2V0KGUucGVyc2lzdGVudFByb2Nlc3NJZCk7XG5cdFx0XHRpZiAoIXB0eSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXFJZCA9IGUucmVxSWQ7XG5cdFx0XHRjb25zdCBjb21tYW5kSWQgPSBlLmNvbW1hbmRJZDtcblx0XHRcdGlmICghYWxsb3dlZENvbW1hbmRzLmluY2x1ZGVzKGNvbW1hbmRJZCkpIHtcblx0XHRcdFx0dGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnNlbmRDb21tYW5kUmVzdWx0KHJlcUlkLCB0cnVlLCAnSW52YWxpZCByZW1vdGUgY2xpIGNvbW1hbmQ6ICcgKyBjb21tYW5kSWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb21tYW5kQXJncyA9IGUuY29tbWFuZEFyZ3MubWFwKGFyZyA9PiByZXZpdmUoYXJnKSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChlLmNvbW1hbmRJZCwgLi4uY29tbWFuZEFyZ3MpO1xuXHRcdFx0XHR0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuc2VuZENvbW1hbmRSZXN1bHQocmVxSWQsIGZhbHNlLCByZXN1bHQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5zZW5kQ29tbWFuZFJlc3VsdChyZXFJZCwgdHJ1ZSwgZXJyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9vblB0eUhvc3RDb25uZWN0ZWQuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVxdWVzdERldGFjaEluc3RhbmNlKHdvcmtzcGFjZUlkOiBzdHJpbmcsIGluc3RhbmNlSWQ6IG51bWJlcik6IFByb21pc2U8SVByb2Nlc3NEZXRhaWxzIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHJlcXVlc3QgZGV0YWNoIGluc3RhbmNlIHdoZW4gdGhlcmUgaXMgbm8gcmVtb3RlIWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnJlcXVlc3REZXRhY2hJbnN0YW5jZSh3b3Jrc3BhY2VJZCwgaW5zdGFuY2VJZCk7XG5cdH1cblxuXHRhc3luYyBhY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5KHJlcXVlc3RJZDogbnVtYmVyLCBwZXJzaXN0ZW50UHJvY2Vzc0lkPzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGFjY2VwdCBkZXRhY2hlZCBpbnN0YW5jZSB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZSFgKTtcblx0XHR9IGVsc2UgaWYgKCFwZXJzaXN0ZW50UHJvY2Vzc0lkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ0Nhbm5vdCBhdHRhY2ggdG8gZmVhdHVyZSB0ZXJtaW5hbHMsIGN1c3RvbSBwdHkgdGVybWluYWxzLCBvciB0aG9zZSB3aXRob3V0IGEgcGVyc2lzdGVudFByb2Nlc3NJZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuYWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseShyZXF1ZXN0SWQsIHBlcnNpc3RlbnRQcm9jZXNzSWQpO1xuXHR9XG5cblx0YXN5bmMgcGVyc2lzdFRlcm1pbmFsU3RhdGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHBlcnNpc3QgdGVybWluYWwgc3RhdGUgd2hlbiB0aGVyZSBpcyBubyByZW1vdGUhYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGlkcyA9IEFycmF5LmZyb20odGhpcy5fcHR5cy5rZXlzKCkpO1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBhd2FpdCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuc2VyaWFsaXplVGVybWluYWxTdGF0ZShpZHMpO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxCdWZmZXJTdGF0ZSwgc2VyaWFsaXplZCwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdGFzeW5jIGNyZWF0ZVByb2Nlc3MoXG5cdFx0c2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyxcblx0XHRjd2Q6IHN0cmluZywgLy8gVE9ETzogVGhpcyBpcyBpZ25vcmVkXG5cdFx0Y29sczogbnVtYmVyLFxuXHRcdHJvd3M6IG51bWJlcixcblx0XHR1bmljb2RlVmVyc2lvbjogJzYnIHwgJzExJyxcblx0XHRlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQsIC8vIFRPRE86IFRoaXMgaXMgaWdub3JlZFxuXHRcdG9wdGlvbnM6IElUZXJtaW5hbFByb2Nlc3NPcHRpb25zLFxuXHRcdHNob3VsZFBlcnNpc3Q6IGJvb2xlYW5cblx0KTogUHJvbWlzZTxJVGVybWluYWxDaGlsZFByb2Nlc3M+IHtcblx0XHRpZiAoIXRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgY3JlYXRlIHJlbW90ZSB0ZXJtaW5hbCB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZSFgKTtcblx0XHR9XG5cblx0XHQvLyBGZXRjaCB0aGUgZW52aXJvbm1lbnQgdG8gY2hlY2sgc2hlbGwgcGVybWlzc2lvbnNcblx0XHRjb25zdCByZW1vdGVFbnYgPSBhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRpZiAoIXJlbW90ZUVudikge1xuXHRcdFx0Ly8gRXh0ZW5zaW9uIGhvc3QgcHJvY2Vzc2VzIGFyZSBvbmx5IGFsbG93ZWQgaW4gcmVtb3RlIGV4dGVuc2lvbiBob3N0cyBjdXJyZW50bHlcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZldGNoIHJlbW90ZSBlbnZpcm9ubWVudCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRlcm1pbmFsQ29uZmlnID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVRlcm1pbmFsQ29uZmlndXJhdGlvbj4oVEVSTUlOQUxfQ09ORklHX1NFQ1RJT04pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb246IElDb21wbGV0ZVRlcm1pbmFsQ29uZmlndXJhdGlvbiA9IHtcblx0XHRcdCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi53aW5kb3dzJzogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuRW52V2luZG93cykgYXMgSVRlcm1pbmFsRW52aXJvbm1lbnQsXG5cdFx0XHQndGVybWluYWwuaW50ZWdyYXRlZC5lbnYub3N4JzogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuRW52TWFjT3MpIGFzIElUZXJtaW5hbEVudmlyb25tZW50LFxuXHRcdFx0J3Rlcm1pbmFsLmludGVncmF0ZWQuZW52LmxpbnV4JzogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuRW52TGludXgpIGFzIElUZXJtaW5hbEVudmlyb25tZW50LFxuXHRcdFx0J3Rlcm1pbmFsLmludGVncmF0ZWQuY3dkJzogdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVGVybWluYWxTZXR0aW5nSWQuQ3dkKSBhcyBzdHJpbmcsXG5cdFx0XHQndGVybWluYWwuaW50ZWdyYXRlZC5kZXRlY3RMb2NhbGUnOiB0ZXJtaW5hbENvbmZpZy5kZXRlY3RMb2NhbGVcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2hlbGxMYXVuY2hDb25maWdEdG86IElTaGVsbExhdW5jaENvbmZpZ0R0byA9IHtcblx0XHRcdG5hbWU6IHNoZWxsTGF1bmNoQ29uZmlnLm5hbWUsXG5cdFx0XHRleGVjdXRhYmxlOiBzaGVsbExhdW5jaENvbmZpZy5leGVjdXRhYmxlLFxuXHRcdFx0YXJnczogc2hlbGxMYXVuY2hDb25maWcuYXJncyxcblx0XHRcdGN3ZDogc2hlbGxMYXVuY2hDb25maWcuY3dkLFxuXHRcdFx0ZW52OiBzaGVsbExhdW5jaENvbmZpZy5lbnYsXG5cdFx0XHR1c2VTaGVsbEVudmlyb25tZW50OiBzaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50LFxuXHRcdFx0cmVjb25uZWN0aW9uUHJvcGVydGllczogc2hlbGxMYXVuY2hDb25maWcucmVjb25uZWN0aW9uUHJvcGVydGllcyxcblx0XHRcdHR5cGU6IHNoZWxsTGF1bmNoQ29uZmlnLnR5cGUsXG5cdFx0XHRpc0ZlYXR1cmVUZXJtaW5hbDogc2hlbGxMYXVuY2hDb25maWcuaXNGZWF0dXJlVGVybWluYWwsXG5cdFx0XHRmb3JjZVNoZWxsSW50ZWdyYXRpb246IHNoZWxsTGF1bmNoQ29uZmlnLmZvcmNlU2hlbGxJbnRlZ3JhdGlvbixcblx0XHRcdHRhYkFjdGlvbnM6IHNoZWxsTGF1bmNoQ29uZmlnLnRhYkFjdGlvbnMsXG5cdFx0XHRzaGVsbEludGVncmF0aW9uRW52aXJvbm1lbnRSZXBvcnRpbmc6IHNoZWxsTGF1bmNoQ29uZmlnLnNoZWxsSW50ZWdyYXRpb25FbnZpcm9ubWVudFJlcG9ydGluZyxcblx0XHR9O1xuXHRcdGNvbnN0IGFjdGl2ZVdvcmtzcGFjZVJvb3RVcmkgPSBnZXRXb3Jrc3BhY2VGb3JUZXJtaW5hbChzaGVsbExhdW5jaENvbmZpZy5jd2QsIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0aGlzLl9oaXN0b3J5U2VydmljZSk/LnVyaTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5jcmVhdGVQcm9jZXNzKFxuXHRcdFx0c2hlbGxMYXVuY2hDb25maWdEdG8sXG5cdFx0XHRjb25maWd1cmF0aW9uLFxuXHRcdFx0YWN0aXZlV29ya3NwYWNlUm9vdFVyaSxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRzaG91bGRQZXJzaXN0LFxuXHRcdFx0Y29scyxcblx0XHRcdHJvd3MsXG5cdFx0XHR1bmljb2RlVmVyc2lvblxuXHRcdCk7XG5cdFx0Y29uc3QgcHR5ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlUHR5LCByZXN1bHQucGVyc2lzdGVudFRlcm1pbmFsSWQsIHNob3VsZFBlcnNpc3QsIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbCk7XG5cdFx0dGhpcy5fcHR5cy5zZXQocmVzdWx0LnBlcnNpc3RlbnRUZXJtaW5hbElkLCBwdHkpO1xuXHRcdHJldHVybiBwdHk7XG5cdH1cblxuXHRhc3luYyBhdHRhY2hUb1Byb2Nlc3MoaWQ6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsQ2hpbGRQcm9jZXNzIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNyZWF0ZSByZW1vdGUgdGVybWluYWwgd2hlbiB0aGVyZSBpcyBubyByZW1vdGUhYCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5hdHRhY2hUb1Byb2Nlc3MoaWQpO1xuXHRcdFx0Y29uc3QgcHR5ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlUHR5LCBpZCwgdHJ1ZSwgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsKTtcblx0XHRcdHRoaXMuX3B0eXMuc2V0KGlkLCBwdHkpO1xuXHRcdFx0cmV0dXJuIHB0eTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBDb3VsZG4ndCBhdHRhY2ggdG8gcHJvY2VzcyAke2UubWVzc2FnZX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGF0dGFjaFRvUmV2aXZlZFByb2Nlc3MoaWQ6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsQ2hpbGRQcm9jZXNzIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNyZWF0ZSByZW1vdGUgdGVybWluYWwgd2hlbiB0aGVyZSBpcyBubyByZW1vdGUhYCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG5ld0lkID0gYXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmdldFJldml2ZWRQdHlOZXdJZChpZCkgPz8gaWQ7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5hdHRhY2hUb1Byb2Nlc3MobmV3SWQpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYENvdWxkbid0IGF0dGFjaCB0byBwcm9jZXNzICR7ZS5tZXNzYWdlfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgbGlzdFByb2Nlc3NlcygpOiBQcm9taXNlPElQcm9jZXNzRGV0YWlsc1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5saXN0UHJvY2Vzc2VzKCk7XG5cdH1cblxuXHRhc3luYyBnZXRMYXRlbmN5KCk6IFByb21pc2U8SVB0eUhvc3RMYXRlbmN5TWVhc3VyZW1lbnRbXT4ge1xuXHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaCgpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuZ2V0TGF0ZW5jeSgpO1xuXHRcdHN3LnN0b3AoKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ3dpbmRvdzwtPnB0eWhvc3RzZXJ2aWNlPC0+cHR5aG9zdCcsXG5cdFx0XHRcdGxhdGVuY3k6IHN3LmVsYXBzZWQoKVxuXHRcdFx0fSxcblx0XHRcdC4uLnJlc3VsdHNcblx0XHRdO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUHJvcGVydHk8VCBleHRlbmRzIFByb2Nlc3NQcm9wZXJ0eVR5cGU+KGlkOiBudW1iZXIsIHByb3BlcnR5OiBULCB2YWx1ZTogSVByb2Nlc3NQcm9wZXJ0eU1hcFtUXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC51cGRhdGVQcm9wZXJ0eShpZCwgcHJvcGVydHksIHZhbHVlKTtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZVRpdGxlKGlkOiBudW1iZXIsIHRpdGxlOiBzdHJpbmcsIHRpdGxlU291cmNlOiBUaXRsZUV2ZW50U291cmNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnVwZGF0ZVRpdGxlKGlkLCB0aXRsZSwgdGl0bGVTb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlSWNvbihpZDogbnVtYmVyLCB1c2VySW5pdGlhdGVkOiBib29sZWFuLCBpY29uOiBUZXJtaW5hbEljb24sIGNvbG9yPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnVwZGF0ZUljb24oaWQsIHVzZXJJbml0aWF0ZWQsIGljb24sIGNvbG9yKTtcblx0fVxuXG5cdGFzeW5jIHNldE5leHRDb21tYW5kSWQoaWQ6IG51bWJlciwgY29tbWFuZExpbmU6IHN0cmluZywgY29tbWFuZElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuc2V0TmV4dENvbW1hbmRJZChpZCwgY29tbWFuZExpbmUsIGNvbW1hbmRJZCk7XG5cdH1cblxuXHRhc3luYyBnZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZT86IE9wZXJhdGluZ1N5c3RlbSk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5nZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZSkgfHwgJyc7XG5cdH1cblxuXHRhc3luYyBnZXRQcm9maWxlcyhwcm9maWxlczogdW5rbm93biwgZGVmYXVsdFByb2ZpbGU6IHVua25vd24sIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzPzogYm9vbGVhbik6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5nZXRQcm9maWxlcyhwcm9maWxlcywgZGVmYXVsdFByb2ZpbGUsIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzKSB8fCBbXTtcblx0fVxuXG5cdGFzeW5jIGdldEVudmlyb25tZW50KCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuZ2V0RW52aXJvbm1lbnQoKSB8fCB7fTtcblx0fVxuXG5cdGFzeW5jIGdldFNoZWxsRW52aXJvbm1lbnQoKTogUHJvbWlzZTxJUHJvY2Vzc0Vudmlyb25tZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRDb25uZWN0aW9uKCk7XG5cdFx0aWYgKCFjb25uZWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXNvbHZlclJlc3VsdCA9IGF3YWl0IHRoaXMuX3JlbW90ZUF1dGhvcml0eVJlc29sdmVyU2VydmljZS5yZXNvbHZlQXV0aG9yaXR5KGNvbm5lY3Rpb24ucmVtb3RlQXV0aG9yaXR5KTtcblx0XHRjb25zdCBlbnZSZXN1bHQ6IElQcm9jZXNzRW52aXJvbm1lbnQgPSB7fTtcblx0XHRpZiAocmVzb2x2ZXJSZXN1bHQub3B0aW9ucz8uZXh0ZW5zaW9uSG9zdEVudikge1xuXHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmVzb2x2ZXJSZXN1bHQub3B0aW9ucy5leHRlbnNpb25Ib3N0RW52KSkge1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IG51bGwpIHtcblx0XHRcdFx0XHRlbnZSZXN1bHRba2V5XSA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBlbnZSZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBnZXRXc2xQYXRoKG9yaWdpbmFsOiBzdHJpbmcsIGRpcmVjdGlvbjogJ3VuaXgtdG8td2luJyB8ICd3aW4tdG8tdW5peCcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGVudiA9IGF3YWl0IHRoaXMuX3JlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdGlmIChlbnY/Lm9zICE9PSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykge1xuXHRcdFx0cmV0dXJuIG9yaWdpbmFsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmdldFdzbFBhdGgob3JpZ2luYWwsIGRpcmVjdGlvbikgfHwgb3JpZ2luYWw7XG5cdH1cblxuXHRhc3luYyBzZXRUZXJtaW5hbExheW91dEluZm8obGF5b3V0PzogSVRlcm1pbmFsc0xheW91dEluZm9CeUlkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNhbGwgc2V0QWN0aXZlSW5zdGFuY2VJZCB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwuc2V0VGVybWluYWxMYXlvdXRJbmZvKGxheW91dCk7XG5cdH1cblxuXHRhc3luYyByZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCByZWR1Y2UgZ3JhY2UgdGltZSB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWUoKTtcblx0fVxuXG5cdGFzeW5jIGdldFRlcm1pbmFsTGF5b3V0SW5mbygpOiBQcm9taXNlPElUZXJtaW5hbHNMYXlvdXRJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGNhbGwgZ2V0QWN0aXZlSW5zdGFuY2VJZCB3aGVuIHRoZXJlIGlzIG5vIHJlbW90ZWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZUlkID0gdGhpcy5fZ2V0V29ya3NwYWNlSWQoKTtcblxuXHRcdC8vIFJldml2ZSBwcm9jZXNzZXMgaWYgbmVlZGVkXG5cdFx0Y29uc3Qgc2VyaWFsaXplZFN0YXRlID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxCdWZmZXJTdGF0ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0Y29uc3QgcmV2aXZlQnVmZmVyU3RhdGUgPSB0aGlzLl9kZXNlcmlhbGl6ZVRlcm1pbmFsU3RhdGUoc2VyaWFsaXplZFN0YXRlKTtcblx0XHRpZiAocmV2aXZlQnVmZmVyU3RhdGUgJiYgcmV2aXZlQnVmZmVyU3RhdGUubGVuZ3RoID4gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gTm90ZSB0aGF0IHJlbW90ZSB0ZXJtaW5hbHMgZG8gbm90IGdldCB0aGVpciBlbnZpcm9ubWVudCByZS1yZXNvbHZlZCB1bmxpa2UgaW4gbG9jYWwgdGVybWluYWxzXG5cblx0XHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC93aWxsUmV2aXZlVGVybWluYWxQcm9jZXNzZXNSZW1vdGUnKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLnJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzKHdvcmtzcGFjZUlkLCByZXZpdmVCdWZmZXJTdGF0ZSwgSW50bC5EYXRlVGltZUZvcm1hdCgpLnJlc29sdmVkT3B0aW9ucygpLmxvY2FsZSk7XG5cdFx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvZGlkUmV2aXZlVGVybWluYWxQcm9jZXNzZXNSZW1vdGUnKTtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFRlcm1pbmFsU3RvcmFnZUtleXMuVGVybWluYWxCdWZmZXJTdGF0ZSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHRcdC8vIElmIHJldml2aW5nIHByb2Nlc3Nlcywgc2VuZCB0aGUgdGVybWluYWwgbGF5b3V0IGluZm8gYmFjayB0byB0aGUgcHR5IGhvc3QgYXMgaXRcblx0XHRcdFx0Ly8gd2lsbCBub3QgaGF2ZSBiZWVuIHBlcnNpc3RlZCBvbiBhcHBsaWNhdGlvbiBleGl0XG5cdFx0XHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbExheW91dEluZm8sIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0XHRpZiAobGF5b3V0SW5mbykge1xuXHRcdFx0XHRcdG1hcmsoJ2NvZGUvdGVybWluYWwvd2lsbFNldFRlcm1pbmFsTGF5b3V0SW5mb1JlbW90ZScpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5zZXRUZXJtaW5hbExheW91dEluZm8oSlNPTi5wYXJzZShsYXlvdXRJbmZvKSk7XG5cdFx0XHRcdFx0bWFyaygnY29kZS90ZXJtaW5hbC9kaWRTZXRUZXJtaW5hbExheW91dEluZm9SZW1vdGUnKTtcblx0XHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoVGVybWluYWxTdG9yYWdlS2V5cy5UZXJtaW5hbExheW91dEluZm8sIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlOiB1bmtub3duKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignUmVtb3RlVGVybWluYWxCYWNrZW5kI2dldFRlcm1pbmFsTGF5b3V0SW5mbyBFcnJvcicsICg8eyBtZXNzYWdlPzogc3RyaW5nIH0+ZSkubWVzc2FnZSA/PyBlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmdldFRlcm1pbmFsTGF5b3V0SW5mbygpO1xuXHR9XG5cblx0YXN5bmMgZ2V0UGVyZm9ybWFuY2VNYXJrcygpOiBQcm9taXNlPFBlcmZvcm1hbmNlTWFya1tdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC5nZXRQZXJmb3JtYW5jZU1hcmtzKCk7XG5cdH1cblxuXHRpbnN0YWxsQXV0b1JlcGx5KG1hdGNoOiBzdHJpbmcsIHJlcGx5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcmVtb3RlVGVybWluYWxDaGFubmVsLmluc3RhbGxBdXRvUmVwbHkobWF0Y2gsIHJlcGx5KTtcblx0fVxuXG5cdHVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW1vdGVUZXJtaW5hbENoYW5uZWwudW5pbnN0YWxsQWxsQXV0b1JlcGxpZXMoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBQ3ZCLFNBQTBCLFlBQVk7QUFDdEMsU0FBOEIsdUJBQXVCO0FBQ3JELFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBRTdELFNBQXlLLHFCQUFxSSxvQkFBa0MseUJBQXFFO0FBRXJaLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCLG9DQUFvQztBQUMxRSxTQUFpRSwrQkFBK0I7QUFDaEcsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFFM0IsSUFBTSxvQ0FBTixNQUEwRTtBQUFBLEVBR2hGLFlBQ3dCLHNCQUNGLG9CQUNLLHlCQUN6QjtBQUNELFVBQU0sYUFBYSxtQkFBbUIsY0FBYztBQUNwRCxRQUFJLFlBQVksaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxxQkFBcUIsZUFBZSw2QkFBNkIsV0FBVyxpQkFBaUIsV0FBVyxXQUFXLDRCQUE0QixDQUFDO0FBQ2hLLFlBQU0sVUFBVSxxQkFBcUIsZUFBZSx1QkFBdUIsV0FBVyxpQkFBaUIsT0FBTztBQUM5RyxlQUFTLEdBQTZCLG1CQUFtQixPQUFPLEVBQUUsd0JBQXdCLE9BQU87QUFDakcsOEJBQXdCLG1CQUFtQixPQUFPO0FBQUEsSUFDbkQ7QUFBQSxFQUNEO0FBQ0Q7QUFoQmEsa0NBQ0wsS0FBSztBQURBLG9DQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FOVTtBQWtCYixJQUFNLHdCQUFOLGNBQW9DLG9CQUFnRDtBQUFBLEVBWW5GLFlBQ1UsaUJBQ1Esd0JBQ3FCLHFCQUNFLHVCQUNuQixZQUNhLGlCQUNBLGlCQUNnQixpQ0FDeEIseUJBQ0ssOEJBQ0csaUJBQ00sdUJBQ3JCLGtCQUNsQjtBQUNELFVBQU0sd0JBQXdCLFlBQVksaUJBQWlCLDhCQUE4QixrQkFBa0IsdUJBQXVCO0FBZHpIO0FBQ1E7QUFDcUI7QUFDRTtBQUVOO0FBQ0E7QUFDZ0I7QUFHaEI7QUFDTTtBQXZCekMsU0FBaUIsUUFBZ0Msb0JBQUksSUFBSTtBQUV6RCxTQUFpQixpQkFBaUIsSUFBSSxnQkFBc0I7QUFJNUQsU0FBaUIsc0JBQXNCLEtBQUssVUFBVSxJQUFJLFFBQXdFLENBQUM7QUFDbkksU0FBUyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFDdkQsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLFFBQWdFLENBQUM7QUFDMUgsU0FBUyxvQkFBb0IsS0FBSyxtQkFBbUI7QUFtQnBELFNBQUssVUFBVSxLQUFLLHVCQUF1QixjQUFjLE9BQUssS0FBSyxNQUFNLElBQUksRUFBRSxFQUFFLEdBQUcsV0FBVyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ3hHLFNBQUssVUFBVSxLQUFLLHVCQUF1QixnQkFBZ0IsT0FBSztBQUMvRCxXQUFLLE1BQU0sSUFBSSxFQUFFLEVBQUUsR0FBRyxhQUFhLEVBQUUsS0FBSztBQUMxQyxVQUFJLEVBQUUsTUFBTSxTQUFTLFNBQVMsU0FBUyxHQUFHO0FBQ3pDLGFBQUssbUJBQW1CLEtBQUssRUFBRSxJQUFJLEVBQUUsSUFBSSxVQUFVLEVBQUUsTUFBTSxTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQy9FO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyx1QkFBdUIsd0JBQXdCLE9BQUssS0FBSyxNQUFNLElBQUksRUFBRSxFQUFFLEdBQUcscUJBQXFCLENBQUMsQ0FBQztBQUNySCxTQUFLLFVBQVUsS0FBSyx1QkFBdUIsbUJBQW1CLE9BQUssS0FBSyxvQkFBb0IsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNwRyxTQUFLLFVBQVUsS0FBSyx1QkFBdUIsZUFBZSxPQUFLLEtBQUssTUFBTSxJQUFJLEVBQUUsRUFBRSxHQUFHLFlBQVksRUFBRSxLQUFLLENBQUMsQ0FBQztBQUMxRyxTQUFLLFVBQVUsS0FBSyx1QkFBdUIsb0JBQW9CLE9BQUssS0FBSyxNQUFNLElBQUksRUFBRSxFQUFFLEdBQUcsd0JBQXdCLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDOUgsU0FBSyxVQUFVLEtBQUssdUJBQXVCLGNBQWMsT0FBSztBQUM3RCxZQUFNLE1BQU0sS0FBSyxNQUFNLElBQUksRUFBRSxFQUFFO0FBQy9CLFVBQUksS0FBSztBQUNSLFlBQUksV0FBVyxFQUFFLEtBQUs7QUFDdEIsWUFBSSxRQUFRO0FBQ1osYUFBSyxNQUFNLE9BQU8sRUFBRSxFQUFFO0FBQUEsTUFDdkI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUVGLFVBQU0sa0JBQWtCLENBQUMsMkJBQTJCLHlCQUF5Qiw4QkFBOEIsNkJBQTZCO0FBQ3hJLFNBQUssVUFBVSxLQUFLLHVCQUF1QixpQkFBaUIsT0FBTSxNQUFLO0FBRXRFLFlBQU0sTUFBTSxLQUFLLE1BQU0sSUFBSSxFQUFFLG1CQUFtQjtBQUNoRCxVQUFJLENBQUMsS0FBSztBQUNUO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBUSxFQUFFO0FBQ2hCLFlBQU0sWUFBWSxFQUFFO0FBQ3BCLFVBQUksQ0FBQyxnQkFBZ0IsU0FBUyxTQUFTLEdBQUc7QUFDekMsYUFBSyx1QkFBdUIsa0JBQWtCLE9BQU8sTUFBTSxpQ0FBaUMsU0FBUztBQUNyRztBQUFBLE1BQ0Q7QUFDQSxZQUFNLGNBQWMsRUFBRSxZQUFZLElBQUksU0FBTyxPQUFPLEdBQUcsQ0FBQztBQUN4RCxVQUFJO0FBQ0gsY0FBTSxTQUFTLE1BQU0sS0FBSyxnQkFBZ0IsZUFBZSxFQUFFLFdBQVcsR0FBRyxXQUFXO0FBQ3BGLGFBQUssdUJBQXVCLGtCQUFrQixPQUFPLE9BQU8sTUFBTTtBQUFBLE1BQ25FLFNBQVMsS0FBSztBQUNiLGFBQUssdUJBQXVCLGtCQUFrQixPQUFPLE1BQU0sR0FBRztBQUFBLE1BQy9EO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLG9CQUFvQixLQUFLO0FBQUEsRUFDL0I7QUFBQSxFQXBFQSxJQUFJLFlBQTJCO0FBQUUsV0FBTyxLQUFLLGVBQWU7QUFBQSxFQUFHO0FBQUEsRUFDL0QsV0FBaUI7QUFBRSxTQUFLLGVBQWUsU0FBUztBQUFBLEVBQUc7QUFBQSxFQXFFbkQsTUFBTSxzQkFBc0IsYUFBcUIsWUFBMEQ7QUFDMUcsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDLFlBQU0sSUFBSSxNQUFNLHlEQUF5RDtBQUFBLElBQzFFO0FBQ0EsV0FBTyxLQUFLLHVCQUF1QixzQkFBc0IsYUFBYSxVQUFVO0FBQUEsRUFDakY7QUFBQSxFQUVBLE1BQU0sMEJBQTBCLFdBQW1CLHFCQUE2QztBQUMvRixRQUFJLENBQUMsS0FBSyx3QkFBd0I7QUFDakMsWUFBTSxJQUFJLE1BQU0sMERBQTBEO0FBQUEsSUFDM0UsV0FBVyxDQUFDLHFCQUFxQjtBQUNoQyxXQUFLLFlBQVksS0FBSyxrR0FBa0c7QUFDeEg7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLLHVCQUF1QiwwQkFBMEIsV0FBVyxtQkFBbUI7QUFBQSxFQUM1RjtBQUFBLEVBRUEsTUFBTSx1QkFBc0M7QUFDM0MsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDLFlBQU0sSUFBSSxNQUFNLHdEQUF3RDtBQUFBLElBQ3pFO0FBQ0EsVUFBTSxNQUFNLE1BQU0sS0FBSyxLQUFLLE1BQU0sS0FBSyxDQUFDO0FBQ3hDLFVBQU0sYUFBYSxNQUFNLEtBQUssdUJBQXVCLHVCQUF1QixHQUFHO0FBQy9FLFNBQUssZ0JBQWdCLE1BQU0sb0JBQW9CLHFCQUFxQixZQUFZLGFBQWEsV0FBVyxjQUFjLE9BQU87QUFBQSxFQUM5SDtBQUFBLEVBRUEsTUFBTSxjQUNMLG1CQUNBLEtBQ0EsTUFDQSxNQUNBLGdCQUNBLEtBQ0EsU0FDQSxlQUNpQztBQUNqQyxRQUFJLENBQUMsS0FBSyx3QkFBd0I7QUFDakMsWUFBTSxJQUFJLE1BQU0sd0RBQXdEO0FBQUEsSUFDekU7QUFHQSxVQUFNLFlBQVksTUFBTSxLQUFLLG9CQUFvQixlQUFlO0FBQ2hFLFFBQUksQ0FBQyxXQUFXO0FBRWYsWUFBTSxJQUFJLE1BQU0sb0NBQW9DO0FBQUEsSUFDckQ7QUFFQSxVQUFNLGlCQUFpQixLQUFLLHNCQUFzQixTQUFpQyx1QkFBdUI7QUFDMUcsVUFBTSxnQkFBZ0Q7QUFBQSxNQUNyRCxtQ0FBbUMsS0FBSyxzQkFBc0IsU0FBUyxrQkFBa0IsVUFBVTtBQUFBLE1BQ25HLCtCQUErQixLQUFLLHNCQUFzQixTQUFTLGtCQUFrQixRQUFRO0FBQUEsTUFDN0YsaUNBQWlDLEtBQUssc0JBQXNCLFNBQVMsa0JBQWtCLFFBQVE7QUFBQSxNQUMvRiwyQkFBMkIsS0FBSyxzQkFBc0IsU0FBUyxrQkFBa0IsR0FBRztBQUFBLE1BQ3BGLG9DQUFvQyxlQUFlO0FBQUEsSUFDcEQ7QUFFQSxVQUFNLHVCQUE4QztBQUFBLE1BQ25ELE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIsWUFBWSxrQkFBa0I7QUFBQSxNQUM5QixNQUFNLGtCQUFrQjtBQUFBLE1BQ3hCLEtBQUssa0JBQWtCO0FBQUEsTUFDdkIsS0FBSyxrQkFBa0I7QUFBQSxNQUN2QixxQkFBcUIsa0JBQWtCO0FBQUEsTUFDdkMsd0JBQXdCLGtCQUFrQjtBQUFBLE1BQzFDLE1BQU0sa0JBQWtCO0FBQUEsTUFDeEIsbUJBQW1CLGtCQUFrQjtBQUFBLE1BQ3JDLHVCQUF1QixrQkFBa0I7QUFBQSxNQUN6QyxZQUFZLGtCQUFrQjtBQUFBLE1BQzlCLHNDQUFzQyxrQkFBa0I7QUFBQSxJQUN6RDtBQUNBLFVBQU0seUJBQXlCLHdCQUF3QixrQkFBa0IsS0FBSyxLQUFLLDBCQUEwQixLQUFLLGVBQWUsR0FBRztBQUVwSSxVQUFNLFNBQVMsTUFBTSxLQUFLLHVCQUF1QjtBQUFBLE1BQ2hEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLE1BQU0sS0FBSyxzQkFBc0IsZUFBZSxXQUFXLE9BQU8sc0JBQXNCLGVBQWUsS0FBSyxzQkFBc0I7QUFDeEksU0FBSyxNQUFNLElBQUksT0FBTyxzQkFBc0IsR0FBRztBQUMvQyxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxnQkFBZ0IsSUFBd0Q7QUFDN0UsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDLFlBQU0sSUFBSSxNQUFNLHdEQUF3RDtBQUFBLElBQ3pFO0FBRUEsUUFBSTtBQUNILFlBQU0sS0FBSyx1QkFBdUIsZ0JBQWdCLEVBQUU7QUFDcEQsWUFBTSxNQUFNLEtBQUssc0JBQXNCLGVBQWUsV0FBVyxJQUFJLE1BQU0sS0FBSyxzQkFBc0I7QUFDdEcsV0FBSyxNQUFNLElBQUksSUFBSSxHQUFHO0FBQ3RCLGFBQU87QUFBQSxJQUNSLFNBQVMsR0FBRztBQUNYLFdBQUssWUFBWSxNQUFNLDhCQUE4QixFQUFFLE9BQU8sRUFBRTtBQUFBLElBQ2pFO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLElBQXdEO0FBQ3BGLFFBQUksQ0FBQyxLQUFLLHdCQUF3QjtBQUNqQyxZQUFNLElBQUksTUFBTSx3REFBd0Q7QUFBQSxJQUN6RTtBQUVBLFFBQUk7QUFDSCxZQUFNLFFBQVEsTUFBTSxLQUFLLHVCQUF1QixtQkFBbUIsRUFBRSxLQUFLO0FBQzFFLGFBQU8sTUFBTSxLQUFLLGdCQUFnQixLQUFLO0FBQUEsSUFDeEMsU0FBUyxHQUFHO0FBQ1gsV0FBSyxZQUFZLE1BQU0sOEJBQThCLEVBQUUsT0FBTyxFQUFFO0FBQUEsSUFDakU7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxnQkFBNEM7QUFDakQsV0FBTyxLQUFLLHVCQUF1QixjQUFjO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLE1BQU0sYUFBb0Q7QUFDekQsVUFBTSxLQUFLLElBQUksVUFBVTtBQUN6QixVQUFNLFVBQVUsTUFBTSxLQUFLLHVCQUF1QixXQUFXO0FBQzdELE9BQUcsS0FBSztBQUNSLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxPQUFPO0FBQUEsUUFDUCxTQUFTLEdBQUcsUUFBUTtBQUFBLE1BQ3JCO0FBQUEsTUFDQSxHQUFHO0FBQUEsSUFDSjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sZUFBOEMsSUFBWSxVQUFhLE9BQThDO0FBQzFILFVBQU0sS0FBSyx1QkFBdUIsZUFBZSxJQUFJLFVBQVUsS0FBSztBQUFBLEVBQ3JFO0FBQUEsRUFFQSxNQUFNLFlBQVksSUFBWSxPQUFlLGFBQThDO0FBQzFGLFVBQU0sS0FBSyx1QkFBdUIsWUFBWSxJQUFJLE9BQU8sV0FBVztBQUFBLEVBQ3JFO0FBQUEsRUFFQSxNQUFNLFdBQVcsSUFBWSxlQUF3QixNQUFvQixPQUErQjtBQUN2RyxVQUFNLEtBQUssdUJBQXVCLFdBQVcsSUFBSSxlQUFlLE1BQU0sS0FBSztBQUFBLEVBQzVFO0FBQUEsRUFFQSxNQUFNLGlCQUFpQixJQUFZLGFBQXFCLFdBQWtDO0FBQ3pGLFVBQU0sS0FBSyx1QkFBdUIsaUJBQWlCLElBQUksYUFBYSxTQUFTO0FBQUEsRUFDOUU7QUFBQSxFQUVBLE1BQU0sc0JBQXNCLFlBQStDO0FBQzFFLFdBQU8sS0FBSyx1QkFBdUIsc0JBQXNCLFVBQVUsS0FBSztBQUFBLEVBQ3pFO0FBQUEsRUFFQSxNQUFNLFlBQVksVUFBbUIsZ0JBQXlCLHlCQUFnRTtBQUM3SCxXQUFPLEtBQUssdUJBQXVCLFlBQVksVUFBVSxnQkFBZ0IsdUJBQXVCLEtBQUssQ0FBQztBQUFBLEVBQ3ZHO0FBQUEsRUFFQSxNQUFNLGlCQUErQztBQUNwRCxXQUFPLEtBQUssdUJBQXVCLGVBQWUsS0FBSyxDQUFDO0FBQUEsRUFDekQ7QUFBQSxFQUVBLE1BQU0sc0JBQWdFO0FBQ3JFLFVBQU0sYUFBYSxLQUFLLG9CQUFvQixjQUFjO0FBQzFELFFBQUksQ0FBQyxZQUFZO0FBQ2hCLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxpQkFBaUIsTUFBTSxLQUFLLGdDQUFnQyxpQkFBaUIsV0FBVyxlQUFlO0FBQzdHLFVBQU0sWUFBaUMsQ0FBQztBQUN4QyxRQUFJLGVBQWUsU0FBUyxrQkFBa0I7QUFDN0MsaUJBQVcsQ0FBQyxLQUFLLEtBQUssS0FBSyxPQUFPLFFBQVEsZUFBZSxRQUFRLGdCQUFnQixHQUFHO0FBQ25GLFlBQUksVUFBVSxNQUFNO0FBQ25CLG9CQUFVLEdBQUcsSUFBSTtBQUFBLFFBQ2xCO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxXQUFXLFVBQWtCLFdBQTJEO0FBQzdGLFVBQU0sTUFBTSxNQUFNLEtBQUssb0JBQW9CLGVBQWU7QUFDMUQsUUFBSSxLQUFLLE9BQU8sZ0JBQWdCLFNBQVM7QUFDeEMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLEtBQUssdUJBQXVCLFdBQVcsVUFBVSxTQUFTLEtBQUs7QUFBQSxFQUN2RTtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsUUFBa0Q7QUFDN0UsUUFBSSxDQUFDLEtBQUssd0JBQXdCO0FBQ2pDLFlBQU0sSUFBSSxNQUFNLHlEQUF5RDtBQUFBLElBQzFFO0FBRUEsV0FBTyxLQUFLLHVCQUF1QixzQkFBc0IsTUFBTTtBQUFBLEVBQ2hFO0FBQUEsRUFFQSxNQUFNLDRCQUEyQztBQUNoRCxRQUFJLENBQUMsS0FBSyx3QkFBd0I7QUFDakMsWUFBTSxJQUFJLE1BQU0sa0RBQWtEO0FBQUEsSUFDbkU7QUFDQSxXQUFPLEtBQUssdUJBQXVCLDBCQUEwQjtBQUFBLEVBQzlEO0FBQUEsRUFFQSxNQUFNLHdCQUFtRTtBQUN4RSxRQUFJLENBQUMsS0FBSyx3QkFBd0I7QUFDakMsWUFBTSxJQUFJLE1BQU0seURBQXlEO0FBQUEsSUFDMUU7QUFFQSxVQUFNLGNBQWMsS0FBSyxnQkFBZ0I7QUFHekMsVUFBTSxrQkFBa0IsS0FBSyxnQkFBZ0IsSUFBSSxvQkFBb0IscUJBQXFCLGFBQWEsU0FBUztBQUNoSCxVQUFNLG9CQUFvQixLQUFLLDBCQUEwQixlQUFlO0FBQ3hFLFFBQUkscUJBQXFCLGtCQUFrQixTQUFTLEdBQUc7QUFDdEQsVUFBSTtBQUdILGFBQUssaURBQWlEO0FBQ3RELGNBQU0sS0FBSyx1QkFBdUIsd0JBQXdCLGFBQWEsbUJBQW1CLEtBQUssZUFBZSxFQUFFLGdCQUFnQixFQUFFLE1BQU07QUFDeEksYUFBSyxnREFBZ0Q7QUFDckQsYUFBSyxnQkFBZ0IsT0FBTyxvQkFBb0IscUJBQXFCLGFBQWEsU0FBUztBQUczRixjQUFNLGFBQWEsS0FBSyxnQkFBZ0IsSUFBSSxvQkFBb0Isb0JBQW9CLGFBQWEsU0FBUztBQUMxRyxZQUFJLFlBQVk7QUFDZixlQUFLLCtDQUErQztBQUNwRCxnQkFBTSxLQUFLLHVCQUF1QixzQkFBc0IsS0FBSyxNQUFNLFVBQVUsQ0FBQztBQUM5RSxlQUFLLDhDQUE4QztBQUNuRCxlQUFLLGdCQUFnQixPQUFPLG9CQUFvQixvQkFBb0IsYUFBYSxTQUFTO0FBQUEsUUFDM0Y7QUFBQSxNQUNELFNBQVMsR0FBWTtBQUNwQixhQUFLLFlBQVksS0FBSyxxREFBNEUsRUFBRyxXQUFXLENBQUM7QUFBQSxNQUNsSDtBQUFBLElBQ0Q7QUFFQSxXQUFPLEtBQUssdUJBQXVCLHNCQUFzQjtBQUFBLEVBQzFEO0FBQUEsRUFFQSxNQUFNLHNCQUFrRDtBQUN2RCxXQUFPLEtBQUssdUJBQXVCLG9CQUFvQjtBQUFBLEVBQ3hEO0FBQUEsRUFFQSxpQkFBaUIsT0FBZSxPQUE4QjtBQUM3RCxXQUFPLEtBQUssdUJBQXVCLGlCQUFpQixPQUFPLEtBQUs7QUFBQSxFQUNqRTtBQUFBLEVBRUEsMEJBQXlDO0FBQ3hDLFdBQU8sS0FBSyx1QkFBdUIsd0JBQXdCO0FBQUEsRUFDNUQ7QUFDRDtBQW5VTSx3QkFBTjtBQUFBLEVBZUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F6Qkc7IiwKICAibmFtZXMiOiBbXQp9Cg==
