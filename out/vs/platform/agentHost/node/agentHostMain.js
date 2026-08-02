import { ProxyChannel } from "../../../base/parts/ipc/common/ipc.js";
import { Server as ChildProcessServer } from "../../../base/parts/ipc/node/ipc.cp.js";
import { Server as UtilityProcessServer } from "../../../base/parts/ipc/node/ipc.mp.js";
import { isUtilityProcess } from "../../../base/parts/sandbox/node/electronTypes.js";
import { Emitter } from "../../../base/common/event.js";
import { DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { joinPath } from "../../../base/common/resources.js";
import { isWindows } from "../../../base/common/platform.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import * as os from "os";
import * as inspector from "inspector";
import { AgentHostByokModelsEnabledEnvVar, AgentHostClaudeAgentEnabledEnvVar, AgentHostCodexAgentEnabledEnvVar, AgentHostIpcChannels, IAgentService, isAgentEnabled } from "../common/agentService.js";
import { AgentHostCodexEnabledConfigKey, platformRootSchema } from "../common/agentHostSchema.js";
import { AgentModelRefreshScheduler, MODEL_REFRESH_INTERVAL_MS } from "./agentModelRefreshScheduler.js";
import { AgentService } from "./agentService.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { IAgentHostCompletions } from "./agentHostCompletions.js";
import { IAgentHostTerminalManager } from "./agentHostTerminalManager.js";
import { CopilotAgent } from "./copilot/copilotAgent.js";
import { WorktreeIsolation } from "./shared/worktreeIsolation.js";
import { CopilotApiService, ICopilotApiService } from "./shared/copilotApiService.js";
import { ClaudeAgent } from "./claude/claudeAgent.js";
import { ClaudeAgentSdkService, ClaudeSdkPackage, IClaudeAgentSdkService } from "./claude/claudeAgentSdkService.js";
import { ClaudeProxyService, IClaudeProxyService } from "./claude/claudeProxyService.js";
import { CodexAgent, CodexSdkPackage } from "./codex/codexAgent.js";
import { createCodexProviderConfiguration } from "./codex/codexProviderConfiguration.js";
import { CodexProxyService, ICodexProxyService } from "./codex/codexProxyService.js";
import { ByokLmProxyService, IByokLmProxyService } from "./copilot/byokLmProxyService.js";
import { ByokLmBridgeRegistry, IByokLmBridgeRegistry } from "./byokLmBridgeRegistry.js";
import { INetworkDiagnosticsService, NetworkDiagnosticsService } from "./networkDiagnosticsService.js";
import { AgentSdkDownloader, IAgentSdkDownloader } from "./agentSdkDownloader.js";
import { IAgentHostOTelService } from "../common/otel/agentHostOTelService.js";
import { AgentHostOTelService } from "./otel/agentHostOTelService.js";
import { ProtocolServerHandler } from "./protocolServerHandler.js";
import { CompositeProtocolServer } from "./compositeProtocolServer.js";
import { WebSocketProtocolServer } from "./webSocketTransport.js";
import { MessagePortProtocolServer } from "./messagePortProtocolServer.js";
import { cleanupLocalAgentHostEndpointMetadataSync, cleanupLocalAgentHostEndpointSocketSync, createLocalAgentHostEndpointMetadata, prepareLocalAgentHostEndpointMetadataDirectory, prepareLocalAgentHostEndpointSocketDirectory, publishLocalAgentHostEndpointMetadata } from "./localAgentHostMetadata.js";
import { AgentHostManagementService } from "./agentHostManagementService.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { NativeEnvironmentService } from "../../environment/node/environmentService.js";
import { parseArgs, OPTIONS } from "../../environment/node/argv.js";
import { getLogLevel, ILogService, isDevConsoleLogForwardingEnabled, registerDevConsoleLogForwarder } from "../../log/common/log.js";
import { LogService } from "../../log/common/logService.js";
import { LoggerService } from "../../log/node/loggerService.js";
import { LoggerChannel } from "../../log/common/logIpc.js";
import { OtlpEmitterLogger, OtlpLogEmitter } from "../common/otlp/otlpLogEmitter.js";
import { DefaultURITransformer } from "../../../base/common/uriIpc.js";
import product from "../../product/common/product.js";
import { IProductService } from "../../product/common/productService.js";
import { localize } from "../../../nls.js";
import { FileService } from "../../files/common/fileService.js";
import { IFileService } from "../../files/common/files.js";
import { DiskFileSystemProvider } from "../../files/node/diskFileSystemProvider.js";
import { Schemas } from "../../../base/common/network.js";
import { InstantiationService } from "../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../instantiation/common/serviceCollection.js";
import { registerAgentHostNetworkServices } from "./agentHostBootstrap.js";
import { BANG_COMMAND_PREFIX } from "./agentHostBangCommand.js";
import { SessionDataService } from "./sessionDataService.js";
import { ISessionDataService } from "../common/sessionDataService.js";
import { IWindowsMxcTerminalSandboxRuntime, WindowsMxcTerminalSandboxRuntime } from "../../sandbox/common/terminalSandboxMxcRuntime.js";
import { ISandboxHelperService } from "../../sandbox/common/sandboxHelperService.js";
import { SandboxHelperService } from "../../sandbox/node/sandboxHelper.js";
import { IDiffComputeService } from "../common/diffComputeService.js";
import { IAgentEditAttributionService } from "../common/fileEditAttribution.js";
import { NodeWorkerDiffComputeService } from "./diffComputeService.js";
import { AgentEditAttributionService } from "./shared/agentEditAttributionService.js";
import { IEditSurvivalReporterFactory, EditSurvivalReporterFactory } from "./shared/editSurvivalReporter.js";
import { EditArcReporterService, IEditArcReporterService } from "./shared/editArcReporter.js";
import { AgentHostClientFileSystemProvider } from "../common/agentHostClientFileSystemProvider.js";
import { AGENT_CLIENT_SCHEME } from "../common/agentClientUri.js";
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, createAgentHostClientByokLmConnection } from "../common/agentHostClientByokLmChannel.js";
import { AGENT_HOST_CLIENT_PROXY_CHANNEL, createAgentHostClientProxyConnection } from "../common/agentHostClientProxyChannel.js";
import { IAgentPluginManager } from "../common/agentPluginManager.js";
import { AgentPluginManager } from "./agentPluginManager.js";
import { AgentHostGitService } from "./agentHostGitService.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from "./agentHostFileMonitorService.js";
import { registerPendingEditContentProvider } from "./copilot/pendingEditContentStore.js";
import { join } from "../../../base/common/path.js";
import { createAgentHostTelemetryService } from "./agentHostTelemetryService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import ErrorTelemetry from "../../telemetry/node/errorTelemetry.js";
void startAgentHost().catch((err) => {
  console.error(err);
  process.exit(1);
});
async function startAgentHost() {
  let server;
  if (isUtilityProcess(process)) {
    server = new UtilityProcessServer();
  } else {
    server = new ChildProcessServer(AgentHostIpcChannels.AgentHost);
  }
  const disposables = new DisposableStore();
  const errorTelemetry = disposables.add(new MutableDisposable());
  const productService = { _serviceBrand: void 0, ...product };
  const environmentService = new NativeEnvironmentService(parseArgs(process.argv, OPTIONS), productService);
  const loggerService = new LoggerService(getLogLevel(environmentService), environmentService.logsHome);
  server.registerChannel(AgentHostIpcChannels.Logger, new LoggerChannel(loggerService, () => DefaultURITransformer));
  const logger = loggerService.createLogger("agenthost", { name: localize("agentHost", "Agent Host") });
  const otlpLogEmitter = disposables.add(new OtlpLogEmitter());
  const otlpLogger = disposables.add(new OtlpEmitterLogger(otlpLogEmitter));
  const logService = new LogService(logger, [otlpLogger]);
  if (!environmentService.isBuilt && isDevConsoleLogForwardingEnabled) {
    disposables.add(registerDevConsoleLogForwarder(logService));
  }
  logService.info("Agent Host process started successfully");
  const fileService = disposables.add(new FileService(logService));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
  disposables.add(registerPendingEditContentProvider(fileService));
  const sessionDataService = new SessionDataService(URI.file(environmentService.userDataPath), fileService, logService);
  const rootConfigResource = joinPath(environmentService.appSettingsHome, "globalStorage", "agent-host-config.json");
  let agentService;
  let instantiationService;
  let sdkDownloadProgress;
  let byokLmBridgeRegistry;
  let proxyResolver;
  const byokLmEnabled = isAgentEnabled(process.env[AgentHostByokModelsEnabledEnvVar], true);
  try {
    const diServices = new ServiceCollection();
    diServices.set(INativeEnvironmentService, environmentService);
    diServices.set(ILogService, logService);
    diServices.set(IFileService, fileService);
    diServices.set(ISessionDataService, sessionDataService);
    diServices.set(IProductService, productService);
    const networkServices = await registerAgentHostNetworkServices(diServices, fileService, environmentService, logService, disposables);
    proxyResolver = networkServices.proxyResolver;
    const fetchFn = proxyResolver.fetch.bind(proxyResolver);
    const telemetryService = await createAgentHostTelemetryService({ environmentService, productService, fileService, loggerService, logService, disposables, fetchFn, requestService: networkServices.requestService });
    errorTelemetry.value = new ErrorTelemetry(telemetryService);
    diServices.set(ITelemetryService, telemetryService);
    instantiationService = new InstantiationService(diServices);
    const fileMonitorService = disposables.add(instantiationService.createInstance(AgentHostFileMonitorService));
    diServices.set(IAgentHostFileMonitorService, fileMonitorService);
    diServices.set(IWindowsMxcTerminalSandboxRuntime, instantiationService.createInstance(WindowsMxcTerminalSandboxRuntime));
    diServices.set(ISandboxHelperService, new SandboxHelperService());
    const gitService = instantiationService.createInstance(AgentHostGitService);
    diServices.set(IAgentHostGitService, gitService);
    const agentSdkDownloader = disposables.add(instantiationService.createInstance(AgentSdkDownloader));
    diServices.set(IAgentSdkDownloader, agentSdkDownloader);
    sdkDownloadProgress = agentSdkDownloader.onDidDownloadProgress;
    const claudeAgentSdkService = instantiationService.createInstance(ClaudeAgentSdkService);
    diServices.set(IClaudeAgentSdkService, claudeAgentSdkService);
    byokLmBridgeRegistry = new ByokLmBridgeRegistry();
    diServices.set(IByokLmBridgeRegistry, byokLmBridgeRegistry);
    const byokLmProxyService = disposables.add(instantiationService.createInstance(ByokLmProxyService));
    diServices.set(IByokLmProxyService, byokLmProxyService);
    const agentHostOTelService = disposables.add(instantiationService.createInstance(AgentHostOTelService, fetchFn));
    diServices.set(IAgentHostOTelService, agentHostOTelService);
    agentService = new AgentService(logService, fileService, sessionDataService, productService, gitService, rootConfigResource, telemetryService, fileMonitorService, void 0, fetchFn, [createCodexProviderConfiguration(environmentService.userHome)]);
    const networkDiagnosticsService = instantiationService.createInstance(NetworkDiagnosticsService);
    diServices.set(INetworkDiagnosticsService, networkDiagnosticsService);
    agentService.setNetworkDiagnosticsService(networkDiagnosticsService);
    diServices.set(IAgentService, agentService);
    diServices.set(IAgentHostStateManager, agentService.stateManager);
    const pluginManager = new AgentPluginManager(URI.file(environmentService.userDataPath), fileService, logService);
    diServices.set(IAgentPluginManager, pluginManager);
    const diffComputeService = disposables.add(new NodeWorkerDiffComputeService(logService));
    diServices.set(IDiffComputeService, diffComputeService);
    const editAttributionService = disposables.add(instantiationService.createInstance(AgentEditAttributionService, void 0, void 0));
    diServices.set(IAgentEditAttributionService, editAttributionService);
    agentService.setEditAttributionService(editAttributionService);
    diServices.set(IEditSurvivalReporterFactory, instantiationService.createInstance(EditSurvivalReporterFactory));
    diServices.set(IAgentHostTerminalManager, agentService.terminalManager);
    diServices.set(IAgentConfigurationService, agentService.configurationService);
    const editArcReporterService = disposables.add(instantiationService.createInstance(EditArcReporterService, void 0));
    diServices.set(IEditArcReporterService, editArcReporterService);
    diServices.set(IAgentHostGitHubEndpointService, agentService.gitHubEndpointService);
    diServices.set(IAgentHostCompletions, agentService.completionsService);
    diServices.set(IAgentHostCheckpointService, agentService.checkpointService);
    const copilotApiService = instantiationService.createInstance(CopilotApiService, fetchFn);
    diServices.set(ICopilotApiService, copilotApiService);
    agentService.setWorktreeIsolation(disposables.add(instantiationService.createInstance(WorktreeIsolation, void 0)));
    const claudeProxyService = disposables.add(instantiationService.createInstance(ClaudeProxyService));
    diServices.set(IClaudeProxyService, claudeProxyService);
    const codexProxyService = disposables.add(instantiationService.createInstance(CodexProxyService));
    diServices.set(ICodexProxyService, codexProxyService);
    agentService.registerProvider(instantiationService.createInstance(CopilotAgent));
    if (isAgentEnabled(process.env[AgentHostClaudeAgentEnabledEnvVar], true) && (!environmentService.isBuilt || agentSdkDownloader.isAvailable(ClaudeSdkPackage))) {
      agentService.registerProvider(instantiationService.createInstance(ClaudeAgent));
    }
    if (!environmentService.isBuilt || agentSdkDownloader.isAvailable(CodexSdkPackage)) {
      const agentConfigurationService = agentService.configurationService;
      let codexRegistered = false;
      const registerCodexIfEnabled = () => {
        if (codexRegistered) {
          return;
        }
        const enabledByEnv = isAgentEnabled(process.env[AgentHostCodexAgentEnabledEnvVar], false);
        const enabledByRootConfig = agentConfigurationService.getRootValue(platformRootSchema, AgentHostCodexEnabledConfigKey) === true;
        if (enabledByEnv || enabledByRootConfig) {
          codexRegistered = true;
          agentService.registerProvider(instantiationService.createInstance(CodexAgent));
        }
      };
      registerCodexIfEnabled();
      disposables.add(agentConfigurationService.onDidRootConfigChange(() => registerCodexIfEnabled()));
    }
  } catch (err) {
    logService.error("Failed to create AgentService", err);
    throw err;
  }
  disposables.add(instantiationService.createInstance(AgentModelRefreshScheduler, agentService.agents, MODEL_REFRESH_INTERVAL_MS));
  if (sdkDownloadProgress) {
    disposables.add(sdkDownloadProgress((p) => agentService.emitDownloadProgress(
      p.packageId,
      p.displayName,
      p.receivedBytes,
      p.totalBytes,
      p.phase === "completed" || p.phase === "failed"
    )));
  }
  if (!(server instanceof UtilityProcessServer)) {
    const agentChannel = ProxyChannel.fromService(agentService, disposables);
    server.registerChannel(AgentHostIpcChannels.AgentHost, agentChannel);
  }
  const clientFileSystemProvider = disposables.add(new AgentHostClientFileSystemProvider());
  disposables.add(fileService.registerProvider(AGENT_CLIENT_SCHEME, clientFileSystemProvider));
  if (server instanceof UtilityProcessServer) {
    const localDataPlaneDisposables = disposables.add(new DisposableStore());
    const messagePortProtocolServer = new MessagePortProtocolServer();
    const localEndpoint = await startLocalAgentHostEndpoint(
      environmentService.userDataPath,
      logService,
      instantiationService,
      environmentService.logsHome
    );
    try {
      const localProtocolServer = localDataPlaneDisposables.add(new CompositeProtocolServer([
        messagePortProtocolServer,
        ...localEndpoint ? [localEndpoint.server] : []
      ]));
      localDataPlaneDisposables.add(new ProtocolServerHandler(
        agentService,
        agentService.stateManager,
        localProtocolServer,
        {
          defaultDirectory: URI.file(os.homedir()).toString(),
          completionTriggerCharacters: agentService.completionTriggerCharacters,
          terminalCommandPrefix: BANG_COMMAND_PREFIX,
          otlpLogEmitter,
          allowExtensionMethods: false
        },
        clientFileSystemProvider,
        logService
      ));
      const authorityRegistrations = /* @__PURE__ */ new Map();
      const registerConnection = (connection) => {
        if (authorityRegistrations.has(connection)) {
          return;
        }
        const clientId = connection.ctx;
        if (typeof clientId !== "string" || !clientId) {
          return;
        }
        const connectionStore = new DisposableStore();
        const getChannel = (channelName) => server.getChannel(channelName, (c) => c.ctx === clientId);
        const proxyConnection = createAgentHostClientProxyConnection(getChannel(AGENT_HOST_CLIENT_PROXY_CHANNEL));
        connectionStore.add(proxyResolver.register(clientId, proxyConnection));
        if (byokLmEnabled && byokLmBridgeRegistry) {
          const byokLmConnection = createAgentHostClientByokLmConnection(getChannel(AGENT_HOST_CLIENT_BYOK_LM_CHANNEL));
          connectionStore.add(byokLmBridgeRegistry.register(clientId, byokLmConnection));
        }
        authorityRegistrations.set(connection, connectionStore);
      };
      localDataPlaneDisposables.add(server.onDidAddConnection(registerConnection));
      localDataPlaneDisposables.add(server.onDidRemoveConnection((connection) => {
        if (typeof connection.ctx === "string") {
          messagePortProtocolServer.closeClient(connection.ctx);
        }
        const reg = authorityRegistrations.get(connection);
        if (reg) {
          reg.dispose();
          authorityRegistrations.delete(connection);
        }
      }));
      localDataPlaneDisposables.add(toDisposable(() => {
        for (const registration of authorityRegistrations.values()) {
          registration.dispose();
        }
        authorityRegistrations.clear();
      }));
      for (const connection of server.connections) {
        registerConnection(connection);
      }
      server.registerChannel(AgentHostIpcChannels.Protocol, messagePortProtocolServer);
      if (localEndpoint) {
        try {
          await publishLocalAgentHostEndpointMetadata(environmentService.userDataPath, localEndpoint.metadata);
          localDataPlaneDisposables.add(toDisposable(() => {
            cleanupLocalAgentHostEndpoint(environmentService.userDataPath, localEndpoint.metadata, logService);
          }));
        } catch (error) {
          logService.error("[AgentHost] Failed to publish local protocol endpoint; continuing with MessagePort only", error);
          localEndpoint.server.dispose();
          cleanupLocalAgentHostEndpoint(environmentService.userDataPath, localEndpoint.metadata, logService);
        }
      }
    } catch (error) {
      localDataPlaneDisposables.dispose();
      if (localEndpoint) {
        cleanupLocalAgentHostEndpoint(environmentService.userDataPath, localEndpoint.metadata, logService);
      }
      throw error;
    }
  }
  const connectionCountEmitter = disposables.add(new Emitter());
  let dynamicSocketInfo;
  const connectionTrackerService = {
    onDidChangeConnectionCount: connectionCountEmitter.event,
    async startWebSocketServer() {
      if (dynamicSocketInfo) {
        return dynamicSocketInfo;
      }
      const socketPath = isWindows ? `\\\\.\\pipe\\vscode-agent-host-${generateUuid().replace(/-/g, "")}` : join(os.tmpdir(), `vscode-agent-host-${generateUuid().replace(/-/g, "")}.sock`);
      const wsServer = disposables.add(await WebSocketProtocolServer.create(
        { socketPath },
        logService,
        { instantiationService, logsHome: environmentService.logsHome }
      ));
      const protocolHandler = disposables.add(new ProtocolServerHandler(
        agentService,
        agentService.stateManager,
        wsServer,
        {
          defaultDirectory: URI.file(os.homedir()).toString(),
          completionTriggerCharacters: agentService.completionTriggerCharacters,
          terminalCommandPrefix: BANG_COMMAND_PREFIX,
          otlpLogEmitter
        },
        clientFileSystemProvider,
        logService
      ));
      disposables.add(protocolHandler.onDidChangeConnectionCount((count) => connectionCountEmitter.fire(count)));
      logService.info(`[AgentHost] Dynamic WebSocket server listening on ${socketPath}`);
      dynamicSocketInfo = { socketPath };
      return dynamicSocketInfo;
    },
    async getInspectInfo(tryEnable) {
      let url = inspector.url();
      if (!url && tryEnable) {
        try {
          inspector.open(0, "127.0.0.1", false);
        } catch (err) {
          logService.error("[AgentHost] Failed to open inspector", err);
          return void 0;
        }
        url = inspector.url();
      }
      if (!url) {
        return void 0;
      }
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.protocol !== "ws:") {
          logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
          return void 0;
        }
        const port = Number(parsedUrl.port);
        const auth = parsedUrl.pathname.replace(/^\/+/, "");
        if (!Number.isInteger(port) || !auth) {
          logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
          return void 0;
        }
        const host = parsedUrl.hostname === "0.0.0.0" ? "127.0.0.1" : parsedUrl.hostname === "::" ? "::1" : parsedUrl.hostname;
        const devtoolsHost = host.includes(":") ? `[${host}]` : host;
        return {
          host,
          port,
          devtoolsUrl: `devtools://devtools/bundled/js_app.html?v8only=true&ws=${devtoolsHost}:${parsedUrl.port}/${auth}`
        };
      } catch {
        logService.warn(`[AgentHost] Unexpected inspector URL: ${url}`);
        return void 0;
      }
    }
  };
  if (server instanceof UtilityProcessServer) {
    server.registerChannel(AgentHostIpcChannels.Management, ProxyChannel.fromService(new AgentHostManagementService(agentService, connectionTrackerService), disposables));
  } else {
    server.registerChannel(AgentHostIpcChannels.ConnectionTracker, ProxyChannel.fromService(connectionTrackerService, disposables));
  }
  startWebSocketServer(
    agentService,
    clientFileSystemProvider,
    instantiationService,
    environmentService.logsHome,
    logService,
    otlpLogEmitter,
    disposables,
    (count) => connectionCountEmitter.fire(count)
  ).catch((err) => {
    logService.error("Failed to start WebSocket server", err);
  });
  process.once("exit", () => {
    agentService.dispose();
    logService.dispose();
    disposables.dispose();
  });
}
async function startLocalAgentHostEndpoint(userDataPath, logService, instantiationService, logsHome) {
  let metadata;
  let server;
  try {
    const endpointMetadata = createLocalAgentHostEndpointMetadata(userDataPath);
    metadata = endpointMetadata;
    await prepareLocalAgentHostEndpointMetadataDirectory(userDataPath);
    if (!isWindows) {
      await prepareLocalAgentHostEndpointSocketDirectory(userDataPath);
    }
    server = await WebSocketProtocolServer.create(
      {
        socketPath: endpointMetadata.endpointPath,
        connectionTokenValidate: (token) => token === endpointMetadata.connectionToken
      },
      logService,
      { instantiationService, logsHome }
    );
    await server.whenListening;
    return { metadata: endpointMetadata, server };
  } catch (error) {
    try {
      server?.dispose();
    } catch (disposeError) {
      logService.error("[AgentHost] Failed to dispose local protocol endpoint", disposeError);
    }
    if (metadata) {
      cleanupLocalAgentHostEndpoint(userDataPath, metadata, logService);
    }
    logService.error("[AgentHost] Failed to start local protocol endpoint; continuing with MessagePort only", error);
    return void 0;
  }
}
function cleanupLocalAgentHostEndpoint(userDataPath, metadata, logService) {
  try {
    cleanupLocalAgentHostEndpointMetadataSync(userDataPath, metadata);
  } catch (error) {
    logService.error("[AgentHost] Failed to clean up local protocol metadata", error);
  }
  try {
    cleanupLocalAgentHostEndpointSocketSync(metadata.endpointPath);
  } catch (error) {
    logService.error("[AgentHost] Failed to clean up local protocol socket", error);
  }
}
async function startWebSocketServer(agentService, clientFileSystemProvider, instantiationService, logsHome, logService, otlpLogEmitter, disposables, onConnectionCountChanged) {
  const port = process.env["VSCODE_AGENT_HOST_PORT"];
  const socketPath = process.env["VSCODE_AGENT_HOST_SOCKET_PATH"];
  if (!port && !socketPath) {
    return;
  }
  const connectionToken = process.env["VSCODE_AGENT_HOST_CONNECTION_TOKEN"];
  const host = process.env["VSCODE_AGENT_HOST_HOST"] || "localhost";
  const wsServer = disposables.add(await WebSocketProtocolServer.create(
    socketPath ? {
      socketPath,
      connectionTokenValidate: connectionToken ? (token) => token === connectionToken : void 0
    } : {
      port: parseInt(port, 10),
      host,
      connectionTokenValidate: connectionToken ? (token) => token === connectionToken : void 0
    },
    logService,
    { instantiationService, logsHome }
  ));
  const protocolHandler = disposables.add(new ProtocolServerHandler(
    agentService,
    agentService.stateManager,
    wsServer,
    {
      defaultDirectory: URI.file(os.homedir()).toString(),
      completionTriggerCharacters: agentService.completionTriggerCharacters,
      terminalCommandPrefix: BANG_COMMAND_PREFIX,
      otlpLogEmitter
    },
    clientFileSystemProvider,
    logService
  ));
  disposables.add(protocolHandler.onDidChangeConnectionCount(onConnectionCountChanged));
  await wsServer.whenListening;
  const listenTarget = socketPath ?? `${host}:${wsServer.boundPort ?? port}`;
  logService.info(`[AgentHost] WebSocket server listening on ${listenTarget}`);
  console.log(`Agent host server listening on ${listenTarget}`);
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdE1haW4udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm94eUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IFNlcnZlciBhcyBDaGlsZFByb2Nlc3NTZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5jcC5qcyc7XG5pbXBvcnQgeyBTZXJ2ZXIgYXMgVXRpbGl0eVByb2Nlc3NTZXJ2ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5tcC5qcyc7XG5pbXBvcnQgeyBpc1V0aWxpdHlQcm9jZXNzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9zYW5kYm94L25vZGUvZWxlY3Ryb25UeXBlcy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCB0eXBlIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgKiBhcyBvcyBmcm9tICdvcyc7XG5pbXBvcnQgKiBhcyBpbnNwZWN0b3IgZnJvbSAnaW5zcGVjdG9yJztcbmltcG9ydCB7IEFnZW50SG9zdEJ5b2tNb2RlbHNFbmFibGVkRW52VmFyLCBBZ2VudEhvc3RDbGF1ZGVBZ2VudEVuYWJsZWRFbnZWYXIsIEFnZW50SG9zdENvZGV4QWdlbnRFbmFibGVkRW52VmFyLCBBZ2VudEhvc3RJcGNDaGFubmVscywgSUFnZW50SG9zdEluc3BlY3RJbmZvLCBJQWdlbnRIb3N0U29ja2V0SW5mbywgSUFnZW50U2VydmljZSwgSUNvbm5lY3Rpb25UcmFja2VyU2VydmljZSwgaXNBZ2VudEVuYWJsZWQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4RW5hYmxlZENvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudE1vZGVsUmVmcmVzaFNjaGVkdWxlciwgTU9ERUxfUkVGUkVTSF9JTlRFUlZBTF9NUyB9IGZyb20gJy4vYWdlbnRNb2RlbFJlZnJlc2hTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4vYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29tcGxldGlvbnMgfSBmcm9tICcuL2FnZW50SG9zdENvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFRlcm1pbmFsTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDb3BpbG90QWdlbnQgfSBmcm9tICcuL2NvcGlsb3QvY29waWxvdEFnZW50LmpzJztcbmltcG9ydCB7IFdvcmt0cmVlSXNvbGF0aW9uIH0gZnJvbSAnLi9zaGFyZWQvd29ya3RyZWVJc29sYXRpb24uanMnO1xuaW1wb3J0IHsgQ29waWxvdEFwaVNlcnZpY2UsIElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENsYXVkZUFnZW50IH0gZnJvbSAnLi9jbGF1ZGUvY2xhdWRlQWdlbnQuanMnO1xuaW1wb3J0IHsgQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlLCBDbGF1ZGVTZGtQYWNrYWdlLCBJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlIH0gZnJvbSAnLi9jbGF1ZGUvY2xhdWRlQWdlbnRTZGtTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENsYXVkZVByb3h5U2VydmljZSwgSUNsYXVkZVByb3h5U2VydmljZSB9IGZyb20gJy4vY2xhdWRlL2NsYXVkZVByb3h5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RleEFnZW50LCBDb2RleFNka1BhY2thZ2UgfSBmcm9tICcuL2NvZGV4L2NvZGV4QWdlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29kZXhQcm92aWRlckNvbmZpZ3VyYXRpb24gfSBmcm9tICcuL2NvZGV4L2NvZGV4UHJvdmlkZXJDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvZGV4UHJveHlTZXJ2aWNlLCBJQ29kZXhQcm94eVNlcnZpY2UgfSBmcm9tICcuL2NvZGV4L2NvZGV4UHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEJ5b2tMbVByb3h5U2VydmljZSwgSUJ5b2tMbVByb3h5U2VydmljZSB9IGZyb20gJy4vY29waWxvdC9ieW9rTG1Qcm94eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQnlva0xtQnJpZGdlUmVnaXN0cnksIElCeW9rTG1CcmlkZ2VSZWdpc3RyeSB9IGZyb20gJy4vYnlva0xtQnJpZGdlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFByb3h5UmVzb2x2ZXIgfSBmcm9tICcuL2FnZW50SG9zdFByb3h5UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgSU5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UsIE5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UgfSBmcm9tICcuL25ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZGtEb3dubG9hZGVyLCBJQWdlbnRTZGtEb3dubG9hZGVyLCB0eXBlIElBZ2VudFNka0Rvd25sb2FkUHJvZ3Jlc3MgfSBmcm9tICcuL2FnZW50U2RrRG93bmxvYWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4vb3RlbC9hZ2VudEhvc3RPVGVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm90b2NvbFNlcnZlckhhbmRsZXIgfSBmcm9tICcuL3Byb3RvY29sU2VydmVySGFuZGxlci5qcyc7XG5pbXBvcnQgeyBDb21wb3NpdGVQcm90b2NvbFNlcnZlciB9IGZyb20gJy4vY29tcG9zaXRlUHJvdG9jb2xTZXJ2ZXIuanMnO1xuaW1wb3J0IHsgV2ViU29ja2V0UHJvdG9jb2xTZXJ2ZXIgfSBmcm9tICcuL3dlYlNvY2tldFRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlUG9ydFByb3RvY29sU2VydmVyIH0gZnJvbSAnLi9tZXNzYWdlUG9ydFByb3RvY29sU2VydmVyLmpzJztcbmltcG9ydCB7IGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGFTeW5jLCBjbGVhbnVwTG9jYWxBZ2VudEhvc3RFbmRwb2ludFNvY2tldFN5bmMsIGNyZWF0ZUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSwgcHJlcGFyZUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YURpcmVjdG9yeSwgcHJlcGFyZUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRTb2NrZXREaXJlY3RvcnksIHB1Ymxpc2hMb2NhbEFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGEsIHR5cGUgSUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSB9IGZyb20gJy4vbG9jYWxBZ2VudEhvc3RNZXRhZGF0YS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0TWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9ub2RlL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUFyZ3MsIE9QVElPTlMgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9ub2RlL2FyZ3YuanMnO1xuaW1wb3J0IHsgZ2V0TG9nTGV2ZWwsIElMb2dTZXJ2aWNlLCBpc0RldkNvbnNvbGVMb2dGb3J3YXJkaW5nRW5hYmxlZCwgcmVnaXN0ZXJEZXZDb25zb2xlTG9nRm9yd2FyZGVyIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMb2dnZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL25vZGUvbG9nZ2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBMb2dnZXJDaGFubmVsIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2dJcGMuanMnO1xuaW1wb3J0IHsgT3RscEVtaXR0ZXJMb2dnZXIsIE90bHBMb2dFbWl0dGVyIH0gZnJvbSAnLi4vY29tbW9uL290bHAvb3RscExvZ0VtaXR0ZXIuanMnO1xuaW1wb3J0IHsgRGVmYXVsdFVSSVRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpSXBjLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IERpc2tGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9maWxlcy9ub2RlL2Rpc2tGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBZ2VudEhvc3ROZXR3b3JrU2VydmljZXMgfSBmcm9tICcuL2FnZW50SG9zdEJvb3RzdHJhcC5qcyc7XG5pbXBvcnQgeyBCQU5HX0NPTU1BTkRfUFJFRklYIH0gZnJvbSAnLi9hZ2VudEhvc3RCYW5nQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV2luZG93c014Y1Rlcm1pbmFsU2FuZGJveFJ1bnRpbWUsIFdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lIH0gZnJvbSAnLi4vLi4vc2FuZGJveC9jb21tb24vdGVybWluYWxTYW5kYm94TXhjUnVudGltZS5qcyc7XG5pbXBvcnQgeyBJU2FuZGJveEhlbHBlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9zYW5kYm94L2NvbW1vbi9zYW5kYm94SGVscGVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTYW5kYm94SGVscGVyU2VydmljZSB9IGZyb20gJy4uLy4uL3NhbmRib3gvbm9kZS9zYW5kYm94SGVscGVyLmpzJztcbmltcG9ydCB7IElEaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZmlsZUVkaXRBdHRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBOb2RlV29ya2VyRGlmZkNvbXB1dGVTZXJ2aWNlIH0gZnJvbSAnLi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9zaGFyZWQvYWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnksIEVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSB9IGZyb20gJy4vc2hhcmVkL2VkaXRTdXJ2aXZhbFJlcG9ydGVyLmpzJztcbmltcG9ydCB7IEVkaXRBcmNSZXBvcnRlclNlcnZpY2UsIElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIH0gZnJvbSAnLi9zaGFyZWQvZWRpdEFyY1JlcG9ydGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudEZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDbGllbnRGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQUdFTlRfQ0xJRU5UX1NDSEVNRSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudENsaWVudFVyaS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0NMSUVOVF9CWU9LX0xNX0NIQU5ORUwsIGNyZWF0ZUFnZW50SG9zdENsaWVudEJ5b2tMbUNvbm5lY3Rpb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50Qnlva0xtQ2hhbm5lbC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0NMSUVOVF9QUk9YWV9DSEFOTkVMLCBjcmVhdGVBZ2VudEhvc3RDbGllbnRQcm94eUNvbm5lY3Rpb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50UHJveHlDaGFubmVsLmpzJztcbmltcG9ydCB7IElBZ2VudFBsdWdpbk1hbmFnZXIgfSBmcm9tICcuLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50UGx1Z2luTWFuYWdlciB9IGZyb20gJy4vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLCBJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJQZW5kaW5nRWRpdENvbnRlbnRQcm92aWRlciB9IGZyb20gJy4vY29waWxvdC9wZW5kaW5nRWRpdENvbnRlbnRTdG9yZS5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVBZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IEVycm9yVGVsZW1ldHJ5IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9ub2RlL2Vycm9yVGVsZW1ldHJ5LmpzJztcblxuLy8gRW50cnkgcG9pbnQgZm9yIHRoZSBhZ2VudCBob3N0IHV0aWxpdHkgcHJvY2Vzcy5cbi8vIFNldHMgdXAgSVBDLCBsb2dnaW5nLCBhbmQgcmVnaXN0ZXJzIGFnZW50IHByb3ZpZGVycyAoQ29waWxvdCkuXG4vLyBXaGVuIFZTQ09ERV9BR0VOVF9IT1NUX1BPUlQgb3IgVlNDT0RFX0FHRU5UX0hPU1RfU09DS0VUX1BBVEggZW52IHZhcnNcbi8vIGFyZSBzZXQsIGFsc28gc3RhcnRzIGEgV2ViU29ja2V0IHNlcnZlciBmb3IgZXh0ZXJuYWwgY2xpZW50cy5cblxudm9pZCBzdGFydEFnZW50SG9zdCgpLmNhdGNoKGVyciA9PiB7XG5cdGNvbnNvbGUuZXJyb3IoZXJyKTtcblx0cHJvY2Vzcy5leGl0KDEpO1xufSk7XG5cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0QWdlbnRIb3N0KCk6IFByb21pc2U8dm9pZD4ge1xuXHQvLyBTZXR1cCBSUEMgLSBzdXBwb3J0cyBib3RoIEVsZWN0cm9uIHV0aWxpdHkgcHJvY2VzcyBhbmQgTm9kZSBjaGlsZCBwcm9jZXNzXG5cdGxldCBzZXJ2ZXI6IENoaWxkUHJvY2Vzc1NlcnZlcjxzdHJpbmc+IHwgVXRpbGl0eVByb2Nlc3NTZXJ2ZXI7XG5cdGlmIChpc1V0aWxpdHlQcm9jZXNzKHByb2Nlc3MpKSB7XG5cdFx0c2VydmVyID0gbmV3IFV0aWxpdHlQcm9jZXNzU2VydmVyKCk7XG5cdH0gZWxzZSB7XG5cdFx0c2VydmVyID0gbmV3IENoaWxkUHJvY2Vzc1NlcnZlcihBZ2VudEhvc3RJcGNDaGFubmVscy5BZ2VudEhvc3QpO1xuXHR9XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGVycm9yVGVsZW1ldHJ5ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxFcnJvclRlbGVtZXRyeT4oKSk7XG5cblx0Ly8gU2VydmljZXNcblx0Y29uc3QgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCAuLi5wcm9kdWN0IH07XG5cdGNvbnN0IGVudmlyb25tZW50U2VydmljZSA9IG5ldyBOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UocGFyc2VBcmdzKHByb2Nlc3MuYXJndiwgT1BUSU9OUyksIHByb2R1Y3RTZXJ2aWNlKTtcblx0Y29uc3QgbG9nZ2VyU2VydmljZSA9IG5ldyBMb2dnZXJTZXJ2aWNlKGdldExvZ0xldmVsKGVudmlyb25tZW50U2VydmljZSksIGVudmlyb25tZW50U2VydmljZS5sb2dzSG9tZSk7XG5cdC8vIE5vbi1wcm90b2NvbCBtYW5hZ2VtZW50IGFuZCBsb2dnaW5nIElQQyByZW1haW4gc2VwYXJhdGUgZnJvbSB0aGUgQUhQIGRhdGEgcGxhbmUuXG5cdHNlcnZlci5yZWdpc3RlckNoYW5uZWwoQWdlbnRIb3N0SXBjQ2hhbm5lbHMuTG9nZ2VyLCBuZXcgTG9nZ2VyQ2hhbm5lbChsb2dnZXJTZXJ2aWNlLCAoKSA9PiBEZWZhdWx0VVJJVHJhbnNmb3JtZXIpKTtcblx0Y29uc3QgbG9nZ2VyID0gbG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoJ2FnZW50aG9zdCcsIHsgbmFtZTogbG9jYWxpemUoJ2FnZW50SG9zdCcsIFwiQWdlbnQgSG9zdFwiKSB9KTtcblx0Ly8gT1RMUCBsb2cgZmFuLW91dDogYW55IGNvbnN1bWVyIHRoYXQgc3Vic2NyaWJlcyB0byB0aGUgaG9zdCdzXG5cdC8vIGBhaHAtb3RscDovL2xvZ3Mve2xldmVsfWAgY2hhbm5lbCB3aWxsIHJlY2VpdmUgZXZlcnkgbG9nIHJlY29yZCB0aGlzXG5cdC8vIGBJTG9nU2VydmljZWAgcHJvZHVjZXMsIGluIGFkZGl0aW9uIHRvIHRoZSByZWd1bGFyIGZpbGUgbG9nZ2VyLiBUaGVcblx0Ly8gZW1pdHRlciBpcyBjcmVhdGVkIGhlcmUgc28gaXQgY2FuIGJlIHNoYXJlZCBieSBldmVyeSBwcm90b2NvbFxuXHQvLyBoYW5kbGVyIGluc3RhbnRpYXRlZCBiZWxvdy5cblx0Y29uc3Qgb3RscExvZ0VtaXR0ZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE90bHBMb2dFbWl0dGVyKCkpO1xuXHRjb25zdCBvdGxwTG9nZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBPdGxwRW1pdHRlckxvZ2dlcihvdGxwTG9nRW1pdHRlcikpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IExvZ1NlcnZpY2UobG9nZ2VyLCBbb3RscExvZ2dlcl0pO1xuXHRpZiAoIWVudmlyb25tZW50U2VydmljZS5pc0J1aWx0ICYmIGlzRGV2Q29uc29sZUxvZ0ZvcndhcmRpbmdFbmFibGVkKSB7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyRGV2Q29uc29sZUxvZ0ZvcndhcmRlcihsb2dTZXJ2aWNlKSk7XG5cdH1cblx0bG9nU2VydmljZS5pbmZvKCdBZ2VudCBIb3N0IHByb2Nlc3Mgc3RhcnRlZCBzdWNjZXNzZnVsbHknKTtcblxuXHQvLyBGaWxlIHNlcnZpY2Vcblx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKGxvZ1NlcnZpY2UpKTtcblx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5maWxlLCBkaXNwb3NhYmxlcy5hZGQobmV3IERpc2tGaWxlU3lzdGVtUHJvdmlkZXIobG9nU2VydmljZSkpKSk7XG5cdC8vIEluLW1lbW9yeSBmaWxlc3lzdGVtIGJhY2tpbmcgdHJhbnNpZW50IGZpbGUtZWRpdCBwcmV2aWV3cyBzaG93biBkdXJpbmdcblx0Ly8gdG9vbC1jYWxsIGNvbmZpcm1hdGlvbnMuXG5cdGRpc3Bvc2FibGVzLmFkZChyZWdpc3RlclBlbmRpbmdFZGl0Q29udGVudFByb3ZpZGVyKGZpbGVTZXJ2aWNlKSk7XG5cblx0Ly8gU2Vzc2lvbiBkYXRhIHNlcnZpY2Vcblx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gbmV3IFNlc3Npb25EYXRhU2VydmljZShVUkkuZmlsZShlbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFQYXRoKSwgZmlsZVNlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXHRjb25zdCByb290Q29uZmlnUmVzb3VyY2UgPSBqb2luUGF0aChlbnZpcm9ubWVudFNlcnZpY2UuYXBwU2V0dGluZ3NIb21lLCAnZ2xvYmFsU3RvcmFnZScsICdhZ2VudC1ob3N0LWNvbmZpZy5qc29uJyk7XG5cblx0Ly8gQ3JlYXRlIHRoZSByZWFsIHNlcnZpY2UgaW1wbGVtZW50YXRpb24gdGhhdCBsaXZlcyBpbiB0aGlzIHByb2Nlc3Ncblx0bGV0IGFnZW50U2VydmljZTogQWdlbnRTZXJ2aWNlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0Ly8gSG9pc3RlZCBvdXQgb2YgdGhlIGB0cnlgIGJlbG93IHNvIHRoZSBwcm90b2NvbCBoYW5kbGVycyAoY29uc3RydWN0ZWRcblx0Ly8gYWZ0ZXIgdGhlIGJsb2NrKSBjYW4gZm9yd2FyZCBhZ2VudC1TREsgZG93bmxvYWQgcHJvZ3Jlc3MgdG8gY2xpZW50cy5cblx0bGV0IHNka0Rvd25sb2FkUHJvZ3Jlc3M6IEV2ZW50PElBZ2VudFNka0Rvd25sb2FkUHJvZ3Jlc3M+IHwgdW5kZWZpbmVkO1xuXHRsZXQgYnlva0xtQnJpZGdlUmVnaXN0cnk6IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5O1xuXHRsZXQgcHJveHlSZXNvbHZlcjogSUFnZW50SG9zdFByb3h5UmVzb2x2ZXIgfCB1bmRlZmluZWQ7XG5cdC8vIEdhdGUgQllPSyAqdXNlKiBiZWhpbmQgdGhlIG9wdC1pbiBgY2hhdC5hZ2VudEhvc3QuYnlva01vZGVscy5lbmFibGVkYFxuXHQvLyBzZXR0aW5nLCBmb3J3YXJkZWQgZnJvbSB0aGUgcmVuZGVyZXIgYXMgYW4gZW52IHZhci4gVGhlIHByb3h5IGFuZCBicmlkZ2Vcblx0Ly8gcmVnaXN0cnkgYXJlIGFsd2F5cyBjb25zdHJ1Y3RlZCBiZWxvdyAoc28gdGhlIHNlc3Npb24gbGF1bmNoZXIgY2FuIGluamVjdFxuXHQvLyB0aGVtKSwgYnV0IHdoZW4gb2ZmIHRoZXkgc3RheSBpbmVydDogdGhlIHBlci1jb25uZWN0aW9uIGJyaWRnZSBhbmQgdGhlXG5cdC8vIHJlbmRlcmVyJ3MgQllPSyBzZXJ2ZXIgY2hhbm5lbCBhcmUgbm90IHdpcmVkLCBzbyB0aGUgcmVnaXN0cnkgc3RheXMgZW1wdHlcblx0Ly8gYW5kIHRoZSBwcm94eSBuZXZlciBiaW5kcy5cblx0Y29uc3QgYnlva0xtRW5hYmxlZCA9IGlzQWdlbnRFbmFibGVkKHByb2Nlc3MuZW52W0FnZW50SG9zdEJ5b2tNb2RlbHNFbmFibGVkRW52VmFyXSwgdHJ1ZSk7XG5cdHRyeSB7XG5cdFx0Ly8gQnVpbGQgdGhlIHByb2Nlc3MgREkgY29udGFpbmVyIGFuZCBuZXR3b3JrIHN0YWNrIGJlZm9yZSB0ZWxlbWV0cnkgc28gZXZlcnlcblx0XHQvLyBvdXRib3VuZCBmZXRjaCwgaW5jbHVkaW5nIHJlc3RyaWN0ZWQgdGVsZW1ldHJ5LCB1c2VzIHRoZSBzYW1lIHByb3h5IHJlc29sdmVyLlxuXHRcdGNvbnN0IGRpU2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oKTtcblx0XHRkaVNlcnZpY2VzLnNldChJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElMb2dTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJU2Vzc2lvbkRhdGFTZXJ2aWNlLCBzZXNzaW9uRGF0YVNlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElQcm9kdWN0U2VydmljZSwgcHJvZHVjdFNlcnZpY2UpO1xuXHRcdGNvbnN0IG5ldHdvcmtTZXJ2aWNlcyA9IGF3YWl0IHJlZ2lzdGVyQWdlbnRIb3N0TmV0d29ya1NlcnZpY2VzKGRpU2VydmljZXMsIGZpbGVTZXJ2aWNlLCBlbnZpcm9ubWVudFNlcnZpY2UsIGxvZ1NlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRwcm94eVJlc29sdmVyID0gbmV0d29ya1NlcnZpY2VzLnByb3h5UmVzb2x2ZXI7XG5cdFx0Y29uc3QgZmV0Y2hGbiA9IHByb3h5UmVzb2x2ZXIuZmV0Y2guYmluZChwcm94eVJlc29sdmVyKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gYXdhaXQgY3JlYXRlQWdlbnRIb3N0VGVsZW1ldHJ5U2VydmljZSh7IGVudmlyb25tZW50U2VydmljZSwgcHJvZHVjdFNlcnZpY2UsIGZpbGVTZXJ2aWNlLCBsb2dnZXJTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBkaXNwb3NhYmxlcywgZmV0Y2hGbiwgcmVxdWVzdFNlcnZpY2U6IG5ldHdvcmtTZXJ2aWNlcy5yZXF1ZXN0U2VydmljZSB9KTtcblx0XHRlcnJvclRlbGVtZXRyeS52YWx1ZSA9IG5ldyBFcnJvclRlbGVtZXRyeSh0ZWxlbWV0cnlTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJVGVsZW1ldHJ5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgSW5zdGFudGlhdGlvblNlcnZpY2UoZGlTZXJ2aWNlcyk7XG5cdFx0Y29uc3QgZmlsZU1vbml0b3JTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSkpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UsIGZpbGVNb25pdG9yU2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSVdpbmRvd3NNeGNUZXJtaW5hbFNhbmRib3hSdW50aW1lLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXaW5kb3dzTXhjVGVybWluYWxTYW5kYm94UnVudGltZSkpO1xuXHRcdGRpU2VydmljZXMuc2V0KElTYW5kYm94SGVscGVyU2VydmljZSwgbmV3IFNhbmRib3hIZWxwZXJTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RHaXRTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRIb3N0R2l0U2VydmljZSwgZ2l0U2VydmljZSk7XG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGFnZW50IFNESyBkb3dubG9hZGVyIEJFRk9SRSBhbnkgc2VydmljZSB0aGF0IGluamVjdHMgaXRcblx0XHQvLyAoQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlIGFuZCBDb2RleEFnZW50IGJlbG93KS4gVGhlIGRvd25sb2FkZXIgcmVzb2x2ZXNcblx0XHQvLyBkZXYtb3ZlcnJpZGUgZW52IHZhciBcdTIxOTIgb24tZGlzayBjYWNoZSBcdTIxOTIgcHJvZHVjdC5hZ2VudFNka3MgZG93bmxvYWQuXG5cdFx0Y29uc3QgYWdlbnRTZGtEb3dubG9hZGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2RrRG93bmxvYWRlcikpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudFNka0Rvd25sb2FkZXIsIGFnZW50U2RrRG93bmxvYWRlcik7XG5cdFx0c2RrRG93bmxvYWRQcm9ncmVzcyA9IGFnZW50U2RrRG93bmxvYWRlci5vbkRpZERvd25sb2FkUHJvZ3Jlc3M7XG5cdFx0Y29uc3QgY2xhdWRlQWdlbnRTZGtTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlLCBjbGF1ZGVBZ2VudFNka1NlcnZpY2UpO1xuXHRcdC8vIEJZT0sgbGFuZ3VhZ2UtbW9kZWwgcHJveHkgKyBicmlkZ2UgcmVnaXN0cnkuIEFsd2F5cyByZWdpc3RlcmVkIHNvIHRoZVxuXHRcdC8vIHNlc3Npb24gbGF1bmNoZXIgY2FuIGluamVjdCB0aGVtLCBidXQgQllPSyAqdXNlKiBpcyBnYXRlZDogdGhlXG5cdFx0Ly8gcGVyLWNvbm5lY3Rpb24gYnJpZGdlIGJlbG93IChhbmQgdGhlIHJlbmRlcmVyJ3Mgc2VydmVyIGNoYW5uZWwpIGFyZSBvbmx5XG5cdFx0Ly8gd2lyZWQgd2hlbiBgY2hhdC5hZ2VudEhvc3QuYnlva01vZGVscy5lbmFibGVkYCBpcyBvbiwgc28gdGhlIHJlZ2lzdHJ5XG5cdFx0Ly8gc3RheXMgZW1wdHkgYW5kIHRoZSBwcm94eSBuZXZlciBiaW5kcyB3aGVuIHRoZSBmZWF0dXJlIGlzIG9mZi5cblx0XHRieW9rTG1CcmlkZ2VSZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGRpU2VydmljZXMuc2V0KElCeW9rTG1CcmlkZ2VSZWdpc3RyeSwgYnlva0xtQnJpZGdlUmVnaXN0cnkpO1xuXHRcdGNvbnN0IGJ5b2tMbVByb3h5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCeW9rTG1Qcm94eVNlcnZpY2UpKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQnlva0xtUHJveHlTZXJ2aWNlLCBieW9rTG1Qcm94eVNlcnZpY2UpO1xuXHRcdGNvbnN0IGFnZW50SG9zdE9UZWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE9UZWxTZXJ2aWNlLCBmZXRjaEZuKSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdE9UZWxTZXJ2aWNlLCBhZ2VudEhvc3RPVGVsU2VydmljZSk7XG5cdFx0YWdlbnRTZXJ2aWNlID0gbmV3IEFnZW50U2VydmljZShsb2dTZXJ2aWNlLCBmaWxlU2VydmljZSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBwcm9kdWN0U2VydmljZSwgZ2l0U2VydmljZSwgcm9vdENvbmZpZ1Jlc291cmNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBmaWxlTW9uaXRvclNlcnZpY2UsIHVuZGVmaW5lZCwgZmV0Y2hGbiwgW2NyZWF0ZUNvZGV4UHJvdmlkZXJDb25maWd1cmF0aW9uKGVudmlyb25tZW50U2VydmljZS51c2VySG9tZSldKTtcblx0XHRjb25zdCBuZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTmV0d29ya0RpYWdub3N0aWNzU2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSU5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UsIG5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UpO1xuXHRcdGFnZW50U2VydmljZS5zZXROZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlKG5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudFNlcnZpY2UsIGFnZW50U2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgYWdlbnRTZXJ2aWNlLnN0YXRlTWFuYWdlcik7XG5cdFx0Y29uc3QgcGx1Z2luTWFuYWdlciA9IG5ldyBBZ2VudFBsdWdpbk1hbmFnZXIoVVJJLmZpbGUoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCksIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRQbHVnaW5NYW5hZ2VyLCBwbHVnaW5NYW5hZ2VyKTtcblx0XHRjb25zdCBkaWZmQ29tcHV0ZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vZGVXb3JrZXJEaWZmQ29tcHV0ZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRcdGRpU2VydmljZXMuc2V0KElEaWZmQ29tcHV0ZVNlcnZpY2UsIGRpZmZDb21wdXRlU2VydmljZSk7XG5cdFx0Y29uc3QgZWRpdEF0dHJpYnV0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSwgZWRpdEF0dHJpYnV0aW9uU2VydmljZSk7XG5cdFx0YWdlbnRTZXJ2aWNlLnNldEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UoZWRpdEF0dHJpYnV0aW9uU2VydmljZSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5KSk7XG5cblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLCBhZ2VudFNlcnZpY2UudGVybWluYWxNYW5hZ2VyKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgYWdlbnRTZXJ2aWNlLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBlZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVkaXRBcmNSZXBvcnRlclNlcnZpY2UsIHVuZGVmaW5lZCkpO1xuXHRcdGRpU2VydmljZXMuc2V0KElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlLCBlZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLCBhZ2VudFNlcnZpY2UuZ2l0SHViRW5kcG9pbnRTZXJ2aWNlKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q29tcGxldGlvbnMsIGFnZW50U2VydmljZS5jb21wbGV0aW9uc1NlcnZpY2UpO1xuXHRcdGRpU2VydmljZXMuc2V0KElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSwgYWdlbnRTZXJ2aWNlLmNoZWNrcG9pbnRTZXJ2aWNlKTtcblxuXHRcdC8vIENvcGlsb3RBcGlTZXJ2aWNlIGFuZCB0aGUgcHJveGllcyB0aGF0IGNvbnN1bWUgaXQgYXJlIGNyZWF0ZWQgQUZURVIgdGhlXG5cdFx0Ly8gR2l0SHViIGVuZHBvaW50IHNlcnZpY2UgaXMgcmUtZXhwb3J0ZWQgKGFib3ZlKSBzbyBDQVBJIGVuZHBvaW50IGRpc2NvdmVyeVxuXHRcdC8vIGNhbiB0YXJnZXQgYSBHaXRIdWIgRW50ZXJwcmlzZSBob3N0LiBNYXRjaGVzIGFnZW50SG9zdFNlcnZlck1haW4gb3JkZXJpbmcuXG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90QXBpU2VydmljZSwgZmV0Y2hGbik7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUNvcGlsb3RBcGlTZXJ2aWNlLCBjb3BpbG90QXBpU2VydmljZSk7XG5cdFx0Ly8gSG9zdC1vd25lZCB3b3JrdHJlZSBpc29sYXRpb24gY29udHJvbGxlcjogYSBzaW5nbGUgaW5zdGFuY2UgZHJpdmVzIGZvbGRlclxuXHRcdC8vIC8gd29ya3RyZWUgaXNvbGF0aW9uIGZvciBldmVyeSBhZ2VudCwgc28gcHJvdmlkZXJzIHN0YXkgdW5hd2FyZSBvZiBpdC4gSXRcblx0XHQvLyBvd25zIGl0cyBicmFuY2gtbmFtZSBnZW5lcmF0b3IsIGNyZWF0ZWQgZnJvbSBJQ29waWxvdEFwaVNlcnZpY2UuXG5cdFx0YWdlbnRTZXJ2aWNlLnNldFdvcmt0cmVlSXNvbGF0aW9uKGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3JrdHJlZUlzb2xhdGlvbiwgdW5kZWZpbmVkKSkpO1xuXHRcdGNvbnN0IGNsYXVkZVByb3h5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVQcm94eVNlcnZpY2UpKTtcblx0XHRkaVNlcnZpY2VzLnNldChJQ2xhdWRlUHJveHlTZXJ2aWNlLCBjbGF1ZGVQcm94eVNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvZGV4UHJveHlTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGV4UHJveHlTZXJ2aWNlKSk7XG5cdFx0ZGlTZXJ2aWNlcy5zZXQoSUNvZGV4UHJveHlTZXJ2aWNlLCBjb2RleFByb3h5U2VydmljZSk7XG5cdFx0YWdlbnRTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29waWxvdEFnZW50KSk7XG5cdFx0Ly8gQ2xhdWRlIGFuZCBDb2RleCBwcm92aWRlcnMgYXJlIGdhdGVkIG9uIHR3byB0aGluZ3M6XG5cdFx0Ly8gIDEuIFRoZSB1c2VyLWZhY2luZyBlbmFibGUgdG9nZ2xlIChgY2hhdC5hZ2VudEhvc3QuPHg+QWdlbnQuZW5hYmxlZGAsXG5cdFx0Ly8gICAgIGZvcndhcmRlZCBhcyBhbiBlbnYgdmFyIGJ5IHRoZSBzdGFydGVycykuIENsYXVkZSBkZWZhdWx0cyB0byBvbixcblx0XHQvLyAgICAgQ29kZXggZGVmYXVsdHMgdG8gb2ZmLlxuXHRcdC8vICAyLiBUaGUgU0RLIGJlaW5nIHJlYWNoYWJsZS4gQ2xhdWRlIGlzIGEgZGV2RGVwZW5kZW5jeSBvZiB0aGlzIHJlcG9cblx0XHQvLyAgICAgc28gdGhlIGJhcmUtaW1wb3J0IHBhdGggaW4gYENsYXVkZUFnZW50U2RrU2VydmljZS5fbG9hZFNka2Bcblx0XHQvLyAgICAgYWx3YXlzIHN1Y2NlZWRzIGluIGRldjsgaW4gYnVpbHQgcHJvZHVjdHMgdGhlIFNESyBzaGlwcyB2aWFcblx0XHQvLyAgICAgYHByb2R1Y3QuYWdlbnRTZGtzLmNsYXVkZWAgYW5kIHRoZSBkb3dubG9hZGVyIGhhbmRsZXMgaXQuIENvZGV4XG5cdFx0Ly8gICAgIGlzIGxpa2V3aXNlIGEgZGV2RGVwZW5kZW5jeSwgc28gYENvZGV4QWdlbnQuX3Jlc29sdmVTZGtSb290YFxuXHRcdC8vICAgICByZXNvbHZlcyBpdCBmcm9tIGBub2RlX21vZHVsZXNgIGluIGRldjsgYnVpbHQgcHJvZHVjdHMgdXNlIHRoZVxuXHRcdC8vICAgICBlbnYtdmFyIG92ZXJyaWRlIG9yIGEgYHByb2R1Y3QuYWdlbnRTZGtzLmNvZGV4YCBlbnRyeS5cblx0XHQvLyBJZiBlaXRoZXIgZ2F0ZSBmYWlscywgdGhlIHByb3ZpZGVyIGlzIG5vdCByZWdpc3RlcmVkIGFuZCBuZXZlciBhcHBlYXJzXG5cdFx0Ly8gaW4gdGhlIGFnZW50IHBpY2tlciAobWF0Y2hlcyB0aGUgcHJlLUNETiBVWCBleGFjdGx5KS5cblx0XHRpZiAoaXNBZ2VudEVuYWJsZWQocHJvY2Vzcy5lbnZbQWdlbnRIb3N0Q2xhdWRlQWdlbnRFbmFibGVkRW52VmFyXSwgdHJ1ZSkgJiYgKCFlbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCB8fCBhZ2VudFNka0Rvd25sb2FkZXIuaXNBdmFpbGFibGUoQ2xhdWRlU2RrUGFja2FnZSkpKSB7XG5cdFx0XHRhZ2VudFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVBZ2VudCkpO1xuXHRcdH1cblx0XHQvLyBDb2RleCByZWdpc3RyYXRpb24gaXMgb25lLXdheSAocmVnaXN0ZXItb24tZW5hYmxlKTogdGhlIGVudi12YXIgdG9nZ2xlXG5cdFx0Ly8gb3IgdGhlIHJlbmRlcmVyLWZvcndhcmRlZCBgY29kZXhBZ2VudEVuYWJsZWRgIHJvb3QgY29uZmlnIGVuYWJsZXMgaXQuXG5cdFx0Ly8gRGlzYWJsaW5nIHJlcXVpcmVzIGFuIGFnZW50IGhvc3QgcmVzdGFydC5cblx0XHRpZiAoIWVudmlyb25tZW50U2VydmljZS5pc0J1aWx0IHx8IGFnZW50U2RrRG93bmxvYWRlci5pc0F2YWlsYWJsZShDb2RleFNka1BhY2thZ2UpKSB7XG5cdFx0XHRjb25zdCBhZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWdlbnRTZXJ2aWNlLmNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdFx0bGV0IGNvZGV4UmVnaXN0ZXJlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgcmVnaXN0ZXJDb2RleElmRW5hYmxlZCA9ICgpID0+IHtcblx0XHRcdFx0aWYgKGNvZGV4UmVnaXN0ZXJlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBlbmFibGVkQnlFbnYgPSBpc0FnZW50RW5hYmxlZChwcm9jZXNzLmVudltBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZEVudlZhcl0sIGZhbHNlKTtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZEJ5Um9vdENvbmZpZyA9IGFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0Q29kZXhFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZTtcblx0XHRcdFx0aWYgKGVuYWJsZWRCeUVudiB8fCBlbmFibGVkQnlSb290Q29uZmlnKSB7XG5cdFx0XHRcdFx0Y29kZXhSZWdpc3RlcmVkID0gdHJ1ZTtcblx0XHRcdFx0XHRhZ2VudFNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RleEFnZW50KSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRyZWdpc3RlckNvZGV4SWZFbmFibGVkKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZFJvb3RDb25maWdDaGFuZ2UoKCkgPT4gcmVnaXN0ZXJDb2RleElmRW5hYmxlZCgpKSk7XG5cdFx0fVxuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gY3JlYXRlIEFnZW50U2VydmljZScsIGVycik7XG5cdFx0dGhyb3cgZXJyO1xuXHR9XG5cblx0Ly8gS2VlcCBldmVyeSBwcm92aWRlcidzIG1vZGVsIGNhdGFsb2cgZnJlc2guIFByb3ZpZGVyLW93bmVkIHJlZnJlc2hcblx0Ly8gdHJpZ2dlcnMgKGF1dGhlbnRpY2F0aW9uLCB0cmFuc3BvcnQgZmxpcHMsIGNsaWVudCByZXN0YXJ0cykgYXJlIGFsbFxuXHQvLyBlZGdlLWJhc2VkLCBzbyB0aGlzIHBlcmlvZGljIHRpY2sgaXMgdGhlIG9ubHkgdGhpbmcgdGhhdCBub3RpY2VzIGEgbW9kZWxcblx0Ly8gYWRkZWQgc2VydmljZS1zaWRlIHdoaWxlIHRoZSBob3N0IHN0YXlzIHVwLiBPd25lZCBoZXJlLCBhdCBwcm9jZXNzXG5cdC8vIGxpZmV0aW1lLCByYXRoZXIgdGhhbiBpbnNpZGUgYEFnZW50SG9zdFNlcnZpY2VgOiBhIHNlcnZpY2UgdGhhdCBhcm1zIGFcblx0Ly8gcmVjdXJyaW5nIHRpbWVyIGluIGl0cyBjb25zdHJ1Y3RvciBpcyBvbmUgdGhhdCBubyBmYWtlZC10aW1lciB1bml0IHRlc3Rcblx0Ly8gY2FuIGV2ZXIgZHJhaW4uXG5cdGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudE1vZGVsUmVmcmVzaFNjaGVkdWxlciwgYWdlbnRTZXJ2aWNlLmFnZW50cywgTU9ERUxfUkVGUkVTSF9JTlRFUlZBTF9NUykpO1xuXG5cdC8vIFN1cmZhY2UgYWdlbnQtU0RLIGRvd25sb2FkIHByb2dyZXNzIHRvIGNsaWVudHMgYXMgZ2VuZXJpYyBgcHJvZ3Jlc3NgXG5cdC8vIG5vdGlmaWNhdGlvbnMuIFRoZSBkb3dubG9hZGVyIGZpcmVzIHByb2Nlc3MtZ2xvYmFsIGZyYW1lcyBrZXllZCBieSBwYWNrYWdlXG5cdC8vIGlkOyB0aGUgYWdlbnQgc2VydmljZSBmYW5zIGVhY2ggb3V0IHRvIHRoZSBgY3JlYXRlU2Vzc2lvbmAgcHJvZ3Jlc3MgdG9rZW5zXG5cdC8vIG9mIHRoZSBzZXNzaW9ucyB3YWl0aW5nIG9uIHRoYXQgcHJvdmlkZXIncyBTREssIHJvdXRlZCB0aHJvdWdoIHRoZSBzdGF0ZVxuXHQvLyBtYW5hZ2VyIHNvIGJvdGggdGhlIGxvY2FsIChJUEMpIGFuZCBhbnkgZXh0ZXJuYWwgKFdlYlNvY2tldCkgcmVuZGVyZXJcblx0Ly8gcmVjZWl2ZSB0aGVtIHZpYSB0aGUgc2FtZSBwYXRoIGFzIHNlc3Npb24gdXBkYXRlcy5cblx0aWYgKHNka0Rvd25sb2FkUHJvZ3Jlc3MpIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2RrRG93bmxvYWRQcm9ncmVzcyhwID0+IGFnZW50U2VydmljZS5lbWl0RG93bmxvYWRQcm9ncmVzcyhcblx0XHRcdHAucGFja2FnZUlkLFxuXHRcdFx0cC5kaXNwbGF5TmFtZSxcblx0XHRcdHAucmVjZWl2ZWRCeXRlcyxcblx0XHRcdHAudG90YWxCeXRlcyxcblx0XHRcdHAucGhhc2UgPT09ICdjb21wbGV0ZWQnIHx8IHAucGhhc2UgPT09ICdmYWlsZWQnLFxuXHRcdCkpKTtcblx0fVxuXG5cdC8vIFJldGFpbiB0aGUgaW1wZXJhdGl2ZSBicmlkZ2Ugb25seSBmb3IgdGhlIGNoaWxkLXByb2Nlc3Mgc2VydmVyIGNvbnN1bWVycy5cblx0Ly8gVGhlIHV0aWxpdHktcHJvY2VzcyBNZXNzYWdlUG9ydCBleHBvc2VzIFByb3RvY29sIGFuZCBNYW5hZ2VtZW50IGluc3RlYWQuXG5cdGlmICghKHNlcnZlciBpbnN0YW5jZW9mIFV0aWxpdHlQcm9jZXNzU2VydmVyKSkge1xuXHRcdGNvbnN0IGFnZW50Q2hhbm5lbCA9IFByb3h5Q2hhbm5lbC5mcm9tU2VydmljZShhZ2VudFNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRzZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKEFnZW50SG9zdElwY0NoYW5uZWxzLkFnZW50SG9zdCwgYWdlbnRDaGFubmVsKTtcblx0fVxuXG5cdC8vIFNpbmdsZSBzaGFyZWQgYHZzY29kZS1hZ2VudC1jbGllbnRgIGZpbGVzeXN0ZW0gcHJvdmlkZXIuIFBlci1jbGllbnRcblx0Ly8gYXV0aG9yaXRpZXMgYXJlIGFkZGVkIGJ5IHByb3RvY29sIGhhbmRsZXJzIG9yIHRoZSBub24tcHJvdG9jb2wgcmV2ZXJzZVxuXHQvLyBicmlkZ2VzIGJlbG93LlxuXHRjb25zdCBjbGllbnRGaWxlU3lzdGVtUHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoQUdFTlRfQ0xJRU5UX1NDSEVNRSwgY2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyKSk7XG5cblx0aWYgKHNlcnZlciBpbnN0YW5jZW9mIFV0aWxpdHlQcm9jZXNzU2VydmVyKSB7XG5cdFx0Y29uc3QgbG9jYWxEYXRhUGxhbmVEaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IG1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIgPSBuZXcgTWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlcjxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgbG9jYWxFbmRwb2ludCA9IGF3YWl0IHN0YXJ0TG9jYWxBZ2VudEhvc3RFbmRwb2ludChcblx0XHRcdGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgsXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRlbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsXG5cdFx0KTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbG9jYWxQcm90b2NvbFNlcnZlciA9IGxvY2FsRGF0YVBsYW5lRGlzcG9zYWJsZXMuYWRkKG5ldyBDb21wb3NpdGVQcm90b2NvbFNlcnZlcihbXG5cdFx0XHRcdG1lc3NhZ2VQb3J0UHJvdG9jb2xTZXJ2ZXIsXG5cdFx0XHRcdC4uLihsb2NhbEVuZHBvaW50ID8gW2xvY2FsRW5kcG9pbnQuc2VydmVyXSA6IFtdKSxcblx0XHRcdF0pKTtcblx0XHRcdGxvY2FsRGF0YVBsYW5lRGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFNlcnZlckhhbmRsZXIoXG5cdFx0XHRcdGFnZW50U2VydmljZSxcblx0XHRcdFx0YWdlbnRTZXJ2aWNlLnN0YXRlTWFuYWdlcixcblx0XHRcdFx0bG9jYWxQcm90b2NvbFNlcnZlcixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRlZmF1bHREaXJlY3Rvcnk6IFVSSS5maWxlKG9zLmhvbWVkaXIoKSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRjb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnM6IGFnZW50U2VydmljZS5jb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMsXG5cdFx0XHRcdFx0dGVybWluYWxDb21tYW5kUHJlZml4OiBCQU5HX0NPTU1BTkRfUFJFRklYLFxuXHRcdFx0XHRcdG90bHBMb2dFbWl0dGVyLFxuXHRcdFx0XHRcdGFsbG93RXh0ZW5zaW9uTWV0aG9kczogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcixcblx0XHRcdFx0bG9nU2VydmljZSxcblx0XHRcdCkpO1xuXHRcdFx0Ly8gTm9uLXByb3RvY29sIHJldmVyc2UgYnJpZGdlcyByZW1haW4gb24gdGhlaXIgZXhpc3RpbmcgSVBDIGNoYW5uZWxzLlxuXHRcdFx0Ly8gVGhlIHJlbmRlcmVyJ3MgTWVzc2FnZVBvcnRDbGllbnQgY3R4IGlzIGl0cyBjbGllbnRJZC5cblx0XHRcdGNvbnN0IGF1dGhvcml0eVJlZ2lzdHJhdGlvbnMgPSBuZXcgTWFwPHVua25vd24sIElEaXNwb3NhYmxlPigpO1xuXHRcdFx0Y29uc3QgcmVnaXN0ZXJDb25uZWN0aW9uID0gKGNvbm5lY3Rpb246ICh0eXBlb2Ygc2VydmVyLmNvbm5lY3Rpb25zKVtudW1iZXJdKSA9PiB7XG5cdFx0XHRcdGlmIChhdXRob3JpdHlSZWdpc3RyYXRpb25zLmhhcyhjb25uZWN0aW9uKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjbGllbnRJZCA9IGNvbm5lY3Rpb24uY3R4O1xuXHRcdFx0XHRpZiAodHlwZW9mIGNsaWVudElkICE9PSAnc3RyaW5nJyB8fCAhY2xpZW50SWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvblN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCBnZXRDaGFubmVsID0gKGNoYW5uZWxOYW1lOiBzdHJpbmcpID0+IHNlcnZlci5nZXRDaGFubmVsKGNoYW5uZWxOYW1lLCBjID0+IGMuY3R4ID09PSBjbGllbnRJZCk7XG5cdFx0XHRcdGNvbnN0IHByb3h5Q29ubmVjdGlvbiA9IGNyZWF0ZUFnZW50SG9zdENsaWVudFByb3h5Q29ubmVjdGlvbihnZXRDaGFubmVsKEFHRU5UX0hPU1RfQ0xJRU5UX1BST1hZX0NIQU5ORUwpKTtcblx0XHRcdFx0Y29ubmVjdGlvblN0b3JlLmFkZChwcm94eVJlc29sdmVyLnJlZ2lzdGVyKGNsaWVudElkLCBwcm94eUNvbm5lY3Rpb24pKTtcblx0XHRcdFx0Ly8gQllPSyBicmlkZ2UgaXMgZ2F0ZWQ6IG9ubHkgd2lyZSBpdCB3aGVuIHRoZSBmZWF0dXJlIGlzIGVuYWJsZWQsIHNvXG5cdFx0XHRcdC8vIHRoZSByZWdpc3RyeSBzdGF5cyBlbXB0eSAoYW5kIHRoZSBsYXVuY2hlciBzeW50aGVzaXplcyBubyBCWU9LXG5cdFx0XHRcdC8vIHByb3ZpZGVycy9tb2RlbHMpIHdoZW4gYGNoYXQuYWdlbnRIb3N0LmJ5b2tNb2RlbHMuZW5hYmxlZGAgaXMgb2ZmLlxuXHRcdFx0XHRpZiAoYnlva0xtRW5hYmxlZCAmJiBieW9rTG1CcmlkZ2VSZWdpc3RyeSkge1xuXHRcdFx0XHRcdGNvbnN0IGJ5b2tMbUNvbm5lY3Rpb24gPSBjcmVhdGVBZ2VudEhvc3RDbGllbnRCeW9rTG1Db25uZWN0aW9uKGdldENoYW5uZWwoQUdFTlRfSE9TVF9DTElFTlRfQllPS19MTV9DSEFOTkVMKSk7XG5cdFx0XHRcdFx0Y29ubmVjdGlvblN0b3JlLmFkZChieW9rTG1CcmlkZ2VSZWdpc3RyeS5yZWdpc3RlcihjbGllbnRJZCwgYnlva0xtQ29ubmVjdGlvbikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGF1dGhvcml0eVJlZ2lzdHJhdGlvbnMuc2V0KGNvbm5lY3Rpb24sIGNvbm5lY3Rpb25TdG9yZSk7XG5cdFx0XHR9O1xuXHRcdFx0bG9jYWxEYXRhUGxhbmVEaXNwb3NhYmxlcy5hZGQoc2VydmVyLm9uRGlkQWRkQ29ubmVjdGlvbihyZWdpc3RlckNvbm5lY3Rpb24pKTtcblx0XHRcdGxvY2FsRGF0YVBsYW5lRGlzcG9zYWJsZXMuYWRkKHNlcnZlci5vbkRpZFJlbW92ZUNvbm5lY3Rpb24oY29ubmVjdGlvbiA9PiB7XG5cdFx0XHRcdGlmICh0eXBlb2YgY29ubmVjdGlvbi5jdHggPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0bWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlci5jbG9zZUNsaWVudChjb25uZWN0aW9uLmN0eCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVnID0gYXV0aG9yaXR5UmVnaXN0cmF0aW9ucy5nZXQoY29ubmVjdGlvbik7XG5cdFx0XHRcdGlmIChyZWcpIHtcblx0XHRcdFx0XHRyZWcuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGF1dGhvcml0eVJlZ2lzdHJhdGlvbnMuZGVsZXRlKGNvbm5lY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRsb2NhbERhdGFQbGFuZURpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJlZ2lzdHJhdGlvbiBvZiBhdXRob3JpdHlSZWdpc3RyYXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhdXRob3JpdHlSZWdpc3RyYXRpb25zLmNsZWFyKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2Ygc2VydmVyLmNvbm5lY3Rpb25zKSB7XG5cdFx0XHRcdHJlZ2lzdGVyQ29ubmVjdGlvbihjb25uZWN0aW9uKTtcblx0XHRcdH1cblxuXHRcdFx0c2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChBZ2VudEhvc3RJcGNDaGFubmVscy5Qcm90b2NvbCwgbWVzc2FnZVBvcnRQcm90b2NvbFNlcnZlcik7XG5cdFx0XHRpZiAobG9jYWxFbmRwb2ludCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IHB1Ymxpc2hMb2NhbEFnZW50SG9zdEVuZHBvaW50TWV0YWRhdGEoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgbG9jYWxFbmRwb2ludC5tZXRhZGF0YSk7XG5cdFx0XHRcdFx0bG9jYWxEYXRhUGxhbmVEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRcdGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50KGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgsIGxvY2FsRW5kcG9pbnQubWV0YWRhdGEsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gcHVibGlzaCBsb2NhbCBwcm90b2NvbCBlbmRwb2ludDsgY29udGludWluZyB3aXRoIE1lc3NhZ2VQb3J0IG9ubHknLCBlcnJvcik7XG5cdFx0XHRcdFx0bG9jYWxFbmRwb2ludC5zZXJ2ZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50KGVudmlyb25tZW50U2VydmljZS51c2VyRGF0YVBhdGgsIGxvY2FsRW5kcG9pbnQubWV0YWRhdGEsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGxvY2FsRGF0YVBsYW5lRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0aWYgKGxvY2FsRW5kcG9pbnQpIHtcblx0XHRcdFx0Y2xlYW51cExvY2FsQWdlbnRIb3N0RW5kcG9pbnQoZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgbG9jYWxFbmRwb2ludC5tZXRhZGF0YSwgbG9nU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvLyBFeHBvc2UgZHluYW1pYyBicmlkZ2UgY2xpZW50IGNvdW50IHRvIHRoZSBwYXJlbnQgcHJvY2VzcyB2aWEgYSBub24tcHJvdG9jb2xcblx0Ly8gbWFuYWdlbWVudCBJUEMgY2hhbm5lbC5cblx0Y29uc3QgY29ubmVjdGlvbkNvdW50RW1pdHRlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxudW1iZXI+KCkpO1xuXHRsZXQgZHluYW1pY1NvY2tldEluZm86IElBZ2VudEhvc3RTb2NrZXRJbmZvIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBjb25uZWN0aW9uVHJhY2tlclNlcnZpY2U6IElDb25uZWN0aW9uVHJhY2tlclNlcnZpY2UgPSB7XG5cdFx0b25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQ6IGNvbm5lY3Rpb25Db3VudEVtaXR0ZXIuZXZlbnQsXG5cdFx0YXN5bmMgc3RhcnRXZWJTb2NrZXRTZXJ2ZXIoKTogUHJvbWlzZTxJQWdlbnRIb3N0U29ja2V0SW5mbz4ge1xuXHRcdFx0aWYgKGR5bmFtaWNTb2NrZXRJbmZvKSB7XG5cdFx0XHRcdHJldHVybiBkeW5hbWljU29ja2V0SW5mbztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc29ja2V0UGF0aCA9IGlzV2luZG93c1xuXHRcdFx0XHQ/IGBcXFxcXFxcXC5cXFxccGlwZVxcXFx2c2NvZGUtYWdlbnQtaG9zdC0ke2dlbmVyYXRlVXVpZCgpLnJlcGxhY2UoLy0vZywgJycpfWBcblx0XHRcdFx0OiBqb2luKG9zLnRtcGRpcigpLCBgdnNjb2RlLWFnZW50LWhvc3QtJHtnZW5lcmF0ZVV1aWQoKS5yZXBsYWNlKC8tL2csICcnKX0uc29ja2ApO1xuXG5cdFx0XHRjb25zdCB3c1NlcnZlciA9IGRpc3Bvc2FibGVzLmFkZChhd2FpdCBXZWJTb2NrZXRQcm90b2NvbFNlcnZlci5jcmVhdGUoXG5cdFx0XHRcdHsgc29ja2V0UGF0aCB9LFxuXHRcdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0XHR7IGluc3RhbnRpYXRpb25TZXJ2aWNlLCBsb2dzSG9tZTogZW52aXJvbm1lbnRTZXJ2aWNlLmxvZ3NIb21lIH0sXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgcHJvdG9jb2xIYW5kbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFNlcnZlckhhbmRsZXIoXG5cdFx0XHRcdGFnZW50U2VydmljZSxcblx0XHRcdFx0YWdlbnRTZXJ2aWNlLnN0YXRlTWFuYWdlcixcblx0XHRcdFx0d3NTZXJ2ZXIsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkZWZhdWx0RGlyZWN0b3J5OiBVUkkuZmlsZShvcy5ob21lZGlyKCkpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzOiBhZ2VudFNlcnZpY2UuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0XHRcdHRlcm1pbmFsQ29tbWFuZFByZWZpeDogQkFOR19DT01NQU5EX1BSRUZJWCxcblx0XHRcdFx0XHRvdGxwTG9nRW1pdHRlcixcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2xpZW50RmlsZVN5c3RlbVByb3ZpZGVyLFxuXHRcdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdG9jb2xIYW5kbGVyLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbkNvdW50KGNvdW50ID0+IGNvbm5lY3Rpb25Db3VudEVtaXR0ZXIuZmlyZShjb3VudCkpKTtcblxuXHRcdFx0bG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0XSBEeW5hbWljIFdlYlNvY2tldCBzZXJ2ZXIgbGlzdGVuaW5nIG9uICR7c29ja2V0UGF0aH1gKTtcblx0XHRcdGR5bmFtaWNTb2NrZXRJbmZvID0geyBzb2NrZXRQYXRoIH07XG5cdFx0XHRyZXR1cm4gZHluYW1pY1NvY2tldEluZm87XG5cdFx0fSxcblx0XHRhc3luYyBnZXRJbnNwZWN0SW5mbyh0cnlFbmFibGU6IGJvb2xlYW4pOiBQcm9taXNlPElBZ2VudEhvc3RJbnNwZWN0SW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0bGV0IHVybCA9IGluc3BlY3Rvci51cmwoKTtcblx0XHRcdGlmICghdXJsICYmIHRyeUVuYWJsZSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGluc3BlY3Rvci5vcGVuKDAsICcxMjcuMC4wLjEnLCBmYWxzZSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudEhvc3RdIEZhaWxlZCB0byBvcGVuIGluc3BlY3RvcicsIGVycik7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR1cmwgPSBpbnNwZWN0b3IudXJsKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXVybCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSW5zcGVjdG9yIFVSTCBsb29rcyBsaWtlOiB3czovL2hvc3Q6cG9ydC91dWlkIChob3N0IG1heSBiZSBJUHY2IGluIGJyYWNrZXRzKVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkVXJsID0gbmV3IFVSTCh1cmwpO1xuXHRcdFx0XHRpZiAocGFyc2VkVXJsLnByb3RvY29sICE9PSAnd3M6Jykge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdF0gVW5leHBlY3RlZCBpbnNwZWN0b3IgVVJMOiAke3VybH1gKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcG9ydCA9IE51bWJlcihwYXJzZWRVcmwucG9ydCk7XG5cdFx0XHRcdGNvbnN0IGF1dGggPSBwYXJzZWRVcmwucGF0aG5hbWUucmVwbGFjZSgvXlxcLysvLCAnJyk7XG5cdFx0XHRcdGlmICghTnVtYmVyLmlzSW50ZWdlcihwb3J0KSB8fCAhYXV0aCkge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdF0gVW5leHBlY3RlZCBpbnNwZWN0b3IgVVJMOiAke3VybH1gKTtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgaG9zdCA9IHBhcnNlZFVybC5ob3N0bmFtZSA9PT0gJzAuMC4wLjAnXG5cdFx0XHRcdFx0PyAnMTI3LjAuMC4xJ1xuXHRcdFx0XHRcdDogcGFyc2VkVXJsLmhvc3RuYW1lID09PSAnOjonXG5cdFx0XHRcdFx0XHQ/ICc6OjEnXG5cdFx0XHRcdFx0XHQ6IHBhcnNlZFVybC5ob3N0bmFtZTtcblx0XHRcdFx0Y29uc3QgZGV2dG9vbHNIb3N0ID0gaG9zdC5pbmNsdWRlcygnOicpID8gYFske2hvc3R9XWAgOiBob3N0O1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aG9zdCxcblx0XHRcdFx0XHRwb3J0LFxuXHRcdFx0XHRcdGRldnRvb2xzVXJsOiBgZGV2dG9vbHM6Ly9kZXZ0b29scy9idW5kbGVkL2pzX2FwcC5odG1sP3Y4b25seT10cnVlJndzPSR7ZGV2dG9vbHNIb3N0fToke3BhcnNlZFVybC5wb3J0fS8ke2F1dGh9YCxcblx0XHRcdFx0fTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIFVuZXhwZWN0ZWQgaW5zcGVjdG9yIFVSTDogJHt1cmx9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSxcblx0fTtcblx0aWYgKHNlcnZlciBpbnN0YW5jZW9mIFV0aWxpdHlQcm9jZXNzU2VydmVyKSB7XG5cdFx0c2VydmVyLnJlZ2lzdGVyQ2hhbm5lbChBZ2VudEhvc3RJcGNDaGFubmVscy5NYW5hZ2VtZW50LCBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UobmV3IEFnZW50SG9zdE1hbmFnZW1lbnRTZXJ2aWNlKGFnZW50U2VydmljZSwgY29ubmVjdGlvblRyYWNrZXJTZXJ2aWNlKSwgZGlzcG9zYWJsZXMpKTtcblx0fSBlbHNlIHtcblx0XHRzZXJ2ZXIucmVnaXN0ZXJDaGFubmVsKEFnZW50SG9zdElwY0NoYW5uZWxzLkNvbm5lY3Rpb25UcmFja2VyLCBQcm94eUNoYW5uZWwuZnJvbVNlcnZpY2UoY29ubmVjdGlvblRyYWNrZXJTZXJ2aWNlLCBkaXNwb3NhYmxlcykpO1xuXHR9XG5cblx0Ly8gVGhlIGNvbmZpZ3VyZWQgYnJpZGdlIGxpc3RlbmVyIHJlbWFpbnMgc2VwYXJhdGU6IHR1bm5lbCBmb3J3YXJkaW5nIHBpcGVzXG5cdC8vIHJhdyBXZWJTb2NrZXQgc3RyZWFtcyBhbmQgY2Fubm90IGNhcnJ5IHRoZSBsb2NhbCBlbmRwb2ludCdzIGJlYXJlciB0b2tlbi5cblx0c3RhcnRXZWJTb2NrZXRTZXJ2ZXIoXG5cdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdGNsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcixcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRlbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsXG5cdFx0bG9nU2VydmljZSxcblx0XHRvdGxwTG9nRW1pdHRlcixcblx0XHRkaXNwb3NhYmxlcyxcblx0XHRjb3VudCA9PiBjb25uZWN0aW9uQ291bnRFbWl0dGVyLmZpcmUoY291bnQpLFxuXHQpLmNhdGNoKGVyciA9PiB7XG5cdFx0bG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHN0YXJ0IFdlYlNvY2tldCBzZXJ2ZXInLCBlcnIpO1xuXHR9KTtcblxuXHRwcm9jZXNzLm9uY2UoJ2V4aXQnLCAoKSA9PiB7XG5cdFx0YWdlbnRTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRsb2dTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xufVxuXG5pbnRlcmZhY2UgSUxvY2FsQWdlbnRIb3N0RW5kcG9pbnQge1xuXHRyZWFkb25seSBtZXRhZGF0YTogSUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YTtcblx0cmVhZG9ubHkgc2VydmVyOiBXZWJTb2NrZXRQcm90b2NvbFNlcnZlcjtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc3RhcnRMb2NhbEFnZW50SG9zdEVuZHBvaW50KFxuXHR1c2VyRGF0YVBhdGg6IHN0cmluZyxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdGxvZ3NIb21lOiBVUkksXG4pOiBQcm9taXNlPElMb2NhbEFnZW50SG9zdEVuZHBvaW50IHwgdW5kZWZpbmVkPiB7XG5cdGxldCBtZXRhZGF0YTogSUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSB8IHVuZGVmaW5lZDtcblx0bGV0IHNlcnZlcjogV2ViU29ja2V0UHJvdG9jb2xTZXJ2ZXIgfCB1bmRlZmluZWQ7XG5cdHRyeSB7XG5cdFx0Y29uc3QgZW5kcG9pbnRNZXRhZGF0YSA9IGNyZWF0ZUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSh1c2VyRGF0YVBhdGgpO1xuXHRcdG1ldGFkYXRhID0gZW5kcG9pbnRNZXRhZGF0YTtcblx0XHRhd2FpdCBwcmVwYXJlTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhRGlyZWN0b3J5KHVzZXJEYXRhUGF0aCk7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGF3YWl0IHByZXBhcmVMb2NhbEFnZW50SG9zdEVuZHBvaW50U29ja2V0RGlyZWN0b3J5KHVzZXJEYXRhUGF0aCk7XG5cdFx0fVxuXHRcdHNlcnZlciA9IGF3YWl0IFdlYlNvY2tldFByb3RvY29sU2VydmVyLmNyZWF0ZShcblx0XHRcdHtcblx0XHRcdFx0c29ja2V0UGF0aDogZW5kcG9pbnRNZXRhZGF0YS5lbmRwb2ludFBhdGgsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlblZhbGlkYXRlOiB0b2tlbiA9PiB0b2tlbiA9PT0gZW5kcG9pbnRNZXRhZGF0YS5jb25uZWN0aW9uVG9rZW4sXG5cdFx0XHR9LFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdHsgaW5zdGFudGlhdGlvblNlcnZpY2UsIGxvZ3NIb21lIH0sXG5cdFx0KTtcblx0XHRhd2FpdCBzZXJ2ZXIud2hlbkxpc3RlbmluZztcblx0XHRyZXR1cm4geyBtZXRhZGF0YTogZW5kcG9pbnRNZXRhZGF0YSwgc2VydmVyIH07XG5cdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHNlcnZlcj8uZGlzcG9zZSgpO1xuXHRcdH0gY2F0Y2ggKGRpc3Bvc2VFcnJvcikge1xuXHRcdFx0bG9nU2VydmljZS5lcnJvcignW0FnZW50SG9zdF0gRmFpbGVkIHRvIGRpc3Bvc2UgbG9jYWwgcHJvdG9jb2wgZW5kcG9pbnQnLCBkaXNwb3NlRXJyb3IpO1xuXHRcdH1cblx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdGNsZWFudXBMb2NhbEFnZW50SG9zdEVuZHBvaW50KHVzZXJEYXRhUGF0aCwgbWV0YWRhdGEsIGxvZ1NlcnZpY2UpO1xuXHRcdH1cblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gc3RhcnQgbG9jYWwgcHJvdG9jb2wgZW5kcG9pbnQ7IGNvbnRpbnVpbmcgd2l0aCBNZXNzYWdlUG9ydCBvbmx5JywgZXJyb3IpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY2xlYW51cExvY2FsQWdlbnRIb3N0RW5kcG9pbnQoXG5cdHVzZXJEYXRhUGF0aDogc3RyaW5nLFxuXHRtZXRhZGF0YTogSUxvY2FsQWdlbnRIb3N0RW5kcG9pbnRNZXRhZGF0YSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG4pOiB2b2lkIHtcblx0dHJ5IHtcblx0XHRjbGVhbnVwTG9jYWxBZ2VudEhvc3RFbmRwb2ludE1ldGFkYXRhU3luYyh1c2VyRGF0YVBhdGgsIG1ldGFkYXRhKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gY2xlYW4gdXAgbG9jYWwgcHJvdG9jb2wgbWV0YWRhdGEnLCBlcnJvcik7XG5cdH1cblx0dHJ5IHtcblx0XHRjbGVhbnVwTG9jYWxBZ2VudEhvc3RFbmRwb2ludFNvY2tldFN5bmMobWV0YWRhdGEuZW5kcG9pbnRQYXRoKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRsb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRIb3N0XSBGYWlsZWQgdG8gY2xlYW4gdXAgbG9jYWwgcHJvdG9jb2wgc29ja2V0JywgZXJyb3IpO1xuXHR9XG59XG5cbi8qKlxuICogV2hlbiB0aGUgcGFyZW50IHByb2Nlc3MgcGFzc2VzIFdlYlNvY2tldCBjb25maWd1cmF0aW9uIHZpYSBlbnZpcm9ubWVudFxuICogdmFyaWFibGVzLCBzdGFydCBhIHByb3RvY29sIHNlcnZlciB0aGF0IGV4dGVybmFsIGNsaWVudHMgY2FuIGNvbm5lY3QgdG8uXG4gKiBUaGlzIHJldXNlcyB0aGUgc2FtZSB7QGxpbmsgQWdlbnRTZXJ2aWNlfSBhbmQge0BsaW5rIEFnZW50SG9zdFN0YXRlTWFuYWdlcn1cbiAqIHRoYXQgdGhlIElQQyBjaGFubmVsIHVzZXMsIHNvIGJvdGggSVBDIGFuZCBXZWJTb2NrZXQgY2xpZW50cyBzaGFyZSBzdGF0ZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gc3RhcnRXZWJTb2NrZXRTZXJ2ZXIoXG5cdGFnZW50U2VydmljZTogQWdlbnRTZXJ2aWNlLFxuXHRjbGllbnRGaWxlU3lzdGVtUHJvdmlkZXI6IEFnZW50SG9zdENsaWVudEZpbGVTeXN0ZW1Qcm92aWRlcixcblx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0bG9nc0hvbWU6IFVSSSxcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdG90bHBMb2dFbWl0dGVyOiBPdGxwTG9nRW1pdHRlcixcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0b25Db25uZWN0aW9uQ291bnRDaGFuZ2VkOiAoY291bnQ6IG51bWJlcikgPT4gdm9pZCxcbik6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCBwb3J0ID0gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9BR0VOVF9IT1NUX1BPUlQnXTtcblx0Y29uc3Qgc29ja2V0UGF0aCA9IHByb2Nlc3MuZW52WydWU0NPREVfQUdFTlRfSE9TVF9TT0NLRVRfUEFUSCddO1xuXG5cdGlmICghcG9ydCAmJiAhc29ja2V0UGF0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGNvbnN0IGNvbm5lY3Rpb25Ub2tlbiA9IHByb2Nlc3MuZW52WydWU0NPREVfQUdFTlRfSE9TVF9DT05ORUNUSU9OX1RPS0VOJ107XG5cdGNvbnN0IGhvc3QgPSBwcm9jZXNzLmVudlsnVlNDT0RFX0FHRU5UX0hPU1RfSE9TVCddIHx8ICdsb2NhbGhvc3QnO1xuXG5cdGNvbnN0IHdzU2VydmVyID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFdlYlNvY2tldFByb3RvY29sU2VydmVyLmNyZWF0ZShcblx0XHRzb2NrZXRQYXRoXG5cdFx0XHQ/IHtcblx0XHRcdFx0c29ja2V0UGF0aCxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuVmFsaWRhdGU6IGNvbm5lY3Rpb25Ub2tlblxuXHRcdFx0XHRcdD8gKHRva2VuKSA9PiB0b2tlbiA9PT0gY29ubmVjdGlvblRva2VuXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHR9XG5cdFx0XHQ6IHtcblx0XHRcdFx0cG9ydDogcGFyc2VJbnQocG9ydCEsIDEwKSxcblx0XHRcdFx0aG9zdCxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuVmFsaWRhdGU6IGNvbm5lY3Rpb25Ub2tlblxuXHRcdFx0XHRcdD8gKHRva2VuKSA9PiB0b2tlbiA9PT0gY29ubmVjdGlvblRva2VuXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdGxvZ1NlcnZpY2UsXG5cdFx0eyBpbnN0YW50aWF0aW9uU2VydmljZSwgbG9nc0hvbWUgfSxcblx0KSk7XG5cblx0Y29uc3QgcHJvdG9jb2xIYW5kbGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQcm90b2NvbFNlcnZlckhhbmRsZXIoXG5cdFx0YWdlbnRTZXJ2aWNlLFxuXHRcdGFnZW50U2VydmljZS5zdGF0ZU1hbmFnZXIsXG5cdFx0d3NTZXJ2ZXIsXG5cdFx0e1xuXHRcdFx0ZGVmYXVsdERpcmVjdG9yeTogVVJJLmZpbGUob3MuaG9tZWRpcigpKS50b1N0cmluZygpLFxuXHRcdFx0Y29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzOiBhZ2VudFNlcnZpY2UuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzLFxuXHRcdFx0dGVybWluYWxDb21tYW5kUHJlZml4OiBCQU5HX0NPTU1BTkRfUFJFRklYLFxuXHRcdFx0b3RscExvZ0VtaXR0ZXIsXG5cdFx0fSxcblx0XHRjbGllbnRGaWxlU3lzdGVtUHJvdmlkZXIsXG5cdFx0bG9nU2VydmljZSxcblx0KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChwcm90b2NvbEhhbmRsZXIub25EaWRDaGFuZ2VDb25uZWN0aW9uQ291bnQob25Db25uZWN0aW9uQ291bnRDaGFuZ2VkKSk7XG5cblx0Ly8gV2FpdCBmb3IgdGhlIGxpc3RlbmVyIHRvIGFjdHVhbGx5IGJpbmQgYmVmb3JlIHJlcG9ydGluZyByZWFkaW5lc3MuXG5cdC8vIFdoZW4gdGhlIGNhbGxlciByZXF1ZXN0ZWQgYHBvcnQ6IDBgIChsZXQgdGhlIE9TIHBpY2spLCB0aGUgYm91bmRcblx0Ly8gcG9ydCBpcyBvbmx5IGtub3duIGFmdGVyIHRoaXMgcG9pbnQgXHUyMDE0IGVtaXR0aW5nIHRoZSByZXF1ZXN0ZWQgcG9ydFxuXHQvLyB3b3VsZCBwcmludCBgbG9jYWxob3N0OjBgIGFuZCBicmVhayB0aGUgQ0xJJ3MgcmVhZGluZXNzIHBhcnNlci5cblx0YXdhaXQgd3NTZXJ2ZXIud2hlbkxpc3RlbmluZztcblx0Y29uc3QgbGlzdGVuVGFyZ2V0ID0gc29ja2V0UGF0aCA/PyBgJHtob3N0fToke3dzU2VydmVyLmJvdW5kUG9ydCA/PyBwb3J0fWA7XG5cdGxvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gV2ViU29ja2V0IHNlcnZlciBsaXN0ZW5pbmcgb24gJHtsaXN0ZW5UYXJnZXR9YCk7XG5cdC8vIERvIG5vdCBjaGFuZ2UgdGhpcyBsaW5lLiBUaGUgQ0xJIGxvb2tzIGZvciB0aGlzIGluIHRoZSBvdXRwdXQuXG5cdGNvbnNvbGUubG9nKGBBZ2VudCBob3N0IHNlcnZlciBsaXN0ZW5pbmcgb24gJHtsaXN0ZW5UYXJnZXR9YCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLFVBQVUsMEJBQTBCO0FBQzdDLFNBQVMsVUFBVSw0QkFBNEI7QUFDL0MsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUEyQjtBQUNwQyxTQUFTLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQzlFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixZQUFZLFFBQVE7QUFDcEIsWUFBWSxlQUFlO0FBQzNCLFNBQVMsa0NBQWtDLG1DQUFtQyxrQ0FBa0Msc0JBQW1FLGVBQTBDLHNCQUFzQjtBQUNuUCxTQUFTLGdDQUFnQywwQkFBMEI7QUFDbkUsU0FBUyw0QkFBNEIsaUNBQWlDO0FBQ3RFLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsbUJBQW1CLDBCQUEwQjtBQUN0RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QixrQkFBa0IsOEJBQThCO0FBQ2hGLFNBQVMsb0JBQW9CLDJCQUEyQjtBQUN4RCxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsbUJBQW1CLDBCQUEwQjtBQUN0RCxTQUFTLG9CQUFvQiwyQkFBMkI7QUFDeEQsU0FBUyxzQkFBc0IsNkJBQTZCO0FBRTVELFNBQVMsNEJBQTRCLGlDQUFpQztBQUN0RSxTQUFTLG9CQUFvQiwyQkFBMkQ7QUFDeEYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQ0FBMkMseUNBQXlDLHNDQUFzQyxnREFBZ0QsOENBQThDLDZDQUFtRjtBQUNwVCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLFdBQVcsZUFBZTtBQUNuQyxTQUFTLGFBQWEsYUFBYSxrQ0FBa0Msc0NBQXNDO0FBQzNHLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFTLDZCQUE2QjtBQUN0QyxPQUFPLGFBQWE7QUFDcEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxlQUFlO0FBRXhCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DLHdDQUF3QztBQUNwRixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDhCQUE4QixtQ0FBbUM7QUFDMUUsU0FBUyx3QkFBd0IsK0JBQStCO0FBQ2hFLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUNBQW1DLDZDQUE2QztBQUN6RixTQUFTLGlDQUFpQyw0Q0FBNEM7QUFDdEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyw2QkFBNkIsb0NBQW9DO0FBQzFFLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsWUFBWTtBQUNyQixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHlCQUF5QjtBQUNsQyxPQUFPLG9CQUFvQjtBQU8zQixLQUFLLGVBQWUsRUFBRSxNQUFNLFNBQU87QUFDbEMsVUFBUSxNQUFNLEdBQUc7QUFDakIsVUFBUSxLQUFLLENBQUM7QUFDZixDQUFDO0FBRUQsZUFBZSxpQkFBZ0M7QUFFOUMsTUFBSTtBQUNKLE1BQUksaUJBQWlCLE9BQU8sR0FBRztBQUM5QixhQUFTLElBQUkscUJBQXFCO0FBQUEsRUFDbkMsT0FBTztBQUNOLGFBQVMsSUFBSSxtQkFBbUIscUJBQXFCLFNBQVM7QUFBQSxFQUMvRDtBQUVBLFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxRQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSSxrQkFBa0MsQ0FBQztBQUc5RSxRQUFNLGlCQUFrQyxFQUFFLGVBQWUsUUFBVyxHQUFHLFFBQVE7QUFDL0UsUUFBTSxxQkFBcUIsSUFBSSx5QkFBeUIsVUFBVSxRQUFRLE1BQU0sT0FBTyxHQUFHLGNBQWM7QUFDeEcsUUFBTSxnQkFBZ0IsSUFBSSxjQUFjLFlBQVksa0JBQWtCLEdBQUcsbUJBQW1CLFFBQVE7QUFFcEcsU0FBTyxnQkFBZ0IscUJBQXFCLFFBQVEsSUFBSSxjQUFjLGVBQWUsTUFBTSxxQkFBcUIsQ0FBQztBQUNqSCxRQUFNLFNBQVMsY0FBYyxhQUFhLGFBQWEsRUFBRSxNQUFNLFNBQVMsYUFBYSxZQUFZLEVBQUUsQ0FBQztBQU1wRyxRQUFNLGlCQUFpQixZQUFZLElBQUksSUFBSSxlQUFlLENBQUM7QUFDM0QsUUFBTSxhQUFhLFlBQVksSUFBSSxJQUFJLGtCQUFrQixjQUFjLENBQUM7QUFDeEUsUUFBTSxhQUFhLElBQUksV0FBVyxRQUFRLENBQUMsVUFBVSxDQUFDO0FBQ3RELE1BQUksQ0FBQyxtQkFBbUIsV0FBVyxrQ0FBa0M7QUFDcEUsZ0JBQVksSUFBSSwrQkFBK0IsVUFBVSxDQUFDO0FBQUEsRUFDM0Q7QUFDQSxhQUFXLEtBQUsseUNBQXlDO0FBR3pELFFBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxZQUFZLFVBQVUsQ0FBQztBQUMvRCxjQUFZLElBQUksWUFBWSxpQkFBaUIsUUFBUSxNQUFNLFlBQVksSUFBSSxJQUFJLHVCQUF1QixVQUFVLENBQUMsQ0FBQyxDQUFDO0FBR25ILGNBQVksSUFBSSxtQ0FBbUMsV0FBVyxDQUFDO0FBRy9ELFFBQU0scUJBQXFCLElBQUksbUJBQW1CLElBQUksS0FBSyxtQkFBbUIsWUFBWSxHQUFHLGFBQWEsVUFBVTtBQUNwSCxRQUFNLHFCQUFxQixTQUFTLG1CQUFtQixpQkFBaUIsaUJBQWlCLHdCQUF3QjtBQUdqSCxNQUFJO0FBQ0osTUFBSTtBQUdKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQU9KLFFBQU0sZ0JBQWdCLGVBQWUsUUFBUSxJQUFJLGdDQUFnQyxHQUFHLElBQUk7QUFDeEYsTUFBSTtBQUdILFVBQU0sYUFBYSxJQUFJLGtCQUFrQjtBQUN6QyxlQUFXLElBQUksMkJBQTJCLGtCQUFrQjtBQUM1RCxlQUFXLElBQUksYUFBYSxVQUFVO0FBQ3RDLGVBQVcsSUFBSSxjQUFjLFdBQVc7QUFDeEMsZUFBVyxJQUFJLHFCQUFxQixrQkFBa0I7QUFDdEQsZUFBVyxJQUFJLGlCQUFpQixjQUFjO0FBQzlDLFVBQU0sa0JBQWtCLE1BQU0saUNBQWlDLFlBQVksYUFBYSxvQkFBb0IsWUFBWSxXQUFXO0FBQ25JLG9CQUFnQixnQkFBZ0I7QUFDaEMsVUFBTSxVQUFVLGNBQWMsTUFBTSxLQUFLLGFBQWE7QUFDdEQsVUFBTSxtQkFBbUIsTUFBTSxnQ0FBZ0MsRUFBRSxvQkFBb0IsZ0JBQWdCLGFBQWEsZUFBZSxZQUFZLGFBQWEsU0FBUyxnQkFBZ0IsZ0JBQWdCLGVBQWUsQ0FBQztBQUNuTixtQkFBZSxRQUFRLElBQUksZUFBZSxnQkFBZ0I7QUFDMUQsZUFBVyxJQUFJLG1CQUFtQixnQkFBZ0I7QUFDbEQsMkJBQXVCLElBQUkscUJBQXFCLFVBQVU7QUFDMUQsVUFBTSxxQkFBcUIsWUFBWSxJQUFJLHFCQUFxQixlQUFlLDJCQUEyQixDQUFDO0FBQzNHLGVBQVcsSUFBSSw4QkFBOEIsa0JBQWtCO0FBQy9ELGVBQVcsSUFBSSxtQ0FBbUMscUJBQXFCLGVBQWUsZ0NBQWdDLENBQUM7QUFDdkgsZUFBVyxJQUFJLHVCQUF1QixJQUFJLHFCQUFxQixDQUFDO0FBQ2hFLFVBQU0sYUFBYSxxQkFBcUIsZUFBZSxtQkFBbUI7QUFDMUUsZUFBVyxJQUFJLHNCQUFzQixVQUFVO0FBSS9DLFVBQU0scUJBQXFCLFlBQVksSUFBSSxxQkFBcUIsZUFBZSxrQkFBa0IsQ0FBQztBQUNsRyxlQUFXLElBQUkscUJBQXFCLGtCQUFrQjtBQUN0RCwwQkFBc0IsbUJBQW1CO0FBQ3pDLFVBQU0sd0JBQXdCLHFCQUFxQixlQUFlLHFCQUFxQjtBQUN2RixlQUFXLElBQUksd0JBQXdCLHFCQUFxQjtBQU01RCwyQkFBdUIsSUFBSSxxQkFBcUI7QUFDaEQsZUFBVyxJQUFJLHVCQUF1QixvQkFBb0I7QUFDMUQsVUFBTSxxQkFBcUIsWUFBWSxJQUFJLHFCQUFxQixlQUFlLGtCQUFrQixDQUFDO0FBQ2xHLGVBQVcsSUFBSSxxQkFBcUIsa0JBQWtCO0FBQ3RELFVBQU0sdUJBQXVCLFlBQVksSUFBSSxxQkFBcUIsZUFBZSxzQkFBc0IsT0FBTyxDQUFDO0FBQy9HLGVBQVcsSUFBSSx1QkFBdUIsb0JBQW9CO0FBQzFELG1CQUFlLElBQUksYUFBYSxZQUFZLGFBQWEsb0JBQW9CLGdCQUFnQixZQUFZLG9CQUFvQixrQkFBa0Isb0JBQW9CLFFBQVcsU0FBUyxDQUFDLGlDQUFpQyxtQkFBbUIsUUFBUSxDQUFDLENBQUM7QUFDdFAsVUFBTSw0QkFBNEIscUJBQXFCLGVBQWUseUJBQXlCO0FBQy9GLGVBQVcsSUFBSSw0QkFBNEIseUJBQXlCO0FBQ3BFLGlCQUFhLDZCQUE2Qix5QkFBeUI7QUFDbkUsZUFBVyxJQUFJLGVBQWUsWUFBWTtBQUMxQyxlQUFXLElBQUksd0JBQXdCLGFBQWEsWUFBWTtBQUNoRSxVQUFNLGdCQUFnQixJQUFJLG1CQUFtQixJQUFJLEtBQUssbUJBQW1CLFlBQVksR0FBRyxhQUFhLFVBQVU7QUFDL0csZUFBVyxJQUFJLHFCQUFxQixhQUFhO0FBQ2pELFVBQU0scUJBQXFCLFlBQVksSUFBSSxJQUFJLDZCQUE2QixVQUFVLENBQUM7QUFDdkYsZUFBVyxJQUFJLHFCQUFxQixrQkFBa0I7QUFDdEQsVUFBTSx5QkFBeUIsWUFBWSxJQUFJLHFCQUFxQixlQUFlLDZCQUE2QixRQUFXLE1BQVMsQ0FBQztBQUNySSxlQUFXLElBQUksOEJBQThCLHNCQUFzQjtBQUNuRSxpQkFBYSwwQkFBMEIsc0JBQXNCO0FBQzdELGVBQVcsSUFBSSw4QkFBOEIscUJBQXFCLGVBQWUsMkJBQTJCLENBQUM7QUFFN0csZUFBVyxJQUFJLDJCQUEyQixhQUFhLGVBQWU7QUFDdEUsZUFBVyxJQUFJLDRCQUE0QixhQUFhLG9CQUFvQjtBQUM1RSxVQUFNLHlCQUF5QixZQUFZLElBQUkscUJBQXFCLGVBQWUsd0JBQXdCLE1BQVMsQ0FBQztBQUNySCxlQUFXLElBQUkseUJBQXlCLHNCQUFzQjtBQUM5RCxlQUFXLElBQUksaUNBQWlDLGFBQWEscUJBQXFCO0FBQ2xGLGVBQVcsSUFBSSx1QkFBdUIsYUFBYSxrQkFBa0I7QUFDckUsZUFBVyxJQUFJLDZCQUE2QixhQUFhLGlCQUFpQjtBQUsxRSxVQUFNLG9CQUFvQixxQkFBcUIsZUFBZSxtQkFBbUIsT0FBTztBQUN4RixlQUFXLElBQUksb0JBQW9CLGlCQUFpQjtBQUlwRCxpQkFBYSxxQkFBcUIsWUFBWSxJQUFJLHFCQUFxQixlQUFlLG1CQUFtQixNQUFTLENBQUMsQ0FBQztBQUNwSCxVQUFNLHFCQUFxQixZQUFZLElBQUkscUJBQXFCLGVBQWUsa0JBQWtCLENBQUM7QUFDbEcsZUFBVyxJQUFJLHFCQUFxQixrQkFBa0I7QUFDdEQsVUFBTSxvQkFBb0IsWUFBWSxJQUFJLHFCQUFxQixlQUFlLGlCQUFpQixDQUFDO0FBQ2hHLGVBQVcsSUFBSSxvQkFBb0IsaUJBQWlCO0FBQ3BELGlCQUFhLGlCQUFpQixxQkFBcUIsZUFBZSxZQUFZLENBQUM7QUFjL0UsUUFBSSxlQUFlLFFBQVEsSUFBSSxpQ0FBaUMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxtQkFBbUIsV0FBVyxtQkFBbUIsWUFBWSxnQkFBZ0IsSUFBSTtBQUM5SixtQkFBYSxpQkFBaUIscUJBQXFCLGVBQWUsV0FBVyxDQUFDO0FBQUEsSUFDL0U7QUFJQSxRQUFJLENBQUMsbUJBQW1CLFdBQVcsbUJBQW1CLFlBQVksZUFBZSxHQUFHO0FBQ25GLFlBQU0sNEJBQTRCLGFBQWE7QUFDL0MsVUFBSSxrQkFBa0I7QUFDdEIsWUFBTSx5QkFBeUIsTUFBTTtBQUNwQyxZQUFJLGlCQUFpQjtBQUNwQjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLGVBQWUsZUFBZSxRQUFRLElBQUksZ0NBQWdDLEdBQUcsS0FBSztBQUN4RixjQUFNLHNCQUFzQiwwQkFBMEIsYUFBYSxvQkFBb0IsOEJBQThCLE1BQU07QUFDM0gsWUFBSSxnQkFBZ0IscUJBQXFCO0FBQ3hDLDRCQUFrQjtBQUNsQix1QkFBYSxpQkFBaUIscUJBQXFCLGVBQWUsVUFBVSxDQUFDO0FBQUEsUUFDOUU7QUFBQSxNQUNEO0FBQ0EsNkJBQXVCO0FBQ3ZCLGtCQUFZLElBQUksMEJBQTBCLHNCQUFzQixNQUFNLHVCQUF1QixDQUFDLENBQUM7QUFBQSxJQUNoRztBQUFBLEVBQ0QsU0FBUyxLQUFLO0FBQ2IsZUFBVyxNQUFNLGlDQUFpQyxHQUFHO0FBQ3JELFVBQU07QUFBQSxFQUNQO0FBU0EsY0FBWSxJQUFJLHFCQUFxQixlQUFlLDRCQUE0QixhQUFhLFFBQVEseUJBQXlCLENBQUM7QUFRL0gsTUFBSSxxQkFBcUI7QUFDeEIsZ0JBQVksSUFBSSxvQkFBb0IsT0FBSyxhQUFhO0FBQUEsTUFDckQsRUFBRTtBQUFBLE1BQ0YsRUFBRTtBQUFBLE1BQ0YsRUFBRTtBQUFBLE1BQ0YsRUFBRTtBQUFBLE1BQ0YsRUFBRSxVQUFVLGVBQWUsRUFBRSxVQUFVO0FBQUEsSUFDeEMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUlBLE1BQUksRUFBRSxrQkFBa0IsdUJBQXVCO0FBQzlDLFVBQU0sZUFBZSxhQUFhLFlBQVksY0FBYyxXQUFXO0FBQ3ZFLFdBQU8sZ0JBQWdCLHFCQUFxQixXQUFXLFlBQVk7QUFBQSxFQUNwRTtBQUtBLFFBQU0sMkJBQTJCLFlBQVksSUFBSSxJQUFJLGtDQUFrQyxDQUFDO0FBQ3hGLGNBQVksSUFBSSxZQUFZLGlCQUFpQixxQkFBcUIsd0JBQXdCLENBQUM7QUFFM0YsTUFBSSxrQkFBa0Isc0JBQXNCO0FBQzNDLFVBQU0sNEJBQTRCLFlBQVksSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBQ3ZFLFVBQU0sNEJBQTRCLElBQUksMEJBQWtDO0FBQ3hFLFVBQU0sZ0JBQWdCLE1BQU07QUFBQSxNQUMzQixtQkFBbUI7QUFBQSxNQUNuQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLG1CQUFtQjtBQUFBLElBQ3BCO0FBQ0EsUUFBSTtBQUNILFlBQU0sc0JBQXNCLDBCQUEwQixJQUFJLElBQUksd0JBQXdCO0FBQUEsUUFDckY7QUFBQSxRQUNBLEdBQUksZ0JBQWdCLENBQUMsY0FBYyxNQUFNLElBQUksQ0FBQztBQUFBLE1BQy9DLENBQUMsQ0FBQztBQUNGLGdDQUEwQixJQUFJLElBQUk7QUFBQSxRQUNqQztBQUFBLFFBQ0EsYUFBYTtBQUFBLFFBQ2I7QUFBQSxRQUNBO0FBQUEsVUFDQyxrQkFBa0IsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUztBQUFBLFVBQ2xELDZCQUE2QixhQUFhO0FBQUEsVUFDMUMsdUJBQXVCO0FBQUEsVUFDdkI7QUFBQSxVQUNBLHVCQUF1QjtBQUFBLFFBQ3hCO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFHRCxZQUFNLHlCQUF5QixvQkFBSSxJQUEwQjtBQUM3RCxZQUFNLHFCQUFxQixDQUFDLGVBQW9EO0FBQy9FLFlBQUksdUJBQXVCLElBQUksVUFBVSxHQUFHO0FBQzNDO0FBQUEsUUFDRDtBQUNBLGNBQU0sV0FBVyxXQUFXO0FBQzVCLFlBQUksT0FBTyxhQUFhLFlBQVksQ0FBQyxVQUFVO0FBQzlDO0FBQUEsUUFDRDtBQUNBLGNBQU0sa0JBQWtCLElBQUksZ0JBQWdCO0FBQzVDLGNBQU0sYUFBYSxDQUFDLGdCQUF3QixPQUFPLFdBQVcsYUFBYSxPQUFLLEVBQUUsUUFBUSxRQUFRO0FBQ2xHLGNBQU0sa0JBQWtCLHFDQUFxQyxXQUFXLCtCQUErQixDQUFDO0FBQ3hHLHdCQUFnQixJQUFJLGNBQWMsU0FBUyxVQUFVLGVBQWUsQ0FBQztBQUlyRSxZQUFJLGlCQUFpQixzQkFBc0I7QUFDMUMsZ0JBQU0sbUJBQW1CLHNDQUFzQyxXQUFXLGlDQUFpQyxDQUFDO0FBQzVHLDBCQUFnQixJQUFJLHFCQUFxQixTQUFTLFVBQVUsZ0JBQWdCLENBQUM7QUFBQSxRQUM5RTtBQUNBLCtCQUF1QixJQUFJLFlBQVksZUFBZTtBQUFBLE1BQ3ZEO0FBQ0EsZ0NBQTBCLElBQUksT0FBTyxtQkFBbUIsa0JBQWtCLENBQUM7QUFDM0UsZ0NBQTBCLElBQUksT0FBTyxzQkFBc0IsZ0JBQWM7QUFDeEUsWUFBSSxPQUFPLFdBQVcsUUFBUSxVQUFVO0FBQ3ZDLG9DQUEwQixZQUFZLFdBQVcsR0FBRztBQUFBLFFBQ3JEO0FBQ0EsY0FBTSxNQUFNLHVCQUF1QixJQUFJLFVBQVU7QUFDakQsWUFBSSxLQUFLO0FBQ1IsY0FBSSxRQUFRO0FBQ1osaUNBQXVCLE9BQU8sVUFBVTtBQUFBLFFBQ3pDO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDRixnQ0FBMEIsSUFBSSxhQUFhLE1BQU07QUFDaEQsbUJBQVcsZ0JBQWdCLHVCQUF1QixPQUFPLEdBQUc7QUFDM0QsdUJBQWEsUUFBUTtBQUFBLFFBQ3RCO0FBQ0EsK0JBQXVCLE1BQU07QUFBQSxNQUM5QixDQUFDLENBQUM7QUFDRixpQkFBVyxjQUFjLE9BQU8sYUFBYTtBQUM1QywyQkFBbUIsVUFBVTtBQUFBLE1BQzlCO0FBRUEsYUFBTyxnQkFBZ0IscUJBQXFCLFVBQVUseUJBQXlCO0FBQy9FLFVBQUksZUFBZTtBQUNsQixZQUFJO0FBQ0gsZ0JBQU0sc0NBQXNDLG1CQUFtQixjQUFjLGNBQWMsUUFBUTtBQUNuRyxvQ0FBMEIsSUFBSSxhQUFhLE1BQU07QUFDaEQsMENBQThCLG1CQUFtQixjQUFjLGNBQWMsVUFBVSxVQUFVO0FBQUEsVUFDbEcsQ0FBQyxDQUFDO0FBQUEsUUFDSCxTQUFTLE9BQU87QUFDZixxQkFBVyxNQUFNLDJGQUEyRixLQUFLO0FBQ2pILHdCQUFjLE9BQU8sUUFBUTtBQUM3Qix3Q0FBOEIsbUJBQW1CLGNBQWMsY0FBYyxVQUFVLFVBQVU7QUFBQSxRQUNsRztBQUFBLE1BQ0Q7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLGdDQUEwQixRQUFRO0FBQ2xDLFVBQUksZUFBZTtBQUNsQixzQ0FBOEIsbUJBQW1CLGNBQWMsY0FBYyxVQUFVLFVBQVU7QUFBQSxNQUNsRztBQUNBLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUlBLFFBQU0seUJBQXlCLFlBQVksSUFBSSxJQUFJLFFBQWdCLENBQUM7QUFDcEUsTUFBSTtBQUNKLFFBQU0sMkJBQXNEO0FBQUEsSUFDM0QsNEJBQTRCLHVCQUF1QjtBQUFBLElBQ25ELE1BQU0sdUJBQXNEO0FBQzNELFVBQUksbUJBQW1CO0FBQ3RCLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxhQUFhLFlBQ2hCLGtDQUFrQyxhQUFhLEVBQUUsUUFBUSxNQUFNLEVBQUUsQ0FBQyxLQUNsRSxLQUFLLEdBQUcsT0FBTyxHQUFHLHFCQUFxQixhQUFhLEVBQUUsUUFBUSxNQUFNLEVBQUUsQ0FBQyxPQUFPO0FBRWpGLFlBQU0sV0FBVyxZQUFZLElBQUksTUFBTSx3QkFBd0I7QUFBQSxRQUM5RCxFQUFFLFdBQVc7QUFBQSxRQUNiO0FBQUEsUUFDQSxFQUFFLHNCQUFzQixVQUFVLG1CQUFtQixTQUFTO0FBQUEsTUFDL0QsQ0FBQztBQUVELFlBQU0sa0JBQWtCLFlBQVksSUFBSSxJQUFJO0FBQUEsUUFDM0M7QUFBQSxRQUNBLGFBQWE7QUFBQSxRQUNiO0FBQUEsUUFDQTtBQUFBLFVBQ0Msa0JBQWtCLElBQUksS0FBSyxHQUFHLFFBQVEsQ0FBQyxFQUFFLFNBQVM7QUFBQSxVQUNsRCw2QkFBNkIsYUFBYTtBQUFBLFVBQzFDLHVCQUF1QjtBQUFBLFVBQ3ZCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQ0Qsa0JBQVksSUFBSSxnQkFBZ0IsMkJBQTJCLFdBQVMsdUJBQXVCLEtBQUssS0FBSyxDQUFDLENBQUM7QUFFdkcsaUJBQVcsS0FBSyxxREFBcUQsVUFBVSxFQUFFO0FBQ2pGLDBCQUFvQixFQUFFLFdBQVc7QUFDakMsYUFBTztBQUFBLElBQ1I7QUFBQSxJQUNBLE1BQU0sZUFBZSxXQUFnRTtBQUNwRixVQUFJLE1BQU0sVUFBVSxJQUFJO0FBQ3hCLFVBQUksQ0FBQyxPQUFPLFdBQVc7QUFDdEIsWUFBSTtBQUNILG9CQUFVLEtBQUssR0FBRyxhQUFhLEtBQUs7QUFBQSxRQUNyQyxTQUFTLEtBQUs7QUFDYixxQkFBVyxNQUFNLHdDQUF3QyxHQUFHO0FBQzVELGlCQUFPO0FBQUEsUUFDUjtBQUNBLGNBQU0sVUFBVSxJQUFJO0FBQUEsTUFDckI7QUFDQSxVQUFJLENBQUMsS0FBSztBQUNULGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSTtBQUNILGNBQU0sWUFBWSxJQUFJLElBQUksR0FBRztBQUM3QixZQUFJLFVBQVUsYUFBYSxPQUFPO0FBQ2pDLHFCQUFXLEtBQUsseUNBQXlDLEdBQUcsRUFBRTtBQUM5RCxpQkFBTztBQUFBLFFBQ1I7QUFFQSxjQUFNLE9BQU8sT0FBTyxVQUFVLElBQUk7QUFDbEMsY0FBTSxPQUFPLFVBQVUsU0FBUyxRQUFRLFFBQVEsRUFBRTtBQUNsRCxZQUFJLENBQUMsT0FBTyxVQUFVLElBQUksS0FBSyxDQUFDLE1BQU07QUFDckMscUJBQVcsS0FBSyx5Q0FBeUMsR0FBRyxFQUFFO0FBQzlELGlCQUFPO0FBQUEsUUFDUjtBQUVBLGNBQU0sT0FBTyxVQUFVLGFBQWEsWUFDakMsY0FDQSxVQUFVLGFBQWEsT0FDdEIsUUFDQSxVQUFVO0FBQ2QsY0FBTSxlQUFlLEtBQUssU0FBUyxHQUFHLElBQUksSUFBSSxJQUFJLE1BQU07QUFFeEQsZUFBTztBQUFBLFVBQ047QUFBQSxVQUNBO0FBQUEsVUFDQSxhQUFhLDBEQUEwRCxZQUFZLElBQUksVUFBVSxJQUFJLElBQUksSUFBSTtBQUFBLFFBQzlHO0FBQUEsTUFDRCxRQUFRO0FBQ1AsbUJBQVcsS0FBSyx5Q0FBeUMsR0FBRyxFQUFFO0FBQzlELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDQSxNQUFJLGtCQUFrQixzQkFBc0I7QUFDM0MsV0FBTyxnQkFBZ0IscUJBQXFCLFlBQVksYUFBYSxZQUFZLElBQUksMkJBQTJCLGNBQWMsd0JBQXdCLEdBQUcsV0FBVyxDQUFDO0FBQUEsRUFDdEssT0FBTztBQUNOLFdBQU8sZ0JBQWdCLHFCQUFxQixtQkFBbUIsYUFBYSxZQUFZLDBCQUEwQixXQUFXLENBQUM7QUFBQSxFQUMvSDtBQUlBO0FBQUEsSUFDQztBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxtQkFBbUI7QUFBQSxJQUNuQjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQSxXQUFTLHVCQUF1QixLQUFLLEtBQUs7QUFBQSxFQUMzQyxFQUFFLE1BQU0sU0FBTztBQUNkLGVBQVcsTUFBTSxvQ0FBb0MsR0FBRztBQUFBLEVBQ3pELENBQUM7QUFFRCxVQUFRLEtBQUssUUFBUSxNQUFNO0FBQzFCLGlCQUFhLFFBQVE7QUFDckIsZUFBVyxRQUFRO0FBQ25CLGdCQUFZLFFBQVE7QUFBQSxFQUNyQixDQUFDO0FBQ0Y7QUFPQSxlQUFlLDRCQUNkLGNBQ0EsWUFDQSxzQkFDQSxVQUMrQztBQUMvQyxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSCxVQUFNLG1CQUFtQixxQ0FBcUMsWUFBWTtBQUMxRSxlQUFXO0FBQ1gsVUFBTSwrQ0FBK0MsWUFBWTtBQUNqRSxRQUFJLENBQUMsV0FBVztBQUNmLFlBQU0sNkNBQTZDLFlBQVk7QUFBQSxJQUNoRTtBQUNBLGFBQVMsTUFBTSx3QkFBd0I7QUFBQSxNQUN0QztBQUFBLFFBQ0MsWUFBWSxpQkFBaUI7QUFBQSxRQUM3Qix5QkFBeUIsV0FBUyxVQUFVLGlCQUFpQjtBQUFBLE1BQzlEO0FBQUEsTUFDQTtBQUFBLE1BQ0EsRUFBRSxzQkFBc0IsU0FBUztBQUFBLElBQ2xDO0FBQ0EsVUFBTSxPQUFPO0FBQ2IsV0FBTyxFQUFFLFVBQVUsa0JBQWtCLE9BQU87QUFBQSxFQUM3QyxTQUFTLE9BQU87QUFDZixRQUFJO0FBQ0gsY0FBUSxRQUFRO0FBQUEsSUFDakIsU0FBUyxjQUFjO0FBQ3RCLGlCQUFXLE1BQU0seURBQXlELFlBQVk7QUFBQSxJQUN2RjtBQUNBLFFBQUksVUFBVTtBQUNiLG9DQUE4QixjQUFjLFVBQVUsVUFBVTtBQUFBLElBQ2pFO0FBQ0EsZUFBVyxNQUFNLHlGQUF5RixLQUFLO0FBQy9HLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFQSxTQUFTLDhCQUNSLGNBQ0EsVUFDQSxZQUNPO0FBQ1AsTUFBSTtBQUNILDhDQUEwQyxjQUFjLFFBQVE7QUFBQSxFQUNqRSxTQUFTLE9BQU87QUFDZixlQUFXLE1BQU0sMERBQTBELEtBQUs7QUFBQSxFQUNqRjtBQUNBLE1BQUk7QUFDSCw0Q0FBd0MsU0FBUyxZQUFZO0FBQUEsRUFDOUQsU0FBUyxPQUFPO0FBQ2YsZUFBVyxNQUFNLHdEQUF3RCxLQUFLO0FBQUEsRUFDL0U7QUFDRDtBQVFBLGVBQWUscUJBQ2QsY0FDQSwwQkFDQSxzQkFDQSxVQUNBLFlBQ0EsZ0JBQ0EsYUFDQSwwQkFDZ0I7QUFDaEIsUUFBTSxPQUFPLFFBQVEsSUFBSSx3QkFBd0I7QUFDakQsUUFBTSxhQUFhLFFBQVEsSUFBSSwrQkFBK0I7QUFFOUQsTUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZO0FBQ3pCO0FBQUEsRUFDRDtBQUVBLFFBQU0sa0JBQWtCLFFBQVEsSUFBSSxvQ0FBb0M7QUFDeEUsUUFBTSxPQUFPLFFBQVEsSUFBSSx3QkFBd0IsS0FBSztBQUV0RCxRQUFNLFdBQVcsWUFBWSxJQUFJLE1BQU0sd0JBQXdCO0FBQUEsSUFDOUQsYUFDRztBQUFBLE1BQ0Q7QUFBQSxNQUNBLHlCQUF5QixrQkFDdEIsQ0FBQyxVQUFVLFVBQVUsa0JBQ3JCO0FBQUEsSUFDSixJQUNFO0FBQUEsTUFDRCxNQUFNLFNBQVMsTUFBTyxFQUFFO0FBQUEsTUFDeEI7QUFBQSxNQUNBLHlCQUF5QixrQkFDdEIsQ0FBQyxVQUFVLFVBQVUsa0JBQ3JCO0FBQUEsSUFDSjtBQUFBLElBQ0Q7QUFBQSxJQUNBLEVBQUUsc0JBQXNCLFNBQVM7QUFBQSxFQUNsQyxDQUFDO0FBRUQsUUFBTSxrQkFBa0IsWUFBWSxJQUFJLElBQUk7QUFBQSxJQUMzQztBQUFBLElBQ0EsYUFBYTtBQUFBLElBQ2I7QUFBQSxJQUNBO0FBQUEsTUFDQyxrQkFBa0IsSUFBSSxLQUFLLEdBQUcsUUFBUSxDQUFDLEVBQUUsU0FBUztBQUFBLE1BQ2xELDZCQUE2QixhQUFhO0FBQUEsTUFDMUMsdUJBQXVCO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNELENBQUM7QUFDRCxjQUFZLElBQUksZ0JBQWdCLDJCQUEyQix3QkFBd0IsQ0FBQztBQU1wRixRQUFNLFNBQVM7QUFDZixRQUFNLGVBQWUsY0FBYyxHQUFHLElBQUksSUFBSSxTQUFTLGFBQWEsSUFBSTtBQUN4RSxhQUFXLEtBQUssNkNBQTZDLFlBQVksRUFBRTtBQUUzRSxVQUFRLElBQUksa0NBQWtDLFlBQVksRUFBRTtBQUM3RDsiLAogICJuYW1lcyI6IFtdCn0K
