import * as os from "os";
import { Emitter, Event } from "../../base/common/event.js";
import { cloneAndChange } from "../../base/common/objects.js";
import { Disposable } from "../../base/common/lifecycle.js";
import * as path from "../../base/common/path.js";
import * as platform from "../../base/common/platform.js";
import { URI } from "../../base/common/uri.js";
import { createRandomIPCHandle } from "../../base/parts/ipc/node/ipc.net.js";
import { createURITransformer } from "../../base/common/uriTransformer.js";
import { CLIServerBase } from "../../workbench/api/node/extHostCLIServer.js";
import { MergedEnvironmentVariableCollection } from "../../platform/terminal/common/environmentVariableCollection.js";
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection } from "../../platform/terminal/common/environmentVariableShared.js";
import { RemoteTerminalChannelEvent, RemoteTerminalChannelRequest } from "../../workbench/contrib/terminal/common/remote/terminal.js";
import * as terminalEnvironment from "../../workbench/contrib/terminal/common/terminalEnvironment.js";
import { AbstractVariableResolverService } from "../../workbench/services/configurationResolver/common/variableResolver.js";
import { buildUserEnvironment } from "./extensionHostConnection.js";
import { promiseWithResolvers } from "../../base/common/async.js";
import { shouldUseEnvironmentVariableCollection } from "../../platform/terminal/common/terminalEnvironment.js";
class CustomVariableResolver extends AbstractVariableResolverService {
  constructor(env, workspaceFolders, activeFileResource, resolvedVariables, extensionService) {
    super({
      getFolderUri: (folderName) => {
        const found = workspaceFolders.filter((f) => f.name === folderName);
        if (found && found.length > 0) {
          return found[0].uri;
        }
        return void 0;
      },
      getWorkspaceFolderCount: () => {
        return workspaceFolders.length;
      },
      getConfigurationValue: (folderUri, section) => {
        return resolvedVariables[`config:${section}`];
      },
      getExecPath: () => {
        return env["VSCODE_EXEC_PATH"];
      },
      getAppRoot: () => {
        return env["VSCODE_CWD"];
      },
      getFilePath: () => {
        if (activeFileResource) {
          return path.normalize(activeFileResource.fsPath);
        }
        return void 0;
      },
      getSelectedText: () => {
        return resolvedVariables["selectedText"];
      },
      getLineNumber: () => {
        return resolvedVariables["lineNumber"];
      },
      getColumnNumber: () => {
        return resolvedVariables["columnNumber"];
      },
      getExtension: async (id) => {
        const installed = await extensionService.getInstalled();
        const found = installed.find((e) => e.identifier.id === id);
        return found && { extensionLocation: found.location };
      }
    }, void 0, Promise.resolve(os.homedir()), Promise.resolve(env));
  }
}
class RemoteTerminalChannel extends Disposable {
  constructor(_environmentService, _logService, _ptyHostService, _productService, _extensionManagementService, _configurationService) {
    super();
    this._environmentService = _environmentService;
    this._logService = _logService;
    this._ptyHostService = _ptyHostService;
    this._productService = _productService;
    this._extensionManagementService = _extensionManagementService;
    this._configurationService = _configurationService;
    this._lastReqId = 0;
    this._pendingCommands = /* @__PURE__ */ new Map();
    this._onExecuteCommand = this._register(new Emitter());
    this.onExecuteCommand = this._onExecuteCommand.event;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async call(ctx, command, args) {
    switch (command) {
      case RemoteTerminalChannelRequest.RestartPtyHost:
        return this._ptyHostService.restartPtyHost.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.CreateProcess: {
        const uriTransformer = createURITransformer(ctx.remoteAuthority);
        return this._createProcess(uriTransformer, args);
      }
      case RemoteTerminalChannelRequest.AttachToProcess:
        return this._ptyHostService.attachToProcess.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.DetachFromProcess:
        return this._ptyHostService.detachFromProcess.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ListProcesses:
        return this._ptyHostService.listProcesses.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetLatency:
        return this._ptyHostService.getLatency.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetPerformanceMarks:
        return this._ptyHostService.getPerformanceMarks.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.OrphanQuestionReply:
        return this._ptyHostService.orphanQuestionReply.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.AcceptPtyHostResolvedVariables:
        return this._ptyHostService.acceptPtyHostResolvedVariables.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Start:
        return this._ptyHostService.start.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Input:
        return this._ptyHostService.input.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SendSignal:
        return this._ptyHostService.sendSignal.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.AcknowledgeDataEvent:
        return this._ptyHostService.acknowledgeDataEvent.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Shutdown:
        return this._ptyHostService.shutdown.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.Resize:
        return this._ptyHostService.resize.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ClearBuffer:
        return this._ptyHostService.clearBuffer.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetInitialCwd:
        return this._ptyHostService.getInitialCwd.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetCwd:
        return this._ptyHostService.getCwd.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ProcessBinary:
        return this._ptyHostService.processBinary.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SendCommandResult:
        return this._sendCommandResult(args[0], args[1], args[2]);
      case RemoteTerminalChannelRequest.InstallAutoReply:
        return this._ptyHostService.installAutoReply.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.UninstallAllAutoReplies:
        return this._ptyHostService.uninstallAllAutoReplies.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetDefaultSystemShell:
        return this._getDefaultSystemShell.apply(this, args);
      case RemoteTerminalChannelRequest.GetProfiles:
        return this._getProfiles.apply(this, args);
      case RemoteTerminalChannelRequest.GetEnvironment:
        return this._getEnvironment();
      case RemoteTerminalChannelRequest.GetWslPath:
        return this._getWslPath(args[0], args[1]);
      case RemoteTerminalChannelRequest.GetTerminalLayoutInfo:
        return this._ptyHostService.getTerminalLayoutInfo(args);
      case RemoteTerminalChannelRequest.SetTerminalLayoutInfo:
        return this._ptyHostService.setTerminalLayoutInfo(args);
      case RemoteTerminalChannelRequest.SerializeTerminalState:
        return this._ptyHostService.serializeTerminalState.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ReviveTerminalProcesses:
        return this._ptyHostService.reviveTerminalProcesses.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.GetRevivedPtyNewId:
        return this._ptyHostService.getRevivedPtyNewId.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SetUnicodeVersion:
        return this._ptyHostService.setUnicodeVersion.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.SetNextCommandId:
        return this._ptyHostService.setNextCommandId.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.ReduceConnectionGraceTime:
        return this._reduceConnectionGraceTime();
      case RemoteTerminalChannelRequest.UpdateIcon:
        return this._ptyHostService.updateIcon.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.UpdateTitle:
        return this._ptyHostService.updateTitle.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.UpdateProperty:
        return this._ptyHostService.updateProperty.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.RefreshProperty:
        return this._ptyHostService.refreshProperty.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.RequestDetachInstance:
        return this._ptyHostService.requestDetachInstance(args[0], args[1]);
      case RemoteTerminalChannelRequest.AcceptDetachedInstance:
        return this._ptyHostService.acceptDetachInstanceReply(args[0], args[1]);
      case RemoteTerminalChannelRequest.FreePortKillProcess:
        return this._ptyHostService.freePortKillProcess.apply(this._ptyHostService, args);
      case RemoteTerminalChannelRequest.AcceptDetachInstanceReply:
        return this._ptyHostService.acceptDetachInstanceReply.apply(this._ptyHostService, args);
    }
    throw new Error(`IPC Command ${command} not found`);
  }
  listen(_, event, _arg) {
    switch (event) {
      case RemoteTerminalChannelEvent.OnPtyHostExitEvent:
        return this._ptyHostService.onPtyHostExit || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostStartEvent:
        return this._ptyHostService.onPtyHostStart || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostUnresponsiveEvent:
        return this._ptyHostService.onPtyHostUnresponsive || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostResponsiveEvent:
        return this._ptyHostService.onPtyHostResponsive || Event.None;
      case RemoteTerminalChannelEvent.OnPtyHostRequestResolveVariablesEvent:
        return this._ptyHostService.onPtyHostRequestResolveVariables || Event.None;
      case RemoteTerminalChannelEvent.OnProcessDataEvent:
        return this._ptyHostService.onProcessData;
      case RemoteTerminalChannelEvent.OnProcessReadyEvent:
        return this._ptyHostService.onProcessReady;
      case RemoteTerminalChannelEvent.OnProcessExitEvent:
        return this._ptyHostService.onProcessExit;
      case RemoteTerminalChannelEvent.OnProcessReplayEvent:
        return this._ptyHostService.onProcessReplay;
      case RemoteTerminalChannelEvent.OnProcessOrphanQuestion:
        return this._ptyHostService.onProcessOrphanQuestion;
      case RemoteTerminalChannelEvent.OnExecuteCommand:
        return this.onExecuteCommand;
      case RemoteTerminalChannelEvent.OnDidRequestDetach:
        return this._ptyHostService.onDidRequestDetach || Event.None;
      case RemoteTerminalChannelEvent.OnDidChangeProperty:
        return this._ptyHostService.onDidChangeProperty;
    }
    throw new Error(`IPC Command ${event} not found`);
  }
  async _createProcess(uriTransformer, args) {
    const shellLaunchConfig = {
      name: args.shellLaunchConfig.name,
      executable: args.shellLaunchConfig.executable,
      args: args.shellLaunchConfig.args,
      cwd: typeof args.shellLaunchConfig.cwd === "string" || typeof args.shellLaunchConfig.cwd === "undefined" ? args.shellLaunchConfig.cwd : URI.revive(uriTransformer.transformIncoming(args.shellLaunchConfig.cwd)),
      env: args.shellLaunchConfig.env,
      useShellEnvironment: args.shellLaunchConfig.useShellEnvironment,
      reconnectionProperties: args.shellLaunchConfig.reconnectionProperties,
      type: args.shellLaunchConfig.type,
      isFeatureTerminal: args.shellLaunchConfig.isFeatureTerminal,
      forceShellIntegration: args.shellLaunchConfig.forceShellIntegration,
      tabActions: args.shellLaunchConfig.tabActions,
      shellIntegrationEnvironmentReporting: args.shellLaunchConfig.shellIntegrationEnvironmentReporting
    };
    const baseEnv = await buildUserEnvironment(args.resolverEnv, !!args.shellLaunchConfig.useShellEnvironment, platform.language, this._environmentService, this._logService, this._configurationService);
    this._logService.trace("baseEnv", baseEnv);
    const reviveWorkspaceFolder = (workspaceData) => {
      return {
        uri: URI.revive(uriTransformer.transformIncoming(workspaceData.uri)),
        name: workspaceData.name,
        index: workspaceData.index,
        toResource: () => {
          throw new Error("Not implemented");
        }
      };
    };
    const workspaceFolders = args.workspaceFolders.map(reviveWorkspaceFolder);
    const activeWorkspaceFolder = args.activeWorkspaceFolder ? reviveWorkspaceFolder(args.activeWorkspaceFolder) : void 0;
    const activeFileResource = args.activeFileResource ? URI.revive(uriTransformer.transformIncoming(args.activeFileResource)) : void 0;
    const customVariableResolver = new CustomVariableResolver(baseEnv, workspaceFolders, activeFileResource, args.resolvedVariables, this._extensionManagementService);
    const variableResolver = terminalEnvironment.createVariableResolver(activeWorkspaceFolder, baseEnv, customVariableResolver);
    const initialCwd = await terminalEnvironment.getCwd(shellLaunchConfig, os.homedir(), variableResolver, activeWorkspaceFolder?.uri, args.configuration["terminal.integrated.cwd"], this._logService);
    shellLaunchConfig.cwd = initialCwd;
    const envPlatformKey = platform.isWindows ? "terminal.integrated.env.windows" : platform.isMacintosh ? "terminal.integrated.env.osx" : "terminal.integrated.env.linux";
    const envFromConfig = args.configuration[envPlatformKey];
    const env = await terminalEnvironment.createTerminalEnvironment(
      shellLaunchConfig,
      envFromConfig,
      variableResolver,
      this._productService.version,
      args.configuration["terminal.integrated.detectLocale"],
      baseEnv
    );
    if (shouldUseEnvironmentVariableCollection(shellLaunchConfig)) {
      const entries = [];
      for (const [k, v, d] of args.envVariableCollections) {
        entries.push([k, { map: deserializeEnvironmentVariableCollection(v), descriptionMap: deserializeEnvironmentDescriptionMap(d) }]);
      }
      const envVariableCollections = new Map(entries);
      const mergedCollection = new MergedEnvironmentVariableCollection(envVariableCollections);
      const workspaceFolder = activeWorkspaceFolder ? activeWorkspaceFolder ?? void 0 : void 0;
      await mergedCollection.applyToProcessEnvironment(env, { workspaceFolder }, variableResolver);
    }
    this._logService.debug(`Terminal process launching on remote agent`, { shellLaunchConfig, initialCwd, cols: args.cols, rows: args.rows, env });
    const ipcHandlePath = createRandomIPCHandle();
    env.VSCODE_IPC_HOOK_CLI = ipcHandlePath;
    const persistentProcessId = await this._ptyHostService.createProcess(shellLaunchConfig, initialCwd, args.cols, args.rows, args.unicodeVersion, env, baseEnv, args.options, args.shouldPersistTerminal, args.workspaceId, args.workspaceName);
    const commandsExecuter = {
      executeCommand: (id, ...args2) => this._executeCommand(persistentProcessId, id, args2, uriTransformer)
    };
    const cliServer = new CLIServerBase(commandsExecuter, this._logService, ipcHandlePath);
    this._ptyHostService.onProcessExit((e) => e.id === persistentProcessId && cliServer.dispose());
    return {
      persistentTerminalId: persistentProcessId,
      resolvedShellLaunchConfig: shellLaunchConfig
    };
  }
  _executeCommand(persistentProcessId, commandId, commandArgs, uriTransformer) {
    const { resolve, reject, promise } = promiseWithResolvers();
    const reqId = ++this._lastReqId;
    this._pendingCommands.set(reqId, { resolve, reject, uriTransformer });
    const serializedCommandArgs = cloneAndChange(commandArgs, (obj) => {
      if (obj && obj.$mid === 1) {
        return uriTransformer.transformOutgoing(obj);
      }
      if (obj && obj instanceof URI) {
        return uriTransformer.transformOutgoingURI(obj);
      }
      return void 0;
    });
    this._onExecuteCommand.fire({
      reqId,
      persistentProcessId,
      commandId,
      commandArgs: serializedCommandArgs
    });
    return promise;
  }
  _sendCommandResult(reqId, isError, serializedPayload) {
    const data = this._pendingCommands.get(reqId);
    if (!data) {
      return;
    }
    this._pendingCommands.delete(reqId);
    const payload = cloneAndChange(serializedPayload, (obj) => {
      if (obj && obj.$mid === 1) {
        return data.uriTransformer.transformIncoming(obj);
      }
      return void 0;
    });
    if (isError) {
      data.reject(payload);
    } else {
      data.resolve(payload);
    }
  }
  _getDefaultSystemShell(osOverride) {
    return this._ptyHostService.getDefaultSystemShell(osOverride);
  }
  async _getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles) {
    return this._ptyHostService.getProfiles(workspaceId, profiles, defaultProfile, includeDetectedProfiles) || [];
  }
  _getEnvironment() {
    return { ...process.env };
  }
  _getWslPath(original, direction) {
    return this._ptyHostService.getWslPath(original, direction);
  }
  _reduceConnectionGraceTime() {
    return this._ptyHostService.reduceConnectionGraceTime();
  }
}
export {
  RemoteTerminalChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3NlcnZlci9ub2RlL3JlbW90ZVRlcm1pbmFsQ2hhbm5lbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG9zIGZyb20gJ29zJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY2xvbmVBbmRDaGFuZ2UgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVVJJVHJhbnNmb3JtZXIgfSBmcm9tICcuLi8uLi9iYXNlL2NvbW1vbi91cmlJcGMuanMnO1xuaW1wb3J0IHsgSVNlcnZlckNoYW5uZWwgfSBmcm9tICcuLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJhbmRvbUlQQ0hhbmRsZSB9IGZyb20gJy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudENvbm5lY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElQdHlIb3N0U2VydmljZSwgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxQcm9maWxlIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElHZXRUZXJtaW5hbExheW91dEluZm9BcmdzLCBJU2V0VGVybWluYWxMYXlvdXRJbmZvQXJncyB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFByb2Nlc3MuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVVSSVRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vYmFzZS9jb21tb24vdXJpVHJhbnNmb3JtZXIuanMnO1xuaW1wb3J0IHsgQ0xJU2VydmVyQmFzZSwgSUNvbW1hbmRzRXhlY3V0ZXIgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvYXBpL25vZGUvZXh0SG9zdENMSVNlcnZlci5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZS5qcyc7XG5pbXBvcnQgeyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBkZXNlcmlhbGl6ZUVudmlyb25tZW50RGVzY3JpcHRpb25NYXAsIGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vZW52aXJvbm1lbnRWYXJpYWJsZVNoYXJlZC5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlVGVybWluYWxQcm9jZXNzQXJndW1lbnRzLCBJQ3JlYXRlVGVybWluYWxQcm9jZXNzUmVzdWx0LCBJV29ya3NwYWNlRm9sZGVyRGF0YSwgUmVtb3RlVGVybWluYWxDaGFubmVsRXZlbnQsIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QgfSBmcm9tICcuLi8uLi93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbC9jb21tb24vcmVtb3RlL3Rlcm1pbmFsLmpzJztcbmltcG9ydCAqIGFzIHRlcm1pbmFsRW52aXJvbm1lbnQgZnJvbSAnLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsRW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RWYXJpYWJsZVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL3ZhcmlhYmxlUmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgYnVpbGRVc2VyRW52aXJvbm1lbnQgfSBmcm9tICcuL2V4dGVuc2lvbkhvc3RDb25uZWN0aW9uLmpzJztcbmltcG9ydCB7IElTZXJ2ZXJFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuL3NlcnZlckVudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBwcm9taXNlV2l0aFJlc29sdmVycyB9IGZyb20gJy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHNob3VsZFVzZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsRW52aXJvbm1lbnQuanMnO1xuXG5jbGFzcyBDdXN0b21WYXJpYWJsZVJlc29sdmVyIGV4dGVuZHMgQWJzdHJhY3RWYXJpYWJsZVJlc29sdmVyU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVudjogcGxhdGZvcm0uSVByb2Nlc3NFbnZpcm9ubWVudCxcblx0XHR3b3Jrc3BhY2VGb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10sXG5cdFx0YWN0aXZlRmlsZVJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0cmVzb2x2ZWRWYXJpYWJsZXM6IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB9LFxuXHRcdGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0Z2V0Rm9sZGVyVXJpOiAoZm9sZGVyTmFtZTogc3RyaW5nKTogVVJJIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSB3b3Jrc3BhY2VGb2xkZXJzLmZpbHRlcihmID0+IGYubmFtZSA9PT0gZm9sZGVyTmFtZSk7XG5cdFx0XHRcdGlmIChmb3VuZCAmJiBmb3VuZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZvdW5kWzBdLnVyaTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlckNvdW50OiAoKTogbnVtYmVyID0+IHtcblx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoO1xuXHRcdFx0fSxcblx0XHRcdGdldENvbmZpZ3VyYXRpb25WYWx1ZTogKGZvbGRlclVyaTogVVJJLCBzZWN0aW9uOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWRWYXJpYWJsZXNbYGNvbmZpZzoke3NlY3Rpb259YF07XG5cdFx0XHR9LFxuXHRcdFx0Z2V0RXhlY1BhdGg6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gZW52WydWU0NPREVfRVhFQ19QQVRIJ107XG5cdFx0XHR9LFxuXHRcdFx0Z2V0QXBwUm9vdDogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdHJldHVybiBlbnZbJ1ZTQ09ERV9DV0QnXTtcblx0XHRcdH0sXG5cdFx0XHRnZXRGaWxlUGF0aDogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGlmIChhY3RpdmVGaWxlUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGF0aC5ub3JtYWxpemUoYWN0aXZlRmlsZVJlc291cmNlLmZzUGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZWxlY3RlZFRleHQ6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWRWYXJpYWJsZXNbJ3NlbGVjdGVkVGV4dCddO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVOdW1iZXI6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWRWYXJpYWJsZXNbJ2xpbmVOdW1iZXInXTtcblx0XHRcdH0sXG5cdFx0XHRnZXRDb2x1bW5OdW1iZXI6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWRWYXJpYWJsZXNbJ2NvbHVtbk51bWJlciddO1xuXHRcdFx0fSxcblx0XHRcdGdldEV4dGVuc2lvbjogYXN5bmMgaWQgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YWxsZWQgPSBhd2FpdCBleHRlbnNpb25TZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXHRcdFx0XHRjb25zdCBmb3VuZCA9IGluc3RhbGxlZC5maW5kKGUgPT4gZS5pZGVudGlmaWVyLmlkID09PSBpZCk7XG5cdFx0XHRcdHJldHVybiBmb3VuZCAmJiB7IGV4dGVuc2lvbkxvY2F0aW9uOiBmb3VuZC5sb2NhdGlvbiB9O1xuXHRcdFx0fSxcblx0XHR9LCB1bmRlZmluZWQsIFByb21pc2UucmVzb2x2ZShvcy5ob21lZGlyKCkpLCBQcm9taXNlLnJlc29sdmUoZW52KSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VydmVyQ2hhbm5lbDxSZW1vdGVBZ2VudENvbm5lY3Rpb25Db250ZXh0PiB7XG5cblx0cHJpdmF0ZSBfbGFzdFJlcUlkID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0NvbW1hbmRzID0gbmV3IE1hcDxudW1iZXIsIHtcblx0XHRyZXNvbHZlOiAodmFsdWU6IHVua25vd24pID0+IHZvaWQ7XG5cdFx0cmVqZWN0OiAoZXJyPzogdW5rbm93bikgPT4gdm9pZDtcblx0XHR1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyO1xuXHR9PigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRXhlY3V0ZUNvbW1hbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlcUlkOiBudW1iZXI7IHBlcnNpc3RlbnRQcm9jZXNzSWQ6IG51bWJlcjsgY29tbWFuZElkOiBzdHJpbmc7IGNvbW1hbmRBcmdzOiB1bmtub3duW10gfT4oKSk7XG5cdHJlYWRvbmx5IG9uRXhlY3V0ZUNvbW1hbmQgPSB0aGlzLl9vbkV4ZWN1dGVDb21tYW5kLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSVNlcnZlckVudmlyb25tZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wdHlIb3N0U2VydmljZTogSVB0eUhvc3RTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRhc3luYyBjYWxsKGN0eDogUmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dCwgY29tbWFuZDogUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdCwgYXJncz86IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuUmVzdGFydFB0eUhvc3Q6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5yZXN0YXJ0UHR5SG9zdC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5DcmVhdGVQcm9jZXNzOiB7XG5cdFx0XHRcdGNvbnN0IHVyaVRyYW5zZm9ybWVyID0gY3JlYXRlVVJJVHJhbnNmb3JtZXIoY3R4LnJlbW90ZUF1dGhvcml0eSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVQcm9jZXNzKHVyaVRyYW5zZm9ybWVyLCA8SUNyZWF0ZVRlcm1pbmFsUHJvY2Vzc0FyZ3VtZW50cz5hcmdzKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5BdHRhY2hUb1Byb2Nlc3M6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5hdHRhY2hUb1Byb2Nlc3MuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkRldGFjaEZyb21Qcm9jZXNzOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuZGV0YWNoRnJvbVByb2Nlc3MuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuTGlzdFByb2Nlc3NlczogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmxpc3RQcm9jZXNzZXMuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkdldExhdGVuY3k6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5nZXRMYXRlbmN5LmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRQZXJmb3JtYW5jZU1hcmtzOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuZ2V0UGVyZm9ybWFuY2VNYXJrcy5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuT3JwaGFuUXVlc3Rpb25SZXBseTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9ycGhhblF1ZXN0aW9uUmVwbHkuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkFjY2VwdFB0eUhvc3RSZXNvbHZlZFZhcmlhYmxlczogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmFjY2VwdFB0eUhvc3RSZXNvbHZlZFZhcmlhYmxlcy5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5TdGFydDogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnN0YXJ0LmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5JbnB1dDogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmlucHV0LmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5TZW5kU2lnbmFsOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2Uuc2VuZFNpZ25hbC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuQWNrbm93bGVkZ2VEYXRhRXZlbnQ6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5hY2tub3dsZWRnZURhdGFFdmVudC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuU2h1dGRvd246IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5zaHV0ZG93bi5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuUmVzaXplOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UucmVzaXplLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5DbGVhckJ1ZmZlcjogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmNsZWFyQnVmZmVyLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRJbml0aWFsQ3dkOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuZ2V0SW5pdGlhbEN3ZC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuR2V0Q3dkOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuZ2V0Q3dkLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblxuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlByb2Nlc3NCaW5hcnk6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5wcm9jZXNzQmluYXJ5LmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblxuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlNlbmRDb21tYW5kUmVzdWx0OiByZXR1cm4gdGhpcy5fc2VuZENvbW1hbmRSZXN1bHQoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuSW5zdGFsbEF1dG9SZXBseTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmluc3RhbGxBdXRvUmVwbHkuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlVuaW5zdGFsbEFsbEF1dG9SZXBsaWVzOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UudW5pbnN0YWxsQWxsQXV0b1JlcGxpZXMuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkdldERlZmF1bHRTeXN0ZW1TaGVsbDogcmV0dXJuIHRoaXMuX2dldERlZmF1bHRTeXN0ZW1TaGVsbC5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRQcm9maWxlczogcmV0dXJuIHRoaXMuX2dldFByb2ZpbGVzLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkdldEVudmlyb25tZW50OiByZXR1cm4gdGhpcy5fZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRXc2xQYXRoOiByZXR1cm4gdGhpcy5fZ2V0V3NsUGF0aChhcmdzWzBdLCBhcmdzWzFdKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5HZXRUZXJtaW5hbExheW91dEluZm86IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5nZXRUZXJtaW5hbExheW91dEluZm8oPElHZXRUZXJtaW5hbExheW91dEluZm9BcmdzPmFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlNldFRlcm1pbmFsTGF5b3V0SW5mbzogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnNldFRlcm1pbmFsTGF5b3V0SW5mbyg8SVNldFRlcm1pbmFsTGF5b3V0SW5mb0FyZ3M+YXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuU2VyaWFsaXplVGVybWluYWxTdGF0ZTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnNlcmlhbGl6ZVRlcm1pbmFsU3RhdGUuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlJldml2ZVRlcm1pbmFsUHJvY2Vzc2VzOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UucmV2aXZlVGVybWluYWxQcm9jZXNzZXMuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkdldFJldml2ZWRQdHlOZXdJZDogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmdldFJldml2ZWRQdHlOZXdJZC5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuU2V0VW5pY29kZVZlcnNpb246IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5zZXRVbmljb2RlVmVyc2lvbi5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuU2V0TmV4dENvbW1hbmRJZDogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnNldE5leHRDb21tYW5kSWQuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlJlZHVjZUNvbm5lY3Rpb25HcmFjZVRpbWU6IHJldHVybiB0aGlzLl9yZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuVXBkYXRlSWNvbjogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnVwZGF0ZUljb24uYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlVwZGF0ZVRpdGxlOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UudXBkYXRlVGl0bGUuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlVwZGF0ZVByb3BlcnR5OiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UudXBkYXRlUHJvcGVydHkuYXBwbHkodGhpcy5fcHR5SG9zdFNlcnZpY2UsIGFyZ3MpO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LlJlZnJlc2hQcm9wZXJ0eTogcmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLnJlZnJlc2hQcm9wZXJ0eS5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbFJlcXVlc3QuUmVxdWVzdERldGFjaEluc3RhbmNlOiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UucmVxdWVzdERldGFjaEluc3RhbmNlKGFyZ3NbMF0sIGFyZ3NbMV0pO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkFjY2VwdERldGFjaGVkSW5zdGFuY2U6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5hY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5KGFyZ3NbMF0sIGFyZ3NbMV0pO1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxSZXF1ZXN0LkZyZWVQb3J0S2lsbFByb2Nlc3M6IHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5mcmVlUG9ydEtpbGxQcm9jZXNzLmFwcGx5KHRoaXMuX3B0eUhvc3RTZXJ2aWNlLCBhcmdzKTtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsUmVxdWVzdC5BY2NlcHREZXRhY2hJbnN0YW5jZVJlcGx5OiByZXR1cm4gdGhpcy5fcHR5SG9zdFNlcnZpY2UuYWNjZXB0RGV0YWNoSW5zdGFuY2VSZXBseS5hcHBseSh0aGlzLl9wdHlIb3N0U2VydmljZSwgYXJncyk7XG5cdFx0fVxuXG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvciBBc3NlcnQgY29tbWFuZCBpcyB0aGUgYG5ldmVyYCB0eXBlIHRvIGVuc3VyZSBhbGwgbWVzc2FnZXMgYXJlIGhhbmRsZWRcblx0XHR0aHJvdyBuZXcgRXJyb3IoYElQQyBDb21tYW5kICR7Y29tbWFuZH0gbm90IGZvdW5kYCk7XG5cdH1cblxuXHRsaXN0ZW48VD4oXzogdW5rbm93biwgZXZlbnQ6IFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50LCBfYXJnOiB1bmtub3duKTogRXZlbnQ8VD4ge1xuXHRcdHN3aXRjaCAoZXZlbnQpIHtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsRXZlbnQuT25QdHlIb3N0RXhpdEV2ZW50OiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uUHR5SG9zdEV4aXQgfHwgRXZlbnQuTm9uZSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHR5SG9zdFN0YXJ0RXZlbnQ6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25QdHlIb3N0U3RhcnQgfHwgRXZlbnQuTm9uZSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHR5SG9zdFVucmVzcG9uc2l2ZUV2ZW50OiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uUHR5SG9zdFVucmVzcG9uc2l2ZSB8fCBFdmVudC5Ob25lKSBhcyBFdmVudDxUPjtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsRXZlbnQuT25QdHlIb3N0UmVzcG9uc2l2ZUV2ZW50OiByZXR1cm4gKHRoaXMuX3B0eUhvc3RTZXJ2aWNlLm9uUHR5SG9zdFJlc3BvbnNpdmUgfHwgRXZlbnQuTm9uZSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHR5SG9zdFJlcXVlc3RSZXNvbHZlVmFyaWFibGVzRXZlbnQ6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25QdHlIb3N0UmVxdWVzdFJlc29sdmVWYXJpYWJsZXMgfHwgRXZlbnQuTm9uZSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHJvY2Vzc0RhdGFFdmVudDogcmV0dXJuICh0aGlzLl9wdHlIb3N0U2VydmljZS5vblByb2Nlc3NEYXRhKSBhcyBFdmVudDxUPjtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsRXZlbnQuT25Qcm9jZXNzUmVhZHlFdmVudDogcmV0dXJuICh0aGlzLl9wdHlIb3N0U2VydmljZS5vblByb2Nlc3NSZWFkeSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uUHJvY2Vzc0V4aXRFdmVudDogcmV0dXJuICh0aGlzLl9wdHlIb3N0U2VydmljZS5vblByb2Nlc3NFeGl0KSBhcyBFdmVudDxUPjtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsRXZlbnQuT25Qcm9jZXNzUmVwbGF5RXZlbnQ6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25Qcm9jZXNzUmVwbGF5KSBhcyBFdmVudDxUPjtcblx0XHRcdGNhc2UgUmVtb3RlVGVybWluYWxDaGFubmVsRXZlbnQuT25Qcm9jZXNzT3JwaGFuUXVlc3Rpb246IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25Qcm9jZXNzT3JwaGFuUXVlc3Rpb24pIGFzIEV2ZW50PFQ+O1xuXHRcdFx0Y2FzZSBSZW1vdGVUZXJtaW5hbENoYW5uZWxFdmVudC5PbkV4ZWN1dGVDb21tYW5kOiByZXR1cm4gKHRoaXMub25FeGVjdXRlQ29tbWFuZCkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uRGlkUmVxdWVzdERldGFjaDogcmV0dXJuICh0aGlzLl9wdHlIb3N0U2VydmljZS5vbkRpZFJlcXVlc3REZXRhY2ggfHwgRXZlbnQuTm9uZSkgYXMgRXZlbnQ8VD47XG5cdFx0XHRjYXNlIFJlbW90ZVRlcm1pbmFsQ2hhbm5lbEV2ZW50Lk9uRGlkQ2hhbmdlUHJvcGVydHk6IHJldHVybiAodGhpcy5fcHR5SG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VQcm9wZXJ0eSkgYXMgRXZlbnQ8VD47XG5cdFx0fVxuXG5cdFx0Ly8gQHRzLWV4cGVjdC1lcnJvciBBc3NlcnQgZXZlbnQgaXMgdGhlIGBuZXZlcmAgdHlwZSB0byBlbnN1cmUgYWxsIG1lc3NhZ2VzIGFyZSBoYW5kbGVkXG5cdFx0dGhyb3cgbmV3IEVycm9yKGBJUEMgQ29tbWFuZCAke2V2ZW50fSBub3QgZm91bmRgKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVByb2Nlc3ModXJpVHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciwgYXJnczogSUNyZWF0ZVRlcm1pbmFsUHJvY2Vzc0FyZ3VtZW50cyk6IFByb21pc2U8SUNyZWF0ZVRlcm1pbmFsUHJvY2Vzc1Jlc3VsdD4ge1xuXHRcdGNvbnN0IHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcgPSB7XG5cdFx0XHRuYW1lOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLm5hbWUsXG5cdFx0XHRleGVjdXRhYmxlOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmV4ZWN1dGFibGUsXG5cdFx0XHRhcmdzOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmFyZ3MsXG5cdFx0XHRjd2Q6IChcblx0XHRcdFx0dHlwZW9mIGFyZ3Muc2hlbGxMYXVuY2hDb25maWcuY3dkID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgYXJncy5zaGVsbExhdW5jaENvbmZpZy5jd2QgPT09ICd1bmRlZmluZWQnXG5cdFx0XHRcdFx0PyBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmN3ZFxuXHRcdFx0XHRcdDogVVJJLnJldml2ZSh1cmlUcmFuc2Zvcm1lci50cmFuc2Zvcm1JbmNvbWluZyhhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmN3ZCkpXG5cdFx0XHQpLFxuXHRcdFx0ZW52OiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmVudixcblx0XHRcdHVzZVNoZWxsRW52aXJvbm1lbnQ6IGFyZ3Muc2hlbGxMYXVuY2hDb25maWcudXNlU2hlbGxFbnZpcm9ubWVudCxcblx0XHRcdHJlY29ubmVjdGlvblByb3BlcnRpZXM6IGFyZ3Muc2hlbGxMYXVuY2hDb25maWcucmVjb25uZWN0aW9uUHJvcGVydGllcyxcblx0XHRcdHR5cGU6IGFyZ3Muc2hlbGxMYXVuY2hDb25maWcudHlwZSxcblx0XHRcdGlzRmVhdHVyZVRlcm1pbmFsOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmlzRmVhdHVyZVRlcm1pbmFsLFxuXHRcdFx0Zm9yY2VTaGVsbEludGVncmF0aW9uOiBhcmdzLnNoZWxsTGF1bmNoQ29uZmlnLmZvcmNlU2hlbGxJbnRlZ3JhdGlvbixcblx0XHRcdHRhYkFjdGlvbnM6IGFyZ3Muc2hlbGxMYXVuY2hDb25maWcudGFiQWN0aW9ucyxcblx0XHRcdHNoZWxsSW50ZWdyYXRpb25FbnZpcm9ubWVudFJlcG9ydGluZzogYXJncy5zaGVsbExhdW5jaENvbmZpZy5zaGVsbEludGVncmF0aW9uRW52aXJvbm1lbnRSZXBvcnRpbmcsXG5cdFx0fTtcblxuXG5cdFx0Y29uc3QgYmFzZUVudiA9IGF3YWl0IGJ1aWxkVXNlckVudmlyb25tZW50KGFyZ3MucmVzb2x2ZXJFbnYsICEhYXJncy5zaGVsbExhdW5jaENvbmZpZy51c2VTaGVsbEVudmlyb25tZW50LCBwbGF0Zm9ybS5sYW5ndWFnZSwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnYmFzZUVudicsIGJhc2VFbnYpO1xuXG5cdFx0Y29uc3QgcmV2aXZlV29ya3NwYWNlRm9sZGVyID0gKHdvcmtzcGFjZURhdGE6IElXb3Jrc3BhY2VGb2xkZXJEYXRhKTogSVdvcmtzcGFjZUZvbGRlciA9PiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5yZXZpdmUodXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcod29ya3NwYWNlRGF0YS51cmkpKSxcblx0XHRcdFx0bmFtZTogd29ya3NwYWNlRGF0YS5uYW1lLFxuXHRcdFx0XHRpbmRleDogd29ya3NwYWNlRGF0YS5pbmRleCxcblx0XHRcdFx0dG9SZXNvdXJjZTogKCkgPT4ge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fTtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJzID0gYXJncy53b3Jrc3BhY2VGb2xkZXJzLm1hcChyZXZpdmVXb3Jrc3BhY2VGb2xkZXIpO1xuXHRcdGNvbnN0IGFjdGl2ZVdvcmtzcGFjZUZvbGRlciA9IGFyZ3MuYWN0aXZlV29ya3NwYWNlRm9sZGVyID8gcmV2aXZlV29ya3NwYWNlRm9sZGVyKGFyZ3MuYWN0aXZlV29ya3NwYWNlRm9sZGVyKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhY3RpdmVGaWxlUmVzb3VyY2UgPSBhcmdzLmFjdGl2ZUZpbGVSZXNvdXJjZSA/IFVSSS5yZXZpdmUodXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcoYXJncy5hY3RpdmVGaWxlUmVzb3VyY2UpKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjdXN0b21WYXJpYWJsZVJlc29sdmVyID0gbmV3IEN1c3RvbVZhcmlhYmxlUmVzb2x2ZXIoYmFzZUVudiwgd29ya3NwYWNlRm9sZGVycywgYWN0aXZlRmlsZVJlc291cmNlLCBhcmdzLnJlc29sdmVkVmFyaWFibGVzLCB0aGlzLl9leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgdmFyaWFibGVSZXNvbHZlciA9IHRlcm1pbmFsRW52aXJvbm1lbnQuY3JlYXRlVmFyaWFibGVSZXNvbHZlcihhY3RpdmVXb3Jrc3BhY2VGb2xkZXIsIGJhc2VFbnYsIGN1c3RvbVZhcmlhYmxlUmVzb2x2ZXIpO1xuXG5cdFx0Ly8gR2V0IHRoZSBpbml0aWFsIGN3ZFxuXHRcdGNvbnN0IGluaXRpYWxDd2QgPSBhd2FpdCB0ZXJtaW5hbEVudmlyb25tZW50LmdldEN3ZChzaGVsbExhdW5jaENvbmZpZywgb3MuaG9tZWRpcigpLCB2YXJpYWJsZVJlc29sdmVyLCBhY3RpdmVXb3Jrc3BhY2VGb2xkZXI/LnVyaSwgYXJncy5jb25maWd1cmF0aW9uWyd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN3ZCddLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRzaGVsbExhdW5jaENvbmZpZy5jd2QgPSBpbml0aWFsQ3dkO1xuXG5cdFx0Y29uc3QgZW52UGxhdGZvcm1LZXkgPSBwbGF0Zm9ybS5pc1dpbmRvd3MgPyAndGVybWluYWwuaW50ZWdyYXRlZC5lbnYud2luZG93cycgOiAocGxhdGZvcm0uaXNNYWNpbnRvc2ggPyAndGVybWluYWwuaW50ZWdyYXRlZC5lbnYub3N4JyA6ICd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi5saW51eCcpO1xuXHRcdGNvbnN0IGVudkZyb21Db25maWcgPSBhcmdzLmNvbmZpZ3VyYXRpb25bZW52UGxhdGZvcm1LZXldO1xuXHRcdGNvbnN0IGVudiA9IGF3YWl0IHRlcm1pbmFsRW52aXJvbm1lbnQuY3JlYXRlVGVybWluYWxFbnZpcm9ubWVudChcblx0XHRcdHNoZWxsTGF1bmNoQ29uZmlnLFxuXHRcdFx0ZW52RnJvbUNvbmZpZyxcblx0XHRcdHZhcmlhYmxlUmVzb2x2ZXIsXG5cdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZS52ZXJzaW9uLFxuXHRcdFx0YXJncy5jb25maWd1cmF0aW9uWyd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRldGVjdExvY2FsZSddLFxuXHRcdFx0YmFzZUVudlxuXHRcdCk7XG5cblx0XHQvLyBBcHBseSBleHRlbnNpb24gZW52aXJvbm1lbnQgdmFyaWFibGUgY29sbGVjdGlvbnMgdG8gdGhlIGVudmlyb25tZW50XG5cdFx0aWYgKHNob3VsZFVzZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKHNoZWxsTGF1bmNoQ29uZmlnKSkge1xuXHRcdFx0Y29uc3QgZW50cmllczogW3N0cmluZywgSUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uXVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IFtrLCB2LCBkXSBvZiBhcmdzLmVudlZhcmlhYmxlQ29sbGVjdGlvbnMpIHtcblx0XHRcdFx0ZW50cmllcy5wdXNoKFtrLCB7IG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbih2KSwgZGVzY3JpcHRpb25NYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcChkKSB9XSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnZWYXJpYWJsZUNvbGxlY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIElFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbj4oZW50cmllcyk7XG5cdFx0XHRjb25zdCBtZXJnZWRDb2xsZWN0aW9uID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKGVudlZhcmlhYmxlQ29sbGVjdGlvbnMpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gYWN0aXZlV29ya3NwYWNlRm9sZGVyID8gYWN0aXZlV29ya3NwYWNlRm9sZGVyID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IG1lcmdlZENvbGxlY3Rpb24uYXBwbHlUb1Byb2Nlc3NFbnZpcm9ubWVudChlbnYsIHsgd29ya3NwYWNlRm9sZGVyIH0sIHZhcmlhYmxlUmVzb2x2ZXIpO1xuXHRcdH1cblxuXHRcdC8vIEZvcmsgdGhlIHByb2Nlc3MgYW5kIGxpc3RlbiBmb3IgbWVzc2FnZXNcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBUZXJtaW5hbCBwcm9jZXNzIGxhdW5jaGluZyBvbiByZW1vdGUgYWdlbnRgLCB7IHNoZWxsTGF1bmNoQ29uZmlnLCBpbml0aWFsQ3dkLCBjb2xzOiBhcmdzLmNvbHMsIHJvd3M6IGFyZ3Mucm93cywgZW52IH0pO1xuXG5cdFx0Ly8gU2V0dXAgdGhlIENMSSBzZXJ2ZXIgdG8gc3VwcG9ydCBmb3J3YXJkaW5nIGNvbW1hbmRzIHJ1biBmcm9tIHRoZSBDTElcblx0XHRjb25zdCBpcGNIYW5kbGVQYXRoID0gY3JlYXRlUmFuZG9tSVBDSGFuZGxlKCk7XG5cdFx0ZW52LlZTQ09ERV9JUENfSE9PS19DTEkgPSBpcGNIYW5kbGVQYXRoO1xuXG5cdFx0Y29uc3QgcGVyc2lzdGVudFByb2Nlc3NJZCA9IGF3YWl0IHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmNyZWF0ZVByb2Nlc3Moc2hlbGxMYXVuY2hDb25maWcsIGluaXRpYWxDd2QsIGFyZ3MuY29scywgYXJncy5yb3dzLCBhcmdzLnVuaWNvZGVWZXJzaW9uLCBlbnYsIGJhc2VFbnYsIGFyZ3Mub3B0aW9ucywgYXJncy5zaG91bGRQZXJzaXN0VGVybWluYWwsIGFyZ3Mud29ya3NwYWNlSWQsIGFyZ3Mud29ya3NwYWNlTmFtZSk7XG5cdFx0Y29uc3QgY29tbWFuZHNFeGVjdXRlcjogSUNvbW1hbmRzRXhlY3V0ZXIgPSB7XG5cdFx0XHRleGVjdXRlQ29tbWFuZDogPFQ+KGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8VD4gPT4gdGhpcy5fZXhlY3V0ZUNvbW1hbmQocGVyc2lzdGVudFByb2Nlc3NJZCwgaWQsIGFyZ3MsIHVyaVRyYW5zZm9ybWVyKVxuXHRcdH07XG5cdFx0Y29uc3QgY2xpU2VydmVyID0gbmV3IENMSVNlcnZlckJhc2UoY29tbWFuZHNFeGVjdXRlciwgdGhpcy5fbG9nU2VydmljZSwgaXBjSGFuZGxlUGF0aCk7XG5cdFx0dGhpcy5fcHR5SG9zdFNlcnZpY2Uub25Qcm9jZXNzRXhpdChlID0+IGUuaWQgPT09IHBlcnNpc3RlbnRQcm9jZXNzSWQgJiYgY2xpU2VydmVyLmRpc3Bvc2UoKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGVyc2lzdGVudFRlcm1pbmFsSWQ6IHBlcnNpc3RlbnRQcm9jZXNzSWQsXG5cdFx0XHRyZXNvbHZlZFNoZWxsTGF1bmNoQ29uZmlnOiBzaGVsbExhdW5jaENvbmZpZ1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9leGVjdXRlQ29tbWFuZDxUPihwZXJzaXN0ZW50UHJvY2Vzc0lkOiBudW1iZXIsIGNvbW1hbmRJZDogc3RyaW5nLCBjb21tYW5kQXJnczogdW5rbm93bltdLCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyKTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgeyByZXNvbHZlLCByZWplY3QsIHByb21pc2UgfSA9IHByb21pc2VXaXRoUmVzb2x2ZXJzPFQ+KCk7XG5cblx0XHRjb25zdCByZXFJZCA9ICsrdGhpcy5fbGFzdFJlcUlkO1xuXHRcdHRoaXMuX3BlbmRpbmdDb21tYW5kcy5zZXQocmVxSWQsIHsgcmVzb2x2ZTogcmVzb2x2ZSBhcyAodmFsdWU6IHVua25vd24pID0+IHZvaWQsIHJlamVjdCwgdXJpVHJhbnNmb3JtZXIgfSk7XG5cblx0XHRjb25zdCBzZXJpYWxpemVkQ29tbWFuZEFyZ3MgPSBjbG9uZUFuZENoYW5nZShjb21tYW5kQXJncywgKG9iaikgPT4ge1xuXHRcdFx0aWYgKG9iaiAmJiBvYmouJG1pZCA9PT0gMSkge1xuXHRcdFx0XHQvLyB0aGlzIGlzIFVyaUNvbXBvbmVudHNcblx0XHRcdFx0cmV0dXJuIHVyaVRyYW5zZm9ybWVyLnRyYW5zZm9ybU91dGdvaW5nKG9iaik7XG5cdFx0XHR9XG5cdFx0XHRpZiAob2JqICYmIG9iaiBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gdXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtT3V0Z29pbmdVUkkob2JqKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5fb25FeGVjdXRlQ29tbWFuZC5maXJlKHtcblx0XHRcdHJlcUlkLFxuXHRcdFx0cGVyc2lzdGVudFByb2Nlc3NJZCxcblx0XHRcdGNvbW1hbmRJZCxcblx0XHRcdGNvbW1hbmRBcmdzOiBzZXJpYWxpemVkQ29tbWFuZEFyZ3Ncblx0XHR9KTtcblxuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VuZENvbW1hbmRSZXN1bHQocmVxSWQ6IG51bWJlciwgaXNFcnJvcjogYm9vbGVhbiwgc2VyaWFsaXplZFBheWxvYWQ6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBkYXRhID0gdGhpcy5fcGVuZGluZ0NvbW1hbmRzLmdldChyZXFJZCk7XG5cdFx0aWYgKCFkYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdDb21tYW5kcy5kZWxldGUocmVxSWQpO1xuXHRcdGNvbnN0IHBheWxvYWQgPSBjbG9uZUFuZENoYW5nZShzZXJpYWxpemVkUGF5bG9hZCwgKG9iaikgPT4ge1xuXHRcdFx0aWYgKG9iaiAmJiBvYmouJG1pZCA9PT0gMSkge1xuXHRcdFx0XHQvLyB0aGlzIGlzIFVyaUNvbXBvbmVudHNcblx0XHRcdFx0cmV0dXJuIGRhdGEudXJpVHJhbnNmb3JtZXIudHJhbnNmb3JtSW5jb21pbmcob2JqKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdFx0aWYgKGlzRXJyb3IpIHtcblx0XHRcdGRhdGEucmVqZWN0KHBheWxvYWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnJlc29sdmUocGF5bG9hZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdFN5c3RlbVNoZWxsKG9zT3ZlcnJpZGU/OiBwbGF0Zm9ybS5PcGVyYXRpbmdTeXN0ZW0pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5nZXREZWZhdWx0U3lzdGVtU2hlbGwob3NPdmVycmlkZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRQcm9maWxlcyh3b3Jrc3BhY2VJZDogc3RyaW5nLCBwcm9maWxlczogdW5rbm93biwgZGVmYXVsdFByb2ZpbGU6IHVua25vd24sIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzPzogYm9vbGVhbik6IFByb21pc2U8SVRlcm1pbmFsUHJvZmlsZVtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3B0eUhvc3RTZXJ2aWNlLmdldFByb2ZpbGVzKHdvcmtzcGFjZUlkLCBwcm9maWxlcywgZGVmYXVsdFByb2ZpbGUsIGluY2x1ZGVEZXRlY3RlZFByb2ZpbGVzKSB8fCBbXTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEVudmlyb25tZW50KCk6IHBsYXRmb3JtLklQcm9jZXNzRW52aXJvbm1lbnQge1xuXHRcdHJldHVybiB7IC4uLnByb2Nlc3MuZW52IH07XG5cdH1cblxuXHRwcml2YXRlIF9nZXRXc2xQYXRoKG9yaWdpbmFsOiBzdHJpbmcsIGRpcmVjdGlvbjogJ3VuaXgtdG8td2luJyB8ICd3aW4tdG8tdW5peCcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiB0aGlzLl9wdHlIb3N0U2VydmljZS5nZXRXc2xQYXRoKG9yaWdpbmFsLCBkaXJlY3Rpb24pO1xuXHR9XG5cblxuXHRwcml2YXRlIF9yZWR1Y2VDb25uZWN0aW9uR3JhY2VUaW1lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wdHlIb3N0U2Vy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LGlCQUFpQixJQUFJLE9BQU8sRUFBRSxTQUE4QyxRQUFRLGVBQWUsQ0FBQztBQUV6RyxVQUFNLHdCQUF3QixlQUFlLGFBQWEsQ0FBQyxRQUFRO0FBQ2xFLFVBQUksT0FBTyxJQUFJLFNBQVMsR0FBRztBQUUxQixlQUFPLGVBQWUsa0JBQWtCLEdBQUc7QUFBQSxNQUM1QztBQUNBLFVBQUksT0FBTyxlQUFlLEtBQUs7QUFDOUIsZUFBTyxlQUFlLHFCQUFxQixHQUFHO0FBQUEsTUFDL0M7QUFDQSxhQUFPO0FBQUEsSUFDUixDQUFDO0FBQ0QsU0FBSyxrQkFBa0IsS0FBSztBQUFBLE1BQzNCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLGFBQWE7QUFBQSxJQUNkLENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsbUJBQW1CLE9BQWUsU0FBa0IsbUJBQWtDO0FBQzdGLFVBQU0sT0FBTyxLQUFLLGlCQUFpQixJQUFJLEtBQUs7QUFDNUMsUUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQixPQUFPLEtBQUs7QUFDbEMsVUFBTSxVQUFVLGVBQWUsbUJBQW1CLENBQUMsUUFBUTtBQUMxRCxVQUFJLE9BQU8sSUFBSSxTQUFTLEdBQUc7QUFFMUIsZUFBTyxLQUFLLGVBQWUsa0JBQWtCLEdBQUc7QUFBQSxNQUNqRDtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxRQUFJLFNBQVM7QUFDWixXQUFLLE9BQU8sT0FBTztBQUFBLElBQ3BCLE9BQU87QUFDTixXQUFLLFFBQVEsT0FBTztBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUFBLEVBRVEsdUJBQXVCLFlBQXdEO0FBQ3RGLFdBQU8sS0FBSyxnQkFBZ0Isc0JBQXNCLFVBQVU7QUFBQSxFQUM3RDtBQUFBLEVBRUEsTUFBYyxhQUFhLGFBQXFCLFVBQW1CLGdCQUF5Qix5QkFBZ0U7QUFDM0osV0FBTyxLQUFLLGdCQUFnQixZQUFZLGFBQWEsVUFBVSxnQkFBZ0IsdUJBQXVCLEtBQUssQ0FBQztBQUFBLEVBQzdHO0FBQUEsRUFFUSxrQkFBZ0Q7QUFDdkQsV0FBTyxFQUFFLEdBQUcsUUFBUSxJQUFJO0FBQUEsRUFDekI7QUFBQSxFQUVRLFlBQVksVUFBa0IsV0FBMkQ7QUFDaEcsV0FBTyxLQUFLLGdCQUFnQixXQUFXLFVBQVUsU0FBUztBQUFBLEVBQzNEO0FBQUEsRUFHUSw2QkFBNEM7QUFDbkQsV0FBTyxLQUFLLGdCQUFnQiwwQkFBMEI7QUFBQSxFQUN2RDtBQUNEOyIsCiAgIm5hbWVzIjogWyJhcmdzIl0KfQo=
